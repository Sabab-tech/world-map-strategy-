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


## Player-country production slices

The player country remains on the existing authoritative mine, inventory, transport and industrial runtimes. The normal economy turn uses the existing `startCountryProduction` path when available. It processes eligible mine occurrences in sequential slices of 3 on Android/mobile or constrained devices and 8 on other devices, yielding between slices. Ready mine hydration is reused during the game turn; manual one-tap production keeps its existing hydration behavior.

The economy fallback factory calculator shares one generator between the existing synchronous public API and a cooperative turn API. Normal turn processing yields between facility planning and transaction steps after 3/8 facilities or an 8 ms work slice. The existing Industrial Network turn runner remains preferred and retains its own cooperative yielding. No new mine ledger, factory engine, inventory owner or production formula is introduced. Every eligible occurrence/facility is still evaluated; yielding changes when the work runs, not what production is calculated.

These yields cannot interrupt one individual synchronous command handler or transaction already in progress. A single unusually expensive calculation still needs a future worker/pure-function boundary if profiling shows that it exceeds the frame budget.

## Offline data and cache policy

The service worker uses two independent stores:

- The app shell contains boot-critical scripts, styles, the map shell, the compact country index and explicitly referenced small visual assets. Large country, mine, logistics and industry JSON registries are not bulk-downloaded at install.
- Country and domain JSON is fetched on demand. When a local copy exists, it is returned immediately and the service worker revalidates that exact URL in the background, so a slow connection does not hold up the screen. A fresh response replaces the cached URL; changed ETag/Last-Modified values notify the page so its in-memory domain cache can be invalidated. A network timeout or offline state keeps the last downloaded copy and marks it with `X-OMEGA-OFFLINE-STALE: 1`; a transient 5xx may also keep that marked copy. A server 404/410 deletes the previous copy and notifies the page to clear its in-memory entry. A first-time request with no local copy has a bounded 2.2-second network attempt and returns an explicit offline miss if it fails.

The offline data working set is limited to 48 URLs, 48 MB total and 12 MB per file, using exact URL keys and least-recently-used eviction. Country-data requests use a 2.2-second network timeout; a genuine offline/network timeout may use the last downloaded copy and marks it with `X-OMEGA-OFFLINE-STALE: 1`. A transient 5xx may also fall back to that marked copy, while 404/410 deletes the prior URL entry. Boot-critical `world.json` and `economy_global_profiles_v1.json` stay in the shell cache. This supports offline use of datasets already opened on the device without forcing every resource shard to download or allowing an unbounded cache. A never-downloaded dataset cannot be promised offline. The service worker version changes independently of the data-cache version so an app-shell update does not wipe the user's downloaded country data.

## Event and lifecycle behavior

Trade, diplomacy, treaty, war, sanctions, project and military events promote involved canonical country IDs. Duplicate event identifiers are ignored. Existing active projects, import requests and military training are discovered once during scheduler bootstrap, not by rescanning every country each game day.

Opponent autonomy project and training ticks use player/active country handlers. The old all-country scan remains only as a compatibility fallback when the new scheduler is unavailable.

## Validation and limitations

The 100-game-day test uses 197 synthetic identities and verifies that every non-player test country receives at least one evaluation through either the active or macro tier, the player never enters opponent AI, budgets stay within limits, counterparties activate, turns are idempotent, and active/event queues are bounded. Additional tests cover country-data coalescing, release of in-flight loads, early due-gating before snapshot hydration, dirty-cache invalidation, compact autosaves and the offline cache's online refresh, offline fallback, deletion and size limits.

This is a deterministic engine regression test, not evidence that a physical Android 9 device has completed a 100-day gameplay soak. Browser JavaScript remains single-threaded for these evaluations: this change bounds work at turn boundaries and yields cooperatively to the browser after at most two evaluations on standard devices or one on constrained mobile, using an 8 ms country-slice target and 52 ms/28 ms scheduler budgets. This remains cooperative single-threaded work, not a Web Worker claim. The macro evaluation produces evidence-backed decisions and queues commands; it does not claim that every country changes GDP or inventory every day. Resource and factory production continue through existing domain runtimes and their current player-country scope. A separate low-frequency authoritative macro-economy ledger for non-player GDP, resource inventories and industrial output is still future work; this scheduler does not fabricate those values.


## Country-scoped national macro and Finance execution (2026-11-17)

The existing world scheduler now runs the selected country's macro/fiscal pipeline through ordered country handlers. It does not start a second clock or run every profile in one committed-turn callback.

| Handler | Priority | Tiers | Responsibility |
|---|---:|---|---|
| Macro Stability | 10 | PLAYER / ACTIVE / MACRO | Apply the existing country macro-stability policy and automatic stabilizer calculation |
| Finance Ministry | 15 | PLAYER / ACTIVE / MACRO | Apply the existing per-country GDP compounding, Treasury/tax accrual, debt interest, fiscal-year rollover, Finance ledger and state synchronization |
| Economic Transmission | 20 | PLAYER / ACTIVE / MACRO | Update existing country CPI, cost, wages and purchasing-power projections from the country profile/runtime inputs |
| NPC National Macro checkpoint | 30 | ACTIVE / MACRO | Record the source-backed country economic checkpoint after the existing macro and fiscal state have advanced |

The two original macro runtimes retain explicit batch APIs for maintenance and compatibility, but their old automatic all-profile committed-turn loops are not attached. Finance likewise retains `advanceTurn()` for explicit maintenance/tests while normal committed turns call `advanceCountry()` only for scheduler-selected country IDs.

Economic Transmission calculates the read-only world inflation median once per turn. Its currency stress projection is rebuilt once by the canonical Simulation turn finalizer (priority 80), after all country handlers and before the durable autosave finalizer. This prevents both per-country duplicate aggregation and stale pre-update currency stress.

Per-country `lastProcessedTurn` checks remain the idempotency authority, so processing one country does not block a different country from being processed in the same turn. The scheduler supplies `stepDurationMs` from the canonical simulation clock; wall-clock 15-second frame pacing is not used for annualization. PLAYER work remains isolated to the selected player country, while NPC work remains bounded to existing ACTIVE/MACRO selections and existing device budgets.

These integrations reuse existing country profile data and state owners. They do not add country-specific economic constants, a duplicate Finance/Treasury ledger, an inventory or trade authority, a new scheduler, or a new clock.


## Remaining world-wide economic projections and Finance-triggered FX sync (2026-11-17)

A current-main audit classified the remaining major economic turn paths:

| Runtime | Turn path | Scope / effect | Decision |
|---|---|---|---|
| Macro Stability | Existing country handler, priority 10 | Mutates only the scheduler-selected country's macro policy/stability and economy state | Country-scoped; already integrated |
| Finance Ministry | Existing country handler, priority 15 | Mutates selected-country fiscal, Treasury and Finance state | Country-scoped; already integrated |
| Economic Transmission | Existing country handler, priority 20 | Mutates selected-country CPI/cost/wage/purchasing-power projections | Country-scoped; already integrated |
| NPC Macro checkpoint | Existing country handler, priority 30 | Stores selected NPC country evidence checkpoint | Country-scoped; already integrated |
| FX / Forex | Currency-level simulation tick once per committed turn; global rate/registry projection | Advances shared currency monetary state once per currency and refreshes country FX/Banking projections; it is not a second detailed country economy | Keep the central monetary tick global, but do not invoke a full-country projection for each country Finance update. Finance-triggered refresh now calls `syncCountry(countryCode)`; full `syncAllCountries()` remains for initialization, whole-world rate/mode changes and the once-per-turn FX projection |
| Global Commodity Market | One turn-driven world order-book rebuild, followed by selected player-country projection | Reads cross-country bids/asks/offer and available-stock projections; produces `PRICE_DISCOVERY_ONLY` market snapshots. It does not settle stock or cash | Keep the market book as a single world-wide read aggregation; never run a full order-book rebuild once per country handler |
| National Demand | Explicit `processCountry(countryId, ...)` from the resource/economy country processing path | Builds demand/consumption projection for the supplied country; no global committed-turn profile loop | Preserve explicit country scope |
| Opponent Autonomy | Existing bounded World Simulation Scheduler | Uses event-driven ACTIVE and round-robin MACRO decisions | Preserve existing scheduler tiers and budgets |

### FX targeted-sync regression

Finance now emits `OMEGA_FINANCE_STATE_UPDATED` with the updated `countryCode`. The FX runtime uses that value to refresh only that country's Government Banking and Finance FX snapshot. It no longer loops all 249 country/territory profiles for every scheduler-selected Finance update. If a legacy Finance event omits country identity, the FX runtime retains a full-sync compatibility fallback.

The full FX synchronization still:
- initializes the 249-profile/available-currency index;
- publishes the current shared simulation/reference rate tables;
- projects all country-specific currency and macro display fields once after the central FX/rate update;
- preserves the existing world FX summary and settlement/banking authority.

A focused Finance FX runtime regression asserts that one Nigeria Finance update reads only the Nigeria profile from Finance and updates only Nigeria's Banking/Finance projection; Bangladesh and United States records remain unchanged and the global 3-country summary remains intact. This is a country projection optimisation, not a currency rate or Treasury accounting change.

### Data/provenance constraints for NPC progression

- `economy_global_profiles_v1.json` is a local model baseline with baseline year 2015; it covers 249 country/territory identities, 230 with available local economic profile data and 19 unavailable. It is not automatically a current, externally revalidated national accounts series.
- `omega_economic_transmission_runtime_v1.js` publishes modeled macro indicators. Its `realGDPIndex` is a derived index and is not nominal GDP or observed production value.
- Global Market order-book crossing has `PRICE_DISCOVERY_ONLY` authority. It is neither a completed sale nor a cash receipt.
- Global Trade settlement buyer/seller counterpart rows must be deduplicated by settlement/transaction identity before any world-flow aggregation; amounts from unlike local currencies cannot be summed without the existing FX conversion authority.
- Industrial output quantities retain product-specific units and authority. Simulated factory output, capacity, planned projects and shipment legs cannot be converted into observed GDP or summed across tonnes, energy, water and unit products.
- National Demand's observed, modeled, simulated-capacity and unavailable demand states remain distinct. Unknown must never silently become zero.
- No new NPC GDP/output/inflation equation should be implemented until a separate versioned model contract documents coverage, units, time basis, calibration basis and null semantics for every input.
