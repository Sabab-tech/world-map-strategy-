/*
 * OMEGA CANONICAL 17-MINISTRY RUNTIME CONTROLLER v2.0.0
 * ---------------------------------------------------------------------------
 * One authoritative runtime contract for all 17 ministries.
 *
 * Guarantees:
 *   1. Canonical registration for all 17 ministries.
 *   2. One simulation scheduler (the main OMEGA engine loop).
 *   3. Real domain-source adapters where an existing engine/state surface exists.
 *   4. Shared inter-ministry state packets through the kernel blackboard.
 *   5. Active minister-state linkage through OmegaMinisterStateRegistry.
 *   6. Deterministic dependency snapshots using last-known runtime packets.
 *   7. Provenance/health telemetry without fabricating missing world data.
 *
 * This layer does NOT invent economic, demographic, military, or resource facts.
 * Missing inputs remain explicitly unavailable.
 */
(function(global){
  'use strict';

  const IDS = Object.freeze([
    'cabinet','defense','military','finance','economy','trade','foreign',
    'intelligence','interior','transport','resource','health','education',
    'technology','projects','culture','statistics'
  ]);

  const SPECS = Object.freeze({
    cabinet:      { domain:'executive_coordination', aliases:['cabinet_council'], dependencies:['finance','economy','defense','foreign'] },
    defense:      { domain:'defense_policy', aliases:['defence'], dependencies:['finance','resource','foreign','military'] },
    military:     { domain:'force_readiness', aliases:['armed_forces'], dependencies:['defense','finance','resource'] },
    finance:      { domain:'fiscal_state', aliases:['treasury_finance','treasury','tax'], dependencies:['economy','statistics','projects'] },
    economy:      { domain:'economic_state', aliases:['macroeconomics'], dependencies:['finance','trade','resource','transport'] },
    trade:        { domain:'commerce_state', aliases:['commerce'], dependencies:['economy','foreign','transport','resource'] },
    foreign:      { domain:'diplomatic_state', aliases:['foreign_affairs','diplomacy'], dependencies:['defense','trade','intelligence'] },
    intelligence: { domain:'intelligence_state', aliases:['intelligence_cyber','security_intelligence'], dependencies:['foreign','interior','defense'] },
    interior:    { domain:'civil_administration', aliases:['interior_security','home_affairs'], dependencies:['finance','health','statistics'] },
    transport:   { domain:'infrastructure_logistics', aliases:['infrastructure','road_transport'], dependencies:['economy','resource','projects'] },
    resource:     { domain:'resource_governance', aliases:['energy_mining','resources'], dependencies:['economy','transport','technology'] },
    health:       { domain:'public_health', aliases:['health_welfare'], dependencies:['finance','interior','education','statistics'] },
    education:    { domain:'human_capital', aliases:['education_ministry'], dependencies:['finance','technology','health','economy'] },
    technology:   { domain:'science_technology', aliases:['science_research','science_technology'], dependencies:['education','finance','defense'] },
    projects:     { domain:'government_projects', aliases:['mega_projects','laws_projects'], dependencies:['finance','transport','technology'] },
    culture:      { domain:'culture_media', aliases:['culture_media'], dependencies:['education','foreign','interior'] },
    statistics:   { domain:'national_statistics', aliases:['statistics_ministry'], dependencies:['economy','finance','health','education'] }
  });

  const SOURCE_KEYS = Object.freeze([
    'OmegaCabinetUI','ResourceMinistryEngine','EducationEngine',
    'WorldEcosystemEngine','Game','OmegaMinisterStateRegistry'
  ]);

  const clone = (value, seen = new WeakMap()) => {
    if(value === null || typeof value !== 'object') return value;
    if(seen.has(value)) return seen.get(value);
    if(value instanceof Date) return new Date(value.getTime());
    if(Array.isArray(value)){
      const out=[]; seen.set(value,out);
      for(const v of value) out.push(clone(v,seen));
      return out;
    }
    const out={}; seen.set(value,out);
    for(const k of Object.keys(value)){
      try{ out[k]=clone(value[k],seen); }catch(_){}
    }
    return out;
  };

  const own = (obj,key) => !!obj && Object.prototype.hasOwnProperty.call(obj,key);
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

  function now(){ return Date.now(); }

  function getCountryId(){
    const ui=global.OmegaCabinetUI;
    const g=global.Game;
    const candidates=[
      ui?.activeCountry,
      ui?.currentActiveCountry,
      g?.currentActiveCountry,
      g?.state?.countryId,
      g?.state?.playerCountryId,
      global.currentActiveCountry,
      global.activeCountry
    ];
    for(const value of candidates){
      if(value !== undefined && value !== null && String(value).trim()){
        return String(value).trim().toUpperCase();
      }
    }
    return null;
  }

  function getGameState(){
    return global.Game?.state || global.gameState || null;
  }

  function getWorldProfile(countryId){
    if(!countryId) return null;
    const engine=global.WorldEcosystemEngine;
    if(engine && typeof engine.getCountryProfile==='function'){
      try{ return engine.getCountryProfile(countryId); }catch(_){}
    }
    return null;
  }

  function getResourceState(countryId){
    const engine=global.ResourceMinistryEngine;
    if(!engine || !countryId) return null;
    try{
      if(typeof engine.getIntegratedResourceState==='function'){
        return engine.getIntegratedResourceState(countryId);
      }
    }catch(_){}
    try{
      if(typeof engine.getCountryResourceProfile==='function'){
        return engine.getCountryResourceProfile(countryId);
      }
    }catch(_){}
    return null;
  }

  function getMinisterState(ministryId,countryId){
    const registry=global.OmegaMinisterStateRegistry;
    if(!registry || !countryId) return null;
    const aliases=[ministryId,...(SPECS[ministryId]?.aliases||[])];
    for(const id of aliases){
      try{
        const active=registry.getActiveMinister?.(countryId,id);
        if(active) return { ministryId:id, active:clone(active) };
      }catch(_){}
    }
    return null;
  }

  function relevantState(ministryId, gameState, worldProfile, resourceState){
    const econ=gameState?.economy;
    const pop=gameState?.population;
    const society=gameState?.society;
    const relations=gameState?.relations;
    const state={};

    switch(ministryId){
      case 'cabinet':
        if(worldProfile?.government) state.government=clone(worldProfile.government);
        if(worldProfile?.population) state.population=clone(worldProfile.population);
        break;
      case 'defense':
      case 'military':
        if(worldProfile?.geography) state.geography=clone(worldProfile.geography);
        if(worldProfile?.resources) state.resources=clone(worldProfile.resources);
        if(worldProfile?.tech) state.tech=clone(worldProfile.tech);
        if(worldProfile?.government) state.government=clone(worldProfile.government);
        break;
      case 'finance':
      case 'economy':
        if(econ) state.economy=clone(econ);
        if(worldProfile?.economy) state.worldEconomy=clone(worldProfile.economy);
        if(worldProfile?.government) state.government=clone(worldProfile.government);
        break;
      case 'trade':
        if(econ) state.economy=clone(econ);
        if(worldProfile?.resources) state.resources=clone(worldProfile.resources);
        if(worldProfile?.blocs) state.blocs=clone(worldProfile.blocs);
        if(worldProfile?.influenceSphere) state.influenceSphere=worldProfile.influenceSphere;
        break;
      case 'foreign':
        if(relations) state.relations=clone(relations);
        if(worldProfile?.blocs) state.blocs=clone(worldProfile.blocs);
        if(worldProfile?.influenceSphere) state.influenceSphere=worldProfile.influenceSphere;
        if(worldProfile?.media) state.media=clone(worldProfile.media);
        break;
      case 'intelligence':
        if(worldProfile?.aiPersonality) state.aiPersonality=clone(worldProfile.aiPersonality);
        if(worldProfile?.media) state.media=clone(worldProfile.media);
        if(worldProfile?.tech) state.tech=clone(worldProfile.tech);
        if(worldProfile?.government) state.government=clone(worldProfile.government);
        break;
      case 'interior':
        if(worldProfile?.government) state.government=clone(worldProfile.government);
        if(worldProfile?.population) state.population=clone(worldProfile.population);
        if(society) state.society=clone(society);
        break;
      case 'transport':
        if(worldProfile?.geography) state.geography=clone(worldProfile.geography);
        if(econ) state.economy=clone(econ);
        if(worldProfile?.resources) state.resources=clone(worldProfile.resources);
        break;
      case 'resource':
        if(resourceState) state.resourceEngine=clone(resourceState);
        else if(worldProfile?.resources) state.resources=clone(worldProfile.resources);
        break;
      case 'health':
        if(worldProfile?.population) state.population=clone(worldProfile.population);
        if(pop) state.populationData=clone(pop);
        if(society) state.society=clone(society);
        break;
      case 'education':
        if(pop) state.population=clone(pop);
        if(worldProfile?.population) state.demography=clone(worldProfile.population);
        if(worldProfile?.tech) state.tech=clone(worldProfile.tech);
        break;
      case 'technology':
        if(worldProfile?.tech) state.tech=clone(worldProfile.tech);
        if(pop) state.population=clone(pop);
        break;
      case 'projects':
        if(econ) state.economy=clone(econ);
        if(worldProfile?.government) state.government=clone(worldProfile.government);
        break;
      case 'culture':
        if(worldProfile?.media) state.media=clone(worldProfile.media);
        if(worldProfile?.population) state.population=clone(worldProfile.population);
        break;
      case 'statistics':
        if(econ) state.economy=clone(econ);
        if(pop) state.population=clone(pop);
        if(society) state.society=clone(society);
        if(worldProfile?.government) state.government=clone(worldProfile.government);
        break;
    }

    if(Object.keys(state).length===0){
      const fallback={};
      if(econ) fallback.economy=clone(econ);
      if(pop) fallback.population=clone(pop);
      if(society) fallback.society=clone(society);
      return fallback;
    }
    return state;
  }

  function sourceStatus(ministryId,countryId, gameState, worldProfile, resourceState){
    const sources=[];
    if(global.OmegaCabinetUI) sources.push('OmegaCabinetUI');
    if(global.WorldEcosystemEngine && worldProfile) sources.push('WorldEcosystemEngine');
    if(global.Game?.state || global.gameState) sources.push('GameState');
    if(resourceState) sources.push('ResourceMinistryEngine');
    if(global.EducationEngine) sources.push('EducationEngine');
    if(global.OmegaMinisterStateRegistry && countryId) sources.push('OmegaMinisterStateRegistry');

    const direct={
      cabinet:['OmegaCabinetUI'],
      resource:['ResourceMinistryEngine'],
      education:['EducationEngine']
    }[ministryId]||[];

    const directConnected=direct.some(name=>sources.includes(name));
    const worldConnected=sources.includes('WorldEcosystemEngine')||sources.includes('GameState');

    return {
      level: directConnected?'ENGINE_CONNECTED':(worldConnected?'WORLD_STATE_CONNECTED':'RUNTIME_CONNECTED'),
      availableSources:sources,
      expectedDirectSources:direct
    };
  }

  const api = (() => {
    const states=new Map(IDS.map(id=>[id,{
      id, domain:SPECS[id].domain, status:'REGISTERED', active:false,
      ticks:0, lastTick:null, lastUpdate:null, lastDt:0,
      runtimeRevision:0, failures:0, handledMessages:0,
      phase:'BOOT', sourceStatus:null, countryId:null,
      dependencies:{}, minister:null, domainState:{}, errors:[]
    }]));
    const packets=new Map();
    let kernel=null;
    let bridge=null;
    let initialized=false;
    let packetRevision=0;
    let cachedContext={turn:null,countryId:null,gameState:null,worldProfile:null,resourceState:null};

    function init(nextKernel){
      if(initialized && kernel && (!nextKernel || nextKernel===kernel)) return true;

      kernel=nextKernel||global.Omega?.Kernel||null;
      if(!kernel || typeof kernel.registerMinistry!=='function') return false;
      bridge=typeof kernel.createBridge==='function'?kernel.createBridge():null;

      for(const id of IDS){
        kernel.registerMinistry(id);
        const s=states.get(id);
        s.status=typeof kernel.getMinistryState==='function'?kernel.getMinistryState(id):'REGISTERED';
      }

      global.__OMEGA_MINISTRY_RUNTIME_STATUS__=global.__OMEGA_MINISTRY_RUNTIME_STATUS__||{};
      global.Omega=global.Omega||{};
      global.Omega.App=global.Omega.App||{};
      global.Omega.App.MINISTRIES=Object.freeze(IDS.slice());
      global.Omega.App.activeMinistries=Object.freeze(IDS.slice());
      global.Omega.App.ministryRuntime=api;

      initialized=true;
      try{ global.dispatchEvent?.(new CustomEvent('OMEGA_17_MINISTRY_RUNTIME_READY',{detail:{count:17,ids:IDS.slice(),version:'2.0.0'}})); }catch(_){}
      return true;
    }

    function refreshContext(currentTurn){
      const countryId=getCountryId();
      if(cachedContext.turn===currentTurn && cachedContext.countryId===countryId) return cachedContext;
      const gameState=getGameState();
      const worldProfile=getWorldProfile(countryId);
      const resourceState=getResourceState(countryId);
      cachedContext={turn:currentTurn,countryId,gameState,worldProfile,resourceState};
      return cachedContext;
    }

    function readDependencyPacket(id, blackboard){
      if(blackboard && typeof blackboard.read==='function'){
        try{
          const val=blackboard.read('omega.runtime.'+id,'KERNEL');
          if(val) return clone(val);
        }catch(_){}
      }
      return clone(packets.get(id)||null);
    }

    function tick(id,dt,currentTurn,store,blackboard){
      id=String(id);
      if(!IDS.includes(id)) return null;

      const spec=SPECS[id];
      const s=states.get(id);
      const ctx=refreshContext(currentTurn);
      const sources=sourceStatus(id,ctx.countryId,ctx.gameState,ctx.worldProfile,ctx.resourceState);
      const domainState=relevantState(id,ctx.gameState,ctx.worldProfile,ctx.resourceState);
      const minister=getMinisterState(id,ctx.countryId);
      const dependencyPackets={};

      for(const dep of spec.dependencies){
        const packet=readDependencyPacket(dep,blackboard);
        if(packet){
          dependencyPackets[dep]={
            tick:packet.tick,
            domain:packet.domain,
            active:packet.active,
            sourceLevel:packet.sourceLevel,
            runtimeRevision:packet.runtimeRevision,
            domainState:clone(packet.domainState)
          };
        }else{
          dependencyPackets[dep]={available:false};
        }
      }

      const phase=['OBSERVE','VALIDATE','PROCESS','COMMIT'][Math.max(0,Number(currentTurn)||0)%4];
      const kernelStatus=typeof kernel?.getMinistryState==='function'?kernel.getMinistryState(id):'RUNNING';
      const active=kernelStatus==='RUNNING'||kernelStatus==='READY';

      s.status=kernelStatus;
      s.active=active;
      s.ticks+=1;
      s.lastTick=currentTurn??null;
      s.lastUpdate=now();
      s.lastDt=finite(dt)??0;
      s.runtimeRevision+=1;
      s.phase=phase;
      s.countryId=ctx.countryId;
      s.sourceStatus=sources;
      s.dependencies=clone(dependencyPackets);
      s.minister=clone(minister);
      s.domainState=clone(domainState);

      if(store){
        if(store.policies instanceof Map){
          store.policies.set('__omega_runtime__',{
            ministryId:id,domain:spec.domain,phase,runtimeRevision:s.runtimeRevision,
            tick:s.lastTick,active,sourceLevel:sources.level,countryId:ctx.countryId,
            dependencies:clone(dependencyPackets)
          });
        }
        if(store.knowledgeGraph instanceof Map){
          store.knowledgeGraph.set('__omega_runtime_domain__',{
            domain:spec.domain,countryId:ctx.countryId,
            sourceLevel:sources.level,availableSources:sources.availableSources.slice(),
            dependencyCount:spec.dependencies.length,
            revision:s.runtimeRevision
          });
        }
        if(Array.isArray(store.goalStack)){
          const marker='RUNTIME:'+id;
          if(!store.goalStack.includes(marker) && store.goalStack.length<32) store.goalStack.push(marker);
        }
      }

      const packet={
        id,
        domain:spec.domain,
        tick:s.lastTick,
        phase,
        active,
        status:kernelStatus,
        runtimeRevision:s.runtimeRevision,
        countryId:ctx.countryId,
        sourceLevel:sources.level,
        availableSources:sources.availableSources.slice(),
        domainState:clone(domainState),
        dependencies:clone(dependencyPackets),
        minister:clone(minister),
        timestamp:s.lastUpdate,
        packetRevision:++packetRevision
      };

      packets.set(id,packet);
      global.__OMEGA_MINISTRY_RUNTIME_STATUS__[id]=clone(packet);

      try{
        blackboard?.writeAtomic?.(
          'omega.runtime.'+id,
          packet,
          'KERNEL',
          currentTurn??0,
          IDS.slice(),
          2
        );
      }catch(err){
        s.errors.push(String(err?.message||err));
        if(s.errors.length>8) s.errors.shift();
      }

      try{ bridge?.emitEvent?.('OMEGA_MINISTRY_RUNTIME_TICK',packet); }catch(_){}
      try{ global.dispatchEvent?.(new CustomEvent('OMEGA_MINISTRY_RUNTIME_TICK',{detail:packet})); }catch(_){}

      return clone(packet);
    }

    function handleMessage(id,message){
      if(!IDS.includes(String(id))) return false;
      const s=states.get(String(id));
      s.handledMessages+=1;
      return true;
    }

    function getIds(){ return IDS.slice(); }
    function getState(id){ const s=states.get(String(id)); return s?clone(s):null; }
    function getPacket(id){ return clone(packets.get(String(id))||null); }

    function getConnectionMatrix(){
      return IDS.map(id=>{
        const s=states.get(id);
        return {
          id,
          domain:s.domain,
          active:s.active,
          ticks:s.ticks,
          sourceLevel:s.sourceStatus?.level||'UNKNOWN',
          sourceCount:s.sourceStatus?.availableSources?.length||0,
          dependencies:Object.keys(s.dependencies||{}).length,
          expectedDependencies:SPECS[id].dependencies.length,
          ministerLinked:!!s.minister
        };
      });
    }

    function health(){
      const rows=IDS.map(id=>states.get(id));
      const active=rows.filter(s=>s.active).length;
      const ticked=rows.filter(s=>s.ticks>0).length;
      const failed=rows.filter(s=>s.status==='FAILED'||s.failures>0).length;
      const sourceConnected=rows.filter(s=>s.sourceStatus?.level!=='RUNTIME_CONNECTED').length;
      const ministerLinked=rows.filter(s=>!!s.minister).length;
      return {
        version:'2.0.0',
        initialized,
        count:IDS.length,
        active,ticked,failed,
        sourceConnected,ministerLinked,
        fullyRuntimeLinked:rows.filter(s=>s.active&&s.ticks>0).length
      };
    }

    const api=Object.freeze({
      version:'2.0.0',
      ids:IDS,
      specs:SPECS,
      init,
      tick,
      handleMessage,
      getIds,
      getState,
      getPacket,
      getConnectionMatrix,
      health
    });

    return api;
  })();

  global.OMEGA_MINISTRY_RUNTIME_V1=api;
  global.Omega=global.Omega||{};
  global.Omega.MinistryRuntime=api;
})(typeof window!=='undefined'?window:globalThis);
