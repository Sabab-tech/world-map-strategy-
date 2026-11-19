#!/usr/bin/env python3
"""Unit tests for the Android 9 WebView instrumentation safety gate."""
from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from run_android_webview_performance import (
    EXPECTED_TEST_CLASS,
    instrumentation_report_summary,
    package_manager_probe_ready,
)


def report_html(tests: int, failures: int, skipped: int, include_class: bool = True) -> str:
    class_row = (
        f'<a href="classes/com.omega.{EXPECTED_TEST_CLASS}.html">'
        f'com.omega.{EXPECTED_TEST_CLASS}</a>'
        if include_class else ""
    )
    return f"""
    <div class="infoBox" id="tests"><div class="counter">{tests}</div><p>tests</p></div>
    <div class="infoBox" id="failures"><div class="counter">{failures}</div><p>failures</p></div>
    <div class="infoBox" id="skipped"><div class="counter">{skipped}</div><p>skipped</p></div>
    {class_row}
    """


class AndroidWebViewInstrumentationGateTests(unittest.TestCase):
    def make_report(self, tests: int, failures: int = 0, skipped: int = 0,
                    include_class: bool = True) -> Path:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        report_dir = Path(temporary.name)
        (report_dir / "index.html").write_text(
            report_html(tests, failures, skipped, include_class),
            encoding="utf-8",
        )
        return report_dir

    def test_accepts_a_real_passing_national_accounts_instrumentation_test(self) -> None:
        report_dir = self.make_report(1)
        self.assertEqual(
            instrumentation_report_summary(report_dir),
            {"tests": 1, "failures": 0, "skipped": 0},
        )

    def test_rejects_a_green_gradle_task_that_executed_zero_tests(self) -> None:
        report_dir = self.make_report(0, include_class=False)
        with self.assertRaisesRegex(RuntimeError, "ANDROID_INSTRUMENTATION_ZERO_TESTS"):
            instrumentation_report_summary(report_dir)

    def test_rejects_instrumentation_failures(self) -> None:
        report_dir = self.make_report(1, failures=1)
        with self.assertRaisesRegex(RuntimeError, "ANDROID_INSTRUMENTATION_TESTS_NOT_GREEN"):
            instrumentation_report_summary(report_dir)

    def test_rejects_skipped_instrumentation_tests(self) -> None:
        report_dir = self.make_report(1, skipped=1)
        with self.assertRaisesRegex(RuntimeError, "ANDROID_INSTRUMENTATION_TESTS_NOT_GREEN"):
            instrumentation_report_summary(report_dir)

    def test_rejects_reports_without_the_expected_benchmark_class(self) -> None:
        report_dir = self.make_report(1, include_class=False)
        with self.assertRaisesRegex(RuntimeError, "ANDROID_NATIONAL_ACCOUNTS_TEST_CLASS_MISSING"):
            instrumentation_report_summary(report_dir)

    def test_waits_for_package_manager_even_after_adb_reports_boot_complete(self) -> None:
        not_ready = subprocess.CompletedProcess(
            ["adb"], 1, stdout="", stderr="cmd: Can't find service: package",
        )
        self.assertFalse(package_manager_probe_ready(
            "1", "Service package: not found", not_ready,
        ))

    def test_accepts_package_manager_only_when_binder_and_package_list_are_ready(self) -> None:
        ready = subprocess.CompletedProcess(
            ["adb"], 0, stdout="package:android\npackage:com.android.settings\n", stderr="",
        )
        self.assertTrue(package_manager_probe_ready(
            "1", "Service package: found", ready,
        ))


if __name__ == "__main__":
    unittest.main(verbosity=2)
