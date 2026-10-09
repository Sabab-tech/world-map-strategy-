import assert from 'node:assert/strict';
import fs from 'node:fs';

const map=JSON.parse(fs.readFileSync(new URL('../resource_site_factory_route_map_v1.json',import.meta.url),'utf8'));
assert.equal(map.siteCount,199);
assert.equal(map.records.length,199);
assert.equal(map.commercialSiteCount,195);
assert.equal(map.nonCommercialSiteCount,4);
assert.equal(new Set(map.records.map(x=>x.siteId)).size,199,'each site has a unique route binding');
assert.equal(map.records.filter(x=>x.commercialExtraction).length,195);
assert.equal(map.records.filter(x=>!x.commercialExtraction).length,4);
for(const s of map.records){
 assert.ok(s.siteId&&s.countryId,'every row needs site and country identity');
 if(s.commercialExtraction){
  assert.ok(s.resourceId,'commercial site needs an exact resource ID: '+s.siteId);
  assert.equal(s.factoryBinding?.acceptedInputResourceId,s.resourceId,'factory input must match site resource: '+s.siteId);
  assert.equal(s.factoryBinding?.match,'FACTORY_RECIPE_INPUT_EXACT');
  assert.equal(s.factoryBinding?.factoryId,'RESOLVE_FROM_LIVE_GAME_STATE','no invented factory IDs');
  assert.ok(s.sourceNodeKey.includes(s.siteId),'source node must be site-specific');
  assert.equal(s.routeModel?.authority,'MODELED_GAMEPLAY');
  assert.equal(s.routeModel?.warDamageEnabled,true);
  assert.equal(s.routeModel?.navalBlockadeEnabled,true);
 }else{
  assert.equal(s.resourceId,null);
  assert.equal(s.factoryBinding,null,'non-commercial placeholders must not be executable');
 }
}
console.log('OMEGA 199-SITE SOURCE-TO-FACTORY MAP TEST PASSED');
console.log('Unique individual site bindings: 199/199; commercial mappings: 195; non-commercial placeholders blocked: 4.');
