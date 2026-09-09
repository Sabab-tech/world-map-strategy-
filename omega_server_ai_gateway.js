/* OMEGA SERVER AI GATEWAY v1.2.0
 * Request-scoped transport authority for the canonical semantic plan/context.
 * A request carrying a canonical plan must never be silently reinterpreted by
 * another semantic parser or explainer during the same turn.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import './offline_semantic_brain.js';
import './offline_query_engine.js';
import './omega_minister_state_system.js';
import './omega_production_semantic_runtime_v3.js';

const VERSION='1.2.0';
const store=new AsyncLocalStorage();
const brain=globalThis.OfflineSemanticBrain;
const production=globalThis.OmegaProductionSemanticRuntime;

function active(){return store.getStore()||null;}
function activePlan(){return active()?.canonicalSemanticPlan||null;}
function isValidCanonicalPlan(value){return !!value&&typeof value==='object'&&typeof value.semantic==='object'&&value.semantic!==null;}

function installParserBridge(target,name){
  if(!target||typeof target[name]!=='function'||target[name].__omegaCanonicalGateway)return;
  const descriptor=Object.getOwnPropertyDescriptor(target,name);
  if(descriptor&&!descriptor.writable)return;
  const original=target[name];
  const wrapped=function(...args){
    const canonical=activePlan();
    if(canonical&&name==='parse')return canonical.semantic;
    if(canonical&&name==='explain')return canonical.semantic;
    return original.apply(this,args);
  };
  wrapped.__omegaCanonicalGateway=true;
  try{target[name]=wrapped;}catch(_){}
}

installParserBridge(brain,'parse');
installParserBridge(brain,'explain');
if(production){
  installParserBridge(production,'parse');
  installParserBridge(production,'explain');
}

if(production&&typeof production.buildAnswerPlan==='function'&&!production.buildAnswerPlan.__omegaCanonicalGateway){
  const original=production.buildAnswerPlan;
  const wrapped=function(...args){
    const canonical=activePlan();
    if(canonical)return canonical;
    if(typeof production.diagnostics==='function'&&!production.diagnostics().ready&&brain?.parse&&globalThis.OfflineQueryEngine?.execute){
      const input=args[1]||{},world=args[2]||{};
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
  try{production.buildAnswerPlan=wrapped}catch(_){}
}

export function withCanonicalAIRequest(req,res,next){
  const body=req.body||{};
  const plan=body.canonicalSemanticPlan;
  if(!isValidCanonicalPlan(plan))return next();

  const packet=body.canonicalContextPacket||null;
  if(packet?.question && packet.question!==body.prompt)return res.status(400).json({ok:false,error:'Canonical context question does not match request prompt'});
  if(body.canonicalAuthority&&body.canonicalAuthority!=='OMEGA_PRODUCTION_SEMANTIC_RUNTIME')return res.status(400).json({ok:false,error:'Unsupported canonical semantic authority'});

  return store.run({
    canonicalSemanticPlan:plan,
    canonicalContextPacket:packet,
    authority:body.canonicalAuthority||'OMEGA_PRODUCTION_SEMANTIC_RUNTIME'
  },next);
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
  diagnostics:()=>({
    version:VERSION,
    asyncContext:'AsyncLocalStorage',
    routePatch:true,
    canonicalPlanPassthrough:true,
    canonicalExplainPassthrough:true,
    canonicalQuestionGuard:true,
    productionRuntimeVersion:production?.VERSION||null
  })
});
console.log('[OMEGA Server AI Gateway] request-scoped canonical semantic transport ready');
