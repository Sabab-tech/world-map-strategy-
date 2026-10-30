import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const readJson = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const runtimeSource = fs.readFileSync(new URL('../omega_country_factory_starting_baseline_v1.js', import.meta.url), 'utf8');
const baseline = readJson('country_factory_starting_baseline_v1.json');
const catalog = readJson('resource_industrial_catalog_v1.json');
const countryContext = readJson('resource_country_resource_context_index.json');
const economyProfiles = readJson('economy_global_profiles_v1.json');
const realWorldEstablishments = readJson('country_factory_establishment_data_v1.json');
const sourceDocuments = {
  'country_factory_starting_baseline_v1.json': baseline,
  'resource_industrial_catalog_v1.json': catalog,
  'resource_country_resource_context_index.json': countryContext,
  'economy_global_profiles_v1.json': economyProfiles,
  'country_factory_establishment_data_v1.json': realWorldEstablishments
};
const factoryTypes = Object.keys(catalog.factoryProfiles).sort();
const coreCountryIds = Object.keys(countryContext.countries).sort();

function makeState(turn = 1) {
  return {
    simulation: {
      turn,
      session: {
        sessionId: 'OMEGA-FACTORY-STARTING-BASELINE-TEST',
        playerCountryId: 'BGD',
        status: 'READY',
        createdTurn: turn
      }
    },
    economy: {
      BGD: {
        productionAssets: [{ id: 'EXISTING-FACTORY-BGD-1', factoryType: 'TEXTILE_GARMENT_MILL', status: 'OPERATIONAL' }],
        existingEconomyMarker: { preserved: true }
      }
    },
    resource: {
      BGD: {
        inventory: { coal: 0, iron_ore: 12 },
        batches: [{ batchId: 'EXISTING-BATCH-BGD-1', resourceId: 'iron_ore', quantity: 12 }]
      }
    }
  };
}

function makeHarness(state) {
  const listeners = new Map();
  const simulationListeners = new Map();
  const emitted = [];
  const simulationEvents = {
    subscribe(type, callback) {
      const rows = simulationListeners.get(type) || [];
      rows.push(callback);
      simulationListeners.set(type, rows);
      return () => simulationListeners.set(type, (simulationListeners.get(type) || []).filter(fn => fn !== callback));
    },
    emit(type, payload) {
      const row = { eventType: type, payload: structuredCloneSafe(payload) };
      for (const callback of simulationListeners.get(type) || []) callback(row);
      return row;
    }
  };
  const context = {
    console,
    Game: { state },
    gameState: state,
    Omega: { SimulationRuntime: { events: simulationEvents, world: { state } } },
    fetch: async url => {
      const name = String(url).split('/').pop();
      if (!Object.prototype.hasOwnProperty.call(sourceDocuments, name)) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: true, json: async () => structuredCloneSafe(sourceDocuments[name]) };
    },
    addEventListener(type, callback) {
      const rows = listeners.get(type) || [];
      rows.push(callback);
      listeners.set(type, rows);
    },
    dispatchEvent(event) {
      emitted.push(event);
      for (const callback of listeners.get(event.type) || []) callback(event);
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(runtimeSource, context, { filename: 'omega_country_factory_starting_baseline_v1.js' });
  return { context, api: context.OmegaCountryFactoryStartingBaselineV1, state, emitted, emitSimulationEvent: (type, payload) => simulationEvents.emit(type, payload) };
}

function structuredCloneSafe(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(structuredCloneSafe);
  const out = {};
  Object.keys(value).forEach(key => { out[key] = structuredCloneSafe(value[key]); });
  return out;
}

test('dataset has one explicit 21-type starting-count row for every core country', () => {
  assert.equal(baseline.countryCount, 197);
  assert.equal(Object.keys(baseline.countries).length, 197);
  assert.equal(baseline.factoryTypeCount, 21);
  assert.equal(factoryTypes.length, 21);
  assert.deepEqual(Object.keys(baseline.countries).sort(), coreCountryIds);
  for (const countryId of coreCountryIds) {
    const row = baseline.countries[countryId];
    assert.equal(row.countryId, countryId);
    assert.equal(Object.keys(row.factoryCounts).length, 21, countryId + ' must contain all factory type keys');
    assert.deepEqual(Object.keys(row.factoryCounts).sort(), factoryTypes, countryId + ' type keys must match the live catalog');
    const total = Object.values(row.factoryCounts).reduce((sum, count) => {
      assert.ok(Number.isInteger(count) && count >= 0, countryId + ' has an invalid count');
      return sum + count;
    }, 0);
    assert.equal(total, row.totalStartingFactoryUnits, countryId + ' total must reconcile');
    assert.equal(row.provenance.realWorldFacilityCounts, false);
    assert.equal(row.provenance.simulationOnly, true);
  }
  assert.ok(baseline.countries.BGD.factoryCounts.TEXTILE_GARMENT_MILL >= 3,
    'Bangladesh begins with a strong, but game-scaled, textile allocation');
  assert.ok(baseline.countries.BGD.totalStartingFactoryUnits < 25,
    'Bangladesh counts must remain within the game scale rather than raw factory census totals');
  assert.ok(baseline.countries.CHN.factoryCounts.ELECTRONICS_SEMICONDUCTOR_FAB >= 2);
  assert.ok(baseline.countries.DEU.factoryCounts.INDUSTRIAL_MACHINERY_MACHINE_TOOLS >= 2);
  assert.ok(baseline.countries.SGP.factoryCounts.SHIP_RAIL_EQUIPMENT_YARD >= 1);
});

test('runtime validates sources and seeds all country counts without changing live assets or inventory', async () => {
  const state = makeState();
  const originalAssets = JSON.stringify(state.economy.BGD.productionAssets);
  const originalResource = JSON.stringify(state.resource.BGD);
  const originalEconomy = JSON.stringify(state.economy);
  const { context, api, emitted, emitSimulationEvent } = makeHarness(state);
  const ready = await api.ready;
  assert.equal(ready.status, 'READY');
  assert.equal(ready.countryCount, 197);
  assert.equal(ready.factoryTypeCount, 21);
  assert.equal(typeof api.getCountryBaseline, 'function');
  const bangladesh = api.getCountryBaseline('BGD');
  assert.equal(bangladesh.totalStartingFactoryUnits, baseline.countries.BGD.totalStartingFactoryUnits);
  assert.equal(bangladesh.factoryCounts.TEXTILE_GARMENT_MILL, baseline.countries.BGD.factoryCounts.TEXTILE_GARMENT_MILL);
  assert.equal(api.getCountryBaseline('Bangladesh').countryId, 'BGD');
  assert.equal(api.getCountryBaseline('UNKNOWN-COUNTRY'), null);
  const realWorld = api.getCountryRealWorldData('BGD');
  assert.equal(realWorld.countryId, 'BGD');
  assert.equal(Object.keys(realWorld.factoryEstablishments).length, 21);
  assert.ok(['NOT_QUERIED','REPORTED','PARTIAL','NOT_REPORTED','NOT_COMPARABLE','MAPPING_UNAVAILABLE','COUNTRY_NOT_COVERED','SOURCE_UNAVAILABLE'].includes(realWorld.factoryEstablishments.TEXTILE_GARMENT_MILL.status));
  if (realWorld.factoryEstablishments.TEXTILE_GARMENT_MILL.status === 'REPORTED') {
    assert.ok(Number.isInteger(realWorld.factoryEstablishments.TEXTILE_GARMENT_MILL.establishmentCount));
  } else {
    assert.equal(realWorld.factoryEstablishments.TEXTILE_GARMENT_MILL.establishmentCount, null);
  }
  assert.equal(realWorld.factoryEstablishments.UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT.status, 'NOT_COMPARABLE');

  emitSimulationEvent('OMEGA_GAME_SESSION_CREATED', { session: structuredCloneSafe(state.simulation.session) });
  const result = await api.waitForPendingInitialization();
  assert.equal(result.status, 'COMPLETED');
  assert.equal(state.simulation.countryFactoryStartingBaselineV1.countryCount, 197);
  assert.equal(state.simulation.countryFactoryStartingBaselineV1.factoryTypeCount, 21);
  assert.equal(state.simulation.countryFactoryStartingBaselineV1.initializedCountryCount, 197);
  assert.equal(state.simulation.countryFactoryStartingBaselineV1.productionAssetsCreated, 0);
  assert.equal(state.simulation.countryFactoryStartingBaselineV1.economyStateModified, false);
  assert.equal(Object.keys(state.simulation.countryFactoryStartingBaselineV1.countries).length, 197);
  assert.equal(state.simulation.countryFactoryStartingBaselineV1.countries.BGD.totalStartingFactoryUnits, baseline.countries.BGD.totalStartingFactoryUnits);
  assert.equal(Object.keys(state.simulation.countryFactoryStartingBaselineV1.countries.BGD.factoryCounts).length, 21);
  assert.equal(state.simulation.countryFactoryStartingBaselineV1.existingSaveDataOverwritten, false);
  assert.equal(Object.keys(state.economy).length, 1, 'baseline initialization must not create empty economy buckets for other countries');
  assert.equal(JSON.stringify(state.economy.BGD.productionAssets), originalAssets);
  assert.equal(JSON.stringify(state.economy), originalEconomy, 'baseline initialization must leave the economy state untouched');
  assert.deepEqual(state.economy.BGD.existingEconomyMarker, { preserved: true });
  assert.equal(JSON.stringify(state.resource.BGD), originalResource);
  assert.ok(emitted.some(event => event.type === 'OMEGA_COUNTRY_FACTORY_STARTING_BASELINE_READY'));
  assert.ok(emitted.some(event => event.type === 'OMEGA_COUNTRY_FACTORY_STARTING_BASELINE_INITIALIZED'));
  const stableSnapshot = JSON.stringify(state.simulation.countryFactoryStartingBaselineV1);
  emitSimulationEvent('OMEGA_GAME_SESSION_CREATED', { session: structuredCloneSafe(state.simulation.session) });
  await api.waitForPendingInitialization();
  assert.equal(JSON.stringify(state.simulation.countryFactoryStartingBaselineV1), stableSnapshot,
    'repeated initialization must not overwrite existing baseline or increment any count');
  assert.equal(JSON.stringify(state.economy.BGD.productionAssets), originalAssets);
});

test('runtime does not initialize a game that has already advanced past the opening turns', async () => {
  const state = makeState(5);
  state.simulation.session.createdTurn = 5;
  const { api } = makeHarness(state);
  assert.equal((await api.ready).status, 'READY');
  const result = await api.initializeForSession(state.simulation.session);
  assert.equal(result.status, 'SKIPPED_NOT_NEW_GAME');
  assert.equal(Object.keys(state.economy).filter(code => state.economy[code] && code !== 'BGD').length, 0);
  assert.equal(Object.keys(state.economy).length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(state.economy.BGD, 'factoryStartingBaselineV1'), false);
});

test('runtime blocks an incomplete or mismatched canonical factory catalog', async () => {
  const corruptDocuments = Object.assign({}, sourceDocuments, {
    'resource_industrial_catalog_v1.json': { factoryProfiles: { ONLY_ONE_FACTORY: {} } }
  });
  const state = makeState();
  const h = makeHarness(state);
  h.context.fetch = async url => {
    const name = String(url).split('/').pop();
    return { ok: Object.prototype.hasOwnProperty.call(corruptDocuments, name), json: async () => structuredCloneSafe(corruptDocuments[name] || {}) };
  };
  // Recreate the runtime after replacing its test fetch so validation receives the corrupted catalog.
  h.context.OmegaCountryFactoryStartingBaselineV1 = undefined;
  vm.runInNewContext(runtimeSource, h.context, { filename: 'omega_country_factory_starting_baseline_v1.js' });
  const result = await h.context.OmegaCountryFactoryStartingBaselineV1.ready;
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason, /FACTORY_CATALOG_MISMATCH/);
});
