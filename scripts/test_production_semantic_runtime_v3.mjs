import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8'));
const source = fs.readFileSync(new URL('../omega_production_semantic_runtime_v3.js', import.meta.url), 'utf8');
const vocabulary = read('offline_language_vocabulary.json');
const knowledge = read('offline_semantic_knowledge.json');
const countries = read('countries.json');
const ministers = read('ministers.json');
const ontology = read('resource_ontology.json');
const resources = read('resources.json');

const files = new Map([
  ['/offline_language_vocabulary.json', vocabulary],
  ['/offline_semantic_knowledge.json', knowledge],
  ['/countries.json', countries],
  ['/ministers.json', ministers],
  ['/resource_ontology.json', ontology],
  ['/resources.json', resources]
]);

const listeners = new Map();
const sandbox = {
  console,
  Date,
  JSON,
  Object,
  Number,
  String,
  RegExp,
  Map,
  Set,
  Array,
  Math,
  Promise,
  URL,
  setTimeout,
  clearTimeout,
  localStorage: {
    data: new Map(),
    getItem(k){ return this.data.get(k) ?? null; },
    setItem(k,v){ this.data.set(k,String(v)); }
  },
  fetch: async path => ({ ok:true, async json(){ return files.get(path); } }),
  dispatchEvent(event){ (listeners.get(event.type) || []).forEach(fn => fn(event)); return true; },
  addEventListener(type,fn){ const s=listeners.get(type)||new Set(); s.add(fn); listeners.set(type,s); },
  CustomEvent: class CustomEvent { constructor(type,init={}){ this.type=type; this.detail=init.detail; } },
  Game: { state: { countryId: 'BD', playerCountryId: 'BD' } },
  OmegaMinisterState: {}
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename:'omega_production_semantic_runtime_v3.js' });

await new Promise(resolve => setTimeout(resolve, 10));
const api = sandbox.OmegaProductionSemanticRuntime;
assert.ok(api, 'production semantic runtime must load');
const diag = api.diagnostics();
assert.equal(diag.ready, true, 'semantic runtime must become ready');
assert.ok(diag.countries >= 190, `expected the country dataset to be broad, got ${diag.countries}`);
assert.ok(diag.resources >= Object.keys(ontology.COMMODITY_ONTOLOGIES || {}).length, 'resource ontology must be indexed dynamically');

const age = api.parse('How old are you?', { ministerId: 'Finance_1', countryId:'BD', ministryId:'Finance' });
assert.equal(age.question.type, 'HOW_OLD');
assert.equal(age.operation, 'ATTRIBUTE');
assert.equal(age.attribute.name, 'age');

const where = api.parse('Where are the oil mines in Germany?');
assert.equal(where.question.type, 'LOCATION');
assert.equal(where.entities.country.id, 'DE');
assert.equal(where.entities.resource.id, 'CRUDE_OIL');
assert.equal(where.operation, 'LOCATE');

const count = api.parse('How many mines are in Germany?');
assert.equal(count.question.type, 'COUNT');
assert.equal(count.entities.country.id, 'DE');
assert.equal(count.operation, 'COUNT');

const bangla = api.parse('বাংলাদেশে কয়টি লোহার খনি আছে?');
assert.equal(bangla.question.type, 'COUNT');
assert.equal(bangla.entities.country.id, 'BD');
assert.equal(bangla.entities.resource.id, 'IRON_ORE');
assert.equal(bangla.operation, 'COUNT');

const unknown = api.parse('How many mines are in Atlantis?');
assert.equal(unknown.entities.country.id, null, 'unknown country must not silently map to a known country');
assert.ok(unknown.unresolved.includes('COUNTRY') || !unknown.executable, 'unknown entity must remain unresolved');

console.log('OMEGA production semantic runtime V3 regression tests: PASS');
