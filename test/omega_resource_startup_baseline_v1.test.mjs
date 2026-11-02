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

test('fresh session seeds bounded opening stock and source-context-driven factories without overwriting saved values', async () => {
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
  const bangladeshFactoryCoal = factoryInputBaseline.countries.BGD.factoryInputRows.find(row => row.productId === 'coal');
  assert.ok(bangladeshFactoryCoal);
  const bangladeshCoalDailyDemand = bangladeshFactoryCoal.sources.reduce((sum, source) =>
    sum + source.demandQuantity / Math.max(1, source.cycleDays || 1), 0);
  const bangladeshFactoryStock = state.resource.BGD.factoryInputBaselineV1.stockRows.find(row => row.productId === 'coal');
  const bangladeshCoalTarget = bangladeshCoalDailyDemand * 100;
  assert.equal(state.resource.BGD.inventory.coal, bangladeshCoalTarget,
    'opening current stock is daily recipe demand multiplied by the configured 100-day target, not a 1.4-cycle buffer');
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
    'intermediate input quantities are seeded into the processed warehouse using the same configured coverage calculation');
  assert.equal(state.resource.BGD.inventoryUnits.natural_gas, 'UNREGISTERED_STOCK_UNIT',
    'unknown pre-existing unit metadata must be preserved without inventing a conversion');
  assert.equal(Object.prototype.hasOwnProperty.call(state.resource.BGD.inventory, 'natural_gas'), false,
    'a profile rate with an incompatible existing unit must not seed positive stock');
  assert.ok(state.resource.BGD.startupBaselineV1.unknownResourceIds.includes('natural_gas'),
    'incompatible unit coverage must be visible as unknown');
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
  assert.ok(committedStockEvents.length > 0);
  assert.ok(committedStockEvents.every(row => row.batch && row.lot && row.receipt),
    'opening-stock events are emitted only after the aggregate inventory, batch, lot, and warehouse receipt are committed');
  assert.ok(committedStockEvents.every(row => Math.abs(row.aggregate - row.warehouseQuantity) < 1e-9),
    'opening-stock quantity shown by the warehouse agrees with the aggregate inventory at event time');

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
  assert.deepEqual(plain(indiaSteelWorks.startupBaselineV1.locallySupportedInputIds), ['iron_concentrate', 'coal_concentrate']);
  assert.deepEqual(plain(indiaSteelWorks.startupBaselineV1.externalInputResourceIds), ['cement_feed', 'copper_concentrate']);
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
  const coalStockRow = indiaResource.startupBaselineV1.stockRows.find(row => row.resourceId === 'coal');
  const indiaFactoryCoal = factoryInputBaseline.countries.IND.factoryInputRows.find(row => row.productId === 'coal');
  assert.ok(indiaFactoryCoal);
  assert.ok(positive(indiaResource.inventory.coal));
  // A per-capita raw-resource rate is seeded only when its configured unit map
  // can resolve the profile rate into an accepted inventory unit. Otherwise it
  // stays explicitly UNKNOWN; the independent factory recipe input stock is
  // still added in its own declared simulation unit.
  const expectedIndiaNationalCoal = coalStockRow
    ? indiaCoalBaseline.basePerMillionPopulation *
      indiaProfile.populationValues.population_2015 / 1000000 * coalStockRow.targetCoverageDays
    : 0;
  if (coalStockRow) {
    assert.equal(coalStockRow.targetCoverageDays, 40,
      'critical coal stock uses the configured 40-day opening buffer, not the 100-day contract term');
    assert.equal(coalStockRow.demandSource, 'RULE_PROFILE_POPULATION_BASELINE');
    assert.ok(coalStockRow.batchId.startsWith('STARTUP-STOCK-V1-IND-COAL'));
    assert.ok(indiaResource.batches.some(row => row.batchId === coalStockRow.batchId && row.stage === 'RAW'));
    assert.ok(indiaResource.inventoryLots[coalStockRow.batchId]);
    assert.ok(indiaResource.warehouse.storedBatchIds.includes(coalStockRow.batchId));
    assert.ok(indiaResource.warehouse.receipts.some(row => row.batchId === coalStockRow.batchId));
    assert.ok(indiaResource.inventoryLedger.some(row => row.batchId === coalStockRow.batchId && row.type === 'INVENTORY_CREATED'));
  } else {
    assert.ok(indiaResource.startupBaselineV1.unknownResourceIds.includes('coal'),
      'coal stays unknown when its national demand profile lacks an accepted stock-unit bridge');
  }
  const indiaFactoryStockRow = indiaResource.factoryInputBaselineV1.stockRows.find(item => item.productId === 'coal');
  assert.ok(indiaFactoryStockRow);
  const indiaFactoryTargetStored = indiaFactoryStockRow.targetStockQuantity / indiaFactoryStockRow.unitBridgeFactor;
  assert.ok(Math.abs(indiaResource.inventory.coal - Math.max(expectedIndiaNationalCoal, indiaFactoryTargetStored)) < 1e-6,
    'national opening stock is preserved and factory input stock tops the same current balance up to its target instead of double-crediting it');
  assert.equal(indiaResource.inventoryUnits.coal, coalStockRow && coalStockRow.unit || 'SIMULATION_RESOURCE_UNIT');
  assert.equal(indiaResource.startupBaselineV1.openingStockCoverageDays, 14,
    'the legacy fallback remains 14 days while priority-specific target days are recorded per stock row');
  assert.deepEqual(plain(indiaResource.startupBaselineV1.openingStockCoverageDaysByPriority), policy.openingStock.coverageDaysByPriority);
  assert.equal(indiaResource.startupBaselineV1.geologicalReserveQuantityUsedAsStock, false);
  assert.equal(indiaResource.startupBaselineV1.stockRowsEncoding, 'COMPACT_PER_RESOURCE_PROVENANCE_V1');
  assert.equal(indiaResource.warehouse.availableByResource.coal, indiaResource.inventory.coal);
  const factoryCoalRow = indiaFactoryStockRow;
  assert.ok(factoryCoalRow);
  if (factoryCoalRow.batchId) {
    assert.ok(indiaResource.batches.some(row => row.batchId === factoryCoalRow.batchId && row.stage === 'RAW'));
    assert.ok(indiaResource.inventoryLots[factoryCoalRow.batchId]);
    assert.ok(indiaResource.warehouse.storedBatchIds.includes(factoryCoalRow.batchId));
    assert.ok(indiaResource.warehouse.receipts.some(row => row.batchId === factoryCoalRow.batchId));
  }

  for (const code of Object.keys(state.resource)) {
    const bucket = state.resource[code];
    if (!bucket || !bucket.startupBaselineV1) continue;
    const factoryInputIds = new Set((factoryInputBaseline.countries[code]?.factoryInputRows || [])
      .map(row => token(row.productId)));
    const newKeys = Object.keys(bucket.inventory || {});
    for (const key of newKeys) {
      // The national raw-resource namespace remains exactly the canonical 41.
      // Factory input intermediates are admitted only from that country's explicit
      // factory recipe baseline, never as new natural-resource identities.
      if (code === 'BGD' && key === 'coal') continue;
      assert.ok(resourceIds.includes(token(key)) || factoryInputIds.has(token(key)),
        'unexpected resource/factory-input identity added: ' + code + '/' + key);
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
  const { context, api, emitSimulationEvent } = makeHarness(state);
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
  const { context, api, emitSimulationEvent } = makeHarness(state);
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
  assert.deepEqual(plain(state.economy.IND.productionAssets.map(asset => asset.id).sort()), plain(beforeAssets));
  assert.equal(Object.keys(state.resource.IND.inventory).length, beforeInventoryCount - 1,
    'deleting a stock key after initialization must remain deleted without adding another inventory key');

  const loadedState = JSON.parse(JSON.stringify(state));
  const reload = makeHarness(loadedState);
  await reload.api.ready;
  const loadedResult = await reload.api.initializeForSession(loadedState.simulation.session);
  assert.equal(loadedResult.status, 'ALREADY_INITIALIZED');
  assert.equal(Object.prototype.hasOwnProperty.call(loadedState.resource.IND.inventory, 'coal'), false);
  assert.deepEqual(plain(loadedState.economy.IND.productionAssets.map(asset => asset.id).sort()), plain(beforeAssets));
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
