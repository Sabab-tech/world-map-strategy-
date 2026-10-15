import assert from 'node:assert/strict';

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
await import('../omega_global_trade_system.js');
await import('../omega_opponent_second_order_consequence_system.js');

const trade=globalThis.OmegaGlobalTrade;
assert.equal(trade.diagnostics().handlerInstalled,true,JSON.stringify(trade.diagnostics()));
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
console.log('OMEGA GLOBAL TRADE TEST PASSED');