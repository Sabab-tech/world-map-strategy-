import assert from 'node:assert/strict';

globalThis.Game={state:{
  simulation:{turn:1},
  finance:{BD:{available:100000},SA:{available:100000}},
  economy:{BD:{gdp:100000,debt:10000},SA:{gdp:200000,debt:10000}},
  foreign:{
    BD:{relations:{SA:{overall:80,trust:75,political:70,trade_agreement:true,sanctions:false,war_state:false}},treaties:{},negotiations:{SA:{status:'REQUESTED',stage:'NEGOTIATION_OPENED',targetCountryId:'SA',treatyType:'ENERGY_SUPPLY',terms:{resourceId:'crude_oil',quantity:1000},createdTurn:1,decisionId:'NEG-1'}}},
    SA:{relations:{BD:{overall:80,trust:75,political:70,trade_agreement:true,sanctions:false,war_state:false}},treaties:{},negotiations:{}}
  }
}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=type;this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){const t=new EventTarget();globalThis.dispatchEvent=t.dispatchEvent.bind(t);globalThis.addEventListener=t.addEventListener.bind(t);}
await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const bridge=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await bridge.init();
await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');
await import('../omega_opponent_treaty_lifecycle_system.js');

const treaty=globalThis.OmegaOpponentTreatyLifecycle;
assert(treaty.diagnostics().handlerInstalled);
globalThis.Game.state.simulation.turn=2;
treaty.processAll();
assert.equal(globalThis.Game.state.foreign.BD.treaties.SA.status,'ACTIVE');
assert.equal(globalThis.Game.state.foreign.SA.treaties.BD.status,'ACTIVE');
assert.equal(globalThis.Game.state.foreign.BD.negotiations.SA.status,'ACTIVE');
assert.equal(globalThis.Game.state.foreign.SA.negotiations.BD.status,'ACTIVE');
console.log('OMEGA TREATY LIFECYCLE TEST PASSED');