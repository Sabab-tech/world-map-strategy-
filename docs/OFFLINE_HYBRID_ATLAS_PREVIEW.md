# OMEGA Offline Hybrid Atlas Preview

This branch remains separate from main.

## Cartographic design
- Uses the canonical bundled world.json through the existing interactive Leaflet GeoJSON country layer.
- Renders actual country polygons with visible borders and muted natural fills. Landmasses are no longer represented by generated raster relief.
- Adds a low-contrast latitude/longitude graticule, with longitude spacing of 30 degrees and latitude spacing of 15 degrees, plus degree labels.
- Reuses existing country selection, city/hub points, resource deposit points, search and popups. No second country or deposit dataset is introduced.
- Offline atlas mode requests no remote basemap tile or map data. The Android offline shell selects the atlas automatically.

## Accuracy boundary
The online map uses Esri World Imagery, but the repository has no equivalent licensed offline satellite tile package. This is therefore a real-geometry offline vector atlas, not a pixel-identical satellite image. The coordinate graticule is geographic, not an elevation model.

## Validation
- Branch: feature/offline-hybrid-atlas-preview
- Draft PR: #83
- The UI regression workflow syntax-checks this JavaScript and runs the focused offline map tests.
- Review the rendered output on a device before any merge.