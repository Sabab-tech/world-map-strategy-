/**
 * OMEGA LANGUAGE SYSTEM — BATCH 03 DEEP SEMANTIC EXTENSION
 * Seeds 25-40: agency, targeting, attributes, values, logic, causality,
 * dependency, uncertainty, strategy, scenarios and decisions.
 *
 * This extension never owns world facts. It layers semantic contracts over
 * the canonical 24-seed runtime and exposes an integration-safe registry.
 */
(function (global) {
  'use strict';

  const BATCH_ID = 'BATCH_03_DEEP_SEMANTIC';
  const VERSION = '1.1.0';
  const REQUIRED_PREVIOUS_SEEDS = 24;
  const SEED_IDS = Object.freeze([
    'ACTOR','TARGET','ATTRIBUTE','VALUE','CONDITION','CONSTRAINT','THRESHOLD',
    'CAUSE','CONSEQUENCE','DEPENDENCY','RISK','PROBABILITY','GOAL','PRIORITY',
    'SCENARIO','DECISION'
  ]);

  const seed = (concept_id, semantic_type, domain, roles, slots, relations, runtime, invalid_compositions, execution_boundary) => ({
    concept_id,
    semantic_type,
    domain,
    batch: 3,
    lexical: { en: { lemma: concept_id.toLowerCase(), aliases: [] }, bn: { lemma: concept_id, aliases: [] } },
    semantic_roles: Object.freeze(roles.slice()),
    required_slots: Object.freeze(slots.required.slice()),
    optional_slots: Object.freeze((slots.optional || []).slice()),
    relations: Object.freeze(relations.map(r => Object.freeze({ ...r }))),
    composition_rules: Object.freeze([
      'typed_slots_required',
      'entity_resolution_required',
      'provenance_preserved',
      'uncertainty_preserved',
      'temporal_scope_preserved',
      'causal_role_preserved',
      'strategic_role_preserved',
      'comparison_semantics_preserved',
      'forecast_semantics_preserved',
      'execution_boundary_enforced',
      'mutation_authority_required',
      'diagnostic_trace_required'
    ]),
    invalid_compositions: Object.freeze(invalid_compositions.slice()),
    runtime_resolution: Object.freeze({ ...runtime }),
    execution_boundary,
    diagnostics: Object.freeze({
      missing_required_slot: 'SEMANTIC_SLOT_MISSING',
      invalid_type: 'SEMANTIC_TYPE_MISMATCH',
      unresolved_reference: 'SEMANTIC_REFERENCE_UNRESOLVED',
      invalid_composition: 'SEMANTIC_COMPOSITION_INVALID',
      missing_provenance: 'SEMANTIC_PROVENANCE_MISSING',
      invalid_temporal_scope: 'SEMANTIC_TIME_SCOPE_INVALID',
      unauthorized_mutation: 'SEMANTIC_MUTATION_UNAUTHORIZED'
    }),
    reasoning_contract: Object.freeze({
      causal_graph: ['CAUSE','CONSEQUENCE'],
      dependency_graph: ['DEPENDENCY'],
      uncertainty_graph: ['RISK','PROBABILITY'],
      strategic_graph: ['GOAL','PRIORITY'],
      counterfactual_graph: ['SCENARIO'],
      decision_graph: ['ACTOR','TARGET','CONDITION','CONSTRAINT','GOAL','PRIORITY','RISK','DECISION']
    })
  });

  const SEEDS = [
    seed('ACTOR','AGENT','AGENCY',['ENTITY','ROLE','AUTHORITY','CAPABILITY'],
      { required:['identity'], optional:['role','authority','capability','ownership','jurisdiction','intent'] },
      [{relation:'acts_on',target:'TARGET'},{relation:'owns',target:'OWNERSHIP'},{relation:'pursues',target:'GOAL'},{relation:'makes',target:'DECISION'}],
      { strategy:'resolve_actor_from_authoritative_entity_registry', never:['invent_actor','infer_authority_from_name_only'] }, 'AUTHORITY_AND_CAPABILITY_GATE'),
    seed('TARGET','EFFECT_TARGET','AGENCY',['ENTITY','PROPERTY','STATE_VARIABLE','SCOPE'],
      { required:['reference'], optional:['property','scope','desired_state'] },
      [{relation:'targeted_by',target:'ACTION'},{relation:'described_by',target:'ATTRIBUTE'},{relation:'evaluated_by',target:'GOAL'}],
      { strategy:'resolve_typed_target_reference', never:['invent_target','mutate_target_during_resolution'] }, 'TARGET_RESOLUTION_GATE'),
    seed('ATTRIBUTE','PROPERTY_DEFINITION','STATE',['ENTITY','PROPERTY','DOMAIN'],
      { required:['attribute_id'], optional:['datatype','unit_family','valid_range','mutability'] },
      [{relation:'has_value',target:'VALUE'},{relation:'belongs_to',target:'TARGET'},{relation:'bounded_by',target:'CONSTRAINT'}],
      { strategy:'resolve_from_semantic_property_registry', never:['treat_attribute_as_value'] }, 'TYPE_VALIDATION_GATE'),
    seed('VALUE','TYPED_VALUE','STATE',['ATTRIBUTE','VALUE','PROVENANCE'],
      { required:['attribute','value'], optional:['unit','confidence','uncertainty','timestamp','source'] },
      [{relation:'instantiates',target:'ATTRIBUTE'},{relation:'measured_by',target:'UNIT'},{relation:'supported_by',target:'PROVENANCE'}],
      { strategy:'typed_value_resolution', never:['invent_numeric_value','drop_unit','drop_provenance'] }, 'VALUE_VALIDATION_GATE'),
    seed('CONDITION','LOGICAL_PREDICATE','CONTROL',['OPERAND','OPERATOR','CONTEXT'],
      { required:['predicate'], optional:['operands','operator','temporal_scope'] },
      [{relation:'guards',target:'DECISION'},{relation:'uses',target:'THRESHOLD'},{relation:'evaluates',target:'STATE_VARIABLE'}],
      { strategy:'evaluate_predicate_against_world_or_scenario_state', never:['treat_unknown_as_true'] }, 'PRECONDITION_GATE'),
    seed('CONSTRAINT','BOUNDARY','CONTROL',['SUBJECT','LIMIT','SCOPE'],
      { required:['subject','boundary'], optional:['operator','unit','scope','severity'] },
      [{relation:'constrains',target:'DECISION'},{relation:'constrains',target:'ACTION'},{relation:'derived_from',target:'POLICY'}],
      { strategy:'validate_candidate_against_constraint_set', never:['silently_relax_constraint'] }, 'CONSTRAINT_GATE'),
    seed('THRESHOLD','BOUNDARY_TRIGGER','CONTROL',['METRIC','BOUNDARY','OPERATOR'],
      { required:['metric','boundary','operator'], optional:['duration','scope','activation_effect'] },
      [{relation:'evaluates',target:'ATTRIBUTE'},{relation:'activates',target:'CONDITION'},{relation:'may_trigger',target:'DECISION'}],
      { strategy:'evaluate_boundary_crossing_with_temporal_scope', never:['treat_plain_value_as_threshold'] }, 'THRESHOLD_GATE'),
    seed('CAUSE','CAUSAL_RELATION','CAUSALITY',['CAUSE','EFFECT','EVIDENCE'],
      { required:['cause','effect'], optional:['mechanism','strength','evidence','confidence','time_order'] },
      [{relation:'causes',target:'CONSEQUENCE'},{relation:'supported_by',target:'EVIDENCE'}],
      { strategy:'resolve_explicit_or_evidence_supported_causal_edge', never:['promote_correlation_to_cause'] }, 'CAUSAL_INFERENCE_GATE'),
    seed('CONSEQUENCE','EFFECT','CAUSALITY',['SOURCE','EFFECT','SCOPE'],
      { required:['effect'], optional:['source','directness','horizon','intended','polarity','confidence'] },
      [{relation:'result_of',target:'CAUSE'},{relation:'may_increase',target:'RISK'},{relation:'may_change',target:'STATE_VARIABLE'}],
      { strategy:'trace_direct_and_downstream_effects', never:['collapse_downstream_effects_into_direct_effect'] }, 'CONSEQUENCE_EVALUATION_GATE'),
    seed('DEPENDENCY','DIRECTED_DEPENDENCY','DEPENDENCY',['SOURCE','TARGET','STRENGTH'],
      { required:['source','target'], optional:['direction','strength','criticality','substitutability','latency','failure_mode'] },
      [{relation:'depends_on',target:'TARGET'},{relation:'creates',target:'RISK'},{relation:'propagates_failure_to',target:'TARGET'}],
      { strategy:'resolve_dependency_graph_edge', never:['create_undirected_dependency','assume_dependency_from_cooccurrence'] }, 'DEPENDENCY_GRAPH_GATE'),
    seed('RISK','RISK_ASSESSMENT','UNCERTAINTY',['HAZARD','PROBABILITY','IMPACT','EXPOSURE'],
      { required:['event'], optional:['probability','impact','exposure','vulnerability','horizon','mitigation'] },
      [{relation:'quantified_by',target:'PROBABILITY'},{relation:'arises_from',target:'DEPENDENCY'},{relation:'informs',target:'DECISION'}],
      { strategy:'evaluate_risk_from_event_probability_and_impact_context', never:['equate_risk_with_probability'] }, 'RISK_EVALUATION_GATE'),
    seed('PROBABILITY','LIKELIHOOD','UNCERTAINTY',['EVENT','DISTRIBUTION','EVIDENCE'],
      { required:['event','likelihood'], optional:['prior','posterior','confidence','distribution','horizon','model'] },
      [{relation:'quantifies',target:'EVENT'},{relation:'updates_from',target:'EVIDENCE'},{relation:'feeds',target:'RISK'}],
      { strategy:'preserve_probability_and_uncertainty_metadata', never:['present_probability_without_context','confuse_confidence_with_probability'] }, 'UNCERTAINTY_GATE'),
    seed('GOAL','DESIRED_STATE','STRATEGY',['ACTOR','TARGET','DESIRED_STATE'],
      { required:['desired_state'], optional:['owner','target','metric','deadline','priority','constraints','success_condition','failure_condition'] },
      [{relation:'owned_by',target:'ACTOR'},{relation:'applies_to',target:'TARGET'},{relation:'ranked_by',target:'PRIORITY'}],
      { strategy:'resolve_goal_into_evaluable_desired_state', never:['treat_target_as_goal','accept_goal_without_evaluable_condition_when_required'] }, 'GOAL_VALIDATION_GATE'),
    seed('PRIORITY','OBJECTIVE_ORDER','STRATEGY',['SUBJECT','RANK','CONTEXT'],
      { required:['subject'], optional:['rank','weight','context','actor','horizon','conflict_policy'] },
      [{relation:'orders',target:'GOAL'},{relation:'orders',target:'DECISION'},{relation:'resolves_conflict_between',target:'GOAL'}],
      { strategy:'resolve_contextual_priority_with_conflict_policy', never:['assume_global_absolute_priority'] }, 'PRIORITY_GATE'),
    seed('SCENARIO','COUNTERFACTUAL_WORLD','COUNTERFACTUAL',['BASE_STATE','ASSUMPTION','BRANCH'],
      { required:['base_state'], optional:['assumptions','overrides','events','actors','constraints','goals','horizon','probability','branch_id'] },
      [{relation:'branches_from',target:'WORLD_STATE'},{relation:'contains',target:'ASSUMPTION'},{relation:'produces',target:'FORECAST'}],
      { strategy:'clone_isolated_world_state_for_counterfactual_reasoning', never:['mutate_live_world_state','merge_scenario_state_without_commit'] }, 'SCENARIO_ISOLATION_GATE'),
    seed('DECISION','VALIDATED_CHOICE','DECISION',['ACTOR','TARGET','ALTERNATIVES','RATIONALE'],
      { required:['actor','selected_action'], optional:['target','alternatives','goals','priorities','constraints','risks','probabilities','consequences','rationale','confidence','authority','scenario'] },
      [{relation:'made_by',target:'ACTOR'},{relation:'targets',target:'TARGET'},{relation:'satisfies',target:'GOAL'},{relation:'bounded_by',target:'CONSTRAINT'}],
      { strategy:'construct_auditable_validated_decision_contract', never:['execute_unvalidated_decision','bypass_authority_or_constraint_checks'] }, 'DECISION_VALIDATION_GATE')
  ];

  const DESCRIPTIONS = Object.freeze({
    ACTOR:'Identifies the entity that performs, authorizes, owns, delegates, or is accountable for a semantic action or decision. It resolves identity, role, authority, capability, jurisdiction and ownership without inferring power from a name alone.',
    TARGET:'Identifies the exact entity, property, state variable, resource, facility, actor, or scoped object that an action, goal, evaluation, or decision refers to. It preserves target identity and scope so resolution cannot silently invent or mutate the object.',
    ATTRIBUTE:'Defines a typed property of an entity or state, such as quality, stability, readiness, accessibility, capacity, or strategic importance. It describes what is being measured or evaluated, but is deliberately not the measured value itself.',
    VALUE:'Represents an actual typed value attached to an attribute. It preserves units, timestamp, source, provenance, confidence and uncertainty so the semantic layer cannot fabricate a number or discard the evidence behind one.',
    CONDITION:'Represents a logical prerequisite that must evaluate as true, false, or unknown in a specific world or scenario context. It supports atomic and compound predicates, temporal scope, threshold references, and safe unknown-state handling.',
    CONSTRAINT:'Represents a binding limit on an action, plan, decision, actor, resource, or state transition. It validates candidates against legal, physical, economic, capability, budget, capacity, or policy boundaries and never silently relaxes a failed constraint.',
    THRESHOLD:'Represents a typed boundary-crossing rule made from a metric, boundary value, comparison operator, scope and optional duration. Crossing the boundary can activate a condition or policy without confusing an ordinary value with a trigger threshold.',
    CAUSE:'Represents an evidence-supported causal edge explaining why an effect occurred or is expected to occur. It records mechanism, direction, strength, evidence, confidence and temporal ordering while refusing to promote mere correlation into causation.',
    CONSEQUENCE:'Represents an effect produced by an event, action, or state change. It distinguishes direct from downstream effects, intended from unintended outcomes, polarity, horizon and confidence so strategic reasoning can trace impact rather than flattening an entire causal chain.',
    DEPENDENCY:'Represents a directed relationship in which one entity, process, capability, or outcome depends on another. It records direction, strength, criticality, substitutability, latency and failure mode and supports propagation analysis without inventing dependencies from co-occurrence.',
    RISK:'Represents structured exposure to a harmful or undesirable event. It combines the event with probability context, impact, exposure, vulnerability, horizon and mitigation so risk remains distinct from probability and can inform decisions.',
    PROBABILITY:'Represents the likelihood of a defined event or hypothesis under a defined model, evidence set and time horizon. It preserves prior, posterior, distribution and confidence metadata and never treats confidence in an estimate as the probability of the event itself.',
    GOAL:'Represents an actor-owned desired future state that can be evaluated against measurable success or failure conditions. It binds targets, metrics, deadlines, constraints and priorities without confusing the object being targeted with the outcome being desired.',
    PRIORITY:'Represents contextual ordering or weighting among goals, decisions, or competing objectives. Priority depends on actor, context, horizon and conflict policy, so the subsystem does not pretend there is one universal ranking for every situation.',
    SCENARIO:'Represents an isolated hypothetical or counterfactual world configuration used for forecasting and strategic reasoning. It branches from a base state, applies explicit assumptions or overrides, and must never mutate live world state without an explicit commit boundary.',
    DECISION:'Represents an auditable selected choice produced after alternatives, goals, priorities, conditions, constraints, risks, probabilities and authority have been evaluated. It is a validated decision contract, not permission to execute an action automatically.'
  });

  for (const item of SEEDS) {
    Object.defineProperty(item, 'description', { value: DESCRIPTIONS[item.concept_id], enumerable: true, writable: false, configurable: false });
    Object.defineProperty(item, 'subsystem_contract', { value: Object.freeze({
      semantic_identity: item.semantic_type,
      measurement_semantics: item.concept_id === 'VALUE' ? 'typed_observation_with_unit_and_provenance' : 'semantic_role_not_a_world_fact',
      temporal_semantics: 'explicit_scope_required_when_time_changes_meaning',
      causal_role: item.concept_id === 'CAUSE' ? 'causal_explanation' : item.concept_id === 'CONSEQUENCE' ? 'causal_effect' : 'causal_context_preserved',
      strategic_role: ['GOAL','PRIORITY','RISK','DECISION'].includes(item.concept_id) ? item.concept_id.toLowerCase() : 'supporting_semantic_context',
      uncertainty_model: ['RISK','PROBABILITY','VALUE','CAUSE','CONSEQUENCE'].includes(item.concept_id) ? 'preserve_uncertainty_and_confidence' : 'unknown_must_not_become_true',
      provenance_policy: 'source_and_evidence_are_preserved_when_present',
      comparison_behavior: 'typed_comparison_only',
      forecast_behavior: ['SCENARIO','PROBABILITY','RISK','CONSEQUENCE'].includes(item.concept_id) ? 'forecast_aware' : 'context_preserving',
      mutation_authority: 'semantic_layer_never_mutates_world_state_without_explicit_execution_authority'
    }), enumerable: true, writable: false, configurable: false });
  }

  Object.freeze(SEEDS);
  const registry = Object.freeze({ batch_id:BATCH_ID, version:VERSION, required_previous_seed_count:REQUIRED_PREVIOUS_SEEDS, seed_ids:SEED_IDS, seeds:SEEDS, descriptions:DESCRIPTIONS });

  function buildOntology(system) {
    if (!system || typeof system.gameLanguageOntology !== 'function') return { ok:false, reason:'CANONICAL_LANGUAGE_SYSTEM_NOT_READY' };
    const original = system.gameLanguageOntology();
    if (!original || !Array.isArray(original.seed_concepts)) return { ok:false, reason:'INVALID_CANONICAL_ONTOLOGY' };
    if (original.seed_concepts.length < REQUIRED_PREVIOUS_SEEDS) return { ok:false, reason:'PREVIOUS_SEED_LOCK_NOT_SATISFIED' };
    const byId = new Set(original.seed_concepts.map(c => c.concept_id));
    for (const item of SEEDS) if (byId.has(item.concept_id)) return { ok:false, reason:`DUPLICATE_SEED:${item.concept_id}` };
    const merged = Object.freeze({
      ...original,
      schema_version: '1.3.0',
      implementation_status: 'BATCH_03_DEEP_SEMANTIC_LOCKED',
      seed_concepts: Object.freeze([...original.seed_concepts, ...SEEDS]),
      population_policy: Object.freeze({ ...(original.population_policy || {}), previous_seed_count: original.seed_concepts.length, current_seed_count: original.seed_concepts.length + SEEDS.length, batch_03_seed_count: SEEDS.length, batch_03_status:'LOCKED' }),
      batch_03: registry,
      semantic_layers: Object.freeze([...(original.semantic_layers || []), 'AGENCY','CONTROL','CAUSALITY','DEPENDENCY','UNCERTAINTY','STRATEGY','COUNTERFACTUAL','DECISION'])
    });
    return { ok:true, ontology:merged };
  }

  function install(system) {
    const built = buildOntology(system);
    if (!built.ok) return { installed:false, reason:built.reason };
    if (global.OmegaGameLanguageBridge && typeof global.OmegaGameLanguageBridge.load === 'function') {
      try {
        global.OmegaGameLanguageBridge.load(built.ontology);
        if (typeof global.OmegaGameLanguageBridge.install === 'function') global.OmegaGameLanguageBridge.install();
      } catch (_) {}
    }
    return { installed:true, seed_count:built.ontology.seed_concepts.length, batch_id:BATCH_ID, ontology:built.ontology };
  }

  global.OmegaLanguageBatch03 = Object.freeze({ BATCH_ID, VERSION, SEED_IDS, registry, buildOntology, install });

  function autoInstall() {
    const system = global.OmegaLanguageSystem;
    if (!system) return false;
    return install(system).installed;
  }

  if (!autoInstall()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (autoInstall() || attempts >= 200) clearInterval(timer);
    }, 25);
  }
})(typeof window !== 'undefined' ? window : globalThis);
