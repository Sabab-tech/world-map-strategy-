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
  // Runtime country buckets use ISO-3. Never resolve an incoming ISO-3 through a name/alias
  // index first: the resolver may return the ISO-2 display identity (e.g. KWT -> KW).
  if(/^[A-Z]{3}$/i.test(raw))return id(raw);
  try{
    const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
    const r=b?.resolveCountry?.(raw);
    const source=r?.raw?.raw||r?.raw?.datasets?.['countries.json']||r?.raw||{};
    const iso3=source?.iso3||source?.iso3Code||source?.countryCode||source?.countryId||
      r?.iso3||r?.iso3Code||r?.countryCode||r?.countryId;
    if(iso3&&/^[A-Z]{3}$/i.test(String(iso3).trim()))return id(iso3);
    if(r?.id)return id(r.id);
  }catch(_){}
  try{
    const normalized=g.ResourceMinistryEngine?.normalizeCountryCode?.(raw);
    if(normalized&&/^[A-Z]{3}$/i.test(String(normalized).trim()))return id(normalized);
  }catch(_){}
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

function quantitativeEngineAdapter(site, quantitative){
  const q=quantitative&&typeof quantitative==='object'?quantitative:{};
  const p=q.production||{},cap=q.capacity||{},grade=q.grade||{},purity=q.purity||{},rec=q.recovery||{};
  const observedStatus=v=>/^(OBSERVED|REPORTED(?:_|$)|OPERATOR_REPORTED)/i.test(String(v?.status||''));
  const perDay=u=>/(per[_\s-]?day|\/day|daily)/i.test(String(u||''));
  const finite=v=>Number.isFinite(Number(v))&&v!==null&&v!==undefined&&v!==''?Number(v):null;
  const dailyRate=observedStatus(p)&&perDay(p.unit)?finite(p.rate):null;
  const nominalRate=observedStatus(cap)&&perDay(cap.unit)?finite(cap.nominal):null;
  const recovery=observedStatus(rec)?finite(rec.value):null;
  const productionModel={...(site?.productionModel||{})};
  if(dailyRate!==null){productionModel.productionRate=dailyRate;productionModel.unit=p.unit;productionModel.productionAuthority='OBSERVED';productionModel.productionPeriod=p.period||'PER_DAY';}
  if(nominalRate!==null){productionModel.nominalCapacity=nominalRate;productionModel.capacityUnit=cap.unit;productionModel.capacityAuthority='OBSERVED';}
  if(recovery!==null){productionModel.recovery=recovery;productionModel.recoveryAuthority='OBSERVED';}
  const out={...site,quantitative:clone(q),productionModel};
  if(grade.value!==null&&grade.value!==undefined)out.grade=grade.value;
  if(grade.unit)out.gradeUnit=grade.unit;
  if(purity.value!==null&&purity.value!==undefined)out.purity=purity.value;
  if(purity.unit)out.purityUnit=purity.unit;
  out.quantitativeProvenance=clone(q.quantitativeProvenance||{});
  return out;
}
function masterSites(){
  const x=g.OmegaResourceSiteMasterResearchData||g.Omega?.ResourceSiteMasterResearchData;
  const catalog=g.OmegaResourceSiteCanonicalCatalogData||g.Omega?.ResourceSiteCanonicalCatalogData;
  const canonicalRows=Array.isArray(catalog?.sites)?catalog.sites:[];
  const canonicalById=new Map(canonicalRows.map(row=>[String(row?.siteId||''),row]));
  // Preserve master research records, but attach the exact same canonical quantitative contract by site ID.
  const base=Array.isArray(x?.sites)?x.sites.map(site=>{
    const canonical=canonicalById.get(String(site?.siteId||''))||null;
    if(!canonical)return site;
    const normalized=g.OmegaResourceSiteDataContract?.normalizeSiteRecord?.(canonical)||canonical;
    return quantitativeEngineAdapter({...site,canonicalSiteRecord:clone(normalized),identity:clone(normalized.identity||site.identity||{}),
      quantitativeProvenance:clone(normalized.quantitative?.quantitativeProvenance||site.quantitativeProvenance||{}),
      map:clone(normalized.map||site.map||{}),location:clone(site.location||normalized.location||{}),
      sourceReference:clone(normalized.sourceReference||site.sourceReference||{})},normalized.quantitative||site.quantitative||{});
  }):[];
  const expansion=g.OmegaResourceSiteCountryExpansionData||g.Omega?.ResourceSiteCountryExpansionData;
  const extra=Array.isArray(expansion?.records)?expansion.records.map(row=>{
    const resourceId=String(row?.identity?.resourceTypeId||'').trim();
    const method=String(row?.operation?.extractionMethod||'').trim();
    const siteType=String(row?.identity?.siteType||'RESOURCE_SITE').trim();
    const countryId=canonicalCountry(row?.countryId||row?.identity?.countryIso3);
    if(!row?.siteId||!countryId||!resourceId)return null;
    return {
      siteId:String(row.siteId),countryId,siteName:String(row.siteName||row.siteId),siteType,
      real:{resourceId,extractionMethod:method,operationStatus:row?.operation?.status||'ACTIVE_SITE_REFERENCE',
        owner:row?.ownership?.owner||null,operator:row?.ownership?.operator||null,location:clone(row?.location||{}),
        quantitative:clone(row?.quantitative||{}),quantitativeProvenance:clone(row?.quantitative?.quantitativeProvenance||{}),
        coordinateStatus:row?.location?.coordinateStatus||row?.location?.coordinates?.coordinateStatus||'APPROXIMATE'},
      sourceSiteRecord:{id:String(row.siteId),siteId:String(row.siteId),resourceId,siteType,extractionMethod:method,
        status:row?.operation?.status||'ACTIVE_SITE_REFERENCE',commercialExtraction:row?.operation?.commercialExtraction!==false,
        countryCode:countryId,lat:row?.location?.coordinates?.lat,lng:row?.location?.coordinates?.lng,
        quantitative:clone(row?.quantitative||{}),quantitativeProvenance:clone(row?.quantitative?.quantitativeProvenance||{}),
        dataAuthority:'SITE_EXPANSION_REFERENCE',quantitativeAuthority:'SIMULATION_RUNTIME'},
      location:clone(row?.location||{}),ownership:clone(row?.ownership||{}),operation:clone(row?.operation||{}),
      quantitativeProvenance:clone(row?.quantitative?.quantitativeProvenance||{}),
      processing:clone(row?.processing||{}),sourceReference:clone(row?.sourceReference||{}),
      simulation:{simulationOnly:true,capacityModel:'SYNTHETIC_GAMEPLAY_CAPACITY_V1',
        reserveStatus:'SIMULATION_REQUIRED',transportRoute:[{
          routeId:'SIM_ROUTE:'+countryId+':'+String(row.siteId),
          mode:'truck',transportMode:'truck',sourceNode:'MINE:'+String(row.siteId),
          destinationNode:'WH-'+countryId+'-RAW',distanceKm:null,distanceStatus:'UNOBSERVED',authority:'SIMULATED',
          countryIsolationKey:countryId
        }]}
    };
  }).filter(Boolean).map(site=>quantitativeEngineAdapter(site,site.quantitative)):[];
  const byId=new Map(base.map(site=>[String(site?.siteId||''),site]));
  // Append eligible sites from the in-memory canonical catalog so map-visible legacy
  // sites are also discoverable by the industrial runtime. Keep existing records first.
  const canonicalExtras=canonicalRows.filter(row=>{
    const siteId=String(row?.siteId||''),countryId=canonicalCountry(row?.countryId||row?.identity?.countryIso3);
    const resourceId=String(row?.identity?.resourceTypeId||row?.resourceId||'').trim();
    return siteId&&countryId&&resourceId&&!byId.has(siteId)&&row?.map?.markerEligible!==false&&!row?.runtime?.aliasOfSiteId;
  }).map(row=>{
    const siteId=String(row.siteId),countryId=canonicalCountry(row.countryId||row.identity?.countryIso3);
    const resourceId=String(row.identity?.resourceTypeId||row.resourceId||'').trim();
    const sourceSiteRecord={...clone(row),siteId,id:siteId,resourceId,siteType:row.identity?.siteType||row.siteType||'RESOURCE_SITE',
      status:row.operation?.status||'ACTIVE_SITE_REFERENCE',commercialExtraction:row.operation?.commercialExtraction!==false,
      countryCode:countryId,lat:row.location?.coordinates?.lat,lng:row.location?.coordinates?.lng,
      quantitative:clone(row.quantitative||{}),quantitativeProvenance:clone(row.quantitative?.quantitativeProvenance||{}),
      extractionMethod:row.operation?.extractionMethod||null};
    const routeRows=(row.simulation?.transportRoute||[]).map(route=>{
      const type=tok(route?.mode||route?.routeType||'');
      const mode=type.includes('pipeline')?'pipeline':type.includes('sea')?'ship':type.includes('rail')?'rail':(rules()[resourceId]?.preferredModes?.[0]||'truck');
      return {...clone(route),mode,transportMode:mode,authority:'SITE_SIMULATION_ROUTE',countryIsolationKey:countryId};
    });
    const q=row.quantitative||{},production=q.production||{},capacity=q.capacity||{},grade=q.grade||{},purity=q.purity||{},recovery=q.recovery||{};
    const gas=tok(resourceId)==='natural_gas',divisor=gas?1000:1;
    const productionModel={productionRate:num(production.rate)===null?null:num(production.rate)/divisor,
      activeRate:num(production.rate)===null?null:num(production.rate)/divisor,
      nominalCapacity:num(capacity.nominal)===null?null:num(capacity.nominal)/divisor,
      minimumCapacity:num(capacity.minimum)===null?null:num(capacity.minimum)/divisor,
      maximumCapacity:num(capacity.maximum)===null?null:num(capacity.maximum)/divisor,
      annualProduction:production.annual==null?null:{value:production.annual,unit:production.annualUnit||null},
      utilization:num(row.simulation?.utilization),recovery:num(recovery.value)===null?null:num(recovery.value)/100,
      maintenance:0.03,decline:0.01,authority:'SIMULATED',stateAuthority:'SIMULATED',dataStatus:'SIMULATED',productionAuthority:'SIMULATED'};
    const site={siteId,countryId,siteName:String(row.siteName||siteId),siteType:row.identity?.siteType||row.siteType||'RESOURCE_SITE',
      real:{resourceId,extractionMethod:row.operation?.extractionMethod||null,operationStatus:row.operation?.status||'ACTIVE_SITE_REFERENCE',
        owner:row.ownership?.owner||null,operator:row.ownership?.operator||null,location:clone(row.location||{}),
        quantitative:clone(q),quantitativeProvenance:clone(q.quantitativeProvenance||{})},
      sourceSiteRecord,identity:clone(row.identity||{}),location:clone(row.location||{}),coordinates:clone(row.location?.coordinates||{}),
      ownership:clone(row.ownership||{}),operation:clone(row.operation||{}),quantitative:clone(q),
      quantitativeProvenance:clone(q.quantitativeProvenance||{}),
      quantitativeProfile:{grade:clone(grade),purity:clone(purity),production:{...clone(production),nominalCapacity:capacity.nominal,minimumCapacity:capacity.minimum,maximumCapacity:capacity.maximum}},
      productionModel,simulation:{...clone(row.simulation||{}),transportRoute:routeRows},processing:clone(row.processing||{}),
      logistics:clone(row.logistics||{}),map:clone(row.map||{}),runtime:clone(row.runtime||{}),sourceReference:clone(row.sourceReference||{}),
      simulationReserveQuantity:q.reserve?.quantity??row.reserve?.quantity??null,
      simulationReserveUnit:q.reserve?.unit||row.reserve?.unit||null,productionRate:productionModel.productionRate,
      dailyRate:productionModel.productionRate,grade:grade.value??null,gradeUnit:grade.unit||null,
      purity:purity.value??null,purityUnit:purity.unit||null,recoveryRate:productionModel.recovery,capacity:clone(productionModel)};
    return quantitativeEngineAdapter(site,q);
  });
  for(const site of canonicalExtras)if(!byId.has(site.siteId))byId.set(site.siteId,site);
  for(const site of extra)if(!byId.has(site.siteId))byId.set(site.siteId,site);
  return [...byId.values()];
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
  if(explicit){
    const explicitKey=Object.keys(methodRules()).find(key=>tok(key)===tok(explicit));
    if(explicitKey)return{method:explicitKey,source:'OBSERVED_OR_MASTER'};
  }
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
  const sr=scenarioFor(site,resourceId),model=g.Omega?.ResourceRealism?.siteModel?.({
    ...clone(site),siteId:site.siteId,siteReferenceKey:site.siteId,siteName:site.siteName,siteType:site.siteType,resourceId,
    simulationReserveQuantity:sr?.reserve?.quantity??input.reserveQuantity??site.simulationReserveQuantity??site.quantitative?.reserve?.quantity,
    simulationReserveUnit:sr?.reserve?.unit??input.reserveUnit??site.simulationReserveUnit??site.quantitative?.reserve?.unit
  },null,cid);
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
  const economy=econState(c);
  // A factory bootstrap must mutate the persisted country economy, not a detached fallback array.
  if(!Array.isArray(economy.productionAssets))economy.productionAssets=[];
  return economy.productionAssets;
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
  const routeSourceSiteId=input.sourceSiteId||site?.siteId||null;
  const routeSourceNode=input.sourceNode||nodeToken(input.sourceNodeType||'MINE',cid,site?.siteId);
  const route={status:dispatchQuantity>0?'PLANNED':'BLOCKED',routeId:'IR:'+h32(JSON.stringify({cid,site:routeSourceSiteId,sourceNode:routeSourceNode,factory:asset?.id||asset?.assetId||asset?.projectId,resourceId,mode})).toString(16),
    countryId:cid,sourceSiteId:routeSourceSiteId,sourceWarehouseId:input.sourceWarehouseId||null,sourceNode:routeSourceNode,destinationFactoryId:String(asset?.id||asset?.assetId||asset?.projectId||''),destinationNode:nodeToken('FACTORY',cid,asset?.id||asset?.assetId||asset?.projectId),
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
  const warehouseId='WH-'+cid+'-RAW';
  const siteRoute=(site.simulation?.transportRoute||[])[0]||{};
  const routeType=tok(siteRoute.mode||siteRoute.routeType||'');
  const preferredMode=tok(input.transportMode||rules()[rid]?.preferredModes?.[0]||'truck');
  const routeMode=routeType.includes('pipeline')?'pipeline':routeType.includes('sea')?'ship':routeType.includes('rail')?'rail':preferredMode;
  const routeDistance=Math.max(0,num(siteRoute.distanceKm??siteRoute.distance??siteRoute.km)||0);
  const routeOrigin={siteId:warehouseId,countryId:cid,siteName:cid+' sovereign raw warehouse',siteType:'RAW_MATERIAL_WAREHOUSE',
    simulation:{transportRoute:routeDistance>0?[{...clone(siteRoute),mode:routeMode,transportMode:routeMode,distanceKm:routeDistance,authority:'SITE_SIMULATION_ROUTE',countryIsolationKey:cid}]:[]}};
  for(const c of ordered.slice(0,16)){
    const route=buildRoute(routeOrigin,c.asset,rid,input.quantity,{countryId:cid,sourceSiteId:site.siteId,sourceWarehouseId:warehouseId,sourceNode:'WAREHOUSE:'+cid+':RAW',sourceNodeType:'WAREHOUSE',transportMode:input.transportMode,unit:input.unit});
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
    const rid=tok(s.resourceId),quantity=Math.max(0,num(s.quantity)||0),r=resourceState(cid);
    const warehouse=r.warehouse||{},available=Math.max(0,num(warehouse.availableByResource?.[rid])||0);
    const reserved=Math.max(0,num(warehouse.reservedByResource?.[rid])||0);
    if(quantity<=0||available<quantity||reserved<quantity){
      s.status='BLOCKED_LEDGER_MISMATCH';s.blockReason='WAREHOUSE_AVAILABLE_OR_RESERVATION_MISMATCH';s.blockedTurn=turn();
      emit('OMEGA_RESOURCE_DELIVERY_BLOCKED',cid,{shipmentId:s.shipmentId,siteId:s.siteId,resourceId:rid,quantity,available,reserved,reason:s.blockReason});
      continue;
    }
    const factory=factoryAssets(cid).find(a=>String(a?.id||a?.assetId||a?.projectId)===String(s.factoryId));
    if(!factory){s.status='BLOCKED_FACTORY_MISSING';s.blockReason='FACTORY_NOT_FOUND_AT_DELIVERY';s.blockedTurn=turn();continue;}
    warehouse.availableByResource=warehouse.availableByResource||{};
    warehouse.reservedByResource=warehouse.reservedByResource||{};
    warehouse.availableByResource[rid]=Math.max(0,available-quantity);
    warehouse.reservedByResource[rid]=Math.max(0,reserved-quantity);
    r.warehouse=warehouse;
    r.inventory=r.inventory||{};
    const countryRawStock=Math.max(0,num(r.inventory[rid])||0);
    if(countryRawStock<quantity){
      s.status='BLOCKED_LEDGER_MISMATCH';s.blockReason='COUNTRY_INVENTORY_BELOW_SHIPMENT_QUANTITY';s.blockedTurn=turn();
      warehouse.availableByResource[rid]=available;
      warehouse.reservedByResource[rid]=reserved;
      continue;
    }
    r.inventory[rid]=countryRawStock-quantity;
    factory.inputInventory=factory.inputInventory&&typeof factory.inputInventory==='object'?factory.inputInventory:{};
    factory.inputInventory[rid]=(num(factory.inputInventory[rid])||0)+quantity;
    s.status='DELIVERED';s.deliveredTurn=turn();s.destinationStatus='FACTORY_RECEIVED';
    const processQuantity=Math.min(quantity,Math.max(1,num(factory.capacity)||quantity));
    const processing=executeFactoryCycle({countryId:cid,factoryId:s.factoryId,resourceId:rid,quantity:processQuantity});
    s.processingStatus=processing?.status==='COMPLETED'?'PROCESSED':'AWAITING_PROCESSING';
    s.processingTransactionId=processing?.transactionId||null;
    s.processing=clone(processing);
    n.deliveries.push(clone(s));delivered.push(clone(s));
    const res=n.reservations?.[s.reservationId];if(res)res.status='DELIVERED';
    emit('OMEGA_RESOURCE_DELIVERY_COMPLETED',cid,{shipmentId:s.shipmentId,siteId:s.siteId,factoryId:s.factoryId,resourceId:rid,quantity,unit:s.unit,travelTimeDays:s.route.travelTimeDays,transport:s.route.transportMode,status:'DELIVERED_TO_FACTORY',processingStatus:s.processingStatus,processingTransactionId:s.processingTransactionId});
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
  const donorCapabilityVerified=mode==='IMPORT'&&(contractor==='SPECIALIST_FOREIGN_TECH_VENDOR'||donorCaps.some(x=>tok(x?.technologyId).toUpperCase()===technologyId));
  const contract={projectId:'TECH:'+cid+':'+technologyId+':T'+turn()+':'+h32(JSON.stringify(input)),countryId:cid,technologyId,mode,
    durationTurns:mode==='IMPORT'?spec.importTurns:spec.researchTurns,cost:mode==='IMPORT'?spec.importCost:spec.researchCost,donorCountryId:donor||null,
    contractorType:contractor,status:'IN_PROGRESS',startTurn:turn(),targetSiteId:input.targetSiteId||'*',targetResourceId:tok(input.resourceId||'*'),
    targetSiteType:input.siteType||'*',effects:clone(spec.effects||{}),donorCapabilityVerified};
  netState(cid).technologyContracts.push(contract);emit('OMEGA_RESOURCE_TECHNOLOGY_PROJECT_STARTED',cid,contract);return contract;
}
function refreshTechnologyGatedFactories(c){
  const cid=canonicalCountry(c),caps=Array.isArray(resourceState(cid).technologyCapabilities)?resourceState(cid).technologyCapabilities:[],
    available=new Set(caps.map(x=>tok(x?.technologyId).toUpperCase()).filter(Boolean));
  for(const asset of factoryAssets(cid)){
    if(String(asset.status).toUpperCase()!=='TECHNOLOGY_LOCKED')continue;
    const req=Array.isArray(asset.requiredTechnologyIds)?asset.requiredTechnologyIds.map(x=>tok(x).toUpperCase()).filter(Boolean):[];
    if(req.length&&req.every(t=>available.has(t))){
      asset.status='OPERATIONAL';asset.technologyUnlockedTurn=turn();
      emit('OMEGA_FACTORY_TECHNOLOGY_UNLOCKED',cid,{factoryId:asset.id,requiredTechnologyIds:clone(req)});
    }
  }
}
function advanceTechnologyProjects(c){
  const cid=canonicalCountry(c),n=netState(cid),r=resourceState(cid),completed=[];
  r.technologyCapabilities=Array.isArray(r.technologyCapabilities)?r.technologyCapabilities:[];
  for(const p of n.technologyContracts){
    if(String(p.status).toUpperCase()!=='IN_PROGRESS')continue;
    const elapsed=turn()-Number(p.startTurn||turn());
    if(elapsed<Number(p.durationTurns||1))continue;
    if(p.mode==='IMPORT'&&!p.donorCapabilityVerified){p.status='BLOCKED';p.blockReason='DONOR_CAPABILITY_NOT_VERIFIED';continue;}
    const capability={technologyId:p.technologyId,targetSiteId:p.targetSiteId,targetResourceId:p.targetResourceId,targetSiteType:p.targetSiteType,
      sourceType:p.mode==='IMPORT'?'IMPORTED':'RESEARCH',donorCountryId:p.donorCountryId||null,effects:clone(p.effects),status:'COMPLETE',completedTurn:turn()};
    if(!r.technologyCapabilities.some(x=>tok(x?.technologyId).toUpperCase()===tok(p.technologyId)&&String(x?.targetResourceId||'*')===String(p.targetResourceId||'*'))){
      r.technologyCapabilities.push(capability);
    }
    p.status='COMPLETE';p.completedTurn=turn();completed.push(clone(capability));
    refreshTechnologyGatedFactories(cid);
    emit('OMEGA_RESOURCE_TECHNOLOGY_COMPLETED',cid,capability);
  }
  return completed;
}
function executeFactoryCycle(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||''),assets=factoryAssets(cid),asset=assets.find(a=>String(a?.id||a?.assetId||a?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const rid=tok(input.resourceId),recipe=recipeFor(rid,asset),requested=Math.min(Math.max(0,num(input.quantity)||num(asset.capacity)||0),Math.max(0,num(asset.capacity)||Number.MAX_SAFE_INTEGER));
  const r=resourceState(cid);r.inventory=r.inventory||{};
  const factoryStock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const factoryAvailable=Math.max(0,num(factoryStock[rid])||0),countryAvailable=Math.max(0,num(r.inventory[rid])||0);
  const need=requested*(num(recipe.inputs[rid])||1);
  const fromFactoryInput=factoryAvailable>=need;
  const available=fromFactoryInput?factoryAvailable:countryAvailable;
  if(available<need)return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',required:need,available,source:fromFactoryInput?'FACTORY_INPUT_INVENTORY':'COUNTRY_INVENTORY'};
  const output={};for(const k of Object.keys(recipe.outputs))output[k]=requested*(num(recipe.outputs[k])||0);
  if(fromFactoryInput)factoryStock[rid]=factoryAvailable-need;else r.inventory[rid]=countryAvailable-need;
  asset.inputInventory=factoryStock;
  for(const k of Object.keys(output))r.inventory[k]=(num(r.inventory[k])||0)+output[k];
  const record={transactionId:'FACTORYRUN:'+cid+':'+fid+':T'+turn(),countryId:cid,factoryId:fid,resourceId:rid,inputQuantity:need,requestedProduction:requested,outputs:output,recipe:clone(recipe),cycleDays:recipe.cycleDays,turn:turn(),authority:'INDUSTRIAL_NETWORK_SIMULATION',status:'COMPLETED',inputSource:fromFactoryInput?'DELIVERED_SHIPMENT':'LEGACY_COUNTRY_INVENTORY'};
  const n=netState(cid);n.factoryRuntime[fid]=record;n.events.push(record);n.events=n.events.slice(-MAX_EVENTS);
  emit('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',cid,record);return record;
}

function ensureSimulationFactory(cid,site,resourceId,quantity){
  const existing=candidateFactories(cid,resourceId);
  if(existing.length)return{status:'EXISTING',factory:existing[0].asset};
  const recipe=processRules()[tok(resourceId)];
  if(!recipe||!Object.keys(recipe.inputs||{}).length||!Object.keys(recipe.outputs||{}).length)return{status:'BLOCKED',reason:'NO_FACTORY_RECIPE'};
  const economy=econState(cid);if(!Array.isArray(economy.productionAssets))economy.productionAssets=[];
  const assets=economy.productionAssets,factoryId='FAC-SIM:'+cid+':'+String(site.siteId).replace(/[^A-Za-z0-9_-]/g,'_');
  let factory=assets.find(a=>String(a?.id||a?.assetId||a?.projectId)===factoryId);
  if(!factory){
    factory={id:factoryId,countryId:cid,siteId:null,sourceSiteId:site.siteId,stage:'PROCESSING',factoryType:recipe.factoryType||'RESOURCE_PROCESSING_PLANT',
      status:'OPERATIONAL',capacity:Math.max(1,num(quantity)||1),inputCoefficients:clone(recipe.inputs),outputProfile:clone(recipe.outputs),
      inputInventory:{},transportAccess:['truck','rail','ship','pipeline'],locationNodeKey:'FACTORY:'+cid+':'+site.siteId,
      simulationOnly:true,authority:'SIMULATED_GAMEPLAY_BOOTSTRAP',bootstrapReason:'NO_EXISTING_COMPATIBLE_FACTORY'};
    assets.push(factory);
  }
  return{status:'CREATED_SIMULATION_ONLY',factory};
}
async function executeSitePipeline(input={}){
  const cid=canonicalCountry(input.countryId);
  if(!cid)return{status:'BLOCKED',reason:'SITE_COUNTRY_MISSING'};
  const endowment=g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime;
  if(!endowment?.initialize||!endowment?.hydrateCountry||!endowment?.extractCountry)return{status:'BLOCKED',reason:'RESOURCE_ENDOWMENT_RUNTIME_UNAVAILABLE'};
  const initialized=await endowment.initialize();
  if(initialized?.status!=='READY')return{status:'BLOCKED',reason:'RESOURCE_ENDOWMENT_NOT_READY',detail:initialized};
  const site=siteById(input.siteId);
  if(!site?.siteId)return{status:'BLOCKED',reason:'SITE_NOT_FOUND'};
  if(canonicalCountry(site.countryId)!==cid)return{status:'BLOCKED',reason:'SITE_COUNTRY_MISMATCH',siteCountryId:site.countryId,requestedCountryId:cid};
  const rid=tok(input.resourceId||site?.real?.resourceId||site?.sourceSiteRecord?.resourceId||site?.identity?.resourceTypeId);
  if(!rid)return{status:'BLOCKED',reason:'RESOURCE_ID_MISSING'};
  const loaded=await loadCatalog();if(loaded?.status==='FAILED')return{status:'BLOCKED',reason:'INDUSTRIAL_CATALOG_UNAVAILABLE',detail:loaded};
  const hydrated=await endowment.hydrateCountry(cid);
  if(hydrated?.status!=='APPLIED'||hydrated?.result?.accepted===false)return{status:'BLOCKED',reason:'COUNTRY_HYDRATION_NOT_COMMITTED',detail:hydrated};
  const extractionPlan=planExtraction({countryId:cid,siteId:site.siteId,resourceId:rid,quantity:input.quantity,remainingReserve:input.remainingReserve});
  if(extractionPlan?.status!=='PLANNED')return{status:'BLOCKED',reason:'INDUSTRIAL_EXTRACTION_PLAN_BLOCKED',siteId:site.siteId,detail:extractionPlan};
  const countryState=state()?.resource?.[cid]||{},controllers=countryState.mineSiteControllers||{};
  const siteKey=String(site.siteId),controller=controllers[siteKey]||Object.values(controllers).find(x=>String(x?.siteReferenceKey||'')===siteKey);
  const linkedKeys=Array.isArray(controller?.linkedOccurrenceKeys)?controller.linkedOccurrenceKeys.map(String).filter(Boolean):[];
  const mineStates=countryState.mineStates&&typeof countryState.mineStates==='object'?countryState.mineStates:{};
  const siteReference=(Array.isArray(countryState.mineSiteReferences)?countryState.mineSiteReferences:[]).find(x=>String(x?.siteReferenceKey||x?.siteId||'')===siteKey);
  const matchingKeys=linkedKeys.filter(key=>tok(mineStates[key]?.resourceId||mineStates[key]?.resourceTypeId)===rid);
  const stateBoundKeys=Object.entries(mineStates).filter(([key,row])=>{
    const rowSite=String(row?.siteReferenceKey||row?.siteId||row?.sourceSiteId||'');
    return rowSite===siteKey&&tok(row?.resourceId||row?.resourceTypeId)===rid&&key;
  }).map(([key])=>String(key));
  // Some legacy occurrence keys predate per-key resourceId persistence or controller materialization.
  // Reuse a mine-state key only when its own site identity and commodity both match exactly.
  const referenceResource=tok(siteReference?.resourceId||siteReference?.resourceTypeId||siteReference?.rawSiteReference?.resourceId||siteReference?.rawSiteReference?.resourceTypeId);
  const dedicatedGameplaySite=site?.runtime?.identityAuthority==='LEGACY_SITE_GAMEPLAY_EXPANSION_WITH_SOURCE_LINEAGE'&&site?.map?.markerEligible!==false&&!site?.runtime?.aliasOfSiteId;
  const dedicatedSiteKeys=dedicatedGameplaySite?linkedKeys.filter(key=>String(key).startsWith('SITE_OCC:'+cid+':')&&tok(mineStates[key]?.resourceId||mineStates[key]?.resourceTypeId)===rid):[];
  const keys=dedicatedSiteKeys.length?dedicatedSiteKeys:(matchingKeys.length?matchingKeys:(stateBoundKeys.length?stateBoundKeys:(referenceResource===rid?linkedKeys:[])));
  if(!keys.length)return{status:'BLOCKED',reason:linkedKeys.length?'SITE_RESOURCE_OCCURRENCE_NOT_FOUND':'SITE_HAS_NO_EXECUTABLE_OCCURRENCE',siteId:site.siteId,countryId:cid,resourceId:rid,controllerStatus:controller?.controllerStatus||null,linkedOccurrenceCount:linkedKeys.length,siteStateOccurrenceCount:stateBoundKeys.length,referenceResource:referenceResource||null};
  const already=netState(cid).siteExecutions||[];
  const duplicate=already.find(x=>x.siteId===site.siteId&&Number(x.turn)===turn()&&x.status!=='FAILED');
  if(duplicate)return{status:'BLOCKED',reason:'SITE_ALREADY_EXECUTED_THIS_TURN',existingExecutionId:duplicate.executionId,siteId:site.siteId};
  const extraction=await endowment.extractCountry(cid,keys);
  const records=extraction?.result?.records||extraction?.records||[];
  const record=records.find(x=>keys.includes(String(x?.occurrenceKey||''))&&canonicalCountry(x?.countryId||cid)===cid&&x?.producedBatch);
  if(extraction?.status!=='APPLIED'||extraction?.result?.accepted===false||!record){
    return{status:'BLOCKED',reason:'SITE_EXTRACTION_NOT_COMMITTED',siteId:site.siteId,occurrenceKeys:keys,extractionStatus:extraction?.status||null,detail:extraction?.result?.blocked||extraction?.result?.reason||null};
  }
  const batch=record.producedBatch,quantity=Math.max(0,num(record.approvedQuantity)||num(batch.quantity)||num(record.quantity)||0);
  if(quantity<=0)return{status:'BLOCKED',reason:'EXTRACTION_BATCH_QUANTITY_INVALID',siteId:site.siteId,occurrenceKey:record.occurrenceKey};
  let factoryChoice=candidateFactories(cid,rid)[0]?.asset||null;
  let factoryBootstrap=null;
  if(!factoryChoice&&input.autoCommissionFactory!==false){
    factoryBootstrap=ensureSimulationFactory(cid,site,rid,quantity);
    factoryChoice=factoryBootstrap.factory||null;
  }
  if(!factoryChoice)return{status:'EXTRACTED_AWAITING_FACTORY',siteId:site.siteId,countryId:cid,resourceId:rid,quantity,unit:batch.unit||'TONNES',occurrenceKey:record.occurrenceKey,batchId:batch.batchId,warehouseId:batch.warehouseId||('WH-'+cid+'-RAW'),reason:'NO_MATCHING_FACTORY'};
  const sent=dispatchShipment({countryId:cid,siteId:site.siteId,resourceId:rid,quantity,unit:batch.unit||'TONNES',transportMode:input.transportMode,factoryId:String(factoryChoice.id||factoryChoice.assetId||factoryChoice.projectId)});
  const execution={executionId:'SITE-PIPELINE:'+cid+':'+site.siteId+':T'+turn(),siteId:site.siteId,countryId:cid,resourceId:rid,occurrenceKey:record.occurrenceKey,batchId:batch.batchId,
    quantity,unit:batch.unit||'TONNES',turn:turn(),factoryId:String(factoryChoice.id||factoryChoice.assetId||factoryChoice.projectId),factoryBootstrapStatus:factoryBootstrap?.status||'EXISTING',
    extractionStatus:'COMMITTED',extractionPlanId:extractionPlan.planId,shipmentStatus:sent.status,shipmentId:sent.shipment?.shipmentId||null,route:clone(sent.shipment?.route||sent.plan?.route||null),status:sent.status==='DISPATCHED'?'IN_TRANSIT':sent.status};
  const ledger=netState(cid);ledger.siteExecutions=Array.isArray(ledger.siteExecutions)?ledger.siteExecutions:[];ledger.siteExecutions.push(clone(execution));ledger.siteExecutions=ledger.siteExecutions.slice(-MAX_EVENTS);
  if(sent.status!=='DISPATCHED')return{...execution,status:'EXTRACTED_AWAITING_ROUTE',reason:sent.reason||'SHIPMENT_DISPATCH_BLOCKED',shipment:sent};
  emit('OMEGA_RESOURCE_SITE_PIPELINE_STARTED',cid,execution);
  return{...execution,status:'IN_TRANSIT',shipment:sent.shipment,factoryBootstrap:factoryBootstrap?{status:factoryBootstrap.status,factoryId:factoryChoice.id}:null};
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
  return Object.freeze({VERSION,loadCatalog,planExtraction,planShipment,dispatchShipment,advanceShipments,startFactoryProject,startInfrastructureProject,startPadmaCorridorProject,advanceProjects,startTechnologyProject,executeFactoryCycle,executeSitePipeline,diagnostics,normalizeInfrastructure,candidateFactories,recipeFor,resourceMethod,buildRoute});
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
