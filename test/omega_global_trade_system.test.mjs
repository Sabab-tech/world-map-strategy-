import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.Game={state:{
  simulation:{turn:1},
  cabinet:{BGD:{autonomyReservations:[]},SAU:{autonomyReservations:[]}},
  finance:{BGD:{available:200000,reserves:200000,currencyCode:'USD'},SAU:{available:100000,reserves:100000,currencyCode:'USD'}},
  economy:{BGD:{gdp:1000000,debt:100000},SAU:{gdp:2000000,debt:100000}},
  population:{BGD:{labor:{available:10000}},SAU:{labor:{available:10000}}},
  resource:{
    BGD:{inventory:{crude_oil:0},reserves:{crude_oil:0},production:{crude_oil:0},
      batches:[],inventoryLots:{},
      warehouse:{warehouseId:'WH-BGD-RAW',countryId:'BGD',type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',locationNodeKey:'WAREHOUSE:BGD:RAW',status:'OPERATIONAL',availableByResource:{},reservedByResource:{},storedBatchIds:[],receipts:[]},
      processedWarehouse:{warehouseId:'WH-BGD-PROCESSED',countryId:'BGD',type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',locationNodeKey:'WAREHOUSE:BGD:PROCESSED',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[]}},
    SAU:{inventory:{crude_oil:5000},reserves:{crude_oil:500},production:{crude_oil:500},
      batches:[{batchId:'MINE-SAU-GHAWAR-RAW-1',siteReferenceKey:'SITE_SAU_ghawar_oil_field',siteId:'SITE_SAU_ghawar_oil_field',occurrenceKey:'SITE_OCC:SAU:ghawar',resourceId:'crude_oil',materialIdentity:'crude_oil',quantity:5000,remainingQuantity:5000,unit:'BARRELS',stage:'RAW_EXTRACTED',countryId:'SAU',sourceCountryId:'SAU',originCountryId:'SAU',ownerCountryCode:'SAU',destinationCountryId:'SAU',warehouseId:'WH-SAU-RAW',provenance:{sourceAuthority:'SIMULATED_TEST_FIXTURE',quantityAuthority:'SIMULATED'}}],
      inventoryLots:{'MINE-SAU-GHAWAR-RAW-1':{batchId:'MINE-SAU-GHAWAR-RAW-1',resourceId:'crude_oil',quantity:5000,remainingQuantity:5000,unit:'BARRELS',stage:'RAW_EXTRACTED',countryId:'SAU',warehouseId:'WH-SAU-RAW',status:'AVAILABLE',provenance:{sourceAuthority:'SIMULATED_TEST_FIXTURE'}}},
      warehouse:{warehouseId:'WH-SAU-RAW',countryId:'SAU',type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',locationNodeKey:'WAREHOUSE:SAU:RAW',status:'OPERATIONAL',availableByResource:{crude_oil:5000},reservedByResource:{},storedBatchIds:['MINE-SAU-GHAWAR-RAW-1'],receipts:[]},
      processedWarehouse:{warehouseId:'WH-SAU-PROCESSED',countryId:'SAU',type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',locationNodeKey:'WAREHOUSE:SAU:PROCESSED',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[]}}
  },
  foreign:{BGD:{relations:{SAU:{overall:80,trade:90,political:75,trust:70,trade_agreement:true,sanctions:false,war_state:false}},treaties:{}},SAU:{relations:{BGD:{overall:80,trade:90,political:75,trust:70,trade_agreement:true,sanctions:false,war_state:false}},treaties:{}}},
  trade:{
    BGD:{marketPrice:{crude_oil:100},routeCapacity:{crude_oil:5000},importRequests:[{requestId:'REQ-1',countryId:'BGD',targetCountryId:'SAU',resourceId:'crude_oil',quantity:1000,unitPrice:95,totalValue:95000,status:'SENT',stage:'COUNTERPARTY_DECISION_PENDING',createdTurn:1}]},
    SAU:{marketPrice:{crude_oil:100},routeCapacity:{crude_oil:5000}}
  }
}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=type;this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){const t=new EventTarget();globalThis.dispatchEvent=t.dispatchEvent.bind(t);globalThis.addEventListener=t.addEventListener.bind(t);}
await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const bridge=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await bridge.init();
globalThis.ResourceMinistryEngine={getIntegratedResourceState(countryId){return globalThis.Game.state.resource[countryId];}};
await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');
await import('../omega_opponent_deep_memory_system.js');
globalThis.OmegaResourceStrategicPolicyRules=JSON.parse(fs.readFileSync(new URL('../resource_strategic_policy_rules_v1.json',import.meta.url),'utf8'));
await import('../omega_resource_strategic_policy_runtime_v1.js');
globalThis.Omega = globalThis.Omega || {};
const scheduledTradeHandlers = new Map();
globalThis.Omega.WorldSimulationScheduler = {
  registerCountryHandler(id, handler, options) {
    scheduledTradeHandlers.set(id, { handler, options });
    return () => scheduledTradeHandlers.delete(id);
  }
};
await import('../omega_global_trade_system.js');
await import('../omega_opponent_second_order_consequence_system.js');

const trade=globalThis.OmegaGlobalTrade;
assert.equal(trade.diagnostics().handlerInstalled,true,JSON.stringify(trade.diagnostics()));
assert.equal(trade.diagnostics().schedulerHandlerRegistered,true,JSON.stringify(trade.diagnostics()));
assert.equal(trade.diagnostics().autonomousCountryRequestCap,24);
const scheduledTrade = scheduledTradeHandlers.get('omega.global-trade.country-autonomy');
assert.ok(scheduledTrade,'NPC trade processing must use the shared country scheduler');
assert.deepEqual(scheduledTrade.options.tiers,['ACTIVE','MACRO']);
assert.equal(scheduledTrade.options.priority,80);
const scheduledNpcTrade = scheduledTrade.handler('SAU',{turn:1,state:globalThis.Game.state});
assert.equal(scheduledNpcTrade.status,'COMPLETED');
assert.equal(scheduledNpcTrade.requestLimit,24);
assert.equal(scheduledTrade.handler('SAU',{turn:1,state:globalThis.Game.state}).status,'ALREADY_UPDATED');
trade.processAll();
const req=globalThis.Game.state.trade.BGD.importRequests[0];
assert.equal(req.status,'SETTLED',JSON.stringify({processTrace:globalThis.__OMEGA_LAST_TRADE_PROCESS_TRACE,settlementTrace:globalThis.__OMEGA_SETTLEMENT_TRACE,request:req,resource:globalThis.Game.state.resource,finance:globalThis.Game.state.finance}));
assert.equal(globalThis.Game.state.resource.BGD.inventory.crude_oil,1000);
assert.equal(globalThis.Game.state.resource.SAU.inventory.crude_oil,4000);
assert.equal(globalThis.Game.state.resource.SAU.batches[0].remainingQuantity,4000);
assert.equal(globalThis.Game.state.resource.SAU.inventoryLots['MINE-SAU-GHAWAR-RAW-1'].remainingQuantity,4000);
assert.equal(globalThis.Game.state.resource.SAU.warehouse.availableByResource.crude_oil,4000);
assert.equal(globalThis.Game.state.resource.BGD.warehouse.availableByResource.crude_oil,1000);
assert.equal(globalThis.Game.state.resource.BGD.batches.length,1);
const importedBatch=globalThis.Game.state.resource.BGD.batches[0];
assert.equal(importedBatch.sourceCountryId,'SAU');
assert.equal(importedBatch.destinationCountryId,'BGD');
assert.equal(importedBatch.sourceBatchIds.includes('MINE-SAU-GHAWAR-RAW-1'),true);
assert.equal(importedBatch.sourceSiteId,'SITE_SAU_ghawar_oil_field');
assert.equal(globalThis.Game.state.resource.BGD.inventoryLots[importedBatch.batchId].remainingQuantity,1000);
assert.ok(globalThis.Game.state.resource.BGD.warehouse.receipts.some(x=>x.batchId===importedBatch.batchId&&x.sourceCountryId==='SAU'));
assert.equal(globalThis.Game.state.finance.BGD.available,105000);
assert.equal(globalThis.Game.state.finance.SAU.available,195000);
assert.equal(globalThis.Game.state.trade.BGD.balance,-95000);
assert.equal(globalThis.Game.state.trade.SAU.balance,95000);
assert.equal(globalThis.Game.state.trade.BGD.importValue,95000);
assert.equal(globalThis.Game.state.trade.SAU.exportValue,95000);
const settlementSnapshot={
  buyerBalance:globalThis.Game.state.trade.BGD.balance,buyerImport:globalThis.Game.state.trade.BGD.importValue,
  sellerBalance:globalThis.Game.state.trade.SAU.balance,sellerExport:globalThis.Game.state.trade.SAU.exportValue,
  buyerCash:globalThis.Game.state.finance.BGD.available,sellerCash:globalThis.Game.state.finance.SAU.available
};
const mesh=globalThis.Omega?.MinistryInteroperability||globalThis.OmegaMinistryInteroperability;
assert.ok(mesh?.dispatchCommand,'ministry command mesh is required for duplicate settlement verification');
const duplicateBuyerClose=mesh.dispatchCommand('trade','OMEGA_TRADE_CLOSE_REQUEST','BGD',{
  requestId:req.requestId,status:'SETTLED',stage:'SETTLED',settlementId:req.settlementId,buyerValue:95000,sellerValue:95000
});
assert.equal(duplicateBuyerClose.status,'APPLIED',JSON.stringify(duplicateBuyerClose));
assert.equal(duplicateBuyerClose.result?.duplicate,true,'same buyer settlement ID must not book twice');
const duplicateSellerLedger=mesh.dispatchCommand('trade','OMEGA_TRADE_RECORD_SELLER_SETTLEMENT','SAU',{
  settlementId:req.settlementId,requestId:req.requestId,buyerCountryId:'BGD',resourceId:'crude_oil',
  quantity:req.quantity,unitPrice:req.unitPrice,totalValue:95000,buyerValue:95000,status:'SETTLED',turn:1
});
assert.equal(duplicateSellerLedger.status,'APPLIED',JSON.stringify(duplicateSellerLedger));
assert.equal(duplicateSellerLedger.result?.duplicate,true,'same seller settlement ID must not book twice');
assert.deepEqual({
  buyerBalance:globalThis.Game.state.trade.BGD.balance,buyerImport:globalThis.Game.state.trade.BGD.importValue,
  sellerBalance:globalThis.Game.state.trade.SAU.balance,sellerExport:globalThis.Game.state.trade.SAU.exportValue,
  buyerCash:globalThis.Game.state.finance.BGD.available,sellerCash:globalThis.Game.state.finance.SAU.available
},settlementSnapshot,'duplicate settlement events must not change trade balances or treasury cash');

// An active bilateral delivery reserves its promised seller stock from unrelated Open Market requests.
globalThis.Game.state.trade.SAU.bilateralContracts=[{
  agreementId:'BTA-RESERVE-REGRESSION',proposalId:'BTP-RESERVE-REGRESSION',
  partnerCountryId:'BGD',buyerCountryId:'BGD',sellerCountryId:'SAU',role:'SELLER',
  resourceId:'crude_oil',quantityPerDelivery:5000,unitPrice:100,intervalDays:30,
  nextDeliveryTurn:globalThis.Game.state.simulation.turn,status:'ACTIVE',currentRequestId:null
}];
const reservedOpenMarketReview=trade.reviewRequest({
  requestId:'REQ-OPEN-MARKET-RESERVED',countryId:'BGD',targetCountryId:'SAU',
  resourceId:'crude_oil',quantity:100,unitPrice:100,createdTurn:globalThis.Game.state.simulation.turn
});
assert.equal(reservedOpenMarketReview.decision,'REJECT',JSON.stringify(reservedOpenMarketReview));
assert.equal(reservedOpenMarketReview.reason,'BILATERAL_CONTRACT_RESERVED_SUPPLY');
assert.equal(reservedOpenMarketReview.bilateralContractReserve.quantity,5000);
const ordinaryPending=globalThis.Game.state.trade.BGD.importRequests.find(x=>x.requestId==='REQ-UI-CREATE');
if(ordinaryPending){ordinaryPending.status='REJECTED';ordinaryPending.stage='TEST_HOLD';}
globalThis.Game.state.trade.BGD.importRequests.push({requestId:'REQ-REJECT',countryId:'BGD',targetCountryId:'SAU',resourceId:'crude_oil',quantity:100000,status:'SENT',stage:'COUNTERPARTY_DECISION_PENDING',createdTurn:1,unitPrice:100});
globalThis.Game.state.foreign.BGD.relations.SAU.trade_agreement=false;
trade.processAll();
assert(globalThis.Game.state.foreign.BGD.relationAdjustments?.SAU?.length>=1);
const pressured=globalThis.Game.state.trade.BGD.importRequests.find(x=>x.requestId==='REQ-REJECT');
assert.equal(pressured?.status,'REJECTED',JSON.stringify(pressured));
assert.equal(pressured?.stage,'PRESSURE_WAIT','rejected requests must wait for their configured retry turn');
assert.ok(Number(pressured?.nextRetryTurn)>Number(globalThis.Game.state.simulation.turn));
assert(globalThis.Game.state.trade.BGD.globalTradeLedger.requests.some(x=>x.requestId==='REQ-REJECT'&&x.status==='RETRY_SCHEDULED'));
globalThis.Game.state.simulation.turn=Number(pressured.nextRetryTurn);
trade.processAll();
assert(globalThis.Game.state.trade.BGD.importRequests.some(x=>x.stage==='POLITICAL_PRESSURE_RETRY'&&x.previousRequestId==='REQ-REJECT'),
  'scheduled retry must create a new pressure-aware request after the cooldown');
const policy=globalThis.Omega?.ResourceStrategicPolicyRuntime||globalThis.OmegaResourceStrategicPolicyRuntime;
globalThis.Game.state.foreign.BGD.relations.SAU.trade_agreement=true;
globalThis.Game.state.foreign.SAU.relations.BGD.trade_agreement=true;
globalThis.Game.state.resource.BGD.inventory.crude_oil=1000;
globalThis.Game.state.resource.SAU.inventory.crude_oil=4000;
const embargoResult=policy.declareEmbargo('BGD',{targetCountryId:'SAU',resourceId:'crude_oil',direction:'IMPORT',policyId:'TRADE-EMBARGO-E2E'});
assert.equal(embargoResult.accepted,true,JSON.stringify(embargoResult));
const beforeEmbargo={
  buyerStock:globalThis.Game.state.resource.BGD.inventory.crude_oil,
  sellerStock:globalThis.Game.state.resource.SAU.inventory.crude_oil,
  buyerCash:globalThis.Game.state.finance.BGD.available,
  sellerCash:globalThis.Game.state.finance.SAU.available,
  buyerImport:globalThis.Game.state.trade.BGD.importValue||0,
  sellerExport:globalThis.Game.state.trade.SAU.exportValue||0
};
globalThis.Game.state.trade.BGD.importRequests.push({
  requestId:'REQ-EMBARGO',countryId:'BGD',targetCountryId:'SAU',resourceId:'crude_oil',quantity:50,
  unitPrice:100,totalValue:5000,status:'SENT',stage:'COUNTERPARTY_DECISION_PENDING',createdTurn:globalThis.Game.state.simulation.turn
});
trade.processAll();
const embargoRequest=globalThis.Game.state.trade.BGD.importRequests.find(x=>x.requestId==='REQ-EMBARGO');
assert.equal(embargoRequest.status,'REJECTED',JSON.stringify({embargoRequest,trace:globalThis.__OMEGA_LAST_TRADE_PROCESS_TRACE}));
assert.equal(embargoRequest.rejectionReason,'RESOURCE_EMBARGO_ACTIVE',JSON.stringify(embargoRequest));
assert.deepEqual({
  buyerStock:globalThis.Game.state.resource.BGD.inventory.crude_oil,
  sellerStock:globalThis.Game.state.resource.SAU.inventory.crude_oil,
  buyerCash:globalThis.Game.state.finance.BGD.available,
  sellerCash:globalThis.Game.state.finance.SAU.available,
  buyerImport:globalThis.Game.state.trade.BGD.importValue||0,
  sellerExport:globalThis.Game.state.trade.SAU.exportValue||0
},beforeEmbargo,'embargo rejection must not move stock or settle money');
assert.equal(policy.liftEmbargo('BGD',{policyId:'TRADE-EMBARGO-E2E'}).accepted,true);

const blockadeResult=policy.declareBlockade('BGD',{targetCountryId:'SAU',resourceId:'crude_oil',modes:['ship'],policyId:'TRADE-BLOCKADE-E2E'});
assert.equal(blockadeResult.accepted,true,JSON.stringify(blockadeResult));
const beforeBlockade={
  buyerStock:globalThis.Game.state.resource.BGD.inventory.crude_oil,
  sellerStock:globalThis.Game.state.resource.SAU.inventory.crude_oil,
  buyerCash:globalThis.Game.state.finance.BGD.available,
  sellerCash:globalThis.Game.state.finance.SAU.available,
  buyerImport:globalThis.Game.state.trade.BGD.importValue||0,
  sellerExport:globalThis.Game.state.trade.SAU.exportValue||0
};
globalThis.Game.state.trade.BGD.importRequests.push({
  requestId:'REQ-BLOCKADE',countryId:'BGD',targetCountryId:'SAU',resourceId:'crude_oil',transportMode:'ship',quantity:50,
  unitPrice:100,totalValue:5000,status:'SENT',stage:'COUNTERPARTY_DECISION_PENDING',createdTurn:globalThis.Game.state.simulation.turn
});
trade.processAll();
const blockadeRequest=globalThis.Game.state.trade.BGD.importRequests.find(x=>x.requestId==='REQ-BLOCKADE');
assert.equal(blockadeRequest.status,'REJECTED',JSON.stringify({blockadeRequest,trace:globalThis.__OMEGA_LAST_TRADE_PROCESS_TRACE}));
assert.equal(blockadeRequest.rejectionReason,'RESOURCE_ROUTE_BLOCKADE_ACTIVE',JSON.stringify(blockadeRequest));
assert.deepEqual({
  buyerStock:globalThis.Game.state.resource.BGD.inventory.crude_oil,
  sellerStock:globalThis.Game.state.resource.SAU.inventory.crude_oil,
  buyerCash:globalThis.Game.state.finance.BGD.available,
  sellerCash:globalThis.Game.state.finance.SAU.available,
  buyerImport:globalThis.Game.state.trade.BGD.importValue||0,
  sellerExport:globalThis.Game.state.trade.SAU.exportValue||0
},beforeBlockade,'blockade rejection must not move stock or settle money');
assert.equal(policy.liftBlockade('BGD',{policyId:'TRADE-BLOCKADE-E2E'}).accepted,true);

// The final physical inventory debit must independently enforce the State's export instruction.
const stateExportBan=policy.setSupplyDirective('SAU',{directive:'DOMESTIC_ONLY',resourceId:'crude_oil',
  policyId:'TRADE-DOMESTIC-ONLY-E2E',reason:'Domestic supply shortage'});
assert.equal(stateExportBan.accepted,true,JSON.stringify(stateExportBan));
const finalDebitSnapshot={
  stock:globalThis.Game.state.resource.SAU.inventory.crude_oil,
  batch:globalThis.Game.state.resource.SAU.batches[0].remainingQuantity,
  warehouse:globalThis.Game.state.resource.SAU.warehouse.availableByResource.crude_oil
};
const deniedFinalDebit=mesh.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_DEBIT','SAU',{
  resourceId:'crude_oil',quantity:10,settlementId:'DIRECT-DOMESTIC-ONLY-DEBIT',
  transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:'DIRECT-DOMESTIC-ONLY-DEBIT',
    sourceCountryId:'SAU',destinationCountryId:'BGD'}
});
assert.equal(deniedFinalDebit.status,'FAILED',JSON.stringify(deniedFinalDebit));
assert.equal(deniedFinalDebit.result?.reason,'STATE_DIRECTIVE_DOMESTIC_ONLY');
assert.deepEqual({
  stock:globalThis.Game.state.resource.SAU.inventory.crude_oil,
  batch:globalThis.Game.state.resource.SAU.batches[0].remainingQuantity,
  warehouse:globalThis.Game.state.resource.SAU.warehouse.availableByResource.crude_oil
},finalDebitSnapshot,'a rejected State directive must not move physical stock');
assert.equal(policy.liftSupplyDirective('SAU',{policyId:'TRADE-DOMESTIC-ONLY-E2E'}).accepted,true);

// A matching government export contract can authorize only its destination and quantity.
const exportContract=policy.setSupplyDirective('SAU',{directive:'GOVERNMENT_EXPORT_CONTRACT',
  resourceId:'crude_oil',policyId:'TRADE-EXPORT-CONTRACT-E2E',contractId:'TRADE-EXPORT-CONTRACT-E2E',
  targetCountryId:'BGD',authorizedQuantity:10});
assert.equal(exportContract.accepted,true,JSON.stringify(exportContract));
const authorizedFinalDebit=mesh.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_DEBIT','SAU',{
  resourceId:'crude_oil',quantity:10,settlementId:'DIRECT-GOV-EXPORT-DEBIT',
  transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:'DIRECT-GOV-EXPORT-DEBIT',
    sourceCountryId:'SAU',destinationCountryId:'BGD',governmentContractId:'TRADE-EXPORT-CONTRACT-E2E'}
});
assert.equal(authorizedFinalDebit.status,'APPLIED',JSON.stringify(authorizedFinalDebit));
assert.equal(authorizedFinalDebit.result?.accepted,true);
assert.equal(globalThis.Game.state.resource.SAU.inventory.crude_oil,finalDebitSnapshot.stock-10);
assert.equal(globalThis.Game.state.trade.SAU.stateDirectiveSettlements.some(x=>
  x.settlementId==='DIRECT-GOV-EXPORT-DEBIT'&&x.contractId==='TRADE-EXPORT-CONTRACT-E2E'),true);
const replayEmbargo=policy.declareEmbargo('SAU',{targetCountryId:'BGD',resourceId:'crude_oil',
  direction:'EXPORT',policyId:'POST-SETTLEMENT-REPLAY-EMBARGO'});
assert.equal(replayEmbargo.accepted,true,JSON.stringify(replayEmbargo));
const exactExportReplay=mesh.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_DEBIT','SAU',{
  resourceId:'crude_oil',quantity:10,settlementId:'DIRECT-GOV-EXPORT-DEBIT',
  transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:'DIRECT-GOV-EXPORT-DEBIT',
    sourceCountryId:'SAU',destinationCountryId:'BGD',governmentContractId:'TRADE-EXPORT-CONTRACT-E2E'}
});
assert.equal(exactExportReplay.status,'APPLIED',JSON.stringify(exactExportReplay));
assert.equal(exactExportReplay.result?.duplicate,true);
const changedExportReplay=mesh.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_DEBIT','SAU',{
  resourceId:'crude_oil',quantity:11,settlementId:'DIRECT-GOV-EXPORT-DEBIT',
  transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:'DIRECT-GOV-EXPORT-DEBIT',
    sourceCountryId:'SAU',destinationCountryId:'IND',governmentContractId:'TRADE-EXPORT-CONTRACT-E2E'}
});
assert.equal(changedExportReplay.status,'FAILED',JSON.stringify(changedExportReplay));
assert.equal(changedExportReplay.result?.reason,'TRADE_RESOURCE_DEBIT_IDEMPOTENCY_COLLISION');
assert.equal(policy.liftEmbargo('SAU',{policyId:'POST-SETTLEMENT-REPLAY-EMBARGO'}).accepted,true);

const invalidUiRequest=trade.createRequest('BGD',{
  requestId:'REQ-UI-INVALID',targetCountryId:'BGD',resourceId:'crude_oil',quantity:100,unitPrice:101,
  source:'OMEGA_RESOURCE_COMMAND_CENTER_UI'
});
assert.equal(invalidUiRequest?.accepted,false,'same-country trade must be rejected');

const uiCreated=trade.createRequest('BGD',{
  requestId:'REQ-UI-CREATE',targetCountryId:'SAU',resourceId:'crude_oil',quantity:100,unitPrice:101,
  source:'OMEGA_RESOURCE_COMMAND_CENTER_UI'
});
assert.equal(uiCreated?.accepted,true,JSON.stringify(uiCreated));
const uiCreatedRequest=globalThis.Game.state.trade.BGD.importRequests.find(x=>x.requestId==='REQ-UI-CREATE');
assert.equal(uiCreatedRequest?.status,'SENT');
assert.equal(uiCreatedRequest?.stage,'OPEN');
assert.equal(uiCreatedRequest?.quantity,100);
assert.equal(uiCreatedRequest?.targetCountryId,'SAU');
assert(globalThis.Game.state.trade.BGD.globalTradeLedger.requests.some(x=>x.requestId==='REQ-UI-CREATE'));

const duplicateUiRequest=trade.createRequest('BGD',{
  requestId:'REQ-UI-CREATE',targetCountryId:'SAU',resourceId:'crude_oil',quantity:100,unitPrice:101,
  source:'OMEGA_RESOURCE_COMMAND_CENTER_UI'
});
assert.equal(duplicateUiRequest?.duplicate,true,'identical request retries must be idempotent');
const conflictingUiRequest=trade.createRequest('BGD',{
  requestId:'REQ-UI-CREATE',targetCountryId:'SAU',resourceId:'crude_oil',quantity:101,unitPrice:101,
  source:'OMEGA_RESOURCE_COMMAND_CENTER_UI'
});
assert.equal(conflictingUiRequest?.accepted,false,'conflicting request ID reuse must fail');
assert.equal(conflictingUiRequest?.reason,'TRADE_REQUEST_ID_CONFLICT');
console.log('OMEGA GLOBAL TRADE TEST PASSED');

// The preceding public-trade regressions deliberately left State export limits active.
// Remove those test policies before exercising a company-owned commercial export.
assert.equal(policy.liftSupplyDirective('SAU',{policyId:'TRADE-DOMESTIC-ONLY-E2E'}).accepted,true);
assert.equal(policy.liftSupplyDirective('SAU',{policyId:'TRADE-EXPORT-CONTRACT-E2E'}).accepted,true);

// Mine-haul regression: 600 units have reached the warehouse and 400 remain in transit.
// The batch still records all 1,000 units, but only the receipted 600 are exportable.
const mineLogisticsBatchId='SAU-MINE-LOGISTICS-PARTIAL-RECEIPT-E2E';
const mineLogisticsSeller=globalThis.Game.state.resource.SAU;
mineLogisticsSeller.inventory.crude_oil+=600;
mineLogisticsSeller.batches.push({
  batchId:mineLogisticsBatchId,resourceId:'crude_oil',materialIdentity:'crude_oil',
  quantity:1000,remainingQuantity:1000,unit:'BARRELS',stage:'PARTIALLY_IN_RAW_INVENTORY',
  countryId:'SAU',sourceCountryId:'SAU',originCountryId:'SAU',ownerCountryCode:'SAU',
  warehouseId:null,locationNodeKey:'MIXED:MINE_RAW_WAREHOUSE_OR_TRANSIT',
  provenance:{sourceAuthority:'SIMULATED_TEST_FIXTURE',quantityAuthority:'SIMULATED'}
});
mineLogisticsSeller.inventoryLots[mineLogisticsBatchId]={
  batchId:mineLogisticsBatchId,resourceId:'crude_oil',quantity:1000,remainingQuantity:1000,
  unit:'BARRELS',stage:'PARTIALLY_IN_RAW_INVENTORY',countryId:'SAU',warehouseId:null,
  status:'PARTIAL_STOCK_ACROSS_MINE_WAREHOUSE_OR_TRANSIT'
};
mineLogisticsSeller.warehouse.availableByResource.crude_oil+=600;
mineLogisticsSeller.warehouse.storedBatchIds.push(mineLogisticsBatchId);
mineLogisticsSeller.industrialNetwork={
  schemaVersion:'OMEGA_RESOURCE_SITE_LOGISTICS_V1',
  shipments:[{shipmentId:'MINE-HAUL-IN-TRANSIT-E2E',batchId:mineLogisticsBatchId,countryId:'SAU',
    resourceId:'crude_oil',shipmentType:'MINE_TO_WAREHOUSE',quantity:400,status:'IN_TRANSIT'}],
  siteFlowLedger:[{flowId:'SITE-FLOW-E2E',batchId:mineLogisticsBatchId,siteId:'SITE_SAU_TEST_MINE',
    resourceId:'crude_oil',mineLogisticsRouteId:'ROUTE-SAU-TEST-MINE',mineLogisticsStockDebited:true,
    mineWarehouseDispatchedQuantity:1000,mineWarehouseReceivedQuantity:600,mineHeldQuantity:0,
    factoryDispatchedQuantity:0,mineWarehouseConsumedQuantity:0,mineWarehouseExportedQuantity:0}]
};
const beforeMineHaulDebit={
  stock:mineLogisticsSeller.inventory.crude_oil,
  warehouse:mineLogisticsSeller.warehouse.availableByResource.crude_oil,
  mineBatchRemaining:mineLogisticsSeller.batches.find(row=>row.batchId===mineLogisticsBatchId).remainingQuantity
};
const mineHaulDebit=mesh.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_DEBIT','SAU',{
  resourceId:'crude_oil',quantity:4000,settlementId:'MINE-HAUL-SELLER-DEBIT-E2E',
  transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:'MINE-HAUL-SELLER-DEBIT-E2E',
    sourceCountryId:'SAU',destinationCountryId:'BGD'}
});
assert.equal(mineHaulDebit.status,'APPLIED',JSON.stringify(mineHaulDebit));
assert.equal(mineHaulDebit.result?.accepted,true);
assert.equal(mineLogisticsSeller.inventory.crude_oil,beforeMineHaulDebit.stock-4000);
assert.equal(mineLogisticsSeller.warehouse.availableByResource.crude_oil,beforeMineHaulDebit.warehouse-4000);
assert.equal(mineLogisticsSeller.batches.find(row=>row.batchId===mineLogisticsBatchId).remainingQuantity,990);
assert.equal(mineLogisticsSeller.inventoryLots[mineLogisticsBatchId].remainingQuantity,990);
assert.equal(mineLogisticsSeller.industrialNetwork.siteFlowLedger[0].mineWarehouseExportedQuantity,10,
  'trade must debit only the received 600 units, not the 400 units still in transit');
const mineHaulDebitReplay=mesh.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_DEBIT','SAU',{
  resourceId:'crude_oil',quantity:4000,settlementId:'MINE-HAUL-SELLER-DEBIT-E2E',
  transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:'MINE-HAUL-SELLER-DEBIT-E2E',
    sourceCountryId:'SAU',destinationCountryId:'BGD'}
});
assert.equal(mineHaulDebitReplay.status,'APPLIED',JSON.stringify(mineHaulDebitReplay));
assert.equal(mineHaulDebitReplay.result?.duplicate,true,'replayed mine-haul debit must not move stock twice');
assert.equal(mineLogisticsSeller.inventory.crude_oil,beforeMineHaulDebit.stock-4000);

// End-to-end private-company purchase: executable market quote -> exact private batch
// -> company cash settlement -> import batch / warehouse receipt. The seller's national
// Treasury is deliberately not the recipient of the commercial sale proceeds.
await import('../omega_private_enterprise_lifecycle_v1.js');
globalThis.Game.playerCountry='BGD';
const buyerCompany='NOVA_CONSUMER_INDUSTRIES',sellerCompany='AURORA_INDUSTRIAL_GROUP';
const companyBatchId='SAU-PRIVATE-CRUDE-BATCH-E2E';
const sellerResource=globalThis.Game.state.resource.SAU;
sellerResource.inventory.crude_oil=(Number(sellerResource.inventory.crude_oil)||0)+500;
sellerResource.batches.push({
  batchId:companyBatchId,resourceId:'crude_oil',materialIdentity:'crude_oil',
  quantity:500,remainingQuantity:500,unit:'BARRELS',stage:'RAW_EXTRACTED',
  countryId:'SAU',sourceCountryId:'SAU',originCountryId:'SAU',ownerCountryCode:'SAU',
  ownerCompanyId:sellerCompany,operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
  ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',sourceFactoryId:'SAU-PRIVATE-OIL-FAC-1',
  warehouseId:'WH-SAU-RAW',provenance:{sourceAuthority:'RECORDED_PRIVATE_COMPANY_OUTPUT'}
});
sellerResource.inventoryLots[companyBatchId]={
  batchId:companyBatchId,resourceId:'crude_oil',quantity:500,remainingQuantity:500,
  unit:'BARRELS',stage:'RAW_EXTRACTED',countryId:'SAU',warehouseId:'WH-SAU-RAW',
  status:'AVAILABLE',provenance:{sourceAuthority:'RECORDED_PRIVATE_COMPANY_OUTPUT'}
};
sellerResource.warehouse.availableByResource.crude_oil+=500;
sellerResource.warehouse.storedBatchIds.push(companyBatchId);
globalThis.Game.state.finance.BGD.omegaFinance={
  ledger:[],companyCapitalAccounts:{
    [buyerCompany]:{companyId:buyerCompany,currency:'USD',availableBalance:50000,
      reservedBalance:0,capitalRaised:50000,capitalSpent:0,revision:1}
  }
};
globalThis.Game.state.finance.BGD.currencyCode='USD';
globalThis.Game.state.finance.SAU.currencyCode='USD';
globalThis.OmegaGovernmentBanking={
  getCountryPolicy(countryId){return{countryCode:countryId,importTariffPct:2.5};}
};
for(const bucket of Object.values(globalThis.Game.state.trade||{})){
  for(const request of Array.isArray(bucket?.importRequests)?bucket.importRequests:[]){
    if(request&&request.resourceId==='crude_oil'&&['SENT','COUNTER_OFFERED','ACCEPTED'].includes(String(request.status||'').toUpperCase())){
      request.status='REJECTED';request.stage='TEST_ISOLATION';
    }
  }
}
globalThis.Game.state.trade.BGD.importRequests.push({
  requestId:'PRIVATE-MARKET-BID-E2E',countryId:'BGD',targetCountryId:'SAU',
  resourceId:'crude_oil',quantity:100,unitPrice:100,status:'SENT',stage:'OPEN'
});
globalThis.Game.state.trade.SAU.offerBook=[{
  offerId:'PRIVATE-MARKET-ASK-E2E',countryId:'SAU',resourceId:'crude_oil',
  quantity:500,unitPrice:100,status:'ACTIVE'
}];
await import('../omega_global_market_system.js');
const realMarket=globalThis.OmegaGlobalMarket;
const realMarketRebuild=realMarket.rebuild();
const realMarketQuote=realMarket.quote('crude_oil');
assert.equal(realMarketQuote.status,'CLEARED',JSON.stringify({realMarketRebuild,realMarketQuote}));
assert.equal(realMarketQuote.clearingPriceUsd,100);
assert.equal(realMarketQuote.matchedQuantity,100);
assert.ok(realMarketQuote.matches.some(match=>match.buyerCountryId==='BD'&&match.sellerCountryId==='SA'&&match.quantity===100),
  'the executable quote must originate from the buyer bid crossing the seller ask: '+JSON.stringify({
    matches:realMarketQuote.matches,bids:realMarketRebuild.crude_oil?.orders?.bids,asks:realMarketRebuild.crude_oil?.orders?.asks
  }));
const marketOnlyBid=globalThis.Game.state.trade.BGD.importRequests.find(x=>x.requestId==='PRIVATE-MARKET-BID-E2E');
assert.ok(marketOnlyBid,'the real order-book bid must have a matching request row');
marketOnlyBid.status='REJECTED';
marketOnlyBid.stage='MARKET_QUOTE_EVIDENCE_ONLY';
marketOnlyBid.rejectionReason='ORDER_BOOK_QUOTE_ALREADY_CAPTURED';
assert.equal(realMarket.quote('crude_oil').matchedQuantity,100,
  'rejecting the market-only request after quote capture must not rewrite the observed market quote');
const discoveredPrivateSuppliers=realMarket.privateCompanySuppliers('crude_oil',100,'BGD',sellerCompany,'SAU');
assert.ok(discoveredPrivateSuppliers.some(row=>row.countryId==='SA'&&row.companyId===sellerCompany&&
  row.available===500&&row.sourceBatchIds.includes(companyBatchId)),JSON.stringify(discoveredPrivateSuppliers));
const buyerTreasuryBeforePrivate=globalThis.Game.state.finance.BGD.available;
const sellerTreasuryBeforePrivate=globalThis.Game.state.finance.SAU.available;
const buyerPrivateCashBefore=globalThis.Game.state.finance.BGD.omegaFinance.companyCapitalAccounts[buyerCompany].availableBalance;
const sellerPrivateAccountBefore=globalThis.Game.state.economy.SAU.companyAccounts?.[sellerCompany]||null;
const sellerGrossRevenueBefore=Number(sellerPrivateAccountBefore?.grossRevenue)||0;
const sellerPaymentsReceivedBefore=Number(sellerPrivateAccountBefore?.paymentsReceived)||0;
const sellerGenericSaleCountBefore=(sellerPrivateAccountBefore?.cashFlowEntries||[]).filter(row=>row.category==='SUPPLIER_SALE').length;
const privateRequest=trade.createPrivateCompanyImportRequest('BGD',{
  requestId:'PRIVATE-CO-PROCUREMENT-E2E',targetCountryId:'SAU',resourceId:'crude_oil',
  quantity:100,unitPrice:100,buyerCompanyId:buyerCompany,sellerCompanyId:sellerCompany
});
assert.equal(privateRequest?.accepted,true,JSON.stringify(privateRequest));
assert.equal(privateRequest.request?.procurementType,'PRIVATE_COMPANY_TO_COMPANY');
assert.equal(privateRequest.request?.buyerCompanyId,buyerCompany);
assert.equal(privateRequest.request?.sellerCompanyId,sellerCompany);
const privateProcessed=trade.processCountry('BGD');
assert.equal(privateProcessed.status,'COMPLETED',JSON.stringify(privateProcessed));
const privateSettledRequest=globalThis.Game.state.trade.BGD.importRequests.find(x=>x.requestId==='PRIVATE-CO-PROCUREMENT-E2E');
assert.equal(privateSettledRequest?.status,'SETTLED',JSON.stringify({
  request:privateSettledRequest,trace:globalThis.__OMEGA_LAST_TRADE_PROCESS_TRACE,
  settlement:globalThis.__OMEGA_SETTLEMENT_TRACE
}));
assert.equal(privateSettledRequest?.procurementType,'PRIVATE_COMPANY_TO_COMPANY');
const privateImportLedger=globalThis.Game.state.resource.BGD.inventoryLedger.find(x=>
  x.type==='INTERNATIONAL_TRADE_IMPORT'&&x.settlementId===privateSettledRequest.settlementId);
assert(privateImportLedger,'the company order must end in a committed import inventory ledger');
const privateImportedBatch=globalThis.Game.state.resource.BGD.batches.find(x=>
  x.batchId===privateImportLedger.createdBatchIds[0]);
assert.equal(privateImportedBatch.ownerCompanyId,buyerCompany);
assert.equal(privateImportedBatch.operatorCompanyId,buyerCompany);
assert.equal(privateImportedBatch.sourceSellerCompanyId,sellerCompany);
assert.equal(privateImportedBatch.provenance.sourceOwnerCompanyId,sellerCompany);
assert(globalThis.Game.state.resource.BGD.warehouse.receipts.some(x=>
  x.batchId===privateImportedBatch.batchId&&x.status==='RECEIVED'&&x.sourceCountryId==='SAU'));
assert.equal(sellerResource.batches.find(x=>x.batchId===companyBatchId).remainingQuantity,400);
assert.equal(sellerResource.inventoryLots[companyBatchId].remainingQuantity,400);
assert.equal(globalThis.Game.state.finance.BGD.omegaFinance.companyCapitalAccounts[buyerCompany].availableBalance,39750);
assert.equal(globalThis.Game.state.finance.SAU.omegaFinance.companyCapitalAccounts[sellerCompany].availableBalance,10000);
assert.equal(globalThis.Game.state.finance.BGD.available,buyerTreasuryBeforePrivate+250,
  'private buyer Treasury delta mismatch: '+JSON.stringify({
    before:buyerTreasuryBeforePrivate,after:globalThis.Game.state.finance.BGD.available,
    financeHistory:globalThis.Game.state.finance.BGD.tradeSettlementHistory,
    trace:globalThis.__OMEGA_SETTLEMENT_TRACE,
    request:privateSettledRequest,
    buyerLedger:globalThis.Game.state.finance.BGD.omegaFinance.ledger,
    sellerFinanceHistory:globalThis.Game.state.finance.SAU.tradeSettlementHistory
  }));
assert.equal(globalThis.Game.state.finance.SAU.available,sellerTreasuryBeforePrivate,
  'private seller revenue must not be credited to the sovereign Treasury');
const buyerPrivateJournal=globalThis.Game.state.economy.BGD.companyAccounts[buyerCompany].cashFlowEntries;
const sellerPrivateJournal=globalThis.Game.state.economy.SAU.companyAccounts[sellerCompany].cashFlowEntries;
assert(buyerPrivateJournal.some(x=>x.category==='FACTORY_INPUT_PURCHASE'&&x.amount===10000&&x.sourceId===privateSettledRequest.settlementId&&x.status==='POSTED'));
assert(buyerPrivateJournal.some(x=>x.category==='IMPORT_TARIFF'&&x.amount===250&&x.sourceId===privateSettledRequest.settlementId&&x.status==='POSTED'));
assert(sellerPrivateJournal.some(x=>x.category==='PRIVATE_COMPANY_EXPORT_SALE'&&x.amount===10000&&x.sourceId===privateSettledRequest.settlementId&&x.status==='POSTED'));
const sellerPrivateAccount=globalThis.Game.state.economy.SAU.companyAccounts[sellerCompany];
assert.equal(sellerPrivateAccount.grossRevenue,sellerGrossRevenueBefore+10000,
  'the seller company must recognize the trade value exactly once');
assert.equal(sellerPrivateAccount.paymentsReceived,sellerPaymentsReceivedBefore+10000,
  'the seller company wallet receives the buyer payment exactly once');
assert.equal(sellerPrivateJournal.filter(row=>row.category==='SUPPLIER_SALE').length,sellerGenericSaleCountBefore,
  'generic trade fiscalization must not issue a second seller revenue credit');
const privateProcurementRecord=globalThis.Game.state.economy.BGD.privateEnterpriseLifecycle.privateCompanyProcurementRecords.find(x=>
  x.settlementId===privateSettledRequest.settlementId);
assert.equal(privateProcurementRecord.status,'SETTLED');
assert(privateProcurementRecord.createdBatchIds.includes(privateImportedBatch.batchId));
assert.equal(globalThis.Game.state.trade.BGD.importValue,105000);
assert.equal(globalThis.Game.state.trade.SAU.exportValue,105000);
console.log('OMEGA PRIVATE COMPANY PROCUREMENT AND IMPORT DELIVERY E2E PASSED');


// Seller stock authority regression: factory output can leave the legacy aggregate
// inventory mirror stale while its raw/processed warehouses and tracked batches agree.
// Trade may repair that mirror only from the independently matching physical ledgers.
const sellerLedgerResource={
  inventory:{coal_concentrate:12.3,'coal-concentrate':0},
  reserves:{},production:{},strategicReserve:{availableByResource:{}},
  batches:[
    {batchId:'IND-COAL-CONCENTRATE-RAW-LEDGER',resourceId:'COAL_CONCENTRATE',materialIdentity:'COAL_CONCENTRATE',
      quantity:128637.3,remainingQuantity:128637.3,stage:'RAW_EXTRACTED',status:'AVAILABLE',
      countryId:'IND',sourceCountryId:'IND',originCountryId:'IND',ownerCountryCode:'IND',
      warehouseId:'WH-IND-RAW',provenance:{sourceAuthority:'SIMULATED_TEST_FIXTURE'}},
    {batchId:'IND-COAL-CONCENTRATE-FINISHED-LEDGER',resourceId:'coal_concentrate',materialIdentity:'coal_concentrate',
      quantity:100000,remainingQuantity:100000,stage:'FINISHED',status:'AVAILABLE',
      countryId:'IND',sourceCountryId:'IND',originCountryId:'IND',ownerCountryCode:'IND',
      warehouseId:'WH-IND-PROCESSED',provenance:{sourceAuthority:'SIMULATED_TEST_FIXTURE'}}
  ],
  inventoryLots:{
    'IND-COAL-CONCENTRATE-RAW-LEDGER':{batchId:'IND-COAL-CONCENTRATE-RAW-LEDGER',resourceId:'COAL_CONCENTRATE',
      quantity:128637.3,remainingQuantity:128637.3,stage:'RAW_EXTRACTED',status:'AVAILABLE',
      countryId:'IND',warehouseId:'WH-IND-RAW'},
    'IND-COAL-CONCENTRATE-FINISHED-LEDGER':{batchId:'IND-COAL-CONCENTRATE-FINISHED-LEDGER',resourceId:'coal_concentrate',
      quantity:100000,remainingQuantity:100000,stage:'FINISHED',status:'AVAILABLE',
      countryId:'IND',warehouseId:'WH-IND-PROCESSED'}
  },
  warehouse:{warehouseId:'WH-IND-RAW',countryId:'IND',type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
    locationNodeKey:'WAREHOUSE:IND:RAW',status:'OPERATIONAL',
    availableByResource:{coal_concentrate:128637.3,'coal-concentrate':0},
    reservedByResource:{},storedBatchIds:['IND-COAL-CONCENTRATE-RAW-LEDGER'],receipts:[]},
  processedWarehouse:{warehouseId:'WH-IND-PROCESSED',countryId:'IND',type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',
    locationNodeKey:'WAREHOUSE:IND:PROCESSED',status:'OPERATIONAL',
    availableByResource:{COAL_CONCENTRATE:100000},reservedByResource:{},
    storedBatchIds:['IND-COAL-CONCENTRATE-FINISHED-LEDGER'],receipts:[]},
  industrialNetwork:{shipments:[],siteFlowLedger:[]},inventoryLedger:[]
};
globalThis.Game.state.resource.IND=sellerLedgerResource;
globalThis.Game.state.trade.IND=globalThis.Game.state.trade.IND||{};
globalThis.Game.state.foreign.IND=globalThis.Game.state.foreign.IND||{relations:{}};
globalThis.Game.state.foreign.IND.relations.BGD={overall:80,trade:90,political:75,trust:70,trade_agreement:true,sanctions:false,war_state:false};
const inventoryKeysBeforeSellerLedgerDebit=Object.keys(sellerLedgerResource.inventory).sort();
const sellerLedgerDebit=mesh.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_DEBIT','IND',{
  resourceId:'COAL_CONCENTRATE',quantity:20,settlementId:'SELLER-STOCK-WAREHOUSE-AUTHORITY-REGRESSION',
  transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:'SELLER-STOCK-WAREHOUSE-AUTHORITY-REGRESSION',
    sourceCountryId:'IND',destinationCountryId:'BGD'}
});
assert.equal(sellerLedgerDebit.status,'APPLIED',JSON.stringify(sellerLedgerDebit));
assert.equal(sellerLedgerDebit.result?.accepted,true,JSON.stringify(sellerLedgerDebit.result));
const sellerLedgerAfter=globalThis.Game.state.resource.IND;
assert.deepEqual(Object.keys(sellerLedgerAfter.inventory).sort(),inventoryKeysBeforeSellerLedgerDebit,
  'inventory aliases must be preserved; reconciliation must not delete existing resource keys');
assert.equal(Object.values(sellerLedgerAfter.inventory).reduce((sum,value)=>sum+Number(value||0),0),228617.3,
  'the aggregate inventory mirror must equal the two warehouses after the export');
assert.equal(sellerLedgerAfter.inventory['coal-concentrate'],0);
assert.equal(sellerLedgerAfter.batches.find(row=>row.batchId==='IND-COAL-CONCENTRATE-RAW-LEDGER').remainingQuantity,128617.3);
assert.equal(sellerLedgerAfter.inventoryLots['IND-COAL-CONCENTRATE-RAW-LEDGER'].remainingQuantity,128617.3);
assert.equal(sellerLedgerAfter.warehouse.availableByResource.coal_concentrate,128617.3);
assert.equal(sellerLedgerAfter.warehouse.availableByResource['coal-concentrate'],0);
assert.equal(sellerLedgerAfter.processedWarehouse.availableByResource.COAL_CONCENTRATE,100000);
assert.equal(sellerLedgerAfter.inventoryLedger.some(row=>
  row.type==='INTERNATIONAL_TRADE_EXPORT'&&row.settlementId==='SELLER-STOCK-WAREHOUSE-AUTHORITY-REGRESSION'),true);

// A warehouse/batch disagreement is not a stale aggregate mirror. It remains a hard
// pre-trade block, and the debit must not mutate any stock ledger.
globalThis.Game.state.resource.IND.inventory.iron_ore=500;
globalThis.Game.state.resource.IND.batches.push({
  batchId:'IND-IRON-ORE-WAREHOUSE-MISMATCH',resourceId:'iron_ore',materialIdentity:'iron_ore',
  quantity:100,remainingQuantity:100,stage:'RAW_EXTRACTED',status:'AVAILABLE',
  countryId:'IND',sourceCountryId:'IND',originCountryId:'IND',warehouseId:'WH-IND-RAW'
});
globalThis.Game.state.resource.IND.inventoryLots['IND-IRON-ORE-WAREHOUSE-MISMATCH']={
  batchId:'IND-IRON-ORE-WAREHOUSE-MISMATCH',resourceId:'iron_ore',quantity:100,remainingQuantity:100,
  stage:'RAW_EXTRACTED',status:'AVAILABLE',countryId:'IND',warehouseId:'WH-IND-RAW'
};
globalThis.Game.state.resource.IND.warehouse.availableByResource.iron_ore=90;
const blockedMismatchDebit=mesh.dispatchCommand('resource','OMEGA_TRADE_RESOURCE_DEBIT','IND',{
  resourceId:'iron_ore',quantity:1,settlementId:'SELLER-STOCK-WAREHOUSE-MISMATCH-REGRESSION',
  transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:'SELLER-STOCK-WAREHOUSE-MISMATCH-REGRESSION',
    sourceCountryId:'IND',destinationCountryId:'BGD'}
});
assert.equal(blockedMismatchDebit.status,'FAILED',JSON.stringify(blockedMismatchDebit));
assert.equal(blockedMismatchDebit.result?.reason,'RESOURCE_WAREHOUSE_BATCH_LEDGER_MISMATCH',
  JSON.stringify(blockedMismatchDebit.result));
assert.equal(globalThis.Game.state.resource.IND.inventory.iron_ore,500);
assert.equal(globalThis.Game.state.resource.IND.batches.find(row=>row.batchId==='IND-IRON-ORE-WAREHOUSE-MISMATCH').remainingQuantity,100);
assert.equal(globalThis.Game.state.resource.IND.warehouse.availableByResource.iron_ore,90);
console.log('OMEGA SELLER STOCK / WAREHOUSE / BATCH LEDGER REGRESSION PASSED');


// World activity feed is read-only, bounded, cached per turn, and reflects actual
// request/decision/settlement ledgers rather than order-book price discovery.
const worldActivityBefore = JSON.stringify({
  buyer:globalThis.Game.state.trade.BGD,
  seller:globalThis.Game.state.trade.SAU
});
const worldActivity = trade.getWorldActivity({limit:80,perCountry:12,refresh:true});
assert.equal(worldActivity.summary.countryCount <= 249,true);
assert.equal(worldActivity.summary.activityLimit,80);
assert.ok(worldActivity.countries.some(row=>row.countryId==='BGD'));
assert.ok(worldActivity.countries.some(row=>row.countryId==='SAU'));
assert.ok(worldActivity.records.some(row=>row.activityType==='SETTLEMENT'&&row.status==='SETTLED'),
  'world feed must include completed settlement rows');
assert.ok(worldActivity.records.some(row=>row.activityType==='TRADE_REQUEST'),
  'world feed must expose import requests');
const cachedWorldActivity = trade.getWorldActivity({limit:80,perCountry:12});
assert.deepEqual(cachedWorldActivity,worldActivity);
assert.equal(JSON.stringify({
  buyer:globalThis.Game.state.trade.BGD,
  seller:globalThis.Game.state.trade.SAU
}),worldActivityBefore,'reading global activity must not mutate trade state');
console.log('OMEGA GLOBAL WORLD TRADE ACTIVITY FEED REGRESSION PASSED');
