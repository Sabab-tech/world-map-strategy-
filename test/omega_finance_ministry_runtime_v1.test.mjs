import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const profileData=JSON.parse(readFileSync('economy_global_profiles_v1.json','utf8'));
const financeRules=JSON.parse(readFileSync('finance_runtime_rules_v1.json','utf8'));
const sectorRegistry=JSON.parse(readFileSync('finance_sector_registry_v1.json','utf8'));
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
  assert.equal(sectorRegistry.budgetSectors.reduce((sum,s)=>sum+s.defaultSharePct,0),100);
  assert.equal(sectorRegistry.economicSectors.reduce((sum,s)=>sum+s.outputSharePct,0),100);
  assert.equal(sectorRegistry.economicSectors.reduce((sum,s)=>sum+s.taxReceiptSharePct,0),100);
});
function createRuntime(){
  const handlers=new Map();
  const elements=new Map();
  const document={readyState:'loading',addEventListener(type,fn){const k='doc:'+type;handlers.set(k,[...(handlers.get(k)||[]),fn]);},getElementById(id){return elements.get(id)||null;}};
  elements.set('ministry-dashboard-view',{className:'',style:{display:'none'}});
  elements.set('ministry-dashboard-content',{innerHTML:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});
  elements.set('dash-crumb-title',{textContent:''});
  elements.set('dash-layer-status',{textContent:''});
  const profile=profileData.countries.find(p=>p.iso3==='BGD');
  const economy=JSON.parse(JSON.stringify(profile.sourceValues));
  const state={economy:{BANGLADESH:economy},finance:{BGD:{available:4000000000,reserves:456}},population:{BGD:{population_2015:profile.indicators.population2015}},simulation:{turn:1,session:{playerCountryId:'BGD'}}};
  const context={console,document,Intl,Math,Number,String,Object,Array,Map,Set,Promise,Date,JSON,WeakMap,
    CustomEvent:class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    addEventListener(type,fn){handlers.set(type,[...(handlers.get(type)||[]),fn]);},
    dispatchEvent(event){for(const fn of handlers.get(event.type)||[])fn(event);return true;},
    fetch:async url=>String(url).includes('economy_global_profiles_v1.json')?{ok:true,json:async()=>profileData}:
      String(url).includes('finance_runtime_rules_v1.json')?{ok:true,json:async()=>financeRules}:
      String(url).includes('finance_sector_registry_v1.json')?{ok:true,json:async()=>sectorRegistry}:Promise.reject(new Error('Unexpected fetch '+url)),
    Omega:{Simulation:{world:{state},clock:{turn:1,stepDurationMs:3600000},getPlayerCountryId(){return 'BGD';}}},
    Game:{state:{economy:{BANGLADESH:JSON.parse(JSON.stringify(economy))},finance:{},simulation:{turn:1}},currentActiveCountry:'BGD'},
    gameState:{economy:{BANGLADESH:JSON.parse(JSON.stringify(economy))},finance:{},population:{},simulation:{turn:1}},
    CountryIOS:{activeCountry:'BGD'},OmegaCabinetUI:{renderMinistryDashboard(id){this.legacyMinistryId=id;return 'legacy';}}};
  context.window=context;context.globalThis=context;
  vm.runInNewContext(runtime,context,{filename:'omega_finance_ministry_runtime_v1.js'});
  return {context,state,document,elements};
}
test('Finance preserves existing finance data and enforces allocation, treasury and tax rules',async()=>{
  const {context,state}=createRuntime();const boot=await context.OmegaFinanceMinistry.init();
  assert.equal(boot.initialized,true);assert.equal(boot.profileCount,249);assert.equal(state.finance.BGD.available,4000000000);assert.equal(state.finance.BGD.reserves,456);
  assert.ok(context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd>0);
  let r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:1000,spendType:'purchase'});
  assert.equal(r.ok,true,'the country starts with a configured budget sector');
  assert.equal(state.finance.BGD.available,4000000000-1000);
  r=context.OmegaFinanceMinistry.applyAction({type:'set-allocation',countryId:'BGD',department:'interior',amountUsd:100000000});
  assert.equal(r.ok,true);
  r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:200000000,spendType:'purchase'});
  assert.equal(r.ok,false);assert.equal(r.code,'ALLOCATION_LIMIT_EXCEEDED');
  const before=context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd;
  r=context.OmegaFinanceMinistry.applyAction({type:'spend-budget',countryId:'BGD',department:'interior',amountUsd:5000000,spendType:'maintenance',description:'Repair fleet'});
  assert.equal(r.ok,true);assert.equal(context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd,before-5000000);assert.equal(state.finance.BGD.available,before-5000000);
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


test('Finance reconciles treasury changes posted by existing ministries and resource systems',async()=>{
  const {context,state}=createRuntime();
  await context.OmegaFinanceMinistry.init();
  const before=state.finance.BGD.available;
  const externallyUpdated=before-125000;
  state.finance.BGD.available=externallyUpdated;
  const metrics=context.OmegaFinanceMinistry.getIndicators('BGD');
  assert.equal(metrics.treasuryBalanceUsd,externallyUpdated);
  assert.equal(context.OmegaFinanceMinistry.getFinanceState('BGD').treasuryBalanceUsd,externallyUpdated);
  assert.equal(state.finance.BGD.available,externallyUpdated);
  assert.equal(state.finance.BGD.reserves,456);
});
test('Finance route renders its dashboard through the existing Cabinet UI and locks foreign-country controls',async()=>{
  const {context,elements}=createRuntime();
  await context.OmegaFinanceMinistry.init();
  const opened=context.OmegaCabinetUI.renderMinistryDashboard('finance');
  assert.equal(opened,true);
  assert.equal(elements.get('ministry-dashboard-view').style.display,'flex');
  assert.equal(elements.get('dash-layer-status').textContent,'FINANCE & TREASURY CONTROL ROOM');
  const html=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(html.includes('Finance Ministry'));
  assert.ok(html.includes('data-ofm-tab="budget"'));
  assert.ok(html.includes('data-ofm-tab="treasury"'));
  assert.ok(!html.includes('data-ofm-action="set-allocation"'),'budget edit forms stay inside the Budget tab');
  assert.equal(context.OmegaFinanceMinistry.selectTab('budget').ok,true);
  const budgetHTML=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(budgetHTML.includes('data-ofm-action="set-allocation"'));
  assert.ok(budgetHTML.includes('data-ofm-action="set-sector-share"'));
  assert.ok(budgetHTML.includes('data-ofm-action="spend-budget"'));
  const selected=context.OmegaFinanceMinistry.selectCountry('USA');
  assert.equal(selected.ok,true);
  const readOnlyHTML=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(readOnlyHTML.includes('READ-ONLY PROFILE'));
  assert.ok(!readOnlyHTML.includes('data-ofm-action="spend-budget"'));
});

test('Budget sector distribution sums to 100% and rejects an over-allocation',async()=>{
  const {context}=createRuntime();await context.OmegaFinanceMinistry.init();
  const snapshot=context.OmegaFinanceMinistry.getBudgetSnapshot('BGD');
  assert.equal(snapshot.rows.length,22);
  assert.ok(Math.abs(snapshot.totalSharePct-100)<0.0001);
  const before=context.OmegaFinanceMinistry.getFinanceState('BGD').allocations;
  const first=sectorRegistry.budgetSectors[0],second=sectorRegistry.budgetSectors[1];
  const reduce=context.OmegaFinanceMinistry.applyAction({type:'set-sector-share',countryId:'BGD',sectorId:first.id,sharePct:first.defaultSharePct-1});
  assert.equal(reduce.ok,true);
  const excess=context.OmegaFinanceMinistry.applyAction({type:'set-sector-share',countryId:'BGD',sectorId:second.id,sharePct:100});
  assert.equal(excess.ok,false);assert.equal(excess.code,'BUDGET_SHARES_EXCEED_100');
  const latest=context.OmegaFinanceMinistry.getBudgetSnapshot('BGD');
  assert.ok(latest.totalSharePct<=100.0001);
  assert.ok(before[first.id].budgetUsd>=latest.rows.find(r=>r.id===first.id).budgetUsd);
});

test('Modeled tax receipts accrue to the existing Finance ledger over simulation time',async()=>{
  const {context,state}=createRuntime();await context.OmegaFinanceMinistry.init();
  const beforeTax=Number(state.finance.BGD.taxRevenue)||0;
  const beforeCash=state.finance.BGD.available;
  const out=context.OmegaFinanceMinistry.advanceTurn(25,financeRules.annualizationMs);
  assert.equal(out.ok,true);
  assert.ok(state.finance.BGD.taxRevenue>beforeTax);
  assert.ok(state.finance.BGD.available>beforeCash);
  assert.ok(state.finance.BGD.revenue>=state.finance.BGD.taxRevenue);
});

test('Debt repayment reduces principal and treasury by the posted amount',async()=>{
  const {context,state}=createRuntime();await context.OmegaFinanceMinistry.init();
  const economy=state.economy.BANGLADESH;
  const debtBefore=economy.debt;
  const cashBefore=state.finance.BGD.available;
  const amount=1000000;
  const result=context.OmegaFinanceMinistry.applyAction({type:'repay-debt',countryId:'BGD',amountUsd:amount,description:'Test principal payment'});
  assert.equal(result.ok,true);
  assert.equal(economy.debt,debtBefore-amount);
  assert.equal(state.finance.BGD.available,cashBefore-amount);
});

test('Finance tabs place cash and macro details behind separate icons while overview stays compact',async()=>{
  const {context,elements}=createRuntime();await context.OmegaFinanceMinistry.init();
  assert.equal(context.OmegaCabinetUI.renderMinistryDashboard('finance'),true);
  const overview=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(overview.includes('data-ofm-tab="budget"'));
  assert.ok(overview.includes('data-ofm-tab="treasury"'));
  assert.ok(overview.includes('Available Treasury'));
  assert.ok(!overview.includes('GDP (current baseline)'));
  assert.equal(context.OmegaFinanceMinistry.selectTab('budget').ok,true);
  const budget=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(budget.includes('Chemical Industry &amp; Advanced Materials')||budget.includes('Chemical Industry & Advanced Materials'));
  assert.ok(budget.includes('data-ofm-action="set-sector-share"'));
  assert.ok(budget.includes('data-ofm-action="spend-budget"'));
  assert.equal(context.OmegaFinanceMinistry.selectTab('treasury').ok,true);
  const treasury=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(treasury.includes('data-ofm-action="borrow"'));
  assert.ok(treasury.includes('data-ofm-action="repay-debt"'));
  assert.equal(context.OmegaFinanceMinistry.selectTab('income').ok,true);
  const income=elements.get('ministry-dashboard-content').innerHTML;
  assert.ok(income.includes('Estimated output'));
  assert.ok(income.includes('RECORDED'));
});
