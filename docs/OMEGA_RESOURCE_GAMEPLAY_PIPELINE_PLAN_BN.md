# OMEGA Resource Gameplay Pipeline: বর্তমান অবস্থা, ডেটা পুনরুদ্ধার ও বাস্তবায়ন পরিকল্পনা

তারিখ: 2026-10-12
ভিত্তি: main = 1563f5db1d71041d3dfd9c9a07163572f2d68224; চলমান pipeline পরিবর্তন = PR #57

## 1. সিদ্ধান্ত-সারাংশ

গেমকে playable করতে শুধু 250টি row বা map marker যথেষ্ট নয়। প্রতিটি নির্বাচিত site-কে একই runtime-এ চালাতে হবে: পরিচয় → উৎপাদন পরিকল্পনা → extraction transaction → batch → sovereign raw warehouse → route reservation → transport/shipment → factory receipt → input consumption → output/by-product → economy/market/fiscal ledger → save/load and next turn.

বর্তমান repo-তে এর অনেক ভিত্তি আছে: Resource Ministry Engine, Part 04 identity/ownership/location, Part 05 reserve/extraction, Endowment Runtime, country-boundary guard, production/realism/logistics/research runtimes, industrial network, canonical/master catalogs, gameplay binding, economy runtime এবং Android build workflow। কিন্তু পৃথক unit test pass হলেই পুরো খেলায় এই layer-গুলি একসঙ্গে কাজ করে, তা প্রমাণ হয় না। বিশেষ করে mock-based industrial integration test প্রকৃত Endowment Runtime-এর batch দিয়ে শুরু করে না; তাই real-runtime vertical slice আলাদা gate হওয়া দরকার।

## 2. ডেটা-লস অডিট: যা নিশ্চিত, যা এখনও অনিশ্চিত

- বর্তমান canonical/master resource-site authority: 250 site, যার মধ্যে 246 commercial-simulation site এবং 4 N/A site। এটা বর্তমান unified registry-এর সংখ্যা; এটি ইতিহাসের প্রতিটি map marker অক্ষত থাকার প্রমাণ নয়।
- পুরনো resources.json/resources_2.json country-profile structure-এর resource_infrastructure_context.mineSites array-তে 199টি site record আছে। resource_site_reference_expanded_part_01..04.json-এ সেগুলি 50+50+50+49 ভাগে রাখা হয়েছে। test/omega_resource_reference_lossless.test.mjs তাদের source profile-এর সঙ্গে exact sourceSiteRecord equality যাচাই করে।
- ওই 199টি site-এর বর্তমান বণ্টন: 197টি দেশ-প্রোফাইলের মধ্যে 196 দেশে 1টি করে site, কিউবায় 3টি; বাকি দেশে 0টি এই নির্দিষ্ট array থেকে। তাই এই 199টি আপনার বর্ণিত “প্রায় সব দেশে 3–4টি map marker”-এর তালিকা নয়।
- বর্তমান canonical catalog-এ প্রথম 199টি legacy reference-এর পরে 51টি additive record আছে। current tests 250 unique IDs, 246 commercial + 4 N/A-র contract যাচাই করে।
- ইতিহাসে মুছে যাওয়া build_resources_database.py-এর deposits_list-এ 41টি স্পষ্ট deposit entry ছিল এবং মাত্র 17টি country label ছিল। ফাইলটির comment “all 195 countries” বললেও data list বাস্তবে সেই coverage দেয়নি। তাই এই generator নিজে 195×3–4 sites-এর নির্ভরযোগ্য backup নয়।
- পুরনো map-engine-2.js এবং বর্তমান legacy overlay ResourceMinistryEngine.deposits-এর ওপর নির্ভর করে, যা বর্তমান startup-এ 43টি runtime deposit। অন্যদিকে individual-site binding canonical/master catalog থেকে আলাদা marker layer তৈরি করে। দুই renderer-এর মধ্যে registry parity নিশ্চিত নয়। এটি visible marker কমে যাওয়ার একটি বাস্তব architectural explanation, কিন্তু পুরনো 3–4-per-country records কোথায় গেছে তার সম্পূর্ণ recovery নয়।
- 962b4461 migration commit-এ resources.json উল্লেখযোগ্যভাবে বদলেছে এবং পুরনো srie_database.json বাদ গেছে; build_resources_database.py-ও পরে সরানো হয়েছে। এই পরিবর্তনগুলো historical-source recovery audit দাবি করে, কিন্তু শুধু deletion বা diff-stat দেখে 3–4/site data মুছে গেছে বলে নিশ্চিত হওয়া যায় না।
- বর্তমান প্রমাণে 199টি legacy source-profile record ও 51টি additive site সংরক্ষিত। কিন্তু আগে map-এ দেখা সব marker ঐতিহাসিকভাবে পুনরুদ্ধার হয়েছে, তা এখনও প্রমাণিত নয়। পুরনো commits, পুরনো map renderer, generated data ও deleted scripts/output তুলনা না করে “কিছুই হারায়নি” বলা ভুল হবে।

### Recovery কাজ

1. Git history থেকে প্রাথমিক map marker renderer, generator scripts, তাদের output schema এবং resource-data migration-গুলির আগের/পরের snapshots তুলনা করা।
2. পুরনো marker/site record পাওয়া গেলে resource_site_legacy_recovery_candidates_v1.json-এ append-only candidate হিসেবে রাখা: recoveryId, original ID/name/country/coordinates/commodity, sourceCommit, sourcePath, confidence, observed-vs-simulated authority এবং duplicate decision।
3. candidate-কে canonical 250-এর সঙ্গে exact/near-duplicate matching করে report তৈরি করা। কোনো existing record silently overwrite করা যাবে না।
4. map parity report-এ হিসাব হবে: old archived markers, current raw runtime deposits, 199 lossless profile sites, 51 added sites, canonical/master sites, valid coordinates, country mismatch, duplicate/merged records এবং visible marker count।

## 3. একই pipeline-এ কোন layer কী করবে

| Layer | বিদ্যমান ভিত্তি | runtime contract / বাকি প্রমাণ |
|---|---|---|
| A. Source & identity | resources.json, resources_2.json, canonical catalog, master registry, data contract | প্রতিটি site-এর স্থায়ী ID, ISO3 country, commodity, coordinates, source pointer; source discrepancy-র audit |
| B. Site engineering | reserve-simulation, research evidence, realism, scenario engineering | real/observed value ও simulation value পৃথক; reserve, rate, capacity, grade, purity, recovery, mine type, risk, operator, status, route profile-এ field-level provenance |
| C. Selection & map | map-engine-2.js, individual-site gameplay binding | map ও gameplay এক site authority থেকে populate করবে; selected marker একই exact site ID দিয়ে execution panel খুলবে |
| D. Extraction planning | industrial extraction planner + realism/method catalogs | resource/site/country match, capacity, reserve, turn, staffing/equipment, technology; plan-only কখনও production হিসেবে গণ্য হবে না |
| E. Execution & batch | Endowment Runtime + Part 05 + hardening | exact controller-linked occurrence; reserve decrement, ledger row, real batch ID/quantity, origin/owner/destination country, quality and warehouse ID একই transaction-এ |
| F. Raw warehouse | Endowment inventory/batches/lots/receipts | batch quantity, country inventory, available quantity এবং receipt যোগফল মেলে; একই batch দ্বিতীয়বার credit হবে না |
| G. Route & shipment | industrial network + logistics + turn clock | available-minus-reserved rule; route mode, ETA/capacity/cost এবং transport blockade; dispatch-এর আগে reservation |
| H. Arrival & factory | industrial network factory assets/processing rules | delivery ledger যাচাই; raw stock একবার debit; factory input stock একবার credit; recipe inputs/outputs এবং by-products persist হবে |
| I. Economy/market | resource economy, global market, fiscal/finance runtimes | output-এর valuation, operating cost, tax/royalty, treasury, national accounts, domestic supply ও export availability; একই transaction দুবার settle হবে না |
| J. AI/government/war | ministries, opponent autonomy, relations/treaties/sanctions, military/naval layers | sanctions, ownership, war, naval/route blockage, tech and cabinet decisions production/transport-এ প্রভাব ফেলবে; missing data হলে explicit blocked reason |
| K. Persistence & Android | game session/turn system, offline build | save/load-এ batch, reserves, routes, shipments, factory stock, event IDs স্থায়ী; network ছাড়াই offline gameplay; CDN-এর ওপর নির্ভরতা নয় |

## বর্তমান প্রমাণিত অগ্রগতি (2026-10-12)

- SITE → EXTRACTION → RAW WAREHOUSE → ROUTE/SHIPMENT → FACTORY → PROCESS OUTPUT-এর একটি বাস্তব Endowment Runtime vertical slice CI-তে সফল।
- বর্তমান main-এ PR #57 merge হয়েছে: [commit 31c61aed](https://github.com/Sabab-tech/world-map-strategy-/commit/31c61aeddf914274606bfe6a74c78dd7a2a8b9f4)।
- Android CI build merge commit-এ সফল হয়েছে; সেটি low-end Android ডিভাইসে app চালিয়ে পূর্ণ game session সম্পন্ন করার সমতুল্য নয়।
- বাকি বড় কাজ: 250 site-এর map/runtime parity test, ঐতিহাসিক marker recovery, output থেকে market/fiscal/treasury settlement, save/load, route blockage ও বাস্তব Android smoke test। গেমের সামগ্রিক status এখনও INCOMPLETE।

## 4. বাস্তবায়নের ক্রম

### P0 — Baseline lock and data proof
- main, PR #57, workflows এবং source JSON-এর SHA/count নথিভুক্ত করা।
- 199 → 250 lineage, unique-ID joins, 246/4 split, coordinate validity এবং country/resource consistency regression চালানো।
- Recovery candidates আলাদা রাখা; source JSON-এ destructive rewrite নয়।

### P1 — One registry for map and gameplay
- Map overlay, individual-site picker, extraction planner ও Endowment controller একই canonical site ID ব্যবহার করবে।
- coordinate নেই/invalid হলে site record মুছে ফেলা নয়: MARKER_BLOCKED_INVALID_COORDINATES diagnostic দিতে হবে।
- World/nation/resource filter-এর marker count UI ও diagnostics-এ দেখাতে হবে; clustering display marker কমাতে পারে, data/site count কমাতে পারবে না।
- legacy runtime-deposit markers এবং canonical individual-site markers duplicate হলে merge/de-dupe report দিতে হবে, source record মুছতে নয়।

### P2 — Real extraction-to-factory vertical slice
- test fixture-এ fake Endowment batch নয়; real ResourceMinistryEngine + Endowment Runtime-এর exact site occurrence থেকে শুরু করতে হবে।
- একই game state-এ plan → extract → batch → warehouse → shipment reservation → ETA advance → factory input → process outputs/by-products trace করতে হবে।
- প্রতিটি ধাপে stable transaction/event ID, source site ID, occurrence key, country, quantity এবং unit assert করতে হবে।
- shipment failure হলে stock/reservation rollback; duplicate turn action হলে idempotent block; no cross-country ledger leakage।
- PR #57 merge হওয়ার আগে real-runtime regression CI-তে সফল হয়েছে: [Resource Verification Certificate run #38256067068](https://github.com/Sabab-tech/world-map-strategy-/actions/runs/38256067068), head `05bdedc0`। এতে প্রকৃত Kuwait Greater Burgan site থেকে Endowment extraction → batch → country raw warehouse → shipment reservation/dispatch → ETA advance → factory receipt/processing → output ও ledger assertion সম্পন্ন হয়েছে। এটি একটি site-এর vertical slice প্রমাণ করে, সব 250 site বা পুরো economy settlement নয়।

### P3 — Economy settlement
- বর্তমান factory-cycle test resource outputs যাচাই করতে পারে; কিন্তু output থেকে treasury/GDP/market ledger settlement আলাদাভাবে প্রমাণ করতে হবে।
- recipe output একবার inventory-তে credit হবে; তার পরে price/operating cost/tax/royalty/fiscal posting একবার transaction ID দিয়ে হবে।
- বাজার মূল্য না থাকলে zero বা বানানো price দিয়ে observed fact সাজানো যাবে না; simulation policy স্পষ্ট থাকতে হবে।

### P4 — Strategic geopolitics
- Routes কেবল বাস্তব road-by-road audit নয়; গেমের strategic logistics layer: domestic corridor, rail, sea lane, pipeline, border, naval control/blockade, war, sanctions, trade treaty এবং infrastructure project।
- দেশভিত্তিক shipment isolation default; আন্তর্জাতিক transfer explicit ownership/contract/authorization ছাড়া নয়।
- AI/autonomy tick পরবর্তী turn-এ production, maintenance, depletion ও inventory পরিবর্তন করে; human action ও AI action একই transaction contract ব্যবহার করবে।

### P5 — Playable session, persistence and performance
- 2015 start-year-এ দেশ বাছাই → site নির্বাচন → extraction order → simulation turn advance → delivery → factory output → economy change—একটি সম্পূর্ণ scenario।
- app restart/save-load-এর পরে reserve, warehouse balance, batch, shipment ETA, factory stock ও economy postings একই থাকবে।
- low-end Android 9/3GB RAM-এ বড় JSON একসঙ্গে পুনঃparse না করা; indexes cache করা, bounded ledger, lazy map marker creation, offline assets।
- Android CI build pass-কে APK বাস্তবে launch/simulation run করার প্রমাণ ধরা যাবে না; device/browser smoke test আলাদা।

## 5. Completion gates

- Data integrity: canonical site IDs unique; 250 registry rows, 246 commercial + 4 N/A; source-path joins ও all data additions audit-able.
- Map integrity: selected filter-এর eligible coordinate-backed sites সব render/cluster-এ represent; missing coordinates ও wrong country স্পষ্টভাবে report; map থেকে selected site exact same ID-তে execute হয়।
- Pipeline integrity: true Endowment batch থেকে real shipment ও processed output পর্যন্ত end-to-end test pass; inventory conservation/transaction idempotency/country isolation pass.
- Economy integrity: processing outputs market/fiscal ledger-এ একবার settle; treasury/economy state delta asserted.
- Gameplay integrity: turn advance, save/load, blockade/route failure, unavailable factory এবং insufficient stock-এর tested blocked/recovery behavior.
- Platform integrity: CI Android artifact build + packaged local data validation + actual device/browser smoke; offline start and one complete turn demonstrated.

কোনো gate fail করলে status হবে INCOMPLETE; UI-তে site count বা simulation fallback দেখে playable completion ঘোষণা করা যাবে না।

## 6. আত্মসমালোচনা ও change-control নিয়ম

- আগে 250 site-কে আগের map-এর সব resource point-এর সমার্থক ধরে নেওয়া অতিরিক্ত আত্মবিশ্বাসী ছিল। Registry count আর historical marker parity আলাদা মাপকাঠি।
- আগের 199-কে পুরো world resource inventory বলাও ভুল: তা এক নির্দিষ্ট profile array-এর 199 rows। map-এ ব্যবহৃত runtime deposits-ও ভিন্ন list।
- পৃথক test pass থেকে whole-game runtime pass অনুমান করা যাবে না। mock Endowment test industrial logic-এর contract যাচাই করে, real module-to-module linkage নয়।
- real-runtime test-এ দুইটি প্রকৃত integration bug ধরা পড়েছিল: (১) industrial country normalizer KWT-কে ভুল করে ISO-2 KW bucket-এ পাঠাচ্ছিল, ফলে controller lookup ব্যর্থ হতো; (২) economy.productionAssets আগে না থাকলে auto-commissioned factory detached temporary array-তে যোগ হতো, persistent game state-এ নয়। দুটোই runtime-এ ঠিক হয়েছে এবং regression assertions যোগ হয়েছে।
- source evidence, scenario-generated value, coordinate confidence এবং UI marker visibility আলাদা status হিসেবে রাখতে হবে।
- additive edits only: original files preserve, recovery candidates append, source hash/count checks add; unrelated file delete/overwrite নয়।
