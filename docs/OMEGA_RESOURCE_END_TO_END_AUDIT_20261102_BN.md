# OMEGA Resource System: End-to-End Audit
তারিখ: ২ নভেম্বর ২০২৬
Repository: Sabab-tech/world-map-strategy-
পরিধি: player-country runtime, mine extraction, logistics, inventory, factory inputs, processing, finished goods ও UI visibility

## অডিটের নিয়ম
কোনো file, JSON record, catalog entry, route profile, UI card বা passing unit test-কে একা gameplay proof ধরা হয়নি। প্রতিটি ধাপে source quantity, batch/lot lineage, warehouse balance, reservation, shipment, receipt, factory input, production cycle এবং finished-goods receipt আলাদা করে অনুসরণ করতে হবে।

Geological reserve, active extraction, raw inventory, factory input এবং finished industrial goods আলাদা স্তর। Unknown data-কে শূন্য ধরে নেওয়া যাবে না। Factory catalog বা country starting allocation-কে commissioned factory asset হিসেবে গণনা করা যাবে না।

## Runtime turn sequence
বর্তমান Resource Economy turn runner নির্বাচিত player country-র জন্য:
1. National demand preparation করে।
2. Endowment runtime-কে country-scoped extraction চালাতে বলে।
3. Industrial Network-এর country turn চালায়: shipment advance, project advance এবং factory input/production cycle processing।
4. Economy inventory reconciliation, national demand, dashboard publication ও market/trade publication চালায়।

একই simulation turn-এ resource turn execution deduplicate করা হয়। Resource Economy উপস্থিত থাকলে Industrial Network নিজস্ব আলাদা global turn চালায় না। স্বাভাবিক runtime-এ Resource Economy-ই turn orchestration authority।

## Verified data flow

### A. Mine identity → extraction
- Canonical mine/site occurrence, resource identity, reserve state ও production rate এক জিনিস নয়।
- Endowment runtime eligible mine occurrence থেকে extraction batch তৈরি করে এবং committed extraction event পাঠায়।
- প্রতিটি batch-এর resource, quantity, unit, batch ID, site lineage এবং provenance মিলিয়ে দেখতে হবে।
- Extraction output দেখানো মানেই warehouse receipt নয়।

### B. Mine → raw warehouse
- Player-country Industrial Network MINE_TO_WAREHOUSE shipment-এ extraction batch-এর unshipped balance ধরে রাখে।
- Dispatch-এর সময় aggregate inventory ও raw-warehouse available balance থেকে cargo hold করা হয়; batch/lot-এর source identity বজায় থাকে।
- ETA পূর্ণ হলে warehouse receipt resource, batch, lot এবং quantity যাচাই করে; কেবল delivered quantity-ই raw warehouse-এ যোগ হয়।
- আংশিক receipt হলে একটি batch একই সময়ে mine-held, in-transit এবং raw-warehouse অংশে ভাগ থাকতে পারে। তাই batch-level warehouseId একা warehouse-এর available quantity বোঝায় না।

### C. Raw warehouse → factory
- Site-flow batch-এর received warehouse portion dispatchResidualSiteBatches() থেকে core dispatchShipment()-এ যায়।
- Core shipment type RAW_TO_FACTORY; route, capacity, stock reservation, ETA এবং shipment state resource.industrialNetwork.shipments-এ থাকে।
- ETA পূর্ণ হলে receipt যাচাই করে factory input inventory ও input batch lot তৈরি হয়। Factory cycle কেবল recipe inputs এবং operational gates পূরণ হলে শুরু হয়।
- একই batch-এর অন্য shipment transit-এ থাকলে তা warehouse available stock বা factory input stock হিসেবে গণনা করা যাবে না।

### D. Factory processing → finished goods
- Factory production cycle recipe, source input lots, capacity, workforce/employment, utilities এবং cycle finish date যাচাই করে।
- Cycle completion-এ input consumption ও finished output transaction commit হয়। Output batch/source lineage বজায় থাকে।
- Inventory runtime factory input consumption ও output production ledger-এ লেখে এবং country inventory reconcile করে।
- Finished/processed output processed warehouse-এ জমা হয়; finished-goods event site-flow history-তে processing ও output lineage যুক্ত করে।
- Output তৈরি হওয়া এবং market-এ বিক্রি হওয়া পৃথক ঘটনা। Market publication বা sale settlement output batch-কে পুনরায় তৈরি করতে পারবে না।

## এই audit branch-এ সংশোধন
1. **দ্বৈত shipment authority বন্ধ।** ResourceLogisticsRuntime আর resource.logistics.shipments-এ fake IN_TRANSIT shipment লিখবে না। এটি route-preview adapter। Actual material movement ও delivery কেবল ResourceIndustrialNetwork-এর ledger-এ থাকবে। Legacy log মুছে ফেলা হয়নি; UI-তে historical preview হিসেবে আলাদা চিহ্নিত।

2. **Extraction event-এ premature factory route plan বন্ধ।** OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE আসার সময় batch এখনও mine haul বা warehouse receipt-এর আগে থাকতে পারে। Economy event handler আর দুইবার পুরোনো logistics planner চালায় না। Event এখন PENDING_RAW_WAREHOUSE_RECEIPT এবং AWAITING_CORE_NETWORK_DISPATCH হিসেবে চিহ্নিত হয়।

3. **Mine batch-এর transport bypass বন্ধ।** transferFactoryInputsFromWarehouse()-এর immediate internal-transfer helper এখন siteFlowLedger-এ থাকা mine-backed batch সরাসরি factory input-এ তুলবে না। Site-backed batch-এর factory feed core RAW_TO_FACTORY shipment, capacity reservation ও receipt দিয়েই যেতে হবে। Non-site opening/import batch-এর existing internal warehouse transfer অপরিবর্তিত।

4. **Actual shipment UI authority ঠিক।** Logistics panel এখন industrialNetwork.shipments দেখায়। resource.logistics.shipments-এর পুরোনো রেকর্ড live shipment হিসেবে দেখানো হয় না; সেগুলো legacy route-plan history।

5. **Warehouse quantity visibility ঠিক।** Partial mine batch-এর জন্য raw-warehouse quantity এখন received portion থেকে factory-dispatched portion বাদ দিয়ে গণনা হয়। Mine-held এবং in-transit অংশ warehouse inventory হিসেবে দেখানো হয় না। Non-site batch-এর ক্ষেত্রে raw-warehouse location এবং active shipment reservation যাচাই করা হয়। Batch-এর warehouseId না থাকলে শুধু raw warehouse-এর default ID বসিয়ে মিথ্যা arrival দেখানো হয় না।

6. **Test contract শক্ত করা হয়েছে।** Logistics adapter test যাচাই করে route preview source-stock debit, shipment record বা false delivery তৈরি করে না; advance core Industrial Network-এ delegate হয়। Economy test premature dispatch status যাচাই করে। UI test core-vs-legacy shipment ও partial warehouse quantity যাচাই করে। Mine-batch bypass প্রতিরোধের regression guard যোগ হয়েছে।

## এখনো প্রয়োজনীয় যাচাই / সীমাবদ্ধতা
- **প্রকৃত gameplay/save-load smoke:** browser বা Android runtime-এ একটি নতুন ও একটি পূর্বের save খুলে mine থেকে finished-goods warehouse পর্যন্ত বাস্তব in-game turn চালিয়ে UI, save, reload এবং পুনরায় turn চালিয়ে duplicate shipment/receipt হয় কি না যাচাই করতে হবে। Repository API access দিয়ে নির্দিষ্ট save বা device session চালানো যায়নি।
- **Normal commissioning path:** বিদ্যমান comprehensive end-to-end test explicit autoCommissionFactory: true fixture ব্যবহার করে। এটি test fixture-এ processing path প্রমাণ করে; নতুন game-এ normal build/commission user action-এর সম্পূর্ণ বাস্তব পথের বিকল্প নয়।
- **Route data truth:** logistics manifest-এ 561 unique physical site ID route design আছে, 193টি country profile-এ; shared framework 197 country-কে সমর্থন করে, কিন্তু Liechtenstein (LIE), Monaco (MCO), San Marino (SMR) ও Vatican City (VAT)-এর eligible mine/site route নেই। 561টি row হলো canonical/expanded/critical/legacy source union, সব দেশের সব বাস্তব mine-এর census নয়। Dataset-এর authority SCENARIO_LOGISTICS_DESIGN_ONLY এবং simulationOnly=true; routePlan dispatchStatus NOT_DISPATCHABLE_DATA_ONLY_PHASE। তাই route geometry, distance, speed, payload ও capacity simulation design estimate; surveyed corridor নয়।
- **Transport fleet binding:** route manifest-এ warehouse physical coordinates null, actual bound/working fleet units null এবং actual asset status unknown। Test matrix-এ 519 leg-এর design fleet need হিসাব করা যায়; 841 leg unit incompatibility বা explicit pipeline-line capacity না থাকায় uncalculated থাকে। UNBOUND_SIMULATED_CAPACITY বা simulation authority-র route-কে actual registered vehicle availability বলা যাবে না।
- **Non-site warehouse feed:** opening/imported stock যার site-flow lineage নেই, সেটি এখনো INTERNAL_WAREHOUSE_TO_FACTORY immediate transfer path ব্যবহার করতে পারে। সব warehouse→factory transfer-এ physical transport চাইলে imported/opening stock-এর জন্যও explicit internal route, fleet/capacity, ETA ও receipt contract নির্ধারণ করে আলাদা implementation ও test প্রয়োজন।
- **Full asset/data coverage:** canonical 41 raw-resource identity, 21 factory types, 197 country baseline এবং 561 site/route references-এর প্রতিটি record এই patch-এর মধ্যে runtime-এ চালিয়ে যাচাই করা হয়নি। Data-completeness test, selected-country live run এবং per-site route audit আলাদা করে করতে হবে।
- **Device performance:** runtime cooperative yielding ও player-country scope রয়েছে, কিন্তু Android 9 low-memory device-এ বড় mine count এবং simultaneous shipments-সহ soak test ছাড়া Chrome crash বা memory-pressure issue সমাধান হয়েছে বলা যাবে না।

## Release acceptance checklist
- [ ] Mine extraction commit exactly one source batch/lot per occurrence and turn.
- [ ] Mine dispatch reserves the complete unshipped source amount once; receipt restores exactly the received amount once.
- [ ] Raw warehouse available stock equals received minus factory-dispatched/reserved amount.
- [ ] Site-backed factory feed always has a core RAW_TO_FACTORY shipment and matching receipt.
- [ ] No route preview, legacy adapter, UI action or event observer can create an independent shipment ledger.
- [ ] Recipe input units and quantities reconcile with factory input batch lots.
- [ ] Factory cycle starts only after all recipe inputs and operational gates are ready.
- [ ] Cycle completion consumes each input once and creates output batches once.
- [ ] Finished output is visible in processed warehouse and inventory ledger after reload.
- [ ] Repeating a committed turn or reloading a save does not duplicate extraction, shipment, receipt, transfer or production.
- [ ] All CI checks pass, followed by new-game and existing-save browser/mobile smoke tests.

## Evidence boundary
এই নথি code-path inspection ও regression changes-এর audit summary। GitHub Actions green না হওয়া পর্যন্ত patch-কে passing বলা যাবে না। Browser/Android saved-game smoke test না হওয়া পর্যন্ত live gameplay/save compatibility-কে verified বলা যাবে না।
