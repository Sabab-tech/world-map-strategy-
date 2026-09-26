
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class EventTargetMock {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  dispatchEvent(event) {
    for (const fn of this.listeners.get(event.type) || []) fn(event);
    return true;
  }
}

class CustomEventMock {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

function createContext() {
  const events = new EventTargetMock();
  const state = {
    simulation: { turn: 7 },
    playerCountryId: 'BGD',
    resource: {
      BGD: {
        inventory: { iron_ore: 100 },
        production: { iron_ore: 20 },
        consumption: { iron_ore: 25 },
        reserves: { iron_ore: 1000 },
        endowment: { iron_ore: 1500 },
        tradeAvailability: { iron_ore: 90 },
        mines: [{
          occurrenceKey: 'MINE-BGD-1',
          depositName: 'Test Iron Mine',
          resourceId: 'iron_ore',
          operationalStatus: 'OPERATING',
          reserveState: { residualQuantity: 1000, provenance: { quantityAuthority: 'OBSERVED', stateAuthority: 'OBSERVED' } },
          outputRatePerDay: 20,
          productionModel: { authority: 'SIMULATED', stateAuthority: 'SIMULATED' },
          qualityState: { qualityAuthority: 'OBSERVED' },
          purity: 0.62
        }],
        mineOutputs: {},
        batches: [{
          batchId: 'BATCH-1',
          resourceId: 'iron_ore',
          quantity: 100,
          remainingQuantity: 90,
          purity: 0.62,
          warehouseId: 'WH-BGD-RAW'
        }],
        warehouse: {
          warehouseId: 'WH-BGD-RAW',
          availableByResource: { iron_ore: 90 },
          storedBatchIds: ['BATCH-1'],
          receipts: []
        },
        mineProductionLedger: [],
        extractionLedger: []
      }
    },
    economy: {
      BGD: {
        productionAssets: [{
          id: 'PROC-1',
          stage: 'PROCESSING',
          capacity: 50,
          inputCoefficients: { iron_ore: 1 },
          outputProfile: { iron_intermediate: 0.8 }
        }]
      }
    },
    finance: { BGD: { available: 100000, reserves: 100000 } }
  };

  const handlers = new Map();

  function stateTransaction(countryId) {
    const root = state;
    return {
      get(path) {
        const parts = String(path).split('.');
        const domain = parts.shift();
        let current = root[domain]?.[countryId];
        for (const key of parts) {
          if (current == null) return undefined;
          current = current[key];
        }
        return current;
      },
      set(path, value) {
        const parts = String(path).split('.');
        const domain = parts.shift();
        if (!root[domain]) root[domain] = {};
        if (!root[domain][countryId]) root[domain][countryId] = {};
        let current = root[domain][countryId];
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]] || typeof current[parts[i]] !== 'object') current[parts[i]] = {};
          current = current[parts[i]];
        }
        current[parts.at(-1)] = value;
      }
    };
  }

  const interop = {
    registerAction() {},
    registerCommandHandler(actionId, _owner, handler) {
      handlers.set(actionId, handler);
    },
    dispatchCommand(_owner, actionId, countryId, payload) {
      const handler = handlers.get(actionId);
      if (!handler) return { status: 'UNAVAILABLE', reason: 'HANDLER_NOT_FOUND' };
      const result = handler(
        { commandId: 'CMD-' + actionId, payload },
        { countryId, stateTransaction: stateTransaction(countryId) }
      );
      return { status: result?.accepted === false ? 'REJECTED' : 'APPLIED', result };
    },
    emitEvent(type, countryId, source, payload, meta) {
      events.dispatchEvent(new CustomEventMock(type, {
        detail: { eventType: type, countryId, source, payload, meta }
      }));
      return true;
    }
  };

  const context = {
    console,
    Map,
    Set,
    WeakMap,
    Object,
    Array,
    Number,
    String,
    JSON,
    Date,
    Math,
    Promise,
    Intl,
    CustomEvent: CustomEventMock,
    addEventListener: events.addEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    Game: { state },
    Omega: { MinistryInteroperability: interop },
    OmegaCanonicalIdentityRegistry: {
      resolveCountry(value) {
        const text = String(value).toUpperCase();
        return { id: text === 'BANGLADESH' || text === 'BD' ? 'BGD' : text };
      }
    },
    ResourceMinistryEngine: {
      resourceTypes: [{
        id: 'iron_ore',
        name: 'Iron Ore',
        bnName: 'লোহা আকরিক',
        unit: 'TONNES',
        basePrice: 100
      }],
      normalizeCountryCode(value) {
        return String(value).toUpperCase() === 'BANGLADESH' ? 'BGD' : String(value).toUpperCase();
      },
      getCountryResourceProfile() {
        return { identity: { name: 'Bangladesh' } };
      },
      getDataLoadReport() {
        return { status: 'READY', authority: 'RESOURCE_JSON' };
      },
      getSummary() {
        return { resourcesList: [{ dailyProduction: 5000 }] };
      },
      getIntegratedResourceState(countryId) {
        return { countryId, inventory: state.resource[countryId]?.inventory || {} };
      },
      executeDirective() {}
    }
  };

  context.globalThis = context;
  return { context, state, events, handlers };
}

test('authoritative adapter uses live resource values and disables synthetic summary math', async () => {
  const { context, state } = createContext();
  const code = readFileSync('omega_resource_authoritative_adapter.js', 'utf8');
  vm.runInNewContext(code, context, { filename: 'omega_resource_authoritative_adapter.js' });

  const summary = context.ResourceMinistryEngine.getSummary('BGD');
  const iron = summary.resourcesList.find(row => row.id === 'iron_ore');

  assert.equal(context.OmegaResourceAuthoritativeAdapter.VERSION, '1.0.0');\n  const authorityRow = context.OmegaResourceAuthoritativeAdapter.getSummary('BGD').resourcesList.find(row => row.id === 'iron_ore');
  assert.equal(authorityRow.reserveAuthority, 'OBSERVED');
  assert.equal(authorityRow.productionAuthority, 'SIMULATED');
  assert.equal(authorityRow.qualityAuthority, 'OBSERVED');

  assert.equal(summary.globalMetrics.autonomyIndex, 80);
  assert.equal(iron.dailyProduction, 20);
  assert.equal(iron.dailyConsumption, 25);
  assert.equal(iron.stockDays, 4);
  assert.equal(iron.warehouseStock, 90);
  assert.equal(iron.basePrice, null);
  assert.notEqual(iron.dailyProduction, 5000);
  assert.equal(context.OmegaResourceAuthoritativeAdapter.diagnostics().syntheticSummaryDisabled, true);
});

test('legacy resource directives no longer fabricate discovery, capacity or stock', async () => {
  const { context, state } = createContext();
  const code = readFileSync('omega_resource_authoritative_adapter.js', 'utf8');
  vm.runInNewContext(code, context, { filename: 'omega_resource_authoritative_adapter.js' });

  const reserveBefore = state.resource.BGD.reserves.iron_ore;
  const inventoryBefore = state.resource.BGD.inventory.iron_ore;
  const capacityBefore = state.economy.BGD.productionAssets[0].capacity;

  const survey = context.ResourceMinistryEngine.executeDirective('survey', 'iron_ore');
  const expand = context.ResourceMinistryEngine.executeDirective('expand_facility', 'iron_ore');
  const reserve = context.ResourceMinistryEngine.executeDirective('add_reserve', 'iron_ore');

  assert.equal(survey.status, 'APPLIED');
  assert.equal(expand.status, 'APPLIED');
  assert.equal(reserve.status, 'APPLIED');

  assert.equal(state.resource.BGD.reserves.iron_ore, reserveBefore);
  assert.equal(state.resource.BGD.inventory.iron_ore, inventoryBefore);
  assert.equal(state.economy.BGD.productionAssets[0].capacity, capacityBefore);

  assert.equal(state.resource.BGD.surveyRequests.at(-1).status, 'REQUESTED');
  assert.equal(state.economy.BGD.capacityUpgradeRequests.at(-1).status, 'REQUESTED');
  assert.equal(state.resource.BGD.reserveBufferRequests.at(-1).status, 'REQUESTED');
});

test('integrated resource state exposes live batches and warehouse without replacing unknowns', async () => {
  const { context } = createContext();
  const code = readFileSync('omega_resource_authoritative_adapter.js', 'utf8');
  vm.runInNewContext(code, context, { filename: 'omega_resource_authoritative_adapter.js' });

  const integrated = context.ResourceMinistryEngine.getIntegratedResourceState('BGD');

  assert.equal(integrated.availability, 'AVAILABLE');
  assert.equal(integrated.inventory.iron_ore, 100);
  assert.equal(integrated.reserves.iron_ore, 1000);
  assert.equal(integrated.warehouse.warehouseId, 'WH-BGD-RAW');
  assert.equal(integrated.batches[0].purity, 0.62);
  assert.equal(integrated.authoritativeRuntimeState, true);
});
