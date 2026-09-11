/* OMEGA MINISTER QUERY ROUTER v11.0.0-CANONICAL-ENTRY */
(function(global){'use strict';
const VERSION='11.0.0-CANONICAL-ENTRY';
const S=v=>String(v==null?'':v).trim();
const asset=p=>{try{return typeof document!=='undefined'&&document.baseURI?new URL(p,document.baseURI).href:p}catch(_){return p}};
const rt=()=>global.OmegaProductionSemanticRuntime||null;
const brain=()=>global.OfflineSemanticBrain||null;
const qe=()=>global.OfflineQueryEngine||null;
const integrity=()=>global.OmegaAIIntegrity||null;
let universalPromise=null;
const loadedScripts=new Set();
function parse(q,ctx={}){
  const r=rt();
  try{if(r?.parse)return r.parse(q,ctx,ctx.gameState||ctx.worldState||{},ctx.history||[])}catch(_){}
  try{if(brain()?.parse)return brain().parse(q,ctx)}catch(_){}
  return{raw:S(q),language:/[\u0980-\u09FF]/.test(S(q))?'bn':'en',operation:'UNKNOWN',targetDomain:'GENERAL',entities:{country:null,resource:null,minister:null},unresolved:['SEMANTIC_RUNTIME_UNAVAILABLE'],executable:false};
}
function executeSemantic(p,ctx={}){
  try{const i=integrity();if(i?.buildAnswerPlan){const plan=i.buildAnswerPlan(p.raw||'',ctx,ctx.gameState||ctx.worldState||{},ctx.history||[]);if(plan?.result)return plan.result}}catch(_){}
  try{if(qe()?.execute)return qe().execute(p,[],p.language||'en',{...ctx,countryId:p.entities?.country?.id||ctx.countryId})}catch(_){}
  try{if(rt()?.execute)return rt().execute(p,ctx)}catch(_){}
  return{ok:false,status:'NO_AUTHORITATIVE_EXECUTOR'};
}
function route(q,identity={},world={}){
  const ctx={...identity,...world,history:world.history||identity.history||[]};
  const p=parse(q,ctx);
  const result=executeSemantic(p,ctx);
  return{version:VERSION,intent:p.operation||p.question?.type||'UNKNOWN',domain:p.targetDomain||'GENERAL',entities:Object.values(p.entities||{}).filter(e=>e?.id).map(e=>({type:e.type,id:e.id,confidence:e.confidence,source:e.source,surface:e.surface})),requiredData:[...new Set(Object.values(p.entities||{}).filter(e=>e?.id).map(e=>e.type||null).filter(Boolean))],semantic:p,result,dataFound:!!result?.ok,executable:p.executable!==false};
}
function resolveKnowledgeQuery(q,ctx={}){const r=route(q,ctx,ctx);return{...r,country:r.semantic?.entities?.country||null,resource:r.semantic?.entities?.resource||null,minister:r.semantic?.entities?.minister||null,operation:r.semantic?.operation||r.semantic?.question?.type||'UNKNOWN'}}
function detectIntent(q,ctx={}){const p=parse(q,ctx);return p.operation||p.question?.type||'UNKNOWN'}
function learn(surface,mapping={},confidence=.95){const r=rt(),id=mapping.canonicalId||mapping.countryId||mapping.resourceId||mapping.ministerId,type=mapping.entityType||(mapping.countryId?'COUNTRY':mapping.resourceId?'RESOURCE':mapping.ministerId?'MINISTER':null);try{return!!(r?.learn&&surface&&id&&type&&r.learn(surface,type,id,confidence))}catch(_){return false}}
function recall(q){try{return rt()?.recall?.(q)||{}}catch(_){return{}}}
function loadOnce(src){if(loadedScripts.has(src))return Promise.resolve(true);if(typeof document==='undefined')return Promise.resolve(false);const existing=[...document.scripts].find(x=>x.src&&(x.src===asset(src)||x.src.endsWith('/'+src)));if(existing){loadedScripts.add(src);return Promise.resolve(true)}return new Promise(resolve=>{const s=document.createElement('script');s.src=asset(src);s.onload=()=>{loadedScripts.add(src);resolve(true)};s.onerror=()=>resolve(false);document.head.appendChild(s)})}
async function ensureCanonicalBrowserStack(){
  await loadOnce('omega_language_system.js');
  await loadOnce('omega_language_batch03_semantic_extension.js');
  await loadOnce('omega_country_semantic_bridge.js');
  await loadOnce('omega_resource_semantic_bridge.js');
  await loadOnce('omega_production_semantic_runtime_v3.js');
  await loadOnce('offline_semantic_brain.js');
  await loadOnce('offline_query_engine.js');
  await loadOnce('omega_reasoning_dispatcher.js');
  await loadOnce('omega_universal_ai_runtime.js');
  return global.OmegaUniversalAIRuntime||null;
}
function getQuestionFromUI(){const input=document.getElementById('interrogation-input');return{input,q:S(input?.value)}}
function interceptSubmission(event){
  const button=event?.target?.closest?.('#btn-submit-interrogation');
  if(!button)return false;
  const {input,q}=getQuestionFromUI();
  if(!q)return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(input)input.value='';
  if(universalPromise===null)universalPromise=ensureCanonicalBrowserStack();
  universalPromise.then(u=>{
    if(u?.enqueue)return u.enqueue(q);
    console.error('[OMEGA ROUTER] Canonical browser runtime unavailable');
  }).catch(e=>console.error('[OMEGA ROUTER] Canonical browser entry failed',e));
  return true;
}
function interceptEnter(event){
  if(event.key!=='Enter'||event.shiftKey||event.isComposing||event.target?.id!=='interrogation-input')return false;
  const q=S(event.target.value);if(!q)return false;
  event.preventDefault();event.stopImmediatePropagation();event.target.value='';
  if(universalPromise===null)universalPromise=ensureCanonicalBrowserStack();
  universalPromise.then(u=>{if(u?.enqueue)return u.enqueue(q);console.error('[OMEGA ROUTER] Canonical browser runtime unavailable')}).catch(e=>console.error('[OMEGA ROUTER] Canonical browser entry failed',e));
  return true;
}
function installEntryInterceptors(){
  if(typeof document==='undefined'||document.__OMEGA_CANONICAL_ENTRY_V11)return false;
  document.__OMEGA_CANONICAL_ENTRY_V11=true;
  document.addEventListener('click',interceptSubmission,true);
  document.addEventListener('keydown',interceptEnter,true);
  return true;
}
function canonicalMinisterAnswer(questionText,minister,countryKey,countryDetails){
  const i=integrity();if(!i?.buildAnswerPlan)return null;
  const gs=global.Game?.state||global.gameState||global.Omega?.World?.state||{};
  const ui=global.OmegaCabinetUI||{};
  const identity={countryId:S(countryKey||gs.countryCode||gs.countryId||''),countryName:S(countryDetails?.name||countryDetails?.countryName||gs.countryName||''),ministerId:S(minister?.id||minister?.ministerId||''),ministerName:S(minister?.name||minister?.ministerName||minister?.displayName||''),ministerRole:S(minister?.role||minister?.title||''),ministryId:S(minister?.ministryId||ui.currentMinistryId||''),gameState:gs};
  try{const plan=i.buildAnswerPlan(S(questionText),identity,gs,[]);if(!plan)return null;const text=typeof i.formatOfflineAnswer==='function'?i.formatOfflineAnswer(plan):'';if(!text)return null;return{text:String(text),impact:plan?.semantic?.identityAuthority||'CANONICAL_SEMANTIC_RUNTIME',aiPowered:false,canonical:true,plan}}catch(_){return null}
}
function wrapCognitive(os){if(!os||typeof os.thinkMinisterQuestion!=='function'||os.thinkMinisterQuestion.__omegaCanonicalFacade)return false;const original=os.thinkMinisterQuestion.bind(os);function wrapped(questionText,minister,countryKey,countryDetails){const canonical=canonicalMinisterAnswer(questionText,minister,countryKey,countryDetails);if(canonical)return canonical;return original(questionText,minister,countryKey,countryDetails)}wrapped.__omegaCanonicalFacade=true;wrapped.__omegaOriginal=original;try{os.thinkMinisterQuestion=wrapped;return true}catch(_){return false}}
function installCognitiveFacade(){if(wrapCognitive(global.OmegaCognitiveOS))return true;if(typeof global.setInterval!=='function')return false;let tries=0;const timer=global.setInterval(()=>{tries++;if(wrapCognitive(global.OmegaCognitiveOS)||tries>=240){try{global.clearInterval(timer)}catch(_){}}},25);return true}
const API=Object.freeze({VERSION,parse,executeSemantic,routeMinisterQuery:route,resolveKnowledgeQuery,detectIntent,learn,recall,offlineQuery:resolveKnowledgeQuery,ensureCanonicalBrowserStack});
global.MinisterQueryRouter=API;
installEntryInterceptors();
installCognitiveFacade();
if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:window);
