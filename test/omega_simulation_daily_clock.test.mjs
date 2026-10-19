import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY_MS = 86400000;
const STEP_MS = 10000;
const simulationSource = fs.readFileSync(path.join(root, 'omega_simulation_runtime.js'), 'utf8');

function createRuntime() {
  const storage = new Map();
  const listeners = new Map();
  const dispatched = [];
  class TestCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const gameState = {
    simulation: {},
    economy: { BGD: { treasury: 1250000, gdp: 9000000 } },
    resource: { BGD: { inventory: { crude_oil: 17 } } },
    population: { BGD: { active_manpower: 6000 } },
    playerCountryId: 'BGD'
  };
  const win = {
    console,
    CustomEvent: TestCustomEvent,
    Game: { state: gameState, currentActiveCountry: 'BGD', playerCountry: 'BGD' },
    gameState,
    currentActiveCountry: 'BGD',
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    },
    addEventListener(type, listener) {
      const rows = listeners.get(type) || [];
      rows.push(listener);
      listeners.set(type, rows);
    },
    dispatchEvent(event) {
      dispatched.push(event);
      const rows = listeners.get(event.type) || [];
      for (const listener of rows) listener(event);
      return true;
    },
    setTimeout,
    clearTimeout,
    indexedDB: null
  };
  win.window = win;
  const context = vm.createContext({
    window: win,
    globalThis: win,
    CustomEvent: TestCustomEvent,
    console,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(simulationSource, context, { filename: 'omega_simulation_runtime.js' });
  const sim = win.Omega.Simulation;
  const worldTicks = [];
  sim.configure({
    playerCountryResolver: () => 'BGD',
    worldEngine: {
      setAuthoritativeState() {},
      processSimulationTick(duration, turn) {
        worldTicks.push({ duration, turn });
        return { duration, turn };
      }
    }
  });
  sim.createSession({ playerCountryId: 'BGD' });
  return { win, sim, gameState, storage, dispatched, worldTicks };
}

test('one 10-second real-time interval advances exactly one shared game day', async () => {
  const { win, sim, gameState, dispatched, worldTicks } = createRuntime();
  assert.equal(sim.clock.stepDurationMs, DAY_MS);
  assert.equal(sim.clock.turn, 0);
  sim.startSession({ playerCountryId: 'BGD' });

  const before = await sim.frame(STEP_MS - 1);
  assert.equal(before.steps, 0);
  assert.equal(sim.clock.turn, 0);
  assert.equal(gameState.simulation.turn, 0);
  assert.equal(worldTicks.length, 0);

  const after = await sim.frame(1);
  assert.equal(after.steps, 1);
  assert.equal(sim.clock.turn, 1);
  assert.equal(gameState.simulation.turn, 1);
  assert.equal(gameState.simulation.date, '2015-01-02T00:00:00.000Z');
  assert.deepEqual(worldTicks, [{ duration: DAY_MS, turn: 1 }]);

  const turnEvent = dispatched.find(event => event.type === 'OMEGA_SIMULATION_TURN_COMMITTED');
  assert.ok(turnEvent, 'central turn-commit event should be published');
  assert.equal(turnEvent.detail.simulationTurn, 1);
  assert.equal(turnEvent.detail.payload.stepDurationMs, DAY_MS);
  assert.equal(turnEvent.detail.payload.day, 2);
  assert.equal(turnEvent.detail.payload.simulationDate, '2015-01-02T00:00:00.000Z');
});

test('save slot restores selected country, game date and authoritative state', async () => {
  const { sim, gameState, storage } = createRuntime();
  sim.startSession({ playerCountryId: 'BGD' });
  await sim.advance(4);
  gameState.economy.BGD.treasury = 777;
  gameState.resource.BGD.inventory.crude_oil = 31;

  const result = sim.saveSlot('default');
  assert.equal(result.ok, true);
  assert.equal(storage.has('omega.game.save.default'), true);
  const saved = JSON.parse(storage.get('omega.game.save.default'));
  assert.equal(saved.clock.turn, 4);
  assert.equal(saved.clock.stepDurationMs, DAY_MS);
  assert.equal(saved.worldState.simulation.session.playerCountryId, 'BGD');

  gameState.economy.BGD.treasury = 0;
  gameState.resource.BGD.inventory.crude_oil = 0;
  gameState.simulation.date = '1900-01-01T00:00:00.000Z';
  sim.loadSlot('default');

  assert.equal(gameState.economy.BGD.treasury, 777);
  assert.equal(gameState.resource.BGD.inventory.crude_oil, 31);
  assert.equal(gameState.simulation.date, '2015-01-05T00:00:00.000Z');
  assert.equal(sim.getPlayerCountryId(), 'BGD');
  assert.equal(sim.clock.turn, 4);
});

test('legacy hourly save is migrated to one calendar day per turn', () => {
  const { sim, gameState } = createRuntime();
  sim.createSession({ playerCountryId: 'BGD', startTurn: 7, simulationTimeMs: 7 * 3600000 });
  const legacy = sim.saveState();
  delete legacy.checksum;
  legacy.clock.stepDurationMs = 3600000;
  legacy.clock.simulationTimeMs = 7 * 3600000;

  sim.loadState(legacy);
  assert.equal(sim.clock.turn, 7);
  assert.equal(sim.clock.stepDurationMs, DAY_MS);
  assert.equal(sim.clock.simulationTimeMs, 7 * DAY_MS);
  assert.equal(gameState.simulation.date, '2015-01-08T00:00:00.000Z');
});

test('index, finance, bank and offline shell use the daily lifecycle assets', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const lifecycle = fs.readFileSync(path.join(root, 'omega_game_lifecycle_runtime_v1.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'omega_game_lifecycle_runtime_v1.css'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'omega-offline-map-sw.js'), 'utf8');
  const financeRules = JSON.parse(fs.readFileSync(path.join(root, 'finance_runtime_rules_v1.json'), 'utf8'));
  const finance = fs.readFileSync(path.join(root, 'omega_finance_ministry_runtime_v1.js'), 'utf8');
  const banking = fs.readFileSync(path.join(root, 'omega_government_banking_runtime_v1.js'), 'utf8');

  assert.match(index, /id="omega-global-time-hud"/);
  assert.match(index, /src="omega_game_lifecycle_runtime_v1\.js" defer/);
  assert.match(index, /href="omega_game_lifecycle_runtime_v1\.css"/);
  assert.match(lifecycle, /omega\.game\.save\./);
  assert.match(lifecycle, /visibilitychange/);
  assert.match(lifecycle, /pagehide/);
  assert.match(css, /body\.ios-active #omega-global-time-hud/);
  assert.equal(financeRules.simulationTurnDurationMs, DAY_MS);
  assert.match(finance, /DAY_MS=86400000/);
  assert.match(banking, /dayTurns = 1/);
  assert.match(serviceWorker, /omega-offline-atlas-shell-v9/);
  assert.match(serviceWorker, /omega_game_lifecycle_runtime_v1\.js/);
  assert.match(serviceWorker, /omega_game_lifecycle_runtime_v1\.css/);
});


test('finance, FX, macro and ministry time fallbacks treat one turn as one day', () => {
  const transmissionRules = JSON.parse(fs.readFileSync(path.join(root, 'financial_transmission_rules_v1.json'), 'utf8'));
  const macroRules = JSON.parse(fs.readFileSync(path.join(root, 'finance_macro_stability_rules_v1.json'), 'utf8'));
  const transmission = fs.readFileSync(path.join(root, 'omega_economic_transmission_runtime_v1.js'), 'utf8');
  const fx = fs.readFileSync(path.join(root, 'omega_forex_monetary_engine_v1.js'), 'utf8');
  const macro = fs.readFileSync(path.join(root, 'omega_macro_stability_runtime_v1.js'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'omega_home_ministry_engine_v1.js'), 'utf8');
  const military = fs.readFileSync(path.join(root, 'omega_battlefield_command_runtime_v1.js'), 'utf8');

  assert.equal(transmissionRules.simulationTurnDurationMs, DAY_MS);
  assert.equal(macroRules.simulationTurnDurationMs, DAY_MS);
  assert.match(transmission, /\\?\\?DAY_MS/);
  assert.doesNotMatch(transmission, /Math\\.floor\\(currentTurn\\(\\)\\s*\\/\\s*24\\)/);
  assert.match(fx, /finite\\(durationMs\\) \\?\\? DAY_MS/);
  assert.match(fx, /Math\\.floor\\(turnNumber\\) % 3 === 0/);
  assert.match(macro, /simulationTurnDurationMs\\|\\|86400000/);
  assert.doesNotMatch(macro, /315864000000/);
  assert.match(home, /const step=num\\(sim&&sim\\.clock&&sim\\.stepDurationMs\\)\\|\\|DAY_MS/);
  assert.match(military, /simTurn\\(\\) \\* 86400000/);
});
