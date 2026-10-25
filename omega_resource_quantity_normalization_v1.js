/* OMEGA RESOURCE QUANTITY NORMALIZATION v1
 * Canonicalizes simulation quantities while preserving source values, units, and provenance.
 * Conversion assumptions are explicitly marked as gameplay normalization, never as observed facts.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const clone=(v)=>{if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);const o={};for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function')o[k]=clone(v[k]);return o;};
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const tok=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const CANONICAL_UNIT_BY_RESOURCE=Object.freeze({
 crude_oil:'BBL',natural_gas:'BCM',gold:'TROY_OUNCES',silver:'TROY_OUNCES',platinum:'TROY_OUNCES',
 diamond:'CARATS',ruby:'CARATS',uranium:'TONNES',uranium_oxide:'TONNES',u3o8:'TONNES'
});
function canonicalUnit(resourceId){
 const rid=tok(resourceId);
 return CANONICAL_UNIT_BY_RESOURCE[rid]||'TONNES';
}
function cleanUnit(unit){
 const u=String(unit??'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
 if(!u||['UNKNOWN','UNOBSERVED','NOT_RECORDED','UNIT_UNKNOWN','SIMULATION_RESOURCE_UNIT'].includes(u))return'UNIT_UNKNOWN';
 if(['T','TON','TONNE','TONNES','METRIC_TON','METRIC_TONS','METRIC_TONNE','METRIC_TONNES','TONNES_ORE','TONNES_GRAPHITE','TONNES_PER_DAY','TONNES_PER_YEAR','METRIC_TONNES_U3O8'].includes(u))return'TONNES';
 if(['KG','KGS','KILOGRAM','KILOGRAMS'].includes(u))return'KG';
 if(['G','GRAM','GRAMS'].includes(u))return'GRAMS';
 if(['LB','LBS','POUND','POUNDS','POUNDS_COPPER','POUNDS_U3O8'].includes(u))return'POUNDS';
 if(['SHORT_TON','SHORT_TONS','US_TON','US_TONS'].includes(u))return'SHORT_TONS';
 if(['LONG_TON','LONG_TONS','IMPERIAL_TON','IMPERIAL_TONS'].includes(u))return'LONG_TONS';
 if(['TROY_OUNCE','TROY_OZ','TROY_OUNCES','OZ_TROY'].includes(u))return'TROY_OUNCES';
 if(['OUNCE','OUNCES','OZ'].includes(u))return'OUNCES';
 if(['CARAT','CARATS'].includes(u))return'CARATS';
 if(['BBL','BBLS','BARREL','BARRELS','STOCK_TANK_BARRELS'].includes(u))return'BBL';
 if(['BCM','BILLION_CUBIC_METRES','BILLION_CUBIC_METERS'].includes(u))return'BCM';
 if(['BCF','BILLION_CUBIC_FEET'].includes(u))return'BCF';
 if(['MCM','MILLION_CUBIC_METRES','MILLION_CUBIC_METERS'].includes(u))return'MCM';
 if(['M3','CUBIC_METRE','CUBIC_METRES','CUBIC_METER','CUBIC_METERS'].includes(u))return'M3';
 if(['TONNES_U3O8','METRIC_TONNES_U3O8','TONNE_U3O8'].includes(u))return'TONNES';
 return u;
}
function factorToCanonical(resourceId, sourceUnit, targetUnit){
 const u=cleanUnit(sourceUnit),target=cleanUnit(targetUnit),rid=tok(resourceId);
 if(u===target)return{factor:1,method:'UNIT_ALREADY_CANONICAL'};
 if(u==='UNIT_UNKNOWN')return{factor:1,method:'SIMULATION_BASE_UNIT_ASSUMED'};
 const tonneToTarget={
   TONNES:1,KG:0.001,GRAMS:0.000001,POUNDS:1/2204.62262185,
   SHORT_TONS:0.90718474,LONG_TONS:1.0160469088,OUNCES:1/35273.96195,
   TROY_OUNCES:1/32150.7465686,CARATS:1/5000000
 };
 if(target==='TONNES'){
   if(tonneToTarget[u]!==undefined)return{factor:1/tonneToTarget[u],method:'MASS_UNIT_CONVERSION'};
   if(u==='BCM')return{factor:1,method:'UNIT_ALREADY_CANONICAL'};
   if(u==='METRIC_TONNES_U3O8')return{factor:1,method:'MASS_UNIT_CONVERSION'};
   if(u==='BBL'&&rid==='crude_oil')return{factor:1/7.33,method:'SIMULATED_CRUDE_OIL_DENSITY_CONVERSION'};
 }
 if(target==='TROY_OUNCES'){
   if(u==='TONNES')return{factor:32150.7465686,method:rid==='gold'||rid==='silver'||rid==='platinum'?'SIMULATED_COMMODITY_UNIT_CONVERSION':'MASS_UNIT_CONVERSION'};
   if(u==='KG')return{factor:32150.7465686/1000,method:'MASS_UNIT_CONVERSION'};
   if(u==='GRAMS')return{factor:1/31.1034768,method:'MASS_UNIT_CONVERSION'};
   if(u==='OUNCES')return{factor:0.911458333333,method:'OUNCE_TO_TROY_OUNCE'};
 }
 if(target==='CARATS'){
   if(u==='TONNES')return{factor:5000000,method:'MASS_UNIT_CONVERSION'};
   if(u==='KG')return{factor:5000,method:'MASS_UNIT_CONVERSION'};
   if(u==='GRAMS')return{factor:5,method:'MASS_UNIT_CONVERSION'};
 }
 if(target==='BBL'){
   if(u==='TONNES')return{factor:7.33,method:'SIMULATED_CRUDE_OIL_DENSITY_CONVERSION'};
   if(u==='M3')return{factor:6.28981077,method:'VOLUME_UNIT_CONVERSION'};
   if(u==='MCM')return{factor:1,method:'SIMULATION_BASE_UNIT_ASSUMED'};
 }
 if(target==='BCM'){
   if(u==='BCF')return{factor:0.028316846592,method:'VOLUME_UNIT_CONVERSION'};
   if(u==='MCM')return{factor:0.001,method:'VOLUME_UNIT_CONVERSION'};
   if(u==='M3')return{factor:1e-9,method:'VOLUME_UNIT_CONVERSION'};
 }
 // The simulation layer must be internally consistent even when historical source
 // labels describe ore mass while the gameplay ledger tracks the extracted commodity.
 // Preserve that mismatch as provenance and use a deterministic, simulation-only scale.
 return{factor:1,method:'SIMULATION_BASE_UNIT_ASSUMED'};
}
function normalizeQuantity(resourceId, quantity, unit, options={}){
 const value=num(quantity);
 const target=canonicalUnit(resourceId);
 const source=String(unit??'').trim()||'UNIT_UNKNOWN';
 if(value===null)return{quantity:null,unit:target,sourceQuantity:quantity,sourceUnit:source,method:'QUANTITY_UNAVAILABLE',version:VERSION,simulationOnly:options.simulationOnly!==false};
 const normalizedSource=cleanUnit(source);
 const conversion=factorToCanonical(resourceId,normalizedSource,target);
 const normalized=value*conversion.factor;
 return{
  quantity:Number.isFinite(normalized)?Number(normalized.toFixed(9)):null,
  unit:target,sourceQuantity:value,sourceUnit:source,normalizedSourceUnit:normalizedSource,
  method:conversion.method,version:VERSION,simulationOnly:options.simulationOnly!==false
 };
}
function normalizeAmountObject(object, resourceId, amountKey, unitKey, options={}){
 if(!object||typeof object!=='object'||Array.isArray(object))return object;
 if(object.quantityNormalization?.version===VERSION&&object.quantityNormalization?.field===amountKey)return object;
 const value=num(object[amountKey]);
 if(value===null)return object;
 const sourceUnit=object[unitKey]||object.unit||options.defaultUnit||'UNIT_UNKNOWN';
 const normalized=normalizeQuantity(resourceId,value,sourceUnit,{simulationOnly:options.simulationOnly!==false});
 const out={...object};
 out[amountKey]=normalized.quantity;
 out[unitKey]=normalized.unit;
 if(unitKey!=='unit'&&out.unit)out.unit=normalized.unit;
 out.quantityNormalization={...normalized,field:amountKey};
 return out;
}
function isSimulated(object){
 const status=String(object?.status||'').toUpperCase();
 return object?.simulationOnly===true||object?.authority==='SIMULATED'||object?.quantityAuthority==='SIMULATED'||
  object?.productionAuthority==='SIMULATED'||object?.stateAuthority==='SIMULATED'||status==='SIMULATED';
}
function normalizeMetricObject(object, resourceId, kind){
 if(!object||typeof object!=='object'||Array.isArray(object)||!isSimulated(object))return object;
 let out=clone(object);
 const rawUnit=out.unit||out.rateUnit||out.annualUnit||out.productionRateUnit||'UNIT_UNKNOWN';
 if(kind==='reserve'){
  if(num(out.quantity)!==null)out=normalizeAmountObject(out,resourceId,'quantity','unit',{simulationOnly:true});
  return out;
 }
 if(kind==='production'){
  if(num(out.rate)!==null){
   const sourceUnit=out.rateUnit||out.unit||rawUnit;
   const n=normalizeQuantity(resourceId,out.rate,sourceUnit,{simulationOnly:true});
   out.rate=n.quantity;out.rateUnit=n.unit+'_PER_DAY';out.unit=n.unit;
   out.rateNormalization={...n,field:'rate'};
  }
  if(num(out.annual)!==null){
   const sourceUnit=out.annualUnit||out.unit||rawUnit;
   const n=normalizeQuantity(resourceId,out.annual,sourceUnit,{simulationOnly:true});
   out.annual=n.quantity;out.annualUnit=n.unit+'_PER_YEAR';out.annualNormalization={...n,field:'annual'};
  }
  return out;
 }
 if(kind==='capacity'){
  for(const key of ['nominal','minimum','maximum','activeRate','dailyRate','productionRate','nominalCapacity','minimumCapacity','maximumCapacity']){
   if(num(out[key])===null)continue;
   const n=normalizeQuantity(resourceId,out[key],out.unit||out.rateUnit||rawUnit,{simulationOnly:true});
   out[key]=n.quantity;
   out[key+'Normalization']={...n,field:key};
   out.unit=n.unit;
  }
  if(out.unit&&out.rateUnit)out.rateUnit=canonicalUnit(resourceId)+'_PER_DAY';
  return out;
 }
 return out;
}
function normalizeSiteQuantities(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return clone(value);
 const row=clone(value);
 const resourceId=tok(row.resourceId||row.resourceTypeId||row.real?.resourceId||row.identity?.resourceTypeId||row.sourceSiteRecord?.resourceId||row.sourceSiteRecord?.resourceTypeId);
 if(!resourceId)return row;
 if(row.reserve?.status==='SIMULATED')row.reserve=normalizeMetricObject(row.reserve,resourceId,'reserve');
 if(row.simulation?.reserve)row.simulation.reserve=normalizeMetricObject({...row.simulation.reserve,status:row.simulation.reserve.status||'SIMULATED',simulationOnly:true},resourceId,'reserve');
 if(row.quantitative?.reserve?.status==='SIMULATED'){
  row.quantitative.reserve=normalizeMetricObject(row.quantitative.reserve,resourceId,'reserve');
 }
 if(row.quantitative?.production?.status==='SIMULATED'){
  row.quantitative.production=normalizeMetricObject(row.quantitative.production,resourceId,'production');
 }
 if(row.quantitative?.capacity?.status==='SIMULATED'){
  row.quantitative.capacity=normalizeMetricObject(row.quantitative.capacity,resourceId,'capacity');
 }
 if(row.simulation?.production){
  row.simulation.production=normalizeMetricObject({...row.simulation.production,status:row.simulation.production.status||'SIMULATED',simulationOnly:true},resourceId,'production');
 }
 if(row.simulation?.capacity){
  row.simulation.capacity=normalizeMetricObject({...row.simulation.capacity,status:row.simulation.capacity.status||'SIMULATED',simulationOnly:true},resourceId,'capacity');
 }
 for(const key of ['productionModel','capacity']){
  if(row[key]&&isSimulated(row[key]))row[key]=normalizeMetricObject(row[key],resourceId,'capacity');
 }
 if(num(row.simulationReserveQuantity)!==null&&!row.simulationReserveNormalization){
  const n=normalizeQuantity(resourceId,row.simulationReserveQuantity,row.simulationReserveUnit||row.unit||'UNIT_UNKNOWN',{simulationOnly:true});
  row.simulationReserveSourceQuantity=n.sourceQuantity;row.simulationReserveSourceUnit=n.sourceUnit;
  row.simulationReserveQuantity=n.quantity;row.simulationReserveUnit=n.unit;
  row.simulationReserveNormalization=n;
 }
 return row;
}
function normalizeSiteRecord(value){
 const row=normalizeSiteQuantities(value);
 if(!row||typeof row!=='object')return row;
 const resourceId=tok(row.resourceId||row.resourceTypeId||row.real?.resourceId||row.identity?.resourceTypeId||row.sourceSiteRecord?.resourceId||row.sourceSiteRecord?.resourceTypeId);
 if(!resourceId)return row;
 if(row.reserve?.status==='SIMULATED')row.reserve=normalizeMetricObject(row.reserve,resourceId,'reserve');
 return row;
}
const API=Object.freeze({VERSION,canonicalUnit,cleanUnit,normalizeQuantity,normalizeSiteQuantities,normalizeSiteRecord});
g.Omega=g.Omega||{};
g.Omega.ResourceQuantityNormalization=API;
g.OmegaResourceQuantityNormalization=API;
})(typeof window!=='undefined'?window:globalThis);
