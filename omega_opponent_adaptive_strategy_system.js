/* OMEGA OPPONENT ADAPTIVE STRATEGY SYSTEM v1.0.0
 * Reads only observed country strategy/doctrine data and converts it into
 * decision preferences. Missing doctrine is never fabricated.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0';
  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function')o[k]=clone(v[k],seen);
    return o;
  };
  const id=v=>String(v??'').trim().toUpperCase();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const clamp=(v,a=0,b=1)=>{const n=num(v);return n===null?null:Math.max(a,Math.min(b,n));};
  const state=()=>g.Game?.state||g.gameState||{};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  function country(c){const cid=canonical(c),s=state();return{cid,s};}
  function read(c,path){
    const {cid,s}=country(c),parts=String(path||'').split('.'),domain=parts.shift();
    let b=s?.[domain];
    if(b&&typeof b==='object')b=b[cid]??b[Object.keys(b||{}).find(k=>id(k)===cid)];
    for(const p of parts){if(b==null||!Object.prototype.hasOwnProperty.call(Object(b),p))return undefined;b=b[p];}
    return b;
  }
  const SOURCES=[
    'cabinet.strategyProfile','cabinet.nationalDoctrine','cabinet.policyProfile',
    'foreign.strategyProfile','foreign.doctrine','defense.doctrine','economy.policyProfile',
    'countryRecord.strategicProfile'
  ];
  const DIMENSIONS=['riskAppetite','diplomaticPreference','fiscalDiscipline','mobilizationTolerance',
    'strategicTimeHorizon','tradeDependence','selfSufficiencyPriority','innovationPreference',
    'domesticStabilityPriority','escalationTolerance'];

  function normalize(v){
    const n=num(v);if(n!==null)return clamp(n>1?n/100:n);
    if(typeof v!=='string')return null;
    const s=v.trim().toUpperCase();
    const map={VERY_LOW:.1,LOW:.25,MODERATE:.5,MEDIUM:.5,HIGH:.75,VERY_HIGH:.9,HAWKISH:.85,DOVISH:.2,
      AGGRESSIVE:.85,DEFENSIVE:.25,PRAGMATIC:.55,ISOLATIONIST:.2,INTERNATIONALIST:.8,
      DISCIPLINED:.8,LOOSE:.25,SHORT:.3,MEDIUM_TERM:.5,LONG:.8,RESILIENT:.7};
    return map[s]??null;
  }
  function profile(c){
    const cid=canonical(c),out={countryId:cid,availability:'UNOBSERVED',source:null,dimensions:{}};
    for(const dim of DIMENSIONS)out.dimensions[dim]={value:null,availability:'UNOBSERVED',source:null};
    let canonicalRaw=null;
    try{
      const hit=registry()?.resolveCountry?.(cid);
      canonicalRaw=hit?.raw||hit||null;
    }catch(_){}
    const bases=[{source:'countryRecord',value:canonicalRaw},...SOURCES.map(src=>({source:src,value:read(cid,src)}))];
    for(const row of bases){
      const src=row.source,base=row.value;
      if(base===undefined||base===null)continue;
      out.availability='AVAILABLE';out.source=src;
      for(const dim of DIMENSIONS){
        if(out.dimensions[dim].value!==null)continue;
        const raw=base?.[dim]??base?.[dim.replace(/[A-Z]/g,m=>'_'+m.toLowerCase())];
        const v=normalize(raw);
        if(v!==null)out.dimensions[dim]={value:v,availability:'AVAILABLE',source:src};
      }
    }
    return out;
  }
  const ACTION_DIMENSIONS=Object.freeze({
    IMPORT:['tradeDependence','diplomaticPreference','selfSufficiencyPriority','fiscalDiscipline'],
    EXPORT:['tradeDependence','diplomaticPreference','fiscalDiscipline'],
    SUPPLIER_CHANGE:['tradeDependence','selfSufficiencyPriority','diplomaticPreference'],
    TREATY_NEGOTIATION:['diplomaticPreference','escalationTolerance','strategicTimeHorizon'],
    MILITARY_RECRUIT:['mobilizationTolerance','riskAppetite','domesticStabilityPriority'],
    MILITARY_TRAIN:['mobilizationTolerance','strategicTimeHorizon','fiscalDiscipline'],
    MILITARY_EQUIP:['riskAppetite','fiscalDiscipline','strategicTimeHorizon'],
    MILITARY_FACILITY_BUILD:['riskAppetite','strategicTimeHorizon','escalationTolerance'],
    SECURITY_PREPARATION:['riskAppetite','escalationTolerance','mobilizationTolerance'],
    HOUSING_BUILD:['domesticStabilityPriority','fiscalDiscipline','strategicTimeHorizon'],
    INDUSTRY_BUILD:['selfSufficiencyPriority','innovationPreference','fiscalDiscipline','strategicTimeHorizon'],
    DOMESTIC_EXPANSION:['selfSufficiencyPriority','innovationPreference','fiscalDiscipline'],
    PROCESSING_EXPANSION:['selfSufficiencyPriority','tradeDependence','innovationPreference'],
    INFRASTRUCTURE_EXPANSION:['strategicTimeHorizon','fiscalDiscipline','domesticStabilityPriority'],
    PROJECT_INVESTMENT:['fiscalDiscipline','strategicTimeHorizon'],
    EDUCATION_INVESTMENT:['innovationPreference','strategicTimeHorizon','domesticStabilityPriority'],
    R_AND_D:['innovationPreference','strategicTimeHorizon','fiscalDiscipline'],
    MODERNIZATION:['innovationPreference','strategicTimeHorizon','riskAppetite'],
    RESERVE_RELEASE:['selfSufficiencyPriority','fiscalDiscipline'],
    SUBSTITUTION:['selfSufficiencyPriority','innovationPreference'],
    EFFICIENCY:['fiscalDiscipline','innovationPreference','strategicTimeHorizon'],
    DIPLOMATIC_ADJUSTMENT:['diplomaticPreference','escalationTolerance']
  });
  function scoreAction(c,action){
    const p=profile(c),dims=ACTION_DIMENSIONS[String(action||'').toUpperCase()]||[];
    const vals=[];
    for(const d of dims){const x=p.dimensions[d];if(x?.value!==null)vals.push({dimension:d,value:x.value});}
    if(!vals.length)return{known:false,score:null,confidence:0,profile:p};
    const mean=vals.reduce((s,x)=>s+x.value,0)/vals.length;
    return{known:true,score:clamp(mean),confidence:clamp(Math.min(1,vals.length/4)),dimensions:vals,profile:p};
  }
  function strategicPlan(c,decision){
    const actions=Array.isArray(decision?.candidateActions)?decision.candidateActions:[decision?.selectedAction].filter(Boolean);
    return actions.map(action=>({action,score:scoreAction(c,action)}));
  }
  function diagnostics(){
    const ids=registry()?.list?.('COUNTRY')||registry()?.list?.()||[];
    let observed=0;for(const c of ids)if(profile(canonical(c)).availability==='AVAILABLE')observed++;
    return{version:VERSION,countryCount:ids.length,observedStrategyProfiles:observed,dimensionCount:DIMENSIONS.length};
  }
  const API=Object.freeze({VERSION,DIMENSIONS,ACTION_DIMENSIONS,profile,scoreAction,strategicPlan,diagnostics});
  g.Omega=g.Omega||{};g.Omega.OpponentAdaptiveStrategy=API;g.OmegaOpponentAdaptiveStrategy=API;
})(typeof window!=='undefined'?window:globalThis);
