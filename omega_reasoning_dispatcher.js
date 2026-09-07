/**
 * OMEGA REASONING DISPATCHER v1.0.1
 * Connects semantic intent/evidence to the existing cognitive engine without
 * making the cognitive engine a source of world-state facts.
 */
(function(global){'use strict';
  const VERSION = '1.0.1';
  const DEEP_OPS = new Set([
    'CAUSE','CONSEQUENCE','ANALYZE','FORECAST','SCENARIO','COUNTERFACTUAL',
    'POLICY','RECOMMEND','ASSESS_RISK','ASSESS_SECURITY','COMPARE',
    'FEASIBILITY','EXPLAIN','METHOD','TRACE_DEPENDENCY','TRACE_SUPPLY_CHAIN'
  ]);

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
      EXPLAIN:'EXPLANATION', METHOD:'PROCESS_EXPLANATION'
    };
    return map[operation] || operation || 'GENERAL_ANALYSIS';
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
      return {available:true, result:clone(raw)};
    }catch(error){
      return {available:false, reason:'COGNITIVE_ENGINE_ERROR', error:text(error.message)};
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
    const deep = DEEP_OPS.has(operation);
    const contract = {
      version: VERSION,
      operation,
      category: cognitiveCategory(operation),
      language,
      deepReasoningRequested: deep,
      evidence,
      answerBoundary: deep ? 'EVIDENCE_PLUS_COGNITIVE_INFERENCE' : 'DETERMINISTIC_RESULT',
      status: deep ? 'PENDING' : 'NOT_REQUIRED'
    };
    if(!deep) return {version:VERSION, operation, contract, text:null, cognitive:null, used:false};
    const cognitive = safeCognitiveCall(question, contract.category, evidence, common);
    contract.status = cognitive.available ? 'EXECUTED' : 'UNAVAILABLE';
    const textOut = extractText(cognitive.result);
    return {version:VERSION, operation, contract, cognitive, text:textOut || null, used:cognitive.available};
  }
  global.OmegaReasoningDispatcher = Object.freeze({ VERSION, dispatch, operations: Object.freeze([...DEEP_OPS]) });
})(typeof window !== 'undefined' ? window : globalThis);
