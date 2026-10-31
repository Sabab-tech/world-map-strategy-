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
- Published data mirror: https://subsets.io/datasets/unido-indstat-r4
- Mirror package: https://pypi.org/project/subsetsio/0.1.0rc1/
- Classification: https://unstats.un.org/unsd/classifications/Econ/isic

UNIDO's original INDSTAT API documents per-country data requests, but notes that plain HTTP clients can receive Cloudflare 403 responses. OMEGA therefore retrieves the same official UNIDO INDSTAT R4 establishment observations through the public Subsets.io mirror when available. The mirror lists UNIDO as the source and publishes the data under CC BY 4.0. The mirrored table has country, indicator, ISIC activity, year and value fields; coverage does not necessarily include all 197 OMEGA countries. The mirror is a transport/cache layer, not the original statistical authority.

## Definition and limitations

The source indicator counts statistical establishments in ISIC activity classes. An establishment is not guaranteed to equal one physical factory site. OMEGA factory classes are gameplay groupings, not one-to-one copies of ISIC classes. See `factory_isic_mapping_v1.json`.

The Universal Materials umbrella profile cannot be isolated without overlapping other industry categories, so it is `NOT_COMPARABLE`.

## Status rules

- `REPORTED`: every mapped activity has a numeric observation for the same country and year. Only this status populates `establishmentCount`.
- `PARTIAL`: some mapped activities are observed; the partial sum is not a complete type total. Custom ISIC combination rows are excluded from this sum unless their combination code is identical to the standard activity code.
- `NOT_REPORTED`: source country covered, but no mapped value was reported.
- `COUNTRY_NOT_COVERED`: current UNIDO metadata does not include the country.
- `MAPPING_UNAVAILABLE`: one or more mapped activities are absent from the selected dataset.
- `SOURCE_UNAVAILABLE`: the source API request failed.
- `NOT_QUERIED`: input slot exists but has not been queried.
- `NOT_COMPARABLE`: no non-overlapping source category is available.

Missing values are null, never zero. GDP, resource reserves, game allocations and industry archetypes are never used to fabricate counts.

## Refresh

GitHub Actions installs the pinned `subsetsio` client, syncs the public `medium` bundle, exports the UNIDO INDSTAT R4 establishment rows, and runs `node scripts/build_country_factory_establishment_data_v1.mjs --subsets-json <export>`. The workflow validates the matrix and refreshes source data quarterly, manually, and after relevant merges. A failed or empty source query fails closed and never overwrites verified counts.
