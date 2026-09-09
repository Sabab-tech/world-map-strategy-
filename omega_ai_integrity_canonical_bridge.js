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

    integrity.parse=function(question,context={}){
      return rt.parse(question,context);
    };
    integrity.__canonicalSemanticBridgeV110=true;
    integrity.CANONICAL_SEMANTIC_VERSION=rt.VERSION||null;
    integrity.SEMANTIC_AUTHORITY='OmegaProductionSemanticRuntime';

    if(typeof integrity.detectIntent==='function'){
      integrity.detectIntent=function(question,context={}){
        const p=rt.parse(question,context);
        return {intent:p?.targetDomain||p?.operation||'GENERAL',confidence:Number(p?.confidence||0)};
      };
    }
    return true;
  }

  global.OmegaAIIntegrityCanonicalBridge=Object.freeze({VERSION,install});
  const boot=setInterval(()=>{if(install())clearInterval(boot)},50);
  setTimeout(()=>clearInterval(boot),15000);
})(typeof globalThis!=='undefined'?globalThis:window);
