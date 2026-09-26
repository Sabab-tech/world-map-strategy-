import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

await import('../omega_resource_science_runtime.js');
const sci=globalThis.OmegaResourceScienceRuntime;
assert(sci);

const rules=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../resource_economy_rules.json',import.meta.url)),'utf8'));
const ontology=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../resource_ontology.json',import.meta.url)),'utf8'));
const resources2=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../resources_2.json',import.meta.url)),'utf8'));

assert.equal(sci.RESOURCE_IDS.length,14);
assert.deepEqual(ontology.runtimeResourceIds,sci.RESOURCE_IDS);
assert.deepEqual(Object.keys(resources2.resource_types).sort(),[...sci.RESOURCE_IDS].sort());
assert.equal(Object.keys(ontology.RUNTIME_RESOURCE_ONTOLOGIES).length,14);

const muruntau=sci.parsePrimaryReserve('4,500 Tons Gold (145M Oz)','gold');
assert.equal(muruntau.targetUnit,'TROY_OZ');
assert.equal(muruntau.sourceUnit,'OZ');
assert.equal(muruntau.quantity,145000000);

const multi=sci.parseReserveComponents('30.2M Oz Au / 15Mt Cu','gold');
assert(multi.some(x=>x.resourceId==='gold'&&x.quantity===30200000&&x.unit==='TROY_OZ'));
assert(multi.some(x=>x.resourceId==='copper'&&x.quantity===15000000&&x.unit==='TONNES'));

const gas=sci.parsePrimaryReserve('16.2 TCF natural gas','natural_gas');
assert.equal(gas.targetUnit,'BCM');
assert(Math.abs(gas.quantity-(16.2*28.316846592))<1e-9);

const q1=sci.parseQuality('62.0% Fe Brockman Ore','iron_ore');
assert.equal(q1.purity,null);
assert.equal(q1.purityStatus,'UNOBSERVED');
assert.equal(q1.gradePercent,62);
assert.equal(q1.gradeBasis,'FE');

const q2=sci.parseQuality('96.2% methane','natural_gas');
assert.equal(q2.purity,null);
assert.equal(q2.gradePercent,96.2);
assert.equal(q2.gradeBasis,'METHANE_CONCENTRATION');

const q3=sci.parseQuality('34° API','crude_oil');
assert.equal(q3.purity,null);
assert.equal(q3.apiGravity,34);

const cap=sci.capacityModel({
  nominalRate:1000,
  effortUtilization:rules.extraction.defaultEffortUtilization,
  constraintFactors:rules.extraction.constraintFactors,
  authority:'SIMULATION_RULESET'
});
assert.equal(cap.nominalRate,1000);
assert(cap.effectiveUtilization>0);
assert(cap.effectiveUtilization<1);
assert.equal(cap.effectiveRate,820);

assert.equal(sci.normalizeUnit('TCF').dimension,'VOLUME');
assert.equal(sci.normalizeUnit('metric_tons_lce').dimension,'MASS');
assert.equal(sci.normalizeUnit('TONNES_PER_DAY').dimension,'MASS_RATE');
assert.equal(sci.toCanonicalQuantity(null,'TONNES','TONNES'),null);

console.log('OMEGA RESOURCE INTEGRITY V2 TEST PASSED');
