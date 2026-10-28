# OMEGA Mine-to-Inventory Logistics Data V1

Manifest: resource_site_logistics_routes_v1.json  
Route shards: resource_site_logistics_routes_v1_part_01.json through part_06.json  
Test: test/omega_resource_site_logistics_routes_v1.test.mjs  
Authority: simulation-only design data, not a live transport engine.

## Coverage

The source union contains 301 eligible rows from the 315-row canonical catalog, 44 base mineplay records, 108 expanded records, 58 critical-mineral records and 50 legacy expansion records: **561 unique physical site IDs across 193 country profiles**. Alias rows and no-resource placeholders are excluded. Original source datasets remain unchanged.

## Country-grouped data parts

Six data parts are used so the later runtime can read only the selected country's routes instead of loading every route into the UI. The manifest maps each country to exactly one part. Every route includes stable site/country/resource IDs, source provenance, resource icon key, source coordinates/status, terrain profile, raw warehouse target (WH-ISO3-RAW), one to three connected transport legs, planned distance/time, per-leg payload and daily design capacity, design fleet slots, unit-conversion and site-eligibility gates, and transport SVG icon keys.

Supported profiles: truck, rail, ship, barge and pipeline.

## Estimates and dispatch safety

Distances use mine coordinates and a country map reference point with a coarse terrain factor. The reference point is not claimed to be a capital, physical warehouse, port, road, railhead, pipeline node or surveyed corridor. All distances, capacities, speeds, payloads and times are simulation design estimates.

Actual warehouse coordinates, vehicle IDs and available fleet counts were not present in the source data; actual fleet values are therefore null/unknown. Design fleet slots do not assert that vehicles exist.

Dispatch is intentionally gated for the later engine. It must validate mine eligibility and ownership/commissioning, batch unit conversion, transport assets, same-country permissions, route capacity, war/blockade/weather/infrastructure damage, reservation and idempotent arrival receipts. Inventory must only be credited after arrival; duplicate receipts must never add stock twice.

The dedicated GitHub Actions workflow validates the full source union and every route on matching pull requests.
