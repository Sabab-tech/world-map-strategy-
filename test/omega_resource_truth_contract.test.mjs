import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../omega_resource_truth_contract.js',import.meta.url),'utf8');
const context={console}; context.globalThis=context; vm.createContext(context); vm.runInContext(source,context);
const T=context.Omega.ResourceTruthContract;

assert.equal(T.VERSION,'1.0.0');
assert.equal(T.AUTHORITY.OBSERVED,'OBSERVED');
assert.ok(T.MEASUREMENT_BASIS.includes('MINERAL_RESERVE'));
assert.equal(T.compatibleUnit('gold','TROY_OUNCES'),true);
assert.equal(T.compatibleUnit('gold','TONNES'),true);
assert.equal(T.compatibleUnit('gold','BCM'),false);
assert.equal(T.basisCompatible('crude_oil','PETROLEUM_RESERVE','FIELD_RESOURCE'),true);
assert.equal(T.basisCompatible('gold','ORE_MASS','MINERAL_RESERVE'),false);

const resolved=T.resolveReserve('gold',{
 observed:[{value:100,unit:'TROY_OUNCES',measurementBasis:'MINERAL_RESERVE',authority:'OBSERVED',provenance:{sourceDatasetId:'resources.json',sourceRecordId:'SITE_A',sourceAuthority:'RESOURCE_JSON',effectiveDate:'2026-01-01'}}],
 modeled:[{value:90,unit:'TROY_OUNCES',measurementBasis:'MINERAL_RESERVE',authority:'MODELED'}],
 scenario:[{value:999,unit:'TROY_OUNCES',measurementBasis:'MINERAL_RESERVE',authority:'SIMULATED'}]
});
assert.equal(resolved.authoritative.authority,'OBSERVED');
assert.equal(resolved.authoritative.value,100);
assert.equal(resolved.scenario.value,999);

const missing=T.resolveReserve('gold',{scenario:[{value:999,unit:'TROY_OUNCES',measurementBasis:'MINERAL_RESERVE',authority:'SIMULATED'}]});
assert.equal(missing.authoritative,null);
assert.equal(missing.status,'UNOBSERVED');

const model=T.sanitizeSiteModel({
 commodityStreams:[{
  resourceId:'gold',
  reserve:{quantity:999,unit:'TROY_OUNCES',authority:'SIMULATED',basis:'MINERAL_RESERVE',scenarioRecord:true},
  production:{observedRate:null,activeRate:10,unit:'TROY_OUNCES'}
 }]
},{siteId:'SITE_A',countryId:'TST'});
assert.equal(model.commodityStreams[0].reserve.quantity,null);
assert.equal(model.commodityStreams[0].reserve.authority,'UNOBSERVED');
assert.equal(model.commodityStreams[0].reserve.scenario.value,999);
assert.equal(model.commodityStreams[0].production.currentProduction,null);
assert.equal(model.commodityStreams[0].production.simulationProduction,10);

const site=JSON.parse(fs.readFileSync(new URL('../resource_site_canonical_catalog_v1.json',import.meta.url),'utf8'));
const scenario=JSON.parse(fs.readFileSync(new URL('../resource_site_reserve_simulation_v1.json',import.meta.url),'utf8'));
assert.equal(site.siteCount,199);
assert.equal(site.sites.length,199);
assert.equal(scenario.siteCount,199);
assert.equal(scenario.records.length,199);
assert.ok(site.sites.every(x=>x.siteId&&x.identity?.countryIso3&&x.identity?.resourceTypeId&&x.siteName));

console.log('OMEGA RESOURCE TRUTH CONTRACT TEST PASSED');
console.log('Measurement basis: PASS');
console.log('Observed/Modeled/Simulated isolation: PASS');
console.log('Reserve precedence: PASS');
console.log('199-site identity boundary: PASS');
