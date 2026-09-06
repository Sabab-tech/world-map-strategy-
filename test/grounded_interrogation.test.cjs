const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadJson(name) {
  const p = require('node:path').join(process.cwd(), name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const source = fs.readFileSync('omega_grounded_query_engine.js', 'utf8');
const sandbox = { console, Intl, Set, Map, Object, Array, String, Number, Math, JSON, RegExp };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'omega_grounded_query_engine.js' });
const engine = sandbox.OmegaGroundedQueryEngine;
assert.ok(engine, 'grounded engine must load');

const datasets = [
  loadJson('resources_2.json'),
  loadJson('resource_ontology.json'),
  loadJson('offline_semantic_knowledge.json'),
  loadJson('countries.json')
];

const india = engine.execute('How many copper in India', datasets, {
  countryId: 'BGD',
  countryName: 'Bangladesh'
});
assert.equal(india.plan.country.id, 'IND', 'explicit India must override active Bangladesh context');
assert.notEqual(india.plan.country.id, 'BGD', 'India query must never resolve to Bangladesh');
assert.doesNotMatch(india.directAnswer || '', /Bangladesh|বাংলাদেশ|98\.3|Macro Impact|Central sovereign resource zone/i);

const bangladesh = engine.execute('How many copper in Bangladesh', datasets, {
  countryId: 'IND',
  countryName: 'India'
});
assert.equal(bangladesh.plan.country.id, 'BGD', 'explicit Bangladesh must resolve to BGD');
assert.notEqual(bangladesh.plan.country.id, 'IND', 'Bangladesh query must never resolve to India');
assert.doesNotMatch(bangladesh.directAnswer || '', /98\.3|Macro Impact|Central sovereign resource zone/i);

const mine = engine.execute('How many copper mines in India', datasets, {});
assert.equal(mine.plan.country.id, 'IND');
assert.equal(mine.plan.resource.id, 'COPPER');
assert.equal(mine.plan.operation, 'COUNT_MINE');
assert.ok(['KNOWN','ZERO','UNKNOWN'].includes(mine.state), `unexpected mine state: ${mine.state}`);

console.log('Grounded interrogation regression tests passed.');
