# Resource Ministry: Mine Management v1

## Included in this change

This is an additive gameplay layer over the existing resource endowment, industrial network, inventory, economy, trade and finance runtimes. It does not replace the canonical catalog, rewrite country-owned reserve data, or make a real-world source status change when a player builds a mine.

### UI structure

- **My Mines** is the player's mine-asset and project view. It shows commissioned mine assets, construction progress, raw and processed stock, recent site-flow records, and recorded fiscal settlement links.
- **Mines** is the country-scoped site directory. Site pages show commodity, source-reported operating status, location precision, a gameplay construction estimate, material availability and build eligibility.
- Construction and extraction actions are enabled only for the active player country. A country selector in the directory is for inspection, not a way to control another country.
- The UI embeds inline SVG icons so the controls don't depend on a third-party icon font or remote images.

## Mine construction lifecycle

1. The industrial runtime resolves a selected site from the canonical site registry and validates the requested resource and ISO-3 country boundary.
2. A construction quote returns simulated game-rule CAPEX, estimated duration, committed workforce, bill of materials, live treasury availability, material shortfalls and duplicate-project status.
3. Starting construction requires the full treasury balance, all listed material quantities and enough explicitly committed workers. If any check fails, no construction cash or materials are debited.
4. The accepted project records a unique project/request ID, treasury transaction, consumed batch/stock allocations, cost authority and turn.
5. Existing simulation turn advancement updates construction progress. At completion, a player-owned mine asset is added to the country's resource state and the endowment runtime is asked to rehydrate its mine controllers.
6. Extraction still passes through the established reserve, policy, transport, warehouse and compatible-factory checks. Commissioning a mine is not the same thing as guaranteeing output.

CAPEX and material requirements are **simulation rules**, not vendor quotes or observed real-world mine construction budgets. Staffing represents a player-entered construction commitment, not proof that a real labour pool has been measured.

## Production and fiscal accounting

The authoritative physical flow remains:

`Site / Reserve → Extraction Batch → Raw Warehouse → Transport → Factory Input → Processing → Finished-Goods Batch → Inventory / Market Offer → Confirmed Settlement → Fiscal / Treasury Ledgers`

- Raw ore and construction materials must be accounted for separately from processed outputs.
- Factory output is registered through `OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE`, then the economy runtime records output and attempts to publish inventory-backed market offers.
- Finished-goods creation by itself is **not cash revenue**. The treasury is updated by the finance / trade settlement authority; the industrial site-flow ledger merely links the receipt or settlement back to contributing source batches.
- Existing event/settlement IDs are used for idempotent construction requests and the established fiscal-sale event path; a produced commodity is not directly converted to treasury cash by the UI.
- Where exact batch lineage, a current quote, a site-specific measured reserve, or a route is unavailable, the UI/runtime must show unavailable/blocked status instead of inventing an observed value.

## New site supplement and data policy

`resource_site_country_mineplay_batch_20261020_v1.json` adds 30 source-referenced site identities across Botswana, Rwanda, Malawi, Senegal, Zimbabwe, Tanzania, Mozambique, Zambia, Ghana and Namibia. The supplemental file is loaded independently by the endowment runtime and individual site/map binding. Existing canonical, reserve-simulation, legacy expansion and migration files remain in place.

The supplement deliberately separates four kinds of information:

- Source-referenced site identity, commodity and status context.
- Approximate regional coordinates for strategic-map display.
- Current measured reserve / grade / production fields, which remain `UNOBSERVED` when no site-specific value has been verified.
- A clearly marked `SIMULATED` gameplay reserve seed, which is only a deterministic scenario input and never represented as a geological reserve.

Some site-level operator, ownership or operating-state details have a source-verification caveat. Before external real-world use, these should be rechecked against current mining regulator and operator filings. Real-world operational status is not automatically overwritten by player commissioning.

## Recommended next increments

1. **Geology and survey:** add survey missions, discovery probabilities, sample grade, confidence class, reserve certification and depletion scenarios with source/evidence lineage.
2. **Workforce and permits:** staff allocation by skill, wages, safety standards, licences, land rights, environmental permits and resettlement obligations.
3. **Mine operations:** power, water, explosives, fuel, spares, maintenance, equipment availability, downtime, recovery and commodity-specific operating cost.
4. **Environment and closure:** tailings capacity, water pollution, rehabilitation bonds, carbon/water footprint, community approval, closure cost and reclamation milestones.
5. **Transport and industrial matching:** route-aware haulage cost/capacity, port/rail bottlenecks, factory recipe compatibility, stock reservations and blocked-delivery feedback.
6. **Market and treasury:** price volatility, grade-adjusted pricing, refining losses, offtake contracts, insurance, export duties, royalties, corporate tax, worker and contractor payments, and cash/batch reconciliation reports.
7. **Data operations:** country-by-country coverage metrics, stale-source alerts, duplicate-site checks, source-quality scores, and a visible distinction between observed, reported, estimated and simulated figures.

## Validation

The focused mine management workflow checks script syntax, mine project accounting, the new 30-site dataset, recipe coverage, site binding, the existing industrial pipeline, and endowment/extraction runtime tests. Main-branch integration should occur only after the required checks are green.
