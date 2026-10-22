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
                    " window.OMEGA_ANDROID_OFFLINE === true &&" +
                    " window.Game && window.Omega" +
                    " );" +
                    "})()";
            final long deadline = SystemClock.elapsedRealtime() + 150000L;
            String ready = "false";
            while (!"true".equals(ready) && SystemClock.elapsedRealtime() < deadline) {
                ready = evaluate(instrumentation, webViewRef.get(), readinessScript);
                if (!"true".equals(ready)) SystemClock.sleep(400L);
            }
            assertEquals(
                    "Bundled offline gameplay shell, local data assets and core runtime must finish booting within 150 seconds",
                    "true", ready
            );
            final String offlineBridgeScript =
                    "(function() { return !!(window.OmegaAndroid && " +
                    "window.OmegaAndroid.isAndroidApp() === true && " +
                    "window.OmegaAndroid.isOfflineMode() === true); })()";
            assertEquals(
                    "Android bridge must confirm that packaged gameplay is offline-only",
                    "true", evaluate(instrumentation, webViewRef.get(), offlineBridgeScript)
            );

            final String speedControlScript =
                    "(function() {" +
                    " var button = document.querySelector('.speed-btn[data-speed=\"2\"]');" +
                    " if (!button || !window.Omega || !window.Omega.GameLifecycle) return false;" +
                    " button.click();" +
                    " var diagnostics = window.Omega.GameLifecycle.getDiagnostics();" +
                    " return !!(diagnostics && diagnostics.clock && Number(diagnostics.clock.speed) === 2);" +
                    "})()";
            assertEquals(
                    "Tapping the 2x control must set the authoritative OMEGA simulation clock to speed 2",
                    "true", evaluate(instrumentation, webViewRef.get(), speedControlScript)
            );

            final String ministryNavigationScript =
                    "(function() {" +
                    " var button = document.getElementById('btn-ministry-dock');" +
                    " if (!button) return false;" +
                    " button.click();" +
                    " return !!(window.OmegaLayerManager &&" +
                    " window.OmegaLayerManager.currentLayer === 1 &&" +
                    " document.body.getAttribute('data-active-layer') === '1');" +
                    "})()";
            final String ministryOpened =
                    evaluate(instrumentation, webViewRef.get(), ministryNavigationScript);
            assertEquals(
                    "Tapping the real Ministry dock must enter Government HQ Layer 1",
                    "true", ministryOpened
            );
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static String evaluate(
            android.app.Instrumentation instrumentation,
            WebView webView,
            String script
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
                "WebView JavaScript evaluation callback should return",
                latch.await(45, TimeUnit.SECONDS)
        );
        return result.get();
    }
}
