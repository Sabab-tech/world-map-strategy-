# OMEGA Phase 5 — Government Sector Journal v1

**Status:** First implementation slice; partial sector-journal coverage only.  
**Authority:** Finance Ministry (\`finance.<country>.omegaFinance.ledger\`).  
**Persistence:** Journal postings are attached to the existing Finance transaction rows. No parallel ledger, Treasury, scheduler, or save root is introduced.

## Scope

This slice records balanced, integer-cent double-entry postings for the cash transactions that the existing Finance Ministry already owns:

| Existing Finance action | Debit | Credit |
|---|---|---|
| \`EXPENSE\` | Government expense by department/category | Government Treasury cash |
| \`EXPENSE_ROLLBACK\` | Government Treasury cash | Original department/category expense |
| \`BORROW\` | Government Treasury cash | Public debt |
| \`DEBT_REPAYMENT\` | Public debt | Government Treasury cash |
| \`WORLD_BANK_DEBT_SERVICE\` | Public debt principal and interest expense | Government Treasury cash |

World Bank debt service is represented as one Treasury credit against two debit components. Principal and interest must sum exactly to the recorded cash payment in integer cents. The Finance transaction remains the authoritative cash movement and is never applied a second time by the journal.

## Journal contract

Each posting records the canonical ISO3 country identity plus the Finance country code, USD currency, simulation turn, fiscal-year period, source Finance transaction ID, source action, correlation/reference ID, accounting basis and provenance. Source amounts must be exactly representable in cents; non-cent amounts are marked `UNAVAILABLE` instead of being rounded into the journal. Each line has a stable source-derived line ID, account, debit/credit side, integer minor-unit amount and source transaction reference.

A posting is exposed as \`sectorJournalV1\` on its existing source Finance ledger row. The Finance API method \`getSectorJournal(country)\` provides a defensive copy of the retained journal evidence. It explicitly reports \`PARTIAL\` / \`complete: false\` because Finance retains a bounded 500-row source ledger and other economic sectors are not yet represented.

## Explicit exclusions

- Budget allocation transfers are not cash movements and do not create postings.
- Modeled tax accrual is not assigned a taxpayer counterparty. It remains excluded until transaction-level tax-source records exist.
- External Treasury reconciliation with an unknown source account remains unclassified and is excluded.
- Household, firm, and external-sector records are not synthesized in this slice.
- The journal does not calculate GDP, sector value added, household income/consumption, firm profits, or a complete national stock-flow account.

Missing inputs and split amounts remain unavailable; the implementation does not fill them with zero or fabricate counterparties. A journal posting is an accounting representation of an existing Finance transaction, not a second cash write.

## Runtime and compatibility safeguards

- No new clock, worker, timer, scheduler handler, per-turn roster loop, or network request is introduced.
- The current Finance handler, Ministry State Transaction, canonical country identity and save lifecycle remain unchanged.
- Existing Finance ledger rows and legacy saves remain readable. No existing files or saved records are deleted.
- The existing Finance ledger window bounds retained source evidence. The new accessor reports that the window is incomplete instead of claiming complete period coverage.
- Finance rules are versioned in \`finance_runtime_rules_v1.json\` and served by the offline shell cache (v127).

## Focused verification

The Finance runtime test suite adds checks for:
1. Expense posting, balanced debit/credit lines, same-request idempotency and exclusion of non-cash budget transfers.
2. Expense reversal, sovereign borrowing, principal repayment and split World Bank debt service.
3. Partial/bounded journal API behavior, defensive-copy semantics and non-cent amount rejection.

The offline data-cache test now verifies that \`finance_runtime_rules_v1.json\` is available from the installed shell while offline. Browser E2E and Browser tests are intentionally not part of this slice.

## Next Phase 5 slices

1. Add firm-owned postings at the existing private-company transaction owners (sales, supplier payments, operating costs, wages only where actual payroll transactions exist, and tax only where a recorded tax payment exists).
2. Add household postings only through a real wage/transfer/consumption source; do not infer household transactions from aggregate Finance or production indicators.
3. Add external-sector counter-entry evidence from settled trade using the settlement's recorded currency, FX and mirrored settlement identity.
4. Define period-opening/closing account coverage and reconcile only when all required sources are complete.
5. Enable GDP approaches only after production, expenditure and income share the same period, valuation basis and currency and reconcile within configured tolerances.

Until those source owners and gates are implemented, this slice remains a partial Government cash journal and must not be described as a completed national stock-flow economy.
