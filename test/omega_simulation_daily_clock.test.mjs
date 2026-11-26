import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY_MS = 86400000;
const STEP_MS = 15000;
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

function attachLifecycle(win, sim, nodes = new Map()) {
  const documentListeners = new Map();
  win.document = {
    readyState: 'interactive',
    visibilityState: 'visible',
    addEventListener(type, handler) {
      const rows = documentListeners.get(type) || [];
      rows.push(handler);
      documentListeners.set(type, rows);
    },
    querySelector(selector) { return nodes.get(selector) || null; },
    querySelectorAll() { return []; }
  };
  win.Omega.App = { state: 'READY', simulation: sim };
  const lifecycleSource = fs.readFileSync(path.join(root, 'omega_game_lifecycle_runtime_v1.js'), 'utf8');
  const lifecycleContext = vm.createContext({
    window: win, globalThis: win, console, setTimeout, clearTimeout,
    Date, JSON, Number, String, Math, Promise, Map, Object, Array, Error, Intl
  });
  vm.runInContext(lifecycleSource, lifecycleContext, { filename: 'omega_game_lifecycle_runtime_v1.js' });
  return { documentListeners, lifecycle: win.Omega.GameLifecycle, nodes };
}

test('one 15-second real-time interval advances exactly one shared game day', async () => {
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

  const result = await sim.saveSlot('default');
  assert.equal(result.ok, true);
  assert.equal(storage.has('omega.game.save.default'), true);
  const saved = JSON.parse(storage.get('omega.game.save.default'));
  assert.equal(saved.clock.turn, 4);
  assert.equal(saved.clock.stepDurationMs, DAY_MS);
  assert.equal(saved.worldState.simulation.session.playerCountryId, 'BGD');

  gameState.economy.BGD.treasury = 0;
  gameState.resource.BGD.inventory.crude_oil = 0;
  gameState.simulation.date = '1900-01-01T00:00:00.000Z';
  await sim.loadSlot('default');

  assert.equal(gameState.economy.BGD.treasury, 777);
  assert.equal(gameState.resource.BGD.inventory.crude_oil, 31);
  assert.equal(gameState.simulation.date, '2015-01-05T00:00:00.000Z');
  assert.equal(sim.getPlayerCountryId(), 'BGD');
  assert.equal(sim.clock.turn, 4);
});

test('save slot preserves an unfinished factory project, reserved input batches and in-progress production cycle', async () => {
  const { sim, gameState, storage } = createRuntime();
  sim.startSession({ playerCountryId: 'BGD' });
  await sim.advance(2);

  gameState.economy.BGD.productionAssets = [{
    id: 'FAC-BGD-STEEL-01',
    countryId: 'BGD',
    factoryType: 'STEEL_AND_ALLOY_WORKS',
    recipeId: 'STEEL_PRIMARY_ROUTE_V1',
    recipeMode: 'MULTI_INPUT',
    inputCoefficients: {
      iron_concentrate: 0.60, coal_concentrate: 0.20,
      cement_feed: 0.10, copper_concentrate: 0.10
    },
    outputProfile: { STEEL: 0.72, ALLOY_STEEL: 0.08, BLAST_FURNACE_SLAG: 0.15, PROCESSING_DUST: 0.05 },
    status: 'OPERATIONAL',
    inputInventory: {
      iron_concentrate: 30, coal_concentrate: 10, cement_feed: 5, copper_concentrate: 5
    },
    inputBatchLots: [
      {
        batchId: 'INPUT-IRON-01', resourceId: 'iron_concentrate', quantity: 30, remainingQuantity: 30,
        cycleReservationId: 'CYCLE-STEEL-01', cycleReservedQuantity: 30,
        sourceBatchIds: ['MINE-BGD-IRON-01'], unit: 'SIMULATION_TONNE_EQUIVALENT'
      },
      {
        batchId: 'INPUT-COAL-01', resourceId: 'coal_concentrate', quantity: 10, remainingQuantity: 10,
        cycleReservationId: 'CYCLE-STEEL-01', cycleReservedQuantity: 10,
        sourceBatchIds: ['MINE-BGD-COAL-01'], unit: 'SIMULATION_TONNE_EQUIVALENT'
      },
      {
        batchId: 'INPUT-CEMENT-01', resourceId: 'cement_feed', quantity: 5, remainingQuantity: 5,
        cycleReservationId: 'CYCLE-STEEL-01', cycleReservedQuantity: 5,
        sourceBatchIds: ['MINE-BGD-CEMENT-01'], unit: 'SIMULATION_TONNE_EQUIVALENT'
      },
      {
        batchId: 'INPUT-COPPER-01', resourceId: 'copper_concentrate', quantity: 5, remainingQuantity: 5,
        cycleReservationId: 'CYCLE-STEEL-01', cycleReservedQuantity: 5,
        sourceBatchIds: ['MINE-BGD-COPPER-01'], unit: 'SIMULATION_TONNE_EQUIVALENT'
      }
    ]
  }];

  gameState.resource.BGD.industrialNetwork = {
    schemaVersion: '1.0.0',
    projects: [{
      projectId: 'PROJECT-BGD-CHEM-01',
      projectType: 'FACTORY_CONSTRUCTION',
      countryId: 'BGD',
      factoryId: 'FAC-BGD-CHEM-01',
      status: 'UNDER_CONSTRUCTION',
      startDate: '2026-06-13',
      estimatedCompletionDate: '2026-12-13',
      requestId: 'SAVE-FACTORY-PROJECT-01',
      constructionMaterialsStatus: 'CONSUMED',
      materialAllocations: [{ resourceId: 'steel', quantity: 120, batchId: 'BUILD-MATERIAL-01' }]
    }],
    factoryProductionCycles: {
      'FAC-BGD-STEEL-01': {
        cycleId: 'CYCLE-STEEL-01',
        factoryId: 'FAC-BGD-STEEL-01',
        countryId: 'BGD',
        status: 'IN_PROGRESS',
        recipeId: 'STEEL_PRIMARY_ROUTE_V1',
        recipeMode: 'MULTI_INPUT',
        recipe: {
          recipeId: 'STEEL_PRIMARY_ROUTE_V1',
          factoryType: 'STEEL_AND_ALLOY_WORKS',
          inputs: {
            iron_concentrate: 0.60, coal_concentrate: 0.20,
            cement_feed: 0.10, copper_concentrate: 0.10
          },
          outputs: { STEEL: 0.72, ALLOY_STEEL: 0.08, BLAST_FURNACE_SLAG: 0.15, PROCESSING_DUST: 0.05 },
          cycleDays: 2
        },
        primaryInputResourceId: 'iron_concentrate',
        inputQuantities: {
          iron_concentrate: 30, coal_concentrate: 10, cement_feed: 5, copper_concentrate: 5
        },
        expectedOutputs: { STEEL: 36, ALLOY_STEEL: 4, BLAST_FURNACE_SLAG: 7.5, PROCESSING_DUST: 2.5 },
        startDate: '2015-01-03',
        finishDate: '2015-01-06',
        productionQuantity: 50,
        sourceBatchIds: [
          'MINE-BGD-IRON-01', 'MINE-BGD-COAL-01', 'MINE-BGD-CEMENT-01', 'MINE-BGD-COPPER-01'
        ],
        inputBatchReservations: [
          { batchId: 'INPUT-IRON-01', resourceId: 'iron_concentrate', quantity: 30, unit: 'SIMULATION_TONNE_EQUIVALENT' },
          { batchId: 'INPUT-COAL-01', resourceId: 'coal_concentrate', quantity: 10, unit: 'SIMULATION_TONNE_EQUIVALENT' },
          { batchId: 'INPUT-CEMENT-01', resourceId: 'cement_feed', quantity: 5, unit: 'SIMULATION_TONNE_EQUIVALENT' },
          { batchId: 'INPUT-COPPER-01', resourceId: 'copper_concentrate', quantity: 5, unit: 'SIMULATION_TONNE_EQUIVALENT' }
        ],
        outputQuantities: { STEEL: 36, ALLOY_STEEL: 4, BLAST_FURNACE_SLAG: 7.5, PROCESSING_DUST: 2.5 }
      }
    },
    factoryProductionCycleHistory: []
  };

  const expectedProject = JSON.parse(JSON.stringify(gameState.resource.BGD.industrialNetwork.projects[0]));
  const expectedCycle = JSON.parse(JSON.stringify(gameState.resource.BGD.industrialNetwork.factoryProductionCycles['FAC-BGD-STEEL-01']));
  const expectedFactoryRecipe = JSON.parse(JSON.stringify({
    recipeId: gameState.economy.BGD.productionAssets[0].recipeId,
    recipeMode: gameState.economy.BGD.productionAssets[0].recipeMode,
    inputCoefficients: gameState.economy.BGD.productionAssets[0].inputCoefficients,
    outputProfile: gameState.economy.BGD.productionAssets[0].outputProfile
  }));
  const expectedInputInventory = JSON.parse(JSON.stringify(gameState.economy.BGD.productionAssets[0].inputInventory));
  const expectedInputLots = JSON.parse(JSON.stringify(gameState.economy.BGD.productionAssets[0].inputBatchLots));
  const saved = await sim.saveSlot('factory-acceptance');
  assert.equal(saved.ok, true);
  assert.equal(storage.has('omega.game.save.factory-acceptance'), true);

  gameState.resource.BGD.industrialNetwork.projects = [];
  gameState.resource.BGD.industrialNetwork.factoryProductionCycles = {};
  gameState.economy.BGD.productionAssets = [];
  const restored = await sim.loadSlot('factory-acceptance');
  assert.equal(restored.lastLoadIntegrity, 'VERIFIED', 'the restored factory snapshot must pass authoritative save integrity validation');

  assert.deepEqual(JSON.parse(JSON.stringify(gameState.resource.BGD.industrialNetwork.projects[0])), expectedProject,
    'construction dates, consumed BOM allocations and request identity must survive reload');
  assert.deepEqual(JSON.parse(JSON.stringify(gameState.resource.BGD.industrialNetwork.factoryProductionCycles['FAC-BGD-STEEL-01'])), expectedCycle,
    'cycle status, finish date, exact batch reservations and expected outputs must survive reload');
  const restoredFactory = gameState.economy.BGD.productionAssets[0];
  assert.deepEqual(JSON.parse(JSON.stringify({
    recipeId: restoredFactory.recipeId, recipeMode: restoredFactory.recipeMode,
    inputCoefficients: restoredFactory.inputCoefficients, outputProfile: restoredFactory.outputProfile
  })), expectedFactoryRecipe,
    'the canonical factory recipe identity and coefficients must survive the real save-slot reload');
  assert.deepEqual(JSON.parse(JSON.stringify(restoredFactory.inputInventory)), expectedInputInventory,
    'all aggregate factory input balances must survive the real save-slot reload');
  assert.deepEqual(JSON.parse(JSON.stringify(restoredFactory.inputBatchLots)), expectedInputLots,
    'all reserved input lots, remaining quantities and mine lineage must survive the real save-slot reload');
  assert.equal(restoredFactory.inputBatchLots.length, 4);
  assert.equal(restoredFactory.inputBatchLots.reduce((sum, lot) => sum + Number(lot.cycleReservedQuantity || 0), 0), 50);
  const restoredCycle = gameState.resource.BGD.industrialNetwork.factoryProductionCycles['FAC-BGD-STEEL-01'];
  assert.equal(restoredCycle.status, 'IN_PROGRESS');
  assert.equal(restoredCycle.recipeId, 'STEEL_PRIMARY_ROUTE_V1');
  assert.deepEqual(JSON.parse(JSON.stringify(restoredCycle.inputQuantities)), expectedInputInventory,
    'cycle input demand must survive unchanged and remain aligned with the recipe');
  assert.deepEqual(JSON.parse(JSON.stringify(restoredCycle.expectedOutputs)), {
    STEEL: 36, ALLOY_STEEL: 4, BLAST_FURNACE_SLAG: 7.5, PROCESSING_DUST: 2.5
  });
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
  const ministryEngine = fs.readFileSync(path.join(root, 'ministry_engine.js'), 'utf8');
  const ministerIntegration = fs.readFileSync(path.join(root, 'omega_minister_integration.js'), 'utf8');
  const liveOps = fs.readFileSync(path.join(root, 'omega_live_operations_observability_v1.js'), 'utf8');
  const coordinator = fs.readFileSync(path.join(root, 'omega_enterprise_composition_root_v10.js'), 'utf8');

  assert.match(index, /id="omega-global-time-hud"/);
  assert.match(index, /data-omega-clock-progress/);
  assert.match(lifecycle, /function updateClockProgress\(\)/);
  assert.match(lifecycle, /OMEGA_SIMULATION_CLOCK_TICK', updateClockProgress/,
    'the visible day-progress indicator must follow the authoritative clock without queuing a full HUD render');
  assert.match(index, /data-omega-speed-readout/);
  assert.match(index, /data-omega-treasury-readout/);
  assert.match(index, /<details class="ogth-advanced"/);
  assert.match(lifecycle, /realTimeStepMs = 15000/,
    'clock progress must use the canonical real-time step, not the 24-hour in-game simulation duration');
  assert.doesNotMatch(lifecycle.slice(lifecycle.indexOf('function updateClockProgress'), lifecycle.indexOf('function updateHud')),
    /clock\.stepDurationMs/,
    'real-time accumulator progress must not be divided by the in-game day duration');
  assert.match(lifecycle, /function queueHudUpdate\(forceResourceHudRefresh\)/,
    'bursty lifecycle events must share one animation-frame HUD refresh');
  assert.match(coordinator, /OMEGA_SIMULATION_CLOCK_TICK/);
  const topHeaderStart = index.indexOf('id="top-status-bar"');
  const unifiedHudStart = index.indexOf('id="omega-global-time-hud"');
  const metricDropdownStart = index.indexOf('id="map-metric-dropdown"');
  assert.ok(topHeaderStart >= 0 && unifiedHudStart > topHeaderStart && unifiedHudStart < metricDropdownStart,
    'the lifecycle HUD must be embedded in the existing top status bar');
  assert.match(index, /data-speed="3" title="Very Fast Speed">3x/);
  assert.match(index, /data-omega-speed="3" aria-label="Three times game speed" title="Three times speed">3x/);
  assert.match(index, /data-omega-action="step-day"/);
  assert.match(index, /data-omega-action="advance-days"/);
  assert.match(index, /data-omega-action="cancel-advance"/);
  assert.match(index, /data-omega-action="diagnostics"/);
  assert.match(index, /max="365"[^>]*data-omega-days/);
  assert.match(index, /omega_manual_time_controls_v1\.css/);
  const manualTimeCss = fs.readFileSync(path.join(root, 'omega_manual_time_controls_v1.css'), 'utf8');
  assert.match(manualTimeCss, /#omega-global-time-hud \{[\s\S]{0,80}position: fixed !important;/);
  assert.match(manualTimeCss, /z-index: 2147483646 !important;/);
  assert.match(manualTimeCss, /#top-status-bar\.top-status-bar/);
  assert.match(lifecycle, /function beginManualAdvance\(turns\)/);
  assert.match(lifecycle, /sim\.advance\(count, \{ yieldEvery: 1 \}\)/);
  assert.match(core, /MAX_STEPS_PER_FRAME=1/);
  assert.match(core, /droppedScaledTimeMs/);
  assert.match(core, /cancelAdvance\(\)/);
  assert.match(css, /#top-status-bar \.status-right \{[\s\S]{0,40}display: none !important;/);
  assert.match(css, /max-height: 104px !important;\n  flex-wrap: wrap !important;/,
    'the compact header must wrap the metrics onto a second row instead of squeezing them off-screen');
  assert.match(css, /#omega-global-time-hud \.ogth-topline,[\s\S]{0,140}display: none !important;/);
  assert.match(css, /#omega-global-time-hud \.ogth-economy/);
  assert.ok(lifecycle.includes("'  GDP ' + (gdp === null ? 'Not recorded' : money(gdp))"),
    'the compact economy line must show the selected country GDP without inventing missing data');
  assert.match(lifecycle, /event\.stopImmediatePropagation\(\)/,
    'the unified speed control must prevent legacy click handlers from overwriting the authoritative clock speed');
  assert.match(index, /src="omega_game_lifecycle_runtime_v1\.js" defer/);
  assert.ok(fs.existsSync(path.join(root, 'omega_game_lifecycle_runtime_v1.css')), 'legacy lifecycle CSS stays on disk');
  assert.doesNotMatch(index, /<link[^>]+href="omega_game_lifecycle_runtime_v1\.css"/i);
  assert.match(index, /<link[^>]+href="omega_ui_v2\/omega-ui-v2\.css"/);
  assert.ok(index.indexOf('src="omega_simulation_runtime.js"') < index.indexOf('src="map-engine-1.js"'),
    'the canonical clock bridge must load before map and ministry runtime initialization');
  assert.ok(index.indexOf('src="omega_simulation_runtime.js"') < index.indexOf('src="omega_ministry_registry.js"'),
    'the canonical clock bridge must load before ministry registries and their listeners');
  assert.ok(index.indexOf('src="omega_simulation_runtime.js"') < index.indexOf('src="omega_resource_research_runtime_v1.js"'),
    'the canonical event bridge must load before any sector registers a turn listener');
  assert.ok(index.indexOf('src="omega_simulation_runtime.js"') < index.indexOf('src="omega_resource_endowment_runtime.js"'),
    'resource extraction must join the canonical pipeline rather than race the clock');
  assert.match(lifecycle, /omega\.game\.save\./);
  assert.match(lifecycle, /visibilitychange/);
  assert.match(lifecycle, /pagehide/);
  assert.match(css, /body\.ios-active #omega-global-time-hud/);
  assert.equal(financeRules.simulationTurnDurationMs, DAY_MS);
  assert.match(finance, /DAY_MS=86400000/);
  assert.match(banking, /dayTurns = 1/);
  assert.match(serviceWorker, /omega-offline-atlas-shell-v\d+/);
  const cacheVersionMatch = serviceWorker.match(/CACHE_NAME = "omega-offline-atlas-shell-v([0-9]+)"/);
  const offlineShellVersion = Number(cacheVersionMatch?.[1] || 0);
  assert.ok(offlineShellVersion >= 23, 'the offline shell cache must invalidate stale UI assets after the country overview changes');
  assert.ok(offlineShellVersion >= 148, 'the offline shell must refresh the live game-clock progress controls');
  assert.ok(serviceWorker.includes('"./omega_manual_time_controls_v1.css"'),
    'the fixed global time-control stylesheet must remain in the offline core asset cache');
  assert.match(serviceWorker, /omega_game_lifecycle_runtime_v1\.js/);
  assert.doesNotMatch(serviceWorker, /"\.\/omega_game_lifecycle_runtime_v1\.css"/, 'legacy lifecycle CSS is not preloaded');
  assert.match(serviceWorker, /"\.\/omega_ui_v2\/omega-ui-v2\.css"/);
  assert.match(serviceWorker, /resource_industrial_catalog_v1\.json/);
  assert.match(core, /registerTurnParticipant\(id,handler,options=\{\}\)/);
  assert.match(core, /installEventLedgerTurnBridge/);
  assert.match(core, /registerTurnFinalizer\(id,handler,options=\{\}\)/);
  assert.match(core, /await this\.runTurnFinalizers\(/);
  assert.match(core, /'FINALIZE'/);
  assert.match(core, /await this\.runTurnParticipants\(event\)/);
  assert.match(core, /__OMEGA_SIMULATION_PIPELINE_ACTIVE__/);
  assert.match(core, /TURN_PARTICIPANT_FAILED/);
  assert.match(lifecycle, /priority: Number\.MAX_SAFE_INTEGER/);
  assert.match(lifecycle, /registerTurnFinalizer\('omega\.game-lifecycle\.autosave'/);
  assert.match(lifecycle, /sim\.saveSlot\(SLOT,\s*\{/,
    'routine lifecycle persistence must use the canonical Simulation.saveSlot API');
  assert.match(lifecycle, /await sim\.loadSlot\(SLOT\)/,
    'startup must restore from the same canonical save slot');
  assert.match(lifecycle, /STATE_SAVE_DEBOUNCE_MS = 1200/);
  assert.match(lifecycle, /STATE_SAVE_MAX_WAIT_MS = 8000/);
  assert.match(lifecycle, /TURN_SAVE_INTERVAL_MS = 10000/);
  assert.match(lifecycle, /storage\.persist\(\)/,
    'the browser should be asked to protect the local save from automatic eviction');
  assert.doesNotMatch(lifecycle, /function writeIndexedSave\(/,
    'the retired lifecycle database must not receive a second independent copy of each save');
  const diagnosticsStart = lifecycle.indexOf('getDiagnostics: function () {');
  const diagnosticsEnd = lifecycle.indexOf('\n    }\n  };', diagnosticsStart);
  assert.doesNotMatch(lifecycle.slice(diagnosticsStart, diagnosticsEnd), /sim\.saveState\(/,
    'reading save diagnostics must not clone the full world on the UI thread');
  assert.match(lifecycle, /installMutationEventSaveBridge/);
  assert.match(lifecycle, /_STATE_UPDATED|_APPLIED|_COMPLETED/);
  assert.match(lifecycle, /GAME ERROR · LAST COMPLETE SAVE PRESERVED/);
  assert.doesNotMatch(lifecycle, /Math\.floor\(turn\) % 3/);
  assert.match(lifecycle, /function saveNow\(options\)/);
  assert.match(lifecycle, /function onPageExit\(\)/);
  assert.match(lifecycle, /stopAllBackgroundRuns/);
  assert.match(lifecycle, /startAllBackgroundRuns/);
  assert.doesNotMatch(ministryEngine, /window\._resourceChartTimer = setInterval/,
    'resource visual charts must not own a continuously running synthetic production timer');
  assert.doesNotMatch(ministerIntegration, /setInterval\(/,
    'minister consistency checks must be driven by state-change events');
  assert.doesNotMatch(liveOps, /refreshHandle = g\.setInterval/,
    'Live Operations must refresh from events instead of a background poll');
  assert.doesNotMatch(endowment, /function onTurn\(\)\{return extractAll\(\);\}/,
    'the endowment runtime must not attach a second global extraction tick');
  assert.doesNotMatch(endowment, /addEventListener\?\.\('OMEGA_SIMULATION_TURN_COMMITTED',onTurn\)/,
    'the country-scoped economy owns production ticks to prevent world-wide duplicate extraction');
  assert.match(resourceEconomy, /endowment\.extractCountry\(cid\)/,
    'the economy must invoke extraction through the selected player-country ID');
  assert.match(resourceEconomy, /function runTurn\(\)[\s\S]*?return task;/, 'the selected-country turn wrapper must return its serialized async task');
  assert.match(resourceEconomy, /then\(function\(\)\{return runTurnCore\(cid\);\}\)/, 'the turn wrapper must serialize the country core without duplicating the simulation clock');
  assert.match(macro, /registerCountryHandler\('omega-macro-stability'/,
    'Macro Stability must register with the bounded country scheduler');
  assert.match(macro, /advanceCountry\(countryId,context\.turn,context\.stepDurationMs\)/,
    'Macro Stability must consume the scheduler-selected country and authoritative simulation duration');
  assert.doesNotMatch(macro, /OMEGA_SIMULATION_TURN_COMMITTED/,
    'Macro Stability must not auto-run its legacy all-profile batch on every committed turn');
});


test('finance, FX, macro and ministry time fallbacks treat one turn as one day', () => {
  const transmissionRules = JSON.parse(fs.readFileSync(path.join(root, 'financial_transmission_rules_v1.json'), 'utf8'));
  const macroRules = JSON.parse(fs.readFileSync(path.join(root, 'finance_macro_stability_rules_v1.json'), 'utf8'));
  const transmission = fs.readFileSync(path.join(root, 'omega_economic_transmission_runtime_v1.js'), 'utf8');
  const fx = fs.readFileSync(path.join(root, 'omega_forex_monetary_engine_v1.js'), 'utf8');
  const finance = fs.readFileSync(path.join(root, 'omega_finance_ministry_runtime_v1.js'), 'utf8');
  const npcMacro = fs.readFileSync(path.join(root, 'omega_npc_national_macro_economy_runtime_v1.js'), 'utf8');
  const macro = fs.readFileSync(path.join(root, 'omega_macro_stability_runtime_v1.js'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'omega_home_ministry_engine_v1.js'), 'utf8');
  const military = fs.readFileSync(path.join(root, 'omega_battlefield_command_runtime_v1.js'), 'utf8');
  const industrial = fs.readFileSync(path.join(root, 'omega_resource_industrial_network_v1.js'), 'utf8');
  const hardening = fs.readFileSync(path.join(root, 'omega_resource_system_hardening_v1.js'), 'utf8');
  const industrialCatalog = JSON.parse(fs.readFileSync(path.join(root, 'resource_industrial_catalog_v1.json'), 'utf8'));

  assert.equal(transmissionRules.simulationTurnDurationMs, DAY_MS);
  assert.equal(macroRules.simulationTurnDurationMs, DAY_MS);
  assert.match(finance, /registerCountryHandler\('omega-finance-ministry',advanceCountry,[\s\S]*?priority:15\}\)/,
    'Finance must run as the second scheduler-scoped national progression handler');
  assert.doesNotMatch(finance, /OMEGA_SIMULATION_TURN_COMMITTED/,
    'Finance must not retain its former all-profile committed-turn loop');
  assert.match(macro, /registerCountryHandler\('omega-macro-stability',[\s\S]*?priority:10\}\)/);
  assert.match(transmission, /registerCountryHandler\('omega-economic-transmission',[\s\S]*?priority:\s*20\s*\}\)/);
  assert.match(npcMacro, /priority: finite\(runtime\.rules\.scheduler\?\.priority\) \?\? 30/,
    'the evidence checkpoint must observe the country Finance and transmission updates later in the same handler order');
  assert.match(transmission, /num\(durationMs\)\s*\?\?\s*DAY_MS/,
    'Economic Transmission must fall back to one simulated day when no authoritative duration is supplied');
  assert.match(transmission, /registerCountryHandler\('omega-economic-transmission'/);
  assert.match(transmission, /stepCountry\(countryId, context\.turn, context\.stepDurationMs\)/);
  assert.doesNotMatch(transmission, /OMEGA_SIMULATION_TURN_COMMITTED',function\(event\)/,
    'Economic Transmission must not restore the legacy all-profile turn listener');
  assert.doesNotMatch(transmission, /Math\.floor\(currentTurn\(\)\s*\/\s*24\)/);
  assert.match(fx, /finite\(durationMs\) \?\? DAY_MS/);
  assert.match(fx, /Math\.floor\(turnNumber\) % 3 === 0/);
  assert.match(macro, /simulationTurnDurationMs\|\|86400000/);
  assert.doesNotMatch(macro, /315864000000/);
  assert.match(home, /DAY_MS = 86400000/);
  assert.match(military, /simTurn\(\) \* 86400000/);
  assert.match(industrial, /clock\?\.stepDurationMs/);
  assert.match(industrial, /if\(num\(clock\?\.stepDurationMs\)!==null\)return 1/);
  assert.match(hardening, /OMEGA_SIMULATION_TURN_COMMITTED',[() =>]*\{ensureFactoryRecipes\(\);\}/);
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
  sim.registerTurnParticipant('test.after-failure', async (_event, context) => {
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

test('boot and app-background transitions stop every automatic game turn until Play is explicitly pressed', async () => {
  const { win, sim, storage } = createRuntime();
  const { documentListeners, lifecycle } = attachLifecycle(win, sim);
  await lifecycle.restore();

  assert.equal(sim.status, 'PAUSED');
  assert.equal(sim.clock.paused, true);
  assert.equal(lifecycle.getDiagnostics().backgroundRunsEnabled, false);
  assert.match(lifecycle.getDiagnostics().status, /BACKGROUND SYSTEMS PAUSED/);
  const bootFrame = await sim.frame(STEP_MS * 3);
  assert.equal(bootFrame.steps, 0);
  assert.equal(sim.clock.turn, 0, 'restoring a country must not start resource, factory, economy or AI turns');

  assert.equal(lifecycle.startAllBackgroundRuns(), true, 'Play should explicitly re-enable game turns');
  assert.equal(sim.status, 'RUNNING');
  await sim.frame(STEP_MS);
  const committedTurn = sim.clock.turn;
  assert.equal(committedTurn, 1);

  win.document.visibilityState = 'hidden';
  for (const listener of documentListeners.get('visibilitychange') || []) listener();
  assert.equal(sim.status, 'PAUSED');
  assert.equal(sim.clock.paused, true);
  let saved = JSON.parse(storage.get('omega.game.save.default'));
  assert.equal(saved.status, 'PAUSED');
  assert.equal(saved.worldState.simulation.session.status, 'PAUSED',
    'the saved checkpoint must record the pause instead of a RUNNING session');

  win.document.visibilityState = 'visible';
  for (const listener of documentListeners.get('visibilitychange') || []) listener();
  assert.equal(sim.status, 'PAUSED', 'returning to the app must not restart background runs');
  assert.equal(lifecycle.getDiagnostics().backgroundRunsEnabled, false);
  const foregroundFrame = await sim.frame(STEP_MS * 3);
  assert.equal(foregroundFrame.steps, 0);
  assert.equal(sim.clock.turn, committedTurn);
});

test('restoring a previously RUNNING save preserves the world but keeps all automated sectors paused', async () => {
  const { win, sim, gameState, storage } = createRuntime();
  sim.startSession({ playerCountryId: 'BGD' });
  await sim.advance(2);
  gameState.economy.BGD.treasury = 987654;
  const previousRunningSave = sim.saveState();
  assert.equal(previousRunningSave.status, 'RUNNING');
  storage.set('omega.game.save.default', JSON.stringify(previousRunningSave));
  sim.stopSession();

  const { lifecycle } = attachLifecycle(win, sim);
  await lifecycle.restore();
  assert.equal(sim.status, 'PAUSED');
  assert.equal(sim.clock.paused, true);
  assert.equal(sim.clock.turn, 2);
  assert.equal(gameState.economy.BGD.treasury, 987654, 'pausing must not discard the saved economy state');
  assert.equal(lifecycle.getDiagnostics().backgroundRunsEnabled, false);
  const frame = await sim.frame(STEP_MS);
  assert.equal(frame.steps, 0);
  assert.equal(sim.clock.turn, 2);
});

test('lifecycle autosaves only after async sector work and catches pagehide without Back navigation', async () => {
  const { win, sim, gameState, storage } = createRuntime();
  attachLifecycle(win, sim);
  await win.Omega.GameLifecycle.restore();
  assert.equal(win.Omega.GameLifecycle.startAllBackgroundRuns(), true,
    'the existing lifecycle save test must explicitly resume after the new safe boot pause');

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

  gameState.economy.BGD.treasury = 123;
  sim.status = 'ERROR';
  win.dispatchEvent(new win.CustomEvent('pagehide'));
  saved = JSON.parse(storage.get('omega.game.save.default'));
  assert.equal(saved.worldState.economy.BGD.treasury, 999999,
    'a failed turn must not overwrite the last complete durable checkpoint');
  assert.ok(win.Omega.GameLifecycle.getDiagnostics().savedTurn >= 1);
});

test('lifecycle coalesces rapid mutations into one canonical save and flushes player exit', async () => {
  const { win, sim, gameState, storage } = createRuntime();
  const { lifecycle } = attachLifecycle(win, sim);
  await lifecycle.restore();

  const originalSaveSlot = sim.saveSlot.bind(sim);
  const saveCalls = [];
  sim.saveSlot = async slot => {
    saveCalls.push(slot);
    return originalSaveSlot(slot);
  };
  saveCalls.length = 0;

  gameState.economy.BGD.treasury = 1234567;
  for (let index = 0; index < 12; index += 1) {
    win.dispatchEvent(new win.CustomEvent('MINISTRY_STATE_CHANGED'));
    win.dispatchEvent(new win.CustomEvent('OMEGA_COMMAND_APPLIED'));
  }
  await new Promise(resolve => setTimeout(resolve, 1450));

  assert.equal(saveCalls.length, 1,
    'a burst of domain events must create one durable snapshot, not one storage write per event');
  assert.ok(saveCalls.every(slot => slot === 'default'),
    'all lifecycle saves must use the one canonical default slot');
  let saved = JSON.parse(storage.get('omega.game.save.default'));
  assert.equal(saved.worldState.economy.BGD.treasury, 1234567,
    'the coalesced snapshot must contain the latest mutation in the burst');

  gameState.economy.BGD.treasury = 7654321;
  win.dispatchEvent(new win.CustomEvent('pagehide'));
  win.dispatchEvent(new win.CustomEvent('beforeunload'));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(saveCalls.length, 2,
    'leaving the page must flush the latest state once even when pagehide and beforeunload both fire');
  saved = JSON.parse(storage.get('omega.game.save.default'));
  assert.equal(saved.worldState.economy.BGD.treasury, 7654321,
    'the exit checkpoint must contain the final player state');
  assert.equal(lifecycle.getDiagnostics().dirty, false);
  assert.equal(lifecycle.getDiagnostics().saveCount >= 3, true,
    'startup, coalesced mutation and exit snapshots must all be counted');
});

test('internal Simulation.events subscribers are awaited and ordered with legacy window listeners', async () => {
  const { sim } = createRuntime();
  const order = [];
  sim.events.subscribe('OMEGA_SIMULATION_TURN_COMMITTED', async event => {
    order.push('ledger:start:' + event.simulationTurn);
    await new Promise(resolve => setTimeout(resolve, 5));
    order.push('ledger:end:' + event.simulationTurn);
  });
  sim.registerSubsystem('test.after-ledger', async (_event, context) => {
    order.push('explicit:' + context.turn);
  }, { priority: 5 });

  sim.startSession({ playerCountryId: 'BGD' });
  await sim.frame(STEP_MS);

  assert.deepEqual(order, ['ledger:start:1', 'ledger:end:1', 'explicit:1']);
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
  await sim.advance(5);

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

test('Resource Economy registers as one ordered simulation subsystem instead of a legacy turn listener', async () => {
  const { win, sim, gameState } = createRuntime();
  const beforeParticipants = sim.diagnostics().turnParticipantCount;
  let industrialCalls = 0;
  win.CustomEvent = class {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  };
  gameState.resource.BGD = { inventory: {}, batches: [], mines: [] };
  gameState.economy.BGD = { productionAssets: [] };
  win.Omega.ResourceIndustrialNetwork = {
    async runCountryTurn(countryId) {
      industrialCalls += 1;
      assert.equal(countryId, 'BGD');
      return { countryId, factory: { completed: [], blocked: [] } };
    }
  };

  const economySource = fs.readFileSync(path.join(root, 'omega_resource_economy_runtime_v2.js'), 'utf8');
  const economyContext = vm.createContext({
    window: win, globalThis: win, console, CustomEvent: win.CustomEvent,
    Date, JSON, Number, String, Math, Object, Array, Set, Map, WeakMap, Promise, Intl
  });
  vm.runInContext(economySource, economyContext, { filename: 'omega_resource_economy_runtime_v2.js' });

  assert.equal(win.Omega.ResourceEconomy.diagnostics().turnParticipantMode, 'ORDERED_SUBSYSTEM');
  assert.equal(sim.diagnostics().turnParticipantCount, beforeParticipants + 1,
    'Resource Economy must register one stable participant with the canonical simulation runner');

  sim.startSession({ playerCountryId: 'BGD' });
  await sim.frame(STEP_MS);

  assert.equal(industrialCalls, 1, 'the ordered participant must run the selected-country economy exactly once');
  const resourceParticipants = sim.diagnostics().lastTurnParticipantResults
    .filter(row => row.id === 'omega.resource-economy.player-country');
  assert.equal(resourceParticipants.length, 1);
  assert.equal(resourceParticipants[0].status, 'COMPLETED');
});


test('manual time HUD buttons step days, run selected days, pause/resume and expose diagnostics', async () => {
  const { win, sim, gameState } = createRuntime();
  const { documentListeners, lifecycle } = attachLifecycle(win, sim);
  await lifecycle.restore();

  const diagnosticsPanel = { hidden: true, textContent: '' };
  win.document.querySelector = (selector) => {
    if (selector === '[data-omega-days]') return { value: '2' };
    if (selector === '[data-omega-diagnostics]') return diagnosticsPanel;
    return null;
  };
  const dispatchAction = (action) => {
    const target = {
      closest(selector) {
        return selector.includes('[data-omega-action="' + action + '"]') ? this : null;
      },
      hasAttribute(name) { return name === 'data-omega-action'; },
      getAttribute(name) { return name === 'data-omega-action' ? action : null; }
    };
    const event = {
      target, cancelable: true,
      preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {}
    };
    for (const listener of documentListeners.get('click') || []) listener(event);
  };
  const waitForManualFinish = async () => {
    for (let attempt = 0; attempt < 200 && lifecycle.getDiagnostics().manualCommandInFlight; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    assert.equal(lifecycle.getDiagnostics().manualCommandInFlight, false, 'the manual HUD action should settle');
  };

  dispatchAction('advance-days');
  await waitForManualFinish();
  assert.equal(sim.clock.turn, 2, 'RUN DAYS must use the numeric days input');
  assert.equal(sim.status, 'PAUSED', 'manual time testing must leave automatic time paused');
  assert.equal(gameState.simulation.date, '2015-01-03T00:00:00.000Z');

  dispatchAction('step-day');
  await waitForManualFinish();
  assert.equal(sim.clock.turn, 3, '+1 DAY must commit exactly one authoritative day');
  assert.equal(gameState.simulation.date, '2015-01-04T00:00:00.000Z');

  dispatchAction('diagnostics');
  assert.equal(diagnosticsPanel.hidden, false);
  const report = JSON.parse(diagnosticsPanel.textContent);
  assert.equal(report.simulation.clock.turn, 3);
  assert.equal(report.lifecycle.restoreFinished, true);

  const progressAttributes = {};
  const progressBar = { setAttribute(name, value) { progressAttributes[name] = String(value); } };
  const progressFill = { style: {} };
  const progressLabel = { textContent: '' };
  const nativeQuerySelector = win.document.querySelector;
  win.document.querySelector = (selector) => {
    if (selector === '[data-omega-clock-progress]') return progressBar;
    if (selector === '[data-omega-clock-progress-fill]') return progressFill;
    if (selector === '[data-omega-clock-progress-label]') return progressLabel;
    return nativeQuerySelector(selector);
  };

  dispatchAction('toggle');
  assert.equal(sim.status, 'RUNNING', 'Play must resume the canonical clock');
  assert.equal(sim.clock.speed, 1, 'Play must always use the visible normal game speed');
  sim.clock.accumulatorMs = STEP_MS / 2;
  win.dispatchEvent(new win.CustomEvent('OMEGA_SIMULATION_CLOCK_TICK'));
  assert.equal(progressFill.style.width, '50%',
    'the visible day-progress bar must reflect the current configured clock step');
  assert.equal(progressAttributes['aria-valuenow'], '50',
    'the visible progressbar must expose its current percentage accessibly');
  assert.equal(progressAttributes['aria-label'], 'Progress toward next game day: 50%');
  assert.equal(progressLabel.textContent, 'NEXT DAY · 50%',
    'the compact HUD must show current day progress without rebuilding the full HUD');

  dispatchAction('pause');
  assert.equal(sim.status, 'PAUSED', 'Pause must stop further automatic turns');
});

test('backgrounding during a manual day batch cancels after the in-flight day and keeps time paused', async () => {
  const { win, sim } = createRuntime();
  const { documentListeners, lifecycle } = attachLifecycle(win, sim);
  await lifecycle.restore();
  let release, notifyStarted;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { notifyStarted = resolve; });
  sim.registerTurnParticipant('test.background-manual-batch', async () => {
    notifyStarted();
    await gate;
  });
  assert.equal(lifecycle.advanceDays(4), true);
  await started;

  win.document.visibilityState = 'hidden';
  for (const listener of documentListeners.get('visibilitychange') || []) listener();
  release();
  for (let attempt = 0; attempt < 200 && lifecycle.getDiagnostics().manualCommandInFlight; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  assert.equal(sim.clock.turn, 1, 'only the current authoritative day may commit after backgrounding');
  assert.equal(sim.status, 'PAUSED');
  assert.equal(sim.clock.paused, true);
  assert.equal(sim.manualAdvanceInProgress, false);
  assert.equal(lifecycle.getDiagnostics().backgroundRunsEnabled, false);
});


test('global time controls are moved outside the clipped header and expose an explicit start action', () => {
  const lifecycle = fs.readFileSync(path.join(root, 'omega_game_lifecycle_runtime_v1.js'), 'utf8');
  const hudCss = fs.readFileSync(path.join(root, 'omega_manual_time_controls_v1.css'), 'utf8');
  assert.match(lifecycle, /function ensureTimeHudPlacement\(\)/);
  assert.match(lifecycle, /ensureTimeHudPlacement\(\);/);
  assert.match(lifecycle, /toggleLabel = running \? 'PAUSE TIME' : status === 'PAUSED' \? 'RESUME TIME'.*'START TIME'/);
  assert.match(hudCss, /#omega-global-time-hud \.ogth-controls button/);
  assert.match(hudCss, /data-omega-action="toggle"/);
  assert.match(hudCss, /ogth-clock-progress/);
  assert.match(lifecycle, /aria-pressed/);
  assert.match(hudCss, /z-index: 2147483646 !important;/,
    'the body-level time dock must stay above the UI v2 cabinet stacking layer (2147483000)');
  assert.match(hudCss, /pointer-events: auto !important;/,
    'the persistent time dock must accept pointer and touch input');
  assert.match(hudCss, /button\[data-omega-action="toggle"\][\s\S]*?min-height: 30px !important;/,
    'the always-available clock toggle must remain compact without losing a usable target');
});


test('compact gameplay clock keeps date, Treasury and a live accessible day-progress indicator', () => {
  const lifecycle = fs.readFileSync(path.join(root, 'omega_game_lifecycle_runtime_v1.js'), 'utf8');
  const hudCss = fs.readFileSync(path.join(root, 'omega_manual_time_controls_v1.css'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'omega-offline-map-sw.js'), 'utf8');
  const activeDockCss = hudCss.slice(hudCss.lastIndexOf('/* OMEGA time HUD v2:'));

  assert.match(lifecycle, /function ensurePauseButton\(\)/);
  assert.match(lifecycle, /button\.setAttribute\('data-omega-action', 'pause'\)/);
  assert.match(lifecycle, /toggle\.textContent = running \? 'Ⅱ' : '▶'/);
  assert.match(lifecycle, /toggle\.disabled = clockUnavailable;/);
  assert.match(activeDockCss, /top: calc\(env\(safe-area-inset-top, 0px\) \+ 52px\) !important;/);
  assert.match(activeDockCss, /right: 8px !important;/);
  assert.match(activeDockCss, /left: 8px !important;/);
  assert.match(activeDockCss, /\.ogth-advanced:not\(\[open\]\) > \.ogth-advanced-content \{ display: none !important; \}/);
  assert.match(activeDockCss, /\.ogth-clock-progress-row[\s\S]*?display: flex !important;/);
  assert.match(activeDockCss, /height: 30px !important;/);
  assert.match(serviceWorker, /omega-offline-atlas-shell-v156/);
  assert.match(lifecycle, /function queueHudUpdate\(forceResourceHudRefresh\)/);
  assert.match(lifecycle, /hudUpdateFrame !== null \|\| hudUpdateTimer !== null/);
  assert.match(lifecycle, /OMEGA_SIMULATION_CLOCK_TICK', updateClockProgress/,
    'the visible progress row updates from the clock signal without a full HUD repaint');
  const hudStart = lifecycle.indexOf('function updateHud(');
  const hudEnd = lifecycle.indexOf('function queueHudUpdate(', hudStart);
  assert.ok(hudStart >= 0 && hudEnd > hudStart);
  assert.match(lifecycle.slice(hudStart, hudEnd), /updateClockProgress\(\)/,
    'a committed turn also refreshes the visible progress indicator');
});

test('the single play/pause control toggles without losing the selected game speed', () => {
  const { win, sim } = createRuntime();
  const toggle = {
    textContent: '',
    title: '',
    disabled: false,
    attributes: new Map([['data-omega-action', 'toggle']]),
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
    hasAttribute(name) { return this.attributes.has(name); },
    closest() { return this; }
  };
  const speedThree = {
    attributes: new Map([['data-omega-speed', '3']]),
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
    hasAttribute(name) { return this.attributes.has(name); },
    closest() { return this; }
  };
  const nodes = new Map([['[data-omega-action="toggle"]', toggle]]);
  const { documentListeners } = attachLifecycle(win, sim, nodes);
  const click = target => {
    const event = {
      target,
      cancelable: true,
      preventDefault() {},
      stopImmediatePropagation() {},
      stopPropagation() {}
    };
    for (const handler of documentListeners.get('click') || []) handler(event);
  };

  assert.equal(toggle.textContent, '▶');
  assert.equal(toggle.getAttribute('aria-label'), 'Start game');
  assert.equal(toggle.disabled, false);

  click(toggle);
  assert.equal(sim.status, 'RUNNING');
  assert.equal(sim.clock.speed, 1);
  assert.equal(toggle.textContent, 'Ⅱ');
  assert.equal(toggle.getAttribute('aria-label'), 'Pause game');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(toggle.disabled, false, 'the visible toggle remains usable while the game is running');

  click(speedThree);
  assert.equal(sim.status, 'RUNNING');
  assert.equal(sim.clock.speed, 3);

  click(toggle);
  assert.equal(sim.status, 'PAUSED');
  assert.equal(sim.clock.speed, 0);
  assert.equal(toggle.textContent, '▶');
  assert.equal(toggle.getAttribute('aria-label'), 'Resume game');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');

  click(toggle);
  assert.equal(sim.status, 'RUNNING');
  assert.equal(sim.clock.speed, 3, "resuming must restore the player's last selected speed");
  assert.equal(toggle.textContent, 'Ⅱ');
});


test('bursty finance, resource and turn events coalesce to one HUD refresh per animation frame', async () => {
  const { win, sim, gameState } = createRuntime();
  const queuedFrames = [];
  let resourceHudUpdates = 0;
  win.requestAnimationFrame = callback => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  win.updateGlobalResourceHUD = country => {
    assert.equal(country, 'BGD');
    resourceHudUpdates += 1;
  };
  const { lifecycle } = attachLifecycle(win, sim);
  await lifecycle.restore();
  sim.clock.turn = 1;
  gameState.simulation.turn = 1;
  resourceHudUpdates = 0;

  const event = type => win.dispatchEvent(new win.CustomEvent(type));
  event('OMEGA_FINANCE_STATE_UPDATED');
  event('OMEGA_FINANCE_STATE_UPDATED');
  event('RESOURCE_STATE_UPDATED');
  event('OMEGA_SIMULATION_STEP_COMPLETED');
  event('OMEGA_SIMULATION_TURN_COMMITTED');
  event('OMEGA_SIMULATION_BATCH_COMPLETED');

  assert.equal(queuedFrames.length, 1,
    'a burst of different state events must schedule only one DOM refresh');
  assert.equal(resourceHudUpdates, 0,
    'state events must not synchronously rerender the player resource HUD');
  queuedFrames.shift()();
  assert.equal(resourceHudUpdates, 1,
    'the scheduled frame must refresh the player resource HUD once');

  event('OMEGA_FINANCE_STATE_UPDATED');
  assert.equal(queuedFrames.length, 1,
    'a later Finance event must schedule the next frame after the previous refresh completes');
  queuedFrames.shift()();
  assert.equal(resourceHudUpdates, 1,
    'Finance updates during the same game turn must not rebuild the resource HUD');

  event('RESOURCE_STATE_UPDATED');
  event('OMEGA_RESOURCE_ECONOMY_UPDATED');
  event('RESOURCE_STATE_UPDATED');
  assert.equal(queuedFrames.length, 1,
    'same-turn resource change events must share one scheduled HUD refresh');
  queuedFrames.shift()();
  assert.equal(resourceHudUpdates, 2,
    'a real resource change must refresh the resource HUD without waiting for the next game day');

  sim.clock.turn = 2;
  gameState.simulation.turn = 2;
  event('OMEGA_SIMULATION_TURN_COMMITTED');
  assert.equal(queuedFrames.length, 1);
  queuedFrames.shift()();
  assert.equal(resourceHudUpdates, 3,
    'the resource HUD may refresh again after the authoritative game day changes');
});


test('the game-time HUD updates budget balance and macro stability only from committed country indicators', () => {
  const { win, sim, gameState } = createRuntime();
  const queuedFrames = [];
  win.requestAnimationFrame = callback => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  let indicators = {
    gdpUsd:9000000,
    annualBudgetBalanceUsd:-125000,
    stabilityScore:61.5,
    stabilityStatus:'WATCH'
  };
  const economyNode = { textContent:'', title:'' };
  const nodes = new Map([['[data-omega-economy]', economyNode]]);
  win.OmegaMacroStabilityRuntime = {
    getIndicators(countryId) {
      assert.equal(countryId,'BGD');
      return indicators;
    }
  };
  const { lifecycle } = attachLifecycle(win,sim,nodes);
  lifecycle.updateHud();
  assert.match(economyNode.textContent,/Budget balance -\$125K/);
  assert.match(economyNode.textContent,/Stability 61\.5\/100/);

  indicators = {
    gdpUsd:9400000,
    annualBudgetBalanceUsd:275000,
    stabilityScore:74.2,
    stabilityStatus:'STABLE'
  };
  sim.clock.turn = 1;
  gameState.simulation.turn = 1;
  win.dispatchEvent(new win.CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED',{detail:{simulationTurn:1}}));
  assert.equal(queuedFrames.length,1,'the committed turn should schedule a single HUD frame');
  queuedFrames.shift()();
  assert.match(economyNode.textContent,/Budget balance \$275K/);
  assert.match(economyNode.textContent,/Stability 74\.2\/100/);
  assert.match(economyNode.textContent,/STABLE/);
});


test('sub-day clock frames skip compatibility hydration until a real day commits', async () => {
  const { sim, gameState } = createRuntime();
  sim.startSession({ playerCountryId: 'BGD' });

  const originalHydrate = sim.world.hydrateCompatibility.bind(sim.world);
  let hydrationCalls = 0;
  sim.world.hydrateCompatibility = function () {
    hydrationCalls += 1;
    return originalHydrate();
  };

  for (let frame = 0; frame < 29; frame += 1) {
    const result = await sim.frame(500);
    assert.equal(result.steps, 0, 'the first 29 half-second frames must not commit a day');
  }
  assert.equal(hydrationCalls, 0,
    'sub-day frames must not repeatedly inspect population/economy compatibility roots');
  assert.equal(sim.clock.turn, 0);

  const committed = await sim.frame(500);
  assert.equal(committed.steps, 1, 'the 30th half-second frame commits one authoritative day');
  assert.equal(hydrationCalls, 1,
    'the real day step must still hydrate compatibility state exactly once');
  assert.equal(sim.clock.turn, 1);
  assert.equal(gameState.simulation.date, '2015-01-02T00:00:00.000Z');
});


test('NPC-only Finance and Macro events do not repaint the player HUD', async () => {
  const { win, sim } = createRuntime();
  const queuedFrames = [];
  let financeReads = 0;
  win.requestAnimationFrame = callback => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  win.OmegaFinanceMinistry = {
    getFinanceState(countryId) {
      assert.equal(countryId, 'BGD');
      financeReads += 1;
      return { treasuryBalanceUsd: 1250000 };
    }
  };
  const { lifecycle } = attachLifecycle(win, sim);
  await lifecycle.restore();
  queuedFrames.length = 0;
  financeReads = 0;

  const emit = (type, detail) => win.dispatchEvent(new win.CustomEvent(type, { detail }));
  emit('OMEGA_FINANCE_STATE_UPDATED', { countryCode: 'USA', turn: 4 });
  emit('OMEGA_FINANCE_STATE_UPDATED', { countryCode: 'CAN', turn: 4 });
  emit('OMEGA_MACRO_STABILITY_TURN_PROCESSED', {
    playerCountryCode: 'BGD',
    updatedCountryCodes: ['USA', 'CAN'],
    turn: 4
  });

  assert.equal(queuedFrames.length, 0,
    'NPC-only country changes must not schedule a player HUD refresh');
  assert.equal(financeReads, 0,
    'NPC-only Finance/Macro events must not re-read the selected player treasury');

  emit('OMEGA_FINANCE_STATE_UPDATED', { countryCode: 'BGD', turn: 4 });
  emit('OMEGA_MACRO_STABILITY_TURN_PROCESSED', {
    playerCountryCode: 'BGD',
    updatedCountryCodes: ['CAN', 'BGD'],
    turn: 4
  });
  assert.equal(queuedFrames.length, 1,
    'player-country Finance and Macro changes must coalesce into one HUD refresh');
  assert.equal(financeReads, 0,
    'country-scoped updates remain deferred until the scheduled frame');
  queuedFrames.shift()();
  assert.equal(financeReads, 1,
    'the scheduled refresh must read the player country once');

  emit('OMEGA_FINANCE_STATE_UPDATED', { turn: 4 });
  assert.equal(queuedFrames.length, 1,
    'legacy events without country identity retain the compatibility refresh');
  queuedFrames.shift()();
  assert.equal(financeReads, 2);
});


test('resource updates do not repaint a hidden legacy Country IOS chapter or duplicate the Resource Economy refresh', () => {
  const countryIosSource = fs.readFileSync(path.join(root, 'country-ios.js'), 'utf8');
  const resourceEconomySource = fs.readFileSync(path.join(root, 'omega_resource_economy_runtime_v2.js'), 'utf8');
  const refreshStart = resourceEconomySource.indexOf('function refreshUI(){');
  const refreshEnd = resourceEconomySource.indexOf('\n  function boot(){', refreshStart);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, 'Resource Economy legacy refresh hook exists');
  const refreshBody = resourceEconomySource.slice(refreshStart, refreshEnd);
  assert.match(refreshBody, /getElementById\('command-hub-modal'\)/);
  assert.match(refreshBody, /modal\.style\.display==='none'/);
  assert.match(countryIosSource, /window\.OmegaResourceEconomy \|\| \(window\.Omega && window\.Omega\.ResourceEconomy\)/);

  const windowListeners = new Map();
  const documentListeners = new Map();
  const frameCallbacks = [];
  const modal = { hidden:false, style:{ display:'none' } };
  const document = {
    addEventListener(type, listener) {
      const rows = documentListeners.get(type) || [];
      rows.push(listener);
      documentListeners.set(type, rows);
    },
    getElementById(id) { return id === 'command-hub-modal' ? modal : null; },
    querySelectorAll() { return []; }
  };
  const win = {
    document,
    addEventListener(type, listener) {
      const rows = windowListeners.get(type) || [];
      rows.push(listener);
      windowListeners.set(type, rows);
    },
    getComputedStyle(node) {
      return { display:node.style.display || 'none', visibility:'visible' };
    },
    requestAnimationFrame(callback) {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    }
  };
  win.window = win;
  const context = vm.createContext({ window:win, document, console, Number, String, Math, Object, Array, Set, Promise });
  vm.runInContext(countryIosSource, context, { filename:'country-ios.js' });

  const ios = win.CountryIOS;
  ios.activeCountry = 'BGD';
  ios.activeChapter = 5;
  let renders = 0;
  ios.switchChapter = () => { renders += 1; };
  const dispatchResourceUpdate = () => {
    for (const listener of windowListeners.get('RESOURCE_STATE_UPDATED') || []) listener();
  };

  // Normal production mode: Resource Economy v2 schedules the sole repaint.
  modal.style.display = 'flex';
  win.OmegaResourceEconomy = {};
  dispatchResourceUpdate();
  assert.equal(frameCallbacks.length, 0, 'legacy listener must defer to Resource Economy v2');
  assert.equal(renders, 0);

  // If Resource Economy v2 is absent, a closed legacy modal must remain untouched.
  win.OmegaResourceEconomy = null;
  modal.style.display = 'none';
  dispatchResourceUpdate();
  assert.equal(frameCallbacks.length, 0, 'hidden legacy chapter must not schedule any render');
  assert.equal(renders, 0);

  // In an isolated legacy session, visible fallback rendering is coalesced per frame.
  modal.style.display = 'flex';
  dispatchResourceUpdate();
  dispatchResourceUpdate();
  assert.equal(frameCallbacks.length, 1, 'burst resource updates must schedule one fallback render');
  assert.equal(renders, 0, 'fallback render must remain deferred until the scheduled frame');
  frameCallbacks.shift()();
  assert.equal(renders, 1, 'visible legacy fallback renders the chapter once');

  // Closing the modal before the queued frame flushes cancels the stale paint.
  dispatchResourceUpdate();
  assert.equal(frameCallbacks.length, 1);
  modal.style.display = 'none';
  frameCallbacks.shift()();
  assert.equal(renders, 1, 'a queued refresh must recheck visibility before repainting');
});


test('repainting the active resource chapter does not replay tab-scroll animation or static advisor work', () => {
  const countryIosSource = fs.readFileSync(path.join(root, 'country-ios.js'), 'utf8');
  const chapterTabs = [];
  const stage = { innerHTML:'' };
  let scrollCalls = 0;
  const makeTab = chapter => ({
    classList: { add() {}, remove() {} },
    getAttribute(name) { return name === 'data-chapter' ? String(chapter) : null; },
    scrollIntoView() { scrollCalls += 1; }
  });
  chapterTabs.push(makeTab(4), makeTab(5));
  const document = {
    addEventListener() {},
    querySelectorAll(selector) { return selector === '.chapter-tab' ? chapterTabs : []; },
    getElementById(id) { return id === 'ios-chapter-stage' ? stage : null; }
  };
  const win = {
    Game: {
      state: {
        economy:{ BGD:{} },
        population:{ BGD:{} },
        relations:{ BGD:{} }
      }
    },
    addEventListener() {}
  };
  win.window = win;
  const context = vm.createContext({ window:win, document, console, Number, String, Math, Object, Array, Set, Promise, Intl });
  vm.runInContext(countryIosSource, context, { filename:'country-ios.js' });

  const ios = win.CountryIOS;
  ios.activeCountry = 'BGD';
  ios.activeChapter = 1;
  let resourceRenders = 0;
  let economyRenders = 0;
  let actionBindings = 0;
  let advisorUpdates = 0;
  ios.renderChapter5_Resources = () => { resourceRenders += 1; return '<resource-view>'; };
  ios.renderChapter4_Economy = () => { economyRenders += 1; return '<economy-view>'; };
  ios.bindQuickActions = () => { actionBindings += 1; };
  ios.updateAdvisor = () => { advisorUpdates += 1; };

  // First navigation to Chapter 5 still centres the active tab and updates advice.
  ios.switchChapter(5);
  assert.equal(scrollCalls, 1);
  assert.equal(resourceRenders, 1);
  assert.equal(advisorUpdates, 1);
  assert.equal(actionBindings, 1);

  // Resource data repaint rebuilds the chapter content but does not restart
  // the tab animation or recompute the unchanged Chapter 5 advisor copy.
  ios.switchChapter(5);
  assert.equal(scrollCalls, 1);
  assert.equal(resourceRenders, 2);
  assert.equal(advisorUpdates, 1);
  assert.equal(actionBindings, 2);

  // Genuine navigation to another chapter keeps its normal scroll and advice.
  ios.switchChapter(4);
  assert.equal(scrollCalls, 2);
  assert.equal(economyRenders, 1);
  assert.equal(advisorUpdates, 2);

  // Returning to Chapter 5 is a real chapter transition and restores navigation behavior.
  ios.switchChapter(5);
  assert.equal(scrollCalls, 3);
  assert.equal(resourceRenders, 3);
  assert.equal(advisorUpdates, 3);
});


test('Country IOS resolves only the domain records required by the selected chapter', () => {
  const countryIosSource = fs.readFileSync(path.join(root, 'country-ios.js'), 'utf8');
  const reads = { economy:0, population:0, relations:0, identity:0, economyRecord:0, populationRecord:0 };
  const gameState = {};
  Object.defineProperties(gameState, {
    economy: { enumerable:true, get() { reads.economy += 1; return { BGD:{} }; } },
    population: { enumerable:true, get() { reads.population += 1; return { BGD:{} }; } },
    relations: { enumerable:true, get() { reads.relations += 1; return { BGD:{} }; } }
  });
  const tabs = [1,5].map(chapter => ({
    classList:{ add(){}, remove(){} },
    getAttribute(name) { return name === 'data-chapter' ? String(chapter) : null; },
    scrollIntoView(){}
  }));
  const stage = { innerHTML:'' };
  const document = {
    addEventListener(){},
    querySelectorAll(selector) { return selector === '.chapter-tab' ? tabs : []; },
    getElementById(id) { return id === 'ios-chapter-stage' ? stage : null; }
  };
  const win = {
    Game:{ state:gameState },
    OmegaCountryRuntimeData:{
      resolveCountry(countryId) {
        reads.identity += 1;
        return { countryCode:countryId, iso3:'BGD', name:'Bangladesh', economyKey:'BGD', populationKey:'BGD' };
      },
      getRecord(domain) {
        if (domain === 'economy') reads.economyRecord += 1;
        if (domain === 'population') reads.populationRecord += 1;
        return null;
      }
    },
    addEventListener(){}
  };
  win.window = win;
  const context = vm.createContext({ window:win, document, console, Number, String, Math, Object, Array, Set, Promise, Intl });
  vm.runInContext(countryIosSource, context, { filename:'country-ios.js' });

  const ios = win.CountryIOS;
  ios.activeCountry = 'BGD';
  ios.activeChapter = 1;
  ios.renderChapter5_Resources = () => '<resource-view>';
  ios.renderChapter1_Overview = () => '<overview-view>';
  ios.bindQuickActions = () => {};
  ios.updateAdvisor = () => {};

  ios.switchChapter(5);
  assert.deepEqual(reads, {
    economy:0, population:0, relations:0, identity:0, economyRecord:0, populationRecord:0
  }, 'Resource Chapter 5 only needs the selected country identity');

  ios.switchChapter(1);
  assert.equal(reads.economy, 1, 'Overview still reads economy records');
  assert.equal(reads.population, 1, 'Overview still reads population records');
  assert.equal(reads.relations, 1, 'Overview still reads relationship records');
  assert.equal(reads.identity, 1, 'Overview still resolves the canonical country identity');
  assert.equal(reads.economyRecord, 1);
  assert.equal(reads.populationRecord, 1);
});
