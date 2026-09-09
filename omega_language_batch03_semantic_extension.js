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
  const VERSION = '1.0.0';
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
      'temporal_scope_preserved'
    ]),
    invalid_compositions: Object.freeze(invalid_compositions.slice()),
    runtime_resolution: Object.freeze({ ...runtime }),
    execution_boundary,
    diagnostics: Object.freeze({
      missing_required_slot: 'SEMANTIC_SLOT_MISSING',
      invalid_type: 'SEMANTIC_TYPE_MISMATCH',
      unresolved_reference: 'SEMANTIC_REFERENCE_UNRESOLVED',
      invalid_composition: 'SEMANTIC_COMPOSITION_INVALID',
      missing_provenance: 'SEMANTIC_PROVENANCE_MISSING'
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

  const SEEDS = Object.freeze([
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
  ]);

  const registry = Object.freeze({ batch_id:BATCH_ID, version:VERSION, required_previous_seed_count:REQUIRED_PREVIOUS_SEEDS, seed_ids:SEED_IDS, seeds:SEEDS });

  function install(system) {
    if (!system || typeof system.gameLanguageOntology !== 'function') return { installed:false, reason:'CANONICAL_LANGUAGE_SYSTEM_NOT_READY' };
    const originalOntology = system.gameLanguageOntology.bind(system);
    const original = originalOntology();
    if (!original || !Array.isArray(original.seed_concepts)) return { installed:false, reason:'INVALID_CANONICAL_ONTOLOGY' };
    if (original.seed_concepts.length < REQUIRED_PREVIOUS_SEEDS) return { installed:false, reason:'PREVIOUS_SEED_LOCK_NOT_SATISFIED' };
    const byId = new Map(original.seed_concepts.map(c => [c.concept_id, c]));
    for (const item of SEEDS) {
      if (byId.has(item.concept_id)) return { installed:false, reason:`DUPLICATE_SEED:${item.concept_id}` };
      byId.set(item.concept_id, item);
    }
    const merged = Object.freeze({
      ...original,
      schema_version: '1.3.0',
      implementation_status: 'BATCH_03_DEEP_SEMANTIC_LOCKED',
      seed_concepts: Object.freeze([...original.seed_concepts, ...SEEDS]),
      population_policy: Object.freeze({ ...(original.population_policy || {}), previous_seed_count: original.seed_concepts.length, current_seed_count: original.seed_concepts.length + SEEDS.length, batch_03_seed_count: SEEDS.length, batch_03_status:'LOCKED' }),
      batch_03: registry,
      semantic_layers: Object.freeze([...(original.semantic_layers || []), 'AGENCY','CONTROL','CAUSALITY','DEPENDENCY','UNCERTAINTY','STRATEGY','COUNTERFACTUAL','DECISION'])
    });
    system.gameLanguageOntology = () => merged;
    system.BATCH_03 = registry;
    return { installed:true, seed_count:merged.seed_concepts.length, batch_id:BATCH_ID };
  }

  global.OmegaLanguageBatch03 = Object.freeze({ BATCH_ID, VERSION, SEED_IDS, registry, install });

  function autoInstall() {
    const system = global.OmegaLanguageSystem;
    if (!system) return false;
    const result = install(system);
    if (result.installed && global.OmegaGameLanguageBridge && typeof global.OmegaGameLanguageBridge.load === 'function') {
      try {
        global.OmegaGameLanguageBridge.load(system.gameLanguageOntology());
        if (typeof global.OmegaGameLanguageBridge.install === 'function') global.OmegaGameLanguageBridge.install();
      } catch (_) {}
    }
    return result.installed;
  }

  if (!autoInstall()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (autoInstall() || attempts >= 200) clearInterval(timer);
    }, 25);
  }
})(typeof window !== 'undefined' ? window : globalThis);
