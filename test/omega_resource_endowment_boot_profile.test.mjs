import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const resourceFiles=new Map([
  ['resources.json',new URL('../resources.json',import.meta.url)],
  ['resources_2.json',new URL('../resources_2.json',import.meta.url)]
]);
const nativeFetch=globalThis.fetch;
globalThis.fetch=async function(input){
  const name=String(input).split('?')[0].replace(/^\.\//,'');
  const target=resourceFiles.get(name);
  if(!target)return nativeFetch(input);
  return {ok:true,status:200,json:async()=>JSON.parse(readFileSync(fileURLToPath(target),'utf8'))};
};
globalThis.Game={state:{simulation:{turn:1},resource:{}}};

const mark=(label,t0)=>console.log(JSON.stringify({phase:label,elapsedMs:Number(process.hrtime.bigint()-t0)/1e6}));
let t=process.hrtime.bigint();mark('START',t);

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const identity=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await identity.init();
mark('COUNTRY_IDENTITY_READY',t);

await import('../resource_ministry_engine.js');
const engine=globalThis.ResourceMinistryEngine;
await engine.init();
mark('RESOURCE_MINISTRY_READY',t);

await import('../omega_resource_part04_identity_runtime.js');
await import('../omega_resource_part05_reserve_extraction_runtime.js');
await import('../omega_resource_production_model_v2.js');

const profiles=engine.countryProfiles&&typeof engine.countryProfiles==='object'?engine.countryProfiles:{};
const profileList=Object.values(profiles);
const countriesRaw=profileList.map(p=>({...((p?.identity||p)||{})})).filter(Boolean).map(p=>({ ...p, iso3:p.iso3||p.countryId||p.isoCode||null, id:p.id||p.iso3||null }));
const refs=[...(engine.deposits||[])];
for(const [profileKey,p] of Object.entries(profiles)){
  const identity=p?.identity||p||{};
  const countryId=String(identity.iso3||identity.countryId||profileKey).trim().toUpperCase();
  const sites=p?.resource_infrastructure_context?.mineSites||p?.infrastructure_context?.mineSites||[];
  if(!Array.isArray(sites))continue;
  sites.forEach((site,index)=>{
    const name=typeof site==='string'?site:String(site?.name||site?.siteName||site?.mineName||site?.depositName||('MINE_SITE_'+index)).trim();
    if(!name)return;
    refs.push({...((site&&typeof site==='object')?site:{}),id:'SITE_REF_'+countryId+'_'+String(index+1).padStart(3,'0'),name,countryCode:countryId});
  });
}
mark('BUILD_KNOWLEDGE_READY',t);
const p4=globalThis.GSRSK_Part04;
const p5=globalThis.GSRSK_Part05;
const knowledge={sovereignEntities:{countries:countriesRaw,resourceTypes:[...(engine.resourceTypes||[])]},refCatalog:{allReferences:refs}};
t=process.hrtime.bigint();
const idResult=p4.compileIdentities(knowledge,null,null);
mark('PART04_COMPILE_IDENTITIES_DONE',t);
const normalized=globalThis.OmegaResourceProductionModelV2?.normalizeIdentityRegistry?.(idResult.registry)||idResult.registry;
t=process.hrtime.bigint();
const reserveResult=p5.compileReserves(normalized,null,knowledge,{});
mark('PART05_COMPILE_RESERVES_DONE',t);

console.log(JSON.stringify({
  status:'PASS',
  profiles:Object.keys(profiles).length,
  runtimeDeposits:engine.deposits?.length||0,
  knowledgeReferences:refs.length,
  occurrenceCount:idResult.occurrenceCount,
  siteReferenceCount:idResult.siteReferenceCount,
  reserveCount:reserveResult.reserveCount,
  capacityCount:reserveResult.capacityCount
}));
