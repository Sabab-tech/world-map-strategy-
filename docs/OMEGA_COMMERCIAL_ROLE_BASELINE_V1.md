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
| MAPPED_EXACT | 18 |
| MAPPED_PARTIAL | 10 |
| SHARED_AMBIGUOUS | 7 |
| NOT_MAPPED | 6 |

Only exact code identities are candidates for later product-specific partner analysis. Partial, shared and unmapped resources remain ineligible. Even an exact HS22 code is **not** a supplier relationship: the registry deliberately marks every partner profile as not ready until bilateral product flows and the official numeric-country-to-ISO3 crosswalk are available.

The official source is the [CEPII BACI dataset](https://www.cepii.fr/DATA_DOWNLOAD/baci/doc/baci_webpage.html), release 202601, HS22. It covers native HS22 trade years 2022–2024 and is distributed under the Etalab Open Licence 2.0. Selected product labels were cross-checked against the [HS22 product metadata endpoint](https://tradeweave.org/api/v1/product/260300/trade?revision=HS22&year=2023&limit=1); that endpoint's global exporter rows were **not** used as bilateral supplier evidence.

The raw BACI bilateral archive and its country-code crosswalk were not materialized in this execution. A product's global exporter ranking and a country's aggregate trade-partner ranking are not a bilateral product flow. They must not be joined to manufacture a supplier relationship. Therefore product-specific partner shares remain `NOT_MAPPED`; no partner shares, trade quantities, values, opening contracts, inventory or shipments are generated in this phase.

## Validation

Run `npm run test:commercial-baseline`. The test asserts the 197/41/21/22/185/75 roster invariants, explicit usage-class coverage, fail-closed fallback, and case-only joins from existing recipe outputs to existing product-use identities.

**Gameplay effect:** none. **Save effect:** none. **Trade/finance effect:** none.
