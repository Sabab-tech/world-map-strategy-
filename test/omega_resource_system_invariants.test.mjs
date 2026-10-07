import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load=name=>JSON.parse(readFileSync(name,'utf8'));
const catalog=load('resource_site_canonical_catalog_v1.json');
const reserve=load('resource_site_reserve_simulation_v1.json');
const quantitative=load('resource_site_quantitative_research_v1.json');
const costs=load('resource_site_operating_cost_research_v1.json');

assert.equal(catalog.siteCount,199);
assert.equal(catalog.sites.length,199);
assert.equal(reserve.siteCount,199);
assert.equal(reserve.records.length,199);
assert.equal(reserve.commercialSiteCount+reserve.notApplicableSiteCount,199);
assert.equal(quantitative.siteCount,199);
assert.equal(quantitative.commercialSiteCount,195);
assert.equal(quantitative.notApplicableSiteCount,4);
assert.equal(quantitative.records.length,199);
assert.equal(costs.coverage.siteCount,199);
assert.equal(costs.records.length,199);

const catalogIds=new Set(catalog.sites.map(x=>x.siteId));
const reserveIds=new Set(reserve.records.map(x=>x.siteId));
const quantIds=new Set(quantitative.records.map(x=>x.siteId));
const costIds=new Set(costs.records.map(x=>x.siteId));
assert.equal(catalogIds.size,199);
assert.equal(reserveIds.size,199);
assert.equal(quantIds.size,199);
assert.equal(costIds.size,199);
for(const id of catalogIds){
  assert(reserveIds.has(id));
  assert(quantIds.has(id));
  assert(costIds.has(id));
}

const commercial=reserve.records.filter(x=>x.commercialExtraction!==false);
assert.equal(commercial.length,195);
assert(commercial.every(x=>Number(x.reserve?.quantity)>0));
assert(reserve.records.filter(x=>x.commercialExtraction===false).every(x=>x.reserve?.quantity==null));
assert.equal(new Set(reserve.records.map(x=>x.reserve?.quantity).filter(v=>v!=null)).size,195);

for(const row of quantitative.records){
  assert(row.siteId&&row.countryId&&row.resourceId&&row.siteName);
  for(const field of ['reserve','recoverableReserve','production','capacity','grade','purity','recovery','throughput']){
    const f=row[field];
    assert(f&&typeof f==='object',`${row.siteId}: ${field} must be structured`);
    if(String(f.status||'').toUpperCase()==='UNOBSERVED')assert.equal(f.value,null,`${row.siteId}: UNOBSERVED ${field} must have null value`);
  }
  assert(row.provenance&&Array.isArray(row.provenance.sources));
}

for(const row of costs.records){
  assert(['OBSERVED','MODELED'].includes(row.cost.status));
  if(row.cost.status==='OBSERVED'){
    assert(Number.isFinite(Number(row.cost.value)));
    assert(row.provenance.sourceUrls.length>0);
  }else{
    assert.equal(row.cost.value,null);
    assert.equal(row.cost.model?.numericValueIncluded,false);
    assert(row.cost.model?.formulaId);
  }
}

const prohibitedSimulationClasses=new Set(['PROVED','PROBABLE','PROVEN','PROBABLE_RESERVE']);
for(const row of reserve.records){
  const c=String(row.provenance?.classification||row.provenance?.reserveClassification||'').toUpperCase();
  assert(!prohibitedSimulationClasses.has(c),`${row.siteId}: simulation reserve cannot claim economic reserve class ${c}`);
}
console.log(JSON.stringify({
  status:'PASS',
  sites:199,
  commercialSites:195,
  reserveDuplicates:0,
  quantitativeRecords:199,
  costRecords:199,
  numericObservedCost:costs.coverage.observedNumericCost
}));
