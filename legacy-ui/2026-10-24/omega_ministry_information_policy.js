/*
 * OMEGA MINISTRY INFORMATION POLICY v1.0.0
 *
 * Centralized visibility policy. It classifies published facts without
 * becoming a second source of truth for their values.
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';
  const VISIBILITY=Object.freeze({
    PUBLIC:'PUBLIC',
    GOVERNMENT_INTERNAL:'GOVERNMENT_INTERNAL',
    RESTRICTED:'RESTRICTED',
    CLASSIFIED:'CLASSIFIED'
  });

  const LEVELS=Object.freeze({
    PUBLIC:0,
    GOVERNMENT_INTERNAL:1,
    RESTRICTED:2,
    CLASSIFIED:3
  });

  function text(v){return String(v??'').trim().toLowerCase();}

  const DEFAULT_RULES=Object.freeze([
    {source:'intelligence',pattern:/\.sources(?:\.|$)/i,visibility:VISIBILITY.CLASSIFIED},
    {source:'intelligence',pattern:/\.cyber(?:\.sources|\.operations|\.agents)?/i,visibility:VISIBILITY.RESTRICTED},
    {source:'foreign',pattern:/\.negotiations(?:\.details|\.sources|\.backchannel)?/i,visibility:VISIBILITY.RESTRICTED},
    {source:'foreign',pattern:/\.agent|\.covert|\.classified/i,visibility:VISIBILITY.CLASSIFIED},
    {source:'defense',pattern:/\.classified|\.intelligenceSource|\.covert/i,visibility:VISIBILITY.CLASSIFIED}
  ]);

  class InformationPolicy{
    constructor(){
      this.version=VERSION;
      this.rules=DEFAULT_RULES.slice();
    }

    registerRule(rule){
      if(!rule||!rule.source)throw new Error('INVALID_VISIBILITY_RULE');
      this.rules.push({
        source:String(rule.source),
        pattern:rule.pattern instanceof RegExp?rule.pattern:new RegExp(String(rule.pattern||'.'),'i'),
        visibility:String(rule.visibility||VISIBILITY.GOVERNMENT_INTERNAL)
      });
      return this.rules[this.rules.length-1];
    }

    classify(sourceMinistry,fieldPath,explicitVisibility=null){
      if(explicitVisibility && LEVELS[String(explicitVisibility)]!==undefined)return String(explicitVisibility);
      const source=String(sourceMinistry||'');
      const path=String(fieldPath||'');
      for(const rule of this.rules){
        if(rule.source===source && rule.pattern.test(path))return rule.visibility;
      }
      return source==='statistics' ? VISIBILITY.GOVERNMENT_INTERNAL : VISIBILITY.GOVERNMENT_INTERNAL;
    }

    canRead(viewer,source,visibility){
      const v=text(viewer);
      const s=text(source);
      const level=LEVELS[String(visibility)] ?? LEVELS.GOVERNMENT_INTERNAL;
      if(level===LEVELS.PUBLIC)return true;
      if(level===LEVELS.GOVERNMENT_INTERNAL)return !!v;
      if(level===LEVELS.RESTRICTED){
        return v===s || v==='cabinet' || (s==='intelligence' && v==='defense');
      }
      if(level===LEVELS.CLASSIFIED){
        return v===s || v==='cabinet' || (s==='intelligence' && v==='defense' && v!=='trade');
      }
      return false;
    }

    filterFacts(viewer,source,facts){
      const out={};
      for(const [key,fact] of Object.entries(facts||{})){
        if(this.canRead(viewer,source,fact?.visibility))out[key]=fact;
      }
      return out;
    }

    diagnostics(){
      return {
        version:VERSION,
        ruleCount:this.rules.length,
        visibilityClasses:Object.keys(VISIBILITY)
      };
    }
  }

  const instance=new InformationPolicy();
  const api=Object.freeze({
    VERSION,
    Visibility:VISIBILITY,
    Levels:LEVELS,
    instance,
    create:()=>new InformationPolicy()
  });

  global.Omega=global.Omega||{};
  global.Omega.MinistryInformationPolicy=api;
  global.OmegaMinistryInformationPolicy=api;
})(typeof window!=='undefined'?window:globalThis);
