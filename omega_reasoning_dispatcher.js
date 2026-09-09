/**
 * OMEGA REASONING DISPATCHER v1.3.0
 * Connects semantic intent/evidence to the existing 40-stage cognitive engine.
 * The 40 stages are executed for substantive questions and receive live game
 * telemetry at the stage-1 boundary. Missing telemetry remains unknown rather
 * than being silently replaced by synthetic world-state facts.
 */
(function(global){'use strict';
  const VERSION = '1.3.0';
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
  function pickObject(gs, keys){
    for(const key of keys){ const value = gs?.[key]; if(obj(value)) return clone(value); }
    return {};
  }
  function pickNumber(gs, keys){
    for(const key of keys){ const value = Number(gs?.[key]); if(Number.isFinite(value)) return value; }
    return undefined;
  }
  function liveTelemetry(context, evidence){
    const gs = obj(context?.gameState) ? context.gameState : {};
    const inventory = pickObject(gs, ['inventory','resources','reserves','stockpiles']);
    const chokepoints = Array.isArray(gs.chokepoints) ? clone(gs.chokepoints) : (Array.isArray(gs.logistics?.chokepoints) ? clone(gs.logistics.chokepoints) : []);
    const processingUtilization = pickNumber(gs, ['processingUtilization','processing_utilization']);
    const processingNode = gs.bindingConstraintNode || gs.binding_constraint_node || gs.processing?.bindingConstraintNode;
    const telemetry = {
      inventory,
      chokepoints,
      processingUtilization: processingUtilization ?? (Number.isFinite(Number(gs.processing?.utilization)) ? Number(gs.processing.utilization) : undefined),
      bindingConstraintNode: processingNode,
      dailyExtraction: pickNumber(gs, ['dailyExtraction','daily_extraction','extraction']),
      dailyImports: pickNumber(gs, ['dailyImports','daily_imports','imports']),
      dailyIndustrialDemand: pickNumber(gs, ['dailyIndustrialDemand','industrialDemand','industrial_demand']),
      dailyCivilianDemand: pickNumber(gs, ['dailyCivilianDemand','civilianDemand','civilian_demand']),
      processingCapacityBPD: pickNumber(gs, ['processingCapacityBPD','processingCapacity','processing_capacity']),
      resilienceScore: pickNumber(gs, ['resilienceScore','resilience','resilience_score']),
      evidenceObserved: evidence.available,
      source: 'LIVE_GAME_STATE'
    };
    telemetry.unknownFields = Object.entries({
      inventory: Object.keys(inventory).length > 0,
      chokepoints: chokepoints.length > 0,
      processingUtilization: Number.isFinite(Number(telemetry.processingUtilization)),
      dailyExtraction: Number.isFinite(Number(telemetry.dailyExtraction)),
      dailyImports: Number.isFinite(Number(telemetry.dailyImports)),
      dailyIndustrialDemand: Number.isFinite(Number(telemetry.dailyIndustrialDemand)),
      dailyCivilianDemand: Number.isFinite(Number(telemetry.dailyCivilianDemand)),
      processingCapacityBPD: Number.isFinite(Number(telemetry.processingCapacityBPD)),
      resilienceScore: Number.isFinite(Number(telemetry.resilienceScore))
    }).filter(([,present])=>!present).map(([key])=>key);
    return telemetry;
  }
  function engineInstance(){
    const exported = global.OmegaCognitiveEngine || global.OmegaSharedCognition;
    if(exported?.instance?.processCognitiveRequest) return exported.instance;
    if(global.OmegaCognitiveOS?.processCognitiveRequest) return global.OmegaCognitiveOS;
    return null;
  }
  function execute40(question, category, evidence, context){
    const engine = engineInstance();
    if(!engine || typeof engine.processCognitiveRequest !== 'function') return {available:false,reason:'COGNITIVE_ENGINE_UNAVAILABLE',stagesRequested:40,stagesExecuted:0,full40:false};
    const telemetry = liveTelemetry(context, evidence);
    const stages = Array.isArray(engine.stages) ? engine.stages : null;
    const originalStage = stages?.[0];
    if(!stages || !originalStage || typeof originalStage.execute !== 'function') return {available:false,reason:'COGNITIVE_40_STAGE_REGISTRY_UNAVAILABLE',stagesRequested:40,stagesExecuted:0,full40:false};

    const wrapper = {
      id: originalStage.id,
      name: originalStage.name,
      execute(ctx, os){
        ctx.countryId = context?.countryId || context?.countryCode || ctx.countryId;
        ctx.targetCountry = context?.countryName || ctx.targetCountry;
        ctx.domain = text(context?.ministryId || category || ctx.domain).toUpperCase();
        ctx.telemetry = clone(telemetry);
        ctx.liveEvidence = clone(evidence);
        ctx.evidenceBoundary = 'RUNTIME_DETERMINISTIC_RESULT_ONLY';
        ctx.prohibitWorldStateInvention = true;
        return originalStage.execute(ctx, os);
      }
    };

    stages[0] = wrapper;
    try {
      const raw = engine.processCognitiveRequest(
        text(question),
        category || 'GENERAL_ANALYSIS',
        context?.countryId || context?.countryCode || 'NATIONAL_SOVEREIGN',
        context?.countryName || 'GLOBAL',
        text(context?.ministryId || category || 'GENERAL').toUpperCase(),
        context?.persona || null
      );
      const stagesExecuted = Array.isArray(raw?.stageLog) ? raw.stageLog.length : 0;
      return {
        available:true,
        result:clone(raw),
        stagesRequested:40,
        stagesExecuted,
        full40:stagesExecuted===40,
        telemetryMode:'LIVE_GAME_STATE_AT_STAGE_1',
        unknownTelemetryFields: telemetry.unknownFields,
        evidenceBoundary:'RUNTIME_DETERMINISTIC_RESULT_ONLY'
      };
    }catch(error){
      return {
        available:false,
        reason:'COGNITIVE_ENGINE_ERROR',
        error:text(error.message),
        stagesRequested:40,
        stagesExecuted:0,
        full40:false,
        telemetryMode:'LIVE_GAME_STATE_AT_STAGE_1',
        unknownTelemetryFields:telemetry.unknownFields
      };
    }finally{
      stages[0] = originalStage;
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
    const category = cognitiveCategory(operation);
    const contract = {
      version: VERSION,
      operation,
      category,
      language,
      deepReasoningRequested: deep,
      full40StageExecutionRequested: true,
      evidence,
      answerBoundary: deep ? 'EVIDENCE_PLUS_COGNITIVE_INFERENCE' : 'DETERMINISTIC_RESULT_PLUS_COGNITIVE_TRACE',
      status: 'PENDING'
    };
    const cognitive = execute40(question, category, evidence, common);
    contract.status = cognitive.available ? 'EXECUTED' : 'UNAVAILABLE';
    contract.stageCount = cognitive.stagesExecuted || 0;
    contract.full40StageExecution = cognitive.full40 === true;
    const textOut = deep ? extractText(cognitive.result) : '';
    return {
      version:VERSION,
      operation,
      contract,
      text:textOut || null,
      cognitive,
      used:cognitive.available,
      cognitiveTrace:{
        stagesRequested:40,
        stagesExecuted:cognitive.stagesExecuted||0,
        full40:cognitive.full40===true,
        telemetryMode:cognitive.telemetryMode||null,
        unknownTelemetryFields:cognitive.unknownTelemetryFields||[]
      }
    };
  }
  global.OmegaReasoningDispatcher = Object.freeze({ VERSION, dispatch, operations: Object.freeze([...DEEP_OPS]), full40:true });
})(typeof window !== 'undefined' ? window : globalThis);
