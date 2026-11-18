#!/usr/bin/env python3
"""Run the packaged OMEGA APK WebView instrumentation and preserve emulator diagnostics."""
from __future__ import annotations

import os
import signal
import subprocess
import sys
from pathlib import Path
from threading import Thread

ARTIFACT_DIR = Path("android-performance-artifacts")
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
GRADLE_LOG = ARTIFACT_DIR / "gradle-android9.log"


def capture(command: list[str], destination: Path, timeout: int = 30) -> None:
    try:
        with destination.open("w", encoding="utf-8", errors="replace") as stream:
            subprocess.run(
                command,
                stdout=stream,
                stderr=subprocess.STDOUT,
                timeout=timeout,
                check=False,
            )
    except (OSError, subprocess.TimeoutExpired) as error:
        destination.write_text(
            "DIAGNOSTIC_CAPTURE_FAILED: " + repr(error) + "\n",
            encoding="utf-8",
        )


def main() -> int:
    with GRADLE_LOG.open("w", encoding="utf-8", errors="replace") as log:
        try:
            process = subprocess.Popen(
                ["gradle", "-p", "android", "connectedDebugAndroidTest", "--no-daemon"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                start_new_session=True,
            )
        except OSError as error:
            log.write("GRADLE_START_FAILED: " + repr(error) + "\n")
            capture(["adb", "devices", "-l"], ARTIFACT_DIR / "adb-devices.txt", 15)
            return 127

        def stream_output() -> None:
            if process.stdout is None:
                return
            for line in process.stdout:
                log.write(line)
                log.flush()
                print(line, end="", flush=True)

        reader = Thread(target=stream_output, daemon=True)
        reader.start()
        try:
            exit_code = process.wait(timeout=1200)
        except subprocess.TimeoutExpired:
            print("OMEGA_ANDROID_GRADLE_TIMEOUT=1200_SECONDS", flush=True)
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except OSError:
                    pass
            exit_code = 124
        reader.join(timeout=30)

    # Capture diagnostics while the emulator is alive, before the emulator action tears it down.
    capture(["adb", "devices", "-l"], ARTIFACT_DIR / "adb-devices.txt", 15)
    raw_logcat = ARTIFACT_DIR / "android9-logcat-raw.log"
    capture(["adb", "logcat", "-d", "-t", "10000"], raw_logcat, 30)

    filtered_log = ARTIFACT_DIR / "android9-webview.log"
    tokens = (
        "OMEGA_ANDROID_PERFORMANCE",
        "OMEGA_ANDROID_TEST_STAGE",
        "OMEGA_WEB_DIAGNOSTICS",
        "AndroidRuntime",
        "TestRunner",
        "INSTRUMENTATION_STATUS",
        "INSTRUMENTATION_RESULT",
        "FATAL EXCEPTION",
    )
    try:
        with raw_logcat.open("r", encoding="utf-8", errors="replace") as source:
            with filtered_log.open("w", encoding="utf-8") as target:
                for line in source:
                    if any(token in line for token in tokens):
                        target.write(line)
    except OSError as error:
        filtered_log.write_text(
            "FILTERED_LOG_CAPTURE_FAILED: " + repr(error) + "\n",
            encoding="utf-8",
        )
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
