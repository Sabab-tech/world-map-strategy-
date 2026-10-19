# OMEGA Country Behaviour Engine V1

## Purpose

The file **omega_country_behavior_engine_v1.js** converts existing OMEGA country records into evidence-backed, per-country simulation policies. It is an execution adapter for the existing profile pipeline, not another country database and not a replacement for the finance, resource, diplomacy or autonomy runtimes.

The Ministry dashboard exposes the same result through the **Country Overview** tab. Country IOS chapter 13 also reads this runtime profile when the optional full strategic registry is unavailable.

## Runtime path

1. **OmegaCountryRuntimeData** resolves country identity and returns baseline/source values. The bridge exposes **listProfiles()** for canonical country and territory selection.
2. **OmegaCountryBehaviorEngine.getBehaviorProfile(countryId)** resolves recorded baseline indicators, current live game state, the existing structured strategic profile when available, and the existing gameplay resource-site catalogue.
3. Each dimension has a value or **null**, an availability classification, source, confidence and evidence list. A missing input is never converted to a numeric zero.
4. **OmegaOpponentAdaptiveStrategy.profile(countryId)** preserves explicitly registered doctrine/policy dimensions first. The behaviour engine only fills still-missing dimensions.
5. **OmegaOpponentAdaptiveStrategy.scoreAction(countryId, action)** combines direction-adjusted dimensions with any evidence-backed action preference registered for that country. When both exist, the current implementation gives the dimension score 70% and the action preference 30%. If an action has no usable dimensions but does have a registered preference, the preference can still score the candidate.
6. The existing **OmegaOpponentAutonomySystem** includes the adaptive strategy score in candidate evaluation. Existing readiness checks, finance reservations, labour/material requirements, route constraints and domain executors still decide whether a candidate is executable. This engine does not directly execute actions.

## Inputs and limits

| Input | Runtime use | Limitation |
|---|---|---|
| economy_global_profiles_v1.json through the country bridge | GDP, population, growth, inflation, unemployment, debt/GDP, budget balance/GDP, trade position, reserves and registered access/governance indicators | Baseline metadata reports 230 of 249 roster records mapped to economy data and 195 mapped to population data. The source baseline has not been independently revalidated by this engine. |
| Live Game.state fields | A recognized live value takes precedence over a baseline value | Only known field names in registered state buckets are read. Missing values stay unknown. |
| resource_site_reserve_simulation_v1.json | Counts game-registered commercial gameplay site identities and distinct resource IDs | Reserve quantities are simulated. The behaviour engine never treats them as factual national reserves, production or stock. Runtime extraction, warehouses, routes and factory receipt remain authoritative for actual production effects. |
| Existing strategicProfile | Uses country-specific diplomacy parameters only when the profile explicitly marks them country-specific; reads military spending context, governance signals, dependency-model signals and ranked strategyOptions | Generic relation defaults are not promoted to country-specific diplomacy. Military expenditure is not an operational combat-strength score; WGI indicators are not regime labels; a trade deficit alone is not proof of named-supplier dependence. |

## Behaviour dimensions

Every dimension is normalized to a simulation policy value from 0 to 1 and includes an explanation and evidence sources. These are not claims about a government's private intentions.

- **riskAppetite** derives from recorded fiscal pressure when available, otherwise a limited growth-capacity proxy.
- **diplomaticPreference** uses explicitly country-specific OMEGA relation-model signals if available; economic openness is only a lower-confidence fallback. It does not infer alliances or treaties.
- **fiscalDiscipline** rises with recorded fiscal/price pressure, making efficiency and restraint actions more attractive relative to discretionary commitments.
- **mobilizationTolerance** uses military-spending share as a weak budget-effort proxy only; it is not willingness to start a war.
- **strategicTimeHorizon** derives from available institutional effectiveness, growth and fiscal-room signals.
- **tradeDependence** is available only when GDP, exports and imports are registered. It is a trade-exposure proxy, not a named-country dependency measurement.
- **selfSufficiencyPriority** derives from gameplay site diversity/count and recorded trade-deficit pressure. Site counts mean gameplay options, not proven geological abundance.
- **innovationPreference** uses recorded internet/electricity-access fields as an investment-readiness proxy, not a measured national preference.
- **domesticStabilityPriority** responds to recorded inflation, unemployment, political-stability and growth pressure.
- **escalationTolerance** is used only when an explicit country-profile doctrine value exists. It is not guessed from defence expenditure.

## Action preference adapter

The engine translates current runtime priority domains and the profile builder's ranked strategy options into selected existing action keys.

| Evidence-backed priority | Candidate action families influenced |
|---|---|
| Economy/fiscal pressure | **EFFICIENCY**, **RESERVE_RELEASE**, **SUBSTITUTION** |
| Dependency/supply security | **SUPPLIER_CHANGE**, **SUBSTITUTION**, **RESERVE_RELEASE** |
| Industry/resources | **INDUSTRY_BUILD**, **PROCESSING_EXPANSION**, **DOMESTIC_EXPANSION**, **INFRASTRUCTURE_EXPANSION** |
| Technology/readiness | **R_AND_D**, **EDUCATION_INVESTMENT**, **MODERNIZATION** |
| Defence-budget context | **MILITARY_TRAIN**, **MILITARY_EQUIP**, **SECURITY_PREPARATION**, **MILITARY_FACILITY_BUILD** |
| Domestic stability | **HOUSING_BUILD**, **PROJECT_INVESTMENT** |
| Trade and diplomacy | **EXPORT**, **IMPORT**, **SUPPLIER_CHANGE**, **TREATY_NEGOTIATION**, **DIPLOMATIC_ADJUSTMENT** |

Action preferences are candidate-ranking signals. They do not bypass treasury, labour, material, logistics, relation, action-contract or executor validation. The engine does not hardcode a separate score for each country; it computes country-specific outcomes from each country's inputs and shared rules. This avoids maintaining 199 nearly duplicated scripts while preserving per-country differentiation.

## Ministry Country Overview

The read-only view contains:

- Country selector based on canonical runtime identities.
- Recorded economic baseline and explicit **NOT OBSERVED** states.
- Gameplay-site count/diversity with simulated-reserve caveat.
- Separate diplomatic, military and institutional context.
- Ten behaviour dimensions with source, confidence and explanation.
- Action-preference signals used by adaptive scoring.
- Profile strengths, weaknesses, player advantages/challenges, profile strategy options, current priority stack and source limitations.

The view does not mutate simulation state, execute orders, or assign fabricated combat, political-regime or dependency ratings. Country Overview and Country IOS consume the same behaviour engine instead of duplicating calculations in the UI.

## Diagnostics and tests

- **OmegaCountryBehaviorEngine.diagnostics()** reports site-catalogue state and registered identity count.
- **test/omega_country_behavior_engine_v1.test.mjs** verifies identity coverage, per-country differentiation, null preservation, explicit-doctrine precedence, adaptive action scoring and Ministry UI/offline wiring.
- The Country General Data Registry workflow syntax-checks new runtimes and runs country-registry, country-runtime and country-behaviour tests.
- A PR/CI result must be green before this branch is merged. The profile catalogue generated during a pull-request test is not automatically published by that pull-request run.
