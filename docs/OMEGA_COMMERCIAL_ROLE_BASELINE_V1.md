# OMEGA Commercial Baseline — Product Role Audit V1

**Status:** Phase 1 metadata audit  
**Date:** 2026-11-23  
**Scope:** Additive descriptive metadata only; no gameplay or save mutation.

## Existing authorities verified

| Existing authority | Verified count | Use in this audit |
|---|---:|---|
| Core country context roster | 197 | Roster invariant only |
| Resource Economy resource profiles | 41 | Existing raw-resource identities and coefficient-status checks |
| Industrial processing rules | 42 | Existing processing coverage; one support input is outside the 41 profile roster |
| Factory profiles | 21 | Factory identity invariant |
| Downstream factory recipes | 22 | Recipe identity and output-join validation |
| Product-use catalog | 185 | Existing product IDs and usage classes |
| Distinct product usage classes | 77 | Role classification source |
| Downstream recipe outputs | 75 | Existing outputs; all join to an existing product-use ID after case normalization |

The registry is a **role rules file**, not a second product catalog. Product identities, use descriptions, factory profiles, recipes, processing rules, population coefficients and country roster remain in their existing source files.

## Role interpretation

- `HOUSEHOLD_DIRECT`: existing usage class directly identifies a consumer or healthcare good.
- `PROCESSED_CONSUMER_GOOD`: existing usage class identifies consumer/business or consumer/industrial goods.
- `INDUSTRIAL_INTERMEDIATE`: production inputs, materials, chemicals, feedstocks, feed, recycled feed and market commodities.
- `ENERGY_UTILITY`: fuels and energy resources.
- `CONSTRUCTION_INFRASTRUCTURE`: building, construction and infrastructure materials.
- `CAPITAL_OR_EQUIPMENT_INPUT`: capital equipment, controls, machinery, vehicles, defence, grid and aviation equipment.
- `NOT_DIRECTLY_CONSUMED`: residues, waste, loss streams, by-products, tailings, recoverables and luxury/precious commodities for which the catalog does not establish direct household consumption.
- `UNMAPPED_OR_UNSUPPORTED`: fail-closed fallback for an unknown class or unsupported output join.

Current product-use class counts by derived role:

| Role | Product records |
|---|---:|
| INDUSTRIAL_INTERMEDIATE | 78 |
| NOT_DIRECTLY_CONSUMED | 48 |
| CONSTRUCTION_INFRASTRUCTURE | 21 |
| CAPITAL_OR_EQUIPMENT_INPUT | 20 |
| ENERGY_UTILITY | 12 |
| HOUSEHOLD_DIRECT | 4 |
| PROCESSED_CONSUMER_GOOD | 2 |

All 77 current usage classes have an explicit mapping. The fallback remains mandatory for future unknown classes; it does not silently default to household demand.

## Raw-resource policy

All 41 existing raw-resource IDs receive a descriptive role using the default industrial-intermediate role plus explicit energy, construction and precious/luxury overrides. This does **not** mean every resource is consumed by households.

The registry marks population-demand eligibility as `NOT_ESTABLISHED_BY_ROLE_METADATA` for every raw resource. The presence of a calibrated per-population coefficient is not itself evidence that a commodity is directly consumed by households. Existing coefficients, demand ledgers, and the current National Demand overlap authority are untouched.

## Factory outputs

All 75 current downstream recipe output identifiers resolve to one of the 185 existing product-use catalog identities after case normalization. No alias, new product ID, recipe, factory category or quantity is introduced.

## Generated global commercial baseline

The game-wide commercial dataset is built from existing OMEGA country, factory, resource and site records. It does not require an external trade archive.

| Existing source | Used for |
|---|---|
| `country_factory_starting_baseline_v1.json` | 197 country profiles, starting factory allocations, economic sectors and industrial specializations |
| `resource_site_logistics_routes_v1.json` and its six route shards | 561 existing site/route records across 193 countries and 41 raw-resource identities |
| `resource_industrial_catalog_v1.json` | 185 existing product IDs, 21 factory categories, 42 processing rules and 22 recipes |
| `resource_economy_rules.json` | 41 raw-resource profiles and their existing units/demand inputs |

The generated dataset contains **36,445 country-product profiles** (197 countries × 185 products): 41 raw resources and 144 existing factory/processed products. No product ID, resource ID or factory category is added.

Files:

- `omega_global_commercial_baseline_v1.json` — country partner index, commodity-to-shard map and overall country partner rankings
- `omega_global_commercial_baseline_v1_part_01.json` through `part_09.json` — all 185 product profiles, split into nine loadable shards

Each country-product profile contains:
- commercial position: `IMPORTER`, `EXPORTER` or `BALANCED`
- import dependency and export potential percentages
- domestic supply and domestic demand indices
- up to three supplier countries and three buyer markets, each with relative shares

Supplier candidates need commodity supply and exportable surplus. Buyer candidates need a current demand gap. Country-wide major partners are weighted from the product-level partner network. The same country can be an exporter of one product and an importer of another.

## NPC trade integration

The existing Autonomous National Trade planner now reads the country partner network and loads commodity shards on demand. Commercial partners expand the NPC candidate pool when no explicit diplomacy row exists; product-level supplier/buyer shares influence candidate ranking.

The commercial baseline does **not** create stock, inventory, prices, demand, import orders, contracts, shipments, cash or completed transactions. Every actual trade still requires the existing Global Market supplier/stock record, National Demand evidence, executable market price, settlement/FX validation, diplomacy and sanctions checks, and bilateral proposal/settlement authorities. Existing ledgers and save formats remain unchanged.

The offline shell cache includes the index and all nine shards. The core cache namespace was advanced to `v147` so existing installations refresh these assets on update.

## Validation

- `npm run test:commercial-baseline` validates the 197/41/21/22/185/75 source identities, all 36,445 country-product profiles, partner-share totals, no self-partners, supply/demand evidence thresholds and offline asset coverage.
- `npm run test:autonomous-national-trade` verifies NPC candidate ranking with baseline partners while preserving live market and settlement gates.
- Existing Phase 6 shipment-evidence and save-provenance tests remain in the commercial-baseline workflow.

**Gameplay:** adds country/product partner preferences to NPC trade planning. **Inventory/finance/save effect:** none until existing trade authorities complete a real in-game transaction.
