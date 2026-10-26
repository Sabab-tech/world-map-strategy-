# OMEGA Resource Command UI v2

**Base:** main at c47c7acae7e69aca9e8287923d5e03b55a3cf7b9  
**Implementation branch:** feat/resource-ministry-command-ui-20261027  
**Visual reference:** the user-provided OMEGA Mine Production Dashboard.png. Reuse the established 21-factory card geometry, layered edge treatment, restrained neon and offline icon infrastructure; do not generate replacement dashboard art.

## Visual system

- Deep navy and slate base, cool blue/cyan edge light, restrained brass dividers, and compact metallic surfaces consistent with the factory dashboard.
- Mine cards differ from factory cards: a mineral-specific focal icon, a separate mine-archetype symbol, a clipped asymmetric edge, and an earthy/cyan left rail.
- Resource art sits on a light silver plated tile, so dark commodities such as coal remain readable against the dark application shell. The original local resource SVGs remain intact.
- Status is encoded in both color and text: green means known output meets the recorded demand, amber means an identified shortfall or blocked flow, red means an operating asset has no output, cyan/neutral means available, building, or not enough demand evidence to judge.
- The page is designed to remain legible at phone width and in landscape. It uses local CSS/SVG assets only and does not add a remote chart library or remote dependency.

## Main navigation

1. **Overview** — country summary, active mines, this-turn output grouped by unit, pending projects and unresolved supply flows.
2. **Mines** — one card per eligible unique site; filter by commodity; show reserve, daily output, stock and capacity; Build, Extract and Demolish are visibly present but only enabled when their prerequisites and country permissions allow them.
3. **Stock & Logistics** — shipment states, origin/destination, quantity, route mode and arrival timing.
4. **Inventory / Warehouse** — raw and processed stock, recorded incoming/outgoing movements and shortage only where a compatible demand value exists.
5. **Reports** — production trends grouped by resource and unit, plus the national resource economy summary. Different units are never added together.

The player-facing screen deliberately omits source IDs, catalog references and internal provenance labels. Evidence, authority, and unknown-field status remain in the underlying dataset and diagnostics; this visual choice does not promote gameplay estimates into measured observations.

## Identity and deduplication

- Use the canonical siteId as the runtime and UI identity.
- Do not display records that explicitly declare runtime.aliasOfSiteId, map.aliasOfSiteId, or identity.aliasOfSiteId.
- Preserve legacy source rows and alias evidence for audit/history. Never delete historical data merely to hide duplicate cards.
- Collapse exact duplicate physical records with the same country, commodity, normalized site name and matching coordinates. Similar names or shared regional coordinates alone are not enough to delete a real site.
- Site eligibility, commissioned player asset, production this turn and warehouse stock are distinct quantities/states.

## Runtime and country boundary

- The visual registry may browse every canonical country. It only reads the selected country’s resource state for its detailed KPIs; it must not initialize/extract/process the whole world while drawing the screen.
- Mutating actions are available only for the active player country. Browsing another country remains read-only.
- Decommissioning stops the selected player mine asset, retains the asset row/history and leaves raw/processed inventory unchanged. Decommissioned site IDs are skipped by the selected-country extraction candidate filter.
- No UI action directly edits balances, fabricates a factory, or equates a route definition with a delivered shipment.
- Unknown demand yields neutral/producing status instead of an unsupported green “balanced” claim. Recorded demand that exceeds output yields amber. An existing commissioned asset with no current-turn output yields red.

## Authoritative mine-to-factory contract

Site identity → eligibility and project quote → mine commissioning → reserve/capacity check → committed extraction batch → raw warehouse → route reservation and dispatch → in-transit shipment → factory receipt → recipe/input/utility/capacity checks → dated production cycle → input debit → finished/by-product batches → inventory/economy ledger → save/load reconciliation.

Every stage must stay owned by the resource/industrial runtimes. A UI tab changes the view, not the production truth. Empty or missing records are rendered as unavailable rather than fabricated zeroes. Shipment, receipt, processing and finished goods must each be confirmed from their owning ledger.

## Validation gates

- Resource Ministry render contract: five navigation tabs; each eligible site has separate actions and a unique card; no player-facing SIMULATED/MODELED/source/catalog diagnostic copy.
- Resource icon manifest parity: preserve all 42 existing resource SVGs and 21 factory SVGs; keep the offline icon mapping.
- Resource and industry runtime tests: mine construction, extraction, route, factory input, production, warehouse and country-boundary regressions.
- Decommission lifecycle: confirmation required, state retained, output stops, history is recorded, repeated request is idempotent and warehouse stock remains unchanged.
- Offline: update the cache version whenever UI/CSS changes.
- Exact-head CI must pass before merge. UI and fixture success is not a claim that every saved game already contains commissioned mines or factories.
