/* OMEGA RESOURCE SEMANTIC BRIDGE
 * Resource identity comes only from the repository resource ontology.
 */
(function(g){'use strict';
if(g.OmegaResourceSemanticBridge)return;
const V='1.2.0';
const N=v=>String(v==null?'':v).normalize('NFKC').replace(/[_-]+/g,' ').replace(/[?!,.:;'"(){}\[\]<>]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
let ready=false,items=new Map();
function add(id,raw){const key=String(id||raw?.key||raw?.id||'').trim();if(!key)return;const aliases=new Set([N(key),N(raw?.key),N(raw?.name),N(raw?.category)]);for(const x of [...aliases]){if(!x)continue;items.set(x,key.toUpperCase());for(const token of x.split(' '))if(token.length>=4)items.set(token,key.toUpperCase())}}
async function init(){try{const r=await fetch('/resource_ontology.json',{cache:'no-store'});if(!r.ok)throw Error('resource_ontology.json: HTTP '+r.status);const d=await r.json();const root=d?.COMMODITY_ONTOLOGIES||d?.resources||d;for(const[k,v]of Object.entries(root||{}))if(v&&typeof v==='object')add(k,v);ready=true;g.dispatchEvent(new CustomEvent('OMEGA_RESOURCE_SEMANTIC_READY',{detail:{version:V,resources:new Set(items.values()).size}}))}catch(e){console.error('[OMEGA Resource Semantic Bridge]',e)}}
function resolve(q){const x=N(q),hits=[];for(const[a,id]of items){if(x===a)hits.push({id,s:1,a});else if(new RegExp('(^|\\s)'+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=\\s|$)').test(x))hits.push({id,s:.97,a})}const groups=new Map();for(const h of hits)groups.set(h.id,Math.max(groups.get(h.id)||0,h.s));const ranked=[...groups.entries()].map(([id,s])=>({id,s})).sort((a,b)=>b.s-a.s);return ranked.length&&(!ranked[1]||ranked[0].s-ranked[1].s>=.05)?ranked[0]:null}
function bind(){const base=g.OmegaSemanticRuntimeV32;if(!ready||!base||!base.__countryBridgeV13||base.__resourceBridgeV12)return false;const oldParse=base.parse;const parse=(q,c={})=>{const p=oldParse(q,c);if(!p.entities.resource?.id){const h=resolve(q);if(h){p.entities.resource={id:h.id,type:'RESOURCE',confidence:h.s,source:'resource_ontology.json',surface:h.a};p.executable=(p.unresolved||[]).length===0&&p.operation!=='UNKNOWN';if(p.operation==='COUNT'||p.operation==='LOCATE')p.targetDomain=p.entities.country?.id?'COUNTRY_RESOURCE':'RESOURCE'}}return p};base.parse=parse;base.__resourceBridgeV12=true;const prev=g.OmegaAIIntegrity||{};g.OmegaAIIntegrity={...prev,VERSION:'3.2.6-PRODUCTION',parse};const router=g.MinisterQueryRouter||{};g.MinisterQueryRouter={...router,VERSION:'3.2.6-PRODUCTION',routeMinisterQuery:(q,m={},w={})=>{const p=parse(q,{...m,...w});return{version:'3.2.6-PRODUCTION',intent:p.targetDomain,domain:p.targetDomain,entities:Object.values(p.entities).filter(x=>x?.id),requiredData:[p.operation],semantic:p,executable:p.executable}}};return true}
g.OmegaResourceSemanticBridge={VERSION:V,init,diagnostics:()=>({version:V,ready,resources:new Set(items.values()).size}),resolve:resolve,install:bind};
init();
const boot=setInterval(()=>{if(bind()){clearInterval(boot)}},50);setTimeout(()=>clearInterval(boot),15000);
})(typeof globalThis!=='undefined'?globalThis:window);
