const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const canonical = fs.readFileSync('omega_language_system.js', 'utf8');
const extension = fs.readFileSync('omega_language_batch03_semantic_extension.js', 'utf8');

const sandbox = {
  console,
  Date,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  fetch: async () => ({ ok: true, json: async () => ({}) })
};
vm.createContext(sandbox);
vm.runInContext(canonical, sandbox, { filename: 'omega_language_system.js' });
assert.ok(sandbox.OmegaLanguageSystem, 'canonical language system must load');
assert.equal(sandbox.OmegaLanguageSystem.gameLanguageOntology().seed_concepts.length, 24);

vm.runInContext(extension, sandbox, { filename: 'omega_language_batch03_semantic_extension.js' });
const system = sandbox.OmegaLanguageSystem;
const ontology = system.gameLanguageOntology();
const extensionApi = sandbox.OmegaLanguageBatch03;

assert.ok(extensionApi, 'Batch 03 extension API must be exported');
assert.equal(extensionApi.BATCH_ID, 'BATCH_03_DEEP_SEMANTIC');
assert.equal(extensionApi.SEED_IDS.length, 16);
assert.equal(ontology.seed_concepts.length, 40);
assert.equal(ontology.population_policy.current_seed_count, 40);
assert.equal(ontology.implementation_status, 'BATCH_03_DEEP_SEMANTIC_LOCKED');
assert.equal(ontology.batch_03.seed_ids.length, 16);

const ids = new Set();
for (const concept of ontology.seed_concepts) {
  assert.ok(/^[A-Z][A-Z0-9_]+$/.test(concept.concept_id));
  assert.equal(ids.has(concept.concept_id), false, `duplicate concept: ${concept.concept_id}`);
  ids.add(concept.concept_id);
  assert.ok(concept.semantic_type);
  assert.ok(Array.isArray(concept.semantic_roles));
  assert.ok(Array.isArray(concept.relations));
  assert.ok(concept.runtime_resolution);
  assert.ok(concept.execution_boundary);
}

for (const id of extensionApi.SEED_IDS) {
  const concept = ontology.seed_concepts.find(item => item.concept_id === id);
  assert.ok(concept, `missing Batch 03 seed: ${id}`);
  assert.equal(concept.batch, 3);
  assert.ok(concept.required_slots.length > 0, `${id} has no required semantic slots`);
  assert.ok(concept.composition_rules.length >= 5, `${id} lacks deep composition rules`);
  assert.ok(concept.invalid_compositions.length >= 1, `${id} lacks invalid-composition protection`);
  assert.ok(concept.diagnostics);
  assert.ok(concept.reasoning_contract);
}

const mustBePresent = ['ACTOR','TARGET','ATTRIBUTE','VALUE','CONDITION','CONSTRAINT','THRESHOLD','CAUSE','CONSEQUENCE','DEPENDENCY','RISK','PROBABILITY','GOAL','PRIORITY','SCENARIO','DECISION'];
for (const id of mustBePresent) assert.ok(ids.has(id), `missing required seed ${id}`);

console.log('Batch 03 integration PASS: canonical 24 + Batch 03 16 = 40 seeds.');
