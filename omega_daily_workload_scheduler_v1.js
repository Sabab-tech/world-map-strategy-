/* OMEGA UNIVERSAL DAILY WORKLOAD SCHEDULER v1
 * Plans committed domain-period work across simulation days.
 * Domain ledgers/checkpoints stay with their existing authoritative runtimes.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0';
  const LIMITS=Object.freeze({
    MOBILE_MAX_SLICES:4,
    DESKTOP_MAX_SLICES:8,
    MOBILE_BUDGET_MS:9000,
    DESKTOP_BUDGET_MS:16000,
    MAX_DOMAINS:32,
    MAX_METRIC_ROWS:32
  });
  const domains=new Map();
  let sequence=0,inFlightKey=null,inFlightPromise=null;
  let totalSlices=0,totalFailures=0,totalYields=0,lastPlan=null;
  const num=(v,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f;};
  const canonical=v=>String(v||'').trim().toUpperCase();
  const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const now=()=>{try{const v=Number(g.performance?.now?.());if(Number.isFinite(v))return v;}catch(_){}return Date.now();};
  const state=()=>g.Omega?.Simulation?.world?.state||g.Game?.state||g.gameState||null;
  function constrained(){
    const nav=g.navigator||{},ua=String(nav.userAgent||'');
    return /Android|Mobile|iPhone|iPad/i.test(ua)||num(nav.deviceMemory,8)<=4||num(nav.hardwareConcurrency,8)<=4;
  }
  function yieldToUi(){
    totalYields++;
    return new Promise(resolve=>{
      if(typeof g.setTimeout==='function'){g.setTimeout(resolve,0);return;}
      Promise.resolve().then(resolve);
    });
  }
  function ensureStore(root){
    if(!isObject(root.simulation))root.simulation={};
    let store=root.simulation.dailyWorkloadSchedulerV1;
    if(!isObject(store)||Number(store.schemaVersion)!==1){
      store={schemaVersion:1,lastCountryId:null,lastSessionId:null,lastScheduledTurn:0,
        counters:{slices:0,failures:0,plans:0},domains:{},lastPlan:null};
      root.simulation.dailyWorkloadSchedulerV1=store;
    }
    if(!isObject(store.counters))store.counters={slices:0,failures:0,plans:0};
    if(!isObject(store.domains))store.domains={};
    return store;
  }
  function registerDomain(options={}){
    const id=String(options.id||'').trim().toLowerCase();
    if(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id))throw new Error('DAILY_WORKLOAD_DOMAIN_ID_INVALID');
    if(!domains.has(id)&&domains.size>=LIMITS.MAX_DOMAINS)throw new Error('DAILY_WORKLOAD_DOMAIN_LIMIT_REACHED');
    const enabled=options.enabled!==false;
    if(enabled&&(typeof options.getProgress!=='function'||typeof options.runSlice!=='function'))
      throw new Error('DAILY_WORKLOAD_DOMAIN_RUNNER_REQUIRED:'+id);
    const previous=domains.get(id);
    const entry={
      id,label:String(options.label||id).slice(0,100),
      pageId:String(options.pageId||'').slice(0,100)||null,
      priority:num(options.priority,100),
      dependencies:[...new Set((Array.isArray(options.dependencies)?options.dependencies:[]).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean))],
      enabled,disabledReason:enabled?null:String(options.disabledReason||'DISABLED'),
      cadenceTurns:Math.max(1,Math.floor(num(options.cadenceTurns,1))),
      getProgress:enabled?options.getProgress:null,
      runSlice:enabled?options.runSlice:null,
      sequence:previous?.sequence??(++sequence),
      token:{}
    };
    domains.set(id,entry);
    return()=>{if(domains.get(id)===entry)domains.delete(id);};
  }
  function snapshotProgress(entry,ctx){
    const raw=entry.getProgress(ctx)||{};
    const last=Math.max(0,Math.floor(num(raw.lastProcessedTurn,0)));
    return{lastProcessedTurn:last,status:String(raw.status||'READY'),
      pendingDays:Math.max(0,Math.floor(num(raw.pendingDays,ctx.targetTurn-last))),
      detail:raw.detail??null};
  }
  function due(entry,periodTurn){
    return entry.cadenceTurns<=1||periodTurn%entry.cadenceTurns===0;
  }
  async function runPlanInternal(input={}){
    const root=state();
    if(!isObject(root))return{status:'SKIPPED',reason:'AUTHORITATIVE_WORLD_STATE_UNAVAILABLE',processedSlices:0};
    const countryId=canonical(input.countryId),sessionId=String(input.sessionId||'').trim();
    const session=root.simulation?.session||{};
    const targetTurn=Math.max(0,Math.floor(num(input.targetTurn,root.simulation?.turn||0)));
    if(!/^[A-Z]{2,3}$/.test(countryId)||!sessionId||
       canonical(session.playerCountryId)!==countryId||String(session.sessionId||'')!==sessionId)
      return{status:'FAILED',reason:'ACTIVE_PLAYER_SESSION_IDENTITY_MISMATCH',countryId:countryId||null,targetTurn,processedSlices:0};
    const registered=[...domains.values()].filter(row=>row.enabled&&domains.get(row.id)===row)
      .sort((a,b)=>a.priority-b.priority||a.sequence-b.sequence);
    const disabled=[...domains.values()].filter(row=>!row.enabled).map(row=>({id:row.id,pageId:row.pageId,reason:row.disabledReason}));
    const unknownDependencies=registered.filter(row=>row.dependencies.some(id=>!domains.has(id)||!domains.get(id).enabled))
      .map(row=>({id:row.id,dependencies:row.dependencies.filter(id=>!domains.has(id)||!domains.get(id).enabled)}));
    if(unknownDependencies.length)return{status:'FAILED',reason:'DAILY_WORKLOAD_DEPENDENCY_UNAVAILABLE',
      unknownDependencies,processedSlices:0};
    const ctx={countryId,sessionId,targetTurn,root,turn:targetTurn,simulation:g.Omega?.Simulation||null};
    const store=ensureStore(root),isMobile=constrained();
    const maxSlices=Math.max(1,Math.floor(num(input.maxSlices,isMobile?LIMITS.MOBILE_MAX_SLICES:LIMITS.DESKTOP_MAX_SLICES)));
    const budgetMs=Math.max(1,num(input.budgetMs,isMobile?LIMITS.MOBILE_BUDGET_MS:LIMITS.DESKTOP_BUDGET_MS));
    const startedAt=now(),results=[],progress=new Map();
    const refresh=entry=>{const value=snapshotProgress(entry,ctx);progress.set(entry.id,value);return value;};
    for(const entry of registered)refresh(entry);
    let failure=null,processedSlices=0,iterations=0;
    // Each unit is one domain's reconciled game-period. This keeps transaction and
    // warehouse/factory allocation boundaries intact; a domain may yield internally.
    while(processedSlices<maxSlices&&iterations<maxSlices*4){
      iterations++;
      const candidates=[];
      for(const entry of registered){
        const current=refresh(entry),next=current.lastProcessedTurn+1;
        if(next>targetTurn||!due(entry,next))continue;
        const blockedBy=entry.dependencies.find(depId=>{
          const dep=domains.get(depId),depProgress=dep?refresh(dep):{lastProcessedTurn:0};
          return depProgress.lastProcessedTurn<next;
        });
        if(!blockedBy)candidates.push({entry,next,current});
      }
      if(!candidates.length)break;
      candidates.sort((a,b)=>a.next-b.next||a.entry.priority-b.entry.priority||a.entry.sequence-b.entry.sequence);
      const selected=candidates[0],entry=selected.entry,periodTurn=selected.next;
      const runStarted=now();
      let value;
      try{
        value=await entry.runSlice({...ctx,periodTurn,day:periodTurn+1,
          remainingSliceBudgetMs:Math.max(0,budgetMs-(now()-startedAt)),
          sliceIndex:processedSlices});
      }catch(error){value={status:'FAILED',reason:String(error?.message||error)};}
      const durationMs=Math.max(0,now()-runStarted);
      const nextProgress=refresh(entry);
      const status=String(value?.status||'UNKNOWN').toUpperCase();
      if(status==='FAILED'||status==='BLOCKED'||status==='WAITING'||status==='NOT_AVAILABLE'){
        failure={domainId:entry.id,periodTurn,reason:value?.reason||status,result:value||null};
        totalFailures++;store.counters.failures=num(store.counters.failures)+1;
        const row={id:entry.id,pageId:entry.pageId,periodTurn,status:'FAILED',
          reason:failure.reason,durationMs};
        results.push(row);store.domains[entry.id]={...(store.domains[entry.id]||{}),lastAttemptTurn:targetTurn,
          lastPeriodTurn:periodTurn,lastStatus:'FAILED',lastError:failure.reason,lastDurationMs:durationMs};
        break;
      }
      if(nextProgress.lastProcessedTurn<periodTurn){
        failure={domainId:entry.id,periodTurn,reason:'DOMAIN_SLICE_DID_NOT_ADVANCE_RECONCILED_CHECKPOINT',result:value||null};
        totalFailures++;store.counters.failures=num(store.counters.failures)+1;
        results.push({id:entry.id,pageId:entry.pageId,periodTurn,status:'FAILED',reason:failure.reason,durationMs});
        store.domains[entry.id]={...(store.domains[entry.id]||{}),lastAttemptTurn:targetTurn,
          lastPeriodTurn:periodTurn,lastStatus:'PENDING',lastError:failure.reason,lastDurationMs:durationMs};
        break;
      }
      processedSlices++;totalSlices++;
      store.counters.slices=num(store.counters.slices)+1;
      const previous=store.domains[entry.id]||{};
      const average=previous.averageDurationMs===undefined?durationMs:
        (num(previous.averageDurationMs)*0.75+durationMs*0.25);
      store.domains[entry.id]={lastAttemptTurn:targetTurn,lastPeriodTurn:periodTurn,
        lastProcessedTurn:nextProgress.lastProcessedTurn,lastStatus:'COMPLETED',lastError:null,
        lastDurationMs:Number(durationMs.toFixed(2)),averageDurationMs:Number(average.toFixed(2)),
        completedSlices:num(previous.completedSlices)+1,pageId:entry.pageId};
      results.push({id:entry.id,pageId:entry.pageId,periodTurn,status:'COMPLETED',
        lastProcessedTurn:nextProgress.lastProcessedTurn,durationMs:Number(durationMs.toFixed(2)),
        result:value||null});
      // Always give the UI a chance between atomic domain-period transactions.
      await yieldToUi();
      // Reserve one initial pass for each enabled domain before optional catch-up
      // work consumes the rest of the budget.
      if(processedSlices>=registered.length&&now()-startedAt>=budgetMs)break;
    }
    const progressRows=registered.map(entry=>{
      const current=refresh(entry);
      return{id:entry.id,label:entry.label,pageId:entry.pageId,priority:entry.priority,
        dependencies:entry.dependencies,lastProcessedTurn:current.lastProcessedTurn,
        pendingDays:Math.max(0,targetTurn-current.lastProcessedTurn),status:current.status};
    });
    const pending=progressRows.filter(row=>row.pendingDays>0);
    const status=failure?'FAILED':pending.length?'CATCHING_UP':'COMPLETED';
    const report={status,countryId,sessionId,targetTurn,processedSlices,maxSlices,budgetMs,
      elapsedMs:Number(Math.max(0,now()-startedAt).toFixed(2)),failure,pending,domains:progressRows,
      disabledDomains:disabled,results};
    store.lastCountryId=countryId;store.lastSessionId=sessionId;store.lastScheduledTurn=targetTurn;
    store.counters.plans=num(store.counters.plans)+1;
    store.lastPlan={status,countryId,sessionId,targetTurn,processedSlices,
      elapsedMs:report.elapsedMs,pending:pending.map(x=>({id:x.id,lastProcessedTurn:x.lastProcessedTurn,pendingDays:x.pendingDays})),
      failure:failure?{domainId:failure.domainId,periodTurn:failure.periodTurn,reason:failure.reason}:null};
    lastPlan=report;
    return report;
  }
  function runPlan(input={}){
    const key=canonical(input.countryId)+'|'+String(input.sessionId||'')+'|'+String(input.targetTurn??'');
    if(inFlightPromise){
      if(inFlightKey===key)return inFlightPromise;
      return inFlightPromise.then(()=>runPlan(input),()=>runPlan(input));
    }
    const task=runPlanInternal(input);
    const tracked=task.finally(()=>{if(inFlightPromise===tracked){inFlightPromise=null;inFlightKey=null;}});
    inFlightKey=key;inFlightPromise=tracked;return tracked;
  }
  function diagnostics(){
    const root=state(),store=root?ensureStore(root):null;
    return{version:VERSION,limits:LIMITS,processing:!!inFlightPromise,
      registeredDomains:[...domains.values()].map(row=>({id:row.id,label:row.label,pageId:row.pageId,
        priority:row.priority,dependencies:row.dependencies,enabled:row.enabled,disabledReason:row.disabledReason})),
      domainCount:domains.size,totalSlices,totalFailures,totalYields,lastPlan:lastPlan?{
        status:lastPlan.status,countryId:lastPlan.countryId,targetTurn:lastPlan.targetTurn,
        processedSlices:lastPlan.processedSlices,elapsedMs:lastPlan.elapsedMs,pending:lastPlan.pending}:store?.lastPlan||null};
  }
  const API=Object.freeze({VERSION,LIMITS,registerDomain,runPlan,diagnostics,
    dispose(){domains.clear();inFlightKey=null;inFlightPromise=null;return true;}});
  g.Omega=g.Omega||{};g.Omega.DailyWorkloadScheduler=API;g.OmegaDailyWorkloadScheduler=API;
})(typeof window!=='undefined'?window:globalThis);
