package com.omega.globalsupremecommander;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.SystemClock;
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

import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class NationalAccountsPerformanceInstrumentedTest {
    private static final String LOG_TAG = "OMEGA_ANDROID_PERFORMANCE";
    private static final long PAGE_BOOT_TIMEOUT_MS = 120_000L;
    private static final long SCRIPT_TIMEOUT_MS = 180_000L;

    @Test
    public void realAndroidWebViewNationalAccountsWorkloadStaysResponsiveAndBounded() throws Exception {
        final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        final Intent launch = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        final Activity activity = instrumentation.startActivitySync(launch);

        try {
            final long bootStartedAt = SystemClock.elapsedRealtime();
            WebView webView = waitForWebView(activity, PAGE_BOOT_TIMEOUT_MS);
            assertNotNull("OMEGA Android Activity did not create a WebView", webView);

            JSONObject ready = null;
            while (SystemClock.elapsedRealtime() - bootStartedAt < PAGE_BOOT_TIMEOUT_MS) {
                webView = findWebView(activity);
                if (webView != null) {
                    ready = evaluateObject(webView,
                            "(function(){var api=window.Omega&&window.Omega.NationalAccounts;" +
                            "return {ready:!!(api&&api.diagnostics&&api.diagnostics().ready)," +
                            "apiVersion:api&&api.VERSION||null," +
                            "androidOffline:!!window.OMEGA_ANDROID_OFFLINE," +
                            "playerCountry:(window.Omega&&window.Omega.Simulation&&" +
                            "window.Omega.Simulation.getPlayerCountryId&&window.Omega.Simulation.getPlayerCountryId())||null};})()");
                    if (ready != null && ready.optBoolean("ready", false)) break;
                }
                SystemClock.sleep(400L);
            }
            assertNotNull("National Accounts readiness probe did not return", ready);
            assertTrue("National Accounts runtime did not initialize in Android WebView: " + ready,
                    ready.optBoolean("ready", false));

            final JSONObject started = evaluateObject(webView, buildWorkloadScript());
            assertNotNull("Android WebView rejected the workload bootstrap", started);
            assertTrue("Workload did not start: " + started, started.optBoolean("started", false));

            final long workloadStartedAt = SystemClock.elapsedRealtime();
            JSONObject result = null;
            while (SystemClock.elapsedRealtime() - workloadStartedAt < SCRIPT_TIMEOUT_MS) {
                webView = findWebView(activity);
                if (webView != null) {
                    result = evaluateObject(webView,
                            "window.__OMEGA_NA_ANDROID_BENCH_RESULT__||null");
                    if (result != null && (result.has("status") || result.has("error"))) break;
                }
                SystemClock.sleep(250L);
            }
            assertNotNull("National Accounts Android workload did not finish within timeout", result);
            assertFalse("National Accounts Android workload threw: " + result.optString("error"), result.has("error"));
            assertEquals("Dirty-country workload did not commit its national account",
                    "CHECKPOINTED", result.optString("status"));
            assertEquals("One country must inspect exactly the configured bounded row window",
                    8692, result.optInt("sourceRowsScanned", -1));
            assertTrue("Inventory and production reads must cooperatively yield: " + result,
                    result.optInt("yieldCount", 0) >= 10);
            assertTrue("Maximum synchronous accounting slice exceeded the 4 ms target: " + result,
                    result.optDouble("maxSyncSegmentMs", Double.MAX_VALUE) <= 4.0d);
            assertEquals("Unchanged next-turn checkpoint must not rescan source ledgers",
                    "UNCHANGED", result.optString("unchangedStatus"));
            assertEquals("Unchanged checkpoint must scan zero source rows",
                    0, result.optInt("unchangedRowsScanned", -1));
            assertEquals("Country source event must mark exactly one account dirty",
                    1, result.optInt("dirtyAfterEvent", -1));
            assertEquals("Source event must refresh the country on the following turn",
                    "CHECKPOINTED", result.optString("refreshedStatus"));
            assertEquals("No dirty account should remain after successful refresh",
                    0, result.optInt("dirtyAfterRefresh", -1));
            assertTrue("WebView renderer frame gap exceeded 100 ms: " + result,
                    result.optDouble("maxAnimationFrameGapMs", Double.MAX_VALUE) <= 100.0d);

            android.util.Log.i(LOG_TAG, result.toString());
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }

    private static String buildWorkloadScript() {
        return "(function(){"
                + "window.__OMEGA_NA_ANDROID_BENCH_RESULT__=null;"
                + "(async function(){"
                + "var api=window.Omega&&window.Omega.NationalAccounts;"
                + "var finance=window.Omega&&window.Omega.FinanceMinistry;"
                + "if(!api||!finance)throw new Error('NATIONAL_ACCOUNTS_OR_FINANCE_UNAVAILABLE');"
                + "var profile=finance.resolveCountry('BGD');"
                + "if(!profile||profile.iso3!=='BGD')throw new Error('BGD_PROFILE_NOT_RESOLVED');"
                + "var root=window.Omega.Simulation&&window.Omega.Simulation.world&&window.Omega.Simulation.world.state;"
                + "if(!root)throw new Error('AUTHORITATIVE_WORLD_STATE_UNAVAILABLE');"
                + "var id=profile.iso3;"
                + "root.finance=root.finance||{};root.trade=root.trade||{};root.resource=root.resource||{};root.economy=root.economy||{};"
                + "var f=root.finance[id]=root.finance[id]||{};f.omegaFinance=f.omegaFinance||{};"
                + "f.omegaFinance.ledger=Array.from({length:1500},function(_,i){return {transactionId:'ANDROID-FIN-'+i,action:'EXPENSE',amountUsd:1};});"
                + "var tr=root.trade[id]=root.trade[id]||{};"
                + "tr.globalTradeLedger={settlements:Array.from({length:1400},function(_,i){return {settlementId:'ANDROID-SETTLED-'+i,status:'SETTLED'};})};"
                + "tr.importLedger=Array.from({length:1600},function(_,i){return {settlementId:'ANDROID-SETTLED-'+i,totalValue:1,currency:'BDT'};});"
                + "tr.exportLedger=Array.from({length:1600},function(_,i){return {settlementId:'ANDROID-SETTLED-'+i,totalValue:1,currency:'USD'};});"
                + "tr.importRequests=Array.from({length:1200},function(_,i){return {requestId:'ANDROID-REQUEST-'+i,status:i<1188?'REJECTED':'PENDING'};});"
                + "var rs=root.resource[id]=root.resource[id]||{};"
                + "rs.batches=Array.from({length:9000},function(_,i){return {batchId:'ANDROID-BATCH-'+i,resourceId:'IRON_ORE',unit:'TONNE',remainingQuantity:1};});"
                + "var e=root.economy[id]=root.economy[id]||{};"
                + "e.industrialRuntime={productionLedger:Array.from({length:4000},function(_,i){return {transactionId:'ANDROID-PRODUCTION-'+i,status:'COMPLETED'};})};"
                + "var baseTurn=Number(root.simulation&&root.simulation.turn||0);"
                + "var turn=baseTurn+5000;"
                + "var frame={last:0,maxGap:0,count:0,active:true};"
                + "function raf(now){if(frame.last)frame.maxGap=Math.max(frame.maxGap,now-frame.last);frame.last=now;frame.count++;if(frame.active)requestAnimationFrame(raf);}"
                + "requestAnimationFrame(raf);"
                + "var heapBefore=window.performance&&performance.memory?performance.memory.usedJSHeapSize:null;"
                + "var first=await api.processCountry(id,{turn:turn,state:root});"
                + "var unchanged=await api.processCountry(id,{turn:turn+1,state:root});"
                + "window.dispatchEvent(new CustomEvent('OMEGA_RESOURCE_ECONOMY_UPDATED',{detail:{countryId:id,turn:turn,inventoryDelta:{IRON_ORE:1}}}));"
                + "var dirty=api.diagnostics().dirtyCountryCount;"
                + "var refreshed=await api.processCountry(id,{turn:turn+2,state:root});"
                + "await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});"
                + "frame.active=false;"
                + "var d=api.diagnostics();"
                + "window.__OMEGA_NA_ANDROID_BENCH_RESULT__={"
                + "status:first.status,sourceRowsScanned:first.sourceRowsScanned,yieldCount:d.yieldCount,"
                + "maxSyncSegmentMs:d.maxSyncSegmentMs,totalSyncSegmentMs:d.totalSyncSegmentMs,"
                + "processElapsedMs:first.elapsedMs,unchangedStatus:unchanged.status,"
                + "unchangedRowsScanned:unchanged.sourceRowsScanned,dirtyAfterEvent:dirty,"
                + "refreshedStatus:refreshed.status,dirtyAfterRefresh:d.dirtyCountryCount,"
                + "maxAnimationFrameGapMs:frame.maxGap,animationFrameCount:frame.count,"
                + "heapBeforeBytes:heapBefore,heapAfterBytes:window.performance&&performance.memory?performance.memory.usedJSHeapSize:null,"
                + "apiVersion:api.VERSION,webViewUserAgent:navigator.userAgent};"
                + "})().catch(function(error){window.__OMEGA_NA_ANDROID_BENCH_RESULT__={error:String(error&&error.stack||error)};});"
                + "return {started:true};})()";
    }

    private static WebView waitForWebView(Activity activity, long timeoutMs) throws Exception {
        final long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        while (SystemClock.elapsedRealtime() < deadline) {
            final WebView webView = findWebView(activity);
            if (webView != null) return webView;
            SystemClock.sleep(150L);
        }
        return null;
    }

    private static WebView findWebView(Activity activity) {
        final AtomicReference<WebView> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            final View content = activity.findViewById(android.R.id.content);
            result.set(findWebViewRecursive(content));
        });
        return result.get();
    }

    private static WebView findWebViewRecursive(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            final ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                final WebView found = findWebViewRecursive(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private static JSONObject evaluateObject(WebView webView, String script) throws Exception {
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<String> response = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(
                () -> webView.evaluateJavascript(script, value -> {
                    response.set(value);
                    latch.countDown();
                })
        );
        assertTrue("Timed out waiting for Android WebView JavaScript evaluation",
                latch.await(30L, TimeUnit.SECONDS));
        final String raw = response.get();
        if (raw == null || "null".equals(raw) || "undefined".equals(raw)) return null;
        return new JSONObject(raw);
    }
}
