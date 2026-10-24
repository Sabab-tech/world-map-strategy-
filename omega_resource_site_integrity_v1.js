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
const KNOWN_MARKER_COLLISION_GROUPS=Object.freeze({
  SITE_TZA_geita_gold_mine:'TZA_GEITA_GOLD_MINE_REGIONAL_CLUSTER',
  SITE_TZA_geita_gold_mine_super_pit:'TZA_GEITA_GOLD_MINE_REGIONAL_CLUSTER',
  SITE_COD_kipushi_zinc_copper_mine:'COD_KIPUSHI_MINE_COMPLEX',
  SITE_COD_kipushi_zinc_mine:'COD_KIPUSHI_MINE_COMPLEX'
});
const KNOWN_STATUS=new Set(['OBSERVED','OBSERVED_ATTRIBUTABLE','REPORTED','REPORTED_TEXT_ONLY','SIMULATED','UNOBSERVED','UNQUANTIFIED','NOT_APPLICABLE','UNKNOWN','DERIVED','ESTIMATED','INFERRED','PARTIAL']);
function unitToken(value){
  let s=String(value??'').trim().toUpperCase().replace(/[\s-]+/g,'_');
  if(s.endsWith('/DAY'))s=s.slice(0,-4)+'_PER_DAY';
  else if(s.endsWith('/YEAR'))s=s.slice(0,-5)+'_PER_YEAR';
  else if(s.endsWith('/YR'))s=s.slice(0,-3)+'_PER_YEAR';
  return s;
}
function normalizeProductionUnit(value,period){
  const raw=unitToken(value);
  if(!raw)return null;
  const direct={
    METRIC_TONNES:'TONNES',METRIC_TONS:'TONNES',METRIC_TON:'TONNES',METRIC_TONNE:'TONNES',
    TONNES:'TONNES',TONNE:'TONNES',TONS:'TONNES',TON:'TONNES',
    TROY_OUNCES:'TROY_OUNCES',TROY_OUNCE:'TROY_OUNCES',TROY_OZ:'TROY_OUNCES',OZT:'TROY_OUNCES',
    OUNCES:'TROY_OUNCES',OUNCE:'TROY_OUNCES',OZ:'TROY_OUNCES',
    MMCF:'MMCF',MILLION_CUBIC_FEET:'MMCF',MCF:'MCF',THOUSAND_CUBIC_FEET:'MCF',
    BCF:'BCF',TCF:'TCF',BCM:'BCM',MCM:'MCM',
    BBL:'BBL',BBLS:'BBL',BARREL:'BBL',BARRELS:'BBL',
    CARAT:'CARATS',CARATS:'CARATS',CT:'CARATS',
    KILOGRAM:'KG',KILOGRAMS:'KG',KG:'KG'
  };
  let base=direct[raw]||raw;
  if(/_(?:PER_DAY|PER_YEAR|DAILY|ANNUAL|YEARLY)$/.test(base))return base;
  if(period==='annual')return base+'_PER_YEAR';
  if(period==='rate')return base+'_PER_DAY';
  return base;
}
function numericCandidate(raw){
  if(finite(raw))return raw;
  if(typeof raw==='string'){
    const trimmed=raw.trim();
    if(/^[-+]?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?$/.test(trimmed))return Number(trimmed.replace(/,/g,''));
    return null;
  }
  if(raw&&typeof raw==='object'){
    for(const key of ['value','quantity','amount','rate','annual','nominal','minimum','maximum']){
      if(Object.prototype.hasOwnProperty.call(raw,key)){
        const n=numericCandidate(raw[key]);if(n!==null)return n;
      }
    }
  }
  return null;
}
function firstUnit(...values){for(const v of values)if(hasValue(v))return v;return null;}
function normalizeQuantitative(source){
  const q=source&&typeof source==='object'?clone(source):{};
  const rawFields={};
  for(const [field,shape] of Object.entries(FIELDS)){
    const rawValue=q[field]&&typeof q[field]==='object'?clone(q[field]):{};
    const v={...clone(shape),...rawValue};
    const sourceStatus=String(rawValue.status||'').trim().toUpperCase()||null;
    const keys=NUMERIC_KEYS[field];
    const descriptive=[];
    for(const key of keys){
      const rawMetric=rawValue[key];
      const amount=numericCandidate(rawMetric);
      if(amount!==null)v[key]=amount;
      else{
        v[key]=null;
        if(hasValue(rawMetric)){
          descriptive.push({key,value:clone(rawMetric)});
        }
      }
      if(rawMetric&&typeof rawMetric==='object'&&!Array.isArray(rawMetric)){
        if(field==='production'&&key==='annual'){
          v.annualUnit=normalizeProductionUnit(firstUnit(v.annualUnit,rawMetric.unit),'annual');
          if(hasValue(rawMetric.unit))v.sourceAnnualUnit=String(rawMetric.unit);
          if(!hasValue(v.year)&&hasValue(rawMetric.year))v.year=rawMetric.year;
        }else if(field==='production'&&key==='rate'){
          v.unit=normalizeProductionUnit(firstUnit(v.unit,rawMetric.unit),'rate');
          if(hasValue(rawMetric.unit))v.sourceRateUnit=String(rawMetric.unit);
          if(!hasValue(v.year)&&hasValue(rawMetric.year))v.year=rawMetric.year;
        }else{
          if(!hasValue(v.unit)&&hasValue(rawMetric.unit))v.unit=String(rawMetric.unit);
          if(!hasValue(v.year)&&hasValue(rawMetric.year))v.year=rawMetric.year;
        }
      }
    }
    if(field==='production'){
      if(finite(v.annual)&&!hasValue(v.annualUnit)&&hasValue(rawValue.unit)&&!finite(v.rate))
        v.annualUnit=normalizeProductionUnit(rawValue.unit,'annual');
      if(finite(v.rate)&&!hasValue(v.unit)&&hasValue(rawValue.sourceUnit))
        v.unit=normalizeProductionUnit(rawValue.sourceUnit,'rate');
      if(hasValue(v.unit))v.unit=normalizeProductionUnit(v.unit,'rate');
      if(hasValue(v.annualUnit))v.annualUnit=normalizeProductionUnit(v.annualUnit,'annual');
      if(finite(v.rate)&&!hasValue(v.unit)&&hasValue(v.annualUnit)&&/_PER_YEAR$/.test(v.annualUnit))v.unit=v.annualUnit.replace(/_PER_YEAR$/,'_PER_DAY');
      if(finite(v.annual)&&!hasValue(v.annualUnit)&&hasValue(v.unit)&&/_PER_DAY$/.test(v.unit))v.annualUnit=v.unit.replace(/_PER_DAY$/,'_PER_YEAR');
    }
    if(field==='recovery'&&!hasValue(v.unit))v.unit='PERCENT';
    const legacyText=firstUnit(rawValue.reportedText,rawValue.legacyReportedText,rawValue.reportedValue,rawValue.legacyReportedReserveText);
    if(hasValue(legacyText))descriptive.push({key:'reportedText',value:legacyText});
    if(descriptive.length){
      v.reportedText=descriptive.map(x=>typeof x.value==='string'?x.value:JSON.stringify(x.value)).join(' | ');
      rawFields[field]=rawValue;
    }
    v.sourceStatus=sourceStatus;
    const numericPresent=keys.some(key=>finite(v[key]));
    const customStatus=sourceStatus&&!KNOWN_STATUS.has(sourceStatus);
    const reportedLike=customStatus&&/(REPORTED|GOVERNMENT|MINISTRY|ESTIMATE|DESIGN|EXPANSION|OPERATIONAL|PRODUCTION|CAPACITY|RESERVE|GRADE|QUALITY|SOURCE|DATA|ATTRIBUTABLE)/.test(sourceStatus);
    const canonicalStatus=sourceStatus&&KNOWN_STATUS.has(sourceStatus)?sourceStatus:
      sourceStatus&&/SIMULATED|SCENARIO/.test(sourceStatus)?'SIMULATED':
      sourceStatus&&/OBSERVED/.test(sourceStatus)&&numericPresent?'OBSERVED':
      reportedLike?(numericPresent?'REPORTED':(descriptive.length?'REPORTED_TEXT_ONLY':'UNQUANTIFIED')):
      (!numericPresent?(descriptive.length?'REPORTED_TEXT_ONLY':'UNOBSERVED'):null);
    if(!canonicalStatus){
      // Never infer authority from the mere presence of a number. Preserve it for review,
      // but keep the quantitative slot null until the source/status is reconciled.
      if(numericPresent){
        rawFields[field]=rawValue;
        for(const key of keys)if(finite(v[key]))v[key]=null;
      }
      v.status=descriptive.length?'REPORTED_TEXT_ONLY':'UNOBSERVED';
    }else if(['REPORTED','REPORTED_TEXT','LEGACY_REPORTED'].includes(canonicalStatus)&&!numericPresent){
      v.status=descriptive.length?'REPORTED_TEXT_ONLY':'UNQUANTIFIED';
    }else if(['OBSERVED','OBSERVED_ATTRIBUTABLE','REPORTED','REPORTED_TEXT','LEGACY_REPORTED'].includes(canonicalStatus)&&!numericPresent){
      v.status=descriptive.length?'REPORTED_TEXT_ONLY':(canonicalStatus.startsWith('REPORTED')||canonicalStatus==='LEGACY_REPORTED'?'UNQUANTIFIED':'UNOBSERVED');
    }else{
      v.status=canonicalStatus;
    }
    // Preserve original labels and wrapper metadata without pretending they are numeric.
    if(descriptive.length){
      q.reportedMetrics=q.reportedMetrics&&typeof q.reportedMetrics==='object'?q.reportedMetrics:{};
      q.reportedMetrics.descriptiveValues=q.reportedMetrics.descriptiveValues&&typeof q.reportedMetrics.descriptiveValues==='object'?q.reportedMetrics.descriptiveValues:{};
      q.reportedMetrics.descriptiveValues[field]=descriptive.map(x=>({key:x.key,value:clone(x.value)}));
    }
    q[field]=v;
  }
  q.reportedMetrics=q.reportedMetrics&&typeof q.reportedMetrics==='object'?q.reportedMetrics:{};
  if(Object.keys(rawFields).length){
    q.reportedMetrics.legacyQuantitativeFields=q.reportedMetrics.legacyQuantitativeFields&&typeof q.reportedMetrics.legacyQuantitativeFields==='object'?q.reportedMetrics.legacyQuantitativeFields:{};
    for(const [field,value] of Object.entries(rawFields))if(!Object.prototype.hasOwnProperty.call(q.reportedMetrics.legacyQuantitativeFields,field))q.reportedMetrics.legacyQuantitativeFields[field]=value;
  }
  q.quantitativeProvenance=q.quantitativeProvenance&&typeof q.quantitativeProvenance==='object'?q.quantitativeProvenance:{};
  q.completeness=q.completeness&&typeof q.completeness==='object'?q.completeness:{};
  for(const field of Object.keys(FIELDS))q.completeness[field]=q[field].status;
  const numericKnown=Object.entries(NUMERIC_KEYS).some(([field,keys])=>keys.some(key=>finite(q[field][key])));
  const reportedText=Object.values(q.reportedMetrics.descriptiveValues||{}).some(v=>Array.isArray(v)&&v.length);
  q.completeness.overall=numericKnown||reportedText?'PARTIAL':'IDENTITY_AND_LOCATION_ONLY';
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
  const declaredCollisionGroup=KNOWN_MARKER_COLLISION_GROUPS[row.siteId]||null;
  row.map={...(row.map||{}),markerEligible:row.map?.markerEligible!==false,countryIsolationKey:canonCountry(row.map?.countryIsolationKey||country),collisionGroup:declaredCollisionGroup||row.map?.collisionGroup||null};
  row.runtime={...(row.runtime||{}),identityAuthority:row.runtime?.identityAuthority||'SITE_REFERENCE',
    quantityAuthority:row.runtime?.quantityAuthority||'SIMULATION_RUNTIME',
    productionAuthority:row.runtime?.productionAuthority||'SIMULATION_RUNTIME',
    qualityAuthority:row.runtime?.qualityAuthority||'OBSERVED_OR_EXPLICITLY_UNOBSERVED',
    countryWarehouseId:row.runtime?.countryWarehouseId||('WH-'+country+'-RAW'),
    requiresSiteSpecificRoute:row.runtime?.requiresSiteSpecificRoute!==false,
    requiresFactoryBinding:row.runtime?.requiresFactoryBinding!==false};
  return row;
}

const SITE_PIPELINE_COMMODITY_BANDS=Object.freeze({
  crude_oil:{rate:85000,rateUnit:'BARRELS_PER_DAY',reserveUnit:'BARRELS',gradeUnit:'API_GRAVITY',output:'REFINED_PETROLEUM_PRODUCTS',mode:'pipeline'},
  natural_gas:{rate:420,rateUnit:'MMCF_PER_DAY',reserveUnit:'MMCF',gradeUnit:'PERCENT_METHANE',output:'PROCESSED_NATURAL_GAS',mode:'pipeline'},
  gold:{rate:14500,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'GRAMS_PER_TONNE_AU',output:'GOLD_DORE',mode:'rail'},
  silver:{rate:12500,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'GRAMS_PER_TONNE_AG',output:'SILVER_CONCENTRATE',mode:'rail'},
  platinum:{rate:9000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'GRAMS_PER_TONNE_PGM',output:'PLATINUM_GROUP_CONCENTRATE',mode:'rail'},
  diamond:{rate:4500,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'CARATS_PER_TONNE',output:'DIAMOND_RECOVERY_STREAM',mode:'road'},
  ruby:{rate:2000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'CARATS_PER_TONNE',output:'GEMSTONE_RECOVERY_STREAM',mode:'road'},
  coal:{rate:32000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'KCAL_PER_KG',output:'THERMAL_OR_METALLURGICAL_COAL',mode:'rail'},
  iron_ore:{rate:38000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_FE',output:'IRON_ORE_CONCENTRATE',mode:'rail'},
  copper:{rate:24000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_CU',output:'COPPER_CONCENTRATE',mode:'rail'},
  nickel:{rate:15000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_NI',output:'NICKEL_CONCENTRATE',mode:'rail'},
  cobalt:{rate:9000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_CO',output:'COBALT_CONCENTRATE',mode:'rail'},
  lithium:{rate:12000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_LI2O',output:'LITHIUM_CONCENTRATE',mode:'rail'},
  rare_earth:{rate:8000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_REO',output:'RARE_EARTH_CONCENTRATE',mode:'rail'},
  niobium:{rate:6000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_NB2O5',output:'NIOBIUM_CONCENTRATE',mode:'rail'},
  uranium:{rate:6000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_U3O8',output:'URANIUM_CONCENTRATE',mode:'rail'},
  bauxite:{rate:24000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_AL2O3',output:'BAUXITE_CONCENTRATE',mode:'rail'},
  phosphate:{rate:18000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_P2O5',output:'PHOSPHATE_ROCK',mode:'rail'},
  potash:{rate:15000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_K2O',output:'POTASH_PRODUCT',mode:'rail'},
  zinc:{rate:12000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_ZN',output:'ZINC_CONCENTRATE',mode:'rail'},
  tin:{rate:5000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_SN',output:'TIN_CONCENTRATE',mode:'rail'},
  tungsten:{rate:5000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_WO3',output:'TUNGSTEN_CONCENTRATE',mode:'rail'},
  chromite:{rate:12000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_CR2O3',output:'CHROMITE_CONCENTRATE',mode:'rail'},
  manganese:{rate:12000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_MN',output:'MANGANESE_CONCENTRATE',mode:'rail'},
  graphite:{rate:7000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_CARBON',output:'GRAPHITE_CONCENTRATE',mode:'rail'},
  rutile:{rate:6500,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_TIO2',output:'RUTILE_CONCENTRATE',mode:'rail'},
  ilmenite:{rate:11000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_TIO2',output:'ILMENITE_CONCENTRATE',mode:'rail'},
  limestone:{rate:18000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_CACO3',output:'LIMESTONE_FEED',mode:'road'},
  construction_aggregate:{rate:10000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'SIMULATED_AGGREGATE_QUALITY_INDEX',output:'CONSTRUCTION_AGGREGATE',mode:'road'},
  coral_aggregate:{rate:3500,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'SIMULATED_AGGREGATE_QUALITY_INDEX',output:'CORAL_AGGREGATE',mode:'road'},
  basalt:{rate:8000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'SIMULATED_AGGREGATE_QUALITY_INDEX',output:'BASALT_AGGREGATE',mode:'road'},
  granite:{rate:6000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'SIMULATED_STONE_QUALITY_INDEX',output:'GRANITE_BLOCKS_AND_AGGREGATE',mode:'road'},
  marble:{rate:4000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'SIMULATED_STONE_QUALITY_INDEX',output:'MARBLE_BLOCKS',mode:'road'},
  gypsum:{rate:8000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_CASO4',output:'GYPSUM_FEED',mode:'road'},
  salt:{rate:7000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_NACL',output:'INDUSTRIAL_SALT',mode:'road'},
  dolomite:{rate:7000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_MGCO3',output:'DOLOMITE_FEED',mode:'road'},
  magnesite:{rate:5000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_MGO',output:'MAGNESITE_FEED',mode:'road'},
  oil_shale:{rate:14000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'LITRES_PER_TONNE_OIL',output:'SHALE_OIL_FEED',mode:'rail'},
  boron:{rate:5000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'PERCENT_B2O3',output:'BORATE_CONCENTRATE',mode:'rail'},
  aragonite:{rate:2500,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'SIMULATED_MINERAL_QUALITY_INDEX',output:'ARAGONITE_PRODUCT',mode:'road'},
  diatomite:{rate:2500,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',gradeUnit:'SIMULATED_MINERAL_QUALITY_INDEX',output:'DIATOMITE_PRODUCT',mode:'road'}
});
function sitePipelineHash(value){
  const text=String(value||'');let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
  return h>>>0;
}
function sitePipelinePositive(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:null;}
function buildSimulationPipelineProfile(raw,options={}){
  const row=clone(raw||{});
  const siteId=String(row.siteId||row.id||'').trim();
  const country=canonCountry(row.countryId||row.identity?.countryIso3||row.countryCode||row.location?.countryBoundaryKey);
  const resource=canonResource(row.resourceId||row.identity?.resourceTypeId||row.resourceTypeId||row.resourceTypeKey);
  row.siteId=siteId;row.countryId=country;
  row.identity={...(row.identity||{}),countryIso3:canonCountry(row.identity?.countryIso3||country)};
  const operation={...(row.operation||{})};
  const status=String(operation.status||operation.operationalStatus||row.status||'').trim().toUpperCase();
  const alias=isAlias(row,options.aliasMap||{});
  row.simulation={...(row.simulation||{})};
  row.logistics={...(row.logistics||{})};
  row.runtime={...(row.runtime||{})};
  if(status==='NOT_APPLICABLE'||operation.extractionEligibility==='NON_EXECUTABLE'&&!resource){
    operation.commercialExtraction=false;
    operation.extractionEligibility='NON_EXECUTABLE';
    row.operation=operation;
    row.map={...(row.map||{}),markerEligible:row.map?.markerEligible===true,countryIsolationKey:country};
    row.runtime={...row.runtime,requiresSiteSpecificRoute:false,requiresFactoryBinding:false,
      pipeline:{version:'OMEGA_SITE_PIPELINE_PROFILE_V1',profileAuthority:'NOT_APPLICABLE_NO_RESOURCE',
        site:'REGISTERED_NOT_APPLICABLE',extraction:'NOT_APPLICABLE',batch:'NOT_APPLICABLE',
        rawWarehouse:'NOT_APPLICABLE',transport:'NOT_APPLICABLE',factory:'NOT_APPLICABLE',
        processing:'NOT_APPLICABLE',output:'NOT_APPLICABLE',economy:'NO_COMMODITY_OUTPUT',
        extractionExecutable:false}};
    row.simulation.pipelineProfileStatus='NOT_APPLICABLE';
    row.simulation.pipelineProfileAuthority='NOT_APPLICABLE_NO_RESOURCE';
    return row;
  }
  if(alias){
    operation.commercialExtraction=false;
    operation.extractionEligibility='NON_EXECUTABLE_ALIAS';
    row.operation=operation;
    row.map={...(row.map||{}),markerEligible:false};
    row.runtime={...row.runtime,aliasOfSiteId:alias,requiresSiteSpecificRoute:false,requiresFactoryBinding:false,
      pipeline:{version:'OMEGA_SITE_PIPELINE_PROFILE_V1',profileAuthority:'ALIAS_REFERENCE',
        site:'ALIAS_REFERENCE',extraction:'NON_EXECUTABLE_ALIAS',batch:'NON_EXECUTABLE_ALIAS',
        rawWarehouse:'NON_EXECUTABLE_ALIAS',transport:'NON_EXECUTABLE_ALIAS',factory:'NON_EXECUTABLE_ALIAS',
        processing:'NON_EXECUTABLE_ALIAS',output:'NON_EXECUTABLE_ALIAS',economy:'NON_EXECUTABLE_ALIAS',
        extractionExecutable:false}};
    row.simulation.pipelineProfileStatus='ALIAS_REFERENCE';
    row.simulation.pipelineProfileAuthority='ALIAS_REFERENCE';
    return row;
  }
  if(!siteId||!/^[A-Z]{3}$/.test(country)||!resource||['unknown','unknown_resource','not_applicable','n_a'].includes(resource)){
    row.runtime.pipeline={version:'OMEGA_SITE_PIPELINE_PROFILE_V1',profileAuthority:'INCOMPLETE_IDENTITY',
      site:siteId?'BOUND':'BLOCKED_SITE_ID',extraction:'BLOCKED_RESOURCE_IDENTITY',
      batch:'BLOCKED_RESOURCE_IDENTITY',rawWarehouse:'BLOCKED_RESOURCE_IDENTITY',
      transport:'BLOCKED_RESOURCE_IDENTITY',factory:'BLOCKED_RESOURCE_IDENTITY',
      processing:'BLOCKED_RESOURCE_IDENTITY',output:'BLOCKED_RESOURCE_IDENTITY',
      economy:'BLOCKED_RESOURCE_IDENTITY',extractionExecutable:false};
    row.simulation.pipelineProfileStatus='BLOCKED_INCOMPLETE_IDENTITY';
    return row;
  }
  const band=SITE_PIPELINE_COMMODITY_BANDS[resource]||{
    rate:9000,rateUnit:'TONNES_PER_DAY',reserveUnit:'TONNES_ORE',
    gradeUnit:'SIMULATED_RESOURCE_QUALITY_INDEX',output:resource.toUpperCase()+'_CONCENTRATE',mode:'rail'
  };
  const seed=sitePipelineHash(siteId+'|'+country+'|'+resource);
  const variability=0.70+(seed%601)/1000;
  const year=Math.max(2000,Math.floor(Number(options.year||row.quantitative?.production?.year||row.quantitative?.reserve?.year||2026)||2026));
  const horizon=sitePipelinePositive(row.simulation.reserveHorizonYears)||350+(seed%101);
  const simulation=row.simulation;
  let dailyRate=sitePipelinePositive(simulation.productionRate)||Math.max(1,Math.round(band.rate*variability));
  const rateUnit=String(simulation.productionRateUnit||band.rateUnit);
  let annualProduction=sitePipelinePositive(simulation.annualProduction)||Math.round(dailyRate*365);
  const annualUnit=String(simulation.annualProductionUnit||(rateUnit==='BARRELS_PER_DAY'?'BARRELS_PER_YEAR':rateUnit==='MMCF_PER_DAY'?'MMCF_PER_YEAR':rateUnit.replace(/_PER_DAY$/,'_PER_YEAR')));
  const utilizationRaw=Number(simulation.utilization);
  const utilization=Number.isFinite(utilizationRaw)&&utilizationRaw>0&&utilizationRaw<=1?utilizationRaw:Math.min(.94,Math.max(.62,.68+(seed%251)/1000));
  const nominal=sitePipelinePositive(simulation.nominalDailyCapacity)||Math.max(dailyRate,Math.round(dailyRate/Math.max(.55,utilization)));
  const minimum=Math.min(nominal,sitePipelinePositive(simulation.minimumDailyCapacity)||Math.max(1,Math.round(nominal*.62)));
  const maximum=Math.max(nominal,sitePipelinePositive(simulation.maximumDailyCapacity)||Math.round(nominal*1.28));
  const reserveSource=simulation.reserve&&typeof simulation.reserve==='object'?simulation.reserve:
    (String(row.reserve?.status||'').toUpperCase()==='SIMULATED'?row.reserve:null);
  const reserveQuantity=sitePipelinePositive(reserveSource?.quantity)||Math.max(1,Math.round(annualProduction*horizon));
  const reserveUnit=String(reserveSource?.unit||band.reserveUnit);
  simulation.reserve={...(reserveSource||{}),quantity:reserveQuantity,unit:reserveUnit,status:'SIMULATED',
    basis:reserveSource?.basis||'SITE_ID_SEEDED_MULTICENTURY_GAMEPLAY_RESERVE'};
  simulation.productionRate=dailyRate;simulation.productionRateUnit=rateUnit;
  simulation.annualProduction=annualProduction;simulation.annualProductionUnit=annualUnit;
  simulation.reserveHorizonYears=horizon;simulation.utilization=utilization;
  simulation.nominalDailyCapacity=nominal;simulation.minimumDailyCapacity=minimum;simulation.maximumDailyCapacity=maximum;
  simulation.recovery=sitePipelinePositive(simulation.recovery)||Math.round((.68+(seed%261)/1000)*10000)/10000;
  const oldGrade=simulation.grade;
  if(!(oldGrade&&typeof oldGrade==='object'&&sitePipelinePositive(oldGrade.value))&&!(sitePipelinePositive(oldGrade))){
    const gradeBase=resource==='gold'?1.2:resource==='copper'?.85:resource==='iron_ore'?58:resource==='coal'?6200:resource==='natural_gas'?91:resource==='crude_oil'?32:resource==='limestone'?88:20;
    simulation.grade={value:Math.round((gradeBase*(.75+(seed%501)/1000))*1000)/1000,unit:band.gradeUnit,
      year,metric:'RESOURCE_SPECIFIC_SIMULATED_QUALITY',status:'SIMULATED',
      basis:'SITE_ID_SEEDED_COMMODITY_BAND_NOT_ASSAY'};
  }
  const oldPurity=simulation.purity;
  if(!(oldPurity&&typeof oldPurity==='object'&&sitePipelinePositive(oldPurity.value))&&!sitePipelinePositive(oldPurity)){
    simulation.purity={value:Math.round((86+(seed%125)/10)*100)/100,unit:'PERCENT',year,
      status:'SIMULATED',basis:'SITE_ID_SEEDED_PRODUCT_QUALITY_NOT_ASSAY'};
  }
  simulation.throughput={...(simulation.throughput&&typeof simulation.throughput==='object'?simulation.throughput:{}),
    value:sitePipelinePositive(simulation.throughput?.value)||Math.max(1,Math.round(dailyRate*utilization)),
    unit:simulation.throughput?.unit||rateUnit,status:'SIMULATED',
    basis:simulation.throughput?.basis||'SITE_ID_SEEDED_THROUGHPUT_NOT_OBSERVED'};
  const warehouseId='WH-'+country+'-RAW';
  const factoryId='FACTORY_'+country+'_'+resource;
  const existingFactory=simulation.factoryBinding;
  const factoryCompatible=existingFactory&&
    String(existingFactory.countryId||country).toUpperCase()===country&&
    String(existingFactory.inputResourceId||resource).toLowerCase()===resource&&
    String(existingFactory.factoryId||'').startsWith('FACTORY_'+country+'_');
  const factoryBinding=factoryCompatible?{...existingFactory,factoryId,countryId:country,inputResourceId:resource,status:'SIMULATED_READY',requiresSameCountryWarehouse:true}:
    {factoryId,countryId:country,inputResourceId:resource,outputResourceId:band.output,
     status:'SIMULATED_READY',processingMethod:resource.toUpperCase()+'_PROCESSING_PLANT',
     requiresSameCountryWarehouse:true,simulationOnly:true};
  simulation.factoryBinding=factoryBinding;
  simulation.factoryOutputs=Array.isArray(simulation.factoryOutputs)&&simulation.factoryOutputs.length?
    simulation.factoryOutputs:[band.output.replace(/_/g,' ').toLowerCase()];
  const mode=String(band.mode||'rail');
  const speed=mode==='pipeline'?500:mode==='road'?65:300;
  const oldRoutes=Array.isArray(simulation.transportRoute)?simulation.transportRoute:[];
  const matchingRoute=oldRoutes.find(route=>String(route?.countryId||country).toUpperCase()===country&&
    String(route?.originSiteId||siteId)===siteId&&
    String(route?.warehouseId||warehouseId)===warehouseId&&
    String(route?.factoryId||factoryId)===factoryId);
  const distance=sitePipelinePositive(matchingRoute?.distanceKm)||40+(seed%1161);
  const route={...(matchingRoute||{}),routeId:String(matchingRoute?.routeId||('ROUTE_'+siteId+'_RAW_TO_FACTORY')),
    countryId:country,originSiteId:siteId,warehouseId,factoryId,mode,distanceKm:distance,
    estimatedTravelDays:Math.max(1,Math.ceil(distance/speed)),status:'SIMULATED_ROUTE_READY',
    routeCapacityPerDay:Math.max(maximum,sitePipelinePositive(matchingRoute?.routeCapacityPerDay)||0),
    blockableByWar:true,blockableByNeighborControl:true,blockableByNavalInterdiction:mode==='pipeline',
    simulationOnly:true};
  simulation.transportRoute=[route];
  simulation.rawWarehouseId=warehouseId;
  const oldTransport=row.logistics.transport;
  const transportCompatible=oldTransport&&
    String(oldTransport.originCountryId||country).toUpperCase()===country&&
    String(oldTransport.destinationCountryId||country).toUpperCase()===country&&
    String(oldTransport.originSiteId||siteId)===siteId&&
    String(oldTransport.warehouseId||warehouseId)===warehouseId&&
    String(oldTransport.destinationFactoryId||factoryId)===factoryId;
  row.logistics={...row.logistics,warehouseCountryId:country,warehouseSiteId:warehouseId,
    inventoryRouteStatus:'SIMULATED_ROUTE_READY',factoryRouteStatus:'SIMULATED_FACTORY_BINDING_READY',
    routeStatus:'SIMULATED_ROUTE_READY',
    transport:transportCompatible?{...oldTransport,originCountryId:country,destinationCountryId:country,
      originSiteId:siteId,warehouseId,destinationFactoryId:factoryId,routeStatus:'SIMULATED_ROUTE_READY',
      routeCapacityPerDay:Math.max(maximum,sitePipelinePositive(oldTransport.routeCapacityPerDay)||0)}:
      {routeId:route.routeId,routeType:mode.toUpperCase(),mode,originSiteId:siteId,originCountryId:country,
       warehouseId,destinationFactoryId:factoryId,destinationCountryId:country,distanceKm:distance,
       averageSpeedKmPerDay:speed,estimatedTravelDays:route.estimatedTravelDays,
       routeStatus:'SIMULATED_ROUTE_READY',routeCapacityPerDay:route.routeCapacityPerDay,
       canBeBlockedByWar:true,canBeBlockedByNeighborControl:true,
       canBeBlockedByNavalInterdiction:mode==='pipeline',simulationOnly:true}};
  row.processing={...(row.processing||{}),
    upstreamProcess:row.processing?.upstreamProcess||operation.extractionMethod||'SITE_SPECIFIC_EXTRACTION',
    midstreamProcess:row.processing?.midstreamProcess||factoryBinding.processingMethod,
    refinedOutputs:row.processing?.refinedOutputs||simulation.factoryOutputs,
    downstreamSectors:row.processing?.downstreamSectors||[resource]};
  row.runtime={...row.runtime,identityAuthority:row.runtime.identityAuthority||'CANONICAL_SITE_REGISTRY',
    quantityAuthority:'SIMULATION_RUNTIME',productionAuthority:'SIMULATION_RUNTIME',
    countryWarehouseId:warehouseId,requiresSiteSpecificRoute:true,requiresFactoryBinding:true,
    pipeline:{version:'OMEGA_SITE_PIPELINE_PROFILE_V1',
      profileAuthority:'SIMULATION_ONLY_RUNTIME_COMPLETION',
      site:'BOUND',extraction:operation.commercialExtraction===false?'BLOCKED_BY_OPERATION_ELIGIBILITY':'SIMULATED_ENGINEERING_READY',
      batch:'SITE_ID_KEYED',rawWarehouse:'BOUND_TO_OWNER_COUNTRY',transport:'SIMULATED_STRATEGIC_ROUTE_READY',
      factory:'SITE_AND_COUNTRY_BOUND',processing:'RESOURCE_SPECIFIC_SIMULATED_PROCESS',
      output:'SIMULATED_PRODUCT_STREAM',economy:'COUNTRY_ISOLATED_SIMULATED_OUTPUT',
      extractionExecutable:operation.commercialExtraction!==false}};
  row.operation=operation;
  simulation.simulationOnly=true;simulation.pipelineProfileVersion='OMEGA_SITE_PIPELINE_PROFILE_V1';
  simulation.pipelineProfileStatus='READY';simulation.pipelineProfileAuthority='SIMULATION_ONLY_RUNTIME_COMPLETION';
  simulation.pipelineProfile={version:'OMEGA_SITE_PIPELINE_PROFILE_V1',status:'READY',
    authority:'SIMULATION_ONLY_RUNTIME_COMPLETION',sourceSiteId:siteId,resourceId:resource,countryId:country,
    reserveHorizonYears:horizon,warehouseId,factoryId,routeId:route.routeId,routeMode:mode};
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
  const nonCommercialReference=row?.operation?.commercialExtraction===false||
    row?.identity?.siteType==='NO_COMMERCIAL_EXTRACTION'||
    String(row?.operation?.status||'').toUpperCase()==='NOT_APPLICABLE';
  if(!resource&&!nonCommercialReference)issue('ERROR','RESOURCE_ID_MISSING','identity.resourceTypeId');
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
      if(['OBSERVED','OBSERVED_ATTRIBUTABLE','REPORTED','SIMULATED','DERIVED','ESTIMATED','INFERRED'].includes(status)&&value!==null&&value!==undefined&&value!==''){
        if(typeof value!=='number'||!Number.isFinite(value))
          issue('ERROR','QUANTITATIVE_VALUE_NOT_NUMERIC','quantitative.'+field+'.'+key,{status,value});
      }
      if(typeof value==='number'&&Number.isFinite(value)&&['quantity','annual','rate','nominal','minimum','maximum'].includes(key)&&value<0)
        issue('ERROR','QUANTITATIVE_NEGATIVE','quantitative.'+field+'.'+key,{value});
    }
    const numeric=NUMERIC_KEYS[field].some(key=>finite(v[key]));
    if(numeric&&['OBSERVED','OBSERVED_ATTRIBUTABLE','REPORTED','SIMULATED','DERIVED','ESTIMATED','INFERRED'].includes(status)){
      const units=field==='production'?(finite(v.rate)?v.unit:v.annualUnit):v.unit;
      if(!hasValue(units))issue('ERROR','QUANTITATIVE_UNIT_MISSING','quantitative.'+field+'.unit',{status});
      if(field==='production'&&finite(v.rate)&&!hasValue(v.unit))issue('ERROR','PRODUCTION_RATE_UNIT_MISSING','quantitative.production.unit',{status});
      if(field==='production'&&finite(v.annual)&&!hasValue(v.annualUnit))issue('ERROR','PRODUCTION_ANNUAL_UNIT_MISSING','quantitative.production.annualUnit',{status});
      if(['OBSERVED','OBSERVED_ATTRIBUTABLE','REPORTED'].includes(status)&&!siteEvidence(row,q,field))
        issue('ERROR','REPORTED_VALUE_WITHOUT_PROVENANCE','quantitative.'+field,{status});
      if(['SIMULATED','DERIVED','ESTIMATED','INFERRED'].includes(status)&&!authorityDeclared(row,q,field))
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
  return{siteId,countryId:country,resourceId:resource,aliasOfSiteId:alias,markerEligible:row?.map?.markerEligible!==false,commercialExtraction:row?.operation?.commercialExtraction!==false,status,errors,warnings,quantitative:q,annualCheck};
}
function auditRegistry(rows,options={}){
  const list=Array.isArray(rows)?rows:[],errors=[],warnings=[],byId=new Map(),byIdentity=new Map(),byCoordinate=new Map();
  let markerEligibleCount=0,aliasCount=0,commercialCount=0,simulatedMetrics=0,observedMetrics=0,unobservedMetrics=0,annualChecks=0;
  const perSite=[];
  for(const sourceRow of list){
    const row=normalizeSiteRecord(sourceRow);
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
    const collisionGroupValues=items.map(x=>String(x?.map?.collisionGroup||'').trim());
    const intentional=collisionGroupValues.every(Boolean)&&new Set(collisionGroupValues).size===1;
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
const API=Object.freeze({VERSION,FIELDS,normalizeQuantitative,normalizeSiteRecord,buildSimulationPipelineProfile,isAlias,unitFactorToBase,compatibleAnnualProduction,auditSiteRecord,auditRegistry});
g.Omega=g.Omega||{};
g.Omega.ResourceSiteIntegrity=API;
g.OmegaResourceSiteIntegrity=API;
})(typeof window!=='undefined'?window:globalThis);
