# OMEGA Canonical Simulation Pipeline

## One authority for time

The clock owned by `Omega.Simulation` is the sole authority for in-game time. At 1x speed, one completed turn advances one calendar day after 10 seconds of wall-clock time. 2x and 5x are multipliers applied to the same clock; they do not create separate sector clocks.

Every completed turn uses the same `turn`, `stepDurationMs`, `simulationDate`, player country, and authoritative `Game.state`. Domain runtimes must derive elapsed game time from `context.stepDurationMs` or `Omega.Simulation.clock.stepDurationMs`. Do not interpret a turn as an hour or month, and do not run an independent game-time `setInterval`.

## Registering a sector or ministry

New game systems should register directly with the ordered turn runner:

```js
const unregister = Omega.Simulation.registerSubsystem(
  'my-sector.production',
  async (event, context) => {
    const { turn, day, stepDurationMs, simulationDate, countryId, state } = context;
    // Process this turn against the authoritative state.
    // Await I/O or asynchronous calculations before returning.
    // Throw if the sector cannot safely complete this turn.
    return { turn, day, status: 'COMPLETED' };
  },
  { priority: 0 }
);
```

Participant IDs are stable and unique. Registration of the same ID replaces its previous handler instead of creating duplicate ticks. Lower priorities run first; equal priorities preserve registration order. The lifecycle autosave finalizer runs last. A system registered while a turn is running starts on the next turn, so a country or sector cannot join half way through a day.

For backward compatibility, window-level `addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', ...)` listeners and `Omega.Simulation.events.subscribe('OMEGA_SIMULATION_TURN_COMMITTED', ...)` subscribers are automatically adapted into awaited participants. Wildcard event-ledger subscribers still receive other event types normally, but their turn-commit callback runs once inside the ordered pipeline. The normal browser event is still published after the ordered pipeline for diagnostics and external observers; adapted listeners are suppressed during that final notification to prevent double execution. Return any promise from a legacy listener. Fire-and-forget async work is not part of a completed turn.

## Failure policy

If any participant rejects or throws, the runtime records the failed participant and error, pauses the authoritative clock, and puts the session into `ERROR`. The game must not continue into later days with one sector missing a turn. Inspect `Omega.Simulation.diagnostics().lastTurnParticipantResults` and `lastError` before resuming after a fix.

Participants should be deterministic and idempotent by turn. Persist the turn they last processed, use the supplied context rather than wall-clock time, and throw when a turn cannot safely be completed. Avoid swallowing exceptions around turn work.

## Save contract

The lifecycle autosave runs in the dedicated finalizer phase after all sector participants, the publish hook, and the checkpoint phase have finished. It writes the authoritative simulation snapshot synchronously to local storage where available and waits for the IndexedDB transaction if that is the only durable storage available. State-change events outside a turn save synchronously; mutations during a turn are persisted after that turn finishes. `visibilitychange`, page `freeze`, `pagehide`, and `beforeunload` trigger a best-effort snapshot. If exit occurs mid-turn, the runtime preserves the last coherent checkpoint rather than overwrite it with a half-applied day.

No browser application can guarantee a new write after the operating system has killed its process or power has been lost. The mitigation is to save each completed turn and meaningful state mutation before relying on an exit callback, rather than treating the Back button or unload event as the primary save mechanism.

## World simulation scheduler

The tier-aware world scheduler budgets up to four active and eight macro countries per committed game day on standard devices. Constrained mobile uses up to two active and four macro evaluations, yields after each country and uses a smaller turn budget. Pending events and duplicate IDs persist in existing world state, with priority protection for war, conflict and sanctions. The player keeps the existing detailed runtime. See `docs/OMEGA_WORLD_SIMULATION_SCHEDULER_V1.md` for the runtime contract, memory limits and 100-day regression boundaries.


## Country data loading and release

The compact country identity/economy baseline remains available. Large supporting records load only for the selected country and requested domain. The country runtime coalesces concurrent source-file requests, retains at most eight country/domain records and exposes explicit release methods. General and sector profile APIs return one country record, not the full global registry. The server shares concurrent source reads and evicts its parsed copy after a short idle interval. Optional datasets are excluded from the offline app-shell precache. The opponent gateway coalesces duplicate in-flight loads and omits optional raw datasets from save snapshots.
