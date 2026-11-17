import assert from 'node:assert/strict';

const scheduledTreatyHandlers = new Map();
globalThis.Omega = globalThis.Omega || {};
globalThis.Omega.WorldSimulationScheduler = {
  registerCountryHandler(id, handler, options) {
    scheduledTreatyHandlers.set(id, { handler, options });
    return () => scheduledTreatyHandlers.delete(id);
  }
};
globalThis.Game={state:{
  simulation:{turn:1},
  finance:{BGD:{available:100000},SAU:{available:100000}},
  economy:{BGD:{gdp:100000,debt:10000},SAU:{gdp:200000,debt:10000}},
  foreign:{
    BGD:{relations:{SAU:{overall:80,trust:75,political:70,trade_agreement:true,sanctions:false,war_state:false}},treaties:{},negotiations:{SAU:{status:'REQUESTED',stage:'NEGOTIATION_OPENED',targetCountryId:'SAU',treatyType:'ENERGY_SUPPLY',terms:{resourceId:'crude_oil',quantity:1000},createdTurn:1,decisionId:'NEG-1'}}},
    SAU:{relations:{BGD:{overall:80,trust:75,political:70,trade_agreement:true,sanctions:false,war_state:false}},treaties:{},negotiations:{}}
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
assert.equal(treaty.diagnostics().automaticWorldRosterScan,false);
const scheduled = scheduledTreatyHandlers.get('omega.opponent-treaty-lifecycle');
assert.ok(scheduled,'treaty lifecycle must register on the existing country scheduler');
assert.deepEqual(scheduled.options.tiers,['PLAYER','ACTIVE','MACRO']);
assert.equal(scheduled.options.priority,25);
assert.equal(treaty.diagnostics().maxPendingReviewsPerCountryPerTurn,2);
globalThis.Game.state.simulation.turn=2;
const scheduledResult = scheduled.handler('BGD',{turn:2,state:globalThis.Game.state});
assert.equal(scheduledResult.status,'COMPLETED');
assert.equal(scheduledResult.scanned,1);
assert.equal(scheduledResult.accepted,1);
assert.equal(treaty.processCountry('BGD').status,'ALREADY_PROCESSED',
  'repeated scheduler callbacks for one country/turn must not process a treaty twice');
assert.equal(globalThis.Game.state.foreign.BGD.treaties.SAU.status,'ACTIVE');
assert.equal(globalThis.Game.state.foreign.SAU.treaties.BGD.status,'ACTIVE');
assert.equal(globalThis.Game.state.foreign.BGD.negotiations.SAU.status,'ACTIVE');
assert.equal(globalThis.Game.state.foreign.SAU.negotiations.BGD.status,'ACTIVE');
console.log('OMEGA TREATY LIFECYCLE TEST PASSED');