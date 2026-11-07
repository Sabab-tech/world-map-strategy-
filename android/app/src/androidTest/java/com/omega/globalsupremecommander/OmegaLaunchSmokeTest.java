package com.omega.globalsupremecommander;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.Timeout;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class OmegaLaunchSmokeTest {
    private static final long TEST_BUDGET_MS = 55000L;
    private static final String APP_URL =
            "https://appassets.androidplatform.net/assets/index.html";
    private static final String CORE_READY_SCRIPT =
            "(function(){try{return document.readyState==='complete'&&" +
            "!!document.getElementById('app')&&!!document.getElementById('map')&&" +
            "window.OMEGA_ANDROID_APP===true&&window.OMEGA_ANDROID_OFFLINE===true&&" +
            "!!window.OmegaAndroid&&window.OmegaAndroid.isAndroidApp()===true&&" +
            "window.OmegaAndroid.isOfflineMode()===true&&!!window.Game&&!!window.Omega;" +
            "}catch(error){return false;}})()";

    @Rule
    public final Timeout oneMinuteLimit = Timeout.seconds(60);

    @Test
    public void launchesBundledOfflineGameWithinOneMinute() throws Exception {
        final Instrumentation instrumentation =
                InstrumentationRegistry.getInstrumentation();
        final Intent launch = new Intent(
                instrumentation.getTargetContext(),
                MainActivity.class
        );
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        final Instrumentation.ActivityMonitor monitor =
                instrumentation.addMonitor(MainActivity.class.getName(), null, false);
        Activity launchedActivity = null;
        try {
            final long deadline = SystemClock.elapsedRealtime() + TEST_BUDGET_MS;
            instrumentation.getTargetContext().startActivity(launch);

            final long activityWaitMs = Math.min(
                    10000L,
                    Math.max(1L, deadline - SystemClock.elapsedRealtime())
            );
            launchedActivity = monitor.waitForActivityWithTimeout(activityWaitMs);
            assertNotNull("MainActivity must launch within the one-minute test budget",
                    launchedActivity);
            assertTrue("The launcher must open MainActivity",
                    launchedActivity instanceof MainActivity);

            final Activity activity = launchedActivity;
            final AtomicReference<WebView> webViewRef = new AtomicReference<>();
            final AtomicReference<String> appUrlRef = new AtomicReference<>();
            final AtomicReference<Boolean> javascriptEnabledRef = new AtomicReference<>(false);

            instrumentation.runOnMainSync(() -> {
                final WebView webView = findWebView(activity.getWindow().getDecorView());
                webViewRef.set(webView);
                if (webView != null) {
                    appUrlRef.set(webView.getUrl());
                    javascriptEnabledRef.set(webView.getSettings().getJavaScriptEnabled());
                }
            });

            final WebView webView = webViewRef.get();
            assertNotNull("MainActivity must display a native WebView", webView);
            assertEquals("The game must load from APK-bundled assets, not a remote host",
                    APP_URL, appUrlRef.get());
            assertTrue("The bundled game requires JavaScript to be enabled",
                    Boolean.TRUE.equals(javascriptEnabledRef.get()));

            String lastJavascriptResult = "not evaluated";
            boolean coreReady = false;
            while (SystemClock.elapsedRealtime() < deadline) {
                final CountDownLatch callback = new CountDownLatch(1);
                final AtomicReference<String> result = new AtomicReference<>();

                instrumentation.runOnMainSync(() -> {
                    if (!webView.isAttachedToWindow()) {
                        callback.countDown();
                        return;
                    }
                    webView.evaluateJavascript(CORE_READY_SCRIPT, value -> {
                        result.set(value);
                        callback.countDown();
                    });
                });

                final long remainingMs = Math.max(
                        1L,
                        deadline - SystemClock.elapsedRealtime()
                );
                if (callback.await(Math.min(750L, remainingMs), TimeUnit.MILLISECONDS)) {
                    lastJavascriptResult = result.get();
                    if ("true".equals(lastJavascriptResult)) {
                        coreReady = true;
                        break;
                    }
                }

                if (SystemClock.elapsedRealtime() < deadline) {
                    SystemClock.sleep(150L);
                }
            }

            assertTrue(
                    "Offline game shell and core runtime must be ready within 55 seconds; " +
                            "last JavaScript result=" + lastJavascriptResult,
                    coreReady
            );
        } finally {
            instrumentation.removeMonitor(monitor);
            if (launchedActivity != null && !launchedActivity.isFinishing()) {
                final Activity activityToClose = launchedActivity;
                instrumentation.runOnMainSync(activityToClose::finish);
            }
        }
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) {
            return (WebView) view;
        }
        if (view instanceof ViewGroup) {
            final ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) {
                final WebView found = findWebView(group.getChildAt(index));
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }
}
