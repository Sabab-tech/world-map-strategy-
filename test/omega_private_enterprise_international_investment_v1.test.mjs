import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source=fs.readFileSync(new URL('../omega_private_enterprise_international_investment_v1.js',import.meta.url),'utf8');
const COMPANY_IDS=[
 'AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES',
 'ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'
];
const FACTORY_TYPES=[
 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT','STEEL_AND_ALLOY_WORKS',
 'NON_FERROUS_METAL_SMELTER','PETROCHEMICAL_POLYMER_PLANT','FERTILIZER_CHEMICAL_PLANT',
 'INDUSTRIAL_CHEMICALS_GAS_PLANT','CEMENT_CONCRETE_PLANT','GLASS_CERAMICS_PLANT',
 'PAPER_PACKAGING_MILL','FOOD_PROCESSING_COLD_CHAIN','TEXTILE_GARMENT_MILL',
 'INDUSTRIAL_MACHINERY_MACHINE_TOOLS','GRID_EQUIPMENT_FACTORY','ELECTRONICS_SEMICONDUCTOR_FAB',
 'BATTERY_ENERGY_STORAGE_PLANT','VEHICLE_TRUCK_BUS_ASSEMBLY','SHIP_RAIL_EQUIPMENT_YARD',
 'AEROSPACE_EQUIPMENT_PLANT','PHARMA_MEDICAL_SUPPLIES_PLANT','DEFENSE_EQUIPMENT_FACTORY',
 'RECYCLING_WASTE_PROCESSING_PLANT'
];
function fixture(){
 const state={
  simulation:{turn:12,session:{playerCountryId:'BGD'}},
  playerCountryId:'BGD',
  finance:{
   BGD:{available:900000,omegaFinance:{treasuryBalanceUsd:800000,ledger:[],companyCapitalAccounts:{}}},
   USA:{available:700000,omegaFinance:{treasuryBalanceUsd:600000,ledger:[],companyCapitalAccounts:{}}}
  },
  economy:{BGD:{},USA:{}},foreign:{}
 };
 for(const companyId of COMPANY_IDS){
  state.finance.BGD.omegaFinance.companyCapitalAccounts[companyId]={
   companyId,currency:'BDT',availableBalance:50000,reservedBalance:0,capitalRaised:50000,
   capitalSpent:0,revision:1
  };
 }
 const profiles={
  BGD:{iso3:'BGD',countryCode:'BD',name:'Bangladesh',currency_code:'BDT'},
  USA:{iso3:'USA',countryCode:'US',name:'United States',currency_code:'USD'}
 };
 const governmentBaseline=countryId=>({
  countryId,countryName:countryId==='BGD'?'Bangladesh':'United States',
  factoryCounts:Object.fromEntries(FACTORY_TYPES.map(type=>[type,10])),
  totalGovernmentFactoryUnits:210
 });
 const privateBaseline=countryId=>({
  status:'READY',countryId,countryName:profiles[countryId].name,
  factoryCounts:Object.fromEntries(FACTORY_TYPES.map(type=>[type,4])),
  totalPrivateFactoryUnits:84
 });
 const handlers=new Map(),scheduled=[];
 const sandbox={
  Game:{state,playerCountryId:'BGD'},
  Omega:{
   Simulation:{world:{state},getPlayerCountryId:()=>state.simulation.session.playerCountryId},
   PrivateCompanyCapitalRuntimeV1:{
    buildPlan(country){
     const currency=profiles[country].currency_code;
     return{countryId:country,currencyCode:currency,totalOpeningCapital:10000,
      baselineId:'OMEGA_PRIVATE_COMPANY_OPENING_CAPITAL_V1',privateSectorContributionPct:70,
      companyAllocations:COMPANY_IDS.map(companyId=>({companyId,amount:2000,sharePct:20,
       privateFactoryUnits:5,capitalWeightedFactoryUnits:6}))};
    },
    ensureCountryInitialized:async country=>({status:'ALREADY_INITIALIZED',countryId:country})
   },
   PrivateEnterpriseRegistryV1:{ready:Promise.resolve({status:'READY'}),getCountryBaseline:privateBaseline},
   CountryFactoryStartingBaselineV1:{ready:Promise.resolve({status:'READY'}),getCountryBaseline:governmentBaseline},
   CountryRuntimeData:{ready:Promise.resolve(true),getProfile:country=>profiles[country]},
   CountryGeneralData:{getCountryRecord:()=>null},
   FinanceMinistry:{init:async()=>({ok:true}),getIndicators:()=>({gdpCurrentUsd:1000000000})},
   ForexMonetaryEngine:{
    getCurrencyCode:profile=>profile?.currency_code,
    getRate:code=>({USD:1,BDT:110})[code]||null
   },
   WorldSimulationScheduler:{registerCountryHandler(id,handler,options){scheduled.push({id,handler,options});return()=>{};}}
  },
  addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},
  dispatchEvent(event){(handlers.get(event.type)||[]).forEach(fn=>fn(event));},
  CustomEvent:function(type,options){this.type=type;this.detail=options?.detail||{};}
 };
 runInNewContext(source,sandbox);
 return{state,sandbox,api:sandbox.OmegaPrivateEnterpriseInternationalInvestmentV1,scheduled};
}
const request=(overrides={})=>Object.assign({
 investorCountryId:'USA',investorCompanyId:'AURORA_INDUSTRIAL_GROUP',
 hostCountryId:'BGD',hostCompanyId:'NOVA_CONSUMER_INDUSTRIES',
 requestId:'BD-TEXTILE-001',amount:1000,currencyCode:'USD',
 equityBps:3000,factoryType:'TEXTILE_GARMENT_MILL',quantity:2
},overrides);

test('runtime registers a bounded macro-tier country handler without changing existing factory systems',async()=>{
 const h=fixture(),result=await h.api.init();
 assert.equal(result.status,'READY');
 assert.equal(result.schedulerRegistered,true);
 assert.equal(h.scheduled.length,1);
 assert.equal(h.scheduled[0].options.tiers.includes('MACRO'),true);
 assert.equal(h.scheduled[0].options.tiers.includes('PLAYER'),false);
 assert.equal(h.api.diagnostics().factoryPolicy,'EXISTING_PRIVATE_ENTERPRISE_GOVERNMENT_PERMIT_CONSTRUCTION_AND_COMMISSIONING_ONLY');
});

test('NPC country receives all five canonical company wallets without public Treasury movement',async()=>{
 const h=fixture();
 const treasury=h.state.finance.USA.available,treasuryUsd=h.state.finance.USA.omegaFinance.treasuryBalanceUsd;
 const result=await h.api.ensureCountryCapital('USA');
 assert.equal(result.status,'INITIALIZED');
 assert.equal(result.seededCompanies.length,5);
 const root=h.state.finance.USA.omegaFinance;
 assert.equal(Object.keys(root.companyCapitalAccounts).length,5);
 for(const companyId of COMPANY_IDS){
  const account=root.companyCapitalAccounts[companyId];
  assert.equal(account.currency,'USD');
  assert.equal(account.availableBalance,2000);
 }
 assert.equal(root.ledger.filter(row=>row.type==='PRIVATE_COMPANY_OPENING_CAPITAL').length,5);
 assert.equal(h.state.finance.USA.available,treasury);
 assert.equal(root.treasuryBalanceUsd,treasuryUsd);
 assert.ok(root.ledger.every(row=>row.affectsGovernmentTreasury===false));
 const replay=await h.api.ensureCountryCapital('USA');
 assert.equal(replay.status,'INITIALIZED');
 assert.equal(root.ledger.filter(row=>row.type==='PRIVATE_COMPANY_OPENING_CAPITAL').length,5);
});

test('foreign investment is reviewed by the host government and settles with reconciled FX ledgers',async()=>{
 const h=fixture();
 const beforeInvestorTreasury=h.state.finance.USA.available;
 const beforeHostTreasury=h.state.finance.BGD.available;
 const beforeInvestorCash=h.state.finance.USA.omegaFinance.companyCapitalAccounts.AURORA_INDUSTRIAL_GROUP?.availableBalance;
 await h.api.ensureCountryCapital('USA');
 const investor=h.state.finance.USA.omegaFinance.companyCapitalAccounts.AURORA_INDUSTRIAL_GROUP;
 const investorBefore=investor.availableBalance;
 const host=h.state.finance.BGD.omegaFinance.companyCapitalAccounts.NOVA_CONSUMER_INDUSTRIES;
 const hostBefore=host.availableBalance;
 const proposal=await h.api.submitInvestmentProposal(request());
 assert.equal(proposal.status,'PROPOSED');
 assert.equal(proposal.investorCountryId,'USA');
 assert.equal(proposal.hostCountryId,'BGD');
 assert.equal(investor.availableBalance,investorBefore,'proposal must not reserve or spend capital');
 assert.equal(host.availableBalance,hostBefore,'proposal must not credit host capital before approval');
 assert.equal(h.api.reviewInvestmentProposal({hostCountryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE'}).status,'APPROVED');
 const settled=h.api.settleInvestmentProposal({hostCountryId:'BGD',proposalId:proposal.proposalId});
 assert.equal(settled.status,'SETTLED');
 assert.equal(settled.investment.usdAmount,1000);
 assert.equal(settled.investment.amountHostLocal,110000);
 assert.equal(investor.availableBalance,investorBefore-1000);
 assert.equal(host.availableBalance,hostBefore+110000);
 assert.equal(host.foreignEquityReceived,110000);
 assert.equal(host.foreignShareholders[0].investorCountryId,'USA');
 assert.equal(host.foreignShareholders[0].investorCompanyId,'AURORA_INDUSTRIAL_GROUP');
 assert.equal(host.foreignShareholders[0].shareBps,3000);
 const investorLedger=h.state.finance.USA.omegaFinance.ledger;
 const hostLedger=h.state.finance.BGD.omegaFinance.ledger;
 const tx=settled.investment.transactionId;
 assert.equal(investorLedger.filter(row=>row.transactionId===tx&&row.direction==='DEBIT').length,1);
 assert.equal(hostLedger.filter(row=>row.transactionId===tx&&row.direction==='CREDIT').length,1);
 assert.equal(investorLedger.find(row=>row.transactionId===tx).usdAmount,1000);
 assert.equal(hostLedger.find(row=>row.transactionId===tx).usdAmount,1000);
 assert.equal(h.state.finance.USA.available,beforeInvestorTreasury);
 assert.equal(h.state.finance.BGD.available,beforeHostTreasury);
 assert.equal(beforeInvestorCash,undefined);
 const duplicate=h.api.settleInvestmentProposal({hostCountryId:'BGD',proposalId:proposal.proposalId});
 assert.equal(duplicate.status,'DUPLICATE');
 assert.equal(investorLedger.filter(row=>row.transactionId===tx).length,1);
 assert.equal(hostLedger.filter(row=>row.transactionId===tx).length,1);
});

test('host government authority cannot be exercised while another country is selected',async()=>{
 const h=fixture();await h.api.ensureCountryCapital('USA');
 const proposal=await h.api.submitInvestmentProposal(request());
 h.state.simulation.session.playerCountryId='USA';
 const result=h.api.reviewInvestmentProposal({hostCountryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE'});
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'HOST_GOVERNMENT_PLAYER_COUNTRY_SCOPE_ONLY');
});

test('war or sanctions block proposals before company capital is moved',async()=>{
 const h=fixture();await h.api.ensureCountryCapital('USA');
 h.state.foreign.USA={relations:{BGD:{sanctions:true}}};
 const source=h.state.finance.USA.omegaFinance.companyCapitalAccounts.AURORA_INDUSTRIAL_GROUP;
 const before=source.availableBalance;
 const result=await h.api.submitInvestmentProposal(request());
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'BILATERAL_SANCTIONS_OR_WAR_BLOCK_FOREIGN_INVESTMENT');
 assert.equal(source.availableBalance,before);
});

test('foreign ownership cannot exceed 100 percent of the host private company',async()=>{
 const h=fixture();await h.api.ensureCountryCapital('USA');
 const first=await h.api.submitInvestmentProposal(request({requestId:'SHARE-70',equityBps:7000,amount:1000}));
 assert.equal(first.status,'PROPOSED');
 h.api.reviewInvestmentProposal({hostCountryId:'BGD',proposalId:first.proposalId,decision:'APPROVE'});
 assert.equal(h.api.settleInvestmentProposal({hostCountryId:'BGD',proposalId:first.proposalId}).status,'SETTLED');
 const second=await h.api.submitInvestmentProposal(request({requestId:'SHARE-40',equityBps:4000,amount:1000}));
 assert.equal(second.status,'PROPOSED');
 h.api.reviewInvestmentProposal({hostCountryId:'BGD',proposalId:second.proposalId,decision:'APPROVE'});
 const source=h.state.finance.USA.omegaFinance.companyCapitalAccounts.AURORA_INDUSTRIAL_GROUP;
 const before=source.availableBalance;
 const result=h.api.settleInvestmentProposal({hostCountryId:'BGD',proposalId:second.proposalId});
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'HOST_COMPANY_FOREIGN_EQUITY_LIMIT_EXCEEDED');
 assert.equal(source.availableBalance,before);
});

test('foreign investment only reports production and employment after an existing lifecycle asset is commissioned',async()=>{
 const h=fixture();await h.api.ensureCountryCapital('USA');
 const p=await h.api.submitInvestmentProposal(request({requestId:'LINK-1'}));
 h.api.reviewInvestmentProposal({hostCountryId:'BGD',proposalId:p.proposalId,decision:'APPROVE'});
 const settled=h.api.settleInvestmentProposal({hostCountryId:'BGD',proposalId:p.proposalId});
 const investmentId=settled.investment.investmentId;
 h.state.economy.BGD.privateEnterpriseLifecycle={proposals:[{
  proposalId:'HOST-FACTORY-PROPOSAL',companyId:'NOVA_CONSUMER_INDUSTRIES',
  factoryType:'TEXTILE_GARMENT_MILL',quantity:2,status:'COMMISSIONED_PRODUCTION_GATED'
 }]};
 assert.equal(h.api.linkInvestmentToFactoryProposal({hostCountryId:'BGD',investmentId,factoryProposalId:'HOST-FACTORY-PROPOSAL'}).status,'LINKED');
 assert.equal(h.api.getCountryInvestments('BGD').inboundInvestments[0].productionStatus,'FACTORY_PROPOSAL_LINKED');
 assert.equal(h.api.reconcileCountry('BGD').linked,0);
 h.state.economy.BGD.productionAssets=[{
  id:'BGD-TEXTILE-FACTORY-01',ownerCompanyId:'NOVA_CONSUMER_INDUSTRIES',
  factoryType:'TEXTILE_GARMENT_MILL',sourcePrivateProposalId:'HOST-FACTORY-PROPOSAL',
  productionEnabled:true,status:'OPERATIONAL',workforce:{total:320}
 }];
 const reconciliation=h.api.reconcileCountry('BGD');
 assert.equal(reconciliation.linked,1);
 const record=h.api.getCountryInvestments('BGD').inboundInvestments[0];
 assert.equal(record.productionStatus,'OPERATIONAL');
 assert.equal(record.employmentStatus,'RECORDED_IN_EXISTING_FACTORY_RUNTIME');
 assert.equal(record.observedEmployment,320);
 assert.deepEqual(Array.from(record.factoryIds),['BGD-TEXTILE-FACTORY-01']);
});
