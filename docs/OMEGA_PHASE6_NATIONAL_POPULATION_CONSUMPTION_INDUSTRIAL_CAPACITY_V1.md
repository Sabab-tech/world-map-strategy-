# OMEGA Phase 6 — National Population, Consumption & Industrial Capacity

**Specification:** OMEGA_PHASE6_NATIONAL_POPULATION_CONSUMPTION_INDUSTRIAL_CAPACITY_V1  
**Status:** Initial implementation integrated on a feature branch; CI verification pending  
**Scope:** 197 core countries, 21 canonical factory types, the existing 41-resource profile set

## 1. Objective and invariants

Phase 6 provides a country-level view of population, common population-based resource requirements, the industrial starting baseline, selected-country live factory capacity, existing factory input demand, physical production evidence, and evidence-backed modeled costs.

The implementation is an additive read-only projection over OMEGA's existing authorities. It is not a second economy engine.

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
| Core-country population observations dated 2025 | 194 |
| Core-country population observations dated 2015 | 2 |
| Core-country population unknown | 1 |
| Population represented by the 194 observations | 8,177,226,143 |
| Existing resource profiles | 41 |
| Profiles with `basePerMillionPopulation` | 37 |
| Profiles without a calibrated coefficient | 4 |

The 8,177,226,143 subtotal is explicitly **not** the population of all 197 countries. Taiwan and Vatican City have 2015 observations; Western Sahara has no numeric population observation. The unknown population is not zero.

The starting factory units are abstract OMEGA game units. They are not actual facilities counted in the real world. The Bangladesh baseline has 100 units, including 40 Textile and Garment Mill units. A zero category stays zero; Phase 6 does not force all 21 categories into every country.

## 3. Population authority and provenance

Population resolution order:

1. Current selected-country population in the live game state.
2. The latest country-registry `populationTotal` observation with its source, status, URL and year.
3. An older population value, explicitly marked `STALE_BASELINE`.
4. `UNKNOWN` when no positive population observation is available.

The runtime keeps the selected value's source and observation year in the result. Historical source records are not overwritten. Working-age population is derived only when the corresponding percentage observation is available. Urban share and age-dependency ratio remain separate observed fields.

A live value is marked `LIVE_RUNTIME`; a 2025 World Bank population observation is marked `OBSERVED`; an older observation is `STALE_BASELINE`; an unavailable value is `UNKNOWN`.

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

These rows return `RATE_NOT_CALIBRATED`; they are not assigned estimated coefficients. Factory recipe demand for such a material can still be surfaced independently when existing runtime evidence exists.

## 5. Population demand, factory demand and national demand

Three records remain distinct:

- **Population standard demand:** calculated from population × universal per-100k coefficient.
- **Factory input demand:** read from the active-country factory assets and the existing `resource.demandRuntime.byResource` evidence.
- **National demand:** read from the existing national-demand runtime's `demandPerDay` result.

Phase 6 does not calculate `populationDemand + factoryDemand`. The current national-demand runtime has explicit overlap handling and currently uses a maximum-based comparison in relevant active-factory cases. Only its published result is used as the combined national-demand authority. If the existing runtime has not published a row, national demand is `NOT_AVAILABLE`, not an invented sum.

Physical output is read from the resource state's `finishedGoodsLedger`, filtered to the current game turn and de-duplicated by transaction ID. The economy finished-goods mirror is not counted as a second source.

Inventory, confirmed inbound shipments, and demand are different facts. Phase 6's projection does not debit inventory or change shipment state.

## 6. Factory counts, capacity and ownership

The 197 × 21 starting-baseline matrix remains unchanged and static. The existing `productionAssets` registry remains the sole live factory registry.

The summary reports:

- Static starting units and counts by canonical factory type.
- Selected-country live asset counts by operational, under-construction, maintenance, paused, offline, decommissioned and unknown status.
- Explicit government/private ownership attribution; missing or ambiguous ownership stays unclassified.
- Simulation-only starting rated capacity from profile defaults where all category profiles are available.
- Live rated capacity only when all included live asset capacity values are present.
- Effective capacity only for operational live assets with explicit capacity and utilization evidence.
- Current-turn physical output from the resource finished-goods ledger.

Factory count alone does not imply operating capacity. Under-construction, maintenance, paused, offline and decommissioned assets do not contribute to effective operating capacity. Unknown utilization does not become 100%.

Detailed live data are read only when the requested country is the selected player country. Other countries return static baseline values only.

## 7. Monetary cost and accounting boundaries

The runtime can calculate a resource-level modeled population-consumption cost only when quantity, unit price, currency and price observation evidence are present. Missing price or currency returns `PRICE_UNAVAILABLE` or `CURRENCY_UNAVAILABLE`; the country-level total remains incomplete unless all required rows can be summed in one currency.

The existing `companyOperatingCosts` values (worker, electricity, water and maintenance defaults) are simulation defaults. They are shown as defaults, not as a posted national expense. Factory operating costs remain unfinalized until actual employment, utility usage, material-price and currency evidence is available.

A modeled consumption cost is never represented as an actual Treasury expenditure. National Accounts journal coverage must independently establish posted expenditure.

## 8. Runtime contract

New additive runtime:

- `omega_phase6_national_population_capacity_runtime_v1.js`
- Global API: `OmegaPhase6NationalCapacity` and `Omega.Phase6NationalCapacity`
- Main read API: `getNationalSummary(countryId)`
- Supporting APIs: `getPer100kRateCatalog()`, `calculatePopulationDemand(countryId)`, `renderSummary(summary)`, `diagnostics()`

It calls the existing general-data and factory-baseline interfaces. It does not copy the large registry into a second data file or load the entire registry into a new in-memory world-wide map.

The Country Overview receives an additive, collapsible national summary. The panel labels the factory allocation as a simulation baseline and leaves uncalibrated data visible as unavailable.

## 9. Implementation milestones and exit conditions

| Milestone | Scope | Initial implementation status |
| --- | --- | --- |
| 6A | 197-country population source/year/status audit | Audit and regression contract added; 194/2/1 coverage remains explicit |
| 6B | Universal per-100k coefficient catalog | Existing 41 profiles normalized; 37 calculated, 4 uncalibrated |
| 6C | National factory census and capacity | 197 × 21 static matrix surfaced; selected-country live status/capacity read from existing registry |
| 6D | Population/factory demand reconciliation | Separate streams; existing national-demand authority reused, no new sum |
| 6E | Resource and factory cost | Resource-level modeled cost requires quote/currency/observation; factory operating and Treasury actuals remain evidence-gated |
| 6F | National summary UI | Country Overview summary panel added |
| 6G | Reconciliation and performance | Automated regression suite and path-filtered CI gate added; full CI result is a merge prerequisite |

Phase 6 is not considered fully financially reconciled while factory operating cost and Treasury journal evidence remain incomplete. That limitation must remain visible rather than filled with fabricated amounts.

## 10. Acceptance tests

The dedicated regression suite verifies:

- Exactly 197 core population records, with 194 year-2025 observations, 2 stale 2015 observations and 1 unknown; the 194-record subtotal is 8,177,226,143.
- Exactly 197 factory baseline countries × 21 canonical type keys, with 15,920 total simulation-only starting units.
- Exactly 41 resource profiles, 37 calibrated per-100k rates and 4 `RATE_NOT_CALIBRATED` resources.
- Per-100k invariance across countries and linear population scaling.
- Live population precedence, stale observation labels and unknown-not-zero behavior.
- Status, ownership and capacity evidence requirements for live factories.
- Active-player-only detailed factory access.
- Current-turn production transaction de-duplication using the resource finished-goods ledger.
- Separate population and factory demand, with no naive summation.
- Price/currency evidence gates and the separation of modeled cost from Treasury postings.
- Read-only behavior and the absence of a new scheduler.

The existing resource-demand, factory baseline, industrial network, country general-data and selected-country-scope tests remain compatibility checks for the Phase 6 branch.
