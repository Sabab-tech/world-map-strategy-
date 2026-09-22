/**
 * OMEGA SIMULATION AUTHORITY RUNTIME v1.0.0
 *
 * Canonical orchestration layer for the playable simulation.
 *
 * Responsibilities:
 *   - one simulation clock
 *   - one authoritative world-state root
 *   - one game-session lifecycle
 *   - deterministic command queue
 *   - ordered simulation phases
 *   - world-causal engine integration
 *   - ministry runtime integration
 *   - unified save/load envelope
 *
 * This layer orchestrates existing engines; it does not become a second domain database.
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';
  const SESSION_VERSION=1;
  const STEP_MS=1000;
  const MAX_STEPS_PER_FRAME=8;
  const MAX_EVENT_HISTORY=2000;
  const MAX_COMMAND_HISTORY=2000;

  const PHASES=Object.freeze([
    'INPUT',
    'VALIDATE',
    'SIMULATE',
    'COMMIT',
    'PUBLISH',
    'CHECKPOINT'
  ]);

  function clone(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(Array.isArray(value)){
      const out=[];seen.set(value,out);
      for(const item of value)out.push(clone(item,seen));
      return out;
    }
    if(value instanceof Date)return new Date(value.getTime());
    const out={};seen.set(value,out);
    for(const key of Object.keys(value)){
      if(key==='__proto__'||key==='constructor')continue;
      const item=value[key];
      if(typeof item!=='function'&&item!==undefined)out[key]=clone(item,seen);
    }
    return out;
  }

  function replaceContents(target,source){
    for(const key of Object.keys(target)){
      if(key==='__proto__'||key==='constructor')continue;
      delete target[key];
    }
    if(source&&typeof source==='object'){
      for(const [key,value] of Object.entries(source)){
        if(key==='__proto__'||key==='constructor')continue;
        target[key]=clone(value);
      }
    }
    return target;
  }

  function finite(value,fallback){
    const n=Number(value);
    return Number.isFinite(n)?n:fallback;
  }

  class SimulationClock{
    constructor(options={}){
      this.version=VERSION;
      this.turn=finite(options.turn,0);
      this.simulationTimeMs=finite(options.simulationTimeMs,0);
      this.stepDurationMs=Math.max(1,finite(options.stepDurationMs,3600000));
      this.accumulatorMs=Math.max(0,finite(options.accumulatorMs,0));
      this.speed=Math.max(0,finite(options.speed,1));
      this.running=false;
      this.paused=false;
      this.startEpochMs=finite(options.startEpochMs,Date.UTC(2015,0,1));
    }

    setSpeed(value){
      const speed=finite(value,1);
      if(speed<0)throw new Error('SIMULATION_SPEED_INVALID');
      this.speed=speed;
      return this.speed;
    }

    start(){
      this.running=true;
      this.paused=false;
    }

    pause(){
      this.paused=true;
      this.running=false;
    }

    resume(){
      this.running=true;
      this.paused=false;
    }

    stop(){
      this.running=false;
      this.paused=false;
      this.accumulatorMs=0;
    }

    advanceTurn(){
      this.turn+=1;
      this.simulationTimeMs+=this.stepDurationMs;
      return this.snapshot();
    }

    consumeRealDelta(realDeltaMs){
      if(!this.running||this.paused||this.speed===0)return 0;
      const delta=Math.max(0,finite(realDeltaMs,0));
      this.accumulatorMs+=delta*this.speed;
      let steps=0;
      while(this.accumulatorMs>=STEP_MS&&steps<MAX_STEPS_PER_FRAME){
        this.accumulatorMs-=STEP_MS;
        steps+=1;
      }
      return steps;
    }

    simulationDate(){
      return new Date(this.startEpochMs+this.simulationTimeMs).toISOString();
    }

    snapshot(){
      return {
        version:this.version,
        turn:this.turn,
        simulationTimeMs:this.simulationTimeMs,
        stepDurationMs:this.stepDurationMs,
        accumulatorMs:this.accumulatorMs,
        speed:this.speed,
        running:this.running,
        paused:this.paused,
        startEpochMs:this.startEpochMs,
        simulationDate:this.simulationDate()
      };
    }

    restore(snapshot){
      if(!snapshot||typeof snapshot!=='object')throw new Error('INVALID_CLOCK_SNAPSHOT');
      this.turn=finite(snapshot.turn,0);
      this.simulationTimeMs=finite(snapshot.simulationTimeMs,0);
      this.stepDurationMs=Math.max(1,finite(snapshot.stepDurationMs,this.stepDurationMs));
      this.accumulatorMs=Math.max(0,finite(snapshot.accumulatorMs,0));
      this.speed=Math.max(0,finite(snapshot.speed,1));
      this.running=Boolean(snapshot.running);
      this.paused=Boolean(snapshot.paused);
      this.startEpochMs=finite(snapshot.startEpochMs,this.startEpochMs);
      return this.snapshot();
    }
  }

  class DeterministicQueue{
    constructor(limit){
      this.limit=limit;
      this.sequence=0;
      this.items=[];
      this.history=[];
    }

    enqueue(command){
      const row=clone(command||{});
      this.sequence+=1;
      row.sequence=Number.isFinite(Number(row.sequence))?Number(row.sequence):this.sequence;
      row.sequence=this.sequence;
      row.status='QUEUED';
      this.items.push(row);
      if(this.items.length>this.limit)this.items.splice(0,this.items.length-this.limit);
      return clone(row);
    }

    drain(){
      const out=this.items.splice(0,this.items.length);
      return out.sort((a,b)=>a.sequence-b.sequence);
    }

    record(row){
      this.history.push(clone(row));
      if(this.history.length>this.limit)this.history.splice(0,this.history.length-this.limit);
    }

    snapshot(){
      return {
        sequence:this.sequence,
        items:clone(this.items),
        history:clone(this.history)
      };
    }

    restore(snapshot){
      this.sequence=finite(snapshot?.sequence,0);
      this.items=Array.isArray(snapshot?.items)?clone(snapshot.items):[];
      this.history=Array.isArray(snapshot?.history)?clone(snapshot.history):[];
    }
  }

  class SimulationEventLedger{
    constructor(limit=MAX_EVENT_HISTORY){
      this.limit=limit;
      this.sequence=0;
      this.events=[];
      this.listeners=new Map();
    }

    emit(type,payload={},turn=0){
      const event={
        eventId:'OMEGA-SIM-EVT-'+String(turn)+'-'+String(++this.sequence),
        eventType:String(type||'UNKNOWN'),
        simulationTurn:finite(turn,0),
        payload:clone(payload)
      };
      this.events.push(event);
      if(this.events.length>this.limit)this.events.splice(0,this.events.length-this.limit);
      const subscribers=this.listeners.get(event.eventType)||[];
      for(const listener of [...subscribers]){
        try{listener(clone(event));}catch(error){try{console.error('[OMEGA SIM EVENT]',error);}catch(_){}}
      }
      const all=this.listeners.get('*')||[];
      for(const listener of [...all]){
        try{listener(clone(event));}catch(error){try{console.error('[OMEGA SIM EVENT]',error);}catch(_){}}
      }
      return clone(event);
    }

    subscribe(type,listener){
      if(typeof listener!=='function')throw new Error('SIMULATION_EVENT_LISTENER_REQUIRED');
      const key=String(type||'*');
      const set=this.listeners.get(key)||new Set();
      set.add(listener);
      this.listeners.set(key,set);
      return ()=>set.delete(listener);
    }

    snapshot(){
      return {sequence:this.sequence,events:clone(this.events)};
    }

    restore(snapshot){
      this.sequence=finite(snapshot?.sequence,0);
      this.events=Array.isArray(snapshot?.events)?clone(snapshot.events):[];
    }
  }

  class AuthoritativeWorldState{
    constructor(existingState){
      const candidate=existingState&&typeof existingState==='object'
        ?existingState
        :((global.Game&&global.Game.state)||global.gameState||{});
      this.state=candidate;
      this.ensureCore();
    }

    ensureCore(){
      const s=this.state;
      if(!s.simulation||typeof s.simulation!=='object')s.simulation={};
      if(!s.simulation.session||typeof s.simulation.session!=='object')s.simulation.session={};
      if(!s.simulation.domains||typeof s.simulation.domains!=='object')s.simulation.domains={};
      if(!s.simulation.subsystemTurns||typeof s.simulation.subsystemTurns!=='object')s.simulation.subsystemTurns={};
      if(!s.worldEcosystem||typeof s.worldEcosystem!=='object')s.worldEcosystem={};
      if(!s.worldEcosystem.countryProfiles||typeof s.worldEcosystem.countryProfiles!=='object'){
        s.worldEcosystem.countryProfiles={};
      }
      return s;
    }

    hydrateCompatibility(){
      const legacy=global.gameState;
      const s=this.state;
      if(!legacy||legacy===s||typeof legacy!=='object')return;
      for(const key of ['population','economy']){
        const target=s[key];
        const source=legacy[key];
        if(source&&typeof source==='object'&&
           (!target||typeof target!=='object'||Object.keys(target).length===0)){
          s[key]=source;
        }
      }
      this.ensureCore();
    }

    setSession(session){
      this.state.simulation.session=clone(session||{});
      return clone(this.state.simulation.session);
    }

    snapshot(){
      return clone(this.state);
    }

    restore(snapshot){
      if(!snapshot||typeof snapshot!=='object')throw new Error('INVALID_AUTHORITATIVE_WORLD_SNAPSHOT');
      replaceContents(this.state,snapshot);
      this.ensureCore();
      return this.snapshot();
    }
  }

  class SimulationCoordinator{
    constructor(options={}){
      this.version=VERSION;
      this.clock=new SimulationClock(options.clock||{});
      this.world=new AuthoritativeWorldState(options.state);
      this.commandQueue=new DeterministicQueue(MAX_COMMAND_HISTORY);
      this.events=new SimulationEventLedger(MAX_EVENT_HISTORY);
      this.phaseHandlers=new Map();
      this.ministryPump=null;
      this.worldEngine=null;
      this.interoperability=null;
      this.ministryRuntime=null;
      this.status='READY';
      this.stepInProgress=false;
      this.lastError=null;
      this.lastStepSummary=null;
      this.stepCount=0;
      this.checkpointInterval=Math.max(0,finite(options.checkpointInterval,0));
      this.autoCheckpointCounter=0;
      this.hooks={};
      this.installDefaultHandlers();
    }

    installDefaultHandlers(){
      this.phaseHandlers.set('INPUT',async({commands,turn})=>{
        const results=[];
        for(const command of commands){
          try{
            if(!this.interoperability?.dispatchCommand){
              results.push({...command,status:'UNROUTABLE',error:'INTEROPERABILITY_COMMAND_ROUTER_UNAVAILABLE'});
              continue;
            }
            const source=String(command.sourceMinistryId||command.source||'');
            const action=String(command.actionId||command.commandType||'');
            const country=String(command.countryId||this.getPlayerCountryId()||'').trim().toUpperCase();
            const result=this.interoperability.dispatchCommand(source,action,country,command.payload||{},{
              ...clone(command.options||{}),
              turn,
              commandId:command.commandId,
              commandType:command.commandType||action,
              correlationId:command.correlationId||null,
              causationId:command.causationId||null
            });
            results.push(result);
          }catch(error){
            results.push({...command,status:'FAILED',error:String(error?.message||error)});
          }
        }
        return results;
      });

      this.phaseHandlers.set('VALIDATE',async({turn})=>{
        const s=this.world.state.simulation;
        s.turn=turn;
        s.date=this.clock.simulationDate();
        s.lifecycle=this.status;
        return {
          turn,
          countryId:this.getPlayerCountryId(),
          stateRootAuthority:'OMEGA_AUTHORITATIVE_WORLD_STATE',
          worldStateRevision:s.worldStateRevision||0
        };
      });

      this.phaseHandlers.set('SIMULATE',async({turn,stepDurationMs})=>{
        const worldEngine=this.worldEngine||global.WorldEcosystemEngine||null;
        let worldResult=null;
        if(worldEngine?.setAuthoritativeState){
          worldEngine.setAuthoritativeState(this.world.state);
        }
        if(worldEngine?.processSimulationTick){
          worldResult=worldEngine.processSimulationTick(stepDurationMs,turn);
        }

        let ministryResult=null;
        if(typeof this.ministryPump==='function'){
          ministryResult=await this.ministryPump({turn,stepDurationMs,countryId:this.getPlayerCountryId(),state:this.world.state});
        }

        return {worldResult,ministryResult};
      });

      this.phaseHandlers.set('COMMIT',async({turn,simulationResult})=>{
        const s=this.world.state.simulation;
        s.turn=turn;
        s.step=turn;
        s.worldStateRevision=finite(s.worldStateRevision,0)+1;
        s.subsystemTurns.worldEcosystem=turn;
        s.subsystemTurns.ministries=turn;
        if(this.interoperability?.advanceTurn)this.interoperability.advanceTurn(turn);
        return {
          turn,
          worldStateRevision:s.worldStateRevision,
          committed:true,
          simulationResult:clone(simulationResult)
        };
      });

      this.phaseHandlers.set('PUBLISH',async({turn,commandResults})=>{
        const event=this.events.emit('OMEGA_SIMULATION_TURN_COMMITTED',{
          turn,
          countryId:this.getPlayerCountryId(),
          commandCount:commandResults.length,
          stateRevision:this.world.state.simulation.worldStateRevision
        },turn);
        try{
          global.dispatchEvent?.(new CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED',{detail:clone(event)}));
        }catch(_){}
        if(typeof this.hooks.onPublish==='function'){
          await this.hooks.onPublish({
            turn,
            state:this.world.state,
            event:clone(event)
          });
        }
        return {event};
      });

      this.phaseHandlers.set('CHECKPOINT',async({turn})=>{
        this.autoCheckpointCounter+=1;
        if(this.checkpointInterval>0&&this.autoCheckpointCounter%this.checkpointInterval===0){
          const snapshot=this.saveState();
          if(typeof this.hooks.onCheckpoint==='function')await this.hooks.onCheckpoint(snapshot,turn);
        }
        return {checkpointed:false,turn};
      });
    }

    configure(options={}){
      if(options.state)this.world=new AuthoritativeWorldState(options.state);
      if(options.interoperability)this.interoperability=options.interoperability;
      if(options.worldEngine)this.worldEngine=options.worldEngine;
      if(options.ministryRuntime)this.ministryRuntime=options.ministryRuntime;
      if(typeof options.ministryPump==='function')this.ministryPump=options.ministryPump;
      if(typeof options.playerCountryResolver==='function')this.hooks.playerCountryResolver=options.playerCountryResolver;
      if(options.checkpointInterval!==undefined){
        this.checkpointInterval=Math.max(0,finite(options.checkpointInterval,0));
      }
      return this.diagnostics();
    }

    setPhaseHandler(phase,handler){
      if(!PHASES.includes(String(phase)))throw new Error('UNKNOWN_SIMULATION_PHASE:'+phase);
      if(typeof handler!=='function')throw new Error('SIMULATION_PHASE_HANDLER_REQUIRED');
      this.phaseHandlers.set(String(phase),handler);
    }

    resolvePlayerCountry(){
      const candidates=[
        typeof this.hooks.playerCountryResolver==='function'?this.hooks.playerCountryResolver():null,
        this.world.state.simulation?.session?.playerCountryId,
        this.world.state.playerCountryId,
        global.OmegaCabinetUI?.activeCountry,
        global.CountryIOS?.activeCountry,
        global.Game?.currentActiveCountry,
        global.Game?.state?.countryCode,
        global.Game?.state?.countryId
      ];
      for(const value of candidates){
        const id=String(value||'').trim().toUpperCase();
        if(id)return id;
      }
      return null;
    }

    getPlayerCountryId(){
      return this.resolvePlayerCountry();
    }

    createSession(options={}){
      const countryId=String(options.playerCountryId||options.countryId||this.getPlayerCountryId()||'').trim().toUpperCase();
      const session={
        schemaVersion:SESSION_VERSION,
        sessionId:String(options.sessionId||('OMEGA-SESSION-'+Math.max(0,this.clock.turn+1))),
        playerCountryId:countryId||null,
        status:'READY',
        createdTurn:this.clock.turn,
        lastCommittedTurn:this.clock.turn
      };
      this.world.setSession(session);
      this.clock.stop();
      this.clock.turn=finite(options.startTurn,this.clock.turn);
      this.clock.simulationTimeMs=finite(options.simulationTimeMs,this.clock.turn*this.clock.stepDurationMs);
      this.clock.accumulatorMs=0;
      this.status='READY';
      this.lastError=null;
      this.stepCount=0;
      this.world.state.simulation.turn=this.clock.turn;
      this.world.state.simulation.date=this.clock.simulationDate();
      this.events.emit('OMEGA_GAME_SESSION_CREATED',{session:clone(session)},this.clock.turn);
      return clone(session);
    }

    startSession(options={}){
      if(options.playerCountryId||options.countryId){
        const current=this.world.state.simulation?.session||{};
        if(current.playerCountryId!==String(options.playerCountryId||options.countryId).trim().toUpperCase()){
          this.createSession({playerCountryId:options.playerCountryId||options.countryId,startTurn:options.startTurn});
        }
      }
      const session=this.world.state.simulation?.session||{};
      if(!session.playerCountryId){
        const resolved=this.getPlayerCountryId();
        if(!resolved)throw new Error('PLAYER_COUNTRY_REQUIRED');
        session.playerCountryId=resolved;
      }
      session.status='RUNNING';
      session.startedTurn=this.clock.turn;
      this.world.setSession(session);
      this.status='RUNNING';
      this.clock.start();
      this.events.emit('OMEGA_GAME_SESSION_STARTED',{session:clone(session)},this.clock.turn);
      return this.diagnostics();
    }

    pauseSession(){
      this.clock.pause();
      this.status='PAUSED';
      const session=this.world.state.simulation?.session||{};
      session.status='PAUSED';
      session.pausedTurn=this.clock.turn;
      this.world.setSession(session);
      this.events.emit('OMEGA_GAME_SESSION_PAUSED',{turn:this.clock.turn},this.clock.turn);
      return this.diagnostics();
    }

    resumeSession(){
      const session=this.world.state.simulation?.session||{};
      if(!session.playerCountryId)throw new Error('PLAYER_COUNTRY_REQUIRED');
      this.status='RUNNING';
      session.status='RUNNING';
      this.world.setSession(session);
      this.clock.resume();
      this.events.emit('OMEGA_GAME_SESSION_RESUMED',{turn:this.clock.turn},this.clock.turn);
      return this.diagnostics();
    }

    stopSession(){
      this.clock.stop();
      this.status='STOPPED';
      const session=this.world.state.simulation?.session||{};
      session.status='STOPPED';
      this.world.setSession(session);
      this.events.emit('OMEGA_GAME_SESSION_STOPPED',{turn:this.clock.turn},this.clock.turn);
      return this.diagnostics();
    }

    async frame(realDeltaMs){
      if(this.status!=='RUNNING')return {steps:0,turn:this.clock.turn,status:this.status};
      this.world.hydrateCompatibility();
      const steps=this.clock.consumeRealDelta(realDeltaMs);
      let last=null;
      for(let i=0;i<steps;i++)last=await this.step();
      return {steps,turn:this.clock.turn,last};
    }

    async advance(turns=1){
      const count=Math.max(0,Math.floor(finite(turns,0)));
      const wasRunning=this.status==='RUNNING';
      if(!wasRunning)this.status='RUNNING';
      let last=null;
      for(let i=0;i<count;i++)last=await this.step();
      if(!wasRunning)this.status='READY';
      return {turn:this.clock.turn,steps:count,last};
    }

    async step(){
      if(this.stepInProgress)throw new Error('SIMULATION_STEP_REENTRANT');
      this.stepInProgress=true;
      this.lastError=null;
      const commandResults=[];
      try{
        this.world.hydrateCompatibility();
        const time=this.clock.advanceTurn();
        const turn=time.turn;
        this.status='RUNNING';

        const commands=this.commandQueue.drain();
        for(const command of commands)this.commandQueue.record({...command,status:'PROCESSING',simulationTurn:turn});

        const context={
          turn,
          stepDurationMs:this.clock.stepDurationMs,
          state:this.world.state,
          commands,
          commandResults
        };

        const phaseResults={};
        const inputResult=await this.phaseHandlers.get('INPUT')(context);
        commandResults.push(...(Array.isArray(inputResult)?inputResult:[]));
        phaseResults.INPUT=clone(inputResult);

        phaseResults.VALIDATE=clone(await this.phaseHandlers.get('VALIDATE')({...context,commandResults}));
        phaseResults.SIMULATE=clone(await this.phaseHandlers.get('SIMULATE')({...context,commandResults}));
        phaseResults.COMMIT=clone(await this.phaseHandlers.get('COMMIT')({...context,commandResults,simulationResult:phaseResults.SIMULATE}));
        phaseResults.PUBLISH=clone(await this.phaseHandlers.get('PUBLISH')({...context,commandResults,phaseResults}));
        phaseResults.CHECKPOINT=clone(await this.phaseHandlers.get('CHECKPOINT')({...context,commandResults,phaseResults}));

        const session=this.world.state.simulation?.session||{};
        session.lastCommittedTurn=turn;
        session.status=this.status;
        this.world.setSession(session);

        this.stepCount+=1;
        this.lastStepSummary={
          turn,
          phases:phaseResults,
          commandResults:clone(commandResults),
          stateRevision:this.world.state.simulation.worldStateRevision
        };
        this.events.emit('OMEGA_SIMULATION_STEP_COMPLETED',this.lastStepSummary,turn);
        return clone(this.lastStepSummary);
      }catch(error){
        this.lastError=String(error?.message||error);
        this.status='ERROR';
        this.clock.pause();
        const session=this.world.state.simulation?.session||{};
        session.status='ERROR';
        session.lastError=this.lastError;
        this.world.setSession(session);
        this.events.emit('OMEGA_SIMULATION_STEP_FAILED',{turn:this.clock.turn,error:this.lastError},this.clock.turn);
        throw error;
      }finally{
        this.stepInProgress=false;
      }
    }

    enqueueCommand(command){
      const row={
        ...clone(command),
        commandId:String(command?.commandId||'OMI-PLAYER-CMD-'+String(this.commandQueue.sequence+1)),
        countryId:String(command?.countryId||this.getPlayerCountryId()||'').trim().toUpperCase()
      };
      if(!row.sourceMinistryId)throw new Error('COMMAND_SOURCE_MINISTRY_REQUIRED');
      if(!row.actionId&&!row.commandType)throw new Error('COMMAND_ACTION_REQUIRED');
      return this.commandQueue.enqueue(row);
    }

    saveState(){
      return {
        schemaVersion:SESSION_VERSION,
        runtimeVersion:VERSION,
        status:this.status,
        clock:this.clock.snapshot(),
        worldState:this.world.snapshot(),
        commands:this.commandQueue.snapshot(),
        events:this.events.snapshot(),
        ministryRuntime:this.ministryRuntime?.saveState?.()||null,
        interoperability:this.interoperability?.saveState?.()||null,
        worldEngine:this.worldEngine?.exportSaveState?.({authoritativeState:true})||null,
        diagnostics:this.diagnostics()
      };
    }

    loadState(snapshot){
      if(!snapshot||typeof snapshot!=='object')throw new Error('INVALID_SIMULATION_SAVE');
      if(Number(snapshot.schemaVersion)!==SESSION_VERSION)throw new Error('SIMULATION_SAVE_SCHEMA_MISMATCH');
      this.world.restore(snapshot.worldState);
      this.clock.restore(snapshot.clock);
      this.commandQueue.restore(snapshot.commands);
      this.events.restore(snapshot.events);
      if(snapshot.ministryRuntime&&this.ministryRuntime?.loadState)this.ministryRuntime.loadState(snapshot.ministryRuntime);
      if(snapshot.interoperability&&this.interoperability?.loadState)this.interoperability.loadState(snapshot.interoperability);
      this.status=String(snapshot.status||this.world.state.simulation?.session?.status||'READY');
      this.lastError=null;
      return this.diagnostics();
    }

    saveSlot(slot='default'){
      if(typeof global.localStorage==='undefined')throw new Error('LOCAL_STORAGE_UNAVAILABLE');
      const key='omega.game.save.'+String(slot||'default');
      global.localStorage.setItem(key,JSON.stringify(this.saveState()));
      return {ok:true,key,turn:this.clock.turn};
    }

    loadSlot(slot='default'){
      if(typeof global.localStorage==='undefined')throw new Error('LOCAL_STORAGE_UNAVAILABLE');
      const key='omega.game.save.'+String(slot||'default');
      const raw=global.localStorage.getItem(key);
      if(!raw)throw new Error('SAVE_SLOT_NOT_FOUND:'+key);
      return this.loadState(JSON.parse(raw));
    }

    diagnostics(){
      return {
        version:VERSION,
        status:this.status,
        phaseOrder:PHASES.slice(),
        clock:this.clock.snapshot(),
        session:clone(this.world.state.simulation?.session||{}),
        authoritativeState:{
          root:'Game.state',
          worldStateLinked:Boolean(global.Game?.state&&this.world.state===global.Game.state),
          compatibilityGameStatePresent:Boolean(global.gameState),
          worldEcosystemBucket:Boolean(this.world.state.worldEcosystem?.countryProfiles)
        },
        queues:{
          commands:this.commandQueue.items.length,
          commandHistory:this.commandQueue.history.length,
          events:this.events.events.length
        },
        stepCount:this.stepCount,
        lastStep:clone(this.lastStepSummary),
        lastError:this.lastError
      };
    }
  }

  const simulation=new SimulationCoordinator({
    state:global.Game?.state||global.gameState||{},
    worldEngine:global.WorldEcosystemEngine||null,
    interoperability:global.Omega?.MinistryInteroperability||global.OmegaMinistryInteroperability||null,
    ministryRuntime:global.OMEGA_MINISTRY_RUNTIME_V1||null
  });

  global.Omega=global.Omega||{};
  global.Omega.SimulationRuntime=simulation;
  global.Omega.Simulation=simulation;
  global.Omega.GameSession=simulation;
  global.Omega.AuthoritativeWorldState=simulation.world;
  global.Omega.SimulationClock=SimulationClock;

  global.Omega.Simulation.configure({
    worldEngine:global.WorldEcosystemEngine||null,
    interoperability:global.Omega?.MinistryInteroperability||global.OmegaMinistryInteroperability||null,
    ministryRuntime:global.OMEGA_MINISTRY_RUNTIME_V1||null
  });

  if(typeof global.addEventListener==='function'){
    global.addEventListener('OMEGA_READY',()=>{
      try{
        const runtime=global.Omega?.Simulation;
        runtime?.configure({
          state:global.Game?.state||global.gameState||runtime.world.state,
          worldEngine:global.WorldEcosystemEngine||null,
          interoperability:global.Omega?.MinistryInteroperability||global.OmegaMinistryInteroperability||null,
          ministryRuntime:global.OMEGA_MINISTRY_RUNTIME_V1||null
        });
        const country=runtime?.getPlayerCountryId?.();
        if(country&&!runtime.world.state.simulation.session?.playerCountryId){
          runtime.createSession({playerCountryId:country});
        }
        try{global.__LOG_EVENT__?.('SIMULATION_AUTHORITY_READY');}catch(_){}
      }catch(error){
        try{console.error('[OMEGA SIM] Ready hook failed:',error);}catch(_){}
      }
    });
  }

  console.log('[OMEGA SIM] Simulation Authority Runtime v'+VERSION+' loaded.');
})(typeof window!=='undefined'?window:globalThis);
