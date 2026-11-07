#!/usr/bin/env bash
set -euo pipefail

artifact_dir="${RUNNER_TEMP:?RUNNER_TEMP must be set}/omega-android9-smoke"
mkdir -p "$artifact_dir"

sdk_level="$(timeout 10s adb shell getprop ro.build.version.sdk | tr -d "\r")"
if [[ "$sdk_level" != "28" ]]; then
  echo "ERROR: expected Android 9 / API 28, found API $sdk_level" >&2
  exit 1
fi

device_state="$(timeout 10s adb get-state | tr -d "\r")"
if [[ "$device_state" != "device" ]]; then
  echo "ERROR: Android emulator is not online (state: $device_state)" >&2
  adb devices -l >&2 || true
  exit 1
fi

webview_provider=""
for candidate in com.android.chrome com.android.webview; do
  if timeout 10s adb shell pm path "$candidate" 2>/dev/null \
      | tr -d "\r" | grep -q "^package:"; then
    webview_provider="$candidate"
    break
  fi
done

if [[ -z "$webview_provider" ]]; then
  timeout 10s adb shell dumpsys webviewupdate \
    | tee "$artifact_dir/webview-provider.txt" || true
  echo "ERROR: Android 9 emulator has no installed WebView provider" >&2
  exit 1
fi

printf "%s\n" "$sdk_level" >"$artifact_dir/api-level.txt"
printf "%s\n" "$webview_provider" >"$artifact_dir/webview-provider.txt"
timeout 10s adb shell cmd webviewupdate set-webview-implementation "$webview_provider" \
  >"$artifact_dir/webview-provider-selection.txt" 2>&1 || true

adb logcat -c >/dev/null 2>&1 || true
adb logcat -v threadtime \
  "OMEGA_WEB_DIAGNOSTICS:D" \
  "ActivityManager:E" \
  "AndroidRuntime:E" \
  "Instrumentation:I" \
  "TestRunner:I" \
  "chromium:E" \
  "*:E" >"$artifact_dir/logcat-live.txt" 2>&1 &
logcat_pid=$!

cleanup() {
  if [[ -n "${logcat_pid:-}" ]]; then
    kill "$logcat_pid" >/dev/null 2>&1 || true
    wait "$logcat_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# The Java instrumentation method has its own 60-second hard limit.
# This larger guard covers Gradle startup, APK installation and test execution.
set +e
timeout --signal=TERM --kill-after=15s 7m \
  gradle -p android connectedDebugAndroidTest --no-daemon --console=plain \
  >"$artifact_dir/gradle.log" 2>&1
test_exit=$?
set -e

cat "$artifact_dir/gradle.log"
adb logcat -d -v threadtime >"$artifact_dir/logcat-final.txt" 2>&1 || true

for report_dir in android/app/build/outputs/androidTest-results android/app/build/reports/androidTests; do
  if [[ -d "$report_dir" ]]; then
    find "$report_dir" -type f -print
  fi
done

if [[ "$test_exit" -ne 0 ]]; then
  echo "ERROR: one-minute Android 9 launch smoke failed (Gradle exit $test_exit)." >&2
  exit "$test_exit"
fi

echo "PASS: Android 9 bundled offline launch smoke completed."
