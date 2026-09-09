/**
 * OMEGA LANGUAGE SYSTEM - BATCH 03 DEEP SEMANTIC EXTENSION
 * Seeds 25-40. This layer is additive: the canonical 24-seed runtime remains intact.
 */
(function (global) {
  'use strict';

  const BATCH_ID='BATCH_03_DEEP_SEMANTIC';
  const VERSION='1.2.0';
  const REQUIRED_PREVIOUS_SEEDS=24;
  const SEED_IDS=Object.freeze(['ACTOR','TARGET','ATTRIBUTE','VALUE','CONDITION','CONSTRAINT','THRESHOLD','CAUSE','CONSEQUENCE','DEPENDENCY','RISK','PROBABILITY','GOAL','PRIORITY','SCENARIO','DECISION']);

  const COMMON_COMPOSITION=Object.freeze([
    'typed_slots_required','entity_resolution_required','provenance_preserved','uncertainty_preserved',
    'temporal_scope_preserved','causal_role_preserved','strategic_role_preserved','comparison_semantics_preserved',
    'forecast_semantics_preserved','execution_boundary_enforced','mutation_authority_required','diagnostic_trace_required'
  ]);
  const COMMON_DIAGNOSTICS=Object.freeze({
    missing_required_slot:'SEMANTIC_SLOT_MISSING', invalid_type:'SEMANTIC_TYPE_MISMATCH',
    unresolved_reference:'SEMANTIC_REFERENCE_UNRESOLVED', invalid_composition:'SEMANTIC_COMPOSITION_INVALID',
    missing_provenance:'SEMANTIC_PROVENANCE_MISSING', invalid_temporal_scope:'SEMANTIC_TIME_SCOPE_INVALID',
    unauthorized_mutation:'SEMANTIC_MUTATION_UNAUTHORIZED'
  });

  const DATA={
    ACTOR:{type:'AGENT',domain:'AGENCY',roles:['ENTITY','ROLE','AUTHORITY','CAPABILITY'],required:['identity'],optional:['role','authority','capability','ownership','jurisdiction','intent'],relations:[['acts_on','TARGET'],['owns','OWNERSHIP'],['pursues','GOAL'],['makes','DECISION']],runtime:'resolve_actor_from_authoritative_entity_registry',invalid:['invent_actor','infer_authority_from_name_only'],boundary:'AUTHORITY_AND_CAPABILITY_GATE',description:'Identifies the entity that performs, authorizes, owns, delegates, or is accountable for a semantic action or decision. It resolves identity, role, authority, capability, jurisdiction and ownership without inferring power from a name alone.'},
    TARGET:{type:'EFFECT_TARGET',domain:'AGENCY',roles:['ENTITY','PROPERTY','STATE_VARIABLE','SCOPE'],required:['reference'],optional:['property','scope','desired_state'],relations:[['targeted_by','ACTION'],['described_by','ATTRIBUTE'],['evaluated_by','GOAL']],runtime:'resolve_typed_target_reference',invalid:['invent_target','mutate_target_during_resolution'],boundary:'TARGET_RESOLUTION_GATE',description:'Identifies the exact entity, property, state variable, resource, facility, actor, or scoped object that an action, goal, evaluation, or decision refers to. It preserves target identity and scope so resolution cannot silently invent or mutate the object.'},
    ATTRIBUTE:{type:'PROPERTY_DEFINITION',domain:'STATE',roles:['ENTITY','PROPERTY','DOMAIN'],required:['attribute_id'],optional:['datatype','unit_family','valid_range','mutability'],relations:[['has_value','VALUE'],['belongs_to','TARGET'],['bounded_by','CONSTRAINT']],runtime:'resolve_from_semantic_property_registry',invalid:['treat_attribute_as_value','use_unregistered_attribute'],boundary:'TYPE_VALIDATION_GATE',description:'Defines a typed property of an entity or state, such as quality, stability, readiness, accessibility, capacity, or strategic importance. It describes what is measured or evaluated, and is deliberately distinct from the measured value.'},
    VALUE:{type:'TYPED_VALUE',domain:'STATE',roles:['ATTRIBUTE','VALUE','PROVENANCE'],required:['attribute','value'],optional:['unit','confidence','uncertainty','timestamp','source'],relations:[['instantiates','ATTRIBUTE'],['measured_by','UNIT'],['supported_by','PROVENANCE']],runtime:'typed_value_resolution',invalid:['invent_numeric_value','drop_unit','drop_provenance'],boundary:'VALUE_VALIDATION_GATE',description:'Represents an actual typed value attached to an attribute. It preserves units, timestamp, source, provenance, confidence and uncertainty so the semantic layer cannot fabricate a number or discard the evidence behind one.'},
    CONDITION:{type:'LOGICAL_PREDICATE',domain:'CONTROL',roles:['OPERAND','OPERATOR','CONTEXT'],required:['predicate'],optional:['operands','operator','temporal_scope'],relations:[['guards','DECISION'],['uses','THRESHOLD'],['evaluates','STATE_VARIABLE']],runtime:'evaluate_predicate_against_world_or_scenario_state',invalid:['treat_unknown_as_true','execute_before_condition_evaluation'],boundary:'PRECONDITION_GATE',description:'Represents a logical prerequisite that evaluates as true, false, or unknown in a specific world or scenario context. It supports atomic and compound predicates, temporal scope, threshold references, and safe unknown-state handling.'},
    CONSTRAINT:{type:'BOUNDARY',domain:'CONTROL',roles:['SUBJECT','LIMIT','SCOPE'],required:['subject','boundary'],optional:['operator','unit','scope','severity'],relations:[['constrains','DECISION'],['constrains','ACTION'],['derived_from','POLICY']],runtime:'validate_candidate_against_constraint_set',invalid:['silently_relax_constraint','ignore_scope'],boundary:'CONSTRAINT_GATE',description:'Represents a binding limit on an action, plan, decision, actor, resource, or state transition. It validates legal, physical, economic, capability, budget, capacity, and policy boundaries and never silently relaxes a failed constraint.'},
    THRESHOLD:{type:'BOUNDARY_TRIGGER',domain:'CONTROL',roles:['METRIC','BOUNDARY','OPERATOR'],required:['metric','boundary','operator'],optional:['duration','scope','activation_effect'],relations:[['evaluates','ATTRIBUTE'],['activates','CONDITION'],['may_trigger','DECISION']],runtime:'evaluate_boundary_crossing_with_temporal_scope',invalid:['treat_plain_value_as_threshold','omit_comparison_operator'],boundary:'THRESHOLD_GATE',description:'Represents a typed boundary-crossing rule made from a metric, boundary value, comparison operator, scope and optional duration. Crossing the boundary can activate a condition or policy without confusing an ordinary value with a trigger rule.'},
    CAUSE:{type:'CAUSAL_RELATION',domain:'CAUSALITY',roles:['CAUSE','EFFECT','EVIDENCE'],required:['cause','effect'],optional:['mechanism','strength','evidence','confidence','time_order'],relations:[['causes','CONSEQUENCE'],['supported_by','EVIDENCE']],runtime:'resolve_explicit_or_evidence_supported_causal_edge',invalid:['promote_correlation_to_cause','reverse_causal_direction'],boundary:'CAUSAL_INFERENCE_GATE',description:'Represents an evidence-supported causal edge explaining why an effect occurred or is expected to occur. It records mechanism, direction, strength, evidence, confidence and temporal ordering while refusing to promote mere correlation into causation.'},
    CONSEQUENCE:{type:'EFFECT',domain:'CAUSALITY',roles:['SOURCE','EFFECT','SCOPE'],required:['effect'],optional:['source','directness','horizon','intended','polarity','confidence'],relations:[['result_of','CAUSE'],['may_increase','RISK'],['may_change','STATE_VARIABLE']],runtime:'trace_direct_and_downstream_effects',invalid:['collapse_downstream_effects_into_direct_effect','claim_unbounded_effect'],boundary:'CONSEQUENCE_EVALUATION_GATE',description:'Represents an effect produced by an event, action, or state change. It distinguishes direct from downstream effects, intended from unintended outcomes, polarity, horizon and confidence so strategic reasoning can trace impact rather than flattening the causal chain.'},
    DEPENDENCY:{type:'DIRECTED_DEPENDENCY',domain:'DEPENDENCY',roles:['SOURCE','TARGET','STRENGTH'],required:['source','target'],optional:['direction','strength','criticality','substitutability','latency','failure_mode'],relations:[['depends_on','TARGET'],['creates','RISK'],['propagates_failure_to','TARGET']],runtime:'resolve_dependency_graph_edge',invalid:['create_undirected_dependency','assume_dependency_from_cooccurrence'],boundary:'DEPENDENCY_GRAPH_GATE',description:'Represents a directed relationship in which one entity, process, capability, or outcome depends on another. It records direction, strength, criticality, substitutability, latency and failure mode and supports failure propagation analysis.'},
    RISK:{type:'RISK_ASSESSMENT',domain:'UNCERTAINTY',roles:['HAZARD','PROBABILITY','IMPACT','EXPOSURE'],required:['event'],optional:['probability','impact','exposure','vulnerability','horizon','mitigation'],relations:[['quantified_by','PROBABILITY'],['arises_from','DEPENDENCY'],['informs','DECISION']],runtime:'evaluate_risk_from_event_probability_and_impact_context',invalid:['equate_risk_with_probability','omit_impact_context'],boundary:'RISK_EVALUATION_GATE',description:'Represents structured exposure to a harmful or undesirable event. It combines event, probability context, impact, exposure, vulnerability, horizon and mitigation so risk remains distinct from probability and can inform decisions.'},
    PROBABILITY:{type:'LIKELIHOOD',domain:'UNCERTAINTY',roles:['EVENT','DISTRIBUTION','EVIDENCE'],required:['event','likelihood'],optional:['prior','posterior','confidence','distribution','horizon','model'],relations:[['quantifies','EVENT'],['updates_from','EVIDENCE'],['feeds','RISK']],runtime:'preserve_probability_and_uncertainty_metadata',invalid:['present_probability_without_context','confuse_confidence_with_probability'],boundary:'UNCERTAINTY_GATE',description:'Represents the likelihood of a defined event or hypothesis under a defined model, evidence set and time horizon. It preserves prior, posterior, distribution and confidence metadata and never treats confidence as event probability.'},
    GOAL:{type:'DESIRED_STATE',domain:'STRATEGY',roles:['ACTOR','TARGET','DESIRED_STATE'],required:['desired_state'],optional:['owner','target','metric','deadline','priority','constraints','success_condition','failure_condition'],relations:[['owned_by','ACTOR'],['applies_to','TARGET'],['ranked_by','PRIORITY']],runtime:'resolve_goal_into_evaluable_desired_state',invalid:['treat_target_as_goal','accept_unevaluable_goal'],boundary:'GOAL_VALIDATION_GATE',description:'Represents an actor-owned desired future state that can be evaluated against measurable success or failure conditions. It binds targets, metrics, deadlines, constraints and priorities without confusing the object targeted with the outcome desired.'},
    PRIORITY:{type:'OBJECTIVE_ORDER',domain:'STRATEGY',roles:['SUBJECT','RANK','CONTEXT'],required:['subject'],optional:['rank','weight','context','actor','horizon','conflict_policy'],relations:[['orders','GOAL'],['orders','DECISION'],['resolves_conflict_between','GOAL']],runtime:'resolve_contextual_priority_with_conflict_policy',invalid:['assume_global_absolute_priority','compare_without_context'],boundary:'PRIORITY_GATE',description:'Represents contextual ordering or weighting among goals, decisions, or competing objectives. Priority depends on actor, context, horizon and conflict policy, so there is no universal ranking independent of circumstances.'},
    SCENARIO:{type:'COUNTERFACTUAL_WORLD',domain:'COUNTERFACTUAL',roles:['BASE_STATE','ASSUMPTION','BRANCH'],required:['base_state'],optional:['assumptions','overrides','events','actors','constraints','goals','horizon','probability','branch_id'],relations:[['branches_from','WORLD_STATE'],['contains','ASSUMPTION'],['produces','FORECAST']],runtime:'clone_isolated_world_state_for_counterfactual_reasoning',invalid:['mutate_live_world_state','merge_scenario_state_without_commit'],boundary:'SCENARIO_ISOLATION_GATE',description:'Represents an isolated hypothetical or counterfactual world configuration used for forecasting and strategic reasoning. It branches from a base state, applies explicit assumptions or overrides, and never mutates live world state without an explicit commit boundary.'},
    DECISION:{type:'VALIDATED_CHOICE',domain:'DECISION',roles:['ACTOR','TARGET','ALTERNATIVES','RATIONALE'],required:['actor','selected_action'],optional:['target','alternatives','goals','priorities','constraints','risks','probabilities','consequences','rationale','confidence','authority','scenario'],relations:[['made_by','ACTOR'],['targets','TARGET'],['satisfies','GOAL'],['bounded_by','CONSTRAINT']],runtime:'construct_auditable_validated_decision_contract',invalid:['execute_unvalidated_decision','bypass_authority_or_constraint_checks'],boundary:'DECISION_VALIDATION_GATE',description:'Represents an auditable selected choice produced after alternatives, goals, priorities, conditions, constraints, risks, probabilities and authority have been evaluated. It is a validated decision contract, not automatic execution permission.'}
  };

  const makeSeed=(id,d)=>Object.freeze({
    concept_id:id, semantic_type:d.type, domain:d.domain, batch:3,
    lexical:{en:{lemma:id.toLowerCase(),aliases:[]},bn:{lemma:id,aliases:[]}},
    semantic_roles:Object.freeze(d.roles), required_slots:Object.freeze(d.required), optional_slots:Object.freeze(d.optional),
    relations:Object.freeze(d.relations.map(([relation,target])=>Object.freeze({relation,target}))),
    composition_rules:COMMON_COMPOSITION, invalid_compositions:Object.freeze(d.invalid),
    runtime_resolution:Object.freeze({strategy:d.runtime}), execution_boundary:d.boundary,
    diagnostics:COMMON_DIAGNOSTICS,
    reasoning_contract:Object.freeze({causal_graph:['CAUSE','CONSEQUENCE'],dependency_graph:['DEPENDENCY'],uncertainty_graph:['RISK','PROBABILITY'],strategic_graph:['GOAL','PRIORITY'],counterfactual_graph:['SCENARIO'],decision_graph:['ACTOR','TARGET','CONDITION','CONSTRAINT','GOAL','PRIORITY','RISK','DECISION']}),
    description:d.description,
    subsystem_contract:Object.freeze({
      semantic_identity:d.type,
      measurement_semantics:id==='VALUE'?'typed_observation_with_unit_and_provenance':'typed_semantic_role_without_world_fact',
      temporal_semantics:'explicit_scope_required_when_time_changes_meaning',
      causal_role:id==='CAUSE'?'causal_explanation':id==='CONSEQUENCE'?'causal_effect':'causal_context_preserved',
      strategic_role:['GOAL','PRIORITY','RISK','DECISION'].includes(id)?id.toLowerCase():'supporting_semantic_context',
      uncertainty_model:['RISK','PROBABILITY','VALUE','CAUSE','CONSEQUENCE'].includes(id)?'preserve_uncertainty_and_confidence':'unknown_must_not_become_true',
      provenance_policy:'source_and_evidence_preserved_when_present',
      comparison_behavior:'typed_comparison_only',
      forecast_behavior:['SCENARIO','PROBABILITY','RISK','CONSEQUENCE'].includes(id)?'forecast_aware':'context_preserving',
      mutation_authority:'semantic_layer_never_mutates_world_state_without_explicit_execution_authority'
    })
  });

  const SEEDS=Object.freeze(SEED_IDS.map(id=>makeSeed(id,DATA[id])));
  const REGISTRY=Object.freeze({batch_id:BATCH_ID,version:VERSION,required_previous_seed_count:REQUIRED_PREVIOUS_SEEDS,seed_ids:SEED_IDS,seeds:SEEDS});

  function buildOntology(system){
    if(!system||typeof system.gameLanguageOntology!=='function')return{ok:false,reason:'CANONICAL_LANGUAGE_SYSTEM_NOT_READY'};
    const original=system.gameLanguageOntology();
    if(!original||!Array.isArray(original.seed_concepts))return{ok:false,reason:'INVALID_CANONICAL_ONTOLOGY'};
    if(original.seed_concepts.length<REQUIRED_PREVIOUS_SEEDS)return{ok:false,reason:'PREVIOUS_SEED_LOCK_NOT_SATISFIED'};
    const ids=new Set(original.seed_concepts.map(c=>c.concept_id));
    for(const item of SEEDS)if(ids.has(item.concept_id))return{ok:false,reason:'DUPLICATE_SEED:'+item.concept_id};
    const ontology=Object.freeze({...original,schema_version:'1.3.0',implementation_status:'BATCH_03_DEEP_SEMANTIC_LOCKED',seed_concepts:Object.freeze([...original.seed_concepts,...SEEDS]),population_policy:Object.freeze({...original.population_policy,previous_seed_count:original.seed_concepts.length,current_seed_count:original.seed_concepts.length+SEEDS.length,batch_03_seed_count:SEEDS.length,batch_03_status:'LOCKED'}),batch_03:REGISTRY,semantic_layers:Object.freeze([...(original.semantic_layers||[]),'AGENCY','CONTROL','CAUSALITY','DEPENDENCY','UNCERTAINTY','STRATEGY','COUNTERFACTUAL','DECISION'])});
    return{ok:true,ontology};
  }

  function install(system){
    const built=buildOntology(system);
    if(!built.ok)return{installed:false,reason:built.reason};
    if(global.OmegaGameLanguageBridge&&typeof global.OmegaGameLanguageBridge.load==='function'){
      try{global.OmegaGameLanguageBridge.load(built.ontology);if(typeof global.OmegaGameLanguageBridge.install==='function')global.OmegaGameLanguageBridge.install();}catch(_){/* bridge remains optional */}
    }
    return{installed:true,seed_count:built.ontology.seed_concepts.length,batch_id:BATCH_ID,ontology:built.ontology};
  }

  global.OmegaLanguageBatch03=Object.freeze({BATCH_ID,VERSION,SEED_IDS,registry:REGISTRY,buildOntology,install});
  if(global.OmegaLanguageSystem)install(global.OmegaLanguageSystem);
})(typeof window!=='undefined'?window:globalThis);
