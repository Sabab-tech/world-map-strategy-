# OMEGA Private Enterprise Opening Factory Baseline V1

## Scope

This additive dataset creates a country-specific opening allocation for five fictional global private companies. It is separate from the existing government factory baseline, the 21-category factory catalog, observed UNIDO establishment data, and commissioned production assets.

It covers exactly 197 core countries and the same 21 canonical factory types. It adds no new factory identity, recipe, resource identity, active asset, worker, stock, input, output, shipment or cash balance.

## Allocation rule

- If the government starting baseline is zero for a country/category, the private allocation and all five company allocations are exactly zero.
- Otherwise, private starting allocation is an additional integer count from 0% through 60% of the government starting count. It never reduces or replaces government units.
- The maximum integer is floor(government count × 0.60). A deterministic country/category target rate is rounded to integer units and bounded by this cap.
- Each private unit is assigned exactly once to one of the five stable company IDs using factory-category affinity, country industrial archetype and relevant specialization. Affinity is a preference, not a legal lock.
- All five company IDs appear in every country; company category counts sum exactly to the private category count.

## Country differentiation

The opening rate is a game-balance estimate derived from the existing baseline's comparable macro-sector context (manufacturing, industry and services value added), manufacturing band and factory specializations. Category adjustments account for specialization, manufacturing intensity, agriculture employment, services context and strategically state-heavy industries.

These inputs do not measure real private ownership. A percentage of manufacturing GDP is not a private-factory ownership statistic. This dataset is simulation-only and must not be displayed as observed private establishment counts.

Where macro context is unavailable, the generator uses a conservative specialization-only model. If neither comparable context nor specialization exists, private allocation is zero. Missing source metrics remain null.

## Stable companies

| Company ID | Company | Primary affinity |
|---|---|---|
| AURORA_INDUSTRIAL_GROUP | Aurora Industrial Group | Materials, metals, chemicals and industrial feedstock |
| MERIDIAN_ENGINEERING_GROUP | Meridian Engineering Group | Machinery, heavy engineering, vehicles and transport equipment |
| NOVA_CONSUMER_INDUSTRIES | Nova Consumer Industries | Textiles, garments, food, paper and packaging |
| ATLAS_TECHNOLOGY_CORPORATION | Atlas Technology Corporation | Electronics, semiconductors, batteries, precision and advanced manufacturing |
| TERRA_INFRASTRUCTURE_GROUP | Terra Infrastructure Group | Cement, construction materials, glass, ceramics and recycling |

The same five immutable IDs are reused in every country; no country-specific copies are created.

## Runtime and safety status

omega_private_enterprise_registry_v1.js is a read-only baseline lookup API. It cross-validates the 197 × 21 matrix against the already-loaded government baseline and exposes company/category allocations. Its fetch is deferred rather than part of the ordinary initial boot. **The original in-card Manage entry-point described in the first version of this document is superseded by the 2026-11-06 decision below:** private-company activity belongs in the existing Production Ministry → Lines tab, after the compact phone-first design is reviewed. The registry remains read-only. It does not create productionAssets, reserve or transfer inventory, dispatch shipments, consume inputs, generate finished goods, post sales or write finance journals.

This deliberate boundary preserves the SAB-42 prerequisite: the existing real-game Mine → Logistics → Inventory → Factory Input → Finished Goods → save/load path must have browser-level proof before autonomous private production is enabled. The existing Resource Industrial Network, Inventory, Trade, Global Market, Finance and Treasury remain the only future authorities.

## Generation and verification

~~~sh
node scripts/build_country_private_factory_starting_baseline_v1.mjs
node scripts/build_country_private_factory_starting_baseline_v1.mjs --check
node --test test/omega_private_enterprise_baseline_v1.test.mjs
~~~

Tests enforce exact country/company/category coverage, deterministic output, integer reconciliation, the zero-category rule, the 60% cap and non-commissioned simulation-only provenance.


## Opening allocation calibration revision (2026-11-06)

The private opening allocation was recalibrated upward using the same country-level economic-sector context and specialization evidence. The five stable company identities, 197-country roster and 21 canonical factory categories are unchanged.

- Government opening baseline: 15,920 abstract factory units.
- Private opening baseline: 6,307 abstract factory units (previously 4,839).
- Aggregate private-to-government ratio: 39.6%; this is a model output, not a target or permission to exceed any category cap.
- The strict per-country/per-category rule remains private count <= floor(government count * 0.60).
- Government-zero categories remain private-zero. Countries without comparable macro context or specialization evidence remain at zero rather than receiving invented allocations.
- Company allocation still reconciles exactly to the five stable global company IDs. Opening allocations remain static and not commissioned; they create no production, inventory, shipments, output, sales or cash movements.

## SAB-42 Production Ministry / Lines tab — phone-first design review (2026-11-06)

**Status: design specification for review only.** This section supersedes the earlier Factory Card Manage entry-point and any desktop-first mockup. Do not implement the replacement Line-tab UI until the compact phone-first direction has been reviewed. All implementation remains in the existing PR #408.

### Hard constraints

- OMEGA is a geopolitical strategy game. Companies mostly operate autonomously under national policy; do not add a company-by-company management simulator, per-frame company AI or separate ministry.
- Keep exactly the five existing global company IDs, 197 countries, 21 canonical factory types and 41 resource IDs. Add no catalog entries or country-specific copies of the global identities.
- For every country × factory type, private opening units are integer and <= floor(0.60 × government opening units). If government is zero, private opening is zero. Unknown is distinct from zero.
- Opening allocations are static simulation cohorts, not commissioned assets, operating capacity, lines, inventory or output.
- No private production activation until SAB-34 proves the existing Mine → Logistics → Inventory → Factory Input → Finished Goods → save/load path in a real browser/game.
- Use the existing production, inventory, logistics, trade, market, Finance and Treasury authorities. No shadow ledger, duplicate shipment, duplicated procurement or fake cash.
- Keep the existing Production Ministry tabs and semantics: Factories, Lines, Input, Stock, R&D and Projects. No separate Companies ministry/tab and no use of Factory Card Manage as the main private-company entry point.

### Existing records verified in PR #408

| Existing record | Evidence-backed use |
|---|---|
| `Game.state.economy[country].productionAssets[]` | Canonical factory asset collection used by the Industry view. |
| `resource.industrialNetwork.factoryProductionCycles[factoryId]` | Cycle status, output quantity, start/finish dates and source-batch references, when present. |
| `resource.industrialNetwork.shipments[]` | Existing shipment identity/type, factory/resource/batch references, quantity, status and route details. Current types include `MINE_TO_WAREHOUSE`, `RAW_TO_FACTORY`, `WAREHOUSE_TO_FACTORY` and `FACTORY_INPUT`. |
| `shipment.route` | Existing route identity and recorded source/destination, mode, path/legs, distance, travel time and ETA fields. Missing values stay missing. |
| `resource.industrialNetwork.factoryInputRequests[]` | Requested, allocated, fulfilled, in-transit and unfulfilled quantities, delivery status, reason and transfer references. |
| `resource.industrialNetwork.warehouseFactoryDispatches[]` | Source warehouse, destination factory, resource, batch, quantity, route, ETA and dispatch status. |
| Factory `companyId` / `ownerCompanyId` and input-lot lineage | Ownership display only when a canonical company identity is explicitly recorded and validated. Otherwise display unassigned/unrecorded. |
| `OmegaPrivateEnterpriseRegistryV1` | Static country/category/company allocations only. It does not map opening cohort units to commissioned factory asset IDs. |

**No dedicated durable `lineId` schema was verified.** The current Lines tab is a production-cycle summary, not a complete company-to-factory-to-destination registry. Do not fabricate a line entity or join unrelated records by fuzzy name. Use actual `factoryId`, `shipmentId`, batch IDs and recorded route references; keep cycle state, material movement and ownership as distinct facts.

The logistics planning helper returns `ROUTE_PREVIEW_ONLY` and `dispatchCommitted:false`. A preview must never be displayed as dispatched, reserved, received or in transit. Only committed Industrial Network shipment/receipt records can produce those statuses.

### Phone-first wireframe

Targets: portrait phones around 360 × 640 and 390 × 844 CSS pixels. One column; do not shrink the rejected desktop composition.

~~~text
┌──────────────────────────────────┐
│ PRODUCTION MINISTRY      BGD     │
│ Bangladesh · Player country      │
├──────────────────────────────────┤
│ Factories  Lines  Input  Stock    │
│ R&D        Projects              │
├──────────────────────────────────┤
│ LINES                            │
│ Active · In transit · Blocked    │
│ Show counts only when recorded   │
├──────────────────────────────────┤
│ CURRENT PRODUCTION / DELIVERY    │
│                                  │
│ TEXTILE & GARMENT MILL           │
│ [verified operating status]      │
│ Cotton fibre · [actual quantity] │
│ [recorded source] → [destination]│
│ [recorded transport legs]        │
│ [actual ETA]                     │
│ Owner: [verified company /       │
│         unassigned / unknown]    │
│ [View route and batch details]   │
├──────────────────────────────────┤
│ GOVERNMENT DECISIONS             │
│ Only when a real proposal exists  │
│ [company + project summary]      │
│ [supply / finance / risk summary]│
│ [Review decision]                │
└──────────────────────────────────┘
~~~

Bracketed fields are placeholders, not seeded game facts. Never display sample values as live country state.

### Line row and company decision behavior

1. Identify a line using the existing factory asset/cycle and actual movement records. Do not mint a new line ID.
2. Keep production status separate from shipment status. Show the actual factory type/name, real factory ID in details, current cycle state, and only recorded output quantities/dates.
3. Show resource, quantity/unit, source and destination from matching shipment/request/dispatch records. Match by exact IDs and batch references.
4. Show actual transport legs, modes, distance and ETA only when recorded. Do not infer truck/rail/ship, route distances or destination names.
5. Display company owner/operator only from the commissioned asset's validated canonical ownership fields. The aggregate opening baseline is not individual ownership proof.
6. Expand one selected row to reveal route legs, shipment/batch IDs, receipt, input coverage and audit trail. Keep the rest of the list compact.
7. Empty state: “No recorded production or delivery lines.” Missing route/owner values remain “Not recorded”, not invented.
8. The Government Decisions section is a small strategic inbox, not a company dashboard. It may show only actual pending proposals. Proposal previews should include requested existing factory type/count/capacity, location, capital and finance mix, construction cost/time, recipe-linked inputs, protected domestic supply, import payer/dispatch/receipt, workforce/utilities/transport/storage, demand/output, fiscal exposure, jobs, strategic value, ownership/control and concentration/foreign-control effects.
9. Player decisions: approve with conditions, counteroffer, defer or reject. Approval alone must not spawn assets or produce stock. Domestic supply reserves only verified surplus after household, government-factory and strategic commitments. Imports use existing Trade/Finance and confirmed dispatch/receipt.
10. If the proposal, finance, licensing, construction or commissioning authority is missing, controls stay read-only/unavailable. No placeholder button callbacks.

### Phone performance contract

- Only selected player-country records are loaded or indexed. No all-country line/company scan and no per-frame company AI.
- Build one-pass indexes for factories, shipments, requests, dispatches and cycle references. Avoid repeated whole-array filters per row.
- The ordinary Lines view must not parse or render all 197 × 21 private opening data. Load optional proposal/baseline detail only when needed.
- Render no hidden duplicate card tree. Expand details on demand; cancel/ignore stale async work after country/tab changes.
- Reuse one delegated event handler. No duplicate listeners, polling timers or full-app rerender for a Line-tab action.
- Do not add heavy photos, animated 3D, flip cards, blur/backdrop filters, continuous glow or large shadows to the phone Line view. Preserve the existing <=900px low-power WebView fallback.
- Keep existing factory, Input, Stock, R&D and Projects behavior, and keep the 41-resource/21-factory catalog unchanged.

### Required verification

1. Android 9/API 28 cold offline boot; open Production Ministry → Lines.
2. Repeated Factories → Lines → Input → Stock → Lines navigation; verify country, counts and existing behavior.
3. Expand/collapse a line; switch country and leave the screen while optional details are loading; verify no stale repaint.
4. Check for blank/reload-required states, ANR, unhandled errors, duplicate listeners and save loss.
5. Record cold/warm render duration, tap-to-visible latency, JavaScript callback duration and skipped-frame count on the actual Android run. Investigate long tasks and regressions against the pre-change run; unit tests are not phone-performance proof.
6. Test 360 × 640 and 390 × 844 for clipped controls, overlap, page-level horizontal overflow and reachable touch targets (44 × 44 CSS px).
7. Verify factory counts, Build, Input, Stock, production cycles, shipment/receipt conservation and save/load remain unchanged after navigation.
8. Pass browser E2E, offline, Android 9, save/load and 30/100/180+ game-day checks; run exact-head Actions. Merge PR #408 only when every SAB-42 gate passes.

### Point-by-point execution status at this checkpoint

| SAB-42 workstream | Verified state |
|---|---|
| Phase 0 — audit current runtime, PR and dependencies | Audit complete for PR/main diff, UI v2, Industry assets/cycles/logistics/shipments, Finance/Treasury, Government Banking, sovereign lending, Global Trade, Global Market and canonical Simulation save/load. SAB-34 gameplay proof remains a separate hard dependency, not a reason to mark the source audit incomplete. |
| Phase 1 — owner/operator/control-rights model | Incomplete: static baseline identities exist; a complete authoritative asset ownership/operator/control-rights model is not verified. |
| Phase 2 — registry and Finance references/reconciliation | Partial: five identity IDs and read-only baseline exist; proposal finance, company equity/debt and Finance journal reconciliation are not implemented. |
| Phase 3 — state-owned compatibility | Existing shared factory pool and Build/Input/Stock UI remain in the branch; exact-head regression re-run is pending. |
| Phase 4 — private proposal, license, capital, construction and commissioning | Incomplete. Static opening allocation is not an asset. |
| Phase 5 — private procurement, staffing, production, receipt, sales and taxes | Incomplete and blocked by SAB-34 end-to-end proof. |
| Phase 6 — JV, voting, dividends and advanced policy | Incomplete. |
| Phase 7 — balance, mobile/offline, Android, save/load and long-turn verification | Partial: one-pass type indexing and low-power CSS safeguards exist; current Android 9 run fails on the superseded Manage-entry assertion, and final phone evidence is not available. |
| Mobile Line-tab specification | Added here for review; UI implementation must wait for review of this compact design. |
| One-PR rule | Continue only in PR #408; do not create duplicate/stacked PRs. |

The currently inspected PR head before the latest validator commits had 14/15 Actions successful. Its Android 9 smoke failed because the test still required an enabled Factory Card Manage action; the failure is not evidence that the replacement Lines experience works, and changing only the assertion is not an acceptable fix. Re-run all relevant Actions against the exact new head before reporting results.

## SAB-42 runtime authority audit — Finance, Banking, Trade and Save/Load (2026-11-06)

This is a source audit of the existing PR #408 branch. It is not a claim that company finance or company runtime has been implemented.

### Finance Ministry is the government Treasury authority

Verified from `omega_finance_ministry_runtime_v1.js`:

- Global API: `OmegaFinanceMinistry` / `Omega.FinanceMinistry`.
- Read interfaces include `init()`, `diagnostics()`, `resolveCountry()`, `getProfiles()`, `getFinanceState(country)`, `getIndicators(country)`, `getBudgetSnapshot(country)` and `getRevenueSnapshot(country)`.
- `getFinanceState(country)` returns a clone of the country's Finance model. A caller must not mutate that returned clone expecting the game state to change.
- `applyAction(action)` is player-country-scoped and writes the government's Finance model. Current action contracts cover public tax/policy, reserve target, ministry/sector budget allocation and reallocation, government budget spending, sovereign borrowing and public debt repayment/service.
- Government expense validation checks the sector's remaining public allocation and the national Treasury balance, and then decrements the government Treasury. Therefore calling `spend-budget` for private-company payroll, materials, capex or freight would incorrectly charge the state.
- The internal Finance `postLedger` helper assigns transaction IDs using country, turn, revision and ledger length. The generic public expense path does not expose a company-account posting API or a universal caller-supplied idempotency contract.

**Implementation restriction:** do not represent a company's cash as `finance[country].available` or `omegaFinance.treasuryBalanceUsd`; those values belong to national Treasury. Do not call public `spend-budget` on behalf of a company. A future corporate-finance extension must be implemented through the Finance authority itself, with explicit payer/payee account identity, an auditable single journal event, stable idempotency keys, and clear separation between company funds and government subsidy/equity/guarantee exposure.

### Government Banking is a country banking/settlement layer

Verified from `omega_government_banking_runtime_v1.js`:

- It explicitly describes itself as an additive state/account layer while Finance Ministry remains Treasury authority.
- It reads Treasury through `OmegaFinanceMinistry.getFinanceState()`; the Treasury mirror is `root.finance[country].available`.
- Its API includes country account summary/policy, `quoteTransfer`, `transfer`, `convert`, `prepareTradeSettlement`, `commitTradeSettlement`, `cancelTradeSettlement`, `getTransaction`, reserved-Treasury checks and reconciliation.
- It maintains account/settlement ledgers and idempotency records under the government-banking state. Its Treasury-writing path changes the authoritative country Treasury mirror. The separate bank account/transaction record is not an already-existing private-company wallet.

**Implementation restriction:** never use a country USD account or a sovereign Treasury transfer to imply that a private company paid. The company must be an explicit transaction party in an authority that verifies company funds and records the counterparty settlement once. Government guarantees, state loans, grants and equity investments must separately record the government's real fiscal exposure.

### World Bank Lending is sovereign credit, not corporate borrowing

Verified from `omega_world_bank_lending_runtime_v1.js`:

- State is rooted at `Game.state.governmentBanking.worldBankLending`, with country assessments, applications, loans, idempotency records, funding offers/claims and lending history.
- The API offers country credit assessment, country loans, outstanding balance/principal, debt service, manual repayment and restructuring.
- It reads Finance/Treasury state and processes country debt on the simulation's committed daily-turn event.

**Implementation restriction:** do not issue a sovereign World Bank loan as though it were a company loan. A corporate commercial-bank loan, bond or FDI record requires a company-level borrower/owner identity, lender/financier, currency, terms, approval and repayment source; it must not silently increase public debt or government cash.

### Global Trade is a two-country settlement pipeline

Verified from `omega_global_trade_system.js`:

- The existing system creates country-to-country import requests and settles through the Government Banking `prepareTradeSettlement` / `commitTradeSettlement` interfaces when available.
- It coordinates counterpart review, buyer response, Finance debit/credit, resource debit/credit, seller settlement and closing the request. It has recovery logic for an already settled bank transaction so money or stock is not debited twice.
- The current public request/settlement model uses buyer and seller country identities. It is not proof that a private legal company can act as a separately funded market buyer or seller.

**Implementation restriction:** do not create a company-side import/procurement ledger around the existing national trade settlement. First extend the authoritative trade/finance contracts to represent the company as payer/seller while preserving actual inventory batch movement, one-time settlement, payment recovery and Treasury-only state support.

### Authoritative save/load contract

Verified from `omega_simulation_runtime.js`:

- `Omega.Simulation.saveState()` snapshots the session schema/runtime version, clock, authoritative world state, command queue, event ledger, ministry runtime state, interoperability state and world-engine state; it computes a checksum. Routine callers may omit volatile diagnostics with `includeDiagnostics:false`.
- `loadState(snapshot)` validates schema version, world state, clock and checksum when present; it validates world-state integrity, restores the authoritative world, clock, commands/events and registered runtime snapshots, and marks checksum-bearing saves `VERIFIED`. Legacy saves without checksums are admitted only as `LEGACY_UNVERIFIED`.
- `saveSlot(slot)` and `loadSlot(slot)` persist the full snapshot through localStorage under `omega.game.save.<slot>`.
- The authoritative world root reported by diagnostics is `Game.state`; the snapshot preserves that world state, including new fields placed in it.

**Implementation restriction:** do not add a second company localStorage key, IndexedDB store, or out-of-band company save file. Any future commissioned company, contract, project, financing reference or ownership state must be represented in the canonical `Game.state` schema, validated/migrated additively, and included in save/load integrity tests. The static 197 × 21 opening allocation should remain a static deferred asset and must not be copied into every save as 4,839/6,307 live company assets.

### Finance/save integration gate before company runtime

- [ ] Define an authoritative company account identity that cannot collide with country Treasury or existing bank accounts.
- [ ] Define one Finance-owned corporate transaction/journal contract for capital, payroll, input purchase, freight, revenue, interest, taxes, dividends, equity and debt; every posting must be idempotent and carry source, payer, payee, currency, amount, turn, related factory/proposal/shipment IDs and audit reference.
- [ ] Prove public Treasury moves only for explicitly authorized public subsidy, state equity, guarantee call or state/development-bank financing. Ordinary private revenue/cost/debt must not mutate public Treasury or sovereign debt.
- [ ] Route procurement and sales through the existing Trade/Market plus confirmed inventory-batch/receipt authority; no synthetic supply or revenue.
- [ ] Add additive world-save schema validation/migration and prove save → reload → transaction replay does not duplicate balances, shipments, receipts, sales, taxes or dividends.
- [ ] Keep all finance simulation selected-country/turn scoped. No all-country company-account processing or per-frame finance updates.

## Exact-head CI diagnosis and correction — 2026-11-06

At PR head `d733e4b53ba069f0ee388ca1a1e84f0fa419a3e0`, the `OMEGA Country Factory Starting Baseline` job completed 131/133 tests successfully and exposed two failures in the newly added runtime-registry validation tests.

- The valid-data failures stopped at `PRIVATE_COUNTRY_BASELINE_RATE_MISMATCH:TUR`.
- Root cause: the runtime validator used `Math.round((private / government) * 1000) / 10`, while the authoritative generator's `round1(value)` uses `Math.round(value * 10) / 10` after computing the percentage. Floating-point operation order can flip a half-tenth boundary; the runtime validator therefore rejected a valid generated country ratio.
- Correction committed at `10a16c857b1e6b20b986ca8c801d1aabda5e75fa`: the runtime category and country rate checks now match the generator's exact rounding sequence. No cap, roster, integer, total, provenance or corruption assertion was removed or loosened.
- The same two failures also explain why the exact ISO3 country-key precedence test returned `BLOCKED`; that test must return `READY` again on the corrected exact head.
- The old `d733e4b...` job is still a failed run and cannot certify the correction. The corrected head requires a fresh exact-head Actions run before its tests may be called passed.

At the time of this note, Android 9 Offline Gameplay Smoke and Android Build were still in progress on the older `d733e4b...` head. Their result is not transferable to a later commit.

## Correction and extension — existing Resource Economy company cash-flow tracker (2026-11-06)

The earlier Finance audit correctly found that **FinanceMinistry itself** has no company-owned account/balance API, but it did not fully describe the already-booted `omega_resource_economy_runtime_v2.js`. This file is loaded by `index.html` and is active in the selected-player-country resource turn pipeline. Its existing company-flow implementation must be reused/audited rather than duplicated.

### What already exists

- `assetCompany(country, asset)` reads `companyId`, `ownerId`, `operatorId` or `company`; if none exists it falls back to `STATE_INDUSTRY_<country>`. That fallback is a processing attribution default, **not evidence** that the asset has a verified government owner. A Lines UI ownership resolver must inspect raw fields and preserve unknown/unassigned.
- Mine ownership can come from `operatorKey` / `ownerKey`; fallback `STATE_RESOURCE_POOL_<country>` is likewise a synthetic sovereign resource-pool attribution, not one of the five global company identities.
- The runtime already registers `OMEGA_RESOURCE_ECON_COMPANY_FLOW` to update `Game.state.economy[country].companyAccounts[companyId]`. Its fields are aggregate deltas: `runtimeNetCashFlow`, `grossRevenue`, `paymentsReceived`, `paymentsMade`, `taxPaid`, `workerIncomePaid`, `transportPaid`, `supplierRevenue` and `lastTurn`. Opening cash is explicitly `UNKNOWN` on first creation.
- The same runtime has resource-specific supplier/cost attribution, worker and transport flow counters, domestic sale records, finished-goods events, fiscal receipts and a company cash-flow panel in the Resource Economy dashboard.
- Production is processed for the selected player country from the existing `productionAssets`, canonical recipes, real batch/warehouse records and Industrial Network result. `runTurn()` deduplicates the in-flight `turn:country` promise and serializes country-turn work. The Global Market computes a world read-only order-book projection for price discovery; its reference-only inventory asks cannot create fills. That global quote calculation is distinct from all-country company production AI.

### What this is not

- `economy.companyAccounts` is an aggregate cash-flow tracker, **not a funded corporate wallet or complete corporate general ledger**. It has no validated opening capital, available cash/bank balances, equity/share register, loan principal/interest/maturity, bond/FDI funding, insolvency waterfall or enforceable overdraft check.
- The `companyFlowHandler` adds amounts to summary fields. It does not itself persist a durable per-transaction company journal or perform a company balance sufficiency test.
- The dispatch wrapper currently supplies a correlation ID but does not pass a stable business-derived `commandId`. Interoperability deduplicates by `commandId`, not correlation ID; a repeated call with a new generated command ID can execute again. Do not treat a correlation ID as exactly-once accounting.
- `fiscalHandler` does deduplicate fiscal receipts by receipt/settlement/sale/batch business key. However the `financeClearHandler` path debits country-level `finance.available` / reserves and appends `finance.resourceSettlementClearing`; its handler has no explicit settlement-key duplicate check. Export fiscalization's `__OmegaResourceFiscalizedSettlements` guard is in-memory and is not by itself a save/load-safe accounting guarantee.
- Domestic settlement currently posts supplier credits and buyer debits as company-flow summaries. Those summaries are not proof of an independently funded buyer wallet or an executable company-to-company cash transfer. The export clearing path moves country-level Treasury funds into the company-flow summary; this is not an independent corporate bank account.
- The current generic `companyId` keys include state/resource-pool/simulation fallbacks; they are not automatically one of the five SAB-42 global companies. Do not map arbitrary IDs to the five masters by name similarity.

### Required safe extension path

1. Preserve `economy.companyAccounts` and its history in old saves; do not introduce a second company cash store or UI-only balance.
2. Define which existing resource-flow events represent real payments versus attribution-only estimates. Keep `UNKNOWN` distinct from zero and from a settled transaction.
3. Extend the authoritative Finance/Trade/Interop contract to post stable, deterministic, save/load-persistent business transaction IDs for company payer/payee events. Correlation-only metadata is insufficient. Replays with the same key and same payload must return the original result; same key with different payload must fail as an integrity collision.
4. Validate the payer's available corporate funds before a debit. A buyer company debit must be backed by actual company funds or an explicit government subsidy/guarantee/loan event; it must not be a negative summary entry with no liquidity constraint.
5. Keep government Treasury receipts, company revenue, tax and public transfers as separate parties/entries. A company payment may not silently take funds from sovereign `finance.available` unless an explicitly authorized and budgeted public transfer is the source.
6. Make settlement/cash events idempotent across save/reload, and reconcile company cash-flow totals to the underlying stable transaction keys and the existing national Finance journal without posting the same sale, freight, payroll or fiscal receipt twice.
7. Add integration tests for duplicate domestic sale, duplicate trade settlement, duplicate worker/freight charge, duplicate tax receipt, save/reload/replay, insufficient buyer-company liquidity and explicit public subsidy. Assert exact deltas in both company summary and government Treasury.
8. Reuse the current selected-country/turn pipeline. Do not introduce all-country company finance loops, per-frame work, timers, polling or extra boot requests.

This extension is required before the five SAB-42 companies can be described as having real funded corporate finance. The existing Resource Economy flow display must be labelled as flow tracking, not available company cash.

## SAB-42 Lines tab — first phone-safe implementation (2026-11-06)

The first read-only Lines implementation is now present in PR #408. It does not activate private production, create proposals, or change inventory/finance state.

### Data join and display

- `buildViewModel()` reads only the selected country's existing `Game.state.resource[country].industrialNetwork` and `Game.state.economy[country].productionAssets`.
- It builds one index from the selected country's actual factory assets and joins cycles by exact `factoryId`; committed shipment rows by exact recorded `factoryId` / destination factory reference; input requests by exact `factoryId`; and warehouse dispatch rows by their exact destination factory ID.
- Mine-to-warehouse shipments that have no recorded factory destination are not misrepresented as factory lines.
- Each rendered line contains only available factory/cycle values, latest committed shipment, input-request progress, actual route source/destination, recorded transport modes, actual route distance when the total or all leg distances are available, ETA when recorded, batch ID and verified owner where possible.
- Owner display recognizes only the five canonical global company IDs. Unknown legacy/simulation IDs remain “Recorded owner not mapped to a global company”; absent fields remain “Not recorded”. Aggregate opening allocations are not used to infer individual commissioned asset ownership.
- Planned route previews are not joined as shipments and cannot appear as committed movement.
- The model caps the visible line list at 80 and retains at most four recent shipments, requests and dispatches per factory for the UI. It never scans other countries and creates no synthetic line ID.

### Phone and Android safeguards

- The Lines view is one column with compact cards and two-column small metric pairs; it has no wide tables or desktop dashboard.
- The decorative factory backdrop/photo and its credit links are not rendered for Lines, so the tab does not initiate that image's decode.
- The Lines view disables animations, transitions, filters, backdrop filters, perspective, text shadows, box shadows and transforms.
- Android 9 instrumentation no longer checks the superseded in-card Factory Manage action. It verifies the actual Lines tab exists without a Companies navigation tab, waits for its content panel, and sequentially taps Lines → Input → Stock → Lines. Each tab's synchronous JS click handler must return within 1,000 ms, with a 10-second bounded render deadline per panel.

### Tests added

- A UI fixture covers exact selected-country factory/cycle/shipment/request/dispatch joins, excludes a mine-only haul from factory Lines, displays the five-company owner only for an exact canonical ID, preserves unknown-owner status, displays recorded distance/ETA, and excludes a route-preview-only record.
- The Android API 28 smoke now validates Lines/Input/Stock reachability and click responsiveness instead of the old Manage-button path.

**Still unavailable / not claimed as implemented:** pending government proposal inbox, company financing decisions, licensing/approval, construction/commissioning, enforceable corporate cash balance, corporate loans/equity, and private procurement/production/sales/tax/dividend authority. Those remain gated on the audited Finance/Trade model and SAB-34 end-to-end proof. The Lines view is read-only and reports only currently persisted state.
