import assert from 'node:assert/strict';
import fs from 'node:fs';

const nativeFetch=globalThis.fetch;
const files=new Map([
  ['resources.json','resources.json'],
  ['resources_2.json','resources_2.json'],
  ['resource_site_canonical_catalog_v1.json','resource_site_canonical_catalog_v1.json']
]);
globalThis.fetch=async input=>{
  const name=String(input).split('?')[0].replace(/^\.\//,'');
  if(!files.has(name))return{ok:false,status:404,json:async()=>({})};
  return{ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(name,'utf8'))};
};
globalThis.Game={state:{simulation:{turn:1},resource:{}}};

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
await (globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge).init();
await import('../resource_ministry_engine.js');
await globalThis.ResourceMinistryEngine.init();
await import('../omega_resource_part04_identity_runtime.js');

const P4=globalThis.GSRSK_Part04;
const result=P4.compileIdentities({
  sovereignEntities:{resourceTypes:globalThis.ResourceMinistryEngine.resourceTypes},
  refCatalog:{allReferences:globalThis.ResourceMinistryEngine.deposits}
});
assert.equal(result.status,'READY');
assert.equal(result.occurrenceCount,43);
assert.equal(result.siteReferenceCount,199);

const refs=result.registry.listMineSiteReferences();
assert.equal(refs.length,199);
assert.equal(new Set(refs.map(x=>x.siteReferenceKey)).size,199);

const bindingCounts={BOUND:0,UNBOUND:0};
const boundOccurrenceKeys=new Set();
for(const ref of refs){
  const status=ref.canonicalOccurrenceBinding?.status||'UNBOUND';
  assert(['BOUND','UNBOUND'].includes(status));
  bindingCounts[status]++;
  if(status==='BOUND'){
    assert(ref.linkedDepositId);
    assert(ref.canonicalOccurrenceBinding?.occurrenceKey);
    assert(!boundOccurrenceKeys.has(ref.canonicalOccurrenceBinding.occurrenceKey));
    boundOccurrenceKeys.add(ref.canonicalOccurrenceBinding.occurrenceKey);
  }
}
assert(bindingCounts.BOUND<=43);
assert.equal(boundOccurrenceKeys.size,bindingCounts.BOUND);
console.log(JSON.stringify({status:'PASS',occurrenceCount:43,siteReferenceCount:199,bindingCounts}));
if(nativeFetch)globalThis.fetch=nativeFetch;
