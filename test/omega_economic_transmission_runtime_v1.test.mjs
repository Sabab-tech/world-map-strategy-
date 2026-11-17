import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync('omega_economic_transmission_runtime_v1.js', 'utf8');
const rules = JSON.parse(readFileSync('financial_transmission_rules_v1.json', 'utf8'));

function makeRuntime() {
  let simulationDay = 0;
  const profiles = [
    { name: 'Bangladesh', countryCode: 'BD', iso2: 'BD', iso3: 'BGD', economyKey: 'BANGLADESH',
      profileStatus: 'AVAILABLE',
      sourceValues: { currency_code: 'BDT', currency_name: 'Bangladeshi Taka' },
      indicators: { gdpCurrentUsd: 1_000_000_000, gdpGrowthPct: 4, inflationRatePct: 10,
        unemploymentRatePct: 8, publicDebtUsd: 500_000_000, tradeBalanceUsd: -100_000_000,
        foreignExchangeReservesUsd: 200_000_000 } },
    { name: 'Nigeria', countryCode: 'NG', iso2: 'NG', iso3: 'NGA', economyKey: 'NIGERIA',
      profileStatus: 'AVAILABLE',
      sourceValues: { currency_code: 'NGN', currency_name: 'Nigerian naira' },
      indicators: { gdpCurrentUsd: 800_000_000, gdpGrowthPct: 2, inflationRatePct: 20,
        unemploymentRatePct: 10, publicDebtUsd: 600_000_000, tradeBalanceUsd: 120_000_000,
        foreignExchangeReservesUsd: 180_000_000 } },
    { name: 'United States', countryCode: 'US', iso2: 'US', iso3: 'USA', economyKey: 'UNITED_STATES',
      profileStatus: 'AVAILABLE',
      sourceValues: { currency_code: 'USD', currency_name: 'United States dollar' },
      indicators: { gdpCurrentUsd: 20_000_000_000, gdpGrowthPct: 2, inflationRatePct: 3,
        unemploymentRatePct: 4, publicDebtUsd: 10_000_000_000, tradeBalanceUsd: -900_000_000,
        foreignExchangeReservesUsd: 1_000_000_000 } }
  ];
  const state = {
    simulation: { turn: 0, playerCountryId: 'BGD' },
    economy: {
      BANGLADESH: { gdp: 1_000_000_000, gdp_growth: 4, inflation: 10,
        debt: 500_000_000, trade_balance: -100_000_000, reserves: 200_000_000 },
      NIGERIA: { gdp: 800_000_000, gdp_growth: 2, inflation: 20,
        debt: 600_000_000, trade_balance: 120_000_000, reserves: 180_000_000 },
      UNITED_STATES: { gdp: 20_000_000_000, gdp_growth: 2, inflation: 3,
        debt: 10_000_000_000, trade_balance: -900_000_000, reserves: 1_000_000_000 }
    },
    finance: {
      BGD: { available: 500_000_000 },
      NGA: { available: 300_000_000 },
      USA: { available: 5_000_000_000 }
    }
  };
  const byId = new Map();
  for (const p of profiles) for (const key of [p.name, p.countryCode, p.iso2, p.iso3, p.economyKey]) byId.set(String(key).toUpperCase(), p);
  const finance = {
    VERSION: 'TEST_FINANCE',
    init: async () => ({ initialized: true }),
    getProfiles: () => profiles,
    getPlayerCountry: () => profiles[0],
    resolveCountry: value => byId.get(String(value || '').toUpperCase()) || null,
    getFinanceState: value => {
      const p = finance.resolveCountry(value);
      const row = p && state.finance[p.iso3];
      return row ? { treasuryBalanceUsd: row.available, available: row.available,
        policy: { interestRateAnnualPct: 8 }, fiscalModel: { annualSpendingUsd: 100_000_000 } } : null;
    }
  };
  const rates = { USD: 1, BDT: 100, NGN: 1_000 };
  const policies = {
    BDT: { inflationTargetPct: 4, moneySupplyGrowthPct: 12, interestRateAnnualPct: 5, currencyRegime: 'FLOAT' },
    NGN: { inflationTargetPct: 6, moneySupplyGrowthPct: 18, interestRateAnnualPct: 12, currencyRegime: 'MANAGED_FLOAT' },
    USD: { inflationTargetPct: 2, moneySupplyGrowthPct: 4, interestRateAnnualPct: 4, currencyRegime: 'FLOAT' }
  };
  const fx = {
    VERSION: 'TEST_FX',
    init: async () => ({ initialized: true }),
    getRate: code => rates[String(code || '').toUpperCase()] ?? null,
    getCurrencyCode: p => p && p.sourceValues && p.sourceValues.currency_code || null,
    getPolicy: code => policies[String(code || '').toUpperCase()] || {},
    getState: () => ({ simulationDay }),
    math: {
      computeAnnualDrift: input => {
        const local = Number(input.localInflationPct) || 0;
        const foreign = Number(input.usInflationPct) || 0;
        return Math.max(-60, Math.min(120,
          (local - foreign) * 0.9 - ((Number(input.localPolicyRatePct) || 0) - (Number(input.usPolicyRatePct) || 0)) * 0.22
          - (Number(input.localGrowthPct) || 0) * 0.1
          - (Number(input.tradeBalanceToGdpPct) || 0) * 0.035
          + Math.max(0, (Number(input.debtToGdpPct) || 0) - 60) * 0.012
          - Math.max(0, (Number(input.reservesToGdpPct) || 0) - 10) * 0.012
          + (Number(input.moneySupplyGrowthPct) || 0) * 0.1
          - (Number(input.capitalFlowToGdpPct) || 0) * 0.08
          + Math.max(0, 50 - (Number(input.confidenceIndex) || 50)) * 0.10
          + Math.max(0, 3 - (Number(input.reserveCoverMonths) || 3)) * 1.8
          + Math.max(0, Number(input.pegAttackPressurePct) || 0) * 0.25));
      }
    }
  };
  const macro = {
    VERSION: 'TEST_MACRO',
    init: async () => ({ initialized: true }),
    getRawProfile: () => null,
    getIndicators: () => null,
    getMacroState: () => ({ targetInflationPct: 3 })
  };
  const eventHandlers = new Map();
  const scheduledHandlers = new Map();
  const scheduler = {
    registerCountryHandler(id, handler, options = {}) {
      scheduledHandlers.set(id, { handler, options });
      return () => scheduledHandlers.delete(id);
    }
  };
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    addEventListener(type, handler) {
      eventHandlers.set(type, [...(eventHandlers.get(type) || []), handler]);
    },
    dispatchEvent(event) {
      for (const handler of eventHandlers.get(event.type) || []) handler(event);
      return true;
    },
    fetchResilient: async () => rules
  });
  context.gameState = state;
  context.Game = { state };
  context.OmegaFinanceMinistry = finance;
  context.OmegaForexMonetaryEngine = fx;
  context.OmegaMacroStabilityRuntime = macro;
  context.OmegaWorldSimulationScheduler = scheduler;
  vm.runInContext(source, context, { filename: 'omega_economic_transmission_runtime_v1.js' });
  return { context, state, profiles, fx, rates, scheduler: scheduledHandlers, eventHandlers, setDay: d => { simulationDay = d; }, engine: context.OmegaEconomicTransmissionRuntime };
}

test('turn advancement computes real wages, CPI and producer/import costs with tagged assumptions', async () => {
  const r = makeRuntime();
  await r.engine.init();
  r.setDay(1);
  const first = r.engine.advanceTurn(1, 31536000000);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.processed, 3);
  const bg = r.engine.getLatest('BGD');
  assert.ok(bg.cpiIndex > 100);
  assert.ok(bg.realWageIndex < 100);
  assert.ok(bg.importCostIndex > 100);
  assert.ok(bg.producerCostIndex > 100);
  assert.equal(bg.wageGrowthSource, 'MODEL_ASSUMPTION_GDP_GROWTH_PROXY');
  assert.ok(bg.assumptions.some(x => String(x).toLowerCase().includes('wage growth estimated')));
  assert.equal(bg.provenance.sourceFacts.importExposure, 'MODEL_ASSUMPTION_DEFAULT_IMPORT_EXPOSURE');
  assert.ok(r.engine.getProducerCostMultiplier('BGD') > 1);
  assert.ok(r.engine.getHouseholdPurchasingPowerMultiplier('BGD') < 1);
  assert.ok(r.engine.getHistory('BGD').length >= 1);
});

test('depreciation feeds import-cost index and repeat turn calls cannot compound twice', async () => {
  const r = makeRuntime();
  await r.engine.init();
  r.setDay(1);
  const one = r.engine.advanceTurn(1, 31536000000);
  assert.equal(one.ok, true);
  const afterOne = r.engine.getLatest('BGD');
  r.rates.BDT = 120;
  r.setDay(2);
  const two = r.engine.advanceTurn(2, 31536000000);
  assert.equal(two.ok, true);
  const afterTwo = r.engine.getLatest('BGD');
  assert.ok(afterTwo.depreciationAnnualPct > 19.9);
  assert.ok(afterTwo.importCostIndex > afterOne.importCostIndex);
  assert.equal(r.engine.getHistory('BGD').length, 2);
  const again = r.engine.advanceTurn(2, 31536000000);
  assert.equal(again.duplicate, true);
  assert.equal(r.engine.getHistory('BGD').length, 2);
});

test('transmission advances only scheduler-selected countries, allows same-turn country peers and aggregates projections after commit', async () => {
  const r = makeRuntime();
  await r.engine.init();
  r.setDay(1);
  const registered = r.scheduler.get('omega-economic-transmission');
  assert.ok(registered, 'Economic Transmission must register with the world country scheduler');
  assert.deepEqual(Array.from(registered.options.tiers), ['PLAYER', 'ACTIVE', 'MACRO']);
  const duration = 86400000;
  const bgd = await registered.handler('BGD', { turn: 7, stepDurationMs: duration, tier: 'PLAYER' });
  assert.equal(bgd.processed, 1, JSON.stringify(bgd));
  const nga = await registered.handler('NGA', { turn: 7, stepDurationMs: duration, tier: 'MACRO' });
  assert.equal(nga.processed, 1, JSON.stringify(nga));
  assert.ok(r.engine.getLatest('BGD'));
  assert.ok(r.engine.getLatest('NGA'));
  const bgdHistory = r.engine.getHistory('BGD').length;
  const replay = await registered.handler('BGD', { turn: 7, stepDurationMs: duration, tier: 'PLAYER' });
  assert.equal(replay.processed, 0);
  assert.equal(replay.duplicate, true);
  assert.equal(r.engine.getHistory('BGD').length, bgdHistory);
  assert.equal(r.state.finance.monetaryStressByCurrency, undefined);
  r.context.__OMEGA_SIMULATION_PIPELINE_DISPATCH__ = true;
  r.context.dispatchEvent({ type: 'OMEGA_SIMULATION_TURN_COMMITTED', detail: { turn: 7 } });
  r.context.__OMEGA_SIMULATION_PIPELINE_DISPATCH__ = false;
  assert.ok(r.state.finance.monetaryStressByCurrency);
  assert.ok(r.state.finance.monetaryStressByCurrency.BDT);
  assert.ok(r.state.finance.monetaryStressByCurrency.NGN);
  assert.equal(r.engine.getHistory('BGD').length, bgdHistory, 'post-turn aggregation must not replay country progression');
});

test('currency stress aggregate and counterfactual scenarios are transparent and non-mutating', async () => {
  const r = makeRuntime();
  await r.engine.init();
  r.setDay(1);
  assert.equal(r.engine.advanceTurn(1, 31536000000).ok, true);
  const bankBefore = JSON.stringify(r.state.finance);
  const rateBefore = r.fx.getRate('BDT', 'SIMULATION');
  const capitalFlight = r.engine.runStressScenario({ countryCode: 'BGD', scenario: 'capital-flight', years: 1 });
  const tradeSurplus = r.engine.runStressScenario({ countryCode: 'BGD', scenario: 'trade-surplus', years: 1 });
  assert.equal(capitalFlight.ok, true);
  assert.equal(tradeSurplus.ok, true);
  assert.ok(capitalFlight.annualFxPressurePct > tradeSurplus.annualFxPressurePct);
  assert.equal(capitalFlight.assumption, 'COUNTERFACTUAL_GAME_MODEL_ONLY_NO_STATE_MUTATION');
  assert.equal(r.fx.getRate('BDT', 'SIMULATION'), rateBefore);
  assert.equal(JSON.stringify(r.state.finance), bankBefore);
  assert.ok(r.engine.diagnostics().currencyStressCount >= 2);
});

test('unknown GDP remains unavailable instead of generating an invented country model', async () => {
  const r = makeRuntime();
  r.profiles[0].indicators.gdpCurrentUsd = null;
  r.state.economy.BANGLADESH.gdp = null;
  // Keep a copy of the existing macro registry null; this runtime does not fabricate GDP.
  await r.engine.init();
  r.setDay(1);
  const result = r.engine.advanceTurn(1, 86400000);
  assert.equal(result.ok, true);
  assert.equal(r.engine.getLatest('BGD'), null);
});
