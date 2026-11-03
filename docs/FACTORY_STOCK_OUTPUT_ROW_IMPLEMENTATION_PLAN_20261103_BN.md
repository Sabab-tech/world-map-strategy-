# Factory Stock/Output Product Row — Implementation Plan

**Date:** 2026-11-03  
**Linear:** SAB-45  
**Base:** stacked on PR #380 head `554978cc1fcded8472958d88888931b6ead6aff0`

## Goal

Replace the crowded Stock/Output presentation with one compact row per finished product. The row order is fixed: Product + icon → actual output per day → actual attributable cost per day → where it is used/supplied → a context-sensitive status LED.

## Row design

| Product | Output / day | Cost / day | Used in | Status |
|---|---:|---:|---|---|
| Canonical SVG + friendly product name | Actual daily quantity only | Recorded product operating cost only | Factory use, domestic consumption/supply, export destinations | Green / red / yellow / neutral grey |

Product identity and icon are reused from the canonical product catalog helpers. Rows are grouped by product ID, not factory instance, so the same output is not repeated when several factories manufacture it.

## Truth and accounting rules

- Actual output is taken only from product-specific actual daily fields or a committed quantity divided by its recorded cycle duration. Planned capacity or recipe output never masquerades as actual production.
- Missing data is unknown, not zero. A stopped/confirmed inactive factory may expose a recorded zero only when the runtime explicitly says it is stopped.
- Daily cost must have product-level attribution and a compatible currency and quantity basis. Construction CAPEX is never operating cost. The current factory catalog does not establish daily operating-cost coverage; show `Not recorded` until the runtime carries authoritative values.
- Use traced finished-goods movements for factory use, domestic consumption, domestic supply and export destination. Keep supply distinct from consumption and prevent double-counting between ledger and batch records.
- LED green means known current demand is covered; red means known current demand is not covered or there is explicit unmet demand; yellow requires an explicit same-product future/projected/contracted demand increase that exceeds daily output; neutral grey means evidence is insufficient. Population growth by itself is not product demand.
- The view remains read-only. No stock, production, finance, procurement or trade runtime is rewritten.

## Implementation steps

1. Build a product-level view model from canonical assigned factory outputs plus actual finished-goods rows.
2. Resolve actual daily output per product across multiple live factories without using planned plan values.
3. Resolve daily product cost only from explicit cost records with matching product/unit/currency basis; otherwise render `Not recorded`.
4. Summarize traced use channels and export destinations by product.
5. Resolve one status LED from current and explicit future demand evidence; default to neutral unknown.
6. Replace the old planned-output and multi-column per-factory output tables with one compact five-column table.
7. Add landscape-first responsive styling and bump the offline shell cache version.
8. Add fixture tests for aggregation, actual-vs-planned separation, missing cost, traced usage, all LED states, duplicate avoidance and cache invalidation.

## Non-goals / preservation

- Do not alter factory types, product identities, canonical recipes, icons, production engine, stock ledger, finance runtime, resource logistics, Input panel, factory construction/destruction or project preflight.
- Do not delete files or assets. Changes are limited to the Stock/Output renderer, its stylesheet, service-worker cache version, focused UI tests and this plan.

## Verification gates

- Run focused `test/omega_ui_v2.test.mjs`, `npm run test:omega-ui-v2` and relevant UI/visual checks where available.
- Verify changed-file list contains only the planned additive/targeted files and no deletions.
- Exact PR head CI must be green before merge.
- If stacked PR #380 is not yet merged, wait for its required checks, reconcile onto main after its merge, then re-run checks.
- Verify the final merge commit is on `main` and the `main` ref points to the reported SHA.