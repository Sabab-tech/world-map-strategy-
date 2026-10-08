/* OMEGA RESOURCE INDUSTRIAL NETWORK RUNTIME v1.0.0
 * End-to-end industrial network:
 * site/extraction -> raw warehouse -> factory routing -> transport -> delivery -> factory execution plan
 * -> infrastructure projects -> technology research/import -> foreign EPC procurement.
 *
 * This module does not invent observed facts. Scenario engineering values are explicitly marked
 * simulation-only. Existing ResourceEconomy remains authoritative for inventory consumption/fiscal
 * settlement unless this runtime is explicitly asked to execute a factory cycle.
 */
(function(g){
'use strict';

const VERSION='1.0.0';
const MAX_SHIPMENTS=4096, MAX_PROJECTS=2048, MAX_EVENTS=4096;
const CATALOG_URL='resource_industrial_catalog_v1.json';

const clone=(v,seen)=>{
  if(v===null||typeof v!=='object')return v;
  seen=seen||new WeakMap(); if(seen.has(v))return seen.get(v);
  if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
  const o={};seen.set(v,o);
  for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k],seen);
  return o;
};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const id=v=>String(v??'').trim().toUpperCase();
const tok=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const state=()=>g.Game?.state||g.gameState||{};
const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn)??0;
const daysPerTurn=()=>Math.max(1,num(state()?.simulation?.daysPerTurn??state()?.simulation?.turnDays)??30);
const year=()=>{const d=state()?.simulation?.date;if(d){const y=num(String(d).slice(0,4));if(y!==null)return y;}return num(state()?.simulation?.startYear)??2015};
const canonicalCountry=v=>{
  const raw=String(v??'').trim();if(!raw)return null;
  try{const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;const r=b?.resolveCountry?.(raw);if(r?.id)return id(r.id);}catch(_){}
  return id(raw);
};
const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
const h32=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0};
const frac=s=>h32(s)/4294967296;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));

let catalog=null, catalogPromise=null;

async function loadCatalog(){
  const inline=g.OmegaResourceIndustrialCatalogData||g.Omega?.ResourceIndustrialCatalogData;
  if(inline){catalog=inline;return{status:'READY',reused:true}};
  if(catalog)return{status:'READY',reused:true};
  if(catalogPromise)return catalogPromise;
  catalogPromise=(async()=>{
    try{
      if(typeof fetch!=='function')throw new Error('FETCH_UNAVAILABLE');
      const r=await fetch(CATALOG_URL,{cache:'no-store'});if(!r?.ok)throw new Error('INDUSTRIAL_CATALOG_FETCH_FAILED');
      catalog=await r.json();g.OmegaResourceIndustrialCatalogData=catalog;g.Omega=g.Omega||{};g.Omega.ResourceIndustrialCatalogData=catalog;
      return{status:'READY',count:Object.keys(catalog.resourceRules||{}).length};
    }catch(e){return{status:'FAILED',reason:String(e?.message||e)}}
    finally{catalogPromise=null}
  })();
  return catalogPromise;
}
function cat(){return catalog||g.OmegaResourceIndustrialCatalogData||g.Omega?.ResourceIndustrialCatalogData||null}
function rules(){return cat()?.resourceRules||{}}
function methodRules(){return cat()?.extractionMethods||{}}
function processRules(){return cat()?.processingRules||{}}
function modeRules(){return cat()?.transportModes||{}}
function infraRules(){return cat()?.infrastructureTypes||{}}
function techRules(){return cat()?.technologyProjects||{}}

function resourceState(c){
  const s=state(),cid=canonicalCountry(c);s.resource=s.resource||{};s.resource[cid]=s.resource[cid]||{};return s.resource[cid];
}
function econState(c){
  const s=state(),cid=canonicalCountry(c);s.economy=s.economy||{};s.economy[cid]=s.economy[cid]||{};return s.economy[cid];
}
function transportState(c){
  const s=state(),cid=canonicalCountry(c);s.transport=s.transport||{};s.transport[cid]=s.transport[cid]||{};return s.transport[cid];
}
function netState(c){
  const r=resourceState(c);r.industrialNetwork=r.industrialNetwork||{
    schemaVersion:VERSION,shipments:[],projects:[],extractions:[],reservations:{},deliveries:[],
    infrastructure:{nodes:{},edges:{},corridors:{}},events:[],factoryRuntime:{},technologyContracts:[]
  };
  return r.industrialNetwork;
}
function emit(type,c,payload,source='resource-industrial-network'){
  const m=interop(),cid=canonicalCountry(c),body={countryId:cid,payload:clone(payload||{}),source,simulationTurn:turn()};
  try{m?.emitEvent?.(type,cid,source,body,{turn:turn(),correlationId:payload?.correlationId||payload?.id||null})}catch(_){}
  try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent(type,{detail:{eventType:type,...body}}))}catch(_){}
}
function dispatch(owner,type,c,payload){
  try{return interop()?.dispatchCommand?.(owner,type,canonicalCountry(c),payload||{},{turn:turn(),commandType:type,correlationId:payload?.correlationId||payload?.id||null})||{status:'UNAVAILABLE',reason:'INTEROP_UNAVAILABLE'}}catch(e){return{status:'FAILED',reason:String(e?.message||e)}}
}

function masterSites(){
  const x=g.OmegaResourceSiteMasterResearchData||g.Omega?.ResourceSiteMasterResearchData;
  return Array.isArray(x?.sites)?x.sites:[];
}
function siteById(siteId){
  const s=String(siteId||'').trim();
  return masterSites().find(x=>String(x?.siteId||'')===s)||null;
}
function scenarioFor(site,resourceId){
  const x=g.OmegaResourceScenarioEngineeringData||g.Omega?.ResourceScenarioEngineeringData;
  const rows=Array.isArray(x?.records)?x.records:[];
  return rows.find(r=>String(r?.siteId||'')===String(site?.siteId||'')&&tok(r?.resourceId)===tok(resourceId))||null;
}
function simulationRouteFor(site){
  const route=site?.simulation?.transportRoute;
  return Array.isArray(route)?clone(route):[];
}

function normalizeInfrastructure(c){
  const cid=canonicalCountry(c),ts=transportState(cid),n=netState(cid);
  ts.infrastructure=ts.infrastructure||{};
  const infra=ts.infrastructure;
  if(infra.roads==null)infra.roads={capacityPerDay:40000,quality:0.65};
  if(infra.rail==null)infra.rail={capacityPerDay:90000,quality:0.55};
  if(infra.ports==null)infra.ports={capacityPerDay:180000,quality:0.60};
  if(infra.bridges==null)infra.bridges={capacityPerDay:45000,quality:0.60};
  if(infra.pipelines==null)infra.pipelines={capacityPerDay:350000,quality:0.60};
  n.infrastructure.baselineInitialized=true;
  return{infra,n};
}
function infraQuality(c,mode){
  const {infra}=normalizeInfrastructure(c);
  const map={truck:infra.roads,rail:infra.rail,ship:infra.ports,barge:infra.roads,pipeline:infra.pipelines};
  const x=map[mode]||{capacityPerDay:20000,quality:.5};
  return{capacityPerDay:num(x.capacityPerDay)||20000,quality:clamp(x.quality??.5,.15,1)};
}

function resourceMethod(site,resourceId){
  const r=rules()[tok(resourceId)]||{};
  const explicit=String(site?.real?.extractionMethod||site?.sourceSiteRecord?.extractionMethod||site?.extractionMethod||'').trim();
  if(explicit&&methodRules()[explicit])return{method:explicit,source:'OBSERVED_OR_MASTER'};
  const siteType=tok(site?.siteType||site?.sourceSiteRecord?.siteType||'');
  if(resourceId==='crude_oil'||resourceId==='natural_gas')return{method:'WELL_DRILL_PUMP',source:'RESOURCE_ENGINEERING_RULE'};
  if(siteType.includes('underground')||siteType.includes('deep_mine'))return{method:r.fallbackMethod||r.method||'UNDERGROUND_ROOM_PILLAR',source:'SITE_TYPE_RULE'};
  if(siteType.includes('quarry'))return{method:'QUARRY_CRUSH_SCREEN',source:'SITE_TYPE_RULE'};
  if(siteType.includes('dredg'))return{method:'DREDGING',source:'SITE_TYPE_RULE'};
  return{method:r.method||r.fallbackMethod||'OPEN_PIT_DRILL_BLAST',source:'RESOURCE_ENGINEERING_RULE'};
}

function getTechnologyEffect(countryId,siteId,resourceId,siteType){
  const out={technologies:[],capacityMultiplier:1,recoveryAdd:0,utilizationAdd:0,maintenanceMultiplier:1,declineMultiplier:1,outputMultiplier:1};
  const cid=canonicalCountry(countryId),rid=tok(resourceId),caps=Array.isArray(resourceState(cid).technologyCapabilities)?resourceState(cid).technologyCapabilities:[];
  const seen=new Set();
  for(const cap of caps){
    const tid=tok(cap?.technologyId).toUpperCase(),spec=techRules()[tid];
    if(!tid||!spec||String(cap?.status||'COMPLETE').toUpperCase()!=='COMPLETE'||seen.has(tid))continue;
    const targets=Array.isArray(spec.targetResourceIds)?spec.targetResourceIds.map(tok):['*'];
    if(!(targets.includes('*')||targets.includes(rid)))continue;
    if(cap.targetResourceId&&tok(cap.targetResourceId)!==rid&&tok(cap.targetResourceId)!=='*')continue;
    if(cap.targetSiteId&&String(cap.targetSiteId)!=='*'&&String(cap.targetSiteId)!==String(siteId))continue;
    if(cap.targetSiteType&&tok(cap.targetSiteType)!=='*'&&tok(cap.targetSiteType)!==tok(siteType))continue;
    const fx=cap.effects||spec.effects||{};seen.add(tid);out.technologies.push({technologyId:tid,effects:clone(fx),sourceType:cap.sourceType||'INDUSTRIAL_NETWORK'});
    out.capacityMultiplier*=Math.max(.1,num(fx.capacityMultiplier)||1);
    out.recoveryAdd+=num(fx.recoveryAdd)||0;out.utilizationAdd+=num(fx.utilizationAdd)||0;
    out.maintenanceMultiplier*=Math.max(.1,num(fx.maintenanceMultiplier)||1);
    out.declineMultiplier*=Math.max(.1,num(fx.declineMultiplier)||1);
    out.outputMultiplier*=Math.max(.1,num(fx.outputMultiplier)||1);
  }
  try{
    const ext=g.Omega?.ResourceResearchRuntime?.getEngineeringEffect?.(cid,siteId,resourceId,siteType);
    for(const x of Array.isArray(ext?.technologies)?ext.technologies:[]){
      const tid=tok(x?.technologyId||x?.id).toUpperCase();if(tid&&seen.has(tid))continue;
      if(tid)seen.add(tid);out.technologies.push(clone(x));
    }
    if(ext&&out.technologies.length===0){
      out.capacityMultiplier*=Math.max(.1,num(ext.capacityMultiplier)||1);out.recoveryAdd+=num(ext.recoveryAdd)||0;
      out.utilizationAdd+=num(ext.utilizationAdd)||0;out.maintenanceMultiplier*=Math.max(.1,num(ext.maintenanceMultiplier)||1);
      out.declineMultiplier*=Math.max(.1,num(ext.declineMultiplier)||1);out.outputMultiplier*=Math.max(.1,num(ext.outputMultiplier)||1);
    }
  }catch(_){}
  return out;
}

function planExtraction(input={}){
  const cid=canonicalCountry(input.countryId),site=siteById(input.siteId)||input.site;
  if(!site?.siteId)return{status:'BLOCKED',reason:'SITE_NOT_FOUND'};
  const resourceId=tok(input.resourceId||site?.real?.resourceId||site?.sourceSiteRecord?.resourceId);
  if(!resourceId)return{status:'BLOCKED',reason:'RESOURCE_ID_MISSING'};
  const sr=scenarioFor(site,resourceId),model=g.Omega?.ResourceRealism?.siteModel?.({siteId:site.siteId,siteReferenceKey:site.siteId,siteName:site.siteName,siteType:site.siteType,resourceId,simulationReserveQuantity:sr?.reserve?.quantity||input.reserveQuantity,simulationReserveUnit:sr?.reserve?.unit||input.reserveUnit},null,cid);
  const stream=model?.commodityStreams?.find(x=>tok(x.resourceId)===resourceId);
  if(!stream)return{status:'BLOCKED',reason:'NO_COMMODITY_STREAM'};
  const meth=resourceMethod(site,resourceId),m=methodRules()[meth.method];if(!m)return{status:'BLOCKED',reason:'EXTRACTION_METHOD_UNDEFINED'};
  const tech=getTechnologyEffect(cid,site.siteId,resourceId,site.siteType);
  const daily=Math.max(.000001,num(stream.production?.activeRate)||num(stream.production?.nominalCapacity)||0)*Math.max(.1,num(tech.capacityMultiplier)||1);
  if(daily<=0)return{status:'BLOCKED',reason:'ZERO_EXTRACTION_CAPACITY'};
  const requested=Math.max(0,num(input.quantity)||daily*Number(rules()[resourceId]?.batchDays||1));
  const currentReserve=Math.max(0,num(input.remainingReserve)??num(stream.reserve?.quantity)??0);
  if(currentReserve<=0)return{status:'BLOCKED',reason:'RESERVE_EXHAUSTED',remainingReserve:currentReserve};
  const quantity=Math.min(requested,currentReserve,daily*Math.max(1,Number(rules()[resourceId]?.batchDays||1)));
  const haulDays=Math.max(0,num(input.mineToWarehouseDays)??0);
  const extractionDays=Math.max(1,quantity/daily)+Number(m.prepDays||0)/Math.max(1,Number(rules()[resourceId]?.batchDays||1));
  const totalDays=extractionDays+haulDays;
  const path='MINE_PATH:'+cid+':'+site.siteId;
  const plan={status:'PLANNED',planId:'EXT:'+cid+':'+site.siteId+':'+resourceId+':T'+turn(),countryId:cid,siteId:site.siteId,siteName:site.siteName,resourceId,
    method:meth.method,methodAuthority:meth.source,methodDetails:clone(m),requestedQuantity:requested,approvedQuantity:quantity,unit:stream.reserve?.unit||sr?.reserve?.unit||'TONNES',
    dailyCapacity:daily,extractionDays:Number(extractionDays.toFixed(3)),haulDays:Number(haulDays.toFixed(3)),totalDurationDays:Number(totalDays.toFixed(3)),
    crewRequired:m.crew,equipmentRequired:clone(m.equipment),batchCycleDays:rules()[resourceId]?.batchDays||1,recovery:stream.production?.recovery??null,
    technologyEffects:clone(tech),minePath:path,warehouseCountryId:cid,sourceAuthority:stream.reserve?.authority||'SIMULATED',simulationYear:year()
  };
  netState(cid).extractions.push(plan);netState(cid).extractions=netState(cid).extractions.slice(-MAX_EVENTS);
  emit('OMEGA_RESOURCE_EXTRACTION_PLAN_CREATED',cid,plan);
  return plan;
}

function factoryAssets(c){
  const assets=econState(c).productionAssets;return Array.isArray(assets)?assets:[];
}
function recipeFor(resourceId,asset={}){
  const r=processRules()[tok(resourceId)]||{};
  const inputs=asset.inputCoefficients||asset.inputs||r.inputs||{};
  const outputs=asset.outputProfile||asset.outputs||r.outputs||{};
  return{factoryType:asset.factoryType||asset.type||r.factoryType||'RESOURCE_PROCESSING_PLANT',inputs:clone(inputs),outputs:clone(outputs),cycleDays:num(asset.cycleDays)||num(r.cycleDays)||1};
}
function assetCanAccept(asset,resourceId){
  if(!asset||asset.status==='CLOSED'||asset.status==='DECOMMISSIONED')return false;
  const recipe=recipeFor(resourceId,asset),ks=Object.keys(recipe.inputs);
  return ks.some(k=>tok(k)===tok(resourceId));
}
function candidateFactories(c,resourceId){
  return factoryAssets(c).filter(a=>assetCanAccept(a,resourceId)).map((asset,index)=>({asset,index,recipe:recipeFor(resourceId,asset)}));
}

function nodeToken(type,c,idv){return type+':'+canonicalCountry(c)+':'+String(idv||'').replace(/[^A-Za-z0-9_-]/g,'_')}

function corridorDistance(site,asset,mode){
  const explicit=simulationRouteFor(site);
  const hit=explicit.find(x=>tok(x?.mode||x?.transportMode)===tok(mode));
  if(hit){
    const d=num(hit.distanceKm??hit.distance??hit.km);if(d&&d>0)return{distanceKm:d,authority:'SITE_SIMULATION_ROUTE'};
  }
  const seed=frac([site?.siteId,asset?.id||asset?.assetId||asset?.projectId,mode].join('|'));
  const base={truck:60,rail:450,barge:280,ship:1800,pipeline:350}[mode]||250;
  return{distanceKm:Math.max(15,Math.round(base*(.55+seed*1.1))),authority:'SIMULATED_CORRIDOR_MODEL'};
}
function routeSegments(site,asset,resourceId,mode,countryId){
  const cid=canonicalCountry(countryId),f=asset||{},access=Array.isArray(f.transportAccess)?f.transportAccess.map(tok):[];
  const pref=(rules()[resourceId]?.preferredModes||[]).map(tok);
  const chosen=tok(mode);
  const distance=corridorDistance(site,f,chosen);
  const sameNode=String(f.siteId||f.locationNodeKey||'').toUpperCase()===String(site?.siteId||'').toUpperCase();
  if(sameNode)return[{mode:'truck',distanceKm:5,edgeClass:'MINE_TO_SAME_SITE_FACTORY',sourceAuthority:'SIMULATED_NETWORK'}];
  if(chosen==='pipeline')return[{mode:'pipeline',distanceKm:distance.distanceKm,edgeClass:'PIPELINE_CORRIDOR',sourceAuthority:distance.authority}];
  if(chosen==='ship')return[
    {mode:'truck',distanceKm:Math.max(10,Math.round(distance.distanceKm*.10)),edgeClass:'MINE_TO_PORT',sourceAuthority:distance.authority},
    {mode:'ship',distanceKm:Math.max(100,Math.round(distance.distanceKm*.85)),edgeClass:'SEA_LANE',sourceAuthority:distance.authority},
    {mode:'truck',distanceKm:Math.max(10,Math.round(distance.distanceKm*.05)),edgeClass:'PORT_TO_FACTORY',sourceAuthority:distance.authority}
  ];
  const baseRail=(chosen==='rail' && (access.includes('rail')||access.length===0))?[
    {mode:'truck',distanceKm:Math.max(8,Math.round(distance.distanceKm*.12)),edgeClass:'MINE_ACCESS_ROAD',sourceAuthority:distance.authority},
    {mode:'rail',distanceKm:Math.max(25,Math.round(distance.distanceKm*.80)),edgeClass:'HEAVY_RAIL_CORRIDOR',sourceAuthority:distance.authority},
    {mode:'truck',distanceKm:Math.max(5,Math.round(distance.distanceKm*.08)),edgeClass:'FACTORY_LAST_MILE',sourceAuthority:distance.authority}
  ]:null;
  if(baseRail){
    const n=netState(cid),pad=n.infrastructure?.corridors?.PADMA_EAST_WEST;
    if(cid==='BGD'&&baseRail.length>=3)baseRail.splice(1,0,{mode:'rail',distanceKm:6.15,edgeClass:pad?.status==='OPERATIONAL'?'PADMA_EAST_WEST_CROSSING_OPERATIONAL':'PADMA_EAST_WEST_CROSSING_BASELINE',sourceAuthority:pad?.status==='OPERATIONAL'?'INFRASTRUCTURE_PROJECT':'BASELINE_INFRASTRUCTURE'});
    return baseRail;
  }
  return[{mode:'truck',distanceKm:distance.distanceKm,edgeClass:'ROAD_CORRIDOR',sourceAuthority:distance.authority}];
}
function buildRoute(site,asset,resourceId,requestedQuantity,input={}){
  const cid=canonicalCountry(input.countryId||site?.countryId),mode=tok(input.transportMode||rules()[resourceId]?.preferredModes?.[0]||'truck');
  const mr=modeRules()[mode]||modeRules().truck;const segments=routeSegments(site,asset,resourceId,mode,cid);
  let quantity=Math.max(0,num(requestedQuantity)||0),totalDays=0,totalCost=0,limitingCapacity=Infinity,vehiclePlan=[];
  for(const seg of segments){
    const m=modeRules()[seg.mode]||modeRules().truck,iq=infraQuality(cid,seg.mode),capacity=Math.max(1,iq.capacityPerDay*iq.quality),distance=Math.max(0,num(seg.distanceKm)||0);
    const hours=distance/Math.max(1,num(m.speedKmh)||1)+num(m.loadHours)||0+num(m.unloadHours)||0;
    const days=Math.max(.05,hours/24),capForTrip=capacity*Math.max(1,days);
    limitingCapacity=Math.min(limitingCapacity,capForTrip);
    totalDays+=days*(1.05+(1-iq.quality)*.5);
    totalCost+=quantity*distance*(num(m.costPerTonneKm)||.05);
    const payload=Math.max(.001,num(m.payloadTonnes)||1),units=Math.ceil(quantity/payload);
    vehiclePlan.push({mode:seg.mode,vehicle:m.vehicle,units,payloadTonnes:payload,distanceKm:distance,travelDays:Number(days.toFixed(3)),capacityPerDay:capacity,edgeClass:seg.edgeClass,sourceAuthority:seg.sourceAuthority});
  }
  const dispatchQuantity=Math.min(quantity,Math.max(0,limitingCapacity));
  const legs=vehiclePlan.length;
  const path=vehiclePlan.map(x=>x.edgeClass);
  const etaTurn=turn()+Math.max(1,Math.ceil(totalDays/daysPerTurn()));
  const route={status:dispatchQuantity>0?'PLANNED':'BLOCKED',routeId:'IR:'+h32(JSON.stringify({cid,site:site?.siteId,factory:asset?.id||asset?.assetId||asset?.projectId,resourceId,mode})).toString(16),
    countryId:cid,sourceSiteId:site?.siteId||null,sourceNode:nodeToken('MINE',cid,site?.siteId),destinationFactoryId:String(asset?.id||asset?.assetId||asset?.projectId||''),destinationNode:nodeToken('FACTORY',cid,asset?.id||asset?.assetId||asset?.projectId),
    resourceId,requestedQuantity:quantity,dispatchQuantity:Number(dispatchQuantity.toFixed(6)),unit:input.unit||'TONNES',transportMode:mode,
    routePath:path,legs:vehiclePlan,totalDistanceKm:vehiclePlan.reduce((s,x)=>s+x.distanceKm,0),travelTimeDays:Number(totalDays.toFixed(3)),
    etaTurn,etaYear:year()+Math.floor(totalDays/365),vehiclePlan,totalCost:Number(totalCost.toFixed(4)),
    capacityAuthority:'INFRASTRUCTURE_MODEL',distanceAuthority:vehiclePlan.every(x=>x.sourceAuthority==='SITE_SIMULATION_ROUTE')?'SITE_SIMULATION_ROUTE':'SIMULATED_CORRIDOR_MODEL',
    crossBorderRequired:canonicalCountry(asset?.countryId||cid)!==cid,crossBorderAllowed:false,
    statusReason:dispatchQuantity>0?'ROUTE_CAPACITY_AVAILABLE':'ROUTE_CAPACITY_ZERO'};
  return route;
}

function planShipment(input={}){
  const cid=canonicalCountry(input.countryId),site=siteById(input.siteId)||input.site;
  if(!site?.siteId)return{status:'BLOCKED',reason:'SITE_NOT_FOUND'};
  const rid=tok(input.resourceId||site?.real?.resourceId||site?.sourceSiteRecord?.resourceId);if(!rid)return{status:'BLOCKED',reason:'RESOURCE_ID_MISSING'};
  const candidates=candidateFactories(cid,rid);
  if(input.factoryId){const f=candidates.find(x=>String(x.asset?.id||x.asset?.assetId||x.asset?.projectId)===String(input.factoryId));if(!f)return{status:'BLOCKED',reason:'FACTORY_NOT_CAPABLE'};candidates.splice(0,candidates.length,f)}
  if(!candidates.length)return{status:'BLOCKED',reason:'NO_MATCHING_FACTORY',countryId:cid,siteId:site.siteId,resourceId:rid};
  const ordered=candidates.sort((a,b)=>String(a.asset?.priority??999)-String(b.asset?.priority??999));
  let best=null;
  for(const c of ordered.slice(0,16)){
    const route=buildRoute(site,c.asset,rid,input.quantity,{countryId:cid,transportMode:input.transportMode,unit:input.unit});
    if(route.status==='PLANNED' && (!best||route.travelTimeDays<best.route.travelTimeDays))best={candidate:c,route};
  }
  if(!best)return{status:'BLOCKED',reason:'NO_USABLE_TRANSPORT_ROUTE',candidates:ordered.length};
  if(best.route.crossBorderRequired&&!input.tradeContractId)return{status:'BLOCKED',reason:'CROSS_BORDER_CONTRACT_REQUIRED',route:best.route};
  const result={status:'PLANNED',countryId:cid,siteId:site.siteId,resourceId:rid,factoryId:String(best.candidate.asset?.id||best.candidate.asset?.assetId||best.candidate.asset?.projectId),recipe:best.candidate.recipe,route:best.route};
  emit('OMEGA_RESOURCE_FACTORY_ROUTE_PLANNED',cid,result);
  return result;
}

function reserveInventoryForShipment(c,resourceId,quantity,shipmentId){
  const r=resourceState(c),n=netState(c);r.warehouse=r.warehouse||{availableByResource:{},reservedByResource:{}};const w=r.warehouse;
  w.availableByResource=w.availableByResource||{};w.reservedByResource=w.reservedByResource||{};
  const available=Math.max(0,num(w.availableByResource[resourceId])||0);
  const reserved=Math.max(0,num(w.reservedByResource[resourceId])||0);
  if(available-reserved<quantity)return{ok:false,reason:'WAREHOUSE_AVAILABLE_AFTER_RESERVATIONS_TOO_LOW',available:available-reserved};
  w.reservedByResource[resourceId]=reserved+quantity;n.reservations[shipmentId]={resourceId,quantity,status:'RESERVED'};
  return{ok:true};
}
function dispatchShipment(input={}){
  const plan=planShipment(input);if(plan.status!=='PLANNED')return plan;
  const cid=canonicalCountry(input.countryId),shipmentId='SHIP:'+h32(JSON.stringify({plan,turn:turn(),salt:frac(input.siteId||'')}));
  const reserved=reserveInventoryForShipment(cid,plan.resourceId,plan.route.dispatchQuantity,shipmentId);if(!reserved.ok)return{status:'BLOCKED',reason:reserved.reason,details:reserved,plan};
  const s={shipmentId,countryId:cid,siteId:plan.siteId,resourceId:plan.resourceId,factoryId:plan.factoryId,quantity:plan.route.dispatchQuantity,unit:input.unit||'TONNES',
    status:'IN_TRANSIT',createdTurn:turn(),etaTurn:plan.route.etaTurn,route:clone(plan.route),reservationId:shipmentId,provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:plan.route.distanceAuthority}};
  const n=netState(cid);n.shipments.push(s);n.shipments=n.shipments.slice(-MAX_SHIPMENTS);emit('OMEGA_RESOURCE_SHIPMENT_CREATED',cid,s);
  return{status:'DISPATCHED',shipment:s};
}
function advanceShipments(c){
  const cid=canonicalCountry(c),n=netState(cid),delivered=[];
  for(const s of n.shipments){
    if(s.status!=='IN_TRANSIT'||num(s.etaTurn)>turn())continue;
    s.status='DELIVERED';s.deliveredTurn=turn();s.destinationStatus='FACTORY_RECEIVED';
    n.deliveries.push(clone(s));delivered.push(clone(s));
    const res=n.reservations?.[s.reservationId];if(res)res.status='DELIVERED';
    emit('OMEGA_RESOURCE_DELIVERY_COMPLETED',cid,{shipmentId:s.shipmentId,siteId:s.siteId,factoryId:s.factoryId,resourceId:s.resourceId,quantity:s.quantity,unit:s.unit,travelTimeDays:s.route.travelTimeDays,transport:s.route.transportMode,status:'DELIVERED_TO_FACTORY'});
  }
  n.deliveries=n.deliveries.slice(-MAX_SHIPMENTS);
  return{status:'ADVANCED',countryId:cid,turn:turn(),delivered:delivered.length,shipments:delivered};
}

function startFactoryProject(input={}){
  const cid=canonicalCountry(input.countryId),rid=tok(input.resourceId),rule=processRules()[rid];if(!rule)return{status:'BLOCKED',reason:'NO_FACTORY_RECIPE'};
  const contractor=String(input.contractorType||'DOMESTIC_EPC'),cr=cat()?.contractorTypes?.[contractor]||cat()?.contractorTypes?.DOMESTIC_EPC;
  const baseDays=Math.max(30,num(input.buildDays)||Number(rule.cycleDays||1)*60+90),days=baseDays*(1-(num(cr?.constructionBonus)||0));
  const project={projectId:'FACTORY:'+cid+':'+rid+':T'+turn()+':'+h32(JSON.stringify(input)),projectType:'FACTORY_CONSTRUCTION',countryId:cid,resourceId:rid,factoryType:input.factoryType||rule.factoryType,
    contractorType:contractor,contractorCountryId:canonicalCountry(input.contractorCountryId||cid),cost:Math.max(1,num(input.cost)||1000),durationDays:Number(days.toFixed(2)),startTurn:turn(),progressDays:0,status:'UNDER_CONSTRUCTION',
    capacityPerDay:Math.max(1,num(input.capacityPerDay)||num(input.throughputPerDay)||500),recipe:clone(rule),factoryId:String(input.factoryId||('FAC:'+cid+':'+rid+':'+h32(String(turn())))),targetLocationNodeKey:input.locationNodeKey||('INDUSTRIAL_ZONE:'+cid),foreignContract:contractor!=='DOMESTIC_EPC',
    requiredTechnologyIds:Array.isArray(input.requiredTechnologyIds)?input.requiredTechnologyIds.map(x=>String(x).toUpperCase()):[],technologyPackage:clone(input.technologyPackage||null)};
  const n=netState(cid);n.projects.push(project);n.projects=n.projects.slice(-MAX_PROJECTS);emit('OMEGA_FACTORY_PROJECT_STARTED',cid,project);return project;
}
function startInfrastructureProject(input={}){
  const cid=canonicalCountry(input.countryId),type=tok(input.infrastructureType||'road'),ir=infraRules()[type];if(!ir)return{status:'BLOCKED',reason:'INFRASTRUCTURE_TYPE_UNDEFINED'};
  const distance=Math.max(0,num(input.distanceKm)||1),contractor=String(input.contractorType||'DOMESTIC_EPC'),cr=cat()?.contractorTypes?.[contractor]||{};
  const days=Math.max(30,(num(ir.buildDays)||180)*(distance/Math.max(1,num(input.distanceReferenceKm)||10))*(1-(num(cr?.constructionBonus)||0)));
  const capacityAdd=Math.max(0,num(input.capacityPerDay)||num(ir.capacityPerDay)||1000);
  const project={projectId:'INFRA:'+cid+':'+type+':T'+turn()+':'+h32(JSON.stringify(input)),projectType:'INFRASTRUCTURE',countryId:cid,infrastructureType:type,distanceKm:distance,capacityAddPerDay:capacityAdd,cost:Math.max(1,num(input.cost)||((num(ir.costPerKm)||0)*distance+(num(ir.costFixed)||0))),durationDays:Number(days.toFixed(2)),progressDays:0,startTurn:turn(),status:'UNDER_CONSTRUCTION',
    fromNode:input.fromNode||null,toNode:input.toNode||null,corridorId:input.corridorId||null,contractorType:contractor,contractorCountryId:canonicalCountry(input.contractorCountryId||cid)};
  const n=netState(cid);n.projects.push(project);n.projects=n.projects.slice(-MAX_PROJECTS);emit('OMEGA_INFRASTRUCTURE_PROJECT_STARTED',cid,project);return project;
}
function startPadmaCorridorProject(input={}){
  if(canonicalCountry(input.countryId)!=='BGD')return{status:'BLOCKED',reason:'PADMA_CORRIDOR_IS_BGD_SPECIFIC'};
  return startInfrastructureProject({...input,countryId:'BGD',infrastructureType:'bridge',distanceKm:num(input.distanceKm)||6.15,capacityPerDay:num(input.capacityPerDay)||60000,corridorId:'PADMA_EAST_WEST',fromNode:input.fromNode||'PADMA_WEST_GATEWAY',toNode:input.toNode||'PADMA_EAST_GATEWAY',contractorType:input.contractorType||'DOMESTIC_EPC'});
}
function advanceProjects(c){
  const cid=canonicalCountry(c),n=netState(cid),completed=[],technologyCompleted=advanceTechnologyProjects(cid);
  for(const p of n.projects){
    if(p.status!=='UNDER_CONSTRUCTION')continue;
    const step=daysPerTurn()*(p.contractorType==='FOREIGN_EPC'?1.10:1);
    p.progressDays=Math.min(num(p.durationDays)||1,(num(p.progressDays)||0)+step);
    p.progressPct=(p.progressDays/(num(p.durationDays)||1));
    if(p.progressPct<1)continue;
    p.status='COMPLETED';p.completedTurn=turn();completed.push(clone(p));
    if(p.projectType==='FACTORY_CONSTRUCTION'){
      const econ=econState(cid);econ.productionAssets=Array.isArray(econ.productionAssets)?econ.productionAssets:[];
      const techReady=(p.requiredTechnologyIds||[]).every(t=>resourceState(cid).technologyCapabilities?.some(x=>tok(x?.technologyId).toUpperCase()===tok(t)));
      const assetStatus=techReady?'OPERATIONAL':'TECHNOLOGY_LOCKED';
      econ.productionAssets.push({id:p.factoryId,stage:'PROCESSING',factoryType:p.factoryType,capacity:inputCapacityFromFactory(p),locationNodeKey:p.targetLocationNodeKey,status:assetStatus,
        inputCoefficients:p.recipe.inputs,outputProfile:p.recipe.outputs,cycleDays:p.recipe.cycleDays,companyId:'EPC_FACTORY_OWNER',
        transportAccess:['road','rail','ship'],commissionedTurn:turn(),requiredTechnologyIds:clone(p.requiredTechnologyIds||[])});
      emit('OMEGA_FACTORY_CAPACITY_CHANGED',cid,{factoryId:p.factoryId,capacity:inputCapacityFromFactory(p),projectId:p.projectId,status:assetStatus});
      if(assetStatus==='TECHNOLOGY_LOCKED')emit('OMEGA_FACTORY_TECHNOLOGY_BLOCKED',cid,{factoryId:p.factoryId,requiredTechnologyIds:clone(p.requiredTechnologyIds||[])});
    }else{
      const ts=transportState(cid),ir=infraRules()[p.infrastructureType]||{};ts.infrastructure=ts.infrastructure||{};
      const key=p.infrastructureType+'s';ts.infrastructure[key]=ts.infrastructure[key]||{};ts.infrastructure[key].capacityPerDay=(num(ts.infrastructure[key].capacityPerDay)||0)+(num(p.capacityAddPerDay)||0);
      if(p.infrastructureType==='bridge'){ts.infrastructure.bridges=ts.infrastructure.bridges||{};ts.infrastructure.bridges.capacityPerDay=(num(ts.infrastructure.bridges.capacityPerDay)||0)+(num(p.capacityAddPerDay)||0);}
      if(p.corridorId)n.infrastructure.corridors[p.corridorId]={status:'OPERATIONAL',fromNode:p.fromNode,toNode:p.toNode,capacityPerDay:p.capacityAddPerDay,infrastructureType:p.infrastructureType};
      emit('OMEGA_TRANSPORT_INFRASTRUCTURE_COMPLETED',cid,p);
    }
    emit('OMEGA_PROJECT_COMPLETED',cid,p);
  }
  return{status:'ADVANCED',countryId:cid,completed,technologyCompleted};
}
function inputCapacityFromFactory(p){
  return Math.max(1,num(p.capacityPerDay)||num(p.capacity)||1000);
}

function startTechnologyProject(input={}){
  const cid=canonicalCountry(input.countryId),technologyId=tok(input.technologyId).toUpperCase(),spec=techRules()[technologyId];
  if(!spec)return{status:'BLOCKED',reason:'TECHNOLOGY_PROJECT_UNDEFINED'};
  const mode=String(input.mode||'RESEARCH').toUpperCase(),donor=canonicalCountry(input.donorCountryId||input.contractorCountryId),contractor=String(input.contractorType||'DOMESTIC_EPC');
  if(mode==='IMPORT'&&!donor&&contractor!=='SPECIALIST_FOREIGN_TECH_VENDOR')return{status:'BLOCKED',reason:'DONOR_COUNTRY_OR_VENDOR_REQUIRED'};
  const donorCaps=donor?Array.isArray(resourceState(donor).technologyCapabilities)?resourceState(donor).technologyCapabilities:[]:[];
  if(mode==='IMPORT'&&!donorCaps.some(x=>tok(x?.technologyId).toUpperCase()===technologyId)&&contractor!=='SPECIALIST_FOREIGN_TECH_VENDOR')return{status:'BLOCKED',reason:'DONOR_TECHNOLOGY_NOT_AVAILABLE'};
  const contract={projectId:'TECH:'+cid+':'+technologyId+':T'+turn()+':'+h32(JSON.stringify(input)),countryId:cid,technologyId,mode,
    durationTurns:mode==='IMPORT'?spec.importTurns:spec.researchTurns,cost:mode==='IMPORT'?spec.importCost:spec.researchCost,donorCountryId:donor||null,
    contractorType:contractor,status:'IN_PROGRESS',startTurn:turn(),targetSiteId:input.targetSiteId||'*',targetResourceId:tok(input.resourceId||'*'),
    targetSiteType:input.siteType||'*',effects:clone(spec.effects||{})};
  netState(cid).technologyContracts.push(contract);emit('OMEGA_RESOURCE_TECHNOLOGY_PROJECT_STARTED',cid,contract);return contract;
}
function advanceTechnologyProjects(c){
  const cid=canonicalCountry(c),n=netState(cid),r=resourceState(cid),completed=[];
  r.technologyCapabilities=Array.isArray(r.technologyCapabilities)?r.technologyCapabilities:[];
  for(const p of n.technologyContracts){
    if(String(p.status).toUpperCase()!=='IN_PROGRESS')continue;
    const elapsed=turn()-Number(p.startTurn||turn());
    if(elapsed<Number(p.durationTurns||1))continue;
    if(p.mode==='IMPORT'&&p.donorCountryId){
      const donorCaps=Array.isArray(resourceState(p.donorCountryId).technologyCapabilities)?resourceState(p.donorCountryId).technologyCapabilities:[];
      if(!donorCaps.some(x=>tok(x?.technologyId).toUpperCase()===tok(p.technologyId))&&p.contractorType!=='SPECIALIST_FOREIGN_TECH_VENDOR'){
        p.status='BLOCKED';p.blockReason='DONOR_CAPABILITY_LOST';continue;
      }
    }
    const capability={technologyId:p.technologyId,targetSiteId:p.targetSiteId,targetResourceId:p.targetResourceId,targetSiteType:p.targetSiteType,
      sourceType:p.mode==='IMPORT'?'IMPORTED':'RESEARCH',donorCountryId:p.donorCountryId||null,effects:clone(p.effects),status:'COMPLETE',completedTurn:turn()};
    if(!r.technologyCapabilities.some(x=>tok(x?.technologyId).toUpperCase()===tok(p.technologyId)&&String(x?.targetResourceId||'*')===String(p.targetResourceId||'*'))){
      r.technologyCapabilities.push(capability);
    }
    p.status='COMPLETE';p.completedTurn=turn();completed.push(clone(capability));
    const assets=factoryAssets(cid);
    for(const asset of assets){
      if(String(asset.status).toUpperCase()!=='TECHNOLOGY_LOCKED')continue;
      const req=Array.isArray(asset.requiredTechnologyIds)?asset.requiredTechnologyIds:[];
      if(req.every(t=>r.technologyCapabilities.some(x=>tok(x?.technologyId).toUpperCase()===tok(t)))){
        asset.status='OPERATIONAL';asset.technologyUnlockedTurn=turn();emit('OMEGA_FACTORY_TECHNOLOGY_UNLOCKED',cid,{factoryId:asset.id,technologyId:p.technologyId});
      }
    }
    emit('OMEGA_RESOURCE_TECHNOLOGY_COMPLETED',cid,capability);
  }
  return completed;
}
function executeFactoryCycle(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||''),assets=factoryAssets(cid),asset=assets.find(a=>String(a?.id||a?.assetId||a?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const rid=tok(input.resourceId),recipe=recipeFor(rid,asset),requested=Math.max(0,num(input.quantity)||num(asset.capacity)||0);
  const r=resourceState(cid),inv=r.inventory||{},available=num(inv[rid])||0,need=requested*(num(recipe.inputs[rid])||1);
  if(available<need)return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',required:need,available};
  const output={};for(const k of Object.keys(recipe.outputs))output[k]=requested*(num(recipe.outputs[k])||0);
  if(r.inventory)r.inventory[rid]=available-need;else r.inventory={[rid]:available-need};
  for(const k of Object.keys(output))r.inventory[k]=(num(r.inventory[k])||0)+output[k];
  const record={transactionId:'FACTORYRUN:'+cid+':'+fid+':T'+turn(),countryId:cid,factoryId:fid,resourceId:rid,inputQuantity:need,requestedProduction:requested,outputs:output,recipe:clone(recipe),cycleDays:recipe.cycleDays,turn:turn(),authority:'INDUSTRIAL_NETWORK_SIMULATION',status:'COMPLETED'};
  const n=netState(cid);n.factoryRuntime[fid]=record;n.events.push(record);n.events=n.events.slice(-MAX_EVENTS);
  emit('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',cid,record);return record;
}

function diagnostics(countryId){
  const cid=countryId?canonicalCountry(countryId):null,sites=cid?masterSites().filter(s=>canonicalCountry(s?.countryId)===cid):masterSites();
  const byReason={}, extraction=sites.map(s=>{const rid=tok(s?.real?.resourceId||s?.sourceSiteRecord?.resourceId);const p=planExtraction({countryId:s.countryId,siteId:s.siteId,resourceId:rid,quantity:1});if(p.status!=='PLANNED')byReason[p.reason]=(byReason[p.reason]||0)+1;return p});
  const countries=[...new Set(masterSites().map(s=>canonicalCountry(s.countryId)).filter(Boolean))];
  let factoryCount=0,networkShipmentCount=0,projectCount=0;
  for(const c of countries){factoryCount+=factoryAssets(c).length;const n=netState(c);networkShipmentCount+=n.shipments.length;projectCount+=n.projects.length}
  const methods={};for(const x of extraction)if(x?.method)methods[x.method]=(methods[x.method]||0)+1;
  return{version:VERSION,siteCount:sites.length,commercialSiteCount:sites.filter(s=>s?.sourceSiteRecord?.commercialExtraction===true).length,
    extractionPlans:extraction.length,blockedExtractionReasons:byReason,methodCoverage:methods,factoryAssetCount:factoryCount,shipmentCount:networkShipmentCount,projectCount,
    catalogLoaded:!!cat(),daysPerTurn:daysPerTurn(),targetArchitecture:'SITE -> EXTRACTION -> WAREHOUSE -> ROUTE -> FACTORY -> PROCESS -> OUTPUT',countryIsolation:'ENFORCED_BY_COUNTRY_SCOPED_STATE_AND_CROSS_BORDER_CONTRACT'};
}

function api(){
  return Object.freeze({VERSION,loadCatalog,planExtraction,planShipment,dispatchShipment,advanceShipments,startFactoryProject,startInfrastructureProject,startPadmaCorridorProject,advanceProjects,startTechnologyProject,executeFactoryCycle,diagnostics,normalizeInfrastructure,candidateFactories,recipeFor,resourceMethod,buildRoute});
}
g.Omega=g.Omega||{};g.Omega.ResourceIndustrialNetwork=api();g.OmegaResourceIndustrialNetwork=g.Omega.ResourceIndustrialNetwork;

function boot(){
  loadCatalog().then(()=>{emit('OMEGA_RESOURCE_INDUSTRIAL_NETWORK_READY','GLOBAL',{version:VERSION,catalogResourceRules:Object.keys(rules()).length,factoryRules:Object.keys(processRules()).length})}).catch(()=>{});
  if(typeof g.addEventListener==='function'){
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',()=>{
      const countries=[...new Set(masterSites().map(s=>canonicalCountry(s.countryId)).filter(Boolean))];
      countries.forEach(c=>{try{advanceShipments(c);advanceProjects(c)}catch(_){}});
    });
    g.addEventListener('OMEGA_READY',()=>loadCatalog());
    g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>loadCatalog());
  }
}
boot();

})(typeof window!=='undefined'?window:globalThis);
