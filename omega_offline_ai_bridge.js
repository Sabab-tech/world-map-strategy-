/* OMEGA OFFLINE AI BRIDGE v1.0.0
 * The ONLY OMEGA component allowed to know local AI runtime/package details.
 * It refuses packages that are not proven Android local-inference runtimes.
 */
(function(global){
  'use strict';
  if(global.OmegaOfflineAIBridge?.VERSION==='1.0.0')return;
  const VERSION='1.0.0',MANIFEST_PATH='offline_ai/manifest.json';
  const text=v=>String(v==null?'':v).trim();
  const clone=v=>{try{return v===undefined?undefined:JSON.parse(JSON.stringify(v));}catch(_){return null;}};
  let manifestCache=null,initialized=false,initError=null;
  async function loadManifest(){
    if(manifestCache)return manifestCache;
    if(global.OmegaOfflineAIBridgeManifest){manifestCache=clone(global.OmegaOfflineAIBridgeManifest);return manifestCache;}
    if(typeof fetch!=='function')throw new Error('fetch unavailable and no embedded offline AI manifest');
    const response=await fetch(MANIFEST_PATH,{cache:'no-store'});
    if(!response.ok)throw new Error('offline AI manifest unavailable: HTTP '+response.status);
    manifestCache=await response.json();return manifestCache;
  }
  function nativeRuntime(){return global.OmegaAndroidOfflineAI||global.OmegaNativeOfflineAI||null;}
  function capabilityStatus(manifest){
    const c=manifest?.androidCompatibility||{},r=manifest?.runtime||{},p=manifest?.packageInspection||{};
    return {manifestVersion:manifest?.version||null,packageStatus:p.status||'UNKNOWN',runtimeKind:r.kind||null,androidStatus:c.status||'UNKNOWN',inferenceSupported:c.localInferenceSupported===true,networkRequired:r.networkRequired===true,nativeRuntimePresent:!!nativeRuntime(),architecture:c.architectures||[],modelFormat:manifest?.model?.format||null};
  }
  async function init(){
    if(initialized)return {ok:!initError,error:initError,capabilities:capabilityStatus(manifestCache||{})};
    try{
      const manifest=await loadManifest(),caps=capabilityStatus(manifest);
      if(caps.inferenceSupported!==true)throw new Error('Offline AI package is not an Android-compatible local inference runtime');
      if(caps.networkRequired===true)throw new Error('Offline AI runtime declares a network requirement');
      if(!caps.nativeRuntimePresent)throw new Error('Android offline AI native runtime bridge is not installed');
      initialized=true;return {ok:true,error:null,capabilities:caps};
    }catch(error){initError=text(error?.message||error);initialized=true;return {ok:false,error:initError,capabilities:capabilityStatus(manifestCache||{})};}
  }
  async function generate(request){
    const check=await init();
    if(!check.ok)return {version:VERSION,status:'AI_UNAVAILABLE',provider:'offline',mode:'offline',text:'Offline AI is unavailable on this device/package.',structured:null,evidenceUsed:[],error:check.error,metadata:{capabilities:check.capabilities}};
    const native=nativeRuntime(),input=clone(request)||{};
    try{
      let result;
      if(typeof native.generate==='function')result=await native.generate(input);
      else if(typeof native.infer==='function')result=await native.infer(input);
      else throw new Error('Native offline AI bridge exposes neither generate() nor infer()');
      if(!result||typeof result!=='object')throw new Error('Offline runtime returned a non-object response');
      return {...result,provider:'offline',mode:'offline',version:VERSION};
    }catch(error){return {version:VERSION,status:'INFERENCE_FAILED',provider:'offline',mode:'offline',text:'Offline AI inference failed; deterministic OMEGA systems remain available.',structured:null,evidenceUsed:[],error:text(error?.message||error)};}
  }
  function diagnostics(){return {version:VERSION,manifestPath:MANIFEST_PATH,initialized,initError,manifest:clone(manifestCache),capabilities:capabilityStatus(manifestCache||{})};}
  global.OmegaOfflineAIBridge=Object.freeze({VERSION,MANIFEST_PATH,init,generate,diagnostics});
})(typeof globalThis!=='undefined'?globalThis:window);
