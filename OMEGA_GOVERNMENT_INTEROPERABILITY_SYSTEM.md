# OMEGA Government Interoperability System

## Purpose

The Government Interoperability System is the canonical cross-ministry coordination layer for OMEGA.

The 17 ministries remain independent domain engines. Independence means:

- each ministry owns and changes only its own domain state;
- a ministry never reaches into another ministry's private state to mutate it;
- all cross-ministry communication travels through the interoperability layer;
- every ministry receives a compact, validated national situational picture.

## Canonical ministry set

The system uses the same 17 IDs as the canonical ministry runtime:

`cabinet, defense, military, finance, economy, trade, foreign, intelligence, interior, transport, resource, health, education, technology, projects, culture, statistics`

## Full topology

The communication topology is generated from the canonical ID set, not maintained as 289 hand-written routes.

- 17 x 17 logical connection cells = 289
- cross-ministry directed routes = 17 x 16 = 272
- loopback routes = 17

Every source ministry has a valid route to every target ministry.

The topology is a communication capability. It does not force every ministry to send messages on every tick.

## Runtime flow

```
OMEGA Kernel
  -> Ministry Runtime Controller
      -> 17 Independent Domain Engines
          -> Government Interoperability System
              -> Target Ministry Inbox
                  -> Target Domain Engine
                      -> Target-owned state change
                          -> Published public state
                              -> National situational picture
```

## Knowledge model

The system separates three things.

### Private domain state

Only the owning ministry can change it.

### Public ministry state

A ministry publishes facts that other ministries are allowed to observe. The published snapshot contains, when available:

- fiscal position
- spending / reserves / revenue / debt
- project counts and committed budget
- policy and decision record counts
- requests
- constraints
- alerts
- domain facts such as diplomatic relations, treaty records, logistics, threats, readiness, production, research, health and education signals

Unknown data remains unknown.

### Government situational picture

Every ministry receives the current published snapshot of all 17 ministries plus the government-wide ledger of:

- ministry financial positions
- open budget requests
- project status signals
- current constraints
- alerts

The read model is revision-cached so a full national picture is not rebuilt and deep-cloned unnecessarily on every tick.

## Message protocol

Messages use a common envelope containing:

- protocol version
- unique message ID
- source
- target
- topic
- message type
- priority
- turn
- correlation ID
- causation ID
- country ID
- payload
- timestamp
- expiry

Supported message classes include:

`STATE_UPDATE`, `POLICY_UPDATE`, `REQUEST`, `RESPONSE`, `ALERT`, `ACK`, `BUDGET_REQUEST`, `PROJECT_STATUS`, `CONSTRAINT_UPDATE`, `FISCAL_STATUS`

## Requests and decisions

Ministries can request information from any other ministry through the same full mesh.

The system tracks request/response correlation and exposes decision context to a ministry port.

For example, Trade can ask for a trade-agreement context that combines published evidence from Foreign Affairs, Transport, Finance and Intelligence. The result distinguishes:

- observed evidence
- missing evidence
- explicit blockers
- conditionally assessable situations

The system does not invent facts to make an action look possible.

## Fiscal and project coordination

A ministry can publish:

- current fiscal position
- budget need / request
- project count
- active project count
- committed project budget
- project blockers
- constraints

That information becomes visible to the other ministries through the government situational read model.

## Security and independence

The system enforces source/target validation and message ID deduplication.

A ministry communication port is bound to its source identity. It cannot claim to be another ministry.

The interoperability layer transports information. It does not authorize one ministry to mutate another ministry's private state.

## Integration points

Canonical files:

- `omega_ministry_interoperability_system.js`
- `omega_ministry_runtime_v1.js`
- `omega_ministry_domain_engines.js`
- `omega_kernel.js`
- `omega_ai_context_bridge.js`
- `minister_communication_engine.js`

The browser runtime already invokes the canonical ministry controller through the Kernel orchestration loop.

The canonical AI context bridge now carries the ministry interoperability context into the AI semantic packet, so minister-facing AI can receive the same cross-government knowledge rather than a separate, stale universe.

## Verification

The ministry runtime CI verifies:

- 17 independent engines
- 17 unique engine instances
- 289 logical connection cells
- 272 cross-ministry directed routes
- 17 loopback routes
- pairwise send/receive routing
- duplicate-safe delivery
- ministry request/response handling
- budget request visibility
- project status visibility
- national situational awareness for all 17 ministries
- Trade decision-context evidence

The interoperability system is infrastructure. It does not replace the ministry-specific domain logic that generates the underlying facts.
