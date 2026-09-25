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
import android.webkit.WebViewClient;
import android.webkit.RenderProcessGoneDetail;

import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String APP_URL =
            "https://appassets.androidplatform.net/assets/index.html";
    private WebView webView;
    private WebViewAssetLoader assetLoader;

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

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                final Uri uri = request.getUrl();
                final WebResourceResponse local = assetLoader.shouldInterceptRequest(uri);
                if (local != null) {
                    return local;
                }

                if (uri != null && isKnownRemoteVisualOrLibrary(uri)) {
                    return offlineResponse(uri);
                }

                return super.shouldInterceptRequest(view, request);
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
                view.evaluateJavascript(
                        "window.OMEGA_ANDROID_APP=true;window.OMEGA_ANDROID_OFFLINE=true;",
                        null
                );
            }

            @Override
            public void onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view == webView) {
                    view.destroy();
                    webView = new WebView(MainActivity.this);
                    setContentView(webView);
                    configureWebView();
                    webView.loadUrl(APP_URL);
                }
            }
        });
    }

    private boolean isKnownRemoteVisualOrLibrary(Uri uri) {
        final String host = uri.getHost();
        if (host == null) return false;
        final String h = host.toLowerCase(Locale.ROOT);
        return h.equals("unpkg.com")
                || h.equals("fonts.googleapis.com")
                || h.equals("fonts.gstatic.com")
                || h.endsWith(".basemaps.cartocdn.com")
                || h.equals("basemaps.cartocdn.com")
                || h.equals("server.arcgisonline.com")
                || h.equals("tile.opentopomap.org");
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

        if (path.endsWith(".css")
                || uri.getHost().equalsIgnoreCase("fonts.googleapis.com")
                || uri.getHost().equalsIgnoreCase("fonts.gstatic.com")) {
            mime = "text/css";
            return new WebResourceResponse(
                    mime, encoding,
                    new ByteArrayInputStream(new byte[0])
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
        public String runtimeUrl() {
            return APP_URL;
        }
    }
}
