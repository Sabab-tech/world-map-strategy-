import assert from 'node:assert/strict';

globalThis.Game={state:{simulation:{turn:1},cabinet:{},finance:{},economy:{},resource:{},trade:{},foreign:{},intelligence:{}}};
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
await import('../omega_opponent_memory_trace_log_system.js');

const memory=globalThis.OmegaOpponentDeepMemory;
const trace=globalThis.OmegaMemoryTraceLog;
const result=memory.record('BD',{type:'EPISODIC',action:'IMPORT',targetCountryId:'SAU',outcome:{status:'REJECTED'},importance:.9,correlationId:'CHAIN-1'});
assert.equal(result.status,'APPLIED');
const m=memory.memory('BD');
assert.equal(m.traceHold.length,1);
const rows=trace.trace('BD');
assert(rows.length>=1);
assert.equal(rows.at(-1).memoryId,m.traceHold.at(-1).memoryId);
assert.equal(rows.at(-1).traceId,m.traceHold.at(-1).traceId);
assert.equal(rows.at(-1).chainId,'CHAIN-1');
const replay=trace.replay('BD','CHAIN-1');
assert.equal(replay.complete,true);
assert(replay.entries.length>=1);
assert(rows.at(-1).inputDigest && rows.at(-1).outputDigest);
console.log('OMEGA MEMORY TRACE LOG TEST PASSED');