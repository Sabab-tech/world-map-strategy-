# OMEGA Current Stock ও Turn-Driven Factory Supply V1

তারিখ: 2026-11-02

## ১. উদ্দেশ্য

কারখানার ইনপুট ইনভেন্টরি আর এক-সাইকেলের ১.৪ গুণ বাফার দিয়ে তৈরি হবে না। প্রতিটি দেশের Factory Input Baseline-এর দৈনিক গড় চাহিদা বের করে একটি কনফিগারযোগ্য coverage window অনুযায়ী প্রাথমিক stock target তৈরি হবে। ডিফল্ট ১০০ দিন; দেশ বা গেম-সেশন কনফিগারেশনে অন্য দিন নির্বাচন করা যাবে।

UI-তে এই coverage target বা “১০০ দিনের রিজার্ভ” লেখা হবে না। UI কেবল **Current Stock** দেখাবে। Raw Warehouse ও Processed Warehouse-এর পরিমাণ আলাদা reconciliation field হিসেবে থাকবে; দুটিকে যোগ করে মোট স্টক দেখানো হবে না।

## ২. দৈনিক কারখানা-ইনপুট চাহিদা

প্রতি country/product-এর বর্তমান canonical input source rows থেকে হিসাব:

`dailyDemand(product) = Σ(source.demandQuantity / max(1, source.cycleDays))`

`targetStock(product) = dailyDemand(product) × targetCoverageDays`

- `demandQuantity` বিদ্যমান ২১ factory profile, ২২ downstream recipe ও processing rule থেকে আসে।
- বিকল্প recipe-র কারখানা ইউনিট আগে থেকেই route-এ ভাগ করা; প্রতিটি বিকল্পকে একসঙ্গে চালু ধরে দ্বিগুণ চাহিদা তৈরি করা হয় না।
- ৪১টি raw resource identity অপরিবর্তিত। Industrial intermediate পণ্য আলাদা namespace-এ থাকবে।
- target days-এর resolution: country resource override → country-level simulation resource supply policy → global simulation supply policy → player-supply policy default → factory baseline default (১০০ দিন)। অনুমোদিত পরিসর ১–৩৬৫০ দিন।

Static `country_factory_input_inventory_baseline_v1.json` এখনও legacy per-cycle source rows বহন করে। Runtime source-কে cycle days দিয়ে ভাগ করে daily rate তৈরি করে। পুরোনো ৪০% source snapshot compatibility/provenance হিসেবে রাখা হয়েছে; এটি live target-এর buffer নয়।

## ৩. একবারের opening stock migration

প্রতিটি country/resource row-তে runtime:

1. বর্তমান aggregate inventory এবং উপযুক্ত warehouse balance পড়ে।
2. unit bridge দিয়ে একই simulation unit-এ normalize করে।
3. দুই ledger-এ অমিল থাকলে stock বানায় না; mismatch/unknown report করে।
4. বর্তমান stock target-এর কম হলে শুধু ঘাটতি একটি নতুন V2 batch হিসেবে যোগ করে।
5. inventory, unit map, batch, lot, warehouse receipt ও inventory ledger এক transaction-এর অংশ হিসেবে update করে।
6. V2 marker-এ target days, target quantity, current quantity, top-up, provenance এবং batch ID সংরক্ষণ করে।

আগের save-এর inventory, batch ও factory assets মুছে বা replace করা হয় না। V1 one-cycle marker পাওয়া গেলে সেটি পুনরায় যাচাই করে শুধু প্রয়োজনীয় top-up করা হয়। একই target-এ পুনরায় initialize করলে নতুন stock credit হয় না। Unresolved unit/ledger mismatch থাকলে পরবর্তী startup-এ retry করা যায়, কিন্তু duplicate batch credit করা হয় না।

প্রাথমিক opening stock simulation-only। এটি geological reserve নয়, verified shipment নয়, বা বাস্তব facility/inventory census নয়।

## ৪. চলমান Mine → Inventory → Factory pipeline

নতুন wall-clock timer, `setInterval`, বা দ্বিতীয় mine-production loop যোগ করা হয়নি। বিদ্যমান authoritative pipeline ব্যবহার হয়:

1. Game-এর committed turn-এ `ResourceEconomy.runTurn()` নির্বাচিত player country-এর জন্য একবার চালু হয়।
2. `OmegaResourceEndowmentRuntime.startCountryProduction()` ঐ দেশের eligible mine occurrence থেকে extraction transaction তৈরি করে। Existing per-turn occurrence/idempotency guard পুনরায় উত্তোলন আটকায়।
3. `OMEGA_RESOURCE_EXTRACTION_COMPLETED` event-এর batch identity ও country boundary যাচাই করে বিদ্যমান Industrial Network mine-haul logistics-এ যায়।
4. Route capacity, transport availability, blockade ও ETA অনুযায়ী shipment dispatch হয়। Mine-held quantity একবারই aggregate warehouse availability থেকে debit হয়।
5. `Omega.ResourceIndustrialNetwork.runCountryTurn()` shipment advance করে। Mine-to-warehouse receipt না হওয়া পর্যন্ত batch warehouse-available হিসেবে দেখানো হয় না।
6. Delivered batch raw/processed warehouse-এ একবার credit হয়। Factory input requisition current factory asset, recipe, capacity, current stock ও inbound shipment অনুযায়ী তৈরি হয়।
7. Delivery batch factory input lot-এ পৌঁছালে existing factory cycle scheduler প্রয়োজনীয় সব input reserve করে। নির্ধারিত game-calendar finish date/turn না আসা পর্যন্ত finished goods তৈরি হয় না।

Player country selection বদলালে পরের committed turn থেকে নতুন selected country চালু হবে। অনির্বাচিত ১৯৬ দেশের পূর্ণ per-site/per-factory runtime চালু করা হয় না। তাদের static starting allocation data থাকবে; এটি Android performance guard-এর অংশ।

## ৫. নতুন factory ও mine পরিবর্তন

- Factory runtime প্রতিটি turn-এ live factory assets, recipe, daily capacity, input stock ও inbound quantities থেকে requisition হিসাব করে। নতুন factory যোগ হলে তার ইনপুট চাহিদা এই live requisition-এ যোগ হয়।
- নতুন factory যোগ হলেই mine rated capacity বা geological reserve বাড়ে না। অতিরিক্ত চাহিদা current stock দ্রুত কমাবে বা factory cycle block করবে।
- Mine upgrade/commissioning হলে Endowment production model-এর অনুমোদিত capacity/operational state বদলাবে; সেই উৎপাদনও normal extraction batch → haul → receipt path দিয়েই যাবে।
- Warehouse-এ পৌঁছানোর আগে shipment quantity factory-তে ব্যবহারযোগ্য নয়।

## ৬. UI

Resource Command Center-এর Inventory panel:

- ৪১টি canonical raw resource, দেশের factory-input baseline products এবং ইতিমধ্যে inventory/warehouse-এ থাকা product IDs একত্রে দেখায়।
- প্রধান balance label: **Current Stock**।
- Raw Warehouse ও Processed Warehouse available balance পৃথক field।
- Stage ও unit দেখায়।
- একই পরিমাণ inventory ও warehouse থেকে যোগ করে দ্বিগুণ total দেখায় না।
- stock-duration/coverage-days field দেখায় না।
- Inventory change, extraction receipt ও committed turn-এর event-এ বিদ্যমান rate-limited UI refresh ব্যবহার করে; এটি gameplay clock বা production timer নয়।

## ৭. Performance ও integrity gates

- Full detailed simulation শুধু selected player country।
- একই game turn/country-এর resource run cached/idempotent।
- Mine extraction occurrence একই turn-এ পুনরাবৃত্তি হয় না।
- Shipment আগে reservation/capacity/route checks পাস করে; delivery ledger একবারই settle হয়।
- Factory processing কেবল received/tracked input batches থেকে শুরু হয়।
- `maxBatches` ও `maxLedgerEntries` limits মানা হয়।
- Explicit zero, unknown unit, missing receipt এবং aggregate/warehouse mismatch কখনো synthetic positive stock-এ রূপান্তর করা হয় না।
- Save/load marker একই coverage version ও days হলে পুনরায় opening credit দেয় না; coverage policy বদলালে বর্তমান balance থেকে শুধু ঘাটতি যোগ হয়।

## ৮. Scope ও অবশিষ্ট বাস্তব ডিভাইস যাচাই

এই পরিবর্তন startup stock target, player-country turn pipeline wiring, Inventory UI এবং regression tests-কে একই নিয়মে রাখে। GitHub CI pass করা Android 9/3GB RAM বাস্তব ডিভাইসে দীর্ঘ session, save migration বা প্রতিটি route-এর operational performance প্রমাণ করে না। সেই smoke test আলাদা acceptance gate থাকবে।
