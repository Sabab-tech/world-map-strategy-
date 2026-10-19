import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const profileData=JSON.parse(readFileSync('economy_global_profiles_v1.json','utf8'));
const financeRules=JSON.parse(readFileSync('finance_runtime_rules_v1.json','utf8'));
const runtime=readFileSync('omega_finance_ministry_runtime_v1.js','utf8');

test('all map country and area identities exist, and unknown values are explicit',()=>{
  assert.equal(profileData.countries.length,249);
  assert.equal(profileData.metadata.countryCount,249);
  assert.ok(profileData.metadata.mappedEconomicProfiles>=220);
  assert.ok(profileData.countries.every(p=>p.countryCode&&p.iso3&&p.name));
  const missing=profileData.countries.filter(p=>p.profileStatus==='UNAVAILABLE');
  assert.ok(missing.length>0);
  assert.ok(missing.every(p=>p.indicators.gdpCurrentUsd===null));
  assert.ok(profileData.countries.every(p=>p.indicators.policyInterestRatePct===null));
  assert.ok(profileData.countries.every(p=>p.indicators.economicInfluenceIndex===null||Number.isFinite(p.indicators.economicInfluenceIndex)));
});
function createRuntime(){
  const handlers=new Map();
  const document={readyState:'loading',addEventListener(type,fn){const k='doc:'+type;handlers.set(k,[...(handlers.get(k)||[]),fn]);},getElementById(){return null;}};
  const profile=profileData.countries.find(p=>p.iso3==='BGD');
  const economy=JSON.parse(JSON.stringify(profile.sourceValues));
  const state={economy:{BANGLADESH:economy},finance:{BGD:{available:123,reserves:456}},population:{BGD:{population_2015:profile.indicators.population2015}},simulation:{turn:1,session:{playerCountryId:'BGD'}}};
  const context={console,document,Intl,Math,Number,String,Object,Array,Map,Set,Promise,Date,JSON,WeakMap,
    CustomEvent:class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    addEventListener(type,fn){handlers.set(type,[...(handlers.get(type)||[]),fn]);},
    dispatchEvent(event){for(const fn of handlers.get(event.type)||[])fn(event);return true;},
    fetch:async url=>String(url).includes('economy_global_profiles_v1.json')?{ok:true,json:async()=>profileData}:
      String(url).includes('finance_runtime_rules_v1.json')?{ok:true,json:async()=>financeRules}:Promise.reject(new Error('Unexpected fetch '+url)),
    Omega:{Simulation:{world:{state},clock:{turn:1,stepDurationMs:3600000},getPlayerCountryId(){return 'BGD';}}},
    Game:{state:{economy:{BANGLADESH:JSON.parse(JSON.stringify(economy))},finance:{},simulation:{turn:1}},currentActiveCountry:'BGD'},
    gameState:{economy:{BANGLADESH:JSON.parse(JSON.stringify(economy))},finance:{},population:{},simulation:{turn:1}},
    CountryIOS:{activeCountry:'BGD'}};
  context.window=context;context.globalThis=context;
  vm.runInNewContext(runtime,context,{filename:'omega_finance_ministry_runtime_v1.js'});
  return {context,state};
}
test('Finance preserves existing finance data and enforces allocation, treasury and tax rules',async()=>{
  const {context,state}=createRuntime();const boot=await context.OmegaFinanceMinistry.init();
  assert.equal(boot.initialized,true);assert.equal(boot.profileCount,249);assert.equal(state.finance.BGD.available,123);
  assert.ok(context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd>0);
  let r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:1000,spendType:'purchase'});
  assert.equal(r.ok,false);assert.equal(r.code,'BUDGET_ALLOCATION_REQUIRED');
  r=context.OmegaFinanceMinistry.applyAction({type:'set-allocation',countryId:'BGD',department:'interior',amountUsd:100000000});
  assert.equal(r.ok,true);
  r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:200000000,spendType:'purchase'});
  assert.equal(r.ok,false);assert.equal(r.code,'ALLOCATION_LIMIT_EXCEEDED');
  const before=context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd;
  r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:5000000,spendType:'maintenance',description:'Repair fleet'});
  assert.equal(r.ok,true);assert.equal(context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd,before-5000000);
  r=context.OmegaFinanceMinistry.applyAction({type:'set-tax-rate',countryId:'BGD',value:25});
  assert.equal(r.ok,true);assert.equal(context.OmegaFinanceMinistry.getFinanceState('BGD').policy.taxRatePct,25);
});
test('Finance advances GDP and debt using simulation duration and ignores duplicate turns',async()=>{
  const {context,state}=createRuntime();await context.OmegaFinanceMinistry.init();
  const e=state.economy.BANGLADESH,gdp=e.gdp,debt=e.debt;
  const out=context.OmegaFinanceMinistry.advanceTurn(25,financeRules.annualizationMs);
  assert.equal(out.ok,true);
  assert.equal(out.processed,context.OmegaFinanceMinistry.getProfiles().filter(p=>p.profileStatus!=='UNAVAILABLE'&&p.indicators.gdpCurrentUsd>0).length);
  assert.ok(e.gdp>gdp);assert.ok(e.debt>debt);
  const gdpAfter=e.gdp;const repeat=context.OmegaFinanceMinistry.advanceTurn(25,financeRules.annualizationMs);
  assert.equal(repeat.processed,0);assert.equal(e.gdp,gdpAfter);
});
test('Finance commands cannot change a non-player country',async()=>{
  const {context}=createRuntime();await context.OmegaFinanceMinistry.init();
  const result=context.OmegaFinanceMinistry.applyAction({type:'set-tax-rate',countryId:'USA',value:40});
  assert.equal(result.ok,false);assert.equal(result.code,'PLAYER_COUNTRY_SCOPE_VIOLATION');
});
