# OMEGA UI v2 foundation

This directory contains the integrated OMEGA Atlas Command UI. The production entrypoint loads these modules additively, while canonical runtimes, map state and existing legacy recovery remain authoritative.

## Modules

- `navigation-registry.js`: approved global destinations, Executive Ministry vs All Ministries rules, and the currently visible ministry IDs.
- `omega-ui-v2.css`: mobile-first design tokens and reusable visual primitives, no remote fonts/dependencies.
- `screens/police-fleet.js`: reads the authoritative `OmegaHomeMinistryEngine.VEHICLES` and reuses `OMEGA_UI_ADAPTER.getPoliceVehicleSvg`; lists all 15 existing vehicle tiers and sends inspection/procurement to the existing detailed hangar.
- `screens/resource-ministry.js`: site-level view model for registered mine/resource sites. Site identity comes from the canonical registry, and unrecorded values remain unavailable.
- `manifest.json`: module and integration contract.

## Non-negotiable integration rules

1. Do not load this package from the main application until the integration and Android checks are green.
2. Do not copy canonical data into UI-owned catalogues. Bind adapters to existing engine/data APIs.
3. The visible UI is not an authority: costs, budgets, reserves, inventory, recruitment, vehicle order, maintenance, deployment and delivery all remain canonical runtime operations.
4. Overview is only Executive Ministry's default content; All Ministries does not contain an Overview route.
5. Never delete/replace any live legacy/gameplay file as part of UI v2 work.
6. If the ministry registry count is unresolved, do not invent an eighteenth card. See `docs/OMEGA_UI_V2_DESIGN_SPEC_V1.md`.

## Current isolated implementation modules

- `app.js`: explicit mount API, global Map/Government/Economy/Industry/Reports navigation, Back history and country context. A host can provide the live-map renderer; UI v2 does not create a parallel world map.
- `screens/government.js` and `screens/ministry-detail.js`: Executive Ministry / Country Overview, All Ministries directory and read-only country-domain details.
- `screens/economy.js`: sourced Economy/Treasury summary, separate from published macro indicators.
- `screens/resource-ministry.js` and `screens/mine-detail.js`: six Energy & Mining sections and individual `siteId` pages; reserve, modeled reserve, inventory stock, rate and capacity remain distinct.
- `screens/industry.js`: existing commissioned factories, production cycles, input inventory and projects.
- `screens/home-affairs.js` and `screens/police-fleet.js`: eight Home Affairs sections including a Finance-linked Budget & Expenditure view and the source-backed Laws & Sections register, all 15 canonical vehicle profiles, existing local vehicle SVGs and the existing police recruitment handler.
- Government’s All Ministries view includes original canonical SVG emblems, a minister recruitment/replace table, and a fixed portrait slot. Candidate lists and appointments use the existing minister roster/lifecycle APIs.
- `screens/economy.js` exposes six responsive Finance tabs (Overview, Treasury & Ledger, Budget, Debt & Fiscal, Monetary & FX, Trade & Revenue) over existing game finance and country-indicator sources.
- `screens/reports.js`: source-linked report index.
- `test/omega_ui_v2.test.mjs`: automated UI-v2 contract tests, included in `npm run test:ui-visual`.

The modules are loaded as local scripts and the existing Government entry mounts UI v2 into the existing `#cabinet-full-window` host. The integration bridge opens the new shell before legacy cabinet rendering and falls back to the legacy cabinet if mount fails. Map/Back closes the current Cabinet layer. This is an integrated rollout candidate, not a claim that all gameplay acceptance is complete: validate every visible screen/action, scroll/back behavior, source data, UI visual regression, performance, offline cache and Android 9 on the exact PR head before merging. Do not remove or overwrite any live legacy/gameplay file.


## Global Atlas Command

The global map dock provides World, Overview, Government, Economy and More. Domain pages reuse canonical game runtimes; local WebP photos use representative-image notes. The offline shell cache v29 explicitly includes UI-v2 modules and bundled photography. Android and visual acceptance remain release gates.


## Atlas Command visual rollout

The main navigation is World, Overview, Government, Economy and More. Overview reads source-backed country indicators and available game finance state. More provides image-led domain cards into the current canonical modules. The global dock routes through `OmegaUIV2Integration`; local WebP images load lazily and remain in the offline service-worker cache. Android 9, offline and responsive acceptance remain release gates.


## Religion & Society visual routes

- `More` includes Religion & Ideology with the bundled `mosque-architecture.webp` reference image. It hands off to the existing `openReligionIdeologySystem` handler and does not invent religious-demographic data.
- `More` also includes Health & Welfare and Agriculture & Food using the existing local hospital and wheat-field WebP assets. Actions route to existing ministry runtimes.
- The global map navigation dock replaces the old bottom navigation strip to avoid overlapping controls.
- Route/source-truth tests cover the religion handoff. The Android 9 offline and responsive manual checks remain acceptance gates.


## Final UI verification notes

- Religion & Ideology uses the shared `photoMarkup` renderer for its local `mosque-architecture.webp` image. The source contract test checks that no undefined `domainPhoto` helper is used by this route.
- The offline preload contract explicitly verifies `omega_ui_v2/world-command-dock.js` is included in both the production entrypoint and service-worker cache (`omega-offline-atlas-shell-v29`).
- This is an additive UI integration. Legacy engines, the original Religion & Ideology handler, map rendering, and existing Back-to-Map layer recovery remain in place.
- Visual and Android/device acceptance status should be taken from runs attached to the exact current commit, not inherited from an earlier SHA.
