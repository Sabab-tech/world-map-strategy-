const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const root = path.resolve(__dirname, '..');

function readJSON(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (_) { return JSON.parse(new TextDecoder('windows-1252').decode(bytes)); }
}

const required = [
  'offline_language_vocabulary.json','offline_lexicon.json','offline_semantic_knowledge.json',
  'omega_game_language_ontology.json','omega_game_language_source_inventory.json',
  'offline_semantic_brain.js','offline_query_engine.js','omega_game_language_bridge.js',
  'omega_reasoning_dispatcher.js','omega_cognitive_engine.js','omega_ai_integrity_layer.js','omega_language_system.js'
];
for (const file of required) assert.equal(fs.existsSync(path.join(root, file)), true, `missing language source: ${file}`);

const vocab = readJSON('offline_language_vocabulary.json');
const ontology = readJSON('omega_game_language_ontology.json');
const inventory = readJSON('omega_game_language_source_inventory.json');
const lexicon = readJSON('offline_lexicon.json');
const knowledge = readJSON('offline_semantic_knowledge.json');

assert.ok(vocab.languages.en && vocab.languages.bn, 'English and Bengali vocabulary must remain present');
assert.equal(vocab.semantic_policy.world_entities_must_be_loaded_from_runtime_datasets, true);
assert.equal(vocab.semantic_policy.question_meaning_must_be_loaded_from_vocabulary, true);
assert.equal(vocab.semantic_policy.attributes_must_be_loaded_from_vocabulary, true);
assert.equal(vocab.semantic_policy.no_country_catalog_in_code, true);
assert.equal(vocab.semantic_policy.no_resource_catalog_in_code, true);
assert.equal(vocab.semantic_policy.no_asset_alias_catalog_in_code, true);
assert.equal(vocab.semantic_policy.no_answer_fact_catalog_in_code, true);

assert.equal(ontology.canonical_concept_target, 4500);
assert.deepEqual(ontology.grammar.features, ['Person','Number','Case','Tense','Aspect','Mood','Voice','Polarity','Degree','VerbForm']);
assert.deepEqual(ontology.grammar.dependency_relations, ['nsubj','obj','obl','advmod','aux','mark','conj','nmod']);
assert.equal(ontology.operational_rules.unknown_entity, 'UNRESOLVED');
assert.equal(ontology.operational_rules.ambiguous_entity, 'ASK_OR_REPORT_AMBIGUITY');
assert.equal(ontology.operational_rules.unknown_fact, 'UNKNOWN_WHEN_NOT_EVIDENCED');

assert.equal(inventory.counting_rule.includes('Concept records are counted separately'), true);
assert.equal(inventory.source_concept_count, 17);
assert.equal(inventory.raw_surface_entry_count, 332);
assert.equal(inventory.unique_surface_entry_count, 226);
assert.equal(lexicon.TOTAL_WORDS, 7756);
assert.ok(Array.isArray(knowledge.entity_types));
assert.ok(knowledge.entity_types.includes('COUNTRY') && knowledge.entity_types.includes('RESOURCE'));
assert.equal(knowledge.ambiguity_policy.never_default_to_BGD, true);
assert.equal(knowledge.ambiguity_policy.never_default_to_any_resource, true);

const js = fs.readFileSync(path.join(root, 'omega_language_system.js'), 'utf8');
for (const forbidden of ['eval(', 'new Function(', 'Function(']) assert.equal(js.includes(forbidden), false, `forbidden dynamic execution found: ${forbidden}`);
for (const requiredSymbol of ['OmegaLanguageSystem','buildCanonicalIndex','canonicalCandidates','registerConcept','registerEvent','learnPhrase','eventRequest','diagnostics','validate']) assert.ok(js.includes(requiredSymbol), `missing canonical integration symbol: ${requiredSymbol}`);
for (const source of required.slice(0, 5)) assert.ok(js.includes(source), `canonical system does not import ${source}`);
assert.ok(js.includes('pronunciation') && js.includes('pronunciations'), 'pronunciation/phonetic fields must be preserved when present');
assert.ok(js.includes('allowed_actions') && js.includes('EVENT_REQUESTED'), 'action/event vocabulary must be indexed');

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const x of value) collectStrings(x, out);
  else if (value && typeof value === 'object') for (const x of Object.values(value)) collectStrings(x, out);
  return out;
}
const lexicalStringCount = collectStrings(vocab).length + collectStrings(lexicon).length + collectStrings(knowledge).length + collectStrings(ontology).length + collectStrings(inventory).length;
assert.ok(lexicalStringCount > 8000, `unexpectedly small source language corpus: ${lexicalStringCount}`);

console.log('OMEGA_LANGUAGE_SYSTEM_LOSSLESS_IMPORT_CONTRACT_OK');
console.log(JSON.stringify({
  targetConcepts: ontology.canonical_concept_target,
  seedConcepts: ontology.seed_concepts.length,
  sourceConcepts: inventory.source_concept_count,
  rawSurfaceEntries: inventory.raw_surface_entry_count,
  uniqueSurfaceEntries: inventory.unique_surface_entry_count,
  offlineLexiconWords: lexicon.TOTAL_WORDS,
  languages: Object.keys(vocab.languages),
  entityTypes: knowledge.entity_types.length,
  sourceLanguageStrings: lexicalStringCount,
  eventStates: ['EVENT_REQUESTED','EVENT_CONFIRMED','EVENT_REJECTED','EVENT_EXECUTED','EVENT_FAILED','EVENT_PENDING']
}, null, 2));
