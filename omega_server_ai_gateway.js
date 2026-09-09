/* OMEGA SERVER AI GATEWAY v1.1.0
 * Request-scoped transport adapter for the canonical semantic plan/context.
 * It does not invent facts or replace the deterministic execution engine.
 * When the browser sends a canonical plan, all server semantic consumers see
 * that exact plan for the lifetime of that request. Requests without one keep
 * the pre-existing compatibility behavior.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import './offline_semantic_brain.js';
import './offline_query_engine.js';
import './minister_query_router.js';
import './omega_production_semantic_runtime_v3.js';

const VERSION='1.1.0';
const store=new AsyncLocalStorage();
const brain=globalThis.OfflineSemanticBrain;
const router=globalThis.MinisterQueryRouter;
const production=globalThis.OmegaProductionSemanticRuntime;

function activePlan(){return store.getStore()?.canonicalSemanticPlan||null;}
function installParserBridge(target,name){
  if(!target||typeof target[name]!=='function'||target[name].__omegaCanonicalGateway)return;
  const original=target[name];
  const wrapped=function(...args){
    const canonical=activePlan();
    if(canonical){
      const p=canonical.semantic||canonical;
      if(name==='parse')return p;
      if(name==='routeMinisterQuery')return {version:VERSION,intent:p.targetDomain,domain:p.targetDomain,entities:Object.values(p.entities||{}).filter(x=>x?.id),requiredData:[p.operation].filter(Boolean),semantic:p,executable:p.executable};
    }
    return original.apply(this,args);
  };
  wrapped.__omegaCanonicalGateway=true;
  target[name]=wrapped;
}

installParserBridge(brain,'parse');
installParserBridge(router,'routeMinisterQuery');
if(production)installParserBridge(production,'parse');
if(production&&typeof production.buildAnswerPlan==='function'&&!production.buildAnswerPlan.__omegaCanonicalGateway){
  const original=production.buildAnswerPlan;
  const wrapped=function(...args){const canonical=activePlan();return canonical||original.apply(this,args)};
  wrapped.__omegaCanonicalGateway=true;
  production.buildAnswerPlan=wrapped;
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
