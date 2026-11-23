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

The registry marks population-demand eligibility as `NOT_ESTABLISHED_BY_ROLE_METADATA` for every raw resource. The presence of a calibrated per-population simulation coefficient is not itself evidence that a commodity is directly consumed by households. Existing coefficients, demand ledgers, and the current National Demand overlap authority are untouched.

## Factory outputs

All 75 current downstream recipe output identifiers resolve to one of the 185 existing product-use catalog identities after case normalization. No alias, new product ID, recipe, factory category or quantity is introduced.

## Historical trade-data boundary

A separate `omega_commercial_hs22_resource_mapping_v1.json` now records a conservative HS22 code audit for all 41 existing raw-resource identities:

| HS22 mapping status | Resource identities |
|---|---:|
| MAPPED_EXACT | 17 |
| MAPPED_PARTIAL | 11 |
| SHARED_AMBIGUOUS | 7 |
| NOT_MAPPED | 6 |

Only exact code identities are candidates for later product-specific partner analysis. Partial, shared and unmapped resources remain ineligible. Even an exact HS22 code is **not** a supplier relationship: the registry deliberately marks every partner profile as not ready until bilateral product flows and the official numeric-country-to-ISO3 crosswalk are available.

The official source is the [CEPII BACI dataset](https://www.cepii.fr/DATA_DOWNLOAD/baci/doc/baci_webpage.html), release 202601, HS22. It covers native HS22 trade years 2022–2024 and is distributed under the Etalab Open Licence 2.0. Selected product labels were cross-checked against the [HS22 product metadata endpoint](https://tradeweave.org/api/v1/product/260300/trade?revision=HS22&year=2023&limit=1); that endpoint's global exporter rows were **not** used as bilateral supplier evidence.

The raw BACI bilateral archive and its country-code crosswalk were not materialized in this execution. A product's global exporter ranking and a country's aggregate trade-partner ranking are not a bilateral product flow. They must not be joined to manufacture a supplier relationship. Therefore product-specific partner shares remain `NOT_MAPPED`; no partner shares, trade quantities, values, opening contracts, inventory or shipments are generated in this phase.

## Guarded historical partner-profile importer

The additive importer `scripts/build_omega_commercial_partner_profiles_v1.mjs` is a manual, read-only ETL tool. It requires an externally downloaded and extracted CEPII BACI `HS22 V202601` folder containing:

- `BACI_HS22_Y2022_V202601.csv`
- `BACI_HS22_Y2023_V202601.csv`
- `BACI_HS22_Y2024_V202601.csv`
- `country_codes_V202601.csv`
- `product_codes_HS22_V202601.csv`

Example invocation (the output path must not already exist):

```bash
node scripts/build_omega_commercial_partner_profiles_v1.mjs \
  --data-dir /path/to/extracted/BACI_HS22_V202601 \
  --output /path/to/new/omega_commercial_partner_profiles_v1.json
```

The importer validates the release, HS revision, year and product dictionary; preserves unknown partner-code share and its row count; treats non-core countries as external partners; gates global readiness on a complete 197-country numeric-code crosswalk; aggregates 2022–2023 value weights into normalized relative shares; keeps 2024 separate and provisional; and emits every 197-country × 41-resource profile slot. Partial, shared, ambiguous and unmapped resource IDs are explicitly `NOT_ELIGIBLE_MAPPING_STATUS`; no-positive-flow records remain unknown rather than zero.

BACI's `v` field is used only as an internal share weight. Absolute values, `q` quantities and prices are not serialized. The importer does not create a runtime agreement, import order, shipment, inventory, cash movement or NPC action. It writes only to the new file specified on the command line and refuses to overwrite an existing output file.

The official archive could not be materialized in this execution environment (DNS/network access to the CEPII host was unavailable). Therefore **no real historical partner-profile JSON has been generated or committed**. Synthetic fixture tests validate the ETL contract only; they are not a substitute for the real archive.

## Validation

Run `npm run test:commercial-baseline`. The test asserts the 197/41/21/22/185/75 roster invariants, explicit usage-class coverage, fail-closed fallback, and case-only joins from existing recipe outputs to existing product-use identities.

**Gameplay effect:** none. **Save effect:** none. **Trade/finance effect:** none.
