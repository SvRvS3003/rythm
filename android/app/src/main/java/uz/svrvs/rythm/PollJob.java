package uz.svrvs.rythm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

public class PollJob extends JobService {
    private static final int JOB_ID = 1;

    static String token(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences("rythm", MODE_PRIVATE);
        String t = p.getString("push_token", null);
        if (t == null) {
            byte[] b = new byte[24];
            new SecureRandom().nextBytes(b);
            StringBuilder s = new StringBuilder();
            for (byte x : b) s.append(String.format("%02x", x));
            t = s.toString();
            p.edit().putString("push_token", t).apply();
        }
        return t;
    }
    static void schedule(Context ctx) {
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, PollJob.class))
            .setPeriodic(15 * 60 * 1000L).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).build();
        ctx.getSystemService(JobScheduler.class).schedule(job);
    }
    @Override public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            boolean retry = false;
            try { check(); } catch (Exception e) { retry = true; }
            jobFinished(params, retry);
        }).start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) { return true; }

    private void check() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(BuildConfig.BASE_URL + "/api/notices/next").openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestProperty("content-type", "application/json");
        try (OutputStream o = c.getOutputStream()) { o.write(new JSONObject().put("endpoint", token(this)).toString().getBytes(StandardCharsets.UTF_8)); }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream in = c.getInputStream()) { byte[] b = new byte[4096]; int n; while ((n = in.read(b)) > 0) out.write(b, 0, n); }
        JSONObject n = new JSONObject(out.toString("UTF-8")).optJSONObject("notice");
        if (n != null) show(n.optString("title"), n.optString("body"));
    }
    private void show(String title, String body) {
        NotificationManager m = getSystemService(NotificationManager.class);
        m.createNotificationChannel(new NotificationChannel("news", "Yangiliklar", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open = PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE);
        m.notify(8, new Notification.Builder(this, "news").setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle(title).setContentText(body).setContentIntent(open).setAutoCancel(true).build());
    }
}
