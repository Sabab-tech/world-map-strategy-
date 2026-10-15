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
    schemaVersion:VERSION,shipments:[],projects:[],extractions:[],reservations:{},deliveries:[],siteFlowLedger:[],
    infrastructure:{nodes:{},edges:{},corridors:{}},events:[],factoryRuntime:{},technologyContracts:[]
  };
  if(!Array.isArray(r.industrialNetwork.siteFlowLedger))r.industrialNetwork.siteFlowLedger=[];
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
function runtimeCountryIds(){
  const ids=new Set(masterSites().map(site=>canonicalCountry(site.countryId)).filter(Boolean));
  const s=state()||{};
  for(const domain of ['resource','economy','finance','trade','transport']){
    const rows=s[domain]&&typeof s[domain]==='object'?s[domain]:{};
    for(const key of Object.keys(rows)){
      const cid=canonicalCountry(key);
      if(/^[A-Z]{3}$/.test(cid))ids.add(cid);
    }
  }
  return [...ids];
}
function siteById(siteId){
  const s=String(siteId||'').trim();
  return masterSites().find(x=>String(x?.siteId||'')===s)||null;
}

function normalizedEventPayload(evt){
  const d=evt&&evt.detail?evt.detail:{};
  let p=d.payload||(d.data&&d.data.payload)||d;
  if(p&&p.payload&&p.source)p=p.payload;
  return{...p,countryId:p?.countryId||d.countryId||null};
}
function siteFlowRows(c){const n=netState(c);n.siteFlowLedger=Array.isArray(n.siteFlowLedger)?n.siteFlowLedger:[];return n.siteFlowLedger;}
function saveSiteFlow(c,row){
  const n=netState(c),rows=siteFlowRows(c);
  const i=rows.findIndex(x=>{
    const sameBatch=Boolean(row.batchId)&&String(x.batchId||'')===String(row.batchId);
    const sameFlowId=Boolean(row.flowId)&&String(x.flowId||'')===String(row.flowId);
    return sameBatch||sameFlowId;
  });
  if(i>=0)rows[i]=row;else rows.push(row);
  n.siteFlowLedger=rows.slice(-8192);
  return row;
}
function updateSiteFlow(c,batchId,mutate){
  const rows=siteFlowRows(c),row=rows.find(x=>String(x.batchId||'')===String(batchId||''));
  if(!row)return null;
  mutate(row);row.lastUpdatedTurn=turn();saveSiteFlow(c,row);return row;
}
function flowForShipment(c,shipmentId,mutate){
  const row=siteFlowRows(c).find(x=>String(x.shipmentId||'')===String(shipmentId||''));
  if(!row)return null;
  mutate(row);row.lastUpdatedTurn=turn();saveSiteFlow(c,row);return row;
}
function resolveSiteForExtraction(cid,p,batch){
  const rs=resourceState(cid),occ=String(p.occurrenceKey||batch?.occurrenceKey||''),rid=tok(p.resourceId||batch?.resourceId||'');
  const byCountry=masterSites().filter(x=>canonicalCountry(x?.countryId)===cid);
  let siteId=String(p.siteReferenceKey||batch?.siteReferenceKey||rs.mineStates?.[occ]?.siteReferenceKey||'').trim();
  if(!siteId&&occ){
    for(const [key,ctrl] of Object.entries(rs.mineSiteControllers||{})){
      if((Array.isArray(ctrl?.linkedOccurrenceKeys)?ctrl.linkedOccurrenceKeys:[]).some(x=>String(x)===occ)){
        siteId=String(ctrl.siteReferenceKey||key);break;
      }
    }
  }
  let site=siteId?byCountry.find(x=>String(x.siteId)===siteId):null;
  if(!site&&siteId){
    const ref=(Array.isArray(rs.mineSiteReferences)?rs.mineSiteReferences:[]).find(x=>String(x.siteReferenceKey||x.siteId||'')===siteId);
    if(ref)site={siteId,countryId:cid,siteName:String(ref.siteName||ref.name||siteId),siteType:String(ref.siteType||ref.assetType||'RESOURCE_SITE'),
      real:{resourceId:rid,extractionMethod:ref.rawSiteReference?.extractionMethod||ref.extractionMethod||null},
      sourceSiteRecord:{siteId,resourceId:rid,countryCode:cid,commercialExtraction:ref.commercialExtraction!==false},
      identity:{resourceTypeId:rid,siteType:ref.siteType||ref.assetType||'RESOURCE_SITE'},
      operation:{commercialExtraction:ref.commercialExtraction!==false},simulation:{transportRoute:[]},
      runtime:{identityAuthority:'ENDOWMENT_OCCURRENCE_BINDING',quantityAuthority:'SIMULATION_RUNTIME'}};
  }
  if(!site&&siteId)site=siteById(siteId);
  if(site?.runtime?.aliasOfSiteId){
    const canonical=siteById(site.runtime.aliasOfSiteId);
    site=canonical||null;
  }
  if(!site){
    const ms=rs.mineStates?.[occ]||{},stable=siteId||('SITE_OCC_'+cid+'_'+String(occ||batch?.batchId||'UNKNOWN').replace(/[^A-Za-z0-9_-]/g,'_'));
    site={siteId:stable,countryId:cid,siteName:String(ms.depositName||ms.siteName||p.depositName||stable),
      siteType:String(ms.siteType||ms.assetType||'RESOURCE_SITE'),real:{resourceId:rid,extractionMethod:ms.extractionMethod||null},
      sourceSiteRecord:{siteId:stable,resourceId:rid,countryCode:cid,commercialExtraction:true,status:'ACTIVE_SITE_REFERENCE'},
      identity:{resourceTypeId:rid,siteType:ms.siteType||ms.assetType||'RESOURCE_SITE'},
      operation:{commercialExtraction:true,status:'ACTIVE_SITE_REFERENCE'},simulation:{transportRoute:[]},
      runtime:{identityAuthority:'ENDOWMENT_OCCURRENCE_FALLBACK',quantityAuthority:'SIMULATION_RUNTIME'}};
  }else if(tok(site.real?.resourceId||site.sourceSiteRecord?.resourceId||site.identity?.resourceTypeId)!==rid){
    site={...clone(site),real:{...clone(site.real||{}),resourceId:rid},
      sourceSiteRecord:{...clone(site.sourceSiteRecord||{}),resourceId:rid},
      identity:{...clone(site.identity||{}),resourceTypeId:rid}};
  }
  return site;
}
function addFlowStage(row,name,status,detail={}){
  row.stages=row.stages||[];
  const previous=row.stages.find(x=>x.stage===name&&x.status===status&&x.turn===turn());
  if(!previous)row.stages.push({stage:name,status,turn:turn(),...clone(detail)});
  row.status=status;row.lastUpdatedTurn=turn();
}
function onExtractionBlocked(evt){
  const p=normalizedEventPayload(evt),cid=canonicalCountry(p.countryId);
  const occ=String(p.occurrenceKey||p.occurrenceId||'').trim();
  if(!cid||!occ)return;
  const rs=resourceState(cid),mine=rs.mineStates?.[occ]||{};
  const rid=tok(p.resourceId||mine.resourceId||mine.resourceTypeId||'');
  const siteRef=String(p.siteReferenceKey||mine.siteReferenceKey||'').trim();
  const site=resolveSiteForExtraction(cid,{...p,siteReferenceKey:siteRef,occurrenceKey:occ,resourceId:rid||null},
    {resourceId:rid||null,siteReferenceKey:siteRef,occurrenceKey:occ,batchId:null});
  const why=String(p.reason||p.blockReason||p.status||'EXTRACTION_NOT_APPROVED');
  const flowId='SITE-FLOW-BLOCKED:'+cid+':'+occ+':T'+turn();
  const existing=siteFlowRows(cid).find(x=>String(x.flowId||'')===flowId);
  if(existing)return;
  const row={flowId,siteId:String(site.siteId||siteRef||occ),siteName:String(site.siteName||mine.depositName||siteRef||occ),
    countryId:cid,resourceId:rid||null,occurrenceKey:occ,batchId:null,quantity:0,unit:p.unit||mine.unit||null,
    siteIdentityAuthority:site.runtime?.identityAuthority||'ENDOWMENT_OCCURRENCE_FALLBACK',
    sourceAuthority:p.sourceAuthority||mine.sourceAuthority||'UNOBSERVED',
    extractionTurn:turn(),lastUpdatedTurn:turn(),warehouseId:mine.warehouseId||('WH-'+cid+'-RAW'),
    siteSnapshot:clone(site),factoryId:null,shipmentId:null,shipmentIds:[],processingTransactionId:null,
    createdBatchIds:[],outputQuantities:{},stages:[],treasurySettlements:[],status:'BLOCKED_EXTRACTION',blockReason:why,
    operationalStatus:p.operationalStatus||site.operation?.status||null,sourceStatus:p.sourceStatus||site.sourceSiteRecord?.status||null};
  addFlowStage(row,'EXTRACTION','BLOCKED',{reason:why,operationalStatus:row.operationalStatus,sourceStatus:row.sourceStatus,
    remainingReserve:num(p.residualQuantity??p.remainingReserve)});
  addFlowStage(row,'RAW_INVENTORY','NOT_CREATED',{reason:'NO_COMMITTED_EXTRACTION_BATCH'});
  addFlowStage(row,'TRANSPORT','NOT_DISPATCHED',{reason:'EXTRACTION_NOT_COMMITTED'});
  row.status='BLOCKED_EXTRACTION';row.blockReason=why;row.lastUpdatedTurn=turn();
  saveSiteFlow(cid,row);
  emit('OMEGA_RESOURCE_SITE_FLOW_BLOCKED',cid,{flowId,siteId:row.siteId,occurrenceKey:occ,resourceId:rid,
    reason:why,status:row.status,quantity:0,shipmentId:null,factoryId:null,simulationTurn:turn()},'resource-industrial-network');
}
function onExtractionCommitted(evt){
  const p=normalizedEventPayload(evt),cid=canonicalCountry(p.countryId);
  const batch=p.batch||p.producedBatch||null,occ=String(p.occurrenceKey||batch?.occurrenceKey||'').trim();
  const rid=tok(p.resourceId||batch?.resourceId||batch?.materialIdentity||''),batchId=String(batch?.batchId||p.batchId||'').trim();
  if(!cid||!rid||!batchId)return;
  const existing=siteFlowRows(cid).find(x=>String(x.batchId||'')===batchId);
  if(existing)return;
  const rs=resourceState(cid),stored=Array.isArray(rs.batches)?rs.batches.find(x=>String(x?.batchId||'')===batchId):null;
  const site=resolveSiteForExtraction(cid,p,batch),quantity=Math.max(0,num(p.quantity)||num(batch?.quantity)||0);
  const row={flowId:'SITE-FLOW:'+cid+':'+batchId,siteId:String(site.siteId),siteName:site.siteName,countryId:cid,resourceId:rid,
    occurrenceKey:occ,batchId,quantity,unit:batch?.unit||'TONNES',siteIdentityAuthority:site.runtime?.identityAuthority||'CANONICAL_SITE_REGISTRY',
    sourceAuthority:p.sourceAuthority||batch?.provenance?.sourceAuthority||'UNOBSERVED',extractionTurn:turn(),lastUpdatedTurn:turn(),
    warehouseId:stored?.warehouseId||batch?.warehouseId||('WH-'+cid+'-RAW'),siteSnapshot:clone(site),factoryId:null,shipmentId:null,shipmentIds:[],processingTransactionId:null,
    createdBatchIds:[],outputQuantities:{},stages:[],treasurySettlements:[],status:'EXTRACTION_COMMITTED'};
  addFlowStage(row,'EXTRACTION','COMPLETED',{occurrenceKey:occ,sourceAuthority:row.sourceAuthority});
  if(!stored){
    addFlowStage(row,'RAW_INVENTORY','BLOCKED',{reason:'SOURCE_BATCH_NOT_FOUND_IN_COUNTRY_LEDGER'});
    row.blockReason='SOURCE_BATCH_NOT_FOUND_IN_COUNTRY_LEDGER';saveSiteFlow(cid,row);
    emit('OMEGA_RESOURCE_SITE_FLOW_BLOCKED',cid,{siteId:row.siteId,batchId,occurrenceKey:occ,resourceId:rid,reason:row.blockReason},'resource-industrial-network');
    return;
  }
  addFlowStage(row,'RAW_INVENTORY','AVAILABLE',{warehouseId:row.warehouseId,quantity:Math.max(0,num(stored.remainingQuantity!=null?stored.remainingQuantity:stored.quantity)||0)});
  if(quantity<=0||Math.max(0,num(stored.remainingQuantity!=null?stored.remainingQuantity:stored.quantity)||0)<=0){
    addFlowStage(row,'TRANSPORT','BLOCKED',{reason:'EXTRACTION_BATCH_QUANTITY_INVALID'});
    row.blockReason='EXTRACTION_BATCH_QUANTITY_INVALID';saveSiteFlow(cid,row);return;
  }
  if(site.operation?.commercialExtraction===false||site.sourceSiteRecord?.commercialExtraction===false){
    addFlowStage(row,'TRANSPORT','BLOCKED',{reason:'NON_COMMERCIAL_SITE'});
    row.blockReason='NON_COMMERCIAL_SITE';saveSiteFlow(cid,row);return;
  }
  let factoryChoice=candidateFactories(cid,rid)[0]?.asset||null,bootstrap=null;
  if(!factoryChoice){bootstrap=ensureSimulationFactory(cid,site,rid,Math.min(quantity,Math.max(1,num(stored.remainingQuantity)||quantity)));factoryChoice=bootstrap.factory||null;}
  if(!factoryChoice){
    addFlowStage(row,'FACTORY','BLOCKED',{reason:bootstrap?.reason||'NO_COMPATIBLE_FACTORY_RECIPE'});
    row.blockReason=bootstrap?.reason||'NO_COMPATIBLE_FACTORY_RECIPE';saveSiteFlow(cid,row);
    emit('OMEGA_RESOURCE_SITE_FLOW_BLOCKED',cid,{siteId:row.siteId,batchId,occurrenceKey:occ,resourceId:rid,reason:row.blockReason},'resource-industrial-network');
    return;
  }
  row.factoryId=String(factoryChoice.id||factoryChoice.assetId||factoryChoice.projectId||'');
  const requested=Math.min(quantity,Math.max(0,num(stored.remainingQuantity!=null?stored.remainingQuantity:stored.quantity)||0));
  const sent=dispatchShipment({countryId:cid,siteId:site.siteId,site,resourceId:rid,quantity:requested,unit:row.unit,
    transportMode:p.transportMode||site?.simulation?.transportRoute?.[0]?.mode||undefined,factoryId:row.factoryId,batchId,
    occurrenceKey:occ,warehouseId:row.warehouseId});
  if(sent.status==='DISPATCHED'){
    row.shipmentId=sent.shipment.shipmentId;row.quantity=sent.shipment.quantity;row.route=clone(sent.shipment.route);
    addFlowStage(row,'TRANSPORT','IN_TRANSIT',{shipmentId:row.shipmentId,factoryId:row.factoryId,dispatchQuantity:row.quantity,etaTurn:sent.shipment.etaTurn});
    addFlowStage(row,'FACTORY_INPUT','AWAITING_DELIVERY',{factoryId:row.factoryId});
  }else{
    addFlowStage(row,'TRANSPORT','BLOCKED',{reason:sent.reason||'SHIPMENT_DISPATCH_BLOCKED',detail:sent.details||null});
    row.blockReason=sent.reason||'SHIPMENT_DISPATCH_BLOCKED';
  }
  row.factoryBootstrapStatus=bootstrap?.status||'EXISTING';
  saveSiteFlow(cid,row);
  emit(sent.status==='DISPATCHED'?'OMEGA_RESOURCE_SITE_FLOW_DISPATCHED':'OMEGA_RESOURCE_SITE_FLOW_BLOCKED',cid,
    {flowId:row.flowId,siteId:row.siteId,batchId,occurrenceKey:occ,resourceId:rid,quantity:row.quantity,shipmentId:row.shipmentId,
      factoryId:row.factoryId,status:row.status,reason:row.blockReason||null},'resource-industrial-network');
}
function onFinishedGoodsRegistered(evt){
  const p=normalizedEventPayload(evt),cid=canonicalCountry(p.countryId);if(!cid)return;
  const created=new Set(Array.isArray(p.createdBatchIds)?p.createdBatchIds.map(String):[]);
  const sources=new Set([...(Array.isArray(p.sourceBatchIds)?p.sourceBatchIds:[]),...(Array.isArray(p.batchTransfers)?p.batchTransfers.map(x=>x.sourceBatchId||x.batchId):[])].filter(Boolean).map(String));
  const rows=siteFlowRows(cid);
  for(const row of rows){
    const hasOutput=(row.createdBatchIds||[]).some(x=>created.has(String(x)));
    const hasSource=sources.has(String(row.batchId));
    if(!hasOutput&&!hasSource)continue;
    row.processingTransactionId=p.transactionId||row.processingTransactionId;
    row.outputQuantities=clone(p.outputQuantities||p.outputs||row.outputQuantities||{});
    row.createdBatchIds=[...new Set([...(row.createdBatchIds||[]),...created])];
    addFlowStage(row,'FINISHED_GOODS','AVAILABLE',{transactionId:p.transactionId||null,createdBatchIds:[...created],outputQuantities:row.outputQuantities});
    saveSiteFlow(cid,row);
  }
}
function onEconomyMarketPublication(evt){
  const p=normalizedEventPayload(evt),cid=canonicalCountry(p.countryId);if(!cid)return;
  const created=new Set(Array.isArray(p.createdBatchIds)?p.createdBatchIds.map(String):[]);
  for(const row of siteFlowRows(cid)){
    if(!(row.createdBatchIds||[]).some(x=>created.has(String(x))))continue;
    row.marketPublication={status:p.marketPublishStatus||'UNKNOWN',turn:turn(),transactionId:p.transactionId||null,offerCount:num(p.offerCount)||0};
    addFlowStage(row,'MARKET',p.marketPublishStatus==='APPLIED'?'PUBLISHED':'PUBLICATION_ATTEMPTED',
      {transactionId:p.transactionId||null,offerCount:num(p.offerCount)||0,publicationStatus:p.marketPublishStatus||'UNKNOWN'});
    saveSiteFlow(cid,row);
  }
}
function onDomesticSaleSettled(evt){
  const p=normalizedEventPayload(evt);
  if(String(p.status||'').toUpperCase()!=='SETTLED'||String(p.paymentStatus||'').toUpperCase()!=='SETTLED')return;
  const sid=String(p.saleId||'').trim();if(!sid)return;
  onTreasurySettlement({detail:{countryId:p.countryId,payload:{...p,settlementId:sid,sellerCountryId:p.sellerCountryId||p.countryId,totalValue:p.totalValue,
    sourceBatchIds:p.sourceBatchIds||[],batchTransfers:p.batchTransfers||[]}}});
}
function onExtractionFiscalPosted(evt){
  const p=normalizedEventPayload(evt),cid=canonicalCountry(p.countryId),batchId=String(p.batchId||'').trim();
  if(!cid||!batchId)return;
  updateSiteFlow(cid,batchId,row=>{
    const receiptId=String(p.receiptId||'');
    if(receiptId&&!row.treasurySettlements.some(x=>String(x.receiptId||'')===receiptId)){
      row.treasurySettlements.push({receiptId,resourceId:p.resourceId||row.resourceId,quantity:num(p.quantity)||null,
        totalValue:num(p.marketValue)||null,fiscal:clone(p.fiscal||null),turn:turn(),status:'RECEIPT_POSTED',
        type:'EXTRACTION_ROYALTY_RESOURCE_TAX',priceAuthority:p.priceAuthority||'UNOBSERVED'});
    }
    addFlowStage(row,'TREASURY','EXTRACTION_TAX_POSTED',{receiptId,resourceId:p.resourceId||row.resourceId,
      marketValue:num(p.marketValue)||null,priceAuthority:p.priceAuthority||'UNOBSERVED',fiscal:clone(p.fiscal||null)});
  });
}
function onTreasurySettlement(evt){
  const p=normalizedEventPayload(evt),cid=canonicalCountry(p.sellerCountryId||p.targetCountryId||p.sourceCountryId||p.countryId);
  if(!cid)return;
  const inputTransfers=Array.isArray(p.batchTransfers)?p.batchTransfers:[],
    transferRows=inputTransfers.map(transfer=>{
      const roots=[...new Set([transfer?.sourceBatchId,...(transfer?.sourceBatchIds||[])].filter(Boolean).map(String))],
        quantity=num(transfer?.quantity);
      let value=num(transfer?.totalValue);
      const unitPrice=num(transfer?.unitPrice);
      if(value===null&&quantity!==null&&unitPrice!==null)value=quantity*unitPrice;
      return{roots,quantity,value,transfer};
    }).filter(item=>item.roots.length);
  const topLevelRoots=[...new Set((Array.isArray(p.sourceBatchIds)?p.sourceBatchIds:[]).filter(Boolean).map(String))];
  // Older settlement events may include only sourceBatchIds, not batchTransfers.
  if(!transferRows.length&&topLevelRoots.length)
    transferRows.push({roots:topLevelRoots,quantity:num(p.quantity),value:num(p.totalValue),transfer:null});
  const exactSourceIds=new Set(topLevelRoots);
  for(const item of transferRows)for(const id of item.roots)exactSourceIds.add(id);
  if(!exactSourceIds.size)return;
  const transactionHasSingleRoot=exactSourceIds.size===1,sid=String(p.settlementId||''),
    transactionValue=num(p.totalValue!=null?p.totalValue:(p.gross!=null?p.gross:p.sellerTotal));
  for(const row of siteFlowRows(cid)){
    const batchId=String(row.batchId),matches=transferRows.filter(item=>item.roots.includes(batchId));
    if(!matches.length)continue;
    if(sid&&row.treasurySettlements.some(x=>String(x.settlementId)===sid))continue;
    const uniquelyAttributed=matches.filter(item=>item.roots.length===1),
      sharedMatches=matches.filter(item=>item.roots.length>1),
      knownValues=uniquelyAttributed.filter(item=>item.value!==null),
      allUniqueValuesKnown=uniquelyAttributed.length>0&&knownValues.length===uniquelyAttributed.length,
      attributedValue=knownValues.reduce((sum,item)=>sum+item.value,0),
      attributedQuantity=uniquelyAttributed.reduce((sum,item)=>sum+(item.quantity===null?0:item.quantity),0),
      attributionStatus=transactionHasSingleRoot?'FULLY_ATTRIBUTED':
        (sharedMatches.length&&uniquelyAttributed.length?'PARTIALLY_ATTRIBUTED':
          (sharedMatches.length?'SHARED_SOURCE_VALUE_UNALLOCATED':
            (uniquelyAttributed.length&&allUniqueValuesKnown?'PER_SOURCE_ALLOCATION':'SOURCE_VALUE_UNAVAILABLE'))),
      siteValue=transactionHasSingleRoot?(transactionValue!==null?transactionValue:(allUniqueValuesKnown?attributedValue:null)):
        (allUniqueValuesKnown?attributedValue:null),
      siteQuantity=transactionHasSingleRoot?(num(p.quantity)!==null?num(p.quantity):(attributedQuantity>0?attributedQuantity:null)):
        (uniquelyAttributed.length?attributedQuantity:null),
      sharedSourceBatchIds=[...new Set(sharedMatches.flatMap(item=>item.roots).filter(id=>id!==batchId))];
    // Do not copy a whole multi-deposit sale value/fiscal receipt onto every contributing
    // mine. Only single-root transfer portions can be attributed to this site's flow.
    // The country's finance ledger remains authoritative for the settlement total.
    const siteValueAttributed=siteValue!==null,
      siteSettlementStatus=siteValueAttributed?'RECEIPT_POSTED':'SETTLEMENT_LINKED_UNALLOCATED';
    const receipt={settlementId:sid,resourceId:p.resourceId||null,quantity:siteQuantity,totalValue:siteValue,
      attributedQuantity:attributedQuantity>0?attributedQuantity:null,
      sharedSourceTransferCount:sharedMatches.length,sharedSourceBatchIds,
      valueAttributionStatus:attributionStatus,fiscal:transactionHasSingleRoot?clone(p.fiscal||null):null,
      transactionFiscalRecorded:!!p.fiscal,turn:turn(),status:siteSettlementStatus};
    row.treasurySettlements.push(receipt);
    addFlowStage(row,'TREASURY',siteSettlementStatus,{settlementId:sid,resourceId:p.resourceId||null,
      totalValue:siteValue,valueAttributionStatus:attributionStatus,sharedSourceTransferCount:sharedMatches.length,
      sharedSourceBatchIds,fiscal:transactionHasSingleRoot?clone(p.fiscal||null):null});
    saveSiteFlow(cid,row);
  }
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
  const resourceId=tok(input.resourceId||site?.real?.resourceId||site?.sourceSiteRecord?.resourceId||site?.identity?.resourceTypeId);
  if(!resourceId)return{status:'BLOCKED',reason:'RESOURCE_ID_MISSING'};
  const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const siteGate=strategicPolicy?.siteAvailableForExtraction?.(cid,site.siteId,site);
  if(siteGate&&!siteGate.allowed)return{status:'BLOCKED',reason:siteGate.reason||'SITE_EXPLORATION_GATE_BLOCKED',siteId:site.siteId,countryId:cid,resourceId};
  const countryResource=resourceState(cid),mineStates=countryResource.mineStates&&typeof countryResource.mineStates==='object'?countryResource.mineStates:{};
  const matchingState=Object.entries(mineStates).find(([key,row])=>
    String(row?.siteReferenceKey||row?.siteId||row?.sourceSiteId||'')===String(site.siteId)&&
    tok(row?.resourceId||row?.resourceTypeId)===resourceId);
  const reserveState=matchingState?.[1]||null,occurrenceKey=matchingState?.[0]||reserveState?.occurrenceKey||null;
  const reserveRegistry=g.__OmegaResourceReserveRegistry||g.OmegaResourceReserveRegistry;
  const registeredCapacity=occurrenceKey?reserveRegistry?.getCapacityForOccurrence?.(occurrenceKey):null;
  const registryReserveValue=num(reserveState?.residualQuantity);
  const registryReserve=registryReserveValue===null?null:Math.max(0,registryReserveValue);
  const registryRate=Math.max(0,num(registeredCapacity?.activeRate)||num(registeredCapacity?.dailyRate)||num(registeredCapacity?.nominalRate)||0);
  const sourceReserve=num(input.remainingReserve)??(registryReserve!==null&&registryReserve>0?registryReserve:null);
  const sr=scenarioFor(site,resourceId),modelInput={
    ...clone(site),siteId:site.siteId,siteReferenceKey:site.siteId,siteName:site.siteName,siteType:site.siteType,resourceId,
    simulationReserveQuantity:sourceReserve??sr?.reserve?.quantity??input.reserveQuantity??site.simulationReserveQuantity??site.quantitative?.reserve?.quantity,
    simulationReserveUnit:reserveState?.unit||sr?.reserve?.unit||input.reserveUnit||site.simulationReserveUnit||site.quantitative?.reserve?.unit,
    capacity:{...clone(site.capacity||{}),activeRate:registryRate||num(site.capacity?.activeRate)||null,
      dailyRate:registryRate||num(site.capacity?.dailyRate)||null,nominalCapacity:registryRate||num(site.capacity?.nominalCapacity)||null,
      unit:registeredCapacity?.unit||site.capacity?.unit||null,
      authority:registeredCapacity?.authority||site.capacity?.authority||'SIMULATED'},
    productionModel:{...clone(site.productionModel||{}),activeRate:registryRate||num(site.productionModel?.activeRate)||null,
      dailyRate:registryRate||num(site.productionModel?.dailyRate)||null,nominalCapacity:registryRate||num(site.productionModel?.nominalCapacity)||null,
      authority:registeredCapacity?.authority||site.productionModel?.authority||'SIMULATED'}
  };
  const model=g.Omega?.ResourceRealism?.siteModel?.(modelInput,null,cid);
  const stream=model?.commodityStreams?.find(x=>tok(x.resourceId)===resourceId);
  if(!stream)return{status:'BLOCKED',reason:'NO_COMMODITY_STREAM'};
  const meth=resourceMethod(site,resourceId),m=methodRules()[meth.method];if(!m)return{status:'BLOCKED',reason:'EXTRACTION_METHOD_UNDEFINED'};
  const tech=getTechnologyEffect(cid,site.siteId,resourceId,site.siteType);
  const daily=Math.max(.000001,num(stream.production?.activeRate)||num(stream.production?.nominalCapacity)||registryRate||0)*Math.max(.1,num(tech.capacityMultiplier)||1);
  if(daily<=0)return{status:'BLOCKED',reason:'ZERO_EXTRACTION_CAPACITY'};
  const requested=Math.max(0,num(input.quantity)||daily*Number(rules()[resourceId]?.batchDays||1));
  const currentReserve=Math.max(0,num(input.remainingReserve)??(registryReserve!==null&&registryReserve>0?registryReserve:null)??num(stream.reserve?.quantity)??0);
  if(currentReserve<=0)return{status:'BLOCKED',reason:'RESERVE_EXHAUSTED',remainingReserve:currentReserve};
  const quantity=Math.min(requested,currentReserve,daily*Math.max(1,Number(rules()[resourceId]?.batchDays||1)));
  const haulDays=Math.max(0,num(input.mineToWarehouseDays)??0);
  const extractionDays=Math.max(1,quantity/daily)+Number(m.prepDays||0)/Math.max(1,Number(rules()[resourceId]?.batchDays||1));
  const totalDays=extractionDays+haulDays,path='MINE_PATH:'+cid+':'+site.siteId;
  const plan={status:'PLANNED',planId:'EXT:'+cid+':'+site.siteId+':'+resourceId+':T'+turn(),countryId:cid,siteId:site.siteId,siteName:site.siteName,resourceId,
    occurrenceKey:occurrenceKey||null,reserveStateAuthority:reserveState?.provenance?.sourceAuthority||reserveState?.provenance?.quantityAuthority||sr?.reserve?.authority||'SIMULATED',
    method:meth.method,methodAuthority:meth.source,methodDetails:clone(m),requestedQuantity:requested,approvedQuantity:quantity,
    unit:stream.reserve?.unit||reserveState?.unit||sr?.reserve?.unit||'TONNES',dailyCapacity:daily,
    extractionDays:Number(extractionDays.toFixed(3)),haulDays:Number(haulDays.toFixed(3)),totalDurationDays:Number(totalDays.toFixed(3)),
    crewRequired:m.crew,equipmentRequired:clone(m.equipment),batchCycleDays:rules()[resourceId]?.batchDays||1,recovery:stream.production?.recovery??null,
    technologyEffects:clone(tech),minePath:path,warehouseCountryId:cid,sourceAuthority:stream.reserve?.authority||reserveState?.provenance?.quantityAuthority||'SIMULATED',simulationYear:year()
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
  const rid=tok(resourceId),r=processRules()[rid]||null;
  const genericProduct=String(resourceId||'RESOURCE').trim().replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').toUpperCase()+'_PROCESSED';
  const genericRule={factoryType:'GENERIC_RESOURCE_PROCESSING_PLANT',inputs:{[rid||'unknown_resource']:1},
    outputs:{[genericProduct]:0.85,PROCESSING_RESIDUE:0.15},cycleDays:2,authority:'SIMULATED_GENERIC_FALLBACK'};
  const base=r||genericRule;
  const inputs=asset.inputCoefficients||asset.inputs||base.inputs||{};
  const outputs=asset.outputProfile||asset.outputs||base.outputs||{};
  return{factoryType:asset.factoryType||asset.type||base.factoryType||'RESOURCE_PROCESSING_PLANT',
    inputs:clone(inputs),outputs:clone(outputs),cycleDays:num(asset.cycleDays)||num(base.cycleDays)||1,
    recipeAuthority:r?'INDUSTRIAL_CATALOG_RULE':(asset.outputProfile||asset.inputs?'ASSET_PROFILE':'SIMULATED_GENERIC_FALLBACK')};
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
  const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const siteGate=strategicPolicy?.siteAvailableForExtraction?.(cid,site.siteId,site);
  if(siteGate&&!siteGate.allowed)return{status:'BLOCKED',reason:siteGate.reason||'SITE_EXPLORATION_GATE_BLOCKED',siteId:site.siteId,countryId:cid,resourceId:rid};
  const candidates=candidateFactories(cid,rid);
  if(input.factoryId){const f=candidates.find(x=>String(x.asset?.id||x.asset?.assetId||x.asset?.projectId)===String(input.factoryId));if(!f)return{status:'BLOCKED',reason:'FACTORY_NOT_CAPABLE'};candidates.splice(0,candidates.length,f)}
  if(!candidates.length)return{status:'BLOCKED',reason:'NO_MATCHING_FACTORY',countryId:cid,siteId:site.siteId,resourceId:rid};
  const ordered=candidates.sort((a,b)=>String(a.asset?.priority??999)-String(b.asset?.priority??999));
  let best=null,policyBlockedRoute=null;
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
    const blockade=strategicPolicy?.isRouteBlocked?.(cid,{resourceId:rid,transportMode:route.transportMode||route.mode,routeId:route.routeId,siteId:site.siteId,factoryId:String(c.asset?.id||c.asset?.assetId||c.asset?.projectId||'')});
    if(blockade?.blocked){policyBlockedRoute=blockade;continue;}
    if(route.status==='PLANNED' && (!best||route.travelTimeDays<best.route.travelTimeDays))best={candidate:c,route};
  }
  if(!best)return{status:'BLOCKED',reason:policyBlockedRoute?.reason||'NO_USABLE_TRANSPORT_ROUTE',policy:policyBlockedRoute||null,candidates:ordered.length};
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
  const cid=canonicalCountry(input.countryId),strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const dispatchBlockade=strategicPolicy?.isRouteBlocked?.(cid,{resourceId:plan.resourceId,transportMode:plan.route?.transportMode,routeId:plan.route?.routeId,siteId:plan.siteId,factoryId:plan.factoryId});
  if(dispatchBlockade?.blocked)return{status:'BLOCKED',reason:dispatchBlockade.reason||'RESOURCE_ROUTE_BLOCKADE_ACTIVE',policy:dispatchBlockade,plan};
  const plannedQuantity=Math.max(0,num(plan.route.dispatchQuantity)||0);
  let quantity=plannedQuantity,quantityAdjustmentReason=null;
  const sourceBatchId=String(input.batchId||'').trim(),sourceBatch=sourceBatchId?
    (Array.isArray(resourceState(cid).batches)?resourceState(cid).batches.find(x=>String(x?.batchId||'')===sourceBatchId):null):null;
  if(sourceBatchId){
    const inTransit=netState(cid).shipments.find(x=>String(x?.batchId||'')===sourceBatchId&&String(x?.status||'')==='IN_TRANSIT');
    if(inTransit)return{status:'DISPATCHED',shipment:inTransit,idempotent:true};
  }
  if(sourceBatchId&&!sourceBatch)return{status:'BLOCKED',reason:'SOURCE_BATCH_NOT_FOUND',batchId:sourceBatchId,plan};
  // Route quantities are rounded to six decimal places. Cap tiny rounding excess to the
  // authoritative batch/lot balance, but still block real ledger mismatches (> 1e-6).
  const quantityEpsilon=1e-6;
  if(sourceBatch){
    const sourceQuantity=Math.max(0,num(sourceBatch.remainingQuantity!=null?sourceBatch.remainingQuantity:sourceBatch.quantity)||0);
    if(sourceQuantity+quantityEpsilon<quantity)return{status:'BLOCKED',reason:'SOURCE_BATCH_QUANTITY_INSUFFICIENT',batchId:sourceBatchId,required:quantity,available:sourceQuantity,plan};
    if(sourceQuantity<quantity)quantityAdjustmentReason='SOURCE_BATCH_OR_LOT_ROUNDING_CAP';
    quantity=Math.min(quantity,sourceQuantity);
    const sourceLot=resourceState(cid).inventoryLots?.[sourceBatchId];
    if(sourceLot){
      const lotQuantity=Math.max(0,num(sourceLot.remainingQuantity!=null?sourceLot.remainingQuantity:sourceLot.quantity)||0);
      if(lotQuantity+quantityEpsilon<quantity)return{status:'BLOCKED',reason:'SOURCE_INVENTORY_LOT_QUANTITY_INSUFFICIENT',batchId:sourceBatchId,required:quantity,available:lotQuantity,plan};
      if(lotQuantity<quantity)quantityAdjustmentReason='SOURCE_BATCH_OR_LOT_ROUNDING_CAP';
      quantity=Math.min(quantity,lotQuantity);
    }
  }
  // Shipment capacity belongs to the route and available source inventory.
  // Factory capacity limits processing throughput per turn, not the amount the
  // receiving factory may hold in its input warehouse. Leave the full eligible
  // lot in transit; processFactory() applies the actual production-capacity limit
  // and retains any unprocessed input batch for later turns.
  if(quantity<=0)return{status:'BLOCKED',reason:'SOURCE_BATCH_QUANTITY_ZERO',batchId:sourceBatchId||null,plan};
  const shipmentId='SHIP:'+h32(JSON.stringify({plan,turn:turn(),salt:frac(input.siteId||'')}));
  const reserved=reserveInventoryForShipment(cid,plan.resourceId,quantity,shipmentId);if(!reserved.ok)return{status:'BLOCKED',reason:reserved.reason,details:reserved,plan};
  const route=clone(plan.route);route.dispatchQuantity=quantity;
  if(quantity<plannedQuantity)route.quantityAdjustment={reason:quantityAdjustmentReason||'SOURCE_BATCH_OR_LOT_ROUNDING_CAP',plannedQuantity,actualQuantity:quantity};
  const s={shipmentId,countryId:cid,siteId:plan.siteId,resourceId:plan.resourceId,factoryId:plan.factoryId,quantity,unit:input.unit||'TONNES',
    batchId:sourceBatchId||null,occurrenceKey:input.occurrenceKey||sourceBatch?.occurrenceKey||null,
    warehouseId:input.warehouseId||sourceBatch?.warehouseId||('WH-'+cid+'-RAW'),
    status:'IN_TRANSIT',createdTurn:turn(),etaTurn:route.etaTurn,route,reservationId:shipmentId,
    provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:route.distanceAuthority,sourceBatchId:sourceBatchId||null,
      sourceAuthority:sourceBatch?.provenance?.sourceAuthority||sourceBatch?.provenance?.authority||'UNOBSERVED',
      sourceBatchQuantity:sourceBatch?Math.max(0,num(sourceBatch.remainingQuantity!=null?sourceBatch.remainingQuantity:sourceBatch.quantity)||0):null,
      plannedDispatchQuantity:plannedQuantity,actualDispatchQuantity:quantity}};
  const n=netState(cid);n.shipments.push(s);n.shipments=n.shipments.slice(-MAX_SHIPMENTS);
  if(sourceBatchId)updateSiteFlow(cid,sourceBatchId,row=>{
    row.shipmentId=s.shipmentId;row.shipmentIds=[...new Set([...(row.shipmentIds||[]),s.shipmentId])];
  });
  emit('OMEGA_RESOURCE_SHIPMENT_CREATED',cid,s);
  return{status:'DISPATCHED',shipment:s};
}
function dispatchResidualSiteBatches(c){
  const cid=canonicalCountry(c),rs=resourceState(cid),network=netState(cid);
  for(const flow of siteFlowRows(cid).slice()){
    const batchId=String(flow.batchId||'').trim();if(!batchId||Number(flow.lastResidualDispatchTurn)===turn())continue;
    const source=Array.isArray(rs.batches)?rs.batches.find(x=>String(x?.batchId||'')===batchId):null;
    if(!source)continue;
    const remaining=Math.max(0,num(source.remainingQuantity!=null?source.remainingQuantity:source.quantity)||0);
    const original=Math.max(1,num(source.quantity)||1),epsilon=Math.max(1e-3,original*1e-6);
    if(remaining<=epsilon)continue;
    if(network.shipments.some(x=>String(x?.batchId||'')===batchId&&String(x?.status||'')==='IN_TRANSIT'))continue;
    const site=siteById(flow.siteId)||flow.siteSnapshot||{
      siteId:flow.siteId,countryId:cid,siteName:flow.siteName,real:{resourceId:flow.resourceId},
      sourceSiteRecord:{siteId:flow.siteId,resourceId:flow.resourceId,countryCode:cid,commercialExtraction:true},
      identity:{resourceTypeId:flow.resourceId},operation:{commercialExtraction:true},simulation:{transportRoute:[]},
      runtime:{identityAuthority:'ENDOWMENT_OCCURRENCE_FALLBACK',quantityAuthority:'SIMULATION_RUNTIME'}
    };
    const sent=dispatchShipment({countryId:cid,siteId:site.siteId,site,resourceId:flow.resourceId,quantity:remaining,
      unit:flow.unit||source.unit||'TONNES',transportMode:flow.route?.transportMode||site.simulation?.transportRoute?.[0]?.mode||undefined,
      factoryId:flow.factoryId,batchId,occurrenceKey:flow.occurrenceKey,warehouseId:flow.warehouseId||source.warehouseId||('WH-'+cid+'-RAW')});
    flow.lastResidualDispatchTurn=turn();
    if(sent.status==='DISPATCHED'){
      flow.shipmentId=sent.shipment.shipmentId;
      flow.shipmentIds=[...new Set([...(flow.shipmentIds||[]),sent.shipment.shipmentId])];
      flow.quantity=Math.max(num(flow.quantity)||0,remaining);
      flow.route=clone(sent.shipment.route);
      addFlowStage(flow,'TRANSPORT','IN_TRANSIT',{shipmentId:sent.shipment.shipmentId,dispatchQuantity:sent.shipment.quantity,
        etaTurn:sent.shipment.etaTurn,residualOf:(flow.shipmentIds||[]).length>1?flow.shipmentIds[flow.shipmentIds.length-2]:null});
    }else{
      addFlowStage(flow,'TRANSPORT','RESIDUAL_BLOCKED',{reason:sent.reason||'RESIDUAL_SHIPMENT_BLOCKED',remainingQuantity:remaining});
      flow.lastResidualBlockReason=sent.reason||'RESIDUAL_SHIPMENT_BLOCKED';
    }
    saveSiteFlow(cid,flow);
  }
}

function advanceShipments(c){
  const cid=canonicalCountry(c),n=netState(cid),delivered=[];
  dispatchResidualSiteBatches(cid);
  for(const s of n.shipments){
    if(!['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(s.status||'')))continue;
    const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
    const blockade=strategicPolicy?.isRouteBlocked?.(cid,{resourceId:s.resourceId,transportMode:s.route?.transportMode||s.route?.mode,routeId:s.route?.routeId,siteId:s.siteId,factoryId:s.factoryId});
    if(blockade?.blocked){s.status='BLOCKED_ROUTE_BLOCKADE';s.blockReason=blockade.reason||'RESOURCE_ROUTE_BLOCKADE_ACTIVE';s.blockadePolicies=blockade.blockades||[];s.blockedTurn=turn();continue;}
    if(s.status==='BLOCKED_ROUTE_BLOCKADE'){s.status='IN_TRANSIT';s.blockReason=null;s.resumedTurn=turn();s.etaTurn=Math.max(turn()+1,num(s.etaTurn)||turn()+1);}
    if(num(s.etaTurn)>turn())continue;
    const rid=tok(s.resourceId),quantity=Math.max(0,num(s.quantity)||0),r=resourceState(cid);
    const warehouse=r.warehouse||{},available=Math.max(0,num(warehouse.availableByResource?.[rid])||0);
    const reserved=Math.max(0,num(warehouse.reservedByResource?.[rid])||0);
    if(quantity<=0||available+1e-9<quantity||reserved+1e-9<quantity){
      s.status='BLOCKED_LEDGER_MISMATCH';s.blockReason='WAREHOUSE_AVAILABLE_OR_RESERVATION_MISMATCH';s.blockedTurn=turn();
      emit('OMEGA_RESOURCE_DELIVERY_BLOCKED',cid,{shipmentId:s.shipmentId,siteId:s.siteId,resourceId:rid,quantity,available,reserved,reason:s.blockReason});
      continue;
    }
    const factory=factoryAssets(cid).find(a=>String(a?.id||a?.assetId||a?.projectId)===String(s.factoryId));
    if(!factory){s.status='BLOCKED_FACTORY_MISSING';s.blockReason='FACTORY_NOT_FOUND_AT_DELIVERY';s.blockedTurn=turn();continue;}
    r.inventory=r.inventory||{};
    const invKey=Object.prototype.hasOwnProperty.call(r.inventory,rid)?rid:Object.keys(r.inventory).find(k=>tok(k)===rid);
    const countryRawStock=Math.max(0,num(invKey==null?0:r.inventory[invKey])||0);
    if(countryRawStock+1e-9<quantity){
      s.status='BLOCKED_LEDGER_MISMATCH';s.blockReason='COUNTRY_INVENTORY_BELOW_SHIPMENT_QUANTITY';s.blockedTurn=turn();continue;
    }
    const sourceBatchId=String(s.batchId||'').trim(),batches=Array.isArray(r.batches)?r.batches:[];
    const sourceBatch=sourceBatchId?batches.find(x=>String(x?.batchId||'')===sourceBatchId):null;
    if(sourceBatchId&&!sourceBatch){
      s.status='BLOCKED_BATCH_LEDGER_MISMATCH';s.blockReason='SOURCE_BATCH_MISSING_AT_DELIVERY';s.blockedTurn=turn();
      emit('OMEGA_RESOURCE_DELIVERY_BLOCKED',cid,{shipmentId:s.shipmentId,siteId:s.siteId,resourceId:rid,quantity,reason:s.blockReason,batchId:sourceBatchId});continue;
    }
    const lots=r.inventoryLots&&typeof r.inventoryLots==='object'?r.inventoryLots:{},sourceLot=sourceBatchId?lots[sourceBatchId]:null;
    if(sourceBatch){
      const sourceRemaining=Math.max(0,num(sourceBatch.remainingQuantity!=null?sourceBatch.remainingQuantity:sourceBatch.quantity)||0);
      const lotRemaining=sourceLot?Math.max(0,num(sourceLot.remainingQuantity!=null?sourceLot.remainingQuantity:sourceLot.quantity)||0):sourceRemaining;
      if(sourceRemaining+1e-9<quantity||(sourceLot&&lotRemaining+1e-9<quantity)){
        s.status='BLOCKED_BATCH_LEDGER_MISMATCH';s.blockReason='SOURCE_BATCH_OR_LOT_QUANTITY_MISMATCH';s.blockedTurn=turn();
        emit('OMEGA_RESOURCE_DELIVERY_BLOCKED',cid,{shipmentId:s.shipmentId,siteId:s.siteId,resourceId:rid,quantity,reason:s.blockReason,batchId:sourceBatchId,sourceRemaining,lotRemaining});continue;
      }
    }
    warehouse.availableByResource=warehouse.availableByResource||{};warehouse.reservedByResource=warehouse.reservedByResource||{};
    warehouse.availableByResource[rid]=Math.max(0,available-quantity);warehouse.reservedByResource[rid]=Math.max(0,reserved-quantity);
    if(sourceBatch){
      const sourceRemaining=Math.max(0,num(sourceBatch.remainingQuantity!=null?sourceBatch.remainingQuantity:sourceBatch.quantity)||0);
      sourceBatch.remainingQuantity=Math.max(0,sourceRemaining-quantity);
      sourceBatch.status=sourceBatch.remainingQuantity>1e-9?'PARTIALLY_TRANSFERRED_TO_FACTORY':'TRANSFERRED_TO_FACTORY';
      sourceBatch.lastMovementType='TRANSFER_TO_FACTORY';sourceBatch.lastMovementTurn=turn();
      if(sourceLot){
        sourceLot.remainingQuantity=sourceBatch.remainingQuantity;sourceLot.status=sourceLot.remainingQuantity>1e-9?'PARTIALLY_TRANSFERRED_TO_FACTORY':'TRANSFERRED_TO_FACTORY';
        sourceLot.lastMovementType='TRANSFER_TO_FACTORY';sourceLot.lastMovementTurn=turn();lots[sourceBatchId]=sourceLot;
      }
      if(sourceBatch.remainingQuantity<=1e-9&&Array.isArray(warehouse.storedBatchIds))warehouse.storedBatchIds=warehouse.storedBatchIds.filter(x=>String(x)!==sourceBatchId);
    }
    r.warehouse=warehouse;r.inventoryLots=lots;r.batches=batches;r.inventory[invKey]=Math.max(0,countryRawStock-quantity);
    factory.inputInventory=factory.inputInventory&&typeof factory.inputInventory==='object'?factory.inputInventory:{};
    factory.inputInventory[rid]=(num(factory.inputInventory[rid])||0)+quantity;
    factory.inputBatchLots=Array.isArray(factory.inputBatchLots)?factory.inputBatchLots:[];
    const inputBatchId='INPUT:'+s.shipmentId;
    if(!factory.inputBatchLots.some(x=>String(x?.batchId||'')===inputBatchId)){
      factory.inputBatchLots.push({batchId:inputBatchId,resourceId:rid,materialIdentity:rid,quantity,remainingQuantity:quantity,unit:s.unit||sourceBatch?.unit||'TONNES',
        stage:'FACTORY_INPUT',countryId:cid,sourceCountryId:cid,originCountryId:cid,ownerCountryCode:cid,destinationCountryId:cid,
        ownerCompanyId:String(factory.companyId||factory.ownerCompanyId||('SIM-COMPANY:'+cid)),sourceBatchIds:sourceBatch?[sourceBatchId]:[],
        sourceOccurrenceKey:s.occurrenceKey||sourceBatch?.occurrenceKey||null,sourceWarehouseId:s.warehouseId||sourceBatch?.warehouseId||('WH-'+cid+'-RAW'),
        factoryId:String(s.factoryId),locationNodeKey:'FACTORY:'+cid+':'+String(s.factoryId),
        provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:sourceBatch?'TRACKED_EXTRACTION_BATCH':'UNOBSERVED',
          status:sourceBatch?'TRACKED_BATCH_TRANSFER':'LEGACY_AGGREGATE_STOCK',shipmentId:s.shipmentId,sourceBatchId:sourceBatchId||null,
          sourceAuthority:sourceBatch?.provenance?.sourceAuthority||sourceBatch?.provenance?.authority||'UNOBSERVED',simulationTurn:turn()},
        lastMovementType:'RECEIPT_FROM_TRANSPORT',lastMovementTurn:turn(),status:'AVAILABLE_TO_FACTORY'});
    }
    // Reconcile legacy aggregate-only factory stock into an explicitly unobserved input lot.
    // The batch-lot ledger then becomes the single quantity basis for each future processing debit.
    const aggregateInput=Math.max(0,num(factory.inputInventory[rid])||0),inputRows=factory.inputBatchLots.filter(lot=>
      tok(lot?.resourceId||lot?.materialIdentity)===rid);
    const lotRemaining=lot=>['CONSUMED','SOLD','TRANSFERRED_OUT'].includes(String(lot?.status||'').toUpperCase())?0:
      Math.max(0,num(lot?.remainingQuantity!=null?lot.remainingQuantity:lot?.quantity)||0);
    const trackedInput=inputRows.reduce((sum,lot)=>sum+lotRemaining(lot),0),inputGap=aggregateInput-trackedInput;
    if(inputGap>1e-6){
      const legacyId='LEGACY-FACTORY-INPUT:'+cid+':'+String(s.factoryId)+':'+rid;
      let legacy=factory.inputBatchLots.find(lot=>String(lot?.batchId||'')===legacyId);
      if(!legacy){
        legacy={batchId:legacyId,resourceId:rid,materialIdentity:rid,quantity:inputGap,remainingQuantity:inputGap,
          unit:s.unit||'TONNES',stage:'FACTORY_INPUT',countryId:cid,sourceCountryId:cid,originCountryId:cid,
          ownerCountryCode:cid,destinationCountryId:cid,ownerCompanyId:String(factory.companyId||factory.ownerCompanyId||('SIM-COMPANY:'+cid)),
          sourceBatchIds:[],factoryId:String(s.factoryId),locationNodeKey:'FACTORY:'+cid+':'+String(s.factoryId),
          provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:'UNOBSERVED',status:'LEGACY_FACTORY_INPUT_BALANCE',
            explanation:'Pre-existing factory input aggregate had no matching batch lot',simulationTurn:turn()},
          lastMovementType:'LEGACY_INPUT_RECONCILIATION',lastMovementTurn:turn(),status:'AVAILABLE_TO_FACTORY'};
        factory.inputBatchLots.push(legacy);
      }else{
        legacy.quantity=(num(legacy.quantity)||0)+inputGap;
        legacy.remainingQuantity=lotRemaining(legacy)+inputGap;
        legacy.status='AVAILABLE_TO_FACTORY';legacy.lastMovementType='LEGACY_INPUT_RECONCILIATION';legacy.lastMovementTurn=turn();
      }
    }else if(inputGap < -1e-6){
      // Detailed physical lots take precedence over a stale aggregate counter.
      factory.inputInventory[rid]=trackedInput;
    }
    const reconciledInputRows=factory.inputBatchLots.filter(lot=>tok(lot?.resourceId||lot?.materialIdentity)===rid);
    const reconciledInputTotal=reconciledInputRows.reduce((sum,lot)=>sum+lotRemaining(lot),0);
    if(Math.abs((num(factory.inputInventory[rid])||0)-reconciledInputTotal)>1e-5){
      factory.inputInventory[rid]=reconciledInputTotal;
      emit('OMEGA_RESOURCE_FACTORY_INPUT_LEDGER_RECONCILED',cid,{factoryId:String(s.factoryId),resourceId:rid,
        aggregateBefore:aggregateInput,trackedBefore:trackedInput,aggregateAfter:reconciledInputTotal,turn:turn(),
        authority:'TRACKED_LOTS_PLUS_UNOBSERVED_LEGACY_BALANCE'},'resource-industrial-network');
    }
    s.status='DELIVERED';s.deliveredTurn=turn();s.destinationStatus='FACTORY_RECEIVED';s.factoryInputBatchId=inputBatchId;
    const processQuantity=Math.min(quantity,Math.max(1,num(factory.capacity)||quantity));
    const processing=executeFactoryCycle({countryId:cid,factoryId:s.factoryId,resourceId:rid,quantity:processQuantity});
    s.processingStatus=processing?.status==='COMPLETED'?'PROCESSED':'AWAITING_PROCESSING';s.processingTransactionId=processing?.transactionId||null;s.processing=clone(processing);
    n.deliveries.push(clone(s));delivered.push(clone(s));const res=n.reservations?.[s.reservationId];if(res)res.status='DELIVERED';
    emit('OMEGA_RESOURCE_DELIVERY_COMPLETED',cid,{shipmentId:s.shipmentId,siteId:s.siteId,factoryId:s.factoryId,resourceId:rid,quantity,unit:s.unit,
      travelTimeDays:s.route.travelTimeDays,transport:s.route.transportMode,status:'DELIVERED_TO_FACTORY',processingStatus:s.processingStatus,
      processingTransactionId:s.processingTransactionId,batchId:sourceBatchId||null});
    if(sourceBatchId){
      updateSiteFlow(cid,sourceBatchId,row=>{
        row.shipmentId=s.shipmentId;row.factoryId=s.factoryId;row.processingTransactionId=s.processingTransactionId||null;
        row.createdBatchIds=[...new Set([...(row.createdBatchIds||[]),...(processing?.createdBatchIds||[])])];
        row.outputQuantities=clone(processing?.outputQuantities||processing?.outputs||{});
        addFlowStage(row,'TRANSPORT','DELIVERED',{shipmentId:s.shipmentId,deliveredQuantity:quantity});
        addFlowStage(row,'FACTORY_INPUT','RECEIVED',{factoryId:s.factoryId,inputBatchId,quantity});
        if(processing?.status==='COMPLETED'){
          addFlowStage(row,'PROCESSING','COMPLETED',{transactionId:processing.transactionId,inputQuantity:processing.inputQuantity});
          addFlowStage(row,'FINISHED_GOODS','AVAILABLE',{transactionId:processing.transactionId,createdBatchIds:processing.createdBatchIds||[],outputQuantities:processing.outputQuantities||processing.outputs||{}});
        }else if(processing?.reason==='FACTORY_TURN_CAPACITY_ALREADY_USED')addFlowStage(row,'PROCESSING','AWAITING_CAPACITY',{reason:processing.reason,turn:turn()});
        else addFlowStage(row,'PROCESSING','BLOCKED',{reason:processing?.reason||processing?.status||'PROCESSING_NOT_COMPLETED'});
      });

    }
  }
  n.deliveries=n.deliveries.slice(-MAX_SHIPMENTS);
  return{status:'ADVANCED',countryId:cid,turn:turn(),delivered:delivered.length,shipments:delivered};
}
function startFactoryProject(input={}){
  const cid=canonicalCountry(input.countryId),rid=tok(input.resourceId),rule=recipeFor(rid,{});if(!Object.keys(rule.inputs||{}).length||!Object.keys(rule.outputs||{}).length)return{status:'BLOCKED',reason:'NO_FACTORY_RECIPE'};
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
  const n=netState(cid),processedTurns=n.factoryProcessingTurns&&typeof n.factoryProcessingTurns==='object'?n.factoryProcessingTurns:(n.factoryProcessingTurns={});
  if(Number(processedTurns[fid])===turn())return{status:'BLOCKED',reason:'FACTORY_TURN_CAPACITY_ALREADY_USED',factoryId:fid,turn:turn()};
  const rid=tok(input.resourceId),recipe=recipeFor(rid,asset),r=resourceState(cid);r.inventory=r.inventory||{};
  const factoryStock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const factoryAvailable=Math.max(0,num(factoryStock[rid])||0),countryAvailable=Math.max(0,num(r.inventory[rid])||0);
  const inputCoefficient=Math.max(1e-9,num(recipe.inputs[rid])||1),requestedLimit=Math.min(
    Math.max(0,num(input.quantity)||num(asset.capacity)||0),
    Math.max(0,num(asset.capacity)||Number.MAX_SAFE_INTEGER)
  );
  const availableInputStock=factoryAvailable>1e-9?factoryAvailable:countryAvailable;
  const requested=Math.min(requestedLimit,availableInputStock/inputCoefficient);
  const need=requested*inputCoefficient;
  if(!(requested>1e-9))return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',required:need,available:availableInputStock,source:factoryAvailable>1e-9?'FACTORY_INPUT_INVENTORY':'COUNTRY_INVENTORY'};
  const fromFactoryInput=factoryAvailable>1e-9&&factoryAvailable+1e-9>=need,available=fromFactoryInput?factoryAvailable:countryAvailable;
  if(available+1e-9<need)return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',required:need,available,source:fromFactoryInput?'FACTORY_INPUT_INVENTORY':'COUNTRY_INVENTORY'};
  const inputLots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:[];
  const trackedForResource=inputLots.filter(x=>tok(x?.resourceId||x?.materialIdentity)===rid&&Math.max(0,num(x?.remainingQuantity!=null?x.remainingQuantity:x?.quantity)||0)>1e-9);
  const trackedQuantity=trackedForResource.reduce((sum,x)=>sum+Math.max(0,num(x.remainingQuantity!=null?x.remainingQuantity:x.quantity)||0),0);
  if(fromFactoryInput&&trackedForResource.length&&trackedQuantity+1e-9<need)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',required:need,trackedInputQuantity:trackedQuantity,factoryInputInventory:factoryAvailable};
  const carbonPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const carbonUnit=trackedForResource.find(x=>x?.unit)?.unit||
    (Array.isArray(r.batches)?r.batches.find(x=>tok(x?.resourceId||x?.materialIdentity)===rid&&x?.unit)?.unit:null)||
    (Array.isArray(g.ResourceMinistryEngine?.resourceTypes)?g.ResourceMinistryEngine.resourceTypes.find(x=>tok(x?.id||x?.resourceId)===rid)?.unit:null);
  const carbonGate=carbonPolicy?.previewCarbonActivity?.(cid,rid,need,carbonUnit,'RESOURCE_PROCESSING');
  if(carbonGate&&carbonGate.allowed===false)return{status:'BLOCKED',reason:carbonGate.reason||'CARBON_QUOTA_POLICY_BLOCKED_PROCESSING',carbonGate};
  const output={};for(const k of Object.keys(recipe.outputs))output[k]=requested*(num(recipe.outputs[k])||0);
  const sourceBatchIds=[],consumedInputs=[];let inputTrackingStatus='UNTRACKED_LEGACY_INPUT';
  if(fromFactoryInput){
    factoryStock[rid]=Math.max(0,factoryAvailable-need);
    if(trackedForResource.length){
      let remaining=need;inputTrackingStatus='TRACKED_FACTORY_INPUT_LOTS';
      for(const lot of trackedForResource){
        if(remaining<=1e-9)break;
        const prior=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0),take=Math.min(prior,remaining);
        if(take<=0)continue;
        lot.remainingQuantity=Math.max(0,prior-take);lot.status=lot.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';
        lot.lastMovementType='PROCESSING_CONSUMPTION';lot.lastMovementTurn=turn();
        const roots=Array.isArray(lot.sourceBatchIds)&&lot.sourceBatchIds.length?lot.sourceBatchIds:[lot.batchId];
        roots.filter(Boolean).forEach(x=>sourceBatchIds.push(String(x)));
        consumedInputs.push({batchId:lot.batchId,quantity:take,sourceBatchIds:roots.filter(Boolean),stage:'FACTORY_INPUT'});remaining-=take;
      }
      if(remaining>1e-9)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',required:need,unallocated:remaining};
    }
  }else{
    let remaining=need,rawDebit=0,processedDebit=0;const batches=Array.isArray(r.batches)?r.batches:[],lots=r.inventoryLots&&typeof r.inventoryLots==='object'?r.inventoryLots:{};
    for(const batch of batches){
      if(remaining<=1e-9)break;
      if(tok(batch?.resourceId||batch?.materialIdentity)!==rid)continue;
      const stage=String(batch?.stage||'RAW').toUpperCase();
      if(['FACTORY_INPUT','CONSUMED','TRANSFERRED_TO_FACTORY'].includes(stage))continue;
      const prior=Math.max(0,num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);if(prior<=0)continue;
      const take=Math.min(prior,remaining);batch.remainingQuantity=Math.max(0,prior-take);
      batch.status=batch.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';batch.lastMovementType='PROCESSING_CONSUMPTION';batch.lastMovementTurn=turn();
      if(['PROCESSED','INTERMEDIATE','FINISHED','REFINED','OUTPUT'].includes(stage))processedDebit+=take;else rawDebit+=take;
      const lot=lots[batch.batchId];if(lot){lot.remainingQuantity=batch.remainingQuantity;lot.status=batch.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';lot.lastMovementType='PROCESSING_CONSUMPTION';lot.lastMovementTurn=turn();}
      if(batch.batchId)sourceBatchIds.push(String(batch.batchId));consumedInputs.push({batchId:batch.batchId,quantity:take,sourceBatchIds:[batch.batchId].filter(Boolean),stage:stage});remaining-=take;
    }
    if(remaining>1e-9){
      inputTrackingStatus='PARTIAL_TRACKING_WITH_LEGACY_BALANCE';
      const rawAvailable=Math.max(0,num(r.warehouse?.availableByResource?.[rid])||0),rawTake=Math.min(rawAvailable,remaining);rawDebit+=rawTake;remaining-=rawTake;
      const processedAvailable=Math.max(0,num(r.processedWarehouse?.availableByResource?.[rid])||0),processedTake=Math.min(processedAvailable,remaining);processedDebit+=processedTake;remaining-=processedTake;
      if(remaining>1e-9)consumedInputs.push({batchId:null,quantity:remaining,stage:'LEGACY_UNALLOCATED',sourceBatchIds:[]});
    }
    const rawWarehouse=r.warehouse||{};if(rawWarehouse.availableByResource)rawWarehouse.availableByResource[rid]=Math.max(0,(num(rawWarehouse.availableByResource[rid])||0)-rawDebit);
    if(r.processedWarehouse?.availableByResource)r.processedWarehouse.availableByResource[rid]=Math.max(0,(num(r.processedWarehouse.availableByResource[rid])||0)-processedDebit);
    r.warehouse=rawWarehouse;r.batches=batches;r.inventoryLots=lots;r.inventory[rid]=Math.max(0,countryAvailable-need);
  }
  asset.inputInventory=factoryStock;
  const sequence=Math.max(0,Number(n.factoryRunSequence)||0)+1;n.factoryRunSequence=sequence;
  const transactionId='FACTORYRUN:'+cid+':'+fid+':T'+turn()+':'+sequence;
  const finishedWarehouse=r.processedWarehouse||(r.processedWarehouse={warehouseId:'WH-'+cid+'-PROCESSED',countryId:cid,type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[]});
  finishedWarehouse.availableByResource=finishedWarehouse.availableByResource||{};finishedWarehouse.storedBatchIds=Array.isArray(finishedWarehouse.storedBatchIds)?finishedWarehouse.storedBatchIds:[];
  finishedWarehouse.receipts=Array.isArray(finishedWarehouse.receipts)?finishedWarehouse.receipts:[];
  const batches=Array.isArray(r.batches)?r.batches:[],inventoryLots=r.inventoryLots&&typeof r.inventoryLots==='object'?r.inventoryLots:{},created=[];
  for(const outputId of Object.keys(output)){
    const outQty=output[outputId];if(!(outQty>0))continue;
    r.inventory[outputId]=(num(r.inventory[outputId])||0)+outQty;
    const batchId='OUTPUT:'+transactionId+':'+outputId,roots=[...new Set(sourceBatchIds.filter(Boolean))],unit=input.unit||inputLots.find(x=>tok(x.resourceId)===rid)?.unit||'TONNES';
    const row={batchId,resourceId:outputId,materialIdentity:outputId,quantity:outQty,remainingQuantity:outQty,unit,stage:'FINISHED',countryId:cid,
      sourceCountryId:cid,originCountryId:cid,ownerCountryCode:cid,destinationCountryId:cid,ownerCompanyId:String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid)),
      sourceBatchIds:roots,sourceFactoryId:fid,warehouseId:'WH-'+cid+'-PROCESSED',locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',processId:transactionId,
      provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:'SIMULATED_PROCESSING_YIELD',processingAuthority:'SIMULATED',status:'FINISHED_GOODS_CREATED',transactionId,sourceBatchIds:roots,simulationTurn:turn()}};
    batches.push(row);created.push(row);
    inventoryLots[batchId]={batchId,resourceId:outputId,quantity:outQty,remainingQuantity:outQty,unit,stage:'FINISHED',countryId:cid,warehouseId:row.warehouseId,
      locationNodeKey:row.locationNodeKey,ownerCompanyId:row.ownerCompanyId,sourceBatchIds:roots,status:'AVAILABLE',provenance:clone(row.provenance),createdTurn:turn()};
    finishedWarehouse.availableByResource[outputId]=(num(finishedWarehouse.availableByResource[outputId])||0)+outQty;
    if(!finishedWarehouse.storedBatchIds.includes(batchId))finishedWarehouse.storedBatchIds.push(batchId);
    finishedWarehouse.receipts.push({receiptId:'WH-REC-'+batchId,warehouseId:row.warehouseId,countryId:cid,batchId,resourceId:outputId,quantity:outQty,unit,simulationTurn:turn(),status:'RECEIVED'});
  }
  while(finishedWarehouse.receipts.length>2048)finishedWarehouse.receipts.shift();while(batches.length>8192)batches.shift();
  const record={transactionId,countryId:cid,factoryId:fid,companyId:String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid)),resourceId:rid,
    inputQuantity:need,inputQuantities:{[rid]:need},requestedProduction:requested,outputs:output,outputQuantities:clone(output),recipe:clone(recipe),
    cycleDays:recipe.cycleDays,turn:turn(),authority:'INDUSTRIAL_NETWORK_SIMULATION',status:'COMPLETED',inputSource:fromFactoryInput?'DELIVERED_SHIPMENT':'CENTRAL_INVENTORY',
    inputTrackingStatus,consumedInputs:clone(consumedInputs),sourceBatchIds:[...new Set(sourceBatchIds.filter(Boolean))],createdBatchIds:created.map(x=>x.batchId)};
  r.batches=batches;r.inventoryLots=inventoryLots;r.processedWarehouse=finishedWarehouse;
  processedTurns[fid]=turn();n.factoryProcessingTurns=processedTurns;
  r.finishedGoodsLedger=Array.isArray(r.finishedGoodsLedger)?r.finishedGoodsLedger:[];
  r.finishedGoodsLedger.push({transactionId,countryId:cid,factoryId:fid,companyId:record.companyId,sourceBatchIds:record.sourceBatchIds,outputQuantities:clone(output),
    createdBatchIds:record.createdBatchIds,turn:turn(),authority:'SIMULATED_PROCESSING_YIELD',status:'AVAILABLE_TO_ECONOMY'});
  while(r.finishedGoodsLedger.length>2048)r.finishedGoodsLedger.shift();
  const inventoryLedger=Array.isArray(r.inventoryLedger)?r.inventoryLedger:[];
  inventoryLedger.push({type:'FACTORY_PROCESSING_COMMITTED',transactionId,factoryId:fid,resourceId:rid,inputQuantity:need,outputs:clone(output),sourceBatchIds:record.sourceBatchIds,createdBatchIds:record.createdBatchIds,turn:turn()});
  while(inventoryLedger.length>2048)inventoryLedger.shift();r.inventoryLedger=inventoryLedger;
  n.factoryRuntime[fid]=record;n.events.push(record);n.events=n.events.slice(-MAX_EVENTS);
  emit('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',cid,record);
  emit('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',cid,{transactionId,countryId:cid,factoryId:fid,companyId:record.companyId,outputs:clone(output),
    outputQuantities:clone(output),sourceBatchIds:record.sourceBatchIds,createdBatchIds:record.createdBatchIds,turn:turn(),
    authority:'SIMULATED_PROCESSING_YIELD',status:'AVAILABLE'});
  return record;
}
function processPendingFactoryInputs(countryId){
  const cid=canonicalCountry(countryId),n=netState(cid),assets=factoryAssets(cid),processed=[],blocked=[];
  for(const asset of assets){
    const fid=String(asset?.id||asset?.assetId||asset?.projectId||'');
    if(!fid||!asset||Number(n.factoryProcessingTurns?.[fid])===turn())continue;
    const stock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
    const lots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:[];
    const pending=lots.filter(lot=>Math.max(0,num(lot?.remainingQuantity!=null?lot.remainingQuantity:lot?.quantity)||0)>1e-9)
      .sort((a,b)=>(Number(a.createdTurn)||0)-(Number(b.createdTurn)||0));
    const first=pending.find(lot=>{
      const rid=tok(lot?.resourceId||lot?.materialIdentity);
      return !!rid&&Math.max(0,num(stock[rid])||0)>1e-9;
    });
    const rid=tok(first?.resourceId||first?.materialIdentity||
      Object.keys(stock).find(key=>Math.max(0,num(stock[key])||0)>1e-9)||'');
    if(!rid)continue;
    const available=Math.max(0,num(stock[rid])||0),recipe=recipeFor(rid,asset),
      coefficient=Math.max(1e-9,num(recipe.inputs?.[rid])||1),
      capacity=Math.max(0,num(asset.capacity!=null?asset.capacity:(asset.productionCapacity!=null?asset.productionCapacity:asset.throughput))||0);
    if(!(available>1e-9)||!(capacity>1e-9)){
      blocked.push({factoryId:fid,resourceId:rid,reason:capacity>1e-9?'FACTORY_INPUT_UNAVAILABLE':'PRODUCTION_CAPACITY_UNAVAILABLE',available,capacity});
      continue;
    }
    const quantity=Math.min(capacity,available/coefficient);
    const result=executeFactoryCycle({countryId:cid,factoryId:fid,resourceId:rid,quantity,unit:first?.unit||null});
    if(result?.status==='COMPLETED'){
      processed.push({factoryId:fid,resourceId:rid,inputQuantity:result.inputQuantity,transactionId:result.transactionId,createdBatchIds:result.createdBatchIds||[]});
      for(const sourceBatchId of [...new Set((result.sourceBatchIds||[]).map(String).filter(Boolean))]){
        updateSiteFlow(cid,sourceBatchId,row=>{
          row.processingTransactionIds=[...new Set([...(row.processingTransactionIds||[]),String(result.transactionId)])];
          row.processingTransactionId=String(result.transactionId);
          row.createdBatchIds=[...new Set([...(row.createdBatchIds||[]),...(result.createdBatchIds||[])])];
          row.outputQuantities=row.outputQuantities||{};
          for(const [outputId,amount] of Object.entries(result.outputQuantities||{}))
            row.outputQuantities[outputId]=(num(row.outputQuantities[outputId])||0)+(num(amount)||0);
          row.lastProcessingTurn=turn();row.status='PROCESSED';
          addFlowStage(row,'PROCESSING','COMPLETED',{transactionId:result.transactionId,inputQuantity:result.inputQuantity,resumedFromFactoryInput:true});
          addFlowStage(row,'FINISHED_GOODS','AVAILABLE',{transactionId:result.transactionId,createdBatchIds:result.createdBatchIds||[],outputQuantities:result.outputQuantities||{},resumedFromFactoryInput:true});
        });
        for(const shipment of n.shipments.filter(x=>String(x.batchId||'')===sourceBatchId)){
          shipment.processingStatus='PROCESSED';shipment.processingTransactionId=result.transactionId;shipment.processing=clone(result);
          shipment.processedTurn=turn();shipment.createdBatchIds=[...new Set([...(shipment.createdBatchIds||[]),...(result.createdBatchIds||[])])];
        }
        for(const delivery of n.deliveries.filter(x=>String(x.batchId||'')===sourceBatchId)){
          delivery.processingStatus='PROCESSED';delivery.processingTransactionId=result.transactionId;delivery.processing=clone(result);
          delivery.processedTurn=turn();delivery.createdBatchIds=[...new Set([...(delivery.createdBatchIds||[]),...(result.createdBatchIds||[])])];
        }
        emit('OMEGA_RESOURCE_SITE_FLOW_PROCESSED',cid,{siteId:siteFlowRows(cid).find(x=>String(x.batchId)===sourceBatchId)?.siteId||null,
          batchId:sourceBatchId,resourceId:rid,transactionId:result.transactionId,createdBatchIds:result.createdBatchIds||[],
          outputQuantities:result.outputQuantities||{},turn:turn(),status:'PROCESSED'},'resource-industrial-network');
      }
    }else blocked.push({factoryId:fid,resourceId:rid,reason:result?.reason||result?.status||'FACTORY_INPUT_PROCESSING_FAILED',detail:result||null});
  }
  return{status:blocked.length?'DEGRADED':'COMPLETED',countryId:cid,turn:turn(),processedCount:processed.length,processed,blocked};
}
function ensureSimulationFactory(cid,site,resourceId,quantity){
  const existing=candidateFactories(cid,resourceId);
  if(existing.length)return{status:'EXISTING',factory:existing[0].asset};
  const recipe=recipeFor(resourceId,{});
  if(!Object.keys(recipe.inputs||{}).length||!Object.keys(recipe.outputs||{}).length)return{status:'BLOCKED',reason:'NO_FACTORY_RECIPE'};
  const economy=econState(cid);if(!Array.isArray(economy.productionAssets))economy.productionAssets=[];
  // A site may expose more than one commodity stream. Keep simulation factories resource-specific,
  // otherwise the first commodity bootstrapped for a site can make later commodities look incapable.
  const assets=economy.productionAssets,factoryId='FAC-SIM:'+cid+':'+String(site.siteId).replace(/[^A-Za-z0-9_-]/g,'_')+':'+tok(resourceId);
  let factory=assets.find(a=>String(a?.id||a?.assetId||a?.projectId)===factoryId);
  if(!factory){
    factory={id:factoryId,countryId:cid,siteId:null,sourceSiteId:site.siteId,stage:'PROCESSING',factoryType:recipe.factoryType||'RESOURCE_PROCESSING_PLANT',
      status:'OPERATIONAL',capacity:Math.max(1,num(quantity)||1),inputCoefficients:clone(recipe.inputs),outputProfile:clone(recipe.outputs),
      inputInventory:{},inputBatchLots:[],companyId:'SIM-COMPANY:'+cid,ownerCompanyId:'SIM-COMPANY:'+cid,
      transportAccess:['truck','rail','ship','pipeline'],locationNodeKey:'FACTORY:'+cid+':'+site.siteId,
      simulationOnly:true,authority:'SIMULATED_GAMEPLAY_BOOTSTRAP',bootstrapReason:'NO_EXISTING_COMPATIBLE_FACTORY'}
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
  const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const siteGate=strategicPolicy?.siteAvailableForExtraction?.(cid,site.siteId,site);
  if(siteGate&&!siteGate.allowed)return{status:'BLOCKED',reason:siteGate.reason||'SITE_EXPLORATION_GATE_BLOCKED',siteId:site.siteId,countryId:cid};
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
  // Prefer a structured source occurrence only when its source deposit name is the
  // same physical site, not merely a fuzzy-linked region with the same commodity.
  // Example: "Barapukuria Coal Mine" matches exactly; "Pilbara Hamersley Province"
  // must not swallow the distinct "Pilbara Iron Ore Range" gameplay site.
  const identityWords=value=>{
    const ignored=new Set(['site','mine','field','quarry','facility','deposit','orebody','area','zone','complex','project']);
    return [...new Set(String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ')
      .trim().split(/\s+/).filter(x=>x.length>1&&!ignored.has(x)))].sort().join(' ');
  };
  const depositRows=Array.isArray((g.ResourceMinistryEngine||g.OmegaResourceMinistryEngine||g.Omega?.ResourceMinistryEngine)?.deposits)?
    (g.ResourceMinistryEngine||g.OmegaResourceMinistryEngine||g.Omega?.ResourceMinistryEngine).deposits:[];
  const exactSiteName=identityWords(site.siteName);
  const sourceDepositKeys=matchingKeys.filter(key=>{
    const row=mineStates[key]||{},depositKey=String(row.depositKey||'').trim();
    if(!String(key).startsWith('OCC:')||!depositKey||/^SIM(?:_|$)/i.test(depositKey))return false;
    const source=depositRows.find(x=>[x?.id,x?.depositId,x?.mineId].some(v=>String(v||'').trim()===depositKey));
    const sourceName=source?.name||source?.depositName||row.siteName||row.depositName||'';
    return !!exactSiteName&&identityWords(sourceName)===exactSiteName;
  });
  const keys=sourceDepositKeys.length?sourceDepositKeys:
    (dedicatedSiteKeys.length?dedicatedSiteKeys:(matchingKeys.length?matchingKeys:(stateBoundKeys.length?stateBoundKeys:(referenceResource===rid?linkedKeys:[]))));
  if(!keys.length)return{status:'BLOCKED',reason:linkedKeys.length?'SITE_RESOURCE_OCCURRENCE_NOT_FOUND':'SITE_HAS_NO_EXECUTABLE_OCCURRENCE',siteId:site.siteId,countryId:cid,resourceId:rid,controllerStatus:controller?.controllerStatus||null,linkedOccurrenceCount:linkedKeys.length,siteStateOccurrenceCount:stateBoundKeys.length,referenceResource:referenceResource||null};
  const already=netState(cid).siteExecutions||[];
  const duplicate=already.find(x=>x.siteId===site.siteId&&Number(x.turn)===turn()&&x.status!=='FAILED');
  if(duplicate)return{status:'BLOCKED',reason:'SITE_ALREADY_EXECUTED_THIS_TURN',existingExecutionId:duplicate.executionId,siteId:site.siteId};
  const extraction=await endowment.extractCountry(cid,keys);
  const records=extraction?.result?.records||extraction?.records||[];
  const record=records.find(x=>keys.includes(String(x?.occurrenceKey||''))&&canonicalCountry(x?.countryId||cid)===cid&&x?.producedBatch);
  if(extraction?.status!=='APPLIED'||extraction?.result?.accepted===false||!record){
    return{status:'BLOCKED',reason:'SITE_EXTRACTION_NOT_COMMITTED',siteId:site.siteId,occurrenceKeys:keys,extractionStatus:extraction?.status||null,detail:extraction?.reason||extraction?.detail||extraction?.result?.error||extraction?.result?.blocked||extraction?.result?.reason||null};
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
  const sent=dispatchShipment({countryId:cid,siteId:site.siteId,resourceId:rid,quantity,unit:batch.unit||'TONNES',transportMode:input.transportMode,
    factoryId:String(factoryChoice.id||factoryChoice.assetId||factoryChoice.projectId),batchId:batch.batchId,occurrenceKey:record.occurrenceKey,warehouseId:batch.warehouseId||('WH-'+cid+'-RAW')});
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

function gameplayPipelineDiagnostics(){
  const sites=masterSites(),countries=runtimeCountryIds();
  const isCurrentlyBlocked=flow=>{
    const status=String(flow?.status||'').toUpperCase();
    return status.includes('BLOCKED')||status==='PUBLICATION_ATTEMPTED'||
      status==='EXTRACTED_AWAITING_ROUTE'||status==='EXTRACTED_AWAITING_FACTORY';
  };
  const perCountry=countries.map(c=>{
    const rs=resourceState(c),flows=siteFlowRows(c),network=netState(c),stages={};
    for(const flow of flows)for(const step of flow.stages||[])stages[step.stage]=(stages[step.stage]||0)+1;
    return{countryId:c,registrySiteCount:sites.filter(x=>canonicalCountry(x.countryId)===c).length,
      extractionFlows:flows.length,dispatched:flows.filter(x=>(x.stages||[]).some(s=>s.stage==='TRANSPORT'&&['IN_TRANSIT','DELIVERED'].includes(s.status))).length,
      processed:flows.filter(x=>(x.stages||[]).some(s=>s.stage==='PROCESSING'&&s.status==='COMPLETED')).length,
      marketPublished:flows.filter(x=>(x.stages||[]).some(s=>s.stage==='MARKET'&&s.status==='PUBLISHED')).length,
      treasuryReceipts:flows.reduce((n,x)=>n+(x.treasurySettlements||[]).length,0),
      blocked:flows.filter(isCurrentlyBlocked).length,
      blockedFlows:flows.filter(isCurrentlyBlocked)
        .map(x=>({siteId:x.siteId,resourceId:x.resourceId,batchId:x.batchId,status:x.status,blockReason:x.blockReason||x.lastResidualBlockReason||null,
          stages:(x.stages||[]).filter(s=>['BLOCKED','RESIDUAL_BLOCKED'].includes(s.status)).map(s=>({stage:s.stage,status:s.status,reason:s.reason||null,detail:s.detail||null}))})),
      shipmentCount:network.shipments.length,stages};
  });
  return{contract:'OMEGA_SITE_FLOW_PIPELINE_V1',version:VERSION,turn:turn(),registrySiteCount:sites.length,countryCount:countries.length,
    flowCount:perCountry.reduce((n,x)=>n+x.extractionFlows,0),dispatched:perCountry.reduce((n,x)=>n+x.dispatched,0),
    processed:perCountry.reduce((n,x)=>n+x.processed,0),marketPublished:perCountry.reduce((n,x)=>n+x.marketPublished,0),
    treasuryReceipts:perCountry.reduce((n,x)=>n+x.treasuryReceipts,0),blocked:perCountry.reduce((n,x)=>n+x.blocked,0),perCountry};
}
function api(){
  return Object.freeze({VERSION,loadCatalog,planExtraction,planShipment,dispatchShipment,advanceShipments,startFactoryProject,startInfrastructureProject,startPadmaCorridorProject,advanceProjects,startTechnologyProject,executeFactoryCycle,executeSitePipeline,diagnostics,gameplayPipelineDiagnostics,normalizeInfrastructure,candidateFactories,recipeFor,processPendingFactoryInputs,resourceMethod,buildRoute});
}
g.Omega=g.Omega||{};g.Omega.ResourceIndustrialNetwork=api();g.OmegaResourceIndustrialNetwork=g.Omega.ResourceIndustrialNetwork;

function boot(){
  loadCatalog().then(()=>{emit('OMEGA_RESOURCE_INDUSTRIAL_NETWORK_READY','GLOBAL',{version:VERSION,catalogResourceRules:Object.keys(rules()).length,factoryRules:Object.keys(processRules()).length})}).catch(()=>{});
  if(typeof g.addEventListener==='function'){
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',()=>{
      const countries=runtimeCountryIds();
      countries.forEach(c=>{try{processPendingFactoryInputs(c);advanceShipments(c);advanceProjects(c)}catch(_){}});
    });
    g.addEventListener('OMEGA_RESOURCE_EXTRACTION_COMPLETED',onExtractionCommitted);
    g.addEventListener('OMEGA_RESOURCE_EXTRACTION_BLOCKED',onExtractionBlocked);
    g.addEventListener('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',onFinishedGoodsRegistered);
    g.addEventListener('OMEGA_RESOURCE_FINISHED_GOODS_ECONOMY_REGISTERED',onEconomyMarketPublication);
    g.addEventListener('OMEGA_RESOURCE_DOMESTIC_SALE_SETTLED',onDomesticSaleSettled);
    g.addEventListener('OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED',onExtractionFiscalPosted);
    g.addEventListener('OMEGA_RESOURCE_TRADE_RECONCILED',onTreasurySettlement);
    g.addEventListener('OMEGA_READY',()=>loadCatalog());
    g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>loadCatalog());
  }
}
boot();

})(typeof window!=='undefined'?window:globalThis);
