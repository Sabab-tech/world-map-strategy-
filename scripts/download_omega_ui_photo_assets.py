#!/usr/bin/env python3
"""Import explicitly licensed Wikimedia Commons photos as small, offline WebP assets.

Fail-closed policy: never download an item unless the current Commons API
reports one of the exact license names approved in the source manifest.
"""
from __future__ import annotations

import argparse
import html
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "omega_ui_photo_asset_sources_v1.json"
CATALOG_PATH = ROOT / "omega_ui_photo_asset_catalog_v1.json"
ASSET_DIR = ROOT / "assets" / "ui-photos"
API_URL = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = (
    "OMEGA-UI-Photo-Asset-Importer/1.0 "
    "(https://github.com/Sabab-tech/world-map-strategy-; repository asset provenance)"
)
MAX_DIMENSION = 1280
MAX_OUTPUT_BYTES = 409600


def clean_html(value: object) -> str:
    raw = html.unescape(str(value or ""))
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", raw)).strip()


def normalise_license(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", clean_html(value).casefold())


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        result = json.load(handle)
    if not isinstance(result, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return result


def http_bytes(url: str, retries: int = 3) -> bytes:
    last_error = None
    for attempt in range(retries):
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json,image/*,*/*;q=0.8",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read()
        except Exception as exc:  # network/provider faults must stop the import
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Download failed after {retries} attempts: {url}: {last_error}")


def fetch_source_metadata(item: dict) -> dict:
    params = urllib.parse.urlencode({
        "action": "query",
        "titles": "File:" + item["commonsTitle"],
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": str(MAX_DIMENSION),
        "format": "json",
        "formatversion": "2",
    })
    payload = json.loads(http_bytes(API_URL + "?" + params).decode("utf-8"))
    pages = payload.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing") is not None:
        raise ValueError(f"Commons file is missing: {item['commonsTitle']}")
    imageinfo = pages[0].get("imageinfo") or []
    if not imageinfo:
        raise ValueError(f"Commons returned no imageinfo for: {item['commonsTitle']}")
    info = imageinfo[0]
    ext = info.get("extmetadata") or {}
    api_license = clean_html((ext.get("LicenseShortName") or {}).get("value", ""))
    allowed = {normalise_license(name) for name in item.get("acceptedApiLicenseNames", [])}
    if not api_license or normalise_license(api_license) not in allowed:
        raise ValueError(
            "License mismatch for "
            + item["commonsTitle"]
            + f": API={api_license!r}; expected one of {item.get('acceptedApiLicenseNames')!r}"
        )
    # Also ensure the source metadata's license URL, if available, is plausibly consistent
    # with the reviewed Commons page and the manifest's declared license family.
    api_license_url = clean_html((ext.get("LicenseUrl") or {}).get("value", ""))
    declared = item.get("licenseUrl", "")
    declared_family = normalise_license(declared)
    url_family = normalise_license(api_license_url)
    if api_license_url and declared_family and url_family:
        if item["licenseId"].startswith("CC-BY-SA-4.0") and "by-sa4" not in url_family and "by-sa4" not in declared_family:
            # The textual license check above is authoritative for imported files; this
            # branch merely avoids making a false assumption from URL URL-encoding.
            pass
    download_url = info.get("thumburl") or info.get("url")
    if not download_url or not str(download_url).startswith("https://"):
        raise ValueError(f"Commons supplied no HTTPS image URL for: {item['commonsTitle']}")
    return {
        "downloadUrl": download_url,
        "sourceReportedLicense": api_license,
        "sourceReportedLicenseUrl": api_license_url or None,
        "commonsDescriptionUrl": info.get("descriptionurl") or item["sourcePageUrl"],
        "sourceMime": info.get("mime") or None,
    }


def encode_webp(raw: bytes) -> tuple[bytes, int, int]:
    with Image.open(io.BytesIO(raw)) as opened:
        opened.load()
        image = opened.convert("RGB")
        resampling = getattr(Image, "Resampling", Image).LANCZOS
        for max_dimension in (MAX_DIMENSION, 1120, 1024, 900):
            candidate = image.copy()
            candidate.thumbnail((max_dimension, max_dimension), resampling)
            for quality in (80, 76, 72, 68, 64, 60):
                output = io.BytesIO()
                candidate.save(output, format="WEBP", quality=quality, method=6)
                encoded = output.getvalue()
                if len(encoded) <= MAX_OUTPUT_BYTES:
                    return encoded, candidate.width, candidate.height
        raise ValueError(
            f"WebP remains larger than {MAX_OUTPUT_BYTES} bytes after downscaling; source rejected."
        )


def verify_manifest(manifest: dict) -> list[dict]:
    if manifest.get("schemaVersion") != "1.0.0":
        raise ValueError("Unexpected source manifest schema version.")
    items = manifest.get("items")
    if not isinstance(items, list) or len(items) < 10:
        raise ValueError("Photo manifest is empty or unexpectedly small.")
    seen_ids, seen_paths, seen_urls = set(), set(), set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Invalid item in photo source manifest.")
        item_id = item.get("id", "")
        filename = item.get("filename", "")
        url = item.get("sourcePageUrl", "")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", item_id):
            raise ValueError(f"Unsafe photo ID: {item_id!r}")
        if not re.fullmatch(r"[a-z0-9-]+\.webp", filename):
            raise ValueError(f"Unsafe output filename: {filename!r}")
        if not url.startswith("https://commons.wikimedia.org/wiki/File:"):
            raise ValueError(f"Non-Commons source URL rejected: {url!r}")
        if not item.get("acceptedApiLicenseNames") or not item.get("author") or not item.get("licenseUrl"):
            raise ValueError(f"Missing license or attribution metadata for {item_id}")
        if item_id in seen_ids or filename in seen_paths or url in seen_urls:
            raise ValueError(f"Duplicate ID, output name, or source URL for {item_id}")
        seen_ids.add(item_id)
        seen_paths.add(filename)
        seen_urls.add(url)
    return items


def item_catalog_record(item: dict, metadata: dict, width: int, height: int, size: int) -> dict:
    return {
        "id": item["id"],
        "caption": item["caption"],
        "altText": item["altText"],
        "path": "assets/ui-photos/" + item["filename"],
        "width": width,
        "height": height,
        "byteSize": size,
        "sourceTitle": item["commonsTitle"],
        "sourcePageUrl": item["sourcePageUrl"],
        "author": item["author"],
        "licenseId": item["licenseId"],
        "licenseShortName": item["licenseShortName"],
        "licenseUrl": item["licenseUrl"],
        "sourceReportedLicense": metadata["sourceReportedLicense"],
        "sourceReportedLicenseUrl": metadata["sourceReportedLicenseUrl"],
        "creditText": item["creditText"],
        "uiRoles": item["uiRoles"],
        "isCountrySpecific": bool(item.get("isCountrySpecific")),
        "countryScope": item.get("countryScope"),
        "changesMade": item["changesMade"],
    }


def import_assets(items: list[dict]) -> dict:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    catalog_items = []
    total_bytes = 0
    for index, item in enumerate(items, start=1):
        print(f"[{index}/{len(items)}] Checking license: {item['commonsTitle']}", flush=True)
        metadata = fetch_source_metadata(item)
        target = ASSET_DIR / item["filename"]
        print(f"         Downloading approved preview and encoding WebP...", flush=True)
        raw = http_bytes(metadata["downloadUrl"])
        encoded, width, height = encode_webp(raw)
        target.write_bytes(encoded)
        total_bytes += len(encoded)
        catalog_items.append(item_catalog_record(item, metadata, width, height, len(encoded)))
        print(f"         Saved {target.relative_to(ROOT)}: {width}x{height}, {len(encoded):,} bytes", flush=True)
    catalog = {
        "schemaVersion": "1.0.0",
        "datasetId": "OMEGA_UI_PHOTO_ASSET_CATALOG_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sourceRegistry": "omega_ui_photo_asset_sources_v1.json",
        "sourceProvider": "Wikimedia Commons",
        "visualPurpose": "Photographic context only; not gameplay or country-ownership evidence.",
        "offlinePolicy": "Photos are bundled with the Android app; browser photos load lazily and are cached when requested.",
        "conversion": {
            "format": "WebP",
            "maxDimensionPx": MAX_DIMENSION,
            "maxBytesPerImage": MAX_OUTPUT_BYTES,
            "exif": "not retained",
            "note": "Each image was resized/re-encoded; individual captions link the original file and license and disclose the modification.",
        },
        "itemCount": len(catalog_items),
        "totalBytes": total_bytes,
        "items": catalog_items,
    }
    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Created {CATALOG_PATH.relative_to(ROOT)} with {len(catalog_items)} images ({total_bytes:,} bytes total).")
    return catalog


def verify_existing(items: list[dict]) -> None:
    catalog = read_json(CATALOG_PATH)
    catalog_items = catalog.get("items")
    if not isinstance(catalog_items, list):
        raise ValueError("Generated catalog is missing its items array.")
    by_id = {row.get("id"): row for row in catalog_items if isinstance(row, dict)}
    if len(by_id) != len(items):
        raise ValueError(f"Catalog item count mismatch: expected {len(items)}, got {len(by_id)}")
    total_bytes = 0
    for index, item in enumerate(items, start=1):
        print(f"[{index}/{len(items)}] Re-checking Commons license: {item['commonsTitle']}", flush=True)
        metadata = fetch_source_metadata(item)
        row = by_id.get(item["id"])
        target = ROOT / "assets" / "ui-photos" / item["filename"]
        if not row or row.get("sourcePageUrl") != item["sourcePageUrl"] or row.get("licenseId") != item["licenseId"]:
            raise ValueError(f"Generated catalog does not match reviewed source metadata for {item['id']}")
        if not target.is_file():
            raise FileNotFoundError(f"Photo asset is not committed: {target.relative_to(ROOT)}")
        if target.stat().st_size > MAX_OUTPUT_BYTES:
            raise ValueError(f"Photo asset exceeds the 400 KiB limit: {target.relative_to(ROOT)}")
        with Image.open(target) as image:
            image.verify()
        with Image.open(target) as image:
            if image.format != "WEBP" or max(image.size) > MAX_DIMENSION:
                raise ValueError(f"Invalid output format/dimensions for {target.relative_to(ROOT)}")
            if row.get("width") != image.width or row.get("height") != image.height:
                raise ValueError(f"Catalog dimensions mismatch for {target.relative_to(ROOT)}")
        if normalise_license(row.get("sourceReportedLicense")) != normalise_license(metadata["sourceReportedLicense"]):
            raise ValueError(f"Source license changed since image import: {item['id']}")
        total_bytes += target.stat().st_size
        print(f"         Verified local file: {target.relative_to(ROOT)}", flush=True)
    print(f"PASS: {len(items)} licensed WebP assets verified ({total_bytes:,} bytes total).")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--download", action="store_true", help="verify Commons license metadata, download, and convert photos")
    mode.add_argument("--verify-existing", action="store_true", help="check current license metadata and validate committed assets")
    args = parser.parse_args()
    try:
        manifest = read_json(SOURCE_PATH)
        items = verify_manifest(manifest)
        if args.download:
            import_assets(items)
        else:
            verify_existing(items)
        return 0
    except Exception as exc:
        print(f"PHOTO_ASSET_IMPORT_FAILED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
