import assert from 'node:assert/strict';
import fs from 'node:fs';

const files=new Map([
  ['resources.json','resources.json'],
  ['resources_2.json','resources_2.json'],
  ['resource_site_reserve_simulation_v1.json','resource_site_reserve_simulation_v1.json'],
  ['resource_site_research_evidence_v1.json','resource_site_research_evidence_v1.json'],
  ['resource_site_quantitative_research_v1.json','resource_site_quantitative_research_v1.json'],
  ['resource_site_operating_cost_research_v1.json','resource_site_operating_cost_research_v1.json'],
  ['resource_site_canonical_catalog_v1.json','resource_site_canonical_catalog_v1.json']
]);
globalThis.fetch=async input=>{
  const name=String(input).split('?')[0].replace(/^\.\//,'');
  const path=files.get(name);
  if(!path)return{ok:false,status:404,json:async()=>({})};
  return{ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(path,'utf8'))};
};

globalThis.Game={state:{
  simulation:{turn:1},
  resource:{},finance:{},economy:{},trade:{},foreign:{},cabinet:{}
}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=String(type);this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){
  const t=new EventTarget();
  globalThis.dispatchEvent=t.dispatchEvent.bind(t);
  globalThis.addEventListener=t.addEventListener.bind(t);
}

const start=Date.now();
const mark=label=>console.log(JSON.stringify({phase:label,elapsedMs:Date.now()-start}));

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const identity=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await identity.init();
await import('../resource_ministry_engine.js');
await globalThis.ResourceMinistryEngine.init();
await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');
await import('../omega_resource_part04_identity_runtime.js');
await import('../omega_resource_part05_reserve_extraction_runtime.js');
await import('../omega_resource_production_model_v2.js');
await import('../omega_resource_realism_runtime_v1.js');
await import('../omega_resource_endowment_runtime.js');
const R=globalThis.OmegaResourceEndowmentRuntime;
const phase=String(process.argv[2]||'initialize');

mark('DEPENDENCIES_READY');
if(phase==='initialize'){
  const r=await R.initialize();
  mark('INITIALIZE_DONE');
  assert.equal(r.status,'READY',JSON.stringify(r));
  process.exit(0);
}
const init=await R.initialize();
assert.equal(init.status,'READY',JSON.stringify(init));
mark('INITIALIZE_DONE');

if(phase==='hydrate'){
  const r=R.hydrateCountry('BGD');
  mark('HYDRATE_DONE');
  assert.equal(r.status,'APPLIED',JSON.stringify(r));
  const s=R.countryResourceState('BGD')||{};
  console.log(JSON.stringify({mineCount:Array.isArray(s.mines)?s.mines.length:0,referenceCount:s.mineSiteReferenceCount,production:Object.keys(s.production||{})}));
  process.exit(0);
}

const h=R.hydrateCountry('BGD');
assert.equal(h.status,'APPLIED',JSON.stringify(h));
const s=R.countryResourceState('BGD')||{};
const target=s.mines?.find(x=>x.resourceId==='natural_gas')||s.mines?.[0];
assert(target,'No executable BGD resource target');
if(phase==='extract-one'){
  const r=await R.extractCountry('BGD',[target.occurrenceKey]);
  mark('EXTRACT_ONE_DONE');
  assert(['APPLIED','PARTIALLY_APPROVED'].includes(r.status),JSON.stringify(r));
  process.exit(0);
}
if(phase==='extract-all'){
  const r=await R.extractAll();
  mark('EXTRACT_ALL_DONE');
  assert.equal(r.status,'COMPLETED',JSON.stringify(r));
  console.log(JSON.stringify({countries:r.results.length,extracted:r.results.reduce((n,x)=>n+Number(x.result?.result?.extracted||x.result?.extracted||0),0)}));
  process.exit(0);
}
throw new Error('Unknown phase '+phase);
