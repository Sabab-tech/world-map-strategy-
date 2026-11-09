# OMEGA Government Interoperability System v2

## Status

The canonical government interoperability stack now consists of a dynamic ministry registry, a read-only country-scoped state provider, information visibility policy, generic evidence-driven decision framework, authoritative state transaction boundary, independent ministry engines, the interoperability system, and the canonical ministry runtime.

The system separates **architecture readiness** from **simulation data completeness**. Missing future simulation data is represented explicitly and is never replaced with synthetic production values.

## Authority boundaries

```
Canonical Identity / Repository Data
          ↓
Read-only State Provider
          ↓
Authoritative World/Game State
          ↓
17 Independent Ministry Engines
          ↓
Government Interoperability System
          ↓
Public Ministry State Projections
          ↓
Ministry Decision Context
          ↓
Command → State Owner Transaction → Canonical Event
          ↓
Authoritative State Change
          ↓
Republish → Peer Observation
```

The interoperability system is not a second source of truth for country, finance, project, treaty, resource, military, or minister identity.

## Ministry registry

The canonical registry contains 17 ministry IDs and is the topology authority.

Runtime topology is generated as:

`N × N`

For the current registry:

- 17 ministries
- 289 logical directed connection cells
- 272 cross-ministry directed routes
- 17 loopback routes

The runtime does not contain hard-coded per-route implementations and does not use the number 289 as a runtime constant.

## Communication

The system supports:

- unicast
- broadcast
- request
- response
- acknowledgement
- alert
- state update
- fiscal status
- budget request
- project status
- constraint update
- policy update

Every message is country-scoped and carries source/target ministry IDs, message ID, simulation turn, source-state revision, topic, type, priority, payload, correlation/causation IDs where applicable, expiry information, and provenance.

Real timestamps are telemetry only.

## Canonical delivery ledger

There is exactly one logical delivery ledger in the interoperability system.

Each message can move through:

`CREATED → DELIVERED → ACCEPTED → PROCESSING → PROCESSED`

or to explicit terminal states such as:

`REJECTED`, `DUPLICATE`, `EXPIRED`, `FAILED`

Requests maintain their own lifecycle:

`CREATED`, `DELIVERED`, `ACCEPTED`, `PROCESSING`, `RESPONDED`, `EXPIRED`, `FAILED`

The Kernel may remain an infrastructure/orchestration provider, but it is not a competing authoritative delivery ledger.

## Public ministry state

A ministry publishes a compact public projection rather than leaking private internal state.

The public contract includes, where applicable:

`ministryId`
`countryId`
`simulationTurn`
`stateRevision`
`status`
`active`
`domain`
`fiscal`
`projects`
`needs`
`requests`
`constraints`
`alerts`
`operations`
`publishedFacts`
`dataAvailability`
`provenance`

Each published fact carries availability and provenance metadata.

## Missing data

Supported availability states:

`AVAILABLE`
`UNOBSERVED`
`UNAVAILABLE`
`STALE`
`INVALID`
`NOT_APPLICABLE`
`ESTIMATED`

The system does not transform missing values into zero.

Examples:

- missing reserves ≠ reserves 0
- missing debt ≠ debt 0
- missing projects ≠ zero projects
- missing treaty ≠ no treaty
- missing readiness ≠ zero readiness

Estimated data is explicitly labeled and is not silently upgraded to verified.

## State provider

`omega_ministry_state_provider.js` is the country-scoped read boundary.

It exposes:

`get(countryId, path)`
`getSnapshot(countryId, domain)`
`getRevision(countryId, domain)`
`getAvailability(countryId, path)`
`getProvenance(countryId, path)`

The provider can consume the authoritative game state and canonical repository identity without forcing ministry engines to know the physical JSON layout of future datasets.

This makes future hydration hot-pluggable.

## Information policy

Published facts are classified as:

`PUBLIC`
`GOVERNMENT_INTERNAL`
`RESTRICTED`
`CLASSIFIED`

For example, an Intelligence source path can remain classified while a derived threat assessment is publishable to ministries that are permitted to receive it.

A ministry therefore receives a controlled institutional view, not an omniscient copy of every internal object.

## Ministry execution context

Each ministry can receive:

`ownState`
`peerStates`
`nationalState`
`governmentLedger`
`incomingMessages`
`pendingRequests`
`alerts`
`constraints`
`knownDataGaps`
`decisionContext`

The context is dynamically generated from the same generic contracts.

## Government ledger

The government read model tracks, where data exists:

- ministry fiscal positions
- budget requests
- project signals
- constraints
- alerts
- stale snapshots
- pending inter-ministry requests

A budget request remains a request.

It is not automatically promoted to a requirement, funding gap, or approved allocation.

Future fiscal fields are already part of the contract, including allocation, commitment, spending, encumbrance, capital/operating expenditure, emergency allocation, mandatory obligations, and required funding. They can remain unavailable until an authoritative fiscal subsystem is implemented.

## Project contract

The public project model can carry:

`projectId`
`ownerMinistry`
`countryId`
`projectType`
`status`
`phase`
`cost`
`allocatedFunding`
`committedFunding`
`spentFunding`
`remainingFunding`
`completion`
`startDate`
`targetDate`
`dependencies`
`blockers`
`requiredApprovals`
`linkedMinistries`

Missing project fields stay unavailable.

## Generic decision framework

`omega_ministry_decision_framework.js` provides a generic action definition and evidence evaluator.

An action can define:

- required information
- optional information
- blocking conditions
- warning conditions
- approval requirements
- state owner
- affected ministries
- affected state domains
- expected outputs
- downstream effects

The evaluator returns evidence-linked states such as:

`OBSERVED`
`CONDITIONALLY_ASSESSABLE`
`BLOCKED`
`UNKNOWN`

It is not a Trade-only special case.

## Trade agreement example

A trade action can require independent facts from:

- Foreign Affairs: relations
- Foreign Affairs: treaties
- Foreign Affairs: negotiations
- Foreign Affairs: sanctions
- Economy: production
- Finance: reserves / fiscal information
- Transport: logistics
- Intelligence: permitted threat assessment
- Trade: own trade balance

Relationship state is never substituted for treaty state.

Missing treaty information therefore produces an unknown/missing requirement rather than a fabricated conclusion.

## Commands, state transactions and events

A ministry decision can emit a command.

The command is processed by its registered authoritative state owner.

The state owner receives a deterministic state transaction and can only change owned paths.

The transaction then produces the authoritative state mutation.

Canonical events are emitted from that state-changing path, such as:

`TREATY_SIGNED`
`BUDGET_REQUESTED`
`PROJECT_STARTED`
`PROJECT_BLOCKED`
`PROJECT_COMPLETED`
`FISCAL_CONDITION_CHANGED`
`TRANSPORT_CAPACITY_CHANGED`
`THREAT_ASSESSMENT_CHANGED`
`RESOURCE_STATE_CHANGED`

The changed authority is republished on the next state publication cycle, allowing other ministries to observe the resulting state.

## Save/load

Runtime state persistence includes:

- ministry runtime state
- engine coordination state
- public snapshots
- inboxes
- delivery ledger
- request ledger
- events
- commands
- deterministic sequence counters
- metrics

The goal is logically equivalent restoration rather than UI-only persistence.

## Determinism and offline operation

Simulation turns, revisions, commands and events are the simulation inputs.

Wall-clock timestamps are telemetry only and are not used to decide simulation outcomes.

The interoperability system does not require an external LLM or internet connection.

Online AI can enrich minister reasoning, but the government information system is local-state driven.

## Performance

The system uses:

- compact public snapshots
- revisioned read-model caching
- bounded inboxes
- bounded history
- event-driven traffic
- deterministic invalidation

Full mesh connectivity therefore does not mean 17 × 17 messages every frame.

## Diagnostics

Diagnostics separate:

`STRUCTURE PASS`

from:

`BEHAVIOR PASS`

and separately report data coverage:

`AVAILABLE`
`UNAVAILABLE`
`STALE`
`INVALID`
`UNOBSERVED`
`ESTIMATED`

The system does not report “full simulation ready” merely because the architecture exists.

## Verification

The canonical Ministry Runtime workflow verifies:

- 17 independent engines
- 17 unique engine instances
- dynamic NxN topology
- route delivery
- target processing
- duplicate protection
- invalid source/target rejection
- expiry handling
- ACKs
- request/response lifecycle
- budget visibility
- project visibility
- missing-data semantics
- stale-state detection
- country isolation
- ministry independence
- generic trade evidence
- treaty/relationship separation
- hot-plug data
- save/load
- deterministic decision results
- actual repository country data path
- authoritative command → state transaction → event → republish flow
- production server boot and canonical script injection

The architecture is intended to accept future fiscal, economic, diplomatic, military, social, transport, education, health, technology, resource and project datasets without rewriting the ministry topology or multiplying engine classes by country.
