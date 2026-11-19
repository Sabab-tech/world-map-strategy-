# OMEGA Phase 5 — Private-firm Operating Journal v1

**Status:** Additive Phase 5 implementation slice; private-firm sector coverage remains partial.  
**Base:** Government journal in PR #491 and private trade journal in PR #493.  
**Persistence:** Uses the existing country Finance ledger and company cash-flow rows. No parallel ledger, state root, scheduler, or backfill is introduced.

## Source ownership

| Evidence | Authoritative source | What this slice records |
|---|---|---|
| Private-company settled sale, import purchase and import tariff | `economy.<ISO3>.companyAccounts[companyId].cashFlowEntries` | Existing Phase 5A cash journal remains unchanged |
| Factory freight, utility, labour, maintenance, overhead and depreciation accrual | `finance.<ISO3>.omegaFinance.ledger` | Balanced company expense / accrued-payable entries |
| Payment of an accrued operating cost, when the existing settlement writer is invoked | Same Finance ledger | Balanced accrued-payable / operating-cash entries |
| Period-close corporate profit tax | Same Finance ledger | Balanced company-cash / sovereign-Treasury entries |

The source Finance transaction remains authoritative for its original cash or accrual movement. The sector journal is an accounting representation attached to that transaction; it does not write cash, Treasury, inventory, tax, or settlement a second time.

## Posting rules

| Finance source row | Debit | Credit | Basis |
|---|---|---|---|
| `PRIVATE_ENTERPRISE_OPERATING_COST_ACCRUAL` | `COMPANY_OPERATING_EXPENSE:<category>` | `COMPANY_ACCRUED_EXPENSES_PAYABLE:<company>` | Recognize the recorded operating cost and payable |
| `PRIVATE_ENTERPRISE_OPERATING_COST_SETTLEMENT` | `COMPANY_ACCRUED_EXPENSES_PAYABLE:<company>` | `COMPANY_OPERATING_CASH:<company>` | Clear the recorded payable when a payment is actually recorded |
| `PRIVATE_ENTERPRISE_CORPORATE_PROFIT_TAX` | `COMPANY_OPERATING_CASH:<company>` | `SOVEREIGN_TREASURY` | Record the already-posted period-close tax transfer |

Each posting uses the existing transaction ID, ISO-3 country, company ID, recorded currency, turn, source event/reference, explicit debit and credit account IDs, and integer minor-unit amounts. A row is `UNAVAILABLE` rather than rounded into a journal if its source identity, currency, account pair, or exact-cent amount is missing or invalid.

No employee, household, supplier, freight carrier, or other counterparty is invented. In particular, the aggregate `WORKER_INCOME` and `TRANSPORT` cash-flow allocations from the Resource Economy runtime are not converted into household payroll or supplier payables without recipient/settlement identity evidence.

**Settlement limitation:** This slice journals the existing operating-cost settlement writer when it records a Finance source row. It does not activate a new automatic payment path or claim that accrued liabilities are already being paid by normal gameplay; a live caller and cash-authority reconciliation remain separate work.

## Read contract

`OmegaPrivateEnterpriseLifecycle.getCompanySectorJournal(countryId, companyId)` returns a defensive copy of retained firm-journal evidence from both existing source windows:

- company cash-flow rows (maximum retained window: 2,048 entries);
- the private-enterprise Finance ledger source rows (maximum retained window: 4,096 entries).

The response reports `PARTIAL` and `complete: false` by design. It includes posted/unavailable counts and legacy/un-journalled source counts. It does not backfill historical rows, claim complete period coverage, or sum values across currencies. Readers must use each transaction's own recorded currency.

## Safeguards

- Only the three allow-listed private-enterprise Finance transaction types above receive these Finance-ledger postings.
- Both sides of every posted journal must balance exactly in integer minor units.
- Stable source transaction IDs preserve idempotency and audit lineage.
- The existing Finance ledger and company cash-flow rows remain the persistence authorities.
- No new all-country loop, worker, timer, polling, scheduler, or network request is added.
- Existing government journal, Treasury balance movement, Resource settlement, company wallet, market, and saved-game behavior are not replaced.
- Historical source rows are not rewritten or fabricated. Missing data stays visible as incomplete coverage.

## Focused verification

The private-enterprise lifecycle regression now verifies:
1. all six recorded factory operating-cost accruals produce balanced firm journal lines;
2. period-close corporate tax produces one balanced company-cash/Treasury posting;
3. source-ledger coverage counts distinguish new postings from older unjournalled company cash-flow rows;
4. the read API returns defensive copies and reports partial coverage.

Browser/Chromium E2E, exhaustive every-site production E2E, and Android 9 WebView performance remain skipped under the current owner instruction. They are not reported as passing. The ordinary focused Finance/private-enterprise regression and Android build remain required.

## Remaining Phase 5 work

- Establish verified employee/household recipient identity and actual payroll/transfer/consumption transactions before adding household journal entries.
- Review transport, supplier, tax, and other company cash-flow categories for explicit payee/counterparty and settlement identity before mapping them.
- Connect accrued-cost payment to a verified company cash source without counting an expense twice or spending the same cash twice.
- Reconcile opening/closing company cash, payables, debt, and physical inventory only when their authoritative source windows and periods are complete.
- Add external-sector counter-entries from the same settled-trade identity, currency, FX and settlement evidence.
- Keep GDP/value-added calculations disabled until production, expenditure and income use the same period, valuation basis and currency and pass reconciliation tolerances.

This slice improves firm-journal coverage. It does **not** complete Phase 5, the national stock-flow matrix, or reconciled GDP.
