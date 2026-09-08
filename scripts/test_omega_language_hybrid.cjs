const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  const source = fs.readFileSync('omega_language_system.js', 'utf8');
  assert.doesNotThrow(() => new vm.Script(source, { filename: 'omega_language_system.js' }));

  const vocabulary = {
    languages: { en: {}, bn: {} },
    semantic_policy: {
      world_entities_must_be_loaded_from_runtime_datasets: true,
      question_meaning_must_be_loaded_from_vocabulary: true,
      attributes_must_be_loaded_from_vocabulary: true,
      no_country_catalog_in_code: true,
      no_resource_catalog_in_code: true,
      no_asset_alias_catalog_in_code: true,
      no_answer_fact_catalog_in_code: true,
      unknown_entity_action: 'UNRESOLVED',
      ambiguous_entity_action: 'ASK_OR_REPORT_AMBIGUITY'
    }
  };

  const sandbox = {
    console,
    Date,
    setTimeout,
    clearTimeout,
    fetch: async (url) => ({
      ok: true,
      json: async () => String(url).endsWith('offline_language_vocabulary.json') ? vocabulary : {}
    }),
    document: {
      scripts: [],
      createElement: () => ({ src: '', async: false, onload: null, onerror: null }),
      head: { appendChild: (script) => { if (typeof script.onload === 'function') script.onload(); } }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'omega_language_system.js' });

  const system = sandbox.OmegaLanguageSystem;
  const bridge = sandbox.OmegaGameLanguageBridge;
  assert.ok(system, 'OmegaLanguageSystem must be exported');
  assert.ok(bridge, 'OmegaGameLanguageBridge must be exported');

  assert.equal(system.VERSION, '1.3.0');
  assert.equal(system.SCHEMA_VERSION, 'OMEGA-LANGUAGE-SYSTEM/1.3');

  const ontology = system.gameLanguageOntology();
  assert.equal(ontology.ontology_id, 'OMEGA_GAME_LANGUAGE');
  assert.equal(ontology.schema_version, '1.1.0');
  assert.equal(ontology.implementation_status, 'BATCH_01_DEEP_SEMANTIC_LOCKED');
  assert.equal(ontology.canonical_concept_target, 4500);
  assert.equal(ontology.seed_concepts.length, 12);
  assert.equal(ontology.population_policy.current_seed_count, 12);
  assert.equal(ontology.domains.length, 17);
  assert.equal(ontology.domains.reduce((n, d) => n + d.target, 0), 5250);
  assert.equal(ontology.target_tiers.core_game_language + ontology.target_tiers.advanced_strategy_language + ontology.target_tiers.grammar_discourse_command_language, 4500);
  assert.deepEqual(Array.from(ontology.grammar.features), ['Person','Number','Case','Tense','Aspect','Mood','Voice','Polarity','Degree','VerbForm']);
  assert.deepEqual(Array.from(ontology.grammar.dependency_relations), ['nsubj','obj','obl','advmod','aux','mark','conj','nmod']);

  const loadDiagnostics = await system.load();
  assert.equal(loadDiagnostics.version, '1.3.0');
  assert.equal(loadDiagnostics.embeddedSourceCount, 2);
  assert.ok(loadDiagnostics.sourceFiles.includes('offline_language_vocabulary.json'));

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
    assert.ok(/^P[0-4]$/.test(c.priority), `${c.concept_id}: invalid priority`);
  }

  const hasRelation = (id, rel, target) => concepts.get(id)?.relations?.some(r => r.relation === rel && r.target === target);
  const mustRelate = (id, rel, target) => assert.equal(hasRelation(id, rel, target), true, `${id} -> ${rel} -> ${target}`);

  /* The existing 12 anchors must form an operational graph, not a word list. */
  mustRelate('RESOURCE_PRODUCTION', 'child_of', 'STATE_VARIABLE');
  mustRelate('RESOURCE_PRODUCTION', 'measured_by', 'QUANTITY');
  mustRelate('RESOURCE_PRODUCTION', 'measured_as', 'RATE');
  mustRelate('RESOURCE_PRODUCTION', 'constrained_by', 'CAPACITY');
  mustRelate('RESOURCE_PRODUCTION', 'changed_by', 'ACTION_INCREASE');
  mustRelate('RESOURCE_PRODUCTION', 'changed_by', 'ACTION_DECREASE');
  mustRelate('ACTION_INCREASE', 'operates_on', 'STATE_VARIABLE');
  mustRelate('ACTION_DECREASE', 'operates_on', 'STATE_VARIABLE');
  mustRelate('ACTION_INCREASE', 'action_family', 'ACTION_DECREASE');
  mustRelate('ACTION_DECREASE', 'action_family', 'ACTION_INCREASE');
  mustRelate('RESOURCE', 'semantic_root_for', 'RESOURCE_PRODUCTION');
  mustRelate('CAPACITY', 'affected_by', 'INVESTMENT');
  mustRelate('CAPACITY', 'associated_with', 'PRODUCTION_FACILITY');
  mustRelate('DEMAND', 'related_to', 'PRICE');
  mustRelate('DEMAND', 'related_to', 'SUPPLY');
  mustRelate('SUPPLY', 'paired_with', 'DEMAND');
  mustRelate('SUPPLY', 'constrained_by', 'CAPACITY');
  mustRelate('PRICE', 'distinct_from', 'COST');
  mustRelate('INVESTMENT', 'affects', 'CAPACITY');
  mustRelate('INVESTMENT', 'affects', 'PRODUCTION');

  assert.deepEqual(Array.from(system.concept('ACTION_INCREASE').semantic_roles), ['ACTOR','TARGET','AMOUNT','UNIT','TIME_HORIZON','SCOPE','CONSTRAINT','CONDITION']);
  assert.equal(system.concept('ACTION_DECREASE').grammar_features.direction, 'NEGATIVE_CHANGE');
  assert.equal(system.concept('ACTION_INCREASE').grammar_features.direction, 'POSITIVE_CHANGE');
  assert.equal(system.concept('PRICE').relations.some(r => r.relation === 'distinct_from' && r.target === 'COST'), true);
  assert.equal(system.concept('COUNTRY').runtime_resolution.requires.includes('authoritative_country_registry'), true);
  assert.equal(system.concept('PRODUCTION_FACILITY').runtime_resolution.requires.includes('authoritative_facility_dataset'), true);
  assert.equal(system.concept('INVESTMENT').runtime_resolution.numeric_effect, 'GAME_DATA_ONLY');

  assert.equal(ids.size, 12);
  assert.equal(bridge.VERSION, '1.0.2');
  assert.equal(typeof bridge.match, 'function');
  assert.equal(typeof bridge.enrich, 'function');
  assert.equal(typeof bridge.install, 'function');

  const diagnostics = system.diagnostics();
  assert.equal(diagnostics.version, '1.3.0');
  assert.ok(diagnostics.embeddedSourceFiles.includes('<embedded:omega_game_language_ontology.json>'));
  assert.ok(diagnostics.embeddedSourceFiles.includes('<embedded:omega_game_language_bridge.js>'));
  assert.ok(!diagnostics.sourceFiles.includes('omega_game_language_ontology.json'));
  assert.ok(!diagnostics.sourceFiles.includes('omega_game_language_bridge.js'));
  assert.equal(diagnostics.embeddedSourceCount, 2);

  const bn = system.parse('বাংলাদেশের উৎপাদন বাড়াও');
  assert.equal(bn.language, 'bn');
  assert.equal(bn.contract.unknownFact, 'UNKNOWN_WHEN_NOT_EVIDENCED');
  assert.equal(bn.contract.capabilityBoundary, 'LANGUAGE_DOES_NOT_GRANT_EXECUTION_CAPABILITY');

  const en = system.parse('increase production');
  assert.equal(en.language, 'en');
  assert.equal(en.contract.unknownEntity, 'UNRESOLVED');

  const event = system.eventRequest('increase', { target: 'PRODUCTION', quantity: 10 });
  assert.equal(event.type, 'GAME_EVENT_REQUEST');
  assert.equal(event.state, 'EVENT_REQUESTED');
  assert.equal(event.operation, 'INCREASE');
  assert.equal(event.capabilityRequired, true);
  assert.equal(event.executionOwner, 'GAME_CAPABILITY_AND_EVENT_ENGINE');

  assert.equal(system.learnPhrase('increase output', 'increase', 'PRODUCTION', 0.99), true);
  assert.equal(system.learnPhrase('weak confidence', 'increase', 'PRODUCTION', 0.5), false);

  console.log(`OMEGA hybrid runtime regression: PASS (${ids.size} seeds; loader exercised; semantic graph locked; ontology 1.1.0; language system 1.3.0; bridge 1.0.2)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
