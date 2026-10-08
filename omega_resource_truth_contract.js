/* OMEGA RESOURCE TRUTH CONTRACT v1
 * Field-level authority, measurement semantics, provenance and precedence.
 * This module does not invent data and does not convert units.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const AUTHORITY=Object.freeze({OBSERVED:'OBSERVED',MODELED:'MODELED',SIMULATED:'SIMULATED',UNOBSERVED:'UNOBSERVED'});
const MEASUREMENT_BASIS=Object.freeze([
 'GEOLOGICAL_ENDOWMENT','ORE_MASS','CONTAINED_COMMODITY','MINERAL_RESOURCE','MINERAL_RESERVE',
 'RECOVERABLE_RESOURCE','ECONOMIC_RESERVE','EXTRACTABLE_QUANTITY','FIELD_RESOURCE','PETROLEUM_RESERVE'
]);
const UNIT_FAMILY=Object.freeze({
 TONNES:['T','TON','TONS','TONNE','TONNES','MT','MILLION TONNES','METRIC TON','METRIC TONS'],
 TROY_OUNCES:['OZ','OZ.','OZT','TROY OZ','TROY OUNCE','TROY OUNCES'],
 BBL:['BBL','BBLS','BARREL','BARRELS'], TCF:['TCF'], BCM:['BCM'], BCF:['BCF'], MCM:['MCM'], MCF:['MCF'],
 PERCENT:['%','PERCENT'], GT:['G/T','G PER T','GRAMS/T','GRAMS PER TONNE'], MG_L:['MG/L'], API:['API','API GRAVITY'],
 CARATS:['CARAT','CARATS','CT']
});
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const token=v=>String(v??'').trim().toUpperCase();
const unitFamily=v=>{const u=token(v);for(const [k,vals] of Object.entries(UNIT_FAMILY))if(vals.some(x=>token(x)===u))return k;return null;};
const isAuthority=v=>Object.values(AUTHORITY).includes(token(v));
const isBasis=v=>MEASUREMENT_BASIS.includes(token(v));
const rank=v=>({OBSERVED:3,MODELED:2,SIMULATED:1,UNOBSERVED:0}[token(v)]??0);
function measurement(value, meta={}){
 const authority=token(meta.authority||AUTHORITY.UNOBSERVED);
 const out={quantity:Number.isFinite(Number(value))?Number(value):null,unit:meta.unit??null,measurementBasis:meta.measurementBasis?token(meta.measurementBasis):null,commodity:meta.commodity?token(meta.commodity):null,effectiveDate:meta.effectiveDate??null,status:authority,authority,provenance:clone(meta.provenance||null),sourceDatasetId:meta.sourceDatasetId??null,sourcePath:meta.sourcePath??null,sourceRecordId:meta.sourceRecordId??null,sourceAuthority:meta.sourceAuthority??null};
 if(!isAuthority(authority))out.status='UNOBSERVED',out.authority='UNOBSERVED';
 return out;
}
function validateMeasurement(m, opts={}){
 const x=measurement(m?.quantity,m||{});
 const errors=[];
 if(x.quantity===null && x.authority!==AUTHORITY.UNOBSERVED)errors.push('QUANTITY_REQUIRED');
 if(x.quantity!==null && !x.unit)errors.push('UNIT_REQUIRED');
 if(x.quantity!==null && !isBasis(x.measurementBasis))errors.push('MEASUREMENT_BASIS_REQUIRED');
 if(x.quantity!==null && !x.commodity)errors.push('COMMODITY_REQUIRED');
 if(x.authority!==AUTHORITY.UNOBSERVED && !x.sourceDatasetId)errors.push('SOURCE_DATASET_REQUIRED');
 if(opts.expectedCommodity&&x.commodity&&token(opts.expectedCommodity)!==x.commodity)errors.push('COMMODITY_MISMATCH');
 if(opts.allowedBases?.length&&x.measurementBasis&&!opts.allowedBases.map(token).includes(x.measurementBasis))errors.push('MEASUREMENT_BASIS_INCOMPATIBLE');
 if(opts.expectedUnitFamily&&x.unit&&unitFamily(x.unit)!==token(opts.expectedUnitFamily))errors.push('UNIT_FAMILY_MISMATCH');
 return {valid:errors.length===0,errors,measurement:x};
}
function resolveQuantity(candidates, opts={}){
 const list=(Array.isArray(candidates)?candidates:[candidates]).filter(Boolean).map(x=>measurement(x?.quantity??x?.value,x));
 const valid=list.map(x=>validateMeasurement(x,opts));
 const compatible=valid.filter(x=>x.valid && x.measurement.quantity!==null);
 if(!compatible.length){
   const hadValue=valid.some(x=>x.measurement.quantity!==null);
   return {status:hadValue?'FAIL_CLOSED':'UNOBSERVED',authority:AUTHORITY.UNOBSERVED,measurement:null,rejected:valid.filter(x=>!x.valid).map(x=>x.errors)};
 }
 compatible.sort((a,b)=>rank(b.measurement.authority)-rank(a.measurement.authority));
 const winner=compatible[0].measurement;
 return {status:winner.authority,authority:winner.authority,measurement:clone(winner),rejected:valid.filter(x=>!x.valid).map(x=>x.errors)};
}
function provenance(datasetId,path,recordId,authority,effectiveDate){
 return {sourceDatasetId:datasetId??null,sourcePath:path??null,sourceRecordId:recordId??null,sourceAuthority:authority??null,effectiveDate:effectiveDate??null};
}
function assertSiteIdentity(site){
 const errors=[];
 for(const k of ['siteId','countryId','resourceId','siteName'])if(!String(site?.[k]??'').trim())errors.push(k.toUpperCase()+'_REQUIRED');
 return {valid:errors.length===0,errors};
}
function classify(value,authority,extra={}){
 const a=token(authority||AUTHORITY.UNOBSERVED);
 return {value:value??null,authority:isAuthority(a)?a:AUTHORITY.UNOBSERVED,status:isAuthority(a)?a:AUTHORITY.UNOBSERVED,...clone(extra)};
}
const API=Object.freeze({VERSION,AUTHORITY,MEASUREMENT_BASIS,UNIT_FAMILY,unitFamily,isAuthority,isBasis,measurement,validateMeasurement,resolveQuantity,provenance,assertSiteIdentity,classify,rank});
g.OmegaResourceTruthContract=API;g.Omega=g.Omega||{};g.Omega.ResourceTruthContract=API;
})(typeof globalThis!=='undefined'?globalThis:window);
