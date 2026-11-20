#!/usr/bin/env python3
"""Run the packaged OMEGA APK WebView instrumentation and preserve emulator diagnostics."""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import shutil
from pathlib import Path
from threading import Thread

ARTIFACT_DIR = Path("android-performance-artifacts")
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
GRADLE_LOG = ARTIFACT_DIR / "gradle-android9.log"
REPORT_DIR = Path("android/app/build/reports/androidTests/connected/debug")
EXPECTED_TEST_CLASS = "OmegaNationalAccountsAndroidPerformanceTest"


def package_manager_probe_ready(
    boot_completed: str,
    service_status: str,
    package_list: subprocess.CompletedProcess[str],
) -> bool:
    packages = (package_list.stdout or "").splitlines()
    return (
        boot_completed.strip() == "1"
        and "found" in service_status.lower()
        and package_list.returncode == 0
        and any(line.strip().startswith("package:") for line in packages)
    )


def wait_for_android_package_manager(timeout_seconds: int = 180) -> bool:
    """Wait for system_server's PackageManager Binder service, not just ADB boot."""
    deadline = time.monotonic() + timeout_seconds
    last_state = "NOT_PROBED"
    while time.monotonic() < deadline:
        try:
            boot = subprocess.run(
                ["adb", "shell", "getprop", "sys.boot_completed"],
                capture_output=True, text=True, timeout=10, check=False,
            )
            service = subprocess.run(
                ["adb", "shell", "service", "check", "package"],
                capture_output=True, text=True, timeout=10, check=False,
            )
            packages = subprocess.run(
                ["adb", "shell", "pm", "list", "packages", "-s"],
                capture_output=True, text=True, timeout=15, check=False,
            )
            if package_manager_probe_ready(boot.stdout, service.stdout, packages):
                print("OMEGA_ANDROID_PACKAGE_MANAGER_READY=1", flush=True)
                return True
            last_state = (
                f"boot={boot.stdout.strip()!r}; "
                f"service={service.stdout.strip()!r}; "
                f"pm_exit={packages.returncode}; "
                f"pm_error={(packages.stderr or '').strip()[:240]!r}"
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            last_state = repr(error)
        print(f"OMEGA_ANDROID_PACKAGE_MANAGER_WAIT={last_state}", flush=True)
        time.sleep(3)
    print(
        f"OMEGA_ANDROID_PACKAGE_MANAGER_TIMEOUT={timeout_seconds}s; "
        f"last_state={last_state}",
        flush=True,
    )
    return False


def instrumentation_report_summary(report_dir: Path) -> dict[str, int]:
    """Require a real passing National Accounts instrumentation result."""
    import re

    index_file = report_dir / "index.html"
    if not index_file.is_file():
        raise RuntimeError("ANDROID_INSTRUMENTATION_REPORT_MISSING")
    report_html = index_file.read_text(encoding="utf-8", errors="replace")

    def counter(section_id: str) -> int:
        marker = f'id="{section_id}"'
        section_start = report_html.find(marker)
        if section_start < 0:
            raise RuntimeError("ANDROID_INSTRUMENTATION_REPORT_SUMMARY_INVALID:" + section_id)
        counter_start = report_html.find('class="counter"', section_start)
        if counter_start < 0:
            raise RuntimeError("ANDROID_INSTRUMENTATION_REPORT_SUMMARY_INVALID:" + section_id)
        value_start = report_html.find(">", counter_start) + 1
        value_end = report_html.find("</div>", value_start)
        match = re.search(r"\d+", report_html[value_start:value_end])
        if not match:
            raise RuntimeError("ANDROID_INSTRUMENTATION_REPORT_SUMMARY_INVALID:" + section_id)
        return int(match.group(0))

    summary = {
        "tests": counter("tests"),
        "failures": counter("failures"),
        "skipped": counter("skipped"),
    }
    if summary["tests"] < 1:
        raise RuntimeError("ANDROID_INSTRUMENTATION_ZERO_TESTS")
    if summary["failures"] or summary["skipped"]:
        raise RuntimeError(
            "ANDROID_INSTRUMENTATION_TESTS_NOT_GREEN:"
            + repr(summary)
        )

    class_found = False
    for html_file in report_dir.rglob("*.html"):
        try:
            if EXPECTED_TEST_CLASS in html_file.read_text(encoding="utf-8", errors="replace"):
                class_found = True
                break
        except OSError:
            continue
    if not class_found:
        raise RuntimeError("ANDROID_NATIONAL_ACCOUNTS_TEST_CLASS_MISSING")
    return summary


def capture_emulator_diagnostics() -> None:
    capture(["adb", "devices", "-l"], ARTIFACT_DIR / "adb-devices.txt", 15)
    generated_resource_runtime = Path(
        "android/app/build/generated/omegaWebAssets/omega_resource_research_runtime_v1.js"
    )
    if generated_resource_runtime.is_file():
        shutil.copy2(
            generated_resource_runtime,
            ARTIFACT_DIR / "omega_resource_research_runtime_v1.android.min.js",
        )
    generated_identity_runtime = Path(
        "android/app/build/generated/omegaWebAssets/omega_resource_part04_identity_runtime.js"
    )
    if generated_identity_runtime.is_file():
        shutil.copy2(
            generated_identity_runtime,
            ARTIFACT_DIR / "omega_resource_part04_identity_runtime.android.min.js",
        )
    raw_logcat = ARTIFACT_DIR / "android9-logcat-raw.log"
    capture(["adb", "logcat", "-d", "-t", "10000"], raw_logcat, 30)

    filtered_log = ARTIFACT_DIR / "android9-webview.log"
    tokens = (
        "OMEGA_ANDROID_PERFORMANCE",
        "OMEGA_ANDROID_TEST_STAGE",
        "OMEGA_ANDROID_PACKAGE_MANAGER",
        "OMEGA_WEB_DIAGNOSTICS",
        "AndroidRuntime",
        "TestRunner",
        "INSTRUMENTATION_STATUS",
        "INSTRUMENTATION_RESULT",
        "FATAL EXCEPTION",
        "system_server",
        "ServiceManager: service 'package'",
        "PackageManager",
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
    if not wait_for_android_package_manager():
        GRADLE_LOG.write_text(
            "ANDROID_PACKAGE_MANAGER_NOT_READY: instrumentation was not started.\n",
            encoding="utf-8",
        )
        capture_emulator_diagnostics()
        return 1

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
    capture_emulator_diagnostics()

    if exit_code != 0:
        return exit_code
    try:
        summary = instrumentation_report_summary(REPORT_DIR)
    except (OSError, RuntimeError) as error:
        print("OMEGA_ANDROID_INSTRUMENTATION_GATE_FAILED=" + str(error), flush=True)
        return 1
    print("OMEGA_ANDROID_INSTRUMENTATION_SUMMARY=" + repr(summary), flush=True)
    return exit_code



if __name__ == "__main__":
    sys.exit(main())
