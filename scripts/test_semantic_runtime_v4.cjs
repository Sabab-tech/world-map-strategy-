const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('./omega_production_semantic_runtime_v3.js', 'utf8');
const files = new Map([
  ['offline_language_vocabulary.json', JSON.parse(fs.readFileSync('./offline_language_vocabulary.json', 'utf8'))],
  ['offline_semantic_knowledge.json', JSON.parse(fs.readFileSync('./offline_semantic_knowledge.json', 'utf8'))],
  ['countries.json', JSON.parse(fs.readFileSync('./countries.json', 'utf8'))],
  ['ministers.json', JSON.parse(fs.readFileSync('./ministers.json', 'utf8'))],
  ['resource_ontology.json', JSON.parse(fs.readFileSync('./resource_ontology.json', 'utf8'))],
  ['resources.json', JSON.parse(fs.readFileSync('./resources.json', 'utf8'))],
  ['resources_2.json', JSON.parse(fs.readFileSync('./resources_2.json', 'utf8'))]
]);

const sandbox = {
  console,
  Date,
  JSON,
  Object,
  Array,
  Map,
  Set,
  Math,
  RegExp,
  String,
  Number,
  Intl,
  Promise,
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  dispatchEvent() {},
  localStorage: {
    _data: new Map(),
    getItem(k) { return this._data.get(k) ?? null; },
    setItem(k, v) { this._data.set(k, String(v)); }
  },
  Game: { state: {} },
  fetch(path) {
    const key = String(path).replace(/^\//, '');
    if (!files.has(key)) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    return Promise.resolve({ ok: true, status: 200, json: async () => files.get(key) });
  }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

vm.runInNewContext(source, sandbox, { filename: 'omega_production_semantic_runtime_v3.js' });

(async () => {
  await new Promise(resolve => setTimeout(resolve, 20));
  const runtime = sandbox.OmegaProductionSemanticRuntime;
  assert.ok(runtime);
  const diag = runtime.diagnostics();
  assert.equal(diag.ready, true, JSON.stringify(diag));
  assert.ok(diag.countries >= 190, `Country registry too small: ${diag.countries}`);
  assert.ok(diag.resources > 0, 'Resource registry is empty');
  assert.ok(diag.ministers > 0, 'Minister registry is empty');

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

  const unknown = runtime.parse('How many mines are in Atlantis?');
  assert.equal(unknown.entities.country.id, null);
  assert.equal(unknown.executable, false);

  const sourceText = source.toLowerCase();
  for (const forbidden of ['bangladesh', 'germany', 'india', 'iron_ore', 'crude_oil']) {
    assert.equal(sourceText.includes(forbidden), false, `Country/resource fact leaked into runtime code: ${forbidden}`);
  }

  console.log(JSON.stringify({ ok: true, diagnostics: diag, cases: 7, hardcodeGuard: true }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
