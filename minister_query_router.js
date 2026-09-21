/* OMEGA MINISTER QUERY ROUTER v14.1.0
 * Browser entry -> repository-backed Deep Core.
 * HTTP transport is optional. Static deployments use the repository scanner.
 */
(function(global){'use strict';
const VERSION='14.1.0',S=v=>String(v==null?'':v).trim(),U=v=>S(v).toUpperCase();
const norm=v=>S(v).normalize('NFKC').toLowerCase().replace(/[?!,.:;\"'“”‘’(){}\[\]<>—–\/\\]/g,' ').replace(/\s+/g,' ').trim();
const asset=p=>{try{return typeof document!=='undefined'&&document.baseURI?new URL(p,document.baseURI).href:p}catch(_){return p}};
const brain=()=>global.OfflineSemanticBrain||null,qe=()=>global.OfflineQueryEngine||null,rt=()=>global.OmegaProductionSemanticRuntime||null,integrity=()=>global.OmegaAIIntegrity||null;
const QueryIntent=Object.freeze({RESOURCE_MINING_DISCOVERY:'RESOURCE_MINING_DISCOVERY',RESOURCE_SECURITY:'RESOURCE_SECURITY',RESOURCE_QUANTITY:'RESOURCE_QUANTITY',RESOURCE_LOCATION:'RESOURCE_LOCATION',COMPARE:'COMPARE',LOOKUP:'LOOKUP',COUNT:'COUNT',LOCATION:'LOCATION'});
const loaded=new Set();
function parse(q,ctx={}){
  try{
    const canonical=rt()?.parse?.(norm(q),ctx,ctx.gameState||ctx.worldState||{},ctx.history||[]);
    if(canonical?.targetDomain==='MINISTER') return canonical;
  }catch(_){}
  try{
    if(brain()?.parse){
      const p=brain().parse(norm(q),ctx);
      if(p?.contractVersion)return p;
    }
  }catch(_){}
  try{
    if(rt()?.parse)return rt().parse(norm(q),ctx,ctx.gameState||ctx.worldState||{},ctx.history||[]);
  }catch(_){}
  return{
    contractVersion:'OMEGA-QUERY-IR-FAILURE',
    raw:S(q),
    normalized:norm(q),
    language:/[\\u0980-\\u09ff]/.test(S(q))?'bn':'en',
    operation:'UNKNOWN',
    entities:{country:{status:'UNRESOLVED',id:null},resource:{status:'UNRESOLVED',id:null},minister:{status:'UNRESOLVED',id:null}},
    unresolved:['SEMANTIC_RUNTIME_UNAVAILABLE'],
    executable:false
  }
}

function legacyIntent(p){const a=U(p?.entities?.assetClass?.id||p?.assetClass||''),o=U(p?.operation||'LOOKUP');if(a)return QueryIntent.RESOURCE_MINING_DISCOVERY;if(o==='COUNT')return QueryIntent.COUNT;if(o==='LOCATE'||o==='LOCATION')return QueryIntent.LOCATION;if(o==='COMPARE')return QueryIntent.COMPARE;return o||QueryIntent.LOOKUP}
function route(q,identity={},world={}){const ctx={...identity,...world,history:world.history||identity.history||[]},p=parse(q,ctx),r=localExecute(p,ctx)||{status:'ASYNC_ONLY',value:null,evidence:[]};return{version:VERSION,intent:legacyIntent(p),operation:p.operation||'UNKNOWN',domain:p.intent||p.targetDomain||'GENERAL',entities:Object.values(p.entities||{}).filter(e=>e?.id).map(e=>({type:e.type||null,id:e.id,confidence:e.confidence||null,source:e.source||null,surface:e.surface||null})),requiredData:Object.values(p.entities||{}).filter(e=>e?.id).map(e=>e.type||null).filter(Boolean),semantic:p,result:r,dataFound:r?.status==='VERIFIED_FACT',executable:p.executable!==false&&r?.status!=='NO_AUTHORITATIVE_EXECUTOR'}}
function resolveKnowledgeQuery(q,ctx={}){const r=route(q,ctx,ctx);return{...r,country:r.semantic?.entities?.country||null,resource:r.semantic?.entities?.resource||null,operation:r.semantic?.operation||'UNKNOWN'}}
function detectIntent(q,ctx={}){return legacyIntent(parse(q,ctx))}
function learn(surface,mapping={},confidence=.95){const r=rt(),id=mapping.canonicalId||mapping.countryId||mapping.resourceId||mapping.ministerId,type=mapping.entityType||(mapping.countryId?'COUNTRY':mapping.resourceId?'RESOURCE':mapping.ministerId?'PERSON':null);try{return!!(r?.learn&&surface&&id&&type&&r.learn(surface,type,id,confidence))}catch(_){return false}}
function recall(q){try{return rt()?.recall?.(q)||{}}catch(_){return{}}}
async function enqueue(q,ctx={}){const question=S(q);if(!question)return{status:'EMPTY_QUERY',value:null,evidence:[]};const srv=await server(question,ctx);if(srv.server&&srv.status==='VERIFIED_FACT'){renderResult(srv,question);return srv}const local=await repositoryExecute(question,ctx);if(local?.status&&local.status!=='DEEP_CORE_ENGINE_UNAVAILABLE'){renderResult(local,question);return local}const out={...local,...srv,status:local?.status||srv.status,value:local?.value??srv.value??null,evidence:local?.evidence||srv.evidence||[]};renderResult(out,question);return out}
function liveMinisterContext(){
  const ui=global.OmegaCabinetUI||{},m=ui.currentInterrogatedMinister||{};
  const g=global.Game||{},s=g.state||{};
  const ministerId=S(m.ministerId||m.id||m.staticProfile?.ministerId||m.staticProfile?.id||m.profile?.ministerId||m.profile?.id||s.activeMinisterId||global.OmegaMinisterState?.activeMinisterId||'');
  const countryId=S(m.countryId||m.countryCode||m.staticProfile?.countryId||m.profile?.countryId||g.currentActiveCountry||s.countryId||s.playerCountryId||'').toUpperCase();
  const ministryId=S(m.ministryId||m.ministry||m.staticProfile?.ministryId||m.profile?.ministryId||s.activeMinistryId||global.OmegaLayerManager?.activeMinistryId||'');
  const ministerName=S(m.ministerName||m.name||m.displayName||m.staticProfile?.baseName||m.staticProfile?.name||'');
  const ministerRole=S(m.ministerRole||m.role||m.title||m.staticProfile?.role||'');
  return {ministerId,countryId,countryCode:countryId,ministryId,ministerName,ministerRole};
}
function interceptSubmission(ev){
  const b=ev?.target?.closest?.('#btn-submit-interrogation');
  if(!b)return false;
  const input=document.getElementById('interrogation-input'),q=S(input?.value);
  if(!q)return false;
  ev.preventDefault();ev.stopImmediatePropagation();
  if(input)input.value='';
  enqueue(q,liveMinisterContext()).catch(e=>renderResult({status:'ENTRY_FAILED',value:null,evidence:[],error:e?.message||String(e)},q));
  return true;
}
function interceptEnter(ev){
  if(ev.key!=='Enter'||ev.shiftKey||ev.isComposing||ev.target?.id!=='interrogation-input')return false;
  const q=S(ev.target.value);
  if(!q)return false;
  ev.preventDefault();ev.stopImmediatePropagation();
  ev.target.value='';
  enqueue(q,liveMinisterContext()).catch(e=>renderResult({status:'ENTRY_FAILED',value:null,evidence:[],error:e?.message||String(e)},q));
  return true;
}

function install(){if(typeof document==='undefined'||document.__OMEGA_CANONICAL_ENTRY_V14_1)return;document.__OMEGA_CANONICAL_ENTRY_V14_1=true;document.addEventListener('click',interceptSubmission,true);document.addEventListener('keydown',interceptEnter,true)}
const API=Object.freeze({VERSION,QueryIntent,parse,normalize:norm,executeServerDeepCore:server,repositoryExecute,routeMinisterQuery:route,resolveKnowledgeQuery,detectIntent,learn,recall,ensureCanonicalBrowserStack:ensureStack,enqueue});global.MinisterQueryRouter=API;install();if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:window);
