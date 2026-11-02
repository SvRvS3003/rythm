// Java, PlaybackService.java, Android 8+: foreground service and media controls that keep WebView audio alive.
package uz.svrvs.rythm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import java.io.InputStream;
import java.net.URL;

public class PlaybackService extends Service {
    static volatile boolean running;
    private static final String CHANNEL = "playback";
    private MediaSession session;
    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;
    private String title = "", artist = "", coverUrl = "";
    private boolean playing;
    private Bitmap art;

    @Override public void onCreate() {
        super.onCreate();
        running = true;
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL, "Ijro", NotificationManager.IMPORTANCE_LOW));
        session = new MediaSession(this, "rythm");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { cmd("play"); }
            @Override public void onPause() { cmd("pause"); }
            @Override public void onSkipToNext() { cmd("next"); }
            @Override public void onSkipToPrevious() { cmd("prev"); }
        });
        session.setActive(true);
        wake = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rythm:playback");
        wake.setReferenceCounted(false);
        wifi = ((WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "rythm:stream");
        wifi.setReferenceCounted(false);
    }
    private static void cmd(String c) { MainActivity.js("window.__nativeCmd && window.__nativeCmd('" + c + "')"); }

    @Override public int onStartCommand(Intent i, int flags, int id) {
        if (i != null && i.getAction() != null) { cmd(i.getAction()); post(); return START_NOT_STICKY; }
        if (i != null) {
            title = i.getStringExtra("title"); artist = i.getStringExtra("artist"); playing = i.getBooleanExtra("playing", false);
            String c = i.getStringExtra("cover");
            if (c != null && !c.equals(coverUrl)) { coverUrl = c; art = null; loadArt(c); }
        }
        post();
        // Locks follow the audio so a paused player cannot drain the battery.
        if (playing) { wake.acquire(4 * 3600 * 1000L); wifi.acquire(); }
        else { if (wake.isHeld()) wake.release(); if (wifi.isHeld()) wifi.release(); }
        return START_NOT_STICKY;
    }
    private void loadArt(String url) {
        if (url.isEmpty()) return;
        new Thread(() -> {
            try (InputStream in = new URL(url).openStream()) {
                Bitmap b = BitmapFactory.decodeStream(in);
                if (url.equals(coverUrl) && b != null) { art = Bitmap.createScaledBitmap(b, 256, 256, true); post(); }
            } catch (Exception ignored) { }
        }).start();
    }
    private Notification.Action action(int icon, String label, String act) {
        PendingIntent pi = PendingIntent.getService(this, act.hashCode(), new Intent(this, PlaybackService.class).setAction(act), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), label, pi).build();
    }
    private synchronized void post() {
        session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title).putString(MediaMetadata.METADATA_KEY_ARTIST, artist).putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art).build());
        session.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS).setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f).build());
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(title).setContentText(artist).setLargeIcon(art).setContentIntent(open).setOngoing(true).setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(action(android.R.drawable.ic_media_previous, "Oldingi", "prev"))
            .addAction(playing ? action(android.R.drawable.ic_media_pause, "Pauza", "pause") : action(android.R.drawable.ic_media_play, "Ijro", "play"))
            .addAction(action(android.R.drawable.ic_media_next, "Keyingi", "next"))
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2)).build();
        // Stays foreground across pauses and track changes: re-entering foreground from the background is forbidden on Android 12+.
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(7, n);
        } catch (Exception e) { getSystemService(NotificationManager.class).notify(7, n); }
    }
    @Override public void onDestroy() {
        running = false;
        if (wake.isHeld()) wake.release();
        if (wifi.isHeld()) wifi.release();
        session.release();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent i) { return null; }
}
