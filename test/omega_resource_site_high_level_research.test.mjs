import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const data=JSON.parse(readFileSync('resource_site_high_level_research_v1_1.json','utf8'));
const catalog=JSON.parse(readFileSync('resource_site_canonical_catalog_v1.json','utf8'));

test('199-site research matrix is complete and identity-locked',()=>{
  assert.equal(data.datasetId,'OMEGA_RESOURCE_SITE_HIGH_LEVEL_RESEARCH_V1_1');
  assert.equal(data.siteCount,199);
  assert.equal(data.records.length,199);
  assert.equal(new Set(data.records.map(x=>x.siteId)).size,199);
  const ids=new Set(catalog.sites.map(x=>x.siteId));
  assert.equal(ids.size,199);
  for(const row of data.records){
    assert.ok(ids.has(row.siteId),row.siteId);
    assert.equal(row.countryId,catalog.sites.find(x=>x.siteId===row.siteId).countryId);
    assert.equal(row.siteId,row.seed?.siteType ? row.siteId : row.siteId);
  }
});

test('research matrix exposes every downstream dependency field',()=>{
  const groups=data.fieldRegistry;
  for(const name of ['identity','geology','quality','operations','processing_and_route','context']) assert.ok(Array.isArray(groups[name]),name);
  const keys=new Set(Object.values(groups).flat().map(x=>x[0]));
  for(const required of ['geologicalEndowment','mineralResource','mineralReserve','recoverableQuantity','extractableQuantity','reserveClassification','oreGrade','productPurity','recovery','productionAnnual','productionRate','nominalCapacity','minimumCapacity','maximumCapacity','utilization','maintenance','decline','mineLevel','owner','operator','concessionHolder','processingPlant','throughput','warehouse','factoryRoute','exportRoute','transportModes','routeDistance','routeCapacity','routeAuthority','operatingCost','lifecycle','depletionModel','provenance','conflicts']) assert.ok(keys.has(required),required);
});

test('simulation bindings cannot masquerade as research evidence',()=>{
  for(const row of data.records){
    assert.equal(row.simulationBinding.authority,'SCENARIO_SIMULATION_DATA',row.siteId);
    assert.equal(row.simulationBinding.siteId,row.siteId);
    assert.ok(row.simulationBinding.forbiddenUse.includes('real-world evidence'));
    assert.ok(row.simulationBinding.forbiddenUse.includes('exact route evidence'));
    assert.ok(['UNOBSERVED','CANONICAL_SEED','PARTIAL','MISSING','UNASSIGNED','MODELED_RUNTIME','OBSERVED','REPORTED','WEB_REVIEWED'].includes(String(row.truthState.nominalCapacity)) || row.truthState.nominalCapacity===null);
    assert.equal(row.truthState.mineLevel,'UNASSIGNED',row.siteId);
    assert.equal(row.truthState.routeAuthority,'UNOBSERVED',row.siteId);
  }
});

test('dangling legacy evidence is explicitly surfaced instead of silently attached',()=>{
  assert.ok(Array.isArray(data.danglingLegacyEvidenceSiteIds));
  assert.ok(data.danglingLegacyEvidenceSiteIds.includes('SITE_FARIM_phosphate_project'));
});
