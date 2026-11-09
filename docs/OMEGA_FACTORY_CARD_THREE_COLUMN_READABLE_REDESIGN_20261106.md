# OMEGA Factory Cards — Three-Column Readable Redesign

**Date:** 2026-11-06  
**Repository:** Sabab-tech/world-map-strategy-  
**Base:** main  
**Scope:** Factory Type register and live Factory card presentation only.

## Design decision

The factory register remains three cards per row. This is a layout constraint, not a reason to squeeze each recipe into three additional columns.

Each card uses one stable composition:

1. **Identity header:** factory icon, readable factory name, and the existing country-owned factory count on one aligned line.
2. **Production preview:** full-width stacked sections for Input, By-product (only when declared), and Output. Product icon and name stay on one horizontal identity line. Product names wrap at word boundaries.
3. **Actions:** Build remains visible and full-width on Factory Type cards. Existing Build/Destroy actions remain on live Factory cards.

The live card keeps its existing operational status, actual output, selected state and action behavior. The full canonical recipe and existing side panel remain unchanged.

## Layout rules

- Exactly three equal columns in the Factory Type register on portrait and landscape viewports.
- Exactly three equal columns in the live Factory card register.
- No nested three-column Input / By-product / Output layout inside a card.
- No character-by-character wrapping or hidden product labels.
- Factory and product icons keep fixed non-shrinking frames; their labels own the remaining width.
- Cards grow with their content. No fixed-height clipping or nested card scroll area.
- Touch controls retain practical minimum heights.
- The existing single-active-detail behavior and peer-card action lock are preserved.

## Compatibility / non-goals

No factory type, recipe, product/resource ID, SVG asset, starting allocation, inventory, production calculation, construction workflow, save data, or other ministry screen is changed. No existing file is deleted. The offline shell cache is incremented so deployed Android clients fetch the new card stylesheet.

## Acceptance checks

- Three columns remain active at 360×800, 720×400, 800×360 and wide landscape viewport classes.
- Header icon, title and count never overlap.
- Product icon and label remain horizontal; long names wrap by word rather than splitting every character.
- Input, By-product and Output use full card width as stacked rows.
- Factory Type and live asset actions remain present and touch-operable.
- Existing disclosure, lock, build, destroy, Input/Stock and side-panel regressions continue to pass.
