/**
 * OMEGA REASONING DISPATCHER v2.1.1
 * Evidence-bound bridge between semantic routing and the existing 40-stage OS.
 * Stages 21-40 are distinct, dependency-aware, independently safe, and expose
 * a compact retrieval packet for the downstream AI without replacing UNKNOWN by 0.
 */
(function(global){'use strict';
  const VERSION='2.1.1';
  const NON_COGNITIVE=new Set(['CONVERSATION','GREETING','GRATITUDE','GRATITUDE_DECLINED','WELCOME','FAREWELL','WELLBEING']);
  const DEEP_OPS=new Set(['CAUSE','CONSEQUENCE','ANALYZE','FORECAST','SCENARIO','COUNTERFACTUAL','POLICY','RECOMMEND','ASSESS_RISK','ASSESS_SECURITY','COMPARE','FEASIBILITY','EXPLAIN','METHOD','TRACE_DEPENDENCY','TRACE_SUPPLY_CHAIN']);
  const STAGE_SPECS={
    21:{name:'EVIDENCE_LEDGER',depends:[],parallelEligible:true,group:'FOUNDATION'},
    22:{name:'PROVENANCE_AUDIT',depends:[21],parallelEligible:false,group:'FOUNDATION'},
    23:{name:'DATA_COMPLETENESS_AUDIT',depends:[21],parallelEligible:true,group:'AUDIT'},
    24:{name:'CONSISTENCY_AND_CONFLICT_CHECK',depends:[21],parallelEligible:true,group:'AUDIT'},
    25:{name:'BELIEF_REVISION',depends:[21,22,24],parallelEligible:false,group:'LEARNING'},
    26:{name:'TEMPORAL_CONTEXT_MODEL',depends:[21,23],parallelEligible:true,group:'ANALYSIS'},
    27:{name:'CAUSAL_LINK_GRAPH',depends:[21,24],parallelEligible:true,group:'ANALYSIS'},
    28:{name:'DEPENDENCY_RECONSTRUCTION',depends:[27],parallelEligible:false,group:'ANALYSIS'},
    29:{name:'RESOURCE_BALANCE_ANALYSIS',depends:[21,23],parallelEligible:true,group:'ANALYSIS'},
    30:{name:'CAPACITY_CONSTRAINT_ANALYSIS',depends:[21,24],parallelEligible:true,group:'ANALYSIS'},
    31:{name:'TRADE_AND_CHOKEPOINT_EXPOSURE',depends:[21,23],parallelEligible:true,group:'ANALYSIS'},
    32:{name:'STRATEGIC_VULNERABILITY_SYNTHESIS',depends:[27,28,29,30,31],parallelEligible:false,group:'SYNTHESIS'},
    33:{name:'OPTION_EVIDENCE_ALIGNMENT',depends:[20,29,30,31],parallelEligible:false,group:'DECISION'},
    34:{name:'COUNTERFACTUAL_FRAME',depends:[29,30,31,33],parallelEligible:false,group:'DECISION'},
    35:{name:'MEMORY_CONSOLIDATION',depends:[21,25,26,27,32],parallelEligible:false,group:'LEARNING'},
    36:{name:'RED_TEAM_RECHECK',depends:[33,34],parallelEligible:false,group:'DECISION'},
    37:{name:'DECISION_CONFIDENCE_SYNTHESIS',depends:[23,24,32,36],parallelEligible:false,group:'DECISION'},
    38:{name:'ANSWER_EVIDENCE_PACKET',depends:[21,22,23,24,25,27,28,29,30,31,32,33,34,36,37],parallelEligible:false,group:'HANDOFF'},
    39:{name:'ANSWER_CONTRACT',depends:[37,38],parallelEligible:false,group:'HANDOFF'},
    40:{name:'FINAL_AI_HANDOFF',depends:[38,39],parallelEligible:false,group:'HANDOFF'}
  };
  function text(v){return String(v==null?'':v).trim();}
  function obj(v){return !!v&&typeof v==='object';}
  function clone(v){try{return v===undefined?undefined:JSON.parse(JSON.stringify(v));}catch(_){return v;}}
  function n(v){const x=Number(v);return Number.isFinite(x)?x:null;}
  function range(v){const x=n(v);return x==null?null:Math.max(0,Math.min(1,x));}
  function langOf(parsed,common){return parsed?.language||common?.language||(/[ঀ-৿]/.test(text(parsed?.surface||parsed?.raw||''))?'bn':'en');}
  function operationOf(parsed,result){return text(parsed?.operation||result?.operation||parsed?.intent||'UNKNOWN').toUpperCase();}
  function categoryOf(op){return ({CAUSE:'CAUSAL_ANALYSIS',CONSEQUENCE:'IMPACT_ANALYSIS',ANALYZE:'STRATEGIC_ANALYSIS',FORECAST:'FORECASTING',SCENARIO:'SCENARIO_ANALYSIS',COUNTERFACTUAL:'COUNTERFACTUAL_ANALYSIS',POLICY:'POLICY_EVALUATION',RECOMMEND:'POLICY_RECOMMENDATION',ASSESS_RISK:'RISK_ASSESSMENT',ASSESS_SECURITY:'SECURITY_ASSESSMENT',COMPARE:'COMPARATIVE_ANALYSIS',FEASIBILITY:'FEASIBILITY_ANALYSIS',EXPLAIN:'EXPLANATION',METHOD:'PROCESS_EXPLANATION',TRACE_DEPENDENCY:'DEPENDENCY_ANALYSIS',TRACE_SUPPLY_CHAIN:'SUPPLY_CHAIN_ANALYSIS',ATTRIBUTE:'ATTRIBUTE_ANALYSIS',IDENTIFY:'ENTITY_ANALYSIS',LOOKUP:'GENERAL_ANALYSIS',COUNT:'QUANTITATIVE_ANALYSIS',LOCATE:'LOCATION_ANALYSIS',QUANTITY:'QUANTITATIVE_ANALYSIS'})[op]||'GENERAL_ANALYSIS';}
  function evidenceSummary(result){
    if(!obj(result))return{available:false,facts:[],unknowns:['NO_RESULT']};
    const facts=[],unknowns=[];
    if(Array.isArray(result.facts))facts.push(...result.facts);
    if(Array.isArray(result.evidence))facts.push(...result.evidence);
    if(Array.isArray(result.unknowns))unknowns.push(...result.unknowns);
    if(Array.isArray(result.uncertainties))unknowns.push(...result.uncertainties);
    for(const k of ['value','count','status','score','runwayDays','stockpile','consumption','production','reserves','imports','exports','locations'])if(result[k]!==undefined&&result[k]!==null)facts.push({key:k,value:clone(result[k])});
    return{available:facts.length>0,facts,unknowns:[...new Set(unknowns.map(text).filter(Boolean))]};
  }
  function telemetry(context){
    const gs=obj(context?.gameState)?context.gameState:{};
    const inventory=clone(gs.inventory||gs.resources||gs.reserves||gs.stockpiles||{});
    const chokepoints=clone(gs.chokepoints||gs.logistics?.chokepoints||[]);
    const num=(...keys)=>{for(const k of keys){const x=Number(gs?.[k]);if(Number.isFinite(x))return x;}return undefined;};
    const t={source:'LIVE_GAME_STATE',inventory,chokepoints,processingUtilization:num('processingUtilization','processing_utilization')??num('processing','utilization'),bindingConstraintNode:gs.bindingConstraintNode||gs.binding_constraint_node||gs.processing?.bindingConstraintNode,dailyExtraction:num('dailyExtraction','daily_extraction','extraction'),dailyImports:num('dailyImports','daily_imports','imports'),dailyIndustrialDemand:num('dailyIndustrialDemand','industrialDemand','industrial_demand'),dailyCivilianDemand:num('dailyCivilianDemand','civilianDemand','civilian_demand'),processingCapacityBPD:num('processingCapacityBPD','processingCapacity','processing_capacity'),resilienceScore:num('resilienceScore','resilience','resilience_score')};
    t.unknownFields=Object.entries({inventory:Object.keys(t.inventory).length>0,chokepoints:t.chokepoints.length>0,processingUtilization:Number.isFinite(Number(t.processingUtilization)),dailyExtraction:Number.isFinite(Number(t.dailyExtraction)),dailyImports:Number.isFinite(Number(t.dailyImports)),dailyIndustrialDemand:Number.isFinite(Number(t.dailyIndustrialDemand)),dailyCivilianDemand:Number.isFinite(Number(t.dailyCivilianDemand)),processingCapacityBPD:Number.isFinite(Number(t.processingCapacityBPD)),resilienceScore:Number.isFinite(Number(t.resilienceScore))}).filter(([,v])=>!v).map(([k])=>k);
    return t;
  }
  function ensureStores(ctx){ctx.cognitiveStageArtifacts ||= {};ctx.stageContracts ||= {};ctx.stageErrors ||= [];return ctx;}
  function store(ctx,id,spec,status,output,error){ensureStores(ctx);const artifact={stage:id,name:spec.name,status,dependsOn:spec.depends||[],parallelEligible:!!spec.parallelEligible,executionGroup:spec.group,source:'RUNTIME_COGNITIVE_STAGE',output:clone(output)||{}};if(error)artifact.error=text(error.message||error);ctx.cognitiveStageArtifacts[id]=artifact;ctx.stageContracts[id]={stage:id,name:spec.name,status,dependsOn:spec.depends||[],parallelEligible:!!spec.parallelEligible,executionGroup:spec.group};if(error)ctx.stageErrors.push({stage:id,error:artifact.error});return ctx;}
  function callOriginal(ctx,os,original,id){try{return original&&typeof original.execute==='function'?original.execute(ctx,os):ctx;}catch(error){ctx.stageErrors ||= [];ctx.stageErrors.push({stage:id+'.ORIGINAL',error:text(error.message)});return ctx;}}
  function latest(ctx,id){return ctx.cognitiveStageArtifacts?.[id]?.output??null;}
  function compact(value,max=700){if(value==null)return null;let s='';try{s=typeof value==='string'?value:JSON.stringify(value);}catch(_){s=String(value);}return s.length>max?s.slice(0,max)+'…':s;}
  function runSpecialized(id,ctx){
    const spec=STAGE_SPECS[id];ensureStores(ctx);let out={};let status='READY';
    try{
      const t=ctx.telemetry||{},ev=ctx.liveEvidence||{},evidence=ev.facts||[];
      switch(id){
        case 21:ctx.evidenceLedger={facts:clone(evidence),unknowns:clone(ev.unknowns||[]),telemetry:clone(t),question:ctx.prompt,domain:ctx.domain,operation:ctx.semanticOperation||ctx.intent||null};out=ctx.evidenceLedger;break;
        case 22:{const sources=new Map();for(const f of evidence){const s=text(f?.source||f?.provenance||'UNKNOWN');sources.set(s,(sources.get(s)||0)+1);}ctx.provenanceAudit={sources:[...sources.entries()].map(([source,count])=>({source,count})),unknownCount:(ev.unknowns||[]).length,epistemicBoundary:'NO_UNSUPPORTED_WORLD_FACTS'};out=ctx.provenanceAudit;break;}
        case 23:{const required=['inventory','chokepoints','processingUtilization','dailyExtraction','dailyImports','dailyIndustrialDemand','dailyCivilianDemand','processingCapacityBPD','resilienceScore'];const present=required.filter(k=>k==='inventory'?Object.keys(t.inventory||{}).length>0:k==='chokepoints'?(t.chokepoints||[]).length>0:t[k]!=null);ctx.dataCompleteness={required,present,missing:required.filter(k=>!present.includes(k)),coverage:Number((present.length/required.length).toFixed(3))};out=ctx.dataCompleteness;break;}
        case 24:{const conflicts=[];for(const [k,v] of Object.entries(t.inventory||{})){const q=n(v?.quantity),b=n(v?.bufferDays);if(q!=null&&q<0)conflicts.push({field:`inventory.${k}.quantity`,type:'NEGATIVE_VALUE',value:q});if(b!=null&&b<0)conflicts.push({field:`inventory.${k}.bufferDays`,type:'NEGATIVE_VALUE',value:b});}const u=n(t.processingUtilization);if(u!=null&&(u<0||u>1.5))conflicts.push({field:'processingUtilization',type:'OUT_OF_RANGE',value:u});ctx.consistencyAudit={conflicts,count:conflicts.length,pass:conflicts.length===0};out=ctx.consistencyAudit;break;}
        case 25:{const b=ctx.selfModel?.activeBeliefs;ctx.beliefRevision={beforeCount:b?.size||0,lastCrisisResolution:b?.get?.('LAST_CRISIS_RESOLUTION')||null,confidenceAdjustment:ctx.uncertaintyIndex!=null?Number((-ctx.uncertaintyIndex*.10).toFixed(3)):0};out=ctx.beliefRevision;break;}
        case 26:{const h=Array.isArray(ctx.history)?ctx.history.slice(-24):[];ctx.temporalContext={historyCount:h.length,timeHorizon:ctx.timeHorizon||null,priorTurns:h.map(x=>({role:x.role,content:text(x.content).slice(0,500)})),currentTick:ctx.tick||null};out=ctx.temporalContext;break;}
        case 27:{const edges=[];for(const h of ctx.hypothesisAnalysis?.hypotheses||[])if(h)edges.push({from:h.id||'HYPOTHESIS',to:ctx.rootCause||h.name||'UNKNOWN',weight:range(h.posterior||h.probability)});for(const p of ctx.blastRadius?.propagationPath||[])edges.push({from:p.node||p.name||'UPSTREAM',to:p.next||p.downstream||'DOWNSTREAM',weight:range(p.impact||p.score)});ctx.causalLinkGraph={edges,rootCause:ctx.rootCause||null};out=ctx.causalLinkGraph;break;}
        case 28:{const path=Array.isArray(ctx.blastRadius?.propagationPath)?ctx.blastRadius.propagationPath.map(clone):(ctx.causalLinkGraph?.edges||[]);ctx.dependencyGraph={nodes:[...new Set(path.flatMap(x=>[x.from,x.to]).filter(Boolean))],edges:path,depth:path.length};out=ctx.dependencyGraph;break;}
        case 29:{const ex=n(t.dailyExtraction),im=n(t.dailyImports),ind=n(t.dailyIndustrialDemand),civ=n(t.dailyCivilianDemand);const supply=ex!=null&&im!=null?ex+im:null,totalDemand=ind!=null&&civ!=null?ind+civ:null;ctx.resourceBalance={domesticExtraction:ex,imports:im,supply,demand:totalDemand,surplusOrShortage:supply!=null&&totalDemand!=null?supply-totalDemand:null,importDependency:totalDemand!=null&&totalDemand>0&&im!=null?Number((im/totalDemand).toFixed(3)):null,complete:supply!=null&&totalDemand!=null};out=ctx.resourceBalance;if(!ctx.resourceBalance.complete)status='PARTIAL';break;}
        case 30:{const u=range(t.processingUtilization),cap=n(t.processingCapacityBPD);ctx.capacityConstraint={utilization:u,capacity:cap,bindingNode:t.bindingConstraintNode||null,nearSaturation:u!=null?u>=.90:null,overCapacity:u!=null?u>1:null};out=ctx.capacityConstraint;if(u==null&&cap==null)status='PARTIAL';break;}
        case 31:{const ch=Array.isArray(t.chokepoints)?t.chokepoints:[];const vuln=ch.length?Number((ch.reduce((s,x)=>s+(range(x?.vulnerability)||0),0)/ch.length).toFixed(3)):null;ctx.tradeExposure={imports:n(t.dailyImports),chokepointCount:ch.length,averageChokepointVulnerability:vuln,exposureScore:vuln};out=ctx.tradeExposure;if(!ch.length)status='PARTIAL';break;}
        case 32:{const rb=latest(ctx,29),cc=latest(ctx,30),te=latest(ctx,31),ca=latest(ctx,27);const demand=n(rb?.demand),shortage=n(rb?.surplusOrShortage),u=n(cc?.utilization),exposure=n(te?.exposureScore);const drivers={shortageRate:demand!=null&&shortage!=null?Math.max(0,-shortage)/Math.max(1,demand):null,processingUtilization:u,chokepointExposure:exposure,causalEdges:ca?.edges?.length||0};const complete=drivers.shortageRate!=null&&u!=null&&exposure!=null;const score=complete?Number(Math.min(1,Math.max(0,(drivers.shortageRate*.45)+(u*.25)+(exposure*.30))).toFixed(3)):null;ctx.strategicVulnerability={score,complete,drivers};out=ctx.strategicVulnerability;if(!complete)status='PARTIAL';break;}
        case 33:{const branches=Array.isArray(ctx.searchTreeResults)?ctx.searchTreeResults:[];const evidenceScore=ctx.dataCompleteness?.coverage??0;ctx.optionEvidenceAlignment=branches.map(b=>({optionId:b.optionId,utility:n(b.expectedUtility),resilience:n(b.resilienceDelta),evidenceCoverage:evidenceScore,alignment:n(b.expectedUtility)!=null?Number(Math.max(0,Math.min(1,n(b.expectedUtility)*.6+evidenceScore*.4)).toFixed(3)):null}));out={count:ctx.optionEvidenceAlignment.length,options:ctx.optionEvidenceAlignment,evidenceCoverage:evidenceScore};if(!branches.length)status='PARTIAL';break;}
        case 34:{ctx.counterfactualFrame={baseline:clone(ctx.telemetry),selectedBranch:clone(ctx.selectedBranch||null),alternatives:(ctx.searchTreeResults||[]).slice(0,5).map(x=>({optionId:x.optionId,expectedUtility:x.expectedUtility,resilienceDelta:x.resilienceDelta}))};out=ctx.counterfactualFrame;break;}
        case 35:{const dm=ctx.selfModel?.activeBeliefs;ctx.memoryConsolidation={beliefCount:dm?.size||0,episodeCount:ctx.deepMemoryEpisodeCount??null,trackedIssueCount:Array.isArray(ctx.watchlist)?ctx.watchlist.length:null,consolidationReady:true};out=ctx.memoryConsolidation;break;}
        case 36:{let audit=null;try{const C=global.OmegaCognitiveEngine?.DeepRedTeamCritic||global.OmegaSharedCognition?.DeepRedTeamCritic||global.DeepRedTeamCritic;if(C&&typeof C.auditDecision==='function'&&ctx.selectedBranch)audit=C.auditDecision(ctx.selectedBranch,ctx.searchTreeResults||[],ctx);}catch(_){ }ctx.redTeamRecheck={available:!!audit,passed:audit?.passed??null,worstCase:audit?.worstCaseScenario||null,mandatoryContingency:audit?.mandatoryContingency||null};out=ctx.redTeamRecheck;if(!audit)status='PARTIAL';break;}
        case 37:{const completeness=ctx.dataCompleteness?.coverage??0,consistency=ctx.consistencyAudit?.pass===false?0:ctx.consistencyAudit?.pass===true?1:.5,uncertainty=n(ctx.uncertaintyIndex),redTeam=ctx.redTeamRecheck?.passed===false?0.25:(ctx.redTeamRecheck?.passed===true?1:.5),knownUncertainty=uncertainty!=null?1-uncertainty:.5;const confidence=Number(Math.max(0,Math.min(1,(completeness*.30)+(consistency*.25)+(knownUncertainty*.25)+(redTeam*.20))).toFixed(3));ctx.decisionConfidence={score:confidence,evidenceCoverage:completeness,consistency,uncertaintyIndex:uncertainty,redTeam:ctx.redTeamRecheck?.passed??null};out=ctx.decisionConfidence;break;}
        case 38:{ctx.answerEvidencePacket={question:ctx.prompt,language:ctx.language||null,operation:ctx.semanticOperation||ctx.intent||null,rootCause:ctx.rootCause||null,facts:ctx.evidenceLedger?.facts||[],unknowns:ctx.evidenceLedger?.unknowns||[],calculations:{resourceBalance:latest(ctx,29),capacity:latest(ctx,30),tradeExposure:latest(ctx,31),strategicVulnerability:latest(ctx,32)},decision:clone(ctx.finalDecision||null),confidence:latest(ctx,37),provenance:latest(ctx,22),stageCoverage:Object.values(ctx.stageContracts||{}).filter(x=>x.status==='READY'||x.status==='PARTIAL').length};out=ctx.answerEvidencePacket;break;}
        case 39:{ctx.answerContract={evidenceOnly:true,separateFactInferenceUnknown:true,doNotInventMissingValues:true,sourcePacket:'STAGE_38',requiredGroundingFields:['facts','unknowns','calculations','decision','confidence','provenance'],answerStyle:'NATURAL_LANGUAGE_SYNTHESIS',forbiddenBehavior:['invent_missing_values','turn_unknown_into_zero','claim_unverified_causality']};out=ctx.answerContract;break;}
        case 40:{const artifacts=ctx.cognitiveStageArtifacts||{},stageIndex=Object.values(artifacts).sort((a,b)=>a.stage-b.stage).map(a=>({stage:a.stage,name:a.name,status:a.status,group:a.executionGroup,dependsOn:a.dependsOn,parallelEligible:a.parallelEligible,output:compact(a.output,700),error:a.error||null}));ctx.aiGroundingPacket={version:VERSION,stageCount:40,stageIndex,answerEvidence:clone(ctx.answerEvidencePacket),answerContract:clone(ctx.answerContract),retrievalOrder:[38,39,40],groundingBoundary:'RUNTIME_STAGE_ARTIFACTS_ONLY',fullArtifactStoreKey:'cognitiveStageArtifacts',maxInlineStageOutput:700};out=ctx.aiGroundingPacket;break;}
        default:status='UNAVAILABLE';
      }
      store(ctx,id,spec,status,out);return ctx;
    }catch(error){store(ctx,id,spec,'PARTIAL',out,error);return ctx;}
  }
  function engineInstance(){const e=global.OmegaCognitiveEngine||global.OmegaSharedCognition;if(e?.instance?.processCognitiveRequest)return e.instance;if(global.OmegaCognitiveOS?.processCognitiveRequest)return global.OmegaCognitiveOS;return null;}
  function execute40(question,category,evidence,context,operation){
    const engine=engineInstance();if(!engine)return{available:false,reason:'COGNITIVE_ENGINE_UNAVAILABLE',stagesRequested:40,stagesExecuted:0,full40:false};
    const stages=Array.isArray(engine.stages)?engine.stages:null;if(!stages||stages.length<40)return{available:false,reason:'COGNITIVE_40_STAGE_REGISTRY_UNAVAILABLE',stagesRequested:40,stagesExecuted:0,full40:false};
    const originals=stages.slice(20,40),first=stages[0],live=telemetry(context);
    const firstWrapper={id:first.id,name:first.name,execute(ctx,os){ctx.countryId=context?.countryId||context?.countryCode||ctx.countryId;ctx.targetCountry=context?.countryName||ctx.targetCountry;ctx.language=context?.language||ctx.language||'en';ctx.domain=text(context?.ministryId||category||ctx.domain).toUpperCase();ctx.semanticOperation=operation||ctx.semanticOperation||ctx.intent||null;ctx.telemetry=clone(live);ctx.liveEvidence=clone(evidence);ctx.history=clone(context?.history||[]);ctx.timeHorizon=context?.timeHorizon||'CURRENT';ctx.evidenceBoundary='RUNTIME_DETERMINISTIC_RESULT_ONLY';ctx.prohibitWorldStateInvention=true;ensureStores(ctx);return first.execute(ctx,os);}};
    stages[0]=firstWrapper;
    try{
      for(let i=0;i<20;i++){const id=21+i,spec=STAGE_SPECS[id],original=originals[i];stages[20+i]={id,name:spec.name,execute(ctx,os){callOriginal(ctx,os,original,id);return runSpecialized(id,ctx,os);}}}
      const raw=engine.processCognitiveRequest(text(question),category||'GENERAL_ANALYSIS',context?.countryId||context?.countryCode||'NATIONAL_SOVEREIGN',context?.countryName||'GLOBAL',text(context?.ministryId||category||'GENERAL').toUpperCase(),context?.persona||null);
      const executed=Array.isArray(raw?.stageLog)?raw.stageLog.map(x=>x.stage).filter(x=>x>=1&&x<=40):[];
      return{available:true,result:clone(raw),stagesRequested:40,stagesExecuted:executed.length,executedStages:executed,full40:executed.length===40&&executed.every((x,i)=>x===i+1),telemetryMode:'LIVE_GAME_STATE_AT_STAGE_1',unknownTelemetryFields:live.unknownFields,evidenceBoundary:'RUNTIME_DETERMINISTIC_RESULT_ONLY'};
    }catch(error){return{available:false,reason:'COGNITIVE_ENGINE_ERROR',error:text(error.message),stagesRequested:40,stagesExecuted:0,full40:false,telemetryMode:'LIVE_GAME_STATE_AT_STAGE_1',unknownTelemetryFields:live.unknownFields};}
    finally{stages[0]=first;for(let i=0;i<20;i++)stages[20+i]=originals[i];}
  }
  function extractText(raw){if(typeof raw==='string'&&raw.trim())return raw.trim();if(!obj(raw))return '';for(const k of ['answer','text','summary','recommendation','conclusion','analysis','briefing'])if(typeof raw[k]==='string'&&raw[k].trim())return raw[k].trim();return '';}
  function dispatch(question,parsed,result,common={}){
    const operation=operationOf(parsed,result),language=langOf(parsed,common),evidence=evidenceSummary(result);
    if(NON_COGNITIVE.has(operation))return{version:VERSION,operation,category:'CONVERSATION',contract:{version:VERSION,operation,language,deepReasoningRequested:false,evidence,answerBoundary:'INTERACTION_RUNTIME',status:'NOT_REQUIRED'},text:null,cognitive:null,used:false};
    const category=categoryOf(operation),cognitive=execute40(question,category,evidence,common,operation);
    const contract={version:VERSION,operation,category,language,deepReasoningRequested:DEEP_OPS.has(operation),full40StageExecutionRequested:true,status:cognitive.available?'EXECUTED':'UNAVAILABLE',stageCount:cognitive.stagesExecuted||0,full40StageExecution:cognitive.full40===true};
    return{version:VERSION,operation,contract,text:DEEP_OPS.has(operation)?extractText(cognitive.result):null,cognitive,used:cognitive.available,cognitiveTrace:{stagesRequested:40,stagesExecuted:cognitive.stagesExecuted||0,executedStages:cognitive.executedStages||[],full40:cognitive.full40===true,telemetryMode:cognitive.telemetryMode||null,unknownTelemetryFields:cognitive.unknownTelemetryFields||[],aiGroundingPacket:cognitive.result?.aiGroundingPacket||null}};
  }
  global.OmegaReasoningDispatcher=Object.freeze({VERSION,dispatch,operations:Object.freeze([...DEEP_OPS]),full40:true,stageSpecs:Object.freeze(clone(STAGE_SPECS)),parallelGroups:Object.freeze({FOUNDATION:[21,22],AUDIT:[23,24],ANALYSIS:[26,27,29,30,31],SYNTHESIS:[32],DECISION:[33,34,36,37],HANDOFF:[38,39,40]})});
})(typeof window!=='undefined'?window:globalThis);
