# OMEGA Hybrid Satellite Atlas

This change replaces the flat vector-only preview with a genuine imagery-first map treatment while retaining the existing OMEGA map runtime.

## Rendering behavior

- Uses the existing Esri World Imagery tile service for detailed satellite imagery when connected.
- Downloads and stores NASA Blue Marble: Next Generation as an overview raster in IndexedDB after a successful online fetch. This is a real global Earth image, not generated land shapes.
- Uses the cached NASA raster below Esri tiles, so unavailable remote tiles can fall back to a recognizable Earth surface after the image has been cached.
- Keeps the canonical `world.json` country polygons, current country selection, city markers, resource deposit overlays, and search interaction. Countries use thin borders and transparent fills over imagery.
- Retains the 30-degree longitude / 15-degree latitude graticule, but lowers its visual emphasis.
- Android starts in the hybrid mode. The explicit satellite layer option is also allowed in the Android shell.

## Honest offline limitation

The NASA raster is cached only after the app successfully downloads it once. If the app is launched for the first time with no network and no prior cache, this branch cannot show detailed satellite imagery; it falls back to the canonical vector geography. Esri satellite tiles remain network-provided and are not copied into the repository. This is an overview-image fallback, not an offline copy of high-resolution satellite tiles.

Imagery credits: Esri, Maxar, Earthstar Geographics, and the GIS User Community; NASA Blue Marble: Next Generation (NASA/GSFC, Reto Stöckli and collaborators).

## Sharpness and performance

- Raises the world map zoom ceiling to level 10 and requests matching satellite detail for closer country views.
- Uses zoom-adaptive country outlines to keep global borders light while improving definition at close zoom.
- Keeps the NASA fallback at 5400 × 2700 to limit memory pressure on lower-end Android devices. It is a world overview, not a substitute for detailed offline satellite tiles.

## Validation

The focused tests check imagery-layer wiring, cached raster use, canonical GeoJSON reuse, Android layer selection, and failure fallback behavior. A real Android APK build and device screenshot are still required before declaring the visual result verified.
