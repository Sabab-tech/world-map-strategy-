# OMEGA Factory Card — Canonical Product Role Review

**Date:** 2026-11-03  
**Parent work record:** [Progressive disclosure implementation plan](OMEGA_FACTORY_CARD_PROGRESSIVE_DISCLOSURE_IMPLEMENTATION_PLAN_20261103_BN.md)  
**Tracking:** SAB-43  
**Source of truth:** `resource_industrial_catalog_v1.json` on main commit `3aaf288569d20ca65aa62f1f704910903f1495f7`.

## Why this companion record exists

The compact Factory Card needs to distinguish primary outputs, important co-products, by-products and process waste. Current recipe records declare input/output coefficients and cycle duration, but do not consistently declare the UI role of each output. A UI must not guess that the largest coefficient is always the main product, or that every smaller output is a by-product.

This document proposes a reviewed presentation classification to be stored as optional metadata on the existing canonical recipe/processing-rule records. It does not add product IDs, recipes, factory types or production rules, and it does not change quantities, stock or gameplay.

## Canonical presentation contract

Each route may declare:

- `presentation.primaryInputs`: ordered input IDs. The first is shown in the collapsed card.
- `presentation.primaryOutputs`: ordered main product IDs. The first two may be shown in collapsed view.
- `presentation.coProducts`: marketable/strategic outputs that remain full outputs but are not automatically labelled by-products.
- `presentation.byProducts`: ordered by-product/residue outputs. The first is the collapsed By-product preview.
- `presentation.reviewStatus`: `REVIEWED_GAMEPLAY_PRESENTATION`.

Every listed input must be a key in the route's `inputs`; every listed output must be a key in `outputs`. Every output should have exactly one role. The order is display priority, not numeric output magnitude. These fields are presentation metadata only.

## Downstream production routes — reviewed role proposal

| Recipe | Primary input | Primary outputs (collapsed maximum 2) | Co-products | By-products / waste |
|---|---|---|---|---|
| STEEL_PRIMARY_ROUTE_V1 | iron_concentrate | STEEL, ALLOY_STEEL | — | BLAST_FURNACE_SLAG, PROCESSING_DUST |
| NONFERROUS_COPPER_ROUTE_V1 | copper_concentrate | REFINED_COPPER, COPPER_MATTE | — | SMELTER_SLAG, PROCESSING_DUST |
| NONFERROUS_ALUMINUM_ROUTE_V1 | alumina | ALUMINUM_INGOT | — | ALUMINA_RESIDUE, SMELTER_DROSS |
| PETROCHEMICAL_POLYMER_ROUTE_V1 | naphtha | POLYMER_RESIN, PROPYLENE_FEEDSTOCK | INDUSTRIAL_SOLVENTS | CHEMICAL_PROCESS_RESIDUE, PLASTIC_WASTE |
| FERTILIZER_ROUTE_V1 | pipeline_gas | NPK_FERTILIZER, AMMONIA | — | CHEMICAL_PROCESS_RESIDUE |
| INDUSTRIAL_CHEMICALS_ROUTE_V1 | pipeline_gas | INDUSTRIAL_CHEMICALS, INDUSTRIAL_GASES | CAUSTIC_SODA | CHEMICAL_PROCESS_RESIDUE |
| CEMENT_CONCRETE_ROUTE_V1 | cement_feed | CEMENT, READY_MIX_CONCRETE | — | KILN_DUST |
| GLASS_CERAMICS_ROUTE_V1 | glass_silica_feed | FLAT_GLASS, CONTAINER_GLASS | CERAMIC_COMPONENTS | GLASS_CULLET |
| PAPER_PACKAGING_ROUTE_V1 | recycled_feedstock | PAPER, PACKAGING_BOARD | — | PACKAGING_WASTE |
| FOOD_PROCESSING_ROUTE_V1 | grain | PROCESSED_FOOD | FEED_BYPRODUCT | ORGANIC_PROCESSING_WASTE |
| TEXTILE_GARMENT_ROUTE_V1 | cotton_fibre | TEXTILE_FABRIC, READYMADE_GARMENTS | SECONDARY_TEXTILE_FIBRE | TEXTILE_WASTE |
| INDUSTRIAL_MACHINERY_ROUTE_V1 | steel | INDUSTRIAL_MACHINERY, MACHINE_TOOL_PARTS | COMPOSITE_MATERIALS | METAL_SCRAP |
| GRID_EQUIPMENT_ROUTE_V1 | refined_copper | GRID_TRANSFORMERS, SWITCHGEAR | POWER_CABLES, GRID_EQUIPMENT | ELECTRICAL_SCRAP |
| SEMICONDUCTOR_ELECTRONICS_ROUTE_V1 | silicon_wafers | SEMICONDUCTOR_CHIPS, ELECTRONIC_COMPONENTS | CONTROL_MODULES | E_WASTE, PROCESSING_LOSS |
| BATTERY_STORAGE_ROUTE_V1 | lithium_carbonate_or_hydroxide | BATTERY_CELLS, BATTERY_PACKS | — | BATTERY_SCRAP |
| VEHICLE_ASSEMBLY_ROUTE_V1 | steel | VEHICLES | VEHICLE_SPARE_PARTS | METAL_SCRAP, ASSEMBLY_LOSS |
| SHIP_RAIL_EQUIPMENT_ROUTE_V1 | steel | SHIP_RAIL_EQUIPMENT | HEAVY_TRANSPORT_SPARES | METAL_SCRAP |
| AEROSPACE_EQUIPMENT_ROUTE_V1 | aluminum_ingot | AEROSPACE_COMPONENTS, AIRCRAFT | — | PRECISION_SCRAP, ASSEMBLY_LOSS |
| PHARMA_MEDICAL_ROUTE_V1 | industrial_solvents | PHARMACEUTICAL_GOODS, MEDICAL_SUPPLIES | — | PHARMA_PROCESS_WASTE |
| DEFENSE_EQUIPMENT_ROUTE_V1 | steel | DEFENSE_EQUIPMENT, DEFENSE_SPARE_PARTS | — | MANUFACTURING_SCRAP |
| RECYCLING_CIRCULAR_ROUTE_V1 | metal_scrap | RECOVERED_STEEL, RECOVERED_COPPER | RECYCLED_POLYMER, RECOVERED_GLASS, RECYCLED_FEEDSTOCK | DISPOSAL_RESIDUE |
| SILICON_WAFER_PRODUCTION_ROUTE_V1 | glass_silica_feed | SILICON_WAFERS | — | PROCESSING_DUST, CHEMICAL_PROCESS_RESIDUE, PROCESSING_LOSS |

The classification intentionally retains valuable co-products such as industrial solvents, caustic soda, feed by-product, secondary textile fibre, composite materials, power cables, control modules and recycled products as co-products. They remain in the expanded output list and are not hidden or called waste.

## Universal Materials & Elements Processing — 42 resource-specific rules

Every processing rule has exactly one raw-resource input. The resource ID is the primary input. The first product below is the primary processing output; the second product, where present, is a by-product/residue/tailings stream. Crude oil, natural gas and oil shale have important multi-product outputs, so their marketable outputs are co-products rather than by-products.

| Processing rule / input | Primary outputs | Co-products | By-products / waste |
|---|---|---|---|
| coal | COAL_CONCENTRATE | — | COAL_REJECT |
| iron_ore | IRON_CONCENTRATE | — | ORE_TAILINGS |
| copper | COPPER_CONCENTRATE | — | TAILINGS |
| gold | DORÉ | — | TAILINGS |
| silver | SILVER_CONCENTRATE | — | TAILINGS |
| bauxite | ALUMINA | — | BAUXITE_RESIDUE |
| nickel | NICKEL_CONCENTRATE | — | TAILINGS |
| cobalt | COBALT_HYDROXIDE | — | RESIDUE |
| lithium | LITHIUM_CARBONATE_OR_HYDROXIDE | — | RESIDUE |
| crude_oil | DIESEL, GASOLINE | JET_FUEL, NAPHTHA, HEAVY_FUEL_OIL, OTHER_REFINERY_PRODUCTS | — |
| natural_gas | PIPELINE_GAS, NGL | — | LOSS |
| uranium | YELLOWCAKE | — | MILL_TAILINGS |
| phosphate | PHOSPHATE_CONCENTRATE | — | TAILINGS |
| potash | MOP_POTASH | — | SALT_TAILINGS |
| graphite | GRAPHITE_CONCENTRATE | — | TAILINGS |
| manganese | MANGANESE_CONCENTRATE | — | TAILINGS |
| chromite | CHROMITE_CONCENTRATE | — | TAILINGS |
| zinc | ZINC_CONCENTRATE | — | TAILINGS |
| tin | TIN_CONCENTRATE | — | TAILINGS |
| tungsten | TUNGSTEN_CONCENTRATE | — | TAILINGS |
| platinum | PGM_CONCENTRATE | — | TAILINGS |
| diamond | SORTED_DIAMONDS | — | GRAVEL_TAILINGS |
| rare_earth | RARE_EARTH_CONCENTRATE | — | TAILINGS |
| rutile | UPGRADED_RUTILE | — | Tailings |
| ilmenite | TITANIUM_FEED | — | Tailings |
| limestone | CEMENT_FEED | — | QUARRY_LOSS |
| gypsum | CALCINED_GYPSUM | — | LOSS |
| marble | MARBLE_BLOCK | — | SAWING_LOSS |
| granite | GRANITE_BLOCK | — | SAWING_LOSS |
| silica_sand | GLASS_SILICA_FEED | — | LOSS |
| construction_aggregate | GRADED_AGGREGATE | — | LOSS |
| basalt | BASALT_AGGREGATE | — | LOSS |
| salt | REFINED_SALT | — | BRINE_LOSS |
| dolomite | DOLOMITE_PRODUCT | — | LOSS |
| magnesite | MAGNESIA | — | LOSS |
| oil_shale | SHALE_OIL, SHALE_GAS | — | SOLID_RESIDUE |
| boron | BORIC_ACID_OR_BORAX | — | RESIDUE |
| niobium | NIOBIUM_CONCENTRATE | — | TAILINGS |
| ruby | SORTED_RUBY_ROUGH | — | GEMSTONE_WASTE |
| diatomite | DIATOMITE_CONCENTRATE | — | PROCESSING_RESIDUE |
| coral_aggregate | CONSTRUCTION_AGGREGATE | — | PROCESSING_RESIDUE |
| aragonite | ARAGONITE_SAND | — | PROCESSING_RESIDUE |

## Important exception: resource-specific factory presentation

The Universal Materials & Elements Processing Plant has no single generic downstream recipe. Its applicable route set is determined by the selected country's eligible commercial mine/site resource identities. The UI must:
- derive routes from current selected-country `mineSites` and registered `processingRules`;
- keep separate route cards/rows for separate resource types;
- show the highest-priority available route in collapsed view;
- show the full selected-country applicable route list on expansion;
- show an honest route-not-available state when no eligible resource/site route is known;
- never use a guessed coal/iron fallback in the UI.

The existing production runtime's own simulation opt-in/fallback behavior is not modified by this presentation feature.

## UI behavior derived from this review

- Collapsed outputs: first two `primaryOutputs`.
- Collapsed By-product: first `byProducts` item, only if it exists.
- Collapsed Input: first `primaryInputs` item.
- Section chevron: only if that section has additional hidden products/routes.
- Expanded card: all inputs, primary outputs, co-products and by-products with coefficient, unit and quantity basis.
- For type profiles with multiple production routes, the card shows the default/current route first and separates alternatives.
- For no production yet, the route identity and planned coefficient remain visible; actual output remains "Not started / no committed output".

## Validation requirements

- [ ] Exactly 22 downstream recipe presentation records.
- [ ] Exactly 42 processing-rule presentation records.
- [ ] Every presentation input ID exists in the same route's `inputs`.
- [ ] Every presentation output ID exists in the same route's `outputs`.
- [ ] No duplicate output-role assignment.
- [ ] Every output is classified exactly once.
- [ ] All declared primary/by-product order values are deterministic.
- [ ] Missing/invalid metadata fails the catalog presentation test but does not crash the factory UI.
- [ ] Existing recipe coefficients, runtime and production baseline tests remain unchanged and pass.
- [ ] These roles do not change production quantities, actual stock or ledger entries.

**Status:** Reviewed design proposal for implementation on the feature branch. The production catalog is not yet changed by this record.
