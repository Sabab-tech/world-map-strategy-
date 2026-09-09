/* OMEGA RESOURCE SEMANTIC BRIDGE
 * Resource identity comes from the canonical repository ontology.
 *
 * v1.6.1: binds to the canonical production semantic runtime and resolves
 * repository assets relative to the served document instead of assuming root.
 */
(function(g){'use strict';
if(g.OmegaResourceSemanticBridge)return;
const V='1.6.1';
const N=v=>String(v==null?'':v).normalize('NFKC').replace(/[?!,.:;'"(){}\\[\\]<>]/g,' ').replace(/\\s+/g,' ').trim().toLowerCase();
const asset=p=>{try{return typeof document!=='undefined'&&document.baseURI?new URL(p,document.baseURI).href:p}catch(_){return p}};
let ready=false,resources=new Map();
function add(raw,fallback){if(!raw||typeof raw!=='object')return;const id=String(raw.resource_id||raw.resourceId||raw.canonical_id||raw.id||raw.key||fallback||'').trim().toUpperCase();if(!id)return;const names=[raw.name,raw.resource_name,raw.resourceName,raw.canonicalName,raw.displayName,raw.label,raw.name_en,raw.name_bn,raw.title].filter(x=>typeof x==='string'&&x.trim());for(const x of names)resources.set(N(x),id);resources.set(N(id),id)}
async function init(){try{const r=await fetch(asset('resource_ontology.json'),{cache:'no-store'});if(!r.ok)throw Error('resource_ontology.json: HTTP '+r.status);const d=await r.json();const root=d?.COMMODITY_ONTOLOGIES||d?.resources||d?.resource_types||d||{};for(const[k,x]of Object.entries(root))add(typeof x==='object'?x:{id:k,name:x},k);ready=true;g.dispatchEvent(new CustomEvent('OMEGA_RESOURCE_SEMANTIC_READY',{detail:{version:V,resources:resources.size}}))}catch(e){console.error('[OMEGA Resource Semantic Bridge]',e)}}
function resolve(q){const x=N(q);let best=null;for(const[id,name]of resources){if(!name)continue;if(x===id||x===name)return{id,name,s:1};if(x.includes(name)&&(!best||name.length>best.name.length))best={id,name,s:.95}}return best}
function install(){const base=g.OmegaProductionSemanticRuntime;if(!base||base.__resourceBridgeV161)return false;const oldParse=base.parse;
const parse=(q,c={})=>{const p=oldParse.call(base,q,c);if(!p.entities?.resource?.id){const h=resolve(q);if(h){return{...p,entities:{...p.entities,resource:{id:h.id,type:'RESOURCE',confidence:h.s,source:'resource_ontology.json',surface:h.name}},unresolved:(p.unresolved||[]).filter(x=>x!=='RESOURCE'),targetDomain:p.entities?.country?.id?'COUNTRY_RESOURCE':'RESOURCE',executable:(p.unresolved||[]).filter(x=>x!=='RESOURCE').length===0&&p.operation!=='UNKNOWN'}}}return p};base.parse=parse;base.__resourceBridgeV161=true;
const prev=g.OmegaAIIntegrity||{};g.OmegaAIIntegrity={...prev,VERSION:'4.1.0-PRODUCTION',parse};
return true}
g.OmegaResourceSemanticBridge={VERSION:V,init,diagnostics:()=>({version:V,ready,resources:resources.size}),resolve,install};
const boot=setInterval(()=>{if(install()){clearInterval(boot);init()}},50);setTimeout(()=>clearInterval(boot),15000);
})(typeof globalThis!=='undefined'?globalThis:window);
