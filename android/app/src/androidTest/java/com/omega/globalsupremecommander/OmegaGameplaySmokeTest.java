package com.omega.globalsupremecommander;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Intent;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
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

            // Stop the simulation before inserting an in-memory-only fixture. This keeps
            // the visual test deterministic and prevents the fixture from entering a game turn.
            final String pauseClockScript =
                    "(function() {" +
                    " var lifecycle = window.Omega && window.Omega.GameLifecycle;" +
                    " var sim = window.Omega && (window.Omega.SimulationRuntime || window.Omega.Simulation);" +
                    " if (!lifecycle || typeof lifecycle.setSpeed !== 'function' || typeof lifecycle.getDiagnostics !== 'function' || !sim || !sim.clock) return false;" +
                    " var applied = lifecycle.setSpeed(0);" +
                    " var diagnostics = lifecycle.getDiagnostics();" +
                    " var speed = diagnostics && diagnostics.clock ? Number(diagnostics.clock.speed) : null;" +
                    " var status = String(sim.status || '').toUpperCase();" +
                    " var safeToSeed = speed === 0 || (status !== 'RUNNING' && !(diagnostics && diagnostics.running === true));" +
                    " window.__OMEGA_ANDROID_PAUSE_DIAGNOSTICS = {applied:applied, speed:speed, status:status, running:!!(diagnostics && diagnostics.running), safeToSeed:safeToSeed};" +
                    " return safeToSeed;" +
                    "})()";
            final String pauseClockResult = evaluate(instrumentation, webViewRef.get(), pauseClockScript);
            final String pauseClockDiagnostics = evaluate(instrumentation, webViewRef.get(),
                    "(function(){return JSON.stringify(window.__OMEGA_ANDROID_PAUSE_DIAGNOSTICS || {});})()");
            assertEquals(
                    "The visual-only fixture must not run during a live game turn; clock=" + pauseClockDiagnostics,
                    "true", pauseClockResult
            );

            final String seedFactoryInputFixtureScript =
                    "(function() {" +
                    " var state = window.Game && window.Game.state;" +
                    " if (!state) return false;" +
                    " var economy = state.economy || (state.economy = {});" +
                    " var country = economy.USA || (economy.USA = {});" +
                    " var id = 'OMEGA-ANDROID-INPUT-UI-FACTORY';" +
                    " var existing = Array.isArray(country.productionAssets) ? country.productionAssets : [];" +
                    " if (existing.some(function(row) { return row && String(row.id || '') === id; })) return false;" +
                    " window.__OMEGA_ANDROID_INPUT_FIXTURE = {" +
                    "   country:country," +
                    "   hadAssets:Object.prototype.hasOwnProperty.call(country, 'productionAssets')," +
                    "   originalAssets:country.productionAssets," +
                    "   id:id" +
                    " };" +
                    " var rows = existing.slice();" +
                    " rows.push({" +
                    "   id:id," +
                    "   name:'Android Smoke Steel Works'," +
                    "   factoryType:'STEEL_AND_ALLOY_WORKS'," +
                    "   recipeId:'STEEL_PRIMARY_ROUTE_V1'," +
                    "   status:'OPERATIONAL'," +
                    "   capacityPerDay:900," +
                    "   inputInventory:{iron_concentrate:120}," +
                    "   inputBatchLots:[{" +
                    "     batchId:'OMEGA-ANDROID-INPUT-UI-IRON-01'," +
                    "     resourceId:'iron_concentrate'," +
                    "     quantity:120," +
                    "     remainingQuantity:120," +
                    "     unit:'SIMULATION_RESOURCE_UNIT'," +
                    "     status:'AVAILABLE_TO_FACTORY'" +
                    "   }]" +
                    " });" +
                    " country.productionAssets = rows;" +
                    " window.Game.currentActiveCountry = 'USA';" +
                    " window.Game.playerCountry = 'USA';" +
                    " state.playerCountryId = 'USA';" +
                    " if (window.CountryIOS) window.CountryIOS.activeCountry = 'USA';" +
                    " window.currentActiveCountry = 'USA';" +
                    " return true;" +
                    "})()";
            assertEquals(
                    "A temporary, non-persistent factory with a canonical input recipe must be available for visual validation",
                    "true", evaluate(instrumentation, webViewRef.get(), seedFactoryInputFixtureScript)
            );
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=INPUT_UI_FIXTURE_READY");


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
            final String openMoreRouteScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " var button = cabinet && cabinet.querySelector('[data-omega-v2-global-nav=\"more\"]');" +
                    " if (!button) return false;" +
                    " button.click();" +
                    " return true;" +
                    "})()";
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=OPEN_MORE_BUTTON_CLICK_BEGIN");
            assertEquals("The visible More navigation button must respond",
                    "true", evaluate(instrumentation, webViewRef.get(), openMoreRouteScript));
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=OPEN_MORE_BUTTON_CLICK_RETURNED");
            final String moreRouteReadyScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " var main = cabinet && cabinet.querySelector('[data-omega-v2-main]');" +
                    " return !!(cabinet && cabinet.getAttribute('data-omega-v2-route') === 'more' &&" +
                    " main && main.querySelector('[data-omega-v2-global-nav=\"industry\"]'));" +
                    "})()";
            String moreRouteReady = "false";
            final long moreRouteDeadline = SystemClock.elapsedRealtime() + 30000L;
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=MORE_ROUTE_WAIT_BEGIN");
            while (!"true".equals(moreRouteReady) &&
                    SystemClock.elapsedRealtime() < moreRouteDeadline) {
                moreRouteReady = evaluate(instrumentation, webViewRef.get(), moreRouteReadyScript);
                if (!"true".equals(moreRouteReady)) SystemClock.sleep(300L);
            }
            android.util.Log.i("OMEGA_ANDROID_SMOKE",
                    "STAGE=MORE_ROUTE_WAIT_END result=" + moreRouteReady);
            assertEquals("Command Center must expose the Industry & Factories action",
                    "true", moreRouteReady);
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=MORE_ROUTE_READY");

            final String openIndustryRouteScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " var main = cabinet && cabinet.querySelector('[data-omega-v2-main]');" +
                    " var button = main && main.querySelector('[data-omega-v2-global-nav=\"industry\"]');" +
                    " if (!button) return false;" +
                    " button.click();" +
                    " return true;" +
                    "})()";
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=OPEN_INDUSTRY_BUTTON_CLICK_BEGIN");
            assertEquals("The Industry & Factories domain action must respond",
                    "true", evaluate(instrumentation, webViewRef.get(), openIndustryRouteScript));
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=OPEN_INDUSTRY_BUTTON_CLICK_RETURNED");
            final String industryRouteReadyScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " var main = cabinet && cabinet.querySelector('[data-omega-v2-main]');" +
                    " return !!(cabinet && cabinet.getAttribute('data-omega-v2-route') === 'industry' &&" +
                    " main && main.querySelector('[data-factory-stock-input-ui=\"v2\"]') &&" +
                    " main.querySelector('[data-omega-v2-industry-tab=\"inventory\"]'));" +
                    "})()";
            String industryRouteReady = "false";
            final long industryRouteDeadline = SystemClock.elapsedRealtime() + 45000L;
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=INDUSTRY_ROUTE_WAIT_BEGIN");
            while (!"true".equals(industryRouteReady) &&
                    SystemClock.elapsedRealtime() < industryRouteDeadline) {
                industryRouteReady = evaluate(instrumentation, webViewRef.get(), industryRouteReadyScript);
                if (!"true".equals(industryRouteReady)) SystemClock.sleep(350L);
            }
            android.util.Log.i("OMEGA_ANDROID_SMOKE",
                    "STAGE=INDUSTRY_ROUTE_WAIT_END result=" + industryRouteReady);
            assertEquals("The UI v2 Industry screen must mount from its real Command Center navigation",
                    "true", industryRouteReady);
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=UI_V2_INDUSTRY_READY");

            final String openInputTabScript =
                    "(function() {" +
                    " var cabinet = document.getElementById('cabinet-full-window');" +
                    " var main = cabinet && cabinet.querySelector('[data-omega-v2-main]');" +
                    " var button = main && main.querySelector('[data-omega-v2-industry-tab=\"inventory\"]');" +
                    " if (!button || button.disabled) return false;" +
                    " button.click();" +
                    " return true;" +
                    "})()";
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=INPUT_TAB_CLICK_BEGIN");
            assertEquals("The actual Input tab control must respond to a tap",
                    "true", evaluate(instrumentation, webViewRef.get(), openInputTabScript));
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=INPUT_TAB_CLICK_RETURNED");
            final String inputTablesReadyScript =
                    "(function() {" +
                    " var main = document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                    " var screen = main && main.querySelector('[data-factory-stock-input-ui=\"v2\"]');" +
                    " var stage = screen && screen.querySelector('[data-active-tab=\"inventory\"]');" +
                    " var plan = screen && screen.querySelector('[data-factory-input-plan=\"daily-v2\"]');" +
                    " var aggregate = plan && plan.querySelector('.fp-factory-input-total-table tbody tr');" +
                    " var perFactory = screen && screen.querySelector('.fp-factory-data-card .fp-factory-input-table tbody tr');" +
                    " return !!(screen && stage && plan && aggregate && perFactory);" +
                    "})()";
            String inputTablesReady = "false";
            final long inputTablesDeadline = SystemClock.elapsedRealtime() + 60000L;
            while (!"true".equals(inputTablesReady) &&
                    SystemClock.elapsedRealtime() < inputTablesDeadline) {
                inputTablesReady = evaluate(instrumentation, webViewRef.get(), inputTablesReadyScript);
                if (!"true".equals(inputTablesReady)) SystemClock.sleep(400L);
            }
            assertEquals(
                    "The Input tab must show both all-factory daily requirements and per-factory input inventory rows",
                    "true", inputTablesReady
            );
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=FACTORY_INPUT_TABLES_READY");

            final String revealInputRowScript =
                    "(function() {" +
                    " var main = document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                    " var row = main && main.querySelector('.fp-factory-input-total-table tbody tr');" +
                    " if (!row) return false;" +
                    " row.scrollIntoView({block:'center', inline:'nearest'});" +
                    " return true;" +
                    "})()";
            assertEquals("The first aggregate input row must be reachable in the active viewport",
                    "true", evaluate(instrumentation, webViewRef.get(), revealInputRowScript));

            final String inputLayoutAuditScript =
                    "(function() {" +
                    " var main = document.querySelector('#cabinet-full-window [data-omega-v2-main]');" +
                    " var screen = main && main.querySelector('[data-factory-stock-input-ui=\"v2\"]');" +
                    " var stage = screen && screen.querySelector('[data-active-tab=\"inventory\"]');" +
                    " var plan = screen && screen.querySelector('[data-factory-input-plan=\"daily-v2\"]');" +
                    " var aggregate = plan && plan.querySelector('.fp-factory-input-total-table');" +
                    " var aggregateRow = aggregate && aggregate.querySelector('tbody tr');" +
                    " var factoryTable = screen && screen.querySelector('.fp-factory-data-card .fp-factory-input-table');" +
                    " var factoryRow = factoryTable && factoryTable.querySelector('tbody tr');" +
                    " function visible(node) {" +
                    "   if (!node) return false;" +
                    "   var rect = node.getBoundingClientRect(), style = getComputedStyle(node);" +
                    "   return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&" +
                    "     style.visibility !== 'hidden' && Number(style.opacity || 1) > 0;" +
                    " }" +
                    " function iconVisible(row) {" +
                    "   var frame = row && row.querySelector('.fp-product-icon-frame');" +
                    "   var icon = row && row.querySelector('.fp-product-icon-visual');" +
                    "   return !!(visible(frame) && visible(icon));" +
                    " }" +
                    " var aggregateWrap = aggregate && aggregate.closest('.fp-factory-table-wrap');" +
                    " var factoryWrap = factoryTable && factoryTable.closest('.fp-factory-table-wrap');" +
                    " function scrollable(wrap) {" +
                    "   if (!wrap) return false;" +
                    "   var style = getComputedStyle(wrap), width = wrap.clientWidth, range = wrap.scrollWidth - width;" +
                    "   if (width <= 0 || range <= 1 || !/auto|scroll/.test(style.overflowX)) return false;" +
                    "   var old = wrap.scrollLeft;" +
                    "   wrap.scrollLeft = range;" +
                    "   var moved = wrap.scrollLeft > old;" +
                    "   wrap.scrollLeft = 0;" +
                    "   return moved;" +
                    " }" +
                    " var headersA = aggregate ? aggregate.querySelectorAll('thead th').length : 0;" +
                    " var headersF = factoryTable ? factoryTable.querySelectorAll('thead th').length : 0;" +
                    " var text = (aggregateRow && aggregateRow.textContent || '') + ' ' + (factoryRow && factoryRow.textContent || '');" +
                    " var orientation = window.innerWidth > window.innerHeight;" +
                    " var metrics = {" +
                    "   viewport:window.innerWidth + 'x' + window.innerHeight," +
                    "   landscape:orientation," +
                    "   inputTabPressed:!!(screen && screen.querySelector('[data-omega-v2-industry-tab=\"inventory\"][aria-pressed=\"true\"]'))," +
                    "   aggregateRows:aggregate ? aggregate.querySelectorAll('tbody tr').length : 0," +
                    "   perFactoryRows:factoryTable ? factoryTable.querySelectorAll('tbody tr').length : 0," +
                    "   aggregateHeaders:headersA, perFactoryHeaders:headersF," +
                    "   aggregateIconVisible:iconVisible(aggregateRow)," +
                    "   perFactoryIconVisible:iconVisible(factoryRow)," +
                    "   aggregateHorizontalScroll:scrollable(aggregateWrap)," +
                    "   perFactoryHorizontalScroll:scrollable(factoryWrap)," +
                    "   aggregateRowVisible:visible(aggregateRow)," +
                    "   productNamePresent:/iron concentrate/i.test(text)" +
                    " };" +
                    " window.__OMEGA_ANDROID_INPUT_LAYOUT = metrics;" +
                    " return !!(orientation && metrics.inputTabPressed && metrics.aggregateRows > 0 &&" +
                    "   metrics.perFactoryRows > 0 && headersA === 7 && headersF === 8 &&" +
                    "   metrics.aggregateIconVisible && metrics.perFactoryIconVisible &&" +
                    "   metrics.aggregateHorizontalScroll && metrics.perFactoryHorizontalScroll &&" +
                    "   metrics.aggregateRowVisible && metrics.productNamePresent);" +
                    "})()";
            assertEquals(
                    "Android landscape Input layout must visibly render product icons, all table columns and working horizontal scrollers; metrics=" +
                            evaluate(instrumentation, webViewRef.get(),
                                    "(function(){return JSON.stringify(window.__OMEGA_ANDROID_INPUT_LAYOUT || {});})()"),
                    "true", evaluate(instrumentation, webViewRef.get(), inputLayoutAuditScript)
            );
            android.util.Log.i(
                    "OMEGA_ANDROID_SMOKE",
                    "INPUT_UI_LANDSCAPE_LAYOUT=" + evaluate(instrumentation, webViewRef.get(),
                            "(function(){return JSON.stringify(window.__OMEGA_ANDROID_INPUT_LAYOUT || {});})()")
            );
            SystemClock.sleep(500L);
            captureScreenshot(instrumentation, "factory-input-landscape.png");
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=FACTORY_INPUT_LANDSCAPE_SCREENSHOT_SAVED");

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



            // Exercise the actual player-facing Industry/Factories panel for a selected country.
            // The panel must distinguish owned live factory assets from catalog profiles instead
            // of inventing an operational asset just because a profile exists in the catalog.
            final String factoryPanelScript =
                    "(function() {" +
                    " var ui = window.Omega && window.Omega.ResourceCommandCenterUI;" +
                    " if (!ui || typeof ui.open !== 'function') return false;" +
                    " var viewState = ui.getState();" +
                    " var modal = document.getElementById('gsrsk-intelligence-modal');" +
                    " if (!viewState || viewState.countryId !== 'USA' || viewState.panel !== 'industrial' ||" +
                    "     !modal || modal.style.display !== 'flex') {" +
                    "   if (window.Game) {" +
                    "     window.Game.currentActiveCountry = 'USA';" +
                    "     window.Game.playerCountry = 'USA';" +
                    "     if (window.Game.state) window.Game.state.playerCountryId = 'USA';" +
                    "   }" +
                    "   if (window.CountryIOS) window.CountryIOS.activeCountry = 'USA';" +
                    "   window.currentActiveCountry = 'USA';" +
                    "   try { ui.open('USA', 'industrial'); } catch (error) {" +
                    "     return 'FACTORY_PANEL_EXCEPTION:' + String(error && (error.stack || error.message) || error);" +
                    "   }" +
                    "   viewState = ui.getState();" +
                    "   modal = document.getElementById('gsrsk-intelligence-modal');" +
                    " }" +
                    " var content = document.getElementById('omega-rescc-content');" +
                    " var title = content && content.querySelector('.omega-rescc-section-title');" +
                    " if (!viewState || viewState.countryId !== 'USA' || viewState.panel !== 'industrial' ||" +
                    "     !modal || modal.style.display !== 'flex' || !content || !title ||" +
                    "     title.textContent.trim() !== 'Industrial value chain') return false;" +
                    " if (content.querySelectorAll('.omega-rescc-factory-catalog-row').length === 0) return false;" +
                    " var body = content.textContent || '';" +
                    " return body.indexOf('Factories') >= 0 &&" +
                    "        content.querySelectorAll('.omega-rescc-factory-catalog-row').length > 0;" +
                    "})()";
            String factoryPanelReady = "false";
            final long factoryPanelDeadline = SystemClock.elapsedRealtime() + 60000L;
            while (!"true".equals(factoryPanelReady) &&
                    SystemClock.elapsedRealtime() < factoryPanelDeadline) {
                factoryPanelReady = evaluate(instrumentation, webViewRef.get(), factoryPanelScript);
                if (!"true".equals(factoryPanelReady)) SystemClock.sleep(300L);
            }
            final String factoryPanelDiagnosticsScript =
                    "(function() {" +
                    " var engine = window.ResourceMinistryEngine || window.OmegaResourceMinistryEngine || null;" +
                    " var report = null;" +
                    " try { report = engine && typeof engine.getDataLoadReport === 'function' ? engine.getDataLoadReport() : null; } catch (error) {" +
                    "   report = {diagnosticError:String(error && (error.stack || error.message) || error)};" +
                    " }" +
                    " var ui = window.Omega && window.Omega.ResourceCommandCenterUI;" +
                    " var state = null;" +
                    " try { state = ui && typeof ui.getState === 'function' ? ui.getState() : null; } catch (_) {}" +
                    " var modal = document.getElementById('gsrsk-intelligence-modal');" +
                    " var content = document.getElementById('omega-rescc-content');" +
                    " var title = content && content.querySelector('.omega-rescc-section-title');" +
                    " return JSON.stringify({" +
                    "   resourceEngineExists:!!engine," +
                    "   resourceReady:!!(engine && engine.isReady)," +
                    "   resourceLoading:!!(engine && engine.isLoading)," +
                    "   resourceTypeCount:engine && Array.isArray(engine.resourceTypes) ? engine.resourceTypes.length : null," +
                    "   depositCount:engine && Array.isArray(engine.deposits) ? engine.deposits.length : null," +
                    "   countryProfileCount:engine && engine.countryProfiles ? Object.keys(engine.countryProfiles).length : null," +
                    "   report:report," +
                    "   viewState:state," +
                    "   modalVisible:!!(modal && modal.style.display === 'flex')," +
                    "   title:title ? title.textContent.trim() : null," +
                    "   factoryRowCount:content ? content.querySelectorAll('.omega-rescc-factory-catalog-row').length : 0," +
                    "   contentPreview:content ? (content.textContent || '').trim().slice(0,700) : null" +
                    " });" +
                    "})()";
            String factoryPanelDiagnostics = evaluate(instrumentation, webViewRef.get(), factoryPanelDiagnosticsScript);
            android.util.Log.e("OMEGA_ANDROID_SMOKE", "FACTORY_PANEL_DIAGNOSTICS=" + factoryPanelDiagnostics);
            assertEquals(
                    "Selecting a country and opening Industry/Factories must show the country factory cards after the bounded catalog-ready refresh; diagnostics=" + factoryPanelDiagnostics,
                    "true", factoryPanelReady
            );
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=FACTORY_PANEL_READY");
        } finally {
            if (webViewRef.get() != null) {
                final String cleanupInputFixtureScript =
                        "(function() {" +
                        " var fixture = window.__OMEGA_ANDROID_INPUT_FIXTURE;" +
                        " if (!fixture || !fixture.country) return true;" +
                        " if (fixture.hadAssets) fixture.country.productionAssets = fixture.originalAssets;" +
                        " else delete fixture.country.productionAssets;" +
                        " delete window.__OMEGA_ANDROID_INPUT_FIXTURE;" +
                        " delete window.__OMEGA_ANDROID_INPUT_LAYOUT;" +
                        " return true;" +
                        "})()";
                try {
                    evaluate(instrumentation, webViewRef.get(), cleanupInputFixtureScript, 10L);
                } catch (Throwable cleanupError) {
                    // Preserve the original instrumentation failure. Cleanup runs against
                    // the same WebView thread and must never replace the actionable assertion.
                    android.util.Log.e("OMEGA_ANDROID_SMOKE",
                            "Temporary input fixture cleanup did not complete", cleanupError);
                }
            }
            if (activity != null) {
                final MainActivity launchedActivity = activity;
                // Posting cleanup is asynchronous; it must not mask a timeout by blocking on
                // the same UI thread whose responsiveness this smoke test is checking.
                launchedActivity.runOnUiThread(launchedActivity::finish);
            }
            instrumentation.removeMonitor(activityMonitor);
        }
    }

    private static File captureScreenshot(
            android.app.Instrumentation instrumentation,
            String fileName
    ) throws Exception {
        final Bitmap bitmap = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull("Android emulator screenshot must be captured", bitmap);
        assertTrue("Android screenshot width must be positive", bitmap.getWidth() > 0);
        assertTrue("Android screenshot height must be positive", bitmap.getHeight() > 0);
        final File directory = instrumentation.getTargetContext().getExternalFilesDir("omega-smoke");
        assertNotNull("Android external files directory must be available for smoke screenshots", directory);
        assertTrue("Android screenshot directory must be creatable",
                directory.isDirectory() || directory.mkdirs());
        final File output = new File(directory, fileName);
        try (FileOutputStream stream = new FileOutputStream(output)) {
            assertTrue("Android screenshot must encode as PNG",
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream));
            stream.flush();
        } finally {
            bitmap.recycle();
        }
        assertTrue("Android screenshot file must be non-empty", output.isFile() && output.length() > 2048L);
        android.util.Log.i("OMEGA_ANDROID_SMOKE",
                "SCREENSHOT_SAVED=" + output.getAbsolutePath() + " bytes=" + output.length());
        return output;
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
        if (!latch.await(timeoutSeconds, TimeUnit.SECONDS)) {
            final Thread webViewThread = webView.getHandler() == null
                    ? null : webView.getHandler().getLooper().getThread();
            final StringBuilder stack = new StringBuilder();
            if (webViewThread != null) {
                for (StackTraceElement frame : webViewThread.getStackTrace()) {
                    stack.append("\\n  at ").append(frame);
                }
            }
            android.util.Log.e("OMEGA_ANDROID_SMOKE",
                    "JAVASCRIPT_CALLBACK_TIMEOUT after " + timeoutSeconds +
                            "s; webViewThread=" + (webViewThread == null ? "unknown" : webViewThread.getName()) +
                            stack);
            fail("WebView JavaScript evaluation callback should return within " +
                    timeoutSeconds + " seconds after page load; webViewThread=" +
                    (webViewThread == null ? "unknown" : webViewThread.getName()) + stack);
        }
        return result.get();
    }
}
