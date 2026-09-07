const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'omega_language_system.js');
assert.equal(fs.existsSync(file), true, 'canonical standalone language system is missing');

const js = fs.readFileSync(file, 'utf8');
assert.ok(js.includes('OMEGA LANGUAGE SYSTEM v2.0.0-STANDALONE'), 'standalone bundle marker missing');
assert.ok(js.includes('STATUS:\'STANDALONE_READY\''), 'standalone readiness API missing');
assert.ok(js.includes('EMBEDDED_SOURCE_DATA'), 'embedded source corpus missing');

const executable = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
for (const forbidden of ['eval(', 'new Function(', 'Function(', 'document.createElement(\'script\')', 'document.createElement("script")']) {
  assert.equal(executable.includes(forbidden), false, `forbidden dynamic execution/loading found: ${forbidden}`);
}
for (const forbidden of ['loadScript(', 'fetchJSON(', 'fetch(./', "fetch('./offline_", "fetch('/offline_"]) {
  assert.equal(executable.includes(forbidden), false, `legacy runtime dependency found: ${forbidden}`);
}

for (const source of [
  'offline_language_vocabulary.json','offline_lexicon.json','offline_semantic_knowledge.json',
  'omega_game_language_ontology.json','omega_game_language_source_inventory.json',
  'offline_semantic_brain.js','offline_query_engine.js','omega_game_language_bridge.js','omega_reasoning_dispatcher.js'
]) assert.ok(js.includes(source), `embedded source marker missing: ${source}`);

for (const symbol of ['OmegaLanguageSystem','configure','parse','executeIntent','realize','run','eventRequest','learnPhrase','sourceData','diagnostics','validate']) {
  assert.ok(js.includes(symbol), `canonical standalone API symbol missing: ${symbol}`);
}
assert.ok(js.includes('EVENT_REQUESTED') && js.includes('EVENT_CONFIRMED') && js.includes('EVENT_EXECUTED'), 'event lifecycle missing');
assert.ok(js.includes('pronunciation') && js.includes('pronunciations') && js.includes('phonetic') && js.includes('ipa'), 'pronunciation fields are not embedded/indexable');

// Execute the actual bundle in a Node-like browser shim and inspect its embedded corpus.
global.window = global;
require(file);
const language = global.OmegaLanguageSystem;
assert.ok(language, 'OmegaLanguageSystem failed to initialize');
assert.equal(language.STATUS, 'STANDALONE_READY');

const sources = language.sourceData();
for (const name of [
  'offline_language_vocabulary.json','offline_lexicon.json','offline_semantic_knowledge.json',
  'omega_game_language_ontology.json','omega_game_language_source_inventory.json'
]) assert.ok(sources[name], `embedded JSON source missing: ${name}`);

const walkStrings = (value, out = []) => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const x of value) walkStrings(x, out);
  else if (value && typeof value === 'object') for (const x of Object.values(value)) walkStrings(x, out);
  return out;
};
const allStrings = walkStrings(sources);
const lexicon = sources['offline_lexicon.json'];
const ontology = sources['omega_game_language_ontology.json'];
const inventory = sources['omega_game_language_source_inventory.json'];
const vocabulary = sources['offline_language_vocabulary.json'];
const knowledge = sources['offline_semantic_knowledge.json'];

assert.equal(lexicon.TOTAL_WORDS, 7756, 'embedded lexicon word count changed');
assert.equal(ontology.canonical_concept_target, 4500, 'ontology canonical concept target changed');
assert.equal(inventory.source_concept_count, 17, 'source concept count changed');
assert.equal(inventory.raw_surface_entry_count, 332, 'raw surface count changed');
assert.equal(inventory.unique_surface_entry_count, 226, 'unique surface count changed');
assert.ok(vocabulary.languages?.en && vocabulary.languages?.bn, 'bilingual vocabulary missing');
assert.equal(vocabulary.semantic_policy.world_entities_must_be_loaded_from_runtime_datasets, true);
assert.equal(vocabulary.semantic_policy.no_country_catalog_in_code, true);
assert.equal(vocabulary.semantic_policy.no_resource_catalog_in_code, true);
assert.equal(vocabulary.semantic_policy.no_asset_alias_catalog_in_code, true);
assert.equal(vocabulary.semantic_policy.no_answer_fact_catalog_in_code, true);
assert.equal(ontology.operational_rules.unknown_entity, 'UNRESOLVED');
assert.equal(ontology.operational_rules.ambiguous_entity, 'ASK_OR_REPORT_AMBIGUITY');
assert.equal(ontology.operational_rules.unknown_fact, 'UNKNOWN_WHEN_NOT_EVIDENCED');
assert.ok(knowledge.entity_types.includes('COUNTRY') && knowledge.entity_types.includes('RESOURCE'));
assert.equal(knowledge.ambiguity_policy.never_default_to_BGD, true);
assert.equal(knowledge.ambiguity_policy.never_default_to_any_resource, true);
assert.ok(allStrings.length > 8000, `embedded source corpus unexpectedly small: ${allStrings.length}`);

const diagnostics = language.diagnostics();
assert.equal(diagnostics.standalone, true);
assert.equal(diagnostics.externalLanguageFileDependency, false);
assert.equal(diagnostics.lexiconTotalWords, 7756);
assert.equal(diagnostics.inventory.rawSurfaceEntries, 332);
assert.equal(diagnostics.inventory.uniqueSurfaceEntries, 226);

const en = language.parse('How many iron mines are in Bangladesh?');
const bn = language.parse('বাংলাদেশে কয়টি লোহার খনি আছে?');
assert.ok(en && bn, 'English/Bengali parser smoke failed');
assert.equal(en.standalone, true);
assert.equal(bn.standalone, true);

console.log('OMEGA_LANGUAGE_SYSTEM_STANDALONE_CONTRACT_OK');
console.log(JSON.stringify({
  version: language.VERSION,
  status: language.STATUS,
  targetConcepts: ontology.canonical_concept_target,
  seedConcepts: Array.isArray(ontology.seed_concepts) ? ontology.seed_concepts.length : null,
  sourceConcepts: inventory.source_concept_count,
  rawSurfaceEntries: inventory.raw_surface_entry_count,
  uniqueSurfaceEntries: inventory.unique_surface_entry_count,
  offlineLexiconWords: lexicon.TOTAL_WORDS,
  embeddedStrings: allStrings.length,
  languages: Object.keys(vocabulary.languages),
  entityTypes: knowledge.entity_types.length,
  externalLanguageFileDependency: diagnostics.externalLanguageFileDependency,
  parserLoaded: diagnostics.parser,
  queryEngineLoaded: diagnostics.queryEngine,
  bridgeLoaded: diagnostics.bridge,
  dispatcherLoaded: diagnostics.dispatcher
}, null, 2));
