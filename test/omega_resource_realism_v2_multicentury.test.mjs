import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
const load=(path,context)=>new Script(readFileSync(path,'utf8'),{filename:path}).runInContext(context);
const context=createContext({console,globalThis:null});context.globalThis=context;
load('omega_resource_realism_runtime_v1.js',context);
const R=context.Omega.ResourceRealism;
assert.equal(R.VERSION,'2.0.0');
const files=['resources.json','resources_2.json'].map(name=>JSON.parse(readFileSync(name,'utf8')));
const profiles=Object.assign({},...(files.map(f=>f?.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{})));
const sites=[];
for(const [countryId,p] of Object.entries(profiles)) for(const site of (p?.resource_infrastructure_context?.mineSites||[])) sites.push({countryId,p,site});
assert.equal(sites.length,199);
let streams=0;
for(const {countryId,p,site} of sites){
  const model=R.siteModel({...site,siteName:site?.siteName||site?.name},p,countryId);
  assert.equal(model.status,'READY',countryId+': model not ready');
  for(const s of model.commodityStreams){
    streams++;
    assert.ok(s.reserve.quantity>0);
    assert.ok(s.reserve.geologicalQuantity>=s.reserve.recoverableQuantity);
    assert.ok(s.reserve.simulationHorizonYears>=220);
    assert.ok(s.production.nominalCapacity>0);
    assert.ok(s.production.minimumCapacity>0);
    assert.ok(s.production.maximumCapacity>=s.production.minimumCapacity);
    assert.ok(s.production.recovery>0&&s.production.recovery<=1);
    assert.ok(s.production.simulationHorizonYears>=220);
    assert.ok(s.production.depletionHorizonYears>=200);
    assert.ok(s.quality.purity>0&&s.quality.purity<=1);
    assert.ok(typeof s.quality.grade==='number');
    assert.ok(typeof s.quality.gradeUnit==='string'&&s.quality.gradeUnit.length>0);
  }
}
assert.ok(streams>=199);
console.log(JSON.stringify({certificate:'OMEGA-199-MULTICENTURY-RESOURCE-MODEL',status:'PASS',siteCount:199,commodityStreams:streams,minHorizonYears:200,fields:['geologicalQuantity','recoverableQuantity','grade','purity','recovery','capacity','utilization','decline','maintenance']},null,2));