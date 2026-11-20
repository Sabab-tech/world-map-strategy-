/* OMEGA MEMORY TRACE & AUDIT LOG SYSTEM v1.0.0
 * Dedicated persistence/causal trace layer for opponent memory.
 * Memory state and memory-log state are separate authoritative stores.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0',MAX_PER_COUNTRY=768,MAX_GLOBAL=4096;
  const TYPES=Object.freeze([
    'MEMORY_WRITE','MEMORY_CONSOLIDATE','DECISION_OBSERVED','PLAN_OBSERVED',
    'ACTION_OBSERVED','OUTCOME_OBSERVED','COUNTERPARTY_OBSERVED','CAUSAL_OBSERVED',
    'INTELLIGENCE_OBSERVED','TRADE_OBSERVED','TREATY_OBSERVED','EXTRACTION_OBSERVED',
    'RESERVATION_OBSERVED','SYSTEM_OBSERVED'
  ]);
  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);
    return o;
  };
  const id=v=>String(v??'').trim().toUpperCase();
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null;};
  const stable=v=>{
    if(v===null||typeof v!=='object')return JSON.stringify(v);
    if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
    return '{'+Object.keys(v).filter(k=>k!=='__proto__'&&k!=='constructor').sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
  };
  const hash=v=>{const s=stable(v);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return ('00000000'+(h>>>0).toString(16)).slice(-8);};
  const state=()=>g.Game?.state||g.gameState||{};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const turn=()=>n(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
  function emit(type,c,payload={},commandId=null,correlationId=null){
    const m=interop();if(!m?.emitEvent)return null;
    try{return m.emitEvent(type,canonical(c),'cabinet',{countryId:canonical(c),...clone(payload)},{turn:turn(),causationId:commandId,correlationId});}catch(_){return null;}
  }
  function command(c,payload){
    const m=interop();if(!m?.dispatchCommand)return{status:'UNAVAILABLE'};
    try{return m.dispatchCommand('cabinet','OMEGA_MEMORY_LOG_APPEND',canonical(c),payload,{turn:turn(),commandType:'OMEGA_MEMORY_LOG_APPEND',correlationId:payload?.chainId||payload?.traceId||null});}catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
  }
  function classify(eventType,payload){
    const t=String(eventType||'').toUpperCase();
    if(t==='OMEGA_MEMORY_UPDATED')return'MEMORY_WRITE';
    if(t==='OMEGA_MEMORY_CONSOLIDATED')return'MEMORY_CONSOLIDATE';
    if(/DECISION/.test(t))return'DECISION_OBSERVED';
    if(/PLAN/.test(t))return'PLAN_OBSERVED';
    if(/TRADE|IMPORT|SETTLEMENT|SHIPMENT/.test(t))return'TRADE_OBSERVED';
    if(/TREATY/.test(t))return'TREATY_OBSERVED';
    if(/THREAT|INTELLIGENCE/.test(t))return'INTELLIGENCE_OBSERVED';
    if(/EXTRACTION|RESOURCE_/.test(t))return'EXTRACTION_OBSERVED';
    if(/RESERVATION/.test(t))return'RESERVATION_OBSERVED';
    return'SYSTEM_OBSERVED';
  }
  function appendHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId);
    if(!p.sourceEvent&&!p.operation)return{accepted:false,reason:'MEMORY_TRACE_SOURCE_REQUIRED'};
    const raw=ctx.stateTransaction.get('cabinet.memoryTraceLog');
    const root=raw&&typeof raw==='object'?clone(raw):{schemaVersion:1,sequence:0,byCountry:{},byTrace:{}};
    if(!root.byCountry||typeof root.byCountry!=='object')root.byCountry={};
    if(!root.byTrace||typeof root.byTrace!=='object')root.byTrace={};
    const sourceEvent=String(p.sourceEvent||p.operation||'UNKNOWN');
    const chainId=String(p.chainId||p.correlationId||p.decisionId||('CHAIN-'+turn()+'-'+c+'-'+hash({sourceEvent,payload:p.payload||p})));
    const previous=Array.isArray(root.byCountry[c])?root.byCountry[c].slice():[];
    const parentTraceId=p.parentTraceId||[...previous].reverse().find(x=>x.chainId===chainId)?.traceId||null;
    root.sequence=n(root.sequence)||0;
    root.sequence+=1;
    const traceId=String(p.traceId||('MEMTRACE-'+turn()+'-'+c+'-'+root.sequence+'-'+hash({chainId,sourceEvent,sequence:root.sequence})));
    const entry={
      traceId,chainId,parentTraceId,countryId:c,memoryId:p.memoryId||null,memoryType:p.memoryType||null,
      operation:p.operation||classify(sourceEvent,p),simulationTurn:turn(),sequence:root.sequence,
      sourceEvent,sourceEventId:p.sourceEventId||p.eventId||null,sourceCommandId:p.sourceCommandId||p.commandId||cmd.commandId,
      correlationId:p.correlationId||null,decisionId:p.decisionId||null,action:p.action||null,targetCountryId:p.targetCountryId?canonical(p.targetCountryId):null,
      status:String(p.status||'OBSERVED').toUpperCase(),
      inputDigest:hash(p.input||p.payload||{}),outputDigest:hash(p.output||p.payload||{}),
      memoryRevision:n(p.memoryRevision),payloadSnapshot:clone(p.payload||null),evidence:clone(p.evidence||null),causality:clone(p.causality||null),
      provenance:{logger:'OMEGA_MEMORY_TRACE_LOG',version:VERSION,simulationTurn:turn()}
    };
    const countryNext=previous.concat([entry]).slice(-MAX_PER_COUNTRY);
    root.byCountry[c]=countryNext;
    root.byTrace[traceId]={countryId:c,sequence:entry.sequence,simulationTurn:entry.simulationTurn};
    const countries=Object.keys(root.byCountry).sort();
    let total=0;for(const x of countries)total+=Array.isArray(root.byCountry[x])?root.byCountry[x].length:0;
    while(total>MAX_GLOBAL){
      const oldest=Object.entries(root.byCountry).flatMap(([country,rows])=>(Array.isArray(rows)?rows:[]).map(row=>({country,row}))).sort((a,b)=>a.row.sequence-b.row.sequence)[0];
      if(!oldest)break;
      root.byCountry[oldest.country]=root.byCountry[oldest.country].filter(x=>x.traceId!==oldest.row.traceId);
      delete root.byTrace[oldest.row.traceId];total-=1;
    }
    ctx.stateTransaction.set('cabinet.memoryTraceLog',root);
    emit('OMEGA_MEMORY_TRACE_APPEND',c,{traceId,chainId,parentTraceId,sourceEvent,memoryId:entry.memoryId,sequence:entry.sequence,memoryRevision:entry.memoryRevision},cmd.commandId,entry.correlationId);
    return{accepted:true,traceId,chainId,parentTraceId,sequence:entry.sequence};
  }
  function installHandlers(){
    const m=interop();if(!m?.registerCommandHandler)return false;
    try{
      m.registerAction?.('OMEGA_MEMORY_LOG_APPEND',{actionId:'OMEGA_MEMORY_LOG_APPEND',stateOwnerMinistry:'cabinet',authority:'OMEGA_MEMORY_TRACE_LOG'});
      m.registerCommandHandler('OMEGA_MEMORY_LOG_APPEND','cabinet',appendHandler);
      return true;
    }catch(_){return false;}
  }
  function observe(type,e){
    const d=e?.detail||{},p=d.payload||d,c=canonical(d.countryId||p.countryId);if(!c)return;
    const memoryEvent=type==='OMEGA_MEMORY_UPDATED'||type==='OMEGA_MEMORY_CONSOLIDATED';
    const decisionId=d.decisionId||p.decisionId||null;
    const action=d.action||p.action||null;
    const target=d.targetCountryId||p.targetCountryId||p.supplierCountryId||null;
    const traceId=p.traceId||null;
    command(c,{
      traceId,chainId:d.correlationId||p.correlationId||d.causationId||p.causationId||decisionId||null,
      parentTraceId:p.parentTraceId||null,memoryId:p.memoryId||null,memoryType:p.type||p.memoryType||(memoryEvent?'MEMORY':null),
      operation:classify(type,p),simulationTurn:turn(),sourceEvent:type,sourceEventId:d.eventId||null,sourceCommandId:d.causationId||p.sourceCommandId||null,
      correlationId:d.correlationId||p.correlationId||null,decisionId,action,targetCountryId:target,
      memoryRevision:p.revision||null,status:d.status||p.status||'OBSERVED',payload:clone(p),input:p.input,output:p.output,
      evidence:p.evidence||null,causality:p.causal||p.causality||null
    });
  }
  function init(){
    installHandlers();
    if(g.__omegaMemoryTraceHooks)return diagnostics();
    g.__omegaMemoryTraceHooks=true;
    const events=[
      'OMEGA_MEMORY_UPDATED','OMEGA_MEMORY_CONSOLIDATED','OMEGA_AUTONOMY_DECISION_CREATED','OMEGA_AUTONOMY_PLAN_CREATED',
      'OMEGA_AUTONOMY_ACTION_DISPATCHED','OMEGA_AUTONOMY_RESERVATION_CREATED','OMEGA_AUTONOMY_RESERVATION_RELEASED',
      'OMEGA_RESOURCE_IMPORT_REQUEST_SENT','OMEGA_TRADE_REQUEST_ACCEPTED','OMEGA_TRADE_REQUEST_REJECTED',
      'OMEGA_TRADE_COUNTER_OFFERED','OMEGA_TRADE_SHIPMENT_CREATED','OMEGA_TRADE_SETTLEMENT_COMPLETED',
      'OMEGA_TRADE_SETTLEMENT_FAILED','OMEGA_TRADE_PRESSURE_APPLIED','OMEGA_TREATY_NEGOTIATION_STARTED',
      'OMEGA_TREATY_COUNTER_OFFERED','OMEGA_TREATY_ACCEPTED','OMEGA_TREATY_REJECTED','OMEGA_TREATY_RATIFIED',
      'OMEGA_TREATY_IMPLEMENTED','OMEGA_TREATY_SUSPENDED','OMEGA_TREATY_TERMINATED',
      'OMEGA_THREAT_ASSESSMENT_CREATED','OMEGA_INTELLIGENCE_BELIEF_UPDATED',
      'OMEGA_RESOURCE_EXTRACTION_COMPLETED','OMEGA_RESOURCE_EXTRACTION_BLOCKED'
    ];
    for(const type of events)g.addEventListener?.(type,e=>observe(type,e));
    g.addEventListener?.('OMEGA_READY',installHandlers);
    g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',installHandlers);
    return diagnostics();
  }
  function trace(c,traceId){
    const cid=canonical(c),root=state()?.cabinet?.[cid]?.memoryTraceLog||{},all=root.byCountry?.[cid]||[];
    return traceId?clone(all.filter(x=>x.traceId===String(traceId)||x.chainId===String(traceId)||x.parentTraceId===String(traceId)).sort((a,b)=>a.sequence-b.sequence)):clone(all.sort((a,b)=>a.sequence-b.sequence));
  }
  function replay(c,chainId){
    const cid=canonical(c),all=state()?.cabinet?.[cid]?.memoryTraceLog?.byCountry?.[cid]||[];
    const rows=all.filter(x=>x.chainId===String(chainId)||x.traceId===String(chainId)||x.parentTraceId===String(chainId));
    return{countryId:cid,chainId:String(chainId),entries:clone(rows.sort((a,b)=>a.sequence-b.sequence)),complete:rows.length>0};
  }
  function diagnostics(){
    const cabinet=state()?.cabinet||{};let entries=0,countries=0;
    for(const bucket of Object.values(cabinet)){
      const root=bucket?.memoryTraceLog;if(!root||typeof root!=='object')continue;
      const byCountry=root.byCountry||{};countries+=Object.keys(byCountry).length;
      for(const rows of Object.values(byCountry))entries+=Array.isArray(rows)?rows.length:0;
    }
    return{version:VERSION,handlerInstalled:!!interop()?.commandHandlers?.has?.('OMEGA_MEMORY_LOG_APPEND')||!!g.__omegaMemoryTraceHooks,
      hookInstalled:!!g.__omegaMemoryTraceHooks,countries,entries};
  }
  const API=Object.freeze({VERSION,TYPES,diagnostics,trace,replay,append:(c,p)=>command(c,p)});
  g.Omega=g.Omega||{};g.Omega.MemoryTraceLog=API;g.OmegaMemoryTraceLog=API;
  try{init();}catch(e){g.OmegaMemoryTraceLogError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
