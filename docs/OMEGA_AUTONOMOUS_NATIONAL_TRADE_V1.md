# OMEGA Autonomous National Trade Decision Engine v1

## Purpose and ownership

This module is a bounded decision orchestrator, not another economy, market, scheduler, inventory, FX, transport, or settlement engine. It consumes existing country resource-demand snapshots, Global Market quotes and supplier availability, bilateral diplomacy, Global Trade FX values, and the Bilateral Trade Agreement API. Trade state is changed only through the existing Ministry Interoperability transaction and bilateral API.

The player-selected country is always excluded. The handler runs only on the existing World Simulation Scheduler's ACTIVE and MACRO tiers. It creates no timer, worker, animation loop, world-roster scan, or network-backed AI request.

## Country-scoped demand evidence

The engine does not read the player's cached `resource.demandRuntime` as an NPC snapshot. It calls the additive `Omega.ResourceNationalDemandRuntime.evaluateDemand(countryId)` API. This API reuses the canonical demand formula, resource catalogue, country population/economy/military observations, active factory recipe capacity, inventory book, protected stock, and confirmed inbound import requests. It returns a bounded read-only `profiles` array with demand, available/spendable stock, inbound quantity, unresolved requests, deficit, surplus, provenance and UNKNOWN markers. It never debits inventory, publishes a demand cache, changes the country state, or sends a Ministry command.

The detailed Resource Economy turn participant remains player-country-only. NPC countries receive only this read-only demand calculation; their mine/factory production is not simulated in parallel or on every world turn. Resource identities remain sourced from the existing resource profiles and observed country state.

## Physical stock-flow and loss evidence

The Resource Economy runtime now exposes an additive physical-evidence API, with all mutations routed through the existing Resource Ministry command handlers:

- `captureStockFlowPeriod(countryId)` records the opening inventory/batch position for `GAME_TURN_n` before player-country extraction, transport, production and settlement work. The following turn captures the prior period's closing position where turns are contiguous.
- `writeOffInventory(countryId, {eventId, resourceId, quantity, unit, reason})` debits only free, warehouse-backed physical stock. It updates aggregate inventory, the appropriate raw/processed warehouse, batch remainder, inventory lot, inventory ledger and canonical stock-loss ledger atomically. Event IDs are idempotent; a conflicting replay is rejected.
- `processStorageDeterioration(countryId, {policy, knownResourceIds})` accepts only explicitly simulation-only policy. It uses per-commodity grace turns and per-eligible-turn rates, persists fractional carry by batch, and creates measured-zero observations without synthetic loss rows.
- `recordShipmentLoss(countryId, {eventId, shipmentId, resourceId, quantity, reason})` binds the loss to the real shipment and source batch. Mine-held cargo loss changes the shipment, held-flow and batch balances without debiting already-dispatched warehouse stock a second time. Factory-bound loss adjusts the actual source inventory, warehouse availability, reservation, batch, lot and unit-bridged target quantity.
- `attestStockLossCoverage(countryId, source)` records source-scoped STORAGE, TRANSPORT and PRODUCTION coverage. Production measurements distinguish MEASURED_EVENTS, MEASURED_ZERO and UNOBSERVED; a reported loss cannot exceed its consumed input. Both `PRODUCTION_TRANSACTION_COMMITTED` and `FACTORY_MULTI_INPUT_PROCESSING_COMMITTED` records participate in production attestation. A multi-input factory run without source-bound loss evidence remains PARTIAL/UNOBSERVED; it is never treated as a measured zero. A later physical loss invalidates prior period attestation.

These are simulation-game physical ledgers, not claims about measured real-world commodity deterioration or losses. Unknown measurement remains UNOBSERVED. The Resource Economy regression suite exercises stock write-off, fractional deterioration, mine-haul and factory-bound cargo losses, output-residue coverage, production-loss bounds, measured-zero evidence, replay idempotency and post-attestation invalidation.

The active-country Resource Economy turn participant captures the opening stock-flow period before its first physical mutations. Other countries are not started in parallel detailed factory/mine simulations.

## Per-country state machine

Each NPC country has a checkpoint at `trade.autonomousNationalTradeDecision`, owned by the Trade Ministry and written through Ministry Interoperability:

1. **PLAN** calls `Omega.ResourceNationalDemandRuntime.evaluateDemand(countryId)` for a fresh country-scoped read-only snapshot and combines it with a bounded list of known diplomatic partners. It ranks at most three import/export opportunities.
2. **MARKET_INTELLIGENCE** checks the existing bilateral market snapshot. It performs at most one on-demand sync per country visit when the snapshot is stale or missing.
3. **VALIDATE** delegates final stock, reserve, contract commitments, domestic requirement, FX, Treasury and market-evidence checks to `BilateralTradeAgreementV1.previewProposal()`. Only FEASIBLE evidence may authorize a proposal.
4. **COUNTEROFFER** evaluates at most one own-outbox counteroffer per visit. It checks cleared seller price, the configured premium/discount boundary and bilateral feasibility; accepted terms use `acceptCounteroffer()`. A rejected counteroffer is recorded through the existing `OMEGA_BILATERAL_APPLY_RESPONSE` handler.
5. **EXPERIENCE** updates partner observations only from existing completed/failed delivery counters and SETTLED-only bilateral trade balance evidence. Missing evidence remains UNKNOWN.

The PLAN, market-sync and validation phases are deliberately split across visits. This keeps synchronous work bounded because the scheduler can yield between country handlers but cannot interrupt a long handler midway.

## Decision rules

- Import need = max(0, target coverage × known daily demand − spendable stock − confirmed inbound).
- Export surplus = max(0, spendable stock after domestic consumption − domestic reserve coverage).
- Existing unresolved import requests, pending proposals, active bilateral contracts, blocked routes/embargo supplier lists, war/sanctions, unknown diplomacy, unknown demand, unknown stock, missing cleared price, and unknown FX are not converted to zero or used to authorize a contract.
- Partner discovery uses the supplier list returned by the existing Global Market for imports and only the country's bounded, already-known diplomatic relation keys for exports. It does not enumerate the 197-country roster.
- Candidate ranking is deterministic. It considers need/surplus urgency, observed relation score, known delivery reliability and buyer-currency cost where available.
- Contracts use the existing bilateral channel, market-linked pricing, 12-month duration and 30-day delivery intervals by default. Existing preview/activation rules remain authoritative.

## Bounds

The rules file caps work at four demand rows, eight known relationship candidates, one full Global Market supplier-roster scan, three retained supplier rows, three ranked trade candidates, one market-intelligence sync, one new proposal and one counteroffer evaluation per NPC country visit. Import supplier candidates are ranked by cleared buyer-currency cost before relationship and reliability tie-breakers. The engine persists its phase and resumes on the next scheduler selection. It does not create a second scheduler or alter the scheduler's own 8/4 macro and 4/2 active country caps or time budgets.

## Rollout and diagnostics

The checked-in production rules enable Phase 2 as one atomic configuration:
- `autonomousProposals: true`
- `autonomousCounteroffers: true`
- `marketIntelligenceSyncEnabled: true`

The runtime rejects partial configurations. All three flags must be enabled together or disabled together. Explicit read-only mode remains available for controlled tests and staged diagnosis, but it is not the production default.

The production rollout is constrained by the existing scheduler and bilateral authority: one supplier scan, one market-intelligence sync, one new proposal and one counteroffer evaluation per country visit. A ranked candidate is not itself a trade; the existing `previewProposal()` must return FEASIBLE before a proposal is sent. Counteroffers require a current market snapshot, cleared seller price, the configured price boundary and a FEASIBLE bilateral preview. No direct inventory reservation, FX movement, Treasury debit, shipment or settlement is performed by the decision engine.

The scheduler handler never awaits the rules-file network fetch. Rules are preloaded during initialization; until ready, a scheduler visit returns immediately with `DEFERRED`. If rules cannot be loaded offline, the engine remains disabled instead of blocking the turn.

The public diagnostics API is `Omega.AutonomousNationalTradeDecisionV1.diagnostics()`; `getDecisionPlan(countryId)` exposes the current ranked candidate list and current phase for tests/debugging.

The engine does not create import requests or settle payments directly. A proposal is not a contract; the existing bilateral recipient review, two-sided contract replication, Global Trade request processing, stock reservation, FX, Treasury and settlement pipeline remain authoritative.
