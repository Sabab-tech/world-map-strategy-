import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../omega_resource_truth_contract.js',import.meta.url),'utf8');
const context={console};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source,context);

const T=context.Omega?.ResourceTruthContract;
assert.ok(T,'Resource Truth Contract did not register');

const expectError=(fn,message)=>{
  assert.throws(fn,new RegExp(message));
};

// Contract surface
assert.equal(T.VERSION,'1.0.0');
assert.deepEqual(Object.keys(T.AUTHORITY).sort(),['MODELED','OBSERVED','SIMULATED','UNOBSERVED']);
assert.ok(T.MEASUREMENT_BASIS.includes('ORE_MASS'));
assert.ok(T.MEASUREMENT_BASIS.includes('MINERAL_RESERVE'));
assert.ok(T.MEASUREMENT_BASIS.includes('PETROLEUM_RESERVE'));

// Unit semantics: precious metals may be represented as ore mass or contained commodity.
// Unit compatibility must not be mistaken for measurement-basis equivalence.
assert.equal(T.compatibleUnit('gold','TROY_OUNCES'),true);
assert.equal(T.compatibleUnit('gold','TONNES'),true);
assert.equal(T.compatibleUnit('gold','BCM'),false);
assert.equal(T.measurementCompatible('gold',{unit:'TONNES',measurementBasis:'ORE_MASS'}).ok,true);
assert.equal(T.measurementCompatible('gold',{unit:'TROY_OUNCES',measurementBasis:'CONTAINED_COMMODITY'}).ok,true);
assert.equal(T.measurementCompatible('gold',{unit:'BCM',measurementBasis:'ORE_MASS'}).ok,false);
assert.equal(T.measurementCompatible('gold',{unit:'TONNES',measurementBasis:'NOT_A_BASIS'}).ok,false);

// Measurement basis is semantic, not a unit conversion.
// Ore mass and mineral reserve are not interchangeable merely because both can use tonnes.
assert.equal(T.basisCompatible('gold','ORE_MASS','MINERAL_RESERVE'),false);
assert.equal(T.basisCompatible('crude_oil','PETROLEUM_RESERVE','FIELD_RESOURCE'),true);

// Authority precedence: observed wins over modeled and scenario when semantically compatible.
const observed={
  value:100,
  unit:'TROY_OUNCES',
  measurementBasis:'MINERAL_RESERVE',
  authority:'OBSERVED',
  provenance:{
    sourceDatasetId:'resources.json',
    sourceRecordId:'SITE_A',
    sourceAuthority:'RESOURCE_JSON',
    effectiveDate:'2026-01-01'
  }
};
const modeled={value:90,unit:'TROY_OUNCES',measurementBasis:'MINERAL_RESERVE',authority:'MODELED'};
const scenario={value:999,unit:'TROY_OUNCES',measurementBasis:'MINERAL_RESERVE',authority:'SIMULATED'};

const resolved=T.resolveReserve('gold',{observed:[observed],modeled:[modeled],scenario:[scenario]});
assert.equal(resolved.authoritative.authority,'OBSERVED');
assert.equal(resolved.authoritative.value,100);
assert.equal(resolved.scenario.value,999);
assert.equal(resolved.status,'AVAILABLE');

// Missing observed data must remain unobserved even when a scenario exists.
const missing=T.resolveReserve('gold',{scenario:[scenario]});
assert.equal(missing.authoritative,null);
assert.equal(missing.status,'UNOBSERVED');

// An incompatible observed record must fail closed instead of silently falling through
// to a modeled/scenario quantity.
const incompatibleObserved={
  value:100,
  unit:'BCM',
  measurementBasis:'ORE_MASS',
  authority:'OBSERVED',
  provenance:{sourceDatasetId:'resources.json',sourceRecordId:'SITE_BAD',sourceAuthority:'RESOURCE_JSON',effectiveDate:'2026-01-01'}
};
const failClosed=T.resolveReserve('gold',{observed:[incompatibleObserved],scenario:[scenario]});
assert.equal(failClosed.authoritative,null);
assert.equal(failClosed.status,'INCOMPATIBLE');
assert.equal(failClosed.scenario.value,999);

// Synthetic reserve and production must remain isolated from authoritative fields.
const model=T.sanitizeSiteModel({
  commodityStreams:[{
    resourceId:'gold',
    reserve:{
      quantity:999,
      unit:'TROY_OUNCES',
      authority:'SIMULATED',
      basis:'MINERAL_RESERVE',
      scenarioRecord:true
    },
    production:{
      observedRate:null,
      activeRate:10,
      unit:'TROY_OUNCES'
    }
  }]
},{siteId:'SITE_A',countryId:'TST'});

const stream=model.commodityStreams[0];
assert.equal(stream.reserve.quantity,null);
assert.equal(stream.reserve.authority,'UNOBSERVED');
assert.equal(stream.reserve.status,'UNOBSERVED');
assert.equal(stream.reserve.scenario.value,999);
assert.equal(stream.reserve.scenario.authority,'SIMULATED');
assert.equal(stream.production.currentProduction,null);
assert.equal(stream.production.currentProductionAuthority,'UNOBSERVED');
assert.equal(stream.production.simulationProduction,10);
assert.equal(stream.production.simulationProductionAuthority,'SIMULATED');

// Canonical site identity is mandatory and independent of site-name matching.
assert.deepEqual(T.siteIdentity({siteId:'SITE_A',countryId:'TST',resourceId:'gold'}),{
  ok:true,siteId:'SITE_A',countryId:'TST',resourceId:'gold'
});
assert.equal(T.siteIdentity({siteId:'SITE_A',countryId:'TST'}).ok,false);
assert.equal(T.siteIdentity({siteName:'Same Name',countryId:'TST',resourceId:'gold'}).ok,false);

// Synthetic provenance must never be presented as observed.
expectError(
  ()=>T.assertNoSyntheticAuthority({
    authority:'OBSERVED',
    simulationGenerated:true
  }),
  'RESOURCE_TRUTH_SYNTHETIC_MARKED_OBSERVED'
);
assert.equal(T.assertNoSyntheticAuthority({authority:'SIMULATED',provenance:{sourceAuthority:'SCENARIO_SIMULATION_DATA'}}),true);

// The immutable 199-site boundary remains intact. Scenario coverage is not treated as
// observed quantitative coverage.
const site=JSON.parse(fs.readFileSync(new URL('../resource_site_canonical_catalog_v1.json',import.meta.url),'utf8'));
const scenarioData=JSON.parse(fs.readFileSync(new URL('../resource_site_reserve_simulation_v1.json',import.meta.url),'utf8'));
assert.equal(site.siteCount,199);
assert.equal(site.sites.length,199);
assert.equal(scenarioData.siteCount,199);
assert.equal(scenarioData.records.length,199);
assert.ok(site.sites.every(x=>x.siteId&&x.identity?.countryIso3&&x.identity?.resourceTypeId&&x.siteName));
assert.ok(scenarioData.records.every(x=>x.siteId&&x.status==='SIMULATED'));
assert.equal(new Set(site.sites.map(x=>x.siteId)).size,199);
assert.equal(new Set(scenarioData.records.map(x=>x.siteId)).size,199);

console.log('OMEGA RESOURCE TRUTH CONTRACT TEST PASSED');
console.log('Authority boundary: PASS');
console.log('Measurement/unit semantics: PASS');
console.log('Reserve precedence + fail-closed behavior: PASS');
console.log('Simulation isolation: PASS');
console.log('199-site identity boundary: PASS');
