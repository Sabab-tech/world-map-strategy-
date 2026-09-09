/* OMEGA SERVER AI GATEWAY v1.0.0
 * Node-side transport adapter. It does not invent semantic meaning.
 * When the browser sends a canonical semantic plan/context packet, this gateway
 * makes every legacy server consumer observe that same plan for the lifetime
 * of the request. Without a canonical packet it preserves the existing
 * compatibility path instead of guessing.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import './offline_semantic_brain.js';
import './offline_query_engine.js';
import './minister_query_router.js';
import './omega_production_semantic_runtime_v3.js';

const VERSION='1.0.0';
const store=new AsyncLocalStorage();
const brain=globalThis.OfflineSemanticBrain;
const router=globalThis.MinisterQueryRouter;
const production=globalThis.OmegaProductionSemanticRuntime;

function installParserBridge(target,name){
  if(!target||typeof target[name]!=='function'||target[name].__omegaCanonicalGateway)return;
  const original=target[name];
  const wrapped=function(...args){
    const active=store.getStore();
    const canonical=active?.canonicalSemanticPlan;
    if(canonical){
      if(name==='parse')return canonical.semantic||canonical;
      if(name==='routeMinisterQuery'){
        const p=canonical.semantic||canonical;
        return {version:VERSION,intent:p.targetDomain,domain:p.targetDomain,entities:Object.values(p.entities||{}).filter(x=>x?.id),requiredData:[p.operation].filter(Boolean),semantic:p,executable:p.executable};
      }
    }
    return original.apply(this,args);
  };
  wrapped.__omegaCanonicalGateway=true;
  target[name]=wrapped;
}

installParserBridge(brain,'parse');
installParserBridge(router,'routeMinisterQuery');
if(production&&typeof production.parse==='function')installParserBridge(production,'parse');
if(production&&typeof production.buildAnswerPlan==='function'&&!production.buildAnswerPlan.__omegaCanonicalGateway){
  const original=production.buildAnswerPlan;
  const wrapped=function(...args){
    const active=store.getStore();
    if(active?.canonicalSemanticPlan)return active.canonicalSemanticPlan;
    return original.apply(this,args);
  };
  wrapped.__omegaCanonicalGateway=true;
  production.buildAnswerPlan=wrapped;
}

export function withCanonicalAIRequest(req,res,next){
  const body=req.body||{};
  const packet=body.canonicalSemanticPlan||null;
  const context=body.canonicalContextPacket||null;
  if(!packet)return next();
  return store.run({canonicalSemanticPlan:packet,canonicalContextPacket:context,authority:body.canonicalAuthority||null},()=>next());
}

export function diagnostics(){
  return {version:VERSION,asyncContext:'AsyncLocalStorage',canonicalPlanPassthrough:true,productionRuntimeVersion:production?.VERSION||null};
}

globalThis.OmegaServerAIGateway={VERSION,withCanonicalAIRequest,diagnostics};
console.log('[OMEGA Server AI Gateway] canonical semantic transport ready');
