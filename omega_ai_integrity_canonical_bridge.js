/* OMEGA AI INTEGRITY -> CANONICAL SEMANTIC BRIDGE v1.1.0
 * Integrity is a guard/validation layer only. Semantic identity and intent
 * resolution belong to OmegaProductionSemanticRuntime. This bridge never
 * falls back to an independent parser, because that would create a second
 * semantic authority inside the same request.
 */
(function(global){
  'use strict';
  if(global.OmegaAIIntegrityCanonicalBridge?.VERSION === '1.1.0')return;

  const VERSION='1.1.1';
  let semanticApi=null;
  function install(){
    const rt=global.OmegaProductionSemanticRuntime;
    const integrity=global.OmegaAIIntegrity;
    if(!rt||!integrity||typeof rt.parse!=='function')return false;
    semanticApi=Object.freeze({
      VERSION,
      semanticVersion:rt.VERSION||null,
      SEMANTIC_AUTHORITY:'OmegaProductionSemanticRuntime',
      parse(question,context={}){return rt.parse(question,context);},
      detectIntent(question,context={}){
        const p=rt.parse(question,context);
        return {intent:p?.targetDomain||p?.operation||'GENERAL',confidence:Number(p?.confidence||0)};
      }
    });
    global.OmegaAIIntegritySemanticBridge=semanticApi;
    return true;
  }

  // OmegaAIIntegrity is intentionally frozen. Expose a dedicated semantic facade
  // instead of mutating that validation API during page startup.
  global.OmegaAIIntegrityCanonicalBridge=Object.freeze({VERSION,install,getApi(){return semanticApi;}});
  const boot=setInterval(()=>{if(install())clearInterval(boot)},50);
  setTimeout(()=>clearInterval(boot),15000);
})(typeof globalThis!=='undefined'?globalThis:window);
