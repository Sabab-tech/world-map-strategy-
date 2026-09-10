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
  await new Promise(resolve => setTimeout(resolve, 220));
  const runtime = sandbox.OmegaProductionSemanticRuntime;
  const countryBridge = sandbox.OmegaCountrySemanticBridge;
  const identity = sandbox.OmegaCanonicalIdentityRegistry;
  const resourceBridge = sandbox.OmegaResourceSemanticBridge;
  assert.ok(runtime, 'Production semantic runtime must load');
  assert.ok(countryBridge, 'Country semantic bridge must load');
  assert.ok(identity, 'Canonical identity registry must load');
  assert.ok(resourceBridge, 'Resource semantic bridge must load');

  const countryDiag = identity.diagnostics();
  assert.equal(countryDiag.ready, true, JSON.stringify(countryDiag));
  assert.equal(countryDiag.countryCount, 197, `Expected exactly 197 canonical country IDs, got ${countryDiag.countryCount}`);
  assert.equal(countryDiag.complete, true, JSON.stringify(countryDiag));
  assert.ok(countryDiag.totalCityRecords > 0, 'No city records were ingested from cities.json');

  for (const name of ['Bangladesh', 'India', 'Japan', 'Namibia']) {
    const resolved = identity.resolveCountry(name);
    assert.ok(resolved?.id, `${name} must resolve as a country`);
    assert.equal(resolved.type, 'COUNTRY');
  }

  const namibia = identity.resolveCountry('Namibia');
  assert.equal(namibia.id, 'NA', 'Namibia must resolve to canonical country ID NA');
  assert.equal(identity.resolveCountry('What is the GDP of Namibia?')?.id, 'NA', 'Country ID must survive inside a question');

  const windhoek = identity.resolveCity('Windhoek');
  assert.equal(windhoek?.id, 'NA:windhoek', 'Windhoek must resolve to a deterministic Namibia city ID');
  assert.equal(windhoek?.countryId, 'NA');
  assert.equal(identity.resolveCity('Tell me about Windhoek')?.countryId, 'NA');

  const cityBrief = identity.countryBrief('Namibia');
  assert.equal(cityBrief?.countryId, 'NA');
  assert.equal(cityBrief?.cityCount, cityBrief?.cities?.length);
  assert.ok(cityBrief?.cityCount > 0, 'Namibia city registry must preserve JSON-described cities');

  const india = countryBridge.parseCountry('India', { initialTurn: true });
  assert.equal(india?.entities?.country?.id, 'IN', 'India must resolve to IN, never Bangladesh');
  assert.equal(india?.responseTemplate?.type, 'COUNTRY_FIRST_TURN');
  assert.equal(india?.countryBrief?.countryName, 'India');
  assert.equal(india?.countryBrief?.cityCount, india?.countryBrief?.cities?.length);
  assert.ok(india?.countryBrief?.cityCount > 3, 'Country brief must expose all JSON-described cities, not only three cities');
  assert.deepEqual(india?.countryBrief?.cities?.map(c => c.name), files.get('cities.json').countries.find(c => c.name === 'India').cities.map(c => c.name));

  const indiaPlan = runtime.buildAnswerPlan('India', {}, {}, []);
  assert.equal(indiaPlan?.semantic?.entities?.country?.id, 'IN', 'buildAnswerPlan must use canonical country identity for India');
  assert.equal(indiaPlan?.countryBrief?.countryName, 'India', 'buildAnswerPlan must expose India country brief');
  assert.equal(indiaPlan?.countryBrief?.cityCount, india?.countryBrief?.cityCount, 'buildAnswerPlan must preserve all JSON-described India cities');

  const namibiaPlan = runtime.buildAnswerPlan('What is the GDP of Namibia?', {}, {}, []);
  assert.equal(namibiaPlan?.semantic?.entities?.country?.id, 'NA', 'buildAnswerPlan must resolve Namibia to NA inside a question');
  assert.equal(namibiaPlan?.countryId, 'NA');

  const unknown = identity.resolveCountry('Atlantis');
  assert.equal(unknown, null, 'Unknown country must remain unresolved, never become Bangladesh');

  const bridgeExport = identity.exportData();
  assert.equal(bridgeExport.countries.length, 197, 'Export must contain all 197 canonical countries');
  assert.ok(bridgeExport.countries.every(c => Array.isArray(c.cities)), 'Every exported country must carry its runtime city array');

  const bridgeDiag = resourceBridge.diagnostics();
  assert.equal(bridgeDiag.ready, true, JSON.stringify(bridgeDiag));
  assert.ok(bridgeDiag.countries > 0, 'Resource bridge country registry is empty');
  assert.ok(bridgeDiag.resources > 0, 'Resource bridge registry is empty');
  assert.equal(bridgeDiag.expectedCountryIds, 197);

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

  console.log('SEMANTIC RUNTIME V5 TEST PASSED');
  console.log(`Canonical countries: ${countryDiag.countryCount}`);
  console.log(`Runtime city records: ${countryDiag.totalCityRecords}`);
  console.log(`Canonical resources: ${Object.keys(resourceTypes).length}`);
  console.log('Namibia -> NA and Windhoek -> NA:windhoek validated');
  console.log('India -> IN buildAnswerPlan validated');
  console.log('Unknown-country no-fallback rule validated');
})().catch(err => { console.error(err); process.exit(1); });
