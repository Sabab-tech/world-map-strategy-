# OMEGA World Simulation Scheduler v1

## Purpose

This layer coordinates the existing OMEGA simulation engine. It does not add another clock, duplicate the authoritative world state, replace resource/factory runtimes, or create synthetic country economies.

## Three execution tiers

- **Player country:** existing detailed country systems remain authoritative. The scheduler runs player-scoped lifecycle handlers but does not run opponent AI for the player.
- **Active countries:** countries involved in trade, diplomacy, war, sanctions, treaties, active projects, or military training are promoted temporarily. Up to four active countries are evaluated per committed game day.
- **Global macro countries:** remaining canonical country identities are evaluated in deterministic round-robin batches of up to eight per committed game day. The opponent engine's existing FULL/STANDARD/BACKGROUND scheduler retains its 1/3/7-turn cadence and evidence-aware decision depth.

## Runtime contract

The existing simulation runtime remains the only authoritative clock and turn coordinator. The opponent engine checks the saved next-due turn **before creating a country snapshot, hydrating state, or rebuilding the dependency graph**. FULL, STANDARD and BACKGROUND work is scheduled at 1-, 3- and 7-turn intervals; a relevant event or source update marks a country dirty and bypasses that interval. The scheduler registers one ordered participant and uses the existing opponent rules APIs: country roster, evaluate one country, and queue one actionable decision per evaluated country. The normal turn path no longer calls the unbounded all-country batch. The canonical roster is reused in memory and refreshed at most every 30 turns, rather than being rebuilt on every game day.

Country identity resolution uses the canonical country runtime/identity bridge. The current repository country datasets contain 249 country/territory identities, not exactly 197 sovereign states. The scheduler follows the registered roster rather than silently dropping identity-only records or hardcoding a number. A sovereign-only roster still requires an authoritative sovereignty field in the canonical data. Country identity and the compact baseline economy stay resident in the existing 846 KB profile index. Population, economy, city and society records are requested by domain only when needed; selected country rows are retained in an eight-record LRU and can be released. The 18 MB general registry and 12 MB sector registry are served through country-scoped endpoints, so browsers receive one selected country record rather than the full global file. Concurrent source reads are coalesced on the server. A short parsed-file cache checks file size and modification timestamps before reuse, so changing a source file invalidates its previous parsed value immediately rather than waiting for the TTL. Country endpoints require revalidation; client fetches bypass the browser HTTP cache. Original source JSON files remain intact.

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
| Country evaluations between browser yields | 2 standard; 1 constrained mobile |
| Country evaluation slice budget | 8 ms target; yield occurs after a synchronous country finishes |
| Scheduler turn budget | 52 ms standard; 28 ms constrained mobile |
| Constrained-mobile active / macro work | Up to 2 active and 4 macro countries |

Active countries expire after 30 game days unless renewed by ongoing work or a new relevant event. The macro cursor, active-country metadata, last-processed turns, compact pending events and bounded event-ID deduplication window are stored under the existing simulation state. Event intake is priority ordered: war/conflict/sanction events are protected from routine trade-event floods. A full queue removes the oldest lowest-priority item or rejects a lower-priority newcomer. The opponent rules engine's derived country-analysis cache is limited to 64 least-recently-used entries; evicted analysis is recomputed on demand. A country dirty event removes its old run and hydrated snapshot before the next calculation. Replacing or releasing a source dataset rebuilds the dependency graph and clears all derived country caches. The raw-data gateway keeps the required canonical roster plus at most four optional datasets as an LRU working set; releasing a dataset invalidates its in-flight request so a late response cannot silently repopulate stale data. Per-country actor memory is bounded to 256 countries, with the latest 64 decisions and 64 outcomes per country. Autosaves keep the small authoritative scheduler/actor state, the latest 512 history entries and 128 trace entries; derived runs and hydrated snapshots are deliberately not serialized. Concurrent requests for the same raw dataset share one fetch. Optional datasets are not loaded during engine initialization. Country economic, resource, factory and inventory data remain with their current authoritative owners.


## Offline data and cache policy

The service worker uses two independent stores:

- The app shell contains boot-critical scripts, styles, the map shell, the compact country index and explicitly referenced small visual assets. Large country, mine, logistics and industry JSON registries are not bulk-downloaded at install.
- Country and domain JSON is fetched on demand with a network-first policy. A successful online response replaces the exact cached URL. Only a network failure may use a last-downloaded copy, and that response is marked with `X-OMEGA-OFFLINE-STALE: 1`. A server 404/410 deletes the previous copy; a server error is returned rather than masking it with stale content.

The offline data working set is limited to 32 URLs, 24 MB total and 4 MB per file, using exact URL keys and least-recently-used eviction. This supports offline use of the countries and datasets already opened on the device without forcing every resource shard to download or allowing an unbounded cache. A never-downloaded dataset cannot be promised offline. The service worker version changes independently of the data-cache version so an app-shell update does not wipe the user's downloaded country data.

## Event and lifecycle behavior

Trade, diplomacy, treaty, war, sanctions, project and military events promote involved canonical country IDs. Duplicate event identifiers are ignored. Existing active projects, import requests and military training are discovered once during scheduler bootstrap, not by rescanning every country each game day.

Opponent autonomy project and training ticks use player/active country handlers. The old all-country scan remains only as a compatibility fallback when the new scheduler is unavailable.

## Validation and limitations

The 100-game-day test uses 197 synthetic identities and verifies that every non-player test country receives at least one evaluation through either the active or macro tier, the player never enters opponent AI, budgets stay within limits, counterparties activate, turns are idempotent, and active/event queues are bounded. Additional tests cover country-data coalescing, release of in-flight loads, early due-gating before snapshot hydration, dirty-cache invalidation, compact autosaves and the offline cache's online refresh, offline fallback, deletion and size limits.

This is a deterministic engine regression test, not evidence that a physical Android 9 device has completed a 100-day gameplay soak. Browser JavaScript remains single-threaded for these evaluations: this change bounds work at turn boundaries and yields cooperatively to the browser after at most two evaluations on standard devices or one on constrained mobile, using an 8 ms country-slice target and 52 ms/28 ms scheduler budgets. This remains cooperative single-threaded work, not a Web Worker claim. The macro evaluation produces evidence-backed decisions and queues commands; it does not claim that every country changes GDP or inventory every day. Resource and factory production continue through existing domain runtimes and their current player-country scope. A separate low-frequency authoritative macro-economy ledger for non-player GDP, resource inventories and industrial output is still future work; this scheduler does not fabricate those values.
