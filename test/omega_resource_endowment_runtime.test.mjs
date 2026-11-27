import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot=new URL('../',import.meta.url);

function advanceOneGameTurn(state){
  const sim=state.simulation||(state.simulation={});
  const step=Math.max(1,Math.round(Number(sim.daysPerTurn)||1));
  const base=String(sim.date||String(Number(sim.startYear)||2015)+'-01-01');
  const date=new Date(base+'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate()+step);
  sim.date=date.toISOString().slice(0,10);
  sim.turn=(Number(sim.turn)||1)+1;
}
function advanceToGameTurn(state,targetTurn){
  const target=Math.max(1,Number(targetTurn)||1);
  let guard=0;
  while((Number(state.simulation?.turn)||1)<target){
    advanceOneGameTurn(state);
    if(++guard>10000)throw new Error('TEST_GAME_CLOCK_TURN_GUARD');
  }
}
function advanceToCycleFinish(state,cycle){
  const sim=state.simulation||(state.simulation={});
  if(!sim.date)sim.date=String(cycle?.startDate||String(Number(sim.startYear)||2015)+'-01-01');
  const currentTurn=Number(sim.turn)||1;
  const targetTurn=Math.max(currentTurn+1,Number(cycle?.finishTurn)||currentTurn+1);
  const targetDate=cycle?.finishDate?new Date(String(cycle.finishDate)+'T00:00:00.000Z'):null;
  let guard=0;
  while((Number(sim.turn)||1)<targetTurn||(targetDate&&new Date(String(sim.date)+'T00:00:00.000Z')<targetDate)){
    advanceOneGameTurn(state);
    if(++guard>10000)throw new Error('TEST_FACTORY_CYCLE_CLOCK_GUARD');
  }
}
async function completeFactoryCycle(state,industry,countryId,factoryId,sourceBatchId,maxTurns=32){
  const resourceState=()=>state.resource?.[countryId]||{};
  const flow=()=> (resourceState().industrialNetwork?.siteFlowLedger||[])
    .find(row=>String(row.batchId||'')===String(sourceBatchId||''));
  const flowSummary=()=>{
    const row=flow();
    return row?{flowId:row.flowId,siteId:row.siteId,batchId:row.batchId,quantity:row.quantity,
      stages:(row.stages||[]).map(x=>({stage:x.stage,status:x.status,turn:x.turn,transactionId:x.transactionId,
        reason:x.reason,sourceBatchIds:x.sourceBatchIds,createdBatchIds:x.createdBatchIds}))}:null;
  };
  const completed=()=>flow()?.stages?.some(step=>step.stage==='PROCESSING'&&step.status==='COMPLETED');
  const history=[];
  for(let step=0;step<maxTurns;step++){
    if(completed())return{status:'COMPLETED',sourceBatchId,turns:step,flow:flowSummary(),history};
    const cycle=resourceState().industrialNetwork?.factoryProductionCycles?.[String(factoryId)];
    if(cycle&&cycle.status==='IN_PROGRESS'&&cycle.finishDate){
      advanceToCycleFinish(state,cycle);
    }else{
      // A prior cycle may belong to an older batch. Complete/start cycles one turn at a time
      // until this exact source batch appears in a committed lineage, not merely any cycle.
      advanceOneGameTurn(state);
    }
    const result=await industry.processPendingFactoryInputs(countryId);
    history.push({turn:state.simulation?.turn,date:state.simulation?.date,cycleId:cycle?.cycleId||null,
      cycleStatus:cycle?.status||null,completedCount:result?.completedCount||0,startedCount:result?.startedCount||0,
      blocked:(result?.blocked||[]).slice(0,5).map(x=>({factoryId:x.factoryId,reason:x.reason,
        missingInputs:(x.missingInputs||[]).map(n=>({resourceId:n.resourceId,available:n.available,required:n.required,tracked:n.tracked})),
        utilityStatus:x.utilityStatus||x.utilities?.status||null,technologyStatus:x.technologyStatus||null,
        workforceStatus:x.workforceStatus||null,warehouseTransferStatus:x.warehouseTransferStatus||null}))});
  }
  const cycle=resourceState().industrialNetwork?.factoryProductionCycles?.[String(factoryId)]||null;
  assert.ok(completed(),JSON.stringify({reason:'SOURCE_BATCH_FACTORY_CYCLE_NOT_COMPLETED',countryId,factoryId,sourceBatchId,
    flow:flowSummary(),cycle:cycle?{cycleId:cycle.cycleId,status:cycle.status,startDate:cycle.startDate,finishDate:cycle.finishDate,
      finishTurn:cycle.finishTurn,sourceBatchIds:cycle.sourceBatchIds,inputQuantities:cycle.inputQuantities,
      expectedOutputs:cycle.expectedOutputs,utilityConsumption:cycle.utilityConsumption,reason:cycle.reason}:null,history}));
  return{status:'COMPLETED',sourceBatchId,flow:flowSummary(),history};
}
const resourceFiles=new Map([
  ['resources.json',new URL('../resources.json',import.meta.url)],
  ['resources_2.json',new URL('../resources_2.json',import.meta.url)],
  ['resource_site_reserve_simulation_v1.json',new URL('../resource_site_reserve_simulation_v1.json',import.meta.url)],
  ['resource_site_quantity_completion_v1.json',new URL('../resource_site_quantity_completion_v1.json',import.meta.url)],
  ['resource_site_country_mineplay_batch_20261020_v1.json',new URL('../resource_site_country_mineplay_batch_20261020_v1.json',import.meta.url)],
  ['resource_site_country_mineplay_batch_20261024_v1.json',new URL('../resource_site_country_mineplay_batch_20261024_v1.json',import.meta.url)],
  ['resource_site_country_mineplay_critical_batch_20261024_v1.json',new URL('../resource_site_country_mineplay_critical_batch_20261024_v1.json',import.meta.url)],
  ['resource_site_canonical_catalog_v1.json',new URL('../resource_site_canonical_catalog_v1.json',import.meta.url)],
  ['resource_site_master_registry_v1.json',new URL('../resource_site_master_registry_v1.json',import.meta.url)],
  ['resource_site_reference_expanded_manifest.json',new URL('../resource_site_reference_expanded_manifest.json',import.meta.url)],
  ['resource_site_reference_expanded_part_01.json',new URL('../resource_site_reference_expanded_part_01.json',import.meta.url)],
  ['resource_site_reference_expanded_part_02.json',new URL('../resource_site_reference_expanded_part_02.json',import.meta.url)],
  ['resource_site_reference_expanded_part_03.json',new URL('../resource_site_reference_expanded_part_03.json',import.meta.url)],
  ['resource_site_reference_expanded_part_04.json',new URL('../resource_site_reference_expanded_part_04.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_1_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_1_v1.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_2_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_2_v1.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_3_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_3_v1.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_4_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_4_v1.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_5_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_5_v1.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_6_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_6_v1.json',import.meta.url)],
  ['resource_industrial_catalog_v1.json',new URL('../resource_industrial_catalog_v1.json',import.meta.url)],
  ['resource_site_logistics_routes_v1.json',new URL('../resource_site_logistics_routes_v1.json',import.meta.url)],
  ['resource_site_logistics_routes_v1_part_01.json',new URL('../resource_site_logistics_routes_v1_part_01.json',import.meta.url)],
  ['resource_site_logistics_routes_v1_part_02.json',new URL('../resource_site_logistics_routes_v1_part_02.json',import.meta.url)],
  ['resource_site_logistics_routes_v1_part_03.json',new URL('../resource_site_logistics_routes_v1_part_03.json',import.meta.url)],
  ['resource_site_logistics_routes_v1_part_04.json',new URL('../resource_site_logistics_routes_v1_part_04.json',import.meta.url)],
  ['resource_site_logistics_routes_v1_part_05.json',new URL('../resource_site_logistics_routes_v1_part_05.json',import.meta.url)],
  ['resource_site_logistics_routes_v1_part_06.json',new URL('../resource_site_logistics_routes_v1_part_06.json',import.meta.url)]
]);
const nativeFetch=globalThis.fetch;
globalThis.fetch=async function(input){
  const name=String(input).split('?')[0].replace(/^\.\//,'');
  const target=resourceFiles.get(name);
  if(!target)return{ok:false,status:404,json:async()=>({})};
  return{ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(target),'utf8'))};
};

globalThis.Game={state:{simulation:{turn:1},resource:{},finance:{},economy:{},trade:{},foreign:{},cabinet:{}}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=String(type);this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){const t=new EventTarget();globalThis.dispatchEvent=t.dispatchEvent.bind(t);globalThis.addEventListener=t.addEventListener.bind(t);}

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const countryIdentity=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await countryIdentity.init();

await import('../resource_ministry_engine.js');
await import('../omega_resource_part04_identity_runtime.js');
const engine=globalThis.ResourceMinistryEngine;
await engine.init();
const source=JSON.parse(fs.readFileSync(new URL('../resources.json',import.meta.url),'utf8'));

assert.equal(engine.isReady,true);
const dataReport=engine.getDataLoadReport();
assert.equal(dataReport.authority,'RESOURCE_JSON');
assert.equal(dataReport.status,'READY');
assert.ok(dataReport.depositCount>0,'resource runtime must load at least one canonical deposit');
assert.equal(dataReport.fallbackUsed,false);
assert.ok(engine.deposits.length>0,'resource runtime must expose canonical deposits');
assert.equal(engine.deposits.some(x=>x.sourceAuthority==='RESOURCE_JSON'),true);
assert.equal(engine.deposits.some(x=>x.id==='dep-barapukuria-coal'&&x.resId==='coal'),true);

await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');

const seen=[];
globalThis.addEventListener('OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE',e=>seen.push(e.detail));

await import('../omega_resource_part05_reserve_extraction_runtime.js');
await import('../omega_resource_production_model_v2.js');
await import('../omega_resource_production_capacity_contract_v1.js');
await import('../omega_resource_quantity_normalization_v1.js');
await import('../omega_resource_realism_runtime_v1.js');
await import('../omega_resource_endowment_runtime.js');
const runtime=globalThis.OmegaResourceEndowmentRuntime;

{
const endowmentRuntimeSource=fs.readFileSync(new URL('../omega_resource_endowment_runtime.js',import.meta.url),'utf8');
const extractionHandlerStart=endowmentRuntimeSource.indexOf('function extractHandler(cmd,ctx){');
const extractionHandlerEnd=endowmentRuntimeSource.indexOf('function publishCommittedExtractionEvents',extractionHandlerStart);
assert.ok(extractionHandlerStart>=0&&extractionHandlerEnd>extractionHandlerStart,
  'the authoritative extraction handler must remain available for copy-cost regression checks');
const extractionHandlerSource=endowmentRuntimeSource.slice(extractionHandlerStart,extractionHandlerEnd);
const stateTransactionSource=fs.readFileSync(new URL('../omega_ministry_state_transaction.js',import.meta.url),'utf8');
assert.ok(stateTransactionSource.includes('return clone(this._readEffectivePath(path));'),
  'StateTransaction.get must keep its detached-copy contract');
assert.equal(extractionHandlerSource.includes('clone(ctx.stateTransaction.get('),false,
  'extraction must not deep-clone snapshots a second time after StateTransaction.get');
assert.equal(extractionHandlerSource.includes('Array.isArray(ctx.stateTransaction.get('),false,
  'large ledger arrays must be read once and reused rather than cloning the same history twice');
assert.equal(extractionHandlerSource.includes('const existingResourceState='),false,
  'extraction must not deep-copy the complete country resource bucket when that snapshot is unused');
assert.ok(extractionHandlerSource.includes("const persistedMineStates=ctx.stateTransaction.peek('resource.mineStates')"),
  'read-only mine-state inspection must use the transaction peek path');
assert.ok(extractionHandlerSource.includes("const consumption=ctx.stateTransaction.peek('resource.consumption')"),
  'read-only domestic demand must not allocate another detached copy');
assert.ok(extractionHandlerSource.includes("const exportDemand=ctx.stateTransaction.peek('resource.exportDemand')||ctx.stateTransaction.peek('trade.exportDemand')"),
  'read-only export demand must use zero-copy transaction peeks');

assert.match(endowmentRuntimeSource,/PLAYER_COUNTRY_SCOPE_VIOLATION/);
assert.match(endowmentRuntimeSource,/const requestedPeriodTurn=n\(cmd\?\.payload\?\.productionPeriodTurn\)/,
  'resource extraction commands must carry an explicit historical production period without changing the world clock');
assert.match(endowmentRuntimeSource,/simulationTick:productionPeriodTurn,timeWindowDurationHours:windowHours/,
  'each catch-up day must receive its own P5 extraction tick and retain the existing capacity window');
assert.match(endowmentRuntimeSource,/receivedFrom:'MINE_EXTRACTION',simulationTurn:productionPeriodTurn,productionPeriodId/,
  'raw warehouse receipts must retain the same stable period identity as their source extraction');
assert.match(endowmentRuntimeSource,/warehouseId:batch\.warehouseId,turn:productionPeriodTurn,productionPeriodId/,
  'mine production ledger rows must preserve legacy turn fields and add period identity');
assert.match(endowmentRuntimeSource,/const samePeriod=row=>row\?\.productionPeriodId/,
  'duplicate suppression must use period identity instead of treating every elapsed day as one current turn');
assert.match(endowmentRuntimeSource,/extractCountry\(c,slice,\{productionPeriodTurn:t,productionPeriodId\}\)/,
  'sliced extraction must preserve the same period identity across every occurrence batch');

globalThis.Game.state.simulation.playerCountryId='BGD';
globalThis.Game.state.simulation.session=globalThis.Game.state.simulation.session||{};
globalThis.Game.state.simulation.session.playerCountryId='BGD';
const foreignCountryStart=await runtime.startCountryProduction('AUS');
assert.equal(foreignCountryStart.status,'BLOCKED',JSON.stringify(foreignCountryStart));
assert.equal(foreignCountryStart.reason,'PLAYER_COUNTRY_SCOPE_VIOLATION',JSON.stringify(foreignCountryStart));
const oneTapStart=await runtime.startCountryProduction('BGD',[oneTapSite.siteId]);
assert.ok(['STARTED','PARTIALLY_STARTED'].includes(oneTapStart.status),
  'one tap must start simulated extraction on an unattempted commercial site: '+JSON.stringify(oneTapStart));
assert.ok(oneTapStart.startedSiteCount>0,JSON.stringify(oneTapStart));
const oneTapLedger=()=>((runtime.countryResourceState('BGD')||{}).mineProductionLedger||[]).filter(row=>
  row.siteReferenceKey===oneTapSite.siteId&&Number(row.turn)===Number(globalThis.Game.state.simulation.turn)&&Number(row.quantity)>0);
const oneTapLedgerBefore=oneTapLedger();
assert.ok(oneTapLedgerBefore.length>0,'the one-tap site must create a successful production ledger row');
const successfulQuantityBefore=oneTapLedgerBefore.reduce((sum,row)=>sum+Number(row.quantity||0),0);
await runtime.startCountryProduction('BGD',[oneTapSite.siteId]);
const oneTapLedgerAfter=oneTapLedger();
assert.equal(oneTapLedgerAfter.length,oneTapLedgerBefore.length,
  'a repeat one-tap action must not create a second successful row for already-produced occurrences');
assert.equal(oneTapLedgerAfter.reduce((sum,row)=>sum+Number(row.quantity||0),0),successfulQuantityBefore,
  'a repeat one-tap action must not duplicate successful production quantities');

// Selected-occurrence fallback must index the country reference array once, then
// resolve only the requested site ID on every subsequent slice. This prevents a
// one-occurrence command from enumerating hundreds of unrelated country references.
const selectedIndexBucket=globalThis.Game.state.resource.BGD;
selectedIndexBucket.mineStates=selectedIndexBucket.mineStates&&typeof selectedIndexBucket.mineStates==='object'
  ?selectedIndexBucket.mineStates:{};
const selectedIndexProbeKey='TEST_ONLY_NONCANONICAL_SELECTED_OCCURRENCE';
const previousSelectedIndexProbe=selectedIndexBucket.mineStates[selectedIndexProbeKey];
selectedIndexBucket.mineStates[selectedIndexProbeKey]={
  occurrenceKey:selectedIndexProbeKey,siteReferenceKey:oneTapSite.siteId,siteId:oneTapSite.siteId,
  resourceId:'limestone',countryId:'BGD',simulationOnly:true
};
const selectedIndexBefore=runtime.diagnostics().siteReferenceRowIndex;
await runtime.extractCountry('BGD',[selectedIndexProbeKey]);
const selectedIndexAfterFirst=runtime.diagnostics().siteReferenceRowIndex;
await runtime.extractCountry('BGD',[selectedIndexProbeKey]);
const selectedIndexAfterSecond=runtime.diagnostics().siteReferenceRowIndex;
assert.equal(selectedIndexAfterSecond.buildCount,selectedIndexAfterFirst.buildCount,
  'repeated selected-site extraction must reuse the same site-reference index, not rebuild or rescan the country array');
assert.equal(selectedIndexAfterSecond.cacheHitCount,selectedIndexAfterFirst.cacheHitCount+1,
  'the second selected-site slice must use the cached reference index');
assert.ok(selectedIndexAfterSecond.lookupCount>selectedIndexAfterFirst.lookupCount,
  'selected-site slices must perform keyed lookups instead of whole-array filtering');
assert.ok(selectedIndexAfterSecond.selectedReferenceCount>=selectedIndexAfterFirst.selectedReferenceCount,
  'selected-site index results must remain bounded to matching reference rows');
if(previousSelectedIndexProbe===undefined)delete selectedIndexBucket.mineStates[selectedIndexProbeKey];
else selectedIndexBucket.mineStates[selectedIndexProbeKey]=previousSelectedIndexProbe;

// Country row caches must survive a full multi-country turn. The former four-entry
// LRU evicted the first country as soon as the fifth was hydrated, forcing the next
// simulation turn to rebuild its occurrence and execution rows again.
const cacheProbeReferences=globalThis.__OmegaResourceIdentityRegistry?.listMineSiteReferences?.()||[];
const cacheProbeCounts=new Map();
for(const reference of cacheProbeReferences){
  const country=String(reference?.countryId||reference?.countryCode||reference?.countryIso3||'').trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(country))continue;
  cacheProbeCounts.set(country,(cacheProbeCounts.get(country)||0)+1);
}
const cacheProbeCountries=[...cacheProbeCounts.entries()]
  .sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0]))
  .slice(0,5).map(([country])=>country);
assert.equal(cacheProbeCountries.length,5,
  'the runtime fixture must provide at least five resource countries for the cache-retention regression');
for(const country of cacheProbeCountries){
  const hydrated=await runtime.hydrateCountry(country);
  assert.equal(hydrated?.status,'APPLIED',JSON.stringify({country,hydrated}));
}
// A second sweep lets the global reserve registry finish adding any country-specific
// reserve rows before asserting stable cache reuse.
for(const country of cacheProbeCountries){
  const hydrated=await runtime.hydrateCountry(country);
  assert.equal(hydrated?.status,'APPLIED',JSON.stringify({country,hydrated}));
}
const countryCacheBeforeRevisit=runtime.diagnostics().countryRowCaches;
const countryCacheRevisit=await runtime.hydrateCountry(cacheProbeCountries[0]);
assert.equal(countryCacheRevisit?.status,'APPLIED',JSON.stringify(countryCacheRevisit));
const countryCacheAfterRevisit=runtime.diagnostics().countryRowCaches;
assert.equal(countryCacheAfterRevisit.occurrenceRows.buildCount,countryCacheBeforeRevisit.occurrenceRows.buildCount,
  'revisiting the first country must not rebuild its occurrence rows after five-country hydration');
assert.equal(countryCacheAfterRevisit.siteExecutionRows.buildCount,countryCacheBeforeRevisit.siteExecutionRows.buildCount,
  'revisiting the first country must not rebuild its site execution rows after five-country hydration');
assert.ok(countryCacheAfterRevisit.occurrenceRows.cacheHitCount>countryCacheBeforeRevisit.occurrenceRows.cacheHitCount,
  'occurrence rows must report a warm cache hit on the revisited country');
assert.ok(countryCacheAfterRevisit.siteExecutionRows.cacheHitCount>countryCacheBeforeRevisit.siteExecutionRows.cacheHitCount,
  'site execution rows must report a warm cache hit on the revisited country');
assert.ok(countryCacheAfterRevisit.occurrenceRows.entryCount>=5&&countryCacheAfterRevisit.siteExecutionRows.entryCount>=5,
  'both bounded country caches must retain all five active country entries');
assert.equal(countryCacheAfterRevisit.occurrenceRows.evictionCount,countryCacheBeforeRevisit.occurrenceRows.evictionCount,
  'a normal five-country simulation must not evict a warm occurrence cache entry');
assert.equal(countryCacheAfterRevisit.siteExecutionRows.evictionCount,countryCacheBeforeRevisit.siteExecutionRows.evictionCount,
  'a normal five-country simulation must not evict a warm site execution cache entry');

// Part 6 integration proof: the mine haul must be receipted at the sovereign
// warehouse before the existing warehouse-to-factory shipment can be dispatched.
const part6CopperSite=part6Data.records.find(site=>site.siteId==='SITE_CHL_collahuasi_copper_mine');
assert(part6CopperSite,'Part 6 copper pipeline fixture must exist');
globalThis.Game.state.transport.CHL=globalThis.Game.state.transport.CHL||{
  infrastructure:{
    roads:{capacityPerDay:50000,quality:0.9},rail:{capacityPerDay:120000,quality:0.8},
    ports:{capacityPerDay:200000,quality:0.9},bridges:{capacityPerDay:50000,quality:0.8},
    pipelines:{capacityPerDay:400000,quality:0.8}
  }
};
// The logistics runtime treats the active session as the authoritative selected player country.
const part6SimulationState=globalThis.Game.state.simulation;
part6SimulationState.session=part6SimulationState.session&&typeof part6SimulationState.session==='object'
  ?part6SimulationState.session:{};
part6SimulationState.session.playerCountryId=part6CopperSite.countryId;
part6SimulationState.playerCountryId=part6CopperSite.countryId;
const part6NextTurn=Number(globalThis.Game.state.simulation.turn||0)+1;
const part6ResourceBeforeMine=globalThis.Game.state.resource?.[part6CopperSite.countryId]||{};
const part6InventoryBeforeMine=Number(part6ResourceBeforeMine.inventory?.[part6CopperSite.resourceId])||0;
const part6WarehouseBeforeMine=Number(part6ResourceBeforeMine.warehouse?.availableByResource?.[part6CopperSite.resourceId])||0;
const part6PriorProduction=(part6ResourceBeforeMine.mineProductionLedger||[]).find(row=>
  Number(row.turn??row.simulationTurn)===part6NextTurn&&
  String(row.siteReferenceKey||'')===String(part6CopperSite.siteId)&&
  String(row.resourceId||'')===String(part6CopperSite.resourceId)&&
  Number(row.quantity||0)>0
);
const part6PriorBatch=part6PriorProduction
  ?(part6ResourceBeforeMine.batches||[]).find(row=>String(row.batchId||'')===String(part6PriorProduction.batchId||'')):null;
const part6PriorFlow=part6PriorProduction
  ?(part6ResourceBeforeMine.industrialNetwork?.siteFlowLedger||[]).find(row=>String(row.batchId||'')===String(part6PriorProduction.batchId||'')):null;
const part6PriorActiveHaul=part6PriorProduction
  ?(part6ResourceBeforeMine.industrialNetwork?.shipments||[]).some(row=>
    String(row.batchId||'')===String(part6PriorProduction.batchId||'')&&row.shipmentType==='MINE_TO_WAREHOUSE'&&
    ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(row.status||''))):false;
const part6ExpectedStockDebit=part6PriorBatch&&!part6PriorFlow?.mineLogisticsStockDebited&&!part6PriorActiveHaul
  ?Math.max(0,Number(part6PriorBatch.remainingQuantity??part6PriorBatch.quantity)||0):0;
globalThis.Game.state.simulation.turn=part6NextTurn;
const part6Pipeline=await industrial.executeSitePipeline({
  countryId:part6CopperSite.countryId,siteId:part6CopperSite.siteId,
  resourceId:part6CopperSite.resourceId,autoCommissionFactory:true,transportMode:'rail'
});
assert.equal(part6Pipeline.status,'IN_TRANSIT',
  'new Part 6 mine must enter the same production pipeline: '+JSON.stringify({
    status:part6Pipeline.status,reason:part6Pipeline.reason,siteId:part6Pipeline.siteId,
    resourceId:part6Pipeline.resourceId,extractionStatus:part6Pipeline.extractionStatus,
    shipmentStatus:part6Pipeline.shipmentStatus,detail:part6Pipeline.detail,quantity:part6Pipeline.quantity,shipment:part6Pipeline.shipment
  }));
assert.equal(part6Pipeline.extractionStatus,'COMMITTED');
assert.equal(part6Pipeline.shipment?.shipmentType,'MINE_TO_WAREHOUSE');
assert.ok(part6Pipeline.batchId&&part6Pipeline.shipmentId&&part6Pipeline.factoryId,
  'Part 6 pipeline must persist its extraction batch, mine shipment and factory identities');
const part6MineShipment=part6Pipeline.shipment;
const part6SourceState=runtime.countryResourceState(part6CopperSite.countryId);
const part6MineQuantity=Number(part6MineShipment.quantity||0);
assert.ok(part6MineQuantity>0);
assert.equal(part6SourceState.batches.find(item=>String(item.batchId)===String(part6Pipeline.batchId))?.warehouseId,null,
  'the Part 6 source batch stays at the mine until its first-leg receipt');
const part6ExpectedInventoryAfterMine=Math.max(0,part6InventoryBeforeMine-part6ExpectedStockDebit);
const part6ExpectedWarehouseAfterMine=Math.max(0,part6WarehouseBeforeMine-part6ExpectedStockDebit);
assert.ok(Math.abs((Number(part6SourceState.warehouse?.availableByResource?.[part6CopperSite.resourceId])||0)-part6ExpectedWarehouseAfterMine)<1e-5,
  'mine haul must remove only a previously committed, not-yet-held source batch from raw warehouse stock: '+JSON.stringify({
    before:part6WarehouseBeforeMine,after:Number(part6SourceState.warehouse?.availableByResource?.[part6CopperSite.resourceId])||0,
    expectedDebit:part6ExpectedStockDebit,priorBatch:part6PriorBatch?.batchId||null,priorFlowDebited:part6PriorFlow?.mineLogisticsStockDebited===true,
    priorActiveHaul:part6PriorActiveHaul
  }));
assert.ok(Math.abs((Number(part6SourceState.inventory?.[part6CopperSite.resourceId])||0)-part6ExpectedInventoryAfterMine)<1e-5,
  'mine haul must debit aggregate inventory exactly once for a pre-existing batch and must not debit pre-existing country stock: '+JSON.stringify({
    before:part6InventoryBeforeMine,after:Number(part6SourceState.inventory?.[part6CopperSite.resourceId])||0,
    expectedDebit:part6ExpectedStockDebit
  }));
advanceToGameTurn(globalThis.Game.state,Number(part6MineShipment.etaTurn));
const part6MineArrival=industrial.advanceShipments(part6CopperSite.countryId);
assert.ok(part6MineArrival.mineDelivered>=1,'Part 6 mine haul must reach the warehouse: '+JSON.stringify(part6MineArrival));
const part6AfterMineArrival=runtime.countryResourceState(part6CopperSite.countryId);
const part6WarehouseReceipt=part6AfterMineArrival.warehouse.receipts.find(item=>String(item.receiptId)==='MINE-WH-REC:'+String(part6MineShipment.shipmentId));
assert.equal(part6WarehouseReceipt?.status,'RECEIVED');
const part6FactoryShipment=(part6AfterMineArrival.industrialNetwork?.shipments||[]).find(item=>
  String(item.batchId)===String(part6Pipeline.batchId)&&item.shipmentType==='RAW_TO_FACTORY'&&item.status==='IN_TRANSIT');
assert.ok(part6FactoryShipment,'Part 6 factory shipment must start only after warehouse receipt');
assert.equal(part6FactoryShipment.siteId,part6CopperSite.siteId);
const part6PreDelivery=runtime.countryResourceState(part6CopperSite.countryId);
const part6ShipQuantity=Number(part6FactoryShipment.quantity||0);
assert.ok(part6ShipQuantity>0);
assert.ok(Number(part6PreDelivery?.warehouse?.reservedByResource?.[part6CopperSite.resourceId]||0)>=part6ShipQuantity,
  'Part 6 factory shipment must reserve material from its country raw warehouse');
advanceToGameTurn(globalThis.Game.state,Number(part6FactoryShipment.etaTurn));
const part6Delivery=industrial.advanceShipments(part6CopperSite.countryId);
assert.ok(part6Delivery.delivered>=1,'global country turn must deliver the due Part 6 factory shipment: '+JSON.stringify({delivered:part6Delivery.delivered,targetShipmentId:part6FactoryShipment.shipmentId}));
const part6Delivered=part6Delivery.shipments.find(item=>item.shipmentId===part6FactoryShipment.shipmentId);
assert(part6Delivered);
assert.equal(part6Delivered.destinationStatus,'FACTORY_RECEIVED');
assert.ok(['IN_PROGRESS','AWAITING_PROCESSING'].includes(part6Delivered.processingStatus),JSON.stringify(part6Delivered));
if(part6Delivered.processingStatus==='AWAITING_PROCESSING'){
  assert.equal(part6Delivered.processing?.reason,'FACTORY_CYCLE_ALREADY_RUNNING');
  assert.equal(part6Delivered.processingTransactionId,null,'Part 6 shipment must not attach to an unrelated cycle');
}
await completeFactoryCycle(globalThis.Game.state,industrial,part6CopperSite.countryId,part6Pipeline.factoryId,part6Pipeline.batchId);
const part6PostDelivery=runtime.countryResourceState(part6CopperSite.countryId);
const part6Flow=part6PostDelivery.industrialNetwork?.siteFlowLedger?.find(item=>String(item.batchId)===String(part6Pipeline.batchId));
const part6CompletedDelivery=(part6PostDelivery.industrialNetwork?.deliveries||[]).find(item=>String(item.shipmentId)===String(part6FactoryShipment.shipmentId));
assert.equal(part6CompletedDelivery?.processingStatus,'PROCESSED','Part 6 output must commit after its calendar finish date');
assert.ok(Object.keys(part6CompletedDelivery?.processing?.outputs||{}).some(key=>Number(part6PostDelivery.inventory?.[key])>0),
  'Part 6 finished products must enter the owning country inventory');
assert.ok(part6Flow?.stages?.some(step=>step.stage==='PROCESSING'&&step.status==='COMPLETED'));
assert.ok((part6PostDelivery.industrialNetwork?.siteExecutions||[]).some(item=>
  item.siteId===part6CopperSite.siteId&&item.batchId===part6Pipeline.batchId&&item.occurrenceKey===part6Pipeline.occurrenceKey),
  'Part 6 industrial ledger must retain the exact site, batch and occurrence identities');


if(nativeFetch)globalThis.fetch=nativeFetch;
// This completion line is reached only after the real site pipeline assertions above pass.
console.log('OMEGA RESOURCE JSON -> MINE -> BATCH -> WAREHOUSE -> FACTORY EVENT TEST PASSED');