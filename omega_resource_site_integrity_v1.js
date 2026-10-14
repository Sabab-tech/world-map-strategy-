/* OMEGA RESOURCE SITE INTEGRITY CONTRACT V1
 * One deterministic identity/quantitative registry contract for canonical and additive site records.
 * This module validates existing data; it does not invent observations or rewrite source datasets.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const FIELDS=Object.freeze({
  reserve:{quantity:null,unit:null,year:null,basis:null},
  production:{annual:null,rate:null,unit:null,annualUnit:null,year:null,period:null,basis:null},
  grade:{value:null,unit:null,year:null,metric:null,basis:null},
  recovery:{value:null,unit:'PERCENT',year:null,period:null,basis:null},
  throughput:{value:null,unit:null,year:null,period:null,basis:null},
  purity:{value:null,unit:null,year:null,metric:null,basis:null},
  capacity:{nominal:null,minimum:null,maximum:null,unit:null,period:null,basis:null}
});
const clone=(v,seen=new WeakMap())=>{
  if(v===null||typeof v!=='object')return v;
  if(seen.has(v))return seen.get(v);
  if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
  const o={};seen.set(v,o);
  for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);
  return o;
};
const canonCountry=v=>String(v??'').trim().toUpperCase();
const canonResource=v=>String(v??'').replace(/^RES_TYPE:/i,'').trim().toLowerCase().replace(/[\s-]+/g,'_');
const normName=v=>String(v??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const hasValue=v=>v!==null&&v!==undefined&&v!=='';
const NUMERIC_KEYS=Object.freeze({
 reserve:['quantity'],production:['annual','rate'],grade:['value'],recovery:['value'],
 throughput:['value'],purity:['value'],capacity:['nominal','minimum','maximum']
});
const UNKNOWN=new Set(['UNOBSERVED','UNQUANTIFIED','NOT_APPLICABLE','UNKNOWN','MISSING']);
const KNOWN_STATUS=new Set(['OBSERVED','SIMULATED','UNOBSERVED','UNQUANTIFIED','NOT_APPLICABLE','UNKNOWN','DERIVED','ESTIMATED','INFERRED','PARTIAL','REPORTED_TEXT_ONLY']);
function normalizeQuantitative(source){
  const q=source&&typeof source==='object'?clone(source):{};
  for(const [field,shape] of Object.entries(FIELDS)){
    const value=q[field]&&typeof q[field]==='object'?q[field]:{};
    q[field]={...clone(shape),...value};
    q[field].status=String(q[field].status||'UNOBSERVED').trim().toUpperCase();
    for(const key of NUMERIC_KEYS[field]){
      const v=q[field][key];
      if(v===''||v===undefined)q[field][key]=null;
    }
  }
  q.reportedMetrics=q.reportedMetrics&&typeof q.reportedMetrics==='object'?q.reportedMetrics:{};
  q.quantitativeProvenance=q.quantitativeProvenance&&typeof q.quantitativeProvenance==='object'?q.quantitativeProvenance:{};
  q.completeness=q.completeness&&typeof q.completeness==='object'?q.completeness:{};
  for(const field of Object.keys(FIELDS))q.completeness[field]=q[field].status;
  const numericKnown=Object.entries(NUMERIC_KEYS).some(([field,keys])=>keys.some(key=>finite(q[field][key])));
  q.completeness.overall=numericKnown?'PARTIAL':'IDENTITY_AND_LOCATION_ONLY';
  return q;
}
function normalizeSiteRecord(raw){
  const row=clone(raw||{});
  const country=canonCountry(row.countryId||row.identity?.countryIso3||row.countryCode);
  const resource=canonResource(row.resourceId||row.identity?.resourceTypeId||row.resourceTypeId||row.resourceTypeKey);
  row.siteId=String(row.siteId||row.id||'').trim();
  row.countryId=country;
  row.identity={...(row.identity||{}),countryIso3:canonCountry(row.identity?.countryIso3||country)};
  if(resource&&!row.identity.resourceTypeId)row.identity.resourceTypeId=resource;
  if(resource&&!row.resourceId)row.resourceId=resource;
  row.quantitative=normalizeQuantitative(row.quantitative);
  row.map={...(row.map||{}),markerEligible:row.map?.markerEligible!==false,countryIsolationKey:canonCountry(row.map?.countryIsolationKey||country)};
  row.runtime={...(row.runtime||{}),identityAuthority:row.runtime?.identityAuthority||'SITE_REFERENCE',
    quantityAuthority:row.runtime?.quantityAuthority||'SIMULATION_RUNTIME',
    productionAuthority:row.runtime?.productionAuthority||'SIMULATION_RUNTIME',
    qualityAuthority:row.runtime?.qualityAuthority||'OBSERVED_OR_EXPLICITLY_UNOBSERVED',
    countryWarehouseId:row.runtime?.countryWarehouseId||('WH-'+country+'-RAW'),
    requiresSiteSpecificRoute:row.runtime?.requiresSiteSpecificRoute!==false,
    requiresFactoryBinding:row.runtime?.requiresFactoryBinding!==false};
  return row;
}
function isAlias(row,aliasMap={}){
  const id=String(row?.siteId||'');
  return String(row?.runtime?.aliasOfSiteId||row?.map?.aliasOfSiteId||row?.identity?.aliasOfSiteId||row?.identity?.aliasOf||aliasMap[id]||'').trim()||null;
}
function siteEvidence(row,q,field){
  const fieldValue=q?.[field]||{};
  const fieldProv=fieldValue.provenance||fieldValue.sourceReference||null;
  const qp=q?.quantitativeProvenance||{};
  const sources=[
    fieldProv?.url,fieldProv?.sourceUrl,fieldProv?.source,fieldProv?.sourceId,
    qp?.sourceUrl,qp?.url,qp?.sourceReference,qp?.sourceId,
    row?.sourceReference?.url,row?.sourceReference?.sourcePath,
    ...(Array.isArray(row?.sourceReference?.evidence)?row.sourceReference.evidence.map(x=>x?.url):[]),
    ...(Array.isArray(row?.observedFacts)?row.observedFacts.map(x=>x?.sourceUrl||x?.url):[]),
    ...(Array.isArray(row?.sources)?row.sources.map(x=>x?.url||x?.sourceUrl):[]),
    row?.researchFacts?.sourceUrl,row?.researchFacts?.source
  ];
  return sources.some(v=>hasValue(v)&&String(v).trim()!=='');
}
function authorityDeclared(row,q,field){
  const v=q?.[field]||{};
  const vals=[
    v.authority,v.provenance?.authority,v.sourceAuthority,
    q?.quantitativeProvenance?.authority,
    field==='reserve'?row?.runtime?.quantityAuthority:
      field==='production'?row?.runtime?.productionAuthority:row?.runtime?.qualityAuthority,
    row?.runtime?.quantityAuthority,row?.runtime?.productionAuthority,row?.runtime?.qualityAuthority,
    row?.sourceReference?.metricAuthority,row?.sourceReference?.sourceDatasetAuthority
  ].filter(hasValue).map(x=>String(x).toUpperCase());
  return vals.some(x=>/SIMULATED|SCENARIO|UNOBSERVED|UNQUANTIFIED|OBSERVED|RESEARCH|REPORTED|LEGACY/.test(x));
}
function unitFactorToBase(unitText){
  const s=String(unitText??'').toUpperCase().replace(/[\s-]+/g,'_');
  if(!s)return null;
  // All rate/unit factors below convert into a consistent base unit for cross-field checks.
  const gas=[
    [/^(?:MMCF|MILLION_CUBIC_FEET)(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/,0.001],
    [/^(?:MCF|THOUSAND_CUBIC_FEET)(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/,0.000001],
    [/^BCF(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/,1],
    [/^TCF(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/,1000],
    [/^BCM(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/,35.3146667215],
    [/^MCM(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/,0.0353146667215]
  ];
  for(const [re,factor] of gas)if(re.test(s))return{family:'GAS_VOLUME',factor};
  if(/^(?:TONNES?|TONS?|METRIC_TONNES?|METRIC_TONS?|TONNES?_ORE|TONS?_ORE)(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/.test(s))return{family:'MASS',factor:1};
  if(/^(?:KILOGRAMS?|KG)(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/.test(s))return{family:'MASS',factor:0.001};
  if(/^(?:GRAMS?|G)(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/.test(s))return{family:'MASS',factor:0.000001};
  if(/^(?:TROY_)?OUNCES?|TROY_OZS?|OZT(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/.test(s))return{family:'PRECIOUS_MASS',factor:1};
  if(/^(?:CARATS?|CT)(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/.test(s))return{family:'CARAT',factor:1};
  if(/^(?:BBL|BBLS|BARRELS?)(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/.test(s))return{family:'LIQUID_VOLUME',factor:1};
  if(/^(?:LITRES?|L)(?:_PER_DAY|_PER_YEAR|_DAILY|_ANNUAL|_YEARLY)?$/.test(s))return{family:'LIQUID_VOLUME',factor:0.001};
  return null;
}
function hasPerDay(unit){return /(?:_PER_DAY|_DAILY|\/DAY|_DAY)$/.test(String(unit??'').toUpperCase().replace(/[\s-]+/g,'_'))}
function compatibleAnnualProduction(production,tolerance=0.01){
  const rate=production?.rate,annual=production?.annual,rateUnit=production?.unit,annualUnit=production?.annualUnit;
  if(!finite(rate)||!finite(annual)||!rateUnit||!annualUnit)return{status:'NOT_CHECKABLE',reason:'RATE_ANNUAL_OR_UNIT_MISSING'};
  const r=unitFactorToBase(rateUnit),a=unitFactorToBase(annualUnit);
  if(!r||!a||r.family!==a.family||!hasPerDay(rateUnit))return{status:'NOT_CHECKABLE',reason:'UNIT_FAMILY_OR_PERIOD_UNSUPPORTED'};
  const expected=rate*r.factor*365/a.factor;
  const relative=Math.abs(expected-annual)/Math.max(Math.abs(expected),Math.abs(annual),1e-12);
  return{status:relative<=tolerance?'PASS':'FAIL',expectedAnnual:expected,actualAnnual:annual,relativeError:relative,rateUnit,annualUnit};
}
function auditSiteRecord(row,options={}){
  const errors=[],warnings=[];
  const add=(severity,code,field,detail)=>({severity,code,siteId:String(row?.siteId||row?.id||''),field:field||null,detail:detail||null});
  const issue=(severity,code,field,detail)=> (severity==='ERROR'?errors:warnings).push(add(severity,code,field,detail));
  const siteId=String(row?.siteId||row?.id||'').trim();
  const country=canonCountry(row?.countryId||row?.identity?.countryIso3||row?.countryCode);
  const iso=canonCountry(row?.identity?.countryIso3);
  const resource=canonResource(row?.resourceId||row?.identity?.resourceTypeId||row?.resourceTypeId||row?.resourceTypeKey);
  if(!siteId)issue('ERROR','SITE_ID_MISSING','siteId');
  else if(!/^SITE_[A-Z]{3}_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(siteId))issue('ERROR','SITE_ID_FORMAT_INVALID','siteId',{siteId});
  if(!/^[A-Z]{3}$/.test(country))issue('ERROR','COUNTRY_ISO3_INVALID','countryId',{country});
  if(iso!==country)issue('ERROR','IDENTITY_COUNTRY_MISMATCH','identity.countryIso3',{expected:country,actual:iso});
  if(!resource)issue('ERROR','RESOURCE_ID_MISSING','identity.resourceTypeId');
  if(row?.resourceId&&row?.identity?.resourceTypeId&&canonResource(row.resourceId)!==canonResource(row.identity.resourceTypeId))
    issue('ERROR','RESOURCE_IDENTITY_MISMATCH','resourceId',{topLevel:row.resourceId,identity:row.identity.resourceTypeId});
  if(row?.map?.countryIsolationKey&&canonCountry(row.map.countryIsolationKey)!==country)
    issue('ERROR','MARKER_COUNTRY_MISMATCH','map.countryIsolationKey',{expected:country,actual:row.map.countryIsolationKey});
  if(row?.location?.countryBoundaryKey&&canonCountry(row.location.countryBoundaryKey)!==country)
    issue('ERROR','COORDINATE_COUNTRY_MISMATCH','location.countryBoundaryKey',{expected:country,actual:row.location.countryBoundaryKey});
  const loc=row?.location?.coordinates||row?.coordinates||{};
  const lat=loc.lat??loc.latitude,lng=loc.lng??loc.lon??loc.longitude;
  if(!hasValue(lat)||!hasValue(lng)||!Number.isFinite(Number(lat))||Number(lat)<-90||Number(lat)>90||!Number.isFinite(Number(lng))||Number(lng)<-180||Number(lng)>180)
    issue('ERROR','COORDINATES_INVALID','location.coordinates',{lat:lat??null,lng:lng??null});
  const countryRefs=[
    ['logistics.warehouseCountryId',row?.logistics?.warehouseCountryId],
    ['logistics.transport.originCountryId',row?.logistics?.transport?.originCountryId],
    ['logistics.transport.destinationCountryId',row?.logistics?.transport?.destinationCountryId],
    ['simulation.factoryBinding.countryId',row?.simulation?.factoryBinding?.countryId]
  ];
  for(const [field,value] of countryRefs)if(hasValue(value)&&canonCountry(value)!==country)
    issue('ERROR','CROSS_COUNTRY_PIPELINE_BINDING',field,{expected:country,actual:value});
  const q=normalizeQuantitative(row?.quantitative);
  for(const field of Object.keys(FIELDS)){
    const v=q[field],status=String(v.status||'UNOBSERVED').toUpperCase();
    if(!KNOWN_STATUS.has(status))issue('ERROR','QUANTITATIVE_STATUS_INVALID','quantitative.'+field+'.status',{status});
    for(const key of NUMERIC_KEYS[field]){
      const value=v[key];
      if(value!==null&&value!==undefined&&value!==''&&!finite(value))
        issue('ERROR','QUANTITATIVE_NUMERIC_INVALID','quantitative.'+field+'.'+key,{value});
      if(UNKNOWN.has(status)&&value!==null&&value!==undefined&&value!=='')
        issue('ERROR','UNKNOWN_VALUE_NOT_NULL','quantitative.'+field+'.'+key,{status,value});
      if(['OBSERVED','SIMULATED','DERIVED','ESTIMATED','INFERRED'].includes(status)&&value!==null&&value!==undefined&&value!==''){
        if(typeof value!=='number'||!Number.isFinite(value))
          issue('ERROR','QUANTITATIVE_VALUE_NOT_NUMERIC','quantitative.'+field+'.'+key,{status,value});
      }
      if(typeof value==='number'&&Number.isFinite(value)&&['quantity','annual','rate','nominal','minimum','maximum'].includes(key)&&value<0)
        issue('ERROR','QUANTITATIVE_NEGATIVE','quantitative.'+field+'.'+key,{value});
    }
    const numeric=NUMERIC_KEYS[field].some(key=>finite(v[key]));
    if(numeric&&['OBSERVED','SIMULATED','DERIVED','ESTIMATED','INFERRED'].includes(status)){
      const units=field==='production'?(v.rate!==null?v.unit:v.annualUnit):v.unit;
      if(!hasValue(units))issue('ERROR','QUANTITATIVE_UNIT_MISSING','quantitative.'+field+'.unit',{status});
      if(status==='OBSERVED'&&!siteEvidence(row,q,field))
        issue('ERROR','OBSERVED_WITHOUT_PROVENANCE','quantitative.'+field,{status});
      if(status!=='OBSERVED'&&!authorityDeclared(row,q,field))
        issue('ERROR','AUTHORITY_NOT_DECLARED','quantitative.'+field,{status});
    }
  }
  const cap=q.capacity;
  if([cap.minimum,cap.nominal,cap.maximum].every(finite)&&!(cap.minimum<=cap.nominal&&cap.nominal<=cap.maximum))
    issue('ERROR','CAPACITY_ORDER_INVALID','quantitative.capacity',{minimum:cap.minimum,nominal:cap.nominal,maximum:cap.maximum});
  const rec=q.recovery;if(finite(rec.value)&&/PERCENT|%/i.test(String(rec.unit||''))&&(rec.value<0||rec.value>100))
    issue('ERROR','RECOVERY_PERCENT_OUT_OF_RANGE','quantitative.recovery.value',{value:rec.value});
  const purity=q.purity;if(finite(purity.value)&&/PERCENT|%/i.test(String(purity.unit||''))&&(purity.value<0||purity.value>100))
    issue('ERROR','PURITY_PERCENT_OUT_OF_RANGE','quantitative.purity.value',{value:purity.value});
  const annualCheck=compatibleAnnualProduction(q.production);
  if(annualCheck.status==='FAIL')
    issue('ERROR','DAILY_ANNUAL_PRODUCTION_UNIT_MISMATCH','quantitative.production',{expectedAnnual:annualCheck.expectedAnnual,actualAnnual:annualCheck.actualAnnual,rateUnit:annualCheck.rateUnit,annualUnit:annualCheck.annualUnit,relativeError:annualCheck.relativeError});
  const alias=isAlias(row,options.aliasMap||{});
  if(alias){
    if(alias===siteId)issue('ERROR','ALIAS_SELF_REFERENCE','runtime.aliasOfSiteId',{target:alias});
    if(row?.operation?.commercialExtraction!==false)issue('ERROR','ALIAS_EXECUTION_NOT_DISABLED','operation.commercialExtraction',{aliasOfSiteId:alias,commercialExtraction:row?.operation?.commercialExtraction});
    if(row?.map?.markerEligible!==false)issue('ERROR','ALIAS_MARKER_NOT_DISABLED','map.markerEligible',{aliasOfSiteId:alias,markerEligible:row?.map?.markerEligible});
  }
  const numericObserved=Object.keys(FIELDS).some(field=>q[field].status==='OBSERVED'&&NUMERIC_KEYS[field].some(key=>finite(q[field][key])));
  if(numericObserved&&!siteEvidence(row,q,Object.keys(FIELDS).find(f=>q[f].status==='OBSERVED')))
    issue('ERROR','OBSERVED_METRIC_PROVENANCE_REQUIRED','sourceReference');
  const status=errors.length?'FAIL':'PASS';
  return{siteId,countryId:country,resourceId,aliasOfSiteId:alias,markerEligible:row?.map?.markerEligible!==false,commercialExtraction:row?.operation?.commercialExtraction!==false,status,errors,warnings,quantitative:q,annualCheck};
}
function auditRegistry(rows,options={}){
  const list=Array.isArray(rows)?rows:[],errors=[],warnings=[],byId=new Map(),byIdentity=new Map(),byCoordinate=new Map();
  let markerEligibleCount=0,aliasCount=0,commercialCount=0,simulatedMetrics=0,observedMetrics=0,unobservedMetrics=0,annualChecks=0;
  const perSite=[];
  for(const row of list){
    const res=auditSiteRecord(row,options);perSite.push(res);errors.push(...res.errors);warnings.push(...res.warnings);
    const id=res.siteId;
    if(id){
      if(byId.has(id))errors.push({severity:'ERROR',code:'DUPLICATE_SITE_ID',siteId:id,detail:{firstIndex:byId.get(id),duplicateIndex:perSite.length-1}});
      else byId.set(id,perSite.length-1);
    }
    if(res.aliasOfSiteId)aliasCount++;
    if(res.markerEligible)markerEligibleCount++;
    if(res.commercialExtraction)commercialCount++;
    for(const field of Object.keys(FIELDS)){
      const s=String(row?.quantitative?.[field]?.status||'UNOBSERVED').toUpperCase();
      if(s==='SIMULATED')simulatedMetrics++;else if(s==='OBSERVED')observedMetrics++;else if(UNKNOWN.has(s))unobservedMetrics++;
    }
    if(res.annualCheck.status!=='NOT_CHECKABLE')annualChecks++;
    const name=normName(row?.siteName||row?.name);
    if(name&&!res.aliasOfSiteId){
      const k=[res.countryId,res.resourceId,name].join('|');
      if(!byIdentity.has(k))byIdentity.set(k,[]);
      byIdentity.get(k).push(row);
    }
    if(res.markerEligible&&!res.aliasOfSiteId){
      const c=row?.location?.coordinates||{},lat=Number(c.lat??c.latitude),lng=Number(c.lng??c.lon??c.longitude);
      if(Number.isFinite(lat)&&Number.isFinite(lng)){
        const k=[res.countryId,lat.toFixed(6),lng.toFixed(6)].join('|');
        if(!byCoordinate.has(k))byCoordinate.set(k,[]);
        byCoordinate.get(k).push(row);
      }
    }
  }
  const duplicateIdentityGroups=[];
  for(const [key,items] of byIdentity)if(items.length>1){
    duplicateIdentityGroups.push({key,siteIds:items.map(x=>x.siteId)});
    warnings.push({severity:'WARNING',code:'DUPLICATE_NORMALIZED_SITE_NAME',detail:{key,siteIds:items.map(x=>x.siteId)}});
  }
  const markerCollisionGroups=[];
  for(const [key,items] of byCoordinate)if(items.length>1){
    const groups=new Set(items.map(x=>String(x?.map?.collisionGroup||'').trim()).filter(Boolean));
    const ids=items.map(x=>x.siteId);
    const intentional=groups.size===1&&groups.has(String(items[0]?.map?.collisionGroup||'').trim());
    markerCollisionGroups.push({key,siteIds:ids,intentional,collisionGroups:[...groups]});
    if(!intentional)errors.push({severity:'ERROR',code:'UNDECLARED_MARKER_COLLISION',detail:{key,siteIds:ids,collisionGroups:[...groups]}});
    else warnings.push({severity:'WARNING',code:'DECLARED_MARKER_COLLISION',detail:{key,siteIds:ids,collisionGroup:[...groups][0]}});
  }
  const idSet=new Set(list.map(x=>String(x?.siteId||x?.id||'')).filter(Boolean));
  const aliasTargetsNotFound=[];
  for(const row of list){
    const alias=isAlias(row,options.aliasMap||{});
    if(alias&&!idSet.has(alias)&&!options.allowExternalAliasTargets?.has?.(alias)){
      aliasTargetsNotFound.push({siteId:row.siteId,target:alias});
      errors.push({severity:'ERROR',code:'ALIAS_TARGET_NOT_FOUND',siteId:row.siteId,detail:{target:alias}});
    }
  }
  return{
    contract:'OMEGA_RESOURCE_SITE_INTEGRITY_V1',version:VERSION,status:errors.length?'FAIL':'PASS',
    siteCount:list.length,uniqueSiteIdCount:byId.size,duplicateSiteIdCount:errors.filter(x=>x.code==='DUPLICATE_SITE_ID').length,
    markerEligibleCount,commercialExtractionCount:commercialCount,aliasCount,
    metricCoverage:{simulatedMetrics,observedMetrics,unobservedMetrics,annualUnitChecks:annualChecks},
    duplicateIdentityGroups,markerCollisionGroups,aliasTargetsNotFound,
    errorCount:errors.length,warningCount:warnings.length,errors,warnings,sites:perSite
  };
}
const API=Object.freeze({VERSION,FIELDS,normalizeQuantitative,normalizeSiteRecord,isAlias,unitFactorToBase,compatibleAnnualProduction,auditSiteRecord,auditRegistry});
g.Omega=g.Omega||{};
g.Omega.ResourceSiteIntegrity=API;
g.OmegaResourceSiteIntegrity=API;
})(typeof window!=='undefined'?window:globalThis);
