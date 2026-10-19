# OMEGA World Bank Reference & Sovereign Lending Runtime v1

## Scope and boundaries

This is an in-game public-data-driven lending simulator. It does not connect to the World Bank's internal loan origination systems, submit real financing applications, move real money, or represent an actual World Bank credit rating. Published World Bank data is used as evidence for a game decision model; simulated GDP, Treasury balances, contractual loan balances and debt service remain OMEGA state.

The existing Finance Ministry remains the authoritative issuer of borrowing proceeds and national debt. The new runtime calls `OmegaFinanceMinistry.applyAction({ type: 'borrow', ... })`; foreign-country profiles are read-only and a loan may only be issued for the active player country.

## Reference-data connector

The runtime uses the public World Bank Indicators API v2 and country metadata API. No World Bank API key is required for the public WDI endpoints. Indicator observations and metadata are stored separately from live OMEGA economic data.

Indicators collected on a successful refresh:
- GDP, current US dollars: `NY.GDP.MKTP.CD`
- GDP growth, annual percent: `NY.GDP.MKTP.KD.ZG`
- Consumer-price inflation, annual percent: `FP.CPI.TOTL.ZG`
- Unemployment, percent of labour force: `SL.UEM.TOTL.ZS`
- Central-government debt, percent of GDP: `GC.DOD.TOTL.GD.ZS`
- Population: `SP.POP.TOTL`
- Total reserves including gold, current US dollars: `FI.RES.TOTL.CD`

For each indicator and country, the connector chooses the latest non-empty observation among the retrieved years and retains that observation year and source indicator. Country metadata stores the provider's income level, region and lending-type category. Different indicators often have different latest years; the engine records those years instead of implying all values describe the same year.

Refresh is throttled to once per 24 hours, supports an explicit manual refresh, keeps browser-cache/state snapshots, and preserves prior observations when the network fails. When data is missing, it stays `null`/N/A. No synthetic World Bank observation is created. On first launch without cached data and while offline, the runtime reports unavailability and uses only the existing game data that is available.

## Country credit model

The score is a transparent, game-specific 0–100 heuristic, not a real sovereign rating. Component values are only included when an underlying value exists; the used component weights are renormalized, and confidence is the percentage of total weights actually supported by data.

Component scores:

- Debt: `clamp(100 - debtToGDPPercent × 0.40, 0, 100)`
- Inflation: `clamp(100 - max(0, inflationPercent - 2) × 2.2, 0, 100)`
- Growth: `clamp(50 + annualGDPGrowthPercent × 4, 0, 100)`
- Reserves: `clamp(FXReservesToGDPPercent × 4, 0, 100)`
- Fiscal balance: `clamp(50 + fiscalBalanceToGDPPercent × 2, 0, 100)`

Base weights:
- Debt-to-GDP: 31.5%
- Inflation: 18%
- GDP growth: 18%
- FX reserves-to-GDP: 13.5%
- Fiscal balance-to-GDP: 9%
- Prior simulated repayment record: 10% (when contract history exists)

The history component is scored only when a contract has actual repayment, a completed repayment, or arrears evidence; a newly issued loan alone does not improve the borrower’s history. When scored, it uses a baseline of 90/100, reduces the score for arrears as a share of original principal and for contracts in arrears, and adds up to 10 points for contracts fully repaid. A country without repayment-performance evidence is not penalized; the history component is omitted and its weight is renormalized with the available components. Confidence therefore reflects both missing economic indicators and missing repayment records. If GDP or public-debt-to-GDP is unavailable, the assessment is `DATA_INSUFFICIENT` and the proposed amount is zero. Confidence below 60% blocks a normal credit recommendation; confidence between 60% and 70% can permit only a conditional game recommendation. Debt-to-GDP at or above 250%, extremely high inflation (30%+), missing core inputs or a low score trigger guardrails. A missing value is not interpreted as zero.

Indicative decisions:
- `ELIGIBLE`: score at least 72 and confidence at least 70%, with core data and guardrails clear.
- `CONDITIONAL`: score at least 55, with core data and minimum confidence met.
- `WATCHLIST`, `REJECT_HIGH_RISK`, `DATA_INSUFFICIENT`, `CONDITIONAL_DATA_GAP`, or `NO_LENDING_WINDOW`: no automatically issued loan.

## Loan amount and terms

The model also enforces a single global revolving principal capacity. The saved setting `state.governmentBanking.worldBankLending.facilityCapacityUsd` defaults to **US$1 trillion of simulated outstanding principal capacity** and can be tuned by game rules. New contracts reserve capacity; principal repayments free it again. This figure is a gameplay configuration, not a reported World Bank capital or lending commitment.

For a country with valid GDP and debt values:

```text
debt_capacity = max(0, 2.5 × GDP − existing_public_debt)
score_cap_pct = 3.0% if score ≥ 80
                2.5% if score ≥ 70
                2.0% if score ≥ 60
                1.0% if score ≥ 55
                0% otherwise

proposed_max = min(
  GDP × score_cap_pct × confidence / 100,
  debt_capacity,
  GDP × 5%
)
```

Only `ELIGIBLE` and `CONDITIONAL` decisions can carry a positive proposed limit. The issuance action remains subject to the Finance runtime's existing transaction and total-debt checks. The amount approved by this game model is never greater than the current calculated limit.

World Bank country metadata is used to select a *gameplay analogue* for an IDA, Blend, or IBRD window when available. An unknown/unusable provider category is explicitly marked provisional rather than treated as an official determination. Rates and repayment periods in `TERMS` are scenario assumptions; they are not actual World Bank term sheets. Emergency facilities have separate modeled terms.

Fixed-payment helper:

```text
payment = principal × r / (1 − (1 + r)^(-n))
r = annual_rate_percent / 100
n = repayment years after grace
```

At a zero rate, payment is principal divided by the number of repayment years.

## Daily simulation and debt servicing

On each committed OMEGA simulation turn, the engine recalculates country credit assessments from the current Finance indicators and current game economy. A changed score, decision, or loan ceiling is recorded in the country assessment ledger. This is a re-evaluation of game state; it does not rewrite the historical World Bank observation.

Issued contracts store original principal, remaining principal, accrued interest, annual rate, grace period, maturity, issue turn, approval-score snapshot, total principal repaid, total interest repaid, and arrears. Interest accrual is idempotent per country loan/turn. Finance turn integration excludes the outstanding World Bank contract balance from its general-policy interest calculation to avoid charging it twice, accrues the contract's configured interest, and calls scheduled servicing against available Treasury cash while preserving a cash floor of 0.5% of GDP where possible. Unpaid amounts remain in arrears rather than silently disappearing. Finance's manual principal repayment is also reflected in the matching loan contract record.

## State and user interface

Canonical state subtree:

`state.governmentBanking.worldBankLending`

It contains public-data reference observations, country assessments, applications, loan records by country, idempotency keys, and an auditable event/ledger history. It does not replace the existing `state.finance`, `state.economy`, or Government Banking/FX records.

Finance Ministry now includes a dedicated **World Bank lending** tab containing a selected-country snapshot, score/decision/confidence, proposed loan limit, facility terms, active contracts, manual data-refresh and reassessment controls, and a searchable all-country register. Only the active player country sees the issuance form. Offline runtime assets are cached by the service worker.

## Operational caveats

- This is a heuristic game model. Calibrate thresholds and rates using playtests rather than presenting scores as forecasts.
- WDI indicators may be old, revised, missing, or published in different years. Check the per-indicator observation year before interpreting or comparing values.
- A working browser connector requires internet access and provider availability. Browser CORS, offline use, or API errors can prevent a live refresh; old reference observations are preserved.
- Some map profiles represent territories/areas, not independent sovereign states. Country metadata and lending eligibility are kept separate from game profile identity.
- This client-side game ledger is not secure enough for competitive multiplayer. A production or multiplayer system would need server-side authority, authenticated commands, idempotent durable storage and independent audit logs.

## Primary sources

- World Bank Indicators API overview: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api
- World Bank API basic call structures: https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures
- World Bank country API queries: https://datahelpdesk.worldbank.org/knowledgebase/articles/898590-country-api-queries
