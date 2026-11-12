import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../omega_npc_country_economic_governance_runtime_v1.js',import.meta.url),'utf8');
function iso2(index){return String.fromCharCode(65+Math.floor(index/26),65+(index%26));}
function iso3(index){return String.fromCharCode(65+Math.floor(index/676),65+Math.floor(index/26)%26,65+index%26);}
function setPath(target,path,value){
  const parts=String(path).split('.');
  let cursor=target;
  for(const part of parts.slice(0,-1)){if(!cursor[part]||typeof cursor[part]!=='object')cursor[part]={};cursor=cursor[part];}
  cursor[parts[parts.length-1]]=value;
}
function getPath(target,path){
  return String(path).split('.').reduce((value,key)=>value&&value[key],target);
}
function createHarness(){
  const rows=Array.from({length:197},(_,index)=>({
    countryCode:iso2(index),iso3:iso3(index),name:'Country '+index,
    sourceValues:{gdp:index===7?null:1000000000+index*10000000,gdp_growth:2.5},
    populationValues:{population_2015:5000000+index*1000},profileStatus:index===7?'PARTIAL_BASELINE':'OBSERVED_LOCAL_BASELINE'
  }));
  const byAlias=new Map();
  for(const row of rows){byAlias.set(row.countryCode,row);byAlias.set(row.iso3,row);}
  const state={simulation:{turn:30,session:{playerCountryId:rows[0].countryCode}},finance:{},economy:{},projects:{},foreign:{},relations:{}};
  const handlers=new Map(),actions=new Map(),bundles=[],treaties=[];
  const mesh={
    registerAction(action,definition){actions.set(action,definition);},
    registerCommandHandler(action,owner,handler){handlers.set(action,{owner,handler});},
    dispatchCommand(owner,action,countryId,payload={},options={}){
      const entry=handlers.get(action);
      if(!entry||entry.owner!==owner)return{status:'UNHANDLED',reason:'HANDLER_MISSING'};
      const bucketRoot=state[owner]||(state[owner]={});
      const cid=String(countryId).toUpperCase();
      const bucketKey=Object.keys(bucketRoot).find(key=>key.toUpperCase()===cid)||cid;
      if(!bucketRoot[bucketKey])bucketRoot[bucketKey]={};
      const country=bucketRoot[bucketKey],operations=[];
      const tx={
        get(path){const normalized=String(path).startsWith(owner+'.')?String(path).slice(owner.length+1):path;return getPath(country,normalized);},
        set(path,value){const normalized=String(path).startsWith(owner+'.')?String(path).slice(owner.length+1):path;setPath(country,normalized,value);operations.push(normalized);return value;}
      };
      const result=entry.handler({payload,countryId:cid,simulationTurn:options.turn??state.simulation.turn,commandId:options.commandId},{
        countryId:cid,simulationTurn:options.turn??state.simulation.turn,stateTransaction:tx
      });
      if(result?.accepted===false)return{status:'FAILED',result,reason:result.reason||result.code};
      if(operations.length===0&&!result?.duplicate)return{status:'ACCEPTED_NO_STATE_WRITE',result};
      return{status:'APPLIED',result,stateWriteCount:operations.length};
    }
  };
  const scheduler={
    registerCountryHandler(id,handler,options){this.handler={id,handler,options};return()=>{};},
    registerEventHandler(type,id,handler,options){this.events=this.events||{};this.events[type]={id,handler,options};return()=>{};},
    activateCountry(countryId,options){return{status:'ACTIVATED',countryId,options};},
    diagnostics(){return{rosterCount:197,lastTurn:state.simulation.turn};}
  };
  const runtime={
    async init(){return true;},
    resolveCountry(value){const row=byAlias.get(String(value).toUpperCase());return row?{countryCode:row.countryCode,iso3:row.iso3}:null;},
    getProfile(value){const row=byAlias.get(String(value).toUpperCase());return row?{...row}:null;}
  };
  const baseline={
    ready:Promise.resolve({status:'READY'}),
    getCountryIds(){return rows.map(row=>row.iso3);},
    getCountryBaseline(value){
      const row=byAlias.get(String(value).toUpperCase());if(!row)return null;
      return{status:'READY',countryId:row.iso3,totalStartingFactoryUnits:7,
        factoryCounts:{FOOD_PROCESSING:5,STEEL_WORKS:2},simulationOnly:true,realWorldFacilityCounts:false};
    }
  };
  const sandbox={
    Promise,Map,Set,WeakMap,Object,Array,Number,String,Math,Date,JSON,console,
    Omega:{MinistryInteroperability:mesh,WorldSimulationScheduler:scheduler,OpponentAutonomy:{
      dispatch(action,countryId,payload){bundles.push({action,countryId,payload});return{status:'APPLIED',result:{accepted:true}};},
      startTreatyNegotiation(countryId,targetCountryId,details){treaties.push({countryId,targetCountryId,details});return{status:'APPLIED'};}
    }},
    OmegaMinistryInteroperability:mesh,OmegaWorldSimulationScheduler:scheduler,
    OmegaOpponentAutonomy:null,OmegaCountryRuntimeData:runtime,OmegaCountryFactoryStartingBaselineV1:baseline,
    Game:{state},addEventListener(){},setTimeout(callback){queueMicrotask(callback);return 0;}
  };
  vm.runInNewContext(source,sandbox,{filename:'omega_npc_country_economic_governance_runtime_v1.js'});
  const api=sandbox.Omega.NpcCountryEconomicGovernance;
  return{api,state,rows,byAlias,bundles,treaties,actions,scheduler,sandbox};
}

test('canonical 197-country roster gives all 196 NPCs separate fiscal and economic state',async()=>{
  const h=createHarness();
  const player=h.rows[0].countryCode;
  const playerResult=await h.api.processCountry(player,{turn:30});
  assert.equal(playerResult.status,'PLAYER_EXEMPT');
  for(const row of h.rows.slice(1)){
    const result=await h.api.processCountry(row.countryCode,{turn:30});
    assert.equal(result.status,'PROCESSED',row.countryCode+': '+JSON.stringify(result));
  }
  assert.equal(h.api.getCountryIds().length,197);
  assert.equal(h.api.diagnostics().eligibleNpcCountries,196);
  assert.equal(h.api.diagnostics().processedCountries,196);
  for(const row of h.rows.slice(1)){
    const finance=h.state.finance[row.countryCode],economy=h.state.economy[row.countryCode];
    assert.ok(finance?.npcEconomicGovernance,'missing fiscal governance '+row.countryCode);
    assert.ok(economy?.npcEconomicGovernance,'missing economic governance '+row.countryCode);
    assert.ok(Number.isFinite(economy.gdp)&&economy.gdp>0,'missing GDP '+row.countryCode);
    assert.ok(Number.isFinite(finance.available)&&finance.available>=0,'invalid Treasury '+row.countryCode);
    assert.ok(Number.isFinite(finance.reserves)&&finance.reserves>=0,'invalid reserves '+row.countryCode);
    assert.equal(economy.productionCapacity,7);
    assert.equal(economy.npcEconomicGovernance.simulationOnly,true);
  }
  assert.equal(h.state.finance[player],undefined);
  assert.equal(h.state.economy[player],undefined);
});

test('fiscal accrual is turn-idempotent and industrial investment uses the authoritative project bundle',async()=>{
  const h=createHarness(),country=h.rows[1].countryCode;
  await h.api.processCountry(country,{turn:30});
  const initial=h.state.finance[country].available;
  const replay=await h.api.processCountry(country,{turn:30});
  assert.equal(replay.status,'PROCESSED');
  assert.equal(h.state.finance[country].available,initial);
  assert.equal(h.bundles.length,0);
  const next=await h.api.processCountry(country,{turn:60});
  assert.equal(next.status,'PROCESSED');
  assert.equal(h.bundles.length,1);
  assert.equal(h.bundles[0].action,'OMEGA_AUTONOMY_BUNDLE');
  assert.equal(h.bundles[0].payload.route.selected.action,'INDUSTRY_BUILD');
  assert.equal(h.bundles[0].payload.route.selected.facilityType,'FOOD_PROCESSING');
  assert.equal(h.bundles[0].payload.route.selected.plan.facilityType,'FOOD_PROCESSING');
  assert.deepEqual({...h.bundles[0].payload.route.selected.plan.materials},{});
  assert.equal(h.state.economy[country].npcEconomicGovernance.lastInvestmentTurn,60);
  assert.ok(h.state.finance[country].npcEconomicGovernance.cumulativeDevelopmentAllocations>0);
});

test('missing observed GDP is clearly marked as a simulation balance proxy',async()=>{
  const h=createHarness(),country=h.rows[7].countryCode;
  const result=await h.api.processCountry(country,{turn:30});
  assert.equal(result.status,'PROCESSED');
  const ledger=h.state.economy[country].npcEconomicGovernance;
  assert.equal(ledger.gdpSource,'SIMULATION_BALANCE_PROXY_FROM_POPULATION');
  assert.equal(ledger.gdpProvenance,'SIMULATION_BALANCE_PROXY');
  assert.ok(h.state.economy[country].gdp>0);
});

test('NPC diplomacy only opens a negotiation with an observed eligible sovereign partner',async()=>{
  const h=createHarness(),origin=h.rows[1].countryCode,target=h.rows[2].countryCode;
  h.state.foreign[origin]={relations:{[target]:{overall:78,trust:82,trade:75,political:77}}};
  const result=await h.api.processCountry(origin,{turn:30});
  assert.equal(result.status,'PROCESSED');
  assert.equal(h.treaties.length,1);
  assert.equal(h.treaties[0].countryId,origin);
  assert.equal(h.treaties[0].targetCountryId,target);
  assert.equal(h.treaties[0].details.treatyType,'TRADE_AND_INVESTMENT');
  assert.equal(h.state.finance[h.rows[0].countryCode],undefined);
});

test('production and inventory data are not fabricated during macro development',async()=>{
  const h=createHarness(),country=h.rows[1].countryCode;
  await h.api.processCountry(country,{turn:30});
  await h.api.processCountry(country,{turn:60});
  assert.equal(h.state.economy[country].productionAssets,undefined);
  assert.equal(h.state.resource,undefined);
  assert.equal(h.state.resourceInventory,undefined);
  assert.equal(h.state.projects[country],undefined);
  assert.ok(h.bundles[0].payload.route.selected.plan.cost>0);
});

test('all NPC governance commands are owned by their authoritative ministries',()=>{
  const h=createHarness();
  assert.equal(h.actions.get('OMEGA_NPC_COUNTRY_FISCAL_ADVANCE').stateOwnerMinistry,'finance');
  assert.equal(h.actions.get('OMEGA_NPC_COUNTRY_ECONOMY_ADVANCE').stateOwnerMinistry,'economy');
  assert.equal(h.actions.get('OMEGA_NPC_COUNTRY_ACTIVITY_RECORD').stateOwnerMinistry,'economy');
});
