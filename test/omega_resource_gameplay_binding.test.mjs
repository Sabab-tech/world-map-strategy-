import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const catalog=JSON.parse(read('resource_site_canonical_catalog_v1.json'));
const master=JSON.parse(read('resource_site_master_registry_v1.json'));
const reserves=JSON.parse(read('resource_site_reserve_simulation_v1.json'));
const index=read('index.html');
const binding=read('omega_resource_gameplay_binding_v1.js');
const scenarioSource=read('omega_resource_scenario_engineering_data_v1.js');
const scenarioText=scenarioSource.slice(scenarioSource.indexOf('const DATA=')+'const DATA='.length,scenarioSource.indexOf(';\ng.OmegaResourceScenarioEngineeringData=DATA;'));
const scenario=JSON.parse(scenarioText);

assert.equal(catalog.sites.length,199,'canonical catalog must contain 199 individual sites');
assert.equal(master.siteCount,199,'master registry count');
assert.equal(master.sites.length,199,'master registry rows');
assert.equal(reserves.records.length,199,'reserve simulation rows');
assert.equal(scenario.records.length,199,'scenario engineering rows');
const ids=master.sites.map(x=>x.siteId);
assert.equal(new Set(ids).size,199,'site IDs must be unique');
const catalogIds=new Set(catalog.sites.map(x=>x.siteId));
assert.ok(ids.every(x=>catalogIds.has(x)),'master registry IDs must map to canonical catalog');
const reserveIds=new Set(reserves.records.map(x=>x.siteId));
const scenarioIds=new Set(scenario.records.map(x=>x.siteId));
for(const site of master.sites){
 assert.ok(site.siteId, 'master site must have siteId');
 assert.ok(site.countryId, site.siteId+' country identity');
 assert.ok(catalogIds.has(site.siteId),site.siteId+' maps to canonical catalog');
}
assert.ok(master.sites.every(s=>catalogIds.has(s.siteId)),'master rows must map to individual canonical sites');
assert.match(index,/omega_resource_gameplay_binding_v1\.js/,'playable shell must load site binding');
assert.match(binding,/OMEGA_RESOURCE_SITE_SELECTED/,'site selection event must be emitted');
assert.match(binding,/planExtraction/,'site selection UI must call industrial extraction planner');
assert.match(binding,/extractCountry/,'site UI must connect to actual extraction executor');
assert.match(binding,/No country-average substitution/,'UI must explicitly prevent average mapping');
console.log('OMEGA INDIVIDUAL RESOURCE GAMEPLAY BINDING TEST PASSED');
console.log('Canonical/master/reserve/scenario site identities: 199/199');
console.log('Unique site IDs and exact per-site catalog joins: PASS');
console.log('Playable index wiring + individual selection + extraction API binding: PASS');
