/* OMEGA RESOURCE PRODUCTION MODEL v2.0.0
 * Stateful production, explicit units, quality semantics, multi-commodity deposits,
 * and OBSERVED/SIMULATED authority separation.
 */
(function(g){
'use strict';
const VERSION='2.1.0',DAY=24,HORIZON=150000;
const UNITS={
 TONNES:['T','TON','TONS','TONNE','TONNES','MT','METRIC_TON','METRIC_TONS'],
 KG:['KG','KILOGRAM','KILOGRAMS'],GRAMS:['G','GRAM','GRAMS'],
 TROY_OZ:['OZ','OZT','OUNCE','OUNCES','TROY_OZ','TROY_OUNCE','TROY_OUNCES'],
 BBL:['BBL','BBLS','BARREL','BARRELS'],TCF:['TCF'],BCF:['BCF'],BCM:['BCM'],MCM:['MCM'],MCF:['MCF'],
 PERCENT:['%','PERCENT'],PPM:['PPM'],MG_L:['MG/L'],G_T:['G/T'],API_GRAVITY:['API','API_GRAVITY']
};
const clone=v=>v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(clone):Object.fromEntries(Object.entries(v).filter(([k])=>k!=='__proto__'&&k!=='constructor').map(([k,x])=>[k,clone(x)]));
const num=v=>{if(typeof v==='number'&&Number.isFinite(v))return v;const m=String(v??'').replace(/,/g,'').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
const rid=v=>String(v??'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();
const cid=v=>String(v??'').trim().toUpperCase();
const unit=u=>{const x=String(u??'').trim().toUpperCase();for(const[k,a]of Object.entries(UNITS))if(a.includes(x))return k;return null};
const scale=s=>{const x=String(s||'').toLowerCase();return x.includes('trillion')?1e12:x.includes('billion')?1e9:x.includes('million')?1e6:x.includes('thousand')?1e3:1};
function measure(text,allowed){const m=String(text??'').match(new RegExp('([0-9]+(?:\\.[0-9]+)?)\\s*(trillion|billion|million|thousand)?\\s*('+allowed.join('|')+')\\b','i'));if(!m)return{status:'UNOBSERVED',value:null,unit:null,raw:String(text??'')};return{status:'OBSERVED',value:Number(m[1])*scale(m[2]),unit:unit(m[3]),sourceUnit:m[3].toUpperCase(),raw:String(text??'')}}
function parseReserve(text,resourceId,targetUnit){
 const external=g.Omega?.ResourceRealism?.parseReserve;
 if(typeof external==='function'){
   const x=external(text,resourceId);
   if(x?.status){
     const resource=rid(resourceId);
     const detectedUnit=String(x.unit||'').toUpperCase();
     const target=String(targetUnit||(
       resource==='natural_gas'?'BCM':
       (['gold','silver','platinum'].includes(resource)&&detectedUnit!=='TONNES'?'TROY_OZ':detectedUnit)
     )).toUpperCase();
     const convert=(value,source,targetUnitName)=>{
       const v=Number(value);if(!Number.isFinite(v))return null;
       if(source===targetUnitName)return v;
       if(source==='TCF'&&targetUnitName==='BCM')return v*28.316846592;
       if(source==='BCF'&&targetUnitName==='BCM')return v*0.028316846592;
       if(source==='MCM'&&targetUnitName==='BCM')return v*0.001;
       if(source==='MCF'&&targetUnitName==='BCM')return v*0.000000028316846592;
       if((source==='METRIC_TONS'||source==='TONNES')&&targetUnitName==='TROY_OZ')return v*32150.74656862745;
       if((source==='TROY_OUNCES'||source==='TROY_OZ')&&targetUnitName==='TONNES')return v/32150.74656862745;
       return v;
     };
     const value=convert(x.value,detectedUnit,target);
     return{...x,value,unit:target,targetUnit:target};
   }
 }
 const r=rid(resourceId),t=String(text??''),u=r==='crude_oil'?UNITS.BBL:r==='natural_gas'?[...UNITS.TCF,...UNITS.BCF,...UNITS.BCM,...UNITS.MCM,...UNITS.MCF]:r==='gold'?[...UNITS.TROY_OZ,...UNITS.TONNES]:UNITS.TONNES;
 const x=measure(t,u);if(x.status!=='OBSERVED')return{status:'UNOBSERVED',value:null,unit:targetUnit||null,raw:t};
 const target=targetUnit||(r==='natural_gas'?'BCM':(r==='gold'&&x.unit!=='TONNES'?'TROY_OZ':x.unit));
 let value=x.value;
 if(x.unit==='TCF'&&target==='BCM')value*=28.316846592;
 else if(x.unit==='BCF'&&target==='BCM')value*=0.028316846592;
 else if(x.unit==='MCM'&&target==='BCM')value*=0.001;
 else if(x.unit==='MCF'&&target==='BCM')value*=0.000000028316846592;
 else if(x.unit==='TONNES'&&target==='TROY_OZ')value*=32150.74656862745;
 return{...x,value,unit:target,targetUnit:target};
}
const pick=(o,keys)=>{for(const k of keys)if(o?.[k]!==undefined&&o?.[k]!==null&&o?.[k]!=='')return o[k];return null};
const frac=v=>{const n=num(v);return n===null?null:n>1?n/100:n};
function productionModel(raw,reserve,resourceId){
 const p=raw?.productionModel&&typeof raw.productionModel==='object'?raw.productionModel:{};
 const targetResourceId=rid(resourceId??raw?.resourceId??raw?.resourceTypeId??raw?.resourceTypeKey??raw?.resId);
 const petroleum=targetResourceId==='crude_oil'||targetResourceId==='natural_gas';
 const declinePolicy=petroleum?'FIELD_SPECIFIC_DECLINE':'SITE_ENGINEERING_CAPACITY_DEPLETION';
 const classificationFramework=petroleum?'SPE_PRMS_2018':'CRIRSCO_STYLE';
 const read=(scope,keys)=>pick(scope,keys);
 const nominal= num(read(p,['nominalRate','nominalCapacity'])??read(raw,['nominalRate','nominalCapacity']));
 const observedRate=num(read(p,['productionRate','dailyRate','outputRate'])??read(raw,['productionRate','dailyRate','outputRate']));
 const min=num(read(p,['minimumRate','minimumCapacity','minRate','minCapacity'])??read(raw,['minimumRate','minimumCapacity','minRate','minCapacity']));
 const max=num(read(p,['maximumRate','maximumCapacity','maxRate','maxCapacity'])??read(raw,['maximumRate','maximumCapacity','maxRate','maxCapacity']));
 const utilization=frac(read(p,['utilization','utilisation'])??read(raw,['utilization','utilisation']))??.85;
 const recovery=frac(read(p,['recovery'])??read(raw,['recovery']))??1;
 const decline=frac(read(p,['decline','declineRate'])??read(raw,['decline','declineRate']))??0;
 const maintenance=frac(read(p,['maintenance','maintenanceFraction','maintenanceRate'])??read(raw,['maintenance','maintenanceFraction','maintenanceRate']))??0;
 const cost=num(read(p,['operatingCost','operatingCostPerUnit'])??read(raw,['operatingCost','operatingCostPerUnit']));
 const horizon=num(read(p,['simulationHorizonDays'])??read(raw,['simulationHorizonDays']))||HORIZON;
 const observed=nominal!==null||observedRate!==null||min!==null||max!==null;
 const simulatedRate=reserve>0?reserve/horizon:null;
 const nominalBase=nominal??observedRate??simulatedRate;
 const technology=g.Omega?.ResourceResearchRuntime?.getEngineeringEffect?.(raw?.countryId||raw?.countryCode||null,raw?.siteId||raw?.siteReferenceKey||raw?.id||null,targetResourceId,raw?.siteType||raw?.assetType||null)||{capacityMultiplier:1,recoveryAdd:0,utilizationAdd:0,maintenanceMultiplier:1,declineMultiplier:1,outputMultiplier:1,technologies:[]};
 const clamp01=v=>Math.min(1,Math.max(0,Number(v)||0));
 const finalUtilization=clamp01(utilization+(Number(technology.utilizationAdd)||0));
 const finalRecovery=clamp01(recovery+(Number(technology.recoveryAdd)||0));
 const finalMaintenance=clamp01(maintenance*Math.max(.1,Number(technology.maintenanceMultiplier)||1));
 const finalDecline=clamp01(decline*Math.max(.1,Number(technology.declineMultiplier)||1));
 const capacityFactor=Math.max(.1,Number(technology.capacityMultiplier)||1),outputFactor=Math.max(.1,Number(technology.outputMultiplier)||1);
 const baseNominal=nominal??observedRate??simulatedRate;
 const finalNominal=baseNominal===null?null:baseNominal*capacityFactor;
 const derivedMinBase=min!==null?min:(observedRate!==null?observedRate*.55:(nominalBase!==null?nominalBase*.55:null));
 const derivedMaxBase=max!==null?max:(observedRate!==null?observedRate*1.25:(nominalBase!==null?nominalBase*1.3:null));
 const finalMin=derivedMinBase===null?null:derivedMinBase*capacityFactor;
 const finalMax=derivedMaxBase===null?null:derivedMaxBase*capacityFactor;
 const utilizationRatio=utilization>0?finalUtilization/utilization:1;
 const recoveryRatio=recovery>0?finalRecovery/recovery:1;
 const maintenanceRatio=maintenance<1?(1-finalMaintenance)/(1-maintenance):1;
 const declineRatio=decline<1?(1-finalDecline)/(1-decline):1;
 const baselineRate=observedRate!==null?observedRate*capacityFactor*outputFactor*utilizationRatio*recoveryRatio*maintenanceRatio*declineRatio:(finalNominal===null?null:Math.max(0,finalNominal*finalUtilization*(1-finalMaintenance)*(1-finalDecline)));
 const activeRate=baselineRate;
 return{nominalCapacity:finalNominal,minimumCapacity:finalMin,maximumCapacity:finalMax,utilization:finalUtilization,recovery:finalRecovery,decline:finalDecline,maintenance:finalMaintenance,operatingCost:cost,observedRate,simulatedRate,activeRate,authority:observed?'OBSERVED':'SIMULATED',dataStatus:observed?'AVAILABLE':'UNOBSERVED',rangeDataStatus:min!==null&&max!==null?'OBSERVED':observedRate!==null?'DERIVED_FROM_OBSERVED_RATE':'UNOBSERVED',simulationHorizonDays:horizon,modelVersion:VERSION,declinePolicy,universalDeclineRateAllowed:false,classificationFramework,technologyAdjusted:Array.isArray(technology.technologies)&&technology.technologies.length>0,technologyEffects:clone(technology)};
}
function quality(raw,resourceId){
 const external=g.Omega?.ResourceRealism?.quality;
 if(typeof external==='function'){const q=external(raw,resourceId);if(q)return q;}
 return{grade:pick(raw,['grade']),oreGrade:pick(raw,['oreGrade']),concentration:pick(raw,['concentration']),assay:pick(raw,['assay']),metalContent:pick(raw,['metalContent']),purity:pick(raw,['purity']),APIGravity:pick(raw,['APIGravity','apiGravity','api']),gradeStatus:pick(raw,['grade','oreGrade','concentration','assay','metalContent'])===null?'UNOBSERVED':'OBSERVED',purityStatus:pick(raw,['purity'])===null?'UNOBSERVED':'OBSERVED',apiGravityStatus:pick(raw,['APIGravity','apiGravity','api'])===null?'UNOBSERVED':'OBSERVED',semantics:{resourceId:rid(resourceId),grade:'ORE_OR_FEED_COMPOSITION',purity:'REFINED_OR_PRODUCT_COMPOSITION',APIGravity:'PETROLEUM_LIQUID_PROPERTY'}}
}
function normalizeIdentityRegistry(identity){
 if(identity?.listOccurrences)return identity;
 const advanced=identity?.occurrences instanceof Map?identity:null;
 if(!advanced)return identity;
 const e=g.ResourceMinistryEngine;
 const rawDeposits=Array.isArray(e?.deposits)?e.deposits:[];
 const toOccurrence=occ=>{