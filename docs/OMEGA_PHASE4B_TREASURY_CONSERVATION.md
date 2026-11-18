# OMEGA Phase 4B — Treasury & Fiscal Conservation

## Purpose

Add period-aligned Treasury cash conservation using the existing Finance Ministry as the single financial authority. This milestone extends Finance-owned state and the read-only National Accounts checkpoint; it does not create a new Treasury engine, independent ledger, scheduler, clock or global country scan.

## Identity

For one country, one fiscal period and USD:

```
Closing Treasury cash
  = Opening Treasury cash
  + Tax receipts
  + Borrowing proceeds
  + External cash credits
  - Government cash spending
  - Interest paid
  - Principal repaid
  - External cash debits
```

A period is reconciled only when its opening is trusted, its cash-flow coverage is complete from that opening, and the equation agrees within the existing money tolerance.

## Existing Finance authority mapping

| Cash-flow component | Existing Finance-owned source | Treatment |
|---|---|---|
| Opening Treasury | Finance cash balance at a true new-game start or prior Finance-period close | Store once with source and quality |
| Tax receipts | `currentYearTaxRevenueUsd` | Recorded game-model tax cash, not observed national tax data |
| Borrowing proceeds | `BORROW` mutation | New explicit `currentYearBorrowingUsd`; financing cash inflow, not GDP income |
| External credits | `reconcileExternalTreasury` positive cash delta | Count once against last-synced balance |
| Government spending | `currentYearSpendingUsd` | Actual Finance-posted expenses, net of authorized rollback |
| Interest paid | `currentYearInterestUsd` | Only interest paid/cash-settled |
| Principal repaid | `currentYearDebtPrincipalRepaymentUsd` | Debt principal only |
| External debits | `reconcileExternalTreasury` negative cash delta | Count once against last-synced balance |

## Correct classification rules

- Budget allocation and `BUDGET_TRANSFER_IN/OUT` reallocate annual ministry ceilings. They do not debit or credit national Treasury cash and are excluded from both sides of the identity.
- A World Bank debt-service payment has one total Treasury outflow: principal plus interest. The ledger split is analytical; do not subtract the split a second time. Public debt outstanding falls by principal only.
- Manual `DEBT_REPAYMENT` is a principal-only Treasury outflow.
- Borrowing increases cash and debt. It is a financing inflow, not revenue, operating income or GDP.
- A tax receipt accrual that already updates Finance cash must not be reclassified as an external credit during Finance synchronization.
- Resource/Trade/other ministry changes to `finance.available` are captured once by Finance's existing last-synced-balance reconciliation. When transaction provenance cannot be established, label them as unclassified external cash adjustments; do not invent a category.
- Finance current-period counters update at the existing mutation points in O(1). Do not rescan the bounded 500-row transaction ledger to rebuild a fiscal period.

## Opening and legacy-save policy

- A trusted new-game opening can be captured before the first Finance fiscal accrual, including its `GAME_STATE` or `MODELLED` provenance. Trust requires an authoritative `OMEGA_GAME_SESSION_CREATED` event matching the active session ID, player country, `READY` session state and initial committed turn. A low simulation turn alone is not evidence of a new game.
- A persisted Finance model is never promoted to a trusted new-game opening by a later session event. A legacy save with no reliable opening remains `PARTIAL/UNOBSERVED`.
- At a fiscal-year rollover, close and archive the previous Finance period, reset current-period flow counters, then capture the next opening from the pre-reconciliation Finance closing before external cash deltas or new-period accruals are applied.
- Every entry point that reconciles external cash—including scheduler turns, Finance actions, state getters and dashboard metric reads—uses the same rollover guard. A read path cannot assign a boundary cash delta to the period being closed.
- An older save without an opening snapshot remains `PARTIAL` / `UNOBSERVED`. Its current balance and bounded ledger are not enough to reconstruct an opening; never back-solve the missing value.
- If one or more fiscal periods are skipped by the country runtime, record a gap/partial status rather than claiming full coverage.
- Keep at most 12 compact closed-period snapshots. The current-period summary and bounded history remain under the existing country Finance state.

## National Accounts integration

National Accounts reads the Finance-owned current period summary and passes its opening, inflow, outflow and closing values to its Treasury reconciliation helper. It remains read-only with respect to Finance, Trade, Resource and Factory. It writes only its Economy-owned `nationalAccounts` checkpoint through Ministry State Transaction.

## Runtime and performance contract

- Reuse the existing Finance country handler on the existing World Simulation Scheduler.
- No extra scheduler, turn callback, worker, timer, polling loop, UI repaint or all-country scan.
- Period-flow updates and summary refresh are O(1) on the existing Finance action/turn path.
- History is bounded to 12 periods; the raw Finance ledger remains bounded by its existing limit.
- Preserve save/load compatibility. Missing old fields are migrated to explicit unknown/partial state, never zero-as-observed.
- Use the existing USD Finance cash authority. Other currencies and transaction-time FX remain a later Phase 4D responsibility.

## Required regression gates

1. New-game opening captured before the first tax/interest accrual and labelled by provenance.
2. Borrowing appears exactly once as a Treasury inflow.
3. Budget transfers do not change cash or fiscal flow aggregates.
4. Expense and rollback restore Treasury and period expenditure exactly once.
5. World Bank debt service debits total cash once and reduces public debt by principal only.
6. External Finance cash delta is recorded once, including on repeated reads.
7. A fiscal-boundary external cash delta is assigned to the newly opened period even when a Finance getter/dashboard read runs before the scheduler.
8. Replaying the boundary turn neither duplicates the cash delta nor archives the same period twice.
9. A low-turn state without a verified session-created event remains `PARTIAL/UNOBSERVED`; persisted Finance state cannot be promoted by a later event.
10. Fiscal rollover archives the prior period and opens the next at the pre-accrual closing balance.
11. Legacy save opening remains unknown/partial until a trusted future opening.
12. Duplicate same-turn country advancement adds no second flow.
13. History remains capped at 12.
14. National Accounts reads Finance-owned period evidence without mutating Finance state.
15. Existing Finance, World Bank, Android, offline, NPC and Resource systems remain connected and pass their exact-head checks.
