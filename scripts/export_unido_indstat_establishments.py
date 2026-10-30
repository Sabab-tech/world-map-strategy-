#!/usr/bin/env python3
"""Export UNIDO INDSTAT R4 establishments through the public Subsets.io mirror.

Subsets.io mirrors the original UNIDO statistical observations under CC BY 4.0.
The output is a temporary CI artifact, not a hand-edited source file.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import subsetsio

DATASET_ID = "unido-indstat-r4"
SQL = """
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
FROM "unido-indstat-r4"
WHERE indicator_code = '01'
  AND TRY_CAST(year AS INTEGER) BETWEEN 1981 AND 2024
"""

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/tmp/unido-indstat-r4-establishments.json")
    args = parser.parse_args()

    info = subsetsio.info(DATASET_ID)
    if not isinstance(info, dict):
        raise RuntimeError("SUBSETS_DATASET_METADATA_INVALID")
    df = subsetsio.query(SQL)
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

    records_json = df.to_json(orient="records", force_ascii=False)
    records = json.loads(records_json)
    if not records:
        raise RuntimeError("SUBSETS_INDSTAT_NO_ESTABLISHMENT_RECORDS")

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
        "columns": list(df.columns),
        "classificationPreview": json.loads(preview),
        "output": str(output),
    }, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
