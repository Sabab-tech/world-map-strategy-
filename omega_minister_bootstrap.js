/* OMEGA MINISTER BOOTSTRAP v1.4.0
 * Resilient boot coordinator for the canonical minister state and its adapters.
 */
(function(global){
  'use strict';
  if(global.OmegaMinisterBootstrap?.version==='1.4.0') return;

  const scripts=[
    {src:'/minister_behavior_engine.js',ready:()=>!!global.OmegaMinisterBehavior},
    {src:'/omega_minister_integration.js',ready:()=>!!global.OmegaMinisterIntegration},
    {src:'/minister_communication_engine.js',ready:()=>!!global.OmegaMinisterCommunication}
  ];
  const pendingScripts=new Map();
  let attempts=0,started=false,booting=null,retryTimer=null;
  const MAX_BOOT_ATTEMPTS=120;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function loadScript(item){
    if(item.ready()) return Promise.resolve(true);
    const src=item.src;
    if(pendingScripts.has(src)) return pendingScripts.get(src);
    const task=new Promise((resolve,reject)=>{
      const escaped=src.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      let node=[...document.scripts].find(s=>s.getAttribute('src')===src||s.src.endsWith(src));
      if(node && node.dataset.omegaMinisterFailed==='true'){
        node.remove();
        node=null;
      }
      if(!node){
        node=document.createElement('script');
        node.src=src;
        node.async=false;
        node.dataset.omegaMinisterManaged='true';
      }
      let settled=false;
      const done=()=>{
        if(settled)return;
        settled=true;
        if(item.ready()){node.dataset.omegaMinisterLoaded='true';resolve(true);}
        else reject(new Error('Script loaded without exposing expected API: '+src));
      };
      const failed=()=>{
        if(settled)return;
        settled=true;
        node.dataset.omegaMinisterFailed='true';
        reject(new Error('Failed to load '+src));
      };
      node.addEventListener('load',done,{once:true});
      node.addEventListener('error',failed,{once:true});
      if(!node.isConnected)document.head.appendChild(node);
      else if(item.ready())done();
    }).finally(()=>pendingScripts.delete(src));
    pendingScripts.set(src,task);
    return task;
  }

  async function loadConfig(registry){
    try{
      const response=await fetch('/minister_system_config.json',{cache:'no-store'});
      if(response.ok){
        const config=await response.json();
        global.OmegaMinisterRuntimeConfig=config;
        registry.setConfig?.(config);
      }
    }catch(error){console.warn('[Minister Bootstrap] optional config load:',error.message);}
  }
  async function loadMinisters(ui){
    const response=await fetch('/ministers.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Minister profile request failed: HTTP '+response.status);
    const raw=await response.json();
    const db=raw.ministers_database||raw.ministers||{};
    ui.syncMinistersDatabase?.(db);
    global.OmegaMinistersDB=db;
  }

  function patchProfile(registry,ui){
    if(!registry||!ui)return;
    if(!ui.__canonicalMinisterProfilePatchedV3){
      ui.__canonicalMinisterProfilePatchedV3=true;
      const originalProfile=typeof ui.getMinisterProfile==='function'?ui.getMinisterProfile.bind(ui):null;
      ui.getMinisterProfile=function(ministryId,countryKey){
        const country=String(countryKey||ui.activeCountry||global.Game?.currentActiveCountry||'').toUpperCase();
        const active=registry.getActiveMinister(country,ministryId);
        if(active){
          const p=active.staticProfile;
          return {id:active.ministerId,name:p.baseName,age:p.baseAge,background:p.background,gender:p.gender,
            stats:p.baseStats,efficiency:p.efficiencyProfile,ideology:p.ideology?.type||'technocrat',
            runtime:active.runtimeState,learning:active.learningState,candidates:[]};
        }
        return originalProfile?originalProfile(ministryId,countryKey):null;
      };
    }
    if(typeof ui.getCountryDetails==='function'&&!ui.__canonicalCountryDetailsPatchedV1){
      ui.__canonicalCountryDetailsPatchedV1=true;
      const originalCountry=ui.getCountryDetails.bind(ui);
      ui.getCountryDetails=function(countryKey){
        const details=originalCountry(countryKey);
        if(!details)return details;
        const country=String(countryKey||ui.activeCountry||global.Game?.currentActiveCountry||'').toUpperCase();
        const output=JSON.parse(JSON.stringify(details));
        output.ministers=output.ministers||{};
        for(const ministryId of Object.keys(ui.ministriesDatabase||{})){
          const active=registry.getActiveMinister(country,ministryId);
          if(active)output.ministers[ministryId]={name:active.staticProfile.baseName,
            role:ui.ministriesDatabase[ministryId]?.role||'Cabinet Minister',ministerId:active.ministerId};
        }
        return output;
      };
    }
  }

  async function boot(){
    if(started)return true;
    if(booting)return booting;
    booting=(async()=>{
      attempts++;
      const registry=global.OmegaMinisterStateRegistry;
      const ui=global.OmegaCabinetUI;
      if(!registry||!ui){
        if(attempts<MAX_BOOT_ATTEMPTS)scheduleRetry(150);
        return false;
      }
      try{
        await Promise.all([loadConfig(registry),loadMinisters(ui)]);
        await Promise.all(scripts.map(loadScript));
        patchProfile(registry,ui);
        const check=registry.consistencyCheck?.()||{ok:true,errors:[]};
        global.dispatchEvent(new CustomEvent('MINISTER_RUNTIME_READY',{
          detail:{registryVersion:registry.VERSION,behaviorVersion:global.OmegaMinisterBehavior?.VERSION||null,
            communicationVersion:global.OmegaMinisterCommunication?.version||null,consistency:check}
        }));
        global.dispatchEvent(new CustomEvent('OMEGA_MINISTER_BOOTSTRAP_READY',{
          detail:{version:'1.4.0',attempts,consistency:check}
        }));
        started=true;
        return true;
      }catch(error){
        console.warn('[Minister Bootstrap] recoverable boot failure:',error.message);
        if(attempts<MAX_BOOT_ATTEMPTS)scheduleRetry(Math.min(1500,150+attempts*25));
        return false;
      }
    })().finally(()=>{booting=null;});
    return booting;
  }
  function scheduleRetry(ms){
    if(retryTimer!==null||started)return;
    retryTimer=setTimeout(()=>{retryTimer=null;boot();},ms);
  }

  global.addEventListener?.('OMEGA_MINISTER_RUNTIME_READY',()=>{if(!started)boot();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot(),{once:true});
  else boot();
  global.OmegaMinisterBootstrap={version:'1.4.0',boot,diagnostics:()=>({started,attempts,pendingScripts:[...pendingScripts.keys()]})};
})(typeof window!=='undefined'?window:globalThis);
