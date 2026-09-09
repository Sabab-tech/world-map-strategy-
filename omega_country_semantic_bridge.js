/* OMEGA COUNTRY SEMANTIC BRIDGE
 * Country identity comes from the repository registry; localized names are
 * generated from ISO data and resolved with vocabulary morphology.
 *
 * v1.6: binds to the canonical production semantic runtime when available.
 * The legacy v3.2 runtime is intentionally not required by this bridge.
 */
(function(g){'use strict';
if(g.OmegaCountrySemanticBridge)return;
const V='1.6.0';
const N=v=>String(v==null?'':v).normalize('NFKC').replace(/[?!,.:;'"(){}\\[\\]<>]/g,' ').replace(/\\s+/g,' ').trim().toLowerCase();
let ready=false,countries=new Map(),suffixes=[];
function localized(code){const out=[];try{for(const locale of ['bn','en','ar','hi','fr','de','es','pt','ru','zh']){const d=new Intl.DisplayNames([locale],{type:'region'}).of(code);if(d)out.push(d)}}catch(_){}return out}
function add(raw,fallback){if(!raw||typeof raw!=='object')return;const id=String(raw.country_code||raw.iso3||raw.isoCode||raw.code||raw.id||fallback||'').trim().toUpperCase();if(!id)return;const names=[raw.country_name,raw.name,raw.officialName,raw.shortName,raw.displayName,raw.nativeName,...(id.length===2?localized(id):[])].filter(x=>typeof x==='string'&&x.trim());for(const x of names)countries.set(N(x),id);countries.set(N(id),id)}
async function init(){try{const[r,v]=await Promise.all([fetch('/relation_generation_engine.json',{cache:'no-store'}),fetch('/offline_language_vocabulary.json',{cache:'no-store'})]);if(!r.ok)throw Error('relation_generation_engine.json: HTTP '+r.status);const d=await r.json();const root=d?.RELATION_GENERATION_ENGINE?.srie_v2_asymmetrical_salience||d?.srie_v2_asymmetrical_salience||{};for(const[k,x]of Object.entries(root))add(x,k);if(v.ok){const lang=await v.json();suffixes=[...(lang?.morphology?.bn_suffixes||[]),...(lang?.morphology?.en_suffixes||[])].map(N)}ready=true;g.dispatchEvent(new CustomEvent('OMEGA_COUNTRY_SEMANTIC_READY',{detail:{version:V,countries:new Set(countries.values()).size}}))}catch(e){console.error('[OMEGA Country Semantic Bridge]',e)}}
function resolve(q){const x=N(q),variants=new Set([x]);for(const token of x.split(' '))for(const s of suffixes)if(s&&token.endsWith(s)&&token.length>s.length+1)variants.add(x.replace(token,token.slice(0,-s.length)));const hits=[];for(const[n,id]of countries){for(const qv of variants){if(qv===n)hits.push({id,s:1,n});else if(new RegExp('(^|\\\\s)'+n.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+'(?=\\\\s|$)').test(qv))hits.push({id,s:.995,n})}}hits.sort((a,b)=>b.s-a.s||b.n.length-a.n.length);return hits[0]||null}
function currentMinister(ctx={}){const r=g.OmegaMinisterStateRegistry,c=String(ctx.countryId||ctx.countryCode||g.Game?.state?.countryId||g.Game?.state?.playerCountryId||g.Game?.currentActiveCountry||'').toUpperCase(),m=String(ctx.ministryId||g.Game?.state?.activeMinistryId||'');if(r&&c&&m&&typeof r.getActiveMinister==='function')try{const x=r.getActiveMinister(c,m);if(x)return x}catch(_){}for(const x of[ctx.ministerId,g.Game?.state?.activeMinisterId,g.OmegaCabinetUI?.currentInterrogatedMinister?.ministerId])if(x)return x;return null}
function install(){const base=g.OmegaProductionSemanticRuntime;if(!base||base.__countryBridgeV16)return false;const oldParse=base.parse,oldExecute=base.execute;
const parse=(q,c={})=>{let p;try{p=oldParse.call(base,q,c)}catch(e){p=oldParse.call(base,q,{})}const self=/(^|\\s)(you|your|yours|yourself)(\\s|$)|তুমি|তোমার|আপনি|আপনার|নিজের/.test(N(q));if(self&&!p.entities?.minister?.id){const m=currentMinister(c);const id=typeof m==='string'?m:(m?.ministerId||m?.id);if(id){p={...p,entities:{...p.entities,minister:{id,type:'MINISTER',confidence:1,source:'AUTHORITATIVE_ACTIVE_MINISTER'}},unresolved:(p.unresolved||[]).filter(x=>x!=='MINISTER'),targetDomain:'MINISTER',executable:(p.unresolved||[]).filter(x=>x!=='MINISTER').length===0&&p.operation!=='UNKNOWN'}}}if(!p.entities?.country?.id){const h=resolve(q);if(h){p={...p,entities:{...p.entities,country:{id:h.id,type:'COUNTRY',confidence:h.s,source:'relation_generation_engine.json',surface:h.n}},unresolved:(p.unresolved||[]).filter(x=>x!=='COUNTRY')};p.executable=p.unresolved.length===0&&p.operation!=='UNKNOWN';if(p.operation==='COUNT'||p.operation==='LOCATE')p.targetDomain=p.entities.resource?.id?'COUNTRY_RESOURCE':'COUNTRY'}}return p};
base.parse=parse;base.__countryBridgeV16=true;
const prev=g.OmegaAIIntegrity||{};g.OmegaAIIntegrity={...prev,VERSION:'4.1.0-PRODUCTION',parse};
const prevRouter=g.MinisterQueryRouter||{};g.MinisterQueryRouter={...prevRouter,VERSION:'4.1.0-PRODUCTION',routeMinisterQuery:(q,m={},w={})=>{const p=parse(q,{...m,...w});return{version:'4.1.0-PRODUCTION',intent:p.targetDomain,domain:p.targetDomain,entities:Object.values(p.entities||{}).filter(x=>x?.id),requiredData:[p.operation],semantic:p,executable:p.executable}}};
return true}
g.OmegaCountrySemanticBridge={VERSION:V,init,diagnostics:()=>({version:V,ready,countries:new Set(countries.values()).size}),resolve,install};
const boot=setInterval(()=>{if(install()){clearInterval(boot);init()}},50);setTimeout(()=>clearInterval(boot),15000);
})(typeof globalThis!=='undefined'?globalThis:window);
