import assert from 'node:assert/strict';

globalThis.Game={state:{
  simulation:{turn:1},
  cabinet:{},
  finance:{BD:{available:100000},SA:{available:100000}},
  economy:{BD:{gdp:100000,debt:20000},SA:{gdp:100000,debt:20000}},
  foreign:{BD:{relations:{SA:{overall:70,trust:65,trade:70}}},SA:{relations:{BD:{overall:70,trust:65,trade:70}}}},
  trade:{BD:{},SA:{}},
  resource:{BD:{inventory:{}},SA:{inventory:{}}}
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
await import('../omega_opponent_deep_memory_system.js');

const mem=globalThis.OmegaOpponentDeepMemory;
assert(mem && mem.diagnostics().handlerInstalled);
const a=mem.record('BD',{type:'EPISODIC',action:'IMPORT',targetCountryId:'SA',outcome:{status:'REJECTED'},importance:.8});
assert.equal(a.status,'APPLIED');
const b=mem.record('BD',{type:'EPISODIC',action:'IMPORT',targetCountryId:'SA',outcome:{status:'SETTLED'},importance:.9});
assert.equal(b.status,'APPLIED');
const c=mem.record('BD',{type:'RELATIONAL',action:'IMPORT',targetCountryId:'SA',outcome:{status:'REJECTED'},importance:.8});
assert.equal(c.status,'APPLIED');
const d=mem.consolidate('BD');
assert.equal(d.status,'APPLIED');
const insight=mem.relationInsight('BD','SA');
assert.equal(insight.attempts,1);
const score=mem.scoreAction('BD','IMPORT','SA');
assert(score.score!==null && score.confidence>0);
assert.equal(globalThis.Game.state.opponentMemory.BD.schemaVersion,1);
console.log('OMEGA DEEP MEMORY TEST PASSED');