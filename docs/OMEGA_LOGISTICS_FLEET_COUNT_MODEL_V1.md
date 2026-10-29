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
Twenty cargo-specific SVG variants cover truck, train, ship and barge across dry bulk, liquid, gas, ore and general cargo. Separate layered mine-site and raw-warehouse node SVGs complete the route diagram. Pipeline icon assets remain local and separate.

## Authority
- Performance profiles: `resource_industrial_catalog_v1.json` → `transportModes`
- Actual fleet counts: authoritative gameplay/player state keyed by country, site and transport type
- Icon and schema map: `omega_logistics_transport_catalog_v1.json`

New transport types are data-driven; no individual vehicle ID or registration number is needed.


## Mine route design counts and in-game controls

The Resource Ministry reads and writes the existing getTransportFleet / setTransportFleet records keyed by country, mine/site and transport mode. It does not create a parallel fleet ledger or individual vehicle identities. Route cards show the configured count separately from modeled design need and expose count changes only for the active player country.

For each mine route leg, the baseline design requirement is ceil(simulatedProductionPerDay / compatibleLegCapacityPerUnitPerDay). Production and route capacity units must match after explicit unit normalization. If rate data or a compatible conversion is absent, the requirement remains unknown; a placeholder count is never presented as a calculation. Pipeline totals are counted as lines, not vehicles. A mine-to-warehouse route shows only the modes present in its own route legs. All 561 existing route records, source records and inventory identifiers remain preserved.
