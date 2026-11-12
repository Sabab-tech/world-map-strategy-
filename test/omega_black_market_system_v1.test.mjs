import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../omega_black_market_system_v1.js',import.meta.url),'utf8');
const tradeSource=fs.readFileSync(new URL('../omega_global_trade_system.js',import.meta.url),'utf8');
function makeHarness(){
 const state={simulation:{turn:7,session:{playerCountryId:'BGD'}},
 resource:{BGD:{inventory:{},reserves:{}},SAU:{inventory:{coal:100},reserves:{coal:10},strategicReserve:{availableByResource:{coal:5}},
  warehouse:{countryId:'SAU',status:'OPERATIONAL',availableByResource:{coal:90},reservedByResource:{coal:0}}}},
 trade:{BGD:{},SAU:{}},
 foreign:{BGD:{relations:{SAU:{overall:30,trade:20,trust:25,political:35,trade_agreement:false,sanctions:true,war_state:false}}},
  SAU:{relations:{BGD:{overall:35,trade:20,trust:25,political:40,trade_agreement:false,sanctions:true,war_state:false}}},XYZ:{}},
 finance:{BGD:{available:1000000}},governmentBanking:{tradePolicies:{BGD:{importTariffPct:30}}},intelligence:{}};
 const handlers=new Map(),listeners=new Map();
 const ctx={Game:{state},Omega:{CanonicalIdentity:{resolveCountry(v){const x=String(v||'').toUpperCase();return{id:x,iso3:x};}}},
 OmegaCanonicalIdentityRegistry:{resolveCountry(v){const x=String(v||'').toUpperCase();return{id:x,iso3:x};}},
 CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
 addEventListener(type,fn){const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a);},
 dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e);return true;},
 OmegaGlobalMarket:{productCatalog(){return[{id:'coal',name:'Coal',productType:'RAW_RESOURCE',unit:'tonne'}];},
 describeProduct(r){return r==='coal'?{id:r,name:'Coal',productType:'RAW_RESOURCE',unit:'tonne'}:{id:r,name:r,productType:'UNCLASSIFIED',catalogAuthority:'UNCLASSIFIED_LEGACY_IDENTITY'};},
 localPrice(c,r){return c==='SAU'&&r==='coal'?100:null;},suppliers(){return[];}},
 OmegaGlobalTrade:{inventory(c,r){return c==='SAU'&&r==='coal'?{stock:100,reserve:10,production:0}:{stock:0,reserve:0,production:0};},
 marketPrice(c,r){return c==='SAU'&&r==='coal'?100:null;},currencyOf(){return'USD';},
 createRequest(c,p){this.lastRequest={country:c,payload:p};return{accepted:true,request:{...p,status:'SENT'}};}},
 OmegaResourceStrategicPolicyRuntime:{
 isResourceEmbargoed(b,s,r){return b==='BGD'&&s==='SAU'&&r==='coal'?{blocked:true,policies:[{policyId:'EMB-BGD-SAU',issuerCountryId:'BGD'}]}:{blocked:false,policies:[]};},
 evaluateExportDirective(){return{allowed:false,reason:'STATE_DIRECTIVE_EXPORT_RESTRICTED',policies:['DIR-SAU-COAL']};},
 isRouteBlocked(){return{blocked:false};}},
 OmegaGovernmentBanking:{getCountryPolicy(){return{importTariffPct:30};}},
 OmegaMinistryInteroperability:{registerAction(){},registerCommandHandler(t,o,h){handlers.set(t,{owner:o,handler:h});},
 dispatchCommand(o,t,c,p){const r=handlers.get(t);if(!r)return{status:'UNHANDLED',result:{accepted:false,reason:'NO_HANDLER'}};
 const tx={get(path){const ps=String(path).split('.'),domain=ps.shift();let v=state[domain]?.[c];for(const k of ps){if(v==null)return undefined;v=v[k];}return v;},
 set(path,val){const ps=String(path).split('.'),domain=ps.shift();state[domain]=state[domain]||{};state[domain][c]=state[domain][c]||{};if(!ps.length){state[domain][c]=val;return;}let v=state[domain][c];for(const k of ps.slice(0,-1)){v[k]=v[k]||{};v=v[k];}v[ps.at(-1)]=val;}};
 const result=r.handler({payload:p},{countryId:c,stateTransaction:tx});return{status:result?.accepted===false?'REJECTED':'APPLIED',result};},
 emitEvent(t,c,o,p){for(const fn of listeners.get(t)||[])fn({detail:{eventType:t,countryId:c,payload:p}});}}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'omega_black_market_system_v1.js'});return{ctx,state,handlers};
}
test('offers use canonical products and observed stock, warehouse and protected reserve',()=>{
 const h=makeHarness(),r=h.ctx.OmegaBlackMarket.getOffers('BGD','coal',10);
 assert.equal(r.status,'READY');assert.equal(r.offers.length,1);assert.equal(r.offers[0].availableQuantity,90);
 assert.equal(r.offers[0].legalMarketAvailable,false);assert.equal(r.offers[0].legalLandedTotal,null);
 assert.ok(r.offers[0].unitPrice>r.offers[0].benchmarkUnitPrice);
 assert.equal(r.offers[0].sellerMotiveCode,'STATE_DIRECTED_EXPORT_REVENUE');
 assert.match(r.offers[0].sellerMotiveReason,/state supply directive or export restriction/i);
 assert.equal(r.offers[0].buyerMotiveCode,'PLAYER_SELECTED_NEED_NOT_VERIFIED',
  'a country must not be assigned an invented shortage motive when demand evidence is absent');
});
test('covert order stores a permit and sends the same quantity, price and zero-tariff instruction into Global Trade',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket,o=api.getOffers('BGD','coal',10).offers[0];
 const r=api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:o.offerId});
 assert.equal(r.accepted,true,JSON.stringify(r));const d=h.state.trade.BGD.blackMarketDeals[0];
 assert.equal(d.status,'SENT');assert.equal(d.importTariffPct,0);assert.ok(d.permitId);
 assert.equal(h.ctx.OmegaGlobalTrade.lastRequest.payload.blackMarketDealId,d.dealId);
 assert.equal(h.ctx.OmegaGlobalTrade.lastRequest.payload.importTariffPct,0);
 assert.equal(api.validateAuthorization(d.dealId,{buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,unitPrice:d.unitPrice,blackMarketPermitId:d.permitId}).verified,true);
 assert.equal(api.validateAuthorization(d.dealId,{buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:11,unitPrice:d.unitPrice,blackMarketPermitId:d.permitId}),null);
 assert.equal(api.validateAuthorization(d.dealId,{buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,unitPrice:d.unitPrice}),null,'permit must be mandatory');
 assert.equal(api.validateAuthorization(d.dealId,{buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,unitPrice:d.unitPrice,blackMarketPermitId:'FORGED-PERMIT'}),null,'permit must match exact persisted deal');
});
test('foreign enforcement response is idempotent and records the issuer diplomatic adjustment',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket,o=api.getOffers('BGD','coal',10).offers[0];
 api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:o.offerId});
 const response={responseId:'BM-RESPONSE-1',caseId:'BM-CASE-1',targetCountryId:'BGD',sourceCountryId:'SAU',responseType:'ENHANCED_INSPECTION_AND_DIPLOMATIC_PROTEST',severity:'HIGH'};
 const m=h.ctx.OmegaMinistryInteroperability;
 assert.equal(m.dispatchCommand('foreign','OMEGA_BLACK_MARKET_RECORD_RESPONSE','SAU',{response}).status,'APPLIED');
 assert.equal(h.state.foreign.SAU.blackMarketResponses.length,1);assert.equal(h.state.foreign.SAU.relationAdjustments.BGD[0].delta,-8);
 assert.equal(m.dispatchCommand('foreign','OMEGA_BLACK_MARKET_RECORD_RESPONSE','SAU',{response}).result.duplicate,true);
});
test('war and route blockades remain hard prohibitions',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket;h.state.foreign.BGD.relations.SAU.war_state=true;
 assert.equal(api.getOffers('BGD','coal',10).offers.length,0);h.state.foreign.BGD.relations.SAU.war_state=false;
 h.ctx.OmegaResourceStrategicPolicyRuntime.isRouteBlocked=()=>({blocked:true});assert.equal(api.getOffers('BGD','coal',10).offers.length,0);
});
test('deal creation never creates stock, treasury cash or new commodity identities',()=>{
 const h=makeHarness(),before=JSON.stringify({resource:h.state.resource,finance:h.state.finance}),ids=h.ctx.OmegaGlobalMarket.productCatalog().map(x=>x.id);
 const api=h.ctx.OmegaBlackMarket,o=api.getOffers('BGD','coal',10).offers[0];
 api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:o.offerId});
 assert.equal(JSON.stringify({resource:h.state.resource,finance:h.state.finance}),before);
 assert.deepEqual(h.ctx.OmegaGlobalMarket.productCatalog().map(x=>x.id),ids);
});
test('covert settlement waits for origin and destination transit inspections',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket,offer=api.getOffers('BGD','coal',10).offers[0];
 const made=api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:offer.offerId});
 assert.equal(made.accepted,true,JSON.stringify(made));
 const deal=h.state.trade.BGD.blackMarketDeals[0];deal.detectionProbability=0;
 let settlements=0;
 h.ctx.OmegaGlobalTrade.settleBlackMarketTransit=input=>{
  settlements++;
  h.ctx.dispatchEvent(new h.ctx.CustomEvent('OMEGA_TRADE_SETTLEMENT_COMPLETED',{detail:{payload:{
   destinationCountryId:'BGD',sourceCountryId:'SAU',buyerCountryId:'BGD',blackMarketDealId:input.dealId,
   requestId:input.requestId,resourceId:'coal',quantity:10,buyerValue:1000,buyerCurrency:'USD',settlementId:'SETTLE-TRANSIT-1',
   createdBatchIds:[]
  }}}));
  return{accepted:true,status:'SETTLED',settlementId:'SETTLE-TRANSIT-1'};
 };
 const started=api.startTransit({countryId:'BGD',buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,
  unitPrice:deal.unitPrice,requestId:deal.requestId,blackMarketDealId:deal.dealId,blackMarketPermitId:deal.permitId});
 assert.equal(started.accepted,true,JSON.stringify(started));
 assert.equal(started.transit.route.length,2);
 assert.equal(h.state.trade.BGD.blackMarketTransits[0].status,'IN_TRANSIT');
 assert.equal(h.state.trade.SAU.blackMarketTransitReservations[0].status,'ACTIVE');
 h.state.simulation.turn=8;
 const origin=api.advanceTransits();
 assert.equal(origin.advanced,1);assert.equal(origin.settled,0);
 assert.equal(settlements,0,'origin clearance cannot settle the cargo');
 assert.equal(h.state.trade.BGD.blackMarketTransits[0].timeline[0].checkpoint,'EXPORT_CLEARANCE');
 h.state.simulation.turn=9;
 const destination=api.advanceTransits();
 assert.equal(destination.advanced,1);assert.equal(destination.settled,1);
 assert.equal(settlements,1,'settlement occurs only after the destination checkpoint');
 assert.equal(h.state.trade.BGD.blackMarketTransits[0].status,'SETTLED');
 assert.equal(h.state.trade.BGD.blackMarketTransits[0].timeline[1].checkpoint,'IMPORT_CLEARANCE');
 assert.equal(h.state.trade.BGD.blackMarketDeals[0].status,'SETTLED');
 assert.equal(h.state.trade.SAU.blackMarketTransitReservations[0].status,'RELEASED');
});

test('covert permits expire on the game clock and cannot be replayed',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket,offer=api.getOffers('BGD','coal',10).offers[0];
 const made=api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:offer.offerId});
 assert.equal(made.accepted,true,JSON.stringify(made));
 const deal=h.state.trade.BGD.blackMarketDeals[0];
 const scope={buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,unitPrice:deal.unitPrice,blackMarketPermitId:deal.permitId};
 assert.equal(api.validateAuthorization(deal.dealId,scope).verified,true);
 h.state.simulation.turn=deal.expiresTurn+1;
 assert.equal(api.validateAuthorization(deal.dealId,scope),null);
 h.ctx.dispatchEvent(new h.ctx.CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED',{detail:{simulationTurn:h.state.simulation.turn}}));
 assert.equal(h.state.trade.BGD.blackMarketDeals[0].status,'EXPIRED');
 assert.equal(api.validateAuthorization(deal.dealId,scope),null);
});
test('Global Trade keeps permit verification, interception, route and strategic-stock guards wired',()=>{
 assert.match(tradeSource,/blackMarketDealFor/);assert.match(tradeSource,/BLACK_MARKET_INTERCEPTED/);
 assert.match(tradeSource,/blackMarketPermitId/);assert.match(tradeSource,/RESOURCE_ROUTE_BLOCKADE_ACTIVE/);
 assert.match(tradeSource,/STRATEGIC_STOCKPILE_PROTECTED/);
});

test('unclassified fallback identities cannot be used to create Black Market offers',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket;
 const r=api.getOffers('BGD','invented_resource',1);
 assert.equal(r.status,'UNAVAILABLE');
 assert.equal(r.reason,'CANONICAL_MARKET_PRODUCT_NOT_FOUND');
});
test('post-settlement discovery collects a Treasury fine and seizes only unsold imported warehouse batches',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket,o=api.getOffers('BGD','coal',10).offers[0];
 const made=api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:o.offerId});
 assert.equal(made.accepted,true,JSON.stringify(made));
 const pendingDeal=h.state.trade.BGD.blackMarketDeals[0];
 const transition=h.ctx.OmegaMinistryInteroperability.dispatchCommand('trade','OMEGA_BLACK_MARKET_UPDATE_DEAL','BGD',{
  dealId:pendingDeal.dealId,patch:{status:'SETTLED_UNDER_INVESTIGATION',settlementId:'SETTLE-1',settledQuantity:10,
   buyerSettlementValue:1000,buyerCurrency:'USD',createdBatchIds:['IMPORT-BATCH-1']}});
 assert.equal(transition.status,'APPLIED',JSON.stringify(transition));
 const deal=api.getDeal(pendingDeal.dealId,'BGD');
 h.state.resource.BGD.inventory={coal:10};
 h.state.resource.BGD.warehouse={warehouseId:'WH-BGD-RAW',availableByResource:{coal:10},reservedByResource:{coal:2}};
 h.state.resource.BGD.processedWarehouse={warehouseId:'WH-BGD-PROCESSED',availableByResource:{},reservedByResource:{}};
 h.state.resource.BGD.batches=[{batchId:'IMPORT-BATCH-1',resourceId:'coal',quantity:10,remainingQuantity:10,
  stage:'RAW_EXTRACTED',status:'AVAILABLE',warehouseId:'WH-BGD-RAW',transferReference:'SETTLE-1',
  provenance:{settlementId:'SETTLE-1'}}];
 h.state.resource.BGD.inventoryLots={'IMPORT-BATCH-1':{batchId:'IMPORT-BATCH-1',resourceId:'coal',quantity:10,
  remainingQuantity:10,status:'AVAILABLE',warehouseId:'WH-BGD-RAW'}};
 const result=api.enforcePostSettlement(deal,{settlementId:'SETTLE-1',quantity:10,buyerValue:1000,buyerCurrency:'USD',
  createdBatchIds:['IMPORT-BATCH-1']},{caseId:'BM-CASE-ENFORCEMENT'});
 assert.equal(result.accepted,true,JSON.stringify(result));
 assert.equal(result.enforcement.fineRate,.32);
 assert.equal(result.enforcement.fineDue,320);
 assert.equal(result.enforcement.finePaid,320);
 assert.equal(result.enforcement.fineOutstanding,0);
 assert.equal(result.enforcement.seizureTargetQuantity,5.1);
 assert.equal(result.enforcement.seizureQuantity,5.1);
 assert.equal(h.state.finance.BGD.available,999680);
 assert.equal(h.state.resource.BGD.inventory.coal,4.9);
 assert.equal(h.state.resource.BGD.warehouse.availableByResource.coal,4.9);
 assert.equal(h.state.resource.BGD.batches[0].remainingQuantity,4.9);
 assert.equal(h.state.resource.BGD.inventoryLots['IMPORT-BATCH-1'].remainingQuantity,4.9);
 const repeat=api.enforcePostSettlement(deal,{settlementId:'SETTLE-1',quantity:10,buyerValue:1000,buyerCurrency:'USD',
  createdBatchIds:['IMPORT-BATCH-1']},{caseId:'BM-CASE-ENFORCEMENT'});
 assert.equal(repeat.seizure.duplicate,true);
 assert.equal(h.state.finance.BGD.available,999680,'the same fine must never be collected twice');
 assert.equal(h.state.resource.BGD.inventory.coal,4.9,'the same cargo must never be seized twice');
});
test('unpaid enforcement fines remain outstanding and collect only when later Treasury liquidity exists',()=>{
 const h=makeHarness(),m=h.ctx.OmegaMinistryInteroperability;
 h.state.finance.BGD.available=0;
 h.state.trade.BGD.blackMarketDeals=[{dealId:'BM-DEAL-DEFERRED',buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:1,
  settledQuantity:1,status:'SETTLED_UNDER_INVESTIGATION',settlementId:'SETTLE-DEFERRED',buyerSettlementValue:1250,buyerCurrency:'USD',
  embargoedAtCreation:false,exportRestrictionReason:'STATE_DIRECTIVE_EXPORT_RESTRICTED',createdBatchIds:[]}];
 const first=m.dispatchCommand('finance','OMEGA_BLACK_MARKET_COLLECT_FINE','BGD',{fine:{
  fineId:'BM-FINE-DEFERRED',dealId:'BM-DEAL-DEFERRED',settlementId:'SETTLE-DEFERRED',amountDue:125,currency:'USD'}});
 assert.equal(first.status,'APPLIED');
 assert.equal(first.result.fine.amountPaid,0);
 assert.equal(first.result.fine.amountOutstanding,125);
 h.state.finance.BGD.available=50;
 h.ctx.dispatchEvent(new h.ctx.CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED',{detail:{simulationTurn:8}}));
 const history=h.state.finance.BGD.blackMarketEnforcementHistory;
 assert.equal(history[0].amountPaid,50);
 assert.equal(history[0].amountOutstanding,75);
 assert.equal(h.state.finance.BGD.available,0);
 h.state.finance.BGD.available=100;
 h.ctx.dispatchEvent(new h.ctx.CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED',{detail:{simulationTurn:9}}));
 assert.equal(h.state.finance.BGD.blackMarketEnforcementHistory[0].amountPaid,125);
 assert.equal(h.state.finance.BGD.blackMarketEnforcementHistory[0].amountOutstanding,0);
 assert.equal(h.state.finance.BGD.blackMarketEnforcementHistory[0].status,'PAID');
 assert.equal(h.state.finance.BGD.available,25);
});
test('outstanding fines for autonomous NPC importers retry on later player-country turns',()=>{
 const h=makeHarness();
 h.state.trade.IRN={blackMarketDeals:[{dealId:'BM-NPC-IRN-SAU-T9-coal',buyerCountryId:'IRN',sellerCountryId:'SAU',
  resourceId:'coal',quantity:2,settledQuantity:2,status:'SETTLED_UNDER_INVESTIGATION',settlementId:'SETTLE-NPC-9',
  buyerSettlementValue:1000,buyerCurrency:'USD',exportRestrictionReason:'STATE_DIRECTIVE_EXPORT_RESTRICTED',autonomousNetwork:true}]};
 h.state.finance.IRN={available:40,blackMarketEnforcementHistory:[{fineId:'BM-FINE-NPC-9',dealId:'BM-NPC-IRN-SAU-T9-coal',
  settlementId:'SETTLE-NPC-9',amountDue:100,amountPaid:0,amountOutstanding:100,currency:'USD',status:'WAITING_LIQUIDITY'}]};
 h.state.simulation.turn=10;
 h.ctx.dispatchEvent(new h.ctx.CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED',{detail:{simulationTurn:10}}));
 let fine=h.state.finance.IRN.blackMarketEnforcementHistory[0];
 assert.equal(fine.amountPaid,40);
 assert.equal(fine.amountOutstanding,60);
 assert.equal(h.state.finance.IRN.available,0);
 h.state.finance.IRN.available=80;h.state.simulation.turn=11;
 h.ctx.dispatchEvent(new h.ctx.CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED',{detail:{simulationTurn:11}}));
 fine=h.state.finance.IRN.blackMarketEnforcementHistory[0];
 assert.equal(fine.amountPaid,100);
 assert.equal(fine.amountOutstanding,0);
 assert.equal(fine.status,'PAID');
 assert.equal(h.state.finance.IRN.available,20);
});

test('export-restriction policy issuers receive a foreign response when a covert shipment is intercepted',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket;
 h.state.trade.SAU.stateSupplyDirectives=[{policyId:'DIR-SAU-COAL',issuerCountryId:'SAU',status:'ACTIVE'}];
 const o=api.getOffers('BGD','coal',10).offers[0];
 const made=api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:o.offerId});
 assert.equal(made.accepted,true,JSON.stringify(made));
 const deal=h.state.trade.BGD.blackMarketDeals[0];
 const result=api.handleTradeRejection({blackMarketDealId:deal.dealId,countryId:'BGD',targetCountryId:'SAU',
  resourceId:'coal',quantity:10,unitPrice:deal.unitPrice,blackMarketPermitId:deal.permitId},{reason:'BLACK_MARKET_INTERCEPTED'});
 assert.equal(result.status,'INTERCEPTED');
 assert.equal(h.state.foreign.SAU.blackMarketResponses.length,1);
 assert.equal(h.state.foreign.SAU.blackMarketResponses[0].policyIds.includes('DIR-SAU-COAL'),true);
 assert.equal(h.state.foreign.SAU.relationAdjustments.BGD[0].delta,-8);
});


test('shipment thresholds scale with the share of verified seller free stock and penalties increase with size', () => {
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket;
 const cases=[[0.89,'MICRO'],[2.6,'SMALL'],[7,'MODERATE'],[13,'LARGE'],[14,'CRITICAL']];
 let previousFine=0,previousSeizure=0,previousDetection=0;
 for(const [quantity,band] of cases){
  const offer=api.getOffers('BGD','coal',quantity).offers[0];
  assert.equal(offer.shipmentSizeBand,band);
  assert.ok(offer.sellerStockExposurePct>0);
  assert.ok(offer.fineRate>=previousFine);
  assert.ok(offer.seizureRate>=previousSeizure);
  assert.ok(offer.detectionProbability>=previousDetection);
  previousFine=offer.fineRate;previousSeizure=offer.seizureRate;previousDetection=offer.detectionProbability;
 }
 assert.deepEqual(cases.map(x=>x[1]),['MICRO','SMALL','MODERATE','LARGE','CRITICAL']);
});

test('repeat attempts within ten turns increase scrutiny and penalty rates', () => {
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket;
 h.state.trade.BGD.blackMarketDeals=[
  {dealId:'OLD-1',sellerCountryId:'SAU',resourceId:'coal',createdTurn:2,status:'FAILED'},
  {dealId:'OLD-2',sellerCountryId:'SAU',resourceId:'coal',createdTurn:3,status:'INTERCEPTED'},
  {dealId:'OLD-3',sellerCountryId:'SAU',resourceId:'coal',createdTurn:4,status:'EXPIRED'}
 ];
 const offer=api.getOffers('BGD','coal',10).offers[0];
 assert.equal(offer.repeatAttempts10Turns,3);
 assert.ok(offer.detectionProbability>.2);
 assert.ok(offer.fineRate>.29);
 assert.ok(offer.seizureRate>.45);
});

test('pre-dispatch interception records an investigation, charges an attempt fine and does not seize buyer inventory', () => {
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket;
 h.state.trade.SAU.stateSupplyDirectives=[{policyId:'DIR-SAU-COAL',issuerCountryId:'SAU',status:'ACTIVE'}];
 const offer=api.getOffers('BGD','coal',10).offers[0];
 const made=api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:offer.offerId});
 assert.equal(made.accepted,true,JSON.stringify(made));
 const deal=api.getDeal(made.deal.dealId,'BGD');
 const before=JSON.stringify(h.state.resource.BGD);
 const result=api.handleTradeRejection({countryId:'BGD',buyerCountryId:'BGD',targetCountryId:'SAU',
  resourceId:'coal',quantity:10,unitPrice:deal.unitPrice,blackMarketDealId:deal.dealId,
  blackMarketPermitId:deal.permitId},{reason:'BLACK_MARKET_INTERCEPTED',stage:'ORIGIN_INSPECTION'});
 assert.equal(result.status,'INTERCEPTED');
 assert.equal(result.case.cargoDisposition,'STOPPED_BEFORE_IMPORT_NO_BUYER_STOCK_SEIZED');
 assert.equal(result.attemptEnforcement.accepted,true);
 assert.ok(result.attemptEnforcement.amountDue>0);
 assert.ok(result.attemptEnforcement.amountPaid>0);
 assert.equal(h.state.trade.BGD.blackMarketDeals[0].status,'INTERCEPTED');
 assert.equal(h.state.finance.BGD.blackMarketEnforcementHistory[0].status,'PAID');
 assert.equal(JSON.stringify(h.state.resource.BGD),before,'a shipment stopped before import must not create or seize buyer inventory');
 assert.equal(h.state.foreign.SAU.blackMarketResponses[0].severity,'HIGH');
 assert.equal(h.state.foreign.SAU.relationAdjustments.BGD[0].delta,-8);
});
