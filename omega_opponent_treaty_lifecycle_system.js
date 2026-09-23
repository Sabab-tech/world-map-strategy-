/* OMEGA OPPONENT TREATY LIFECYCLE SYSTEM v1.0.0
 * One deterministic bilateral treaty state machine.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0',MAX=256;
  const clone=(v,seen=new WeakMap())=>{if(v===null||typeof v!=='object')return v;if(seen.has(v))return seen.get(v);if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);return o;};
  const id=v=>String(v??'').trim().toUpperCase();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const clamp=(v,a=0,b=1)=>{const n=num(v);return n===null?null:Math.max(a,Math.min(b,n));};
  const state=()=>g.Game?.state||g.gameState||{};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
  function bucket(c,domain='foreign'){
    const cid=canonical(c),s=state(),d=s?.[domain];
    if(!d||typeof d!=='object')return null;
    const k=d[cid]!==undefined?cid:Object.keys(d).find(x=>id(x)===cid);
    return k===undefined?null:d[k];
  }
  function relation(a,b){
    const x=canonical(a),y=canonical(b);
    return bucket(x,'foreign')?.relations?.[y]??bucket(x,'relations')?.[y]??bucket(y,'foreign')?.relations?.[x]??bucket(y,'relations')?.[x]??null;
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
      command('foreign','OMEGA_TREATY_ACTIVATE',c,{negotiationId:p.negotiationId||p.decisionId||null,targetCountryId:target,terms:n.counterTerms||n.terms||{},treatyType:n.treatyType||'BILATERAL_AGREEMENT'});
      command('foreign','OMEGA_TREATY_ACTIVATE',target,{negotiationId:p.negotiationId||p.decisionId||null,targetCountryId:c,terms:n.counterTerms||n.terms||{},treatyType:n.treatyType||'BILATERAL_AGREEMENT'});
      return{accepted:true,status:'ACCEPTED'};
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
  function processAll(){
    for(const c of ids()){
      const f=bucket(c,'foreign');const neg=f?.negotiations;
      if(!neg||typeof neg!=='object')continue;
      for(const [targetKey,n] of Object.entries(neg)){
        const target=canonical(targetKey);
        if(String(n.status||'').toUpperCase()==='REQUESTED'&&num(n.createdTurn)!==turn()){
          const req={...clone(n),countryId:canonical(c),targetCountryId:target,negotiationId:n.negotiationId||n.decisionId||'NEG-'+turn()+'-'+c+'-'+target};
          const reviewResult=command('foreign','OMEGA_TREATY_REVIEW_NEGOTIATION',target,{request:req});
          if(reviewResult?.status!=='APPLIED')continue;
          const d=reviewResult.result?.decision;
          if(!d||d.decision==='WAITING_DATA')continue;
          const requesterResult=command('foreign','OMEGA_TREATY_APPLY_NEGOTIATION_RESPONSE',c,{targetCountryId:target,decision:d.decision,terms:d.terms||n.terms||{},negotiationId:req.negotiationId});
          if(d.decision==='ACCEPT') {
            /* The requester accepts the counterpart's acceptance, activating both sides through two owner transactions. */
          } else if(d.decision==='COUNTER') {
            emit('OMEGA_TREATY_COUNTER_OFFERED',c,{targetCountryId:target,terms:d.terms||{},negotiationId:req.negotiationId});
          }
        }
      }
    }
  }
  function ids(){try{return[...new Set((registry()?.list?.('COUNTRY')||registry()?.list?.()||[]).map(canonical).filter(Boolean))];}catch(_){return Object.keys(state()?.foreign||{}).map(canonical);}}
  function install(){
    const mesh=interop();if(!mesh?.registerCommandHandler)return false;
    const defs=[
      ['OMEGA_TREATY_REVIEW_NEGOTIATION','foreign',reviewHandler],
      ['OMEGA_TREATY_APPLY_NEGOTIATION_RESPONSE','foreign',applyRequesterHandler],
      ['OMEGA_TREATY_ACTIVATE','foreign',activateHandler],
      ['OMEGA_TREATY_SUSPEND','foreign',(c,x)=>stateChangeHandler(c,x,'SUSPENDED')],
      ['OMEGA_TREATY_TERMINATE','foreign',(c,x)=>stateChangeHandler(c,x,'TERMINATED')]
    ];
    try{for(const [t,o,h] of defs){mesh.registerAction?.(t,{actionId:t,stateOwnerMinistry:o,authority:'OMEGA_TREATY_LIFECYCLE'});mesh.registerCommandHandler(t,o,h);}return true;}catch(_){return false;}
  }
  function init(){install();if(!g.__omegaTreatyTurnHook){g.__omegaTreatyTurnHook=true;g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',processAll);g.addEventListener?.('OMEGA_READY',install);g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',install);}return diagnostics();}
  function diagnostics(){return{version:VERSION,handlerInstalled:true,worldCountryCount:ids().length};}
  const API=Object.freeze({VERSION,TYPES:['REQUESTED','COUNTER_OFFERED','ACCEPTED','ACTIVE','SUSPENDED','TERMINATED'],diagnostics,processAll,review});
  g.Omega=g.Omega||{};g.Omega.OpponentTreatyLifecycle=API;g.OmegaOpponentTreatyLifecycle=API;try{init();}catch(e){g.OmegaOpponentTreatyLifecycleError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
