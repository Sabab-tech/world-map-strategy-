/* ============================================================================
 * OMEGA RESOURCE PART 05 - RESERVE + EXTRACTION CAPACITY RUNTIME
 *
 * The RESOURCE_JSON mine records do not publish production-capacity fields.
 * Therefore this layer:
 *   1. never invents deposits,
 *   2. preserves RESOURCE_JSON reserve evidence,
 *   3. activates ACTIVE_PRODUCING runtime mines,
 *   4. supplies one deterministic simulation-only extraction rate when a
 *      real capacity is absent, explicitly tagged as a fallback.
 *
 * Fallback horizon is a gameplay baseline, not a real-world production claim.
 * ========================================================================== */
(function(g){
  'use strict';

  const VERSION='1.0.0';
  const DEFAULT_DEPLETION_HORIZON_DAYS=100000;

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
      const declared=parsed.quantity;
      if(declared===null||declared<=0)return;

      const rawStatus=String(raw.status||occ.status||'UNKNOWN').toUpperCase();
      const active=/ACTIVE|PRODUCING|OPERATING|RUNNING/.test(rawStatus) && !/SUSPEND|BLOCK|CLOSED|ABANDON/.test(rawStatus);
      const horizon=DEFAULT_DEPLETION_HORIZON_DAYS;
      const nominalRate=declared/horizon;

      const reserve=new ReserveState({
        occurrenceKey:occ.occurrenceKey,
        countryId:canonicalCountry(occ.countryId),
        depositKey:occ.depositKey,
        resourceId:occ.resourceTypeId,
        geologicalQuantity:declared,
        recoverableQuantity:declared,
        residualQuantity:declared,
        unit:parsed.targetUnit||type.unit||null,
        operationalStatus:active?'ACTIVE_EXTRACTION':'BLOCKED',
        stateVersion:1,
        provenance:{
          sourceAuthority:'RESOURCE_JSON',
          sourceDatasetId:raw.sourceDatasetId||'resources.json',
          reserveField:'runtime_deposits.reserves',
          reserveText:String(raw.reserves||''),
          effortUtilization:1,
          capacitySource:raw.productionRate||raw.dailyRate||raw.outputRate?'RESOURCE_JSON':'SIMULATION_DEFAULT_NO_DATA_RATE',
          simulationExtractionHorizonDays:horizon
        }
      });
      const capacity=new Capacity({
        occurrenceKey:occ.occurrenceKey,
        countryId:canonicalCountry(occ.countryId),
        resourceId:occ.resourceTypeId,
        unit:parsed.targetUnit||type.unit||null,
        nominalRate:nominalRate,
        dailyRate:nominalRate,
        assetReference:'MINE:'+occ.occurrenceKey,
        effortUtilization:1,
        authority:raw.productionRate||raw.dailyRate||raw.outputRate?'RESOURCE_JSON':'SIMULATION_DEFAULT_NO_DATA_RATE',
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
