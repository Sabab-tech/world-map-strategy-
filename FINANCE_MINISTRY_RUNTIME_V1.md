# OMEGA Global Economic Profiles and Finance Ministry v1

## Scope
- economy_global_profiles_v1.json provides one record for every row in the existing countries.json roster. Baseline inputs are mapped from economy.json and population.json.
- The original source datasets are not replaced. Existing values are copied into a separate registry, and fields without source data remain null and are displayed as unavailable.
- Current repository baseline values have not been independently revalidated against official statistical sources in this change.
- Influence and fiscal-risk measures are custom game indicators, not official rankings or sovereign credit ratings.

## Indicators
Available metrics include nominal GDP, GDP growth, inflation, unemployment, public debt, budget balance, trade balance, foreign-exchange reserves, exchange rate and population where found in the repository.
Derived metrics include GDP per capita, debt/GDP, budget-balance/GDP, trade-balance/GDP, FX reserves/GDP, debt per capita and GDP rank.
Unknown policy interest rates, tax revenue, exports, imports and current-account fields are left unavailable. Modelled policy and fiscal-flow fields are separately labeled as gameplay assumptions.

## Runtime and controls
- The Finance runtime subscribes to OMEGA_SIMULATION_TURN_COMMITTED and advances modeled GDP, debt-interest accrual, fiscal flows and price index by simulated duration. Duplicate turn IDs are ignored.
- Finance state is stored under finance.<ISO3>.omegaFinance. Existing finance fields are preserved, and department allocation summaries are mirrored only to empty or Finance-owned allocation entries.
- Finance actions are restricted to the player country. Allocations reserve cash; salary, purchase, maintenance and general expenses require a sufficient allocation and treasury balance.
- Borrowing is checked against a per-transaction GDP cap and modeled debt/GDP ceiling. Transactions are recorded in a country ledger.
- Startup treasury, tax policy, policy interest and missing-budget-balance fallback are explicit gameplay assumptions, not claims about actual current government figures.

## UI and validation
The Finance dashboard uses the existing Ministry Dashboard container. Its global registry is loaded only when expanded to limit initial mobile DOM load.
The finance test suite covers country roster, explicit missing values, preserved state, allocation limits, treasury transactions, turn idempotency and country-level command isolation.
