import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Reuse the canonical startup fixture and its real extraction/warehouse/factory runtime.
// This is intentionally a separate workflow entry point so CI can run the exhaustive gate alone.
await import('./omega_resource_endowment_runtime.test.mjs');

const root=new URL('../',import.meta.url);
const batch=JSON.parse(fs.readFileSync(new URL('../resource_site_country_mineplay_critical_batch_20261024_v1.json',import.meta.url),'utf8'));
const runtime=globalThis.OmegaResourceEndowmentRuntime;
const industry=globalThis.OmegaResourceIndustrialNetwork||globalThis.Omega?.ResourceIndustrialNetwork;
assert.ok(runtime?.countryResourceState,'endowment runtime must be initialized');
assert.ok(industry?.planExtraction&&industry?.executeSitePipeline&&industry?.advanceShipments&&industry?.processPendingFactoryInputs,
  'extraction, transport, and factory APIs must be present');

function provision(countryId){
  for(const rootState of [globalThis.Game?.state,globalThis.OmegaMinistryStateProvider?.getState?.()].filter(Boolean)){
    rootState.economy=rootState.economy||{};
    rootState.economy[countryId]=rootState.economy[countryId]||{productionAssets:[]};
    const econ=rootState.economy[countryId];
    if(!Array.isArray(econ.productionAssets))econ.productionAssets=[];
    econ.unemploymentCount=Math.max(Number(econ.unemploymentCount)||0,100000);
    econ.laborForce=Math.max(Number(econ.laborForce)||0,1000000);
    econ.unemployment_rate=10;
    rootState.transport=rootState.transport||{};
    rootState.transport[countryId]=rootState.transport[countryId]||{};
    const tr=rootState.transport[countryId];
    tr.infrastructure=tr.infrastructure||{};
    tr.infrastructure.roads=tr.infrastructure.roads||{capacityPerDay:50000,quality:.9};
    tr.infrastructure.rail=tr.infrastructure.rail||{capacityPerDay:120000,quality:.8};
    tr.infrastructure.ports=tr.infrastructure.ports||{capacityPerDay:200000,quality:.9};
    tr.infrastructure.bridges=tr.infrastructure.bridges||{capacityPerDay:50000,quality:.8};
    tr.infrastructure.pipelines=tr.infrastructure.pipelines||{capacityPerDay:400000,quality:.8};
    tr.infrastructure.utilitySupply={electricityMWhPerDay:1000000,waterM3PerDay:1000000,
      authority:'TEST_FIXTURE',status:'AVAILABLE',simulationOnly:true,assets:[]};
  }
}
function advance(turn,date){
  const sim=globalThis.Game.state.simulation;
  const target=Math.max(Number(sim.turn)||1,Number(turn)||1);
  while((Number(sim.turn)||1)<target){
    const d=new Date(String(sim.date||date||'2015-01-01')+'T00:00:00.000Z');
    d.setUTCDate(d.getUTCDate()+1);
    sim.date=d.toISOString().slice(0,10);
    sim.turn=(Number(sim.turn)||1)+1;
  }
  if(date&&(!sim.date||sim.date<date))sim.date=date;
}
function finishCycle(countryId,factoryId,batchId){
  const state=runtime.countryResourceState(countryId)||{};
  for(let i=0;i<256;i++){
    const flow=(runtime.countryResourceState(countryId)?.industrialNetwork?.siteFlowLedger||[])
      .find(x=>String(x.batchId)===String(batchId));
    if(flow?.stages?.some(x=>x.stage==='PROCESSING'&&x.status==='COMPLETED'))return flow;
    const cycle=runtime.countryResourceState(countryId)?.industrialNetwork?.factoryProductionCycles?.[String(factoryId)];
    if(cycle?.finishTurn||cycle?.finishDate)advance(Number(cycle.finishTurn)||((Number(globalThis.Game.state.simulation.turn)||1)+1),cycle.finishDate);
    else advance((Number(globalThis.Game.state.simulation.turn)||1)+1);
    industry.processPendingFactoryInputs(countryId);
  }
  const finalFlow=(runtime.countryResourceState(countryId)?.industrialNetwork?.siteFlowLedger||[])
    .find(x=>String(x.batchId)===String(batchId));
  assert.ok(finalFlow?.stages?.some(x=>x.stage==='PROCESSING'&&x.status==='COMPLETED'),
    JSON.stringify({reason:'FACTORY_OUTPUT_NOT_COMMITTED',countryId,factoryId,batchId,flow:finalFlow,
      cycle:runtime.countryResourceState(countryId)?.industrialNetwork?.factoryProductionCycles?.[String(factoryId)]}));
  return finalFlow;
}

assert.equal(batch.records.length,58,'all new critical-mineral sites must be included');
assert.equal(new Set(batch.records.map(x=>x.siteId)).size,58,'critical-mineral site IDs must be unique');
const seenCountries=new Set();
const completed=[];
for(const site of batch.records){
  const countryId=site.countryId;
  const resourceId=site.identity.resourceTypeId;
  seenCountries.add(countryId);
  assert.match(countryId,/^[A-Z]{3}$/);
  assert.equal(site.identity.countryIso3,countryId);
  assert.equal(site.location.countryBoundaryKey,countryId);
  assert.equal(site.map.countryIsolationKey,countryId);
  assert.equal(site.map.resourceFilterKey,resourceId);
  assert.ok(Number(site.quantitative.production.rate)>0);
  assert.ok(Number(site.quantitative.reserve.quantity)>0);
  assert.ok(site.sources?.some(x=>/^https?:\/\//.test(x.url)));
  provision(countryId);

  const plan=industry.planExtraction({countryId,siteId:site.siteId,resourceId});
  assert.equal(plan.status,'PLANNED',site.siteId+': site-specific extraction planner rejected site '+JSON.stringify(plan));
  assert.equal(plan.siteId,site.siteId);
  assert.equal(plan.countryId,countryId);
  assert.equal(plan.warehouseCountryId,countryId);
  assert.ok(Number(plan.dailyCapacity)>0);

  const pipeline=await industry.executeSitePipeline({
    countryId,siteId:site.siteId,resourceId,quantity:100,
    autoCommissionFactory:true,transportMode:'road'
  });
  assert.ok(['IN_TRANSIT','DELIVERED','PROCESSING','PROCESSED'].includes(pipeline.status),
    site.siteId+': pipeline did not dispatch eligible output '+JSON.stringify(pipeline));
  assert.equal(pipeline.countryId,countryId);
  assert.equal(pipeline.extractionStatus,'COMMITTED');
  assert.ok(pipeline.batchId,site.siteId+': extraction batch missing');
  assert.ok(pipeline.factoryId,site.siteId+': compatible factory missing');
  const afterExtraction=runtime.countryResourceState(countryId)||{};
  const rawBatch=(afterExtraction.batches||[]).find(x=>String(x.batchId)===String(pipeline.batchId));
  assert.ok(rawBatch,site.siteId+': raw batch must be recorded in the owning country');
  assert.equal(rawBatch.countryId,countryId);
  assert.equal(rawBatch.warehouseId,'WH-'+countryId+'-RAW');
  assert.ok(Number(rawBatch.quantity)>0);

  const eta=Number(pipeline.route?.etaTurn??pipeline.shipment?.etaTurn??pipeline.etaTurn);
  assert.ok(Number.isFinite(eta),site.siteId+': shipment ETA missing');
  advance(eta);
  let delivery=industry.advanceShipments(countryId);
  const shipmentId=String(pipeline.shipmentId||pipeline.shipment?.shipmentId||'');
  let shipment=(delivery.shipments||[]).find(x=>String(x.shipmentId)===shipmentId);
  if(!shipment){
    const ledger=runtime.countryResourceState(countryId)?.industrialNetwork?.deliveries||[];
    shipment=ledger.find(x=>String(x.shipmentId)===shipmentId);
  }
  assert.ok(shipment,site.siteId+': shipment not found after ETA '+JSON.stringify({pipeline,delivery}));
  assert.ok(['DELIVERED','IN_PROGRESS','AWAITING_PROCESSING','PROCESSED'].includes(shipment.status||shipment.processingStatus),
    site.siteId+': shipment did not reach factory '+JSON.stringify(shipment));

  const flow=finishCycle(countryId,pipeline.factoryId,pipeline.batchId);
  const finalState=runtime.countryResourceState(countryId)||{};
  const finalDelivery=(finalState.industrialNetwork?.deliveries||[])
    .find(x=>String(x.shipmentId)===shipmentId);
  assert.equal(finalDelivery?.processingStatus,'PROCESSED',site.siteId+': delivery ledger must commit factory completion');
  assert.ok(flow.stages.some(x=>x.stage==='PROCESSING'&&x.status==='COMPLETED'),site.siteId+': processing lineage missing');
  const outputKeys=Object.keys(finalDelivery.processing?.outputs||{});
  assert.ok(outputKeys.some(key=>Number(finalState.inventory?.[key])>0),
    site.siteId+': finished goods must enter the same sovereign inventory');
  assert.ok((finalState.industrialNetwork?.siteExecutions||[]).some(x=>
    x.siteId===site.siteId&&String(x.batchId)===String(pipeline.batchId)),
    site.siteId+': exact site/batch identity missing from industrial execution ledger');
  completed.push({siteId:site.siteId,countryId,resourceId,factoryId:pipeline.factoryId,shipmentId,batchId:pipeline.batchId});
}
assert.equal(seenCountries.size,23,'critical-mineral coverage must span 23 countries');
assert.equal(completed.length,58,'all critical-mineral sites must complete finished-goods production');
console.log(JSON.stringify({status:'PASS',sites:completed.length,countries:seenCountries.size,
  stages:['EXTRACTION','SOVEREIGN_RAW_WAREHOUSE','TRANSPORT','FACTORY_PROCESSING','FINISHED_GOODS'],
  completed:completed.map(x=>x.siteId)},null,2));
