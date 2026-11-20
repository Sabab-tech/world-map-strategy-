# OMEGA Simulated Sovereign Lending Institution v1

## Core invariant: two independent data planes

This runtime intentionally separates **official World Bank reference observations** from **OMEGA's simulated country economy**.

### Simulated data plane (authoritative for the game)

All in-game decisions use the current runtime record for that exact country:
- `state.economy[profile.economyKey].gdp`
- `debt`, `gdp_growth`, `inflation`, `unemployment_rate`, `reserves`, `budget_balance`
- the existing Finance runtime's current Treasury, fiscal budget and policy fields
- population already in the local game data and the game FX runtime's current quote

The credit engine does not use World Bank GDP, debt, inflation, unemployment, reserve or fiscal observations as fallback values. It never writes game values to the World Bank API. If game GDP or public-debt/GDP cannot be computed, the loan limit is zero and the reason is shown. Missing is never interpreted as zero.

A committed OMEGA simulation turn re-evaluates game-state credit assessments. A game's GDP fall, inflation rise, Treasury drop, or added debt therefore changes the next in-game decision based on the game's own values.

### Public reference data plane (read-only)

The separate reference cache stores World Bank WDI observations and provider country metadata, including each indicator's actual observation year and source code. They are displayed only in **Finance → World Bank lending → Reference data**. No reference indicator is consumed by the simulated score or lending ceiling.

Reference data can be stale, revised, reported for a different year or missing. Those facts are shown rather than filled with guessed values. A refreshed reference snapshot cannot overwrite a country economy, loan, Treasury or in-game decision.

The World Bank public API does not expose a game's simulated economy, nor should OMEGA attempt to send its changing GDP or inflation to the provider. "The institution reacts to the game" means the in-game lending institution reacts to OMEGA's state, not that the real World Bank is notified.

## Low-latency update design

- The runtime initializes from the local Finance registry and existing game state without waiting for the network.
- The public-data refresh runs asynchronously after initialization.
- Seven current WDI indicators are requested in one combined indicators call using the API's most-recent-non-empty-value option, plus one country-metadata request. The engine keeps the year returned for each individual country/indicator.
- A successful live reference refresh is cached for up to 24 hours. Failed/partial requests use exponential-style throttling with a one-hour minimum retry interval unless the player manually requests a refresh.
- Offline launch keeps an available cache and game simulation running. It does not make synthetic reference observations to fill holes.
- Country decisions are indexed by exact ISO3/ISO2 aliases. If the incoming identity is ambiguous or ISO3 and ISO2 identify different profiles, the record is rejected instead of guessed or assigned to the nearest matching name.
- Game assessment work is cached by simulation turn; significant changes are ledgered, and UI rendering/refresh work is debounced. This avoids repeating expensive country scans for every event or repainting multiple times in the same turn.
- Country tables are built for the active inner tab only. The all-country view limits the rendered row count and supports a search field instead of building an enormous DOM table.

Source references:
- [World Bank API basic call structures](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures)
- [World Bank Indicators API overview](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api)
- [World Bank country API queries](https://datahelpdesk.worldbank.org/knowledgebase/articles/898590-country-api-queries)

## Simulated credit assessment

This is an auditable gameplay heuristic, **not an official World Bank sovereign rating or forecast**. Each component is clamped to the interval 0–100. Available weights are renormalized when a field does not exist, while confidence is reduced.

| Input component | Weight when evidence exists |
|---|---:|
| Public debt / GDP | 31.5% |
| Inflation | 18% |
| GDP growth | 18% |
| FX reserves / GDP | 13.5% |
| Fiscal balance / GDP | 9% |
| OMEGA loan repayment history | 10% |

Formulas currently used:

- Debt score: `clamp(100 − debtToGDP × 0.40, 0, 100)`
- Inflation score: `clamp(100 − max(0, inflation − 2) × 2.2, 0, 100)`
- Growth score: `clamp(50 + annualGDPGrowth × 4, 0, 100)`
- Reserves score: `clamp(reservesToGDP × 4, 0, 100)`
- Fiscal score: `clamp(50 + fiscalBalanceToGDP × 2, 0, 100)`

The credit-history component is used only after actual repayment/default evidence exists. Arrears and previous defaults reduce the score; repaid contracts can improve it. A country with no historical simulated contract is not automatically punished for being new.

Core game GDP and debt data must be present to issue a loan. The current guardrails include:
- Debt/GDP at or above 250%: normal lending is rejected.
- Inflation at or above 30%: stabilization review.
- Confidence below 60%: no lending decision or positive facility.
- A country in simulated default/insolvency review: new borrowing is frozen until arrears are cured or an accepted workout resolves the hold.

Decision categories include eligible, conditional, watch list, high-risk rejection, insufficient data and conditional data gap. Each country is evaluated separately; selection aliases cannot route one country's data to another.

## Loan-size ceiling

The game computes the maximum new principal as the minimum of these limits:

```text
debtCapacity = max(0, 2.5 × simulatedGDP − currentPublicDebt)

scoreCap = 3.0% of GDP if score >= 80
           2.5% of GDP if score >= 70
           2.0% of GDP if score >= 60
           1.0% of GDP if score >= 55
           0 otherwise

countryCap = simulatedGDP × scoreCap × confidence / 100

maxNewLoan = min(
  countryCap,
  debtCapacity,
  simulatedGDP × existing Finance transaction cap (5%),
  unused OMEGA lending-facility capacity
)
```

Only eligible/conditional assessments can request a positive amount. The request is posted through the existing Finance Ministry `borrow` action; Finance Treasury and national public debt remain the authoritative accounting records.

## Facility tiers and negotiation limits

The base tiers below are **OMEGA gameplay assumptions** selected from game GDP per capita, not World Bank income/lending classifications:

| Game tier | Base annual rate | Maturity | Initial grace period |
|---|---:|---:|---:|
| Concessional simulation | 1.25% | 35 years | 5 years |
| Blended simulation | 2.25% | 30 years | 4 years |
| Standard development simulation | 3.25% | 20 years | 3 years |

The Loan Desk exposes a purpose selector, principal, annual interest/financing return, maturity, grace period and currency-equivalent selector. Changing purpose updates the baseline and allowed negotiation ranges.

Negotiation is not unlimited:
- Absolute ordinary-loan base rate: 0.5%–8.5% per year.
- Maturity: whole years only, between 5 and 40 years; the score selects how far a proposal may deviate from base terms.
- Grace period must be a whole number and shorter than maturity; its available range is capped at six years.
- Stronger scores permit small concessions, while weaker scores restrict them or prevent a facility altogether.
- Emergency facilities apply a predefined modest surcharge and shorter maturity; they do not bypass country-credit, liquidity or Finance ceilings.

The fixed-payment estimate uses the usual annuity equation for principal (P), annual rate (r), and repayment years (n):

```text
payment = P × r / (1 − (1 + r)^(-n))
r = annual percentage rate / 100
n = repayment term after grace
```

This is an annualized estimate. The actual runtime services interest and repayment according to elapsed simulation time and the stored contract.

## Currency and settlement

The sovereign debt/Treasury ledger remains denominated in USD for consistency with the existing Finance runtime. The currency selector is a display/equivalent currency at the current **simulated** FX quote; each loan stores the issue-rate snapshot and issue-time local-currency equivalent. The contract table can show the current local-currency equivalent separately.

No missing or non-positive FX quote is guessed. If a local currency is unsupported or its simulated rate is unavailable, the conversion is unavailable; the USD contract can still be assessed in USD. Local-currency equivalents do not rewrite the original principal.

## Institution capital and partner-country liquidity

OMEGA's simulated institution state is kept under `state.governmentBanking.worldBankLending`. Initial opening cash and the global revolving limit are game-rule values:
- Initial simulation cash pool: US$250 billion.
- Configurable outstanding-principal capacity: US$1 trillion.

These are **not** the World Bank's reported capital, cash balance or lending commitment. They exist to limit gameplay disbursements. Loan principal disbursed leaves the pool; borrower repayments return principal/interest to it. The available pool and revolving capacity are tracked separately.

When the pool is short, the engine may request funding from an eligible sovereign partner:
- Candidate data must be available in OMEGA's own state.
- Candidate credit score must be at least 65 with at least 60% evidence confidence.
- Debt/GDP must be at most 180%, inflation at most 20%, and severe negative growth is filtered out.
- The lender's existing Treasury must remain above a 0.5% GDP reserve floor (and a small cash minimum).
- An ordinary per-draw cap is 0.5% GDP and aggregate commitment cannot exceed its configured/capped commitment.
- The active player country is **never auto-debited**. It must explicitly register a lender commitment in the Partners & liquidity tab.
- NPC countries can make rule-bound offers only when they pass the same game-state credit/reserve filters.
- The Finance/Government Banking runtime debits the lender Treasury and records a mirrored claim. The institution records the matching liability; it accrues interest and services partner claims on each committed turn.
- Duplicate draw/accrual/payment IDs are idempotent. Invalid authorizations, inadequate reserves, missing contracts or inconsistent repayment splits are rejected.

If funding cannot be obtained, the borrower loan is not issued. The engine does not create a fictitious top-up to make a transaction appear successful.

## Delinquency, penalty and sovereign workout rules

These thresholds are explicit **OMEGA simulation rules inspired by common debt-workout concepts**, not a declaration of binding international law or a statement about any country's treaty rights.

| Overdue time in the game | Game response |
|---|---|
| 30 days | Late-payment notice/status recorded; penalty spread begins when a contract is overdue |
| 90 days | Mediation/workout request becomes eligible |
| 180 days | Default status; new borrowing for that country is frozen |
| 270 days | Insolvency/restructuring review |
| 360 days | Bankruptcy/sovereign-workout proceeding status |

The penalty spread is capped at two percentage points above the negotiated rate; effective interest is capped at 10.5%. Unpaid obligations remain in arrears. A restructuring proposal can adjust the rate within a narrow current-rate band, extend maturity by at most five years (whole-year total remains at most 40), and add no more than two years of new grace. It is not permitted when core game data are absent or debt/GDP reaches the hard-stop threshold. Accrued obligations remain recorded; a restructuring is not debt forgiveness.

Institution-level funding arrears can freeze new lending to every country until partner liabilities are serviced or reconciliation is corrected. These states and every loan/status change are stored in the ledger so the UI can show why an action was rejected.

## Finance user interface

Finance → **World Bank lending** opens the new nested screen. Only the active sub-tab's content is rendered:

1. **Overview** — selected country's live game metrics, score, institution cash, revolving capacity and important risk notices.
2. **Loan desk** — functional new-loan form and bounded term negotiation.
3. **Contracts** — outstanding principal, accrued interest, rate, annual-payment estimate, term, status and overdue information; bounded workout form when eligible.
4. **Countries** — searchable country-credit register with identity-specific rows.
5. **Partners & liquidity** — institution cash, active funding liabilities, player consent registration and registered partner table.
6. **Reference data** — only screen that shows actual public World Bank observations/metadata, with observation years and a bold separation notice.
7. **Rules & safeguards** — highlighted key contract limits, penalty ranges and workout timeline.

The sub-tabs use small SVG line icons, keyboard-accessible buttons and responsive grids. The all-country register renders a small first page and uses search rather than dumping every country row into the mobile DOM. Refresh/recalculate actions, tab navigation, partner consent, loan request and restructuring forms are connected to explicit action handlers. The added runtime is in the HTML load chain and offline shell assets.

## Audit ledger and idempotency

The runtime stores:
- country assessments and evaluation turn;
- a public-reference data snapshot and per-indicator year/source;
- loan applications and idempotency keys;
- loan contracts, accruals, arrears, restructuring and repayment history;
- partner agreements, funding liabilities and repayment settlements;
- an auditable event ledger bounded to the latest configured number of entries.

Assessment updates are logged only when the decision changes materially, score moves by a meaningful amount or maximum limit changes substantially. The turn-level assessment cache and debounced rendering reduce repeated work on slow devices.

## Test coverage and deployment boundary

The branch adds World Bank tests for:
- game-vs-reference isolation (reference mutations do not change the simulated score; game-state mutations do);
- cross-ISO identity conflict rejection;
- loan ceiling, player-country scope, idempotency and mismatched replay rejection;
- bounded interest and maturity negotiation;
- partner registration limits;
- overdue restructuring;
- cached-reference preservation while offline;
- Government Banking partner draw/reserve/interest/repayment invariants;
- dedicated Finance tab, offline-cache asset and workflow validation.

GitHub CI must pass before merge. The UI/contract model has not yet been proven through full Android end-to-end play on a device; the browser-runtime tests do not substitute for that final verification. This client-side system is not safe for a competitive multiplayer economy without a server-authoritative financial ledger, authenticated transactions and durable locking.

## Sources for external reference-data format

- [World Bank Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api)
- [Basic API call structures and most-recent observations](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures)
- [World Bank country metadata API](https://datahelpdesk.worldbank.org/knowledgebase/articles/898590-country-api-queries)
