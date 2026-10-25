import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const runtimeSource = fs.readFileSync(new URL('../omega_country_inventory_runtime_v1.js', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const roster = [
  { code: 'BD', iso2: 'BD', iso3: 'BGD', name: 'Bangladesh' },
  { code: 'US', iso2: 'US', iso3: 'USA', name: 'United States' },
  { code: 'DE', iso2: 'DE', iso3: 'DEU', name: 'Germany' }
];

const catalog = {
  schemaVersion: '1.0.0',
  resourceRules: { iron_concentrate: {}, copper: {} },
  processingRules: {
    iron_concentrate: {
      factoryType: 'STEEL_WORKS',
      inputs: { iron_concentrate: 1 },
      outputs: { STEEL: 0.7, SLAG: 0.3 },
      inputUnit: 'SIMULATION_RESOURCE_UNIT',
      outputUnit: 'SIMULATION_RESOURCE_UNIT'
    }
  },
  downstreamFactoryRecipes: [],
  factoryProfiles: {}
};

function makeRuntime() {
  const listeners = new Map();
  const state = {
    simulation: {
      turn: 1,
      date: '2015-01-01',
      startYear: 2015,
      session: { playerCountryId: 'BGD' }
    },
    resource: {
      BGD: {
        inventory: { iron_concentrate: 10, STEEL: 3 },
        inventoryUnits: { iron_concentrate: 'SIMULATION_RESOURCE_UNIT', STEEL: 'SIMULATION_RESOURCE_UNIT' },
        inventoryLedger: [],
        batches: [],
        inventoryLots: {},
        warehouse: { warehouseId: 'WH-BGD-RAW', availableByResource: {}, reservedByResource: {}, storedBatchIds: [] },
        processedWarehouse: { warehouseId: 'WH-BGD-PROCESSED', availableByResource: {}, reservedByResource: {}, storedBatchIds: [] }
      },
      USA: {
        inventory: { STEEL: 77 },
        inventoryUnits: { STEEL: 'SIMULATION_RESOURCE_UNIT' },
        inventoryLedger: [],
        batches: [],
        inventoryLots: {}
      },
      DEU: { inventory: {}, inventoryLedger: [], batches: [], inventoryLots: {} }
    }
  };

  const registry = {
    async init() { return true; },
    getDataset(path) {
      if (path === 'countries.json') return roster;
      if (path === 'resources.json') return [
        { id: 'iron_concentrate', name: 'Iron Concentrate', unit: 'SIMULATION_RESOURCE_UNIT' },
        { id: 'copper', name: 'Copper', unit: 'SIMULATION_RESOURCE_UNIT' }
      ];
      return null;
    },
    exportData() { return { countries: roster.map(row => ({ ...row, id: row.iso2, raw: row })) }; },
    resolveCountry(value) {
      const q = String(value ?? '').trim().toUpperCase();
      const row = roster.find(x => [x.iso2, x.iso3, x.code, x.name.toUpperCase()].includes(q));
      return row ? { id: row.iso2, raw: row } : null;
    }
  };

  function CustomEvent(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }

  const context = {
    console,
    Game: { state },
    gameState: state,
    Omega: {
      Simulation: {
        getPlayerCountryId() { return state.simulation.session.playerCountryId; }
      }
    },
    OmegaCanonicalIdentityRegistry: registry,
    OmegaCountrySemanticBridge: registry,
    OmegaResourceIndustrialCatalogData: catalog,
    CustomEvent,
    addEventListener(type, callback) {
      const rows = listeners.get(type) || [];
      rows.push(callback);
      listeners.set(type, rows);
    },
    dispatchEvent(event) {
      for (const callback of listeners.get(event.type) || []) callback(event);
      return true;
    }
  };
  context.globalThis = context;
  vm.runInNewContext(runtimeSource, context, { filename: 'omega_country_inventory_runtime_v1.js' });
  return { context, state, api: context.OmegaCountryInventoryRuntime };
}

function item(view, productId) {
  return view.items.find(row => row.productId === productId.toLowerCase());
}

test('inventory runtime loads after the factory runtime and before resource adapters', () => {
  const factory = indexHtml.indexOf('<script src="omega_resource_industrial_network_v1.js" defer></script>');
  const inventory = indexHtml.indexOf('<script src="omega_country_inventory_runtime_v1.js" defer></script>');
  const adapter = indexHtml.indexOf('<script src="omega_resource_authoritative_adapter.js" defer></script>');
  assert.ok(factory >= 0, 'existing factory runtime script must remain');
  assert.ok(inventory > factory, 'country inventory must load after the factory network');
  assert.ok(adapter > inventory, 'inventory hooks must be available before resource action adapters');
});

test('all countries have saved inventory shells and shared product rows, while only the selected country reads live stock', async () => {
  const { state, api } = makeRuntime();
  const initialized = await api.init();
  assert.equal(initialized.status, 'READY');
  assert.equal(initialized.countryCount, 3);
  assert.equal(initialized.activeCountryId, 'BGD');

  const savedBangladesh = api.getCountryRecord('BGD');
  const savedUnitedStates = api.getCountryRecord('USA');
  const savedGermany = api.getCountryRecord('DEU');
  assert.ok(Object.keys(savedBangladesh.products).length >= 4, 'the active country gets a materialized product balance map');
  assert.equal(item(api.getInventory('BGD', { includeZero: true }), 'steel').name, 'Steel');
  assert.equal(Object.keys(savedUnitedStates.products).length, 0, 'inactive product maps stay lazy to avoid bloating autosaves');
  assert.equal(Object.keys(savedGermany.products).length, 0, 'every other country still has a saved inventory shell');
  assert.ok(api.getInventory('USA', { includeZero: true }).items.length >= 4, 'the shared catalog renders inactive-country products');
  assert.ok(api.getInventory('DEU', { includeZero: true }).items.length >= 4, 'the catalog is available for every registered country');

  const usaInactive = api.getInventory('USA', { includeZero: true });
  assert.equal(usaInactive.readOnly, true);
  assert.equal(usaInactive.active, false);
  assert.equal(item(usaInactive, 'steel').base, 0);
  assert.equal(item(usaInactive, 'steel').quantity, 0);

  // Inactive country mutations in another subsystem are not polled into the saved inventory.
  state.resource.USA.inventory.STEEL = 999;
  assert.equal(item(api.getInventory('USA', { includeZero: true }), 'steel').quantity, 0);

  state.simulation.session.playerCountryId = 'USA';
  api.refreshActiveCountry();
  const usaActive = api.getInventory('USA', { includeZero: true });
  assert.equal(usaActive.active, true);
  assert.equal(usaActive.readOnly, false);
  assert.equal(item(usaActive, 'steel').quantity, 999);
  assert.equal(item(usaActive, 'steel').base, 999);

  state.simulation.session.playerCountryId = 'BGD';
  api.refreshActiveCountry();
  assert.equal(api.getInventory('USA', { includeZero: true }).readOnly, true);
  assert.equal(item(api.getInventory('USA', { includeZero: true }), 'steel').quantity, 999);
});

test('imports add inventory, consumption and exports subtract, and inactive-country writes are rejected', async () => {
  const { state, api } = makeRuntime();
  await api.init();

  const imported = api.importProduct({
    countryId: 'BGD', productId: 'STEEL', quantity: 4,
    unit: 'SIMULATION_RESOURCE_UNIT', eventId: 'TEST-IMPORT-1'
  });
  assert.equal(imported.status, 'COMPLETED');
  assert.equal(imported.balance, 7);

  const duplicateImport = api.importProduct({
    countryId: 'BGD', productId: 'STEEL', quantity: 4,
    unit: 'SIMULATION_RESOURCE_UNIT', eventId: 'TEST-IMPORT-1'
  });
  assert.equal(duplicateImport.status, 'DUPLICATE');
  assert.equal(duplicateImport.balance, 7, 'replayed import must not credit stock twice');

  const consumed = api.consumeProduct({
    countryId: 'BGD', productId: 'STEEL', quantity: 3,
    eventId: 'TEST-CONSUMPTION-1'
  });
  assert.equal(consumed.status, 'COMPLETED');
  assert.equal(consumed.balance, 4);

  const exported = api.exportProduct({
    countryId: 'BGD', productId: 'STEEL', quantity: 2,
    eventId: 'TEST-EXPORT-1', counterpartyCountryId: 'USA'
  });
  assert.equal(exported.status, 'COMPLETED');
  assert.equal(exported.balance, 2);

  const duplicateExport = api.exportProduct({
    countryId: 'BGD', productId: 'STEEL', quantity: 2,
    eventId: 'TEST-EXPORT-1', counterpartyCountryId: 'USA'
  });
  assert.equal(duplicateExport.status, 'DUPLICATE');
  assert.equal(duplicateExport.balance, 2, 'replayed export must not debit stock twice');

  const before = state.resource.BGD.inventory.STEEL;
  const overdraw = api.exportProduct({
    countryId: 'BGD', productId: 'STEEL', quantity: 20, eventId: 'TEST-EXPORT-OVERDRAW'
  });
  assert.equal(overdraw.status, 'BLOCKED');
  assert.equal(overdraw.reason, 'INSUFFICIENT_INVENTORY');
  assert.equal(state.resource.BGD.inventory.STEEL, before);

  const forbidden = api.importProduct({
    countryId: 'USA', productId: 'STEEL', quantity: 5, eventId: 'TEST-INACTIVE-IMPORT'
  });
  assert.equal(forbidden.status, 'BLOCKED');
  assert.equal(forbidden.reason, 'PLAYER_COUNTRY_ONLY');

  const ledger = api.getInventory('BGD').ledger;
  assert.ok(ledger.some(row => row.action === 'IMPORT' && row.delta === 4));
  assert.ok(ledger.some(row => row.action === 'CONSUMPTION' && row.delta === -3));
  assert.ok(ledger.some(row => row.action === 'EXPORT' && row.delta === -2));
  assert.equal(api.getInventory('BGD').unbounded, true);
});

test('trade settlements update the player inventory even when the event names the counterparty country', async () => {
  const { context, state, api } = makeRuntime();
  await api.init();

  state.resource.BGD.inventory.STEEL = 1;
  state.resource.BGD.inventoryLedger.push({
    type: 'INTERNATIONAL_TRADE_EXPORT',
    settlementId: 'TRADE-EXPORT-1',
    resourceId: 'STEEL',
    quantity: 2,
    turn: 1
  });
  context.dispatchEvent(new context.CustomEvent('OMEGA_TRADE_SETTLEMENT_COMPLETED', {
    detail: {
      eventType: 'OMEGA_TRADE_SETTLEMENT_COMPLETED',
      countryId: 'USA',
      payload: { settlementId: 'TRADE-EXPORT-1', sourceCountryId: 'BGD', destinationCountryId: 'USA', resourceId: 'STEEL', quantity: 2 }
    }
  }));

  state.resource.BGD.inventory.STEEL = 4;
  state.resource.BGD.inventoryLedger.push({
    type: 'INTERNATIONAL_TRADE_IMPORT',
    settlementId: 'TRADE-IMPORT-1',
    resourceId: 'STEEL',
    quantity: 3,
    sourceCountryId: 'USA',
    turn: 1
  });
  context.dispatchEvent(new context.CustomEvent('OMEGA_TRADE_SETTLEMENT_COMPLETED', {
    detail: {
      eventType: 'OMEGA_TRADE_SETTLEMENT_COMPLETED',
      countryId: 'USA',
      payload: { settlementId: 'TRADE-IMPORT-1', sourceCountryId: 'USA', destinationCountryId: 'BGD', resourceId: 'STEEL', quantity: 3 }
    }
  }));

  const ledger = api.getInventory('BGD').ledger;
  assert.equal(item(api.getInventory('BGD', { includeZero: true }), 'steel').quantity, 4);
  assert.equal(ledger.filter(row => row.action === 'EXPORT' && row.referenceId === 'TRADE-EXPORT-1').length, 1);
  assert.equal(ledger.filter(row => row.action === 'IMPORT' && row.referenceId === 'TRADE-IMPORT-1').length, 1);
  assert.equal(api.getInventory('USA', { includeZero: true }).readOnly, true);
});

test('authoritative INVENTORY_CONSUMED events are recorded as negative ledger movements', async () => {
  const { context, state, api } = makeRuntime();
  await api.init();

  state.resource.BGD.inventory.STEEL = 1;
  state.resource.BGD.inventoryLedger.push({
    type: 'INVENTORY_CONSUMED',
    resourceId: 'STEEL',
    quantity: 2,
    reason: 'FACTORY_INPUT',
    turn: 1,
    consumed: [{ batchId: 'INPUT-BATCH-1', quantity: 2 }]
  });
  context.dispatchEvent(new context.CustomEvent('OMEGA_RESOURCE_CONSUMPTION_COMPLETED', {
    detail: { eventType: 'OMEGA_RESOURCE_CONSUMPTION_COMPLETED', countryId: 'BGD', payload: { countryId: 'BGD' } }
  }));

  const ledger = api.getInventory('BGD').ledger;
  assert.equal(item(api.getInventory('BGD', { includeZero: true }), 'steel').quantity, 1);
  assert.equal(ledger.filter(row => row.action === 'CONSUMPTION' && row.productId === 'steel' && row.delta === -2).length, 1);

  context.dispatchEvent(new context.CustomEvent('OMEGA_RESOURCE_CONSUMPTION_COMPLETED', {
    detail: { eventType: 'OMEGA_RESOURCE_CONSUMPTION_COMPLETED', countryId: 'BGD', payload: { countryId: 'BGD' } }
  }));
  assert.equal(api.getInventory('BGD').ledger.filter(row => row.action === 'CONSUMPTION' && row.productId === 'steel' && row.delta === -2).length, 1);
});

test('factory output and input consumption are logged once without double-crediting stock', async () => {
  const { context, state, api } = makeRuntime();
  await api.init();

  // Simulate the factory runtime committing these balances before emitting its event.
  state.resource.BGD.inventory.iron_concentrate = 8;
  state.resource.BGD.inventory.STEEL = 6;
  const payload = {
    transactionId: 'FACTORYRUN:BGD:FAC-1:T1:1',
    countryId: 'BGD',
    factoryId: 'FAC-1',
    inputQuantities: { iron_concentrate: 2 },
    outputQuantities: { STEEL: 3 }
  };
  context.dispatchEvent(new context.CustomEvent('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED', {
    detail: { eventType: 'OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED', countryId: 'BGD', payload }
  }));
  context.dispatchEvent(new context.CustomEvent('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE', {
    detail: {
      eventType: 'OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',
      countryId: 'BGD',
      payload: { ...payload, outputs: payload.outputQuantities }
    }
  }));

  assert.equal(state.resource.BGD.inventory.STEEL, 6, 'factory output must not be credited twice');
  const ledger = api.getInventory('BGD').ledger;
  assert.equal(ledger.filter(row => row.action === 'PRODUCTION' && row.referenceId === payload.transactionId && row.productId === 'steel').length, 1);
  assert.equal(ledger.filter(row => row.action === 'CONSUMPTION' && row.referenceId === payload.transactionId && row.productId === 'iron_concentrate').length, 1);
  assert.equal(item(api.getInventory('BGD', { includeZero: true }), 'steel').quantity, 6);
});

test('multi-input factory output is credited when the factory commits only to processed warehouse', async () => {
  const { context, state, api } = makeRuntime();
  await api.init();

  // Model delivery to the factory input lot before production. The national on-hand
  // balance was already debited at delivery, so the production event must not debit it again.
  state.resource.BGD.inventory.iron_concentrate = 8;
  context.dispatchEvent(new context.CustomEvent('OMEGA_RESOURCE_INVENTORY_CHANGED', {
    detail: { eventType: 'OMEGA_RESOURCE_INVENTORY_CHANGED', countryId: 'BGD', payload: { countryId: 'BGD' } }
  }));

  // Multi-input factory cycles publish finished goods to processedWarehouse but do not
  // increment resource.inventory. The national inventory must still receive the output.
  state.resource.BGD.processedWarehouse.availableByResource.STEEL = 3;
  const payload = {
    transactionId: 'MULTI-FACTORY:BGD:FAC-2:T1:1',
    countryId: 'BGD',
    factoryId: 'FAC-2',
    inputSource: 'TRACKED_FACTORY_INPUT',
    inputTrackingStatus: 'TRACKED_FACTORY_INPUT_LOTS',
    inputQuantities: { iron_concentrate: 2 },
    outputQuantities: { STEEL: 3 }
  };
  context.dispatchEvent(new context.CustomEvent('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED', {
    detail: { eventType: 'OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED', countryId: 'BGD', payload }
  }));
  context.dispatchEvent(new context.CustomEvent('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE', {
    detail: {
      eventType: 'OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',
      countryId: 'BGD',
      payload: { ...payload, outputs: payload.outputQuantities }
    }
  }));

  assert.equal(state.resource.BGD.inventory.iron_concentrate, 8, 'factory input must not be deducted twice after delivery');
  assert.equal(state.resource.BGD.inventory.STEEL, 6, 'warehouse-only factory output must be added to on-hand inventory');
  assert.equal(item(api.getInventory('BGD', { includeZero: true }), 'steel').quantity, 6);
  const ledger = api.getInventory('BGD').ledger;
  assert.equal(ledger.filter(row => row.action === 'PRODUCTION' && row.referenceId === payload.transactionId && row.productId === 'steel').length, 1);
  assert.equal(ledger.filter(row => row.action === 'CONSUMPTION' && row.referenceId === payload.transactionId && row.productId === 'iron_concentrate').length, 1);
});

test('inventory has no stock cap or fixed 2,048-entry ledger truncation', async () => {
  const { api } = makeRuntime();
  await api.init();

  const large = api.importProduct({
    countryId: 'BGD', productId: 'copper', quantity: 1e12,
    eventId: 'TEST-LARGE-IMPORT', unit: 'SIMULATION_RESOURCE_UNIT'
  });
  assert.equal(large.status, 'COMPLETED');
  assert.equal(large.balance, 1e12);

  for (let i = 0; i < 2055; i++) {
    const entry = api.recordFactoryEvent('BGD', {
      transactionId: 'UNBOUNDED-LEDGER-' + i,
      outputQuantities: { copper: 1 }
    });
    assert.equal(entry.status, 'RECORDED');
  }
  const view = api.getInventory('BGD');
  assert.ok(view.totalLedgerEntries > 2048, 'inventory ledger must not be truncated at 2,048 entries');
  assert.equal(view.unbounded, true);
  assert.equal(api.diagnostics().ledgerEntryLimit, null);
});
