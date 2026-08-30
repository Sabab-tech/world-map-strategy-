/*
 * OMEGA MINISTER STATE SYSTEM v1.0.0
 * Single source of truth for minister identity, runtime state, learning, memory,
 * tasks, communication, save/load, consistency diagnostics and effective state.
 */
(function(global){
  'use strict';
  if(global.OmegaMinisterStateRegistry) return;

  const VERSION='1.0.0';
  const CONFIG_ID='OMEGA_MINISTER_RUNTIME_CONFIG';
  const SAVE_KEY='OMEGA_MINISTER_STATE_V2';
  const now=()=>Date.now();
  const clamp=(v,min,max)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):min;
  const finite=v=>Number.isFinite(Number(v));
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const deepFreeze=o=>{if(!o||typeof o!=='object')return o;Object.freeze(o);for(const v of Object.values(o))if(v&&typeof v==='object'&&!Object.isFrozen(v))deepFreeze(v);return o;};
  const key=(countryId,ministryId)=>`${String(countryId||'').toUpperCase()}:${String(ministryId||'').toLowerCase()}`;
  const emit=(type,detail={})=>{try{global.dispatchEvent(new CustomEvent(type,{detail}))}catch(_){}};

  const fallbackConfig={
    bounds:{stress:{min:0,max:100},workload:{min:0,max:100},fatigue:{min:0,max:100},confidence:{min:0,max:100},trust:{min:0,max:100}},
    learning:{basePracticeGain:.18,successFactor:1.15,failureFactor:.55,trainingFactor:1.35,diminishingScale:12,maxDomainExperience:1000,maxLessons:128},
    workload:{taskWeights:{complexity:.42,urgency:.23,cognitiveDemand:.2,deadlinePressure:.1,communications:.05},decayPerGameHour:1.5,delegationRelief:.45},
    stress:{weights:{workload:.26,crisisExposure:.2,economicPressure:.12,politicalPressure:.12,decisionPressure:.1,timePressure:.08,uncertainty:.07,recentFailures:.05},recovery:{taskCompletion:.06,successfulResolution:.1,delegation:.04,rest:.035,support:.025,stableConditions:.01},responseCurve:1.15,recoveryCurve:.8},
    performance:{weights:{capability:.4,experience:.15,informationQuality:.15,workload:.1,stress:.1,timePressure:.1},stressPenaltyMax:.3,overloadPenaltyMax:.35},
    roles:[],taskTypes:{},persistence:{storageKey:SAVE_KEY,writeDebounceMs:120},limits:{maxTasksPerMinister:100,maxMessagesPerMinister:100,maxDecisionHistory:250,maxEpisodes:250,maxInstitutionalLessons:250}
  };
  let config=clone(fallbackConfig);
  let dirtyPersist=false,persistTimer=null;

  const registry=new Map();
  const assignmentIndex=new Map();
  const institutionalMemory=new Map();
  const eventLog=[];

  function getConfig(){return config;}
  function setConfig(next){config=Object.assign({},config,next||{});return config;}

  function safeArray(a,max){return Array.isArray(a)?a.slice(-max):[];}
  function emptyMemory(){return {working:[],episodic:[],semantic:[],procedural:[],strategic:[],relational:[],causal:[],self:[],decisions:[],lessons:[]};}

  function normalizeProfile(profile){
    if(!profile||!profile.id) throw new Error('MINISTER_PROFILE_INVALID');
    const baseStats=clone(profile.stats||{});
    const eff=clone(profile.efficiency||{});
    const normalized={
      ministerId:String(profile.id),baseName:String(profile.name||profile.baseName||profile.regionalName||profile.id),background:String(profile.background||''),gender:String(profile.gender||''),baseAge:finite(profile.age)?Number(profile.age):null,
      baseStats,efficiencyProfile:eff,ideology:clone(profile.ideology||{}),personalityProfile:clone(profile.personalityProfile||profile.personality||{}),education:clone(profile.education||null),careerBackground:clone(profile.careerBackground||null),regionalNames:clone(profile.regional_names||profile.regionalNames||{}),source:'ministers.json'
    };
    return deepFreeze(normalized);
  }

  function emptyRuntime(ministerId,countryId,ministryId,gameTime){
    return {
      ministerId,countryId,ministryId,status:'ACTIVE',recruitmentTime:gameTime,assignmentTime:gameTime,lastUpdateTick:gameTime,
      workload:0,cognitiveLoad:0,stress:0,fatigue:0,politicalPressure:0,economicPressure:0,crisisPressure:0,confidence:50,trust:50,
      activeTasks:[],activePlans:[],pendingDecisions:[],currentObjectives:[],currentAttention:[],currentStrategicPosture:null,
      stressContributors:{workload:0,crisisExposure:0,economicPressure:0,politicalPressure:0,decisionPressure:0,timePressure:0,uncertainty:0,recentFailures:0},
      workloadContributors:{urgentTasks:0,crisisTasks:0,planning:0,communication:0,administration:0,complexity:0},
      dirty:{runtime:true,learning:true,capability:true,memory:true}
    };
  }
  function emptyLearning(ministerId){return {ministerId,totalServiceTime:0,totalTaskExposure:0,domainExperience:{},crisisExperience:0,decisionExperience:0,successfulDecisions:0,failedDecisions:0,completedPlans:0,failedPlans:0,learnedLessons:[],forecastCalibration:{brier:[],bias:0},strategyEffectiveness:{},skillEvolution:{},specialization:{domains:{},primary:null},trainingHours:0,lastLearningAt:0};}

  function createRecord(profile,countryId,ministryId,gameTime){
    const identity=normalizeProfile(profile);
    const record={identity,runtime:emptyRuntime(identity.ministerId,countryId,ministryId,gameTime),learning:emptyLearning(identity.ministerId),memory:emptyMemory(),institutionalKey:key(countryId,ministryId),version:1};
    registry.set(identity.ministerId,record);assignmentIndex.set(key(countryId,ministryId),identity.ministerId);return record;
  }

  function registerMinister(profile,countryId,ministryId,gameTime=0){
    const id=String(profile?.id||'');if(!id)throw new Error('MINISTER_ID_REQUIRED');
    if(assignmentIndex.has(key(countryId,ministryId)) && assignmentIndex.get(key(countryId,ministryId))!==id) throw new Error('MINISTRY_ALREADY_ASSIGNED');
    const existing=registry.get(id);
    if(existing){if(existing.runtime.status==='ACTIVE'&&existing.runtime.countryId===countryId&&existing.runtime.ministryId===ministryId)return getEffectiveState(id,{});}
    const record=createRecord(profile,countryId,ministryId,gameTime);markDirty(record);emit('MINISTER_REGISTERED',snapshot(record));return getEffectiveState(id,{});
  }

  function validateCandidate(profile,countryId,ministryId){
    if(!profile?.id)throw new Error('CANDIDATE_ID_REQUIRED');
    if(!countryId)throw new Error('COUNTRY_REQUIRED');if(!ministryId)throw new Error('MINISTRY_REQUIRED');
    const existing=assignmentIndex.get(key(countryId,ministryId));if(existing)throw new Error('MINISTRY_ALREADY_ASSIGNED');
    return true;
  }

  function recruitCandidate(profile,countryId,ministryId,gameTime=0){
    validateCandidate(profile,countryId,ministryId);
    const prepared={identity:normalizeProfile(profile),runtime:null,learning:null,memory:emptyMemory(),institutionalKey:key(countryId,ministryId),version:1};
    prepared.runtime=emptyRuntime(prepared.identity.ministerId,countryId,ministryId,gameTime);prepared.learning=emptyLearning(prepared.identity.ministerId);
    if(registry.has(prepared.identity.ministerId)){
      const old=registry.get(prepared.identity.ministerId);if(old.runtime.status==='ACTIVE')throw new Error('MINISTER_ALREADY_ACTIVE');
      prepared.learning=clone(old.learning);prepared.memory=clone(old.memory);
    }
    registry.set(prepared.identity.ministerId,prepared);assignmentIndex.set(key(countryId,ministryId),prepared.identity.ministerId);markDirty(prepared);
    emit('MINISTER_RECRUITED',{ministerId:prepared.identity.ministerId,countryId,ministryId,recruitmentTime:gameTime,assignmentTime:gameTime});syncAll(prepared.identity.ministerId,'RECRUIT');return getEffectiveState(prepared.identity.ministerId,{});
  }

  function assignMinister(ministerId,countryId,ministryId,gameTime=0){
    const r=registry.get(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');
    const k=key(countryId,ministryId);const occupied=assignmentIndex.get(k);if(occupied&&occupied!==ministerId)throw new Error('MINISTRY_ALREADY_ASSIGNED');
    r.runtime.countryId=countryId;r.runtime.ministryId=ministryId;r.runtime.status='ACTIVE';r.runtime.assignmentTime=gameTime;r.runtime.lastUpdateTick=gameTime;assignmentIndex.set(k,ministerId);markDirty(r);emit('MINISTER_ASSIGNED',{ministerId,countryId,ministryId,assignmentTime:gameTime});syncAll(ministerId,'ASSIGN');return getEffectiveState(ministerId,{});
  }

  function removeMinister(ministerId,reason='FIRED',gameTime=0){
    const r=registry.get(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');
    const old=clone(r.runtime);if(old.status==='ACTIVE')assignmentIndex.delete(key(old.countryId,old.ministryId));r.runtime.status=reason;r.runtime.lastUpdateTick=gameTime;r.runtime.activeTasks=[];r.runtime.activePlans=[];r.runtime.pendingDecisions=[];for(const x of r.runtime.dirty?Object.keys(r.runtime.dirty):[])r.runtime.dirty[x]=true;markDirty(r);
    emit('MINISTER_FIRED',{ministerId,countryId:old.countryId,ministryId:old.ministryId,previousRuntime:old});syncAll(ministerId,'REMOVE');return getEffectiveState(ministerId,{});
  }

  function getMinister(ministerId){const r=registry.get(String(ministerId));return r?getEffectiveState(ministerId,{}):null;}
  function getActiveMinister(countryId,ministryId){const id=assignmentIndex.get(key(countryId,ministryId));return id?getMinister(id):null;}

  function applyRuntimePatch(ministerId,patch,reason='RUNTIME_UPDATE'){
    const r=registry.get(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');if(r.identity&&!patch.identity){Object.assign(r.runtime,clone(patch));}else throw new Error('IDENTITY_IMMUTABLE');
    for(const k of ['workload','cognitiveLoad','stress','fatigue','politicalPressure','economicPressure','crisisPressure','confidence','trust'])if(k in r.runtime)r.runtime[k]=clamp(r.runtime[k],config.bounds[k]?.min??0,config.bounds[k]?.max??100);
    markDirty(r);emit('MINISTER_RUNTIME_CHANGED',{ministerId,reason,patch:clone(patch)});return getEffectiveState(ministerId,{});
  }

  function addPressure(ministerId,kind,value,source='CONTEXT'){const r=registry.get(ministerId);if(!r)return null;const k=kind==='economic'?'economicPressure':kind==='political'?'politicalPressure':kind==='crisis'?'crisisPressure':null;if(!k)return null;r.runtime[k]=clamp(value,0,100);r.runtime.dirty.runtime=true;r.runtime.dirty.capability=true;markDirty(r);emit('MINISTER_PRESSURE_CHANGED',{ministerId,kind,value,source});return getEffectiveState(ministerId,{});}

  function resolveRoleConfig(ministryId){
    const n=String(ministryId||'').toLowerCase();for(const rule of config.roles||[]){if((rule.match||[]).some(x=>n.includes(String(x).toLowerCase())))return rule;}return (config.roles||[]).find(r=>(r.match||[]).length===0)||{};
  }
  function taskWeight(task){
    const type=task.type&&config.taskTypes?.[task.type]?config.taskTypes[task.type]:task;
    return {complexity:clamp(type?.complexity??task.complexity??0,0,100),urgency:clamp(type?.urgency??task.urgency??0,0,100),cognitiveDemand:clamp(type?.cognitiveDemand??task.cognitiveDemand??0,0,100),deadlinePressure:clamp(task.deadlinePressure??task.urgency??0,0,100)};
  }
  function recomputeWorkload(ministerId,gameHours=0){const r=registry.get(ministerId);if(!r)return null;const tasks=r.runtime.activeTasks||[],w=config.workload.taskWeights||{};let score=0,urgent=0,crisis=0,planning=0,comm=0,admin=0,complexity=0;
    for(const t of tasks){const x=taskWeight(t);score += x.complexity*(w.complexity??.42)+x.urgency*(w.urgency??.23)+x.cognitiveDemand*(w.cognitiveDemand??.2)+x.deadlinePressure*(w.deadlinePressure??.1);complexity+=x.complexity;if(x.urgency>=70)urgent+=x.urgency/100;if(t.crisis)crisis+=1;if(t.planning)planning+=x.cognitiveDemand/100;if(t.communication)comm+=1;if(t.administrative)admin+=1;}
    const decay=Math.max(0,Number(gameHours)||0)*(config.workload.decayPerGameHour??0);score=Math.max(0,score-decay);r.runtime.workload=clamp(score/Math.max(1,tasks.length||1),0,100);r.runtime.cognitiveLoad=clamp((score+complexity*.25)/Math.max(1,tasks.length||1),0,100);r.runtime.workloadContributors={urgentTasks:Number(urgent.toFixed(2)),crisisTasks:Number(crisis.toFixed(2)),planning:Number(planning.toFixed(2)),communication:Number(comm.toFixed(2)),administration:Number(admin.toFixed(2)),complexity:Number(complexity.toFixed(2))};r.runtime.dirty.capability=true;markDirty(r);emit('MINISTER_WORKLOAD_UPDATED',{ministerId,workload:r.runtime.workload,cognitiveLoad:r.runtime.cognitiveLoad,contributors:clone(r.runtime.workloadContributors)});return getEffectiveState(ministerId,{});}

  function addTask(ministerId,task){const r=registry.get(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');const limit=config.limits.maxTasksPerMinister??100;if(r.runtime.activeTasks.length>=limit)throw new Error('MINISTER_TASK_LIMIT');const normalized={taskId:String(task.taskId||`TASK-${now()}-${Math.random().toString(36).slice(2,7)}`),type:String(task.type||'ADMINISTRATION'),complexity:clamp(task.complexity??0,0,100),urgency:clamp(task.urgency??0,0,100),cognitiveDemand:clamp(task.cognitiveDemand??0,0,100),deadlinePressure:clamp(task.deadlinePressure??0,0,100),crisis:!!task.crisis,planning:!!task.planning,communication:!!task.communication,administrative:!!task.administrative,domain:String(task.domain||'general'),startedAt:task.startedAt??0,status:'ACTIVE'};r.runtime.activeTasks.push(normalized);r.learning.totalTaskExposure+=1;markDirty(r);emit('MINISTER_TASK_STARTED',{ministerId,task:clone(normalized)});recomputeWorkload(ministerId);return clone(normalized);}
  function finishTask(ministerId,taskId,outcome='SUCCESS',gameTime=0,lesson=null){const r=registry.get(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');const idx=r.runtime.activeTasks.findIndex(t=>t.taskId===taskId);if(idx<0)return null;const task=r.runtime.activeTasks.splice(idx,1)[0];const success=outcome==='SUCCESS';const gain=(config.learning.basePracticeGain??.18)*(success?(config.learning.successFactor??1.15):(config.learning.failureFactor??.55));const expGain=gain/(1+(Object.values(r.learning.domainExperience).reduce((a,b)=>a+(Number(b)||0),0)/(config.learning.diminishingScale??12)));r.learning.domainExperience[task.domain]=(r.learning.domainExperience[task.domain]||0)+expGain;r.learning.domainExperience[task.domain]=clamp(r.learning.domainExperience[task.domain],0,config.learning.maxDomainExperience??1000);r.learning.totalTaskExposure+=1;if(success)r.learning.successfulDecisions+=1;else r.learning.failedDecisions+=1;if(task.crisis)r.learning.crisisExperience+=Math.max(.1,expGain);if(lesson)storeLesson(ministerId,lesson,success?'SUCCESS':'FAILURE');r.learning.lastLearningAt=gameTime;r.runtime.stress=clamp(r.runtime.stress + (success?-2:3),0,100);markDirty(r);emit('MINISTER_TASK_COMPLETED',{ministerId,task:clone(task),outcome,gameTime,lesson});recomputeWorkload(ministerId);return task;}

  function updateStress(ministerId,context={},gameHours=0){const r=registry.get(ministerId);if(!r)return null;const w=config.stress.weights||{},s=r.runtime;const workload=clamp(s.workload,0,100);const curve=config.stress.responseCurve??1;let pressure=0;pressure += Math.pow(workload/100,curve)*100*(w.workload??0);pressure += Math.pow(clamp(context.crisisExposure??s.crisisPressure,0,100)/100,curve)*100*(w.crisisExposure??0);pressure += Math.pow(clamp(s.economicPressure,0,100)/100,curve)*100*(w.economicPressure??0);pressure += Math.pow(clamp(s.politicalPressure,0,100)/100,curve)*100*(w.politicalPressure??0);pressure += Math.pow(clamp(context.decisionPressure??0,0,100)/100,curve)*100*(w.decisionPressure??0);pressure += Math.pow(clamp(context.timePressure??0,0,100)/100,curve)*100*(w.timePressure??0);pressure += Math.pow(clamp(context.uncertainty??0,0,100)/100,curve)*100*(w.uncertainty??0);pressure += Math.pow(clamp(context.recentFailures??0,0,100)/100,curve)*100*(w.recentFailures??0);const role=resolveRoleConfig(s.ministryId);const ex=role.exposure||{};pressure += clamp(context.economicCondition??0,0,100)*(ex.economic??0)*.25;pressure += clamp(context.politicalCondition??0,0,100)*(ex.political??0)*.25;pressure += clamp(context.crisisCondition??0,0,100)*(ex.crisis??0)*.25;const recovery=(config.stress.recovery||{});const stable=clamp(context.stableConditions??0,0,100);const recover=stable*(recovery.stableConditions??.01)+(clamp(context.taskCompletion??0,0,100))*(recovery.taskCompletion??.06)+(clamp(context.successfulResolution??0,0,100))*(recovery.successfulResolution??.1)+(clamp(context.rest??0,0,100))*(recovery.rest??.035)+(clamp(context.support??0,0,100))*(recovery.support??.025)+(clamp(context.delegation??0,0,100))*(recovery.delegation??.04);const drift=pressure-recover-(Math.max(0,Number(gameHours)||0)*.1);s.stress=clamp(s.stress+drift,0,100);s.fatigue=clamp(s.fatigue + (workload/100)*Math.max(0,Number(gameHours)||0)*2 - (context.rest??0)*.1,0,100);s.stressContributors={workload:Number((workload*(w.workload??0)).toFixed(2)),crisisExposure:Number((clamp(context.crisisExposure??s.crisisPressure,0,100)*(w.crisisExposure??0)).toFixed(2)),economicPressure:Number((s.economicPressure*(w.economicPressure??0)).toFixed(2)),politicalPressure:Number((s.politicalPressure*(w.politicalPressure??0)).toFixed(2)),decisionPressure:Number(((context.decisionPressure??0)*(w.decisionPressure??0)).toFixed(2)),timePressure:Number(((context.timePressure??0)*(w.timePressure??0)).toFixed(2)),uncertainty:Number(((context.uncertainty??0)*(w.uncertainty??0)).toFixed(2)),recentFailures:Number(((context.recentFailures??0)*(w.recentFailures??0)).toFixed(2))};s.dirty.capability=true;markDirty(r);emit('MINISTER_STRESS_UPDATED',{ministerId,stress:s.stress,fatigue:s.fatigue,contributors:clone(s.stressContributors)});return getEffectiveState(ministerId,{});}

  function recordDecision(ministerId,decision){const r=registry.get(ministerId);if(!r)throw new Error('MINISTER_NOT_REGISTERED');r.memory.decisions.push(clone(decision));r.memory.decisions=safeArray(r.memory.decisions,config.limits.maxDecisionHistory??250);r.learning.decisionExperience+=1;if(decision.outcome==='SUCCESS')r.learning.successfulDecisions+=1;if(decision.outcome==='FAILURE')r.learning.failedDecisions+=1;markDirty(r);emit('MINISTER_DECISION_RECORDED',{ministerId,decision:clone(decision)});return true;}
  function storeEpisode(ministerId,episode,type='episodic'){const r=registry.get(ministerId);if(!r)return false;const arr=r.memory[type]||r.memory.episodic;r.memory[type]=safeArray(arr.concat([clone(episode)]),config.limits.maxEpisodes??250);markDirty(r);emit('MINISTER_MEMORY_ENCODED',{ministerId,type,episode:clone(episode)});return true;}
  function storeLesson(ministerId,lesson,outcome='UNKNOWN'){const r=registry.get(ministerId);if(!r)return false;const item={id:String(lesson.id||`LESSON-${now()}`),text:String(lesson.text||lesson),domain:String(lesson.domain||'general'),outcome,createdAt:now(),confidence:clamp(lesson.confidence??.5,0,1)};r.memory.lessons=safeArray(r.memory.lessons.concat([item]),config.learning.maxLessons??128);r.learning.learnedLessons=safeArray(r.learning.learnedLessons.concat([item]),config.learning.maxLessons??128);const key2=r.institutionalKey;const inst=institutionalMemory.get(key2)||[];institutionalMemory.set(key2,safeArray(inst.concat([{...item,ministerId,personal:false}]),config.limits.maxInstitutionalLessons??250));markDirty(r);emit('MINISTER_LESSON_LEARNED',{ministerId,lesson:item});return item;}
  function retrieveMemory(ministerId,query,limit=8){const r=registry.get(ministerId);if(!r)return[];const q=String(query||'').toLowerCase();const all=[];for(const type of ['working','episodic','semantic','procedural','strategic','relational','causal','self','decisions','lessons'])for(const item of (r.memory[type]||[])){const blob=JSON.stringify(item).toLowerCase();let score=0;if(q&&blob.includes(q))score+=10;const words=q.split(/\s+/).filter(Boolean);for(const w of words)if(w.length>2&&blob.includes(w))score+=1;all.push({type,item,score});}return all.sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>clone({...x.item,memoryType:x.type,relevance:x.score}));}
  function retrieveInstitutional(countryId,ministryId,query,limit=8){const arr=institutionalMemory.get(key(countryId,ministryId))||[];const q=String(query||'').toLowerCase();return arr.map(item=>({item,score:JSON.stringify(item).toLowerCase().includes(q)?10:0})).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>clone(x.item));}
  function sendMessage(senderMinisterId,receiverMinisterId,message){const receiver=registry.get(receiverMinisterId);if(!receiver)throw new Error('RECEIVER_NOT_REGISTERED');const s=registry.get(senderMinisterId);if(!s)throw new Error('SENDER_NOT_REGISTERED');const m={messageId:String(message.messageId||`MSG-${now()}-${Math.random().toString(36).slice(2,6)}`),senderMinisterId,receiverMinisterId,countryId:receiver.runtime.countryId,ministryId:receiver.runtime.ministryId,messageType:String(message.messageType||'INFORMATION'),priority:String(message.priority||'NORMAL'),topic:String(message.topic||''),payload:clone(message.payload||{}),timestamp:message.timestamp??0,expiry:message.expiry??0};receiver.memory.working=safeArray(receiver.memory.working.concat([m]),config.limits.maxMessagesPerMinister??100);markDirty(receiver);emit('MINISTER_MESSAGE_SENT',clone(m));return m;}
  function delegateTask(ministerId,taskId,receiverMinisterId){const r=registry.get(ministerId),rr=registry.get(receiverMinisterId);if(!r||!rr)throw new Error('MINISTER_NOT_REGISTERED');const idx=r.runtime.activeTasks.findIndex(t=>t.taskId===taskId);if(idx<0)throw new Error('TASK_NOT_FOUND');const task=r.runtime.activeTasks.splice(idx,1)[0];rr.runtime.activeTasks.push({...task,delegatedFrom:ministerId,status:'ACTIVE'});r.runtime.workload=clamp(r.runtime.workload-(task.complexity||0)*(config.workload.delegationRelief??.45)/100,0,100);markDirty(r);markDirty(rr);emit('MINISTER_TASK_DELEGATED',{from:ministerId,to:receiverMinisterId,task:clone(task)});recomputeWorkload(ministerId);recomputeWorkload(receiverMinisterId);return true;}

  function serviceDelta(ministerId,fromGameTime,toGameTime){const r=registry.get(ministerId);if(!r)return 0;const from=Number(fromGameTime),to=Number(toGameTime);if(!finite(from)||!finite(to)||to<from)return 0;const delta=Math.max(0,to-from);r.learning.totalServiceTime += delta;r.runtime.lastUpdateTick=to;return delta;}
  function onGameTime(gameTime,context={}){for(const r of registry.values()){if(r.runtime.status!=='ACTIVE')continue;const delta=serviceDelta(r.identity.ministerId,r.runtime.lastUpdateTick,gameTime);const hours=context.unit==='hours'?delta:delta;const role=resolveRoleConfig(r.runtime.ministryId);if(hours>0){r.learning.domainExperience.governance=(r.learning.domainExperience.governance||0)+Math.min(hours/8760,.05);r.learning.totalServiceTime=Math.max(0,r.learning.totalServiceTime);recomputeWorkload(r.identity.ministerId,hours);updateStress(r.identity.ministerId,context,hours);}markDirty(r);}persist();emit('MINISTER_GAME_TIME_ADVANCED',{gameTime});}

  function effectiveExperience(learning){const values=Object.entries(learning.domainExperience||{}).map(([domain,v])=>[domain,clamp(v,0,1000)]);const total=values.reduce((a,[,v])=>a+v,0);const normalized=clamp(total/Math.max(1,values.length*100),0,10);return {total:Number(normalized.toFixed(3)),domains:Object.fromEntries(values.map(([d,v])=>[d,Number(v.toFixed(3))]))};}
  function computeEffectiveCapability(record,context={}){const capEngine=global.OmegaMinisterCapability;let base=0;if(capEngine?.capability)base=Number(capEngine.capability(record.identity,context.operation||'EXECUTION'))||0;const ex=effectiveExperience(record.learning);const experienceFactor=1+Math.min(.25,ex.total*.025);const infoFactor=clamp(context.informationQuality??1,.5,1);const taskFit=clamp(context.taskFit??1,.5,1.25);const stressFactor=1-(clamp(record.runtime.stress,0,100)/100)*(config.performance.stressPenaltyMax??.3);const workloadOver=Math.max(0,(record.runtime.workload-70)/30);const workloadFactor=1-workloadOver*(config.performance.overloadPenaltyMax??.35);const timeFactor=clamp(context.timePressureFactor??1,.6,1.05);const value=base*taskFit*experienceFactor*infoFactor*stressFactor*workloadFactor*timeFactor;return {baseCapability:Number(base.toFixed(2)),taskFit:Number(taskFit.toFixed(3)),experienceFactor:Number(experienceFactor.toFixed(3)),informationQuality:Number(infoFactor.toFixed(3)),workloadFactor:Number(workloadFactor.toFixed(3)),stressFactor:Number(stressFactor.toFixed(3)),timePressureFactor:Number(timeFactor.toFixed(3)),effectiveCapability:Number(clamp(value,0,100).toFixed(2))};}

  function getEffectiveState(ministerId,context={}){const r=registry.get(String(ministerId));if(!r)return null;const capability=computeEffectiveCapability(r,context);const active=assignmentIndex.get(key(r.runtime.countryId,r.runtime.ministryId))===r.identity.ministerId;const state={ministerId:r.identity.ministerId,staticProfile:clone(r.identity),runtimeState:clone(r.runtime),learningState:clone(r.learning),memorySummary:{counts:Object.fromEntries(Object.entries(r.memory).map(([k,v])=>[k,Array.isArray(v)?v.length:0]))},effectiveCapability:capability,isActive:active,status:r.runtime.status};return deepFreeze(state);}

  function snapshot(r){return clone({ministerId:r.identity.ministerId,countryId:r.runtime.countryId,ministryId:r.runtime.ministryId,status:r.runtime.status,recruitmentTime:r.runtime.recruitmentTime,assignmentTime:r.runtime.assignmentTime});}
  function saveObject(){const ministers={};for(const [id,r] of registry.entries())ministers[id]=clone(r);return {schemaVersion:config.persistence.schemaVersion||'2.0.0',savedAt:now(),assignments:Object.fromEntries(assignmentIndex),institutionalMemory:Object.fromEntries(institutionalMemory),ministers};}
  function markDirty(r){if(r)dirtyPersist=true;if(persistTimer)return;persistTimer=setTimeout(()=>{persistTimer=null;if(dirtyPersist)persist();},config.persistence.writeDebounceMs??120);}
  function persist(){dirtyPersist=false;try{if(global.localStorage)localStorage.setItem(config.persistence.storageKey||SAVE_KEY,JSON.stringify(saveObject()));emit('MINISTER_STATE_PERSISTED',{savedAt:now()});return true;}catch(e){emit('MINISTER_STATE_PERSIST_FAILED',{message:e.message});return false;}}
  function load(){try{if(!global.localStorage)return false;const raw=localStorage.getItem(config.persistence.storageKey||SAVE_KEY);if(!raw)return false;const parsed=JSON.parse(raw);registry.clear();assignmentIndex.clear();institutionalMemory.clear();for(const [id,r]of Object.entries(parsed.ministers||{})){r.identity=deepFreeze(r.identity);registry.set(id,r);}for(const [k,id]of Object.entries(parsed.assignments||{}))assignmentIndex.set(k,id);for(const [k,v]of Object.entries(parsed.institutionalMemory||{}))institutionalMemory.set(k,v);emit('MINISTER_STATE_LOADED',{savedAt:parsed.savedAt});return true;}catch(e){emit('MINISTER_STATE_LOAD_FAILED',{message:e.message});return false;}}

  function consistencyCheck(){const errors=[];for(const [k,id]of assignmentIndex.entries()){const r=registry.get(id);if(!r)errors.push({code:'MINISTER_STATE_INCONSISTENCY',key:k,reason:'ASSIGNMENT_POINTS_TO_MISSING_MINISTER'});else if(r.runtime.status!=='ACTIVE')errors.push({code:'MINISTER_STATE_INCONSISTENCY',ministerId:id,reason:'ASSIGNED_MINISTER_NOT_ACTIVE'});else if(key(r.runtime.countryId,r.runtime.ministryId)!==k)errors.push({code:'MINISTER_STATE_INCONSISTENCY',ministerId:id,reason:'ASSIGNMENT_KEY_MISMATCH'});}
    const seen=new Set();for(const r of registry.values()){if(r.runtime.status==='ACTIVE'){const k=key(r.runtime.countryId,r.runtime.ministryId);if(seen.has(k))errors.push({code:'MINISTER_DUPLICATE_ACTIVE',key:k});seen.add(k);}}
    for(const [id,r]of registry.entries())if(r.identity.baseAge!==null&&r.identity.baseAge!==undefined&&r.identity.baseAge<0)errors.push({code:'MINISTER_PROFILE_MUTATION',ministerId:id,reason:'INVALID_AGE'});
    const result={ok:errors.length===0,errors,count:errors.length,checkedAt:now()};if(errors.length)emit('MINISTER_STATE_INCONSISTENCY',result);return result;}

  function syncAll(ministerId,reason){const effective=getEffectiveState(ministerId,{});try{if(global.OmegaCabinetUI?.ministriesDatabase){const m=global.OmegaCabinetUI.ministriesDatabase[effective.runtimeState.ministryId];if(m){m.ministerId=ministerId;m.activeMinisterId=ministerId;m.ministerProfile=clone(effective.staticProfile);m.ministerRuntime=clone(effective.runtimeState);m.ministerLearning=clone(effective.learningState);m.effectiveCapability=clone(effective.effectiveCapability);m.ministerName=effective.staticProfile.baseName;}}}catch(_){ } try{if(global.OmegaMinisterCapability?.register)global.OmegaMinisterCapability.register(effective.staticProfile);}catch(_){ } emit('MINISTER_SYSTEM_SYNCHRONIZED',{ministerId,reason,effective});}

  function bindExternalEvents(){
    global.addEventListener('OMEGA_MINISTER_CHANGED',e=>{const d=e.detail||{};if(!d.candidate?.id)return;try{const activeBefore=getActiveMinister(d.countryCode,d.ministryId);if(activeBefore&&activeBefore.ministerId!==d.candidate.id)removeMinister(activeBefore.ministerId,'REPLACED',d.timestamp||0);if(!registry.has(d.candidate.id))recruitCandidate(d.candidate,d.countryCode,d.ministryId,d.timestamp||0);else assignMinister(d.candidate.id,d.countryCode,d.ministryId,d.timestamp||0);}catch(err){emit('MINISTER_SYSTEM_SYNC_ERROR',{message:err.message,detail:d});}});
    global.addEventListener('MINISTER_TASK_STARTED',()=>{});
    for(const evt of ['RESOURCE_STATE_UPDATED','ECONOMY_TICK','WAR_DECLARED','CRISIS_STARTED','CRISIS_RESOLVED','POLICY_VOTE_CAST'])global.addEventListener(evt,e=>{const d=e.detail||{};for(const r of registry.values())if(r.runtime.status==='ACTIVE'){if(d.countryId&&String(d.countryId).toUpperCase()!==String(r.runtime.countryId).toUpperCase())continue;const ctx={economicCondition:Number(d.economicPressure??d.economicCondition??0),politicalCondition:Number(d.politicalPressure??d.politicalCondition??0),crisisCondition:Number(d.crisisPressure??d.crisisCondition??(evt==='CRISIS_STARTED'?100:0)),crisisExposure:Number(d.crisisExposure??0),uncertainty:Number(d.uncertainty??0),timePressure:Number(d.timePressure??0)};updateStress(r.identity.ministerId,ctx,0);}});
  }

  const API={VERSION,CONFIG_ID,getConfig,setConfig,registerMinister,recruitCandidate,assignMinister,removeMinister,getMinister,getActiveMinister,updateRuntimeState:applyRuntimePatch,updateLearningState:(id,patch)=>{const r=registry.get(id);if(!r)throw new Error('MINISTER_NOT_REGISTERED');Object.assign(r.learning,clone(patch));markDirty(r);emit('MINISTER_LEARNING_CHANGED',{ministerId:id,patch:clone(patch)});return getEffectiveState(id,{})},getEffectiveState,addPressure,addTask,finishTask,recomputeWorkload,updateStress,recordDecision,storeEpisode,storeLesson,retrieveMemory,retrieveInstitutional,sendMessage,delegateTask,onGameTime,persist,load,saveObject,consistencyCheck,getRegistry:()=>new Map(registry),getAssignments:()=>new Map(assignmentIndex),getInstitutionalMemory:()=>new Map(institutionalMemory)};
  global.OmegaMinisterStateRegistry=API;
  global.MinisterStateRegistry=API;

  try{if(global.OmegaMinisterRuntimeConfig)setConfig(global.OmegaMinisterRuntimeConfig);}catch(_){}
  load();bindExternalEvents();
  setInterval(()=>{consistencyCheck();},5000);
})(typeof window!=='undefined'?window:globalThis);
