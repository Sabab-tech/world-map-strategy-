'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pipelineSource = fs.readFileSync(path.join(__dirname, '..', 'omega_minister_intelligence_pipeline_v1.js'), 'utf8');
class TestCustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail || {}; }
}

function makeSandbox(initialMinister) {
  const listeners = new Map();
  const emitted = [];
  const canonicalRecords = new Map();
  const assignments = new Map();
  const legacyProfiles = new Map();
  const legacyRecords = new Map();
  const key = (countryId, ministryId) => String(countryId).toUpperCase() + ':' + String(ministryId).toLowerCase();
  const dispatchEvent = event => {
    emitted.push(event);
    for (const listener of listeners.get(event.type) || []) listener(event);
    return true;
  };

  const canonicalRegistry = {
    VERSION: 'TEST_CANONICAL_REGISTRY',
    getMinister(id) { return canonicalRecords.get(String(id)) || null; },
    getActiveMinister(countryId, ministryId) {
      const id = assignments.get(key(countryId, ministryId));
      const state = id ? canonicalRecords.get(id) : null;
      return state && state.runtimeState.status === 'ACTIVE' ? state : null;
    },
    getRegistry() {
      return new Map([...canonicalRecords.entries()].map(([id, state]) => [id, {
        identity: state.staticProfile, runtime: state.runtimeState, learning: state.learningState, memory: state.memoryState
      }]));
    },
    getAssignments() { return new Map(assignments); },
    recruitCandidate(profile, countryId, ministryId, gameTime = 0) {
      const id = String(profile.id || profile.ministerId);
      const assignment = key(countryId, ministryId);
      if (assignments.has(assignment)) throw new Error('MINISTRY_ALREADY_ASSIGNED');
      const state = {
        ministerId: id,
        staticProfile: { ...profile, ministerId: id, baseName: profile.name || profile.baseName || id },
        runtimeState: { ministerId: id, countryId, ministryId, status: 'ACTIVE', assignmentTime: gameTime,
          confidence: 50, trust: 50, workload: 0, stress: 0, activeTasks: [] },
        learningState: {}, memoryState: {}, effectiveCapability: 70
      };
      canonicalRecords.set(id, state);
      assignments.set(assignment, id);
      dispatchEvent(new TestCustomEvent('MINISTER_RECRUITED', { detail: { ministerId: id, countryId, ministryId } }));
      dispatchEvent(new TestCustomEvent('MINISTER_SYSTEM_SYNCHRONIZED', { detail: { ministerId: id, effective: state } }));
      return state;
    },
    removeMinister(id, reason = 'FIRED', tick = 0) {
      const state = canonicalRecords.get(String(id));
      if (!state) return null;
      assignments.delete(key(state.runtimeState.countryId, state.runtimeState.ministryId));
      const previousRuntime = { ...state.runtimeState };
      state.runtimeState.status = reason;
      state.runtimeState.lastUpdateTick = tick;
      dispatchEvent(new TestCustomEvent('MINISTER_FIRED', { detail: {
        ministerId: String(id), countryId: previousRuntime.countryId, ministryId: previousRuntime.ministryId, previousRuntime
      } }));
      dispatchEvent(new TestCustomEvent('MINISTER_SYSTEM_SYNCHRONIZED', { detail: { ministerId: String(id), effective: state } }));
      return state;
    },
    updateRuntimeState(id, patch) { Object.assign(canonicalRecords.get(String(id)).runtimeState, patch); return canonicalRecords.get(String(id)); },
    updateLearningState(id, patch) { Object.assign(canonicalRecords.get(String(id)).learningState, patch); return canonicalRecords.get(String(id)); },
    sendMessage() {}, storeEpisode() {}, retrieveMemory() { return []; }
  };

  const legacyRegistry = {
    getMinister(id) { return legacyProfiles.get(String(id)) || null; },
    registerProfile(profile) { legacyProfiles.set(String(profile.id), profile); return profile; },
    getRuntime(id) { return legacyRecords.get(String(id))?.runtime || null; },
    setRuntime(id, runtime) {
      const state = legacyRecords.get(String(id));
      if (state) state.runtime = { ...state.runtime, ...runtime };
      else legacyRecords.set(String(id), { profile: legacyProfiles.get(String(id)), runtime: { ...runtime }, learning: {} });
      return true;
    },
    getLearning(id) { return legacyRecords.get(String(id))?.learning || null; },
    setLearning(id, learning) {
      const state = legacyRecords.get(String(id));
      if (state) state.learning = { ...state.learning, ...learning };
      else legacyRecords.set(String(id), { profile: legacyProfiles.get(String(id)), runtime: {}, learning: { ...learning } });
      return true;
    },
    assign(id, countryId, ministryId, gameTime) {
      const profile = legacyProfiles.get(String(id));
      const runtime = { ministerId: String(id), countryId, ministryId, status: 'ACTIVE', assignmentTime: gameTime,
        confidence: 0.5, trust: 0.5, workload: 0, stress: 0 };
      legacyRecords.set(String(id), { profile, runtime, learning: {} });
      return runtime;
    }
  };

  const legacySystem = {
    registry: legacyRegistry,
    getCandidates(ministryId) { return [...legacyProfiles.values()].filter(profile => profile.ministryId === ministryId); },
    getMinister(id) {
      const state = legacyRecords.get(String(id));
      return state ? { ministerId: String(id), profile: state.profile, runtime: state.runtime,
        learning: state.learning, effectiveCapability: 60 } : null;
    },
    getActive(countryId, ministryId) {
      for (const [id, state] of legacyRecords.entries()) {
        if (state.runtime?.countryId === countryId && state.runtime?.ministryId === ministryId && state.runtime?.status === 'ACTIVE') {
          return { ministerId: id, profile: state.profile, runtime: state.runtime, learning: state.learning, effectiveCapability: 60 };
        }
      }
      return null;
    },
    recruit(id, countryId, ministryId) {
      const profile = legacyProfiles.get(String(id));
      if (!profile) throw new Error('CANDIDATE_NOT_FOUND');
      const runtime = legacyRegistry.assign(id, countryId, ministryId, 0);
      dispatchEvent(new TestCustomEvent('MINISTER_RECRUITED', { detail: { ministerId: id, countryId, ministryId } }));
      return { ministerId: id, countryId, ministryId, runtime };
    },
    fire(id) {
      const state = legacyRecords.get(String(id));
      if (!state) return null;
      state.runtime.status = 'FIRED';
      dispatchEvent(new TestCustomEvent('MINISTER_FIRED', { detail: {
        ministerId: String(id), countryId: state.runtime.countryId, ministryId: state.runtime.ministryId
      } }));
      return state;
    },
    persist() {}, synchronize() {}
  };

  const sandbox = {
    CustomEvent: TestCustomEvent,
    dispatchEvent,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    OmegaMinisterStateRegistry: canonicalRegistry,
    OmegaMinisterSystem: legacySystem,
    OmegaCabinetUI: {},
    Game: { gameTime: 0 }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  if (initialMinister) canonicalRegistry.recruitCandidate(initialMinister, 'BGD', 'finance', 0);
  vm.runInNewContext(pipelineSource, sandbox, { filename: 'omega_minister_intelligence_pipeline_v1.js' });
  return { sandbox, canonicalRegistry, legacySystem, legacyRegistry, legacyProfiles, legacyRecords };
}

const legacyFirst = makeSandbox(null);
const legacyCandidate = {
  id: 'legacy-minister-01', name: 'Legacy Finance Minister', ministryId: 'finance', stats: { fiscal: 81 },
  efficiency: { efficiency: 78 }, background: 'Public finance'
};
legacyFirst.legacyProfiles.set(legacyCandidate.id, legacyCandidate);
legacyFirst.legacyRegistry.assign(legacyCandidate.id, 'BGD', 'finance', 1);
legacyFirst.sandbox.dispatchEvent(new TestCustomEvent('MINISTER_RECRUITED', { detail: {
  ministerId: legacyCandidate.id, countryId: 'BGD', ministryId: 'finance'
} }));
const canonicalFromLegacy = legacyFirst.canonicalRegistry.getActiveMinister('BGD', 'finance');
assert.equal(canonicalFromLegacy?.ministerId, legacyCandidate.id, 'Legacy recruitment must reach the canonical registry.');
assert.equal(canonicalFromLegacy?.runtimeState?.status, 'ACTIVE');
assert.equal(legacyFirst.sandbox.OmegaMinisterIntelligencePipeline.diagnostics().bridgeErrors.length, 0);

const canonicalFirst = makeSandbox({
  id: 'canonical-minister-01', name: 'Canonical Finance Minister', ministryId: 'finance',
  stats: { fiscal: 90 }, efficiency: { efficiency: 89 }, background: 'Fiscal strategy'
});
const legacyFromCanonical = canonicalFirst.legacySystem.getActive('BGD', 'finance');
assert.equal(legacyFromCanonical?.ministerId, 'canonical-minister-01', 'Canonical recruitment must be visible in the legacy runtime.');
assert.equal(legacyFromCanonical?.runtime?.status, 'ACTIVE');
assert.equal(legacyFromCanonical?.runtime?.confidence, 0.5, 'Canonical percentage-scale confidence must convert for the legacy runtime.');
assert.equal(canonicalFirst.sandbox.OmegaMinisterIntelligencePipeline.diagnostics().bridgeErrors.length, 0);

console.log('OMEGA MINISTER STATE BRIDGE V1: PASS');
console.log('Legacy recruitment -> canonical registry: PASS');
console.log('Canonical recruitment -> legacy runtime: PASS');
console.log('Confidence scale adaptation and zero bridge errors: PASS');
