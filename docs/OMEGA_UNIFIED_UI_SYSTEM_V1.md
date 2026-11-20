# OMEGA Unified UI System v1

**Status:** Additive production visual layer  
**Scope:** Global map shell, command dock, ministry screens, dialogs, forms, tables and runtime-rendered buttons  
**Implementation:** `omega_ui_unified_visual_system_v1.css`

## Design direction

OMEGA uses one restrained geopolitical command interface: midnight navy surfaces, slate borders, readable light text, steel-blue active states and limited warm-gold emphasis. The UI is designed for Android WebView, narrow phones, landscape layouts and offline use. It does not depend on a remote font, package, image or script.

## Shared control contract

| Control | Geometry | Typography |
| --- | --- | --- |
| Main action | 44 px minimum height, 11 px radius | 13 px, semibold |
| Compact navigation | 42 px minimum height | 12 px, semibold |
| Global bottom dock | 52–54 px row controls, five equal columns | 9–10 px labels |
| Icon action | 42 × 42 px fixed hit target | centered 16–18 px icon |
| Inputs and selects | 42 px minimum height | 14 px |
| Map marker / zoom control | compact, explicit exception | 10 px |

Primary, secondary and danger actions have distinct restrained surfaces. Active, selected, disabled and keyboard-focus states are visible. Button labels keep normal sentence casing and may wrap at word boundaries instead of shrinking or breaking every character.

## System-wide layout rules

- System font stack only. Headings, body copy, labels and action text follow one scale.
- One owner retains each screen's layout and scroll behavior; this stylesheet normalizes visual presentation without moving or remounting screen content.
- Existing map controls remain compact and do not block Leaflet gestures.
- The five-route Atlas command dock uses equal-width controls and safe-area spacing.
- Ministry cards, tables, forms, dialogs and command screens use common colors, borders, radii and focus states.
- Touch devices avoid hover animation and unnecessary transitions. Reduced-motion preferences are respected.
- CSS selectors apply to buttons inserted later by existing renderers, without scanning the DOM or installing a click listener.

## Runtime preservation

This is a presentation-only layer. It does not register or replace click handlers, route commands, write game state, change country selection, alter resource/factory/finance calculations, or modify save/load contracts. Existing game engines and screen renderers remain authoritative.

The older button audit runtime remains disconnected from production because its document-wide mutation observer and click tracker are not required for visual normalization. Dynamic buttons receive the same CSS contract automatically. No existing source file is removed.
