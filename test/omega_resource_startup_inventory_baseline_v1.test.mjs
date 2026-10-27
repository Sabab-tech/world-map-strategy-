import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync('omega_resource_startup_inventory_baseline_v1.js', 'utf8');
const BASELINE_CONFIG = {
  enabled: true,
  version: 'SIMULATED_STARTUP_INVENTORY_BASELINE_V1',
  targetDays: { criticalPriorityMin: 8.5, critical: 40, standardPriorityMin: 6, standard: 24, nonCritical: 10 },
  quantityUnit: 'SIMULATION_RESOURCE_UNIT',
  quantityAuthority: 'SIMULATED',
  demandSource: 'OMEGA_RESOURCE_NATIONAL_DEMAND_RUNTIME',
  onlyPositiveDemand: true,
  preserveExistingStock: true,
  onlyFreshGameNoSave: true
};

function createContext() {
  const worldState = {
    simulation: { turn: 0, session: { playerCountryId: 'BGD' } },
    resource: {
      BGD: {
        inventory: { iron_ore: 5, copper: 1000, coal: -3 },
        reserves: { iron_ore: 900000, coal: 1000 },
        batches: [],
        inventoryLots: {},
        mineOutputs: { MINE_KEEP: { producedQuantity: 3 } },
        warehouse: { availableByResource: { iron_ore: 5, copper: 1000, coal: -3 }, storedBatchIds: [], receipts: [] }
      }
    },
    economy: { BGD: { productionAssets: [{ id: 'OBSERVED-FACTORY-1', factoryType: 'STEEL_AND_ALLOY_WORKS', status: 'OPERATIONAL' }] } }
  };
  const dispatches = [];
  const interoperability = {
    dispatchCommand(owner, type, countryId, payload) {
      dispatches.push({ owner, type, countryId, payload: structuredClone(payload) });
      if (type !== 'OMEGA_RESOURCE_ECON_ADD_INVENTORY') return { status: 'UNAVAILABLE', reason: 'UNEXPECTED_COMMAND' };
      const country = worldState.resource[countryId];
      const prior = country.batches.find(row => row.batchId === payload.batchId) || country.inventoryLots[payload.batchId];
      if (prior) {
        if (prior.resourceId === payload.resourceId && prior.quantity === payload.quantity &&
            prior.stage === payload.stage && prior.countryId === countryId) {
          return { status: 'APPLIED', result: { accepted: true, duplicate: true, reason: 'BATCH_ALREADY_CREDITED' } };
        }
        return { status: 'APPLIED', result: { accepted: false, reason: 'BATCH_ID_CONFLICT' } };
      }
      country.inventory[payload.resourceId] = (Number(country.inventory[payload.resourceId]) || 0) + payload.quantity;
      const batch = {
        batchId: payload.batchId, resourceId: payload.resourceId, quantity: payload.quantity,
        remainingQuantity: payload.quantity, stage: payload.stage, countryId,
        unit: payload.unit, provenance: structuredClone(payload.provenance)
      };
      country.batches.push(batch);
      country.inventoryLots[payload.batchId] = structuredClone(batch);
      country.warehouse.availableByResource[payload.resourceId] =
        (Number(country.warehouse.availableByResource[payload.resourceId]) || 0) + payload.quantity;
      country.warehouse.storedBatchIds.push(payload.batchId);
      country.warehouse.receipts.push({ receiptId: 'WH-REC-' + payload.batchId, batchId: payload.batchId, quantity: payload.quantity });
      return { status: 'APPLIED', result: { accepted: true, batch } };
    }
  };
  const endowmentCalls = [];
  const demandRows = [
    { resourceId: 'iron_ore', status: 'LOW_COVERAGE', demandPerDay: 10, priority: 9, unit: 'METRIC_TONS_PER_DAY', baselineSource: 'RULE_PROFILE_POPULATION_BASELINE_PER_DAY', baselineProvenance: 'RULE_PROFILE_ESTIMATE' },
    { resourceId: 'copper', status: 'BALANCED', demandPerDay: 2, priority: 8, unit: 'METRIC_TONS_PER_DAY', baselineSource: 'RULE_PROFILE_POPULATION_BASELINE_PER_DAY', baselineProvenance: 'RULE_PROFILE_ESTIMATE' },
    { resourceId: 'gold', status: 'SHORTAGE', demandPerDay: 1, priority: 3, unit: 'TROY_OUNCES_PER_DAY', baselineSource: 'RULE_PROFILE_POPULATION_BASELINE_PER_DAY', baselineProvenance: 'RULE_PROFILE_ESTIMATE' },
    { resourceId: 'coal', status: 'SHORTAGE', demandPerDay: 4, priority: 9.2, unit: 'METRIC_TONS_PER_DAY', baselineSource: 'OBSERVED_RESOURCE_CONSUMPTION', baselineProvenance: 'OBSERVED' },
    { resourceId: 'gypsum', status: 'UNKNOWN', baselineSource: 'NO_BASELINE_OR_REQUIRED_METRICS' },
    { resourceId: 'lithium', status: 'UNKNOWN', demandPerDay: null, baselineSource: 'NO_BASELINE_OR_REQUIRED_METRICS' }
  ];
  const context = {
    console, Math, Number, String, Object, Array, Set, Map, JSON, Promise, Date,
    setTimeout,
    Game: { state: worldState, playerCountryId: 'BGD' },
    gameState: worldState,
    __OmegaResourceEconomyRules: { demand: { startupInventoryBaseline: structuredClone(BASELINE_CONFIG) } },
    OmegaCanonicalIdentityRegistry: { resolveCountry(value) { const s = String(value || '').toUpperCase(); if (s === 'BANGLADESH' || s === 'BD') return { id: 'BDG' }; return { id: s }; } },
    Omega: {
      MinistryInteroperability: interoperability,
      ResourceEndowmentRuntime: {
        async initialize() { endowmentCalls.push('initialize'); return { status: 'READY' }; },
        async hydrateCountry(countryId) { endowmentCalls.push('hydrate:' + countryId); return { status: 'APPLIED', result: { accepted: true } }; }
      },
      ResourceNationalDemandRuntime: {
        async prepare() { return { status: 'READY' }; },
        previewCountry(countryId) {
          assert.equal(countryId, 'BGD');
          return { status: 'PREVIEW_ONLY', resources: structuredClone(demandRows), consumedResourceCount: 0, procurement: [] };
        }
      },
      ResourceEconomy: { diagnostics() { return { handlersReady: true, rulesLoaded: true }; } }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'omega_resource_startup_inventory_baseline_v1.js' });
  return { context, worldState, dispatches, endowmentCalls, originalReserves: structuredClone(worldState.resource.BGD.reserves),
    originalMineOutputs: structuredClone(worldState.resource.BGD.mineOutputs),
    originalFactories: structuredClone(worldState.economy.BGD.productionAssets) };
}

test('fresh-game baseline seeds only known positive-demand stock gaps and labels all estimates simulated', async () => {
  const { context, worldState, dispatches, originalReserves, originalMineOutputs, originalFactories } = createContext();
  const api = context.OmegaResourceStartupInventoryBaseline;
  const result = await api.initializeNewGame('BGD', { reason: 'FRESH_SESSION_NO_SAVE', noSave: true });

  assert.equal(result.status, 'PARTIAL', 'a negative legacy balance is reported, not silently repaired by startup seeding');
  assert.equal(result.seededResourceCount, 2);
  assert.equal(result.preservedResourceCount, 1);
  assert.equal(result.unknownResourceCount, 2);
  assert.equal(result.blockedResourceCount, 1);
  assert.equal(worldState.resource.BGD.inventory.iron_ore, 400, 'critical 40-day target is 10/day × 40 days');
  assert.equal(worldState.resource.BGD.inventory.copper, 1000, 'existing higher inventory is preserved');
  assert.equal(worldState.resource.BGD.inventory.gold, 10, 'non-critical 10-day target is seeded');
  assert.equal(worldState.resource.BGD.inventory.coal, -3, 'negative existing balance is left to the separate inventory-integrity repair');
  assert.equal(worldState.resource.BGD.reserves.iron_ore, originalReserves.iron_ore, 'geological reserves are untouched');
  assert.deepEqual(worldState.resource.BGD.mineOutputs, originalMineOutputs);
  assert.deepEqual(worldState.economy.BGD.productionAssets, originalFactories, 'startup stock baseline must not invent factories');

  const credits = dispatches.filter(row => row.type === 'OMEGA_RESOURCE_ECON_ADD_INVENTORY');
  assert.equal(credits.length, 2);
  assert.ok(credits.every(row => row.owner === 'resource' && row.countryId === 'BGD'));
  assert.ok(credits.every(row => row.payload.stage === 'RAW' && row.payload.unit === 'SIMULATION_RESOURCE_UNIT'));
  assert.ok(credits.every(row => row.payload.provenance.quantityAuthority === 'SIMULATED'));
  assert.ok(credits.every(row => row.payload.provenance.source === 'SIMULATED_STARTUP_INVENTORY_BASELINE_V1'));
  assert.equal(new Set(credits.map(row => row.payload.batchId)).size, 2);
});

test('repeating the fresh-game initializer does not refill a stockpile or emit duplicate baseline batches', async () => {
  const { context, worldState, dispatches } = createContext();
  const api = context.OmegaResourceStartupInventoryBaseline;
  await api.initializeNewGame('BGD', { reason: 'FRESH_SESSION_NO_SAVE', noSave: true });
  const stockAfterFirst = structuredClone(worldState.resource.BGD.inventory);
  const batchCount = worldState.resource.BGD.batches.length;
  const dispatchCount = dispatches.length;

  await api.initializeNewGame('BGD', { reason: 'FRESH_SESSION_NO_SAVE', noSave: true });
  assert.deepEqual(worldState.resource.BGD.inventory, stockAfterFirst);
  assert.equal(worldState.resource.BGD.batches.length, batchCount);
  assert.equal(dispatches.length, dispatchCount, 'full stocks do not create a second opening baseline batch');
});

test('startup baseline refuses restore/reload callers and country-scope mismatches', async () => {
  const { context, dispatches, endowmentCalls } = createContext();
  const api = context.OmegaResourceStartupInventoryBaseline;
  const wrongReason = await api.initializeNewGame('BGD', { reason: 'SAVE_RESTORED', noSave: false });
  assert.equal(wrongReason.status, 'BLOCKED');
  assert.equal(wrongReason.reason, 'NOT_AN_EXPLICIT_FRESH_GAME_WITHOUT_SAVE');
  const wrongCountry = await api.initializeNewGame('USA', { reason: 'FRESH_SESSION_NO_SAVE', noSave: true });
  assert.equal(wrongCountry.status, 'BLOCKED');
  assert.equal(wrongCountry.reason, 'PLAYER_COUNTRY_SCOPE_MISMATCH');
  assert.equal(dispatches.length, 0);
  assert.deepEqual(endowmentCalls, []);
});


test('index loads startup baseline and lifecycle calls it only in the no-save fresh-session branch', () => {
  const html = readFileSync('index.html', 'utf8');
  const lifecycle = readFileSync('omega_game_lifecycle_runtime_v1.js', 'utf8');
  const restoreReturn = lifecycle.indexOf("setSaveStatus('BACKGROUND SYSTEMS PAUSED · PRESS PLAY TO RESUME');\n      return;");
  const freshCountry = lifecycle.indexOf('var country = playerCountry(sim);', restoreReturn);
  const initializerCall = lifecycle.indexOf('initializeNewGame(country, {');
  assert.ok(html.includes('<script src="omega_resource_startup_inventory_baseline_v1.js" defer></script>'));
  assert.ok(restoreReturn >= 0, 'save restore must keep its early return');
  assert.ok(freshCountry > restoreReturn, 'fresh-game branch begins after the save restore return');
  assert.ok(initializerCall > freshCountry, 'opening stock is initialized only in the fresh-game branch');
  assert.ok(lifecycle.includes("reason: 'FRESH_SESSION_NO_SAVE', noSave: true"));
});
