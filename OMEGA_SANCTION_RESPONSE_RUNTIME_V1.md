# OMEGA Sanction Response and National Decision Pipeline v1.1

## Purpose

The runtime turns active sanction records into a country-owned and verifiable decision chain:

1. Policy detection and formal notification to the issuer and target; the same registry also accepts resource-embargo records.
2. Economic impact assessment from settled bilateral trade, national demand, stock coverage, production, employment, transport manifests, local prices, Treasury, FX and ministry appropriations where available.
3. Comparison of legal suppliers, alternate export buyers, domestic stock/input review and diplomacy. A restricted shortage can be referred to the bounded Black Market evidence planner, but no order is created.
4. A recovery plan that records viable alternative buyers and sellers, market price evidence, stock and production review, logistics evidence, and known fiscal/FX constraints.
5. Issuer- and target-owned intelligence investigations with evidence sources and collection tasks. Third-party suppliers receive a separate spillover assessment only when target imports and supplier exports corroborate the same customer/resource relationship.

## State ownership

| Record | Ministry | Country-owned state path |
|---|---|---|
| Sanction notification | Foreign Affairs | foreign.sanctionNotifications |
| National decision comparison | Foreign Affairs | foreign.sanctionNationalDecisions |
| Economic impact assessment | Economy | economy.sanctionEconomicAssessments |
| Market recovery plan | Trade | trade.sanctionMarketRecoveryPlans |
| Investigation | Intelligence | intelligence.sanctionInvestigations |
| Supplier spillover notification | Foreign Affairs | foreign.sanctionNotifications (role = SUPPLIER) |
| Fiscal and FX exposure | Finance | finance.sanctionFinancialExposureLedger |

## Evidence rules and safety invariants

- Reads active policy records from trade.sanctions, foreign.sanctions, and the corresponding resourceEmbargoes arrays.
- Trade exposure is based on settled import/export ledgers over a rolling 30-turn window when timestamps exist. Historical value at risk is not treated as a realised loss.
- Supplier spillover requires both the target's import ledger and the named supplier's settled export ledger to corroborate the same commodity/customer. A spillover is not evidence that the supplier itself is legally sanctioned.
- Trade values are kept separate by currency. Mixed or unattributed currencies are not summed into one misleading total.
- Demand, factory input need, production, employment, logistics, prices, FX stress, Treasury and ministry allocations are included only when existing records expose them. Unknown remains null.
- Legal supplier and alternate-buyer candidates must pass the existing Global Market supplier authority and have a verified available quantity at least as large as the requested quantity. Protected stock, route restrictions and policy constraints are not overridden.
- The NPC network planner does not create a covert order when Global Market reports a verified legal supplier able to meet the full requested quantity.
- Ministry budget data is evidence only; this runtime does not allocate, spend or transfer funds.
- Diplomacy, stock rebalancing, production changes and market recovery are recommendations only. No trade, treaty or relation adjustment is executed.
- Black Market authority remains responsible for offers, stock, permits, deals, transit, settlement and enforcement.
- Intelligence records are stored only in the affected country's own case file. Third-party supplier investigations additionally require material export exposure or secondary-sanctions scope and observed intelligence/customs capability; they use bounded review or passive monitoring only. There is no omniscient intelligence feed.
- The Black Market board reads only the active country’s own sanction notices, national decisions, economic exposure, recovery plans and intelligence case files. Other countries’ cases and undiscovered NPC transactions remain hidden.

## Runtime bounds

Per committed turn the runtime prioritizes not-yet-notified policies, rotates reassessment across previously reviewed policies, and processes at most 6 active policies, 4 product identities per policy, and 12 Global Market supplier queries. Third-party supplier spillovers are capped at 3 distinct supplier countries per policy and 6 per committed turn; supplier investigations are capped at 6 per turn. Record histories are capped at 256 entries. UI rendering does not run a global scan.

## Verification

The Black Market test suite includes this runtime's syntax and regression tests, alongside the existing market, NPC network and UI suites.
