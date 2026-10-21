/* OMEGA AI INTEGRITY -> CANONICAL SEMANTIC BRIDGE v1.1.0
 * Integrity is a guard/validation layer only. Semantic identity and intent
 * resolution belong to OmegaProductionSemanticRuntime. This bridge never
 * falls back to an independent parser, because that would create a second
 * semantic authority inside the same request.
 */
(function(global){
  'use strict';
  if(global.OmegaAIIntegrityCanonicalBridge?.VERSION === '1.1.0')return;

  const VERSION='1.1.0';
  function install(){
    const rt=global.OmegaProductionSemanticRuntime;
    const integrity=global.OmegaAIIntegrity;
    if(!rt||!integrity||typeof rt.parse!=='function')return false;
    if(integrity.__canonicalSemanticBridgeV110)return true;

    // The integrity layer intentionally freezes its public API. Extend it copy-on-write
    // instead of mutating that frozen object, which throws in strict-mode WebViews.
    const canonical=Object.assign({},integrity);
    canonical.parse=function(question,context={}){
      return rt.parse(question,context);
    };
    canonical.__canonicalSemanticBridgeV110=true;
    canonical.CANONICAL_SEMANTIC_VERSION=rt.VERSION||null;
    canonical.SEMANTIC_AUTHORITY='OmegaProductionSemanticRuntime';

    if(typeof canonical.detectIntent==='function'){
      canonical.detectIntent=function(question,context={}){
        const p=rt.parse(question,context);
        return {intent:p?.targetDomain||p?.operation||'GENERAL',confidence:Number(p?.confidence||0)};
      };
    }
    const bridged=Object.freeze(canonical);
    global.OmegaAIIntegrity=bridged;
    const metadata=global.__OMEGA_AI_INTEGRITY__;
    if(metadata&&typeof metadata==='object'){
      global.__OMEGA_AI_INTEGRITY__=Object.assign({},metadata,{api:bridged,canonicalSemanticVersion:rt.VERSION||null,semanticAuthority:'OmegaProductionSemanticRuntime'});
    }
    return true;
  }

  global.OmegaAIIntegrityCanonicalBridge=Object.freeze({VERSION,install});
  const boot=setInterval(()=>{if(install())clearInterval(boot)},50);
  setTimeout(()=>clearInterval(boot),15000);
})(typeof globalThis!=='undefined'?globalThis:window);
