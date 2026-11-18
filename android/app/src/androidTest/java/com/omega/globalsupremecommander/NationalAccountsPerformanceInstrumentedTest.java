package com.omega.globalsupremecommander;

import android.content.pm.PackageInfo;
import android.os.Build;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

/**
 * Verifies the Android 9 system WebView provider used by the separate
 * end-to-end National Accounts workload test.
 *
 * This test deliberately does not launch MainActivity or mutate game state.
 */
@RunWith(AndroidJUnit4.class)
public final class NationalAccountsPerformanceInstrumentedTest {
    @Test
    public void androidNineWebViewProviderIsInstalledAndVersioned() throws Exception {
        assertEquals("The performance emulator must exercise Android 9 / API 28",
                28, Build.VERSION.SDK_INT);

        final PackageInfo provider = WebView.getCurrentWebViewPackage();
        assertNotNull("Android 9 did not expose a system WebView provider", provider);
        assertNotNull("System WebView provider version is missing", provider.versionName);

        final JSONObject report = new JSONObject()
                .put("sdk", Build.VERSION.SDK_INT)
                .put("release", Build.VERSION.RELEASE)
                .put("manufacturer", Build.MANUFACTURER)
                .put("model", Build.MODEL)
                .put("webViewPackage", provider.packageName)
                .put("webViewVersion", provider.versionName);
        android.util.Log.i("OMEGA_ANDROID_PERFORMANCE", report.toString());
    }
}
