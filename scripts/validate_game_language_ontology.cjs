const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('omega_language_system.js', 'utf8');
const semanticKnowledge = JSON.parse(fs.readFileSync('offline_semantic_knowledge.json', 'utf8'));
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'omega_language_system.js' });
const system = sandbox.OmegaLanguageSystem;
assert.ok(system, 'OmegaLanguageSystem must be exported by the consolidated file');
assert.equal(sandbox.OmegaGameLanguageBridge?.VERSION, '1.0.3');

const ontology = system.gameLanguageOntology();
assert.equal(ontology.schema_version, '1.2.0');
assert.equal(ontology.implementation_status, 'BATCH_02_DEEP_SEMANTIC_LOCKED');
assert.equal(ontology.ontology_id, 'OMEGA_GAME_LANGUAGE');
assert.equal(ontology.canonical_concept_target, 4500);
assert.equal(ontology.domains.reduce((sum, d) => sum + d.target, 0), 5250);
assert.equal(ontology.target_tiers.core_game_language + ontology.target_tiers.advanced_strategy_language + ontology.target_tiers.grammar_discourse_command_language, 4500);
assert.equal(ontology.seed_concepts.length, 24);
assert.equal(ontology.population_policy.current_seed_count, 24);
assert.equal(ontology.population_policy.previous_batch_seed_count, 12);
assert.equal(ontology.population_policy.batch, 'BATCH_02');

const ids = new Set();
const concepts = new Map();
for (const c of ontology.seed_concepts) {
  assert.ok(/^[A-Z][A-Z0-9_]+$/.test(c.concept_id), `Invalid concept_id: ${c.concept_id}`);
  assert.ok(!ids.has(c.concept_id), `Duplicate concept_id: ${c.concept_id}`);
  ids.add(c.concept_id); concepts.set(c.concept_id, c);
  assert.ok(ontology.domains.some(d => d.id === c.domain), `Unknown domain: ${c.domain}`);
  for (const lang of ['en', 'bn']) {
    assert.ok(c.lexical?.[lang]?.lemma, `${c.concept_id}: missing ${lang} lemma`);
    assert.ok(Array.isArray(c.lexical?.[lang]?.aliases), `${c.concept_id}: missing ${lang} aliases`);
    assert.ok(Array.isArray(c.lexical?.[lang]?.forms), `${c.concept_id}: missing ${lang} forms`);
    assert.ok(Array.isArray(c.lexical?.[lang]?.pos), `${c.concept_id}: missing ${lang} POS`);
  }
  for (const field of ['semantic_roles','compatible_variables','compatible_entities','allowed_actions','relations','construction_patterns','phrase_patterns']) assert.ok(Array.isArray(c[field]), `${c.concept_id}: missing ${field}`);
  assert.ok(c.derivational_family?.length); assert.ok(c.morphological_eligibility); assert.ok(c.morphology); assert.ok(c.grammar_features);
  assert.ok(c.runtime_resolution?.strategy); assert.ok(c.compositional_frame?.required_roles); assert.ok(/^P[0-4]$/.test(c.priority));
}
assert.equal(ids.size, 24);

const relation = (id, rel, target) => concepts.get(id)?.relations?.some(r => r.relation === rel && r.target === target);
const requireRelation = (id, rel, target) => assert.equal(relation(id, rel, target), true, `${id} must ${rel} ${target}`);

requireRelation('RESOURCE_PRODUCTION','child_of','STATE_VARIABLE');
requireRelation('RESOURCE_PRODUCTION','measured_by','QUANTITY');
requireRelation('RESOURCE_PRODUCTION','measured_as','RATE');
requireRelation('RESOURCE_PRODUCTION','constrained_by','CAPACITY');
requireRelation('RESOURCE_PRODUCTION','changed_by','ACTION_INCREASE');
requireRelation('RESOURCE_PRODUCTION','changed_by','ACTION_DECREASE');
requireRelation('CAPACITY','affected_by','INVESTMENT');
requireRelation('CAPACITY','associated_with','PRODUCTION_FACILITY');
requireRelation('PRODUCTION_FACILITY','produces','RESOURCE');
requireRelation('PRODUCTION_FACILITY','has','CAPACITY');
requireRelation('PRODUCTION_FACILITY','affected_by','INVESTMENT');
requireRelation('INVESTMENT','affects','CAPACITY');
requireRelation('INVESTMENT','affects','PRODUCTION');
requireRelation('DEMAND','related_to','PRICE');
requireRelation('DEMAND','related_to','SUPPLY');
requireRelation('SUPPLY','paired_with','DEMAND');
requireRelation('SUPPLY','constrained_by','CAPACITY');
requireRelation('PRICE','distinct_from','COST');
requireRelation('ACTION_INCREASE','operates_on','STATE_VARIABLE');
requireRelation('ACTION_DECREASE','operates_on','STATE_VARIABLE');
requireRelation('RESOURCE','semantic_root_for','RESOURCE_PRODUCTION');

requireRelation('QUANTITY','expressed_in','UNIT');
requireRelation('QUANTITY','can_be_rate','RATE');
requireRelation('RATE','distinct_from','QUANTITY');
requireRelation('RATE','expressed_in','UNIT');
requireRelation('RATIO','distinct_from','PERCENTAGE');
requireRelation('RATIO','can_be_rendered_as','PERCENTAGE');
requireRelation('PERCENTAGE','is_unit_for','RELATIVE_CHANGE');
requireRelation('PERCENTAGE','is_magnitude_of','CHANGE_DELTA');
requireRelation('TIME_POINT','anchors','TIME_PERIOD');
requireRelation('TIME_POINT','distinct_from','TIME_DURATION');
requireRelation('TIME_DURATION','distinct_from','TIME_POINT');
requireRelation('TIME_PERIOD','anchors','BASELINE');
requireRelation('FREQUENCY','distinct_from','RATE');
requireRelation('BASELINE','reference_for','CHANGE_DELTA');
requireRelation('BASELINE','reference_for','RELATIVE_CHANGE');
requireRelation('CHANGE_DELTA','distinct_from','RELATIVE_CHANGE');
requireRelation('CHANGE_DELTA','expressed_by','QUANTITY');
requireRelation('RELATIVE_CHANGE','represented_by','PERCENTAGE');
requireRelation('RELATIVE_CHANGE','distinct_from','CHANGE_DELTA');

for (const invariant of ontology.semantic_invariants) assert.ok(typeof invariant === 'string' && invariant.includes('!='));
for (const invariant of ['QUANTITY != RATE','RATIO != PERCENTAGE','PERCENTAGE != ACTION_INCREASE','TIME_POINT != TIME_DURATION','TIME_PERIOD != TIME_DURATION','FREQUENCY != RATE','CHANGE_DELTA != RELATIVE_CHANGE','CAPACITY != PRODUCTION','PRICE != COST','SUPPLY != PRODUCTION']) assert.ok(ontology.semantic_invariants.includes(invariant), invariant);
assert.equal(concepts.get('ACTION_DECREASE').grammar_features.direction, 'NEGATIVE_CHANGE');
assert.equal(concepts.get('ACTION_INCREASE').grammar_features.direction, 'POSITIVE_CHANGE');
assert.equal(concepts.get('CHANGE_DELTA').runtime_resolution.formula, 'to_value - from_value');
assert.equal(concepts.get('RELATIVE_CHANGE').runtime_resolution.formula, '(to_value - from_value) / from_value');
assert.equal(concepts.get('UNIT').runtime_resolution.never.includes('invent_conversion_factor'), true);
assert.equal(concepts.get('COUNTRY').runtime_resolution.never.includes('hardcoded_country_catalog'), true);
assert.equal(concepts.get('RESOURCE').runtime_resolution.never.includes('hardcoded_resource_catalog'), true);
for (const feature of ['Person','Number','Case','Tense','Aspect','Mood','Voice','Polarity','Degree','VerbForm']) assert.ok(ontology.grammar.features.includes(feature));
for (const rel of ['nsubj','obj','obl','advmod','aux','mark','conj','nmod']) assert.ok(ontology.grammar.dependency_relations.includes(rel));
assert.ok(!system.SOURCE_PATHS.includes('omega_game_language_bridge.js'));
assert.ok(!system.SOURCE_PATHS.includes('omega_game_language_ontology.json'));
assert.ok(system.EMBEDDED_SOURCE_PATHS.includes('<embedded:omega_game_language_bridge.js>'));
assert.ok(system.EMBEDDED_SOURCE_PATHS.includes('<embedded:omega_game_language_ontology.json>'));
assert.equal(typeof sandbox.OmegaGameLanguageBridge.match, 'function');
assert.equal(typeof sandbox.OmegaGameLanguageBridge.enrich, 'function');
assert.equal(typeof sandbox.OmegaGameLanguageBridge.install, 'function');

const primitiveIds = ['QUANTITY','RATE','RATIO','PERCENTAGE','UNIT','TIME_POINT','TIME_DURATION','TIME_PERIOD','FREQUENCY','BASELINE','CHANGE_DELTA','RELATIVE_CHANGE'];
const primitiveContract = semanticKnowledge.semantic_control_primitives;
assert.equal(primitiveContract.schema_version, '1.0.0');
assert.equal(primitiveContract.global_contract.required_layers.length, 17);
for (const id of primitiveIds) {
  const c = primitiveContract[id];
  assert.ok(c, `Missing deep semantic control primitive: ${id}`);
  for (const field of primitiveContract.global_contract.required_layers) assert.ok(c[field] !== undefined, `${id}: missing deep layer ${field}`);
  assert.ok(Array.isArray(c.allowed_composition), `${id}: allowed_composition missing`);
  assert.ok(Array.isArray(c.invalid_composition), `${id}: invalid_composition missing`);
  assert.ok(c.runtime_resolution_policy?.strategy, `${id}: runtime resolution strategy missing`);
  assert.equal(c.game_state_mutation_authority, 'NONE', `${id}: measurement/time/comparison primitives cannot directly mutate game state`);
}
assert.equal(primitiveContract.QUANTITY.measurement_semantics.stock_flow_guard, true);
assert.equal(primitiveContract.RATE.measurement_semantics.capacity_actual_guard, true);
assert.equal(primitiveContract.RATIO.measurement_semantics.ordering_significant, true);
assert.equal(primitiveContract.RATIO.measurement_semantics.zero_denominator_guard, true);
assert.equal(primitiveContract.PERCENTAGE.measurement_semantics.not_an_action, true);
assert.equal(primitiveContract.UNIT.runtime_resolution_policy.never.includes('invent_conversion_factor'), true);
assert.equal(primitiveContract.TIME_POINT.temporal_semantics.kind, 'anchor');
assert.equal(primitiveContract.TIME_DURATION.temporal_semantics.kind, 'execution_or_decay_horizon');
assert.equal(primitiveContract.TIME_PERIOD.temporal_semantics.kind, 'simulation_or_analysis_window');
assert.equal(primitiveContract.FREQUENCY.temporal_semantics.kind, 'recurrence_semantics');
assert.equal(primitiveContract.BASELINE.measurement_semantics.kind, 'reference');
assert.equal(primitiveContract.CHANGE_DELTA.measurement_semantics.formula, 'to_value - from_value');
assert.equal(primitiveContract.RELATIVE_CHANGE.measurement_semantics.zero_baseline_guard, true);
assert.equal(primitiveContract.RELATIVE_CHANGE.measurement_semantics.sign_preservation, true);

console.log(`OMEGA consolidated game-language validation: PASS (${ids.size} seeds; 12 new Batch 02 concepts; deep semantic control contract v${primitiveContract.schema_version}; measurement/time/comparison graph locked; bridge v${sandbox.OmegaGameLanguageBridge.VERSION})`);
