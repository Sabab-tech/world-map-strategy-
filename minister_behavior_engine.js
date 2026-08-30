/* OMEGA MINISTER BEHAVIOR ENGINE v1.0.0 */
(function(global){'use strict';
  const VERSION='1.0.0';
  const registry=()=>global.OmegaMinisterStateRegistry;
  const cap=()=>global.OmegaMinisterCapability;
  const clamp=(v,a=0,b=100)=>Number.isFinite(Number(v))?Math.max(a,Math.min(b,Number(v))):a;
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const cfg=()=>registry()?.getConfig?.()||{};
  const roleConfig=ministryId=>{const n=String(ministryId||'').toLowerCase();return (cfg().roles||[]).find(r=>(r.match||[]).some(x=>n.includes(String(x).toLowerCase())))||(cfg().roles||[]).find(r=>!(r.match||[]).length)||{};};
  const operationFor=ministryId=>(roleConfig(ministryId).operations||[])[0]||'EXECUTION';
  const personality=profile=>{const s=profile?.baseStats||{};const e=profile?.efficiencyProfile||{};return {riskTolerance:clamp((num(s.aggression)+num(s.strategic))/2),discipline:clamp(num(s.discipline)),empathy:clamp(num(s.empathy)),strategic:clamp(num(s.strategic)),decisionSpeed:clamp(num(e.decision_speed)),accuracy:clamp(num(e.accuracy)),crisisHandling:clamp(num(e.crisis_handling)),corruption:clamp(num(s.corruption))};};
  function evaluateDirective(ministerId,directive,context={}){
    const r=registry()?.getMinister(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');
    const p=personality(r.staticProfile),policy=cfg().directivePolicy||{},w=policy.weights||{};
    const feasibility=clamp(context.feasibility??100),risk=clamp(context.risk??50),authority=clamp(context.authority??100),information=clamp((context.informationQuality??1)*100),requiredCapability=clamp(context.requiredCapability??50),operation=context.operation||operationFor(r.runtimeState.ministryId);
    const effective=cap()?.evaluate?.(r.staticProfile,operation,{workload:r.runtimeState.workload,stress:r.runtimeState.stress,experience:num(r.learningState.domainExperience?.[String(operation).toLowerCase()]),informationQuality:clamp(information/100,.5,1),taskFit:clamp(context.taskFit??1,.5,1.25),timePressureFactor:clamp(context.timePressureFactor??1,.6,1.05)})||{effectiveCapability:requiredCapability};
    const capabilityScore=clamp(effective.effectiveCapability), riskTolerance=clamp(p.riskTolerance), personalityFit=clamp(50+(riskTolerance-risk)*.4+p.discipline*.1), authorityFit=clamp(authority),riskScore=100-risk;
    const score=clamp((feasibility*(w.feasibility??.25))+(riskScore*(w.risk??.2))+(authorityFit*(w.authority??.15))+(capabilityScore*(w.capability??.2))+(information*(w.information??.1))+(personalityFit*(w.personalityFit??.1)));
    const executable=score>=Number(policy.refusalThreshold??.3)*100 && feasibility>0 && authority>0 && capabilityScore>0;
    const reason=!executable?'REFUSE_OR_ESCALATE':score>=70?'EXECUTE_OR_RECOMMEND':'DEFER_OR_REQUEST_MORE_INFORMATION';
    const result=Object.freeze({ministerId,directive:String(directive||''),operation,score:Number(score.toFixed(2)),executable,decision:reason,components:{feasibility,risk:riskScore,authority:authorityFit,capability:capabilityScore,information,personalityFit},effectiveCapability:effective});
    registry().recordDecision(ministerId,{decisionId:`DIRECTIVE-${Date.now()}`,problem:String(directive||''),options:[{directive,score}],selectedOption:executable?directive:null,expectedOutcome:context.expectedOutcome||null,actualOutcome:null,decisionType:'MINISTER_DIRECTIVE_EVALUATION'});
    return result;
  }
  function rankOptions(ministerId,options,context={}){return (Array.isArray(options)?options:[]).map((o,i)=>({index:i,...evaluateDirective(ministerId,o.name||o.id||`OPTION_${i+1}`,Object.assign({},context,o))})).sort((a,b)=>b.score-a.score);}
  function recordOutcome(ministerId,decisionId,outcome,lesson,domain){const r=registry()?.getMinister(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');const d={decisionId,outcome,actualOutcome:outcome};registry().recordDecision(ministerId,d);if(lesson)registry().storeLesson(ministerId,{text:String(lesson),domain:String(domain||'general'),confidence:outcome==='SUCCESS'?.85:.65},outcome);return registry().getMinister(ministerId);}
  function train(ministerId,domain,hours=1,quality=1){const r=registry()?.getMinister(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');const h=Math.max(0,num(hours)),q=clamp(quality,0,1),current=num(r.learningState.domainExperience?.[domain]);const gain=(cfg().learning?.trainingFactor??1.35)*h*q/(1+current/(cfg().learning?.diminishingScale??12));const next=clamp(current+gain,0,cfg().learning?.maxDomainExperience??1000);registry().updateLearningState(ministerId,{domainExperience:{...r.learningState.domainExperience,[domain]:next},trainingHours:num(r.learningState.trainingHours)+h,lastLearningAt:Date.now()});return registry().getMinister(ministerId);}
  function debug(ministerId){const r=registry()?.getMinister(ministerId);if(!r)return null;return {identity:r.staticProfile,runtime:r.runtimeState,learning:r.learningState,memory:r.memorySummary,effectiveCapability:r.effectiveCapability,roleConfig:roleConfig(r.runtimeState.ministryId),status:r.status};}
  global.OmegaMinisterBehavior={VERSION,evaluateDirective,rankOptions,recordOutcome,train,debug,roleConfig,operationFor,personality};
})(typeof window!=='undefined'?window:globalThis);
