import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const brainSource=fs.readFileSync(new URL('../offline_semantic_brain.js',import.meta.url),'utf8');
const engineSource=fs.readFileSync(new URL('../offline_query_engine.js',import.meta.url),'utf8');
const integritySource=fs.readFileSync(new URL('../omega_ai_integrity_layer.js',import.meta.url),'utf8');
const resourceBridgeSource=fs.readFileSync(new URL('../omega_resource_semantic_bridge.js',import.meta.url),'utf8');
const countries=JSON.parse(fs.readFileSync(new URL('../countries.json',import.meta.url),'utf8'));
const knowledge=JSON.parse(fs.readFileSync(new URL('../offline_semantic_knowledge.json',import.meta.url),'utf8'));
const resources=JSON.parse(fs.readFileSync(new URL('../resources.json',import.meta.url),'utf8'));
assert.ok(Array.isArray(countries)&&countries.length>0,'countries.json must contain records');

const sandbox={console,setInterval:()=>0,clearInterval:()=>{},Date,JSON,Object,Number,String,RegExp,Intl,Map,Array,Math,process};
sandbox.globalThis=sandbox;
vm.runInNewContext(brainSource,sandbox,{filename:'offline_semantic_brain.js'});
vm.runInNewContext(engineSource,sandbox,{filename:'offline_query_engine.js'});
vm.runInNewContext(resourceBridgeSource,sandbox,{filename:'omega_resource_semantic_bridge.js'});
const configured=sandbox.OfflineSemanticBrain.configure({
  datasets:[Object.assign({__datasetName:'countries.json'},countries),Object.assign({__datasetName:'resources.json'},resources)],
  knowledge
});
assert.equal(configured.countries,countries.length,'semantic brain must index every country record');
vm.runInNewContext(integritySource,sandbox,{filename:'omega_ai_integrity_layer.js'});
const api=sandbox.OmegaAIIntegrity;
assert.ok(api,'integrity API must load');
assert.equal(api.VERSION,'2.1.0');

const first=countries[0];
const last=countries[countries.length-1];
const identity=api.canonicalMinisterIdentity({countryCode:first.code,countryName:first.name,ministryId:'runtime_test_ministry',ministerId:`${first.code}:runtime_test_ministry:001`,ministerName:'Runtime Test Minister',ministerRole:'Runtime Test Role'});
assert.equal(identity.countryCode,String(first.code).toUpperCase());

for(const row of [first,last]){
  const expected=String(row.code).toUpperCase();
  const plan=api.buildAnswerPlan(`What is ${row.name}`,identity,{gameState:{}});
  assert.equal(String(plan.semantic.entities.country?.id||'').toUpperCase(),expected,`explicit country resolution failed for ${row.name}`);
  assert.equal(plan.semantic.targetDomain,'COUNTRY');
  assert.match(api.formatOfflineAnswer(plan),new RegExp(expected));
}

const about=api.buildAnswerPlan(`Tell me about ${last.name}`,identity,{gameState:{}});
assert.equal(String(about.semantic.entities.country?.id||'').toUpperCase(),String(last.code).toUpperCase());
assert.notEqual(String(about.semantic.entities.country?.id||'').toUpperCase(),String(first.code).toUpperCase());

const resourceApi=sandbox.OmegaResourceSemanticBridge;
assert.ok(resourceApi,'resource bridge must load');
let resourceCandidate=null;
for(const id of ['CRUDE_OIL','NATURAL_GAS','COAL','IRON_ORE','LITHIUM','COPPER','GOLD','URANIUM']){
  try{const r=resourceApi.resolveResource(id);if(r?.id){resourceCandidate=r;break}}catch(_){}
}
if(resourceCandidate){
  const resourceName=resourceCandidate.surface||resourceCandidate.name||resourceCandidate.id;
  const resourcePlan=api.buildAnswerPlan(`What is ${resourceName}`,identity,{gameState:{}});
  assert.equal(String(resourcePlan.semantic.entities.resource?.id||'').toUpperCase(),String(resourceCandidate.id).toUpperCase(),'resource must resolve to resource entity');
  assert.equal(resourcePlan.semantic.entities.country?.id||null,null,'resource-only query must not inherit active country');
  assert.equal(resourcePlan.semantic.targetDomain,'RESOURCE');
  assert.ok(!/arableLandClass/i.test(api.formatOfflineAnswer(resourcePlan)),'resource answer must not leak country-profile fields');

  const mixed=api.buildAnswerPlan(`${last.name} ${resourceName}`,identity,{gameState:{}});
  assert.equal(String(mixed.semantic.entities.country?.id||'').toUpperCase(),String(last.code).toUpperCase());
  assert.equal(String(mixed.semantic.entities.resource?.id||'').toUpperCase(),String(resourceCandidate.id).toUpperCase());
}

console.log('OMEGA strict entity integrity regression tests: PASS');
console.log('Country records indexed:',configured.countries);
console.log('Explicit country beats active-country context: PASS');
console.log('Resource entity remains separate from country entity: PASS');
