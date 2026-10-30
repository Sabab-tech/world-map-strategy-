#!/usr/bin/env python3
"""Export exact ISIC Rev.4 establishment rows from the public UNIDO INDSTAT mirror.

Custom ISIC combination rows are counted for audit but excluded from activity
totals, because an aggregate across multiple classes cannot safely be assigned
to one OMEGA factory type.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import subsetsio

DATASET_ID = "unido-indstat-r4"
MAPPING_PATH = Path(__file__).resolve().parent.parent / "factory_isic_mapping_v1.json"


def mapped_activity_codes() -> list[str]:
    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    codes = sorted({
        str(code)
        for row in mapping.get("mappings", [])
        for code in row.get("activityCodes", [])
        if str(code).isdigit() and len(str(code)) == 4
    })
    if not codes:
        raise RuntimeError("FACTORY_ISIC_MAPPING_HAS_NO_FOUR_DIGIT_CODES")
    return codes


def build_sql(codes: list[str]) -> str:
    literals = ", ".join("'" + code + "'" for code in codes)
    return f"""
SELECT
  country_code,
  country_name,
  indicator_code,
  indicator_name,
  classification_code,
  classification_name,
  classification_combo_code,
  classification_combo_name,
  time_period,
  year,
  value
FROM "{DATASET_ID}"
WHERE indicator_code = '01'
  AND TRY_CAST(year AS INTEGER) BETWEEN 1981 AND 2024
  AND classification_code IN ({literals})
  AND (classification_combo_code IS NULL OR classification_combo_code = classification_code)
"""


def count_excluded_combinations(codes: list[str]) -> int:
    literals = ", ".join("'" + code + "'" for code in codes)
    sql = f"""
SELECT COUNT(*) AS row_count
FROM "{DATASET_ID}"
WHERE indicator_code = '01'
  AND TRY_CAST(year AS INTEGER) BETWEEN 1981 AND 2024
  AND classification_code IN ({literals})
  AND classification_combo_code <> classification_code
"""
    result = subsetsio.query(sql)
    if result is None or getattr(result, "empty", True):
        return 0
    return int(result.iloc[0]["row_count"] or 0)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/tmp/unido-indstat-r4-establishments.json")
    args = parser.parse_args()

    info = subsetsio.info(DATASET_ID)
    if not isinstance(info, dict):
        raise RuntimeError("SUBSETS_DATASET_METADATA_INVALID")

    codes = mapped_activity_codes()
    df = subsetsio.query(build_sql(codes))
    if df is None or getattr(df, "empty", True):
        raise RuntimeError("SUBSETS_INDSTAT_ESTABLISHMENT_QUERY_EMPTY")

    required = {
        "country_code", "country_name", "indicator_code", "indicator_name",
        "classification_code", "classification_name", "classification_combo_code",
        "classification_combo_name", "year", "value"
    }
    missing = required.difference(set(df.columns))
    if missing:
        raise RuntimeError("SUBSETS_INDSTAT_SCHEMA_MISSING_COLUMNS:" + ",".join(sorted(missing)))

    records = json.loads(df.to_json(orient="records", force_ascii=False))
    if not records:
        raise RuntimeError("SUBSETS_INDSTAT_NO_ESTABLISHMENT_RECORDS")

    excluded_combinations = count_excluded_combinations(codes)
    preview = (
        df[["classification_code", "classification_name", "classification_combo_code", "classification_combo_name"]]
        .drop_duplicates()
        .head(30)
        .to_json(orient="records", force_ascii=False)
    )
    metadata = {
        "datasetId": DATASET_ID,
        "source": info.get("source", "UNIDO"),
        "source_url": info.get("source_url", "https://stat.unido.org/data/table?dataset=indstat&revision=4"),
        "license": info.get("license", "CC BY 4.0"),
        "updated_at": info.get("updated_at") or info.get("last_updated") or "",
        "title": info.get("title", "Industrial Statistics - ISIC Revision 4 Manufacturing Indicators"),
        "excluded_combined_activity_rows": excluded_combinations,
        "query_activity_codes": codes,
        "query_year_range": [1981, 2024],
        "query_classification_policy": "classification_code = classification_combo_code"
    }
    payload = {"metadata": metadata, "rows": records}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(json.dumps({
        "datasetId": DATASET_ID,
        "license": metadata["license"],
        "source": metadata["source"],
        "sourceUrl": metadata["source_url"],
        "rowCount": len(records),
        "excludedCombinedActivityRows": excluded_combinations,
        "queriedActivityCodeCount": len(codes),
        "yearRange": metadata["query_year_range"],
        "columns": list(df.columns),
        "classificationPreview": json.loads(preview),
        "output": str(output),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
