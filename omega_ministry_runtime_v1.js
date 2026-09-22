/*
 * OMEGA CANONICAL 17-MINISTRY RUNTIME CONTROLLER v1.3.0
 *
 * Runtime responsibility:
 *   - own the canonical ministry set
 *   - require one independent domain engine per ministry
 *   - register every ministry with Omega Kernel
 *   - execute the independent engine on every orchestrated ministry tick
 *   - maintain per-ministry runtime state and observable telemetry
 *
 * Legacy ministry_engine.js records are metadata/configuration only.
 * They are never the execution authority for the canonical 17-ministry runtime.
 */
(function(global){
  'use strict';

  const VERSION='1.3.0';

  const IDS=Object.freeze(
    Array.isArray(global.OmegaMinistryRegistry?.ids)
      ? global.OmegaMinistryRegistry.ids.map(String)
      : []
  );
  if(!IDS.length) throw new Error('OMEGA_MINISTRY_REGISTRY_REQUIRED');

  const GOVERNMENT_PHASES=Object.freeze([
    'TURN_START',
    'WORLD_UPDATE',
    'OBSERVE',
    'INFORMATION',
    'ASSESS',
    'COORDINATE',
    'DECIDE',
    'AUTHORIZE',
    'EXECUTE',
    'COMMIT',
    'PUBLISH',
    'REACT',
    'VERIFY',
    'TURN_END'
  ]);

  const PHASE_BARRIERS=Object.freeze({
    TURN_START:[],
    WORLD_UPDATE:['TURN_START'],
    OBSERVE:['WORLD_UPDATE'],
    INFORMATION:['OBSERVE'],
    ASSESS:['INFORMATION'],
    COORDINATE:['ASSESS'],
    DECIDE:['COORDINATE'],
    AUTHORIZE:['DECIDE'],
    EXECUTE:['AUTHORIZE'],
    COMMIT:['EXECUTE'],
    PUBLISH:['COMMIT'],
    REACT:['PUBLISH'],
    VERIFY:['REACT'],
    TURN_END:['VERIFY']
  });

  const SPECS=Object.freeze({
    cabinet:{domain:'executive_coordination',dependencies:IDS.filter(id=>id!=='cabinet').slice(0,4)},
    defense:{domain:'defense_policy',dependencies:['finance','resource','foreign','military']},
    military:{domain:'force_readiness',dependencies:['defense','finance','resource']},
    finance:{domain:'fiscal_state',dependencies:['economy','statistics','projects']},
    economy:{domain:'economic_state',dependencies:['finance','trade','resource','transport']},
    trade:{domain:'commerce_state',dependencies:['economy','foreign','transport','resource']},
    foreign:{domain:'diplomatic_state',dependencies:['defense','trade','intelligence']},
    intelligence:{domain:'intelligence_state',dependencies:['foreign','interior','defense']},
    interior:{domain:'civil_administration',dependencies:['finance','health','statistics']},
    transport:{domain:'infrastructure_logistics',dependencies:['economy','resource','projects']},
    resource:{domain:'resource_governance',dependencies:['economy','transport','projects']},
    health:{domain:'public_health',dependencies:['finance','interior','education','statistics']},
    education:{domain:'human_capital',dependencies:['finance','technology','health','economy']},
    technology:{domain:'science_technology',dependencies:['education','finance','defense']},
    projects:{domain:'government_projects',dependencies:['finance','transport','technology']},
    culture:{domain:'culture_media',dependencies:['education','foreign','interior']},
    statistics:{domain:'national_statistics',dependencies:['economy','finance','health','education']}
  });

  // Legacy metadata references retained for traceability only.
  const LEGACY_CONFIG_REFERENCES=Object.freeze({
    cabinet:['cabinet_council'],
    defense:['defense'],
    military:['defense'],
    finance:['treasury_finance','taxes','central_bank'],
    economy:['production','taxes','central_bank'],
    trade:['trade'],
    foreign:['foreign_affairs'],
    intelligence:['intelligence_cyber'],
    interior:['interior_security'],
    transport:['infrastructure'],
    resource:['energy_mining'],
    health:['health_welfare'],
    education:['education'],
    technology:['science_research'],
    projects:['mega_projects','laws'],
    culture:[],
    statistics:[]
  });

  const SOURCE_KEYS=Object.freeze([
    'Omega','Game','OmegaCabinetUI','OmegaDataFindingSystem',
    'OmegaCanonicalIdentityRegistry','OmegaResourceSemanticBridge'
  ]);

  function now(){ return Date.now(); }

  function getInteroperability(){
    return global.OmegaMinistryInteroperability || global.Omega?.MinistryInteroperability || global.OmegaMinistryMesh || null;
  }

  function getStateProvider(){
    return global.OmegaMinistryStateProvider?.instance || global.Omega?.MinistryStateProvider?.instance || null;
  }

  function canonicalCountryId(value){
    const raw=String(value??'').trim();
    if(!raw)return null;
    const registry=global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge||null;
    try{
      const resolved=registry?.canonicalCountryId?.(raw)||registry?.resolveCountry?.(raw)?.id;
      if(resolved)return String(resolved).trim().toUpperCase();
    }catch(_){}
    return raw.toUpperCase();
  }

  function syncSimulationClock(turn){
    const n=Number(turn);
    if(!Number.isFinite(n))return null;
    const state=global.Game?.state||global.gameState||null;
    if(state)state.simulationTurn=n;
    if(global.Game?.worldState)global.Game.worldState.turn=n;
    if(global.Game?.Simulation)global.Game.Simulation.currentTurn=n;
    return n;
  }

  function putContextPath(root,path,value){
    const parts=String(path||'').split('.');
    let cursor=root;
    for(let i=0;i<parts.length-1;i++){
      const part=parts[i];
      if(!cursor[part]||typeof cursor[part]!=='object')cursor[part]={};
      cursor=cursor[part];
    }
    if(parts.length)cursor[parts[parts.length-1]]=value;
    return root;
  }

  function pickCountryBucket(context,section){
    const source=context?.gameState?.[section];
    if(!source || typeof source!=='object') return null;
    const id=String(context?.countryId||'').trim().toUpperCase();
    if(id && source[id]!=null) return source[id];
    const raw=context?.countryId;
    if(raw && source[raw]!=null) return source[raw];
    return null;
  }

  function discoverInputSources(){
    const hits=[];
    for(const key of SOURCE_KEYS){
      try{ if(global[key]!=null) hits.push(key); }catch(_){}
    }
    return hits;
  }

  function publishEvent(topic,detail){
    try{ global.dispatchEvent?.(new CustomEvent(topic,{detail})); }catch(_){}
  }

  function clone(value){
    if(value==null || typeof value!=='object') return value;
    return JSON.parse(JSON.stringify(value));
  }

  function makeInitialState(id){
    return {
      id,
      domain:SPECS[id]?.domain||'unknown',
      engineId:id,
      engineVersion:null,
      independent:false,
      status:'REGISTERED',
      active:false,
      ticks:0,
      lastTick:null,
      lastUpdate:null,
      lastDt:0,
      failures:0,
      handledMessages:0,
      runtimeRevision:0,
      inputSources:[],
      dependencies:{},
      phase:'BOOT',
      errors:[]
    };
  }

  function getEngineRegistry(){
    return global.OmegaMinistryDomainEngines||global.Omega?.MinistryDomainEngines||null;
  }

  function validateEngineRegistry(){
    const registry=getEngineRegistry();
    if(!registry || !Array.isArray(registry.ids) || typeof registry.get!=='function'){
      return {ok:false,reason:'INDEPENDENT_DOMAIN_ENGINE_REGISTRY_MISSING',count:0,uniqueInstances:0};
    }
    const ids=registry.ids.map(String);
    if(ids.length!==IDS.length || IDS.some(id=>!ids.includes(id))){
      return {ok:false,reason:'CANONICAL_ENGINE_SET_MISMATCH',count:ids.length,uniqueInstances:0};
    }
    const engines=IDS.map(id=>registry.get(id));
    const missing=IDS.filter((id,i)=>!engines[i] || engines[i].id!==id || engines[i].independent!==true || typeof engines[i].execute!=='function');
    const uniqueInstances=new Set(engines).size;
    if(missing.length || uniqueInstances!==IDS.length){
      return {ok:false,reason:'INDEPENDENT_ENGINE_CONTRACT_VIOLATION',missing, count:engines.length,uniqueInstances};
    }
    return {ok:true,count:engines.length,uniqueInstances,version:registry.version||null};
  }

  function buildDomainContext(id,dt,currentTurn,store){
    const provider=getStateProvider();
    const state=provider?.root?.() || global.Game?.state || global.gameState || {};
    const interop=getInteroperability();
    const countryIdRaw=String(
      store?.countryId ||
      global.OmegaSimulation?.activeCountryId ||
      store?.countryId ||
      global.OmegaSimulation?.activeCountryId ||
      global.OmegaCabinetUI?.activeCountry ||
      global.Game?.currentActiveCountry ||
      global.CountryIOS?.activeCountry ||
      state?.playerCountryId ||
      state?.countryCode ||
      state?.countryId ||
      ''
    );
    const canonicalId=canonicalCountryId(countryIdRaw);
    const countryId=canonicalId||null;

    const engine=getEngineRegistry()?.get?.(id);
    const domainContext={
      ministryId:id,
      countryId,
      turn:Number.isFinite(Number(currentTurn))?Number(currentTurn):null,
      dt:Number.isFinite(Number(dt))?Number(dt):0,
      countryRecord:provider?.countryRecord?.(countryId)||null,
      stateProvider:provider||null,
      ministers:global.OmegaMinistersDB||global.OmegaCabinetUI?.ministersDB||null,
      store:store||null,
      interoperability:interop && countryId && typeof interop.getContext==='function'
        ? interop.getContext(id,{countryId,turn:currentTurn,dt,store})
        : null
    };

    const paths=Array.isArray(engine?.inputs)?engine.inputs:[];
    for(const path of paths){
      let value;
      let described=null;
      try{
        if(provider?.describe){
          described=provider.describe(countryId,path,{currentTurn});
          if(described.availability!=='UNOBSERVED'&&described.availability!=='UNAVAILABLE'&&described.availability!=='NOT_APPLICABLE'){
            value=described.value;
          }else if(described.value!==null&&described.value!==undefined){
            value=described.value;
          }
        }
      }catch(_){}
      if(value===undefined){
        const direct=readContextPath(domainContext,path);
        if(direct!==undefined)value=direct;
      }
      if(value!==undefined)putContextPath(domainContext,path,value);
    }

    // Backward-compatible derived resource state comes through the provider,
    // never as a second authoritative resource database.
    try{
      if(domainContext.resourceEngineState===undefined && provider?.get){
        const resourceState=provider.get(countryId,'resourceEngineState');
        if(resourceState!==undefined)domainContext.resourceEngineState=resourceState;
      }
    }catch(_){}

    return domainContext;
  }

  function readContextPath(root,path){
    if(root==null||!path)return undefined;
    let cur=root;
    for(const part of String(path).split('.')){
      if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
      cur=cur[part];
    }
    return cur;
  }

  function safeDependencyStates(states,kernel,deps){
    const result={};
    for(const dep of deps||[]){
      const local=states.get(dep);
      let kernelState=null;
      try{ kernelState=typeof kernel?.getMinistryState==='function' ? kernel.getMinistryState(dep):null; }catch(_){}
      result[dep]=local?.status||kernelState||'UNAVAILABLE';
    }
    return result;
  }

  function resolveEngineBinding(id){
    const registry=getEngineRegistry();
    const engine=registry?.get?.(id)||null;
    return {
      expected:[id],
      resolved:engine ? [{
        id:engine.id,
        version:engine.engineVersion||registry?.version||null,
        independent:engine.independent===true
      }] : [],
      independent:engine?.independent===true,
      legacyConfigReferences:(LEGACY_CONFIG_REFERENCES[id]||[]).slice()
    };
  }

  function controller(){
    const states=new Map();
    IDS.forEach(id=>states.set(id,makeInitialState(id)));

    let kernel=null;
    let bridge=null;
    let initialized=false;
    let registryHealth={ok:false,reason:'NOT_INITIALIZED'};
    let interoperability=getInteroperability();
    let lastOrchestration=null;

    function syncManifest(){
      const manifest=global.GLOBAL_MINISTRY_MANIFEST;
      if(!Array.isArray(manifest)) return;
      for(const item of manifest){
        if(item && IDS.includes(String(item.id))) item.status='ACTIVE';
      }
    }

    function init(nextKernel){
      if(initialized && kernel && (!nextKernel || nextKernel===kernel)) return true;
      kernel=nextKernel||global.Omega?.Kernel||null;
      if(!kernel || typeof kernel.registerMinistry!=='function') return false;

      registryHealth=validateEngineRegistry();
      if(!registryHealth.ok) return false;

      bridge=typeof kernel.createBridge==='function' ? kernel.createBridge():null;
      interoperability=getInteroperability();
      const authority=global.OmegaAuthoritativeStateAuthority?.instance||global.Omega?.AuthoritativeStateAuthority?.instance||null;
      if(authority&&global.Game?.state&&!authority.bind(global.Game.state))return false;
      if(interoperability && typeof interoperability.init==='function' && !interoperability.init(bridge)) return false;

      for(const id of IDS){
        kernel.registerMinistry(id);
        const s=states.get(id);
        const engine=getEngineRegistry().get(id);
        s.engineId=engine.id;
        s.engineVersion=engine.engineVersion||getEngineRegistry().version||null;
        s.independent=engine.independent===true;
        s.status=typeof kernel.getMinistryState==='function' ? kernel.getMinistryState(id):'REGISTERED';
      }

      syncManifest();
      global.__OMEGA_MINISTRY_RUNTIME_STATUS__=global.__OMEGA_MINISTRY_RUNTIME_STATUS__||{};
      global.Omega=global.Omega||{};
      global.Omega.App=global.Omega.App||{};
      global.Omega.App.MINISTRIES=Object.freeze(IDS.slice());
      global.Omega.App.activeMinistries=Object.freeze(IDS.slice());
      global.Omega.App.ministryRuntime=api;

      initialized=true;
      publishEvent('OMEGA_17_MINISTRY_RUNTIME_READY',{
        count:IDS.length,
        ids:IDS.slice(),
        engineVersion:getEngineRegistry().version||null,
        uniqueInstances:registryHealth.uniqueInstances
      });
      return true;
    }

    function tick(id,dt,currentTurn,store,blackboard,options={}){
      if(!IDS.includes(String(id))) return null;
      const interop=getInteroperability();
      const engine=getEngineRegistry()?.get?.(id);
      if(!engine || engine.id!==id || engine.independent!==true || typeof engine.execute!=='function'){
        const s=states.get(id);
        s.failures+=1;
        s.errors.push('INDEPENDENT_ENGINE_UNAVAILABLE');
        if(s.errors.length>8) s.errors.shift();
        return null;
      }

      const spec=SPECS[id]||{domain:'unknown',dependencies:[]};
      const s=states.get(id);
      const inputSources=discoverInputSources();
      const domainContext=options.contextOverride||buildDomainContext(id,dt,currentTurn,store);
      const countryId=domainContext.countryId;
      const dependencySnapshot=safeDependencyStates(states,kernel,spec.dependencies);
      // Direct tick is a ministry execution primitive. Turn lifecycle ownership belongs to runTurn().
      const phase=String(options.phase||'ASSESS');
      let domainExecution;

      if(options.advanceInterop!==false&&interop && typeof interop.advanceTurn==='function')interop.advanceTurn(currentTurn);

      if(options.processInbox!==false&&interop && countryId && typeof interop.drainInbox==='function'){
        interop.drainInbox(countryId,id,(message)=>{
          handleMessage(id,message);
        },100);
      }

      try{
        domainExecution=engine.execute(domainContext);
      }catch(err){
        s.failures+=1;
        s.status='FAILED';
        s.active=false;
        s.errors.push(String(err?.message||err));
        if(s.errors.length>8) s.errors.shift();
        throw err;
      }

      s.status=typeof kernel?.getMinistryState==='function' ? kernel.getMinistryState(id):'RUNNING';
      s.active=s.status==='RUNNING'||s.status==='READY';
      s.ticks+=1;
      s.lastTick=currentTurn??null;
      s.lastUpdate=now();
      s.lastDt=Number.isFinite(dt)?dt:0;
      s.runtimeRevision+=1;
      s.inputSources=inputSources.slice();
      s.dependencies=dependencySnapshot;
      s.phase=phase;

      if(options.publish!==false&&interoperability && typeof interoperability.publishState==='function' && countryId){
        interoperability.publishState(id,{
          domain:spec.domain,
          domainExecution,
          context:domainContext,
          store,
          runtimeState:s,
          turn:currentTurn
        });
      }

      const telemetry={
        id,
        domain:spec.domain,
        engineId:engine.id,
        engineVersion:engine.engineVersion||getEngineRegistry().version||null,
        independent:engine.independent===true,
        tick:s.lastTick,
        phase,
        active:s.active,
        status:s.status,
        runtimeRevision:s.runtimeRevision,
        inputSources:inputSources.slice(),
        dependencies:{...dependencySnapshot},
        engineBinding:resolveEngineBinding(id),
        domainExecution,
        interoperability:interoperability && typeof interoperability.getConnection==='function'
          ? {
              ministryConnections:interoperability.connectionsFor?.(id,'ALL')?.length ?? 0,
              publishedSnapshot:!!interoperability.getPeerState?.(id,id)
            }
          : null,
        timestamp:s.lastUpdate
      };

      // Runtime telemetry is emitted through dedicated runtime/blackboard sinks.
      // The canonical application store is not a telemetry destination and must not be
      // mutated by the ministry runtime as an execution side effect.

      global.__OMEGA_MINISTRY_RUNTIME_STATUS__=global.__OMEGA_MINISTRY_RUNTIME_STATUS__||{};
      global.__OMEGA_MINISTRY_RUNTIME_STATUS__[id]=telemetry;

      try{
        if(typeof blackboard?.writeAtomic==='function'){
          blackboard.writeAtomic(
            'omega.runtime.'+id,
            telemetry,
            'KERNEL',
            currentTurn??0,
            IDS.slice(),
            2
          );
        }
      }catch(err){
        s.errors.push(String(err?.message||err));
        if(s.errors.length>8) s.errors.shift();
      }

      if(options.emitRuntimeEvent!==false){
        try{ bridge?.emitEvent?.('OMEGA_MINISTRY_RUNTIME_TICK',telemetry); }catch(_){}
        publishEvent('OMEGA_MINISTRY_RUNTIME_TICK',telemetry);
      }
      return telemetry;
    }

    function createDependencyPlan(){
      const graph=new Map(IDS.map(id=>[id,new Set((SPECS[id]?.dependencies||[]).filter(dep=>IDS.includes(dep)))]));
      const indexById=new Map();
      const lowById=new Map();
      const stack=[];
      const onStack=new Set();
      const components=[];
      let index=0;

      const visit=(id)=>{
        indexById.set(id,index);
        lowById.set(id,index);
        index+=1;
        stack.push(id);
        onStack.add(id);
        for(const dep of graph.get(id)||[]){
          if(!indexById.has(dep)){
            visit(dep);
            lowById.set(id,Math.min(lowById.get(id),lowById.get(dep)));
          }else if(onStack.has(dep)){
            lowById.set(id,Math.min(lowById.get(id),indexById.get(dep)));
          }
        }
        if(lowById.get(id)===indexById.get(id)){
          const component=[];
          while(stack.length){
            const member=stack.pop();
            onStack.delete(member);
            component.push(member);
            if(member===id)break;
          }
          component.sort((a,b)=>IDS.indexOf(a)-IDS.indexOf(b));
          components.push(component);
        }
      };

      for(const id of IDS)if(!indexById.has(id))visit(id);

      const componentOf=new Map();
      components.forEach((component,componentId)=>component.forEach(id=>componentOf.set(id,componentId)));

      const outgoing=new Map(components.map((_,i)=>[i,new Set()]));
      const indegree=new Map(components.map((_,i)=>[i,0]));
      for(const [id,deps] of graph.entries()){
        const from=componentOf.get(id);
        for(const dep of deps){
          const to=componentOf.get(dep);
          if(from===to)continue;
          if(!outgoing.get(to).has(from)){
            outgoing.get(to).add(from);
            indegree.set(from,indegree.get(from)+1);
          }
        }
      }

      const ready=components
        .map((component,componentId)=>({componentId,component}))
        .filter(row=>indegree.get(row.componentId)===0)
        .sort((a,b)=>IDS.indexOf(a.component[0])-IDS.indexOf(b.component[0]));

      const orderedComponents=[];
      while(ready.length){
        const row=ready.shift();
        orderedComponents.push(row);
        for(const next of outgoing.get(row.componentId)||[]){
          indegree.set(next,indegree.get(next)-1);
          if(indegree.get(next)===0){
            ready.push({componentId:next,component:components[next]});
            ready.sort((a,b)=>IDS.indexOf(a.component[0])-IDS.indexOf(b.component[0]));
          }
        }
      }

      if(orderedComponents.length!==components.length)throw new Error('MINISTRY_DEPENDENCY_GRAPH_INVALID');
      const groups=orderedComponents.map(row=>row.component.slice());
      const order=groups.flat();
      return {
        schemaVersion:1,
        order,
        groups,
        cycles:groups.filter(group=>{
          if(group.length>1)return true;
          const only=group[0];
          return graph.get(only)?.has(only)===true;
        }),
        dependencies:Object.fromEntries(IDS.map(id=>[id,[...(graph.get(id)||new Set())]]))
      };
    }

    function createSchedule(currentTurn){
      const turn=Number(currentTurn);
      if(!Number.isFinite(turn))throw new Error('SIMULATION_TURN_REQUIRED');
      const dependencyPlan=createDependencyPlan();
      return {
        schemaVersion:1,
        turn,
        deterministicOrder:dependencyPlan.order.slice(),
        dependencyPlan:clone(dependencyPlan),
        phases:GOVERNMENT_PHASES.map((id,index)=>({
          id,
          order:index,
          barriers:PHASE_BARRIERS[id].slice(),
          ministryOrder:dependencyPlan.order.slice()
        }))
      };
    }

    function emitGovernmentPhase(turn,phase,status,detail={}){
      publishEvent('OMEGA_GOVERNMENT_PHASE',{
        schemaVersion:1,
        turn,
        phase,
        status,
        detail:clone(detail)
      });
    }

    function runTurn(currentTurn,dt,store,blackboard,options={}){
      if(!initialized)throw new Error('OMEGA_GOVERNMENT_RUNTIME_NOT_INITIALIZED');
      const turn=Number(currentTurn);
      if(!Number.isFinite(turn))throw new Error('SIMULATION_TURN_REQUIRED');
      if(lastOrchestration&&turn<Number(lastOrchestration.turn))throw new Error('SIMULATION_TURN_REGRESSION');
      if(lastOrchestration&&turn===Number(lastOrchestration.turn)&&options.allowRepeat!==true)return clone(lastOrchestration);
      syncSimulationClock(turn);
      const delta=Number.isFinite(Number(dt))?Number(dt):0;
      const schedule=createSchedule(turn);
      const phaseResults=[];
      const observations=new Map();
      const assessments=new Map();
      const decisions=[];
      const commands=[];
      const failures=[];

      const phase=(id,status,detail={})=>{
        const row={phase:id,status,turn,detail:clone(detail)};
        phaseResults.push(row);
        emitGovernmentPhase(turn,id,status,detail);
        return row;
      };

      try{
        if(interoperability?.advanceTurn)interoperability.advanceTurn(turn);
      }catch(error){
        failures.push({phase:'TURN_START',scope:'GLOBAL',error:String(error?.message||error)});
      }
      phase('TURN_START',failures.length?'DEGRADED':'COMMITTED');

      try{
        if(typeof options.worldUpdate==='function')options.worldUpdate({turn,dt:delta,phase:'WORLD_UPDATE'});
        phase('WORLD_UPDATE','COMMITTED');
      }catch(error){
        failures.push({phase:'WORLD_UPDATE',scope:'WORLD',error:String(error?.message||error)});
        phase('WORLD_UPDATE','FAILED',{error:String(error?.message||error)});
      }

      for(const id of schedule.deterministicOrder){
        try{
          observations.set(id,buildDomainContext(id,delta,turn,store));
        }catch(error){
          failures.push({phase:'OBSERVE',scope:id,error:String(error?.message||error)});
        }
      }
      phase('OBSERVE',failures.some(x=>x.phase==='OBSERVE')?'DEGRADED':'COMMITTED',{
        observedMinistries:observations.size
      });

      for(const id of schedule.deterministicOrder){
        const context=observations.get(id);
        const countryId=context?.countryId;
        if(!context||!countryId)continue;
        try{
          interoperability?.drainInbox?.(countryId,id,(message)=>handleMessage(id,message),100);
        }catch(error){
          failures.push({phase:'INFORMATION',scope:id,error:String(error?.message||error)});
        }
      }
      phase('INFORMATION',failures.some(x=>x.phase==='INFORMATION')?'DEGRADED':'COMMITTED');

      for(const id of schedule.deterministicOrder){
        try{
          const freshContext=buildDomainContext(id,delta,turn,store);
          const result=tick(id,delta,turn,store,blackboard,{
            phase:'ASSESS',
            contextOverride:freshContext,
            processInbox:false,
            advanceInterop:false,
            publish:false,
            emitRuntimeEvent:false
          });
          assessments.set(id,{context:freshContext,execution:result});
        }catch(error){
          failures.push({phase:'ASSESS',scope:id,error:String(error?.message||error)});
        }
      }
      phase('ASSESS',failures.some(x=>x.phase==='ASSESS')?'DEGRADED':'COMMITTED',{
        assessedMinistries:assessments.size
      });

      const coordination={};
      let governmentCoordination=null;
      for(const id of schedule.deterministicOrder){
        const context=assessments.get(id)?.context;
        const countryId=context?.countryId;
        if(!countryId)continue;
        try{
          coordination[id]=interoperability?.getContext?.(id,{countryId,turn,dt:delta})||null;
        }catch(error){
          failures.push({phase:'COORDINATE',scope:id,error:String(error?.message||error)});
        }
      }
      const coordinationCountry=store?.countryId||observations.get('cabinet')?.countryId||null;
      try{
        if(coordinationCountry&&interoperability?.coordinateGovernment){
          governmentCoordination=interoperability.coordinateGovernment(coordinationCountry,{currentTurn:turn});
        }
      }catch(error){
        failures.push({phase:'COORDINATE',scope:'CABINET',error:String(error?.message||error)});
      }
      phase('COORDINATE',failures.some(x=>x.phase==='COORDINATE')?'DEGRADED':'COMMITTED',{
        coordinatedMinistries:Object.keys(coordination).length,
        cabinetReady:governmentCoordination?.status==='READY'
      });

      try{
        const automatic=interoperability?.evaluateGovernmentDecisions?.(coordinationCountry||observations.get('cabinet')?.countryId,{
          currentTurn:turn
        });
        if(Array.isArray(automatic?.evaluated))decisions.push(...clone(automatic.evaluated));
      }catch(error){
        failures.push({phase:'DECIDE',scope:'GOVERNMENT',error:String(error?.message||error)});
      }

      if(typeof options.decide==='function'){
        try{
          const result=options.decide({
            turn,dt:delta,coordination:clone(coordination),
            governmentCoordination:clone(governmentCoordination),
            decisions:clone(decisions),
            ministries:schedule.deterministicOrder.slice()
          });
          if(Array.isArray(result))decisions.push(...clone(result));
          else if(result!==undefined)decisions.push(clone(result));
        }catch(error){
          failures.push({phase:'DECIDE',scope:'GOVERNMENT',error:String(error?.message||error)});
        }
      }
      phase('DECIDE',failures.some(x=>x.phase==='DECIDE')?'DEGRADED':'COMMITTED',{decisionCount:decisions.length});

      if(typeof options.authorize==='function'){
        try{
          options.authorize({turn,dt:delta,decisions:clone(decisions),coordination:clone(coordination),governmentCoordination:clone(governmentCoordination)});
        }catch(error){
          failures.push({phase:'AUTHORIZE',scope:'GOVERNMENT',error:String(error?.message||error)});
        }
      }
      phase('AUTHORIZE',failures.some(x=>x.phase==='AUTHORIZE')?'DEGRADED':'COMMITTED');

      let scheduledCommands=[];
      try{
        scheduledCommands=interoperability?.processScheduledEffects?.(turn,256)||[];
      }catch(error){
        failures.push({phase:'EXECUTE',scope:'SCHEDULED_EFFECTS',error:String(error?.message||error)});
      }

      let commandRequests=Array.isArray(options.commands)?clone(options.commands):[];
      try{
        const compiled=interoperability?.compileDecisionCommands?.(decisions,{turn})||[];
        commandRequests=[...commandRequests,...compiled];
      }catch(error){
        failures.push({phase:'EXECUTE',scope:'COMMAND_COMPILER',error:String(error?.message||error)});
      }
      for(const request of commandRequests){
        try{
          const source=String(request?.sourceMinistryId||'');
          const actionId=String(request?.actionId||request?.commandType||'');
          const countryId=String(request?.countryId||store?.countryId||'').trim().toUpperCase();
          if(!source||!actionId||!countryId)throw new Error('COMMAND_REQUEST_SCOPE_INVALID');
          const result=interoperability.dispatchCommand(source,actionId,countryId,request.payload||{},{
            ...request.options,
            turn,
            commandType:request.commandType||actionId,
            deferCommit:true,
            deferEventDispatch:true
          });
          commands.push(clone(result));
        }catch(error){
          failures.push({phase:'EXECUTE',scope:request?.sourceMinistryId||'unknown',error:String(error?.message||error)});
        }
      }
      for(const scheduled of scheduledCommands){
        if(scheduled?.status==='STAGED')commands.push(clone(scheduled));
        else if(scheduled?.status==='FAILED'){
          failures.push({phase:'EXECUTE',scope:'SCHEDULED_EFFECTS',error:String(scheduled?.result?.error||scheduled?.error||'SCHEDULED_EFFECT_FAILED')});
        }
      }
      phase('EXECUTE',failures.some(x=>x.phase==='EXECUTE')?'DEGRADED':'COMMITTED',{commandCount:commands.length,scheduledEffects:scheduledCommands.length});

      let committedCommandRows=[];
      try{
        committedCommandRows=interoperability?.commitPendingCommands?.(turn)||[];
        const committedById=new Map(committedCommandRows.map(row=>[String(row.commandId),row]));
        for(let i=0;i<commands.length;i++){
          const id=String(commands[i]?.commandId||'');
          if(committedById.has(id))commands[i]=clone(committedById.get(id));
        }
      }catch(error){
        failures.push({phase:'COMMIT',scope:'GOVERNMENT',error:String(error?.message||error)});
      }

      phase('COMMIT',failures.some(x=>x.phase==='COMMIT')||commands.some(row=>row.status==='FAILED')?'DEGRADED':'COMMITTED',{
        preparedCommands:commands.length,
        committedCommands:commands.filter(row=>row.lifecycleStatus==='COMMITTED'||row.lifecycleStatus==='VERIFIED').length
      });

      for(const [id,result] of assessments.entries()){
        const context=result.context;
        const countryId=context?.countryId;
        if(!countryId||!interoperability?.publishState)continue;
        try{
          interoperability.publishState(id,{
            domain:SPECS[id]?.domain||null,
            domainExecution:result.execution?.domainExecution||result.execution,
            context,
            store,
            runtimeState:states.get(id),
            turn,
            deferEventDispatch:true
          });
        }catch(error){
          failures.push({phase:'PUBLISH',scope:id,error:String(error?.message||error)});
        }
      }
      phase('PUBLISH',failures.some(x=>x.phase==='PUBLISH')?'DEGRADED':'COMMITTED');

      let reactions=[];
      try{
        interoperability?.processEventOutbox?.(turn);
        reactions=interoperability?.processReactionQueue?.(turn)||[];
      }catch(error){
        failures.push({phase:'REACT',scope:'GOVERNMENT',error:String(error?.message||error)});
      }
      phase('REACT',failures.some(x=>x.phase==='REACT')?'DEGRADED':'COMMITTED',{reactionCount:reactions.length});

      let verification=null;
      try{
        verification={
          runtime:this.health(),
          interoperability:interoperability?.diagnostics?.(null,turn)||null,
          schedule
        };
      }catch(error){
        failures.push({phase:'VERIFY',scope:'GOVERNMENT',error:String(error?.message||error)});
      }
      phase('VERIFY',failures.some(x=>x.phase==='VERIFY')?'DEGRADED':'COMMITTED');

      phase('TURN_END',failures.length?'DEGRADED':'COMMITTED',{
        failures:failures.length,
        processedMinistries:assessments.size
      });

      if(failures.length&&interoperability?.recordFailure){
        for(const failure of failures){
          try{
            interoperability.recordFailure(
              failure.scope||'GLOBAL',
              failure.phase||'UNKNOWN',
              turn,
              failure.error||'UNKNOWN_FAILURE',
              'RETRY',
              {orchestrator:'OMEGA_MINISTRY_RUNTIME_V1'}
            );
          }catch(_){}
        }
      }

      lastOrchestration={
        schemaVersion:2,
        turn,
        dt:delta,
        status:failures.length?'DEGRADED':'COMMITTED',
        deterministicOrder:schedule.deterministicOrder.slice(),
        phases:phaseResults,
        assessments:Object.fromEntries([...assessments.entries()].map(([id,row])=>[id,{
          revision:row.execution?.runtimeRevision??null,
          engineRevision:row.execution?.domainExecution?.revision??null
        }])),
        coordination:clone(governmentCoordination),
        decisions:clone(decisions),
        commands:clone(commands),
        reactions:clone(reactions),
        verification:clone(verification),
        failures:clone(failures)
      };
      return clone(lastOrchestration);
    }

    function handleMessage(id,message){
      if(!IDS.includes(String(id))) return false;
      const targetId=String(id);
      const interop=getInteroperability();
      const countryId=String(message?.countryId||'').trim().toUpperCase();
      const currentTurn=Number.isFinite(Number(message?.simulationTurn??message?.turn))
        ? Number(message.simulationTurn??message.turn)
        : (interop?.lastTurn||0);
      const engine=getEngineRegistry()?.get?.(targetId)||null;
      if(!engine || typeof engine.handleMessage!=='function'){
        return false;
      }

      if(interop && typeof interop.processIncoming==='function'){
        const result=interop.processIncoming(countryId,targetId,message,currentTurn,(accepted)=>{
          const coordinationContext=interop.getContext?.(targetId,{countryId,turn:currentTurn,dt:0})||null;
          return engine.handleMessage(accepted,coordinationContext);
        });
        if(!result?.ok)return false;
        states.get(targetId).handledMessages+=1;
        return true;
      }

      try{
        engine.handleMessage(message,{ministryId:targetId,countryId,interoperability:null});
        states.get(targetId).handledMessages+=1;
        return true;
      }catch(err){
        const state=states.get(targetId);
        state.failures+=1;
        state.errors.push(String(err?.message||err));
        if(state.errors.length>8)state.errors.shift();
        return false;
      }
    }

    function getCurrentTurn(){
      const state=global.Game?.state||global.gameState||{};
      const n=Number(state.simulationTurn??global.Game?.worldState?.turn??0);
      return Number.isFinite(n)?n:0;
    }

    function getIds(){ return IDS.slice(); }

    function getState(id){
      const s=states.get(String(id));
      return s ? clone(s):null;
    }

    function getEngine(id){ return getEngineRegistry()?.get?.(String(id))||null; }

    function saveState(){
      const engineStates={};
      for(const id of IDS){
        const engine=getEngineRegistry()?.get?.(id);
        if(engine&&typeof engine.exportState==='function')engineStates[id]=engine.exportState();
      }
      return {
        schemaVersion:2,
        version:VERSION,
        ministries:Object.fromEntries([...states.entries()].map(([id,state])=>[id,clone(state)])),
        engines:engineStates,
        interoperability:interoperability?.saveState?.()||null,
        orchestration:lastOrchestration?clone(lastOrchestration):null
      };
    }

    function loadState(snapshot){
      if(!snapshot||typeof snapshot!=='object')throw new Error('INVALID_MINISTRY_RUNTIME_SAVE');
      if(Array.isArray(snapshot.ids)&&snapshot.ids.some(id=>!IDS.includes(String(id))))throw new Error('MINISTRY_RUNTIME_REGISTRY_MISMATCH');
      if(snapshot.ministries){
        for(const id of IDS){
          if(snapshot.ministries[id])Object.assign(states.get(id),clone(snapshot.ministries[id]));
        }
      }
      const engines=getEngineRegistry();
      if(snapshot.engines&&engines){
        for(const id of IDS){
          const engine=engines.get?.(id);
          const saved=snapshot.engines[id];
          if(engine&&saved&&typeof engine.importState==='function')engine.importState(saved);
        }
      }
      if(snapshot.interoperability&&interoperability?.loadState)interoperability.loadState(snapshot.interoperability);
      lastOrchestration=clone(snapshot.orchestration||null);
      return true;
    }

    function health(){
      const rows=IDS.map(id=>states.get(id));
      const active=rows.filter(s=>s.active).length;
      const ticked=rows.filter(s=>s.ticks>0).length;
      const failed=rows.filter(s=>s.status==='FAILED'||s.failures>0).length;
      const independent=rows.filter(s=>s.independent===true).length;
      const uniqueInstances=registryHealth.uniqueInstances||0;
      return {
        version:VERSION,
        engineRegistryVersion:getEngineRegistry()?.version||null,
        count:IDS.length,
        active,
        ticked,
        failed,
        independent,
        uniqueInstances,
        initialized,
        engineRegistryHealthy:registryHealth.ok,
        interoperability:interoperability && typeof interoperability.health==='function'
          ? interoperability.health()
          : null
      };
    }

    const api=Object.freeze({
      version:VERSION,
      ids:IDS,
      specs:SPECS,
      engineBindings:Object.freeze(Object.fromEntries(IDS.map(id=>[id,[id]]))),
      legacyConfigReferences:LEGACY_CONFIG_REFERENCES,
      init,
      tick,
      handleMessage,
      getIds,
      getState,
      getEngine,
      health,
      createSchedule,
      runTurn,
      getOrchestrationState:()=>clone(lastOrchestration),
      createDependencyPlan,
      getCurrentTurn,
      syncSimulationClock,
      saveState,
      loadState,
      getEngineBinding:resolveEngineBinding,
      GOVERNMENT_PHASES,
      PHASE_BARRIERS
    });

    return api;
  }

  const api=controller();
  global.OMEGA_MINISTRY_RUNTIME_V1=api;
  global.Omega=global.Omega||{};
  global.Omega.MinistryRuntime=api;
})(typeof window!=='undefined'?window:globalThis);
