# world-map-strategy

OMEGA geopolitical simulation runtime.

## Data-driven AI identity/query architecture

The AI query path resolves entities from repository datasets at runtime. Country identity is obtained from the canonical country registry backed by `countries.json`; resource identity is obtained from the canonical resource bridge. Semantic capabilities and field mappings come from the semantic knowledge JSON rather than country/resource dictionaries embedded in JavaScript.

A question such as `What is <country>` is processed as an entity-discovery request. The runtime extracts candidate spans, matches them against the loaded country records, returns the canonical dataset ID, and carries provenance through the query plan/evidence layer.

Core data files remain authoritative and are not replaced by generated registries.
