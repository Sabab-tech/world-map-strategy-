const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const runtimeSource = fs.readFileSync('./omega_production_semantic_runtime_v3.js', 'utf8');
const countryBridgeSource = fs.readFileSync('./omega_country_semantic_bridge.js', 'utf8');
const resourceBridgeSource = fs.readFileSync('./omega_resource_semantic_bridge.js', 'utf8');
const files = new Map([
  ['offline_language_vocabulary.json', JSON.parse(fs.readFileSync('./offline_language_vocabulary.json', 'utf8'))],
  ['offline_semantic_knowledge.json', JSON.parse(fs.readFileSync('./offline_semantic_knowledge.json', 'utf8'))],
  ['countries.json', JSON.parse(fs.readFileSync('./countries.json', 'utf8'))],
  ['ministers.json', JSON.parse(fs.readFileSync('./ministers.json', 'utf8'))],
  ['resource_ontology.json', JSON.parse(fs.readFileSync('./resource_ontology.json', 'utf8'))],
  ['resources.json', JSON.parse(fs.readFileSync('./resources.json', 'utf8'))],
  ['resources_2.json', JSON.parse(fs.readFileSync('./resources_2.json', 'utf8'))],
  ['relation_generation_engine.json', JSON.parse(fs.readFileSync('./relation_generation_engine.json', 'utf8'))]
]);

const sandbox = {
  console, Date, JSON, Object, Array, Map, Set, Math, RegExp, String, Number, Intl, Promise, Error, TypeError,
  setInterval, clearInterval, setTimeout, clearTimeout,
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  dispatchEvent() {},
  localStorage: { _data: new Map(), getItem(k) { return this._data.get(k) ?? null; }, setItem(k, v) { this._data.set(k, String(v)); } },
  Game: { state: {} },
  fetch(path) { const key = String(path).replace(/^\//, ''); if (!files.has(key)) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) }); return Promise.resolve({ ok: true, status: 200, json: async () => files.get(key) }); }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

vm.runInNewContext(runtimeSource, sandbox, { filename: 'omega_production_semantic_runtime_v3.js' });
vm.runInNewContext(countryBridgeSource, sandbox, { filename: 'omega_country_semantic_bridge.js' });
vm.runInNewContext(resourceBridgeSource, sandbox, { filename: 'omega_resource_semantic_bridge.js' });

(async () => {
  await new Promise(resolve => setTimeout(resolve, 180));

  const runtime = sandbox.OmegaProductionSemanticRuntime;
  const countryBridge = sandbox.OmegaCountrySemanticBridge;
  const resourceBridge = sandbox.OmegaResourceSemanticBridge;

  assert.ok(runtime, 'Production semantic runtime must load');
  assert.ok(countryBridge, 'Country semantic bridge must load');
  assert.ok(resourceBridge, 'Resource semantic bridge must load');

  const diag = runtime.diagnostics();
  assert.equal(diag.ready, true, JSON.stringify(diag));
  assert.ok(diag.countries >= 190, `Country registry too small: ${diag.countries}`);
  assert.ok(diag.resources > 0, 'Resource registry is empty');
  assert.ok(diag.ministers > 0, 'Minister registry is empty');

  const countryDiag = countryBridge.diagnostics();
  assert.equal(countryDiag.ready, true, JSON.stringify(countryDiag));
  assert.equal(countryDiag.expectedCountryIds, 197);
  assert.equal(countryDiag.complete, true, `197-country identity coverage incomplete: ${JSON.stringify(countryDiag)}`);
  assert.ok(countryDiag.countries === 197, `Expected exactly 197 canonical country IDs, got ${countryDiag.countries}`);
  for (const [name] of [['Bangladesh'], ['India'], ['Japan'], ['Namibia']]) {
    const resolved = countryBridge.resolve(name);
    assert.ok(resolved?.id, `${name} must resolve as a country`);
    assert.equal(resolved.type, 'COUNTRY');
  }
  assert.ok(countryBridge.resolve('বাংলাদেশ')?.id, 'Bangladesh Bengali name must resolve');
  assert.ok(countryBridge.resolve('भारत')?.id || countryBridge.resolve('India')?.id, 'India must resolve through country identity data');

  const bridgeDiag = resourceBridge.diagnostics();
  assert.equal(bridgeDiag.ready, true, JSON.stringify(bridgeDiag));
  assert.ok(bridgeDiag.countries > 0, 'Bridge country registry is empty');
  assert.ok(bridgeDiag.resources > 0, 'Bridge resource registry is empty');
  assert.equal(bridgeDiag.expectedCountryIds, 197);
  assert.ok(bridgeDiag.exportReady, 'Resource data export/access layer is not ready');
  assert.equal(bridgeDiag.countryIdCoverageComplete, true, `197-country resource bridge coverage incomplete: ${bridgeDiag.countryIdCoverage}`);

  const ontology = files.get('resource_ontology.json');
  const resourceTypes = ontology?.COMMODITY_ONTOLOGIES || {};
  assert.equal(Object.keys(resourceTypes).length, 18, `Expected 18 canonical resource types, got ${Object.keys(resourceTypes).length}`);
  for (const [id, record] of Object.entries(resourceTypes)) {
    assert.equal(String(record?.key || id).toUpperCase(), id.toUpperCase(), `Resource ID mismatch for ${id}`);
    assert.ok(record?.name, `Resource ${id} must have a canonical name`);
    assert.ok(resourceBridge.resolveResource(id)?.id === id, `Resource ${id} must resolve by ID`);
    assert.ok(resourceBridge.resolveResource(record.name)?.id === id, `Resource ${id} must resolve by canonical name`);
  }

  const q1 = runtime.parse('How many iron mines are in Bangladesh?');
  assert.equal(q1.entities.country.id, 'BGD');
  assert.equal(q1.entities.resource.id, 'IRON_ORE');
  assert.equal(q1.assetClass, 'MINE');
  assert.equal(q1.question.type, 'how_many');
  assert.equal(q1.operation, 'COUNT');
  assert.equal(q1.executable, true);

  const q2 = runtime.parse('How many mines are in Germany?');
  assert.ok(q2.entities.country.id, 'Germany must resolve from runtime country data');
  assert.equal(q2.assetClass, 'MINE');
  assert.equal(q2.operation, 'COUNT');
  assert.equal(q2.executable, true);

  const q3 = runtime.parse('Where is oil found in Germany?');
  assert.ok(q3.entities.country.id);
  assert.ok(q3.entities.resource.id, 'Oil must resolve from runtime resource data');
  assert.equal(q3.operation, 'LOCATE');
  assert.equal(q3.executable, true);

  const q4 = runtime.parse('How old are you?', { ministerId: 'Finance_1', countryId: 'BGD' });
  assert.equal(q4.entities.minister.id, 'Finance_1');
  assert.equal(q4.attribute.name, 'age');
  assert.equal(q4.operation, 'ATTRIBUTE');
  assert.equal(q4.executable, true);

  const q5 = runtime.parse('What is your name?', { ministerId: 'Finance_1', countryId: 'BGD' });
  assert.equal(q5.entities.minister.id, 'Finance_1');
  assert.equal(q5.attribute.name, 'name');
  assert.equal(q5.operation, 'ATTRIBUTE');
  assert.equal(q5.executable, true);

  const q6 = runtime.parse('Where are the mines in China?');
  assert.ok(q6.entities.country.id);
  assert.equal(q6.assetClass, 'MINE');
  assert.equal(q6.operation, 'LOCATE');
  assert.equal(q6.executable, true);

  const q7 = runtime.parse('Tell me the location of uranium worldwide.');
  assert.ok(q7.entities.resource.id, 'Uranium must resolve from resource ontology/data');
  assert.equal(q7.operation, 'LOCATE');
  assert.equal(q7.targetDomain, 'RESOURCE');
  assert.equal(q7.executable, true);

  const uraniumResult = resourceBridge.queryResource({ resourceId: q7.entities.resource.id, operation: 'LOCATE', worldwide: true });
  assert.equal(uraniumResult.ok, true, JSON.stringify(uraniumResult));
  assert.equal(uraniumResult.resourceId, q7.entities.resource.id);
  assert.equal(uraniumResult.worldwide, true);
  assert.ok(Array.isArray(uraniumResult.countries), 'Worldwide result must expose country mappings');
  assert.ok(Array.isArray(uraniumResult.locations), 'Worldwide result must expose location records');

  const countrySample = uraniumResult.countries.find(x => x?.countryId);
  if (countrySample) {
    const resolved = resourceBridge.resolveCountry(countrySample.countryId);
    assert.equal(resolved.id, countrySample.countryId);
    assert.ok(resolved.raw, 'Country ID must resolve to canonical country data');
  }

  if (uraniumResult.records.some(r => r?.id)) {
    const sampleRecordId = uraniumResult.records.find(r => r?.id)?.id;
    const entityLookup = resourceBridge.resolveResourceRecord(sampleRecordId);
    assert.equal(entityLookup.ok, true, JSON.stringify(entityLookup));
    assert.equal(entityLookup.entityId, sampleRecordId);
    if (entityLookup.countryId) assert.equal(resourceBridge.resolveCountry(entityLookup.countryId).id, entityLookup.countryId);
  }

  const exportResult = resourceBridge.exportData({ resourceId: q7.entities.resource.id, operation: 'LOCATE' });
  assert.equal(exportResult.ok, true, JSON.stringify(exportResult));
  assert.equal(exportResult.resourceId, q7.entities.resource.id);

  const unknown = runtime.parse('How many mines are in Atlantis?');
  assert.equal(unknown.entities.country.id, null);
  assert.equal(unknown.executable, false);

  const runtimeSourceText = runtimeSource.toLowerCase();
  const bridgeSourceText = resourceBridgeSource.toLowerCase();
  for (const forbidden of ['bangladesh', 'germany', 'india', 'iron_ore', 'crude_oil', 'uranium:']) {
    assert.equal(runtimeSourceText.includes(forbidden), false, `Country/resource fact leaked into runtime code: ${forbidden}`);
    assert.equal(bridgeSourceText.includes(forbidden), false, `Country/resource fact leaked into resource bridge: ${forbidden}`);
  }

  console.log(JSON.stringify({ ok: true, diagnostics: diag, countryBridgeDiagnostics: countryDiag, resourceBridgeDiagnostics: bridgeDiag, resourceTypeCount: Object.keys(resourceTypes).length, cases: 9, hardcodeGuard: true, worldwideResourceQuery: { resourceId: uraniumResult.resourceId, countries: uraniumResult.countries.length, locations: uraniumResult.locations.length } }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
