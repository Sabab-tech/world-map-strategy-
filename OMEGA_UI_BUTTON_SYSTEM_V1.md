# OMEGA UI Button System v1

## Scope

This is the shared button contract for the OMEGA map, navigation, ministry dashboards, ministry task panels, cabinet, modals/drawers, resource/mining UI, Finance/FX/banking, Home Affairs/police recruitment, and dynamically rendered controls.

The contract is additive. It does not replace existing button IDs, click handlers, data transactions, or ministry runtimes. The one legacy exception to the global geometry reset is `#btn-ministry-dock`, whose circular 40–42 px dock position is deliberately managed by the ministry-entry layout runtime.

## What is annotated at runtime

Every live `<button>` found at initial boot, and every button added later by a UI/runtime, receives:

| Attribute | Purpose |
|---|---|
| `data-omega-button-key` | Unique in-session key for inventory and action-test reporting |
| `data-omega-button-managed` | Marks the button as handled by the shared visual contract |
| `data-omega-button-kind` | Semantic style: primary, secondary, danger, navigation, toggle, icon, utility, or submit |
| `data-omega-button-binding` | Evidence visible in the DOM: direct handler, declarative/delegated action, form submit, or runtime/delegated |
| `data-omega-button-note` | Short action/label note; author-provided notes are preserved |
| `data-omega-button-status` | Session status for individual action verification |

The runtime watches DOM additions, so buttons produced later by modal renderers and ministry modules are included once mounted. `audit()` reports the current DOM, not hypothetical buttons in un-opened screens. Visit the relevant screens to populate the live catalog.

## Appearance contract

- **Primary / submit:** restrained blue surface, high-contrast text, accent border.
- **Secondary:** dark slate surface, uniform typography and border.
- **Danger:** muted red surface reserved for explicitly destructive buttons/classes or destructive labels.
- **Navigation / toggle:** compact, consistent height; selected states use the shared accent.
- **Icon:** fixed 40 × 40 px except the special circular ministry dock.
- **Utility / close:** predictable touch target without turning close controls into large action bars.
- All normalized text buttons have a 40 px minimum touch height, bounded width, visible keyboard focus, and disabled states.
- Hover lift/animation is avoided on touch devices; reduced-motion preference is respected.
- Existing parent layout owns the position and gap. This layer standardizes the button surface and geometry without moving the map, panels, or containers.

## Action verification and reporting

Run these commands in the browser developer console:

```js
window.OMEGA_BUTTON_SYSTEM_V1.audit()
window.OMEGA_BUTTON_SYSTEM_V1.exportJSON()
window.OMEGA_BUTTON_SYSTEM_V1.getRecentClickAttempts()
```

The audit returns totals, visibility, semantic kinds, surface/selector, action-binding evidence, size, note, and individual verification result. Issues include missing accessible names, duplicate button IDs, and implicit submit behavior inside forms.

The browser does not expose a reliable standard API for enumerating all `addEventListener` handlers on an element. Therefore, `RUNTIME_OR_DELEGATED` means the actual action must be verified in its owning runtime or through a gameplay test; it is **not** a claim that the button is broken. Click history records attempts only, not successful gameplay execution.

Mark a button only after exercising its real action and checking the resulting UI/state:

```js
window.OMEGA_BUTTON_SYSTEM_V1.markTestResult(
  "OMEGA-BTN-000001",
  "PASS",
  "Opens the expected screen and preserves the selected country."
)
```

Allowed statuses are `PASS`, `FAIL`, `BLOCKED`, and `NOT_TESTED`. A short evidence note is required for PASS/FAIL/BLOCKED. Results and click history are in-memory for the current app session; export JSON before closing the session if the audit report needs to be retained. A PASS mark is a record of a manual verification, not an automated claim.

## Required review matrix

| UI surface | Main controls to inspect | Action ownership / expected check |
|---|---|---|
| Map and quick tools | `.icon-btn`, speed controls, metric pills, layer options, map/menu buttons | Check each toggle updates its active/pressed state and the correct map layer |
| Main navigation and ministry entry | `.nav-btn`, `.c-ministry-btn`, `.parchment-card-btn`, `#btn-ministry-dock` | Check the intended screen opens once, stays in the selected-country context, and Back returns correctly |
| Cabinet, minister recruitment and dialogs | `.cabinet-btn`, recruitment candidate/action buttons, dialog close/back controls | Check open/close, validation, selected minister, and no duplicate handler execution |
| Resource and mining | Resource filter, mine tabs, refresh, locate, build/extract/trade action buttons | Check country scope, recorded stock/reserve, route and treasury guards; UI clicks alone do not prove a resource transfer |
| Finance, FX and banking | Finance tabs, allocation/transfer, currency lookup/conversion, loan actions | Check the game-state ledger changes only for valid authorized operations; reference-rate controls remain comparison-only |
| Home Affairs / Police | Recruitment, patrol/deployment, vehicle, facility/upgrade and budget actions | Check country isolation, Finance allocation, treasury/category ceilings and duplicate action controls |
| Lifecycle / save / time | pause/resume/speed/save/close actions | Check one authoritative game-time pipeline and save behavior across app exit paths |

This matrix describes ownership and expected checks; the live `audit()` output is the per-button inventory. Dynamic controls that have not yet been rendered must be audited by visiting their screen.
