/* OMEGA MINISTER INTEGRATION BRIDGE v1.0.0 */
(function(global){'use strict';
  if(global.OmegaMinisterIntegration)return;
  const registry=()=>global.OmegaMinisterStateRegistry;
  const syncUI=state=>{const ui=global.OmegaCabinetUI;if(!ui||!state)return;const m=ui.ministriesDatabase?.[state.runtimeState.ministryId];if(m){m.ministerId=state.ministerId;m.activeMinisterId=state.isActive?state.ministerId:null;m.ministerName=state.staticProfile.baseName;m.ministerProfile=state.staticProfile;m.ministerRuntime=state.runtimeState;m.ministerLearning=state.learningState;m.effectiveCapability=state.effectiveCapability;}ui.currentInterrogatedMinister=state.isActive?{ministerId:state.ministerId,name:state.staticProfile.baseName,ministerName:state.staticProfile.baseName,ministryId:state.runtimeState.ministryId,countryCode:state.runtimeState.countryId,role:m?.role,profile:state.staticProfile,runtime:state.runtimeState,learning:state.learningState}:ui.currentInterrogatedMinister;};
  const syncCognition=state=>{const c=global.OmegaCognitiveEngine;if(!c||!state)return;try{c.activeMinisterId=state.isActive?state.ministerId:null;c.currentMinisterId=state.isActive?state.ministerId:null;c.getMinisterContext=()=>registry()?.getEffectiveState?.(state.ministerId,{})||null;}catch(_){}try{global.OmegaMinisterCognitiveContext=()=>state.isActive?registry()?.getEffectiveState?.(state.ministerId,{})||null:null;}catch(_){} };
  const onSync=e=>{const state=e.detail?.effective;if(!state)return;syncUI(state);syncCognition(state);};
  function debug(ministerId){return global.OmegaMinisterBehavior?.debug?.(ministerId)||registry()?.getMinister?.(ministerId)||null;}
  function strictCheck(){const r=registry();if(!r)return{ok:false,errors:[{code:'REGISTRY_UNAVAILABLE'}],count:1};const result=r.consistencyCheck();const ui=global.OmegaCabinetUI;const errors=[...result.errors];for(const [key,id] of r.getAssignments()){
      const [cc,ministryId]=key.split(':');const active=r.getActiveMinister(cc,ministryId);if(!active)continue;const m=ui?.ministriesDatabase?.[ministryId];if(m&&(m.activeMinisterId&&m.activeMinisterId!==id||m.ministerId&&m.ministerId!==id))errors.push({code:'MINISTER_STATE_INCONSISTENCY',ministerId:id,reason:'CABINET_MINISTRY_MISMATCH',ministryId});
      const c=global.OmegaCognitiveEngine;if(c?.activeMinisterId&&c.activeMinisterId!==id)errors.push({code:'MINISTER_STATE_INCONSISTENCY',ministerId:id,reason:'COGNITIVE_ACTIVE_MISMATCH',ministryId});
    }
    return{ok:errors.length===0,errors,count:errors.length,checkedAt:Date.now()};}
  const api={version:'1.0.0',syncUI,syncCognition,debug,strictCheck};global.OmegaMinisterIntegration=api;global.getMinisterDebugState=debug;
  global.addEventListener?.('MINISTER_SYSTEM_SYNCHRONIZED',onSync);global.addEventListener?.('MINISTER_RECRUITED',e=>{const d=e.detail;if(d?.ministerId)queueMicrotask(()=>{const s=registry()?.getMinister?.(d.ministerId);if(s){syncUI(s);syncCognition(s);}})});
  global.addEventListener?.('MINISTER_FIRED',e=>{const d=e.detail;if(d?.ministerId){const s=registry()?.getMinister?.(d.ministerId);if(s){syncUI(s);syncCognition(s);}}});
  setInterval(()=>{const check=strictCheck();if(!check.ok)try{global.dispatchEvent(new CustomEvent('MINISTER_STATE_INCONSISTENCY',{detail:check}))}catch(_){}},5000);
})(typeof window!=='undefined'?window:globalThis);
