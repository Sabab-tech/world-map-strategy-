/* OMEGA OPPONENT TREATY LIFECYCLE SYSTEM v1.0.0
 * One deterministic bilateral treaty state machine.
 */
(function(g){
  'use strict';
  const VERSION='1.1.0',MAX=256,MAX_PENDING_REVIEWS_PER_COUNTRY=2;
  const clone=(v,seen=new WeakMap())=>{if(v===null||typeof v!=='object')return v;if(seen.has(v))return seen.get(v);if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);return o;};
  const id=v=>String(v??'').trim().toUpperCase();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const clamp=(v,a=0,b=1)=>{const n=num(v);return n===null?null:Math.max(a,Math.min(b,n));};
  const state=()=>g.Game?.state||g.gameState||{};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  let unregisterSchedulerHandler=null;
  const processedCountryTurns=new Set();
  const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
  function countryEntry(rows,countryValue){
    if(!rows||typeof rows!=='object'||Array.isArray(rows))return null;
    const countryId=canonical(countryValue);
    if(!countryId)return null;
    if(Object.prototype.hasOwnProperty.call(rows,countryId))return rows[countryId];
    const key=Object.keys(rows).find(value=>id(value)===countryId||canonical(value)===countryId);
    return key===undefined?null:rows[key];
  }
  function bucket(c,domain='foreign'){
    const cid=canonical(c),s=state(),d=s?.[domain];
    if(!d||typeof d!=='object'||Array.isArray(d))return null;
    if(Object.prototype.hasOwnProperty.call(d,cid))return d[cid];
    const key=Object.keys(d).find(value=>id(value)===cid||canonical(value)===cid);
    return key===undefined?null:d[key];
  }
  function relation(a,b){
    const x=canonical(a),y=canonical(b);
    return countryEntry(bucket(x,'foreign')?.relations,y)??countryEntry(bucket(x,'relations'),y)??
      countryEntry(bucket(y,'foreign')?.relations,x)??countryEntry(bucket(y,'relations'),x)??null;
  }
  function relationScore(r){
    if(!r)return null;if(r.war_state===true||r.sanctions===true)return 0;
    const vals=[num(r.overall),num(r.trust),num(r.political)].filter(x=>x!==null).map(x=>x>1?x/100:x);
    return vals.length?clamp(vals.reduce((a,b)=>a+b,0)/vals.length):null;
  }
  function command(owner,type,c,payload={}){
    const mesh=interop();if(!mesh?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{return mesh.dispatchCommand(owner,type,canonical(c),payload,{turn:turn(),commandType:type,correlationId:payload?.negotiationId||payload?.decisionId||null});}catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
  }
  function emit(type,c,payload={}){
    const mesh=interop();
    try{return mesh?.emitEvent?.(type,canonical(c),'foreign',{countryId:canonical(c),...clone(payload)},{turn:turn()});}catch(_){}
    return null;
  }
  function setNegotiation(c,target,patch){
    const raw=bucket(c,'foreign')||{},next=clone(raw);
    if(!next.negotiations||typeof next.negotiations!=='object')next.negotiations={};
    const old=next.negotiations[canonical(target)]||{};
    next.negotiations[canonical(target)]={...old,...clone(patch),targetCountryId:canonical(target)};
    return next;
  }
  function review(req,target){
    const buyer=canonical(req.countryId),seller=canonical(target),r=relation(buyer,seller),rel=relationScore(r);
    if(!r)return{decision:'WAITING_DATA',reason:'FOREIGN_RELATION_NOT_OBSERVED'};
    if(r.war_state===true||r.sanctions===true)return{decision:'REJECT',reason:'WAR_OR_SANCTIONS',confidence:.95};
    if(rel===null)return{decision:'WAITING_DATA',reason:'RELATION_SCORE_NOT_OBSERVED'};
    const trust=num(r.trust);const political=num(r.political);
    if(rel>=.70 || (trust!==null&&trust>=70))return{decision:'ACCEPT',reason:'BILATERAL_RELATION_ACCEPTABLE',confidence:.88};
    if(rel>=.35 || (political!==null&&political>=35))return{decision:'COUNTER',reason:'TERMS_REQUIRE_REVISION',confidence:.82,
      terms:clone(req.terms||{}),requestedTerms:clone(req.terms||{})};
    return{decision:'REJECT',reason:'BILATERAL_RELATION_BELOW_ACCEPTANCE_THRESHOLD',confidence:.86};
  }
  function reviewHandler(cmd,ctx){
    const req=clone(cmd?.payload?.request||{}),target=canonical(ctx.countryId),d=review(req,target);
    const negotiations=ctx.stateTransaction.get('foreign.negotiations');
    const next=negotiations&&typeof negotiations==='object'?clone(negotiations):{};
    if(d.decision==='COUNTER'){
      next[canonical(req.countryId)]={status:'COUNTER_OFFERED',stage:'COUNTER_OFFERED',targetCountryId:canonical(req.countryId),treatyType:req.treatyType||'BILATERAL_AGREEMENT',terms:d.terms||{},counterTerms:d.terms||{},createdTurn:turn(),counterpartyDecision:'COUNTER'};
      ctx.stateTransaction.set('foreign.negotiations',next);
      emit('OMEGA_TREATY_COUNTER_OFFERED',target,{requesterCountryId:canonical(req.countryId),targetCountryId:target,terms:d.terms||{},negotiationId:req.negotiationId||req.decisionId||null});
      return{accepted:true,decision:d,negotiation:next[canonical(req.countryId)]};
    }
    emit(d.decision==='ACCEPT'?'OMEGA_TREATY_ACCEPTED':'OMEGA_TREATY_REJECTED',target,{requesterCountryId:canonical(req.countryId),targetCountryId:target,negotiationId:req.negotiationId||req.decisionId||null,reason:d.reason});
    return{accepted:true,decision:d};
  }
  function applyRequesterHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId),target=canonical(p.targetCountryId),decision=String(p.decision||'').toUpperCase();
    if(!target)return{accepted:false,reason:'TARGET_COUNTRY_REQUIRED'};
    const existing=ctx.stateTransaction.get('foreign.negotiations');
    const next=existing&&typeof existing==='object'?clone(existing):{};
    const n=next[target]||{};
    if(decision==='REJECT'){
      n.status='REJECTED';n.stage='COUNTERPARTY_REJECTED';n.counterpartyDecision='REJECT';n.rejectedTurn=turn();
      next[target]=n;ctx.stateTransaction.set('foreign.negotiations',next);
      return{accepted:true,status:'REJECTED'};
    }
    if(decision==='COUNTER'){
      n.status='COUNTER_OFFERED';n.stage='COUNTER_OFFER_RECEIVED';n.counterpartyDecision='COUNTER';n.counterTerms=clone(p.terms||n.counterTerms||{});
      next[target]=n;ctx.stateTransaction.set('foreign.negotiations',next);
      return{accepted:true,status:'COUNTER_OFFERED'};
    }
    if(decision==='ACCEPT'){
      n.status='ACCEPTED';n.stage='RATIFICATION_PENDING';n.counterpartyDecision='ACCEPT';n.acceptedTurn=turn();next[target]=n;ctx.stateTransaction.set('foreign.negotiations',next);
      return{accepted:true,status:'ACCEPTED',negotiation:n};
    }
    return{accepted:false,reason:'UNKNOWN_TREATY_RESPONSE'};
  }
  function activateHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId),target=canonical(p.targetCountryId);
    if(!target)return{accepted:false,reason:'TARGET_COUNTRY_REQUIRED'};
    const foreign=ctx.stateTransaction.get('foreign'),next=foreign&&typeof foreign==='object'?clone(foreign):{};
    const treaties=next.treaties&&typeof next.treaties==='object'?clone(next.treaties):{};
    treaties[target]={status:'ACTIVE',stage:'IMPLEMENTED',treatyType:p.treatyType||'BILATERAL_AGREEMENT',terms:clone(p.terms||{}),activatedTurn:turn(),ratifiedTurn:turn(),parties:[c,target]};
    next.treaties=treaties;
    const negotiations=next.negotiations&&typeof next.negotiations==='object'?clone(next.negotiations):{};
    negotiations[target]={...(negotiations[target]||{}),status:'ACTIVE',stage:'IMPLEMENTED',counterpartyDecision:'ACCEPT',implementedTurn:turn()};
    next.negotiations=negotiations;
    ctx.stateTransaction.set('foreign',next);
    emit('OMEGA_TREATY_RATIFIED',c,{targetCountryId:target,treaty:treaties[target]});
    emit('OMEGA_TREATY_IMPLEMENTED',c,{targetCountryId:target,treaty:treaties[target]});
    return{accepted:true,status:'ACTIVE',treaty:treaties[target]};
  }
  function stateChangeHandler(cmd,ctx,status){
    const p=cmd?.payload||{},target=canonical(p.targetCountryId),c=canonical(ctx.countryId);
    const foreign=ctx.stateTransaction.get('foreign'),next=foreign&&typeof foreign==='object'?clone(foreign):{},treaties=next.treaties&&typeof next.treaties==='object'?clone(next.treaties):{};
    const old=treaties[target];if(!old)return{accepted:false,reason:'TREATY_NOT_FOUND'};
    treaties[target]={...old,status,stage:status,changedTurn:turn()};next.treaties=treaties;ctx.stateTransaction.set('foreign',next);
    emit(status==='SUSPENDED'?'OMEGA_TREATY_SUSPENDED':'OMEGA_TREATY_TERMINATED',c,{targetCountryId:target,treaty:treaties[target]});
    return{accepted:true,status};
  }
  function processCountry(countryValue, context={}) {
    const countryId=canonical(countryValue);
    if(!countryId)return{status:'SKIPPED',reason:'TREATY_COUNTRY_ID_REQUIRED'};
    const token=countryId+':'+turn();
    if(processedCountryTurns.has(token))return{status:'ALREADY_PROCESSED',countryId,turn:turn(),processed:0};
    const foreign=bucket(countryId,'foreign'),negotiations=foreign?.negotiations;
    if(!negotiations||typeof negotiations!=='object'){
      processedCountryTurns.add(token);
      if(processedCountryTurns.size>512)processedCountryTurns.delete(processedCountryTurns.values().next().value);
      return{status:'COMPLETED',countryId,turn:turn(),processed:0};
    }
    const pending=Object.entries(negotiations).slice(-MAX).filter(([,row])=>
      String(row?.status||'').toUpperCase()==='REQUESTED'&&
      num(row?.createdTurn)!==null&&num(row.createdTurn)<turn()
    ).slice(0,MAX_PENDING_REVIEWS_PER_COUNTRY);
    let processed=0,accepted=0,countered=0,rejected=0,waiting=0,failed=0;
    const failureStages=[];
    for(const [targetKey,row] of pending){
      const target=canonical(targetKey);
      if(!target||target===countryId){failed++;continue;}
      const req={...clone(row),countryId,targetCountryId:target,
        negotiationId:row.negotiationId||row.decisionId||'NEG-'+turn()+'-'+countryId+'-'+target};
      const reviewResult=command('foreign','OMEGA_TREATY_REVIEW_NEGOTIATION',target,{request:req});
      if(reviewResult?.status!=='APPLIED'){
        failed++;failureStages.push({targetCountryId:target,stage:'COUNTERPARTY_REVIEW',
          status:reviewResult?.status||null,reason:reviewResult?.reason||reviewResult?.result?.reason||null});continue;
      }
      const decision=reviewResult.result?.decision;
      if(!decision||decision.decision==='WAITING_DATA'){waiting++;continue;}
      const requesterResult=command('foreign','OMEGA_TREATY_APPLY_NEGOTIATION_RESPONSE',countryId,{
        targetCountryId:target,decision:decision.decision,terms:decision.terms||row.terms||{},negotiationId:req.negotiationId
      });
      if(requesterResult?.status!=='APPLIED'){
        failed++;failureStages.push({targetCountryId:target,stage:'REQUESTER_RESPONSE',
          status:requesterResult?.status||null,reason:requesterResult?.reason||requesterResult?.result?.reason||null});continue;
      }
      processed++;
      if(decision.decision==='ACCEPT'){
        const terms=decision.terms||row.terms||{},treatyType=row.treatyType||'BILATERAL_AGREEMENT';
        const left=command('foreign','OMEGA_TREATY_ACTIVATE',countryId,{negotiationId:req.negotiationId,targetCountryId:target,terms,treatyType});
        const right=command('foreign','OMEGA_TREATY_ACTIVATE',target,{negotiationId:req.negotiationId,targetCountryId:countryId,terms,treatyType});
        if(left?.status==='APPLIED'&&right?.status==='APPLIED')accepted++;
        else {
          failed++;failureStages.push({targetCountryId:target,stage:'BILATERAL_ACTIVATION',
            requesterStatus:left?.status||null,counterpartyStatus:right?.status||null,
            requesterReason:left?.reason||left?.result?.reason||null,
            counterpartyReason:right?.reason||right?.result?.reason||null});
        }
      }else if(decision.decision==='COUNTER'){
        countered++;
        emit('OMEGA_TREATY_COUNTER_OFFERED',countryId,{targetCountryId:target,terms:decision.terms||{},negotiationId:req.negotiationId});
      }else if(decision.decision==='REJECT')rejected++;
    }
    processedCountryTurns.add(token);
    if(processedCountryTurns.size>512)processedCountryTurns.delete(processedCountryTurns.values().next().value);
    return{status:'COMPLETED',countryId,turn:turn(),scanned:pending.length,processed,accepted,countered,rejected,waiting,failed,
      limit:MAX_PENDING_REVIEWS_PER_COUNTRY,scope:'SCHEDULED_COUNTRY_ONLY',failureStages};
  }

  // Explicit maintenance/test entry point only. Normal committed turns never scan the world roster.
  function processAll(){
    const rows=[];
    for(const countryId of ids())rows.push(processCountry(countryId));
    return{status:'COMPLETED',turn:turn(),countriesScanned:rows.length,
      processed:rows.reduce((sum,row)=>sum+(num(row.processed)||0),0),countryResults:rows};
  }
  function ids(){try{return[...new Set((registry()?.list?.('COUNTRY')||registry()?.list?.()||[]).map(canonical).filter(Boolean))];}catch(_){return Object.keys(state()?.foreign||{}).map(canonical);}}
  let handlerInstallReport={ready:false,registered:0,total:5,actionRegistrationWarnings:[],errors:[]};
  function install(){
    const mesh=interop();
    if(!mesh?.registerCommandHandler){
      handlerInstallReport={ready:false,registered:0,total:5,actionRegistrationWarnings:[],errors:['MINISTRY_COMMAND_REGISTRY_UNAVAILABLE']};
      return false;
    }
    const defs=[
      ['OMEGA_TREATY_REVIEW_NEGOTIATION','foreign',reviewHandler],
      ['OMEGA_TREATY_APPLY_NEGOTIATION_RESPONSE','foreign',applyRequesterHandler],
      ['OMEGA_TREATY_ACTIVATE','foreign',activateHandler],
      ['OMEGA_TREATY_SUSPEND','foreign',(c,x)=>stateChangeHandler(c,x,'SUSPENDED')],
      ['OMEGA_TREATY_TERMINATE','foreign',(c,x)=>stateChangeHandler(c,x,'TERMINATED')]
    ];
    const report={ready:false,registered:0,total:defs.length,actionRegistrationWarnings:[],errors:[]};
    for(const [type,owner,handler] of defs){
      try{mesh.registerAction?.(type,{actionId:type,stateOwnerMinistry:owner,authority:'OMEGA_TREATY_LIFECYCLE'});}
      catch(e){report.actionRegistrationWarnings.push({type,reason:String(e?.message||e)});}
      // The authoritative command handler is independent of optional action metadata.
      // Never skip registration of a real state-mutating handler because its UI/action
      // descriptor could not be registered.
      try{mesh.registerCommandHandler(type,owner,handler);report.registered++;}
      catch(e){report.errors.push({type,reason:String(e?.message||e)});}
    }
    report.ready=report.registered===report.total;
    handlerInstallReport=report;
    return report.ready;
  }
  function installScheduler(){
    const scheduler=g.Omega?.WorldSimulationScheduler||g.OmegaWorldSimulationScheduler||null;
    if(!scheduler||typeof scheduler.registerCountryHandler!=='function')return false;
    if(unregisterSchedulerHandler)return true;
    unregisterSchedulerHandler=scheduler.registerCountryHandler('omega.opponent-treaty-lifecycle',processCountry,
      {tiers:['PLAYER','ACTIVE','MACRO'],priority:25});
    return typeof unregisterSchedulerHandler==='function';
  }
  function init(){
    const handlersReady=install();
    installScheduler();
    if(!g.__omegaTreatyLifecycleInstallHook){
      g.__omegaTreatyLifecycleInstallHook=true;
      g.addEventListener?.('OMEGA_READY',()=>{install();installScheduler();});
      g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',()=>{install();installScheduler();});
    }
    return diagnostics(handlersReady);
  }
  function diagnostics(handlersReady){
    const ready=handlersReady===undefined?handlerInstallReport.ready:!!handlersReady;
    return{version:VERSION,handlerInstalled:ready,registeredCommandHandlers:handlerInstallReport.registered,
      commandHandlerCount:handlerInstallReport.total,registrationErrors:clone(handlerInstallReport.errors),
      actionRegistrationWarnings:clone(handlerInstallReport.actionRegistrationWarnings),
      worldCountryCount:ids().length,schedulerHandlerRegistered:typeof unregisterSchedulerHandler==='function',
      scheduledTiers:['PLAYER','ACTIVE','MACRO'],maxPendingReviewsPerCountryPerTurn:MAX_PENDING_REVIEWS_PER_COUNTRY,
      automaticWorldRosterScan:false};
  }
  const API=Object.freeze({VERSION,TYPES:['REQUESTED','COUNTER_OFFERED','ACCEPTED','ACTIVE','SUSPENDED','TERMINATED'],
    diagnostics,processCountry,processAll,review});
  g.Omega=g.Omega||{};g.Omega.OpponentTreatyLifecycle=API;g.OmegaOpponentTreatyLifecycle=API;try{init();}catch(e){g.OmegaOpponentTreatyLifecycleError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
