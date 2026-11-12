# OMEGA Sanction Response and National Decision Pipeline v1.0

## Purpose

The runtime turns active sanction records into a country-owned and verifiable decision chain:

1. Policy detection and formal notification to the issuer and target.
2. Economic impact assessment from settled bilateral trade, national demand, stock coverage, production, employment, transport manifests, local prices, Treasury, FX and ministry appropriations where available.
3. Comparison of legal suppliers, alternate export buyers, domestic stock/input review and diplomacy. A restricted shortage can be referred to the bounded Black Market evidence planner, but no order is created.
4. A recovery plan that records viable alternative buyers and sellers, market price evidence, stock and production review, logistics evidence, and known fiscal/FX constraints.
5. Issuer- and target-owned intelligence investigations with evidence sources and collection tasks.

## State ownership

| Record | Ministry | Country-owned state path |
|---|---|---|
| Sanction notification | Foreign Affairs | foreign.sanctionNotifications |
| National decision comparison | Foreign Affairs | foreign.sanctionNationalDecisions |
| Economic impact assessment | Economy | economy.sanctionEconomicAssessments |
| Market recovery plan | Trade | trade.sanctionMarketRecoveryPlans |
| Investigation | Intelligence | intelligence.sanctionInvestigations |
| Fiscal and FX exposure | Finance | finance.sanctionFinancialExposureLedger |

## Evidence rules and safety invariants

- Reads active policy records from trade.sanctions and foreign.sanctions.
- Trade exposure is based on settled import/export ledgers over a rolling 30-turn window when timestamps exist. Historical value at risk is not treated as a realised loss.
- Demand, factory input need, production, employment, logistics, prices, FX stress, Treasury and ministry allocations are included only when existing records expose them. Unknown remains null.
- Legal supplier and alternate-buyer candidates must pass the existing Global Market supplier authority. Protected stock, route restrictions and policy constraints are not overridden.
- Ministry budget data is evidence only; this runtime does not allocate, spend or transfer funds.
- Diplomacy, stock rebalancing, production changes and market recovery are recommendations only. No trade, treaty or relation adjustment is executed.
- Black Market authority remains responsible for offers, stock, permits, deals, transit, settlement and enforcement.
- Intelligence records are stored only in the affected country's own case file. There is no omniscient intelligence feed.

## Runtime bounds

Per committed turn the runtime processes at most 6 active policies, 4 product identities per policy, and 12 Global Market supplier queries. Record histories are capped at 256 entries. UI rendering does not run a global scan.

## Verification

The Black Market test suite includes this runtime's syntax and regression tests, alongside the existing market, NPC network and UI suites.
