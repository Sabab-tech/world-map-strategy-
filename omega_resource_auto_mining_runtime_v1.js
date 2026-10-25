/* OMEGA AUTOMATIC PLAYER-COUNTRY MINE STARTER v1
 * Provision an operational starter state for every eligible mine in the selected country.
 * Only the selected player's country is mutated or ticked. Other countries remain dormant/read-only.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const state=()=>g.Game?.state||g.gameState||{};
const num=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;};
const tok=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const id=v=>String(v??'').trim().toUpperCase();
const quantityApi=()=>g.Omega?.ResourceQuantityNormalization||g.OmegaResourceQuantityNormalization||null;
function resolveCountry(value){
 const raw=String(value??'').trim();
 if(!raw)return null;
 if(/^[A-Z]{3}$/i.test(raw))return raw.toUpperCase();
 try{
  const resolver=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
  const hit=resolver?.resolveCountry?.(raw);
  if(hit){
   const source=hit.raw?.raw||hit.raw?.datasets?.['countries.json']||hit.raw||{};
   const resolved=id(source.iso3||source.iso3Code||source.countryCode||source.countryId||hit.id);
   if(/^[A-Z]{3}$/.test(resolved))return resolved;
  }
 }catch(_){}
 return null;
}
function playerCountryId(){
 const root=state()||{},sim=g.Omega?.Simulation;
 const session=root.simulation?.session||sim?.world?.state?.simulation?.session||{};
 let direct=null;
 try{if(typeof sim?.getPlayerCountryId==='function')direct=sim.getPlayerCountryId();}catch(_){}
 const candidates=[session.playerCountryId,direct,root.simulation?.playerCountryId,root.playerCountryId,root.playerCountryCode,
  g.Game?.playerCountryId,g.Game?.playerCountryCode,g.Game?.playerCountry,g.OMEGA_PLAYER_COUNTRY_ID];
 for(const value of candidates){
  const raw=value&&typeof value==='object'?(value.iso3||value.iso3Code||value.countryCode||value.countryId||value.code||value.id):value;
  const cid=resolveCountry(raw);if(cid)return cid;
 }
 return null;
}
function allSites(){
 const data=g.OmegaResourceSiteCanonicalCatalogData||g.Omega?.ResourceSiteCanonicalCatalogData;
 return Array.isArray(data?.sites)?data.sites:[];
}
function siteCountry(site){
 return resolveCountry(site?.countryId||site?.identity?.countryIso3||site?.location?.countryIso3||site?.sourceSiteRecord?.countryCode||'');
}
function siteResource(site){
 return tok(site?.real?.resourceId||site?.sourceSiteRecord?.resourceId||site?.sourceSiteRecord?.resourceTypeId||
  site?.identity?.resourceTypeId||site?.resourceId||site?.resourceTypeId||site?.resourceTypeKey);
}
function eligibleSite(site,country){
 const sid=String(site?.siteId||'').trim(),rid=siteResource(site),c=siteCountry(site);
 if(!sid||!rid||c!==country)return false;
 if(site?.map?.markerEligible===false||site?.map?.aliasOfSiteId||site?.runtime?.aliasOfSiteId)return false;
 if(site?.runtime?.aliasOfSiteId||site?.operation?.commercialExtraction===false||site?.commercialExtraction===false)return false;
 if(String(site?.operation?.status||site?.status||'').toUpperCase()==='NOT_APPLICABLE')return false;
 return true;
}
function constructionClass(site){
 const type=String(site?.siteType||site?.identity?.siteType||site?.sourceSiteRecord?.siteType||'').toUpperCase();
 const method=String(site?.operation?.extractionMethod||site?.sourceSiteRecord?.extractionMethod||site?.extractionMethod||'').toUpperCase();
 if(/TAILINGS|REPROCESSING/.test(type+' '+method))return'TAILINGS';
 if(/BRINE|SALT|SODA_ASH/.test(type+' '+method))return'BRINE';
 if(/PROCESSING|MILL|PLANT/.test(type+' '+method))return'PROCESSING';
 if(/UNDERGROUND|LONGWALL|BLOCK_CAVING|ROOM_PILLAR/.test(type+' '+method))return'UNDERGROUND';
 return'OPEN_PIT';
}
const WORKERS=Object.freeze({OPEN_PIT:520,UNDERGROUND:900,TAILINGS:190,BRINE:370,PROCESSING:410});
const COMPLEXITY=Object.freeze({diamond:1.28,lithium:1.24,uranium:1.32,rare_earth:1.32,niobium:1.30,platinum:1.25,ruby:1.20,gold:1.12,tungsten:1.12,copper:1.10,tin:1.08});
function workerRequirement(site,rid){
 const className=constructionClass(site);
 const base=WORKERS[className]||WORKERS.OPEN_PIT;
 return Math.ceil(base*(COMPLEXITY[rid]||1));
}
function siteDailyCapacity(site,rid){
 const unitApi=quantityApi();
 const candidates=[
  [site?.quantitative?.production?.rate,site?.quantitative?.production?.rateUnit||site?.quantitative?.production?.unit],
  [site?.simulation?.production?.rate,site?.simulation?.production?.rateUnit||site?.simulation?.production?.unit],
  [site?.productionModel?.dailyRate||site?.productionModel?.activeRate,site?.productionModel?.rateUnit||site?.productionModel?.unit],
  [site?.capacity?.dailyRate||site?.capacity?.activeRate||site?.capacity?.nominalCapacity,site?.capacity?.rateUnit||site?.capacity?.unit],
  [site?.dailyRate||site?.productionRate,site?.unit]
 ];
 for(const [value,unit] of candidates){
  const q=num(value);if(q!==null&&q>0){
   const normalized=unitApi?.normalizeQuantity?.(rid,q,unit||'UNIT_UNKNOWN',{simulationOnly:true});
   // If the unit is unknown/incompatible, do not treat the raw quantity as the
   // canonical unit. Skip it and use the deterministic simulation fallback below.
   if(unitApi&&normalized?.quantity==null)continue;
   const period=String(unit||'').toUpperCase();
   const divisor=/_PER_YEAR(?:$|_)/.test(period)?365:
    /_PER_TURN(?:$|_)/.test(period)?Math.max(1,num(state()?.simulation?.daysPerTurn)||1):1;
   return Math.max(.1,(num(normalized?.quantity)??q)/divisor);
  }
 }
 // Stable site-specific gameplay capacity, separate from unobserved geology and production.
 const country=String(site?.countryId||site?.identity?.countryIso3||'').toUpperCase();
 const seed=String(site?.siteId||'')+'|'+country+'|'+rid;let hash=2166136261;
 for(let i=0;i<seed.length;i++)hash=Math.imul(hash^seed.charCodeAt(i),16777619)>>>0;
 return 0.5+((hash%200)+1)/10;
}
function gameplayUnit(rid){
 return quantityApi()?.canonicalUnit?.(rid)||'TONNES';
}
function ensureInfrastructure(country,siteCount){
 const industry=g.Omega?.ResourceIndustrialNetwork||g.OmegaResourceIndustrialNetwork;
 let normalized=null;
 try{normalized=industry?.normalizeInfrastructure?.(country)||null;}catch(_){}
 const root=state();
 root.transport=root.transport&&typeof root.transport==='object'?root.transport:{};
 root.transport[country]=root.transport[country]&&typeof root.transport[country]==='object'?root.transport[country]:{};
 const transport=root.transport[country];
 transport.infrastructure=transport.infrastructure&&typeof transport.infrastructure==='object'?transport.infrastructure:{};
 const infra=transport.infrastructure;
 const ensureMode=(key,capacity)=>{
  const old=infra[key]&&typeof infra[key]==='object'?infra[key]:{};
  infra[key]={...old,capacityPerDay:Math.max(0,num(old.capacityPerDay)||0,capacity),quality:Math.max(.8,num(old.quality)||0),
   status:'AVAILABLE',authority:'SIMULATED_AUTO_MINE_STARTER_INFRASTRUCTURE',simulationOnly:true};
 };
 const routeCapacity=Math.max(1000000,siteCount*100000);
 ensureMode('roads',routeCapacity);
 ensureMode('rail',routeCapacity*2);
 ensureMode('ports',routeCapacity*3);
 ensureMode('bridges',routeCapacity);
 ensureMode('pipelines',routeCapacity*3);
 const utilities=infra.utilitySupply&&typeof infra.utilitySupply==='object'?infra.utilitySupply:{};
 infra.utilitySupply={
  ...utilities,
  electricityMWhPerDay:Math.max(num(utilities.electricityMWhPerDay)||0,siteCount*1000,100000),
  waterM3PerDay:Math.max(num(utilities.waterM3PerDay)||0,siteCount*500,50000),
  fuelLitersPerDay:Math.max(num(utilities.fuelLitersPerDay)||0,siteCount*1000,100000),
  status:'AVAILABLE',authority:'SIMULATED_AUTO_MINE_STARTER_INFRASTRUCTURE',simulationOnly:true,
  starterFleetFuelAvailable:true,updatedTurn:num(state()?.simulation?.turn)||0
 };
 return{infrastructure:infra,normalized:normalized?.status||'BASELINE_READY'};
}
function ensureCountryInventory(country){
 const root=state();root.resource=root.resource&&typeof root.resource==='object'?root.resource:{};
 const rs=root.resource[country]=root.resource[country]&&typeof root.resource[country]==='object'?root.resource[country]:{};
 rs.inventory=rs.inventory&&typeof rs.inventory==='object'?rs.inventory:{};
 rs.batches=Array.isArray(rs.batches)?rs.batches:[];
 rs.inventoryLots=rs.inventoryLots&&typeof rs.inventoryLots==='object'?rs.inventoryLots:{};
 rs.warehouse=rs.warehouse&&typeof rs.warehouse==='object'?rs.warehouse:{};
 const wh=rs.warehouse;
 wh.warehouseId=wh.warehouseId||('WH-'+country+'-RAW');wh.countryId=country;
 wh.type=wh.type||'SOVEREIGN_RAW_MATERIAL_WAREHOUSE';
 wh.availableByResource=wh.availableByResource&&typeof wh.availableByResource==='object'?wh.availableByResource:{};
 wh.reservedByResource=wh.reservedByResource&&typeof wh.reservedByResource==='object'?wh.reservedByResource:{};
 wh.storedBatchIds=Array.isArray(wh.storedBatchIds)?wh.storedBatchIds:[];
 wh.receipts=Array.isArray(wh.receipts)?wh.receipts:[];
 rs.mineAssets=Array.isArray(rs.mineAssets)?rs.mineAssets:[];
 rs.commissionedSites=Array.isArray(rs.commissionedSites)?rs.commissionedSites:[];
 rs.mineSiteReferences=Array.isArray(rs.mineSiteReferences)?rs.mineSiteReferences:[];
 rs.mineSiteControllers=rs.mineSiteControllers&&typeof rs.mineSiteControllers==='object'?rs.mineSiteControllers:{};
 rs.mineStates=rs.mineStates&&typeof rs.mineStates==='object'?rs.mineStates:{};
 return rs;
}
function ensureStarterTechnologies(country,sites,rs){
 const industryCatalog=g.OmegaResourceIndustrialCatalogData||g.Omega?.ResourceIndustrialCatalogData||{};
 const rules=industryCatalog.processingRules||{},profiles=industryCatalog.factoryProfiles||{};
 const required=new Set();
 for(const site of sites){
  const rid=siteResource(site),rule=rules[rid];
  const profile=profiles[String(rule?.factoryType||'').toUpperCase()]||{};
  for(const id of Array.isArray(profile.requiredTechnologyIds)?profile.requiredTechnologyIds:[]){
   const technologyId=String(id||'').trim();if(technologyId)required.add(technologyId);
  }
 }
 rs.technologyCapabilities=Array.isArray(rs.technologyCapabilities)?rs.technologyCapabilities:[];
 const added=[];
 for(const technologyId of required){
  const prior=rs.technologyCapabilities.find(row=>String(row?.technologyId||'').toUpperCase()===technologyId.toUpperCase()&&
   ['COMPLETE','COMPLETED','AVAILABLE','UNLOCKED','OPERATIONAL','ACTIVE'].includes(String(row?.status||'').toUpperCase()));
  if(prior)continue;
  rs.technologyCapabilities.push({technologyId,status:'COMPLETE',level:1,commissionedTurn:num(state()?.simulation?.turn)||0,
   source:'SIMULATED_PLAYER_COUNTRY_STARTER_TECHNOLOGY',authority:'SIMULATED_PLAYER_COUNTRY_STARTER_TECHNOLOGY',
   simulationOnly:true,autoProvisioned:true});
  added.push(technologyId);
 }
 return{status:'READY',requiredTechnologyCount:required.size,addedTechnologyCount:added.length,addedTechnologyIds:added};
}
function autoStaffAsset(country,site,rs){
 const siteId=String(site.siteId),rid=siteResource(site),workers=workerRequirement(site,rid),capacity=siteDailyCapacity(site,rid);
 const assets=rs.mineAssets;
 let asset=assets.find(x=>String(x?.siteId||x?.siteReferenceKey||'')===siteId);
 const sourceStatus=String(site.operation?.realWorldStatus||site.operation?.status||site.sourceSiteRecord?.status||'UNOBSERVED');
 const priorStatus=String(asset?.status||'').toUpperCase();
 const vehicleCount=Math.max(2,Math.ceil(capacity/1000));
 const unit=gameplayUnit(rid);
 if(!asset){
  asset={mineId:'AUTO-MINE:'+country+':'+siteId,id:'AUTO-MINE:'+country+':'+siteId,siteId,siteReferenceKey:siteId,
   siteName:site.siteName||site.name||siteId,resourceId:rid,countryId:country,ownerCountryId:country,
   constructionCostUsd:0,commissioningLevel:1,commissionedTurn:num(state()?.simulation?.turn)||0,
   authority:'SIMULATED_PLAYER_MINE_AUTO_PROVISION',simulationOnly:true};
  assets.push(asset);
 }
 asset.siteId=siteId;asset.siteReferenceKey=siteId;asset.siteName=asset.siteName||site.siteName||siteId;
 asset.resourceId=rid;asset.countryId=country;asset.ownerCountryId=country;
 if(priorStatus&&priorStatus!=='OPERATIONAL')asset.preAutoProvisionStatus=priorStatus;
 asset.status='OPERATIONAL';
 asset.workersRequired=Math.max(workers,num(asset.workersRequired)||0);
 asset.workersCommitted=asset.workersRequired;
 asset.workersAssigned=asset.workersRequired;
 asset.assignedWorkers=asset.workersRequired;
 asset.staffingStatus='AUTO_ASSIGNED';
 asset.staffingAuthority='SIMULATED_PLAYER_COUNTRY_STARTER_WORKFORCE';
 asset.productionStatus='READY_FOR_EXTRACTION';
 asset.dailyCapacity=Math.max(capacity,num(asset.dailyCapacity)||0);
 asset.capacityUnit=unit+'_PER_DAY';
 asset.unit=unit;
 asset.sourceSiteStatus=sourceStatus;
 asset.fleet={
  ...(asset.fleet&&typeof asset.fleet==='object'?asset.fleet:{}),
  transportMode:/crude_oil|natural_gas/.test(rid)?'pipeline':'truck',
  vehiclesRequired:Math.max(vehicleCount,num(asset.fleet?.vehiclesRequired)||0),
  vehiclesAssigned:Math.max(vehicleCount,num(asset.fleet?.vehiclesAssigned)||0),
  status:'READY',fleetAuthority:'SIMULATED_PLAYER_COUNTRY_STARTER_FLEET',
  capacityPerDay:Math.max(capacity,num(asset.fleet?.capacityPerDay)||0),capacityUnit:unit+'_PER_DAY'
 };
 asset.equipment={
  ...(asset.equipment&&typeof asset.equipment==='object'?asset.equipment:{}),
  drillingRigs:Math.max(1,num(asset.equipment?.drillingRigs)||0),
  excavators:Math.max(1,num(asset.equipment?.excavators)||0),
  loaders:Math.max(1,num(asset.equipment?.loaders)||0),
  haulTrucks:Math.max(vehicleCount,num(asset.equipment?.haulTrucks)||0),
  equipmentStatus:'AVAILABLE',authority:'SIMULATED_PLAYER_COUNTRY_STARTER_EQUIPMENT'
 };
 asset.roadAccess={available:true,transportMode:asset.fleet.transportMode,routeStatus:'READY',
  authority:'SIMULATED_PLAYER_COUNTRY_STARTER_LOGISTICS',simulationOnly:true};
 asset.reserveStatus='SIMULATED_RUNTIME_RESERVE';
 asset.autoProvisioningVersion=VERSION;
 const commission=rs.commissionedSites.find(x=>String(x?.siteId||'')===siteId);
 if(commission){
  commission.countryId=country;commission.resourceId=rid;commission.status='COMMISSIONED';
  commission.commissionedTurn=commission.commissionedTurn??(num(state()?.simulation?.turn)||0);
  commission.authority='SIMULATED_PLAYER_COUNTRY_STARTER_COMMISSIONING';
 }else{
  rs.commissionedSites.push({siteId,countryId:country,resourceId:rid,status:'COMMISSIONED',
   mineId:asset.mineId,commissionedTurn:num(state()?.simulation?.turn)||0,
   authority:'SIMULATED_PLAYER_COUNTRY_STARTER_COMMISSIONING',simulationOnly:true});
 }
 const refs=rs.mineSiteReferences;
 if(!refs.some(x=>String(x?.siteReferenceKey||x?.siteId||'')===siteId&&tok(x?.resourceId||x?.resourceTypeId)===rid)){
  refs.push({siteReferenceKey:siteId,siteId,siteName:asset.siteName,countryId:country,resourceId:rid,
   status:'AUTO_PROVISIONED',authority:'SIMULATED_PLAYER_COUNTRY_STARTER'});
 }
 rs.mineSiteReferences=refs;
 return asset;
}
let inFlight=null;
let inFlightCountry=null;
const lastProductionTurn=Object.create(null);
const lastProvisionReport=Object.create(null);
async function bootstrapCountry(countryId,options={}){
 const active=playerCountryId(),target=resolveCountry(countryId)||active;
 if(!active)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
 if(target!==active)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:target,playerCountryId:active};
 if(inFlight&&inFlightCountry===active)return inFlight;
 inFlightCountry=active;
 inFlight=(async()=>{
  const endowment=g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime;
  if(!endowment?.initialize||!endowment?.hydrateCountry||!endowment?.startCountryProduction)
   return{status:'BLOCKED',reason:'RESOURCE_ENDOWMENT_RUNTIME_UNAVAILABLE',countryId:active};
  const ready=await endowment.initialize();
  if(ready?.status!=='READY')return{status:'BLOCKED',reason:'RESOURCE_ENDOWMENT_NOT_READY',detail:ready,countryId:active};
  if(playerCountryId()!==active)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_CHANGED_DURING_INITIALIZATION',countryId:active};
  const industry=g.Omega?.ResourceIndustrialNetwork||g.OmegaResourceIndustrialNetwork;
  if(typeof industry?.loadCatalog==='function'){
   const catalogReady=await industry.loadCatalog();
   if(catalogReady?.status==='FAILED')return{status:'BLOCKED',reason:'INDUSTRIAL_CATALOG_NOT_READY',detail:catalogReady,countryId:active};
  }
  if(playerCountryId()!==active)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_CHANGED_DURING_CATALOG_LOAD',countryId:active};
  const sites=allSites().filter(site=>eligibleSite(site,active));
  if(!sites.length)return{status:'BLOCKED',reason:'NO_ELIGIBLE_COUNTRY_SITES',countryId:active};
  const firstHydration=await endowment.hydrateCountry(active);
  if(firstHydration?.status!=='APPLIED'&&(firstHydration?.result?.accepted===false||firstHydration?.status!=='READY'))
   return{status:'BLOCKED',reason:'COUNTRY_HYDRATION_NOT_COMMITTED',detail:firstHydration,countryId:active};
  if(playerCountryId()!==active)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_CHANGED_DURING_HYDRATION',countryId:active};
  const rs=ensureCountryInventory(active);
  const infra=ensureInfrastructure(active,sites.length);
  let autoStaffed=0,alreadyOperational=0,totalWorkers=0,totalWorkersRequired=0,totalVehicles=0;
  for(let index=0;index<sites.length;index++){
   if(playerCountryId()!==active)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_CHANGED_DURING_PROVISIONING',countryId:active,autoStaffed};
   const site=sites[index],previous=rs.mineAssets.find(x=>String(x?.siteId||x?.siteReferenceKey||'')===String(site.siteId));
   if(previous&&String(previous.status||'').toUpperCase()==='OPERATIONAL')alreadyOperational++;
   const asset=autoStaffAsset(active,site,rs);
   autoStaffed++;
   totalWorkers+=Math.max(0,num(asset.workersAssigned)||0);
   totalWorkersRequired+=Math.max(0,num(asset.workersRequired)||0);
   totalVehicles+=Math.max(0,num(asset.fleet?.vehiclesAssigned)||0);
   if(index>0&&index%16===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  rs.mineAssets=rs.mineAssets.slice(-4096);
  rs.commissionedSites=rs.commissionedSites.slice(-4096);
  rs.mineSiteReferences=rs.mineSiteReferences.slice(-8192);
  const root=state();
  root.economy=root.economy&&typeof root.economy==='object'?root.economy:{};
  const economy=root.economy[active]=root.economy[active]&&typeof root.economy[active]==='object'?root.economy[active]:{};
  economy.mineEmployment={
   schemaVersion:'1.0.0',model:'SIMULATED_MINE_EMPLOYMENT_V1',countryId:active,
   staffedSiteCount:autoStaffed,jobsSupported:totalWorkersRequired,jobsFilled:totalWorkers,
   workersRequired:totalWorkersRequired,workersAssigned:totalWorkers,
   vacancies:Math.max(0,totalWorkersRequired-totalWorkers),status:'FULLY_STAFFED',
   authority:'SIMULATED_PLAYER_COUNTRY_STARTER_WORKFORCE',simulationOnly:true,
   updatedTurn:num(state()?.simulation?.turn)||0
  };
  // A starter workforce pool is simulation-only and country-local. Preserve source values,
  // but prevent a missing/tiny unemployment ledger from stopping every new starter factory.
  if(economy.starterWorkforceProvisioning?.version!==VERSION){
   const countKeys=['unemploymentCount','unemployedCount','unemployedPeople','unemployed_people','unemployment_count','joblessCount'];
   const rateKeys=['unemployment_rate','unemploymentRatePct','unemploymentRate','unemployment_rate_pct'];
   const laborKeys=['laborForce','labor_force','laborForceSize','labor_force_size','totalLaborForce','total_labor_force'];
   const firstNumber=keys=>{for(const key of keys){const value=num(economy[key]);if(value!==null&&value>=0)return{value,key};}return{value:null,key:null};};
   const sourceCount=firstNumber(countKeys),sourceRate=firstNumber(rateKeys),sourceLabor=firstNumber(laborKeys);
   const inferred=sourceCount.value!==null?sourceCount.value:
    (sourceRate.value!==null&&sourceLabor.value!==null?Math.round(sourceLabor.value*sourceRate.value/100):0);
   const minimumPool=Math.max(1000000,totalWorkersRequired+sites.length*2500+50000);
   const starterPool=Math.max(minimumPool,inferred||0);
   const starterLaborForce=Math.max(sourceLabor.value||0,starterPool*10,10000000);
   economy.starterWorkforceOriginal={unemploymentCount:sourceCount.value,unemploymentCountField:sourceCount.key,
    unemploymentRatePct:sourceRate.value,unemploymentRateField:sourceRate.key,
    labourForce:sourceLabor.value,labourForceField:sourceLabor.key};
   economy.unemploymentCount=starterPool;
   economy.laborForce=starterLaborForce;
   economy.unemployment_rate=Number((starterPool/starterLaborForce*100).toFixed(6));
   for(const key of countKeys)if(Object.prototype.hasOwnProperty.call(economy,key))economy[key]=starterPool;
   for(const key of laborKeys)if(Object.prototype.hasOwnProperty.call(economy,key))economy[key]=starterLaborForce;
   for(const key of rateKeys)if(Object.prototype.hasOwnProperty.call(economy,key))economy[key]=economy.unemployment_rate;
   economy.starterWorkforceProvisioning={version:VERSION,status:'READY',countryId:active,
    availableWorkers:starterPool,labourForce:starterLaborForce,minimumStarterPool:minimumPool,
    sourceAuthority:sourceCount.value!==null||sourceRate.value!==null?'SOURCE_VALUES_PRESERVED_IN_STARTER_WORKFORCE_ORIGINAL':'NO_RECORDED_LABOUR_BASELINE',
    authority:'SIMULATED_PLAYER_COUNTRY_STARTER_WORKFORCE',simulationOnly:true,
    updatedTurn:num(state()?.simulation?.turn)||0};
  }
  const technologyProvisioning=ensureStarterTechnologies(active,sites,rs);
  let workforceReconciliation=null;
  try{workforceReconciliation=industry?.reconcileFactoryEmployment?.(active)||null;}catch(_){}
  rs.autoMineProvisioning={
   version:VERSION,status:'READY',countryId:active,turn:num(state()?.simulation?.turn)||0,
   eligibleSiteCount:sites.length,autoStaffedSiteCount:autoStaffed,totalWorkersRequired,
   totalAssignedWorkers:totalWorkers,totalAssignedVehicles:totalVehicles,
   mineEmployment:economy.mineEmployment,starterWorkforce:economy.starterWorkforceProvisioning,
   technologyProvisioning,workforceReconciliation,infrastructureStatus:infra.normalized,
   starterResourcesAvailable:true,allEligibleMinesCommissioned:true,
   authority:'SIMULATED_PLAYER_COUNTRY_STARTER_PROVISIONING'
  };
  lastProvisionReport[active]=rs.autoMineProvisioning;
  // Re-hydrate after commissioning so the authoritative mine-asset overlay and strategic
  // policy gate see the staffed starter assets before extraction begins.
  const refreshed=await endowment.hydrateCountry(active);
  if(refreshed?.status!=='APPLIED'&&(refreshed?.result?.accepted===false||refreshed?.status!=='READY'))
   return{status:'PARTIALLY_READY',reason:'POST_PROVISION_HYDRATION_NOT_COMMITTED',countryId:active,provisioning:rs.autoMineProvisioning,detail:refreshed};
  let production=null;
  if(options.startProduction!==false){
   if(playerCountryId()!==active)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_CHANGED_BEFORE_PRODUCTION',countryId:active,provisioning:rs.autoMineProvisioning};
   const currentTurn=num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn)||0;
   if(lastProductionTurn[active]===currentTurn){
    production={status:'ALREADY_ATTEMPTED_THIS_TURN',countryId:active,turn:currentTurn};
   }else{
    production=await endowment.startCountryProduction(active);
    const status=String(production?.status||'').toUpperCase();
    if(['STARTED','PARTIALLY_STARTED','ALREADY_ACTIVE'].includes(status))lastProductionTurn[active]=currentTurn;
   }
  }
  return{status:'READY',countryId:active,provisioning:rs.autoMineProvisioning,production};
 })().finally(()=>{inFlight=null;inFlightCountry=null;});
 return inFlight;
}
async function runSelectedCountryTurn(){
 const cid=playerCountryId();
 if(!cid)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
 return bootstrapCountry(cid,{startProduction:true,reason:'SIMULATION_TURN'});
}
function diagnostics(countryId=null){
 const cid=resolveCountry(countryId)||playerCountryId();
 if(!cid)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
 const rs=state()?.resource?.[cid]||{};
 const eligible=allSites().filter(site=>eligibleSite(site,cid));
 const assets=Array.isArray(rs.mineAssets)?rs.mineAssets:[];
 const active=assets.filter(x=>String(x?.status||'').toUpperCase()==='OPERATIONAL');
 const fullyStaffed=active.filter(x=>(num(x.workersAssigned)||0)>=(num(x.workersRequired)||0));
 return{status:'READY',countryId:cid,selectedPlayerCountryId:playerCountryId(),eligibleSiteCount:eligible.length,
  operationalMineAssetCount:active.length,fullyStaffedMineCount:fullyStaffed.length,
  autoProvisioning:rs.autoMineProvisioning||lastProvisionReport[cid]||null,
  isPlayerCountry:cid===playerCountryId()};
}
function scheduleSelectedCountry(reason){
 Promise.resolve().then(()=>bootstrapCountry(playerCountryId(),{startProduction:true,reason})).catch(error=>{
  g.__OmegaAutoMineLastError={reason:String(error?.message||error),turn:num(state()?.simulation?.turn)||0};
 });
}
const API=Object.freeze({VERSION,playerCountryId,bootstrapCountry,runSelectedCountryTurn,diagnostics});
g.Omega=g.Omega||{};
g.Omega.ResourceAutoMineRuntime=API;
g.OmegaResourceAutoMineRuntime=API;
if(typeof g.addEventListener==='function'){
 ['OMEGA_COUNTRY_SELECTED','COUNTRY_SELECTED','OMEGA_PLAYER_COUNTRY_CHANGED','OMEGA_GAME_SESSION_STARTED'].forEach(name=>
  g.addEventListener(name,()=>scheduleSelectedCountry(name)));
 g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',()=>{runSelectedCountryTurn().catch(error=>{
  g.__OmegaAutoMineLastError={reason:String(error?.message||error),turn:num(state()?.simulation?.turn)||0};
 });});
}
// If the game session is already active before the UI modules finish loading, provision only
// that authoritative player country. Never iterate country rows or tick global opponents here.
Promise.resolve().then(()=>scheduleSelectedCountry('RUNTIME_READY'));
})(typeof window!=='undefined'?window:globalThis);
