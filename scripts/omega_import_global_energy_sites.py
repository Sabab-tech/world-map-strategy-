#!/usr/bin/env python3
"""Build a compact offline catalog of global oil/gas fields and coal mines.

Inputs are downloaded only during CI/build. The Android app consumes the generated JSON
locally; it does not call these external sources at runtime.
"""
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

import duckdb

ROOT = Path.cwd()
ASSETS = Path(sys.argv[1] if len(sys.argv) > 1 else ".cache/assets_open.parquet")
COAL_ACTIVE = Path(sys.argv[2] if len(sys.argv) > 2 else ".cache/non_closed_mines.csv")
COAL_CLOSED = Path(sys.argv[3] if len(sys.argv) > 3 else ".cache/closed_mines.csv")
OUT = Path(sys.argv[4] if len(sys.argv) > 4 else "resource_site_global_energy_catalog_v1.json")
CATALOG = json.loads((ROOT / "resource_site_canonical_catalog_v1.json").read_text(encoding="utf-8"))
WORLD = json.loads((ROOT / "world.json").read_text(encoding="utf-8"))

def norm(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"\\s+", " ", re.sub(r"[^a-zA-Z0-9]+", " ", value)).strip().upper()

def slug(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", value.lower())).strip("_")

def first(*values):
    for value in values:
        if value is not None and str(value).strip() and str(value).strip().lower() not in {"nan", "none", "null"}:
            return value
    return None

def as_float(value):
    try:
        result = float(str(value).replace(",", "."))
        return result if result == result else None
    except (TypeError, ValueError):
        return None

country_name_to_id = {}
country_id_to_name = {}
known_ids = set()
for site in CATALOG.get("sites", []):
    cid = str(first(site.get("countryId"), (site.get("identity") or {}).get("countryIso3")) or "").upper()
    if cid:
        known_ids.add(cid)
        for name in [site.get("countryName"), (site.get("location") or {}).get("countryName"), cid]:
            if name:
                country_name_to_id[norm(name)] = cid
        country_id_to_name.setdefault(cid, first(site.get("countryName"), (site.get("location") or {}).get("countryName"), cid))
for feature in WORLD.get("features", []):
    p = feature.get("properties") or {}
    cid = str(first(p.get("ISO_A3"), p.get("ADM0_A3"), p.get("iso_a3"), p.get("ISO3"), p.get("iso3"), p.get("A3"), feature.get("id")) or "").upper()
    name = first(p.get("ADMIN"), p.get("NAME_EN"), p.get("NAME"), p.get("name"), p.get("NAME_LONG"), p.get("SOVEREIGNT"), p.get("COUNTRY"))
    if re.fullmatch(r"[A-Z]{3}", cid) and cid != "-99":
        known_ids.add(cid)
        if name:
            country_name_to_id[norm(name)] = cid
            country_id_to_name[cid] = str(name)
ALIASES = {
    "UNITED STATES OF AMERICA": "USA", "UNITED STATES": "USA", "USA": "USA",
    "RUSSIAN FEDERATION": "RUS", "SOUTH KOREA": "KOR", "KOREA SOUTH": "KOR",
    "NORTH KOREA": "PRK", "KOREA NORTH": "PRK", "IRAN ISLAMIC REPUBLIC OF": "IRN",
    "VIET NAM": "VNM", "VIETNAM": "VNM", "BOLIVIA PLURINATIONAL STATE OF": "BOL",
    "VENEZUELA BOLIVARIAN REPUBLIC OF": "VEN", "TANZANIA UNITED REPUBLIC OF": "TZA",
    "CONGO DEMOCRATIC REPUBLIC OF THE": "COD", "DEMOCRATIC REPUBLIC OF THE CONGO": "COD",
    "CONGO REPUBLIC OF THE": "COG", "IVORY COAST": "CIV", "COTE D IVOIRE": "CIV",
    "CZECH REPUBLIC": "CZE", "CZECHIA": "CZE", "TURKIYE": "TUR", "TURKEY": "TUR",
    "LAOS": "LAO", "SYRIA": "SYR", "MOLDOVA": "MDA", "PALESTINE": "PSE",
    "TAIWAN": "TWN", "ESWATINI": "SWZ", "MACEDONIA": "MKD", "MYANMAR": "MMR",
}
def country_id(*values):
    for value in values:
        if not value:
            continue
        text = str(value).strip().upper()
        if text in known_ids:
            return text
        key = norm(value)
        if key in ALIASES and ALIASES[key] in known_ids:
            return ALIASES[key]
        if key in country_name_to_id:
            return country_name_to_id[key]
    return ""

def site_record(prefix, cid, name, resource, lat, lon, status, source, source_url, source_record_id=None, operator=None, year=None, accuracy=None, production=None):
    site_id = f"{prefix}_{cid}_{resource}_{slug(name)}_{lat:.4f}_{lon:.4f}"
    return {
        "siteId": site_id,
        "countryId": cid,
        "siteName": str(name).strip(),
        "schemaVersion": "1.0.0",
        "sourceType": "GLOBAL_ENERGY_EXTRACTION" if prefix == "GLOBAL_ENERGY" else "GLOBAL_COAL_MINE",
        "identity": {"countryIso3": cid, "siteType": "OIL_GAS_FIELD" if prefix == "GLOBAL_ENERGY" else "COAL_MINE", "resourceTypeId": resource, "sourceRecordId": str(source_record_id) if source_record_id else None},
        "real": {"resourceId": resource, "operationStatus": str(status or "UNKNOWN").strip().upper(), "reserveStatus": "SOURCE_VALUE_ONLY_IF_PRESENT", "productionStatus": "SOURCE_VALUE_ONLY_IF_PRESENT"},
        "coordinates": {"lat": lat, "lng": lon},
        "location": {"coordinates": {"lat": lat, "lng": lon}, "countryName": country_id_to_name.get(cid, cid), "coordinateStatus": str(accuracy or "UPSTREAM_COORDINATE_NOT_INDEPENDENTLY_VALIDATED")},
        "operation": {"status": str(status or "UNKNOWN").strip(), "operator": operator, "startYear": year, "production": production, "commercialExtraction": "OPERAT" in str(status or "").upper() or "PRODUC" in str(status or "").upper(), "extractionEligibility": "REQUIRES_EXACT_GAME_SITE_BINDING"},
        "sourceSiteRecord": {"sourceDataset": source, "sourceUrl": source_url, "sourceRecordId": str(source_record_id) if source_record_id else None, "operator": operator, "status": str(status or "UNKNOWN").strip(), "production": production, "startYear": year},
        "provenance": {"sourceAuthority": source, "sourceUrl": source_url, "operationalStatus": "PRESERVED_FROM_SOURCE_NOT_SYNTHESIZED"}
    }

records = {}
rejected = {"energy_missing_coordinates": 0, "energy_missing_country": 0, "coal_missing_coordinates": 0, "coal_missing_country": 0}
energy_source = "Global Energy Monitor GOGET via Global Energy Map assets_open.parquet (March 2026 snapshot)"
energy_url = "https://energymap.marain.space/data/assets_open.parquet?v=1c1b1fa7"
con = duckdb.connect()
asset_path = str(ASSETS.resolve()).replace("'", "''")
description = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{asset_path}')").fetchall()
columns = [str(row[0]) for row in description]
rows = con.execute(f"SELECT * FROM read_parquet('{asset_path}') WHERE lower(CAST(kind AS VARCHAR)) = 'extraction_site'").fetchall()
energy_count = 0
for values in rows:
    row = {columns[i].lower(): values[i] for i in range(min(len(columns), len(values)))}
    lat = as_float(first(row.get("lat"), row.get("latitude")))
    lon = as_float(first(row.get("lon"), row.get("lng"), row.get("longitude")))
    if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        rejected["energy_missing_coordinates"] += 1
        continue
    cid = country_id(row.get("country_iso3"), row.get("iso3"), row.get("country_code"), row.get("country"), row.get("country_name"))
    if not cid:
        rejected["energy_missing_country"] += 1
        continue
    name = first(row.get("name"), row.get("asset_name"), row.get("field_name"), row.get("label"))
    if not name:
        name = f"{str(row.get('fuel') or 'oil_gas').title()} field ({lat:.3f}, {lon:.3f})"
    fuel = norm(first(row.get("fuel"), row.get("commodity"), row.get("resource"), row.get("fuel_type")) or "")
    resources = ["oil", "natural_gas"] if "OIL" in fuel and "GAS" in fuel else (["natural_gas"] if "GAS" in fuel else (["oil"] if "OIL" in fuel else []))
    if not resources:
        continue
    status = first(row.get("status"), row.get("operating_status"), "UNKNOWN")
    source_id = first(row.get("id"), row.get("asset_id"), row.get("source_id"))
    operator = first(row.get("operator"), row.get("owner"))
    year = first(row.get("commissioned_year"), row.get("start_year"), row.get("year_commissioned"))
    accuracy = first(row.get("location_accuracy"), row.get("accuracy"), "UPSTREAM_COORDINATE_NOT_INDEPENDENTLY_VALIDATED")
    production = first(row.get("production"), row.get("production_value"))
    for resource in resources:
        site = site_record("GLOBAL_ENERGY", cid, name, resource, lat, lon, status, energy_source, energy_url, source_id, operator, year, accuracy, production)
        records[(cid, resource, norm(name), round(lat, 4), round(lon, 4))] = site
        energy_count += 1
con.close()

coal_source = "Global Coal Mine Tracker derived CSV mirror (source dataset attributed to Global Energy Monitor, CC BY 4.0)"
coal_url = "https://github.com/1ways/coal-mine-tracker"
coal_count = 0
for csv_path, default_status in [(COAL_ACTIVE, "UNKNOWN"), (COAL_CLOSED, "CLOSED")]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Required coal source file missing: {csv_path}")
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            lat = as_float(first(row.get("Latitude"), row.get("latitude")))
            lon = as_float(first(row.get("Longitude"), row.get("longitude")))
            if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                rejected["coal_missing_coordinates"] += 1
                continue
            cid = country_id(row.get("Country / Area"), row.get("Country"), row.get("country"))
            if not cid:
                rejected["coal_missing_country"] += 1
                continue
            name = first(row.get("Mine Name"), row.get("Mine name"), row.get("name"))
            if not name:
                continue
            status = first(row.get("Status"), row.get("status"), default_status)
            site = site_record("GLOBAL_COAL", cid, name, "coal", lat, lon, status, coal_source, coal_url, row.get("Mine Name"), row.get("Parent Company"), row.get("Opening Year"), "UPSTREAM_COORDINATE_NOT_INDEPENDENTLY_VALIDATED", row.get("Production (Mtpa)"))
            key = (cid, "coal", norm(name), round(lat, 4), round(lon, 4))
            if key in records:
                prior = records[key]
                prior["sourceSiteRecord"]["additionalSourceRecords"] = (prior["sourceSiteRecord"].get("additionalSourceRecords") or []) + [site["sourceSiteRecord"]]
            else:
                records[key] = site
            coal_count += 1

sites = sorted(records.values(), key=lambda x: (x["countryId"], x["real"]["resourceId"], x["siteName"]))
if energy_count < 3000:
    raise RuntimeError(f"Global oil/gas import produced only {energy_count} records; refusing a partial field catalog")
if coal_count < 1000:
    raise RuntimeError(f"Global coal import produced only {coal_count} rows; refusing a partial coal catalog")
output = {
    "schemaVersion": "1.0.0",
    "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "datasetScope": "GLOBAL_OIL_GAS_EXTRACTION_AND_COAL_MINES",
    "siteCount": len(sites),
    "countriesRepresented": len({site["countryId"] for site in sites}),
    "sourceCounts": {"oilGasRowsExpandedToCommoditySites": energy_count, "coalSourceRows": coal_count},
    "rejected": rejected,
    "operationalPolicy": "Source locations are visible but do not become executable extraction sites until OMEGA has an exact game site binding.",
    "sources": [
        {"name": "Global Energy Monitor GOGET via Global Energy Map", "url": energy_url, "asOf": "2026-03", "license": "CC BY 4.0", "attribution": "Data: Global Energy Monitor, CC BY 4.0"},
        {"name": "Global Coal Mine Tracker CSV mirror", "url": coal_url, "asOf": "2026-08", "license": "Source-derived; preserve GEM attribution and verify redistribution terms", "attribution": "Data: Global Energy Monitor, CC BY 4.0"}
    ],
    "sites": sites
}
OUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(json.dumps({"output": str(OUT), "siteCount": len(sites), "countriesRepresented": output["countriesRepresented"], "sourceCounts": output["sourceCounts"], "rejected": rejected}, indent=2))
