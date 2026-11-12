import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../omega_black_market_network_v1.js',import.meta.url),'utf8');

function makeHarness(options={}){
 const player='BGD',buyer=options.buyer||'IRN',seller=options.seller||'RUS';
 const state={
  simulation:{turn:25,session:{playerCountryId:player}},
  resource:{
   BGD:{inventory:{}},
   [buyer]:{inventory:{copper:2},demandRuntime:{lastTurn:25,byResource:options.shortage===false?{}:{
    copper:{resourceId:'copper',status:'SHORTAGE',unmetDemand:25,demandPerDay:30,stockCoverageDays:.5,
     stockCoverageTargetDays:5,procurementScore:.8,activeFactoryInputDemandPerDay:12,unit:'tonnes'}
   }}},
   [seller]:{inventory:{copper:200}}
  },
  foreign:{
   BGD:{relations:{IRN:{overall:35,trade:28,trust:32,war_state:false,sanctions:false}}},
   [buyer]:{stateTradeNetwork:true,relations:{[seller]:{overall:22,trade:18,trust:15,trade_agreement:false,sanctions:true,war_state:false}}},
   [seller]:{relations:{[buyer]:{overall:25,trade:20,trust:12,trade_agreement:false,sanctions:true,war_state:false}}},
   KAZ:{}
  },
  trade:{
   BGD:{},
   [buyer]:{resourceEmbargoes:[{policyId:'EMB-IRN-CU',resourceId:'copper',status:'ACTIVE'}]},
   [seller]:{stateSupplyDirectives:[{policyId:'DIR-RUS-CU',resourceId:'copper',status:'ACTIVE',issuerCountryId:seller}]}
  },
  finance:{BGD:{},[buyer]:{},[seller]:{}},
  intelligence:{BGD:{tradeSurveillance:90,foreignIntelligenceCapability:90},[buyer]:{},[seller]:{}},
  interior:{BGD:{customsInspectionCoverage:90},[buyer]:{},[seller]:{}},
  defense:{BGD:{maritimeAwareness:90},[buyer]:{},[seller]:{}}
 };
 const listenerMap=new Map(),created=[],offerCalls=[],processed=[];
 const relation={overall:22,trade:18,trust:15,trade_agreement:false,sanctions:true,war_state:false};
 const offer={
  offerId:'BM-OFFER:'+buyer+':'+seller+':copper',buyerCountryId:buyer,sellerCountryId:seller,resourceId:'copper',
  productName:'Copper',productType:'RAW_RESOURCE',unit:'tonnes',currency:'USD',buyerCurrency:'USD',
  requestedQuantity:25,availableQuantity:180,unitPrice:118,benchmarkUnitPrice:100,expectedSavings:null,
  legalMarketAvailable:false,embargoed:true,exportRestrictionReason:'STATE_DIRECTIVE_EXPORT_RESTRICTED',
  detectionProbability:.3,brokerId:'SHADOW-BROKER:'+seller,brokerType:'STATE_LINKED',brokerReputation:50,
  foreignPolicyBasis:['IMPORT EMBARGO','EXPORT RESTRICTION'],whyUse:'ACCESS DESPITE LEGAL OR DIPLOMATIC RESTRICTIONS'
 };
 const bm={
  getOffers(countryId,resourceId,quantity,policy){
   offerCalls.push({countryId,resourceId,quantity,policy});
   if(countryId!==buyer||resourceId!=='copper')return{status:'READY',offers:[]};
   return{status:'READY',offers:[{...offer,requestedQuantity:quantity}]};
  },
  getDeals(countryId){return structuredClone(state.trade[countryId]?.blackMarketDeals||[]);},
  getDeal(dealId,countryId){return structuredClone((state.trade[countryId]?.blackMarketDeals||[]).find(x=>String(x.dealId)===String(dealId))||null);},
  getNetworkReports(countryId){return structuredClone(state.intelligence[countryId]?.blackMarketNetworkReports||[]);},
  getTransits(){return[];},
  createAutonomousDeal(input){
   input=Object.assign({source:'OMEGA_BLACK_MARKET_NPC_NETWORK',autonomousNetwork:true},input);
   created.push(structuredClone(input));
   const row={dealId:'BM-NPC-IRN-RUS-T25-copper',permitId:'BM-PERMIT-NPC-1',requestId:'BM-NPC-IRN-RUS-T25-copper-TRADE',
    buyerCountryId:input.buyerCountryId,sellerCountryId:input.sellerCountryId,resourceId:input.resourceId,quantity:input.quantity,
    status:'SENT',autonomousNetwork:true,brokerId:input.brokerId,transitRoute:[{countryId:seller},{countryId:player}]};
   state.trade[input.buyerCountryId].blackMarketDeals=[row];
   return{accepted:true,deal:row};
  }
 };
 const ctx={
  Game:{state},
  Omega:{CanonicalIdentity:{resolveCountry(v){const id=String(v||'').toUpperCase();return{id,iso3:id};}},
   Simulation:{getPlayerCountryId(){return player;}},
   MinistryInteroperability:{
    dispatchCommand(owner,type,c,payload){
     if(type==='OMEGA_BLACK_MARKET_RECORD_NETWORK_REPORT'){
      const report=payload.report;
      state.intelligence[c]=state.intelligence[c]||{};
      const rows=state.intelligence[c].blackMarketNetworkReports||[];
      if(rows.some(x=>x.reportId===report.reportId))return{status:'APPLIED',result:{accepted:true,duplicate:true}};
      state.intelligence[c].blackMarketNetworkReports=rows.concat([structuredClone(report)]);
      return{status:'APPLIED',result:{accepted:true,report:structuredClone(report)}};
     }
     if(type==='OMEGA_BLACK_MARKET_RECORD_EXPORT_SHOCK'){
      const shock=payload.shock;state.trade[c]=state.trade[c]||{};
      const rows=state.trade[c].blackMarketExportShockLedger||[];
      if(rows.some(x=>x.shockId===shock.shockId))return{status:'APPLIED',result:{accepted:true,duplicate:true}};
      state.trade[c].blackMarketExportShockLedger=rows.concat([structuredClone(shock)]);
      return{status:'APPLIED',result:{accepted:true,shock:structuredClone(shock)}};
     }
     return{status:'UNHANDLED',result:{accepted:false,reason:'NO_HANDLER'}};
    }
   }},
  OmegaCanonicalIdentityRegistry:{resolveCountry(v){const id=String(v||'').toUpperCase();return{id,iso3:id};}},
  OmegaGlobalMarket:{productCatalog(){return[{id:'copper',name:'Copper',productType:'RAW_RESOURCE',unit:'tonnes'}];}},
  OmegaGlobalTrade:{processBlackMarketNetworkRequest(input){processed.push(structuredClone(input));return{accepted:true,status:'IN_TRANSIT'};}},
  OmegaGovernmentBanking:{getCountryPolicy(c){return{importTariffPct:c===buyer?(options.tariffPct??0):0};}},
  OmegaBlackMarket:bm,
  addEventListener(type,fn){const rows=listenerMap.get(type)||[];rows.push(fn);listenerMap.set(type,rows);}
 };
 vm.createContext(ctx);
 vm.runInContext(source,ctx,{filename:'omega_black_market_network_v1.js'});
 return{ctx,state,bm,created,offerCalls,processed,listenerMap,player,buyer,seller,relation};
}

test('autonomous NPC network finds observed demand gaps and creates a state-linked covert deal',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarketNetworkV1;
 const result=api.runTurn();
 assert.equal(result.status,'COMPLETED');
 assert.equal(result.newDeal.candidate.buyer,'IRN');
 assert.equal(result.newDeal.candidate.seller,'RUS');
 assert.equal(result.newDeal.candidate.resourceId,'copper');
 assert.equal(result.newDeal.candidate.governmentInvolvement,'BOTH_GOVERNMENTS_OR_STATE_LINKED_ENTITIES');
 assert.equal(result.newDeal.candidate.tactic,'STATE_TO_STATE_COVERT_PROCUREMENT');
 assert.equal(h.created.length,1);
 assert.equal(h.created[0].source,'OMEGA_BLACK_MARKET_NPC_NETWORK');
 assert.equal(h.created[0].autonomousNetwork,true);
 assert.equal(h.created[0].actorProfile.stateLinkedBuyer,true);
 assert.equal(h.created[0].actorProfile.stateLinkedSeller,true);
 assert.equal(h.created[0].actorProfile.buyerGovernmentRole,'STATE_LINKED_TRADING_NETWORK');
 assert.equal(h.created[0].actorProfile.sellerGovernmentRole,'STATE_POLICY_DIRECTED');
 assert.ok(h.created[0].actorProfile.buyerStateEvidence.includes('RECORDED_STATE_TRADING_NETWORK'));
 assert.ok(h.created[0].actorProfile.sellerStateEvidence.includes('ACTIVE_STATE_SUPPLY_DIRECTIVE'));
 assert.equal(h.created[0].actorProfile.tactic,'STATE_TO_STATE_COVERT_PROCUREMENT');
 assert.equal(h.created[0].actorProfile.buyerMotive,'SANCTIONED_OR_RESTRICTED_INPUT_ACCESS');
 assert.equal(h.created[0].actorProfile.sellerMotive,'STATE_DIRECTED_EXPORT_REVENUE');
 assert.equal(h.offerCalls[0].policy.networkAuthority,'OMEGA_BLACK_MARKET_NPC_NETWORK_V1');
 assert.equal(h.processed.length,1);
 assert.equal(result.newDeal.intelReport.level,'HIGH');
});

test('NPC decisions are deterministic per committed turn and active deals are not duplicated',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarketNetworkV1;
 const first=api.runTurn();
 const again=api.runTurn();
 assert.equal(first.status,'COMPLETED');
 assert.equal(again.status,'ALREADY_PROCESSED');
 assert.equal(h.created.length,1);
 h.state.simulation.turn=26;
 const next=api.runTurn();
 assert.equal(next.status,'COMPLETED');
 assert.equal(h.processed.length,2,'the pending NPC request may progress on a later turn');
 assert.equal(h.created.length,1,'an active buyer-seller deal blocks a duplicate order');
});

test('player country is not selected as an autonomous NPC seller',()=>{
 const h=makeHarness({seller:'BGD'}),result=h.ctx.OmegaBlackMarketNetworkV1.runTurn();
 assert.equal(result.newDeal,null);
 assert.equal(h.created.length,0);
});

test('countries with no observed shortage or low-stock coverage do not create shadow demand',()=>{
 const h=makeHarness({shortage:false}),result=h.ctx.OmegaBlackMarketNetworkV1.runTurn();
 assert.equal(result.candidateCount,0);
 assert.equal(result.newDeal,null);
 assert.equal(h.offerCalls.length,0);
});

test('network intelligence is written only to the discovering player country',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarketNetworkV1;
 const candidate={
  buyer:'IRN',seller:'RUS',row:{resourceId:'copper',productName:'Copper'},
  offer:{productName:'Copper',detectionProbability:.3},
  buyerState:true,sellerState:true,bmReason:{code:'STATE_PROCUREMENT',reason:'Observed state import restriction'},
  smReason:{code:'STATE_EXPORT',reason:'Observed export directive'},tactic:{code:'STATE_DIRECTED_INTERMEDIARY_NETWORK'}
 };
 const report=api.maybeDiscover(candidate,{dealId:'BM-NPC-IRN-RUS-T25-copper',brokerId:'STATE-NETWORK:RUS'},[{countryId:'BGD'}]);
 assert.ok(report,'the high-capability player customs/intelligence service should identify this exposed transit');
 assert.equal(report.level,'HIGH');
 assert.equal(report.governmentInvolvement,'BOTH_GOVERNMENTS_OR_STATE_LINKED_ENTITIES');
 assert.equal(report.motiveAssessment.buyerMotive,'STATE_PROCUREMENT');
 assert.equal(report.motiveAssessment.sellerMotive,'STATE_EXPORT');
 assert.ok(report.actorProfile.potentialIntermediaryCountryIds);
 assert.equal(h.state.intelligence.BGD.blackMarketNetworkReports.length,1);
 assert.equal(h.state.intelligence.RUS.blackMarketNetworkReports,undefined);
 assert.equal(h.state.intelligence.IRN.blackMarketNetworkReports,undefined);
 assert.equal(h.bm.getNetworkReports('BGD').length,1);
});

test('an embargo policy by itself does not prove that a government is a covert market participant', () => {
 const h=makeHarness(),api=h.ctx.OmegaBlackMarketNetworkV1;
 h.state.foreign.IRN.stateTradeNetwork=false;
 assert.equal(api.hasStateLink('IRN','copper'),false);
 assert.equal(api.stateActorEvidence('IRN','copper').role,'STATE_POLICY_CONTEXT_ONLY');
});

test('a state-to-state purchase records both policy motive and state-linked actor evidence', () => {
 const h=makeHarness(),api=h.ctx.OmegaBlackMarketNetworkV1;
 const result=api.runTurn();
 const profile=h.created[0].actorProfile;
 assert.equal(profile.buyerGovernmentRole,'STATE_LINKED_TRADING_NETWORK');
 assert.equal(profile.sellerGovernmentRole,'STATE_POLICY_DIRECTED');
 assert.equal(profile.governmentInvolvement,'BOTH_GOVERNMENTS_OR_STATE_LINKED_ENTITIES');
 assert.match(profile.buyerReason,/embargo|state import/i);
 assert.match(profile.sellerReason,/state supply directive/i);
});


test('world candidate scan checks every canonical country, not only the first fourteen demand opportunities', () => {
 const h=makeHarness(),api=h.ctx.OmegaBlackMarketNetworkV1;
 for(let i=1;i<=24;i++){
  const id='C'+String(i).padStart(2,'0');
  h.state.resource[id]={inventory:{},demandRuntime:{lastTurn:25,byResource:{}}};
  h.state.trade[id]={};h.state.foreign[id]={};h.state.finance[id]={};
 }
 const result=api.runTurn();
 assert.equal(result.status,'COMPLETED');
 assert.ok(result.worldCountryCount>=27);
 assert.equal(result.buyerCountriesScanned,result.worldCountryCount-1);
 assert.equal(result.limitPerTurn,1);
});

test('tariff-only commercial demand can enter the network with no recorded stock shortage', () => {
 const h=makeHarness({tariffPct:30}),api=h.ctx.OmegaBlackMarketNetworkV1;
 const row=h.state.resource.IRN.demandRuntime.byResource.copper;
 row.unmetDemand=0;row.stockCoverageDays=10;row.stockCoverageTargetDays=5;row.procurementScore=0;row.activeFactoryInputDemandPerDay=0;
 h.state.trade.IRN.resourceEmbargoes=[];
 h.state.foreign.IRN.stateTradeNetwork=false;
 const result=api.runTurn();
 assert.equal(result.status,'COMPLETED');
 assert.equal(result.newDeal.candidate.buyer,'IRN');
 assert.equal(h.created[0].actorProfile.buyerMotive,'TARIFF_AVOIDANCE_PRESSURE');
 assert.equal(result.newDeal.candidate.tariffAvoidance.importTariffPct,30);
});

test('lost primary export customer from sanctions creates an export shock and market-redirection decision', () => {
 const h=makeHarness(),api=h.ctx.OmegaBlackMarketNetworkV1;
 h.state.trade.IRN.sanctions=[{policyId:'SAN-IRN-RUS-CU',targetCountryId:'RUS',resourceId:'copper',
  status:'ACTIVE',secondarySanctions:true,issuerCountryId:'IRN'}];
 h.state.trade.RUS.exportDependenceByPartner={IRN:{shareOfSellerExports:0.42,exportValue:420,exportQuantity:120}};
 const result=api.runTurn();
 assert.equal(result.status,'COMPLETED');
 const profile=h.created[0].actorProfile;
 assert.equal(profile.sellerMotive,'LOST_MAJOR_EXPORT_CUSTOMER');
 assert.equal(profile.sellerExportShock.active,true);
 assert.equal(profile.sellerExportShock.mainCustomerCountryId,'IRN');
 assert.equal(profile.sellerExportShock.exportShare,0.42);
 assert.equal(profile.tactic,'LOST_PRIMARY_EXPORT_MARKET_REDIRECTION');
 assert.equal(h.state.trade.RUS.blackMarketExportShockLedger.length,1);
 assert.equal(h.state.trade.RUS.blackMarketExportShockLedger[0].exportShare,0.42);
});


test('NPC deal attribution selects matching existing private and state-owned companies without inventing new companies', () => {
 const h=makeHarness(),api=h.ctx.OmegaBlackMarketNetworkV1;
 h.state.economy={
  IRN:{companies:[{companyId:'IRN-IMPORT-7',name:'Iran Industrial Inputs',ownership:'PRIVATE',
   resourceId:'copper',inputDemandPerDay:14,importDependencyPct:72}]},
  RUS:{companies:[{companyId:'RUS-EXPORT-2',name:'Russian Metals Trading',ownership:'STATE_OWNED',
   resourceId:'copper',exportShare:61}]}
 };
 const before=JSON.stringify(h.state.economy);
 const result=api.runTurn();
 assert.equal(result.status,'COMPLETED');
 const profile=h.created[0].actorProfile;
 assert.equal(profile.buyerCommercialActor.actorType,'PRIVATE_COMPANY');
 assert.equal(profile.buyerCommercialActor.companyId,'IRN-IMPORT-7');
 assert.equal(profile.sellerCommercialActor.actorType,'STATE_OWNED_COMPANY');
 assert.equal(profile.sellerCommercialActor.companyId,'RUS-EXPORT-2');
 assert.equal(JSON.stringify(h.state.economy),before,'company attribution must not create company records or balances');
});
