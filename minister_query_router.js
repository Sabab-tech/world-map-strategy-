/* OMEGA MINISTER QUERY ROUTER v10.0.0-CANONICAL-FACADE */
(function(global){'use strict';
const VERSION='10.0.0-CANONICAL-FACADE';
const S=v=>String(v==null?'':v).trim();
function rt(){return global.OmegaProductionSemanticRuntime||null}
function brain(){return global.OfflineSemanticBrain||null}
function qe(){return global.OfflineQueryEngine||null}
function integrity(){return global.OmegaAIIntegrity||null}
function parse(q,ctx={}){const r=rt();try{if(r?.parse)return r.parse(q,ctx,ctx.gameState||ctx.worldState||{},ctx.history||[])}catch(_){}try{if(brain()?.parse)return brain().parse(q,ctx)}catch(_){}return{raw:S(q),language:/[\u0980-\u09FF]/.test(S(q))?'bn':'en',operation:'UNKNOWN',targetDomain:'GENERAL',entities:{country:null,resource:null,minister:null},unresolved:['SEMANTIC_RUNTIME_UNAVAILABLE'],executable:false}}
function executeSemantic(p,ctx={}){try{const i=integrity();if(i?.buildAnswerPlan){const plan=i.buildAnswerPlan(p.raw||'',ctx,ctx.gameState||ctx.worldState||{},ctx.history||[]);if(plan?.result)return plan.result}}catch(_){}try{if(qe()?.execute)return qe().execute(p,[],p.language||'en',{...ctx,countryId:p.entities?.country?.id||ctx.countryId})}catch(_){}try{if(rt()?.execute)return rt().execute(p,ctx)}catch(_){}return{ok:false,status:'NO_AUTHORITATIVE_EXECUTOR'}}
function route(q,identity={},world={}){const ctx={...identity,...world,history:world.history||identity.history||[]};const p=parse(q,ctx);const result=executeSemantic(p,ctx);return{version:VERSION,intent:p.operation||p.question?.type||'UNKNOWN',domain:p.targetDomain||'GENERAL',entities:Object.values(p.entities||{}).filter(e=>e?.id).map(e=>({type:e.type,id:e.id,confidence:e.confidence,source:e.source,surface:e.surface})),requiredData:[...new Set(Object.values(p.entities||{}).filter(e=>e?.id).map(e=>e.type||null).filter(Boolean))],semantic:p,result,dataFound:!!result?.ok,executable:p.executable!==false}}
function resolveKnowledgeQuery(q,ctx={}){const r=route(q,ctx,ctx);return{...r,country:r.semantic?.entities?.country||null,resource:r.semantic?.entities?.resource||null,minister:r.semantic?.entities?.minister||null,operation:r.semantic?.operation||r.semantic?.question?.type||'UNKNOWN'}}
function detectIntent(q,ctx={}){const p=parse(q,ctx);return p.operation||p.question?.type||'UNKNOWN'}
function learn(surface,mapping={},confidence=.95){const r=rt(),id=mapping.canonicalId||mapping.countryId||mapping.resourceId||mapping.ministerId,type=mapping.entityType||(mapping.countryId?'COUNTRY':mapping.resourceId?'RESOURCE':mapping.ministerId?'MINISTER':null);try{return!!(r?.learn&&surface&&id&&type&&r.learn(surface,type,id,confidence))}catch(_){return false}}
function recall(q){try{return rt()?.recall?.(q)||{}}catch(_){return{}}}
const API=Object.freeze({VERSION,parse,executeSemantic,routeMinisterQuery:route,resolveKnowledgeQuery,detectIntent,learn,recall,offlineQuery:resolveKnowledgeQuery});
global.MinisterQueryRouter=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:window);
