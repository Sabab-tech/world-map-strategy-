# OMEGA: দুই-স্তরের Commodity Market — Design v1

## ১. মূল ধারণা

OMEGA-র বাজারে ঠিক দুই ধরনের commodity থাকবে:

1. **Raw Resource** — খনি, কূপ, quarry, brine site বা অন্য extraction site থেকে পাওয়া প্রাকৃতিক সম্পদ। পরিচয় ও নামের authoritative source হলো বিদ্যমান Resource Ministry catalog-এর ৪১টি resource identity।
2. **Factory Product** — বিদ্যমান কারখানা/processing route কোনো input process করে যে intermediate, finished product, co-product বা by-product তৈরি করে। পরিচয় আসবে `resource_industrial_catalog_v1.json`-এর `processingRules` এবং `downstreamFactoryRecipes`-এর output keys থেকে।

এটি দুইটি আলাদা inventory বা দুইটি আলাদা অর্থনীতি নয়। একই canonical commodity ID, একই country inventory, একই batch lineage এবং একই Trade/Finance settlement pipeline থাকবে। শুধু বাজারে product classification এবং market lane আলাদা হবে। নতুন resource identity বা factory type তৈরি করা যাবে না।

## ২. Product classification

প্রতিটি market item-এর metadata:

- `productId` / `resourceId`: বিদ্যমান canonical ID; display name আলাদা হতে পারে।
- `productType`: `RAW_RESOURCE` অথবা `FACTORY_PRODUCT`।
- `productRole`: raw-এর জন্য `RAW_MATERIAL`; factory output-এর জন্য `PRIMARY_OUTPUT`, `CO_PRODUCT`, `BY_PRODUCT`, `PROCESSING_OUTPUT` বা `FACTORY_OUTPUT`।
- `unit`: ঐ commodity-র catalog/recipe unit; incompatible unit একসঙ্গে price বা quantity-তে যোগ করা যাবে না।
- `sourceFactoryTypes` ও `sourceRecipeIds`: কোন factory route পণ্যটি তৈরি করতে পারে, তার trace।
- `usageClass` ও `endUses`: বিদ্যমান product-use catalog-এ থাকলে শুধু explanatory metadata; এগুলো নিজেরা demand বা consumption তৈরি করে না।

Raw resource catalog-এ থাকা ID সর্বদা Raw Resource হিসেবে শ্রেণিবদ্ধ হবে। Factory output catalog-এর বাইরে থাকা legacy ID-কে জোর করে কোনো lane-এ ঢোকানো হবে না; সেটি unclassified থাকবে, যাতে ভুল শ্রেণিবিন্যাসে বাজারের পুরোনো order নষ্ট না হয়।

একটি output একাধিক recipe-তে থাকলে তার সব recipe/factory references রাখা হবে। Product role-এর display precedence হবে primary output, co-product, by-product, তারপর generic factory output। By-product market-এর factory-product class-এই থাকবে, কিন্তু তার role স্পষ্ট দেখাতে হবে; waste/residue-কে স্বয়ংক্রিয়ভাবে household demand বা profitable product ধরা যাবে না।

## ৩. Supply কোথা থেকে আসবে

### Raw Resource supply

`Site/Reserve → Extraction Batch → Raw Warehouse → Available Stock → Market Offer`

- Mine production event নিজে market stock নয়। পণ্য warehouse-এ বাস্তবে পৌঁছানোর পরেই বিক্রিযোগ্য supply হতে পারে।
- Inventory থেকে strategic reserve, factory reservation, already committed quantity এবং in-transit shipment বাদ দিয়ে free quantity নির্ধারণ করতে হবে।
- Source batch, site, country, owner এবং quantity lineage বজায় রাখতে হবে।
- Unknown owner বা missing batch authority থাকলে কোনো private company-র নামে stock দেখানো যাবে না।

### Factory Product supply

`Factory Inputs → Scheduled Production Cycle → Finished-Goods Batch → Processed Warehouse → Market Offer`

- Factory cycle সফলভাবে complete না হলে output market-এ আসবে না।
- `OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE` event এবং economy runtime-এর existing auto-offer publication হবে factory product supply-র entry path।
- Offer quantity processed warehouse-এর free stock, reserved stock, batch remaining quantity এবং in-transit shipment দেখে নির্ধারিত হবে।
- Offer-এর সঙ্গে factory ID, recipe, source batch IDs, created batch IDs, owner/operator attribution এবং price authority থাকবে।
- Production complete হওয়া মানে cash revenue নয়। বাজারে offer প্রকাশ হওয়া মানে settlement নয়।

## ৪. Demand কোথা থেকে আসবে

Market-এর demand কেবল evidence-backed source থেকে আসবে:

- বিদ্যমান import/buy request হলো executable বা negotiable bid।
- Domestic factory demand আসে recipe input requirements, actual factory schedules এবং বিদ্যমান consumption/demand runtime থেকে।
- Household বা national demand কেবল যখন সংশ্লিষ্ট demand runtime actual demand record প্রকাশ করে।
- Government procurement, private company procurement এবং international buyers আলাদা buyer identity/route হিসেবে থাকবে।
- একই factory input requirement-কে factory demand, import request এবং country demand—তিন জায়গায় যোগ করে triple-count করা যাবে না।
- Sector end-use description বা product catalog-এর usage note নিজে market demand নয়।

## ৫. Price discovery

প্রতিটি product ID-র জন্য নিজস্ব order book থাকবে; দুই lane একই clearing engine ব্যবহার করবে।

- **Bid:** buyer কত quantity এবং সর্বোচ্চ কত unit price দিতে রাজি।
- **Ask:** seller কত quantity এবং সর্বনিম্ন কত unit price-এ দিতে রাজি।
- দাম canonical FX runtime দিয়ে USD numeraire-এ normalize হবে; local currency display/settlement-এ ব্যবহৃত হবে।
- সর্বোচ্চ eligible bid যদি সর্বনিম্ন eligible ask-এর সমান বা বেশি হয়, orderbook crossing থেকে indicative clearing price, matched orderbook quantity, VWAP, spread ও volatility বের হবে।
- Bid/ask cross না করলে `NO_CROSS`; order না থাকলে `NO_ORDERS`; data অনুপস্থিত হলে `UNAVAILABLE` থাকবে।
- Resource catalog-এর base/reference price হলো reference signal; এটি executable seller offer নয়, order fill নয়, এবং completed transaction নয়।
- Factory product-এর জন্য observed quote না থাকলে raw-resource base price ধার করা যাবে না। Source-cost বা game-balance estimate থাকলে সেটি স্পষ্টভাবে simulated authority হিসেবে চিহ্নিত হবে; reference বা simulated quote কখনো observed clearing price সাজবে না।
- Quote ও historical market data decision support; actual delivered price এবং revenue settlement record থেকে আসবে।

## ৬. Orderbook crossing বনাম প্রকৃত trade

Market engine price discovery করে। এটি stock বা cash debit/credit করে না। Actual trade-এর authoritative flow:

`Buyer Request → Seller Review / Counter-offer → Approval → Stock & Ownership Validation → Reservation → Transport → Delivery → Payment Settlement → Fiscal / Company Ledger`

- Global Trade runtime country-to-country negotiation, sanctions, relation, agreement, route/blockade এবং export restriction যাচাই করবে।
- Batch/warehouse runtime stock consume বা transfer করবে। In-transit quantity নতুন offer-এ আবার ব্যবহার করা যাবে না।
- Finance/Trade settlement authority payment, tariff, tax, treasury এবং company cash journal লিখবে।
- Settlement ID ও existing idempotency keys replay/double posting ঠেকাবে।
- Orderbook-এর `matchedQuantity` কেবল price-discovery cross; UI-তে এটিকে sold quantity, received cargo বা cash revenue বলা যাবে না।

## ৭. Domestic ও international market

দুই product lane-ই domestic এবং international উভয় scope-এ কাজ করবে:

- Domestic buyer/seller একই দেশের factory, company, government buyer বা supplier হতে পারে। বিদ্যমান domestic sale/accounting path ব্যবহার করতে হবে।
- International buyer/seller country এবং প্রয়োজনে private company identity দিয়ে চিহ্নিত হবে।
- Export embargo, domestic-only supply directive, sanctions, route blockade ও capacity block সব ক্ষেত্রেই প্রযোজ্য।
- Supplier selection-এ শুধু headline price নয়: FX, freight, route time, insurance/risk, delivery reliability, relation এবং available quantity বিবেচ্য।
- Domestic stock strategic reserve বা already committed factory input হলে তা export-যোগ্য stock নয়।

## ৮. Company ও factory decision-এর সঙ্গে সংযোগ

Private এবং government factory runtime একই market data contract পড়বে। Company opportunity analysis-এ domestic unmet demand, confirmed buy-side depth, international unmatched bid depth, domestic output ও processed stock, competing sellers, recipe input availability, domestic-versus-import sourcing, utility/workforce readiness, operating/logistics/tax cost, price evidence quality এবং volatility একসঙ্গে বিশ্লেষণ করতে হবে।

Company proposal-এ market quote নয়, evidence source, market turn, matched quantity ও confidence দেখাতে হবে। Unobserved demand/price-কে zero বা নিশ্চিত revenue ধরা যাবে না।

## ৯. Market screen ও ব্যবহার

Resource Ministry-র Commodity Market panel-এ দুইটি section থাকবে:

- **Raw Resources:** ৪১টি canonical raw resource identity থেকে বর্তমানে যেগুলোর bid, ask বা reference-only stock আছে।
- **Factory Products:** catalog-এর recipe/processing output থেকে যেগুলোর bid বা actual inventory-backed offer আছে।

প্রতিটি item-এ product type/role, unit, clearing price, reference quote (থাকলে), best bid/ask, orderbook depth, indicative crossed quantity, market status এবং প্রযোজ্য হলে factory route দেখাতে হবে। Seller/buyer order preview-তে country, quantity ও quoted price থাকবে।

Trade request form-এ দুই lane-এর commodity বাছাই করা যাবে। Market screen orderbook দেখাবে; actual request, counterparty approval, route ও settlement আগের Trade workflow-তেই হবে। কোনো price বা stock evidence না থাকলে “Unavailable/Unobserved” দেখাতে হবে—সাজানো সংখ্যা নয়।

## ১০. Turn runtime, performance ও save integrity

- Global market rebuild একটি stable country/domain snapshot ব্যবহার করবে; প্রতিটি product-এর জন্য পুরো world state বারবার scan করা যাবে না।
- Rebuild turn-driven হবে; প্রতিটি country-এর সব factory-কে প্রতি frame-এ simulate করার প্রয়োজন নেই।
- Active country-এর detailed factory/resource runtime আগের active-country boundary মেনে চলবে; global market কেবল published orders/stock snapshots একত্র করবে।
- Orderbook, quote history, trade request, inventory reservation, shipment এবং settlement আলাদা authority-তে থাকবে।
- UI tab খোলা/বন্ধ করা market বা factory simulation চালাবে না; UI শুধু snapshot পড়বে।
- Save/load-এর পরে market projection rebuild করা যাবে, কিন্তু পুরোনো quote-কে নতুন turn-এর observed clearing হিসেবে ব্যবহার করা যাবে না।

## ১১. এই পরিবর্তনের implementation scope

এই পরিবর্তনে existing global market runtime-এ canonical two-tier taxonomy যোগ করা হয়েছে: raw resource identity Resource Ministry catalog থেকে, factory product identity industrial processing/recipe outputs থেকে আসবে। Market API-তে product description, complete product catalog এবং active raw/factory market lanes প্রকাশ করা হয়েছে। Commodity Market panel দুই lane আলাদা দেখায় এবং Trade request dropdown-এ দুই ধরনের পণ্য বেছে নেওয়া যায়।

বিদ্যমান offer publication, private ownership/batch checks, orderbook crossing, FX, strategic trade blocks এবং settlement runtime-কে প্রতিস্থাপন করা হয়নি। Market crossing এখনও settlement নয়। পরবর্তী functional expansion—যেমন direct market orders, bid/ask lifecycle, escrow, transport auction বা country-level consumption market—আলাদা অনুমোদিত scope ও tests ছাড়া এই পরিবর্তনের মধ্যে যোগ করা হবে না।

## ১২. সুবিধা ও সীমাবদ্ধতা

**সুবিধা:** কাঁচামাল ও processed output গুলিয়ে যাবে না; factory-এর output বাজারে দৃশ্যমান হবে; একই catalog identity ও ledger reuse হওয়ায় duplicate inventory/economy তৈরি হবে না; কোম্পানির factory proposal market evidence পড়তে পারবে; missing evidence স্পষ্ট থাকবে।

**সীমাবদ্ধতা:** সব factory product-এর জন্য প্রতিটি turn-এ bid/ask থাকবে না; no-order product বাজারে active listing হিসেবে দেখা নাও যেতে পারে। Simulated price authority থাকলে তা observed price নয়। Orderbook cross logistics, product quality, contract acceptance বা delivery-এর নিশ্চয়তা দেয় না। বাস্তব transaction-এর জন্য বিদ্যমান negotiation, reservation, transport ও settlement ধাপ সম্পূর্ণ হতে হবে।
