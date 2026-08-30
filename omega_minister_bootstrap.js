/* OMEGA MINISTER BOOTSTRAP v1.0.0 */
(function(global){'use strict';
  const boot=()=>{
    const registry=global.OmegaMinisterStateRegistry;
    const ui=global.OmegaCabinetUI;
    if(!registry||!ui)return false;
    const loadConfig=async()=>{try{const r=await fetch('/minister_system_config.json',{cache:'no-store'});if(r.ok){const c=await r.json();registry.setConfig(c);}}catch(_){} };
    const loadMinisters=async()=>{try{const r=await fetch('/ministers.json',{cache:'no-store'});if(!r.ok)return;const raw=await r.json();const db=raw.ministers_database||{};ui.syncMinistersDatabase?.(db);global.OmegaMinistersDB=db;}catch(e){console.warn('[Minister Bootstrap] profile load:',e.message)}};
    const patchProfile=()=>{
      if(ui.__canonicalMinisterProfilePatched)return;
      ui.__canonicalMinisterProfilePatched=true;
      const original=ui.getMinisterProfile?.bind(ui);
      ui.getMinisterProfile=function(ministryId,countryKey){
        const cc=String(countryKey||ui.activeCountry||global.Game?.currentActiveCountry||'').toUpperCase();
        const active=registry.getActiveMinister(cc,ministryId);
        if(active)return {id:active.ministerId,name:active.staticProfile.baseName,age:active.staticProfile.baseAge,background:active.staticProfile.background,gender:active.staticProfile.gender,stats:active.staticProfile.baseStats,efficiency:active.staticProfile.efficiencyProfile,ideology:active.staticProfile.ideology?.type||'technocrat',runtime:active.runtimeState,learning:active.learningState,candidates:[]};
        return original?original(ministryId,countryKey):null;
      };
    };
    const bind=()=>{global.addEventListener('MINISTER_SYSTEM_SYNCHRONIZED',e=>{const d=e.detail;if(!d?.effective)return;const s=d.effective;const m=ui.ministriesDatabase?.[s.runtimeState.ministryId];if(m){m.ministerId=s.ministerId;m.activeMinisterId=s.isActive?s.ministerId:null;m.ministerProfile=s.staticProfile;m.ministerRuntime=s.runtimeState;m.ministerLearning=s.learningState;m.effectiveCapability=s.effectiveCapability;m.ministerName=s.staticProfile.baseName;}try{ui.renderCabinet?.(ui.activeCountry)}catch(_){}try{if(ui.currentDashboardMinistryId===s.runtimeState.ministryId)ui.renderMinistryDashboard?.(s.runtimeState.ministryId)}catch(_){}});};
    patchProfile();bind();loadConfig().then(loadMinisters).then(()=>{
      const active=ui.activeCountry||global.Game?.currentActiveCountry;
      const db=ui.ministriesDatabase||{};
      for(const ministryId of Object.keys(db)){registry.getActiveMinister(active,ministryId);}
      registry.consistencyCheck();
    });
    return true;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  global.OmegaMinisterBootstrap={version:'1.0.0',boot};
})(typeof window!=='undefined'?window:globalThis);
