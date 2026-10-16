import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const demandRules = JSON.parse(readFileSync('resource_economy_rules.json', 'utf8')).demand;

function createRuntimeContext(options = {}) {
  const inventory = options.inventory === undefined ? { iron_ore: 100 } : options.inventory;
  const resourceState = {
    inventory,
    consumption: options.consumption === undefined ? { iron_ore: 10 } : options.consumption,
    production: options.production || {},
    batches: [],
    strategicReserve: { availableByResource: { iron_ore: 20 } },
    mines: []
  };
  const worldState = {
    simulation: { turn: 1, session: { playerCountryId: 'USA' } },
    resource: { BGD: resourceState },
    population: { BGD: { totalPopulation: 1000000 } },
    economy: { BGD: { gdp: 1000000000, productionAssets: [] } },
    military: { BGD: { forceStructure: { personnel: 10000 } } },
    finance: { BGD: { available: 1000000000 } },
    trade: { BGD: { marketPrice: { iron_ore: 10 }, importRequests: [] } },
    foreign: { BGD: { relations: {} } }
  };
  const calls = [];
  const interoperability = {
    dispatchCommand(owner, type, countryId, payload) {
      calls.push({ owner, type, countryId, payload });
      const country = worldState.resource[countryId];
      if (type === 'OMEGA_RESOURCE_ECON_CONSUME_INVENTORY') {
        const inv = country.inventory;
        if (!inv || typeof inv !== 'object') return { status: 'APPLIED', result: { accepted: false, reason: 'RESOURCE_INVENTORY_UNAVAILABLE' } };
        const key = Object.keys(inv).find(k => k.toLowerCase() === String(payload.resourceId).toLowerCase());
        const amount = key ? Number(inv[key]) : 0;
        if (amount < payload.quantity) return { status: 'APPLIED', result: { accepted: false, reason: 'RESOURCE_INVENTORY_INSUFFICIENT' } };
        inv[key] = amount - payload.quantity;
        return { status: 'APPLIED', result: { accepted: true, consumed: [{ resourceId: payload.resourceId, quantity: payload.quantity }] } };
      }
      if (type === 'OMEGA_RESOURCE_ECON_PUBLISH_DEMAND_RUNTIME') {
        if (payload.consumption && Object.keys(payload.consumption).length) {
          country.consumption = { ...(country.consumption || {}), ...payload.consumption };
        }
        country.demandRuntime = payload.demandRuntime;
        return { status: 'APPLIED', result: { accepted: true } };
      }
      return { status: 'UNAVAILABLE', reason: 'TEST_HANDLER_NOT_REGISTERED' };
    }
  };
  const context = {
    console,
    Game: { state: worldState },
    gameState: worldState,
    __OmegaResourceEconomyRules: { demand: structuredClone(demandRules) },
    OmegaMinistryInteroperability: interoperability,
    Omega: { MinistryInteroperability: interoperability },
    OmegaCanonicalIdentityRegistry: {
      resolveCountry(value) {
        const key = String(value || '').toUpperCase();
        if (key === 'BANGLADESH') return { id: 'BGD' };
        return { id: key };
      }
    },
    asyncFetchData: null,
    fetch: async path => ({
      ok: true,
      async json() {
        if (String(path).includes('population.json')) return { BGD: { population_2015: 1000000 } };
        if (String(path).includes('economy.json')) return { BGD: { gdp: 1000000000 } };
        throw new Error('UNEXPECTED_TEST_DATASET:' + path);
      }
    }),
    dispatchEvent() {},
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  };
  context.globalThis = context;
  vm.runInNewContext(readFileSync('omega_resource_national_demand_runtime_v1.js', 'utf8'), context, {
    filename: 'omega_resource_national_demand_runtime_v1.js'
  });
  return { context, worldState, calls };
}

test('demand formula combines population, income, industry and military elasticities with bounded output', () => {
  const { context } = createRuntimeContext();
  const formula = context.OmegaResourceNationalDemandRuntime.calculateDemand({
    config: {
      defaultElasticities: { population: 0.5, gdpPerCapita: 0.5, industry: 0.5, military: 0.5, price: 0 },
      minContextRatio: 0.25, maxContextRatio: 4, minFactor: 0.2, maxFactor: 5
    },
    profile: {},
    baselineRate: 100,
    reference: { population: 1000000, gdpPerCapita: 10000, industry: 100, militaryPersonnel: 1000 },
    current: { population: 2000000, gdpPerCapita: 20000, industry: 200, militaryPersonnel: 2000 },
    currentPrice: null, referencePrice: null, priceSource: null, policyMultiplier: 1, warActive: false
  });
  assert.ok(Math.abs(formula.demand - 400) < 1e-8);
  assert.equal(formula.totalFactor, 4);
  assert.equal(formula.factors.population.available, true);
  assert.equal(formula.factors.price.multiplier, 1);
});

test('country demand is updated once per turn, factory inputs are not double-charged, and protected stock is not consumed', async () => {
  const { context, worldState, calls } = createRuntimeContext();
  const runtime = context.OmegaResourceNationalDemandRuntime;
  await runtime.prepare();

  const first = runtime.processCountry('BGD', [{ inputQuantities: { iron_ore: 2 } }]);
  const stockAfterFirst = worldState.resource.BGD.inventory.iron_ore;
  assert.equal(first.status, 'ACTIVE');
  assert.equal(worldState.resource.BGD.consumption.iron_ore, 10);
  assert.equal(stockAfterFirst, 92, '8 units beyond the 2 factory-input units are consumed from unprotected stock');
  const firstDemand = worldState.resource.BGD.demandRuntime.byResource.iron_ore;
  assert.equal(firstDemand.demand, 10);
  assert.equal(firstDemand.factoryConsumption, 2);
  assert.equal(firstDemand.nationalConsumption, 8);
  assert.equal(firstDemand.unmetDemand, 0);
  assert.equal(firstDemand.protectedStock, 20);
  assert.ok(calls.some(x => x.type === 'OMEGA_RESOURCE_ECON_CONSUME_INVENTORY' && x.payload.resourceId === 'iron_ore'));

  worldState.simulation.turn = 2;
  const second = runtime.processCountry('BGD', [{ inputQuantities: { iron_ore: 2 } }]);
  const secondDemand = worldState.resource.BGD.demandRuntime.byResource.iron_ore;
  assert.equal(secondDemand.demand, 10, 'uses the pinned baseline, not last turn demand, so values do not compound');
  assert.equal(secondDemand.nationalConsumption, 8);
  assert.equal(second.turn, 2);
  assert.equal(worldState.resource.BGD.demandRuntime.history.length, 2);
  assert.equal(worldState.resource.BGD.demandRuntime.publishStatus, undefined);
});

test('missing inventory remains unknown and never fabricates a debit', async () => {
  const { context, worldState, calls } = createRuntimeContext({ inventory: undefined });
  worldState.resource.BGD.inventory = undefined;
  await context.OmegaResourceNationalDemandRuntime.prepare();
  const report = context.OmegaResourceNationalDemandRuntime.processCountry('BGD', []);
  assert.equal(report.status, 'WAITING_FOR_INVENTORY');
  assert.ok(report.resources.some(row => row.resourceId === 'iron_ore' && row.status === 'WAITING_FOR_INVENTORY'));
  assert.equal(calls.some(row => row.type === 'OMEGA_RESOURCE_ECON_CONSUME_INVENTORY'), false);
});

test('a finite inventory shortfall is recorded as unmet demand rather than negative inventory', async () => {
  const { context, worldState } = createRuntimeContext({ inventory: { iron_ore: 5 }, consumption: { iron_ore: 10 } });
  worldState.resource.BGD.strategicReserve.availableByResource.iron_ore = 0;
  await context.OmegaResourceNationalDemandRuntime.prepare();
  const report = context.OmegaResourceNationalDemandRuntime.processCountry('BGD', []);
  const row = worldState.resource.BGD.demandRuntime.byResource.iron_ore;
  assert.equal(worldState.resource.BGD.inventory.iron_ore, 0);
  assert.equal(row.demand, 10);
  assert.equal(row.nationalConsumption, 5);
  assert.equal(row.unmetDemand, 5);
  assert.equal(row.status, 'SHORTAGE');
  assert.equal(report.shortages > 0, true);
});
