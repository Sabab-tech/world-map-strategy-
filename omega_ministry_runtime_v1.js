/*
 * OMEGA CANONICAL 17-MINISTRY RUNTIME CONTROLLER v1.0.0
 * Runtime responsibility:
 *   - own the canonical ministry set
 *   - register every ministry with Omega Kernel
 *   - attach one domain adapter to the kernel pipeline
 *   - maintain per-ministry runtime state
 *   - expose observable health/telemetry without inventing world data
 *
 * This controller is intentionally a runtime layer, not a fake economic/military
 * simulator. Domain values are read only from existing game surfaces when present.
 */
(function(global){
  'use strict';

  const IDS = Object.freeze([
    'cabinet','defense','military','finance','economy','trade','foreign',
    'intelligence','interior','transport','resource','health','education',
    'technology','projects','culture','statistics'
  ]);

  const SPECS = Object.freeze({
    cabinet:      { domain:'executive_coordination', dependencies:IDS.filter(id=>id!=='cabinet').slice(0,4) },
    defense:      { domain:'defense_policy', dependencies:['finance','resource','foreign','military'] },
    military:     { domain:'force_readiness', dependencies:['defense','finance','resource'] },
    finance:      { domain:'fiscal_state', dependencies:['economy','statistics','projects'] },
    economy:      { domain:'economic_state', dependencies:['finance','trade','resource','transport'] },
    trade:        { domain:'commerce_state', dependencies:['economy','foreign','transport','resource'] },
    foreign:      { domain:'diplomatic_state', dependencies:['defense','trade','intelligence'] },
    intelligence: { domain:'intelligence_state', dependencies:['foreign','interior','defense'] },
    interior:    { domain:'civil_administration', dependencies:['finance','health','statistics'] },
    transport:    { domain:'infrastructure_logistics', dependencies:['economy','resource','projects'] },
    resource:     { domain:'resource_governance', dependencies:['economy','transport','environment'] },
    health:       { domain:'public_health', dependencies:['finance','interior','education','statistics'] },
    education:    { domain:'human_capital', dependencies:['finance','technology','health','economy'] },
    technology:   { domain:'science_technology', dependencies:['education','finance','defense'] },
    projects:     { domain:'government_projects', dependencies:['finance','transport','technology'] },
    culture:      { domain:'culture_media', dependencies:['education','foreign','interior'] },
    statistics:   { domain:'national_statistics', dependencies:['economy','finance','health','education'] }
  });

  const SOURCE_KEYS = Object.freeze([
    'Omega','Game','OmegaCabinetUI','OmegaDataFindingSystem',
    'OmegaCanonicalIdentityRegistry','OmegaResourceSemanticBridge'
  ]);

  function now(){
    return Date.now();
  }

  function makeInitialState(id){
    return {
      id,
      domain:SPECS[id]?.domain || 'unknown',
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

  function safeDependencyStates(states, kernel, deps){
    const result={};
    for(const dep of deps||[]){
      const local=states.get(dep);
      let kernelState=null;
      try{ kernelState = typeof kernel?.getMinistryState==='function' ? kernel.getMinistryState(dep) : null; }catch(_){}
      result[dep]=local?.status || kernelState || 'UNAVAILABLE';
    }
    return result;
  }

  function discoverInputSources(){
    const hits=[];
    for(const key of SOURCE_KEYS){
      try{
        if(global[key] != null) hits.push(key);
      }catch(_){}
    }
    return hits;
  }

  function publishEvent(topic, detail){
    try{
      global.dispatchEvent?.(new CustomEvent(topic,{detail}));
    }catch(_){}
  }

  function controller(){
    const states=new Map();
    IDS.forEach(id=>states.set(id,makeInitialState(id)));

    let kernel=null;
    let initialized=false;

    function syncManifest(){
      const manifest=global.GLOBAL_MINISTRY_MANIFEST;
      if(!Array.isArray(manifest)) return;
      for(const item of manifest){
        if(item && IDS.includes(String(item.id))) item.status='ACTIVE';
      }
    }

    function init(nextKernel){
      kernel = nextKernel || global.Omega?.Kernel || null;
      if(!kernel || typeof kernel.registerMinistry!=='function') return false;

      for(const id of IDS){
        kernel.registerMinistry(id);
        const s=states.get(id);
        s.status=typeof kernel.getMinistryState==='function' ? kernel.getMinistryState(id) : 'REGISTERED';
      }

      syncManifest();
      global.__OMEGA_MINISTRY_RUNTIME_STATUS__=global.__OMEGA_MINISTRY_RUNTIME_STATUS__||{};
      global.Omega=global.Omega||{};
      global.Omega.App=global.Omega.App||{};
      global.Omega.App.MINISTRIES=Object.freeze(IDS.slice());
      global.Omega.App.activeMinistries=Object.freeze(IDS.slice());
      global.Omega.App.ministryRuntime=api;

      initialized=true;
      publishEvent('OMEGA_17_MINISTRY_RUNTIME_READY',{count:IDS.length,ids:IDS.slice()});
      return true;
    }

    function tick(id,dt,currentTurn,store,blackboard){
      if(!IDS.includes(String(id))) return null;
      const spec=SPECS[id]||{domain:'unknown',dependencies:[]};
      const s=states.get(id);
      const inputSources=discoverInputSources();
      const dependencySnapshot=safeDependencyStates(states,kernel,spec.dependencies);
      const phase=['OBSERVE','VALIDATE','PROCESS','COMMIT'][Math.max(0,currentTurn||0)%4];

      s.status=typeof kernel?.getMinistryState==='function' ? kernel.getMinistryState(id) : 'RUNNING';
      s.active = s.status==='RUNNING' || s.status==='READY';
      s.ticks += 1;
      s.lastTick=currentTurn ?? null;
      s.lastUpdate=now();
      s.lastDt=Number.isFinite(dt)?dt:0;
      s.runtimeRevision += 1;
      s.inputSources=inputSources.slice();
      s.dependencies=dependencySnapshot;
      s.phase=phase;

      if(store){
        if(store.policies instanceof Map){
          store.policies.set('__omega_runtime__',{
            ministryId:id,
            domain:spec.domain,
            phase,
            runtimeRevision:s.runtimeRevision,
            tick:s.lastTick,
            active:s.active,
            inputSources:inputSources.slice(),
            dependencies:{...dependencySnapshot}
          });
        }
        if(store.knowledgeGraph instanceof Map){
          store.knowledgeGraph.set('__omega_runtime_domain__',{
            domain:spec.domain,
            dependencies:{...dependencySnapshot},
            observedInputs:inputSources.slice(),
            revision:s.runtimeRevision
          });
        }
        if(Array.isArray(store.goalStack) && store.goalStack.length<32){
          const marker='RUNTIME:'+id;
          if(!store.goalStack.includes(marker)) store.goalStack.push(marker);
        }
      }

      const telemetry={
        id,
        domain:spec.domain,
        tick:s.lastTick,
        phase,
        active:s.active,
        status:s.status,
        runtimeRevision:s.runtimeRevision,
        inputSources:inputSources.slice(),
        dependencies:{...dependencySnapshot},
        timestamp:s.lastUpdate
      };

      global.__OMEGA_MINISTRY_RUNTIME_STATUS__=global.__OMEGA_MINISTRY_RUNTIME_STATUS__||{};
      global.__OMEGA_MINISTRY_RUNTIME_STATUS__[id]=telemetry;

      try{
        if(typeof blackboard?.writeAtomic==='function'){
          blackboard.writeAtomic(
            'omega.runtime.'+id,
            telemetry,
            'KERNEL',
            currentTurn ?? 0,
            IDS.slice(),
            2
          );
        }
      }catch(err){
        s.errors.push(String(err?.message||err));
        if(s.errors.length>8) s.errors.shift();
      }

      try{
        global.Omega?.Kernel?.createBridge?.().emitEvent?.('OMEGA_MINISTRY_RUNTIME_TICK',telemetry);
      }catch(_){}

      publishEvent('OMEGA_MINISTRY_RUNTIME_TICK',telemetry);
      return telemetry;
    }

    function handleMessage(id,message){
      if(!IDS.includes(String(id))) return false;
      const s=states.get(id);
      s.handledMessages += 1;
      return true;
    }

    function getIds(){
      return IDS.slice();
    }

    function getState(id){
      const s=states.get(String(id));
      return s ? JSON.parse(JSON.stringify(s)) : null;
    }

    function health(){
      const rows=IDS.map(id=>states.get(id));
      const active=rows.filter(s=>s.active).length;
      const ticked=rows.filter(s=>s.ticks>0).length;
      const failed=rows.filter(s=>s.status==='FAILED' || s.failures>0).length;
      return {count:IDS.length,active,ticked,failed,initialized};
    }

    const api=Object.freeze({version:'1.0.0',ids:IDS,specs:SPECS,init,tick,handleMessage,getIds,getState,health});
    return api;
  }

  const api=controller();
  global.OMEGA_MINISTRY_RUNTIME_V1=api;
  global.Omega=global.Omega||{};
  global.Omega.MinistryRuntime=api;
})(typeof window!=='undefined'?window:globalThis);
