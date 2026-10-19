# Country UI Data Coverage Baseline

This module adds source-tracked country data inputs to the OMEGA runtime.

## Data policy
- Existing `economy.json`, `population.json`, and `economy_global_profiles_v1.json` remain authoritative for their stored fields.
- The archived CIA Factbook extract used by this runtime is a public mirror of an older 2018–2019 statistical extract. It is not current 2026 data.
- Current-country office holders, parliamentary composition, defence readiness, intelligence metrics, classified capabilities, and speculative research progress are not safely available as a complete, comparable public dataset for all 249 map identities. Those fields are modelled game parameters and must be labelled as modelled, never displayed as official observations.
- Resource profile coverage is incomplete. A missing mine/site record does not mean that a country has no resources.
- Territory identities are not automatically sovereign states.

## Sources
- [Existing OMEGA country profiles](https://github.com/Sabab-tech/world-map-strategy-/blob/main/economy_global_profiles_v1.json)
- [Existing capital / city registry](https://github.com/Sabab-tech/world-map-strategy-/blob/main/cities.json)
- [Existing resource registry](https://github.com/Sabab-tech/world-map-strategy-/blob/main/resources_2.json)
- [Archived CIA Factbook statistical extract](https://github.com/kevinkurniasatosa/CIA-Factbook-Project/blob/main/CIA%20Factbook%20output.csv)
- [World Bank Indicators API documentation](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures)
- [UNDP Human Development Index data](https://hdr.undp.org/data-center/human-development-index)
- [World Bank Worldwide Governance Indicators](https://datacatalog.worldbank.org/search/dataset/0038026/worldwide-governance-indicators)

The local profile baseline is intentionally source-aware. Where observations are absent, the runtime calculates low-confidence scenario proxies from available country context and exposes their provenance to the UI.
