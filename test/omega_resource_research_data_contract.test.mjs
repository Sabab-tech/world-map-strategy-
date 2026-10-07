import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load=name=>JSON.parse(readFileSync(name,'utf8'));
const catalog=load('resource_site_canonical_catalog_v1.json');
const quantitative=load('resource_site_quantitative_research_v1.json');
const costs=load('resource_site_operating_cost_research_v1.json');

assert.equal(catalog.siteCount,199);
assert.equal(quantitative.siteCount,199);
assert.equal(quantitative.records.length,199);
assert.equal(costs.coverage.siteCount,199);
assert.equal(costs.records.length,199);

const ids=new Set(catalog.sites.map(x=>x.siteId));
assert.equal(ids.size,199);

const qIds=new Set(quantitative.records.map(x=>x.siteId));
const cIds=new Set(costs.records.map(x=>x.siteId));
assert.equal(qIds.size,199);
assert.equal(cIds.size,199);
for(const id of ids){
  assert(qIds.has(id),`quantitative research missing ${id}`);
  assert(cIds.has(id),`cost research missing ${id}`);
}

for(const row of quantitative.records){
  assert.equal(row.siteId && row.countryId && row.resourceId && row.siteName ? true : false,true);
  assert(row.provenance && Array.isArray(row.provenance.sources));
  for(const field of ['reserve','recoverableReserve','production','capacity','grade','purity','recovery','throughput']){
    assert(row[field] && typeof row[field]==='object',`${row.siteId} missing structured ${field}`);
    if(row[field].status==='UNOBSERVED') assert.equal(row[field].value,null);
  }
}

for(const row of costs.records){
  assert(['OBSERVED','MODELED'].includes(row.cost.status));
  assert(['USD_PER_TONNE_CONCENTRATE','USD_PER_OUTPUT_UNIT'].includes(row.cost.unit));
  assert(row.provenance && Array.isArray(row.provenance.sourceUrls));
  if(row.cost.status==='MODELED'){
    assert.equal(row.cost.value,null,'modeled cost must not masquerade as observed numeric research');
    assert(row.cost.model?.formulaId,'modeled cost requires an explicit formula id');
    assert.equal(row.cost.model?.numericValueIncluded,false);
  }
}

const farim=costs.records.find(x=>x.siteId==='SITE_GNB_farim_phosphate_project');
assert.equal(farim?.cost.status,'OBSERVED');
assert.equal(farim?.cost.value,70.9);
console.log(JSON.stringify({
  status:'PASS',
  siteCount:199,
  quantitativeObserved:{
    reserve:quantitative.coverage.reservePresent,
    production:quantitative.coverage.productionPresent,
    grade:quantitative.coverage.gradePresent,
    purity:quantitative.coverage.purityPresent,
    capacity:quantitative.coverage.capacityPresent
  },
  costObserved:costs.coverage.observedNumericCost,
  costModeledWithoutNumericClaim:costs.coverage.modeledWithoutNumericClaim
}));
