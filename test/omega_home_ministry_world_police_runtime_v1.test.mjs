import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dataPath = fileURLToPath(new URL('../omega_home_ministry_country_police_baseline_v1.json', import.meta.url));
const baselineData = JSON.parse(readFileSync(dataPath, 'utf8'));
const populationRows = baselineData.countries.filter(row => Number(row.population?.value) > 0);
const observedHomicideRows = baselineData.countries.filter(row => Number.isFinite(Number(row.crime?.observedHomicide?.ratePer100k)));
const vehicleTypes = baselineData.vehicles;
const events = new Map();
globalThis.window = globalThis;
globalThis.Omega = {};
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail || null; } };
globalThis.addEventListener = (type, fn) => { const rows = events.get(type) || []; rows.push(fn); events.set(type, rows); };
globalThis.dispatchEvent = event => { for (const fn of events.get(event.type) || []) fn(event); return true; };
globalThis.updateGlobalResourceHUD = () => {};
globalThis.Game = { countryId: 'BD', currentActiveCountry: 'BD', state: {
  economy: { BD: { treasury: 12_000_000, gdp: 250_000_000_000 } },
  finance: { BD: { available: 12_000_000, reserves: 0 } },
  population: { BD: { population: baselineData.countries.find(row => row.iso3 === 'BGD').population.value } },
  simulation: { turn: 0, simulationTimeMs: 0 }
} };
globalThis.CountryIOS = { activeCountry: 'BD' };

const financeModel = {
  countryCode: 'BD', treasuryBalanceUsd: 12_000_000, revision: 0, fiscalYearIndex: 0, ledger: [],
  allocations: {
    interior: { budgetUsd: 10_000_000, spentUsd: 0, remainingUsd: 10_000_000 },
    defense: { budgetUsd: 10_000_000, spentUsd: 0, remainingUsd: 10_000_000 }
  }
};
let transactionSequence = 0;
const financeApi = {
  diagnostics: () => ({ initialized: true }),
  getPlayerCountry: () => ({ countryCode: 'BD', name: 'Bangladesh', iso3: 'BGD' }),
  resolveCountry(value) {
    const raw = String(value || '').toUpperCase().replace(/[\s_-]+/g, '');
    const row = baselineData.countries.find(item =>
      [item.code, item.iso2, item.iso3, item.name].some(alias => String(alias || '').toUpperCase().replace(/[\s_-]+/g, '') === raw));
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
    const allocation = financeModel.allocations[action.department];
    const amount = Number(action.amountUsd);
    if (!allocation || !(amount > 0)) return { ok: false, code: 'INVALID_EXPENSE' };
    if (amount > allocation.remainingUsd + 0.01) return { ok: false, code: 'ALLOCATION_LIMIT_EXCEEDED', treasuryBalanceUsd: financeModel.treasuryBalanceUsd };
    if (amount > financeModel.treasuryBalanceUsd + 0.01) return { ok: false, code: 'INSUFFICIENT_TREASURY', treasuryBalanceUsd: financeModel.treasuryBalanceUsd };
    allocation.spentUsd += amount;
    allocation.remainingUsd = Math.max(0, allocation.budgetUsd - allocation.spentUsd);
    financeModel.treasuryBalanceUsd -= amount;
    financeModel.revision++;
    const transactionId = 'POL-' + (++transactionSequence);
    financeModel.ledger.push({ transactionId, fiscalYearIndex: financeModel.fiscalYearIndex,
      action: 'EXPENSE', department: action.department, category: action.spendType,
      amountUsd: amount, description: String(action.description || ''), balanceAfterUsd: financeModel.treasuryBalanceUsd });
    globalThis.Game.state.finance.BD.available = financeModel.treasuryBalanceUsd;
    return { ok: true, code: 'EXPENSE_POSTED', transactionId, treasuryBalanceUsd: financeModel.treasuryBalanceUsd };
  }
};
globalThis.OmegaFinanceMinistry = financeApi;
globalThis.Omega.FinanceMinistry = financeApi;
await import('../omega_home_ministry_engine_v1.js');
const engine = globalThis.OmegaHomeMinistryEngine;

test('world police baseline covers the full country registry with provenance-separated population and homicide rows', () => {
  assert.equal(baselineData.schemaVersion, '1.0.0');
  assert.equal(baselineData.countries.length, 249);
  assert.equal(vehicleTypes.length, 15);
  assert.ok(populationRows.length >= 210);
  assert.ok(observedHomicideRows.length >= 180);
  assert.ok(baselineData.countries.every(row => row.baselinePolice?.source === 'MODELED_POLICY_BASELINE_NOT_OBSERVED_ROSTER'));
  assert.ok(baselineData.countries.every(row => Object.values(row.crime.rateSources).every(source =>
    source === 'MODELED_SIMULATION_BASELINE' || source.startsWith('WORLD_BANK_'))));
  assert.ok(baselineData.countries.every(row => Object.values(row.baselineFleet.countsByTier).reduce((sum,n)=>sum+Number(n),0) === row.baselineFleet.totalUnits));
  const bangladesh = baselineData.countries.find(row => row.iso3 === 'BGD');
  assert.ok(bangladesh.population.year >= 2020);
  assert.equal(bangladesh.population.source, 'WORLD_BANK_LATEST_AVAILABLE');
  assert.equal(bangladesh.crime.observedHomicide.source, 'WORLD_BANK_VC.IHR.PSRC.P5');
  assert.ok(Object.values(bangladesh.baselineFleet.countsByTier).reduce((sum,n)=>sum+Number(n),0) > 0);
});

test('country-aware modeled police fleet baseline has diverse mixes and transparent island estimates', () => {
  const uniqueFleetMixes = new Set(baselineData.countries.map(row => JSON.stringify(row.baselineFleet.countsByTier)));
  assert.ok(uniqueFleetMixes.size > 200, 'Country-aware vehicle mixes must not collapse into a small shared default catalogue.');
  for (const code of ['BM', 'MF', 'VG']) {
    const row = baselineData.countries.find(country => country.code === code);
    assert.ok(row, code + ': country baseline must exist');
    assert.match(row.baselineFleet.modelNote || '', /^MODELED_ESTIMATE_NOT_OBSERVED_ROSTER:/,
      code + ': modeled fleet adjustments must remain clearly distinct from an observed police roster');
    assert.equal(Object.values(row.baselineFleet.countsByTier).reduce((sum, count) => sum + Number(count), 0),
      row.baselineFleet.totalUnits, code + ': modeled fleet totals must reconcile');
    assert.equal(row.fleetProfile.baselineFleetAdjustment.observed, false);
  }
});

test('baseline bootstrap seeds every country once, preserves a country opening fleet and produces a baseline crime index of 100', () => {
  const result = engine.bootstrapCountryPoliceBaselines(baselineData.countries);
  assert.equal(result.ok, true);
  assert.equal(result.countryCount, 249);
  assert.ok(result.seededCountries >= 240);
  assert.equal(globalThis.Game.state.interior.BD.police.baselineVersion, 1);
  assert.equal(Object.keys(globalThis.Game.state.interior).length >= 249, true);
  const bangladesh = baselineData.countries.find(row => row.iso3 === 'BGD');
  const s = engine.getState('BD');
  assert.equal(s.policeCount, bangladesh.baselinePolice.activePersonnel);
  assert.deepEqual(Object.fromEntries(Object.entries(s.vehiclesOwned).map(([k,v])=>[k,Number(v)])), bangladesh.baselineFleet.countsByTier);
  const crime = engine.getCrimeSnapshot('BD');
  assert.equal(crime.available, true);
  assert.equal(crime.baselineCrimeIndex, 100);
  assert.equal(crime.projectedCrimeIndex, 100);
  assert.equal(crime.population, bangladesh.population.value);
  assert.equal(crime.categories.homicide.observed, true);
  assert.equal(crime.categories.theft.observed, false);
  assert.equal(crime.categories.theft.source, 'MODELED_SIMULATION_BASELINE');
});

test('hiring impact is calculated from population, current skill and current vehicle mix; hiring really charges Finance', () => {
  engine.bootstrapCountryPoliceBaselines(baselineData.countries);
  const before = engine.getCrimeSnapshot('BD');
  const quote = engine.estimateRecruitmentImpact(100, 'BD');
  assert.equal(quote.ok, true);
  assert.ok(quote.upfrontCostUsd > 0);
  assert.ok(quote.addedDailyPayrollUsd > 0);
  assert.ok(quote.additionalIncidentsAvoidedPerYear > 0);
  const countBefore = engine.getState('BD').policeCount;
  const cashBefore = financeModel.treasuryBalanceUsd;
  const result = engine.recruitPolice(100, 'BD');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(engine.getState('BD').policeCount, countBefore + 100);
  assert.equal(financeModel.treasuryBalanceUsd, cashBefore - quote.upfrontCostUsd);
  assert.match(financeModel.ledger.at(-1).description, /^OMEGA_HOME_BUDGET:personnel\|POLICE_RECRUITMENT$/);
  const after = engine.getCrimeSnapshot('BD');
  assert.ok(after.projectedAnnualIncidentEstimate < before.projectedAnnualIncidentEstimate);
});

test('patrol plan and active police rules change crime outputs, satisfaction and real Finance ledger', () => {
  engine.bootstrapCountryPoliceBaselines(baselineData.countries);
  const before = engine.getCrimeSnapshot('BD');
  const plan = { urban: 42, rural: 2, highway: 10, border: 10, drugs: 10, investigations: 8, cyber: 4, community: 14 };
  const patrol = engine.setPatrolPlan(plan, 'BD');
  assert.equal(patrol.ok, true);
  const afterPatrol = engine.getCrimeSnapshot('BD');
  assert.ok(afterPatrol.categories.theft.projectedRatePer100k < before.categories.theft.projectedRatePer100k);
  const cashBefore = financeModel.treasuryBalanceUsd;
  const policy = engine.setPolicePolicyRule('body_camera_audit', true, 'BD');
  assert.equal(policy.ok, true, JSON.stringify(policy));
  assert.equal(engine.getState('BD').policeRules.body_camera_audit, true);
  assert.equal(engine.getState('BD').publicSatisfaction, 61);
  assert.ok(engine.getState('BD').misconductRiskPct < 20);
  assert.equal(financeModel.treasuryBalanceUsd, cashBefore - 180_000);
  assert.match(financeModel.ledger.at(-1).description, /^OMEGA_HOME_BUDGET:operations\|POLICE_POLICY_BODY_CAMERA_AUDIT$/);
});

test('selected country police data follows the shared view context without permitting foreign mutations', () => {
  engine.bootstrapCountryPoliceBaselines(baselineData.countries);
  globalThis.OmegaMinistryViewCountry = 'NG';
  const expected = baselineData.countries.find(row => row.iso3 === 'NGA');
  assert.equal(engine.getCurrentCountryId(), 'NG');
  const state = engine.getState();
  assert.equal(state.baselinePolicePersonnel, expected.baselinePolice.activePersonnel);
  assert.equal(engine.getCrimeSnapshot().countryId, 'NG');

  const before = engine.getState('NG').policeCount;
  const result = engine.recruitPolice(1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'PLAYER_COUNTRY_SCOPE_VIOLATION');
  assert.equal(engine.getState('NG').policeCount, before);
  delete globalThis.OmegaMinistryViewCountry;
});

test('insufficient treasury rejects police recruitment and preserves both headcount and Finance balance', () => {
  engine.bootstrapCountryPoliceBaselines(baselineData.countries);
  const beforeHeadcount = engine.getState('BD').policeCount;
  const beforeCash = financeModel.treasuryBalanceUsd;
  financeModel.treasuryBalanceUsd = 1_000;
  globalThis.Game.state.finance.BD.available = 1_000;
  const result = engine.recruitPolice(100, 'BD');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INSUFFICIENT_TREASURY');
  assert.equal(engine.getState('BD').policeCount, beforeHeadcount);
  assert.equal(financeModel.treasuryBalanceUsd, 1_000);
  financeModel.treasuryBalanceUsd = beforeCash;
  globalThis.Game.state.finance.BD.available = beforeCash;
});
