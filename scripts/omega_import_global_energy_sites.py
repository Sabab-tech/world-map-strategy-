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

from openpyxl import load_workbook

ROOT = Path.cwd()
GOGET_XLSX = Path(sys.argv[1] if len(sys.argv) > 1 else ".cache/Global-Oil-and-Gas-Extraction-Tracker-March-2026.xlsx")
COAL_ACTIVE = Path(sys.argv[2] if len(sys.argv) > 2 else ".cache/non_closed_mines.csv")
COAL_CLOSED = Path(sys.argv[3] if len(sys.argv) > 3 else ".cache/closed_mines.csv")
OUT = Path(sys.argv[4] if len(sys.argv) > 4 else "resource_site_global_energy_catalog_v1.json")
CATALOG = json.loads((ROOT / "resource_site_canonical_catalog_v1.json").read_text(encoding="utf-8"))
WORLD = json.loads((ROOT / "world.json").read_text(encoding="utf-8"))

def norm(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-zA-Z0-9]+", " ", value)).strip().upper()

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
        for separator in ["-", " / ", "/", ";"]:
            if separator in str(value):
                first_part = str(value).split(separator, 1)[0]
                first_key = norm(first_part)
                if first_key in country_name_to_id:
                    return country_name_to_id[first_key]
                if first_key in ALIASES and ALIASES[first_key] in known_ids:
                    return ALIASES[first_key]
    return ""

country_features = []
for feature in WORLD.get("features", []):
    props = feature.get("properties") or {}
    cid = str(first(props.get("ISO_A3"), props.get("ADM0_A3"), props.get("iso_a3"), props.get("ISO3"), props.get("iso3"), props.get("A3"), feature.get("id")) or "").upper()
    geometry = feature.get("geometry") or {}
    coords = geometry.get("coordinates")
    if cid in known_ids and geometry.get("type") in {"Polygon", "MultiPolygon"} and coords:
        try:
            flat = [point for polygon in (coords if geometry["type"] == "MultiPolygon" else [coords]) for ring in polygon for point in ring]
            bbox = (min(p[0] for p in flat), min(p[1] for p in flat), max(p[0] for p in flat), max(p[1] for p in flat))
            country_features.append((cid, geometry["type"], coords, bbox))
        except (ValueError, TypeError, IndexError):
            continue

def point_in_ring(lon, lat, ring):
    inside = False
    if not ring:
        return False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-30) + xi:
            inside = not inside
        j = i
    return inside

def point_in_polygon(lon, lat, rings):
    if not rings or not point_in_ring(lon, lat, rings[0]):
        return False
    return not any(point_in_ring(lon, lat, hole) for hole in rings[1:])

def country_from_coordinates(lat, lon):
    matches = []
    for cid, geometry_type, coords, bbox in country_features:
        min_lon, min_lat, max_lon, max_lat = bbox
        if lon < min_lon or lon > max_lon or lat < min_lat or lat > max_lat:
            continue
        polygons = coords if geometry_type == "MultiPolygon" else [coords]
        if any(point_in_polygon(lon, lat, polygon) for polygon in polygons):
            matches.append(cid)
    return matches[0] if len(set(matches)) == 1 else ""

def site_record(prefix, cid, name, resource, lat, lon, status, source, source_url, source_record_id=None, operator=None, year=None, accuracy=None, production=None):
    cid = str(cid).strip().upper() if cid else None
    valid_coordinates = lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180
    coords = {"lat": lat, "lng": lon} if valid_coordinates else None
    coord_key = f"{lat:.4f}_{lon:.4f}" if valid_coordinates else "NO_COORDINATES"
    country_key = cid or "UNRESOLVED_COUNTRY"
    source_key = slug(source_record_id or name) or "UNKEYED_SOURCE_RECORD"
    site_id = f"{prefix}_{country_key}_{resource}_{slug(name)}_{source_key}_{coord_key}"
    status_text = str(status or "UNKNOWN").strip()
    operation_status = status_text.upper()
    commercial = ("OPERAT" in operation_status or "PRODUC" in operation_status) and valid_coordinates and bool(cid)
    if not cid:
        eligibility = "BLOCKED_UNRESOLVED_COUNTRY_IDENTITY"
    elif not valid_coordinates:
        eligibility = "BLOCKED_MISSING_COORDINATES"
    else:
        eligibility = "REQUIRES_EXACT_GAME_SITE_BINDING"
    return {
        "siteId": site_id,
        "countryId": cid,
        "siteName": str(name).strip(),
        "schemaVersion": "1.0.0",
        "sourceType": "GLOBAL_ENERGY_EXTRACTION" if prefix == "GLOBAL_ENERGY" else "GLOBAL_COAL_MINE",
        "identity": {"countryIso3": cid, "countryAssignmentStatus": "IDENTIFIED" if cid else "UNRESOLVED_COUNTRY_IDENTITY", "siteType": "OIL_GAS_FIELD" if prefix == "GLOBAL_ENERGY" else "COAL_MINE", "resourceTypeId": resource, "sourceRecordId": str(source_record_id) if source_record_id else None},
        "real": {"resourceId": resource, "operationStatus": operation_status, "reserveStatus": "SOURCE_VALUE_ONLY_IF_PRESENT", "productionStatus": "SOURCE_VALUE_ONLY_IF_PRESENT"},
        "coordinates": coords,
        "location": {"coordinates": coords, "countryName": country_id_to_name.get(cid, cid) if cid else None, "countryJurisdictionStatus": "IDENTIFIED" if cid else "UNRESOLVED", "coordinateStatus": str(accuracy or "UPSTREAM_COORDINATE_NOT_INDEPENDENTLY_VALIDATED") if valid_coordinates else "MISSING_UPSTREAM_COORDINATES"},
        "operation": {"status": status_text, "operator": operator, "startYear": year, "production": production, "commercialExtraction": commercial, "extractionEligibility": eligibility},
        "sourceSiteRecord": {"sourceDataset": source, "sourceUrl": source_url, "sourceRecordId": str(source_record_id) if source_record_id else None, "operator": operator, "status": status_text, "production": production, "startYear": year},
        "provenance": {"sourceAuthority": source, "sourceUrl": source_url, "operationalStatus": "PRESERVED_FROM_SOURCE_NOT_SYNTHESIZED"}
    }

records = {}
unresolved = {"energy_missing_coordinates": 0, "energy_missing_country": 0, "coal_missing_coordinates": 0, "coal_missing_country": 0, "coal_country_inferred_from_coordinates": 0}
energy_source = "Global Energy Monitor — Global Oil and Gas Extraction Tracker (March 2026)"
energy_url = "https://web.archive.org/web/20260305063452id_/https://globalenergymonitor.org/wp-content/uploads/2026/03/Global-Oil-and-Gas-Extraction-Tracker-March-2026.xlsx"
if not GOGET_XLSX.exists():
    raise FileNotFoundError(f"Required GOGET workbook missing: {GOGET_XLSX}")
workbook = load_workbook(GOGET_XLSX, read_only=True, data_only=True)
sheet_name = "Field-level main data" if "Field-level main data" in workbook.sheetnames else ("Main data" if "Main data" in workbook.sheetnames else None)
if not sheet_name:
    raise RuntimeError(f"GOGET workbook sheet not found; available sheets: {workbook.sheetnames}")
sheet = workbook[sheet_name]
iterator = sheet.iter_rows(values_only=True)
headers = next(iterator, None)
if not headers:
    raise RuntimeError("GOGET field-level sheet is empty")
header_map = {norm(value): i for i, value in enumerate(headers) if value is not None}
def cell(row, *names):
    for name in names:
        idx = header_map.get(norm(name))
        if idx is not None and idx < len(row):
            value = row[idx]
            if value is not None and str(value).strip():
                return value
    return None
energy_count = 0
for row in iterator:
    lat = as_float(cell(row, "Latitude", "lat"))
    lon = as_float(cell(row, "Longitude", "lon", "lng"))
    if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        unresolved["energy_missing_coordinates"] += 1
        lat, lon = None, None
    cid = country_id(cell(row, "Country", "Country/Area", "country_iso3"))
    if not cid and lat is not None and lon is not None:
        cid = country_from_coordinates(lat, lon)
    if not cid:
        unresolved["energy_missing_country"] += 1
    name = first(cell(row, "Unit name", "Unit Name", "name"), cell(row, "Unit ID", "asset_id"))
    if not name:
        continue
    fuel = norm(cell(row, "Fuel type", "Fuel", "commodity") or "")
    resources = ["crude_oil", "natural_gas"] if "OIL" in fuel and "GAS" in fuel else (["natural_gas"] if "GAS" in fuel else (["crude_oil"] if "OIL" in fuel else []))
    if not resources:
        continue
    status = first(cell(row, "Status", "status"), "UNKNOWN")
    source_id = cell(row, "Unit ID", "asset_id")
    operator = cell(row, "Operator", "operator")
    year = cell(row, "Production start year", "commissioned_year")
    accuracy = first(cell(row, "Location Accuracy", "Location accuracy"), "UPSTREAM_COORDINATE_NOT_INDEPENDENTLY_VALIDATED")
    production = first(cell(row, "Production", "Production (boe/d)", "Production (kboe/d)"))
    for resource in resources:
        site = site_record("GLOBAL_ENERGY", cid, name, resource, lat, lon, status, energy_source, energy_url, source_id, operator, year, accuracy, production)
        dedup_key = (cid or "UNRESOLVED_COUNTRY", resource, norm(name), source_id or "", round(lat, 4) if lat is not None else None, round(lon, 4) if lon is not None else None)
        records[dedup_key] = site
        energy_count += 1
workbook.close()

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
                unresolved["coal_missing_coordinates"] += 1
                lat, lon = None, None
            cid = country_id(row.get("Country / Area"), row.get("Country"), row.get("country"))
            if not cid and lat is not None and lon is not None:
                cid = country_from_coordinates(lat, lon)
                if cid:
                    unresolved["coal_country_inferred_from_coordinates"] += 1
            if not cid:
                unresolved["coal_missing_country"] += 1
            name = first(row.get("Mine Name"), row.get("Mine name"), row.get("name"))
            if not name:
                continue
            status = first(row.get("Status"), row.get("status"), default_status)
            site = site_record("GLOBAL_COAL", cid, name, "coal", lat, lon, status, coal_source, coal_url, row.get("Mine Name"), row.get("Parent Company"), row.get("Opening Year"), "UPSTREAM_COORDINATE_NOT_INDEPENDENTLY_VALIDATED", row.get("Production (Mtpa)"))
            source_id = first(row.get("Mine ID"), row.get("Mine Name"), row.get("Mine name"), row.get("name"))
            key = (cid or "UNRESOLVED_COUNTRY", "coal", norm(name), source_id or "", round(lat, 4) if lat is not None else None, round(lon, 4) if lon is not None else None)
            if key in records:
                prior = records[key]
                prior["sourceSiteRecord"]["additionalSourceRecords"] = (prior["sourceSiteRecord"].get("additionalSourceRecords") or []) + [site["sourceSiteRecord"]]
            else:
                records[key] = site
            coal_count += 1

sites = sorted(records.values(), key=lambda x: (str(x.get("countryId") or "UNRESOLVED_COUNTRY"), x["real"]["resourceId"], x["siteName"]))
if energy_count < 3000:
    raise RuntimeError(f"Global oil/gas import produced only {energy_count} records; refusing a partial field catalog")
if coal_count < 1000:
    raise RuntimeError(f"Global coal import produced only {coal_count} rows; refusing a partial coal catalog")
output = {
    "schemaVersion": "1.0.0",
    "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "datasetScope": "GLOBAL_OIL_GAS_EXTRACTION_AND_COAL_MINES",
    "siteCount": len(sites),
    "countriesRepresented": len({site["countryId"] for site in sites if site.get("countryId")}),
    "sourceCounts": {"oilGasRowsExpandedToCommoditySites": energy_count, "coalSourceRows": coal_count},
    "unresolvedCounts": {"siteRecordsWithoutCountry": sum(1 for site in sites if not site.get("countryId")), "siteRecordsWithoutCoordinates": sum(1 for site in sites if not site.get("coordinates")), **unresolved},
    "rejected": {"siteRecords": 0, "coordinates": 0, "countryIdentity": 0}, 
    "operationalPolicy": "Source locations are visible but do not become executable extraction sites until OMEGA has an exact game site binding.",
    "sources": [
        {"name": "Global Energy Monitor GOGET via Global Energy Map", "url": energy_url, "asOf": "2026-03", "license": "CC BY 4.0", "attribution": "Data: Global Energy Monitor, CC BY 4.0"},
        {"name": "Global Coal Mine Tracker CSV mirror", "url": coal_url, "asOf": "2026-08", "license": "Source-derived; preserve GEM attribution and verify redistribution terms", "attribution": "Data: Global Energy Monitor, CC BY 4.0"}
    ],
    "sites": sites
}
OUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(json.dumps({"output": str(OUT), "siteCount": len(sites), "countriesRepresented": output["countriesRepresented"], "sourceCounts": output["sourceCounts"], "unresolvedCounts": output["unresolvedCounts"], "rejected": output["rejected"]}, indent=2))
