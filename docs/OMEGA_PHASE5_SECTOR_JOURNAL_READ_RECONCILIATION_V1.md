# OMEGA Phase 5 — Sector Journal Read Reconciliation v1

**Status:** Additive read-only accounting-integrity slice; national sector coverage remains partial.  
**Base:** Existing Finance-owned Government journal, existing Private Enterprise firm journal, and Phase 4A National Accounts checkpoint.  
**Persistence:** Only the existing Economy-owned `economy.<ISO3>.nationalAccounts` snapshot is updated by its existing State Transaction. Finance and company cash-flow sources are never mutated.

## What this slice adds

The National Accounts country checkpoint now reads:
- the same bounded Finance source window already used for Finance evidence (maximum 500 rows);
- at most five company IDs from the existing `Omega.PrivateEnterpriseLifecycleV1.companyIds` canonical registry, resolved directly against the selected country's `economy.companyAccounts` (unknown company keys are ignored; missing canonical accounts remain visible as partial coverage);
- the latest 256 retained company cash-flow rows per resolved account.

For journalled source rows it checks transaction identity, country/company scope, source authority, currency identity, balanced integer-minor-unit debit/credit totals, line identity and line currency. It reports posted, explicitly unavailable, unjournalled, duplicate and invalid entries separately.

The output groups **counts only** by sector, currency and declared period. It does not sum money, convert currencies, derive income/expenditure or infer account balances. It always reports `status: PARTIAL` and `complete: false` because household, external-sector, supplier-counterparty and complete period-opening/closing evidence are not yet present.

## Performance and safety

- Reuses the existing Phase 4A country handler, change-driven invalidation, bounded Finance row window, and Economy State Transaction.
- Company source scanning is capped at 5 accounts × 256 rows and cooperatively yields every 512 scanned company rows.
- No world-roster scan, new scheduler, worker, timer, polling, network request, or new persisted state root.
- No source ledger, Treasury cash, inventory, company wallet, transaction, or save data is written or backfilled.
- Currency and period groups remain distinct; transaction amounts are not aggregated.
- Any source-window truncation, legacy row, unavailable posting, invalid posting or duplicate source identity keeps coverage partial.

## Acceptance tests

The National Accounts unit suite covers balanced Government and Firm postings with USD/BDT separation, wrong-country and unbalanced-line rejection, duplicate source transaction detection, unavailable/legacy coverage, dropped-row and bounded-window behavior, and the existing selected-country/save ownership contracts.

Browser and end-to-end suites remain skipped as requested. Focused National Accounts, Finance, private-enterprise lifecycle and NPC macro unit tests remain required.
