/* OMEGA CANONICAL AI CONTEXT BRIDGE v1.0.0
 * Browser-side transport bridge. It does not own facts, language, or cognition.
 * It snapshots the live game context, obtains the canonical production semantic
 * plan, and attaches both to AI API requests so server-side generation sees the
 * exact same semantic contract rather than reparsing the question independently.
 */
(function(global){
  'use strict';
  if(global.OmegaCanonicalAIContextBridge)return;
  const VERSION='1.0.0';
  const text=v=>String(v==null?'':v).trim();
  const clone=v=>{try{return v===undefined?undefined:JSON.parse(JSON.stringify(v))}catch(_){return null}};
  const base=p=>{try{return typeof document!=='undefined'&&document.baseURI?new URL(p,document.baseURI).href:p}catch(_){return p}};
  const context=()=>{
    const gs=global.Game?.state||global.gameState||global.Omega?.World?.state||{};
    const ui=global.OmegaCabinetUI||{};
    const m=ui.currentInterrogatedMinister||ui.currentMinister||ui.activeMinister||{};
    const registry=global.OmegaMinisterStateRegistry;
    const countryId=text(gs.countryCode||gs.countryId||gs.playerCountryId||ui.activeCountry||'');
    const ministryId=text(m.ministryId||ui.currentMinistryId||gs.activeMinistryId||'');
    const direct=registry&&countryId&&ministryId&&typeof registry.getActiveMinister==='function'?registry.getActiveMinister(countryId,ministryId):null;
    return {
      countryId,
      countryName:text(gs.countryName||gs.country?.name||ui.activeCountry||''),
      ministerId:text(direct?.ministerId||m.ministerId||m.id||ui.currentMinisterId||''),
      ministerName:text(m.ministerName||m.name||m.displayName||direct?.profile?.baseName||direct?.profile?.name||''),
      ministerRole:text(m.role||m.title||direct?.profile?.role||''),
      ministryId,
      gameState:clone(gs)||{}
    };
  };
  function ministerSnapshot(ctx){
    const r=global.OmegaMinisterStateRegistry;
    if(!r||!ctx?.ministerId)return null;
    try{
      const profile=typeof r.getMinister==='function'?r.getMinister(ctx.ministerId):null;
      const runtime=typeof r.getRuntime==='function'?r.getRuntime(ctx.ministerId):null;
      const learning=typeof r.getLearning==='function'?r.getLearning(ctx.ministerId):null;
      return {profile:clone(profile),runtime:clone(runtime),learning:clone(learning)};
    }catch(_){return null;}
  }
  function build(question){
    const ctx=context();
    const rt=global.OmegaProductionSemanticRuntime;
    if(!rt||typeof rt.buildAnswerPlan!=='function')return{ok:false,reason:'CANONICAL_SEMANTIC_RUNTIME_UNAVAILABLE',context:ctx};
    try{
      const minister=ministerSnapshot(ctx);
      const identity={countryCode:ctx.countryId,countryName:ctx.countryName,ministerId:ctx.ministerId,ministerName:ctx.ministerName,ministerRole:ctx.ministerRole,ministryId:ctx.ministryId,ministerState:minister};
      const history=(global.OmegaUniversalAIRuntime&&typeof global.OmegaUniversalAIRuntime.readHistory==='function')?global.OmegaUniversalAIRuntime.readHistory():[];
      const plan=rt.buildAnswerPlan(question,identity,ctx.gameState,history);
      return{ok:true,version:VERSION,authority:'OMEGA_PRODUCTION_SEMANTIC_RUNTIME',identity,context:ctx,ministerState:minister,semanticPlan:clone(plan),runtimeDiagnostics:typeof rt.diagnostics==='function'?rt.diagnostics():null,languageDiagnostics:{version:global.OmegaLanguageSystem?.VERSION||null,batch03:global.OmegaLanguageBatch03?.VERSION||null,gameLanguageBridge:!!global.OmegaGameLanguageBridge}};
    }catch(e){return{ok:false,reason:'CANONICAL_CONTEXT_BUILD_FAILED',error:text(e.message||e),context:ctx};}
  }
  function shouldBridge(url){try{const u=new URL(url,typeof location!=='undefined'?location.href:undefined);return u.pathname.endsWith('/api/ai/minister-consult')||u.pathname.endsWith('/api/ai/semantic-query')}catch(_){return false}}
  function installFetch(){
    if(global.__omegaCanonicalFetchBridgeInstalled||typeof global.fetch!=='function')return false;
    const nativeFetch=global.fetch.bind(global); global.__omegaCanonicalFetchBridgeInstalled=true;
    global.fetch=async function(input,init){
      let target='';try{target=typeof input==='string'?input:(input?.url||'')}catch(_){}
      if(!shouldBridge(target)||!init?.body)return nativeFetch(input,init);
      let body;try{body=JSON.parse(String(init.body))}catch(_){return nativeFetch(input,init)}
      if(!body?.prompt)return nativeFetch(input,init);
      const packet=build(body.prompt);
      if(!packet.ok)return nativeFetch(input,init);
      const enhanced={...body,canonicalAuthority:'OMEGA_PRODUCTION_SEMANTIC_RUNTIME',canonicalSemanticPlan:packet.semanticPlan,canonicalContextPacket:{...packet,semanticPlan:undefined}};
      const next={...init,headers:{'Content-Type':'application/json',...(init.headers||{})},body:JSON.stringify(enhanced)};
      return nativeFetch(input,next);
    };
    return true;
  }
  global.OmegaCanonicalAIContextBridge=Object.freeze({VERSION,context,build,installFetch});
  if(typeof document!=='undefined'){
    const boot=()=>{installFetch();global.dispatchEvent?.(new CustomEvent('OMEGA_CANONICAL_AI_CONTEXT_BRIDGE_READY',{detail:{version:VERSION}}));};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }
})(typeof globalThis!=='undefined'?globalThis:window);
