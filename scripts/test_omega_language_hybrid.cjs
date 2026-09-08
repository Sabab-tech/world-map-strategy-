const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

(async () => {
  const source = fs.readFileSync('omega_language_system.js', 'utf8');
  assert.doesNotThrow(() => new vm.Script(source, { filename: 'omega_language_system.js' }));
  const vocabulary = { languages: { en: {}, bn: {} }, semantic_policy: {
    world_entities_must_be_loaded_from_runtime_datasets:true,
    question_meaning_must_be_loaded_from_vocabulary:true,
    attributes_must_be_loaded_from_vocabulary:true,
    no_country_catalog_in_code:true,no_resource_catalog_in_code:true,
    no_asset_alias_catalog_in_code:true,no_answer_fact_catalog_in_code:true
  }};
  const sandbox={console,Date,setTimeout,clearTimeout,fetch:async url=>({ok:true,json:async()=>String(url).endsWith('offline_language_vocabulary.json')?vocabulary:{}}),document:{scripts:[],createElement:()=>({src:'',async:false,onload:null,onerror:null}),head:{appendChild:s=>{if(typeof s.onload==='function')s.onload();}}}};
  vm.createContext(sandbox); vm.runInContext(source,sandbox,{filename:'omega_language_system.js'});
  const system=sandbox.OmegaLanguageSystem,bridge=sandbox.OmegaGameLanguageBridge;
  assert.ok(system); assert.ok(bridge);
  assert.equal(system.VERSION,'1.4.0');
  assert.equal(system.SCHEMA_VERSION,'OMEGA-LANGUAGE-SYSTEM/1.4');
  const ontology=system.gameLanguageOntology();
  assert.equal(ontology.schema_version,'1.2.0');
  assert.equal(ontology.implementation_status,'BATCH_02_DEEP_SEMANTIC_LOCKED');
  assert.equal(ontology.canonical_concept_target,4500);
  assert.equal(ontology.seed_concepts.length,24);
  assert.equal(ontology.population_policy.current_seed_count,24);
  assert.equal(ontology.population_policy.previous_batch_seed_count,12);
  assert.equal(ontology.population_policy.batch,'BATCH_02');
  assert.equal(ontology.domains.length,17);
  assert.equal(ontology.target_tiers.core_game_language+ontology.target_tiers.advanced_strategy_language+ontology.target_tiers.grammar_discourse_command_language,4500);
  assert.deepEqual(Array.from(ontology.grammar.features),['Person','Number','Case','Tense','Aspect','Mood','Voice','Polarity','Degree','VerbForm']);
  assert.deepEqual(Array.from(ontology.grammar.dependency_relations),['nsubj','obj','obl','advmod','aux','mark','conj','nmod']);

  const d=await system.load();
  assert.equal(d.version,'1.4.0'); assert.equal(d.ontologySeedCount,24); assert.equal(d.embeddedSourceCount,2);
  assert.ok(d.sourceFiles.includes('offline_language_vocabulary.json'));

  const ids=new Set(), concepts=new Map();
  for(const c of ontology.seed_concepts){
    assert.ok(/^[A-Z][A-Z0-9_]+$/.test(c.concept_id)); assert.ok(!ids.has(c.concept_id),`duplicate ${c.concept_id}`); ids.add(c.concept_id); concepts.set(c.concept_id,c);
    assert.ok(ontology.domains.some(x=>x.id===c.domain));
    for(const lang of ['en','bn']){assert.ok(c.lexical?.[lang]?.lemma);assert.ok(Array.isArray(c.lexical[lang].aliases));assert.ok(Array.isArray(c.lexical[lang].forms));assert.ok(Array.isArray(c.lexical[lang].pos));}
    for(const field of ['semantic_roles','compatible_variables','compatible_entities','allowed_actions','relations','construction_patterns','phrase_patterns'])assert.ok(Array.isArray(c[field]),`${c.concept_id}:${field}`);
    assert.ok(c.derivational_family?.length); assert.ok(c.morphological_eligibility); assert.ok(c.runtime_resolution?.strategy); assert.ok(c.compositional_frame?.required_roles); assert.ok(/^P[0-4]$/.test(c.priority));
  }
  assert.equal(ids.size,24);
  const has=(id,rel,target)=>concepts.get(id)?.relations?.some(r=>r.relation===rel&&r.target===target);
  const must=(id,rel,target)=>assert.equal(has(id,rel,target),true,`${id} -> ${rel} -> ${target}`);

  /* Batch 01 remains intact and now connects into Batch 02. */
  must('RESOURCE_PRODUCTION','measured_by','QUANTITY'); must('RESOURCE_PRODUCTION','measured_as','RATE');
  must('RESOURCE_PRODUCTION','constrained_by','CAPACITY'); must('RESOURCE_PRODUCTION','changed_by','ACTION_INCREASE');
  must('ACTION_INCREASE','operates_on','STATE_VARIABLE'); must('ACTION_DECREASE','operates_on','STATE_VARIABLE');
  must('CAPACITY','measured_by','RATE'); must('DEMAND','measured_by','QUANTITY'); must('SUPPLY','measured_by','QUANTITY');
  must('PRICE','measured_by','UNIT'); must('INVESTMENT','quantified_by','QUANTITY');

  /* Batch 02 internal graph. */
  must('QUANTITY','expressed_in','UNIT'); must('QUANTITY','can_be_rate','RATE');
  must('RATE','distinct_from','QUANTITY'); must('RATE','expressed_in','UNIT');
  must('RATIO','distinct_from','PERCENTAGE'); must('RATIO','can_be_rendered_as','PERCENTAGE');
  must('PERCENTAGE','is_unit_for','RELATIVE_CHANGE'); must('PERCENTAGE','is_magnitude_of','CHANGE_DELTA');
  must('TIME_POINT','anchors','TIME_PERIOD'); must('TIME_POINT','distinct_from','TIME_DURATION');
  must('TIME_DURATION','distinct_from','TIME_POINT'); must('TIME_PERIOD','anchors','BASELINE');
  must('FREQUENCY','distinct_from','RATE');
  must('BASELINE','reference_for','CHANGE_DELTA'); must('BASELINE','reference_for','RELATIVE_CHANGE');
  must('CHANGE_DELTA','distinct_from','RELATIVE_CHANGE'); must('CHANGE_DELTA','expressed_by','QUANTITY');
  must('RELATIVE_CHANGE','represented_by','PERCENTAGE'); must('RELATIVE_CHANGE','distinct_from','CHANGE_DELTA');

  for(const invariant of ontology.semantic_invariants)assert.ok(typeof invariant==='string'&&invariant.includes('!='));
  assert.equal(ontology.semantic_invariants.includes('QUANTITY != RATE'),true);
  assert.equal(ontology.semantic_invariants.includes('TIME_POINT != TIME_DURATION'),true);
  assert.equal(ontology.semantic_invariants.includes('CHANGE_DELTA != RELATIVE_CHANGE'),true);

  assert.equal(system.concept('ACTION_INCREASE').semantic_roles.includes('UNIT'),true);
  assert.equal(system.concept('RELATIVE_CHANGE').runtime_resolution.formula,'(to_value - from_value) / from_value');
  assert.equal(system.concept('CHANGE_DELTA').runtime_resolution.formula,'to_value - from_value');
  assert.equal(system.concept('UNIT').runtime_resolution.never.includes('invent_conversion_factor'),true);
  assert.equal(system.concept('COUNTRY').runtime_resolution.never.includes('hardcoded_country_catalog'),true);
  assert.equal(system.concept('RESOURCE').runtime_resolution.never.includes('hardcoded_resource_catalog'),true);

  assert.equal(bridge.VERSION,'1.0.3'); assert.equal(typeof bridge.match,'function'); assert.equal(typeof bridge.enrich,'function');
  assert.ok(bridge.match('quantity','en').some(x=>x.concept_id==='QUANTITY'));
  assert.ok(bridge.match('উৎপাদন','bn').some(x=>x.concept_id==='RESOURCE_PRODUCTION'));
  assert.ok(bridge.match('percentage','en').some(x=>x.concept_id==='PERCENTAGE'));

  const validation=system.validate(); assert.equal(validation.ok,true,JSON.stringify(validation));
  const bn=system.parse('উৎপাদন ১৫ শতাংশ বাড়াও'); assert.equal(bn.language,'bn'); assert.equal(bn.contract.unknownFact,'UNKNOWN_WHEN_NOT_EVIDENCED');
  const en=system.parse('increase production by 15 percent over 5 years'); assert.equal(en.language,'en'); assert.equal(en.contract.capabilityBoundary,'LANGUAGE_DOES_NOT_GRANT_EXECUTION_CAPABILITY');
  const event=system.eventRequest('increase',{target:'PRODUCTION',quantity:10,unit:'ton',duration:'5 years'}); assert.equal(event.type,'GAME_EVENT_REQUEST'); assert.equal(event.capabilityRequired,true);
  assert.equal(system.learnPhrase('increase output','increase','PRODUCTION',.99),true); assert.equal(system.learnPhrase('weak confidence','increase','PRODUCTION',.5),false);
  console.log(`OMEGA Batch 02 semantic regression: PASS (${ids.size} canonical seeds; 12 new; loader exercised; duplicate guard; measurement/time/comparison graph locked; ontology 1.2.0; system 1.4.0; bridge 1.0.3)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
