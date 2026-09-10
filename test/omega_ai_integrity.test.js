import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import OfflineQueryEngine from '../offline_query_engine.js';

const brainSource=fs.readFileSync(new URL('../offline_semantic_brain.js',import.meta.url),'utf8');
const integritySource=fs.readFileSync(new URL('../omega_ai_integrity_layer.js',import.meta.url),'utf8');
const countries=JSON.parse(fs.readFileSync(new URL('../countries.json',import.meta.url),'utf8'));
const knowledge=JSON.parse(fs.readFileSync(new URL('../offline_semantic_knowledge.json',import.meta.url),'utf8'));
const resources=JSON.parse(fs.readFileSync(new URL('../resources.json',import.meta.url),'utf8'));
assert.ok(Array.isArray(countries)&&countries.length>0,'countries.json must contain records');

const sandbox={console,setInterval:()=>0,clearInterval:()=>{},Date,JSON,Object,Number,String,RegExp,Intl,Map,Array,Math,process};
sandbox.globalThis=sandbox;
vm.runInNewContext(brainSource,sandbox,{filename:'offline_semantic_brain.js'});
const configured=sandbox.OfflineSemanticBrain.configure({
  datasets:[
    Object.assign({__datasetName:'countries.json'},countries),
    Object.assign({__datasetName:'resources.json'},resources)
  ],
  knowledge
});
assert.equal(configured.countries,countries.length,'semantic brain must index every country record');
vm.runInNewContext(integritySource,sandbox,{filename:'omega_ai_integrity_layer.js'});
const api=sandbox.OmegaAIIntegrity;
assert.ok(api,'integrity API must load');
assert.equal(api.VERSION,'2.0.0');

const first=countries[0];
const last=countries[countries.length-1];
const identity=api.canonicalMinisterIdentity({
  countryCode:first.code,
  countryName:first.name,
  ministryId:'runtime_test_ministry',
  ministerId:`${first.code}:runtime_test_ministry:001`,
  ministerName:'Runtime Test Minister',
  ministerRole:'Runtime Test Role'
});
assert.equal(identity.countryCode,String(first.code).toUpperCase());

for(const row of [first,last]){
  const expected=String(row.code).toUpperCase();
  const q=`What is ${row.name}`;
  const parsed=sandbox.OfflineSemanticBrain.parse(q);
  assert.equal(String(parsed.entities.country.id||'').toUpperCase(),expected,`country discovery failed for ${row.name}`);
  const plan=api.buildAnswerPlan(q,identity,{gameState:{}});
  const country=plan?.semantic?.entities?.country||plan?.entities?.country;
  assert.equal(String(country?.id||'').toUpperCase(),expected,`integrity pipeline failed for ${row.name}`);
  assert.match(api.formatOfflineAnswer(plan),new RegExp(expected));
}

const routingCapability=(knowledge?.data_finding?.dataset_capabilities||[])
  .flatMap(entry=>(entry?.capabilities||[]).map(cap=>({entry,cap,mapping:entry?.fieldMappings?.[cap]||entry?.fieldMappings?.[String(cap).toUpperCase()]||{}})))
  .find(x=>x.entry?.dataset&&Array.isArray(x.entry?.entityTypes)&&x.entry.entityTypes.includes('COUNTRY')&&x.mapping?.valuePath);
assert.ok(routingCapability,'explicit country capability metadata with a valuePath is required for routing regression');

const routeParsed={
  raw:`${first.name} ${routingCapability.cap}`,
  language:'en',
  operation:String(routingCapability.cap).toUpperCase(),
  property:String(routingCapability.cap).toUpperCase(),
  requested_output:String(routingCapability.cap).toUpperCase(),
  entities:{country:{id:String(first.code).toUpperCase(),surface:first.name},resource:null},
  context:{countryId:String(first.code).toUpperCase()}
};
const routeDatasetName=routingCapability.entry.dataset;
const fakeValue=913579;
const locator=routingCapability.entry.recordLocator;
let fakeData;
if(locator==='[key]'){
  fakeData={[first.code]:{code:first.code,name:first.name,[routingCapability.mapping.valuePath]:fakeValue}};
}else if(locator==='root'){
  fakeData={code:first.code,name:first.name,[routingCapability.mapping.valuePath]:fakeValue};
}else if(String(locator).endsWith('[]')){
  const parent=String(locator).slice(0,-2);
  const child={code:first.code,name:first.name};
  const parts=String(routingCapability.mapping.valuePath).split('.');
  let target=child;
  for(let i=0;i<parts.length-1;i++){target[parts[i]]={};target=target[parts[i]];}
  target[parts[parts.length-1]]=fakeValue;
  fakeData={[parent]:[child]};
}else{
  fakeData={code:first.code,name:first.name,[routingCapability.mapping.valuePath]:fakeValue};
}
const routingResult=OfflineQueryEngine.execute(routeParsed,[
  Object.assign({__datasetName:routeDatasetName},fakeData),
  Object.assign({__datasetName:`duplicate-${routeDatasetName}`},{code:first.code,name:first.name,[routingCapability.mapping.valuePath]:123})
]);
assert.ok(routingResult.plan,'Data Finder must produce an execution plan');
assert.equal(routingResult.plan.selected.dataset,routeDatasetName,'capability must choose its metadata-defined dataset');
assert.equal(String(routingResult.plan.entity.id).toUpperCase(),String(first.code).toUpperCase(),'canonical country ID must survive planning');
assert.equal(routingResult.evidence?.[0]?.dataset,routeDatasetName,'evidence must identify the selected dataset');
assert.equal(routingResult.evidence?.[0]?.canonicalEntityId,String(first.code).toUpperCase(),'evidence must retain canonical entity ID');

const historyCountry=last.name;
const follow=parseInt(countries.length,10);
assert.ok(follow>1);
const followPlan=api.buildAnswerPlan(`What is ${historyCountry}?`,identity,{gameState:{}});
assert.equal(String(followPlan?.semantic?.entities?.country?.id||'').toUpperCase(),String(last.code).toUpperCase());

console.log('OMEGA AI data-bound integrity regression tests: PASS');
console.log('Country records indexed:',configured.countries);
console.log('Dynamic country probes: PASS');
console.log('Capability → dataset → record → field routing: PASS');
