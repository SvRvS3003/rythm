// Java, MainActivity.java, Android 8+: hosts the web app and exposes the small native bridge.
package uz.svrvs.rythm;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;
import java.lang.ref.WeakReference;

public class MainActivity extends Activity {
    private static WeakReference<MainActivity> current = new WeakReference<>(null);
    private static final int PICK_FILE = 41;
    private WebView web;
    private ValueCallback<Uri[]> pendingFiles;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = new WeakReference<>(this);
        web = new WebView(this);
        web.setBackgroundColor(0xff0b0a0d);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " SvRvSRythmApp/" + BuildConfig.VERSION_NAME);
        // Keeps the renderer, and so the audio element and its queue logic, alive off-screen.
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "RythmNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri base = Uri.parse(BuildConfig.BASE_URL), u = r.getUrl();
                // The bridge must only ever face our own origin; everything else goes to the browser.
                if (base.getAuthority().equals(u.getAuthority())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame()) return;
                String html = "<body style='background:#0b0a0d;color:#f6f3f7;font:16px sans-serif;display:grid;place-items:center;height:90vh;text-align:center'><div><h2>Internet yo'q</h2><p>Aloqani tekshiring.</p><button style='padding:14px 28px;border-radius:99px;border:0;font-size:16px' onclick=\"location.replace('" + BuildConfig.BASE_URL + "/')\">Qayta urinish</button></div>";
                v.loadDataWithBaseURL(BuildConfig.BASE_URL + "/", html, "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = cb;
                try { startActivityForResult(p.createIntent().setType("*/*"), PICK_FILE); } catch (Exception e) { pendingFiles = null; return false; }
                return true;
            }
        });
        web.setDownloadListener((url, ua, cd, mime, len) -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        PollJob.schedule(this);
        if (state != null) web.restoreState(state);
        else web.loadUrl(BuildConfig.BASE_URL + "/");
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        if (code == PICK_FILE && pendingFiles != null) {
            pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingFiles = null;
        }
    }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    // web.onPause()/pauseTimers() are deliberately not called: they would stop background playback.
    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else moveTaskToBack(true); }
    @Override protected void onDestroy() {
        stopService(new Intent(this, PlaybackService.class));
        web.destroy();
        super.onDestroy();
    }

    static void js(String code) {
        MainActivity a = current.get();
        if (a != null) a.runOnUiThread(() -> { if (!a.isDestroyed()) a.web.evaluateJavascript(code, null); });
    }

    final class Bridge {
        @JavascriptInterface public int versionCode() { return BuildConfig.VERSION_CODE; }
        @JavascriptInterface public String pushToken() { return PollJob.token(MainActivity.this); }

        @JavascriptInterface public void updateMedia(String json) {
            try {
                JSONObject o = new JSONObject(json);
                Intent i = new Intent(MainActivity.this, PlaybackService.class)
                    .putExtra("title", o.optString("title")).putExtra("artist", o.optString("artist"))
                    .putExtra("cover", o.optString("cover")).putExtra("playing", o.optBoolean("playing"));
                if (o.optString("title").isEmpty()) { stopService(i); return; }
                if (o.optBoolean("playing") || PlaybackService.running) startForegroundService(i);
            } catch (Exception ignored) { }
        }

        @JavascriptInterface public void installUpdate(String url, String sha256) {
            if (!url.startsWith(BuildConfig.BASE_URL + "/media/apk/") || !sha256.matches("[0-9a-f]{64}")) return;
            if (!getPackageManager().canRequestPackageInstalls()) {
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "Ruxsat bering va qayta \"Yangilash\" ni bosing", Toast.LENGTH_LONG).show();
                    startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
                });
                js("window.__updateError && window.__updateError('Ilovaga o\\'rnatish ruxsatini bering')");
                return;
            }
            Updater.start(MainActivity.this, url, sha256);
        }
    }
}
