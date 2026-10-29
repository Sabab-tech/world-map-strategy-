# OMEGA Aggregate Transport Fleet V1

## Design rule

The logistics runtime does not assign registration numbers, unique vehicle IDs, license plates, or a record per physical vehicle. A fleet is identified only by **country + mine/site + transport mode + aggregate count**. Mode counts are stored inside the selected country's existing `industrialNetwork` ledger, not in a parallel delivery system.

Each configured mode tracks total, operational, damaged, reserved, added and removed counts. The counts and transitions are simulated game state; they do not claim a verified real-world fleet or physical registration record.

## Runtime API

Add vehicles to a mine/site after selecting the player's country:

```js
Omega.ResourceIndustrialNetwork.addTransportFleet({
  countryId: "BGD",
  siteId: "SITE_BGD_COAL_01",
  transportMode: "truck",
  count: 3
});
```

Remove available vehicles with `removeTransportFleet({countryId, siteId, transportMode, count})`. A removal is blocked if it would consume units reserved by a live shipment. Read current aggregate counts through `transportFleetStatus(countryId, siteId)`. There are no vehicle registration fields or unique vehicle asset IDs.

The API is scoped to the selected player's country. Adding or removing units in another country is rejected. Existing saved games gain empty fleet ledgers lazily without deleting existing mine, resource, shipment, or receipt data.

## Dynamic route calculation

For configured fleet modes, the route calculator uses shared transport specifications (payload, speed, loading/unloading time) and the recorded country/site/mode counts. It derives required cargo loads, trip waves, fleet throughput per game day/turn, the route's bottleneck capacity and the estimated arrival turn. Adding/removing fleet units changes the next route calculation. A shipment's route and ETA remain a persisted snapshot after dispatch so an upgrade does not silently rewrite cargo already in transit.

A mode with no aggregate fleet record retains the existing explicitly marked simulation-capacity fallback; the runtime does not invent vehicle counts. Once a fleet record exists with zero available units, new dispatches through that mode are blocked until units are added. Reservations are stored by shipment and aggregate mode counts, then released on arrival.

## SVG catalog

The industrial icon manifest adds 17 local SVG variants: five road vehicle silhouettes, five rail cargo variants, five ship cargo variants, and two inland barge variants. Cargo silhouettes cover dry bulk, liquids, pressurized gas/LNG, ore and general containers. Pipeline shipments continue using the existing pipeline asset because a pipeline is route infrastructure rather than a registered vehicle. All SVGs are local, dependency-free and precached for offline launch. Existing resource/factory SVGs and generic transport SVGs are preserved.

## Verification expectations

Regression coverage must verify that (1) a missing fleet uses only the labelled simulation fallback, (2) one recorded truck limits per-turn capacity and increases trip waves, (3) adding trucks increases capacity and reduces future ETA, (4) removing available trucks lowers or blocks capacity, (5) reserved trucks cannot be removed, and (6) no per-vehicle registration fields are created.
