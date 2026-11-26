# OMEGA Economy Phase Architecture — Execution Audit (E1)

**Status:** E1 audit complete; production phase scheduling is not enabled by this change.  
**Baseline:** `main` at `87daa053ab29c834df02a2894c569ccfeb363161` (2026-11-26).  
**Scope:** inspect existing execution ownership, ordering, persistence, fiscal cadence, food-domain evidence, and safe integration points before changing economic execution.

## Executive decision

Do not add a second simulation clock or a parallel world-economy scheduler. The repository already has one authoritative `Omega.Simulation` turn coordinator, a bounded `Omega.WorldSimulationScheduler` for country autonomy/macro work, and a player-country Resource Economy participant. The resource participant currently owns a sequential resource-to-industry-to-market turn. The next implementation must evolve this existing ownership without duplicating domain ledgers or changing the canonical player-country/session identity.

This E1 change is audit-only: no production runtime, game data, save schema, economic formula, or existing test has been modified. The existing daily-clock workflow is extended only to run the focused audit regression test.

## 1. Existing execution ownership

| Runtime | Existing responsibility | Audit conclusion |
| --- | --- | --- |
| `omega_simulation_runtime.js` | One clock, authoritative world state, ordered turn participants/finalizers, save/load | Sole turn authority. `registerSubsystem` is an alias for `registerTurnParticipant`; participants are ordered by priority. |
| `omega_world_simulation_scheduler_v1.js` | Bounded PLAYER/ACTIVE/MACRO country handlers, opponent evaluation, event queue, dedupe and persisted scheduler metadata | Keep its scope. It is not a raw-resource/factory/food phase scheduler. |
| `omega_resource_economy_runtime_v2.js` | Player-country turn participant; stock-flow opening capture, demand preparation, mine production/extraction, industrial runner, country finalization, market rebuild/trade, dashboard publication | Current owner of the detailed player-country economy sequence. Its `runTurnCore(cid)` is the main separation boundary. |
| `omega_resource_industrial_network_v1.js` | Mine logistics, warehouse/factory routing, shipment and industrial execution, factory cycle lifecycle | Remains authoritative for industrial movement and production. Resource Economy calls `runCountryTurn(cid)`. |
| `omega_finance_ministry_runtime_v1.js` | Country-scoped fiscal/GDP/Treasury accrual through World Simulation Scheduler | Existing per-country finance cadence is turn-based and includes annual fiscal-year rollover. It is not a monthly fiscal-close processor. |
| `omega_enterprise_composition_root_v10.js` | Ministry UI/view-driven pump | Ministry visibility controls ministry-engine ticks. It must not become the gate for authoritative economy simulation. |

## 2. Current player-country execution order

Observed in `omega_resource_economy_runtime_v2.js` → `runTurnCore(cid)`:

1. Load economic rules.
2. Install handlers/events.
3. Capture opening stock-flow period (`GAME_TURN_<turn>`).
4. Prepare country national demand (with a legacy world-preparation fallback only when the country API is absent).
5. Initialize endowment and run country mine production/extraction (`startCountryProduction` preferred; country extraction fallback retained).
6. Call `ResourceIndustrialNetwork.runCountryTurn(cid)`.
7. Run `processCountryForTurn(cid, industrialResult)`.
8. Rebuild the selected country's global-market projection.
9. Process selected-country global trade.
10. Build/publish dashboard and deferred turn publication.

The runtime records per-stage timings when `__OMEGA_RESOURCE_ECONOMY_PERF__` is enabled. This existing profiler should be used for baseline measurements; do not introduce another profiler or scheduler clock.

The current participant is registered as `omega.resource-economy.player-country` through `registerSubsystem`/ `registerTurnParticipant`. It requires `playerSimulationCountryId()`; missing player identity returns SKIPPED rather than fabricating a country. Its turn promise is serialized and keyed by turn + country, and a successful publication token suppresses duplicate turn publication.

## 3. Non-negotiable production dependency

The Industrial Network is called after mine extraction and before country finalization/market work. Its factory runtime must retain the existing due-cycle and input allocation semantics. In particular:

- A due factory cycle must complete before a new requisition/warehouse transfer is planned.
- Factory input movement, reservations, shipment receipt and warehouse reconciliation remain with the current industrial/warehouse authorities.
- Finished goods may be recorded only when the existing production cycle completes.
- Phase separation may defer a domain's *next calculation*, but it may not skip an elapsed period, reorder a dependency, or allow a later phase to consume uncommitted upstream output.

E3/E4 must first extract pure/side-effect boundaries from the existing path and prove their ordering. They must not replace recipes, the 41 natural-resource identities, the 21 factory types, existing mine records, or ledger owners.

## 4. Existing scheduler and UI-pump distinction

The World Simulation Scheduler is already bounded: its country evaluation tiers, event queue, active-country set, and per-turn work limits are persisted under simulation state. It schedules NPC autonomy/macro work and selected-country handlers. It does not currently distribute the player's resource and industrial accounting over A/B/C phases.

Separately, the composition root's `ministryPump` maps the active UI ministry/route to a ministry engine and ticks only that view's runtime. This is a view-driven ministry engine pump, not a replacement for the Resource Economy turn participant. The phase architecture must keep economic simulation independent from which ministry is open; hidden ministries should not repaint, but their authoritative economic domain must not stop advancing when due.

## 5. Checkpoint and persistence findings

The canonical Simulation runtime already owns the save envelope and persists the authoritative world state. It records participant turn results and subsystem turn metadata; the World Simulation Scheduler persists its compact queue/cursor/dedupe metadata under simulation state. Finance also has per-country `lastProcessedTurn` duplicate protection.

However, no shared Resource/Industrial/Food phase checkpoint contract currently coordinates:
- last successfully reconciled domain period;
- pending elapsed game days;
- in-progress/failed/catching-up state;
- durable phase execution identity;
- reconciliation evidence required before checkpoint advancement.

The existing resource participant's in-memory turn-promise map and global publication token are not a substitute for durable per-domain checkpoints across save/load or reload.

**E2 contract direction:** store compact phase metadata under the existing authoritative `state.simulation` root; keep resource/factory/warehouse/treasury data with their existing owners. Each checkpoint is keyed by domain + canonical country/session scope. A checkpoint may advance only after the domain's period has completed and its authoritative ledger reconciliation has succeeded. Persist a stable execution ID and idempotency keys for mutations. Recovery must inspect prior execution status and ledger evidence before retrying; it must not blindly replay side effects. A failed or partial execution remains pending/failed and cannot be marked complete.

The exact state shape and migration behavior must be specified in E2 after save/load implementation is inspected and tested. This document intentionally does not impose a replacement schema on existing saves.

## 6. Fiscal cadence findings

Finance currently advances country fiscal/GDP/Treasury state through `advanceCountry` and `advanceFinanceProfile`, using the authoritative simulation turn duration. It tracks `lastProcessedTurn`, fiscal-year index, current-period aggregates and fiscal-period history. Rollover is currently based on fiscal-year index, not calendar-month close.

Therefore E6 must not simply relabel the existing annual rollover as monthly close. Monthly close requires a separate period identity (country + calendar year + month), exact boundary detection from the authoritative simulation calendar, one-time close records, and a defined catch-up rule for every crossed month. Cash balance remains event/transaction-driven; monthly reports aggregate already-posted events and must not debit/credit Treasury a second time.

## 7. Food and agriculture domain evidence

The repository contains food-related presentation assets and food-processing visuals, and population/consumption documentation. The E1 source-tree and code search did not identify a dedicated authoritative agriculture/food production runtime that owns crop output, food inventory, population consumption, shortage and supply reconciliation.

**Decision:** Food is not eligible to become Phase C merely by adding a scheduler label. E5 is blocked pending identification or explicit design of a real authoritative food domain, its data sources, inventory owner, unit conventions, population-demand model, persistence and ledger contract. Do not synthesize food production or mutate existing resource/factory records to imitate it.

## 8. Required phase architecture contract

| Concern | Required rule |
| --- | --- |
| Clock | Use only the existing authoritative Simulation clock/calendar. |
| Scope | Player detailed economy remains bound to the canonical active session/player country; NPC macro work stays within existing bounded scheduler tiers. |
| Immediate actions | Payments, reservations, shipment receipt, investment approval and settlement remain event/command-driven and are not delayed until a periodic phase. |
| Resource phase | Extraction, resource stock-flow, mine production evidence and resource reconciliation remain in current resource authorities. |
| Industrial phase | Due cycles, input requisitions/transfers, utilities/workforce, finished-goods output and industrial reconciliation retain current ordering and recipe semantics. |
| Food phase | Disabled until an authoritative food runtime and ledger owner are proven. |
| Fiscal close | Calendar-month period processor, separate from transaction-time Treasury posting and existing annual Finance calculations. |
| UI | Publish dirty domain changes only; never run simulation because a ministry is visible and never repaint hidden ministry screens. |
| Workload | Bounded cooperative slices with dependency priority; unfinished work remains queued and cannot be skipped because a later turn arrived. |
| Failure | A phase failure cannot advance its checkpoint. Retries must be idempotent and reconcile before commit. |
| Compatibility | Existing saves, identities, baselines, 41 resource IDs, 21 factory types, recipes, warehouses, mine/production/trade/fiscal ledgers remain authoritative and lossless. |

## 9. Milestone gates

- **E1 (this PR):** audit and architecture contract; no production behavior change.
- **E2:** checkpoint schema, save/load migration, execution journal/idempotency and recovery tests. No phase rotation until this passes.
- **E3:** resource phase extraction and daily-reference equivalence for resource stock/ledger.
- **E4:** industrial phase integration preserving due-cycle-before-requisition and all warehouse/recipe invariants.
- **E5:** only after authoritative food runtime is identified or deliberately designed as its own domain.
- **E6:** immediate event lane verification and calendar-month fiscal close; no duplicate Treasury posting.
- **Final acceptance:** focused Node regression suite and daily-reference equivalence. Android and browser E2E are explicitly outside this work.

## 10. E1 verification checklist

- [x] Confirm one authoritative Simulation clock and turn coordinator.
- [x] Identify current Resource Economy participant and exact ordered work.
- [x] Identify Industrial Network integration boundary and preserve its cycle ordering.
- [x] Distinguish NPC World Scheduler from view-driven ministry pump.
- [x] Inspect existing save/load ownership and persisted scheduler metadata.
- [x] Confirm current Finance cadence is not calendar-month close.
- [x] Search repository for authoritative food/agriculture runtime; none identified.
- [x] Keep this milestone audit-only; no production code or existing data modified.
- [ ] E2 checkpoint schema and migration tests (next milestone).


## 11. E2/E3 implementation update — 2026-11-26

E2 checkpoint infrastructure is merged and remains stored under the authoritative Simulation state. The checkpoint API now includes an additive `seed()` operation for save migration. It seeds only a new or untouched checkpoint, records the baseline turn/source, and refuses to overwrite a checkpoint that already has execution progress.

### E3 resource phase implementation

The resource phase is integrated into the existing player-country Resource Economy participant. It does not add another clock, scheduler, country loop, or ledger owner.

- The active checkpoint remains scoped to the canonical player country and exact Simulation session.
- A resource day receives a stable `productionPeriodId` scoped to that session and game turn. The existing numeric `turn` and `simulationTurn` fields remain present for compatibility.
- Missing periods are processed sequentially. Each period calls the existing `startCountryProduction` path with its own P5 `simulationTick`; elapsed days are not converted into a single multiplied extraction quantity.
- The period identity follows the existing transaction into extraction records, raw batches, warehouse receipts, mine-production ledger rows, mine outputs and extraction-path stages.
- Retry guards use the period identity. Legacy records without the new field retain a turn-based fallback only for the legacy `GAME_DAY_<turn>` identity.
- A period checkpoint advances only after the positive mine-production rows and raw-warehouse receipts match by batch identity and quantity, and the corresponding batch, inventory lot and warehouse stored-batch entry are present.
- A failed extraction or reconciliation leaves the checkpoint pending. A retry reuses the same period ID and lets the existing occurrence/ledger guards suppress already-committed work.
- Legacy baseline seeding uses the session's creation turn and existing resource execution evidence. A legacy save with no reliable resource-execution evidence starts its checkpoint at the current turn rather than extracting resources retroactively for the whole campaign.

The existing industrial runner, factory recipes, capacity/time-window calculation, market/trade path, resource catalog, occurrence identities and source datasets are not changed by E3. Industrial phase separation remains E4; the Food phase remains disabled.

### E3 regression coverage and acceptance boundary

Regression coverage is added to:
- `test/omega_simulation_runtime.test.js` — one-time legacy baseline seed and no-replay behavior.
- `test/omega_resource_endowment_runtime.test.mjs` — per-period identity propagation through extraction, P5, warehouse receipt and mine ledger contracts.
- `test/omega_resource_economy_runtime_v2.test.mjs` — sequential catch-up, ledger/warehouse reconciliation, and resource-before-industrial ordering contracts.

This implementation's GitHub Actions regression results must be checked on the exact PR head before merge. Browser end-to-end and Android tests remain excluded from this milestone.


## 12. M1–M4 runtime smoothness and industrial phase update — 2026-11-26

This addendum supersedes the earlier statement that industrial phase separation remains future E4 work. M1–M4 are implemented on the current development branch; merge remains gated by the exact-head regression checks.

### M1 — Controlled UI screen loading

- Ten UI v2 presentation renderers are removed from the initial HTML script list and loaded by `omega_ui_v2/module-loader.js` from the selected route manifest.
- The initial script list changes from 153 references to 144. The referenced JavaScript source estimate changes from 10,132,428 bytes to 9,309,447 bytes (822,981 fewer bytes, approximately 8.12%).
- Simulation, resource, economy, industrial, trade, country-data, save and compatibility scripts remain in their existing static order.
- Concurrent requests are coalesced; loaded renderers are reused; dependencies are loaded in order; failed loads can be retried; stale navigation generations cannot render over a newer route.
- All ten route renderers remain in the service-worker offline precache, but are not referenced by the initial HTML and are not evaluated until their route is opened. Existing cached copies are migrated during app updates.

### M2 — Active Industry screen freshness

- Industry runtime events are mapped to the tabs they can affect.
- Relevant events are coalesced into a 180 ms in-place refresh rather than routing through the navigation/loading overlay.
- Events scoped to another country are ignored.
- Screen cleanup cancels pending refresh work and removes only the listeners registered by this screen. Existing factory-coverage listeners remain untouched.

### M0 support — bounded runtime observability

- Each ordered Simulation turn participant records last, average, maximum and rolling p95 execution duration.
- Rolling samples are bounded to 32 per participant and the diagnostic map is bounded to 256 participant records.
- Dropped scaled time is exposed in Simulation diagnostics and emitted as `OMEGA_SIMULATION_TIME_DROPPED` for both the clock's one-step-per-frame cap and the in-flight frame queue cap.
- Timing samples remain process-local diagnostics; they are not a second save-state authority.
- The documented authoritative 1x day cadence is 15 seconds, matching `STEP_MS` and the composition root.

### M3 — Transaction-scoped inventory copy optimization

- `resource.inventory` is a flat resource-ID-to-quantity map in the authoritative economy contract. The dedicated `cloneInventoryQuantities` path copies scalar balances directly in a bounded key loop rather than recursively entering the generic clone and allocating a traversal map for each scalar entry.
- Nested legacy values still use the existing deep-clone routine with a shared seen table, preserving root cycles, nested cycles, and shared object identity. Prototype-pollution keys, functions, and undefined values retain the generic clone's filtering rules.
- The specialized copy is limited to the resource inventory quantity map used by transaction handlers, finalization before/after inventory snapshots, and the detached dashboard inventory summary.
- Batches, inventory lots, warehouses, industrial networks, receipts, and ledgers continue using deep copies because they contain nested mutable transaction evidence and rollback-sensitive state.
- Regression coverage verifies detached scalar quantities, nested isolation, cycles, shared references, prototype-key filtering, and use at the inventory snapshot/transaction boundaries.
- This removes per-entry recursive clone/WeakMap overhead; it does not skip the authoritative inventory key scan or change inventory ownership, mutation, transaction rollback, or reconciliation.

### M4 — Checkpointed elapsed-time industrial production

- The existing Resource Economy participant remains the only production-phase orchestrator. It runs resource extraction first, then industrial production, with no additional clock or scheduler.
- Industrial checkpoints use the existing `Omega.EconomyPhaseCheckpoints` API under the existing `industrial` domain and are scoped by the active Simulation session and canonical player country.
- Missed industrial days are processed sequentially with stable session/day period IDs. Existing shipping, construction, factory-input and cycle functions remain the execution authority.
- Factory cycles, output batches, inventory lots, processed-warehouse receipts, finished-goods ledger rows and inventory ledger rows carry the same production-period identity.
- Construction progress has a per-period idempotency guard. Factory output continues to use the existing recipe, transaction, resource and warehouse identities.
- The period journal is bounded. A completed period is idempotent; failed partial execution remains `RECOVERY_REQUIRED` and is retried under the same period identity.
- The industrial checkpoint advances only after finished-goods ledger rows, inventory-ledger transactions, warehouse receipts, stored batch IDs, batches and inventory lots reconcile by identity and quantity.
- A legacy save baseline starts from its reliable session execution boundary; missing evidence does not retroactively create years of output. Catch-up is bounded to 365 periods per execution attempt.

### M1–M4 validation boundary

- Focused UI, clock, resource, industrial, economy, save and architecture regressions are run on the exact PR head.
- Browser E2E and Android device/WebView tests remain excluded for this milestone. Android APK compilation, when run by CI, is a build only and is not an Android test.
- A failed checkpoint or reconciliation remains a failure; no checkpoint is advanced by a green-looking UI or a later market phase.
