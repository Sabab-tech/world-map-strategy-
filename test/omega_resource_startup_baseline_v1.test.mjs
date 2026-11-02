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
const factoryInputBaseline = readJson('country_factory_input_inventory_baseline_v1.json');
const resourceIds = Object.keys(economyRules.demand.resourceProfiles);
const factoryTypes = Object.keys(industrialCatalog.factoryProfiles);
const sourceDocuments = {
  'resource_startup_baseline_rules_v1.json': policy,
  'resource_economy_rules.json': economyRules,
  'resource_industrial_catalog_v1.json': industrialCatalog,
  'resource_site_reserve_simulation_v1.json': siteDocument,
  'economy_global_profiles_v1.json': countryDocument,
  'country_factory_input_inventory_baseline_v1.json': factoryInputBaseline
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
const plain = value => JSON.parse(JSON.stringify(value));

test('source catalog contract remains exactly 41 resource identities and 21 factory profiles', () => {
  assert.equal(resourceIds.length, 41);
  assert.equal(factoryTypes.length, 21);
  assert.equal(siteDocument.records.length, siteDocument.siteCount);
  assert.equal(policy.canonicalIdentityPolicy.resourceProfileCount, 41);
  assert.equal(policy.canonicalIdentityPolicy.factoryProfileCount, 21);
  assert.equal(factoryInputBaseline.countryCount, 197);
  assert.equal(factoryInputBaseline.factoryTypeCount, 21);
  assert.equal(factoryInputBaseline.worldStartingFactoryUnits, 15920);
  assert.equal(factoryInputBaseline.buffer.percent, 40);
  assert.equal(factoryInputBaseline.buffer.multiplier, 1.4);
  assert.equal(Object.keys(factoryInputBaseline.worldOpeningStockByProduct).length, 69);
  assert.equal(factoryInputBaseline.summary.countriesUsingMultipleFactoryRoutes, 63);
  assert.equal(factoryInputBaseline.summary.startingFactoryUnitsAcrossMultiRouteTypes, 970);
  assert.equal(factoryInputBaseline.summary.totalOpeningStockSimulationUnits, 16405900);
  for (const country of Object.values(factoryInputBaseline.countries)) {
    assert.equal(country.factoryInputRows.every(row =>
      Math.abs(row.openingStockQuantity - row.demandPerFullCycle * 1.4) < 1e-5), true);
  }
  assert.equal(policy.openingStock.neverUseGeologicalReservesAsStock, true);
  assert.equal(policy.startupFactories.reserveQuantityUsedAsWarehouseStock, false);
  assert.equal(policy.startupFactories.maxOneDownstreamAssetPerFactoryTypePerCountry, true);
  assert.equal(policy.bootstrap.neverReplenishAfterInitialization, true);
  assert.equal(policy.factoryInputStockBaseline.enabled, true);
  assert.equal(policy.factoryInputStockBaseline.bufferPercent, 0);
  assert.equal(policy.factoryInputStockBaseline.legacyCycleBufferPercent, 40);
  assert.equal(policy.factoryInputStockBaseline.targetCoverageDays, 100);
  assert.equal(policy.factoryInputStockBaseline.recurringDomesticSupply.onlySelectedPlayerCountry, true);
  assert.equal(policy.factoryInputStockBaseline.recurringDomesticSupply.wallClockTimers, false);
  assert.equal(policy.factoryInputStockBaseline.oneTimeOnly, true);
  assert.equal(policy.factoryInputStockBaseline.neverUseGeologicalReservesAsStock, true);
});

test('on-demand Resource Ministry baseline seeds only the selected player country and is idempotent', async () => {
  const state = makeState();
  const { api } = makeHarness(state);
  await api.ready;

  const first = await api.ensurePlayerCountryBaseline('BGD');
  assert.ok(['COMPLETED','COMPLETED_WITH_REPORTED_GAPS','ALREADY_INITIALIZED'].includes(first.status));
  assert.equal(first.scope, 'PLAYER_COUNTRY_ONLY');
  assert.ok(state.resource.BGD.factoryInputBaselineV1,
    'the selected country must receive its country-specific factory input stock baseline');
  assert.ok(Object.keys(state.resource.BGD.inventory || {}).length > 0,
    'the selected country must receive visible current inventory balances');
  assert.equal(Object.prototype.hasOwnProperty.call(state.resource, 'USA'), false,
    "opening the player inventory must not create another country's resource bucket");
  assert.equal(Object.prototype.hasOwnProperty.call(state.economy, 'USA'), false,
    "opening the player inventory must not initialize another country's factory runtime");
  assert.equal(Object.prototype.hasOwnProperty.call(state.resource, 'IND'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.economy, 'IND'), false);

  const before = plain({
    inventory: state.resource.BGD.inventory,
    warehouse: state.resource.BGD.warehouse,
    processedWarehouse: state.resource.BGD.processedWarehouse
  });
  const second = await api.ensurePlayerCountryBaseline('BGD');
  assert.equal(second.status, 'ALREADY_INITIALIZED',
    "re-entering the selected country's ministry must not mint duplicate opening stock");
  assert.deepEqual(plain({
    inventory: state.resource.BGD.inventory,
    warehouse: state.resource.BGD.warehouse,
    processedWarehouse: state.resource.BGD.processedWarehouse
  }), before);

  const denied = await api.ensurePlayerCountryBaseline('USA');
  assert.equal(denied.status, 'BLOCKED');
  assert.equal(denied.reason, 'PLAYER_COUNTRY_SCOPE_MISMATCH');
  assert.equal(Object.prototype.hasOwnProperty.call(state.resource, 'USA'), false,
    "a request to load a non-player country must be rejected before state creation");
});

test('fresh session seeds opening stock and starting factories for the player country only', async () => {
  const state = makeState();
  const { context, api, emittedEvents, emitSimulationEvent } = makeHarness(state);
  const ready = await api.ready;
  assert.equal(ready.status, 'READY');
  assert.equal(ready.countryCount, 249);
  assert.equal(ready.resourceProfileCount, 41);
  assert.equal(ready.factoryProfileCount, 21);
  assert.equal(ready.factoryInputCountryCount, 197);
  assert.equal(ready.factoryInputProductCount, 69);

  state.resource.BGD.inventoryUnits.natural_gas = 'UNREGISTERED_STOCK_UNIT';
  const committedStockEvents = [];
  context.addEventListener('OMEGA_RESOURCE_INVENTORY_CHANGED', event => {
    const detail = event && event.detail || {};
    const stockSource = detail.provenance && detail.provenance.source;
    const isExistingDemandOpeningStock = stockSource === 'SIMULATED_STARTUP_BASELINE_V1';
    const isFactoryInputRawStock = stockSource === 'SIMULATED_FACTORY_INPUT_STARTUP_BASELINE_V2' && detail.stage === 'RAW';
    if (!isExistingDemandOpeningStock && !isFactoryInputRawStock) return;
    const bucket = state.resource[detail.countryId];
    const batch = (bucket.batches || []).find(row => row.batchId === detail.transactionId);
    const lot = bucket.inventoryLots && bucket.inventoryLots[detail.transactionId];
    const receipt = (bucket.warehouse && bucket.warehouse.receipts || []).find(row => row.batchId === detail.transactionId);
    committedStockEvents.push({
      countryId: detail.countryId,
      resourceId: detail.resourceId,
      aggregate: bucket.inventory[detail.resourceId],
      batch: !!batch,
      lot: !!lot,
      warehouseQuantity: bucket.warehouse && bucket.warehouse.availableByResource[detail.resourceId],
      receipt: !!receipt
    });
  });
  emitSimulationEvent('OMEGA_GAME_SESSION_CREATED', {
    session: JSON.parse(JSON.stringify(state.simulation.session))
  });
  const initialized = await api.waitForPendingInitialization();
  assert.ok(['COMPLETED_WITH_REPORTED_GAPS', 'COMPLETED'].includes(initialized.status));
  assert.equal(initialized.scope, 'PLAYER_COUNTRY_ONLY');
  assert.deepEqual(Object.keys(state.resource), ['BGD'],
    'fresh startup must not create resource buckets for other countries');
  assert.deepEqual(Object.keys(state.economy), ['BGD'],
    'fresh startup must not activate factory assets for other countries');
  assert.equal(state.resource.IND, undefined);
  assert.equal(state.economy.IND, undefined);
  assert.equal(state.resource.USA, undefined);
  assert.equal(state.economy.USA, undefined);
  assert.equal(state.simulation.startupBaselineV1, undefined,
    'player-only startup must not write a world-wide baseline report');

  const bangladeshFactoryCoal = factoryInputBaseline.countries.BGD.factoryInputRows.find(row => row.productId === 'coal');
  assert.ok(bangladeshFactoryCoal);
  const bangladeshCoalDailyDemand = bangladeshFactoryCoal.sources.reduce((sum, source) =>
    sum + source.demandQuantity / Math.max(1, source.cycleDays || 1), 0);
  const bangladeshFactoryStock = state.resource.BGD.factoryInputBaselineV1.stockRows.find(row => row.productId === 'coal');
  const bangladeshCoalTarget = bangladeshCoalDailyDemand * 100;
  assert.equal(state.resource.BGD.inventory.coal, bangladeshCoalTarget,
    'opening current stock is calculated from this country\'s own factory input demand and 100-day target');
  assert.equal(state.resource.BGD.inventoryUnits.coal, 'TONNES',
    'the factory opening-stock seed must not overwrite an existing product-unit label');
  assert.equal(state.resource.BGD.factoryInputBaselineV1.openingStockInitialized, true);
  assert.equal(state.resource.BGD.factoryInputBaselineV1.coverageModelVersion, '2.0.0');
  assert.equal(state.resource.BGD.factoryInputBaselineV1.targetCoverageDays, 100);
  assert.equal(state.resource.BGD.factoryInputBaselineV1.bufferPercent, 0);
  assert.ok(bangladeshFactoryStock);
  assert.equal(bangladeshFactoryStock.targetCoverageDays, 100);
  assert.equal(bangladeshFactoryStock.targetStockQuantity, bangladeshCoalTarget);
  const bangladeshCoalBatchId = bangladeshFactoryStock.batchId;
  assert.ok(bangladeshCoalBatchId.startsWith('STARTUP-FACTORY-INPUT-V2-BGD-COAL-C100'));
  assert.ok(state.resource.BGD.batches.some(row => row.batchId === bangladeshCoalBatchId && row.stage === 'RAW'));
  assert.ok(state.resource.BGD.inventoryLots[bangladeshCoalBatchId]);
  assert.ok(state.resource.BGD.warehouse.receipts.some(row => row.batchId === bangladeshCoalBatchId));
  assert.equal(state.resource.BGD.warehouse.availableByResource.coal, state.resource.BGD.inventory.coal);

  const bangladeshIntermediate = factoryInputBaseline.countries.BGD.factoryInputRows.find(row => row.stage === 'INTERMEDIATE');
  assert.ok(bangladeshIntermediate);
  const intermediateStockRow = state.resource.BGD.factoryInputBaselineV1.stockRows.find(row => row.productId === bangladeshIntermediate.productId);
  assert.ok(intermediateStockRow);
  assert.equal(state.resource.BGD.processedWarehouse.availableByResource[bangladeshIntermediate.productId],
    intermediateStockRow.targetStockQuantity / intermediateStockRow.unitBridgeFactor,
    'intermediate factory inputs use the player country\'s configured coverage calculation');
  assert.equal(state.resource.BGD.inventoryUnits.natural_gas, 'UNREGISTERED_STOCK_UNIT',
    'unknown pre-existing unit metadata must be preserved without inventing a conversion');
  assert.equal(Object.prototype.hasOwnProperty.call(state.resource.BGD.inventory, 'natural_gas'), false,
    'an incompatible unit must not create fabricated positive stock');
  assert.ok(state.resource.BGD.startupBaselineV1.unknownResourceIds.includes('natural_gas'));
  assert.equal(state.economy.BGD.population_2015, 123456789);
  assert.equal(state.economy.BGD.unemployment_rate, 7);
  assert.equal(state.transport.BGD.infrastructure.utilitySupply.electricityMWhPerDay, 0);
  assert.equal(state.transport.BGD.infrastructure.utilitySupply.waterM3PerDay, 0);

  assert.ok(emittedEvents.some(event => event.type === 'OMEGA_RESOURCE_STARTUP_BASELINE_COMPLETED'));
  assert.ok(committedStockEvents.length > 0);
  assert.ok(committedStockEvents.every(row => row.countryId === 'BGD'),
    'every startup stock event must belong to the selected player country');
  assert.ok(committedStockEvents.every(row => row.batch && row.lot && row.receipt),
    'opening-stock events follow aggregate inventory, batch, lot, and warehouse receipt commits');
  assert.ok(committedStockEvents.every(row => Math.abs(row.aggregate - row.warehouseQuantity) < 1e-9),
    'aggregate and warehouse current stock must agree');

  const bangladesh = state.economy.BGD.productionAssets;
  assert.ok(bangladesh.some(asset => asset.factoryType === 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'),
    'Bangladesh receives an eligible starter processor from its site context');
  const starter = bangladesh.find(asset => asset.factoryType === 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT');
  assert.ok(starter.id.startsWith('STARTUP-FAC-00-BGD-'));
  assert.ok(starter.startupBaselineV1.notObservedFacility);
  assert.equal(starter.startupBaselineV1.reserveQuantityUsedAsWarehouseStock, false);
  assert.ok(starter.startupBaselineV1.sourceSiteIds.length > 0);
  assert.ok(factoryTypes.includes(starter.factoryType));
  assert.deepEqual(Object.keys(starter.inputCoefficients).map(token).sort(), ['coal']);
  assert.equal(starter.productionHealth.status, 'STOPPED');

  // The 197-country dataset remains available as static country-specific input data.
  // Only the active country's baseline is materialized into the live game state.
  const indiaFactoryCoal = factoryInputBaseline.countries.IND.factoryInputRows.find(row => row.productId === 'coal');
  assert.ok(indiaFactoryCoal);
  assert.notDeepEqual(plain(indiaFactoryCoal.sources), plain(bangladeshFactoryCoal.sources),
    'different national factory allocations must produce different resource input demand profiles');

  const seededTypes = new Set();
  for (const country of Object.values(state.economy)) {
    for (const asset of country && Array.isArray(country.productionAssets) ? country.productionAssets : []) {
      if (!String(asset.id || '').startsWith('STARTUP-FAC-')) continue;
      assert.ok(factoryTypes.includes(asset.factoryType));
      assert.equal(asset.authority, 'SIMULATED_STARTUP_BASELINE_V1');
      assert.ok(asset.startupBaselineV1.notObservedFacility);
      if (!asset.recipeId) assert.ok(asset.startupBaselineV1.sourceSiteIds.length > 0);
      seededTypes.add(asset.factoryType);
    }
  }
  assert.ok(seededTypes.size > 0);
  assert.ok(seededTypes.size <= 21);
});

test('metadata-only resources stay unknown and unmaterialized for inactive countries', async () => {
  const state = makeState({
    simulation: {
      turn: 1,
      session: {
        sessionId: 'OMEGA-STARTUP-TEST-ANTARCTICA',
        playerCountryId: 'ATA',
        status: 'READY',
        createdTurn: 1,
        lastCommittedTurn: 1
      }
    },
    resource: {},
    economy: {},
    transport: {}
  });
  const { api, emitSimulationEvent } = makeHarness(state);
  await api.ready;
  emitSimulationEvent('OMEGA_GAME_SESSION_CREATED', {
    session: JSON.parse(JSON.stringify(state.simulation.session))
  });
  const initialized = await api.waitForPendingInitialization();
  assert.ok(['COMPLETED_WITH_REPORTED_GAPS', 'COMPLETED'].includes(initialized.status));
  assert.equal(initialized.scope, 'PLAYER_COUNTRY_ONLY');

  for (const rid of ['gypsum', 'niobium', 'ruby', 'limestone']) {
    const profile = economyRules.demand.resourceProfiles[rid];
    assert.ok(!positive(profile.basePerMillionPopulation),
      rid + ' must not gain an invented per-capita demand coefficient');
  }
  const antarcticaProfile = profileFor('ATA');
  assert.ok(antarcticaProfile);
  const antarcticaInventory = state.resource.ATA && state.resource.ATA.inventory || {};
  assert.equal(Object.keys(antarcticaInventory).length, 0,
    'a country with no population, eligible mine site or factory input receives no fabricated stock');
  assert.deepEqual(Object.keys(state.resource), ['ATA']);
  assert.deepEqual(Object.keys(state.economy), ['ATA']);
  assert.equal(state.resource.BGD, undefined);
  assert.equal(state.resource.USA, undefined);
  const countryReport = api.getCountryReport('ATA');
  assert.ok(countryReport);
  assert.ok(countryReport.unknownResourceIds.length > 0);
  assert.equal(countryReport.openingStockSeeded, 0);
});

test('repeated startup calls and depletion after initialization never replenish or duplicate opening assets', async () => {
  const state = makeState({
    simulation: {
      turn: 1,
      session: {
        sessionId: 'OMEGA-STARTUP-TEST-INDIA',
        playerCountryId: 'IND',
        status: 'READY',
        createdTurn: 1,
        lastCommittedTurn: 1
      }
    },
    resource: {},
    economy: {},
    transport: {}
  });
  const { api } = makeHarness(state);
  await api.ready;
  const session = JSON.parse(JSON.stringify(state.simulation.session));
  const initial = await api.initializeForSession(session);
  assert.ok(['COMPLETED_WITH_REPORTED_GAPS', 'COMPLETED'].includes(initial.status));
  assert.equal(initial.scope, 'PLAYER_COUNTRY_ONLY');
  assert.deepEqual(Object.keys(state.resource), ['IND']);
  assert.deepEqual(Object.keys(state.economy), ['IND']);
  assert.equal(state.resource.BGD, undefined);
  assert.equal(state.economy.BGD, undefined);

  const beforeAssets = state.economy.IND.productionAssets.map(asset => asset.id).sort();
  const beforeInventoryCount = Object.keys(state.resource.IND.inventory).length;
  assert.ok(beforeInventoryCount > 0);
  delete state.resource.IND.inventory.coal;
  const repeated = await api.initializeForSession(session);
  assert.equal(repeated.status, 'ALREADY_INITIALIZED');
  assert.equal(Object.prototype.hasOwnProperty.call(state.resource.IND.inventory, 'coal'), false,
    'opening stock is one-time and cannot replenish after depletion');
  assert.deepEqual(plain(state.economy.IND.productionAssets.map(asset => asset.id).sort()), plain(beforeAssets));
  assert.equal(Object.keys(state.resource.IND.inventory).length, beforeInventoryCount - 1);

  const loadedState = JSON.parse(JSON.stringify(state));
  const reload = makeHarness(loadedState);
  await reload.api.ready;
  const loadedResult = await reload.api.initializeForSession(loadedState.simulation.session);
  assert.equal(loadedResult.status, 'ALREADY_INITIALIZED');
  assert.equal(Object.prototype.hasOwnProperty.call(loadedState.resource.IND.inventory, 'coal'), false);
  assert.deepEqual(plain(loadedState.economy.IND.productionAssets.map(asset => asset.id).sort()), plain(beforeAssets));
  assert.deepEqual(Object.keys(loadedState.resource), ['IND']);
  assert.deepEqual(Object.keys(loadedState.economy), ['IND']);
});

test('mid-game existing save receives one additive player-country inventory recovery', async () => {
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
  const originalFactoryIds = state.economy.BGD.productionAssets.map(row => row.id);
  const { context, api, emitSimulationEvent } = makeHarness(state);
  await api.ready;
  emitSimulationEvent('OMEGA_GAME_SESSION_CREATED', {
    session: JSON.parse(JSON.stringify(state.simulation.session))
  });
  const result = await api.waitForPendingInitialization();
  assert.ok(['COMPLETED_WITH_REPORTED_GAPS', 'COMPLETED'].includes(result.status));
  assert.equal(state.simulation.startupBaselineV1, undefined,
    'existing-save recovery must not overwrite or fabricate a new-game global baseline report');
  assert.equal(state.resource.BGD.startupBaselineV1.openingStockInitialized, true);
  assert.equal(state.resource.BGD.factoryInputBaselineV1.openingStockInitialized, true);
  assert.equal(state.economy.BGD.startupBaselineV1.factoryAssetsInitialized, true);
  assert.ok(state.resource.BGD.inventory.coal > 0,
    'the existing save receives the approved one-time factory-input stock without using geological reserve quantities');
  assert.ok(originalFactoryIds.every(id => state.economy.BGD.productionAssets.some(row => row.id === id)),
    'all existing factory assets are preserved');
  assert.equal(Object.keys(state.resource).length, 1,
    'recovery activates only the selected player country rather than materializing all 249 country buckets');
  const inventoryAfterRecovery = JSON.stringify(state.resource.BGD.inventory);
  const factoryIdsAfterRecovery = JSON.stringify(state.economy.BGD.productionAssets.map(row => row.id).sort());
  const repeated = await api.initializeForSession(state.simulation.session);
  assert.equal(repeated.status, 'ALREADY_INITIALIZED');
  assert.equal(JSON.stringify(state.resource.BGD.inventory), inventoryAfterRecovery,
    'reopening the same save cannot replenish depleted or initialized opening stock');
  assert.equal(JSON.stringify(state.economy.BGD.productionAssets.map(row => row.id).sort()), factoryIdsAfterRecovery,
    'reopening the same save cannot duplicate factory assets');
});


test('configured factory input coverage changes top up only the shortfall and stay idempotent', async () => {
  const state = makeState();
  const { api, emitSimulationEvent } = makeHarness(state);
  await api.ready;
  emitSimulationEvent('OMEGA_GAME_SESSION_CREATED', {
    session: JSON.parse(JSON.stringify(state.simulation.session))
  });
  const first = await api.waitForPendingInitialization();
  assert.ok(['COMPLETED_WITH_REPORTED_GAPS', 'COMPLETED'].includes(first.status));
  const resource = state.resource.BGD;
  const firstMarker = resource.factoryInputBaselineV1;
  const firstRow = firstMarker.stockRows.find(row => row.productId === 'coal');
  const daily = firstRow.dailyDemandQuantity;
  const firstStoredTarget = firstRow.targetStockQuantity / firstRow.unitBridgeFactor;
  assert.equal(firstMarker.targetCoverageDays, 100);
  assert.ok(Math.abs(resource.inventory.coal - firstStoredTarget) < 1e-6);

  const invalid = await api.setFactoryInputCoverageDays('BGD', 3651);
  assert.equal(invalid.status, 'BLOCKED');
  assert.equal(invalid.reason, 'FACTORY_INPUT_COVERAGE_DAYS_OUT_OF_RANGE');
  const otherCountry = await api.setFactoryInputCoverageDays('IND', 120);
  assert.equal(otherCountry.status, 'BLOCKED');
  assert.equal(otherCountry.reason, 'PLAYER_COUNTRY_SCOPE_VIOLATION');

  const upgraded = await api.setFactoryInputCoverageDays('BGD', 120);
  assert.ok(['APPLIED', 'COMPLETED_WITH_REPORTED_GAPS'].includes(upgraded.status), JSON.stringify(upgraded));
  const upgradedMarker = resource.factoryInputBaselineV1;
  const upgradedRow = upgradedMarker.stockRows.find(row => row.productId === 'coal');
  const expected120DayStock = daily * 120 / upgradedRow.unitBridgeFactor;
  assert.equal(upgradedMarker.targetCoverageDays, 120);
  assert.ok(Math.abs(resource.inventory.coal - expected120DayStock) < 1e-6,
    'the 120-day target adds only the missing 20 days and leaves the already available 100-day stock in place');
  assert.equal(upgradedRow.batchId, 'STARTUP-FACTORY-INPUT-V2-BGD-COAL-C120');
  const afterUpgrade = JSON.stringify(resource.inventory);
  const repeated = await api.setFactoryInputCoverageDays('BGD', 120);
  assert.equal(repeated.status, 'ALREADY_INITIALIZED');
  assert.equal(JSON.stringify(resource.inventory), afterUpgrade,
    're-entering the same configured coverage window cannot credit the top-up twice');
});
