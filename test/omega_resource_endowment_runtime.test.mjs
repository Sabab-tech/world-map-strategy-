import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const resourceFiles=new Map([
  ['resources.json',new URL('../resources.json',import.meta.url)],
  ['resources_2.json',new URL('../resources_2.json',import.meta.url)],
  ['resource_site_reserve_simulation_v1.json',new URL('../resource_site_reserve_simulation_v1.json',import.meta.url)],
  ['resource_site_canonical_catalog_v1.json',new URL('../resource_site_canonical_catalog_v1.json',import.meta.url)]
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
if(typeof globalThis.dispatchEvent!=='function'){
  const t=new EventTarget();
  globalThis.dispatchEvent=t.dispatchEvent.bind(t);
  globalThis.addEventListener=t.addEventListener.bind(t);
}

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const countryIdentity=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await countryIdentity.init();

await import('../resource_ministry_engine.js');
await import('../omega_resource_truth_contract.js');
await import('../omega_resource_part04_identity_runtime.js');

const engine=globalThis.ResourceMinistryEngine;
await engine.init();

assert.equal(engine.isReady,true);
const dataReport=engine.getDataLoadReport();
assert.equal(dataReport.status,'READY');
assert.equal(dataReport.fallbackUsed,false);
assert.ok(dataReport.depositCount>0,'resource runtime must load canonical runtime deposits');
assert.ok(engine.deposits.length>0,'resource runtime must expose canonical runtime deposits');

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
await import('../omega_resource_realism_runtime_v1.js');
await import('../omega_resource_endowment_runtime.js');

const runtime=globalThis.OmegaResourceEndowmentRuntime;
const initialized=await runtime.initialize();
assert.equal(initialized.status,'READY',JSON.stringify(initialized));
assert.equal(initialized.countries,Object.keys(engine.countryProfiles||{}).length);

const reserveScenario=JSON.parse(fs.readFileSync(new URL('../resource_site_reserve_simulation_v1.json',import.meta.url),'utf8'));
const canonicalCatalog=JSON.parse(fs.readFileSync(new URL('../resource_site_canonical_catalog_v1.json',import.meta.url),'utf8'));
assert.equal(reserveScenario.siteCount,199);
assert.equal(reserveScenario.commercialSiteCount,195);
assert.equal(canonicalCatalog.siteCount,199);
assert.equal(canonicalCatalog.sites.length,199);

const hydrated=runtime.hydrateCountry('BGD');
assert.equal(hydrated.status,'APPLIED',JSON.stringify(hydrated));

const before=runtime.countryResourceState('BGD');
assert(before);
assert(Array.isArray(before.mines));
assert(before.mines.length>=4);
assert((before.reserves.natural_gas||0)>0);
assert((before.endowment.natural_gas||0)>0);
assert(before.resourceAuthority);
assert.ok(before.mines.every(x=>x.resourceAsset&&x.resourceAsset.schemaVersion==='1.0.0'));
assert.equal(before.mines[0].resourceAsset.countryId,'BGD');
assert.equal(before.mines[0].resourceAsset.warehouse.id,'WH-BGD-RAW');

const gasMine=before.mines.find(x=>x.depositName==='Titas Gas Field Reservoir');
assert(gasMine);
assert.equal(gasMine.resourceId,'natural_gas');
assert.equal(gasMine.purity,null);
assert.ok(Math.abs(gasMine.qualityState.normalized.concentrationPercent-96.2)<1e-9);
assert.equal(gasMine.qualityState.concentrationStatus,'OBSERVED');

const extraction=await runtime.extractCountry('BGD',[gasMine.occurrenceKey]);
assert.equal(extraction.status,'APPLIED',JSON.stringify(extraction));

const after=runtime.countryResourceState('BGD');
const output=after.mineOutputs[gasMine.occurrenceKey];
assert(output);
assert.equal(output.simulationGenerated,false);
assert.ok(output.effortUtilization>0&&output.effortUtilization<=1);
assert((after.production.natural_gas||0)>0);
assert((after.inventory.natural_gas||0)>0);
assert((after.reserves.natural_gas||0)<(before.reserves.natural_gas||0));
assert(after.extractionLedger.some(x=>x.extractionId));
assert(after.mineStates[gasMine.occurrenceKey]);

const batch=after.batches.find(x=>x.batchId===output.batchId);
assert(batch);
assert(batch.quantity>0);
assert.equal(batch.remainingQuantity,batch.quantity);
assert.equal(batch.resourceId,'natural_gas');
assert.equal(batch.purity,null);
assert.ok(Math.abs(batch.qualityState.normalized.concentrationPercent-96.2)<1e-9);
assert.equal(batch.qualityState.concentrationStatus,'OBSERVED');
assert.equal(batch.warehouseId,'WH-BGD-RAW');
assert(after.warehouse);
assert(after.warehouse.storedBatchIds.includes(batch.batchId));
assert((after.warehouse.availableByResource.natural_gas||0)>=batch.quantity);
assert(after.warehouse.receipts.some(x=>x.batchId===batch.batchId&&x.status==='RECEIVED'));
assert(after.mineProductionLedger.some(x=>x.batchId===batch.batchId&&x.mineId===gasMine.occurrenceKey));
assert(seen.some(x=>x&&x.payload&&x.payload.batch&&x.payload.batch.batchId===batch.batchId));

const preGlobal=runtime.diagnostics();
const expectedResourceCountries=Object.keys(engine.countryProfiles||{});
assert.equal(preGlobal.countryCount,expectedResourceCountries.length);
assert.equal(preGlobal.mineSiteReferenceCount,199);
assert.equal(preGlobal.mineSiteControllerCount,199);

const globalExtraction=await runtime.extractAll();
assert.equal(globalExtraction.status,'COMPLETED',JSON.stringify(globalExtraction));
assert.equal(globalExtraction.results.length,expectedResourceCountries.length);

const worldState=globalThis.Game.state.resource;
const siteReferenceRows=Object.values(worldState).reduce((sum,row)=>sum+(Array.isArray(row?.mineSiteReferences)?row.mineSiteReferences.length:0),0);
const siteControllerRows=Object.values(worldState).reduce((sum,row)=>sum+(row?.mineSiteControllers&&typeof row.mineSiteControllers==='object'?Object.keys(row.mineSiteControllers).length:0),0);
assert.equal(siteReferenceRows,199);
assert.equal(siteControllerRows,199);

const canonicalSiteIds=new Set(canonicalCatalog.sites.map(x=>x.siteId).filter(Boolean));
assert.equal(canonicalSiteIds.size,199);

const commercialCatalogIds=new Set(
  reserveScenario.records.filter(x=>x.commercialExtraction===true).map(x=>x.siteId).filter(Boolean)
);
assert.equal(commercialCatalogIds.size,195);

const controllerRows=[];
const executedProfileSiteIds=new Set();
let observedExecutableCommercialCount=0;
let blockedCommercialCount=0;
let blockedNonCommercialCount=0;

for(const [countryId,row] of Object.entries(worldState)){
  if(!row)continue;
  for(const [siteKey,controller] of Object.entries(row.mineSiteControllers||{})){
    assert.equal(controller.countryId,countryId,countryId+' controller country mismatch '+siteKey);
    assert.equal(controller.controllerStatus,'RUNNING',countryId+' controller not running '+siteKey);
    assert(canonicalSiteIds.has(siteKey),'unknown canonical site controller '+siteKey);

    const ref=controller.rawSiteReference||{};
    const reserveRecord=reserveScenario.records.find(x=>x.siteId===siteKey);
    const commercial=ref.commercialExtraction===true||reserveRecord?.commercialExtraction===true;
    const availableObserved=controller.quantitativeDataState==='AVAILABLE_OBSERVED';

    controllerRows.push({countryId,siteKey,commercial,availableObserved,controller});

    if(commercial){
      assert(commercialCatalogIds.has(siteKey),'commercial controller is outside canonical commercial set '+siteKey);
      assert(Array.isArray(controller.linkedOccurrenceKeys),'commercial controller missing occurrence link array');

      if(availableObserved){
        observedExecutableCommercialCount+=1;
        assert.equal(controller.extractionExecutable,true,countryId+' observed commercial controller not executable '+siteKey);
        assert.equal(controller.extractionPathStatus,'EXECUTABLE_OCCURRENCE_ATTACHED');

        const occurrenceKey=controller.linkedOccurrenceKeys[0];
        assert(occurrenceKey,countryId+' observed commercial controller missing occurrence '+siteKey);
        const output=row.mineOutputs?.[occurrenceKey];
        assert(output,countryId+' observed commercial site missing execution output '+siteKey);
        assert.equal(output.siteReferenceKey,siteKey);
        assert.ok(['MINE_SITE','STRUCTURED_MINE'].includes(output.assetType),countryId+' unexpected site output asset type '+siteKey);
        assert.ok(Number(output.producedQuantity)>0,countryId+' observed commercial site produced no positive quantity '+siteKey);
        assert(output.batchId,countryId+' observed commercial site missing batch '+siteKey);

        const lot=row.inventoryLots?.[output.batchId];
        assert(lot,countryId+' observed commercial site missing inventory lot '+siteKey);
        assert.equal(lot.countryId,countryId);
        assert.equal(lot.warehouseId,'WH-'+countryId+'-RAW');
        assert(row.mineProductionLedger.some(x=>x.batchId===output.batchId&&x.mineId===occurrenceKey),countryId+' observed commercial site missing production ledger '+siteKey);

        executedProfileSiteIds.add(siteKey);
      }else{
        blockedCommercialCount+=1;
        assert.equal(controller.extractionExecutable,false,countryId+' unobserved commercial controller became executable '+siteKey);
        assert.equal(controller.extractionPathStatus,'BLOCKED_MISSING_QUANTITATIVE_DATA');
        assert(controller.quantitativeDataState==='SIMULATED_ONLY'||controller.quantitativeDataState==='MISSING_FROM_SITE_REFERENCE',
          countryId+' unexpected quantitative state '+controller.quantitativeDataState+' for '+siteKey);

        const linked=controller.linkedOccurrenceKeys||[];
        for(const occurrenceKey of linked){
          const output=row.mineOutputs?.[occurrenceKey];
          if(!output)continue;
          assert.equal(output.simulationGenerated,true,countryId+' unobserved site produced a non-simulated execution output '+siteKey);
        }
      }
    }else{
      blockedNonCommercialCount+=1;
      assert.equal(controller.extractionExecutable,false,countryId+' non-commercial controller unexpectedly executable '+siteKey);
      assert.equal(controller.extractionPathStatus,'BLOCKED_MISSING_QUANTITATIVE_DATA');
      assert.deepEqual(controller.linkedOccurrenceKeys,[]);
    }
  }
}

assert.equal(observedExecutableCommercialCount,executedProfileSiteIds.size);
assert.equal(observedExecutableCommercialCount+blockedCommercialCount,195);
assert(blockedCommercialCount>0,'freeze policy expects some commercial sites to remain explicitly unobserved');
assert(blockedNonCommercialCount>0,'canonical boundary includes non-commercial/N-A sites that must remain blocked');
assert(executedProfileSiteIds.size<=commercialCatalogIds.size);

for(const row of Object.values(worldState)){
  if(!row||!Array.isArray(row.mines))continue;
  for(const mine of row.mines){
    const output=row.mineOutputs?.[mine.occurrenceKey];
    assert.ok(output,row.countryId+' missing mine evaluation '+mine.occurrenceKey);
    if(output.batchId){
      const mineBatch=row.batches.find(x=>x.batchId===output.batchId);
      assert.ok(mineBatch,row.countryId+' missing batch '+output.batchId);
      assert.equal(mineBatch.countryId,row.countryId||mine.countryId||mineBatch.countryId);
      assert.equal(mineBatch.sourceCountryId,mineBatch.countryId);
      assert.equal(mineBatch.ownerCountryCode,mineBatch.countryId);
      assert.equal(mineBatch.destinationCountryId,mineBatch.countryId);
      assert.equal(mineBatch.warehouseId,'WH-'+mineBatch.countryId+'-RAW');
    }
  }
}

if(nativeFetch)globalThis.fetch=nativeFetch;
console.log('OMEGA RESOURCE TRUTH-AWARE ENDOWMENT TEST PASSED');
console.log('199-site identity boundary: PASS');
console.log('Observed quantitative sites execute; unobserved commercial sites remain blocked: PASS');
console.log('Country warehouse/inventory boundary: PASS');
