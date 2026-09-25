import assert from 'node:assert/strict';

globalThis.Game={state:{
  simulation:{turn:1},
  cabinet:{BDG:{autonomyReservations:[]},SAU:{autonomyReservations:[]}},
  finance:{BDG:{available:200000,reserves:200000,currencyCode:'USD'},SAU:{available:100000,reserves:100000,currencyCode:'USD'}},
  resource:{BDG:{inventory:{crude_oil:0},production:{crude_oil:0},consumption:{crude_oil:1000},reserves:{crude_oil:0},tradeAvailability:{crude_oil:0}},
            SAU:{inventory:{crude_oil:5000},production:{crude_oil:0},consumption:{crude_oil:0},reserves:{crude_oil:1000},tradeAvailability:{crude_oil:5000}}},
  foreign:{BDG:{relations:{SAU:{overall:80,trade:85,trust:75,political:80,trade_agreement:true,sanctions:false,war_state:false}},treaties:{}},
          SAU:{relations:{BDG:{overall:80,trade:85,trust:75,political:80,trade_agreement:true,sanctions:false,war_state:false}},treaties:{}}},
  trade:{BDG:{marketPrice:{crude_oil:100},routeCapacity:{crude_oil:10000}},SAU:{marketPrice:{crude_oil:100},routeCapacity:{crude_oil:10000}}}
}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=String(type);this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){const t=new EventTarget();globalThis.dispatchEvent=t.dispatchEvent.bind(t);globalThis.addEventListener=t.addEventListener.bind(t);}

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const identity=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await identity.init();
await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');
await import('../omega_opponent_deep_memory_system.js');
await import('../omega_opponent_adaptive_strategy_system.js');
await import('../omega_opponent_autonomy_system.js');
await import('../omega_global_trade_system.js');

const autonomy=globalThis.OmegaOpponentAutonomy;
const plan=autonomy.importPlan('BDG','crude_oil',1000);
assert(plan);
assert(plan.countryId==='BDG');
assert(plan.runtimeMeasurement?.selected?.action==='IMPORT');

const supplier=autonomy.chooseImportSupplier('BDG',{runtimeMeasurement:{resourceId:'crude_oil',selected:{quantity:1000}}});
assert.equal(supplier.countryId,'SAU');
assert.equal(supplier.supply,5000);
assert.equal(supplier.agreementObserved,true);

const sent=autonomy.dispatch('OMEGA_AUTO_RESOURCE_IMPORT_REQUEST','BDG',{
  requestId:'REQ-LIVE-1',targetCountryId:'SAU',resourceId:'crude_oil',quantity:1000,unitPrice:100,reservationId:'RES-REQ-1',decisionId:'REQ-DEC-1'
});
assert.equal(sent.status,'APPLIED');
assert.equal(globalThis.Game.state.trade.BDG.importRequests[0].status,'SENT');

const trade=globalThis.OmegaGlobalTrade;
console.log('TRADE_REVIEW_DIAG', JSON.stringify(trade.reviewRequest(globalThis.Game.state.trade.BDG.importRequests[0]), null, 2));
trade.processAll();
console.log('TRADE_AFTER_DIAG', JSON.stringify(globalThis.Game.state.trade.BDG.importRequests[0], null, 2));
const req=globalThis.Game.state.trade.BDG.importRequests[0];
assert.equal(req.status,'SETTLED');
assert.equal(globalThis.Game.state.resource.BDG.inventory.crude_oil,1000);
assert.equal(globalThis.Game.state.resource.SAU.inventory.crude_oil,4000);
assert.equal(globalThis.Game.state.finance.BDG.available,100000);
assert.equal(globalThis.Game.state.finance.SAU.available,200000);
console.log('OMEGA AUTONOMOUS RESOURCE REQUEST AND SETTLEMENT TEST PASSED');