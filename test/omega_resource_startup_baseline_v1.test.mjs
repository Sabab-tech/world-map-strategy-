import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const readJson = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const runtimeSource = fs.readFileSync(new URL('../omega_resource_startup_baseline_v1.js', import.meta.url), 'utf8');
const policy = readJson('resource_startup_baseline_rules_v1.json');
const economyRules = readJson('resource_economy_rules.json');
const industrialCatalog = readJson('resource_industrial_catalog_v1.json');
const siteDocument = readJson('resource_site_reserve_simulation_v1.json');
const countryDocument = readJson('economy_global_profiles_v1.json');
const resourceIds = Object.keys(economyRules.demand.resourceProfiles);
const factoryTypes = Object.keys(industrialCatalog.factoryProfiles);
const sourceDocuments = {
  'resource_startup_baseline_rules_v1.json': policy,
  'resource_economy_rules.json': economyRules,
  'resource_industrial_catalog_v1.json': industrialCatalog,
  'resource_site_reserve_simulation_v1.json': siteDocument,
  'economy_global_profiles_v1.json': countryDocument
};

function makeState(overrides = {}) {
  const state = {
    simulation: {
      turn: 1,
      session: {
        sessionId: 'OMEGA-STARTUP-TEST-1',
        playerCountryId: 'BGD',
        status: 'READY',
        createdTurn: 1,
        lastCommittedTurn: 1
      }
    },
    resource: {
      BGD: {
        inventory: { coal: 0 },
        inventoryUnits: { coal: 'TONNES' }
      }
    },
    economy: {
      BGD: {
        population_2015: 123456789,
        unemployment_rate: 7,
        productionAssets: []
      }
    },
    transport: {
      BGD: {
        infrastructure: {
          utilitySupply: {
            electricityMWhPerDay: 0,
            waterM3PerDay: 0,
            authority: 'EXISTING_TEST_STATE',
            status: 'AVAILABLE'
          }
        }
      }
    }
  };
  return Object.assign(state, overrides);
}

function makeHarness(state) {
  const listeners = new Map();
  const simulationListeners = new Map();
  const emittedEvents = [];
  const simulationEvents = {
    subscribe(type, callback) {
      const rows = simulationListeners.get(type) || [];
      rows.push(callback);
      simulationListeners.set(type, rows);
      return () => simulationListeners.set(type, (simulationListeners.get(type) || []).filter(fn => fn !== callback));
    },
    emit(type, payload) {
      const row = { eventType: type, payload: JSON.parse(JSON.stringify(payload)) };
      for (const callback of simulationListeners.get(type) || []) callback(row);
      return row;
    }
  };
  const context = {
    console,
    Game: { state },
    gameState: state,
    Omega: { SimulationRuntime: { events: simulationEvents, world: { state } } },
    module: { exports: {} },
    fetch: async url => {
      const name = String(url).split('/').pop();
      if (!Object.prototype.hasOwnProperty.call(sourceDocuments, name)) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => JSON.parse(JSON.stringify(sourceDocuments[name]))
      };
    },
    addEventListener(type, callback) {
      const rows = listeners.get(type) || [];
      rows.push(callback);
      listeners.set(type, rows);
    },
    dispatchEvent(event) {
      emittedEvents.push(event);
      for (const callback of listeners.get(event.type) || []) callback(event);
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(runtimeSource, context, { filename: 'omega_resource_startup_baseline_v1.js' });
  return { context, api: context.OmegaResourceStartupBaseline, emittedEvents, state, emitSimulationEvent: (type, payload) => simulationEvents.emit(type, payload) };
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const profileFor = code => countryDocument.countries.find(row => row.iso3 === code || row.countryCode === code);
const token = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

test('source catalog contract remains exactly 41 resource identities and 21 factory profiles', () => {
  assert.equal(resourceIds.length, 41);
  assert.equal(factoryTypes.length, 21);
  assert.equal(siteDocument.records.length, siteDocument.siteCount);
  assert.equal(policy.canonicalIdentityPolicy.resourceProfileCount, 41);
  assert.equal(policy.canonicalIdentityPolicy.factoryProfileCount, 21);
  assert.equal(policy.openingStock.neverUseGeologicalReservesAsStock, true);
  assert.equal(policy.startupFactories.reserveQuantityUsedAsWarehouseStock, false);
  assert.equal(policy.startupFactories.maxOneDownstreamAssetPerFactoryTypePerCountry, true);
  assert.equal(policy.bootstrap.neverReplenishAfterInitialization, true);
});

test('fresh session seeds bounded opening stock and source-context-driven factories without overwriting saved values', async () => {
  const state = makeState();
  const { context, api, emittedEvents } = makeHarness(state);
  const ready = await api.ready;
  assert.equal(ready.status, 'READY');
  assert.equal(ready.countryCount, 249);
  assert.equal(ready.resourceProfileCount, 41);
  assert.equal(ready.factoryProfileCount, 21);

  emitSimulationEvent('OMEGA_GAME_SESSION_CREATED', {
    session: JSON.parse(JSON.stringify(state.simulation.session))
  });
  const initialized = await api.waitForPendingInitialization();
  assert.ok(['COMPLETED_WITH_REPORTED_GAPS', 'COMPLETED'].includes(initialized.status));
  assert.equal(state.resource.BGD.inventory.coal, 0, 'explicit zero stock is a real saved value and must be preserved');
  assert.equal(state.resource.BGD.inventoryUnits.coal, 'TONNES');
  assert.equal(state.economy.BGD.population_2015, 123456789, 'existing population context must not be overwritten');
  assert.equal(state.economy.BGD.unemployment_rate, 7, 'existing unemployment context must not be overwritten');
  assert.equal(state.transport.BGD.infrastructure.utilitySupply.electricityMWhPerDay, 0,
    'existing utility capacity, including a deliberate zero, must be preserved');
  assert.equal(state.transport.BGD.infrastructure.utilitySupply.waterM3PerDay, 0);

  const report = state.simulation.startupBaselineV1;
  assert.ok(report);
  assert.equal(report.counts.countryCount, 249);
  assert.equal(report.counts.resourceProfileCount, 41);
  assert.equal(report.counts.factoryProfileCount, 21);
  assert.equal(report.geologicalReserveQuantityUsedAsStock, false);
  assert.equal(report.existingSaveDataOverwritten, false);
  assert.equal(report.automaticSupplyWindowDays, 100);
  assert.equal(report.automaticSupplyRenewal, false);
  assert.equal(report.countrySummaries.length, 249);
  assert.ok(emittedEvents.some(event => event.type === 'OMEGA_RESOURCE_STARTUP_BASELINE_COMPLETED'));

  const bangladesh = state.economy.BGD.productionAssets;
  assert.ok(bangladesh.some(asset => asset.factoryType === 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'),
    'Bangladesh should receive a processor only when the existing scenario site context supports it');
  const starter = bangladesh.find(asset => asset.factoryType === 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT');
  assert.ok(starter.id.startsWith('STARTUP-FAC-00-BGD-'));
  assert.ok(starter.startupBaselineV1.notObservedFacility);
  assert.equal(starter.startupBaselineV1.reserveQuantityUsedAsWarehouseStock, false);
  assert.ok(starter.startupBaselineV1.sourceSiteIds.length > 0);
  assert.ok(factoryTypes.includes(starter.factoryType));
  assert.deepEqual(Object.keys(starter.inputCoefficients).map(token).sort(), ['coal']);
  assert.equal(starter.productionHealth.status, 'STOPPED', 'starter assets do not receive fabricated feedstock or output');

  const indiaAssets = state.economy.IND.productionAssets;
  const indiaSteelWorks = indiaAssets.find(asset => asset.factoryType === 'STEEL_AND_ALLOY_WORKS');
  assert.ok(indiaSteelWorks,
    'India has both coal and iron-ore production sources, so a steel starter is eligible even though external input goods are not yet delivered');
  assert.equal(indiaSteelWorks.startupBaselineV1.notObservedFacility, true);
  assert.equal(indiaSteelWorks.startupBaselineV1.locallySupportedInputShare, 0.5);
  assert.deepEqual(indiaSteelWorks.startupBaselineV1.locallySupportedInputIds, ['iron_concentrate', 'coal_concentrate']);
  assert.deepEqual(indiaSteelWorks.startupBaselineV1.externalInputResourceIds, ['cement_feed', 'copper_concentrate']);
  assert.equal(indiaSteelWorks.startupBaselineV1.externalInputsRequireConfirmedSupply, true);
  assert.equal(Object.keys(indiaSteelWorks.inputInventory).length, 0,
    'catalog inputs and local output capability are not warehouse stock');
  assert.equal(indiaSteelWorks.inputBatchLots.length, 0,
    'no fake delivered batches may be attached to a startup factory');
  assert.equal(indiaSteelWorks.productionHealth.status, 'STOPPED',
    'starter factory remains stopped until its actual recipe inputs are delivered');
  assert.equal(indiaAssets.filter(asset => asset.recipeId).length, 1,
    'newly planned idle factory outputs must not recursively justify a fake chain of additional factories');
  assert.ok(indiaAssets.every(asset => !String(asset.id || '').startsWith('STARTUP-FAC-10-') ||
    asset.startupBaselineV1.externalInputsRequireConfirmedSupply !== false),
    'new downstream assets must retain their confirmed-supply dependency flag');

  const indiaProfile = profileFor('IND');
  const indiaResource = state.resource.IND;
  const indiaCoalBaseline = economyRules.demand.resourceProfiles.coal;
  assert.ok(positive(indiaResource.inventory.coal));
  const expectedIndiaCoal = indiaCoalBaseline.basePerMillionPopulation *
    indiaProfile.populationValues.population_2015 / 1000000 * policy.openingStock.coverageDays;
  assert.ok(Math.abs(indiaResource.inventory.coal - expectedIndiaCoal) < 1e-6,
    'opening stock is derived from the configured daily rate and population, never geological reserve quantity');
  assert.equal(indiaResource.inventoryUnits.coal, 'TONNES');
  assert.equal(indiaResource.startupBaselineV1.openingStockCoverageDays, 14);
  assert.equal(indiaResource.startupBaselineV1.geologicalReserveQuantityUsedAsStock, false);
  assert.ok(indiaResource.startupBaselineV1.stockRowsEncoding === 'COMPACT_PER_RESOURCE_PROVENANCE_V1');
  assert.ok(indiaResource.startupBaselineV1.stockRows.some(row =>
    row.resourceId === 'coal' && row.demandSource === 'RULE_PROFILE_POPULATION_BASELINE'));

  for (const code of Object.keys(state.resource)) {
    const bucket = state.resource[code];
    if (!bucket || !bucket.startupBaselineV1) continue;
    const newKeys = Object.keys(bucket.inventory || {});
    for (const key of newKeys) {
      // Preserve pre-existing keys in BGD; every other newly added inventory key must
      // be in the canonical 41-resource demand identity catalog.
      if (code === 'BGD' && key === 'coal') continue;
      assert.ok(resourceIds.includes(token(key)), 'unexpected resource identity added: ' + code + '/' + key);
    }
  }
  const seededTypes = new Set();
  for (const country of Object.values(state.economy)) {
    for (const asset of country && Array.isArray(country.productionAssets) ? country.productionAssets : []) {
      if (!String(asset.id || '').startsWith('STARTUP-FAC-')) continue;
      assert.ok(factoryTypes.includes(asset.factoryType), 'factory type outside the canonical catalog: ' + asset.factoryType);
      assert.equal(asset.authority, 'SIMULATED_STARTUP_BASELINE_V1');
      assert.ok(asset.startupBaselineV1.notObservedFacility);
      if (!asset.recipeId) assert.ok(asset.startupBaselineV1.sourceSiteIds.length > 0);
      seededTypes.add(asset.factoryType);
    }
  }
  assert.ok(seededTypes.size > 0);
  assert.ok(seededTypes.size <= 21);
});

test('metadata-only resources stay unknown unless an existing factory input supplies a modeled rate', async () => {
  const state = makeState();
  const { context, api } = makeHarness(state);
  await api.ready;
  emitSimulationEvent('OMEGA_GAME_SESSION_CREATED', {
    session: JSON.parse(JSON.stringify(state.simulation.session))
  });
  await api.waitForPendingInitialization();

  for (const rid of ['gypsum', 'niobium', 'ruby', 'limestone']) {
    const profile = economyRules.demand.resourceProfiles[rid];
    assert.ok(!positive(profile.basePerMillionPopulation),
      rid + ' must not gain an invented per-capita demand coefficient');
  }
  const antarcticaProfile = profileFor('ATA');
  assert.ok(antarcticaProfile);
  const antarcticaInventory = state.resource.ATA && state.resource.ATA.inventory || {};
  assert.equal(Object.keys(antarcticaInventory).length, 0,
    'country with no population and no eligible site/factory input must remain unmodeled, not receive synthetic zero/positive stock rows');
  const countryReport = api.getCountryReport('ATA');
  assert.ok(countryReport);
  assert.ok(countryReport.unknownResourceIds.length > 0);
  assert.equal(countryReport.openingStockSeeded, 0);
});

test('repeated startup calls and depletion after initialization never replenish or duplicate opening assets', async () => {
  const state = makeState();
  const { context, api } = makeHarness(state);
  await api.ready;
  const session = JSON.parse(JSON.stringify(state.simulation.session));
  emitSimulationEvent('OMEGA_GAME_SESSION_CREATED', { session });
  await api.waitForPendingInitialization();

  const beforeAssets = state.economy.IND.productionAssets.map(asset => asset.id).sort();
  const beforeInventoryCount = Object.keys(state.resource.IND.inventory).length;
  delete state.resource.IND.inventory.coal;
  const repeated = await api.initializeForSession(session);
  assert.equal(repeated.status, 'ALREADY_INITIALIZED');
  assert.equal(Object.prototype.hasOwnProperty.call(state.resource.IND.inventory, 'coal'), false,
    'opening stock is a one-time seed and must not behave like automatic replenishment');
  assert.deepEqual(state.economy.IND.productionAssets.map(asset => asset.id).sort(), beforeAssets);
  assert.equal(beforeInventoryCount, Object.keys(state.resource.IND.inventory).length,
    'deleting a stock key after initialization must not silently recreate it');

  const loadedState = JSON.parse(JSON.stringify(state));
  const reload = makeHarness(loadedState);
  await reload.api.ready;
  const loadedResult = await reload.api.initializeForSession(loadedState.simulation.session);
  assert.equal(loadedResult.status, 'ALREADY_INITIALIZED');
  assert.equal(Object.prototype.hasOwnProperty.call(loadedState.resource.IND.inventory, 'coal'), false);
  assert.deepEqual(loadedState.economy.IND.productionAssets.map(asset => asset.id).sort(), beforeAssets);
});

test('mid-game and late-save sessions are skipped rather than given a fresh startup economy', async () => {
  const state = makeState({
    simulation: {
      turn: 180,
      session: {
        sessionId: 'OMEGA-STARTUP-TEST-LATE',
        playerCountryId: 'BGD',
        status: 'RUNNING',
        createdTurn: 1,
        lastCommittedTurn: 180
      }
    }
  });
  const { context, api } = makeHarness(state);
  await api.ready;
  emitSimulationEvent('OMEGA_GAME_SESSION_CREATED', {
    session: JSON.parse(JSON.stringify(state.simulation.session))
  });
  const result = await api.waitForPendingInitialization();
  assert.equal(result.status, 'SKIPPED_NOT_NEW_GAME');
  assert.equal(state.simulation.startupBaselineV1, undefined);
  assert.equal(state.economy.BGD.startupBaselineV1, undefined);
  assert.equal(state.resource.BGD.startupBaselineV1, undefined);
  assert.equal(state.resource.BGD.inventory.coal, 0);
});
