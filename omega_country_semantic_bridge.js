/* OMEGA CANONICAL IDENTITY BRIDGE v5.2.0-PRODUCTION
 * Single runtime identity spine for countries, cities and generic data discovery.
 * countries.json is the sole creator of canonical country identities.
 * Other datasets may enrich existing identities but may never create new country IDs.
 */
(function(g){
'use strict';
const VERSION='5.2.0-PRODUCTION';
const DFS_VERSION=VERSION;
const S=v=>String(v==null?'':v).trim();
const N=v=>S(v).normalize('NFKC').replace(/[?!,.:;'\"“”‘’(){}[\]<>—–]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
const O=v=>v&&typeof v==='object'&&!Array.isArray(v);
const A=v=>Array.isArray(v)?v:[];
const isNode=typeof process!=='undefined'&&!!process?.versions?.node&&typeof window==='undefined';
const state={ready:false,error:null,loadedAt:null,promise:null,countries:new Map(),countryAliases:new Map(),cities:new Map(),cityAliases:new Map(),datasets:new Map(),sourceCounts:{},duplicateCountryMerges:[]};
const dfsState={ready:false,error:null,knowledge:null,meta:[],registry:new Map(),capabilities:new Map(),entityIndex:new Map(),fieldIndex:new Map(),promise:null,context:{}};
function rows(r){if(Array.isArray(r))return r;if(Array.isArray(r?.countries))return r.countries;if(Array.isArray(r?.data))return r.data;if(O(r))return Object.entries(r).map(([k,v])=>O(v)?({...v,__sourceKey:k}):({id:k,name:v,__sourceKey:k}));return[];}
function idOf(x,key=''){const i=O(x?.identity)?x.identity:(x||{});return S(i.iso2||i.countryCode||i.country_code||i.code||i.id||i.canonicalId||key).toUpperCase();}
function nameOf(x,key=''){const i=O(x?.identity)?x.identity:(x||{});return S(i.name||i.countryName||i.country_name||i.shortName||i.displayName||i.officialName||x?.name||key);}
function isTwoLetterCountryId(id){return /^[A-Z]{2}$/.test(S(id).toUpperCase());}
function mergeCountryAliasSets(fromId,toId){for(const[alias,ids]of state.countryAliases.entries()){if(!(ids instanceof Set)||!ids.has(fromId))continue;ids.delete(fromId);ids.add(toId);if(!ids.size)state.countryAliases.delete(alias);}}
function mergeCountryRecords(fromId,toId,preferredRecord=null){
  const from=state.countries.get(fromId);
  if(!from)return state.countries.get(toId)||null;
  const to=state.countries.get(toId);
  if(!to){
    from.id=toId;
    state.countries.set(toId,from);
    mergeCountryAliasSets(fromId,toId);
    return from;
  }
  to.names=[...new Set([...(to.names||[]),...(from.names||[])].filter(Boolean))];
  to.sources=[...new Set([...(to.sources||[]),...(from.sources||[])].filter(Boolean))];
  to.cities=[...(to.cities||[]),...(from.cities||[])];
  to.datasets=Object.assign(Object.create(null),from.datasets||{},to.datasets||{});
  to.countryCodes=[...new Set([...(to.countryCodes||[]),...(from.countryCodes||[]),fromId,toId].filter(Boolean))];
  if(preferredRecord&&preferredRecord!==to.raw)to.raw=preferredRecord;
  state.countries.delete(fromId);
  mergeCountryAliasSets(fromId,toId);
  return to;
}
function canonicalIdForCountryRecord(candidateId,name){
  const candidate=S(candidateId).toUpperCase(), alias=N(name);
  const existingIds=[...(state.countryAliases.get(alias)||new Set())].map(v=>S(v).toUpperCase()).filter(Boolean);
  if(!existingIds.length)return candidate;
  if(existingIds.includes(candidate)&&isTwoLetterCountryId(candidate))return candidate;
  const twoLetter=[...existingIds].find(isTwoLetterCountryId);
  if(twoLetter)return twoLetter;
  if(isTwoLetterCountryId(candidate))return candidate;
  return existingIds.slice().sort((a,b)=>a.length-b.length||a.localeCompare(b))[0];
}
function addCountryAlias(id,v){const n=N(v),canonical=S(id).toUpperCase();if(!n||!canonical)return;const set=state.countryAliases.get(n)||new Set();set.add(canonical);state.countryAliases.set(n,set);}
function registerCountry(x,key='',source='countries.json',allowCreate=true){
  if(!O(x))return null;
  const candidateId=idOf(x,key),name=nameOf(x,key);
  if(!candidateId||!name)return null;
  const canonicalId=canonicalIdForCountryRecord(candidateId,name);
  const duplicateCandidate=canonicalId!==candidateId;
  if(!allowCreate&&!state.countries.has(canonicalId))return null;
  if(duplicateCandidate){
    if(!state.countries.has(canonicalId)&&state.countries.has(candidateId))mergeCountryRecords(candidateId,canonicalId,x);
    else if(state.countries.has(candidateId)&&candidateId!==canonicalId)mergeCountryRecords(candidateId,canonicalId,null);
    state.duplicateCountryMerges.push({source,rawId:candidateId,canonicalId,name});
  }
  let old=state.countries.get(canonicalId)||{id:canonicalId,names:[],officialName:'',sources:[],cities:[],raw:null,datasets:Object.create(null),countryCodes:[]};
  const aliases=[...A(x.aliases),...A(x.alias_names),...A(x.altNames),...A(x.alternateNames)];
  old.names=[...new Set([...old.names,name,S(x.officialName),S(x.shortName),S(x.displayName),S(x.nativeName),...aliases].filter(Boolean))];
  old.countryCodes=[...new Set([...(old.countryCodes||[]),candidateId,S(x.iso2),S(x.iso3),S(x.isoCode),S(x.countryCode),S(x.country_code),S(x.code),S(x.id),S(x.canonicalId)].filter(Boolean))];
  if(S(x.officialName))old.officialName=S(x.officialName);
  old.sources=[...new Set([...old.sources,source].filter(Boolean))];
  // A deterministic two-letter canonical record wins over an ISO-3 duplicate.
  if(!old.raw||isTwoLetterCountryId(candidateId)&&!isTwoLetterCountryId(old.id))old.raw=x;
  if(source)old.datasets[source]=x;
  state.countries.set(canonicalId,old);
  for(const n of old.names)addCountryAlias(canonicalId,n);
  for(const code of old.countryCodes)addCountryAlias(canonicalId,code);
  return old;
}
function ingestCountries(r){
  const a=rows(r);
  // Process ISO-2 records first so canonical identity is stable even if the source
  // contains a later ISO-3 duplicate for the same country name.
  a.slice().sort((left,right)=>{
    const l=isTwoLetterCountryId(idOf(left,left?.__sourceKey||''))?0:1;
    const r=isTwoLetterCountryId(idOf(right,right?.__sourceKey||''))?0:1;
    return l-r;
  }).forEach(x=>registerCountry(x,x?.__sourceKey||'','countries.json',true));
  state.sourceCounts.countries=a.length;
}
function cityObject(v,role=''){if(!O(v)||!S(v.name))return null;const city={...v,name:S(v.name),role:S(v.role||role||v.type||'').toUpperCase()};city.countryId=S(v.countryId||v.countryCode||v.iso2||v.iso3||'').toUpperCase();return city;}
function canonicalCityId(countryId,name){return`${S(countryId).toUpperCase()}:${N(name).replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')}`;}
function addCityAlias(id,v){const n=N(v);if(!n||!id)return;const set=state.cityAliases.get(n)||new Set();set.add(id);state.cityAliases.set(n,set);}
function ingestCities(r){const a=rows(r);state.sourceCounts.cities=a.length;for(const x of a){const countryName=nameOf(x,x?.__sourceKey||'');let countryId=S(x?.countryId||x?.countryCode||x?.iso2||x?.iso3||'').toUpperCase();if(!countryId){const ids=state.countryAliases.get(N(countryName));countryId=ids instanceof Set&&ids.size===1?[...ids][0]:'';}const country=countryId?state.countries.get(countryId):null;if(!country)continue;const collected=[];const pushOne=(v,role='')=>{const c=cityObject(v,role);if(c)collected.push(c);};const push=(v,role='')=>{for(const z of A(v))pushOne(z,role);};pushOne(x.capital,'CAPITAL');push(x.economic,'ECONOMIC');push(x.military,'MILITARY');push(x.secret,'SECRET');push(x.cities,'CITY');const merged=state.cities.get(countryId)||new Map();for(const city of collected){const cityId=S(city.id||city.cityId||city.canonicalId)||canonicalCityId(countryId,city.name);const record={...city,id:cityId,canonicalId:cityId,countryId};const prior=merged.get(cityId);merged.set(cityId,prior?{...prior,...record,name:prior.name||record.name}:record);addCityAlias(cityId,city.name);addCityAlias(cityId,cityId);}state.cities.set(countryId,merged);country.cities=[...merged.values()].map(x=>({...x}));}}
function ingestRelations(r){const root=r?.RELATION_GENERATION_ENGINE?.srie_v2_asymmetrical_salience||r?.srie_v2_asymmetrical_salience||{};let count=0;for(const[k,v]of Object.entries(root)){if(!O(v))continue;const id=S(v.country_code||k).toUpperCase(),country=state.countries.get(id);if(country){country.sources=[...new Set([...(country.sources||[]),'relation_generation_engine.json'])];country.datasets['relation_generation_engine.json']=v;for(const alias of [v.country_name,k])if(S(alias))addCountryAlias(id,alias);count++;}}state.sourceCounts.relations=count;}
function ingestRawDataset(r,source){if(r===undefined||r===null)return;state.datasets.set(source,r);state.sourceCounts[source]=1;}
async function loadJson(p,optional=false){try{if(isNode){const fs=await import('node:fs/promises');const base=S(process.env.OMEGA_ROOT||process.cwd());const text=await fs.readFile(`${base}/${p}`,'utf8');return JSON.parse(text);}const r=await fetch(p,{cache:'no-store'});if(!r.ok){if(optional)return null;throw Error(`${p}: HTTP ${r.status}`);}return await r.json();}catch(e){if(optional)return null;throw e;}}
async function init(){if(state.promise)return state.promise;state.promise=(async()=>{state.ready=false;state.error=null;try{const files=[['countries.json',false],['cities.json',false],['resources.json',true],['resources_2.json',true],['resource_ontology.json',true],['relation_generation_engine.json',true],['economy.json',true],['population.json',true]];const loaded=await Promise.all(files.map(([p,o])=>loadJson(p,o)));state.datasets.clear();state.countries.clear();state.countryAliases.clear();state.cities.clear();state.cityAliases.clear();state.sourceCounts={};state.duplicateCountryMerges=[];for(let i=0;i<files.length;i++)if(loaded[i]!==null&&loaded[i]!==undefined)state.datasets.set(files[i][0],loaded[i]);ingestCountries(loaded[0]);if(loaded[5])ingestRelations(loaded[5]);ingestCities(loaded[1]);for(let i=2;i<files.length;i++)if(i!==5)ingestRawDataset(loaded[i],files[i][0]);state.loadedAt=Date.now();state.ready=true;installRuntimeBridges();return true;}catch(e){state.error=String(e);state.ready=false;console.error('[OMEGA Canonical Identity]',e);return false;}})();return state.promise;}
function rankMatches(text,map,contextCountryId=null){const q=N(text);if(!q)return[];const hits=[];for(const[alias,ids]of map.entries()){if(!alias||alias.length<2)continue;const exact=q===alias,boundary=(` ${q} `).includes(` ${alias} `)||q.startsWith(alias+' ')||q.endsWith(' '+alias);if(!exact&&!boundary)continue;for(const id of ids instanceof Set?[...ids]:[ids]){const sameContext=contextCountryId&&S(id).split(':')[0]===S(contextCountryId).toUpperCase();const base=exact?1:Math.min(.995,.76+alias.length/Math.max(100,q.length*2));hits.push({id,alias,score:Math.min(1,base+(sameContext?.004:0))});}}hits.sort((a,b)=>b.score-a.score||b.alias.length-a.alias.length||String(a.id).localeCompare(String(b.id)));return hits;}
function resolveCountry(q){const hits=rankMatches(q,state.countryAliases);if(!hits.length)return null;const best=hits[0],sameAlias=hits.filter(x=>x.alias===best.alias),uniqueIds=[...new Set(sameAlias.map(x=>x.id))];if(uniqueIds.length>1)return{id:null,type:'COUNTRY',confidence:best.score,surface:best.alias,source:'AMBIGUOUS_COUNTRY_IDENTITY',candidates:sameAlias.map(x=>({id:x.id,surface:x.alias,confidence:x.score})),raw:null};const id=S(best.id).toUpperCase();return{id,type:'COUNTRY',confidence:best.score,surface:best.alias,source:'OMEGA_CANONICAL_COUNTRY_REGISTRY',raw:state.countries.get(id)||null};}
function resolveCity(q,contextCountryId=null){const hits=rankMatches(q,state.cityAliases,contextCountryId);if(!hits.length)return null;const best=hits[0],second=hits[1];if(second&&best.alias===second.alias&&best.id!==second.id&&best.score===second.score)return{id:null,type:'CITY',confidence:best.score,surface:best.alias,source:'AMBIGUOUS_CITY_IDENTITY',candidates:hits.filter(x=>x.alias===best.alias).map(x=>({id:x.id,confidence:x.score})),raw:null};const[countryId]=S(best.id).split(':');return{id:best.id,type:'CITY',confidence:best.score,surface:best.alias,countryId,source:'OMEGA_CANONICAL_CITY_REGISTRY',raw:state.cities.get(countryId)?.get(best.id)||null};}
function resolve(q){const country=resolveCountry(q),city=resolveCity(q,country?.id||null);if(city?.id&&(!country?.id||city.confidence>country.confidence))return city;return country;}
function listCountryIds(){return[...state.countries.keys()].sort((a,b)=>String(a).localeCompare(String(b)));}
function allCities(countryId){return[...(state.cities.get(S(countryId).toUpperCase())?.values()||[])].map(x=>({...x}));}
function countryBrief(q){const h=resolveCountry(q);if(!h?.id)return null;const c=state.countries.get(h.id),cities=allCities(h.id);return{countryId:h.id,countryName:c?.names?.[0]||h.surface,realCountryName:c?.officialName||c?.names?.[0]||h.surface,cities,cityCount:cities.length,sources:c?.sources||[],datasets:Object.keys(c?.datasets||{})};}
function canonicalCountryId(value){
  const raw=S(value);
  if(!raw)return null;
  const direct=state.countries.get(raw.toUpperCase());
  if(direct?.id)return direct.id;
  const hit=resolveCountry(raw);
  return hit?.id||null;
}
function getDatasetRecord(source,countryId,surface=''){
  const root=state.datasets.get(source);
  if(root==null)return null;
  const canonical=S(countryId).toUpperCase();
  const canonicalResolved=canonicalCountryId(canonical)||canonical;
  const candidateNames=[N(surface),S(surface).toUpperCase(),N(String(surface).replace(/_/g,' '))].filter(Boolean);
  if(O(root)){
    for(const key of [canonical,canonicalResolved,...candidateNames]){
      if(root[key]!==undefined)return root[key];
    }
    // Country-keyed object datasets commonly use human-readable country names.
    // Resolve those keys through the canonical identity registry instead of requiring
    // every future dataset author to duplicate ISO IDs.
    for(const [key,value] of Object.entries(root)){
      if(!O(value))continue;
      const keyHit=resolveCountry(key);
      if(keyHit?.id===canonicalResolved)return value;
      const valueId=canonicalCountryId(value?.countryId||value?.countryCode||value?.country_code||value?.iso2||value?.iso3||value?.code||value?.id);
      if(valueId===canonicalResolved)return value;
    }
  }
  let found=null;
  const walk=(v,keyHint='')=>{
    if(found||!O(v))return;
    if(Array.isArray(v)){for(const x of v)walk(x,'');return;}
    const id=canonicalCountryId(v.countryId||v.countryCode||v.country_code||v.iso2||v.iso3||v.code||v.id);
    const name=N(v.countryName||v.country_name||v.name||v.officialName||keyHint||'');
    if((id&&id===canonicalResolved)||(name&&candidateNames.includes(name))){found=v;return;}
    for(const [k,x] of Object.entries(v))if(O(x)||Array.isArray(x))walk(x,k);
  };
  walk(root);
  return found;
}
function canonicalizePlan(question,plan){if(!plan||typeof plan!=='object')return plan;const semantic=plan.semantic&&typeof plan.semantic==='object'?{...plan.semantic}:{};const country=resolveCountry(question),city=resolveCity(question,country?.id||null);let entityCountry=country?.id?country:null;if(city?.id&&!entityCountry){const cityCountry=state.countries.get(city.countryId);entityCountry={id:city.countryId,type:'COUNTRY',confidence:city.confidence,source:'CITY_PARENT_COUNTRY',surface:cityCountry?.names?.[0]||city.countryId,raw:cityCountry||null};}if(entityCountry){semantic.entities={...(semantic.entities||{}),country:entityCountry};semantic.unresolved=A(semantic.unresolved).filter(x=>x!=='COUNTRY');semantic.confidence=Math.max(Number(semantic.confidence||0),entityCountry.confidence);}if(city?.id){semantic.entities={...(semantic.entities||{}),city};semantic.unresolved=A(semantic.unresolved).filter(x=>x!=='CITY');}if(entityCountry||city?.id){semantic.executable=semantic.operation!=='UNKNOWN'&&semantic.unresolved.length===0;semantic.identityAuthority='OMEGA_CANONICAL_IDENTITY_BRIDGE';const out={...plan,semantic,entities:semantic.entities};if(entityCountry)out.countryId=entityCountry.id;if(city?.id)out.cityId=city.id;if(entityCountry)out.countryBrief=countryBrief(entityCountry.surface);return out;}return plan;}
function pathRead(root,path){let cur=root;const parts=S(path).replace(/^\$\.?/,'').replace(/\[\]/g,'').split('.').filter(Boolean);for(const part of parts){if(cur==null)return undefined;const m=part.match(/^(.+)\[(\d+)\]$/);if(m){cur=cur[m[1]]?.[Number(m[2])];}else cur=cur[part];}return cur;}
function loadMeta(k){const list=A(k?.data_finding?.dataset_capabilities);return list.filter(O).map(x=>({...x,capabilities:A(x.capabilities),identityFields:A(x.identityFields),fieldMappings:O(x.fieldMappings)?x.fieldMappings:{}}));}
function capAdd(cap,item){const c=S(cap).toUpperCase();if(!c)return;const list=dfsState.capabilities.get(c)||[];list.push(item);dfsState.capabilities.set(c,list);}
function registerMeta(meta,raw,authority='EXPLICIT_METADATA'){const name=S(meta.dataset||meta.name);if(!name)return;const entry={...meta,dataset:name,raw,authority};dfsState.registry.set(name,entry);for(const cap of A(meta.capabilities))capAdd(cap,{dataset:name,metadata:entry});for(const [cap,mapping]of Object.entries(meta.fieldMappings||{})){const c=S(cap).toUpperCase(),e={dataset:name,capability:c,mapping,authority};const list=dfsState.fieldIndex.get(c)||[];list.push(e);dfsState.fieldIndex.set(c,list);capAdd(c,{dataset:name,metadata:entry});}}
function inferRegister(name,raw){if(dfsState.registry.has(name))return;registerMeta({dataset:name,capabilities:[],identityFields:['countryId','countryCode','country_code','iso2','iso3','code','id','name','countryName','country_name'],fieldMappings:{}},raw,'HEURISTIC_SCHEMA_DISCOVERY');}
function recordSurfaces(record,meta,keyHint=''){const values=[];for(const k of A(meta.identityFields)){const v=pathRead(record,k);if(v!=null)values.push(v);}for(const k of ['countryId','countryCode','country_code','iso2','iso3','code','id','name','countryName','country_name'])if(record?.[k]!=null)values.push(record[k]);if(keyHint)values.push(keyHint);return values.map(S).filter(Boolean);}
function indexRecord(dataset,locator,record,meta,keyHint=''){if(!O(record))return;for(const surface of recordSurfaces(record,meta,keyHint)){const hit=resolveCountry(surface);if(hit?.id){const byDataset=dfsState.entityIndex.get(hit.id)||new Map();const list=byDataset.get(dataset)||[];list.push({locator,record,keyHint,identity:hit});byDataset.set(dataset,list);dfsState.entityIndex.set(hit.id,byDataset);return;}}}
function indexDataset(name,meta){const raw=meta.raw;if(raw==null)return;if(meta.recordKeyIsIdentity&&O(raw)){for(const[k,v]of Object.entries(raw))indexRecord(name,`[${JSON.stringify(k)}]`,v,meta,k);return;}if(Array.isArray(raw)){raw.forEach((v,i)=>indexRecord(name,`root[${i}]`,v,meta));return;}if(O(raw)){const locator=S(meta.recordLocator||'root');if(locator&&locator!=='root'){const arr=pathRead(raw,locator);if(Array.isArray(arr)){arr.forEach((v,i)=>indexRecord(name,`${locator}[${i}]`,v,meta));return;}}indexRecord(name,'root',raw,meta);for(const[k,v]of Object.entries(raw))if(O(v))indexRecord(name,k,v,meta,k);}}
async function dfsInit(){if(dfsState.promise)return dfsState.promise;dfsState.promise=(async()=>{try{const knowledgePath='offline_semantic_knowledge.json';const fs=await import('node:fs/promises');const base=S(process.env.OMEGA_ROOT||process.cwd());const knowledge=JSON.parse(await fs.readFile(`${base}/${knowledgePath}`,'utf8'));dfsState.knowledge=knowledge;dfsState.meta=loadMeta(knowledge);dfsState.registry.clear();dfsState.capabilities.clear();dfsState.entityIndex.clear();dfsState.fieldIndex.clear();const loaded=await Promise.all(dfsState.meta.map(async meta=>{try{return [meta,await loadJson(meta.dataset,!!meta.optional)];}catch(_){return [meta,null];}}));for(const [meta,raw] of loaded)if(raw!=null){registerMeta(meta,raw,'EXPLICIT_METADATA');indexDataset(meta.dataset,dfsState.registry.get(meta.dataset));}dfsState.ready=true;return true;}catch(e){dfsState.error=String(e);dfsState.ready=false;return false;}})();return dfsState.promise;}
function dfsPlan(request={}){return{engine:'OMEGA_DATA_FINDING_SYSTEM',version:DFS_VERSION,ready:dfsState.ready,query:request?.query||request?.question||null,datasets:dfsState.meta.map(x=>x.dataset),registrySize:dfsState.registry.size,capabilityCount:dfsState.capabilities.size,entityCount:dfsState.entityIndex.size,authority:'CANONICAL_IDENTITY_AND_METADATA'}}
function dfsExecute(request={}){const q=S(request?.query||request?.question||''),country=request?.countryId||request?.countryCode||resolveCountry(q)?.id||null,metadataCap=S(request?.capability||request?.operation||'').toUpperCase();const results=[];if(country){const indexed=dfsState.entityIndex.get(U(country));if(indexed)for(const [dataset,rows]of indexed.entries())for(const row of rows)results.push({dataset,locator:row.locator,record:row.record,identity:row.identity,authority:'CANONICAL_COUNTRY_IDENTITY'});}if(metadataCap){for(const row of dfsState.capabilities.get(metadataCap)||[])results.push({dataset:row.dataset,metadata:row.metadata,authority:row.authority||'EXPLICIT_METADATA'});}return{ok:results.length>0,status:results.length?'RESOLVED':'NOT_FOUND',query:q,countryId:country,results:[...new Map(results.map(x=>[x.dataset+'::'+x.locator+ '::'+x.authority, x])).values()].slice(0,2000)};}
function dfsDiagnostics(){return{engine:'OMEGA_DATA_FINDING_SYSTEM',version:DFS_VERSION,ready:dfsState.ready,error:dfsState.error||null,metadataDatasets:dfsState.meta.map(x=>x.dataset),registrySize:dfsState.registry.size,capabilityCount:dfsState.capabilities.size,entityCount:dfsState.entityIndex.size,authority:'CANONICAL_IDENTITY_AND_METADATA'};}
function dfsSelfTest(){return{ok:dfsState.ready===true&&dfsState.meta.length>0,status:dfsState.ready===true?'RESOLVED':'NOT_READY',version:DFS_VERSION,metadataDatasets:dfsState.meta.map(x=>x.dataset),registrySize:dfsState.registry.size,entityCount:dfsState.entityIndex.size};}
function contextSet(context={}){dfsState.context=O(context)?{...context}:{};return{ok:true,keys:Object.keys(dfsState.context)};}
function installRuntimeBridges(){g.OmegaCanonicalIdentityRegistry=g.OmegaCanonicalIdentityRegistry||{VERSION,init,resolveCountry,resolveCity,resolve,countryBrief,canonicalizePlan,diagnostics:()=>({VERSION,ready:state.ready,countryCount:state.countries.size,cityCount:[...state.cities.values()].reduce((n,m)=>n+m.size,0),datasets:[...state.datasets.keys()]})};g.OmegaCountrySemanticBridge=g.OmegaCountrySemanticBridge||g.OmegaCanonicalIdentityRegistry;g.OmegaDataFindingSystem={VERSION:DFS_VERSION,init:dfsInit,plan:dfsPlan,execute:dfsExecute,diagnostics:dfsDiagnostics,selfTest:dfsSelfTest,contextSet};}
async function initRuntime(){return init();}
function diagnostics(){return{VERSION,ready:state.ready,error:state.error||null,loadedAt:state.loadedAt,countryCount:state.countries.size,cityCount:[...state.cities.values()].reduce((n,m)=>n+m.size,0),datasets:[...state.datasets.keys()],sourceCounts:{...state.sourceCounts},duplicateCountryMerges:state.duplicateCountryMerges.slice(),dataFinding:dfsDiagnostics(),authority:'countries.json'}}
g.OmegaCanonicalIdentityRegistry=g.OmegaCanonicalIdentityRegistry||{VERSION,init,resolveCountry,resolveCity,resolve,countryBrief,canonicalizePlan,canonicalCountryId,getDatasetRecord,listCountryIds,diagnostics};
g.OmegaCountrySemanticBridge=g.OmegaCountrySemanticBridge||g.OmegaCanonicalIdentityRegistry;
g.OmegaDataFindingSystem=g.OmegaDataFindingSystem||{VERSION:DFS_VERSION,init:dfsInit,plan:dfsPlan,execute:dfsExecute,diagnostics:dfsDiagnostics,selfTest:dfsSelfTest,contextSet};
if(typeof module!=='undefined'&&module.exports)module.exports=g.OmegaCountrySemanticBridge;
})(typeof globalThis!=='undefined'?globalThis:window);
