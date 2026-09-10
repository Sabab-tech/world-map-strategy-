/* OMEGA RESOURCE SEMANTIC BRIDGE v2.0.0
 * Canonical resource ontology + GSRSK country-profile lookup bridge.
 * No resource facts are duplicated into JS: existing JSON datasets remain authoritative.
 */
(function(g){
  'use strict';
  const VERSION='2.0.0-PRODUCTION';
  if(g.OmegaResourceSemanticBridge?.VERSION===VERSION)return;

  const S=v=>String(v==null?'':v).trim();
  const N=v=>S(v).normalize('NFKC').replace(/[?!,.:;'"(){}\[\]<>]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  const O=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const A=v=>Array.isArray(v)?v:[];
  const C=v=>{try{return v===undefined?undefined:JSON.parse(JSON.stringify(v))}catch(_){return null}};
  const F=v=>Number.isFinite(Number(v));

  const state={ready:false,error:null,ontology:null,resources:new Map(),countries:new Map(),aliases:new Map(),profiles:new Map()};

  function addAlias(map,key,id){const n=N(key);if(n)map.set(n,id);}
  function resourceRoot(){return state.ontology?.COMMODITY_ONTOLOGIES||state.ontology?.resource_types||state.ontology?.resources||{};}

  function ingestOntology(raw){
    state.ontology=C(raw);
    const root=resourceRoot();
    for(const [key,val] of Object.entries(root||{})){
      const id=S(val?.id||val?.key||val?.resource_id||key).replace(/[^a-z0-9_]+/gi,'_').replace(/^_+|_+$/g,'').toUpperCase();
      if(!id)continue;
      const names=[];
      if(O(val))for(const k of ['name','resourceName','canonicalName','displayName','label','name_en','name_bn'])if(typeof val[k]==='string'&&val[k].trim())names.push(val[k]);
      names.push(key,id);
      const old=state.resources.get(id);
      state.resources.set(id,{id,names:[...new Set([...(old?.names||[]),...names])],raw:O(val)?C(val):{id:key,name:val}});
      for(const name of state.resources.get(id).names){addAlias(state.aliases,name,id);addAlias(state.aliases,String(name).replace(/_/g,' '),id);}
    }
  }

  function profileRoot(raw){return raw?.GSRSK_Master_CountryProfiles_v14?.countryProfiles||raw?.countryProfiles||{};}
  function ingestProfiles(raw){
    for(const p of Object.values(profileRoot(raw))){
      if(!O(p))continue;
      const i=p.identity||{};
      const iso2=S(i.iso2||i.countryCode||i.code).toUpperCase();
      const iso3=S(i.iso3||i.countryId).toUpperCase();
      const name=S(i.name||i.officialName);
      const id=N(iso2)||N(iso3)||N(name);
      if(!id)continue;
      const canonical=iso3||iso2||name;
      const entry={id:canonical.toUpperCase(),iso2,iso3,name,profile:C(p)};
      state.countries.set(entry.id,entry);
      state.profiles.set(entry.id,entry.profile);
      [canonical,iso2,iso3,name,i.officialName].filter(Boolean).forEach(x=>addAlias(state.aliases,x,entry.id));
    }
  }

  function resolveCountry(q){
    const x=N(q),direct=state.aliases.get(x),c=direct?state.countries.get(direct):null;
    if(c)return{id:c.id,type:'COUNTRY',confidence:1,source:'GSRSK_COUNTRY_PROFILE',surface:x,raw:C(c),profile:C(c.profile)};
    let best=null;
    for(const c0 of state.countries.values())for(const alias of [c0.iso2,c0.iso3,c0.name].filter(Boolean)){
      const a=N(alias); if(a&&x.includes(a)){const score=Math.min(.98,.70+a.length/Math.max(100,x.length*2));if(!best||score>best.confidence)best={id:c0.id,type:'COUNTRY',confidence:score,source:'GSRSK_COUNTRY_PROFILE',surface:a,raw:C(c0),profile:C(c0.profile)};}
    }
    return best||{id:null,type:'COUNTRY',confidence:0,source:'UNRESOLVED'};
  }

  function resolveResource(q){
    const x=N(q),direct=state.aliases.get(x);
    if(direct&&state.resources.has(direct)){const r=state.resources.get(direct);return{id:r.id,type:'RESOURCE',confidence:1,source:'resource_ontology.json',surface:x,raw:C(r.raw)};}
    const compact=x.replace(/[^a-z0-9_]+/gi,'_').replace(/^_+|_+$/g,'').toUpperCase();
    if(state.resources.has(compact)){const r=state.resources.get(compact);return{id:r.id,type:'RESOURCE',confidence:1,source:'resource_ontology.json',surface:x,raw:C(r.raw)};}
    let best=null;
    for(const [id,r] of state.resources)for(const alias of r.names||[]){const a=N(alias);if(a&&x.includes(a)){const score=Math.min(.98,.70+a.length/Math.max(100,x.length*2));if(!best||score>best.confidence)best={id,type:'RESOURCE',confidence:score,source:'resource_ontology.json',surface:a,raw:C(r.raw)};}}
    return best||{id:null,type:'RESOURCE',confidence:0,source:'UNRESOLVED'};
  }

  const LOCATION_KEY=/(location|region|province|district|city|site|field|basin|deposit|address|area|zone|corridor|hub|mine|plant|facility|reservoir)/i;
  function resourceAliases(id){const r=state.resources.get(String(id).toUpperCase());return[...new Set([String(id),...(r?.names||[])].map(N).filter(Boolean))];}
  function containsResource(value,aliases){const text=N(typeof value==='string'?value:JSON.stringify(value));return aliases.some(a=>a&&text.includes(a));}

  function collectLocations(profile,resourceId){
    if(!O(profile))return[];
    const aliases=resourceAliases(resourceId),out=[],seen=new Set();
    const push=(field,value,path,kind)=>{if(value==null||value==='')return;const key=`${path.join('.')}|${field}|${String(value)}`;if(seen.has(key))return;seen.add(key);out.push({field,value,path:path.join('.'),kind});};
    const walk=(value,path,linked=false)=>{
      if(Array.isArray(value)){value.forEach((x,i)=>walk(x,path.concat(String(i)),linked||containsResource(x,aliases)));return;}
      if(!O(value))return;
      for(const [k,v] of Object.entries(value)){const cp=path.concat(k),local=linked||containsResource(k,aliases)||containsResource(v,aliases);if(typeof v==='string'){if(local&&LOCATION_KEY.test(k))push(k,v,cp,'location');}else if(O(v)||Array.isArray(v))walk(v,cp,local);}
    };
    walk(profile,[]);
    for(const x of A(profile.administrative_resource_regions))if(containsResource(x?.resourceTags||[],aliases)){const id=x.regionId||x.name||'region';push('name',x.name,['administrative_resource_regions',id],'administrative_resource_region');push('resourceTags',A(x.resourceTags).join(', '),['administrative_resource_regions',id],'resource_tags');}
    for(const x of A(profile?.geography?.majorResourceZones))if(containsResource(x,aliases))push('majorResourceZone',x,['geography','majorResourceZones'],'major_resource_zone');
    const h=profile?.hydrocarbon_resource_base||{};
    if(String(resourceId).toUpperCase()==='CRUDE_OIL')for(const x of A(h.oil))push('oil',x,['hydrocarbon_resource_base','oil'],'hydrocarbon_site');
    if(String(resourceId).toUpperCase()==='NATURAL_GAS')for(const x of A(h.naturalGas))push('naturalGas',x,['hydrocarbon_resource_base','naturalGas'],'gas_site');
    return out.slice(0,500);
  }

  function liveMetric(countryId,resourceId){
    const engine=g.ResourceMinistryEngine;if(!engine||typeof engine.getIntegratedResourceState!=='function')return null;
    const c=state.countries.get(String(countryId).toUpperCase());
    const keys=[countryId,c?.iso2,c?.iso3,c?.name].filter(Boolean);
    const ids=[String(resourceId).toUpperCase(),String(resourceId).toLowerCase(),String(resourceId).toLowerCase().replace(/_/g,'')];
    for(const key of keys){try{const state0=engine.getIntegratedResourceState(key);if(!O(state0))continue;for(const root of [state0.reserve,state0.reserves,state0.inventory,state0.production,state0.consumption].filter(O))for(const id of ids)if(F(root[id]))return Number(root[id]);}catch(_){} }
    return null;
  }

  function parseWithBridge(prompt,ctx){
    const base=g.OmegaProductionSemanticRuntime;if(!base?.parse)return null;
    const parsed=base.__omegaOriginalParse?base.__omegaOriginalParse(prompt,ctx):base.parse(prompt,ctx);if(!parsed||typeof parsed!=='object')return parsed;
    const cr=resolveCountry(prompt),rr=resolveResource(prompt),entities={...(parsed.entities||{})};
    if(cr.id)entities.country=cr;if(rr.id)entities.resource=rr;
    const target=cr.id&&rr.id?'COUNTRY_RESOURCE':rr.id?'RESOURCE':cr.id?'COUNTRY':parsed.targetDomain||'GENERAL';
    const operation=String(parsed.operation||'').toUpperCase();
    const unresolved=(parsed.unresolved||[]).filter(x=>x!=='COUNTRY'&&x!=='RESOURCE');
    return{...parsed,entities,targetDomain:target,operation,unresolved,executable:unresolved.length===0&&operation!=='UNKNOWN'};
  }

  function executeCountryResource(parsed){
    const c=parsed.entities?.country?.id,r=parsed.entities?.resource?.id;if(!c||!r)return null;
    const profile=state.profiles.get(String(c).toUpperCase());if(!profile)return{ok:false,reason:'COUNTRY_RESOURCE_PROFILE_UNAVAILABLE',countryId:c,resourceId:r};
    if(parsed.operation==='LOCATE'){const locations=collectLocations(profile,r);return{ok:true,operation:'LOCATE',countryId:c,resourceId:r,locations,evidencePaths:locations.map(x=>x.path),source:'GSRSK_COUNTRY_RESOURCE_PROFILE'};}
    if(parsed.operation==='COUNT'){const locations=collectLocations(profile,r);return{ok:true,operation:'COUNT',count:new Set(locations.map(x=>x.path)).size,countryId:c,resourceId:r,evidencePaths:locations.map(x=>x.path),source:'GSRSK_COUNTRY_RESOURCE_PROFILE'};}
    if(parsed.operation==='QUANTITY'){const value=liveMetric(c,r);if(value===null)return{ok:false,reason:'RESOURCE_QUANTITY_NOT_PRESENT_IN_LOADED_RUNTIME_DATA',countryId:c,resourceId:r};return{ok:true,operation:'QUANTITY',value,countryId:c,resourceId:r,source:'ResourceMinistryEngine'};}
    return null;
  }

  function install(){
    const base=g.OmegaProductionSemanticRuntime;if(!base||typeof base.parse!=='function'||typeof base.buildAnswerPlan!=='function')return false;
    if(!base.__omegaResourceBridgeV200){
      base.__omegaOriginalParse=base.parse;
      base.__omegaOriginalBuildAnswerPlan=base.buildAnswerPlan;
      base.parse=(prompt,ctx={})=>parseWithBridge(prompt,ctx);
      base.explain=(prompt,ctx={})=>{const p=base.parse(prompt,ctx);return{language:p.language,question:p.question,attribute:p.attribute,assetClass:p.assetClass,targetDomain:p.targetDomain,operation:p.operation,entities:p.entities,unresolved:p.unresolved,confidence:p.confidence,executable:p.executable};};
      base.buildAnswerPlan=(prompt,input={},world={},history=[])=>{const p=parseWithBridge(prompt,{...input,worldState:world});const original=base.__omegaOriginalBuildAnswerPlan(prompt,input,world,history);const override=executeCountryResource(p);if(override)return{...original,version:VERSION,language:p.language,question:p.question,intent:p.targetDomain,operation:p.operation,entities:p.entities,semantic:p,result:override};return{...original,semantic:p,entities:p.entities,intent:p.targetDomain,operation:p.operation};};
      base.__omegaResourceBridgeV200=true;
    }
    const prev=g.OmegaAIIntegrity||{};g.OmegaAIIntegrity={...prev,VERSION:'5.0.0-RESOURCE-GROUNDED',parse:base.parse};return true;
  }

  async function loadJson(path,optional=false){try{if(typeof process!=='undefined'&&process.versions?.node){const fs=await import('node:fs/promises');return JSON.parse(await fs.readFile(`${process.cwd()}/${path}`,'utf8'));}const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return await r.json();}catch(e){if(optional)return null;throw e;}}

  async function init(){
    try{const [ontology,r1,r2]=await Promise.all([loadJson('resource_ontology.json'),loadJson('resources.json'),loadJson('resources_2.json',true)]);ingestOntology(ontology);ingestProfiles(r1);ingestProfiles(r2);state.ready=true;install();try{g.dispatchEvent(new CustomEvent('OMEGA_RESOURCE_SEMANTIC_READY',{detail:diagnostics()}));}catch(_){}return diagnostics();}
    catch(e){state.ready=false;state.error=e?.message||String(e);console.error('[OMEGA Resource Semantic Bridge]',state.error);return diagnostics();}
  }

  function diagnostics(){return{version:VERSION,ready:state.ready,resources:state.resources.size,countries:state.countries.size,profiles:state.profiles.size,aliases:state.aliases.size,error:state.error};}
  g.OmegaResourceSemanticBridge={VERSION,init,install,diagnostics,resolveCountry,resolveResource,collectLocations,executeCountryResource,ontology:()=>C(state.ontology)};
  const boot=setInterval(()=>{if(install()&&state.ready)clearInterval(boot);},50);setTimeout(()=>clearInterval(boot),15000);init();
})(typeof globalThis!=='undefined'?globalThis:window);