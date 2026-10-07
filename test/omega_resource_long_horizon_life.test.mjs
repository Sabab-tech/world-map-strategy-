import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const scenario=(()=>{const c=readFileSync('omega_resource_scenario_engineering_data_v1.js','utf8');const fn=new Function(c+';return globalThis.OmegaResourceScenarioEngineeringData;');return fn();})();
const reserve=JSON.parse(readFileSync('resource_site_reserve_simulation_v1.json','utf8'));

assert.equal(scenario.recordCount,199);
assert.equal(scenario.records.length,199);
assert.equal(scenario.gameplayLifePolicy.targetMinYears,300);
assert.equal(scenario.gameplayLifePolicy.targetMaxYears,500);
assert.equal(scenario.validation.commercialSiteCount,195);
assert.equal(scenario.validation.notApplicableSiteCount,4);

const reserveMap=new Map(reserve.records.map(x=>[x.siteId,x]));
const commercial=scenario.records.filter(x=>x.resourceId);
assert.equal(commercial.length,195);

const divergences=[];
for(const row of commercial){
  const rr=reserveMap.get(row.siteId);
  assert(rr,'missing reserve record '+row.siteId);
  const q=Number(rr.reserve.quantity),u=Number(row.utilization),m=Number(row.maintenance),d=Number(row.decline),life=Number(row.scenarioLifeYears);
  const active=row.nominalCapacity*u*(1-m)*(1-d);
  const implied=q/(active*365);
  if(Math.abs(implied-life)>Math.max(1,life*0.01))divergences.push({siteId:row.siteId,life,implied});
  assert(row.reserveConstraint?.formulaId==='OMEGA_RESERVE_CONSTRAINED_CAPACITY_LIFE_V1');
  assert.equal(row.reserveConstraint.reserveQuantity,q);
  assert.equal(row.reserveConstraint.targetLifeYears,life);
  assert.equal(row.nominalCapacity>0,true);
  assert.equal(row.minimumCapacity>0,true);
  assert.equal(row.maximumCapacity>=row.nominalCapacity,true);
  assert.equal(life>=300,true);
  assert.equal(life<=500,true);
}
assert.equal(divergences.length,0,JSON.stringify(divergences.slice(0,10)));

const nonCommercial=scenario.records.filter(x=>!x.resourceId);
assert.equal(nonCommercial.length,4);
assert(nonCommercial.every(x=>x.authority==='NOT_APPLICABLE'&&x.nominalCapacity===null&&x.minimumCapacity===null&&x.maximumCapacity===null&&x.scenarioLifeYears===null));

console.log(JSON.stringify({
 status:'PASS',
 commercialSites:commercial.length,
 notApplicableSites:nonCommercial.length,
 lifeMin:Math.min(...commercial.map(x=>x.scenarioLifeYears)),
 lifeMax:Math.max(...commercial.map(x=>x.scenarioLifeYears)),
 reserveLifeDivergences:divergences.length
}));
