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

const world=game.state.resource||{};
const allRefs=[];
const eligibleById=new Map();
for(const [countryId,row] of Object.entries(world)){
  for(const ref of Array.isArray(row?.mineSiteReferences)?row.mineSiteReferences:[]){
    const siteId=String(ref?.siteReferenceKey||ref?.siteId||'').trim();
    const resourceId=String(ref?.resourceId||ref?.resourceTypeId||ref?.identity?.resourceTypeId||'').trim().toLowerCase();
    const owner=String(ref?.countryId||countryId).trim().toUpperCase();
    if(!siteId||!resourceId||!owner||siteId.startsWith('SITE_TEST_'))continue;
    allRefs.push({countryId:owner,siteId,resourceId,ref});
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
assert.equal(new Set(allRefs.map(x=>x.siteId)).size,559,
  'two legacy reference rows intentionally alias existing physical site IDs');
const sites=[...eligibleById.values()].sort((a,b)=>a.countryId.localeCompare(b.countryId)||a.siteId.localeCompare(b.siteId));
assert.ok(sites.length>=400,'exhaustive audit must cover at least 400 unique executable sites; got '+sites.length);
const eligibleIds=new Set(sites.map(x=>x.siteId));
for(const site of criticalBatch.records){
  assert.ok(eligibleIds.has(site.siteId),site.siteId+': critical-mineral site missing from executable runtime references');
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
const counts={references:new Set(allRefs.map(x=>x.siteId)).size,eligible:sites.length,started:0,delivered:0,processed:0};
const failures=[];
const pipelines=[];
const countryIds=new Set();
for(const site of sites){
  provisionSimulationInfrastructure(site.countryId);
  countryIds.add(site.countryId);
  game.state.simulation=game.state.simulation||{};
  game.state.simulation.turn=(Number(game.state.simulation.turn)||1)+1;
  if(!game.state.simulation.date)game.state.simulation.date='2015-01-01';
  const result=await industry.executeSitePipeline({
    countryId:site.countryId,siteId:site.siteId,resourceId:site.resourceId,
    quantity:25,autoCommissionFactory:true,transportMode:'rail'
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
  pipelines.push({site,result});
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
  const deliveryResult=industry.advanceShipments(countryId);
  for(const pipeline of pipelines.filter(x=>x.site.countryId===countryId)){
    const shipmentId=String(pipeline.result.shipmentId);
    const delivered=(runtime.countryResourceState(countryId)?.industrialNetwork?.deliveries||[])
      .find(x=>String(x.shipmentId)===shipmentId)||
      (deliveryResult.shipments||[]).find(x=>String(x.shipmentId)===shipmentId);
    if(!delivered||delivered.destinationStatus!=='FACTORY_RECEIVED'){
      failures.push({siteId:pipeline.site.siteId,countryId,resourceId:pipeline.site.resourceId,
        stage:'DELIVERY',shipmentId,deliveryStatus:delivered?.destinationStatus||null,deliveryResult});
      continue;
    }
    counts.delivered++;
  }
}
assert.deepEqual(failures,[],'site dispatch/delivery failures: '+JSON.stringify(failures.slice(0,20)));

const targetPipelines=pipelines.filter(x=>flowFor(x.site.countryId,x.result.batchId));
for(let pass=0;pass<12;pass++){
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
  counts.processed++;
}
assert.deepEqual(failures,[],'every-site production failures: '+JSON.stringify(failures.slice(0,20)));
assert.equal(counts.started,counts.eligible,'every eligible site must dispatch: '+JSON.stringify(counts));
assert.equal(counts.delivered,counts.eligible,'every eligible site must deliver to its factory: '+JSON.stringify(counts));
assert.equal(counts.processed,counts.eligible,'every eligible site must commit finished goods: '+JSON.stringify(counts));
console.log('OMEGA EXHAUSTIVE EVERY-SITE PRODUCTION PIPELINE PASSED '+JSON.stringify({
  ...counts,countries:countryIds.size,criticalMineralSites:criticalBatch.records.length
}));
