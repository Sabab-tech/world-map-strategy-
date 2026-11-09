'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const handlers = new Map();
class TestCustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail || {}; }
}
const candidateA = {
  id: 'TEST_MINISTER_A', name: 'Test Minister A', age: 42,
  background: 'Public administration', ministryId: 'interior_security',
  stats: { capability: 70 }, efficiency: { efficiency: 65 }
};
const candidateB = {
  id: 'TEST_MINISTER_B', name: 'Test Minister B', age: 45,
  background: 'Civil service', ministryId: 'interior_security',
  stats: { capability: 75 }, efficiency: { efficiency: 70 }
};
const legacyRegistry = {
  profiles: new Map([[candidateA.id, candidateA], [candidateB.id, candidateB]]),
  getActiveMinister() { return null; },
  getRuntime() { return null; },
  getLearning() { return null; },
  setRuntime() {},
  setLearning() {},
  assign() { throw new Error('LEGACY_REGISTRY_MUST_NOT_OWN_RECRUITMENT'); },
  unassign() {}
};
const document = {
  readyState: 'loading',
  body: { dataset: {} },
  addEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const sandbox = {
  console,
  document,
  CustomEvent: TestCustomEvent,
  OmegaMinisterState: { registry: legacyRegistry },
  Game: { currentActiveCountry: 'BGD', playerCountry: 'BGD', state: { countryId: 'BGD', playerCountryId: 'BGD' } },
  OmegaCountrySemanticBridge: { resolveCountry(value) {
    const label = String(value == null ? '' : value).trim().toLowerCase();
    if (label === 'bangladesh') return { id: 'BGD' };
    if (label === 'united states' || label === 'united states of america') return { id: 'USA' };
    return null;
  } },
  localStorage: { setItem() {}, getItem() { return null; } },
  setInterval() { return 1; },
  clearInterval() {},
  setTimeout() { return 1; },
  clearTimeout() {},
  addEventListener(type, handler) {
    const bucket = handlers.get(type) || [];
    bucket.push(handler);
    handlers.set(type, bucket);
  },
  dispatchEvent(event) {
    for (const handler of handlers.get(event.type) || []) handler(event);
    return true;
  },
  fetch: async () => ({ ok: false, status: 404, json: async () => ({}) })
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.confirm = () => true;

function load(file) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}

(async () => {
  load('omega_minister_state_system.js');
  const canonicalRegistry = sandbox.OmegaMinisterStateRegistry;
  assert.equal(typeof canonicalRegistry.recruitCandidate, 'function',
    'canonical registry must expose the real recruitment command');
  assert.equal(sandbox.OmegaMinisterState.registry, legacyRegistry,
    'legacy runtime registry is an independent compatibility object');

  load('minister_recruitment_engine.js');
  load('omega_live_minister_selector.js');
  const selector = sandbox.OmegaLiveMinisterSelectorV9;
  assert.ok(selector, 'live minister selector must be initialized');
  assert.deepEqual(
    [...selector.candidates('interior_security')].map(row => row.id),
    [candidateA.id, candidateB.id],
    'legacy candidate dossier source must remain readable without taking state ownership'
  );

  assert.equal(typeof canonicalRegistry.getActiveMinisterSummary, 'function',
    'canonical registry must expose a lightweight minister-summary read for UI lists');

  await selector.appoint('interior_security', candidateA);
  const originalFullRead = canonicalRegistry.getActiveMinister;
  let fullReadCount = 0;
  canonicalRegistry.getActiveMinister = function () {
    fullReadCount += 1;
    return originalFullRead.apply(this, arguments);
  };
  const summary = canonicalRegistry.getActiveMinisterSummary('BGD', 'interior_security');
  assert.equal(summary.ministerId, candidateA.id);
  assert.equal(summary.staticProfile.baseName, 'Test Minister A');
  assert.equal(summary.runtimeState.status, 'ACTIVE');
  assert.equal(Object.hasOwn(summary, 'learningState'), false,
    'summary must not clone learning history');
  assert.equal(Object.hasOwn(summary, 'memoryState'), false,
    'summary must not clone minister memory');
  assert.equal(Object.hasOwn(summary.runtimeState, 'activeTasks'), false,
    'summary must omit full runtime task arrays');
  const rosterActive = selector.active('interior_security');
  assert.equal(rosterActive.profile.baseName, 'Test Minister A');
  assert.equal(rosterActive.runtime.status, 'ACTIVE');
  assert.equal(fullReadCount, 0,
    'UI active-minister lookup must prefer the lightweight summary API');
  canonicalRegistry.getActiveMinister = originalFullRead;

  let active = canonicalRegistry.getActiveMinister('BGD', 'interior_security');
  assert.equal(active && active.ministerId, candidateA.id,
    'the real selector appointment must use canonical recruitment');
  assert.equal(sandbox.OmegaMinisterStateRegistry, canonicalRegistry,
    'selector startup/appointment must never overwrite the canonical global with the legacy registry');
  assert.equal(canonicalRegistry.consistencyCheck().ok, true,
    'canonical assignment index must remain consistent after recruitment');

  await selector.appoint('interior_security', candidateB);
  active = canonicalRegistry.getActiveMinister('BGD', 'interior_security');
  assert.equal(active && active.ministerId, candidateB.id,
    'replacing an active minister must complete through the canonical Fire/Recruit lifecycle');
  assert.equal(canonicalRegistry.getMinister(candidateA.id).runtimeState.status, 'FIRED',
    'the replaced minister must keep its lifecycle status');
  assert.equal(canonicalRegistry.consistencyCheck().ok, true,
    'canonical assignment index must remain consistent after replacement');

  // A Government screen can target a country that differs from the legacy cabinet's
  // current country. The explicit screen context must win, without moving the old appointment.
  const usaAppointment = await selector.appoint('interior_security', candidateA, 'USA');
  assert.equal(canonicalRegistry.getActiveMinister('BGD', 'interior_security').ministerId, candidateB.id,
    'country-scoped appointment must not replace the minister in the previously active country');
  assert.equal(usaAppointment.ministerId || usaAppointment.staticProfile?.ministerId || usaAppointment.staticProfile?.id, candidateA.id,
    'appointment result must return the minister assigned in the explicit country context');
  assert.equal(canonicalRegistry.getActiveMinister('USA', 'interior_security').ministerId, candidateA.id,
    'country-scoped appointment must assign the selected candidate to the screen country');
  assert.equal(canonicalRegistry.consistencyCheck().ok, true,
    'cross-country recruitment must preserve canonical assignment consistency');

  const candidateC = {
    id: 'TEST_MINISTER_C', name: 'Bangladesh Trade Minister', age: 39,
    background: 'Trade policy', ministryId: 'trade',
    stats: { capability: 72 }, efficiency: { efficiency: 73 }
  };
  await selector.appoint('trade', candidateC, 'Bangladesh');
  assert.equal(canonicalRegistry.getActiveMinister('BGD', 'trade').ministerId, candidateC.id,
    'country-name appointment must persist under the canonical ISO country key');
  assert.equal(selector.active('trade', 'Bangladesh').ministerId, candidateC.id,
    'country-name active-minister lookup must read the same canonical assignment');
  const candidateD = {
    id: 'TEST_MINISTER_D', name: 'Replacement Trade Minister', age: 46,
    background: 'Commercial administration', ministryId: 'trade',
    stats: { capability: 78 }, efficiency: { efficiency: 76 }
  };
  await selector.appoint('trade', candidateD, 'Bangladesh');
  assert.equal(canonicalRegistry.getActiveMinister('BGD', 'trade').ministerId, candidateD.id,
    'replacing by country name must detect and replace the existing canonical assignment');
  assert.equal(canonicalRegistry.getMinister(candidateC.id).runtimeState.status, 'FIRED',
    'replaced country-name appointment must preserve outgoing minister lifecycle');
  assert.equal(canonicalRegistry.consistencyCheck().ok, true,
    'country-name assignment and replacement must preserve canonical consistency');

  const liveRecruitment = sandbox.OmegaMinisterRecruitment;
  sandbox.OmegaMinisterRecruitment = null;
  await assert.rejects(
    selector.appoint('treasury_finance', candidateA),
    /MINISTER_RECRUITMENT_ENGINE_UNAVAILABLE/,
    'a missing recruitment API must surface a diagnostic rather than calling the wrong registry'
  );
  sandbox.OmegaMinisterRecruitment = liveRecruitment;
  assert.equal(sandbox.OmegaMinisterStateRegistry, canonicalRegistry,
    'missing-engine diagnostics must not corrupt canonical registry wiring');

  const previousPool = sandbox.OmegaMinisterIdentityPool;
  const previousDatabase = sandbox.OmegaMinistersDB;
  sandbox.OmegaMinisterIdentityPool = {
    getCandidates: async () => { throw new Error('COUNTRY_ROSTER_MANIFEST_UNAVAILABLE'); }
  };
  sandbox.OmegaMinistersDB = {
    Home_Affairs: Array.from({ length: 5 }, (_, index) => ({
      id: 'OFFLINE_INTERIOR_MINISTER_' + (index + 1),
      name: 'Offline Interior Candidate ' + (index + 1),
      age: 35 + index,
      background: 'Public administration',
      stats: { capability: 60 + index },
      efficiency: { efficiency: 55 + index }
    }))
  };
  const offlineFallback = await liveRecruitment.fetchRoster('interior_security', 'BGD');
  assert.equal(offlineFallback.length, 5,
    'a failed generated-country roster must fall back to the already-loaded ministers.json templates');
  assert.equal(new Set(offlineFallback.map(candidate => candidate.id)).size, 5,
    'offline fallback must preserve five unique candidate identities');
  if (previousPool === undefined) delete sandbox.OmegaMinisterIdentityPool;
  else sandbox.OmegaMinisterIdentityPool = previousPool;
  if (previousDatabase === undefined) delete sandbox.OmegaMinistersDB;
  else sandbox.OmegaMinistersDB = previousDatabase;

  console.log('OMEGA LIVE MINISTER REGISTRY BRIDGE: PASS');
  console.log('Canonical registry preserved against legacy V2 alias collision: PASS');
  console.log('Real Recruit/Fire/Recruit replacement lifecycle: PASS');
  console.log('Missing recruitment API fails visibly without registry mutation: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
