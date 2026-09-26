/* ============================================================================
 * OMEGA RESOURCE PART 05 - RESERVE / RECOVERABILITY / EXTRACTION RUNTIME v2
 *
 * Rules:
 *   1. Geological quantity and recoverable quantity are different fields.
 *   2. A missing production rate may use an explicit SIMULATION_RULESET baseline,
 *      but can never be presented as observed production data.
 *   3. Dynamic utilization is derived from explicit constraints/rules, not a
 *      permanent 100% effort assumption.
 *   4. Quantity parsing is delegated to ResourceScienceRuntime.
 * ========================================================================== */
(function(g){
  'use strict';

  const VERSION='2.0.0';
  const SCI=()=>g.Omega?.ResourceScienceRuntime||g.OmegaResourceScienceRuntime||null;

  function clone(v,seen){
    if(v===null||typeof v!=='object')return v;
    seen=seen||new WeakMap();if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);for(const k of Object.keys(v)){if(k==='__proto__'||k==='constructor'||typeof v[k]==='function'||v[k]===undefined)continue;o[k]=clone(v[k],seen);}return o;
  }
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const id=v=>String(v??'').trim().toUpperCase();
  function canonicalCountry(v){
    const raw=String(v??'').trim();if(!raw)return null;
    try{const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
      const hit=b?.resolveCountry?.(raw);if(hit?.id)return id(hit.id);if(hit?.canonicalId)return id(hit.canonicalId);
    }catch(_){}
    return id(raw);
  }
  function rules(){
    const r=g.__OmegaResourceEconomyRules;
    return r&&typeof r==='object'?r:{};
  }
  function resourceRule(resourceId){
    const rid=SCI()?.normalizeResourceId?.(resourceId)||String(resourceId||'').toLowerCase();
    const extraction=rules().extraction||{},rates=extraction.baselineDailyRates||{};
    return{
      recoveryFactor:num(extraction.recoveryFactors?.[rid])??0.75,
      baselineRate:num(rates[rid]),
      baselineRateUnit:extraction.baselineRateUnits?.[rid]||(
        rid==='crude_oil'?'BARRELS_PER_DAY':rid==='natural_gas'?'BCM_PER_YEAR':rid==='gold'?'TROY_OZ_PER_DAY':'TONNES_PER_DAY'
      ),
      defaultEffort:num(extraction.defaultEffortUtilization)??0.82,
      constraintFactors:clone(extraction.constraintFactors||{})
    };
  }

  function normalizeRateToDaily(value,unit,resourceId){
    const n0=num(value);if(n0===null)return null;
    const u=String(unit||'').toUpperCase();
    if(u==='BCM_PER_YEAR'||u==='TCF_PER_YEAR'||u==='TCF/YEAR')return n0/365;
    return n0;
  }

  function parseExplicitRate(raw,resourceId){
    const s=SCI();
    const candidates=[
      raw?.productionRate,raw?.dailyRate,raw?.outputRate,
      raw?.production?.rate,raw?.production?.dailyRate,
      raw?.capacity?.dailyRate,raw?.capacity?.productionRate
    ];
    for(const value of candidates){
      if(value===undefined||value===null||value==='')continue;
      if(typeof value==='number'&&Number.isFinite(value))return{
        dailyRate:normalizeRateToDaily(value,null,resourceId),rawValue:value,
        sourceField:'numeric_production_rate',authority:'RESOURCE_JSON'
      };
      const parsed=s?.parseRate?.(value,resourceId);
      if(parsed?.value!==null&&parsed?.value!==undefined)return{
        dailyRate:normalizeRateToDaily(parsed.value,parsed.unit,resourceId),rawValue:value,
        sourceField:'production_rate',sourceUnit:parsed.unit,authority:'RESOURCE_JSON'
      };
    }
    return null;
  }

  class ReserveState{
    constructor(input={}){
      Object.assign(this,clone(input));
      this.occurrenceKey=String(this.occurrenceKey||'');
      this.stateVersion=num(this.stateVersion)||1;
      this.geologicalQuantity=num(this.geologicalQuantity);
      this.recoverableQuantity=num(this.recoverableQuantity);
      this.residualQuantity=num(this.residualQuantity);
      this.recoverabilityFactor=num(this.recoverabilityFactor);
      this.quantityAuthority=this.quantityAuthority||'UNOBSERVED';
      this.recoverabilityAuthority=this.recoverabilityAuthority||'UNOBSERVED';
    }
    toJSON(){return clone(this);}
  }

  class Capacity{
    constructor(input={}){
      Object.assign(this,clone(input));
      this.nominalRate=Math.max(0,num(this.nominalRate)||0);
      this.effortUtilization=Math.max(0,Math.min(1,num(this.effortUtilization)??1));
      this.constraintFactors=clone(this.constraintFactors||{});
      const vals=Object.values(this.constraintFactors).map(Number).filter(Number.isFinite);
      this.constraintUtilization=vals.length?Math.max(0,Math.min(1,...vals)):1;
      this.effectiveUtilization=Math.max(0,Math.min(1,
        num(this.effectiveUtilization)??Math.min(this.effortUtilization,this.constraintUtilization)
      ));
      this.effectiveDailyRate=this.nominalRate*this.effectiveUtilization;
    }
    computeWindowCapacity(hours){
      const h=num(hours);const factor=h===null?1:Math.max(0,h/24);
      return{windowCapacity:this.effectiveDailyRate*factor,effectiveDailyRate:this.effectiveDailyRate,effectiveUtilization:this.effectiveUtilization};
    }
    toJSON(){return clone(this);}
  }

  function resolveReserve(raw,resourceId,type){
    const s=SCI();
    if(s?.parsePrimaryReserve)return s.parsePrimaryReserve(raw?.reserves||raw?.reserve||raw?.quantity,resourceId,type?.unit||null);
    return{quantity:null,targetUnit:type?.unit||null,components:[]};
  }

  function recoverableFrom(raw,declared,resourceId){
    const explicit=raw?.recoverableQuantity;
    if(num(explicit)!==null)return{
      quantity:Math.max(0,num(explicit)),factor:declared>0?Math.max(0,Math.min(1,num(explicit)/declared)):null,
      authority:'RESOURCE_JSON',basis:'EXPLICIT_RECOVERABLE_QUANTITY'
    };
    const factor=num(raw?.recoverabilityFactor??raw?.recoveryFactor??raw?.recoverableFraction);
    if(factor!==null&&factor>=0&&factor<=1)return{
      quantity:declared*factor,factor,authority:'RESOURCE_JSON',basis:'EXPLICIT_RECOVERABILITY_FACTOR'
    };
    const rr=resourceRule(resourceId),rf=Math.max(0,Math.min(1,rr.recoveryFactor));
    return{
      quantity:declared*rf,factor:rf,authority:'SIMULATION_RULESET',basis:'DEFAULT_RESOURCE_RECOVERABILITY_MODEL'
    };
  }

  function compileReserves(identityRegistry,_unused,knowledge){
    if(!identityRegistry?.listOccurrences)return{status:'FAILED',reason:'RESOURCE_IDENTITY_REGISTRY_REQUIRED'};
    const types=Array.isArray(knowledge?.sovereignEntities?.resourceTypes)?knowledge.sovereignEntities.resourceTypes:[];
    const byType=new Map(types.map(x=>[String(x?.id||'').replace(/^RES_TYPE:/i,'').toLowerCase(),x]));
    const reserves=new Map(),capacities=new Map(),lifecycles=new Map(),accessibility=new Map();
    const occurrences=identityRegistry.listOccurrences();

    occurrences.forEach(occ=>{
      const raw=occ.rawDeposit||{},rid=SCI()?.normalizeResourceId?.(occ.resourceTypeId)||String(occ.resourceTypeId||'').toLowerCase();
      const type=byType.get(rid)||{};
      const parsed=resolveReserve(raw,rid,type),declared=num(parsed.quantity);
      if(declared===null||declared<=0)return;

      const recovery=recoverableFrom(raw,declared,rid);
      const explicitRate=parseExplicitRate(raw,rid),rr=resourceRule(rid);
      const nominalDaily=explicitRate?.dailyRate!==null&&explicitRate?.dailyRate!==undefined
        ?explicitRate.dailyRate:rr.baselineRate;
      const hasRate=Number.isFinite(nominalDaily)&&nominalDaily>0;
      const authority=explicitRate?'RESOURCE_JSON':'SIMULATION_RULESET';
      const reserveUnit=parsed.targetUnit||type.unit||SCI()?.RESOURCE_DEFAULT_UNITS?.[rid]||null;

      const rawStatus=String(raw.status||occ.status||'UNKNOWN').toUpperCase();
      const active=/ACTIVE|PRODUCING|OPERATING|RUNNING/.test(rawStatus)&&!/SUSPEND|BLOCK|CLOSED|ABANDON/.test(rawStatus);
      const reserve=new ReserveState({
        occurrenceKey:occ.occurrenceKey,countryId:canonicalCountry(occ.countryId),depositKey:occ.depositKey,
        resourceId:rid,geologicalQuantity:declared,recoverableQuantity:recovery.quantity,
        residualQuantity:recovery.quantity,unit:reserveUnit,
        recoverabilityFactor:recovery.factor,
        recoverabilityBasis:recovery.basis,
        quantityAuthority:'RESOURCE_JSON',
        recoverabilityAuthority:recovery.authority,
        operationalStatus:active&&hasRate?'ACTIVE_EXTRACTION':active?'BLOCKED':'BLOCKED',
        stateVersion:1,
        provenance:{
          sourceAuthority:'RESOURCE_JSON',
          sourceDatasetId:raw.sourceDatasetId||'resources.json',
          reserveField:'runtime_deposits.reserves',
          reserveText:String(raw.reserves||raw.reserve||''),
          recoverabilityAuthority:recovery.authority,
          recoverabilityBasis:recovery.basis,
          capacityAuthority:authority,
          capacitySource:explicitRate?.sourceField||'SIMULATION_RULESET',
          rateUnit:explicitRate?.sourceUnit||rr.baselineRateUnit||null,
          modelVersion:VERSION
        }
      });

      const capModel=(SCI()?.capacityModel?.({
        nominalRate:nominalDaily,
        effortUtilization:rr.defaultEffort,
        constraintFactors:rr.constraintFactors,
        authority,
      })||{nominalRate:nominalDaily,effortUtilization:rr.defaultEffort,effectiveUtilization:rr.defaultEffort,effectiveRate:nominalDaily*rr.defaultEffort,constraintFactors:rr.constraintFactors});
      const cap=new Capacity({
        occurrenceKey:occ.occurrenceKey,countryId:canonicalCountry(occ.countryId),resourceId:rid,
        unit:reserveUnit,nominalRate:capModel.nominalRate,dailyRate:capModel.effectiveRate,
        rawNominalRate:capModel.nominalRate,rateUnit:rr.baselineRateUnit,
        effortUtilization:capModel.effortUtilization,constraintFactors:capModel.constraintFactors,
        effectiveUtilization:capModel.effectiveUtilization,effectiveDailyRate:capModel.effectiveRate,
        assetReference:'MINE:'+occ.occurrenceKey,authority,
        rateSource:explicitRate?'RESOURCE_JSON':'SIMULATION_RULESET',
        simulationBaseline:!explicitRate,
        modelVersion:VERSION
      });

      reserves.set(occ.occurrenceKey,reserve);capacities.set(occ.occurrenceKey,cap);
      lifecycles.set(occ.occurrenceKey,{
        occurrenceKey:occ.occurrenceKey,countryId:canonicalCountry(occ.countryId),
        status:reserve.operationalStatus,mode:explicitRate?'OBSERVED_CAPACITY':'SIMULATION_CAPACITY_BASELINE',
        sourceAuthority:'RESOURCE_JSON'
      });
      accessibility.set(occ.occurrenceKey,{
        state:'AVAILABLE',sourceAuthority:'RESOURCE_JSON',
        executionAuthority:authority,
        quantitativeDataStatus:explicitRate?'OBSERVED':'RATE_UNOBSERVED_SIMULATION_BASELINE'
      });
    });

    const registry={
      VERSION,reserveStates:reserves,capacities,lifecycles,accessibilityStates:accessibility,
      getReserveState:key=>reserves.get(String(key||''))||null,
      registerReserveState:value=>{if(value?.occurrenceKey)reserves.set(String(value.occurrenceKey),value);return value;},
      getCapacityForOccurrence:key=>capacities.get(String(key||''))||null,
      getRecoverabilityModelForResource:resourceId=>{
        const rr=resourceRule(resourceId);
        return{resourceId:SCI()?.normalizeResourceId?.(resourceId)||resourceId,defaultRecoveryFactor:rr.recoveryFactor,authority:'SIMULATION_RULESET'};
      },
      listReserveStates:()=>[...reserves.values()].map(x=>clone(x.toJSON?.()||x))
    };
    return{status:'READY',registry,occurrenceCount:occurrences.length,reserveCount:reserves.size,capacityCount:capacities.size};
  }

  const API=Object.freeze({
    VERSION,ReserveState,Capacity,
    ExtractionRequest:class ExtractionRequest{constructor(input={}){Object.assign(this,clone(input));}},
    TemporalWindowUnit:{PER_DAY:'PER_DAY'},
    ExtractionMethodEnum:{UNKNOWN:'UNKNOWN'},
    ExtractionResultStatus:{APPROVED:'APPROVED',PARTIALLY_APPROVED:'PARTIALLY_APPROVED'},
    OverdrawPolicyEnum:{CAP:'CAP'},
    compileReserves,
    parseReserve:function(raw,resourceId,targetUnit){return SCI()?.parsePrimaryReserve?.(raw,resourceId,targetUnit)||{quantity:null,targetUnit};},
    parseReserveComponents:function(raw,resourceId,targetUnit){return SCI()?.parseReserveComponents?.(raw,resourceId,targetUnit)||[];},
    parseQuality:function(raw,resourceId){return SCI()?.parseQuality?.(raw,resourceId)||{purity:null,purityStatus:'UNOBSERVED'};},
    executeExtraction:function(request,reserve,options={}){
      if(!reserve||!options?.capacity)return{status:'BLOCKED',diagnostics:[{message:'EXTRACTION_RESERVE_OR_CAPACITY_REQUIRED'}]};
      const requested=Math.max(0,num(request?.requestedQuantity)||0);
      const hours=Math.max(0,num(request?.timeWindowDurationHours??24)||24);
      const window=options.capacity.computeWindowCapacity(hours),capacityQty=Math.max(0,num(window?.windowCapacity)||0);
      const residual=Math.max(0,num(reserve.residualQuantity)||0),q=Math.min(requested,residual,capacityQty);
      if(q<=0)return{status:'BLOCKED',diagnostics:[{message:'EXTRACTION_QUANTITY_ZERO_OR_CAPACITY_UNAVAILABLE'}]};
      const before=new ReserveState(reserve.toJSON?.()||reserve);
      const after=new ReserveState({...before,residualQuantity:Math.max(0,residual-q),stateVersion:(num(before.stateVersion)||1)+1,
        operationalStatus:Math.max(0,residual-q)<=0?'EXHAUSTED':'DEPLETING'});
      const authority=options.capacity.authority||'UNOBSERVED';
      const producedBatch={
        batchId:'P5:'+String(before.occurrenceKey).replace(/[^A-Z0-9:_-]/gi,'')+':T'+String(request?.simulationTick||0),
        unit:before.unit||options.capacity.unit||null,purity:null,grade:null,qualityState:{purity:null,purityStatus:'UNOBSERVED'}
      };
      return{
        status:q<requested?'PARTIALLY_APPROVED':'APPROVED',approvedQuantity:q,
        reserveBefore:before,reserveAfter:after,producedBatch,
        calculationTrace:{
          requestedQuantity:requested,approvedQuantity:q,capacity:clone(options.capacity),
          capacityWindow:clone(window),reserveBefore:residual,reserveAfter:after.residualQuantity,
          capacityAuthority:authority,effectiveUtilization:options.capacity.effectiveUtilization??null
        },
        transition:{from:before.operationalStatus,to:after.operationalStatus},
        provenance:{
          sourceAuthority:'RESOURCE_JSON',capacityAuthority:authority,
          recoverabilityAuthority:before.recoverabilityAuthority||'UNOBSERVED',
          recoverabilityBasis:before.recoverabilityBasis||'UNOBSERVED',
          rateSource:options.capacity.rateSource||'UNOBSERVED',modelVersion:VERSION
        }
      };
    }
  });

  g.GSRSK_Part05=API;
  g.GSRSK_ResourceReserveExtractionEngine=API;
  g.Omega=g.Omega||{};
  g.Omega.ResourcePart05ReserveExtractionRuntime=API;
  g.OmegaResourcePart05ReserveExtractionRuntime=API;
})(typeof window!=='undefined'?window:globalThis);
