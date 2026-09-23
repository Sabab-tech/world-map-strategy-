import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.Game={state:{simulation:{turn:1},resource:{},finance:{},economy:{},trade:{},foreign:{},cabinet:{}}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=String(type);this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){const t=new EventTarget();globalThis.dispatchEvent=t.dispatchEvent.bind(t);globalThis.addEventListener=t.addEventListener.bind(t);}

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const countryIdentity=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await countryIdentity.init();

await import('../resource_ministry_engine.js');
const engine=globalThis.ResourceMinistryEngine;
const source=JSON.parse(fs.readFileSync(new URL('../resources.json',import.meta.url),'utf8'));
engine.countryProfiles=source.GSRSK_Master_CountryProfiles_v14.countryProfiles;
engine.isReady=true;

await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');
await import('../omega_resource_endowment_runtime.js');

const runtime=globalThis.OmegaResourceEndowmentRuntime;
const initialized=await runtime.initialize();
assert.equal(initialized.status,'READY');
const before=runtime.countryResourceState('BGD');
assert(before);
assert(Array.isArray(before.mines));
assert(before.mines.length>=2);
assert((before.reserves.natural_gas||0)>0);
assert((before.endowment.natural_gas||0)>0);
assert(before.resourceAuthority);
assert.equal(before.resourceAuthority.mineSource,'ResourceMinistryEngine.deposits');
const gasMine=before.mines.find(x=>x.resourceId==='natural_gas');
assert(gasMine);
const extraction=runtime.extractCountry('BGD',[gasMine.occurrenceKey]);
assert.equal(extraction.status,'APPLIED');
const after=runtime.countryResourceState('BGD');
assert((after.production.natural_gas||0)>0);
assert((after.inventory.natural_gas||0)>0);
assert((after.reserves.natural_gas||0)<(before.reserves.natural_gas||0));
assert(after.extractionLedger.some(x=>x.extractionId));
assert(after.mineStates[gasMine.occurrenceKey]);
console.log('OMEGA RESOURCE ENDOWMENT AND MINE EXTRACTION TEST PASSED');