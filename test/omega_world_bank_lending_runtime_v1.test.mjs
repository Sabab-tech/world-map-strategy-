import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const runtime = readFileSync('omega_world_bank_lending_runtime_v1.js', 'utf8');

function makeRuntime() {
  const handlers = new Map();
  const fresh = new Date().toISOString();
  const profiles = [
    {
      name: 'Bangladesh', countryCode: 'BGD', iso3: 'BGD', iso2: 'BD', economyKey: 'BANGLADESH',
      profileStatus: 'ACTIVE',
      indicators: { gdpCurrentUsd: 100e9, publicDebtUsd: 45e9, gdpGrowthPct: 5, inflationRatePct: 4,
        unemploymentRatePct: 5, foreignExchangeReservesUsd: 20e9, governmentBudgetBalanceUsd: -1e9 },
      sourceValues: { gdp: 100e9, debt: 45e9, gdp_growth: 5, inflation: 4, reserves: 20e9, budget_balance: -1e9 },
      populationValues: { population_2015: 170e6 }
    },
    {
      name: 'United States', countryCode: 'USA', iso3: 'USA', iso2: 'US', economyKey: 'UNITED_STATES',
      profileStatus: 'ACTIVE',
      indicators: { gdpCurrentUsd: 25e12, publicDebtUsd: 30e12, gdpGrowthPct: 2, inflationRatePct: 3,
        foreignExchangeReservesUsd: 800e9, governmentBudgetBalanceUsd: -1e12 },
      sourceValues: { gdp: 25e12, debt: 30e12, gdp_growth: 2, inflation: 3, reserves: 800e9, budget_balance: -1e12 }
    },
    {
      name: 'Data Gap Territory', countryCode: 'DGT', iso3: 'DGT', iso2: 'DG', economyKey: 'DATA_GAP',
      profileStatus: 'UNAVAILABLE', indicators: { gdpCurrentUsd: null, publicDebtUsd: null },
      sourceValues: {}
    }
  ];
  const state = {
    economy: {
      BANGLADESH: { gdp: 100e9, debt: 45e9, gdp_growth: 5, inflation: 4, reserves: 20e9, budget_balance: -1e9 },
      UNITED_STATES: { gdp: 25e12, debt: 30e12, gdp_growth: 2, inflation: 3, reserves: 800e9, budget_balance: -1e12 },
      DATA_GAP: {}
    },
    finance: {
      BGD: { available: 1e9, omegaFinance: { treasuryBalanceUsd: 1e9, policy: { interestRateAnnualPct: 3 }, fiscalModel: { annualBudgetBalanceUsd: -1e9 } } },
      USA: { available: 5e12, omegaFinance: { treasuryBalanceUsd: 5e12, policy: { interestRateAnnualPct: 3 }, fiscalModel: { annualBudgetBalanceUsd: -1e12 } } },
      DGT: { available: 0, omegaFinance: { treasuryBalanceUsd: 0, policy: { interestRateAnnualPct: 3 }, fiscalModel: {} } }
    },
    simulation: { turn: 1, session: { playerCountryId: 'BGD' } },
    governmentBanking: {
      worldBankLending: {
        reference: {
          provider: 'WORLD_BANK_WDI_V2', status: 'LIVE', refreshedAt: fresh, countries: {
            BGD: {
              countryCode: 'BGD', iso3: 'BGD', iso2: 'BD',
              data: {
                gdpUsd: { value: 100e9, year: 2024 },
                gdpGrowthPct: { value: 5, year: 2024 },
                inflationPct: { value: 4, year: 2024 },
                unemploymentPct: { value: 5, year: 2024 },
                publicDebtPctGdp: { value: 45, year: 2024 },
                population: { value: 170e6, year: 2024 },
                reservesUsd: { value: 20e9, year: 2024 }
              },
              metadata: { incomeLevel: { id: 'LMC', value: 'Lower middle income' }, lendingType: { id: 'IDA', value: 'IDA' }, region: { id: 'SAS', value: 'South Asia' } }
            },
            USA: {
              countryCode: 'USA', iso3: 'USA', iso2: 'US',
              data: {
                gdpUsd: { value: 25e12, year: 2024 }, gdpGrowthPct: { value: 2, year: 2024 },
                inflationPct: { value: 3, year: 2024 }, publicDebtPctGdp: { value: 120, year: 2024 },
                reservesUsd: { value: 800e9, year: 2024 }
              },
              metadata: { incomeLevel: { id: 'HIC', value: 'High income' }, lendingType: { id: 'IBD', value: 'IBRD' }, region: { id: 'NAC', value: 'North America' } }
            },
            DGT: { countryCode: 'DGT', iso3: 'DGT', iso2: 'DG', data: {}, metadata: {} }
          },
          indicatorStatus: {}
        }
      }
    }
  };
  const byCode = new Map(profiles.flatMap(p => [[p.countryCode, p], [p.iso3, p], [p.iso2, p], [p.name, p]]));
  const finance = {
    init: async () => ({ initialized: true }),
    getProfiles: () => profiles,
    resolveCountry(value) {
      if (value && typeof value === 'object') value = value.countryCode || value.iso3 || value.iso2 || value.name;
      return byCode.get(String(value || '').toUpperCase()) || byCode.get(String(value || '')) || null;
    },
    getPlayerCountry: () => profiles[0],
    getIndicators(value) {
      const p = this.resolveCountry(value);
      return p ? p.indicators : null;
    },
    getFinanceState(value) {
      const p = this.resolveCountry(value);
      return p && state.finance[p.iso3] ? state.finance[p.iso3].omegaFinance : null;
    },
    applyAction(action) {
      const p = this.resolveCountry(action.countryId);
      if (!p) return { ok: false, code: 'COUNTRY_NOT_FOUND' };
      if (p.countryCode !== 'BGD') return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION' };
      if (action.type !== 'borrow') return { ok: false, code: 'UNKNOWN_FINANCE_ACTION' };
      const e = state.economy[p.economyKey];
      const amount = Number(action.amountUsd);
      if (!(amount > 0) || amount > e.gdp * 0.05) return { ok: false, code: 'LOAN_TRANSACTION_LIMIT' };
      if (e.debt + amount > e.gdp * 3) return { ok: false, code: 'DEBT_CEILING_REACHED' };
      e.debt += amount;
      state.finance[p.iso3].available += amount;
      state.finance[p.iso3].omegaFinance.treasuryBalanceUsd += amount;
      return { ok: true, code: 'BORROW_POSTED', treasuryBalanceUsd: state.finance[p.iso3].available };
    }
  };
  const context = {
    console, Date, Math, Number, String, Object, Array, Map, Set, Promise, JSON, Intl,
    OmegaFinanceMinistry: finance,
    Omega: { Simulation: { world: { state }, getPlayerCountryId: () => 'BGD' } },
    gameState: state,
    addEventListener(type, fn) {
      handlers.set(type, [...(handlers.get(type) || []), fn]);
    },
    dispatchEvent(event) {
      for (const fn of handlers.get(event.type) || []) fn(event);
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    fetch: async () => { throw new Error('network intentionally disabled by unit test'); }
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(runtime, context, { filename: 'omega_world_bank_lending_runtime_v1.js' });
  return { context, state, finance, profiles };
}

test('country assessments use source facts, lower confidence for missing fields and calculate separate country limits', async () => {
  const { context } = makeRuntime();
  const ready = await context.OmegaWorldBankLending.init();
  assert.equal(ready.initialized, true);
  assert.equal(ready.profileCount, 3);
  const bangladesh = context.OmegaWorldBankLending.assessCountry('BGD');
  assert.ok(bangladesh.score >= 72);
  assert.equal(bangladesh.program, 'IDA');
  assert.equal(bangladesh.debtToGdpPct, 45);
  assert.ok(bangladesh.maxLoanUsd > 0);
  assert.ok(bangladesh.maxLoanUsd <= 2.5e9);
  assert.equal(bangladesh.sourceYears.gdpUsd, 2024);
  const unknown = context.OmegaWorldBankLending.assessCountry('DGT');
  assert.equal(unknown.decision, 'DATA_INSUFFICIENT');
  assert.equal(unknown.maxLoanUsd, 0);
  const report = context.OmegaWorldBankLending.evaluateAll();
  assert.equal(report.countriesAssessed, 3);
});

test('loan requests require active player, respect the assessed cap and are idempotent', async () => {
  const { context, state } = makeRuntime();
  const api = context.OmegaWorldBankLending;
  await api.init();
  const beforeDebt = state.economy.BANGLADESH.debt;
  const first = api.requestLoan({ countryId: 'BGD', amountUsd: 500e6, purpose: 'infrastructure', requestId: 'test-application-1' });
  assert.equal(first.ok, true);
  assert.equal(first.loan.originalPrincipalUsd, 500e6);
  assert.equal(first.loan.status, 'ACTIVE');
  assert.equal(state.economy.BANGLADESH.debt, beforeDebt + 500e6);
  assert.ok(state.finance.BGD.available > 1e9);
  const duplicate = api.requestLoan({ countryId: 'BGD', amountUsd: 500e6, purpose: 'infrastructure', requestId: 'test-application-1' });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(state.economy.BANGLADESH.debt, beforeDebt + 500e6);
  const mismatch = api.requestLoan({ countryId: 'BGD', amountUsd: 400e6, purpose: 'infrastructure', requestId: 'test-application-1' });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
  const tooLarge = api.requestLoan({ countryId: 'BGD', amountUsd: 9e9, purpose: 'infrastructure', requestId: 'test-application-large' });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.code, 'WORLD_BANK_AMOUNT_OUT_OF_RANGE');
  const foreign = api.requestLoan({ countryId: 'USA', amountUsd: 100e6, requestId: 'foreign-loan' });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.code, 'PLAYER_COUNTRY_SCOPE_VIOLATION');
  assert.equal(api.getLoans('BGD').length, 1);
});

test('contract interest accrues once per turn and scheduled debt service reduces the balance', async () => {
  const { context } = makeRuntime();
  const api = context.OmegaWorldBankLending;
  await api.init();
  const issue = api.requestLoan({ countryId: 'BGD', amountUsd: 500e6, requestId: 'test-interest-loan' });
  assert.equal(issue.ok, true);
  const accrued = api.accrueInterest('BGD', 1 / 365, 2);
  assert.ok(accrued > 0);
  assert.equal(api.accrueInterest('BGD', 1 / 365, 2), 0, 'same turn must not accrue interest twice');
  const early = api.serviceDebt('BGD', 1 / 365, 1e9, 100e9, 2);
  assert.equal(early.ok, true);
  assert.ok(early.paidUsd > 0);
  const loan = api.getLoans('BGD')[0];
  assert.ok(loan.accruedInterestUsd < accrued + 1e-3);
  loan.ageYears = 6;
  loan.graceYears = 0;
  const priorPrincipal = loan.outstandingPrincipalUsd;
  api.accrueInterest('BGD', 1, 3);
  const regular = api.serviceDebt('BGD', 1, 10e9, 100e9, 3);
  assert.equal(regular.ok, true);
  assert.ok(regular.paidUsd > 0);
  assert.ok(loan.outstandingPrincipalUsd < priorPrincipal);
  assert.ok(api.getOutstandingBalance('BGD') > 0);
});

test('failed live refresh preserves the last valid World Bank observations and exposes offline status', async () => {
  const { context } = makeRuntime();
  const api = context.OmegaWorldBankLending;
  await api.init();
  const before = api.getState().reference.countries.BGD.data.gdpUsd;
  const refreshed = await api.refreshWorldBankData(true);
  assert.equal(refreshed.ok, false);
  assert.equal(refreshed.status, 'OFFLINE_STALE');
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getState().reference.countries.BGD.data.gdpUsd)),
    JSON.parse(JSON.stringify(before))
  );
  assert.equal(api.assessCountry('BGD').gdpUsd, 100e9);
});
