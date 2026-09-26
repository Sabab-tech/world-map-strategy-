/* ============================================================================
 * OMEGA RESOURCE PART 05 - RESERVE + EXTRACTION CAPACITY RUNTIME
 *
 * Canonical reserve/capacity compiler for all resource occurrences.
 * runtime_deposits keep their RESOURCE_JSON reserve evidence. Profile mine sites
 * without quantitative capacity still become executable occurrences through a
 * deterministic gameplay baseline, explicitly marked as derived simulation data.
 * No site is silently dropped from the runtime graph.
 *
 * Fallback horizon is a gameplay baseline, not a real-world production claim.
 * ========================================================================== */
(function(g){
  'use strict';

  const VERSION='1.0.0';
  const DEFAULT_DEPLETION_HORIZON_DAYS=100000;
  const PROFILE_SITE_DEPLETION_HORIZON_DAYS=3650;
  const PROFILE_SITE_DAILY_RATES=Object.freeze({
    crude_oil:10000,natural_gas:0.01,gold:500,uranium:50,lithium:500,rare_earth:100,cobalt:150,
    nickel:800,copper:1000,bauxite:4000,iron_ore:8000,coal:5000,phosphate:4000,potash:3000,
    limestone:5000,gypsum:2500,marble:1500,chromium:1000,silica_sand:5000,clay:3000,zeolite:1000,zircon:500
  });
  const PROFILE_SITE_UNITS=Object.freeze({
    crude_oil:'BARRELS',natural_gas:'BCM',gold:'TROY_OZ',uranium:'TONNES',lithium:'TONNES',
    rare_earth:'TONNES',cobalt:'TONNES',nickel:'TONNES',copper:'TONNES',bauxite:'TONNES',
    iron_ore:'TONNES',coal:'TONNES',phosphate:'TONNES',potash:'TONNES',limestone:'TONNES',
    gypsum:'TONNES',marble:'TONNES',chromium:'TONNES',silica_sand:'TONNES',clay:'TONNES',
    zeolite:'TONNES',zircon:'TONNES'
  });

  function clone(v,seen){
    if(v===null||typeof v!=='object')return v;
    seen=seen||new WeakMap();
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v)){
      if(k==='__proto__'||k==='constructor'||typeof v[k]==='function'||v[k]===undefined)continue;
      o[k]=clone(v[k],seen);
    }
    return o;
  }
  function id(v){return String(v??'').trim().toUpperCase();}
  function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
  function canonicalCountry(v){
    const raw=String(v??'').trim();
    if(!raw)return null;
    try{
      const bridge=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
      const hit=bridge?.resolveCountry?.(raw);
      if(hit?.id)return id(hit.id);
    }catch(_){}
    return id(raw);
  }

  function profileSiteRate(resourceId){
    return num(PROFILE_SITE_DAILY_RATES[String(resourceId||'').replace(/^RES_TYPE:/i,'').trim().toLowerCase()]||0);
  }
  function profileSiteUnit(resourceId,fallback){
    const key=String(resourceId||'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();
    return fallback||PROFILE_SITE_UNITS[key]||'TONNES';
  }

  function multiplier(text){
    const t=String(text||'').toLowerCase();
    if(t.includes('trillion'))return 1e12;
    if(t.includes('billion'))return 1e9;
    if(t.includes('million'))return 1e6;
    if(t.includes('thousand'))return 1e3;
    return 1;
  }

  function firstNumber(text,pattern){
    const m=String(text||'').match(pattern);
    if(!m)return null;
    const value=Number(String(m[1]).replace(/,/g,''));
    if(!Number.isFinite(value))return null;
    return value*multiplier(m[0]);
  }

  function parseReserve(raw,resourceId,targetUnit){
    const text=String(raw||'').trim();
    const rid=String(resourceId||'').toLowerCase();
    let quantity=null,sourceUnit=null;
    if(rid==='crude_oil'){
      quantity=firstNumber(text,/([\d,.]+)\s*(?:trillion|billion|million|thousand)?\s*BBL/i);
      sourceUnit='BBL';
    }else if(rid==='natural_gas'){
      quantity=firstNumber(text,/([\d,.]+)\s*(?:trillion|billion|million|thousand)?\s*TCF/i);
      sourceUnit='TCF';
      if(quantity!==null)quantity*=28.316846592;
    }else if(rid==='gold'){
      quantity=firstNumber(text,/([\d,.]+)\s*(?:trillion|billion|million|thousand)?\s*(?:MILLION\s+)?OZ\b/i);
      if(quantity===null)quantity=firstNumber(text,/([\d,.]+)\s*(?:trillion|billion|million|thousand)?\s*TONS?/i);
      sourceUnit=targetUnit||'troy_ounces';
    }else{
      quantity=firstNumber(text,/([\d,.]+)\s*(?:trillion|billion|million|thousand)?\s*(?:M|MT|MN)?\s*T(?:ONS)?\b/i);
      if(quantity===null)quantity=firstNumber(text,/([\d,.]+)\s*(?:trillion|billion|million|thousand)?\s*M\s*T\b/i);
      sourceUnit=targetUnit||'metric_tons';
    }
    if(quantity===null||quantity<=0){
      const generic=String(text.match(/[\d,.]+/)?.[0]||'').replace(/,/g,'');
      const n=Number(generic);
      if(Number.isFinite(n)&&n>0){quantity=n;sourceUnit=targetUnit||'UNOBSERVED_UNIT';}
    }
    return{quantity,sourceUnit,targetUnit:targetUnit||sourceUnit||null};
  }

  class ReserveState{
    constructor(input={}){
      Object.assign(this,clone(input));
      this.occurrenceKey=String(this.occurrenceKey||'');
      this.stateVersion=num(this.stateVersion)||1;
    }
    toJSON(){return clone(this);}
  }

  class Capacity{
    constructor(input={}){
      Object.assign(this,clone(input));
    }
    computeWindowCapacity(hours){
      const h=num(hours);
      const factor=h===null?1:Math.max(0,h/24);
      return{windowCapacity:(num(this.nominalRate)||0)*factor};
    }
  }

  function compileReserves(identityRegistry,_unused,knowledge){
    if(!identityRegistry?.listOccurrences)return{status:'FAILED',reason:'RESOURCE_IDENTITY_REGISTRY_REQUIRED'};
    const resourceTypes=Array.isArray(knowledge?.sovereignEntities?.resourceTypes)?knowledge.sovereignEntities.resourceTypes:[];
    const typeById=new Map(resourceTypes.map(x=>[String(x?.id||'').replace(/^RES_TYPE:/i,'').toLowerCase(),x]));
    const reserves=new Map(),capacities=new Map(),lifecycles=new Map(),accessibility=new Map();
    const occurrences=identityRegistry.listOccurrences();

    occurrences.forEach(function(occ){
      const raw=occ.rawDeposit||{};
      const type=typeById.get(String(occ.resourceTypeId||'').toLowerCase())||{};
      const parsed=parseReserve(raw.reserves,occ.resourceTypeId,type.unit);
      const profileDerived=raw.profileDerivedSimulation===true;
      let declared=parsed.quantity;
      let runtimeUnit=parsed.targetUnit||type.unit||null;
      let reserveQuantityAuthority='RESOURCE_JSON';
      let capacityAuthority=raw.productionRate||raw.dailyRate||raw.outputRate?'RESOURCE_JSON':'SIMULATION_DEFAULT_NO_DATA_RATE';
      let horizon=DEFAULT_DEPLETION_HORIZON_DAYS;
      let nominalRate=null;
      if((declared===null||declared<=0)&&profileDerived){
        runtimeUnit=profileSiteUnit(occ.resourceTypeId,runtimeUnit);
        nominalRate=profileSiteRate(occ.resourceTypeId);
        if(nominalRate<=0)return;
        horizon=PROFILE_SITE_DEPLETION_HORIZON_DAYS;
        declared=nominalRate*horizon;
        reserveQuantityAuthority='DERIVED_SIMULATION_BASELINE';
        capacityAuthority='PROFILE_SITE_SIMULATION_BASELINE';
      }
      if(declared===null||declared<=0)return;
      if(nominalRate===null)nominalRate=declared/horizon;

      const rawStatus=String(raw.status||occ.status||'UNKNOWN').toUpperCase();
      const active=profileDerived
        ? true
        : /ACTIVE|PRODUCING|OPERATING|RUNNING/.test(rawStatus) && !/SUSPEND|BLOCK|CLOSED|ABANDON/.test(rawStatus);

      const reserve=new ReserveState({
        occurrenceKey:occ.occurrenceKey,
        countryId:canonicalCountry(occ.countryId),
        depositKey:occ.depositKey,
        resourceId:occ.resourceTypeId,
        geologicalQuantity:declared,
        recoverableQuantity:declared,
        residualQuantity:declared,
        unit:runtimeUnit||null,
        operationalStatus:active?'ACTIVE_EXTRACTION':'BLOCKED',
        profileDerivedSimulation:profileDerived,
        runtimeActivationMode:profileDerived?'PROFILE_SITE_RUNTIME':'RESOURCE_JSON_RUNTIME',
        stateVersion:1,
        provenance:{
          sourceAuthority:'RESOURCE_JSON',
          sourceDatasetId:raw.sourceDatasetId||'resources.json',
          reserveField:raw.reserves?'runtime_deposits.reserves':profileDerived?'PROFILE_SITE_RUNTIME_BASELINE':'UNKNOWN',
          reserveText:String(raw.reserves||''),
          effortUtilization:1,
          capacitySource:capacityAuthority,
          quantityAuthority:reserveQuantityAuthority,
          simulationExtractionHorizonDays:horizon
        }
      });
      const capacity=new Capacity({
        occurrenceKey:occ.occurrenceKey,
        countryId:canonicalCountry(occ.countryId),
        resourceId:occ.resourceTypeId,
        unit:runtimeUnit||null,
        nominalRate:nominalRate,
        dailyRate:nominalRate,
        assetReference:'MINE:'+occ.occurrenceKey,
        effortUtilization:1,
        authority:capacityAuthority,
        quantityAuthority:reserveQuantityAuthority==='RESOURCE_JSON'?'RESOURCE_JSON':'DERIVED_SIMULATION_BASELINE',
        profileDerivedSimulation:profileDerived,
        simulationExtractionHorizonDays:horizon
      });
      reserves.set(occ.occurrenceKey,reserve);
      capacities.set(occ.occurrenceKey,capacity);
      lifecycles.set(occ.occurrenceKey,{
        occurrenceKey:occ.occurrenceKey,
        countryId:canonicalCountry(occ.countryId),
        status:reserve.operationalStatus,
        mode:'AUTO_GLOBAL_MINE_RUNTIME',
        sourceAuthority:'RESOURCE_JSON'
      });
      accessibility.set(occ.occurrenceKey,{state:'AVAILABLE',sourceAuthority:'RESOURCE_JSON'});
    });

    const registry={
      VERSION,
      reserveStates:reserves,
      capacities,
      lifecycles,
      accessibilityStates:accessibility,
      getReserveState:function(key){return reserves.get(String(key||''))||null;},
      registerReserveState:function(value){if(value?.occurrenceKey)reserves.set(String(value.occurrenceKey),value);return value;},
      getCapacityForOccurrence:function(key){return capacities.get(String(key||''))||null;},
      getRecoverabilityModelForResource:function(){return null;},
      listReserveStates:function(){return [...reserves.values()].map(function(x){return clone(x.toJSON?.()||x);});}
    };

    return{status:'READY',registry,occurrenceCount:occurrences.length,reserveCount:reserves.size,capacityCount:capacities.size};
  }

  const API=Object.freeze({
    VERSION,
    ReserveState,
    ExtractionRequest:class ExtractionRequest{constructor(input={}){Object.assign(this,clone(input));}},
    TemporalWindowUnit:{PER_DAY:'PER_DAY'},
    ExtractionMethodEnum:{UNKNOWN:'UNKNOWN'},
    ExtractionResultStatus:{APPROVED:'APPROVED',PARTIALLY_APPROVED:'PARTIALLY_APPROVED'},
    OverdrawPolicyEnum:{CAP:'CAP'},
    compileReserves,
    executeExtraction:function(request,reserve,options={}){
      if(!reserve||!options?.capacity)return{
        status:'BLOCKED',
        diagnostics:[{message:'EXTRACTION_RESERVE_OR_CAPACITY_REQUIRED'}]
      };
      const q=Math.min(
        Math.max(0,num(request?.requestedQuantity)||0),
        Math.max(0,num(reserve.residualQuantity)||0),
        Math.max(0,num(options.capacity.computeWindowCapacity(request?.timeWindowDurationHours||24)?.windowCapacity)||0)
      );
      if(q<=0)return{status:'BLOCKED',diagnostics:[{message:'EXTRACTION_QUANTITY_ZERO'}]};
      const before=new ReserveState(reserve.toJSON?.()||reserve);
      const after=new ReserveState({
        ...before,
        residualQuantity:Math.max(0,(num(before.residualQuantity)||0)-q),
        stateVersion:(num(before.stateVersion)||1)+1,
        operationalStatus:(num(before.residualQuantity)||0)-q<=0?'EXHAUSTED':'DEPLETING'
      });
      const extractedBatch={
        batchId:'P5:'+String(before.occurrenceKey).replace(/[^A-Z0-9:_-]/gi,'')+':T'+String(request?.simulationTick||0),
        unit:before.unit||options.capacity.unit||null,
        purity:null,
        grade:null
      };
      return{
        status:'APPROVED',
        approvedQuantity:q,
        reserveBefore:before,
        reserveAfter:after,
        producedBatch:extractedBatch,
        calculationTrace:{
          requestedQuantity:num(request?.requestedQuantity)||0,
          approvedQuantity:q,
          capacity:clone(options.capacity),
          reserveBefore:num(before.residualQuantity)||0,
          reserveAfter:num(after.residualQuantity)||0,
          capacityAuthority:options.capacity.authority||'SIMULATION_DEFAULT_NO_DATA_RATE'
        },
        transition:{from:before.operationalStatus,to:after.operationalStatus},
        provenance:{
          sourceAuthority:'RESOURCE_JSON',
          capacityAuthority:options.capacity.authority||'SIMULATION_DEFAULT_NO_DATA_RATE',
          simulationExtractionHorizonDays:DEFAULT_DEPLETION_HORIZON_DAYS
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
