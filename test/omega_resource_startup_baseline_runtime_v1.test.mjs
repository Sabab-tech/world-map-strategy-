import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const baseline = JSON.parse(read('resource_country_startup_baseline_v1.json'));
const catalog = JSON.parse(read('resource_industrial_catalog_v1.json'));
const resourceRules = JSON.parse(read('resource_economy_rules.json'));
const resourceIds = Object.keys(resourceRules.demand?.resourceProfiles || {});
const countryRows = Object.values(baseline.countries || {});
const plannedFactories = countryRows.flatMap(row => row.factoryAssets || []);
const plannedMines = countryRows.flatMap(row => row.startingMineAssets || []);
const plannedStocks = countryRows.flatMap(row => row.primaryResourceStocks || []);

test('startup baseline covers every country using only the canonical catalog identities', () => {
  assert.equal(baseline.coverage.countryCount, 249);
  assert.equal(baseline.countryOrder.length, 249);
  assert.equal(countryRows.length, 249);
  assert.equal(Object.keys(catalog.factoryProfiles || {}).length, 21);
  assert.equal(Object.keys(catalog.downstreamFactoryRecipes || {}).length, 22);
  assert.equal(resourceIds.length, 41);
  assert.equal(baseline.coverage.factoryProfileCount, 21);
  assert.equal(baseline.coverage.downstreamRecipeCount, 22);
  assert.equal(baseline.coverage.resourceIdentityCount, 41);
  assert.equal(baseline.coverage.totalStartingFactoryAssets, plannedFactories.length);
  assert.equal(baseline.coverage.totalStartingBuiltMineAssets, plannedMines.length);
  assert.equal(baseline.coverage.startingPrimaryStockTypeCount, plannedStocks.length);
  assert.ok(plannedFactories.length >= 249, 'each country receives at least one permanent scenario factory');
  assert.ok(plannedMines.length > 500, 'eligible canonical starting mine assets are explicitly represented');
  assert.ok(plannedStocks.length > 0, 'opening raw-stock quantities are explicit data, not inferred UI counts');

  const factoryIds = plannedFactories.map(asset => asset.assetId);
  assert.equal(new Set(factoryIds).size, factoryIds.length, 'factory asset IDs are globally unique');
  const mineIds = plannedMines.map(asset => asset.siteId);
  assert.equal(new Set(mineIds).size, mineIds.length, 'starting mine site IDs are unique');

  for (const country of countryRows) {
    assert.match(country.countryId, /^[A-Z]{3}$/);
    assert.equal(country.startingFactoryCount, country.factoryAssets.length, country.countryId + ' factory count must match its assets');
    assert.equal(country.startingMineCount, country.startingMineAssets.length, country.countryId + ' mine count must match its assets');
    assert.ok(country.factoryAssets.every(asset => asset.permanentAsset === true && asset.simulationOnly === true),
      country.countryId + ' factory assets must be permanent and explicitly simulated');
    for (const asset of country.factoryAssets) {
      assert.ok(catalog.factoryProfiles[asset.factoryType], country.countryId + ' uses only one of the canonical 21 factory profiles');
      assert.ok(asset.assetId && Number(asset.capacityPerDay) > 0, country.countryId + ' factory must have an ID and positive capacity');
    }
    for (const mine of country.startingMineAssets) {
      assert.ok(resourceIds.includes(mine.resourceId), mine.siteId + ' must use a canonical resource ID');
      assert.equal(mine.countryId, undefined, 'country membership is represented by the containing country, not a conflicting ID');
      assert.equal(mine.permanentAsset, true);
      assert.equal(mine.simulationOnly, true);
      assert.ok(Number(mine.dailyCapacity) > 0 && Number(mine.reserveQuantity) > 0);
    }
    for (const stock of country.primaryResourceStocks) {
      assert.ok(resourceIds.includes(stock.resourceId), country.countryId + ' stock must use a canonical resource ID');
      assert.ok(Number.isFinite(stock.quantity) && stock.quantity > 0);
      assert.ok(stock.unit && stock.siteIds.length > 0);
      assert.equal(stock.quantityIsNotReserve, true);
      assert.equal(stock.finiteAndConsumable, true);
    }
  }
});

function makeContext(gameState, testBaseline) {
  const handlers = new Map();
  const sites = (testBaseline.countries.BGD.startingMineAssets || []).map(mine => ({
    siteId: mine.siteId, countryId: 'BGD', siteName: mine.siteName,
    real: { resourceId: mine.resourceId },
    identity: { countryIso3: 'BGD', resourceTypeId: mine.resourceId },
    map: { markerEligible: true },
    operation: { commercialExtraction: true, status: 'ACTIVE', gameplayConstructionAllowed: true },
    sourceSiteRecord: { siteId: mine.siteId, resourceId: mine.resourceId, countryCode: 'BGD',
      commercialExtraction: true, status: 'ACTIVE', gameplayConstructionAllowed: true },
    simulation: { reserve: { quantity: mine.reserveQuantity, unit: mine.reserveUnit, authority: mine.sourceAuthority },
      nominalDailyCapacity: mine.dailyCapacity, productionRateUnit: mine.rateUnit, reserveAuthority: mine.sourceAuthority }
  }));
  const context = {
    console: { log() {}, warn() {}, error() {} },
    Game: { state: gameState, playerCountry: 'BGD', currentActiveCountry: 'BGD' },
    gameState,
    OmegaResourceStartupBaselineData: testBaseline,
    OmegaResourceIndustrialCatalogData: catalog,
    OmegaResourceScenarioEngineeringData: { records: sites.map(site => {
      const mine = testBaseline.countries.BGD.startingMineAssets.find(row => row.siteId === site.siteId);
      return { siteId: mine.siteId, countryId: 'BGD', resourceId: mine.resourceId, unit: mine.unit,
        reserveQuantity: mine.reserveQuantity, reserveUnit: mine.reserveUnit, nominalCapacity: mine.dailyCapacity };
    }) },
    OmegaIndividualResourceSiteBinding: { sites },
    Omega: { IndividualResourceSiteBinding: { sites } },
    addEventListener(name, fn) {
      const rows = handlers.get(name) || [];
      rows.push(fn);
      handlers.set(name, rows);
    },
    dispatchEvent(event) {
      for (const fn of handlers.get(event && event.type) || []) fn(event);
      return true;
    },
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    setTimeout, clearTimeout, Intl, Math, Number, String, Object, Array, Map, Set, WeakMap, JSON, Date, Promise
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('omega_resource_quantity_normalization_v1.js'), context,
    { filename: 'omega_resource_quantity_normalization_v1.js', timeout: 3000 });
  vm.runInContext(read('omega_resource_industrial_network_v1.js'), context,
    { filename: 'omega_resource_industrial_network_v1.js', timeout: 5000 });
  vm.runInContext(read('omega_resource_startup_baseline_runtime_v1.js'), context,
    { filename: 'omega_resource_startup_baseline_runtime_v1.js', timeout: 5000 });
  return context;
}

test('startup runtime seeds real country state, finite inventory and working factory cycles idempotently', async () => {
  const testBaseline = JSON.parse(JSON.stringify(baseline));
  const b = testBaseline.countries.BGD;
  const steelProfile = catalog.factoryProfiles.STEEL_AND_ALLOY_WORKS;
  const steelRecipe = catalog.downstreamFactoryRecipes.STEEL_PRIMARY_ROUTE_V1;
  b.factoryAssets = [{
    assetId: 'FAC-START:BGD:SMOKE', factoryType: 'STEEL_AND_ALLOY_WORKS', recipeId: 'STEEL_PRIMARY_ROUTE_V1',
    resourceId: 'iron_concentrate', capacityPerDay: steelProfile.defaultCapacityPerDay,
    inputCoefficients: steelRecipe.inputs, outputProfile: steelRecipe.outputs, cycleDays: steelRecipe.cycleDays,
    initialInputStock: { iron_concentrate: 540, coal_concentrate: 180, cement_feed: 90, copper_concentrate: 90 },
    locationNodeKey: 'INDUSTRIAL_ZONE:BGD', status: 'OPERATIONAL', permanentAsset: true, simulationOnly: true
  }];
  b.startingFactoryCount = 1;
  const state = { simulation: { turn: 1, startYear: 2015, date: '2015-01-01', daysPerTurn: 1 },
    resource: {}, economy: {}, transport: {}, countryNames: { BGD: 'Bangladesh' }, playerCountryId: 'BGD' };
  const context = makeContext(state, testBaseline);
  await new Promise(resolve => setTimeout(resolve, 0));
  const api = context.Omega.ResourceStartupBaseline;
  const startup = await api.initialize('TEST_NEW_GAME');
  assert.equal(startup.status, 'READY');
  const summary = api.getCountrySummary('BGD');
  assert.equal(summary.factoryCount, 1);
  assert.equal(summary.starterFactoryCount, 1);
  assert.equal(summary.builtMineCount, b.startingMineAssets.length);
  assert.equal(summary.operationalMineCount, b.startingMineAssets.length);
  assert.equal(summary.primaryResourceTypeCount, b.primaryResourceStocks.length);

  const rs = state.resource.BGD;
  for (const stock of b.primaryResourceStocks) {
    assert.equal(rs.warehouse.availableByResource[stock.resourceId], stock.quantity,
      'runtime must seed the numeric baseline quantity for ' + stock.resourceId);
    assert.equal(rs.inventory[stock.resourceId], stock.quantity);
    assert.equal(rs.inventoryUnits[stock.resourceId], stock.unit);
    const batch = rs.batches.find(row => row.batchId === 'STARTUP-STOCK:BGD:' + stock.resourceId + ':V1');
    assert.ok(batch);
    assert.equal(batch.quantity, stock.quantity);
    assert.equal(batch.provenance.staticBaselineMatched, true);
  }

  const factory = state.economy.BGD.productionAssets.find(asset => asset.id === 'FAC-START:BGD:SMOKE');
  const before = { ...factory.inputInventory };
  const inputResource = Object.keys(steelRecipe.inputs)[0];
  const processed = context.Omega.ResourceIndustrialNetwork.executeFactoryCycle({
    countryId: 'BGD', factoryId: factory.id, resourceId: inputResource
  });
  assert.ok(processed && ['COMPLETED', 'IN_PROGRESS'].includes(processed.status),
    'factory production cycle must consume actual input inventory: ' + JSON.stringify(processed));
  assert.ok(Object.keys(factory.inputInventory).some(key => Number(factory.inputInventory[key]) < Number(before[key])),
    'factory input inventory must be finite and consumed by an actual cycle');

  const snapshot = JSON.stringify({ factories: state.economy.BGD.productionAssets.map(x => x.id),
    mines: rs.mineAssets.map(x => x.assetId), warehouse: rs.warehouse.availableByResource });
  api.refreshCountry('BGD');
  assert.equal(JSON.stringify({ factories: state.economy.BGD.productionAssets.map(x => x.id),
    mines: rs.mineAssets.map(x => x.assetId), warehouse: rs.warehouse.availableByResource }), snapshot,
  'retrying initialization must not duplicate assets or refill stock');
});

test('runtime does not overwrite a legacy save with a startup baseline', async () => {
  const testBaseline = JSON.parse(JSON.stringify(baseline));
  const state = { simulation: { turn: 50, startYear: 2015, date: '2015-02-19', daysPerTurn: 1 },
    resource: { BGD: { inventory: { coal: 123 }, inventoryUnits: { coal: 'TONNES' },
      batches: [{ batchId: 'OLD-BATCH', resourceId: 'coal', quantity: 123, remainingQuantity: 123, unit: 'TONNES' }],
      warehouse: { availableByResource: { coal: 123 }, reservedByResource: {} } } },
    economy: { BGD: { productionAssets: [{ id: 'OLD-FACTORY', factoryType: 'STEEL_AND_ALLOY_WORKS',
      status: 'OPERATIONAL', inputInventory: { iron_concentrate: 25 },
      inputCoefficients: { iron_concentrate: 1 }, outputProfile: { STEEL: 0.7 } }] } },
    transport: {}, countryNames: { BGD: 'Bangladesh' }, playerCountryId: 'BGD' };
  const context = makeContext(state, testBaseline);
  await new Promise(resolve => setTimeout(resolve, 0));
  const api = context.Omega.ResourceStartupBaseline;
  await api.initialize('TEST_LEGACY_SAVE');
  const rs = state.resource.BGD;
  assert.deepEqual(state.economy.BGD.productionAssets.map(asset => asset.id), ['OLD-FACTORY']);
  assert.equal(rs.inventory.coal, 123);
  assert.equal(rs.warehouse.availableByResource.coal, 123);
  assert.deepEqual(rs.batches.map(batch => batch.batchId), ['OLD-BATCH']);
  assert.equal(rs.startupBaseline.skippedLegacyFactorySeed, true);
});
