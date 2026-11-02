/* OMEGA WORLD SIMULATION SCHEDULER v1.0.0
 * One authoritative turn driver for player, active and global country work.
 * Existing country systems remain authoritative; no duplicate clock or economy.
 */
(function (g) {
  'use strict';
  const VERSION = '1.1.0';
  const LIMITS = Object.freeze({ MACRO_COUNTRIES_PER_TURN:8, ACTIVE_COUNTRIES_PER_TURN:4, MAX_ACTIVE_COUNTRIES:48, ACTIVE_TTL_TURNS:30, MAX_EVENTS_PER_TURN:16, MAX_EVENT_QUEUE:256, MAX_SEEN_EVENT_IDS:512, MAX_QUEUED_DECISIONS_PER_COUNTRY:1, ROSTER_REFRESH_TURNS:30, COUNTRY_EVALUATIONS_PER_YIELD:2, COUNTRY_BATCH_BUDGET_MS:8, EVENT_BATCH_BUDGET_MS:6, MOBILE_TURN_BUDGET_MS:28, DESKTOP_TURN_BUDGET_MS:52 });
  if (g.Omega?.WorldSimulationScheduler?.VERSION === VERSION) return;
  const EVENT_PATTERN = /TRADE|DIPLOMAC|FOREIGN|TREATY|WAR|SANCTION|CONFLICT|BORDER|PROJECT|MILITARY|IMPORT|EXPORT|SETTLEMENT/i;
  const ACTIVE_PROJECT_STATES = new Set(['UNDER_CONSTRUCTION','COMMISSIONING']);
  const ACTIVE_TRADE_STATES = new Set(['SENT','ACCEPTED','COUNTER_OFFERED','SETTLEMENT_PREPARING','PENDING_SETTLEMENT']);
  const PRIORITY = Object.freeze({WAR:100,CONFLICT:95,SANCTION:90,TREATY:75,SETTLEMENT:75,DIPLOMAC:70,TRADE:65,IMPORT:65,EXPORT:60,MILITARY:55,PROJECT:45,FOREIGN:40});
  const eventQueue=[],seenEventIds=new Set(),seenOrder=[],eventHandlers=new Map(),countryHandlers=new Map();
  let eventStateOwner=null;
  let eventSequence=0,countryHandlerSequence=0,eventHandlerSequence=0,turnUnregister=null,ledgerUnsubscribe=null,installed=false,lastBatch=null,totalEvaluated=0,totalQueued=0,totalEvaluationErrors=0,totalYieldCount=0,eventOverflowCount=0,lastPlayerCountryId=null;
  const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const num=(v,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback;};
  const clone=(v,seen=new WeakMap())=>{if(v===null||typeof v!=='object')return v;if(seen.has(v))return seen.get(v);if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function')o[k]=clone(v[k],seen);return o;};
  const sim=()=>g.Omega?.Simulation||g.Omega?.SimulationRuntime||null;
  const state=()=>sim()?.world?.state||g.Game?.state||g.gameState||null;
  const turnOf=ctx=>Math.max(0,Math.floor(num(ctx?.turn??ctx?.event?.simulationTurn??state()?.simulation?.turn??sim()?.clock?.turn)));
  const clockNow=()=>{try{const n=Number(g.performance?.now?.());if(Number.isFinite(n))return n;}catch(_){}return Date.now();};
  function constrainedDevice(){const nav=g.navigator||{},ua=String(nav.userAgent||'');return /Android|iPhone|iPad|Mobile/i.test(ua)||num(nav.deviceMemory,8)<=4||num(nav.hardwareConcurrency,8)<=4;}
  function yieldToBrowser(){
    totalYieldCount++;
    return new Promise(resolve=>{
      if(typeof g.requestIdleCallback==='function'){
        try{g.requestIdleCallback(()=>resolve(),{timeout:80});return;}catch(_){}
      }
      if(typeof g.setTimeout==='function'){g.setTimeout(resolve,0);return;}
      Promise.resolve().then(resolve);
    });
  }
  function countryId(value){
    let raw=value;if(isObject(raw))raw=raw.countryCode||raw.iso2||raw.iso3||raw.countryId||raw.code||raw.id||raw.name;
    if(raw==null||String(raw).trim()==='')return null;const source=String(raw).trim();
    try{const p=g.OmegaCountryRuntimeData?.resolveCountry?.(source);if(p?.countryCode)return String(p.countryCode).toUpperCase();}catch(_){}
    const bridge=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge;
    try{const p=bridge?.resolveCountry?.(source);if(p?.countryCode)return String(p.countryCode).toUpperCase();if(p?.raw?.countryCode)return String(p.raw.countryCode).toUpperCase();if(p?.id&&/^[A-Z]{2}$/.test(String(p.id).toUpperCase()))return String(p.id).toUpperCase();}catch(_){}
    const key=source.toUpperCase();return/^[A-Z]{2,3}$/.test(key)?key:null;
  }
  async function roster(){
    const rules=g.Omega?.OpponentCountryRules||g.OmegaOpponentCountryRules;let values=[];
    if(typeof rules?.listCountryIds==='function')try{const rows=await rules.listCountryIds();if(Array.isArray(rows))values=rows;}catch(_){}
    if(!values.length)try{values=(g.OmegaCountryRuntimeData?.listProfiles?.()||[]).map(x=>x?.countryCode||x?.iso2||x?.iso3);}catch(_){}
    return[...new Set(values.map(countryId).filter(Boolean))].sort();
  }
  function restoreEventState(meta){
    if(eventStateOwner===meta)return;
    eventQueue.length=0;seenEventIds.clear();seenOrder.length=0;
    for(const event of Array.isArray(meta.pendingEvents)?meta.pendingEvents.slice(0,LIMITS.MAX_EVENT_QUEUE):[]){
      if(event&&event.eventId&&event.eventType)eventQueue.push(clone(event));
    }
    eventQueue.sort((a,b)=>num(b.priority,eventPriority(b.eventType))-num(a.priority,eventPriority(a.eventType))||num(a.sequence)-num(b.sequence));
    for(const raw of (Array.isArray(meta.seenEventIds)?meta.seenEventIds:[]).slice(-LIMITS.MAX_SEEN_EVENT_IDS)){
      const key=String(raw||'');if(key&&!seenEventIds.has(key)){seenEventIds.add(key);seenOrder.push(key);}
    }
    eventSequence=Math.max(num(meta.eventSequence),...eventQueue.map(row=>num(row.sequence)),0);
    eventOverflowCount=num(meta.eventStats?.overflowed);eventStateOwner=meta;
  }
  function persistEventState(meta){
    if(!isObject(meta))return;
    meta.pendingEvents=eventQueue.slice(-LIMITS.MAX_EVENT_QUEUE).map(row=>clone(row));
    meta.seenEventIds=seenOrder.slice(-LIMITS.MAX_SEEN_EVENT_IDS);
    meta.eventSequence=eventSequence;
    if(!isObject(meta.eventStats))meta.eventStats={processed:0,overflowed:0};
    meta.eventStats.overflowed=eventOverflowCount;
  }
  function ensureMeta(root){
    if(!isObject(root.simulation))root.simulation={};let m=root.simulation.worldSimulationScheduler;
    if(!isObject(m)||Number(m.schemaVersion)!==1){
      m={schemaVersion:1,macroCursor:0,rosterSignature:null,rosterCount:0,rosterRefreshedTurn:-1,
        bootstrapComplete:false,activeCountries:{},lastProcessedTurn:{},lastSuccessfulTurn:{},
        counters:{player:0,active:0,macro:0,skipped:0},pendingEvents:[],seenEventIds:[],eventSequence:0,
        eventStats:{processed:0,overflowed:0}};
      root.simulation.worldSimulationScheduler=m;
    }
    if(!isObject(m.activeCountries))m.activeCountries={};
    if(!isObject(m.lastProcessedTurn))m.lastProcessedTurn={};
    if(!isObject(m.lastSuccessfulTurn))m.lastSuccessfulTurn={};
    if(!isObject(m.counters))m.counters={player:0,active:0,macro:0,skipped:0};
    if(!Array.isArray(m.pendingEvents))m.pendingEvents=[];
    if(!Array.isArray(m.seenEventIds))m.seenEventIds=[];
    if(!isObject(m.eventStats))m.eventStats={processed:0,overflowed:0};
    restoreEventState(m);return m;
  }
  function eventPriority(type){const t=String(type||'').toUpperCase();for(const k of Object.keys(PRIORITY))if(t.includes(k))return PRIORITY[k];return 20;}
  function activateCountry(value,options={}){
    const id=countryId(value),root=state();if(!id)return{status:'SKIPPED',reason:'COUNTRY_ID_INVALID'};if(!root)return{status:'SKIPPED',reason:'WORLD_STATE_UNAVAILABLE'};
    const turn=Math.max(0,Math.floor(num(options.turn??root.simulation?.turn))),m=ensureMeta(root);
    if(id===lastPlayerCountryId)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_USES_DETAILED_RUNTIME'};
    const old=m.activeCountries[id],priority=Math.max(0,Math.min(100,num(options.priority,eventPriority(options.reason)))),expiry=turn+Math.max(1,Math.min(120,Math.floor(num(options.ttlTurns,LIMITS.ACTIVE_TTL_TURNS))));
    if(old){old.reason=String(options.reason||old.reason||'ACTIVE_RELATION');old.priority=Math.max(num(old.priority),priority);old.expiresAtTurn=Math.max(num(old.expiresAtTurn),expiry);old.lastActivatedTurn=turn;return{status:'REFRESHED',countryId:id,expiresAtTurn:old.expiresAtTurn};}
    const rows=Object.entries(m.activeCountries);if(rows.length>=LIMITS.MAX_ACTIVE_COUNTRIES){rows.sort((a,b)=>num(a[1]?.priority)-num(b[1]?.priority)||num(a[1]?.expiresAtTurn)-num(b[1]?.expiresAtTurn)||num(a[1]?.lastActivatedTurn)-num(b[1]?.lastActivatedTurn)||a[0].localeCompare(b[0]));if(rows[0]&&num(rows[0][1]?.priority)>priority)return{status:'DROPPED',reason:'ACTIVE_COUNTRY_CAPACITY',countryId:id};if(rows[0])delete m.activeCountries[rows[0][0]];}
    m.activeCountries[id]={countryId:id,reason:String(options.reason||'ACTIVE_RELATION'),priority,activatedTurn:turn,lastActivatedTurn:turn,expiresAtTurn:expiry,lastProcessedTurn:null};return{status:'ACTIVATED',countryId:id,expiresAtTurn:expiry};
  }
  function deactivateCountry(value){const id=countryId(value),root=state();if(!id||!root)return false;const m=ensureMeta(root);if(!m.activeCountries[id])return false;delete m.activeCountries[id];return true;}
  function keyFor(root,cid){if(!isObject(root))return null;if(Object.prototype.hasOwnProperty.call(root,cid))return cid;return Object.keys(root).find(k=>String(k).toUpperCase()===cid)||null;}
  function busyReason(root,cid){
    const pk=keyFor(root.projects,cid),projects=pk&&Array.isArray(root.projects[pk]?.registry)?root.projects[pk].registry:[];
    if(projects.some(p=>p?.autonomy&&ACTIVE_PROJECT_STATES.has(String(p.status||'').toUpperCase())))return'ACTIVE_PROJECT';
    const mk=keyFor(root.military,cid),training=mk&&Array.isArray(root.military[mk]?.trainingQueue)?root.military[mk].trainingQueue:[];
    if(training.some(x=>String(x?.status||'').toUpperCase()==='IN_TRAINING'))return'MILITARY_TRAINING';
    const tk=keyFor(root.trade,cid),requests=tk&&Array.isArray(root.trade[tk]?.importRequests)?root.trade[tk].importRequests:[];
    if(requests.some(x=>ACTIVE_TRADE_STATES.has(String(x?.status||'').toUpperCase())))return'ACTIVE_TRADE';return null;
  }
  function bucket(root,cid){if(!isObject(root))return null;if(isObject(root[cid]))return root[cid];const k=keyFor(root,cid);return k?root[k]:null;}
  function bootstrap(root,turn,ids){
    const m=ensureMeta(root);if(m.bootstrapComplete)return;const known=new Set(ids);
    const scan=(source,test,reason,priority)=>{if(!isObject(source))return;for(const raw of Object.keys(source)){const cid=countryId(raw);if(cid&&known.has(cid)&&test(source[raw]))activateCountry(cid,{turn,reason,priority});}};
    scan(root.projects,row=>Array.isArray(row?.registry)&&row.registry.some(p=>p?.autonomy&&ACTIVE_PROJECT_STATES.has(String(p.status||'').toUpperCase())),'EXISTING_AUTONOMOUS_PROJECT',45);
    scan(root.military,row=>Array.isArray(row?.trainingQueue)&&row.trainingQueue.some(x=>String(x?.status||'').toUpperCase()==='IN_TRAINING'),'EXISTING_MILITARY_TRAINING',55);
    scan(root.trade,row=>Array.isArray(row?.importRequests)&&row.importRequests.some(x=>ACTIVE_TRADE_STATES.has(String(x?.status||'').toUpperCase())),'EXISTING_TRADE_REQUEST',65);
    const player=countryId(root.simulation?.session?.playerCountryId||root.playerCountryId),relations=bucket(root.foreign,player)?.relations||bucket(root.relations,player);
    if(isObject(relations))for(const[raw,row]of Object.entries(relations)){const cid=countryId(raw);if(!cid||!known.has(cid))continue;const war=row?.war_state===true||String(row?.status||'').toUpperCase()==='WAR',sanctions=row?.sanctions===true,agreement=row?.trade_agreement===true;if(war||sanctions||agreement)activateCountry(cid,{turn,reason:war?'PLAYER_WAR_RELATION':sanctions?'PLAYER_SANCTION_RELATION':'PLAYER_ACTIVE_TRADE_RELATION',priority:war?100:sanctions?90:65});}
    m.bootstrapComplete=true;m.bootstrapTurn=turn;
  }
  function compactEvent(raw){
    const detail=raw?.detail||raw||{},payload=detail?.payload||detail?.detail||detail||{};
    const type=String(detail?.eventType||raw?.type||payload?.eventType||'').trim().toUpperCase(),sequence=++eventSequence;
    const row={eventId:String(detail?.eventId||payload?.eventId||payload?.commandId||payload?.correlationId||('WSE-'+sequence)),
      eventType:type,simulationTurn:num(detail?.simulationTurn??payload?.simulationTurn??state()?.simulation?.turn),
      priority:eventPriority(type),sequence,payload:{}};
    for(const key of ['countryId','sourceCountryId','destinationCountryId','targetCountryId','buyerCountryId','sellerCountryId','actorCountryId','counterpartyCountryId','fromCountryId','toCountryId','recipientCountryId','ownerCountryId','decisionId','requestId','projectId','treatyId','status','reason'])
      if(payload?.[key]!==undefined)row.payload[key]=payload[key];
    if(Array.isArray(payload?.affectedCountryIds))row.payload.affectedCountryIds=payload.affectedCountryIds.slice(0,16);
    return row;
  }
  function rememberEvent(key){
    if(seenEventIds.has(key))return false;seenEventIds.add(key);seenOrder.push(key);
    if(seenOrder.length>LIMITS.MAX_SEEN_EVENT_IDS){const old=seenOrder.shift();seenEventIds.delete(old);}
    return true;
  }
  function enqueueEvent(raw){
    const root=state(),meta=root?ensureMeta(root):null;
    const event=compactEvent(raw);
    if(!event.eventType||!EVENT_PATTERN.test(event.eventType)||event.eventType==='OMEGA_SIMULATION_TURN_COMMITTED')
      return{status:'IGNORED',reason:'EVENT_NOT_WORLD_ACTIVATING'};
    const key=event.eventType+'::'+event.eventId;
    if(seenEventIds.has(key))return{status:'DUPLICATE',eventId:event.eventId};
    const turn=Math.max(event.simulationTurn,num(root?.simulation?.turn)),ids=new Set();
    for(const field of ['countryId','sourceCountryId','destinationCountryId','targetCountryId','buyerCountryId','sellerCountryId','actorCountryId','counterpartyCountryId','fromCountryId','toCountryId','recipientCountryId','ownerCountryId']){
      const cid=countryId(event.payload[field]);if(cid)ids.add(cid);
    }
    for(const rawId of event.payload.affectedCountryIds||[]){const cid=countryId(rawId);if(cid)ids.add(cid);}
    if(eventQueue.length>=LIMITS.MAX_EVENT_QUEUE){
      const lowest=eventQueue[eventQueue.length-1],lowestPriority=num(lowest?.priority,eventPriority(lowest?.eventType));
      if(lowestPriority>event.priority){eventOverflowCount++;if(meta)persistEventState(meta);return{status:'DROPPED',reason:'EVENT_QUEUE_PRIORITY_CAPACITY',eventId:event.eventId};}
      const lowestIndex=eventQueue.findIndex(row=>num(row?.priority,eventPriority(row?.eventType))===lowestPriority);
      if(lowestIndex>=0)eventQueue.splice(lowestIndex,1);
      eventOverflowCount++;
    }
    const insertAt=eventQueue.findIndex(row=>num(row?.priority,eventPriority(row?.eventType))<event.priority);
    if(insertAt<0)eventQueue.push(event);else eventQueue.splice(insertAt,0,event);
    rememberEvent(key);
    for(const cid of ids)activateCountry(cid,{turn,reason:event.eventType,priority:event.priority});
    if(meta)persistEventState(meta);
    return{status:'QUEUED',eventId:event.eventId,priority:event.priority,activatedCountryIds:[...ids]};
  }
  function registerCountryHandler(id,handler,options={}){
    const key=String(id||'').trim();if(!key||typeof handler!=='function')throw new Error('WORLD_SIM_COUNTRY_HANDLER_INVALID');
    const old=countryHandlers.get(key),entry={id:key,handler,tiers:new Set((Array.isArray(options.tiers)?options.tiers:['PLAYER','ACTIVE']).map(x=>String(x).toUpperCase())),priority:num(options.priority),sequence:old?.sequence??(++countryHandlerSequence)};
    countryHandlers.set(key,entry);return()=>{if(countryHandlers.get(key)===entry)countryHandlers.delete(key);};
  }
  function registerEventHandler(eventType,id,handler,options={}){
    const type=String(eventType||'').trim().toUpperCase(),key=String(id||'').trim();if(!type||!key||typeof handler!=='function')throw new Error('WORLD_SIM_EVENT_HANDLER_INVALID');
    const mapKey=type+'::'+key,old=eventHandlers.get(mapKey),entry={id:key,eventType:type,handler,priority:num(options.priority),sequence:old?.sequence??(++eventHandlerSequence)};
    eventHandlers.set(mapKey,entry);return()=>{if(eventHandlers.get(mapKey)===entry)eventHandlers.delete(mapKey);};
  }
  async function processEvents(ctx,meta){
    const done=[],startedAt=clockNow(),count=Math.min(eventQueue.length,LIMITS.MAX_EVENTS_PER_TURN);
    while(done.length<count&&(done.length===0||clockNow()-startedAt<LIMITS.EVENT_BATCH_BUDGET_MS)){
      const event=eventQueue.shift();if(!event)break;
      const handlers=[...eventHandlers.values()].filter(row=>row.eventType===event.eventType||row.eventType==='*')
        .sort((a,b)=>a.priority-b.priority||a.sequence-b.sequence);
      for(const handler of handlers)if(eventHandlers.get(handler.eventType+'::'+handler.id)===handler){
        try{await handler.handler(clone(event),ctx);}catch(_){totalEvaluationErrors++;}
      }
      done.push({eventId:event.eventId,eventType:event.eventType,priority:event.priority});
      persistEventState(meta);
    }
    if(!isObject(meta.eventStats))meta.eventStats={processed:0,overflowed:0};
    meta.eventStats.processed=num(meta.eventStats.processed)+done.length;
    meta.eventStats.overflowed=eventOverflowCount;persistEventState(meta);return done;
  }
  async function runHandlers(cid,tier,ctx){
    const rows=[...countryHandlers.values()].filter(x=>x.tiers.has(tier)).sort((a,b)=>a.priority-b.priority||a.sequence-b.sequence),out=[];
    for(const h of rows){if(countryHandlers.get(h.id)!==h)continue;try{out.push({id:h.id,status:'COMPLETED',result:await h.handler(cid,{...ctx,countryId:cid,tier,state:state(),simulation:sim()})});}catch(e){totalEvaluationErrors++;out.push({id:h.id,status:'FAILED',error:String(e?.message||e)});}}
    return out;
  }
  async function evaluateOpponent(cid,turn,tier){
    const rules=g.Omega?.OpponentCountryRules||g.OmegaOpponentCountryRules;if(typeof rules?.evaluateCountry!=='function')return{status:'SKIPPED',reason:'OPPONENT_RULES_UNAVAILABLE'};
    try{const result=await rules.evaluateCountry(cid,turn);let queued=0;
      if(result?.status==='COMPLETE'&&typeof rules.queueDecision==='function'){const decisions=(Array.isArray(result.decisions)?result.decisions:[]).filter(row=>{const a=row?.selected?.action||row?.selectedActions?.[0];return!!a&&String(a).toUpperCase()!=='HOLD';}).sort((a,b)=>num(b?.priorityScore??b?.priority)-num(a?.priorityScore??a?.priority)||String(a?.decisionId||'').localeCompare(String(b?.decisionId||'')));
        for(const d of decisions.slice(0,LIMITS.MAX_QUEUED_DECISIONS_PER_COUNTRY))if(rules.queueDecision(d,turn))queued++;}
      return{status:result?.status||'UNKNOWN',countryId:cid,tier,queued,decisionCount:result?.decisions?.length||0};
    }catch(e){totalEvaluationErrors++;return{status:'ERROR',countryId:cid,tier,error:String(e?.message||e)};}
  }
  function selectActive(meta,turn,player){
    const rows=[];for(const[cid,row]of Object.entries(meta.activeCountries)){if(cid===player){delete meta.activeCountries[cid];continue;}if(num(row?.expiresAtTurn,-1)<turn){delete meta.activeCountries[cid];continue;}rows.push({id:cid,row});}
    rows.sort((a,b)=>num(b.row?.priority)-num(a.row?.priority)||num(a.row?.lastProcessedTurn,-1)-num(b.row?.lastProcessedTurn,-1)||num(a.row?.lastActivatedTurn)-num(b.row?.lastActivatedTurn)||a.id.localeCompare(b.id));return rows.slice(0,LIMITS.ACTIVE_COUNTRIES_PER_TURN);
  }
  function selectMacro(ids,meta,turn,player,limit=LIMITS.MACRO_COUNTRIES_PER_TURN){
    if(!ids.length)return{selected:[],nextCursor:0,cursorAfterSelected:[]};
    const active=new Set(Object.keys(meta.activeCountries));let cursor=Math.max(0,Math.floor(num(meta.macroCursor)))%ids.length,scanned=0;
    const selected=[],cursorAfterSelected=[];
    while(scanned<ids.length&&selected.length<limit){
      const cid=ids[cursor];scanned++;cursor=(cursor+1)%ids.length;
      if(cid===player||active.has(cid)||num(meta.lastProcessedTurn[cid],-1)===turn)continue;
      selected.push(cid);cursorAfterSelected.push(cursor);
    }
    return{selected,nextCursor:cursor,cursorAfterSelected};
  }
  async function processTurn(ctx={}){
    const root=state();if(!isObject(root))return{status:'SKIPPED',reason:'WORLD_STATE_UNAVAILABLE'};
    const turn=turnOf(ctx),meta=ensureMeta(root),turnStartedAt=clockNow(),constrained=constrainedDevice();
    const turnBudgetMs=constrained?LIMITS.MOBILE_TURN_BUDGET_MS:LIMITS.DESKTOP_TURN_BUDGET_MS;
    if(num(meta.lastProcessedTurn.__SCHEDULER__,-1)===turn)return{status:'ALREADY_PROCESSED',turn,evaluated:0};
    let ids=await roster();if(!ids.length)return{status:'WAITING',reason:'COUNTRY_ROSTER_UNAVAILABLE',turn,evaluated:0};
    const signature=ids.join('|');
    if(meta.rosterSignature!==signature){
      meta.rosterSignature=signature;meta.rosterCount=ids.length;
      meta.macroCursor=Math.max(0,Math.floor(num(meta.macroCursor)))%ids.length;meta.rosterRefreshedTurn=turn;
    }else if(turn-num(meta.rosterRefreshedTurn,turn)>=LIMITS.ROSTER_REFRESH_TURNS){
      ids=await roster();meta.rosterSignature=ids.join('|');meta.rosterCount=ids.length;
      meta.macroCursor=Math.max(0,Math.floor(num(meta.macroCursor)))%Math.max(1,ids.length);meta.rosterRefreshedTurn=turn;
    }
    const known=new Set(ids),candidates=[root.simulation?.session?.playerCountryId,ctx.playerCountryId,ctx.countryId,root.playerCountryId,sim()?.getPlayerCountryId?.()];
    let player=null;for(const raw of candidates){const id=countryId(raw);if(id&&known.has(id)){player=id;break;}}
    lastPlayerCountryId=player;
    if(!player)return{status:'WAITING',reason:'PLAYER_COUNTRY_REQUIRED',turn,rosterCount:ids.length,evaluated:0};
    for(const id of Object.keys(meta.activeCountries))if(!known.has(id))delete meta.activeCountries[id];
    bootstrap(root,turn,ids);
    const base={turn,day:turn+1,playerCountryId:player,simulationDate:ctx.simulationDate||null,
      stepDurationMs:ctx.stepDurationMs||sim()?.clock?.stepDurationMs||null};
    const events=await processEvents(base,meta),playerHandlers=await runHandlers(player,'PLAYER',base);
    meta.lastProcessedTurn[player]=turn;meta.lastSuccessfulTurn[player]=turn;meta.counters.player=num(meta.counters.player)+1;
    const activeLimit=constrained?Math.min(2,LIMITS.ACTIVE_COUNTRIES_PER_TURN):LIMITS.ACTIVE_COUNTRIES_PER_TURN;
    const active=selectActive(meta,turn,player).slice(0,activeLimit),activeResults=[];
    let evaluationsSinceYield=0,sliceStartedAt=clockNow();
    const yieldWithinBudget=async()=>{
      evaluationsSinceYield++;
      if(evaluationsSinceYield>=(constrained?1:LIMITS.COUNTRY_EVALUATIONS_PER_YIELD)||
        clockNow()-sliceStartedAt>=LIMITS.COUNTRY_BATCH_BUDGET_MS){
        evaluationsSinceYield=0;await yieldToBrowser();sliceStartedAt=clockNow();
      }
    };
    for(const item of active){
      const handlers=await runHandlers(item.id,'ACTIVE',base),result=await evaluateOpponent(item.id,turn,'ACTIVE');
      activeResults.push({countryId:item.id,handlers,result});
      item.row.lastProcessedTurn=turn;item.row.lastEvaluationStatus=result.status;meta.lastProcessedTurn[item.id]=turn;
      if(result.status==='COMPLETE')meta.lastSuccessfulTurn[item.id]=turn;
      if(busyReason(root,item.id))item.row.expiresAtTurn=Math.max(num(item.row.expiresAtTurn),turn+LIMITS.ACTIVE_TTL_TURNS);
      await yieldWithinBudget();
    }
    meta.counters.active=num(meta.counters.active)+activeResults.length;
    const macroLimit=constrained?Math.min(4,LIMITS.MACRO_COUNTRIES_PER_TURN):LIMITS.MACRO_COUNTRIES_PER_TURN;
    const macro=selectMacro(ids,meta,turn,player,macroLimit),macroResults=[];
    if(!macro.selected.length)meta.macroCursor=macro.nextCursor;
    let budgetExhausted=false;
    for(let index=0;index<macro.selected.length;index++){
      if(clockNow()-turnStartedAt>=turnBudgetMs){budgetExhausted=true;break;}
      const id=macro.selected[index],handlers=await runHandlers(id,'MACRO',base),result=await evaluateOpponent(id,turn,'MACRO');
      macroResults.push({countryId:id,handlers,result});
      meta.lastProcessedTurn[id]=turn;if(result.status==='COMPLETE')meta.lastSuccessfulTurn[id]=turn;
      meta.macroCursor=macro.cursorAfterSelected[index]??macro.nextCursor;
      await yieldWithinBudget();
    }
    if(macroResults.length===macro.selected.length&&!macro.selected.length)meta.macroCursor=macro.nextCursor;
    meta.counters.macro=num(meta.counters.macro)+macroResults.length;meta.lastProcessedTurn.__SCHEDULER__=turn;
    totalEvaluated+=activeResults.length+macroResults.length;
    totalQueued+=activeResults.reduce((sum,row)=>sum+num(row.result?.queued),0)+macroResults.reduce((sum,row)=>sum+num(row.result?.queued),0);
    persistEventState(meta);
    lastBatch={turn,playerCountryId:player,rosterCount:ids.length,activeCountryIds:activeResults.map(row=>row.countryId),
      macroCountryIds:macroResults.map(row=>row.countryId),eventCount:events.length,pendingEvents:eventQueue.length,
      errors:activeResults.concat(macroResults).filter(row=>row.result?.status==='ERROR').length,
      budgetMs:turnBudgetMs,elapsedMs:Number((clockNow()-turnStartedAt).toFixed(2)),budgetExhausted,
      deviceProfile:constrained?'CONSTRAINED':'STANDARD'};
    return{status:'COMPLETED',turn,playerCountryId:player,rosterCount:ids.length,
      player:{countryId:player,handlers:playerHandlers.length},
      active:{selected:activeResults.length,results:activeResults},
      macro:{selected:macroResults.length,results:macroResults,cursor:meta.macroCursor},
      events:{processed:events.length,pending:eventQueue.length},
      budget:{profile:constrained?'CONSTRAINED':'STANDARD',budgetMs:turnBudgetMs,elapsedMs:lastBatch.elapsedMs,exhausted:budgetExhausted},
      limits:clone(LIMITS)};
  }
  async function install(){
    if(installed)return true;const runtime=sim();if(!runtime||typeof runtime.registerTurnParticipant!=='function')return false;
    turnUnregister=runtime.registerTurnParticipant('omega.world-simulation.scheduler.v1',(_event,context)=>processTurn(context||{}),{priority:9000});
    if(runtime.events?.subscribe)ledgerUnsubscribe=runtime.events.subscribe('*',event=>enqueueEvent(event));installed=true;return true;
  }
  function diagnostics(){
    const root=state(),m=root?ensureMeta(root):{};
    return{version:VERSION,installed,engineIntegrated:true,
      tiers:{player:'DETAILED_EXISTING_RUNTIME',active:'EVENT_AND_WORKLOAD_DRIVEN',macro:'ADAPTIVE_BOUNDED_ROUND_ROBIN'},
      rosterCount:num(m.rosterCount),activeCountryCount:isObject(m.activeCountries)?Object.keys(m.activeCountries).length:0,
      limits:clone(LIMITS),lastPlayerCountryId,lastTurn:lastBatch?.turn??null,lastBatch:clone(lastBatch),
      totalEvaluated,totalQueued,totalEvaluationErrors,totalYieldCount,pendingEvents:eventQueue.length,eventOverflowCount,
      persistedEventCount:Array.isArray(m.pendingEvents)?m.pendingEvents.length:0,
      seenEventIdCount:seenEventIds.size,deviceProfile:constrainedDevice()?'CONSTRAINED':'STANDARD',
      registeredCountryHandlers:countryHandlers.size,registeredEventHandlers:eventHandlers.size};
  }
  const API=Object.freeze({VERSION,LIMITS,engineIntegrated:true,install,processTurn,activateCountry,deactivateCountry,enqueueEvent,queueEvent:enqueueEvent,registerCountryHandler,registerEventHandler,diagnostics,getCountryRoster:roster,dispose(){try{turnUnregister?.();}catch(_){}try{ledgerUnsubscribe?.();}catch(_){}turnUnregister=null;ledgerUnsubscribe=null;installed=false;return true;}});
  g.Omega=g.Omega||{};g.Omega.WorldSimulationScheduler=API;g.OmegaWorldSimulationScheduler=API;
  try{void install();}catch(e){g.OmegaWorldSimulationSchedulerError=String(e?.message||e);}
  if(typeof g.addEventListener==='function')g.addEventListener('OMEGA_READY',()=>{void install();});
})(typeof window!=='undefined'?window:globalThis);
