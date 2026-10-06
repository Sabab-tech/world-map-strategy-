/* OMEGA RESOURCE RESEARCH + TECHNOLOGY TRANSFER RUNTIME v1.0.0
 * Research first. Technology may then be transferred from an already-capable country.
 * This runtime never mutates reserves directly. It only creates capabilities that the
 * production/resource engines may consume.
 */
(function(g){
'use strict';
const VERSION='1.0.0',MAX_PROJECTS=512,MAX_CAPABILITIES=1024,MAX_EVENTS=2048;
const clone=(v,seen=new WeakMap())=>{
  if(v===null||typeof v!=='object')return v;
  if(seen.has(v))return seen.get(v);
  if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
  const o={};seen.set(v,o);
  for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);
  return o;
};
const num=v=>{if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v)))return Number(v);return null;};
const id=v=>String(v??'').trim().toUpperCase();
const tok=v=>String(v??'').trim().toLowerCase().replace(/[\\s-]+/g,'_');
const state=()=>g.Game?.state||g.gameState||{};
const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
const canonicalCountry=v=>{
  const raw=String(v??'').trim();if(!raw)return null;
  try{
    const bridge=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
    const hit=bridge?.resolveCountry?.(raw);if(hit?.id)return id(hit.id);
  }catch(_){}
  return id(raw);
};
const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
function catalogData(){return g.OmegaResourceTechnologyCatalogData||g.Omega?.ResourceTechnologyCatalogData||null;}
let catalogPromise=null;
async function loadCatalog(){
  const inline=catalogData();if(inline)return{status:'READY',data:inline,reused:true};
  if(catalogPromise)return catalogPromise;
  catalogPromise=(async()=>{
    try{
      if(typeof fetch!=='function')throw new Error('FETCH_UNAVAILABLE');
      const res=await fetch('resource_technology_catalog_v1.json',{cache:'no-store'});
      if(!res?.ok)throw new Error('RESOURCE_TECHNOLOGY_CATALOG_FETCH_FAILED');
      const data=await res.json();
      g.OmegaResourceTechnologyCatalogData=data;g.Omega=g.Omega||{};g.Omega.ResourceTechnologyCatalogData=data;
      return{status:'READY',data};
    }catch(e){return{status:'FAILED',reason:String(e?.message||e)}}
    finally{catalogPromise=null;}
  })();
  return catalogPromise;
}
function technologies(){
  const data=catalogData();return Array.isArray(data?.technologies)?data.technologies:[];
}
function technology(technologyId){
  const wanted=tok(technologyId);
  return technologies().find(x=>tok(x?.technologyId)===wanted)||null;
}
function txArray(tx,path){
  const v=tx.get(path);return Array.isArray(v)?clone(v):[];
}
function txMap(tx,path){
  const v=tx.get(path);return v&&typeof v==='object'&&!Array.isArray(v)?clone(v):{};
}
function pushBounded(rows,row,max){rows.push(row);return rows.slice(-max);}
function stateCountrySnapshot(countryId){
  const c=canonicalCountry(countryId),s=state(),r=s.resource?.[c]||{};
  return{country:r,technology:s.technology?.[c]||s.technology||{},foreign:s.foreign?.[c]||s.foreign||{}};
}
function researchRateFromContext(ctx,c){
  const snap=stateCountrySnapshot(c);
  const t=(ctx?.stateTransaction?.get?.('technology')||snap.technology||{});
  const r=t?.research||t?.r_and_d||t?.rnd||{};
  for(const k of ['researchEfficiency','efficiency','rate','researchRate']){const x=num(r?.[k]);if(x!==null&&x>0)return Math.max(.1,Math.min(4,x));}
  const index=num(r?.index??t?.innovation?.index);
  if(index!==null)return Math.max(.1,Math.min(4,index/60));
  const programs=num(r?.programs);
  if(programs!==null)return Math.max(.1,Math.min(4,.5+programs*.1));
  const rnd=num(t?.rnd);
  if(rnd!==null)return Math.max(.1,Math.min(4,rnd/20));
  return 1;
}
function relationValue(countryId,donorId,tx){
  const c=canonicalCountry(countryId),d=canonicalCountry(donorId);
  const foreign=tx?.get?.('foreign')||state().foreign?.[c]||state().foreign||{};
  const rel=foreign?.relations||foreign?.relationship||{};
  const v=num(rel?.[d]??rel?.[String(d).toUpperCase()]);
  return v;
}
function capabilityList(tx){return txArray(tx,'resource.technologyCapabilities');}
function capabilityKey(row){
  return [tok(row?.technologyId),tok(row?.targetSiteId||'*'),tok(row?.targetResourceId||'*'),tok(row?.targetSiteType||'*')].join('|');
}
function hasCapability(tx,technologyId,target={}){
  const wanted=tok(technologyId),siteId=tok(target?.siteId),resourceId=tok(target?.resourceId),siteType=tok(target?.siteType);
  return capabilityList(tx).some(c=>{
    if(tok(c?.technologyId)!==wanted)return false;
    if(c?.targetSiteId&&tok(c.targetSiteId)!=='*'&&tok(c.targetSiteId)!==siteId)return false;
    if(c?.targetResourceId&&tok(c.targetResourceId)!=='*'&&tok(c.targetResourceId)!==resourceId)return false;
    if(c?.targetSiteType&&tok(c.targetSiteType)!=='*'&&tok(c.targetSiteType)!==siteType)return false;
    return true;
  });
}
function hasCapabilityInState(countryId,technologyId,target={}){
  const c=canonicalCountry(countryId),r=state().resource?.[c]||{},caps=Array.isArray(r.technologyCapabilities)?r.technologyCapabilities:[];
  const wanted=tok(technologyId),siteId=tok(target?.siteId),resourceId=tok(target?.resourceId),siteType=tok(target?.siteType);
  return caps.some(x=>{
    if(tok(x?.technologyId)!==wanted)return false;
    if(x?.targetSiteId&&tok(x.targetSiteId)!=='*'&&tok(x.targetSiteId)!==siteId)return false;
    if(x?.targetResourceId&&tok(x.targetResourceId)!=='*'&&tok(x.targetResourceId)!==resourceId)return false;
    if(x?.targetSiteType&&tok(x.targetSiteType)!=='*'&&tok(x.targetSiteType)!==siteType)return false;
    return true;
  });
}
function prerequisitesMet(tx,tech,target){
  const req=Array.isArray(tech?.prerequisites)?tech.prerequisites:[];
  return req.every(x=>hasCapability(tx,x,target));
}
function applicable(tech,{resourceId,siteType}={}){
  const r=tok(resourceId),s=tok(siteType),rs=Array.isArray(tech?.resourceIds)?tech.resourceIds.map(tok):['*'],ss=Array.isArray(tech?.siteTypes)?tech.siteTypes.map(tok):['*'];
  return (rs.includes('*')||rs.includes(r))&&(ss.includes('*')||ss.includes(s));
}
function makeCapability(c,tech,payload,sourceType){
  const siteId=payload?.targetSiteId||null,resourceId=payload?.targetResourceId||null,siteType=payload?.targetSiteType||null;
  return{
    capabilityId:'TECHCAP:'+id(c)+':'+capabilityKey({technologyId:tech.technologyId,targetSiteId:siteId,targetResourceId:resourceId,targetSiteType:siteType}),
    technologyId:tech.technologyId,
    technologyName:tech.name,
    scope:tech.scope||'SITE',
    countryId:id(c),
    targetSiteId:siteId,
    targetResourceId:resourceId,
    targetSiteType:siteType,
    sourceType,
    donorCountryId:sourceType==='IMPORTED'?canonicalCountry(payload?.donorCountryId):null,
    unlockedTurn:turn(),
    effectiveTurn:turn(),
    effects:clone(tech.effects||{}),
    authority:'OMEGA_SCENARIO_TECHNOLOGY_RULES'
  };
}
function startResearchTx(ctx){
  const c=canonicalCountry(ctx.countryId),p=ctx.payload||{},tid=String(p.technologyId||'').trim(),tech=technology(tid);
  if(!tech)return{status:'BLOCKED',reason:'TECHNOLOGY_NOT_FOUND'};
  const resourceId=p.targetResourceId?tok(p.targetResourceId):null,siteType=p.targetSiteType?tok(p.targetSiteType):null;
  if(!applicable(tech,{resourceId,siteType}))return{status:'BLOCKED',reason:'TECHNOLOGY_NOT_APPLICABLE_TO_TARGET'};
  if(!prerequisitesMet(ctx.stateTransaction,tech,{siteId:p.targetSiteId,resourceId,siteType}))return{status:'BLOCKED',reason:'TECHNOLOGY_PREREQUISITE_MISSING'};
  if(hasCapability(ctx.stateTransaction,tech.technologyId,{siteId:p.targetSiteId,resourceId,siteType}))return{status:'ALREADY_AVAILABLE',technologyId:tech.technologyId};
  const rows=txArray(ctx.stateTransaction,'resource.technologyResearchProjects');
  if(rows.some(x=>['REQUESTED','IN_PROGRESS'].includes(String(x?.status||'').toUpperCase())&&tok(x?.technologyId)===tok(tech.technologyId)&&tok(x?.targetSiteId||'*')===tok(p.targetSiteId||'*')&&tok(x?.targetResourceId||'*')===tok(resourceId||'*')))return{status:'ALREADY_IN_PROGRESS',technologyId:tech.technologyId};
  const projectId='RPROJ:'+id(c)+':'+tech.technologyId+':T'+turn()+':'+String(rows.length+1);
  const required=Math.max(1,num(tech.researchTurns)??1);
  const rate=researchRateFromContext(ctx,c);
  rows.push({
    projectId,requestId:p.requestId||projectId,countryId:id(c),technologyId:tech.technologyId,technologyName:tech.name,
    targetSiteId:p.targetSiteId||null,targetResourceId:resourceId,targetSiteType:siteType,status:'IN_PROGRESS',
    sourceType:'RESEARCH',startedTurn:turn(),progress:0,progressUnits:0,requiredUnits:required,researchRate:rate,
    authority:'OMEGA_RESOURCE_RESEARCH_RUNTIME'
  });
  ctx.stateTransaction.set('resource.technologyResearchProjects',rows.slice(-MAX_PROJECTS));
  emit('OMEGA_RESOURCE_TECHNOLOGY_RESEARCH_STARTED',c,rows[rows.length-1]);
  return{status:'STARTED',project:rows[rows.length-1]};
}
function importTechnologyTx(ctx){
  const c=canonicalCountry(ctx.countryId),p=ctx.payload||{},donor=canonicalCountry(p.donorCountryId),tid=String(p.technologyId||'').trim(),tech=technology(tid);
  if(!tech||!donor)return{status:'BLOCKED',reason:!tech?'TECHNOLOGY_NOT_FOUND':'DONOR_COUNTRY_REQUIRED'};
  if(c===donor)return{status:'BLOCKED',reason:'DONOR_MUST_BE_FOREIGN'};
  const target={siteId:p.targetSiteId,resourceId:p.targetResourceId?tok(p.targetResourceId):null,siteType:p.targetSiteType?tok(p.targetSiteType):null};
  if(!applicable(tech,target))return{status:'BLOCKED',reason:'TECHNOLOGY_NOT_APPLICABLE_TO_TARGET'};
  if(!hasCapabilityInState(donor,tech.technologyId,target))return{status:'BLOCKED',reason:'DONOR_TECHNOLOGY_NOT_AVAILABLE'};
  if(hasCapability(ctx.stateTransaction,tech.technologyId,target))return{status:'ALREADY_AVAILABLE',technologyId:tech.technologyId};
  const minRel=num(tech?.minimumRelation);
  if(minRel!==null){
    const rel=relationValue(c,donor,ctx.stateTransaction);
    if(rel===null||rel<minRel)return{status:'BLOCKED',reason:'BILATERAL_RELATION_TOO_LOW',requiredRelation:minRel,relation:rel};
  }
  const rows=txArray(ctx.stateTransaction,'resource.technologyTransfers');
  if(rows.some(x=>['REQUESTED','IN_PROGRESS'].includes(String(x?.status||'').toUpperCase())&&tok(x?.technologyId)===tok(tech.technologyId)&&id(x?.donorCountryId)===donor&&tok(x?.targetSiteId||'*')===tok(p.targetSiteId||'*')))return{status:'ALREADY_IN_PROGRESS',technologyId:tech.technologyId};
  const projectId='TIMP:'+id(c)+':'+donor+':'+tech.technologyId+':T'+turn()+':'+String(rows.length+1);
  const required=Math.max(1,num(tech.transferTurns)??1);
  rows.push({
    projectId,requestId:p.requestId||projectId,countryId:id(c),technologyId:tech.technologyId,technologyName:tech.name,
    donorCountryId:donor,targetSiteId:p.targetSiteId||null,targetResourceId:target.resourceId,targetSiteType:target.siteType,
    status:'IN_PROGRESS',sourceType:'IMPORTED',startedTurn:turn(),progress:0,progressUnits:0,requiredUnits:required,
    transferRate:1,authority:'OMEGA_RESOURCE_RESEARCH_RUNTIME'
  });
  ctx.stateTransaction.set('resource.technologyTransfers',rows.slice(-MAX_PROJECTS));
  emit('OMEGA_RESOURCE_TECHNOLOGY_TRANSFER_STARTED',c,rows[rows.length-1]);
  return{status:'STARTED',project:rows[rows.length-1]};
}
function completeCapability(tx,c,row,sourceType){
  const tech=technology(row?.technologyId);if(!tech)return null;
  const caps=capabilityList(tx),cap=makeCapability(c,tech,row,sourceType),key=capabilityKey(cap);
  const idx=caps.findIndex(x=>capabilityKey(x)===key);
  if(idx>=0)caps[idx]=cap;else caps.push(cap);
  tx.set('resource.technologyCapabilities',caps.slice(-MAX_CAPABILITIES));
  return cap;
}
function tickTx(ctx){
  const c=canonicalCountry(ctx.countryId),projects=txArray(ctx.stateTransaction,'resource.technologyResearchProjects'),transfers=txArray(ctx.stateTransaction,'resource.technologyTransfers');
  let researchCompleted=0,transferCompleted=0,changed=0,blocked=0;
  for(let i=0;i<projects.length;i++){
    const p=projects[i];if(id(p?.countryId)!==id(c)||!['REQUESTED','IN_PROGRESS'].includes(String(p?.status||'').toUpperCase()))continue;
    const rate=Math.max(.1,num(p.researchRate)||1);
    const units=Math.min(1000,(num(p.progressUnits)||0)+rate),required=Math.max(1,num(p.requiredUnits)||1);
    const next={...p,progressUnits:units,progress:Math.min(100,Math.floor(units/required*100)),lastProgressTurn:turn()};
    if(units+1e-9>=required){next.progress=100;next.status='COMPLETED';next.completedTurn=turn();const cap=completeCapability(ctx.stateTransaction,c,next,'RESEARCH');next.capabilityId=cap?.capabilityId||null;researchCompleted++;emit('OMEGA_RESOURCE_TECHNOLOGY_RESEARCH_COMPLETED',c,{project:next,capability:cap});}
    projects[i]=next;changed++;
  }
  for(let i=0;i<transfers.length;i++){
    const p=transfers[i];if(id(p?.countryId)!==id(c)||!['REQUESTED','IN_PROGRESS'].includes(String(p?.status||'').toUpperCase()))continue;
    if(!hasCapabilityInState(p.donorCountryId,p.technologyId,{siteId:p.targetSiteId,resourceId:p.targetResourceId,siteType:p.targetSiteType})){transfers[i]={...p,status:'BLOCKED',blockedTurn:turn(),reason:'DONOR_TECHNOLOGY_NO_LONGER_AVAILABLE'};blocked++;changed++;continue;}
    const rate=Math.max(.1,num(p.transferRate)||1),units=Math.min(1000,(num(p.progressUnits)||0)+rate),required=Math.max(1,num(p.requiredUnits)||1);
    const next={...p,progressUnits:units,progress:Math.min(100,Math.floor(units/required*100)),lastProgressTurn:turn()};
    if(units+1e-9>=required){next.progress=100;next.status='COMPLETED';next.completedTurn=turn();const cap=completeCapability(ctx.stateTransaction,c,next,'IMPORTED');next.capabilityId=cap?.capabilityId||null;transferCompleted++;emit('OMEGA_RESOURCE_TECHNOLOGY_TRANSFER_COMPLETED',c,{project:next,capability:cap});}
    transfers[i]=next;changed++;
  }
  ctx.stateTransaction.set('resource.technologyResearchProjects',projects.slice(-MAX_PROJECTS));
  ctx.stateTransaction.set('resource.technologyTransfers',transfers.slice(-MAX_PROJECTS));
  return{status:'COMPLETED',countryId:id(c),turn:turn(),changed,researchCompleted,transferCompleted,blocked};
}
function effectMatches(row,tech,target){
  if(!row||!tech||!applicable(tech,target))return false;
  const siteId=tok(target?.siteId),resourceId=tok(target?.resourceId),siteType=tok(target?.siteType);
  if(row.targetSiteId&&tok(row.targetSiteId)!=='*'&&tok(row.targetSiteId)!==siteId)return false;
  if(row.targetResourceId&&tok(row.targetResourceId)!=='*'&&tok(row.targetResourceId)!==resourceId)return false;
  if(row.targetSiteType&&tok(row.targetSiteType)!=='*'&&tok(row.targetSiteType)!==siteType)return false;
  return true;
}
function getEngineeringEffect(countryId,siteId,resourceId,siteType){
  const c=canonicalCountry(countryId),caps=Array.isArray(state().resource?.[c]?.technologyCapabilities)?state().resource[c].technologyCapabilities:[];
  const out={capacityMultiplier:1,recoveryAdd:0,utilizationAdd:0,maintenanceMultiplier:1,declineMultiplier:1,outputMultiplier:1,explorationEfficiencyMultiplier:1,technologies:[],authority:'NONE'};
  for(const row of caps){
    const tech=technology(row?.technologyId);if(!effectMatches(row,tech,{siteId,resourceId,siteType}))continue;
    const e=tech.effects||row.effects||{};
    if(num(e.capacityMultiplier)!==null)out.capacityMultiplier*=Math.max(.1,num(e.capacityMultiplier));
    if(num(e.recoveryAdd)!==null)out.recoveryAdd+=num(e.recoveryAdd);
    if(num(e.utilizationAdd)!==null)out.utilizationAdd+=num(e.utilizationAdd);
    if(num(e.maintenanceMultiplier)!==null)out.maintenanceMultiplier*=Math.max(.1,num(e.maintenanceMultiplier));
    if(num(e.declineMultiplier)!==null)out.declineMultiplier*=Math.max(.1,num(e.declineMultiplier));
    if(num(e.outputMultiplier)!==null)out.outputMultiplier*=Math.max(.1,num(e.outputMultiplier));
    if(num(e.explorationEfficiencyMultiplier)!==null)out.explorationEfficiencyMultiplier*=Math.max(.1,num(e.explorationEfficiencyMultiplier));
    out.technologies.push({technologyId:tech.technologyId,sourceType:row.sourceType,donorCountryId:row.donorCountryId||null,effects:clone(e)});
  }
  if(out.technologies.length)out.authority='UNLOCKED_CAPABILITIES';
  out.capacityMultiplier=Math.min(3,Math.max(.25,out.capacityMultiplier));
  out.recoveryAdd=Math.max(-.5,Math.min(.5,out.recoveryAdd));
  out.utilizationAdd=Math.max(-.5,Math.min(.5,out.utilizationAdd));
  out.maintenanceMultiplier=Math.min(2,Math.max(.25,out.maintenanceMultiplier));
  out.declineMultiplier=Math.min(2,Math.max(.25,out.declineMultiplier));
  out.outputMultiplier=Math.min(3,Math.max(.25,out.outputMultiplier));
  return out;
}
function emit(type,c,payload){
  const m=interop(),cc=canonicalCountry(c),detail=Object.assign({countryId:cc},clone(payload));
  try{if(m?.emitEvent)return m.emitEvent(type,cc,'resource-research-runtime',detail,{turn:turn(),correlationId:payload?.requestId||payload?.projectId||null});}catch(_){}
  try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function'){g.dispatchEvent(new g.CustomEvent(type,{detail:{eventType:type,countryId:cc,payload:detail,source:'resource-research-runtime'}}));return true;}}catch(_){}
  return null;
}
function dispatch(type,c,payload={}){
  const m=interop();if(!m?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
  try{return m.dispatchCommand('resource',type,canonicalCountry(c),clone(payload),{turn:turn(),commandType:type,correlationId:payload?.requestId||null});}
  catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
}
function register(){
  const m=interop();if(!m?.registerCommandHandler)return false;
  try{
    m.registerAction?.('OMEGA_RESOURCE_RESEARCH_START',{actionId:'OMEGA_RESOURCE_RESEARCH_START',stateOwnerMinistry:'resource',authority:'OMEGA_RESOURCE_RESEARCH_RUNTIME'});
    m.registerAction?.('OMEGA_RESOURCE_TECHNOLOGY_IMPORT',{actionId:'OMEGA_RESOURCE_TECHNOLOGY_IMPORT',stateOwnerMinistry:'resource',authority:'OMEGA_RESOURCE_RESEARCH_RUNTIME'});
    m.registerAction?.('OMEGA_RESOURCE_RESEARCH_TICK',{actionId:'OMEGA_RESOURCE_RESEARCH_TICK',stateOwnerMinistry:'resource',authority:'OMEGA_RESOURCE_RESEARCH_RUNTIME'});
    m.registerCommandHandler('OMEGA_RESOURCE_RESEARCH_START','resource',(cmd,ctx)=>startResearchTx({...ctx,payload:cmd?.payload||cmd?.data||{}}));
    m.registerCommandHandler('OMEGA_RESOURCE_TECHNOLOGY_IMPORT','resource',(cmd,ctx)=>importTechnologyTx({...ctx,payload:cmd?.payload||cmd?.data||{}}));
    m.registerCommandHandler('OMEGA_RESOURCE_RESEARCH_TICK','resource',(cmd,ctx)=>tickTx(ctx));
    g.__omegaResourceResearchHandlers=true;return true;
  }catch(_){return false;}
}
function processCountry(c){
  register();return dispatch('OMEGA_RESOURCE_RESEARCH_TICK',c,{countryId:canonicalCountry(c),correlationId:'RESOURCE-RESEARCH-TICK-'+turn()+'-'+canonicalCountry(c)});
}
function countryIds(){
  const out=new Set(),s=state();
  Object.keys(s.resource||{}).forEach(c=>{const x=canonicalCountry(c);if(x)out.add(x);});
  Object.keys(s.technology||{}).forEach(c=>{const x=canonicalCountry(c);if(x)out.add(x);});
  try{const profiles=g.ResourceMinistryEngine?.countryProfiles||{};Object.keys(profiles).forEach(c=>out.add(canonicalCountry(c)));}catch(_){}
  return [...out].filter(Boolean).sort();
}
function processAll(){
  const s=state(),active=countryIds().filter(c=>{
    const r=s.resource?.[c]||{};
    const p=Array.isArray(r.technologyResearchProjects)&&r.technologyResearchProjects.some(x=>['REQUESTED','IN_PROGRESS'].includes(String(x?.status||'').toUpperCase()));
    const t=Array.isArray(r.technologyTransfers)&&r.technologyTransfers.some(x=>['REQUESTED','IN_PROGRESS'].includes(String(x?.status||'').toUpperCase()));
    return p||t;
  });
  return{status:'COMPLETED',turn:turn(),countryCount:active.length,results:active.map(c=>({countryId:c,result:processCountry(c)}))};
}
function diagnostics(){
  const cs=countryIds(),s=state();let projects=0,imports=0,caps=0;
  for(const c of cs){const r=s.resource?.[c]||{};projects+=Array.isArray(r.technologyResearchProjects)?r.technologyResearchProjects.filter(x=>['REQUESTED','IN_PROGRESS'].includes(String(x?.status||'').toUpperCase())).length:0;imports+=Array.isArray(r.technologyTransfers)?r.technologyTransfers.filter(x=>['REQUESTED','IN_PROGRESS'].includes(String(x?.status||'').toUpperCase())).length:0;caps+=Array.isArray(r.technologyCapabilities)?r.technologyCapabilities.length:0;}
  return{version:VERSION,handlersReady:!!g.__omegaResourceResearchHandlers,catalogLoaded:technologies().length>0,catalogTechnologyCount:technologies().length,countryCount:cs.length,activeResearchProjects:projects,activeTechnologyTransfers:imports,unlockedCapabilities:caps};
}
const API=Object.freeze({
  VERSION,loadCatalog,technology,technologies,register,processCountry,processAll,diagnostics,
  startResearch:(countryId,payload={})=>dispatch('OMEGA_RESOURCE_RESEARCH_START',countryId,payload),
  importTechnology:(countryId,payload={})=>dispatch('OMEGA_RESOURCE_TECHNOLOGY_IMPORT',countryId,payload),
  getEngineeringEffect
});
g.Omega=g.Omega||{};g.Omega.ResourceResearchRuntime=API;g.OmegaResourceResearchRuntime=API;
loadCatalog().catch(()=>{});
if(typeof g.addEventListener==='function'){
  g.addEventListener('OMEGA_RESOURCE_RESEARCH_REQUESTED',e=>{const d=e?.detail?.payload||e?.detail||e||{};const c=d?.countryId||e?.countryId;if(c)dispatch('OMEGA_RESOURCE_RESEARCH_START',c,d);});
  g.addEventListener('OMEGA_RESOURCE_TECHNOLOGY_IMPORT_REQUESTED',e=>{const d=e?.detail?.payload||e?.detail||e||{};const c=d?.countryId||e?.countryId;if(c)dispatch('OMEGA_RESOURCE_TECHNOLOGY_IMPORT',c,d);});
  g.addEventListener('OMEGA_READY',()=>{register();loadCatalog().catch(()=>{});});
  g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>{register();loadCatalog().catch(()=>{});});
  g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',()=>processAll());
}
register();
})(typeof window!=='undefined'?window:globalThis);
