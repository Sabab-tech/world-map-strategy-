import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

function load(path,context){
  new Script(readFileSync(path,'utf8'),{filename:path}).runInContext(context);
}
const context=createContext({console,globalThis:null});
context.globalThis=context;

load('omega_resource_production_capacity_contract_v1.js',context);
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

// Real numeric fields from the 65-site expansion remain scenario data, not falsely observed facts.
const legacyGameplaySite=R.siteModel({
  siteId:'SITE_TEST_legacy_iron_ore',
  siteReferenceKey:'SITE_TEST_legacy_iron_ore',
  siteName:'Legacy Gameplay Iron Ore Site',
  resourceId:'iron_ore',
  siteType:'IRON_ORE_SITE',
  simulationReserveQuantity:900000000000,
  simulationReserveUnit:'TONNES_ORE',
  productionRate:40000,
  dailyRate:40000,
  grade:42.5,
  purity:64.2,
  quantitativeProvenance:{authority:'SCENARIO_SIMULATION_DATA'},
  productionModel:{
    productionRate:40000,activeRate:40000,nominalCapacity:50000,
    minimumCapacity:32000,maximumCapacity:65000,annualProduction:{value:14600000,unit:'TONNES_PER_YEAR'},
    utilization:0.8,recovery:0.86,maintenance:0.03,decline:0.01,
    authority:'SIMULATED',stateAuthority:'SIMULATED',dataStatus:'SIMULATED'
  },
  quantitativeProfile:{
    grade:{value:42.5,unit:'PERCENT_FE',status:'SIMULATED'},
    purity:{value:64.2,unit:'PERCENT',status:'SIMULATED'}
  }
},{resource_domain:{knownResourceTypes:['iron_ore']},mineral_resource_base:{}},'TST');
const legacyStream=legacyGameplaySite.commodityStreams[0];
assert.equal(legacyStream.reserve.quantity,900000000000);
assert.equal(legacyStream.reserve.unit,'TONNES_ORE');
assert.equal(legacyStream.reserve.authority,'SIMULATED');
assert.equal(legacyStream.production.authority,'SIMULATED');
assert.equal(legacyStream.production.rangeDataStatus,'SIMULATED');
assert.equal(legacyStream.quality.gradeStatus,'SIMULATED');
assert.equal(legacyStream.quality.purityStatus,'SIMULATED');
assert.equal(legacyStream.quality.grade,42.5);
assert.equal(legacyStream.quality.purity,64.2);
assert.ok(legacyStream.production.activeRate>0);

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

console.log('OMEGA RESOURCE REALISM V1 TEST PASSED');
