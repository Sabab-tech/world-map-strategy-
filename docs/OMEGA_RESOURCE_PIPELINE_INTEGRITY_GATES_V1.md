# OMEGA Resource-to-Factory Pipeline Integrity Gates v1

## Purpose

The CI contract must prove more than "a shipment was created." An eligible, commissioned mine-site must be able to move a traceable lot through its own sovereign logistics and into committed finished goods without unexplained quantity changes, duplicate delivery, foreign-country ownership, or a broken batch lineage.

## End-to-end acceptance path

`mine/site` -> `extraction record` -> `raw batch + inventory lot` -> `raw warehouse reservation` -> `shipment` -> `delivery receipt` -> `factory input lot` -> `scheduled production cycle` -> `finished batch` -> `finished-goods ledger`.

The exhaustive test must run the full path for every eligible unique runtime site, not just a hand-picked group. It fails closed if any eligible site cannot dispatch, be delivered, or commit finished goods. A blocked/paused cycle is a failure with diagnostics, not a passing "shipment exists" result.

## Inventory and no-leak invariants

- A delivery must reference the same source batch, shipment, factory, country, resource and shipment quantity.
- A single shipment may have exactly one successful factory-received delivery.
- Source batch and inventory-lot remaining quantity must reconcile after delivery; the raw warehouse's available quantity and reservation balance must debit/release once, with no negative or unexplained balance.
- Per-country aggregate inventory/warehouse debits for a delivery tick must equal the newly delivered quantity. Any newly created in-transit shipment must explain the reservation increase.
- Source batch, raw warehouse, shipment, delivery, factory, processed warehouse, finished batch and finished-goods ledger entry must stay inside the same country unless an explicitly modelled international-trade pipeline is used. The mine-to-factory local pipeline must not silently turn into cross-border stock.
- Finished goods must have a positive inventory balance **and** a committed finished batch whose source lineage includes the mine batch, whose destination is the local processed warehouse, and whose transaction is represented in the finished-goods ledger.
- Existing cross-country-boundary, duplicate-event/idempotency, market, fiscal and save/load regressions remain separate required gates. This exhaustive test does not replace them.

## Data provenance boundary

Scenario reserve/quantity values are gameplay parameters, not geological evidence. The separate `resource_site_reserve_simulation_v1.json` dataset must retain `authority: SCENARIO_SIMULATION_DATA`; each reserve must retain `status: SIMULATED`, explicit units, a unique site identity, and `provenance.realWorldDataRequired: false`. The additional 305 simulation-only quantity records referred to in the pipeline work must never be relabelled as observed/proven geological quantities merely because extraction and factory tests pass. Source-verified geological quantities belong in the evidence-backed canonical records and must preserve their own provenance.

## What a passing test does not prove

- The exhaustive gameplay test provisions simulation-only infrastructure, utilities, workforce and a commissioned test asset. It validates post-commission pipeline behavior; it does not claim every mine is already built/operational in every real saved game, or that every real transport route is available.
- A passing CI run proves the checked-in deterministic test fixture and code path at that commit. It does not prove every possible player action, every save, or every concurrency/timing interleaving is bug-free.
- Android 9 offline smoke is a targeted compatibility smoke test, not a guarantee for every Android device, OEM build, storage state or saved game.
- Resource-data completion and geological truth are separate from runtime correctness. Simulation-only reserve values must stay visibly labelled as such.

## Release rule

Do not weaken the exhaustive denominator to make CI green. If the runtime cannot produce a finished-goods lineage for any eligible site, inspect and fix the failing production/logistics gate, then rerun the exhaustive test and the related gameplay, country-boundary, logistics, factory, save/load and Android smoke suites. Only the actual workflow result on the resulting commit may be reported as verified.
