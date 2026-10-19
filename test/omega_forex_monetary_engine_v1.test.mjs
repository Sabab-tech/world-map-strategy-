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
      date: new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10),
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
  assert.equal(engine.math.getCountryCurrency({
    iso3: 'BVT', sourceValues: {}
  }), 'NOK');
  assert.equal(engine.math.getCountryCurrency({
    iso3: 'GEO', sourceValues: {}
  }), null);
  assert.equal(engine.math.getCountryCurrency({
    iso3: 'GEO', generalFacts: { currencyCodes: ['GEL'] }
  }), 'GEL');
  assert.equal(engine.math.getCountryCurrency({
    iso3: 'BGD', indicators: { currencyCode: 'BDT' }
  }), 'BDT');
  assert.equal(engine.math.effectiveRateCode('SHP'), 'GBP');
});

test('runtime syncs country finance into Government Banking and settles FX with turn idempotency', async () => {
  const profiles = [
    {
      name: 'Bangladesh', countryCode: 'BD', iso2: 'BD', iso3: 'BGD',
      economyKey: 'BANGLADESH', profileStatus: 'AVAILABLE',
      sourceValues: {
        currency_code: 'BDT', currency_name: 'Bangladeshi Taka',
        exchange_rate_usd: 120, gdp: 195000000000, gdp_growth: 6.5,
        inflation: 6.2, debt: 80000000000, trade_balance: -9000000000,
        reserves: 27000000000
      },
      indicators: {
        exchangeRateLocalPerUsd: 120, gdpCurrentUsd: 195000000000,
        gdpGrowthPct: 6.5, inflationRatePct: 6.2, publicDebtUsd: 80000000000,
        tradeBalanceUsd: -9000000000, foreignExchangeReservesUsd: 27000000000
      }
    },
    {
      name: 'Nigeria', countryCode: 'NG', iso2: 'NG', iso3: 'NGA',
      economyKey: 'NIGERIA', profileStatus: 'AVAILABLE',
      sourceValues: {
        currency_code: 'NGN', currency_name: 'Nigerian naira',
        exchange_rate_usd: 1500, gdp: 450000000000, gdp_growth: 3,
        inflation: 20, debt: 100000000000, trade_balance: 5000000000,
        reserves: 35000000000
      },
      indicators: {
        exchangeRateLocalPerUsd: 1500, gdpCurrentUsd: 450000000000,
        gdpGrowthPct: 3, inflationRatePct: 20, publicDebtUsd: 100000000000,
        tradeBalanceUsd: 5000000000, foreignExchangeReservesUsd: 35000000000
      }
    },
    {
      name: 'United States', countryCode: 'US', iso2: 'US', iso3: 'USA',
      economyKey: 'UNITED_STATES', profileStatus: 'AVAILABLE',
      sourceValues: {
        currency_code: 'USD', currency_name: 'United States dollar',
        exchange_rate_usd: 1, gdp: 21000000000000, gdp_growth: 2,
        inflation: 2, debt: 18000000000000, trade_balance: -500000000000,
        reserves: 500000000000
      },
      indicators: {
        exchangeRateLocalPerUsd: 1, gdpCurrentUsd: 21000000000000,
        gdpGrowthPct: 2, inflationRatePct: 2, publicDebtUsd: 18000000000000,
        tradeBalanceUsd: -500000000000, foreignExchangeReservesUsd: 500000000000
      }
    }
  ];
  const financeStates = {
    BD: { treasuryBalanceUsd: 1000000000, policy: { interestRateAnnualPct: 5 }, fiscalModel: {} },
    NG: { treasuryBalanceUsd: 2000000000, policy: { interestRateAnnualPct: 12 }, fiscalModel: {} },
    US: { treasuryBalanceUsd: 100000000000, policy: { interestRateAnnualPct: 3 }, fiscalModel: {} }
  };
  const actions = [];
  context.gameState = {
    simulation: { turn: 0, playerCountryId: 'BD' },
    economy: {
      BANGLADESH: { gdp: 195000000000, gdp_growth: 6.5, inflation: 6.2, debt: 80000000000, trade_balance: -9000000000, reserves: 27000000000 },
      NIGERIA: { gdp: 450000000000, gdp_growth: 3, inflation: 20, debt: 100000000000, trade_balance: 5000000000, reserves: 35000000000 },
      UNITED_STATES: { gdp: 21000000000000, gdp_growth: 2, inflation: 2, debt: 18000000000000, trade_balance: -500000000000, reserves: 500000000000 }
    },
    finance: {
      BGD: { omegaFinance: { treasuryBalanceUsd: 1000000000 } },
      NGA: { omegaFinance: { treasuryBalanceUsd: 2000000000 } },
      USA: { omegaFinance: { treasuryBalanceUsd: 100000000000 } }
    }
  };
  context.OmegaFinanceMinistry = {
    VERSION: '1.1.0',
    init: async () => ({ initialized: true }),
    getProfiles: () => profiles,
    getPlayerCountry: () => profiles[0],
    getFinanceState: id => {
      const p = profiles.find(row => row.countryCode === id || row.iso3 === id);
      return p ? financeStates[p.countryCode] : null;
    },
    applyAction: action => {
      actions.push(action);
      const p = profiles.find(row => row.countryCode === action.countryId || row.iso3 === action.countryId);
      if (!p || p.countryCode !== 'BD') return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION' };
      if (action.type === 'set-interest-rate') financeStates.BD.policy.interestRateAnnualPct = Number(action.value);
      return { ok: true, code: 'POLICY_UPDATED' };
    }
  };

  const diagnostics = await engine.init();
  assert.equal(diagnostics.countryAreaCount, 3);
  assert.ok(diagnostics.currencyCount >= 3);
  assert.equal(diagnostics.countriesWithCurrency, 3);
  assert.equal(diagnostics.countriesWithSimulationRate, 3);
  const quotes = engine.getCountryQuotes('SIMULATION');
  assert.equal(quotes.length, 3);
  const bangladeshQuote = quotes.find(row => row.iso3 === 'BGD');
  const nigeriaQuote = quotes.find(row => row.iso3 === 'NGA');
  const unitedStatesQuote = quotes.find(row => row.iso3 === 'USA');
  assert.equal(bangladeshQuote.currencyCode, 'BDT');
  assert.equal(bangladeshQuote.localPerUsd, 120);
  assert.equal(bangladeshQuote.usdPerLocalUnit, 1 / 120);
  assert.equal(nigeriaQuote.localPerUsd, 1500);
  assert.equal(nigeriaQuote.usdPerLocalUnit, 1 / 1500);
  assert.equal(unitedStatesQuote.currencyCode, 'USD');
  assert.equal(unitedStatesQuote.localPerUsd, 1);
  assert.equal(unitedStatesQuote.usdPerLocalUnit, 1);
  assert.equal(engine.getRate('BDT', 'SIMULATION'), 120);
  assert.equal(context.gameState.governmentBanking.countries.BD.currencyCode, 'BDT');
  assert.equal(context.gameState.governmentBanking.countries.NG.currencyCode, 'NGN');
  assert.equal(context.gameState.finance.BGD.governmentBanking.currencyCode, 'BDT');

  const bankingConversions = [];
  context.OmegaGovernmentBanking = {
    convert(input) {
      bankingConversions.push(input);
      const quote = engine.math.calculateConversion(
        input.amount, input.fromCurrencyCode, input.toCurrencyCode,
        engine.getRates('SIMULATION'), input.feeBps
      );
      if (!quote.ok) return quote;
      const bank = context.gameState.governmentBanking;
      bank.fxClearingHouse = bank.fxClearingHouse || {};
      bank.fxClearingHouse.transactionCount = (bank.fxClearingHouse.transactionCount || 0) + 1;
      bank.fxClearingHouse.settledVolumeUsd = (bank.fxClearingHouse.settledVolumeUsd || 0) + quote.usdNotional;
      bank.fxClearingHouse.feeRevenueUsd = (bank.fxClearingHouse.feeRevenueUsd || 0) + quote.feeUsd;
      return {
        ...quote, ok: true, mode: 'SIMULATION', transactionId: input.idempotencyKey,
        transaction: { transactionId: input.idempotencyKey, type: 'CROSS_BORDER_TRANSFER', status: 'SETTLED' }
      };
    }
  };
  const conversion = engine.convert({
    amount: 12000, fromCode: 'BDT', toCode: 'NGN', mode: 'SIMULATION'
  });
  assert.equal(conversion.ok, true);
  assert.equal(conversion.route, 'SOURCE_TO_USD_TO_TARGET');
  assert.equal(conversion.amountTarget, 149775);
  assert.equal(bankingConversions.length, 1);
  assert.equal(bankingConversions[0].countryId, 'BD');
  assert.equal(bankingConversions[0].feeBps, 15);
  assert.equal(conversion.transaction.type, 'CROSS_BORDER_TRANSFER');
  assert.equal(context.gameState.governmentBanking.fxClearingHouse.transactionCount, 1);

  const referenceSettlement = engine.convert({
    amount: 12000, fromCode: 'BDT', toCode: 'NGN', mode: 'REFERENCE'
  });
  assert.equal(referenceSettlement.ok, false);
  assert.equal(referenceSettlement.code, 'REFERENCE_QUOTES_READ_ONLY');
  const sameCurrencySettlement = engine.convert({
    amount: 500, fromCode: 'BDT', toCode: 'BDT', mode: 'SIMULATION'
  });
  assert.equal(sameCurrencySettlement.ok, false);
  assert.equal(sameCurrencySettlement.code, 'SAME_CURRENCY_CONVERSION');
  assert.equal(bankingConversions.length, 1);

  const tick = engine.simulationTick(1, 24 * 60 * 60 * 1000);
  assert.equal(tick.ok, true);
  assert.equal(tick.simulationDay, 1);
  assert.equal(engine.simulationTick(1, 24 * 60 * 60 * 1000).duplicate, true);

  const policy = engine.applyMonetaryPolicy({
    inflationTargetPct: 3, moneySupplyGrowthPct: 8,
    policyInterestRatePct: 6, currencyRegime: 'MANAGED_FLOAT'
  });
  assert.equal(policy.ok, true);
  assert.equal(actions.at(-1).type, 'set-interest-rate');
  assert.equal(financeStates.BD.policy.interestRateAnnualPct, 6);

  const intervention = engine.intervene({ amountUsd: 50000000, direction: 'SUPPORT_CURRENCY' });
  assert.equal(intervention.ok, true);
  assert.ok(intervention.transaction.newLocalPerUsd < intervention.transaction.oldLocalPerUsd);
  assert.equal(context.gameState.governmentBanking.forex.ledger.length, 2);
});

test('FX panel mounts only inside the dedicated Finance FX tab host',()=>{
  assert.match(source,/querySelector\('\[data-ofx-container\]'\)/);
  assert.match(source,/host\.appendChild\(panel\)/);
  assert.match(source,/\.ofm-dashboard \[data-ofx-container\]/);
  assert.match(source,/if \(!dashboard \|\| !host \|\| dashboard\.querySelector\('\[data-ofx-panel\]'\)\) return false/);
  assert.match(source, /data-ofx-quote/);
  assert.match(source, /function previewConversion/);
  assert.match(source, /function renderCountryLookup/);
  assert.match(source, /data-ofx-country-lookup/);
  assert.match(source, /data-ofx-swap/);
  assert.match(source, /data-ofx-policy-details/);
  assert.match(source, /data-ofx-chart-details/);
  assert.match(source, /data-ofx-catalogue-details/);
  assert.match(source, /data-ofx-banking-details/);
  assert.match(source, /data-ofx-ledger-details/);
  assert.match(source, /data-ofx-record/);
  assert.match(source, /GOVERNMENT_BANKING_ACCOUNT_SETTLEMENT/);
  assert.match(source, /banking\.convert/);
  assert.match(source, /country-rate-coverage/);
});
