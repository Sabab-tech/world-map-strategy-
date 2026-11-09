import assert from 'node:assert/strict';

globalThis.Game={state:{
  simulation:{turn:1},
  intelligence:{BD:{}},
  foreign:{BD:{relations:{SA:{overall:70,trust:65,trade:60,political:60,sanctions:false,war_state:false}}}}
}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=String(type);this.detail=init.detail;}};
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
await import('../omega_opponent_intelligence_evolution_system.js');

const api=globalThis.OmegaOpponentIntelligenceEvolution;
const mesh=globalThis.Omega.MinistryInteroperability;
const result=mesh.dispatchCommand('intelligence','OMEGA_INTELLIGENCE_RECORD_ASSESSMENT','BD',{
  targetCountryId:'SA',
  assessment:{threatLevel:'HIGH',confidence:.8,intent:'UNKNOWN',capability:'AVAILABLE',timeHorizon:'MEDIUM',uncertainty:.2,
    evidence:[{sourceId:'SRC-A',sourceReliability:.9}]}
},{turn:1,commandType:'OMEGA_INTELLIGENCE_RECORD_ASSESSMENT'});
assert.equal(result.status,'APPLIED');
const belief=api.belief('BD','SA');
assert.equal(belief.targetCountryId,'SA');
assert.equal(belief.lastThreatLevel,'HIGH');
assert.equal(belief.sourceReliabilityHistory['SRC-A'],.9);
console.log('OMEGA INTELLIGENCE EVOLUTION TEST PASSED');