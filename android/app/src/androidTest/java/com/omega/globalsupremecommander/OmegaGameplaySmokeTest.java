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
                ready = evaluate(instrumentation, webViewRef.get(), readinessScript);
                if (!"true".equals(ready)) SystemClock.sleep(400L);
            }
            assertEquals(
                    "Bundled offline gameplay shell and core runtime must finish booting within 90 seconds",
                    "true", ready
            );

            final String speedControlScript =
                    "(function() {" +
                    " var button = document.querySelector('.speed-btn[data-speed=\\\"2\\\"]');" +
                    " if (!button) return false;" +
                    " button.click();" +
                    " return !!(button.classList.contains('active') && window.Game.gameSpeed === 2);" +
                    "})()";
            assertEquals(
                    "Tapping the 2x control must update the actual simulation speed",
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
                latch.await(10, TimeUnit.SECONDS)
        );
        return result.get();
    }
}
