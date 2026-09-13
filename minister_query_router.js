/* OMEGA MINISTER QUERY ROUTER v13.0.0-DEEP-CORE-BRIDGE
 * Browser entry -> server Deep Core -> repository search registry -> verified evidence.
 * The browser cannot read the server repository filesystem directly, so data authority
 * is explicitly bridged through /api/deep-core/query. AI layers are never authoritative.
 */
(function(global){'use strict';
const VERSION='13.0.0-DEEP-CORE-BRIDGE';
const S=v=>String(v==null?'':v).trim();
const U=v=>S(v).toUpperCase();
const asset=p=>{try{return typeof document!=='undefined'&&document.baseURI?new URL(p,document.baseURI).href:p}catch(_){return p}};
const rt=()=>global.OmegaProductionSemanticRuntime||null;
const brain=()=>global.OfflineSemanticBrain||null;
const qe=()=>global.OfflineQueryEngine||null;
const integrity=()=>global.OmegaAIIntegrity||null;
const QueryIntent=Object.freeze({RESOURCE_MINING_DISCOVERY:'RESOURCE_MINING_DISCOVERY',RESOURCE_SECURITY:'RESOURCE_SECURITY',RESOURCE_QUANTITY:'RESOURCE_QUANTITY',RESOURCE_LOCATION:'RESOURCE_LOCATION',COMPARE:'COMPARE',LOOKUP:'LOOKUP',COUNT:'COUNT',LOCATION:'LOCATION'});
let universalPromise=null;
const loadedScripts=new Set();

function parse(q,ctx={}){
  try{if(brain()?.parse){const p=brain().parse(q,ctx);if(p?.contractVersion)return p}}catch(_){}
  try{if(rt()?.parse)return rt().parse(q,ctx,ctx.gameState||ctx.worldState||{},ctx.history||[])}catch(_){}
  return{contractVersion:'OMEGA-QUERY-IR-FAILURE',raw:S(q),language:/[\u0980-\u09FF]/.test(S(q))?'bn':'en',operation:'UNKNOWN',subject:{type:'UNKNOWN',id:null},entities:{country:{status:'UNRESOLVED',id:null},resource:{status:'UNRESOLVED',id:null}},unresolved:['SEMANTIC_RUNTIME_UNAVAILABLE'],executable:false};
}

function executeSemantic(p,ctx={}){
  try{if(qe()?.execute){const r=qe().execute(p,[],p.language||'en',{...ctx,countryId:p?.entities?.country?.id||ctx.countryId,resourceId:p?.entities?.resource?.id||ctx.resourceId});if(r)return r}}catch(_){}
  try{const i=integrity();if(i?.buildAnswerPlan){const plan=i.buildAnswerPlan(p.raw||'',ctx,ctx.gameState||ctx.worldState||{},ctx.history||[]);if(plan?.result?.status==='VERIFIED_FACT')return plan.result}}catch(_){}
  try{if(rt()?.execute)return rt().execute(p,ctx)}catch(_){}
  return{ok:false,status:'NO_AUTHORITATIVE_EXECUTOR',value:null,evidence:[]};
}

async function executeServerDeepCore(question,ctx={}){
  if(typeof fetch!=='function')return{status:'SERVER_FETCH_UNAVAILABLE',value:null,evidence:[]};
  const controller=typeof AbortController==='function'?new AbortController():null;
  const timer=controller?setTimeout(()=>{try{controller.abort()}catch(_){ }},30000):null;
  try{
    const response=await fetch(asset('/api/deep-core/query'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:S(question),question:S(question),...ctx,countryId:ctx.countryId||ctx.countryCode,resourceId:ctx.resourceId||ctx.resourceId}),signal:controller?.signal});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok&&payload?.status!=='VERIFIED_FACT'&&payload?.result?.status!=='VERIFIED_FACT')return{...payload,status:payload?.result?.status||payload?.status||`HTTP_${response.status}`,value:payload?.result?.value??payload?.value??null,evidence:payload?.result?.evidence||payload?.evidence||[],server:true};
    return{...payload,result:payload?.result||null,status:payload?.result?.status||payload?.status||'UNKNOWN',value:payload?.result?.value??payload?.value??null,evidence:payload?.result?.evidence||payload?.evidence||[],server:true};
  }catch(e){return{status:'SERVER_FETCH_FAILED',value:null,evidence:[],server:false,error:e?.message||String(e)}}
  finally{if(timer)clearTimeout(timer)}
}

function legacyIntent(p){const a=U(p?.entities?.assetClass?.id||p?.assetClass||''),op=U(p?.operation||'LOOKUP');if(['MINE','DEPOSIT','OIL_FIELD','GAS_FIELD'].includes(a))return QueryIntent.RESOURCE_MINING_DISCOVERY;if(p?.property&&/SECURITY|STOCK|RESERVE/.test(U(p.property)))return QueryIntent.RESOURCE_SECURITY;if(op==='COUNT')return QueryIntent.COUNT;if(op==='LOCATE')return QueryIntent.LOCATION;if(op==='COMPARE')return QueryIntent.COMPARE;return op||QueryIntent.LOOKUP}

function route(q,identity={},world={}){
  const ctx={...identity,...world,history:world.history||identity.history||[]},p=parse(q,ctx),result=executeSemantic(p,ctx);
  return{version:VERSION,intent:legacyIntent(p),operation:p.operation||'UNKNOWN',domain:p.intent||p.targetDomain||'GENERAL',entities:Object.values(p.entities||{}).filter(e=>e?.id).map(e=>({type:e.type||null,id:e.id,confidence:e.confidence||null,source:e.source||null,surface:e.surface||null})),requiredData:Object.values(p.entities||{}).filter(e=>e?.id).map(e=>e.type||null).filter(Boolean),semantic:p,result,dataFound:result?.status==='VERIFIED_FACT',executable:p.executable!==false&&result?.status!=='NO_AUTHORITATIVE_EXECUTOR'};
}

function resolveKnowledgeQuery(q,ctx={}){const r=route(q,ctx,ctx);return{...r,country:r.semantic?.entities?.country||null,resource:r.semantic?.entities?.resource||null,operation:r.semantic?.operation||r.semantic?.question?.type||'UNKNOWN'}}
function detectIntent(q,ctx={}){return legacyIntent(parse(q,ctx))}
function learn(surface,mapping={},confidence=.95){const r=rt(),id=mapping.canonicalId||mapping.countryId||mapping.resourceId||mapping.ministerId,type=mapping.entityType||(mapping.countryId?'COUNTRY':mapping.resourceId?'RESOURCE':mapping.ministerId?'PERSON':null);try{return!!(r?.learn&&surface&&id&&type&&r.learn(surface,type,id,confidence))}catch(_){return false}}
function recall(q){try{return rt()?.recall?.(q)||{}}catch(_){return{}}}

function renderResult(output,question){
  if(typeof document==='undefined')return;
  const input=document.getElementById('interrogation-input');
  let host=document.getElementById('omega-deep-core-result');
  if(!host){host=document.createElement('div');host.id='omega-deep-core-result';host.setAttribute('data-source','DEEP_CORE');host.style.cssText='margin-top:10px;padding:10px;border:1px solid rgba(0,229,255,.28);background:rgba(0,0,0,.28);border-radius:6px;color:#dbeafe;font:12px/1.5 Inter,Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;';const parent=input?.parentElement;if(parent)parent.appendChild(host);else document.body.appendChild(host)}
  while(host.firstChild)host.removeChild(host.firstChild);
  const status=S(output?.status||'UNKNOWN');
  const title=document.createElement('div');title.style.fontWeight='700';title.textContent=`DEEP CORE • ${status}`;host.appendChild(title);
  const value=document.createElement('div');value.style.marginTop='6px';value.textContent=output?.value===null||output?.value===undefined?'Result: null':`Result: ${typeof output.value==='object'?JSON.stringify(output.value):String(output.value)}`;host.appendChild(value);
  if(question){const q=document.createElement('div');q.style.marginTop='5px';q.style.opacity='.75';q.textContent=`Question: ${question}`;host.appendChild(q)}
  const ev=Array.isArray(output?.evidence)?output.evidence:[];
  if(ev.length){const e=document.createElement('div');e.style.marginTop='6px';e.textContent=ev.slice(0,8).map((x,i)=>`[${i+1}] ${x.dataset||'?'} → ${x.physicalPath||'?'} → ${x.recordLocator||'?'}${x.fieldPath?` → ${x.fieldPath}`:''}${x.canonicalEntityId?` → ${x.canonicalEntityId}`:''}`).join('\n');host.appendChild(e)}
  if(status!=='VERIFIED_FACT'&&output?.error){const er=document.createElement('div');er.style.marginTop='6px';er.style.opacity='.8';er.textContent=`Error: ${output.error}`;host.appendChild(er)}
}

function loadOnce(src){
  if(loadedScripts.has(src))return Promise.resolve(true);
  if(typeof document==='undefined')return Promise.resolve(false);
  const existing=[...document.scripts].find(x=>x.src&&(x.src===asset(src)||x.src.endsWith('/'+src)));
  if(existing){loadedScripts.add(src);return Promise.resolve(true)}
  return new Promise(resolve=>{const s=document.createElement('script');s.src=asset(src);s.onload=()=>{loadedScripts.add(src);resolve(true)};s.onerror=()=>resolve(false);document.head.appendChild(s)})
}
async function ensureCanonicalBrowserStack(){await loadOnce('omega_language_system.js');await loadOnce('omega_language_batch03_semantic_extension.js');await loadOnce('omega_country_semantic_bridge.js');await loadOnce('omega_resource_semantic_bridge.js');await loadOnce('omega_production_semantic_runtime_v3.js');await loadOnce('offline_semantic_brain.js');await loadOnce('offline_query_engine.js');await loadOnce('omega_reasoning_dispatcher.js');await loadOnce('omega_universal_ai_runtime.js');return global.OmegaUniversalAIRuntime||null}
function getQuestionFromUI(){const input=document.getElementById('interrogation-input');return{input,q:S(input?.value)}}

async function enqueue(q,ctx={}){
  const question=S(q);if(!question)return{status:'EMPTY_QUERY',value:null,evidence:[]};
  const server=await executeServerDeepCore(question,ctx);
  if(server.server===true){renderResult(server,question);return server;}
  try{
    if(universalPromise===null)universalPromise=ensureCanonicalBrowserStack();
    const u=await universalPromise;
    if(u?.enqueue)return u.enqueue(question);
  }catch(_){ }
  renderResult(server,question);
  return server;
}

function interceptSubmission(event){const button=event?.target?.closest?.('#btn-submit-interrogation');if(!button)return false;const{input,q}=getQuestionFromUI();if(!q)return false;event.preventDefault();event.stopImmediatePropagation();if(input)input.value='';enqueue(q).catch(e=>renderResult({status:'ENTRY_FAILED',value:null,evidence:[],error:e?.message||String(e)},q));return true}
function interceptEnter(event){if(event.key!=='Enter'||event.shiftKey||event.isComposing||event.target?.id!=='interrogation-input')return false;const q=S(event.target.value);if(!q)return false;event.preventDefault();event.stopImmediatePropagation();event.target.value='';enqueue(q).catch(e=>renderResult({status:'ENTRY_FAILED',value:null,evidence:[],error:e?.message||String(e)},q));return true}
function installEntryInterceptors(){if(typeof document==='undefined'||document.__OMEGA_CANONICAL_ENTRY_V13)return false;document.__OMEGA_CANONICAL_ENTRY_V13=true;document.addEventListener('click',interceptSubmission,true);document.addEventListener('keydown',interceptEnter,true);return true}
function canonicalMinisterAnswer(questionText,minister,countryKey,countryDetails){const i=integrity();if(!i?.buildAnswerPlan)return null;const gs=global.Game?.state||global.gameState||global.Omega?.World?.state||{};const identity={countryId:S(countryKey||gs.countryCode||gs.countryId||''),countryName:S(countryDetails?.name||countryDetails?.countryName||gs.countryName||''),ministerId:S(minister?.id||minister?.ministerId||''),ministerName:S(minister?.name||minister?.ministerName||minister?.displayName||''),ministerRole:S(minister?.role||minister?.title||''),ministryId:S(minister?.ministryId||''),gameState:gs};try{const plan=i.buildAnswerPlan(S(questionText),identity,gs,[]);if(!plan||plan?.result?.status!=='VERIFIED_FACT')return null;const text=typeof i.formatOfflineAnswer==='function'?i.formatOfflineAnswer(plan):'';return{text:String(text||''),impact:plan?.semantic?.identityAuthority||'DEEP_CORE',aiPowered:false,canonical:true,plan}}catch(_){return null}}
function wrapCognitive(os){if(!os||typeof os.thinkMinisterQuestion!=='function'||os.thinkMinisterQuestion.__omegaCanonicalFacade)return false;const original=os.thinkMinisterQuestion.bind(os);function wrapped(questionText,minister,countryKey,countryDetails){const canonical=canonicalMinisterAnswer(questionText,minister,countryKey,countryDetails);if(canonical)return canonical;return original(questionText,minister,countryKey,countryDetails)}wrapped.__omegaCanonicalFacade=true;wrapped.__omegaOriginal=original;try{os.thinkMinisterQuestion=wrapped;return true}catch(_){return false}}
function installCognitiveFacade(){if(wrapCognitive(global.OmegaCognitiveOS))return true;if(typeof global.setInterval!=='function')return false;let tries=0;const timer=global.setInterval(()=>{tries++;if(wrapCognitive(global.OmegaCognitiveOS)||tries>=240){try{global.clearInterval(timer)}catch(_){}}},25);return true}

const API=Object.freeze({VERSION,QueryIntent,parse,executeSemantic,executeServerDeepCore,routeMinisterQuery:route,resolveKnowledgeQuery,detectIntent,learn,recall,ensureCanonicalBrowserStack,enqueue});
global.MinisterQueryRouter=API;installEntryInterceptors();installCognitiveFacade();
if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:window);
