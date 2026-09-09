/* OMEGA CANONICAL AI CONTEXT BRIDGE v1.1.0
 * Browser-side transport bridge. It owns transport only. Facts, language, identity,
 * ontology and cognition remain owned by their canonical subsystems.
 *
 * Contract: the exact request input used by the UI is captured once, the live
 * minister/world context is snapshotted once, and one canonical semantic plan
 * is attached to the API request. The server must consume that plan rather
 * than silently reparsing the question in a second semantic brain.
 */
(function(global){
  'use strict';
  if(global.OmegaCanonicalAIContextBridge?.VERSION === '1.1.0')return;

  const VERSION='1.1.0';
  const text=v=>String(v==null?'':v).trim();
  const clone=v=>{try{return v===undefined?undefined:JSON.parse(JSON.stringify(v))}catch(_){return null}};
  const base=p=>{try{return typeof document!=='undefined'&&document.baseURI?new URL(p,document.baseURI).href:p}catch(_){return p}};
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

  function build(question, request={}){
    const rt=global.OmegaProductionSemanticRuntime;
    const ctx=context(request);
    if(!rt||typeof rt.buildAnswerPlan!=='function')return{ok:false,reason:'CANONICAL_SEMANTIC_RUNTIME_UNAVAILABLE',context:ctx};
    try{
      const minister=ministerSnapshot(ctx);
      const identity={
        countryCode:ctx.countryId,
        countryName:ctx.countryName,
        ministerId:ctx.ministerId,
        ministerName:ctx.ministerName,
        ministerRole:ctx.ministerRole,
        ministryId:ctx.ministryId,
        ministerState:minister
      };
      const history=Array.isArray(request.history)?request.history.slice(-24):lastHistory();
      const state=clone(ctx.gameState)||{};
      if(ctx.reservesData!=null)state.reservesData=clone(ctx.reservesData);
      if(ctx.timeHorizon!=null)state.timeHorizon=ctx.timeHorizon;
      const plan=rt.buildAnswerPlan(question,identity,state,history);
      if(!plan||typeof plan!=='object')return{ok:false,reason:'CANONICAL_SEMANTIC_RUNTIME_RETURNED_INVALID_PLAN',context:ctx};
      return {
        ok:true,
        version:VERSION,
        authority:'OMEGA_PRODUCTION_SEMANTIC_RUNTIME',
        identity,
        context:ctx,
        ministerState:minister,
        semanticPlan:clone(plan),
        runtimeDiagnostics:typeof rt.diagnostics==='function'?clone(rt.diagnostics()):null,
        languageDiagnostics:{
          version:global.OmegaLanguageSystem?.VERSION||null,
          batch03:global.OmegaLanguageBatch03?.VERSION||null,
          gameLanguageBridge:!!global.OmegaGameLanguageBridge
        }
      };
    }catch(e){return{ok:false,reason:'CANONICAL_CONTEXT_BUILD_FAILED',error:text(e.message||e),context:ctx};}
  }

  function shouldBridge(url){
    try{
      const u=new URL(url,typeof location!=='undefined'?location.href:undefined);
      return u.pathname.endsWith('/api/ai/minister-consult')||u.pathname.endsWith('/api/ai/semantic-query');
    }catch(_){return false}
  }

  function mergeRequestBody(body,packet){
    const history=Array.isArray(body.conversationHistory)?body.conversationHistory.slice(-24):undefined;
    return {
      ...body,
      canonicalAuthority:'OMEGA_PRODUCTION_SEMANTIC_RUNTIME',
      canonicalSemanticPlan:packet.semanticPlan,
      canonicalContextPacket:{
        version:packet.version,
        authority:packet.authority,
        identity:packet.identity,
        context:packet.context,
        ministerState:packet.ministerState,
        runtimeDiagnostics:packet.runtimeDiagnostics,
        languageDiagnostics:packet.languageDiagnostics,
        history
      }
    };
  }

  function installFetch(){
    if(global.__omegaCanonicalFetchBridgeInstalled||typeof global.fetch!=='function')return false;
    const nativeFetch=global.fetch.bind(global);
    global.__omegaCanonicalFetchBridgeInstalled=true;
    global.fetch=async function(input,init={}){
      let target='';try{target=typeof input==='string'?input:(input?.url||'')}catch(_){}
      if(!shouldBridge(target)||!init?.body)return nativeFetch(input,init);
      let body;
      try{body=JSON.parse(String(init.body))}catch(_){return nativeFetch(input,init)}
      if(!body?.prompt||typeof body.prompt!=='string')return nativeFetch(input,init);
      const packet=build(body.prompt,body);
      if(!packet.ok) {
        try{console.warn('[OMEGA Canonical Context Bridge] request passed without semantic plan:',packet.reason)}catch(_){ }
        return nativeFetch(input,init);
      }
      const next={
        ...init,
        headers:{'Content-Type':'application/json',...(init.headers||{})},
        body:JSON.stringify(mergeRequestBody(body,packet))
      };
      return nativeFetch(input,next);
    };
    return true;
  }

  global.OmegaCanonicalAIContextBridge=Object.freeze({VERSION,context,build,installFetch});
  if(typeof document!=='undefined'){
    const boot=()=>{
      installFetch();
      global.dispatchEvent?.(new CustomEvent('OMEGA_CANONICAL_AI_CONTEXT_BRIDGE_READY',{detail:{version:VERSION}}));
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }
})(typeof globalThis!=='undefined'?globalThis:window);
