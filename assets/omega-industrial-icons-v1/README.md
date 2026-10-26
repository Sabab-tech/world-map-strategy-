# OMEGA Industrial SVG Icon Library v1

## Contents
- **42 resource icons**: one file per key in `resource_industrial_catalog_v1.json` → `resourceRules`.
- **21 canonical factory icons**: one SVG per active key in the single `factoryProfiles` catalog, including `UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT`.
- **39 retired factory SVGs retained** under `legacyFactories` in `manifest.json` for backwards compatibility; these files are archived and do not count as separate canonical factory types. All materials and elements use the universal processing factory.
- `manifest.json`: canonical IDs, names, paths, categories and palette metadata.
- `index.html`: standalone offline preview gallery for review.

## Art direction
A consistent navy command-interface backplate, dimensional isometric geometry, layered material gradients, highlights, cast shadows and material/category-matched colours. Resource icons use different material silhouettes and palettes. Gold and silver ingots have high-contrast central **GOLD** and **SILVER** stamps. Factory-type files use type-specific facility geometry and category-specific processing equipment.

## Scope
**Assets only.** This library does not change runtime code, current icon mappings, the existing factory image atlas, gameplay, inventories, or UI. It is isolated under `assets/omega-industrial-icons-v1/` for future integration after design review. All SVGs are self-contained and offline-friendly.
