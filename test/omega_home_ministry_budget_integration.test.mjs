import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const events = new Map();
globalThis.window = globalThis;
globalThis.Omega = {};
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail || null; } };
globalThis.addEventListener = (type, fn) => { const list = events.get(type) || []; list.push(fn); events.set(type, list); };
globalThis.dispatchEvent = event => { for (const fn of events.get(event.type) || []) fn(event); return true; };
globalThis.updateGlobalResourceHUD = () => {};

function mockFinance({ treasury = 12_000_000, interior = 10_000_000 } = {}) {
  const model = {
    countryCode: 'AAA', treasuryBalanceUsd: treasury, revision: 0, fiscalYearIndex: 0, ledger: [],
    allocations: {
      interior: { budgetUsd: interior, spentUsd: 0, remainingUsd: interior },
      defense: { budgetUsd: interior, spentUsd: 0, remainingUsd: interior }
    }
  };
  let tx = 0;
  const api = {
    diagnostics: () => ({ initialized: true }),
    getPlayerCountry: () => ({ countryCode: 'AAA', name: 'Test Republic' }),
    resolveCountry: value => /AAA|TEST REPUBLIC/i.test(String(value)) ? ({ countryCode: 'AAA', name: 'Test Republic', iso3: 'AAA' }) : null,
    getFinanceState: value => /AAA/i.test(String(value)) ? model : null,
    applyAction(action) {
      if (action.type === 'rollback-home-ministry-expense') {
        const row = model.ledger.find(item => item.transactionId === action.transactionId);
        if (!row || row.reversedBy) return { ok: false, code: 'ROLLBACK_REFERENCE_INVALID' };
        const allocation = model.allocations[row.department];
        row.reversedBy = 'RB-' + row.transactionId;
        allocation.spentUsd = Math.max(0, allocation.spentUsd - row.amountUsd);
        allocation.remainingUsd = allocation.budgetUsd - allocation.spentUsd;
        model.treasuryBalanceUsd += row.amountUsd;
        model.revision++;
        return { ok: true, code: 'ROLLED_BACK' };
      }
      if (action.type !== 'spend-budget') return { ok: false, code: 'UNSUPPORTED_ACTION' };
      const allocation = model.allocations[action.department];
      const amount = Number(action.amountUsd);
      if (!allocation || !(amount > 0)) return { ok: false, code: 'INVALID_EXPENSE' };
      if (amount > allocation.remainingUsd) return { ok: false, code: 'ALLOCATION_LIMIT_EXCEEDED', treasuryBalanceUsd: model.treasuryBalanceUsd };
      if (amount > model.treasuryBalanceUsd) return { ok: false, code: 'INSUFFICIENT_TREASURY', treasuryBalanceUsd: model.treasuryBalanceUsd };
      allocation.spentUsd += amount;
      allocation.remainingUsd = Math.max(0, allocation.budgetUsd - allocation.spentUsd);
      model.treasuryBalanceUsd -= amount;
      model.revision++;
      const transactionId = 'T-' + (++tx);
      model.ledger.push({ transactionId, fiscalYearIndex: model.fiscalYearIndex, action: 'EXPENSE',
        department: action.department, category: action.spendType, amountUsd: amount,
        description: String(action.description || ''), balanceAfterUsd: model.treasuryBalanceUsd });
      globalThis.Game.state.finance.AAA.available = model.treasuryBalanceUsd;
      return { ok: true, code: 'EXPENSE_POSTED', transactionId, treasuryBalanceUsd: model.treasuryBalanceUsd };
    }
  };
  globalThis.OmegaFinanceMinistry = api;
  globalThis.Omega.FinanceMinistry = api;
  return model;
}
function setup(options = {}) {
  const model = mockFinance(options);
  globalThis.Game = { countryId: 'AAA', currentActiveCountry: 'AAA', state: {
    economy: { AAA: { treasury: options.treasury ?? 12_000_000 } },
    finance: { AAA: { available: options.treasury ?? 12_000_000, reserves: 0 } },
    population: { AAA: { population: 1_000_000 } },
    simulation: { turn: 0, simulationTimeMs: 0 }
  } };
  globalThis.CountryIOS = { activeCountry: 'AAA' };
  return model;
}
await import('../omega_home_ministry_engine_v1.js');
const api = globalThis.OmegaHomeMinistryEngine;

test('Home Ministry sub-budgets save as fixed USD or percentages and cannot exceed the Finance ceiling', () => {
  const model = setup();
  const state = api.getState('AAA');
  const plan = {
    personnel: { mode: 'amount', value: 1_000 },
    vehicles: { mode: 'amount', value: 3_000_000 },
    maintenance: { mode: 'amount', value: 4_000_000 },
    facilities: { mode: 'amount', value: 500_000 },
    training: { mode: 'amount', value: 500_000 },
    operations: { mode: 'amount', value: 500_000 }
  };
  const saved = api.setHomeBudgetPlan(plan, 'AAA');
  assert.equal(saved.ok, true);
  assert.equal(saved.snapshot.planTotalUsd, 8_501_000);
  assert.equal(saved.snapshot.categories.vehicles.budgetUsd, 3_000_000);
  assert.equal(api.getState('AAA').homeBudgetPlan.personnel.mode, 'amount');
  const over = { ...plan, operations: { mode: 'amount', value: 2_500_000 } };
  const rejected = api.setHomeBudgetPlan(over, 'AAA');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'HOME_BUDGET_PLAN_EXCEEDS_PARENT_ALLOCATION');
  assert.equal(api.getState('AAA').homeBudgetPlan.operations.value, 500_000);
  assert.equal(model.treasuryBalanceUsd, 12_000_000);
  assert.ok(state);
});

test('recruitment cannot overspend its personnel sub-budget, while a vehicle order uses the vehicle sub-budget', () => {
  const model = setup();
  api.getState('AAA');
  const saved = api.setHomeBudgetPlan({
    personnel: { mode: 'amount', value: 1_000 },
    vehicles: { mode: 'amount', value: 3_000_000 },
    maintenance: { mode: 'amount', value: 4_000_000 },
    facilities: { mode: 'amount', value: 500_000 },
    training: { mode: 'amount', value: 500_000 },
    operations: { mode: 'amount', value: 500_000 }
  }, 'AAA');
  assert.equal(saved.ok, true);
  const countBefore = api.getState('AAA').policeCount;
  const recruitCost = api.estimateRecruitCost(10);
  assert.ok(recruitCost > 1_000);
  const recruitment = api.recruitPolice(10, 'AAA');
  assert.equal(recruitment.ok, false);
  assert.equal(recruitment.reason, 'HOME_BUDGET_CATEGORY_EXCEEDED');
  assert.equal(api.getState('AAA').policeCount, countBefore);
  assert.equal(model.treasuryBalanceUsd, 12_000_000);
  const order = api.orderVehicle(1, 1, 'AAA');
  assert.equal(order.ok, true);
  assert.equal(api.getState('AAA').pendingVehicleOrder.level, 1);
  assert.equal(model.ledger.length, 1);
  assert.match(model.ledger[0].description, /^OMEGA_HOME_BUDGET:vehicles\|VEHICLE_ORDER$/);
  assert.equal(model.allocations.interior.remainingUsd, 10_000_000 - order.cost);
  assert.equal(model.treasuryBalanceUsd, 12_000_000 - order.cost);
});

test('vehicle procurement is blocked when treasury has insufficient cash even if its category budget is sufficient', () => {
  const model = setup({ treasury: 2_000, interior: 10_000_000 });
  api.getState('AAA');
  assert.equal(api.setHomeBudgetPlan({
    personnel: { mode: 'amount', value: 100_000 },
    vehicles: { mode: 'amount', value: 3_000_000 },
    maintenance: { mode: 'amount', value: 4_000_000 },
    facilities: { mode: 'amount', value: 500_000 },
    training: { mode: 'amount', value: 500_000 },
    operations: { mode: 'amount', value: 500_000 }
  }, 'AAA').ok, true);
  const result = api.orderVehicle(1, 1, 'AAA');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INSUFFICIENT_TREASURY');
  assert.equal(api.getState('AAA').pendingVehicleOrder, null);
  assert.equal(model.treasuryBalanceUsd, 2_000);
  assert.equal(model.ledger.length, 0);
});
