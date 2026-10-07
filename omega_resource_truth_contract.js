/* OMEGA RESOURCE TRUTH CONTRACT v1.0.0
 * Shared semantic/authority boundary for resource data, modeling and simulation.
 * This layer never invents quantitative facts and never mutates source datasets.
 */
(function(g){
  'use strict';

  const VERSION='1.0.0';
  const AUTHORITY=Object.freeze({OBSERVED:'OBSERVED',MODELED:'MODELED',SIMULATED:'SIMULATED',UNOBSERVED:'UNOBSERVED'});
  const STATUS=Object.freeze({AVAILABLE:'AVAILABLE',UNOBSERVED:'UNOBSERVED',NOT_APPLICABLE:'NOT_APPLICABLE',INCOMPATIBLE:'INCOMPATIBLE'});
  const MEASUREMENT_BASIS=Object.freeze([
    'GEOLOGICAL_ENDOWMENT','ORE_MASS','CONTAINED_COMMODITY','MINERAL_RESOURCE',
    'MINERAL_RESERVE','RECOVERABLE_RESOURCE','ECONOMIC_RESERVE','EXTRACTABLE_QUANTITY',
    'FIELD_RESOURCE','PETROLEUM_RESERVE'
  ]);
  const DATASETS=Object.freeze({
    RESOURCES_JSON:'resources.json',
    RESOURCES_2_JSON:'resources_2.json',
    CANONICAL_SITE_CATALOG:'resource_site_canonical_catalog_v1.json',
    RESEARCH_EVIDENCE:'resource_site_research_evidence_v1.json',
    QUANTITATIVE_RESEARCH:'resource_site_quantitative_research_v1.json',
    SCENARIO_RESERVE:'resource_site_reserve_simulation_v1.json'
  });

  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function')o[k]=clone(v[k],seen);return o;
  };
  const norm=v=>String(v??'').trim().toUpperCase();
  const rid=v=>String(v??'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const validAuthority=v=>Object.prototype.hasOwnProperty.call(AUTHORITY,norm(v));
  const validBasis=v=>MEASUREMENT_BASIS.includes(norm(v));

  function provenance(input={}){
    const sourceDatasetId=input.sourceDatasetId||input.datasetId||null;
    const sourcePath=input.sourcePath||null;
    const sourceRecordId=input.sourceRecordId||input.recordId||input.siteId||null;
    const sourceAuthority=input.sourceAuthority||input.authority||AUTHORITY.UNOBSERVED;
    if(!validAuthority(sourceAuthority))throw new Error('RESOURCE_TRUTH_INVALID_AUTHORITY');
    return {
      sourceDatasetId:sourceDatasetId?String(sourceDatasetId):null,
      sourcePath:sourcePath?String(sourcePath):null,
      sourceRecordId:sourceRecordId?String(sourceRecordId):null,
      sourceAuthority:norm(sourceAuthority),
      effectiveDate:input.effectiveDate||input.date||null
    };
  }

  function field(input={}){
    const authority=norm(input.authority||input.status===AUTHORITY.OBSERVED?AUTHORITY.OBSERVED:AUTHORITY.UNOBSERVED);
    const status=input.status?norm(input.status):(authority===AUTHORITY.UNOBSERVED?STATUS.UNOBSERVED:STATUS.AVAILABLE);
    const basis=input.measurementBasis||input.basis||null;
    if(authority!==AUTHORITY.UNOBSERVED&&!validAuthority(authority))throw new Error('RESOURCE_TRUTH_INVALID_AUTHORITY');
    if(basis&&!validBasis(basis))throw new Error('RESOURCE_TRUTH_INVALID_MEASUREMENT_BASIS');
    return {
      value:input.value??null,
      unit:input.unit??null,
      measurementBasis:basis?norm(basis):null,
      commodity:input.commodity?rid(input.commodity):null,
      effectiveDate:input.effectiveDate||null,
      status,
      authority:authority||AUTHORITY.UNOBSERVED,
      provenance:provenance(input.provenance||input)
    };
  }

  function unitFamily(unit){
    const u=norm(unit).replace(/[\s_-]+/g,'');
    if(/^(T|TON|TONS|TONNE|TONNES|METRICTON|METRICTONS|TONNESORE)$/.test(u))return 'TONNES';
    if(/^(OZ|OZT|TROYOZ|TROYOYOUNCE|TROYOUNCE|TROYOUNCES)$/.test(u))return 'TROY_OUNCES';
    if(/^BBL(S)?|BARREL(S)?$/.test(u))return 'BBL';
    if(/^TCF$/.test(u))return 'TCF';
    if(/^BCF$/.test(u))return 'BCF';
    if(/^BCM$/.test(u))return 'BCM';
    if(/^MCM$/.test(u))return 'MCM';
    if(/^MCF$/.test(u))return 'MCF';
    if(/^G\/T|GRAMS\/T|GRAMSPERTONNE$/.test(u))return 'GT';
    if(/^%|PERCENT$/.test(u))return 'PERCENT';
    if(/^MG\/L|MGPL$/.test(u))return 'MG_L';
    if(/^API|APIGRAVITY$/.test(u))return 'API';
    if(/^CARAT(S)?|CT$/.test(u))return 'CARATS';
    return null;
  }

  const UNIT_COMPATIBILITY=Object.freeze({
    TONNES:new Set(['TONNES']),
    TROY_OUNCES:new Set(['TROY_OUNCES']),
    BBL:new Set(['BBL']),
    GAS:new Set(['TCF','BCF','BCM','MCM','MCF']),
    CARATS:new Set(['CARATS']),
    GT:new Set(['GT']),
    PERCENT:new Set(['PERCENT']),
    MG_L:new Set(['MG_L']),
    API:new Set(['API'])
  });
  function resourceFamily(resourceId){
    const r=rid(resourceId);
    if(r==='crude_oil')return 'BBL';
    if(r==='natural_gas')return 'GAS';
    if(['gold','silver','platinum'].includes(r))return 'TROY_OUNCES';
    if(r==='diamond')return 'CARATS';
    return 'TONNES';
  }
  function compatibleUnit(resourceId,unit){
    const fam=resourceFamily(resourceId), uf=unitFamily(unit);
    return !!(fam&&uf&&UNIT_COMPATIBILITY[fam]?.has(uf));
  }

  const BASIS_FAMILY=Object.freeze({
    GEOLOGICAL_ENDOWMENT:'GEOLOGICAL',
    ORE_MASS:'ORE',
    CONTAINED_COMMODITY:'CONTAINED',
    MINERAL_RESOURCE:'MINERAL_RESOURCE',
    MINERAL_RESERVE:'MINERAL_RESERVE',
    RECOVERABLE_RESOURCE:'RECOVERABLE',
    ECONOMIC_RESERVE:'ECONOMIC',
    EXTRACTABLE_QUANTITY:'EXTRACTABLE',
    FIELD_RESOURCE:'FIELD_RESOURCE',
    PETROLEUM_RESERVE:'PETROLEUM_RESERVE'
  });
  function basisCompatible(resourceId,a,b){
    if(!a||!b)return false;
    const A=norm(a),B=norm(b),r=rid(resourceId);
    if(A===B)return true;
    if(r==='crude_oil'||r==='natural_gas'){
      return [A,B].every(x=>x==='FIELD_RESOURCE'||x==='PETROLEUM_RESERVE'||x==='RECOVERABLE_RESOURCE'||x==='EXTRACTABLE_QUANTITY');
    }
    if(r==='diamond')return false;
    const pair=new Set([A,B]);
    return pair.has('MINERAL_RESERVE')&&pair.has('ECONOMIC_RESERVE') ? true : false;
  }

  function measurementCompatible(resourceId,input={}){
    const basis=norm(input.measurementBasis||input.basis||'');
    const unit=input.unit;
    if(!validBasis(basis))return {ok:false,reason:'MEASUREMENT_BASIS_UNDECLARED'};
    if(!compatibleUnit(resourceId,unit))return {ok:false,reason:'UNIT_RESOURCE_FAMILY_INCOMPATIBLE'};
    return {ok:true,basis,family:unitFamily(unit)};
  }

  function chooseCandidate(resourceId,candidates){
    const rows=(Array.isArray(candidates)?candidates:[]).filter(x=>x&&norm(x.authority)!==AUTHORITY.UNOBSERVED);
    const observed=rows.filter(x=>norm(x.authority)===AUTHORITY.OBSERVED);
    const modeled=rows.filter(x=>norm(x.authority)===AUTHORITY.MODELED);
    const simulated=rows.filter(x=>norm(x.authority)===AUTHORITY.SIMULATED);
    const ordered=[...observed,...modeled,...simulated];
    for(const row of ordered){
      const check=measurementCompatible(resourceId,row);
      if(!check.ok)continue;
      const compatible=ordered.filter(x=>x!==row).every(other=>{
        if(!other.measurementBasis)return true;
        return basisCompatible(resourceId,row.measurementBasis,other.measurementBasis)||norm(other.authority)!==norm(row.authority);
      });
      if(compatible)return clone(row);
    }
    return null;
  }

  function resolveReserve(resourceId,{observed=[],modeled=[],scenario=[]}={}){
    const selected=chooseCandidate(resourceId,[...observed,...modeled,...scenario]);
    const observedRows=(Array.isArray(observed)?observed:[]).filter(Boolean);
    const scenarioRows=(Array.isArray(scenario)?scenario:[]).filter(Boolean);
    const result={
      resourceId:rid(resourceId),
      authoritative:selected,
      scenario:scenarioRows.length?clone(scenarioRows[0]):null,
      status:selected?STATUS.AVAILABLE:STATUS.UNOBSERVED
    };
    if(observedRows.length&&!selected)result.status=STATUS.INCOMPATIBLE;
    return result;
  }

  function siteIdentity(site={}){
    const siteId=String(site.siteId||site.siteReferenceKey||'').trim();
    const countryId=norm(site.countryId||site.countryCode||'');
    const resourceId=rid(site.resourceId||site.resourceTypeId||'');
    if(!siteId||!countryId||!resourceId)return {ok:false,reason:'CANONICAL_SITE_IDENTITY_INCOMPLETE'};
    return {ok:true,siteId,countryId,resourceId};
  }

  function classifyCurrentProduction(input={}){
    const observed=finite(input.observedRate)?field({value:input.observedRate,unit:input.unit,measurementBasis:'EXTRACTABLE_QUANTITY',authority:AUTHORITY.OBSERVED,provenance:input.provenance}):field({authority:AUTHORITY.UNOBSERVED,status:STATUS.UNOBSERVED});
    const modeled=finite(input.modeledRate)?field({value:input.modeledRate,unit:input.unit,measurementBasis:'EXTRACTABLE_QUANTITY',authority:AUTHORITY.MODELED,provenance:input.provenance}):field({authority:AUTHORITY.UNOBSERVED,status:STATUS.UNOBSERVED});
    const simulated=finite(input.simulatedRate)?field({value:input.simulatedRate,unit:input.unit,measurementBasis:'EXTRACTABLE_QUANTITY',authority:AUTHORITY.SIMULATED,provenance:input.provenance}):field({authority:AUTHORITY.UNOBSERVED,status:STATUS.UNOBSERVED});
    return {current:observed.authority===AUTHORITY.OBSERVED?observed:null,modeled:modeled.authority===AUTHORITY.MODELED?modeled:null,simulation:simulated.authority===AUTHORITY.SIMULATED?simulated:null};
  }

  function sanitizeSiteModel(model,site={}){
    const out=clone(model||{});
    const siteId=String(site.siteId||site.siteReferenceKey||site.id||'').trim()||null;
    const countryId=norm(site.countryId||site.countryCode||'');
    out.truthContractVersion=VERSION;
    out.siteIdentity={siteId,countryId,resourceId:null};
    out.authorityLayers={OBSERVED:[],MODELED:[],SIMULATED:[],UNOBSERVED:[]};
    const streams=Array.isArray(out.commodityStreams)?out.commodityStreams:[];
    for(const stream of streams){
      const resourceId=rid(stream.resourceId);
      out.siteIdentity.resourceId=out.siteIdentity.resourceId||resourceId;
      const reserve=stream.reserve||{};
      const production=stream.production||{};
      const scenarioReserve=reserve.scenarioRecord?{
        value:reserve.quantity??null,unit:reserve.unit??null,measurementBasis:reserve.basis||null,
        authority:AUTHORITY.SIMULATED,status:STATUS.AVAILABLE,
        provenance:{sourceDatasetId:DATASETS.SCENARIO_RESERVE,sourceRecordId:siteId,sourceAuthority:'SCENARIO_SIMULATION_DATA',effectiveDate:null}
      }:null;
      const observedReserveValue=site?.reserveQuantity??site?.geologicalQuantity??site?.reservesQuantity??null;
      const observedReserveUnit=site?.reserveUnit||reserve.unit||null;
      const reserveObserved=finite(Number(observedReserveValue))&&Number(observedReserveValue)>0;
      const observedReserve=reserveObserved?{value:Number(observedReserveValue),unit:observedReserveUnit,measurementBasis:site?.reserveBasis||'MINERAL_RESERVE',commodity:resourceId,authority:AUTHORITY.OBSERVED,status:STATUS.AVAILABLE,provenance:{sourceDatasetId:site?.sourceDatasetId||DATASETS.RESOURCES_JSON,sourceRecordId:siteId,sourceAuthority:'RESOURCE_JSON',effectiveDate:site?.effectiveDate||null}}:null;
      stream.reserve={quantity:reserveObserved?Number(observedReserveValue):null,unit:reserveObserved?observedReserveUnit:(reserve.unit||null),
        authority:reserveObserved?AUTHORITY.OBSERVED:AUTHORITY.UNOBSERVED,status:reserveObserved?STATUS.AVAILABLE:STATUS.UNOBSERVED,
        measurementBasis:reserveObserved?(site?.reserveBasis||'MINERAL_RESERVE'):null,
        scenario:scenarioReserve,fieldAuthority:reserveObserved?AUTHORITY.OBSERVED:AUTHORITY.UNOBSERVED};
      const observedRate=finite(Number(production.observedRate))?Number(production.observedRate):null;
      const simulatedRate=finite(Number(production.activeRate))?Number(production.activeRate):null;
      const layers=classifyCurrentProduction({observedRate,simulatedRate,unit:production.unit||reserve.unit,provenance:{sourceDatasetId:site?.sourceDatasetId||DATASETS.RESOURCES_JSON,sourceRecordId:siteId,sourceAuthority:'RESOURCE_JSON'}});
      stream.production={...production,currentProduction:layers.current?.value??null,currentProductionAuthority:layers.current?.authority||AUTHORITY.UNOBSERVED,
        currentProductionStatus:layers.current?STATUS.AVAILABLE:STATUS.UNOBSERVED,simulationProduction:layers.simulation?.value??null,simulationProductionAuthority:layers.simulation?.authority||AUTHORITY.UNOBSERVED};
      if(stream.quality){
        const q=stream.quality;
        if(q.gradeStatus!=='OBSERVED')q.grade=q.gradeStatus==='SIMULATED'?null:q.grade;
        q.authority=q.gradeStatus==='OBSERVED'?AUTHORITY.OBSERVED:AUTHORITY.UNOBSERVED;
      }
      for(const key of ['reserve','production','quality']){
        const a=norm(stream[key]?.authority||stream[key]?.fieldAuthority||stream[key]?.currentProductionAuthority);
        out.authorityLayers[a in out.authorityLayers?a:AUTHORITY.UNOBSERVED].push(resourceId+':'+key);
      }
    }
    const observedCount=out.authorityLayers.OBSERVED.length;
    const simulatedCount=out.authorityLayers.SIMULATED.length;
    out.authority=simulatedCount||out.authorityLayers.UNOBSERVED.length?'SIMULATED':(observedCount?'OBSERVED':'UNOBSERVED');
    out.dataStatus=out.authorityLayers.UNOBSERVED.length?'PARTIAL':'AVAILABLE';
    return out;
  }

  function assertNoSyntheticAuthority(value){
    const a=norm(value?.authority||value?.stateAuthority||value?.sourceAuthority||'');
    if(a==='OBSERVED'&&value?.simulationGenerated===true)throw new Error('RESOURCE_TRUTH_SYNTHETIC_MARKED_OBSERVED');
    if(a==='OBSERVED'&&/SIMULAT|FALLBACK|CALIBRAT|SCENARIO/i.test(JSON.stringify(value?.provenance||{})))throw new Error('RESOURCE_TRUTH_SYNTHETIC_PROVENANCE_MARKED_OBSERVED');
    return true;
  }

  const API=Object.freeze({
    VERSION,AUTHORITY,STATUS,MEASUREMENT_BASIS,DATASETS,UNIT_COMPATIBILITY,BASIS_FAMILY,
    clone,provenance,field,unitFamily,resourceFamily,compatibleUnit,basisCompatible,measurementCompatible,
    chooseCandidate,resolveReserve,siteIdentity,classifyCurrentProduction,sanitizeSiteModel,assertNoSyntheticAuthority
  });
  g.Omega=g.Omega||{};
  g.Omega.ResourceTruthContract=API;
  g.OmegaResourceTruthContract=API;
})(typeof globalThis!=='undefined'?globalThis:window);
