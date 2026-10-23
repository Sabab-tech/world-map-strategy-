# OMEGA UI v2 foundation

This directory is the isolated replacement UI namespace. It is intentionally not loaded by the production `index.html` in this foundation PR. The live UI, canonical runtimes, game-state schema, data sets and asset paths remain untouched.

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

The current implementation slice is the 15-tier Police Fleet renderer plus a read-only resource-site adapter. Other screens are specified in the design contract and must be implemented through the same adapter pattern before rollout.
