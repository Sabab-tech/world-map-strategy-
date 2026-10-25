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

function attachLifecycle(win, sim) {
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
  win.Omega.App = { state: 'READY', simulation: sim };
  const lifecycleSource = fs.readFileSync(path.join(root, 'omega_game_lifecycle_runtime_v1.js'), 'utf8');
  const lifecycleContext = vm.createContext({
    window: win, globalThis: win, console, setTimeout, clearTimeout,
    Date, JSON, Number, String, Math, Promise, Map, Object, Array, Error, Intl
  });
  vm.runInContext(lifecycleSource, lifecycleContext, { filename: 'omega_game_lifecycle_runtime_v1.js' });
  return { documentListeners, lifecycle: win.Omega.GameLifecycle };
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

test('turn diagnostics retain summaries instead of duplicating large resource payloads into saves', async () => {
  const { sim, gameState } = createRuntime();
  const payloadSize = 250;
  sim.registerSubsystem('test.large-resource-result', async (_event, context) => ({
    status: 'COMPLETED',
    turn: context.turn,
    totalCountryCount: payloadSize,
    processedCountryCount: payloadSize,
    results: Array.from({ length: payloadSize }, (_, index) => ({
      countryId: 'C' + index,
      siteResults: Array.from({ length: 8 }, (__, siteIndex) => ({
        siteId: 'SITE-' + index + '-' + siteIndex,
        payload: 'resource-runtime-detail-'.repeat(20)
      }))
    }))
  }), { priority: 10 });

  sim.startSession({ playerCountryId: 'BGD' });
  await sim.frame(STEP_MS);

  const participant = sim.diagnostics().lastTurnParticipantResults.find(
    row => row.id === 'test.large-resource-result'
  );
  assert.ok(participant);
  assert.equal(participant.status, 'COMPLETED');
  assert.equal(participant.result.totalCountryCount, payloadSize);
  assert.equal(participant.result.resultsCount, payloadSize);
  assert.equal(Object.hasOwn(participant.result, 'results'), false,
    'retained diagnostics must not keep the full per-country payload array');

  const persistedParticipant = gameState.simulation.lastTurnParticipantResults.find(
    row => row.id === 'test.large-resource-result'
  );
  assert.equal(persistedParticipant.result.resultsCount, payloadSize);
  assert.equal(Object.hasOwn(persistedParticipant.result, 'results'), false,
    'authoritative state must retain only the compact participant summary');

  const serializedSave = JSON.stringify(sim.saveState());
  assert.ok(serializedSave.length < 30000,
    'save envelope must not duplicate the synthetic multi-country payload: ' + serializedSave.length);
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

test('save slot preserves an unfinished factory project, reserved input batches and in-progress production cycle', async () => {
  const { sim, gameState, storage } = createRuntime();
  sim.startSession({ playerCountryId: 'BGD' });
  await sim.advance(2);

  gameState.economy.BGD.productionAssets = [{
    id: 'FAC-BGD-STEEL-01',
    countryId: 'BGD',
    factoryType: 'STEEL_AND_ALLOY_WORKS',
    status: 'OPERATIONAL',
    inputInventory: { iron_concentrate: 60, coal_concentrate: 20 },
    inputBatchLots: [{
      batchId: 'INPUT-IRON-01',
      resourceId: 'iron_concentrate',
      quantity: 60,
      remainingQuantity: 60,
      cycleReservationId: 'CYCLE-STEEL-01',
      cycleReservedQuantity: 50,
      sourceBatchIds: ['MINE-BGD-IRON-01'],
      unit: 'SIMULATION_TONNE_EQUIVALENT'
    }]
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
        startDate: '2015-01-03',
        finishDate: '2015-01-06',
        productionQuantity: 50,
        sourceBatchIds: ['MINE-BGD-IRON-01'],
        inputBatchReservations: [{
          batchId: 'INPUT-IRON-01',
          resourceId: 'iron_concentrate',
          quantity: 50,
          unit: 'SIMULATION_TONNE_EQUIVALENT'
        }],
        outputQuantities: { STEEL: 36 }
      }
    },
    factoryProductionCycleHistory: []
  };

  const expectedProject = JSON.parse(JSON.stringify(gameState.resource.BGD.industrialNetwork.projects[0]));
  const expectedCycle = JSON.parse(JSON.stringify(gameState.resource.BGD.industrialNetwork.factoryProductionCycles['FAC-BGD-STEEL-01']));
  const expectedLot = JSON.parse(JSON.stringify(gameState.economy.BGD.productionAssets[0].inputBatchLots[0]));
  const saved = sim.saveSlot('factory-acceptance');
  assert.equal(saved.ok, true);
  assert.equal(storage.has('omega.game.save.factory-acceptance'), true);

  gameState.resource.BGD.industrialNetwork.projects = [];
  gameState.resource.BGD.industrialNetwork.factoryProductionCycles = {};
  gameState.economy.BGD.productionAssets = [];
  const restored = sim.loadSlot('factory-acceptance');
  assert.equal(restored.lastLoadIntegrity, 'VERIFIED', 'the restored factory snapshot must pass authoritative save integrity validation');

  assert.deepEqual(JSON.parse(JSON.stringify(gameState.resource.BGD.industrialNetwork.projects[0])), expectedProject,
    'construction dates, consumed BOM allocations and request identity must survive reload');
  assert.deepEqual(JSON.parse(JSON.stringify(gameState.resource.BGD.industrialNetwork.factoryProductionCycles['FAC-BGD-STEEL-01'])), expectedCycle,
    'cycle status, finish date, exact batch reservations and expected outputs must survive reload');
  assert.deepEqual(JSON.parse(JSON.stringify(gameState.economy.BGD.productionAssets[0].inputBatchLots[0])), expectedLot,
    'remaining quantity, reservation lock and source-mine lineage must survive reload');
  assert.equal(gameState.economy.BGD.productionAssets[0].inputBatchLots[0].cycleReservedQuantity, 50);
  assert.equal(gameState.resource.BGD.industrialNetwork.factoryProductionCycles['FAC-BGD-STEEL-01'].status, 'IN_PROGRESS');
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
  const globalMarket = fs.readFileSync(path.join(root, 'omega_global_market_system.js'), 'utf8');
  const globalTrade = fs.readFileSync(path.join(root, 'omega_global_trade_system.js'), 'utf8');
  const industrialNetwork = fs.readFileSync(path.join(root, 'omega_resource_industrial_network_v1.js'), 'utf8');
  const macro = fs.readFileSync(path.join(root, 'omega_macro_stability_runtime_v1.js'), 'utf8');
  const ministryEngine = fs.readFileSync(path.join(root, 'ministry_engine.js'), 'utf8');
  const ministerIntegration = fs.readFileSync(path.join(root, 'omega_minister_integration.js'), 'utf8');
  const liveOps = fs.readFileSync(path.join(root, 'omega_live_operations_observability_v1.js'), 'utf8');

  assert.match(index, /id="omega-global-time-hud"/);
  const topHeaderStart = index.indexOf('id="top-status-bar"');
  const unifiedHudStart = index.indexOf('id="omega-global-time-hud"');
  const metricDropdownStart = index.indexOf('id="map-metric-dropdown"');
  assert.ok(topHeaderStart >= 0 && unifiedHudStart > topHeaderStart && unifiedHudStart < metricDropdownStart,
    'the lifecycle HUD must be embedded in the existing top status bar');
  assert.match(index, /data-speed="3" title="Very Fast Speed">3x/);
  assert.match(index, /data-omega-speed="3" aria-label="Very fast game speed" title="Very fast speed">3x/);
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
  assert.match(lifecycle, /LOCAL_STORAGE_AND_INDEXEDDB_SAVE_FAILED/);
  assert.match(lifecycle, /installMutationEventSaveBridge/);
  assert.match(lifecycle, /_STATE_UPDATED|_APPLIED|_COMPLETED/);
  assert.match(lifecycle, /GAME ERROR · LAST COMPLETE SAVE PRESERVED/);
  assert.doesNotMatch(lifecycle, /Math\.floor\(turn\) % 3/);
  assert.match(lifecycle, /function saveNow\(options\)/);
  assert.match(lifecycle, /var lastSavedChecksum = null/);
  assert.match(lifecycle, /options\.committedTurn === true && g\.indexedDB/,
    'committed turn snapshots must use the asynchronous IndexedDB path when available');
  assert.doesNotMatch(lifecycle, /savedChecksum: lastSavedSerialized \? \(sim && sim\.saveState/,
    'reading lifecycle diagnostics must not rebuild and checksum the full world');
  assert.doesNotMatch(lifecycle, /if \(restoreFailed\) \{ restoreFailed = false; saveNow\(\{ force: true \}\); \}/,
    'pressing Play must not synchronously snapshot and serialize the entire world');
  assert.match(resourceEconomy, /async function forEachCooperatively/);
  assert.match(resourceEconomy, /function worldMineSummary/);
  assert.match(resourceEconomy, /summaryOnly:true/);
  assert.match(resourceEconomy, /if\(!isCurrentCountryEvent\(event\)\)return/,
    'background country updates must not repeatedly rerender the player country UI');
  assert.match(lifecycle, /function onPageExit\(\)/);
  assert.match(lifecycle, /stopAllBackgroundRuns/);
  assert.match(lifecycle, /startAllBackgroundRuns/);
  assert.doesNotMatch(ministryEngine, /window\._resourceChartTimer = setInterval/,
    'resource visual charts must not own a continuously running synthetic production timer');
  assert.doesNotMatch(ministerIntegration, /setInterval\(/,
    'minister consistency checks must be driven by state-change events');
  assert.doesNotMatch(liveOps, /refreshHandle = g\.setInterval/,
    'Live Operations must refresh from events instead of a background poll');
  assert.match(endowment, /function onTurn\(\)\{return extractAll\(\{activeOnly:true\}\);\}/,
    'turn-driven resource extraction must only process mine occurrences explicitly activated by the player');
  assert.match(endowment, /BOOTSTRAP_HYDRATION_ONLY/,
    'site bootstrap must hydrate and index sites without starting production for every country');
  assert.match(resourceEconomy, /extractAll\(\{activeOnly:true\}\)/,
    'the economy turn must use the active-site extraction policy instead of global all-site extraction');
  assert.match(resourceEconomy, /return runTurn\(\);/);
  assert.doesNotMatch(resourceEconomy, /g\.OmegaGlobalMarket\.rebuild\(\)/,
    'resource economy must not repeat the global market turn participant');
  assert.doesNotMatch(resourceEconomy, /g\.OmegaGlobalTrade\.processAll\(\)/,
    'resource economy must not repeat the global trade turn participant');
  assert.match(globalMarket, /async function onTurn\(\)/);
  assert.match(globalMarket, /await yieldTurnToUi\(\)/,
    'global market publication must yield between country projections');
  assert.match(globalTrade, /async function onTurn\(\)/);
  assert.match(globalTrade, /await yieldTurnToUi\(\)/,
    'global trade settlement must yield between request batches');
  assert.match(industrialNetwork, /await new Promise\(resolve=>\{/,
    'industrial country processing must yield to WebView input and layout');
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
  const hardening = fs.readFileSync(path.join(root, 'omega_resource_system_hardening_v1.js'), 'utf8');
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
  assert.match(industrial, /if\(num\(clock\?\.stepDurationMs\)!==null\)return 1/);
  assert.match(industrial, /processPendingFactoryInputs\(countryId,\{activeOnly:true\}\)/,
    'turn-driven factories must not auto-start work outside activated source sites');
  assert.match(industrial, /factoryAutoStartAllowed/,
    'manual factory calls remain available while automatic starts are restricted');
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
