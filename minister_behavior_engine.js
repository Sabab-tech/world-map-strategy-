/* OMEGA MINISTER BEHAVIOR ENGINE v1.3.0
 * Uses the canonical minister dossier as a gameplay input: career fit, age-stage
 * modifiers, work style, stress resilience, decision quality, and training gain.
 * Identity and outcomes remain data-driven; world changes stay with the execution engine.
 */
(function(global){'use strict';
  const VERSION='1.3.0';
  const registry=()=>global.OmegaMinisterStateRegistry;
  const cap=()=>global.OmegaMinisterCapability;
  const cfg=()=>registry()?.getConfig?.()||{};
  const clamp=(v,a=0,b=100)=>Number.isFinite(Number(v))?Math.max(a,Math.min(b,Number(v))):a;
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const finite=v=>v!==null&&v!==''&&Number.isFinite(Number(v));
  const DEFAULT_PROFILE_EFFECTS={
    ageBands:[
      {min:18,max:29,label:'early-career',decisionSpeed:1.03,judgment:0.96,crisisHandling:0.97,trainingRate:1.22,fatigueRate:1.03},
      {min:30,max:39,label:'developing-experience',decisionSpeed:1.02,judgment:0.99,crisisHandling:0.99,trainingRate:1.12,fatigueRate:1.00},
      {min:40,max:54,label:'experienced',decisionSpeed:1.00,judgment:1.05,crisisHandling:1.04,trainingRate:1.00,fatigueRate:1.00},
      {min:55,max:64,label:'senior-experience',decisionSpeed:0.97,judgment:1.06,crisisHandling:1.03,trainingRate:0.90,fatigueRate:1.05},
      {min:65,max:100,label:'late-career',decisionSpeed:0.94,judgment:1.03,crisisHandling:1.00,trainingRate:0.82,fatigueRate:1.10}
    ],
    unknownAge:{label:'age-unrecorded',decisionSpeed:1,judgment:1,crisisHandling:1,trainingRate:1,fatigueRate:1},
    operationAgeFactor:{CRISIS:'crisisHandling',SECURITY:'crisisHandling',AUDIT:'judgment',FISCAL:'judgment',RESEARCH:'judgment',NEGOTIATION:'judgment',DIPLOMACY:'judgment',EXECUTION:'decisionSpeed',INDUSTRY:'decisionSpeed'},
    operationKeywords:{
      AUDIT:['audit','auditor','accounting','accountant','compliance','forensic'],
      CRISIS:['crisis','emergency','disaster','mitigation','rescue'],
      EXECUTION:['operations','executive','administration','management','commissioner'],
      NEGOTIATION:['negotiator','negotiation','ambassador','treaty','trade','diplomat'],
      SECURITY:['security','military','defense','defence','intelligence','police','counterterrorism','covert'],
      FISCAL:['finance','treasury','bank','fiscal','imf','economics','budget','tax','investment','accounting'],
      INDUSTRY:['energy','infrastructure','engineering','industrial','industry','mining','production','agriculture'],
      DIPLOMACY:['ambassador','foreign','diplomacy','treaty','international','relations','trade'],
      RESEARCH:['research','science','scientist','technology','scholar','academic','education','medical']
    },
    stressResistanceWeights:{crisisHandling:0.40,discipline:0.25,empathy:0.15,strategic:0.10,explicitComposure:0.10,minMultiplier:0.78,maxMultiplier:1.22},
    careerFitBonus:0.08,
    training:{stressPenaltyMax:0.20,workloadPenaltyMax:0.15,fatiguePenaltyMax:0.10,minCapacityFactor:0.55}
  };
  const GENERIC_WORDS=new Set(['the','and','with','from','former','retired','senior','junior','chief','director','general','specialist','advisor','adviser','consultant','manager','officer','professional','career','policy','service','ministry','government','department','affairs','international']);
  function profileConfig(){
    const source=cfg().profileEffects||{};
    return {
      ...DEFAULT_PROFILE_EFFECTS,...source,
      ageBands:Array.isArray(source.ageBands)&&source.ageBands.length?source.ageBands:DEFAULT_PROFILE_EFFECTS.ageBands,
      unknownAge:{...DEFAULT_PROFILE_EFFECTS.unknownAge,...(source.unknownAge||{})},
      operationAgeFactor:{...DEFAULT_PROFILE_EFFECTS.operationAgeFactor,...(source.operationAgeFactor||{})},
      operationKeywords:{...DEFAULT_PROFILE_EFFECTS.operationKeywords,...(source.operationKeywords||{})},
      stressResistanceWeights:{...DEFAULT_PROFILE_EFFECTS.stressResistanceWeights,...(source.stressResistanceWeights||{})},
      training:{...DEFAULT_PROFILE_EFFECTS.training,...(source.training||{})},
      performance:{fatiguePenaltyMax:0.20,...(source.performance||{})}
    };
  }
  const roleConfig=ministryId=>{const n=String(ministryId||'').toLowerCase();return (cfg().roles||[]).find(r=>(r.match||[]).some(x=>n.includes(String(x).toLowerCase())))||(cfg().roles||[]).find(r=>!(r.match||[]).length)||{};};
  const operationFor=ministryId=>(roleConfig(ministryId).operations||[])[0]||'EXECUTION';
  const sourceStats=profile=>profile?.baseStats||profile?.stats||{};
  const sourceEfficiency=profile=>profile?.efficiencyProfile||profile?.efficiency||{};
  const trait=(profile,keys,fallback=0)=>{
    const stats=sourceStats(profile),eff=sourceEfficiency(profile),personality=profile?.personalityProfile||profile?.personality||{};
    for(const key of keys){const value=personality[key]??stats[key]??eff[key];if(finite(value)){const n=Number(value);return clamp(n>0&&n<=1?n*100:n,0,100);}}
    return fallback;
  };
  const personality=profile=>{const s=sourceStats(profile),e=sourceEfficiency(profile);return {riskTolerance:clamp((num(s.aggression)+num(s.strategic))/2),discipline:clamp(num(s.discipline)),empathy:clamp(num(s.empathy)),strategic:clamp(num(s.strategic)),decisionSpeed:clamp(num(e.decision_speed)),accuracy:clamp(num(e.accuracy)),crisisHandling:clamp(num(e.crisis_handling)),corruption:clamp(num(s.corruption))};};
  function ageBandFor(profile){
    const ageValue=profile?.baseAge??profile?.age;
    if(!finite(ageValue)||Number(ageValue)<=0)return {age:null,...profileConfig().unknownAge};
    const age=Number(ageValue),bands=profileConfig().ageBands;
    const band=bands.find(item=>age>=Number(item.min)&&age<=Number(item.max));
    if(band)return {age,...band};
    const nearest=[...bands].sort((a,b)=>Math.min(Math.abs(age-Number(a.min)),Math.abs(age-Number(a.max)))-Math.min(Math.abs(age-Number(b.min)),Math.abs(age-Number(b.max))))[0];
    return {age,...(nearest||profileConfig().unknownAge)};
  }
  function tokenSet(value){
    const text=String(value??'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[^a-z0-9]+/g,' ');
    return new Set(text.split(/\s+/).filter(token=>token.length>2&&!/^\d+$/.test(token)&&!GENERIC_WORDS.has(token)));
  }
  function flattenText(value,output=[],depth=0){
    if(value==null||depth>3)return output;
    if(typeof value==='string'||typeof value==='number'){output.push(String(value));return output;}
    if(Array.isArray(value)){for(const item of value)flattenText(item,output,depth+1);return output;}
    if(typeof value==='object'){for(const [key,item] of Object.entries(value)){output.push(key);flattenText(item,output,depth+1);} }
    return output;
  }
  function careerFitFor(profile,operation,context={}){
    const pc=profileConfig(),sourceText=flattenText([
      profile?.background,profile?.careerBackground,profile?.career_background,profile?.education,
      profile?.specialties,profile?.specialisms,profile?.expertise,profile?.skills,profile?.domains
    ]).join(' ');
    const candidateTokens=tokenSet(sourceText),targets=new Set([
      ...tokenSet(context.ministryId||profile?.ministryId||profile?.ministryCategory||profile?.__category),
      ...tokenSet(context.domain||''),...(pc.operationKeywords[String(operation||'EXECUTION').toUpperCase()]||[]).flatMap(word=>[...tokenSet(word)])
    ]);
    const matched=[...candidateTokens].filter(word=>targets.has(word));
    const bonus=matched.length?clamp(pc.careerFitBonus,0,0.20):0;
    const explicitFit=finite(context.taskFit)?clamp(context.taskFit,0.5,1.25):1;
    return {matchedKeywords:matched.slice(0,8),matched:matched.length>0,bonus,multiplier:clamp(explicitFit*(1+bonus),0.5,1.25)};
  }
  function analyzeProfile(profile,operation='EXECUTION',context={}){
    const pc=profileConfig(),op=String(operation||'EXECUTION').toUpperCase(),age=ageBandFor(profile);
    const s=sourceStats(profile),e=sourceEfficiency(profile),p=profile?.personalityProfile||profile?.personality||{};
    const discipline=trait(profile,['discipline']),empathy=trait(profile,['empathy']),strategic=trait(profile,['strategic']);
    const crisisHandling=trait(profile,['crisis_handling','crisisHandling'],num(e.crisis_handling)||50);
    const accuracy=trait(profile,['accuracy'],num(e.accuracy)||50),decisionSpeed=trait(profile,['decision_speed','decisionSpeed'],num(e.decision_speed)||50);
    const aggression=trait(profile,['aggression']),corruption=trait(profile,['corruption']);
    const explicitComposure=trait(profile,['stressTolerance','stress_tolerance','composure','resilience','emotionalStability','emotional_stability'],NaN);
    const weights=pc.stressResistanceWeights;
    const resilienceScore=explicitComposure>=0&&finite(p.stressTolerance??p.stress_tolerance??p.composure??p.resilience??p.emotionalStability??p.emotional_stability)
      ? explicitComposure
      : clamp(crisisHandling*(weights.crisisHandling??0.4)+discipline*(weights.discipline??0.25)+empathy*(weights.empathy??0.15)+strategic*(weights.strategic??0.1)+(100-corruption)*(weights.explicitComposure??0.1),0,100);
    const stressMultiplier=clamp(1-((resilienceScore-50)/250),weights.minMultiplier??0.78,weights.maxMultiplier??1.22);
    const ageMetric=pc.operationAgeFactor[op]||'decisionSpeed';
    const ageCapabilityMultiplier=clamp(num(age[ageMetric])||1,0.85,1.15);
    const careerFit=careerFitFor(profile,op,{...context,taskFit:context.taskFit,ministryId:context.ministryId||profile?.ministryId||profile?.ministryCategory||profile?.__category});
    const styles=[];
    if(discipline>=72&&accuracy>=75)styles.push('methodical');
    if(strategic>=80)styles.push('strategic_planner');
    if(empathy>=70)styles.push('collaborative');
    if(crisisHandling>=82)styles.push('crisis_steady');
    if(decisionSpeed>=85)styles.push('rapid_executor');
    if(aggression>=70)styles.push('high_risk_tolerance');
    if(corruption>=25)styles.push('integrity_risk');
    if(!styles.length)styles.push('balanced_operator');
    const learningAgility=trait(profile,['learningAgility','learning_agility'],50);
    const learningAgilityMultiplier=clamp(0.8+learningAgility/250,0.8,1.2);
    return Object.freeze({
      operation:op,
      age:{years:age.age,band:age.label,decisionSpeed:age.decisionSpeed,judgment:age.judgment,crisisHandling:age.crisisHandling,trainingRate:age.trainingRate,fatigueRate:age.fatigueRate,capabilityMultiplier:ageCapabilityMultiplier},
      workStyle:styles,
      stressResilience:{score:Number(resilienceScore.toFixed(2)),stressMultiplier:Number(stressMultiplier.toFixed(3)),handlingLabel:resilienceScore>=75?'high':resilienceScore>=50?'moderate':'low'},
      careerFit:{matched:careerFit.matched,matchedKeywords:careerFit.matchedKeywords,bonus:Number(careerFit.bonus.toFixed(3)),multiplier:Number(careerFit.multiplier.toFixed(3))},
      training:{ageMultiplier:clamp(num(age.trainingRate)||1,0.5,1.5),learningAgilityMultiplier:Number(learningAgilityMultiplier.toFixed(3)),fatigueRate:clamp(num(age.fatigueRate)||1,0.5,1.8)},
      traits:{discipline,empathy,strategic,crisisHandling,accuracy,decisionSpeed,aggression,corruption}
    });
  }
  const ideologyPreference=(profile,action)=>{const rules=cfg().ideologyModifiers||{};const type=String(profile?.ideology?.type||'').toLowerCase();return clamp(num((rules[type]||{})[action]??0),-100,100);};
  function evaluateDirective(ministerId,directive,context={}){
    const r=registry()?.getMinister(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');if(r.status!=='ACTIVE')throw new Error('MINISTER_NOT_ACTIVE');
    const profile=r.staticProfile,p=personality(profile),policy=cfg().directivePolicy||{},w=policy.weights||{},operation=String(context.operation||operationFor(r.runtimeState.ministryId)).toUpperCase();
    const effects=analyzeProfile(profile,operation,{...context,ministryId:context.ministryId||r.runtimeState.ministryId,domain:context.domain||r.runtimeState.ministryId});
    const rawStress=clamp(r.runtimeState.stress,0,100),effectiveStress=clamp(rawStress*effects.stressResilience.stressMultiplier,0,100);
    const information=clamp((context.informationQuality??1)*100),careerAdjustedFit=effects.careerFit.multiplier;
    const effective=cap()?.evaluate?.(profile,operation,{
      workload:r.runtimeState.workload,stress:effectiveStress,
      experience:num(r.learningState.domainExperience?.[String(context.domain||operation).toLowerCase()]),
      informationQuality:clamp(information/100,.5,1),
      taskFit:careerAdjustedFit,
      timePressureFactor:clamp(context.timePressureFactor??1,.6,1.05)
    })||{effectiveCapability:0,baseCapability:0};
    const fatigue=clamp(r.runtimeState.fatigue,0,100),fatiguePenaltyMax=clamp(profileConfig().performance.fatiguePenaltyMax??0.20,0,0.50),fatigueFactor=1-(fatigue/100)*fatiguePenaltyMax;
    const capabilityScore=clamp(num(effective.effectiveCapability)*effects.age.capabilityMultiplier*fatigueFactor),risk=clamp(context.risk??50),feasibility=clamp(context.feasibility??100),authority=clamp(context.authority??100),riskScore=100-risk;
    const actionKey=String(context.action||directive||'').toLowerCase().replace(/\s+/g,'_');
    const ideologyFit=clamp(50+ideologyPreference(profile,actionKey)),personalityFit=clamp(50+(p.riskTolerance-risk)*.4+p.discipline*.1);
    const score=clamp(feasibility*(w.feasibility??.25)+riskScore*(w.risk??.2)+authority*(w.authority??.15)+capabilityScore*(w.capability??.2)+information*(w.information??.1)+((personalityFit+ideologyFit)/2)*(w.personalityFit??.1));
    const threshold=Number(policy.refusalThreshold??.3)*100,decision=score<threshold?'REFUSE_OR_ESCALATE':score<70?'DEFER_OR_REQUEST_MORE_INFORMATION':'EXECUTE_OR_RECOMMEND';
    return Object.freeze({ministerId,directive:String(directive||''),operation,decision,executable:decision!=='REFUSE_OR_ESCALATE',score:Number(score.toFixed(2)),components:{feasibility,risk:riskScore,authority,capability:Number(capabilityScore.toFixed(2)),information,personalityFit,ideologyFit,rawStress:Number(rawStress.toFixed(2)),effectiveStress:Number(effectiveStress.toFixed(2)),stressResilience:effects.stressResilience.score,ageCapabilityMultiplier:effects.age.capabilityMultiplier,careerFitMultiplier:effects.careerFit.multiplier,fatigue:Number(fatigue.toFixed(2)),fatigueFactor:Number(fatigueFactor.toFixed(3))},effectiveCapability:{...effective,rawEffectiveCapability:effective.effectiveCapability,effectiveCapability:Number(capabilityScore.toFixed(2)),profileEffects:effects}});
  }
  function createDecisionContract(ministerId,directive,context={}){const evaluation=evaluateDirective(ministerId,directive,context),r=registry().getMinister(ministerId);return Object.freeze({contractVersion:'1.2.0',decisionId:`DECISION-${Date.now()}-${String(ministerId)}`,ministerId,directive:String(directive||''),countryId:r.runtimeState.countryId,ministryId:r.runtimeState.ministryId,decision:evaluation.decision,executable:evaluation.executable,evaluation,playerDirective:context.playerDirective===true,executionAuthority:'PART_15_EXECUTION_ENGINE',worldMutationByMinister:false});}
  function rankOptions(ministerId,options,context={}){return (Array.isArray(options)?options:[]).map((o,i)=>{const evaluation=evaluateDirective(ministerId,o.name||o.id||`OPTION_${i+1}`,Object.assign({},context,o));return {index:i,option:o,evaluation}}).sort((a,b)=>b.evaluation.score-a.evaluation.score);}
  function recordOutcome(ministerId,decisionId,outcome,lesson,domain){const r=registry().getMinister(ministerId);registry().recordDecision(ministerId,{decisionId,outcome,actualOutcome:outcome});const successes=num(r.learningState.strategyEffectiveness?.[domain]?.successes),failures=num(r.learningState.strategyEffectiveness?.[domain]?.failures);const next={...(r.learningState.strategyEffectiveness||{}),[domain]:{successes:successes+(outcome==='SUCCESS'?1:0),failures:failures+(outcome==='FAILURE'?1:0),rate:(successes+(outcome==='SUCCESS'?1:0))/Math.max(1,successes+failures+1)}};registry().updateLearningState(ministerId,{strategyEffectiveness:next});if(lesson)registry().storeLesson(ministerId,{text:String(lesson),domain:String(domain||'general'),confidence:outcome==='SUCCESS'?.85:.65},outcome);return registry().getMinister(ministerId);}
  function recordForecast(ministerId,forecast,actual,domain){const r=registry().getMinister(ministerId),p=clamp(num(forecast)/100,0,1),a=clamp(num(actual)/100,0,1),brier=(p-a)*(p-a),prev=r.learningState.forecastCalibration||{brier:[],bias:0},arr=[...(prev.brier||[]),brier].slice(-250),mean=arr.reduce((s,x)=>s+x,0)/Math.max(1,arr.length),bias=p-a;registry().updateLearningState(ministerId,{forecastCalibration:{brier:arr,brierScore:Number(mean.toFixed(6)),bias:Number(bias.toFixed(6)),domain:domain||'general'}});const newR=registry().getMinister(ministerId);const confidence=clamp(50+(0.5-mean)*100);registry().updateRuntimeState(ministerId,{confidence},'FORECAST_CALIBRATION');return newR;}
  function train(ministerId,domain,hours=1,quality=1){
    const r=registry()?.getMinister(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');
    const targetDomain=String(domain||'general'),h=Math.max(0,num(hours)),q=clamp(quality,0,1),current=num(r.learningState.domainExperience?.[targetDomain]);
    const effects=analyzeProfile(r.staticProfile,'TRAINING',{domain:targetDomain,ministryId:r.runtimeState.ministryId});
    const training=profileConfig().training,stress=clamp(r.runtimeState.stress,0,100),workload=clamp(r.runtimeState.workload,0,100),fatigue=clamp(r.runtimeState.fatigue,0,100);
    const capacity=clamp(1-stress/100*(training.stressPenaltyMax??0.20)-workload/100*(training.workloadPenaltyMax??0.15)-fatigue/100*(training.fatiguePenaltyMax??0.10),training.minCapacityFactor??0.55,1);
    const rate=effects.training.ageMultiplier*effects.training.learningAgilityMultiplier*capacity;
    const gain=(cfg().learning?.trainingFactor??1.35)*h*q*rate/(1+current/(cfg().learning?.diminishingScale??12));
    const next=clamp(current+gain,0,cfg().learning?.maxDomainExperience??1000);
    registry().updateLearningState(ministerId,{domainExperience:{...r.learningState.domainExperience,[targetDomain]:next},trainingHours:num(r.learningState.trainingHours)+h,lastLearningAt:Date.now(),skillEvolution:{...r.learningState.skillEvolution,[targetDomain]:next},lastTraining:{domain:targetDomain,hours:h,quality:q,gain:Number((next-current).toFixed(4)),ageMultiplier:effects.training.ageMultiplier,learningAgilityMultiplier:effects.training.learningAgilityMultiplier,capacityFactor:Number(capacity.toFixed(3))}});
    return registry().getMinister(ministerId);
  }
  function scheduleTraining(ministerId,domain,hours=24,quality=1){
    const r=registry()?.getMinister(ministerId);
    if(!r)throw new Error('MINISTER_NOT_REGISTERED');
    if(r.status!=='ACTIVE')throw new Error('MINISTER_NOT_ACTIVE');
    if(r.runtimeState.trainingSession?.status==='IN_PROGRESS')throw new Error('MINISTER_TRAINING_ALREADY_IN_PROGRESS');
    const targetDomain=String(domain||r.runtimeState.ministryId||'general'),durationHours=Math.max(1,Math.min(720,num(hours)||24)),q=clamp(quality,0,1);
    const effects=analyzeProfile(r.staticProfile,'TRAINING',{domain:targetDomain,ministryId:r.runtimeState.ministryId});
    const session={status:'IN_PROGRESS',domain:targetDomain,durationHours,remainingHours:durationHours,progress:0,quality:q,startedAtGameTime:global.Game?.gameTime??0,startedAt:Date.now(),ageTrainingMultiplier:effects.training.ageMultiplier,learningAgilityMultiplier:effects.training.learningAgilityMultiplier};
    registry().updateRuntimeState(ministerId,{trainingSession:session},'TRAINING_STARTED');
    try{global.dispatchEvent?.(new global.CustomEvent('MINISTER_TRAINING_STARTED',{detail:{ministerId,trainingSession:session}}));}catch(_){}
    return registry().getMinister(ministerId);
  }
  function advanceTraining(detail={}){
    const deltaHours=Math.max(0,num(detail.deltaHours));
    if(deltaHours<=0)return [];
    const rows=registry()?.getRegistry?.();
    if(!(rows instanceof Map))return [];
    const updated=[];
    for(const [ministerId,record] of rows){
      if(record?.runtime?.status!=='ACTIVE')continue;
      const current=registry().getMinister(ministerId),session=current?.runtimeState?.trainingSession;
      if(!session||session.status!=='IN_PROGRESS')continue;
      const consumed=Math.min(deltaHours,Math.max(0,num(session.remainingHours))),remaining=Math.max(0,num(session.remainingHours)-consumed),complete=remaining<=0;
      const next={...session,remainingHours:remaining,progress:Math.round((1-remaining/Math.max(1,num(session.durationHours)))*100),status:complete?'COMPLETED':'IN_PROGRESS',lastAdvancedAtGameTime:detail.gameTime??null};
      registry().updateRuntimeState(ministerId,{trainingSession:next},complete?'TRAINING_DURATION_ELAPSED':'TRAINING_PROGRESS');
      try{global.dispatchEvent?.(new global.CustomEvent('MINISTER_TRAINING_PROGRESS',{detail:{ministerId,trainingSession:next}}));}catch(_){}
      if(complete){
        const trained=train(ministerId,session.domain,session.durationHours,session.quality),learning=trained?.learningState||{},gain=learning.lastTraining?.gain??0;
        const finalSession={...next,status:'COMPLETED',progress:100,remainingHours:0,completedAtGameTime:detail.gameTime??null,actualGain:gain};
        registry().updateRuntimeState(ministerId,{trainingSession:finalSession},'TRAINING_COMPLETED');
        try{global.dispatchEvent?.(new global.CustomEvent('MINISTER_TRAINING_COMPLETED',{detail:{ministerId,trainingSession:finalSession,actualGain:gain}}));}catch(_){}
        updated.push({ministerId,status:'COMPLETED',actualGain:gain});
      }else updated.push({ministerId,status:'IN_PROGRESS',progress:next.progress});
    }
    return updated;
  }
  global.addEventListener?.('MINISTER_GAME_TIME_ADVANCED',event=>{try{advanceTraining(event?.detail||{});}catch(error){console.error('[OMEGA Minister Training] progress failed',error);}});
  function debug(ministerId){const r=registry()?.getMinister(ministerId);if(!r)return null;return {identity:r.staticProfile,runtime:r.runtimeState,learning:r.learningState,memory:r.memorySummary,effectiveCapability:r.effectiveCapability,roleConfig:roleConfig(r.runtimeState.ministryId),personality:personality(r.staticProfile),profileEffects:analyzeProfile(r.staticProfile,operationFor(r.runtimeState.ministryId),{ministryId:r.runtimeState.ministryId}),status:r.status};}
  global.OmegaMinisterBehavior={VERSION,evaluateDirective,createDecisionContract,rankOptions,recordOutcome,recordForecast,train,scheduleTraining,advanceTraining,debug,roleConfig,operationFor,personality,ideologyPreference,analyzeProfile,profileConfig};
})(typeof window!=='undefined'?window:globalThis);
