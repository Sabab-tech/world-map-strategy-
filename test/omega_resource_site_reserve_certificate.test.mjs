import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const load=name=>JSON.parse(readFileSync(name,'utf8'));
const catalog=load('resource_site_canonical_catalog_v1.json');
const data=load('resource_site_reserve_simulation_v1.json');

assert.equal(catalog.siteCount,199);
assert.equal(data.siteCount,199);
assert.equal(data.records.length,199);

const catalogMap=new Map(catalog.sites.map(s=>[s.siteId,s]));
const reserveMap=new Map(data.records.map(r=>[r.siteId,r]));
assert.equal(catalogMap.size,199);
assert.equal(reserveMap.size,199);

const sameResourceValues=new Map();
for(const [siteId,site] of catalogMap){
  const r=reserveMap.get(siteId);
  assert(r,'missing reserve record '+siteId);
  assert.equal(r.countryId,site.countryId,siteId+': country mismatch');
  assert.equal(String(r.resourceId||''),String(site.identity?.resourceTypeId||''),siteId+': resource mismatch');
  assert.equal(r.siteName,site.siteName,siteId+': name mismatch');
  const na=site.operation?.commercialExtraction===false||site.identity?.siteType==='NO_COMMERCIAL_EXTRACTION';
  if(na){
    assert.equal(r.reserve.status,'NOT_APPLICABLE',siteId+': N/A reserve status');
    assert.equal(r.reserve.quantity,null,siteId+': N/A quantity');
  }else{
    assert.equal(r.reserve.status,'SIMULATED',siteId+': reserve must be simulation data');
    assert(Number.isFinite(r.reserve.quantity)&&r.reserve.quantity>0,siteId+': reserve quantity missing');
    assert(typeof r.reserve.unit==='string'&&r.reserve.unit.length>0,siteId+': reserve unit missing');
    const key=r.resourceId+'|'+r.reserve.unit;
    const set=sameResourceValues.get(key)||new Set();
    assert(!set.has(r.reserve.quantity),siteId+': duplicate reserve value within resource family');
    set.add(r.reserve.quantity);
    sameResourceValues.set(key,set);
  }
  assert.equal(r.provenance.authority,'SCENARIO_SIMULATION_DATA');
  assert.equal(r.provenance.realWorldDataRequired,false);
}
assert.equal(data.commercialSiteCount,195);
assert.equal(data.notApplicableSiteCount,4);

console.log(JSON.stringify({certificate:'OMEGA-199-PER-SITE-RESERVE-DATA',status:'PASS',siteCount:199,commercialSiteCount:195,notApplicableSiteCount:4,uniqueSiteIds:reserveMap.size,countryBinding:'PASS',resourceBinding:'PASS',perIdentityReserve:'PASS'},null,2));

const context=createContext({console,globalThis:null});
context.globalThis=context;
new Script(readFileSync('omega_resource_realism_runtime_v1.js','utf8'),{filename:'omega_resource_realism_runtime_v1.js'}).runInContext(context);
const R=context.Omega.ResourceRealism;
assert.equal(R.VERSION,'1.2.0');
let runtimeChecked=0;
for(const site of catalog.sites){
  const r=reserveMap.get(site.siteId);
  if(site.operation?.commercialExtraction===false||site.identity?.siteType==='NO_COMMERCIAL_EXTRACTION')continue;
  const model=R.siteModel({...site,siteName:site.siteName,resourceId:site.identity?.resourceTypeId,simulationReserveQuantity:r.reserve.quantity,simulationReserveUnit:r.reserve.unit},site.countryId==='BGD'?{}:{},site.countryId);
  assert.equal(model.status,'READY',site.siteId+': site model not ready');
  const stream=model.commodityStreams.find(x=>x.resourceId===r.resourceId);
  assert(stream,site.siteId+': resource stream missing');
  assert.equal(stream.reserve.quantity,r.reserve.quantity,site.siteId+': scenario reserve not consumed');
  assert.equal(stream.reserve.authority,'SIMULATED');
  assert.equal(stream.reserve.unit,r.reserve.unit);
  runtimeChecked++;
}
assert.equal(runtimeChecked,195);
console.log('OMEGA RUNTIME PER-SITE RESERVE CONSUMPTION CERTIFICATE PASSED');
