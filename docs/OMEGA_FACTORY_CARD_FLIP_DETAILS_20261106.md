# OMEGA Factory Card Flip Details

**Date:** 2026-11-06  
**Repository:** `Sabab-tech/world-map-strategy-`  
**Base:** `main` at `21730ee0b279ddf5dea53b5a6d59156166f5f533`  
**Branch:** `feat/factory-card-flip-details-20261106`

## Design decision

The previous readable-card patch stacked recipe rows on the front face, but the user-facing three-column landscape cards still have insufficient horizontal space for long product labels and multiple recipe roles. The new design keeps the three-card landscape register and moves recipe data to a reverse face on the same card.

## Main face

- Retain the dark navy / blue-steel / cyan OMEGA production-card appearance.
- Keep the factory identity, canonical factory SVG, country factory count, and current live operating state where available.
- Show a compact primary-output identity and three recipe counts: Inputs, Outputs, and Byproducts.
- Remove multi-row recipe text from the front face.
- Replace the card action label **Build** with **Manage** while retaining its existing construction/management workflow.
- Add **Details (i)** beside Manage. On live asset cards, keep the existing Destroy action.

## Reverse face

- Flip the same card in place. Preserve its exact card dimensions and visual shell.
- Keep the same factory heading and identity on the reverse face.
- Show three tabs: **Input**, **Output**, and **Byproduct**. Input is selected by default whenever Details opens.
- Render canonical SVG identity, friendly product name, and whole-number compact amount for each product.
- Amounts are explicitly displayed as a per-factory, per-game-day recipe rate. They are derived only when the canonical coefficient, capacity, cycle and unit are available; otherwise display Not recorded.
- Input status uses tracked inventory/coverage only: green = sufficient, yellow = at risk / partial stock, red = shortage, gray = not tracked.
- Output status reflects recorded consumption: green = consumed, yellow = partly used / distributed / still in stock, red = produced but unused, gray = not tracked.
- Byproduct rows intentionally omit the status field.
- All canonical products remain visible in their applicable tab; long names wrap/clamp by word boundaries, and the row list scrolls within the reverse face rather than changing card size.

## Interaction and runtime preservation

- Only one card can be flipped or managed at a time. Other cards remain action-locked while a card is open.
- Switching tabs updates the reverse face locally. Closing Details returns to the front face locally.
- Selecting a live factory does not implicitly open Details.
- Rendering or flipping does not run production, move inventory, trigger a fetch, or change the save.
- Existing production, inventory, logistics, output commitment, factory count, construction preflight, Destroy, SVG identity, and factory catalog authorities remain unchanged.
- No new factory types, resources, products, recipes, or runtime systems are introduced.
- Offline shell cache moves from v95 to v96 so installed clients refresh the updated renderer and stylesheet.

## Verification

The implementation must pass the targeted UI v2 suite, full repository tests, Android build, and Android 9 offline gameplay smoke on the exact PR head. Emulator CI does not substitute for a separate physical-device test.
