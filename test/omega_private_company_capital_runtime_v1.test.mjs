import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const runtimeSource=fs.readFileSync(new URL('../omega_private_company_capital_runtime_v1.js',import.meta.url),'utf8');
const lifecycleSource=fs.readFileSync(new URL('../omega_private_enterprise_lifecycle_v1.js',import.meta.url),'utf8');
const COMPANY_IDS=[
 'AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES',
 'ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'
];
const factoryTypes=[
 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT','STEEL_AND_ALLOY_WORKS',
 'NON_FERROUS_METAL_SMELTER','PETROCHEMICAL_POLYMER_PLANT','FERTILIZER_CHEMICAL_PLANT',
 'INDUSTRIAL_CHEMICALS_GAS_PLANT','CEMENT_CONCRETE_PLANT','GLASS_CERAMICS_PLANT',
 'PAPER_PACKAGING_MILL','FOOD_PROCESSING_COLD_CHAIN','TEXTILE_GARMENT_MILL',
 'INDUSTRIAL_MACHINERY_MACHINE_TOOLS','GRID_EQUIPMENT_FACTORY','ELECTRONICS_SEMICONDUCTOR_FAB',
 'BATTERY_ENERGY_STORAGE_PLANT','VEHICLE_TRUCK_BUS_ASSEMBLY','SHIP_RAIL_EQUIPMENT_YARD',
 'AEROSPACE_EQUIPMENT_PLANT','PHARMA_MEDICAL_SUPPLIES_PLANT','DEFENSE_EQUIPMENT_FACTORY',
 'RECYCLING_WASTE_PROCESSING_PLANT'
];
function baselineFixtures(){
 const governmentCounts=Object.fromEntries(factoryTypes.map(type=>[type,2]));
 const privateCounts=Object.fromEntries(factoryTypes.map(type=>[type,0]));
 const companies=COMPANY_IDS.map(companyId=>({companyId,companyName:companyId,
  factoryCounts:Object.fromEntries(factoryTypes.map(type=>[type,0]))}));
 companies[0].factoryCounts.STEEL_AND_ALLOY_WORKS=3;
 companies[0].factoryCounts.PETROCHEMICAL_POLYMER_PLANT=2;
 companies[1].factoryCounts.INDUSTRIAL_MACHINERY_MACHINE_TOOLS=4;
 companies[1].factoryCounts.VEHICLE_TRUCK_BUS_ASSEMBLY=2;
 companies[2].factoryCounts.TEXTILE_GARMENT_MILL=5;
 companies[2].factoryCounts.FOOD_PROCESSING_COLD_CHAIN=3;
 companies[3].factoryCounts.ELECTRONICS_SEMICONDUCTOR_FAB=2;
 companies[3].factoryCounts.PHARMA_MEDICAL_SUPPLIES_PLANT=1;
 companies[4].factoryCounts.CEMENT_CONCRETE_PLANT=2;
 companies[4].factoryCounts.RECYCLING_WASTE_PROCESSING_PLANT=1;
 for(const company of companies)for(const type of factoryTypes){
  privateCounts[type]+=company.factoryCounts[type];
 }
 return{
  government:{
   countryId:'BGD',countryName:'Bangladesh',industryArchetype:'Agriculture-led economy with a manufacturing base',
   totalStartingFactoryUnits:42,factoryCounts:governmentCounts,
   economicSectorContext:{valueAddedShares:{
    servicesValueAddedPctGdp:{value:52,year:2022},
    industryValueAddedPctGdp:{value:28,year:2022},
    manufacturingValueAddedPctGdp:{value:22,year:2022},
    agricultureValueAddedPctGdp:{value:20,year:2022}
   }}
  },
  private:{
   status:'READY',countryId:'BGD',countryName:'Bangladesh',
   industryArchetype:'Agriculture-led economy with a manufacturing base',
   totalGovernmentFactoryUnits:42,totalPrivateFactoryUnits:25,
   governmentFactoryCounts:governmentCounts,factoryCounts:privateCounts,companies
  }
 };
}
const profile={
 countryCode:'BD',iso3:'BGD',name:'Bangladesh',
 sourceValues:{currency_code:'BDT',currency_name:'Bangladeshi taka',gdp:450000000000,exchange_rate_usd:110},
 indicators:{gdpCurrentUsd:450000000000,gdpPerCapitaUsd:2600,exchangeRateLocalPerUsd:110,population2015:170000000},
 populationValues:{population_2015:170000000}
};
const general={
 metrics:{
  domesticCreditPrivateSectorPctGdp:65,
  servicesValueAddedPctGdp:52,industryValueAddedPctGdp:28,
  manufacturingValueAddedPctGdp:22,agricultureEmploymentPct:38
 },
 metricMetadata:{domesticCreditPrivateSectorPctGdp:{year:2023,confidence:.88,status:'WORLD_BANK_API_OBSERVATION'}}
};
function runtimeApi(context){
 context.globalThis=context;
 runInNewContext(runtimeSource,context);
 return context.OmegaPrivateCompanyCapitalRuntimeV1;
}
test('opening capital converts GDP into the country currency and weights the five companies by their factory mix',()=>{
 const rows=baselineFixtures(),context={};
 const api=runtimeApi(context);
 const plan=api.buildPlan('BGD',rows.private,rows.government,profile,{gdpCurrentUsd:450000000000},general,{
  getCurrencyCode:()=> 'BDT',getRate:(currency)=>currency==='BDT'?110:null
 });
 assert.equal(plan.currencyCode,'BDT');
 assert.equal(plan.fxLocalPerUsd,110);
 assert.equal(plan.gdpLocal,49500000000000);
 assert.ok(plan.privateSectorContributionPct>=52&&plan.privateSectorContributionPct<=90);
 assert.equal(plan.companyAllocations.length,5);
 assert.equal(plan.companyAllocations.reduce((sum,row)=>sum+row.amount,0),plan.totalOpeningCapital);
 assert.ok(plan.companyAllocations.every(row=>row.amount>0));
 assert.ok(new Set(plan.companyAllocations.map(row=>row.amount)).size>1,
  'company budgets must reflect different factory ownership/category mixes');
 assert.ok(plan.companyAllocations.find(row=>row.companyId==='MERIDIAN_ENGINEERING_GROUP').amount>
  plan.companyAllocations.find(row=>row.companyId==='TERRA_INFRASTRUCTURE_GROUP').amount,
  'the machinery/vehicle portfolio should receive more than the smaller infrastructure portfolio in this fixture');
 assert.equal(plan.authority,'OMEGA_PRIVATE_COMPANY_CAPITAL_ALLOCATION_V1');
});
test('missing currency and private-sector observations receive a country-scoped fallback plan',()=>{
 const rows=baselineFixtures(),context={};
 const api=runtimeApi(context);
 const sparseProfile={countryCode:'BD',iso3:'BGD',name:'Bangladesh',
  sourceValues:{},indicators:{population2015:170000000},populationValues:{population_2015:170000000}};
 const sparseGovernment=Object.assign({},rows.government,{economicSectorContext:{valueAddedShares:{}}});
 const plan=api.buildPlan('BGD',rows.private,sparseGovernment,sparseProfile,{gdpCurrentUsd:null},null,{
  getCurrencyCode:()=>null,getRate:()=>null
 });
 assert.equal(plan.currencyCode,'LOC-BGD');
 assert.equal(plan.fxLocalPerUsd,1);
 assert.equal(plan.currencySource,'COUNTRY_LOCAL_UNIT_FALLBACK');
 assert.ok(plan.totalOpeningCapital>0);
 assert.equal(plan.privateSectorShareEvidence.evidenceStatus,'COUNTRY_INDUSTRY_ARCHETYPE_FALLBACK');
});
function makeLifecycleHarness(){
 const state={
  simulation:{turn:12,session:{playerCountryId:'BGD'}},playerCountryId:'BGD',
  finance:{BGD:{available:987654321, currencyCode:'BDT',omegaFinance:{treasuryBalanceUsd:123456789,ledger:[]}}},
  economy:{BGD:{}},resource:{BGD:{}}
 };
 const handlers=new Map();
 const sandbox={
  Game:{state,playerCountry:'BGD'},
  Omega:{Simulation:{world:{state},getPlayerCountryId:()=> 'BGD'}},
  OmegaResourceIndustrialCatalogData:{factoryProfiles:{},downstreamFactoryRecipes:{}},
  addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},
  dispatchEvent(event){(handlers.get(event.type)||[]).forEach(fn=>fn(event));},
  CustomEvent:function(type,options){this.type=type;this.detail=options&&options.detail||{};}
 };
 runInNewContext(lifecycleSource,sandbox);
 return{state,sandbox,api:sandbox.OmegaPrivateEnterpriseLifecycleV1};
}
function capitalInput(overrides={}){
 const companyAllocations=COMPANY_IDS.map((companyId,index)=>({
  companyId,amount:[5000,3500,2500,1500,2500][index],sharePct:[33.33,23.33,16.67,10,16.67][index],
  privateFactoryUnits:5-index,capitalWeightedFactoryUnits:6-index
 }));
 return Object.assign({
  countryId:'BGD',currencyCode:'BDT',totalCapital:15000,
  baselineId:'OMEGA_PRIVATE_COMPANY_OPENING_CAPITAL_V1',privateSectorContributionPct:74.5,
  gdpUsd:450000000000,gdpLocal:49500000000000,fxLocalPerUsd:110,
  companyAllocations,model:{authority:'OMEGA_PRIVATE_COMPANY_CAPITAL_ALLOCATION_V1'}
 },overrides);
}
test('Finance opening capital is idempotent, local-currency-only and never moves sovereign Treasury cash',()=>{
 const h=makeLifecycleHarness(),treasury=h.state.finance.BGD.available,treasuryUsd=h.state.finance.BGD.omegaFinance.treasuryBalanceUsd;
 const input=capitalInput();
 const first=h.api.initializeOpeningCompanyCapital(input);
 assert.equal(first.status,'INITIALIZED',JSON.stringify(first));
 assert.equal(first.seededCompanies.length,5);
 const root=h.state.finance.BGD.omegaFinance;
 assert.equal(Object.keys(root.companyCapitalAccounts).length,5);
 assert.equal(root.ledger.filter(row=>row.type==='PRIVATE_COMPANY_OPENING_CAPITAL').length,5);
 for(const company of COMPANY_IDS){
  const account=root.companyCapitalAccounts[company];
  const allocation=input.companyAllocations.find(row=>row.companyId===company);
  assert.equal(account.currency,'BDT');
  assert.equal(account.availableBalance,allocation.amount);
  assert.equal(account.capitalRaised,allocation.amount);
 }
 assert.equal(h.state.finance.BGD.available,treasury);
 assert.equal(root.treasuryBalanceUsd,treasuryUsd);
 const balanceBefore=JSON.stringify(root.companyCapitalAccounts);
 const ledgerCount=root.ledger.length;
 const replay=h.api.initializeOpeningCompanyCapital(input);
 assert.equal(replay.status,'ALREADY_INITIALIZED');
 assert.equal(root.ledger.length,ledgerCount);
 assert.equal(JSON.stringify(root.companyCapitalAccounts),balanceBefore);
 assert.equal(h.api.initializeOpeningCompanyCapital(Object.assign({},input,{countryId:'USA'})).reason,'PLAYER_COUNTRY_SCOPE_ONLY');
 assert.ok(root.ledger.filter(row=>row.type==='PRIVATE_COMPANY_OPENING_CAPITAL')
  .every(row=>row.publicTreasuryDebit===0&&row.publicTreasuryCredit===0&&row.affectsGovernmentTreasury===false));
});
test('opening capital preserves an existing company wallet and seeds only untouched companies',()=>{
 const h=makeLifecycleHarness();
 h.state.finance.BGD.omegaFinance.companyCapitalAccounts={
  AURORA_INDUSTRIAL_GROUP:{companyId:'AURORA_INDUSTRIAL_GROUP',currency:'BDT',
   availableBalance:900,reservedBalance:100,capitalRaised:1000,capitalSpent:0,revision:2}
 };
 const result=h.api.initializeOpeningCompanyCapital(capitalInput());
 assert.equal(result.status,'PARTIALLY_INITIALIZED');
 assert.ok(result.preservedCompanies.includes('AURORA_INDUSTRIAL_GROUP'));
 assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts.AURORA_INDUSTRIAL_GROUP.availableBalance,900);
 assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts.NOVA_CONSUMER_INDUSTRIES.currency,'BDT');
 assert.equal(h.state.finance.BGD.omegaFinance.ledger.filter(row=>row.type==='PRIVATE_COMPANY_OPENING_CAPITAL').length,4);
});
test('opening capital refuses a reused transaction ID with a different amount or currency',()=>{
 const h=makeLifecycleHarness(),input=capitalInput();
 h.api.initializeOpeningCompanyCapital(input);
 const altered=capitalInput();
 altered.companyAllocations[0].amount+=100;
 altered.companyAllocations[1].amount-=100;
 assert.equal(h.api.initializeOpeningCompanyCapital(altered).reason,'OPENING_CAPITAL_IDEMPOTENCY_COLLISION');
});
test('active-country initialization waits for country registries and submits one balanced local-currency plan',async()=>{
 const rows=baselineFixtures(),calls=[];let generalFetchCount=0;
 const sandbox={
  Game:{state:{simulation:{session:{playerCountryId:'BGD'}}}},
  Omega:{Simulation:{world:{state:{simulation:{session:{playerCountryId:'BGD'}}}},getPlayerCountryId:()=> 'BGD'}},
  OmegaPrivateEnterpriseLifecycleV1:{initializeOpeningCompanyCapital(input){
   calls.push(input);return{status:'INITIALIZED',countryId:input.countryId,currency:input.currencyCode,totalCapital:input.totalCapital};
  }},
  OmegaPrivateEnterpriseRegistryV1:{ready:Promise.resolve({status:'READY'}),getCountryBaseline:()=>rows.private},
  OmegaCountryFactoryStartingBaselineV1:{ready:Promise.resolve({status:'READY'}),getCountryBaseline:()=>rows.government},
  OmegaCountryRuntimeData:{ready:Promise.resolve(true),getProfile:()=>profile},
  OmegaCountryGeneralDataRuntime:{init:async country=>{generalFetchCount++;return country==='BGD';},getCountryRecord:()=>general},
  OmegaFinanceMinistry:{init:async()=>({ok:true}),getIndicators:()=>({gdpCurrentUsd:450000000000})},
  OmegaForexMonetaryEngine:{getCurrencyCode:()=> 'BDT',getRate:()=>110},
  addEventListener(){},dispatchEvent(){},CustomEvent:function(type,options){this.type=type;this.detail=options?.detail||{};}
 };
 const api=runtimeApi(sandbox);
 const result=await api.ensureCountryInitialized('BGD');
 assert.equal(result.status,'INITIALIZED',JSON.stringify(result));
 assert.equal(calls.length,1);
 assert.equal(calls[0].countryId,'BGD');
 assert.equal(calls[0].currencyCode,'BDT');
 assert.equal(calls[0].companyAllocations.reduce((sum,row)=>sum+row.amount,0),calls[0].totalCapital);
 assert.equal((await api.ensureCountryInitialized('BGD')).status,'INITIALIZED');
 assert.equal(calls.length,1,'the same country should not be initialized twice in one session');
 assert.equal(generalFetchCount,0,'capital opening should use cached general data or the existing country baseline without forcing an online API fetch');
});
test('opening capital runtime refuses a non-player country before loading global data',async()=>{
 let fetchCount=0;
 const sandbox={
  Game:{state:{simulation:{session:{playerCountryId:'BGD'}}}},
  Omega:{Simulation:{world:{state:{simulation:{session:{playerCountryId:'BGD'}}}},getPlayerCountryId:()=> 'BGD'}},
  OmegaPrivateEnterpriseLifecycleV1:{initializeOpeningCompanyCapital(){throw new Error('must_not_run');}},
  OmegaPrivateEnterpriseRegistryV1:{get ready(){fetchCount++;return Promise.resolve({status:'READY'});}},
  OmegaCountryFactoryStartingBaselineV1:{get ready(){fetchCount++;return Promise.resolve({status:'READY'});}},
  OmegaCountryRuntimeData:{ready:Promise.resolve(true)},
  OmegaFinanceMinistry:{init:async()=>({ok:true})},
  addEventListener(){},dispatchEvent(){},CustomEvent:function(){}
 };
 const api=runtimeApi(sandbox);
 // The runtime automatically starts the active BGD country on module load.
 // Let that boot attempt settle, then measure only the explicit non-player request.
 await new Promise(resolve=>setTimeout(resolve,0));
 const fetchesBeforeForeignRequest=fetchCount;
 const result=await api.ensureCountryInitialized('USA');
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'PLAYER_COUNTRY_SCOPE_ONLY');
 assert.equal(fetchCount,fetchesBeforeForeignRequest,'a non-player country request must not fetch or initialize another country');
});
