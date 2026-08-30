/* OMEGA MINISTER BEHAVIOR ENGINE v1.1.0 */
(function(global){'use strict';
  const VERSION='1.1.0';
  const registry=()=>global.OmegaMinisterStateRegistry,cap=()=>global.OmegaMinisterCapability,cfg=()=>registry()?.getConfig?.()||{};
  const clamp=(v,a=0,b=100)=>Number.isFinite(Number(v))?Math.max(a,Math.min(b,Number(v))):a,num=v=>Number.isFinite(Number(v))?Number(v):0;
  const roleConfig=ministryId=>{const n=String(ministryId||'').toLowerCase();return (cfg().roles||[]).find(r=>(r.match||[]).some(x=>n.includes(String(x).toLowerCase())))||(cfg().roles||[]).find(r=>!(r.match||[]).length)||{};};
  const operationFor=ministryId=>(roleConfig(ministryId).operations||[])[0]||'EXECUTION';
  const personality=profile=>{const s=profile?.baseStats||{},e=profile?.efficiencyProfile||{};return {riskTolerance:clamp((num(s.aggression)+num(s.strategic))/2),discipline:clamp(num(s.discipline)),empathy:clamp(num(s.empathy)),strategic:clamp(num(s.strategic)),decisionSpeed:clamp(num(e.decision_speed)),accuracy:clamp(num(e.accuracy)),crisisHandling:clamp(num(e.crisis_handling)),corruption:clamp(num(s.corruption))};};
  const ideologyPreference=(profile,action)=>{const rules=cfg().ideologyModifiers||{};const type=String(profile?.ideology?.type||'').toLowerCase();const map=rules[type]||{};return clamp(num(map[action]??0),-100,100);};
  function evaluateDirective(ministerId,directive,context={}){
    const r=registry()?.getMinister(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');
    if(r.status!=='ACTIVE')throw new Error('MINISTER_NOT_ACTIVE');
    const p=personality(r.staticProfile),policy=cfg().directivePolicy||{},w=policy.weights||{};
    const feasibility=clamp(context.feasibility??100),risk=clamp(context.risk??50),authority=clamp(context.authority??100),information=clamp((context.informationQuality??1)*100),operation=context.operation||operationFor(r.runtimeState.ministryId);
    const effective=cap()?.evaluate?.(r.staticProfile,operation,{workload:r.runtimeState.workload,stress:r.runtimeState.stress,experience:num(r.learningState.domainExperience?.[String(operation).toLowerCase()]),informationQuality:clamp(information/100,.5,1),taskFit:clamp(context.taskFit??1,.5,1.25),timePressureFactor:clamp(context.timePressureFactor??1,.6,1.05)})||{effectiveCapability:0};
    const capabilityScore=clamp(effective.effectiveCapability), riskScore=100-risk;
    const actionKey=String(context.action||directive||'').toLowerCase().replace(/\s+/g,'_');
    const ideologyFit=clamp(50+ideologyPreference(r.staticProfile,actionKey));
    const personalityFit=clamp(50+(p.riskTolerance-risk)*.4+p.discipline*.1);
    const score=clamp(feasibility*(w.feasibility??.25)+riskScore*(w.risk??.2)+clamp(authority)*(w.authority??.15)+capabilityScore*(w.capability??.2)+information*(w.information??.1)+((personalityFit+ideologyFit)/2)*(w.personalityFit??.1));
    const threshold=Number(policy.refusalThreshold??.3)*100,decision=score<threshold?'REFUSE_OR_ESCALATE':score<70?'DEFER_OR_REQUEST_MORE_INFORMATION':'EXECUTE_OR_RECOMMEND';
    return Object.freeze({ministerId,directive:String(directive||''),operation,decision,executable:decision!=='REFUSE_OR_ESCALATE',score:Number(score.toFixed(2)),components:{feasibility,risk:riskScore,authority,capability:capabilityScore,information,personalityFit,ideologyFit},effectiveCapability:effective});
  }
  function createDecisionContract(ministerId,directive,context={}){const evaluation=evaluateDirective(ministerId,directive,context);return Object.freeze({contractVersion:'1.0.0',decisionId:`DECISION-${Date.now()}-${String(ministerId)}`,ministerId,directive:String(directive||''),countryId:registry().getMinister(ministerId).runtimeState.countryId,ministryId:registry().getMinister(ministerId).runtimeState.ministryId,decision:evaluation.decision,executable:evaluation.executable,evaluation,playerDirective:context.playerDirective===true,executionAuthority:'PART_15_EXECUTION_ENGINE',worldMutationByMinister:false});}
  function rankOptions(ministerId,options,context={}){return (Array.isArray(options)?options:[]).map((o,i)=>{const evaluation=evaluateDirective(ministerId,o.name||o.id||`OPTION_${i+1}`,Object.assign({},context,o));return {index:i,option:o,evaluation}}).sort((a,b)=>b.evaluation.score-a.evaluation.score);}
  function recordOutcome(ministerId,decisionId,outcome,lesson,domain){registry().recordDecision(ministerId,{decisionId,outcome,actualOutcome:outcome});if(lesson)registry().storeLesson(ministerId,{text:String(lesson),domain:String(domain||'general'),confidence:outcome==='SUCCESS'?.85:.65},outcome);return registry().getMinister(ministerId);}
  function train(ministerId,domain,hours=1,quality=1){const r=registry()?.getMinister(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');const h=Math.max(0,num(hours)),q=clamp(quality,0,1),current=num(r.learningState.domainExperience?.[domain]);const gain=(cfg().learning?.trainingFactor??1.35)*h*q/(1+current/(cfg().learning?.diminishingScale??12));const next=clamp(current+gain,0,cfg().learning?.maxDomainExperience??1000);registry().updateLearningState(ministerId,{domainExperience:{...r.learningState.domainExperience,[domain]:next},trainingHours:num(r.learningState.trainingHours)+h,lastLearningAt:Date.now(),skillEvolution:{...r.learningState.skillEvolution,[domain]:next}});return registry().getMinister(ministerId);}
  function debug(ministerId){const r=registry()?.getMinister(ministerId);if(!r)return null;return {identity:r.staticProfile,runtime:r.runtimeState,learning:r.learningState,memory:r.memorySummary,effectiveCapability:r.effectiveCapability,roleConfig:roleConfig(r.runtimeState.ministryId),personality:personality(r.staticProfile),status:r.status};}
  global.OmegaMinisterBehavior={VERSION,evaluateDirective,createDecisionContract,rankOptions,recordOutcome,train,debug,roleConfig,operationFor,personality};
})(typeof window!=='undefined'?window:globalThis);
