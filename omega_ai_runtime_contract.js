/* OMEGA AI RUNTIME CONTRACT v1.0.0
 * Shared contract for online/offline AI providers.
 * AI is never authoritative over game state.
 */
(function(global){
  'use strict';
  if(global.OmegaAIRuntimeContract?.VERSION === '1.0.0') return;
  const VERSION='1.0.0';
  const PROVIDERS=Object.freeze({GEMINI:'gemini',OFFLINE:'offline'});
  const MODES=Object.freeze({ONLINE:'online',OFFLINE:'offline'});
  const STATUSES=Object.freeze({OK:'OK',AI_UNAVAILABLE:'AI_UNAVAILABLE',INVALID_REQUEST:'INVALID_REQUEST',INVALID_RESPONSE:'INVALID_RESPONSE',INFERENCE_FAILED:'INFERENCE_FAILED',VALIDATION_FAILED:'VALIDATION_FAILED'});
  const text=v=>String(v==null?'':v).trim();
  const clone=v=>{try{return v===undefined?undefined:JSON.parse(JSON.stringify(v));}catch(_){return null;}};
  function normalizeRequest(request){
    const r=request&&typeof request==='object'?request:{};
    return {requestId:text(r.requestId),question:text(r.question||r.prompt),language:text(r.language||'en').toLowerCase(),intent:text(r.intent||'LOOKUP').toUpperCase(),domain:text(r.domain||'GENERAL').toUpperCase(),evidence:clone(Array.isArray(r.evidence)?r.evidence:[]),context:clone(r.context||{}),gameState:clone(r.gameState||{}),history:clone(Array.isArray(r.history)?r.history.slice(-24):[]),actionRequested:r.actionRequested===true};
  }
  function validateRequest(request){
    const r=normalizeRequest(request),errors=[];
    if(!r.question)errors.push('question is required');
    if(!Array.isArray(r.evidence))errors.push('evidence must be an array');
    return {ok:errors.length===0,errors,request:r};
  }
  function createEnvelope(fields){
    const f=fields&&typeof fields==='object'?fields:{};
    return {version:VERSION,provider:text(f.provider).toLowerCase()||null,mode:text(f.mode).toLowerCase()||null,status:text(f.status).toUpperCase()||STATUSES.OK,text:text(f.text),structured:f.structured&&typeof f.structured==='object'?clone(f.structured):null,evidenceUsed:Array.isArray(f.evidenceUsed)?clone(f.evidenceUsed):[],fallbackFrom:text(f.fallbackFrom).toLowerCase()||null,error:text(f.error)||null,metadata:clone(f.metadata||{})};
  }
  function validateResponse(response){
    const r=response&&typeof response==='object'?response:{},errors=[];
    if(!text(r.status))errors.push('status is required');
    if(r.structured!==null&&r.structured!==undefined&&typeof r.structured!=='object')errors.push('structured must be an object or null');
    if(!Array.isArray(r.evidenceUsed))errors.push('evidenceUsed must be an array');
    return {ok:errors.length===0,errors,response:r};
  }
  function validateCommand(command){
    if(!command||typeof command!=='object'||Array.isArray(command))return {ok:false,errors:['command must be an object']};
    const errors=[],allowed=new Set(['intent','domain','action','target','value','unit','reason','parameters']);
    for(const key of Object.keys(command))if(!allowed.has(key))errors.push('unsupported field: '+key);
    for(const key of ['intent','domain','action','target'])if(!text(command[key]))errors.push(key+' is required');
    if(command.value!==undefined&&command.value!==null&&!['number','string','boolean'].includes(typeof command.value))errors.push('value has invalid type');
    return {ok:errors.length===0,errors,command:clone(command)};
  }
  global.OmegaAIRuntimeContract=Object.freeze({VERSION,PROVIDERS,MODES,STATUSES,normalizeRequest,validateRequest,createEnvelope,validateResponse,validateCommand});
})(typeof globalThis!=='undefined'?globalThis:window);
