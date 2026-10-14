# OMEGA Milestone A — Resource Integrity

## Scope

Milestone A is a registry/data-integrity gate, not a gameplay expansion. It must not synthesize observed facts, rename existing source IDs, or replace the original 250-site reserve/master data. The canonical catalog is authoritative for identity and map location; per-site gameplay reserve data remains a distinct scenario authority.

## Registry population and source rules

- Canonical catalog: 315 rows (the 250-site base roster plus 65 original legacy expansion records).
- Additive Part 6 runtime tranche: 50 independent records. It is appended only when its site ID is not already in the canonical catalog.
- Legacy expansion source packs: 115 rows across parts 1–6. Parts 1–5 contain the 65 records already included in the canonical catalog; Part 6 contributes 50 new IDs. Ten legacy alias records are retained as references but must not independently extract or create a marker.
- Master research and gameplay reserve datasets: 250 each. They continue to bind to the original canonical base roster by site ID, country, resource type, and site name.
- Runtime source precedence is explicit. A duplicate record from a lower-priority source cannot replace a canonical ID. Source overlap must agree on identity, resource, and coordinates.

## Shared contract

`omega_resource_site_integrity_v1.js` provides:
- `normalizeSiteRecord` and `normalizeQuantitative` for the same typed site shape across canonical and additive records.
- `auditSiteRecord` for identity, country/resource binding, coordinates, country-scoped warehouse/route/factory references, field statuses, numeric values, units, provenance, capacity ordering and alias guards.
- `auditRegistry` for duplicate IDs, duplicate normalized identities, marker-coordinate collisions, alias target resolution, and aggregate integrity reporting.
- Unit-aware annual/daily production checks. For example, MMCF/day is converted to BCF/year using 1,000 MMCF = 1 BCF before comparing production rates. The contract does not compare raw figures across different units as if they were interchangeable.

Missing values remain `null` with an explicit status. Numerical scenario values stay `SIMULATED`; only values with an observation/source pointer can be classed as `OBSERVED`. Calculated production factors are not geological source data.

## Runtime behavior

The browser/offline and server boot chains load the integrity contract before the endowment runtime. Before a canonical registry becomes ready, the endowment loader normalizes the merged rows and runs the registry audit. A hard identity/quantitative-integrity failure emits the visible diagnostic `OMEGA_RESOURCE_SITE_INTEGRITY_FAILED` and prevents a corrupted registry from silently becoming authoritative. The detailed report is exposed through `OmegaResourceSiteIntegrityReport`.

Marker coordinate collisions are not silently deduplicated: only explicitly grouped collisions are classified as intentional; otherwise the audit fails. Same-name identity matches are reported for review, while explicit aliases must have a valid target, be non-executable, and be ineligible for an independent marker.

## Verification

`test/omega_resource_milestone_a_integrity.test.mjs` covers the full 315 + 50 runtime identity set, all 115 expansion records, unique IDs, alias references, base reserve/master bindings, quantitative statuses and units, provenance, map/route country isolation, source-overlap consistency, unit-converted annual/daily calculations, and browser/server boot integration.

The dedicated Resource Verification workflow and Ministry Runtime workflow both run the Milestone A check. The overall milestone is complete only when those CI results pass; adding the validator or getting a syntax pass alone is insufficient.
