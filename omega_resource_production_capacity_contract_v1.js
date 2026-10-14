/* OMEGA RESOURCE PRODUCTION CAPACITY CONTRACT v1.0.0
 * Shared, deterministic capacity calculation contract for production and realism runtimes.
 * Site records are not generated or rewritten here. Defaults are runtime simulation policy.
 */
(function(g){
'use strict';
const VERSION='1.0.0',DAY_HOURS=24;
const AVAILABILITY_FIELDS={
  equipment:['equipmentAvailability','machineryAvailability','equipmentFactor'],
  power:['powerAvailability','electricityAvailability','energyAvailability','gridAvailability','powerFactor'],
  inputs:['inputAvailability','suppliesAvailability','consumablesAvailability','materialAvailability','materialsAvailability','inputFactor'],
  technology:['technologyEfficiency','technicalEfficiency','technologyEfficiencyFactor']
};
const clone=v=>v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(clone):Object.fromEntries(Object.entries(v).filter(([k])=>k!=='__proto__'&&k!=='constructor').map(([k,x])=>[k,clone(x)]));
const num=v=>{if(v===null||v===undefined||v==='')return null;const raw=v&&typeof v==='object'&&Object.prototype.hasOwnProperty.call(v,'value')?v.value:v;if(raw===null||raw===undefined||raw==='')return null;const n=typeof raw==='number'?raw:Number(String(raw).replace(/,/g,''));return Number.isFinite(n)?n:null;};
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,Number(v)||0));
const key=v=>String(v??'').trim().toUpperCase();
const marker=v=>/SIMULATED|SCENARIO_SIMULATION_DATA|SIMULATION_DATA|UNOBSERVED|UNQUANTIFIED/i.test(String(v??''));
function isSimulatedSource(site,requested){
  if(requested)return String(requested).toUpperCase()!=='OBSERVED';
  const vals=[
    site?.quantitativeProvenance?.authority,site?.quantitative?.quantitativeProvenance?.authority,
    site?.productionModel?.authority,site?.productionModel?.stateAuthority,site?.productionModel?.productionAuthority,
    site?.reserveAuthority,site?.quantityAuthority,site?.productionAuthority,
    site?.dataStatus,site?.stateAuthority,site?.authority
  ];
  return vals.some(marker);
}
function hashFraction(text){
  let h=2166136261;for(let i=0;i<String(text).length;i++){h^=String(text).charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0)/4294967295;
}
function normalizeAvailability(value,fallback,technology=false){
  const n=num(value);if(n===null)return fallback;
  let v=n;
  if(technology){
    // Technology efficiency may be a multiplier (e.g. 1.08) or a percent (e.g. 92).
    if(v>2&&v<=100)v/=100;
    return clamp(v,0,1.5);
  }
  if(v>1&&v<=100)v/=100;
  return clamp(v,0,1);
}
function valueAt(container,aliases){
  if(!container||typeof container!=='object')return null;
  for(const name of aliases){
    if(Object.prototype.hasOwnProperty.call(container,name)){
      const value=num(container[name]);if(value!==null)return{value,raw:container[name],source:name};
    }
  }
  return null;
}
function nestedValue(container,groupNames,aliases){
  for(const groupName of groupNames){
    const group=container?.[groupName];
    if(!group||typeof group!=='object')continue;
    const found=valueAt(group,aliases.concat(['availability','value']));
    if(found)return{...found,source:groupName+'.'+found.source};
  }
  return null;
}
function readFactor(site,provider,field){
  const aliases=AVAILABILITY_FIELDS[field];
  const production=site?.productionModel&&typeof site.productionModel==='object'?site.productionModel:{};
  const containers=[
    {row:provider?.factors||provider,source:'availability-provider'},
    {row:site?.currentOperations?.operationalFactors||site?.currentOperations?.availabilityFactors,source:'current-operations'},
    {row:site?.operationalFactors||site?.availabilityFactors,source:'site-operational-factors'},
    {row:production?.operationalFactors||production?.availabilityFactors,source:'production-model-factors'},
    {row:site?.operatingConditions,source:'operating-conditions'},
    {row:production,source:'production-model'},
    {row:site,source:'site-field'}
  ];
  for(const item of containers){
    const hit=valueAt(item.row,aliases);
    if(hit)return{...hit,source:item.source+'.'+hit.source,authority:item.row?.authority||item.row?.stateAuthority||provider?.authority||null};
    const nested=nestedValue(item.row,
      field==='equipment'?['equipment','machinery']:
      field==='power'?['power','electricity','energy','grid']:
      field==='inputs'?['inputs','supplies','consumables','materials']:
      ['technology','technical'],aliases);
    if(nested)return{...nested,source:item.source+'.'+nested.source,authority:item.row?.authority||item.row?.stateAuthority||provider?.authority||null};
  }
  return null;
}
function resolveFactors(input={},options={}){
  const site=input?.site&&typeof input.site==='object'?input.site:input?.raw&&typeof input.raw==='object'?input.raw:input;
  const resourceId=String(options.resourceId||site?.resourceId||site?.resourceTypeId||site?.resourceTypeKey||site?.resId||'').trim().toLowerCase();
  const siteKey=String(site?.siteId||site?.siteReferenceKey||site?.id||site?.siteName||site?.name||[site?.countryId||site?.countryCode,resourceId].join('|'));
  const authorityMode=String(options.authorityMode||(isSimulatedSource(site)?'SIMULATED':'OBSERVED')).toUpperCase();
  const simulated=authorityMode!=='OBSERVED';
  let provider=null;
  const p=g.Omega?.ResourceAvailabilityRuntime||g.Omega?.ResourceOperationsAvailabilityProvider||g.OmegaResourceAvailabilityRuntime;
  const providerFn=p?.resolveSiteFactors||p?.resolveOperationalFactors||p?.forSite;
  if(typeof providerFn==='function'){
    try{provider=providerFn({siteId:site?.siteId||site?.siteReferenceKey||site?.id||null,countryId:key(site?.countryId||site?.countryCode),resourceId,turn:Number(g.Game?.state?.simulation?.turn||0),site:clone(site)})||null;}catch(_){provider=null;}
  }
  const values={},statuses={},sources={};
  for(const field of Object.keys(AVAILABILITY_FIELDS)){
    const found=readFactor(site,provider,field);
    const seed=hashFraction(siteKey+'|'+field+'|'+VERSION);
    const fallback=simulated?(
      field==='equipment'?.94+.06*seed:
      field==='power'?.93+.07*seed:
      field==='inputs'?.95+.05*seed:
      .95+.05*seed
    ):1;
    const normalized=normalizeAvailability(found?.raw??found?.value,fallback,field==='technology');
    values[field==='equipment'?'equipmentAvailability':field==='power'?'powerAvailability':field==='inputs'?'inputAvailability':'technologyEfficiency']=normalized;
    if(found){
      const explicitStatus=String(found.raw?.status||found.raw?.authority||found.authority||provider?.authority||'').toUpperCase();
      statuses[field]=marker(explicitStatus)?'SIMULATED':explicitStatus.includes('OBSERVED')?'OBSERVED':(simulated?'SIMULATED':'OBSERVED');
      sources[field]=found.source;
    }else{
      statuses[field]=simulated?'SIMULATED':'UNOBSERVED';
      sources[field]=simulated?'DETERMINISTIC_RUNTIME_DEFAULT':'NEUTRAL_DEFAULT_FOR_OBSERVED_BASELINE';
    }
  }
  const availabilityMultiplier=values.equipmentAvailability*values.powerAvailability*values.inputAvailability*values.technologyEfficiency;
  const simulatedFactorUsed=Object.values(statuses).some(v=>v==='SIMULATED');
  return{
    version:VERSION,siteId:site?.siteId||site?.siteReferenceKey||site?.id||null,countryId:key(site?.countryId||site?.countryCode)||null,resourceId,
    ...values,availabilityMultiplier,
    statuses,sources,authority:simulatedFactorUsed?'SIMULATED':(authorityMode==='OBSERVED'?'OBSERVED':'SIMULATED'),
    defaultsApplied:Object.values(sources).some(v=>v==='DETERMINISTIC_RUNTIME_DEFAULT'||v==='NEUTRAL_DEFAULT_FOR_OBSERVED_BASELINE'),
    providerUsed:!!provider
  };
}
function calculate(input={}){
  const factors=input.factors&&typeof input.factors==='object'?input.factors:resolveFactors(input.site||input.raw||{},input);
  const capacity=Math.max(0,num(input.capacity)??0),observedRate=num(input.observedRate);
  const utilization=clamp(input.utilization??1),recovery=clamp(input.recovery??1);
  const maintenance=clamp(input.maintenance??0),decline=clamp(input.decline??0);
  const availability=Math.max(0,num(factors.availabilityMultiplier)??1);
  const observedAdjustment=Math.max(0,num(input.observedAdjustmentMultiplier)??1);
  const operatingMultiplier=utilization*recovery*(1-maintenance)*(1-decline);
  const capacityRate=capacity*availability*operatingMultiplier;
  const observedRateCandidate=observedRate===null?null:Math.max(0,observedRate*availability*observedAdjustment);
  const capacityBounded=input.capacityIsExplicit===true&&capacity>0&&observedRateCandidate!==null;
  const activeRate=observedRateCandidate!==null?(capacityBounded?Math.min(observedRateCandidate,capacity*availability):observedRateCandidate):capacityRate;
  const hours=Math.max(0,num(input.durationHours)??DAY_HOURS);
  const sourceMode=observedRateCandidate!==null?'OBSERVED_BASELINE_WITH_OPERATIONAL_FACTORS':'CAPACITY_FACTOR_MODEL';
  const result={
    status:activeRate>0?'READY':'BLOCKED',modelVersion:VERSION,formulaVersion:'OMEGA_EFFECTIVE_PRODUCTION_V1',
    activeRate,capacityRate,observedRate:num(input.observedRate),ratedCapacity:capacity,
    availabilityMultiplier:availability,operatingMultiplier,totalMultiplier:availability*operatingMultiplier,
    windowHours:hours,windowCapacity:activeRate*hours/DAY_HOURS,capacityBounded,
    calculationMode:sourceMode,authority:factors.authority||'SIMULATED',
    formula:sourceMode==='CAPACITY_FACTOR_MODEL'
      ?'C_effective x A_equipment x A_power x A_inputs x E_technology x U_utilization x R_recovery x (1-M_maintenance) x (1-D_decline)'
      :'R_observed x A_equipment x A_power x A_inputs x E_technology x observed-baseline-adjustment; explicit rated capacity remains a ceiling',
    trace:{
      capacity,observedRate:num(input.observedRate),capacityIsExplicit:input.capacityIsExplicit===true,
      factors:{equipmentAvailability:factors.equipmentAvailability,powerAvailability:factors.powerAvailability,inputAvailability:factors.inputAvailability,technologyEfficiency:factors.technologyEfficiency},
      factorStatuses:clone(factors.statuses||{}),factorSources:clone(factors.sources||{}),availabilityMultiplier:availability,
      utilization,recovery,maintenance,decline,operatingMultiplier,observedAdjustmentMultiplier:observedAdjustment,
      capacityRate,observedRateCandidate,activeRate,windowHours:hours,windowCapacity:activeRate*hours/DAY_HOURS
    }
  };
  return result;
}
const API=Object.freeze({VERSION,DAY_HOURS,resolveFactors,calculate,normalizeAvailability,isSimulatedSource});
g.Omega=g.Omega||{};g.Omega.ResourceProductionCapacityContract=API;
g.OmegaResourceProductionCapacityContract=API;
})(typeof window!=='undefined'?window:globalThis);
