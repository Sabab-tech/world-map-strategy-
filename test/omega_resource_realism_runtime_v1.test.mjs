import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

function load(path,context){
  new Script(readFileSync(path,'utf8'),{filename:path}).runInContext(context);
}
const context=createContext({console,globalThis:null});
context.globalThis=context;

load('omega_resource_realism_runtime_v1.js',context);
const R=context.Omega.ResourceRealism;
assert.equal(R.VERSION,'1.2.0');

// Priority 3: separate unit families.
assert.equal(R.parseReserve('120 million BBL','crude_oil').unitFamily,'BBL');
assert.equal(R.parseReserve('4.2 trillion TCF','natural_gas').unitFamily,'GAS');
const goldReserveSemantics=R.parseReserve('2.5 million oz','gold');
assert.equal(goldReserveSemantics.unitFamily,'GOLD');
assert.equal(goldReserveSemantics.unit,'TROY_OUNCES');
assert.equal(R.parseReserve('18 million tonnes','copper').unitFamily,'TONNES');
assert.equal(R.unitFamily('API'),'API');
assert.equal(R.unitFamily('g/t'),'GT');
assert.equal(R.unitFamily('mg/L'),'MG_L');
assert.equal(R.unitFamily('%'),'PERCENT');

// Priority 4: grade, purity and petroleum API are independent semantics.
const q=R.quality({
  grade:'1.4%',
  oreGrade:'1.4%',
  concentration:'14,000 ppm',
  assay:'LAB-2026-001',
  metalContent:'0.014',
  purity:'99.95%',
  APIGravity:38.5
},'copper');
assert.equal(q.grade,'1.4%');
assert.equal(q.oreGrade,'1.4%');
assert.equal(q.assay,'LAB-2026-001');
assert.equal(q.purity,'99.95%');
assert.equal(q.APIGravity,38.5);
assert.equal(q.gradeStatus,'OBSERVED');
assert.equal(q.purityStatus,'OBSERVED');

// Priority 5: multi-commodity reserve strings must separate by named commodity context.
const multi='Grasberg: 20 million tonnes copper; 1.8 million oz gold';
const split=R.splitCommodities({reserves:multi},['copper','gold']);
assert.equal(split.length,2);
assert.equal(R.parseReserve(split.find(x=>x.resourceId==='copper').reserves,'copper').value,20000000);
assert.equal(R.parseReserve(split.find(x=>x.resourceId==='gold').reserves,'gold').value,1800000);

// Priority 1 + 2: normalized site model replaces site->hash->fixed daily rate.
const site=R.siteModel({siteReferenceKey:'SITE:IND:01',siteName:'Demo Copper Mine'},{
  resource_domain:{knownResourceTypes:['copper']},
  mineral_resource_base:{}
},'IND');
assert.equal(site.stateAuthority,'SIMULATED');
const stream=site.commodityStreams[0];
for(const k of ['nominalCapacity','minimumCapacity','maximumCapacity','utilization','recovery','decline','maintenance','activeRate']){
  assert.equal(typeof stream.production[k],'number',k);
}
assert.equal(stream.production.authority,'SIMULATED');
assert.equal(stream.reserve.authority,'SIMULATED');
assert.equal(typeof stream.quality.grade,'number');
assert.ok(stream.reserve.quantity>0);
assert.notEqual(stream.production.activeRate,1000);

const observedSite=R.siteModel({
  siteReferenceKey:'SITE:OBS:01',siteName:'Observed Multi Commodity',
  commodities:[
    {resourceId:'copper',reservesQuantity:2000000,grade:'1.8%',productionRate:900,utilization:0.8},
    {resourceId:'gold',reservesQuantity:120000,grade:'4.2 g/t',productionRate:600}
  ],
  productionModel:{maintenance:0.05,recovery:0.9}
},{} ,'OBS');
assert.equal(observedSite.commodityStreams.length,2);
assert.equal(observedSite.commodityStreams[0].reserve.authority,'OBSERVED');
assert.equal(observedSite.commodityStreams[0].production.authority,'OBSERVED');
assert.equal(observedSite.commodityStreams[0].production.activeRate,900);
assert.equal(observedSite.commodityStreams[1].reserve.quantity,120000);
assert.equal(observedSite.commodityStreams[1].production.activeRate,600);

const researchedSite=R.siteModel({
  siteReferenceKey:'SITE:RESEARCH:01',
  siteName:'Researched Copper Site',
  resourceId:'copper',
  quantitativeResearch:{
    reserve:{status:'OBSERVED',value:{quantity:2000000,unit:'TONNES'}},
    production:{status:'OBSERVED',value:{rate:750}},
    capacity:{status:'OBSERVED',value:{minimumCapacity:400,maximumCapacity:1000}},
    recovery:{status:'OBSERVED',value:0.92}
  },
  researchOperatingCost:{status:'OBSERVED',currency:'USD',unit:'USD_PER_TONNE_CONCENTRATE',value:42.5,basis:'SITE_SPECIFIC_OWNER_FEASIBILITY_EVIDENCE'}
},{resource_domain:{knownResourceTypes:['copper']}},'RES');
assert.equal(researchedSite.commodityStreams[0].reserve.authority,'OBSERVED');
assert.equal(researchedSite.commodityStreams[0].reserve.quantity,2000000);
assert.equal(researchedSite.commodityStreams[0].production.authority,'OBSERVED');
assert.equal(researchedSite.commodityStreams[0].production.activeRate,750);
assert.equal(researchedSite.commodityStreams[0].production.minimumCapacity,400);
assert.equal(researchedSite.commodityStreams[0].production.maximumCapacity,1000);
assert.equal(researchedSite.commodityStreams[0].production.recovery,0.92);
assert.equal(researchedSite.commodityStreams[0].production.operatingCost,42.5);


const researchedObservedCost=R.siteModel({
  siteReferenceKey:'SITE:GNB:FARIM',
  siteName:'Farim Phosphate Project',
  resourceId:'phosphate',
  researchOperatingCost:{
    status:'OBSERVED',
    currency:'USD',
    unit:'USD_PER_TONNE_CONCENTRATE',
    value:70.9,
    basis:'SITE_SPECIFIC_OWNER_FEASIBILITY_EVIDENCE'
  }
},{resource_domain:{knownResourceTypes:['phosphate']}},'GNB');
assert.equal(researchedObservedCost.commodityStreams[0].production.operatingCost,70.9);
assert.equal(researchedObservedCost.commodityStreams[0].production.operatingCostStatus,'OBSERVED');
assert.equal(researchedObservedCost.commodityStreams[0].production.operatingCostUnit,'USD_PER_TONNE_CONCENTRATE');

const researchedModeledCost=R.siteModel({
  siteReferenceKey:'SITE:GNB:MODELED',
  siteName:'Modeled Phosphate Site',
  resourceId:'phosphate',
  researchOperatingCost:{
    status:'MODELED',
    currency:'USD',
    unit:'USD_PER_OUTPUT_UNIT',
    value:null,
    basis:'SITE_SPECIFIC_DRIVER_MODEL',
    model:{formulaId:'OMEGA_SITE_DRIVER_COST_V1',numericValueIncluded:false}
  }
},{resource_domain:{knownResourceTypes:['phosphate']}},'GNB');
assert.equal(researchedModeledCost.commodityStreams[0].production.operatingCost,null);
assert.equal(researchedModeledCost.commodityStreams[0].production.operatingCostStatus,'MODELED');
assert.equal(researchedModeledCost.commodityStreams[0].production.operatingCostDataset,null);

const gasQuality=R.quality({grade:'96.2% Pure Methane Gas'},'natural_gas');
assert.equal(gasQuality.grade,'96.2% Pure Methane Gas');
assert.equal(gasQuality.gradeStatus,'OBSERVED');
assert.equal(gasQuality.concentrationStatus,'OBSERVED');
assert.equal(gasQuality.normalized.concentrationPercent,96.2);
assert.equal(gasQuality.purity,null);

// Priority 7: authority firewall never allows simulation to overwrite observed state.
const observed={value:100,stateAuthority:'OBSERVED',authority:'OBSERVED'};
const simulated={value:50,stateAuthority:'SIMULATED',authority:'SIMULATED'};
assert.deepEqual(R.firewall(observed,simulated),observed);
assert.deepEqual(R.firewall(undefined,simulated),simulated);
const mixed=R.firewall({reserve:100,reserveAuthority:'OBSERVED',stateAuthority:'OBSERVED'},{reserve:50,productionModel:{activeRate:5},stateAuthority:'SIMULATED'});
assert.equal(mixed.reserve,100);
assert.equal(mixed.productionModel.activeRate,5);

// Priority 6: logistics route carries mode, route, capacity, cost, time and delivery.
const route=R.planRoute({
  sourceNode:'WH-BGD-RAW',
  destinationNode:'FACTORY-BGD-01',
  resourceId:'iron_ore',
  quantity:10000,
  unit:'metric_tons',
  mode:'rail'
});
for(const k of ['transportMode','routeId','capacity','costEstimate','travelTimeDays','deliveryStatus'])assert.ok(route[k]!==undefined,k);
assert.equal(route.transportMode,'rail');
assert.ok(route.dispatchQuantity>0);

const temporalBase={
  nominalCapacity:1000,
  minimumCapacity:300,
  maximumCapacity:1200,
  utilization:0.8,
  recovery:0.9,
  decline:0.08,
  maintenance:0.05
};
const t0=R.advanceProductionState(temporalBase,{startTurn:0,initialRecoverableQuantity:1000000},{
  residualQuantity:1000000,
  recoverableQuantity:1000000,
  operationalStatus:'ACTIVE_EXTRACTION'
},0,24);
const t1=R.advanceProductionState(temporalBase,t0.state,{
  residualQuantity:900000,
  recoverableQuantity:1000000,
  operationalStatus:'ACTIVE_EXTRACTION'
},8760,24);
assert.equal(t0.activeRate>0,true);
assert.equal(t1.activeRate<t0.activeRate,true,'temporal decline/depletion must reduce rate');
assert.equal(t1.state.elapsedYears>0,true);
assert.equal(t1.state.lastTurn,8760);

const shutdown=R.advanceProductionState(temporalBase,t1.state,{
  residualQuantity:900000,
  recoverableQuantity:1000000,
  operationalStatus:'SHUTDOWN'
},8761,24);
assert.equal(shutdown.activeRate,0,'shutdown must stop extraction rate');


console.log('OMEGA RESOURCE REALISM V1 TEST PASSED');
