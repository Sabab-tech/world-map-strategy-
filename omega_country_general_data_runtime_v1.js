/* OMEGA Country General Data Runtime v1.0.0
 * Single source: country_general_data_registry_v1.json.
 * Decodes the compact registry; no duplicate country facts or simulation-state writes.
 */
(function(root){
'use strict';
const VERSION='1.0.0',DATA_URL='./country_general_data_registry_v1.json';
const s={promise:null,ready:false,settled:false,error:null,data:null,schema:null,byAlias:new Map(),fields:new Map()};
const str=v=>String(v==null?'':v).trim();
const n=v=>typeof v==='number'&&Number.isFinite(v)?v:(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a=0,b=1)=>n(v)===null?null:Math.max(a,Math.min(b,n(v)));
const norm=v=>str(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' AND ').replace(/[_'-]+/g,' ').replace(/[^A-Z0-9]+/gi,' ').trim().toUpperCase().replace(/\s+/g,' ');
const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const currentYear=()=>new Date().getUTCFullYear();
function inferredSourceConfidence(value,status,sourceId,sourceName,method,year,persisted){
 if(n(value)===null)return 0;
 const saved=clamp(persisted);
 if(saved!==null)return saved;
 const st=str(status).toUpperCase(),source=!!(str(sourceId)||str(sourceName)),m=str(method).toUpperCase();
 let confidence=.32;
 if(st==='WORLD_BANK_API_OBSERVATION')confidence=.92;
 else if(st==='DERIVED_SAME_YEAR_OBSERVATIONS')confidence=.80;
 else if(st==='SOURCE_OBSERVATION'||m==='SOURCE_OBSERVATION')confidence=.84;
 else if(/MODELED|MODELLED|SIMULATION|GAMEPLAY|LOCAL_/.test(st))confidence=.46;
 else if(source)confidence=.58;
 if(!source)confidence=Math.min(confidence,.32);
 if(n(year)===null)confidence=Math.min(confidence,.68);
 return Number(Math.max(0,Math.min(1,confidence)).toFixed(3));
}
function metricFreshness(year){
 const y=n(year);if(y===null)return .72;
 const age=Math.max(0,currentYear()-y);
 return Number((age<=2?1:Math.max(.25,1-.055*(age-2))).toFixed(3));
}
function inferredDataGap(value,status,sourceId,sourceName,year,persisted){
 if(str(persisted))return str(persisted);
 const st=str(status).toUpperCase();
 if(n(value)===null){
  if(st.includes('SOURCE_REFRESH_FAILED'))return 'SOURCE_REFRESH_FAILED';
  if(st.includes('NO_SOURCE_OBSERVATION'))return 'NO_SOURCE_OBSERVATION';
  return 'MISSING_OBSERVATION';
 }
 if(!str(sourceId)&&!str(sourceName))return 'SOURCE_METADATA_MISSING';
 if(n(year)===null)return 'OBSERVATION_YEAR_UNKNOWN';
 if(/NOT_EXTERNALLY_REVALIDATED|LEGACY/.test(st))return 'LEGACY_SOURCE_NOT_REVALIDATED';
 if(/MODELED|MODELLED|SIMULATION|GAMEPLAY|LOCAL_/.test(st))return 'UNVERIFIED_OR_MODELLED_SOURCE';
 return null;
}
function init(){if(s.promise)return s.promise;s.promise=(async()=>{try{
 if(typeof root.fetch!=='function')throw Error('FETCH_UNAVAILABLE');
 const res=await root.fetch(DATA_URL,{cache:'default'});if(!res||res.ok===false)throw Error('COUNTRY_GENERAL_DATA_FETCH_FAILED');
 const data=await res.json(),schema=data?.metadata?.recordSchema;
 if(!Array.isArray(data?.countries)||!Array.isArray(schema?.identityFields)||!Array.isArray(schema?.generalFactFields)||!Array.isArray(schema?.metricFields))throw Error('COUNTRY_GENERAL_DATA_SCHEMA_INVALID');
 s.data=data;s.schema=schema;s.byAlias.clear();s.fields.clear();
 (data.fieldCatalogue||[]).forEach(f=>{if(f?.key)s.fields.set(f.key,f)});
 data.countries.forEach(row=>(row.identity||[]).forEach((v,i)=>{const k=norm(v);if(k&&!s.byAlias.has(k))s.byAlias.set(k,row);if(['iso2','iso3','countryCode','numericCode'].includes(schema.identityFields[i])&&k)s.byAlias.set(k,row)}));
 if(!s.byAlias.size)throw Error('COUNTRY_GENERAL_DATA_IDENTITY_INDEX_EMPTY');
 s.ready=true;s.settled=true;s.error=null;return true;
}catch(e){s.ready=false;s.settled=true;s.error=String(e?.message||e);return false}})();return s.promise}
function candidates(v){
 if(obj(v))return [v.countryCode,v.iso2,v.iso3,v.countryId,v.country_id,v.code,v.name].filter(x=>x!=null);
 const out=[v];try{const p=root.OmegaCountryRuntimeData?.resolveCountry?.(v);if(p)out.push(p.countryCode,p.iso2,p.iso3,p.name,p.officialName,p.economyKey)}catch(_){}
 try{const b=root.OmegaCanonicalIdentityRegistry||root.OmegaCountrySemanticBridge||root.Omega?.CanonicalIdentity,p=b?.resolveCountry?.(v);if(p)out.push(p.id,p.iso2,p.iso3,p.name,p.raw?.name)}catch(_){}
 return out.filter(x=>x!=null)
}
function find(v){if(!s.ready)return null;for(const x of candidates(v)){const r=s.byAlias.get(norm(x));if(r)return r}return null}
function map(fields,values){const out={};if(Array.isArray(fields)&&Array.isArray(values))fields.forEach((k,i)=>out[k]=values[i]===undefined?null:values[i]);return out}
function code(list,v){const i=n(v);return i===null||i<0||!Array.isArray(list)?null:(list[i]===undefined?null:list[i])}
function decode(row){
 const schema=s.schema,enc=s.data.metadata.provenanceEncoding||{},identity=map(schema.identityFields,row.identity),generalFacts=map(schema.generalFactFields,row.generalFacts),metrics=map(schema.metricFields,row.metrics),a=row.metricMetadata||{},metricMetadata={};
 schema.metricFields.forEach((k,i)=>{
  const observedYear=n(a.years?.[i]),status=code(enc.statuses,a.statusCodes?.[i]),sourceId=code(enc.sourceIds,a.sourceCodes?.[i]),sourceName=code(enc.sourceNames,a.sourceNameCodes?.[i]),method=code(enc.methods,a.methodCodes?.[i]),value=metrics[k];
  const sourceConfidence=inferredSourceConfidence(value,status,sourceId,sourceName,method,observedYear,a.confidenceScores?.[i]);
  const freshness=value===null?0:metricFreshness(observedYear);
  metricMetadata[k]={year:observedYear,status,sourceId,sourceName,method,sourceUrl:a.sourceUrls?.[i]??null,note:a.notes?.[i]??null,sourceConfidence,freshness,confidence:Number((sourceConfidence*freshness).toFixed(3)),dataGap:inferredDataGap(value,status,sourceId,sourceName,observedYear,a.dataGaps?.[i]),isCurrentGameState:false};
 });
 const nr=map(schema.naturalResourceFields,row.naturalResources);nr.mineralResourceBase=map(schema.mineralResourceFields,nr.mineralResourceBase);nr.hydrocarbonResourceBase=map(schema.hydrocarbonResourceFields,nr.hydrocarbonResourceBase);nr.energyResourceBase=map(schema.energyResourceFields,nr.energyResourceBase);
 const ps=map(schema.publicSafetyFields,row.publicSafety);ps.baselinePolice=map(schema.policeBaselineFields,ps.baselinePolice);ps.observedHomicide=map(schema.observedHomicideFields,ps.observedHomicide);
 ps.crimeRatesPer100k=map(schema.crimeFields,ps.crimeRatesPer100k);ps.crimeRateSources=map(schema.crimeFields,ps.crimeRateSources);ps.estimatedAnnualIncidents=map(schema.crimeFields,ps.estimatedAnnualIncidents);
 ps.fleetSummary=map(schema.fleetSummaryFields,ps.fleetSummary);ps.countryContext=map(schema.countryContextFields,ps.countryContext);
 if(Array.isArray(ps.countryContext.environmentMixPct))ps.countryContext.environmentMixPct=map(schema.environmentMixFields,ps.countryContext.environmentMixPct);
 const geo=map(schema.localGeographyFields,row.localGeography);if(Array.isArray(geo.economicCenters))geo.economicCenters=geo.economicCenters.map(x=>Array.isArray(x)?{name:x[0]??null,description:x[1]??null}:x);
 return {identity,generalFacts,metrics,metricMetadata,naturalResources:nr,publicSafety:ps,localGeography:geo,dataStatus:map(schema.dataStatusFields,row.dataStatus),datasetId:s.data.metadata.datasetId||'OMEGA_COUNTRY_GENERAL_DATA_REGISTRY_V1',schemaVersion:s.data.metadata.schemaVersion||null}
}
function getCountryRecord(v){const r=find(v);return r?decode(r):null}
function metric(r,k){return r?n(r.metrics?.[k]):null}
function year(r,k){return r?n(r.metricMetadata?.[k]?.year):null}
const normWgi=v=>v===null?null:clamp((v+2.5)/5);
function dim(entries,formula){
 const e=entries.filter(x=>x&&n(x.value)!==null).map(x=>({metric:x.metric,value:clamp(x.value),year:x.year??null,source:x.source??null,confidence:clamp(x.confidence??.5),dataGap:x.dataGap??null}));
 return e.length?{value:Number((e.reduce((a,x)=>a+x.value,0)/e.length).toFixed(4)),availability:'DERIVED_HEURISTIC',source:'OMEGA_COUNTRY_GENERAL_DATA_REGISTRY_V1',confidence:Number((e.reduce((a,x)=>a+x.confidence,0)/e.length).toFixed(3)),formula,evidence:e}:{value:null,availability:'UNOBSERVED',source:null,confidence:0,formula:null,evidence:[],dataGaps:[]}
}
function ev(r,k,fn){
 const v=metric(r,k),m=r?.metricMetadata?.[k]||{};
 return v===null?null:{metric:k,value:fn(v),year:year(r,k),source:m.sourceName||m.sourceId||'country_general_data_registry_v1.json',status:m.status||'SOURCE_STATUS_NOT_RECORDED',confidence:m.confidence??0,sourceConfidence:m.sourceConfidence??0,freshness:m.freshness??null,dataGap:m.dataGap??null};
}
function trade(r){
 const keys=['gdpCurrentUsd','exportsUsd','importsUsd'],v=keys.map(k=>metric(r,k)),y=keys.map(k=>year(r,k));
 if(v.some(x=>x===null)||v[0]<=0||y.some(x=>x===null)||!y.every(x=>x===y[0]))return null;
 const ratio=(v[1]+v[2])/v[0];if(ratio<0)return null;
 const evidence=keys.map(k=>({metric:k,value:metric(r,k),year:year(r,k),source:r.metricMetadata[k]?.sourceName||r.metricMetadata[k]?.sourceId||'country_general_data_registry_v1.json',status:r.metricMetadata[k]?.status||null,confidence:r.metricMetadata[k]?.confidence??0,dataGap:r.metricMetadata[k]?.dataGap??null}));
 return{metric:'same-year (exports + imports) / GDP',value:clamp(ratio/(1+ratio)),year:y[0],source:'DERIVED_SAME_YEAR_OBSERVATIONS',status:'DERIVED_SAME_YEAR_OBSERVATIONS',confidence:Number(Math.min(...keys.map(k=>r.metricMetadata[k]?.confidence??0)).toFixed(3)),evidence};
}
function getBehaviorProfile(v){
 const r=getCountryRecord(v);if(!r)return{countryId:str(v).toUpperCase(),availability:'UNOBSERVED',source:null,dimensions:{}};
 const t=trade(r),fiscal=dim([ev(r,'budgetBalancePctGdp',x=>clamp(.5+x/20)),ev(r,'publicDebtToGdpPct',x=>1-clamp(x/200)),ev(r,'inflationPct',x=>1-clamp(Math.abs(x)/30))],'mean of observed fiscal balance, inverse public-debt burden and inverse inflation pressure');
 const risk=dim([ev(r,'militaryExpenditurePctGdp',x=>x<0?null:clamp(x/(x+4))),ev(r,'gdpGrowthPct',x=>clamp(.5+x/20))],'military intensity and normalized GDP growth; gameplay prior, not observed doctrine');
 const research=ev(r,'rAndDSpendPctGdp',x=>clamp(x/5)),education=ev(r,'educationSpendPctGdp',x=>clamp(x/10)),industrial=ev(r,'industryValueAddedPctGdp',x=>clamp(x/100)),agri=ev(r,'agricultureValueAddedPctGdp',x=>clamp(x/100));
 const dimensions={
 riskAppetite:risk,
 diplomaticPreference:dim([t,ev(r,'voiceAccountabilityWgiEstimate',normWgi)],'same-year trade openness and normalized voice/accountability estimate'),
 fiscalDiscipline:fiscal,
 mobilizationTolerance:dim([ev(r,'militaryExpenditurePctGdp',x=>x<0?null:clamp(x/(x+4))),fiscal.value===null?null:{metric:'derived fiscalDiscipline',value:fiscal.value}],'military expenditure and fiscal-discipline prior'),
 strategicTimeHorizon:dim([research,education,fiscal.value===null?null:{metric:'derived fiscalDiscipline',value:fiscal.value}],'R&D, education spending and fiscal-discipline prior'),
 tradeDependence:dim([t],'same-year (exports + imports) / GDP compressed to 0-1; unavailable if observation years differ'),
 selfSufficiencyPriority:dim([t?{metric:'inverse trade openness',value:1-t.value,year:t.year}:null,industrial,agri],'inverse trade openness and industry/agriculture composition'),
 innovationPreference:dim([research,ev(r,'internetUsersPct',x=>clamp(x/100)),ev(r,'electricityAccessPct',x=>clamp(x/100)),education],'normalized R&D, internet, electricity and education indicators'),
 domesticStabilityPriority:dim([ev(r,'politicalStabilityWgiEstimate',x=>1-normWgi(x)),ev(r,'unemploymentRatePct',x=>clamp(x/30)),ev(r,'inflationPct',x=>clamp(Math.abs(x)/30)),ev(r,'homicideRatePer100k',x=>clamp(x/40))],'political stability and observed unemployment/inflation/homicide pressure'),
 escalationTolerance:dim([ev(r,'militaryExpenditurePctGdp',x=>x<0?null:clamp(x/(x+4))),t?{metric:'inverse trade openness',value:1-t.value,year:t.year}:null,risk.value===null?null:{metric:'derived riskAppetite',value:risk.value}],'military expenditure, inverse trade openness and derived risk prior; not factual intent')
 };
 const count=Object.values(dimensions).filter(x=>x.value!==null).length;
  const metricSources=Object.fromEntries(Object.entries(r.metricMetadata||{}).map(([key,meta])=>[key,{value:r.metrics[key]??null,...meta}]));
  const dataGaps=Object.entries(metricSources).filter(([,meta])=>meta.dataGap).map(([metric,meta])=>({metric,reason:meta.dataGap,year:meta.year??null,sourceId:meta.sourceId??null}));
  return{countryId:r.identity.iso3||r.identity.iso2||str(v).toUpperCase(),availability:count?'DERIVED':'UNOBSERVED',source:count?'OMEGA_COUNTRY_GENERAL_DATA_REGISTRY_V1':null,modelVersion:VERSION,dimensions,metricSources,dataGaps,missingMetricCount:Object.values(r.metrics).filter(x=>n(x)===null).length};
}
function diagnostics(){return{version:VERSION,ready:s.ready,settled:s.settled,error:s.error,recordCount:s.data?.countries?.length||0,aliasCount:s.byAlias.size,datasetId:s.data?.metadata?.datasetId||null,dataUrl:DATA_URL}}
const API=Object.freeze({VERSION,DATA_URL,init,diagnostics,resolveCountry:v=>getCountryRecord(v)?.identity||null,getCountryRecord,getBehaviorProfile});
root.Omega=root.Omega||{};root.Omega.CountryGeneralData=API;root.OmegaCountryGeneralDataRuntime=API;
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const show=v=>v==null||v===''?'NOT RECORDED':typeof v==='boolean'?(v?'YES':'NO'):Array.isArray(v)?(v.length?v.map(show).join(', '):'NOT RECORDED'):obj(v)?(Object.values(v).some(x=>x!=null&&x!=='')?Object.values(v).filter(x=>x!=null&&x!=='').map(show).join(', '):'NOT RECORDED'):typeof v==='number'?v.toLocaleString('en-US',{maximumFractionDigits:2}):str(v).replace(/_/g,' ');
const first=(o,keys)=>{for(const k of keys)if(o&&o[k]!=null&&o[k]!=='')return o[k];return null};
function card(r,k){const f=s.fields.get(k)||{},v=r.metrics[k],m=r.metricMetadata[k]||{};let val=show(v);if(n(v)!==null){val=/USD/.test(f.unit||'')?'$'+new Intl.NumberFormat('en-US',{notation:Math.abs(v)>=1e6?'compact':'standard',maximumFractionDigits:2}).format(v):new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)+(/%/.test(f.unit||'')?'%':'')}
return'<div style="padding:9px;border-radius:9px;background:rgba(15,23,42,.62);border:1px solid rgba(100,116,139,.24);min-width:0"><div style="font-size:11px;color:#a5b4fc">'+esc(f.name||k)+'</div><div style="font-size:15px;font-weight:700;color:#f8fafc;overflow-wrap:anywhere;margin:5px 0">'+esc(val)+'</div><div style="font-size:10px;color:#94a3b8">'+esc((m.year==null?'YEAR NOT RECORDED':'YEAR '+m.year)+' · '+(m.sourceName||m.sourceId||m.status||'PROVENANCE NOT RECORDED'))+'</div></div>'}
function section(r,title,keys){const selected=(s.schema.metricFields||[]).filter(k=>keys.includes(k));return selected.length?'<details style="margin-top:9px;border:1px solid rgba(148,163,184,.2);border-radius:10px"><summary style="cursor:pointer;padding:10px 12px;color:#c7d2fe;font-size:12px;font-weight:700">'+esc(title)+'</summary><div style="padding:0 10px 10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px">'+selected.map(k=>card(r,k)).join('')+'</div></details>':''}
function fact(label,value){return'<div style="padding:8px;border-radius:8px;background:rgba(255,255,255,.045);border:1px solid rgba(148,163,184,.14);min-width:0"><div style="font-size:10px;color:#94a3b8;text-transform:uppercase">'+esc(label)+'</div><div style="font-size:12px;color:#e2e8f0;overflow-wrap:anywhere;margin-top:3px">'+esc(show(value))+'</div></div>'}
function render(country){
 const r=getCountryRecord(country),cid=str(country).toUpperCase();if(!r)return'<section data-omega-country-general-panel data-country-id="'+esc(cid)+'"><strong>COUNTRY GENERAL DATA</strong><p>Profile unavailable: '+esc(s.error||'identity not found')+'</p></section>';
 const i=r.identity,f=r.generalFacts,g=r.localGeography||{},nr=r.naturalResources||{},ps=r.publicSafety||{},name=first(i,['name','officialName','countryName'])||cid,centers=Array.isArray(g.economicCenters)?g.economicCenters:[];
 const capital=first(f,['capital','capitalCity','capitalName'])||(root.OmegaCountryRuntimeData&&typeof root.OmegaCountryRuntimeData.getCapital==='function'?root.OmegaCountryRuntimeData.getCapital(country):null);
 let localCities=null;try{const runtime=root.OmegaCountryRuntimeData,rows=runtime&&typeof runtime.getCities==='function'?runtime.getCities(country):null;if(Array.isArray(rows)&&rows.length)localCities=rows.length}catch(_){}
 const general=[['Capital',capital],['Official name',first(i,['officialName','official_name'])||first(f,['officialName','official_name'])],['Continent / subregion',[first(i,['continent']),first(i,['subregion'])].filter(Boolean).join(' / ')||null],['Languages',first(f,['languages','language','officialLanguages'])],['Currencies',first(f,['currencies','currencyCodes','currencyNames'])],['Area',first(f,['areaKm2','area','areaSquareKm'])],['Landlocked',first(f,['landlocked'])],['Borders',first(f,['borders','borderCountries'])],['Time zones',first(f,['timeZones','timezones'])],['UN membership',first(f,['unMember','unMembership'])],['World Bank region / income',[first(f,['worldBankRegion','region']),first(f,['worldBankIncomeLevel','incomeLevel'])].filter(Boolean).join(' / ')||null],['Lending classification',first(f,['worldBankLendingType','lendingType'])],['Major-city baseline',first(g,['majorCityCount'])],['Cities in local catalogue',localCities],['Economic hub count',first(g,['economicHubCount'])??(centers.length||null)],['Catalogued economic centers',centers.length||null]];
 const groups=[...Object.entries(nr.mineralResourceBase||{}),...Object.entries(nr.hydrocarbonResourceBase||{}),...Object.entries(nr.energyResourceBase||{})].filter(([,v])=>Array.isArray(v)&&v.length).map(([k])=>k),all=s.schema.metricFields||[],missing=all.filter(k=>r.metrics[k]==null).length,top=['populationTotal','gdpCurrentUsd','gdpGrowthPct','militaryExpenditurePctGdp'].filter(k=>all.includes(k));
 const info='<div style="padding:9px;display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:7px">'+general.map(x=>fact(x[0],x[1])).join('')+'</div>';
 return'<section data-omega-country-general-panel data-country-id="'+esc(cid)+'" style="margin-top:13px;padding:11px;border-radius:12px;background:linear-gradient(145deg,#0b1220,#111c30);color:#e2e8f0;border:1px solid rgba(129,140,248,.38)"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><div style="font-size:10px;letter-spacing:.12em;color:#a5b4fc;font-weight:700">COUNTRY OVERVIEW · GENERAL DATA</div><h3 style="font-size:17px;margin:5px 0;color:#f8fafc">'+esc(show(name))+'</h3></div><span style="font-size:10px;border:1px solid #475569;border-radius:99px;padding:5px 8px">'+esc(r.datasetId)+'</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px;margin-top:8px">'+top.map(k=>card(r,k)).join('')+'</div><details open style="margin-top:9px;border:1px solid rgba(148,163,184,.2);border-radius:10px"><summary style="cursor:pointer;padding:10px 12px;color:#c7d2fe;font-size:12px;font-weight:700">IDENTITY & GENERAL FACTS</summary>'+info+'</details>'+section(r,'ECONOMY & DEMOGRAPHICS',['populationGrowthPct','population2015','gdpPerCapitaUsd','inflationPct','unemploymentRatePct','publicDebtToGdpPct','externalDebtUsd','externalDebtToGniPct','budgetBalancePctGdp','tradeBalanceUsd','tradeBalanceToGdpPct','exportsUsd','importsUsd','fxReservesUsd','fxReservesToGdpPct','governmentRevenuePctGdp','governmentExpenditurePctGdp','taxRevenuePctGdp','agricultureValueAddedPctGdp','industryValueAddedPctGdp','servicesValueAddedPctGdp'])+section(r,'POLITICS & GOVERNANCE',['politicalStabilityWgiEstimate','ruleOfLawWgiEstimate','controlOfCorruptionWgiEstimate','governmentEffectivenessWgiEstimate','regulatoryQualityWgiEstimate','voiceAccountabilityWgiEstimate','democracyIndex','corruptionPerceptionIndex','fragileStatesIndex','pressFreedomIndex','globalPeaceIndexRank','humanDevelopmentIndex','povertyRatePct'])+section(r,'MILITARY & PUBLIC SAFETY',['militaryExpenditurePctGdp','homicideRatePer100k'])+section(r,'TECHNOLOGY, INFRASTRUCTURE & SERVICES',['internetUsersPct','electricityAccessPct','rAndDSpendPctGdp','healthSpendPctGdp','educationSpendPctGdp','lifeExpectancyYears','urbanizationPct','co2TonnesPerCapita'])+'<details style="margin-top:9px;border:1px solid rgba(148,163,184,.2);border-radius:10px"><summary style="cursor:pointer;padding:10px 12px;color:#c7d2fe;font-size:12px;font-weight:700">NATURAL RESOURCES & PUBLIC SAFETY</summary><div style="padding:9px;display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:7px">'+fact('Resource-context status',nr.coverageStatus)+fact('Recorded resource groups',groups.length?groups.join(', '):null)+fact('Police baseline source',ps.baselinePolice?.source)+fact('Staffing baseline per 100k',ps.baselinePolice?.staffingRatePer100k)+'</div></details><div style="font-size:10px;line-height:1.5;color:#94a3b8;margin-top:9px">Data coverage: '+esc(all.length-missing)+'/'+esc(all.length)+' metrics populated. NOT RECORDED means unknown/unavailable, not zero. Sources and observation years are shown per metric; reference values do not overwrite live simulation state.</div></section>'
}
function installUI(){const ios=root.CountryIOS;if(!ios||typeof ios.renderChapter1_Overview!=='function'||ios.__omegaGeneralDataWrapped)return false;const original=ios.renderChapter1_Overview;ios.renderChapter1_Overview=function(){const args=Array.from(arguments),country=args[0]||this.activeCountry||root.OmegaMinistryViewCountry||'USA',base=original.apply(this,args),placeholder='<section data-omega-country-general-panel data-country-id="'+esc(country)+'" style="margin-top:12px;padding:12px;border-radius:12px;background:#0f172a;color:#cbd5e1;border:1px solid #334155"><strong>COUNTRY GENERAL DATA</strong><p>Loading shared country profile…</p></section>';init().then(refresh);return base+placeholder};Object.defineProperty(ios,'__omegaGeneralDataWrapped',{value:true});return true}
function refresh(){if(!root.document||!s.ready)return;root.document.querySelectorAll('[data-omega-country-general-panel]').forEach(p=>{const c=p.getAttribute('data-country-id')||root.CountryIOS?.activeCountry||'USA';p.outerHTML=render(c)})}
if(root.document){installUI();init().then(refresh)}
})(typeof window!=='undefined'?window:globalThis);
