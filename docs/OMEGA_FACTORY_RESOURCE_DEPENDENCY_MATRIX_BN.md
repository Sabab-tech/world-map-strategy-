# OMEGA: ২১ কারখানার কাঁচামাল ও উৎপাদিত পণ্যের সংযোগ মানচিত্র

**পর্যালোচনার ভিত্তি:** `main`-এর `resource_industrial_catalog_v1.json`, canonical mine catalog, master registry, expanded site references এবং 2026-10-20 / 2026-10-24 mineplay batches।

## সিদ্ধান্ত

- গেমের ৪২টি canonical mineral/resource ID-র প্রতিটির জন্য explicit raw processing rule আছে। সব ৪২টি rule বর্তমানে `UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT` ব্যবহার করে।
- ২১টি canonical factory profile এবং ২২টি downstream production recipe আছে। Semiconductor কারখানার দুটি ধাপ (silicon wafer ও semiconductor/electronics) আলাদা recipe।
- ২২টি downstream recipe-তে ১১৪টি input reference আছে। প্রতিটি input হয় mineral processing output, অন্য factory-র output/by-product, সরাসরি mine resource, অথবা ঘোষিত external-sector input থেকে আসে। কোনো unregistered/orphan recipe input রাখা হয়নি।
- canonical 315 site, master 250, expanded 199 এবং দুই mineplay batch মিলিয়ে site ID deduplicate করার পর 351টি unique site reference পাওয়া যায়। ৪২টি resource-এর মধ্যে `silica_sand` ছাড়া বাকি ৪১টির অন্তত একটি resource-identified site reference আছে। চারটি “No Verified Commercial Mining Site” placeholder কোনো mineral supply নয়।
- `silica_sand`-এর জন্য domestic site record পাওয়া যায়নি। তাই এটিকে অন্য mineral দিয়ে প্রতিস্থাপন করা হয়নি; এটি এখন explicit **international import-only** source। settled/recorded import batch না থাকলে stock তৈরি হবে না এবং dependent production block থাকবে।
- `grain`, `vegetable_oil`, `sugar`, `cotton_fibre`, `wool_fibre` Agriculture / Livestock sector থেকে আসবে। এগুলো mineral mine হিসেবে গণ্য নয় এবং auto-generated stock পাবে না।
- কোনো factory type বা বিদ্যমান ৪২টি mineral resource ID সরানো হয়নি। এই audit-এ ২১টির কোনো factory-র উৎপাদন শৃঙ্খল অপ্রয়োজনীয় বা সম্পূর্ণ unproduced পাওয়া যায়নি।

## ১. Mine output → Universal Materials processing

প্রতিটি resource প্রথমে সংশ্লিষ্ট mine/site থেকে raw batch হিসেবে sovereign raw warehouse-এ আসে। Universal Materials factory-র ৪২টি processing rule raw material থেকে intermediate material/by-product তৈরি করে।

| Mine resource | Processing output-এ ব্যবহৃত প্রধান product |
|---|---|
| coal | `COAL_CONCENTRATE` |
| iron_ore | `IRON_CONCENTRATE` |
| copper | `COPPER_CONCENTRATE` |
| gold | `DORÉ` |
| silver | `SILVER_CONCENTRATE` |
| bauxite | `ALUMINA` |
| nickel | `NICKEL_CONCENTRATE` |
| cobalt | `COBALT_HYDROXIDE` |
| lithium | `LITHIUM_CARBONATE_OR_HYDROXIDE` |
| crude_oil | `NAPHTHA`, `OTHER_REFINERY_PRODUCTS`, diesel, gasoline, jet fuel |
| natural_gas | `PIPELINE_GAS`, `NGL` |
| uranium | `YELLOWCAKE` |
| phosphate | `PHOSPHATE_CONCENTRATE` |
| potash | `MOP_POTASH` |
| graphite | `GRAPHITE_CONCENTRATE` |
| manganese | `MANGANESE_CONCENTRATE` |
| chromite | `CHROMITE_CONCENTRATE` |
| zinc | `ZINC_CONCENTRATE` |
| tin | `TIN_CONCENTRATE` |
| tungsten | `TUNGSTEN_CONCENTRATE` |
| platinum | `PGM_CONCENTRATE` |
| diamond | `SORTED_DIAMONDS` |
| rare_earth | `RARE_EARTH_CONCENTRATE` |
| rutile | `UPGRADED_RUTILE` |
| ilmenite | `TITANIUM_FEED` |
| limestone | `CEMENT_FEED` |
| gypsum | `CALCINED_GYPSUM` |
| marble | `MARBLE_BLOCK` |
| granite | `GRANITE_BLOCK` |
| silica_sand | `GLASS_SILICA_FEED` (কেবল recorded import batch দিয়ে, যতক্ষণ domestic site record যোগ না হয়) |
| construction_aggregate | `GRADED_AGGREGATE` |
| basalt | `BASALT_AGGREGATE` |
| salt | `REFINED_SALT` |
| dolomite | `DOLOMITE_PRODUCT` |
| magnesite | `MAGNESIA` |
| oil_shale | `SHALE_OIL`, `SHALE_GAS` |
| boron | `BORIC_ACID_OR_BORAX` |
| niobium | `NIOBIUM_CONCENTRATE` |
| ruby | `SORTED_RUBY_ROUGH` |
| diatomite | `DIATOMITE_CONCENTRATE` |
| coral_aggregate | `CONSTRUCTION_AGGREGATE` |
| aragonite | `ARAGONITE_SAND` |

Processing yield-এ residue, tailings, dust ও loss-ও আলাদা output হিসেবে catalog-এ থাকে। এগুলো finished goods-এর সঙ্গে গুলিয়ে ফেলা যাবে না।

## ২. Downstream factory dependency map

| কারখানা | recipe-তে ব্যবহৃত input | input-এর উৎস / আগের ধাপ |
|---|---|---|
| Universal Materials & Elements | ৪২টি raw resource | সংশ্লিষ্ট দেশের mine/site batch; silica sand হলে recorded import batch |
| Steel & Alloy Works | iron concentrate, coal concentrate, cement feed, copper concentrate | iron ore, coal, limestone ও copper-এর Universal Materials output |
| Non-Ferrous Metal Smelter | copper concentrate, coal concentrate, cement feed, refined salt; aluminium route-এ alumina | copper, coal, limestone, salt ও bauxite processing |
| Petrochemical & Polymer Plant | naphtha, pipeline gas, refined salt, limestone | crude oil ও natural gas processing; salt processing; limestone mine batch |
| Fertilizer & Chemical Plant | pipeline gas, phosphate concentrate, MOP potash, refined salt | natural gas, phosphate, potash ও salt processing |
| Industrial Chemicals & Gas Plant | pipeline gas, refined salt, calcined gypsum, other refinery products, cement feed | natural gas, salt, gypsum, crude oil ও limestone processing |
| Cement & Concrete Plant | cement feed, calcined gypsum, graded aggregate, refined salt | limestone, gypsum, construction aggregate ও salt processing |
| Glass & Ceramics Plant | glass silica feed, calcined gypsum, magnesia, refined salt | silica sand processing (বর্তমানে import-only), gypsum, magnesite ও salt processing |
| Paper & Packaging Mill | recycled feedstock, polymer resin, refined salt | Recycling factory, Petrochemical factory ও salt processing |
| Food Processing & Cold Chain | grain, vegetable oil, sugar, packaging board, refined salt | প্রথম তিনটি Agriculture / Agriculture-and-Food; packaging board Paper factory; salt processing |
| Textile & Garment Mill | cotton fibre, wool fibre, polymer resin, industrial chemicals, packaging board | cotton Agriculture; wool Livestock/Agriculture; বাকি তিনটি Petrochemical, Industrial Chemicals ও Paper factories |
| Industrial Machinery & Machine Tools | steel, aluminium ingot, refined copper, semiconductor chips, polymer resin | Steel, Non-Ferrous Metal, Semiconductor ও Petrochemical factories |
| Grid Equipment Factory | refined copper, steel, aluminium ingot, electronic components, polymer resin | Non-Ferrous Metal, Steel, Semiconductor ও Petrochemical factories |
| Electronics & Semiconductor Fab | wafer route: glass silica feed, coal concentrate, industrial gases, refined salt; chip route: silicon wafers, refined copper, aluminium ingot, industrial gases, polymer resin, doré, refined salt | wafer route silica import, coal processing, Industrial Chemicals ও salt; chip route wafer output plus Non-Ferrous Metal, Industrial Chemicals, Petrochemical, gold processing ও salt |
| Battery & Energy Storage Plant | lithium compound, graphite concentrate, refined copper, aluminium ingot, polymer resin, industrial chemicals, industrial gases | lithium/graphite processing; Non-Ferrous Metal, Petrochemical ও Industrial Chemicals factories |
| Vehicle / Truck / Bus Assembly | steel, aluminium ingot, refined copper, flat glass, polymer resin, electronic components, machine tool parts | Steel, Non-Ferrous Metal, Glass, Petrochemical, Semiconductor ও Industrial Machinery factories |
| Ship & Rail Equipment Yard | steel, aluminium ingot, industrial machinery, grid equipment, refined copper, electronic components, polymer resin | Steel, Non-Ferrous Metal, Industrial Machinery, Grid Equipment, Semiconductor ও Petrochemical factories |
| Aerospace Equipment Plant | aluminium ingot, titanium feed, alloy steel, semiconductor chips, machine tool parts, composite materials, refined copper | Non-Ferrous Metal; ilmenite processing; Steel; Semiconductor; Industrial Machinery ও Non-Ferrous Metal |
| Pharma & Medical Supplies Plant | industrial solvents, industrial chemicals, container glass, polymer resin, packaging board, refined salt | Petrochemical, Industrial Chemicals, Glass, Paper ও salt processing |
| Defence Equipment Factory | steel, aluminium ingot, electronic components, industrial machinery, polymer resin, alloy steel, grid equipment | Steel, Non-Ferrous Metal, Semiconductor, Industrial Machinery, Petrochemical ও Grid Equipment |
| Recycling & Waste Processing Plant | metal scrap, e-waste, glass cullet, chemical process residue, plastic waste, processing loss | Machinery/Vehicle/Ship-Rail scrap; Semiconductor e-waste/loss; Glass cullet; Petrochemical/Fertilizer/Industrial Chemicals/semiconductor residue |

## ৩. External source policy

| Input | Source | Runtime policy |
|---|---|---|
| grain | Agriculture | recorded sector batch required; stock auto-generate নয় |
| vegetable_oil | Agriculture & Food | recorded sector batch required; stock auto-generate নয় |
| sugar | Agriculture & Food | recorded sector batch required; stock auto-generate নয় |
| cotton_fibre | Agriculture | recorded sector batch required; stock auto-generate নয় |
| wool_fibre | Livestock & Agriculture | recorded sector batch required; stock auto-generate নয় |
| silica_sand | International Trade | import-only until a domestic site is registered; recorded import batch required; stock auto-generate নয় |

Import entry-র জন্য existing country-inventory `importProduct()` transaction path ব্যবহার হবে। Import contract নিজে কোনো পরিমাণ তৈরি করে না; actual settled/recorded import transaction-ই warehouse batch যোগ করবে।

## ৪. Runtime connection এবং safety

- Factory recipe IDs, product IDs ও resource IDs catalog-এর canonical keys। case/format normalization ছাড়া আলাদা product identity তৈরি করা যাবে না।
- Processing output এবং downstream factory output একই processed-product warehouse/batch ledger-এ যায়। পরবর্তী factory কেবল delivered/available tracked batch থেকে input পাবে।
- Input transfer recipe coefficient অনুযায়ী; source batch identity/lineage রাখা হয়। প্রয়োজনীয় input-এর একটি অনুপস্থিত হলে cycle block হবে, অন্য input আংশিক debit করা হবে না।
- Factory output, coproduct, residue ও scrap আলাদা product ID এবং batch হিসেবে রাখা হবে। recycling-এর feedstock পূর্ববর্তী factory output থেকে আসে; কোনো stock কল্পনা করে যোগ করা যাবে না।
- Country scope ও inventory authority অপরিবর্তিত থাকবে। অন্য দেশের stock দিয়ে player country-র factory চালানো যাবে না, trade settlement/import ছাড়া।
- এই কাজের scope-এ electricity, water, utility allocation, operating cash cost বা cycle-time correction পরিবর্তন করা হয়নি; এগুলো আলাদা পরবর্তী কাজ।
- এই নথি supply topology বর্ণনা করে; mine availability, stock quantity, delivery বা factory commissioning হয়েছে এমন দাবি করে না। এগুলো runtime state ও transaction ledger দিয়ে আলাদাভাবে প্রমাণ করতে হবে।

## ৫. Regression coverage

`test/omega_resource_recipe_coverage.test.mjs` এখন canonical/master/expanded references এবং উভয় mineplay batch থেকে unique site resource types সংগ্রহ করে। catalog-এর কোনো resource-এর domestic site না থাকলে সেটির জন্য recorded, no-auto-generation external supply contract বাধ্যতামূলক করে। `silica_sand`-এর international import contract আলাদাভাবে পরীক্ষা করা হয়।

`test/omega_factory_production_baseline.test.mjs` বিদ্যমান ২১ profile, ৪২ processing rule, ২২ downstream recipe, ১১৪ input-reference producer coverage, dependency cycles, recipe coefficient balance, external recorded-batch contract এবং factory inventory batch lineage/atomic consumption regression পরীক্ষা করে।
