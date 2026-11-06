package com.omega.globalsupremecommander;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

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
                    " typeof Array.prototype.flatMap === 'function' && typeof Promise.allSettled === 'function' &&" +
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
                    " renderFailure: window.__OMEGA_UI_V2_DIAGNOSTICS && window.__OMEGA_UI_V2_DIAGNOSTICS.lastRenderFailure || null," +
                    " ministerErrors: window.__OMEGA_DIAG__ && window.__OMEGA_DIAG__.errors || []," +
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
            // Exercise repeated real UI v2 navigation taps, exit, and reopen. This
            // specifically catches event bubbling into the retired layer renderers.
            final String repeatedUiNavigationScript =
                    "(function() {" +
                    " var entry = document.getElementById('omega-gov-entry-v3');" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " if (!entry || !cabinet || !cabinet.__omegaUIV2State) return false;" +
                    " var sequence = ['economy','government','more','economy','government'];" +
                    " for (var i = 0; i < sequence.length; i++) {" +
                    "   var route = sequence[i];" +
                    "   var control = cabinet.querySelector('[data-omega-v2-global-nav=\"' + route + '\"]');" +
                    "   if (!control) return false;" +
                    "   control.click();" +
                    "   if (cabinet.getAttribute('data-omega-v2-route') !== route) return false;" +
                    " }" +
                    " var exit = cabinet.querySelector('[data-omega-v2-exit]');" +
                    " if (!exit) return false;" +
                    " exit.click();" +
                    " if (cabinet.getAttribute('data-omega-ui-v2-active') === 'true' ||" +
                    "     document.body.getAttribute('data-active-layer') !== '0' ||" +
                    "     Number(window.OmegaLayerManager.currentLayer) !== 0) return false;" +
                    " entry.click();" +
                    " return !!(cabinet.getAttribute('data-omega-ui-v2-active') === 'true' &&" +
                    "   cabinet.getAttribute('data-omega-v2-route') === 'government' &&" +
                    "   Number(window.OmegaLayerManager.currentLayer) === 1 &&" +
                    "   document.body.getAttribute('data-active-layer') === '1');" +
                    "})()";
            assertEquals(
                    "UI v2 buttons must keep navigating on repeated taps, exit to map and reopen without legacy UI",
                    "true", evaluate(instrumentation, webViewRef.get(), repeatedUiNavigationScript)
            );
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=UI_V2_REPEATED_BUTTON_NAV_READY");
            final String finalExitScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " var exit = cabinet && cabinet.querySelector('[data-omega-v2-exit]');" +
                    " if (!exit) return false;" +
                    " exit.click();" +
                    " return !!(cabinet.getAttribute('data-omega-ui-v2-active') !== 'true' &&" +
                    " document.body.getAttribute('data-active-layer') === '0');" +
                    "})()";
            assertEquals(
                    "UI v2 exit must restore the world map after repeated navigation",
                    "true", evaluate(instrumentation, webViewRef.get(), finalExitScript)
            );
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=UI_V2_EXITED_TO_MAP");

            // Open the canonical UI v2 Industry route. The legacy Resource Command Center
            // factory popup is covered by its own runtime tests; opening it here a second time
            // caused avoidable WebView main-thread work during the offline device smoke.
            final String openIndustryRoute =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " var integration = window.OmegaUIV2Integration;" +
                    " if (!cabinet || !integration || typeof integration.openRoute !== 'function') return false;" +
                    " window.OmegaMinistryViewCountry = 'USA';" +
                    " if (window.Game) { window.Game.currentActiveCountry = 'USA'; window.Game.playerCountry = 'USA';" +
                    "   if (window.Game.state) window.Game.state.playerCountryId = 'USA'; }" +
                    " if (window.CountryIOS) window.CountryIOS.activeCountry = 'USA';" +
                    " window.currentActiveCountry = 'USA';" +
                    " var simulation = window.Omega && window.Omega.Simulation;" +
                    " if (!simulation || typeof simulation.createSession !== 'function') return false;" +
                    " var session = simulation.createSession({ playerCountryId:'USA' });" +
                    " if (!session || session.playerCountryId !== 'USA' || simulation.getPlayerCountryId() !== 'USA') return false;" +
                    " return integration.openRoute('industry') === true;" +
                    "})()";
            assertEquals(
                    "The existing Industry route must mount or navigate through the integration entry point for the selected player country",
                    "true", evaluate(instrumentation, webViewRef.get(), openIndustryRoute)
            );
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=INDUSTRY_ROUTE_OPENED");

            final String linesTabReadyScript =
                    "(function() {" +
                    " var cabinet=document.getElementById('cabinet-full-window');" +
                    " var main=cabinet&&cabinet.querySelector('[data-omega-v2-main]');" +
                    " var lines=main&&main.querySelector('[data-omega-v2-industry-tab=\\\"production-lines\\\"]');" +
                    " var companies=main&&main.querySelector('[data-omega-v2-industry-tab=\\\"companies\\\"]');" +
                    " return !!(cabinet&&main&&cabinet.getAttribute('data-omega-v2-route')==='industry'&&" +
                    " lines&&!companies&&main.querySelector('[data-omega-v2-factory-view-content]'));" +
                    "})()";
            assertEquals(
                    "Industry must expose the existing Lines tab without a separate Companies tab",
                    "true", evaluate(instrumentation, webViewRef.get(), linesTabReadyScript)
            );

            final String activateLinesTab =
                    "(function() {" +
                    " var main=document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                    " var tab=main&&main.querySelector('[data-omega-v2-industry-tab=\\\"production-lines\\\"]');" +
                    " if(!tab) return 'MISSING_LINES_TAB';" +
                    " var started=performance.now();" +
                    " tab.click();" +
                    " return String((performance.now()-started).toFixed(2));" +
                    "})()";
            final String linesTapDuration = evaluate(instrumentation, webViewRef.get(), activateLinesTab);
            assertTrue("Lines tab must be present and clickable", !"MISSING_LINES_TAB".equals(linesTapDuration));
            final double linesTapMs;
            try { linesTapMs = Double.parseDouble(linesTapDuration); }
            catch (NumberFormatException error) { throw new AssertionError("Invalid Lines tap timing: " + linesTapDuration, error); }
            assertTrue("Lines tab click handler must return within 1000ms; observed " + linesTapMs + "ms", linesTapMs <= 1000.0d);

            String activeLinesReady = "false";
            final long linesRenderDeadline = SystemClock.elapsedRealtime() + 15000L;
            final String activeLinesScript =
                    "(function(){var main=document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                    "var panel=main&&main.querySelector('[data-omega-v2-industry-content][data-active-tab=\\\"production-lines\\\"]');" +
                    "var heading=panel&&panel.querySelector('.fp-content-heading');" +
                    "var body=panel&&panel.querySelector('.fp-content-body');" +
                    "return !!(panel&&heading&&/Production lines/i.test(heading.textContent||'')&&body);})()";
            while (!"true".equals(activeLinesReady) &&
                    SystemClock.elapsedRealtime() < linesRenderDeadline) {
                activeLinesReady = evaluate(instrumentation, webViewRef.get(), activeLinesScript);
                if (!"true".equals(activeLinesReady)) SystemClock.sleep(200L);
            }
            final String linesDiagnostics = evaluate(instrumentation, webViewRef.get(),
                    "(function(){var c=document.getElementById('cabinet-full-window');var m=c&&c.querySelector('[data-omega-v2-main]');" +
                    "var p=m&&m.querySelector('[data-omega-v2-industry-content]');" +
                    "return JSON.stringify({route:c&&c.getAttribute('data-omega-v2-route'),country:window.Omega&&window.Omega.Simulation&&window.Omega.Simulation.getPlayerCountryId&&window.Omega.Simulation.getPlayerCountryId()," +
                    "activeTab:p&&p.getAttribute('data-active-tab'),contentLength:p&&String(p.textContent||'').length," +
                    "companiesTab:m&&m.querySelectorAll('[data-omega-v2-industry-tab=\\\"companies\\\"]').length," +
                    "cycleCards:p&&p.querySelectorAll('.omega-v2-card').length,emptyState:p&&!!p.querySelector('.omega-v2-empty')});})()");
            assertEquals(
                    "The existing Lines panel must render for the selected country; diagnostics=" + linesDiagnostics,
                    "true", activeLinesReady
            );

            final String[] industryTabs = {"inventory", "national-inventory", "production-lines"};
            final String[] industryTabNames = {"Input", "Stock", "Lines"};
            final StringBuilder tabNavigationTiming = new StringBuilder();
            for (int tabIndex = 0; tabIndex < industryTabs.length; tabIndex++) {
                final String tabId = industryTabs[tabIndex];
                final String tabName = industryTabNames[tabIndex];
                final String clickTabScript =
                        "(function(){var main=document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                        "var tab=main&&main.querySelector('[data-omega-v2-industry-tab=\\\"' + '" + tabId + "' + '\\\"]');" +
                        "if(!tab)return 'MISSING';var started=performance.now();tab.click();" +
                        "return String((performance.now()-started).toFixed(2));})()";
                final String clickMsText = evaluate(instrumentation, webViewRef.get(), clickTabScript);
                assertTrue(tabName + " tab must exist", !"MISSING".equals(clickMsText));
                final double clickMs;
                try { clickMs = Double.parseDouble(clickMsText); }
                catch (NumberFormatException error) { throw new AssertionError("Invalid " + tabName + " tap timing: " + clickMsText, error); }
                assertTrue(tabName + " tab click handler must return within 1000ms; observed " + clickMs + "ms", clickMs <= 1000.0d);

                String panelReady = "false";
                final long panelDeadline = SystemClock.elapsedRealtime() + 10000L;
                final String panelScript =
                        "(function(){var main=document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                        "var tab='" + tabId + "';" +
                        "var panel=main&&main.querySelector('[data-omega-v2-industry-content][data-active-tab=\\\"'+tab+'\\\"]');" +
                        "return !!(panel&&panel.querySelector('.fp-content-heading')&&panel.querySelector('.fp-content-body'));})()";
                while (!"true".equals(panelReady) && SystemClock.elapsedRealtime() < panelDeadline) {
                    panelReady = evaluate(instrumentation, webViewRef.get(), panelScript);
                    if (!"true".equals(panelReady)) SystemClock.sleep(200L);
                }
                assertEquals(tabName + " panel must render after its tab is tapped", "true", panelReady);
                if (tabNavigationTiming.length() > 0) tabNavigationTiming.append(',');
                tabNavigationTiming.append(tabName).append('=').append(clickMs).append("ms");
            }
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=INDUSTRY_LINES_NAV_READY tapMs=" + linesTapMs + " nav=" + tabNavigationTiming);


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
