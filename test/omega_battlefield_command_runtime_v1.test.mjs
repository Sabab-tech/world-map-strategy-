import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(fileURLToPath(new URL('../countries.json', import.meta.url)));
const readJson = name => JSON.parse(readFileSync(path.join(rootDir, name), 'utf8'));
const countryData = readJson('countries.json');
const cityData = readJson('cities.json');
const populationData = readJson('population.json');
const catalogData = readJson('military_command_catalog_v1.json');
globalThis.window = globalThis;
globalThis.Omega = {};
globalThis.Game = { currentActiveCountry: 'USA', countryId: 'USA', state: {
  economy: {}, finance: {}, population: {}, military: {}, simulation: { turn: 0, simulationTimeMs: 0 }
} };
globalThis.CountryIOS = { activeCountry: 'USA' };
globalThis.fetch = async input => {
  const value = String(input);
  let body;
  if (value.endsWith('countries.json')) body = countryData;
  else if (value.endsWith('cities.json')) body = cityData;
  else if (value.endsWith('population.json')) body = populationData;
  else if (value.endsWith('military_command_catalog_v1.json')) body = catalogData;
  else return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => structuredClone(body) };
};
function financeModel(treasury = 200_000_000_000, defense = 100_000_000_000) {
  const model = { countryCode: 'US', treasuryBalanceUsd: treasury, revision: 0, fiscalYearIndex: 0, ledger: [],
    allocations: { defense: { budgetUsd: defense, spentUsd: 0, remainingUsd: defense } } };
  let tx = 0;
  const api = {
    diagnostics: () => ({ initialized: true }),
    getPlayerCountry: () => ({ countryCode: 'US', name: 'United States' }),
    resolveCountry(value) {
      const raw = String(value || '').toUpperCase();
      const row = countryData.find(item => [item.code, item.iso2, item.iso3, item.name].some(alias => String(alias || '').toUpperCase() === raw));
      return row ? { countryCode: row.iso2 || row.code, countryName: row.name, iso3: row.iso3, name: row.name } : null;
    },
    getFinanceState(value) { return String(value).toUpperCase() === 'US' ? model : null; },
    applyAction(action) {
      if (action.type !== 'spend-budget') return { ok: false, code: 'UNSUPPORTED_ACTION' };
      const amount = Number(action.amountUsd), allocation = model.allocations[action.department];
      if (!allocation || !(amount > 0)) return { ok: false, code: 'INVALID_EXPENSE' };
      if (amount > allocation.remainingUsd) return { ok: false, code: 'ALLOCATION_LIMIT_EXCEEDED', treasuryBalanceUsd: model.treasuryBalanceUsd };
      if (amount > model.treasuryBalanceUsd) return { ok: false, code: 'INSUFFICIENT_TREASURY', treasuryBalanceUsd: model.treasuryBalanceUsd };
      allocation.spentUsd += amount; allocation.remainingUsd -= amount; model.treasuryBalanceUsd -= amount; model.revision++;
      const transactionId = 'MTX-' + (++tx);
      model.ledger.push({ transactionId, fiscalYearIndex: model.fiscalYearIndex, action: 'EXPENSE', department: action.department,
        category: action.spendType, amountUsd: amount, description: action.description, balanceAfterUsd: model.treasuryBalanceUsd });
      return { ok: true, code: 'EXPENSE_POSTED', transactionId, treasuryBalanceUsd: model.treasuryBalanceUsd };
    }
  };
  globalThis.OmegaFinanceMinistry = api;
  globalThis.Omega.FinanceMinistry = api;
  return model;
}
const model = financeModel();
await import('../omega_battlefield_command_runtime_v1.js');
const api = globalThis.OmegaBattlefieldCommand;
const init = await api.init();

test('battlefield runtime loads the canonical country roster and provides urban plus rural cards for every country', () => {
  assert.equal(init.ready, true);
  assert.equal(init.countryCount, countryData.length);
  assert.ok(countryData.length >= 190);
  for (const profile of countryData) {
    const theaters = api.getTheaters(profile.iso3 || profile.code);
    assert.ok(theaters.length >= 4, profile.name + ' should have city/urban and rural theaters');
    assert.ok(theaters.some(row => row.group === 'urban'), profile.name + ' should have an urban/city theater');
    assert.ok(theaters.filter(row => row.group === 'rural').length >= 3, profile.name + ' should have three rural regions');
  }
  assert.equal(api.diagnostics().countryScopedState, true);
});

test('recruitment and procurement are rejected when the corresponding Finance category or treasury is insufficient', () => {
  const profile = api.getPlayerCountry();
  const before = api.getDetailedState(profile.iso3);
  assert.ok(before.personnel > 0);
  const blocked = api.setDefenseBudgetPlan({ personnel: 0, equipment: 80, operations: 20 });
  assert.equal(blocked.ok, true);
  const noSalaryBudget = api.recruit(1);
  assert.equal(noSalaryBudget.ok, false);
  assert.equal(noSalaryBudget.code, 'DEFENSE_CATEGORY_LIMIT_EXCEEDED');
  assert.equal(api.getDetailedState(profile.iso3).personnel, before.personnel);
  const noEquipmentBudget = api.purchase('logistics_truck', 1);
  assert.equal(noEquipmentBudget.ok, true, JSON.stringify(noEquipmentBudget));
  assert.ok(model.ledger.some(row => row.description.includes('OMEGA_MILITARY_BUDGET:equipment|EQUIPMENT_PURCHASE')));
});

test('battle rejects a same-country target and writes a persistent city-specific battle record for a foreign theater', () => {
  const player = api.getPlayerCountry();
  const ownTheater = api.getTheaters(player.iso3)[0];
  const sameCountry = api.startBattle({ targetCountry: player.iso3, theaterId: ownTheater.id, troops: 100 });
  assert.equal(sameCountry.ok, false);
  assert.equal(sameCountry.code, 'BATTLE_TARGET_IS_PLAYER_COUNTRY');

  const target = countryData.find(row => row.iso3 === 'CAN' || row.code === 'CA');
  assert.ok(target);
  const theater = api.getTheaters(target.iso3)[0];
  const playerBefore = api.getDetailedState(player.iso3).personnel;
  const battle = api.startBattle({ targetCountry: target.iso3 || target.code, theaterId: theater.id, troops: Math.min(1000, playerBefore), equipmentCommitmentPct: 25 });
  assert.equal(battle.ok, true, JSON.stringify(battle));
  assert.ok(['ATTACKER_VICTORY', 'DEFENDER_HELD'].includes(battle.battle.outcome));
  assert.equal(battle.battle.theaterId, theater.id);
  assert.ok(Number.isFinite(battle.battle.attackerLosses));
  assert.ok(Number.isFinite(battle.battle.defenderLosses));
  assert.ok(api.getDetailedState(target.iso3).battleLog.some(row => row.id === battle.battle.id));
  assert.equal(api.getDetailedState(player.iso3).personnel, playerBefore - battle.battle.attackerLosses);
});
