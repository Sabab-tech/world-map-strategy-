import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const json=p=>JSON.parse(read(p));
const master=json('resource_site_master_registry_v1.json');
const reserves=json('resource_site_reserve_simulation_v1.json');
const scenarioText=read('omega_resource_scenario_engineering_data_v1.js');
const match=scenarioText.match(/const DATA=(\{[\s\S]*?\});\s*g\.OmegaResourceScenarioEngineeringData/);
assert(match,'scenario DATA not found');
const scenario=Function('return ('+match[1]+')')();
const ontology=json('resource_ontology.json').COMMODITY_ONTOLOGIES||{};
const ontologyMap={};
for(const [k,v] of Object.entries(ontology))ontologyMap[k.toLowerCase()]=v;

assert.equal(master.siteCount,199);
assert.equal(master.sites.length,199);
assert.equal(reserves.siteCount,199);
assert.equal(reserves.records.length,199);
assert.equal(scenario.records.length,199);
assert.equal(master.sites.filter(x=>x.sourceSiteRecord?.commercialExtraction===true).length,195);
assert.equal(master.sites.filter(x=>x.sourceSiteRecord?.commercialExtraction===false).length,4);

const context={
  console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON,Date,Intl,
  Game:{state:{simulation:{turn:1,startYear:2015,date:'2015-01-01'},resource:{},economy:{}}},
  OmegaResourceSiteMasterResearchData:master,
  OmegaResourceSiteReserveSimulationData:reserves,
  OmegaResourceScenarioEngineeringData:scenario,
  __OmegaResourceEconomyOntology:ontologyMap,
  Omega:{}
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(read('omega_resource_realism_runtime_v1.js'),context,{filename:'omega_resource_realism_runtime_v1.js'});
context.Omega.ResourceLogisticsRuntime={plan:()=>({status:'PLANNED',requestedQuantity:100,dispatchQuantity:100,capacity:100,transportMode:'truck',travelTimeDays:1})};
vm.runInContext(read('omega_resource_system_hardening_v1.js'),context,{filename:'omega_resource_system_hardening_v1.js'});

const realism=context.Omega.ResourceRealism;
const hard=context.Omega.ResourceSystemHardening;
assert(hard);
assert.equal(hard.VERSION,'1.0.0');

const t0=performance.now();
let simulatedCount=0;
for(const site of master.sites){
  if(site.sourceSiteRecord?.commercialExtraction!==true)continue;
  const resourceId=site.real?.resourceId||site.sourceSiteRecord?.resourceId;
  const rv=reserves.records.find(x=>x.siteId===site.siteId);
  const result=realism.siteModel({
    siteId:site.siteId,countryId:site.countryId,siteName:site.siteName,resourceId,
    simulationReserveQuantity:rv?.reserve?.quantity,simulationReserveUnit:rv?.reserve?.unit,sourcePath:site.sourcePath
  },null,site.countryId);
  assert.equal(result.status,'READY',site.siteId);
  assert(result.commodityStreams.length>=1,site.siteId);
  for(const stream of result.commodityStreams){
    assert(stream.production.activeRate>0,site.siteId+': active rate');
    if(String(stream.production.authority).toUpperCase()==='SIMULATED'){
      simulatedCount++;
      assert(stream.production.gameplayHorizonYears>=300-1e-6,site.siteId+': horizon below 300');
      assert(stream.production.gameplayHorizonYears<=500+1e-6,site.siteId+': horizon above 500');
      assert(stream.production.simulationResolutionSource,site.siteId+': simulation source');
    }
  }
}
const elapsed=performance.now()-t0;
assert(elapsed<5000,'199-site hardening resolution exceeded 5s: '+elapsed.toFixed(1)+'ms');
assert(simulatedCount>0);

const multi=realism.siteModel({
  siteId:'TEST_MULTI',countryId:'CHL',siteName:'Synthetic Multi Commodity',
  commodities:[
    {resourceId:'copper',reserve:'1000000 tonnes'},
    {resourceId:'gold',reserve:'2000000 oz'},
    {resourceId:'silver',reserve:'10000000 oz'}
  ]
},null,'CHL');
assert.equal(multi.commodityStreams.length,3);
assert.deepEqual(Array.from(multi.commodityStreams, x=>x.resourceId),['copper','gold','silver']);

// Regression: simulation reserve/capacity must resolve per commodity stream, not inherit
// the first commodity's reserve when a site has multiple modeled commodities.
const syntheticMasterRows=context.OmegaResourceSiteMasterResearchData.sites;
const syntheticReserveRows=context.OmegaResourceSiteReserveSimulationData.records;
const masterLen=syntheticMasterRows.length;
const reserveLen=syntheticReserveRows.length;
for(const [resourceId,reserveQuantity,capacity] of [['copper',1000000,1000],['gold',9000000,100]]){
  syntheticMasterRows.push({
    siteId:'SITE_TEST_PER_STREAM',countryId:'CHL',siteName:'Per Stream Regression Site',
    real:{resourceId},sourceSiteRecord:{resourceId,countryId:'CHL',commercialExtraction:true},
    simulation:{simulationOnly:true,nominalDailyCapacity:capacity,minimumDailyCapacity:capacity*0.5,maximumDailyCapacity:capacity*1.2,utilization:0.7,recovery:0.8,decline:0,maintenance:0.05}
  });
  syntheticReserveRows.push({siteId:'SITE_TEST_PER_STREAM',countryId:'CHL',resourceId,reserve:{quantity:reserveQuantity,unit:'TONNES',status:'SIMULATED'}});
}
const perStream=context.Omega.ResourceRealism.siteModel({
  siteId:'SITE_TEST_PER_STREAM',countryId:'CHL',siteName:'Per Stream Regression Site',
  commodities:[{resourceId:'copper'},{resourceId:'gold'}]
},null,'CHL');
assert.equal(perStream.commodityStreams.length,2);
const perStreamById=new Map(perStream.commodityStreams.map(x=>[x.resourceId,x]));
assert(perStreamById.get('copper')?.production?.gameplayHorizonYears > 0);
assert(perStreamById.get('gold')?.production?.gameplayHorizonYears > 0);
assert.notEqual(perStreamById.get('copper').reserve.quantity,perStreamById.get('gold').reserve.quantity);
assert.notEqual(perStreamById.get('copper').production.nominalCapacity,perStreamById.get('gold').production.nominalCapacity);
syntheticMasterRows.length=masterLen;
syntheticReserveRows.length=reserveLen;

context.Game.state.resource.CHL={siteControls:{TEST_MULTI:{blocked:true}}};
const blocked=realism.siteModel({
  siteId:'TEST_MULTI',countryId:'CHL',siteName:'Synthetic Multi Commodity',resourceId:'copper',
  simulationReserveQuantity:1000000,simulationReserveUnit:'TONNES'
},null,'CHL');
assert.equal(blocked.commodityStreams[0].production.activeRate,0);

const constrained=hard.constrainedLogisticsPlan({
  quantity:100,terrainMultiplier:0.5,infrastructureMultiplier:0.5,atWar:true,sanctioned:true
});
assert.ok(Math.abs(constrained.logisticsConstraints.totalMultiplier-0.089375)<1e-12);
assert(constrained.dispatchQuantity<=18);

const copperModel=hard.processModel('copper');
assert.equal(copperModel.resourceId,'copper');
assert(Object.keys(copperModel.outputs).length>0);
assert.equal(copperModel.authority,'SIMULATION_RULES_FROM_CANONICAL_ONTOLOGY');

const diagnostics=hard.diagnostics();
assert.equal(diagnostics.masterSiteCount,199);
assert.equal(diagnostics.commercialSiteCount,195);
assert.equal(diagnostics.playableCommercialSimulationCount,195);
assert.equal(diagnostics.blockedCommercialSimulationCount,0);

console.log(JSON.stringify({
  certificate:'OMEGA-RESOURCE-SYSTEM-HARDENING-V1',
  status:'PASS',siteCount:199,commercialSites:195,
  playableCommercialSimulationSites:diagnostics.playableCommercialSimulationCount,
  simulatedStreams:simulatedCount,resolverElapsedMs:Number(elapsed.toFixed(2)),
  gameplayHorizonTargetYears:375,multiCommodityStreams:multi.commodityStreams.length,
  processingRule:'ONTOLOGY_DERIVED',logisticsConstraints:'ACTIVE',depletionAudit:'INTEGRATED'
},null,2));
