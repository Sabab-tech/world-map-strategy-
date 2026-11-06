import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const lifecycleSource=readFileSync(new URL('../omega_private_enterprise_lifecycle_v1.js',import.meta.url),'utf8');
const COMPANY='NOVA_CONSUMER_INDUSTRIES';
const catalog={
  factoryProfiles:{
    STEEL_WORKS:{
      factoryType:'STEEL_WORKS',name:'Steel Works',defaultRecipeId:'STEEL_ROUTE',
      constructionCost:100,constructionDays:60,defaultCapacityPerDay:10,
      constructionMaterials:{construction_aggregate:10},constructionMaterialUnit:'SIMULATION_RESOURCE_UNIT',
      workforce:{operators:4},utilities:{electricityMWhPerDay:2},unit:'GAME_CURRENCY_UNITS'
    },
    ZERO_GOV_FACTORY:{
      factoryType:'ZERO_GOV_FACTORY',name:'Zero Government Factory',defaultRecipeId:'ZERO_ROUTE',
      constructionCost:50,constructionDays:30,defaultCapacityPerDay:1,
      constructionMaterials:{construction_aggregate:1},unit:'GAME_CURRENCY_UNITS'
    }
  },
  downstreamFactoryRecipes:{
    STEEL_ROUTE:{recipeId:'STEEL_ROUTE',factoryType:'STEEL_WORKS',inputs:{iron_ore:2},outputs:{steel:1},cycleDays:1},
    ZERO_ROUTE:{recipeId:'ZERO_ROUTE',factoryType:'ZERO_GOV_FACTORY',inputs:{iron_ore:1},outputs:{steel:1},cycleDays:1}
  }
};
function makeHarness(){
  const state={
    simulation:{turn:4,session:{playerCountryId:'BGD'}},
    playerCountryId:'BGD',
    finance:{BGD:{available:1000,omegaFinance:{treasuryBalanceUsd:1000,ledger:[]}}},
    economy:{BGD:{productionAssets:[]}},
    resource:{BGD:{inventory:{iron_ore:100,construction_aggregate:100},warehouse:{
      availableByResource:{iron_ore:100,construction_aggregate:100},reservedByResource:{}
    },industrialNetwork:{projects:[]}}}
  };
  const handlers=new Map();
  const projects=state.resource.BGD.industrialNetwork.projects;
  const network={
    failRequestId:null,
    factoryUtilityDiagnostics(){
      return{status:'HEALTHY',utilityAuthority:'TEST_SIMULATION_UTILITY_STATE',
        electricity:{availableThisTurn:10},water:{availableThisTurn:20},
        workforce:{unemployedCount:100,authority:'TEST_SIMULATION_LABOUR_POOL'},
        transportCapacity:{truck:{availableThisTurn:500,unit:'SIMULATION_RESOURCE_UNITS_PER_TURN',authority:'TEST_SIMULATION_TRANSPORT'}}};
    },
    factoryConstructionMaterialQuote(country,profile){
      return{status:'QUOTED',materials:[{resourceId:'construction_aggregate',required:profile.constructionMaterials.construction_aggregate,available:100,sufficient:true}]};
    },
    startFactoryProject(input){
      if(network.failRequestId===input.requestId)return{status:'BLOCKED',reason:'TEST_PROJECT_REJECTED'};
      const project={
        projectId:'FACTORY:BGD:'+input.factoryType+':'+input.requestId,
        factoryId:'FAC:BGD:'+input.factoryType+':'+input.requestId,
        projectType:'FACTORY_CONSTRUCTION',countryId:'BGD',factoryType:input.factoryType,
        recipeId:input.recipeId,requestId:input.requestId,status:'UNDER_CONSTRUCTION',
        durationDays:60,progressDays:0,cost:input.cost,
        ...input
      };
      projects.push(project);
      return project;
    }
  };
  const governmentBaseline={
    getCountryBaseline(){
      return{factoryCounts:{STEEL_WORKS:10,ZERO_GOV_FACTORY:0}};
    }
  };
  const privateBaseline={
    getCountryBaseline(){
      return{status:'READY',countryId:'BGD',governmentFactoryCounts:{STEEL_WORKS:10,ZERO_GOV_FACTORY:0},
        factoryCounts:{STEEL_WORKS:10,ZERO_GOV_FACTORY:0},totalPrivateFactoryUnits:10,
        companies:[
          {companyId:'AURORA_INDUSTRIAL_GROUP',factoryCounts:{STEEL_WORKS:2,ZERO_GOV_FACTORY:0}},
          {companyId:'MERIDIAN_ENGINEERING_GROUP',factoryCounts:{STEEL_WORKS:2,ZERO_GOV_FACTORY:0}},
          {companyId:'NOVA_CONSUMER_INDUSTRIES',factoryCounts:{STEEL_WORKS:2,ZERO_GOV_FACTORY:0}},
          {companyId:'ATLAS_TECHNOLOGY_CORPORATION',factoryCounts:{STEEL_WORKS:2,ZERO_GOV_FACTORY:0}},
          {companyId:'TERRA_INFRASTRUCTURE_GROUP',factoryCounts:{STEEL_WORKS:2,ZERO_GOV_FACTORY:0}}
        ]};
    }
  };
  const sandbox={
    Game:{state,playerCountry:'BGD'},
    Omega:{
      Simulation:{getPlayerCountryId:()=> 'BGD'},
      ResourceIndustrialNetwork:network
    },
    OmegaResourceIndustrialNetwork:network,
    OmegaResourceIndustrialCatalogData:catalog,
    OmegaPrivateEnterpriseRegistryV1:privateBaseline,
    OmegaCountryFactoryStartingBaselineV1:governmentBaseline,
    addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},
    dispatchEvent(event){(handlers.get(event.type)||[]).forEach(fn=>fn(event));},
    CustomEvent:function(type,options){this.type=type;this.detail=options&&options.detail||{};},
    document:{head:{appendChild(){}},createElement(){return{set textContent(value){this.css=value;},get textContent(){return this.css;}};}}
  };
  runInNewContext(lifecycleSource,sandbox);
  return{state,network,projects,handlers,api:sandbox.OmegaPrivateEnterpriseLifecycleV1,sandbox};
}
function emit(harness,type,detail){(harness.handlers.get(type)||[]).forEach(fn=>fn({type,detail}));}

test('autonomous company proposals are deterministic, once per 30 turns, and have no asset/stock/cash side effects',()=>{
  const h=makeHarness(),beforeInventory=JSON.stringify(h.state.resource.BGD.inventory);
  const beforeWarehouse=JSON.stringify(h.state.resource.BGD.warehouse);
  const beforeTreasury=h.state.finance.BGD.available;
  const first=h.api.advanceAutonomousProposalCycle();
  assert.equal(first.status,'WAITING');
  assert.equal(first.reason,'AUTONOMOUS_PROPOSAL_REVIEW_NOT_DUE');
  h.state.simulation.turn=30;
  const proposal=h.api.advanceAutonomousProposalCycle();
  assert.equal(proposal.status,'PROPOSED');
  assert.equal(proposal.proposal.companyId,'AURORA_INDUSTRIAL_GROUP');
  assert.equal(proposal.proposal.submissionMode,'AUTONOMOUS_COMPANY_TURN_CYCLE');
  assert.equal(proposal.proposal.proposalPeriod,1);
  assert.equal(proposal.proposal.status,'PROPOSED');
  assert.equal(h.projects.length,0);
  assert.equal(h.state.economy.BGD.productionAssets.length,0);
  assert.equal(JSON.stringify(h.state.resource.BGD.inventory),beforeInventory);
  assert.equal(JSON.stringify(h.state.resource.BGD.warehouse),beforeWarehouse);
  assert.equal(h.state.finance.BGD.available,beforeTreasury);
  assert.equal(h.api.advanceAutonomousProposalCycle().status,'DUPLICATE');
  h.state.simulation.turn=60;
  const next=h.api.advanceAutonomousProposalCycle();
  assert.equal(next.status,'PROPOSED');
  assert.equal(next.proposal.companyId,'MERIDIAN_ENGINEERING_GROUP');
  assert.equal(next.proposal.proposalPeriod,2);
  assert.equal(h.projects.length,0);
  assert.equal(h.state.economy.BGD.productionAssets.length,0);
});

test('proposal -> approval -> real Treasury grant -> construction -> private commissioning is replay-safe and uses shared assets',()=>{
  const h=makeHarness(),api=h.api;
  const proposal=api.createProposal({countryId:'BGD',companyId:COMPANY,operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',factoryType:'STEEL_WORKS',quantity:1,
    sourcingPolicy:'COMPANY_FUNDED_IMPORTS',stateSupportRequested:true,requestId:'proposal-001'});
  assert.equal(proposal.status,'PROPOSED');
  assert.equal(h.projects.length,0);
  assert.equal(h.state.economy.BGD.productionAssets.length,0);
  assert.equal(h.state.finance.BGD.available,1000);

  const preview=api.previewProposal('BGD',proposal.proposalId);
  assert.equal(preview.status,'READY');
  assert.equal(preview.operationalReadiness.status,'READY');
  assert.equal(preview.operationalReadiness.requirements.find(x=>x.type==='ELECTRICITY').available,10);
  assert.equal(preview.operationalReadiness.requirements.find(x=>x.type==='WORKFORCE').available,100);
  assert.equal(preview.operationalReadiness.transportCapacity[0].mode,'truck');
  assert.equal(preview.shortages.length,1);
  assert.equal(preview.shortages[0].resourceId,'iron_ore');
  assert.equal(preview.shortages[0].shortfall,500);
  assert.equal(h.state.resource.BGD.inventory.iron_ore,100);

  const decision=api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE',
    allowStateSupport:true,conditions:{allowStateSupport:true}});
  assert.equal(decision.status,'APPROVED_AWAITING_FUNDING');
  assert.ok(decision.proposal.permit.permitId);
  assert.equal(decision.proposal.permit.companyId,COMPANY);
  assert.equal(decision.proposal.permit.operatorCompanyId,'MERIDIAN_ENGINEERING_GROUP');
  assert.equal(decision.proposal.decision.permitId,decision.proposal.permit.permitId);
  assert.equal(h.projects.length,0);

  const funding=api.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,sourceType:'GOVERNMENT_GRANT',amount:100});
  assert.equal(funding.status,'FUNDED');
  assert.equal(h.state.finance.BGD.available,900);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,100);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.filter(x=>x.type==='PRIVATE_ENTERPRISE_GOVERNMENT_GRANT').length,1);
  assert.equal(api.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,sourceType:'GOVERNMENT_GRANT',amount:100}).status,'DUPLICATE');
  assert.equal(h.state.finance.BGD.available,900);

  const build=api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(build.status,'UNDER_CONSTRUCTION');
  assert.equal(build.started.length,1);
  assert.equal(h.projects.length,1);
  assert.equal(h.projects[0].sourcePrivateProposalId,proposal.proposalId);
  assert.equal(h.projects[0].ownerCompanyId,COMPANY);
  assert.equal(h.projects[0].operatorCompanyId,'MERIDIAN_ENGINEERING_GROUP');
  assert.equal(h.projects[0].permitId,decision.proposal.permit.permitId);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,0);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].capitalSpent,100);
  assert.equal(h.state.economy.BGD.companyAccounts,undefined,'legacy company flow tracker is not treated as a cash wallet');

  const project=h.projects[0];
  project.status='COMPLETED';
  h.state.economy.BGD.productionAssets.push({id:project.factoryId,countryId:'BGD',factoryType:'STEEL_WORKS',status:'OPERATIONAL'});
  emit(h,'OMEGA_FACTORY_CAPACITY_CHANGED',{countryId:'BGD',payload:{projectId:project.projectId}});
  const asset=h.state.economy.BGD.productionAssets[0];
  assert.equal(asset.ownerCompanyId,COMPANY);
  assert.equal(asset.operatorCompanyId,'MERIDIAN_ENGINEERING_GROUP');
  assert.equal(asset.privatePermitId,decision.proposal.permit.permitId);
  assert.equal(asset.ownerType,'PRIVATE_ENTERPRISE');
  assert.equal(asset.operatorType,'PRIVATE_COMPANY_OPERATOR');
  assert.equal(asset.stateControlRights.licensingAndPermits,true);
  assert.equal(asset.stateControlRights.operationalControl,'STATE_POLICY_ONLY');
  assert.equal(asset.stateControlRights.domesticSupplyDirection,true);
  assert.equal(asset.stateControlRights.exportControl,true);
  assert.equal(asset.stateControlRights.publicProcurement,true);
  assert.equal(asset.stateControlRights.authority,'OMEGA_STATE_CONTROL_RIGHTS_V1');
  assert.equal(asset.status,'BLOCKED');
  assert.equal(asset.blockedReason,'SAB34_PIPELINE_PROOF_REQUIRED');
  assert.equal(asset.productionEnabled,false);
  assert.equal(api.getProposal('BGD',proposal.proposalId).status,'COMMISSIONED_PRODUCTION_GATED');
  assert.equal(api.diagnostics().productionEnabled,false);

  h.sandbox.OmegaPrivateEnterprisePipelineProof={status:'VERIFIED',siteSelection:true,extraction:true,
    logisticsReceipt:true,factoryInput:true,finishedGoods:true,saveLoad:true,exactMainSha:'abcdef1234567'};
  const gate=api.refreshCommissionedProductionGate('BGD',project.factoryId);
  assert.equal(gate.status,'READY');
  assert.equal(asset.status,'OPERATIONAL');
  assert.equal(asset.productionEnabled,true);
  assert.equal(asset.blockedReason,null);
  assert.equal(api.getProposal('BGD',proposal.proposalId).status,'COMMISSIONED');
  assert.equal(api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId}).status,'DUPLICATE');
  assert.equal(h.state.economy.BGD.productionAssets.length,1);
});

test('domestic-only approval fails closed on a measured shortage or unobserved stock',()=>{
  const h=makeHarness();
  const proposal=h.api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:1,sourcingPolicy:'DOMESTIC_ONLY'});
  const result=h.api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE'});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.reason,'DOMESTIC_INPUT_SHORTAGE');
  assert.equal(h.api.getProposal('BGD',proposal.proposalId).status,'PROPOSED');
  assert.equal(h.state.resource.BGD.inventory.iron_ore,100);
});

test('domestic approval subtracts strategic protection and current national demand, and blocks unobserved demand',()=>{
  const h=makeHarness();
  h.state.resource.BGD.inventory.iron_ore=1000;
  h.state.resource.BGD.warehouse.availableByResource.iron_ore=1000;
  h.state.resource.BGD.strategicReserve={availableByResource:{iron_ore:100}};
  const proposal=h.api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:1,sourcingPolicy:'DOMESTIC_ONLY'});
  const unknown=h.api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE'});
  assert.equal(unknown.status,'BLOCKED');
  assert.equal(unknown.reason,'DOMESTIC_INPUT_STOCK_UNOBSERVED');
  assert.equal(h.state.resource.BGD.inventory.iron_ore,1000);

  h.state.resource.BGD.demandRuntime={lastTurn:4,byResource:{iron_ore:{
    demandPerDay:11,consumerDemandPerDay:5,activeFactoryInputDemandPerDay:6,pendingImportQuantity:0
  }}};
  const pressured=h.api.previewProposal('BGD',proposal.proposalId);
  assert.equal(pressured.maximumSafeDomesticFactoryQuantity,0);
  assert.equal(pressured.inputRequirements[0].protectedStock,100);
  assert.equal(pressured.inputRequirements[0].existingDemand30Day,330);
  assert.equal(pressured.inputRequirements[0].available,570);
  assert.equal(pressured.shortages[0].shortfall,30);
  const blocked=h.api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE'});
  assert.equal(blocked.status,'BLOCKED');
  assert.equal(blocked.reason,'DOMESTIC_INPUT_SHORTAGE');

  h.state.resource.BGD.demandRuntime.byResource.iron_ore.demandPerDay=10;
  h.state.resource.BGD.demandRuntime.byResource.iron_ore.consumerDemandPerDay=4;
  h.state.resource.BGD.demandRuntime.byResource.iron_ore.activeFactoryInputDemandPerDay=6;
  const safe=h.api.previewProposal('BGD',proposal.proposalId);
  assert.equal(safe.maximumSafeDomesticFactoryQuantity,1);
  assert.equal(safe.inputRequirements[0].available,600);
  assert.equal(safe.shortages.length,0);
  const approved=h.api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE'});
  assert.equal(approved.status,'APPROVED_AWAITING_FUNDING');
  assert.equal(approved.proposal.decision.domesticInputCeiling,600);
});

test('zero-government factory categories cannot receive a private expansion proposal approval',()=>{
  const h=makeHarness();
  const proposal=h.api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'ZERO_GOV_FACTORY',quantity:1,sourcingPolicy:'COMPANY_FUNDED_IMPORTS'});
  assert.equal(proposal.status,'PROPOSED');
  const preview=h.api.previewProposal('BGD',proposal.proposalId);
  assert.equal(preview.status,'BLOCKED');
  assert.equal(preview.maximumPrivateUnits,0);
  const result=h.api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE'});
  assert.equal(result.status,'BLOCKED');
  assert.equal(h.projects.length,0);
});

test('partial construction resumes remaining units without duplicate project or capex entries',()=>{
  const h=makeHarness(),api=h.api;
  const proposal=api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:2,
    sourcingPolicy:'COMPANY_FUNDED_IMPORTS',stateSupportRequested:true});
  assert.equal(api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE',
    allowStateSupport:true,conditions:{allowStateSupport:true}}).status,'APPROVED_AWAITING_FUNDING');
  assert.equal(api.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,sourceType:'GOVERNMENT_GRANT',amount:200}).status,'FUNDED');
  h.network.failRequestId=proposal.proposalId+':UNIT:2';
  const first=api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(first.status,'PARTIALLY_UNDER_CONSTRUCTION');
  assert.equal(first.proposal.projectIds.length,1);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].capitalSpent,100);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,100);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.filter(x=>x.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX').length,1);

  h.network.failRequestId=null;
  const resumed=api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(resumed.status,'UNDER_CONSTRUCTION');
  assert.equal(resumed.proposal.projectIds.length,2);
  assert.equal(h.projects.length,2);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].capitalSpent,200);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,0);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.filter(x=>x.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX').length,2);
  assert.equal(api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId}).status,'DUPLICATE');
  assert.equal(h.projects.length,2);
});

test('an expired government permit cannot start construction after funding',()=>{
  const h=makeHarness();
  const proposal=h.api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:1,
    sourcingPolicy:'COMPANY_FUNDED_IMPORTS',stateSupportRequested:true});
  const approval=h.api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE',
    allowStateSupport:true,expiryTurn:3,conditions:{allowStateSupport:true}});
  assert.equal(approval.status,'APPROVED_AWAITING_FUNDING');
  assert.equal(approval.proposal.permit.expiresAtTurn,3);
  assert.equal(h.api.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,sourceType:'GOVERNMENT_GRANT',amount:100}).status,'FUNDED');
  const blocked=h.api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(blocked.status,'BLOCKED');
  assert.equal(blocked.reason,'GOVERNMENT_PERMIT_EXPIRED');
  assert.equal(h.projects.length,0);
  assert.equal(h.state.economy.BGD.productionAssets.length,0);
});

test('company capital receipts require an existing settled Finance ledger credit and reject replay',()=>{
  const h=makeHarness();
  h.state.finance.BGD.omegaFinance.ledger.push({transactionId:'BANK-DISBURSEMENT-1',type:'CORPORATE_LOAN_DISBURSEMENT',
    companyId:COMPANY,amount:250,currency:'GAME_CURRENCY_UNITS',direction:'CREDIT',status:'SETTLED'});
  const result=h.api.recordCompanyCapitalReceipt({countryId:'BGD',companyId:COMPANY,sourceTransactionId:'BANK-DISBURSEMENT-1',amount:250,currency:'GAME_CURRENCY_UNITS'});
  assert.equal(result.status,'POSTED');
  assert.equal(h.api.getCompanyCapitalSummary('BGD',COMPANY).availableBalance,250);
  const mismatched=h.api.recordCompanyCapitalReceipt({countryId:'BGD',companyId:COMPANY,sourceTransactionId:'BANK-DISBURSEMENT-1',amount:250,currency:'USD'});
  assert.equal(mismatched.status,'BLOCKED');
  assert.equal(mismatched.reason,'CAPITAL_SOURCE_CURRENCY_MISMATCH_OR_UNOBSERVED');
  assert.equal(h.api.getCompanyCapitalSummary('BGD',COMPANY).availableBalance,250);
  const replay=h.api.recordCompanyCapitalReceipt({countryId:'BGD',companyId:COMPANY,sourceTransactionId:'BANK-DISBURSEMENT-1',amount:250,currency:'GAME_CURRENCY_UNITS'});
  assert.equal(replay.status,'DUPLICATE');
  assert.equal(h.api.getCompanyCapitalSummary('BGD',COMPANY).availableBalance,250);
  const invalid=h.api.recordCompanyCapitalReceipt({countryId:'BGD',companyId:COMPANY,sourceTransactionId:'MISSING',amount:100});
  assert.equal(invalid.status,'BLOCKED');
  assert.equal(invalid.reason,'CAPITAL_RECEIPT_NOT_VERIFIED_IN_FINANCE_LEDGER');
});

test('proposal requests cannot be created for another country or an unknown company identity',()=>{
  const h=makeHarness();
  assert.equal(h.api.createProposal({countryId:'USA',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:1}).reason,'PLAYER_COUNTRY_SCOPE_ONLY');
  assert.equal(h.api.createProposal({countryId:'BGD',companyId:'UNREGISTERED_COMPANY',factoryType:'STEEL_WORKS',quantity:1}).reason,'UNKNOWN_CANONICAL_COMPANY');
  assert.equal(h.api.createProposal({countryId:'BGD',companyId:COMPANY,operatorCompanyId:'UNREGISTERED_OPERATOR',factoryType:'STEEL_WORKS',quantity:1}).reason,'UNKNOWN_PRIVATE_OPERATOR_COMPANY');
  assert.equal(h.projects.length,0);
});

test('Production Lines screen shows capital receipt verification for an approved underfunded company',()=>{
  const h=makeHarness();
  const proposal=h.api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:1,
    sourcingPolicy:'COMPANY_FUNDED_IMPORTS',requestId:'ui-funding-proposal'});
  const approval=h.api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE'});
  assert.equal(approval.status,'APPROVED_AWAITING_FUNDING');
  const fragments=[];
  const root={
    __omegaV2IndustryTab:'production-lines',
    __omegaV2IndustryCountryId:'BGD',
    __omegaV2IndustryOptions:{countryId:'BGD',tab:'production-lines'},
    querySelector(selector){
      if(selector==='.omega-v2-factory-command')return{insertAdjacentHTML(_position,html){fragments.push(html);},querySelector(){return null;}};
      if(selector==='.omega-v2-industry-command')return null;
      return null;
    },
    addEventListener(){},
  };
  h.sandbox.OmegaUIV2Industry={render(target,options){target.__omegaV2IndustryTab=options.tab;return{ok:true};}};
  // Re-evaluate the module against the Industry surface to exercise its render adapter.
  runInNewContext(lifecycleSource,h.sandbox);
  h.sandbox.OmegaUIV2Industry.render(root,{countryId:'BGD',tab:'production-lines'});
  assert.equal(fragments.length,1);
  assert.match(fragments[0],/Company expansion proposals/);
  assert.match(fragments[0],/data-pe-proposal-form/);
  assert.match(fragments[0],/data-pe-capital-form/);
  assert.match(fragments[0],/sourceTransactionId/);
  assert.match(fragments[0],/Verify company capital/);
  assert.match(fragments[0],/Government decision queue/);
  assert.match(fragments[0],/Private operator/);
  assert.match(fragments[0],/Construction and operating readiness/);
  assert.match(fragments[0],/PRODUCTION GATED BY SAB-34/);
  assert.equal(fragments[0].includes('data-omega-v2-industry-tab="companies"'),false);
});
