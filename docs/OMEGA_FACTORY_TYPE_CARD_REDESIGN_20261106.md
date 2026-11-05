# OMEGA Factory Type Card Redesign

**Date:** 2026-11-06  
**Repository:** `Sabab-tech/world-map-strategy-`  
**Base:** `main` at `27193256d84c5d579f1f1da23f1cff7dc540584e`  
**Scope:** Factory Type catalog card presentation only.

## Design goal

Retain the user's three-card-per-row landscape catalog. The problem is not the outer grid; it is the nested three-column Input / By-product / Output preview inside each narrow card. The new card uses a single reading column so product identities and fixed icon frames remain legible.

## Card hierarchy

1. **Factory identity:** one stable factory SVG frame beside the complete factory name. The name wraps at spaces and is never squeezed into one-character vertical lines.
2. **Factory count:** a compact count strip with tabular numerals and a clear state accent.
3. **Production preview:** vertically stacked Input, By-product and Output sections. Each section has a consistent label rail; product icon and friendly name share one horizontal identity row. Multiple primary outputs stack below the same Output label.
4. **Disclosure:** the existing chevron keeps its existing delegated click target and expands the same canonical route details.
5. **Build action:** one full-width button with its existing action icon and action attributes; text and icon are centered on the same axis.

## Responsive rules

- Landscape: exactly three factory cards per row, including narrow phone landscape.
- Phone landscape: compact but fixed icon frames, smaller typography with word-boundary wrapping, and the same vertically stacked product preview.
- Portrait viewports up to 899 CSS px wide: one full-width card per row; recipe sections remain stacked. This includes the reported 709px handset viewport.
- Expanded details, build requirements, selection locking and the existing side-panel behavior retain their current interaction model.

## Preservation boundary

This is a presentation-only change to the existing Factory Type card stylesheet and its UI regression tests, plus the offline shell cache version. It does not change factory types, canonical resource/product IDs, recipe roles, quantities, production math, inventory, logistics, saved games, or runtime actions. No existing file, data record or UI action is deleted.

## Acceptance checks

- Three cards remain in each landscape row.
- Input / By-product / Output are vertically stacked within each card, not nested as three narrow columns.
- Factory and product icons have explicit non-shrinking frames.
- Product names wrap by words and remain readable.
- Build label and icon remain horizontally aligned.
- Portrait continues to use full-width cards.
- Existing factory card, disclosure, Build, Input, Stock and gameplay tests remain in place.
