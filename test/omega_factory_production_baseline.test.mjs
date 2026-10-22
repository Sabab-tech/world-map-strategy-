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
  cement_feed: 0.10,
  copper_concentrate: 0.10
};
const makeSteelAsset = (overrides = {}) => ({
  id: 'FAC-STEEL-TEST', countryId: 'BGD', factoryType: 'STEEL_AND_ALLOY_WORKS',
  recipeId: 'STEEL_PRIMARY_ROUTE_V1', recipeMode: 'MULTI_INPUT',
  inputCoefficients: steelRecipe,
  outputProfile: { STEEL: 0.72, ALLOY_STEEL: 0.08, BLAST_FURNACE_SLAG: 0.15, PROCESSING_DUST: 0.05 },
  inputInventory: { iron_concentrate: 60, coal_concentrate: 20, cement_feed: 10, copper_concentrate: 10 },
  inputBatchLots: [
    { batchId: 'INPUT-IRON', resourceId: 'iron_concentrate', quantity: 60, remainingQuantity: 60, unit: 'SIMULATION_TONNE_EQUIVALENT', sourceBatchIds: ['MINE-IRON-001'], createdTurn: 1 },
    { batchId: 'INPUT-COAL', resourceId: 'coal_concentrate', quantity: 20, remainingQuantity: 20, unit: 'SIMULATION_TONNE_EQUIVALENT', sourceBatchIds: ['MINE-COAL-001'], createdTurn: 1 },
    { batchId: 'INPUT-CEMENT-FEED', resourceId: 'cement_feed', quantity: 10, remainingQuantity: 10, unit: 'SIMULATION_TONNE_EQUIVALENT', sourceBatchIds: ['MINE-LIME-001'], createdTurn: 1 },
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
  assert.equal(Object.keys(catalog.processingRules).length, 41);
  assert.equal(new Set(Object.values(catalog.processingRules).map(row => row.factoryType)).size, 37);
  assert.equal(Object.keys(catalog.factoryProfiles).length, 58);
  assert.equal(Object.keys(catalog.downstreamFactoryRecipes).length, 22);
  assert.equal(catalog.factoryCatalogSummary.addedFactoryTypeCount, 20);
  assert.equal(catalog.factoryCatalogSummary.categoryCount, 12);
  assert.ok(catalog.processingRules.diatomite, 'diatomite deposits must have an explicit processing recipe');
  assert.equal(catalog.processingRules.diatomite.factoryType, 'DIATOMITE_PROCESSING_PLANT');
  assert.ok(catalog.processingRules.coral_aggregate, 'coral aggregate deposits must have an explicit processing recipe');
  assert.equal(catalog.processingRules.coral_aggregate.factoryType, 'AGGREGATE_CRUSHING_PLANT');
  for (const recipe of Object.values(catalog.processingRules)) {
    assert.ok(catalog.factoryProfiles[recipe.factoryType], 'every processing recipe must resolve to a canonical factory profile: ' + recipe.factoryType);
  }

  const serviceWorker = readText('omega-offline-map-sw.js');
  assert.match(serviceWorker, /omega-offline-atlas-shell-v21/);
  const factoryUi = readText('omega_resource_command_center_ui_v1.js');
  assert.match(factoryUi, /Unemployed people/, 'industrial UI must expose the unemployment headcount');
  assert.match(factoryUi, /Jobs per factory/, 'catalog UI must expose per-factory job slots');
  assert.match(factoryUi, /Construction materials/, 'catalog UI must expose each factory construction bill of materials');
  for (const asset of ['./resource_industrial_catalog_v1.json', './omega_resource_industrial_network_v1.js', './omega_icon_system_v1.js', './omega_icon_system_v1.css']) {
    assert.ok(serviceWorker.includes(asset), 'offline shell must precache ' + asset);
  }

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
    assert.ok(profile.constructionMaterials && Object.keys(profile.constructionMaterials).length > 0, type + ': construction BOM required');
    assert.equal(profile.constructionMaterialUnit, 'SIMULATION_RESOURCE_UNIT');
    assert.ok(profile.employment && Number(profile.employment.jobsPerFactory) > 0, type + ': employment capacity required');
    assert.equal(profile.employment.simulationOnly, true);
    assert.equal(profile.employment.coreOperatingCrew,
      Number(profile.workforce.operators || 0) + Number(profile.workforce.engineers || 0), type + ': core crew must match operator/engineer profile');
    assert.equal(profile.employment.coreOperatingCrew + profile.employment.additionalDirectStaffSlots,
      profile.employment.jobsPerFactory, type + ': direct job slots must reconcile');
    assert.equal(Object.values(profile.employment.jobBreakdown).reduce((sum, value) => sum + Number(value || 0), 0),
      profile.employment.jobsPerFactory, type + ': job role mix must balance to the total job capacity');
    for (const [material, quantity] of Object.entries(profile.constructionMaterials)) {
      assert.ok(Object.prototype.hasOwnProperty.call(catalog.resourceRules, material), type + ': material must use a registered game resource: ' + material);
      assert.ok(Number.isFinite(Number(quantity)) && Number(quantity) > 0, type + ': construction quantity must be positive: ' + material);
    }
  }
  assert.equal(catalog.factoryCatalogSummary.profilesWithConstructionMaterials, 58);
  assert.equal(catalog.factoryCatalogSummary.profilesWithEmployment, 58);
  for (const unit of ['TONNES_ORE', 'CARATS', 'MILLION_CUBIC_METRES', 'BARRELS']) {
    const bridge = catalog.factoryCatalogPolicy.unitNormalization.sourceUnits[unit];
    assert.ok(bridge, 'used source unit must have an explicit normalization bridge: ' + unit);
    assert.equal(bridge.targetUnit, 'SIMULATION_RESOURCE_UNIT');
    assert.equal(bridge.factor, 1);
    assert.equal(bridge.simulationOnly, true);
  }
  const producers = new Set([
    ...Object.values(catalog.processingRules).flatMap(row => Object.keys(row.outputs || {})),
    ...Object.values(catalog.downstreamFactoryRecipes).flatMap(row => Object.keys(row.outputs || {}))
  ].map(token));
  const rawInputs = new Set([
    ...Object.keys(catalog.resourceRules || {}),
    ...Object.values(catalog.processingRules).flatMap(row => Object.keys(row.inputs || {}))
  ].map(token));
  const externalInputs = new Set(Object.keys(catalog.externalInputSources || {}).map(token));
  const recipeProducerMap = new Map();
  for (const [id, recipe] of Object.entries(catalog.downstreamFactoryRecipes)) {
    for (const output of Object.keys(recipe.outputs || {})) {
      const key = token(output);
      const rows = recipeProducerMap.get(key) || [];
      rows.push(id);
      recipeProducerMap.set(key, rows);
    }
  }
  const dependencyGraph = Object.fromEntries(Object.keys(catalog.downstreamFactoryRecipes).map(id => [id, new Set()]));
  for (const [consumer, recipe] of Object.entries(catalog.downstreamFactoryRecipes)) {
    for (const input of Object.keys(recipe.inputs || {})) {
      const key = token(input);
      assert.ok(producers.has(key) || rawInputs.has(key) || externalInputs.has(key),
        consumer + ': every input must have a producer, raw resource rule or explicit external-source contract: ' + input);
      for (const producer of recipeProducerMap.get(key) || []) {
        if (producer !== consumer) dependencyGraph[producer].add(consumer);
      }
    }
  }
  const visiting = new Set(), visited = new Set();
  const visit = (id, path = []) => {
    assert.ok(!visiting.has(id), 'downstream recipe graph must not contain bootstrap dependency loops: ' + [...path, id].join(' -> '));
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of dependencyGraph[id]) visit(next, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of Object.keys(dependencyGraph)) visit(id);
  assert.equal(catalog.factoryProfiles.ELECTRONICS_SEMICONDUCTOR_FAB.recipeIds.length, 2,
    'semiconductor factory profile must expose both wafer and chip production lines');
  for (const [input, contract] of Object.entries(catalog.externalInputSources || {})) {
    assert.equal(contract.requiresRecordedBatch, true, input + ': external source must require recorded stock');
    assert.equal(contract.autoGenerateStock, false, input + ': external source must not fabricate stock');
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
  context.Game.state.economy.BGD = {unemploymentCount:600000,laborForce:6000000,unemployment_rate:10,productionAssets:[]};
  const stock = context.Game.state.resource.BGD = {inventory:{},batches:[],inventoryLots:{},warehouse:{warehouseId:'WH-BGD-RAW',availableByResource:{},reservedByResource:{}}};
  for (const [resourceId, quantity] of Object.entries(profile.constructionMaterials)) {
    stock.inventory[resourceId] = Number(quantity) + 50;
    stock.warehouse.availableByResource[resourceId] = Number(quantity) + 50;
  }
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
  assert.equal(project.constructionMaterialsStatus, 'CONSUMED');
  assert.equal(project.materialsRequired.length, Object.keys(profile.constructionMaterials).length);
  assert.equal(project.materialAllocations.reduce((sum,row)=>sum+Number(row.quantity||0),0), Object.values(profile.constructionMaterials).reduce((sum,q)=>sum+Number(q),0));
  for (const [resourceId, quantity] of Object.entries(profile.constructionMaterials)) {
    assert.equal(stock.inventory[resourceId], 50, resourceId + ': construction inventory must be debited exactly once');
    assert.equal(stock.warehouse.availableByResource[resourceId], 50, resourceId + ': raw warehouse must be debited exactly once');
  }
  const duplicate = api.startFactoryProject({countryId:'BGD',factoryType:'STEEL_AND_ALLOY_WORKS',recipeId:'STEEL_PRIMARY_ROUTE_V1',resourceId:'iron_concentrate',factoryId:'FAC-STEEL-CONSTRUCT-TEST'});
  assert.equal(duplicate.idempotent, true);
  assert.equal(stock.inventory.construction_aggregate, 50, 'duplicate request must not debit construction inventory twice');
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
  assert.equal(commissioned.employment.jobsSupported,5000);
  assert.equal(commissioned.employment.jobsFilled,5000);
  assert.equal(context.Game.state.economy.BGD.unemploymentCount,595000);
  assert.equal(context.Game.state.economy.BGD.unemployment_rate,9.9167);
});

test('multi-input factory consumes every required input once and preserves mine-batch lineage', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset();
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const run = api.executeFactoryCycle({
    countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50
  });
  assert.equal(run.status, 'COMPLETED', JSON.stringify(run));
  assert.equal(run.recipeId, 'STEEL_PRIMARY_ROUTE_V1');
  assert.deepEqual(JSON.parse(JSON.stringify(run.inputQuantities)), {
    iron_concentrate: 30, coal_concentrate: 10, cement_feed: 5, copper_concentrate: 5
  });
  assert.equal(run.outputQuantities.STEEL, 36);
  assert.deepEqual(
    ['iron_concentrate', 'coal_concentrate', 'cement_feed', 'copper_concentrate'].map(id => asset.inputInventory[id]),
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
    assert.equal(outputBatch.unit, 'SIMULATION_RESOURCE_UNIT');
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
    inputInventory: { iron_concentrate: 60, coal_concentrate: 0, cement_feed: 10, copper_concentrate: 10 },
    inputBatchLots: [
      { batchId: 'INPUT-IRON', resourceId: 'iron_concentrate', quantity: 60, remainingQuantity: 60, sourceBatchIds: ['MINE-IRON-001'] },
      { batchId: 'INPUT-CEMENT-FEED', resourceId: 'cement_feed', quantity: 10, remainingQuantity: 10, sourceBatchIds: ['MINE-LIME-001'] },
      { batchId: 'INPUT-COPPER', resourceId: 'copper_concentrate', quantity: 10, remainingQuantity: 10, sourceBatchIds: ['MINE-COPPER-001'] }
    ]
  });
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
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
      { batchId: 'INPUT-CEMENT-FEED', resourceId: 'cement_feed', quantity: 10, remainingQuantity: 10, sourceBatchIds: ['MINE-LIME-001'] },
      { batchId: 'INPUT-COPPER', resourceId: 'copper_concentrate', quantity: 10, remainingQuantity: 10, sourceBatchIds: ['MINE-COPPER-001'] }
    ]
  });
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
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

test('untracked multi-input stock is rejected atomically even when legacy tracking is optional', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset({ inputBatchLots: [], requireTrackedInputs: false });
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const stockBefore = JSON.stringify(asset.inputInventory);
  const run = api.executeFactoryCycle({
    countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50
  });
  assert.equal(run.status, 'BLOCKED');
  assert.equal(run.reason, 'FACTORY_INPUT_BATCH_LEDGER_MISMATCH');
  assert.equal(JSON.stringify(asset.inputInventory), stockBefore);
  assert.deepEqual(asset.inputBatchLots, []);
  assert.equal((context.Game.state.resource.BGD.batches || []).length, 0);
});

test('invalid output recipe is rejected before any input batch is consumed', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset({ outputProfile: {} });
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const stockBefore = JSON.stringify(asset.inputInventory);
  const lotsBefore = JSON.stringify(asset.inputBatchLots);
  const run = api.executeFactoryCycle({
    countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50
  });
  assert.equal(run.status, 'BLOCKED');
  assert.match(run.reason, /OUTPUT/);
  assert.equal(JSON.stringify(asset.inputInventory), stockBefore);
  assert.equal(JSON.stringify(asset.inputBatchLots), lotsBefore);
  assert.equal((context.Game.state.resource.BGD.batches || []).length, 0);
});

test('processed mine-derived batches route to a downstream factory and reconcile a full multi-input cycle', () => {
  const { context, api } = makeRuntime();
  const assets = [makeSteelAsset({ inputInventory: {}, inputBatchLots: [] })];
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: assets };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const sources = [
    { batchId: 'OUTPUT-IRON', resourceId: 'IRON_CONCENTRATE', quantity: 60, sourceBatchIds: ['MINE-IRON-001'], sourceSiteIds: ['SITE-IRON'] },
    { batchId: 'OUTPUT-COAL', resourceId: 'COAL_CONCENTRATE', quantity: 20, sourceBatchIds: ['MINE-COAL-001'], sourceSiteIds: ['SITE-COAL'] },
    { batchId: 'OUTPUT-CEMENT-FEED', resourceId: 'CEMENT_FEED', quantity: 10, sourceBatchIds: ['MINE-LIME-001'], sourceSiteIds: ['SITE-LIME'] },
    { batchId: 'OUTPUT-COPPER', resourceId: 'COPPER_CONCENTRATE', quantity: 10, sourceBatchIds: ['MINE-COPPER-001'], sourceSiteIds: ['SITE-COPPER'] }
  ];
  const availableByResource = {}, inventory = {}, inventoryLots = {};
  for (const source of sources) {
    availableByResource[source.resourceId] = source.quantity;
    inventory[source.resourceId] = source.quantity;
    source.remainingQuantity = source.quantity;
    source.unit = 'TONNES';
    source.stage = 'FINISHED';
    source.countryId = 'BGD';
    source.sourceFactoryId = 'FAC-UPSTREAM-' + source.resourceId;
    source.warehouseId = 'WH-BGD-PROCESSED';
    source.locationNodeKey = 'WAREHOUSE:BGD:PROCESSED';
    source.createdTurn = 1;
    source.provenance = { authority: 'SIMULATED_UPSTREAM_PROCESSING', simulationOnly: true };
    inventoryLots[source.batchId] = { ...source, status: 'AVAILABLE', sourceBatchIds: [...source.sourceBatchIds] };
  }
  context.Game.state.resource.BGD = {
    inventory, batches: sources,
    inventoryLots,
    processedWarehouse: { warehouseId: 'WH-BGD-PROCESSED', countryId: 'BGD',
      availableByResource, reservedByResource: {}, storedBatchIds: sources.map(row => row.batchId), receipts: [] }
  };

  const scheduled = api.advanceShipments('BGD');
  assert.equal(scheduled.status, 'ADVANCED');
  const network = context.Game.state.resource.BGD.industrialNetwork;
  const shipments = network.shipments.filter(row => row.shipmentType === 'FACTORY_INPUT');
  assert.equal(shipments.length, 4, 'each required ingredient must receive an individual tracked shipment');
  const transportLedger = context.Game.state.resource.BGD.industrialNetwork.transportCapacityLedger.turns['1'];
  assert.equal(transportLedger.shipments.length, 4, 'downstream factory-input transfers must reserve shared transport capacity');
  assert.ok(transportLedger.usedByMode.truck > 0, 'downstream factory-input legs must debit truck capacity');
  assert.ok(shipments.every(row => row.status === 'IN_TRANSIT'));
  for (const shipment of shipments) {
    assert.equal(shipment.countryId, 'BGD');
    assert.equal(shipment.targetUnit, 'SIMULATION_RESOURCE_UNIT');
    assert.equal(shipment.unitBridge.simulationOnly, true);
    assert.equal(shipment.quantity, shipment.targetQuantity, 'the declared bridge preserves numeric quantity by explicit policy');
  }

  context.Game.state.simulation.turn += 1;
  const delivered = api.advanceShipments('BGD');
  assert.equal(delivered.delivered, 4, JSON.stringify(delivered));
  const factory = context.Game.state.economy.BGD.productionAssets[0];
  assert.deepEqual(
    ['iron_concentrate', 'coal_concentrate', 'cement_feed', 'copper_concentrate'].map(id => factory.inputInventory[id]),
    [60, 20, 10, 10],
    'delivered material is stored at the factory while its production cycle runs'
  );
  const cycle = network.factoryProductionCycles[factory.id];
  assert.ok(cycle, 'all recipe inputs must start one tracked multi-input cycle');
  assert.equal(cycle.status, 'IN_PROGRESS');
  assert.equal(cycle.finishDate, '2015-01-03');
  assert.equal((context.Game.state.resource.BGD.batches || []).some(row => row.resourceId === 'STEEL'), false,
    'finished goods must not exist before the cycle finish date');
  assert.ok(network.shipments.filter(row => row.shipmentType === 'FACTORY_INPUT')
    .every(row => row.status === 'DELIVERED' && ['AWAITING_INPUTS','IN_PROGRESS'].includes(row.processingStatus)));
  context.Game.state.simulation.turn = cycle.finishTurn;
  context.Game.state.simulation.date = cycle.finishDate;
  const finished = api.processPendingFactoryInputs('BGD');
  assert.equal(finished.completedCount, 1);
  assert.equal(finished.completed[0].status, 'COMPLETED');
  assert.ok(network.shipments.filter(row => row.shipmentType === 'FACTORY_INPUT')
    .every(row => row.status === 'DELIVERED' && row.processingStatus === 'PROCESSED'));
  const state = context.Game.state.resource.BGD;
  const steelOutput = state.batches.find(row => row.resourceId === 'STEEL' && row.stage === 'FINISHED');
  assert.ok(steelOutput, 'downstream cycle must create steel as a finished batch');
  assert.equal(steelOutput.quantity, 72);
  assert.equal(steelOutput.unit, 'SIMULATION_RESOURCE_UNIT');
  assert.ok(steelOutput.sourceBatchIds.includes('MINE-IRON-001'));
  assert.ok(steelOutput.sourceBatchIds.includes('MINE-COAL-001'));
  assert.ok(steelOutput.sourceSiteIds.includes('SITE-IRON'));
  assert.ok(steelOutput.sourceSiteIds.includes('SITE-COAL'));
  assert.equal(state.processedWarehouse.availableByResource.STEEL, 72);
  for (const source of sources.slice(0, 4)) {
    assert.equal(source.remainingQuantity, 0, source.batchId + ': delivered source batch must be debited once');
    assert.equal(state.inventoryLots[source.batchId].remainingQuantity, 0, source.batchId + ': inventory lot must reconcile');
  }
});

test('unrecognized physical units are blocked instead of being converted by an implicit fallback', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset({ inputInventory: {}, inputBatchLots: [] });
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  context.Game.state.resource.BGD = {
    inventory: { IRON_CONCENTRATE: 60 },
    batches: [{ batchId: 'OUTPUT-UNIT-TEST', resourceId: 'IRON_CONCENTRATE', quantity: 60, remainingQuantity: 60,
      unit: 'UNKNOWN_VOLUME_UNIT', stage: 'FINISHED', countryId: 'BGD' }],
    inventoryLots: { 'OUTPUT-UNIT-TEST': { batchId: 'OUTPUT-UNIT-TEST', resourceId: 'IRON_CONCENTRATE',
      quantity: 60, remainingQuantity: 60, unit: 'UNKNOWN_VOLUME_UNIT' } },
    processedWarehouse: { warehouseId: 'WH-BGD-PROCESSED', availableByResource: { IRON_CONCENTRATE: 60 },
      reservedByResource: {}, storedBatchIds: ['OUTPUT-UNIT-TEST'] }
  };
  const result = api.dispatchFactoryInputShipment({
    countryId: 'BGD', batchId: 'OUTPUT-UNIT-TEST', factoryId: asset.id, resourceId: 'iron_concentrate'
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'FACTORY_INPUT_UNIT_BRIDGE_NOT_DECLARED');
  assert.equal(context.Game.state.resource.BGD.processedWarehouse.availableByResource.IRON_CONCENTRATE, 60);
  assert.equal(context.Game.state.resource.BGD.processedWarehouse.reservedByResource.IRON_CONCENTRATE || 0, 0);
});

test('technology-locked or explicitly unavailable factories cannot consume inputs or accept shipments', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset({ status: 'TECHNOLOGY_LOCKED' });
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const stockBefore = JSON.stringify(asset.inputInventory);
  const result = api.executeFactoryCycle({
    countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'FACTORY_NOT_OPERATIONAL');
  assert.equal(JSON.stringify(asset.inputInventory), stockBefore);

  asset.status = 'OPERATIONAL';
  asset.requiredTechnologyIds = ['MISSING_TECH_GATE'];
  const noTech = api.executeFactoryCycle({
    countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50
  });
  assert.equal(noTech.status, 'BLOCKED');
  assert.equal(noTech.reason, 'FACTORY_TECHNOLOGY_REQUIREMENT_NOT_MET');
  assert.ok(noTech.missingTechnologyIds.includes('MISSING_TECH_GATE'));
  assert.equal(JSON.stringify(asset.inputInventory), stockBefore);
});


test('factory construction blocks atomically when any required material is short', () => {
  const {context,catalog,api}=makeRuntime();
  const profile=catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS;
  const stock=context.Game.state.resource.BGD={inventory:{},batches:[],inventoryLots:{},
    warehouse:{warehouseId:'WH-BGD-RAW',availableByResource:{},reservedByResource:{}}};
  const entries=Object.entries(profile.constructionMaterials);
  const missingId=entries[entries.length-1][0];
  for(const [resourceId,quantity] of entries){
    if(resourceId===missingId)continue;
    stock.inventory[resourceId]=Number(quantity)+20;
    stock.warehouse.availableByResource[resourceId]=Number(quantity)+20;
  }
  const beforeInventory=JSON.stringify(stock.inventory),beforeWarehouse=JSON.stringify(stock.warehouse.availableByResource);
  const result=api.startFactoryProject({countryId:'BGD',factoryType:'STEEL_AND_ALLOY_WORKS',recipeId:'STEEL_PRIMARY_ROUTE_V1'});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.reason,'INSUFFICIENT_FACTORY_CONSTRUCTION_MATERIALS');
  assert.ok(result.missingMaterials.some(row=>row.resourceId===missingId));
  assert.equal(JSON.stringify(stock.inventory),beforeInventory,'preflight must not debit inventory if one BOM row is missing');
  assert.equal(JSON.stringify(stock.warehouse.availableByResource),beforeWarehouse,'preflight must not debit warehouse if one BOM row is missing');
  assert.equal(context.Game.state.resource.BGD.industrialNetwork.projects.length,0,'failed construction must not create a project');
});

test('factory commissioning fills job slots from the unemployed pool exactly once', () => {
  const {context,api}=makeRuntime();
  const assets=Array.from({length:10},(_,i)=>({
    id:'FAC-SHIP-'+String(i+1).padStart(2,'0'),countryId:'BGD',factoryType:'SHIP_RAIL_EQUIPMENT_YARD',
    status:'OPERATIONAL',commissionedTurn:i+1,capacityPerDay:180
  }));
  context.Game.state.economy.BGD={
    unemploymentCount:600000,laborForce:6000000,unemployment_rate:10,productionAssets:assets
  };
  const first=api.reconcileFactoryEmployment('BGD');
  assert.equal(first.status,'ACTIVE');
  assert.equal(first.baselineUnemployedCount,600000);
  assert.equal(first.jobsSupported,100000);
  assert.equal(first.jobsFilled,100000);
  assert.equal(first.vacancies,0);
  assert.equal(first.unemployedCount,500000);
  assert.equal(first.unemploymentRatePct,8.3333);
  assert.equal(context.Game.state.economy.BGD.unemploymentCount,500000);
  assert.equal(context.Game.state.economy.BGD.unemployment_rate,8.3333);
  const second=api.reconcileFactoryEmployment('BGD');
  assert.equal(second.unemployedCount,500000,'repeated reconciliation must not subtract factory jobs twice');
  assert.equal(second.jobsFilled,100000);
  assert.equal(context.Game.state.economy.BGD.factoryEmployment.factories['FAC-SHIP-01'].jobsFilled,10000);
});

test('unknown generic production requires explicit opt-in and recorded construction materials', () => {
  const { context, catalog, api } = makeRuntime();
  const profile = catalog.factoryProfiles.GENERIC_RESOURCE_PROCESSING_PLANT;
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [] };
  const stock = context.Game.state.resource.BGD = {
    inventory: {}, batches: [], inventoryLots: {},
    warehouse: { warehouseId: 'WH-BGD-RAW', availableByResource: {}, reservedByResource: {} }
  };
  for (const [resourceId, quantity] of Object.entries(profile.constructionMaterials)) {
    stock.inventory[resourceId] = Number(quantity) + 10;
    stock.warehouse.availableByResource[resourceId] = Number(quantity) + 10;
  }
  const blocked = api.startFactoryProject({ countryId: 'BGD', resourceId: 'future_unknown_metal' });
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.reason, 'UNVERIFIED_GENERIC_RECIPE_REQUIRES_EXPLICIT_SIMULATION_OPT_IN');
  const allowed = api.startFactoryProject({
    countryId: 'BGD', resourceId: 'future_unknown_metal', allowSimulationFallback: true
  });
  assert.equal(allowed.status, 'UNDER_CONSTRUCTION');
  assert.equal(allowed.recipeAuthority, 'SIMULATED_GENERIC_FALLBACK');
  assert.equal(allowed.constructionMaterialsStatus, 'CONSUMED');
  for (const [resourceId, quantity] of Object.entries(profile.constructionMaterials)) {
    assert.equal(stock.inventory[resourceId], 10, resourceId + ': fallback construction must debit inventory');
    assert.equal(stock.warehouse.availableByResource[resourceId], 10, resourceId + ': fallback construction must debit warehouse stock');
  }
});


test('factory production blocks missing utility supply before consuming any input stock', () => {
  const { context, catalog, api } = makeRuntime();
  const asset = makeSteelAsset();
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: null, waterM3PerDay: 100000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const beforeStock = JSON.stringify(asset.inputInventory);
  const beforeLots = JSON.stringify(asset.inputBatchLots.map(x => x.remainingQuantity));
  const result = api.executeFactoryCycle({ countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50 });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'FACTORY_UTILITY_SUPPLY_NOT_RECORDED');
  assert.equal(JSON.stringify(asset.inputInventory), beforeStock);
  assert.equal(JSON.stringify(asset.inputBatchLots.map(x => x.remainingQuantity)), beforeLots);
  assert.equal(context.Game.state.resource.BGD?.industrialNetwork?.utilityLedger?.turns?.['1']?.transactions?.length || 0, 0);
});

test('factory production consumes proportional electricity and water only after every gate passes', () => {
  const { context, catalog, api } = makeRuntime();
  const asset = makeSteelAsset();
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  const profile = catalog.factoryProfiles[asset.factoryType];
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const result = api.executeFactoryCycle({ countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50 });
  assert.equal(result.status, 'COMPLETED', JSON.stringify(result));
  assert.equal(result.utilityConsumption.electricityMWh, Number((profile.utilities.electricityMWhPerDay * 0.5).toFixed(6)));
  assert.equal(result.utilityConsumption.waterM3, Number((profile.utilities.waterM3PerDay * 0.5).toFixed(6)));
  const balance = api.factoryUtilityDiagnostics('BGD');
  assert.equal(balance.electricity.usedThisTurn, result.utilityConsumption.electricityMWh);
  assert.equal(balance.water.usedThisTurn, result.utilityConsumption.waterM3);
  assert.equal(balance.electricity.availableThisTurn, 1000000 - result.utilityConsumption.electricityMWh);
  assert.equal(balance.water.availableThisTurn, 1000000 - result.utilityConsumption.waterM3);
});

test('factory production refuses an unrecorded workforce pool', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset();
  context.Game.state.economy.BGD = { productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 100000, waterM3PerDay: 100000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const beforeStock = JSON.stringify(asset.inputInventory);
  const result = api.executeFactoryCycle({ countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50 });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'FACTORY_WORKFORCE_NOT_RECORDED');
  assert.equal(JSON.stringify(asset.inputInventory), beforeStock);
});

test('completed power and water projects add an auditable supply ledger for the selected country', () => {
  const { context, api } = makeRuntime();
  const power = api.startInfrastructureProject({ countryId: 'BGD', requestId: 'POWER-TEST', infrastructureType: 'power', capacityPerDay: 250, buildDays: 30 });
  const water = api.startInfrastructureProject({ countryId: 'BGD', requestId: 'WATER-TEST', infrastructureType: 'water', capacityPerDay: 800, buildDays: 30 });
  assert.equal(power.status, 'UNDER_CONSTRUCTION');
  assert.equal(water.status, 'UNDER_CONSTRUCTION');
  assert.equal(power.capacityUnit, 'MWh_PER_DAY');
  assert.equal(water.capacityUnit, 'M3_PER_DAY');
  assert.equal(api.startInfrastructureProject({ countryId: 'BGD', requestId: 'POWER-TEST', infrastructureType: 'power', capacityPerDay: 250, buildDays: 30 }).idempotent, true);
  for (let day = 2; day <= 31; day += 1) {
    context.Game.state.simulation.turn = day;
    api.advanceProjects('BGD');
  }
  const balance = api.factoryUtilityDiagnostics('BGD');
  assert.equal(balance.electricityMWhPerDay, 250);
  assert.equal(balance.waterM3PerDay, 800);
  assert.equal(balance.utilityAssets.length, 2);
});


test('production requirements expose per-unit inputs, outputs, rated daily flow, time, workforce and utility intensity', () => {
  const { catalog, api } = makeRuntime();
  const steel = api.factoryProductionRequirements('STEEL_AND_ALLOY_WORKS', 'STEEL_PRIMARY_ROUTE_V1');
  assert.equal(steel.status, 'READY');
  assert.equal(steel.contract, 'OMEGA_FACTORY_PRODUCTION_REQUIREMENTS_V1');
  assert.equal(steel.recipeId, 'STEEL_PRIMARY_ROUTE_V1');
  assert.equal(steel.quantityBasis, 'PER_SIMULATION_PRODUCTION_UNIT');
  assert.equal(steel.processing.cycleDays, catalog.downstreamFactoryRecipes.STEEL_PRIMARY_ROUTE_V1.cycleDays);
  assert.equal(steel.processing.cycleTimeUnit, 'IN_GAME_DAYS');
  assert.equal(steel.processing.durationEnforced, true);
  assert.equal(steel.inputsPerProductionUnit.iron_concentrate, 0.6);
  assert.equal(steel.ratedDailyInputs.iron_concentrate, Number((catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS.defaultCapacityPerDay * 0.6).toFixed(6)));
  assert.equal(steel.outputsPerProductionUnit.STEEL, 0.72);
  assert.equal(steel.ratedDailyOutputs.STEEL, Number((catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS.defaultCapacityPerDay * 0.72).toFixed(6)));
  assert.equal(steel.workforce.operators, catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS.workforce.operators);
  assert.equal(steel.workforce.engineers, catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS.workforce.engineers);
  assert.equal(steel.workforce.coreOperatingCrew, catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS.employment.coreOperatingCrew);
  assert.equal(steel.utilities.electricityMWhPerDay, catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS.utilities.electricityMWhPerDay);
  assert.equal(steel.utilities.waterM3PerDay, catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS.utilities.waterM3PerDay);
  assert.equal(steel.construction.timeDays, catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS.constructionDays);
  assert.equal(JSON.stringify(steel.construction.materials), JSON.stringify(catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS.constructionMaterials));

  let checked = 0;
  for (const [resourceId, rule] of Object.entries(catalog.processingRules)) {
    const row = api.factoryProductionRequirements(rule.factoryType, 'PROCESSING:' + resourceId);
    assert.equal(row.status, 'READY', resourceId + ': ' + JSON.stringify(row));
    assert.equal(row.recipeKind, 'PROCESSING');
    assert.equal(row.processing.cycleDays, rule.cycleDays);
    assert.equal(row.processing.cycleTimeUnit, 'IN_GAME_DAYS');
    assert.equal(row.inputsPerProductionUnit[Object.keys(rule.inputs)[0]], Object.values(rule.inputs)[0]);
    checked += 1;
  }
  for (const [recipeId, recipe] of Object.entries(catalog.downstreamFactoryRecipes)) {
    const row = api.factoryProductionRequirements(recipe.factoryType, recipeId);
    assert.equal(row.status, 'READY', recipeId + ': ' + JSON.stringify(row));
    assert.equal(row.recipeId, recipeId);
    assert.equal(row.processing.cycleDays, recipe.cycleDays);
    assert.equal(row.processing.cycleTimeUnit, 'IN_GAME_DAYS');
    assert.equal(row.ratedCapacityPerDay, catalog.factoryProfiles[recipe.factoryType].defaultCapacityPerDay);
    checked += 1;
  }
  assert.equal(checked, 63);
});

test('all recipe rows declare a common simulation quantity basis and in-game cycle-time unit', () => {
  const { catalog } = makeRuntime();
  assert.equal(catalog.factoryCatalogPolicy.productionRequirementContract, 'OMEGA_FACTORY_PRODUCTION_REQUIREMENTS_V1');
  assert.equal(catalog.factoryCatalogPolicy.quantityBasis, 'PER_SIMULATION_PRODUCTION_UNIT');
  assert.equal(catalog.factoryCatalogPolicy.recipeTimeUnit, 'IN_GAME_DAYS');
  for (const [resourceId, rule] of Object.entries(catalog.processingRules)) {
    assert.equal(rule.quantityBasis, 'PER_SIMULATION_PRODUCTION_UNIT', resourceId);
    assert.equal(rule.cycleTimeUnit, 'IN_GAME_DAYS', resourceId);
    assert.equal(rule.requiresAllInputs, true, resourceId);
    assert.equal(rule.missingInputPolicy, 'BLOCK_CYCLE', resourceId);
    assert.equal(rule.simulationOnly, true, resourceId);
  }
  for (const [recipeId, recipe] of Object.entries(catalog.downstreamFactoryRecipes)) {
    assert.equal(recipe.quantityBasis, 'PER_SIMULATION_PRODUCTION_UNIT', recipeId);
    assert.equal(recipe.cycleTimeUnit, 'IN_GAME_DAYS', recipeId);
  }
  const ui = readText('omega_resource_command_center_ui_v1.js');
  assert.match(ui, /Inputs per production unit/);
  assert.match(ui, /Outputs and by-products per production unit/);
  assert.match(ui, /Rated daily input at capacity/);
  assert.match(ui, /Rated daily output at capacity/);
  assert.match(ui, /Declared recipe cycle time/);
  assert.match(ui, /Production output is committed only when the in-game cycle finish date is reached/);
});


test('factory construction calendar honours exact game-calendar month dates', () => {
  const { context, catalog, api } = makeRuntime();
  const profile = catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS;
  context.Game.state.simulation.date = '2026-06-13';
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [] };
  const resource = context.Game.state.resource.BGD = { inventory: {}, batches: [], inventoryLots: {},
    warehouse: { warehouseId: 'WH-BGD-RAW', availableByResource: {}, reservedByResource: {} } };
  for (const [id, quantity] of Object.entries(profile.constructionMaterials)) {
    resource.inventory[id] = Number(quantity) + 10;
    resource.warehouse.availableByResource[id] = Number(quantity) + 10;
  }
  const project = api.startFactoryProject({ countryId: 'BGD', factoryType: 'STEEL_AND_ALLOY_WORKS',
    recipeId: 'STEEL_PRIMARY_ROUTE_V1', requestId: 'CALENDAR-6-MONTHS', buildMonths: 6 });
  assert.equal(project.status, 'UNDER_CONSTRUCTION');
  assert.equal(project.startDate, '2026-06-13');
  assert.equal(project.durationMonthsRequested, 6);
  assert.equal(project.estimatedCompletionDate, '2026-12-13');
  assert.equal(project.durationDays, 183);
  assert.equal(api.startFactoryProject({ countryId: 'BGD', factoryType: 'STEEL_AND_ALLOY_WORKS',
    recipeId: 'STEEL_PRIMARY_ROUTE_V1', requestId: 'CALENDAR-6-MONTHS', buildMonths: 6 }).idempotent, true);
});

test('factory production scheduler waits for cycle time and posts output only on the game-calendar finish date', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset();
  context.Game.state.simulation.date = '2015-01-01';
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000, authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const inputInventoryBeforeCycle = JSON.stringify(asset.inputInventory);
  const inputLotBalancesBeforeCycle = Object.fromEntries(asset.inputBatchLots.map(lot => [lot.batchId, Number(lot.remainingQuantity)]));
  const start = api.startFactoryProductionCycle({ countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50 });
  assert.equal(start.status, 'IN_PROGRESS');
  assert.equal(start.startDate, '2015-01-01');
  assert.equal(start.finishDate, '2015-01-03');
  assert.equal(start.productivityPct, 50);
  assert.equal(start.inputBatchReservations.length, Object.keys(start.inputQuantities).length,
    'the scheduled cycle must reserve its exact tracked input lots');
  assert.deepEqual([...new Set(start.inputBatchReservations.map(row => row.batchId))].sort(), [...start.sourceBatchIds].sort(),
    'cycle source batch identities must be exactly its reserved factory-input lots');
  for (const reservation of start.inputBatchReservations) {
    const lot = asset.inputBatchLots.find(row => row.batchId === reservation.batchId);
    assert.ok(lot, 'each cycle reservation must point to an existing input lot');
    assert.equal(lot.cycleReservationId, start.cycleId, 'reserved input lots must be locked to this cycle');
    assert.equal(Number(lot.cycleReservedQuantity), Number(reservation.quantity));
  }
  const competingCycle = api.executeFactoryCycle({ countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50 });
  assert.equal(competingCycle.status, 'BLOCKED');
  assert.equal(competingCycle.reason, 'FACTORY_CYCLE_ALREADY_RUNNING');
  assert.equal(JSON.stringify(asset.inputInventory), inputInventoryBeforeCycle,
    'starting a cycle and rejecting a competing immediate run must not debit input stock');
  assert.deepEqual(Object.fromEntries(asset.inputBatchLots.map(lot => [lot.batchId, Number(lot.remainingQuantity)])), inputLotBalancesBeforeCycle);
  assert.equal((context.Game.state.resource.BGD.batches || []).length, 0, 'no output should exist when the cycle only starts');
  const sameDay = api.processPendingFactoryInputs('BGD');
  assert.equal(sameDay.completedCount, 0);
  assert.equal((context.Game.state.resource.BGD.batches || []).length, 0);
  context.Game.state.simulation.turn = 2;
  context.Game.state.simulation.date = '2015-01-02';
  api.processPendingFactoryInputs('BGD');
  assert.equal((context.Game.state.resource.BGD.batches || []).length, 0);
  context.Game.state.simulation.turn = 3;
  context.Game.state.simulation.date = '2015-01-03';
  const done = api.processPendingFactoryInputs('BGD');
  assert.equal(done.completedCount, 1);
  assert.equal(done.completed[0].status, 'COMPLETED');
  assert.equal(context.Game.state.resource.BGD.processedWarehouse.availableByResource.STEEL, 36);
  assert.equal(asset.inputBatchLots.some(lot => lot.cycleReservationId === start.cycleId), false,
    'successful completion must release any unconsumed portion of reserved input lots');
  assert.equal(asset.productionHealth.status, 'REDUCED');
  assert.equal(asset.productionHealth.productivityPct, 50);
});

test('warehouse feeder transfers real tracked stock and schedules proportional partial factory production', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset({ inputInventory: {}, inputBatchLots: [] });
  context.Game.state.simulation.date = '2015-01-01';
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000, authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const r = context.Game.state.resource.BGD = { inventory: {}, batches: [], inventoryLots: {},
    warehouse: { warehouseId: 'WH-BGD-RAW', availableByResource: {}, reservedByResource: {}, storedBatchIds: [] } };
  const quantities = { iron_concentrate: 24, coal_concentrate: 8, cement_feed: 4, copper_concentrate: 4 };
  let ix = 0;
  for (const [resourceId, quantity] of Object.entries(quantities)) {
    const batchId = 'WH-BATCH-' + (++ix);
    r.inventory[resourceId] = quantity;
    r.warehouse.availableByResource[resourceId] = quantity;
    r.warehouse.storedBatchIds.push(batchId);
    r.batches.push({ batchId, resourceId, quantity, remainingQuantity: quantity, unit: 'SIMULATION_RESOURCE_UNIT',
      stage: 'RAW', status: 'AVAILABLE', countryId: 'BGD', warehouseId: 'WH-BGD-RAW', createdTurn: 1 });
    r.inventoryLots[batchId] = { batchId, resourceId, quantity, remainingQuantity: quantity, unit: 'SIMULATION_RESOURCE_UNIT', status: 'AVAILABLE' };
  }
  const result = api.processPendingFactoryInputs('BGD');
  assert.equal(result.startedCount, 1);
  assert.equal(result.warehouseTransferCount, 4);
  assert.equal(result.started[0].productivityPct, 40);
  assert.deepEqual(JSON.parse(JSON.stringify(result.transfers.map(x => x.resourceId).sort())),
    ['cement_feed','coal_concentrate','copper_concentrate','iron_concentrate']);
  assert.equal(r.warehouse.availableByResource.iron_concentrate, 0);
  assert.equal(asset.inputInventory.iron_concentrate, 24);
  assert.equal(r.batches.find(x => x.batchId === 'WH-BATCH-1').remainingQuantity, 0);
  assert.equal(r.processedWarehouse, undefined);
  assert.equal(asset.inputBatchLots.filter(x => x.stage === 'FACTORY_INPUT').length, 4);
  assert.equal(asset.productionHealth.status, 'REDUCED');
  assert.equal(asset.productionHealth.productivityPct, 40);
  assert.equal(r.batches.some(x => Object.keys(x).includes('STEEL')), false);
  context.Game.state.simulation.turn = 3;
  context.Game.state.simulation.date = '2015-01-03';
  const completed = api.processPendingFactoryInputs('BGD');
  assert.equal(completed.completedCount, 1);
  assert.equal(r.processedWarehouse.availableByResource.STEEL, 28.8);
  assert.equal(r.inventory.STEEL, 28.8);
});

test('factory production health stops at zero required input and retains unconverted factory stock', () => {
  const { context, api } = makeRuntime();
  const asset = makeSteelAsset({ inputInventory: { iron_concentrate: 60, coal_concentrate: 0, cement_feed: 10, copper_concentrate: 10 } });
  asset.inputBatchLots = asset.inputBatchLots.filter(row => row.resourceId !== 'coal_concentrate');
  context.Game.state.economy.BGD = { unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset] };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000, authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const before = JSON.stringify(asset.inputInventory);
  const result = api.processPendingFactoryInputs('BGD');
  assert.equal(result.startedCount, 0);
  assert.equal(result.blocked.length, 1);
  assert.equal(asset.productionHealth.status, 'STOPPED');
  assert.equal(asset.productionHealth.productivityPct, 0);
  assert.equal(JSON.stringify(asset.inputInventory), before);
  assert.equal((context.Game.state.resource.BGD?.batches || []).length, 0);
});

test('factory UI keeps warning lamps compact and exposes month/date and productivity metrics', () => {
  const ui = readText('omega_resource_command_center_ui_v1.js');
  assert.match(ui, /Construction duration in months/);
  assert.match(ui, /Estimated commissioning/);
  assert.match(ui, /Productivity/);
  assert.match(ui, /omega-rescc-factory-icon-wrap--partial/);
  assert.match(ui, /omega-rescc-factory-icon-wrap--stopped/);
  assert.match(ui, /omegaFactoryWarningSweep/);
});


test('paused factory cycle resumes from new warehouse batches at the reduced attainable productivity', () => {
  const { context, catalog, api } = makeRuntime();
  const asset = makeSteelAsset();
  context.Game.state.simulation.date = '2015-01-01';
  const resource = context.Game.state.resource.BGD = {
    inventory: {}, batches: [], inventoryLots: {},
    warehouse: { warehouseId: 'WH-BGD-RAW', countryId: 'BGD', availableByResource: {}, reservedByResource: {}, storedBatchIds: [] }
  };
  context.Game.state.economy.BGD = {
    unemploymentCount: 600000, laborForce: 6000000, unemployment_rate: 10, productionAssets: [asset]
  };
  context.Game.state.transport.BGD = { infrastructure: { utilitySupply: {
    electricityMWhPerDay: 1000000, waterM3PerDay: 1000000,
    authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
  } } };
  const first = api.startFactoryProductionCycle({
    countryId: 'BGD', factoryId: asset.id, resourceId: 'iron_concentrate', quantity: 50
  });
  assert.equal(first.status, 'IN_PROGRESS');
  const firstCycle = first;
  const missingCoal = asset.inputBatchLots.find(row => row.resourceId === 'coal_concentrate');
  assert.ok(missingCoal);
  asset.inputInventory.coal_concentrate = 0;
  missingCoal.remainingQuantity = 0;
  missingCoal.status = 'CONSUMED';

  context.Game.state.simulation.turn = firstCycle.finishTurn;
  context.Game.state.simulation.date = firstCycle.finishDate;
  const paused = api.processPendingFactoryInputs('BGD');
  assert.equal(paused.completedCount, 0);
  assert.equal(paused.startedCount, 0);
  assert.equal(asset.productionHealth.status, 'STOPPED');
  assert.equal(asset.productionHealth.productivityPct, 0);
  assert.equal(context.Game.state.resource.BGD.industrialNetwork.factoryProductionCycles[asset.id].status, 'PAUSED');

  resource.inventory.coal_concentrate = 4;
  resource.processedWarehouse = {
    warehouseId: 'WH-BGD-PROCESSED', countryId: 'BGD', status: 'OPERATIONAL',
    availableByResource: { coal_concentrate: 4 }, reservedByResource: {}, storedBatchIds: ['BATCH-COAL-REFEED']
  };
  const batch = {
    batchId: 'BATCH-COAL-REFEED', resourceId: 'coal_concentrate', materialIdentity: 'coal_concentrate',
    quantity: 4, remainingQuantity: 4, unit: 'SIMULATION_RESOURCE_UNIT', stage: 'PROCESSED',
    status: 'AVAILABLE', countryId: 'BGD', warehouseId: 'WH-BGD-PROCESSED', createdTurn: context.Game.state.simulation.turn,
    sourceBatchIds: ['BATCH-COAL-ORIGINAL']
  };
  resource.batches.push(batch);
  resource.inventoryLots[batch.batchId] = { ...batch, status: 'AVAILABLE' };

  const resumed = api.processPendingFactoryInputs('BGD');
  assert.equal(resumed.startedCount, 1, JSON.stringify(resumed));
  assert.equal(resumed.blocked.length, 0, JSON.stringify(resumed.blocked));
  const nextCycle = context.Game.state.resource.BGD.industrialNetwork.factoryProductionCycles[asset.id];
  assert.ok(nextCycle);
  assert.notEqual(nextCycle.cycleId, firstCycle.cycleId);
  assert.equal(nextCycle.status, 'IN_PROGRESS');
  assert.equal(nextCycle.productionQuantity, 20);
  assert.equal(nextCycle.productivityPct, 20);
  assert.equal(asset.productionHealth.status, 'REDUCED');
  assert.equal(asset.productionHealth.productivityPct, 20);
  assert.equal(asset.inputInventory.coal_concentrate, 4);
  assert.equal(resource.processedWarehouse.availableByResource.coal_concentrate, 0);
});
