# OMEGA Factory Card Progressive Disclosure — Git Work Record & Implementation Plan

**Date:** 2026-11-03  
**Tracking issue:** SAB-43 — OMEGA Factory Cards: Show canonical Inputs & Outputs inline  
**Repository:** `Sabab-tech/world-map-strategy-`  
**Base branch:** `main`  
**Base commit audited:** `3aaf288569d20ca65aa62f1f704910903f1495f7`  
**Implementation branch:** `feat/factory-card-progressive-details-20261103`  
**Scope:** Existing OMEGA Industry / Factory UI only, with narrowly scoped backward-compatible canonical catalog presentation metadata if required.

> This file is the first implementation commit's authoritative work record. It records the task, design, architecture, sequencing, constraints, and acceptance gates before changing production code. It does not claim implementation or gameplay completion.

---

## 1. User request and intended result

The player should be able to understand a factory's purpose without repeatedly switching between the Factory, Input, and Output/Stock panels. Each existing factory card remains a card, but its information becomes progressively disclosed.

The card has three states:

1. **Normal / collapsed:** only the important factory information and a carefully limited product preview are visible.
2. **Expanded production details:** a deliberate bottom chevron opens the full production formula inside the same card.
3. **Build requirements:** activating Build switches that same factory-type card to the construction requirements view. The normal production copy is replaced, rather than being left underneath the build information.

No new Factory page, Input page, Output page, recipe engine, inventory, or production simulation is requested. Existing detailed management panels remain available and fully functional.

## 2. Exact collapsed-card content rules

Preserve the current factory-card visual identity and existing useful metrics/actions. The normal card should retain its current factory identity, factory illustration/SVG, name, type, operating status, established capacity/daily-output display where supported, construction time and owned count where applicable, plus its existing Build/Destroy actions where appropriate.

The production summary is intentionally short:

### Primary outputs
- Show at most **two** products explicitly classified as primary outputs.
- If a factory route has one primary output, show one.
- If it has two, show both.
- If more than two are classified as primary, show the two with the best explicit display priority; the remaining products remain available in expanded details.
- Never infer primary status from output coefficient size alone.
- If output classification is not available, do not guess. Show a neutral output preview or a classification-pending state while preserving every product in the full details.

### By-product
- Show exactly one highest-priority explicitly classified by-product in collapsed view.
- The label should be concise: **By-product: [product]**.
- If no by-product is classified, omit the entire by-product row, including its label and icon.
- If there is exactly one by-product total, do not show a dropdown arrow.
- If there are additional by-products, show a small section-specific chevron; clicking it reveals only the remaining by-products.
- A co-product that is economically important must not be automatically demoted to a by-product. Classification must be reviewed and explicit.

### Inputs
- Show exactly one primary input in collapsed view, chosen by explicit priority metadata.
- Other inputs are hidden until the input-section chevron is used or the card is fully expanded.
- If there is exactly one input total, do not show a dropdown arrow.
- If the input role/priority is unknown, do not pretend that an arbitrary first key is the true primary input. Retain all inputs in the expanded list and use an honest unresolved preview state until classified.

### Quantities
- Show a compact amount adjacent to a visible product only when the canonical quantity basis, unit, coefficient, capacity and cycle calculation are compatible and authoritative.
- Do not display a raw recipe coefficient as tonnes/day, units/day, or any other physical daily rate.
- If only a coefficient is known, show the coefficient with its explicit basis, such as `0.60 / production unit`.
- Do not inflate cards with verbose prose, source notes, descriptions, or long product lists. Full information belongs in the expanded state.

## 3. Three-state interaction contract

### State A — Normal / collapsed

- All cards start collapsed.
- Show the primary outputs (one or two), optional one by-product, and one primary input according to the rules above.
- Use the OMEGA product/resource identity component and the existing canonical SVG icon path.
- Display any quantity only with a truthful basis/unit.
- A bottom-centre expansion control is visible when the full formula contains information not currently visible.
- The control is a compact, distinctive metallic plate with layered upward/downward chevron artwork, a restrained cyan glow, a proper touch target, and an accessible name/expanded state.
- If no hidden rows exist, omit that section's dropdown. If there is no additional card detail, omit the bottom expansion control rather than showing an inert control.

### State B — Expanded production details

- Activating the bottom control expands the same card in place; it must not navigate to a new screen or open a modal.
- One card is expanded at a time by default. Opening a different card collapses the previous card.
- The expanded panel lists all canonical:
  - Inputs
  - Primary outputs
  - Secondary/co-products
  - By-products
  - Waste/residue/loss outputs
  - Recipe/cycle identifiers and duration
  - Quantity basis and units
- Every row uses the canonical product identity and SVG rendering.
- The full list differentiates:
  - Planned recipe input requirement
  - Delivered input batches
  - Current factory input stock
  - Planned/expected output
  - Committed actual output
  - Current processed/finished stock
- Planned values must never be represented as actual receipts, consumption, or completed production.
- Existing Input and Stock/Output tabs retain their current complete management tables and semantics.

### State C — Build requirements

- On a factory-type card, clicking the existing Build/Build project action switches the body of that same card to Build Requirements.
- Hide/replace the normal product summary while Build mode is active; do not display production input/output rows behind or underneath the construction material list.
- Keep a compact factory identity/header and a clear Back/close action.
- Display, where present in the canonical profile:
  - construction duration in game-days
  - modeled construction cost and currency/unit
  - every construction material and required quantity
  - material unit and simulation-only provenance
  - required infrastructure
  - required technology
  - current available quantity only when retrieved from authoritative selected-country inventory
  - shortage/unavailable/unknown state
- Build materials are **not** production recipe inputs. They come from the profile's construction-material data and the existing construction preflight/runtime.
- A long construction bill of materials may use its own compact first row plus expandable remainder, without rendering every row when collapsed.
- The existing authoritative construction form/runtime must remain the authority for validation, recipe choice, capacity, duration, cost, atomic material debit, and project creation. Showing Build Requirements must not itself create a project or debit stock.
- Do not fabricate inventory quantities. Unknown stock remains Not recorded.

## 4. Meaning of Recipe and the current data contract

A Recipe is the canonical formula for one production route. It defines product identities consumed and produced, per-route coefficients, production-cycle duration, unit and quantity basis. It is not another product catalog and is not a UI-only list.

The current canonical source is `resource_industrial_catalog_v1.json`:
- 21 canonical factory profiles.
- 22 downstream factory recipes.
- 42 resource-processing rules.
- A factory profile points to one or more recipe IDs and may define a default recipe.
- Universal Materials & Elements Processing Plant uses resource-specific processing rules. It does not have one universal static input/output route; the selected country's resource/site mix determines applicable processing routes.
- Each profile can define construction materials, construction material units, cost, duration, capacity, infrastructure and technology.
- The catalog policy states production coefficients use an explicit simulation quantity basis and simulation-only unit normalization is not a real-world physical conversion.

### Verified example: Steel & Alloy Works

Current recipe `STEEL_PRIMARY_ROUTE_V1`:
- Inputs: `iron_concentrate: 0.6`, `coal_concentrate: 0.2`, `cement_feed: 0.1`, `copper_concentrate: 0.1`.
- Outputs: `STEEL: 0.72`, `ALLOY_STEEL: 0.08`, `BLAST_FURNACE_SLAG: 0.15`, `PROCESSING_DUST: 0.05`.
- `cycleDays: 2`.
- `quantityBasis: PER_SIMULATION_PRODUCTION_UNIT`.
- `simulationOnly: true`.

The coefficients above are per simulation production unit. They are not tonnes/day. The UI must show their exact basis unless a proven compatible capacity/quantity calculation exists.

### Product role metadata

Collapsed visibility requires knowing which outputs are primary and which are by-products. The current recipe structure does not consistently declare those roles. The implementation must:
- Prefer optional, backward-compatible role/priority metadata embedded in the existing canonical recipe or processing rule.
- Preserve existing `inputs`, `outputs`, recipe IDs, product IDs, rules, and runtime consumption/production math unchanged.
- Validate every presentation reference against the actual recipe input/output keys.
- Never create a duplicate UI-only recipe/product mapping.
- Use a reviewed canonical classification. Do not infer that the largest coefficient means primary and the smallest means waste.
- Do not classify important co-products (e.g., multiple marketable products) as by-products simply to fit a card.
- Retain unclassified products in expanded outputs and expose a catalog QA test/report for unresolved classifications.
- If no classification is safe, use a neutral label such as "Other outputs" and show all details on expansion rather than hiding or misclassifying a product.

Potential optional metadata contract (final field names to follow the catalog's existing conventions):
- primary input identities / display priorities
- primary output identities / display priorities
- by-product identities / display priorities
- optional co-product role
- optional concise display label
- optional role authority/review marker

Metadata must be presentation-only. It cannot change production math, cycle requirements, inventory accounting, batch lineage, or product IDs.

## 5. Quantity calculation policy

Before any per-day amount is displayed, verify:
1. What quantity the recipe coefficient refers to.
2. Whether factory capacity is on that same production-unit basis.
3. Whether capacity is per factory per simulation day.
4. Whether cycle duration is expressed in in-game days.
5. Whether capacity × coefficient ÷ cycle duration is the correct conversion for that route.
6. Whether the unit is compatible and is not a fabricated physical conversion.

Only then may the card display a daily planned amount. Otherwise display the raw coefficient with its declared basis.

Never silently equate:
- coefficient and quantity
- per-production-unit and per-cycle
- per-cycle and per-day
- modeled capacity and actual output
- recipe inputs and stock deliveries
- planned output and committed finished goods

Every numerical display should have a short basis label in the expanded panel. Actual values must come from actual committed runtime records.

## 6. Existing code architecture audited on main

Main commit audited: `3aaf288569d20ca65aa62f1f704910903f1495f7`.

Primary files:
- `omega_ui_v2/screens/industry.js`
- `omega_ui_v2/factory-production-command.css`
- `resource_industrial_catalog_v1.json`
- `test/omega_ui_v2.test.mjs`
- `test/omega_factory_production_baseline.test.mjs`

Existing relevant functions in `industry.js`:
- `buildViewModel()`: resolves the selected country, factory assets, canonical profile/recipe IDs, input coefficients, output profile, input batches, capacity and cycle duration.
- `factoryDailyOutput()`: resolves recorded daily production safely and distinguishes stopped/unknown states.
- `factoryProductionState()`: derives producing/reduced/stopped/unknown state.
- `factoryProductIdentityMarkup()` / `factoryProductIconVisualMarkup()` / `panelProductLabel()`: existing product identity and visual/SVG authority.
- `factoryProductionPlan()`: derives country-level planned input/output from canonical profiles, recipes, processing rules, country factory count, capacity, and country site context.
- `factoryInputPlanMarkup()`, `factoryOutputPlanMarkup()`, `factoryInputPanelMarkup()`, `factoryStockPanelMarkup()`: existing detailed information views.
- `factoryTypeBuildSupport()`, `factoryProjectModal()`: existing build validation/recipe selection and construction workflow.
- `factoryTypeCard()`: profile/type-level card, currently displaying count, modeled construction time/cost, and modeled capacity.
- `factoryCard()`: live asset-level card, currently displaying status, recorded daily output, owned count, and Build/Destroy actions.
- `render()`: controls the Factory tabs and the type-vs-live-asset view.

Important current layout detail:
- Factory type cards are the default view (`factoryView === 'types'`).
- The Details toggle changes to live factory asset cards.
- Current Build action opens a project modal appended to the root. This work must change the presentation to inline Build state while preserving the authoritative project workflow.
- Current card CSS has both wide desktop and mobile/landscape-specific layout rules. New expanded content must not be clipped by fixed-height/overflow rules.

## 7. Implementation design and proposed helpers

Implement the smallest maintainable extension to the existing Industry module.

Proposed view-model/helper responsibilities:
1. Resolve the current applicable recipe(s) for one factory type or one live asset.
2. For ordinary single-recipe factory types, use the profile's declared default/current canonical recipe.
3. For multiple-recipe profiles, show one explicit default/current route in collapsed view and list the other routes separately in expanded view. Never merge different route inputs/outputs into one fake formula.
4. For Universal Materials processing, use the selected country's eligible site/resource mix and canonical resource-specific processing rules. If there is no applicable site mix, show the documented route-unknown/not-configured state, not an invented coal/iron route.
5. Build a compact summary from already-loaded catalog and view-model data. Do not fetch the catalog per card.
6. Resolve product name/icon through existing canonical product identity components.
7. Resolve quantities through a shared helper reused by the existing Input/Output details, avoiding a second inconsistent calculation.
8. Render only the selected/expanded card's full rows. Other cards get compact summaries only.
9. Keep one expanded/build selection at a time. Switching cards or views should safely close the previous inline state.
10. Escape all text and use safe numeric formatting, consistent with surrounding module conventions.

Suggested helper boundaries (names can change to match local conventions):
- resolveFactoryPresentationRoutes(model, type/asset)
- classifyRecipeProducts(route)
- getRecipeQuantityPresentation(coefficient, quantityBasis, capacity, cycleDays, unit)
- compactProductRows(products, primaryLimit)
- renderFactoryProductPreview(...)
- renderFactoryExpandedRecipe(...)
- renderFactoryBuildRequirements(...)
- handleFactoryCardDisclosure(...)

The helpers should be pure wherever possible and must not call fetch, storage, polling, or simulation functions.

## 8. Card visual specification

Use the existing OMEGA Factory Production Command Deck style, not a replacement design language:
- dark navy command plate
- layered metallic/steel edging and bevels
- angular/clipped plate corners and subtle fastener detail
- controlled cyan/blue edge glow
- restrained state lighting (green = running/operational, amber = reduced/warning, red = stopped/failure)
- existing object-led factory SVG
- existing canonical resource/product SVG identity
- consistent typography, compact labels, and stable numerical alignment
- clear section dividers without adding vertical clutter

Bottom expansion affordance:
- small metal control plate integrated into the bottom edge of each card
- two-layer chevron/down icon in collapsed state, up icon when expanded
- subtle cyan glow and active pressed state
- no decorative icon for an inert or empty disclosure
- accessible `aria-expanded`, clear `aria-label`, keyboard/touch operation, and visible focus
- target must be comfortably tappable on Android mobile without consuming excessive card area

Product sections:
- Primary Output area is the most prominent of the three product sections.
- By-product row is secondary and compact.
- Input row is clearly identified as an input, not visually confused with output.
- Product SVG is small but legible and consistent with existing product rendering.
- Quantity sits at the right edge in a fixed/consistent numeric column; labels can wrap/truncate safely without overflowing.
- Long product names must use wrapping or accessible title/detail text rather than breaking the card width.

Expanded state:
- The card grows vertically within the factory deck.
- Do not create a second inner vertical scrolling region.
- Preserve the outer Factory deck's single scrolling behavior.
- Other cards remain compact.
- Avoid changing current image sizes or existing Factory card visual hierarchy unnecessarily.

Build state:
- Maintain the same navy/steel style.
- Construction materials use their existing resource icons.
- Build time and cost get a compact metric row.
- Infrastructure/technology requirements appear in their own compact group.
- Current availability/shortage should be readable but must not imply stock if unknown.

## 9. Performance and mobile-safety requirements

- One canonical catalog load remains the source for all cards.
- No additional per-card fetch/network request.
- No product-by-product or factory-by-factory full inventory scan during each render.
- Reuse the current selected-country snapshot and its cached inventory projection only.
- No production simulation is triggered by rendering, expanding, collapsing, or switching to Build mode.
- Expanded rows are generated only for the one selected card; do not put hidden full recipe tables in every card DOM.
- No polling, timers, workers, or background loops introduced by this UI feature.
- Do not render unlimited DOM. For a long BOM or route list, use a compact preview plus explicit expansion.
- No nested scrolling traps.
- Do not set fixed expanded card height; allow content height to grow naturally.
- Test narrow Android portrait, landscape WebView, low height, and large text/product names.
- Keep offline behavior and existing local SVG/image asset handling intact.

## 10. Interaction and state-management requirements

- State should live on the Industry UI root or its existing local state mechanism; do not persist UI expansion to game saves.
- One current expanded card key (type card or live asset) at a time.
- One current Build type key at a time.
- Expand and Build states are mutually exclusive.
- Clicking a card's bottom chevron toggles that one card.
- Clicking another card closes the previous expansion.
- Clicking Build switches the selected factory type card into Build state and clears any expanded production detail.
- Back/Close from Build restores Normal view.
- Starting a construction project must still go through the existing approved workflow and runtime preflight; merely viewing requirements cannot mutate the game.
- Build, Destroy, selection, tab navigation, factory view toggle and existing Input/Stock panel actions must remain functional.

## 11. Integration constraints — do not break existing systems

- Do not delete or rename any file, factory, recipe, resource/product ID, SVG, asset, test, archive, route, save field, UI action or runtime behavior.
- Additive and backward-compatible modifications only.
- Do not introduce a new product catalog or duplicate Recipe database.
- Do not change factory production math, actual input consumption, output commitment, stock accounting, resource batches, warehouse movements, route delivery, or finance.
- Do not alter the existing detailed Input and Stock/Output tabs except where a shared pure quantity helper is safely reused.
- Preserve existing factory count, construction time/cost, daily output, status, Build and Destroy behavior.
- Preserve the current visual and offline infrastructure.
- Do not use generic emojis in place of canonical product/factory SVG icons.
- Do not invent current inventory, shipments, actual output or stock balances.
- Keep unclassified products visible in full details.
- Do not use simulation-only values as factual real-world amounts.

## 12. Existing parallel work / conflict coordination

At audit time, PR #378, **"Audit factory product uses and close product visibility gaps"**, was open. It modifies overlapping paths:
- `omega_ui_v2/screens/industry.js`
- `omega_ui_v2/factory-production-command.css`
- `resource_industrial_catalog_v1.json`
- `test/omega_ui_v2.test.mjs`
- `test/omega_factory_production_baseline.test.mjs`
- a factory product-use audit document

PR #378 is a separate product-use/consumer-visibility task and is not this feature. Do not merge it blindly or overwrite its work. Recheck its state before the final merge, inspect exact changed files and rebase/reconcile if required. If it is still open and changes overlapping files, document the coordination risk and ensure the feature branch is based on current main. Do not remove its intended work.

## 13. Execution sequence

### Phase 0 — Git record first
- Add this implementation record on the feature branch before production-code changes.
- Confirm the first commit contains only this note.
- Link the file and commit to Linear SAB-43.

### Phase 1 — Data/role audit
- Enumerate every downstream recipe and processing rule.
- Review all input/output product IDs and identify candidate primary input, primary outputs, by-products, important co-products, and waste/loss.
- Prefer explicit canonical metadata; document unresolved cases instead of guessing.
- Validate route/product identity keys and optional metadata completeness.
- Verify all 21 profiles and all 42 processing rules are covered or explicitly unresolved.

### Phase 2 — Shared quantity/display model
- Build pure helper(s) for product-role selection and quantity presentation.
- Reuse current calculation logic where correct.
- Preserve exact quantity-basis metadata.
- Add tests before/alongside UI changes.

### Phase 3 — Collapsed Factory Type and Live Factory cards
- Add primary output preview, optional by-product, and primary input.
- Add only necessary section chevrons and bottom card expansion control.
- Preserve all current card metrics/actions.

### Phase 4 — Inline Expanded state
- Add full recipe view and actual-versus-planned/source distinctions.
- One expanded card at a time.
- Preserve Input and Stock/Output detailed panels.

### Phase 5 — Inline Build state
- Replace normal card body with construction requirements.
- Read BOM from canonical factory profile.
- Read availability only from selected-country inventory authority.
- Keep existing construction preflight and project creation flow intact.

### Phase 6 — Styling and responsiveness
- Match existing Factory Production Command Deck styling.
- Validate desktop, Android portrait, landscape, short viewport, long names, long BOMs, and expanded card scroll behavior.

### Phase 7 — Regression and runtime proof
- Add unit/presentation role tests, card-state tests, exact quantity basis tests, no-production/missing-stock tests, multi-recipe tests, resource-specific processing tests, Build requirements tests, and no-extra-fetch/no-simulation tests.
- Run targeted tests and full build if available.
- Verify the UI can be exercised through the actual Industry render path, not only an isolated mock function.

### Phase 8 — Pull request and merge
- Create a PR from the feature branch to main with SAB-43 reference.
- Review the exact diff and ensure only intended additive changes are present.
- Run CI on the exact PR head.
- Require relevant Factory/Resource/UI/offline/mobile checks. Do not state checks passed while pending.
- Fix failures and rerun as needed.
- Recheck main, PR #378, and mergeability before merge.
- Merge only if the exact final head is green and conflict-free.
- Verify the resulting merge commit and final main branch SHA.
- Update SAB-43 and this note with the verified outcome.

## 14. Required tests and acceptance checklist

### Data integrity
- [ ] 21 canonical factory profiles accounted for.
- [ ] All 22 downstream recipes accounted for.
- [ ] All 42 resource-specific processing rules accounted for.
- [ ] Every visible product ID resolves to existing canonical product/resource identity.
- [ ] No presentation metadata reference points to a missing product ID.
- [ ] No recipe inputs/outputs or IDs are changed by presentation-only metadata.
- [ ] Multi-route profiles are shown separately, never flattened into a false recipe.
- [ ] Universal Materials processing uses the selected country's actual applicable site/resource mix.

### Collapsed state
- [ ] One or two primary products only.
- [ ] At most one explicitly classified by-product.
- [ ] No by-product row when none exists.
- [ ] No by-product chevron when only one exists.
- [ ] One primary input only.
- [ ] Input chevron only when more inputs are hidden.
- [ ] Product names, correct canonical SVG identities, and correct quantity bases.
- [ ] No fabricated values for unknown roles or quantities.

### Expanded state
- [ ] Bottom chevron opens the same card in place.
- [ ] All recipe inputs/outputs/by-products/co-products/waste rows appear.
- [ ] Actual and planned fields remain distinct.
- [ ] Exactly one card expanded by default.
- [ ] Closing/opening another card resets the previous card.
- [ ] No extra network calls, inventory scans, simulation or polling.

### Build state
- [ ] Build switches the same card to construction information.
- [ ] Normal production body is replaced.
- [ ] Cost, duration, BOM, units, infrastructure and technology are shown if recorded.
- [ ] Current stock availability comes only from authoritative inventory.
- [ ] Unknown values remain Not recorded.
- [ ] Viewing Build state does not debit stock or create a project.
- [ ] Existing recipe selection/project preflight still works.
- [ ] Back returns to normal card.

### Visual/mobile
- [ ] Existing OMEGA navy/steel/Cyan visual identity retained.
- [ ] Bottom chevron is clearly an expand control and has accessible expanded state.
- [ ] No clipped rows, overlapping controls, fixed-height expansion or nested scrolling.
- [ ] Existing factory SVGs and product SVGs remain intact.
- [ ] Portrait/landscape/short-height viewports remain usable.

### Regression and delivery
- [ ] Existing Factory count/build-time/output/status/build/destroy tests pass.
- [ ] Existing Input and Stock/Output table tests pass.
- [ ] Factory/recipe baseline and resource pipeline tests pass.
- [ ] UI v2 and visual/performance tests pass.
- [ ] Offline asset/precache requirements remain satisfied if changed assets are introduced.
- [ ] Exact PR-head CI checks are green.
- [ ] PR diff contains no unrelated deletions.
- [ ] PR is merged to main and final main SHA is verified.

## 15. Explicit non-goals

- No new factory types, resource types, finished product IDs, recipes, production runtime or inventory engine.
- No automatic build, purchase, import, shipment, consumption or production based on UI display.
- No redesign of other ministries, mine cards, logistics cards, Finance, or general navigation.
- No removal of existing Input, Output, Stock, Lines or Factory tabs.
- No all-country background simulation or per-frame update.
- No claiming real-world physical quantities from simulation-only recipe coefficients.
- No premature completion status before tests, PR checks and merge are confirmed.

---

**Completion status at first-record commit:** Planning record committed first. Implementation not yet started.
