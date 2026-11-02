# OMEGA World Simulation Scheduler v1

## Purpose

This layer coordinates the existing OMEGA simulation engine. It does not add another clock, duplicate the authoritative world state, replace resource/factory runtimes, or create synthetic country economies.

## Three execution tiers

- **Player country:** existing detailed country systems remain authoritative. The scheduler runs player-scoped lifecycle handlers but does not run opponent AI for the player.
- **Active countries:** countries involved in trade, diplomacy, war, sanctions, treaties, active projects, or military training are promoted temporarily. Up to four active countries are evaluated per committed game day.
- **Global macro countries:** remaining canonical country identities are evaluated in deterministic round-robin batches of up to eight per committed game day. The opponent engine's existing FULL/STANDARD/BACKGROUND scheduler retains its 1/3/7-turn cadence and evidence-aware decision depth.

## Runtime contract

The existing simulation runtime remains the only authoritative clock and turn coordinator. The opponent engine checks its multi-rate due gate before running the heavier resource-flow analysis, so an off-cadence country heartbeat does not run that derived pass. The scheduler registers one ordered participant and uses the existing opponent rules APIs: country roster, evaluate one country, and queue one actionable decision per evaluated country. The normal turn path no longer calls the unbounded all-country batch.

Country identity resolution uses the canonical country runtime/identity bridge. The current repository country datasets contain 249 country/territory identities, not exactly 197 sovereign states. The scheduler follows the registered roster rather than silently dropping identity-only records or hardcoding a number. A sovereign-only roster still requires an authoritative sovereignty field in the canonical data.

## Bounded work and memory

| Work | Per committed game day |
| --- | ---: |
| Player lifecycle handlers | 1 player country |
| Active opponent countries | Up to 4 |
| Global macro countries | Up to 8 |
| Combined opponent AI evaluations | Up to 12 |
| Queued scheduler events | Up to 16 processed |
| Active country set | Maximum 48 |
| Pending event queue | Maximum 256 |
| Remembered event identifiers | Maximum 512 |
| Derived country-analysis cache | Maximum 64 entries |
| Country evaluations between browser yields | 2 |

Active countries expire after 30 game days unless renewed by ongoing work or a new relevant event. The macro cursor, active-country metadata and last-processed turns are stored under the existing simulation state. The opponent rules engine's derived country-analysis cache is limited to 64 least-recently-used entries; evicted analysis is recomputed on demand and only the bounded cache is written into the engine save snapshot. Country economic, resource, factory and inventory data remain with their current authoritative owners.

## Event and lifecycle behavior

Trade, diplomacy, treaty, war, sanctions, project and military events promote involved canonical country IDs. Duplicate event identifiers are ignored. Existing active projects, import requests and military training are discovered once during scheduler bootstrap, not by rescanning every country each game day.

Opponent autonomy project and training ticks use player/active country handlers. The old all-country scan remains only as a compatibility fallback when the new scheduler is unavailable.

## Validation and limitations

The 100-game-day automated test uses 197 canonical test identities and verifies that every non-player test country receives at least one evaluation through either the active or macro tier, the player never enters opponent AI, active/macro budgets stay within limits, counterparties become active, duplicate turns are idempotent, and active/event queues are bounded.

This is a deterministic engine regression test, not evidence that a physical Android 9 device has completed a 100-day gameplay soak. Browser JavaScript remains single-threaded for these evaluations: this change bounds work at turn boundaries and yields cooperatively to the browser after every two country evaluations, but does not claim that Web Workers are already active. The macro evaluation produces evidence-backed decisions and queues commands; it does not claim that every country changes GDP or inventory every day. Resource and factory production continue through existing domain runtimes and their current player-country scope.
