#!/usr/bin/env bash
set -euo pipefail

artifact_dir="${RUNNER_TEMP:?RUNNER_TEMP must be set}/omega-android9-smoke"
mkdir -p "$artifact_dir"
logcat_pid=""

cleanup() {
  if [[ -n "$logcat_pid" ]]; then
    kill "$logcat_pid" >/dev/null 2>&1 || true
    wait "$logcat_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

timeout 10s adb shell cmd webviewupdate set-webview-implementation com.android.chrome \
  >"$artifact_dir/webview-provider-select.txt" 2>&1 || true
timeout 10s adb shell dumpsys webviewupdate \
  | tee "$artifact_dir/webview-provider.txt" || true
timeout 10s adb shell dumpsys package com.android.chrome \
  | grep -m1 -E "versionName=|versionCode=" \
  >"$artifact_dir/chrome-version.txt" 2>&1 || true

wait_for_api28() {
  local poll state boot sdk
  poll=1
  while [[ "$poll" -le 45 ]]; do
    state="$(adb get-state 2>/dev/null | tr -d "\r" || true)"
    if [[ "$state" == "device" ]]; then
      boot="$(timeout 5s adb shell getprop sys.boot_completed 2>/dev/null | tr -d "\r" || true)"
      sdk="$(timeout 5s adb shell getprop ro.build.version.sdk 2>/dev/null | tr -d "\r" || true)"
      if [[ "$boot" == "1" && "$sdk" == "28" ]]; then
        echo "API 28 emulator online and fully booted (poll $poll)"
        return 0
      fi
    elif [[ "$state" == "offline" ]]; then
      adb reconnect offline >/dev/null 2>&1 || true
    fi
    sleep 2
    poll=$((poll + 1))
  done
  echo "ERROR: API 28 emulator did not become ready" >&2
  adb devices -l >&2 || true
  return 1
}

wait_for_api28
adb shell getprop ro.build.version.sdk | tee "$artifact_dir/api-level.txt"
adb devices -l | tee "$artifact_dir/adb-devices-before.txt"

# Capture WebView and instrumentation messages while Gradle is running. The old
# script only dumped logcat after Gradle returned, so a hung test lost its best
# diagnostics when the job was cancelled.
adb logcat -c >/dev/null 2>&1 || true
adb logcat -v threadtime \
  "OMEGA_ANDROID_SMOKE:I" \
  "OMEGA_WEB_DIAGNOSTICS:D" \
  "chromium:E" \
  "*:E" >"$artifact_dir/logcat-live.txt" 2>&1 &
logcat_pid=$!

attempt=1
max_attempts=3
while [[ "$attempt" -le "$max_attempts" ]]; do
  log_file="$artifact_dir/gradle-attempt-$attempt.log"
  echo "Offline gameplay instrumentation attempt $attempt/$max_attempts"
  # Android instrumentation must not be allowed to occupy the workflow forever.
  # The Java test has bounded Activity/WebView waits; this is a final process-level
  # guard that still leaves time for logs and artifact upload before the job limit.
  if timeout --signal=TERM --kill-after=20s 10m \
      gradle -p android connectedDebugAndroidTest --no-daemon >"$log_file" 2>&1; then
    cat "$log_file"
    echo "PASS: API 28 offline gameplay instrumentation completed"
    exit 0
  else
    test_exit=$?
    cat "$log_file"
    echo "Instrumentation attempt failed with exit code $test_exit"
  fi

  adb logcat -d -v threadtime >"$artifact_dir/logcat-attempt-$attempt.txt" 2>&1 || true
  adb devices -l >"$artifact_dir/adb-devices-after-$attempt.txt" 2>&1 || true
  for report_dir in android/app/build/outputs/androidTest-results android/app/build/reports/androidTests; do
    if [[ -d "$report_dir" ]]; then
      find "$report_dir" -type f -print
      find "$report_dir" -type f -name "*.xml" -exec cat {} \;
    fi
  done

  if [[ "$test_exit" -eq 124 || "$test_exit" -eq 137 ]]; then
    echo "ERROR: Android instrumentation exceeded the 10-minute hard deadline; live logcat and Gradle output are saved." >&2
    exit "$test_exit"
  fi

  if ! grep -Eiq "No compatible devices connected|Unknown API Level|ShellCommandUnresponsiveException|adb: device offline|device offline|Device offline" "$log_file"; then
    echo "ERROR: instrumentation failed for a non-transport reason; diagnostics are saved" >&2
    exit "$test_exit"
  fi
  if [[ "$attempt" -ge "$max_attempts" ]]; then
    echo "ERROR: ADB/device discovery failed after $max_attempts attempts" >&2
    exit "$test_exit"
  fi

  echo "Transient ADB failure; restarting ADB and rechecking API 28"
  adb kill-server >/dev/null 2>&1 || true
  adb start-server
  adb reconnect offline >/dev/null 2>&1 || true
  wait_for_api28 || exit "$test_exit"
  attempt=$((attempt + 1))
done
