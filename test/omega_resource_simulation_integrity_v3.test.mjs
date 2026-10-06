import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

const context=createContext({console,globalThis:null});
context.globalThis=context;
new Script(readFileSync('omega_resource_evidence_resolver_v1.js','utf8'),{filename:'omega_resource_evidence_resolver_v1.js'}).runInContext(context);
new Script(readFileSync('omega_resource_realism_runtime_v1.js','utf8'),{filename:'omega_resource_realism_runtime_v1.js'}).runInContext(context);

const E=context.Omega.ResourceEvidenceResolver;
const R=context.Omega.ResourceRealism;
assert.equal(E.VERSION,'1.0.0');
assert.equal(R.VERSION,'1.3.0');

// Dynamic decline: same baseline inputs must produce a different rate as simulation time advances.
const baseSite={siteReferenceKey:'SITE:TEST:01',siteName:'Long Horizon Copper',resourceId:'copper',productionRate:1000,grade:'1.5%',simulationReserveQuantity:10000000,simulationReserveUnit:'TONNES',decline:0.05,referenceYear:2015};
const y2015=R.siteModel({...baseSite,simulationYear:2015},{resource_domain:{knownResourceTypes:['copper']}},'TST');
const y2025=R.siteModel({...baseSite,simulationYear:2025},{resource_domain:{knownResourceTypes:['copper']}},'TST');
assert.equal(y2015.commodityStreams[0].production.activeRate,1000);
assert.ok(y2025.commodityStreams[0].production.activeRate<1000);
assert.equal(y2025.commodityStreams[0].production.temporalCurve,undefined);
assert.equal(y2025.commodityStreams[0].production.referenceYear,2015);
assert.equal(y2025.commodityStreams[0].production.simulationYear,2025);
assert.equal(y2025.commodityStreams[0].production.temporalCurve.factor,Math.pow(.95,10));

// Simulation reserve is an extractable baseline, not silently a geological resource.
const sim=y2015.commodityStreams[0].reserve;
assert.equal(sim.quantityKind,'EXTRACTABLE_RESERVE');
assert.equal(sim.classificationState,'SIMULATION_ONLY_NO_PUBLIC_RESERVE_CLASSIFICATION');
assert.ok(sim.geologicalResourceQuantity>sim.technicallyRecoverableQuantity);
assert.ok(sim.technicallyRecoverableQuantity>sim.economicallyRecoverableQuantity);
assert.ok(sim.economicallyRecoverableQuantity>sim.extractableReserveQuantity);
assert.equal(sim.extractableReserveQuantity,10000000);

// An observed reserve remains usable, but geology is null until an explicit geological quantity exists.
const observed=R.siteModel({siteReferenceKey:'SITE:OBS:01',siteName:'Observed',resourceId:'copper',reserveQuantity:2000000,productionRate:500,grade:'1.8%',simulationYear:2026},{},'OBS');
const obs=observed.commodityStreams[0].reserve;
assert.equal(obs.authority,'OBSERVED');
assert.equal(obs.geologicalResourceQuantity,null);
assert.equal(obs.extractableReserveQuantity,2000000);

// Temporal evidence must not rewrite a 2015 historical state, but may supersede it from its effective year.
const evidenceRow={siteId:'SITE_NPL_udayapur_limestone_mine',effectiveFrom:'2026-10-06',observedAsOf:'2026-10-06',
  evidence:[{sourceType:'OPERATOR_PRIMARY',accessed:'2026-10-06',confidence:'HIGH'}],
  facts:{status:'OPERATING',owner:'Udayapur Cement Industries Limited'}};
const stale={siteId:evidenceRow.siteId,status:'SUSPENDED',owner:'Old Owner',operation:{status:'SUSPENDED',operationalStatus:'SUSPENDED',extractionEligibility:'NON_EXECUTABLE'}};
const at2015=E.apply(stale,evidenceRow,2015);
const at2026=E.apply(stale,evidenceRow,2026);
assert.equal(at2015.operation.status,'SUSPENDED');
assert.equal(at2015.operation.extractionEligibility,'NON_EXECUTABLE');
assert.equal(at2026.operation.status,'OPERATING');
assert.equal(at2026.operation.extractionEligibility,'EXECUTABLE');
assert.equal(at2026.evidenceResolution.fieldDecisions.status.applied,true);

// Operational gate is a hard execution boundary.
assert.equal(E.gate(at2015,2015).executable,false);
assert.equal(E.gate(at2026,2026).executable,true);
assert.equal(E.gate({operation:{status:'CLOSED',operationalStatus:'CLOSED',extractionEligibility:'EXECUTABLE'}},2026).executable,false);
assert.equal(E.gate({operation:{status:'ACTIVE_PRODUCING',operationalStatus:'ACTIVE_PRODUCING',extractionEligibility:'UNKNOWN'}},2026).executable,true);

console.log('OMEGA RESOURCE SIMULATION INTEGRITY V3 TEST PASSED');
