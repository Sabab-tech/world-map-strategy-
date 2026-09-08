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
assert.equal(ontology.domains.reduce((sum, d) => sum + d.target, 0), 5250);
assert.equal(ontology.target_tiers.core_game_language + ontology.target_tiers.advanced_strategy_language + ontology.target_tiers.grammar_discourse_command_language, 4500);
assert.equal(ontology.seed_concepts.length, ontology.population_policy.current_seed_count);

const ids = new Set();
const concepts = new Map();
for (const c of ontology.seed_concepts) {
  assert.ok(/^[A-Z][A-Z0-9_]+$/.test(c.concept_id), `Invalid concept_id: ${c.concept_id}`);
  assert.ok(!ids.has(c.concept_id), `Duplicate concept_id: ${c.concept_id}`);
  ids.add(c.concept_id);
  concepts.set(c.concept_id, c);
  assert.ok(ontology.domains.some(d => d.id === c.domain), `Unknown domain: ${c.domain}`);
  for (const lang of ['en', 'bn']) {
    assert.ok(c.lexical?.[lang]?.lemma, `${c.concept_id}: missing ${lang} lemma`);
    assert.ok(Array.isArray(c.lexical?.[lang]?.aliases), `${c.concept_id}: missing ${lang} aliases`);
    assert.ok(Array.isArray(c.lexical?.[lang]?.forms), `${c.concept_id}: missing ${lang} forms`);
    assert.ok(Array.isArray(c.lexical?.[lang]?.pos), `${c.concept_id}: missing ${lang} POS`);
  }
  for (const field of ['semantic_roles','compatible_variables','compatible_entities','allowed_actions','relations','construction_patterns','phrase_patterns']) {
    assert.ok(Array.isArray(c[field]), `${c.concept_id}: missing ${field}`);
  }
  assert.ok(c.derivational_family?.length, `${c.concept_id}: missing derivational family`);
  assert.ok(c.morphological_eligibility && typeof c.morphological_eligibility === 'object', `${c.concept_id}: missing morphology eligibility`);
  assert.ok(c.runtime_resolution && typeof c.runtime_resolution.strategy === 'string', `${c.concept_id}: missing runtime resolution`);
  assert.ok(/^P[0-4]$/.test(c.priority));
}

const relation = (id, rel, target) => concepts.get(id)?.relations?.some(r => r.relation === rel && r.target === target);
const requireRelation = (id, rel, target) => assert.equal(relation(id, rel, target), true, `${id} must ${rel} ${target}`);

/* Deep semantic graph integrity: anchors must connect to one another, not merely coexist. */
requireRelation('RESOURCE_PRODUCTION', 'child_of', 'STATE_VARIABLE');
requireRelation('RESOURCE_PRODUCTION', 'measured_by', 'QUANTITY');
requireRelation('RESOURCE_PRODUCTION', 'measured_as', 'RATE');
requireRelation('RESOURCE_PRODUCTION', 'constrained_by', 'CAPACITY');
requireRelation('RESOURCE_PRODUCTION', 'changed_by', 'ACTION_INCREASE');
requireRelation('RESOURCE_PRODUCTION', 'changed_by', 'ACTION_DECREASE');
requireRelation('CAPACITY', 'affected_by', 'INVESTMENT');
requireRelation('CAPACITY', 'associated_with', 'PRODUCTION_FACILITY');
requireRelation('PRODUCTION_FACILITY', 'produces', 'RESOURCE');
requireRelation('PRODUCTION_FACILITY', 'has_capacity', 'CAPACITY');
requireRelation('PRODUCTION_FACILITY', 'affected_by', 'INVESTMENT');
requireRelation('INVESTMENT', 'affects', 'CAPACITY');
requireRelation('INVESTMENT', 'affects', 'PRODUCTION');
requireRelation('DEMAND', 'related_to', 'PRICE');
requireRelation('DEMAND', 'related_to', 'SUPPLY');
requireRelation('SUPPLY', 'paired_with', 'DEMAND');
requireRelation('SUPPLY', 'constrained_by', 'CAPACITY');
requireRelation('PRICE', 'distinct_from', 'COST');
requireRelation('ACTION_INCREASE', 'operates_on', 'STATE_VARIABLE');
requireRelation('ACTION_DECREASE', 'operates_on', 'STATE_VARIABLE');
requireRelation('ACTION_INCREASE', 'action_family', 'ACTION_DECREASE');
requireRelation('ACTION_DECREASE', 'action_family', 'ACTION_INCREASE');
requireRelation('RESOURCE', 'semantic_root_for', 'RESOURCE_PRODUCTION');

/* Semantic-role integrity prevents a concept from becoming a decorative dictionary entry. */
assert.ok(concepts.get('ACTION_INCREASE').semantic_roles.includes('TARGET'));
assert.ok(concepts.get('ACTION_INCREASE').semantic_roles.includes('AMOUNT'));
assert.ok(concepts.get('ACTION_INCREASE').semantic_roles.includes('UNIT'));
assert.ok(concepts.get('ACTION_INCREASE').semantic_roles.includes('TIME_HORIZON'));
assert.ok(concepts.get('ACTION_INCREASE').semantic_roles.includes('CONSTRAINT'));
assert.ok(concepts.get('ACTION_INCREASE').semantic_roles.includes('CONDITION'));
assert.equal(concepts.get('ACTION_DECREASE').grammar_features.direction, 'NEGATIVE_CHANGE');
assert.equal(concepts.get('ACTION_INCREASE').grammar_features.direction, 'POSITIVE_CHANGE');
assert.equal(concepts.get('PRICE').runtime_resolution.never.includes('invent_currency_or_numeric_value'), true);
assert.equal(concepts.get('COUNTRY').runtime_resolution.never.includes('hardcoded_country_catalog'), true);
assert.equal(concepts.get('PRODUCTION_FACILITY').runtime_resolution.never.includes('hardcoded_facility_catalog'), true);

for (const feature of ['Person','Number','Case','Tense','Aspect','Mood','Voice','Polarity','Degree','VerbForm']) assert.ok(ontology.grammar.features.includes(feature));
for (const rel of ['nsubj','obj','obl','advmod','aux','mark','conj','nmod']) assert.ok(ontology.grammar.dependency_relations.includes(rel));

assert.equal(system.SOURCE_MANIFEST.omega_game_language_ontology.embedded, true);
assert.equal(system.SOURCE_MANIFEST.omega_game_language_bridge.embedded, true);
assert.ok(!system.SOURCE_PATHS.includes('omega_game_language_bridge.js'));
assert.ok(!system.SOURCE_PATHS.includes('omega_game_language_ontology.json'));
assert.ok(typeof sandbox.OmegaGameLanguageBridge.match === 'function');
assert.ok(typeof sandbox.OmegaGameLanguageBridge.enrich === 'function');
assert.ok(typeof sandbox.OmegaGameLanguageBridge.install === 'function');

console.log(`OMEGA consolidated game-language validation: PASS (${ids.size} embedded seed concepts; ${ontology.canonical_concept_target} canonical target; deep semantic graph locked; bridge v${sandbox.OmegaGameLanguageBridge.VERSION})`);
