import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('omega_resource_production_capacity_contract_v1.js','utf8'),context,{filename:'omega_resource_production_capacity_contract_v1.js'});
const C=context.Omega.ResourceProductionCapacityContract;
assert.equal(C.VERSION,'1.0.0');

// Runtime defaults are deterministic and explicitly simulated, not inserted into site data.
const simSite={siteId:'SITE_TEST_CAPACITY',countryId:'TST',resourceId:'copper'};
const simulatedA=C.resolveFactors(simSite,{authorityMode:'SIMULATED'});
const simulatedB=C.resolveFactors(simSite,{authorityMode:'SIMULATED'});
assert.deepEqual(JSON.parse(JSON.stringify(simulatedA)),JSON.parse(JSON.stringify(simulatedB)));
assert.equal(simulatedA.authority,'SIMULATED');
assert.equal(simulatedA.defaultsApplied,true);
for(const k of ['equipmentAvailability','powerAvailability','inputAvailability','technologyEfficiency']){
  assert.equal(typeof simulatedA[k],'number',k);
  assert.ok(simulatedA[k]>0&&simulatedA[k]<=1,k);
}

// Observed-rate sites receive neutral defaults when no factual operational factor exists.
const observedDefaults=C.resolveFactors({siteId:'SITE_OBSERVED',countryId:'TST'},{authorityMode:'OBSERVED'});
assert.equal(observedDefaults.equipmentAvailability,1);
assert.equal(observedDefaults.powerAvailability,1);
assert.equal(observedDefaults.inputAvailability,1);
assert.equal(observedDefaults.technologyEfficiency,1);
assert.equal(observedDefaults.statuses.equipment,'UNOBSERVED');

// Fraction and percentage input normalize consistently; an explicit zero remains zero.
const normalized=C.resolveFactors({
  siteId:'SITE_EXPLICIT_FACTORS',countryId:'TST',
  operationalFactors:{
    equipmentAvailability:90,
    powerAvailability:0,
    inputAvailability:0.8,
    technologyEfficiency:1.1
  }
},{authorityMode:'OBSERVED'});
assert.equal(normalized.equipmentAvailability,0.9);
assert.equal(normalized.powerAvailability,0);
assert.equal(normalized.inputAvailability,0.8);
assert.equal(normalized.technologyEfficiency,1.1);
assert.equal(normalized.availabilityMultiplier,0);

// Capacity-factor formula and time window use one authoritative calculator.
const factors={
  equipmentAvailability:0.9,powerAvailability:0.8,inputAvailability:0.95,technologyEfficiency:0.9,
  availabilityMultiplier:0.9*0.8*0.95*0.9,authority:'SIMULATED',
  statuses:{equipment:'SIMULATED',power:'SIMULATED',inputs:'SIMULATED',technology:'SIMULATED'},
  sources:{equipment:'test',power:'test',inputs:'test',technology:'test'}
};
const oneDay=C.calculate({
  capacity:1000,observedRate:null,factors,utilization:0.8,recovery:0.75,maintenance:0.1,decline:0.05,durationHours:24
});
const expected=1000*0.9*0.8*0.95*0.9*0.8*0.75*0.9*0.95;
assert.ok(Math.abs(oneDay.activeRate-expected)<1e-9);
assert.ok(Math.abs(oneDay.windowCapacity-oneDay.activeRate)<1e-9);
assert.equal(oneDay.formulaVersion,'OMEGA_EFFECTIVE_PRODUCTION_V1');
assert.equal(oneDay.trace.capacityRate,oneDay.activeRate);

const twoDays=C.calculate({
  capacity:1000,observedRate:null,factors,utilization:0.8,recovery:0.75,maintenance:0.1,decline:0.05,durationHours:48
});
assert.ok(Math.abs(twoDays.windowCapacity-oneDay.windowCapacity*2)<1e-9);

// Observed baseline is preserved when its neutral operational inputs are unknown.
const observedRate=C.calculate({
  capacity:1000,observedRate:500,factors:observedDefaults,capacityIsExplicit:true,
  utilization:0.8,recovery:0.7,maintenance:0.1,decline:0.03,durationHours:24
});
assert.equal(observedRate.activeRate,500);
assert.equal(observedRate.calculationMode,'OBSERVED_BASELINE_WITH_OPERATIONAL_FACTORS');

// Explicit power failure constrains both simulated and observed modeled output to zero.
const noPower=C.calculate({capacity:1000,observedRate:null,factors:normalized,utilization:1,recovery:1,maintenance:0,decline:0});
assert.equal(noPower.activeRate,0);
assert.equal(noPower.status,'BLOCKED');

const original=JSON.stringify(simSite);
C.resolveFactors(simSite,{authorityMode:'SIMULATED'});
assert.equal(JSON.stringify(simSite),original,'runtime factor defaults must not mutate or generate site data');

console.log('OMEGA RESOURCE PRODUCTION CAPACITY CONTRACT V1 TEST PASSED');
