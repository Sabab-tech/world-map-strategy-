import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot=new URL('../',import.meta.url);
const resourceFiles=new Map([
  ['resources.json',new URL('../resources.json',import.meta.url)],
  ['resources_2.json',new URL('../resources_2.json',import.meta.url)]
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
const engine=globalThis.ResourceMinistryEngine;
await engine.init();
const source=JSON.parse(fs.readFileSync(new URL('../resources.json',import.meta.url),'utf8'));

assert.equal(engine.isReady,true);
const dataReport=engine.getDataLoadReport();
assert.equal(dataReport.authority,'RESOURCE_JSON');
assert.equal(dataReport.status,'READY');
assert.equal(dataReport.depositCount,43);
assert.equal(dataReport.fallbackUsed,false);
assert.equal(engine.deposits.length,43);
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

await import('../omega_resource_endowment_runtime.js');
const runtime=globalThis.OmegaResourceEndowmentRuntime;
const initialized=await runtime.initialize();
assert.equal(initialized.status,'READY');
const hydrated=runtime.hydrateCountry('BGD');
assert.equal(hydrated.status,'APPLIED', JSON.stringify(hydrated));

const before=runtime.countryResourceState('BGD');
assert(before);
assert(Array.isArray(before.mines));
assert(before.mines.length>=4);
assert((before.reserves.natural_gas||0)>0);
assert((before.endowment.natural_gas||0)>0);
assert(before.resourceAuthority);
assert.equal(String(before.resourceAuthority.mineSource).includes('RESOURCE_JSON.runtime_deposits'),true);
assert.equal(before.resourceAuthority.dataLoadReport.authority,'RESOURCE_JSON');
assert.equal(before.resourceAuthority.fullEffortPolicy,'100_PERCENT');

const gasMine=before.mines.find(x=>x.depositName==='Titas Gas Field Reservoir');
assert(gasMine);
assert.equal(gasMine.resourceId,'natural_gas');
assert.ok(Math.abs(gasMine.purity-0.962)<1e-9, `purity drifted: ${gasMine.purity}`);
assert.equal(gasMine.qualityState.purityStatus,'OBSERVED');

const extraction=await runtime.extractCountry('BGD',[gasMine.occurrenceKey]);
assert.equal(extraction.status,'APPLIED');
const after=runtime.countryResourceState('BGD');
const output=after.mineOutputs[gasMine.occurrenceKey];
assert(output);
assert.equal(output.effortUtilization,1);
assert.equal(output.simulationGenerated,false);
assert((after.production.natural_gas||0)>0);
assert((after.inventory.natural_gas||0)>0);
assert((after.reserves.natural_gas||0)<(before.reserves.natural_gas||0));
assert(after.extractionLedger.some(x=>x.extractionId));
assert(after.mineStates[gasMine.occurrenceKey]);
assert(Array.isArray(after.batches));
assert(after.batches.some(x=>x.batchId===output.batchId));
const batch=after.batches.find(x=>x.batchId===output.batchId);
assert(batch);
assert(batch.quantity>0);
assert(batch.remainingQuantity===batch.quantity);
assert.equal(batch.resourceId,'natural_gas');
assert.ok(Math.abs(batch.purity-0.962)<1e-9, `batch purity drifted: ${batch.purity}`);
assert.equal(batch.qualityState.purityStatus,'OBSERVED');
assert.equal(batch.warehouseId,'WH-BGD-RAW');
assert(after.warehouse);
assert(after.warehouse.storedBatchIds.includes(batch.batchId));
assert((after.warehouse.availableByResource.natural_gas||0)>=batch.quantity);
assert(after.warehouse.receipts.some(x=>x.batchId===batch.batchId&&x.status==='RECEIVED'));
assert(after.mineProductionLedger.some(x=>x.batchId===batch.batchId&&x.mineId===gasMine.occurrenceKey));
assert(seen.some(x=>x&&x.payload&&x.payload.batch&&x.payload.batch.batchId===batch.batchId));

const preGlobal=runtime.diagnostics();
const expectedCountries=countryIdentity.exportData().countries;
const expectedResourceCountries=Object.keys(engine.countryProfiles||{});
assert.equal(preGlobal.countryCount,expectedResourceCountries.length);
assert.equal(preGlobal.mineSiteReferenceCount,199);
assert.equal(preGlobal.mineSiteControllerCount,199);
const globalExtraction=await runtime.extractAll();
assert.equal(globalExtraction.status,'COMPLETED');
assert.equal(globalExtraction.results.length,expectedCountries.length);

const worldState=globalThis.Game.state.resource;
const hydratedAssetRows=Object.values(worldState).reduce((sum,row)=>sum+(Array.isArray(row?.mines)?row.mines.length:0),0);
const structuredMineRows=Object.values(worldState).reduce((sum,row)=>sum+(Array.isArray(row?.mines)?row.mines.filter(x=>!x?.simulationGenerated).length:0),0);
const siteReferenceRows=Object.values(worldState).reduce((sum,row)=>sum+(Array.isArray(row?.mineSiteReferences)?row.mineSiteReferences.length:0),0);
const siteControllerRows=Object.values(worldState).reduce((sum,row)=>sum+(row?.mineSiteControllers&&typeof row.mineSiteControllers==='object'?Object.keys(row.mineSiteControllers).length:0),0);
const simulatedMineOutputs=Object.values(worldState).flatMap(row=>Object.values(row?.mineOutputs&&typeof row.mineOutputs==='object'?row.mineOutputs:{})).filter(x=>x?.simulationGenerated===true&&x?.assetType==='MINE_SITE');
const simulatedFieldOutputs=Object.values(worldState).flatMap(row=>Object.values(row?.mineOutputs&&typeof row.mineOutputs==='object'?row.mineOutputs:{})).filter(x=>x?.simulationGenerated===true&&['OIL_FIELD','GAS_FIELD'].includes(x?.assetType));
assert.equal(siteReferenceRows,199);
assert.equal(siteControllerRows,199);
assert.equal(structuredMineRows,engine.deposits.length);
assert.equal(simulatedMineOutputs.length,199);
assert(simulatedFieldOutputs.length>0,'expected hydrocarbon field execution assets');
assert(simulatedMineOutputs.every(x=>(x?.producedQuantity||0)>0&&x?.effortUtilization===1),'some profile mine site did not execute at full effort');
assert(simulatedFieldOutputs.every(x=>(x?.producedQuantity||0)>0&&x?.effortUtilization===1),'some hydrocarbon field did not execute at full effort');

const controllerCountrySets=new Set();
for(const [countryId,row] of Object.entries(worldState)){
  if(!row)continue;
  for(const [siteKey,controller] of Object.entries(row.mineSiteControllers||{})){
    assert.equal(controller.countryId,countryId);
    assert.equal(controller.controllerStatus,'RUNNING');
    assert.equal(controller.extractionExecutable,true,countryId+' controller not executable '+siteKey);
    assert.equal(controller.extractionPathStatus,'EXECUTABLE_OCCURRENCE_ATTACHED');
    assert(Array.isArray(controller.linkedOccurrenceKeys)&&controller.linkedOccurrenceKeys.length===1);
    const occurrenceKey=controller.linkedOccurrenceKeys[0];
    const output=row.mineOutputs?.[occurrenceKey];
    assert(output,countryId+' missing site output '+siteKey);
    assert.equal(output.simulationGenerated,true);
    assert.equal(output.assetType,'MINE_SITE');
    assert(output.batchId,countryId+' missing site batch '+siteKey);
    assert.equal(output.effortUtilization,1);
    const lot=row.inventoryLots?.[output.batchId];
    assert(lot,countryId+' missing site inventory lot '+siteKey);
    assert.equal(lot.countryId,countryId);
    assert.equal(lot.warehouseId,'WH-'+countryId+'-RAW');
    assert(row.mineProductionLedger.some(x=>x.batchId===output.batchId&&x.mineId===occurrenceKey),countryId+' missing site production ledger '+siteKey);
    controllerCountrySets.add(countryId);
  }
}
assert.equal(simulatedMineOutputs.length,199);

for(const [countryId,row] of Object.entries(worldState)){
  if(!row||!Array.isArray(row.mines))continue;
  for(const mine of row.mines){
    const output=row.mineOutputs?.[mine.occurrenceKey];
    assert.ok(output, countryId+' missing mine evaluation '+mine.occurrenceKey);
    if(output.batchId){
      const mineBatch=row.batches.find(x=>x.batchId===output.batchId);
      assert.ok(mineBatch, countryId+' missing batch '+output.batchId);
      assert.equal(mineBatch.countryId,countryId);
      assert.equal(mineBatch.sourceCountryId,countryId);
      assert.equal(mineBatch.ownerCountryCode,countryId);
      assert.equal(mineBatch.destinationCountryId,countryId);
      assert.equal(mineBatch.warehouseId,'WH-'+countryId+'-RAW');
    }
  }
}

if(nativeFetch)globalThis.fetch=nativeFetch;
console.log('OMEGA RESOURCE JSON -> MINE -> BATCH -> WAREHOUSE -> FACTORY EVENT TEST PASSED');