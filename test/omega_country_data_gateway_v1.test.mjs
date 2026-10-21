import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../omega_country_data_gateway_v1.js', import.meta.url), 'utf8');
function fixture({ live = {}, economy = {}, population = {}, general = {}, world = null, roster = null, society = null } = {}) {
  const identities = {
    BD: { countryCode:'BD',iso2:'BD',iso3:'BGD',numericCode:'050',name:'Bangladesh',officialName:"People's Republic of Bangladesh",sourceValues:{gdp:460000000000},populationValues:{population_2015:156000000} },
    US: { countryCode:'US',iso2:'US',iso3:'USA',numericCode:'840',name:'United States',officialName:'United States',sourceValues:{gdp:27000000000000},populationValues:{population_2015:320000000} }
  };
  const normalize=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[_-]+/g,' ').replace(/[^A-Z0-9]+/gi,' ').trim().toUpperCase().replace(/\s+/g,' ');
  const aliases=new Map();
  for(const p of Object.values(identities))for(const a of [p.countryCode,p.iso2,p.iso3,p.name,p.officialName])aliases.set(normalize(a),p);
  const rows={
    Bangladesh:general.BD||{identity:{iso2:'BD',iso3:'BGD',name:'Bangladesh'},generalFacts:{capital:'Dhaka',currencies:['Bangladeshi taka'],languages:['Bangla']},metrics:{populationTotal:170000000,gdpCurrentUsd:460000000000,gdpGrowthPct:5.2},metricMetadata:{populationTotal:{year:2022,sourceName:'Test Official Source',sourceId:'TEST'},gdpCurrentUsd:{year:2021,sourceName:'Test Official Source',sourceId:'TEST'},gdpGrowthPct:{year:2021}},datasetId:'test-registry'},
    'United States':general.US||{identity:{iso2:'US',iso3:'USA',name:'United States'},generalFacts:{capital:'Washington, D.C.',currencies:['US dollar'],languages:['English']},metrics:{populationTotal:330000000,gdpCurrentUsd:23000000000000},metricMetadata:{populationTotal:{year:2020},gdpCurrentUsd:{year:2020}},datasetId:'test-registry'}
  };
  const runtime={
    ready:Promise.resolve(true),isReady:()=>true,diagnostics:()=>({profileCount:2}),
    resolveCountry:input=>{if(input&&typeof input==='object')input=input.countryCode||input.iso2||input.iso3||input.name;return aliases.get(normalize(input))||null;},
    flagFor:id=>({BD:'🇧🇩',US:'🇺🇸'}[id]||null),
    getProfile:id=>identities[aliases.get(normalize(id))?.countryCode]||null,
    getCapital:id=>({BD:'Dhaka',US:'Washington, D.C.'}[aliases.get(normalize(id))?.countryCode]||null),
    getRecord:(domain,input)=>{const p=aliases.get(normalize(input));if(!p)return null;if(domain==='country'||domain==='profile')return p;if(domain==='economy')return economy[p.countryCode]||p.sourceValues;if(domain==='population')return population[p.countryCode]||p.populationValues;return live[domain]?.[p.countryCode]||null;},
    getLiveRecord:(domain,input)=>{const p=aliases.get(normalize(input));return p?live[domain]?.[p.countryCode]||null:null;},
    listProfiles:()=>Object.values(identities)
  };
  const generalRuntime={init:async()=>true,diagnostics:()=>({ready:true}),getCountryRecord:input=>{const p=aliases.get(normalize(input));if(!p)return null;return p.countryCode==='BD'?rows.Bangladesh:rows['United States'];}};
  class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail||null;}}
  const listeners=new Map();
  const context={console,CustomEvent,Date,Map,Set,Object,Array,String,Number,Math,Promise,
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
    dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);return true;}};
  context.window=context;context.OmegaCountryRuntimeData=runtime;context.OmegaCountryGeneralDataRuntime=generalRuntime;context.Game={state:{}};
  vm.createContext(context);vm.runInContext(source,context,{filename:'omega_country_data_gateway_v1.js'});
  if(world)context.OmegaCountryDataGateway.registerSource('world.json',world);
  if(roster)context.OmegaCountryDataGateway.registerSource('countries.json',roster);
  if(society)context.OmegaCountryDataGateway.registerSource('society.json',society,{domains:['society']});
  return context.OmegaCountryDataGateway;
}

test('single country contract canonicalizes aliases and keeps per-field provenance',()=>{
  const api=fixture(),snapshot=api.getSnapshot('BD');
  assert.equal(snapshot.status,'READY');assert.equal(snapshot.countryCode,'BD');assert.equal(snapshot.identity.iso3,'BGD');
  assert.equal(snapshot.fields.population.value,170000000);assert.equal(snapshot.fields.population.sourceId,'TEST');assert.equal(snapshot.fields.population.year,2022);
  assert.equal(snapshot.fields.gdp.value,460000000000);assert.equal(snapshot.fields.capital.value,'Dhaka');assert.equal(snapshot.fields.languages.value[0],'Bangla');
  assert.equal(api.getField('Bangladesh','gdp').value,460000000000);
  assert.equal(api.getValue('Bangladesh',['economy'],['gdp']).value,460000000000);
  assert.equal(api.getDomainRecord('Bangladesh','economy').countryCode,'BD');
  assert.equal(api.getDomainRecord('Country Not In Registry','economy').record,null);
});

test('live simulation values win and do not overwrite shared baselines',()=>{
  const api=fixture({live:{economy:{BD:{gdp:510000000000,currency_code:'BDT'}},population:{BD:{population:175000000}}}});
  const snap=api.getSnapshot('Bangladesh');
  assert.equal(snap.fields.gdp.value,510000000000);assert.equal(snap.fields.gdp.authority,'LIVE_STATE');
  assert.equal(snap.fields.population.value,175000000);assert.equal(snap.fields.population.sourceId,'LIVE_GAME_STATE:population');
  assert.equal(snap.raw.countryGeneralRecord.metrics.gdpCurrentUsd,460000000000);
});

test('unknown country never silently falls back to another country',()=>{
  const snap=fixture().getSnapshot('Country Not In Registry');
  assert.equal(snap.status,'COUNTRY_NOT_RESOLVED');assert.equal(snap.countryCode,null);
  assert.equal(snap.diagnostics.errors.join(','),'COUNTRY_IDENTITY_UNRESOLVED');
});

test('country identity errors and same-year GDP conflicts are detected',()=>{
  const general={BD:{identity:{iso2:'US',iso3:'USA',name:'Wrong Country'},generalFacts:{capital:'Dhaka'},metrics:{populationTotal:170000000,gdpCurrentUsd:90000000000},metricMetadata:{populationTotal:{year:2022},gdpCurrentUsd:{year:2021,sourceId:'REGISTRY_B'}}}};
  const api=fixture({economy:{BD:{gdp:460000000000,gdp_year:2021}},general});
  const audit=api.auditCountry('BD');
  assert.ok(audit.errors.some(v=>v.code==='COUNTRY_IDENTITY_MISMATCH'));
  assert.ok(audit.errors.some(v=>v.code==='SAME_YEAR_VALUE_MISMATCH'&&v.field==='gdp'));
});

test('world.json and countries.json connect by selected identity, not list position',()=>{
  const api=fixture({world:{type:'FeatureCollection',features:[
    {type:'Feature',id:'BGD',properties:{name:'Bangladesh',ISO_A2:'BD',ISO_A3:'BGD'}},
    {type:'Feature',id:'USA',properties:{name:'United States',ISO_A2:'US',ISO_A3:'USA'}}]},
    roster:[{code:'US',name:'United States'},{code:'BD',name:'Bangladesh'}]});
  const bd=api.getSnapshot('BD'),us=api.getSnapshot('USA');
  assert.equal(bd.raw.worldFeature.properties.name,'Bangladesh');assert.equal(bd.raw.rosterRecord.code,'BD');
  assert.equal(us.raw.worldFeature.properties.name,'United States');assert.equal(us.raw.rosterRecord.code,'US');
  assert.ok(api.diagnostics().sourceIds.includes('world.json'));
});

test('audit-all reports every canonical identity',()=>{
  const report=fixture().auditAllCountries();
  assert.equal(report.countryCount,2);assert.equal(report.reports.length,2);assert.equal(typeof report.ok,'boolean');
});


test('registered society source follows the same selected-country routing',()=>{
  const api=fixture({society:{
    BANGLADESH:{urbanization_rate:38.4,school_enrollment_pct:91},
    UNITED_STATES:{urbanization_rate:83.1,school_enrollment_pct:97}
  }});
  const bd=api.getValue('Bangladesh',['society'],['urbanization_rate']);
  const us=api.getValue('USA',['society'],['urbanization_rate']);
  assert.equal(bd.value,38.4);assert.equal(bd.countryCode,'BD');assert.equal(bd.sourceId,'society.json');
  assert.equal(us.value,83.1);assert.equal(us.countryCode,'US');
  assert.equal(api.getValue('Bangladesh',['society'],['field_not_in_record']).status,'UNAVAILABLE');
});

test('world and roster records that resolve to another country are flagged',()=>{
  const api=fixture({world:{type:'FeatureCollection',features:[
    {type:'Feature',id:'BGD',properties:{name:'Bangladesh',ISO_A2:'US',ISO_A3:'USA'}}
  ]},roster:[{code:'US',name:'Bangladesh'}]});
  const report=api.auditCountry('BD');
  assert.ok(report.errors.filter(v=>v.code==='SOURCE_COUNTRY_IDENTITY_MISMATCH').length >= 2,
    'both world geometry and country roster should flag an ISO/source mismatch');
});

test('new overview, gateway and legacy screen files are wired through the same contract',()=>{
  const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
  const html=read('index.html');
  assert.match(html,/omega_country_data_gateway_v1\\.js/);
  assert.match(read('country-ios.js'),/gateway\\.getValue\\(requested, domains, paths\\)/);
  assert.match(read('ministry_engine.js'),/OmegaCountryDataGateway/);
  assert.match(read('map-engine-1.js'),/OmegaCountryDataGateway/);
  assert.match(read('omega_country_overview_ministry_ui_v1.js'),/auditAllCountries/);
  assert.match(read('omega-offline-map-sw.js'),/omega_country_data_gateway_v1\\.js/);
});


test('same-year inflation/growth anomalies are detected instead of silently selecting one source',()=>{
  const general={BD:{
    identity:{iso2:'BD',iso3:'BGD',name:'Bangladesh'},
    generalFacts:{capital:'Dhaka'},metrics:{gdpGrowthPct:2},
    metricMetadata:{gdpGrowthPct:{year:2022,sourceId:'REGISTRY'}},datasetId:'test-registry'
  }};
  const api=fixture({economy:{BD:{gdp_growth:9,gdp_growth_year:2022}},general});
  const report=api.auditCountry('BD');
  assert.ok(report.errors.some(v=>v.code==='SAME_YEAR_VALUE_MISMATCH'&&v.field==='gdpGrowthPct'));
});

test('multiple aliases for one country in a source are reported as duplicate rows',()=>{
  const api=fixture({society:{BANGLADESH:{urbanization_rate:38},BGD:{urbanization_rate:40}}});
  const report=api.auditCountry('BD');
  assert.ok(report.warnings.some(v=>v.code==='DUPLICATE_COUNTRY_SOURCE_ROWS'&&v.sourceId==='society.json'));
});
