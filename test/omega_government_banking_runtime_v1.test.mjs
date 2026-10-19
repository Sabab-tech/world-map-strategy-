import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const bankingSource = readFileSync('omega_government_banking_runtime_v1.js', 'utf8');
const rules = JSON.parse(readFileSync('government_banking_rules_v1.json', 'utf8'));

function makeRuntime() {
  const profiles = [
    {
      name: 'Bangladesh', countryCode: 'BD', iso2: 'BD', iso3: 'BGD',
      economyKey: 'BANGLADESH', profileStatus: 'AVAILABLE',
      sourceValues: { currency_code: 'BDT', currency_name: 'Bangladeshi Taka' },
      indicators: { gdpCurrentUsd: 1_000_000_000, publicDebtUsd: 400_000_000,
        inflationRatePct: 8, gdpGrowthPct: 4, foreignExchangeReservesUsd: 30_000_000_000,
        tradeBalanceUsd: -2_000_000_000 }
    },
    {
      name: 'Nigeria', countryCode: 'NG', iso2: 'NG', iso3: 'NGA',
      economyKey: 'NIGERIA', profileStatus: 'AVAILABLE',
      sourceValues: { currency_code: 'NGN', currency_name: 'Nigerian naira' },
      indicators: { gdpCurrentUsd: 800_000_000, publicDebtUsd: 500_000_000,
        inflationRatePct: 20, gdpGrowthPct: 2, foreignExchangeReservesUsd: 10_000_000_000,
        tradeBalanceUsd: 1_000_000_000 }
    },
    {
      name: 'United States', countryCode: 'US', iso2: 'US', iso3: 'USA',
      economyKey: 'UNITED_STATES', profileStatus: 'AVAILABLE',
      sourceValues: { currency_code: 'USD', currency_name: 'United States dollar' },
      indicators: { gdpCurrentUsd: 20_000_000_000, publicDebtUsd: 10_000_000_000,
        inflationRatePct: 3, gdpGrowthPct: 2, foreignExchangeReservesUsd: 500_000_000_000,
        tradeBalanceUsd: -1_000_000_000 }
    }
  ];
  const state = {
    simulation: { turn: 1, playerCountryId: 'BGD' },
    economy: {
      BANGLADESH: { gdp: 1_000_000_000, debt: 400_000_000, inflation: 8, gdp_growth: 4,
        reserves: 30_000_000_000, trade_balance: -2_000_000_000 },
      NIGERIA: { gdp: 800_000_000, debt: 500_000_000, inflation: 20, gdp_growth: 2,
        reserves: 10_000_000_000, trade_balance: 1_000_000_000 },
      UNITED_STATES: { gdp: 20_000_000_000, debt: 10_000_000_000, inflation: 3, gdp_growth: 2,
        reserves: 500_000_000_000, trade_balance: -1_000_000_000 }
    },
    finance: {
      BGD: { available: 1_000, reserves: 100 },
      NGA: { available: 500, reserves: 100 },
      USA: { available: 10_000, reserves: 1_000 }
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
        policy: { interestRateAnnualPct: 5 }, fiscalModel: { annualSpendingUsd: 0 } } : null;
    }
  };
  const rates = { USD: 1, BDT: 100, NGN: 1_000 };
  const fx = {
    VERSION: 'TEST_FX',
    init: async () => ({ initialized: true }),
    getProfiles: () => profiles,
    getCurrencyCode: p => p && p.sourceValues && p.sourceValues.currency_code || null,
    getRate: code => rates[String(code || '').toUpperCase()] ?? null,
    getCurrencies: () => [
      { code: 'USD', name: 'United States dollar' },
      { code: 'BDT', name: 'Bangladeshi Taka' },
      { code: 'NGN', name: 'Nigerian naira' }
    ],
    getState: () => ({ simulationDay: Math.floor(state.simulation.turn / 24) }),
    getPolicy: () => ({ currencyRegime: 'FLOAT', moneySupplyGrowthPct: 4 })
  };
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    fetchResilient: async () => rules
  });
  context.gameState = state;
  context.Game = { state };
  context.OmegaFinanceMinistry = finance;
  context.OmegaForexMonetaryEngine = fx;
  vm.runInContext(bankingSource, context, { filename: 'omega_government_banking_runtime_v1.js' });
  return { context, state, profiles, finance, fx, bank: context.OmegaGovernmentBanking };
}

test('banking seeds USD clearing balances only from the existing Finance Treasury', async () => {
  const r = makeRuntime();
  const ready = await r.bank.init();
  assert.equal(ready.initialized, true);
  const account = r.bank.getCountryAccount('BGD');
  assert.equal(account.treasuryBalanceUsd, 1_000);
  assert.equal(account.homeCurrencyCode, 'BDT');
  assert.equal(account.accounts.find(x => x.currencyCode === 'USD').balance, 1_000);
  assert.equal(account.accounts.find(x => x.currencyCode === 'BDT').balance, 0);
  assert.equal(account.openingSource, 'FINANCE_TREASURY_MIRROR');
});

test('domestic FX conversion conserves portfolio value apart from its explicit fee', async () => {
  const r = makeRuntime();
  await r.bank.init();
  const before = r.bank.getCountryAccount('BGD');
  const result = r.bank.convert({ countryId: 'BGD', amount: 100, fromCode: 'USD', toCode: 'BDT', idempotencyKey: 'BD-CONVERT-1' });
  assert.equal(result.ok, true);
  assert.equal(result.route, 'DIRECT_USD');
  assert.equal(result.amountTarget, 9_985);
  const after = r.bank.getCountryAccount('BGD');
  assert.equal(after.accounts.find(x => x.currencyCode === 'USD').balance, 900);
  assert.equal(after.accounts.find(x => x.currencyCode === 'BDT').balance, 9_985);
  assert.ok(Math.abs(after.treasuryBalanceUsd - (before.treasuryBalanceUsd - 0.15)) < 1e-7);
  assert.ok(Math.abs(after.accountPortfolioUsd - after.treasuryBalanceUsd) < 0.01);
});

test('BDT to NGN transfer settles through USD once and duplicate keys do not debit twice', async () => {
  const r = makeRuntime();
  await r.bank.init();
  r.bank.convert({ countryId: 'BGD', amount: 100, fromCode: 'USD', toCode: 'BDT', idempotencyKey: 'BD-FUND-1' });
  const beforeBuyer = r.bank.getCountryAccount('BGD').treasuryBalanceUsd;
  const beforeSeller = r.bank.getCountryAccount('NGA').treasuryBalanceUsd;
  const input = {
    sourceCountryId: 'BGD', destinationCountryId: 'NGA',
    fromCurrencyCode: 'BDT', toCurrencyCode: 'NGN',
    amount: 5_000, idempotencyKey: 'BD-NG-TRANSFER-1', reference: 'test import'
  };
  const first = r.bank.transfer(input);
  assert.equal(first.ok, true);
  assert.equal(first.transaction.status, 'SETTLED');
  assert.equal(first.transaction.settlementRoute, 'SOURCE_TO_USD_TO_TARGET');
  assert.equal(first.transaction.amountTarget, 49_925);
  assert.ok(Math.abs(r.bank.getCountryAccount('BGD').treasuryBalanceUsd - (beforeBuyer - 50)) < 1e-7);
  assert.ok(Math.abs(r.bank.getCountryAccount('NGA').treasuryBalanceUsd - (beforeSeller + 49.925)) < 1e-7);
  const second = r.bank.transfer(input);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.ok(Math.abs(r.bank.getCountryAccount('BGD').treasuryBalanceUsd - (beforeBuyer - 50)) < 1e-7);
  assert.ok(Math.abs(r.bank.getCountryAccount('NGA').treasuryBalanceUsd - (beforeSeller + 49.925)) < 1e-7);
  assert.ok(Math.abs(r.bank.getCountryAccount('BGD').accountPortfolioUsd - r.bank.getCountryAccount('BGD').treasuryBalanceUsd) < 0.01);
  assert.ok(Math.abs(r.bank.getCountryAccount('NGA').accountPortfolioUsd - r.bank.getCountryAccount('NGA').treasuryBalanceUsd) < 0.01);
});

test('a failed FX quote cannot create a conversion by guessing a missing rate', async () => {
  const r = makeRuntime();
  await r.bank.init();
  const result = r.bank.transfer({
    sourceCountryId: 'BGD', destinationCountryId: 'NGA',
    fromCurrencyCode: 'BDT', toCurrencyCode: 'ZZZ',
    amount: 10, idempotencyKey: 'MISSING-RATE'
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'FX_RATE_UNAVAILABLE');
  assert.equal((r.bank.getState().ledger || []).length, 0);
});

test('trade two-phase clearing debits buyer gross, returns tariff, credits seller, and is idempotent', async () => {
  const r = makeRuntime();
  await r.bank.init();
  const quote = r.bank.prepareTradeSettlement({
    authorization: 'OMEGA_GLOBAL_TRADE', settlementId: 'TRADE-BDT-NGN-1', requestId: 'REQ-1',
    buyerCountryId: 'BGD', sellerCountryId: 'NGA', resourceId: 'iron_ore',
    buyerCurrency: 'BDT', sellerCurrency: 'NGN', buyerTotal: 10_000, sellerTotal: 100_000,
    paymentDelayTurns: 0, importTariffPct: 2.5
  });
  assert.equal(quote.ok, true);
  assert.equal(quote.buyerDebitUsd, 102.5);
  assert.equal(quote.sellerCreditUsd, 100);
  assert.equal(quote.tariffUsd, 2.5);
  assert.equal(r.bank.getReservedTreasuryUsd('BGD'), 102.5);

  // Simulate the authoritative Finance Runtime debit/credit actions:
  // Buyer: -102.50 gross +2.50 tariff, seller: +100.00 in USD.
  r.state.finance.BGD.available = 897.5;
  r.state.finance.BGD.available += 2.5;
  r.state.finance.NGA.available += 100;
  const result = r.bank.commitTradeSettlement({
    settlementId: 'TRADE-BDT-NGN-1',
    requestId: 'REQ-1',
    batchTransfers: [{ sourceBatchId: 'ORE-BATCH-1', sourceBatchIds: ['ORE-BATCH-1'], resourceId: 'iron_ore', quantity: 10, stage: 'RAW_EXTRACTED' }],
    createdBatchIds: ['TRADE:ORE-BATCH-1']
  });
  assert.equal(result.ok, true);
  assert.equal(result.transaction.status, 'SETTLED');
  assert.equal(result.transaction.batchTransfers.length, 1);
  assert.equal(result.transaction.createdBatchIds[0], 'TRADE:ORE-BATCH-1');
  assert.ok(Math.abs(r.bank.getCountryAccount('BGD').treasuryBalanceUsd - 900) < 1e-7);
  assert.ok(Math.abs(r.bank.getCountryAccount('NGA').treasuryBalanceUsd - 600) < 1e-7);
  assert.ok(Math.abs(r.bank.getCountryAccount('BGD').accountPortfolioUsd - 900) < 0.01);
  assert.ok(Math.abs(r.bank.getCountryAccount('NGA').accountPortfolioUsd - 600) < 0.01);
  assert.equal(r.bank.commitTradeSettlement({ settlementId: 'TRADE-BDT-NGN-1' }).duplicate, true);
  assert.equal(r.bank.getState().ledger.filter(x => x.transactionId === 'TRADE-BDT-NGN-1' && x.status === 'SETTLED').length, 1);
});

test('delayed bank transfer reserves money until its due turn and releases the exact hold', async () => {
  const r = makeRuntime();
  await r.bank.init();
  r.bank.convert({ countryId: 'BGD', amount: 100, fromCode: 'USD', toCode: 'BDT', idempotencyKey: 'BD-FUND-DELAY' });
  const policy = r.bank.getCountryPolicy('BGD');
  const update = r.bank.updateTradePolicy({
    countryId: 'BGD',
    importTariffPct: policy.importTariffPct,
    defaultPaymentDelayTurns: 2,
    correspondentLimitUsd: policy.correspondentLimitUsd,
    dailyTransferLimitUsd: policy.dailyTransferLimitUsd,
    counterpartyRiskTolerancePct: policy.counterpartyRiskTolerancePct
  });
  assert.equal(update.ok, true);
  const payment = r.bank.transfer({
    sourceCountryId: 'BGD', destinationCountryId: 'NGA',
    fromCurrencyCode: 'BDT', toCurrencyCode: 'NGN', amount: 100,
    idempotencyKey: 'DELAYED-PAYMENT-1', reference: 'delayed test'
  });
  assert.equal(payment.ok, true);
  assert.equal(payment.pending, true);
  assert.equal(r.bank.getReservedTreasuryUsd('BGD'), 1);
  assert.ok(Math.abs(r.bank.getCountryAccount('BGD').availableTreasuryUsd - 998.85) < 1e-7);
  r.state.simulation.turn = payment.dueTurn;
  const settled = r.bank.processPendingTransfers();
  assert.equal(settled.length, 1);
  assert.equal(settled[0].ok, true);
  assert.equal(r.bank.getReservedTreasuryUsd('BGD'), 0);
  assert.equal(r.bank.getState().ledger.find(x => x.transactionId === 'DELAYED-PAYMENT-1').status, 'SETTLED');
});

test('a cancelled trade settlement ID cannot be reused for fresh debits', async () => {
  const r = makeRuntime();
  await r.bank.init();
  const input = {
    authorization: 'OMEGA_GLOBAL_TRADE', settlementId: 'FINALIZED-TRADE-1',
    requestId: 'REQ-FINALIZED-1', buyerCountryId: 'BGD', sellerCountryId: 'NGA',
    resourceId: 'iron_ore', buyerCurrency: 'BDT', sellerCurrency: 'NGN',
    buyerTotal: 10000, sellerTotal: 100000, paymentDelayTurns: 0, importTariffPct: 2.5
  };
  const quote = r.bank.prepareTradeSettlement(input);
  assert.equal(quote.ok, true);
  assert.equal(r.bank.cancelTradeSettlement('FINALIZED-TRADE-1', 'TEST_ROLLBACK').ok, true);
  const retry = r.bank.prepareTradeSettlement(input);
  assert.equal(retry.ok, false);
  assert.equal(retry.code, 'SETTLEMENT_ID_FINALIZED');
  assert.equal(r.bank.getState().ledger.filter(x => x.transactionId === 'FINALIZED-TRADE-1' && x.status === 'SETTLED').length, 0);
});
