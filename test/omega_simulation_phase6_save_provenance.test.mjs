import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function makeSandbox() {
  const state = { population: {}, economy: {}, relations: {}, simulation: {} };
  const sandbox = {
    console,
    Date,
    JSON,
    Object,
    Number,
    String,
    Math,
    Map,
    Set,
    WeakMap,
    Error,
    TypeError,
    Promise,
    structuredClone,
    localStorage: {
      data: new Map(),
      setItem(key, value) { this.data.set(key, String(value)); },
      getItem(key) { return this.data.get(key) || null; }
    },
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    dispatchEvent() { return true; },
    addEventListener() {},
    Game: { state, currentActiveCountry: 'BANGLADESH' },
    gameState: { population: {}, economy: {} },
    Omega: {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return { sandbox, state };
}
function loadScript(path, sandbox) {
  const source = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: path });
}

test('simulation save snapshot includes Phase 6 provenance and restores it without world-state mutation', () => {
  const { sandbox, state } = makeSandbox();
  loadScript('omega_simulation_runtime.js', sandbox);
  const provenance = {
    schemaVersion: 1,
    runtimeVersion: '1.0.0',
    countryId: 'BGD',
    turn: 0,
    population: { value: 175686899, sourceId: 'WORLD_BANK_WDI', observationYear: 2025 },
    rates: { version: '1.0.0', resourceProfileCount: 41, calibratedCount: 37, uncalibratedCount: 4 },
    inputFingerprint: 'a1b2c3d4'
  };
  let restored = null;
  sandbox.OmegaPhase6NationalCapacity = {
    saveState() { return structuredClone(provenance); },
    loadState(snapshot) { restored = snapshot; return { status: snapshot ? 'PENDING_REVALIDATION' : 'NO_SNAPSHOT' }; }
  };
  sandbox.Omega.Simulation.configure({ state, ministryPump() { return null; } });
  sandbox.Omega.GameSession.createSession({ playerCountryId: 'BANGLADESH' });
  const before = JSON.stringify(state);
  const saved = sandbox.Omega.GameSession.saveState();
  assert.equal(JSON.stringify(state), before);
  assert.equal(saved.phase6NationalCapacity.inputFingerprint, 'a1b2c3d4');
  assert.equal(saved.checksum.length, 8);
  sandbox.Omega.GameSession.loadState(saved);
  assert.equal(restored.inputFingerprint, 'a1b2c3d4');
  assert.equal(restored.rates.resourceProfileCount, 41);
});

test('legacy saves without Phase 6 metadata reset any prior Phase 6 provenance reference', () => {
  const { sandbox, state } = makeSandbox();
  loadScript('omega_simulation_runtime.js', sandbox);
  let received = 'unset';
  sandbox.OmegaPhase6NationalCapacity = {
    saveState() { return null; },
    loadState(snapshot) { received = snapshot; return { status: 'NO_SNAPSHOT' }; }
  };
  sandbox.Omega.Simulation.configure({ state, ministryPump() { return null; } });
  sandbox.Omega.GameSession.createSession({ playerCountryId: 'BANGLADESH' });
  const saved = sandbox.Omega.GameSession.saveState();
  delete saved.phase6NationalCapacity;
  delete saved.checksum;
  sandbox.Omega.GameSession.loadState(saved);
  assert.equal(received, null);
});
