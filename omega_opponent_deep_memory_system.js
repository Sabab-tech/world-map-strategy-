/* OMEGA OPPONENT DEEP MEMORY SYSTEM v1.0.0
 * Hierarchical persistent memory for autonomous country behavior.
 * Memory is state-owned by cabinet and written only through StateTransaction.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0';
  const MAX_EPISODES=512,MAX_FACTS=192,MAX_PROCEDURES=192,MAX_RELATIONAL=192,MAX_CAUSAL=192,MAX_FORECASTS=192,MAX_STRATEGIC=96;
  const TYPES=Object.freeze([
    'WORKING','EPISODIC','SEMANTIC','PROCEDURAL','RELATIONAL','STRATEGIC',
    'COUNTERPARTY','CAUSAL','FORECAST','FAILURE','IDENTITY','METACOGNITIVE'
  ]);
  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k],seen);
    return o;
  };
  const id=v=>String(v??'').trim().toUpperCase();
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null;};
  const clamp=(v,a=0,b=1)=>{const x=n(v);return x===null?null:Math.max(a,Math.min(b,x));};
  const turn=()=>{const s=g.Game?.state||g.gameState||{};return n(s?.simulation?.turn??s?.turn??s?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;};
  const state=()=>g.Game?.state||g.gameState||null;
  const canonical=v=>{const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;try{const r=b?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;

  function ensureCountryMemory(root,c){
    if(!root.opponentMemory||typeof root.opponentMemory!=='object')root.opponentMemory={};
    if(!root.opponentMemory[c]||typeof root.opponentMemory[c]!=='object'){
      root.opponentMemory[c]={
        schemaVersion:1,countryId:c,lastTurn:turn(),revision:0,
        identity:{countryId:c,aliases:[],continuity:1},
        working:{activeGoals:[],openProblems:[],activeRequests:[],lastContext:null},
        episodic:[],semantic:[],procedural:[],relational:[],strategic:[],counterparty:{},
        causal:[],forecast:[],failure:[],metacognitive:{uncertainty:[],calibration:[],confidence:0.5},
        consolidation:{lastTurn:0,episodesConsumed:0}
      };
    }
    return root.opponentMemory[c];
  }

  function bounded(a,max){return Array.isArray(a)?a.slice(Math.max(0,a.length-max)):[];}
  function emit(type,c,payload={}){
    const mesh=interop();
    try{
      if(mesh?.emitEvent){
        return mesh.emitEvent(type,canonical(c),'cabinet',{countryId:canonical(c),...clone(payload)},{turn:turn()});
      }
    }catch(_){}
    try{g.dispatchEvent?.(new CustomEvent(type,{detail:{countryId:canonical(c),...clone(payload),simulationTurn:turn()}}));}catch(_){}
    return null;
  }

  function createCommand(commandType,c,payload){
    const mesh=interop();
    if(!mesh?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{
      return mesh.dispatchCommand('cabinet',commandType,canonical(c),payload,{turn:turn(),commandType,correlationId:payload?.correlationId||payload?.decisionId||null});
    }catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
  }

  function actionKey(entry){
    return String(entry?.action||entry?.actionType||entry?.scenarioId||'UNKNOWN').toUpperCase();
  }

  function relationalKey(country,target){return canonical(target)||'UNKNOWN';}

  function recordHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId),root=ctx.stateTransaction.get('cabinet.opponentMemory');
    const all=root&&typeof root==='object'?clone(root):{};
    const m=ensureCountryMemory(all,c);
    const entry={memoryId:String(p.memoryId||('MEM-'+turn()+'-'+c+'-'+(m.revision+1))),
      type:TYPES.includes(String(p.type||'EPISODIC').toUpperCase())?String(p.type).toUpperCase():'EPISODIC',
      simulationTurn:turn(),importance:clamp(p.importance??0.5),sourceEvent:p.sourceEvent||null,
      targetCountryId:p.targetCountryId?canonical(p.targetCountryId):null,
      action:p.action?String(p.action).toUpperCase():null,scenarioId:p.scenarioId||null,
      outcome:p.outcome||null,evidence:clone(p.evidence||null),payload:clone(p.payload||null),confidence:clamp(p.confidence??0.5),
      causal:clone(p.causal||null),tags:Array.isArray(p.tags)?p.tags.map(String).slice(0,16):[]};
    const targetArray=entry.targetCountryId;
    if(entry.type==='IDENTITY'){
      m.identity.aliases=[...new Set([...m.identity.aliases,...(Array.isArray(p.aliases)?p.aliases.map(String):[])])].slice(-64);
      m.identity.continuity=clamp((m.identity.continuity||0)+0.01,0,1);
    }else if(entry.type==='WORKING'){
      m.working={...m.working,...clone(p.working||{}),lastContext:clone(p.payload||m.working.lastContext)};
    }else{
      if(entry.type==='EPISODIC')m.episodic=bounded([...(m.episodic||[]),entry],MAX_EPISODES);
      if(entry.type==='SEMANTIC')m.semantic=bounded([...(m.semantic||[]),entry],MAX_FACTS);
      if(entry.type==='PROCEDURAL')m.procedural=bounded([...(m.procedural||[]),entry],MAX_PROCEDURES);
      if(entry.type==='STRATEGIC')m.strategic=bounded([...(m.strategic||[]),entry],MAX_STRATEGIC);
      if(entry.type==='CAUSAL')m.causal=bounded([...(m.causal||[]),entry],MAX_CAUSAL);
      if(entry.type==='FORECAST')m.forecast=bounded([...(m.forecast||[]),entry],MAX_FORECASTS);
      if(entry.type==='FAILURE')m.failure=bounded([...(m.failure||[]),entry],MAX_EPISODES);
      if(entry.type==='RELATIONAL'){
        m.relational=bounded([...(m.relational||[]),entry],MAX_RELATIONAL);
        if(targetArray){
          const pair=m.counterparty[targetArray]||{targetCountryId:targetArray,attempts:0,accepted:0,rejected:0,counterOffers:0,settled:0,lastOutcome:null,history:[]};
          pair.attempts+=1;
          const oc=String(entry.outcome?.status||entry.outcome||'').toUpperCase();
          if(/ACCEPT|SETTLED|COMPLETED/.test(oc))pair.accepted+=1;
          if(/REJECT|REFUS/.test(oc))pair.rejected+=1;
          if(/COUNTER/.test(oc))pair.counterOffers+=1;
          if(/SETTL/.test(oc))pair.settled+=1;
          pair.lastOutcome=clone(entry.outcome||entry.payload||null);
          pair.history=bounded([...(pair.history||[]),entry],64);
          m.counterparty[targetArray]=pair;
        }
      }
      if(entry.type==='COUNTERPARTY'&&targetArray){
        const pair=m.counterparty[targetArray]||{targetCountryId:targetArray,attempts:0,accepted:0,rejected:0,counterOffers:0,settled:0,lastOutcome:null,history:[]};
        pair.lastOutcome=clone(entry.outcome||entry.payload||null);
        pair.history=bounded([...(pair.history||[]),entry],64);
        m.counterparty[targetArray]=pair;
      }
      if(entry.type==='METACOGNITIVE'){
        m.metacognitive.uncertainty=bounded([...(m.metacognitive.uncertainty||[]),entry],96);
      }
    }
    m.lastTurn=turn();m.revision=(m.revision||0)+1;
    all[c]=m;
    ctx.stateTransaction.set('cabinet.opponentMemory',all);
    emit('OMEGA_MEMORY_UPDATED',c,{memoryId:entry.memoryId,type:entry.type,revision:m.revision,targetCountryId:entry.targetCountryId||null});
    return{accepted:true,memoryId:entry.memoryId,type:entry.type,revision:m.revision};
  }

  function consolidateHandler(cmd,ctx){
    const c=canonical(ctx.countryId),root=ctx.stateTransaction.get('cabinet.opponentMemory');
    const all=root&&typeof root==='object'?clone(root):{},m=ensureCountryMemory(all,c);
    const recent=m.episodic.slice(-96),byAction={};
    for(const e of recent){
      const key=actionKey(e);
      const out=String(e.outcome?.status||e.outcome||'').toUpperCase();
      const x=byAction[key]||{action:key,attempts:0,successes:0,failures:0,lastTurn:0};
      x.attempts+=1;if(/SUCCESS|ACCEPT|APPLIED|SETTLED|COMPLETED/.test(out))x.successes+=1;if(/FAIL|REJECT|BLOCK/.test(out))x.failures+=1;x.lastTurn=Math.max(x.lastTurn,e.simulationTurn||0);byAction[key]=x;
    }
    m.procedural=bounded(Object.values(byAction).map(x=>({...x,successRate:x.attempts?x.successes/x.attempts:0.5,confidence:clamp(Math.min(1,x.attempts/8))})),MAX_PROCEDURES);
    const failures=recent.filter(e=>/FAIL|REJECT|BLOCK/.test(String(e.outcome?.status||e.outcome||'').toUpperCase()));
    m.failure=bounded(failures,MAX_EPISODES);
    const pairFacts=[];
    for(const [target,pair] of Object.entries(m.counterparty||{})){
      const attempts=pair.attempts||0,acceptRate=attempts?pair.accepted/attempts:0.5,rejectRate=attempts?pair.rejected/attempts:0;
      pairFacts.push({type:'COUNTERPARTY_PATTERN',targetCountryId:target,attempts,acceptRate,rejectRate,counterOfferRate:attempts?pair.counterOffers/attempts:0,settlementRate:attempts?pair.settled/attempts:0,simulationTurn:turn(),confidence:clamp(Math.min(1,attempts/10))});
    }
    m.semantic=bounded([...m.semantic,...pairFacts],MAX_FACTS);
    m.consolidation={lastTurn:turn(),episodesConsumed:recent.length};
    m.lastTurn=turn();m.revision=(m.revision||0)+1;
    all[c]=m;ctx.stateTransaction.set('cabinet.opponentMemory',all);
    emit('OMEGA_MEMORY_CONSOLIDATED',c,{revision:m.revision,episodesConsumed:recent.length,procedures:m.procedural.length,counterparties:Object.keys(m.counterparty||{}).length});
    return{accepted:true,revision:m.revision,procedures:m.procedural.length};
  }

  function installHandlers(){
    const mesh=interop();
    if(!mesh?.registerCommandHandler)return false;
    try{
      mesh.registerAction?.('OMEGA_MEMORY_RECORD',{actionId:'OMEGA_MEMORY_RECORD',stateOwnerMinistry:'cabinet',authority:'OMEGA_DEEP_MEMORY'});
      mesh.registerAction?.('OMEGA_MEMORY_CONSOLIDATE',{actionId:'OMEGA_MEMORY_CONSOLIDATE',stateOwnerMinistry:'cabinet',authority:'OMEGA_DEEP_MEMORY'});
      mesh.registerCommandHandler('OMEGA_MEMORY_RECORD','cabinet',recordHandler);
      mesh.registerCommandHandler('OMEGA_MEMORY_CONSOLIDATE','cabinet',consolidateHandler);
      return true;
    }catch(_){return false;}
  }

  function record(c,entry){
    return createCommand('OMEGA_MEMORY_RECORD',c,entry);
  }

  function memory(c){
    const cid=canonical(c),root=state()?.opponentMemory||{};
    return clone(root?.[cid]||ensureCountryMemory(root,cid));
  }

  function scoreAction(c,action,target=null){
    const m=memory(c),a=String(action||'').toUpperCase(),pair=target?m.counterparty?.[canonical(target)]:null;
    const proc=(m.procedural||[]).find(x=>String(x.action||'').toUpperCase()===a);
    let score=0.5;
    if(proc?.attempts)score=0.35+0.65*clamp(proc.successRate??0.5)*clamp(proc.confidence??0.5);
    if(pair){
      const ar=pair.attempts?pair.accepted/pair.attempts:0.5;
      const rr=pair.attempts?pair.rejected/pair.attempts:0;
      score+=(ar-rr)*0.25;
      if(pair.rejected>=3)score-=Math.min(0.25,pair.rejected*0.03);
      if(pair.counterOffers>=2)score+=0.03;
      if(pair.settled>=2)score+=0.05;
    }
    const failures=(m.failure||[]).filter(x=>String(x.action||'').toUpperCase()===a).slice(-8);
    score-=Math.min(0.18,failures.length*0.02);
    return {score:clamp(score),confidence:proc?.confidence??0.5,procedural:clone(proc||null),pair:clone(pair||null)};
  }

  function relationInsight(c,target){
    const m=memory(c),p=m.counterparty?.[canonical(target)];
    if(!p)return{known:false,attempts:0,acceptRate:null,rejectRate:null,settlementRate:null};
    const attempts=p.attempts||0;
    return{known:true,attempts,acceptRate:attempts?p.accepted/attempts:null,rejectRate:attempts?p.rejected/attempts:null,settlementRate:attempts?p.settled/attempts:null,counterOffers:p.counterOffers||0,lastOutcome:clone(p.lastOutcome||null)};
  }

  function installEventMemory(){
    if(g.__omegaDeepMemoryEventsV1)return true;
    g.__omegaDeepMemoryEventsV1=true;
    const types=[
      'OMEGA_AUTONOMY_DECISION_CREATED','OMEGA_AUTONOMY_PLAN_CREATED','OMEGA_AUTONOMY_ACTION_DISPATCHED',
      'OMEGA_AUTONOMY_RESERVATION_CREATED','OMEGA_AUTONOMY_RESERVATION_RELEASED',
      'OMEGA_RESOURCE_IMPORT_REQUEST_SENT','OMEGA_TRADE_REQUEST_ACCEPTED','OMEGA_TRADE_REQUEST_REJECTED',
      'OMEGA_TRADE_COUNTER_OFFERED','OMEGA_TRADE_SETTLEMENT_COMPLETED','OMEGA_TRADE_SETTLEMENT_FAILED',
      'OMEGA_TRADE_PRESSURE_APPLIED','OMEGA_PROJECT_CONSTRUCTION_COMPLETED',
      'OMEGA_HOUSING_CAPACITY_CHANGED','OMEGA_FACTORY_CAPACITY_CHANGED',
      'OMEGA_MILITARY_RECRUITMENT_APPLIED','OMEGA_MILITARY_TRAINING_APPLIED',
      'OMEGA_MILITARY_EQUIPMENT_APPLIED','OMEGA_TREATY_NEGOTIATION_STARTED',
      'OMEGA_THREAT_ASSESSMENT_CREATED'
    ];
    for(const type of types){
      g.addEventListener?.(type,e=>{
        const d=e?.detail||{},c=canonical(d.countryId||d.payload?.countryId);
        if(!c)return;
        const target=d.targetCountryId||d.payload?.targetCountryId||d.payload?.supplierCountryId||null;
        const outcome=d.executorResult||d.result||d.payload||d;
        const status=String(d.status||outcome?.status||outcome?.executionState||'OBSERVED').toUpperCase();
        const failure=/FAIL|REJECT|BLOCK/.test(status);
        const kind=/TRADE|IMPORT/.test(type)?(target?'RELATIONAL':'EPISODIC'):(failure?'FAILURE':'EPISODIC');
        record(c,{type:kind,sourceEvent:type,targetCountryId:target,action:d.action||d.payload?.action||null,
          scenarioId:d.scenarioId||d.payload?.scenarioId||null,outcome:{status,event:type},evidence:{payload:clone(d)},confidence:failure?0.85:0.6,
          importance:/THREAT|TRADE|TREATY/.test(type)?.8:.5,tags:[type]});
      });
    }
    return true;
  }

  function tick(){
    const ids=(g.OmegaCanonicalIdentityRegistry?.list?.('COUNTRY')||g.OmegaCountrySemanticBridge?.list?.('COUNTRY')||[]).map(canonical).filter(Boolean);
    const root=state()?.opponentMemory||{};
    for(const c of ids){
      const m=root[c];
      if(m&&turn()-(m.consolidation?.lastTurn||0)>=8)createCommand('OMEGA_MEMORY_CONSOLIDATE',c,{correlationId:'MEM-CONSOLIDATE-'+turn()+'-'+c});
    }
  }

  function diagnostics(){
    const root=state()?.opponentMemory||{};
    const countries=Object.keys(root).length;
    let episodes=0,relations=0;
    for(const m of Object.values(root)){episodes+=Array.isArray(m.episodic)?m.episodic.length:0;relations+=Object.keys(m.counterparty||{}).length;}
    return{version:VERSION,types:TYPES.slice(),handlerInstalled:true,eventHooksInstalled:!!g.__omegaDeepMemoryEventsV1,countries,episodes,relationshipProfiles:relations};
  }

  function init(){
    installHandlers();installEventMemory();
    if(!g.__omegaDeepMemoryTickV1){
      g.__omegaDeepMemoryTickV1=true;
      g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',tick);
      g.addEventListener?.('OMEGA_READY',()=>{installHandlers();installEventMemory();});
      g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',()=>{installHandlers();installEventMemory();});
    }
    return diagnostics();
  }

  const API=Object.freeze({
    VERSION,TYPES,diagnostics,record,memory,scoreAction,relationInsight,consolidate:(c)=>createCommand('OMEGA_MEMORY_CONSOLIDATE',c,{})
  });
  g.Omega=g.Omega||{};g.Omega.OpponentDeepMemory=API;g.OmegaOpponentDeepMemory=API;
  try{init();}catch(e){g.OmegaOpponentDeepMemoryError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
