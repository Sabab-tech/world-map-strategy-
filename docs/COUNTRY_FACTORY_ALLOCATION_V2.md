# OMEGA Country Factory Allocation V2

## Purpose

V2 replaces the one-unit-per-category default pattern with a deterministic, country-specific, game-scaled allocation. It retains the canonical 21-category catalog and all 197 country rows. Every country still exposes all 21 category keys, including explicit zeroes.

## Preserved game scale

The previous starting budget is **1,589 abstract factory units** across 197 countries. V2 preserves every country's existing totalStartingFactoryUnits, the world total and each country's previous UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT quantity. These are strategy-game units, not physical plant counts.

## Evidence tiers

- **17 source-backed specialization profiles:** 14 have HIGH source confidence and 3 have MODERATE source confidence. Sources identify relevant industries, not physical factory totals.
- **79 existing game-modelled specialization profiles:** these are retained as MODELLED, not represented as independently source-verified.
- **96 macro-only profiles:** comparable same-year broad-sector observations inform a LOW-confidence simulation. Broad agriculture, industry, services and manufacturing shares do not prove individual subsectors or facility presence.
- **5 profiles without comparable sector or specialization evidence:** their previous simulation allocations are preserved without new claims.

A deterministic weighted largest-remainder allocator distributes each country's fixed non-umbrella budget. Each selected type receives at least one game unit; remaining units follow the documented macro and archetype weights.

## Exclusions and limitations

The country resource-context index remains in the repository but is not used for V2 quantity allocation. Its tags do not provide validated country-specific production quantities, measured reserves or industrial utilization; generic repeated tags were also observed. Geological deposits and potential are not converted into production or factory counts.

The current UNIDO INDSTAT establishment refresh is marked SOURCE_UNAVAILABLE with zero reported or partial observations. V2 does not use it as a numerical input and does not claim to be a real-world factory census.

Universal Materials is an umbrella game category, not a standalone ISIC establishment class. Its previous allocation is fixed rather than treated as an evidence-backed facility estimate.

## Validation

The builder supports the --check option. Regression tests cover the 197 × 21 matrix, fixed country and world budgets, fixed Universal Materials units, specialization preservation, confidence tiers, conservative macro-only pools, deterministic/idempotent generation and explicit handling of incomparable data.

Remaining all-one rows are reported in factoryAllocationRevision.coverage. They can occur when a country's entire starting budget is too small to create variation or when comparable input data is unavailable.
