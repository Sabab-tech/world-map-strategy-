import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const json=name=>JSON.parse(read(name));

test('a site-specific simulated reserve depletes through the extraction engine over its declared multi-century horizon',()=>{
  const master=json('resource_site_master_registry_v1.json');
  const reserves=json('resource_site_reserve_simulation_v1.json');
  const rawOntology=json('resource_ontology.json').COMMODITY_ONTOLOGIES||{};
  const ontology={};
  for(const [key,value] of Object.entries(rawOntology))ontology[key.toLowerCase()]=value;
  const scenarioSource=read('omega_resource_scenario_engineering_data_v1.js');
  const match=scenarioSource.match(/const DATA=(\{[\s\S]*?\});\s*g\.OmegaResourceScenarioEngineeringData/);
  assert(match,'canonical scenario engineering rules must be available');
  const scenario=Function('return ('+match[1]+')')();
  const context={
    console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON,Date,Intl,
    Game:{state:{simulation:{turn:1,startYear:2015,date:'2015-01-01'},resource:{},economy:{}}},
    OmegaResourceSiteMasterResearchData:master,
    OmegaResourceSiteReserveSimulationData:reserves,
    OmegaResourceScenarioEngineeringData:scenario,
    __OmegaResourceEconomyOntology:ontology,
    Omega:{}
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(read('omega_resource_production_capacity_contract_v1.js'),context,{filename:'omega_resource_production_capacity_contract_v1.js'});
  vm.runInContext(read('omega_resource_realism_runtime_v1.js'),context,{filename:'omega_resource_realism_runtime_v1.js'});
  vm.runInContext(read('omega_resource_part05_reserve_extraction_runtime.js'),context,{filename:'omega_resource_part05_reserve_extraction_runtime.js'});

  const site=master.sites.find(row=>row.sourceSiteRecord?.commercialExtraction===true);
  assert(site,'a commercial site must exist in the master registry');
  const reserveRecord=reserves.records.find(row=>row.siteId===site.siteId&&row.resourceId===String(site.real?.resourceId||site.sourceSiteRecord?.resourceId||''));
  assert(reserveRecord?.reserve?.quantity>0,'site-specific simulation reserve must be present');
  assert.equal(reserveRecord.reserve.status,'SIMULATED','synthetic gameplay reserve must not be represented as observed data');
  const resourceId=String(site.real?.resourceId||site.sourceSiteRecord?.resourceId||'');
  const model=context.Omega.ResourceRealism.siteModel({
    ...site,siteId:site.siteId,siteName:site.siteName,resourceId,
    simulationReserveQuantity:reserveRecord.reserve.quantity,
    simulationReserveUnit:reserveRecord.reserve.unit
  },null,site.countryId);
  assert.equal(model.status,'READY',JSON.stringify({siteId:site.siteId,status:model.status}));
  const stream=model.commodityStreams.find(row=>row.resourceId===resourceId);
  assert(stream, "the site's own resource stream must resolve");
  const initial=Number(stream.reserve.quantity);
  const dailyRate=Number(stream.production.activeRate);
  const horizonYears=Number(stream.production.gameplayHorizonYears);
  assert(initial>0&&dailyRate>0,'reserve and active extraction rate must both be positive');
  assert(horizonYears>=300-1e-6&&horizonYears<=500+1e-6,'runtime must keep the simulated horizon within the declared 300-500 year range');
  const expectedDays=Math.ceil(initial/dailyRate);
  assert(Math.abs(expectedDays/365-horizonYears)<1.1,'derived reserve/rate lifespan must agree with the runtime horizon');

  const engine=context.GSRSK_Part05;
  assert(engine&&typeof engine.executeExtraction==='function','canonical reserve/extraction runtime must be loaded');
  const occurrenceKey='MULTICENTURY:'+site.siteId;
  const capacity=new engine.Capacity({occurrenceKey,nominalRate:dailyRate,dailyRate,unit:stream.reserve.unit,
    authority:'SIMULATED',dataStatus:'SIMULATED'});
  let reserve=new engine.ReserveState({occurrenceKey,countryId:site.countryId,resourceId,
    geologicalQuantity:initial,recoverableQuantity:initial,residualQuantity:initial,unit:stream.reserve.unit,
    operationalStatus:'ACTIVE_EXTRACTION',stateVersion:1});
  let midHorizonResidual=null;
  for(let day=1;day<=expectedDays;day++){
    const before=Number(reserve.residualQuantity);
    const step=engine.executeExtraction({occurrenceKey,requestedQuantity:dailyRate,timeWindowDurationHours:24,simulationTick:day},
      reserve,{capacity});
    assert.equal(step.status,'APPROVED','extraction must continue while recoverable reserve remains');
    assert(step.approvedQuantity>0&&step.approvedQuantity<=dailyRate+1e-7,'daily extraction must respect capacity');
    reserve=step.reserveAfter;
    assert(Number(reserve.residualQuantity)>=-1e-9&&Number(reserve.residualQuantity)<=before+1e-9,
      'reserve may never become negative or increase without a replenishment event');
    if(day===Math.floor(expectedDays/2))midHorizonResidual=Number(reserve.residualQuantity);
  }
  assert(midHorizonResidual!==null);
  assert(Math.abs(midHorizonResidual-initial*.5)<=dailyRate*2,
    'remaining reserve should track cumulative extraction instead of using a static display value');
  assert.equal(Number(reserve.residualQuantity),0,'the site-specific recoverable reserve must eventually reach zero');
  assert.equal(reserve.operationalStatus,'EXHAUSTED');
  const afterExhaustion=engine.executeExtraction({occurrenceKey,requestedQuantity:dailyRate,timeWindowDurationHours:24,simulationTick:expectedDays+1},
    reserve,{capacity});
  assert.equal(afterExhaustion.status,'BLOCKED','an exhausted site must not continue producing');
  assert(afterExhaustion.diagnostics.some(row=>row.message==='EXTRACTION_QUANTITY_ZERO'));
  console.log(JSON.stringify({certificate:'OMEGA-MULTICENTURY-RESERVE-DEPLETION',status:'PASS',siteId:site.siteId,
    countryId:site.countryId,resourceId,initialReserve:initial,unit:stream.reserve.unit,dailyRate,
    horizonYears:Number(horizonYears.toFixed(2)),simulatedDays:expectedDays,finalReserve:reserve.residualQuantity,
    exhaustedStatus:reserve.operationalStatus},null,2));
});
