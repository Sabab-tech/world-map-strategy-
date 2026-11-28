# OMEGA Universal Daily Workload Scheduler v1

**Milestone:** Player-country daily workload orchestration
**Status:** Integrated with the existing Resource Economy turn participant
**Clock authority:** Omega.Simulation
**Checkpoint authority:** Omega.EconomyPhaseCheckpoints

## Purpose

The game must not maintain a manually written Day 1 / Day 2 / Day 3 execution list. The universal planner discovers outstanding work from the authoritative domain checkpoints and calculates which complete domain-period to execute next.

It is a workload planner, not another game clock, economic database, country scheduler, or UI renderer.

## Current registered workstreams

| Workstream | Existing page identity | Priority | Dependency | Status |
| --- | --- | ---: | --- | --- |
| Resource extraction / Mining | resource-ministry | 10 | None | Enabled when the endowment runtime is ready |
| Industrial production | industry | 20 | Resource period must be reconciled first | Enabled when the industrial runtime is ready |
| Food & Agriculture | agriculture_food | 30 | To be defined by the authoritative food runtime | Registered, execution disabled |

The existing Resource Ministry, Industry and Agriculture & Food page identities are not renamed or removed. Page identity is metadata for workload visibility and future page-level reporting; opening a page does not start or pause authoritative simulation.

## Automatic planning algorithm

1. Read the active player's canonical country and exact session ID. A missing or mismatched identity fails closed.
2. Read each enabled workstream's existing resources or industrial checkpoint. The scheduler does not copy or replace those ledgers.
3. Compute the next unprocessed period for each workstream.
4. Remove work whose dependency is not yet reconciled. For example, Industrial period 12 cannot run until Resource period 12 has committed.
5. Select the oldest eligible game period, then use the registered priority as the tie-breaker. This produces a dependency-safe sequence such as Resource 12 → Industrial 12 → Resource 13 → Industrial 13.
6. Execute bounded work slices. The default maximum is four committed period slices on constrained/mobile devices and eight on standard devices. A soft elapsed-time budget is also applied; the mandatory first pass across enabled domains is not cut off by that soft budget.
7. Yield to the browser between atomic domain-period operations. Existing mine extraction and factory-input processing retain their own cooperative yields.
8. Advance no progress in the planner's view unless the owning domain checkpoint advanced after its existing ledger/warehouse reconciliation. A failed period remains pending and blocks its dependent work.

A period slice is deliberately a whole reconciled domain period, not an arbitrary subset of factories. The industrial runtime performs country-wide requisition planning so factories do not gain an allocation advantage from asset order; splitting that transaction by factory would change its allocation semantics. Mine extraction already batches mine occurrences and yields inside its period runner.

## Why this is not a hard-coded alternating day table

A fixed table such as “Day 1 industry, Day 2 mining, Day 3 food” can violate production dependencies, skip overdue periods, or run a factory before its raw-material period is reconciled. The planner instead computes the sequence from actual outstanding checkpoints on every turn. When a save contains multiple missed periods, the planner processes a bounded number and leaves the rest visibly pending; it does not mark unfinished days complete.

The scheduler's bounded slices are periods of work, not a promise that every domain finishes in one browser frame. A single period can exceed the soft budget because existing ledger transactions are atomic. Such work yields internally where the domain already supports it and keeps its checkpoint pending until reconciliation succeeds.

## Food & Agriculture boundary

The existing agriculture_food ministry UI identity is retained. The current repository audit has not identified an authoritative crop-production, food-inventory, population-consumption and shortage-reconciliation runtime. The scheduler therefore registers the workstream as disabled with AUTHORITATIVE_FOOD_RUNTIME_NOT_AVAILABLE.

Food can be enabled by registering a real domain adapter after its production model, inventory owner, unit conventions, save/load evidence, demand calculations and reconciliation contract exist. The scheduler does not create food quantities or infer food output from the resource/factory ledgers.

## Separation of responsibilities

- Omega.Simulation remains the only game clock and turn coordinator.
- Omega.WorldSimulationScheduler continues bounded NPC PLAYER/ACTIVE/MACRO country work and world-event handling.
- Omega.DailyWorkloadScheduler plans the selected player's domain-period workload.
- Omega.EconomyPhaseCheckpoints remains the persisted source of truth for resource and industrial period progress.
- Resource, mine, warehouse, industrial, finished-goods, market, trade and Treasury ledgers remain with their existing domain authorities.
- Finance/NPC macro cadence remains on its existing scheduler path; the player planner does not duplicate it.
- Ministry page visibility remains separate from simulation execution.

## Regression coverage

test/omega_daily_workload_scheduler_v1.test.mjs covers:
- 100 daily turns and both enabled workstreams;
- dependency-safe Resource → Industrial order;
- automatic bounded catch-up slices;
- failure blocking and later recovery;
- exact player/session identity checks;
- duplicate in-flight turn coalescing;
- preservation of page IDs and disabled Food execution.

The scheduler regression is included in npm run test:omega-economy-phase-audit. Browser E2E and Android tests are not part of this change. Android test execution remains skipped.

## Player-country-first market refresh scope

The selected country owns the detailed daily resource and industrial workload. A committed-day market refresh follows the same identity and does not treat every country's stored inventory as live simulation output.

- Resource discovery uses the canonical raw-resource/factory catalog and the selected player's current inventory, production and consumption keys.
- Other countries' posted import requests and seller offers remain in the global order-book pass. They are needed for real cross-border price discovery and are not discarded.
- Other countries' baseline inventory, production, consumption and strategic-reserve keys are not scanned to manufacture daily reference-only liquidity.
- The explicit unscoped market rebuild remains available for full-world diagnostics and legacy callers.
- The snapshot index is rebuilt when the root/domain source identity or session changes. Daily country transactions update values inside existing country buckets; validating every top-level country key on every day would repeat a world-wide scan without refreshing those values.

This preserves one authoritative player-country simulation, bounded NPC/event work and the existing market/settlement authorities. It does not add another scheduler or game clock.
