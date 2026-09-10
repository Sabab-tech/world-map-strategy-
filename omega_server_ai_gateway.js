/* OMEGA SERVER AI GATEWAY v2.0.1
 * Server-side canonical identity/data transport.
 * Country and city identities are resolved only from the canonical runtime registry.
 * Unknown identity is never replaced with a synthetic/default country.
 * Missing deterministic results are executed through the production runtime before
 * the request reaches server.js, so semantic identity cannot terminate at result:null.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import 'express';
import './offline_semantic_brain.js';
import './offline_query_engine.js';
import './omega_minister_state_system.js';
import './omega_production_semantic_runtime_v3.js';
import './omega_resource_semantic_bridge.js';
import './omega_country_semantic_bridge.js';
import './omega_reasoning_dispatcher.js';

const VERSION='2.0.1';
const store=new AsyncLocalStorage();
const brain=globalThis.OfflineSemanticBrain;
const production=globalThis.OmegaProductionSemanticRuntime;
const offline=globalThis.OfflineQueryEngine;
const resourceBridge=globalThis.OmegaResourceSemanticBridge;
const identityBridge=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;

await identityBridge?.init?.();

function active(){return store.getStore()||null;}
function activePlan(){return active()?.canonicalSemanticPlan||null;}
function isValidCanonicalPlan(v){return !!v&&typeof v==='object'&&v.semantic&&typeof v.semantic==='object';}
function canonicalQuestion(plan,packet){return String(packet?.question??plan?.question??'').trim();}
function enrichPlan(question,plan){
 if(!identityBridge?.canonicalizePlan)return plan;
 try{return identityBridge.canonicalizePlan(question,plan)||plan;}catch(e){console.warn('[OMEGA Server Identity] plan enrichment failed:',e?.message||e);return plan;}
}
function ensureResult(question,plan,context={}){
 const enriched=enrichPlan(question,plan)||plan;
 if(!enriched||typeof enriched!=='object')return enriched;
 if(enriched.result!==undefined&&enriched.result!==null)return enriched;
 const semantic=enriched.semantic;
 if(!semantic||typeof semantic!=='object')return enriched;
 try{
   if(production&&typeof production.execute==='function'){
     const result=production.execute(semantic,{...context});
     if(result!==undefined&&result!==null)return{...enriched,result};
   }
 }catch(e){console.warn('[OMEGA Server Execution] production execute failed:',e?.message||e);}
 try{
   if(offline&&typeof offline.execute==='function'){
     const result=offline.execute(semantic,context?.datasets||[],semantic.language==='bn'?'bn':'en',context);
     if(result!==undefined&&result!==null)return{...enriched,result};
   }
 }catch(e){console.warn('[OMEGA Server Execution] offline execute failed:',e?.message||e);}
 return enriched;
}
function installParserBridge(target,name){
 if(!target||typeof target[name]!=='function'||target[name].__omegaCanonicalGatewayV2)return;
 const original=target[name];
 const wrapped=function(...args){
   const canonical=activePlan();
   if(canonical&&(name==='parse'||name==='explain'))return canonical.semantic;
   let base;
   try{base=original.apply(this,args);}catch(e){return {version:VERSION,surface:String(args[0]??''),operation:'UNKNOWN',targetDomain:'GENERAL',entities:{},unresolved:['SEMANTIC_RUNTIME_ERROR'],executable:false,error:e?.message||String(e)};}
   return enrichPlan(args[0],{semantic:base})?.semantic||base;
 };
 wrapped.__omegaCanonicalGatewayV2=true;
 try{target[name]=wrapped;}catch(_){}
}
installParserBridge(brain,'parse');
installParserBridge(brain,'explain');
installParserBridge(production,'parse');
installParserBridge(production,'explain');

if(production&&typeof production.buildAnswerPlan==='function'&&!production.buildAnswerPlan.__omegaCanonicalGatewayV2){
 const original=production.buildAnswerPlan;
 const wrapped=function(...args){
   const canonical=activePlan();
   if(canonical)return ensureResult(String(args[0]??''),canonical,args[1]||{});
   let base;
   try{base=original.apply(this,args);}catch(e){base={semantic:{surface:String(args[0]??''),operation:'UNKNOWN',targetDomain:'GENERAL',entities:{},unresolved:['SEMANTIC_RUNTIME_ERROR'],executable:false},result:{ok:false,reason:'SEMANTIC_RUNTIME_ERROR',error:e?.message||String(e)}};}
   return ensureResult(String(args[0]??''),base,args[1]||{});
 };
 wrapped.__omegaCanonicalGatewayV2=true;
 try{production.buildAnswerPlan=wrapped;}catch(_){}
}

function enrichIdentityObject(question,input={}){
 const h=identityBridge?.resolveCountry?.(question),c=identityBridge?.resolveCity?.(question,h?.id||null);
 const countryId=h?.id||c?.countryId||input.countryId||input.countryCode||null;
 const out={...input};
 if(countryId){out.countryId=countryId;out.countryCode=countryId;}
 if(h?.id)out.countryName=h.raw?.names?.[0]||h.surface;
 if(c?.id)out.cityId=c.id;
 return out;
}

if(globalThis.OmegaReasoningDispatcher?.dispatch&&!globalThis.OmegaReasoningDispatcher.__omegaCanonicalGatewayV2){
 const dispatcher=globalThis.OmegaReasoningDispatcher;
 const original=dispatcher.dispatch.bind(dispatcher);
 dispatcher.dispatch=function(question,semantic,offlineResult,identityContext){
   const enriched=enrichIdentityObject(question,identityContext||{});
   return original(question,semantic,offlineResult,enriched);
 };
 dispatcher.__omegaCanonicalGatewayV2=true;
}

if(globalThis.OmegaCognitiveOS){
 const cog=globalThis.OmegaCognitiveOS;
 if(!cog.__omegaCanonicalIdentityGuardV2){
   for(const name of ['getCountryProfile','getEconomy','getPopulation']){
     if(typeof cog[name]!=='function')continue;
     cog[name]=function(value){
       if(!value)return null;
       const h=identityBridge?.resolveCountry?.(value);
       if(!h?.id)return null;
       if(name==='getCountryProfile')return h.raw||h;
       if(name==='getEconomy')return identityBridge?.getDatasetRecord?.('economy.json',h.id,h.surface)??null;
       if(name==='getPopulation')return identityBridge?.getDatasetRecord?.('population.json',h.id,h.surface)??null;
       return null;
     };
   }
   if(typeof cog.thinkMinisterQuestion==='function'&&!cog.thinkMinisterQuestion.__omegaCanonicalIdentityGuardV2){
     const original=cog.thinkMinisterQuestion.bind(cog);
     const wrapped=function(question,minister,countryKey,countryDetails){
       const h=identityBridge?.resolveCountry?.(question)||identityBridge?.resolveCountry?.(countryKey);
       return original(question,minister,h?.id||String(countryKey||''),countryDetails||h?.raw||{});
     };
     wrapped.__omegaCanonicalIdentityGuardV2=true;
     cog.thinkMinisterQuestion=wrapped;
   }
   cog.__omegaCanonicalIdentityGuardV2=true;
 }
}

export function withCanonicalAIRequest(req,res,next){
 const body=req.body||{},question=String(body.prompt||'').trim(),plan=body.canonicalSemanticPlan;
 if(isValidCanonicalPlan(plan)){
   const packet=body.canonicalContextPacket||null,planQuestion=canonicalQuestion(plan,packet);
   if(planQuestion&&planQuestion!==question)return res.status(400).json({ok:false,error:'Canonical context question does not match request prompt'});
   if(body.canonicalAuthority&&body.canonicalAuthority!=='OMEGA_PRODUCTION_SEMANTIC_RUNTIME')return res.status(400).json({ok:false,error:'Unsupported canonical semantic authority'});
   const enriched=ensureResult(question,plan,body);
   return store.run({canonicalSemanticPlan:enriched,canonicalContextPacket:packet,authority:body.canonicalAuthority||'OMEGA_PRODUCTION_SEMANTIC_RUNTIME'},next);
 }
 return next();
}

if(!express.application.__omegaCanonicalAIPostPatchV2){
 const originalPost=express.application.post;
 express.application.post=function(path,...handlers){
   const key=String(path);
   if((key==='/api/ai/minister-consult'||key==='/api/ai/semantic-query')&&!handlers.some(h=>h===withCanonicalAIRequest))handlers=[withCanonicalAIRequest,...handlers];
   return originalPost.call(this,path,...handlers);
 };
 express.application.__omegaCanonicalAIPostPatchV2=true;
}

globalThis.OmegaServerAIGateway=Object.freeze({
 VERSION,withCanonicalAIRequest,
 diagnostics:()=>({
   version:VERSION,
   identityBridgeVersion:identityBridge?.VERSION||null,
   identityReady:!!identityBridge?.diagnostics?.().ready,
   identityDiagnostics:identityBridge?.diagnostics?.()||null,
   asyncContext:'AsyncLocalStorage',routePatch:true,
   canonicalPlanPassthrough:true,canonicalExplainPassthrough:true,
   deterministicResultExecution:true,
   countryFallbackPolicy:'NO_SYNTHETIC_COUNTRY',cityIdentity:'CANONICAL_CITY_REGISTRY'
 })
});
console.log('[OMEGA Server AI Gateway] canonical identity transport v2.0.1 ready');
