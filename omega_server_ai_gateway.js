/* OMEGA SERVER AI GATEWAY v1.1.1
 * Request-scoped transport adapter for the canonical semantic plan/context.
 * It does not invent facts or replace deterministic execution. When the browser
 * sends a canonical plan, the mutable server-side semantic consumers observe
 * that exact plan for the lifetime of the request.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import './offline_semantic_brain.js';
import './offline_query_engine.js';
import './minister_query_router.js';
import './omega_production_semantic_runtime_v3.js';

const VERSION='1.1.1';
const store=new AsyncLocalStorage();
const brain=globalThis.OfflineSemanticBrain;
const production=globalThis.OmegaProductionSemanticRuntime;

function activePlan(){return store.getStore()?.canonicalSemanticPlan||null;}
function installParserBridge(target,name){
  if(!target||typeof target[name]!=='function'||target[name].__omegaCanonicalGateway)return;
  const descriptor=Object.getOwnPropertyDescriptor(target,name);
  if(descriptor&&!descriptor.writable)return;
  const original=target[name];
  const wrapped=function(...args){
    const canonical=activePlan();
    if(canonical){
      const p=canonical.semantic||canonical;
      if(name==='parse')return p;
    }
    return original.apply(this,args);
  };
  wrapped.__omegaCanonicalGateway=true;
  try{target[name]=wrapped;}catch(_){/* immutable consumer; leave untouched */}
}

installParserBridge(brain,'parse');
if(production)installParserBridge(production,'parse');
if(production&&typeof production.buildAnswerPlan==='function'&&!production.buildAnswerPlan.__omegaCanonicalGateway){
  const original=production.buildAnswerPlan;
  const wrapped=function(...args){const canonical=activePlan();return canonical||original.apply(this,args)};
  wrapped.__omegaCanonicalGateway=true;
  try{production.buildAnswerPlan=wrapped;}catch(_){/* keep original if immutable */}
}

export function withCanonicalAIRequest(req,res,next){
  const body=req.body||{};
  const packet=body.canonicalSemanticPlan||null;
  const context=body.canonicalContextPacket||null;
  if(!packet)return next();
  return store.run({canonicalSemanticPlan:packet,canonicalContextPacket:context,authority:body.canonicalAuthority||null},next);
}

if(!express.application.__omegaCanonicalAIPostPatch){
  const originalPost=express.application.post;
  express.application.post=function(path,...handlers){
    const key=String(path);
    if((key==='/api/ai/minister-consult'||key==='/api/ai/semantic-query')&&!handlers.some(h=>h===withCanonicalAIRequest))handlers=[withCanonicalAIRequest,...handlers];
    return originalPost.call(this,path,...handlers);
  };
  express.application.__omegaCanonicalAIPostPatch=true;
}

globalThis.OmegaServerAIGateway=Object.freeze({
  VERSION,
  withCanonicalAIRequest,
  diagnostics:()=>({version:VERSION,asyncContext:'AsyncLocalStorage',routePatch:true,canonicalPlanPassthrough:true,productionRuntimeVersion:production?.VERSION||null})
});
console.log('[OMEGA Server AI Gateway] request-scoped canonical semantic transport ready');
