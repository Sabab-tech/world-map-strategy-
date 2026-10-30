#!/usr/bin/env python3
"""Fetch public UNIDO INDSTAT observations through a real browser session.

UNIDO documents that its Cloudflare-protected API can reject plain HTTP clients
and recommends a full Chrome session for these endpoints. This collector does
not solve CAPTCHAs or bypass an interactive challenge: it stops and records an
error if the official endpoint does not return JSON.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By

META_URL = "https://stat.unido.org/portal/dataset/getDataset/INDSTAT/4"
DATA_PATH = "/portal/dataset/getData"


def scalar(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        return str(value).strip()
    for key in ("c", "code", "id", "value", "year", "name"):
        item = value.get(key)
        if item is not None and not isinstance(item, (dict, list)):
            return str(item).strip()
    return None


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"EXPECTED_JSON_OBJECT:{path}")
    return value


def body_json(driver: uc.Chrome, timeout_seconds: int = 90) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    last_text = ""
    while time.monotonic() < deadline:
        last_text = driver.find_element(By.TAG_NAME, "body").text.strip()
        if last_text:
            try:
                value = json.loads(last_text)
                if isinstance(value, dict):
                    return value
            except json.JSONDecodeError:
                pass
        time.sleep(2)
    preview = " ".join(last_text.split())[:240]
    raise RuntimeError(
        "UNIDO_METADATA_NOT_JSON_OR_BROWSER_CHALLENGE:" + (preview or "empty response")
    )


BATCH_SCRIPT = r"""
const rows = arguments[0];
const datasetId = arguments[1];
const variableCode = arguments[2];
const activities = arguments[3];
const periods = arguments[4];
const endpoint = arguments[5];
const done = arguments[arguments.length - 1];

(async () => {
  const results = {};
  async function fetchOne(row) {
    const payload = {
      datasetId,
      countryCode: row.countryCode,
      fullPrecision: true,
      variableCodes: [variableCode],
      activities,
      periods
    };
    let lastError = "UNIDO_REQUEST_FAILED";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const controller = new AbortController();
        const requestTimeout = setTimeout(() => controller.abort(), 35000);
        let response;
        let body;
        try {
          response = await fetch(endpoint, {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
              "accept": "application/json",
              "content-type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          body = await response.text();
        } finally {
          clearTimeout(requestTimeout);
        }
        if (!response.ok) {
          lastError = "HTTP_" + response.status + ":" + body.replace(/\s+/g, " ").slice(0, 180);
          if (response.status !== 429 && response.status < 500) break;
        } else {
          try {
            return {ok: true, data: JSON.parse(body)};
          } catch (_) {
            lastError = "NON_JSON_RESPONSE:" + body.replace(/\s+/g, " ").slice(0, 180);
            break;
          }
        }
      } catch (error) {
        lastError = String(error && error.message || error).slice(0, 240);
      }
      await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
    }
    return {ok: false, error: lastError};
  }
  const rowsResult = await Promise.all(rows.map(async row => {
    results[row.iso3] = await fetchOne(row);
  }));
  done(results);
})().catch(error => done({__collectorError: String(error && error.message || error)}));
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True, type=Path)
    parser.add_argument("--mapping", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    baseline = read_json(args.baseline)
    mapping = read_json(args.mapping)
    if baseline.get("countryCount") != 197 or len(baseline.get("countries", {})) != 197:
        raise ValueError("EXPECTED_197_CORE_COUNTRY_BASELINE")
    if len(mapping.get("mappings", [])) != 21:
        raise ValueError("EXPECTED_21_FACTORY_ISIC_MAPPINGS")

    options = uc.ChromeOptions()
    options.headless = False
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1440,1000")
    options.add_argument("--lang=en-US")

    driver = uc.Chrome(options=options, use_subprocess=True)
    driver.set_page_load_timeout(90)
    driver.set_script_timeout(180)

    try:
        driver.get(META_URL)
        metadata = body_json(driver)
        dataset_id = metadata.get("id") or metadata.get("datasetId")
        countries = metadata.get("countries")
        activities_meta = metadata.get("activities")
        variables = metadata.get("variables")
        if not dataset_id or not isinstance(countries, list) or not isinstance(activities_meta, list) or not isinstance(variables, list):
            raise ValueError("UNIDO_METADATA_SCHEMA_UNSUPPORTED")

        variable = next(
            (
                row for row in variables
                if scalar(row.get("c")) == "01"
                or "establishments" in str((row.get("lang") or {}).get("en") or row.get("name") or "").lower()
            ),
            None,
        )
        variable_code = scalar(variable.get("c")) if variable else None
        if variable_code != "01":
            raise ValueError("UNIDO_ESTABLISHMENTS_VARIABLE_01_NOT_AVAILABLE")

        source_by_iso3 = {
            str(row.get("iso3") or "").strip().upper(): row
            for row in countries
            if str(row.get("iso3") or "").strip()
        }
        source_activity_codes = {
            str(row.get("c") or "").strip()
            for row in activities_meta
            if str(row.get("c") or "").strip()
        }
        requested_activities = sorted({
            str(code).strip()
            for entry in mapping["mappings"]
            for code in (entry.get("activityCodes") or [])
            if str(code).strip() in source_activity_codes
        })
        periods = [
            scalar(period)
            for period in (metadata.get("periods") or [])
            if scalar(period) and len(scalar(period)) == 4 and scalar(period).isdigit()
        ]
        if not requested_activities or not periods:
            raise ValueError("UNIDO_REQUEST_ACTIVITY_OR_PERIOD_LIST_EMPTY")

        country_rows = []
        for country_id in sorted(baseline["countries"]):
            source = source_by_iso3.get(country_id)
            if not source:
                continue
            country_code = scalar(source.get("c"))
            if not country_code:
                continue
            country_rows.append({
                "iso3": country_id,
                "countryCode": country_code,
                "countryName": str((source.get("lang") or {}).get("en") or country_id),
            })

        cache: dict[str, Any] = {
            "cacheVersion": 1,
            "datasetCode": "INDSTAT/4",
            "sourceDatasetId": dataset_id,
            "retrievedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "metadata": metadata,
            "requestedActivityCodes": requested_activities,
            "requestedPeriodCount": len(periods),
            "requestedCoreCountryCount": len(country_rows),
            "responsesByIso3": {},
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        cache["responsesByIso3"] = {}
        with args.output.open("w", encoding="utf-8") as handle:
            json.dump(cache, handle, ensure_ascii=False, separators=(",", ":"))

        for index in range(0, len(country_rows), 4):
            batch = country_rows[index:index + 4]
            try:
                response_rows = driver.execute_async_script(
                    BATCH_SCRIPT,
                    batch,
                    dataset_id,
                    variable_code,
                    requested_activities,
                    periods,
                    DATA_PATH,
                )
                if not isinstance(response_rows, dict) or "__collectorError" in response_rows:
                    raise RuntimeError(str((response_rows or {}).get("__collectorError") or "UNIDO_BROWSER_FETCH_INVALID_RESULT"))
            except Exception as error:  # keep other countries collectable after one browser-side error
                response_rows = {
                    row["iso3"]: {"ok": False, "error": "BROWSER_BATCH_ERROR:" + str(error)[:220]}
                    for row in batch
                }

            for row in batch:
                cache["responsesByIso3"][row["iso3"]] = response_rows.get(
                    row["iso3"], {"ok": False, "error": "UNIDO_COUNTRY_RESPONSE_MISSING"}
                )

            completed = min(index + len(batch), len(country_rows))
            success_count = sum(1 for row in cache["responsesByIso3"].values() if row.get("ok") is True)
            failure_count = len(cache["responsesByIso3"]) - success_count
            cache["completedCoreCountryCount"] = completed
            cache["successfulCoreCountryCount"] = success_count
            cache["failedCoreCountryCount"] = failure_count
            with args.output.open("w", encoding="utf-8") as handle:
                json.dump(cache, handle, ensure_ascii=False, separators=(",", ":"))
            print(
                f"UNIDO_BROWSER_FETCH progress={completed}/{len(country_rows)} "
                f"success={success_count} failed={failure_count}",
                flush=True,
            )
            time.sleep(0.5)

        success_count = sum(1 for row in cache["responsesByIso3"].values() if row.get("ok") is True)
        failure_count = len(cache["responsesByIso3"]) - success_count
        print(json.dumps({
            "datasetId": dataset_id,
            "coreCountriesCoveredByUNIDO": len(country_rows),
            "successfulResponses": success_count,
            "failedResponses": failure_count,
            "cache": str(args.output),
        }, ensure_ascii=False))
        if success_count == 0:
            print("UNIDO_BROWSER_FETCH_ZERO_SUCCESSFUL_COUNTRIES", file=sys.stderr)
            return 2
        return 0
    finally:
        driver.quit()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"UNIDO_BROWSER_COLLECTOR_ERROR: {exc}", file=sys.stderr)
        raise
