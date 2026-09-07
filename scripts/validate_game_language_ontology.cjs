const assert = require('node:assert/strict');
const fs = require('node:fs');

const ontology = JSON.parse(fs.readFileSync('omega_game_language_ontology.json', 'utf8'));
assert.equal(ontology.ontology_id, 'OMEGA_GAME_LANGUAGE');
assert.equal(ontology.canonical_concept_target, 4500);
assert.equal(ontology.domains.reduce((sum, d) => sum + d.target, 0), 5200);
assert.equal(ontology.target_tiers.core_game_language + ontology.target_tiers.advanced_strategy_language + ontology.target_tiers.grammar_discourse_command_language, 4500);

const ids = new Set();
for (const c of ontology.seed_concepts) {
  assert.ok(/^[A-Z][A-Z0-9_]+$/.test(c.concept_id), `Invalid concept_id: ${c.concept_id}`);
  assert.ok(!ids.has(c.concept_id), `Duplicate concept_id: ${c.concept_id}`);
  ids.add(c.concept_id);
  assert.ok(ontology.domains.some(d => d.id === c.domain), `Unknown domain: ${c.domain}`);
  for (const lang of ['en', 'bn']) {
    assert.ok(c.lexical?.[lang]?.lemma, `${c.concept_id}: missing ${lang} lemma`);
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

console.log(`OMEGA game-language ontology validation: PASS (${ids.size} seed concepts; ${ontology.canonical_concept_target} canonical target)`);
