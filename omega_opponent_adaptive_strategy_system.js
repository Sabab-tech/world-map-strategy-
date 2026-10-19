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
  const num=v=>{if(v===null||v===undefined||(typeof v==='string'&&v.trim()===''))return null;const n=Number(v);return Number.isFinite(n)?n:null;};
  const clamp=(v,a=0,b=1)=>{const n=num(v);return n===null?null:Math.max(a,Math.min(b,n));};
  const state=()=>g.Game?.state||g.gameState||{};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{
    try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}
    try{
      const identity=g.OmegaCountryRuntimeData?.resolveCountry?.(v);
      if(identity?.iso3)return id(identity.iso3);
      if(identity?.countryCode)return id(identity.countryCode);
    }catch(_){}
    return id(v);
  };
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
    const cid=canonical(c),out={countryId:cid,availability:'UNOBSERVED',source:null,dimensions:{},actionPreferences:{},registeredStrategyOptions:[],priorityStack:[],profileNarrative:null};
    for(const dim of DIMENSIONS)out.dimensions[dim]={value:null,availability:'UNOBSERVED',source:null,confidence:0,evidence:[]};
    let canonicalRaw=null;
    try{
      const hit=registry()?.resolveCountry?.(cid);
      canonicalRaw=hit?.raw||hit||null;
    }catch(_){}
    const bases=[{source:'countryRecord',value:canonicalRaw},...SOURCES.map(src=>({source:src,value:read(cid,src)}))];
    let observedDimensions=0;
    for(const row of bases){
      const src=row.source,base=row.value;
      if(base===undefined||base===null)continue;
      out.source=out.source||src;
      for(const dim of DIMENSIONS){
        if(out.dimensions[dim].value!==null)continue;
        const raw=base?.[dim]??base?.[dim.replace(/[A-Z]/g,m=>'_'+m.toLowerCase())];
        const v=normalize(raw);
        if(v!==null){out.dimensions[dim]={value:v,availability:'EXPLICIT_COUNTRY_DOCTRINE',source:src,confidence:1,evidence:[],interpretation:'Explicitly registered doctrine or policy dimension; takes precedence over derived simulation policy.'};observedDimensions+=1;}
      }
    }
    // Fill only missing dimensions from the evidence-backed country behaviour engine.
    // Explicit doctrine/state policy above always wins over a derived heuristic.
    let derivedDimensionCount = 0;
    try {
      const behaviour = g.OmegaCountryBehaviorEngine?.getBehaviorProfile?.(cid) || null;
      if (behaviour) {
        out.behaviorSource = 'OMEGA_COUNTRY_BEHAVIOR_ENGINE_V1';
        out.behaviorStatus = behaviour.status || 'UNKNOWN';
        out.actionPreferences = clone(behaviour.actionPreferences || {});
        out.registeredStrategyOptions = clone(behaviour.registeredStrategyOptions || []);
        out.priorityStack = clone(behaviour.priorityStack || []);
        out.profileNarrative = clone(behaviour.profileNarrative || null);
        for (const dim of DIMENSIONS) {
          if (out.dimensions[dim].value !== null) continue;
          const row = behaviour.dimensions?.[dim];
          if (!row || row.value === null || row.value === undefined) continue;
          const v = normalize(row.value);
          if (v === null) continue;
          out.dimensions[dim] = {
            value:v,
            availability:row.availability || 'DERIVED_SIMULATION_POLICY',
            source:row.source || 'OMEGA_COUNTRY_BEHAVIOR_ENGINE_V1',
            confidence:clamp(row.confidence ?? 0.4),
            evidence:clone(row.evidence || []),
            interpretation:row.interpretation || null
          };
          observedDimensions += 1;
          derivedDimensionCount += 1;
        }
      }
    } catch (_) {}
    out.derivedDimensionCount = derivedDimensionCount;
    if(observedDimensions>0)out.availability='AVAILABLE';
    return out;
  }

  const ACTION_DIRECTIONS=Object.freeze({
    IMPORT:{tradeDependence:1,diplomaticPreference:1,selfSufficiencyPriority:-1,fiscalDiscipline:-0.7},
    EXPORT:{tradeDependence:1,diplomaticPreference:1,fiscalDiscipline:0.5},
    SUPPLIER_CHANGE:{tradeDependence:-1,selfSufficiencyPriority:1,diplomaticPreference:0.5},
    TREATY_NEGOTIATION:{diplomaticPreference:1,escalationTolerance:-0.4,strategicTimeHorizon:1},
    MILITARY_RECRUIT:{mobilizationTolerance:1,riskAppetite:0.7,domesticStabilityPriority:0.3},
    MILITARY_TRAIN:{mobilizationTolerance:1,strategicTimeHorizon:1,fiscalDiscipline:-0.4},
    MILITARY_EQUIP:{riskAppetite:1,fiscalDiscipline:-0.5,strategicTimeHorizon:0.8},
    MILITARY_FACILITY_BUILD:{riskAppetite:0.8,strategicTimeHorizon:1,escalationTolerance:0.6},
    SECURITY_PREPARATION:{riskAppetite:0.8,escalationTolerance:0.6,mobilizationTolerance:1},
    HOUSING_BUILD:{domesticStabilityPriority:1,fiscalDiscipline:-0.5,strategicTimeHorizon:0.6},
    INDUSTRY_BUILD:{selfSufficiencyPriority:1,innovationPreference:1,fiscalDiscipline:-0.5,strategicTimeHorizon:0.8},
    DOMESTIC_EXPANSION:{selfSufficiencyPriority:1,innovationPreference:0.8,fiscalDiscipline:-0.5},
    PROCESSING_EXPANSION:{selfSufficiencyPriority:1,tradeDependence:0.4,innovationPreference:1},
    INFRASTRUCTURE_EXPANSION:{strategicTimeHorizon:1,fiscalDiscipline:-0.4,domesticStabilityPriority:0.6},
    PROJECT_INVESTMENT:{fiscalDiscipline:-0.5,strategicTimeHorizon:1},
    EDUCATION_INVESTMENT:{innovationPreference:1,strategicTimeHorizon:1,domesticStabilityPriority:0.5},
    R_AND_D:{innovationPreference:1,strategicTimeHorizon:1,fiscalDiscipline:-0.3},
    MODERNIZATION:{innovationPreference:1,strategicTimeHorizon:1,riskAppetite:0.6},
    RESERVE_RELEASE:{selfSufficiencyPriority:-1,fiscalDiscipline:0.8},
    SUBSTITUTION:{selfSufficiencyPriority:1,innovationPreference:0.8},
    EFFICIENCY:{fiscalDiscipline:1,innovationPreference:0.8,strategicTimeHorizon:0.8},
    DIPLOMATIC_ADJUSTMENT:{diplomaticPreference:1,escalationTolerance:-0.4}
  });
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
    const actionKey=String(action||'').toUpperCase();
    const p=profile(c),dims=ACTION_DIMENSIONS[actionKey]||[];
    const vals=[],directions=ACTION_DIRECTIONS[actionKey]||{};
    const actionPreference=p.actionPreferences?.[actionKey]||null;
    const preferenceValue=actionPreference ? clamp(actionPreference.value) : null;
    for(const d of dims){
      const x=p.dimensions[d];
      if(x&&x.value!==null&&x.value!==undefined){
        const direction=num(directions[d])??1;
        const utility=direction>=0?x.value:1-x.value;
        vals.push({dimension:d,value:x.value,direction,utility,
          confidence:clamp(x.confidence??0.5),source:x.source||null});
      }
    }
    if(!vals.length&&preferenceValue===null)return{known:false,score:null,confidence:0,profile:p};
    const mean=vals.length?vals.reduce((s,x)=>s+x.utility,0)/vals.length:null;
    const preferenceWeight=preferenceValue===null?0:(mean===null?1:0.3);
    const combined=mean===null?preferenceValue:
      (preferenceValue===null?mean:(1-preferenceWeight)*mean+preferenceWeight*preferenceValue);
    const dimensionCoverage=vals.length?Math.min(1,vals.length/4):0;
    const dimensionQuality=vals.length?vals.reduce((sum,x)=>sum+(x.confidence??0.5),0)/vals.length:0;
    const dimensionConfidence=dimensionCoverage*dimensionQuality;
    const preferenceConfidence=preferenceValue===null?0:(clamp(actionPreference.confidence)??0.5);
    const confidence=preferenceValue===null?dimensionConfidence:
      (mean===null?preferenceConfidence:clamp(dimensionConfidence*0.72+preferenceConfidence*0.28));
    return{known:true,score:clamp(combined),confidence,dimensions:vals,
      actionPreference:actionPreference?clone(actionPreference):null,profile:p};
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
