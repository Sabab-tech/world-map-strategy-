# OMEGA Logistics Fleet Count Model V1

## Identity model
A fleet record is keyed by **country + mine/site + transport type + count**. Individual vehicle registration numbers and per-vehicle IDs are not required.

```json
{"countryId":"BGD","siteId":"SITE_BGD_EXAMPLE_MINE","transportType":"truck","count":8,"authority":"PLAYER_OR_GAME_STATE"}
```

This is a schema example only, not a claim about a real fleet. Never fabricate counts.

## Dynamic calculation
The existing `resource_industrial_catalog_v1.json` `transportModes` defines payload, speed, loading/unloading hours and costs. Route legs read those current values. The new `omega_logistics_transport_catalog_v1.json` defines the count-based identity model and cargo-specific SVG paths.

Whenever a country/site/mode count or transport profile changes, recalculate required loads, travel time, loading/unloading/transfer time, daily capacity and fleet sufficiency. Unknown fleet count is distinct from zero and from unlimited capacity.

## SVG coverage
Fifteen local SVG assets cover truck, train, ship, barge and pipeline across coal/dry bulk, oil/liquid fuel, gas/LNG, ore/aggregate and general cargo. Metallic surfaces and cargo-specific accent lighting keep the icons visually consistent.

## Authority
- Performance profiles: `resource_industrial_catalog_v1.json` → `transportModes`
- Actual fleet counts: authoritative gameplay/player state keyed by country, site and transport type
- Icon and schema map: `omega_logistics_transport_catalog_v1.json`

New transport types are data-driven; no individual vehicle ID or registration number is needed.
