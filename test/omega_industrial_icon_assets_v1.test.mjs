import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
const root=process.cwd();
const assetRoot=path.join(root,"assets/omega-industrial-icons-v1");
const catalog=JSON.parse(fs.readFileSync(path.join(root,"resource_industrial_catalog_v1.json"),"utf8"));
const manifest=JSON.parse(fs.readFileSync(path.join(assetRoot,"manifest.json"),"utf8"));
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
function readSvg(rel,id,label){
 const file=path.join(assetRoot,rel);assert.ok(fs.existsSync(file),id+" SVG file must exist");
 const src=fs.readFileSync(file,"utf8");assert.match(src,/^\uFEFF?\s*(?:<\?xml[^>]*>\s*)?<svg\b/,id+" needs SVG root");assert.match(src,/<\/svg>\s*$/,id+" needs closing SVG tag");
 assert.match(src,/viewBox="0 0 128 128"/,id+" needs consistent viewBox");assert.match(src,/aria-labelledby=/,id+" needs accessible title/description");
 assert.ok(src.includes(">"+esc(label)+"</title>"),id+" title must match canonical label");
 assert.doesNotMatch(src,/(?:href|src)=["']https?:\/\//i,id+" must not load remote content");
 const ids=[...src.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,id+" contains duplicate SVG IDs");
 const refs=[...src.matchAll(/url\(#([^)]+)\)/g)].map(m=>m[1]);refs.forEach(r=>assert.ok(ids.includes(r),id+" references absent SVG definition "+r));
 return src;
}
test("manifest exactly covers canonical resource and factory catalogs",()=>{
 assert.equal(manifest.summary.resourceIconCount,42);assert.equal(manifest.summary.factoryIconCount,21);assert.equal(manifest.summary.totalIconCount,63);assert.equal(manifest.summary.legacyFactoryIconCount,39);assert.equal(manifest.summary.integratedIntoRuntime,true,"resource SVGs are integrated into the Resource Ministry UI");
 assert.deepEqual(manifest.resources.map(x=>x.id).sort(),Object.keys(catalog.resourceRules).sort());
 assert.deepEqual(manifest.factories.map(x=>x.id).sort(),Object.keys(catalog.factoryProfiles).sort());
});
test("each resource has a unique offline and accessible SVG",()=>{
 const seen=new Set();for(const o of manifest.resources){assert.ok(o.label&&o.color&&o.file);assert.ok(!seen.has(o.file));seen.add(o.file);readSvg(o.file,o.id,o.label);}
 assert.match(fs.readFileSync(path.join(assetRoot,"resources/gold.svg"),"utf8"),/>GOLD<\/text>/,"gold needs central GOLD stamp");
 assert.match(fs.readFileSync(path.join(assetRoot,"resources/silver.svg"),"utf8"),/>SILVER<\/text>/,"silver needs central SILVER stamp");
});
test("all 21 canonical factory types have unique SVG source scenes",()=>{
  const files=new Set(),scenes=new Set();for(const o of manifest.factories){assert.ok(o.label&&o.category&&o.color&&o.file);assert.ok(!files.has(o.file));files.add(o.file);scenes.add(readSvg(o.file,o.id,o.label));}
  assert.equal(files.size,21);assert.equal(scenes.size,21,"canonical factory SVG scene source must be unique");
});
test("merged mineral factory aliases remain available as legacy assets",()=>{
  assert.equal(manifest.legacyFactories.length,39);
  assert.deepEqual(manifest.legacyFactories.map(x=>x.id).sort(),Object.keys(catalog.factoryTypeAliases).sort());
  for(const row of manifest.legacyFactories){
    assert.equal(row.canonicalFactoryType,"UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT",row.id+" must point to the universal materials plant");
    assert.equal(catalog.factoryTypeAliases[row.id],"UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT");
    assert.ok(fs.existsSync(path.join(assetRoot,row.file)),row.id+" legacy SVG file must be preserved");
  }
});
test("preview gallery is complete and independent of game runtime",()=>{
 const html=fs.readFileSync(path.join(assetRoot,"index.html"),"utf8");for(const o of [...manifest.resources,...manifest.factories])assert.ok(html.includes("./"+o.file),o.id+" missing preview card");
 assert.doesNotMatch(html,/omega_factory_visual_catalog_v1\.js|omega_icon_system_v1\.js|<script[^>]+src=/,"preview must be standalone");
});

test("active factory icons use a type-specific focal motif instead of a repeated generic factory block",()=>{
 const expected={
  "AEROSPACE_EQUIPMENT_PLANT": "aircraft",
  "BATTERY_ENERGY_STORAGE_PLANT": "battery",
  "CEMENT_CONCRETE_PLANT": "cement-sack",
  "DEFENSE_EQUIPMENT_FACTORY": "armored-vehicle",
  "ELECTRONICS_SEMICONDUCTOR_FAB": "microchip",
  "FERTILIZER_CHEMICAL_PLANT": "fertilizer-sprout",
  "FOOD_PROCESSING_COLD_CHAIN": "grain-and-food-jar",
  "GLASS_CERAMICS_PLANT": "glassware-and-ceramic",
  "GRID_EQUIPMENT_FACTORY": "power-transmission",
  "INDUSTRIAL_CHEMICALS_GAS_PLANT": "gas-cylinders-and-flask",
  "INDUSTRIAL_MACHINERY_MACHINE_TOOLS": "gear-and-wrench",
  "NON_FERROUS_METAL_SMELTER": "molten-metal-crucible",
  "PAPER_PACKAGING_MILL": "paper-roll-and-carton",
  "PETROCHEMICAL_POLYMER_PLANT": "laboratory-flask-and-polymer-molecule",
  "PHARMA_MEDICAL_SUPPLIES_PLANT": "capsule-tablet-and-cross",
  "RECYCLING_WASTE_PROCESSING_PLANT": "recycling-arrows-and-bin",
  "SHIP_RAIL_EQUIPMENT_YARD": "cargo-ship-and-rail-wheel",
  "STEEL_AND_ALLOY_WORKS": "steel-beam-and-ingot",
  "TEXTILE_GARMENT_MILL": "thread-spool-and-shirt",
  "UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT": "mineral-crystals-and-sample-vials",
  "VEHICLE_TRUCK_BUS_ASSEMBLY": "car-and-robotic-assembly-arm"
};
 assert.deepEqual(Object.keys(expected).sort(),manifest.factories.map(x=>x.id).sort());
 for(const row of manifest.factories){const src=fs.readFileSync(path.join(assetRoot,row.file),"utf8");assert.match(src,new RegExp('data-omega-icon-motif="'+expected[row.id]+'"'),row.id+" needs its semantic focal motif");}
});
test("canonical gallery groups only the 21 active factory icons with thin category dividers",()=>{
 const html=fs.readFileSync(path.join(assetRoot,"index.html"),"utf8");
 assert.match(html,/21 canonical factory types/);
 assert.equal((html.match(/<article class="tile" data-kind="factory"/g)||[]).length,21);
 assert.match(html,/class="factory-category-divider"/);
 assert.doesNotMatch(html,/35 canonical factory types/);
});


test("mine and warehouse logistics nodes are registered as separate offline SVG assets",()=>{
 const files=manifest.logisticsNodeAssets;
 assert.deepEqual(files.map(x=>x.id),["mine-site","warehouse-node"]);
 assert.equal(files[0].file,"logistics/mine-site.svg");
 assert.equal(files[1].file,"logistics/warehouse-node.svg");
 readSvg(files[0].file,files[0].id,files[0].label);
 readSvg(files[1].file,files[1].id,files[1].label);
 const offline=fs.readFileSync(path.join(root,"omega-offline-map-sw.js"),"utf8");
 for(const row of files)assert.ok(offline.includes('"./assets/omega-industrial-icons-v1/'+row.file+'"'),row.id+" must be precached for offline launch");
 assert.equal(manifest.summary.resourceIconCount,42);
 assert.equal(manifest.summary.factoryIconCount,21);
 assert.equal(manifest.summary.totalIconCount,63,"logistics nodes do not change the canonical resource/factory totals");
});


test("cargo-specific transport variants cover truck, rail, ship and barge models offline",()=>{
 const variants=manifest.transportVariants;
 assert.ok(Array.isArray(variants),"the canonical icon manifest must register transport variants");
 assert.equal(variants.length,20);
 assert.equal(manifest.summary.transportVariantIconCount,20);
 assert.equal(manifest.summary.totalTransportVariantIconCount,20);
 assert.deepEqual(manifest.summary.transportVariantsByMode,{truck:5,rail:5,ship:5,barge:5});
 const ids=new Set(),files=new Set(),modeCounts={};
 for(const row of variants){
  assert.ok(row.id&&row.label&&row.assetId&&row.transportMode&&row.cargoClass&&row.file);
  assert.match(row.file,/^transport\/variants\/[a-z0-9-]+\.svg$/);
  assert.ok(["truck","rail","ship","barge"].includes(row.transportMode));
  assert.ok(["dry_bulk","liquid","gas","ore","general_cargo"].includes(row.cargoClass));
  assert.equal(ids.has(row.id),false,"transport variant IDs must be unique");
  assert.equal(files.has(row.file),false,"transport variant paths must be unique");
  ids.add(row.id);files.add(row.file);
  modeCounts[row.transportMode]=(modeCounts[row.transportMode]||0)+1;
  const src=readSvg(row.file,row.id,row.label);
  assert.match(src,/data-omega-icon-kind="transport"/,row.id+" must identify itself as a transport asset");
 }
 assert.equal(ids.size,20);
 assert.equal(files.size,20);
 assert.deepEqual(modeCounts,{barge:5,ship:5,rail:5,truck:5});
 const offline=fs.readFileSync(path.join(root,"omega-offline-map-sw.js"),"utf8");
 assert.match(offline,/omega-offline-atlas-shell-v67/);
 assert.ok(offline.includes("factoryIconManifest.transportVariants"),"variant SVGs must be precached from the manifest");
});
