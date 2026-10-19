import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const policeData = JSON.parse(readFileSync(fileURLToPath(new URL('../omega_home_ministry_country_police_baseline_v1.json', import.meta.url)), 'utf8'));
const capabilityData = JSON.parse(readFileSync(fileURLToPath(new URL('../omega_home_ministry_training_recruitment_level_baseline_v1.json', import.meta.url)), 'utf8'));
const capabilityByAlias = new Map();
for (const row of capabilityData.countries) {
  for (const alias of [row.code, row.iso2, row.iso3, row.name].filter(Boolean)) {
    capabilityByAlias.set(String(alias).trim().toUpperCase().replace(/[\\s_-]+/g, ''), row);
  }
}
const countries = policeData.countries.map(row => {
  const capability = capabilityByAlias.get(String(row.iso3 || row.code).trim().toUpperCase().replace(/[\\s_-]+/g, ''));
  return Object.assign({}, row, { capabilityBaseline: capability ? {
    modelVersion: capabilityData.model.version,
    trainingLevel: capability.trainingLevel,
    recruitmentLevel: capability.recruitmentLevel,
    trainingScore: capability.trainingScore,
    recruitmentScore: capability.recruitmentScore,
    costIndex: capability.costIndex,
    levelAuthority: capability.levelAuthority,
    dataCoverage: capability.dataCoverage,
    observedHomicide: capability.observedHomicide,
    sourceAsset: 'omega_home_ministry_training_recruitment_level_baseline_v1.json'
  } : null });
});
const bangladesh = countries.find(row => row.iso3 === 'BGD');
const resourceBaseline = {
  CONSTRUCTION_AGGREGATE: 10000,
  COPPER: 5000,
  BAUXITE_ALUMINUM: 1000,
  CRUDE_OIL: 10000,
  IRON_ORE: 10000
};
const handlers = new Map();
const events = new Map();
let rejectNextExpense = false;
let financeTransactionId = 0;
globalThis.window = globalThis;
globalThis.Omega = {};
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail || null; } };
globalThis.addEventListener = (type, fn) => { const rows = events.get(type) || []; rows.push(fn); events.set(type, rows); };
globalThis.dispatchEvent = event => { for (const fn of events.get(event.type) || []) fn(event); return true; };
globalThis.updateGlobalResourceHUD = () => {};
globalThis.Game = { countryId: 'BD', currentActiveCountry: 'BD', state: {} };
globalThis.CountryIOS = { activeCountry: 'BD' };

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function atPath(root, parts, create) {
  let row = root;
  for (const part of parts) {
    if (!row || typeof row !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(row, part)) {
      if (!create) return undefined;
      row[part] = {};
    }
    row = row[part];
  }
  return row;
}
const ministryMesh = {
  registerCommandHandler(commandType, ownerMinistry, handler) {
    if (handlers.has(commandType)) throw new Error('DUPLICATE_COMMAND_HANDLER');
    handlers.set(commandType, { ownerMinistry, handler });
    return { commandType, ownerMinistry };
  },
  dispatchCommand(sourceMinistry, actionId, countryId, payload = {}, options = {}) {
    const commandType = options.commandType || actionId;
    const registered = handlers.get(commandType);
    if (!registered) return { status: 'UNHANDLED', reason: 'AUTHORITATIVE_HANDLER_NOT_REGISTERED' };
    if (options.ownerMinistry && options.ownerMinistry !== registered.ownerMinistry)
      return { status: 'REJECTED', result: { reason: 'COMMAND_OWNER_MISMATCH' } };
    const country = String(countryId || '').toUpperCase();
    const domain = registered.ownerMinistry;
    const operations = [];
    const stateTransaction = {
      get(path) {
        const staged = [...operations].reverse().find(item => item.path === path);
        if (staged) return clone(staged.value);
        const bits = String(path).split('.');
        if (bits.shift() !== domain) return undefined;
        return clone(atPath(globalThis.Game.state[domain], [country, ...bits], false));
      },
      set(path, value) {
        const bits = String(path).split('.');
        if (bits.shift() !== domain) throw new Error('STATE_PATH_NOT_OWNED_BY_MINISTRY:' + path);
        operations.push({ path, value: clone(value), bits });
        return clone(value);
      }
    };
    let result;
    try {
      result = registered.handler({ commandType, actionId, countryId: country, payload: clone(payload), simulationTurn: globalThis.Game.state.simulation?.turn || 0 }, {
        countryId: country, simulationTurn: globalThis.Game.state.simulation?.turn || 0, stateTransaction
      });
    } catch (error) {
      return { status: 'REJECTED', result: { reason: String(error && error.message || error) } };
    }
    if (!result || result.accepted !== true) return { status: 'REJECTED', result: result || { reason: 'HANDLER_REJECTED' } };
    for (const op of operations) atPath(globalThis.Game.state[domain], [country, ...op.bits], true);
    // Paths are rooted at the owning ministry and must commit to that country's container.
    operations.forEach(op => {
      const bits = op.bits.slice(0, -1);
      const key = op.bits[op.bits.length - 1];
      const container = atPath(globalThis.Game.state[domain], [country, ...bits], true);
      container[key] = clone(op.value);
    });
    return { status: 'APPLIED', result: clone(result), commandId: 'TEST-CMD' };
  }
};
globalThis.OmegaMinistryInteroperability = ministryMesh;
globalThis.Omega.MinistryInteroperability = ministryMesh;

const financeModel = {
  countryCode: 'BD', treasuryBalanceUsd: 12000000, revision: 0, fiscalYearIndex: 0, ledger: [],
  allocations: {
    interior: { budgetUsd: 10000000, spentUsd: 0, remainingUsd: 10000000 },
    defense: { budgetUsd: 10000000, spentUsd: 0, remainingUsd: 10000000 }
  }
};
const financeApi = {
  diagnostics: () => ({ initialized: true }),
  getPlayerCountry: () => ({ countryCode: 'BD', name: 'Bangladesh', iso3: 'BGD' }),
  resolveCountry(value) {
    const raw = String(value || '').toUpperCase().replace(/[\\s_-]+/g, '');
    const row = policeData.countries.find(item =>
      [item.code, item.iso2, item.iso3, item.name].some(alias => String(alias || '').toUpperCase().replace(/[\\s_-]+/g, '') === raw));
    return row ? { countryCode: row.iso2 || row.code, countryName: row.name, name: row.name, iso3: row.iso3 } : null;
  },
  getFinanceState(value) { return String(value || '').toUpperCase() === 'BD' ? financeModel : null; },
  applyAction(action) {
    if (action.type === 'rollback-home-ministry-expense') {
      const row = financeModel.ledger.find(item => item.transactionId === action.transactionId);
      if (!row || row.reversedBy) return { ok: false, code: 'ROLLBACK_REFERENCE_INVALID' };
      row.reversedBy = 'RB-' + row.transactionId;
      const allocation = financeModel.allocations[row.department];
      allocation.spentUsd = Math.max(0, allocation.spentUsd - row.amountUsd);
      allocation.remainingUsd = allocation.budgetUsd - allocation.spentUsd;
      financeModel.treasuryBalanceUsd += row.amountUsd;
      financeModel.revision++;
      return { ok: true, code: 'ROLLED_BACK' };
    }
    if (action.type !== 'spend-budget') return { ok: false, code: 'UNSUPPORTED_ACTION' };
    if (rejectNextExpense) { rejectNextExpense = false; return { ok: false, code: 'SIMULATED_FINANCE_REJECTION' }; }
    const allocation = financeModel.allocations[action.department], amount = Number(action.amountUsd);
    if (!allocation || !(amount > 0)) return { ok: false, code: 'INVALID_EXPENSE' };
    if (amount > allocation.remainingUsd + 0.01) return { ok: false, code: 'ALLOCATION_LIMIT_EXCEEDED', treasuryBalanceUsd: financeModel.treasuryBalanceUsd };
    if (amount > financeModel.treasuryBalanceUsd + 0.01) return { ok: false, code: 'INSUFFICIENT_TREASURY', treasuryBalanceUsd: financeModel.treasuryBalanceUsd };
    allocation.spentUsd += amount;
    allocation.remainingUsd = Math.max(0, allocation.budgetUsd - allocation.spentUsd);
    financeModel.treasuryBalanceUsd -= amount;
    financeModel.revision++;
    const transactionId = 'POL-' + (++financeTransactionId);
    financeModel.ledger.push({ transactionId, fiscalYearIndex: financeModel.fiscalYearIndex, action: 'EXPENSE',
      department: action.department, category: action.spendType, amountUsd: amount, description: String(action.description || ''),
      balanceAfterUsd: financeModel.treasuryBalanceUsd });
    globalThis.Game.state.finance.BD.available = financeModel.treasuryBalanceUsd;
    return { ok: true, code: 'EXPENSE_POSTED', transactionId, treasuryBalanceUsd: financeModel.treasuryBalanceUsd };
  }
};
globalThis.OmegaFinanceMinistry = financeApi;
globalThis.Omega.FinanceMinistry = financeApi;

await import('../omega_home_ministry_engine_v1.js');
await import('../omega_home_ministry_training_materials_runtime_v1.js');
const engine = globalThis.OmegaHomeMinistryEngine;

function reset() {
  const startingCash = 12000000;
  financeModel.countryCode = 'BD';
  financeModel.treasuryBalanceUsd = startingCash;
  financeModel.revision = 0;
  financeModel.fiscalYearIndex = 0;
  financeModel.ledger = [];
  financeModel.allocations.interior = { budgetUsd: 10000000, spentUsd: 0, remainingUsd: 10000000 };
  financeModel.allocations.defense = { budgetUsd: 10000000, spentUsd: 0, remainingUsd: 10000000 };
  rejectNextExpense = false;
  globalThis.Game.state = {
    economy: { BD: { treasury: startingCash, gdp: 250000000000 } },
    finance: { BD: { available: startingCash, reserves: 0 } },
    population: { BD: { population: bangladesh.population.value } },
    resource: { BD: {
      inventory: clone(resourceBaseline),
      tradeAvailability: clone(resourceBaseline),
      strategicReserve: { availableByResource: { COPPER: 100 } },
      batches: [], warehouse: null, inventoryLedger: []
    } },
    simulation: { turn: 0, simulationTimeMs: 0 },
    interior: {}
  };
  const result = engine.bootstrapCountryPoliceBaselines(countries);
  assert.equal(result.ok, true);
  globalThis.Game.state.finance.BD.available = startingCash;
  assert.equal(engine.getState('BD').trainingQualityLevel, bangladesh.capabilityBaseline.trainingLevel);
  assert.equal(engine.getState('BD').recruitmentLevel, bangladesh.capabilityBaseline.recruitmentLevel);
}

test('country capability baseline covers 249 countries and distinguishes modeled estimates from verified national standards', () => {
  assert.equal(capabilityData.schemaVersion, '1.0.0');
  assert.equal(capabilityData.countries.length, 249);
  assert.ok(capabilityData.countries.every(row => row.levelAuthority === 'MODELED_SIMULATION_ESTIMATE'));
  assert.ok(capabilityData.countries.every(row => row.dataCoverage.policeRosterObserved === false));
  assert.ok(new Set(capabilityData.countries.map(row => row.trainingLevel)).size > 1);
  assert.ok(new Set(capabilityData.countries.map(row => row.recruitmentLevel)).size > 1);
  assert.ok(capabilityData.countries.every(row => row.trainingLevel >= 1 && row.trainingLevel <= 8));
  assert.ok(capabilityData.countries.every(row => row.recruitmentLevel >= 1 && row.recruitmentLevel <= 8));
});

test('a fully funded country upgrade consumes unreserved materials, waits for simulation time and then raises only the requested level', () => {
  reset();
  assert.equal(globalThis.OmegaHomePoliceTrainingMaterialsRuntime.diagnostics().ready, true);
  const before = engine.getState('BD');
  const quote = engine.getCapabilityUpgradeQuote('recruitment', 'BD');
  assert.equal(quote.canStart, true, JSON.stringify(quote.blockers));
  const cashBefore = financeModel.treasuryBalanceUsd;
  const inventoryBefore = clone(Game.state.resource.BD.inventory);
  const started = engine.startCapabilityUpgrade('recruitment', 'BD');
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(engine.getState('BD').recruitmentLevel, before.recruitmentLevel);
  assert.equal(engine.getState('BD').pendingCapabilityUpgrade.status, 'IN_PROGRESS');
  assert.equal(financeModel.treasuryBalanceUsd, cashBefore - quote.costUsd);
  for (const material of quote.materials) {
    assert.equal(Game.state.resource.BD.inventory[material.resourceId], inventoryBefore[material.resourceId] - material.quantity);
  }

  Game.state.simulation.simulationTimeMs = started.completesAtMs - 1000;
  globalThis.dispatchEvent(new CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED', { detail: { countryId: 'BD', payload: { countryId: 'BD' } } }));
  assert.equal(engine.getState('BD').recruitmentLevel, before.recruitmentLevel);
  Game.state.simulation.simulationTimeMs = started.completesAtMs;
  Game.state.simulation.turn = 1;
  globalThis.dispatchEvent(new CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED', { detail: { countryId: 'BD', payload: { countryId: 'BD' } } }));
  const after = engine.getState('BD');
  assert.equal(after.recruitmentLevel, quote.targetLevel);
  assert.equal(after.pendingCapabilityUpgrade, null);
  assert.equal(after.capabilityUpgradeHistory.at(-1).status, 'COMPLETED');
  assert.equal(after.trainingQualityLevel, before.trainingQualityLevel);
});

test('missing physical stock rejects the upgrade before any treasury or inventory mutation', () => {
  reset();
  Game.state.resource.BD.inventory.CRUDE_OIL = 1;
  Game.state.resource.BD.tradeAvailability.CRUDE_OIL = 1;
  const cashBefore = financeModel.treasuryBalanceUsd;
  const inventoryBefore = clone(Game.state.resource.BD.inventory);
  const quote = engine.getCapabilityUpgradeQuote('recruitment', 'BD');
  assert.equal(quote.canStart, false);
  assert.ok(quote.blockers.some(row => row.code === 'INSUFFICIENT_RESOURCE_STOCK'));
  const result = engine.startCapabilityUpgrade('recruitment', 'BD');
  assert.equal(result.ok, false);
  assert.equal(financeModel.treasuryBalanceUsd, cashBefore);
  assert.deepEqual(Game.state.resource.BD.inventory, inventoryBefore);
  assert.equal(engine.getState('BD').pendingCapabilityUpgrade, null);
});

test('if Finance rejects after material reservation, the exact material quantities are refunded and project is not recorded', () => {
  reset();
  const cashBefore = financeModel.treasuryBalanceUsd;
  const inventoryBefore = clone(Game.state.resource.BD.inventory);
  rejectNextExpense = true;
  const result = engine.startCapabilityUpgrade('recruitment', 'BD');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'SIMULATED_FINANCE_REJECTION');
  assert.equal(financeModel.treasuryBalanceUsd, cashBefore);
  assert.deepEqual(Game.state.resource.BD.inventory, inventoryBefore);
  assert.equal(engine.getState('BD').pendingCapabilityUpgrade, null);
});
