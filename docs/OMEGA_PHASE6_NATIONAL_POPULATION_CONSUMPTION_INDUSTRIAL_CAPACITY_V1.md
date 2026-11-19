# OMEGA Phase 6 — National Population, Consumption & Industrial Capacity

**Specification:** OMEGA_PHASE6_NATIONAL_POPULATION_CONSUMPTION_INDUSTRIAL_CAPACITY_V1  
**Status:** Durable bilateral international shipment evidence and Phase 6 import projections implemented; four universal mineral coefficients remain unavailable pending comparable consumption benchmarks; complete financial totals remain evidence-gated  
**Scope:** 197 core countries, 21 canonical factory types, the existing 41-resource profile set

## 1. Objective and invariants

Phase 6 provides a country-level view of population, common population-based resource requirements, the industrial starting baseline, selected-country live factory capacity, existing factory input demand, physical production evidence, and evidence-backed modeled costs.

The implementation is an additive read-only projection over OMEGA's existing authorities. It is not a second economy engine. Its compact calculation-provenance record is written only into the optional simulation save snapshot, outside the authoritative world-state tree; it never mutates country/economy state.

The following invariants are mandatory:

1. Every country uses the same versioned resource coefficient per 100,000 people.
2. Country population scales the common coefficient; the coefficient itself never changes by country.
3. Unknown population, coefficients, prices, currencies, utilization, or accounting values remain unavailable. They are never silently converted to zero.
4. Population demand and factory recipe input demand remain separate evidence streams.
5. The existing national-demand runtime remains the sole authority for the overlap-safe national demand result. Phase 6 must not replace its established overlap handling with a naive sum.
6. Static factory allocation is a simulation-only baseline, not a real-world factory census.
7. Only the selected player country may expose detailed live factory assets, operational capacity, current-turn production and factory input demand.
8. No new scheduler, timer, animation-frame loop, all-country factory loop, inventory debit, factory registration, or save-state mutation is introduced by this projection.
9. Modeled expenditure is not a Treasury posting. Actual Treasury expense requires journal evidence.

## 2. Repository audit baseline

The source-of-truth files audited for the Phase 6 implementation are:

- `country_general_data_registry_v1.json`: compact, provenance-preserving country observations.
- `resource_country_resource_context_index.json`: 197-country core-game roster.
- `resource_economy_rules.json`: existing demand coefficients and simulated company operating-cost defaults.
- `country_factory_starting_baseline_v1.json`: simulation-only starting counts.
- `resource_industrial_catalog_v1.json`: 21 factory profiles and existing processing recipes.
- `omega_resource_national_demand_runtime_v1.js`: existing national demand and factory-input overlap authority.
- `omega_resource_industrial_network_v1.js`: existing active-country factory asset and production authority.
- `omega_country_general_data_runtime_v1.js`: per-country access to the compact population and country registry.

Audit results at the current main baseline:

| Measure | Verified result |
| --- | ---: |
| Core countries | 197 |
| Canonical factory types | 21 |
| Starting factory units | 15,920 |
| Core-country population observations dated 2025 | 195 |
| Additional official population observation dated 2024 | 1 |
| UN projected population estimate dated 2025 | 1 |
| Core-country population observations dated 2015 | 0 |
| Core-country population unknown | 0 |
| Population represented by the 195 observations | 8,200,525,275 |
| Existing resource profiles | 41 |
| Profiles with `basePerMillionPopulation` | 37 |
| Profiles without a calibrated coefficient | 4 |

The 8,200,525,275 subtotal is the sum of the 195 core-country records with 2025 population observations; it is not the population total for all 197 countries. Taiwan now uses the official December 2025 household-registration count (23,299,132). Vatican City uses the Governorate's official resident count at 31 December 2024 (882), and is not mislabeled as a 2025 observation. Western Sahara uses the UNData 2025 medium-fertility projected estimate (601,000), explicitly classified as an estimate rather than an observation. The estimate is excluded from the 2025 observed subtotal. The three records retain their publisher/source URL and source method in the registry metadata.

The starting factory units are abstract OMEGA game units. They are not actual facilities counted in the real world. The Bangladesh baseline has 100 units, including 40 Textile and Garment Mill units. A zero category stays zero; Phase 6 does not force all 21 categories into every country.

## 3. Population authority and provenance

Population resolution order:

1. Current selected-country population in the live game state.
2. The latest country-registry `populationTotal` observation with its source, status, URL and year.
3. An older population value, explicitly marked `STALE_BASELINE`.
4. `UNKNOWN` when no positive population observation is available.

The runtime keeps the selected value's source and observation year in the result. Historical source records are not overwritten. Working-age population is derived only when the corresponding percentage observation is available. Urban share and age-dependency ratio remain separate observed fields.

A live value is marked `LIVE_RUNTIME`; a 2025 World Bank or official population observation is marked `OBSERVED` with its actual observation year; a UN projected value is marked `ESTIMATED`; an older record is `STALE_BASELINE`; an unavailable value is `UNKNOWN`. The registry does not promote an estimate to an observation.

## 4. Universal per-100k consumption standard

The existing 41 `resourceProfiles` remain the coefficient authority. A calibrated `basePerMillionPopulation` value is normalized by dividing by 10:

```
ratePer100kPerDay = basePerMillionPopulation / 10
populationMultiplier = totalPopulation / 100000
populationDemandPerDay = populationMultiplier * ratePer100kPerDay
```

The result is a simulation-rule quantity in the resource profile's existing unit. It is not presented as measured real-world household consumption.

The four existing profiles with no population coefficient remain:

- Gypsum
- Niobium
- Ruby
- Limestone

These rows return `RATE_NOT_CALIBRATED`; they are not assigned estimated coefficients. Their rule records now explicitly carry `coefficientStatus: UNAVAILABLE`, `NO_COMPARABLE_COUNTRY_COMPLETE_CONSUMPTION_BENCHMARK`, an evidence-gap note, and `productionStatisticsUsedAsConsumption: false`. Factory recipe demand for such a material can still be surfaced independently when existing runtime evidence exists.

## 5. Population demand, factory demand and national demand

Three records remain distinct:

- **Population standard demand:** calculated from population × universal per-100k coefficient.
- **Factory input demand:** read from the active-country factory assets and the existing `resource.demandRuntime.byResource` evidence.
- **National demand:** read from the existing national-demand runtime's `demandPerDay` result.

The universal per-100k rate catalogue remains at 37 calibrated rules and 4 explicitly uncalibrated rates: `gypsum`, `niobium`, `ruby`, and `limestone`. Their `ratePer100kPerDay` stays `null`; they are not converted to zero demand. No defensible common per-capita apparent-consumption series for these four is present in the current source set. Global mine-production figures are not interchangeable with consumption because imports, exports, recycled/synthetic supply, stock changes and industrial use must be reconciled. The [USGS 2026 data release](https://www.usgs.gov/data/mineral-commodity-summaries-2026-data-release) includes world production statistics but its salient apparent-consumption series are United States statistics; it does not provide population-linked apparent consumption for all 197 OMEGA countries. [World Mining Data 2026](https://www.world-mining-data.info/wmd/downloads/PDF/WMD%202026.pdf) is a country-level production dataset, not a consumption dataset. [UN Comtrade](https://comtrade.un.org/en/trade-statistics) supplies reported imports and exports but explicitly does not fill country reporting gaps; it also does not establish stock changes or cover all domestic non-traded use. These sources therefore cannot justify a synthetic world per-capita rate without a disclosed estimation model. Factory input requirements remain a separate demand source and must not be double-counted as direct population demand. Calibrating these four rates remains an open data task until a comparable consumption benchmark and method are available.

Phase 6 does not calculate `populationDemand + factoryDemand`. The current national-demand runtime has explicit overlap handling and currently uses a maximum-based comparison in relevant active-factory cases. Only its published result is used as the combined national-demand authority. If the existing runtime has not published a row, national demand is `NOT_AVAILABLE`, not an invented sum.

Physical output is read from the resource state's `finishedGoodsLedger`, filtered to the current game turn and de-duplicated by transaction ID. The economy finished-goods mirror is not counted as a second source.

Inventory, confirmed imports, in-transit shipments, and demand are different facts. Completed cross-border imports are read from current-turn `resource.inventoryLedger` rows with type `INTERNATIONAL_TRADE_IMPORT`; records are de-duplicated by settlement and resource identity. Pending import requests are not treated as imports. The trade runtime retains at most 2,048 inventory-ledger rows; when the ledger reaches that bound, Phase 6 marks settled-import totals `IMPORT_LEDGER_MAY_BE_TRUNCATED` and reports them as `UNKNOWN`. Separately, Global Trade now writes a durable `trade.internationalShipmentLedger` entry for both exporter and importer using the same `shipmentId`. Each record carries request/settlement IDs, resource and quantity, origin/destination, dispatch time/turn, estimated-arrival fields, arrival status/time, settlement status, transport/route identifiers when supplied, and batch references. Writes are idempotent by shipment ID and conflicting replays are rejected. Phase 6 reads only the selected player's importer-side ledger and counts only records explicitly marked `DISPATCHED`, `IN_TRANSIT`, `CUSTOMS_CLEARANCE` or `PENDING_ARRIVAL`; arrived shipments are not counted as inbound transit. The current standard bilateral trade path dispatches and credits the buyer within the same settlement flow, so its status is `ARRIVED` and both observed timestamps are recorded within the current turn. The ETA field remains `null` with `NOT_ESTIMATED_ROUTE_TRAVEL_TIME_NOT_MODELED` until a route travel-time authority exists. An old save with no ledger remains `UNKNOWN`; a present empty ledger establishes zero. Phase 6 reads this evidence only and does not debit inventory or change shipment state.

## 6. Factory counts, capacity and ownership

The 197 × 21 starting-baseline matrix remains unchanged and static. The existing `productionAssets` registry remains the sole live factory registry.

The summary reports:

- Static starting units and counts by canonical factory type.
- Selected-country live asset counts by operational, under-construction, maintenance, paused, offline, decommissioned and unknown status.
- Explicit government/private ownership attribution; missing or ambiguous ownership stays unclassified.
- Simulation-only starting rated capacity by factory type from the corresponding profile defaults.
- Live rated capacity by factory type only when all included assets of that type have capacity and compatible unit evidence.
- Effective capacity by factory type only for operational live assets with explicit capacity and utilization evidence.
- Capacity from different factory types is never summed into one national total because their output units may differ.
- Current-turn physical output from the resource finished-goods ledger.

Factory count alone does not imply operating capacity. Under-construction, maintenance, paused, offline and decommissioned assets do not contribute to effective operating capacity. Unknown utilization does not become 100%.

Detailed live data are read only when the requested country is the selected player country. Other countries return static baseline values only.

## 7. Monetary cost and accounting boundaries

The runtime can calculate both `costPer100kPerDay = ratePer100kPerDay × unitPrice` and the country's modeled daily population-consumption cost only when quantity, unit price, currency and price observation evidence are present. Missing price, currency or observation returns an explicit unavailable status; the country-level total remains incomplete unless all required rows can be summed in one currency.

The existing `companyOperatingCosts` values (worker, electricity, water and maintenance defaults) remain simulation defaults. Phase 6 now reads only current-turn `PRIVATE_ENTERPRISE_OPERATING_COST_ACCRUAL` rows with valid, balanced private-firm Finance journals and an explicit company and factory identity. These are displayed by currency as recorded accrual evidence. They are not converted into a daily operating rate, do not represent government-factory expenditure, and do not establish complete national factory operating costs. If no qualifying rows exist, the status remains `NOT_FINALIZED`.

Actual Treasury expenditure is established from the Finance Ministry's `fiscalPeriodAccount` only when the account is `COMPLETE_FROM_PERIOD_START`, has a `GAME_STATE` opening balance, is marked `GAME_STATE_RECONCILED`, and its opening balance, recorded inflows, recorded outflows and closing Treasury balance independently reconcile. Budgetary expenditure is explicitly defined as government spending plus interest paid. Principal repayments and external cash debits are reported separately and excluded from that expense figure. If the fiscal-period account is modeled, incomplete, stale in provenance, or unreconciled, the full expenditure amount stays unavailable.

Current-turn government `EXPENSE` and `EXPENSE_ROLLBACK` journals are shown separately as supplemental evidence only when the source row has a valid, balanced, posted government journal. Gross expenses, reversals and net recorded amounts are shown by currency. The Finance Ministry retains a bounded transaction ledger (up to 500 rows), so current-turn detail alone never establishes a complete national total. Borrowing, budget transfers, debt principal repayments and tax receipts are not counted as budgetary expense.

Black Market transit is reported as a separate subset from `Game.state.trade[countryId].blackMarketTransits`. Only `IN_TRANSIT` and `ARRIVAL_PENDING` records for the selected buyer country are counted. A stale transit row is excluded when the same request is already represented by a completed importer-side bilateral shipment. Black Market quantities remain separate from the standard bilateral shipment total, and this checkpoint route does not establish a travel-time ETA. Existing Black Market transit records do not persist a quantity unit, so their numeric amounts are exposed only as partial evidence with a null unit until the source ledger carries unit provenance.

A modeled consumption cost is never represented as an actual Treasury expenditure.

## 8. Runtime contract

New additive runtime:

- `omega_phase6_national_population_capacity_runtime_v1.js`
- Global API: `OmegaPhase6NationalCapacity` and `Omega.Phase6NationalCapacity`
- Main read API: `getNationalSummary(countryId)`
- Supporting APIs: `getPer100kRateCatalog()`, `calculatePopulationDemand(countryId)`, `renderSummary(summary)`, `diagnostics()`

It calls the existing general-data and factory-baseline interfaces. It does not copy the large registry into a second data file or load the entire registry into a new in-memory world-wide map. The calculation provenance includes the population source/status/year, demand-rule version, universal rate fingerprint, factory baseline and live asset evidence, current-turn factory/national demand, production ledger transactions and observed price records.

The Country Overview receives an additive, collapsible national summary. The panel labels the factory allocation as a simulation baseline and leaves uncalibrated data visible as unavailable.

## 9. Implementation milestones and exit conditions

| Milestone | Scope | Initial implementation status |
| --- | --- | --- |
| 6A | 197-country population source/year/status audit | Complete: 195 observed 2025 populations, 1 official 2024 population (Vatican), and 1 UN projected 2025 estimate (Western Sahara); no 2015 fallback |
| 6B | Universal per-100k coefficient catalog | Existing 41 profiles normalized; 37 calculated, 4 uncalibrated |
| 6C | National factory census and capacity | 197 × 21 static matrix surfaced; selected-country live status/capacity read from existing registry |
| 6D | Population/factory demand reconciliation | Separate streams; existing national-demand authority reused, no new sum |
| 6D+ | International shipment evidence | Bilateral durable shipment ID ledger, idempotent exporter/importer records and dispatch/arrival/settlement status; separate Black Market transit evidence is also exposed without merging its quantities into bilateral settlement totals; ETA remains unavailable until route-time evidence exists |
| 6E | Resource and factory cost | Resource-level modeled cost requires quote/currency/observation; factory operating and Treasury actuals remain evidence-gated |
| 6F | National summary UI | Country Overview summary panel added |
| 6G | Reconciliation and performance | Optional save snapshot extension and load-time provenance revalidation added; full CI result and device-performance validation remain separate gates |

Phase 6 now exposes the qualifying current-turn journal evidence while keeping full financial reconciliation open: private-factory operating accruals remain a partial subset, and the government Treasury expense ledger remains a bounded window rather than a complete fiscal-period record. The simulation save runtime now includes the optional `phase6NationalCapacity` provenance block in the checksum-covered save snapshot. On load, Phase 6 holds it only as a reference, recalculates from the restored authorities, and returns `REVALIDATED`, `INVALIDATED_SOURCE_CHANGED` or `RECOMPUTED_AFTER_TURN_CHANGE`. Legacy saves without the extension remain supported and reset any previous Phase 6 reference. This persists calculation provenance, not a cached calculation that bypasses current source data.

## 10. Acceptance tests

The dedicated regression suite verifies:

- Exactly 197 core population records: 195 year-2025 observations, 1 official 2024 observation, 1 UN projected 2025 estimate, no 2015 population baseline and no unknown population; the 2025 observed subtotal is 8,200,525,275.
- Exactly 197 factory baseline countries × 21 canonical type keys, with 15,920 total simulation-only starting units.
- Exactly 41 resource profiles, 37 calibrated per-100k rates and 4 `RATE_NOT_CALIBRATED` resources.
- Per-100k invariance across countries and linear population scaling.
- Live population precedence, stale observation labels and unknown-not-zero behavior.
- Status, ownership, per-factory-type capacity units, and utilization evidence requirements for live factories; ambiguous utilization ratios above 1 remain unavailable.
- Active-player-only detailed factory access.
- Current-turn production transaction de-duplication using the resource finished-goods ledger.
- Current-turn settled import reconciliation from `INTERNATIONAL_TRADE_IMPORT` inventory-ledger entries, settlement/resource de-duplication, and separation from pending requests.
- Durable bilateral shipment ledger creation, exporter/importer ownership, shipment ID idempotency, conflict rejection, observed dispatch/arrival timestamps, explicit ETA-unavailable status, active-country-only in-transit import aggregation, plus separate Black Market `IN_TRANSIT`/`ARRIVAL_PENDING` evidence and arrived-shipment de-duplication.
- Gypsum, niobium, ruby and limestone remain explicitly uncalibrated with source-gap metadata; production statistics are never substituted for consumption.
- Separate population and factory demand, with no naive summation.
- Price/currency evidence gates and the separation of modeled cost from Treasury postings.
- Current-turn government expense/reversal and private-factory operating-cost accrual projection only when every source journal is balanced, posted, correctly identified and currency-scoped; bounded source-window and non-completion statuses are preserved.
- Actual Treasury budgetary expenditure is established only from a complete, non-modeled, reconciled Finance fiscal-period account; it is government spending plus interest paid, with principal repayment excluded.
- Standard in-transit international import quantities come only from durable importer-side bilateral shipment records; old saves without the ledger remain unknown, an empty ledger means zero, and incomplete/duplicate-conflicting records do not produce a complete bilateral quantity. Black Market in-transit quantities are separately derived from its durable route ledger, exclude transit rows already reconciled to an arrived bilateral shipment, and never get merged into the bilateral subtotal.
- Read-only authoritative world-state behavior and the absence of a new scheduler.
- Phase 6 provenance save/load checksum coverage, legacy-save compatibility, and load-time fingerprint revalidation.

The existing resource-demand, factory baseline, industrial network, country general-data and selected-country-scope tests remain compatibility checks for the Phase 6 branch.
