import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
const raw=JSON.parse(readFileSync('economy_raw_financial_data_v2.json','utf8'));
const macroRules=JSON.parse(readFileSync('finance_macro_stability_rules_v1.json','utf8'));
const financeRules=JSON.parse(readFileSync('finance_runtime_rules_v1.json','utf8'));
const sectorRegistry=JSON.parse(readFileSync('finance_sector_registry_v1.json','utf8'));
const profileData=JSON.parse(readFileSync('economy_global_profiles_v1.json','utf8'));
const financeRuntime=readFileSync('omega_finance_ministry_runtime_v1.js','utf8');
const macroRuntime=readFileSync('omega_macro_stability_runtime_v1.js','utf8');

test('raw financial registry has all 249 country profiles, common fields and explicit missing observations',()=>{
 assert.equal(raw.countries.length,249);
 assert.equal(raw.metadata.countryAndTerritoryCount,249);
 assert.equal(raw.metadata.rawFieldCount,Object.keys(raw.metadata.fieldCatalogue).length);
 const keys=Object.keys(raw.countries[0].rawIndicators).sort();
 assert.ok(raw.countries.every(c=>Object.keys(c.rawIndicators).sort().join('|')===keys.join('|')));
 assert.ok(raw.countries.every(c=>c.iso3&&c.countryCode&&c.name&&c.baselineYear===2015));
 assert.ok(raw.countries.every(c=>c.rawIndicators.taxRevenueUsd===null));
 assert.equal(raw.metadata.fieldCatalogue.taxRevenueUsd.availability,'NOT_IN_SOURCE_BASELINE');
 const bgd=raw.countries.find(c=>c.iso3==='BGD');
 assert.equal(bgd.rawIndicators.nominalGdpUsd,bgd.rawSourceRecords.economy.gdp);
 assert.equal(bgd.rawIndicators.population2015,bgd.rawSourceRecords.population.population_2015);
 assert.equal(bgd.derivedIndicators.publicDebtToGdpPct,profileData.countries.find(c=>c.iso3==='BGD').indicators.publicDebtToGdpPct);
});

function createRuntime(){
 const handlers=new Map(),elements=new Map();
 const document={readyState:'loading',addEventListener(type,fn){const k='doc:'+type;handlers.set(k,[...(handlers.get(k)||[]),fn]);},
  getElementById(id){return elements.get(id)||null;}};
 elements.set('ministry-dashboard-content',{innerHTML:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});
 const profile=profileData.countries.find(p=>p.iso3==='BGD'),economy=JSON.parse(JSON.stringify(profile.sourceValues));
 const state={economy:{BANGLADESH:economy},finance:{BGD:{available:4000000000,reserves:456}},population:{BGD:{population_2015:profile.indicators.population2015}},simulation:{turn:1,session:{playerCountryId:'BGD'}}};
 const context={console,document,Intl,Math,Number,String,Object,Array,Map,Set,Promise,Date,JSON,WeakMap,
  CustomEvent:class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
  addEventListener(type,fn){handlers.set(type,[...(handlers.get(type)||[]),fn]);},
  dispatchEvent(event){for(const fn of handlers.get(event.type)||[])fn(event);return true;},
  fetch:async url=>{const s=String(url);
   if(s.includes('economy_global_profiles_v1.json'))return{ok:true,json:async()=>profileData};
   if(s.includes('finance_runtime_rules_v1.json'))return{ok:true,json:async()=>financeRules};
   if(s.includes('finance_sector_registry_v1.json'))return{ok:true,json:async()=>sectorRegistry};
   if(s.includes('economy_raw_financial_data_v2.json'))return{ok:true,json:async()=>raw};
   if(s.includes('finance_macro_stability_rules_v1.json'))return{ok:true,json:async()=>macroRules};
   return Promise.reject(new Error('Unexpected fetch '+s));},
  Omega:{Simulation:{world:{state},clock:{turn:1,stepDurationMs:3600000},getPlayerCountryId(){return 'BGD';}}},
  Game:{state:{economy:{BANGLADESH:JSON.parse(JSON.stringify(economy))},finance:{},simulation:{turn:1}},currentActiveCountry:'BGD'},
  gameState:{economy:{BANGLADESH:JSON.parse(JSON.stringify(economy))},finance:{},population:{},simulation:{turn:1}},
  CountryIOS:{activeCountry:'BGD'}};
 context.window=context;context.globalThis=context;
 vm.runInNewContext(financeRuntime,context,{filename:'omega_finance_ministry_runtime_v1.js'});
 return{context,state};
}
test('macro runtime starts for all countries and preserves existing finance keys',async()=>{
 const {context,state}=createRuntime();
 await context.OmegaFinanceMinistry.init();
 vm.runInNewContext(macroRuntime,context,{filename:'omega_macro_stability_runtime_v1.js'});
 const diag=await context.OmegaMacroStabilityRuntime.init();
 assert.equal(diag.initialized,true);assert.equal(diag.countryCount,249);assert.ok(diag.profilesWithGDP>=220);
 assert.equal(diag.rawFieldCount,Object.keys(raw.metadata.fieldCatalogue).length);
 assert.equal(context.OmegaMacroStabilityRuntime.getRawProfile('BGD').iso3,'BGD');
 assert.ok(context.OmegaMacroStabilityRuntime.getIndicators('BGD').gdpUsd>0);
 assert.equal(state.finance.BGD.reserves,456);
});
test('player macro controls affect a later simulation turn, reject foreign control and ignore duplicate turns',async()=>{
 const {context,state}=createRuntime();await context.OmegaFinanceMinistry.init();
 vm.runInNewContext(macroRuntime,context,{filename:'omega_macro_stability_runtime_v1.js'});await context.OmegaMacroStabilityRuntime.init();
 const baseline=raw.countries.find(p=>p.iso3==='BGD').rawIndicators.gdpGrowthAnnualPct;
 let result=context.OmegaMacroStabilityRuntime.applyAction({type:'set-policy',countryId:'BGD',policy:'growth'});assert.equal(result.ok,true);
 result=context.OmegaMacroStabilityRuntime.applyAction({type:'set-controls',countryId:'BGD',growthAdjustmentPct:1.5,spendingAdjustmentPct:1,targetDebtToGdpPct:120,automaticStabilizersEnabled:true});assert.equal(result.ok,true);
 const turn=context.OmegaMacroStabilityRuntime.advanceTurn(20,Number(macroRules.annualizationMs));assert.equal(turn.ok,true);assert.ok(turn.processed>0);
 assert.ok(Number(state.economy.BANGLADESH.gdp_growth)>Number(baseline||0));
 const changed=state.economy.BANGLADESH.gdp_growth;
 assert.equal(context.OmegaMacroStabilityRuntime.advanceTurn(20,Number(macroRules.annualizationMs)).processed,0);
 assert.equal(state.economy.BANGLADESH.gdp_growth,changed);
 assert.equal(context.OmegaMacroStabilityRuntime.applyAction({type:'set-policy',countryId:'USA',policy:'austerity'}).code,'PLAYER_COUNTRY_SCOPE_VIOLATION');
 assert.equal(context.OmegaMacroStabilityRuntime.applyAction({type:'set-controls',countryId:'BGD',growthAdjustmentPct:50}).code,'MACRO_CONTROL_OUT_OF_RANGE');
});

test('Macro Stability panel mounts only inside the dedicated Finance tab host',()=>{
 assert.match(macroRuntime,/querySelector\('\[data-omss-container\]'\)/);
 assert.match(macroRuntime,/mount\.appendChild\(el\.firstElementChild\)/);
 assert.match(macroRuntime,/mount\.querySelector\('#omss-panel'\)/);
 assert.doesNotMatch(macroRuntime,/if\(el\.firstElementChild\)host\.appendChild/);
});
