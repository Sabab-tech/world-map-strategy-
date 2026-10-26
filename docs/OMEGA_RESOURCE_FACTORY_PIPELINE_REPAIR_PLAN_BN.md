# OMEGA মাইন–ফ্যাক্টরি পাইপলাইন: স্থায়ী অডিট ও বাস্তবায়ন পরিকল্পনা

**অডিট তারিখ:** 2026-10-27  
**বেসলাইন:** `main` commit `df79d9214838bfc0861b009efa640a6f1bf66ef4`  
**অবস্থা:** অনুমোদিত; পরিকল্পনা-নথি। এই নথি নিজে কোনো গেম-স্টেট বা উৎস-ডেটা পরিবর্তন করে না।

## 1. অটল নিয়ম

1. বিদ্যমান গুরুত্বপূর্ণ ফাইল, পুরনো ডেটা, রেকর্ড, SVG, route asset বা archived implementation অনুমতি ছাড়া মুছবে/ওভাররাইট করবে না। নতুন তথ্য additive হবে; একই শারীরিক সাইটের duplicate/alias-কে নতুন খনি হিসেবে গণনা করা যাবে না।
2. বাস্তব পর্যবেক্ষিত/রিপোর্টকৃত তথ্য, সিমুলেটেড gameplay profile এবং অজানা মান আলাদা থাকবে। অনুপস্থিত সংখ্যা 0 বা বানানো বাস্তব পরিমাপে রূপান্তর করা যাবে না।
3. ক্যাটালগে ফ্যাক্টরির ধরন সংজ্ঞায়িত থাকা মানে কোনো দেশের সেই ফ্যাক্টরি বাস্তবে/গেমে নির্মিত আছে এমন নয়। UI-তে catalog definition, সম্ভাব্য input, নির্মিত asset, active cycle ও inventory আলাদা দেখাতে হবে।
4. production turn-এ স্বয়ংক্রিয় simulation কাজ শুধু player-selected দেশেই চলবে, যাতে ফোনের WebView-তে সব দেশের পুরো pipeline একসাথে চালিয়ে freeze তৈরি না হয়। কিন্তু অন্য দেশগুলো **browse/read-only** করা যাবে; country selector কখনো শুধু বর্তমান দেশ বা সীমিত সংখ্যক state bucket-এ আটকে থাকবে না।
5. কোনো ধাপের সফলতা আগের ধাপের রেকর্ড দেখে অনুমান করা যাবে না। Batch, dispatch, arrival, input receipt, cycle completion এবং inventory posting প্রত্যেকটি state transition যাচাই করতে হবে।
6. কাজ PR-ভিত্তিক হবে: main-এর সঠিক বর্তমান SHA থেকে branch, ছোট ও পর্যালোচনাযোগ্য পরিবর্তন, regression test, CI ফলাফল, merge-এর পর main ও live workflow পুনরায় যাচাই। একসাথে একই ফাইলের concurrent write নয়।

## 2. বেসলাইন ডেটা-পরিসর ও ডুপ্লিকেট নীতি

বর্তমান repository-তে একাধিক স্তরের site references আছে; এদের সংখ্যা যোগ করে total mine count বানানো যাবে না।

- Canonical site catalog: 315 records.
- Master registry: 250 records; এগুলো canonical catalog-এর 250টি site ID-এর সঙ্গে overlap করে।
- Legacy expanded reference pack: 199 records, চার ভাগে রাখা।
- Critical-mineral batch: 58 records।
- Current endowment test runtime: 561 baseline-plus-critical site reference rows; test-এ সব ID unique হওয়ার assertion রয়েছে। এটি **561টি আলাদা বাস্তব খনি-প্রমাণ নয়**; authoritative execution eligibility, alias status, canonical physical ID ও runtime binding পরীক্ষা করতে হবে।
- Runtime test-এ কমপক্ষে 400টি unique executable baseline sites দেখা হয়; exhaustive E2E test সব 561-এ full pipeline চালায় না: তা আলাদা fixture-এ নির্বাচিত 58 critical-mineral sites চালায়।
- শিল্প ক্যাটালগে 21 factory profiles, 42 raw-resource processing rules, 22 downstream recipes এবং 5টি declared external input sources আছে।
- Canonical 315-site catalog-এ বর্তমানে 65 site-এ non-empty `simulation.transportRoute` আছে। 250 master-registry rows-এ `simulation.transportRoute` খালি array। 65 route-র mode values `ROAD_RAIL` বা `PIPELINE_AND_SEA_LANE`; runtime route selector `truck`, `rail`, `ship`, `pipeline`-এর সঙ্গে সরাসরি এই values মেলাতে পারে না। ফলে mode mismatch-এ hash-seeded synthetic corridor ব্যবহৃত হতে পারে।

অতএব “মোট প্রায় 550” ব্যবহারকারীর একটি আনুমানিক স্মৃতি; repository-র বর্তমান operational invariant আলাদা। গণনার জন্য canonical ID ও physical alias resolution-ই কর্তৃত্বপূর্ণ হবে।

## 3. 2026-10-27 অডিটে প্রমাণিত ঝুঁকি

### R1 — স্বাভাবিক mine action-এ simulation factory bootstrap

`omega_resource_industrial_network_v1.js`-এর `executeSitePipeline()`-এ, `autoCommissionFactory` না-দেওয়া হলেও compatible factory না পেলে simulation-only factory তৈরি হতে পারে। Site map binding-ও `autoCommissionFactory: true` পাঠাচ্ছে। ফলে পরীক্ষার সুবিধার factory বাস্তব game construction, বিল্ডিং materials, treasury debit, staffing ও commissioning workflow এড়িয়ে যেতে পারে।

**সমাধান:** simulation bootstrap শুধু explicit `autoCommissionFactory: true` test/scenario opt-in হলে চলবে। স্বাভাবিক UI action কোনো factory auto-build করবে না। উপযুক্ত factory না থাকলে extract করা ব্যাচ sovereign raw warehouse-এ থাকবে এবং `EXTRACTED_AWAITING_FACTORY`/সমতুল্য status দেখাবে। E2E test-এ simulation bootstrap লাগলে test fixture-এ স্পষ্টভাবে flag দেওয়া হবে।

### R2 — logistics runtime duplication / lifecycle authority

`Omega.ResourceLogisticsRuntime` আলাদা `resource[country].logistics.shipments`-এ পরিকল্পনা ও shipment state রাখে। এর `installEventListener()` বর্তমানে `false` ফেরত দেয়। Core `Omega.ResourceIndustrialNetwork`-এর নিজস্ব source-batch reservation, transport arrival, factory input lot, dated production cycle ও finished goods state ইতিমধ্যেই আছে।

**সমাধান:** core material movement-এর একটিই authority—`ResourceIndustrialNetwork` এবং তার country-scoped ledgers। আলাদা logistics runtime route quote/plan UI-তে দেখাতে পারে, কিন্তু core shipment authority-র সঙ্গে স্পষ্ট adapter ছাড়া দ্বিতীয় shipment ledger-কে production-delivery proof হিসেবে গণনা করা যাবে না। একই shipment/transaction idempotent থাকবে।

### R3 — route mode token mismatch

Site route-এ composite modes আছে; runtime সাধারণত single mode খোঁজে। **সমাধান:** composite route token normalize/match করবে; route distance source থেকে নেওয়া হলে `SITE_SIMULATION_ROUTE` provenance সংরক্ষণ, না হলে `SIMULATED_CORRIDOR_MODEL` স্পষ্ট হবে। route definition থাকলেই delivery সংঘটিত হয়েছে—এমন দাবি হবে না। UI-তে route definition, chosen route, in-transit shipment ও delivered shipment আলাদা থাকবে।

### R4 — country selector অসম্পূর্ণ হতে পারে

`omega_ui_v2/integration.js`-এর country options প্রধানত Home Ministry engine-এর `getAvailableCountries()` থেকে, এবং `slice(0, 300)` ব্যবহার করে। runtime-এর পূর্ণ country profile list ও বিদ্যমান country-keyed state maps merge করা হয় না।

**সমাধান:** `OmegaCountryRuntimeData.listProfiles()` থেকে canonical দেশের roster তৈরি, তারপর Home Ministry availability ও Game.state-এর country keys additive ভাবে merge করা; active country প্রথমে রেখে বাকি সব canonical profile alphabetical/label order-এ যোগ করা। ISO-3 canonical ID ব্যবহার হবে; browsing-এ অন্য দেশ read-only থাকতে পারে, কিন্তু দেশের option লুকানো যাবে না। Runtime production tick player country-তেই সীমিত থাকবে।

### R5 — data schema mismatch এবং খালি/অসম্পূর্ণ route fields

কিছু UI path `quantitative` পড়ে, কিন্তু legacy/enriched records-এ `quantitativeProfile` থাকতে পারে। Unavailable route বা metric-কে UI “সব null” দেখাতে পারে। **সমাধান:** shared read adapter normalize করবে, source evidence ধরে রাখবে এবং observed/simulated/unobserved status প্রকাশ করবে। route বা factual production মান অনুপস্থিত হলে তা চিহ্নিত হবে; বাস্তব হিসাবে বানিয়ে পূরণ হবে না। Scenario-only gameplay parameter প্রয়োজন হলে সেটি আলাদা simulation field/authority হবে।

### R7 — resource master-এ তিনটি ব্যবহৃত commodity অনুপস্থিত

রিসোর্স-রান পরীক্ষায় দেখা গেছে, ৩৮টি legacy master resource type-এর বাইরে সাইট-রেজিস্ট্রি ও industrial processing catalog-এ ব্যবহৃত `gypsum`, `niobium`, `ruby` আছে, কিন্তু master definitions নেই। ফলে site/recipe যুক্ত থাকলেও catalog labels ও resource identity lookup অসম্পূর্ণ হতে পারে।

**সমাধান:** বড় `resources.json`/ `resources_2.json` ফাইল পুনর্লিখে ডুপ্লিকেট তৈরি না করে `resource_type_extensions_v1.json` additive authority যোগ করা হয়েছে। Resource Ministry engine, server registry, site map resource labels, offline cache এবং integrity tests একই extension পড়বে। এই dataset-এ শুধু তিনটি missing type থাকবে; বিদ্যমান master records মুছবে বা প্রতিস্থাপন করবে না। প্রত্যাশিত ইউনিয়ন: ৩৮টি legacy identity + ৩টি additive identity = ৪১টি resource types।

### R6 — green CI বাস্তব saved-game proof নয়

বর্তমান CI-তে Resource Gameplay Pipeline, Mine Management, Exhaustive Every-Site Pipeline, Android 9 Offline Smoke এবং Pages deploy pass করেছে। তবে exhaustive test 561 references যাচাই করে, selected 58 critical sites full E2E চালায়; test-এ infrastructure, utilities ও factory bootstrap fixture নিজে provision করা হয়। তাই pass ফল saved game-এ সব route/assets বাস্তবে linked আছে তা প্রমাণ করে না।

**সমাধান:** deterministic E2E-র পাশাপাশি country-specific live-state diagnostic, persisted fixture/save-load test এবং manual-play smoke checklist রাখতে হবে।

## 4. একক কর্তৃত্বপূর্ণ pipeline contract

`Site identity → extraction eligibility → extraction plan → committed source batch → sovereign raw warehouse → route/transport reservation → in-transit shipment → delivery receipt → factory input batch lot → recipe/utility/capacity gate → dated production cycle → input consumption → output/by-product batch → processed warehouse / national inventory → optional market, trade & treasury settlement → save/load reconciliation`

প্রতিটি stage-এ country ID, site ID, resource ID, batch ID, shipment ID (যদি প্রযোজ্য), factory ID, recipe ID/cycle ID, turn/date, quantity/unit, authority/provenance, status এবং failure reason থাকবে। একই event/retry duplicate stock বা output তৈরি করতে পারবে না।

### Inventory conservation

প্রতি resource ও unit family-তে:
`opening stock + extracted/produced + imports = closing stock + consumed + sold/exported + documented loss/waste`

In-transit ও reserved stock আলাদা অবস্থায় থাকবে; পৌঁছানোর আগেই factory inventory-তে যোগ হবে না। Input shortage হলে সব required inputs যাচাইয়ের আগে কোনো অংশ consume হবে না। Finished goods-এর coproduct, waste ও recycling output-ও batch/ledger-এ সংরক্ষিত হবে।

## 5. 21 factory profiles: destination policy

`resource_industrial_catalog_v1.json` একমাত্র canonical recipe/profile authority থাকবে; আরেকটি duplicate per-country recipe catalog তৈরি করা হবে না।

1. Universal Materials & Elements Processing Plant: 42 raw-resource processing rules.
2. Steel & Alloy Works: `STEEL_PRIMARY_ROUTE_V1`.
3. Non-Ferrous Metal Smelter: copper এবং aluminium routes.
4. Petrochemical & Polymer Plant.
5. Fertilizer & Agrochemicals.
6. Industrial Chemicals & Gases.
7. Cement & Concrete Works.
8. Glass & Ceramics Works.
9. Paper & Packaging Mill.
10. Food Processing & Cold Chain.
11. Textile & Garment Mill.
12. Industrial Machinery & Machine Tools.
13. Grid & Electrical Equipment.
14. Electronics & Semiconductor Fab, including wafer and chip lines.
15. Battery & Energy Storage Plant.
16. Vehicle, Truck & Bus Assembly.
17. Shipbuilding & Rail Equipment Yard.
18. Aerospace & Aircraft Equipment.
19. Pharmaceuticals & Medical Supplies.
20. Defence Equipment Factory.
21. Recycling & Waste Processing Plant.

Destination selection will be input/recipe-driven, not a guess based on factory name. Example: iron ore → raw processing rule → iron concentrate batch → steel recipe only after *all* steel inputs exist. External inputs `grain`, `vegetable_oil`, `sugar`, `cotton_fibre`, `wool_fibre` must have recorded source batches or explicit import/producer delivery. Never auto-generate external stock.

Factory catalog availability, national actual asset count, construction project, operational status, recipe, input readiness, cycle throughput and produced inventory are distinct. Do not instantiate fake active factories for 249 countries just to make dashboard counters look non-empty.

## 6. All-country visibility vs active gameplay

- Browsing: all canonical country profiles and each country's known mine/factory/warehouse/project/route/cycle data are visible where recorded.
- Unknown state: show `Not recorded / No country state initialized`, not invented zero asset count or an invented factory.
- Catalog: 21 factory types and their recipes are browseable from any country view.
- Construction/extraction mutation: only authorized player-country actions should commit unless a separate, explicit NPC/autonomy policy exists.
- Background ticks: one selected country per turn for phone performance; do not call full world diagnostics synchronously from the screen renderer.
- Route visibility: saved route definition != dispatched shipment != delivered goods.

## 7. নিজের কাছে জবাবদিহিতার প্রশ্ন

প্রতিটি PR এবং release gate-এ উত্তর রেকর্ড করতে হবে:

1. Did I inspect current main, existing branches, archived/duplicate files and latest checks before editing?
2. Are observed facts and simulation-only assumptions still separated?
3. Does a normal mine action ever silently create a factory or bypass construction?
4. Is the resource flow country-boundary safe, batch-tracked, unit-normalized and idempotent?
5. Does a composite route mode resolve to a compatible transport mode? Does it use a recorded route only when appropriate?
6. Can any country be selected for inspection even with no initialized runtime state?
7. Is active background simulation restricted to the player-selected country while read-only country browsing remains global?
8. Does the factory receive every required input and wait for the correct game-date duration before producing?
9. Do output/by-product quantities reconcile and reach the correct inventory once?
10. What happens when route, factory, inventory, utility, workforce, technology or external inputs are missing?
11. Do tests exercise failures, retries, paused cycles and save/load—not only success paths?
12. Which workflows actually ran for the new commit, on which SHA, and did they finish successfully?
13. Did any pre-existing important file/data get deleted or overwritten? Expected answer must remain **no** unless explicitly approved.
14. Did I verify PR status, merge result and final main SHA after integrating?

## 8. Implementation sequence and acceptance gates

### Phase A — Baseline / artifact audit
- Capture main SHA, open PRs, branch status and relevant current CI.
- Establish exact registry counts, duplicate/alias overlap, route coverage, 21/42/22 catalog contract.
- Search incomplete factory-country/dashboard work and reuse unique changes only; do not merge a stale branch wholesale.
- Deliver a repeatable report of per-country site counts, route coverage, actual factory assets, missing state and flow-stage blockers.

### Phase B — Fix high-risk runtime defaults
- Make simulation factory bootstrap explicit opt-in only.
- Remove normal UI's forced simulation bootstrap.
- Normalize composite route modes while preserving source authority.
- Avoid duplicate independent logistics delivery ledgers.

### Phase C — All-country read-only visibility
- Populate the UI selector from all canonical country runtime profiles plus existing country-keyed state; no active-country-only dropdown.
- Preserve the active player country first.
- Show each selected country's known data without inventing built factory assets or globalizing all country's game state.

### Phase D — Data completeness without fabrication
- Load the additive resource master extension in browser and server runtimes; verify all 41 type IDs resolve and every eligible site resource has both extraction and processing rules.
- Normalize `quantitative`/`quantitativeProfile`, resource IDs, country IDs and route schema at a single adapter boundary.
- Fill only simulation-policy fields with explicit simulation authority.
- Preserve absent observed metrics as absent.
- Deduplicate by stable canonical physical site ID; keep historical records and source provenance.
- Audit all 561 runtime reference rows against canonical IDs/alias policy; report per-country counts and gaps.
- If an additive gameplay quantity file from an open PR is needed, review its full diff, merge base, unit model, selected-country behavior and conflicts before porting only the validated unique components.

### Phase E — Constructed-factory vertical slice
In an isolated deterministic fixture for one country:
1. Provide explicit simulation test resources, construction materials, treasury, workforce, utilities and transport.
2. Start a real `startFactoryProject()`; consume the exact construction bill of materials once.
3. Advance in-game dates and commission the project through `advanceProjects()`.
4. Start a real eligible mine extraction through the Endowment runtime; assert a source batch and raw warehouse lot exist.
5. Dispatch along a compatible route; assert ETA/in-transit and no early receipt.
6. Advance to ETA, receive batch into the built factory, and assert all input lot provenance.
7. Confirm missing inputs block atomically.
8. Start cycle; before finish date assert no finished goods. After finish, assert exact input debit, output/by-product batch IDs, processed warehouse/national inventory and site flow status.
9. Retry events and save/load to assert no double-delivery, double-consumption or duplicate output.
10. Verify a different country's state remained unchanged.

Simulation-only fixture data must be labelled; the fixture does not imply those factories exist in a real saved game.

### Phase F — Global gates and release
- Unit/contract: 21 profiles, 42 processing rules, 22 recipes, no duplicate canonical IDs, no unregistered inputs and no invalid unit bridges.
- Runtime: `npm run lint`, `npm run test:resource-industrial-network`, `npm run test:factory-baseline`, `npm run test:resource-logistics`, `npm run test:resource-e2e`, `npm run test:resource-global-auto`, `npm run test:resource-site-integrity`, `npm run test:resource-endowment`, `npm run test:resource-mine-management`, and new UI country-browsing regression.
- Exhaustive: reconcile the 561 reference roster/aliases; run every eligible site in a controlled matrix or country/site batch and report per-site failures, not just totals.
- Performance: confirm no global per-frame/per-turn scan or all-country background extraction is introduced; repeat Android 9/WebView smoke test.
- Release: inspect the full diff, create PR, wait for all relevant GitHub Actions, correct failures, merge only after green gates, then verify the resulting main SHA and new workflows.

## 9. Work not to claim without evidence
**Current implementation record (PR #260):** 305 simulation-only reserve rows are additive and ID-unique; the master-type extension covers `gypsum`, `niobium`, and `ruby`; the resource pipeline test, exhaustive site production run, Android build, and Android 9 offline smoke passed on a previous CI head. Re-run every relevant workflow after the latest extension/loader commits before merging. No new CI result should be inferred from prior-head checks.


- Do not claim all 561 rows are unique real-world mines merely from the runtime-reference count.
- Do not claim 21 types means 21 built factories in every country.
- Do not call a route record a successful shipment.
- Do not call a delivered input a completed production cycle.
- Do not call a passing test fixture proof that the user's existing save has the same commissioned factories, inventory and transport assets.
- Do not claim a PR is merged until GitHub confirms merged=true and main points at the resulting commit.
