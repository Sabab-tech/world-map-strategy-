/* OMEGA RESOURCE MINISTRY ENGINE v1.0.0
 * Compatibility/authority facade over the existing canonical resource bridge.
 * The bridge owns resource identity; this facade provides the runtime API
 * expected by the game, opponent, world ecosystem and ministry UI.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0';
  if(g.ResourceMinistryEngine?.VERSION===VERSION)return;

  const id=v=>String(v??'').trim().toUpperCase();
  const clone=v=>{try{return v===undefined?undefined:JSON.parse(JSON.stringify(v));}catch(_){return null;}};
  const bridge=()=>g.OmegaResourceSemanticBridge||null;
  const state=()=>g.Game?.state||g.gameState||{};

  function countryState(countryId){
    const c=id(countryId),s=state();
    const resource=s?.resource?.[c]||s?.resources?.[c]||s?.resourceSummary?.[c]||{};
    return resource&&typeof resource==='object'?resource:{};
  }

  function resourceTypes(){
    const b=bridge();
    try{
      const o=b?.ontology?.()||{};
      const roots=[o?.COMMODITY_ONTOLOGIES,o?.resource_types,o?.resources,o?.RESOURCE_DATABASE].filter(Boolean);
      const out=[];
      for(const root of roots)for(const [k,v] of Object.entries(root))out.push({
        id:String(v?.id||k).toUpperCase(),
        name:v?.name||v?.canonicalName||k,
        raw:clone(v)
      });
      return out.filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i);
    }catch(_){return[];}
  }

  function getIntegratedResourceState(countryId){
    const c=id(countryId),raw=countryState(c);
    const pick=k=>raw?.[k]&&typeof raw[k]==='object'?raw[k]:{};
    const inventory=clone(pick('inventory'));
    const production=clone(pick('production'));
    const consumption=clone(pick('consumption'));
    const reserves=clone(pick('reserves'));
    let deposits=[];
    const b=bridge();
    try{
      const q=b?.exportData?.({countryId:c,operation:'LOCATE'});
      deposits=Array.isArray(q?.locations)?clone(q.locations):[];
    }catch(_){}
    return{
      countryId:c,
      inventory:inventory||{},
      production:production||{},
      consumption:consumption||{},
      reserves:reserves||{},
      deposits,
      source:raw&&Object.keys(raw).length?'Game.state':'OMEGA_RESOURCE_SEMANTIC_BRIDGE',
      authority:'OMEGA_RESOURCE_AUTHORITY_FACADE',
      bridgeReady:!!b?.diagnostics?.().ready
    };
  }

  function getSummary(countryId){
    const r=getIntegratedResourceState(countryId);
    return{
      countryId:r.countryId,
      inventory:clone(r.inventory),
      production:clone(r.production),
      consumption:clone(r.consumption),
      reserves:clone(r.reserves),
      depositCount:Array.isArray(r.deposits)?r.deposits.length:0,
      bridgeReady:r.bridgeReady,
      source:r.source
    };
  }

  function getCountryResourceProfile(countryId){
    const c=id(countryId),b=bridge();
    try{
      const exported=b?.exportData?.({countryId:c,operation:'LOCATE'});
      return{
        countryId:c,
        resourceState:getIntegratedResourceState(c),
        locations:clone(exported?.locations||[]),
        countries:clone(exported?.countries||[]),
        source:exported?.source||'OMEGA_RESOURCE_SEMANTIC_BRIDGE'
      };
    }catch(_){
      return{
        countryId:c,
        resourceState:getIntegratedResourceState(c),
        locations:[],
        countries:[],
        source:'GAME_STATE'
      };
    }
  }

  function queryResource(resourceId,countryId=null,operation='LOCATE'){
    const b=bridge();
    try{
      return b?.queryResource?.({
        resourceId,countryId,operation,worldwide:!countryId
      })||null;
    }catch(_){return null;}
  }

  function executeDirective(directive,resId){
    const b=bridge();
    const d=String(directive||'').trim();
    const rid=String(resId||'').trim();
    try{
      const result=b?.executeResource?.({
        operation:'DIRECTIVE',
        directive:d,
        resourceEntityId:rid
      });
      return result||{
        ok:false,
        status:'UNAVAILABLE',
        reason:'RESOURCE_DIRECTIVE_EXECUTOR_NOT_REGISTERED',
        directive:d,
        resourceId:rid
      };
    }catch(e){
      return{
        ok:false,
        status:'FAILED',
        reason:String(e?.message||e),
        directive:d,
        resourceId:rid
      };
    }
  }

  function openModal(countryId,mode='matrix'){
    try{
      g.dispatchEvent?.(new CustomEvent('OMEGA_RESOURCE_MODAL_REQUEST',{
        detail:{countryId:id(countryId),mode:String(mode)}
      }));
    }catch(_){}
    return{
      ok:true,
      countryId:id(countryId),
      mode:String(mode),
      source:'RESOURCE_MINISTRY_ENGINE'
    };
  }

  const api={
    VERSION,
    getIntegratedResourceState,
    getSummary,
    getCountryResourceProfile,
    queryResource,
    executeDirective,
    openModal,
    diagnostics:()=>({
      version:VERSION,
      bridgeAvailable:!!bridge(),
      bridgeReady:!!bridge()?.diagnostics?.().ready,
      resourceTypeCount:resourceTypes().length
    }),
    getResourceTypes:resourceTypes
  };

  Object.defineProperty(api,'deposits',{
    enumerable:true,
    get(){
      const b=bridge();
      try{
        return clone(b?.exportData?.().resourceRecords||[]);
      }catch(_){return[];}
    }
  });

  g.ResourceMinistryEngine=api;
})(typeof globalThis!=='undefined'?globalThis:window);
