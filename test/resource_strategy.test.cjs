const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function json(name) { return JSON.parse(fs.readFileSync(path.join(process.cwd(), name), 'utf8')); }
const source = fs.readFileSync('omega_resource_strategy_engine.js', 'utf8');
const sandbox = { console, Set, Map, Object, Array, String, Number, Math, JSON, RegExp };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'omega_resource_strategy_engine.js' });
const engine = sandbox.OmegaResourceStrategyEngine;
assert.ok(engine?.plan, 'strategy engine must load');

const datasets = [json('resources.json'), json('resources_2.json'), json('countries.json')];
const ontology = json('resource_ontology.json').COMMODITY_ONTOLOGIES || {};
const registry = Object.assign({}, json('resources.json').resource_types || {}, json('resources_2.json').resource_types || {});

for (const resourceId of Object.keys(ontology)) {
  const result = engine.plan(`How can we increase ${resourceId} production?`, {
    datasets, ontology, resourceRegistry: registry, countryCode: 'BGD', countryName: 'Bangladesh'
  });
  assert.ok(['RESOLVED','GROUNDED_PLAN','INSUFFICIENT_DATA','UNRESOLVED','AMBIGUOUS'].includes(result.state));
  assert.equal(result.operation, 'INCREASE_PRODUCTION');
  assert.equal(result.resource.id, resourceId);
  assert.ok(Array.isArray(result.recommendations));
  assert.equal(result.rule, 'NO_QUANTITY_INVENTION');
}

const oil = engine.plan('How can we increase oil production?', {
  datasets, ontology, resourceRegistry: registry, countryCode: 'BGD', countryName: 'Bangladesh'
});
assert.equal(oil.resource.id, 'CRUDE_OIL');
assert.equal(oil.operation, 'INCREASE_PRODUCTION');
assert.ok(oil.recommendations.length >= 5);
assert.doesNotMatch(JSON.stringify(oil), /98\.3|Macro Impact|Central sovereign resource zone active/i);

console.log('Generic resource strategy tests passed.');
