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

## Route-mode selection and route-data authority
Legacy generic \`TRUCK_TO_RAIL_TO_TRUCK\` templates are not proof that all three physical legs exist. In the runtime calculation and route card, if a route is only a generic road/rail template, the commodity's configured \`resourceRules.preferredModes\` selects one available mode and its payload/cycle calculations use the whole estimated corridor distance. This is explicitly a **simulation estimate**, not surveyed route geometry. Explicit route profiles with recorded leg modes and leg distances remain multi-modal and are preserved. A missing leg distance blocks calculation; the model no longer invents a distance split.

## Design requirements versus actual fleet counts
The country/site/mode count is the actual in-game count. Required trucks/trains/ships/barges are derived from planned daily flow, payload per trip and round-trip cycle hours. They must not be added together as interchangeable transport units without labels. Pipeline-line requirements are only calculable when the route record supplies an explicit per-line daily capacity (\`designCapacityPerLinePerDay\`, \`capacityPerLinePerDay\`, or \`lineCapacityPerDay\`). A corridor capacity by itself is not evidence that one pipe is sufficient. When that data is missing, the UI says the design requirement is unavailable, and actual configured pipeline-line counts remain separate.

## SVG coverage
Twenty-five cargo-specific SVG assets cover truck, train, ship, barge and pipeline across coal/dry bulk, oil/liquid fuel, gas/LNG, ore/aggregate and general cargo. Metallic surfaces and cargo-specific accent lighting keep the icons visually consistent.

## Authority
- Performance profiles: `resource_industrial_catalog_v1.json` → `transportModes`
- Actual fleet counts: authoritative gameplay/player state keyed by country, site and transport type
- Icon and schema map: `omega_logistics_transport_catalog_v1.json`

New transport types are data-driven; no individual vehicle ID or registration number is needed.
