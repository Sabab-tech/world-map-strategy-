# OMEGA Global FX, Government Banking & Monetary Simulation v1.0

## Delivery status

This is an additive extension to the existing Finance Ministry. It does not replace the national finance ledger, country profiles, finance sector registry, ministry router or simulation clock.

### Existing work found before this extension
- The repository already contains the Finance Ministry runtime, global country/area economic profiles, fiscal policy controls, Treasury and department allocations, spending/borrowing ledger, turn-driven debt-interest and price-index calculations.
- The current profile registry has 249 country/area identities. It is not 249 sovereign states or 249 distinct currencies: some entries are territories, some areas share a currency, and some have no independent currency.
- The source currency/GDP/FX baseline is labelled 2015 in the current finance architecture. It has not been independently verified as a current official market dataset.
- Existing Finance controls use the OMEGA active player identity to limit actions. Other country profiles are intended to be read-only.

## Runtime entry points
- `omega_forex_monetary_engine_v1.js`: currency registry, USD-numeraire conversion, reference-rate refresh, simulated FX dynamics, monetary policy, charting and Government Banking mirroring.
- `omega_finance_ministry_runtime_v1.js`: remains the authoritative owner of Treasury, department allocations, borrowing, spending and policy interest-rate action.
- `economy_global_profiles_v1.json`: original baseline registry remains intact.
- `root.governmentBanking.forex`: canonical game-state subtree for the FX subsystem.
- `root.governmentBanking.countries[ISO2]`: per-country/area banking snapshot.
- `root.governmentBanking.fxMarket`: normalized market rates and provenance.
- `root.governmentBanking.fxClearingHouse`: aggregate clearing volume, modeled fee revenue and latest settlement.
- `root.finance[ISO3].governmentBanking`: mirrored country banking snapshot.
- The new script is loaded after the existing Finance runtime in `index.html`. No existing file is deleted.

## Currency registry and conversion

- Existing `sourceValues.currency_code` data is preferred; narrowly scoped overrides cover known shared-currency territories and exceptional areas. Areas with no currency do not receive an invented one.
- Multiple countries using the same currency code share a rate and a monetary policy. The catalogue may include currencies absent from the original per-country baseline; a quote is still marked unavailable unless a rate is available.
- USD is the numeraire. The quote convention is (R_c =) local-currency units for 1 USD. The reciprocal quote is (1/R_c =) USD for one local unit.
- Cross-rate from currency (a) to currency (b): (X_{a\to b}=R_b/R_a). Gross output: (A_b=A_a X_{a\to b}). The modeled clearing fee is applied to the USD notional, then translated to the destination currency.
- Missing or non-positive exchange rates reject conversion. No rate is silently fabricated to make a transfer look successful.
- Example: BDT↔NGN is calculated using BDT/USD and NGN/USD quotes and recorded in the in-game Government Banking clearing ledger. It is a game-system transaction, not a real bank transfer.

## Reference rates versus game rates

The UI offers two distinct series:
1. **World reference rates**: online, daily source observations; refresh is throttled to once per six hours and saved to local storage. Reference rates can be stale or unavailable while offline. They are not tick-by-tick trading prices.
2. **OMEGA simulation rates**: the game begins with the repository's existing baseline when available, then evolves with simulation time and in-game policy. These are game results, not claims about real-world quotes.

Reference histories request up to approximately one month of observations. The chart never fills missing reference dates with invented market observations. If the browser cannot reach the provider, it falls back to a cached series, otherwise reports unavailable.

## Exchange-rate and inflation equations

The stored quote is local units per USD. An increase in (R_c) means the local currency depreciates; a decrease means appreciation.

Annual modeled currency pressure is:
[
d=0.90(\pi_c-\pi_{USD})-0.22(i_c-i_{USD})-0.10(g_c-g_{USD})
-0.035TB_c+0.012\max(0,D_c-60)-0.012\max(0,FX_c-10)
+0.10M_c+\epsilon
]
where:
- (pi): inflation (%)
- (i): annual policy interest rate (%)
- (g): GDP growth (%)
- (TB_c): trade balance as a percentage of GDP (a deficit is negative)
- (D_c): public debt / GDP (%)
- (FX_c): FX reserves / GDP (%)
- (M_c): modeled money-supply growth (%)
- (epsilon): small deterministic simulation shock

The model clamps annual (d) to [-60%, +120%]. Over a simulated interval (Delta t):
[
R_{t+\Delta t}=R_t\left(1+\frac{d}{100}\right)^{\Delta t/365\text{ days}}
]
The simulated exchange-rate regime is free float, managed float, or a reserve-dependent peg band. USD is the fixed numeraire, so it is not treated as a freely drifting quote in this engine.

Modeled inflation updates gradually toward the player-selected target:
[
\Delta\pi=0.06(\pi^*-\pi)-0.025(i-\pi^*)
+0.025(M-g)+0.06\max(0,d)
]
The change is multiplied by elapsed simulation years and bounded to [-5%, 1000%]. It is intentionally a transparent game rule, not an official macroeconomic forecasting model. Outcomes depend on the configured coefficients and baseline quality; do not present them as exact forecasts of a real country.

## Central-bank gameplay controls

- Inflation target, modeled annual money-supply growth, policy interest rate and FX regime.
- Central-bank currency support consumes recorded FX reserves and is rejected if reserves are insufficient.
- Modeled currency weakening buys USD reserves by expanding the model's local-currency liabilities.
- FX conversions and central-bank interventions are logged with time/turn, quote, fee or reserve changes.
- Finance-owned treasury actions remain with the existing Finance runtime. The FX converter records a clearing settlement but deliberately does not silently deduct or credit sovereign Treasury cash. Linking a real trade/payment contract to Treasury requires a separate explicit settlement command.

## UI

The Finance dashboard contains a dedicated **FX & Banking** icon tab. The FX panel mounts only inside that tab, and is not appended to the Overview, Budget, Income, Treasury or Reports tabs:
- currency conversion with source and destination selectors;
- reference/game quote mode;
- one-month line chart of local units per USD;
- daily percentage-change bar chart;
- pie chart showing the observed up/down/flat daily moves;
- global currency catalogue;
- searchable Government Banking country/area register;
- monetary-policy and reserve-intervention forms;
- last FX clearing transactions.

The panel uses native canvas drawing and the existing page environment rather than adding another runtime chart CDN. Charts show available observations only. On the game series, one sample is stored per 24 hours of simulated time, capped to the last 30 daily closes.

## Security and state integrity
- The extension is additive and stores its state under `governmentBanking.forex`; it does not replace the existing economy or Treasury record.
- Player monetary-policy interest changes go through the existing Finance runtime's country-scope guard.
- Other countries are shown as data/read-only profiles; only the active player's monetary policy and reserve intervention are actionable through the UI.
- Conversion and intervention amounts are validated; missing rate/FX-reserve data rejects an action.
- External reference data is read-only and does not authorize or initiate a real-world bank transfer.
- The local-storage cache is a browser convenience, not trusted authority. Game state and transaction validation remain in the runtime. Future multiplayer/server deployments must move authoritative settlement and anti-replay checks to a trusted backend.

## Validation plan and known boundaries

The regression test file covers USD-numeraire cross-rates, fee math, missing-rate rejection, inflation and FX-pressure direction, currency metadata overrides, and history retention/sorting. The new tests must be run with `npm run test:finance-fx`; the existing finance tests remain `npm run test:finance`.

Follow-on work should be delivered in distinct reviewed slices:
1. Run the new and existing Finance tests in the repository's CI/runtime and fix any integration failures before treating the build as green.
2. Add persisted foreign-currency account balances and explicit debit/credit settlement instructions; tie international trade, tariffs, sanctions, payment delays, correspondent-bank limits and counterparty risk to Government Banking.
3. Make monetary policy influence national demand, imported input prices, household purchasing power, real wages, production costs, public purchasing and election/stability signals, without double-counting Finance's existing turn accrual.
4. Add reserve adequacy, import cover, current-account pressure, capital flows, confidence and defaults as explicit game-state inputs; distinguish observed fields from modeled fields.
5. Add scenario-based regression runs (high inflation, money creation shock, reserve loss, peg attack, trade surplus, high-rate disinflation and currency union) and produce before/after diagnostic reports.
6. For production online play, add signed/server-side FX quote snapshots, source timestamps, rate freshness limits, transaction idempotency keys and an auditable event log. Do not put API secrets in client-side files.

## Limits
This is an in-game simulation integrated into the browser project. It does not connect to a sovereign central bank or transfer real money. Daily online reference quotes depend on network access and provider coverage; offline gameplay uses cached reference data or the separately labelled simulation series. The underlying 2015 source baselines need a separate data-quality project before being treated as current official statistics.

## Extended implementation: Government Banking and financial transmission (2026-10-19)

### 1. Multi-currency sovereign account book
omega_government_banking_runtime_v1.js owns currency account sub-ledgers and the clearing journal. A country account portfolio is seeded from the existing Finance Treasury only; an unconfirmed domestic-currency opening balance starts at zero rather than being invented.

- Transfers validate country identities, active-player funding authority, currency-account balance, FX availability, sanctions/war state, correspondent limits, daily limits, counterparty risk and optional payment delay.
- Cross-border quotes use the USD numeraire and record both quote rates, USD notional, fee, rate provenance, turn and transaction key.
- Delayed transfers retain a hold until the due turn. The matching transfer may consume its own reserved amount, but not money held for other payments. A keyed ledger row transitions from PENDING to SETTLED/CANCELLED rather than leaving conflicting rows.
- Finance Treasury changes from wages, taxes and ministries are reconciled into the bank sub-ledger. Reconciliation is deferred for countries involved in an in-flight settlement so a partial debit/credit is not misclassified as an outside transaction.

### 2. Trade settlement and rollback
The existing Global Trade System remains the trade orchestration layer. It asks Government Banking for a USD-denominated quote, checks buyer funding and policy limits, posts the buyer's gross payment and the modeled import-tariff receipt through Finance, debits the seller's physical resources, credits seller proceeds and delivers the resource batch to the buyer. Banking commits only after the monetary and resource commands succeed. Failure paths issue compensation commands with distinct idempotency keys; retrying a previously settled transaction should recover its recorded result instead of charging money or stock twice.

Trade price reads apply the financial transmission producer-cost multiplier. National resource demand reads the household purchasing-power multiplier and the import-cost multiplier before the existing price-elasticity formula, while the resource-demand runtime remains the sole authority for inventory debit, protected stock, factory usage, coverage and shortages.

### 3. Financial transmission and real-economy signals
omega_economic_transmission_runtime_v1.js runs on OMEGA_SIMULATION_TURN_COMMITTED and ignores duplicate turns. It stores up to 31 daily samples per country and produces CPI, nominal/real wage indexes, household purchasing power, import-cost/producer-cost indexes, real public purchasing power, a real-GDP proxy, export competitiveness and a modeled stability index. Index values start at 100 for this model's opening baseline; they are not official CPI or wage observations.

Import exposure is derived from imports/GDP only if the source data exists. Otherwise the configured default is tagged as a model assumption. Nominal wage growth similarly uses a clearly tagged GDP-growth proxy only when wage data is unavailable. The producer-cost model combines domestic price pressure with exposure-weighted imported input pressure, including currency depreciation and the configured import tariff. Missing GDP remains unavailable rather than being fabricated.

### 4. Central-bank stress mechanics
The FX engine accepts optional capital-flow, confidence, reserve-cover and peg-attack inputs in its currency-drift equation. The transmission runtime aggregates modeled stress across countries sharing a currency and offers counterfactual scenarios for an inflation shock, capital flight, reserve loss, peg attack, trade surplus and disinflation. Counterfactual scenarios return before/after values without changing live treasury, bank accounts, inventory or exchange rates. Their coefficients are explicit gameplay rules, not a calibrated forecast of any real central bank.

### 5. Data provenance and protection
- Existing country economic baselines remain labelled as 2015. Official/reference FX observations are held separately from OMEGA simulation exchange rates and include provider status/date.
- Missing or non-positive FX quotes reject transactions rather than making up a price. The local-storage cache is an offline convenience, not authoritative settlement storage.
- Player-originated transfers and monetary-policy changes are checked against the active player identity. Banking and trade commands are internal game functions only; no real bank rail or real money movement is enabled.
- For multiplayer or production deployment, settlement/idempotency authority must move to a trusted server with signed quote snapshots, source timestamps, rate freshness limits, replay protection and tamper-evident audit retention.

### Validation gates
The Finance GitHub Actions workflow runs existing Finance tests plus FX conversions/policy/history, Government Banking account/transfer/tariff/delay/idempotency tests, economic transmission/wage/import-cost/stress tests, the Global Trade and National Demand suites, and offline-cache checks for the new banking/transmission assets. Green CI means the tested contracts pass on that commit; it does not certify every country source-data field or guarantee real-world FX forecasts.

## Extended implementation: Government Banking and financial transmission (2026-10-19)

### 1. Multi-currency sovereign account book
omega_government_banking_runtime_v1.js owns currency account sub-ledgers and the clearing journal. A country account portfolio is seeded from the existing Finance Treasury only; an unconfirmed domestic-currency opening balance starts at zero rather than being invented.

- Transfers validate country identities, active-player funding authority, currency-account balance, FX availability, sanctions/war state, correspondent limits, daily limits, counterparty risk and optional payment delay.
- Cross-border quotes use the USD numeraire and record both quote rates, USD notional, fee, rate provenance, turn and transaction key.
- Delayed transfers retain a hold until the due turn. The matching transfer may consume its own reserved amount, but not money held for other payments. A keyed ledger row transitions from PENDING to SETTLED/CANCELLED rather than leaving conflicting rows.
- Finance Treasury changes from wages, taxes and ministries are reconciled into the bank sub-ledger. Reconciliation is deferred for countries involved in an in-flight settlement so a partial debit/credit is not misclassified as an outside transaction.

### 2. Trade settlement and rollback
The existing Global Trade System remains the trade orchestration layer. It asks Government Banking for a USD-denominated quote, checks buyer funding and policy limits, posts the buyer's gross payment and the modeled import-tariff receipt through Finance, debits the seller's physical resources, credits seller proceeds and delivers the resource batch to the buyer. Banking commits only after the monetary and resource commands succeed. Failure paths issue compensation commands with distinct idempotency keys; retrying a previously settled transaction should recover its recorded result instead of charging money or stock twice. A transaction ID that has been cancelled/compensated is final and cannot be reused for a fresh debit.

Trade price reads apply the financial transmission producer-cost multiplier. National resource demand reads the household purchasing-power multiplier and the import-cost multiplier before the existing price-elasticity formula, while the resource-demand runtime remains the sole authority for inventory debit, protected stock, factory usage, coverage and shortages.

### 3. Financial transmission and real-economy signals
omega_economic_transmission_runtime_v1.js runs on OMEGA_SIMULATION_TURN_COMMITTED and ignores duplicate turns. It stores up to 31 daily samples per country and produces CPI, nominal/real wage indexes, household purchasing power, import-cost/producer-cost indexes, real public purchasing power, a real-GDP proxy, export competitiveness and a modeled stability index. Index values start at 100 for this model's opening baseline; they are not official CPI or wage observations.

Import exposure is derived from imports/GDP only if the source data exists. Otherwise the configured default is tagged as a model assumption. Nominal wage growth similarly uses a clearly tagged GDP-growth proxy only when wage data is unavailable. The producer-cost model combines domestic price pressure with exposure-weighted imported input pressure, including currency depreciation and the configured import tariff. Missing GDP remains unavailable rather than being fabricated.

### 4. Central-bank stress mechanics
The FX engine accepts optional capital-flow, confidence, reserve-cover and peg-attack pressure inputs in its currency-drift equation. The transmission runtime aggregates modeled stress across countries sharing a currency and offers counterfactual scenarios for an inflation shock, capital flight, reserve loss, peg attack, trade surplus and disinflation. Counterfactual scenarios return before/after values without changing live Treasury, bank accounts, inventory or exchange rates. Their coefficients are explicit gameplay rules, not a calibrated forecast of any real central bank.

### 5. Data provenance and protection
- Existing country economic baselines remain labelled as 2015. Official/reference FX observations are held separately from OMEGA simulation exchange rates and include provider status/date.
- Missing or non-positive FX quotes reject transactions rather than making up a price. The local-storage cache is an offline convenience, not authoritative settlement storage.
- Player-originated transfers and monetary-policy changes are checked against the active player identity. Banking and trade commands are internal game functions only; no real bank rail or real money movement is enabled.
- For multiplayer or production deployment, settlement/idempotency authority must move to a trusted server with signed quote snapshots, source timestamps, rate freshness limits, replay protection and tamper-evident audit retention.

### Validation gates
The Finance GitHub Actions workflow runs existing Finance tests plus FX conversions/policy/history, Government Banking account/transfer/tariff/delay/idempotency tests, economic transmission/wage/import-cost/stress tests, the Global Trade and National Demand suites, and offline-cache checks for the new banking/transmission assets. Green CI means the tested contracts pass on that commit; it does not certify every country source-data field or guarantee real-world FX forecasts.


## Finance FX coverage and interaction repair (2026-10-19)

- Country currency lookup now falls back through legacy profile fields, indicators and canonical general-fact currency-code lists before applying the explicit exceptional-area override table.
- Bouvet Island is mapped to NOK through its Norwegian administration; Antarctica remains without an invented national currency.
- The country registry exposes one row per country/area with its currency, local units per USD, USD per local unit, FX-rate source and data status. Areas sharing a currency correctly share that currency's quote.
- The FX dashboard reports country-level quote coverage. The country registry opens by default and is contained in a scroll region so it stays usable on narrow screens.
- **Calculate quote** runs the common USD-numeraire formula without changing the clearing ledger. **Record simulated exchange** is the explicit action that records a simulated settlement. Amount and currency/source changes update the quote preview.
- The getCountryQuotes(mode) API and country-level diagnostics expose coverage for simulation and reference quotes. Reference rates remain contingent on provider availability; missing rates are reported rather than fabricated.
- Validation added to test/omega_forex_monetary_engine_v1.test.mjs covers country quote direction, fallback currency mapping and the new FX control affordances. Run npm run test:finance-fx and npm run test:finance before merging.


## FX interaction hierarchy and Banking settlement integration (2026-10-19)

- The FX landing view now prioritizes player currency, both USD quote directions, country lookup and the converter. Central-bank policy, trend charts, the full currency catalogue, all-country register and settlement journal are grouped in expandable details so new players are not presented with every control at once.
- Inline SVG controls are used for refresh, currency swap, quote/record, policy, chart, catalogue, registry, audit and Government Banking disclosure headings. They remain same-origin and do not create a remote asset dependency.
- Changing the chart series no longer changes the FX market mode globally. The converter's rate-source control remains the source for the displayed quote and the country register. Reference quotes are read-only and cannot be submitted as a game settlement.
- The FX converter's Record exchange action calls `OmegaGovernmentBanking.convert(...)`. Only after the bank API confirms settlement does the FX side append its reference record and update its own volume/fee summary. Banking owns the currency sub-account balance movements, Finance Treasury cash authority, transaction idempotency, fee accounting and the canonical banking ledger.
- Converter fee basis points are forwarded through the Government Banking conversion API so the displayed simulation quote uses the same fee rule as the transaction. The UI no longer fabricates a successful FX ledger record when Banking is unavailable or rejects settlement.
- Country lookup shows both `local units per USD` and `USD per local unit`, with rate availability/provenance. An absent rate stays unavailable rather than falling back to a fabricated amount.
- Government Banking account controls are preserved and moved into a collapsed, labelled details region inside the FX tab. Account transfer, country policy, per-currency accounts and ledger remain available.
- Validate with `npm run test:finance-fx`, `npm run test:finance`, and the full Finance/Government Banking CI workflow before merge.
