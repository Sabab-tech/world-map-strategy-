import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const listeners=new Map();
const state={
 simulation:{turn:1,session:{playerCountryId:'BGD',status:'RUNNING'}},
 resource:{},transport:{},economy:{}
};
const countrySites=[
 {siteId:'SITE_BGD_PIT',countryId:'BGD',siteName:'Example Open Pit',real:{resourceId:'copper'},
  identity:{resourceTypeId:'copper',siteType:'OPEN_PIT_MINE'},operation:{status:'HISTORICAL_INACTIVE',commercialExtraction:true},
  map:{markerEligible:true},quantitative:{production:{rate:20,unit:'TONNES_PER_DAY',status:'SIMULATED'}}},
 {siteId:'SITE_BGD_TUNNEL',countryId:'BGD',siteName:'Example Underground Mine',real:{resourceId:'coal'},
  identity:{resourceTypeId:'coal',siteType:'UNDERGROUND_COAL_MINE'},operation:{status:'DEVELOPMENT',commercialExtraction:true},
  map:{markerEligible:true},simulation:{production:{rate:10,unit:'TONNES_PER_DAY',status:'SIMULATED'}}},
 {siteId:'SITE_CHL_COPPER',countryId:'CHL',siteName:'Foreign Copper Mine',real:{resourceId:'copper'},
  identity:{resourceTypeId:'copper',siteType:'OPEN_PIT_MINE'},operation:{status:'OPERATING',commercialExtraction:true},map:{markerEligible:true}},
 {siteId:'SITE_BGD_ALIAS',countryId:'BGD',siteName:'Alias',real:{resourceId:'copper'},
  identity:{resourceTypeId:'copper'},operation:{status:'OPERATING',commercialExtraction:true},
  map:{markerEligible:false,aliasOfSiteId:'SITE_BGD_PIT'}}
];
const context={
 console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON,Date,
 setTimeout,clearTimeout,
 Game:{state:state},
 Omega:{},
 OmegaResourceSiteCanonicalCatalogData:{sites:countrySites},
 OmegaResourceQuantityNormalization:{
  canonicalUnit:rid=>rid==='gold'?'TROY_OUNCES':rid==='natural_gas'?'BCM':rid==='crude_oil'?'BBL':'TONNES',
  normalizeQuantity:(rid,q,u)=>({quantity:Number(q)||null,unit:rid==='gold'?'TROY_OUNCES':rid==='natural_gas'?'BCM':rid==='crude_oil'?'BBL':'TONNES'})
 },
 OmegaResourceEndowmentRuntime:{
  async initialize(){return{status:'READY'};},
  async hydrateCountry(cid){return{status:'APPLIED',result:{accepted:true,countryId:cid}};},
  async startCountryProduction(cid){this.calls=(this.calls||[]).concat(cid);return{status:'STARTED',countryId:cid,startedSiteCount:2};},
  calls:[]
 },
 OmegaResourceIndustrialNetwork:{
  normalizeInfrastructure(cid){
   state.transport[cid]=state.transport[cid]||{infrastructure:{}};
   state.transport[cid].infrastructure=state.transport[cid].infrastructure||{};
   return{status:'READY',infra:state.transport[cid].infrastructure};
  }
 },
 addEventListener(name,fn){const rows=listeners.get(name)||[];rows.push(fn);listeners.set(name,rows);},
 dispatchEvent(evt){for(const fn of listeners.get(evt.type)||[])fn(evt);return true;}
};
context.globalThis=context;context.window=context;vm.createContext(context);
vm.runInContext(read('omega_resource_auto_mining_runtime_v1.js'),context,{filename:'omega_resource_auto_mining_runtime_v1.js'});
const runtime=context.OmegaResourceAutoMineRuntime;
assert.ok(runtime,'automatic mine runtime must register');
const ready=await runtime.bootstrapCountry('BGD',{startProduction:false});
assert.equal(ready.status,'READY',JSON.stringify(ready));
assert.equal(ready.provisioning.eligibleSiteCount,2);
assert.equal(ready.provisioning.autoStaffedSiteCount,2);
assert.equal(state.resource.BGD.mineAssets.length,2);
assert.ok(state.resource.BGD.mineAssets.every(x=>x.status==='OPERATIONAL'));
assert.ok(state.resource.BGD.mineAssets.every(x=>x.workersAssigned>=x.workersRequired));
assert.ok(state.resource.BGD.mineAssets.every(x=>x.fleet.vehiclesAssigned>=x.fleet.vehiclesRequired));
assert.equal(state.resource.BGD.commissionedSites.length,2);
assert.ok(state.transport.BGD.infrastructure.roads.capacityPerDay>0);
assert.ok(state.transport.BGD.infrastructure.utilitySupply.electricityMWhPerDay>0);
assert.equal(state.resource.CHL,undefined,'foreign country state must not be created or mutated');
const started=await runtime.runSelectedCountryTurn();
assert.equal(started.status,'READY');
assert.equal(context.OmegaResourceEndowmentRuntime.calls.filter(x=>x==='BGD').length,1);
assert.equal(state.resource.CHL,undefined);
const foreign=await runtime.bootstrapCountry('CHL',{startProduction:true});
assert.equal(foreign.status,'SKIPPED');
assert.equal(foreign.reason,'PLAYER_COUNTRY_SCOPE_VIOLATION');
assert.equal(state.resource.CHL,undefined,'explicit foreign-country provisioning must be rejected');
console.log('PASS automatic mine starter: selected-country staffing, fleet, infrastructure and production; foreign country remains dormant.');
