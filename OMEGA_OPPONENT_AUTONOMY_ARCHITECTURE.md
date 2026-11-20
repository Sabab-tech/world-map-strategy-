# OMEGA Opponent Autonomy Architecture v1

## Purpose

The opponent country is an autonomous government actor.

Its runtime loop is:

OBSERVE
→ RESOLVE IDENTITY
→ ROUTE EVIDENCE
→ ANALYZE DOMAIN CONSTRAINTS
→ BUILD SCENARIOS
→ GENERATE GOALS
→ SCORE CANDIDATE ACTIONS
→ RESERVE NATIONAL RESOURCES
→ DISPATCH ONE AUTHORIZED ACTION
→ MUTATE AUTHORITATIVE STATE
→ EMIT CANONICAL EVENT
→ REHYDRATE
→ RE-EVALUATE

The autonomy layer does not create country facts. Existing authoritative domain engines and datasets remain the data owners.

## 1. Canonical identity rules

- The canonical country identifier is the repository's country code used by the canonical identity registry, for example `BD`.
- Country name, ISO2, ISO3 and aliases are lookup surfaces only.
- `countryId` identifies the acting country.
- `targetCountryId` identifies a foreign counterparty.
- `resourceId`, `projectId`, `decisionId`, `reservationId`, `requestId`, `commandId` and `eventId` are different identifiers and are never substituted for each other.
- Every autonomy command and canonical event keeps the acting `countryId`.
- A foreign operation stores `targetCountryId` separately, preventing country identity loss during bilateral operations.

The opponent kernel no longer performs a generic "scan every JSON and take the first matching field" fallback. Signals are resolved through explicit state paths and explicit dataset/field contracts.

## 2. Subject-to-ministry-to-source routing

| Subject | Primary ministry | Required supporting ministries | Authoritative source boundary |
| --- | --- | --- | --- |
| Treasury / liquidity / budget | Finance | Economy, Projects | Runtime finance state |
| Debt | Finance | Economy | Runtime finance/economy state; economy.json for debt when runtime state is unavailable |
| Labor | Economy | Population, Education, Projects | Runtime population/economy labor state |
| Materials / resources | Resource | Trade, Finance, Foreign | Existing ResourceMinistryEngine / OmegaResourceSemanticBridge |
| Production | Economy | Resource, Labor, Technology, Transport | Runtime economy/industry state |
| Factory | Economy | Resource, Labor, Finance, Transport, Projects | Runtime industry/economy + project state |
| Housing | Interior | Population, Projects, Transport, Finance, Resource | Runtime cities/interior + project state |
| Infrastructure | Transport | Finance, Resource, Labor, Projects | Runtime transport/infrastructure state |
| Trade | Trade | Finance, Resource, Foreign, Transport | Runtime trade state + relations |
| Import | Trade | Finance, Resource, Foreign, Transport | Trade request state + foreign relationship evidence |
| Relations | Foreign | Trade, Intelligence | Runtime foreign/relations + relations.json |
| Treaty | Foreign | Trade, Defense, Finance | Runtime foreign negotiations/treaties + relations |
| Threat | Intelligence | Foreign, Defense, Military, Trade | Runtime intelligence + permitted peer evidence |
| Military | Military | Defense, Finance, Resource, Economy, Technology | Runtime military/defense state |
| Recruitment | Military | Economy, Finance, Defense | Force structure + labor + finance |
| Training | Military | Education, Economy, Finance | Military training state + readiness data |
| Equipment | Military | Defense, Finance, Resource | Procurement cost/material evidence + military inventory |
| Technology | Technology | Education, Economy, Resource | Runtime technology state |
| Health | Health | Population, Finance, Education | Runtime health state |
| Education | Education | Finance, Labor, Technology, Population | Runtime education state |
| Projects | Projects | Finance, Resource, Labor, Transport | Runtime project registry |
| Population | Interior | Health, Education, Economy, Housing | Runtime population/interior state |

The routing table is metadata. It is not a second source of truth.

## 3. File routing

The autonomy layer has an explicit file route registry.

- Country identity → `countries.json`
- Economic baseline → `economy.json`
- Population baseline → `population.json`
- City/static location records → `cities.json`
- Bilateral relationship evidence → `relations.json`
- Resource identity and deposits → `resource_ontology.json`, `resources_2.json`, existing ResourceMinistryEngine
- Finance, industry, infrastructure, military, intelligence and projects → authoritative `Game.state` domains when those runtime engines own the data

Missing files or missing fields do not become zero. The result remains unavailable/unknown until an authoritative source exists.

## 4. Event routing

Autonomy events are canonical interoperability events and are country-scoped.

Decision lifecycle:

`OMEGA_AUTONOMY_EVIDENCE_COLLECTED`
→ `OMEGA_AUTONOMY_PLAN_CREATED`
→ `OMEGA_AUTONOMY_DECISION_CREATED`
→ `OMEGA_AUTONOMY_RESERVATION_CREATED`
→ `OMEGA_AUTONOMY_ACTION_DISPATCHED`

Resource import:

`OMEGA_RESOURCE_IMPORT_REQUEST_SENT`

Projects:

`OMEGA_PROJECT_CONSTRUCTION_STARTED`
→ `OMEGA_PROJECT_CONSTRUCTION_PROGRESS`
→ `OMEGA_PROJECT_CONSTRUCTION_COMPLETED`

Asset effects:

`OMEGA_HOUSING_CAPACITY_CHANGED`
`OMEGA_FACTORY_CAPACITY_CHANGED`

Military:

`OMEGA_MILITARY_RECRUITMENT_APPLIED`
`OMEGA_MILITARY_TRAINING_APPLIED`
`OMEGA_MILITARY_EQUIPMENT_APPLIED`
`OMEGA_FORCE_STRUCTURE_CHANGED`

Diplomacy/intelligence:

`OMEGA_TREATY_NEGOTIATION_STARTED`
`OMEGA_THREAT_ASSESSMENT_CREATED`

The event ID is generated by the interoperability event ledger. The autonomy layer supplies causal/correlation IDs and country scope.

## 5. Decision model

Every autonomous decision is evaluated against separate factors:

1. Need / pressure
2. Treasury
3. Labor
4. Materials
5. Debt / debt-service pressure
6. Existing active projects
7. Strategic priority
8. Time
9. Risk
10. Foreign relations when a counterparty exists

The current weighted model is:

- needPressure 0.20
- treasury 0.14
- labor 0.10
- materials 0.12
- debt 0.09
- existingProjects 0.08
- strategicPriority 0.10
- time 0.07
- risk 0.06
- relations 0.04

Unavailable factors are excluded from the weighted denominator rather than replaced with invented midpoints.

A decision may therefore become `WAITING_FOR_EVIDENCE`, `BLOCKED`, or `ROUTED`.

Exactly one selected action is dispatched by the autonomy bundle for a decision. Other candidates remain visible with their status/reason.

## 6. National resource competition

The autonomy layer creates a country-scoped reservation ledger before execution.

A reservation can hold:

- money
- labor
- materials
- decision ID
- scenario ID
- executor owner
- expiry turn

A new reservation is rejected when it would exceed the unreserved national amount.

This prevents:

Housing + factory + infrastructure + R&D

from all consuming the same treasury/material/labor pool merely because each action was individually feasible.

The reservation is released after project completion or failed execution.

For project completion, materials are settled first, finance is committed second, and finance is compensated if material settlement fails.

## 7. Oil/resource import workflow

For a resource deficit, the intended autonomous path is:

Country X
→ Resource engine confirms deficit
→ identify resourceId
→ Trade locates countries with the resource
→ Trade/market data provides a country-specific price
→ Foreign checks relation/sanctions/war-state access
→ Finance checks unreserved treasury
→ Transport checks route capacity when observed
→ decision engine compares eligible suppliers
→ one supplier is selected
→ reservation is created
→ a country-specific import request is written
→ request status becomes `SENT`
→ stage becomes `COUNTERPARTY_DECISION_PENDING`

The request carries:

- acting countryId
- targetCountryId
- resourceId
- quantity
- unit price
- total value
- reservationId
- decisionId
- relation snapshot
- agreement state

Counterparty acceptance/rejection is intentionally not implemented yet.

If supplier price, supplier access, quantity, treasury, or other required evidence is missing, the system does not pick a random country. It waits for evidence.

## 8. Housing and factory causal execution

A project must have observed:

- quantity
- cost
- duration

and may carry:

- labor requirement
- material requirement
- dependencies
- target location
- linked ministries

Lifecycle:

PROPOSED
→ reservation
→ UNDER_CONSTRUCTION
→ progress per simulation turn
→ COMMISSIONING
→ settlement
→ asset mutation
→ OPERATIONAL
→ reservation release
→ canonical event
→ re-evaluation

Housing commissioning updates the country-scoped city/housing capacity and records a housing asset.

Factory commissioning updates country-scoped production capacity and records a production asset.

The system refuses to treat missing capacity as zero.

## 9. Military causal execution

The autonomous military layer now provides explicit stages:

Recruit
→ Train
→ Organize
→ Equip
→ Readiness update
→ Force-structure mutation

Recruitment updates the existing personnel field when one of the supported canonical fields exists.

Training creates a time-bound training queue. Readiness only changes when an explicit readiness delta is supplied by observed/configured data.

Organization requires an explicit unit field and personnel-per-unit value. The system does not invent unit size.

Equipment requires an explicit item, cost, and material requirements before financial/material settlement and inventory mutation.

Military facilities use the same project lifecycle as other capital projects and commission into the military facility registry.

The system therefore has the causal structure, while missing military economics/force-conversion data still correctly causes a data wait rather than fabricated strength.

## 10. Threat intelligence fusion

Threat assessment combines separately routed evidence:

- threat signals
- relationship military threat evidence
- target readiness
- target force structure
- defense threat signal
- intelligence source records
- source reliability/confidence/quality where supplied
- explicit intent fields where supplied
- explicit time-horizon fields where supplied
- explicit possible-vector fields where supplied

The output contains:

`threatLevel`
`confidence`
`sourceReliability`
`intent`
`capability`
`timeHorizon`
`possibleVectors`
`uncertainty`
`evidence[]`

No missing intelligence field is silently converted into a hostile intent or capability estimate.

## 11. Diplomacy

The current opponent-side diplomatic endpoint can start a negotiation:

Partner selection
→ relationship validation
→ negotiation request
→ FOREIGN state mutation
→ `OMEGA_TREATY_NEGOTIATION_STARTED`
→ counterparty decision pending

The counterpart's autonomous accept/reject/counteroffer engine remains a separate implementation phase.

## 12. Runtime ownership

The autonomy layer does not replace the ministry interoperability system.

It uses:

- Canonical Country Identity
- Ministry State Provider
- Ministry State Transaction
- Ministry Interoperability
- Simulation Runtime
- existing Resource Engine / Resource Semantic Bridge
- existing ministry/domain engines

The country decision system is an orchestrator. Domain systems remain the data and state owners.

## 13. What is ready before additional gameplay data

The architecture can now:

- keep acting and target country IDs separate
- route every major subject to a specific ministry/source boundary
- expose data-source diagnostics per subject
- score decisions using separate national constraints
- reserve national resources
- create and advance autonomous projects
- commission housing/factory/infrastructure/military-facility assets
- create resource import requests
- run the first side of treaty negotiation
- perform structured threat fusion
- mutate selected military runtime state through owner transactions

What still legitimately waits for future data:

- supplier-specific prices when no market offer exists
- transport capacity when no authoritative route data exists
- military unit size when absent
- military equipment cost/material requirements when absent
- fiscal debt-service parameters when absent
- complete counterparty treaty acceptance/rejection
- deeper second-order economic production/output propagation owned by the corresponding domain engines

Architecture readiness and data completeness remain separate.
