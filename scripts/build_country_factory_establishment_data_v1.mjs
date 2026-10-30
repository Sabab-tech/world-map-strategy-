#!/usr/bin/env node
/**
 * Populate real-world establishment observations from UNIDO INDSTAT Revision 4.
 * No counts are inferred from GDP, natural resources, industry archetypes or simulation.
 */
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const ROOT=process.cwd();
const BASE=resolve(ROOT,'country_factory_starting_baseline_v1.json');
const CATALOG=resolve(ROOT,'resource_industrial_catalog_v1.json');
const MAPPING=resolve(ROOT,'factory_isic_mapping_v1.json');
const OUTPUT=resolve(ROOT,'country_factory_establishment_data_v1.json');
const META_URL='https://stat.unido.org/portal/dataset/getDataset/INDSTAT/4';
const DATA_URL='https://stat.unido.org/portal/dataset/getData';
const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>String(v==null?'':v).trim();
const readJson=p=>{if(!existsSync(p))throw new Error('REQUIRED_INPUT_MISSING:'+p);return JSON.parse(readFileSync(p,'utf8'));};
const scalar=v=>{
  if(v===null||v===undefined)return null;
  if(typeof v!=='object')return String(v).trim();
  for(const k of ['c','code','id','value','year','name'])if(v[k]!==undefined&&v[k]!==null&&typeof v[k]!=='object')return String(v[k]).trim();
  return null;
};
const numberValue=v=>{
  const raw=scalar(v)??(typeof v==='number'?String(v):'');
  const normalized=String(raw).replace(/[, ]+/g,'').trim();
  if(!normalized||normalized===':'||normalized.toLowerCase()==='null')return null;
  const n=Number(normalized);
  return Number.isInteger(n)&&n>=0?n:null;
};
async function fetchJson(url,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal,headers:{accept:'application/json',...(options.headers||{})}});
    const body=await response.text();
    if(!response.ok)throw new Error('HTTP_'+response.status+':'+body.slice(0,160).replace(/\s+/g,' '));
    try{return JSON.parse(body);}catch{throw new Error('NON_JSON_RESPONSE:'+body.slice(0,160));}
  }finally{clearTimeout(timer);}
}
const first=(o,keys)=>{for(const k of keys)if(o[k]!==undefined&&o[k]!==null)return o[k];return undefined;};

/** Normalise nested UNIDO rows or period/activity dictionaries. */
export function extractEstablishmentObservations(payload,allowedCodes){
  const out=new Map();
  const activityKeys=['activityCode','activity_code','activity','activityId','activity_id','isicCode','isic_code','isic','actCode','act_code','act'];
  const periodKeys=['period','year','timePeriod','time_period','referencePeriod','reference_period','time','periodCode','t'];
  const variableKeys=['variableCode','variable_code','variable','variableId','variable_id','indicatorCode'];
  const valueKeys=['value','v','val','dataValue','data_value','obsValue','obs_value','observationValue','observation_value','establishments','numberOfEstablishments'];
  const structuralKeys=new Set([...activityKeys,...periodKeys,...variableKeys,...valueKeys]);
  const put=(activity,period,raw,variable)=>{
    const code=String(activity||''),year=String(period||''),value=numberValue(raw);
    if(allowedCodes.has(code)&&/^\d{4}$/.test(year)&&value!==null&&String(variable||'01')==='01')
      out.set(code+'|'+year,{activityCode:code,year:Number(year),value});
  };
  function walk(node,context={}){
    if(Array.isArray(node)){node.forEach(child=>walk(child,context));return;}
    if(!isObject(node))return;
    const activity=scalar(first(node,activityKeys))||context.activity||null;
    const period=scalar(first(node,periodKeys))||context.period||null;
    const variable=scalar(first(node,variableKeys))||context.variable||'01';
    const raw=first(node,valueKeys);
    if(raw!==undefined&&activity&&period)put(activity,period,raw,variable);
    for(const [key,child] of Object.entries(node)){
      if(structuralKeys.has(key))continue;
      if(allowedCodes.has(key)){
        if(!isObject(child)&&!Array.isArray(child)){
          if(period)put(key,period,child,variable);
        }else{
          walk(child,{activity:key,period:period,variable:variable});
        }
      }else if(/^\d{4}$/.test(key)){
        if(!isObject(child)&&!Array.isArray(child)){
          if(activity)put(activity,key,child,variable);
        }else{
          walk(child,{activity:activity,period:key,variable:variable});
        }
      }else if(isObject(child)||Array.isArray(child)){
        walk(child,{activity:activity,period:period,variable:variable});
      }
    }
  }
  walk(payload);
  return [...out.values()];
}

function normalizeSubsetCountryCode(value) {
  var code = text(value).toUpperCase();
  if (!code) return '';
  return /^\\d+$/.test(code) ? code.padStart(3, '0') : code;
}
export function extractSubsetActivityCode(row, allowedCodes) {
  var candidates = [
    row && row.classification_combo_code,
    row && row.classification_code,
    row && row.classification_combo_name,
    row && row.classification_name
  ];
  for (var i = 0; i < candidates.length; i++) {
    var candidate = text(candidates[i]);
    if (allowedCodes.has(candidate)) return candidate;
    var matches = candidate.match(/\\d{4}/g) || [];
    for (var j = 0; j < matches.length; j++) {
      if (allowedCodes.has(matches[j])) return matches[j];
    }
  }
  return null;
}
export function extractSubsetEstablishmentObservations(rows, allowedCodes) {
  if (!Array.isArray(rows)) throw new Error('SUBSETS_SOURCE_ROWS_INVALID');
  var output = [];
  rows.forEach(function (row) {
    if (!isObject(row)) return;
    var indicator = text(row.indicator_code || row.indicatorCode || '');
    if (indicator && indicator !== '01') return;
    var activityCode = extractSubsetActivityCode(row, allowedCodes);
    var year = Number(row.year || row.time_period || row.timePeriod);
    var value = Number(row.value);
    var countryCode = normalizeSubsetCountryCode(row.country_code || row.countryCode);
    if (!activityCode || !countryCode || !Number.isInteger(year) ||
        !Number.isInteger(value) || value < 0) return;
    output.push({
      countryCode: countryCode,
      activityCode: activityCode,
      year: year,
      value: value,
      countryName: text(row.country_name || row.countryName || ''),
      activityName: text(row.classification_combo_name || row.classification_name || '')
    });
  });
  return output;
}
async function buildDatasetFromSubsetJson(sourcePath) {
  if (!sourcePath) throw new Error('SUBSETS_JSON_PATH_REQUIRED');
  var baseline = readJson(BASE);
  var catalog = readJson(CATALOG);
  var mapping = readJson(MAPPING);
  var previous = existsSync(OUTPUT) ? readJson(OUTPUT) : null;
  if (baseline.countryCount !== 197 || Object.keys(baseline.countries).length !== 197 ||
      Object.keys(catalog.factoryProfiles).length !== 21 || mapping.mappings.length !== 21) {
    throw new Error('EXPECTED_197_COUNTRY_21_FACTORY_MATRIX');
  }
  var payload = readJson(resolve(sourcePath));
  var rawRows = Array.isArray(payload) ? payload : (Array.isArray(payload.rows) ? payload.rows : null);
  if (!rawRows) throw new Error('SUBSETS_EXPORT_ROWS_MISSING');
  var dataset = initialDataset(baseline, catalog, mapping);
  var factoryIds = Object.keys(catalog.factoryProfiles).sort();
  var countryRows = Object.values(baseline.countries).sort(function (a, b) { return a.countryId.localeCompare(b.countryId); });
  var mappingByType = Object.fromEntries(mapping.mappings.map(function (row) { return [row.factoryType, row]; }));
  var previousCountries = previous && previous.countries || {};
  var countryBySourceCode = Object.create(null);
  countryRows.forEach(function (country) {
    var old = previousCountries[country.countryId] || {};
    var sourceCode = normalizeSubsetCountryCode(old.sourceCountryCode);
    if (sourceCode) countryBySourceCode[sourceCode] = country.countryId;
    dataset.countries[country.countryId].sourceCountryCode = sourceCode || null;
    dataset.countries[country.countryId].sourceCountryName = old.sourceCountryName || null;
  });
  if (!Object.keys(countryBySourceCode).length) throw new Error('UNIDO_COUNTRY_CODE_MAP_MISSING');
  var allCodes = new Set(mapping.mappings.reduce(function (all, row) { return all.concat(row.activityCodes || []); }, []));
  var observations = extractSubsetEstablishmentObservations(rawRows, allCodes);
  if (!observations.length) {
    var preview = rawRows.slice(0, 8).map(function (row) {
      return {
        country_code: row.country_code,
        indicator_code: row.indicator_code,
        classification_code: row.classification_code,
        classification_combo_code: row.classification_combo_code,
        classification_name: row.classification_name,
        classification_combo_name: row.classification_combo_name,
        year: row.year,
        value: row.value
      };
    });
    throw new Error('SUBSETS_SOURCE_HAS_NO_MATCHING_ISIC4_ROWS:' + JSON.stringify(preview));
  }
  var observationsByCountry = Object.create(null);
  var seenCodes = new Set();
  var sourceCountryNames = Object.create(null);
  observations.forEach(function (row) {
    var countryId = countryBySourceCode[row.countryCode];
    if (!countryId) return;
    var bucket = observationsByCountry[countryId] || (observationsByCountry[countryId] = []);
    bucket.push({ activityCode: row.activityCode, year: row.year, value: row.value });
    seenCodes.add(row.activityCode);
    if (row.countryName) sourceCountryNames[countryId] = row.countryName;
  });
  var observedCountryCount = 0;
  var reportedCount = 0;
  var partialCount = 0;
  var latestYears = [];
  var resultSummary = {};
  countryRows.forEach(function (country) {
    var target = dataset.countries[country.countryId];
    var sourceCode = target.sourceCountryCode;
    var countryObservations = observationsByCountry[country.countryId] || [];
    if (!sourceCode) {
      target.countryStatus = 'COUNTRY_NOT_COVERED';
      factoryIds.forEach(function (type) {
        var codes = mappingByType[type].activityCodes || [];
        target.factoryEstablishments[type] = blank(codes.length ? 'COUNTRY_NOT_COVERED' : 'NOT_COMPARABLE', codes);
      });
      return;
    }
    if (sourceCountryNames[country.countryId]) target.sourceCountryName = sourceCountryNames[country.countryId];
    if (countryObservations.length) {
      observedCountryCount += 1;
      target.countryStatus = 'OBSERVATIONS_AVAILABLE';
      target.latestReferenceYear = Math.max.apply(null, countryObservations.map(function (row) { return row.year; }));
      latestYears.push(target.latestReferenceYear);
    } else {
      target.countryStatus = 'NO_ESTABLISHMENT_OBSERVATIONS';
    }
    factoryIds.forEach(function (type) {
      var oldRecord = previousCountries[country.countryId] &&
        previousCountries[country.countryId].factoryEstablishments &&
        previousCountries[country.countryId].factoryEstablishments[type];
      var next = aggregate(mappingByType[type], countryObservations, allCodes, true);
      if (next.status === 'NOT_REPORTED' && oldRecord &&
          ['REPORTED','PARTIAL','MAPPING_UNAVAILABLE','NOT_REPORTED'].includes(oldRecord.status)) {
        target.factoryEstablishments[type] = oldRecord;
      } else {
        target.factoryEstablishments[type] = next;
      }
    });
  });
  var allRecords = Object.values(dataset.countries).reduce(function (all, country) {
    return all.concat(Object.values(country.factoryEstablishments));
  }, []);
  reportedCount = allRecords.filter(function (row) { return row.status === 'REPORTED'; }).length;
  partialCount = allRecords.filter(function (row) { return row.status === 'PARTIAL'; }).length;
  var coveredCoreCountryCount = countryRows.filter(function (country) {
    return !!dataset.countries[country.countryId].sourceCountryCode;
  }).length;
  var mirrorMetadata = isObject(payload.metadata) ? payload.metadata : {};
  var sourceUpdatedAt = text(mirrorMetadata.updated_at || mirrorMetadata.updatedAt || mirrorMetadata.last_updated || '');
  var sourceLicense = text(mirrorMetadata.license || 'CC BY 4.0');
  var sourceUrl = text(mirrorMetadata.source_url || 'https://stat.unido.org/data/table?dataset=indstat&revision=4');
  var collectionStatus = observations.length
    ? (reportedCount || partialCount ? 'COMPLETED_WITH_GAPS' : 'OBSERVATIONS_IMPORTED_NO_COMPLETE_FACTORY_TOTALS')
    : 'SOURCE_UNAVAILABLE';
  if (!observations.length) throw new Error('SUBSETS_DATA_IMPORT_EMPTY_AFTER_VALIDATION');
  dataset.metadata = Object.assign({}, dataset.metadata, {
    collectionStatus: collectionStatus,
    sourceDatasetId: 'unido-indstat-r4',
    sourceDatasetName: 'UNIDO INDSTAT Revision 4 · mirrored by Subsets.io',
    sourceProductionYear: '2026',
    sourceUpdatedAt: sourceUpdatedAt || 'See Subsets.io dataset metadata',
    retrievedAt: new Date().toISOString(),
    availableCountryCount: 132,
    coveredCoreCountryCount: coveredCoreCountryCount,
    fetchedCoreCountryCount: observedCountryCount,
    reportedRecordCount: reportedCount,
    partialRecordCount: partialCount,
    latestReferenceYear: latestYears.length ? Math.max.apply(null, latestYears) : null,
    responseSummary: {
      OBSERVATIONS_AVAILABLE: observedCountryCount,
      NO_ESTABLISHMENT_OBSERVATIONS: coveredCoreCountryCount - observedCountryCount,
      COUNTRY_NOT_COVERED: 197 - coveredCoreCountryCount
    },
    mirrorProvider: 'Subsets.io',
    mirrorDatasetId: 'unido-indstat-r4',
    mirrorLicense: sourceLicense,
    mirrorSourceUrl: 'https://subsets.io/datasets/unido-indstat-r4',
    originalSourceProvider: 'United Nations Industrial Development Organization',
    originalSourceUrl: sourceUrl,
    activityCodeRowsImported: observations.length,
    classificationCodeField: 'classification_combo_code / classification_combo_name',
    sourceError: null,
    note: 'Establishment counts are official UNIDO statistical establishment observations mirrored via Subsets.io. An establishment is not guaranteed to equal one physical factory site. Complete OMEGA type totals require every mapped ISIC activity in one year; partial sums stay separate and missing values are never zero.'
  });
  writeFileSync(OUTPUT, JSON.stringify(dataset, null, 2) + '\n');
  var result = {
    updated: true,
    countryCount: 197,
    factoryTypeCount: 21,
    recordCount: 4137,
    rawSourceRows: rawRows.length,
    parsedEstablishmentRows: observations.length,
    coveredCoreCountryCount: coveredCoreCountryCount,
    observedCountryCount: observedCountryCount,
    reportedRecordCount: reportedCount,
    partialRecordCount: partialCount,
    latestReferenceYear: dataset.metadata.latestReferenceYear,
    collectionStatus: collectionStatus
  };
  console.log(JSON.stringify(result, null, 2));
  return { updated: true, dataset: dataset, summary: result };
}

function blank(status,codes){return {status,establishmentCount:null,referenceYear:null,partialEstablishmentCount:null,sourceActivityCodes:codes,reportedActivityCodes:[],missingActivityCodes:codes.slice()};}
function initialDataset(baseline,catalog,mapping){
  const types=Object.keys(catalog.factoryProfiles).sort(),rows=Object.values(baseline.countries).sort((a,b)=>a.countryId.localeCompare(b.countryId));
  const mapByType=Object.fromEntries(mapping.mappings.map(x=>[x.factoryType,x]));
  return {schemaVersion:'1.0.0',datasetId:'OMEGA_COUNTRY_FACTORY_ESTABLISHMENTS_V1',version:1,
    purpose:'Real-world source-backed establishment observations separate from OMEGA simulation baseline.',
    metadata:{countryCount:197,factoryTypeCount:21,recordCount:4137,collectionStatus:'NOT_QUERIED',provider:'UNIDO',database:'INDSTAT Revision 4',indicator:'Establishments',indicatorCode:'01',activityClassification:'ISIC_REV4',sourceUrl:'https://stat.unido.org/data/table?dataset=indstat',apiMetadataUrl:META_URL,apiDataUrl:DATA_URL,sourceDatasetId:null,sourceProductionYear:null,sourceUpdatedAt:null,retrievedAt:null,availableCountryCount:null,coveredCoreCountryCount:null,fetchedCoreCountryCount:0,reportedRecordCount:0,partialRecordCount:0,latestReferenceYear:null,responseSummary:{},note:'REPORTED means every mapped ISIC activity was reported for one year. PARTIAL is not a full total. Missing values are not zero.'},
    countries:Object.fromEntries(rows.map(c=>[c.countryId,{countryId:c.countryId,countryName:c.countryName,countryStatus:'NOT_QUERIED',sourceCountryCode:null,sourceCountryName:null,latestReferenceYear:null,
      factoryEstablishments:Object.fromEntries(types.map(t=>{const codes=mapByType[t].activityCodes;return [t,blank(codes.length?'NOT_QUERIED':'NOT_COMPARABLE',codes)];}))}]))};
}
function aggregate(mapRow,observations,sourceCodes,countryCovered){
  const codes=mapRow.activityCodes||[];
  if(!codes.length)return blank('NOT_COMPARABLE',codes);
  if(!countryCovered)return blank('COUNTRY_NOT_COVERED',codes);
  const unsupported=codes.filter(c=>!sourceCodes.has(c)),byYear=new Map();
  for(const row of observations){if(!codes.includes(row.activityCode))continue;const m=byYear.get(row.year)||new Map();m.set(row.activityCode,row.value);byYear.set(row.year,m);}
  let best=null;
  for(const year of [...byYear.keys()].sort((a,b)=>b-a)){
    const values=byYear.get(year),present=codes.filter(c=>values.has(c)),missing=codes.filter(c=>!values.has(c));
    const sum=present.reduce((n,c)=>n+values.get(c),0);
    if(!missing.length&&!unsupported.length)return {status:'REPORTED',establishmentCount:sum,referenceYear:year,partialEstablishmentCount:null,sourceActivityCodes:codes,reportedActivityCodes:present,missingActivityCodes:[]};
    if(present.length&&(!best||present.length>best.reportedActivityCodes.length||(present.length===best.reportedActivityCodes.length&&year>best.referenceYear)))best={referenceYear:year,partialEstablishmentCount:sum,reportedActivityCodes:present,missingActivityCodes:[...missing,...unsupported]};
  }
  if(best)return {status:unsupported.length?'MAPPING_UNAVAILABLE':'PARTIAL',establishmentCount:null,referenceYear:best.referenceYear,partialEstablishmentCount:best.partialEstablishmentCount,sourceActivityCodes:codes,reportedActivityCodes:best.reportedActivityCodes,missingActivityCodes:best.missingActivityCodes};
  return blank(unsupported.length?'MAPPING_UNAVAILABLE':'NOT_REPORTED',codes);
}
async function parallel(items,limit,fn){
  const results=new Array(items.length);let cursor=0;
  async function worker(){while(true){const i=cursor++;if(i>=items.length)return;results[i]=await fn(items[i]);}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return results;
}
export async function buildDataset(){
  const baseline=readJson(BASE),catalog=readJson(CATALOG),mapping=readJson(MAPPING),old=existsSync(OUTPUT)?readJson(OUTPUT):null;
  if(baseline.countryCount!==197||Object.keys(baseline.countries).length!==197||Object.keys(catalog.factoryProfiles).length!==21||mapping.mappings.length!==21)throw new Error('EXPECTED_197_COUNTRY_21_FACTORY_MATRIX');
  const dataset=initialDataset(baseline,catalog,mapping),types=Object.keys(catalog.factoryProfiles).sort(),rows=Object.values(baseline.countries).sort((a,b)=>a.countryId.localeCompare(b.countryId));
  if(old?.datasetId===dataset.datasetId&&isObject(old.countries))for(const countryId of Object.keys(dataset.countries)){
    const previous=old.countries[countryId]?.factoryEstablishments;if(!isObject(previous))continue;
    for(const type of types){const r=previous[type];if(isObject(r)&&['REPORTED','PARTIAL','MAPPING_UNAVAILABLE','NOT_REPORTED'].includes(r.status))dataset.countries[countryId].factoryEstablishments[type]=r;}
  }
  let meta;
  try{meta=await fetchJson(META_URL);}catch(error){
    dataset.metadata.collectionStatus='SOURCE_UNAVAILABLE';dataset.metadata.retrievedAt=new Date().toISOString();dataset.metadata.sourceError=error.message;
    for(const c of Object.values(dataset.countries)){c.countryStatus='SOURCE_UNAVAILABLE';for(const r of Object.values(c.factoryEstablishments))if(r.status==='NOT_QUERIED')r.status='SOURCE_UNAVAILABLE';}
    writeFileSync(OUTPUT,JSON.stringify(dataset,null,2)+'\n');
    console.log(JSON.stringify({updated:true,recordCount:4137,sourceError:error.message}));return {updated:true,dataset};
  }
  const datasetId=meta.id||meta.datasetId,countries=Array.isArray(meta.countries)?meta.countries:[],activities=Array.isArray(meta.activities)?meta.activities:[],variables=Array.isArray(meta.variables)?meta.variables:[];
  const variable=variables.find(v=>text(v.c)==='01'||/establishments/i.test(text(v.lang?.en||v.name))),variableCode=variable&&text(variable.c);
  if(!datasetId||!countries.length||!activities.length||variableCode!=='01')throw new Error('UNIDO_METADATA_SCHEMA_UNSUPPORTED');
  const sourceCodes=new Set(activities.map(a=>text(a.c)).filter(Boolean)),countryByIso3=new Map(countries.map(c=>[text(c.iso3).toUpperCase(),c]));
  const periods=(meta.periods||[]).map(scalar).filter(y=>/^\d{4}$/.test(String(y))),mapByType=Object.fromEntries(mapping.mappings.map(x=>[x.factoryType,x]));
  const requestedActivities=[...new Set(mapping.mappings.flatMap(x=>x.activityCodes||[]))].filter(c=>sourceCodes.has(c));
  const countryResults=await parallel(rows,4,async country=>{
    const output=dataset.countries[country.countryId],source=countryByIso3.get(country.countryId);
    if(!source){output.countryStatus='COUNTRY_NOT_COVERED';for(const t of types){const codes=mapByType[t].activityCodes;output.factoryEstablishments[t]=blank(codes.length?'COUNTRY_NOT_COVERED':'NOT_COMPARABLE',codes);}return {status:'COUNTRY_NOT_COVERED',observations:0};}
    output.countryStatus='UNIDO_COUNTRY_COVERED';output.sourceCountryCode=text(source.c);output.sourceCountryName=text(source.lang?.en||country.countryName);
    try{
      const response=await fetchJson(DATA_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({datasetId,countryCode:output.sourceCountryCode,fullPrecision:true,variableCodes:[variableCode],activities:requestedActivities,periods})});
      const observations=extractEstablishmentObservations(response,sourceCodes),years=observations.map(r=>r.year);
      if(!observations.length) {
        output.countryStatus='NO_PARSEABLE_OBSERVATIONS';
        for(const type of types) {
          const prior=output.factoryEstablishments[type];
          if(prior&&['REPORTED','PARTIAL','MAPPING_UNAVAILABLE','NOT_REPORTED'].includes(prior.status))continue;
          const codes=mapByType[type].activityCodes;
          output.factoryEstablishments[type]=blank(codes.length?'SOURCE_UNAVAILABLE':'NOT_COMPARABLE',codes);
        }
        return {status:'NO_PARSEABLE_OBSERVATIONS',observations:0};
      }
      output.latestReferenceYear=years.length?Math.max(...years):null;
      for(const t of types){const next=aggregate(mapByType[t],observations,sourceCodes,true),prior=output.factoryEstablishments[t];if(next.status==='NOT_REPORTED'&&prior&&['REPORTED','PARTIAL','MAPPING_UNAVAILABLE','NOT_REPORTED'].includes(prior.status))continue;output.factoryEstablishments[t]=next;}
      return {status:output.countryStatus,observations:observations.length};
    }catch(error){
      output.countryStatus='SOURCE_UNAVAILABLE';
      for(const t of types){const prior=output.factoryEstablishments[t];if(prior&&['REPORTED','PARTIAL','MAPPING_UNAVAILABLE','NOT_REPORTED'].includes(prior.status))continue;const codes=mapByType[t].activityCodes;output.factoryEstablishments[t]=blank(codes.length?'SOURCE_UNAVAILABLE':'NOT_COMPARABLE',codes);}
      return {status:'SOURCE_UNAVAILABLE',observations:0,error:error.message};
    }
  });
  const all=Object.values(dataset.countries).flatMap(c=>Object.values(c.factoryEstablishments)),reported=all.filter(r=>r.status==='REPORTED'),partial=all.filter(r=>r.status==='PARTIAL'),years=Object.values(dataset.countries).map(c=>c.latestReferenceYear).filter(Number.isInteger);
  dataset.metadata={...dataset.metadata,collectionStatus:'COMPLETED',sourceDatasetId:datasetId,sourceDatasetName:text(meta.name||'INDSTAT Revision 4'),sourceProductionYear:text(meta.production_year||''),sourceUpdatedAt:text(meta.dat_ins||''),availableCountryCount:countries.length,coveredCoreCountryCount:rows.filter(c=>countryByIso3.has(c.countryId)).length,fetchedCoreCountryCount:countryResults.filter(c=>c.observations>0).length,reportedRecordCount:reported.length,partialRecordCount:partial.length,latestReferenceYear:years.length?Math.max(...years):null,retrievedAt:new Date().toISOString(),responseSummary:countryResults.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})};
  writeFileSync(OUTPUT,JSON.stringify(dataset,null,2)+'\n');
  console.log(JSON.stringify({updated:true,countryCount:197,factoryTypeCount:21,recordCount:4137,sourceCountryCount:dataset.metadata.availableCountryCount,coveredCoreCountryCount:dataset.metadata.coveredCoreCountryCount,fetchedCoreCountryCount:dataset.metadata.fetchedCoreCountryCount,reportedRecordCount:reported.length,partialRecordCount:partial.length,responseSummary:dataset.metadata.responseSummary},null,2));
  return {updated:true,dataset};
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  var subsetArg = process.argv.indexOf('--subsets-json');
  var run = subsetArg >= 0
    ? buildDatasetFromSubsetJson(process.argv[subsetArg + 1])
    : buildDataset();
  run.catch(function (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
