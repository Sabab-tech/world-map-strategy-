/* OMEGA MINISTER BOOTSTRAP v1.2.0 */
(function(global){'use strict';
  const scripts=['/minister_behavior_engine.js','/omega_minister_integration.js'];
  const loadScript=src=>new Promise((resolve,reject)=>{if(document.querySelector(`script[src="${src}"]`)){resolve();return;}const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=()=>reject(new Error(`Failed to load ${src}`));document.head.appendChild(s);});
  const boot=()=>{
    const registry=global.OmegaMinisterStateRegistry,ui=global.OmegaCabinetUI;if(!registry||!ui)return false;
    const loadConfig=async()=>{try{const r=await fetch('/minister_system_config.json',{cache:'no-store'});if(r.ok){const c=await r.json();global.OmegaMinisterRuntimeConfig=c;registry.setConfig(c);}}catch(e){console.warn('[Minister Bootstrap] config load:',e.message)}};
    const loadMinisters=async()=>{try{const r=await fetch('/ministers.json',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const raw=await r.json();const db=raw.ministers_database||{};ui.syncMinistersDatabase?.(db);global.OmegaMinistersDB=db;}catch(e){console.warn('[Minister Bootstrap] profile load:',e.message);}};
    const patchProfile=()=>{
      if(ui.__canonicalMinisterProfilePatchedV2)return;
      ui.__canonicalMinisterProfilePatchedV2=true;
      const originalProfile=typeof ui.getMinisterProfile==='function'?ui.getMinisterProfile.bind(ui):null;
      ui.getMinisterProfile=function(ministryId,countryKey){const cc=String(countryKey||ui.activeCountry||global.Game?.currentActiveCountry||'').toUpperCase();const active=registry.getActiveMinister(cc,ministryId);if(active){const p=active.staticProfile;return {id:active.ministerId,name:p.baseName,age:p.baseAge,background:p.background,gender:p.gender,stats:p.baseStats,efficiency:p.efficiencyProfile,ideology:p.ideology?.type||'technocrat',runtime:active.runtimeState,learning:active.learningState,candidates:[]};}return originalProfile?originalProfile(ministryId,countryKey):null;};
      const originalCountry=typeof ui.getCountryDetails==='function'?ui.getCountryDetails.bind(ui):null;
      if(originalCountry&&!ui.__canonicalCountryDetailsPatchedV1){ui.__canonicalCountryDetailsPatchedV1=true;ui.getCountryDetails=function(countryKey){const details=originalCountry(countryKey);if(!details)return details;const cc=String(countryKey||ui.activeCountry||global.Game?.currentActiveCountry||'').toUpperCase();const out=JSON.parse(JSON.stringify(details));out.ministers=out.ministers||{};for(const ministryId of Object.keys(ui.ministriesDatabase||{})){const active=registry.getActiveMinister(cc,ministryId);if(active)out.ministers[ministryId]={name:active.staticProfile.baseName,role:ui.ministriesDatabase[ministryId]?.role||'Cabinet Minister',ministerId:active.ministerId};}return out;};}
    };
    patchProfile();
    Promise.all([loadConfig(),loadMinisters()]).then(()=>Promise.all(scripts.map(loadScript))).then(()=>{patchProfile();registry.consistencyCheck();global.dispatchEvent(new CustomEvent('MINISTER_RUNTIME_READY',{detail:{registryVersion:registry.VERSION}}));}).catch(e=>console.warn('[Minister Bootstrap] runtime bridge load:',e.message));
    return true;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  global.OmegaMinisterBootstrap={version:'1.2.0',boot};
})(typeof window!=='undefined'?window:globalThis);
