# OMEGA Offline Hybrid Atlas Preview

This branch adds an isolated offline map mode. It does not merge into main.

## What the preview does

- Adds an Offline Hybrid Atlas option to the existing map-layer drawer.
- Draws the basemap locally with Leaflet canvas tiles. It uses the application's bundled world.json country geometry and does not request remote map tiles or new remote data.
- Reuses the existing GeoJSON country selection, country labels, city/hub layer, resource-deposit layer, search and popups. The new mode does not introduce a second copy of country or resource data.
- Uses subdued earth/sea colors, fine country borders, restrained labels and low-contrast illustrative relief strokes rather than neon/glowing marker effects.
- Selects the local atlas automatically in the packaged Android offline shell. In a normal browser, the current online map remains available and the offline atlas is an explicit layer choice.

## Important accuracy boundary

The current online satellite background comes from Esri World Imagery. The repository does not contain an equivalent, licensed offline satellite imagery tile package. This preview therefore cannot truthfully reproduce every satellite pixel from the online map. It supplies a local, stylized vector/relief basemap while preserving the app's existing local country geometry and its live interactive overlays. The relief strokes are visual texture, not a measured elevation model.

A genuinely pixel-close satellite mode would require packaging a large, legally redistributable offline imagery dataset at the target zoom levels, plus its attribution and storage budget. No such dataset is fabricated or downloaded in this change.

## Scope and review

- Branch: feature/offline-hybrid-atlas-preview
- No changes are made to main by this branch.
- No existing country, city, resource, or online basemap data files are removed or rewritten.
- Focused static test: node --test test/offline_hybrid_map.test.mjs
- Android APK build and visual device/browser verification remain separate validation steps; this branch should be reviewed before any merge.