#!/usr/bin/env python3
"""Build a compact offline catalog of global oil/gas fields and coal mines.

Inputs are downloaded only during CI/build. The Android app consumes the generated JSON
locally; it does not call these external sources at runtime.
"""
import csv
import hashlib
import json
import math
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

def coordinate_pair(latitude_value, longitude_value):
    lat = as_float(latitude_value)
    lon = as_float(longitude_value)
    if lat is None or lon is None:
        numbers = re.findall(r"[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)", str(latitude_value or ""))
        if lat is None and numbers:
            lat = as_float(numbers[0])
        if lon is None and len(numbers) > 1:
            lon = as_float(numbers[1])
    return lat, lon

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
SITE_COUNTRY_OVERRIDES = {
    # Exact source names cross-checked against authoritative or project-level records.
    "ANGLESEA COAL MINE": ("AUS", "RESEARCHED_SITE_NAME_OVERRIDE", "https://www.gem.wiki/Anglesea_mine"),
    "CHARLESTON COAL MINE": ("NZL", "RESEARCHED_SITE_NAME_OVERRIDE", "https://mapcarta.com/W501444171"),
    "KNOX CREEK JAWBONE MINE": ("USA", "RESEARCHED_SITE_NAME_OVERRIDE", "https://www.sec.gov/Archives/edgar/data/1687187/000155837023003736/metc-20221231xex96d2.htm"),
    "MI VINA COAL MINE": ("ESP", "RESEARCHED_SITE_NAME_OVERRIDE", "https://www.boe.es/diario_boe/txt.php?id=BOE-B-2022-37429"),
    "SANTA MARIA COAL MINE": ("ESP", "RESEARCHED_SITE_NAME_OVERRIDE", "https://commons.wikimedia.org/wiki/File:Europelta_locality_map.jpg"),
    "SIERRA DE ARCOS COAL MINE": ("ESP", "RESEARCHED_SITE_NAME_OVERRIDE", "https://www.sipca.es/censo/15-INM-TER-033-029-13/Mina/Sierra/de/Arcos.html"),
    "PANIAN COAL MINE": ("PHL", "RESEARCHED_SITE_NAME_OVERRIDE", "https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P101CV2H.TXT"),
    # OMEGA has no XKX country profile. Preserve Kosovo as the reported jurisdiction while
    # routing the site through Serbia's existing game-state runtime, explicitly as a game mapping.
    "SIBOVC COAL MINE": ("SRB", "DISPUTED_JURISDICTION_MAPPED_TO_EXISTING_GAME_PROFILE", "https://www.gem.wiki/Sibovc_Coal_Mine"),
}
SITE_COORDINATE_OVERRIDES = {
    "ANGLESEA COAL MINE": (-38.39835, 144.16306, "WEB_RESEARCHED_SITE_POINT", "https://www.mindat.org/loc-342829.html"),
    # Official BOE UTM boundary vertices for the Mi Viña mine waste/coal area converted from
    # ETRS89 / UTM zone 30N to WGS84; fallback point is the area centroid, not an exact shaft.
    "MI VINA COAL MINE": (40.8343215, -0.6257263, "OFFICIAL_MINE_AREA_CENTROID_APPROXIMATE", "https://www.boe.es/diario_boe/txt.php?id=BOE-B-2022-37429"),
}
PROVINCE_COUNTRY_OVERRIDES = {
    "KEMEROVO": ("RUS", "SOURCE_PROVINCE_COUNTRY_OVERRIDE"),
    "PENNSYLVANIA": ("USA", "SOURCE_PROVINCE_COUNTRY_OVERRIDE"),
    "VICTORIA": ("AUS", "SOURCE_PROVINCE_COUNTRY_OVERRIDE"),
    "WEST COAST": ("NZL", "SOURCE_PROVINCE_COUNTRY_OVERRIDE"),
    "TERUEL": ("ESP", "SOURCE_PROVINCE_COUNTRY_OVERRIDE"),
}
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

def point_segment_distance_degrees(lon, lat, a, b):
    scale = max(0.01, math.cos(math.radians(lat)))
    x1, y1 = (a[0] - lon) * scale, a[1] - lat
    x2, y2 = (b[0] - lon) * scale, b[1] - lat
    dx, dy = x2 - x1, y2 - y1
    denom = dx * dx + dy * dy
    t = 0.0 if denom == 0 else max(0.0, min(1.0, -(x1 * dx + y1 * dy) / denom))
    return ((x1 + t * dx) ** 2 + (y1 + t * dy) ** 2) ** 0.5

def nearest_country_within(lat, lon, max_degrees=0.15):
    scale = max(0.01, math.cos(math.radians(lat)))
    candidates = []
    for cid, geometry_type, coords, bbox in country_features:
        min_lon, min_lat, max_lon, max_lat = bbox
        lon_margin = max_degrees / scale
        if lon < min_lon - lon_margin or lon > max_lon + lon_margin or lat < min_lat - max_degrees or lat > max_lat + max_degrees:
            continue
        best = float("inf")
        polygons = coords if geometry_type == "MultiPolygon" else [coords]
        for polygon in polygons:
            if not polygon:
                continue
            ring = polygon[0]
            for index in range(len(ring) - 1):
                best = min(best, point_segment_distance_degrees(lon, lat, ring[index], ring[index + 1]))
                if best <= 0.002:
                    break
            if best <= 0.002:
                break
        if best <= max_degrees:
            candidates.append((best, cid))
    candidates.sort()
    if not candidates:
        return "", None
    if len(candidates) > 1 and candidates[1][0] - candidates[0][0] < 0.02:
        return "", candidates[0][0]
    return candidates[0][1], candidates[0][0]

def site_record(prefix, cid, name, resource, lat, lon, status, source, source_url, source_record_id=None, operator=None, year=None, accuracy=None, production=None):
    cid = str(cid).strip().upper() if cid else None
    valid_coordinates = lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180
    coords = {"lat": lat, "lng": lon} if valid_coordinates else None
    coord_key = f"{lat:.4f}_{lon:.4f}" if valid_coordinates else "NO_COORDINATES"
    country_key = cid or "UNRESOLVED_COUNTRY"
    source_key = slug(source_record_id or name) or "UNKEYED_SOURCE_RECORD"
    raw_identity = "|".join([str(source_record_id or ""), str(name or ""), str(country_key), str(resource), str(coord_key)])
    identity_hash = hashlib.sha256(raw_identity.encode("utf-8")).hexdigest()[:10]
    site_id = f"{prefix}_{country_key}_{resource}_{slug(name)}_{source_key}_{coord_key}_{identity_hash}"
    status_text = str(status or "UNKNOWN").strip()
    status_key = norm(status_text)
    if status_key in country_name_to_id or status_key in {"LIGNITE", "BITUMINOUS", "SUBBITUMINOUS", "ANTHRACITE", "THERMAL", "METALLURGICAL", "MET", "ESTIMATE", "EXACT", "APPROXIMATE"} or re.fullmatch(r"[0-9]+(?:[.,][0-9]+)?", status_text):
        status_text = "UNKNOWN"
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

def valid_status(value):
    if not value:
        return False
    key = norm(value)
    return not (key in country_name_to_id or key in {"LIGNITE", "BITUMINOUS", "SUBBITUMINOUS", "ANTHRACITE", "THERMAL", "METALLURGICAL", "MET", "ESTIMATE", "EXACT", "APPROXIMATE"} or re.fullmatch(r"[0-9]+(?:[.,][0-9]+)?", str(value).strip()))

def coal_site_quality(site):
    quality = 100 if site.get("countryId") else 0
    coords = site.get("coordinates")
    if coords:
        quality += 100
        accuracy = norm((site.get("location") or {}).get("coordinateStatus"))
        if accuracy == "EXACT" or "CORRECTED EXACT" in accuracy:
            quality += 35
        elif accuracy == "APPROXIMATE":
            quality += 20
        elif accuracy == "WEB RESEARCHED SITE POINT":
            quality += 10
        elif accuracy == "OFFICIAL MINE AREA CENTROID APPROXIMATE":
            quality += 8
        elif accuracy == "UPSTREAM COORDINATE NOT INDEPENDENTLY VALIDATED":
            quality += 12
    status = norm((site.get("operation") or {}).get("status"))
    if status and status != "UNKNOWN":
        quality += 20
    if (site.get("operation") or {}).get("operator"):
        quality += 8
    if (site.get("operation") or {}).get("startYear"):
        quality += 5
    if (site.get("identity") or {}).get("countryAssignmentMethod"):
        quality += 3
    return quality

def merge_coal_sites(first_site, second_site):
    if coal_site_quality(second_site) > coal_site_quality(first_site):
        primary, secondary = second_site, first_site
    else:
        primary, secondary = first_site, second_site
    primary_record = primary.setdefault("sourceSiteRecord", {})
    secondary_record = dict(secondary.get("sourceSiteRecord") or {})
    additional = list(primary_record.get("additionalSourceRecords") or [])
    if secondary_record and secondary_record != {k: v for k, v in primary_record.items() if k != "additionalSourceRecords"}:
        additional.append(secondary_record)
    if additional:
        primary_record["additionalSourceRecords"] = additional
    primary_coords = primary.get("coordinates")
    secondary_coords = secondary.get("coordinates")
    if secondary_coords and secondary_coords != primary_coords:
        evidence = list(primary_record.get("additionalCoordinateEvidence") or [])
        item = {"coordinates": secondary_coords, "coordinateStatus": (secondary.get("location") or {}).get("coordinateStatus"), "coordinateSourceUrl": (secondary.get("location") or {}).get("coordinateSourceUrl"), "sourceRecordId": (secondary.get("sourceSiteRecord") or {}).get("sourceRecordId")}
        signature = (item["coordinates"].get("lat"), item["coordinates"].get("lng"), item.get("coordinateSourceUrl"))
        if not any((entry.get("coordinates") or {}).get("lat") == signature[0] and (entry.get("coordinates") or {}).get("lng") == signature[1] and entry.get("coordinateSourceUrl") == signature[2] for entry in evidence):
            evidence.append(item)
        primary_record["additionalCoordinateEvidence"] = evidence
    return primary

records = {}
coal_identity_index = {}
unresolved = {"energy_missing_coordinates": 0, "energy_missing_country": 0, "energy_missing_name": 0, "energy_missing_commodity": 0, "coal_missing_coordinates": 0, "coal_missing_country": 0, "coal_missing_name": 0, "coal_country_inferred_from_coordinates": 0, "coal_country_resolved_from_research": 0, "coal_country_resolved_from_province": 0, "coal_coordinates_resolved_from_research": 0, "coal_coordinates_quarantined_country_mismatch": 0, "coal_duplicate_source_rows_merged": 0}
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
energy_source_rows_seen = 0
for row in iterator:
    energy_source_rows_seen += 1
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
    source_id = cell(row, "Unit ID", "asset_id")
    original_name = first(cell(row, "Unit name", "Unit Name", "name"), source_id)
    if not original_name:
        unresolved["energy_missing_name"] += 1
    name = original_name or f"Unidentified energy source row {energy_source_rows_seen}"
    fuel = norm(cell(row, "Fuel type", "Fuel", "commodity") or "")
    resources = ["crude_oil", "natural_gas"] if "OIL" in fuel and "GAS" in fuel else (["natural_gas"] if "GAS" in fuel else (["crude_oil"] if "OIL" in fuel else []))
    commodity_identified = bool(resources)
    if not resources:
        resources = ["unknown_energy_commodity"]
        unresolved["energy_missing_commodity"] += 1
    status = first(cell(row, "Status", "status"), "UNKNOWN")
    operator = cell(row, "Operator", "operator")
    year = cell(row, "Production start year", "commissioned_year")
    accuracy = first(cell(row, "Location Accuracy", "Location accuracy"), "UPSTREAM_COORDINATE_NOT_INDEPENDENTLY_VALIDATED")
    production = first(cell(row, "Production", "Production (boe/d)", "Production (kboe/d)"))
    for resource in resources:
        site = site_record("GLOBAL_ENERGY", cid, name, resource, lat, lon, status, energy_source, energy_url, source_id, operator, year, accuracy, production)
        if not original_name or not commodity_identified:
            site["identity"]["sourceIdentityStatus"] = "INCOMPLETE_SOURCE_IDENTITY" if not original_name else "INCOMPLETE_COMMODITY_IDENTITY"
            site["operation"]["commercialExtraction"] = False
            site["operation"]["extractionEligibility"] = (
                "BLOCKED_UNRESOLVED_COUNTRY_IDENTITY" if not cid else
                ("BLOCKED_MISSING_COORDINATES" if not site["coordinates"] else
                 ("BLOCKED_INCOMPLETE_SOURCE_IDENTITY" if not original_name else "BLOCKED_UNRESOLVED_COMMODITY_IDENTITY"))
            )
        dedup_key = (cid or "UNRESOLVED_COUNTRY", resource, norm(name), source_id or "", round(lat, 4) if lat is not None else None, round(lon, 4) if lon is not None else None)
        records[dedup_key] = site
        energy_count += 1
workbook.close()

coal_source = "Global Coal Mine Tracker derived CSV mirror (source dataset attributed to Global Energy Monitor, CC BY 4.0)"
coal_url = "https://github.com/1ways/coal-mine-tracker"
coal_count = 0
coal_source_rows_seen = 0
for csv_path, default_status in [(COAL_ACTIVE, "UNKNOWN"), (COAL_CLOSED, "CLOSED")]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Required coal source file missing: {csv_path}")
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            coal_source_rows_seen += 1
            original_name = first(row.get("Mine Name"), row.get("Mine name"), row.get("name"))
            source_id = first(row.get("Mine ID"), row.get("GEM Mine ID"), row.get("Mine Name"), row.get("Mine name"), row.get("name"))
            name = original_name or source_id or f"Unidentified coal source row {coal_source_rows_seen}"
            name_key = norm(name)
            coordinate_override = SITE_COORDINATE_OVERRIDES.get(name_key)
            lat, lon = coordinate_pair(first(row.get("Latitude"), row.get("latitude")), first(row.get("Longitude"), row.get("longitude")))
            coordinate_accuracy = first(row.get("Location Accuracy"), row.get("Location accuracy"), "UPSTREAM_COORDINATE_NOT_INDEPENDENTLY_VALIDATED")
            coordinate_source_url = None
            source_latitude_value = first(row.get("Latitude"), row.get("latitude"))
            source_longitude_value = first(row.get("Longitude"), row.get("longitude"))
            source_coordinates_before_correction = {"latitudeField": str(source_latitude_value), "longitudeField": str(source_longitude_value)}
            coordinate_order_corrected = False
            if lat is not None and lon is not None and not (-90 <= lat <= 90) and -90 <= lon <= 90 and -180 <= lat <= 180:
                lat, lon = lon, lat
                coordinate_order_corrected = True
                coordinate_accuracy = "SOURCE_LAT_LON_ORDER_CORRECTED_EXACT" if norm(coordinate_accuracy) == "EXACT" else "SOURCE_LAT_LON_ORDER_CORRECTED"
            if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                if coordinate_override:
                    lat, lon, coordinate_accuracy, coordinate_source_url = coordinate_override
                    unresolved["coal_coordinates_resolved_from_research"] += 1
                else:
                    unresolved["coal_missing_coordinates"] += 1
                    lat, lon = None, None
            raw_source_coordinates = {"lat": lat, "lng": lon} if lat is not None and lon is not None else None
            cid = country_id(row.get("Country / Area"), row.get("Country"), row.get("country"))
            country_method = "SOURCE_COUNTRY_FIELD" if cid else None
            country_evidence_url = None
            province = norm(first(row.get("State, Province"), row.get("Province"), row.get("State")))
            if not cid and province in PROVINCE_COUNTRY_OVERRIDES:
                cid, country_method = PROVINCE_COUNTRY_OVERRIDES[province]
                country_evidence_url = coal_url
                unresolved["coal_country_resolved_from_province"] += 1
            country_override = SITE_COUNTRY_OVERRIDES.get(name_key)
            if not cid and country_override:
                cid, country_method, country_evidence_url = country_override
                unresolved["coal_country_resolved_from_research"] += 1
            point_country = country_from_coordinates(lat, lon) if lat is not None and lon is not None else ""
            coordinate_sign_correction = None
            if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
                swapped_point_country = country_from_coordinates(lon, lat) if -90 <= lon <= 90 and -180 <= lat <= 180 else ""
                if (cid and point_country and point_country != cid and swapped_point_country == cid) or (not cid and not point_country and swapped_point_country):
                    lat, lon = lon, lat
                    point_country = swapped_point_country
                    coordinate_order_corrected = True
                    coordinate_accuracy = "SOURCE_LAT_LON_ORDER_CORRECTED_BY_COUNTRY_GEOMETRY"
                    if not cid:
                        cid = swapped_point_country
                        country_method = "SOURCE_LAT_LON_ORDER_CORRECTED_BY_COUNTRY_GEOMETRY"
                        unresolved["coal_country_inferred_from_coordinates"] += 1
            if cid and lat is not None and lon is not None and point_country != cid:
                sign_candidates = [
                    (lat, -lon, "SOURCE_LONGITUDE_SIGN_CORRECTED_BY_COUNTRY_GEOMETRY"),
                    (-lat, lon, "SOURCE_LATITUDE_SIGN_CORRECTED_BY_COUNTRY_GEOMETRY"),
                    (-lat, -lon, "SOURCE_LATITUDE_AND_LONGITUDE_SIGNS_CORRECTED_BY_COUNTRY_GEOMETRY")
                ]
                sign_matches = [(candidate_lat, candidate_lon, correction) for candidate_lat, candidate_lon, correction in sign_candidates
                    if -90 <= candidate_lat <= 90 and -180 <= candidate_lon <= 180 and country_from_coordinates(candidate_lat, candidate_lon) == cid]
                if len(sign_matches) == 1:
                    lat, lon, coordinate_sign_correction = sign_matches[0]
                    point_country = cid
                    coordinate_accuracy = coordinate_sign_correction
            if not cid and point_country:
                cid = point_country
                country_method = "POINT_IN_COUNTRY_POLYGON"
                unresolved["coal_country_inferred_from_coordinates"] += 1
            if not cid and lat is not None and lon is not None:
                nearest_country, nearest_distance = nearest_country_within(lat, lon, 0.15)
                if nearest_country:
                    cid = nearest_country
                    country_method = "NEAREST_COUNTRY_GEOMETRY_WITHIN_0_15_DEG"
                    unresolved["coal_country_inferred_from_coordinates"] += 1
            coordinate_quarantined = False
            disputed_site_mapping = name_key == "SIBOVC COAL MINE" and country_method == "DISPUTED_JURISDICTION_MAPPED_TO_EXISTING_GAME_PROFILE"
            if disputed_site_mapping and lat is not None and lon is not None:
                coordinate_accuracy = "SOURCE_COORDINATE_IN_DISPUTED_JURISDICTION"
            elif cid and lat is not None and lon is not None:
                if point_country and point_country != cid:
                    coordinate_quarantined = True
                elif not point_country:
                    nearest_country, nearest_distance = nearest_country_within(lat, lon, 0.15)
                    if nearest_country != cid or nearest_distance is None:
                        coordinate_quarantined = True
                    elif not coordinate_source_url and not coordinate_order_corrected:
                        coordinate_accuracy = "UPSTREAM_NEAR_COUNTRY_BOUNDARY"
                if coordinate_quarantined:
                    lat, lon = None, None
                    coordinate_accuracy = "REJECTED_COUNTRY_GEOMETRY_MISMATCH"
                    unresolved["coal_coordinates_quarantined_country_mismatch"] += 1
            if not cid:
                unresolved["coal_missing_country"] += 1
            if not original_name and not source_id:
                unresolved["coal_missing_name"] += 1
            status_candidates = [row.get("Status"), row.get("Mine Site Status"), row.get("status"), default_status]
            status = next((candidate for candidate in status_candidates if valid_status(candidate)), "UNKNOWN")
            operator_candidates = [row.get("Parent Company"), row.get("Owners"), row.get("Owner"), row.get("Operator")]
            operator = next((candidate for candidate in operator_candidates if candidate and not re.fullmatch(r"[0-9]+(?:[.,][0-9]+)?", str(candidate).strip()) and norm(candidate) not in country_name_to_id and norm(candidate) not in {"LIGNITE", "BITUMINOUS", "SUBBITUMINOUS", "ANTHRACITE", "THERMAL", "METALLURGICAL", "MET", "ESTIMATE", "EXACT", "APPROXIMATE"}), None)
            year = first(row.get("Opening Year"), row.get("Year of Production"), row.get("Start Year"))
            if year is not None:
                year_match = re.search(r"(?:17|18|19|20|21)\d{2}", str(year))
                year = year_match.group(0) if year_match else None
            production = first(row.get("Production (Mtpa)"), row.get("Production"), row.get("Annual Production"))
            if production is not None and as_float(production) is None:
                production = None
            if coordinate_quarantined:
                site = site_record("GLOBAL_COAL", cid, name, "coal", None, None, status, coal_source, coal_url, source_id, operator, year, coordinate_accuracy, production)
                site["sourceSiteRecord"]["sourceReportedCoordinates"] = raw_source_coordinates
                site["sourceSiteRecord"]["coordinateQuarantineReason"] = "COUNTRY_GEOMETRY_MISMATCH"
            else:
                site = site_record("GLOBAL_COAL", cid, name, "coal", lat, lon, status, coal_source, coal_url, source_id, operator, year, coordinate_accuracy, production)
            if country_method:
                site["identity"]["countryAssignmentMethod"] = country_method
            if country_evidence_url:
                site["identity"]["countryAssignmentEvidenceUrl"] = country_evidence_url
                site["provenance"]["countryAssignmentEvidenceUrl"] = country_evidence_url
            if name_key == "SIBOVC COAL MINE":
                site["identity"].update({"sourceReportedJurisdiction":"Kosovo","jurisdictionType":"DISPUTED_TERRITORY","jurisdictionCountryId":"XKX","jurisdictionAuthority":"Source identifies Kosovo; OMEGA currently routes this site through its existing SRB game profile"})
                site["sourceSiteRecord"]["sourceReportedJurisdiction"] = "Kosovo"
                site["location"]["countryName"] = "Kosovo"
                site["location"]["coordinateJurisdiction"] = "Kosovo"
                site["provenance"]["countryAssignmentMethod"] = "DISPUTED_JURISDICTION_MAPPED_TO_EXISTING_GAME_PROFILE"
            if coordinate_order_corrected:
                site["location"]["coordinateCorrection"] = "SOURCE_LAT_LON_ORDER_CORRECTED_BY_VALID_GEOGRAPHIC_RANGES"
                site["sourceSiteRecord"]["sourceCoordinateFieldsBeforeCorrection"] = source_coordinates_before_correction
                site["provenance"]["coordinateCorrection"] = "SOURCE_LAT_LON_ORDER_CORRECTED_BY_VALID_GEOGRAPHIC_RANGES"
            if coordinate_sign_correction:
                site["location"]["coordinateCorrection"] = coordinate_sign_correction
                site["sourceSiteRecord"]["sourceReportedCoordinates"] = raw_source_coordinates
                site["provenance"]["coordinateCorrection"] = coordinate_sign_correction
            if coordinate_source_url:
                site["location"]["coordinateSourceUrl"] = coordinate_source_url
                site["provenance"]["coordinateSourceUrl"] = coordinate_source_url
            elif coordinate_override and lat is not None and lon is not None:
                alt_lat, alt_lon, alt_accuracy, alt_url = coordinate_override
                if abs(float(lat) - float(alt_lat)) > 0.001 or abs(float(lon) - float(alt_lon)) > 0.001:
                    site["sourceSiteRecord"]["additionalCoordinateEvidence"] = [{
                        "coordinates": {"lat": alt_lat, "lng": alt_lon},
                        "coordinateStatus": alt_accuracy,
                        "coordinateSourceUrl": alt_url,
                        "sourceRecordId": source_id,
                        "note": "ALTERNATE_RESEARCHED_POINT_RETAINED_NOT_USED_AS_PRIMARY"
                    }]
            if not original_name and source_id:
                site["identity"]["sourceIdentityStatus"] = "SOURCE_ID_ONLY"
                site["identity"]["sourceIdentityNote"] = "Source did not provide a display name; the stable source ID is retained as the site label"
            elif not original_name:
                site["identity"]["sourceIdentityStatus"] = "INCOMPLETE_SOURCE_IDENTITY"
                site["operation"]["commercialExtraction"] = False
                site["operation"]["extractionEligibility"] = (
                    "BLOCKED_UNRESOLVED_COUNTRY_IDENTITY" if not cid else
                    ("BLOCKED_MISSING_COORDINATES" if not site["coordinates"] else "BLOCKED_INCOMPLETE_SOURCE_IDENTITY")
                )
            base_key = ("COAL_IDENTITY", "coal", name_key, str(source_id or "").strip())
            existing_key = coal_identity_index.get(base_key)
            if existing_key is None:
                records[base_key] = site
                coal_identity_index[base_key] = base_key
            else:
                prior = records[existing_key]
                prior_country, candidate_country = prior.get("countryId"), site.get("countryId")
                if prior_country and candidate_country and prior_country != candidate_country:
                    split_key = base_key + (candidate_country,)
                    if split_key in records:
                        records[split_key] = merge_coal_sites(records[split_key], site)
                    else:
                        records[split_key] = site
                else:
                    records[existing_key] = merge_coal_sites(prior, site)
                unresolved["coal_duplicate_source_rows_merged"] += 1
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
    "sourceCounts": {"oilGasRowsExpandedToCommoditySites": energy_count, "oilGasSourceRowsSeen": energy_source_rows_seen, "coalSourceRows": coal_count, "coalSourceRowsSeen": coal_source_rows_seen},
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
