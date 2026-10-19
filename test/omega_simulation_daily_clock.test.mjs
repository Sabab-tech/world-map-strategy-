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
      if (!rows.includes(listener)) rows.push(listener);
      listeners.set(type, rows);
    },
    removeEventListener(type, listener) {
      const rows = listeners.get(type) || [];
      const index = rows.indexOf(listener);
      if (index >= 0) rows.splice(index, 1);
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
  assert.equal(sim.clock.simulationTimeMs, 7 * 3600000, 'migration preserves the exact saved simulation timestamp');
  assert.equal(gameState.simulation.date, '2015-01-01T07:00:00.000Z');
});

test('index, finance, bank and offline shell use the daily lifecycle assets', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const lifecycle = fs.readFileSync(path.join(root, 'omega_game_lifecycle_runtime_v1.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'omega_game_lifecycle_runtime_v1.css'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'omega-offline-map-sw.js'), 'utf8');
  const financeRules = JSON.parse(fs.readFileSync(path.join(root, 'finance_runtime_rules_v1.json'), 'utf8'));
  const finance = fs.readFileSync(path.join(root, 'omega_finance_ministry_runtime_v1.js'), 'utf8');
  const banking = fs.readFileSync(path.join(root, 'omega_government_banking_runtime_v1.js'), 'utf8');
  const core = fs.readFileSync(path.join(root, 'omega_simulation_runtime.js'), 'utf8');
  const endowment = fs.readFileSync(path.join(root, 'omega_resource_endowment_runtime.js'), 'utf8');
  const resourceEconomy = fs.readFileSync(path.join(root, 'omega_resource_economy_runtime_v2.js'), 'utf8');
  const macro = fs.readFileSync(path.join(root, 'omega_macro_stability_runtime_v1.js'), 'utf8');

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
  assert.match(serviceWorker, /resource_industrial_catalog_v1\.json/);
  assert.match(core, /registerTurnParticipant\(id,handler,options=\{\}\)/);
  assert.match(core, /registerTurnFinalizer\(id,handler,options=\{\}\)/);
  assert.match(core, /await this\.runTurnFinalizers\(/);
  assert.match(core, /await this\.runTurnParticipants\(event\)/);
  assert.match(core, /__OMEGA_SIMULATION_PIPELINE_ACTIVE__/);
  assert.match(core, /TURN_PARTICIPANT_FAILED/);
  assert.match(lifecycle, /priority: Number\.MAX_SAFE_INTEGER/);
  assert.match(lifecycle, /registerTurnFinalizer\('omega\.game-lifecycle\.autosave'/);
  assert.match(lifecycle, /LOCAL_STORAGE_AND_INDEXEDDB_SAVE_FAILED/);
  assert.doesNotMatch(lifecycle, /Math\.floor\(turn\) % 3/);
  assert.match(lifecycle, /function saveNow\(options\)/);
  assert.match(lifecycle, /function onPageExit\(\)/);
  assert.match(endowment, /function onTurn\(\)\{return extractAll\(\);\}/);
  assert.match(resourceEconomy, /return runTurn\(\);/);
  assert.match(macro, /return init\(\)\.then\(\(\)=>advanceTurn\(turn,duration\)\)/);
});


test('finance, FX, macro and ministry time fallbacks treat one turn as one day', () => {
  const transmissionRules = JSON.parse(fs.readFileSync(path.join(root, 'financial_transmission_rules_v1.json'), 'utf8'));
  const macroRules = JSON.parse(fs.readFileSync(path.join(root, 'finance_macro_stability_rules_v1.json'), 'utf8'));
  const transmission = fs.readFileSync(path.join(root, 'omega_economic_transmission_runtime_v1.js'), 'utf8');
  const fx = fs.readFileSync(path.join(root, 'omega_forex_monetary_engine_v1.js'), 'utf8');
  const macro = fs.readFileSync(path.join(root, 'omega_macro_stability_runtime_v1.js'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'omega_home_ministry_engine_v1.js'), 'utf8');
  const military = fs.readFileSync(path.join(root, 'omega_battlefield_command_runtime_v1.js'), 'utf8');
  const industrial = fs.readFileSync(path.join(root, 'omega_resource_industrial_network_v1.js'), 'utf8');
  const industrialCatalog = JSON.parse(fs.readFileSync(path.join(root, 'resource_industrial_catalog_v1.json'), 'utf8'));

  assert.equal(transmissionRules.simulationTurnDurationMs, DAY_MS);
  assert.equal(macroRules.simulationTurnDurationMs, DAY_MS);
  assert.match(transmission, /\?\?DAY_MS/);
  assert.doesNotMatch(transmission, /Math\.floor\(currentTurn\(\)\s*\/\s*24\)/);
  assert.match(fx, /finite\(durationMs\) \?\? DAY_MS/);
  assert.match(fx, /Math\.floor\(turnNumber\) % 3 === 0/);
  assert.match(macro, /simulationTurnDurationMs\|\|86400000/);
  assert.doesNotMatch(macro, /315864000000/);
  assert.match(home, /DAY_MS = 86400000/);
  assert.match(military, /simTurn\(\) \* 86400000/);
  assert.match(industrial, /clock\?\.stepDurationMs/);
  assert.match(industrial, /milliseconds\/86400000/);
  assert.equal(industrialCatalog.turnAssumption.daysPerTurn, 1);
});


test('legacy sector listeners are awaited in one ordered pipeline and never double-run', async () => {
  const { win, sim, dispatched } = createRuntime();
  const order = [];
  sim.registerTurnParticipant('test.explicit-a', async ({ detail }) => {
    order.push('explicit-a:start:' + detail.simulationTurn);
    await Promise.resolve();
    order.push('explicit-a:end:' + detail.simulationTurn);
  }, { priority: 10 });
  win.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', async event => {
    order.push('legacy:start:' + event.detail.simulationTurn);
    await new Promise(resolve => setTimeout(resolve, 5));
    order.push('legacy:end:' + event.detail.simulationTurn);
  });
  sim.registerSubsystem('test.explicit-b', async (_event, context) => {
    order.push('explicit-b:' + context.turn);
  }, { priority: 20 });

  sim.startSession({ playerCountryId: 'BGD' });
  await sim.frame(STEP_MS);

  assert.deepEqual(order, [
    'legacy:start:1',
    'legacy:end:1',
    'explicit-a:start:1',
    'explicit-a:end:1',
    'explicit-b:1'
  ]);
  assert.equal(dispatched.filter(event => event.type === 'OMEGA_SIMULATION_TURN_COMMITTED').length, 1);
  assert.equal(order.filter(value => value === 'legacy:start:1').length, 1, 'legacy adapter must not execute the same handler twice');
  assert.equal(sim.diagnostics().turnParticipantCount, 3);
  assert.ok(sim.diagnostics().lastTurnParticipantResults.every(row => row.status === 'COMPLETED'));
});

test('a subsystem registered during a turn starts on the next turn, not halfway through the current one', async () => {
  const { win, sim } = createRuntime();
  const order = [];
  let installed = false;
  win.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', event => {
    order.push('existing:' + event.detail.simulationTurn);
    if (!installed) {
      installed = true;
      win.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', nextEvent => {
        order.push('future:' + nextEvent.detail.simulationTurn);
      });
    }
  });
  sim.startSession({ playerCountryId: 'BGD' });

  await sim.frame(STEP_MS);
  assert.deepEqual(order, ['existing:1']);
  await sim.frame(STEP_MS);
  assert.deepEqual(order, ['existing:1', 'existing:2', 'future:2']);
});

test('a failed sector stops future days and exposes the exact failed participant', async () => {
  const { win, sim } = createRuntime();
  const order = [];
  sim.registerTurnParticipant('test.failing-sector', async () => {
    order.push('failed-sector');
    throw new Error('SYNTHETIC_SECTOR_FAILURE');
  }, { priority: 10 });
  sim.registerTurnParticipant('test.after-failure', async context => {
    order.push('later-sector:' + context.turn);
  }, { priority: 20 });
  sim.startSession({ playerCountryId: 'BGD' });

  const result = await sim.frame(STEP_MS * 3);
  assert.equal(result.status, 'ERROR');
  assert.equal(sim.status, 'ERROR');
  assert.equal(sim.clock.paused, true);
  assert.equal(sim.clock.turn, 1);
  assert.deepEqual(order, ['failed-sector', 'later-sector:1']);
  assert.ok(sim.diagnostics().lastTurnParticipantResults.some(row =>
    row.id === 'test.failing-sector' && row.status === 'FAILED' && row.error.includes('SYNTHETIC_SECTOR_FAILURE')));
});

test('lifecycle autosaves only after async sector work and catches pagehide without Back navigation', async () => {
  const { win, sim, gameState, storage } = createRuntime();
  const documentListeners = new Map();
  win.document = {
    readyState: 'interactive',
    visibilityState: 'visible',
    addEventListener(type, handler) {
      const rows = documentListeners.get(type) || [];
      rows.push(handler);
      documentListeners.set(type, rows);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const lifecycleSource = fs.readFileSync(path.join(root, 'omega_game_lifecycle_runtime_v1.js'), 'utf8');
  const lifecycleContext = vm.createContext({
    window: win, globalThis: win, console, setTimeout, clearTimeout,
    Date, JSON, Number, String, Math, Promise, Map, Object, Array, Error, Intl
  });
  vm.runInContext(lifecycleSource, lifecycleContext, { filename: 'omega_game_lifecycle_runtime_v1.js' });
  await win.Omega.GameLifecycle.restore();

  win.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    gameState.economy.BGD.treasury = 777777;
  });
  await sim.frame(STEP_MS);

  let saved = JSON.parse(storage.get('omega.game.save.default'));
  assert.equal(saved.clock.turn, 1);
  assert.equal(saved.worldState.simulation.date, '2015-01-02T00:00:00.000Z');
  assert.equal(saved.worldState.economy.BGD.treasury, 777777,
    'final-priority autosave must include completed async sector effects');

  gameState.economy.BGD.treasury = 999999;
  win.dispatchEvent(new win.CustomEvent('pagehide'));
  saved = JSON.parse(storage.get('omega.game.save.default'));
  assert.equal(saved.worldState.economy.BGD.treasury, 999999,
    'pagehide snapshot must be written even without any Back-button action');
  assert.ok(win.Omega.GameLifecycle.getDiagnostics().savedTurn >= 1);
});

test('daily tick supplies the same turn, duration and date to every subsystem', async () => {
  const { win, sim, dispatched } = createRuntime();
  const seen = [];
  sim.registerSubsystem('test.shared-clock.a', async (_event, context) => {
    seen.push({ subsystem: 'a', turn: context.turn, duration: context.stepDurationMs, date: context.simulationDate });
  });
  sim.registerSubsystem('test.shared-clock.b', async (_event, context) => {
    seen.push({ subsystem: 'b', turn: context.turn, duration: context.stepDurationMs, date: context.simulationDate });
  });
  sim.startSession({ playerCountryId: 'BGD' });
  await sim.frame(STEP_MS * 5);

  assert.equal(seen.length, 10);
  for (let turn = 1; turn <= 5; turn++) {
    const pair = seen.filter(row => row.turn === turn);
    assert.equal(pair.length, 2);
    assert.deepEqual(pair.map(row => row.subsystem), ['a', 'b']);
    assert.ok(pair.every(row => row.duration === DAY_MS));
    assert.ok(pair.every(row => row.date === new Date(Date.UTC(2015, 0, 1 + turn)).toISOString()));
  }
  assert.equal(dispatched.filter(event => event.type === 'OMEGA_SIMULATION_TURN_COMMITTED').length, 5);
});
