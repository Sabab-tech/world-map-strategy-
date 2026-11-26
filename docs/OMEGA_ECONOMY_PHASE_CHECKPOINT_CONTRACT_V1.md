# OMEGA Economy Phase Checkpoint Contract v1

**Milestone:** E2 foundation  
**Status:** Persisted checkpoint and mutation-journal primitives added; no phase runner is connected yet.  
**Authority:** `Omega.Simulation.world.state.simulation`

## Purpose

Provide durable, domain-scoped progress and recovery metadata before any Resource or Industrial calculation is moved out of the existing ordered turn. This contract is metadata only: it does not own inventory, warehouse, production, market, fiscal or Treasury balances, and it does not schedule a phase.

## Persistence

The checkpoint store is located at:

```js
Game.state.simulation.economyPhaseArchitectureV1
```

Schema version is 1. It is included automatically in the existing canonical Simulation save envelope because it is stored under the authoritative world-state root. Existing saves without this property remain valid; the store is created lazily when a write operation first needs it. An unknown schema version fails closed rather than being overwritten.

Each checkpoint is scoped by:
- domain (`resources`, `industrial`, or `fiscal`);
- canonical country ID;
- active session ID.

Resource and Industrial operations additionally require the country and session ID to match the active Simulation session. Food is deliberately not enabled until E5 identifies an authoritative domain.

## Checkpoint lifecycle

| Operation | Rule |
| --- | --- |
| `get(scope)` | Read-only; returns a default READY checkpoint if no record exists. |
| `begin(scope, executionId, targetTurn)` | Stores the latest pending turn and elapsed-day count before work begins. A different active execution is BUSY; the same execution requires recovery review. |
| `fail(scope, executionId, error)` | Marks FAILED and retains the active execution and pending days. It never advances lastProcessedTurn. |
| `resume(scope, executionId, reconciliation)` | Requires authoritative RECONCILED evidence before a failed/in-flight execution can resume. |
| `commit(scope, executionId, processedThroughTurn, reconciliation)` | Requires reconciliation evidence and a turn within the active execution range. Advances only through the completed prefix; remaining days stay CATCHING_UP. |
| `pending()` | Returns active, failed and catch-up checkpoints. |

A partial catch-up commit advances only the contiguous processed prefix. Example: if the checkpoint is at turn 10 and the pending horizon is turn 13, committing through turn 12 leaves turn 13 pending. A later turn extends the pending horizon; it does not add the same elapsed days twice.

## Mutation idempotency journal

The same saved store contains a durable mutation journal. Callers derive a stable key from domain, country, session, execution and operation IDs.

- First reservation returns RESERVED.
- A repeated PENDING reservation returns RECONCILIATION_REQUIRED; it is not silently replayed.
- Completion requires evidence that the authoritative ledger has POSTED the mutation.
- A repeated POSTED reservation returns DUPLICATE.
- A PENDING record can become RETRYABLE only when an authoritative reconciliation explicitly proves NOT_POSTED; the next reservation returns RETRY_ALLOWED.
- The journal is capped at 8,192 entries and fails closed at capacity. No posted key is silently evicted. Any future compaction requires ledger-backed proof and a separate migration contract.

This is a foundation for domain integrations, not a claim that every existing Treasury, warehouse, shipment or factory mutation is already protected. E3/E4/E6 must pass these keys into their existing authoritative mutation owners and add ledger-level reconciliation.

## API

Available as `Omega.EconomyPhaseCheckpoints`:

- `get`, `begin`, `resume`, `commit`, `fail`, `pending`
- `idempotencyKey`, `reserveMutation`, `completeMutation`, `reconcileMutation`

All operations return explicit status values. Unknown domains, mismatched player/session identity, missing evidence, invalid turn ranges, duplicate work and capacity exhaustion fail closed.

## Deliberate non-goals

- No A/B/C rotation or scheduler is activated.
- No existing resource or factory execution is split.
- No Food runtime is fabricated.
- No monthly fiscal close is activated.
- No existing save schema version is changed.
- No current economic ledger is moved or replaced.

## Required E2 regression coverage

- Elapsed-turn accumulation and partial catch-up.
- Failed execution cannot advance checkpoint.
- Recovery requires reconciliation evidence.
- Duplicate posted mutations are suppressed.
- Retry is allowed only after NOT_POSTED evidence.
- Checkpoint and journal survive save/load.
- Player country and active session mismatch is rejected.
- Food domain remains disabled.
