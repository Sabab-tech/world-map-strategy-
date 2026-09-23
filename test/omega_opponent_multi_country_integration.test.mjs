import assert from 'node:assert/strict';

globalThis.Game={state:{simulation:{turn:1},finance:{},economy:{},population:{},resource:{},cities:{},projects:{},military:{},foreign:{},trade:{},cabinet:{},intelligence:{}}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=String(type);this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){const t=new EventTarget();globalThis.dispatchEvent=t.dispatchEvent.bind(t);globalThis.addEventListener=t.addEventListener.bind(t);}

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const bridge=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await bridge.init();
await import('../omega_resource_semantic_bridge.js');
await import('../resource_ministry_engine.js');
await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');
await import('../omega_simulation_runtime.js');
await import('../omega_opponent_deep_memory_system.js');
await import('../omega_opponent_intelligence_evolution_system.js');
await import('../omega_opponent_adaptive_strategy_system.js');
await import('../opponent_country_rules.js');
await import('../omega_opponent_autonomy_system.js');
await import('../omega_global_trade_system.js');
await import('../omega_opponent_treaty_lifecycle_system.js');
await import('../omega_opponent_second_order_consequence_system.js');

const rules=globalThis.Omega.OpponentCountryRules;
const batch=await rules.evaluateAllCountries(1,{excludePlayer:false,queue:true,concurrency:8});
assert.equal(batch.selectedCountries,batch.totalCountries);
assert.equal(typeof batch.failed,'number');
assert.equal(batch.dispatchMode,'SAME_TICK_COOPERATIVE_CONCURRENT');
const sim=globalThis.Omega.Simulation;
const step=await sim.advance(1);
assert.equal(step.steps,1);
assert.equal(globalThis.OmegaOpponentAutonomy.diagnostics().queueBridgeInstalled,true);
console.log('OMEGA REAL MULTI-COUNTRY OPPONENT TEST PASSED');