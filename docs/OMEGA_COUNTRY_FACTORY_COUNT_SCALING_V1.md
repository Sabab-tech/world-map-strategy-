# OMEGA Country Factory Count Scale V1

## Purpose

The V2 country allocation already selected country-specific factory categories, but its world opening baseline was too small for gameplay: 1,592 abstract units across 197 countries, with many active categories receiving only one unit. V1 count scaling raises that game scale without inventing new industries or replacing the existing specialization model.

## Data contract

- Exactly 197 core countries and the existing 21 canonical factory types remain.
- Every existing positive country/type allocation is multiplied by 10.
- Existing zero allocations remain zero. No new factory category or specialization is added.
- Every country retains its prior relative category distribution and its total is multiplied by 10.
- The world starting baseline increases from 1,592 to 15,920 abstract game units.
- All values remain simulation-only starting allocations, not observed facility counts, and do not create or overwrite commissioned production assets, inventory, batches or shipments.
- The source total is retained on each country row as unscaledTotalStartingFactoryUnits; the applied factor is recorded as factoryCountScaleFactor.

## Why this scale

The game needs enough starting industrial capacity that a country does not appear to own only one factory in every active industry. A tenfold scale gives each previously active factory category at least ten game units, while preserving each country's existing industrial profile and relative strengths. It is a gameplay scale conversion, not a claim that a country operates ten times as many physical factories.

## Validation

The scaling script is repeatable and idempotent:

~~~sh
node scripts/scale_country_factory_counts_v1.mjs
node scripts/scale_country_factory_counts_v1.mjs --check
npm run test:country-factory-starting-baseline
~~~

Regression coverage verifies the 197 × 21 matrix, exact per-country and world totals, positive minimums, specialization retention, zero-category preservation, simulation-only provenance and representative country profiles. The existing V2 allocation tests run against the reversible unscaled view so the original country-specialization model remains independently guarded.
