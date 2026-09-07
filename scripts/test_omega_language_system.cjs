const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const required = [
  'offline_language_vocabulary.json',
  'offline_lexicon.json',
  'offline_semantic_knowledge.json',
  'omega_game_language_ontology.json',
  'omega_game_language_source_inventory.json',
  'offline_semantic_brain.js',
  'offline_query_engine.js',
  'omega_game_language_bridge.js',
  'omega_reasoning_dispatcher.js',
  'omega_cognitive_engine.js',
  'omega_ai_integrity_layer.js',
  'omega_language_system.js'
];
for (const file of required) assert.equal(fs.existsSync(path.join(root, file)), true, `missing language source: ${file}`);

const vocab = readJSON('offline_language_vocabulary.json');
const ontology = readJSON('omega_game_language_ontology.json');
const inventory = readJSON('omega_game_language_source_inventory.json');
const lexicon = readJSON('offline_lexicon.json');
const knowledge = readJSON('offline_semantic_knowledge.json');

assert.ok(vocab.languages.en && vocab.languages.bn, 'English and Bengali vocabulary must remain present');
assert.equal(vocab.semantic_policy.world_entities_must_be_loaded_from_runtime_datasets, true);
assert.equal(vocab.semantic_policy.no_country_catalog_in_code, true);
assert.equal(vocab.semantic_policy.no_resource_catalog_in_code, true);
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
for (const requiredSymbol of ['OmegaLanguageSystem','analyze','resolve','executeIntent','realize','eventRequest','diagnostics','validate']) assert.ok(js.includes(requiredSymbol), `missing API symbol: ${requiredSymbol}`);

console.log('OMEGA_LANGUAGE_SYSTEM_CONTRACT_OK');
console.log(JSON.stringify({
  targetConcepts: ontology.canonical_concept_target,
  seedConcepts: ontology.seed_concepts.length,
  sourceConcepts: inventory.source_concept_count,
  rawSurfaceEntries: inventory.raw_surface_entry_count,
  uniqueSurfaceEntries: inventory.unique_surface_entry_count,
  offlineLexiconWords: lexicon.TOTAL_WORDS,
  languages: Object.keys(vocab.languages),
  entityTypes: knowledge.entity_types.length
}, null, 2));
