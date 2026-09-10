/* OMEGA CANONICAL AI CONTEXT BRIDGE v1.2.1
 * Browser-side transport bridge for canonical semantic context and repository-data entity discovery.
 * Country identity is discovered from the canonical country registry / countries.json.
 * No country facts or country mappings are hardcoded here.
 */
(function(global){
  'use strict';
  if(global.OmegaCanonicalAIContextBridge?.VERSION === '1.2.1')return;

  const VERSION='1.2.1';
  const text=v=>String(v==null?'':v).trim();
  const norm=v=>text(v).normalize('NFKC').toLowerCase().replace(/[?!,.:;'"“”‘’(){}[\]<>—–]/g,' ').replace(/\s+/g,' ').trim();
  const tokens=v=>norm(v).split(' ').filter(Boolean);
  const clone=v=>{try{return v===undefined?undefined:JSON.parse(JSON.stringify(v))}catch(_){return null}};
  const lastHistory=()=>{
    try{
      if(global.OmegaUniversalAIRuntime&&typeof global.OmegaUniversalAIRuntime.readHistory==='function'){
        const h=global.OmegaUniversalAIRuntime.readHistory();
        return Array.isArray(h)?h.slice(-24):[];
      }
    }catch(_){ }
    return [];
  };

  function context(overrides={}){
    const gs=global.Game?.state||global.gameState||global.Omega?.World?.state||{};
    const ui=global.OmegaCabinetUI||{};
    const m=ui.currentInterrogatedMinister||ui.currentMinister||ui.activeMinister||{};
    const registry=global.OmegaMinisterStateRegistry;
    const countryId=text(overrides.countryCode||overrides.countryId||gs.countryCode||gs.countryId||gs.playerCountryId||ui.activeCountry||'');
    const ministryId=text(overrides.ministryId||m.ministryId||ui.currentMinistryId||gs.activeMinistryId||'');
    const direct=registry&&countryId&&ministryId&&typeof registry.getActiveMinister==='function'?registry.getActiveMinister(countryId,ministryId):null;
    return {
      countryId,
      countryName:text(overrides.countryName||gs.countryName||gs.country?.name||ui.activeCountry||''),
      ministerId:text(overrides.ministerId||direct?.ministerId||m.ministerId||m.id||ui.currentMinisterId||''),
      ministerName:text(overrides.ministerName||m.ministerName||m.name||m.displayName||direct?.profile?.baseName||direct?.profile?.name||''),
      ministerRole:text(overrides.ministerRole||m.role||m.title||direct?.profile?.role||''),
      ministryId,
      language:text(overrides.language||global.OmegaLanguageSystem?.getContext?.()?.language||''),
      gameState:clone(overrides.gameState||gs)||{},
      reservesData:clone(overrides.reservesData||gs.reservesData||null),
      timeHorizon:overrides.timeHorizon??gs.timeHorizon??null
    };
  }

  function ministerSnapshot(ctx){
    const r=global.OmegaMinisterStateRegistry;
    if(!r||!ctx?.ministerId)return null;
    try{
      const profile=typeof r.getMinister==='function'?r.getMinister(ctx.ministerId):null;
      const runtime=typeof r.getRuntime==='function'?r.getRuntime(ctx.ministerId):null;
      const learning=typeof r.getLearning==='function'?r.getLearning(ctx.ministerId):null;
      const active=typeof r.getActiveMinister==='function'&&ctx.countryId&&ctx.ministryId?r.getActiveMinister(ctx.countryId,ctx.ministryId):null;
      return {profile:clone(profile),runtime:clone(runtime),learning:clone(learning),active:clone(active)};
    }catch(_){return null;}
  }

  function countryNameScore(question,name){
    const q=norm(question),n=norm(name);
    if(!q||!n)return 0;
    if(q===n)return 1;
    if(q.includes(n))return Math.min(.998,.92+n.length/Math.max(100,q.length*2));
    const qt=tokens(q),nt=tokens(n);
    if(!qt.length||!nt.length||nt.length>qt.length)return 0;
    let best=0;
    for(let start=0;start<=qt.length-nt.length;start++){
      let matched=0;
      for(let i=0;i<nt.length;i++){
        const a=qt[start+i],b=nt[i];
        if(a===b||(a.length>=2&&b.startsWith(a)))matched++;else break;
      }
      if(matched===nt.length){
        const coverage=nt.length/Math.max(1,qt.length);
        const compactness=nt.length/Math.max(1,nt.length+(qt.length-nt.length));
        best=Math.max(best,.80+.14*coverage+.04*compactness+.02*(q.length/Math.max(1,n.length)));
      }
    }
    return Math.min(.99,best);
  }

  async function discoverCountry(question){
    const registry=global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge;
    try{if(registry?.init)await registry.init();}catch(_){ }
    try{
      const direct=registry?.resolveCountry?.(question);
      if(direct?.id)return direct;
    }catch(_){ }
    const records=[];
    try{
      const exported=registry?.exportData?.();
      if(Array.isArray(exported?.countries))for(const c of exported.countries){
        const id=text(c?.id).toUpperCase();
        const names=[...(Array.isArray(c?.names)?c.names:[]),c?.officialName].filter(Boolean).map(text);
        if(id&&names.length)records.push({id,names,raw:c});
      }
    }catch(_){ }
    let best=null;
    for(const record of records)for(const name of record.names){
      const score=countryNameScore(question,name);
      if(score<=0)continue;
      const candidate={id:record.id,type:'COUNTRY',confidence:score,surface:name,source:'OMEGA_COUNTRIES_JSON_ENTITY_DISCOVERY',raw:record.raw};
      if(!best||candidate.confidence>best.confidence||candidate.confidence===best.confidence&&candidate.surface.length>best.surface.length)best=candidate;
    }
    return best;
  }

  function groundedCountryPlan(question,plan,country){
    if(!country?.id)return plan;
    const out=clone(plan)||{};
    const semantic=out.semantic&&typeof out.semantic==='object'?{...out.semantic}:{};
    const existing=semantic.entities&&typeof semantic.entities==='object'?{...semantic.entities}:{};
    existing.country={id:country.id,canonicalId:country.id,type:'COUNTRY',surface:country.surface,confidence:country.confidence,source:country.source,raw:clone(country.raw)};
    semantic.entities=existing;
    semantic.targetDomain='COUNTRY';
    semantic.operation=semantic.operation&&semantic.operation!=='UNKNOWN'?semantic.operation:'IDENTIFY';
    semantic.unresolved=Array.isArray(semantic.unresolved)?semantic.unresolved.filter(x=>x!=='COUNTRY'):[];
    semantic.identityAuthority='OMEGA_CANONICAL_IDENTITY_BRIDGE';
    semantic.executable=semantic.unresolved.length===0&&semantic.operation!=='UNKNOWN';
    const name=country.raw?.officialName||country.raw?.name||country.raw?.names?.[0]||country.surface||country.id;
    const bn=/[\u0980-\u09FF]/.test(question);
    out.semantic=semantic;
    out.countryId=country.id;
    out.countryName=name;
    out.result=out.result&&typeof out.result==='object'?out.result:{
      ok:true,status:'VERIFIED_FACT',operation:semantic.operation,targetDomain:'COUNTRY',countryId:country.id,
      text:bn?`${name} একটি দেশ; ক্যানোনিক্যাল ডেটা আইডি ${country.id}.`:`${name} is a country; canonical data ID: ${country.id}.`,
      value:country.id,entity:clone(country.raw),source:'countries.json',
      evidence:{dataset:'countries.json',recordIdentity:country.id,fieldPath:'code',canonicalEntityId:country.id,rawValue:country.id,surface:country.surface,confidence:country.confidence}
    };
    return out;
  }

  function build(question,request={},preResolved=null){
    const rt=global.OmegaProductionSemanticRuntime;
    const ctx=context(request);
    if(!rt||typeof rt.buildAnswerPlan!=='function')return{ok:false,reason:'CANONICAL_SEMANTIC_RUNTIME_UNAVAILABLE',context:ctx};
    try{
      const minister=ministerSnapshot(ctx);
      const identity={countryCode:ctx.countryId,countryName:ctx.countryName,ministerId:ctx.ministerId,ministerName:ctx.ministerName,ministerRole:ctx.ministerRole,ministryId:ctx.ministryId,ministerState:minister};
      const history=Array.isArray(request.history)?request.history.slice(-24):lastHistory();
      const state=clone(ctx.gameState)||{};
      if(ctx.reservesData!=null)state.reservesData=clone(ctx.reservesData);
      if(ctx.timeHorizon!=null)state.timeHorizon=ctx.timeHorizon;
      const plan=rt.buildAnswerPlan(question,identity,state,history);
      if(!plan||typeof plan!=='object')return{ok:false,reason:'CANONICAL_SEMANTIC_RUNTIME_RETURNED_INVALID_PLAN',context:ctx};
      return groundedCountryPlan(question,plan,preResolved);
    }catch(e){return{ok:false,reason:'CANONICAL_CONTEXT_BUILD_FAILED',error:text(e.message||e),context:ctx};}
  }

  async function buildAsync(question,request={}){
    const country=await discoverCountry(question);
    const plan=build(question,request,country);
    if(plan?.ok===false&&country?.id)return groundedCountryPlan(question,{semantic:{operation:'IDENTIFY',targetDomain:'COUNTRY',entities:{},unresolved:[]}},country);
    return plan;
  }

  function shouldBridge(url){try{const u=new URL(url,typeof location!=='undefined'?location.href:undefined);return u.pathname.endsWith('/api/ai/minister-consult')||u.pathname.endsWith('/api/ai/semantic-query')}catch(_){return false}}

  function mergeRequestBody(body,packet){
    const history=Array.isArray(body.conversationHistory)?body.conversationHistory.slice(-24):undefined;
    return {...body,canonicalAuthority:'OMEGA_PRODUCTION_SEMANTIC_RUNTIME',canonicalSemanticPlan:packet.semanticPlan,canonicalContextPacket:{version:packet.version,question:packet.question,authority:packet.authority,identity:packet.identity,context:packet.context,ministerState:packet.ministerState,runtimeDiagnostics:packet.runtimeDiagnostics,languageDiagnostics:packet.languageDiagnostics,history}};
  }

  function installFetch(){
    if(global.__omegaCanonicalFetchBridgeInstalled||typeof global.fetch!=='function')return false;
    const nativeFetch=global.fetch.bind(global);global.__omegaCanonicalFetchBridgeInstalled=true;
    global.fetch=async function(input,init={}){
      let target='';try{target=typeof input==='string'?input:(input?.url||'')}catch(_){}
      if(!shouldBridge(target)||!init?.body)return nativeFetch(input,init);
      let body;try{body=JSON.parse(String(init.body))}catch(_){return nativeFetch(input,init)}
      if(!body?.prompt||typeof body.prompt!=='string')return nativeFetch(input,init);
      const packet=await buildAsync(body.prompt,body);
      if(!packet?.ok)return nativeFetch(input,init);
      const semanticPlan=packet.semanticPlan&&typeof packet.semanticPlan==='object'?packet.semanticPlan:packet;
      const envelope={...packet,semanticPlan};
      const next={...init,headers:{'Content-Type':'application/json',...(init.headers||{})},body:JSON.stringify(mergeRequestBody(body,envelope))};
      return nativeFetch(input,next);
    };
    return true;
  }

  global.OmegaCanonicalAIContextBridge=Object.freeze({VERSION,context,discoverCountry,build,buildAsync,installFetch});
  if(typeof document!=='undefined'){
    const boot=()=>{installFetch();global.dispatchEvent?.(new CustomEvent('OMEGA_CANONICAL_AI_CONTEXT_BRIDGE_READY',{detail:{version:VERSION}}));};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }
})(typeof globalThis!=='undefined'?globalThis:window);
