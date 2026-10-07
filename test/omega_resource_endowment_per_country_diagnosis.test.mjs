import assert from 'node:assert/strict';
import fs from 'node:fs';

const files=new Map([
  ['resources.json','resources.json'],
  ['resources_2.json','resources_2.json'],
  ['resource_site_canonical_catalog_v1.json','resource_site_canonical_catalog_v1.json'],
  ['resource_site_reserve_simulation_v1.json','resource_site_reserve_simulation_v1.json'],
  ['resource_site_quantitative_research_v1.json','resource_site_quantitative_research_v1.json'],
  ['resource_site_operating_cost_research_v1.json','resource_site_operating_cost_research_v1.json']
]);
globalThis.fetch=async input=>{
  const name=String(input).split('?')[0].replace(/^\.\//,'');
  const path=files.get(name);
  if(!path)return{ok:false,status:404,json:async()=>({})};
  return{ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(path,'utf8'))};
};
globalThis.Game={state:{simulation:{turn:1},resource:{},finance:{},economy:{},trade:{},foreign:{},cabinet:{}}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=String(type);this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){
 const t=new EventTarget();globalThis.dispatchEvent=t.dispatchEvent.bind(t);globalThis.addEventListener=t.addEventListener.bind(t);
}

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
await (globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge).init();
await import('../resource_ministry_engine.js');
await globalThis.ResourceMinistryEngine.init();
await import('../omega_resource_part04_identity_runtime.js');
await import('../omega_resource_part05_reserve_extraction_runtime.js');
await import('../omega_resource_production_model_v2.js');
await import('../omega_resource_realism_runtime_v1.js');
await import('../omega_resource_endowment_runtime.js');
const R=globalThis.OmegaResourceEndowmentRuntime;
const t0=Date.now();
const init=await Promise.race([R.initialize(),new Promise((_,r)=>setTimeout(()=>r(new Error('INIT_TIMEOUT')),5000))]);
assert.equal(init.status,'READY',JSON.stringify(init));

const engine=globalThis.ResourceMinistryEngine;
const profiles=engine.countryProfiles||{};
const all=[...new Set(Object.values(profiles).map((p)=>String((p?.identity||p)?.iso3||(p?.identity||p)?.countryId||'').toUpperCase()).filter(Boolean))].sort();
const resourceCountries=new Set((engine.deposits||[]).map(x=>String(x.countryCode||x.countryId||x.country||'').toUpperCase()).filter(Boolean));
for(const c of all){
 const refs=R.countryMineSiteReferences(c)||[];
 const p=profiles[c];
 const h=(p?.hydrocarbon_resource_base||{});
 if(refs.length||resourceCountries.has(c)||(Array.isArray(h.oil)&&h.oil.length)||(Array.isArray(h.naturalGas)&&h.naturalGas.length))resourceCountries.add(c);
}
const rows=[];
let index=0;
for(const c of [...resourceCountries].sort()){
 index++;
 const start=Date.now();
 const refs=R.countryMineSiteReferences(c)||[];
 const result=await Promise.race([
   R.extractCountry(c),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error('COUNTRY_EXTRACT_TIMEOUT')),2000))
 ]).catch(e=>({__error:String(e?.message||e)}));
 const elapsed=Date.now()-start;
 const row={index,countryId:c,siteReferences:refs.length,elapsedMs:elapsed,resultStatus:result?.__error?'TIMEOUT_OR_ERROR':result?.status||null,error:result?.__error||null,extracted:result?.result?.extracted??result?.extracted??null};
 console.log('RESOURCE_COUNTRY_PROFILE',JSON.stringify(row));
 rows.push(row);
 if(row.__error||elapsed>1000)break;
}
assert(rows.length>0);
const bad=rows.filter(x=>x.resultStatus==='TIMEOUT_OR_ERROR'||x.elapsedMs>1000);
assert.equal(bad.length,0,JSON.stringify(bad));
console.log(JSON.stringify({status:'PASS',resourceCountries:resourceCountries.size,slowest:rows.sort((a,b)=>b.elapsedMs-a.elapsedMs).slice(0,10)}));
