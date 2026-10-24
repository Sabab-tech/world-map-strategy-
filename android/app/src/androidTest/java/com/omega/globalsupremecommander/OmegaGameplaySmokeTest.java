package com.omega.globalsupremecommander;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class OmegaGameplaySmokeTest {
    private static final long PAGE_LOAD_TIMEOUT_MS = 150000L;
    // The API 28 WebView must finish a large offline script bundle on a cold emulator.
    // Keep this finite, but do not confuse a delayed renderer callback with a failed boot.
    // The overall gameplay readiness checks remain bounded by PAGE_LOAD_TIMEOUT_MS.
    private static final long JAVASCRIPT_CALLBACK_TIMEOUT_SECONDS = 45L;

    @Test
    public void offlineWebViewBootsAndMinistryNavigationResponds() throws Exception {
        final android.app.Instrumentation instrumentation =
                InstrumentationRegistry.getInstrumentation();
        final Intent launch = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        final android.app.Instrumentation.ActivityMonitor activityMonitor =
                instrumentation.addMonitor(MainActivity.class.getName(), null, false);
        MainActivity activity = null;
        final AtomicReference<WebView> webViewRef = new AtomicReference<>();

        try {
            // startActivitySync() and runOnMainSync() wait for UI idleness without a caller
            // deadline. The game runs an animation loop and performs a large offline boot,
            // so use the ActivityMonitor's bounded wait and fetch the already-created WebView
            // directly rather than blocking the instrumentation thread on the UI thread.
            instrumentation.getTargetContext().startActivity(launch);
            final android.app.Activity startedActivity =
                    activityMonitor.waitForActivityWithTimeout(15000L);
            assertNotNull("MainActivity should start within 15 seconds", startedActivity);
            assertTrue("The launched activity must be MainActivity",
                    startedActivity instanceof MainActivity);
            activity = (MainActivity) startedActivity;
            final WebView found = activity.webViewForTest();
            assertNotNull("MainActivity should render the game inside a WebView", found);
            webViewRef.set(found);
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=ACTIVITY_AND_WEBVIEW_READY");

            /*
             * Wait for the main-frame load callback before queuing JavaScript. WebView progress
             * can reach 100 before onPageFinished is delivered; using the Activity's explicit
             * load state avoids racing JavaScript evaluation against a cold API 28 renderer.
             */
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=WAIT_MAIN_FRAME");
            final long loadDeadline = SystemClock.elapsedRealtime() + PAGE_LOAD_TIMEOUT_MS;
            while (!activity.hasMainFrameLoaded() &&
                    SystemClock.elapsedRealtime() < loadDeadline) {
                SystemClock.sleep(250L);
            }
            assertTrue(
                    "Bundled offline HTML and ordered deferred scripts must finish loading within 150 seconds",
                    activity.hasMainFrameLoaded()
            );

            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=MAIN_FRAME_LOADED");
            final String readinessScript =
                    "(function() {" +
                    " return !!(" +
                    " document.readyState === 'complete' &&" +
                    " document.getElementById('app') &&" +
                    " document.getElementById('map') &&" +
                    " document.getElementById('omega-gov-entry-v3') &&" +
                    " typeof window.openMainMinistryView === 'function' && window.OmegaUIV2App && window.OmegaUIV2Integration && typeof window.OmegaUIV2Integration.installLegacyLayerBridge === 'function' &&" +
                    " window.OMEGA_ANDROID_OFFLINE === true &&" +
                    " typeof Array.prototype.flatMap === 'function' &&" +
                    " window.OMEGA_ICON_SYSTEM_V1 && typeof window.OMEGA_ICON_SYSTEM_V1.nameForEmoji === 'function' &&" +
                    " window.Game && window.Omega" +
                    " );" +
                    "})()";
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=WAIT_CORE_RUNTIME_READY");
            final long deadline = SystemClock.elapsedRealtime() + PAGE_LOAD_TIMEOUT_MS;
            String ready = "false";
            while (!"true".equals(ready) && SystemClock.elapsedRealtime() < deadline) {
                ready = evaluate(instrumentation, webViewRef.get(), readinessScript);
                if (!"true".equals(ready)) SystemClock.sleep(400L);
            }
            assertEquals(
                    "Bundled offline gameplay shell, local data assets and core runtime must finish booting within 150 seconds",
                    "true", ready
            );

            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=CORE_RUNTIME_READY");
            final String offlineBridgeScript =
                    "(function() { return !!(window.OmegaAndroid && " +
                    "window.OmegaAndroid.isAndroidApp() === true && " +
                    "window.OmegaAndroid.isOfflineMode() === true); })()";
            assertEquals(
                    "Android bridge must confirm that packaged gameplay is offline-only",
                    "true", evaluate(instrumentation, webViewRef.get(), offlineBridgeScript)
            );

            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=OFFLINE_BRIDGE_READY");
            // A fatal overlay can leave the DOM and route state intact while intercepting
            // every physical tap. Assert its actual visibility before touching any controls,
            // and include the original message if boot stopped in recovery mode.
            final String fatalDiagnosticScript =
                    "(function() {" +
                    " var screen = document.getElementById('fatal-screen');" +
                    " var message = document.getElementById('fatal-msg');" +
                    " return JSON.stringify({visible:!!(screen && getComputedStyle(screen).display !== 'none')," +
                    " display:screen ? getComputedStyle(screen).display : null," +
                    " message:message ? message.textContent : null});" +
                    "})()";
            final String fatalDiagnostic = evaluate(instrumentation, webViewRef.get(), fatalDiagnosticScript);
            final String fatalVisibleScript =
                    "(function() { var screen=document.getElementById('fatal-screen');" +
                    " return !!(screen && getComputedStyle(screen).display !== 'none'); })()";
            assertEquals(
                    "The enterprise boot must not leave a full-screen fatal overlay that blocks real taps; diagnostic=" + fatalDiagnostic,
                    "false", evaluate(instrumentation, webViewRef.get(), fatalVisibleScript)
            );

            final String speedControlScript =
                    "(function() {" +
                    " if (!window.Omega || !window.Omega.GameLifecycle || !window.Game) return false;" +
                    // A speed selection must be tested in a started game, not an unowned world.
                    " window.Game.currentActiveCountry = 'USA';" +
                    " window.Game.playerCountry = 'USA';" +
                    " if (window.CountryIOS) window.CountryIOS.activeCountry = 'USA';" +
                    " var button = document.querySelector('.speed-btn[data-speed=\\\"2\\\"]');" +
                    " if (!button) return false;" +
                    " button.click();" +
                    " var diagnostics = window.Omega.GameLifecycle.getDiagnostics();" +
                    " return !!(diagnostics && diagnostics.clock && Number(diagnostics.clock.speed) === 2);" +
                    "})()";
            assertEquals(
                    "Tapping the 2x control must set the authoritative OMEGA simulation clock to speed 2",
                    "true", evaluate(instrumentation, webViewRef.get(), speedControlScript)
            );

            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=OPEN_MINISTRY");
            final String ministryNavigationScript =
                    "(function() {" +
                    " var button = document.getElementById('omega-gov-entry-v3');" +
                    " if (!button) return false;" +
                    " button.click();" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " return !!(cabinet && cabinet.getAttribute('data-omega-ui-v2-active') === 'true' &&" +
                    " cabinet.__omegaUIV2State && cabinet.getAttribute('data-omega-v2-route') === 'government' &&" +
                    " window.OmegaLayerManager && Number(window.OmegaLayerManager.currentLayer) === 1 &&" +
                    " document.body.getAttribute('data-active-layer') === '1');" +
                    "})()";
            final String ministryOpened =
                    evaluate(instrumentation, webViewRef.get(), ministryNavigationScript);
            assertEquals(
                    "Tapping the real Government entry must mount UI v2 without blocking WebView",
                    "true", ministryOpened
            );

            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=UI_V2_GOVERNMENT_OPENED");
            final String cabinetSurfaceReadyScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " var main = cabinet && cabinet.querySelector('[data-omega-v2-main]');" +
                    " var government = main && main.querySelector('.omega-v2-government');" +
                    " return !!(cabinet && cabinet.style.display === 'flex' &&" +
                    " cabinet.getAttribute('data-omega-ui-v2-active') === 'true' &&" +
                    " cabinet.getAttribute('data-omega-v2-route') === 'government' &&" +
                    " cabinet.querySelector('.omega-v2-app-frame') && main && government &&" +
                    " main.childElementCount > 0 && window.OmegaLayerManager &&" +
                    " Number(window.OmegaLayerManager.currentLayer) === 1 &&" +
                    " document.body.getAttribute('data-active-layer') === '1');" +
                    "})()";
            final String cabinetDiagnosticScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " var main = cabinet && cabinet.querySelector('[data-omega-v2-main]');" +
                    " var dashboard = document.getElementById('ministry-dashboard-view');" +
                    " var button = document.getElementById('omega-gov-entry-v3');" +
                    " var audit = window.OmegaUIV2Integration && window.OmegaUIV2Integration.audit();" +
                    " return JSON.stringify({" +
                    " display: cabinet ? cabinet.style.display : null," +
                    " active: cabinet ? cabinet.getAttribute('data-omega-ui-v2-active') : null," +
                    " route: cabinet ? cabinet.getAttribute('data-omega-v2-route') : null," +
                    " frame: !!(cabinet && cabinet.querySelector('.omega-v2-app-frame'))," +
                    " mainPresent: !!main," +
                    " governmentPresent: !!(main && main.querySelector('.omega-v2-government'))," +
                    " legacyDashboardHidden: !!(dashboard && getComputedStyle(dashboard).display === 'none')," +
                    " layer: window.OmegaLayerManager ? window.OmegaLayerManager.currentLayer : null," +
                    " activeLayer: document.body.getAttribute('data-active-layer')," +
                    " entryResult: button ? button.getAttribute('data-last-open-result') : null," +
                    " audit: audit || null" +
                    " });" +
                    "})()";
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=WAIT_CABINET_READY");
            final long cabinetDeadline = SystemClock.elapsedRealtime() + PAGE_LOAD_TIMEOUT_MS;
            String cabinetReady = "false";
            while (!"true".equals(cabinetReady) && SystemClock.elapsedRealtime() < cabinetDeadline) {
                cabinetReady = evaluate(instrumentation, webViewRef.get(), cabinetSurfaceReadyScript, JAVASCRIPT_CALLBACK_TIMEOUT_SECONDS);
                if (!"true".equals(cabinetReady)) SystemClock.sleep(350L);
            }
            final String cabinetDiagnostics = "true".equals(cabinetReady) ? "" :
                    evaluate(instrumentation, webViewRef.get(), cabinetDiagnosticScript, JAVASCRIPT_CALLBACK_TIMEOUT_SECONDS);
            assertEquals(
                    "Government UI v2 must render its active screen within 150 seconds; diagnostics=" + cabinetDiagnostics,
                    "true", cabinetReady
            );

            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=UI_V2_GOVERNMENT_READY");
            // Exercise native Android touch events instead of JavaScript .click().
            // Checking only data-omega-v2-route was insufficient: the route could change
            // even when the screen renderer threw and left a blank panel.
            final String activeShellScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " return !!(document.getElementById('omega-gov-entry-v3') && cabinet && cabinet.__omegaUIV2State &&" +
                    " cabinet.getAttribute('data-omega-ui-v2-active') === 'true');" +
                    "})()";
            assertEquals("Government shell should be active before touch navigation", "true",
                    evaluate(instrumentation, webViewRef.get(), activeShellScript));

            final String[] navigationSequence = {"economy", "government", "more", "economy", "government"};
            for (String route : navigationSequence) {
                final String selector = ".omega-v2-nav-button[data-omega-v2-global-nav=\"" + route + "\"]";
                tapWebViewElement(instrumentation, webViewRef.get(), selector);
                final String expectedScreen = "economy".equals(route) ? ".omega-v2-economy"
                        : "government".equals(route) ? ".omega-v2-government"
                        : ".omega-v2-more-page";
                final String screenReadyScript =
                        "(function() {" +
                        " var cabinet = document.getElementById('cabinet-full-window');" +
                        " var main = cabinet && cabinet.querySelector('[data-omega-v2-main]');" +
                        " return !!(cabinet && cabinet.getAttribute('data-omega-v2-route') === '" + route + "'" +
                        " && main && main.querySelector('" + expectedScreen + "')" +
                        " && (main.textContent || '').indexOf('This screen could not be opened') < 0);" +
                        "})()";
                String screenReady = evaluate(instrumentation, webViewRef.get(), screenReadyScript);
                if (!"true".equals(screenReady)) {
                    final String screenDiagnosticScript =
                            "(function() { var cabinet=document.getElementById('cabinet-full-window');" +
                            " var main=cabinet&&cabinet.querySelector('[data-omega-v2-main]');" +
                            " var metrics=window.__OMEGA_UI_V2_DIAGNOSTICS||{};" +
                            " return JSON.stringify({route:cabinet&&cabinet.getAttribute('data-omega-v2-route')," +
                            " active:cabinet&&cabinet.getAttribute('data-omega-ui-v2-active')," +
                            " expectedScreen:!!(main&&main.querySelector('" + expectedScreen + "'))," +
                            " recoveryText:!!(main&&(main.textContent||'').indexOf('This screen could not be opened')>=0)," +
                            " mainText:main?(main.textContent||'').trim().slice(0,360):null," +
                            " renderFailure:metrics.lastRenderFailure||null," +
                            " pointHit:window.__OMEGA_SMOKE_LAST_TAP_POINT||null," +
                            " tapEvents:window.__OMEGA_SMOKE_TAP_EVENTS||[]}); })()";
                    String screenDiagnostic = evaluate(instrumentation, webViewRef.get(), screenDiagnosticScript);
                    android.util.Log.e("OMEGA_ANDROID_SMOKE", "TOUCH_NAV_DIAGNOSTIC_" + route.toUpperCase() + "=" + screenDiagnostic);
                    assertEquals(
                            "A real Android touch must render the " + route + " screen; diagnostic=" + screenDiagnostic,
                            "true", screenReady
                    );
                }
                android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=TOUCH_NAV_" + route.toUpperCase() + "_RENDERED");
            }

            tapWebViewElement(instrumentation, webViewRef.get(), "[data-omega-v2-exit]");
            final String exitedToMapScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " return !!(cabinet && cabinet.getAttribute('data-omega-ui-v2-active') !== 'true' &&" +
                    " document.body.getAttribute('data-active-layer') === '0' &&" +
                    " Number(window.OmegaLayerManager.currentLayer) === 0);" +
                    "})()";
            assertEquals(
                    "A real Android touch on Exit must restore the live map",
                    "true", evaluate(instrumentation, webViewRef.get(), exitedToMapScript)
            );
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=UI_V2_EXITED_TO_MAP");

            // Reopen through the visible Atlas command dock, not the hidden fallback
            // entry button that JavaScript .click() could activate off-screen.
            tapWebViewElement(instrumentation, webViewRef.get(),
                    "#omega-atlas-command-dock [data-omega-atlas-route=\"government\"]");
            final String reopenedShellScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " var main = cabinet && cabinet.querySelector('[data-omega-v2-main]');" +
                    " return !!(cabinet && cabinet.getAttribute('data-omega-ui-v2-active') === 'true' &&" +
                    " cabinet.getAttribute('data-omega-v2-route') === 'government' &&" +
                    " main && main.querySelector('.omega-v2-government') &&" +
                    " Number(window.OmegaLayerManager.currentLayer) === 1 &&" +
                    " document.body.getAttribute('data-active-layer') === '1');" +
                    "})()";
            assertEquals(
                    "A real Android touch on the visible Government dock button must reopen the ministry UI",
                    "true", evaluate(instrumentation, webViewRef.get(), reopenedShellScript)
            );
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=UI_V2_REOPENED_BY_TOUCH");

            // Exercise the actual player-facing Industry/Factories panel for a selected country.
            // The panel must distinguish owned live factory assets from catalog profiles instead
            // of inventing an operational asset just because a profile exists in the catalog.
            final String factoryPanelScript =
                    "(function() {" +
                    " var ui = window.Omega && window.Omega.ResourceCommandCenterUI;" +
                    " if (!ui || typeof ui.open !== 'function') return false;" +
                    " if (window.Game) {" +
                    "   window.Game.currentActiveCountry = 'USA';" +
                    "   window.Game.playerCountry = 'USA';" +
                    "   if (window.Game.state) window.Game.state.playerCountryId = 'USA';" +
                    " }" +
                    " if (window.CountryIOS) window.CountryIOS.activeCountry = 'USA';" +
                    " window.currentActiveCountry = 'USA';" +
                    " ui.open('USA', 'industrial');" +
                    " var viewState = ui.getState();" +
                    " var modal = document.getElementById('gsrsk-intelligence-modal');" +
                    " var content = document.getElementById('omega-rescc-content');" +
                    " var title = content && content.querySelector('.omega-rescc-section-title');" +
                    " if (!viewState || viewState.countryId !== 'USA' || viewState.panel !== 'industrial' ||" +
                    "     !modal || modal.style.display !== 'flex' || !content || !title ||" +
                    "     title.textContent.trim() !== 'Industrial value chain') return false;" +
                    " if (content.querySelectorAll('.omega-rescc-factory-catalog-row').length === 0) return false;" +
                    " var body = content.textContent || '';" +
                    " var ownedStart = body.indexOf('My factories');" +
                    " var catalogStart = body.indexOf('Factory catalog ·', ownedStart);" +
                    " if (ownedStart < 0 || catalogStart <= ownedStart) return false;" +
                    " var ownedText = body.substring(ownedStart, catalogStart);" +
                    " return ownedText.indexOf('No commissioned factory assets are recorded for this country.') >= 0 ||" +
                    "        ownedText.indexOf('Factory input stock') >= 0;" +
                    "})()";
            assertEquals(
                    "Selecting a country and opening Industry/Factories must show the real asset state plus canonical factory catalog",
                    "true", evaluate(instrumentation, webViewRef.get(), factoryPanelScript)
            );
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=FACTORY_PANEL_READY");
        } finally {
            if (activity != null) {
                final MainActivity launchedActivity = activity;
                // Posting cleanup is asynchronous; it must not mask a timeout by blocking on
                // the same UI thread whose responsiveness this smoke test is checking.
                launchedActivity.runOnUiThread(launchedActivity::finish);
            }
            instrumentation.removeMonitor(activityMonitor);
        }
    }

    private static void tapWebViewElement(
            android.app.Instrumentation instrumentation,
            WebView webView,
            String selector
    ) throws Exception {
        assertNotNull("WebView reference should be initialized before a physical tap", webView);
        final String escapedSelector = selector.replace("\\", "\\\\").replace("'", "\\'");
        final String pointScript =
                "(function() {" +
                " var cabinet = document.getElementById('cabinet-full-window');" +
                " var element = cabinet && cabinet.getAttribute('data-omega-ui-v2-active') === 'true'" +
                "   ? cabinet.querySelector('" + escapedSelector + "') : null;" +
                " if (!element) element = document.querySelector('" + escapedSelector + "');" +
                " if (!element) return null;" +
                " var rect = element.getBoundingClientRect();" +
                " if (!rect.width || !rect.height || rect.bottom <= 0 || rect.right <= 0 ||" +
                "     rect.top >= window.innerHeight || rect.left >= window.innerWidth) return null;" +
                " var ratio = window.devicePixelRatio || 1;" +
                " var cssX=rect.left+rect.width/2, cssY=rect.top+rect.height/2;" +
                " var hit=document.elementFromPoint(cssX,cssY);" +
                " var info={x:Math.round(cssX*ratio),y:Math.round(cssY*ratio),cssX:cssX,cssY:cssY,ratio:ratio," +
                " viewport:{width:window.innerWidth,height:window.innerHeight}," +
                " target:{tag:element.tagName,id:element.id,cls:String(element.className||''),text:(element.innerText||element.textContent||'').trim().slice(0,80)}," +
                " hit:{tag:hit&&hit.tagName,id:hit&&hit.id,cls:hit&&String(hit.className||''),nav:hit&&hit.closest&&hit.closest('[data-omega-v2-global-nav]')&&hit.closest('[data-omega-v2-global-nav]').getAttribute('data-omega-v2-global-nav')}," +
                " rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},scroll:{x:window.scrollX,y:window.scrollY}};" +
                " window.__OMEGA_SMOKE_LAST_TAP_POINT=info; return info;" +
                "})()";
        final String pointJson = evaluate(instrumentation, webView, pointScript);
        assertTrue("Visible touch target was not found: " + selector + " (result=" + pointJson + ")",
                pointJson != null && !pointJson.equals("null"));
        final JSONObject point = new JSONObject(pointJson);
        android.util.Log.i("OMEGA_ANDROID_SMOKE", "TAP_POINT=" + pointJson);
        final String armTapScript =
                "(function() { window.__OMEGA_SMOKE_TAP_EVENTS=[];" +
                " ['touchstart','touchend','pointerdown','pointerup','click'].forEach(function(type) {" +
                " document.addEventListener(type,function(event) {" +
                " var t=event.target, b=t&&t.closest?t.closest('button,a,[role=button],[data-omega-v2-global-nav]'):null;" +
                " window.__OMEGA_SMOKE_TAP_EVENTS.push({type:type,tag:t&&t.tagName,id:t&&t.id," +
                " cls:t&&String(t.className||''),button:b&&String(b.innerText||b.textContent||'').trim().slice(0,60)," +
                " nav:b&&b.getAttribute('data-omega-v2-global-nav'),x:event.clientX,y:event.clientY});" +
                " },true); }); return 'armed'; })()";
        evaluate(instrumentation, webView, armTapScript);
        final int[] webViewOrigin = new int[2];
        final CountDownLatch locationLatch = new CountDownLatch(1);
        final boolean posted = webView.post(() -> {
            webView.getLocationOnScreen(webViewOrigin);
            locationLatch.countDown();
        });
        assertTrue("WebView must accept the bounded screen-position task", posted);
        assertTrue("WebView screen position should be available within 5 seconds",
                locationLatch.await(5, TimeUnit.SECONDS));

        final float x = webViewOrigin[0] + (float) point.getDouble("x");
        final float y = webViewOrigin[1] + (float) point.getDouble("y");
        final long downTime = SystemClock.uptimeMillis();
        final MotionEvent down = MotionEvent.obtain(
                downTime, downTime, MotionEvent.ACTION_DOWN, x, y, 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            instrumentation.sendPointerSync(down);
        } finally {
            down.recycle();
        }
        SystemClock.sleep(60L);
        final MotionEvent up = MotionEvent.obtain(
                downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y, 0);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            instrumentation.sendPointerSync(up);
        } finally {
            up.recycle();
        }
        SystemClock.sleep(100L);
        try {
            String tapEvents = evaluate(instrumentation, webView,
                    "JSON.stringify(window.__OMEGA_SMOKE_TAP_EVENTS||[])");
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "TAP_EVENTS=" + tapEvents);
        } catch (Exception diagnosticError) {
            android.util.Log.w("OMEGA_ANDROID_SMOKE", "TAP_EVENTS_UNAVAILABLE=" + diagnosticError.getMessage());
        }
    }

    private static String evaluate(
            android.app.Instrumentation instrumentation,
            WebView webView,
            String script
    ) throws Exception {
        return evaluate(instrumentation, webView, script, JAVASCRIPT_CALLBACK_TIMEOUT_SECONDS);
    }

    private static String evaluate(
            android.app.Instrumentation instrumentation,
            WebView webView,
            String script,
            long timeoutSeconds
    ) throws Exception {
        assertNotNull("WebView reference should be initialized", webView);
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<String> result = new AtomicReference<>();
        /*
         * Do not use Instrumentation.runOnMainSync here: it waits for the UI-thread
         * runnable to execute without a caller-controlled deadline. If WebView's UI
         * thread is monopolized during boot, the test itself can hang before reaching
         * the CountDownLatch timeout below. View.post returns immediately, allowing
         * the bounded wait to fail with a useful diagnostic instead.
         */
        final boolean posted = webView.post(
                () -> webView.evaluateJavascript(script, value -> {
                    result.set(value);
                    latch.countDown();
                })
        );
        assertTrue("WebView must accept the JavaScript evaluation task", posted);
        assertTrue(
                "WebView JavaScript evaluation callback should return within " +
                        timeoutSeconds + " seconds after page load",
                latch.await(timeoutSeconds, TimeUnit.SECONDS)
        );
        return result.get();
    }
}
