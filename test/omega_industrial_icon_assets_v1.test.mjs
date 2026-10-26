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
 const src=fs.readFileSync(file,"utf8");assert.match(src,/^\s*<svg\b/,id+" needs SVG root");assert.match(src,/<\/svg>\s*$/,id+" needs closing SVG tag");
 assert.match(src,/viewBox="0 0 128 128"/,id+" needs consistent viewBox");assert.match(src,/aria-labelledby=/,id+" needs accessible title/description");
 assert.ok(src.includes(">"+esc(label)+"</title>"),id+" title must match canonical label");
 assert.doesNotMatch(src,/(?:href|src)=["']https?:\/\//i,id+" must not load remote content");
 const ids=[...src.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,id+" contains duplicate SVG IDs");
 const refs=[...src.matchAll(/url\(#([^)]+)\)/g)].map(m=>m[1]);refs.forEach(r=>assert.ok(ids.includes(r),id+" references absent SVG definition "+r));
 return src;
}
test("manifest exactly covers canonical resource and factory catalogs",()=>{
 assert.equal(manifest.summary.resourceIconCount,42);assert.equal(manifest.summary.factoryIconCount,21);assert.equal(manifest.summary.totalIconCount,63);assert.equal(manifest.summary.legacyFactoryIconCount,39);assert.equal(manifest.summary.integratedIntoRuntime,false);
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
