# OMEGA Factory Production Ministry — Design Memory v1

**Purpose:** Persistent design reference for the next Factory Production Ministry implementation. This supersedes the Mine Production Ministry visual direction for this feature. Do not start implementation until the user confirms this layout.

## Main layout

- Landscape-first industrial command panel, with exactly three factory cards visible side-by-side at once at the target landscape viewport.
- No top-level page clutter, instructional paragraphs, “landscape mode” labels, light-behaviour explanation, decorative KPI dashboard or unrelated mine/resource content.
- Use the existing canonical factory SVG library centered prominently in each card. Do not draw duplicate factory icons.
- Premium engineering appearance: deep blue/graphite background, layered dark-metal plating, brushed silver edges, thin etched lines, corner fasteners and nested frames around the existing SVG.
- Every factory card contains, in order:
  1. Compact factory name/type strip.
  2. Large centered type-specific existing factory SVG.
  3. A separate status/output plate: actual production state and actual daily quantity with source unit.
  4. A distinct count line for how many owned factories of this same canonical type the selected country has.
  5. Bottom action row: Build and Destroy.
- Factory type count is grouped by canonical normalized type and active player-country-owned assets only. Catalog profiles and unowned projects are not counted as owned factories.
- Values must come from the selected country's existing game/runtime state. Use “Not recorded”/unavailable for unknown data rather than inventing quantities. Do not combine unlike output units into a single total.

## Conditional neon border contract

- **Green:** only for a healthy/operational factory with production actually running correctly; its green neon outline activates when selected.
- **Amber/yellow:** selected factory is degraded or partially producing due to recorded power/utility, input/material, workforce or similar production constraints.
- **Red:** factory production is stopped/blocked/failing, including zero-output operational failure; red neon border remains visible whether selected or not.
- Status selection must use existing production-health/cycle/operation/utility/input records and existing runtime classifications where available. Reuse and map the existing state; do not introduce a duplicate production-status engine.
- Separate selection state (green/amber border when selected) from hard-stop state (red persistent border).

## Existing repository assets and data sources to reuse

- Factory SVG library: `assets/omega-industrial-icons-v1/manifest.json` — 35 canonical type icons under `assets/omega-industrial-icons-v1/factories/`. Example files:
  - `factories/steel-and-alloy-works.svg`
  - `factories/refinery.svg`
  - `factories/electronics-semiconductor-fab.svg`
- Existing country-scoped factory view model: `omega_ui_v2/screens/industry.js` (`OmegaUIV2Industry.buildViewModel` / `render`). It already reads country-owned assets, normalized factory type, cycle and run records, productionHealth.status/reason/productivityPct, capacity/day, input inventory and latest outputs.
- Existing industrial runtime: `omega_resource_industrial_network_v1.js`. Investigate and reuse existing factory functions and records for production status, production metrics, utility diagnostics, operational gate, input availability and cycle execution.
- Existing production functions identified in the runtime source include `factoryOperationGate`, `factoryProductionMetrics`, `factoryProductionStatus`, `factoryUtilityDiagnostics`, `factorySetProductionHealth`, `executeFactoryCycle` and `startFactoryProductionCycle`. Check their actual accessibility/contracts before wiring; do not assume an internal function is publicly exported.
- Existing factory visual adapter/catalog: `omega_factory_visual_catalog_v1.js` and `omega_factory_visual_catalog_v1.json`; keep type alias/normalization consistent with the industrial icon manifest and canonical factory profiles.

## Action safety

- Build and Destroy controls must call existing canonical factory project/asset handlers. Verify a real Destroy/decommission API before enabling that action; do not fake deletion or mutate the visible UI only.
- All lists, counts, output metrics and controls must stay within the active player country. Do not iterate over the entire world on card render.
- Do not delete existing files or replace canonical gameplay data. Integration is additive and must preserve the current industry screen and SVG catalog.

## Test/acceptance requirements

- At least three cards fit simultaneously at the intended landscape viewport, while narrow screens degrade safely.
- Tests cover canonical SVG mapping, type grouping/owned count, daily output units, selected-country isolation, healthy/amber/blocked neon priority, and safe Build/Destroy routing.
- Run the factory/industrial runtime tests, SVG catalog tests, UI visual tests and Android build. Do not merge unless required CI passes; separately verify Android 9 landscape interaction and performance.
- Visual approval is required before implementation begins. Demo numbers in visual previews are placeholders only and must never enter runtime data.
