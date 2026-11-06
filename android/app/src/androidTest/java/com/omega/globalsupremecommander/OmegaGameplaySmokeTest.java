package com.omega.globalsupremecommander;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONTokener;

import java.util.ArrayList;
import java.util.Collections;
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

            final String privateLifecycleDiagnosticsScript =
                    "(function(){var main=document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                    "var panel=main&&main.querySelector('[data-omega-private-company-lifecycle]');" +
                    "var form=panel&&panel.querySelector('[data-pe-proposal-form]');" +
                    "var operator=form&&form.querySelector('select[name=operatorCompanyId]');" +
                    "var registry=window.OmegaPrivateEnterpriseRegistryV1;" +
                    "var diagnostic=registry&&typeof registry.diagnostics==='function'?registry.diagnostics():null;" +
                    "return JSON.stringify({route:document.getElementById('cabinet-full-window')&&document.getElementById('cabinet-full-window').getAttribute('data-omega-v2-route')," +
                    "tab:main&&main.__omegaV2IndustryTab,panel:!!panel,proposalForm:!!form,operatorSelector:!!operator," +
                    "baselineRetry:!!(panel&&panel.querySelector('[data-pe-baseline-retry]'))," +
                    "registryStatus:diagnostic&&diagnostic.status,registryReason:diagnostic&&diagnostic.reason});})()";
            String privateLifecycleReady = "false";
            String privateLifecycleLastDiagnostics = "{}";
            final long privateLifecycleDeadline = SystemClock.elapsedRealtime() + 20000L;
            while (!"true".equals(privateLifecycleReady) &&
                    SystemClock.elapsedRealtime() < privateLifecycleDeadline) {
                final String lifecycleDiagnostics = evaluate(instrumentation, webViewRef.get(), privateLifecycleDiagnosticsScript);
                privateLifecycleLastDiagnostics = lifecycleDiagnostics;
                try {
                    org.json.JSONObject state = new org.json.JSONObject(lifecycleDiagnostics);
                    privateLifecycleReady = Boolean.toString("production-lines".equals(state.optString("tab")) &&
                            state.optBoolean("panel") && state.optBoolean("proposalForm") && state.optBoolean("operatorSelector"));
                    if (!"true".equals(privateLifecycleReady) && state.optBoolean("baselineRetry")) {
                        throw new AssertionError("Private company baseline failed to load offline: " + lifecycleDiagnostics);
                    }
                } catch (org.json.JSONException error) {
                    throw new AssertionError("Invalid private lifecycle diagnostics: " + lifecycleDiagnostics, error);
                }
                if (!"true".equals(privateLifecycleReady)) SystemClock.sleep(200L);
            }
            assertEquals(
                    "Production Lines must mount the private proposal form and separate operator selector; diagnostics=" + privateLifecycleLastDiagnostics,
                    "true", privateLifecycleReady
            );
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=PRIVATE_ENTERPRISE_LIFECYCLE_MOUNTED");

            final String startObserver =
                    "(function(){window.__omegaApi28LongTasks=[];window.__omegaApi28ObserverSupported=false;" +
                    "window.__omegaApi28HeapBefore=performance.memory&&performance.memory.usedJSHeapSize||null;" +
                    "if(typeof PerformanceObserver==='function'){try{var o=new PerformanceObserver(function(list){" +
                    "list.getEntries().forEach(function(e){window.__omegaApi28LongTasks.push({duration:e.duration,startTime:e.startTime});});});" +
                    "o.observe({entryTypes:['longtask']});window.__omegaApi28ObserverSupported=true;window.__omegaApi28Observer=o;}catch(e){}}" +
                    "return String(window.__omegaApi28ObserverSupported);})()";
            final String observerReady = evaluate(instrumentation, webViewRef.get(), startObserver);
            final ArrayList<Double> navigationHandlerTimes = new ArrayList<>();
            final String[] industryTabs = {"inventory", "national-inventory", "production-lines"};
            final String[] industryTabNames = {"Input", "Stock", "Lines"};
            final StringBuilder tabNavigationTiming = new StringBuilder();
            final long stressDeadline = SystemClock.elapsedRealtime() + 45000L;

            // Ten complete Input/Stock/Lines rounds catch cumulative rendering/listener
            // regressions rather than timing a single lucky click on a warm WebView.
            for (int round = 0; round < 10; round++) {
                for (int tabIndex = 0; tabIndex < industryTabs.length; tabIndex++) {
                    assertTrue("Repeated Industry navigation must stay within the 45-second stress deadline",
                            SystemClock.elapsedRealtime() < stressDeadline);
                    final String tabId = industryTabs[tabIndex];
                    final String tabName = industryTabNames[tabIndex];
                    final String clickScript =
                            "(function(){var main=document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                            "var tab=main&&main.querySelector('[data-omega-v2-industry-tab=\"" + tabId + "\"]');" +
                            "if(!tab)return 'MISSING';var started=performance.now();tab.click();" +
                            "return String((performance.now()-started).toFixed(2));})()";
                    final String clickText = evaluate(instrumentation, webViewRef.get(), clickScript, 10L);
                    assertTrue(tabName + " tab must exist on round " + round, !"MISSING".equals(clickText));
                    final double clickMs;
                    try { clickMs = Double.parseDouble(clickText); }
                    catch (NumberFormatException error) { throw new AssertionError("Invalid " + tabName + " tap timing: " + clickText, error); }
                    navigationHandlerTimes.add(clickMs);
                    assertTrue(tabName + " click handler exceeded 1000ms on round " + round + ": " + clickMs,
                            clickMs <= 1000.0d);

                    String panelReady = "false";
                    final long panelDeadline = SystemClock.elapsedRealtime() + 10000L;
                    final String panelScript =
                            "(function(){var main=document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                            "var panel=main&&main.querySelector('[data-omega-v2-industry-content][data-active-tab=\"" + tabId + "\"]');" +
                            "return !!(panel&&panel.querySelector('.fp-content-heading')&&panel.querySelector('.fp-content-body'));})()";
                    while (!"true".equals(panelReady) && SystemClock.elapsedRealtime() < panelDeadline) {
                        panelReady = evaluate(instrumentation, webViewRef.get(), panelScript, 10L);
                        if (!"true".equals(panelReady)) SystemClock.sleep(100L);
                    }
                    assertEquals(tabName + " panel must render on round " + round, "true", panelReady);
                    if (tabNavigationTiming.length() > 0) tabNavigationTiming.append(',');
                    tabNavigationTiming.append(tabName).append('=').append(clickMs).append("ms");
                }
            }

            Collections.sort(navigationHandlerTimes);
            final double navigationP95 = navigationHandlerTimes.get(
                    Math.max(0, (int) Math.ceil(navigationHandlerTimes.size() * 0.95d) - 1));
            final double navigationMax = navigationHandlerTimes.get(navigationHandlerTimes.size() - 1);
            assertTrue("Industry tab-handler p95 must stay below 500ms; observed " + navigationP95,
                    navigationP95 <= 500.0d);
            assertTrue("Industry tab-handler max must stay below 1000ms; observed " + navigationMax,
                    navigationMax <= 1000.0d);

            final String stressMetricsScript =
                    "(function(){var rows=window.__omegaApi28LongTasks||[];return JSON.stringify({" +
                    "observerSupported:!!window.__omegaApi28ObserverSupported,count:rows.length," +
                    "maxDuration:rows.reduce(function(m,x){return Math.max(m,Number(x.duration)||0);},0)," +
                    "heapBefore:window.__omegaApi28HeapBefore||null," +
                    "heapUsed:performance.memory&&performance.memory.usedJSHeapSize||null," +
                    "heapLimit:performance.memory&&performance.memory.jsHeapSizeLimit||null," +
                    "viewport:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight," +
                    "scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}});})()";
            final org.json.JSONObject stressMetrics = new org.json.JSONObject(
                    evaluate(instrumentation, webViewRef.get(), stressMetricsScript, 10L));
            if (stressMetrics.optBoolean("observerSupported")) {
                assertTrue("No post-boot UI long task may exceed 1000ms; metrics=" + stressMetrics,
                        stressMetrics.optDouble("maxDuration", 0.0d) <= 1000.0d);
            }
            final long heapBefore = stressMetrics.optLong("heapBefore", -1L);
            final long heapAfter = stressMetrics.optLong("heapUsed", -1L);
            if (heapBefore > 0L && heapAfter > 0L) {
                assertTrue("Repeated tab navigation must not grow WebView JS heap by more than 64 MiB; metrics=" + stressMetrics,
                        heapAfter - heapBefore <= 64L * 1024L * 1024L);
            }
            final org.json.JSONObject landscapeViewport = stressMetrics.optJSONObject("viewport");
            assertNotNull("API 28 landscape viewport metrics must be present", landscapeViewport);
            android.util.Log.i("OMEGA_ANDROID_SMOKE",
                    "STAGE=INDUSTRY_NAV_STRESS_COMPLETE rounds=10 taps=" + navigationHandlerTimes.size() +
                            " p95Ms=" + navigationP95 + " maxMs=" + navigationMax +
                            " longTasks=" + stressMetrics.optInt("count") +
                            " longTaskObserver=" + stressMetrics.optBoolean("observerSupported") +
                            " heapUsed=" + stressMetrics.optLong("heapUsed", -1) +
                            " heapLimit=" + stressMetrics.optLong("heapLimit", -1));

            // The app defaults to landscape, but a real orientation transition must keep
            // the same Activity and WebView alive and must not spill the Lines UI sideways.
            requestOrientation(activity, webViewRef.get(), ActivityInfo.SCREEN_ORIENTATION_PORTRAIT, 10L);
            final org.json.JSONObject portraitViewport = waitForViewport(
                    instrumentation, webViewRef.get(), true, 10000L);
            assertTrue("Portrait Industry content must not overflow horizontally: " + portraitViewport,
                    portraitViewport.optInt("scrollWidth") <= portraitViewport.optInt("width") + 2);
            assertTrue("Portrait must keep private proposal form and operator selector mounted: " + portraitViewport,
                    portraitViewport.optBoolean("privateFormVisible") && portraitViewport.optBoolean("operatorSelectorVisible"));
            assertTrue("Portrait rotation must preserve the same WebView instance",
                    activity.webViewForTest() == webViewRef.get());
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=PORTRAIT_ROTATION_PASSED metrics=" + portraitViewport);

            requestOrientation(activity, webViewRef.get(), ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE, 10L);
            final org.json.JSONObject restoredLandscape = waitForViewport(
                    instrumentation, webViewRef.get(), false, 10000L);
            assertTrue("Returning to landscape must preserve the same WebView instance",
                    activity.webViewForTest() == webViewRef.get());
            assertTrue("Landscape must keep private proposal form and operator selector mounted: " + restoredLandscape,
                    restoredLandscape.optBoolean("privateFormVisible") && restoredLandscape.optBoolean("operatorSelectorVisible"));
            assertTrue("Landscape Industry content must not overflow horizontally: " + restoredLandscape,
                    restoredLandscape.optInt("scrollWidth") <= restoredLandscape.optInt("width") + 2);
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=LANDSCAPE_ROTATION_RESTORED metrics=" + restoredLandscape);
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=INDUSTRY_LINES_NAV_READY p95Ms=" +
                    navigationP95 + " maxMs=" + navigationMax + " nav=" + tabNavigationTiming);

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

    private static void requestOrientation(
            MainActivity activity,
            WebView webView,
            int orientation,
            long timeoutSeconds
    ) throws Exception {
        final CountDownLatch latch = new CountDownLatch(1);
        final boolean posted = webView.post(() -> {
            activity.setRequestedOrientation(orientation);
            latch.countDown();
        });
        assertTrue("WebView must accept a bounded orientation request", posted);
        assertTrue("Orientation request must complete within " + timeoutSeconds + " seconds",
                latch.await(timeoutSeconds, TimeUnit.SECONDS));
    }

    private static org.json.JSONObject waitForViewport(
            android.app.Instrumentation instrumentation,
            WebView webView,
            boolean portrait,
            long timeoutMs
    ) throws Exception {
        final String script = "(function(){var main=document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                "var panel=main&&main.querySelector('[data-omega-private-company-lifecycle]');" +
                "return JSON.stringify({width:document.documentElement.clientWidth," +
                "height:document.documentElement.clientHeight,scrollWidth:document.documentElement.scrollWidth," +
                "scrollHeight:document.documentElement.scrollHeight,privateFormVisible:!!(panel&&panel.querySelector('[data-pe-proposal-form]'))," +
                "operatorSelectorVisible:!!(panel&&panel.querySelector('select[name=operatorCompanyId]'))});})()";
        final long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        org.json.JSONObject latest = new org.json.JSONObject();
        while (SystemClock.elapsedRealtime() < deadline) {
            latest = new org.json.JSONObject(evaluate(instrumentation, webView, script, 10L));
            if ((portrait && latest.optInt("height") > latest.optInt("width")) ||
                    (!portrait && latest.optInt("width") > latest.optInt("height"))) return latest;
            SystemClock.sleep(150L);
        }
        throw new AssertionError("WebView did not reach " + (portrait ? "portrait" : "landscape") +
                " layout before deadline; last viewport=" + latest);
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
        final String raw = result.get();
        if (raw == null) return null;
        // WebView evaluateJavascript serializes a JavaScript string as a JSON string literal.
        // Decode that case instead of relying on quote stripping; keep JSON objects and
        // primitive boolean/number payloads unchanged.
        try {
            final Object decoded = new JSONTokener(raw).nextValue();
            if (decoded instanceof String) return (String) decoded;
        } catch (org.json.JSONException ignored) {
            // Preserve raw JSON object, number or boolean results.
        }
        return raw;
    }
}
