# OMEGA Country Factory Specialization Evidence v1

## Purpose and scope

This document records source-backed refinements of twenty-one country starting-industry profiles. It is a game-model mapping layer, not a census of operating factories. The canonical factory roster remains the existing 21 types; no factory type, country identity, real-world establishment count, or physical site is created by this change.

Each affected country row in `country_factory_starting_baseline_v1.json` contains a `specializationEvidence` object with source URLs, supporting claims, reference years, confidence, caveats, and the explicit simulation-only mapping policy. The `factoryCounts` values remain abstract game units and must not be described as observed factory totals.

## Country corrections

| Country | Updated game archetype | Canonical specialization mapping | Evidence and limitation |
|---|---|---|---|
| Belarus (BLR) | Machinery, electronics and chemical manufacturing | Industrial machinery, electronics/semiconductors, vehicles, steel, petrochemicals, fertilizer, food, textiles, pharmaceuticals | Belarus's 2025 Voluntary National Review documents machine-building, microelectronics, metallurgy/electric transport, fertilizers, petrochemicals, food/light industry and pharmaceuticals. World Bank country material corroborates heavy machinery, fertilizers and petrochemical export strengths. |
| Liechtenstein (LIE) | Precision machinery and dental manufacturing | Industrial machinery, pharmaceutical/medical supplies, food processing | IMF 2025 material identifies machine/tool engineering, plant construction, precision instruments and dental equipment. The Liechtenstein Embassy economy overview also identifies food-sector activity. |
| Gabon (GAB) | Manganese, agro-processing and building materials | Non-ferrous metals, industrial chemicals/gas, cement, food processing | The source documents manganese processing, palm-oil/agro-industry, cement and industrial gases. A steel project mentioned by the source is planned, not an established operating specialization, and was therefore not added. |
| Eswatini (SWZ) | Textiles, agro-processing and wood-pulp manufacturing | Textiles/garments, food processing, paper/packaging, petrochemical/polymer | EIPA and SADC material identifies food and beverages, textiles/apparel, timber/wood pulp, plastics and chemicals. These claims support broad canonical game mappings, not per-factory counts. |
| Iraq (IRQ) | Engineering, petrochemicals and consumer manufacturing | Industrial machinery, petrochemicals, fertilizer, industrial chemicals, textiles, vehicles, pharmaceuticals, food, cement | Iraq's National Investment Commission lists these industrial groups, including engineering, chemical/petrochemical, construction/cement, textiles, food, pharmaceuticals and vehicle assembly. The available factory-group inventory is dated 2015 and notes low capacity at many state-owned plants; confidence is consequently moderate and the mapping is not a claim of current operational capacity. |
| Slovenia (SVN) | Pharmaceuticals, vehicles and precision engineering | Pharmaceuticals, vehicles, grid/electrical equipment, industrial machinery, steel | Slovenia Business's 2025 export profile identifies pharmaceuticals, vehicles/parts, electrical machinery, mechanical equipment, metal products and medical/optical instruments. The Statistical Office reports manufacturing at 18.7% of GDP in 2025. |
| Haiti (HTI) | Textile and garment manufacturing under disruption | Textiles/garments only | The 2025 national accounts published by Haiti's statistical institute record textile/clothing/leather activity, while reporting an 8% contraction. The specialization therefore indicates sector presence, not growth or high capacity. |
| Jordan (JOR) | Pharmaceuticals, chemicals and export manufacturing | Fertilizers/chemicals, plastics/rubber, food, textiles, pharmaceuticals, machinery, electrical equipment | Jordan Chamber of Industry's 2024 index and Ministry of Investment's 2025 high-value manufacturing profile document these active sectors. The electronics/electrical mapping does not imply a semiconductor wafer fab. |
| San Marino (SMR) | Electronics, precision machinery and food manufacturing | Computer/electronic/optical products, machinery, food | The Chamber of Commerce's 2025 guide reports 67 computer/electronic/optical enterprises, 41 machinery enterprises and 60 food manufacturers in September 2024. Three game units aggregate the strongest clusters; they are not enterprise counts. |
| Suriname (SUR) | Petroleum refining, food processing and industrial chemicals | Petroleum/petrochemical processing, food, industrial chemicals | Staatsolie documents active refining and first commercial sulfuric-acid output in 2025; the WTO's 2019 review identifies food processing and refining. Wood processing is evidenced but is not falsely mapped to paper because the current factory catalogue has no dedicated sawmill/timber-products type. |
| Ghana (GHA) | Agro-processing, mineral processing and textiles | Food processing, non-ferrous processing, textiles/garments | Ghana's Ministry of Business Development identifies food processing and mineral processing; the Ghana High Commission lists agro-processing, textiles and light manufacturing. The non-ferrous game category is a broad mapping, not a claim that every mineral is smelted domestically. |
| Mongolia (MNG) | Copper, cement, cashmere and food processing | Non-ferrous metals, cement/concrete, textiles/garments, food processing | Invest Mongolia documents livestock-product processing and domestic cashmere preparation; USGS records copper-refinery and cement production in 2024. Proposed large smelters are not treated as operating plants. |
| Papua New Guinea (PNG) | Agro-processing, petroleum refining and precious-metal downstream processing | Food processing, petrochemical/polymer, non-ferrous processing, textiles/garments | The 2023–2027 national plan records food/beverage and fish processing, crude-petroleum and palm-oil refineries, and downstream precious-metal processing. Future LNG processing is not counted as operating capacity. |
| Botswana (BWA) | Beef processing, textiles and polymer/ferrous manufacturing | Food processing, textiles/garments, petrochemical/polymer, steel/ferrous works | UNDP's 2025 Botswana report identifies beef/food processing, textiles, plastic products, and iron/iron products. USGS confirms mining output separately; extracted minerals are not assumed to be locally smelted. |

## Mapping rules

1. Only existing canonical factory type IDs may appear in `specializations`.
2. Each listed specialization must have a positive integer `factoryCounts[typeId]` allocation. The per-country total must equal the sum of all 21 type counts.
3. Counts are abstract starting units for gameplay. They are not estimates of the number of real-world establishments, plants, production lines, or operating sites.
4. The broad World Bank value-added sector indicators provide macroeconomic context. They do not by themselves identify specific factory types; a specific specialization needs additional sector evidence.
5. Source date and confidence caveats remain attached to each country row. Older or planning-stage evidence must not be silently promoted into current operating-factory claims.
6. Countries without defensible sub-sector evidence retain a cautious broad archetype and an empty specialization list. This includes resource-led economies where extractive activity must not be confused with downstream manufacturing. A missing specialization is not proof that a country has no industry.
7. UNIDO establishment records remain a separate source layer with their own `REPORTED`, `PARTIAL`, `NOT_REPORTED`, `COUNTRY_NOT_COVERED`, `MAPPING_UNAVAILABLE`, `SOURCE_UNAVAILABLE`, `NOT_QUERIED`, and `NOT_COMPARABLE` statuses. This simulation mapping must not fill missing UNIDO values.

## Validation

The country factory baseline workflow validates:

- all 197 core country profiles and all 21 canonical factory types;
- non-negative integer game allocations and total reconciliation;
- unique specialization IDs, catalog membership, and positive allocation;
- explicit simulation-only provenance and separation from real-world facility counts;
- source-backed evidence fields and the twenty-one country-specific mappings;
- idempotent macro-sector enrichment without changing factory allocations or specialization IDs.

The UNIDO establishment dataset and the game starting-allocation dataset remain separate authorities.
