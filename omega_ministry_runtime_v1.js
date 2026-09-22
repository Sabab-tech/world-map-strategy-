/*
 * OMEGA CANONICAL 17-MINISTRY RUNTIME CONTROLLER v1.2.0
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

  const VERSION='1.2.0';

  const IDS=Object.freeze([
    'cabinet','defense','military','finance','economy','trade','foreign',
    'intelligence','interior','transport','resource','health','education',
    'technology','projects','culture','statistics'
  ]);

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
    const gameState=global.Game?.state||global.gameState||null;
    const interop=getInteroperability();
    const countryId=String(
      global.OmegaCabinetUI?.activeCountry ||
      global.Game?.currentActiveCountry ||
      global.CountryIOS?.activeCountry ||
      gameState?.countryCode ||
      gameState?.countryId ||
      ''
    ).trim().toUpperCase() || null;

    const economy=(gameState?.economy && countryId && (gameState.economy[countryId]||gameState.economy[global.Game?.currentActiveCountry]))||null;
    const population=(gameState?.population && countryId && (gameState.population[countryId]||gameState.population[global.Game?.currentActiveCountry]))||null;
    const relations=(gameState?.relations && countryId && (gameState.relations[countryId]||gameState.relations[global.Game?.currentActiveCountry]))||null;
    const resourceEngine=global.ResourceMinistryEngine||null;
    let resourceEngineState=null;
    const domainSections={};
    for(const domainId of IDS){
      if(domainId==='cabinet') continue;
      domainSections[domainId]=pickCountryBucket({gameState},domainId);
    }
    try{
      if(resourceEngine && typeof resourceEngine.getIntegratedResourceState==='function' && countryId){
        resourceEngineState=resourceEngine.getIntegratedResourceState(countryId);
      }
    }catch(_){}

    return {
      ministryId:id,
      countryId,
      turn:Number.isFinite(currentTurn)?currentTurn:null,
      dt:Number.isFinite(dt)?dt:0,
      gameState,
      countryRecord:null,
      ...domainSections,
      economy,
      population,
      relations,
      resourceSummary:gameState?.resources||gameState?.resource||null,
      resourceInventory:resourceEngineState?.inventory||null,
      resourceDeposits:resourceEngine?.deposits||null,
      resourceEngineState,
      ministers:global.OmegaMinistersDB||global.OmegaCabinetUI?.ministersDB||null,
      educationEngine:global.EducationEngine||null,
      store:store||null,
      interoperability:interop && typeof interop.getContext==='function'
        ? interop.getContext(id,{turn:currentTurn,dt,store})
        : null
    };
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

    function tick(id,dt,currentTurn,store,blackboard){
      if(!IDS.includes(String(id))) return null;
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
      const domainContext=buildDomainContext(id,dt,currentTurn,store);
      const dependencySnapshot=safeDependencyStates(states,kernel,spec.dependencies);
      const phase=['OBSERVE','VALIDATE','PROCESS','COMMIT'][Math.max(0,currentTurn||0)%4];
      let domainExecution;

      try{
        domainExecution=engine.execute(domainContext);
        if(interoperability && typeof interoperability.publishState==='function'){
          interoperability.publishState(id,{
            domain:spec.domain,
            domainExecution,
            context:domainContext,
            store,
            runtimeState:s,
            turn:currentTurn
          });
        }
      }catch(err){
        s.failures+=1;
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

      if(store){
        if(store.policies instanceof Map) store.policies.set('__omega_runtime__',telemetry);
        if(store.knowledgeGraph instanceof Map) store.knowledgeGraph.set('__omega_runtime_domain__',domainExecution);
        if(Array.isArray(store.goalStack) && store.goalStack.length<32){
          const marker='RUNTIME:'+id;
          if(!store.goalStack.includes(marker)) store.goalStack.push(marker);
        }
      }

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

      try{ bridge?.emitEvent?.('OMEGA_MINISTRY_RUNTIME_TICK',telemetry); }catch(_){}
      publishEvent('OMEGA_MINISTRY_RUNTIME_TICK',telemetry);
      return telemetry;
    }

    function handleMessage(id,message){
      if(!IDS.includes(String(id))) return false;
      const targetId=String(id);
      const interop=getInteroperability();
      let accepted={ok:true,message};
      if(interop && typeof interop.acceptMessage==='function'){
        accepted=interop.acceptMessage(targetId,message);
        if(!accepted?.ok) return false;
      }
      const engine=getEngineRegistry()?.get?.(targetId)||null;
      if(engine && typeof engine.handleMessage==='function'){
        try{
          engine.handleMessage(accepted.message || message,{
            ministryId:targetId,
            interoperability:interop && typeof interop.getContext==='function'
              ? interop.getContext(targetId,{turn:accepted.message?.turn ?? null,dt:0})
              : null
          });
        }catch(err){
          const s=states.get(targetId);
          s.failures+=1;
          s.errors.push(String(err?.message||err));
          if(s.errors.length>8) s.errors.shift();
          return false;
        }
      }
      states.get(targetId).handledMessages+=1;
      return true;
    }

    function getIds(){ return IDS.slice(); }

    function getState(id){
      const s=states.get(String(id));
      return s ? clone(s):null;
    }

    function getEngine(id){ return getEngineRegistry()?.get?.(String(id))||null; }

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
      getEngineBinding:resolveEngineBinding
    });

    return api;
  }

  const api=controller();
  global.OMEGA_MINISTRY_RUNTIME_V1=api;
  global.Omega=global.Omega||{};
  global.Omega.MinistryRuntime=api;
})(typeof window!=='undefined'?window:globalThis);
