# PR #379 Follow-up Remediation Plan

Date: 2026-11-03
Repository: Sabab-tech/world-map-strategy-
Base: main at 81896bbca40c21db3f91ed001de32a827a2a411a
Related Linear issue: SAB-43
Related merged PR: #379 (merge commit 6ba6f21c9e5fe6642033ad55ecb12eba960360e8)

## Why this follow-up exists

PR #379 is merged, and its original progressive-disclosure implementation is present on main. A review of the Linear acceptance criteria against the current main source found several remaining correctness and presentation gaps. This follow-up is limited to closing those gaps; it does not replace the existing implementation or redesign unrelated ministries.

## Required remediation

1. **Correct unknown input stock**
   - A present input-inventory object does not prove that every recipe input has a stock row.
   - Remove the UI fallback that converts a missing product key into numeric zero.
   - Display “Not recorded” when that exact product balance is absent; preserve a real recorded zero only when the key exists with value zero.

2. **Remove invented processing routes**
   - The Universal Materials Processing Plant must use only eligible commercial mine/site resources selected for the country.
   - Remove the hard-coded coal / iron-ore fallback when no eligible site exists.
   - An empty site mix must produce an honest missing-route state, not a fabricated input/output plan.

3. **Use one quantity-rate calculation**
   - Reuse one helper for card preview and country Input/Stock plan rates.
   - Calculate modeled output or input per game-day as capacity × canonical recipe coefficient ÷ cycleDays.
   - Require a valid positive capacity, valid positive cycle duration, and a known compatible unit. An explicitly incompatible quantity basis suppresses the rate; a legacy recipe that omits its basis may still show a modeled game-unit rate, while its coefficient label remains marked “basis not recorded.”
   - Keep exact per-production-unit coefficients visible; label derived values as modeled per game-day per factory.
   - Do not invent a per-tick rate: the displayed game tick duration must be authoritative before such a conversion is introduced.

4. **Make visible product text human-readable**
   - Remove internal product IDs from visible product labels while retaining canonical identity in data attributes.
   - Render recipe identifiers, quantity basis, category, and units without underscores.
   - Show the product's friendly name in the live asset's recorded-output label.
   - Keep canonical IDs unchanged in data, recipe lookup, and runtime interfaces.

5. **Reduce product SVGs in compact card rows**
   - Resize only the recipe-row product icon to a proportionate 20 px desktop / 18 px mobile footprint.
   - Keep the factory's main illustration, Stock/Input panel visuals, and canonical icon sources unchanged.
   - Keep product names and quantities readable and aligned.

6. **Bound first-load catalog warm-up**
   - The initial Factory view must render synchronously and must never wait on a catalog or baseline promise.
   - Bound the optional read-only warm-up wait so a promise that never settles cannot leave the card refresh pending forever.
   - On timeout, retain the explicit missing-data state and do not repeatedly launch the same background load.
   - Preserve the existing guard that prevents a late refresh from reviving a hidden ministry screen.

7. **Offline/UI cache**
   - Keep the existing industry.js and factory stylesheet in the service-worker core asset list.
   - Advance the offline shell cache version so clients fetch the corrected card JavaScript and CSS.

8. **Regression coverage**
   - Cover missing per-product input stock versus a real zero.
   - Cover formula-derived per-game-day rates and missing-rate behavior.
   - Cover the no-eligible-site processing case without coal/iron-ore fallback.
   - Cover readable visible labels and no visible underscores.
   - Cover compact product SVG dimensions and offline cache invalidation.
   - Preserve the existing progressive expand, Build, Input, Stock, selection, and Destroy tests.

## Safety / scope boundaries

- No existing file, factory type, resource ID, product ID, recipe, SVG, saved game, or UI action is to be deleted.
- No inventory, logistics, market, finance, construction, production scheduling, batch, or ledger runtime is to be rewritten.
- Only the Factory card's existing read-only presentation/calculation path, its stylesheet, the service-worker cache version, tests, and this audit record are in scope.
- All unrelated main changes must be retained by branching from the exact current main head and using a normal pull request merge.

## Verification required before completion

- Run focused UI, factory baseline, and resource/industrial regression tests.
- Run the repository CI workflows for the exact follow-up PR head.
- Confirm that the changes are present on main after merge.
- Report CI separately from physical-device hands-on testing; CI success is not a claim that every phone or every saved game has been manually exercised.
