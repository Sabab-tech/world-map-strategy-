import assert from 'node:assert/strict';

globalThis.Game={state:{
  simulation:{turn:1},
  cabinet:{BD:{autonomyReservations:[]},SA:{autonomyReservations:[]}},
  finance:{BD:{available:200000,reserves:200000,currencyCode:'USD'},SA:{available:100000,reserves:100000,currencyCode:'USD'}},
  economy:{BD:{gdp:1000000,debt:100000},SA:{gdp:2000000,debt:100000}},
  population:{BD:{labor:{available:10000}},SA:{labor:{available:10000}}},
  resource:{BD:{inventory:{crude_oil:0},reserves:{crude_oil:0},production:{crude_oil:0}},SA:{inventory:{crude_oil:5000},reserves:{crude_oil:500},production:{crude_oil:500}}},
  foreign:{BD:{relations:{SA:{overall:80,trade:90,political:75,trust:70,trade_agreement:true,sanctions:false,war_state:false}},treaties:{}},SA:{relations:{BD:{overall:80,trade:90,political:75,trust:70,trade_agreement:true,sanctions:false,war_state:false}},treaties:{}}},
  trade:{
    BD:{marketPrice:{crude_oil:100},routeCapacity:{crude_oil:5000},importRequests:[{requestId:'REQ-1',countryId:'BD',targetCountryId:'SA',resourceId:'crude_oil',quantity:1000,unitPrice:95,totalValue:95000,status:'SENT',stage:'COUNTERPARTY_DECISION_PENDING',createdTurn:1}]},
    SA:{marketPrice:{crude_oil:100},routeCapacity:{crude_oil:5000}}
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
trade.processAll();
const req=globalThis.Game.state.trade.BD.importRequests[0];
assert.equal(req.status,'SETTLED');
assert.equal(globalThis.Game.state.resource.BD.inventory.crude_oil,1000);
assert.equal(globalThis.Game.state.resource.SA.inventory.crude_oil,4000);
assert.equal(globalThis.Game.state.finance.BD.available,100000);
assert.equal(globalThis.Game.state.finance.SA.available,195000);
assert.equal(globalThis.Game.state.trade.BD.balance,-95000);
assert.equal(globalThis.Game.state.trade.SA.balance,95000);
assert.equal(globalThis.Game.state.trade.BD.importValue,95000);
assert.equal(globalThis.Game.state.trade.SA.exportValue,95000);

globalThis.Game.state.trade.BD.importRequests.push({requestId:'REQ-REJECT',countryId:'BD',targetCountryId:'SA',resourceId:'crude_oil',quantity:100000,status:'SENT',stage:'COUNTERPARTY_DECISION_PENDING',createdTurn:1,unitPrice:100});
globalThis.Game.state.foreign.BD.relations.SA.trade_agreement=false;
trade.processAll();
assert(globalThis.Game.state.foreign.BD.relationAdjustments?.SA?.length>=1);
assert(globalThis.Game.state.trade.BD.importRequests.some(x=>x.stage==='POLITICAL_PRESSURE_RETRY'));
console.log('OMEGA GLOBAL TRADE TEST PASSED');