import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
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
      return{status:result?.accepted===false?'REJECTED':'APPLIED',result,commandId:'TEST-'+type};
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

test('policy diagnostics expose live rule load and handler registration state',()=>{
  const h=harness(),diag=h.sandbox.Omega.ResourceStrategicPolicyRuntime.diagnostics();
  assert.equal(diag.rulesLoaded,true);
  assert.equal(diag.rulesVersion,'1.0.0');
  assert.equal(diag.handlersReady,true,JSON.stringify(diag));
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
  h.state.resource.BGD.powerProjects=[{projectId:'POWER-RESTORE',status:'UNDER_CONSTRUCTION',progressTurns:3}];
  h.state.resource.BGD.powerAssets=[{assetId:'ASSET-RESTORE',status:'OPERATIONAL',capacityMw:2400}];
  h.state.resource.BGD.powerGeneration={turn:12,installedCapacityMw:2400,generatedMwh:51840,unit:'MWH_PER_TURN'};
  h.state.resource.BGD.powerGenerationLedger=[{transactionId:'POWER-GEN-RESTORE',status:'GENERATED',generationMwh:51840}];
  h.state.resource.BGD.cognitiveDecisionLedger=[{decisionId:'COG-RESTORE',decision:'REVIEW',advisory:true,aiGenerated:false}];
  h.state.resource.BGD.sovereignWealthFund={fundId:'SWF:BGD',balance:240,unit:'TREASURY_NATIVE_UNITS',contributions:[{transactionId:'SWF-RESTORE',amount:240}]};
  const saved=sim.saveState();
  h.state.resource.BGD.mineStates={};h.state.resource.BGD.environmentalImpact={revision:999};h.state.resource.BGD.explorationProjects=[];h.state.trade.BGD.resourceEmbargoes=[];h.state.resource.BGD.batches=[];
  h.state.resource.BGD.carbonQuota=null;h.state.resource.BGD.carbonEmissionsLedger=[];h.state.resource.BGD.powerProjects=[];h.state.resource.BGD.powerAssets=[];h.state.resource.BGD.powerGeneration={};h.state.resource.BGD.powerGenerationLedger=[];h.state.resource.BGD.cognitiveDecisionLedger=[];h.state.resource.BGD.sovereignWealthFund=null;
  sim.loadState(saved);
  assert.equal(h.state.simulation.turn,12);
  assert.equal(h.state.resource.BGD.mineStates['SITE_OCC:BGD:test'].residualQuantity,987654);
  assert.equal(h.state.resource.BGD.environmentalImpact.bySite.SITE_BGD_TEST_LOCKED.landIndex,12.5);
  assert.equal(h.state.resource.BGD.explorationProjects[0].status,'IN_PROGRESS');
  assert.equal(h.state.trade.BGD.resourceEmbargoes[0].policyId,'EMBARGO-RESTORE');
  assert.equal(h.state.resource.BGD.batches[0].remainingQuantity,1234);
  assert.equal(h.state.resource.BGD.carbonQuota.quotaId,'QUOTA-RESTORE');
  assert.equal(h.state.resource.BGD.carbonEmissionsLedger[0].quantityTonnesCo2e,12);
  assert.equal(h.state.resource.BGD.powerProjects[0].progressTurns,3);
  assert.equal(h.state.resource.BGD.powerAssets[0].capacityMw,2400);
  assert.equal(h.state.resource.BGD.powerGeneration.generatedMwh,51840);
  assert.equal(h.state.resource.BGD.powerGenerationLedger[0].transactionId,'POWER-GEN-RESTORE');
  assert.equal(h.state.resource.BGD.cognitiveDecisionLedger[0].aiGenerated,false);
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
  assert.equal(response.status,'REJECTED',JSON.stringify(response));
  assert.equal(response.result.reason,'ENVIRONMENTAL_UNIT_SCALE_UNAVAILABLE');
  assert.equal(h.state.resource.BGD.environmentalLedger,undefined);
  assert.equal(h.state.resource.BGD.environmentalImpact,undefined);
});


test('carbon quota tracks CO2e separately from environmental impact indexes and blocks over-quota emissions',()=>{
 const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
 const set=api.setCarbonQuota('BGD',{quotaId:'CARBON-TEST-1',allowanceTonnesCo2e:100,periodTurns:10});
 assert.equal(set.accepted,true,JSON.stringify(set));
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
 assert.equal(blocked.status,'REJECTED');
 assert.equal(blocked.result.reason,'CARBON_QUOTA_EXCEEDED');
 assert.equal(JSON.stringify({impact:h.state.resource.BGD.environmentalImpact,ledger:h.state.resource.BGD.environmentalLedger,carbon:h.state.resource.BGD.carbonEmissionsLedger}),before,
  'rejected emissions must not partially write impact or ledger state');
 const unmetered=api.recordCarbonEmission('BGD',{transactionId:'CARBON-UNIT-INVALID',source:'TEST',quantity:1,unit:'KG_CO2E'});
 assert.equal(unmetered.accepted,false);
 assert.equal(unmetered.reason,'CARBON_EMISSION_UNIT_INVALID');
});

test('the 12-question cognitive gate persists a provenance-labelled advisory decision and idempotent retry',()=>{
 const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
 const answers=['proceed','proceed','review','proceed','proceed','review','proceed','proceed','review','proceed','proceed','proceed'];
 const response=api.evaluateCognitiveGate('BGD',{decisionId:'COGNITIVE-TEST-1',answers});
 assert.equal(response.accepted,true,JSON.stringify(response));
 assert.equal(response.persisted,true);
 assert.equal(response.decision.decision,'PROCEED_WITH_RECORDED_ASSUMPTIONS');
 assert.equal(response.decision.aiGenerated,false);
 assert.equal(response.decision.authority,'PLAYER_ENTERED_COGNITIVE_SCREENING');
 assert.equal(h.state.resource.BGD.cognitiveDecisionLedger.length,1);
 const replay=api.evaluateCognitiveGate('BGD',{decisionId:'COGNITIVE-TEST-1',answers});
 assert.equal(replay.duplicate,true);
 assert.equal(h.state.resource.BGD.cognitiveDecisionLedger.length,1);
 const incomplete=api.evaluateCognitiveGate('BGD',{decisionId:'COGNITIVE-INCOMPLETE',answers:['proceed']});
 assert.equal(incomplete.accepted,false);
 assert.equal(incomplete.reason,'ALL_12_QUESTIONS_REQUIRE_ANSWERS');
});

test('nuclear baseload construction debits treasury, commissions only by turns and produces fuel- and carbon-gated output',()=>{
 const h=harness(),api=h.sandbox.Omega.ResourceStrategicPolicyRuntime;
 h.state.finance.BGD.available=3000000000;
 h.state.resource.BGD.inventory={uranium:10};
 const quota=api.setCarbonQuota('BGD',{quotaId:'POWER-CARBON-LOW',allowanceTonnesCo2e:1,periodTurns:10});
 assert.equal(quota.accepted,true);
 const started=api.startPowerProject('BGD',{projectId:'POWER-PROJECT-2400',projectType:'NUCLEAR_BASELOAD'});
 assert.equal(started.accepted,true,JSON.stringify(started));
 assert.equal(started.project.capacityMw,2400);
 assert.equal(started.project.costTreasuryUnits,2000000000);
 assert.equal(started.project.constructionCurrency,'TREASURY_NATIVE_UNITS');
 assert.equal(h.state.finance.BGD.available,1000000000);
 const repeat=api.startPowerProject('BGD',{projectId:'POWER-PROJECT-2400',projectType:'NUCLEAR_BASELOAD'});
 assert.equal(repeat.duplicate,true,'same project request must not debit treasury twice');
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
 const first=api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-1',amount:200});
 assert.equal(first.accepted,true,JSON.stringify(first));
 assert.equal(first.fund.balance,200);
 assert.equal(first.fund.unit,'TREASURY_NATIVE_UNITS');
 assert.equal(h.state.finance.BGD.available,300);
 const duplicate=api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-1',amount:200});
 assert.equal(duplicate.duplicate,true);
 assert.equal(h.state.finance.BGD.available,300,'retry must not debit treasury twice');
 const conflict=api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-1',amount:250});
 assert.equal(conflict.accepted,false);
 assert.equal(conflict.reason,'SWF_TRANSACTION_ID_CONFLICT');
 assert.equal(api.capitalizeSovereignWealthFund('BGD',{transactionId:'SWF-CAP-INVALID',amount:0}).reason,'SWF_AMOUNT_MUST_BE_POSITIVE');
});
