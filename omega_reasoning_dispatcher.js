/**
 * OMEGA REASONING DISPATCHER v1.2.0
 * Connects semantic intent/evidence to the existing 40-stage cognitive engine.
 * The cognitive engine remains evidence-bound: runtime datasets are the source
 * of factual evidence; the cognitive OS is used for analysis and simulation.
 */
(function(global){'use strict';
  const VERSION = '1.2.0';
  const DEEP_OPS = new Set([
    'CAUSE','CONSEQUENCE','ANALYZE','FORECAST','SCENARIO','COUNTERFACTUAL',
    'POLICY','RECOMMEND','ASSESS_RISK','ASSESS_SECURITY','COMPARE',
    'FEASIBILITY','EXPLAIN','METHOD','TRACE_DEPENDENCY','TRACE_SUPPLY_CHAIN'
  ]);
  const NON_COGNITIVE = new Set(['CONVERSATION','GREETING','GRATITUDE','GRATITUDE_DECLINED','WELCOME','FAREWELL','WELLBEING']);

  function text(v){ return String(v == null ? '' : v).trim(); }
  function obj(v){ return !!v && typeof v === 'object'; }
  function clone(v){ try{return v===undefined?undefined:JSON.parse(JSON.stringify(v));}catch(_){return v;} }
  function langOf(parsed, common){
    return parsed?.language || common?.language || (/[ঀ-৿]/.test(text(parsed?.surface||parsed?.raw||'')) ? 'bn' : 'en');
  }
  function operationOf(parsed, result){
    return text(parsed?.operation || result?.operation || parsed?.intent || 'UNKNOWN').toUpperCase();
  }
  function cognitiveCategory(operation){
    const map = {
      CAUSE:'CAUSAL_ANALYSIS', CONSEQUENCE:'IMPACT_ANALYSIS', ANALYZE:'STRATEGIC_ANALYSIS',
      FORECAST:'FORECASTING', SCENARIO:'SCENARIO_ANALYSIS', COUNTERFACTUAL:'COUNTERFACTUAL_ANALYSIS',
      POLICY:'POLICY_EVALUATION', RECOMMEND:'POLICY_RECOMMENDATION', FEASIBILITY:'FEASIBILITY_ANALYSIS',
      COMPARE:'COMPARATIVE_ANALYSIS', ASSESS_RISK:'RISK_ASSESSMENT', ASSESS_SECURITY:'SECURITY_ASSESSMENT',
      TRACE_DEPENDENCY:'DEPENDENCY_ANALYSIS', TRACE_SUPPLY_CHAIN:'SUPPLY_CHAIN_ANALYSIS',
      EXPLAIN:'EXPLANATION', METHOD:'PROCESS_EXPLANATION',
      ATTRIBUTE:'ATTRIBUTE_ANALYSIS', IDENTIFY:'ENTITY_ANALYSIS', LOOKUP:'GENERAL_ANALYSIS',
      COUNT:'QUANTITATIVE_ANALYSIS', LOCATE:'LOCATION_ANALYSIS', QUANTITY:'QUANTITATIVE_ANALYSIS',
      UNKNOWN:'GENERAL_ANALYSIS'
    };
    return map[operation] || 'GENERAL_ANALYSIS';
  }
  function evidenceSummary(result){
    if(!obj(result)) return {available:false, facts:[], unknowns:['NO_RESULT']};
    const facts = [];
    const unknowns = [];
    if(Array.isArray(result.facts)) facts.push(...result.facts);
    if(Array.isArray(result.evidence)) facts.push(...result.evidence);
    if(Array.isArray(result.unknowns)) unknowns.push(...result.unknowns);
    if(Array.isArray(result.uncertainties)) unknowns.push(...result.uncertainties);
    const keys = ['value','count','status','score','runwayDays','stockpile','consumption','production','reserves','imports','exports','locations'];
    for(const k of keys) if(result[k]!==undefined && result[k]!==null) facts.push({key:k,value:clone(result[k])});
    return {available:facts.length>0, facts, unknowns:[...new Set(unknowns.map(text).filter(Boolean))]};
  }
  function stageTelemetry(context, evidence){
    const gs = obj(context?.gameState) ? context.gameState : {};
    const pickObj = (...keys) => {
      for(const key of keys){ const v=gs?.[key]; if(obj(v)) return clone(v); }
      return {};
    };
    const pickNumber = (...keys) => {
      for(const key of keys){ const v=Number(gs?.[key]); if(Number.isFinite(v)) return v; }
      return undefined;
    };
    return {
      inventory: pickObj('inventory','resources','reserves','stockpiles'),
      chokepoints: Array.isArray(gs.chokepoints) ? clone(gs.chokepoints) : (Array.isArray(gs.logistics?.chokepoints) ? clone(gs.logistics.chokepoints) : []),
      processingUtilization: pickNumber('processingUtilization','processing_utilization') ?? Number(gs.processing?.utilization),
      bindingConstraintNode: gs.bindingConstraintNode || gs.binding_constraint_node || gs.processing?.bindingConstraintNode,
      dailyExtraction: pickNumber('dailyExtraction','daily_extraction','extraction'),
      dailyImports: pickNumber('dailyImports','daily_imports','imports'),
      dailyIndustrialDemand: pickNumber('dailyIndustrialDemand','industrialDemand','industrial_demand'),
      dailyCivilianDemand: pickNumber('dailyCivilianDemand','civilianDemand','civilian_demand'),
      processingCapacityBPD: pickNumber('processingCapacityBPD','processingCapacity','processing_capacity'),
      resilienceScore: pickNumber('resilienceScore','resilience','resilience_score'),
      evidenceObserved: evidence.available,
      unknownTelemetryFields: ['inventory','chokepoints','processingUtilization','dailyExtraction','dailyImports','dailyIndustrialDemand','dailyCivilianDemand','processingCapacityBPD','resilienceScore'].filter(k=>{
        if(k==='inventory') return !Object.keys(pickObj('inventory','resources','reserves','stockpiles')).length;
        if(k==='chokepoints') return !gs.chokepoints && !gs.logistics?.chokepoints;
        return !Number.isFinite(Number(gs[k]));
      })
    };
  }
  function safeCognitiveCall(question, category, evidence, context){
    const engine = global.OmegaCognitiveEngine || global.OmegaSharedCognition;
    if(!engine || typeof engine.process !== 'function') return {available:false, reason:'COGNITIVE_ENGINE_UNAVAILABLE'};
    try{
      const country = context?.countryName || context?.countryId || null;
      const target = {
        ...(obj(context) ? clone(context) : {}),
        evidence: clone(evidence),
        evidenceBoundary: 'RUNTIME_DETERMINISTIC_RESULT_ONLY',
        prohibitWorldStateInvention: true,
        epistemicPolicy: 'UNKNOWN_WHEN_NOT_EVIDENCED'
      };
      const raw = engine.process(text(question), category, country, target);
      const stagesExecuted = Array.isArray(raw?.stageLog) ? raw.stageLog.length : 0;
      return {available:true, result:clone(raw), stagesRequested:40, stagesExecuted, full40:stagesExecuted===40, telemetryMode:'COGNITIVE_ENGINE_INTERNAL_PIPELINE', evidenceBoundary:'RUNTIME_DETERMINISTIC_RESULT_ONLY'};
    }catch(error){
      return {available:false, reason:'COGNITIVE_ENGINE_ERROR', error:text(error.message), stagesRequested:40, stagesExecuted:0, full40:false};
    }
  }
  function extractText(raw){
    if(typeof raw === 'string' && raw.trim()) return raw.trim();
    if(!obj(raw)) return '';
    for(const k of ['answer','text','summary','recommendation','conclusion','analysis','briefing']) if(typeof raw[k] === 'string' && raw[k].trim()) return raw[k].trim();
    return '';
  }
  function dispatch(question, parsed, result, common={}){
    const operation = operationOf(parsed,result);
    const language = langOf(parsed,common);
    const evidence = evidenceSummary(result);
    const conversational = NON_COGNITIVE.has(operation) || operation==='CONVERSATION';
    if(conversational) return {version:VERSION, operation, category:'CONVERSATION', contract:{version:VERSION,operation,language,deepReasoningRequested:false,evidence,answerBoundary:'INTERACTION_RUNTIME',status:'NOT_REQUIRED'}, text:null,cognitive:null,used:false};

    const deep = DEEP_OPS.has(operation);
    const contract = {
      version: VERSION,
      operation,
      category: cognitiveCategory(operation),
      language,
      deepReasoningRequested: deep,
      full40StageExecutionRequested: true,
      evidence,
      answerBoundary: deep ? 'EVIDENCE_PLUS_COGNITIVE_INFERENCE' : 'DETERMINISTIC_RESULT_PLUS_COGNITIVE_TRACE',
      status: 'PENDING'
    };
    const cognitive = safeCognitiveCall(question, contract.category, evidence, common);
    contract.status = cognitive.available ? 'EXECUTED' : 'UNAVAILABLE';
    contract.stageCount = cognitive.stagesExecuted || 0;
    contract.full40StageExecution = cognitive.full40 === true;
    const textOut = deep ? extractText(cognitive.result) : '';
    return {version:VERSION, operation, contract, text:textOut || null, cognitive, used:cognitive.available, cognitiveTrace:{stagesRequested:40,stagesExecuted:cognitive.stagesExecuted||0,full40:cognitive.full40===true,telemetryMode:cognitive.telemetryMode||null}};
  }
  global.OmegaReasoningDispatcher = Object.freeze({ VERSION, dispatch, operations: Object.freeze([...DEEP_OPS]), full40:true });
})(typeof window !== 'undefined' ? window : globalThis);
