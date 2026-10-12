import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot=new URL('../',import.meta.url);
const resourceFiles=new Map([
  ['resources.json',new URL('../resources.json',import.meta.url)],
  ['resources_2.json',new URL('../resources_2.json',import.meta.url)],
  ['resource_site_reserve_simulation_v1.json',new URL('../resource_site_reserve_simulation_v1.json',import.meta.url)],
  ['resource_site_canonical_catalog_v1.json',new URL('../resource_site_canonical_catalog_v1.json',import.meta.url)],
  ['resource_site_master_registry_v1.json',new URL('../resource_site_master_registry_v1.json',import.meta.url)],
  ['resource_site_reference_expanded_manifest.json',new URL('../resource_site_reference_expanded_manifest.json',import.meta.url)],
  ['resource_site_reference_expanded_part_01.json',new URL('../resource_site_reference_expanded_part_01.json',import.meta.url)],
  ['resource_site_reference_expanded_part_02.json',new URL('../resource_site_reference_expanded_part_02.json',import.meta.url)],
  ['resource_site_reference_expanded_part_03.json',new URL('../resource_site_reference_expanded_part_03.json',import.meta.url)],
  ['resource_site_reference_expanded_part_04.json',new URL('../resource_site_reference_expanded_part_04.json',import.meta.url)]
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
await import('../omega_resource_realism_runtime_v1.js');
await import('../omega_resource_endowment_runtime.js');
const runtime=globalThis.OmegaResourceEndowmentRuntime;
const initialized=await runtime.initialize();
assert.equal(initialized.status,'READY',JSON.stringify(initialized));
assert.equal(initialized.countries,Object.keys(engine.countryProfiles||{}).length);
const reserveScenario=JSON.parse(fs.readFileSync(new URL('../resource_site_reserve_simulation_v1.json',import.meta.url),'utf8'));
assert.equal(reserveScenario.siteCount,250);
assert.equal(reserveScenario.commercialSiteCount,246);
const hydrated=runtime.hydrateCountry('BGD');
const indDiag=runtime.hydrateCountry('IND');
const indState=runtime.countryResourceState('IND')||{};
const gevraRef=(indState.mineSiteReferences||[]).find(x=>x.siteReferenceKey==='SITE_IND_gevra_oc_mine');
const kwtDiag=runtime.hydrateCountry('KWT');const kwtState=runtime.countryResourceState('KWT')||{};const kwtRef=(kwtState.mineSiteReferences||[]).find(x=>x.siteReferenceKey==='SITE_KWT_greater_burgan_oilfield');console.log('ENDOWMENT_KWT_MODEL '+JSON.stringify({hydrate:kwtDiag.status,ref:kwtRef&&{siteReferenceKey:kwtRef.siteReferenceKey,resourceId:kwtRef.resourceId,commercialExtraction:kwtRef.commercialExtraction,simulationReserveQuantity:kwtRef.simulationReserveQuantity},model:globalThis.Omega?.ResourceRealism?.siteModel?.(kwtRef,engine.countryProfiles?.KWT,'KWT'),controller:Object.values(kwtState.mineSiteControllers||{}).find(x=>x.siteReferenceKey==='SITE_KWT_greater_burgan_oilfield')}));
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
assert.equal(before.resourceAuthority.fullEffortPolicy,'MODEL_DRIVEN');
assert.ok(before.mines.every(x=>x.resourceAsset&&x.resourceAsset.schemaVersion==='1.0.0'));
const unifiedMineKeys=Object.keys(before.mines[0]?.resourceAsset||{}).sort();
assert.ok(before.mines.every(x=>Object.keys(x.resourceAsset||{}).sort().join('|')===unifiedMineKeys.join('|')));
assert.equal(before.mines[0].resourceAsset.countryId,'BGD');
assert(before.mines[0].resourceAsset.warehouse.id==='WH-BGD-RAW');

const gasMine=before.mines.find(x=>x.depositName==='Titas Gas Field Reservoir');
assert(gasMine);
assert.equal(gasMine.resourceId,'natural_gas');
assert.equal(gasMine.purity,null);
assert.ok(Math.abs(gasMine.qualityState.normalized.concentrationPercent-96.2)<1e-9);
assert.equal(gasMine.qualityState.concentrationStatus,'OBSERVED');

const extraction=await runtime.extractCountry('BGD',[gasMine.occurrenceKey]);
assert.equal(extraction.status,'APPLIED');
const after=runtime.countryResourceState('BGD');
const output=after.mineOutputs[gasMine.occurrenceKey];
assert(output);
assert.ok(output.effortUtilization>0&&output.effortUtilization<=1);
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
assert.equal(preGlobal.mineSiteReferenceCount,250);
assert.equal(preGlobal.mineSiteControllerCount,250);
const globalExtraction=await runtime.extractAll();
assert.equal(globalExtraction.status,'COMPLETED');
assert.equal(globalExtraction.results.length,expectedResourceCountries.length);

const worldState=globalThis.Game.state.resource;
const hydratedAssetRows=Object.values(worldState).reduce((sum,row)=>sum+(Array.isArray(row?.mines)?row.mines.length:0),0);
const structuredMineRows=Object.values(worldState).reduce((sum,row)=>sum+(Array.isArray(row?.mines)?row.mines.filter(x=>!x?.simulationGenerated).length:0),0);
const siteReferenceRows=Object.values(worldState).reduce((sum,row)=>sum+(Array.isArray(row?.mineSiteReferences)?row.mineSiteReferences.length:0),0);
const siteControllerRows=Object.values(worldState).reduce((sum,row)=>sum+(row?.mineSiteControllers&&typeof row.mineSiteControllers==='object'?Object.keys(row.mineSiteControllers).length:0),0);
const allMineOutputs=Object.values(worldState).flatMap(row=>Object.values(row?.mineOutputs&&typeof row.mineOutputs==='object'?row.mineOutputs:{}));
const profileMineOutputs=allMineOutputs.filter(x=>x?.assetType==='MINE_SITE');
const siteLinkedExecutionOutputs=allMineOutputs.filter(x=>x?.siteReferenceKey&&Number(x?.producedQuantity)>0);
const simulatedMineOutputs=profileMineOutputs.filter(x=>x?.simulationGenerated===true);
const simulatedFieldOutputs=allMineOutputs.filter(x=>x?.simulationGenerated===true&&['OIL_FIELD','GAS_FIELD'].includes(x?.assetType));
assert.equal(siteReferenceRows,250);
assert.equal(siteControllerRows,250);
assert.ok(structuredMineRows>=engine.deposits.length,'structured mine rows must include canonical runtime deposits plus profile-derived structured sites');
const unifiedReferences=[];
let siteReferenceHoleCount=0;
for(const row of Object.values(worldState)){
  const refs=row?.mineSiteReferences;
  if(!Array.isArray(refs))continue;
  siteReferenceHoleCount+=refs.length-Object.keys(refs).length;
  for(let i=0;i<refs.length;i++)if(refs[i]!==undefined)unifiedReferences.push(refs[i]);
}
assert.equal(siteReferenceHoleCount,0,'site reference arrays must be dense');
assert.equal(unifiedReferences.length,siteReferenceRows);
assert.ok(unifiedReferences.every(x=>x.resourceAsset&&x.resourceAsset.schemaVersion==='1.0.0'));
assert.ok(unifiedReferences.every(x=>x.resourceAsset.assetId===x.siteReferenceKey));
assert.deepEqual(Object.keys(unifiedReferences[0]?.resourceAsset||{}).sort(),unifiedMineKeys);
const commercialCatalogIds=(globalThis.OmegaResourceSiteReserveSimulationData?.records||[]).filter(x=>x.commercialExtraction===true).map(x=>x.siteId);
const canonicalSiteIds=new Set((globalThis.OmegaResourceSiteCanonicalCatalogData?.sites||[]).map(x=>x.siteId).filter(Boolean));
const executedProfileSiteIds=new Set(siteLinkedExecutionOutputs.map(x=>x.siteReferenceKey).filter(x=>canonicalSiteIds.has(x)));
assert.equal(executedProfileSiteIds.size,commercialCatalogIds.length,'all commercial canonical site identities must have a positive linked extraction output; N/A sites are excluded');
assert(simulatedFieldOutputs.length>0,'expected hydrocarbon field execution assets');
assert(siteLinkedExecutionOutputs.every(x=>(x?.producedQuantity||0)>0&&x?.effortUtilization>0&&x?.effortUtilization<=1),'some canonical site-linked output did not execute with valid utilization');
assert(simulatedFieldOutputs.every(x=>(x?.producedQuantity||0)>0&&x?.effortUtilization>0&&x?.effortUtilization<=1),'some hydrocarbon field did not execute with modeled utilization');

const controllerCountrySets=new Set();
for(const [countryId,row] of Object.entries(worldState)){
  if(!row)continue;
  for(const [siteKey,controller] of Object.entries(row.mineSiteControllers||{})){
    assert.equal(controller.countryId,countryId);
    assert.equal(controller.controllerStatus,'RUNNING');
    const reserveRecord=(globalThis.OmegaResourceSiteReserveSimulationData?.records||[]).find(x=>x.siteId===siteKey);
    const commercial=controller.rawSiteReference?.commercialExtraction===true || reserveRecord?.commercialExtraction===true;
    if(commercial){
      assert.equal(controller.extractionExecutable,true,countryId+' commercial controller not executable '+siteKey);
      assert.equal(controller.extractionPathStatus,'EXECUTABLE_OCCURRENCE_ATTACHED');
      assert(Array.isArray(controller.linkedOccurrenceKeys)&&controller.linkedOccurrenceKeys.length>=1);
      const occurrenceKey=controller.linkedOccurrenceKeys[0];
      const output=row.mineOutputs?.[occurrenceKey];
      assert(output,countryId+' missing site output '+siteKey);
      assert.equal(output.siteReferenceKey,siteKey);
      assert.ok(['MINE_SITE','STRUCTURED_MINE'].includes(output.assetType),countryId+' unexpected site output asset type '+siteKey);
      assert.ok(Number(output.producedQuantity)>0,countryId+' commercial site produced no positive quantity '+siteKey);
      assert(output.batchId,countryId+' missing site batch '+siteKey);
      assert.ok(output.effortUtilization>0&&output.effortUtilization<=1);
      const lot=row.inventoryLots?.[output.batchId];
      assert(lot,countryId+' missing site inventory lot '+siteKey);
      assert.equal(lot.countryId,countryId);
      assert.equal(lot.warehouseId,'WH-'+countryId+'-RAW');
      assert(row.mineProductionLedger.some(x=>x.batchId===output.batchId&&x.mineId===occurrenceKey),countryId+' missing site production ledger '+siteKey);
      controllerCountrySets.add(countryId);
    }else{
      assert.equal(controller.extractionExecutable,false,countryId+' non-commercial controller unexpectedly executable '+siteKey);
      assert.equal(controller.extractionPathStatus,'BLOCKED_MISSING_QUANTITATIVE_DATA');
      assert.deepEqual(controller.linkedOccurrenceKeys,[]);
    }
  }
}
assert.equal(executedProfileSiteIds.size,commercialCatalogIds.length);



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



// REAL ENDOWMENT -> INDUSTRIAL NETWORK END-TO-END REGRESSION
// This deliberately uses the real ResourceMinistryEngine + Endowment Runtime above.
// The industrial network is not allowed to manufacture a fake extraction batch in this fixture.
globalThis.OmegaResourceIndustrialCatalogData=JSON.parse(
  fs.readFileSync(new URL('../resource_industrial_catalog_v1.json',import.meta.url),'utf8')
);
await import('../omega_resource_industrial_network_v1.js');
const industrial=globalThis.Omega?.ResourceIndustrialNetwork||globalThis.OmegaResourceIndustrialNetwork;
assert.ok(industrial?.executeSitePipeline,'industrial runtime must export the individual site pipeline');
assert.equal((await industrial.loadCatalog()).status,'READY');

const realPipelineSiteId='SITE_KWT_greater_burgan_oilfield';
const masterRows=globalThis.OmegaResourceSiteMasterResearchData?.sites||[];
const realPipelineSite=masterRows.find(s=>String(s?.siteId||'')===realPipelineSiteId);
assert.ok(realPipelineSite,'real Greater Burgan record must exist in the authoritative 250-site master registry');
const realPipelineResourceId=String(realPipelineSite?.real?.resourceId||
  realPipelineSite?.sourceSiteRecord?.resourceId||
  realPipelineSite?.sourceSiteRecord?.resourceTypeId||
  realPipelineSite?.identity?.resourceTypeId||'').trim().toLowerCase();
assert.equal(realPipelineResourceId,'crude_oil',"selected site commodity identity must be retained");

globalThis.Game.state.transport=globalThis.Game.state.transport||{};
globalThis.Game.state.transport.KWT=globalThis.Game.state.transport.KWT||{
  infrastructure:{
    roads:{capacityPerDay:50000,quality:0.9},
    rail:{capacityPerDay:120000,quality:0.8},
    ports:{capacityPerDay:200000,quality:0.9},
    bridges:{capacityPerDay:50000,quality:0.8},
    pipelines:{capacityPerDay:400000,quality:0.8}
  }
};
globalThis.Game.state.simulation.turn=2;
const realPipeline=await industrial.executeSitePipeline({
  countryId:'KWT',siteId:realPipelineSiteId,resourceId:realPipelineResourceId,
  autoCommissionFactory:true,transportMode:'rail'
});
assert.equal(realPipeline.status,'IN_TRANSIT',
  'real Endowment extraction must commit and dispatch a site-specific shipment: '+JSON.stringify({
    status:realPipeline.status,reason:realPipeline.reason,countryId:realPipeline.countryId,siteId:realPipeline.siteId,
    resourceId:realPipeline.resourceId,controllerStatus:realPipeline.controllerStatus,linkedOccurrenceCount:realPipeline.linkedOccurrenceCount,
    referenceResource:realPipeline.referenceResource,extractionStatus:realPipeline.extractionStatus,
    shipmentStatus:realPipeline.shipmentStatus,detail:realPipeline.detail
  }));
assert.equal(realPipeline.extractionStatus,'COMMITTED');
assert.ok(realPipeline.batchId,'real extraction must return its own batch ID');
assert.ok(realPipeline.occurrenceKey,'pipeline must retain the controller-linked occurrence key');
assert.ok(realPipeline.shipmentId,'pipeline must persist a shipment ID');
assert.ok(realPipeline.factoryId,'shipment must target a concrete country-scoped factory asset');
assert.ok((globalThis.Game.state.economy?.KWT?.productionAssets||[]).some(x=>String(x?.id||x?.assetId||x?.projectId)===realPipeline.factoryId),
  'auto-commissioned processing factory must persist in the Kuwait economy state');

const preDeliveryState=runtime.countryResourceState('KWT');
const beforeWarehouse=Number(preDeliveryState?.warehouse?.availableByResource?.[realPipelineResourceId]||0);
const beforeReserved=Number(preDeliveryState?.warehouse?.reservedByResource?.[realPipelineResourceId]||0);
const beforeCountryRaw=Number(preDeliveryState?.inventory?.[realPipelineResourceId]||0);
const deliveredQuantity=Number(realPipeline.shipment?.quantity||0);
assert.ok(deliveredQuantity>0,'route must dispatch a positive quantity');
assert.ok(beforeWarehouse>=deliveredQuantity,'real extraction batch must be in the sovereign raw warehouse before shipment arrival');
assert.ok(beforeReserved>=deliveredQuantity,'shipment quantity must be reserved in the raw warehouse before arrival');

globalThis.Game.state.simulation.turn=Number(realPipeline.shipment.etaTurn);
const realDelivery=industrial.advanceShipments('KWT');
assert.equal(realDelivery.delivered,1,'real site shipment must arrive through the turn-advance runtime');
const delivered=realDelivery.shipments.find(x=>x.shipmentId===realPipeline.shipmentId);
assert.ok(delivered,'arrival record must match the committed shipment');
assert.equal(delivered.destinationStatus,'FACTORY_RECEIVED');
assert.equal(delivered.processingStatus,'PROCESSED','delivered real Endowment material must enter factory processing');
const postDeliveryState=runtime.countryResourceState('KWT');
assert.ok(Math.abs(Number(postDeliveryState.warehouse.availableByResource[realPipelineResourceId])-(beforeWarehouse-deliveredQuantity))<1e-5,
  'raw warehouse stock must fall by exactly the quantity shipped');
assert.ok(Math.abs(Number(postDeliveryState.warehouse.reservedByResource[realPipelineResourceId])-(beforeReserved-deliveredQuantity))<1e-5,
  'shipment reservation must be released exactly once at delivery');
assert.ok(Math.abs(Number(postDeliveryState.inventory[realPipelineResourceId])-(beforeCountryRaw-deliveredQuantity))<1e-5,
  'country raw inventory must be debited exactly once');
const realProcessedOutputs=Object.keys(delivered.processing?.outputs||{});
assert.ok(realProcessedOutputs.length>0,'real factory cycle must produce at least one output');
assert.ok(realProcessedOutputs.every(k=>Number(postDeliveryState.inventory[k])>0),
  'real processed outputs must be recorded in country inventory');
const executionLedger=postDeliveryState.industrialNetwork?.siteExecutions||[];
assert.ok(executionLedger.some(x=>x.siteId===realPipelineSiteId&&x.batchId===realPipeline.batchId&&x.occurrenceKey===realPipeline.occurrenceKey),
  'site execution ledger must preserve the exact site, batch and occurrence identities');
assert.ok((postDeliveryState.industrialNetwork?.events||[]).some(x=>x.transactionId===delivered.processingTransactionId&&x.status==='COMPLETED'),
  'factory processing must be represented in the industrial event ledger');


if(nativeFetch)globalThis.fetch=nativeFetch;
// This completion line is reached only after the real site pipeline assertions above pass.
console.log('OMEGA RESOURCE JSON -> MINE -> BATCH -> WAREHOUSE -> FACTORY EVENT TEST PASSED');