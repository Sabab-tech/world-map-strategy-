/**
 * OMEGA LANGUAGE SYSTEM - BATCH 03 DEEP SEMANTIC EXTENSION
 * Seeds 25-40 plus contextual discourse semantics. Additive to the canonical seed graph.
 */
(function (global) {
  'use strict';

  const BATCH_ID='BATCH_03_DEEP_SEMANTIC';
  const VERSION='1.3.0';
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

  /* Context-sensitive natural dialogue is data, not a response hard-code in the runtime. */
  const DISCOURSE_LEXICON=Object.freeze({
    schema_version:'OMEGA-DISCOURSE/1.0',
    detection:Object.freeze({
      standaloneOnly:true,
      maxTokens:10,
      rejectWhenQuestionMarkersPresent:true,
      longestPhraseFirst:true,
      contextWindowTurns:8,
      usePreviousTurn:true,
      useFollowingTurnWhenAvailable:true
    }),
    dimensions:Object.freeze([
      'dialogAct','polarity','certainty','commitment','stance','emotion','socialForce',
      'temporalReference','requiresContext','previousTurnDependency','followingTurnDependency'
    ]),
    intents:Object.freeze({
      GREETING:Object.freeze({priority:100,requiresContext:false,dialogAct:'GREETING',polarity:'NEUTRAL',certainty:'HIGH',commitment:'NONE',stance:'SOCIAL_OPEN',phrases:Object.freeze({en:['hi','hello','hey','good morning','good afternoon','good evening'],bn:['হাই','হ্যালো','আসসালামু আলাইকুম','সুপ্রভাত','শুভ সকাল','শুভ অপরাহ্ণ','শুভ সন্ধ্যা']}),melody:Object.freeze({en:['How can I help?','I am ready for your question.'],bn:['কীভাবে সাহায্য করতে পারি?','আপনার প্রশ্নের জন্য প্রস্তুত আছি।']})}),
      GRATITUDE:Object.freeze({priority:98,requiresContext:false,dialogAct:'THANKS',polarity:'POSITIVE',certainty:'HIGH',commitment:'NONE',stance:'SOCIAL_CLOSING',phrases:Object.freeze({en:['thanks','thank you','many thanks','thanks a lot','thank you very much','much appreciated'],bn:['ধন্যবাদ','অনেক ধন্যবাদ','অশেষ ধন্যবাদ','অনেক কৃতজ্ঞতা']}),melody:Object.freeze({en:['You are welcome.','Glad to help.'],bn:['স্বাগতম।','সহায়তা করতে পেরে ভালো লাগল।']})}),
      GRATITUDE_DECLINED:Object.freeze({priority:99,requiresContext:false,dialogAct:'DECLINED_THANKS',polarity:'NEUTRAL',certainty:'HIGH',commitment:'NONE',stance:'SOCIAL_CLOSING',phrases:Object.freeze({en:['no thanks','no, thanks','no thank you','no thanks at all'],bn:['না ধন্যবাদ','না, ধন্যবাদ','না, ধন্যবাদ লাগবে না']}),melody:Object.freeze({en:['Understood.'],bn:['বুঝেছি।']})}),
      WELCOME:Object.freeze({priority:97,requiresContext:false,dialogAct:'WELCOME',polarity:'POSITIVE',certainty:'HIGH',commitment:'NONE',stance:'SOCIAL_OPEN',phrases:Object.freeze({en:['welcome','you are welcome'],bn:['স্বাগতম','আপনাকে স্বাগতম']}),melody:Object.freeze({en:['Thank you.','Glad to have you here.'],bn:['ধন্যবাদ।','আপনাকে এখানে পেয়ে ভালো লাগছে।']})}),
      FAREWELL:Object.freeze({priority:96,requiresContext:false,dialogAct:'FAREWELL',polarity:'NEUTRAL',certainty:'HIGH',commitment:'NONE',stance:'SOCIAL_CLOSING',phrases:Object.freeze({en:['bye','goodbye','see you','see you later','take care'],bn:['বিদায়','আবার দেখা হবে','পরে দেখা হবে','ভালো থাকবেন']}),melody:Object.freeze({en:['Goodbye.','Take care.'],bn:['বিদায়।','ভালো থাকবেন।']})}),
      APOLOGY:Object.freeze({priority:95,requiresContext:false,dialogAct:'APOLOGY',polarity:'NEGATIVE',certainty:'HIGH',commitment:'NONE',stance:'SOCIAL_REPAIR',phrases:Object.freeze({en:['sorry','i am sorry','my apologies','pardon me','my bad'],bn:['দুঃখিত','আমি দুঃখিত','ক্ষমা করবেন','মাফ করবেন']}),melody:Object.freeze({en:['Understood.','No problem.'],bn:['বুঝেছি।','সমস্যা নেই।']})}),
      ACKNOWLEDGEMENT:Object.freeze({priority:90,requiresContext:true,contextSensitive:true,dialogAct:'ACKNOWLEDGEMENT',polarity:'NEUTRAL_TO_POSITIVE',certainty:'MEDIUM',commitment:'LOW',stance:'ACCEPTING',phrases:Object.freeze({en:['ok','okay','alright','all right','got it','understood','noted','roger that','fine','sure'],bn:['ওকে','ঠিক আছে','আচ্ছা','বুঝেছি','বুঝলাম','ঠিক','নোট করলাম','ঠিক আছে বুঝেছি']}),melody:Object.freeze({en:['Understood.','Noted.','Proceeding with that context.'],bn:['বুঝেছি।','নোট করলাম।','এই প্রসঙ্গ অনুযায়ী এগোচ্ছি।']})}),
      AFFIRMATION:Object.freeze({priority:91,requiresContext:true,contextSensitive:true,dialogAct:'AFFIRMATION',polarity:'POSITIVE',certainty:'HIGH',commitment:'HIGH',stance:'AGREEING',phrases:Object.freeze({en:['yes','yeah','yep','certainly','definitely','absolutely','of course','sure','indeed','correct','that is right','that’s right','right'],bn:['হ্যাঁ','জি','জী','অবশ্যই','নিশ্চয়ই','নিশ্চিত','ঠিক','সঠিক','ঠিক বলেছেন','এটাই ঠিক']}),melody:Object.freeze({en:['Understood.','Confirmed.'],bn:['বুঝেছি।','নিশ্চিত করা হলো।']})}),
      NEGATION:Object.freeze({priority:92,requiresContext:true,contextSensitive:true,dialogAct:'NEGATION',polarity:'NEGATIVE',certainty:'HIGH',commitment:'HIGH',stance:'REJECTING',phrases:Object.freeze({en:['no','nope','nah','not really','not that','never mind'],bn:['না','নাহ','না না','তা না','ঠিক না','দরকার নেই','থাক']}),melody:Object.freeze({en:['Understood. I will treat that as a rejection or negative response in this context.'],bn:['বুঝেছি। এই প্রসঙ্গে এটিকে না বা প্রত্যাখ্যান হিসেবে ধরছি।']})}),
      DISAGREEMENT:Object.freeze({priority:93,requiresContext:true,contextSensitive:true,dialogAct:'DISAGREEMENT',polarity:'NEGATIVE',certainty:'HIGH',commitment:'HIGH',stance:'CORRECTIVE',phrases:Object.freeze({en:['but no','no that is not right','that is not right','not exactly','no, that’s not right'],bn:['কিন্তু না','না, তা নয়','না, সেটা ঠিক না','এটা ঠিক নয়','তা নয়','ঠিক নয়']}),melody:Object.freeze({en:['Understood. I will treat that as a correction or disagreement and reassess the previous context.'],bn:['বুঝেছি। এটিকে সংশোধন বা দ্বিমত হিসেবে ধরে আগের প্রসঙ্গটি আবার মূল্যায়ন করছি।']})}),
      HESITATION:Object.freeze({priority:89,requiresContext:true,contextSensitive:true,dialogAct:'HESITATION',polarity:'NEUTRAL',certainty:'LOW',commitment:'LOW',stance:'UNDECIDED',phrases:Object.freeze({en:['hmm','hmmm','hm','uhm','um','well'],bn:['হুম','হুমম','হুম্','উম','উমম']}),melody:Object.freeze({en:['I read that as hesitation or uncertainty from the current context.'],bn:['বর্তমান প্রসঙ্গ অনুযায়ী এটিকে দ্বিধা বা অনিশ্চয়তা হিসেবে ধরছি।']})}),
      CONTINUATION:Object.freeze({priority:88,requiresContext:true,contextSensitive:true,dialogAct:'CONTINUE',polarity:'POSITIVE',certainty:'MEDIUM',commitment:'MEDIUM',stance:'CONTINUING',phrases:Object.freeze({en:['go on','continue','carry on','tell me more','keep going','then'],bn:['বলো','চালিয়ে যাও','আর বলো','আরও বলো','বলতে থাকো','তারপর']}),melody:Object.freeze({en:['Continuing from the current context.'],bn:['বর্তমান প্রসঙ্গ থেকে চালিয়ে যাচ্ছি।']})}),
      CLOSURE_REQUEST:Object.freeze({priority:87,requiresContext:false,dialogAct:'CLOSURE_REQUEST',polarity:'NEUTRAL',certainty:'HIGH',commitment:'HIGH',stance:'CLOSING',phrases:Object.freeze({en:['that’s all','thats all','that is all','enough','stop there','we are done','i am done','nothing else'],bn:['এই পর্যন্ত','এটাই যথেষ্ট','আর দরকার নেই','এখানেই শেষ','শেষ','আর কিছু না','এই পর্যন্তই']}),melody:Object.freeze({en:['Understood. I will close this line of conversation.'],bn:['বুঝেছি। এই কথোপকথনের ধারাটি এখানে শেষ করছি।']})}),
      WELLBEING:Object.freeze({priority:86,requiresContext:false,dialogAct:'WELLBEING_CHECK',polarity:'NEUTRAL',certainty:'MEDIUM',commitment:'NONE',stance:'SOCIAL_CHECK',phrases:Object.freeze({en:['how are you','how have you been','are you okay'],bn:['কেমন আছো','কেমন আছেন','তুমি কেমন আছ','আপনি কেমন আছেন']}),melody:Object.freeze({en:['I am operating normally and ready for the next question.'],bn:['আমি স্বাভাবিকভাবে কাজ করছি এবং পরের প্রশ্নের জন্য প্রস্তুত।']})})
    }),
    contextualResolution:Object.freeze({
      HESITATION:Object.freeze({afterQuestion:'HESITATION_AFTER_QUESTION',afterStatement:'HESITATION_AFTER_STATEMENT',afterAffirmation:'ACKNOWLEDGEMENT_OR_HESITATION',afterNegation:'HESITATION_AFTER_NEGATION'}),
      ACKNOWLEDGEMENT:Object.freeze({afterQuestion:'CONFIRMATION',afterStatement:'ACKNOWLEDGEMENT'}),
      AFFIRMATION:Object.freeze({afterQuestion:'CONSENT_OR_AFFIRMATION',afterStatement:'AGREEMENT'}),
      NEGATION:Object.freeze({afterQuestion:'REFUSAL_OR_NEGATION',afterStatement:'NEGATION'}),
      DISAGREEMENT:Object.freeze({afterQuestion:'CORRECTION',afterStatement:'DISAGREEMENT'}),
      CONTINUATION:Object.freeze({afterQuestion:'CONTINUE_REQUEST',afterStatement:'CONTINUE_REQUEST'})
    })
  });

  const DATA={
    ACTOR:{type:'AGENT',domain:'AGENCY',roles:['ENTITY','ROLE','AUTHORITY','CAPABILITY'],required:['identity'],optional:['role','authority','capability','ownership','jurisdiction','intent'],relations:[['acts_on','TARGET'],['owns','OWNERSHIP'],['pursues','GOAL'],['makes','DECISION']],runtime:'resolve_actor_from_authoritative_entity_registry',invalid:['invent_actor','infer_authority_from_name_only'],boundary:'AUTHORITY_AND_CAPABILITY_GATE',description:'Identifies the entity that performs, authorizes, owns, delegates, or is accountable for a semantic action or decision without inferring power from a name alone.'},
    TARGET:{type:'EFFECT_TARGET',domain:'AGENCY',roles:['ENTITY','PROPERTY','STATE_VARIABLE','SCOPE'],required:['reference'],optional:['property','scope','desired_state'],relations:[['targeted_by','ACTION'],['described_by','ATTRIBUTE'],['evaluated_by','GOAL']],runtime:'resolve_typed_target_reference',invalid:['invent_target','mutate_target_during_resolution'],boundary:'TARGET_RESOLUTION_GATE',description:'Identifies the exact entity, property, state variable, resource, facility, actor, or scoped object referenced by an action or evaluation.'},
    ATTRIBUTE:{type:'PROPERTY_DEFINITION',domain:'STATE',roles:['ENTITY','PROPERTY','DOMAIN'],required:['attribute_id'],optional:['datatype','unit_family','valid_range','mutability'],relations:[['has_value','VALUE'],['belongs_to','TARGET'],['bounded_by','CONSTRAINT']],runtime:'resolve_from_semantic_property_registry',invalid:['treat_attribute_as_value','use_unregistered_attribute'],boundary:'TYPE_VALIDATION_GATE',description:'Defines a typed property of an entity or state.'},
    VALUE:{type:'TYPED_VALUE',domain:'STATE',roles:['ATTRIBUTE','VALUE','PROVENANCE'],required:['attribute','value'],optional:['unit','confidence','uncertainty','timestamp','source'],relations:[['instantiates','ATTRIBUTE'],['measured_by','UNIT'],['supported_by','PROVENANCE']],runtime:'typed_value_resolution',invalid:['invent_numeric_value','drop_unit','drop_provenance'],boundary:'VALUE_VALIDATION_GATE',description:'Represents an actual typed value with units, provenance, confidence and uncertainty.'},
    CONDITION:{type:'LOGICAL_PREDICATE',domain:'CONTROL',roles:['OPERAND','OPERATOR','CONTEXT'],required:['predicate'],optional:['operands','operator','temporal_scope'],relations:[['guards','DECISION'],['uses','THRESHOLD'],['evaluates','STATE_VARIABLE']],runtime:'evaluate_predicate_against_world_or_scenario_state',invalid:['treat_unknown_as_true','execute_before_condition_evaluation'],boundary:'PRECONDITION_GATE',description:'Represents a logical prerequisite that evaluates as true, false, or unknown.'},
    CONSTRAINT:{type:'BOUNDARY',domain:'CONTROL',roles:['SUBJECT','LIMIT','SCOPE'],required:['subject','boundary'],optional:['operator','unit','scope','severity'],relations:[['constrains','DECISION'],['constrains','ACTION'],['derived_from','POLICY']],runtime:'validate_candidate_against_constraint_set',invalid:['silently_relax_constraint','ignore_scope'],boundary:'CONSTRAINT_GATE',description:'Represents a binding limit on an action, plan, decision, actor, resource, or state transition.'},
    THRESHOLD:{type:'BOUNDARY_TRIGGER',domain:'CONTROL',roles:['METRIC','BOUNDARY','OPERATOR'],required:['metric','boundary','operator'],optional:['duration','scope','activation_effect'],relations:[['evaluates','ATTRIBUTE'],['activates','CONDITION'],['may_trigger','DECISION']],runtime:'evaluate_boundary_crossing_with_temporal_scope',invalid:['treat_plain_value_as_threshold','omit_comparison_operator'],boundary:'THRESHOLD_GATE',description:'Represents a typed boundary-crossing rule.'},
    CAUSE:{type:'CAUSAL_RELATION',domain:'CAUSALITY',roles:['CAUSE','EFFECT','EVIDENCE'],required:['cause','effect'],optional:['mechanism','strength','evidence','confidence','time_order'],relations:[['causes','CONSEQUENCE'],['supported_by','EVIDENCE']],runtime:'resolve_explicit_or_evidence_supported_causal_edge',invalid:['promote_correlation_to_cause','reverse_causal_direction'],boundary:'CAUSAL_INFERENCE_GATE',description:'Represents an evidence-supported causal edge.'},
    CONSEQUENCE:{type:'EFFECT',domain:'CAUSALITY',roles:['SOURCE','EFFECT','SCOPE'],required:['effect'],optional:['source','directness','horizon','intended','polarity','confidence'],relations:[['result_of','CAUSE'],['may_increase','RISK'],['may_change','STATE_VARIABLE']],runtime:'trace_direct_and_downstream_effects',invalid:['collapse_downstream_effects_into_direct_effect','claim_unbounded_effect'],boundary:'CONSEQUENCE_EVALUATION_GATE',description:'Represents a direct or downstream effect.'},
    DEPENDENCY:{type:'DIRECTED_DEPENDENCY',domain:'DEPENDENCY',roles:['SOURCE','TARGET','STRENGTH'],required:['source','target'],optional:['direction','strength','criticality','substitutability','latency','failure_mode'],relations:[['depends_on','TARGET'],['creates','RISK'],['propagates_failure_to','TARGET']],runtime:'resolve_dependency_graph_edge',invalid:['create_undirected_dependency','assume_dependency_from_cooccurrence'],boundary:'DEPENDENCY_GRAPH_GATE',description:'Represents a directed dependency relationship.'},
    RISK:{type:'RISK_ASSESSMENT',domain:'UNCERTAINTY',roles:['HAZARD','PROBABILITY','IMPACT','EXPOSURE'],required:['event'],optional:['probability','impact','exposure','vulnerability','horizon','mitigation'],relations:[['quantified_by','PROBABILITY'],['arises_from','DEPENDENCY'],['informs','DECISION']],runtime:'evaluate_risk_from_event_probability_and_impact_context',invalid:['equate_risk_with_probability','omit_impact_context'],boundary:'RISK_EVALUATION_GATE',description:'Represents structured exposure to a harmful event.'},
    PROBABILITY:{type:'LIKELIHOOD',domain:'UNCERTAINTY',roles:['EVENT','DISTRIBUTION','EVIDENCE'],required:['event','likelihood'],optional:['prior','posterior','confidence','distribution','horizon','model'],relations:[['quantifies','EVENT'],['updates_from','EVIDENCE'],['feeds','RISK']],runtime:'preserve_probability_and_uncertainty_metadata',invalid:['present_probability_without_context','confuse_confidence_with_probability'],boundary:'UNCERTAINTY_GATE',description:'Represents likelihood under a defined model and evidence set.'},
    GOAL:{type:'DESIRED_STATE',domain:'STRATEGY',roles:['ACTOR','TARGET','DESIRED_STATE'],required:['desired_state'],optional:['owner','target','metric','deadline','priority','constraints','success_condition','failure_condition'],relations:[['owned_by','ACTOR'],['applies_to','TARGET'],['ranked_by','PRIORITY']],runtime:'resolve_goal_into_evaluable_desired_state',invalid:['treat_target_as_goal','accept_unevaluable_goal'],boundary:'GOAL_VALIDATION_GATE',description:'Represents an actor-owned desired future state.'},
    PRIORITY:{type:'OBJECTIVE_ORDER',domain:'STRATEGY',roles:['SUBJECT','RANK','CONTEXT'],required:['subject'],optional:['rank','weight','context','actor','horizon','conflict_policy'],relations:[['orders','GOAL'],['orders','DECISION'],['resolves_conflict_between','GOAL']],runtime:'resolve_contextual_priority_with_conflict_policy',invalid:['assume_global_absolute_priority','compare_without_context'],boundary:'PRIORITY_GATE',description:'Represents contextual ordering among competing objectives.'},
    SCENARIO:{type:'COUNTERFACTUAL_WORLD',domain:'COUNTERFACTUAL',roles:['BASE_STATE','ASSUMPTION','BRANCH'],required:['base_state'],optional:['assumptions','overrides','events','actors','constraints','goals','horizon','probability','branch_id'],relations:[['branches_from','WORLD_STATE'],['contains','ASSUMPTION'],['produces','FORECAST']],runtime:'clone_isolated_world_state_for_counterfactual_reasoning',invalid:['mutate_live_world_state','merge_scenario_state_without_commit'],boundary:'SCENARIO_ISOLATION_GATE',description:'Represents an isolated hypothetical or counterfactual world configuration.'},
    DECISION:{type:'VALIDATED_CHOICE',domain:'DECISION',roles:['ACTOR','TARGET','ALTERNATIVES','RATIONALE'],required:['actor','selected_action'],optional:['target','alternatives','goals','priorities','constraints','risks','probabilities','consequences','rationale','confidence','authority','scenario'],relations:[['made_by','ACTOR'],['targets','TARGET'],['satisfies','GOAL'],['bounded_by','CONSTRAINT']],runtime:'construct_auditable_validated_decision_contract',invalid:['execute_unvalidated_decision','bypass_authority_or_constraint_checks'],boundary:'DECISION_VALIDATION_GATE',description:'Represents an auditable selected choice after evaluation.'}
  };

  const makeSeed=(id,d)=>Object.freeze({concept_id:id,semantic_type:d.type,domain:d.domain,batch:3,lexical:{en:{lemma:id.toLowerCase(),aliases:[]},bn:{lemma:id,aliases:[]}},semantic_roles:Object.freeze(d.roles),required_slots:Object.freeze(d.required),optional_slots:Object.freeze(d.optional),relations:Object.freeze(d.relations.map(([relation,target])=>Object.freeze({relation,target}))),composition_rules:COMMON_COMPOSITION,invalid_compositions:Object.freeze(d.invalid),runtime_resolution:Object.freeze({strategy:d.runtime}),execution_boundary:d.boundary,diagnostics:COMMON_DIAGNOSTICS,reasoning_contract:Object.freeze({causal_graph:['CAUSE','CONSEQUENCE'],dependency_graph:['DEPENDENCY'],uncertainty_graph:['RISK','PROBABILITY'],strategic_graph:['GOAL','PRIORITY','RISK','DECISION'],counterfactual_graph:['SCENARIO'],decision_graph:['ACTOR','TARGET','CONDITION','CONSTRAINT','GOAL','PRIORITY','RISK','DECISION']}),description:d.description});
  const SEEDS=Object.freeze(SEED_IDS.map(id=>makeSeed(id,DATA[id])));
  const REGISTRY=Object.freeze({batch_id:BATCH_ID,version:VERSION,required_previous_seed_count:REQUIRED_PREVIOUS_SEEDS,seed_ids:SEED_IDS,seeds:SEEDS});

  function buildOntology(system){
    if(!system||typeof system.gameLanguageOntology!=='function')return{ok:false,reason:'CANONICAL_LANGUAGE_SYSTEM_NOT_READY'};
    const original=system.gameLanguageOntology();
    if(!original||!Array.isArray(original.seed_concepts))return{ok:false,reason:'INVALID_CANONICAL_ONTOLOGY'};
    if(original.seed_concepts.length<REQUIRED_PREVIOUS_SEEDS)return{ok:false,reason:'PREVIOUS_SEED_LOCK_NOT_SATISFIED'};
    const ids=new Set(original.seed_concepts.map(c=>c.concept_id));
    for(const item of SEEDS)if(ids.has(item.concept_id))return{ok:false,reason:'DUPLICATE_SEED:'+item.concept_id};
    const ontology=Object.freeze({...original,schema_version:'1.3.0',implementation_status:'BATCH_03_DEEP_SEMANTIC_LOCKED',seed_concepts:Object.freeze([...original.seed_concepts,...SEEDS]),population_policy:Object.freeze({...original.population_policy,previous_seed_count:original.seed_concepts.length,current_seed_count:original.seed_concepts.length+SEEDS.length,batch_03_seed_count:SEEDS.length,batch_03_status:'LOCKED'}),batch_03:REGISTRY,discourse_lexicon:DISCOURSE_LEXICON,semantic_layers:Object.freeze([...(original.semantic_layers||[]),'AGENCY','CONTROL','CAUSALITY','DEPENDENCY','UNCERTAINTY','STRATEGY','COUNTERFACTUAL','DECISION','DISCOURSE'])});
    return{ok:true,ontology};
  }

  function install(system){
    const built=buildOntology(system);
    if(!built.ok)return{installed:false,reason:built.reason};
    if(global.OmegaGameLanguageBridge&&typeof global.OmegaGameLanguageBridge.load==='function'){
      try{global.OmegaGameLanguageBridge.load(built.ontology);if(typeof global.OmegaGameLanguageBridge.install==='function')global.OmegaGameLanguageBridge.install();}catch(_){/* optional bridge */}
    }
    return{installed:true,seed_count:built.ontology.seed_concepts.length,batch_id:BATCH_ID,ontology:built.ontology};
  }

  global.OmegaLanguageBatch03=Object.freeze({BATCH_ID,VERSION,SEED_IDS,registry:REGISTRY,discourseLexicon:DISCOURSE_LEXICON,buildOntology,install});
  if(global.OmegaLanguageSystem)install(global.OmegaLanguageSystem);
})(typeof window!=='undefined'?window:globalThis);
