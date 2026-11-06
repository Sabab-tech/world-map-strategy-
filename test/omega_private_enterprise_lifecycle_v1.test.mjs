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
    factoryConstructionMaterialQuote(country,profile){
      return{status:'QUOTED',materials:[{resourceId:'construction_aggregate',required:profile.constructionMaterials.construction_aggregate,available:100,sufficient:true}]};
    },
    startFactoryProject(input){
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
        factoryCounts:{STEEL_WORKS:2,ZERO_GOV_FACTORY:0},totalPrivateFactoryUnits:2};
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

test('proposal -> approval -> real Treasury grant -> construction -> private commissioning is replay-safe and uses shared assets',()=>{
  const h=makeHarness(),api=h.api;
  const proposal=api.createProposal({countryId:'BGD',companyId:COMPANY,factoryType:'STEEL_WORKS',quantity:1,
    sourcingPolicy:'COMPANY_FUNDED_IMPORTS',stateSupportRequested:true,requestId:'proposal-001'});
  assert.equal(proposal.status,'PROPOSED');
  assert.equal(h.projects.length,0);
  assert.equal(h.state.economy.BGD.productionAssets.length,0);
  assert.equal(h.state.finance.BGD.available,1000);

  const preview=api.previewProposal('BGD',proposal.proposalId);
  assert.equal(preview.status,'READY');
  assert.equal(preview.shortages.length,1);
  assert.equal(preview.shortages[0].resourceId,'iron_ore');
  assert.equal(preview.shortages[0].shortfall,500);
  assert.equal(h.state.resource.BGD.inventory.iron_ore,100);

  const decision=api.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE',
    allowStateSupport:true,conditions:{allowStateSupport:true}});
  assert.equal(decision.status,'APPROVED_AWAITING_FUNDING');
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
  assert.equal(h.projects[0].operatorCompanyId,COMPANY);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance,0);
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].capitalSpent,100);
  assert.equal(h.state.economy.BGD.companyAccounts,undefined,'legacy company flow tracker is not treated as a cash wallet');

  const project=h.projects[0];
  project.status='COMPLETED';
  h.state.economy.BGD.productionAssets.push({id:project.factoryId,countryId:'BGD',factoryType:'STEEL_WORKS',status:'OPERATIONAL'});
  emit(h,'OMEGA_FACTORY_CAPACITY_CHANGED',{countryId:'BGD',payload:{projectId:project.projectId}});
  const asset=h.state.economy.BGD.productionAssets[0];
  assert.equal(asset.ownerCompanyId,COMPANY);
  assert.equal(asset.operatorCompanyId,COMPANY);
  assert.equal(asset.ownerType,'PRIVATE_ENTERPRISE');
  assert.equal(asset.operatorType,'PRIVATE_COMPANY_OPERATOR');
  assert.equal(asset.stateControlRights.licensingAndPermits,true);
  assert.equal(asset.stateControlRights.operationalControl,'PRIVATE_OPERATOR_UNDER_STATE_POLICY');
  assert.equal(asset.status,'BLOCKED');
  assert.equal(asset.blockedReason,'SAB34_PIPELINE_PROOF_REQUIRED');
  assert.equal(asset.productionEnabled,false);
  assert.equal(api.getProposal('BGD',proposal.proposalId).status,'COMMISSIONED_PRODUCTION_GATED');
  assert.equal(api.diagnostics().productionEnabled,false);

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

test('company capital receipts require an existing settled Finance ledger credit and reject replay',()=>{
  const h=makeHarness();
  h.state.finance.BGD.omegaFinance.ledger.push({transactionId:'BANK-DISBURSEMENT-1',type:'CORPORATE_LOAN_DISBURSEMENT',
    companyId:COMPANY,amount:250,direction:'CREDIT',status:'SETTLED'});
  const result=h.api.recordCompanyCapitalReceipt({countryId:'BGD',companyId:COMPANY,sourceTransactionId:'BANK-DISBURSEMENT-1',amount:250});
  assert.equal(result.status,'POSTED');
  assert.equal(h.api.getCompanyCapitalSummary('BGD',COMPANY).availableBalance,250);
  const replay=h.api.recordCompanyCapitalReceipt({countryId:'BGD',companyId:COMPANY,sourceTransactionId:'BANK-DISBURSEMENT-1',amount:250});
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
  assert.equal(h.projects.length,0);
});

test('Production Lines screen shows proposal queue without adding a new company navigation tab',()=>{
  const h=makeHarness();
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
  assert.match(fragments[0],/Government decision queue/);
  assert.match(fragments[0],/PRODUCTION GATED BY SAB-34/);
  assert.equal(fragments[0].includes('data-omega-v2-industry-tab="companies"'),false);
});
