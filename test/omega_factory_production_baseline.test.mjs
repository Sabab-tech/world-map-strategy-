import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const readJson = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const readText = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const token = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function makeRuntime() {
  const catalog = readJson('resource_industrial_catalog_v1.json');
  const bus = { listeners: new Map(),
    addEventListener(type, fn) { const rows = this.listeners.get(type) || []; rows.push(fn); this.listeners.set(type, rows); },
    dispatchEvent(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); return true; }
  };
  const context = {
    console, Math, Number, String, Object, Array, Set, Map, WeakMap, Promise, JSON, Date, Intl,
    Game: { state: { simulation: { turn: 1, startYear: 2015, date: '2015-01-01', daysPerTurn: 1 },
      resource: {}, economy: {}, transport: {}, trade: {}, finance: {}, foreign: {} } },
    Omega: { ResourceIndustrialCatalogData: catalog }, OmegaResourceIndustrialCatalogData: catalog,
    ResourceMinistryEngine: { resourceTypes: [] },
    addEventListener: bus.addEventListener.bind(bus), dispatchEvent: bus.dispatchEvent.bind(bus),
    fetch: async () => ({ ok: true, status: 200, json: async () => catalog })
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readText('omega_resource_industrial_network_v1.js'), context,
    { filename: 'omega_resource_industrial_network_v1.js' });
  return { context, catalog, api: context.Omega.ResourceIndustrialNetwork };
}

const steelRecipe = {
  iron_concentrate: 0.60,
  coal_concentrate: 0.20,
  limestone: 0.10,
  copper_concentrate: 0.10
};
const makeSteelAsset = (overrides = {}) => ({
  id: 'FAC-STEEL-TEST', countryId: 'BGD', factoryType: 'STEEL_AND_ALLOY_WORKS',
  recipeId: 'STEEL_PRIMARY_ROUTE_V1', recipeMode: 'MULTI_INPUT',
  inputCoefficients: steelRecipe,
  outputProfile: { STEEL: 0.72, ALLOY_STEEL: 0.08, BLAST_FURNACE_SLAG: 0.15, PROCESSING_DUST: 0.05 },
  inputInventory: { iron_concentrate: 60, coal_concentrate: 20, limestone: 10, copper_concentrate: 10 },
  inputBatchLots: [
    { batchId: 'INPUT-IRON', resourceId: 'iron_concentrate', quantity: 60, remainingQuantity: 60, unit: 'SIMULATION_TONNE_EQUIVALENT', sourceBatchIds: ['MINE-IRON-001'], createdTurn: 1 },
    { batchId: 'INPUT-COAL', resourceId: 'coal_concentrate', quantity: 20, remainingQuantity: 20, unit: 'SIMULATION_TONNE_EQUIVALENT', sourceBatchIds: ['MINE-COAL-001'], createdTurn: 1 },
    { batchId: 'INPUT-LIME', resourceId: 'limestone', quantity: 10, remainingQuantity: 10, unit: 'SIMULATION_TONNE_EQUIVALENT', sourceBatchIds: ['MINE-LIME-001'], createdTurn: 1 },
    { batchId: 'INPUT-COPPER', resourceId: 'copper_concentrate', quantity: 10, remainingQuantity: 10, unit: 'SIMULATION_TONNE_EQUIVALENT', sourceBatchIds: ['MINE-COPPER-001'], createdTurn: 1 }
  ],
  capacity: 100, capacityPerDay: 100, inputUnit: 'SIMULATION_TONNE_EQUIVALENT',
  outputUnit: 'SIMULATION_TONNE_EQUIVALENT', requireTrackedInputs: true,
  companyId: 'SIM-TEST-CO', status: 'OPERATIONAL', ...overrides
});

test('canonical factory catalog, type profiles, offline icons and recipe coefficients are consistent', () => {
  const { catalog, api } = makeRuntime();
  const audit = api.factoryCatalogDiagnostics();
  assert.equal(audit.status, 'HEALTHY', JSON.stringify(audit.issues));
  assert.equal(Object.keys(catalog.processingRules).length, 39);
  assert.equal(new Set(Object.values(catalog.processingRules).map(row => row.factoryType)).size, 36);
  assert.equal(Object.keys(catalog.factoryProfiles).length, 56);
  assert.equal(Object.keys(catalog.downstreamFactoryRecipes).length, 21);
  assert.equal(catalog.factoryCatalogSummary.addedFactoryTypeCount, 20);
  assert.equal(catalog.factoryCatalogSummary.categoryCount, 12);

  const iconSource = readText('omega_icon_system_v1.js');
  const symbolStart = iconSource.indexOf('const SYMBOLS');
  const symbolEnd = iconSource.indexOf('const normalizeEmoji', symbolStart);
  assert.ok(symbolStart >= 0 && symbolEnd > symbolStart, 'offline SVG SYMBOLS block must exist');
  const symbolNames = new Set([...iconSource.slice(symbolStart, symbolEnd).matchAll(/^\s*'([^']+)'\s*:/gm)].map(match => match[1]));
  for (const [type, profile] of Object.entries(catalog.factoryProfiles)) {
    assert.ok(profile.name && profile.category, type + ': identity and category must exist');
    assert.ok(Number(profile.constructionCost) > 0, type + ': simulation construction cost must be positive');
    assert.ok(Number(profile.constructionDays) > 0, type + ': construction duration must be positive');
    assert.ok(Number(profile.defaultCapacityPerDay) > 0, type + ': declared capacity must be positive');
    assert.ok(symbolNames.has(profile.iconId), type + ': icon must resolve offline: ' + profile.iconId);
  }
  for (const [recipeId, recipe] of Object.entries(catalog.downstreamFactoryRecipes)) {
    assert.equal(recipe.recipeId, recipeId);
    assert.equal(recipe.simulationOnly, true);
    assert.equal(recipe.missingInputPolicy, 'BLOCK_CYCLE');
    const inputs = Object.values(recipe.inputs).reduce((sum, value) => sum + Number(value), 0);
    const outputs = Object.values(recipe.outputs).reduce((sum, value) => sum + Number(value), 0);
    assert.ok(Math.abs(inputs - 1) < 1e-9, recipeId + ': input coefficients must total one declared simulation unit');
    assert.ok(Math.abs(outputs - 1) < 1e-9, recipeId + ': output/coproduct coefficients must reconcile to inputs');
    assert.ok(Object.values(recipe.inputs).every(value => Number.isFinite(Number(value)) && Number(value) > 0));
    assert.ok(Object.values(recipe.outputs).every(value => Number.isFinite(Number(value)) && Number(value) > 0));
  }
});

test('factory construction reads its selected recipe and defaults from the canonical profile', () => {
  const { context, catalog, api } = makeRuntime();
  const profile = catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS;
  const project = api.startFactoryProject({
    countryId: 'BGD', factoryType: 'STEEL_AND_ALLOY_WORKS',
    recipeId: 'STEEL_PRIMARY_ROUTE_V1', resourceId: 'iron_concentrate',
    factoryId: 'FAC-STEEL-CONSTRUCT-TEST', buildDays: 30, capacityPerDay: 50,
    requiredTechnologyIds: []
  });
  assert.equal(project.status, 'UNDER_CONSTRUCTION');
  assert.equal(project.factoryType, 'STEEL_AND_ALLOY_WORKS');
  assert.equal(project.recipeId, 'STEEL_PRIMARY_ROUTE_V1');
  assert.equal(project.cost, profile.constructionCost);
  assert.equal(project.capacityPerDay, 50);
  assert.equal(project.recipeMode, 'MULTI_INPUT');
  assert.deepEqual(JSON.parse(JSON.stringify(project.recipe.inputs)), JSON.parse(JSON.stringify(catalog.downstreamFactoryRecipes.STEEL_PRIMARY_ROUTE_V1.inputs)));

  for (let day = 0; day < Math.ceil(project.durationDays); day += 1) {
    context.Game.state.simulation.turn += 1;
    api.advanceProjects('BGD');
  }
  assert.equal(project.status, 'COMPLETED');
  const assets = context.Game.state.economy.BGD.productionAssets;
  const commissioned = assets.find(asset => asset.id === 'FAC-STEEL-CONSTRUCT-TEST');
  assert.ok(commissioned, 'completed project must commission into authoritative country economy state');
  assert.equal(commissioned.status, 'OPERATIONAL');
  assert.equal(commissioned.recipeId, 'STEEL_PRIMARY_ROUTE_V1');
  assert.deepEqual(JSON.parse(JSON.stringify(commissioned.inputCoefficients)), JSON.parse(JSON.stringify(steelRecipe)));
  assert.ok(Array.isArray(commissioned.inputBatchLots));
});

test('multi-input factory consumes every required input once and preserves mine-batch lineage', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset();
  context.Game.state.economy.BGD = { productionAssets: [asset] };
  const run = api.executeFactoryCycle({
    countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50
  });
  assert.equal(run.status, 'COMPLETED', JSON.stringify(run));
  assert.equal(run.recipeId, 'STEEL_PRIMARY_ROUTE_V1');
  assert.deepEqual(JSON.parse(JSON.stringify(run.inputQuantities)), {
    iron_concentrate: 30, coal_concentrate: 10, limestone: 5, copper_concentrate: 5
  });
  assert.equal(run.outputQuantities.STEEL, 36);
  assert.deepEqual(
    ['iron_concentrate', 'coal_concentrate', 'limestone', 'copper_concentrate'].map(id => asset.inputInventory[id]),
    [30, 10, 5, 5]
  );
  for (const mineBatch of ['MINE-IRON-001', 'MINE-COAL-001', 'MINE-LIME-001', 'MINE-COPPER-001']) {
    assert.ok(run.sourceBatchIds.includes(mineBatch), 'missing batch ancestry: ' + mineBatch);
  }
  const resource = context.Game.state.resource.BGD;
  for (const [resourceId, quantity] of Object.entries(run.outputQuantities)) {
    assert.equal(resource.processedWarehouse.availableByResource[resourceId], quantity);
    const outputBatch = resource.batches.find(row => row.processId === run.transactionId && row.resourceId === resourceId);
    assert.ok(outputBatch, resourceId + ': finished goods batch must exist');
    assert.equal(resource.inventoryLots[outputBatch.batchId].remainingQuantity, quantity);
    assert.equal(outputBatch.unit, 'SIMULATION_TONNE_EQUIVALENT');
  }
  const outputCountBeforeRetry = resource.batches.filter(row => row.processId === run.transactionId).length;
  const inputSnapshot = JSON.stringify(asset.inputInventory);
  const retry = api.executeFactoryCycle({
    countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50
  });
  assert.equal(retry.status, 'BLOCKED');
  assert.equal(retry.reason, 'FACTORY_TURN_CAPACITY_ALREADY_USED');
  assert.equal(JSON.stringify(asset.inputInventory), inputSnapshot);
  assert.equal(resource.batches.filter(row => row.processId === run.transactionId).length, outputCountBeforeRetry);
});

test('missing required input blocks multi-input production without consuming partial stock', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset({
    inputInventory: { iron_concentrate: 60, coal_concentrate: 0, limestone: 10, copper_concentrate: 10 },
    inputBatchLots: [
      { batchId: 'INPUT-IRON', resourceId: 'iron_concentrate', quantity: 60, remainingQuantity: 60, sourceBatchIds: ['MINE-IRON-001'] },
      { batchId: 'INPUT-LIME', resourceId: 'limestone', quantity: 10, remainingQuantity: 10, sourceBatchIds: ['MINE-LIME-001'] },
      { batchId: 'INPUT-COPPER', resourceId: 'copper_concentrate', quantity: 10, remainingQuantity: 10, sourceBatchIds: ['MINE-COPPER-001'] }
    ]
  });
  context.Game.state.economy.BGD = { productionAssets: [asset] };
  const stockBefore = JSON.stringify(asset.inputInventory);
  const lotsBefore = JSON.stringify(asset.inputBatchLots);
  const run = api.executeFactoryCycle({
    countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50
  });
  assert.equal(run.status, 'BLOCKED');
  assert.equal(run.reason, 'FACTORY_INPUT_SHORTAGE');
  assert.equal(JSON.stringify(asset.inputInventory), stockBefore);
  assert.equal(JSON.stringify(asset.inputBatchLots), lotsBefore);
  assert.equal((context.Game.state.resource.BGD.batches || []).length, 0);
});

test('tracked input shortage blocks before any component is consumed', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset({
    inputBatchLots: [
      { batchId: 'INPUT-IRON', resourceId: 'iron_concentrate', quantity: 60, remainingQuantity: 60, sourceBatchIds: ['MINE-IRON-001'] },
      { batchId: 'INPUT-COAL', resourceId: 'coal_concentrate', quantity: 20, remainingQuantity: 5, sourceBatchIds: ['MINE-COAL-001'] },
      { batchId: 'INPUT-LIME', resourceId: 'limestone', quantity: 10, remainingQuantity: 10, sourceBatchIds: ['MINE-LIME-001'] },
      { batchId: 'INPUT-COPPER', resourceId: 'copper_concentrate', quantity: 10, remainingQuantity: 10, sourceBatchIds: ['MINE-COPPER-001'] }
    ]
  });
  context.Game.state.economy.BGD = { productionAssets: [asset] };
  const stockBefore = JSON.stringify(asset.inputInventory);
  const lotsBefore = JSON.stringify(asset.inputBatchLots);
  const run = api.executeFactoryCycle({
    countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50
  });
  assert.equal(run.status, 'BLOCKED');
  assert.equal(run.reason, 'FACTORY_INPUT_BATCH_LEDGER_MISMATCH');
  assert.equal(JSON.stringify(asset.inputInventory), stockBefore);
  assert.equal(JSON.stringify(asset.inputBatchLots), lotsBefore);
  assert.equal((context.Game.state.resource.BGD.batches || []).length, 0);
});

test('unknown generic production is not allowed to create a factory project without explicit opt-in', () => {
  const { api } = makeRuntime();
  const blocked = api.startFactoryProject({ countryId: 'BGD', resourceId: 'future_unknown_metal' });
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.reason, 'UNVERIFIED_GENERIC_RECIPE_REQUIRES_EXPLICIT_SIMULATION_OPT_IN');
  const allowed = api.startFactoryProject({
    countryId: 'BGD', resourceId: 'future_unknown_metal', allowSimulationFallback: true
  });
  assert.equal(allowed.status, 'UNDER_CONSTRUCTION');
  assert.equal(allowed.recipeAuthority, 'SIMULATED_GENERIC_FALLBACK');
});
