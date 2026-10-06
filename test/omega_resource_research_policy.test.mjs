import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const policy=JSON.parse(readFileSync('resource_research_policy_v1.json','utf8'));

test('research policy separates mineral and petroleum classification',()=>{
  assert.equal(policy.datasetId,'OMEGA_RESOURCE_RESEARCH_POLICY_V1');
  assert.equal(policy.domains.minerals.framework,'CRIRSCO_STYLE');
  assert.deepEqual(policy.domains.minerals.reportingStages.map(x=>x.stage),['EXPLORATION_RESULTS','MINERAL_RESOURCES','MINERAL_RESERVES']);
  assert.deepEqual(policy.domains.minerals.reportingStages[1].categories,['INFERRED','INDICATED','MEASURED']);
  assert.deepEqual(policy.domains.minerals.reportingStages[2].categories,['PROBABLE','PROVED']);
  assert.equal(policy.domains.petroleum.framework,'SPE_PRMS_2018');
  assert.deepEqual(policy.domains.petroleum.primaryClasses,['RESERVES','CONTINGENT_RESOURCES','PROSPECTIVE_RESOURCES']);
  assert.deepEqual(policy.domains.petroleum.reservesUncertainty,['1P','2P','3P']);
});

test('research policy forbids universal decline assumptions and unsafe simulation authority',()=>{
  assert.equal(policy.production.decline.petroleum.universalDeclineRateAllowed,false);
  assert.equal(policy.domains.production.decline.minerals.universalDeclineRateAllowed,false);
  assert.deepEqual(policy.authority.precedence,['OBSERVED','SIMULATED','UNOBSERVED']);
  assert.equal(policy.calibration.coverage,'OVER_90_COMMODITIES');
  assert.ok(policy.sources.some(x=>x.id==='IEA_2025_DECLINE'));
  assert.ok(policy.sources.some(x=>x.id==='USGS_MCS_2026'));
});
