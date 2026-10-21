package com.omega.globalsupremecommander;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class OmegaGameplaySmokeTest {
    @Test
    public void offlineWebViewBootsAndMinistryNavigationResponds() throws Exception {
        final android.app.Instrumentation instrumentation =
                InstrumentationRegistry.getInstrumentation();
        final Intent launch = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        final Activity activity = instrumentation.startActivitySync(launch);
        final AtomicReference<WebView> webViewRef = new AtomicReference<>();

        try {
            instrumentation.runOnMainSync(() -> {
                final ViewGroup content =
                        activity.findViewById(android.R.id.content);
                assertNotNull("Activity content view should exist", content);
                WebView found = null;
                for (int i = 0; i < content.getChildCount(); i++) {
                    final View child = content.getChildAt(i);
                    if (child instanceof WebView) {
                        found = (WebView) child;
                        break;
                    }
                }
                assertNotNull("MainActivity should render the game inside a WebView", found);
                webViewRef.set(found);
            });

            final String readinessScript =
                    "(function() {" +
                    " return !!(" +
                    " document.readyState === 'complete' &&" +
                    " document.getElementById('app') &&" +
                    " document.getElementById('map') &&" +
                    " document.getElementById('btn-ministry-dock') &&" +
                    " typeof window.openMainMinistryView === 'function' &&" +
                    " window.Game && window.Omega" +
                    " );" +
                    "})()";
            final long deadline = SystemClock.elapsedRealtime() + 90000L;
            String ready = "false";
            while (!"true".equals(ready) && SystemClock.elapsedRealtime() < deadline) {
                ready = evaluate(instrumentation, webViewRef.get(), readinessScript, 45000L);
                if (!"true".equals(ready)) SystemClock.sleep(400L);
            }
            assertEquals(
                    "Bundled offline gameplay shell and core runtime must finish booting within 90 seconds",
                    "true", ready
            );

            final String compatibilityDiagnosticScript =
                    "(function() { return JSON.stringify({" +
                    "marker: !!window.__OMEGA_ANDROID_WEBVIEW_COMPAT__," +
                    "version: window.__OMEGA_ANDROID_WEBVIEW_COMPAT__ && window.__OMEGA_ANDROID_WEBVIEW_COMPAT__.version," +
                    "fromEntries: typeof Object.fromEntries === 'function'," +
                    "flatMap: typeof Array.prototype.flatMap === 'function'," +
                    "bridgeVersion: window.OmegaAIIntegrityCanonicalBridge && window.OmegaAIIntegrityCanonicalBridge.VERSION" +
                    "}); })()";
            final String compatibilityDiagnostic =
                    evaluate(instrumentation, webViewRef.get(), compatibilityDiagnosticScript);
            final String compatibilityReadyScript =
                    "(function() { return !!(window.__OMEGA_ANDROID_WEBVIEW_COMPAT__ &&" +
                    " window.__OMEGA_ANDROID_WEBVIEW_COMPAT__.version === '1.0.1' &&" +
                    " typeof Object.fromEntries === 'function' &&" +
                    " typeof Array.prototype.flatMap === 'function' &&" +
                    " window.OmegaAIIntegrityCanonicalBridge &&" +
                    " window.OmegaAIIntegrityCanonicalBridge.VERSION === '1.1.0'); })()";
            assertEquals(
                    "APK must execute the Chrome 66 compatibility layer and current canonical bridge; diagnostic="
                            + compatibilityDiagnostic,
                    "true",
                    evaluate(instrumentation, webViewRef.get(), compatibilityReadyScript)
            );

            final String clickSpeedScript =
                    "(function() { var button = document.querySelector('.speed-btn[data-speed=\\\"2\\\"]');" +
                    " if (!button) return 'MISSING_SPEED_CONTROL'; button.click(); return 'CLICK_SENT'; })()";
            assertEquals("2x speed control must exist and accept a click",
                    "\"CLICK_SENT\"", evaluate(instrumentation, webViewRef.get(), clickSpeedScript));
            final String speedStateScript =
                    "(function() { var b=document.querySelector('.speed-btn[data-speed=\\\"2\\\"]');" +
                    " return JSON.stringify({speed:window.Game&&window.Game.gameSpeed," +
                    "active:!!(b&&b.classList.contains('active')),button:!!b}); })()";
            waitForJsCondition(instrumentation, webViewRef.get(),
                    "(function(){var b=document.querySelector('.speed-btn[data-speed=\\\"2\\\"]');" +
                    "return !!(b&&b.classList.contains('active')&&window.Game&&window.Game.gameSpeed===2);})()",
                    10000L, "2x simulation speed");
            final String speedState = evaluate(instrumentation, webViewRef.get(), speedStateScript);
            assertTrue("2x speed diagnostic should show the settled state: " + speedState,
                    speedState.contains("speed") && speedState.contains("2") && speedState.contains("true"));

            final String clickMinistryScript =
                    "(function() { var b=document.getElementById('btn-ministry-dock');" +
                    " if (!b) return 'MISSING_MINISTRY_DOCK'; b.click(); return 'CLICK_SENT'; })()";
            assertEquals("The real Ministry dock must exist and accept a click",
                    "\"CLICK_SENT\"", evaluate(instrumentation, webViewRef.get(), clickMinistryScript));
            final String ministryStateScript =
                    "(function() {return JSON.stringify({manager:!!window.OmegaLayerManager," +
                    "layer:window.OmegaLayerManager&&window.OmegaLayerManager.currentLayer," +
                    "activeLayer:document.body.getAttribute('data-active-layer')});})()";
            waitForJsCondition(instrumentation, webViewRef.get(),
                    "(function() {return !!(window.OmegaLayerManager &&" +
                    " window.OmegaLayerManager.currentLayer===1 &&" +
                    " document.body.getAttribute('data-active-layer')==='1');})()",
                    15000L, "Government HQ Layer 1");
            final String ministryState = evaluate(instrumentation, webViewRef.get(), ministryStateScript);
            assertTrue("Ministry diagnostic should show the settled state: " + ministryState,
                    ministryState.contains("manager") && ministryState.contains("layer") && ministryState.contains("1"));
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static void waitForJsCondition(
            android.app.Instrumentation instrumentation,
            WebView webView,
            String script,
            long timeoutMs,
            String description
    ) throws Exception {
        final long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        String last = "false";
        while (!"true".equals(last) && SystemClock.elapsedRealtime() < deadline) {
            last = evaluate(instrumentation, webView, script);
            if (!"true".equals(last)) SystemClock.sleep(150L);
        }
        assertEquals("Timed out waiting for " + description + "; last JavaScript result=" + last,
                "true", last);
    }

    private static String evaluate(
            android.app.Instrumentation instrumentation,
            WebView webView,
            String script
    ) throws Exception {
        return evaluate(instrumentation, webView, script, 10000L);
    }

    private static String evaluate(
            android.app.Instrumentation instrumentation,
            WebView webView,
            String script,
            long callbackTimeoutMs
    ) throws Exception {
        assertNotNull("WebView reference should be initialized", webView);
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(
                () -> webView.evaluateJavascript(script, value -> {
                    result.set(value);
                    latch.countDown();
                })
        );
        assertTrue(
                "WebView JavaScript evaluation callback should return within " + callbackTimeoutMs
                        + " ms; script prefix=" + script.substring(0, Math.min(160, script.length())),
                latch.await(callbackTimeoutMs, TimeUnit.MILLISECONDS)
        );
        return result.get();
    }
}
