import assert from 'node:assert/strict';
import fs from 'node:fs';

// The base regression boots the authoritative resource runtime, verifies all 503
// site references/controllers, and proves the canonical + legacy extraction paths.
// This exhaustive layer then sends every eligible live site reference through the
// same industrial pipeline and verifies its own delivery, processing cycle and output.
await import('./omega_resource_endowment_runtime.test.mjs');

const game=globalThis.Game;
const runtime=globalThis.OmegaResourceEndowmentRuntime||globalThis.Omega?.ResourceEndowmentRuntime;
const industry=globalThis.OmegaResourceIndustrialNetwork||globalThis.Omega?.ResourceIndustrialNetwork;
assert.ok(game?.state&&runtime?.countryResourceState&&industry?.executeSitePipeline,
  'base runtime must expose the live resource and industrial systems');

const criticalBatch=JSON.parse(fs.readFileSync(new URL('../resource_site_country_mineplay_critical_batch_20261024_v1.json',import.meta.url),'utf8'));
assert.equal(criticalBatch.records.length,58,'all critical-mineral site records must be loaded');
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
  assert.ok(Number(site.quantitative?.production?.rate)>0,site.siteId+': positive production rate required');
  assert.ok(Number(site.quantitative?.reserve?.quantity)>0,site.siteId+': positive simulation reserve required');
  assert.ok(site.sources?.some(x=>/^https?:\\/\\//.test(x.url)),site.siteId+': source URL evidence missing');
}

const world=game.state.resource||{};
const refs=[];
for(const [countryId,row] of Object.entries(world)){
  for(const ref of Array.isArray(row?.mineSiteReferences)?row.mineSiteReferences:[]){
    const siteId=String(ref?.siteReferenceKey||ref?.siteId||'').trim();
    const resourceId=String(ref?.resourceId||ref?.resourceTypeId||ref?.identity?.resourceTypeId||'').trim().toLowerCase();
    const owner=String(ref?.countryId||countryId).trim().toUpperCase();
    if(!siteId||!resourceId||!owner)continue;
    if(ref?.runtime?.aliasOfSiteId||ref?.rawSiteReference?.runtime?.aliasOfSiteId)continue;
    if(ref?.map?.markerEligible===false||ref?.rawSiteReference?.map?.markerEligible===false)continue;
    if(ref?.commercialExtraction===false||ref?.operation?.commercialExtraction===false)continue;
    const status=String(ref?.operation?.status||ref?.operation?.operationalStatus||
      ref?.status||ref?.rawSiteReference?.operation?.status||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_');
    if(/(^|_)(NOT_APPLICABLE|INACTIVE|NOT_ACTIVE|HISTORICAL|HISTORICALLY|SUSPENDED|CLOSED|ABANDONED|DEPLETED|CARE_AND_MAINTENANCE|CESSATION_OF_PRODUCTION|DISPUTED_OPERATION|RESOURCE_IDENTITY_UNVERIFIED)(_|$)/.test(status))continue;
    refs.push({countryId:owner,siteId,resourceId,ref});
  }
}
const unique=new Map(refs.map(x=>[x.siteId,x]));
const sites=[...unique.values()].sort((a,b)=>a.countryId.localeCompare(b.countryId)||a.siteId.localeCompare(b.siteId));
assert.ok(sites.length>=400,'exhaustive audit must cover at least 400 unique executable sites; got '+sites.length);

function advanceOneTurn(){
  const sim=game.state.simulation||(game.state.simulation={});
  const date=new Date(String(sim.date||'2015-01-01')+'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate()+Math.max(1,Number(sim.daysPerTurn)||1));
  sim.date=date.toISOString().slice(0,10);
  sim.turn=(Number(sim.turn)||1)+1;
}
function advanceToTurn(target){
  let guard=0;
  while((Number(game.state.simulation?.turn)||1)<Number(target)){
    advanceOneTurn();
    if(++guard>10000)throw new Error('EXHAUSTIVE_PIPELINE_CLOCK_GUARD');
  }
}
function advanceToCycleFinish(cycle){
  const sim=game.state.simulation||(game.state.simulation={});
  const targetTurn=Math.max((Number(sim.turn)||1)+1,Number(cycle?.finishTurn)||0);
  const targetDate=cycle?.finishDate?new Date(String(cycle.finishDate)+'T00:00:00.000Z'):null;
  let guard=0;
  while((Number(sim.turn)||1)<targetTurn||(targetDate&&new Date(String(sim.date||'2015-01-01')+'T00:00:00.000Z')<targetDate)){
    advanceOneTurn();
    if(++guard>10000)throw new Error('EXHAUSTIVE_FACTORY_CLOCK_GUARD');
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
async function completeCycle(countryId,factoryId,batchId){
  const row=()=>runtime.countryResourceState(countryId)||{};
  const flow=()=> (row().industrialNetwork?.siteFlowLedger||[]).find(x=>String(x.batchId)===String(batchId));
  const completed=()=>flow()?.stages?.some(x=>x.stage==='PROCESSING'&&x.status==='COMPLETED');
  for(let i=0;i<128&&!completed();i++){
    const cycle=row().industrialNetwork?.factoryProductionCycles?.[String(factoryId)];
    if(cycle?.status==='IN_PROGRESS'&&cycle.finishDate)advanceToCycleFinish(cycle);
    else advanceOneTurn();
    const result=industry.processPendingFactoryInputs(countryId);
    if(i===127&&!completed())assert.fail('factory processing did not finish for '+batchId+': '+JSON.stringify({
      countryId,factoryId,batchId,cycle:row().industrialNetwork?.factoryProductionCycles?.[String(factoryId)]||null,
      blocked:(result?.blocked||[]).slice(0,4)
    }));
  }
  assert.ok(completed(),countryId+': completed processing ledger missing for '+batchId);
  const delivery=(row().industrialNetwork?.deliveries||[]).find(x=>String(x.batchId)===String(batchId));
  assert.ok(delivery,countryId+': source batch delivery record missing for '+batchId);
  assert.equal(delivery.processingStatus,'PROCESSED',countryId+': delivery not reconciled as processed for '+batchId);
  const outputs=delivery.processing?.outputs||delivery.processing?.outputQuantities||{};
  assert.ok(Object.entries(outputs).some(([rid,qty])=>Number(qty)>0&&Number(row().inventory?.[rid])>0),
    countryId+': no positive finished-goods output for '+batchId);
}
const counts={eligible:sites.length,started:0,delivered:0,processed:0};
const failures=[];
for(const site of sites){
  provisionSimulationInfrastructure(site.countryId);
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
  assert.ok(Number(pre.warehouse?.reservedByResource?.[site.resourceId]||0)>0,
    site.siteId+': shipment did not reserve sovereign warehouse stock');
  advanceToTurn(Number(result.shipment?.etaTurn)||((Number(game.state.simulation.turn)||1)+1));
  // Isolate this site's committed shipment from unrelated baseline extraction batches.
  // The base regression intentionally preloads every mine's raw stock; without this guard,
  // advanceShipments would auto-dispatch those unrelated batches to whichever compatible
  // factory happens to be first, masking the target site's own factory-cycle lineage.
  const countryRuntime=game.state.resource?.[site.countryId]||{};
  for(const flow of countryRuntime.industrialNetwork?.siteFlowLedger||[])flow.lastResidualDispatchTurn=Number(game.state.simulation.turn)||1;
  const deliveryResult=industry.advanceShipments(site.countryId);
  const delivered=(deliveryResult.shipments||[]).find(x=>String(x.shipmentId)===String(result.shipmentId));
  if(!delivered||delivered.destinationStatus!=='FACTORY_RECEIVED'){
    failures.push({siteId:site.siteId,countryId:site.countryId,resourceId:site.resourceId,
      stage:'DELIVERY',shipmentId:result.shipmentId,deliveryResult});
    continue;
  }
  counts.delivered++;
  await completeCycle(site.countryId,result.factoryId,result.batchId);
  counts.processed++;
}
assert.deepEqual(failures,[],'every eligible site must complete extraction and delivery without blocked routes: '+JSON.stringify(failures.slice(0,12)));
assert.equal(counts.started,counts.eligible,'every eligible site must dispatch a shipment: '+JSON.stringify(counts));
assert.equal(counts.delivered,counts.eligible,'every eligible site must deliver to its own factory: '+JSON.stringify(counts));
assert.equal(counts.processed,counts.eligible,'every eligible site must produce finished goods: '+JSON.stringify(counts));
console.log('OMEGA EXHAUSTIVE EVERY-SITE PRODUCTION PIPELINE PASSED '+JSON.stringify(counts));
