# Factory Landscape Details Panel — Implementation Plan

**Date:** 2026-11-04  
**Repository:** Sabab-tech/world-map-strategy-  
**Base:** main at d26a156cb8c0a8ed4f4d0ad1908149462b656d41  
**Related work:** PR #379 (merged), PR #380 (merged), PR #381 (open; independent Stock/Output task)  
**Scope:** Factory-card presentation and local interaction only.

## User outcome

The Factory Ministry is primarily used in landscape orientation. The factory card details must not turn the screen into a long portrait-style page. Tapping for full recipe details must not replace/reload the whole Industry screen. Each applicable factory card must clearly show the amount of every required input per factory per game-day.

## Current behavior audited

- Factory recipe previews are built in `omega_ui_v2/screens/industry.js`.
- Individual input/output/by-product disclosure controls update state and call `scheduleRender()`.
- The default schedule path calls `render()`, which rebuilds the Industry root markup. This causes the whole factory screen to blink/rebuild for a small disclosure action.
- Multiple independent mini-disclosures allow several product sections to be opened and increase card/page height.
- PR #380 already introduced the canonical guarded `capacity × recipe coefficient ÷ cycleDays` calculation. This task must reuse it, not invent a parallel calculation.

## Implementation

1. Replace per-section disclosure controls with one factory-card details action. Preserve the compact card preview: primary output(s), one declared by-product, and the first canonical input.
2. Render a single shared, landscape-oriented details panel at the Factory stage level. The panel is a fixed-height/absolute side view with its own bounded vertical scrolling. The main page and factory-card grid do not grow when it opens.
3. Keep full recipe content in inert per-card templates. On tap, copy only the selected card's template into the shared panel using the delegated event handler. Do not call `scheduleRender()`, `render()`, fetch, simulation, polling, or background work for this disclosure action.
4. Store the currently open card key on the root. Opening another card replaces the shared panel content; opening the active card again or using Close hides it. Update all trigger `aria-expanded` values and keep only one active card.
5. Include all canonical inputs, primary outputs, co-products, by-products, unclassified outputs, cycle and quantity-basis information in the panel. For live factory assets, preserve the existing delivered batch, factory input stock, committed output and warehouse readings.
6. Use the existing guarded `factoryRouteRate()` calculation to show **Required per factory per day** for inputs when a valid compatible rate exists. Keep the exact recipe coefficient and basis visible. Missing rate inputs remain “Not recorded”; do not infer zero or invent units.
7. Adjust landscape and narrow-landscape CSS so the selected details view fits beside the compact factory cards and scrolls inside its own frame. Preserve portrait fallback, factory actions, build preflight, Stock/Output, Input and all existing runtime flows.
8. Advance the offline shell cache version only if the current main cache version has not already been advanced by an independently merged PR.
9. Add regression tests that verify the side panel opens/closes/switches cards without changing the parent screen markup, that all product roles are available in the selected panel template, and that daily input requirements use the existing canonical calculation.

## Preservation boundaries

- No files are deleted.
- No resource, factory, product, recipe, SVG, save-data, inventory, logistics, finance, production or construction runtime identity/behavior is changed.
- The existing Build / Destroy / Input / Stock / Production Lines / Research and construction preflight flows remain intact.
- PR #381 is an independent Stock/Output change. Its work must be retained and reconciled if it merges while this branch is in progress.
- The initial render stays synchronous. Opening and switching the details panel performs only bounded DOM updates and no network/runtime calls.

## Verification gates

- Focused Industry UI tests and factory production baseline tests.
- UI/visual regression checks available in CI.
- Exact PR head workflow run review, including any Android offline check.
- Check changed paths for accidental deletions or unrelated scope.
- Merge only after required CI checks are green; then verify the merge commit is on `main`.
- Automated CI is not represented as physical testing on every Android device.
