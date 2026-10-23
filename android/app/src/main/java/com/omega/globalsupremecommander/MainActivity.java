package com.omega.globalsupremecommander;

import android.app.Activity;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.webkit.WebViewClient;
import android.webkit.RenderProcessGoneDetail;

import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String APP_URL =
            "https://appassets.androidplatform.net/assets/index.html";
    private volatile WebView webView;
    private WebViewAssetLoader assetLoader;
    private volatile boolean mainFrameLoaded = false;

    boolean hasMainFrameLoaded() {
        return mainFrameLoaded;
    }

    // Package-private access for instrumentation avoids blocking the UI thread just
    // to discover the WebView while the offline JavaScript bundle is booting.
    WebView webViewForTest() {
        return webView;
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(webView);

        configureWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(APP_URL);
        }
    }

    private void configureWebView() {
        final WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(
                settings.getUserAgentString() + " OMEGA_ANDROID_OFFLINE"
        );

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.addJavascriptInterface(new OmegaAndroidBridge(), "OmegaAndroid");
        if (BuildConfig.DEBUG) {
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage message) {
                    final String text = message.message();
                    if (text.startsWith("[OMEGA_BOOT_") ||
                            message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                        android.util.Log.e(
                                "OMEGA_WEB_DIAGNOSTICS",
                                text + " (" + message.sourceId() + ":" + message.lineNumber() + ")"
                        );
                    }
                    return true;
                }

                @Override
                public void onProgressChanged(WebView view, int newProgress) {
                    if (newProgress == 100) {
                        android.util.Log.d("OMEGA_WEB_DIAGNOSTICS", "PAGE_LOAD_PROGRESS=100");
                    }
                }
            });
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                final Uri uri = request.getUrl();
                final WebResourceResponse local = assetLoader.shouldInterceptRequest(uri);
                if (local != null) {
                    return local;
                }

                if (uri == null) return super.shouldInterceptRequest(view, request);

                // Android gameplay is an APK-bundled offline app. Never let a cross-origin
                // script, tile, font, image, or API request escape to the device network.
                // This makes offline behaviour deterministic instead of relying on a
                // best-effort host deny-list that can miss newly introduced CDNs.
                if (isAppAssetUri(uri)) return missingAssetResponse(uri);
                return offlineResponse(uri);
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view, WebResourceRequest request) {
                final Uri uri = request.getUrl();
                if (uri == null) return true;
                return !uri.toString().startsWith("https://appassets.androidplatform.net/");
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (view == webView) mainFrameLoaded = false;
                view.evaluateJavascript(
                        "window.OMEGA_ANDROID_APP=true;window.OMEGA_ANDROID_OFFLINE=true;",
                        null
                );
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (view == webView) mainFrameLoaded = true;
                if (BuildConfig.DEBUG) {
                    android.util.Log.d("OMEGA_WEB_DIAGNOSTICS", "MAIN_FRAME_FINISHED=" + url);
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view == webView) {
                    view.destroy();
                    webView = new WebView(MainActivity.this);
                    setContentView(webView);
                    configureWebView();
                    webView.loadUrl(APP_URL);
                    return true;
                }
                return true;
            }
        });
    }

    private boolean isAppAssetUri(Uri uri) {
        return uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())
                && uri.getPath() != null
                && uri.getPath().startsWith("/assets/");
    }

    private WebResourceResponse missingAssetResponse(Uri uri) {
        final byte[] body = ("OMEGA offline asset not found: " +
                (uri == null ? "" : uri.getPath())).getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                404,
                "Not Found",
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(body)
        );
    }

    private WebResourceResponse offlineResponse(Uri uri) {
        final String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase(Locale.ROOT);
        final String mime;
        final String encoding = "UTF-8";

        if (path.endsWith(".js") || uri.getHost().equalsIgnoreCase("unpkg.com")) {
            mime = "application/javascript";
            return new WebResourceResponse(
                    mime, encoding,
                    new ByteArrayInputStream("// OMEGA offline dependency intentionally unavailable.\n".getBytes(StandardCharsets.UTF_8))
            );
        }

        if (path.endsWith(".css")) {
            return new WebResourceResponse(
                    "text/css", encoding,
                    new ByteArrayInputStream(new byte[0])
            );
        }

        if (path.endsWith(".woff") || path.endsWith(".woff2") ||
                path.endsWith(".ttf") || path.endsWith(".otf")) {
            final String fontMime = path.endsWith(".woff2") ? "font/woff2"
                    : (path.endsWith(".ttf") ? "font/ttf"
                    : (path.endsWith(".otf") ? "font/otf" : "font/woff"));
            return new WebResourceResponse(
                    fontMime, null, new ByteArrayInputStream(new byte[0])
            );
        }

        if (path.endsWith(".svg")) {
            final byte[] emptySvg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"></svg>"
                    .getBytes(StandardCharsets.UTF_8);
            return new WebResourceResponse(
                    "image/svg+xml", encoding, new ByteArrayInputStream(emptySvg)
            );
        }

        if (path.endsWith(".json") || path.contains("/api/") || uri.getQuery() != null) {
            final byte[] json = "{\"offline\":true,\"status\":\"OFFLINE_SOURCE_UNAVAILABLE\",\"data\":null,\"countries\":[]}"
                    .getBytes(StandardCharsets.UTF_8);
            return new WebResourceResponse(
                    "application/json", encoding, new ByteArrayInputStream(json)
            );
        }

        final byte[] transparentPng = Base64.decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
                Base64.DEFAULT
        );
        return new WebResourceResponse(
                "image/png",
                null,
                new ByteArrayInputStream(transparentPng)
        );
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("OmegaAndroid");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private final class OmegaAndroidBridge {
        @JavascriptInterface
        public boolean isAndroidApp() {
            return true;
        }

        @JavascriptInterface
        public boolean isOfflineMode() {
            return true;
        }

        @JavascriptInterface
        public boolean isDiagnosticsEnabled() {
            // Per-script console tracing is expensive on Android 9's renderer. Keep it
            // opt-in for diagnostics instead of enabling hundreds of log callbacks in
            // every debug launch and instrumentation smoke test.
            return BuildConfig.DEBUG && getIntent() != null
                    && getIntent().getBooleanExtra("omegaWebDiagnostics", false);
        }

        @JavascriptInterface
        public String runtimeUrl() {
            return APP_URL;
        }
    }
}
