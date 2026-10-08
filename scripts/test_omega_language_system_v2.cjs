const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = name => fs.readFileSync(name, 'utf8');
const json = name => JSON.parse(read(name));
const norm = value => String(value ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[?!,.:;'"“”‘’(){}[\]<>—–/\\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const countriesRaw = json('countries.json');
const countries = Array.isArray(countriesRaw)
  ? countriesRaw
  : (countriesRaw?.countries || countriesRaw?.data || Object.values(countriesRaw || {}));

const resourceOntology = json('resource_ontology.json');
const resources = resourceOntology?.COMMODITY_ONTOLOGIES || {};

const countryNames = row => [
  row?.name,
  row?.officialName,
  row?.shortName,
  ...(Array.isArray(row?.names) ? row.names : []),
  ...(Array.isArray(row?.aliases) ? row.aliases : [])
].filter(Boolean).map(String);

function resolveCountry(surface) {
  const q = norm(surface);
  let best = null;
  for (const row of countries) {
    for (const name of countryNames(row)) {
      const n = norm(name);
      if (!n || !q.includes(n)) continue;
      const id = String(row?.iso3 || row?.iso2 || row?.code || row?.id || '').trim().toUpperCase();
      if (!id) continue;
      const candidate = {
        id,
        type: 'COUNTRY',
        confidence: q === n ? 1 : 0.96,
        surface: name,
        source: 'COUNTRIES_JSON_DYNAMIC',
        raw: row
      };
      if (!best || candidate.confidence > best.confidence || candidate.confidence === best.confidence && candidate.surface.length > best.surface.length) {
        best = candidate;
      }
    }
  }
  return best;
}

function resourceNames(id, record) {
  return [
    id,
    record?.key,
    record?.name,
    ...(Array.isArray(record?.aliases) ? record.aliases : []),
    ...(Array.isArray(record?.names) ? record.names : [])
  ].filter(Boolean).map(String);
}

function resolveResource(surface) {
  const q = norm(surface);
  let best = null;
  for (const [id, record] of Object.entries(resources)) {
    for (const name of resourceNames(id, record)) {
      const n = norm(name);
      if (!n || !q.includes(n)) continue;
      const candidate = {
        id: String(record?.key || id).trim().toUpperCase(),
        type: 'RESOURCE',
        confidence: q === n ? 1 : 0.96,
        surface: name,
        source: 'RESOURCE_ONTOLOGY_JSON_DYNAMIC',
        raw: record
      };
      if (!best || candidate.confidence > best.confidence || candidate.confidence === best.confidence && candidate.surface.length > best.surface.length) {
        best = candidate;
      }
    }
  }
  return best;
}

const knowledge = json('offline_semantic_knowledge.json');
const vocabulary = json('offline_language_vocabulary.json');

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
  Promise,
  Error,
  TypeError,
  TypeError,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  CustomEvent: class {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  },
  dispatchEvent() {},
  OmegaOfflineSemanticKnowledge: knowledge,
  OmegaCanonicalIdentityRegistry: {
    resolveCountry,
    exportData: () => ({ countries })
  },
  OmegaCountrySemanticBridge: null,
  OmegaResourceSemanticBridge: { resolveResource },
  fetch(path) {
    const key = String(path).replace(/^\.\//, '');
    const known = new Set([
      'offline_language_vocabulary.json',
      'offline_lexicon.json',
      'offline_semantic_knowledge.json',
      'omega_game_language_source_inventory.json'
    ]);
    if (key === 'offline_lexicon.json') return Promise.resolve({ ok: true, json: async () => ({}) });
    if (known.has(key)) return Promise.resolve({ ok: true, json: async () => json(key) });
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  }
};
sandbox.OmegaCountrySemanticBridge = sandbox.OmegaCanonicalIdentityRegistry;
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

vm.runInNewContext(read('offline_semantic_brain.js'), sandbox, { filename: 'offline_semantic_brain.js' });
assert.ok(sandbox.OfflineSemanticBrain, 'OfflineSemanticBrain must load before the language bridge is installed');

vm.runInNewContext(read('omega_language_system.js'), sandbox, { filename: 'omega_language_system.js' });
const system = sandbox.OmegaLanguageSystem;
const bridge = sandbox.OmegaGameLanguageBridge;
assert.ok(system, 'OmegaLanguageSystem must load');
assert.equal(system.VERSION, '1.4.0');
assert.equal(system.SCHEMA_VERSION, 'OMEGA-LANGUAGE-SYSTEM/1.4');

vm.runInNewContext(read('omega_language_batch03_semantic_extension.js'), sandbox, { filename: 'omega_language_batch03_semantic_extension.js' });
const batch03 = sandbox.OmegaLanguageBatch03;
assert.ok(batch03, 'Batch 03 extension must load');
assert.equal(batch03.BATCH_ID, 'BATCH_03_DEEP_SEMANTIC');
assert.equal(batch03.SEED_IDS.length, 16);
assert.equal(batch03.buildOntology(system).ontology.seed_concepts.length, 40);

(async () => {
  const beforeLoad = bridge.match('actor', 'en');
  assert.ok(beforeLoad.some(hit => hit.concept_id === 'ACTOR'), 'Batch 03 bridge must be active before canonical source load');

  const loadDiag = await system.load();
  assert.equal(loadDiag.ready, true, JSON.stringify(loadDiag));
  assert.equal(loadDiag.ontologySeedCount, 24, 'Canonical system contract remains 24 seeds');
  assert.equal(bridge.match('actor', 'en').some(hit => hit.concept_id === 'ACTOR'), true, 'Canonical load must not erase the installed Batch 03 bridge');
  assert.equal(bridge.match('decision', 'en').some(hit => hit.concept_id === 'DECISION'), true, 'Batch 03 decision concept must survive canonical source load');
  assert.equal(bridge.match('সম্পদ', 'bn').some(hit => hit.concept_id === 'RESOURCE'), true, 'Canonical Bengali resource vocabulary must remain resolvable');\n  assert.ok(batch03.discourseLexicon.intents.GRATITUDE.phrases.bn.includes('ধন্যবাদ'));

  const validation = system.validate();
  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.equal(system.gameLanguageOntology().seed_concepts.length, 24);
  assert.equal(system.diagnostics().ready, true);

  const en = system.parse('increase production by 15 percent over 5 years');
  assert.equal(en.language, 'en');
  assert.equal(en.contract.unknownFact, 'UNKNOWN_WHEN_NOT_EVIDENCED');
  assert.equal(en.contract.capabilityBoundary, 'LANGUAGE_DOES_NOT_GRANT_EXECUTION_CAPABILITY');

  const bn = system.parse('উৎপাদন ১৫ শতাংশ বাড়াও');
  assert.equal(bn.language, 'bn');
  assert.equal(bn.contract.unknownEntity, 'UNRESOLVED');

  const event = system.eventRequest('increase', {
    target: 'PRODUCTION',
    quantity: 10,
    unit: 'ton',
    duration: '5 years'
  });
  assert.equal(event.type, 'GAME_EVENT_REQUEST');
  assert.equal(event.state, 'EVENT_REQUESTED');
  assert.equal(event.capabilityRequired, true);
  assert.equal(event.executionOwner, 'GAME_CAPABILITY_AND_EVENT_ENGINE');

  assert.equal(system.learnPhrase('test high confidence mapping', 'increase', 'PRODUCTION', 0.94), false);
  assert.equal(system.learnPhrase('test high confidence mapping', 'increase', 'PRODUCTION', 0.95), true);

  const brainQuery = sandbox.OfflineSemanticBrain.parse('How many iron mines are in Bangladesh?');
  assert.equal(brainQuery.entities.country.id, 'BGD');
  assert.equal(brainQuery.entities.resource.id, 'IRON_ORE');
  assert.equal(brainQuery.assetClass, 'MINE');
  assert.equal(brainQuery.operation, 'COUNT');
  assert.equal(brainQuery.executable, true);

  const unknown = sandbox.OfflineSemanticBrain.parse('How many mines are in Atlantis?');
  assert.notEqual(unknown.entities.country.status, 'RESOLVED');
  assert.equal(unknown.entities.country.id, null);
  assert.equal(unknown.executable, false);

  const universal = read('omega_universal_ai_runtime.js');
  const brainLoad = universal.indexOf("if(!global.OfflineSemanticBrain)await loadScript('offline_semantic_brain.js')");
  const queryLoad = universal.indexOf("if(!global.OfflineQueryEngine)await loadScript('offline_query_engine.js')");
  const bridgeReinstall = universal.indexOf("if(global.OmegaGameLanguageBridge?.install)global.OmegaGameLanguageBridge.install();");
  assert.ok(universal.includes('const extension=global.OmegaLanguageBatch03'));
  assert.ok(universal.includes('const installed=extension.install(system)'));
  assert.ok(brainLoad >= 0 && queryLoad > brainLoad && bridgeReinstall > queryLoad, 'Universal browser boot must install the language bridge after the parser exists');

  const languageBootstrap = read('server_bootstrap.js');
  const languageIndex = languageBootstrap.indexOf("'omega_language_system.js'");
  const batch03Index = languageBootstrap.indexOf("'omega_language_batch03_semantic_extension.js'");
  const universalIndex = languageBootstrap.indexOf("'omega_universal_ai_runtime.js'");
  assert.ok(languageIndex >= 0 && batch03Index > languageIndex && universalIndex > batch03Index, 'Server bootstrap must preserve language -> Batch 03 -> universal runtime ordering');

  console.log('OMEGA LANGUAGE SYSTEM v2 REGRESSION: PASS');
  console.log('Canonical ontology: 24 seeds');
  console.log('Batch 03 bridge: 40-seed ontology');
  console.log('English/Bengali bridge and discourse resolution: PASS');
  console.log('Production brain country/resource resolution: PASS');
  console.log('Unknown-entity fail-closed policy: PASS');
  console.log('Event capability boundary: PASS');
  console.log('Browser boot-order regression: PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
