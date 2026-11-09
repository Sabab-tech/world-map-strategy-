# OMEGA Factory Product Use & Dependency Audit
**Date:** 2026-11-03  
**Scope:** Canonical factory/resource catalog, recipe dependency graph, finished-goods economy hand-off and Factory UI product identity views.

## Executive result

| Check | Verified result |
|---|---:|
| Canonical factory types | 21 |
| Downstream factory recipes | 22 |
| Resource processing rules | 42 |
| Raw-resource rules | 42 |
| Recorded external input-source contracts | 6 |
| Unique downstream factory input identities | 50 |
| Unique processing/factory output identities | 139 |
| Unique raw/input/output product identities covered by the use catalog | 185 |
| Outputs with no downstream processing/factory recipe consumer | 94 |
| Downstream factory input identities without a catalog source | **0** |

The counts are derived from `resource_industrial_catalog_v1.json`. They are catalog-identity and dependency-graph results, not evidence that every country currently has stock, an active factory, a delivered shipment or recorded consumption.

## 1. Input-side dependency check

Every one of the 50 distinct downstream factory input identities resolves to at least one of these declared source classes:

1. Another processing/factory recipe output.
2. A registered raw-resource rule.
3. An explicit external-sector/import source contract that requires a recorded batch.

There are 44 inputs that also occur as processing or factory outputs. The remaining six input identities are:

| Input | Declared source |
|---|---|
| `limestone` | Raw-resource rule |
| `grain` | Recorded external-sector/agriculture batch |
| `vegetable_oil` | Recorded external-sector/agriculture batch |
| `sugar` | Recorded external-sector/agriculture batch |
| `cotton_fibre` | Recorded external-sector/agriculture batch |
| `wool_fibre` | Recorded external-sector/agriculture batch |

The catalog has six external-source contracts in total; `silica_sand` is the sixth and is not counted among the 50 downstream factory inputs in this audit. These contracts have `requiresRecordedBatch: true` and `autoGenerateStock: false`. A source contract therefore does not fabricate stock. Actual production still needs a valid inventory/batch, delivery where applicable, recipe match, operating capacity, workforce and utility availability.

The existing recipe-coverage test also checks that every input has a producer, raw-resource rule or external-source contract, and that the downstream dependency graph has no bootstrap cycle. This audit adds explicit product-use coverage; it does not weaken those recipe integrity gates.

## 2. Output-side result

The catalog contains 139 distinct output identities. Of those, 45 also appear as an input to another processing/factory recipe. The other 94 have no downstream recipe consumer in the current catalog.

**“No downstream factory recipe consumer” does not mean “never used in the game” or “must be deleted.”** It identifies the absence of another registered recipe that accepts that product. A number of these are intended terminal goods, energy products, capital goods, market commodities or potential household/sector goods. Others are losses, residues and waste streams that need a treatment route before anyone should call them recycled.

The complete 94-product review set is below. Each identity has a corresponding `usageClass` and one or more `endUses`/handling notes in `productUseCatalog.products`.

### 2.1 Household, consumer, health and business goods
- `processed_food`
- `readymade_garments`
- `textile_fabric`
- `paper`
- `pharmaceutical_goods`
- `medical_supplies`

Their sector notes identify people/households, retail, institutional catering, apparel use, hospitals, clinics, pharmacies and public-health supply as appropriate. These are **use references**, not a new automatic household-consumption debit.

### 2.2 Capital, transport, defence, grid and energy products
- `vehicles`, `vehicle_spare_parts`, `aircraft`, `aerospace_components`, `ship_rail_equipment`, `heavy_transport_spares`
- `grid_transformers`, `switchgear`, `power_cables`, `control_modules`
- `battery_cells`, `battery_packs`
- `defense_equipment`, `defense_spare_parts`
- `diesel`, `gasoline`, `jet_fuel`, `heavy_fuel_oil`, `ngl`, `shale_oil`, `shale_gas`

The product-use descriptions point to transport fleets, aviation, rail/maritime systems, grid infrastructure, electricity storage, defence procurement, fuel/heat and industrial-energy uses. They do not claim that aircraft, vehicles, batteries or defence goods are automatically installed in those separate game inventories.

### 2.3 Construction, chemical, agricultural and industrial commodities
- `cement`, `ready_mix_concrete`, `marble_block`, `granite_block`, `basalt_aggregate`, `dolomite_product`, `aragonite_sand`, `ceramic_components`
- `ammonia`, `npk_fertilizer`, `caustic_soda`, `boric_acid_or_borax`, `propylene_feedstock`
- `nickel_concentrate`, `cobalt_hydroxide`, `yellowcake`, `manganese_concentrate`, `chromite_concentrate`, `zinc_concentrate`, `tin_concentrate`, `tungsten_concentrate`, `rare_earth_concentrate`, `upgraded_rutile`, `niobium_concentrate`, `diatomite_concentrate`, `copper_matte`
- `silver_concentrate`, `pgm_concentrate`, `sorted_diamonds`, `sorted_ruby_rough`

বিশেষজ্ঞ-নির্ভর ১৩টি terminal concentrate/intermediate-এর generic “no consumer” বাক্যের বদলে product-specific sector-use note যোগ করা হয়েছে:

| Product | সম্ভাব্য sector use; বর্তমান recipe সীমা |
|---|---|
| `nickel_concentrate` | Nickel smelting/refining feedstock; stainless steel, nickel alloys, corrosion-resistant plating ও battery-chemical chain. Current recipe সরাসরি এই concentrate নেয় না। |
| `cobalt_hydroxide` | Cobalt chemicals ও battery cathode material; selected superalloys. Direct current recipe consumer নেই। |
| `yellowcake` | Regulated nuclear-energy supply chain-এর uranium conversion/fuel fabrication feedstock. Current catalog-এ conversion/fuel-fabrication/nuclear-generation route নেই। |
| `manganese_concentrate` | Ferromanganese/silicomanganese ও steelmaking; selected battery-material chain. Direct recipe consumer নেই। |
| `chromite_concentrate` | Ferrochrome এবং stainless/specialty-steel chain-এর chromium feedstock. Direct recipe consumer নেই। |
| `zinc_concentrate` | Zinc smelting/refining; galvanizing, brass, die-casting ও zinc products. Direct recipe consumer নেই। |
| `tin_concentrate` | Tin metal; solder, electronics connections, tinplate packaging ও selected chemicals. Direct recipe consumer নেই। |
| `tungsten_concentrate` | Tungsten metal/carbide; cutting tools, drill bits, wear-resistant tooling ও high-temperature parts. Direct recipe consumer নেই। |
| `rare_earth_concentrate` | Rare-earth oxides/metals; permanent magnets, electric motors, wind turbines, electronics ও selected catalysts. Direct recipe consumer নেই। |
| `upgraded_rutile` | Titanium dioxide pigment ও titanium-metal feedstock; coatings, aerospace ও corrosion-resistant equipment. Direct recipe consumer নেই। |
| `niobium_concentrate` | Ferroniobium/niobium alloys; high-strength steel, pipelines, automotive/aerospace alloys ও superconducting equipment. Direct recipe consumer নেই। |
| `diatomite_concentrate` | Industrial filtration media, absorbents, fillers, insulation ও selected agricultural uses. Direct recipe consumer নেই। |
| `copper_matte` | Copper converting/refining intermediate for anodes/refined copper used in conductors, motors, transformers, cables and electronics. Current graph has no downstream consumer for copper_matte. |

These are described as construction, agriculture, chemical, metal, mineral or precious-material uses/commodity routes. A plausible sector use is not a substitute for a recipe input: where there is no recipe consumer, the UI says so explicitly.

### 2.4 By-products, scrap, tailings and process losses
- `alumina_residue`, `bauxite_residue`, `blast_furnace_slag`, `smelter_slag`, `smelter_dross`, `kiln_dust`
- `feed_byproduct`, `pharma_process_waste`, `battery_scrap`, `electrical_scrap`, `precision_scrap`, `manufacturing_scrap`, `packaging_waste`, `textile_waste`, `organic_processing_waste`, `gemstone_waste`
- `coal_reject`, `ore_tailings`, `mill_tailings`, `tailings`, `salt_tailings`, `gravel_tailings`
- `processing_dust`, `processing_residue`, `residue`, `solid_residue`, `disposal_residue`
- `brine_loss`, `loss`, `quarry_loss`, `sawing_loss`, `assembly_loss`

These are not automatically classified as finished consumer goods. The UI distinguishes a registered recycling input from a stream with **no registered downstream recovery/treatment recipe**. `feed_byproduct` has a livestock-feed sector-use note but no automatic livestock consumption debit. `pharma_process_waste` requires regulated pharmaceutical-waste handling. Products such as `battery_scrap` and `processing_dust` have no current factory recovery/treatment route.

### 2.5 Secondary materials and fibres
- `recovered_steel`, `recovered_copper`, `recycled_polymer`, `recovered_glass`, `secondary_textile_fibre`

These have secondary-material market/circular-economy use notes. Where a direct recipe input is absent, the UI says that no current recipe consumes the material; it does not invent a hidden recycling link.

## 3. What counts as a real in-game use
The Recycling & Waste Processing recipe explicitly accepts `metal_scrap`, `e_waste`, `glass_cullet`, `chemical_process_residue` and `plastic_waste`; these are therefore not terminal outputs in the 94-product list. Actual recovery still requires a delivered eligible batch and an active recipe cycle.


The product-use panel separates three different facts:

- **Produced / supplied by:** derived from canonical processing-rule outputs, factory-recipe outputs, raw-resource rules or declared external-source contracts.
- **Factory route:** calculated from actual recipe input keys. The UI lists only the canonical factory types whose recipes accept that exact normalized product identity. If none accept it, the row says there is no downstream recipe consumer.
- **Sector uses:** explanatory end-use references stored with the canonical product identity. They describe what people, industry, infrastructure, agriculture, health, energy or defence sectors may use the product for. They do not themselves create demand, a batch transfer, a market settlement or an inventory debit.

The actual factory stock/production ledger remains authoritative for committed quantities. The existing stock view continues to show produced quantity, factory use, domestic consumption, domestic supply, exports, destinations and remaining stock from recorded batches/ledgers. Planned recipe throughput is not reported as actual consumption.

## 4. Finished-goods delivery and market boundary

The existing production/economy integration remains in place:

`Factory recipe → input consumption → finished-goods batch → processed warehouse → Economy finished-goods ledger → eligible market offer → optional trade settlement`

The finished-goods event handler registers each production transaction idempotently with the Economy runtime and attempts market publication. Market publication is conditional: physical warehouse stock must be available, the batch allocations must reconcile to the offer quantity, and a usable price must exist. Publication is not proof that a buyer accepted the offer, that a trade settled, that people consumed the product, or that another factory used it.

No sector-use note in this catalog automatically debits stock. This prevents a descriptive note such as “food is consumed by households” from silently double-counting national demand or creating fake sales.

## 5. UI changes

The existing Factory screen layout, product SVG renderer, icon frames, factory cards, recipe plan and recorded stock tables are preserved. Four existing product-identity locations now add a compact information block under the same product name/icon:

1. Factory Input Plan.
2. Factory Output Plan.
3. Recorded Factory Output / Stock.
4. Actual Factory Input Inventory / Deliveries.

The extra block shows factory-route consumers, producer/supply origin and sector-use notes. The original icon functions are still called unchanged. The offline shell cache version is incremented so clients can load the updated catalog/UI assets after an offline restart.

## 6. Boundaries and next integration work

This change repairs the **catalog identity/use explanation and visibility gap**. It deliberately does not add a 22nd factory, change any existing recipe coefficient, create a new resource type, fabricate external stock, or automatically consume finished goods in unrelated subsystems.

The 94 terminal outputs are now explicitly reviewed and described, but they are not all connected to a live national consumer ledger. To simulate household food/clothing/medicine consumption, vehicle/aircraft procurement, grid installation, defence procurement or waste recovery as actual stock movement, each needs an authoritative subsystem contract, quantities, cadence, batch lineage, ownership/eligibility checks and reconciliation tests. These are separate gameplay integrations and must not be implied by descriptive UI text.

