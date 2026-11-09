import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const source=readFileSync('omega_finance_analytics_runtime_v1.js','utf8');
function context(){
 const listeners=new Map();
 const profiles=Array.from({length:249},(_,i)=>({
  countryCode:String(i+1).padStart(3,'0'),iso3:i===0?'BGD':'X'+String(i).padStart(2,'0'),
  name:i===0?'Bangladesh':'Test country '+i,profileStatus:'ACTIVE',
  sourceValues:{gdp:10000000000+i*1000000,gdp_growth:5,inflation:3.5,unemployment_rate:5.2,debt:4000000000,budget_balance:-200000000,trade_balance:100000000,reserves:800000000},
  indicators:{gdpCurrentUsd:10000000000+i*1000000,gdpGrowthPct:5,inflationRatePct:3.5,unemploymentRatePct:5.2,publicDebtUsd:4000000000,governmentBudgetBalanceUsd:-200000000,tradeBalanceUsd:100000000,foreignExchangeReservesUsd:800000000}
 }));
 const rawMap=new Map(profiles.map(p=>[p.iso3,{iso3:p.iso3,countryCode:p.countryCode,name:p.name,baselineYear:2015,rawIndicators:{
  nominalGdpUsd:p.sourceValues.gdp,gdpGrowthAnnualPct:p.sourceValues.gdp_growth,inflationAnnualPct:p.sourceValues.inflation,
  unemploymentRatePct:p.sourceValues.unemployment_rate,publicDebtUsd:p.sourceValues.debt,governmentBudgetBalanceUsd:p.sourceValues.budget_balance,
  tradeBalanceUsd:p.sourceValues.trade_balance,foreignExchangeReservesUsd:p.sourceValues.reserves,taxRevenueUsd:null,totalGovernmentExpenditureUsd:null
 },rawSourceRecords:{economy:p.sourceValues,population:null},fieldProvenance:{nominalGdpUsd:'LOCAL_REPOSITORY_SOURCE'}}]));
 const financeApi={init:async()=>({initialized:true}),getProfiles:()=>profiles,
  getIndicators:code=>{const p=profiles.find(x=>x.countryCode===code||x.iso3===code);return p?{gdpCurrentUsd:p.sourceValues.gdp,gdpGrowthPct:5,inflationRatePct:3.5,unemploymentRatePct:5.2,publicDebtUsd:4000000000,currentBudgetBalanceUsd:-200000000,tradeBalanceUsd:100000000,foreignExchangeReservesUsd:800000000}:null;},
  diagnostics:()=>({simulationTurn:0})};
 const macroApi={init:async()=>({initialized:true}),getRawProfile:code=>rawMap.get(code)||Array.from(rawMap.values()).find(r=>r.countryCode===code)||null,
  getIndicators:code=>{const p=profiles.find(x=>x.countryCode===code||x.iso3===code);return p?{gdpUsd:p.sourceValues.gdp,gdpGrowthAnnualPct:5,inflationAnnualPct:3.5,unemploymentRatePct:5.2,publicDebtUsd:4000000000,annualBudgetBalanceUsd:-200000000,foreignExchangeReservesUsd:800000000,stabilityScore:82}:null;}};
 const ctx={console,Promise,Map,Math,Number,String,Object,Array,Date,JSON,Intl,Blob,URL,
  addEventListener(type,fn){listeners.set(type,[...(listeners.get(type)||[]),fn]);},
  dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e);return true;},
  OmegaFinanceMinistry:financeApi,OmegaMacroStabilityRuntime:macroApi,
  CustomEvent:class CustomEvent{constructor(type,opts={}){this.type=type;this.detail=opts.detail;}}};
 ctx.window=ctx;ctx.globalThis=ctx;vm.runInNewContext(source,ctx,{filename:'omega_finance_analytics_runtime_v1.js'});return{ctx,profiles};
}
test('creates a distinct 30-day model preview for every country without enabling live charts',async()=>{
 const {ctx,profiles}=context(),d=await ctx.OmegaFinanceAnalyticsRuntime.init();
 assert.equal(d.countryCount,249);assert.equal(d.previewCountries,249);assert.equal(d.previewPointsPerMetric,31);
 assert.equal(d.previewHorizonDays,30);assert.equal(d.liveStarted,false);assert.equal(d.gameStarted,false);
 const chart=ctx.OmegaFinanceAnalyticsRuntime.getCountrySeries('BGD','gdp');
 assert.equal(chart.mode,'MODEL_PREVIEW');assert.equal(chart.points.length,31);assert.equal(chart.points[0].label,'Baseline');assert.equal(chart.points[30].label,'Day 30');
 assert.equal(chart.points[0].value,10000000000);assert.ok(chart.points.every(p=>p.kind==='MODEL_PREVIEW'));
 assert.equal(ctx.OmegaFinanceAnalyticsRuntime.getCountrySeries(profiles[20].iso3,'gdp').points.length,31);
 assert.ok(ctx.OmegaFinanceAnalyticsRuntime.getMetrics().length>=20);assert.equal(ctx.OmegaFinanceAnalyticsRuntime.getCountrySeries('BGD','privateCredit').baseline,null);
});
test('switches to live data on committed turns, ignores duplicate turns and caps live graph history',async()=>{
 const {ctx}=context();await ctx.OmegaFinanceAnalyticsRuntime.init();
 let out=ctx.OmegaFinanceAnalyticsRuntime.handleTurn({turn:1});assert.equal(out.ok,true);assert.equal(out.updated,249);assert.equal(out.mode,'LIVE_TURNS');
 let rows=ctx.OmegaFinanceAnalyticsRuntime.getCountrySeries('BGD','gdp');assert.equal(rows.mode,'LIVE_TURNS');assert.equal(rows.points.length,1);assert.equal(rows.points[0].kind,'LIVE_TURN');
 assert.equal(ctx.OmegaFinanceAnalyticsRuntime.handleTurn({turn:1}).duplicate,true);
 for(let i=2;i<=40;i++)ctx.OmegaFinanceAnalyticsRuntime.handleTurn({turn:i});
 rows=ctx.OmegaFinanceAnalyticsRuntime.getCountrySeries('BGD','gdp');assert.equal(rows.points.length,31);assert.equal(rows.points[0].label,'Turn 10');assert.equal(rows.points[30].label,'Turn 40');
 assert.equal(ctx.OmegaFinanceAnalyticsRuntime.diagnostics().liveCountryCount,249);
});
