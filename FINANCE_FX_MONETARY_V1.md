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

The Finance dashboard gains an appended FX / monetary control panel:
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
