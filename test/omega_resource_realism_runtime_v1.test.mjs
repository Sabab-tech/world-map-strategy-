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
assert.equal(R.VERSION,'1.0.0');

// Priority 3: separate unit families.
assert.equal(R.parseReserve('120 million BBL','crude_oil').unitFamily,'BBL');
assert.equal(R.parseReserve('4.2 trillion TCF','natural_gas').unitFamily,'TCF');
assert.equal(R.parseReserve('2.5 million oz','gold').unitFamily,'TROY_OUNCES');
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
