# OMEGA Mine-to-Inventory Logistics Manifest v1

## Scope
This is a data-foundation change only. It adds one logistics record for each of the 561 unique eligible mine-site IDs in the current canonical/expansion roster. It does not create vehicles, dispatch shipments, mutate inventory, or claim live geographic routing.

## Per-site data
- Site/country/resource identity and source coordinates where available.
- Terrain-aware preferred mode and candidate modes (truck, rail, ship, pipeline).
- Route and leg IDs, estimated distance, nominal per-trip and daily capacity, transit/handling/total ETA.
- Transfer nodes, transport-asset binding placeholders, hazard class, terrain/weather/road/rail/port/pipeline checks.
- Country-boundary policy defaults to deny unless explicit permission exists.
- Raw inventory destination, receipt event, required receipt fields, idempotency key, and quantity reconciliation rule.
- UI presentation metadata for the existing mining/resource inventory design; no vehicle-building controls are added here.

## Safety and truth labels
All generated distances, capacities, travel times, and route selections are marked as simulated gameplay estimates. Route geometry is null and route status is PLANNED_NOT_GEOGRAPHICALLY_ROUTED. All transport assets remain UNBOUND for the Transport Ministry to own and bind later. These records are not proof of actual roads, rail lines, ports, pipelines, fleet ownership, or real-world travel times.

## Next runtime phase
1. Bind eligible production batches to this manifest by exact site ID.
2. Reserve capacity before dispatch; split shipments by per-trip capacity.
3. Enforce route damage, weather, blockade, ownership, hazard, and transit-permission checks.
4. Advance shipment legs by simulation turns and make delivery idempotent.
5. Post inventory only on a matching delivered-shipment receipt; never on a route plan.
6. Show selected-country routes/status only in the Mining/Inventory UI, with transport construction and fleet ownership remaining in the Transport Ministry.

## Validation
Run `node --test test/omega_mine_inventory_logistics_manifest.test.mjs`.
