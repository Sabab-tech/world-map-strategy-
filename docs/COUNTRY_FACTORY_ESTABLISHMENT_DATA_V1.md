# OMEGA Country Factory Establishment Data v1

## Coverage

This layer contains 4,137 explicit inputs: 197 OMEGA core countries × 21 canonical factory types. It is separate from `country_factory_starting_baseline_v1.json`, which is a simulation-only game starting allocation.

## Official source

- Provider: United Nations Industrial Development Organization (UNIDO)
- Database: INDSTAT 2026, ISIC Revision 4
- Indicator: Establishments (variable code `01`)
- Metadata API: https://stat.unido.org/portal/dataset/getDataset/INDSTAT/4
- Data API: https://stat.unido.org/portal/dataset/getData
- API instructions: https://stat.unido.org/unido-statistics-portal-api
- Classification: https://unstats.un.org/unsd/classifications/Econ/isic

UNIDO metadata supplies a dynamic dataset ID, country list, variables, activities and periods. Data calls are made per source country. Source coverage does not necessarily include all 197 OMEGA countries.

## Definition and limitations

The source indicator counts statistical establishments in ISIC activity classes. An establishment is not guaranteed to equal one physical factory site. OMEGA factory classes are gameplay groupings, not one-to-one copies of ISIC classes. See `factory_isic_mapping_v1.json`.

The Universal Materials umbrella profile cannot be isolated without overlapping other industry categories, so it is `NOT_COMPARABLE`.

## Status rules

- `REPORTED`: every mapped activity has a numeric observation for the same country and year. Only this status populates `establishmentCount`.
- `PARTIAL`: some mapped activities are observed; the partial sum is not a complete type total.
- `NOT_REPORTED`: source country covered, but no mapped value was reported.
- `COUNTRY_NOT_COVERED`: current UNIDO metadata does not include the country.
- `MAPPING_UNAVAILABLE`: one or more mapped activities are absent from the selected dataset.
- `SOURCE_UNAVAILABLE`: the source API request failed.
- `NOT_QUERIED`: input slot exists but has not been queried.
- `NOT_COMPARABLE`: no non-overlapping source category is available.

Missing values are null, never zero. GDP, resource reserves, game allocations and industry archetypes are never used to fabricate counts.

## Refresh

Run `node scripts/build_country_factory_establishment_data_v1.mjs`. The GitHub Actions workflow validates the matrix and refreshes source data quarterly, manually, and after merges affecting the importer/mapping/runtime/UI. Previously verified values are preserved when later source requests fail.
