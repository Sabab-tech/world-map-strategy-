package com.omega.globalsupremecommander;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import android.os.SystemClock;
import android.os.Debug;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;

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
    // The CI emulator is configured with 3 GB RAM to approximate the target low-end handset.
    private static final int MAX_PROCESS_PSS_KB = 1_200_000;

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
            final String bootDiagnosticsScript =
                    "(function() {" +
                    " var d = window.__OMEGA_DIAG__ || {};" +
                    " var screen = document.getElementById('fatal-screen');" +
                    " var message = document.getElementById('fatal-msg');" +
                    " return {state:d.state||null," +
                    " fatalVisible:!!(screen && getComputedStyle(screen).display !== 'none')," +
                    " fatalMessage:message ? message.textContent : null," +
                    " errors:(d.errors||[]).slice(-8).map(function(x){return {type:x.type||null,msg:x.msg||null};})};" +
                    "})()";
            final String bootDiagnosticsRaw = evaluate(instrumentation, webViewRef.get(), bootDiagnosticsScript, 10L);
            final JSONObject bootDiagnostics = new JSONObject(bootDiagnosticsRaw);
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "BOOT_DIAGNOSTICS=" + bootDiagnostics);
            assertTrue("Enterprise boot must not expose a fatal overlay: " + bootDiagnostics,
                    !bootDiagnostics.optBoolean("fatalVisible", false) &&
                    !"FAILED".equals(bootDiagnostics.optString("state", "")));
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
                    " if (!window.Omega || !window.Omega.GameLifecycle || !window.Game) return {error:'GAME_LIFECYCLE_MISSING'};" +
                    // Select the test player, then use the same real speed control a player uses.
                    " window.Game.currentActiveCountry = 'USA';" +
                    " window.Game.playerCountry = 'USA';" +
                    " if (window.CountryIOS) window.CountryIOS.activeCountry = 'USA';" +
                    " var button = document.querySelector('.speed-btn[data-speed=\\\"2\\\"]');" +
                    " if (!button) return {error:'SPEED_CONTROL_MISSING'};" +
                    " button.click();" +
                    " var simulation = window.Omega.Simulation;" +
                    " if (!simulation || !simulation.clock) return {error:'SIMULATION_CLOCK_MISSING'};" +
                    " return {speed:Number(simulation.clock.speed), status:String(simulation.status||'')," +
                    " paused:!!simulation.clock.paused, turn:Number(simulation.clock.turn)||0};" +
                    "})()";
            final String startedSessionRaw = evaluate(instrumentation, webViewRef.get(), speedControlScript, 12L);
            final JSONObject startedSession = new JSONObject(startedSessionRaw);
            assertTrue("The game must expose a session/clock after starting: " + startedSessionRaw,
                    !startedSession.has("error"));
            assertEquals("The selected game speed must take effect", 2, startedSession.getInt("speed"));
            assertEquals("The game must actually enter RUNNING state", "RUNNING", startedSession.getString("status"));
            assertTrue("The game clock must not remain paused after Play: " + startedSessionRaw,
                    !startedSession.getBoolean("paused"));
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=PLAY_ACTION_RESPONSIVE");

            // Keep a real 2x game session running for four wall-clock hours.
            // Poll every five seconds and require the Android 9 WebView to answer within
            // three seconds; this detects renderer hangs as well as a simulation that stops
            // advancing while JavaScript callbacks remain responsive.
            final String heartbeatScript =
                    "(function() {" +
                    " var sim = window.Omega && window.Omega.Simulation;" +
                    " var metrics = window.__OMEGA_DIAG__ && window.__OMEGA_DIAG__.metrics;" +
                    " if (!sim || !sim.clock || !metrics) return {error:'RUNTIME_DIAGNOSTICS_MISSING'};" +
                    " var worldState=sim.world&&sim.world.state||{};" +
                    " var session=worldState.simulation&&worldState.simulation.session||{};" +
                    " var lastResults=sim.lastTurnParticipantResults||(worldState.simulation&&worldState.simulation.lastTurnParticipantResults)||[];" +
                    " return {tick:Number(metrics.tick)||0, turn:Number(sim.clock.turn)||0," +
                    " status:String(sim.status||''), paused:!!sim.clock.paused," +
                    " lastError:String(sim.lastError||''), sessionStatus:String(session.status||'')," +
                    " sessionLastError:String(session.lastError||''), failedParticipant:String(session.failedParticipant||'')," +
                    " lastParticipants:lastResults.slice(-8).map(function(x){return {id:x.id||null,status:x.status||null,error:x.error||null};})," +
                    " speed:Number(sim.clock.speed)||0, now:Math.floor(performance.now())};" +
                    "})()";
            final String warmupHeartbeat = evaluate(instrumentation, webViewRef.get(), heartbeatScript, 15L);
            final JSONObject warmupState = new JSONObject(warmupHeartbeat);
            assertTrue("WebView heartbeat must expose simulation diagnostics: " + warmupHeartbeat,
                    !warmupState.has("error"));
            assertEquals("The soak test must run a real, active simulation; turn diagnostics: " + warmupHeartbeat, "RUNNING",
                    warmupState.getString("status"));
            assertTrue("The game clock must be active before the soak begins: " + warmupHeartbeat,
                    !warmupState.getBoolean("paused") && warmupState.getDouble("speed") > 0.0);
            android.util.Log.i("OMEGA_ANDROID_SMOKE", "STAGE=FOUR_HOUR_GAMEPLAY_SOAK_BEGIN");
            final long longRunStarted = SystemClock.elapsedRealtime();
            final long longRunDurationMs = TimeUnit.HOURS.toMillis(4L);
            final long maxTurnStallMs = TimeUnit.SECONDS.toMillis(45L);
            long lastProgressLog = 0L;
            long lastTurnProgressElapsedMs = 0L;
            long lastObservedTurn = warmupState.getLong("turn");
            final long startingTurn = lastObservedTurn;
            while (SystemClock.elapsedRealtime() - longRunStarted < longRunDurationMs) {
                final long elapsedMs = SystemClock.elapsedRealtime() - longRunStarted;
                final String heartbeat;
                final JSONObject heartbeatState;
                try {
                    heartbeat = evaluate(instrumentation, webViewRef.get(), heartbeatScript, 3L);
                    heartbeatState = new JSONObject(heartbeat);
                } catch (Throwable failure) {
                    android.util.Log.e(
                            "OMEGA_ANDROID_SMOKE",
                            "FOUR_HOUR_SOAK_FREEZE elapsed_ms=" + elapsedMs,
                            failure
                    );
                    throw new AssertionError(
                            "Android 9 WebView stopped answering during the four-hour continuous gameplay soak at " +
                                    elapsedMs + " ms; inspect FOUR_HOUR_SOAK_FREEZE diagnostics",
                            failure
                    );
                }
                assertTrue(
                        "Runtime diagnostics disappeared during the four-hour soak at " + elapsedMs +
                                " ms; response=" + heartbeat,
                        !heartbeatState.has("error")
                );
                assertEquals(
                        "Simulation must remain RUNNING throughout the four-hour soak at " + elapsedMs +
                                " ms; response=" + heartbeat,
                        "RUNNING",
                        heartbeatState.getString("status")
                );
                assertTrue(
                        "Simulation clock became paused/stopped during the four-hour soak at " + elapsedMs +
                                " ms; response=" + heartbeat,
                        !heartbeatState.getBoolean("paused") && heartbeatState.getDouble("speed") > 0.0
                );
                final long observedTurn = heartbeatState.getLong("turn");
                assertTrue("Simulation turn moved backwards at " + elapsedMs + " ms: " + heartbeat,
                        observedTurn >= lastObservedTurn);
                if (observedTurn > lastObservedTurn) {
                    lastObservedTurn = observedTurn;
                    lastTurnProgressElapsedMs = elapsedMs;
                } else {
                    assertTrue(
                            "Simulation clock made no progress for more than 45 seconds; elapsed_ms=" +
                                    elapsedMs + ", last_turn=" + lastObservedTurn + ", response=" + heartbeat,
                            elapsedMs - lastTurnProgressElapsedMs <= maxTurnStallMs
                    );
                }
                if (elapsedMs - lastProgressLog >= TimeUnit.MINUTES.toMillis(5L)) {
                    final Debug.MemoryInfo memoryInfo = new Debug.MemoryInfo();
                    Debug.getMemoryInfo(memoryInfo);
                    assertTrue(
                            "Game process PSS exceeded the 3 GB Android memory budget at " + elapsedMs +
                                    " ms: pss_kb=" + memoryInfo.getTotalPss(),
                            memoryInfo.getTotalPss() <= MAX_PROCESS_PSS_KB
                    );
                    android.util.Log.i(
                            "OMEGA_ANDROID_SMOKE",
                            "FOUR_HOUR_SOAK_HEARTBEAT elapsed_ms=" + elapsedMs +
                                    " pss_kb=" + memoryInfo.getTotalPss() +
                                    " response=" + heartbeat
                    );
                    lastProgressLog = elapsedMs;
                }
                SystemClock.sleep(5000L);
            }
            final long actualSoakDurationMs = SystemClock.elapsedRealtime() - longRunStarted;
            assertTrue("The test must complete at least four continuous hours; elapsed_ms=" + actualSoakDurationMs,
                    actualSoakDurationMs >= longRunDurationMs);
            assertTrue("The simulation turn must progress during the four-hour soak",
                    lastObservedTurn > startingTurn);
            android.util.Log.i(
                    "OMEGA_ANDROID_SMOKE",
                    "STAGE=FOUR_HOUR_GAMEPLAY_SOAK_PASS elapsed_ms=" + actualSoakDurationMs +
                            " starting_turn=" + startingTurn + " ending_turn=" + lastObservedTurn
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
