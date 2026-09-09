/* OMEGA SERVER AI GATEWAY v1.1.2
 * Request-scoped transport adapter for canonical semantic plan/context.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import './offline_semantic_brain.js';
import './offline_query_engine.js';
import './omega_minister_state_system.js';
import './omega_production_semantic_runtime_v3.js';

const VERSION='1.1.2';
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
    if(canonical&&name==='parse')return canonical.semantic||canonical;
    return original.apply(this,args);
  };
  wrapped.__omegaCanonicalGateway=true;
  try{target[name]=wrapped;}catch(_){}
}

installParserBridge(brain,'parse');
if(production)installParserBridge(production,'parse');
if(production&&typeof production.buildAnswerPlan==='function'&&!production.buildAnswerPlan.__omegaCanonicalGateway){
  const original=production.buildAnswerPlan;
  const wrapped=function(...args){
    const canonical=activePlan();
    if(canonical)return canonical;
    if(typeof production.diagnostics==='function'&&!production.diagnostics().ready&&brain?.parse&&globalThis.OfflineQueryEngine?.execute){
      const input=args[1]||{}, world=args[2]||{};
      const semantic=brain.parse(args[0],{...input,countryId:input.countryId||input.countryCode,countryCode:input.countryCode||input.countryId});
      const datasets=Array.isArray(globalThis.__OMEGA_SERVER_SEMANTIC_DATASETS)?globalThis.__OMEGA_SERVER_SEMANTIC_DATASETS:[];
      if(datasets.length){
        const result=globalThis.OfflineQueryEngine.execute(semantic,datasets,input.language==='bn'||semantic.language==='bn'?'bn':'en',input);
        return {version:production.VERSION,language:semantic.language,question:semantic.question,attribute:semantic.attribute,intent:semantic.targetDomain,operation:semantic.operation,entities:semantic.entities,semantic,identity:input,history:args[3]||[],result};
      }
    }
    return original.apply(this,args);
  };
  wrapped.__omegaCanonicalGateway=true;
  try{production.buildAnswerPlan=wrapped;}catch(_){}
}

export function withCanonicalAIRequest(req,res,next){
  const body=req.body||{};
  if(!body.canonicalSemanticPlan)return next();
  return store.run({canonicalSemanticPlan:body.canonicalSemanticPlan,canonicalContextPacket:body.canonicalContextPacket||null,authority:body.canonicalAuthority||null},next);
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

globalThis.OmegaServerAIGateway=Object.freeze({VERSION,withCanonicalAIRequest,diagnostics:()=>({version:VERSION,asyncContext:'AsyncLocalStorage',routePatch:true,canonicalPlanPassthrough:true,productionRuntimeVersion:production?.VERSION||null})});
console.log('[OMEGA Server AI Gateway] request-scoped canonical semantic transport ready');
