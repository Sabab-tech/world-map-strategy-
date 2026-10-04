import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const load=name=>JSON.parse(readFileSync(name,'utf8'));
const catalog=load('resource_site_canonical_catalog_v1.json');
const data=load('resource_site_reserve_simulation_v1.json');
assert.equal(catalog.siteCount,199);
assert.equal(data.siteCount,199);
const a=new Map(catalog.sites.map(s=>[s.siteId,s]));
const b=new Map(data.records.map(s=>[s.siteId,s]));
assert.equal(a.size,199);
assert.equal(b.size,199);
for(const [id,s] of a){
 const r=b.get(id);assert(r,id);
 assert.equal(r.countryId,s.countryId);
 assert.equal(r.resourceId,String(s.identity?.resourceTypeId||''));
 assert.equal(r.siteName,s.siteName);
 if(s.operation?.commercialExtraction===false||s.identity?.siteType==='NO_COMMERCIAL_EXTRACTION'){
   assert.equal(r.reserve.status,'NOT_APPLICABLE');
 }else{
   assert.equal(r.reserve.status,'SIMULATED');
   assert.ok(Number.isFinite(r.reserve.quantity)&&r.reserve.quantity>0);
   assert.ok(typeof r.reserve.unit==='string'&&r.reserve.unit.length>0);
 }
}
console.log('OMEGA PER-SITE RESERVE DATA CERTIFICATE PASSED');
