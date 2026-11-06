/* OMEGA PRIVATE ENTERPRISE BASELINE REGISTRY v1.0.0
 * Read-only baseline lookup. No production assets, procurement, stock, money or shipment mutation.
 * Private production remains gated on the SAB-42 real-game supply-chain proof.
 */
(function(g){'use strict';
var VERSION='1.0.0',DATA_PATH='./country_private_factory_starting_baseline_v1.json';
var COMPANY_IDS=['AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES','ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'];
var loaded=null,promise=null,errorText=null;
function obj(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function clone(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);var o={};Object.keys(v).forEach(function(k){if(k!=='__proto__'&&k!=='constructor')o[k]=clone(v[k]);});return o;}
function cid(v){var raw=String(v==null?'':v).trim().toUpperCase(),r=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||(g.Omega&&g.Omega.CanonicalIdentity);try{var x=r&&r.resolveCountry?r.resolveCountry(v):null;if(x&&(x.id||x.canonicalId))return String(x.id||x.canonicalId).toUpperCase();}catch(_){}return raw;}
function governmentApi(){return g.OmegaCountryFactoryStartingBaselineV1||(g.Omega&&g.Omega.CountryFactoryStartingBaselineV1)||null;}
function event(type,detail){try{if(g.dispatchEvent&&g.CustomEvent)g.dispatchEvent(new g.CustomEvent(type,{detail:clone(detail||{})}));}catch(_){}}
function fetchData(){
 if(!g.fetch)return Promise.reject(Error('PRIVATE_FACTORY_BASELINE_FETCH_UNAVAILABLE'));
 var controller=g.AbortController?new g.AbortController():null,timer=null,schedule=g.setTimeout?g.setTimeout.bind(g):null,cancel=g.clearTimeout?g.clearTimeout.bind(g):null;
 var request=Promise.resolve().then(function(){return g.fetch(DATA_PATH,{cache:'default',signal:controller?controller.signal:undefined});}).then(function(r){if(!r||r.ok===false)throw Error('PRIVATE_FACTORY_BASELINE_FETCH_FAILED');return r.json();});
 if(!schedule)return request;
 var deadline=new Promise(function(_,reject){timer=schedule(function(){try{if(controller)controller.abort();}catch(_){}reject(Error('PRIVATE_FACTORY_BASELINE_FETCH_TIMEOUT'));},12000);});
 return Promise.race([request,deadline]).finally(function(){if(timer!==null&&cancel)try{cancel(timer);}catch(_){}});
}
function validate(data,api){
 if(!obj(data)||data.datasetId!=='OMEGA_COUNTRY_PRIVATE_FACTORY_STARTING_BASELINE_V1'||data.countryCount!==197||data.factoryTypeCount!==21||data.companyCount!==5||!obj(data.countries)||!Array.isArray(data.factoryTypes)||!Array.isArray(data.companies))throw Error('PRIVATE_FACTORY_BASELINE_SCHEMA_INVALID');
 if(data.companies.map(function(x){return x.id;}).join('|')!==COMPANY_IDS.join('|'))throw Error('PRIVATE_COMPANY_IDENTITY_ROSTER_INVALID');
 var types=data.factoryTypes.map(function(x){return String(x.id||'').toUpperCase();}),countries=Object.keys(data.countries),total=0;
 if(countries.length!==197||new Set(countries).size!==197)throw Error('PRIVATE_COUNTRY_ROSTER_INVALID');
 if(!api||typeof api.getCountryBaseline!=='function')throw Error('GOVERNMENT_FACTORY_BASELINE_API_UNAVAILABLE');
 countries.forEach(function(country){
  var row=data.countries[country],gov=api.getCountryBaseline(country);
  if(!obj(row)||row.countryId!==country||!gov||!obj(row.factoryCounts)||!obj(row.companyFactoryCounts))throw Error('PRIVATE_COUNTRY_ROW_INVALID:'+country);
  if(Object.keys(row.factoryCounts).sort().join('|')!==types.slice().sort().join('|')||Object.keys(row.companyFactoryCounts).sort().join('|')!==COMPANY_IDS.slice().sort().join('|'))throw Error('PRIVATE_CATEGORY_OR_COMPANY_ROSTER_INVALID:'+country);
  types.forEach(function(type){
   var governmentCount=Number(gov.factoryCounts[type]),privateCount=row.factoryCounts[type],assigned=0;
   if(!Number.isInteger(privateCount)||privateCount<0)throw Error('PRIVATE_FACTORY_COUNT_INVALID:'+country+':'+type);
   if(governmentCount===0&&privateCount!==0)throw Error('PRIVATE_ZERO_CATEGORY_NONZERO:'+country+':'+type);
   if(privateCount>Math.floor(governmentCount*.6+1e-9))throw Error('PRIVATE_FACTORY_OVER_60_PERCENT:'+country+':'+type);
   COMPANY_IDS.forEach(function(company){var n=row.companyFactoryCounts[company]&&row.companyFactoryCounts[company][type];if(!Number.isInteger(n)||n<0)throw Error('PRIVATE_COMPANY_COUNT_INVALID:'+country+':'+company);assigned+=n;});
   if(assigned!==privateCount)throw Error('PRIVATE_COMPANY_SUM_MISMATCH:'+country+':'+type);
  });
  total+=Number(row.totalPrivateFactoryUnits)||0;
 });
 if(total!==Number(data.totalPrivateFactoryUnits))throw Error('PRIVATE_WORLD_TOTAL_MISMATCH');
 return{countryCount:197,factoryTypeCount:21,companyCount:5,totalPrivateFactoryUnits:total};
}
function init(){
 if(promise)return promise;
 promise=Promise.resolve().then(function(){
  var api=governmentApi();if(!api||!api.ready)throw Error('GOVERNMENT_FACTORY_BASELINE_NOT_READY');
  return Promise.resolve(api.ready).then(function(ready){if(!ready||ready.status!=='READY')throw Error('GOVERNMENT_FACTORY_BASELINE_BLOCKED');return fetchData().then(function(data){var report=validate(data,api);loaded=data;errorText=null;var result={version:VERSION,status:'READY',diagnostics:report,runtimeMode:'STATIC_BASELINE_ONLY',productionEnabled:false};event('OMEGA_PRIVATE_ENTERPRISE_BASELINE_READY',result);return result;});});
 }).catch(function(e){loaded=null;errorText=String(e&&e.message||e);promise=null;event('OMEGA_PRIVATE_ENTERPRISE_BASELINE_FAILED',{version:VERSION,status:'BLOCKED',reason:errorText});return{version:VERSION,status:'BLOCKED',reason:errorText};});
 return promise;
}
function getCountryBaseline(countryId){
 if(!loaded)return{status:errorText?'BLOCKED':'LOADING',reason:errorText||null};
 // The baseline is keyed by the government's canonical ISO3 country IDs.
 // Prefer an exact data key before consulting the UI alias resolver: some
 // identity resolvers expose an ISO2 id (for example US) for an ISO3 key (USA).
 var rawCountry=String(countryId==null?'':countryId).trim().toUpperCase();
 var row=rawCountry&&loaded.countries[rawCountry];
 if(!row){var canonical=cid(countryId);row=canonical&&loaded.countries[canonical];}
 if(!row)return null;
 return{status:'READY',countryId:row.countryId,countryName:row.countryName,industryArchetype:row.industryArchetype,
 totalGovernmentFactoryUnits:row.totalGovernmentFactoryUnits,totalPrivateFactoryUnits:row.totalPrivateFactoryUnits,
 privateToGovernmentBaselinePercent:row.privateToGovernmentBaselinePercent,factoryCounts:clone(row.factoryCounts),
 categoryParticipationPercent:clone(row.categoryParticipationPercent),
 companies:loaded.companies.map(function(company){var counts=clone(row.companyFactoryCounts[company.id]||{});return{companyId:company.id,companyName:company.name,sectorAffinity:company.sectorAffinity,factoryCounts:counts,totalFactoryUnits:Object.keys(counts).reduce(function(s,k){return s+Number(counts[k]||0);},0)};}),
 allocationStatus:row.allocationStatus,ownershipStatus:'STATIC_STARTING_ALLOCATION_NOT_COMMISSIONED',productionEnabled:false,
 source:'OMEGA_COUNTRY_PRIVATE_FACTORY_STARTING_BASELINE_V1'};
}
function diagnostics(){return{version:VERSION,status:loaded?'READY':errorText?'BLOCKED':promise?'LOADING':'NOT_READY',reason:errorText,countryCount:loaded?loaded.countryCount:0,factoryTypeCount:loaded?loaded.factoryTypeCount:0,companyCount:loaded?loaded.companyCount:0,totalPrivateFactoryUnits:loaded?loaded.totalPrivateFactoryUnits:0,runtimeMode:'STATIC_BASELINE_ONLY',productionEnabled:false,sourcePath:DATA_PATH};}
var API=Object.freeze({VERSION:VERSION,init:init,get ready(){return init();},getCountryBaseline:getCountryBaseline,getCompanyRegistry:function(){return loaded?clone(loaded.companies):{status:errorText?'BLOCKED':'LOADING',reason:errorText||null};},diagnostics:diagnostics,getSourceStatus:diagnostics});
g.OmegaPrivateEnterpriseRegistryV1=API;g.Omega=g.Omega||{};g.Omega.PrivateEnterpriseRegistryV1=API;
if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:window);
