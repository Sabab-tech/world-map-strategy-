# OMEGA Private Enterprise Opening Factory Baseline V1

## Scope

This additive dataset creates a country-specific opening allocation for five fictional global private companies. It is separate from the existing government factory baseline, the 21-category factory catalog, observed UNIDO establishment data, and commissioned production assets.

It covers exactly 197 core countries and the same 21 canonical factory types. It adds no new factory identity, recipe, resource identity, active asset, worker, stock, input, output, shipment or cash balance.

## Allocation rule

- If the government starting baseline is zero for a country/category, the private allocation and all five company allocations are exactly zero.
- Otherwise, private starting allocation is an additional integer count from 0% through 60% of the government starting count. It never reduces or replaces government units.
- The maximum integer is floor(government count × 0.60). A deterministic country/category target rate is rounded to integer units and bounded by this cap.
- Each private unit is assigned exactly once to one of the five stable company IDs using factory-category affinity, country industrial archetype and relevant specialization. Affinity is a preference, not a legal lock.
- All five company IDs appear in every country; company category counts sum exactly to the private category count.

## Country differentiation

The opening rate is a game-balance estimate derived from the existing baseline's comparable macro-sector context (manufacturing, industry and services value added), manufacturing band and factory specializations. Category adjustments account for specialization, manufacturing intensity, agriculture employment, services context and strategically state-heavy industries.

These inputs do not measure real private ownership. A percentage of manufacturing GDP is not a private-factory ownership statistic. This dataset is simulation-only and must not be displayed as observed private establishment counts.

Where macro context is unavailable, the generator uses a conservative specialization-only model. If neither comparable context nor specialization exists, private allocation is zero. Missing source metrics remain null.

## Stable companies

| Company ID | Company | Primary affinity |
|---|---|---|
| AURORA_INDUSTRIAL_GROUP | Aurora Industrial Group | Materials, metals, chemicals and industrial feedstock |
| MERIDIAN_ENGINEERING_GROUP | Meridian Engineering Group | Machinery, heavy engineering, vehicles and transport equipment |
| NOVA_CONSUMER_INDUSTRIES | Nova Consumer Industries | Textiles, garments, food, paper and packaging |
| ATLAS_TECHNOLOGY_CORPORATION | Atlas Technology Corporation | Electronics, semiconductors, batteries, precision and advanced manufacturing |
| TERRA_INFRASTRUCTURE_GROUP | Terra Infrastructure Group | Cement, construction materials, glass, ceramics and recycling |

The same five immutable IDs are reused in every country; no country-specific copies are created.

## Runtime and safety status

omega_private_enterprise_registry_v1.js is a read-only baseline lookup API. It cross-validates the 197 × 21 matrix against the already-loaded government baseline and exposes company/category allocations. It starts its fetch and validation only when the player opens Manage on an existing Factory card, so the ordinary Factory screen and initial Android boot do not parse the private-company dataset. Ownership details are shown inside that card's management surface; there is no separate Companies navigation tab. It does not create productionAssets, reserve or transfer inventory, dispatch shipments, consume inputs, generate finished goods, post sales or write finance journals.

This deliberate boundary preserves the SAB-42 prerequisite: the existing real-game Mine → Logistics → Inventory → Factory Input → Finished Goods → save/load path must have browser-level proof before autonomous private production is enabled. The existing Resource Industrial Network, Inventory, Trade, Global Market, Finance and Treasury remain the only future authorities.

## Generation and verification

~~~sh
node scripts/build_country_private_factory_starting_baseline_v1.mjs
node scripts/build_country_private_factory_starting_baseline_v1.mjs --check
node --test test/omega_private_enterprise_baseline_v1.test.mjs
~~~

Tests enforce exact country/company/category coverage, deterministic output, integer reconciliation, the zero-category rule, the 60% cap and non-commissioned simulation-only provenance.
