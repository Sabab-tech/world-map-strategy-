import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const aiAssessment=(decision='PROCEED',operation='POWER_PROJECT',requestedAmount=null)=>({
 decision,confidence:.91,operation,
 projectType:operation==='POWER_PROJECT'?'NUCLEAR_BASELOAD':null,
 requestedAmount,
 operationRequirements:operation==='POWER_PROJECT'
  ?{projectType:'NUCLEAR_BASELOAD',capacityMw:2400,constructionTurns:5,constructionCostTreasuryUnits:2000000000,fuelResourceId:'uranium',fuelQuantityPerTurn:.01,emissionsTonnesCo2ePerMwh:.012}
  :{requestedContributionTreasuryUnits:requestedAmount,currencyAuthority:'TREASURY_NATIVE_UNITS',enabled:true,maxTransactions:512},
 riskSummary:'Validated test AI response',findings:['Test context reviewed'],
 recommendedChecks:['Recheck after each turn'],aiGenerated:true,
 authority:'OMEGA_SERVER_RESOURCE_DECISION_AI',model:'gemini-test',
 provenance:'SERVER_MODEL_RESPONSE_WITH_DETERMINISTIC_SAFETY_FLOORS'
});
function harness(){
  const state={
    simulation:{turn:1,date:'2015-01-01'},
    resource:{BGD:{},AAA:{},SAU:{}},
    trade:{BGD:{},AAA:{},SAU:{}},
    finance:{BGD:{available:10000000,reserves:10000000},AAA:{available:10000000,reserves:10000000},SAU:{available:10000000,reserves:10000000}}
  };
  const listeners=new Map(),handlers=new Map(),events=[];
  class CustomEventMock{constructor(type,init={}){this.type=type;this.detail=init.detail;}}
  const sandbox={
    console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date,Promise,Error,TypeError,
    CustomEvent:CustomEventMock,
    addEventListener(type,fn){const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a);},
    dispatchEvent(event){events.push(event);for(const fn of listeners.get(event.type)||[])fn(event);return true;},
    Game:{state,currentActiveCountry:'BGD'},
    Omega:{MinistryInteroperability:null},
    OmegaResourceStrategicPolicyRules:read('resource_strategic_policy_rules_v1.json'),
    OmegaResourceSiteCanonicalCatalogData:{siteCount:1,sites:[{
      siteId:'SITE_BGD_TEST_LOCKED',siteName:'Test Locked Copper Mine',countryId:'BGD',
      identity:{countryIso3:'BGD',resourceTypeId:'copper'},
      location:{coordinates:{lat:23.7,lng:90.4},countryBoundaryKey:'BGD'},
      map:{markerEligible:true,countryIsolationKey:'BGD'},
      operation:{commercialExtraction:false,status:'DISCOVERED_REFERENCE',extractionEligibility:'LOCKED_UNTIL_DISCOVERY_AND_FINAL_INVESTMENT_DECISION'},
      naturalRisk:{environmental:80,waterStress:70}
    }]}
  };
  function txFactory(countryId){
    const c=String(countryId).toUpperCase();
    return{
      get(path){
        const parts=String(path).split('.'),domain=parts.shift();let cur=state[domain]?.[c];
        for(const part of parts){if(cur==null)return undefined;cur=cur[part];}
        return cur===undefined?undefined:cur;
      },
      set(path,value){
        const parts=String(path).split('.'),domain=parts.shift();state[domain]=state[domain]||{};state[domain][c]=state[domain][c]||{};
        if(!parts.length){state[domain][c]=value;return;}
        let cur=state[domain][c];
        for(let i=0;i<parts.length-1;i++){if(!cur[parts[i]]||typeof cur[parts[i]]!=='object')cur[parts[i]]={};cur=cur[parts[i]];}
        cur[parts[parts.length-1]]=value;
      }
    };
  }
  const interop={
    registerAction(){},
    registerCommandHandler(type,owner,fn){handlers.set(owner+':'+type,fn);},
    dispatchCommand(owner,type,countryId,payload={},meta={}){
      const c=String(countryId||'').toUpperCase(),fn=handlers.get(owner+':'+type);
      if(!fn)return{status:'UNAVAILABLE',reason:'HANDLER_NOT_FOUND',commandId:'TEST-'+type};
      const result=fn({commandId:'TEST-'+type,payload},{countryId:c,stateTransaction:txFactory(c)});
      return{status:result?.accepted===false?'FAILED':'APPLIED',result,commandId:'TEST-'+type};
    },
    emitEvent(type,c,source,payload,meta){sandbox.dispatchEvent(new CustomEventMock(type,{detail:{eventType:type,countryId:c,source,payload,meta}}));return true;}
  };
  sandbox.Omega.MinistryInteroperability=interop;
  sandbox.OmegaMinistryInteroperability=interop;
  sandbox.globalThis=sandbox;sandbox.window=sandbox;vm.createContext(sandbox);
  const source=fs.readFileSync(new URL('../omega_resource_strategic_policy_runtime_v1.js',import.meta.url),'utf8');
  new vm.Script(source,{filename:'omega_resource_strategic_policy_runtime_v1.js'}).runInContext(sandbox);
  interop.registerCommandHandler('OMEGA_TRADE_FINANCE_DEBIT','finance',(cmd,ctx)=>{
    const amount=Number(cmd.payload?.amount);if(!Number.isFinite(amount)||amount<0)return{accepted:false,reason:'INVALID_DEBIT'};
    const current=Number(ctx.stateTransaction.get('finance.available')??0);
    if(current<amount)return{accepted:false,reason:'TREASURY_FUNDS_INSUFFICIENT'};
    ctx.stateTransaction.set('finance.available',current-amount);return{accepted:true,amount};
  });
  return{sandbox,state,handlers,interop,events,txFactory};
}

test('embargo and blockade policies actively block scoped trade and routes, then lift cleanly',()=>{
  const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
  const embargo=api.declareEmbargo('BGD',{targetCountryId:'SAU',resourceId:'crude_oil',direction:'EXPORT',policyId:'EMBARGO-BGD-SAU-OIL'});
  assert.equal(embargo.accepted,true,JSON.stringify(embargo));
  assert.equal(api.isResourceEmbargoed('SAU','BGD','crude_oil').blocked,true);
  assert.equal(api.isResourceEmbargoed('SAU','BGD','copper').blocked,false);
  assert.equal(api.liftEmbargo('BGD',{policyId:'EMBARGO-BGD-SAU-OIL'}).accepted,true);
  assert.equal(api.isResourceEmbargoed('SAU','BGD','crude_oil').blocked,false);

  const blockade=api.declareBlockade('AAA',{targetCountryId:'BGD',resourceId:'crude_oil',modes:['ship'],policyId:'BLOCKADE-AAA-BGD'});
  assert.equal(blockade.accepted,true,JSON.stringify(blockade));
  assert.equal(api.isRouteBlocked('BGD',{resourceId:'crude_oil',transportMode:'ship'}).blocked,true);
  assert.equal(api.isRouteBlocked('BGD',{resourceId:'copper',transportMode:'ship'}).blocked,false);
  assert.equal(api.isRouteBlocked('BGD',{resourceId:'crude_oil',transportMode:'rail'}).blocked,false);
  assert.equal(api.liftBlockade('AAA',{policyId:'BLOCKADE-AAA-BGD'}).accepted,true);
  assert.equal(api.isRouteBlocked('BGD',{resourceId:'crude_oil',transportMode:'ship'}).blocked,false);
});

test('exploration requires survey completion, funded investment and commissioning before a locked mine can extract',()=>{
  const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime,siteId='SITE_BGD_TEST_LOCKED';
  assert.equal(api.siteAvailableForExtraction('BGD',siteId).reason,'EXPLORATION_AND_INVESTMENT_REQUIRED');
  const started=api.startExploration('BGD',{siteId,requiredTurns:2});
  assert.equal(started.accepted,true,JSON.stringify(started));
  const projectId=started.project.projectId;
  h.state.simulation.turn=2;api.processCountry('BGD');
  h.state.simulation.turn=3;api.processCountry('BGD');
  const project=h.state.resource.BGD.explorationProjects.find(x=>x.projectId===projectId);
  assert.equal(project.status,'DISCOVERED_PENDING_INVESTMENT');
  assert.equal(api.siteAvailableForExtraction('BGD',siteId).allowed,false);

  const fundsBeforeDiscountAttempt=h.state.finance.BGD.available;
  const discounted=api.approveInvestment('BGD',{projectId,amount:0});
  assert.equal(discounted.accepted,false,JSON.stringify(discounted));
  assert.equal(discounted.reason,'EXPLORATION_INVESTMENT_AMOUNT_MISMATCH');
  assert.equal(h.state.finance.BGD.available,fundsBeforeDiscountAttempt,'underpriced commissioning must not debit treasury');
  const invested=api.approveInvestment('BGD',{projectId});
  assert.equal(invested.accepted,true,JSON.stringify(invested));
  assert.equal(h.state.finance.BGD.available,10000000-h.sandbox.OmegaResourceStrategicPolicyRules.exploration.investmentCostPerProject);
  const commissioned=api.commissionSite('BGD',{projectId});
  assert.equal(commissioned.accepted,true,JSON.stringify(commissioned));
  const gate=api.siteAvailableForExtraction('BGD',siteId);
  assert.equal(gate.allowed,true,JSON.stringify(gate));
  assert.equal(h.state.resource.BGD.commissionedSites[0].siteId,siteId);
});

test('extraction and processing commit environmental impact; replay is idempotent and remediation improves site state',()=>{
  const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime,siteId='SITE_BGD_TEST_LOCKED';
  const baseline=api.extractionMultiplier('BGD',siteId,'copper');
  assert.equal(baseline,1);
  for(let i=1;i<=20;i++){
    const response=h.interop.dispatchCommand('resource','OMEGA_RESOURCE_ENVIRONMENT_RECORD_EXTRACTION','BGD',{
      transactionId:'EXT-ENV-'+i,siteId,resourceId:'copper',quantity:1000000,unit:'TONNES'
    });
    assert.equal(response.status,'APPLIED',JSON.stringify(response));
  }
  const after=h.state.resource.BGD.environmentalImpact.bySite[siteId];
  assert(after.landIndex>0&&after.waterIndex>0&&after.emissionsIndex>0);
  assert(api.extractionMultiplier('BGD',siteId,'copper')<baseline,'accumulated environmental burden must reduce future extraction rate');
  const rowsBefore=h.state.resource.BGD.environmentalLedger.length;
  const replay=h.interop.dispatchCommand('resource','OMEGA_RESOURCE_ENVIRONMENT_RECORD_EXTRACTION','BGD',{
    transactionId:'EXT-ENV-20',siteId,resourceId:'copper',quantity:1000000,unit:'TONNES'
  });
  assert.equal(replay.result.duplicate,true);
  assert.equal(h.state.resource.BGD.environmentalLedger.length,rowsBefore);

  const processed=h.interop.dispatchCommand('resource','OMEGA_RESOURCE_ENVIRONMENT_RECORD_PROCESSING','BGD',{
    transactionId:'PROCESS-ENV-1',siteId,resourceId:'copper',quantity:1000000,unit:'TONNES'
  });
  assert.equal(processed.status,'APPLIED',JSON.stringify(processed));
  assert(h.state.resource.BGD.environmentalImpact.bySite[siteId].wasteIndex>0);
  const landBeforeRemediation=h.state.resource.BGD.environmentalImpact.bySite[siteId].landIndex;
  const remediated=api.remediateSite('BGD',{siteId,amount:5,transactionId:'REMED-ENV-1'});
  assert.equal(remediated.accepted,true,JSON.stringify(remediated));
  assert(h.state.resource.BGD.environmentalImpact.bySite[siteId].landIndex<landBeforeRemediation);
  assert(h.state.resource.BGD.environmentalLedger.some(x=>x.transactionId==='REMED-ENV-1'&&x.impactType==='REMEDIATION'));
});

test('policy diagnostics expose live rule load, handler registration and quota enforcement history',()=>{
  const h=harness();
  h.state.resource.BGD.carbonQuotaEnforcementLedger=[{violationId:'DIAG-VIOLATION',status:'BLOCKED'}];
  const diag=h.sandbox.Omega.ResourceStrategicPolicyRuntime.diagnostics();
  assert.equal(diag.rulesLoaded,true);
  assert.equal(diag.rulesVersion,'1.0.0');
  assert.equal(diag.handlersReady,true,JSON.stringify(diag));
  assert.equal(diag.carbonQuotaEnforcementRows,1);
});


test('canonical simulation save/load preserves resource policy, environment, reserve and exploration state',()=>{
  const h=harness();
  const simulationSource=fs.readFileSync(new URL('../omega_simulation_runtime.js',import.meta.url),'utf8');
  new vm.Script(simulationSource,{filename:'omega_simulation_runtime.js'}).runInContext(h.sandbox);
  const sim=h.sandbox.Omega.Simulation;
  sim.configure({state:h.state,interoperability:h.sandbox.Omega.MinistryInteroperability});
  h.state.simulation.turn=12;
  h.state.resource.BGD.mineStates={'SITE_OCC:BGD:test':{residualQuantity:987654,unit:'TONNES',stateVersion:7}};
  h.state.resource.BGD.environmentalImpact={revision:9,bySite:{'SITE_BGD_TEST_LOCKED':{landIndex:12.5,waterIndex:8,lastUpdatedTurn:12}}};
  h.state.resource.BGD.explorationProjects=[{projectId:'EXP-RESTORE',siteId:'SITE_BGD_TEST_LOCKED',status:'IN_PROGRESS',progressTurns:1,requiredTurns:3}];
  h.state.trade.BGD.resourceEmbargoes=[{policyId:'EMBARGO-RESTORE',issuerCountryId:'BGD',targetCountryId:'SAU',resourceId:'copper',direction:'EXPORT',status:'ACTIVE',startsTurn:10}];
  h.state.resource.BGD.batches=[{batchId:'BATCH-RESTORE',resourceId:'copper',remainingQuantity:1234,stage:'RAW_EXTRACTED'}];
  h.state.resource.BGD.carbonQuota={quotaId:'QUOTA-RESTORE',allowanceTonnesCo2e:50,unit:'TONNES_CO2E',periodTurns:10,status:'ACTIVE'};
  h.state.resource.BGD.carbonEmissionsLedger=[{transactionId:'CARBON-RESTORE',quantityTonnesCo2e:12,unit:'TONNES_CO2E',quotaId:'QUOTA-RESTORE',periodIndex:0}];
  h.state.resource.BGD.carbonQuotaEnforcementLedger=[{violationId:'VIOLATION-RESTORE',quotaId:'QUOTA-RESTORE',reason:'CARBON_QUOTA_EXCEEDED',requestedTonnesCo2e:15,status:'BLOCKED',remediationFollowUp:'MONITOR_SITE_IMPACT'}];
  h.state.resource.BGD.powerProjects=[{projectId:'POWER-RESTORE',status:'UNDER_CONSTRUCTION',progressTurns:3}];
  h.state.resource.BGD.powerAssets=[{assetId:'ASSET-RESTORE',status:'OPERATIONAL',capacityMw:2400}];
  h.state.resource.BGD.powerGeneration={turn:12,installedCapacityMw:2400,generatedMwh:51840,unit:'MWH_PER_TURN'};
  h.state.resource.BGD.powerGenerationLedger=[{transactionId:'POWER-GEN-RESTORE',status:'GENERATED',generationMwh:51840}];
  h.state.resource.BGD.cognitiveDecisionLedger=[{decisionId:'COG-RESTORE',decision:'REVIEW',advisory:false,enforced:true,gateScope:'STRATEGIC_HIGH_IMPACT_OPERATIONS',aiGenerated:false}];
  h.state.resource.BGD.sovereignWealthFund={fundId:'SWF:BGD',balance:240,unit:'TREASURY_NATIVE_UNITS',contributions:[{transactionId:'SWF-RESTORE',amount:240}]};
  const saved=sim.saveState();
  h.state.resource.BGD.mineStates={};h.state.resource.BGD.environmentalImpact={revision:999};h.state.resource.BGD.explorationProjects=[];h.state.trade.BGD.resourceEmbargoes=[];h.state.resource.BGD.batches=[];
  h.state.resource.BGD.carbonQuota=null;h.state.resource.BGD.carbonEmissionsLedger=[];h.state.resource.BGD.carbonQuotaEnforcementLedger=[];h.state.resource.BGD.powerProjects=[];h.state.resource.BGD.powerAssets=[];h.state.resource.BGD.powerGeneration={};h.state.resource.BGD.powerGenerationLedger=[];h.state.resource.BGD.cognitiveDecisionLedger=[];h.state.resource.BGD.sovereignWealthFund=null;
  sim.loadState(saved);
  assert.equal(h.state.simulation.turn,12);
  assert.equal(h.state.resource.BGD.mineStates['SITE_OCC:BGD:test'].residualQuantity,987654);
  assert.equal(h.state.resource.BGD.environmentalImpact.bySite.SITE_BGD_TEST_LOCKED.landIndex,12.5);
  assert.equal(h.state.resource.BGD.explorationProjects[0].status,'IN_PROGRESS');
  assert.equal(h.state.trade.BGD.resourceEmbargoes[0].policyId,'EMBARGO-RESTORE');
  assert.equal(h.state.resource.BGD.batches[0].remainingQuantity,1234);
  assert.equal(h.state.resource.BGD.carbonQuota.quotaId,'QUOTA-RESTORE');
  assert.equal(h.state.resource.BGD.carbonEmissionsLedger[0].quantityTonnesCo2e,12);
  assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger[0].violationId,'VIOLATION-RESTORE');
  assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger[0].reason,'CARBON_QUOTA_EXCEEDED');
  assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger[0].requestedTonnesCo2e,15);
  assert.equal(h.state.resource.BGD.powerProjects[0].progressTurns,3);
  assert.equal(h.state.resource.BGD.powerAssets[0].capacityMw,2400);
  assert.equal(h.state.resource.BGD.powerGeneration.generatedMwh,51840);
  assert.equal(h.state.resource.BGD.powerGenerationLedger[0].transactionId,'POWER-GEN-RESTORE');
  assert.equal(h.state.resource.BGD.cognitiveDecisionLedger[0].aiGenerated,false);
  assert.equal(h.state.resource.BGD.cognitiveDecisionLedger[0].enforced,true);
  assert.equal(h.state.resource.BGD.sovereignWealthFund.balance,240);
  assert.equal(h.state.resource.BGD.sovereignWealthFund.contributions[0].transactionId,'SWF-RESTORE');
  assert.equal(sim.diagnostics().authoritativeState.worldStateLinked,true);
});

test('incomplete embargo scope fails closed rather than silently authorizing trade',()=>{
  const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
  const result=api.isResourceEmbargoed('BGD','SAU','');
  assert.equal(result.blocked,true);
  assert.equal(result.reason,'INCOMPLETE_SCOPE');
});

test('unknown environmental units are rejected without a fabricated default impact',()=>{
  const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
  const response=h.interop.dispatchCommand('resource','OMEGA_RESOURCE_ENVIRONMENT_RECORD_EXTRACTION','BGD',{
    transactionId:'EXT-ENV-MISSING-UNIT',siteId:'SITE_BGD_TEST_LOCKED',resourceId:'copper',quantity:1000
  });
  assert.equal(response.status,'FAILED',JSON.stringify(response));
  assert.equal(response.result.reason,'ENVIRONMENTAL_UNIT_SCALE_UNAVAILABLE');
  assert.equal(h.state.resource.BGD.environmentalLedger,undefined);
  assert.equal(h.state.resource.BGD.environmentalImpact,undefined);
  const preview=api.previewCarbonActivity('BGD','copper',1000,'UNKNOWN_UNITS','TEST_ACTIVITY');
  assert.equal(preview.allowed,false);
  assert.equal(preview.reason,'ENVIRONMENTAL_UNIT_SCALE_UNAVAILABLE');
});


test('carbon quota tracks CO2e separately from environmental impact indexes and blocks over-quota emissions',()=>{
 const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
 const set=api.setCarbonQuota('BGD',{quotaId:'CARBON-TEST-1',allowanceTonnesCo2e:100,periodTurns:10});
 assert.equal(set.accepted,true,JSON.stringify(set));
 const oreUnits=api.previewCarbonActivity('BGD','coal',100,'TONNES_ORE','TEST_ACTIVITY');
 assert.equal(oreUnits.allowed,true,JSON.stringify(oreUnits));
 assert.equal(oreUnits.emissionsTonnesCo2e,8);
 const allowed=h.interop.dispatchCommand('resource','OMEGA_RESOURCE_ENVIRONMENT_RECORD_EXTRACTION','BGD',{
  transactionId:'CARBON-ALLOW-1',siteId:'SITE_BGD_TEST_LOCKED',resourceId:'copper',quantity:500,unit:'TONNES'
 });
 assert.equal(allowed.status,'APPLIED',JSON.stringify(allowed));
 assert.equal(h.state.resource.BGD.carbonEmissionsLedger[0].unit,'TONNES_CO2E');
 assert.equal(h.state.resource.BGD.carbonEmissionsLedger[0].quantityTonnesCo2e,60);
 const before=JSON.stringify({impact:h.state.resource.BGD.environmentalImpact,ledger:h.state.resource.BGD.environmentalLedger,carbon:h.state.resource.BGD.carbonEmissionsLedger});
 const blocked=h.interop.dispatchCommand('resource','OMEGA_RESOURCE_ENVIRONMENT_RECORD_EXTRACTION','BGD',{
  transactionId:'CARBON-BLOCK-1',siteId:'SITE_BGD_TEST_LOCKED',resourceId:'copper',quantity:500,unit:'TONNES'
 });
 assert.equal(blocked.status,'APPLIED','the enforcement-ledger write is applied while the emission remains blocked');
 assert.equal(blocked.result.blocked,true);
 assert.equal(blocked.result.reason,'CARBON_QUOTA_EXCEEDED');
 assert.equal(blocked.result.emissionCommitted,false);
 assert.equal(JSON.stringify({impact:h.state.resource.BGD.environmentalImpact,ledger:h.state.resource.BGD.environmentalLedger,carbon:h.state.resource.BGD.carbonEmissionsLedger}),before,
  'blocked emissions must not partially write impact or emission state');
 assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger.length,1);
 assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger[0].violationId,'CARBON-VIOLATION:CARBON:CARBON-BLOCK-1');
 assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger[0].requestedTonnesCo2e,60);
 assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger[0].projectedTonnesCo2e,120);
 assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger[0].enforcementAction,'ACTIVITY_BLOCKED_BEFORE_EMISSION_COMMIT');
 assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger[0].remediationFollowUp,'MONITOR_SITE_IMPACT');
 assert.equal(h.events.filter(event=>event.type==='OMEGA_RESOURCE_CARBON_QUOTA_VIOLATION_RECORDED').length,1);
 const saved=JSON.parse(JSON.stringify(h.state.resource.BGD));
 assert.equal(saved.carbonQuotaEnforcementLedger[0].reason,'CARBON_QUOTA_EXCEEDED','the violation ledger remains save/load serializable');
 const preflight=api.previewCarbonActivity('BGD','copper',500,'TONNES','RESOURCE_EXTRACTION',null,{
  activityId:'CARBON-PREVIEW-OVER',siteId:'SITE_BGD_TEST_LOCKED',sourceId:'SITE_BGD_TEST_LOCKED'
 });
 assert.equal(preflight.allowed,false);
 assert.equal(preflight.reason,'CARBON_QUOTA_EXCEEDED');
 assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger.length,2);
 assert.equal(h.state.resource.BGD.carbonQuotaEnforcementLedger[1].violationId,'CARBON-VIOLATION:CARBON-PREVIEW-OVER');

 const unmetered=api.recordCarbonEmission('BGD',{transactionId:'CARBON-UNIT-INVALID',source:'TEST',quantity:1,unit:'KG_CO2E'});
 assert.equal(unmetered.accepted,false);
 assert.equal(unmetered.reason,'CARBON_EMISSION_UNIT_INVALID');
});

test('high-impact cognitive gate requires a server AI verdict and persists it idempotently',()=>{
 const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
 const answers=['proceed','proceed','review','proceed','proceed','review','proceed','proceed','review','proceed','proceed','proceed'];
 const missingAi=api.evaluateCognitiveGate('BGD',{decisionId:'COGNITIVE-NO-AI',operation:'POWER_PROJECT',projectType:'NUCLEAR_BASELOAD',answers});
 assert.equal(missingAi.accepted,false);
 assert.equal(missingAi.reason,'AI_ASSESSMENT_REQUIRED');
 assert.equal((h.state.resource.BGD.cognitiveDecisionLedger||[]).length,0);
 const payload={decisionId:'COGNITIVE-TEST-1',operation:'POWER_PROJECT',projectType:'NUCLEAR_BASELOAD',requestedAmount:null,answers,aiAssessment:aiAssessment('PROCEED','POWER_PROJECT',null)};
 const response=api.evaluateCognitiveGate('BGD',payload);
 assert.equal(response.accepted,true,JSON.stringify(response));
 assert.equal(response.persisted,true);
 assert.equal(response.decision.decision,'PROCEED_WITH_RECORDED_ASSUMPTIONS');
 assert.equal(response.decision.aiGenerated,true);
 assert.equal(response.decision.enforced,true);
 assert.equal(response.decision.gateScope,'STRATEGIC_HIGH_IMPACT_OPERATIONS');
 assert.equal(response.decision.authority,'OMEGA_SERVER_RESOURCE_DECISION_AI');
 assert.equal(response.decision.modelDecision,'PROCEED');
 assert.equal(response.decision.operation,'POWER_PROJECT');
 assert.equal(response.decision.projectType,'NUCLEAR_BASELOAD');
 assert.equal(h.state.resource.BGD.cognitiveDecisionLedger.length,1);
 const crossOperation=api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-CROSS-OP',amount:200});
 assert.equal(crossOperation.accepted,false);
 assert.equal(crossOperation.reason,'COGNITIVE_GATE_OPERATION_MISMATCH');
 const replay=api.evaluateCognitiveGate('BGD',payload);
 assert.equal(replay.duplicate,true);
 assert.equal(h.state.resource.BGD.cognitiveDecisionLedger.length,1);
 const incomplete=api.evaluateCognitiveGate('BGD',{decisionId:'COGNITIVE-INCOMPLETE',operation:'POWER_PROJECT',projectType:'NUCLEAR_BASELOAD',answers:['proceed'],aiAssessment:aiAssessment()});
 assert.equal(incomplete.accepted,false);
 assert.equal(incomplete.reason,'ALL_12_QUESTIONS_REQUIRE_ANSWERS');
 const unauthoritative=api.evaluateCognitiveGate('BGD',{decisionId:'COGNITIVE-FAKE-AI',operation:'POWER_PROJECT',projectType:'NUCLEAR_BASELOAD',answers,aiAssessment:{...aiAssessment(),authority:'PLAYER_ENTERED_COGNITIVE_SCREENING'}});
 assert.equal(unauthoritative.accepted,false);
 assert.equal(unauthoritative.reason,'AI_ASSESSMENT_REQUIRED');
});

test('nuclear baseload construction debits treasury, commissions only by turns and produces fuel- and carbon-gated output',()=>{
 const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
 h.state.finance.BGD.available=3000000000;
 h.state.resource.BGD.inventory={uranium:10};
 const quota=api.setCarbonQuota('BGD',{quotaId:'POWER-CARBON-LOW',allowanceTonnesCo2e:1,periodTurns:10});
 assert.equal(quota.accepted,true);
 const noGate=api.startPowerProject('BGD',{projectId:'POWER-PROJECT-NO-GATE',projectType:'NUCLEAR_BASELOAD'});
 assert.equal(noGate.accepted,false);
 assert.equal(noGate.reason,'COGNITIVE_GATE_DECISION_REQUIRED');
 const gate=api.evaluateCognitiveGate('BGD',{decisionId:'POWER-GATE-APPROVAL',operation:'POWER_PROJECT',projectType:'NUCLEAR_BASELOAD',requestedAmount:null,answers:Array(12).fill('proceed'),aiAssessment:aiAssessment('PROCEED','POWER_PROJECT',null)});
 assert.equal(gate.accepted,true);
 const started=api.startPowerProject('BGD',{projectId:'POWER-PROJECT-2400',projectType:'NUCLEAR_BASELOAD'});
 assert.equal(started.accepted,true,JSON.stringify(started));
 assert.equal(started.project.capacityMw,2400);
 assert.equal(started.project.costTreasuryUnits,2000000000);
 assert.equal(started.project.constructionCurrency,'TREASURY_NATIVE_UNITS');
 assert.equal(h.state.finance.BGD.available,1000000000);
 const repeat=api.startPowerProject('BGD',{projectId:'POWER-PROJECT-2400',projectType:'NUCLEAR_BASELOAD'});
 assert.equal(repeat.duplicate,true,'same project request must not debit treasury twice');
 const secondProject=api.startPowerProject('BGD',{projectId:'POWER-PROJECT-2400-SECOND',projectType:'NUCLEAR_BASELOAD'});
 assert.equal(secondProject.accepted,false);
 assert.equal(secondProject.reason,'COGNITIVE_GATE_APPROVAL_ALREADY_USED');
 for(let t=2;t<=6;t++){h.state.simulation.turn=t;api.processPowerCountry('BGD');}
 assert.equal(h.state.resource.BGD.powerProjects[0].status,'COMMISSIONED');
 assert.equal(h.state.resource.BGD.powerAssets[0].status,'IDLE_CARBON_QUOTA');
 assert.equal(h.state.resource.BGD.powerGeneration.generatedMwh,0);
 assert.equal(h.state.resource.BGD.inventory.uranium,10,'blocked generation must not consume fuel');
 const raised=api.setCarbonQuota('BGD',{quotaId:'POWER-CARBON-OPEN',allowanceTonnesCo2e:1000,periodTurns:10});
 assert.equal(raised.accepted,true);
 h.state.simulation.turn=7;
 const generated=api.processPowerCountry('BGD');
 assert.equal(generated.accepted,true,JSON.stringify(generated));
 assert.equal(h.state.resource.BGD.powerAssets[0].status,'OPERATIONAL');
 assert.equal(h.state.resource.BGD.powerGeneration.installedCapacityMw,2400);
 assert.equal(h.state.resource.BGD.powerGeneration.generatedMwh,51840);
 assert.equal(h.state.resource.BGD.inventory.uranium,9.99);
 assert(h.state.resource.BGD.carbonEmissionsLedger.some(x=>x.source==='POWER_GENERATION'&&x.unit==='TONNES_CO2E'));
 assert(h.state.resource.BGD.powerGenerationLedger.some(x=>x.status==='GENERATED'));
});



test('sovereign wealth fund capitalization debits treasury once and persists contribution lineage',()=>{
 const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
 h.state.finance.BGD.available=500;
 const noGate=api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-NO-GATE',amount:200});
 assert.equal(noGate.accepted,false);
 assert.equal(noGate.reason,'COGNITIVE_GATE_DECISION_REQUIRED');
 const blockedGate=api.evaluateCognitiveGate('BGD',{decisionId:'SWF-GATE-BLOCK',operation:'SWF_CAPITALIZATION',requestedAmount:200,answers:['block',...Array(11).fill('proceed')],aiAssessment:aiAssessment('PROCEED','SWF_CAPITALIZATION',200)});
 assert.equal(blockedGate.accepted,true);
 const blocked=api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-BLOCKED',amount:200});
 assert.equal(blocked.accepted,false);
 assert.equal(blocked.reason,'COGNITIVE_GATE_BLOCKED');
 const approved=api.evaluateCognitiveGate('BGD',{decisionId:'SWF-GATE-PROCEED',operation:'SWF_CAPITALIZATION',requestedAmount:200,answers:Array(12).fill('proceed'),aiAssessment:aiAssessment('PROCEED','SWF_CAPITALIZATION',200)});
 assert.equal(approved.accepted,true);
 const first=api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-1',amount:200});
 assert.equal(first.accepted,true,JSON.stringify(first));
 assert.equal(first.fund.balance,200);
 assert.equal(first.fund.unit,'TREASURY_NATIVE_UNITS');
 assert.equal(h.state.finance.BGD.available,300);
 const duplicate=api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-1',amount:200});
 assert.equal(duplicate.duplicate,true);
 assert.equal(h.state.finance.BGD.available,300,'retry must not debit treasury twice');
 const approvalReuse=api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-SECOND',amount:200});
 assert.equal(approvalReuse.accepted,false);
 assert.equal(approvalReuse.reason,'COGNITIVE_GATE_APPROVAL_ALREADY_USED');
 const conflict=api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-1',amount:250});
 assert.equal(conflict.accepted,false);
 assert.equal(conflict.reason,'SWF_TRANSACTION_ID_CONFLICT');
 assert.equal(api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-INVALID',amount:0}).reason,'SWF_AMOUNT_MUST_BE_POSITIVE');
});



test('state supply directives enforce domestic-only, quota, export contract and bounded 46/4 factory allocation',()=>{
  const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
  const domesticOnly=api.setSupplyDirective('BGD',{directive:'DOMESTIC_ONLY',resourceId:'iron_ore',
    policyId:'DOMESTIC-ONLY-IRON',reason:'National shortage'});
  assert.equal(domesticOnly.accepted,true,JSON.stringify(domesticOnly));
  const blocked=api.evaluateExportDirective('BGD','SAU','iron_ore',1,null,{iron_ore:100});
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.reason,'STATE_DIRECTIVE_DOMESTIC_ONLY');

  const contract=api.setSupplyDirective('BGD',{directive:'GOVERNMENT_EXPORT_CONTRACT',resourceId:'iron_ore',
    policyId:'GOV-EXPORT-IRON-1',contractId:'GOV-EXPORT-IRON-1',targetCountryId:'SAU',
    authorizedQuantity:20,companyIds:['AURORA_INDUSTRIAL_GROUP']});
  assert.equal(contract.accepted,true,JSON.stringify(contract));
  const approved=api.evaluateExportDirective('BGD','SAU','iron_ore',20,'GOV-EXPORT-IRON-1',{iron_ore:100});
  assert.equal(approved.allowed,true,JSON.stringify(approved));
  const wrongContractCompany=api.validateExportBatchAllocation('BGD','iron_ore',[
    {sourceFactoryId:'FAC-EXPORT-01',ownerCompanyId:'MERIDIAN_ENGINEERING_GROUP'}
  ],'GOV-EXPORT-IRON-1');
  assert.equal(wrongContractCompany.allowed,false);
  assert.equal(wrongContractCompany.reason,'GOVERNMENT_EXPORT_CONTRACT_COMPANY_NOT_AUTHORIZED');
  const wrongDestination=api.evaluateExportDirective('BGD','IND','iron_ore',1,'GOV-EXPORT-IRON-1',{iron_ore:100});
  assert.equal(wrongDestination.allowed,false);
  assert.equal(wrongDestination.reason,'GOVERNMENT_EXPORT_CONTRACT_DESTINATION_MISMATCH');
  const overContract=api.evaluateExportDirective('BGD','SAU','iron_ore',21,'GOV-EXPORT-IRON-1',{iron_ore:100});
  assert.equal(overContract.allowed,false);
  assert.equal(overContract.reason,'GOVERNMENT_EXPORT_CONTRACT_QUANTITY_EXCEEDED');

  const quota=api.setSupplyDirective('BGD',{directive:'DOMESTIC_QUOTA',resourceId:'copper',
    policyId:'DOMESTIC-COPPER-70',domesticReserveQuantity:70});
  assert.equal(quota.accepted,true,JSON.stringify(quota));
  const quotaAllowed=api.evaluateExportDirective('BGD','SAU','copper',30,null,{copper:100});
  assert.equal(quotaAllowed.allowed,true,JSON.stringify(quotaAllowed));
  const quotaBlocked=api.evaluateExportDirective('BGD','SAU','copper',31,null,{copper:100});
  assert.equal(quotaBlocked.allowed,false);
  assert.equal(quotaBlocked.reason,'DOMESTIC_SUPPLY_PROTECTED');

  const missingStockPolicy=api.setSupplyDirective('BGD',{directive:'STRATEGIC_STOCK_RESERVE',resourceId:'rare_earth',
    policyId:'UNKNOWN-STOCK-RESERVE',domesticReserveQuantity:10});
  assert.equal(missingStockPolicy.accepted,true);
  const unknownStock=api.evaluateExportDirective('BGD','SAU','rare_earth',1,null,{});
  assert.equal(unknownStock.allowed,false);
  assert.equal(unknownStock.reason,'STATE_SUPPLY_STOCK_UNOBSERVED');

  const domesticFactoryIds=Array.from({length:46},(_,i)=>'FAC-'+String(i+1).padStart(2,'0'));
  const exportFactoryIds=Array.from({length:4},(_,i)=>'FAC-'+String(i+47).padStart(2,'0'));
  const allocation=api.setSupplyDirective('BGD',{directive:'FACTORY_ALLOCATION',resourceId:'finished_goods',
    policyId:'FACTORY-ALLOCATION-46-4',domesticFactoryIds,exportFactoryIds});
  assert.equal(allocation.accepted,true,JSON.stringify(allocation));
  assert.equal(api.allowedExportFactoryIds('BGD','finished_goods').length,4);
  assert.equal(api.validateExportBatchAllocation('BGD','finished_goods',
    [{sourceFactoryId:'FAC-47',ownerCompanyId:'AURORA_INDUSTRIAL_GROUP'}]).allowed,true);
  const forbidden=api.validateExportBatchAllocation('BGD','finished_goods',
    [{sourceFactoryId:'FAC-46',ownerCompanyId:'AURORA_INDUSTRIAL_GROUP'}]);
  assert.equal(forbidden.allowed,false);
  assert.equal(forbidden.reason,'STATE_FACTORY_EXPORT_ALLOCATION_VIOLATION');
  assert.equal(api.supplyPolicySummary('BGD','finished_goods').domesticFactoryCount,46);
  assert.equal(api.supplyPolicySummary('BGD','finished_goods').exportFactoryCount,4);
});

test('government procurement buys privately owned finished batches once and transfers ownership inside shared warehouse',()=>{
  const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
  const companyId='NOVA_CONSUMER_INDUSTRIES';
  h.state.resource.BGD.inventory={widgets:100};
  h.state.resource.BGD.batches=[{
    batchId:'WIDGETS-PRIVATE-BATCH',resourceId:'widgets',quantity:100,remainingQuantity:100,
    unit:'UNITS',stage:'FINISHED',countryId:'BGD',ownerCompanyId:companyId,
    operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',
    sourceFactoryId:'FAC-PRIVATE-WIDGETS',warehouseId:'WH-BGD-PROCESSED',status:'AVAILABLE'
  }];
  h.state.resource.BGD.inventoryLots={'WIDGETS-PRIVATE-BATCH':{
    batchId:'WIDGETS-PRIVATE-BATCH',resourceId:'widgets',quantity:100,remainingQuantity:100,
    unit:'UNITS',stage:'FINISHED',countryId:'BGD',warehouseId:'WH-BGD-PROCESSED',
    ownerCompanyId:companyId,operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
    ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',status:'AVAILABLE'
  }};
  h.state.resource.BGD.processedWarehouse={
    warehouseId:'WH-BGD-PROCESSED',countryId:'BGD',availableByResource:{widgets:100},
    storedBatchIds:['WIDGETS-PRIVATE-BATCH'],receipts:[]
  };
  const policy=api.setSupplyDirective('BGD',{directive:'GOVERNMENT_PROCUREMENT',resourceId:'widgets',
    policyId:'GOV-PROC-POLICY-1',contractId:'GOV-PROC-ORDER-1',
    companyId,companyIds:[companyId],authorizedQuantity:50,procurementLimit:50});
  assert.equal(policy.accepted,true,JSON.stringify(policy));
  h.state.resource.BGD.processedWarehouse.status='OPERATIONAL';
  h.state.resource.BGD.inventoryLots['WIDGETS-PRIVATE-BATCH'].sourceFactoryId='FAC-PRIVATE-WIDGETS';
  h.state.economy={BGD:{productionAssets:[{
    id:'FAC-PRIVATE-WIDGETS',countryId:'BGD',factoryType:'WIDGET_FACTORY',status:'OPERATIONAL',productionEnabled:true,
    ownerType:'PRIVATE_ENTERPRISE',ownerCompanyId:companyId,operatorType:'PRIVATE_COMPANY_OPERATOR',
    operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
    stateControlRights:{operationalControl:'STATE_POLICY_ONLY',authority:'OMEGA_STATE_CONTROL_RIGHTS_V1'}
  }]}};
  const before=h.state.finance.BGD.available;
  const payload={policyId:'GOV-PROC-POLICY-1',procurementId:'GOV-PROC-ORDER-1',
    companyId,resourceId:'widgets',quantity:20,totalValue:200,batchIds:['WIDGETS-PRIVATE-BATCH']};
  const first=api.purchasePrivateStock('BGD',payload);
  assert.equal(first.accepted,true,JSON.stringify(first));
  assert.equal(h.state.finance.BGD.available,before-200);
  assert.ok(h.state.finance.BGD.tradeSettlementHistory.some(x=>x.settlementId==='GOV-PROC-ORDER-1'&&x.type==='DEBIT'&&x.amount===200),
    'government procurement Treasury debit must be recorded in the shared trade finance settlement journal');
  assert.equal(h.state.resource.BGD.inventory.widgets,100,'ownership purchase must not create aggregate inventory');
  assert.equal(h.state.resource.BGD.processedWarehouse.availableByResource.widgets,100,
    'same processed warehouse stock is transferred; it is not credited a second time');
  assert.equal(h.state.resource.BGD.batches.find(x=>x.batchId==='WIDGETS-PRIVATE-BATCH').remainingQuantity,80);
  const governmentBatch=h.state.resource.BGD.batches.find(x=>x.procurementId==='GOV-PROC-ORDER-1');
  assert.ok(governmentBatch);
  assert.equal(governmentBatch.ownerCompanyId,'STATE_GOVERNMENT_STOCK_BGD');
  assert.equal(governmentBatch.sourceTransferBatchId,'WIDGETS-PRIVATE-BATCH');
  assert.ok(h.state.resource.BGD.processedWarehouse.receipts.some(x=>x.batchId===governmentBatch.batchId&&
    x.status==='OWNERSHIP_TRANSFER_RECEIVED'));
  assert.equal(h.state.economy.BGD.companyAccounts[companyId].governmentProcurementRevenue,200);
  assert.equal(h.state.economy.BGD.companyAccounts[companyId].cashAuthority,
    'AGGREGATE_FLOW_TRACKER_NOT_SPENDABLE_WALLET');

  const replay=api.purchasePrivateStock('BGD',payload);
  assert.equal(replay.accepted,true);
  assert.equal(replay.duplicate,true);
  assert.equal(h.state.finance.BGD.available,before-200,'procurement replay must not debit Treasury twice');
  assert.equal(h.state.resource.BGD.batches.filter(x=>x.procurementId==='GOV-PROC-ORDER-1').length,1);
});

test('government procurement refuses unknown or non-private operator attribution',()=>{
  const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
  const companyId='NOVA_CONSUMER_INDUSTRIES';
  h.state.resource.BGD.batches=[{
    batchId:'UNVERIFIED-PRIVATE-BATCH',resourceId:'widgets',quantity:10,remainingQuantity:10,
    stage:'FINISHED',ownerCompanyId:companyId,operatorCompanyId:'UNKNOWN_OPERATOR',
    ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',status:'AVAILABLE'
  }];
  h.state.resource.BGD.inventory={widgets:10};
  h.state.resource.BGD.processedWarehouse={warehouseId:'WH-BGD-PROCESSED',countryId:'BGD',status:'OPERATIONAL',
    availableByResource:{widgets:10},reservedByResource:{widgets:0},storedBatchIds:['UNVERIFIED-PRIVATE-BATCH'],receipts:[]};
  h.state.resource.BGD.inventoryLots={'UNVERIFIED-PRIVATE-BATCH':{
    batchId:'UNVERIFIED-PRIVATE-BATCH',resourceId:'widgets',quantity:10,remainingQuantity:10,status:'AVAILABLE',
    ownerCompanyId:companyId,operatorCompanyId:'UNKNOWN_OPERATOR',ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',
    warehouseId:'WH-BGD-PROCESSED'
  }};
  const policy=api.setSupplyDirective('BGD',{directive:'GOVERNMENT_PROCUREMENT',resourceId:'widgets',
    policyId:'GOV-PROC-UNKNOWN-OPERATOR',contractId:'GOV-PROC-UNKNOWN-OPERATOR',
    companyId,authorizedQuantity:10,procurementLimit:10});
  assert.equal(policy.accepted,true,JSON.stringify(policy));
  const before=h.state.finance.BGD.available;
  const result=api.purchasePrivateStock('BGD',{policyId:'GOV-PROC-UNKNOWN-OPERATOR',
    procurementId:'GOV-PROC-UNKNOWN-OPERATOR',companyId,resourceId:'widgets',quantity:5,totalValue:50});
  assert.equal(result.accepted,false);
  assert.equal(result.reason,'GOVERNMENT_PROCUREMENT_PRIVATE_STOCK_INSUFFICIENT');
  assert.equal(h.state.finance.BGD.available,before);
});

test('government procurement rejects in-transit, unstored, missing-lot and mismatched factory batches before debit',()=>{
  const scenarios=[
    {name:'in transit',status:'IN_TRANSIT',stored:true,lot:true,asset:true},
    {name:'not stored',status:'AVAILABLE',stored:false,lot:true,asset:true},
    {name:'missing lot',status:'AVAILABLE',stored:true,lot:false,asset:true},
    {name:'wrong private factory owner',status:'AVAILABLE',stored:true,lot:true,asset:false}
  ];
  for(const scenario of scenarios){
    const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime,companyId='NOVA_CONSUMER_INDUSTRIES';
    h.state.resource.BGD.inventory={widgets:10};
    const batch={batchId:'PRIVATE-'+scenario.name.replaceAll(' ','-'),resourceId:'widgets',quantity:10,remainingQuantity:10,
      stage:'FINISHED',countryId:'BGD',ownerCompanyId:companyId,operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
      ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',sourceFactoryId:'FAC-PRIVATE-WIDGETS',
      warehouseId:'WH-BGD-PROCESSED',status:scenario.status};
    h.state.resource.BGD.batches=[batch];
    h.state.resource.BGD.inventoryLots=scenario.lot?{[batch.batchId]:{...batch}}:{};
    h.state.resource.BGD.processedWarehouse={warehouseId:'WH-BGD-PROCESSED',countryId:'BGD',status:'OPERATIONAL',
      availableByResource:{widgets:10},reservedByResource:{widgets:0},
      storedBatchIds:scenario.stored?[batch.batchId]:[],receipts:[]};
    h.state.economy={BGD:{productionAssets:scenario.asset?[{
      id:'FAC-PRIVATE-WIDGETS',status:'OPERATIONAL',productionEnabled:true,ownerType:'PRIVATE_ENTERPRISE',
      ownerCompanyId:companyId,operatorType:'PRIVATE_COMPANY_OPERATOR',operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
      stateControlRights:{operationalControl:'STATE_POLICY_ONLY',authority:'OMEGA_STATE_CONTROL_RIGHTS_V1'}
    }]:[]}};
    api.setSupplyDirective('BGD',{directive:'GOVERNMENT_PROCUREMENT',resourceId:'widgets',
      policyId:'PROC-'+scenario.name,contractId:'PROC-'+scenario.name,companyId,
      companyIds:[companyId],authorizedQuantity:10,procurementLimit:10});
    const before=h.state.finance.BGD.available;
    const result=api.purchasePrivateStock('BGD',{policyId:'PROC-'+scenario.name,procurementId:'PROC-'+scenario.name,
      companyId,resourceId:'widgets',quantity:5,totalValue:50,batchIds:[batch.batchId]});
    assert.equal(result.accepted,false,scenario.name+': '+JSON.stringify(result));
    assert.equal(result.reason,'GOVERNMENT_PROCUREMENT_PRIVATE_STOCK_INSUFFICIENT',scenario.name);
    assert.equal(h.state.finance.BGD.available,before,scenario.name+' must not debit Treasury');
    assert.equal(batch.remainingQuantity,10,scenario.name+' must not mutate source batch before validation completes');
  }
});

test('export settlement directive idempotency rejects the same ID with a changed transaction',()=>{
  const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
  const policy=api.setSupplyDirective('BGD',{directive:'FACTORY_ALLOCATION',resourceId:'widgets',
    policyId:'EXPORT-IDEMPOTENCY-ALLOCATION',domesticFactoryIds:['FAC-DOM-1'],exportFactoryIds:['FAC-EXP-1']});
  assert.equal(policy.accepted,true);
  const ctx={countryId:'BGD',stateTransaction:h.txFactory('BGD')};
  const first=api.commitExportDirectiveTx(ctx,{settlementId:'EXPORT-REPLAY-1',resourceId:'widgets',quantity:5,
    destinationCountryId:'SAU',batchTransfers:[{sourceBatchId:'B-1',resourceId:'widgets',quantity:5,
      stage:'FINISHED',ownerCompanyId:'NOVA_CONSUMER_INDUSTRIES',operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
      ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',sourceFactoryId:'FAC-EXP-1'}]});
  assert.equal(first.accepted,true,JSON.stringify(first));
  const exact=api.commitExportDirectiveTx(ctx,{settlementId:'EXPORT-REPLAY-1',resourceId:'widgets',quantity:5,
    destinationCountryId:'SAU',batchTransfers:[{sourceBatchId:'B-1',resourceId:'widgets',quantity:5,
      stage:'FINISHED',ownerCompanyId:'NOVA_CONSUMER_INDUSTRIES',operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
      ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',sourceFactoryId:'FAC-EXP-1'}]});
  assert.equal(exact.duplicate,true);
  const changed=api.commitExportDirectiveTx(ctx,{settlementId:'EXPORT-REPLAY-1',resourceId:'widgets',quantity:7,
    destinationCountryId:'IND',batchTransfers:[{sourceBatchId:'B-2',resourceId:'widgets',quantity:7,
      stage:'FINISHED',ownerCompanyId:'NOVA_CONSUMER_INDUSTRIES',operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
      ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',sourceFactoryId:'FAC-EXP-1'}]});
  assert.equal(changed.accepted,false);
  assert.equal(changed.reason,'STATE_DIRECTIVE_SETTLEMENT_IDEMPOTENCY_COLLISION');
});
