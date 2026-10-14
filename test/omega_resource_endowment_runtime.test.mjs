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
  ['resource_site_reference_expanded_part_04.json',new URL('../resource_site_reference_expanded_part_04.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_1_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_1_v1.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_2_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_2_v1.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_3_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_3_v1.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_4_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_4_v1.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_5_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_5_v1.json',import.meta.url)],
  ['resource_site_legacy_gameplay_expansion_part_6_v1.json',new URL('../resource_site_legacy_gameplay_expansion_part_6_v1.json',import.meta.url)],
  ['resource_industrial_catalog_v1.json',new URL('../resource_industrial_catalog_v1.json',import.meta.url)]
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

// The 115-site legacy gameplay overlay is loaded into real per-country site references,
// reserve state and extraction models, without rewriting the canonical 250-site files.
const expansionReport=globalThis.OmegaResourceLegacyGameplayExpansion||globalThis.Omega?.ResourceLegacyGameplayExpansion;
assert.equal(expansionReport?.status,'READY',JSON.stringify(expansionReport));
assert.equal(expansionReport?.count,115,JSON.stringify(expansionReport));
assert.equal(expansionReport?.activeAdded,105,JSON.stringify(expansionReport));
const ausDiag=runtime.hydrateCountry('AUS');
assert.equal(ausDiag.status,'APPLIED',JSON.stringify(ausDiag));
const ausState=runtime.countryResourceState('AUS')||{};
const pilbaraSite=(ausState.mineSiteReferences||[]).find(x=>x.siteReferenceKey==='SITE_AUS_pilbara_iron_ore_range');
assert(pilbaraSite,'Pilbara legacy site must be bound to country-level site references');
assert.equal(pilbaraSite.quantitative.grade.status,'SIMULATED');
assert.equal(pilbaraSite.quantitative.purity.status,'SIMULATED');
assert.equal(pilbaraSite.quantitative.production.status,'SIMULATED');
assert.ok(pilbaraSite.simulationReserveQuantity>0);
const pilbaraExecution=(ausState.mineStates||{});
const pilbaraOccurrence=Object.keys(pilbaraExecution).find(k=>k.toLowerCase().includes('site_aus_pilbara_iron_ore_range'.toLowerCase()));
if(!pilbaraOccurrence){
  const directModel=(globalThis.OmegaResourceRealism||globalThis.Omega?.ResourceRealism)?.siteModel?.({
    ...pilbaraSite,siteId:pilbaraSite.siteId,siteReferenceKey:pilbaraSite.siteReferenceKey,
    resourceId:pilbaraSite.resourceId||pilbaraSite.resourceTypeId,
    simulationReserveQuantity:pilbaraSite.simulationReserveQuantity,
    simulationReserveUnit:pilbaraSite.simulationReserveUnit
  },null,'AUS');
  assert(pilbaraOccurrence,'Pilbara should have an initialized reserve/extraction state; diagnostic='+JSON.stringify({
    mineStateKeyCount:Object.keys(pilbaraExecution).length,
    sampleMineStateKeys:Object.keys(pilbaraExecution).slice(-8),
    siteRef:{siteId:pilbaraSite.siteId,resourceId:pilbaraSite.resourceId,resourceTypeId:pilbaraSite.resourceTypeId,
      commercialExtraction:pilbaraSite.commercialExtraction,siteReferenceKey:pilbaraSite.siteReferenceKey,
      quantity:pilbaraSite.simulationReserveQuantity,sourceAuthority:pilbaraSite.sourceAuthority,
      provenance:pilbaraSite.quantitativeProvenance},
    modelStatus:directModel?.status,modelResourceId:directModel?.resourceId,
    modelStreams:directModel?.commodityStreams?.map(x=>({resourceId:x.resourceId,reserve:x.reserve,production:x.production,quality:x.quality}))
  }));
}
assert.equal(pilbaraExecution[pilbaraOccurrence].provenance.stateAuthority,'SIMULATED');
assert.ok(pilbaraExecution[pilbaraOccurrence].recoverableQuantity>0);

// Exercise SITE -> extraction -> country warehouse -> route -> factory -> processing.
await import('../omega_resource_industrial_network_v1.js');
const industrialPipelineRuntime=globalThis.OmegaResourceIndustrialNetwork||globalThis.Omega?.ResourceIndustrialNetwork;
assert(industrialPipelineRuntime?.executeSitePipeline,'industrial site-pipeline executor must be installed');
const pilbaraPipeline=await industrialPipelineRuntime.executeSitePipeline({countryId:'AUS',siteId:'SITE_AUS_pilbara_iron_ore_range',resourceId:'iron_ore',quantity:100});
assert.equal(pilbaraPipeline.status,'IN_TRANSIT',JSON.stringify(pilbaraPipeline));
assert.equal(pilbaraPipeline.countryId,'AUS');
assert.equal(pilbaraPipeline.extractionStatus,'COMMITTED');
assert.equal(pilbaraPipeline.shipmentStatus,'DISPATCHED');
assert.ok(Number.isFinite(pilbaraPipeline.route?.totalDistanceKm) && pilbaraPipeline.route.totalDistanceKm>0);
assert.equal(pilbaraPipeline.route?.crossBorderRequired,false);
const ausAfterExtraction=runtime.countryResourceState('AUS')||{};
const pipelineOccurrence=pilbaraPipeline.occurrenceKey;
assert.equal(pipelineOccurrence,pilbaraOccurrence);
const pilbaraBatch=(ausAfterExtraction.batches||[]).find(b=>b.occurrenceKey===pipelineOccurrence);
assert(pilbaraBatch,'site pipeline extraction must create an auditable raw batch');
assert.equal(pilbaraBatch.countryId,'AUS');
assert.equal(pilbaraBatch.sourceCountryId,'AUS');
assert.equal(pilbaraBatch.originCountryId,'AUS');
assert.equal(pilbaraBatch.ownerCountryCode,'AUS');
assert.equal(pilbaraBatch.warehouseId,'WH-AUS-RAW');
assert.ok(Number(pilbaraBatch.quantity)>0);
assert.equal(pilbaraBatch.stateAuthority,'SIMULATED');
assert.equal(ausAfterExtraction.warehouse.countryId,'AUS');
assert.ok((ausAfterExtraction.warehouse.availableByResource?.iron_ore||0)>=0);
const etaTurn=Number(pilbaraPipeline.route.etaTurn);
assert.ok(etaTurn>=Number(globalThis.Game.state.simulation.turn));
globalThis.Game.state.simulation.turn=etaTurn;
const delivery=industrialPipelineRuntime.advanceShipments('AUS');
assert.equal(delivery.status,'ADVANCED',JSON.stringify(delivery));
assert.equal(delivery.delivered,1,JSON.stringify(delivery));
const pilbaraDelivered=delivery.shipments[0];
assert.equal(pilbaraDelivered.status,'DELIVERED');
assert.equal(pilbaraDelivered.processingStatus,'PROCESSED',JSON.stringify(pilbaraDelivered.processing));
const ausAfterProcessing=runtime.countryResourceState('AUS')||{};
const factoryRuntime=globalThis.OmegaMinistryStateProvider?.getState?.()?.economy?.AUS?.productionAssets||globalThis.Game.state.economy?.AUS?.productionAssets||[];
assert.ok(factoryRuntime.some(x=>String(x.id||x.assetId||x.projectId)===pilbaraPipeline.factoryId),'simulated factory must remain country-owned and findable');
const gevraRef=(indState.mineSiteReferences||[]).find(x=>x.siteReferenceKey==='SITE_IND_gevra_oc_mine');
const kwtDiag=runtime.hydrateCountry('KWT');const kwtState=runtime.countryResourceState('KWT')||{};const kwtRef=(kwtState.mineSiteReferences||[]).find(x=>x.siteReferenceKey==='SITE_KWT_greater_burgan_oilfield');const kwtRuntimeModel=globalThis.Omega?.ResourceRealism?.siteModel?.(kwtRef,engine.countryProfiles?.KWT,'KWT');console.log('ENDOWMENT_KWT_MODEL '+JSON.stringify({hydrate:kwtDiag.status,ref:kwtRef&&{siteReferenceKey:kwtRef.siteReferenceKey,resourceId:kwtRef.resourceId,commercialExtraction:kwtRef.commercialExtraction,simulationReserveQuantity:kwtRef.simulationReserveQuantity},model:kwtRuntimeModel,controller:Object.values(kwtState.mineSiteControllers||{}).find(x=>x.siteReferenceKey==='SITE_KWT_greater_burgan_oilfield')}));
// Regression: nullable catalog metrics must stay missing, not be coerced to numeric zero.
// A commercial scenario site with positive reserves must then use the realism model's
// explicit simulation fallback rate instead of being silently blocked from extraction.
if(kwtRef?.quantitative?.production?.rate==null){
  assert.equal(kwtRef.productionRate,null,'missing production rate must remain null in the authoritative site reference');
  assert.ok(Number(kwtRuntimeModel?.commodityStreams?.[0]?.production?.activeRate)>0,
    'missing production metrics must enable a positive simulated fallback rate for eligible commercial sites');
}
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
assert.equal(preGlobal.mineSiteReferenceCount,355);
assert.equal(preGlobal.mineSiteControllerCount,355);
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
assert.equal(siteReferenceRows,355);
assert.equal(siteControllerRows,355);

// Every new Part 6 mine must use the same authoritative runtime identity and extraction path.
const part6Data=JSON.parse(fs.readFileSync(new URL('../resource_site_legacy_gameplay_expansion_part_6_v1.json',import.meta.url),'utf8'));
assert.equal(part6Data.records.length,50,'Part 6 must contribute all 50 new physical sites');
const part6SiteIds=new Set(part6Data.records.map(site=>site.siteId));
const part6PositiveOutputs=new Set(siteLinkedExecutionOutputs.map(output=>output.siteReferenceKey).filter(siteId=>part6SiteIds.has(siteId)));
assert.equal(part6PositiveOutputs.size,50,'all 50 new sites must create positive site-linked extraction output');
for(const site of part6Data.records){
  const countryRow=worldState[site.countryId];
  assert(countryRow,site.siteId+': owning country runtime state missing');
  const ref=(countryRow.mineSiteReferences||[]).find(item=>item.siteReferenceKey===site.siteId);
  assert(ref,site.siteId+': authoritative site reference missing');
  assert.equal(ref.countryId,site.countryId,site.siteId+': country identity changed');
  assert.equal(ref.resourceId,site.resourceId,site.siteId+': resource identity changed');
  assert.equal(ref.commercialExtraction,true,site.siteId+': eligible simulation mine must be extractable');
  const q=ref.quantitative||{};
  for(const metric of ['reserve','production','grade','recovery','throughput','purity','capacity']){
    assert.equal(q[metric]?.status,'SIMULATED',site.siteId+': '+metric+' must retain simulated authority');
  }
  assert.ok(Number(q.reserve?.quantity)>0,site.siteId+': positive simulated reserve required');
  assert.ok(Number(q.production?.rate)>0&&Number(q.production?.annual)>0,site.siteId+': production rate/annual output required');
  assert.ok(Number(q.grade?.value)>0,site.siteId+': grade required');
  assert.ok(Number(q.purity?.value)>0&&Number(q.purity?.value)<=100,site.siteId+': purity range required');
  assert.ok(Number(q.recovery?.value)>0&&Number(q.recovery?.value)<=100,site.siteId+': recovery range required');
  assert.ok(Number(q.throughput?.value)>0,site.siteId+': throughput required');
  assert.ok(Number(q.capacity?.minimum)>0&&Number(q.capacity.minimum)<=Number(q.capacity.nominal),site.siteId+': minimum/nominal capacity ordering');
  assert.ok(Number(q.capacity?.nominal)<=Number(q.capacity?.maximum),site.siteId+': nominal/maximum capacity ordering');
  const controller=countryRow.mineSiteControllers?.[site.siteId];
  assert.equal(controller?.extractionExecutable,true,site.siteId+': controller must link to an executable occurrence');
  assert.ok(controller.linkedOccurrenceKeys?.length,site.siteId+': occurrence link missing');
  const output=Object.values(countryRow.mineOutputs||{}).find(item=>item.siteReferenceKey===site.siteId&&Number(item.producedQuantity)>0);
  assert(output,site.siteId+': positive output record missing');
  assert(output.batchId,site.siteId+': output batch missing');
  const batch=(countryRow.batches||[]).find(item=>item.batchId===output.batchId);
  assert(batch,site.siteId+': extraction batch missing');
  assert.equal(batch.countryId,site.countryId,site.siteId+': batch crossed country boundary');
  assert.equal(batch.warehouseId,'WH-'+site.countryId+'-RAW',site.siteId+': batch was not stored in the owning country warehouse');
  const lot=countryRow.inventoryLots?.[output.batchId];
  assert(lot,site.siteId+': warehouse inventory lot missing');
  assert.equal(lot.countryId,site.countryId,site.siteId+': inventory lot country mismatch');
  assert.equal(lot.warehouseId,'WH-'+site.countryId+'-RAW',site.siteId+': inventory lot warehouse mismatch');
  assert((countryRow.mineProductionLedger||[]).some(item=>item.batchId===batch.batchId&&item.mineId===output.occurrenceKey),
    site.siteId+': site-specific production ledger missing');
}
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
const baseCommercialCatalogIds=(globalThis.OmegaResourceSiteReserveSimulationData?.records||[]).filter(x=>x.commercialExtraction===true).map(x=>x.siteId);
const legacyExpansionRows=[1,2,3,4,5,6].flatMap(part=>{
  const data=JSON.parse(fs.readFileSync(new URL('../resource_site_legacy_gameplay_expansion_part_'+part+'_v1.json',import.meta.url),'utf8'));
  return Array.isArray(data.records)?data.records:[];
});
const legacyCanonicalAliasIds=new Set([
  'SITE_AUS_olympic_dam_uranium_copper','SITE_BRA_carajas_iron_ore_mine_legacy2',
  'SITE_CHL_escondida_copper_mine_legacy2','SITE_IDN_grasberg_copper_gold_mine',
  'SITE_COD_tenke_fungurume_copper_cobalt_complex','SITE_COD_kibali_gold_mine_complex'
]);
const expandedCommercialCatalogIds=legacyExpansionRows
  .filter(site=>site?.operation?.commercialExtraction===true&&site?.map?.markerEligible!==false&&
    !site?.runtime?.aliasOfSiteId&&!legacyCanonicalAliasIds.has(String(site?.siteId||'')))
  .map(site=>String(site.siteId));
const commercialCatalogIds=[...new Set([...baseCommercialCatalogIds,...expandedCommercialCatalogIds])];
const canonicalSiteIds=new Set((globalThis.OmegaResourceSiteCanonicalCatalogData?.sites||[]).map(x=>x.siteId).filter(Boolean));
const executedProfileSiteIds=new Set(siteLinkedExecutionOutputs.map(x=>x.siteReferenceKey).filter(x=>canonicalSiteIds.has(x)));
const missingCommercialSiteIds=commercialCatalogIds.filter(siteId=>!executedProfileSiteIds.has(siteId));
assert.deepEqual(missingCommercialSiteIds,[],
  'all commercial baseline and physical expansion site identities must have positive linked extraction output; missing='+missingCommercialSiteIds.join(', '));
assert.equal(executedProfileSiteIds.size,commercialCatalogIds.length,
  'the positive-output count must match the full deduplicated authoritative commercial site set');
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

// Part 6 integration proof: a newly added mine must complete the same extraction,
// sovereign warehouse, transport, auto-commissioned factory and processing sequence.
const part6CopperSite=part6Data.records.find(site=>site.siteId==='SITE_CHL_collahuasi_copper_mine');
assert(part6CopperSite,'Part 6 copper pipeline fixture must exist');
globalThis.Game.state.transport.CHL=globalThis.Game.state.transport.CHL||{
  infrastructure:{
    roads:{capacityPerDay:50000,quality:0.9},rail:{capacityPerDay:120000,quality:0.8},
    ports:{capacityPerDay:200000,quality:0.9},bridges:{capacityPerDay:50000,quality:0.8},
    pipelines:{capacityPerDay:400000,quality:0.8}
  }
};
globalThis.Game.state.simulation.turn=Number(globalThis.Game.state.simulation.turn||0)+1;
const part6Pipeline=await industrial.executeSitePipeline({
  countryId:part6CopperSite.countryId,siteId:part6CopperSite.siteId,
  resourceId:part6CopperSite.resourceId,autoCommissionFactory:true,transportMode:'rail'
});
assert.equal(part6Pipeline.status,'IN_TRANSIT',
  'new Part 6 mine must enter the same production pipeline: '+JSON.stringify({
    status:part6Pipeline.status,reason:part6Pipeline.reason,siteId:part6Pipeline.siteId,
    resourceId:part6Pipeline.resourceId,extractionStatus:part6Pipeline.extractionStatus,
    shipmentStatus:part6Pipeline.shipmentStatus,detail:part6Pipeline.detail
  }));
assert.equal(part6Pipeline.extractionStatus,'COMMITTED');
assert.ok(part6Pipeline.batchId&&part6Pipeline.shipmentId&&part6Pipeline.factoryId,
  'Part 6 pipeline must persist its extraction batch, shipment and factory identities');
const part6PreDelivery=runtime.countryResourceState(part6CopperSite.countryId);
const part6ShipQuantity=Number(part6Pipeline.shipment?.quantity||0);
assert.ok(part6ShipQuantity>0);
assert.ok(Number(part6PreDelivery?.warehouse?.reservedByResource?.[part6CopperSite.resourceId]||0)>=part6ShipQuantity,
  'Part 6 shipment must reserve material from its country raw warehouse');
globalThis.Game.state.simulation.turn=Number(part6Pipeline.shipment.etaTurn);
const part6Delivery=industrial.advanceShipments(part6CopperSite.countryId);
assert.equal(part6Delivery.delivered,1,'Part 6 mine shipment must reach its bound factory');
const part6Delivered=part6Delivery.shipments.find(item=>item.shipmentId===part6Pipeline.shipmentId);
assert(part6Delivered);
assert.equal(part6Delivered.processingStatus,'PROCESSED');
assert.equal(part6Delivered.destinationStatus,'FACTORY_RECEIVED');
const part6PostDelivery=runtime.countryResourceState(part6CopperSite.countryId);
assert.ok(Object.keys(part6Delivered.processing?.outputs||{}).some(key=>Number(part6PostDelivery.inventory?.[key])>0),
  'Part 6 processed products must enter the owning country inventory');
assert.ok((part6PostDelivery.industrialNetwork?.siteExecutions||[]).some(item=>
  item.siteId===part6CopperSite.siteId&&item.batchId===part6Pipeline.batchId&&item.occurrenceKey===part6Pipeline.occurrenceKey),
  'Part 6 industrial ledger must retain the exact site, batch and occurrence identities');


if(nativeFetch)globalThis.fetch=nativeFetch;
// This completion line is reached only after the real site pipeline assertions above pass.
console.log('OMEGA RESOURCE JSON -> MINE -> BATCH -> WAREHOUSE -> FACTORY EVENT TEST PASSED');