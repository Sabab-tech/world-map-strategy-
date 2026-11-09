import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const standards=JSON.parse(readFileSync('resource_research_standards_v1.json','utf8'));
const patch=JSON.parse(readFileSync('resource_site_research_evidence_v1.json','utf8'));

test('research standards define separate mineral, petroleum, calibration and simulation policies',()=>{
  assert.equal(standards.datasetId,'OMEGA_RESOURCE_RESEARCH_STANDARDS_V1');
  assert.equal(standards.mineral.primary,'CRIRSCO International Reporting Template');
  assert.deepEqual(standards.mineral.resourceClasses,['INFERRED','INDICATED','MEASURED']);
  assert.deepEqual(standards.mineral.reserveClasses,['PROBABLE','PROVEN']);
  assert.equal(standards.petroleum.primary,'SPE Petroleum Resources Management System');
  assert.equal(standards.petroleum.version,'2018 v1.03');
  assert.equal(standards.simulationRules.scenarioReserveMustRemainMarkedSimulated,true);
  assert.equal(standards.simulationRules.researchCannotDirectlyIncreasePhysicalReserve,true);
  assert.equal(standards.simulationRules.technologyChangesEngineeringAndRecoveryNotGeologicalExistence,true);
});

test('site evidence patch is evidence-only, unique and source-backed',()=>{
  assert.equal(patch.datasetId,'OMEGA_RESOURCE_SITE_RESEARCH_EVIDENCE_PATCH_V1');
  assert.equal(new Set(patch.records.map(x=>x.siteId)).size,patch.records.length);
  assert.equal(patch.records.length,11);
  for(const row of patch.records){
    assert.ok(row.siteId&&row.countryId);
    assert.ok(Array.isArray(row.evidence)&&row.evidence.length>0);
    assert.ok(row.evidence.every(e=>e.url&&e.accessed&&e.sourceType));
  }
});

test('researched numeric facts carry their evidence class instead of becoming simulation reserve authority',()=>{
  const farim=patch.records.find(x=>x.siteId==='SITE_FARIM_phosphate_project');
  assert.equal(farim.facts.resourceClassification.framework,'NI_43_101');
  assert.equal(farim.facts.resourceClassification.reserves.provenTonnes,43800000);
  assert.equal(farim.facts.resourceClassification.reserves.gradeP2O5Percent,30);
  const sierra=patch.records.find(x=>x.siteId==='SITE_SLE_sierra_rutile_area_1');
  assert.equal(sierra.facts.quantitativeProfile.reserve.status,'OBSERVED');
  assert.equal(sierra.facts.quantitativeProfile.grade.status,'OBSERVED');
  assert.notEqual(patch.records[0].facts?.quantitativeProfile?.reserve?.status,'SIMULATED');
});
