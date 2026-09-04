/**
 * OMEGA CLIENT BOOTSTRAP v1.2.0
 * Static-host-safe helper loader. Loads semantic planning, health branding,
 * and the canonical interrogation/layer guard exactly once.
 */
(function(global){
  'use strict';
  if(global.__OMEGA_CLIENT_BOOTSTRAP__) return;
  global.__OMEGA_CLIENT_BOOTSTRAP__ = true;

  const asset=file=>{try{return new URL(String(file).replace(/^\/+/,''),document.baseURI).href;}catch(_){return file;}};
  const hasScript=file=>[...document.scripts].some(s=>s.src===asset(file)||s.src.endsWith('/'+file));
  function load(file){return new Promise((resolve,reject)=>{if(hasScript(file))return resolve();const s=document.createElement('script');s.src=asset(file);s.async=false;s.dataset.omegaBootstrap='true';s.onload=resolve;s.onerror=()=>reject(new Error('Unable to load '+file));document.head.appendChild(s);});}
  async function start(){
    const order=['omega_semantic_planner.js','health-ministry-logo.js','omega_canonical_runtime_guard.js'];
    const loaded=[],failed=[];
    for(const file of order){try{await load(file);loaded.push(file);}catch(e){failed.push(file+': '+e.message);console.warn('[OMEGA BOOT]',e.message);}}
    global.__OMEGA_CLIENT_ASSETS__={loaded,failed,base:document.baseURI};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
