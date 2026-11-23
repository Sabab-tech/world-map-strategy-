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

This role audit is not a historical trade-partner baseline. A product's global exporter ranking and a country's aggregate trade-partner ranking are not a bilateral product flow. They must not be joined to manufacture a supplier relationship. No partner shares, trade quantities, values, opening contracts or shipments are generated in this phase.

The full CEPII BACI 202601 HS22 bilateral source and its country/product crosswalk are still required to derive product-specific partner shares. Until that source is available, the Phase 2 partner mapping remains `NOT_MAPPED`; this audit does not replace that missing evidence.

## Validation

Run `npm run test:commercial-baseline`. The test asserts the 197/41/21/22/185/75 roster invariants, explicit usage-class coverage, fail-closed fallback, and case-only joins from existing recipe outputs to existing product-use identities.

**Gameplay effect:** none. **Save effect:** none. **Trade/finance effect:** none.
