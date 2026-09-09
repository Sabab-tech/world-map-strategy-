/* OMEGA AI INTEGRITY -> CANONICAL SEMANTIC BRIDGE v1.0.0
 * Integrity remains a guard/validation layer. Semantic identity and intent
 * resolution are delegated to the canonical production semantic runtime.
 */
(function(global){
  'use strict';
  if(global.OmegaAIIntegrityCanonicalBridge)return;
  const VERSION='1.0.0';
  function install(){
    const rt=global.OmegaProductionSemanticRuntime, integrity=global.OmegaAIIntegrity;
    if(!rt||!integrity||typeof rt.parse!=='function')return false;
    if(integrity.__canonicalSemanticBridgeV1)return true;
    const previous=integrity.parse;
    integrity.parse=function(question,context={}){try{return rt.parse(question,context)}catch(e){return typeof previous==='function'?previous.call(this,question,context):null}};
    integrity.__canonicalSemanticBridgeV1=true;
    integrity.CANONICAL_SEMANTIC_VERSION=rt.VERSION||null;
    integrity.SEMANTIC_AUTHORITY='OmegaProductionSemanticRuntime';
    if(typeof integrity.detectIntent==='function'){
      const old=integrity.detectIntent;
      integrity.detectIntent=function(question){try{const p=rt.parse(question,{});return {intent:p.targetDomain||p.operation||'GENERAL',confidence:Number(p.confidence||0)}}catch(e){return old.call(this,question)}};
    }
    return true;
  }
  global.OmegaAIIntegrityCanonicalBridge=Object.freeze({VERSION,install});
  const boot=setInterval(()=>{if(install())clearInterval(boot)},50);setTimeout(()=>clearInterval(boot),15000);
})(typeof globalThis!=='undefined'?globalThis:window);
