import assert from 'node:assert/strict';
import fs from 'node:fs';

// The base regression boots the authoritative resource runtime and verifies the
// complete 503-site reference/controller registry. This test then exercises all
// eligible sites in a batch so unrelated background residual shipments cannot
// steal factory capacity from a site under test.
await import('./omega_resource_endowment_runtime.test.mjs');

const game=globalThis.Game;
const runtime=globalThis.OmegaResourceEndowmentRuntime||globalThis.Omega?.ResourceEndowmentRuntime;
const industry=globalThis.OmegaResourceIndustrialNetwork||globalThis.Omega?.ResourceIndustrialNetwork;
assert.ok(game?.state&&runtime?.countryResourceState&&industry?.executeSitePipeline,
  'authoritative resource and industrial runtimes must be available');

const criticalBatch=JSON.parse(fs.readFileSync(
  new URL('../resource_site_country_mineplay_critical_batch_20261024_v1.json',import.meta.url),'utf8'));
assert.equal(criticalBatch.records.length,58,'all critical-mineral records must be loaded');
assert.equal(new Set(criticalBatch.records.map(x=>x.siteId)).size,58,'critical-mineral site IDs must be unique');
const criticalCountries=new Set(criticalBatch.records.map(x=>String(x.countryId||'').toUpperCase()));
assert.equal(criticalCountries.size,23,'critical-mineral coverage must span 23 countries');
for(const site of criticalBatch.records){
  const countryId=String(site.countryId||'').toUpperCase();
  const resourceId=String(site.identity?.resourceTypeId||'').toLowerCase();
  assert.match(countryId,/^[A-Z]{3}$/);
  assert.equal(site.identity?.countryIso3,countryId);
  assert.equal(site.location?.countryBoundaryKey,countryId);
  assert.equal(site.map?.countryIsolationKey,countryId);
  assert.equal(site.map?.resourceFilterKey,resourceId);
  assert.ok(Number(site.quantitative?.production?.rate)>0,site.siteId+': production rate missing');
  assert.ok(Number(site.quantitative?.reserve?.quantity)>0,site.siteId+': simulation reserve missing');
  assert.ok(site.sources?.some(x=>typeof x.url==='string'&&/^https?:/.test(x.url)),
    site.siteId+': source URL evidence missing');
}

// Reserve quantities are gameplay/scenario parameters unless separately source-verified.
// Keep this provenance boundary executable so quantity values cannot be mistaken for geological facts.
const reserveSimulation=JSON.parse(fs.readFileSync(
  new URL('../resource_site_reserve_simulation_v1.json',import.meta.url),'utf8'));
assert.equal(reserveSimulation.authority,'SCENARIO_SIMULATION_DATA');
assert.equal(reserveSimulation.records.length,reserveSimulation.siteCount,
  'simulation reserve manifest count must match its data rows');
assert.equal(new Set(reserveSimulation.records.map(row=>row.siteId)).size,reserveSimulation.records.length,
  'simulation reserve rows must retain unique canonical site IDs');
let simulatedReserveRows=0,notApplicableReserveRows=0;
for(const row of reserveSimulation.records){
  assert.match(String(row.siteId||''),/^SITE_[A-Z]{3}_/);
  assert.equal(String(row.provenance?.authority||''),'SCENARIO_SIMULATION_DATA',row.siteId+': missing simulation authority');
  assert.equal(row.provenance?.realWorldDataRequired,false,row.siteId+': reserve must not claim real-world measurement');
  if(row.commercialExtraction===false){
    notApplicableReserveRows++;
    assert.equal(String(row.reserve?.status||'').toUpperCase(),'NOT_APPLICABLE',
      row.siteId+': non-commercial placeholder must not receive an invented reserve');
    assert.equal(row.reserve?.quantity,null,row.siteId+': non-commercial placeholder quantity must remain null');
    assert.equal(row.reserve?.unit,null,row.siteId+': non-commercial placeholder unit must remain null');
    continue;
  }
  simulatedReserveRows++;
  assert.equal(String(row.reserve?.status||'').toUpperCase(),'SIMULATED',row.siteId+': reserve must stay simulation-only');
  assert.ok(Number(row.reserve?.quantity)>0&&String(row.reserve?.unit||'').trim(),
    row.siteId+': simulated reserve requires a positive quantity and explicit unit');
}
assert.equal(simulatedReserveRows,reserveSimulation.commercialSiteCount,
  'only the catalogued commercial sites may carry simulated reserves');
assert.equal(notApplicableReserveRows,reserveSimulation.notApplicableSiteCount,
  'the four non-commercial placeholder rows must remain NOT_APPLICABLE');

// The additive 305-site quantity-completion dataset is intentionally optional until its own
// change lands on this branch. Once present, assert its complete scenario-only provenance contract.
const completionPath=new URL('../resource_site_quantity_completion_v1.json',import.meta.url);
if(fs.existsSync(completionPath)){
  const completion=JSON.parse(fs.readFileSync(completionPath,'utf8'));
  const completionRows=Array.isArray(completion.records)?completion.records:[];
  assert.equal(completion.datasetId,'OMEGA_RESOURCE_SITE_QUANTITY_COMPLETION_V1');
  assert.equal(completion.authority,'SIMULATED_GAMEPLAY_COMPLETION_ONLY');
  assert.equal(completion.simulationOnly,true);
  assert.equal(completion.recordCount,305,'the additive simulation-only tranche must retain 305 rows');
  assert.equal(completionRows.length,completion.recordCount);
  assert.equal(completion.uniqueSiteCount,new Set(completionRows.map(row=>row.siteId)).size);
  assert.equal(completion.uniqueSiteCount,completionRows.length,'simulation completion site IDs must be unique');
  for(const row of completionRows){
    const siteId=String(row.siteId||'');
    const reserve=row.reserve||{},normalization=reserve.quantityNormalization||{},provenance=row.provenance||{};
    assert.match(siteId,/^SITE_[A-Z]{3}_/,siteId+': invalid site identity');
    assert.equal(String(reserve.status||'').toUpperCase(),'SIMULATED',siteId+': completion reserve must be simulation-only');
    assert.equal(String(reserve.authority||''),'SCENARIO_SIMULATION_DATA',siteId+': reserve authority must stay simulation-only');
    assert.equal(String(provenance.authority||''),'SIMULATED_GAMEPLAY_COMPLETION_ONLY',siteId+': completion authority mismatch');
    assert.equal(provenance.simulationOnly,true,siteId+': completion record must be simulation-only');
    assert.equal(provenance.sourceQuantityPreserved,true,siteId+': source quantity must be preserved');
    assert.ok(Number(provenance.sourceReserveQuantity)>0&&String(provenance.sourceReserveUnit||'').trim(),
      siteId+': original source quantity and unit are required');
    assert.ok(Number(reserve.quantity)>0&&String(reserve.unit||'').trim(),
      siteId+': canonical simulated quantity and unit are required');
    assert.equal(normalization.simulationOnly,true,siteId+': normalization may not claim geological measurement');
    assert.equal(normalization.normalizedUnit,reserve.unit,siteId+': normalized unit must match gameplay unit');
    assert.ok(closeEnough(normalization.normalizedQuantity,reserve.quantity),
      siteId+': normalized quantity must match the simulated reserve value');
    assert.ok(closeEnough(normalization.sourceQuantity,provenance.sourceReserveQuantity),
      siteId+': normalization and provenance must preserve the source quantity');
    assert.equal(normalization.sourceUnit,provenance.sourceReserveUnit,
      siteId+': normalization and provenance must preserve the source unit');
    assert.equal(row.simulation?.simulationOnly,true,siteId+': nested simulation payload must remain flagged');
    assert.equal(String(row.simulation?.production?.status||'').toUpperCase(),'SIMULATED',
      siteId+': production rate must remain simulation-only');
  }
}

const world=game.state.resource||{};
const allRefs=[];
const eligibleById=new Map();
for(const [countryId,row] of Object.entries(world)){
  for(const ref of Array.isArray(row?.mineSiteReferences)?row.mineSiteReferences:[]){
    const siteId=String(ref?.siteReferenceKey||ref?.siteId||'').trim();
    const resourceId=String(ref?.resourceId||ref?.resourceTypeId||ref?.identity?.resourceTypeId||'').trim().toLowerCase();
    const owner=String(ref?.countryId||countryId).trim().toUpperCase();
    if(!siteId||siteId.startsWith('SITE_TEST_'))continue;
    allRefs.push({countryId:owner,siteId,resourceId,ref});
    if(!resourceId||!owner)continue;
    if(ref?.runtime?.aliasOfSiteId||ref?.rawSiteReference?.runtime?.aliasOfSiteId)continue;
    if(ref?.map?.markerEligible===false||ref?.rawSiteReference?.map?.markerEligible===false)continue;
    if(ref?.commercialExtraction===false||ref?.operation?.commercialExtraction===false||
       ref?.rawSiteReference?.commercialExtraction===false||
       ref?.rawSiteReference?.operation?.commercialExtraction===false)continue;
    const status=String(ref?.operation?.status||ref?.operation?.operationalStatus||
      ref?.status||ref?.rawSiteReference?.operation?.status||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_');
    if(/(^|_)(NOT_APPLICABLE|INACTIVE|NOT_ACTIVE|HISTORICAL|HISTORICALLY|SUSPENDED|CLOSED|ABANDONED|DEPLETED|CARE_AND_MAINTENANCE|CESSATION_OF_PRODUCTION|DISPUTED_OPERATION|RESOURCE_IDENTITY_UNVERIFIED)(_|$)/.test(status))continue;
    eligibleById.set(siteId,{countryId:owner,siteId,resourceId,ref});
  }
}
assert.equal(allRefs.length,561,
  'the unified runtime must expose all 561 baseline-plus-critical-mineral site reference rows');
assert.equal(new Set(allRefs.map(x=>x.siteId)).size,561,
  'all 561 runtime reference rows must have unique physical site IDs');
const allEligibleSites=[...eligibleById.values()].sort((a,b)=>a.countryId.localeCompare(b.countryId)||a.siteId.localeCompare(b.siteId));
assert.ok(allEligibleSites.length>=400,'runtime audit must cover at least 400 unique executable baseline sites; got '+allEligibleSites.length);
const eligibleIds=new Set(allEligibleSites.map(x=>x.siteId));
for(const site of criticalBatch.records){
  assert.ok(eligibleIds.has(site.siteId),site.siteId+': critical-mineral site missing from executable runtime references');
}
// Run every eligible, unique, canonical site through extraction, shipment, receipt, and factory output.
// The test provisions simulation-only infrastructure and an explicitly commissioned test asset per site;
// it does not claim every real-game save contains these assets or facilities.
const sites=allEligibleSites;
assert.ok(sites.length>=400,'the end-to-end matrix must run every eligible site, got '+sites.length);
assert.ok(sites.every(Boolean),'every eligible site must resolve to a live executable reference');

function commissionGameplayMine(entry){
  const {siteId,countryId,resourceId,ref}=entry;
  const root=game.state;
  if(!root.resource)throw new Error('EXHAUSTIVE_TEST_RESOURCE_STATE_MISSING');
  const row=root.resource[countryId]||(root.resource[countryId]={});
  row.mineAssets=Array.isArray(row.mineAssets)?row.mineAssets:[];
  const existing=row.mineAssets.find(x=>String(x?.siteId||'')===siteId&&
    String(x?.status||'').toUpperCase()==='OPERATIONAL');
  const asset=existing||{
    mineId:'TEST-COMMISSIONED-MINE:'+countryId+':'+siteId,
    id:'TEST-COMMISSIONED-MINE:'+countryId+':'+siteId,
    siteId,siteName:ref?.siteName||ref?.rawSiteReference?.siteName||siteId,
    resourceId,countryId,ownerCountryId:countryId,status:'OPERATIONAL',
    buildProjectId:'TEST-COMMISSION:'+siteId,commissionedTurn:Number(root.simulation?.turn)||1,
    capacityMultiplier:1,workersRequired:1,workersCommitted:1,
    sourceSiteStatus:String(ref?.operation?.status||ref?.status||'NOT_RECORDED'),
    siteIdentityAuthority:'CANONICAL_SITE_REGISTRY',
    authority:'SIMULATED_PLAYER_MINE_ASSET_TEST_FIXTURE',
    productionStatus:'READY_FOR_EXTRACTION',lastProductionTurn:null
  };
  if(!existing)row.mineAssets.push(asset);
  if(typeof globalThis.dispatchEvent==='function'&&typeof globalThis.CustomEvent==='function'){
    globalThis.dispatchEvent(new CustomEvent('OMEGA_RESOURCE_MINE_COMMISSIONED',{
      detail:{countryId,payload:{countryId,siteId,resourceId,mineId:asset.mineId,status:'OPERATIONAL',
        sourceSiteStatus:asset.sourceSiteStatus,authority:'SIMULATED_PLAYER_MINE_ASSET_TEST_FIXTURE'}}
    }));
  }
  const commission=(row.commissionedSites||[]).find(x=>String(x?.siteId||'')===siteId&&
    String(x?.status||'').toUpperCase()==='COMMISSIONED');
  if(!commission)throw new Error('MINE_COMMISSION_EVENT_DID_NOT_UPDATE_POLICY_LEDGER:'+countryId+':'+siteId);
}
function resourceBalance(map,resourceId){
  const key=Object.keys(map||{}).find(k=>String(k).toLowerCase()===String(resourceId).toLowerCase());
  return key===undefined?0:(Number(map[key])||0);
}
function closeEnough(a,b){
  const left=Number(a)||0,right=Number(b)||0;
  return Math.abs(left-right)<=1e-5*Math.max(1,Math.abs(left),Math.abs(right));
}
function advanceOneTurn(){
  const sim=game.state.simulation||(game.state.simulation={});
  const date=new Date(String(sim.date||'2015-01-01')+'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate()+Math.max(1,Number(sim.daysPerTurn)||1));
  sim.date=date.toISOString().slice(0,10);
  sim.turn=(Number(sim.turn)||1)+1;
}
function advanceTo(targetTurn,targetDate){
  const sim=game.state.simulation||(game.state.simulation={});
  const turnTarget=Math.max(1,Number(targetTurn)||1);
  const dateTarget=targetDate?String(targetDate):null;
  let guard=0;
  while((Number(sim.turn)||1)<turnTarget||
    (dateTarget&&String(sim.date||'2015-01-01')<dateTarget)){
    advanceOneTurn();
    if(++guard>20000)throw new Error('EXHAUSTIVE_PIPELINE_CLOCK_GUARD');
  }
}
function provisionSimulationInfrastructure(countryId){
  const roots=[...new Set([game.state,globalThis.OmegaMinistryStateProvider?.getState?.()].filter(Boolean))];
  for(const rootState of roots){
    rootState.transport=rootState.transport||{};
    const t=rootState.transport[countryId]||(rootState.transport[countryId]={});
    t.infrastructure=t.infrastructure||{};
    t.infrastructure.roads=t.infrastructure.roads||{capacityPerDay:50000,quality:.9};
    t.infrastructure.rail=t.infrastructure.rail||{capacityPerDay:120000,quality:.8};
    t.infrastructure.ports=t.infrastructure.ports||{capacityPerDay:200000,quality:.9};
    t.infrastructure.bridges=t.infrastructure.bridges||{capacityPerDay:50000,quality:.8};
    t.infrastructure.pipelines=t.infrastructure.pipelines||{capacityPerDay:400000,quality:.8};
    t.infrastructure.utilitySupply={electricityMWhPerDay:1000000,waterM3PerDay:1000000,
      authority:'EXHAUSTIVE_TEST_FIXTURE',status:'AVAILABLE',simulationOnly:true,assets:[]};
    rootState.economy=rootState.economy||{};
    const e=rootState.economy[countryId]||(rootState.economy[countryId]={productionAssets:[]});
    if(!Array.isArray(e.productionAssets))e.productionAssets=[];
    e.unemploymentCount=Math.max(Number(e.unemploymentCount)||0,100000);
    e.laborForce=Math.max(Number(e.laborForce)||0,1000000);
    e.unemployment_rate=10;
  }
}
function liveCountryState(countryId){return game.state.resource?.[countryId]||{};}
function flowFor(countryId,batchId){
  return (runtime.countryResourceState(countryId)?.industrialNetwork?.siteFlowLedger||[])
    .find(x=>String(x.batchId)===String(batchId));
}
function cycleFor(countryId,factoryId){
  return runtime.countryResourceState(countryId)?.industrialNetwork?.factoryProductionCycles?.[String(factoryId)]||null;
}
function flowProcessed(countryId,batchId){
  return !!flowFor(countryId,batchId)?.stages?.some(x=>x.stage==='PROCESSING'&&x.status==='COMPLETED');
}
const counts={references:new Set(allRefs.map(x=>x.siteId)).size,baselineEligible:allEligibleSites.length,eligible:sites.length,started:0,delivered:0,processed:0};
const failures=[];
const pipelines=[];
const countryIds=new Set();
for(const site of sites){
  provisionSimulationInfrastructure(site.countryId);
  countryIds.add(site.countryId);
  game.state.simulation=game.state.simulation||{};
  game.state.simulation.turn=(Number(game.state.simulation.turn)||1)+1;
  if(!game.state.simulation.date)game.state.simulation.date='2015-01-01';
  commissionGameplayMine(site);
  const result=await industry.executeSitePipeline({
    countryId:site.countryId,siteId:site.siteId,resourceId:site.resourceId,
    quantity:1,autoCommissionFactory:true,transportMode:'rail'
  });
  if(result?.status!=='IN_TRANSIT'){
    failures.push({siteId:site.siteId,countryId:site.countryId,resourceId:site.resourceId,
      stage:'START',status:result?.status,reason:result?.reason,detail:result?.detail});
    continue;
  }
  counts.started++;
  assert.ok(result.batchId&&result.shipmentId&&result.factoryId&&result.occurrenceKey,
    site.siteId+': execution must persist batch, shipment, factory and occurrence IDs');
  const pre=runtime.countryResourceState(site.countryId)||{};
  const batch=(pre.batches||[]).find(x=>String(x.batchId)===String(result.batchId));
  assert.ok(batch,site.siteId+': extracted batch missing from country state');
  assert.equal(batch.countryId,site.countryId,site.siteId+': batch country mismatch');
  assert.equal(batch.warehouseId,'WH-'+site.countryId+'-RAW',site.siteId+': raw warehouse mismatch');
  assert.ok(Number(batch.quantity)>0,site.siteId+': extraction quantity must be positive');
  pipelines.push({site,result,initialBatchRemaining:Number(batch.remainingQuantity??batch.quantity)||0});
}
assert.deepEqual(failures,[],'site extraction/dispatch failures: '+JSON.stringify(failures.slice(0,20)));

const maxEta=Math.max(Number(game.state.simulation.turn)||1,
  ...pipelines.map(x=>Number(x.result.shipment?.etaTurn)||Number(game.state.simulation.turn)||1));
advanceTo(maxEta);
for(const countryId of countryIds){
  // The base fixture preloads raw batches for all mines. Prevent those unrelated
  // residual batches from being auto-routed to a different site's factory during
  // this targeted batch run; each pipeline shipment is already explicitly dispatched.
  const network=liveCountryState(countryId).industrialNetwork;
  for(const flow of network?.siteFlowLedger||[])flow.lastResidualDispatchTurn=Number(game.state.simulation.turn)||1;
  const countryPipelines=pipelines.filter(x=>x.site.countryId===countryId);
  const deliveryStateBefore=runtime.countryResourceState(countryId)||{};
  const preNetwork=deliveryStateBefore.industrialNetwork||{};
  const preDeliveryStatus=new Map((preNetwork.deliveries||[]).map(x=>[String(x.shipmentId||''),String(x.status||'')+'|'+String(x.destinationStatus||'')]));
  const preShipmentStatus=new Map((preNetwork.shipments||[]).map(x=>[String(x.shipmentId||''),String(x.status||'')]));
  const balanceBefore=new Map([...new Set(countryPipelines.map(x=>x.site.resourceId))].map(resourceId=>[resourceId,{
    inventory:resourceBalance(deliveryStateBefore.inventory,resourceId),
    warehouse:resourceBalance(deliveryStateBefore.warehouse?.availableByResource,resourceId),
    reserved:resourceBalance(deliveryStateBefore.warehouse?.reservedByResource,resourceId)
  }]));
  const deliveryResult=industry.advanceShipments(countryId);
  const deliveryStateAfter=runtime.countryResourceState(countryId)||{};
  for(const [resourceId,before] of balanceBefore){
    const network=deliveryStateAfter.industrialNetwork||{};
    const currentDeliveries=(network.deliveries||[]).filter(x=>
      String(x.resourceId||'').toLowerCase()===String(resourceId).toLowerCase()&&
      (String(x.status||'').toUpperCase()==='DELIVERED'||String(x.destinationStatus||'').toUpperCase()==='FACTORY_RECEIVED')&&
      preDeliveryStatus.get(String(x.shipmentId||''))!==String(x.status||'')+'|'+String(x.destinationStatus||''));
    const deliveredQuantity=currentDeliveries.reduce((sum,x)=>sum+(Number(x.quantity)||0),0);
    const newTransitQuantity=(network.shipments||[]).filter(x=>
      String(x.resourceId||'').toLowerCase()===String(resourceId).toLowerCase()&&
      String(x.status||'').toUpperCase()==='IN_TRANSIT'&&preShipmentStatus.get(String(x.shipmentId||''))!=='IN_TRANSIT')
      .reduce((sum,x)=>sum+(Number(x.quantity)||0),0);
    const afterInventory=resourceBalance(deliveryStateAfter.inventory,resourceId);
    const afterWarehouse=resourceBalance(deliveryStateAfter.warehouse?.availableByResource,resourceId);
    const afterReserved=resourceBalance(deliveryStateAfter.warehouse?.reservedByResource,resourceId);
    if(!closeEnough(before.inventory-afterInventory,deliveredQuantity)||
       !closeEnough(before.warehouse-afterWarehouse,deliveredQuantity)||
       !closeEnough(afterReserved,before.reserved-deliveredQuantity+newTransitQuantity)){
      failures.push({countryId,resourceId,stage:'DELIVERY_BALANCE_RECONCILIATION',
        before,after:{inventory:afterInventory,warehouse:afterWarehouse,reserved:afterReserved},
        deliveredQuantity,newTransitQuantity,
        inventoryDebit:Number((before.inventory-afterInventory).toFixed(6)),
        warehouseDebit:Number((before.warehouse-afterWarehouse).toFixed(6))});
    }
  }
  for(const pipeline of countryPipelines){
    const shipmentId=String(pipeline.result.shipmentId);
    const post=runtime.countryResourceState(countryId)||{};
    const network=post.industrialNetwork||{};
    const deliveredRows=(network.deliveries||[]).filter(x=>String(x.shipmentId)===shipmentId&&
      String(x.destinationStatus||'').toUpperCase()==='FACTORY_RECEIVED');
    const delivered=deliveredRows[0]||(deliveryResult.shipments||[]).find(x=>String(x.shipmentId)===shipmentId);
    const shipment=(network.shipments||[]).find(x=>String(x.shipmentId)===shipmentId);
    const sourceBatch=(post.batches||[]).find(x=>String(x.batchId)===String(pipeline.result.batchId));
    const sourceLot=post.inventoryLots?.[pipeline.result.batchId];
    const reservationId=String(delivered?.reservationId||shipment?.reservationId||'');
    const reservation=reservationId?network.reservations?.[reservationId]:null;
    const factory=(game.state.economy?.[countryId]?.productionAssets||[]).find(x=>
      String(x.id||x.assetId||x.projectId)===String(pipeline.result.factoryId));
    const inputLot=(factory?.inputBatchLots||[]).find(x=>
      String(x.batchId)===String(delivered?.factoryInputBatchId)||
      (Array.isArray(x.sourceBatchIds)&&x.sourceBatchIds.map(String).includes(String(pipeline.result.batchId))));
    const deliveryOkay=!!delivered&&delivered.destinationStatus==='FACTORY_RECEIVED'&&
      deliveredRows.length===1&&String(delivered.countryId||countryId).toUpperCase()===countryId&&
      String(delivered.batchId||'')===String(pipeline.result.batchId)&&
      String(shipment?.countryId||countryId).toUpperCase()===countryId&&
      String(shipment?.factoryId||'')===String(pipeline.result.factoryId)&&
      String(sourceBatch?.countryId||'').toUpperCase()===countryId&&
      String(sourceBatch?.warehouseId||'')==='WH-'+countryId+'-RAW'&&
      closeEnough(delivered.quantity,shipment?.quantity)&&
      closeEnough(Number(sourceBatch?.remainingQuantity)||0,pipeline.initialBatchRemaining-(Number(delivered.quantity)||0))&&
      (!sourceLot||closeEnough(sourceLot.remainingQuantity,sourceBatch?.remainingQuantity))&&
      String(reservation?.status||'').toUpperCase()==='DELIVERED'&&
      Number(reservation?.quantity||delivered?.quantity)>0&&
      String(factory?.countryId||'').toUpperCase()===countryId&&
      !!inputLot&&(inputLot.sourceBatchIds||[]).map(String).includes(String(pipeline.result.batchId));
    if(!deliveryOkay){
      failures.push({siteId:pipeline.site.siteId,countryId,resourceId:pipeline.site.resourceId,
        stage:'DELIVERY_LINEAGE_OR_RESERVATION',
        shipmentStatus:shipment?.status||null,deliveryStatus:delivered?.destinationStatus||null,
        duplicateDeliveryCount:deliveredRows.length,shipmentCountry:shipment?.countryId||null,
        deliveryCountry:delivered?.countryId||null,batchCountry:sourceBatch?.countryId||null,
        initialBatchRemaining:pipeline.initialBatchRemaining,deliveredQuantity:delivered?.quantity??null,
        finalBatchRemaining:sourceBatch?.remainingQuantity??null,reservationStatus:reservation?.status||null,
        factoryCountry:factory?.countryId||null,inputLotFound:!!inputLot,
        inputLotSourceBatchIds:inputLot?.sourceBatchIds||[]});
    } else {
      counts.delivered++;
    }
  }
}
assert.deepEqual(failures,[],'site dispatch/delivery failures: '+JSON.stringify(failures.slice(0,20)));

// Idempotency probe: replay the same country's shipment tick without advancing time.
// No target shipment may be delivered twice and no second debit of the same source batch is allowed.
for(const countryId of countryIds){
  const targets=pipelines.filter(x=>x.site.countryId===countryId);
  const before=runtime.countryResourceState(countryId)||{};
  const beforeNetwork=before.industrialNetwork||{};
  const snapshot=targets.map(item=>{
    const shipmentId=String(item.result.shipmentId),batchId=String(item.result.batchId);
    const shipment=(beforeNetwork.shipments||[]).find(x=>String(x.shipmentId)===shipmentId);
    const deliveries=(beforeNetwork.deliveries||[]).filter(x=>String(x.shipmentId)===shipmentId&&
      String(x.destinationStatus||'').toUpperCase()==='FACTORY_RECEIVED');
    const batch=(before.batches||[]).find(x=>String(x.batchId)===batchId);
    return {shipmentId,batchId,status:shipment?.status||null,deliveryCount:deliveries.length,
      remainingQuantity:Number(batch?.remainingQuantity??batch?.quantity)||0};
  });
  industry.advanceShipments(countryId);
  const after=runtime.countryResourceState(countryId)||{};
  const afterNetwork=after.industrialNetwork||{};
  for(const row of snapshot){
    const shipment=(afterNetwork.shipments||[]).find(x=>String(x.shipmentId)===row.shipmentId);
    const deliveries=(afterNetwork.deliveries||[]).filter(x=>String(x.shipmentId)===row.shipmentId&&
      String(x.destinationStatus||'').toUpperCase()==='FACTORY_RECEIVED');
    const batch=(after.batches||[]).find(x=>String(x.batchId)===row.batchId);
    const remainingQuantity=Number(batch?.remainingQuantity??batch?.quantity)||0;
    if(row.status!=='DELIVERED'||row.deliveryCount!==1||shipment?.status!=='DELIVERED'||
       deliveries.length!==1||!closeEnough(remainingQuantity,row.remainingQuantity)){
      failures.push({countryId,stage:'REPLAY_IDEMPOTENCY',shipmentId:row.shipmentId,batchId:row.batchId,
        before:{status:row.status,deliveryCount:row.deliveryCount,remainingQuantity:row.remainingQuantity},
        after:{status:shipment?.status||null,deliveryCount:deliveries.length,remainingQuantity}});
    }
  }
}
assert.deepEqual(failures,[],'duplicate delivery or repeated raw-stock debit detected: '+JSON.stringify(failures.slice(0,20)));

const targetPipelines=pipelines.filter(x=>flowFor(x.site.countryId,x.result.batchId));
for(let pass=0;pass<128;pass++){
  const pending=targetPipelines.filter(x=>!flowProcessed(x.site.countryId,x.result.batchId));
  if(!pending.length)break;
  let targetTurn=(Number(game.state.simulation.turn)||1)+1;
  let targetDate=String(game.state.simulation.date||'2015-01-01');
  for(const item of pending){
    const cycle=cycleFor(item.site.countryId,item.result.factoryId);
    if(!cycle){
      failures.push({siteId:item.site.siteId,countryId:item.site.countryId,stage:'FACTORY_CYCLE',
        reason:'FACTORY_CYCLE_NOT_CREATED',batchId:item.result.batchId,factoryId:item.result.factoryId});
      continue;
    }
    targetTurn=Math.max(targetTurn,Number(cycle.finishTurn)||targetTurn);
    if(cycle.finishDate&&String(cycle.finishDate)>targetDate)targetDate=String(cycle.finishDate);
  }
  advanceTo(targetTurn,targetDate);
  for(const countryId of countryIds)industry.processPendingFactoryInputs(countryId);
}
for(const item of targetPipelines){
  const {site,result}=item,countryId=site.countryId;
  if(!flowProcessed(countryId,result.batchId)){
    const cycle=cycleFor(countryId,result.factoryId);
    failures.push({siteId:site.siteId,countryId,resourceId:site.resourceId,stage:'PROCESSING',
      reason:'FINISHED_GOODS_NOT_COMMITTED',batchId:result.batchId,factoryId:result.factoryId,
      cycle,flow:flowFor(countryId,result.batchId)});
    continue;
  }
  const finalState=runtime.countryResourceState(countryId)||{};
  const delivery=(finalState.industrialNetwork?.deliveries||[])
    .find(x=>String(x.shipmentId)===String(result.shipmentId));
  if(delivery?.processingStatus!=='PROCESSED'){
    failures.push({siteId:site.siteId,countryId,stage:'DELIVERY_RECONCILIATION',
      status:delivery?.processingStatus||null,shipmentId:result.shipmentId,batchId:result.batchId});
    continue;
  }
  const outputs=delivery.processing?.outputs||delivery.processing?.outputQuantities||
    flowFor(countryId,result.batchId)?.outputQuantities||{};
  const inventory=finalState.inventory||{};
  const positiveOutput=Object.entries(outputs).some(([rid,quantity])=>{
    if(!(Number(quantity)>0))return false;
    const key=Object.keys(inventory).find(k=>String(k).toLowerCase()===String(rid).toLowerCase());
    return !!key&&Number(inventory[key])>0;
  });
  if(!positiveOutput){
    failures.push({siteId:site.siteId,countryId,stage:'FINISHED_GOODS',
      reason:'POSITIVE_OUTPUT_NOT_IN_SOVEREIGN_INVENTORY',outputs,inventoryKeys:Object.keys(inventory).slice(0,40)});
    continue;
  }
  const flow=flowFor(countryId,result.batchId)||{};
  const createdBatchIds=new Set([
    ...(Array.isArray(delivery.processing?.createdBatchIds)?delivery.processing.createdBatchIds:[]),
    ...(Array.isArray(flow.createdBatchIds)?flow.createdBatchIds:[])
  ].map(String));
  const transactionId=String(delivery.processingTransactionId||delivery.processing?.transactionId||flow.processingTransactionId||'');
  const finishedBatch=(finalState.batches||[]).find(x=>
    createdBatchIds.has(String(x.batchId||''))&&String(x.stage||'').toUpperCase()==='FINISHED'&&
    (x.sourceBatchIds||[]).map(String).includes(String(result.batchId))&&
    Object.keys(outputs).some(rid=>String(rid).toLowerCase()===String(x.resourceId||'').toLowerCase())&&
    String(x.countryId||'').toUpperCase()===countryId&&String(x.warehouseId||'')==='WH-'+countryId+'-PROCESSED'&&
    (!transactionId||String(x.processId||'')===transactionId));
  const ledger=(finalState.finishedGoodsLedger||[]).find(x=>
    (!transactionId||String(x.transactionId||'')===transactionId)&&
    String(x.factoryId||'')===String(result.factoryId)&&
    (x.sourceBatchIds||[]).map(String).includes(String(result.batchId))&&
    (x.createdBatchIds||[]).some(id=>createdBatchIds.has(String(id))));
  if(!finishedBatch||!ledger){
    failures.push({siteId:site.siteId,countryId,stage:'FINISHED_GOODS_LINEAGE',
      transactionId:transactionId||null,createdBatchIds:[...createdBatchIds],
      finishedBatchFound:!!finishedBatch,ledgerFound:!!ledger});
    continue;
  }
  counts.processed++;
}
assert.deepEqual(failures,[],'every-site production failures: '+JSON.stringify(failures.slice(0,20)));
assert.equal(counts.started,counts.eligible,'every eligible site must dispatch: '+JSON.stringify(counts));
assert.equal(counts.delivered,counts.eligible,'every eligible site must deliver to its factory: '+JSON.stringify(counts));
assert.equal(counts.processed,counts.eligible,'every eligible site must commit finished goods: '+JSON.stringify(counts));
console.log('OMEGA EXHAUSTIVE EVERY-SITE PRODUCTION PIPELINE PASSED '+JSON.stringify({
  ...counts,countries:countryIds.size,criticalMineralSites:criticalBatch.records.length
}));
