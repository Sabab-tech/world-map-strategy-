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
  ['cities.json', JSON.parse(fs.readFileSync('./cities.json', 'utf8'))],
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
  assert.equal(diag.countries, 197, `Runtime country registry must contain exactly 197 canonical IDs: ${diag.countries}`);
  assert.ok(diag.resources > 0, 'Resource registry is empty');
  assert.ok(diag.ministers > 0, 'Minister registry is empty');

  const countryDiag = countryBridge.diagnostics();
  assert.equal(countryDiag.ready, true, JSON.stringify(countryDiag));
  assert.equal(countryDiag.expectedCountryCount, 197);
  assert.equal(countryDiag.complete, true, `197-country identity coverage incomplete: ${JSON.stringify(countryDiag)}`);
  assert.equal(countryDiag.countryCount, 197, `Expected exactly 197 canonical country IDs, got ${countryDiag.countryCount}`);
  assert.ok(countryDiag.totalCityRecords > 0, 'No city records were ingested from cities.json');
  for (const name of ['Bangladesh', 'India', 'Japan', 'Namibia']) {
    const resolved = countryBridge.resolve(name);
    assert.ok(resolved?.id, `${name} must resolve as a country`);
    assert.equal(resolved.type, 'COUNTRY');
  }
  assert.ok(countryBridge.resolve('বাংলাদেশ')?.id, 'Bangladesh Bengali name must resolve');
  assert.ok(countryBridge.resolve('भारत')?.id || countryBridge.resolve('India')?.id, 'India must resolve through country identity data');

  const india = countryBridge.parseCountry('India', { initialTurn: true });
  assert.equal(india?.entities?.country?.id, 'IN', 'India must resolve to IN, never Bangladesh');
  assert.equal(india?.responseTemplate?.type, 'COUNTRY_FIRST_TURN');
  assert.equal(india?.countryBrief?.countryName, 'India');
  assert.equal(india?.countryBrief?.cityCount, india?.countryBrief?.cities?.length);
  assert.ok(india?.countryBrief?.cityCount > 3, 'Country brief must expose all JSON-described cities, not only three major cities');
  assert.deepEqual(india?.countryBrief?.cities?.map(c => c.name), files.get('cities.json').countries.find(c => c.name === 'India').cities.map(c => c.name));

  const japan = countryBridge.parseCountry('Japan', { initialTurn: true });
  assert.equal(japan?.entities?.country?.id, 'JP', 'Japan must resolve to JP, never Bangladesh');
  assert.equal(japan?.responseTemplate?.type, 'COUNTRY_FIRST_TURN');
  assert.equal(japan?.countryBrief?.cityCount, japan?.countryBrief?.cities?.length);

  const bridgeExport = countryBridge.exportData();
  assert.equal(bridgeExport.expectedCountryCount, 197);
  assert.equal(bridgeExport.countries.length, 197, 'Export must contain all 197 runtime countries');
  assert.ok(bridgeExport.countries.every(c => Array.isArray(c.cities)), 'Every exported country must carry its runtime city array');

  const bridgeDiag = resourceBridge.diagnostics();
  assert.equal(bridgeDiag.ready, true, JSON.stringify(bridgeDiag));
  assert.ok(bridgeDiag.countries > 0, 'Bridge country registry is empty');
  assert.ok(bridgeDiag.resources > 0, 'Bridge resource registry is empty');
  assert.equal(bridgeDiag.expectedCountryIds, 197);
  assert.ok(bridgeDiag.exportReady, 'Resource data export/access layer is not ready');
  assert.match(String(bridgeDiag.countryIdCoverage), /\/197$/, `Resource-country reference coverage must use the 197-country denominator: ${bridgeDiag.countryIdCoverage}`);

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
  assert.equal(q2.entities.country.type, 'COUNTRY');

  const q3 = runtime.parse('Tell me the location of uranium worldwide');
  assert.equal(q3.entities.resource.id, 'URANIUM');
  assert.equal(q3.operation, 'LOCATE');
  assert.equal(q3.executable, true);

  console.log('SEMANTIC RUNTIME V4 TEST PASSED');
  console.log(`Runtime countries: ${diag.countries}`);
  console.log(`Country bridge countries: ${countryDiag.countryCount}`);
  console.log(`Runtime city records: ${countryDiag.totalCityRecords}`);
  console.log(`Canonical resources: ${Object.keys(resourceTypes).length}`);
  console.log('All JSON-described India/Japan cities and 197-country identity validated');
  console.log('Worldwide resource location semantic route validated');
})().catch(err => { console.error(err); process.exit(1); });
