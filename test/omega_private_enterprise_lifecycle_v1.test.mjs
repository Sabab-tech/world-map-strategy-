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
      if(String(input.ownerType||'').toUpperCase()==='PRIVATE_ENTERPRISE'){
        const authorization=sandbox.OmegaPrivateEnterpriseLifecycleV1?.authorizeFactoryProjectConstruction?.(input);
        if(authorization?.status!=='AUTHORIZED')
          return{status:'BLOCKED',reason:authorization?.reason||'PRIVATE_FACTORY_CONSTRUCTION_AUTHORIZATION_REQUIRED',authorization};
      }
      const project={
        projectId:'FACTORY:BGD:'+input.factoryType+':'+input.requestId,
        factoryId:'FAC:BGD:'+input.factoryType+':'+input.requestId,
        projectType:'FACTORY_CONSTRUCTION',countryId:'BGD',factoryType:input.factoryType,
        recipeId:input.recipeId,requestId:input.requestId,status:'UNDER_CONSTRUCTION',
        durationDays:60,progressDays:0,cost:input.cost,
        privatePermitId:input.permitId,privatePermitStatus:'ACTIVE',privatePermitAuthority:input.permitAuthority,
        ...input
      };
      projects.push(project);
      return project;
    }
  };
  const governmentBaseline={
    getCountryBaseline(){
      return{factoryCounts:{STEEL_WORKS:20,ZERO_GOV_FACTORY:0}};
    }
  };
  const privateBaseline={
    getCountryBaseline(){
      return{status:'READY',countryId:'BGD',governmentFactoryCounts:{STEEL_WORKS:20,ZERO_GOV_FACTORY:0},
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
function setReadyIronSupply(harness,amount=1000){
  const resource=harness.state.resource.BGD,turn=Number(harness.state.simulation.turn)||0;
  resource.inventory.iron_ore=amount;
  resource.warehouse.availableByResource.iron_ore=amount;
  resource.warehouse.reservedByResource.iron_ore=0;
  resource.demandRuntime={lastTurn:turn,byResource:{iron_ore:{
    demandPerDay:0,consumerDemandPerDay:0,activeFactoryInputDemandPerDay:0,pendingImportQuantity:0
  }}};
}

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

test('committed game-turn event schedules the autonomous proposal only once for the selected country',async()=>{
  const h=makeHarness();
  h.state.simulation.turn=30;
  emit(h,'OMEGA_SIMULATION_TURN_COMMITTED',{countryId:'BGD',turn:30});
  await Promise.resolve();
  await Promise.resolve();
  const dashboard=h.api.getCountryDashboard('BGD');
  assert.equal(dashboard.proposals.length,1);
  assert.equal(dashboard.proposals[0].submissionMode,'AUTONOMOUS_COMPANY_TURN_CYCLE');
  assert.equal(dashboard.proposals[0].companyId,'AURORA_INDUSTRIAL_GROUP');
  assert.equal(h.projects.length,0);
  assert.equal(h.state.economy.BGD.productionAssets.length,0);
  emit(h,'OMEGA_SIMULATION_TURN_COMMITTED',{countryId:'BGD',turn:30});
  await Promise.resolve();
  assert.equal(h.api.getCountryDashboard('BGD').proposals.length,1);
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
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,0);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].reservedBalance,100);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.filter(x=>x.type==='PRIVATE_ENTERPRISE_GOVERNMENT_GRANT').length,1);
  assert.equal(api.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,sourceType:'GOVERNMENT_GRANT',amount:100}).status,'DUPLICATE');
  assert.equal(h.state.finance.BGD.available,900);

  setReadyIronSupply(h,100);
  const beforeReceipt=api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(beforeReceipt.status,'BLOCKED');
  assert.equal(beforeReceipt.reason,'FACTORY_INPUT_STOCK_SHORTAGE');
  assert.equal(h.projects.length,0,'import-sourced proposal cannot build before imported inputs physically arrive');
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].reservedBalance,100,
    'failed preflight must not release or spend reserved capital');
  setReadyIronSupply(h,600); // represents the paid import received into both authoritative stock ledgers
  const build=api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(build.status,'UNDER_CONSTRUCTION');
  assert.equal(build.started.length,1);
  assert.equal(h.projects.length,1);
  assert.equal(h.projects[0].sourcePrivateProposalId,proposal.proposalId);
  assert.equal(h.projects[0].ownerCompanyId,COMPANY);
  assert.equal(h.projects[0].operatorCompanyId,'MERIDIAN_ENGINEERING_GROUP');
  assert.equal(h.projects[0].permitId,decision.proposal.permit.permitId);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,0);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].reservedBalance,0);
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
    logisticsReceipt:true,factoryInput:true,finishedGoods:true,saveLoad:true,exactMainSha:'a'.repeat(40)};
  const gate=api.refreshCommissionedProductionGate('BGD',project.factoryId);
  assert.equal(gate.status,'READY');
  assert.equal(asset.status,'OPERATIONAL');
  assert.equal(asset.productionEnabled,true);
  assert.equal(asset.blockedReason,null);
  assert.equal(api.getProposal('BGD',proposal.proposalId).status,'COMMISSIONED');
  assert.equal(api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId}).status,'DUPLICATE');
  assert.equal(h.state.economy.BGD.productionAssets.length,1);
});

test('production proof refresh restores only the requested factory and gates siblings independently',()=>{
  const h=makeHarness(),api=h.api;
  const proposal=api.createProposal({countryId:'BGD',companyId:COMPANY,operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
    factoryType:'STEEL_WORKS',quantity:2,sourcingPolicy:'COMPANY_FUNDED_IMPORTS',stateSupportRequested:true});
  assert.equal(api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE',
    allowStateSupport:true,conditions:{allowStateSupport:true}}).status,'APPROVED_AWAITING_FUNDING');
  assert.equal(api.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,
    sourceType:'GOVERNMENT_GRANT',amount:200}).status,'FUNDED');
  setReadyIronSupply(h,1200);
  const build=api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(build.status,'UNDER_CONSTRUCTION',JSON.stringify(build));
  assert.equal(build.started.length,2);
  for(const project of h.projects){
    project.status='COMPLETED';
    h.state.economy.BGD.productionAssets.push({
      id:project.factoryId,countryId:'BGD',factoryType:project.factoryType,status:'OPERATIONAL'
    });
    emit(h,'OMEGA_FACTORY_CAPACITY_CHANGED',{countryId:'BGD',payload:{projectId:project.projectId}});
  }
  const [first,second]=h.state.economy.BGD.productionAssets;
  assert.equal(first.status,'BLOCKED');
  assert.equal(second.status,'BLOCKED');
  h.sandbox.OmegaPrivateEnterprisePipelineProof={status:'VERIFIED',siteSelection:true,extraction:true,
    logisticsReceipt:true,factoryInput:true,finishedGoods:true,saveLoad:true,exactMainSha:'c'.repeat(40)};
  const firstGate=api.refreshCommissionedProductionGate('BGD',first.id);
  assert.equal(firstGate.status,'PARTIALLY_READY');
  assert.equal(first.status,'OPERATIONAL');
  assert.equal(first.productionEnabled,true);
  assert.equal(second.status,'BLOCKED','validating one factory must not silently activate every sibling');
  assert.equal(second.productionEnabled,false);
  assert.equal(api.getProposal('BGD',proposal.proposalId).status,'COMMISSIONED_PRODUCTION_GATED');
  const secondGate=api.refreshCommissionedProductionGate('BGD',second.id);
  assert.equal(secondGate.status,'READY');
  assert.equal(second.status,'OPERATIONAL');
  assert.equal(second.productionEnabled,true);
  assert.equal(api.getProposal('BGD',proposal.proposalId).status,'COMMISSIONED');
});

test('construction retry reconciles a canonical project created before proposal and CAPEX pointers were saved',()=>{
  const h=makeHarness(),api=h.api;
  const proposal=api.createProposal({countryId:'BGD',companyId:COMPANY,operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
    factoryType:'STEEL_WORKS',quantity:1,sourcingPolicy:'COMPANY_FUNDED_IMPORTS',stateSupportRequested:true});
  const approval=api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE',
    allowStateSupport:true,conditions:{allowStateSupport:true}});
  assert.equal(approval.status,'APPROVED_AWAITING_FUNDING');
  assert.equal(api.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,
    sourceType:'GOVERNMENT_GRANT',amount:100}).status,'FUNDED');
  setReadyIronSupply(h,600);
  const p=api.getProposal('BGD',proposal.proposalId);
  const orphan=h.network.startFactoryProject({
    countryId:'BGD',factoryType:p.factoryType,recipeId:p.recipeId,requestId:p.proposalId+':UNIT:1',
    cost:100,capacityPerDay:10,contractorType:'DOMESTIC_EPC',companyId:COMPANY,
    ownerCompanyId:COMPANY,ownerId:COMPANY,operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
    operatorId:'MERIDIAN_ENGINEERING_GROUP',ownerType:'PRIVATE_ENTERPRISE',operatorType:'PRIVATE_COMPANY_OPERATOR',
    stateControlRights:p.ownership.stateControlRights,permitId:p.permit.permitId,permitAuthority:p.permit.authority,
    permitExpiryTurn:p.permit.expiresAtTurn,sourcePrivateProposalId:p.proposalId,
    sourcePrivateDecisionId:p.decision.decisionId,sourcePrivateFundingId:p.funding.transactionId,
    privateCompanyId:COMPANY,constructionFinanceAuthority:'OMEGA_FINANCE_PRIVATE_ENTERPRISE_CAPITAL',
    requirePrivateCommissioningGate:true
  });
  assert.equal(orphan.status,'UNDER_CONSTRUCTION');
  assert.deepEqual(p.projectIds,[],'the simulated interruption occurs before the proposal pointer is saved');
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].reservedBalance,100);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.some(row=>row.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX'),false);
  const resumed=api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(resumed.status,'UNDER_CONSTRUCTION',JSON.stringify(resumed));
  assert.deepEqual(api.getProposal('BGD',proposal.proposalId).projectIds,[orphan.projectId]);
  assert.equal(h.projects.length,1,'retry must reuse the canonical project rather than create a second factory');
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].reservedBalance,0);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].capitalSpent,100);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.filter(row=>
    row.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX'&&row.projectId===orphan.projectId&&row.status==='POSTED').length,1);
  assert.equal(api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId}).status,'DUPLICATE');
});

test('company funding reservations prevent two proposals from pledging the same cash',()=>{
  const h=makeHarness(),api=h.api;
  h.state.finance.BGD.omegaFinance.ledger.push({transactionId:'BANK-CAPITAL-100',type:'CORPORATE_EQUITY_INVESTMENT',
    companyId:COMPANY,amount:100,currency:'GAME_CURRENCY_UNITS',direction:'CREDIT',status:'SETTLED'});
  assert.equal(api.recordCompanyCapitalReceipt({countryId:'BGD',companyId:COMPANY,sourceTransactionId:'BANK-CAPITAL-100',
    amount:100,currency:'GAME_CURRENCY_UNITS'}).status,'POSTED');
  const one=api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:1,sourcingPolicy:'COMPANY_FUNDED_IMPORTS'});
  const two=api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:1,sourcingPolicy:'COMPANY_FUNDED_IMPORTS'});
  assert.equal(api.decideProposal({countryId:'BGD',proposalId:one.proposalId,decision:'APPROVE'}).status,'APPROVED_AWAITING_FUNDING');
  assert.equal(api.decideProposal({countryId:'BGD',proposalId:two.proposalId,decision:'APPROVE'}).status,'APPROVED_AWAITING_FUNDING');
  assert.equal(api.fundProposal({countryId:'BGD',proposalId:one.proposalId,sourceType:'COMPANY_CAPITAL',amount:100}).status,'FUNDED');
  const account=api.getCompanyCapitalSummary('BGD',COMPANY);
  assert.equal(account.availableBalance,0);
  assert.equal(account.reservedBalance,100);
  const rejected=api.fundProposal({countryId:'BGD',proposalId:two.proposalId,sourceType:'COMPANY_CAPITAL',amount:100});
  assert.equal(rejected.status,'BLOCKED');
  assert.equal(rejected.reason,'INSUFFICIENT_UNRESERVED_COMPANY_CAPITAL');
  assert.equal(api.getCompanyCapitalSummary('BGD',COMPANY).reservedBalance,100);
  assert.equal(h.projects.length,0);
});

test('construction rechecks fresh input and demand snapshots for every sourcing mode',()=>{
  const h=makeHarness(),api=h.api;
  const proposal=api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:1,
    sourcingPolicy:'COMPANY_FUNDED_IMPORTS',stateSupportRequested:true});
  assert.equal(api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE',
    allowStateSupport:true,conditions:{allowStateSupport:true}}).status,'APPROVED_AWAITING_FUNDING');
  assert.equal(api.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,sourceType:'GOVERNMENT_GRANT',amount:100}).status,'FUNDED');
  setReadyIronSupply(h,600);
  h.state.simulation.turn++;
  const stale=api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(stale.status,'BLOCKED');
  assert.equal(stale.reason,'FACTORY_INPUT_STOCK_OR_DEMAND_UNOBSERVED');
  assert.equal(h.projects.length,0);
  assert.equal(api.getCompanyCapitalSummary('BGD',COMPANY).reservedBalance,100);
});

test('factory construction authorization rejects forged identity, scope, permit and unit request',()=>{
  const h=makeHarness(),api=h.api;
  const proposal=api.createProposal({countryId:'BGD',companyId:COMPANY,operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
    factoryType:'STEEL_WORKS',quantity:1,sourcingPolicy:'COMPANY_FUNDED_IMPORTS',stateSupportRequested:true});
  assert.equal(api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE',
    allowStateSupport:true,conditions:{allowStateSupport:true}}).status,'APPROVED_AWAITING_FUNDING');
  assert.equal(api.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,sourceType:'GOVERNMENT_GRANT',amount:100}).status,'FUNDED');
  const p=api.getProposal('BGD',proposal.proposalId);
  const request={
    countryId:'BGD',requestId:p.proposalId+':UNIT:1',factoryType:p.factoryType,
    ownerCompanyId:p.companyId,operatorCompanyId:p.operatorCompanyId,companyId:p.companyId,privateCompanyId:p.companyId,
    ownerType:'PRIVATE_ENTERPRISE',operatorType:'PRIVATE_COMPANY_OPERATOR',stateControlRights:p.stateControlRights,
    requirePrivateCommissioningGate:true,permitId:p.permit.permitId,permitAuthority:p.permit.authority,
    permitExpiryTurn:p.permit.expiresAtTurn,sourcePrivateProposalId:p.proposalId,
    sourcePrivateDecisionId:p.decision.decisionId,sourcePrivateFundingId:p.funding.transactionId,
    constructionFinanceAuthority:'OMEGA_FINANCE_PRIVATE_ENTERPRISE_CAPITAL',cost:100
  };
  assert.equal(api.authorizeFactoryProjectConstruction({...request,ownerCompanyId:'STATE_INDUSTRY_BGD'}).status,'BLOCKED');
  assert.equal(api.authorizeFactoryProjectConstruction({...request,permitId:'FORGED'}).status,'BLOCKED');
  assert.equal(api.authorizeFactoryProjectConstruction({...request,requestId:p.proposalId+':UNIT:2'}).status,'BLOCKED');
  assert.equal(api.authorizeFactoryProjectConstruction({...request,sourcePrivateFundingId:'FORGED'}).status,'BLOCKED');
  assert.equal(api.authorizeFactoryProjectConstruction(request).status,'AUTHORIZED');
  assert.equal(h.projects.length,0,'authorization validation itself cannot create a project');
});

test('private production proof requires a full exact 40-character commit SHA',()=>{
  const h=makeHarness(),api=h.api;
  h.sandbox.OmegaPrivateEnterprisePipelineProof={status:'VERIFIED',siteSelection:true,extraction:true,
    logisticsReceipt:true,factoryInput:true,finishedGoods:true,saveLoad:true,exactMainSha:'abcdef1234567'};
  assert.equal(api.productionProofReady(),false);
  h.sandbox.OmegaPrivateEnterprisePipelineProof.exactMainSha='b'.repeat(40);
  assert.equal(api.productionProofReady(),true);
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
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,0);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].reservedBalance,200);
  setReadyIronSupply(h,1200);
  h.network.failRequestId=proposal.proposalId+':UNIT:2';
  const first=api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(first.status,'PARTIALLY_UNDER_CONSTRUCTION');
  assert.equal(first.proposal.projectIds.length,1);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].capitalSpent,100);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,0);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].reservedBalance,100);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.filter(x=>x.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX').length,1);

  h.network.failRequestId=null;
  const resumed=api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
  assert.equal(resumed.status,'UNDER_CONSTRUCTION');
  assert.equal(resumed.proposal.projectIds.length,2);
  assert.equal(h.projects.length,2);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].capitalSpent,200);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,0);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].reservedBalance,0);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.filter(x=>x.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX').length,2);
  assert.equal(api.startConstruction({countryId:'BGD',proposalId:proposal.proposalId}).status,'DUPLICATE');
  assert.equal(h.projects.length,2);
});

test('an expired government permit cannot start construction after funding',()=>{
  const h=makeHarness();
  const proposal=h.api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:1,
    sourcingPolicy:'COMPANY_FUNDED_IMPORTS',stateSupportRequested:true});
  const approval=h.api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE',
    allowStateSupport:true,expiryTurn:5,conditions:{allowStateSupport:true}});
  assert.equal(approval.status,'APPROVED_AWAITING_FUNDING');
  assert.equal(approval.proposal.permit.expiresAtTurn,5);
  assert.equal(h.api.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,sourceType:'GOVERNMENT_GRANT',amount:100}).status,'FUNDED');
  h.state.simulation.turn=6;
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

test('proposal request IDs replay only the original payload and reject collisions',()=>{
  const h=makeHarness();
  const input={countryId:'BGD',companyId:COMPANY,operatorCompanyId:'AURORA_INDUSTRIAL_GROUP',
    factoryType:'STEEL_WORKS',quantity:1,sourcingPolicy:'COMPANY_FUNDED_IMPORTS',
    requestId:'proposal-idempotency-guard'};
  const first=h.api.createProposal(input);
  assert.equal(first.status,'PROPOSED');
  const replay=h.api.createProposal({...input});
  assert.equal(replay.idempotent,true);
  assert.equal(replay.proposalId,first.proposalId);
  const quantityCollision=h.api.createProposal({...input,quantity:2});
  assert.equal(quantityCollision.status,'BLOCKED');
  assert.equal(quantityCollision.reason,'PROPOSAL_REQUEST_IDEMPOTENCY_COLLISION');
  const operatorCollision=h.api.createProposal({...input,operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP'});
  assert.equal(operatorCollision.reason,'PROPOSAL_REQUEST_IDEMPOTENCY_COLLISION');
  assert.equal(h.api.getProposal('BGD',first.proposalId).quantity,1);
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
  assert.match(fragments[0],/Corporate Finance \/ Profit \/ Tax \/ Cost/);
  assert.match(fragments[0],/Input materials/);
  assert.match(fragments[0],/Worker costs/);
  assert.match(fragments[0],/Transport costs/);
  assert.match(fragments[0],/Other recorded costs/);
  assert.match(fragments[0],/data-pe-jv-form/);
  assert.match(fragments[0],/Shareholder E equity/);
  assert.match(fragments[0],/Input materials/);
  assert.match(fragments[0],/Worker costs/);
  assert.match(fragments[0],/Transport costs/);
  assert.match(fragments[0],/Other recorded costs/);
  assert.match(fragments[0],/Joint ventures \/ shareholder voting \/ dividends/);
  assert.match(fragments[0],/Close cash-flow period \/ assess profit tax/);
  assert.match(fragments[0],/Construction and operating readiness/);
  assert.match(fragments[0],/PRODUCTION GATED BY SAB-34/);
  assert.equal(fragments[0].includes('data-omega-v2-industry-tab="companies"'),false);
});


test('company cash-flow period close posts net-profit tax once and carries post-tax retained earnings',()=>{
  const h=makeHarness();
  h.state.economy.BGD.companyAccounts={
    [COMPANY]:{
      companyId:COMPANY,openingCashStatus:'UNKNOWN',
      runtimeNetCashFlow:60,grossRevenue:100,paymentsReceived:100,paymentsMade:40,
      taxPaid:0,workerIncomePaid:40,transportPaid:0,
      cashFlowJournalVersion:1,cashFlowJournalStartedAtTurn:1,lastTurn:4,
      cashFlowEntries:[
        {entryId:'SALE-1',companyId:COMPANY,amount:100,direction:'CREDIT',category:'DOMESTIC_SUPPLY',turn:1,status:'POSTED'},
        {entryId:'WAGES-1',companyId:COMPANY,amount:20,direction:'DEBIT',category:'WORKER_INCOME',turn:2,status:'POSTED'},
        {entryId:'INPUT-1',companyId:COMPANY,amount:20,direction:'DEBIT',category:'FACTORY_INPUT_PURCHASE',turn:3,status:'POSTED'}
      ]
    }
  };
  const first=h.api.closeCompanyFinancialPeriod({countryId:'BGD',companyId:COMPANY});
  assert.equal(first.status,'CLOSED');
  assert.equal(first.period.grossReceipts,100);
  assert.equal(first.period.operatingCosts,40);
  assert.equal(first.period.profitBeforeTax,60);
  assert.equal(first.companyFinance.journal.inputMaterialCosts,20);
  assert.equal(first.companyFinance.journal.workerCosts,20);
  assert.equal(first.period.corporateTaxRate,0.2);
  assert.equal(first.period.corporateTaxPaid,12);
  assert.equal(first.period.retainedEarningsAfter,48);
  assert.equal(h.state.finance.BGD.available,1012);
  assert.equal(h.state.finance.BGD.taxRevenue,12);
  assert.equal(h.state.finance.BGD.revenue,12);
  assert.equal(h.state.economy.BGD.companyAccounts[COMPANY].runtimeNetCashFlow,48);
  const duplicate=h.api.closeCompanyFinancialPeriod({countryId:'BGD',companyId:COMPANY});
  assert.equal(duplicate.status,'DUPLICATE');
  assert.equal(h.state.finance.BGD.available,1012);
  assert.equal(h.api.getCompanyFinanceSummary('BGD',COMPANY).capital.retainedEarningsBalance,48);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.filter(row=>row.type==='PRIVATE_ENTERPRISE_CORPORATE_PROFIT_TAX').length,1);
});

test('company tax close blocks when current-period cash-flow entries were pruned',()=>{
  const h=makeHarness();
  h.state.economy.BGD.companyAccounts={
    [COMPANY]:{
      companyId:COMPANY,runtimeNetCashFlow:100,grossRevenue:100,paymentsReceived:100,paymentsMade:0,
      cashFlowJournalVersion:1,cashFlowJournalStartedAtTurn:1,lastTurn:4,
      cashFlowJournalDroppedEntries:3,cashFlowJournalEarliestDroppedTurn:2,
      cashFlowEntries:[{entryId:'RECENT-SALE',companyId:COMPANY,amount:100,direction:'CREDIT',category:'DOMESTIC_SUPPLY',turn:4,status:'POSTED'}]
    }
  };
  const before=h.state.finance.BGD.available;
  const result=h.api.closeCompanyFinancialPeriod({countryId:'BGD',companyId:COMPANY});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.reason,'COMPANY_FINANCIAL_PERIOD_JOURNAL_TRUNCATED');
  assert.equal(h.state.finance.BGD.available,before);
  assert.equal(h.api.getCompanyFinanceSummary('BGD',COMPANY).journal.status,'JOURNAL_TRUNCATED');
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.some(row=>row.type==='PRIVATE_ENTERPRISE_CORPORATE_PROFIT_TAX'),false);
});

test('joint venture allocates small dividends by largest remainder without creating or losing cents',()=>{
  const h=makeHarness();
  h.state.finance.BGD.omegaFinance.companyCapitalAccounts={
    [COMPANY]:{companyId:COMPANY,currency:'GAME_CURRENCY_UNITS',availableBalance:0,reservedBalance:0,
      capitalRaised:0,capitalSpent:0,retainedEarningsBalance:1,revision:0},
    AURORA_INDUSTRIAL_GROUP:{companyId:'AURORA_INDUSTRIAL_GROUP',currency:'GAME_CURRENCY_UNITS',
      availableBalance:0,reservedBalance:0,capitalRaised:0,capitalSpent:0,retainedEarningsBalance:0,revision:0},
    NOVA_CONSUMER_INDUSTRIES:{companyId:'NOVA_CONSUMER_INDUSTRIES',currency:'GAME_CURRENCY_UNITS',
      availableBalance:0,reservedBalance:0,capitalRaised:0,capitalSpent:0,retainedEarningsBalance:0,revision:0}
  };
  const created=h.api.createJointVenture({countryId:'BGD',name:'Three-party precision JV',requestId:'jv-rounding',
    managingCompanyId:COMPANY,shareholders:[
      {companyId:COMPANY,shareBps:3334},
      {companyId:'AURORA_INDUSTRIAL_GROUP',shareBps:3333},
      {companyId:'NOVA_CONSUMER_INDUSTRIES',shareBps:3333}
    ]});
  assert.equal(created.status,'PROPOSED');
  assert.equal(h.api.decideJointVenture({countryId:'BGD',jointVentureId:created.jointVenture.jointVentureId,decision:'APPROVE'}).status,'ACTIVE');
  assert.equal(h.api.contributeJointVentureRetainedEarnings({countryId:'BGD',
    jointVentureId:created.jointVenture.jointVentureId,companyId:COMPANY,amount:0.03,requestId:'small-fund'}).status,'POSTED');
  const resolution=h.api.createJointVentureResolution({countryId:'BGD',
    jointVentureId:created.jointVenture.jointVentureId,type:'DIVIDEND',amount:0.03,requiredApprovalBps:10000});
  assert.equal(resolution.status,'VOTING');
  for(const companyId of [COMPANY,'AURORA_INDUSTRIAL_GROUP','NOVA_CONSUMER_INDUSTRIES']){
    const vote=h.api.voteJointVentureResolution({countryId:'BGD',jointVentureId:created.jointVenture.jointVentureId,
      resolutionId:resolution.resolution.resolutionId,companyId:companyId,vote:'FOR'});
    if(companyId==='NOVA_CONSUMER_INDUSTRIES')assert.equal(vote.status,'APPROVED');
  }
  const paid=h.api.distributeJointVentureDividend({countryId:'BGD',
    jointVentureId:created.jointVenture.jointVentureId,resolutionId:resolution.resolution.resolutionId});
  assert.equal(paid.status,'PAID');
  assert.equal(paid.distribution.reduce((sum,row)=>sum+Math.round(row.amount*100),0),3);
  assert.equal(JSON.stringify(paid.distribution.map(row=>row.amount)),JSON.stringify([0.01,0.01,0.01]));
  assert.equal(h.api.getJointVentureDashboard('BGD').jointVentures[0].retainedEarningsBalance,0);
});

test('joint venture needs exact shareholder weights, state approval, weighted votes and post-tax dividend funding',()=>{
  const h=makeHarness();
  h.state.finance.BGD.omegaFinance.companyCapitalAccounts={
    [COMPANY]:{companyId:COMPANY,currency:'GAME_CURRENCY_UNITS',availableBalance:5,reservedBalance:0,
      capitalRaised:100,capitalSpent:0,retainedEarningsBalance:100,revision:0},
    AURORA_INDUSTRIAL_GROUP:{companyId:'AURORA_INDUSTRIAL_GROUP',currency:'GAME_CURRENCY_UNITS',
      availableBalance:0,reservedBalance:0,capitalRaised:0,capitalSpent:0,retainedEarningsBalance:0,revision:0}
  };
  const invalid=h.api.createJointVenture({countryId:'BGD',managingCompanyId:COMPANY,
    shareholders:[{companyId:COMPANY,shareBps:6000},{companyId:'AURORA_INDUSTRIAL_GROUP',shareBps:3000}]});
  assert.equal(invalid.status,'BLOCKED');
  assert.equal(invalid.reason,'JV_EQUITY_SHARES_MUST_SUM_TO_10000_BPS');
  const created=h.api.createJointVenture({countryId:'BGD',name:'Steel Strategic JV',requestId:'jv-1',
    managingCompanyId:COMPANY,shareholders:[
      {companyId:COMPANY,shareBps:6000},{companyId:'AURORA_INDUSTRIAL_GROUP',shareBps:4000}
    ]});
  assert.equal(created.status,'PROPOSED');
  const collision=h.api.createJointVenture({countryId:'BGD',name:'Changed ownership terms',requestId:'jv-1',
    managingCompanyId:COMPANY,shareholders:[
      {companyId:COMPANY,shareBps:5000},{companyId:'AURORA_INDUSTRIAL_GROUP',shareBps:5000}
    ]});
  assert.equal(collision.status,'BLOCKED');
  assert.equal(collision.reason,'JV_REQUEST_IDEMPOTENCY_COLLISION');
  const exactReplay=h.api.createJointVenture({countryId:'BGD',name:'Steel Strategic JV',requestId:'jv-1',
    managingCompanyId:COMPANY,shareholders:[
      {companyId:COMPANY,shareBps:6000},{companyId:'AURORA_INDUSTRIAL_GROUP',shareBps:4000}
    ]});
  assert.equal(exactReplay.status,'DUPLICATE');
  assert.equal(exactReplay.jointVenture.jointVentureId,created.jointVenture.jointVentureId);
  assert.equal(h.api.decideJointVenture({countryId:'BGD',jointVentureId:created.jointVenture.jointVentureId,decision:'APPROVE'}).status,'ACTIVE');
  const contribution=h.api.contributeJointVentureRetainedEarnings({countryId:'BGD',
    jointVentureId:created.jointVenture.jointVentureId,companyId:COMPANY,amount:100,requestId:'retained-1'});
  assert.equal(contribution.status,'POSTED');
  const contributionCollision=h.api.contributeJointVentureRetainedEarnings({countryId:'BGD',
    jointVentureId:created.jointVenture.jointVentureId,companyId:COMPANY,amount:90,requestId:'retained-1'});
  assert.equal(contributionCollision.status,'BLOCKED');
  assert.equal(contributionCollision.reason,'JV_CONTRIBUTION_REQUEST_IDEMPOTENCY_COLLISION');
  const subCentResolution=h.api.createJointVentureResolution({countryId:'BGD',
    jointVentureId:created.jointVenture.jointVentureId,type:'DIVIDEND',amount:70.001});
  assert.equal(subCentResolution.status,'BLOCKED');
  assert.equal(subCentResolution.reason,'JV_DIVIDEND_CURRENCY_PRECISION_EXCEEDED');
  const resolution=h.api.createJointVentureResolution({countryId:'BGD',
    jointVentureId:created.jointVenture.jointVentureId,type:'DIVIDEND',amount:70});
  assert.equal(resolution.status,'VOTING');
  const firstVote=h.api.voteJointVentureResolution({countryId:'BGD',jointVentureId:created.jointVenture.jointVentureId,
    resolutionId:resolution.resolution.resolutionId,companyId:COMPANY,vote:'FOR'});
  assert.equal(firstVote.status,'VOTE_RECORDED');
  const secondVote=h.api.voteJointVentureResolution({countryId:'BGD',jointVentureId:created.jointVenture.jointVentureId,
    resolutionId:resolution.resolution.resolutionId,companyId:'AURORA_INDUSTRIAL_GROUP',vote:'FOR'});
  assert.equal(secondVote.status,'APPROVED');
  const paid=h.api.distributeJointVentureDividend({countryId:'BGD',jointVentureId:created.jointVenture.jointVentureId,
    resolutionId:resolution.resolution.resolutionId});
  assert.equal(paid.status,'PAID');
  assert.equal(JSON.stringify(paid.distribution.map(row=>[row.companyId,row.amount])),
    JSON.stringify([[COMPANY,42],['AURORA_INDUSTRIAL_GROUP',28]]));
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,47);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts.AURORA_INDUSTRIAL_GROUP.availableBalance,28);
  assert.equal(h.api.getJointVentureDashboard('BGD').jointVentures[0].retainedEarningsBalance,30);
  const duplicate=h.api.distributeJointVentureDividend({countryId:'BGD',jointVentureId:created.jointVenture.jointVentureId,
    resolutionId:resolution.resolution.resolutionId});
  assert.equal(duplicate.status,'DUPLICATE');
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,47);
});
