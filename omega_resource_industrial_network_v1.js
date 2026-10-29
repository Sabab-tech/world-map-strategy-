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
const daysPerTurn=()=>{
  const clock=g.Omega?.Simulation?.clock;
  const explicit=num(clock?.gameDaysPerTurn??clock?.daysPerTurn);
  if(explicit!==null&&explicit>0)return explicit;
  // stepDurationMs paces real-time ticks; OMEGA advances one in-game day per central turn by default.
  if(num(clock?.stepDurationMs)!==null)return 1;
  return Math.max(1/86400000,num(state()?.simulation?.daysPerTurn??state()?.simulation?.turnDays)??1);
};
const year=()=>{const d=state()?.simulation?.date;if(d){const y=num(String(d).slice(0,4));if(y!==null)return y;}return num(state()?.simulation?.startYear)??2015};
function factoryDateOnly(value){
  const m=String(value??'').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m)return null;
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  const check=new Date(Date.UTC(y,mo-1,d));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d)return null;
  return m[1]+'-'+m[2]+'-'+m[3];
}
function factoryCurrentGameDate(){
  const s=state()||{},sim=s.simulation||{};
  const direct=factoryDateOnly(sim.date||sim.currentDate||sim.gameDate||s.gameDate||s.date);
  if(direct)return direct;
  const base=String(num(sim.startYear)??year()).slice(0,4)+'-01-01';
  return factoryAddGameDays(base,Math.max(0,turn()-1));
}
function factoryAddGameDays(date,days){
  const iso=factoryDateOnly(date),n=num(days);
  if(!iso||n===null)return null;
  const parts=iso.split('-').map(Number),d=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
  d.setUTCDate(d.getUTCDate()+Math.round(n));
  return d.getUTCFullYear().toString().padStart(4,'0')+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
}
function factoryAddCalendarMonths(date,months){
  const iso=factoryDateOnly(date),n=num(months);
  if(!iso||n===null)return null;
  const [y,m,d]=iso.split('-').map(Number),first=new Date(Date.UTC(y,m-1+Math.trunc(n),1));
  const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  first.setUTCDate(Math.min(d,lastDay));
  return first.getUTCFullYear().toString().padStart(4,'0')+'-'+String(first.getUTCMonth()+1).padStart(2,'0')+'-'+String(first.getUTCDate()).padStart(2,'0');
}
function factoryCalendarDaysBetween(start,end){
  const a=factoryDateOnly(start),b=factoryDateOnly(end);
  if(!a||!b)return null;
  const pa=a.split('-').map(Number),pb=b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0],pb[1]-1,pb[2])-Date.UTC(pa[0],pa[1]-1,pa[2]))/86400000);
}
function factoryDateReached(now,target){
  const a=factoryDateOnly(now),b=factoryDateOnly(target);
  return !!(a&&b&&a>=b);
}

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
let siteLogisticsManifest=null,siteLogisticsManifestPromise=null;
let siteLogisticsActiveCountry=null,siteLogisticsRouteMap=new Map(),siteLogisticsCountryLoadPromise=null;
const pendingSiteLogisticsBatches=new Set();
async function loadSiteLogisticsRoutes(countryId){
  const cid=canonicalCountry(countryId);
  if(!cid||!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'LOGISTICS_COUNTRY_INVALID',countryId:cid||null};
  const selected=playerSimulationCountryId();
  if(selected&&selected!==cid)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:selected};
  if(siteLogisticsActiveCountry===cid)return{status:'READY',countryId:cid,routeCount:siteLogisticsRouteMap.size,reused:true};
  if(siteLogisticsCountryLoadPromise?.countryId===cid)return siteLogisticsCountryLoadPromise.promise;
  const promise=(async()=>{
    try{
      if(!siteLogisticsManifest){
        if(siteLogisticsManifestPromise)siteLogisticsManifest=await siteLogisticsManifestPromise;
        else{
          siteLogisticsManifestPromise=(async()=>{
            const inline=g.OmegaResourceSiteLogisticsRoutesManifestData||g.Omega?.ResourceSiteLogisticsRoutesManifestData;
            if(inline)return inline;
            if(typeof fetch!=='function')throw new Error('SITE_LOGISTICS_FETCH_UNAVAILABLE');
            const response=await fetch('resource_site_logistics_routes_v1.json',{cache:'no-store'});
            if(!response?.ok)throw new Error('SITE_LOGISTICS_MANIFEST_FETCH_FAILED');
            return await response.json();
          })();
          try{siteLogisticsManifest=await siteLogisticsManifestPromise;}
          finally{siteLogisticsManifestPromise=null;}
        }
      }
      const partNumber=siteLogisticsManifest?.countryToPart?.[cid];
      if(partNumber===undefined||partNumber===null){
        const framework=siteLogisticsManifest?.countryFramework;
        const countryIds=Array.isArray(framework?.countryIds)?framework.countryIds:[];
        if(countryIds.includes(cid)){
          // A core country can have zero registered physical mine sites. It still uses
          // this same logistics engine; an empty site map is not a missing-country failure.
          // Do not synthesize mine routes for countries whose resource registry has none.
          siteLogisticsRouteMap=new Map();
          siteLogisticsActiveCountry=cid;
          return{status:'READY',countryId:cid,routeCount:0,part:null,source:null,
            noRegisteredSiteRoutes:true,frameworkAuthority:framework.authority||'CORE_COUNTRY_ROSTER_MANIFEST_V1',
            authority:siteLogisticsManifest.authority||'SCENARIO_LOGISTICS_DESIGN_ONLY'};
        }
        return{status:'NOT_FOUND',reason:'COUNTRY_NOT_IN_SITE_LOGISTICS_MANIFEST',countryId:cid};
      }
      const partInfo=(siteLogisticsManifest.parts||[]).find(part=>Number(part.part)===Number(partNumber)||String(part.file||'')===String(partNumber));
      if(!partInfo?.file)return{status:'FAILED',reason:'COUNTRY_ROUTE_SHARD_NOT_DECLARED',countryId:cid,partNumber};
      if(typeof fetch!=='function')return{status:'FAILED',reason:'SITE_LOGISTICS_FETCH_UNAVAILABLE',countryId:cid};
      const response=await fetch(partInfo.file,{cache:'no-store'});
      if(!response?.ok)throw new Error('SITE_LOGISTICS_COUNTRY_SHARD_FETCH_FAILED:'+partInfo.file);
      const shard=await response.json();
      const routes=Array.isArray(shard?.routes)?shard.routes.filter(route=>canonicalCountry(route?.countryId)===cid&&route?.siteId):[];
      const selectedAfterLoad=playerSimulationCountryId();
      if(selectedAfterLoad&&selectedAfterLoad!==cid)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:selectedAfterLoad};
      siteLogisticsRouteMap=new Map(routes.map(route=>[String(route.siteId),route]));
      siteLogisticsActiveCountry=cid;
      for(const route of routes){const runtime=siteLogisticsState(cid,route.siteId,route);if(runtime&&!runtime.stages.length)appendSiteLogisticsStage(runtime,'LIFECYCLE','IDLE',{selectedCountryId:cid,routeReady:true,automaticProcessing:false});}
      return{status:'READY',countryId:cid,routeCount:siteLogisticsRouteMap.size,part:partInfo.part,
        source:partInfo.file,authority:siteLogisticsManifest.authority||'SCENARIO_LOGISTICS_DESIGN_ONLY'};
    }catch(error){return{status:'FAILED',reason:String(error?.message||error),countryId:cid};}
  })();
  siteLogisticsCountryLoadPromise={countryId:cid,promise};
  try{return await promise;}
  finally{if(siteLogisticsCountryLoadPromise?.promise===promise)siteLogisticsCountryLoadPromise=null;}
}
function siteLogisticsRouteFor(countryId,siteId){
  const cid=canonicalCountry(countryId);
  if(!cid||siteLogisticsActiveCountry!==cid)return null;
  return siteLogisticsRouteMap.get(String(siteId||''))||null;
}
function siteLogisticsState(countryId,siteId,route=null){
  const cid=canonicalCountry(countryId),net=netState(cid);
  if(!net.siteLogisticsBySiteId||typeof net.siteLogisticsBySiteId!=='object'||Array.isArray(net.siteLogisticsBySiteId))net.siteLogisticsBySiteId={};
  const sid=String(siteId||'').trim();
  if(!sid)return null;
  let row=net.siteLogisticsBySiteId[sid];
  if(!row||typeof row!=='object'||Array.isArray(row)){
    row=net.siteLogisticsBySiteId[sid]={schemaVersion:'OMEGA_MINE_SITE_LOGISTICS_V1',siteId:sid,countryId:cid,
      routeId:route?.routeId||null,resourceId:route?.resourceId||null,status:'IDLE',currentStage:'IDLE',runtimeActive:false,activeShipmentId:null,activeShipmentIds:[],activeShipments:[],blockedShipments:[],shipmentIds:[],warehouseReceiptIds:[],
      dispatchedQuantity:0,receivedQuantity:0,factoryDispatchedQuantity:0,factoryReceivedQuantity:0,stages:[],createdTurn:turn(),lastUpdatedTurn:turn(),
      authority:'OMEGA_RESOURCE_SITE_LOGISTICS_RUNTIME',routeAuthority:route?.provenance?.authority||'SCENARIO_LOGISTICS_DESIGN_ONLY'};
  }
  if(route){row.routeId=route.routeId||row.routeId;row.resourceId=route.resourceId||row.resourceId;row.routeProfile=clone(route);}
  if(row.activeShipmentId===undefined)row.activeShipmentId=null;
  if(!Array.isArray(row.activeShipmentIds))row.activeShipmentIds=row.activeShipmentId?[String(row.activeShipmentId)]:[];
  if(!Array.isArray(row.activeShipments))row.activeShipments=row.activeShipmentIds.map(shipmentId=>({shipmentId:String(shipmentId),stage:String(row.currentStage||'IN_TRANSIT')}));
  if(!Array.isArray(row.blockedShipments))row.blockedShipments=[];
  if(typeof row.runtimeActive!=='boolean')row.runtimeActive=row.activeShipments.length>0;
  if(!row.currentStage)row.currentStage=String(row.status||'IDLE');
  if(!Array.isArray(row.shipmentIds))row.shipmentIds=[];
  if(!Array.isArray(row.warehouseReceiptIds))row.warehouseReceiptIds=[];
  if(!Array.isArray(row.stages))row.stages=[];
  return row;
}
function appendSiteLogisticsStage(siteState,stage,status,details={}){
  if(!siteState)return;
  siteState.stages=Array.isArray(siteState.stages)?siteState.stages:[];
  siteState.stages.push({stage,status,turn:turn(),gameDate:factoryCurrentGameDate(),...clone(details)});
  siteState.stages=siteState.stages.slice(-256);siteState.status=status;siteState.lastUpdatedTurn=turn();
}
function trackActiveSiteShipment(siteState,shipmentId,stage='IN_TRANSIT'){
  if(!siteState)return;
  const rows=Array.isArray(siteState.activeShipments)?siteState.activeShipments.slice():[];
  const ids=new Set(rows.map(row=>String(row?.shipmentId||'')));
  const legacyIds=Array.isArray(siteState.activeShipmentIds)?siteState.activeShipmentIds.map(String):[];
  if(siteState.activeShipmentId&&!ids.has(String(siteState.activeShipmentId)))legacyIds.push(String(siteState.activeShipmentId));
  for(const id of legacyIds)if(id&&!ids.has(id)){rows.push({shipmentId:id,stage:String(siteState.currentStage||'IN_TRANSIT')});ids.add(id);}
  const id=String(shipmentId||'').trim(),targetStage=String(stage||'IN_TRANSIT');
  if(id){const prior=rows.find(row=>String(row?.shipmentId||'')===id);if(prior)prior.stage=targetStage;else rows.push({shipmentId:id,stage:targetStage});}
  siteState.activeShipments=rows;siteState.activeShipmentIds=rows.map(row=>String(row.shipmentId));
  siteState.activeShipmentId=rows.length?String(rows[rows.length-1].shipmentId):null;
  siteState.runtimeActive=rows.length>0;siteState.currentStage=rows.length?String(rows[rows.length-1].stage):String(siteState.currentStage||'IDLE');
  siteState.lastUpdatedTurn=turn();
}
function closeActiveSiteShipment(siteState,shipmentId){
  if(!siteState)return;
  const rows=Array.isArray(siteState.activeShipments)?siteState.activeShipments.slice():[];
  if(!rows.length){
    const ids=Array.isArray(siteState.activeShipmentIds)?siteState.activeShipmentIds.map(String):[];
    if(siteState.activeShipmentId&&!ids.includes(String(siteState.activeShipmentId)))ids.push(String(siteState.activeShipmentId));
    for(const id of ids)rows.push({shipmentId:id,stage:String(siteState.currentStage||'IN_TRANSIT')});
  }
  const id=String(shipmentId||'').trim();
  siteState.activeShipments=rows.filter(row=>String(row?.shipmentId||'')!==id);
  siteState.activeShipmentIds=siteState.activeShipments.map(row=>String(row.shipmentId));
  siteState.activeShipmentId=siteState.activeShipments.length?String(siteState.activeShipments[siteState.activeShipments.length-1].shipmentId):null;
  siteState.runtimeActive=siteState.activeShipments.length>0;
  siteState.currentStage=siteState.activeShipments.length?String(siteState.activeShipments[siteState.activeShipments.length-1].stage):String(siteState.currentStage||'IDLE');
  siteState.lastUpdatedTurn=turn();
}
function recordSiteLogisticsBlock(countryId,siteId,batchId,route,reason,waitingForCapacity=false,shipmentId=null){
  const cid=canonicalCountry(countryId),runtime=siteLogisticsState(cid,siteId,route);
  if(!runtime)return null;
  const bid=String(batchId||'').trim(),why=String(reason||'MINE_LOGISTICS_DISPATCH_BLOCKED');
  runtime.blockedShipments=Array.isArray(runtime.blockedShipments)?runtime.blockedShipments.filter(item=>String(item?.batchId||'')!==bid):[];
  runtime.blockedShipments.push({batchId:bid,reason:why,waitingForCapacity:!!waitingForCapacity,shipmentId:shipmentId||null,turn:turn()});
  if(shipmentId)trackActiveSiteShipment(runtime,shipmentId,'BLOCKED_ROUTE_BLOCKADE');
  const active=Array.isArray(runtime.activeShipments)?runtime.activeShipments:[];
  const moving=active.some(item=>String(item?.stage||'')!=='BLOCKED_ROUTE_BLOCKADE');
  if(!moving){
    runtime.status=waitingForCapacity?'AWAITING_CAPACITY':'BLOCKED_ROUTE';
    runtime.currentStage=waitingForCapacity?'AWAITING_CAPACITY':'BLOCKED_ROUTE';
  }
  runtime.lastBlockReason=why;
  runtime.stages=Array.isArray(runtime.stages)?runtime.stages:[];
  runtime.stages.push({stage:'MINE_TO_WAREHOUSE',status:waitingForCapacity?'AWAITING_CAPACITY':'BLOCKED',
    turn:turn(),gameDate:factoryCurrentGameDate(),batchId:bid,reason:why,shipmentId:shipmentId||null,
    routeId:route?.routeId||runtime.routeId||null});
  runtime.stages=runtime.stages.slice(-256);runtime.lastUpdatedTurn=turn();
  return runtime;
}
function clearSiteLogisticsBlock(runtime,batchId){
  if(!runtime)return;
  const bid=String(batchId||'').trim();
  runtime.blockedShipments=(Array.isArray(runtime.blockedShipments)?runtime.blockedShipments:[])
    .filter(item=>String(item?.batchId||'')!==bid);
  if(!runtime.blockedShipments.length)delete runtime.lastBlockReason;
  if(!runtime.blockedShipments.length&&['AWAITING_CAPACITY','BLOCKED_ROUTE'].includes(String(runtime.status||''))){
    const active=Array.isArray(runtime.activeShipments)?runtime.activeShipments:[];
    const latest=active.length?active[active.length-1]:null;
    runtime.currentStage=latest?String(latest.stage||'IN_TRANSIT'):'READY';
    runtime.status=latest
      ?(String(latest.stage)==='RAW_TO_FACTORY'?'IN_TRANSIT_TO_FACTORY':'IN_TRANSIT_TO_WAREHOUSE')
      :'READY';
    runtime.runtimeActive=active.length>0;
  }
  runtime.lastUpdatedTurn=turn();
}
function logisticsUnitDescriptor(value){
  let raw=tok(value);
  raw=raw.replace(/_(per_day|per_year|daily|annual|yearly|year|day)$/,'');
  raw=raw.replace(/^raw_cargo_/,'');
  if(/^(metric_)?ton(ne|nes|s)$/.test(raw)||/metric_(ton|tonne)/.test(raw))return{family:'MASS',toTonnes:1,canonicalUnit:'TONNES'};
  if(/^(kg|kilogram|kilograms)$/.test(raw))return{family:'MASS',toTonnes:0.001,canonicalUnit:'TONNES'};
  if(/^(lb|lbs|pound|pounds)$/.test(raw)||raw.startsWith('million_pounds'))return{family:'MASS',toTonnes:raw.startsWith('million_pounds')?453.59237:0.00045359237,canonicalUnit:'TONNES'};
  if(raw.includes('troy_ounce')||raw==='ozt')return{family:'MASS',toTonnes:0.0000311034768,canonicalUnit:'TONNES'};
  if(raw==='carat'||raw==='carats'||raw==='ct')return{family:'MASS',toTonnes:0.0000002,canonicalUnit:'TONNES'};
  if(raw==='mmcf'||raw==='million_cubic_feet')return{family:'GAS_VOLUME',toMMCF:1,canonicalUnit:'MMCF'};
  if(raw==='mcf'||raw==='thousand_cubic_feet')return{family:'GAS_VOLUME',toMMCF:0.001,canonicalUnit:'MMCF'};
  if(raw==='million_cubic_metres'||raw==='mcm')return{family:'GAS_VOLUME',toMMCF:35.3146667,canonicalUnit:'MMCF'};
  if(raw==='bbl'||raw==='barrel'||raw==='barrels')return{family:'OIL_VOLUME',toBarrels:1,canonicalUnit:'BARRELS'};
  if(raw==='litre'||raw==='litres'||raw==='liter'||raw==='liters'||raw==='m3'||raw==='cubic_metre'||raw==='cubic_metres')return{family:'LIQUID_VOLUME',toCubicMetres:raw==='m3'||raw.startsWith('cubic_')?1:0.001,canonicalUnit:'M3'};
  if(raw)return{family:'SIMULATION_RESOURCE_UNIT:'+raw,toSimulationUnit:1,canonicalUnit:raw.toUpperCase()};
  return null;
}
function siteLogisticsUnitBridge(route,batchUnit){
  const sourceUnit=batchUnit||route?.quantityUnitBridge?.sourceProductionUnit||null;
  const source=logisticsUnitDescriptor(sourceUnit);
  const capacityUnit=route?.quantityUnitBridge?.cargoCapacityUnit||route?.routePlan?.legs?.[0]?.designCapacityUnit||null;
  const target=logisticsUnitDescriptor(capacityUnit);
  if(source&&target&&source.family===target.family){
    let factor=1;
    if(source.family==='MASS')factor=source.toTonnes/target.toTonnes;
    else if(source.family==='GAS_VOLUME')factor=source.toMMCF/target.toMMCF;
    else if(source.family==='OIL_VOLUME')factor=source.toBarrels/target.toBarrels;
    else if(source.family==='LIQUID_VOLUME')factor=source.toCubicMetres/target.toCubicMetres;
    if(Number.isFinite(factor)&&factor>0)return{status:'READY',sourceUnit:sourceUnit||null,targetUnit:capacityUnit||null,
      sourceToCapacityFactor:factor,authority:'CANONICAL_UNIT_FAMILY_CONVERSION',simulationOnly:false};
  }
  // Unknown or semantically specialized production units must remain usable in game without
  // being falsely labeled as physical conversions. This bridge is explicitly simulation-only.
  return{status:'SIMULATION_ONLY',sourceUnit:sourceUnit||'UNOBSERVED',targetUnit:capacityUnit||'SIMULATION_RESOURCE_UNIT',
    sourceToCapacityFactor:1,authority:'SIMULATED_RESOURCE_UNIT_CAPACITY_BRIDGE',simulationOnly:true,
    reason:route?.quantityUnitBridge?.status||'SOURCE_UNIT_NOT_COMPARABLE_TO_DESIGN_CARGO_UNIT'};
}
function recomputeSiteLogisticsTradeAvailability(rs){
  const inventory=rs?.inventory&&typeof rs.inventory==='object'?rs.inventory:{};
  const strategic=rs?.strategicReserve?.availableByResource&&typeof rs.strategicReserve.availableByResource==='object'?rs.strategicReserve.availableByResource:{};
  const out={};
  for(const [key,value] of Object.entries(inventory)){const amount=num(value);if(amount!==null)out[key]=Math.max(0,amount-(num(strategic[key])??0));}
  for(const [key,value] of Object.entries(strategic))if(out[key]===undefined)out[key]=Math.max(0,(num(inventory[key])??0)-(num(value)??0));
  rs.tradeAvailability=out;
}
function dispatchMineToWarehouse(countryId,site,flow,sourceBatch,routeProfile){
  const cid=canonicalCountry(countryId),rid=tok(routeProfile?.resourceId||flow?.resourceId||sourceBatch?.resourceId),siteId=String(site?.siteId||flow?.siteId||routeProfile?.siteId||'');
  if(!cid||!/^[A-Z]{3}$/.test(cid)||!siteId||canonicalCountry(routeProfile?.countryId)!==cid||String(routeProfile?.siteId||'')!==siteId)
    return{status:'BLOCKED',reason:'MINE_ROUTE_IDENTITY_MISMATCH',countryId:cid,siteId};
  const player=playerSimulationCountryId();
  if(!player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_NOT_SELECTED',countryId:cid};
  if(player!==cid)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:player};
  const rs=resourceState(cid),network=netState(cid),batchId=String(sourceBatch?.batchId||flow?.batchId||'');
  if(!batchId||!Array.isArray(rs.batches)||!rs.batches.some(batch=>String(batch?.batchId||'')===batchId))
    return{status:'BLOCKED',reason:'SOURCE_BATCH_NOT_FOUND',batchId};
  const active=network.shipments.find(item=>String(item?.batchId||'')===batchId&&item.shipmentType==='MINE_TO_WAREHOUSE'&&
    ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(item?.status||'')));
  if(active)return{status:'DISPATCHED',shipment:active,idempotent:true};
  const siteRuntime=siteLogisticsState(cid,siteId,routeProfile);
  const remainingInBatch=Math.max(0,num(sourceBatch.remainingQuantity!=null?sourceBatch.remainingQuantity:sourceBatch.quantity)||0);
  const stockAlreadyHeld=flow?.mineLogisticsStockDebited===true;
  const remainingAtMine=stockAlreadyHeld
    ?Math.max(0,num(flow?.mineHeldQuantity)||0)
    :remainingInBatch;
  const remaining=Math.min(remainingAtMine,remainingInBatch);
  if(remaining<=1e-9)return{status:'EMPTY',reason:'NO_UNSHIPPED_MINE_BATCH_REMAINDER',batchId};
  const w=rs.warehouse||{},availableMap=w.availableByResource&&typeof w.availableByResource==='object'?w.availableByResource:{};
  const reservedMap=w.reservedByResource&&typeof w.reservedByResource==='object'?w.reservedByResource:{};
  const inventory=rs.inventory&&typeof rs.inventory==='object'?rs.inventory:{};
  const inventoryKey=quantityObjectKey(inventory,rid)||rid,warehouseKey=quantityObjectKey(availableMap,rid)||rid,reservedKey=quantityObjectKey(reservedMap,rid)||rid;
  const inventoryAvailable=Math.max(0,num(inventory[inventoryKey])||0);
  const warehouseFree=Math.max(0,(num(availableMap[warehouseKey])||0)-(num(reservedMap[reservedKey])||0));
  const stockToHold=stockAlreadyHeld?0:remainingInBatch;
  // Once a source batch uses the physical mine-haul leg, its complete unshipped balance
  // must leave aggregate warehouse/trade availability. Debit it exactly once, then restore
  // only each individually receipted portion. This prevents residual cargo being sold or
  // dispatched straight to a factory while it is still physically at the mine.
  if(stockToHold>1e-9){
    if(inventoryAvailable+1e-6<stockToHold||warehouseFree+1e-6<stockToHold)
      return{status:'BLOCKED',reason:'MINE_SOURCE_BATCH_STOCK_RECONCILIATION_FAILED',batchId,
        inventoryAvailable,warehouseFree,requiredStockToHold:stockToHold};
    inventory[inventoryKey]=Number(Math.max(0,inventoryAvailable-stockToHold).toFixed(6));
    availableMap[warehouseKey]=Number(Math.max(0,(num(availableMap[warehouseKey])||0)-stockToHold).toFixed(6));
    if(inventory[inventoryKey]<1e-8)inventory[inventoryKey]=0;
    if(availableMap[warehouseKey]<1e-8)availableMap[warehouseKey]=0;
    flow.mineLogisticsStockDebited=true;flow.mineLogisticsStockDebitedQuantity=stockToHold;
    flow.mineHeldQuantity=stockToHold;flow.mineLogisticsStockDebitedTurn=turn();
    const batchInMine=Array.isArray(rs.batches)?rs.batches.find(batch=>String(batch?.batchId||'')===batchId):null;
    if(!batchInMine)return{status:'BLOCKED',reason:'SOURCE_BATCH_NOT_FOUND',batchId};
    batchInMine.sourceWarehouseId=batchInMine.sourceWarehouseId||batchInMine.warehouseId||('WH-'+cid+'-RAW');
    batchInMine.destinationWarehouseId='WH-'+cid+'-RAW';batchInMine.warehouseId=null;
    batchInMine.stage='MINE_AWAITING_HAUL';batchInMine.status='AVAILABLE_AT_MINE_PENDING_HAUL';
    batchInMine.locationNodeKey='MINE_SITE:'+siteId;batchInMine.currentLocationNodeId=siteId;
    if(rs.inventoryLots?.[batchId]){
      const lot=rs.inventoryLots[batchId];
      lot.sourceWarehouseId=lot.sourceWarehouseId||lot.warehouseId||('WH-'+cid+'-RAW');
      lot.destinationWarehouseId='WH-'+cid+'-RAW';lot.warehouseId=null;
      lot.stage='MINE_AWAITING_HAUL';lot.status='AVAILABLE_AT_MINE_PENDING_HAUL';lot.locationNodeKey='MINE_SITE:'+siteId;
    }
    // This is a physical location change, not a destruction or new receipt.
    if(Array.isArray(w.storedBatchIds))w.storedBatchIds=w.storedBatchIds.filter(id=>String(id)!==batchId);
    if(Array.isArray(w.receipts))for(const receipt of w.receipts){
      if(String(receipt?.batchId||'')===batchId&&String(receipt?.receivedFrom||'')==='MINE_EXTRACTION'&&String(receipt?.status||'')==='RECEIVED'){
        receipt.status='REVERSED_FOR_MINE_LOGISTICS';receipt.reversedTurn=turn();receipt.reversalShipmentId='MINE-HAUL-OPEN:'+batchId;
      }
    }
    recomputeSiteLogisticsTradeAvailability(rs);
  }
  const bridge=siteLogisticsUnitBridge(routeProfile,sourceBatch.unit||flow?.unit);
  const dayWindow=Math.max(1,daysPerTurn());
  const routeMetrics=siteRouteLegMetrics(cid,routeProfile,remaining,bridge);
  if(routeMetrics.status!=='READY')return{status:'BLOCKED',reason:routeMetrics.reason||'MINE_ROUTE_TIMING_UNAVAILABLE',routeId:routeProfile.routeId};
  const capacityPerDay=num(routeMetrics.capacityPerDay??routeProfile?.routePlan?.capacityBottleneckPerDay);
  if(capacityPerDay===null||capacityPerDay<=0)return{status:'BLOCKED',reason:'MINE_ROUTE_CAPACITY_NOT_RECORDED',routeId:routeProfile.routeId};
  const capInSourceUnits=capacityPerDay*dayWindow/Math.max(1e-12,bridge.sourceToCapacityFactor);
  let legs=routeMetrics.legs;
  const policy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  if(policy?.isRouteBlocked){
    const blockedLegs=legs.map(leg=>({mode:leg.transportMode,decision:policy.isRouteBlocked(cid,{
      resourceId:rid,transportMode:leg.transportMode,routeId:routeProfile.routeId,siteId,factoryId:null
    })})).filter(item=>item.decision?.blocked);
    if(blockedLegs.length)return{status:'BLOCKED',reason:'RESOURCE_ROUTE_BLOCKADE_ACTIVE',routeId:routeProfile.routeId,
      blockedLegs:blockedLegs.map(item=>({mode:item.mode,reason:item.decision.reason||'RESOURCE_ROUTE_BLOCKADE_ACTIVE'}))};
  }
  const preview=previewTransportCapacity(cid,{routeId:routeProfile.routeId,legs},Math.min(remaining,capInSourceUnits),bridge.sourceToCapacityFactor);
  if(preview.status!=='READY')return{status:'BLOCKED',reason:preview.reason||'TRANSPORT_CAPACITY_EXHAUSTED',capacity:preview,routeId:routeProfile.routeId};
  const quantity=Math.min(remaining,capInSourceUnits,preview.allowedQuantity);
  if(quantity<=1e-9)return{status:'BLOCKED',reason:'TRANSPORT_CAPACITY_EXHAUSTED',capacity:preview,routeId:routeProfile.routeId};
  const warehouseId='WH-'+cid+'-RAW';
  const finalizedMetrics=siteRouteLegMetrics(cid,routeProfile,quantity,bridge);
  legs=finalizedMetrics.status==='READY'?finalizedMetrics.legs:legs;
  const days=Math.max(0,num(finalizedMetrics.travelTimeDays)||0);
  const etaTurns=Math.max(1,Math.ceil(days/dayWindow)),etaTurn=turn()+etaTurns;
  // Arrival dates align to the game's discrete turn cadence, not a sub-turn date that
  // the simulation cannot actually process while its clock jumps multiple days per turn.
  const etaDate=factoryAddGameDays(factoryCurrentGameDate(),etaTurns*dayWindow);
  const shipmentId='MINEHAUL:'+h32(JSON.stringify({cid,siteId,batchId,turn:turn(),sequence:network.shipments.length+1,quantity}));
  const route={status:'PLANNED',routeId:routeProfile.routeId,countryId:cid,siteId,sourceSiteId:siteId,sourceNode:siteId,
    destinationNode:warehouseId,destinationWarehouseId:warehouseId,resourceId:rid,requestedQuantity:remaining,
    dispatchQuantity:Number(quantity.toFixed(6)),unit:sourceBatch.unit||flow?.unit||null,
    transportMode:legs[0]?.mode||'truck',legs,totalDistanceKm:Number((finalizedMetrics.totalDistanceKm||legs.reduce((sum,leg)=>sum+(num(leg.distanceKm)||0),0)).toFixed(6)),
    travelTimeDays:days,etaTurn,etaDate,vehiclesByMode:finalizedMetrics.vehiclesByMode||{},vehicleCount:finalizedMetrics.vehicleCount||0,
    capacityQuantityFactor:bridge.sourceToCapacityFactor,capacityQuantityUnit:bridge.targetUnit||'SIMULATION_RESOURCE_UNIT',
    etaCalculationAuthority:finalizedMetrics.authority||'VERSIONED_TRANSPORT_CATALOG',capacityAuthority:'SIMULATED_SITE_ROUTE_DESIGN_CAPACITY',
    distanceAuthority:routeProfile.routePlan.routeStatus||'SCENARIO_LOGISTICS_DESIGN_ONLY',crossBorderRequired:false,
    quantityUnitBridge:bridge,transportAssetBindingStatus:'UNBOUND_SIMULATED_CAPACITY',simulationOnly:true};
  const capacityUse=commitTransportCapacity(cid,route,quantity,shipmentId,bridge.sourceToCapacityFactor);
  route.capacityUse=capacityUse;
  const batchInFlight=Array.isArray(rs.batches)?rs.batches.find(batch=>String(batch?.batchId||'')===batchId):null;
  if(!batchInFlight)return{status:'BLOCKED',reason:'SOURCE_BATCH_NOT_FOUND',batchId};
  // The complete source quantity is already held out of inventory. Record only the
  // actual dispatched portion as in transit; remaining held cargo stays at the mine.
  const heldAfterDispatch=Math.max(0,(num(flow.mineHeldQuantity)||0)-quantity);
  // Align state thresholds: negligible floating-point residue must not make a fully
  // dispatched batch appear partly held at the mine.
  flow.mineHeldQuantity=heldAfterDispatch<=1e-6?0:heldAfterDispatch;
  batchInFlight.stage=flow.mineHeldQuantity>1e-6?'PARTIALLY_MINE_HAULED':'MINE_TO_WAREHOUSE_IN_TRANSIT';
  batchInFlight.status='IN_TRANSIT_TO_RAW_WAREHOUSE';
  batchInFlight.sourceWarehouseId=batchInFlight.sourceWarehouseId||batchInFlight.warehouseId||('WH-'+cid+'-RAW');
  batchInFlight.destinationWarehouseId='WH-'+cid+'-RAW';batchInFlight.warehouseId=null;
  batchInFlight.locationNodeKey='MINE_OR_TRANSIT:'+siteId;batchInFlight.currentLocationNodeId=siteId;
  batchInFlight.lastMovementType='MINE_TO_WAREHOUSE_DISPATCH';batchInFlight.lastMovementTurn=turn();
  batchInFlight.mineLogisticsShipmentId=shipmentId;
  if(rs.inventoryLots?.[batchId]){
    const lot=rs.inventoryLots[batchId];
    lot.stage=batchInFlight.stage;lot.status='IN_TRANSIT';lot.sourceWarehouseId=lot.sourceWarehouseId||lot.warehouseId||('WH-'+cid+'-RAW');
    lot.destinationWarehouseId='WH-'+cid+'-RAW';lot.warehouseId=null;lot.locationNodeKey=batchInFlight.locationNodeKey;
    lot.mineLogisticsShipmentId=shipmentId;
  }
  siteRuntime.routeId=routeProfile.routeId;siteRuntime.resourceId=rid;siteRuntime.status='IN_TRANSIT_TO_WAREHOUSE';
  clearSiteLogisticsBlock(siteRuntime,batchId);
  siteRuntime.currentStage='MINE_TO_WAREHOUSE';
  siteRuntime.dispatchedQuantity=(num(siteRuntime.dispatchedQuantity)||0)+quantity;
  trackActiveSiteShipment(siteRuntime,shipmentId,'MINE_TO_WAREHOUSE');
  siteRuntime.shipmentIds=[...new Set([...siteRuntime.shipmentIds,shipmentId])];
  appendSiteLogisticsStage(siteRuntime,'MINE_TO_WAREHOUSE','IN_TRANSIT_TO_WAREHOUSE',{shipmentId,batchId,quantity,unit:route.unit,
    etaTurn,etaDate,plannedTransitDays:days,quantityUnitBridge:bridge,transportAssetBindingStatus:'UNBOUND_SIMULATED_CAPACITY'});
  const shipment={shipmentId,shipmentType:'MINE_TO_WAREHOUSE',countryId:cid,siteId,resourceId:rid,batchId,
    quantity:Number(quantity.toFixed(6)),unit:route.unit,warehouseId,sourceWarehouseId:null,
    status:'IN_TRANSIT',deliveryStatus:'IN_TRANSIT_TO_RAW_WAREHOUSE',createdTurn:turn(),createdDate:factoryCurrentGameDate(),
    etaTurn,etaDate,route,transportCapacityReservation:capacityUse,
    provenance:{source:'OMEGA_RESOURCE_SITE_LOGISTICS_RUNTIME',authority:routeProfile.provenance?.authority||'SCENARIO_LOGISTICS_DESIGN_ONLY',
      simulationOnly:true,sourceBatchId:batchId,siteId,actualTransportAssetBound:false,unitBridgeAuthority:bridge.authority}};
  network.shipments.push(shipment);network.shipments=network.shipments.slice(-MAX_SHIPMENTS);
  flow.mineLogisticsRouteId=routeProfile.routeId;flow.mineLogisticsStatus='IN_TRANSIT_TO_WAREHOUSE';
  // Count this persisted haul exactly once; partial-haul retries rely on the remaining balance.
  flow.mineWarehouseDispatchedQuantity=(num(flow.mineWarehouseDispatchedQuantity)||0)+quantity;
  flow.mineHaulShipmentId=shipmentId;flow.mineHaulShipmentIds=[...new Set([...(flow.mineHaulShipmentIds||[]),shipmentId])];
  flow.lastMineHaulDispatchTurn=turn();flow.transportQueueReason=null;flow.blockReason=null;
  appendSiteLogisticsStage(siteRuntime,'WAREHOUSE_ACCOUNTING','SOURCE_STOCK_RESERVED_FOR_TRANSIT',{batchId,quantity,shipmentId});
  // This is an audit-stage entry, not the operational shipment status.
  siteRuntime.status='IN_TRANSIT_TO_WAREHOUSE';
  recomputeSiteLogisticsTradeAvailability(rs);
  emit('OMEGA_RESOURCE_MINE_TO_WAREHOUSE_DISPATCHED',cid,{shipmentId,siteId,batchId,resourceId:rid,quantity,unit:route.unit,etaTurn,etaDate,
    routeId:routeProfile.routeId,transportAssetBindingStatus:'UNBOUND_SIMULATED_CAPACITY',simulationOnly:true});
  return{status:'DISPATCHED',shipment:clone(shipment),quantity,capacity:preview,unitBridge:bridge};
}
function dispatchResidualMineHauls(countryId){
  const cid=canonicalCountry(countryId),player=playerSimulationCountryId();
  if(!cid||!player||player!==cid)return;
  const network=netState(cid),rows=siteFlowRows(cid).slice();
  for(const flow of rows){
    if(!flow?.mineLogisticsRouteId)continue;
    // Mine-haul and factory-haul legs have independent per-turn dispatch limits.
    const batchId=String(flow.batchId||'');if(!batchId||Number(flow.lastMineResidualDispatchTurn)===turn())continue;
    const route=siteLogisticsRouteFor(cid,flow.siteId);
    if(!route)continue;
    const source=(Array.isArray(resourceState(cid).batches)?resourceState(cid).batches:[]).find(batch=>String(batch?.batchId||'')===batchId);
    if(!source)continue;
    // Only an existing mine-to-warehouse leg blocks another mine dispatch.
    // A parallel factory leg can be in transit while residual cargo is still hauled.
    const activeMineHaul=network.shipments.some(item=>String(item?.batchId||'')===batchId&&
      String(item?.shipmentType||'')==='MINE_TO_WAREHOUSE'&&
      ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE','BLOCKED_LEDGER_MISMATCH'].includes(String(item?.status||'')));
    if(activeMineHaul)continue;
    const total=Math.max(0,num(source.quantity)||num(source.remainingQuantity)||0);
    const alreadyDispatched=Math.max(0,num(flow.mineWarehouseDispatchedQuantity)||0);
    const sourceRemaining=Math.max(0,num(source.remainingQuantity!=null?source.remainingQuantity:source.quantity)||0);
    if(Math.min(total-alreadyDispatched,sourceRemaining)<=1e-6)continue;
    const site=siteById(flow.siteId)||flow.siteSnapshot;
    if(!site)continue;
    const sent=dispatchMineToWarehouse(cid,site,flow,source,route);
    flow.lastMineResidualDispatchTurn=turn();
    if(sent.status==='DISPATCHED'){
      flow.mineLogisticsStatus='IN_TRANSIT_TO_WAREHOUSE';flow.transportQueueReason=null;flow.blockReason=null;
      addFlowStage(flow,'TRANSPORT','IN_TRANSIT_TO_RAW_WAREHOUSE',{shipmentId:sent.shipment.shipmentId,
        dispatchQuantity:sent.quantity,etaTurn:sent.shipment.etaTurn,etaDate:sent.shipment.etaDate,routeId:route.routeId});
    }else if(sent.reason==='TRANSPORT_CAPACITY_EXHAUSTED'){
      flow.mineLogisticsStatus='AWAITING_CAPACITY';flow.transportQueueReason=sent.reason;flow.blockReason=null;
      recordSiteLogisticsBlock(cid,flow.siteId,batchId,route,sent.reason,true);
      addFlowStage(flow,'TRANSPORT','AWAITING_CAPACITY',{reason:sent.reason,remainingQuantity:total-alreadyDispatched});
    }else if(sent.status!=='EMPTY'){
      flow.mineLogisticsStatus='BLOCKED';flow.blockReason=sent.reason||'MINE_LOGISTICS_DISPATCH_BLOCKED';
      recordSiteLogisticsBlock(cid,flow.siteId,batchId,route,flow.blockReason,false);
      addFlowStage(flow,'TRANSPORT','BLOCKED',{reason:flow.blockReason,remainingQuantity:total-alreadyDispatched});
    }
    saveSiteFlow(cid,flow);
  }
}
function receiveMineWarehouseShipment(countryId,shipment){
  const cid=canonicalCountry(countryId),rs=resourceState(cid),network=netState(cid),batchId=String(shipment?.batchId||'').trim();
  const receiptId='MINE-WH-REC:'+String(shipment?.shipmentId||'');
  if(!batchId||canonicalCountry(shipment?.countryId)!==cid)return{status:'BLOCKED',reason:'MINE_WAREHOUSE_DELIVERY_COUNTRY_OR_BATCH_INVALID'};
  const w=rs.warehouse||{},receipts=Array.isArray(w.receipts)?w.receipts:(w.receipts=[]);
  const existing=receipts.find(receipt=>String(receipt?.receiptId||'')===receiptId);
  if(existing&&String(existing.status||'')==='RECEIVED')return{status:'DELIVERED',idempotent:true,receiptId,quantity:num(existing.quantity)||0};
  const batch=(Array.isArray(rs.batches)?rs.batches:[]).find(item=>String(item?.batchId||'')===batchId);
  const lot=rs.inventoryLots?.[batchId];
  if(!batch||!lot)return{status:'BLOCKED',reason:'MINE_WAREHOUSE_SOURCE_BATCH_OR_LOT_MISSING',batchId};
  const rid=tok(shipment.resourceId),quantity=Math.max(0,num(shipment.quantity)||0);
  if(tok(batch.resourceId||batch.materialIdentity)!==rid||tok(lot.resourceId)!==rid)
    return{status:'BLOCKED',reason:'MINE_WAREHOUSE_RESOURCE_LEDGER_MISMATCH',batchId,resourceId:rid};
  if(!rs.inventory||typeof rs.inventory!=='object')rs.inventory={};
  if(!w.availableByResource||typeof w.availableByResource!=='object')w.availableByResource={};
  const inventoryKey=quantityObjectKey(rs.inventory,rid)||rid,warehouseKey=quantityObjectKey(w.availableByResource,rid)||rid;
  rs.inventory[inventoryKey]=Number(((num(rs.inventory[inventoryKey])||0)+quantity).toFixed(6));
  w.availableByResource[warehouseKey]=Number(((num(w.availableByResource[warehouseKey])||0)+quantity).toFixed(6));
  const already=Array.isArray(w.storedBatchIds)?w.storedBatchIds:[];
  if(!already.includes(batchId))already.push(batchId);w.storedBatchIds=already;
  const receipt={receiptId,shipmentId:shipment.shipmentId,warehouseId:shipment.warehouseId,countryId:cid,batchId,
    siteId:shipment.siteId,resourceId:rid,quantity,unit:shipment.unit,receivedFrom:'MINE_SITE_LOGISTICS',
    simulationTurn:turn(),gameDate:factoryCurrentGameDate(),status:'RECEIVED',
    provenance:{source:'OMEGA_RESOURCE_SITE_LOGISTICS_RUNTIME',simulationOnly:true,idempotentReceipt:true}};
  receipts.push(receipt);w.receipts=receipts.slice(-MAX_EVENTS);w.lastReceiptTurn=turn();rs.warehouse=w;
  const flow=siteFlowRows(cid).find(item=>String(item.batchId||'')===batchId);
  const mineHeld=Math.max(0,num(flow?.mineHeldQuantity)||0);
  const anotherMineHaulInTransit=network.shipments.some(item=>String(item.batchId||'')===batchId&&
    item.shipmentType==='MINE_TO_WAREHOUSE'&&String(item.shipmentId||'')!==String(shipment.shipmentId||'')&&
    ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(item.status||'')));
  const factoryHaulInTransit=network.shipments.some(item=>String(item.batchId||'')===batchId&&
    item.shipmentType==='RAW_TO_FACTORY'&&['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(item.status||'')));
  const splitLocation=mineHeld>1e-6||anotherMineHaulInTransit||factoryHaulInTransit;
  batch.stage=splitLocation?'PARTIALLY_IN_RAW_INVENTORY':'RAW_INVENTORY';
  batch.status=splitLocation?'PARTIAL_STOCK_ACROSS_MINE_WAREHOUSE_OR_TRANSIT':'AVAILABLE_TO_FACTORY';
  batch.warehouseId=splitLocation?null:shipment.warehouseId;
  batch.locationNodeKey=splitLocation?'MIXED:MINE_RAW_WAREHOUSE_OR_TRANSIT':'WAREHOUSE:'+cid+':RAW';
  batch.currentLocationNodeId=splitLocation?null:shipment.warehouseId;
  batch.lastMovementType='MINE_TO_RAW_WAREHOUSE_RECEIPT';batch.lastMovementTurn=turn();batch.warehouseReceiptId=receiptId;delete batch.mineLogisticsShipmentId;
  lot.stage=batch.stage;lot.status=splitLocation?'PARTIAL_STOCK_ACROSS_MINE_WAREHOUSE_OR_TRANSIT':'AVAILABLE';
  lot.warehouseId=splitLocation?null:shipment.warehouseId;lot.locationNodeKey=batch.locationNodeKey;
  lot.warehouseReceiptId=receiptId;delete lot.mineLogisticsShipmentId;
  if(flow){
    flow.mineWarehouseReceivedQuantity=(num(flow.mineWarehouseReceivedQuantity)||0)+quantity;
    flow.mineWarehouseReceiptIds=[...new Set([...(flow.mineWarehouseReceiptIds||[]),receiptId])];
    flow.mineLogisticsStatus='WAREHOUSE_RECEIVED';flow.lastMineWarehouseReceiptTurn=turn();flow.transportQueueReason=null;
    addFlowStage(flow,'RAW_INVENTORY','RECEIVED_FROM_MINE',{receiptId,shipmentId:shipment.shipmentId,quantity,warehouseId:shipment.warehouseId});
    saveSiteFlow(cid,flow);
    const siteRuntime=siteLogisticsState(cid,shipment.siteId,siteLogisticsRouteFor(cid,shipment.siteId));
    if(siteRuntime){
      siteRuntime.receivedQuantity=(num(siteRuntime.receivedQuantity)||0)+quantity;
      closeActiveSiteShipment(siteRuntime,shipment.shipmentId);
      siteRuntime.currentStage=siteRuntime.runtimeActive?siteRuntime.currentStage:'WAREHOUSE_RECEIVED';
      siteRuntime.warehouseReceiptIds=[...new Set([...siteRuntime.warehouseReceiptIds,receiptId])];
      appendSiteLogisticsStage(siteRuntime,'MINE_TO_WAREHOUSE','DELIVERED',{receiptId,shipmentId:shipment.shipmentId,batchId,quantity,warehouseId:shipment.warehouseId});
      if(siteRuntime.runtimeActive){
        siteRuntime.currentStage=String(siteRuntime.currentStage||'MINE_TO_WAREHOUSE');
        siteRuntime.status=siteRuntime.currentStage==='RAW_TO_FACTORY'?'IN_TRANSIT_TO_FACTORY':'IN_TRANSIT_TO_WAREHOUSE';
      }
      appendSiteLogisticsStage(siteRuntime,'RAW_INVENTORY','AVAILABLE',{receiptId,batchId,quantity,unit:shipment.unit});
      // Audit history must not overwrite the operational status of another shipment still moving.
      if(siteRuntime.runtimeActive){
        siteRuntime.currentStage=String(siteRuntime.currentStage||'MINE_TO_WAREHOUSE');
        siteRuntime.status=siteRuntime.currentStage==='RAW_TO_FACTORY'?'IN_TRANSIT_TO_FACTORY':'IN_TRANSIT_TO_WAREHOUSE';
      }
    }
  }
  recomputeSiteLogisticsTradeAvailability(rs);
  emit('OMEGA_RESOURCE_MINE_WAREHOUSE_RECEIPT_POSTED',cid,receipt);
  return{status:'DELIVERED',receiptId,quantity,idempotent:false};
}

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
function normalizeFactoryType(value){
  let key=id(value);const aliases=cat()?.factoryTypeAliases||{},seen=new Set();
  while(aliases[key]&&!seen.has(key)){seen.add(key);key=id(aliases[key]);}
  return key;
}

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
  const r=resourceState(c);
  if(!r.industrialNetwork||typeof r.industrialNetwork!=='object'||Array.isArray(r.industrialNetwork)){
    r.industrialNetwork={
      schemaVersion:VERSION,shipments:[],projects:[],extractions:[],reservations:{},deliveries:[],siteFlowLedger:[],siteLogisticsBySiteId:{},
      infrastructure:{nodes:{},edges:{},corridors:{}},events:[],factoryRuntime:{},technologyContracts:[]
    };
  }
  const n=r.industrialNetwork;
  // Older saves can persist a partial network object. Normalize collections before
  // any extraction, dispatch, delivery or production action mutates them.
  for(const key of ['shipments','projects','extractions','deliveries','siteFlowLedger','events','technologyContracts']){
    if(!Array.isArray(n[key]))n[key]=[];
  }
  for(const key of ['reservations','factoryRuntime','siteLogisticsBySiteId','transportFleetBySiteId']){
    if(!n[key]||typeof n[key]!=='object'||Array.isArray(n[key]))n[key]={};
  }
  if(!n.infrastructure||typeof n.infrastructure!=='object'||Array.isArray(n.infrastructure))n.infrastructure={};
  for(const key of ['nodes','edges','corridors']){
    if(!n.infrastructure[key]||typeof n.infrastructure[key]!=='object'||Array.isArray(n.infrastructure[key]))n.infrastructure[key]={};
  }
  return n;
}
function normalizeTransportMode(value){
  const mode=tok(value);
  return mode==='train'?'rail':mode==='road'?'truck':mode;
}
const TRANSPORT_PROFILE_OVERRIDE_RULES=Object.freeze({
  payloadTonnes:{minExclusive:0},speedKmh:{minExclusive:0},loadHours:{min:0},unloadHours:{min:0},
  costPerTonneKm:{min:0},maintenanceMultiplier:{minExclusive:0}
});
function storedTransportFleetRecord(countryId,siteId,mode){
  const cid=canonicalCountry(countryId),sid=String(siteId||'').trim(),transportMode=normalizeTransportMode(mode);
  if(!cid||!sid||!transportMode)return null;
  const network=netState(cid),siteRow=network.transportFleetBySiteId?.[sid];
  const record=siteRow?.transportTypes?.[transportMode];
  return record&&typeof record==='object'&&!Array.isArray(record)?record:null;
}
function getTransportFleet(input={},siteIdValue){
  const args=input&&typeof input==='object'?input:{countryId:input,siteId:siteIdValue};
  const cid=canonicalCountry(args.countryId),sid=String(args.siteId||'').trim();
  if(!cid||!sid)return{status:'BLOCKED',reason:'TRANSPORT_FLEET_COUNTRY_AND_SITE_REQUIRED'};
  const selected=playerSimulationCountryId();
  if(selected&&selected!==cid)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:selected};
  const site=siteById(sid);
  if(!site?.siteId)return{status:'BLOCKED',reason:'SITE_NOT_FOUND',siteId:sid,countryId:cid};
  if(canonicalCountry(site.countryId)!==cid)return{status:'BLOCKED',reason:'SITE_COUNTRY_MISMATCH',siteId:sid,countryId:cid,siteCountryId:canonicalCountry(site.countryId)};
  const fleet=netState(cid).transportFleetBySiteId[sid]||{},profiles=modeRules();
  const supportedModes=Object.keys(profiles).length?Object.keys(profiles):['truck','rail','barge','ship','pipeline'];
  const transportTypes=supportedModes.map(mode=>{
    const record=fleet.transportTypes?.[mode]||null,profile=profiles[mode]||{};
    const count=record?finiteCount(record.count):null,overrides=clone(record?.profileOverrides||{});
    return{transportType:mode,count,configured:count!==null,profileOverrides:overrides,
      payloadTonnes:num(overrides.payloadTonnes)??num(profile.payloadTonnes),
      speedKmh:num(overrides.speedKmh)??num(profile.speedKmh),
      loadHours:num(overrides.loadHours)??num(profile.loadHours),
      unloadHours:num(overrides.unloadHours)??num(profile.unloadHours),
      lastUpdatedTurn:record?.lastUpdatedTurn??null,authority:record?.authority||'NOT_CONFIGURED'};
  });
  return{status:'READY',countryId:cid,siteId:sid,transportTypes,individualVehicleIdsRequired:false,
    authority:'OMEGA_PLAYER_CONFIGURED_COUNTRY_SITE_TRANSPORT_COUNT',lastUpdatedTurn:fleet.lastUpdatedTurn??null};
}
function setTransportFleet(input={}){
  const cid=canonicalCountry(input.countryId),sid=String(input.siteId||'').trim(),mode=normalizeTransportMode(input.transportType||input.mode);
  if(!cid||!sid||!mode)return{status:'BLOCKED',reason:'TRANSPORT_FLEET_COUNTRY_SITE_AND_TYPE_REQUIRED'};
  const selected=playerSimulationCountryId();
  if(selected&&selected!==cid)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:selected};
  const site=siteById(sid);
  if(!site?.siteId)return{status:'BLOCKED',reason:'SITE_NOT_FOUND',siteId:sid,countryId:cid};
  if(canonicalCountry(site.countryId)!==cid)return{status:'BLOCKED',reason:'SITE_COUNTRY_MISMATCH',siteId:sid,countryId:cid,siteCountryId:canonicalCountry(site.countryId)};
  const knownModes=new Set([...Object.keys(modeRules()),'truck','rail','barge','ship','pipeline']);
  if(!knownModes.has(mode))return{status:'BLOCKED',reason:'UNKNOWN_TRANSPORT_TYPE',transportType:mode,allowedTransportTypes:[...knownModes]};
  const count=num(input.count);
  if(count===null||count<0||!Number.isInteger(count))return{status:'BLOCKED',reason:'INVALID_TRANSPORT_FLEET_COUNT',count:input.count};
  const suppliedProfile=input.profileOverrides||input.profile||{},profileOverrides={};
  for(const [key,raw] of Object.entries(suppliedProfile)){
    if(!Object.prototype.hasOwnProperty.call(TRANSPORT_PROFILE_OVERRIDE_RULES,key))continue;
    if(raw===null||raw===undefined||String(raw).trim()==='')continue;
    const value=num(raw),rule=TRANSPORT_PROFILE_OVERRIDE_RULES[key];
    if(value===null||(rule.minExclusive!==undefined&&value<=rule.minExclusive)||(rule.min!==undefined&&value<rule.min))
      return{status:'BLOCKED',reason:'INVALID_TRANSPORT_PROFILE_OVERRIDE',field:key,value:raw};
    profileOverrides[key]=value;
  }
  const network=netState(cid),bySite=network.transportFleetBySiteId;
  let siteFleet=bySite[sid];
  if(!siteFleet||typeof siteFleet!=='object'||Array.isArray(siteFleet)){
    siteFleet=bySite[sid]={schemaVersion:'OMEGA_LOGISTICS_FLEET_COUNT_V1',countryId:cid,siteId:sid,transportTypes:{},
      individualVehicleIdsRequired:false,createdTurn:turn(),lastUpdatedTurn:turn()};
  }
  if(!siteFleet.transportTypes||typeof siteFleet.transportTypes!=='object'||Array.isArray(siteFleet.transportTypes))siteFleet.transportTypes={};
  const prior=siteFleet.transportTypes[mode]||{};
  const mergedProfile={...(prior.profileOverrides&&typeof prior.profileOverrides==='object'?prior.profileOverrides:{}),...profileOverrides};
  const record={transportType:mode,count:Math.floor(count),profileOverrides:mergedProfile,individualVehicleIdsRequired:false,
    authority:'PLAYER_CONFIGURED_COUNTRY_SITE_TRANSPORT_COUNT',lastUpdatedTurn:turn()};
  siteFleet.transportTypes[mode]=record;siteFleet.lastUpdatedTurn=turn();
  emit('OMEGA_RESOURCE_TRANSPORT_FLEET_UPDATED',cid,{siteId:sid,transportType:mode,count:record.count,
    profileOverrides:clone(mergedProfile),individualVehicleIdsRequired:false,lastUpdatedTurn:turn()});
  return{status:'APPLIED',countryId:cid,siteId:sid,transportType:mode,count:record.count,
    profileOverrides:clone(mergedProfile),individualVehicleIdsRequired:false,authority:record.authority,lastUpdatedTurn:turn()};
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
function playerSimulationCountryId(){
  const sim=g.Omega?.Simulation,root=state()||{};
  const session=root.simulation?.session||sim?.world?.state?.simulation?.session||{};
  let direct=null;
  try{if(typeof sim?.getPlayerCountryId==='function')direct=sim.getPlayerCountryId();}catch(_){}
  const candidates=[session.playerCountryId,direct,root.simulation?.playerCountryId,root.playerCountryId,root.playerCountryCode,
    g.Game?.playerCountryId,g.Game?.playerCountryCode,g.Game?.playerCountry,g.OMEGA_PLAYER_COUNTRY_ID];
  for(const value of candidates){
    const raw=value&&typeof value==='object'?(value.iso3||value.iso3Code||value.countryCode||value.countryId||value.code||value.id||value.name):value;
    const cid=canonicalCountry(raw);
    if(cid&&cid!=='GLOBAL'&&cid!=='WORLD'&&/^[A-Z0-9]{2,3}$/.test(cid))return cid;
  }
  return null;
}
function siteById(siteId){
  const key=String(siteId||'').trim();
  const site=masterSites().find(x=>String(x?.siteId||'')===key)||null;
  if(!site)return null;
  const cid=canonicalCountry(site.countryId||site.sourceSiteRecord?.countryCode);
  const assets=Array.isArray(state()?.resource?.[cid]?.mineAssets)?state().resource[cid].mineAssets:[];
  const commissioned=assets.filter(x=>String(x?.siteId||'')===key&&String(x?.status||'').toUpperCase()==='OPERATIONAL');
  if(!commissioned.length)return site;
  const latest=commissioned[commissioned.length-1];
  const sourceOperation=site.operation||site.sourceSiteRecord?.operation||{};
  const sourceStatus=String(sourceOperation.realWorldStatus||sourceOperation.status||site.sourceSiteRecord?.status||'UNOBSERVED');
  const playerMineAssetCapacityMultiplier=commissioned.reduce((sum,a)=>sum+Math.max(.1,num(a?.capacityMultiplier)||1),0);
  return{
    ...clone(site),
    operation:{...clone(sourceOperation),realWorldStatus:sourceStatus,status:'SIMULATED_PLAYER_MINE_OPERATIONAL',
      operationalStatus:'PLAYER_COMMISSIONED',commercialExtraction:true,
      statusAuthority:'SIMULATED_PLAYER_MINE_ASSET_OVERRIDE',commissionedByProjectId:latest.buildProjectId||null},
    sourceSiteRecord:{...clone(site.sourceSiteRecord||{}),realWorldStatus:sourceStatus,status:'SIMULATED_PLAYER_MINE_OPERATIONAL',commercialExtraction:true},
    real:{...clone(site.real||{}),operationStatus:'SIMULATED_PLAYER_MINE_OPERATIONAL'},
    runtime:{...clone(site.runtime||{}),playerMineAssetId:latest.mineId||latest.id||null,
      playerMineAssetCount:commissioned.length,playerMineAssetCapacityMultiplier,commissioningAuthority:'GAME_STATE_RESOURCE_MINE_ASSETS'}
  };
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
  let site=siteId?siteById(siteId):null;
  if(site&&canonicalCountry(site.countryId)!==cid)site=null;
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
  const selectedPlayer=playerSimulationCountryId();
  // Automatic mine-to-warehouse logistics only runs for the active player country.
  // Without a selected country, preserve the legacy site-flow observer/warehouse-to-factory
  // path, but never start a mine-haul shipment.
  if(selectedPlayer&&selectedPlayer!==cid)return;
  if(selectedPlayer&&siteLogisticsActiveCountry!==cid){
    if(!pendingSiteLogisticsBatches.has(batchId)){
      pendingSiteLogisticsBatches.add(batchId);
      void loadSiteLogisticsRoutes(cid).then(result=>{
        pendingSiteLogisticsBatches.delete(batchId);
        if(result?.status==='READY'&&playerSimulationCountryId()===cid)onExtractionCommitted(evt);
      }).catch(()=>pendingSiteLogisticsBatches.delete(batchId));
    }
    return;
  }
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
  const routeProfileAtExtraction=selectedPlayer===cid?siteLogisticsRouteFor(cid,site.siteId):null;
  addFlowStage(row,'RAW_INVENTORY',routeProfileAtExtraction?'PENDING_MINE_LOGISTICS':'AVAILABLE',{warehouseId:row.warehouseId,quantity:Math.max(0,num(stored.remainingQuantity!=null?stored.remainingQuantity:stored.quantity)||0),routeId:routeProfileAtExtraction?.routeId||null});
  if(quantity<=0||Math.max(0,num(stored.remainingQuantity!=null?stored.remainingQuantity:stored.quantity)||0)<=0){
    addFlowStage(row,'TRANSPORT','BLOCKED',{reason:'EXTRACTION_BATCH_QUANTITY_INVALID'});
    row.blockReason='EXTRACTION_BATCH_QUANTITY_INVALID';saveSiteFlow(cid,row);return;
  }
  if(site.operation?.commercialExtraction===false||site.sourceSiteRecord?.commercialExtraction===false){
    addFlowStage(row,'TRANSPORT','BLOCKED',{reason:'NON_COMMERCIAL_SITE'});
    row.blockReason='NON_COMMERCIAL_SITE';saveSiteFlow(cid,row);return;
  }
  if(routeProfileAtExtraction){
    const routeCompatible=candidateFactories(cid,rid);
    const routeFactory=routeCompatible.find(({asset})=>String(asset?.sourceSiteId||asset?.siteId||'')===String(site.siteId))?.asset||routeCompatible[0]?.asset||null;
    if(routeFactory)row.factoryId=String(routeFactory.id||routeFactory.assetId||routeFactory.projectId||'');
    row.mineLogisticsRouteId=routeProfileAtExtraction.routeId;row.mineLogisticsStatus='PENDING';
    const haul=dispatchMineToWarehouse(cid,site,row,stored,routeProfileAtExtraction);
    if(haul.status==='DISPATCHED'){
      row.mineLogisticsStatus='IN_TRANSIT_TO_WAREHOUSE';row.mineHaulShipmentId=haul.shipment.shipmentId;
      row.mineHaulShipmentIds=[...new Set([...(row.mineHaulShipmentIds||[]),haul.shipment.shipmentId])];
      addFlowStage(row,'RAW_INVENTORY','IN_TRANSIT_FROM_MINE',{shipmentId:haul.shipment.shipmentId,
        quantity:haul.quantity,unit:haul.shipment.unit,warehouseId:row.warehouseId,etaTurn:haul.shipment.etaTurn,etaDate:haul.shipment.etaDate});
      addFlowStage(row,'TRANSPORT','IN_TRANSIT_TO_RAW_WAREHOUSE',{shipmentId:haul.shipment.shipmentId,
        routeId:routeProfileAtExtraction.routeId,quantity:haul.quantity,etaTurn:haul.shipment.etaTurn,etaDate:haul.shipment.etaDate});
      row.status='MINE_TO_WAREHOUSE_IN_TRANSIT';row.blockReason=null;saveSiteFlow(cid,row);
      emit('OMEGA_RESOURCE_SITE_FLOW_MINE_HAUL_STARTED',cid,{flowId:row.flowId,siteId:row.siteId,batchId,
        resourceId:rid,quantity:haul.quantity,shipmentId:haul.shipment.shipmentId,routeId:routeProfileAtExtraction.routeId,
        etaTurn:haul.shipment.etaTurn,etaDate:haul.shipment.etaDate,simulationOnly:true});
      return;
    }
    if(haul.status==='BLOCKED'){
      const waitForCapacity=haul.reason==='TRANSPORT_CAPACITY_EXHAUSTED';
      row.mineLogisticsStatus=waitForCapacity?'AWAITING_CAPACITY':'BLOCKED';
      row.transportQueueReason=waitForCapacity?haul.reason:null;
      row.blockReason=waitForCapacity?null:(haul.reason||'MINE_LOGISTICS_DISPATCH_BLOCKED');
      addFlowStage(row,'TRANSPORT',waitForCapacity?'AWAITING_CAPACITY':'BLOCKED',{reason:haul.reason||'MINE_LOGISTICS_DISPATCH_BLOCKED',
        details:haul.capacity||null,routeId:routeProfileAtExtraction.routeId});
      row.status=waitForCapacity?'MINE_LOGISTICS_AWAITING_CAPACITY':'MINE_LOGISTICS_BLOCKED';
      recordSiteLogisticsBlock(cid,site.siteId,batchId,routeProfileAtExtraction,row.blockReason||row.transportQueueReason,waitForCapacity);
      saveSiteFlow(cid,row);
      emit('OMEGA_RESOURCE_SITE_FLOW_BLOCKED',cid,{flowId:row.flowId,siteId:row.siteId,batchId,resourceId:rid,
        reason:row.blockReason||row.transportQueueReason,status:row.status,routeId:routeProfileAtExtraction.routeId},'resource-industrial-network');
      return;
    }
  }
  const compatible=candidateFactories(cid,rid);
  let factoryChoice=compatible.find(({asset})=>String(asset?.sourceSiteId||asset?.siteId||'')===String(site.siteId))?.asset||compatible[0]?.asset||null,bootstrap=null;
  // Extraction commit callbacks receive the normalized event payload, not executeSitePipeline's local input.
  // Requiring an explicit event flag keeps ordinary extraction from inventing a factory and avoids a stale global reference.
  if(!factoryChoice&&p.autoCommissionFactory===true){bootstrap=ensureSimulationFactory(cid,site,rid,Math.min(quantity,Math.max(1,num(stored.remainingQuantity)||quantity)));factoryChoice=bootstrap.factory||null;}
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
    const reason=sent.reason||'SHIPMENT_DISPATCH_BLOCKED';
    const waitForCapacity=String(reason).toUpperCase()==='TRANSPORT_CAPACITY_EXHAUSTED';
    addFlowStage(row,'TRANSPORT',waitForCapacity?'AWAITING_CAPACITY':'BLOCKED',{reason,detail:sent.details||null});
    row.blockReason=waitForCapacity?null:reason;
    row.transportQueueReason=waitForCapacity?reason:null;
    row.lastResidualBlockReason=null;
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
  // Legacy or partially saved industrial-network objects may omit the infrastructure bucket.
  // Preserve any existing route data while restoring the minimum safe ledger shape.
  if(!n.infrastructure||typeof n.infrastructure!=='object'||Array.isArray(n.infrastructure))
    n.infrastructure={nodes:{},edges:{},corridors:{}};
  if(!n.infrastructure.nodes||typeof n.infrastructure.nodes!=='object'||Array.isArray(n.infrastructure.nodes))n.infrastructure.nodes={};
  if(!n.infrastructure.edges||typeof n.infrastructure.edges!=='object'||Array.isArray(n.infrastructure.edges))n.infrastructure.edges={};
  if(!n.infrastructure.corridors||typeof n.infrastructure.corridors!=='object'||Array.isArray(n.infrastructure.corridors))n.infrastructure.corridors={};
  n.infrastructure.baselineInitialized=true;
  return{infra,n};
}
function infraQuality(c,mode){
  const {infra}=normalizeInfrastructure(c);
  const map={truck:infra.roads,rail:infra.rail,ship:infra.ports,barge:infra.roads,pipeline:infra.pipelines};
  const x=map[mode]||{capacityPerDay:20000,quality:.5};
  const rawCapacity=x.capacityPerDay==null?20000:num(x.capacityPerDay);
  const rawQuality=x.quality==null?.5:num(x.quality);
  return{capacityPerDay:Math.max(0,rawCapacity==null?20000:rawCapacity),quality:Math.max(0,Math.min(1,rawQuality==null?.5:rawQuality))};
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
  const mineOutputMultiplier=Math.max(1,num(site?.runtime?.playerMineAssetCapacityMultiplier)||num(site?.runtime?.playerMineAssetCount)||1);
  const daily=Math.max(.000001,num(stream.production?.activeRate)||num(stream.production?.nominalCapacity)||registryRate||0)*Math.max(.1,num(tech.capacityMultiplier)||1)*mineOutputMultiplier;
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
  // Migrate saved assets from retired material-processing IDs to the one canonical factory type.
  // Commodity-specific inputs and outputs stay on the asset; only its factory type is canonicalized.
  for(const asset of economy.productionAssets){
    if(!asset||typeof asset!=='object')continue;
    const rawType=String(asset.factoryType||asset.type||asset.facilityType||'').trim().toUpperCase();
    if(!rawType)continue;
    const canonicalType=normalizeFactoryType(rawType);
    if(canonicalType&&cat()?.factoryProfiles?.[canonicalType]&&String(asset.factoryType||'').trim().toUpperCase()!==canonicalType)
      asset.factoryType=canonicalType;
  }
  return economy.productionAssets;
}
function recipeFor(resourceId,asset={}){
  const rid=tok(resourceId),type=String(asset?.factoryType||asset?.type||'').trim().toUpperCase();
  const downstream=cat()?.downstreamFactoryRecipes||{};
  let downstreamRule=asset?.recipeId?downstream[String(asset.recipeId)]||null:null;
  if(!downstreamRule&&type){
    downstreamRule=Object.values(downstream).find(row=>String(row?.factoryType||'').toUpperCase()===type&&
      Object.keys(row?.inputs||{}).some(key=>tok(key)===rid))||null;
  }
  const r=processRules()[rid]||null;
  const genericProduct=String(resourceId||'RESOURCE').trim().replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').toUpperCase()+'_PROCESSED';
  const genericRule={factoryType:'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT',inputs:{[rid||'unknown_resource']:1},
    outputs:{[genericProduct]:0.85,PROCESSING_RESIDUE:0.15},cycleDays:2,authority:'SIMULATED_GENERIC_FALLBACK'};
  const base=downstreamRule||r||genericRule;
  const inputSource=asset?.inputCoefficients||asset?.inputs||base.inputs||{};
  const normalizedInputs={};
  for(const [key,value] of Object.entries(inputSource)){
    const id=tok(key),coefficient=num(value);
    if(id&&coefficient!==null)normalizedInputs[id]=coefficient;
  }
  const outputs=asset?.outputProfile||asset?.outputs||base.outputs||{};
  const recipeAuthority=downstreamRule?(downstreamRule.recipeAuthority||'SIMULATED_GAMEPLAY_RULE'):
    r?'INDUSTRIAL_CATALOG_RULE':(asset?.outputProfile||asset?.inputs||asset?.inputCoefficients?'ASSET_PROFILE':'SIMULATED_GENERIC_FALLBACK');
  return{
    recipeId:downstreamRule?.recipeId||asset?.recipeId||null,
    factoryType:normalizeFactoryType(asset?.factoryType||asset?.type||base.factoryType||'RESOURCE_PROCESSING_PLANT'),
    inputs:normalizedInputs,outputs:clone(outputs),cycleDays:num(asset?.cycleDays)||num(base.cycleDays)||1,
    recipeAuthority,recipeMode:asset?.recipeMode||(Object.keys(normalizedInputs).length>1?'MULTI_INPUT':'SINGLE_INPUT'),
    inputUnit:base.inputUnit||asset?.inputUnit||null,outputUnit:base.outputUnit||asset?.outputUnit||null,
    requiresAllInputs:base.requiresAllInputs===true,requiresTrackedInputs:asset?.requireTrackedInputs===true
  };
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

function routeModeCompatible(route,mode){
  const raw=tok(route?.mode||route?.transportMode||route?.routeType||route?.method);
  const wanted=tok(mode);
  const groups={
    road_rail:['truck','rail'],road_and_rail:['truck','rail'],roadrail:['truck','rail'],
    pipeline_and_sea_lane:['pipeline','ship'],pipeline_sea_lane:['pipeline','ship'],pipeline_and_sealanes:['pipeline','ship'],
    road:['truck'],highway:['truck'],lorry:['truck'],truck_road:['truck'],
    railway:['rail'],heavy_rail:['rail'],sea_lane:['ship'],seaway:['ship'],maritime:['ship'],
    inland_waterway:['barge'],waterway:['barge']
  };
  if(groups[raw])return groups[raw].includes(wanted);
  const aliases={road:'truck',highway:'truck',lorry:'truck',railway:'rail',heavy_rail:'rail',
    sea_lane:'ship',seaway:'ship',maritime:'ship',inland_waterway:'barge',waterway:'barge'};
  return (aliases[raw]||raw)===wanted;
}
function routeDestinationMatches(route,asset,resourceId){
  const target=String(route?.factoryId||route?.destinationFactoryId||route?.toFactoryId||'').trim();
  if(!target)return true;
  const candidates=[asset?.id,asset?.assetId,asset?.factoryId,asset?.routeBindingId,asset?.routeProfileId,asset?.simulationRouteFactoryId];
  if(candidates.some(value=>String(value||'').trim()===target))return true;
  // Canonical site route assets use aliases such as FACTORY_BGD_limestone, while the
  // actual player-built asset receives its own project ID. Resolve only this explicit
  // country + commodity alias, and only for a factory already compatible with the input.
  const alias=target.match(/^FACTORY_([A-Z]{3})_(.+)$/i);
  return !!alias&&canonicalCountry(alias[1])===canonicalCountry(asset?.countryId)&&
    tok(alias[2])===tok(resourceId)&&Object.keys(recipeFor(resourceId,asset).inputs||{}).some(key=>tok(key)===tok(resourceId));
}
function corridorDistance(site,asset,mode,resourceId){
  const explicit=simulationRouteFor(site);
  const hit=explicit.find(row=>routeModeCompatible(row,mode)&&routeDestinationMatches(row,asset,resourceId));
  if(hit){
    const d=num(hit.distanceKm??hit.distance??hit.km);
    if(d!==null&&d>0)return{distanceKm:d,authority:'SITE_SIMULATION_ROUTE',routeId:hit.routeId||hit.id||null};
  }
  // The fallback is a deterministic gameplay estimate, not a surveyed geographic route.
  const seed=frac([site?.siteId,asset?.id||asset?.assetId||asset?.projectId,mode].join('|'));
  const base={truck:60,rail:450,barge:280,ship:1800,pipeline:350}[mode]||250;
  return{distanceKm:Math.max(15,Math.round(base*(.55+seed*1.1))),authority:'SIMULATED_CORRIDOR_MODEL',routeId:null};
}
function evenlySplitRouteDistance(totalDistance,segments){
  const total=Math.max(0,num(totalDistance)||0),count=Array.isArray(segments)?segments.length:0;
  if(!count)return[];
  const storedTotal=Number(total.toFixed(6)),perLeg=storedTotal/count;
  let assigned=0;
  return segments.map((segment,index)=>{
    // Sum the same rounded distances that are persisted on the legs. Using the
    // pre-rounded accumulator can make a route gain/lose 0.000001 km on readback.
    const distance=index===count-1?Math.max(0,Number((storedTotal-assigned).toFixed(6))):Number(perLeg.toFixed(6));
    assigned=Number((assigned+distance).toFixed(6));
    return{...segment,distanceKm:distance};
  });
}
function routeCapacityFactor(unit,explicitFactor){
  const explicit=num(explicitFactor);
  if(explicit!==null&&explicit>0)return explicit;
  const descriptor=logisticsUnitDescriptor(unit||'TONNES');
  // Convert only units with declared mass equivalence. Oil/gas volume needs
  // a commodity-specific density/composition before it can be called tonnes.
  return descriptor?.family==='MASS'&&num(descriptor.toTonnes)>0?num(descriptor.toTonnes):1;
}
function resolveSiteRouteLegs(routeProfile){
  const plan=routeProfile?.routePlan||{},rows=Array.isArray(plan.legs)?plan.legs:[];
  const type=String(plan.routeType||'').toUpperCase();
  if(type!=='TRUCK_TO_RAIL_TO_TRUCK'||rows.length<2)return rows;
  const modes=rows.map(row=>normalizeTransportMode(row?.transportMode||row?.mode)).filter(Boolean);
  if(!modes.includes('truck')||!modes.includes('rail')||modes.some(mode=>!['truck','rail'].includes(mode)))return rows;
  const allowed=new Set(modes),preferences=rules()[routeProfile?.resourceId]?.preferredModes||[];
  const chosen=preferences.map(normalizeTransportMode).find(mode=>allowed.has(mode))||(allowed.has('rail')?'rail':'truck');
  const totalDistance=num(plan.estimatedRouteDistanceKm)??rows.reduce((sum,row)=>sum+(num(row?.estimatedDistanceKm??row?.distanceKm??row?.distance)||0),0);
  if(totalDistance===null||!Number.isFinite(totalDistance)||totalDistance<0)return rows;
  const profile=modeRules()[chosen]||{},reference=rows.find(row=>normalizeTransportMode(row?.transportMode||row?.mode)===chosen)||rows[0];
  const speed=Math.max(1,num(profile.speedKmh)||1),loadHours=Math.max(0,num(profile.loadHours)||0),unloadHours=Math.max(0,num(profile.unloadHours)||0);
  const cycleHours=(2*totalDistance/speed)+loadHours+unloadHours;
  const flow=num(plan.capacityBottleneckPerDay)??num(reference?.designCapacityPerDay);
  const payload=num(reference?.designCapacityPerTrip)??num(profile.payloadTonnes);
  const requiredDesignFleetSlots=flow!==null&&flow>0&&payload!==null&&payload>0&&cycleHours>0?
    Math.max(1,Math.ceil((flow/payload)*cycleHours/24)):0;
  return[{
    ...clone(reference),
    legId:'ROUTE_'+String(routeProfile?.siteId||routeProfile?.routeId||'MINE')+'_COMMODITY_MODE_ONLY',
    sequence:1,fromNodeId:rows[0]?.fromNodeId||routeProfile?.siteId||null,fromNodeType:'MINE_SITE',
    toNodeId:rows[rows.length-1]?.toNodeId||plan.destinationWarehouseId||null,
    toNodeType:'COUNTRY_RAW_INVENTORY_WAREHOUSE',transportMode:chosen,vehicleClass:profile.vehicle||reference?.vehicleClass||chosen,
    estimatedDistanceKm:Number(totalDistance.toFixed(6)),
    distanceAuthority:'SIMULATED_TOTAL_ROUTE_DISTANCE_NOT_A_SURVEYED_MODE_PATH',
    estimatedTravelHours:Number((totalDistance/speed).toFixed(6)),
    designCapacityPerTrip:payload,
    designCapacityPerTripUnit:reference?.designCapacityPerTripUnit||'CATALOG_PAYLOAD_PER_TRIP',
    designCapacityPerDay:flow,
    designCapacityUnit:plan.capacityUnit||reference?.designCapacityUnit||'ROUTE_CAPACITY_PER_DAY',
    cycleHoursForOneDesignVehicle:Number(cycleHours.toFixed(6)),
    tripsPerVehiclePerDay:Number((24/cycleHours).toFixed(6)),
    requiredDesignFleetSlots,
    actualBoundFleetUnits:null,vehicleAssetIds:null,
    status:'DESIGN_ONLY_NOT_DISPATCHABLE',
    transportIconKey:chosen==='rail'?'train':chosen,
    transportIconAssetPath:'assets/omega-industrial-icons-v1/transport/'+(chosen==='rail'?'train':chosen)+'.svg',
    transportIconAuthority:'OMEGA_RESOURCE_SITE_LOGISTICS_TRANSPORT_SVG_V1',
    routeSelectionAuthority:'RESOURCE_RULE_PREFERRED_MODE_FROM_UNVERIFIED_INTERMODAL_TEMPLATE'
  }];
}
function siteRouteLegMetrics(countryId,routeProfile,quantity,unitBridge){
  const cid=canonicalCountry(countryId),plan=routeProfile?.routePlan||{},sourceRows=resolveSiteRouteLegs(routeProfile);
  if(!sourceRows.length)return{status:'BLOCKED',reason:'MINE_ROUTE_LEGS_NOT_RECORDED'};
  const declaredTotal=num(plan.estimatedRouteDistanceKm);
  const explicitDistances=sourceRows.map(row=>{
    const distance=num(row?.estimatedDistanceKm??row?.distanceKm??row?.distance);
    return distance!==null&&distance>=0?distance:null;
  });
  const missingCount=explicitDistances.filter(value=>value===null).length;
  if(missingCount)return{status:'BLOCKED',reason:'MINE_ROUTE_LEG_DISTANCE_NOT_RECORDED',
    siteId:String(routeProfile?.siteId||routeProfile?.sourceSiteId||'').trim(),missingLegCount:missingCount,
    declaredRouteDistanceKm:declaredTotal};
  const distances=explicitDistances;
  const totalDistanceKm=distances.reduce((sum,value)=>sum+value,0);
  const factor=Math.max(1e-12,num(unitBridge?.sourceToCapacityFactor)||1);
  const quantityInCapacityUnits=Math.max(0,num(quantity)||0)*factor;
  let totalDays=0;
  const siteId=String(routeProfile?.siteId||routeProfile?.sourceSiteId||'').trim();
  const legs=sourceRows.map((source,index)=>{
    const mode=normalizeTransportMode(source?.transportMode||source?.mode),baseProfile=modeRules()[mode]||modeRules().truck||{};
    const configuredFleet=siteId?storedTransportFleetRecord(cid,siteId,mode):null;
    const overrides=configuredFleet?.profileOverrides||{};
    const profile={...baseProfile,...overrides};
    const infrastructure=infraQuality(cid,mode),distanceKm=Math.max(0,distances[index]||0);
    const speedKmh=Math.max(1,num(profile?.speedKmh)||1);
    const loadHours=Math.max(0,num(profile?.loadHours)??0),unloadHours=Math.max(0,num(profile?.unloadHours)??0);
    const transferHours=Math.max(0,num(source?.transferHours??source?.transferTimeHours)??0);
    const travelHours=distanceKm/speedKmh;
    const qualityFactor=1+(1-Math.max(0,Math.min(1,infrastructure.quality)))*0.5;
    const adjustedTravelHours=travelHours*qualityFactor;
    const totalHours=adjustedTravelHours+loadHours+unloadHours+transferHours;
    const singleTripDays=totalHours/24;
    const payload=Math.max(0.001,num(overrides.payloadTonnes)??num(source?.designCapacityPerTrip)??num(profile?.payloadTonnes)??1);
    const requiredTrips=Math.ceil(quantityInCapacityUnits/payload);
    const countValue=configuredFleet?num(configuredFleet.count):null;
    const declaredFleetCount=countValue!==null?countValue:num(source?.fleetCount??routeProfile?.transportFleet?.[mode]?.count);
    const fleetCount=declaredFleetCount!==null&&declaredFleetCount>=0?Math.floor(declaredFleetCount):null;
    const cycleDays=Math.max(1/24,singleTripDays*2);
    const declaredRouteCapacity=num(source?.designCapacityPerDay);
    const routeCapacityPerDay=Math.max(0,declaredRouteCapacity===null?
      infrastructure.capacityPerDay*infrastructure.quality:declaredRouteCapacity);
    const requiredDesignFleetSlots=routeCapacityPerDay>0?
      Math.max(1,Math.ceil((routeCapacityPerDay/payload)/Math.max(1e-9,24/cycleDays))):0;
    // Unknown actual counts stay unknown. For ETA only, the recorded route design
    // throughput supplies a capacity-derived formation estimate instead of assuming
    // one real vehicle and serializing every load.
    const etaFleetUnits=fleetCount===null?requiredDesignFleetSlots:fleetCount;
    const tripWaves=etaFleetUnits>0?Math.ceil(requiredTrips/etaFleetUnits):0;
    const estimatedLegDays=fleetCount===0?null:(etaFleetUnits>0&&tripWaves>0?
      singleTripDays+Math.max(0,tripWaves-1)*cycleDays:0);
    if(estimatedLegDays!==null)totalDays+=estimatedLegDays;
    const fleetCapacityPerDay=fleetCount===null?null:Number((fleetCount*payload/cycleDays).toFixed(6));
    const dailyCapacity=fleetCapacityPerDay===null?routeCapacityPerDay:
      Math.min(routeCapacityPerDay>0?routeCapacityPerDay:fleetCapacityPerDay,fleetCapacityPerDay);
    const cargoText=tok(source?.cargoClass||routeProfile?.commodityGroup||routeProfile?.resourceId||'');
    const cargoIconClass=/coal|lignite|coke|dry_bulk/.test(cargoText)?'coal-dry-bulk':
      /oil|petroleum|diesel|fuel|crude|liquid/.test(cargoText)?'oil-liquid':
      /gas|lng|methane/.test(cargoText)?'gas-lng':
      /ore|iron|copper|bauxite|aggregate|limestone|gravel|stone|mineral/.test(cargoText)?'ore-aggregate':'general-cargo';
    const iconMode=mode==='rail'?'train':mode;
    const cargoIconPath='assets/omega-industrial-icons-v1/transport/cargo/'+cargoIconClass+'/'+iconMode+'.svg';
    return{...clone(source),mode,transportMode:mode,distanceKm:Number(distanceKm.toFixed(6)),speedKmh,
      loadHours,unloadHours,transferHours,travelHours:Number(travelHours.toFixed(6)),
      adjustedTravelHours:Number(adjustedTravelHours.toFixed(6)),singleTripTravelDays:Number(singleTripDays.toFixed(6)),
      travelDays:estimatedLegDays===null?null:Number(estimatedLegDays.toFixed(6)),tripWaves,cycleDays:Number(cycleDays.toFixed(6)),
      payloadTonnes:payload,units:requiredTrips,vehicleCount:requiredTrips,requiredTrips,requiredVehicleCount:requiredTrips,fleetCount,
      fleetCountConfigured:fleetCount!==null,fleetCapacityPerDay,dailyFleetCycleDays:Number(cycleDays.toFixed(6)),
      fleetSufficiency:fleetCount===null?null:fleetCount>=requiredTrips,
      capacityPerDay:dailyCapacity,cargoIconClass,cargoIconPath,
      distanceAuthority:source?.distanceAuthority||routeProfile?.provenance?.authority||'SCENARIO_LOGISTICS_DESIGN_ONLY',
      timeAuthority:fleetCount===null?'SERIAL_TRIP_ESTIMATE_FLEET_COUNT_UNKNOWN':'VERSIONED_PROFILE_AND_CONFIGURED_FLEET_COUNT',
      capacityAuthority:fleetCount!==null?'COUNTRY_SITE_TRANSPORT_TYPE_COUNT_AND_VERSIONED_TRANSPORT_CATALOG':
        source?.designCapacityPerTrip!=null?'ROUTE_LEG_PER_TRIP_CAPACITY':'VERSIONED_TRANSPORT_CATALOG'};
  });
  const declaredCapacity=num(plan.capacityBottleneckPerDay);
  const capacities=legs.map(leg=>num(leg.capacityPerDay)).filter(value=>value!==null&&value>=0);
  const capacityPerDay=Math.max(0,Math.min(declaredCapacity!==null?declaredCapacity:Infinity,
    capacities.length?Math.min(...capacities):Infinity));
  const fleetCountsByMode=Object.create(null),requiredTripsByMode=Object.create(null);
  legs.forEach(leg=>{
    requiredTripsByMode[leg.mode]=(requiredTripsByMode[leg.mode]||0)+(num(leg.requiredTrips)||0);
    if(!Object.prototype.hasOwnProperty.call(fleetCountsByMode,leg.mode)){
      fleetCountsByMode[leg.mode]={count:leg.fleetCount,configured:leg.fleetCountConfigured===true};
    }
  });
  const configuredFleetUnitCount=Object.values(fleetCountsByMode).reduce((sum,row)=>sum+(row.configured?Math.max(0,num(row.count)||0):0),0);
  const unconfiguredTransportModeCount=Object.values(fleetCountsByMode).filter(row=>!row.configured).length;
  const zeroFleetModes=legs.filter(leg=>leg.fleetCount===0).map(leg=>leg.mode);
  const blockedByZeroFleet=zeroFleetModes.length>0;
  return{status:blockedByZeroFleet?'BLOCKED':'READY',reason:blockedByZeroFleet?'TRANSPORT_FLEET_UNAVAILABLE':null,
    legs,totalDistanceKm:Number(totalDistanceKm.toFixed(6)),
    travelTimeDays:blockedByZeroFleet?null:Number(totalDays.toFixed(6)),
    capacityPerDay:Number.isFinite(capacityPerDay)?capacityPerDay:null,
    quantityInCapacityUnits,quantityCapacityFactor:factor,
    requiredTripsByMode, fleetCountsByMode,configuredFleetUnitCount,unconfiguredTransportModeCount,
    routeType:String(plan.routeType||'').toUpperCase()==='TRUCK_TO_RAIL_TO_TRUCK'&&legs.length===1?String(legs[0].mode||'').toUpperCase()+'_ONLY':plan.routeType,
    routeSelectionAuthority:String(plan.routeType||'').toUpperCase()==='TRUCK_TO_RAIL_TO_TRUCK'&&legs.length===1?'RESOURCE_RULE_PREFERRED_MODE_FROM_UNVERIFIED_INTERMODAL_TEMPLATE':'EXPLICIT_SITE_ROUTE_PROFILE',
    routeLegCount:legs.length,distinctTransportModeCount:Object.keys(fleetCountsByMode).length,
    vehiclesByMode:legs.reduce((out,leg)=>{out[leg.mode]=(out[leg.mode]||0)+(num(leg.vehicleCount)||0);return out;},{}),
    vehicleCount:legs.reduce((sum,leg)=>sum+(num(leg.vehicleCount)||0),0),
    etaAuthority:unconfiguredTransportModeCount?'ROUTE_DESIGN_CAPACITY_ETA_ESTIMATE_NOT_ACTUAL_FLEET_COUNT':'CONFIGURED_COUNTRY_SITE_TRANSPORT_TYPE_COUNTS',
    authority:'VERSIONED_TRANSPORT_CATALOG_AND_SITE_ROUTE_LEG_DATA'};
}
async function previewSiteTransport(input={}){
  const cid=canonicalCountry(input.countryId),sid=String(input.siteId||'').trim();
  if(!cid||!sid)return{status:'BLOCKED',reason:'SITE_TRANSPORT_PREVIEW_COUNTRY_AND_SITE_REQUIRED'};
  const selected=playerSimulationCountryId();
  if(selected&&selected!==cid)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:selected};
  const loaded=await loadSiteLogisticsRoutes(cid);
  if(loaded.status!=='READY')return{status:'BLOCKED',reason:loaded.reason||'SITE_LOGISTICS_ROUTES_NOT_READY',detail:loaded,countryId:cid,siteId:sid};
  const routeProfile=siteLogisticsRouteFor(cid,sid);
  if(!routeProfile)return{status:'BLOCKED',reason:'SITE_LOGISTICS_ROUTE_NOT_RECORDED',countryId:cid,siteId:sid};
  const quantity=Math.max(0,num(input.quantity)??0),unit=input.unit||routeProfile?.quantityUnitBridge?.sourceProductionUnit||null;
  const unitBridge=siteLogisticsUnitBridge(routeProfile,unit);
  if(!['READY','SIMULATION_ONLY'].includes(String(unitBridge?.status||'')))return{status:'BLOCKED',reason:unitBridge?.reason||'SITE_TRANSPORT_UNIT_BRIDGE_UNAVAILABLE',
    countryId:cid,siteId:sid,unitBridge:clone(unitBridge)};
  const metrics=siteRouteLegMetrics(cid,routeProfile,quantity,unitBridge);
  return{...metrics,countryId:cid,siteId:sid,routeId:routeProfile.routeId||null,requestedQuantity:quantity,unit,
    individualVehicleIdsRequired:false,transportTypes:(metrics.legs||[]).map(leg=>({
      transportType:leg.transportMode,count:leg.fleetCount,requiredVehicleCount:leg.requiredVehicleCount,
      fleetCapacityPerDay:leg.fleetCapacityPerDay,capacityPerDay:leg.capacityPerDay,
      travelDays:leg.travelDays,fleetSufficiency:leg.fleetSufficiency,cargoIconClass:leg.cargoIconClass,cargoIconPath:leg.cargoIconPath
    }))};
}
function routeSegments(site,asset,resourceId,mode,countryId,input={}){
  const cid=canonicalCountry(countryId),f=asset||{},s=site||{};
  const normalizeAccess=value=>normalizeTransportMode(value);
  const access=Array.isArray(f.transportAccess)?f.transportAccess.map(normalizeAccess).filter(Boolean):[];
  const preferred=(rules()[resourceId]?.preferredModes||[]).map(normalizeAccess).filter(Boolean);
  let chosen=normalizeAccess(mode)||'truck';
  const explicitMode=input.transportMode!==undefined&&input.transportMode!==null&&String(input.transportMode).trim()!=='';
  const directRows=[
    f.routePlan?.legs,f.logisticsRoutePlan?.legs,f.transportRoute?.legs,f.simulation?.transportRoute?.legs,
    s.routePlan?.legs,s.logisticsRoutePlan?.legs,s.transportRoute?.legs,s.simulation?.transportRoute?.legs
  ].find(rows=>Array.isArray(rows)&&rows.length&&rows.every(row=>row&&normalizeAccess(row.transportMode||row.mode)));
  if(directRows){
    return directRows.map((row,index)=>({
      mode:normalizeAccess(row.transportMode||row.mode),
      distanceKm:num(row.estimatedDistanceKm??row.distanceKm??row.distance),
      designCapacityPerTrip:num(row.designCapacityPerTrip??row.payloadTonnes),
      transferHours:num(row.transferHours??row.transferTimeHours)??0,
      edgeClass:String(row.edgeClass||row.legType||row.routeLegType||('EXPLICIT_ROUTE_LEG_'+(index+1))),
      sourceAuthority:String(row.distanceAuthority||row.sourceAuthority||row.authority||'EXPLICIT_ROUTE_PROFILE'),
      routeLegId:row.legId||row.id||null
    }));
  }
  const directArrays=[
    f.transportRoute,f.simulation?.transportRoute,s.transportRoute,s.simulation?.transportRoute
  ].filter(rows=>Array.isArray(rows)&&rows.length);
  const matchingArray=directArrays.find(rows=>rows.length>1||
    normalizeAccess(rows[0]?.transportMode||rows[0]?.mode)===chosen);
  if(matchingArray){
    return matchingArray.map((row,index)=>({
      mode:normalizeAccess(row.transportMode||row.mode),
      distanceKm:num(row.estimatedDistanceKm??row.distanceKm??row.distance??row.km),
      designCapacityPerTrip:num(row.designCapacityPerTrip??row.payloadTonnes),
      transferHours:num(row.transferHours??row.transferTimeHours)??0,
      edgeClass:String(row.edgeClass||row.legType||row.routeLegType||('EXPLICIT_ROUTE_LEG_'+(index+1))),
      sourceAuthority:String(row.distanceAuthority||row.sourceAuthority||row.authority||'EXPLICIT_ROUTE_PROFILE'),
      routeLegId:row.legId||row.id||null
    }));
  }
  if(access.length&&!access.includes(chosen)){
    if(explicitMode)return[];
    const fallback=preferred.find(candidate=>access.includes(candidate))||access[0];
    if(!fallback)return[];
    chosen=fallback;
  }
  const distance=corridorDistance(s,f,chosen,resourceId);
  const sameNode=String(f.siteId||f.locationNodeKey||'').toUpperCase()===String(s.siteId||s.locationNodeKey||'').toUpperCase();
  if(sameNode){
    const localDistance=num(f.localTransferDistanceKm??s.localTransferDistanceKm);
    return[{mode:chosen,distanceKm:localDistance===null?0:Math.max(0,localDistance),
      edgeClass:'SAME_SITE_LOCAL_TRANSFER',sourceAuthority:localDistance===null?'SAME_SITE_ZERO_DISTANCE_ESTIMATE':'SITE_LOCAL_TRANSFER_DISTANCE'}];
  }
  const modeEdges={
    truck:'ROAD_CORRIDOR',
    rail:'HEAVY_RAIL_CORRIDOR',
    ship:'SEA_LANE',
    barge:'INLAND_WATERWAY_CORRIDOR',
    pipeline:'PIPELINE_CORRIDOR'
  };
  if(!modeEdges[chosen])return[];
  return[{mode:chosen,distanceKm:num(distance.distanceKm),
    edgeClass:modeEdges[chosen],sourceAuthority:distance.authority||'SIMULATED_CORRIDOR_MODEL'}];
}
function buildRoute(site,asset,resourceId,requestedQuantity,input={}){
  const cid=canonicalCountry(input.countryId||site?.countryId);
  const mode=normalizeTransportMode(input.transportMode||rules()[resourceId]?.preferredModes?.[0]||'truck')||'truck';
  const segments=routeSegments(site,asset,resourceId,mode,cid,input),quantity=Math.max(0,num(requestedQuantity)||0);
  if(!segments.length)return{status:'BLOCKED',reason:'TRANSPORT_MODE_UNAVAILABLE_FOR_ROUTE',countryId:cid,
    requestedTransportMode:mode,sourceSiteId:input.sourceSiteId||site?.siteId||null,routePath:[],vehiclePlan:[],
    capacityAuthority:'NO_SUPPORTED_ROUTE_MODE',distanceAuthority:'NOT_AVAILABLE'};
  if(segments.some(segment=>num(segment.distanceKm)===null||num(segment.distanceKm)<0)){
    return{status:'BLOCKED',reason:'ROUTE_LEG_DISTANCE_UNAVAILABLE',countryId:cid,requestedTransportMode:mode,
      sourceSiteId:input.sourceSiteId||site?.siteId||null,routePath:segments.map(x=>x.edgeClass),legs:clone(segments),vehiclePlan:[],
      distanceAuthority:'EXPLICIT_ROUTE_DISTANCE_REQUIRED'};
  }
  const unit=input.unit||'TONNES',capacityFactor=routeCapacityFactor(unit,input.quantityToCapacityFactor),cargoQuantity=quantity*capacityFactor;
  const fleetSiteId=String(input.sourceSiteId||site?.siteId||'').trim();
  let totalDays=0,totalCost=0,limitingCapacity=Infinity,vehiclePlan=[];
  for(const seg of segments){
    const m=modeRules()[seg.mode]||modeRules().truck,iq=infraQuality(cid,seg.mode);
    const distance=Math.max(0,num(seg.distanceKm)||0),speedKmh=Math.max(1,num(m.speedKmh)||1);
    const loadHours=Math.max(0,num(m.loadHours)??0),unloadHours=Math.max(0,num(m.unloadHours)??0);
    const transferHours=Math.max(0,num(seg.transferHours??seg.transferTimeHours)??0);
    const travelHours=distance/speedKmh,qualityFactor=1+(1-Math.max(0,Math.min(1,iq.quality)))*.5;
    const adjustedTravelHours=travelHours*qualityFactor;
    const totalHours=adjustedTravelHours+loadHours+unloadHours+transferHours,days=totalHours/24;
    const payload=Math.max(.001,num(seg.designCapacityPerTrip)||num(m.payloadTonnes)||1);
    const storedFleet=fleetSiteId?storedTransportFleetRecord(cid,fleetSiteId,seg.mode):null;
    const fleetCount=storedFleet?finiteCount(storedFleet.count):null;
    const cycleHours=Math.max(1,(travelHours*2*qualityFactor)+loadHours+unloadHours+transferHours);
    const fleetCapacityPerDay=fleetCount===null?null:Number((fleetCount*payload*24/cycleHours).toFixed(6));
    const infrastructureCapacityPerDay=Math.max(0,iq.capacityPerDay*iq.quality);
    const capacityPerDay=fleetCapacityPerDay===null?infrastructureCapacityPerDay:
      Math.min(infrastructureCapacityPerDay,fleetCapacityPerDay);
    const capacityPerTurn=capacityPerDay*daysPerTurn();
    const units=Math.ceil(cargoQuantity/payload);
    const tripWaves=fleetCount===null?units:(fleetCount>0?Math.ceil(units/fleetCount):0);
    const tripCycleDays=cycleHours/24;
    const legTotalDays=fleetCount===0?null:(tripWaves>0?days+Math.max(0,tripWaves-1)*tripCycleDays:0);
    if(legTotalDays!==null)totalDays+=legTotalDays;
    limitingCapacity=Math.min(limitingCapacity,capacityPerTurn);
    totalCost+=cargoQuantity*distance*(num(m.costPerTonneKm)||.05);
    vehiclePlan.push({mode:seg.mode,vehicle:m.vehicle,units,vehicleCount:units,requiredTrips:units,
      fleetCount,fleetCountConfigured:fleetCount!==null,tripWaves,tripCycleDays:Number(tripCycleDays.toFixed(6)),
      estimatedLegTravelDays:legTotalDays===null?null:Number(legTotalDays.toFixed(6)),
      payloadTonnes:payload,distanceKm:Number(distance.toFixed(6)),speedKmh,loadHours,unloadHours,transferHours,
      travelHours:Number(travelHours.toFixed(6)),adjustedTravelHours:Number(adjustedTravelHours.toFixed(6)),
      singleTripTravelDays:Number(days.toFixed(6)),travelDays:legTotalDays===null?null:Number(legTotalDays.toFixed(6)),fleetCapacityPerDay,capacityPerDay,capacityPerTurn,
      dispatchQuantity:Number(quantity.toFixed(6)),edgeClass:seg.edgeClass,sourceAuthority:seg.sourceAuthority,
      routeLegId:seg.routeLegId||null,
      capacityAuthority:fleetCount===null?'UNCONFIGURED_SIMULATION_CAPACITY_FALLBACK':'COUNTRY_SITE_TRANSPORT_TYPE_COUNT',
      timeAuthority:fleetCount===null?'SERIAL_TRIP_ESTIMATE_FLEET_COUNT_UNKNOWN':'VERSIONED_PROFILE_AND_CONFIGURED_FLEET_COUNT'});
  }
  const dispatchQuantity=Math.min(quantity,Math.max(0,limitingCapacity/capacityFactor));
  const hasZeroFleet=vehiclePlan.some(leg=>leg.fleetCountConfigured&&leg.fleetCount===0);
  const estimatedTotalDays=hasZeroFleet?null:totalDays;
  const path=vehiclePlan.map(x=>x.edgeClass),etaTurn=estimatedTotalDays===null?null:turn()+Math.max(1,Math.ceil(estimatedTotalDays/daysPerTurn()));
  const routeSourceSiteId=input.sourceSiteId||site?.siteId||null;
  const routeSourceNode=input.sourceNode||nodeToken(input.sourceNodeType||'MINE',cid,site?.siteId);
  const routeModes=[...new Set(vehiclePlan.map(x=>x.mode))];
  const effectiveMode=routeModes.length===1?routeModes[0]:(routeModes.includes('ship')?'ship':routeModes.includes('rail')?'rail':routeModes[0]||mode);
  const route={status:dispatchQuantity>0?'PLANNED':'BLOCKED',routeId:'IR:'+h32(JSON.stringify({cid,site:routeSourceSiteId,sourceNode:routeSourceNode,factory:asset?.id||asset?.assetId||asset?.projectId,resourceId,mode:effectiveMode,path})).toString(16),
    countryId:cid,sourceSiteId:routeSourceSiteId,sourceWarehouseId:input.sourceWarehouseId||null,sourceNode:routeSourceNode,
    destinationFactoryId:String(asset?.id||asset?.assetId||asset?.projectId||''),destinationNode:nodeToken('FACTORY',cid,asset?.id||asset?.assetId||asset?.projectId),
    resourceId,requestedQuantity:quantity,dispatchQuantity:Number(dispatchQuantity.toFixed(6)),unit,transportMode:effectiveMode,
    routePath:path,legs:vehiclePlan,totalDistanceKm:Number(vehiclePlan.reduce((sum,leg)=>sum+leg.distanceKm,0).toFixed(6)),
    travelTimeDays:estimatedTotalDays===null?null:(Number.isFinite(estimatedTotalDays)?Number(estimatedTotalDays.toFixed(6)):null),etaTurn,etaYear:estimatedTotalDays===null?null:year()+Math.floor(estimatedTotalDays/365),vehiclePlan,
    totalCost:Number(totalCost.toFixed(4)),capacityQuantityFactor:capacityFactor,capacityQuantityUnit:'CARGO_CAPACITY_UNITS',
    vehicleCount:vehiclePlan.reduce((sum,leg)=>sum+leg.vehicleCount,0),
    vehiclesByMode:vehiclePlan.reduce((out,leg)=>{out[leg.mode]=(out[leg.mode]||0)+leg.vehicleCount;return out;},{}),
    fleetCountByMode:vehiclePlan.reduce((out,leg)=>{if(!Object.prototype.hasOwnProperty.call(out,leg.mode))out[leg.mode]={count:leg.fleetCount,configured:leg.fleetCountConfigured};return out;},{}),
    totalFleetUnitsConfigured:vehiclePlan.reduce((out,leg)=>Object.prototype.hasOwnProperty.call(out.seen,leg.mode)?out:(out.seen[leg.mode]=true,out.total+=(leg.fleetCount||0),out),{total:0,seen:{}}).total,
    routeLegCount:vehiclePlan.length,distinctTransportModeCount:routeModes.length,
    capacityAuthority:vehiclePlan.some(x=>x.fleetCountConfigured)?'CONFIGURED_FLEET_AND_INFRASTRUCTURE':'INFRASTRUCTURE_MODEL',
    distanceAuthority:vehiclePlan.every(x=>x.sourceAuthority==='SITE_SIMULATION_ROUTE')?'SITE_SIMULATION_ROUTE':'SIMULATED_CORRIDOR_MODEL',
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
  let candidates=candidateFactories(cid,rid);
  const sourceSiteId=String(site?.siteId||'').trim();
  const sourceSiteFactories=candidates.filter(({asset})=>
    String(asset?.sourceSiteId||asset?.siteId||'').trim()===sourceSiteId);
  // When a physical site has its own commissioned factory, route only to that factory.
  // Otherwise the shortest-route planner may send this mine's batch to another mine's
  // dedicated factory simply because it happens to be geographically closer.
  if(sourceSiteFactories.length){
    if(input.factoryId){
      const chosen=sourceSiteFactories.find(x=>
        String(x.asset?.id||x.asset?.assetId||x.asset?.projectId)===String(input.factoryId));
      if(!chosen)return{status:'BLOCKED',reason:'SOURCE_SITE_FACTORY_BINDING_MISMATCH',
        siteId:sourceSiteId,requestedFactoryId:String(input.factoryId),
        requiredFactoryIds:sourceSiteFactories.map(x=>String(x.asset?.id||x.asset?.assetId||x.asset?.projectId))};
      candidates=[chosen];
    }else{
      candidates=sourceSiteFactories;
    }
  }else if(input.factoryId){
    const chosen=candidates.find(x=>String(x.asset?.id||x.asset?.assetId||x.asset?.projectId)===String(input.factoryId));
    if(!chosen)return{status:'BLOCKED',reason:'FACTORY_NOT_CAPABLE'};
    candidates=[chosen];
  }
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
  const free=Math.max(0,available-reserved);
  const requested=Math.max(0,num(quantity)||0);
  const approved=Math.min(requested,free);
  if(approved<=1e-9)return{ok:false,reason:'WAREHOUSE_AVAILABLE_AFTER_RESERVATIONS_TOO_LOW',
    available:free,requestedQuantity:requested,dispatchableQuantity:0};
  w.reservedByResource[resourceId]=reserved+approved;
  n.reservations[shipmentId]={resourceId,quantity:approved,status:'RESERVED'};
  return{ok:true,quantity:approved,requestedQuantity:requested,adjusted:approved+1e-6<requested,
    reason:approved+1e-6<requested?'WAREHOUSE_AVAILABLE_AFTER_RESERVATIONS':'SOURCE_BATCH_WITHIN_AVAILABLE_WAREHOUSE_BALANCE'};
}
function resizeRouteForDispatch(route,actualQuantity,plannedQuantity){
  const out=clone(route||{}),actual=Math.max(0,num(actualQuantity)||0);
  const planned=Math.max(0,num(plannedQuantity)??num(out.dispatchQuantity)??num(out.requestedQuantity)??actual);
  const costBasis=Math.max(0,num(out.requestedQuantity)??planned);
  out.plannedDispatchQuantity=planned;
  out.dispatchQuantity=Number(actual.toFixed(6));
  if(costBasis>1e-9&&num(out.totalCost)!==null)
    out.totalCost=Number((num(out.totalCost)*actual/costBasis).toFixed(4));
  for(const key of ['vehiclePlan','legs']){
    if(Array.isArray(out[key]))out[key]=out[key].map(leg=>{
      const payload=Math.max(.001,num(leg?.payloadTonnes)||1),factor=Math.max(1e-12,num(out.capacityQuantityFactor)||1);
      return{...leg,units:Math.ceil(actual*factor/payload),vehicleCount:Math.ceil(actual*factor/payload),dispatchQuantity:Number(actual.toFixed(6))};
    });
  }
  const legRows=Array.isArray(out.vehiclePlan)?out.vehiclePlan:(Array.isArray(out.legs)?out.legs:[]);
  out.vehicleCount=legRows.reduce((sum,leg)=>sum+(num(leg?.vehicleCount??leg?.units)||0),0);
  out.vehiclesByMode=legRows.reduce((totals,leg)=>{
    const mode=tok(leg?.mode||leg?.transportMode);
    if(mode)totals[mode]=(totals[mode]||0)+(num(leg?.vehicleCount??leg?.units)||0);
    return totals;
  },{});
  out.status=actual>1e-9?'PLANNED':'BLOCKED';
  return out;
}
function dispatchShipment(input={}){
  const cid=canonicalCountry(input.countryId);
  const sourceBatchId=String(input.batchId||'').trim();
  if(cid&&sourceBatchId){
    const inTransit=netState(cid).shipments.find(x=>String(x?.batchId||'')===sourceBatchId&&String(x?.status||'')==='IN_TRANSIT'&&String(x?.shipmentType||'')!=='MINE_TO_WAREHOUSE');
    if(inTransit)return{status:'DISPATCHED',shipment:inTransit,idempotent:true};
  }
  const plan=planShipment(input);if(plan.status!=='PLANNED')return plan;
  const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const dispatchBlockade=strategicPolicy?.isRouteBlocked?.(cid,{resourceId:plan.resourceId,transportMode:plan.route?.transportMode,routeId:plan.route?.routeId,siteId:plan.siteId,factoryId:plan.factoryId});
  if(dispatchBlockade?.blocked)return{status:'BLOCKED',reason:dispatchBlockade.reason||'RESOURCE_ROUTE_BLOCKADE_ACTIVE',policy:dispatchBlockade,plan};
  const plannedQuantity=Math.max(0,num(plan.route.dispatchQuantity)||0);
  let quantity=plannedQuantity,quantityAdjustmentReason=null;
  const sourceBatch=sourceBatchId?
    (Array.isArray(resourceState(cid).batches)?resourceState(cid).batches.find(x=>String(x?.batchId||'')===sourceBatchId):null):null;
  if(sourceBatchId){
    const inTransit=netState(cid).shipments.find(x=>String(x?.batchId||'')===sourceBatchId&&String(x?.status||'')==='IN_TRANSIT'&&String(x?.shipmentType||'')!=='MINE_TO_WAREHOUSE');
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
  const shipmentId='SHIP:'+h32(JSON.stringify({plan,turn:turn(),salt:frac(input.siteId||'')}));
  const duplicateShipment=netState(cid).shipments.find(x=>String(x?.shipmentId||'')===shipmentId);
  if(duplicateShipment)return{status:'DISPATCHED',shipment:duplicateShipment,idempotent:true};
  const capacityFactor=Math.max(1e-12,num(plan.route?.capacityQuantityFactor)||1);
  const capacityPreview=previewTransportCapacity(cid,plan.route,quantity,capacityFactor);
  if(capacityPreview.status!=='READY')return{status:'BLOCKED',reason:capacityPreview.reason||'TRANSPORT_CAPACITY_EXHAUSTED',capacity:capacityPreview,plan};
  if(capacityPreview.allowedQuantity+quantityEpsilon<quantity){
    quantityAdjustmentReason='SHARED_TURN_TRANSPORT_CAPACITY';
    quantity=capacityPreview.allowedQuantity;
  }
  if(quantity<=0)return{status:'BLOCKED',reason:'SOURCE_BATCH_QUANTITY_ZERO',batchId:sourceBatchId||null,plan,capacity:capacityPreview};
  const reserved=reserveInventoryForShipment(cid,plan.resourceId,quantity,shipmentId);if(!reserved.ok)return{status:'BLOCKED',reason:reserved.reason,details:reserved,plan};
  if(Number.isFinite(Number(reserved.quantity))&&reserved.quantity>0&&reserved.quantity<quantity){
    quantity=reserved.quantity;quantityAdjustmentReason='WAREHOUSE_AVAILABLE_AFTER_RESERVATIONS';
  }
  const route=resizeRouteForDispatch(plan.route,quantity,plannedQuantity);
  const capacityUse=commitTransportCapacity(cid,route,quantity,shipmentId,capacityFactor);
  route.capacityUse=capacityUse;
  if(quantity<plannedQuantity)route.quantityAdjustment={reason:quantityAdjustmentReason||'SOURCE_BATCH_OR_LOT_ROUNDING_CAP',plannedQuantity,actualQuantity:quantity};
  const shipmentTravelDays=Math.max(0,num(route.travelTimeDays)||0);
  const shipmentEtaTurns=Math.max(1,num(route.etaTurn)-turn());
  const shipmentEtaDate=factoryAddGameDays(factoryCurrentGameDate(),shipmentEtaTurns*daysPerTurn());
  const s={shipmentId,shipmentType:'RAW_TO_FACTORY',countryId:cid,siteId:plan.siteId,resourceId:plan.resourceId,factoryId:plan.factoryId,quantity,unit:input.unit||'TONNES',
    batchId:sourceBatchId||null,occurrenceKey:input.occurrenceKey||sourceBatch?.occurrenceKey||null,
    warehouseId:input.warehouseId||sourceBatch?.warehouseId||('WH-'+cid+'-RAW'),
    status:'IN_TRANSIT',createdTurn:turn(),createdDate:factoryCurrentGameDate(),etaTurn:route.etaTurn,etaDate:shipmentEtaDate,route,reservationId:shipmentId,transportCapacityReservation:capacityUse,
    provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:route.distanceAuthority,sourceBatchId:sourceBatchId||null,
      sourceAuthority:sourceBatch?.provenance?.sourceAuthority||sourceBatch?.provenance?.authority||'UNOBSERVED',
      sourceBatchQuantity:sourceBatch?Math.max(0,num(sourceBatch.remainingQuantity!=null?sourceBatch.remainingQuantity:sourceBatch.quantity)||0):null,
      plannedDispatchQuantity:plannedQuantity,actualDispatchQuantity:quantity}};
  const n=netState(cid);n.shipments.push(s);n.shipments=n.shipments.slice(-MAX_SHIPMENTS);
  // Mine-logistics batches can be split across the mine, raw warehouse and a downstream
  // factory leg. Keep legacy warehouse transfers on their established location semantics.
  const flowForDispatch=sourceBatchId?siteFlowRows(cid).find(row=>String(row.batchId||'')===sourceBatchId):null;
  const isMineLogisticsBatch=!!(flowForDispatch?.mineLogisticsRouteId||flowForDispatch?.mineLogisticsStockDebited===true);
  if(sourceBatch&&isMineLogisticsBatch){
    const mixedLocation='MIXED:RAW_WAREHOUSE_OR_TRANSIT';
    sourceBatch.warehouseId=null;sourceBatch.locationNodeKey=mixedLocation;sourceBatch.currentLocationNodeId=null;
    sourceBatch.lastMovementType='RAW_TO_FACTORY_DISPATCH';sourceBatch.lastMovementTurn=turn();
    const dispatchLot=sourceBatchId?resourceState(cid).inventoryLots?.[sourceBatchId]:null;
    if(dispatchLot){
      dispatchLot.warehouseId=null;dispatchLot.locationNodeKey=mixedLocation;
      dispatchLot.lastMovementType='RAW_TO_FACTORY_DISPATCH';dispatchLot.lastMovementTurn=turn();
    }
    const dispatchWarehouse=resourceState(cid).warehouse||{};
    if(Array.isArray(dispatchWarehouse.storedBatchIds)){
      const batchStillHasWarehouseQuantity=Math.max(0,
        (num(sourceBatch.remainingQuantity!=null?sourceBatch.remainingQuantity:sourceBatch.quantity)||0)-
        (num(flowForDispatch?.mineHeldQuantity)||0)-
        n.shipments.filter(item=>String(item.batchId||'')===sourceBatchId&&
          ['MINE_TO_WAREHOUSE','RAW_TO_FACTORY'].includes(String(item.shipmentType||''))&&
          ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE','BLOCKED_LEDGER_MISMATCH'].includes(String(item.status||'')))
          .reduce((sum,item)=>sum+Math.max(0,num(item.quantity)||0),0));
      if(batchStillHasWarehouseQuantity<=1e-6)
        dispatchWarehouse.storedBatchIds=dispatchWarehouse.storedBatchIds.filter(value=>String(value)!==sourceBatchId);
    }
  }
  if(sourceBatchId)updateSiteFlow(cid,sourceBatchId,row=>{
    row.shipmentId=s.shipmentId;row.shipmentIds=[...new Set([...(row.shipmentIds||[]),s.shipmentId])];
  });
  emit('OMEGA_RESOURCE_SHIPMENT_CREATED',cid,s);
  return{status:'DISPATCHED',shipment:s};
}
function dispatchResidualSiteBatches(c){
  const cid=canonicalCountry(c),rs=resourceState(cid),network=netState(cid);
  const selectedPlayer=playerSimulationCountryId();
  for(const flow of siteFlowRows(cid).slice()){
    if(flow?.mineLogisticsRouteId&&selectedPlayer!==cid)continue;
    const batchId=String(flow.batchId||'').trim();
    const lastDispatchTurn=flow.mineLogisticsRouteId
      ?Number(flow.lastFactoryResidualDispatchTurn):Number(flow.lastResidualDispatchTurn);
    if(!batchId||lastDispatchTurn===turn())continue;
    // A mine haul in transit does not make the already-received warehouse portion unavailable.
    // The received-minus-factory-dispatched balance below decides if a factory leg can start.
    if(['PENDING_ROUTE_PROFILE','MINE_LOGISTICS_BLOCKED'].includes(String(flow.mineLogisticsStatus||'')))continue;
    const source=Array.isArray(rs.batches)?rs.batches.find(x=>String(x?.batchId||'')===batchId):null;
    if(!source)continue;
    let remaining=Math.max(0,num(source.remainingQuantity!=null?source.remainingQuantity:source.quantity)||0);
    if(flow.mineLogisticsRouteId){
      const received=Math.max(0,num(flow.mineWarehouseReceivedQuantity)||0),factoryDispatched=Math.max(0,num(flow.factoryDispatchedQuantity)||0);
      remaining=Math.min(remaining,Math.max(0,received-factoryDispatched));
    }
    // Compare the dispatchable receipt balance, not a ppm of the geological batch.
    // A very large reserve may legitimately deliver a small first shipment; scaling
    // this epsilon to the whole reserve silently stranded that received warehouse cargo.
    const epsilon=1e-6;
    if(remaining<=epsilon)continue;
    // Mine-logistics batches can have a received portion in the warehouse while a
    // residual portion is still moving from the mine. Only an active factory-bound leg
    // may block another factory dispatch; a mine-haul leg must not strand received cargo.
    const activeFactoryLeg=network.shipments.some(x=>String(x?.batchId||'')===batchId&&
      ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE','BLOCKED_LEDGER_MISMATCH'].includes(String(x?.status||''))&&
      (!flow.mineLogisticsRouteId||String(x?.shipmentType||'')==='RAW_TO_FACTORY'));
    if(activeFactoryLeg)continue;
    const site=siteById(flow.siteId)||flow.siteSnapshot||{
      siteId:flow.siteId,countryId:cid,siteName:flow.siteName,real:{resourceId:flow.resourceId},
      sourceSiteRecord:{siteId:flow.siteId,resourceId:flow.resourceId,countryCode:cid,commercialExtraction:true},
      identity:{resourceTypeId:flow.resourceId},operation:{commercialExtraction:true},simulation:{transportRoute:[]},
      runtime:{identityAuthority:'ENDOWMENT_OCCURRENCE_FALLBACK',quantityAuthority:'SIMULATION_RUNTIME'}
    };
    const sent=dispatchShipment({countryId:cid,siteId:site.siteId,resourceId:flow.resourceId,quantity:remaining,
      unit:flow.unit||source.unit||'TONNES',transportMode:flow.route?.transportMode||site.simulation?.transportRoute?.[0]?.mode||undefined,
      factoryId:flow.factoryId,batchId,occurrenceKey:flow.occurrenceKey,warehouseId:flow.warehouseId||source.warehouseId||('WH-'+cid+'-RAW')});
    if(flow.mineLogisticsRouteId)flow.lastFactoryResidualDispatchTurn=turn();
    else flow.lastResidualDispatchTurn=turn();
    if(sent.status==='DISPATCHED'){
      flow.shipmentId=sent.shipment.shipmentId;
      flow.shipmentIds=[...new Set([...(flow.shipmentIds||[]),sent.shipment.shipmentId])];
      if(flow.mineLogisticsRouteId){
        const shippedQuantity=Math.max(0,num(sent.shipment.quantity)||0);
        flow.factoryDispatchedQuantity=(num(flow.factoryDispatchedQuantity)||0)+shippedQuantity;
        const siteRuntime=siteLogisticsState(cid,flow.siteId,siteLogisticsRouteFor(cid,flow.siteId));
        if(siteRuntime){
          siteRuntime.factoryDispatchedQuantity=(num(siteRuntime.factoryDispatchedQuantity)||0)+shippedQuantity;
          siteRuntime.currentStage='RAW_TO_FACTORY';
          trackActiveSiteShipment(siteRuntime,sent.shipment.shipmentId,'RAW_TO_FACTORY');
          siteRuntime.shipmentIds=[...new Set([...siteRuntime.shipmentIds,sent.shipment.shipmentId])];
          appendSiteLogisticsStage(siteRuntime,'RAW_TO_FACTORY','IN_TRANSIT_TO_FACTORY',{shipmentId:sent.shipment.shipmentId,batchId,
            quantity:shippedQuantity,unit:sent.shipment.unit,etaTurn:sent.shipment.etaTurn,etaDate:sent.shipment.etaDate,factoryId:sent.shipment.factoryId});
        }
      }
      flow.quantity=Math.max(num(flow.quantity)||0,remaining);
      flow.route=clone(sent.shipment.route);
      flow.blockReason=null;flow.lastResidualBlockReason=null;flow.transportQueueReason=null;
      addFlowStage(flow,'TRANSPORT','IN_TRANSIT',{shipmentId:sent.shipment.shipmentId,dispatchQuantity:sent.shipment.quantity,
        etaTurn:sent.shipment.etaTurn,residualOf:(flow.shipmentIds||[]).length>1?flow.shipmentIds[flow.shipmentIds.length-2]:null});
    }else{
      const reason=sent.reason||'RESIDUAL_SHIPMENT_BLOCKED';
      const waitForCapacity=String(reason).toUpperCase()==='TRANSPORT_CAPACITY_EXHAUSTED';
      addFlowStage(flow,'TRANSPORT',waitForCapacity?'AWAITING_CAPACITY':'RESIDUAL_BLOCKED',{reason,remainingQuantity:remaining});
      flow.lastResidualBlockReason=waitForCapacity?null:reason;
      flow.blockReason=waitForCapacity?null:reason;
      flow.transportQueueReason=waitForCapacity?reason:null;
    }
    saveSiteFlow(cid,flow);
  }
}


function factoryUnitBridge(sourceUnit,targetUnit){
  const source=String(sourceUnit||'').trim(),target=String(targetUnit||'').trim();
  if(!source||!target)return null;
  if(tok(source)===tok(target))return{sourceUnit:source,targetUnit:target,factor:1,authority:'IDENTICAL_DECLARED_UNIT',simulationOnly:false};
  const normalization=cat()?.factoryCatalogPolicy?.unitNormalization;
  const row=normalization?.sourceUnits?.[source.toUpperCase()]||normalization?.sourceUnits?.[tok(source).toUpperCase()]||null;
  const factor=num(row?.factor);
  if(!row||row.simulationOnly!==true||tok(row.targetUnit)!==tok(target)||factor===null||factor<=0)return null;
  return{sourceUnit:source,targetUnit:target,factor,authority:row.authority||normalization.authority||'SIMULATION_ONLY_UNIT_NORMALIZATION',simulationOnly:true};
}
function quantityObjectKey(object,resourceId){
  if(!object||typeof object!=='object')return null;
  const rid=tok(resourceId);
  return Object.keys(object).find(key=>tok(key)===rid)||null;
}
function dispatchFactoryInputShipment(input={}){
  const cid=canonicalCountry(input.countryId);
  if(!cid)return{status:'BLOCKED',reason:'FACTORY_INPUT_COUNTRY_INVALID'};
  const rid=tok(input.resourceId||'');
  const rs=resourceState(cid),network=netState(cid);
  const batchId=String(input.batchId||input.sourceBatchId||'').trim();
  const sourceBatch=(Array.isArray(rs.batches)?rs.batches:[]).find(row=>String(row?.batchId||'')===batchId);
  if(!sourceBatch)return{status:'BLOCKED',reason:'SOURCE_BATCH_NOT_FOUND',batchId};
  if(tok(sourceBatch.resourceId||sourceBatch.materialIdentity)!==rid)return{status:'BLOCKED',reason:'SOURCE_BATCH_RESOURCE_MISMATCH',batchId,resourceId:rid};
  const factoryId=String(input.factoryId||input.targetFactoryId||'').trim();
  const factory=factoryAssets(cid).find(row=>String(row?.id||row?.assetId||row?.projectId)===factoryId);
  if(!factory)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND',factoryId};
  if(canonicalCountry(factory.countryId||cid)!==cid)return{status:'BLOCKED',reason:'FACTORY_COUNTRY_MISMATCH',factoryId,countryId:cid};
  const operationGate=factoryOperationGate(cid,factory);
  if(operationGate.status!=='READY')return operationGate;
  const recipe=recipeFor(rid,factory),inputKey=Object.keys(recipe.inputs||{}).find(key=>tok(key)===rid);
  if(!inputKey)return{status:'BLOCKED',reason:'FACTORY_INPUT_NOT_IN_RECIPE',factoryId,resourceId:rid,recipeId:recipe.recipeId||factory.recipeId||null};
  if(!(Object.keys(recipe.inputs||{}).length>1)&&recipe.requiresAllInputs!==true)
    return{status:'BLOCKED',reason:'FACTORY_IS_NOT_A_MULTI_INPUT_STAGE',factoryId,recipeId:recipe.recipeId||null};
  const coefficient=num(recipe.inputs[inputKey]);
  if(coefficient===null||coefficient<=0)return{status:'BLOCKED',reason:'FACTORY_RECIPE_COEFFICIENT_INVALID',factoryId,resourceId:rid,coefficient};
  const targetUnit=recipe.inputUnit||factory.inputUnit||cat()?.factoryCatalogPolicy?.unitNormalization?.targetUnit||'';
  const sourceUnit=String(input.unit||sourceBatch.unit||rs.inventoryLots?.[batchId]?.unit||'').trim();
  const bridge=factoryUnitBridge(sourceUnit,targetUnit);
  if(!bridge)return{status:'BLOCKED',reason:'FACTORY_INPUT_UNIT_BRIDGE_NOT_DECLARED',sourceUnit:sourceUnit||'NOT_RECORDED',targetUnit:targetUnit||'NOT_RECORDED',factoryId,resourceId:rid};
  const processed=rs.processedWarehouse||{},availableMap=processed.availableByResource||{},reservedMap=processed.reservedByResource||{};
  const sourceKey=quantityObjectKey(availableMap,rid),reservedKey=quantityObjectKey(reservedMap,rid);
  const available=sourceKey===null?0:Math.max(0,num(availableMap[sourceKey])||0);
  const reserved=reservedKey===null?0:Math.max(0,num(reservedMap[reservedKey])||0);
  const sourceRemaining=Math.max(0,num(sourceBatch.remainingQuantity!=null?sourceBatch.remainingQuantity:sourceBatch.quantity)||0);
  const sourceLot=rs.inventoryLots?.[batchId]||null;
  const lotRemaining=sourceLot?Math.max(0,num(sourceLot.remainingQuantity!=null?sourceLot.remainingQuantity:sourceLot.quantity)||0):sourceRemaining;
  const priorShipment=network.shipments.find(row=>String(row?.batchId||'')===batchId&&String(row?.shipmentType||'')==='FACTORY_INPUT'&&
    ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(row?.status||'')));
  if(priorShipment)return{status:'BLOCKED',reason:'SOURCE_BATCH_ALREADY_IN_TRANSIT',shipmentId:priorShipment.shipmentId,batchId};
  const currentStock=Math.max(0,num(factory.inputInventory?.[rid])||0);
  const inbound=network.shipments.filter(row=>String(row?.shipmentType||'')==='FACTORY_INPUT'&&String(row?.factoryId||'')===factoryId&&
    tok(row?.resourceId)===rid&&['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(row?.status||'')))
    .reduce((sum,row)=>sum+Math.max(0,num(row?.targetQuantity)||0),0);
  const dailyCapacity=Math.max(0,num(factory.capacityPerDay??factory.capacity??factory.productionCapacity??factory.throughput)||0);
  const demand=Math.max(0,dailyCapacity*coefficient-currentStock-inbound);
  const requestedTarget=num(input.targetQuantity);
  const requestedSource=num(input.quantity);
  const targetQuantity=Math.max(0,requestedTarget!==null?requestedTarget:(requestedSource!==null?requestedSource*bridge.factor:demand));
  if(!(targetQuantity>1e-9))return{status:'BLOCKED',reason:'FACTORY_INPUT_NOT_REQUIRED',factoryId,resourceId:rid,currentStock,inbound,targetDemand:demand};
  const requestedSourceQuantity=targetQuantity/bridge.factor;
  const availableSource=Math.min(sourceRemaining,lotRemaining,Math.max(0,available-reserved));
  if(availableSource<=1e-9)return{status:'BLOCKED',reason:'PROCESSED_WAREHOUSE_STOCK_UNAVAILABLE',factoryId,batchId,availableSource};
  const quantity=Math.min(requestedSourceQuantity,availableSource);
  if(!(quantity>1e-9))return{status:'BLOCKED',reason:'FACTORY_INPUT_TRANSFER_QUANTITY_ZERO',factoryId,batchId};
  const sourceWarehouseId=String(sourceBatch.warehouseId||processed.warehouseId||('WH-'+cid+'-PROCESSED'));
  const sourceNode=String(sourceBatch.locationNodeKey||('WAREHOUSE:'+cid+':PROCESSED'));
  const sourceRef={siteId:sourceWarehouseId,countryId:cid,siteName:cid+' processed-goods warehouse',
    siteType:'PROCESSED_GOODS_WAREHOUSE',real:{resourceId:rid},
    sourceSiteRecord:{siteId:sourceWarehouseId,resourceId:rid,countryCode:cid,commercialExtraction:true},
    simulation:{transportRoute:[]}};
  const route=buildRoute(sourceRef,factory,rid,quantity,{countryId:cid,sourceSiteId:sourceBatch.sourceFactoryId||sourceWarehouseId,
    sourceWarehouseId,sourceNode,sourceNodeType:'WAREHOUSE',transportMode:input.transportMode||'truck',unit:sourceUnit,
    quantityToCapacityFactor:bridge.factor});
  if(route.status!=='PLANNED'||!(num(route.dispatchQuantity)>0))return{status:'BLOCKED',reason:route.statusReason||'FACTORY_INPUT_ROUTE_UNAVAILABLE',route};
  const policy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const blocked=policy?.isRouteBlocked?.(cid,{resourceId:rid,transportMode:route.transportMode,routeId:route.routeId,
    siteId:sourceBatch.sourceSiteIds?.[0]||sourceBatch.sourceFactoryId||sourceWarehouseId,factoryId});
  if(blocked?.blocked)return{status:'BLOCKED',reason:blocked.reason||'FACTORY_INPUT_ROUTE_BLOCKED',policy:blocked,route};
  const routePlannedQuantity=Math.min(quantity,Math.max(0,num(route.dispatchQuantity)||0));
  const capacityFactor=Math.max(1e-12,num(route.capacityQuantityFactor)||1);
  const routeCapacityPreview=previewTransportCapacity(cid,route,routePlannedQuantity,capacityFactor);
  if(routeCapacityPreview.status!=='READY')
    return{status:'BLOCKED',reason:routeCapacityPreview.reason||'TRANSPORT_CAPACITY_EXHAUSTED',capacity:routeCapacityPreview,route};
  const dispatchedSourceQuantity=Math.min(routePlannedQuantity,routeCapacityPreview.allowedQuantity);
  const deliveredTargetQuantity=dispatchedSourceQuantity*bridge.factor;
  if(!(dispatchedSourceQuantity>1e-9)||!(deliveredTargetQuantity>1e-9))
    return{status:'BLOCKED',reason:'FACTORY_INPUT_ROUTE_QUANTITY_ZERO',route,capacity:routeCapacityPreview};
  const shipmentId='FACTORYINPUT:'+h32(JSON.stringify({cid,batchId,factoryId,rid,turn:turn(),seq:network.shipments.length+1}));
  processed.reservedByResource=processed.reservedByResource||{};
  const actualReservedKey=quantityObjectKey(processed.reservedByResource,rid)||sourceKey||rid;
  processed.reservedByResource[actualReservedKey]=(num(processed.reservedByResource[actualReservedKey])||0)+dispatchedSourceQuantity;
  const adjustedRoute=resizeRouteForDispatch(route,dispatchedSourceQuantity,routePlannedQuantity);
  adjustedRoute.capacityUse=null;
  const shipment={shipmentId,shipmentType:'FACTORY_INPUT',countryId:cid,siteId:sourceBatch.sourceSiteIds?.[0]||sourceBatch.sourceFactoryId||sourceWarehouseId,
    sourceFactoryId:sourceBatch.sourceFactoryId||null,factoryId,resourceId:rid,quantity:dispatchedSourceQuantity,unit:sourceUnit,
    targetQuantity:deliveredTargetQuantity,targetUnit,unitBridge:bridge,batchId,sourceWarehouseId,warehouseId:sourceWarehouseId,
    status:'IN_TRANSIT',createdTurn:turn(),etaTurn:adjustedRoute.etaTurn,route:adjustedRoute,
    transportCapacityReservation:null,provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',
      authority:'SIMULATED_DOMESTIC_FACTORY_TRANSFER',sourceBatchId:batchId,sourceFactoryId:sourceBatch.sourceFactoryId||null,
      targetFactoryId:factoryId,unitBridge:bridge,simulationOnly:true}};
  const capacityUse=commitTransportCapacity(cid,adjustedRoute,dispatchedSourceQuantity,shipmentId,capacityFactor);
  adjustedRoute.capacityUse=capacityUse;shipment.route=adjustedRoute;shipment.transportCapacityReservation=capacityUse;
  network.shipments.push(shipment);network.shipments=network.shipments.slice(-MAX_SHIPMENTS);
  if(batchId)updateSiteFlow(cid,batchId,row=>{
    row.downstreamShipmentIds=[...new Set([...(row.downstreamShipmentIds||[]),shipmentId])];
    row.downstreamFactoryIds=[...new Set([...(row.downstreamFactoryIds||[]),factoryId])];
  });
  emit('OMEGA_FACTORY_INPUT_SHIPMENT_CREATED',cid,shipment);
  return{status:'DISPATCHED',shipment};
}
function dispatchResidualFactoryOutputs(countryId){
  const cid=canonicalCountry(countryId),rs=resourceState(cid),network=netState(cid);
  const warehouse=rs.processedWarehouse||{},batches=Array.isArray(rs.batches)?rs.batches:[];
  const dispatched=[],blocked=[];
  for(const batch of batches.slice().sort((a,b)=>(Number(a?.createdTurn)||0)-(Number(b?.createdTurn)||0))){
    const batchId=String(batch?.batchId||'').trim(),rid=tok(batch?.resourceId||batch?.materialIdentity);
    if(!batchId||!rid||String(batch?.stage||'').toUpperCase()!=='FINISHED')continue;
    const remaining=Math.max(0,num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);
    if(remaining<=1e-9)continue;
    if(network.shipments.some(row=>String(row?.batchId||'')===batchId&&String(row?.shipmentType||'')==='FACTORY_INPUT'&&
      ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(row?.status||''))))continue;
    const availableKey=quantityObjectKey(warehouse.availableByResource||{},rid);
    const reservedKey=quantityObjectKey(warehouse.reservedByResource||{},rid);
    if(availableKey===null)continue;
    const available=Math.max(0,num(warehouse.availableByResource[availableKey])||0);
    const reserved=reservedKey===null?0:Math.max(0,num(warehouse.reservedByResource[reservedKey])||0);
    if(available-reserved<=1e-9)continue;
    const candidates=factoryAssets(cid).filter(asset=>{
      const status=String(asset?.status||'OPERATIONAL').toUpperCase();
      if(['CLOSED','DECOMMISSIONED','TECHNOLOGY_LOCKED','BLOCKED','UNDER_CONSTRUCTION'].includes(status))return false;
      if(canonicalCountry(asset?.countryId||cid)!==cid)return false;
      const recipe=recipeFor(rid,asset);
      return Object.keys(recipe.inputs||{}).length>1&&recipe.requiresAllInputs===true&&
        Object.keys(recipe.inputs).some(key=>tok(key)===rid);
    }).map((asset,index)=>({asset,index,recipe:recipeFor(rid,asset)}))
      .sort((a,b)=>(Number(a.asset.priority)||0)-(Number(b.asset.priority)||0)||a.index-b.index);
    for(const candidate of candidates){
      const asset=candidate.asset,recipe=candidate.recipe;
      const key=Object.keys(recipe.inputs||{}).find(inputId=>tok(inputId)===rid);
      const coefficient=num(recipe.inputs[key]);
      const bridge=factoryUnitBridge(batch.unit||rs.inventoryLots?.[batchId]?.unit,recipe.inputUnit||asset.inputUnit);
      if(!bridge){blocked.push({batchId,resourceId:rid,factoryId:asset.id,reason:'FACTORY_INPUT_UNIT_BRIDGE_NOT_DECLARED'});continue;}
      if(!(coefficient>0))continue;
      const stock=Math.max(0,num(asset.inputInventory?.[rid])||0);
      const inbound=network.shipments.filter(row=>String(row?.shipmentType||'')==='FACTORY_INPUT'&&String(row?.factoryId||'')===String(asset.id)&&
        tok(row?.resourceId)===rid&&['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(row?.status||'')))
        .reduce((sum,row)=>sum+Math.max(0,num(row?.targetQuantity)||0),0);
      const capacity=Math.max(0,num(asset.capacityPerDay??asset.capacity??asset.productionCapacity??asset.throughput)||0);
      const targetDemand=Math.max(0,capacity*coefficient-stock-inbound);
      if(targetDemand<=1e-9)continue;
      const sourceNeeded=targetDemand/bridge.factor;
      const sourceQuantity=Math.min(sourceNeeded,remaining,Math.max(0,available-reserved));
      if(sourceQuantity<=1e-9)continue;
      const sent=dispatchFactoryInputShipment({countryId:cid,batchId,factoryId:asset.id,resourceId:rid,
        targetQuantity:sourceQuantity*bridge.factor,transportMode:rules()[rid]?.preferredModes?.[0]||'truck'});
      if(sent.status==='DISPATCHED'){dispatched.push({batchId,factoryId:asset.id,resourceId:rid,quantity:sent.shipment.quantity,targetQuantity:sent.shipment.targetQuantity,shipmentId:sent.shipment.shipmentId});break;}
      blocked.push({batchId,factoryId:asset.id,resourceId:rid,reason:sent.reason||sent.status});
    }
  }
  return{status:blocked.length?'DEGRADED':'COMPLETED',countryId:cid,turn:turn(),dispatchedCount:dispatched.length,dispatched,blocked};
}
function settleFactoryInputShipment(countryId,shipment){
  const cid=canonicalCountry(countryId),s=shipment||{},rid=tok(s.resourceId),batchId=String(s.batchId||'').trim(),factoryId=String(s.factoryId||'').trim();
  const rs=resourceState(cid),warehouse=rs.processedWarehouse||{},availableMap=warehouse.availableByResource||{},reservedMap=warehouse.reservedByResource||{};
  const sourceBatch=(Array.isArray(rs.batches)?rs.batches:[]).find(row=>String(row?.batchId||'')===batchId);
  const sourceLot=rs.inventoryLots?.[batchId]||null;
  const factory=factoryAssets(cid).find(row=>String(row?.id||row?.assetId||row?.projectId)===factoryId);
  if(!sourceBatch)return{status:'BLOCKED',reason:'SOURCE_BATCH_MISSING_AT_FACTORY_INPUT_DELIVERY',batchId};
  if(!factory)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND_AT_INPUT_DELIVERY',factoryId};
  if(canonicalCountry(factory.countryId||cid)!==cid)return{status:'BLOCKED',reason:'FACTORY_COUNTRY_MISMATCH',factoryId};
  if(tok(sourceBatch.resourceId||sourceBatch.materialIdentity)!==rid)return{status:'BLOCKED',reason:'SOURCE_BATCH_RESOURCE_MISMATCH',batchId,resourceId:rid};
  const boundSiteId=String(factory.sourceSiteId||factory.siteId||'').trim();
  if(boundSiteId){
    const sourceFlow=siteFlowRows(cid).find(row=>String(row?.batchId||'')===batchId);
    const sourceSiteCandidates=[sourceBatch?.siteReferenceKey,sourceBatch?.siteId,sourceBatch?.sourceSiteId,
      sourceBatch?.originSiteId,sourceFlow?.siteId,sourceFlow?.siteSnapshot?.siteId,
      sourceFlow?.siteSnapshot?.sourceSiteRecord?.siteId]
      .map(value=>String(value||'').trim()).filter(Boolean);
    if(!sourceSiteCandidates.length)return{status:'BLOCKED',reason:'SOURCE_SITE_IDENTITY_MISSING_FOR_BOUND_FACTORY',
      batchId,factoryId,boundSiteId};
    if(!sourceSiteCandidates.includes(boundSiteId))return{status:'BLOCKED',reason:'SOURCE_SITE_FACTORY_BINDING_MISMATCH',
      batchId,factoryId,boundSiteId,sourceSiteCandidates:[...new Set(sourceSiteCandidates)]};
  }
  const key=quantityObjectKey(availableMap,rid),reservedKey=quantityObjectKey(reservedMap,rid);
  const available=key===null?0:Math.max(0,num(availableMap[key])||0);
  const reserved=reservedKey===null?0:Math.max(0,num(reservedMap[reservedKey])||0);
  const sourceQuantity=Math.max(0,num(s.quantity)||0);
  const sourceRemaining=Math.max(0,num(sourceBatch.remainingQuantity!=null?sourceBatch.remainingQuantity:sourceBatch.quantity)||0);
  const lotRemaining=sourceLot?Math.max(0,num(sourceLot.remainingQuantity!=null?sourceLot.remainingQuantity:sourceLot.quantity)||0):sourceRemaining;
  const inventoryKey=quantityObjectKey(rs.inventory||{},rid),countryStock=inventoryKey===null?0:Math.max(0,num(rs.inventory[inventoryKey])||0);
  if(!(sourceQuantity>0)||available+1e-6<sourceQuantity||reserved+1e-6<sourceQuantity||
    sourceRemaining+1e-6<sourceQuantity||lotRemaining+1e-6<sourceQuantity||countryStock+1e-6<sourceQuantity)
    return{status:'BLOCKED',reason:'PROCESSED_WAREHOUSE_OR_BATCH_LEDGER_MISMATCH',batchId,sourceQuantity,available,reserved,sourceRemaining,lotRemaining,countryStock};
  const recipe=recipeFor(rid,factory),coefficient=recipe.inputs[Object.keys(recipe.inputs).find(x=>tok(x)===rid)];
  if(!(num(coefficient)>0)||!(Object.keys(recipe.inputs||{}).length>1)&&recipe.requiresAllInputs!==true)
    return{status:'BLOCKED',reason:'FACTORY_INPUT_NOT_IN_RECIPE',factoryId,resourceId:rid};
  const bridge=factoryUnitBridge(s.unit||sourceBatch.unit,s.targetUnit||recipe.inputUnit||factory.inputUnit);
  const recordedFactor=num(s.unitBridge?.factor);
  const targetQuantity=Math.max(0,num(s.targetQuantity)||0);
  if(!bridge||recordedFactor===null||Math.abs(bridge.factor-recordedFactor)>1e-9||
    Math.abs(targetQuantity-sourceQuantity*bridge.factor)>1e-6)
    return{status:'BLOCKED',reason:'FACTORY_INPUT_UNIT_BRIDGE_MISMATCH',sourceUnit:s.unit,targetUnit:s.targetUnit,targetQuantity,sourceQuantity,unitBridge:bridge};
  const targetInventory=factory.inputInventory&&typeof factory.inputInventory==='object'?factory.inputInventory:(factory.inputInventory={});
  const currentTargetStock=Math.max(0,num(targetInventory[rid])||0);
  const inputRows=Array.isArray(factory.inputBatchLots)?factory.inputBatchLots:(factory.inputBatchLots=[]);
  if(inputRows.some(row=>String(row?.batchId||'')==='INPUT:'+s.shipmentId))
    return{status:'BLOCKED',reason:'FACTORY_INPUT_RECEIPT_ALREADY_EXISTS',factoryId,shipmentId:s.shipmentId};
  const lineage=[batchId,...(Array.isArray(sourceBatch.sourceBatchIds)?sourceBatch.sourceBatchIds:[])].filter(Boolean).map(String);
  const sourceSites=[...(Array.isArray(sourceBatch.sourceSiteIds)?sourceBatch.sourceSiteIds:[])];
  for(const rootBatchId of sourceBatch.sourceBatchIds||[]){
    const flow=siteFlowRows(cid).find(row=>String(row?.batchId||'')===String(rootBatchId));
    if(flow?.siteId)sourceSites.push(String(flow.siteId));
  }
  const inputBatchId='INPUT:'+s.shipmentId;
  const targetUnit=bridge.targetUnit;
  warehouse.reservedByResource[reservedKey||key]=Math.max(0,reserved-sourceQuantity);
  warehouse.availableByResource[key]=Math.max(0,available-sourceQuantity);
  sourceBatch.remainingQuantity=Math.max(0,sourceRemaining-sourceQuantity);
  sourceBatch.status=sourceBatch.remainingQuantity>1e-9?'PARTIALLY_TRANSFERRED_TO_FACTORY':'TRANSFERRED_TO_FACTORY';
  sourceBatch.lastMovementType='FACTORY_TO_FACTORY_TRANSFER';sourceBatch.lastMovementTurn=turn();
  if(sourceLot){
    sourceLot.remainingQuantity=Math.max(0,lotRemaining-sourceQuantity);
    sourceLot.status=sourceLot.remainingQuantity>1e-9?'PARTIALLY_TRANSFERRED_TO_FACTORY':'TRANSFERRED_TO_FACTORY';
    sourceLot.lastMovementType='FACTORY_TO_FACTORY_TRANSFER';sourceLot.lastMovementTurn=turn();
    rs.inventoryLots[batchId]=sourceLot;
  }
  if(sourceBatch.remainingQuantity<=1e-9&&Array.isArray(warehouse.storedBatchIds))
    warehouse.storedBatchIds=warehouse.storedBatchIds.filter(value=>String(value)!==batchId);
  rs.batches=rs.batches||[];
  rs.inventory[inventoryKey]=Math.max(0,countryStock-sourceQuantity);
  targetInventory[rid]=currentTargetStock+targetQuantity;
  inputRows.push({batchId:inputBatchId,resourceId:rid,materialIdentity:rid,quantity:targetQuantity,remainingQuantity:targetQuantity,
    unit:targetUnit,stage:'FACTORY_INPUT',countryId:cid,sourceCountryId:cid,originCountryId:cid,ownerCountryCode:cid,
    destinationCountryId:cid,ownerCompanyId:String(factory.companyId||factory.ownerCompanyId||('SIM-COMPANY:'+cid)),
    sourceBatchIds:lineage,sourceSiteIds:[...new Set(sourceSites)],sourceFactoryId:sourceBatch.sourceFactoryId||null,
    sourceWarehouseId:s.sourceWarehouseId||null,factoryId,locationNodeKey:'FACTORY:'+cid+':'+factoryId,
    provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:bridge.authority,simulationOnly:bridge.simulationOnly,
      status:'TRACKED_FACTORY_TO_FACTORY_TRANSFER',shipmentId:s.shipmentId,sourceBatchId:batchId,sourceBatchIds:lineage,sourceSiteIds:[...new Set(sourceSites)],unitBridge:bridge,simulationTurn:turn()},
    lastMovementType:'RECEIPT_FROM_FACTORY_LOGISTICS',lastMovementTurn:turn(),status:'AVAILABLE_TO_FACTORY'});
  let trackedInput=inputRows.filter(row=>tok(row?.resourceId||row?.materialIdentity)===rid)
    .reduce((sum,row)=>sum+(['CONSUMED','SOLD','TRANSFERRED_OUT'].includes(String(row?.status||'').toUpperCase())?0:Math.max(0,num(row?.remainingQuantity!=null?row.remainingQuantity:row?.quantity)||0)),0);
  const inputGap=(num(targetInventory[rid])||0)-trackedInput;
  if(inputGap>1e-6){
    const legacyId='LEGACY-FACTORY-INPUT:'+cid+':'+factoryId+':'+rid;
    let legacy=inputRows.find(row=>String(row?.batchId||'')===legacyId);
    if(!legacy){
      legacy={batchId:legacyId,resourceId:rid,materialIdentity:rid,quantity:inputGap,remainingQuantity:inputGap,unit:targetUnit,
        stage:'FACTORY_INPUT',countryId:cid,sourceCountryId:cid,originCountryId:cid,ownerCountryCode:cid,destinationCountryId:cid,
        ownerCompanyId:String(factory.companyId||factory.ownerCompanyId||('SIM-COMPANY:'+cid)),sourceBatchIds:[],sourceSiteIds:[],
        factoryId,locationNodeKey:'FACTORY:'+cid+':'+factoryId,
        provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:'UNOBSERVED',status:'LEGACY_FACTORY_INPUT_BALANCE',
          explanation:'Pre-existing aggregate stock has no verified source-batch lineage',simulationTurn:turn()},
        lastMovementType:'LEGACY_INPUT_RECONCILIATION',lastMovementTurn:turn(),status:'AVAILABLE_TO_FACTORY'};
      inputRows.push(legacy);
    }else{
      const previous=Math.max(0,num(legacy.remainingQuantity!=null?legacy.remainingQuantity:legacy.quantity)||0);
      legacy.quantity=previous+inputGap;legacy.remainingQuantity=previous+inputGap;legacy.status='AVAILABLE_TO_FACTORY';
      legacy.lastMovementType='LEGACY_INPUT_RECONCILIATION';legacy.lastMovementTurn=turn();
    }
    trackedInput+=inputGap;
  }else if(inputGap < -1e-6){
    // Detailed batch lots take precedence over a stale aggregate stock counter.
    targetInventory[rid]=trackedInput;
  }
  factory.inputInventory=targetInventory;factory.inputBatchLots=inputRows;
  if(sourceBatch.remainingQuantity<=1e-9&&sourceBatch.status==='TRANSFERRED_TO_FACTORY')sourceBatch.status='TRANSFERRED_TO_FACTORY';
  s.status='DELIVERED';s.deliveredTurn=turn();s.destinationStatus='FACTORY_RECEIVED';s.factoryInputBatchId=inputBatchId;
  s.deliveredQuantity=targetQuantity;s.sourceTransferredQuantity=sourceQuantity;s.unitBridge=bridge;
  for(const rootBatchId of [...new Set(lineage)]){
    updateSiteFlow(cid,rootBatchId,row=>{
      row.downstreamFactoryIds=[...new Set([...(row.downstreamFactoryIds||[]),factoryId])];
      row.downstreamShipmentIds=[...new Set([...(row.downstreamShipmentIds||[]),String(s.shipmentId)])];
      addFlowStage(row,'DOWNSTREAM_FACTORY_INPUT','DELIVERED',{shipmentId:s.shipmentId,factoryId,resourceId:rid,
        sourceQuantity,targetQuantity,unitBridge:bridge,sourceBatchId:batchId});
    });
  }
  emit('OMEGA_FACTORY_INPUT_SHIPMENT_DELIVERED',cid,{shipmentId:s.shipmentId,factoryId,resourceId:rid,sourceQuantity,targetQuantity,
    sourceBatchId:batchId,inputBatchId,sourceBatchIds:lineage,sourceSiteIds:[...new Set(sourceSites)],unitBridge:bridge,turn:turn()});
  return{status:'DELIVERED',factory,resourceId:rid,sourceQuantity,targetQuantity,inputBatchId,unitBridge:bridge,sourceBatchIds:lineage};
}

function advanceShipments(c){
  const cid=canonicalCountry(c);
  if(!cid)return{status:'SKIPPED',reason:'LOGISTICS_COUNTRY_NOT_SELECTED',delivered:0,mineDelivered:0,shipments:[]};
  const selectedPlayer=playerSimulationCountryId();
  if(!selectedPlayer)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED',countryId:cid,delivered:0,mineDelivered:0,shipments:[]};
  if(selectedPlayer!==cid)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:selectedPlayer,delivered:0,mineDelivered:0,shipments:[]};
  if(siteLogisticsActiveCountry!==cid)void loadSiteLogisticsRoutes(cid);
  const n=netState(cid),delivered=[],mineDelivered=[];
  // Prioritize cargo already received into the raw warehouse before scheduling another
  // mine haul. Both legs share the same per-turn transport ledger; dispatching mine
  // residuals first can consume the entire capacity every turn and starve factory-bound
  // shipments indefinitely even though warehouse receipts are ready.
  dispatchResidualSiteBatches(cid);
  dispatchResidualMineHauls(cid);
  dispatchResidualFactoryOutputs(cid);
  for(const s of n.shipments){
    if(!['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(s.status||'')))continue;
    const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
    const routeModes=String(s.shipmentType||'')==='MINE_TO_WAREHOUSE'&&Array.isArray(s.route?.legs)
      ?[...new Set(s.route.legs.map(leg=>String(leg?.transportMode||leg?.mode||'').trim().toLowerCase()).filter(Boolean))]
      :[String(s.route?.transportMode||s.route?.mode||'').trim().toLowerCase()].filter(Boolean);
    const blockadeChecks=strategicPolicy?.isRouteBlocked
      ?routeModes.map(mode=>({mode,decision:strategicPolicy.isRouteBlocked(cid,{resourceId:s.resourceId,transportMode:mode,
        routeId:s.route?.routeId,siteId:s.siteId,factoryId:s.factoryId})})).filter(item=>item.decision?.blocked):[];
    if(blockadeChecks.length){
      s.status='BLOCKED_ROUTE_BLOCKADE';s.blockReason='RESOURCE_ROUTE_BLOCKADE_ACTIVE';
      s.blockadePolicies=blockadeChecks.map(item=>({mode:item.mode,reason:item.decision.reason||s.blockReason,
        blockades:Array.isArray(item.decision.blockades)?item.decision.blockades:[]}));
      s.blockedTransportModes=blockadeChecks.map(item=>item.mode);s.blockedTurn=turn();
      if(['MINE_TO_WAREHOUSE','RAW_TO_FACTORY'].includes(String(s.shipmentType||''))){
        recordSiteLogisticsBlock(cid,s.siteId,s.batchId,siteLogisticsRouteFor(cid,s.siteId),s.blockReason,false,s.shipmentId);
      }
      continue;
    }
    if(s.status==='BLOCKED_ROUTE_BLOCKADE'){
      s.status='IN_TRANSIT';s.blockReason=null;s.blockadePolicies=[];s.blockedTransportModes=[];
      s.resumedTurn=turn();s.etaTurn=Math.max(turn()+1,num(s.etaTurn)||turn()+1);
      s.etaDate=factoryAddGameDays(factoryCurrentGameDate(),Math.max(1,s.etaTurn-turn())*daysPerTurn());
      if(s.route){s.route.etaTurn=s.etaTurn;s.route.etaDate=s.etaDate;}
      if(['MINE_TO_WAREHOUSE','RAW_TO_FACTORY'].includes(String(s.shipmentType||''))){
        const rt=siteLogisticsState(cid,s.siteId,siteLogisticsRouteFor(cid,s.siteId));
        clearSiteLogisticsBlock(rt,s.batchId);
        trackActiveSiteShipment(rt,s.shipmentId,String(s.shipmentType)==='RAW_TO_FACTORY'?'RAW_TO_FACTORY':'MINE_TO_WAREHOUSE');
        if(rt&&!rt.blockedShipments.length){
          rt.status=String(s.shipmentType)==='RAW_TO_FACTORY'?'IN_TRANSIT_TO_FACTORY':'IN_TRANSIT_TO_WAREHOUSE';
        }
      }
    }
    if(num(s.etaTurn)>turn())continue;
    if(['MINE_TO_WAREHOUSE','RAW_TO_FACTORY'].includes(String(s.shipmentType||''))&&s.etaDate&&
      !factoryDateReached(factoryCurrentGameDate(),s.etaDate))continue;
    if(String(s.shipmentType||'')==='MINE_TO_WAREHOUSE'){
      const receipt=receiveMineWarehouseShipment(cid,s);
      if(receipt.status!=='DELIVERED'){
        s.status='BLOCKED_LEDGER_MISMATCH';s.deliveryStatus='BLOCKED';s.blockReason=receipt.reason||'MINE_WAREHOUSE_RECEIPT_BLOCKED';
        s.blockedTurn=turn();emit('OMEGA_RESOURCE_MINE_WAREHOUSE_SHIPMENT_BLOCKED',cid,{shipmentId:s.shipmentId,batchId:s.batchId,
          siteId:s.siteId,reason:s.blockReason,details:receipt},'resource-industrial-network');continue;
      }
      s.status='DELIVERED';s.deliveryStatus='DELIVERED_TO_RAW_WAREHOUSE';s.destinationStatus='RAW_WAREHOUSE_RECEIVED';
      s.deliveredTurn=turn();s.deliveredDate=factoryCurrentGameDate();s.deliveryEventId='MINE-WH-DELIVERY:'+s.shipmentId;
      mineDelivered.push(clone(s));
      emit('OMEGA_RESOURCE_MINE_HAUL_DELIVERED',cid,{shipmentId:s.shipmentId,batchId:s.batchId,siteId:s.siteId,
        resourceId:s.resourceId,quantity:s.quantity,warehouseId:s.warehouseId,receiptId:receipt.receiptId,
        status:'DELIVERED_TO_RAW_WAREHOUSE',turn:turn(),date:factoryCurrentGameDate()});
      continue;
    }
    if(String(s.shipmentType||'')==='FACTORY_INPUT'){
      const received=settleFactoryInputShipment(cid,s);
      if(received.status!=='DELIVERED'){
        s.status='BLOCKED_LEDGER_MISMATCH';s.blockReason=received.reason||'FACTORY_INPUT_DELIVERY_BLOCKED';s.blockedTurn=turn();
        emit('OMEGA_FACTORY_INPUT_SHIPMENT_BLOCKED',cid,{shipmentId:s.shipmentId,factoryId:s.factoryId,batchId:s.batchId,
          resourceId:s.resourceId,reason:s.blockReason,details:received,turn:turn()});continue;
      }
      const destination=received.factory,recipe=recipeFor(received.resourceId,destination);
      const stocks=destination.inputInventory||{},capacity=Math.max(0,num(destination.capacityPerDay??destination.capacity??destination.productionCapacity??destination.throughput)||0);
      const maxProduction=Object.entries(recipe.inputs||{}).reduce((limit,[resourceId,coefficient])=>{
        const c=num(coefficient);
        return c&&c>0?Math.min(limit,Math.max(0,num(stocks[tok(resourceId)])||0)/c):0;
      },capacity);
      const currentCycle=factoryCycleStore(cid).factoryProductionCycles[String(s.factoryId)];
      const currentCycleInputIds=new Set((currentCycle?.sourceBatchIds||[]).map(String));
      const receivedInputBatchId=String(received.inputBatchId||s.factoryInputBatchId||'');
      const arrivalBelongsToCurrentCycle=!!receivedInputBatchId&&currentCycleInputIds.has(receivedInputBatchId);
      const processing=factoryCycleActive(currentCycle)
        ?arrivalBelongsToCurrentCycle
          ?{status:currentCycle.status==='PAUSED'?'PAUSED':'IN_PROGRESS',cycleId:currentCycle.cycleId,
            factoryId:String(s.factoryId),finishDate:currentCycle.finishDate,productionQuantity:currentCycle.productionQuantity,idempotent:true}
          :{status:'BLOCKED',reason:'FACTORY_CYCLE_ALREADY_RUNNING',activeCycleId:currentCycle.cycleId,
            factoryId:String(s.factoryId),finishDate:currentCycle.finishDate}
        :maxProduction>1e-9
          ?startFactoryProductionCycle({countryId:cid,factoryId:s.factoryId,resourceId:received.resourceId,quantity:maxProduction,unit:received.unitBridge.targetUnit})
          :{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',factoryId:s.factoryId};
      s.processingStatus=processing?.status==='IN_PROGRESS'?'IN_PROGRESS':
        processing?.status==='COMPLETED'?'PROCESSED':
        ['FACTORY_INPUT_SHORTAGE','FACTORY_INPUT_NOT_IN_RECIPE','FACTORY_INPUT_BATCH_LEDGER_MISMATCH'].includes(processing?.reason)?'AWAITING_INPUTS':'AWAITING_PROCESSING';
      s.processingTransactionId=processing?.transactionId||processing?.cycleId||null;s.processing=clone(processing);
      if(String(s.shipmentType||'')==='RAW_TO_FACTORY'){
        const flow=siteFlowRows(cid).find(row=>String(row.batchId||'')===String(s.batchId||''));
        const siteRuntime=siteLogisticsState(cid,s.siteId,siteLogisticsRouteFor(cid,s.siteId));
        if(siteRuntime){
          siteRuntime.factoryReceivedQuantity=(num(siteRuntime.factoryReceivedQuantity)||0)+Math.max(0,num(s.quantity)||0);
          closeActiveSiteShipment(siteRuntime,s.shipmentId);
          siteRuntime.currentStage=siteRuntime.runtimeActive?siteRuntime.currentStage:'FACTORY_RECEIVED';
          appendSiteLogisticsStage(siteRuntime,'RAW_TO_FACTORY','FACTORY_RECEIVED',{shipmentId:s.shipmentId,batchId:s.batchId,
            quantity:s.quantity,unit:s.unit,turn:turn(),factoryId:s.factoryId,processingStatus:s.processingStatus});
          if(siteRuntime.runtimeActive){
            siteRuntime.currentStage=String(siteRuntime.currentStage||'IN_TRANSIT');
            siteRuntime.status=siteRuntime.currentStage==='RAW_TO_FACTORY'?'IN_TRANSIT_TO_FACTORY':'IN_TRANSIT_TO_WAREHOUSE';
          }
        }
        if(flow){flow.mineLogisticsStatus='FACTORY_RECEIVED';flow.lastMineFactoryReceiptTurn=turn();
          addFlowStage(flow,'FACTORY','RECEIVED',{shipmentId:s.shipmentId,factoryId:s.factoryId,quantity:s.quantity,processingStatus:s.processingStatus});
          saveSiteFlow(cid,flow);
        }
      }
      n.deliveries.push(clone(s));delivered.push(clone(s));
      if(processing?.status==='COMPLETED'){
        const consumedSourceBatches=new Set((processing.sourceBatchIds||[]).map(String));
        for(const peer of [...n.shipments,...n.deliveries,...delivered]){
          if(String(peer?.shipmentType||'')!=='FACTORY_INPUT'||String(peer?.factoryId||'')!==String(s.factoryId)||
            !consumedSourceBatches.has(String(peer?.batchId||'')))continue;
          peer.processingStatus='PROCESSED';peer.processingTransactionId=processing.transactionId;peer.processing=clone(processing);
        }
      }
      emit('OMEGA_RESOURCE_DELIVERY_COMPLETED',cid,{shipmentId:s.shipmentId,factoryId:s.factoryId,resourceId:received.resourceId,
        quantity:received.targetQuantity,unit:received.unitBridge.targetUnit,sourceBatchId:s.batchId,
        status:'DELIVERED_TO_FACTORY',processingStatus:s.processingStatus,processingTransactionId:s.processingTransactionId});
      continue;
    }
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
      // Resolve the source batch's location after this receipt. A batch may have residual
      // stock in the raw warehouse, mine-held remainder, or another active logistics leg.
      const flow=siteFlowRows(cid).find(row=>String(row.batchId||'')===sourceBatchId);
      const mineHeld=Math.max(0,num(flow?.mineHeldQuantity)||0);
      const isMineLogisticsBatch=!!(flow?.mineLogisticsRouteId||flow?.mineLogisticsStockDebited===true);
      const otherActiveLeg=n.shipments.some(item=>String(item.batchId||'')===sourceBatchId&&
        String(item.shipmentId||'')!==String(s.shipmentId||'')&&
        ['MINE_TO_WAREHOUSE','RAW_TO_FACTORY'].includes(String(item.shipmentType||''))&&
        ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE','BLOCKED_LEDGER_MISMATCH'].includes(String(item.status||'')));
      if(sourceBatch.remainingQuantity<=1e-9){
        const factoryLocation='FACTORY:'+cid+':'+String(s.factoryId);
        sourceBatch.stage='TRANSFERRED_TO_FACTORY';sourceBatch.warehouseId=null;
        sourceBatch.locationNodeKey=factoryLocation;sourceBatch.currentLocationNodeId=String(s.factoryId);
        sourceBatch.lastMovementType='TRANSFER_TO_FACTORY';sourceBatch.lastMovementTurn=turn();
        if(sourceLot){
          sourceLot.stage='TRANSFERRED_TO_FACTORY';sourceLot.warehouseId=null;sourceLot.locationNodeKey=factoryLocation;
          sourceLot.lastMovementType='TRANSFER_TO_FACTORY';sourceLot.lastMovementTurn=turn();
        }
      }else if(isMineLogisticsBatch&&(mineHeld>1e-6||otherActiveLeg)){
        const mixedLocation='MIXED:MINE_RAW_WAREHOUSE_OR_TRANSIT';
        sourceBatch.stage='PARTIALLY_IN_RAW_INVENTORY';sourceBatch.warehouseId=null;
        sourceBatch.locationNodeKey=mixedLocation;sourceBatch.currentLocationNodeId=null;
        if(sourceLot){sourceLot.stage='PARTIALLY_IN_RAW_INVENTORY';sourceLot.warehouseId=null;sourceLot.locationNodeKey=mixedLocation;}
      }else{
        const rawWarehouseId=String(warehouse.warehouseId||('WH-'+cid+'-RAW'));
        sourceBatch.stage='RAW_INVENTORY';sourceBatch.warehouseId=rawWarehouseId;
        sourceBatch.locationNodeKey='WAREHOUSE:'+cid+':RAW';sourceBatch.currentLocationNodeId=rawWarehouseId;
        if(sourceLot){sourceLot.stage='RAW_INVENTORY';sourceLot.warehouseId=rawWarehouseId;sourceLot.locationNodeKey=sourceBatch.locationNodeKey;}
        warehouse.storedBatchIds=Array.isArray(warehouse.storedBatchIds)?warehouse.storedBatchIds:[];
        if(!warehouse.storedBatchIds.some(value=>String(value)===sourceBatchId))warehouse.storedBatchIds.push(sourceBatchId);
      }
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
    // Delivery updates warehouse/factory input ledgers only. Production is scheduled and
    // output cannot be committed until the authoritative in-game calendar reaches finishDate.
    const receivedRecipe=recipeFor(rid,factory),productionMetrics=factoryProductionMetrics(factory,receivedRecipe);
    const existingCycle=factoryCycleStore(cid).factoryProductionCycles[String(s.factoryId)];
    const cycleInputBatchIds=new Set((existingCycle?.sourceBatchIds||[]).map(String));
    const arrivalInputBatchId=String(inputBatchId||s.factoryInputBatchId||'');
    const arrivalBelongsToCurrentCycle=!!arrivalInputBatchId&&cycleInputBatchIds.has(arrivalInputBatchId);
    const processing=factoryCycleActive(existingCycle)
      ?arrivalBelongsToCurrentCycle
        ?{status:existingCycle.status==='PAUSED'?'PAUSED':'IN_PROGRESS',cycleId:existingCycle.cycleId,
          factoryId:String(s.factoryId),finishDate:existingCycle.finishDate,productionQuantity:existingCycle.productionQuantity,idempotent:true}
        :{status:'BLOCKED',reason:'FACTORY_CYCLE_ALREADY_RUNNING',activeCycleId:existingCycle.cycleId,
          factoryId:String(s.factoryId),finishDate:existingCycle.finishDate}
      :productionMetrics.missingInputs.length
        ?{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',factoryId:String(s.factoryId),
          missingInputs:clone(productionMetrics.missingInputs),capacity:productionMetrics.capacity}
        :startFactoryProductionCycle({countryId:cid,factoryId:s.factoryId,resourceId:rid,
          quantity:productionMetrics.possibleProduction,unit:s.unit||sourceBatch?.unit||factory.inputUnit||null});
    s.processingStatus=processing?.status==='COMPLETED'?'PROCESSED':
      processing?.status==='IN_PROGRESS'?'IN_PROGRESS':
      processing?.status==='PAUSED'?'PAUSED':
      ['FACTORY_INPUT_SHORTAGE','FACTORY_INPUT_OR_BATCH_SHORTAGE','FACTORY_INPUT_BATCH_LEDGER_MISMATCH'].includes(processing?.reason)
        ?'AWAITING_INPUTS':'AWAITING_PROCESSING';
    s.processingTransactionId=processing?.transactionId||processing?.cycleId||null;s.processing=clone(processing);
    // A mine-to-factory shipment must leave the site's active ledger on this exact receipt.
    // Do not clear unrelated cargo: one mine may have several batches in transit concurrently.
    if(String(s.shipmentType||'')==='RAW_TO_FACTORY'){
      const flow=siteFlowRows(cid).find(row=>String(row.batchId||'')===sourceBatchId);
      if(flow?.mineLogisticsRouteId){
        const siteRuntime=siteLogisticsState(cid,s.siteId,siteLogisticsRouteFor(cid,s.siteId));
        if(siteRuntime){
          siteRuntime.factoryReceivedQuantity=(num(siteRuntime.factoryReceivedQuantity)||0)+quantity;
          closeActiveSiteShipment(siteRuntime,s.shipmentId);
          siteRuntime.currentStage=siteRuntime.runtimeActive?siteRuntime.currentStage:'FACTORY_RECEIVED';
          appendSiteLogisticsStage(siteRuntime,'RAW_TO_FACTORY','FACTORY_RECEIVED',{shipmentId:s.shipmentId,batchId:sourceBatchId,
            quantity,unit:s.unit,turn:turn(),factoryId:s.factoryId,processingStatus:s.processingStatus});
          if(siteRuntime.runtimeActive){
            siteRuntime.currentStage=String(siteRuntime.currentStage||'IN_TRANSIT');
            siteRuntime.status=siteRuntime.currentStage==='RAW_TO_FACTORY'?'IN_TRANSIT_TO_FACTORY':'IN_TRANSIT_TO_WAREHOUSE';
          }
        }
        flow.mineLogisticsStatus='FACTORY_RECEIVED';flow.lastMineFactoryReceiptTurn=turn();
        addFlowStage(flow,'FACTORY','RECEIVED',{shipmentId:s.shipmentId,factoryId:s.factoryId,quantity,processingStatus:s.processingStatus});
        saveSiteFlow(cid,flow);
      }
    }
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
        }else if(processing?.status==='IN_PROGRESS'||processing?.status==='PAUSED'){
          addFlowStage(row,'PROCESSING',processing.status,{cycleId:processing.cycleId||null,finishDate:processing.finishDate||null,
            productionQuantity:processing.productionQuantity||0,reason:processing.reason||null});
        }else if(['FACTORY_INPUT_SHORTAGE','FACTORY_INPUT_OR_BATCH_SHORTAGE','FACTORY_INPUT_BATCH_LEDGER_MISMATCH'].includes(processing?.reason)){
          addFlowStage(row,'PROCESSING','AWAITING_INPUTS',{reason:processing.reason,missingInputs:processing.missingInputs||[]});
        }else if(processing?.reason==='FACTORY_CYCLE_ALREADY_RUNNING'){
          addFlowStage(row,'PROCESSING','AWAITING_CYCLE',{activeCycleId:processing.activeCycleId||null,
            finishDate:processing.finishDate||null,reason:processing.reason});
        }else if(processing?.reason==='FACTORY_TURN_CAPACITY_ALREADY_USED')addFlowStage(row,'PROCESSING','AWAITING_CAPACITY',{reason:processing.reason,turn:turn()});
        else addFlowStage(row,'PROCESSING','BLOCKED',{reason:processing?.reason||processing?.status||'PROCESSING_NOT_COMPLETED'});
      });

    }
  }
  dispatchResidualSiteBatches(cid);
  dispatchResidualMineHauls(cid);
  n.deliveries=n.deliveries.slice(-MAX_SHIPMENTS);
  return{status:'ADVANCED',countryId:cid,turn:turn(),delivered:delivered.length,mineDelivered:mineDelivered.length,mineShipments:mineDelivered,shipments:delivered};
}
function mineConstructionProfile(site){
  const siteType=String(site?.siteType||site?.identity?.siteType||site?.sourceSiteRecord?.siteType||'').toUpperCase();
  const method=String(site?.operation?.extractionMethod||site?.sourceSiteRecord?.extractionMethod||'').toUpperCase();
  const context=siteType+' '+method+' '+String(site?.resourceId||site?.real?.resourceId||site?.identity?.resourceTypeId||'').toUpperCase();
  if(/OFFSHORE|SUBSEA|FLOATING PLATFORM|MARINE FIELD/.test(context))return'OFFSHORE_PLATFORM';
  if(/TAILINGS|REPROCESSING/.test(context))return'TAILINGS';
  if(/BRINE|SALT|SODA_ASH/.test(context))return'BRINE';
  if(/OIL_FIELD|GAS_FIELD|PETROLEUM|WELLHEAD|WELL_DRILL|CRUDE_OIL|NATURAL_GAS/.test(context))return'OIL_GAS_FIELD';
  if(/QUARRY|AGGREGATE PIT|STONE PIT/.test(context)||/QUARRY_CRUSH_SCREEN/.test(method))return'QUARRY';
  if(/PROCESSING|MILL|PLANT|CONCENTRATOR/.test(context))return'PROCESSING';
  if(/UNDERGROUND|LONGWALL|BLOCK_CAVING|ROOM_PILLAR|SHAFT|TUNNEL/.test(context))return'UNDERGROUND';
  return'OPEN_PIT';
}
function countryFinanceBucket(c){
  const finance=state()?.finance||{},cid=canonicalCountry(c);
  const key=Object.keys(finance).find(k=>canonicalCountry(k)===cid);
  if(key&&finance[key]&&typeof finance[key]==='object'){
    const bucket=finance[key],available=num(bucket.available);
    if(available!==null)return{key,bucket,field:'available',value:available};
    const model=num(bucket.omegaFinance?.treasuryBalanceUsd);
    if(model!==null)return{key,bucket,field:'omegaFinance.treasuryBalanceUsd',value:model,modelFallback:true};
  }
  const economy=state()?.economy||{},ekey=Object.keys(economy).find(k=>canonicalCountry(k)===cid);
  if(ekey&&economy[ekey]&&num(economy[ekey].treasury)!==null)
    return{key:ekey,bucket:economy[ekey],field:'treasury',value:num(economy[ekey].treasury),fallback:true};
  return{key:null,bucket:null,field:null,value:null};
}
function countryStockKey(obj,rid){
  if(!obj||typeof obj!=='object')return null;
  if(Object.prototype.hasOwnProperty.call(obj,rid))return rid;
  return Object.keys(obj).find(k=>tok(k)===tok(rid))||null;
}
function mineConstructionStock(c,rid){
  const rs=state()?.resource?.[canonicalCountry(c)]||{},inv=rs.inventory||{},warehouse=rs.warehouse||{};
  const invKey=countryStockKey(inv,rid),warehouseRows=warehouse.availableByResource||{},warehouseKey=countryStockKey(warehouseRows,rid);
  const invAmount=invKey===null?null:Math.max(0,num(inv[invKey])||0);
  const warehouseAmount=warehouseKey===null?null:Math.max(0,num(warehouseRows[warehouseKey])||0);
  const reserved=Math.max(0,num(warehouse.reservedByResource?.[warehouseKey||rid])||0);
  const warehouseFree=warehouseAmount===null?null:Math.max(0,warehouseAmount-reserved);
  let available=null,authority='UNOBSERVED';
  if(invAmount!==null&&warehouseFree!==null){available=Math.min(invAmount,warehouseFree);authority='INVENTORY_AND_RAW_WAREHOUSE_LEDGER';}
  else if(warehouseFree!==null){available=warehouseFree;authority='RAW_WAREHOUSE_LEDGER';}
  else if(invAmount!==null){available=invAmount;authority='LEGACY_INVENTORY_AGGREGATE_ONLY';}
  return{resourceId:rid,inventoryKey:invKey,warehouseKey,inventoryAmount:invAmount,warehouseBalance:warehouseAmount,warehouseAvailable:warehouseFree,reserved,available:available===null?0:available,authority};
}

function factoryConstructionMaterialQuote(c,profile){
  const cid=canonicalCountry(c),catalog=cat()||{},knownResources=catalog.resourceRules||{},bom=profile?.constructionMaterials;
  if(!cid||!profile)return{status:'BLOCKED',reason:'FACTORY_PROFILE_UNAVAILABLE',countryId:cid||null};
  if(!bom||typeof bom!=='object'||Array.isArray(bom)||!Object.keys(bom).length)
    return{status:'BLOCKED',reason:'FACTORY_CONSTRUCTION_BOM_MISSING',factoryType:profile.factoryType||null};
  const materials=[];
  for(const [resourceIdRaw,quantityRaw] of Object.entries(bom)){
    const resourceId=tok(resourceIdRaw),required=num(quantityRaw);
    if(!resourceId||required===null||required<=0)
      return{status:'BLOCKED',reason:'FACTORY_CONSTRUCTION_BOM_INVALID',factoryType:profile.factoryType||null,resourceId:resourceIdRaw,quantity:quantityRaw};
    if(!Object.keys(knownResources).some(key=>tok(key)===resourceId))
      return{status:'BLOCKED',reason:'FACTORY_CONSTRUCTION_RESOURCE_UNREGISTERED',factoryType:profile.factoryType||null,resourceId};
    const stock=mineConstructionStock(cid,resourceId);
    const available=stock.available===null?0:Math.max(0,num(stock.available)||0);
    materials.push({resourceId,required,available,shortfall:Math.max(0,required-available),unit:profile.constructionMaterialUnit||'SIMULATION_RESOURCE_UNIT',
      sufficient:available+1e-9>=required,stockAuthority:stock.authority,inventoryAmount:stock.inventoryAmount,warehouseAvailable:stock.warehouseAvailable,
      reserved:stock.reserved});
  }
  const missing=materials.filter(row=>!row.sufficient);
  return{status:missing.length?'BLOCKED':'QUOTED',reason:missing.length?'INSUFFICIENT_FACTORY_CONSTRUCTION_MATERIALS':null,
    contract:'OMEGA_FACTORY_CONSTRUCTION_BOM_V1',countryId:cid,factoryType:profile.factoryType||null,
    unit:profile.constructionMaterialUnit||'SIMULATION_RESOURCE_UNIT',authority:profile.constructionMaterialsAuthority||'UNDECLARED',
    materials,missingMaterials:missing,ready:missing.length===0,simulationOnly:true};
}
function consumeFactoryConstructionMaterial(c,material,quantity,projectId,unit='SIMULATION_RESOURCE_UNIT'){
  const allocations=consumeMineConstructionMaterial(c,material,quantity,projectId,'FACTORY_CONSTRUCTION_MATERIAL_CONSUMPTION',unit);
  return allocations.map(row=>({...row,unit,sourceUnit:row.sourceUnit||row.unit||'NOT_RECORDED',
    unitBridge:{sourceUnit:row.sourceUnit||row.unit||'NOT_RECORDED',targetUnit:unit,factor:1,simulationOnly:true,
      authority:'SIMULATED_FACTORY_CONSTRUCTION_UNIT_BRIDGE'},projectId,movementType:'FACTORY_CONSTRUCTION_MATERIAL_CONSUMPTION',
    authority:row.authority||'UNOBSERVED'}));
}

function quoteMineProject(input={}){
  const cid=canonicalCountry(input.countryId),siteId=String(input.siteId||'').trim(),rid=tok(input.resourceId||'');
  if(!cid||!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'VALID_ISO3_COUNTRY_REQUIRED'};
  if(!siteId)return{status:'BLOCKED',reason:'MINE_SITE_REQUIRED'};
  const requestedCount=input.quantity==null?1:num(input.quantity);
  if(requestedCount===null||!Number.isInteger(requestedCount)||requestedCount<1||requestedCount>100)
    return{status:'BLOCKED',reason:'MINE_BUILD_COUNT_OUT_OF_RANGE',minimum:1,maximum:100,requestedCount};
  const assetCount=requestedCount;
  const site=siteById(siteId);
  if(!site)return{status:'BLOCKED',reason:'SITE_NOT_FOUND',countryId:cid,siteId};
  const siteCountry=canonicalCountry(site.countryId||site.sourceSiteRecord?.countryCode);
  if(siteCountry!==cid)return{status:'BLOCKED',reason:'COUNTRY_SITE_BOUNDARY_VIOLATION',countryId:cid,siteId,siteCountry};
  const source=site.sourceSiteRecord||{},actualResource=tok(site.real?.resourceId||source.resourceId||source.resourceTypeId||site.identity?.resourceTypeId);
  if(!actualResource)return{status:'BLOCKED',reason:'SITE_RESOURCE_ID_UNAVAILABLE',countryId:cid,siteId};
  if(rid&&rid!==actualResource)return{status:'BLOCKED',reason:'SITE_RESOURCE_ID_MISMATCH',countryId:cid,siteId,requestedResourceId:rid,siteResourceId:actualResource};
  if(site.map?.markerEligible===false||site.runtime?.aliasOfSiteId)return{status:'BLOCKED',reason:'SITE_NOT_ELIGIBLE_FOR_PLAYER_CONSTRUCTION',countryId:cid,siteId};
  if(String(site.operation?.status||source.status||'').toUpperCase()==='NOT_APPLICABLE')return{status:'BLOCKED',reason:'SITE_NOT_APPLICABLE',countryId:cid,siteId};
  const resourceId=actualResource,buildClass=mineConstructionProfile(site),profiles=cat()?.mineConstructionProfiles||{},rule=profiles[buildClass]||profiles.OPEN_PIT;
  if(!rule||!rule.materials||!Object.keys(rule.materials).length)return{status:'BLOCKED',reason:'MINE_CONSTRUCTION_PROFILE_UNAVAILABLE',buildClass,countryId:cid,siteId};
  const complexityRules=cat()?.mineResourceComplexity||{},complexity=num(complexityRules[resourceId])||1;
  const unitCostUsd=Math.ceil((num(rule.costUsd)||0)*complexity/1000-1e-9)*1000,costUsd=unitCostUsd*assetCount;
  const resourceAdjustments=cat()?.mineResourceAdjustments||{},resourceAdjustment=resourceAdjustments[resourceId]||{};
  const unitDurationDays=Math.ceil((num(rule.durationDays)||1)*(num(resourceAdjustment.durationMultiplier)||1)-1e-9),durationDays=unitDurationDays;
  const unitWorkersRequired=Math.ceil((num(rule.workersRequired)||0)*(num(resourceAdjustment.workforceMultiplier)||1)-1e-9),workersRequired=unitWorkersRequired*assetCount;
  const treasury=countryFinanceBucket(cid),countryResource=state()?.resource?.[cid]||{};
  const materials=Object.entries(rule.materials).map(([materialId,quantity])=>{
    const stock=mineConstructionStock(cid,materialId),unitRequired=Math.ceil((num(quantity)||0)*complexity-1e-9),required=unitRequired*assetCount;
    return{resourceId:tok(materialId),required,unitRequired,available:stock.available,shortfall:Math.max(0,required-stock.available),unit:'SIMULATION_RESOURCE_UNIT',sufficient:stock.available+1e-9>=required,stockAuthority:stock.authority};
  });
  const assignedWorkers=num(input.assignedWorkers);
  const completedAssets=(Array.isArray(countryResource.mineAssets)?countryResource.mineAssets:[]).filter(x=>String(x?.siteId||'')===siteId&&String(x?.status||'').toUpperCase()==='OPERATIONAL').length;
  const activeProject=(Array.isArray(countryResource.industrialNetwork?.projects)?countryResource.industrialNetwork.projects:[]).find(p=>p.projectType==='MINE_CONSTRUCTION'&&String(p.siteId||'')===siteId&&p.status==='UNDER_CONSTRUCTION');
  return{status:'QUOTED',contract:'OMEGA_MINE_CONSTRUCTION_QUOTE_V1',countryId:cid,siteId,siteName:site.siteName||siteId,siteCountry,resourceId,
    resourceName:site.identity?.resourceName||resourceId.replace(/[_-]+/g,' '),sourceStatus:site.operation?.realWorldStatus||site.operation?.status||source.status||'UNOBSERVED',
    buildClass,projectType:'MINE_CONSTRUCTION',assetCount,unitCostUsd,costUsd,unitDurationDays,durationDays,estimatedTurns:Math.ceil(durationDays/daysPerTurn()),
    unitWorkersRequired,workersRequiredPerAsset:unitWorkersRequired,workersRequired,assignedWorkers,staffingReady:assignedWorkers!==null&&assignedWorkers>=workersRequired,
    materials,materialsReady:materials.every(x=>x.sufficient),treasury:{available:treasury.value,required:costUsd,sufficient:treasury.value!==null&&treasury.value+1e-9>=costUsd,
      source:treasury.field==='available'?'state.finance.'+treasury.key+'.available':treasury.field==='omegaFinance.treasuryBalanceUsd'?'state.finance.'+treasury.key+'.omegaFinance.treasuryBalanceUsd':treasury.field==='treasury'?'state.economy.'+treasury.key+'.treasury':'UNAVAILABLE'},
    commissioningReady:!activeProject,activeProjectId:activeProject?.projectId||null,commissionedAssetCount:completedAssets,
    forecastCapacityMultiplier:Math.min(1.60,1.0+0.12*(completedAssets+assetCount)),
    assumptions:{capexAuthority:'SIMULATED_GAMEPLAY_RULES_NOT_A_REAL_VENDOR_QUOTE',materialRequirementsAuthority:rule.authority||'SIMULATED_MINE_CONSTRUCTION_PROFILE_V1',
      quantityAuthority:'PLAYER_SELECTED_MINE_ASSET_COUNT',workforceAuthority:'SIMULATED_PLAYER_STAFFING_COMMITMENT',
      reserveAuthority:site.quantitative?.reserve?.status||site.reserve?.status||'UNOBSERVED',coordinateAuthority:site.location?.coordinatePrecision||site.location?.coordinateStatus||'UNOBSERVED',realWorldStatusIsNotChangedByPlayerCommissioning:true},
    ready:treasury.value!==null&&treasury.value+1e-9>=costUsd&&materials.every(x=>x.sufficient)&&assignedWorkers!==null&&assignedWorkers>=workersRequired&&!activeProject};
}
function consumeMineConstructionMaterial(c,material,quantity,projectId,movementType='MINE_CONSTRUCTION_MATERIAL_CONSUMPTION',unitOverride=null){
  const cid=canonicalCountry(c),rs=resourceState(cid),stock=mineConstructionStock(cid,material),inv=rs.inventory||(rs.inventory={});
  const warehouse=rs.warehouse||(rs.warehouse={warehouseId:'WH-'+cid+'-RAW',countryId:cid,type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',availableByResource:{},reservedByResource:{}});
  warehouse.availableByResource=warehouse.availableByResource||{};warehouse.reservedByResource=warehouse.reservedByResource||{};
  const batches=Array.isArray(rs.batches)?rs.batches:[],lots=rs.inventoryLots&&typeof rs.inventoryLots==='object'?rs.inventoryLots:{};
  let remaining=quantity;const allocations=[];
  for(const batch of batches){
    if(remaining<=1e-9)break;
    if(tok(batch?.resourceId||batch?.materialIdentity)!==tok(material))continue;
    if(['FACTORY_INPUT','CONSUMED','TRANSFERRED_TO_FACTORY','SOLD','EXHAUSTED'].includes(String(batch?.stage||batch?.status||'').toUpperCase()))continue;
    const prior=Math.max(0,num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);
    if(prior<=1e-9)continue;
    const take=Math.min(prior,remaining);
    batch.remainingQuantity=Math.max(0,prior-take);
    batch.status=batch.remainingQuantity>1e-9?(movementType==='FACTORY_CONSTRUCTION_MATERIAL_CONSUMPTION'?'PARTIALLY_CONSUMED_FACTORY_CONSTRUCTION':'PARTIALLY_CONSUMED_MINE_CONSTRUCTION'):(movementType==='FACTORY_CONSTRUCTION_MATERIAL_CONSUMPTION'?'CONSUMED_FACTORY_CONSTRUCTION':'CONSUMED_MINE_CONSTRUCTION');
    batch.lastMovementType=movementType;batch.lastMovementTurn=turn();
    const lot=lots[batch.batchId];
    if(lot){lot.remainingQuantity=batch.remainingQuantity;lot.status=batch.remainingQuantity>1e-9?(movementType==='FACTORY_CONSTRUCTION_MATERIAL_CONSUMPTION'?'PARTIALLY_CONSUMED_FACTORY_CONSTRUCTION':'PARTIALLY_CONSUMED_MINE_CONSTRUCTION'):(movementType==='FACTORY_CONSTRUCTION_MATERIAL_CONSUMPTION'?'CONSUMED_FACTORY_CONSTRUCTION':'CONSUMED_MINE_CONSTRUCTION');
      lot.lastMovementType=movementType;lot.lastMovementTurn=turn();lots[batch.batchId]=lot;}
    allocations.push({resourceId:material,sourceBatchId:batch.batchId,quantity:take,unit:unitOverride||batch.unit||'TONNES',sourceUnit:batch.unit||'NOT_RECORDED',authority:batch.provenance?.sourceAuthority||batch.provenance?.authority||'UNOBSERVED'});
    remaining-=take;
  }
  if(remaining>1e-9)allocations.push({resourceId:material,sourceBatchId:null,quantity:remaining,unit:unitOverride||'TONNES',sourceUnit:'NOT_RECORDED',authority:stock.authority==='LEGACY_INVENTORY_AGGREGATE_ONLY'?'LEGACY_AGGREGATE_STOCK':'UNTRACKED_WAREHOUSE_BALANCE'});
  const invKey=stock.inventoryKey||material,warehouseKey=stock.warehouseKey||material;
  if(stock.inventoryAmount!==null)inv[invKey]=Math.max(0,stock.inventoryAmount-quantity);
  if(stock.warehouseBalance!==null)warehouse.availableByResource[warehouseKey]=Math.max(0,stock.warehouseBalance-quantity);
  rs.inventory=inv;rs.warehouse=warehouse;rs.batches=batches;rs.inventoryLots=lots;
  return allocations;
}
function startMineProject(input={}){
  const cid=canonicalCountry(input.countryId),siteId=String(input.siteId||'').trim(),requestId=String(input.requestId||'').trim();
  if(!cid||!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'VALID_ISO3_COUNTRY_REQUIRED'};
  if(!siteId)return{status:'BLOCKED',reason:'MINE_SITE_REQUIRED'};
  const n=netState(cid),requests=Array.isArray(n.projects)?n.projects:[];
  if(requestId){
    const prior=requests.find(p=>p.projectType==='MINE_CONSTRUCTION'&&String(p.requestId||'')===requestId);
    if(prior)return{...clone(prior),idempotent:true};
  }
  const active=requests.find(p=>p.projectType==='MINE_CONSTRUCTION'&&String(p.siteId||'')===siteId&&p.status==='UNDER_CONSTRUCTION');
  if(active)return{status:'BLOCKED',reason:'MINE_CONSTRUCTION_ALREADY_IN_PROGRESS',project:clone(active)};
  const assignedWorkers=num(input.assignedWorkers);
  const assetCount=input.quantity==null?1:num(input.quantity);
  const quote=quoteMineProject({...input,assignedWorkers,quantity:assetCount});
  if(quote.status!=='QUOTED')return quote;
  if(assignedWorkers===null||assignedWorkers<quote.workersRequired)
    return{status:'BLOCKED',reason:'INSUFFICIENT_WORKER_COMMITMENT',required:quote.workersRequired,assigned:assignedWorkers,quote};
  if(quote.treasury.available===null)return{status:'BLOCKED',reason:'TREASURY_AVAILABLE_BALANCE_UNAVAILABLE',required:quote.costUsd,quote};
  if(!quote.treasury.sufficient)return{status:'BLOCKED',reason:'INSUFFICIENT_TREASURY',required:quote.costUsd,available:quote.treasury.available,quote};
  const short=quote.materials.filter(x=>!x.sufficient);
  if(short.length)return{status:'BLOCKED',reason:'INSUFFICIENT_CONSTRUCTION_MATERIALS',materials:short,quote};
  if(!quote.commissioningReady)return{status:'BLOCKED',reason:'MINE_CONSTRUCTION_ALREADY_IN_PROGRESS',projectId:quote.activeProjectId,quote};
  const account=countryFinanceBucket(cid),treasuryBefore=account.value;
  const materialAllocations=[];
  for(const item of quote.materials)materialAllocations.push(...consumeMineConstructionMaterial(cid,item.resourceId,item.required,'MINE_BUILD:'+siteId));
  const treasuryAfter=treasuryBefore-quote.costUsd;
  if(account.field==='available')account.bucket.available=treasuryAfter;
  else if(account.field==='treasury')account.bucket.treasury=treasuryAfter;
  else if(account.field==='omegaFinance.treasuryBalanceUsd'){
    account.bucket.available=treasuryAfter;
    const economyRoot=state()?.economy||{},economyKey=Object.keys(economyRoot).find(k=>canonicalCountry(k)===cid);
    if(economyKey&&economyRoot[economyKey]&&num(economyRoot[economyKey].treasury)!==null)economyRoot[economyKey].treasury=treasuryAfter;
  }
  if(account.bucket?.omegaFinance&&typeof account.bucket.omegaFinance==='object'){
    const fm=account.bucket.omegaFinance;
    fm.treasuryBalanceUsd=treasuryAfter;fm.lastSyncedTreasuryBalanceUsd=treasuryAfter;
    fm.currentYearSpendingUsd=(num(fm.currentYearSpendingUsd)||0)+quote.costUsd;
    fm.cumulativeSpendingUsd=(num(fm.cumulativeSpendingUsd)||0)+quote.costUsd;
    fm.revision=(num(fm.revision)||0)+1;
    fm.ledger=Array.isArray(fm.ledger)?fm.ledger:[];
    fm.ledger.push({turn:turn(),countryCode:cid,department:'resource',action:'MINE_CONSTRUCTION_PAYMENT',category:'capital_investment',
      amountUsd:quote.costUsd,direction:'OUTFLOW',balanceAfterUsd:treasuryAfter,source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',
      description:'Mine construction capex for '+quote.siteName,siteId,projectType:'MINE_CONSTRUCTION'});
    fm.ledger=fm.ledger.slice(-500);
  }
  const txId='MINE-CAPEX:'+cid+':'+siteId+':T'+turn()+':'+h32(String(requestId||JSON.stringify(input)));
  const rs=resourceState(cid);rs.mineConstructionLedger=Array.isArray(rs.mineConstructionLedger)?rs.mineConstructionLedger:[];
  const projectId='MINE:'+cid+':'+siteId+':N'+quote.assetCount+':T'+turn()+':'+h32(String(requestId||JSON.stringify(input)));
  const constructionStartDate=factoryCurrentGameDate();
  const expectedCompletionDate=constructionStartDate?factoryAddGameDays(constructionStartDate,quote.durationDays):null;
  const project={projectId,requestId:requestId||projectId,projectType:'MINE_CONSTRUCTION',countryId:cid,siteId,siteName:quote.siteName,
    resourceId:quote.resourceId,buildClass:quote.buildClass,assetCount:quote.assetCount,workersRequiredPerAsset:quote.workersRequiredPerAsset,mineId:'MINE_ASSET:'+cid+':'+siteId+':'+h32(projectId),
    status:'UNDER_CONSTRUCTION',startTurn:turn(),startDate:constructionStartDate,expectedCompletionDate,estimatedCompletionDate:expectedCompletionDate,
    progressDays:0,progressPct:0,remainingDays:quote.durationDays,durationDays:quote.durationDays,
    estimatedTurns:quote.estimatedTurns,cost:quote.costUsd,costUsd:quote.costUsd,currency:'USD',workersRequired:quote.workersRequired,
    workersCommitted:assignedWorkers,staffingStatus:'CONTRACTED_BY_PLAYER',staffingAuthority:'PLAYER_CONFIRMED_CONSTRUCTION_STAFFING_COMMITMENT',
    materialsRequired:clone(quote.materials.map(x=>({resourceId:x.resourceId,quantity:x.required,unit:x.unit}))),
    materialAllocations:clone(materialAllocations),treasuryTransactionId:txId,treasuryStatus:'DEBITED',
    treasuryBeforeUsd:treasuryBefore,treasuryAfterUsd:treasuryAfter,constructionMaterialsStatus:'CONSUMED',
    sourceSiteStatus:quote.sourceStatus,siteIdentityAuthority:siteById(siteId)?.runtime?.identityAuthority||'CANONICAL_SITE_REGISTRY',
    costAuthority:'SIMULATED_GAMEPLAY_RULES_NOT_A_REAL_VENDOR_QUOTE',createdTurn:turn(),
    capacityMultiplierAtCommission:quote.forecastCapacityMultiplier,
    provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:'SIMULATED_PLAYER_PROJECT',siteId,resourceId:quote.resourceId,simulationTurn:turn()}
  };
  n.projects.push(project);n.projects=n.projects.slice(-MAX_PROJECTS);
  rs.mineConstructionLedger.push({transactionId:txId,projectId,countryId:cid,siteId,resourceId:quote.resourceId,costUsd:quote.costUsd,
    treasuryBeforeUsd:treasuryBefore,treasuryAfterUsd:treasuryAfter,materialAllocations:clone(materialAllocations),status:'PAID_AND_MATERIALS_ISSUED',turn:turn(),
    authority:'RESOURCE_MINE_CONSTRUCTION_TRANSACTION_V1'});
  rs.mineConstructionLedger=rs.mineConstructionLedger.slice(-2048);
  emit('OMEGA_RESOURCE_MINE_PROJECT_STARTED',cid,{projectId,requestId:project.requestId,siteId,resourceId:project.resourceId,
    costUsd:project.costUsd,durationDays:project.durationDays,daysRemaining:project.remainingDays,progressDays:project.progressDays,
    expectedCompletionDate:project.expectedCompletionDate,workersRequired:project.workersRequired,workersCommitted:project.workersCommitted,
    materialsRequired:project.materialsRequired,treasuryTransactionId:txId,authority:'RESOURCE_MINE_CONSTRUCTION_TRANSACTION_V1'});
  return clone(project);
}
function commissionMineProject(cid,p){
  const rs=resourceState(cid);rs.mineAssets=Array.isArray(rs.mineAssets)?rs.mineAssets:[];
  const count=Math.max(1,Math.min(100,Math.floor(num(p.assetCount)||1))),assets=[];
  const baseMineId=String(p.mineId||('MINE_ASSET:'+cid+':'+p.siteId+':'+h32(p.projectId)));
  for(let index=1;index<=count;index++){
    const mineId=index===1?baseMineId:baseMineId+':UNIT:'+index;
    let asset=rs.mineAssets.find(x=>String(x?.mineId||x?.id||'')===mineId);
    if(!asset){
      const sameSiteCount=rs.mineAssets.filter(x=>String(x?.siteId||'')===String(p.siteId)&&String(x?.status||'').toUpperCase()==='OPERATIONAL').length;
      const perAssetWorkers=Math.max(0,Math.floor(num(p.workersRequiredPerAsset)||((num(p.workersRequired)||0)/count)));
      const perAssetCommitted=Math.max(0,Math.floor((num(p.workersCommitted)||0)/count));
      asset={mineId,id:mineId,siteId:p.siteId,siteName:p.siteName,resourceId:p.resourceId,buildClass:p.buildClass,countryId:cid,ownerCountryId:cid,status:'OPERATIONAL',
        buildProjectId:p.projectId,commissionedTurn:turn(),capacityMultiplier:Math.min(1.60,1+0.12*(sameSiteCount+1)),workersRequired:perAssetWorkers,workersCommitted:perAssetCommitted,
        constructionCostUsd:(num(p.costUsd)||0)/count,commissioningLevel:sameSiteCount+1,assetCountAtConstruction:count,sourceSiteStatus:p.sourceSiteStatus||'UNOBSERVED',
        siteIdentityAuthority:p.siteIdentityAuthority||'CANONICAL_SITE_REGISTRY',authority:'SIMULATED_PLAYER_MINE_ASSET',productionStatus:'READY_FOR_EXTRACTION',lastProductionTurn:null};
      rs.mineAssets.push(asset);rs.mineAssets=rs.mineAssets.slice(-1024);
    }
    assets.push(asset);
  }
  p.commissionedMineIds=assets.map(asset=>String(asset.mineId||asset.id||''));
  p.commissionedAssetCount=assets.length;
  p.mineAssetId=assets[0]?.mineId||p.mineId||null;
  rs.mineConstructionLedger=Array.isArray(rs.mineConstructionLedger)?rs.mineConstructionLedger:[];
  const ledger=rs.mineConstructionLedger.find(x=>String(x.projectId||'')===String(p.projectId));
  if(ledger){ledger.status='MINE_COMMISSIONED';ledger.commissionedTurn=turn();ledger.mineId=assets[0]?.mineId||p.mineId;ledger.commissionedMineIds=assets.map(x=>x.mineId);}
  emit('OMEGA_RESOURCE_MINE_COMMISSIONED',cid,{projectId:p.projectId,siteId:p.siteId,mineId:assets[0]?.mineId||p.mineId,mineIds:assets.map(x=>x.mineId),
    commissionedAssetCount:assets.length,assetCountAtConstruction:count,resourceId:p.resourceId,siteName:p.siteName,status:'OPERATIONAL',commissionedTurn:turn(),
    capacityMultiplier:assets[assets.length-1]?.capacityMultiplier||1,sourceSiteStatus:p.sourceSiteStatus,authority:'SIMULATED_PLAYER_MINE_ASSET'});
  emit('OMEGA_RESOURCE_MINE_CAPACITY_CHANGED',cid,{siteId:p.siteId,mineIds:assets.map(x=>x.mineId),assetCount:assets.length,commissioningLevel:assets[assets.length-1]?.commissioningLevel||1,status:'OPERATIONAL'});
  return assets[0]||null;
}
function startFactoryProject(input={}){
  const cid=canonicalCountry(input.countryId);
  if(!cid)return{status:'BLOCKED',reason:'FACTORY_COUNTRY_INVALID'};
  const n=netState(cid);
  if(input.requestId){const prior=n.projects.find(row=>row.projectType==='FACTORY_CONSTRUCTION'&&String(row.requestId||'')===String(input.requestId));if(prior)return{...clone(prior),idempotent:true};}
  if(input.factoryId){const prior=n.projects.find(row=>row.projectType==='FACTORY_CONSTRUCTION'&&String(row.factoryId||'')===String(input.factoryId)&&['UNDER_CONSTRUCTION','COMPLETED'].includes(String(row.status||'')));if(prior)return{...clone(prior),idempotent:true};}
  const requestedType=normalizeFactoryType(input.factoryType);
  const profiles=cat()?.factoryProfiles||{},profile=requestedType?profiles[requestedType]||null:null;
  const downstream=cat()?.downstreamFactoryRecipes||{};
  const requestedRecipeId=String(input.recipeId||'').trim();
  let selected=requestedRecipeId?downstream[requestedRecipeId]||null:null;
  let rid=tok(input.resourceId);
  if(!selected&&requestedType){
    const candidates=Object.values(downstream).filter(row=>String(row?.factoryType||'').toUpperCase()===requestedType);
    selected=candidates.find(row=>rid&&Object.keys(row?.inputs||{}).some(key=>tok(key)===rid))||
      candidates.find(row=>String(row?.recipeId||'')===String(profile?.defaultRecipeId||''))||candidates[0]||null;
  }
  let rule;
  if(selected){
    if(requestedType&&String(selected.factoryType||'').toUpperCase()!==requestedType)
      return{status:'BLOCKED',reason:'FACTORY_RECIPE_TYPE_MISMATCH',factoryType:requestedType,recipeId:selected.recipeId};
    const recipeInputs=Object.keys(selected.inputs||{}).map(tok);
    if(rid&&!recipeInputs.includes(rid))
      return{status:'BLOCKED',reason:'FACTORY_RECIPE_RESOURCE_MISMATCH',factoryType:selected.factoryType,recipeId:selected.recipeId,resourceId:rid,acceptedInputs:recipeInputs};
    rid=rid||recipeInputs[0]||'';
    rule={...clone(selected),recipeAuthority:selected.recipeAuthority||'SIMULATED_GAMEPLAY_RULE',
      recipeMode:recipeInputs.length>1?'MULTI_INPUT':'SINGLE_INPUT'};
  }else{
    if(!rid)return{status:'BLOCKED',reason:'FACTORY_RESOURCE_REQUIRED'};
    rule=recipeFor(rid,{});
    if(requestedType&&String(rule.factoryType||'').toUpperCase()!==requestedType)
      return{status:'BLOCKED',reason:'FACTORY_TYPE_RESOURCE_MISMATCH',requestedFactoryType:requestedType,expectedFactoryType:rule.factoryType,resourceId:rid};
    if(rule.recipeAuthority==='SIMULATED_GENERIC_FALLBACK'&&!input.allowSimulationFallback)
      return{status:'BLOCKED',reason:'UNVERIFIED_GENERIC_RECIPE_REQUIRES_EXPLICIT_SIMULATION_OPT_IN',resourceId:rid};
  }
  if(!Object.keys(rule.inputs||{}).length||!Object.keys(rule.outputs||{}).length)
    return{status:'BLOCKED',reason:'NO_FACTORY_RECIPE'};
  const factoryType=String(rule.factoryType||requestedType||'').trim().toUpperCase();
  const typeProfile=profiles[factoryType]||profile||{};
  const catalogProfile=Object.prototype.hasOwnProperty.call(profiles,factoryType);
  let constructionMaterialQuote=null;
  if(catalogProfile){
    constructionMaterialQuote=factoryConstructionMaterialQuote(cid,typeProfile);
    if(constructionMaterialQuote.status!=='QUOTED')return{...constructionMaterialQuote,status:'BLOCKED',projectType:'FACTORY_CONSTRUCTION'};
  }
  const contractor=String(input.contractorType||'DOMESTIC_EPC'),cr=cat()?.contractorTypes?.[contractor]||cat()?.contractorTypes?.DOMESTIC_EPC;
  const profileDays=num(typeProfile.constructionDays),requestedDays=num(input.buildDays),requestedMonths=num(input.buildMonths);
  const projectStartDate=factoryCurrentGameDate();
  const exactMonthTarget=requestedMonths!==null&&requestedMonths>0&&projectStartDate
    ?factoryAddCalendarMonths(projectStartDate,Math.max(1,Math.round(requestedMonths))):null;
  const exactMonthDays=exactMonthTarget?factoryCalendarDaysBetween(projectStartDate,exactMonthTarget):null;
  const baseDays=exactMonthDays!==null&&exactMonthDays>0?exactMonthDays:Math.max(30,requestedDays||profileDays||Number(rule.cycleDays||1)*60+90);
  const constructionBonus=num(cr?.constructionBonus)||0;
  const days=baseDays*(1-constructionBonus);
  const estimatedCompletionDate=exactMonthTarget&&constructionBonus===0?exactMonthTarget:
    (projectStartDate?factoryAddGameDays(projectStartDate,Math.ceil(days-1e-9)):null);
  const configuredCost=num(typeProfile.constructionCost),requestedCost=num(input.cost);
  const configuredCapacity=num(typeProfile.defaultCapacityPerDay),requestedCapacity=num(input.capacityPerDay??input.throughputPerDay);
  const technologyIds=Array.isArray(input.requiredTechnologyIds)?input.requiredTechnologyIds.map(x=>String(x).toUpperCase()):
    (Array.isArray(typeProfile.requiredTechnologyIds)?typeProfile.requiredTechnologyIds.map(x=>String(x).toUpperCase()):[]);
  const project={projectId:'FACTORY:'+cid+':'+factoryType+':'+(rule.recipeId||rid)+':T'+turn()+':'+h32(JSON.stringify(input)),
    projectType:'FACTORY_CONSTRUCTION',countryId:cid,resourceId:rid,factoryType,
    recipeId:rule.recipeId||requestedRecipeId||null,recipeMode:rule.recipeMode|| (Object.keys(rule.inputs||{}).length>1?'MULTI_INPUT':'SINGLE_INPUT'),
    recipeAuthority:rule.recipeAuthority||'INDUSTRIAL_CATALOG_RULE',factoryProfile:clone(typeProfile),
    contractorType:contractor,contractorCountryId:canonicalCountry(input.contractorCountryId||cid),
    cost:Math.max(1,requestedCost||configuredCost||1000),costUnit:typeProfile.unit||'GAME_CURRENCY_UNITS',
    durationDays:Number(days.toFixed(2)),durationMonthsRequested:exactMonthTarget?Math.max(1,Math.round(requestedMonths)):null,
    startDate:projectStartDate,estimatedCompletionDate,estimatedCommissioningDate:estimatedCompletionDate,
    startTurn:turn(),progressDays:0,status:'UNDER_CONSTRUCTION',
    capacityPerDay:Math.max(1,requestedCapacity||configuredCapacity||500),recipe:clone(rule),
    factoryId:String(input.factoryId||('FAC:'+cid+':'+factoryType+':T'+turn()+':P'+n.projects.length+':'+h32(String(turn())+'|'+(rule.recipeId||rid)+'|'+n.projects.length))),
    targetLocationNodeKey:input.locationNodeKey||('INDUSTRIAL_ZONE:'+cid),foreignContract:contractor!=='DOMESTIC_EPC',
    requiredTechnologyIds:technologyIds,technologyPackage:clone(input.technologyPackage||null),
    constructionMaterialsAuthority:constructionMaterialQuote?.authority||'SIMULATED_GENERIC_FACTORY_RECIPE_WITHOUT_CATALOG_BOM',
    constructionMaterialUnit:constructionMaterialQuote?.unit||typeProfile.constructionMaterialUnit||'SIMULATION_RESOURCE_UNIT',
    materialsRequired:constructionMaterialQuote?clone(constructionMaterialQuote.materials.map(row=>({resourceId:row.resourceId,quantity:row.required,unit:row.unit}))):[],
    materialAllocations:[],constructionMaterialsStatus:constructionMaterialQuote?'PENDING_CONSUMPTION':'NOT_APPLICABLE',
    employmentProfile:clone(typeProfile.employment||null),requestId:String(input.requestId||''),
    authority:'SIMULATED_FACTORY_CONSTRUCTION_PROJECT',simulationOnly:true};
  if(constructionMaterialQuote){
    const materialAllocations=[];
    for(const material of constructionMaterialQuote.materials)
      materialAllocations.push(...consumeFactoryConstructionMaterial(cid,material.resourceId,material.required,project.projectId,constructionMaterialQuote.unit));
    project.materialAllocations=clone(materialAllocations);project.constructionMaterialsStatus='CONSUMED';project.constructionMaterialsConsumedTurn=turn();
  }
  n.projects.push(project);n.projects=n.projects.slice(-MAX_PROJECTS);
  emit('OMEGA_FACTORY_PROJECT_STARTED',cid,project);return project;
}
function startInfrastructureProject(input={}){
  const cid=canonicalCountry(input.countryId),type=tok(input.infrastructureType||'road'),ir=infraRules()[type];
  if(!cid)return{status:'BLOCKED',reason:'INFRASTRUCTURE_COUNTRY_INVALID'};
  if(!ir)return{status:'BLOCKED',reason:'INFRASTRUCTURE_TYPE_UNDEFINED'};
  const n=netState(cid),requestId=String(input.requestId||'').trim();
  if(requestId){const previous=n.projects.find(row=>row.projectType==='INFRASTRUCTURE'&&String(row.requestId||'')===requestId&&['UNDER_CONSTRUCTION','COMPLETED'].includes(String(row.status||'')));if(previous)return{...clone(previous),idempotent:true};}
  const utilityType=type==='power'||type==='water';
  const distance=utilityType?0:Math.max(0,num(input.distanceKm)||1),contractor=String(input.contractorType||'DOMESTIC_EPC'),cr=cat()?.contractorTypes?.[contractor]||{};
  const requestedDays=input.buildDays==null?null:num(input.buildDays);
  const days=Math.max(30,utilityType?Math.max(0,requestedDays||num(ir.buildDays)||180):
    (num(ir.buildDays)||180)*(distance/Math.max(1,num(input.distanceReferenceKm)||10))*(1-(num(cr?.constructionBonus)||0)));
  const requestedCapacity=input.capacityPerDay==null?null:num(input.capacityPerDay);
  const capacityAdd=requestedCapacity===null?num(ir.capacityPerDay):requestedCapacity;
  if(capacityAdd===null||!Number.isFinite(capacityAdd)||capacityAdd<=0)
    return{status:'BLOCKED',reason:'INFRASTRUCTURE_CAPACITY_MUST_BE_POSITIVE',infrastructureType:type,capacityPerDay:input.capacityPerDay};
  const fixed=num(ir.costFixed)||0,perKm=num(ir.costPerKm)||0,requestedCost=input.cost==null?null:num(input.cost);
  const project={projectId:'INFRA:'+cid+':'+type+':T'+turn()+':'+h32(JSON.stringify(input)),requestId:requestId||null,
    projectType:'INFRASTRUCTURE',countryId:cid,infrastructureType:type,distanceKm:distance,capacityAddPerDay:capacityAdd,
    capacityUnit:ir.capacityUnit||'SIMULATION_RESOURCE_UNITS_PER_DAY',
    cost:Math.max(1,requestedCost==null?(perKm*distance+fixed):requestedCost),durationDays:Number(days.toFixed(2)),
    progressDays:0,startTurn:turn(),status:'UNDER_CONSTRUCTION',simulationOnly:true,
    authority:utilityType?'SIMULATED_UTILITY_INFRASTRUCTURE_PROJECT':'SIMULATED_TRANSPORT_INFRASTRUCTURE_PROJECT',
    fromNode:input.fromNode||null,toNode:input.toNode||null,corridorId:input.corridorId||null,
    contractorType:contractor,contractorCountryId:canonicalCountry(input.contractorCountryId||cid)};
  n.projects.push(project);n.projects=n.projects.slice(-MAX_PROJECTS);emit('OMEGA_INFRASTRUCTURE_PROJECT_STARTED',cid,project);return project;
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
    p.progressPct=Math.min(1,p.progressDays/(num(p.durationDays)||1));
    p.remainingDays=Math.max(0,Math.ceil((num(p.durationDays)||1)-p.progressDays));
    if(p.projectType==='MINE_CONSTRUCTION'&&p.progressPct<1){
      emit('OMEGA_RESOURCE_MINE_PROJECT_PROGRESS',cid,{projectId:p.projectId,siteId:p.siteId,status:p.status,turn:turn(),
        progressDays:p.progressDays,durationDays:p.durationDays,progressPct:p.progressPct,daysRemaining:p.remainingDays,
        expectedCompletionDate:p.expectedCompletionDate||p.estimatedCompletionDate||null,authority:'RESOURCE_MINE_CONSTRUCTION_PROGRESS_V1'});
    }
    if(p.progressPct<1)continue;
    p.status='COMPLETED';p.completedTurn=turn();p.remainingDays=0;p.actualCompletionDate=factoryCurrentGameDate()||p.expectedCompletionDate||p.estimatedCompletionDate;completed.push(clone(p));
    if(p.projectType==='MINE_CONSTRUCTION'){
      const asset=commissionMineProject(cid,p);
      p.mineAssetId=asset.mineId;p.commissionedTurn=turn();p.assetStatus=asset.status;
      emit('OMEGA_RESOURCE_MINE_PROJECT_PROGRESS',cid,{projectId:p.projectId,siteId:p.siteId,status:'COMPLETED',turn:turn(),
        progressDays:p.progressDays,durationDays:p.durationDays,progressPct:1,daysRemaining:0,
        expectedCompletionDate:p.expectedCompletionDate||p.estimatedCompletionDate||null,actualCompletionDate:p.actualCompletionDate,
        commissionedMineIds:p.commissionedMineIds,authority:'RESOURCE_MINE_CONSTRUCTION_PROGRESS_V1'});
    }else if(p.projectType==='FACTORY_CONSTRUCTION'){
      const econ=econState(cid);econ.productionAssets=Array.isArray(econ.productionAssets)?econ.productionAssets:[];
      const techReady=(p.requiredTechnologyIds||[]).every(t=>resourceState(cid).technologyCapabilities?.some(x=>tok(x?.technologyId).toUpperCase()===tok(t)));
      const assetStatus=techReady?'OPERATIONAL':'TECHNOLOGY_LOCKED';
      const factoryProfile=p.factoryProfile||cat()?.factoryProfiles?.[normalizeFactoryType(p.factoryType)]||{};
      econ.productionAssets.push({id:p.factoryId,countryId:cid,stage:'PROCESSING',factoryType:p.factoryType,
        recipeId:p.recipeId||p.recipe?.recipeId||null,recipeMode:p.recipeMode||p.recipe?.recipeMode||'SINGLE_INPUT',
        recipeAuthority:p.recipeAuthority||p.recipe?.recipeAuthority||'INDUSTRIAL_CATALOG_RULE',
        capacity:inputCapacityFromFactory(p),capacityPerDay:inputCapacityFromFactory(p),locationNodeKey:p.targetLocationNodeKey,status:assetStatus,
        inputCoefficients:p.recipe.inputs,outputProfile:p.recipe.outputs,cycleDays:p.recipe.cycleDays,
        inputInventory:{},inputBatchLots:[],inputUnit:p.recipe?.inputUnit||factoryProfile.inputUnit||null,
        productionHealth:{status:'STOPPED',productivityPct:0,reason:'NO_FACTORY_INPUTS',missingInputs:Object.keys(p.recipe?.inputs||{}),updatedTurn:turn(),authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1'},
        outputUnit:p.recipe?.outputUnit||factoryProfile.outputUnit||null,
        requireTrackedInputs:p.recipeMode==='MULTI_INPUT'||factoryProfile.requireTrackedInputs===true,
        workforce:clone(factoryProfile.workforce||{}),employmentProfile:clone(factoryProfile.employment||p.employmentProfile||null),
        utilityRequirements:clone(factoryProfile.utilities||{}),
        requiredInfrastructure:clone(factoryProfile.requiredInfrastructure||[]),companyId:'EPC_FACTORY_OWNER',
        simulationOnly:true,authority:'SIMULATED_FACTORY_ASSET',transportAccess:['road','rail','ship'],commissionedTurn:turn(),
        requiredTechnologyIds:clone(p.requiredTechnologyIds||[])});
      emit('OMEGA_FACTORY_CAPACITY_CHANGED',cid,{factoryId:p.factoryId,capacity:inputCapacityFromFactory(p),projectId:p.projectId,status:assetStatus});
      if(assetStatus==='TECHNOLOGY_LOCKED')emit('OMEGA_FACTORY_TECHNOLOGY_BLOCKED',cid,{factoryId:p.factoryId,requiredTechnologyIds:clone(p.requiredTechnologyIds||[])});
    }else if(p.infrastructureType==='power'||p.infrastructureType==='water'){
      const ts=transportState(cid);ts.infrastructure=ts.infrastructure||{};
      const supply=ts.infrastructure.utilitySupply&&typeof ts.infrastructure.utilitySupply==='object'?ts.infrastructure.utilitySupply:
        (ts.infrastructure.utilitySupply={electricityMWhPerDay:0,waterM3PerDay:0,assets:[],authority:'SIMULATED_COMPLETED_UTILITY_PROJECTS',status:'AVAILABLE',simulationOnly:true});
      if(!Array.isArray(supply.assets))supply.assets=[];
      const amount=Math.max(0,num(p.capacityAddPerDay)||0);
      if(p.infrastructureType==='power')supply.electricityMWhPerDay=Number(((num(supply.electricityMWhPerDay)||0)+amount).toFixed(6));
      else supply.waterM3PerDay=Number(((num(supply.waterM3PerDay)||0)+amount).toFixed(6));
      supply.authority='SIMULATED_COMPLETED_UTILITY_PROJECTS';supply.status='AVAILABLE';supply.lastUpdatedTurn=turn();
      supply.assets.push({projectId:p.projectId,infrastructureType:p.infrastructureType,capacityPerDay:amount,capacityUnit:p.capacityUnit,
        completedTurn:turn(),status:'OPERATIONAL',authority:'SIMULATED_INFRASTRUCTURE_PROJECT',simulationOnly:true});
      while(supply.assets.length>512)supply.assets.shift();
      const key=p.infrastructureType==='power'?'powers':'waters';
      ts.infrastructure[key]=ts.infrastructure[key]||{capacityPerDay:0};
      ts.infrastructure[key].capacityPerDay=(num(ts.infrastructure[key].capacityPerDay)||0)+amount;
      ts.infrastructure[key].status='OPERATIONAL';ts.infrastructure[key].capacityUnit=p.capacityUnit;
      emit('OMEGA_INDUSTRIAL_UTILITY_SUPPLY_CHANGED',cid,{projectId:p.projectId,infrastructureType:p.infrastructureType,
        capacityPerDay:amount,capacityUnit:p.capacityUnit,supply:clone(supply),status:'AVAILABLE',simulationOnly:true});
    }else{
      const ts=transportState(cid),ir=infraRules()[p.infrastructureType]||{};ts.infrastructure=ts.infrastructure||{};
      const key=p.infrastructureType+'s';ts.infrastructure[key]=ts.infrastructure[key]||{};ts.infrastructure[key].capacityPerDay=(num(ts.infrastructure[key].capacityPerDay)||0)+(num(p.capacityAddPerDay)||0);
      if(p.infrastructureType==='bridge'){ts.infrastructure.bridges=ts.infrastructure.bridges||{};ts.infrastructure.bridges.capacityPerDay=(num(ts.infrastructure.bridges.capacityPerDay)||0)+(num(p.capacityAddPerDay)||0);}
      if(p.corridorId)n.infrastructure.corridors[p.corridorId]={status:'OPERATIONAL',fromNode:p.fromNode,toNode:p.toNode,capacityPerDay:p.capacityAddPerDay,infrastructureType:p.infrastructureType};
      emit('OMEGA_TRANSPORT_INFRASTRUCTURE_COMPLETED',cid,p);
    }
    emit('OMEGA_PROJECT_COMPLETED',cid,p);
  }
  const employment=reconcileFactoryEmployment(cid);
  return{status:'ADVANCED',countryId:cid,completed,technologyCompleted,employment};
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
    if(req.length&&req.every(t=>caps.some(row=>tok(row?.technologyId).toUpperCase()===t&&technologyCapabilityAvailable(row)))){
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

function currentTurnLedgerBucket(countryId,ledgerName,initialBucket){
  const network=netState(countryId);
  let ledger=network[ledgerName];
  if(!ledger||typeof ledger!=='object'||Array.isArray(ledger))ledger=network[ledgerName]={schemaVersion:VERSION,turns:{}};
  if(!ledger.turns||typeof ledger.turns!=='object'||Array.isArray(ledger.turns))ledger.turns={};
  const currentTurn=Math.max(0,Number(turn())||0),key=String(currentTurn);
  for(const oldKey of Object.keys(ledger.turns)){
    const oldTurn=Number(oldKey);
    if(Number.isFinite(oldTurn)&&oldTurn<currentTurn-30)delete ledger.turns[oldKey];
  }
  let bucket=ledger.turns[key];
  if(!bucket||typeof bucket!=='object'||Array.isArray(bucket)){
    // Avoid object-spread initialization here: the Android 9 WebView path can throw
    // from the transpiled spread helper while the utility ledger is first created.
    const defaults=clone(initialBucket||{});
    bucket=defaults&&typeof defaults==='object'&&!Array.isArray(defaults)?defaults:{};
    bucket.turn=currentTurn;
    ledger.turns[key]=bucket;
  }
  bucket.turn=currentTurn;
  return bucket;
}
function utilityTurnBucket(countryId){
  const bucket=currentTurnLedgerBucket(countryId,'utilityLedger',{used:{electricityMWh:0,waterM3:0},transactions:[]});
  bucket.used=bucket.used&&typeof bucket.used==='object'?bucket.used:{};
  bucket.used.electricityMWh=Math.max(0,num(bucket.used.electricityMWh)||0);
  bucket.used.waterM3=Math.max(0,num(bucket.used.waterM3)||0);
  bucket.transactions=Array.isArray(bucket.transactions)?bucket.transactions:[];
  return bucket;
}
function transportTurnBucket(countryId){
  const bucket=currentTurnLedgerBucket(countryId,'transportCapacityLedger',{usedByMode:{},shipments:[]});
  bucket.usedByMode=bucket.usedByMode&&typeof bucket.usedByMode==='object'?bucket.usedByMode:{};
  bucket.shipments=Array.isArray(bucket.shipments)?bucket.shipments:[];
  return bucket;
}
function technologyCapabilityAvailable(row){
  return ['COMPLETE','COMPLETED','AVAILABLE','UNLOCKED','OPERATIONAL','ACTIVE'].includes(String(row?.status||'').trim().toUpperCase());
}
function utilitySupplyValues(countryId){
  const infra=transportState(countryId).infrastructure||{};
  const supply=infra.utilitySupply&&typeof infra.utilitySupply==='object'?infra.utilitySupply:{};
  const power=supply.electricityMWhPerDay==null?null:num(supply.electricityMWhPerDay);
  const water=supply.waterM3PerDay==null?null:num(supply.waterM3PerDay);
  return{power:power!==null&&power>=0?power:null,water:water!==null&&water>=0?water:null,
    authority:supply.authority||null,status:supply.status||'NOT_RECORDED',assets:Array.isArray(supply.assets)?supply.assets:[]};
}
function previewFactoryUtilityUse(countryId,asset,productionQuantity){
  const cid=canonicalCountry(countryId),factoryId=String(asset?.id||asset?.assetId||asset?.factoryId||asset?.projectId||'');
  const type=normalizeFactoryType(asset?.factoryType||asset?.type||asset?.facilityType||'');
  const profile=(cat()?.factoryProfiles||{})[type]||{};
  const utilities=asset?.utilityRequirements&&typeof asset.utilityRequirements==='object'&&
    (asset.utilityRequirements.electricityMWhPerDay!=null||asset.utilityRequirements.waterM3PerDay!=null)
      ?asset.utilityRequirements:profile.utilities;
  const powerDaily=utilities?.electricityMWhPerDay==null?null:num(utilities.electricityMWhPerDay);
  const waterDaily=utilities?.waterM3PerDay==null?null:num(utilities.waterM3PerDay);
  if(powerDaily===null||waterDaily===null||powerDaily<0||waterDaily<0)
    return{status:'BLOCKED',reason:'FACTORY_UTILITY_PROFILE_NOT_RECORDED',countryId:cid,factoryId, factoryType:type};
  const capacityRaw=asset?.capacityPerDay??asset?.capacity??asset?.productionCapacity??asset?.throughput;
  const capacity=capacityRaw==null?null:num(capacityRaw);
  const quantity=num(productionQuantity);
  if(capacity===null||capacity<=0||quantity===null||quantity<=0)
    return{status:'BLOCKED',reason:'FACTORY_UTILITY_CAPACITY_INVALID',countryId:cid,factoryId,capacity,productionQuantity};
  const fraction=Math.min(1,quantity/capacity);
  const required={electricityMWh:Number((powerDaily*fraction).toFixed(6)),waterM3:Number((waterDaily*fraction).toFixed(6))};
  const supply=utilitySupplyValues(cid),bucket=utilityTurnBucket(cid);
  const used={electricityMWh:bucket.used.electricityMWh,waterM3:bucket.used.waterM3};
  const checks=[
    {key:'electricityMWh',label:'ELECTRICITY',supply:supply.power,unit:'MWh',required:required.electricityMWh,used:used.electricityMWh},
    {key:'waterM3',label:'INDUSTRIAL_WATER',supply:supply.water,unit:'M3',required:required.waterM3,used:used.waterM3}
  ];
  const missing=checks.filter(x=>x.required>1e-9&&x.supply===null);
  if(missing.length)return{status:'BLOCKED',reason:'FACTORY_UTILITY_SUPPLY_NOT_RECORDED',countryId:cid,factoryId,
    missingUtilities:missing.map(x=>x.label),required,used,supply:{electricityMWhPerDay:supply.power,waterM3PerDay:supply.water}};
  const shortages=checks.filter(x=>x.required>1e-9&&x.supply!==null&&x.supply-x.used+1e-9<x.required);
  if(shortages.length)return{status:'BLOCKED',reason:'FACTORY_UTILITY_SHORTAGE',countryId:cid,factoryId,
    shortages:shortages.map(x=>({utility:x.label,required:x.required,available:Math.max(0,x.supply-x.used),supply:x.supply,used:x.used,unit:x.unit})),
    required,used,supply:{electricityMWhPerDay:supply.power,waterM3PerDay:supply.water}};
  return{status:'READY',countryId:cid,factoryId,factoryType:type,turn:turn(),capacity,productionQuantity,
    utilizationFraction:fraction,required,used,supply:{electricityMWhPerDay:supply.power,waterM3PerDay:supply.water},
    supplyAuthority:supply.authority||'COMPLETED_UTILITY_PROJECTS_OR_EXPLICIT_GAME_STATE'};
}
function commitFactoryUtilityUse(countryId,asset,preview,transactionId){
  const cid=canonicalCountry(countryId),bucket=utilityTurnBucket(cid);
  bucket.used.electricityMWh=Number((bucket.used.electricityMWh+preview.required.electricityMWh).toFixed(6));
  bucket.used.waterM3=Number((bucket.used.waterM3+preview.required.waterM3).toFixed(6));
  const row={transactionId:String(transactionId),factoryId:String(asset?.id||asset?.assetId||asset?.factoryId||asset?.projectId||''),
    countryId:cid,turn:turn(),electricityMWh:preview.required.electricityMWh,waterM3:preview.required.waterM3,
    electricityUnit:'MWh',waterUnit:'M3',authority:'SIMULATED_UTILITY_CONSUMPTION_LEDGER',
    supplyAuthority:preview.supplyAuthority||'COMPLETED_UTILITY_PROJECTS_OR_EXPLICIT_GAME_STATE'};
  bucket.transactions.push(row);while(bucket.transactions.length>1024)bucket.transactions.shift();
  asset.lastUtilityConsumptionTurn=turn();asset.lastUtilityConsumptionTransactionId=String(transactionId);
  emit('OMEGA_FACTORY_UTILITY_CONSUMED',cid,row);
  return clone(row);
}
function previewTransportCapacity(countryId,route,requestedQuantity,quantityToCapacityFactor=1){
  const cid=canonicalCountry(countryId),quantity=num(requestedQuantity),factor=num(quantityToCapacityFactor);
  if(quantity===null||quantity<=0)return{status:'BLOCKED',reason:'TRANSPORT_QUANTITY_INVALID',requestedQuantity};
  if(factor===null||factor<=0)return{status:'BLOCKED',reason:'TRANSPORT_CAPACITY_UNIT_BRIDGE_INVALID',quantityToCapacityFactor};
  const legs=Array.isArray(route?.legs)?route.legs:(Array.isArray(route?.vehiclePlan)?route.vehiclePlan:[]);
  const modes=legs.map(row=>tok(row?.mode||row?.transportMode)).filter(Boolean);
  if(!modes.length)return{status:'BLOCKED',reason:'TRANSPORT_ROUTE_HAS_NO_LEGS',routeId:route?.routeId||null};
  const counts={};for(const mode of modes)counts[mode]=(counts[mode]||0)+1;
  const bucket=transportTurnBucket(cid),constraints=[];
  let allowedCapacityQuantity=quantity*factor;
  const days=Math.max(1,daysPerTurn());
  for(const [mode,count] of Object.entries(counts)){
    const infra=infraQuality(cid,mode),capacity=Math.max(0,infra.capacityPerDay*infra.quality*days);
    const used=Math.max(0,num(bucket.usedByMode[mode])||0),remaining=Math.max(0,capacity-used);
    const modeAllowed=count>0?remaining/count:0;allowedCapacityQuantity=Math.min(allowedCapacityQuantity,modeAllowed);
    constraints.push({mode,legs:count,capacityPerDay:infra.capacityPerDay,daysInTurn:days,capacityPerTurn:capacity,
      usedThisTurn:used,availableThisTurn:remaining,maximumCapacityQuantityForRoute:modeAllowed,
      unit:'RAW_CARGO_CAPACITY_UNITS_PER_TURN'});
  }
  allowedCapacityQuantity=Number(Math.max(0,allowedCapacityQuantity).toFixed(6));
  const allowedQuantity=Number((allowedCapacityQuantity/factor).toFixed(6));
  if(allowedQuantity<=1e-9)return{status:'BLOCKED',reason:'TRANSPORT_CAPACITY_EXHAUSTED',countryId:cid,turn:turn(),
    routeId:route?.routeId||null,requestedQuantity:quantity,allowedQuantity:0,allowedCapacityQuantity:0,constraints};
  return{status:'READY',countryId:cid,turn:turn(),routeId:route?.routeId||null,requestedQuantity:quantity,
    requestedCapacityQuantity:Number((quantity*factor).toFixed(6)),allowedQuantity,allowedCapacityQuantity,
    adjusted:allowedQuantity+1e-6<quantity,constraints,capacityQuantityFactor:factor,
    authority:'SIMULATED_SHARED_TRANSPORT_CAPACITY_LEDGER'};
}
function commitTransportCapacity(countryId,route,quantity,shipmentId,quantityToCapacityFactor=1){
  const cid=canonicalCountry(countryId),bucket=transportTurnBucket(cid),factor=Math.max(1e-12,num(quantityToCapacityFactor)||1);
  const legs=Array.isArray(route?.legs)?route.legs:(Array.isArray(route?.vehiclePlan)?route.vehiclePlan:[]);
  const counts={};for(const row of legs){const mode=tok(row?.mode||row?.transportMode);if(mode)counts[mode]=(counts[mode]||0)+1;}
  const capacityQuantity=Math.max(0,quantity)*factor;
  for(const [mode,count] of Object.entries(counts))
    bucket.usedByMode[mode]=Number(((num(bucket.usedByMode[mode])||0)+capacityQuantity*count).toFixed(6));
  const row={shipmentId:String(shipmentId),countryId:cid,turn:turn(),quantity,capacityQuantity,quantityToCapacityFactor:factor,
    useByMode:Object.fromEntries(Object.entries(counts).map(([mode,count])=>[mode,Number((capacityQuantity*count).toFixed(6))])),
    authority:'SIMULATED_SHARED_TRANSPORT_CAPACITY_LEDGER'};
  bucket.shipments.push(row);while(bucket.shipments.length>1024)bucket.shipments.shift();
  return clone(row);
}
function factoryUtilityDiagnostics(countryId){
  const cid=canonicalCountry(countryId);if(!cid)return{status:'BLOCKED',reason:'FACTORY_UTILITY_COUNTRY_INVALID'};
  const supply=utilitySupplyValues(cid),bucket=utilityTurnBucket(cid),transport=transportTurnBucket(cid);
  const utility=(value,used,unit)=>({supply:value,usedThisTurn:used,availableThisTurn:value===null?null:Math.max(0,value-used),unit,
    status:value===null?'NOT_RECORDED':(value-used<=1e-9?'DEPLETED_THIS_TURN':'AVAILABLE'),
    authority:supply.authority||'COMPLETED_UTILITY_PROJECTS_OR_EXPLICIT_GAME_STATE',simulationOnly:true});
  const transportCapacity={};
  for(const mode of ['truck','rail','ship','barge','pipeline']){
    const q=infraQuality(cid,mode),capacity=Math.max(0,q.capacityPerDay*q.quality),used=Math.max(0,num(transport.usedByMode[mode])||0);
    transportCapacity[mode]={capacityPerTurn:capacity,usedThisTurn:used,availableThisTurn:Math.max(0,capacity-used),
      unit:'SIMULATION_RESOURCE_UNITS_PER_TURN',quality:q.quality,authority:'SIMULATED_INFRASTRUCTURE_MODEL'};
  }
  const employment=econState(cid).factoryEmployment||null;
  return{status:supply.power===null||supply.water===null?'DEGRADED':'HEALTHY',countryId:cid,turn:turn(),
    electricityMWhPerDay:supply.power,electricity:utility(supply.power,bucket.used.electricityMWh,'MWh/day'),
    waterM3PerDay:supply.water,water:utility(supply.water,bucket.used.waterM3,'m3/day'),
    utilityAuthority:supply.authority||'NOT_RECORDED',utilityAssets:clone(supply.assets),
    transportCapacity,transportShipmentsThisTurn:transport.shipments.length,
    workforce:employment?{status:employment.status,unemployedCount:employment.unemployedCount,
      jobsSupported:employment.jobsSupported,jobsFilled:employment.jobsFilled,vacancies:employment.vacancies,
      authority:employment.authority||'NOT_RECORDED'}:{status:'NOT_RECORDED',authority:'NOT_RECORDED'},
    simulationOnly:true};
}

function factoryOperationGate(countryId,asset){
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const cid=canonicalCountry(countryId),factoryId=String(asset.id||asset.assetId||asset.factoryId||asset.projectId||'');
  const status=String(asset.status||'OPERATIONAL').toUpperCase();
  if(['CLOSED','DECOMMISSIONED','TECHNOLOGY_LOCKED','BLOCKED','UNDER_CONSTRUCTION','MAINTENANCE'].includes(status))
    return{status:'BLOCKED',reason:'FACTORY_NOT_OPERATIONAL',factoryId,factoryStatus:status};
  const required=Array.isArray(asset.requiredTechnologyIds)?asset.requiredTechnologyIds.map(x=>String(x).toUpperCase()):[];
  const capabilities=Array.isArray(resourceState(cid).technologyCapabilities)?resourceState(cid).technologyCapabilities:[];
  const missing=required.filter(id=>!capabilities.some(row=>String(row?.technologyId||'').trim().toUpperCase()===id&&technologyCapabilityAvailable(row)));
  if(missing.length)return{status:'BLOCKED',reason:'FACTORY_TECHNOLOGY_REQUIREMENT_NOT_MET',factoryId,missingTechnologyIds:missing};
  const employmentSummary=reconcileFactoryEmployment(cid);
  const employmentModel=econState(cid).factoryEmployment||{};
  const employment=employmentModel.factories?.[factoryId]||asset.employment||{};
  if(employmentSummary?.baselineUnemployedCount==null||employmentModel.status==='UNEMPLOYMENT_HEADCOUNT_UNAVAILABLE')
    return{status:'BLOCKED',reason:'FACTORY_WORKFORCE_NOT_RECORDED',factoryId,
      requiredWorkers:num((cat()?.factoryProfiles||{})[normalizeFactoryType(asset.factoryType||asset.type||'')]?.employment?.coreOperatingCrew)||null,
      authority:employmentModel.unemploymentSource||'NOT_RECORDED'};
  const profile=(cat()?.factoryProfiles||{})[normalizeFactoryType(asset.factoryType||asset.type||asset.facilityType||'')]||{};
  const requiredCrew=Math.max(1,num(profile.employment?.coreOperatingCrew)||
    ((num(profile.workforce?.operators)||0)+(num(profile.workforce?.engineers)||0))||
    (num(asset.workforce?.operators)||0)+(num(asset.workforce?.engineers)||0));
  const workersFilled=num(employment.jobsFilled);
  if(workersFilled===null)return{status:'BLOCKED',reason:'FACTORY_WORKFORCE_NOT_RECORDED',factoryId,requiredWorkers:requiredCrew};
  if(workersFilled<requiredCrew)return{status:'BLOCKED',reason:'FACTORY_WORKFORCE_SHORTAGE',factoryId,
    requiredWorkers:requiredCrew,workersAvailable:workersFilled,vacancies:num(employment.vacancies)??Math.max(0,requiredCrew-workersFilled)};
  return{status:'READY',factoryId,factoryStatus:status,requiredWorkers:requiredCrew,workersAvailable:workersFilled,
    workforceAuthority:employment.authority||employmentModel.authority||'SIMULATED_FACTORY_EMPLOYMENT_RECONCILIATION'};
}
function commitFactoryCycleImmediately(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||''),assets=factoryAssets(cid),asset=assets.find(a=>String(a?.id||a?.assetId||a?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const gate=factoryOperationGate(cid,asset);
  if(gate.status!=='READY')return gate;
  const requestedRecipe=recipeFor(input.resourceId||Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId,asset);
  if(asset.recipeMode==='MULTI_INPUT'||requestedRecipe.recipeMode==='MULTI_INPUT'||Object.keys(requestedRecipe.inputs||{}).length>1)
    return commitMultiInputFactoryCycleImmediately(input);
  const n=netState(cid),processedTurns=n.factoryProcessingTurns&&typeof n.factoryProcessingTurns==='object'?n.factoryProcessingTurns:(n.factoryProcessingTurns={});
  if(Number(processedTurns[fid])===turn())return{status:'BLOCKED',reason:'FACTORY_TURN_CAPACITY_ALREADY_USED',factoryId:fid,turn:turn()};
  const rid=tok(input.resourceId),recipe=recipeFor(rid,asset),r=resourceState(cid);r.inventory=r.inventory||{};
  const factoryStock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const factoryAvailable=Math.max(0,num(factoryStock[rid])||0),countryAvailable=Math.max(0,num(r.inventory[rid])||0);
  const inputCoefficient=Math.max(1e-9,num(recipe.inputs[rid])||1);
  const cycleCapacity=Math.max(0,num(input.maxCycleQuantity)||num(asset.capacityPerDay??asset.capacity??asset.productionCapacity??asset.throughput)||0);
  const requestedLimit=Math.min(Math.max(0,num(input.quantity)||cycleCapacity),cycleCapacity||Number.MAX_SAFE_INTEGER);
  const availableInputStock=factoryAvailable>1e-9?factoryAvailable:countryAvailable;
  const requested=Math.min(requestedLimit,availableInputStock/inputCoefficient);
  const need=requested*inputCoefficient;
  if(!(requested>1e-9))return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',required:need,available:availableInputStock,source:factoryAvailable>1e-9?'FACTORY_INPUT_INVENTORY':'COUNTRY_INVENTORY'};
  const fromFactoryInput=factoryAvailable>1e-9&&factoryAvailable+1e-9>=need,available=fromFactoryInput?factoryAvailable:countryAvailable;
  if(available+1e-9<need)return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',required:need,available,source:fromFactoryInput?'FACTORY_INPUT_INVENTORY':'COUNTRY_INVENTORY'};
  const inputLots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:[];
  const trackedForResource=inputLots.filter(x=>tok(x?.resourceId||x?.materialIdentity)===rid&&Math.max(0,num(x?.remainingQuantity!=null?x.remainingQuantity:x?.quantity)||0)>1e-9&&(!input.factoryCycleId||String(x?.cycleReservationId||'')===String(input.factoryCycleId)));
  const trackedQuantity=trackedForResource.reduce((sum,x)=>sum+Math.max(0,num(x.remainingQuantity!=null?x.remainingQuantity:x.quantity)||0),0);
  if(fromFactoryInput&&trackedForResource.length&&trackedQuantity+1e-9<need)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',required:need,trackedInputQuantity:trackedQuantity,factoryInputInventory:factoryAvailable};
  const carbonPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const carbonUnit=trackedForResource.find(x=>x?.unit)?.unit||
    (Array.isArray(r.batches)?r.batches.find(x=>tok(x?.resourceId||x?.materialIdentity)===rid&&x?.unit)?.unit:null)||
    (Array.isArray(g.ResourceMinistryEngine?.resourceTypes)?g.ResourceMinistryEngine.resourceTypes.find(x=>tok(x?.id||x?.resourceId)===rid)?.unit:null);
  const utilityPreview=input.prepaidUtilityConsumption?{status:'READY',required:{electricityMWh:0,waterM3:0},prepaid:true}:previewFactoryUtilityUse(cid,asset,requested);
  if(utilityPreview.status!=='READY')return utilityPreview;
  const carbonGate=carbonPolicy?.previewCarbonActivity?.(cid,rid,need,carbonUnit,'RESOURCE_PROCESSING',null,{
    activityId:'FACTORYRUN:'+cid+':'+fid+':T'+turn(),factoryId:fid,
    siteId:trackedForResource.find(x=>x?.siteId)?.siteId||null,
    sourceId:trackedForResource.find(x=>x?.batchId)?.batchId||fid
  });
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
        const roots=Array.isArray(lot.sourceBatchIds)&&lot.sourceBatchIds.length?lot.sourceBatchIds:(String(lot?.authority||lot?.provenance?.authority||'').includes('UNOBSERVED')||String(lot?.batchId||'').startsWith('CYCLE-LEGACY:')?[]:[lot.batchId]);
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
  record.utilityConsumption=input.prepaidUtilityConsumption?clone(input.prepaidUtilityConsumption):commitFactoryUtilityUse(cid,asset,utilityPreview,transactionId);
  asset.lastProductionTurn=turn();asset.lastProductionTransactionId=transactionId;
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
function commitMultiInputFactoryCycleImmediately(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'');
  const asset=factoryAssets(cid).find(a=>String(a?.id||a?.assetId||a?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const fallbackResource=Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId||'';
  const requestedResource=tok(input.resourceId||fallbackResource);
  const recipe=recipeFor(requestedResource,asset),entries=Object.entries(recipe.inputs||{}).map(([id,coefficient])=>[tok(id),num(coefficient)]);
  if(entries.length<2)return{status:'BLOCKED',reason:'MULTI_INPUT_RECIPE_REQUIRED',factoryId:fid,recipeId:recipe.recipeId||null};
  if(!entries.some(([id])=>id===requestedResource))return{status:'BLOCKED',reason:'FACTORY_INPUT_NOT_IN_RECIPE',resourceId:requestedResource,recipeId:recipe.recipeId||null};
  if(entries.some(([id,coefficient])=>!id||coefficient===null||coefficient<=0))
    return{status:'BLOCKED',reason:'FACTORY_RECIPE_COEFFICIENT_INVALID',recipeId:recipe.recipeId||null};
  const n=netState(cid),processedTurns=n.factoryProcessingTurns&&typeof n.factoryProcessingTurns==='object'?n.factoryProcessingTurns:(n.factoryProcessingTurns={});
  if(Number(processedTurns[fid])===turn())return{status:'BLOCKED',reason:'FACTORY_TURN_CAPACITY_ALREADY_USED',factoryId:fid,turn:turn()};
  const capacity=Math.max(0,num(input.maxCycleQuantity)||num(asset.capacityPerDay??asset.capacity??asset.productionCapacity??asset.throughput)||0);
  if(!(capacity>1e-9))return{status:'BLOCKED',reason:'PRODUCTION_CAPACITY_UNAVAILABLE',factoryId:fid,capacity};
  const inputLimit=Math.max(0,num(input.quantity)||capacity),limit=Math.min(capacity,inputLimit);
  const factoryStock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const lots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:[];
  const inactiveLotStatuses=new Set(['CONSUMED','SOLD','TRANSFERRED_OUT','EXHAUSTED','IN_TRANSIT','RESERVED','DECOMMISSIONED']);
  const activeSourceLots=lots.filter(l=>{
    const status=String(l?.status||'').toUpperCase();
    return Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0)>1e-9&&!inactiveLotStatuses.has(status);
  });
  const globalBatchIds=activeSourceLots.map(l=>String(l?.batchId||'').trim()).filter(Boolean);
  if(new Set(globalBatchIds).size!==globalBatchIds.length)
    return{status:'BLOCKED',reason:'DUPLICATE_FACTORY_INPUT_BATCH_ID',factoryId:fid,recipeId:recipe.recipeId||null};
  const availability=[];
  const seenRecipeInputs=new Set();
  for(const [resourceId,coefficient] of entries){
    if(seenRecipeInputs.has(resourceId))
      return{status:'BLOCKED',reason:'FACTORY_DUPLICATE_NORMALIZED_INPUT',factoryId:fid,resourceId,recipeId:recipe.recipeId||null};
    seenRecipeInputs.add(resourceId);
    const matchingStockKeys=Object.keys(factoryStock).filter(key=>tok(key)===resourceId);
    if(matchingStockKeys.length>1)
      return{status:'BLOCKED',reason:'DUPLICATE_NORMALIZED_FACTORY_STOCK_KEYS',factoryId:fid,resourceId,keys:matchingStockKeys};
    const stockKey=matchingStockKeys[0]||resourceId;
    const quantity=Math.max(0,num(factoryStock[stockKey])||0);
    const eligibleLots=lots.filter(l=>{
      const status=String(l?.status||'').toUpperCase();
      const remaining=Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0);
      return tok(l?.resourceId||l?.materialIdentity)===resourceId&&String(l?.batchId||'').trim()!==''&&
        remaining>1e-9&&!inactiveLotStatuses.has(status)&&(!input.factoryCycleId||String(l?.cycleReservationId||'')===String(input.factoryCycleId));
    });
    const batchIds=eligibleLots.map(l=>String(l?.batchId||'').trim()).filter(Boolean);
    if(new Set(batchIds).size!==batchIds.length)
      return{status:'BLOCKED',reason:'DUPLICATE_FACTORY_INPUT_BATCH_ID',factoryId:fid,resourceId};
    const lotQuantity=eligibleLots.reduce((sum,l)=>sum+Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0),0);
    availability.push({resourceId,coefficient,stockKey,eligibleLots,available:quantity,tracked:lotQuantity,possibleProduction:quantity/coefficient});
  }
  const productionQuantity=Math.min(limit,...availability.map(x=>x.possibleProduction));
  if(!(productionQuantity>1e-9)){
    const missing=availability.filter(x=>x.available+1e-9<x.coefficient*Math.min(limit,1));
    return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',factoryId:fid,recipeId:recipe.recipeId||null,
      requiredForOneUnit:availability.map(x=>({resourceId:x.resourceId,required:x.coefficient,available:x.available})),missingInputs:missing.map(x=>x.resourceId)};
  }
  const needs=availability.map(x=>({...x,required:productionQuantity*x.coefficient}));
  const mismatches=needs.filter(x=>x.tracked+1e-6<x.required);
  if(mismatches.length)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',factoryId:fid,recipeId:recipe.recipeId||null,
    mismatches:mismatches.map(x=>({resourceId:x.resourceId,required:x.required,tracked:x.tracked,available:x.available}))};
  for(const need of needs){
    let remaining=need.required;
    need.lotAllocations=[];
    const ordered=need.eligibleLots.slice().sort((a,b)=>(Number(a.createdTurn)||0)-(Number(b.createdTurn)||0));
    for(const lot of ordered){
      if(remaining<=1e-9)break;
      const prior=Math.max(0,num(lot?.remainingQuantity!=null?lot.remainingQuantity:lot?.quantity)||0);
      const take=Math.min(prior,remaining);
      if(take>1e-9){need.lotAllocations.push({lot,quantity:take});remaining-=take;}
    }
    if(remaining>1e-6)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',factoryId:fid,resourceId:need.resourceId,
      required:need.required,tracked:need.tracked,unallocated:remaining};
  }
  const outputEntries=Object.entries(recipe.outputs||{}).map(([outputId,ratio])=>({outputId,token:tok(outputId),ratio:num(ratio)}));
  if(!outputEntries.length||outputEntries.some(x=>!x.token||x.ratio===null||x.ratio<=0)||
    new Set(outputEntries.map(x=>x.token)).size!==outputEntries.length)
    return{status:'BLOCKED',reason:'FACTORY_OUTPUT_PROFILE_INVALID',factoryId:fid,recipeId:recipe.recipeId||null};
  const outputTotal=outputEntries.reduce((sum,row)=>sum+row.ratio,0);
  if(!Number.isFinite(outputTotal)||Math.abs(outputTotal-1)>1e-6)
    return{status:'BLOCKED',reason:'FACTORY_OUTPUT_BALANCE_INVALID',factoryId:fid,recipeId:recipe.recipeId||null,outputCoefficientTotal:outputTotal};
  const output={};
  for(const row of outputEntries){
    const quantity=Number((productionQuantity*row.ratio).toFixed(6));
    if(quantity>1e-9)output[row.outputId]=quantity;
  }
  if(!Object.keys(output).length)
    return{status:'BLOCKED',reason:'FACTORY_OUTPUT_ROUNDED_TO_ZERO',factoryId:fid,recipeId:recipe.recipeId||null};
  const utilityPreview=input.prepaidUtilityConsumption?{status:'READY',required:{electricityMWh:0,waterM3:0},prepaid:true}:previewFactoryUtilityUse(cid,asset,productionQuantity);
  if(utilityPreview.status!=='READY')return utilityPreview;
  const r=resourceState(cid);
  r.inventory=r.inventory&&typeof r.inventory==='object'?r.inventory:{};
  const finishedMap=r.processedWarehouse?.availableByResource||{};
  const outputInventoryKeys={},outputWarehouseKeys={};
  for(const row of outputEntries){
    const invKeys=Object.keys(r.inventory).filter(key=>tok(key)===row.token);
    const warehouseKeys=Object.keys(finishedMap).filter(key=>tok(key)===row.token);
    if(invKeys.length>1||warehouseKeys.length>1)
      return{status:'BLOCKED',reason:'DUPLICATE_NORMALIZED_OUTPUT_LEDGER_KEYS',factoryId:fid,resourceId:row.outputId,
        inventoryKeys:invKeys,warehouseKeys};
    outputInventoryKeys[row.outputId]=invKeys[0]||row.outputId;
    outputWarehouseKeys[row.outputId]=warehouseKeys[0]||row.outputId;
  }
  const policy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  for(const need of needs){
    const first=lots.find(l=>tok(l?.resourceId||l?.materialIdentity)===need.resourceId&&Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0)>1e-9);
    const unit=first?.unit||recipe.inputUnit||asset.inputUnit||'SIMULATION_TONNE_EQUIVALENT';
    const gate=policy?.previewCarbonActivity?.(cid,need.resourceId,need.required,unit,'RESOURCE_PROCESSING',null,{
      activityId:'FACTORYRUN:'+cid+':'+fid+':T'+turn()+':'+need.resourceId,factoryId:fid,
      siteId:first?.siteId||null,sourceId:first?.batchId||fid
    });
    if(gate&&gate.allowed===false)return{status:'BLOCKED',reason:gate.reason||'CARBON_QUOTA_POLICY_BLOCKED_PROCESSING',resourceId:need.resourceId,carbonGate:gate};
  }
  const sourceBatchIds=[],sourceSiteIds=[],consumedInputs=[];
  for(const need of needs){
    factoryStock[need.stockKey]=Math.max(0,need.available-need.required);
    for(const allocation of need.lotAllocations){
      const lot=allocation.lot,take=allocation.quantity;
      const prior=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0);
      lot.remainingQuantity=Math.max(0,prior-take);lot.status=lot.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';
      lot.lastMovementType='MULTI_INPUT_PROCESSING_CONSUMPTION';lot.lastMovementTurn=turn();
      const lineage=Array.isArray(lot.sourceBatchIds)&&lot.sourceBatchIds.length?lot.sourceBatchIds:[lot.batchId].filter(Boolean);
      if(lot.batchId&&!String(lot?.authority||lot?.provenance?.authority||'').includes('UNOBSERVED')&&!String(lot.batchId).startsWith('CYCLE-LEGACY:'))sourceBatchIds.push(String(lot.batchId));
      lineage.filter(Boolean).forEach(x=>sourceBatchIds.push(String(x)));
      (Array.isArray(lot.sourceSiteIds)?lot.sourceSiteIds:[]).filter(Boolean).forEach(x=>sourceSiteIds.push(String(x)));
      consumedInputs.push({batchId:lot.batchId||null,resourceId:need.resourceId,quantity:take,
        sourceBatchIds:lineage.filter(Boolean).map(String),stage:'FACTORY_INPUT'});
    }
  }
  const sequence=Math.max(0,Number(n.factoryRunSequence)||0)+1;n.factoryRunSequence=sequence;
  const transactionId='FACTORYRUN:'+cid+':'+fid+':T'+turn()+':'+sequence;
  const finished=r.processedWarehouse||(r.processedWarehouse={warehouseId:'WH-'+cid+'-PROCESSED',countryId:cid,
    type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',status:'OPERATIONAL',
    availableByResource:{},storedBatchIds:[],receipts:[]});
  finished.availableByResource=finished.availableByResource||{};
  finished.storedBatchIds=Array.isArray(finished.storedBatchIds)?finished.storedBatchIds:[];
  finished.receipts=Array.isArray(finished.receipts)?finished.receipts:[];
  const batches=Array.isArray(r.batches)?r.batches:(r.batches=[]);
  const inventoryLots=r.inventoryLots&&typeof r.inventoryLots==='object'?r.inventoryLots:(r.inventoryLots={});
  const roots=[...new Set(sourceBatchIds.filter(Boolean))],sites=[...new Set(sourceSiteIds.filter(Boolean))],created=[];
  const companyId=String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid));
  const outputUnit=recipe.outputUnit||asset.outputUnit||'SIMULATION_TONNE_EQUIVALENT';
  for(const [outputId,outQty] of Object.entries(output)){
    if(!(outQty>1e-9))continue;
    const inventoryKey=outputInventoryKeys[outputId]||outputId;
    r.inventory[inventoryKey]=(num(r.inventory[inventoryKey])||0)+outQty;
    const batchId='OUTPUT:'+transactionId+':'+outputId;
    const row={batchId,resourceId:outputId,materialIdentity:outputId,quantity:outQty,remainingQuantity:outQty,unit:outputUnit,
      stage:'FINISHED',countryId:cid,sourceCountryId:cid,originCountryId:cid,ownerCountryCode:cid,destinationCountryId:cid,
      ownerCompanyId:companyId,sourceBatchIds:roots,sourceSiteIds:sites,sourceFactoryId:fid,warehouseId:'WH-'+cid+'-PROCESSED',
      locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',processId:transactionId,
      provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:'SIMULATED_DOWNSTREAM_RECIPE',status:'FINISHED_GOODS_CREATED',
        transactionId,recipeId:recipe.recipeId||null,factoryType:asset.factoryType,sourceBatchIds:roots,sourceSiteIds:sites,simulationTurn:turn()}};
    batches.push(row);created.push(row);
    inventoryLots[batchId]={batchId,resourceId:outputId,quantity:outQty,remainingQuantity:outQty,unit:outputUnit,stage:'FINISHED',
      countryId:cid,warehouseId:row.warehouseId,locationNodeKey:row.locationNodeKey,ownerCompanyId:companyId,
      sourceBatchIds:roots,sourceSiteIds:sites,status:'AVAILABLE',provenance:clone(row.provenance),createdTurn:turn()};
    const warehouseKey=outputWarehouseKeys[outputId]||outputId;
    finished.availableByResource[warehouseKey]=(num(finished.availableByResource[warehouseKey])||0)+outQty;
    if(!finished.storedBatchIds.includes(batchId))finished.storedBatchIds.push(batchId);
    finished.receipts.push({receiptId:'WH-REC-'+batchId,warehouseId:row.warehouseId,countryId:cid,batchId,resourceId:outputId,
      quantity:outQty,unit:outputUnit,simulationTurn:turn(),status:'RECEIVED'});
  }
  while(finished.receipts.length>2048)finished.receipts.shift();
  while(batches.length>8192)batches.shift();
  const inputQuantities=Object.fromEntries(needs.map(x=>[x.resourceId,x.required]));
  const totalInput=needs.reduce((sum,x)=>sum+x.required,0);
  const record={transactionId,countryId:cid,factoryId:fid,factoryType:asset.factoryType||recipe.factoryType||null,
    recipeId:recipe.recipeId||asset.recipeId||null,recipeMode:'MULTI_INPUT',companyId,resourceId:requestedResource,
    inputQuantity:totalInput,inputQuantities,requestedProduction:productionQuantity,outputs:clone(output),outputQuantities:clone(output),
    recipe:clone(recipe),cycleDays:recipe.cycleDays,turn:turn(),authority:'SIMULATED_DOWNSTREAM_PRODUCTION',status:'COMPLETED',
    inputSource:'TRACKED_FACTORY_INPUT',inputTrackingStatus:'TRACKED_FACTORY_INPUT_LOTS',
    consumedInputs:clone(consumedInputs),sourceBatchIds:roots,sourceSiteIds:sites,createdBatchIds:created.map(x=>x.batchId)};
  record.utilityConsumption=input.prepaidUtilityConsumption?clone(input.prepaidUtilityConsumption):commitFactoryUtilityUse(cid,asset,utilityPreview,transactionId);
  asset.inputInventory=factoryStock;asset.lastProductionTurn=turn();asset.lastProductionTransactionId=transactionId;
  r.batches=batches;r.inventoryLots=inventoryLots;r.processedWarehouse=finished;
  processedTurns[fid]=turn();n.factoryProcessingTurns=processedTurns;
  r.finishedGoodsLedger=Array.isArray(r.finishedGoodsLedger)?r.finishedGoodsLedger:[];
  r.finishedGoodsLedger.push({transactionId,countryId:cid,factoryId:fid,companyId,sourceBatchIds:roots,sourceSiteIds:sites,
    outputQuantities:clone(output),createdBatchIds:record.createdBatchIds,turn:turn(),authority:'SIMULATED_DOWNSTREAM_PRODUCTION',
    recipeId:record.recipeId,status:'AVAILABLE_TO_ECONOMY'});
  while(r.finishedGoodsLedger.length>2048)r.finishedGoodsLedger.shift();
  r.inventoryLedger=Array.isArray(r.inventoryLedger)?r.inventoryLedger:[];
  r.inventoryLedger.push({type:'FACTORY_MULTI_INPUT_PROCESSING_COMMITTED',transactionId,factoryId:fid,recipeId:record.recipeId,
    inputQuantities:clone(inputQuantities),outputs:clone(output),sourceBatchIds:roots,createdBatchIds:record.createdBatchIds,turn:turn()});
  while(r.inventoryLedger.length>2048)r.inventoryLedger.shift();
  n.factoryRuntime=n.factoryRuntime||{};n.factoryRuntime[fid]=record;
  n.events=Array.isArray(n.events)?n.events:[];n.events.push(record);n.events=n.events.slice(-MAX_EVENTS);
  emit('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',cid,record);
  emit('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',cid,{transactionId,countryId:cid,factoryId:fid,companyId,outputs:clone(output),
    outputQuantities:clone(output),sourceBatchIds:roots,sourceSiteIds:sites,createdBatchIds:record.createdBatchIds,turn:turn(),
    authority:'SIMULATED_DOWNSTREAM_PRODUCTION',status:'AVAILABLE'});
  return record;
}


/**
 * Stable public entry point for delivery completion and per-turn production.
 * Keep external callers independent of the internal immediate-commit method name.
 */
function executeFactoryCycle(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'');
  const active=factoryCycleStore(cid).factoryProductionCycles[fid];
  if(factoryCycleActive(active)&&String(input.factoryCycleId||'')!==String(active.cycleId))
    return{status:'BLOCKED',reason:'FACTORY_CYCLE_ALREADY_RUNNING',factoryId:fid,activeCycleId:active.cycleId,
      finishDate:active.finishDate};
  return commitFactoryCycleImmediately(input);
}

function factoryCycleStore(countryId){
  const n=netState(countryId);
  if(!n.factoryProductionCycles||typeof n.factoryProductionCycles!=='object'||Array.isArray(n.factoryProductionCycles))
    n.factoryProductionCycles={};
  if(!Array.isArray(n.factoryProductionCycleHistory))n.factoryProductionCycleHistory=[];
  return n;
}
function factoryCycleActive(cycle){
  return !!cycle&&['IN_PROGRESS','PAUSED'].includes(String(cycle.status||'').toUpperCase());
}
function factorySetProductionHealth(asset,status,quantity,capacity,detail={}){
  const cap=Math.max(0,num(capacity)||0),q=Math.max(0,num(quantity)||0);
  const pct=cap>0?Math.max(0,Math.min(100,Number((q/cap*100).toFixed(2)))):0;
  asset.productionHealth={status,productivityPct:pct,productionUnitsPerCycle:q,capacityPerDay:cap,
    missingInputs:Array.isArray(detail.missingInputs)?detail.missingInputs:[],
    reason:detail.reason||null,detail:clone(detail),updatedTurn:turn(),
    cycleId:detail.cycleId||null,authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1'};
  asset.productionStatus=status;
  return asset.productionHealth;
}
function factoryProductionMetrics(asset,recipe,factoryCycleId=null){
  const cap=Math.max(0,num(asset?.capacityPerDay??asset?.capacity??asset?.productionCapacity??asset?.throughput)||0);
  const stock=asset?.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const lots=Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[];
  const inactive=new Set(['CONSUMED','SOLD','TRANSFERRED_OUT','EXHAUSTED','IN_TRANSIT','RESERVED','DECOMMISSIONED']);
  const inputs=[],missing=[];
  let possible=cap;
  for(const [rawId,rawCoefficient] of Object.entries(recipe?.inputs||{})){
    const rid=tok(rawId),coefficient=num(rawCoefficient),stockKey=quantityObjectKey(stock,rid);
    const quantity=stockKey===null?0:Math.max(0,num(stock[stockKey])||0);
    const eligible=lots.filter(lot=>tok(lot?.resourceId||lot?.materialIdentity)===rid&&
      !inactive.has(String(lot?.status||'').toUpperCase())&&
      (!lot?.cycleReservationId||String(lot.cycleReservationId)===String(factoryCycleId||''))&&
      Math.max(0,num(lot?.remainingQuantity!=null?lot.remainingQuantity:lot?.quantity)||0)>1e-9);
    const tracked=eligible.reduce((sum,lot)=>sum+Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0),0);
    const ids=eligible.map(lot=>String(lot.batchId||'').trim()).filter(Boolean);
    const duplicateBatchIds=new Set(ids).size!==ids.length;
    const requiredPerUnit=coefficient!==null&&coefficient>0?coefficient:null;
    if(!rid||requiredPerUnit===null||duplicateBatchIds){
      missing.push({resourceId:rid||rawId,reason:duplicateBatchIds?'DUPLICATE_FACTORY_INPUT_BATCH_ID':'INVALID_RECIPE_COEFFICIENT'});
      inputs.push({resourceId:rid,coefficient,available:quantity,tracked,possibleProduction:0,eligibleLots:eligible});
      possible=0;continue;
    }
    const byStock=quantity/requiredPerUnit,byTrace=tracked/requiredPerUnit;
    possible=Math.min(possible,byStock,byTrace);
    if(quantity<=1e-9)missing.push({resourceId:rid,requiredPerProductionUnit:requiredPerUnit,available:0,reason:'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY'});
    else if(tracked<=1e-9)missing.push({resourceId:rid,requiredTrackedQuantity:quantity,tracked,reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'});
    inputs.push({resourceId:rid,coefficient:requiredPerUnit,stockKey,available:quantity,tracked,possibleProduction:Math.min(byStock,byTrace),eligibleLots:eligible});
  }
  return{capacity:cap,possibleProduction:Math.max(0,Math.min(cap,possible)),inputs,missingInputs:missing,
    recipeInputCount:Object.keys(recipe?.inputs||{}).length};
}
function reserveFactoryCycleInputs(asset,metrics,inputQuantities,cycleId){
  const lots=Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[];
  const reservations=[];
  for(const row of metrics.inputs||[]){
    let remaining=Math.max(0,num(inputQuantities[row.resourceId])||0);
    const candidates=(row.eligibleLots||[]).slice().sort((a,b)=>(Number(a.createdTurn)||0)-(Number(b.createdTurn)||0));
    for(const lot of candidates){
      if(remaining<=1e-9)break;
      const existing=String(lot?.cycleReservationId||'');
      if(existing&&existing!==String(cycleId))continue;
      const available=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0);
      const take=Math.min(available,remaining);
      if(take>1e-9){
        reservations.push({resourceId:row.resourceId,batchId:String(lot.batchId||''),quantity:Number(take.toFixed(6)),
          sourceBatchIds:(Array.isArray(lot.sourceBatchIds)&&lot.sourceBatchIds.length?lot.sourceBatchIds:[lot.batchId]).filter(Boolean).map(String),lot});
        remaining=Number(Math.max(0,remaining-take).toFixed(6));
      }
    }
    if(remaining>1e-6)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_RESERVATION_FAILED',
      resourceId:row.resourceId,required:inputQuantities[row.resourceId],unreserved:remaining};
  }
  const seen=new Set();
  for(const reservation of reservations){
    if(!reservation.batchId||seen.has(reservation.batchId))
      return{status:'BLOCKED',reason:'DUPLICATE_FACTORY_INPUT_BATCH_RESERVATION',batchId:reservation.batchId||null};
    seen.add(reservation.batchId);
  }
  for(const reservation of reservations){
    reservation.lot.cycleReservationId=String(cycleId);
    reservation.lot.cycleReservedQuantity=reservation.quantity;
    reservation.lot.cycleReservedResourceId=reservation.resourceId;
    reservation.lot.cycleReservedTurn=turn();
    delete reservation.lot;
  }
  return{status:'RESERVED',reservations};
}
function releaseFactoryCycleReservations(asset,cycleId){
  const wanted=String(cycleId||'');
  if(!wanted)return 0;
  let released=0;
  for(const lot of Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[]){
    if(String(lot?.cycleReservationId||'')!==wanted)continue;
    delete lot.cycleReservationId;
    delete lot.cycleReservedQuantity;
    delete lot.cycleReservedResourceId;
    delete lot.cycleReservedTurn;
    released++;
  }
  return released;
}
function factorySourceWarehouse(rs,batch){
  const declared=String(batch?.warehouseId||'').toUpperCase();
  const stage=String(batch?.stage||'RAW').toUpperCase();
  if(declared.includes('PROCESSED')||declared.includes('FINISHED')||
     ['PROCESSED','INTERMEDIATE','FINISHED','REFINED','OUTPUT'].includes(stage))
    return{kind:'PROCESSED',warehouse:rs.processedWarehouse||(rs.processedWarehouse={warehouseId:'WH-'+canonicalCountry(batch?.countryId||'' )+'-PROCESSED',availableByResource:{},reservedByResource:{}})};
  return{kind:'RAW',warehouse:rs.warehouse||(rs.warehouse={warehouseId:'WH-'+canonicalCountry(batch?.countryId||'')+'-RAW',availableByResource:{},reservedByResource:{}})};
}
function batchBelongsToBoundFactorySite(rs,batch,sourceSiteId,flowSiteByBatchId){
  const wanted=String(sourceSiteId||'').trim();
  if(!wanted)return true;
  const batchId=String(batch?.batchId||'').trim();
  const flowSite=flowSiteByBatchId.get(batchId);
  // A recorded site-flow entry is the strongest source identity for extracted batches.
  if(flowSite)return flowSite===wanted;
  const directIds=[batch?.siteReferenceKey,batch?.siteId,batch?.sourceSiteId,batch?.originSiteId,
    batch?.provenance?.siteId,batch?.provenance?.sourceSiteId]
    .map(value=>String(value||'').trim()).filter(Boolean);
  if(directIds.includes(wanted))return true;
  const occurrence=String(batch?.occurrenceKey||batch?.sourceOccurrenceKey||batch?.provenance?.occurrenceKey||'').trim();
  if(occurrence===wanted||occurrence.includes(':'+wanted+':'))return true;
  return false;
}
function transferFactoryInputsFromWarehouse(countryId,asset,recipe){
  const cid=canonicalCountry(countryId),rs=resourceState(cid),n=netState(cid);
  const stock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:(asset.inputInventory={});
  const lots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:(asset.inputBatchLots=[]);
  const capacity=Math.max(0,num(asset.capacityPerDay??asset.capacity??asset.productionCapacity??asset.throughput)||0);
  const transfers=[],blocked=[];
  if(!(capacity>1e-9))return{status:'BLOCKED',reason:'PRODUCTION_CAPACITY_UNAVAILABLE',transfers,blocked};
  const batches=Array.isArray(rs.batches)?rs.batches:[];
  const nonTransferable=new Set(['CONSUMED','SOLD','TRANSFERRED_OUT','EXHAUSTED','IN_TRANSIT','RESERVED','DECOMMISSIONED']);
  // Mine-bound simulation factories must not silently consume a different mine's
  // same-resource stock just because it is older in the national warehouse FIFO.
  // Generic factories without a source-site binding retain normal pooled-warehouse behavior.
  const boundSourceSiteId=String(asset?.sourceSiteId||asset?.siteId||'').trim();
  const siteFlowRows=Array.isArray(rs.industrialNetwork?.siteFlowLedger)?rs.industrialNetwork.siteFlowLedger:[];
  const flowSiteByBatchId=new Map(siteFlowRows.filter(row=>row?.batchId&&row?.siteId)
    .map(row=>[String(row.batchId),String(row.siteId)]));
  for(const [rawId,rawCoefficient] of Object.entries(recipe?.inputs||{})){
    const rid=tok(rawId),coefficient=num(rawCoefficient);
    if(!rid||coefficient===null||coefficient<=0){blocked.push({resourceId:rid||rawId,reason:'FACTORY_RECIPE_COEFFICIENT_INVALID'});continue;}
    const currentKey=quantityObjectKey(stock,rid),current=currentKey===null?0:Math.max(0,num(stock[currentKey])||0);
    const target=Math.max(0,capacity*coefficient-current);
    if(target<=1e-9)continue;
    const inTransit=n.shipments.filter(row=>String(row?.shipmentType||'')==='FACTORY_INPUT'&&
      String(row?.factoryId||'')===String(asset.id||asset.assetId||asset.projectId)&&tok(row?.resourceId)===rid&&
      ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(row?.status||'')))
      .reduce((sum,row)=>sum+Math.max(0,num(row?.targetQuantity)||0),0);
    let remaining=Math.max(0,target-inTransit);
    if(remaining<=1e-9)continue;
    const candidates=batches.filter(batch=>tok(batch?.resourceId||batch?.materialIdentity)===rid&&
      !nonTransferable.has(String(batch?.status||'').toUpperCase())&&
      Math.max(0,num(batch?.remainingQuantity!=null?batch.remainingQuantity:batch?.quantity)||0)>1e-9&&
      batchBelongsToBoundFactorySite(rs,batch,boundSourceSiteId,flowSiteByBatchId))
      .sort((a,b)=>(num(a?.createdTurn)||0)-(num(b?.createdTurn)||0));
    for(const batch of candidates){
      if(remaining<=1e-9)break;
      const batchId=String(batch?.batchId||'').trim();if(!batchId)continue;
      const source=factorySourceWarehouse(rs,batch),wh=source.warehouse;
      wh.availableByResource=wh.availableByResource||{};wh.reservedByResource=wh.reservedByResource||{};
      const availableKey=quantityObjectKey(wh.availableByResource,rid),reservedKey=quantityObjectKey(wh.reservedByResource,rid);
      if(availableKey===null)continue;
      const warehouseAvailable=Math.max(0,num(wh.availableByResource[availableKey])||0);
      const reserved=reservedKey===null?0:Math.max(0,num(wh.reservedByResource[reservedKey])||0);
      const sourceRemaining=Math.max(0,num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);
      const sourceLot=rs.inventoryLots&&rs.inventoryLots[batchId]||null;
      const lotRemaining=sourceLot?Math.max(0,num(sourceLot.remainingQuantity!=null?sourceLot.remainingQuantity:sourceLot.quantity)||0):sourceRemaining;
      const invKey=quantityObjectKey(rs.inventory||{},rid),countryAvailable=invKey===null?0:Math.max(0,num(rs.inventory[invKey])||0);
      const sourceUnit=String(batch.unit||sourceLot?.unit||'').trim();
      const targetUnit=recipe.inputUnit||asset.inputUnit||cat()?.factoryCatalogPolicy?.unitNormalization?.targetUnit||'';
      const bridge=factoryUnitBridge(sourceUnit,targetUnit);
      if(!bridge){blocked.push({batchId,resourceId:rid,reason:'FACTORY_INPUT_UNIT_BRIDGE_NOT_DECLARED',sourceUnit:sourceUnit||'NOT_RECORDED',targetUnit:targetUnit||'NOT_RECORDED'});continue;}
      const amount=Math.min(remaining/bridge.factor,Math.max(0,warehouseAvailable-reserved),sourceRemaining,lotRemaining,countryAvailable);
      if(amount<=1e-9)continue;
      const targetAmount=Number((amount*bridge.factor).toFixed(6));
      if(!(targetAmount>1e-9))continue;
      const transferSequence=(Number(n.factoryInputTransferSequence)||0)+1;n.factoryInputTransferSequence=transferSequence;
      const transferId='FACTORY-WH-TRANSFER:'+cid+':'+String(asset.id||asset.assetId||asset.projectId)+':T'+turn()+':'+transferSequence;
      const rootIds=[batchId,...(Array.isArray(batch.sourceBatchIds)?batch.sourceBatchIds:[])].filter(Boolean).map(String);
      wh.availableByResource[availableKey]=Number(Math.max(0,warehouseAvailable-amount).toFixed(6));
      batch.remainingQuantity=Number(Math.max(0,sourceRemaining-amount).toFixed(6));
      batch.status=batch.remainingQuantity>1e-9?'PARTIALLY_TRANSFERRED_TO_FACTORY':'TRANSFERRED_TO_FACTORY';
      batch.lastMovementType='WAREHOUSE_TO_FACTORY_INPUT_TRANSFER';batch.lastMovementTurn=turn();
      if(sourceLot){
        sourceLot.remainingQuantity=Number(Math.max(0,lotRemaining-amount).toFixed(6));
        sourceLot.status=sourceLot.remainingQuantity>1e-9?'PARTIALLY_TRANSFERRED_TO_FACTORY':'TRANSFERRED_TO_FACTORY';
        sourceLot.lastMovementType='WAREHOUSE_TO_FACTORY_INPUT_TRANSFER';sourceLot.lastMovementTurn=turn();
      }
      if(batch.remainingQuantity<=1e-9&&Array.isArray(wh.storedBatchIds))wh.storedBatchIds=wh.storedBatchIds.filter(id=>String(id)!==batchId);
      if(invKey!==null)rs.inventory[invKey]=Number(Math.max(0,countryAvailable-amount).toFixed(6));
      const destKey=quantityObjectKey(stock,rid)||rid;
      stock[destKey]=Number(((num(stock[destKey])||0)+targetAmount).toFixed(6));
      const inputBatchId='INPUT:'+transferId;
      const inputLot={batchId:inputBatchId,resourceId:rid,materialIdentity:rid,quantity:targetAmount,remainingQuantity:targetAmount,
        unit:bridge.targetUnit,stage:'FACTORY_INPUT',countryId:cid,sourceCountryId:cid,originCountryId:cid,
        ownerCountryCode:cid,destinationCountryId:cid,ownerCompanyId:String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid)),
        sourceBatchIds:rootIds,sourceSiteIds:[...(Array.isArray(batch.sourceSiteIds)?batch.sourceSiteIds:[])],
        sourceFactoryId:batch.sourceFactoryId||null,sourceWarehouseId:wh.warehouseId||('WH-'+cid+'-'+source.kind),
        factoryId:String(asset.id||asset.assetId||asset.projectId),locationNodeKey:'FACTORY:'+cid+':'+String(asset.id||asset.assetId||asset.projectId),
        createdTurn:turn(),status:'AVAILABLE_TO_FACTORY',lastMovementType:'WAREHOUSE_TO_FACTORY_INPUT_TRANSFER',lastMovementTurn:turn(),
        provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:bridge.authority,unitBridge:bridge,
          sourceBatchId:batchId,sourceBatchIds:rootIds,transferId,simulationOnly:true,simulationTurn:turn()}};
      lots.push(inputLot);
      if(!rs.inventoryLots||typeof rs.inventoryLots!=='object')rs.inventoryLots={};
      rs.inventoryLots[inputBatchId]={...clone(inputLot),createdTurn:turn()};
      const row={transferId,countryId:cid,factoryId:String(asset.id||asset.assetId||asset.projectId),resourceId:rid,
        quantity:amount,targetQuantity:targetAmount,sourceUnit,targetUnit:bridge.targetUnit,sourceBatchId:batchId,
        inputBatchId,sourceWarehouseId:wh.warehouseId||('WH-'+cid+'-'+source.kind),destinationNode:'FACTORY:'+cid+':'+String(asset.id||asset.assetId||asset.projectId),
        routeType:'INTERNAL_WAREHOUSE_TO_FACTORY',status:'DELIVERED',turn:turn(),sourceBatchIds:rootIds,
        authority:'SIMULATED_WAREHOUSE_TO_FACTORY_TRANSFER',simulationOnly:true};
      n.factoryInputTransfers=Array.isArray(n.factoryInputTransfers)?n.factoryInputTransfers:[];
      n.factoryInputTransfers.push(row);n.factoryInputTransfers=n.factoryInputTransfers.slice(-MAX_EVENTS);
      const inventoryLedger=Array.isArray(rs.inventoryLedger)?rs.inventoryLedger:[];
      inventoryLedger.push({type:'FACTORY_WAREHOUSE_INPUT_TRANSFER',...clone(row)});
      rs.inventoryLedger=inventoryLedger.slice(-2048);
      emit('OMEGA_FACTORY_WAREHOUSE_INPUT_TRANSFERRED',cid,row);
      transfers.push(row);remaining=Math.max(0,remaining-targetAmount);
    }
    if(remaining>1e-6)blocked.push({resourceId:rid,reason:'INSUFFICIENT_TRACKED_WAREHOUSE_STOCK',required:remaining+Math.max(0,target-remaining),transferred:target-remaining,remaining});
  }
  asset.inputInventory=stock;asset.inputBatchLots=lots;
  return{status:blocked.length?'DEGRADED':'TRANSFERRED',countryId:cid,factoryId:String(asset.id||asset.assetId||asset.projectId),turn:turn(),transferCount:transfers.length,transfers,blocked};
}
function factoryCycleDue(cycle){
  const now=factoryCurrentGameDate();
  if(cycle?.finishDate&&now)return factoryDateReached(now,cycle.finishDate);
  return turn()>=Math.max(0,num(cycle?.finishTurn)||Number.MAX_SAFE_INTEGER);
}
function startFactoryProductionCycle(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'');
  const asset=factoryAssets(cid).find(row=>String(row?.id||row?.assetId||row?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND',factoryId:fid};
  const n=factoryCycleStore(cid),existing=n.factoryProductionCycles[fid];
  if(factoryCycleActive(existing))return{status:existing.status==='PAUSED'?'PAUSED':'IN_PROGRESS',cycleId:existing.cycleId,
    factoryId:fid,finishDate:existing.finishDate,productionQuantity:existing.productionQuantity,productivityPct:existing.productivityPct,idempotent:true};
  const gate=factoryOperationGate(cid,asset);
  if(gate.status!=='READY'){
    factorySetProductionHealth(asset,'STOPPED',0,num(asset.capacityPerDay??asset.capacity),{reason:gate.reason,gate});
    return gate;
  }
  const first=tok(input.resourceId||Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId||'');
  const recipe=recipeFor(first,asset),metrics=factoryProductionMetrics(asset,recipe);
  const requested=Math.max(0,num(input.quantity)||metrics.capacity);
  let quantity=Math.min(metrics.capacity,requested,metrics.possibleProduction);
  if(metrics.missingInputs.length){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:'FACTORY_INPUT_OR_BATCH_SHORTAGE',missingInputs:metrics.missingInputs});
    return{status:'BLOCKED',reason:'FACTORY_INPUT_OR_BATCH_SHORTAGE',factoryId:fid,missingInputs:clone(metrics.missingInputs),capacity:metrics.capacity};
  }
  if(!(quantity>1e-9)){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:'FACTORY_INPUT_SHORTAGE',missingInputs:metrics.inputs.filter(row=>row.available<=1e-9).map(row=>({resourceId:row.resourceId,reason:'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY'}))});
    return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',factoryId:fid};
  }
  const utilityProfile=(cat()?.factoryProfiles||{})[normalizeFactoryType(asset.factoryType||asset.type||'')]?.utilities||asset.utilityRequirements||{};
  let utilityPreview=previewFactoryUtilityUse(cid,asset,quantity);
  if(utilityPreview.status==='BLOCKED'&&utilityPreview.reason==='FACTORY_UTILITY_SHORTAGE'){
    for(const shortage of utilityPreview.shortages||[]){
      const daily=shortage.utility==='ELECTRICITY'?num(utilityProfile.electricityMWhPerDay):num(utilityProfile.waterM3PerDay);
      const rate=daily!==null&&metrics.capacity>0?daily/metrics.capacity:0;
      if(rate>1e-9)quantity=Math.min(quantity,Math.max(0,num(shortage.available)||0)/rate);
    }
    if(quantity>1e-9)utilityPreview=previewFactoryUtilityUse(cid,asset,quantity);
  }
  if(utilityPreview.status!=='READY'||!(quantity>1e-9)){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:utilityPreview.reason||'FACTORY_UTILITY_SHORTAGE',utility:utilityPreview});
    return{status:'BLOCKED',reason:utilityPreview.reason||'FACTORY_UTILITY_SHORTAGE',factoryId:fid,utility:utilityPreview};
  }
  // Recheck batch attribution for the final utility-constrained quantity before scheduling.
  const inputQuantities={};
  for(const row of metrics.inputs){
    const need=Number((row.coefficient*quantity).toFixed(6));
    inputQuantities[row.resourceId]=need;
    if(row.available+1e-6<need||row.tracked+1e-6<need){
      const detail={resourceId:row.resourceId,required:need,available:row.available,tracked:row.tracked,reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'};
      factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:detail.reason,missingInputs:[detail]});
      return{status:'BLOCKED',reason:detail.reason,factoryId:fid,missingInputs:[detail]};
    }
  }
  const startDate=factoryCurrentGameDate(),cycleDays=Math.max(1,num(recipe.cycleDays)||1),durationDays=Math.max(1,Math.ceil(cycleDays-1e-9));
  const finishDate=startDate?factoryAddGameDays(startDate,durationDays):null;
  const finishTurn=turn()+Math.max(1,Math.ceil(durationDays/Math.max(daysPerTurn(),1/86400000)));
  const cycleSequence=(Number(n.factoryProductionCycleSequence)||0)+1;n.factoryProductionCycleSequence=cycleSequence;
  const cycle={cycleId:'FACTORYCYCLE:'+cid+':'+fid+':T'+turn()+':'+cycleSequence,countryId:cid,factoryId:fid,
    factoryType:String(asset.factoryType||asset.type||'').toUpperCase(),recipeId:recipe.recipeId||asset.recipeId||null,
    recipeMode:recipe.recipeMode||'SINGLE_INPUT',primaryInputResourceId:first,productionQuantity:Number(quantity.toFixed(6)),
    capacityPerDay:metrics.capacity,productivityPct:Number((quantity/metrics.capacity*100).toFixed(2)),
    inputQuantities,expectedOutputs:Object.fromEntries(Object.entries(recipe.outputs||{}).map(([id,value])=>[id,Number((quantity*(num(value)||0)).toFixed(6))])),
    sourceBatchIds:[],
    inputBatchReservations:[],
    startDate,finishDate,cycleDays:durationDays,startTurn:turn(),finishTurn,status:'IN_PROGRESS',
    authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1',simulationOnly:true};
  const reserved=reserveFactoryCycleInputs(asset,metrics,inputQuantities,cycle.cycleId);
  if(reserved.status!=='RESERVED'){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:reserved.reason,detail:reserved});
    return{status:'BLOCKED',reason:reserved.reason,factoryId:fid,detail:reserved};
  }
  cycle.inputBatchReservations=reserved.reservations;
  cycle.sourceBatchIds=[...new Set(reserved.reservations.map(row=>String(row.batchId||'')).filter(Boolean))];
  n.factoryProductionCycles[fid]=cycle;
  n.factoryProductionCycleHistory.push(clone(cycle));n.factoryProductionCycleHistory=n.factoryProductionCycleHistory.slice(-MAX_EVENTS);
  factorySetProductionHealth(asset,quantity+1e-6<metrics.capacity?'REDUCED':'RUNNING',quantity,metrics.capacity,{cycleId:cycle.cycleId});
  asset.activeProductionCycleId=cycle.cycleId;
  emit('OMEGA_FACTORY_PRODUCTION_CYCLE_STARTED',cid,cycle);
  return{status:'IN_PROGRESS',...clone(cycle)};
}
function completeFactoryProductionCycle(countryId,asset,cycle,result){
  const cid=canonicalCountry(countryId),n=netState(cid);
  if(result?.status!=='COMPLETED'){
    cycle.status='PAUSED';cycle.lastBlockedReason=result?.reason||'FACTORY_PRODUCTION_COMPLETION_BLOCKED';
    cycle.lastBlockedDetail=clone(result);cycle.pausedTurn=turn();
    factorySetProductionHealth(asset,'STOPPED',0,cycle.capacityPerDay,{reason:cycle.lastBlockedReason,cycleId:cycle.cycleId,detail:result});
    emit('OMEGA_FACTORY_PRODUCTION_CYCLE_PAUSED',cid,{cycleId:cycle.cycleId,factoryId:cycle.factoryId,
      reason:cycle.lastBlockedReason,detail:result,turn:turn()});
    return{status:'PAUSED',cycleId:cycle.cycleId,reason:cycle.lastBlockedReason,detail:result};
  }
  cycle.status='COMPLETED';cycle.completedTurn=turn();cycle.actualCompletionDate=factoryCurrentGameDate()||cycle.finishDate;
  const actualProduction=Math.max(0,num(result.requestedProduction)||cycle.productionQuantity);
  cycle.actualProductionQuantity=Number(actualProduction.toFixed(6));
  cycle.productivityPct=cycle.capacityPerDay>0?Number((actualProduction/cycle.capacityPerDay*100).toFixed(2)):0;
  cycle.transactionId=result.transactionId;cycle.outputQuantities=clone(result.outputQuantities||result.outputs||{});
  cycle.createdBatchIds=clone(result.createdBatchIds||[]);cycle.lastBlockedReason=null;
  releaseFactoryCycleReservations(asset,cycle.cycleId);
  asset.activeProductionCycleId=null;asset.lastProductionCycleId=cycle.cycleId;asset.lastProductionCycleCompletedDate=cycle.actualCompletionDate;
  factorySetProductionHealth(asset,cycle.productivityPct<99.999?'REDUCED':'READY',actualProduction,cycle.capacityPerDay,{cycleId:cycle.cycleId});
  n.factoryProductionCycleHistory.push(clone(cycle));n.factoryProductionCycleHistory=n.factoryProductionCycleHistory.slice(-MAX_EVENTS);
  // Batch lineage from the committed transaction is the only source of truth for
  // which sites and shipments were consumed by this cycle. Input-lot IDs (for example,
  // INPUT:SHIP:...) are not site-flow batch IDs, so reconcile each consumed input lot's
  // recorded upstream lineage before updating mine/site flow records.
  // Never infer completion from factory/cycle identity alone.
  const rootsSet=new Set((result.sourceBatchIds||[]).map(String).filter(Boolean));
  const consumedInputIds=new Set((result.consumedInputs||[]).map(row=>String(row?.batchId||'')).filter(Boolean));
  const inputLots=Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[];
  for(const lot of inputLots){
    const inputBatchId=String(lot?.batchId||'').trim();
    if(!inputBatchId)continue;
    if(consumedInputIds.has(inputBatchId)||rootsSet.has(inputBatchId)){
      rootsSet.add(inputBatchId);
      for(const sourceId of Array.isArray(lot?.sourceBatchIds)?lot.sourceBatchIds:[]){
        const id=String(sourceId||'').trim();
        if(id)rootsSet.add(id);
      }
    }
  }
  const roots=[...rootsSet];
  for(const sourceBatchId of roots){
    updateSiteFlow(cid,sourceBatchId,row=>{
      row.processingTransactionIds=[...new Set([...(row.processingTransactionIds||[]),String(result.transactionId)])];
      row.processingTransactionId=String(result.transactionId);
      row.createdBatchIds=[...new Set([...(row.createdBatchIds||[]),...(result.createdBatchIds||[])])];
      row.outputQuantities=row.outputQuantities||{};
      for(const [outputId,amount] of Object.entries(result.outputQuantities||{}))
        row.outputQuantities[outputId]=(num(row.outputQuantities[outputId])||0)+(num(amount)||0);
      row.lastProcessingTurn=turn();row.status='PROCESSED';
      addFlowStage(row,'PROCESSING','COMPLETED',{transactionId:result.transactionId,inputQuantity:result.inputQuantity,productionCycleId:cycle.cycleId});
      addFlowStage(row,'FINISHED_GOODS','AVAILABLE',{transactionId:result.transactionId,createdBatchIds:result.createdBatchIds||[],outputQuantities:result.outputQuantities||{},productionCycleId:cycle.cycleId});
    });
    for(const shipment of n.shipments.filter(row=>String(row.batchId||'')===sourceBatchId)){
      shipment.processingStatus='PROCESSED';shipment.processingTransactionId=result.transactionId;
      shipment.processing=clone(result);shipment.processedTurn=turn();
      shipment.createdBatchIds=[...new Set([...(shipment.createdBatchIds||[]),...(result.createdBatchIds||[])])];
    }
    for(const delivery of n.deliveries.filter(row=>String(row.batchId||'')===sourceBatchId)){
      delivery.processingStatus='PROCESSED';delivery.processingTransactionId=result.transactionId;
      delivery.processing=clone(result);delivery.processedTurn=turn();
      delivery.createdBatchIds=[...new Set([...(delivery.createdBatchIds||[]),...(result.createdBatchIds||[])])];
    }
    emit('OMEGA_RESOURCE_SITE_FLOW_PROCESSED',cid,{siteId:siteFlowRows(cid).find(row=>String(row.batchId)===sourceBatchId)?.siteId||null,
      batchId:sourceBatchId,resourceId:cycle.primaryInputResourceId,transactionId:result.transactionId,
      createdBatchIds:result.createdBatchIds||[],outputQuantities:result.outputQuantities||{},turn:turn(),status:'PROCESSED'});
  }
  emit('OMEGA_FACTORY_PRODUCTION_CYCLE_COMPLETED',cid,{cycleId:cycle.cycleId,transactionId:result.transactionId,
    factoryId:cycle.factoryId,outputQuantities:cycle.outputQuantities,finishDate:cycle.finishDate,actualCompletionDate:cycle.actualCompletionDate});
  return{status:'COMPLETED',cycleId:cycle.cycleId,transactionId:result.transactionId,outputQuantities:cycle.outputQuantities};
}
function processPendingFactoryInputs(countryId){
  const cid=canonicalCountry(countryId),n=factoryCycleStore(cid),assets=factoryAssets(cid),completed=[],started=[],blocked=[],transfers=[];
  const completedThisTurn=new Set();
  // First finish any cycle whose date has arrived. Output is not posted before this point.
  for(const asset of assets){
    const fid=String(asset?.id||asset?.assetId||asset?.projectId||''),cycle=n.factoryProductionCycles[fid];
    if(!fid||!asset||!factoryCycleActive(cycle)||cycle.status==='PAUSED'||!factoryCycleDue(cycle))continue;
    const result=executeFactoryCycle({countryId:cid,factoryId:fid,factoryCycleId:cycle.cycleId,
      resourceId:cycle.primaryInputResourceId,quantity:cycle.productionQuantity,unit:asset.inputUnit||null});
    const outcome=completeFactoryProductionCycle(cid,asset,cycle,result);
    if(outcome.status==='COMPLETED'){completed.push(outcome);completedThisTurn.add(fid);}
    else if(outcome.status!=='PAUSED')blocked.push({factoryId:fid,reason:outcome.reason||'FACTORY_PRODUCTION_CYCLE_PAUSED',detail:outcome});
  }
  for(const asset of assets){
    const fid=String(asset?.id||asset?.assetId||asset?.projectId||'');
    if(!fid||!asset||completedThisTurn.has(fid))continue;
    const prior=n.factoryProductionCycles[fid];
    if(factoryCycleActive(prior)){
      if(prior.status==='PAUSED'&&factoryCycleDue(prior)){
        // Pause is not a dead end: fetch any newly delivered/available required feedstock before
        // deciding whether this facility remains red/stopped or can resume at reduced productivity.
        const pausedRecipe=recipeFor(prior.primaryInputResourceId,asset);
        const feeder=transferFactoryInputsFromWarehouse(cid,asset,pausedRecipe);
        transfers.push(...(feeder.transfers||[]));
        const resumedMetrics=factoryProductionMetrics(asset,pausedRecipe,prior.cycleId);
        const resumeMissing=resumedMetrics.inputs.filter(row=>row.available<=1e-9||row.tracked<=1e-9)
          .map(row=>({resourceId:row.resourceId,available:row.available,tracked:row.tracked,
            reason:row.available<=1e-9?'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY':'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'}));
        if(resumedMetrics.possibleProduction<=1e-9||resumeMissing.length){
          factorySetProductionHealth(asset,'STOPPED',0,resumedMetrics.capacity,{reason:'FACTORY_INPUT_SHORTAGE',
            missingInputs:resumeMissing.length?resumeMissing:resumedMetrics.missingInputs,cycleId:prior.cycleId});
          blocked.push({factoryId:fid,reason:'FACTORY_INPUT_SHORTAGE',
            missingInputs:resumeMissing.length?resumeMissing:resumedMetrics.missingInputs,warehouseTransferStatus:feeder.status});
          continue;
        }
        releaseFactoryCycleReservations(asset,prior.cycleId);
        prior.status='RESCHEDULED_AFTER_INPUT_SHORTAGE';prior.resumedTurn=turn();prior.resumedByCycleSequence=(Number(n.factoryProductionCycleSequence)||0)+1;
        n.factoryProductionCycleHistory.push(clone(prior));n.factoryProductionCycleHistory=n.factoryProductionCycleHistory.slice(-MAX_EVENTS);
        delete n.factoryProductionCycles[fid];asset.activeProductionCycleId=null;
        // Continue through the normal operation, utility and workforce gates below. The replacement
        // cycle uses currently recorded batches and a newly calculated productivity percentage.
      }else{
        factorySetProductionHealth(asset,prior.productivityPct<99.999?'REDUCED':'RUNNING',
          prior.productionQuantity,prior.capacityPerDay,{cycleId:prior.cycleId});
        continue;
      }
    }
    const gate=factoryOperationGate(cid,asset);
    if(gate.status!=='READY'){
      factorySetProductionHealth(asset,'STOPPED',0,num(asset.capacityPerDay??asset.capacity),{reason:gate.reason,gate});
      blocked.push({factoryId:fid,reason:gate.reason,detail:gate});continue;
    }
    const first=tok(Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId||'');
    const recipe=recipeFor(first,asset);
    const transfer=transferFactoryInputsFromWarehouse(cid,asset,recipe);
    transfers.push(...(transfer.transfers||[]));
    const metrics=factoryProductionMetrics(asset,recipe);
    const missing=metrics.inputs.filter(row=>row.available<=1e-9||row.tracked<=1e-9)
      .map(row=>({resourceId:row.resourceId,available:row.available,tracked:row.tracked,reason:row.available<=1e-9?'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY':'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'}));
    if(metrics.possibleProduction<=1e-9||missing.length){
      factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:'FACTORY_INPUT_SHORTAGE',missingInputs:missing.length?missing:metrics.missingInputs});
      blocked.push({factoryId:fid,reason:'FACTORY_INPUT_SHORTAGE',missingInputs:missing.length?missing:metrics.missingInputs,
        warehouseTransferStatus:transfer.status});continue;
    }
    const result=startFactoryProductionCycle({countryId:cid,factoryId:fid,resourceId:first,quantity:metrics.possibleProduction});
    if(result.status==='IN_PROGRESS')started.push({factoryId:fid,cycleId:result.cycleId,productionQuantity:result.productionQuantity,
      productivityPct:result.productivityPct,finishDate:result.finishDate});
    else blocked.push({factoryId:fid,reason:result.reason||result.status,detail:result});
  }
  return{status:blocked.length?'DEGRADED':'COMPLETED',countryId:cid,turn:turn(),completedCount:completed.length,processedCount:completed.length,completed,processed:completed,
    startedCount:started.length,started,warehouseTransferCount:transfers.length,transfers,blocked};
}

function ensureSimulationFactory(cid,site,resourceId,quantity,options={}){
  const economy=econState(cid);if(!Array.isArray(economy.productionAssets))economy.productionAssets=[];
  const assets=economy.productionAssets,siteId=String(site?.siteId||'');
  const factoryId='FAC-SIM:'+cid+':'+String(siteId).replace(/[^A-Za-z0-9_-]/g,'_')+':'+tok(resourceId);
  const compatible=candidateFactories(cid,resourceId);
  // Explicit auto-commissioning binds a new deposit to a source-site factory when possible.
  // Otherwise retain the legacy shared-factory fallback for callers that do not request it.
  const siteFactory=compatible.find(({asset})=>String(asset?.sourceSiteId||asset?.siteId||'')===siteId);
  if(siteFactory)return{status:'EXISTING_SITE',factory:siteFactory.asset};
  let factory=assets.find(a=>String(a?.id||a?.assetId||a?.projectId)===factoryId);
  if(factory&&assetCanAccept(factory,resourceId))return{status:'EXISTING_SITE',factory};
  if(options.siteSpecific!==true&&compatible.length)return{status:'EXISTING',factory:compatible[0].asset};
  const recipe=recipeFor(resourceId,{});
  if(!Object.keys(recipe.inputs||{}).length||!Object.keys(recipe.outputs||{}).length)return{status:'BLOCKED',reason:'NO_FACTORY_RECIPE'};
  if(!factory){
    factory={id:factoryId,countryId:cid,siteId:null,sourceSiteId:siteId,stage:'PROCESSING',factoryType:recipe.factoryType||'RESOURCE_PROCESSING_PLANT',
      status:'OPERATIONAL',capacity:Math.max(1,num(quantity)||1),inputCoefficients:clone(recipe.inputs),outputProfile:clone(recipe.outputs),
      inputInventory:{},inputBatchLots:[],companyId:'SIM-COMPANY:'+cid,ownerCompanyId:'SIM-COMPANY:'+cid,
      transportAccess:['truck','rail','ship','pipeline'],locationNodeKey:'FACTORY:'+cid+':'+siteId,
      simulationOnly:true,authority:'SIMULATED_GAMEPLAY_BOOTSTRAP',
      bootstrapReason:options.siteSpecific===true?'SOURCE_SITE_FACTORY_REQUIRED':'NO_EXISTING_COMPATIBLE_FACTORY'};
    assets.push(factory);
  }
  return{status:'CREATED_SIMULATION_ONLY',factory};
}
async function executeSitePipeline(input={}){
  const cid=canonicalCountry(input.countryId);
  if(!cid)return{status:'BLOCKED',reason:'SITE_COUNTRY_MISSING'};
  const selectedPlayer=playerSimulationCountryId();
  if(selectedPlayer&&selectedPlayer!==cid)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:selectedPlayer};
  const routeLoad=await loadSiteLogisticsRoutes(cid);
  if(routeLoad.status!=='READY'&&selectedPlayer)return{status:'BLOCKED',reason:routeLoad.reason||'PLAYER_COUNTRY_LOGISTICS_NOT_READY',detail:routeLoad};
  const endowment=g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime;
  if(!endowment?.initialize||!endowment?.hydrateCountry||!endowment?.extractCountry)return{status:'BLOCKED',reason:'RESOURCE_ENDOWMENT_RUNTIME_UNAVAILABLE'};
  const initialized=await endowment.initialize();
  if(initialized?.status!=='READY')return{status:'BLOCKED',reason:'RESOURCE_ENDOWMENT_NOT_READY',detail:initialized};
  const site=siteById(input.siteId);
  if(!site?.siteId)return{status:'BLOCKED',reason:'SITE_NOT_FOUND'};
  if(canonicalCountry(site.countryId)!==cid)return{status:'BLOCKED',reason:'SITE_COUNTRY_MISMATCH',siteCountryId:site.countryId,requestedCountryId:cid};
  const registeredAssets=Array.isArray(state()?.resource?.[cid]?.mineAssets)?state().resource[cid].mineAssets:[];
  const siteAssets=registeredAssets.filter(row=>String(row?.siteId||'')===String(site.siteId));
  const operationalMineAssets=siteAssets.filter(row=>String(row?.status||'').toUpperCase()==='OPERATIONAL');
  if(siteAssets.length&&!operationalMineAssets.length){
    if(siteAssets.some(row=>String(row?.status||'').toUpperCase()==='STOPPED'))
      return{status:'BLOCKED',reason:'MINE_STOPPED_BY_PLAYER',siteId:site.siteId,countryId:cid};
    if(siteAssets.some(row=>/DECOMMISSIONED|DESTROYED/.test(String(row?.status||'').toUpperCase())))
      return{status:'BLOCKED',reason:'MINE_DECOMMISSIONED',siteId:site.siteId,countryId:cid};
  }
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
    (dedicatedSiteKeys.length?dedicatedSiteKeys:(stateBoundKeys.length?stateBoundKeys:(matchingKeys.length?matchingKeys:(referenceResource===rid?linkedKeys:[]))));
  if(!keys.length)return{status:'BLOCKED',reason:linkedKeys.length?'SITE_RESOURCE_OCCURRENCE_NOT_FOUND':'SITE_HAS_NO_EXECUTABLE_OCCURRENCE',siteId:site.siteId,countryId:cid,resourceId:rid,controllerStatus:controller?.controllerStatus||null,linkedOccurrenceCount:linkedKeys.length,siteStateOccurrenceCount:stateBoundKeys.length,referenceResource:referenceResource||null};
  const already=netState(cid).siteExecutions||[];
  const duplicate=already.find(x=>x.siteId===site.siteId&&Number(x.turn)===turn()&&x.status!=='FAILED');
  if(duplicate)return{status:'BLOCKED',reason:'SITE_ALREADY_EXECUTED_THIS_TURN',existingExecutionId:duplicate.executionId,siteId:site.siteId};
  // Prepare an explicitly requested source-site factory before the extraction event fires.
  // The extraction callback dispatches synchronously, so it must see the intended destination.
  let preparedFactory=null,preparedFactoryBootstrap=null;
  if(input.autoCommissionFactory===true){
    preparedFactoryBootstrap=ensureSimulationFactory(cid,site,rid,
      Math.max(1,num(extractionPlan.approvedQuantity)||num(input.quantity)||1),{siteSpecific:true});
    preparedFactory=preparedFactoryBootstrap.factory||null;
    if(!preparedFactory)return{status:'BLOCKED',reason:'SITE_FACTORY_BOOTSTRAP_BLOCKED',detail:preparedFactoryBootstrap};
  }
  const extraction=await endowment.extractCountry(cid,keys);
  const records=extraction?.result?.records||extraction?.records||[];
  const record=records.find(x=>keys.includes(String(x?.occurrenceKey||''))&&canonicalCountry(x?.countryId||cid)===cid&&x?.producedBatch);
  if(extraction?.status!=='APPLIED'||extraction?.result?.accepted===false||!record){
    return{status:'BLOCKED',reason:'SITE_EXTRACTION_NOT_COMMITTED',siteId:site.siteId,occurrenceKeys:keys,extractionStatus:extraction?.status||null,detail:extraction?.reason||extraction?.detail||extraction?.result?.error||extraction?.result?.blocked||extraction?.result?.reason||null};
  }
  const batch=record.producedBatch,quantity=Math.max(0,num(record.approvedQuantity)||num(batch.quantity)||num(record.quantity)||0);
  if(quantity<=0)return{status:'BLOCKED',reason:'EXTRACTION_BATCH_QUANTITY_INVALID',siteId:site.siteId,occurrenceKey:record.occurrenceKey};
  const existingFlow=siteFlowRows(cid).find(flow=>String(flow.batchId||'')===String(batch.batchId||''));
  if(existingFlow?.mineLogisticsRouteId){
    const network=netState(cid),mineShipment=network.shipments.find(shipment=>String(shipment.batchId||'')===String(batch.batchId||'')&&
      shipment.shipmentType==='MINE_TO_WAREHOUSE'&&['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(shipment.status||'')));
    const status=mineShipment?'IN_TRANSIT':String(existingFlow.mineLogisticsStatus||'')==='WAREHOUSE_RECEIVED'?'WAREHOUSE_RECEIVED':
      String(existingFlow.mineLogisticsStatus||'')==='AWAITING_CAPACITY'?'AWAITING_TRANSPORT_CAPACITY':'BLOCKED';
    const execution={executionId:'SITE-PIPELINE:'+cid+':'+site.siteId+':T'+turn(),siteId:site.siteId,countryId:cid,resourceId:rid,
      occurrenceKey:record.occurrenceKey,batchId:batch.batchId,quantity:mineShipment?.quantity||0,extractedQuantity:quantity,
      unit:batch.unit||'TONNES',turn:turn(),factoryId:existingFlow.factoryId||null,factoryBootstrapStatus:preparedFactoryBootstrap?.status||'EXISTING',
      extractionStatus:'COMMITTED',extractionPlanId:extractionPlan.planId,shipmentStatus:mineShipment?'DISPATCHED':status,
      shipmentId:mineShipment?.shipmentId||existingFlow.mineHaulShipmentId||null,
      route:clone(mineShipment?.route||existingFlow.routeProfile||null),mineLogisticsStatus:existingFlow.mineLogisticsStatus,status};
    const ledger=netState(cid);ledger.siteExecutions=Array.isArray(ledger.siteExecutions)?ledger.siteExecutions:[];
    ledger.siteExecutions.push(clone(execution));ledger.siteExecutions=ledger.siteExecutions.slice(-MAX_EVENTS);
    if(mineShipment)emit('OMEGA_RESOURCE_SITE_PIPELINE_STARTED',cid,execution);
    return{...execution,shipment:mineShipment?clone(mineShipment):null};
  }
  const candidates=candidateFactories(cid,rid);
  let factoryBootstrap=preparedFactoryBootstrap||null;
  let factoryChoice=preparedFactory||
    candidates.find(({asset})=>String(asset?.sourceSiteId||asset?.siteId||'')===String(site.siteId))?.asset||
    candidates[0]?.asset||null;
  // A missing factory must never be silently fabricated during normal gameplay.
  // Scenario/test callers may opt in explicitly with autoCommissionFactory:true.
  if(!factoryChoice&&input.autoCommissionFactory===true){
    factoryBootstrap=ensureSimulationFactory(cid,site,rid,quantity,{siteSpecific:true});
    factoryChoice=factoryBootstrap.factory||null;
  }
  if(!factoryChoice)return{status:'EXTRACTED_AWAITING_FACTORY',siteId:site.siteId,countryId:cid,resourceId:rid,quantity,unit:batch.unit||'TONNES',occurrenceKey:record.occurrenceKey,batchId:batch.batchId,warehouseId:batch.warehouseId||('WH-'+cid+'-RAW'),reason:'NO_MATCHING_FACTORY'};
  const sent=dispatchShipment({countryId:cid,siteId:site.siteId,resourceId:rid,quantity,unit:batch.unit||'TONNES',transportMode:input.transportMode,
    factoryId:String(factoryChoice.id||factoryChoice.assetId||factoryChoice.projectId),batchId:batch.batchId,occurrenceKey:record.occurrenceKey,warehouseId:batch.warehouseId||('WH-'+cid+'-RAW')});
  const dispatchedQuantity=sent.status==='DISPATCHED'?Math.max(0,num(sent.shipment?.quantity)||0):quantity;
  const execution={executionId:'SITE-PIPELINE:'+cid+':'+site.siteId+':T'+turn(),siteId:site.siteId,countryId:cid,resourceId:rid,occurrenceKey:record.occurrenceKey,batchId:batch.batchId,
    quantity:dispatchedQuantity,extractedQuantity:quantity,unit:batch.unit||'TONNES',turn:turn(),factoryId:String(factoryChoice.id||factoryChoice.assetId||factoryChoice.projectId),factoryBootstrapStatus:factoryBootstrap?.status||'EXISTING',
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


function finiteCount(value){if(value===null||value===undefined||value==='')return null;const n=num(value);return n!==null&&n>=0?n:null;}
function countryPopulationRecord(cid,econ){
  const s=state()||{},keys=[cid,String(cid||'').toUpperCase()];
  const resolver=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
  try{
    const identity=resolver?.resolveCountry?.(cid),raw=identity?.raw?.raw||identity?.raw?.datasets?.['countries.json']||identity?.raw||{};
    for(const name of [identity?.name,identity?.countryName,identity?.canonicalName,raw?.name,raw?.countryName,raw?.officialName]){
      if(name){keys.push(String(name));keys.push(String(name).toUpperCase().replace(/[^A-Z0-9]+/g,'_'));}
    }
  }catch(_){}
  const directRows=[econ?.populationRecord,econ?.demographics,econ?.population,s.population?.[cid],s.populations?.[cid],
    s.demographics?.[cid],s.society?.[cid],s.populationByCountry?.[cid],s.countryProfiles?.[cid],s.countries?.[cid]];
  const globals=[s.population,s.populations,s.populationByCountry,g.OmegaPopulationData,g.Omega?.PopulationData,g.populationData,
    g.PopulationData,g.POPULATION_DATA,g.OmegaCountryPopulationData,g.countryPopulationData,g.COUNTRY_POPULATION_DATA];
  for(const source of globals){
    if(!source||typeof source!=='object')continue;
    for(const key of keys){const row=source[key];if(row&&typeof row==='object'){directRows.push(row);break;}}
    if(source.data&&typeof source.data==='object')for(const key of keys){const row=source.data[key];if(row&&typeof row==='object'){directRows.push(row);break;}}
  }
  const populationFields=['populationTotal','population_total','totalPopulation','total_population','population','population_2015','population2015',
    'populationCurrent','population_current','populationCount','population_count','laborForce','labor_force','laborForceSize','labor_force_size',
    'totalLaborForce','total_labor_force','labourForce','labour_force'];
  for(const row of directRows){
    if(row&&typeof row==='object'&&populationFields.some(key=>row[key]!==undefined&&row[key]!==null&&row[key]!==''))return row;
    if(typeof row==='number'&&Number.isFinite(row)&&row>0)return{population:row};
  }
  return null;
}
function resolveFactoryLabourForce(cid,econ){
  const s=state()||{},record=countryPopulationRecord(cid,econ);
  const directCandidates=[econ.laborForce,econ.labor_force,econ.laborForceSize,econ.labor_force_size,econ.totalLaborForce,econ.total_labor_force,
    econ.population?.laborForce,econ.demographics?.laborForce,s.population?.[cid]?.laborForce,s.population?.[cid]?.labor_force,
    record?.laborForce,record?.labor_force,record?.labor_force_total,record?.laborForceTotal,record?.labourForce,record?.labour_force];
  for(const value of directCandidates){const n=finiteCount(value);if(n!==null&&n>0)return{value:n,authority:'RECORDED_LABOUR_FORCE',simulationOnly:false};}
  const popCandidates=[econ.populationTotal,econ.population_total,econ.population_2015,econ.population2015,econ.populationSize,
    typeof econ.population==='number'?econ.population:null,record?.populationTotal,record?.population_total,record?.population_2015,
    record?.population2015,record?.totalPopulation,record?.total_population,record?.population,record?.population_count,
    record?.populationCurrent,record?.population_current,record?.populationCount,record?.total];
  let population=null;for(const value of popCandidates){const n=finiteCount(value);if(n!==null&&n>0){population=n;break;}}
  if(population===null)return{value:null,authority:'NOT_RECORDED',simulationOnly:true};
  const participationCandidates=[econ.laborForceParticipationPct,econ.labor_force_participation_pct,econ.laborParticipationRatePct,
    record?.laborForceParticipationPct,record?.labor_force_participation_pct,record?.labor_force_participation_rate];
  let participation=null;
  for(const value of participationCandidates){const n=num(value);if(n!==null&&n>0&&n<=100){participation=n;break;}}
  if(participation===null)participation=60;
  return{value:Math.max(1,Math.round(population*participation/100)),authority:participation===60&&participationCandidates.every(v=>num(v)===null)?
    'SIMULATED_POPULATION_LABOUR_FORCE_PROXY_60_PERCENT':'RECORDED_PARTICIPATION_RATE_PROXY',
    simulationOnly:participationCandidates.every(v=>num(v)===null),population,participationRatePct:participation};
}
function readUnemploymentCount(econ){
  for(const key of ['unemploymentCount','unemployedCount','unemployedPeople','unemployed_people','unemployment_count','joblessCount']){
    const value=finiteCount(econ?.[key]);if(value!==null)return{value,key};
  }
  return{value:null,key:null};
}
function readUnemploymentRate(econ){
  for(const key of ['unemployment_rate','unemploymentRatePct','unemploymentRate','unemployment_rate_pct']){
    const value=num(econ?.[key]);if(value!==null&&value>=0&&value<=100)return{value,key};
  }
  return{value:null,key:null};
}
function reconcileFactoryEmployment(countryId){
  const cid=canonicalCountry(countryId);
  if(!cid)return{status:'BLOCKED',reason:'FACTORY_EMPLOYMENT_COUNTRY_INVALID'};
  const econ=econState(cid),profiles=cat()?.factoryProfiles||{},assets=factoryAssets(cid);
  let model=econ.factoryEmployment;
  if(!model||typeof model!=='object'||Array.isArray(model)){
    model={schemaVersion:'1.0.0',model:'SIMULATED_FACTORY_EMPLOYMENT_V1',baselineUnemployedCount:null,
      labourForce:null,labourForceAuthority:'NOT_RECORDED',unemploymentSource:'NOT_RECORDED',factories:{},jobsSupported:0,jobsFilled:0,
      vacancies:0,unemployedCount:null,unemploymentRatePct:null,lastAppliedUnemployedCount:null,lastAppliedUnemploymentRatePct:null,
      lastUpdatedTurn:null,simulationOnly:true};
    econ.factoryEmployment=model;
  }
  if(!model.factories||typeof model.factories!=='object'||Array.isArray(model.factories))model.factories={};
  const labour=resolveFactoryLabourForce(cid,econ),direct=readUnemploymentCount(econ),rate=readUnemploymentRate(econ);
  const priorFilled=Math.max(0,num(model.jobsFilled)||0);
  let baseline=finiteCount(model.baselineUnemployedCount);
  const lastCount=finiteCount(model.lastAppliedUnemployedCount),lastRate=num(model.lastAppliedUnemploymentRatePct);
  const directChanged=direct.value!==null&&lastCount!==null&&Math.abs(direct.value-lastCount)>1e-6;
  const rateChanged=rate.value!==null&&lastRate!==null&&Math.abs(rate.value-lastRate)>1e-7;
  if(baseline===null){
    if(direct.value!==null){baseline=direct.value;model.unemploymentSource='RECORDED_UNEMPLOYED_HEADCOUNT';}
    else if(rate.value!==null&&labour.value!==null){
      baseline=Math.max(0,Math.round(labour.value*rate.value/100));model.unemploymentSource='RECORDED_UNEMPLOYMENT_RATE_X_LABOUR_FORCE';
    }
  }else if(directChanged){
    baseline=direct.value+priorFilled;model.unemploymentSource='UPDATED_LIVE_UNEMPLOYED_HEADCOUNT_PLUS_EXISTING_FACTORY_HIRES';
  }else if(rateChanged&&labour.value!==null){
    baseline=Math.max(0,Math.round(labour.value*rate.value/100))+priorFilled;
    model.unemploymentSource='UPDATED_LIVE_UNEMPLOYMENT_RATE_PLUS_EXISTING_FACTORY_HIRES';
  }
  if(baseline!==null)model.baselineUnemployedCount=baseline;
  model.labourForce=labour.value;model.labourForceAuthority=labour.authority;model.labourForceSimulationOnly=labour.simulationOnly;
  model.factories={};
  const operational=assets.filter(asset=>String(asset?.status||'OPERATIONAL').toUpperCase()==='OPERATIONAL'&&
    (asset?.commissionedTurn!==undefined||asset?.factoryType||asset?.type));
  operational.sort((a,b)=>(num(a.commissionedTurn)??num(a.createdTurn)??0)-(num(b.commissionedTurn)??num(b.createdTurn)??0)||
    String(a.id||a.assetId||a.factoryId||a.projectId||'').localeCompare(String(b.id||b.assetId||b.factoryId||b.projectId||'')));
  let totalSupported=0,totalFilled=0,remaining=baseline;
  for(const asset of operational){
    const id=String(asset.id||asset.assetId||asset.factoryId||asset.projectId||'').trim();if(!id)continue;
    const type=String(asset.factoryType||asset.type||asset.facilityType||'').toUpperCase(),profile=profiles[type]||{};
    const jobsRaw=num(profile.employment?.jobsPerFactory??asset.employmentProfile?.jobsPerFactory??asset.employment?.jobsSupported);
    const supported=jobsRaw!==null&&jobsRaw>0?Math.floor(jobsRaw):0;
    const filled=remaining===null?0:Math.min(supported,Math.max(0,Math.floor(remaining))),open=supported-filled;
    remaining=remaining===null?null:Math.max(0,remaining-filled);totalSupported+=supported;totalFilled+=filled;
    const record={factoryId:id,factoryType:type,jobsSupported:supported,jobsFilled:filled,vacancies:open,
      status:supported===0?'EMPLOYMENT_PROFILE_MISSING':open===0?'FULLY_STAFFED':'PARTIALLY_STAFFED',
      authority:profile.employmentAuthority||profile.employment?.authority||'UNDECLARED',simulationOnly:true,lastReconciledTurn:turn()};
    model.factories[id]=record;
    asset.employment={...(asset.employment&&typeof asset.employment==='object'?asset.employment:{}),jobsSupported:supported,jobsFilled:filled,
      vacancies:open,coreOperatingCrew:num(profile.employment?.coreOperatingCrew),additionalDirectStaffSlots:num(profile.employment?.additionalDirectStaffSlots),
      jobScope:profile.employment?.jobScope||'DIRECT_FACTORY_JOBS_SCOPE_NOT_RECORDED',jobBreakdown:clone(profile.employment?.jobBreakdown||{}),
      status:record.status,model:'SIMULATED_FACTORY_EMPLOYMENT_V1',authority:record.authority,simulationOnly:true,lastReconciledTurn:turn()};
  }
  model.jobsSupported=totalSupported;model.jobsFilled=totalFilled;model.vacancies=Math.max(0,totalSupported-totalFilled);
  model.unemployedCount=baseline===null?null:Math.max(0,baseline-totalFilled);
  model.unemploymentRatePct=model.unemployedCount!==null&&labour.value!==null&&labour.value>0?
    Number((model.unemployedCount/labour.value*100).toFixed(4)):null;
  model.status=model.unemployedCount===null?'UNEMPLOYMENT_HEADCOUNT_UNAVAILABLE':'ACTIVE';
  model.authority='SIMULATED_FACTORY_EMPLOYMENT_RECONCILIATION';model.simulationOnly=true;model.lastUpdatedTurn=turn();
  if(model.unemployedCount!==null){
    econ.unemploymentCount=model.unemployedCount;
    for(const key of ['unemployedCount','unemployedPeople','unemployed_people','unemployment_count','joblessCount'])
      if(Object.prototype.hasOwnProperty.call(econ,key))econ[key]=model.unemployedCount;
    if(model.unemploymentRatePct!==null){
      econ.unemployment_rate=model.unemploymentRatePct;
      for(const key of ['unemploymentRatePct','unemploymentRate','unemployment_rate_pct'])
        if(Object.prototype.hasOwnProperty.call(econ,key))econ[key]=model.unemploymentRatePct;
      model.lastAppliedUnemploymentRatePct=model.unemploymentRatePct;
    }
    model.lastAppliedUnemployedCount=model.unemployedCount;
  }
  model.baselineUnemployedCount=baseline;
  model.lastUpdateSourceFields={unemployedCountKey:direct.key,unemploymentRateKey:rate.key};
  return{status:model.status,countryId:cid,turn:turn(),baselineUnemployedCount:baseline,labourForce:model.labourForce,
    labourForceAuthority:model.labourForceAuthority,unemployedCount:model.unemployedCount,unemploymentRatePct:model.unemploymentRatePct,
    jobsSupported:model.jobsSupported,jobsFilled:model.jobsFilled,vacancies:model.vacancies,operationalFactoryCount:operational.length,
    source:model.unemploymentSource,simulationOnly:true};
}

function factoryProductionRequirements(factoryType, recipeId){
  const catalog=cat()||{},profiles=catalog.factoryProfiles||{},processing=catalog.processingRules||{},
    downstream=catalog.downstreamFactoryRecipes||{};
  const requestedType=normalizeFactoryType(factoryType);
  let key=String(recipeId||'').trim(),resourceId=null,recipe=null,kind=null;
  if(/^PROCESSING:/i.test(key)){resourceId=key.replace(/^PROCESSING:/i,'').trim();key=resourceId;}
  if(key&&downstream[key]){recipe=downstream[key];kind='DOWNSTREAM';key=String(recipe.recipeId||key);}
  else if(key&&processing[key]){resourceId=key;recipe=processing[key];kind='PROCESSING';}
  if(!recipe&&!key){
    const profile=profiles[requestedType]||{};
    const preferred=profile.defaultRecipeId||((profile.recipeIds||[]).find(id=>downstream[id])||null);
    if(preferred&&downstream[preferred]){key=preferred;recipe=downstream[preferred];kind='DOWNSTREAM';}
    if(!recipe){
      const found=Object.entries(processing).find(([,row])=>String(row?.factoryType||'').toUpperCase()===requestedType);
      if(found){resourceId=found[0];key=found[0];recipe=found[1];kind='PROCESSING';}
    }
    if(!recipe){
      const found=Object.entries(downstream).find(([,row])=>String(row?.factoryType||'').toUpperCase()===requestedType);
      if(found){key=found[0];recipe=found[1];kind='DOWNSTREAM';}
    }
  }
  const resolvedType=String(recipe?.factoryType||requestedType).trim().toUpperCase();
  const profile=profiles[resolvedType];
  if(!recipe||!profile)return{status:'NOT_FOUND',reason:!recipe?'FACTORY_RECIPE_NOT_FOUND':'FACTORY_PROFILE_NOT_FOUND',
    factoryType:resolvedType,recipeId:key||null};
  const capacity=num(profile.defaultCapacityPerDay);
  if(capacity===null||capacity<=0)return{status:'BLOCKED',reason:'FACTORY_CAPACITY_NOT_RECORDED',
    factoryType:resolvedType,recipeId:recipe.recipeId||key||null};
  const inputs=recipe.inputs&&typeof recipe.inputs==='object'?recipe.inputs:{};
  const outputs=recipe.outputs&&typeof recipe.outputs==='object'?recipe.outputs:{};
  const scaleRows=(source,scale)=>{
    const result={};
    for(const [id,value] of Object.entries(source)){
      const quantity=num(value);
      result[id]=quantity===null?null:Number((quantity*scale).toFixed(6));
    }
    return result;
  };
  const utilities=profile.utilities&&typeof profile.utilities==='object'?profile.utilities:{};
  const power=num(utilities.electricityMWhPerDay),water=num(utilities.waterM3PerDay);
  const employment=profile.employment&&typeof profile.employment==='object'?profile.employment:{};
  const workforce=profile.workforce&&typeof profile.workforce==='object'?profile.workforce:{};
  return{
    status:'READY',
    contract:'OMEGA_FACTORY_PRODUCTION_REQUIREMENTS_V1',
    factoryType:resolvedType,
    factoryName:profile.name||resolvedType,
    recipeId:recipe.recipeId||((kind==='PROCESSING')?'PROCESSING:'+resourceId:key),
    recipeKind:kind,
    resourceId:resourceId,
    inputsPerProductionUnit:clone(inputs),
    outputsPerProductionUnit:clone(outputs),
    inputUnit:recipe.inputUnit||'SIMULATION_RESOURCE_UNIT',
    outputUnit:recipe.outputUnit||'SIMULATION_RESOURCE_UNIT',
    quantityBasis:recipe.quantityBasis||catalog.factoryCatalogPolicy?.quantityBasis||'PER_SIMULATION_PRODUCTION_UNIT',
    ratedCapacityPerDay:capacity,
    ratedDailyInputs:scaleRows(inputs,capacity),
    ratedDailyOutputs:scaleRows(outputs,capacity),
    processing:{cycleDays:num(recipe.cycleDays),cycleTimeUnit:recipe.cycleTimeUnit||catalog.factoryCatalogPolicy?.recipeTimeUnit||'IN_GAME_DAYS',
      runtimeTimingMode:catalog.factoryCatalogPolicy?.recipeTimingRuntimeBehavior||'GAME_CALENDAR_DELAYED_COMPLETION',
      durationEnforced:true},
    workforce:{
      operators:num(workforce.operators),engineers:num(workforce.engineers),
      coreOperatingCrew:num(employment.coreOperatingCrew)??((num(workforce.operators)||0)+(num(workforce.engineers)||0)),
      additionalDirectStaffSlots:num(employment.additionalDirectStaffSlots),totalDirectJobs:num(employment.jobsPerFactory),
      jobBreakdown:clone(employment.jobBreakdown||{})
    },
    utilities:{
      electricityMWhPerDay:power,waterM3PerDay:water,
      electricityMWhPerProductionUnit:power===null?null:Number((power/capacity).toFixed(6)),
      waterM3PerProductionUnit:water===null?null:Number((water/capacity).toFixed(6))
    },
    construction:{
      cost:num(profile.constructionCost),timeDays:num(profile.constructionDays),materials:clone(profile.constructionMaterials||{}),
      materialUnit:profile.constructionMaterialUnit||'SIMULATION_RESOURCE_UNIT',
      requiredInfrastructure:clone(profile.requiredInfrastructure||[]),requiredTechnologyIds:clone(profile.requiredTechnologyIds||[])
    },
    authority:recipe.recipeAuthority||recipe.authority||'SIMULATED_GAMEPLAY_RULE',
    profileAuthority:profile.authority||'NOT_RECORDED',
    simulationOnly:true
  };
}

function factoryProductionStatus(countryId,factoryId){
  const cid=canonicalCountry(countryId),assets=factoryAssets(cid),asset=assets.find(row=>String(row?.id||row?.assetId||row?.projectId)===String(factoryId||''));
  if(!asset)return{status:'NOT_FOUND',reason:'FACTORY_NOT_FOUND',countryId:cid,factoryId:String(factoryId||'')};
  const n=factoryCycleStore(cid),cycle=n.factoryProductionCycles[String(factoryId)]||null;
  return{status:'READY',countryId:cid,factoryId:String(factoryId),health:clone(asset.productionHealth||{status:'NOT_RECORDED'}),
    cycle:clone(cycle),lastProductionCycleId:asset.lastProductionCycleId||null,updatedTurn:turn()};
}
function decommissionFactory(input={}) {
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'').trim();
  if(!cid)return{status:'BLOCKED',reason:'FACTORY_COUNTRY_INVALID',factoryId:fid};
  if(!fid)return{status:'BLOCKED',reason:'FACTORY_ID_REQUIRED',countryId:cid};
  if(input.confirmed!==true)return{status:'CONFIRMATION_REQUIRED',reason:'FACTORY_DECOMMISSION_CONFIRMATION_REQUIRED',countryId:cid,factoryId:fid};
  const asset=factoryAssets(cid).find(row=>String(row?.id||row?.assetId||row?.projectId||'')===fid);
  if(!asset)return{status:'NOT_FOUND',reason:'FACTORY_NOT_FOUND',countryId:cid,factoryId:fid};
  const previousStatus=String(asset.status||'NOT_RECORDED').trim().toUpperCase();
  if(['DECOMMISSIONED','DESTROYED'].includes(previousStatus))
    return{status:'DECOMMISSIONED',countryId:cid,factoryId:fid,idempotent:true,productionStatus:'STOPPED'};
  const network=netState(cid);
  const cycleMap=factoryCycleStore(cid).factoryProductionCycles;
  const cycle=cycleMap[fid]||null;
  if(factoryCycleActive(cycle)){
    cycle.status='CANCELLED';
    cycle.cancelReason='FACTORY_DECOMMISSIONED_BY_PLAYER';
    cycle.cancelledTurn=turn();
    cycle.cancelledDate=factoryCurrentGameDate();
    cycle.decommissionedByPlayer=true;
    releaseFactoryCycleReservations(asset,cycle.cycleId);
    network.factoryProductionCycleHistory.push(clone(cycle));
    network.factoryProductionCycleHistory=network.factoryProductionCycleHistory.slice(-MAX_EVENTS);
    delete cycleMap[fid];
  }
  asset.status='DECOMMISSIONED';
  asset.decommissionedTurn=turn();
  asset.decommissionedDate=factoryCurrentGameDate();
  asset.decommissionedByPlayer=true;
  asset.activeProductionCycleId=null;
  const health=factorySetProductionHealth(asset,'STOPPED',0,num(asset.capacityPerDay??asset.capacity??asset.productionCapacity),{
    reason:'FACTORY_DECOMMISSIONED_BY_PLAYER',
    priorStatus:previousStatus,
    cancelledCycleId:cycle?.cycleId||null
  });
  const record={status:'DECOMMISSIONED',countryId:cid,factoryId:fid,factoryType:String(asset.factoryType||asset.type||''),turn:turn(),
    date:asset.decommissionedDate,priorStatus:previousStatus,cancelledCycleId:cycle?.cycleId||null,
    productionHealth:clone(health),authority:'OMEGA_FACTORY_DECOMMISSION_API_V1',historyPreserved:true};
  network.factoryDecommissionHistory=Array.isArray(network.factoryDecommissionHistory)?network.factoryDecommissionHistory:[];
  network.factoryDecommissionHistory.push(clone(record));
  network.factoryDecommissionHistory=network.factoryDecommissionHistory.slice(-MAX_EVENTS);
  network.events=Array.isArray(network.events)?network.events:[];
  network.events.push(clone(record));network.events=network.events.slice(-MAX_EVENTS);
  emit('OMEGA_FACTORY_DECOMMISSIONED',cid,record);
  emit('OMEGA_FACTORY_CAPACITY_CHANGED',cid,{factoryId:fid,status:'DECOMMISSIONED',turn:turn()});
  return record;
}

function decommissionMine(input={}) {
  const cid=canonicalCountry(input.countryId),siteId=String(input.siteId||'').trim();
  if(!cid||!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'MINE_COUNTRY_INVALID',siteId:siteId||null};
  const activePlayerCountry=playerSimulationCountryId();
  if(!activePlayerCountry)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_NOT_SELECTED',countryId:cid,siteId:siteId||null};
  if(cid!==activePlayerCountry)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:activePlayerCountry,siteId:siteId||null};
  if(!siteId)return{status:'BLOCKED',reason:'MINE_SITE_ID_REQUIRED',countryId:cid};
  if(input.confirmed!==true)return{status:'CONFIRMATION_REQUIRED',reason:'MINE_DECOMMISSION_CONFIRMATION_REQUIRED',countryId:cid,siteId};
  const resource=resourceState(cid),assets=Array.isArray(resource.mineAssets)?resource.mineAssets:[];
  const asset=assets.slice().reverse().find(row=>String(row?.siteId||'')===siteId);
  if(!asset)return{status:'NOT_FOUND',reason:'PLAYER_MINE_ASSET_NOT_FOUND',countryId:cid,siteId};
  const previousStatus=String(asset.status||'NOT_RECORDED').trim().toUpperCase();
  if(['DECOMMISSIONED','DESTROYED'].includes(previousStatus))
    return{status:'DECOMMISSIONED',countryId:cid,siteId,idempotent:true,productionStatus:'STOPPED',historyPreserved:true};
  asset.status='DECOMMISSIONED';
  asset.operationalStatus='STOPPED';
  asset.productionStatus='STOPPED';
  asset.decommissionedTurn=turn();
  asset.decommissionedDate=factoryCurrentGameDate();
  asset.decommissionedByPlayer=true;
  asset.activeProductionCycleId=null;
  asset.productionHealth={...(asset.productionHealth||{}),status:'STOPPED',currentOutput:0,
    reason:'MINE_DECOMMISSIONED_BY_PLAYER',updatedTurn:turn()};
  const network=netState(cid);
  network.mineDecommissionHistory=Array.isArray(network.mineDecommissionHistory)?network.mineDecommissionHistory:[];
  const record={status:'DECOMMISSIONED',countryId:cid,siteId,resourceId:String(asset.resourceId||''),
    mineAssetId:String(asset.id||asset.assetId||siteId),turn:turn(),date:asset.decommissionedDate,
    priorStatus:previousStatus,productionStatus:'STOPPED',historyPreserved:true,
    stockPreserved:true,authority:'OMEGA_MINE_DECOMMISSION_API_V1'};
  network.mineDecommissionHistory.push(clone(record));
  network.mineDecommissionHistory=network.mineDecommissionHistory.slice(-MAX_EVENTS);
  network.events=Array.isArray(network.events)?network.events:[];
  network.events.push(clone(record));
  network.events=network.events.slice(-MAX_EVENTS);
  emit('OMEGA_RESOURCE_MINE_DECOMMISSIONED',cid,record);
  emit('OMEGA_RESOURCE_MINE_CAPACITY_CHANGED',cid,{siteId,resourceId:record.resourceId,status:'DECOMMISSIONED',turn:turn()});
  return record;
}


function setMineOperatingStatus(input={}){
  const cid=canonicalCountry(input.countryId),siteId=String(input.siteId||'').trim(),desired=String(input.status||'').trim().toUpperCase();
  if(!cid||!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'MINE_COUNTRY_INVALID'};
  const player=playerSimulationCountryId();
  if(!player||cid!==player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:player||null};
  if(!siteId)return{status:'BLOCKED',reason:'MINE_SITE_ID_REQUIRED'};
  if(!['OPERATIONAL','STOPPED'].includes(desired))return{status:'BLOCKED',reason:'MINE_OPERATION_STATUS_INVALID',requestedStatus:desired};
  const rs=resourceState(cid),assets=Array.isArray(rs.mineAssets)?rs.mineAssets:[],sourceStatus=desired==='STOPPED'?'OPERATIONAL':'STOPPED';
  let candidates=assets.filter(a=>String(a?.siteId||'')===siteId&&String(a?.status||'').toUpperCase()===sourceStatus);
  const requestedMineIds=Array.isArray(input.mineIds)?new Set(input.mineIds.map(String)):input.mineId?new Set([String(input.mineId)]):null;
  if(requestedMineIds)candidates=candidates.filter(a=>requestedMineIds.has(String(a.mineId||a.id||'')));
  const quantity=input.quantity==null?1:num(input.quantity);
  if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>100)return{status:'BLOCKED',reason:'MINE_ACTION_COUNT_OUT_OF_RANGE',minimum:1,maximum:100};
  if(candidates.length<quantity)return{status:'BLOCKED',reason:desired==='STOPPED'?'NOT_ENOUGH_OPERATIONAL_MINES':'NOT_ENOUGH_STOPPED_MINES',requested:quantity,available:candidates.length,siteId};
  const changed=candidates.slice(-quantity),changedIds=[];
  for(const asset of changed){
    asset.status=desired;asset.operationalStatus=desired==='STOPPED'?'STOPPED':'RUNNING';
    asset.productionStatus=desired==='STOPPED'?'STOPPED':'READY_FOR_EXTRACTION';asset.activeProductionCycleId=null;
    asset.productionHealth={...(asset.productionHealth||{}),status:desired==='STOPPED'?'STOPPED':'READY',currentOutput:0,
      reason:desired==='STOPPED'?'PLAYER_PAUSED_MINE':'PLAYER_RESUMED_MINE',updatedTurn:turn()};
    if(desired==='STOPPED'){asset.stoppedTurn=turn();asset.stoppedDate=factoryCurrentGameDate();}
    else{asset.resumedTurn=turn();asset.resumedDate=factoryCurrentGameDate();}
    changedIds.push(String(asset.mineId||asset.id||''));
  }
  const n=netState(cid),history=(n.mineOperatingHistory=Array.isArray(n.mineOperatingHistory)?n.mineOperatingHistory:[]);
  const record={status:'APPLIED',countryId:cid,siteId,operationalStatus:desired,quantity:changed.length,mineIds:changedIds,turn:turn(),
    jobsTemporarilyPaused:desired==='STOPPED'?changed.reduce((sum,a)=>sum+Math.max(0,num(a.workersRequired)||0),0):0,
    historyPreserved:true,authority:'OMEGA_MINE_OPERATING_STATUS_V1'};
  history.push(clone(record));n.events.push(clone(record));n.mineOperatingHistory=history.slice(-MAX_EVENTS);n.events=n.events.slice(-MAX_EVENTS);
  emit(desired==='STOPPED'?'OMEGA_RESOURCE_MINE_STOPPED':'OMEGA_RESOURCE_MINE_RESUMED',cid,record);
  emit('OMEGA_RESOURCE_MINE_CAPACITY_CHANGED',cid,{siteId,mineIds:changedIds,quantity:changed.length,status:desired,turn:turn()});
  return record;
}

function quoteMineDemolition(input={}){
  const cid=canonicalCountry(input.countryId),siteId=String(input.siteId||'').trim();
  if(!cid||!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'MINE_COUNTRY_INVALID'};
  const player=playerSimulationCountryId();
  if(!player||cid!==player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:player||null};
  if(!siteId)return{status:'BLOCKED',reason:'MINE_SITE_ID_REQUIRED'};
  const quantity=input.quantity==null?1:num(input.quantity);
  if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>100)return{status:'BLOCKED',reason:'MINE_ACTION_COUNT_OUT_OF_RANGE',minimum:1,maximum:100};
  const rs=state()?.resource?.[cid]||{},assets=Array.isArray(rs.mineAssets)?rs.mineAssets:[];
  let candidates=assets.filter(a=>String(a?.siteId||'')===siteId&&!['DECOMMISSIONED','DESTROYED'].includes(String(a?.status||'').toUpperCase()));
  const suppliedIds=Array.isArray(input.mineIds)?new Set(input.mineIds.map(String)):input.mineId?new Set([String(input.mineId)]):null;
  if(suppliedIds)candidates=candidates.filter(a=>suppliedIds.has(String(a.mineId||a.id||'')));
  if(candidates.length<quantity)return{status:'BLOCKED',reason:'NOT_ENOUGH_MINES_TO_DESTROY',requested:quantity,available:candidates.length,siteId};
  const selected=candidates.slice(-quantity),n=rs.industrialNetwork||{},projects=Array.isArray(n.projects)?n.projects:[],site=siteById(siteId),profiles=cat()?.mineDecommissionRules||{};
  const outputs={};let jobsLost=0;
  for(const asset of selected){
    jobsLost+=Math.max(0,num(asset.workersRequired)||num(asset.workersCommitted)||0);
    const project=projects.find(p=>String(p.projectId||'')===String(asset.buildProjectId||''));
    const profile=String(asset.buildClass||project?.buildClass||mineConstructionProfile(site||{})).toUpperCase(),rule=profiles[profile]||profiles.OPEN_PIT||{};
    const count=Math.max(1,num(project?.assetCount)||1),units=(Array.isArray(project?.materialsRequired)?project.materialsRequired:[])
      .reduce((sum,m)=>sum+Math.max(0,num(m?.quantity)||0)/count,0);
    for(const [resourceId,factorValue] of Object.entries(rule.wasteOutputs||{})){
      const factor=num(factorValue);if(factor===null||factor<=0||units<=0)continue;
      const amount=Number((units*factor).toFixed(3));if(amount>0)outputs[tok(resourceId)]=(outputs[tok(resourceId)]||0)+amount;
    }
  }
  const daily=num(site?.quantitative?.production?.rate)??num(site?.simulation?.productionRate)??num(site?.simulation?.dailyProductionRate);
  return{status:'QUOTED',countryId:cid,siteId,quantity:selected.length,mineIds:selected.map(a=>String(a.mineId||a.id||'')),
    jobsLost,productionLostPerDay:daily===null?null:Number((Math.max(0,daily)*selected.reduce((sum,asset)=>sum+(String(asset.status||'').toUpperCase()==='OPERATIONAL'?Math.max(.1,num(asset.capacityMultiplier)||1):0),0)).toFixed(3)),
    wasteOutputs:Object.entries(outputs).map(([resourceId,amount])=>({resourceId,quantity:amount,unit:'SIMULATION_RESOURCE_UNIT'})),
    wasteOutputAuthority:Object.keys(outputs).length?'SIMULATED_RECOVERABLE_DEMOLITION_OUTPUT':'NO_CONSTRUCTION_LINEAGE_AVAILABLE',
    destructive:true,requiresExplicitConfirmation:true,historyPreserved:true};
}

function destroyMineAssets(input={}){
  const cid=canonicalCountry(input.countryId),siteId=String(input.siteId||'').trim();
  if(!cid||!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'MINE_COUNTRY_INVALID'};
  const player=playerSimulationCountryId();
  if(!player||cid!==player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:player||null};
  if(!siteId)return{status:'BLOCKED',reason:'MINE_SITE_ID_REQUIRED'};
  if(input.confirmed!==true)return{status:'CONFIRMATION_REQUIRED',reason:'MINE_DESTRUCTION_CONFIRMATION_REQUIRED',countryId:cid,siteId};
  const quantity=input.quantity==null?1:num(input.quantity);
  if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>100)return{status:'BLOCKED',reason:'MINE_ACTION_COUNT_OUT_OF_RANGE',minimum:1,maximum:100};
  const rs=resourceState(cid),assets=Array.isArray(rs.mineAssets)?rs.mineAssets:[];
  let active=assets.filter(a=>String(a?.siteId||'')===siteId&&!['DECOMMISSIONED','DESTROYED'].includes(String(a?.status||'').toUpperCase()));
  const requestedMineIds=Array.isArray(input.mineIds)?new Set(input.mineIds.map(String)):input.mineId?new Set([String(input.mineId)]):null;
  if(requestedMineIds)active=active.filter(a=>requestedMineIds.has(String(a.mineId||a.id||'')));
  if(active.length<quantity)return{status:'BLOCKED',reason:'NOT_ENOUGH_MINES_TO_DESTROY',requested:quantity,available:active.length,siteId};
  const selected=active.slice(-quantity),site=siteById(siteId),profiles=cat()?.mineDecommissionRules||{};
  const net=netState(cid),history=(net.mineDemolitionHistory=Array.isArray(net.mineDemolitionHistory)?net.mineDemolitionHistory:[]);
  const inv=(rs.inventory=rs.inventory&&typeof rs.inventory==='object'?rs.inventory:{});
  const warehouse=(rs.warehouse=rs.warehouse&&typeof rs.warehouse==='object'?rs.warehouse:{warehouseId:'WH-'+cid+'-RAW',countryId:cid,type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE'});
  const availableByResource=(warehouse.availableByResource=warehouse.availableByResource&&typeof warehouse.availableByResource==='object'?warehouse.availableByResource:{});
  const batches=(rs.batches=Array.isArray(rs.batches)?rs.batches:[]),lots=(rs.inventoryLots=rs.inventoryLots&&typeof rs.inventoryLots==='object'?rs.inventoryLots:{});
  const outputs={},destroyedIds=[];let jobsLost=0;
  const daily=num(site?.quantitative?.production?.rate)??num(site?.simulation?.productionRate)??num(site?.simulation?.dailyProductionRate);
  for(const asset of selected){
    const previousStatus=String(asset.status||'NOT_RECORDED').toUpperCase();
    const project=(Array.isArray(net.projects)?net.projects:[]).find(p=>String(p?.projectId||'')===String(asset.buildProjectId||''));
    const profile=String(asset.buildClass||project?.buildClass||mineConstructionProfile(site||{})).toUpperCase();
    const rule=profiles[profile]||profiles.OPEN_PIT||{},wasteRules=rule.wasteOutputs||{},projectCount=Math.max(1,num(project?.assetCount)||1);
    const constructionRows=Array.isArray(project?.materialsRequired)?project.materialsRequired:[];
    const constructionUnits=constructionRows.reduce((sum,m)=>sum+Math.max(0,num(m?.quantity)||0)/projectCount,0);
    for(const [materialIdRaw,factorRaw] of Object.entries(wasteRules)){
      const materialId=tok(materialIdRaw),factor=num(factorRaw);
      if(!materialId||factor===null||factor<=0||constructionUnits<=0)continue;
      const amount=Number((constructionUnits*factor).toFixed(3));if(amount<=0)continue;
      const existingKey=countryStockKey(inv,materialId)||materialId,warehouseKey=countryStockKey(availableByResource,materialId)||materialId;
      const batchId='MINE-DEMO-WASTE:'+cid+':'+siteId+':T'+turn()+':'+String(asset.mineId||asset.id||'MINE')+':'+materialId;
      if(batches.some(b=>String(b?.batchId||'')===batchId))continue;
      inv[existingKey]=Math.max(0,num(inv[existingKey])||0)+amount;
      availableByResource[warehouseKey]=Math.max(0,num(availableByResource[warehouseKey])||0)+amount;
      const batch={batchId,countryId:cid,siteId,sourceMineId:String(asset.mineId||asset.id||''),resourceId:materialId,quantity:amount,remainingQuantity:amount,
        unit:'SIMULATION_RESOURCE_UNIT',stage:'WAREHOUSE',status:'AVAILABLE',warehouseId:warehouse.warehouseId||('WH-'+cid+'-RAW'),createdTurn:turn(),lastMovementTurn:turn(),
        provenance:{source:'OMEGA_RESOURCE_MINE_DEMOLITION_V1',authority:'SIMULATED_RECOVERABLE_DEMOLITION_OUTPUT',buildProjectId:project?.projectId||null,buildClass:profile,simulationOnly:true}};
      batches.push(batch);lots[batchId]={...clone(batch),lastMovementType:'MINE_DEMOLITION_WASTE_RECOVERY'};outputs[materialId]=(outputs[materialId]||0)+amount;
    }
    jobsLost+=Math.max(0,num(asset.workersRequired)||num(asset.workersCommitted)||0);
    asset.status='DESTROYED';asset.operationalStatus='DESTROYED';asset.productionStatus='STOPPED';asset.destroyedTurn=turn();asset.destroyedDate=factoryCurrentGameDate();
    asset.destroyedByPlayer=true;asset.activeProductionCycleId=null;
    asset.productionHealth={...(asset.productionHealth||{}),status:'DESTROYED',currentOutput:0,reason:'PLAYER_DESTROYED_MINE',updatedTurn:turn()};
    asset.previousStatus=previousStatus;destroyedIds.push(String(asset.mineId||asset.id||''));
  }
  const productionLostPerDay=daily===null?null:Number((Math.max(0,daily)*selected.reduce((sum,asset)=>sum+(String(asset.previousStatus||asset.status||'').toUpperCase()==='OPERATIONAL'?Math.max(.1,num(asset.capacityMultiplier)||1):0),0)).toFixed(3));
  const record={status:'DESTROYED',countryId:cid,siteId,resourceId:String(selected[0]?.resourceId||''),quantity:selected.length,mineIds:destroyedIds,turn:turn(),date:factoryCurrentGameDate(),
    jobsLost,productionLostPerDay,wasteOutputs:outputs,wasteOutputAuthority:Object.keys(outputs).length?'SIMULATED_RECOVERABLE_DEMOLITION_OUTPUT':'NO_CONSTRUCTION_LINEAGE_AVAILABLE',
    historyPreserved:true,remainingStockPreserved:true,productionStatus:'STOPPED',authority:'OMEGA_MINE_DESTRUCTION_V1'};
  history.push(clone(record));net.events.push(clone(record));net.mineDemolitionHistory=history.slice(-MAX_EVENTS);net.events=net.events.slice(-MAX_EVENTS);
  emit('OMEGA_RESOURCE_MINE_DESTROYED',cid,record);
  emit('OMEGA_RESOURCE_MINE_CAPACITY_CHANGED',cid,{siteId,mineIds:destroyedIds,quantity:selected.length,status:'DESTROYED',turn:turn()});
  return clone(record);
}

function factoryCatalogDiagnostics(){
  const catalog=cat()||{},profiles=catalog.factoryProfiles||{},downstream=catalog.downstreamFactoryRecipes||{};
  const processing=processRules(),profileTypes=new Set(Object.keys(profiles));
  const allTypes=new Set([...Object.values(processing).map(x=>String(x?.factoryType||'').toUpperCase()),...Object.keys(profiles),
    ...Object.values(downstream).map(x=>String(x?.factoryType||'').toUpperCase())].filter(Boolean));
  const issues=[];
  for(const [type,profile] of Object.entries(profiles)){
    if(!profile?.iconId)issues.push({code:'FACTORY_ICON_ID_MISSING',factoryType:type});
    if(!(num(profile?.defaultCapacityPerDay)>0))issues.push({code:'FACTORY_CAPACITY_INVALID',factoryType:type});
    if(!(num(profile?.constructionCost)>0)||!(num(profile?.constructionDays)>0))issues.push({code:'FACTORY_CONSTRUCTION_PROFILE_INVALID',factoryType:type});
    if(profile?.authority!=='SIMULATED_GAMEPLAY_PROFILE'||profile?.simulationOnly!==true)issues.push({code:'FACTORY_PROFILE_PROVENANCE_MISSING',factoryType:type});
    const bom=profile?.constructionMaterials;
    if(!bom||typeof bom!=='object'||Array.isArray(bom)||!Object.keys(bom).length)issues.push({code:'FACTORY_CONSTRUCTION_BOM_MISSING',factoryType:type});
    else for(const [material,quantity] of Object.entries(bom)){
      if(!Object.keys(catalog.resourceRules||{}).some(key=>tok(key)===tok(material)))issues.push({code:'FACTORY_CONSTRUCTION_RESOURCE_UNREGISTERED',factoryType:type,resourceId:material});
      if(!(num(quantity)>0))issues.push({code:'FACTORY_CONSTRUCTION_MATERIAL_QUANTITY_INVALID',factoryType:type,resourceId:material,quantity});
    }
    const employment=profile?.employment;
    if(!(num(employment?.jobsPerFactory)>0)||employment?.simulationOnly!==true||!employment?.hiringSource)
      issues.push({code:'FACTORY_EMPLOYMENT_PROFILE_INVALID',factoryType:type});
    if(!num(profile?.constructionDays)||num(profile?.constructionDays)<=0)issues.push({code:'FACTORY_CONSTRUCTION_DURATION_INVALID',factoryType:type});
    const utilities=profile?.utilities;
    if(!utilities||num(utilities.electricityMWhPerDay)===null||num(utilities.waterM3PerDay)===null||
      num(utilities.electricityMWhPerDay)<0||num(utilities.waterM3PerDay)<0||
      !(num(utilities.electricityMWhPerDay)>0)&&!(num(utilities.waterM3PerDay)>0))
      issues.push({code:'FACTORY_UTILITY_PROFILE_INVALID',factoryType:type});
    if(!Array.isArray(profile?.requiredInfrastructure)||!profile.requiredInfrastructure.some(x=>tok(x)==='power'))
      issues.push({code:'FACTORY_POWER_INFRASTRUCTURE_REQUIREMENT_MISSING',factoryType:type});
    const jobMix=employment?.jobBreakdown;
    const jobMixTotal=jobMix&&typeof jobMix==='object'&&!Array.isArray(jobMix)?Object.values(jobMix).reduce((sum,value)=>sum+(num(value)||0),0):null;
    if(jobMixTotal===null||Math.abs(jobMixTotal-(num(employment?.jobsPerFactory)||0))>1e-6||
      Math.abs((num(employment?.coreOperatingCrew)||0)+(num(employment?.additionalDirectStaffSlots)||0)-(num(employment?.jobsPerFactory)||0))>1e-6)
      issues.push({code:'FACTORY_EMPLOYMENT_ROLE_BREAKDOWN_MISMATCH',factoryType:type,jobMixTotal,jobsPerFactory:employment?.jobsPerFactory});
    for(const tech of profile?.requiredTechnologyIds||[])if(!techRules()[String(tech).toUpperCase()])issues.push({code:'FACTORY_TECHNOLOGY_UNDEFINED',factoryType:type,technologyId:tech});
  }
  for(const [resourceId,rule] of Object.entries(processing)){
    if(!(num(rule?.cycleDays)>0))issues.push({code:'PROCESSING_CYCLE_TIME_INVALID',resourceId,cycleDays:rule?.cycleDays});
    if(rule?.quantityBasis!=='PER_SIMULATION_PRODUCTION_UNIT'||rule?.cycleTimeUnit!=='IN_GAME_DAYS')
      issues.push({code:'PROCESSING_REQUIREMENT_CONTRACT_MISSING',resourceId});
    if(rule?.requiresAllInputs!==true||rule?.missingInputPolicy!=='BLOCK_CYCLE')
      issues.push({code:'PROCESSING_ATOMIC_INPUT_POLICY_MISSING',resourceId});
    for(const [inputId,coefficient] of Object.entries(rule?.inputs||{}))
      if(!tok(inputId)||!(num(coefficient)>0))issues.push({code:'PROCESSING_INPUT_COEFFICIENT_INVALID',resourceId,inputId,coefficient});
    for(const [outputId,coefficient] of Object.entries(rule?.outputs||{}))
      if(!tok(outputId)||!(num(coefficient)>0))issues.push({code:'PROCESSING_OUTPUT_COEFFICIENT_INVALID',resourceId,outputId,coefficient});
  }
  for(const type of new Set(Object.values(processing).map(x=>String(x?.factoryType||'').toUpperCase()).filter(Boolean)))
    if(!profileTypes.has(type))issues.push({code:'PROCESSING_FACTORY_PROFILE_MISSING',factoryType:type});
  for(const [id,recipe] of Object.entries(downstream)){
    const inputs=recipe?.inputs||{},outputs=recipe?.outputs||{};
    if(String(recipe?.recipeId||'')!==id)issues.push({code:'RECIPE_ID_KEY_MISMATCH',recipeId:id});
    if(!(num(recipe?.cycleDays)>0))issues.push({code:'DOWNSTREAM_CYCLE_TIME_INVALID',recipeId:id,cycleDays:recipe?.cycleDays});
    if(recipe?.quantityBasis!=='PER_SIMULATION_PRODUCTION_UNIT'||recipe?.cycleTimeUnit!=='IN_GAME_DAYS')
      issues.push({code:'DOWNSTREAM_REQUIREMENT_CONTRACT_MISSING',recipeId:id});
    if(!profiles[String(recipe?.factoryType||'').toUpperCase()])issues.push({code:'DOWNSTREAM_FACTORY_PROFILE_MISSING',recipeId:id,factoryType:recipe?.factoryType});
    if(Object.keys(inputs).length<2||Object.keys(outputs).length<1)issues.push({code:'DOWNSTREAM_RECIPE_SHAPE_INVALID',recipeId:id});
    for(const [resourceId,coefficient] of Object.entries(inputs))if(!tok(resourceId)||!(num(coefficient)>0))issues.push({code:'RECIPE_INPUT_COEFFICIENT_INVALID',recipeId:id,resourceId,coefficient});
    for(const [resourceId,coefficient] of Object.entries(outputs))if(!tok(resourceId)||!(num(coefficient)>0))issues.push({code:'RECIPE_OUTPUT_COEFFICIENT_INVALID',recipeId:id,resourceId,coefficient});
    const inputTotal=Object.values(inputs).reduce((sum,x)=>sum+(num(x)||0),0);
    const outputTotal=Object.values(outputs).reduce((sum,x)=>sum+(num(x)||0),0);
    if(Math.abs(inputTotal-outputTotal)>1e-6)issues.push({code:'RECIPE_SIMULATION_MASS_BALANCE_MISMATCH',recipeId:id,inputTotal,outputTotal});
    if(recipe?.simulationOnly!==true||recipe?.recipeAuthority!=='SIMULATED_GAMEPLAY_RULE')issues.push({code:'RECIPE_PROVENANCE_MISSING',recipeId:id});
  }
  const producerIds=new Set([
    ...Object.values(processing).flatMap(rule=>Object.keys(rule?.outputs||{})),
    ...Object.values(downstream).flatMap(rule=>Object.keys(rule?.outputs||{}))
  ].map(tok));
  const knownRawIds=new Set([
    ...Object.keys(catalog.resourceRules||{}),
    ...Object.values(processing).flatMap(rule=>Object.keys(rule?.inputs||{}))
  ].map(tok));
  const declaredExternalIds=new Set(Object.keys(catalog.externalInputSources||{}).map(tok));
  for(const [recipeId,recipe] of Object.entries(downstream)){
    for(const resourceId of Object.keys(recipe?.inputs||{})){
      const rid=tok(resourceId);
      if(!producerIds.has(rid)&&!knownRawIds.has(rid)&&!declaredExternalIds.has(rid))
        issues.push({code:'RECIPE_INPUT_SOURCE_UNREGISTERED',recipeId,resourceId});
      const external=Object.keys(catalog.externalInputSources||{}).find(key=>tok(key)===rid);
      if(external&&catalog.externalInputSources[external]?.requiresRecordedBatch!==true)
        issues.push({code:'EXTERNAL_RECIPE_INPUT_MUST_REQUIRE_RECORDED_STOCK',recipeId,resourceId});
      if(external&&catalog.externalInputSources[external]?.autoGenerateStock===true)
        issues.push({code:'EXTERNAL_RECIPE_INPUT_MUST_NOT_AUTOFABRICATE_STOCK',recipeId,resourceId});
    }
  }
  for(const [type,profile] of Object.entries(profiles)){
    if(profile?.defaultRecipeId&&!downstream[profile.defaultRecipeId])issues.push({code:'FACTORY_DEFAULT_RECIPE_MISSING',factoryType:type,recipeId:profile.defaultRecipeId});
  }
  return{status:issues.length?'DEGRADED':'HEALTHY',factoryTypeCount:allTypes.size,processingRuleCount:Object.keys(processing).length,
    legacyProcessingFactoryTypeCount:new Set(Object.values(processing).map(x=>String(x?.factoryType||'').toUpperCase())).size,
    profileCount:Object.keys(profiles).length,downstreamRecipeCount:Object.keys(downstream).length,categoryCount:(catalog.factoryCatalogPolicy?.categoryOrder||[]).length,
    issues};
}
function gameplayPipelineDiagnostics(countryScope){
  const sites=masterSites();
  // UI callers that inspect one selected country must not synchronously scan every
  // country's ledger on the WebView main thread. Keep the no-argument global contract
  // intact for world diagnostics and aggregate pipeline verification.
  const scopeText=countryScope==null?'':String(countryScope).trim();
  const hasScope=scopeText.length>0;
  const resolvedScope=hasScope?canonicalCountry(scopeText):null;
  const scopedCountry=resolvedScope&&/^[A-Z]{3}$/.test(resolvedScope)?resolvedScope:null;
  // A supplied but unresolvable scope must fail closed instead of silently reverting
  // to the expensive global scan.
  const countries=hasScope?(scopedCountry?[scopedCountry]:[]):runtimeCountryIds();
  const siteCounts=Object.create(null);
  for(const site of sites){
    const cid=canonicalCountry(site?.countryId);
    if(cid)siteCounts[cid]=(siteCounts[cid]||0)+1;
  }
  const isCurrentlyBlocked=flow=>{
    const status=String(flow?.status||'').toUpperCase();
    return status.includes('BLOCKED')||status==='PUBLICATION_ATTEMPTED'||
      status==='EXTRACTED_AWAITING_ROUTE'||status==='EXTRACTED_AWAITING_FACTORY';
  };
  const perCountry=countries.map(c=>{
    const flows=siteFlowRows(c),network=netState(c),stages={};
    let dispatched=0,processed=0,marketPublished=0,treasuryReceipts=0,blocked=0,awaitingTransportCapacity=0;
    const blockedFlows=[],awaitingCapacityFlows=[];
    for(const flow of flows){
      const flowStages=Array.isArray(flow?.stages)?flow.stages:[];
      let hasDispatched=false,hasProcessed=false,hasMarketPublication=false;
      for(const step of flowStages){
        stages[step.stage]=(stages[step.stage]||0)+1;
        const stage=String(step.stage||'').toUpperCase(),status=String(step.status||'').toUpperCase();
        if(stage==='TRANSPORT'&&['IN_TRANSIT','IN_TRANSIT_TO_RAW_WAREHOUSE','IN_TRANSIT_TO_WAREHOUSE','IN_TRANSIT_TO_FACTORY','DELIVERED'].includes(status))hasDispatched=true;
        if(stage==='PROCESSING'&&status==='COMPLETED')hasProcessed=true;
        if(stage==='MARKET'&&status==='PUBLISHED')hasMarketPublication=true;
      }
      if(hasDispatched)dispatched++;
      if(hasProcessed)processed++;
      if(hasMarketPublication)marketPublished++;
      treasuryReceipts+=(Array.isArray(flow?.treasurySettlements)?flow.treasurySettlements.length:0);
      if(String(flow?.status||'').toUpperCase()==='AWAITING_CAPACITY'){
        awaitingTransportCapacity++;
        awaitingCapacityFlows.push({siteId:flow.siteId,resourceId:flow.resourceId,batchId:flow.batchId,
          reason:flow.transportQueueReason||'TRANSPORT_CAPACITY_EXHAUSTED'});
      }
      if(isCurrentlyBlocked(flow)){
        blocked++;
        blockedFlows.push({siteId:flow.siteId,resourceId:flow.resourceId,batchId:flow.batchId,status:flow.status,
          blockReason:flow.blockReason||flow.lastResidualBlockReason||null,
          stages:flowStages.filter(s=>['BLOCKED','RESIDUAL_BLOCKED'].includes(s.status))
            .map(s=>({stage:s.stage,status:s.status,reason:s.reason||null,detail:s.detail||null}))});
      }
    }
    const shipments=Array.isArray(network.shipments)?network.shipments:[];
    return{countryId:c,registrySiteCount:siteCounts[c]||0,extractionFlows:flows.length,dispatched,processed,marketPublished,
      treasuryReceipts,blocked,blockedFlows,awaitingTransportCapacity,awaitingCapacityFlows,shipmentCount:shipments.length,stages};
  });
  return{contract:'OMEGA_SITE_FLOW_PIPELINE_V1',version:VERSION,turn:turn(),registrySiteCount:sites.length,
    diagnosticScope:scopedCountry||(hasScope?'UNRESOLVED':'GLOBAL'),countryCount:countries.length,
    flowCount:perCountry.reduce((n,x)=>n+x.extractionFlows,0),dispatched:perCountry.reduce((n,x)=>n+x.dispatched,0),
    processed:perCountry.reduce((n,x)=>n+x.processed,0),marketPublished:perCountry.reduce((n,x)=>n+x.marketPublished,0),
    treasuryReceipts:perCountry.reduce((n,x)=>n+x.treasuryReceipts,0),blocked:perCountry.reduce((n,x)=>n+x.blocked,0),
    awaitingTransportCapacity:perCountry.reduce((n,x)=>n+x.awaitingTransportCapacity,0),perCountry};
}
function api(){
  return Object.freeze({VERSION,loadCatalog,loadSiteLogisticsRoutes,getTransportFleet,setTransportFleet,previewSiteTransport,planExtraction,planShipment,dispatchShipment,dispatchFactoryInputShipment,advanceShipments,quoteMineProject,startMineProject,startFactoryProject,startInfrastructureProject,startPadmaCorridorProject,advanceProjects,startTechnologyProject,executeFactoryCycle,executeSitePipeline,diagnostics,gameplayPipelineDiagnostics,factoryCatalogDiagnostics,factoryProductionRequirements,factoryProductionStatus,decommissionFactory,decommissionMine,setMineOperatingStatus,quoteMineDemolition,destroyMineAssets,startFactoryProductionCycle,transferFactoryInputsFromWarehouse,processPendingFactoryInputs,factoryUtilityDiagnostics,factoryConstructionMaterialQuote,reconcileFactoryEmployment,normalizeInfrastructure,candidateFactories,recipeFor,processPendingFactoryInputs,resourceMethod,buildRoute});
}
g.Omega=g.Omega||{};g.Omega.ResourceIndustrialNetwork=api();g.OmegaResourceIndustrialNetwork=g.Omega.ResourceIndustrialNetwork;

function boot(){
  loadCatalog().then(()=>{emit('OMEGA_RESOURCE_INDUSTRIAL_NETWORK_READY','GLOBAL',{version:VERSION,catalogResourceRules:Object.keys(rules()).length,factoryRules:Object.keys(processRules()).length})}).catch(()=>{});
  if(typeof g.addEventListener==='function'){
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',async()=>{
      const countryId=playerSimulationCountryId();
      if(!countryId)return {status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
      await loadCatalog();
      try{
        await advanceShipments(countryId);
        await advanceProjects(countryId);
        await processPendingFactoryInputs(countryId);
        reconcileFactoryEmployment(countryId);
        return {status:'COMPLETED',countryId,turn:turn()};
      }catch(error){
        throw new Error('INDUSTRIAL_TURN_FAILED:'+countryId+':'+String(error?.message||error));
      }
    });
    g.addEventListener('OMEGA_RESOURCE_EXTRACTION_COMPLETED',onExtractionCommitted);
    g.addEventListener('OMEGA_RESOURCE_EXTRACTION_BLOCKED',onExtractionBlocked);
    g.addEventListener('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',onFinishedGoodsRegistered);
    g.addEventListener('OMEGA_RESOURCE_FINISHED_GOODS_ECONOMY_REGISTERED',onEconomyMarketPublication);
    g.addEventListener('OMEGA_RESOURCE_DOMESTIC_SALE_SETTLED',onDomesticSaleSettled);
    g.addEventListener('OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED',onExtractionFiscalPosted);
    g.addEventListener('OMEGA_RESOURCE_TRADE_RECONCILED',onTreasurySettlement);
    g.addEventListener('OMEGA_READY',()=>{loadCatalog();const cid=playerSimulationCountryId();if(cid)void loadSiteLogisticsRoutes(cid);});
    g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>{loadCatalog();const cid=playerSimulationCountryId();if(cid)void loadSiteLogisticsRoutes(cid);});
  }
}
boot();

})(typeof window!=='undefined'?window:globalThis);
