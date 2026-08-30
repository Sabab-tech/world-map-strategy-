/* OMEGA MINISTER BOOTSTRAP v1.1.0 */
(function(global){'use strict';
  const boot=()=>{
    const registry=global.OmegaMinisterStateRegistry,ui=global.OmegaCabinetUI;
    if(!registry||!ui)return false;
    const loadConfig=async()=>{try{const r=await fetch('/minister_system_config.json',{cache:'no-store'});if(r.ok){const c=await r.json();global.OmegaMinisterRuntimeConfig=c;registry.setConfig(c);}}catch(e){console.warn('[Minister Bootstrap] config load:',e.message)}};
    const loadMinisters=async()=>{try{const r=await fetch('/ministers.json',{cache:'no-store'});if(!r.ok)return;const raw=await r.json();const db=raw.ministers_database||{};ui.syncMinistersDatabase?.(db);global.OmegaMinistersDB=db;}catch(e){console.warn('[Minister Bootstrap] profile load:',e.message)}};
    const patchProfile=()=>{
      if(ui.__canonicalMinisterProfilePatchedV2)return;
      ui.__canonicalMinisterProfilePatchedV2=true;
      const originalProfile=typeof ui.getMinisterProfile==='function'?ui.getMinisterProfile.bind(ui):null;
      ui.getMinisterProfile=function(ministryId,countryKey){
        const cc=String(countryKey||ui.activeCountry||global.Game?.currentActiveCountry||'').toUpperCase();
        const active=registry.getActiveMinister(cc,ministryId);
        if(active){const p=active.staticProfile;return {id:active.ministerId,name:p.baseName,age:p.baseAge,background:p.background,gender:p.gender,stats:p.baseStats,efficiency:p.efficiencyProfile,ideology:p.ideology?.type||'technocrat',runtime:active.runtimeState,learning:active.learningState,candidates:[]};}
        return originalProfile?originalProfile(ministryId,countryKey):null;
      };
      const originalCountry=typeof ui.getCountryDetails==='function'?ui.getCountryDetails.bind(ui):null;
      if(originalCountry&&!ui.__canonicalCountryDetailsPatchedV1){
        ui.__canonicalCountryDetailsPatchedV1=true;
        ui.getCountryDetails=function(countryKey){
          const details=originalCountry(countryKey);if(!details)return details;
          const cc=String(countryKey||ui.activeCountry||global.Game?.currentActiveCountry||'').toUpperCase();
          const out=JSON.parse(JSON.stringify(details));out.ministers=out.ministers||{};
          for(const ministryId of Object.keys(ui.ministriesDatabase||{})){const active=registry.getActiveMinister(cc,ministryId);if(active)out.ministers[ministryId]={name:active.staticProfile.baseName,role:ui.ministriesDatabase[ministryId]?.role||'Cabinet Minister',ministerId:active.ministerId};}
          return out;
        };
      }
    };
    const bind=()=>{
      global.addEventListener('MINISTER_SYSTEM_SYNCHRONIZED',e=>{
        const s=e.detail?.effective;if(!s)return;const m=ui.ministriesDatabase?.[s.runtimeState.ministryId];
        if(m){m.ministerId=s.ministerId;m.activeMinisterId=s.isActive?s.ministerId:null;m.ministerProfile=s.staticProfile;m.ministerRuntime=s.runtimeState;m.ministerLearning=s.learningState;m.effectiveCapability=s.effectiveCapability;m.ministerName=s.staticProfile.baseName;}
        try{ui.renderCabinet?.(ui.activeCountry)}catch(_){}
        try{if(ui.currentDashboardMinistryId===s.runtimeState.ministryId)ui.renderMinistryDashboard?.(s.runtimeState.ministryId)}catch(_){}
      });
    };
    patchProfile();bind();
    Promise.all([loadConfig(),loadMinisters()]).then(()=>{patchProfile();registry.consistencyCheck();});
    return true;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  global.OmegaMinisterBootstrap={version:'1.1.0',boot};
})(typeof window!=='undefined'?window:globalThis);
