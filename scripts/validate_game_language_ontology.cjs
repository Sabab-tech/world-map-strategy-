const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('omega_language_system.js', 'utf8');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'omega_language_system.js' });

const system = sandbox.OmegaLanguageSystem;
assert.ok(system, 'OmegaLanguageSystem must be exported by the consolidated file');
assert.equal(sandbox.OmegaGameLanguageBridge?.VERSION, '1.0.2');

const ontology = system.gameLanguageOntology();
assert.equal(ontology.schema_version, '1.1.0');
assert.equal(ontology.ontology_id, 'OMEGA_GAME_LANGUAGE');
assert.equal(ontology.canonical_concept_target, 4500);
assert.equal(ontology.domains.reduce((sum, d) => sum + d.target, 0), 5200);
assert.equal(ontology.target_tiers.core_game_language + ontology.target_tiers.advanced_strategy_language + ontology.target_tiers.grammar_discourse_command_language, 4500);
assert.equal(ontology.seed_concepts.length, ontology.population_policy.current_seed_count);

const ids = new Set();
for (const c of ontology.seed_concepts) {
  assert.ok(/^[A-Z][A-Z0-9_]+$/.test(c.concept_id), `Invalid concept_id: ${c.concept_id}`);
  assert.ok(!ids.has(c.concept_id), `Duplicate concept_id: ${c.concept_id}`);
  ids.add(c.concept_id);
  assert.ok(ontology.domains.some(d => d.id === c.domain), `Unknown domain: ${c.domain}`);
  for (const lang of ['en', 'bn']) {
    assert.ok(c.lexical?.[lang]?.lemma, `${c.concept_id}: missing ${lang} lemma`);
    assert.ok(Array.isArray(c.lexical?.[lang]?.aliases), `${c.concept_id}: missing ${lang} aliases`);
    assert.ok(Array.isArray(c.lexical?.[lang]?.forms), `${c.concept_id}: missing ${lang} forms`);
    assert.ok(Array.isArray(c.lexical?.[lang]?.pos), `${c.concept_id}: missing ${lang} POS`);
  }
  assert.ok(Array.isArray(c.semantic_roles));
  assert.ok(Array.isArray(c.allowed_actions));
  assert.ok(Array.isArray(c.compatible_variables));
  assert.ok(Array.isArray(c.compatible_entities));
  assert.ok(Array.isArray(c.phrase_patterns));
  assert.ok(/^P[0-4]$/.test(c.priority));
}

for (const feature of ['Person','Number','Case','Tense','Aspect','Mood','Voice','Polarity','Degree','VerbForm']) assert.ok(ontology.grammar.features.includes(feature));
for (const rel of ['nsubj','obj','obl','advmod','aux','mark','conj','nmod']) assert.ok(ontology.grammar.dependency_relations.includes(rel));

assert.equal(system.SOURCE_MANIFEST.omega_game_language_ontology.embedded, true);
assert.equal(system.SOURCE_MANIFEST.omega_game_language_bridge.embedded, true);
assert.ok(!system.SOURCE_PATHS.includes('omega_game_language_bridge.js'));
assert.ok(!system.SOURCE_PATHS.includes('omega_game_language_ontology.json'));
assert.ok(typeof sandbox.OmegaGameLanguageBridge.match === 'function');
assert.ok(typeof sandbox.OmegaGameLanguageBridge.enrich === 'function');
assert.ok(typeof sandbox.OmegaGameLanguageBridge.install === 'function');

console.log(`OMEGA consolidated game-language validation: PASS (${ids.size} embedded seed concepts; ${ontology.canonical_concept_target} canonical target; bridge v${sandbox.OmegaGameLanguageBridge.VERSION})`);
