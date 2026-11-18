package com.omega.globalsupremecommander;

import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Debug;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Runs the packaged OMEGA APK inside Android 9's real WebView implementation.
 * The high-water fixture is temporary and every source collection is restored
 * before this Activity closes.
 */
@RunWith(AndroidJUnit4.class)
public final class OmegaNationalAccountsAndroidPerformanceTest {
    private static final long PAGE_READY_TIMEOUT_MS = 120_000L;
    private static final long SCRIPT_TIMEOUT_MS = 120_000L;

    @Test
    public void androidNineWebViewKeepsNationalAccountsWorkBounded() throws Exception {
        final android.app.Instrumentation instrumentation =
                InstrumentationRegistry.getInstrumentation();
        final Application application = (Application)
                instrumentation.getTargetContext().getApplicationContext();
        final long pssBeforeKb = Debug.getPss();
        final Activity activity = launchMainActivity(instrumentation, application);
        assertNotNull("MainActivity did not launch", activity);
        try {
            final AtomicReference<WebView> webViewReference = new AtomicReference<>();
            instrumentation.runOnMainSync(() -> webViewReference.set(
                    findWebView(activity.findViewById(android.R.id.content))));
            final WebView webView = webViewReference.get();
            assertNotNull("MainActivity did not create its WebView", webView);

            final long readyDeadline = SystemClock.elapsedRealtime() + PAGE_READY_TIMEOUT_MS;
            String ready = "WAIT";
            while (SystemClock.elapsedRealtime() < readyDeadline) {
                ready = evaluateString(webView,
                        "(function(){try{var a=window.Omega&&window.Omega.NationalAccounts;" +
                                "return a&&a.diagnostics&&a.diagnostics().ready?'READY':'WAIT';" +
                                "}catch(e){return 'WAIT';}})()",
                        PAGE_READY_TIMEOUT_MS);
                if ("READY".equals(ready)) break;
                Thread.sleep(250L);
            }
            assertEquals("Packaged National Accounts runtime did not become ready", "READY", ready);

            final String resultJson = runBenchmark(webView);
            final JSONObject result = new JSONObject(resultJson);
            System.out.println("OMEGA_ANDROID_PERFORMANCE_RESULT_RAW=" + result);
            assertEquals("OK", result.optString("status"));
            assertEquals(8_692, result.getJSONObject("workload").getInt("sourceRowsScanned"));
            assertTrue("The dirty-country workload must yield to Android WebView",
                    result.getInt("yieldCount") >= 10);
            assertEquals("UNCHANGED", result.getJSONObject("unchanged").optString("status"));
            assertEquals(0, result.getJSONObject("unchanged").getInt("sourceRowsScanned"));

            final JSONObject timing = result.getJSONObject("timing");
            assertTrue("p95 synchronous accounting cost exceeded 5.6 ms: " +
                            timing.optDouble("p95SyncCpuMs"),
                    timing.optDouble("p95SyncCpuMs") <= 5.6d);
            assertTrue("A synchronous accounting segment exceeded 4 ms: " +
                            timing.optDouble("maxSyncSegmentMs"),
                    timing.optDouble("maxSyncSegmentMs") <= 4.0d);
            assertTrue("WebView renderer did not keep producing frames",
                    timing.optInt("frameCount") >= 5);
            assertTrue("A frame gap exceeded 250 ms: " + timing.optDouble("maxFrameGapMs"),
                    timing.optDouble("maxFrameGapMs") <= 250d);

            final long pssAfterKb = Debug.getPss();
            result.put("android", new JSONObject()
                    .put("sdk", android.os.Build.VERSION.SDK_INT)
                    .put("manufacturer", android.os.Build.MANUFACTURER)
                    .put("model", android.os.Build.MODEL)
                    .put("pssBeforeKb", pssBeforeKb)
                    .put("pssAfterKb", pssAfterKb)
                    .put("pssDeltaKb", pssAfterKb - pssBeforeKb));
            System.out.println("OMEGA_ANDROID_PERFORMANCE_RESULT=" + result);
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static Activity launchMainActivity(
            android.app.Instrumentation instrumentation, Application application) throws Exception {
        final CountDownLatch resumed = new CountDownLatch(1);
        final AtomicReference<Activity> activityReference = new AtomicReference<>();
        final Application.ActivityLifecycleCallbacks callbacks = new Application.ActivityLifecycleCallbacks() {
            @Override public void onActivityCreated(Activity activity, android.os.Bundle state) {}
            @Override public void onActivityStarted(Activity activity) {}
            @Override public void onActivityPaused(Activity activity) {}
            @Override public void onActivityStopped(Activity activity) {}
            @Override public void onActivitySaveInstanceState(Activity activity, android.os.Bundle state) {}
            @Override public void onActivityDestroyed(Activity activity) {}
            @Override public void onActivityResumed(Activity activity) {
                if (activity instanceof MainActivity) {
                    activityReference.set(activity);
                    resumed.countDown();
                }
            }
        };
        application.registerActivityLifecycleCallbacks(callbacks);
        try {
            System.out.println("OMEGA_ANDROID_TEST_STAGE=activity_launch_requested");
            instrumentation.runOnMainSync(() -> {
                final Intent intent = new Intent(application, MainActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                application.startActivity(intent);
            });
            assertTrue("MainActivity did not reach RESUMED within the startup timeout",
                    resumed.await(PAGE_READY_TIMEOUT_MS, TimeUnit.MILLISECONDS));
            System.out.println("OMEGA_ANDROID_TEST_STAGE=activity_resumed");
            return activityReference.get();
        } finally {
            application.unregisterActivityLifecycleCallbacks(callbacks);
        }
    }

    private static String runBenchmark(WebView webView) throws Exception {
        final String script = """
            (function(){
              window.__OMEGA_ANDROID_PERF_RESULT = null;
              (async function(){
                const api = window.Omega && window.Omega.NationalAccounts;
                const financeApi = window.OmegaFinanceMinistry ||
                  (window.Omega && window.Omega.FinanceMinistry);
                if (!api || !financeApi) throw new Error('NATIONAL_ACCOUNTS_OR_FINANCE_API_UNAVAILABLE');
                const profile = financeApi.getPlayerCountry && financeApi.getPlayerCountry();
                const countryId = String(profile && (profile.iso3 || profile.countryCode) || '').toUpperCase();
                if (!/^[A-Z]{3}$/.test(countryId)) throw new Error('PLAYER_COUNTRY_PROFILE_UNAVAILABLE');
                // Match Finance runtime's canonical root selection: after Finance init,
                // prefer the candidate with a populated Economy root. Simulation.world.state
                // is not guaranteed to be the authoritative object when legacy aliases coexist.
                const stateCandidates = [
                  window.Omega && window.Omega.Simulation &&
                    window.Omega.Simulation.world && window.Omega.Simulation.world.state,
                  window.Omega && window.Omega.World && window.Omega.World.state,
                  window.Game && window.Game.state,
                  window.gameState
                ].filter(value => value && typeof value === 'object');
                const state = stateCandidates.find(value =>
                  value.economy && typeof value.economy === 'object' &&
                  Object.keys(value.economy).length > 0) || stateCandidates[0];
                if (!state) throw new Error('AUTHORITATIVE_WORLD_STATE_UNAVAILABLE');
                const slots = [];
                function replaceSlot(object, key, value) {
                  slots.push({object, key, had:Object.prototype.hasOwnProperty.call(object,key), value:object[key]});
                  object[key] = value;
                }
                const aliases = [countryId, profile.iso3, profile.countryCode,
                  profile.economyKey, profile.populationKey, profile.name]
                  .filter(Boolean).map(v => String(v).toUpperCase().replace(/[^A-Z0-9]/g,''));
                function bucket(domain, create) {
                  let section = state[domain];
                  if (!section && create) {
                    replaceSlot(state, domain, {});
                    section = state[domain];
                  }
                  if (!section) return null;
                  for (const key of [countryId, profile.iso3, profile.countryCode,
                    profile.economyKey, profile.populationKey, profile.name].filter(Boolean)) {
                    if (section[key] && typeof section[key] === 'object') return section[key];
                  }
                  const key = Object.keys(section).find(k =>
                    aliases.includes(String(k).toUpperCase().replace(/[^A-Z0-9]/g,'')));
                  if (key) return section[key];
                  if (!create) return null;
                  replaceSlot(section,countryId,{});
                  return section[countryId];
                }
                const finance = bucket('finance', false);
                const trade = bucket('trade', true);
                const resource = bucket('resource', true);
                const economy = bucket('economy', false);
                if (!finance || !finance.omegaFinance || !economy)
                  throw new Error('AUTHORITATIVE_COUNTRY_BUCKET_UNAVAILABLE');
                if (!economy.industrialRuntime) replaceSlot(economy,'industrialRuntime',{});
                const financeModel = finance.omegaFinance;
                const industrialRuntime = economy.industrialRuntime;
                const oldAccount = economy.nationalAccounts;
                const turn = Math.max(Number(state.simulation && state.simulation.turn || 0),
                  Number(oldAccount && oldAccount.lastProcessedTurn || 0)) + 1;
                const make = (count, factory) => Array.from({length:count}, (_, index) => factory(index));
                const settlementRows = make(512, i => ({settlementId:'ANDROID-PERF-S-'+i,status:'SETTLED',turn}));
                replaceSlot(financeModel,'ledger',make(500,i => ({
                  transactionId:'ANDROID-PERF-F-'+i,action:'EXPENSE',amountUsd:1
                })));
                replaceSlot(trade,'globalTradeLedger',{settlements:settlementRows});
                replaceSlot(trade,'importLedger',make(512,i => ({
                  settlementId:'ANDROID-PERF-S-'+i,totalValue:1,currency:'BDT'
                })));
                replaceSlot(trade,'exportLedger',make(512,i => ({
                  settlementId:'ANDROID-PERF-S-'+i,totalValue:1,currency:'USD'
                })));
                replaceSlot(trade,'importRequests',make(512,i => ({
                  requestId:'ANDROID-PERF-R-'+i,status:'PENDING'
                })));
                replaceSlot(resource,'batches',make(4096,i => ({
                  batchId:'ANDROID-PERF-B-'+i,resourceId:'IRON_ORE',unit:'TONNE',remainingQuantity:1
                })));
                replaceSlot(industrialRuntime,'productionLedger',make(2048,i => ({
                  transactionId:'ANDROID-PERF-P-'+i,status:'COMPLETED',outputQuantities:{IRON:1}
                })));

                const samples = [];
                const frameTimes = [];
                let frameSampling = true;
                function sampleFrame(time) {
                  frameTimes.push(Number(time));
                  if (frameSampling) window.requestAnimationFrame(sampleFrame);
                }
                window.requestAnimationFrame(sampleFrame);
                try {
                  window.__OMEGA_ANDROID_PERF_DIAGNOSTICS = [];
                  function recordPerfFailure(stage, error, detail) {
                    if (window.__OMEGA_ANDROID_PERF_DIAGNOSTICS.length < 20) {
                      window.__OMEGA_ANDROID_PERF_DIAGNOSTICS.push({
                        stage:stage,
                        detail:detail || null,
                        error:String(error && error.message || error || ''),
                        stack:String(error && error.stack || '')
                      });
                    }
                  }
                  const originalDefineProperties = Object.defineProperties;
                  const originalDefineProperty = Object.defineProperty;
                  Object.defineProperties = function(target, descriptors) {
                    const receiver=this;
                    if (target === null || (typeof target !== 'object' && typeof target !== 'function')) {
                      recordPerfFailure('Object.defineProperties.invalidTarget', null,
                        {targetType:typeof target,targetValue:String(target),receiverType:typeof receiver,
                         receiverIsObjectConstructor:receiver===Object});
                    }
                    try {
                      return originalDefineProperties.apply(receiver,arguments);
                    } catch (error) {
                      recordPerfFailure('Object.defineProperties.throw',error,
                        {targetType:typeof target,receiverType:typeof receiver,
                         receiverIsObjectConstructor:receiver===Object});
                      throw error;
                    }
                  };
                  Object.defineProperty = function(target, property, descriptor) {
                    const receiver=this;
                    if (target === null || (typeof target !== 'object' && typeof target !== 'function')) {
                      recordPerfFailure('Object.defineProperty.invalidTarget', null,
                        {targetType:typeof target,targetValue:String(target),property:String(property),
                         receiverType:typeof receiver,receiverIsObjectConstructor:receiver===Object});
                    }
                    try {
                      return originalDefineProperty.apply(receiver,arguments);
                    } catch (error) {
                      recordPerfFailure('Object.defineProperty.throw',error,
                        {targetType:typeof target,property:String(property),receiverType:typeof receiver,
                         receiverIsObjectConstructor:receiver===Object});
                      throw error;
                    }
                  };
                  const interopApi = window.OmegaMinistryInteroperability ||
                    (window.Omega && window.Omega.MinistryInteroperability);
                  const interopInstance = interopApi && interopApi.instance;
                  const originalStateTransactionFactory = interopInstance && interopInstance.stateTransaction;
                  if (interopInstance && originalStateTransactionFactory &&
                      typeof originalStateTransactionFactory.create === 'function') {
                    interopInstance.stateTransaction = {
                      create:function() {
                        let transaction;
                        try {
                          transaction = originalStateTransactionFactory.create.apply(
                            originalStateTransactionFactory,arguments);
                        } catch (error) {
                          recordPerfFailure('stateTransaction.create',error);
                          throw error;
                        }
                        recordPerfFailure('stateTransaction.created',null,{
                          transactionType:typeof transaction,
                          stateType:typeof (transaction && transaction.state),
                          hasState:!!(transaction && transaction.state),
                          ownerMinistry:transaction && transaction.ownerMinistry,
                          countryId:transaction && transaction.countryId,
                          turn:transaction && transaction.turn
                        });
                        ['get','set','commit','rollback'].forEach(function(method) {
                          if (!transaction || typeof transaction[method] !== 'function') return;
                          const originalMethod = transaction[method];
                          transaction[method] = function() {
                            try {
                              return originalMethod.apply(this,arguments);
                            } catch (error) {
                              recordPerfFailure('stateTransaction.'+method,error);
                              throw error;
                            }
                          };
                        });
                        return transaction;
                      }
                    };
                  }
                  function restorePerfDiagnostics() {
                    try { Object.defineProperties = originalDefineProperties; } catch (_) {}
                    try { Object.defineProperty = originalDefineProperty; } catch (_) {}
                    try {
                      if (interopInstance) interopInstance.stateTransaction = originalStateTransactionFactory;
                    } catch (_) {}
                  }
                  for (let index=0; index<6; index++) {
                    const nextTurn = turn + index;
                    window.dispatchEvent(new CustomEvent('OMEGA_RESOURCE_INVENTORY_CHANGED',{
                      detail:{countryId,resourceId:'IRON_ORE',delta:1,simulationTurn:nextTurn}
                    }));
                    const beforeCpu = Number(api.diagnostics().totalSyncSegmentMs || 0);
                    const start = performance.now();
                    const checkpoint = await api.processCountry(countryId,{turn:nextTurn,state});
                    const wallMs = performance.now() - start;
                    const afterCpu = Number(api.diagnostics().totalSyncSegmentMs || 0);
                    if (checkpoint.status !== 'CHECKPOINTED') {
                      const commandId='NATIONAL-ACCOUNTS-'+countryId+'-T'+nextTurn;
                      const commandRecord=interopApi && typeof interopApi.getCommand==='function'
                        ?interopApi.getCommand(commandId):null;
                      throw new Error('CHECKPOINT_FAILED:'+checkpoint.status+':'+(checkpoint.reason||'UNKNOWN')+
                        ':ERROR_STACK:'+String(checkpoint.errorStack||'').slice(0,5000)+
                        ':DIAGNOSTICS:'+JSON.stringify(window.__OMEGA_ANDROID_PERF_DIAGNOSTICS||[])+
                        ':COMMAND:'+JSON.stringify(commandRecord||null));
                    }
                    samples.push({
                      wallMs:Number(wallMs.toFixed(3)),
                      syncCpuMs:Number(Math.max(0,afterCpu-beforeCpu).toFixed(3)),
                      sourceRowsScanned:checkpoint.sourceRowsScanned
                    });
                  }
                  const unchanged = await api.processCountry(countryId,{turn:turn+6,state});
                  await new Promise(resolve => window.requestAnimationFrame(
                    () => window.requestAnimationFrame(resolve)));
                  frameSampling = false;
                  const frameGaps = frameTimes.slice(1).map((value,index)=>value-frameTimes[index]);
                  const sortedCpu = samples.map(row=>row.syncCpuMs).sort((a,b)=>a-b);
                  const p95 = sortedCpu[Math.min(sortedCpu.length-1,Math.ceil(sortedCpu.length*0.95)-1)] || 0;
                  const diagnostics = api.diagnostics();
                  const workload = api.getSnapshot(countryId).workload;
                  const result = {
                    status:'OK',countryId,iterations:samples.length,turn,
                    workload,sourceRowsScanned:samples[0].sourceRowsScanned,yieldCount:diagnostics.yieldCount,
                    samples,
                    unchanged:{status:unchanged.status,sourceRowsScanned:unchanged.sourceRowsScanned || 0},
                    timing:{
                      p95SyncCpuMs:Number(p95.toFixed(3)),
                      maxSyncSegmentMs:Number(Number(diagnostics.maxSyncSegmentMs||0).toFixed(3)),
                      maxCheckpointWallMs:Number(Math.max(...samples.map(row=>row.wallMs)).toFixed(3)),
                      maxFrameGapMs:Number((Math.max(0,...frameGaps)).toFixed(3)),
                      frameCount:frameTimes.length,
                      frameGapsOver32ms:frameGaps.filter(gap=>gap>32).length
                    }
                  };
                  window.__OMEGA_ANDROID_PERF_RESULT = result;
                } finally {
                  for (let index=slots.length-1; index>=0; index--) {
                    const slot=slots[index];
                    if (slot.had) slot.object[slot.key]=slot.value;
                    else delete slot.object[slot.key];
                  }
                  if (oldAccount === undefined) delete economy.nationalAccounts;
                  else economy.nationalAccounts = oldAccount;
                  restorePerfDiagnostics();
                  window.dispatchEvent(new CustomEvent('OMEGA_RESOURCE_INVENTORY_CHANGED',{
                    detail:{countryId,resourceId:'IRON_ORE',restored:true}
                  }));
                }
              })().catch(error => {
                window.__OMEGA_ANDROID_PERF_RESULT = {status:'ERROR',error:String(error && error.stack || error)};
              });
              return 'STARTED';
            })()
            """;
        final String started = evaluateString(webView, script, 10_000L);
        assertEquals("STARTED", started);
        final long deadline = SystemClock.elapsedRealtime() + SCRIPT_TIMEOUT_MS;
        while (SystemClock.elapsedRealtime() < deadline) {
            final String value = evaluateString(webView,
                    "window.__OMEGA_ANDROID_PERF_RESULT ? JSON.stringify(window.__OMEGA_ANDROID_PERF_RESULT) : null",
                    10_000L);
            if (value != null && !"null".equals(value)) return value;
            Thread.sleep(100L);
        }
        throw new AssertionError("Android WebView performance workload did not finish within timeout");
    }

    private static String evaluateString(WebView webView, String script, long timeoutMs) throws Exception {
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<String> value = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                webView.evaluateJavascript(script, result -> {
                    value.set(result);
                    latch.countDown();
                }));
        assertTrue("Timed out waiting for WebView JavaScript evaluation",
                latch.await(timeoutMs, TimeUnit.MILLISECONDS));
        final String raw = value.get();
        if (raw == null || "null".equals(raw)) return null;
        try {
            final Object parsed = new JSONTokener(raw).nextValue();
            return parsed instanceof String ? (String) parsed : raw;
        } catch (JSONException ignored) {
            return raw;
        }
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (!(view instanceof ViewGroup)) return null;
        final ViewGroup group = (ViewGroup) view;
        for (int index = 0; index < group.getChildCount(); index++) {
            final WebView match = findWebView(group.getChildAt(index));
            if (match != null) return match;
        }
        return null;
    }
}
