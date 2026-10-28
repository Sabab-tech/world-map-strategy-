# OMEGA Mine-to-Inventory Logistics Data V1

Manifest: resource_site_logistics_routes_v1.json  
Route shards: resource_site_logistics_routes_v1_part_01.json through part_06.json  
Test: test/omega_resource_site_logistics_routes_v1.test.mjs  
Authority: simulation-only logistics design; not a live transport engine.

## Coverage

The source union contains 301 eligible rows from the 315-row canonical catalog, 44 base mineplay records, 108 expanded records, 58 critical-mineral records and 50 legacy expansion records: **561 unique physical site IDs across 193 country profiles**. Alias rows and no-resource placeholders are excluded. Original source datasets remain unchanged.

## Country-grouped logistics data

The manifest maps each country to exactly one of six route shards, allowing a future runtime to load the selected country's records without placing all 561 routes in the UI at once. Every route has stable site/country/resource IDs, source provenance/status, an exact resource SVG ID and path, a WH-ISO3-RAW destination, terrain/region profile, one to three connected transport legs, design distance/time/capacity and unit/eligibility gates.

Every route resource ID maps to an exact existing icon in assets/omega-industrial-icons-v1/manifest.json. Five self-hosted, 128×128 SVG assets cover truck, freight train, bulk-carrier ship, inland barge and commodity pipeline using the metallic/navy industrial treatment. The regression test verifies every local path.

## Estimates and dispatch safety

Distances use mine coordinates and a country map reference point with a coarse terrain factor. The reference point is not claimed to be a capital, physical warehouse, port, railhead, pipeline node or surveyed corridor. All distances, capacities, speeds, payloads and times are simulation design estimates.

Actual warehouse coordinates, vehicle IDs and available fleet counts were not in the source data; actual fleet values remain null/unknown. Design fleet slots do not assert that vehicles exist.

Dispatch is intentionally gated for the later engine. It must validate mine eligibility and ownership/commissioning, batch unit conversion, transport assets, same-country permissions, route capacity, war/blockade/weather/infrastructure damage, reservation and idempotent arrival receipts. Inventory must only be credited after arrival; duplicate receipts must never add stock twice.

The dedicated GitHub Actions workflow validates the source union, all 561 routes and every referenced offline SVG on matching pull requests.
