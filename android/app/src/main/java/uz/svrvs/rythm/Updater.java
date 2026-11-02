// Java, Updater.java, Android 8+: downloads a release, verifies SHA-256, installs through PackageInstaller.
package uz.svrvs.rythm;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

final class Updater {
    static void start(Context ctx, String url, String expected) {
        new Thread(() -> {
            PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
            int id = -1;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                long total = c.getContentLengthLong();
                id = pi.createSession(new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL));
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    MessageDigest md = MessageDigest.getInstance("SHA-256");
                    try (InputStream in = c.getInputStream(); OutputStream out = s.openWrite("app.apk", 0, total)) {
                        byte[] buf = new byte[64 * 1024];
                        long done = 0; int n, last = -1;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n); md.update(buf, 0, n); done += n;
                            int pct = total > 0 ? (int) (done * 100 / total) : 0;
                            if (pct != last) { last = pct; MainActivity.js("window.__updateProgress && window.__updateProgress(" + pct + ")"); }
                        }
                        s.fsync(out);
                    }
                    StringBuilder hex = new StringBuilder();
                    for (byte b : md.digest()) hex.append(String.format("%02x", b));
                    if (!hex.toString().equals(expected)) throw new SecurityException("hash");
                    PendingIntent done = PendingIntent.getBroadcast(ctx, id, new Intent(ctx, InstallReceiver.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                    s.commit(done.getIntentSender());
                }
            } catch (Exception e) {
                if (id != -1) try { pi.abandonSession(id); } catch (Exception ignored) { }
                MainActivity.js("window.__updateError && window.__updateError('Yangilanishni yuklab bo\\'lmadi')");
            }
        }).start();
    }
}
