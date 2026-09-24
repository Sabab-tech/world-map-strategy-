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
await import('../omega_resource_transport_runtime_v1.js');

const runtime=globalThis.OmegaResourceEndowmentRuntime;
const p5debug=globalThis.GSRSK_Part05;
const firstOcc=globalThis.__OmegaResourceIdentityRegistry?.occurrences?.values?.().next?.().value;
const firstDep=firstOcc?globalThis.__OmegaResourceIdentityRegistry.getDeposit(firstOcc.depositKey):null;
const p5debugCompiler=p5debug?new p5debug.ResourceReserveCompilerPipeline():null;
const p5raw=p5debugCompiler&&p5debugCompiler._findRawDepositRecord(firstDep,{refCatalog:{allReferences:engine.deposits}},firstOcc);
const p5parsed=p5debugCompiler&&p5debugCompiler._parseDeclaredReserveQuantity(p5raw?.reserves||p5raw?.reserve,firstOcc?.resourceTypeKey,globalThis.GSRSK_Part05?.QuantityDimension?'TEST':'UNKNOWN');
console.log('P5_DEBUG_ONE_OCCURRENCE',JSON.stringify({
  occurrence:firstOcc&&{key:firstOcc.occurrenceKey,resourceTypeId:firstOcc.resourceTypeId,resourceTypeKey:firstOcc.resourceTypeKey,depositKey:firstOcc.depositKey},
  deposit:firstDep&&{name:firstDep.depositRawName,country:firstDep.hostCountryIso3},
  raw:p5raw&&{name:p5raw.name,countryCode:p5raw.countryCode,reserves:p5raw.reserves,resId:p5raw.resId},
  parsed:p5parsed
}));
const initialized=await runtime.initialize();
assert.equal(initialized.status,'READY');
console.log('RESOURCE_DEBUG',JSON.stringify({
  initialized,
  canonicalBGD:countryIdentity.resolveCountry('BGD'),
  canonicalBangladesh:countryIdentity.resolveCountry('BANGLADESH'),
  runtime:runtime.diagnostics(),
  resourceStateKeys:Object.keys(globalThis.Game.state.resource||{}),
  reserveCount:globalThis.__OmegaResourceReserveRegistry?.reserveStates?.size||null,
  identityOccurrences:globalThis.__OmegaResourceIdentityRegistry?.occurrences?.size||null,
  reserveDiagnostics:globalThis.__OmegaResourceReserveRegistry?.diagnostics?.getReport?.()||null,
  bgdIndex:globalThis.__OmegaResourceIdentityRegistry?.getOccurrencesByCountry?.('BGD')?.length||null,
  bdIndex:globalThis.__OmegaResourceIdentityRegistry?.getOccurrencesByCountry?.('BD')?.length||null,
  deposits:(engine.deposits||[]).filter(x=>String(x.countryCode||'').toUpperCase()==='BGD').map(x=>({name:x.name,resId:x.resId,reserves:x.reserves}))
}));
const manualHydrate=runtime.hydrateCountry('BGD');
console.log('HYDRATE_DEBUG',JSON.stringify({
  manualHydrate,
  interopIds:globalThis.OmegaMinistryInteroperability?.ids,
  commandHandlers:[...(globalThis.OmegaMinistryInteroperability?.commandHandlers?.keys?.()||[])],
  resourceStateAfterManual:globalThis.Game.state.resource.BD
}));
const before=runtime.countryResourceState('BGD');
console.log('P5_PARSED_STATUS',JSON.stringify({
  mineCount:before?.mines?.length||0,
  resources:Object.keys(before?.reserves||{}),
  gasReserve:before?.reserves?.natural_gas||0,
  coalReserve:before?.reserves?.coal||0
}));
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
const transport=globalThis.OmegaResourceTransport;
assert(transport);
const shipments=transport.getCountryShipments('BGD');
assert(shipments.some(x=>x.resourceId==='natural_gas'&&x.batchId));
assert(Array.isArray(after.batches));
assert(after.batches.some(x=>x.resourceId==='natural_gas'&&x.materialIdentity==='natural_gas'));
console.log('OMEGA RESOURCE ENDOWMENT, EXTRACTION BATCH AND TRANSPORT TEST PASSED');