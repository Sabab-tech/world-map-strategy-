/* OMEGA OPPONENT INTELLIGENCE EVOLUTION SYSTEM v1.0.0
 * Persistent target beliefs, source history, conflict tracking and uncertainty.
 * No missing evidence is converted into facts.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0',MAX_HISTORY=192;
  const clone=(v,seen=new WeakMap())=>{if(v===null||typeof v!=='object')return v;if(seen.has(v))return seen.get(v);if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function')o[k]=clone(v[k],seen);return o;};
  const id=v=>String(v??'').trim().toUpperCase();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const clamp=(v,a=0,b=1)=>{const n=num(v);return n===null?null:Math.max(a,Math.min(b,n));};
  const state=()=>g.Game?.state||g.gameState||{};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
  const levelScore=v=>{const s=String(v??'').toUpperCase();return ({LOW:.25,MODERATE:.5,MEDIUM:.5,HIGH:.75,CRITICAL:.95,SEVERE:.9})[s]??num(v);};
  function bucket(c){const cid=canonical(c),root=state()?.intelligence;if(!root||typeof root!=='object')return null;const k=root[cid]!==undefined?cid:Object.keys(root).find(x=>id(x)===cid);return k===undefined?null:root[k];}
  function belief(c,target){
    const b=bucket(c),t=canonical(target);
    return b?.opponentBeliefs?.[t]?clone(b.opponentBeliefs[t]):null;
  }
  function fuse(c,target,assessment){
    const old=belief(c,target),current=clone(assessment||{});
    if(!old)return current;
    const oldScore=levelScore(old.threatLevel),newScore=levelScore(current.threatLevel);
    if(oldScore===null&&newScore===null){current.confidence=clamp((num(old.confidence)||0)*.4+(num(current.confidence)||0)*.6);return current;}
    const wc=clamp(num(old.confidence)||0);const wn=clamp(num(current.confidence)||0);
    const total=(wc+wn)||1;
    const blended=((oldScore??0.5)*wc+(newScore??0.5)*wn)/total;
    current.beliefScore=Number(blended.toFixed(6));
    current.priorThreat=old.threatLevel??null;
    current.confidence=Number(clamp(Math.max(wc,wn)*0.9).toFixed(6));
    current.historyCount=(old.historyCount||0)+1;
    current.conflictRisk=old.lastThreatLevel&&current.threatLevel&&String(old.lastThreatLevel)!==String(current.threatLevel)?0.5:0;
    current.sourceReliabilityHistory=clone(old.sourceReliabilityHistory||{});
    current.lastBeliefTurn=turn();
    return current;
  }
  function recordHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId),target=canonical(p.targetCountryId);
    if(!target)return{accepted:false,reason:'INTELLIGENCE_TARGET_REQUIRED'};
    const assessment=clone(p.assessment||{});
    const intelligence=ctx.stateTransaction.get('intelligence');
    const next=intelligence&&typeof intelligence==='object'?clone(intelligence):{};
    const beliefs=next.opponentBeliefs&&typeof next.opponentBeliefs==='object'?clone(next.opponentBeliefs):{};
    const old=beliefs[target]||null;
    const history=Array.isArray(old?.history)?old.history:[];
    const sources=clone(old?.sourceReliabilityHistory||{});
    for(const e of Array.isArray(assessment.evidence)?assessment.evidence:[]){
      const sid=String(e?.sourceId??e?.source??e?.type??'UNKNOWN_SOURCE');
      const rel=clamp(e?.sourceReliability);
      if(rel!==null)sources[sid]=rel;
    }
    const fused=fuse(c,target,assessment);
    beliefs[target]={
      countryId:c,targetCountryId:target,lastThreatLevel:assessment.threatLevel??null,
      beliefScore:fused.beliefScore??levelScore(assessment.threatLevel),
      confidence:clamp(fused.confidence??assessment.confidence??0),
      intent:assessment.intent??null,capability:assessment.capability??null,
      timeHorizon:assessment.timeHorizon??null,possibleVectors:clone(assessment.possibleVectors||[]),
      uncertainty:assessment.uncertainty??null,
      deceptionRisk:clamp(assessment.deceptionRisk??0),
      conflictRisk:clamp(fused.conflictRisk??0),
      historyCount:(old?.historyCount||0)+1,
      sourceReliabilityHistory:sources,
      history:history.concat([{simulationTurn:turn(),assessment,conflictRisk:fused.conflictRisk??0}]).slice(-MAX_HISTORY)
    };
    next.opponentBeliefs=beliefs;
    const ts=Array.isArray(next.timeSeries)?next.timeSeries:[];
    next.timeSeries=ts.concat([{simulationTurn:turn(),targetCountryId:target,threatLevel:assessment.threatLevel??null,confidence:assessment.confidence??null}]).slice(-MAX_HISTORY);
    ctx.stateTransaction.set('intelligence',next);
    try{interop()?.emitEvent?.('OMEGA_INTELLIGENCE_BELIEF_UPDATED',c,'intelligence',{countryId:c,targetCountryId:target,belief:beliefs[target]},{turn:turn(),causationId:cmd.commandId});}catch(_){}
    return{accepted:true,targetCountryId:target,belief:beliefs[target]};
  }
  function pressureHandler(cmd,ctx){
    const p=cmd?.payload||{},source=canonical(p.sourceCountryId),level=num(p.level);
    if(!source)return{accepted:false,reason:'PRESSURE_SOURCE_REQUIRED'};
    const intelligence=ctx.stateTransaction.get('intelligence');
    const next=intelligence&&typeof intelligence==='object'?clone(intelligence):{};
    const signals=next.receivedPressureSignals&&typeof next.receivedPressureSignals==='object'?clone(next.receivedPressureSignals):{};
    const row=signals[source]&&typeof signals[source]==='object'?signals[source]:{count:0,history:[]};
    row.count=(row.count||0)+1;row.lastTurn=turn();row.level=(num(row.level)||0)+(level??1);
    row.history=(Array.isArray(row.history)?row.history:[]).concat([{turn:turn(),level:level??1,requestId:p.requestId||null}]).slice(-MAX_HISTORY);
    signals[source]=row;next.receivedPressureSignals=signals;ctx.stateTransaction.set('intelligence',next);
    return{accepted:true,sourceCountryId:source,signal:row};
  }

  function install(){
    const m=interop();if(!m?.registerCommandHandler)return false;
    try{
      m.registerAction?.('OMEGA_INTELLIGENCE_RECORD_ASSESSMENT',{actionId:'OMEGA_INTELLIGENCE_RECORD_ASSESSMENT',stateOwnerMinistry:'intelligence',authority:'OMEGA_INTELLIGENCE_EVOLUTION'});
      m.registerAction?.('OMEGA_INTELLIGENCE_RECORD_PRESSURE',{actionId:'OMEGA_INTELLIGENCE_RECORD_PRESSURE',stateOwnerMinistry:'intelligence',authority:'OMEGA_INTELLIGENCE_EVOLUTION'});
      m.registerCommandHandler('OMEGA_INTELLIGENCE_RECORD_ASSESSMENT','intelligence',recordHandler);
      m.registerCommandHandler('OMEGA_INTELLIGENCE_RECORD_PRESSURE','intelligence',pressureHandler);
      return true;
    }catch(_){return false;}
  }
  function onPressure(e){
    const d=e?.detail||{},p=d.payload||d,source=canonical(p.countryId),target=canonical(p.targetCountryId),level=num(p.level);
    if(!source||!target)return;
    try{interop()?.dispatchCommand('intelligence','OMEGA_INTELLIGENCE_RECORD_PRESSURE',target,{sourceCountryId:source,level:level??1,requestId:p.requestId||null},{turn:turn(),commandType:'OMEGA_INTELLIGENCE_RECORD_PRESSURE',correlationId:d.eventId||null});}catch(_){}
  }
  function onThreat(e){
    const d=e?.detail||{},p=d.payload||d,c=canonical(d.countryId||p.countryId),target=canonical(p.targetCountryId);
    if(!c||!target)return;
    const assessment={threatLevel:p.threatLevel??null,confidence:num(p.confidence),intent:p.intent??null,capability:p.capability??null,
      timeHorizon:p.timeHorizon??null,possibleVectors:clone(p.possibleVectors||[]),uncertainty:num(p.uncertainty),
      deceptionRisk:num(p.deceptionRisk),evidence:clone(p.evidence||[])};
    try{interop()?.dispatchCommand('intelligence','OMEGA_INTELLIGENCE_RECORD_ASSESSMENT',c,{targetCountryId:target,assessment},{turn:turn(),commandType:'OMEGA_INTELLIGENCE_RECORD_ASSESSMENT',correlationId:d.eventId||null});}catch(_){}
  }
  function diagnostics(){
    let countries=0,beliefs=0;
    for(const c of Object.keys(state()?.intelligence||{})){countries++;beliefs+=Object.keys(state().intelligence[c]?.opponentBeliefs||{}).length;}
    return{version:VERSION,handlerInstalled:true,countries,beliefs};
  }
  function init(){install();if(!g.__omegaIntelHook){g.__omegaIntelHook=true;g.addEventListener?.('OMEGA_THREAT_ASSESSMENT_CREATED',onThreat);g.addEventListener?.('OMEGA_READY',install);g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',install);}return diagnostics();}
  const API=Object.freeze({VERSION,diagnostics,belief,fuse});
  g.Omega=g.Omega||{};g.Omega.OpponentIntelligenceEvolution=API;g.OmegaOpponentIntelligenceEvolution=API;try{init();}catch(e){g.OmegaOpponentIntelligenceEvolutionError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
