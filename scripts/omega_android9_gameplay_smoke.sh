#!/usr/bin/env bash
set -euo pipefail

repo_root="$(pwd)"
evidence_dir="$repo_root/android/app/build/omega-android-gameplay-evidence"
mkdir -p "$evidence_dir"

echo "ANDROID_API_LEVEL=$(adb shell getprop ro.build.version.sdk | tr -d '\r')" | tee "$evidence_dir/api-level.txt"
adb devices -l | tee "$evidence_dir/adb-devices-before.txt"
adb shell dumpsys webviewupdate > "$evidence_dir/webview-provider.txt" 2>&1 || true

# Keep emulator/WebView diagnostics alive while Gradle is waiting on instrumentation.
adb logcat -c >/dev/null 2>&1 || true
adb logcat -v threadtime \
  "OMEGA_ANDROID_SMOKE:I" \
  "OMEGA_WEB_DIAGNOSTICS:D" \
  "ActivityManager:E" \
  "AndroidRuntime:E" \
  "Instrumentation:I" \
  "TestRunner:I" \
  "chromium:E" \
  "*:S" > "$evidence_dir/logcat-live.txt" 2>&1 &
logcat_pid=$!

cleanup() {
  if [[ -n "${logcat_pid:-}" ]]; then
    kill "$logcat_pid" >/dev/null 2>&1 || true
    wait "$logcat_pid" >/dev/null 2>&1 || true
  fi
  adb logcat -d -v threadtime > "$evidence_dir/logcat-final.txt" 2>&1 || true
  adb shell dumpsys activity activities > "$evidence_dir/activity-final.txt" 2>&1 || true
  adb devices -l > "$evidence_dir/adb-devices-final.txt" 2>&1 || true
}
trap cleanup EXIT

set +e
timeout --signal=TERM --kill-after=20s 12m \
  gradle -p android connectedDebugAndroidTest --no-daemon --console=plain --stacktrace \
  2>&1 | tee "$evidence_dir/gradle-connected-test.log"
gradle_exit=${PIPESTATUS[0]}
set -e
printf '%s\n' "$gradle_exit" > "$evidence_dir/gradle-exit-code.txt"
exit "$gradle_exit"
