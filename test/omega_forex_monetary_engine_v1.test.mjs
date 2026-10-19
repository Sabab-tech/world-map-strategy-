import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync('omega_forex_monetary_engine_v1.js', 'utf8');
const context = vm.createContext({ console });
vm.runInContext(source, context, { filename: 'omega_forex_monetary_engine_v1.js' });
const engine = context.OmegaForexMonetaryEngine;

test('FX extension exposes its public API without requiring a browser DOM', () => {
  assert.ok(engine);
  assert.equal(engine.VERSION, '1.0.0');
  assert.equal(typeof engine.init, 'function');
  assert.equal(typeof engine.convert, 'function');
  assert.equal(typeof engine.simulationTick, 'function');
  assert.equal(typeof engine.syncGovernmentBanking, 'function');
});

test('cross-currency settlement routes source and destination through USD', () => {
  const result = engine.math.calculateConversion(
    12000, 'BDT', 'NGN', { USD: 1, BDT: 120, NGN: 1500 }, 15
  );
  assert.equal(result.ok, true);
  assert.equal(result.route, 'SOURCE_TO_USD_TO_TARGET');
  assert.equal(result.usdNotional, 100);
  assert.equal(result.crossRate, 12.5);
  assert.equal(result.grossTarget, 150000);
  assert.equal(result.feeUsd, 0.15);
  assert.equal(result.amountTarget, 149775);
});

test('same-currency conversion still applies the published modeled clearing fee', () => {
  const result = engine.math.calculateConversion(
    1000, 'BDT', 'BDT', { USD: 1, BDT: 100 }, 15
  );
  assert.equal(result.ok, true);
  assert.equal(result.amountTarget, 998.5);
  assert.equal(result.crossRate, 1);
});

test('conversion refuses unknown currency rates rather than inventing a quote', () => {
  const result = engine.math.calculateConversion(
    100, 'BDT', 'NGN', { USD: 1, BDT: 120 }, 15
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'TARGET_RATE_UNAVAILABLE');
});

test('higher relative inflation increases modeled depreciation pressure', () => {
  const base = {
    localInflationPct: 3, usInflationPct: 2,
    localPolicyRatePct: 3, usPolicyRatePct: 3,
    localGrowthPct: 2, usGrowthPct: 2,
    tradeBalanceToGdpPct: 0, debtToGdpPct: 60,
    reservesToGdpPct: 10, moneySupplyGrowthPct: 0, shockPct: 0
  };
  const highInflation = engine.math.computeAnnualDrift({ ...base, localInflationPct: 12 });
  const lowInflation = engine.math.computeAnnualDrift({ ...base, localInflationPct: 1 });
  assert.ok(highInflation > lowInflation);
});

test('a higher domestic policy rate, holding other variables equal, reduces depreciation pressure', () => {
  const base = {
    localInflationPct: 8, usInflationPct: 2,
    localPolicyRatePct: 3, usPolicyRatePct: 3,
    localGrowthPct: 2, usGrowthPct: 2,
    tradeBalanceToGdpPct: 0, debtToGdpPct: 60,
    reservesToGdpPct: 10, moneySupplyGrowthPct: 0, shockPct: 0
  };
  const lowRate = engine.math.computeAnnualDrift(base);
  const highRate = engine.math.computeAnnualDrift({ ...base, localPolicyRatePct: 12 });
  assert.ok(highRate < lowRate);
});

test('inflation update responds to targets and money-supply growth without exceeding model bounds', () => {
  const cool = engine.math.evolveInflation({
    currentInflationPct: 12, targetInflationPct: 2, policyRatePct: 8,
    moneySupplyGrowthPct: 0, gdpGrowthPct: 4,
    currencyDepreciationAnnualPct: 0, years: 1
  });
  const looseMoney = engine.math.evolveInflation({
    currentInflationPct: 5, targetInflationPct: 5, policyRatePct: 3,
    moneySupplyGrowthPct: 35, gdpGrowthPct: 1,
    currencyDepreciationAnnualPct: 0, years: 1
  });
  const tightMoney = engine.math.evolveInflation({
    currentInflationPct: 5, targetInflationPct: 5, policyRatePct: 3,
    moneySupplyGrowthPct: 0, gdpGrowthPct: 1,
    currencyDepreciationAnnualPct: 0, years: 1
  });
  assert.ok(cool < 12);
  assert.ok(looseMoney > tightMoney);
  assert.ok(engine.math.evolveInflation({
    currentInflationPct: 9999, targetInflationPct: 50, policyRatePct: 0,
    moneySupplyGrowthPct: 100, gdpGrowthPct: -10,
    currencyDepreciationAnnualPct: 100, years: 1
  }) <= 1000);
});

test('one-month history stays sorted, replaces duplicate dates and respects its cap', () => {
  let rows = [];
  for (let day = 0; day < 35; day += 1) {
    rows = engine.math.appendHistoryPoint(rows, {
      date: '2026-01-' + String(day + 1).padStart(2, '0'),
      rate: 100 + day
    }, 30);
  }
  rows = engine.math.appendHistoryPoint(rows, { date: '2026-02-04', rate: 999 }, 30);
  assert.equal(rows.length, 30);
  assert.equal(rows.at(-1).date, '2026-02-04');
  assert.equal(rows.at(-1).rate, 999);
  assert.deepEqual(rows.map(row => row.date), rows.map(row => row.date).slice().sort());
});

test('currency metadata uses existing country data and explicit exceptional-area overrides', () => {
  assert.equal(engine.math.getCountryCurrency({
    iso3: 'BGD', sourceValues: { currency_code: 'BDT' }
  }), 'BDT');
  assert.equal(engine.math.getCountryCurrency({
    iso3: 'ALA', sourceValues: {}
  }), 'EUR');
  assert.equal(engine.math.getCountryCurrency({
    iso3: 'SHN', sourceValues: {}
  }), 'SHP');
  assert.equal(engine.math.getCountryCurrency({
    iso3: 'ATA', sourceValues: {}
  }), null);
  assert.equal(engine.math.effectiveRateCode('SHP'), 'GBP');
});
