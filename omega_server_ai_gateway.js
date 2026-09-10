/* OMEGA SERVER AI GATEWAY v2.1.0
 * Server-side canonical identity/data transport.
 * Country and city identities are resolved only from the canonical runtime registry.
 * Partial country phrases are resolved generically against repository country data.
 * Verified identity queries always produce a UI-consumable grounded result instead of null.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import './offline_semantic_brain.js';
import './offline_query_engine.js';
import './omega_minister_state_system.js';
import './omega_production_semantic_runtime_v3.js';
import './omega_resource_semantic_bridge.js';
import './omega_country_semantic_bridge.js';
import './omega_reasoning_dispatcher.js';

const VERSION='2.1.0';
const store=new AsyncLocalStorage();
const brain=globalThis.OfflineSemanticBrain;
const production=globalThis.OmegaProductionSemanticRuntime;
const offline=globalThis.OfflineQueryEngine;
const identityBridge=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await identityBridge?.init?.();

function active(){return store.getStore()||null;}
function activePlan(){return active()?.canonicalSemanticPlan||null;}
function isValidCanonicalPlan(v){return !!v&&typeof v==='object'&&v.semantic&&typeof v.semantic==='object';}
function canonicalQuestion(plan,packet){return String(packet?.question??plan?.question??'').trim();}
function norm(v){return String(v??'').normalize('NFKC').toLowerCase().replace(/[?!,.:;'"“”‘’(){}[\]<>—–]/g,' ').replace(/\s+/g,' ').trim();}
function tokens(v){return norm(v).split(' ').filter(Boolean);}
function partialNameScore(query,name){const q=norm(query),n=norm(name);if(!q||!n)return 0;if(q===n)return 1;if(n.includes(q))return Math.min(.995,.90+q.length/Math.max(100,n.length*2));const qt=tokens(q),nt=tokens(n);if(qt.length>nt.length)return 0;for(let i=0;i<qt.length;i++){const a=qt[i],b=nt[i];if(a===b)continue;if(a.length>=2&&b.startsWith(a))continue;return 0;}return Math.min(.985,.78+.18*(qt.length/nt.length)+.02*(q.length/Math.max(1,n.length)));}
function genericCountryResolve(question){
  const direct=identityBridge?.resolveCountry?.(question);
  if(direct?.id)return direct;
  const exported=identityBridge?.exportData?.();
  const countries=Array.isArray(exported?.countries)?exported.countries:[];
  let best=null;
  for(const c of countries){
    const names=[...(Array.isArray(c?.names)?c.names:[]),c?.officialName,c?.id].filter(Boolean);
    for(const name of names){
      const score=partialNameScore(question,name);
      if(score<=0)continue;
      const candidate={id:String(c.id).toUpperCase(),type:'COUNTRY',confidence:score,surface:String(name),source:'OMEGA_CANONICAL_COUNTRY_REGISTRY_PARTIAL',raw:c};
      if(!best||candidate.confidence>best.confidence||candidate.confidence===best.confidence&&candidate.surface.length>best.surface.length)best=candidate;
    }
  }
  return best;
}
function enrichPlan(question,plan){
  if(!identityBridge?.canonicalizePlan)return plan;
  try{return identityBridge.canonicalizePlan(question,plan)||plan;}catch(e){console.warn('[OMEGA Server Identity] plan enrichment failed:',e?.message||e);return plan;}
}
function groundedIdentityResult(question,plan){
  const semantic=plan?.semantic||{};
  if(!identityBridge)return null;
  try{
    const country=genericCountryResolve(question);
    if(country?.id){
      const raw=country.raw||identityBridge.countryBrief?.(country.surface)||null;
      const label=country.raw?.officialName||country.raw?.names?.[0]||country.surface||country.id;
      const text=`${label} identified (${country.id}).`;
      return{ok:true,status:'VERIFIED_FACT',operation:String(semantic.operation||'IDENTIFY').toUpperCase(),targetDomain:'COUNTRY',countryId:country.id,entity:raw,source:'OMEGA_CANONICAL_COUNTRY_REGISTRY',text,value:raw,evidence:{entityType:'COUNTRY',canonicalId:country.id,surface:country.surface,confidence:country.confidence,matchMode:country.source?.includes('PARTIAL')?'PARTIAL_CANONICAL':'CANONICAL'}};
    }
    const city=identityBridge.resolveCity?.(question,semantic?.entities?.country?.id||null);
    if(city?.id){
      const label=city.raw?.name||city.surface||city.id;
      return{ok:true,status:'VERIFIED_FACT',operation:String(semantic.operation||'IDENTIFY').toUpperCase(),targetDomain:'CITY',cityId:city.id,countryId:city.countryId,entity:city.raw||null,source:'OMEGA_CANONICAL_CITY_REGISTRY',text:`${label} identified (${city.countryId}).`,value:city.raw||null,evidence:{entityType:'CITY',canonicalId:city.id,countryId:city.countryId,surface:city.surface,confidence:city.confidence}};
    }
  }catch(e){console.warn('[OMEGA Server Identity] grounded identity result failed:',e?.message||e);}
  return null;
}
function ensureResult(question,plan,context={}){
  const enriched=enrichPlan(question,plan)||plan;
  if(!enriched||typeof enriched!=='object')return enriched;
  if(enriched.result!==undefined&&enriched.result!==null)return enriched;
  try{
    if(production&&typeof production.execute==='function'){
      const result=production.execute(enriched.semantic||{}, {...context});
      if(result!==undefined&&result!==null)return{...enriched,result};
    }
  }catch(e){console.warn('[OMEGA Server Execution] production execute failed:',e?.message||e);}
  try{
    if(offline&&typeof offline.execute==='function'){
      const result=offline.execute(enriched.semantic||{},context?.datasets||[],enriched.semantic?.language==='bn'?'bn':'en',context);
      if(result!==undefined&&result!==null)return{...enriched,result};
    }
  }catch(e){console.warn('[OMEGA Server Execution] offline execute failed:',e?.message||e);}
  const grounded=groundedIdentityResult(question,enriched);
  if(grounded)return{...enriched,result:grounded};
  return enriched;
}
function installParserBridge(target,name){
  if(!target||typeof target[name]!=='function'||target[name].__omegaCanonicalGatewayV21)return;
  const original=target[name];
  const wrapped=function(...args){
    const canonical=activePlan();
    if(canonical&&(name==='parse'||name==='explain'))return canonical.semantic;
    let base;
    try{base=original.apply(this,args);}catch(e){return{version:VERSION,surface:String(args[0]??''),operation:'UNKNOWN',targetDomain:'GENERAL',entities:{},unresolved:['SEMANTIC_RUNTIME_ERROR'],executable:false,error:e?.message||String(e)};}
    return enrichPlan(args[0],{semantic:base})?.semantic||base;
  };
  wrapped.__omegaCanonicalGatewayV21=true;
  try{target[name]=wrapped;}catch(_){}
}
installParserBridge(brain,'parse');
installParserBridge(brain,'explain');
installParserBridge(production,'parse');
installParserBridge(production,'explain');
if(production&&typeof production.buildAnswerPlan==='function'&&!production.buildAnswerPlan.__omegaCanonicalGatewayV21){
  const original=production.buildAnswerPlan;
  const wrapped=function(...args){
    const canonical=activePlan();
    if(canonical)return ensureResult(String(args[0]??''),canonical,args[1]||{});
    let base;
    try{base=original.apply(this,args);}catch(e){base={semantic:{surface:String(args[0]??''),operation:'UNKNOWN',targetDomain:'GENERAL',entities:{},unresolved:['SEMANTIC_RUNTIME_ERROR'],executable:false},result:{ok:false,reason:'SEMANTIC_RUNTIME_ERROR',error:e?.message||String(e)}};}
    return ensureResult(String(args[0]??''),base,args[1]||{});
  };
  wrapped.__omegaCanonicalGatewayV21=true;
  try{production.buildAnswerPlan=wrapped;}catch(_){}
}
function enrichIdentityObject(question,input={}){
  const h=genericCountryResolve(question),c=identityBridge?.resolveCity?.(question,h?.id||null);
  const countryId=h?.id||c?.countryId||input.countryId||input.countryCode||null;
  const out={...input};
  if(countryId){out.countryId=countryId;out.countryCode=countryId;}
  if(h?.id)out.countryName=h.raw?.names?.[0]||h.raw?.officialName||h.surface;
  if(c?.id)out.cityId=c.id;
  return out;
}
if(globalThis.OmegaReasoningDispatcher?.dispatch&&!globalThis.OmegaReasoningDispatcher.__omegaCanonicalGatewayV21){
  const dispatcher=globalThis.OmegaReasoningDispatcher,original=dispatcher.dispatch.bind(dispatcher);
  dispatcher.dispatch=function(question,semantic,offlineResult,identityContext){return original(question,semantic,offlineResult,enrichIdentityObject(question,identityContext||{}));};
  dispatcher.__omegaCanonicalGatewayV21=true;
}
if(globalThis.OmegaCognitiveOS){
  const cog=globalThis.OmegaCognitiveOS;
  if(!cog.__omegaCanonicalIdentityGuardV21){
    for(const name of ['getCountryProfile','getEconomy','getPopulation']){
      if(typeof cog[name]!=='function')continue;
      cog[name]=function(value){
        if(!value)return null;
        const h=genericCountryResolve(value);
        if(!h?.id)return null;
        if(name==='getCountryProfile')return h.raw||h;
        if(name==='getEconomy')return identityBridge?.getDatasetRecord?.('economy.json',h.id,h.surface)??null;
        if(name==='getPopulation')return identityBridge?.getDatasetRecord?.('population.json',h.id,h.surface)??null;
        return null;
      };
    }
    if(typeof cog.thinkMinisterQuestion==='function'&&!cog.thinkMinisterQuestion.__omegaCanonicalIdentityGuardV21){
      const original=cog.thinkMinisterQuestion.bind(cog);
      const wrapped=function(question,minister,countryKey,countryDetails){const h=genericCountryResolve(question)||genericCountryResolve(countryKey);return original(question,minister,h?.id||String(countryKey||''),countryDetails||h?.raw||{});};
      wrapped.__omegaCanonicalIdentityGuardV21=true;cog.thinkMinisterQuestion=wrapped;
    }
    cog.__omegaCanonicalIdentityGuardV21=true;
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
if(!express.application.__omegaCanonicalAIPostPatchV21){
  const originalPost=express.application.post;
  express.application.post=function(path,...handlers){const key=String(path);if((key==='/api/ai/minister-consult'||key==='/api/ai/semantic-query')&&!handlers.some(h=>h===withCanonicalAIRequest))handlers=[withCanonicalAIRequest,...handlers];return originalPost.call(this,path,...handlers);};
  express.application.__omegaCanonicalAIPostPatchV21=true;
}
globalThis.OmegaServerAIGateway=Object.freeze({VERSION,withCanonicalAIRequest,diagnostics:()=>({version:VERSION,identityBridgeVersion:identityBridge?.VERSION||null,identityReady:!!identityBridge?.diagnostics?.().ready,identityDiagnostics:identityBridge?.diagnostics?.()||null,asyncContext:'AsyncLocalStorage',routePatch:true,canonicalPlanPassthrough:true,canonicalExplainPassthrough:true,deterministicResultExecution:true,groundedIdentityResult:true,partialCountryResolution:true,countryFallbackPolicy:'NO_SYNTHETIC_COUNTRY',cityIdentity:'CANONICAL_CITY_REGISTRY'})});
console.log('[OMEGA Server AI Gateway] canonical identity transport v2.1.0 ready');
