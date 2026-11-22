import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../omega_private_international_investment_runtime_v1.js', import.meta.url), 'utf8');
const COMPANY = 'AURORA_INDUSTRIAL_GROUP';
const COMPANY_IDS = [
  'AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES',
  'ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'
];
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function makeHarness(options = {}) {
  const state = {
    simulation: { turn: 12, session: { playerCountryId: 'BGD' } },
    finance: {
      BGD: { available: 999999, omegaFinance: {
        treasuryBalanceUsd: 1000000, ledger: [],
        companyCapitalAccounts: {
          [COMPANY]: { companyId: COMPANY, currency: 'BDT', availableBalance: 120000,
            reservedBalance: 0, capitalRaised: 120000, capitalSpent: 0, revision: 1 }
        }
      }},
      USA: { available: 888888, omegaFinance: {
        treasuryBalanceUsd: 2000000, ledger: [],
        companyCapitalAccounts: options.hostAccount === false ? {} : {
          [COMPANY]: { companyId: COMPANY, currency: options.hostCurrency || 'USD',
            availableBalance: options.hostBalance ?? 250, reservedBalance: 0,
            capitalRaised: options.hostBalance ?? 250, capitalSpent: 0, revision: 1 }
        }
      }}
    },
    economy: { BGD: {}, USA: { productionAssets: [] } }
  };
  const handlers = new Map();
  const dispatchLog = [];
  const currencies = { BGD: 'BDT', USA: 'USD', DEU: 'EUR' };
  const rates = { BDT: 110, USD: 1, EUR: 0.9 };
  const interop = {
    registerCommandHandler(type, owner, handler) {
      assert.equal(owner, 'finance');
      if (handlers.has(type)) throw new Error('duplicate command handler');
      handlers.set(type, handler);
      return { commandType: type, ownerMinistry: owner };
    },
    dispatchCommand(source, actionId, countryId, payload, commandOptions = {}) {
      assert.equal(source, 'finance');
      assert.equal(commandOptions.ownerMinistry, 'finance');
      const handler = handlers.get(commandOptions.commandType || actionId);
      if (!handler) return { status: 'FAILED', reason: 'HANDLER_NOT_FOUND' };
      let staged = null;
      const stateTransaction = {
        get(path) {
          assert.equal(path, 'finance.omegaFinance');
          return clone(state.finance[countryId]?.omegaFinance);
        },
        set(path, value) {
          assert.equal(path, 'finance.omegaFinance');
          staged = clone(value);
          return staged;
        }
      };
      const ctx = { countryId, simulationTurn: state.simulation.turn, stateTransaction };
      const result = handler({ payload: clone(payload), commandId: commandOptions.commandId,
        commandType: commandOptions.commandType }, ctx);
      dispatchLog.push({ type: commandOptions.commandType, countryId, result: clone(result) });
      if (result?.accepted === false) return { status: 'FAILED', result };
      if (staged) state.finance[countryId].omegaFinance = staged;
      return { status: 'APPLIED', result };
    }
  };
  const countryRuntime = {
    ready: Promise.resolve(true),
    getProfile(countryId) { return { countryCode: countryId, iso3: countryId, currencyCode: currencies[countryId] || 'USD' }; }
  };
  const sandbox = {
    Game: { state, playerCountry: 'BGD' },
    Omega: {
      Simulation: { world: { state }, getPlayerCountryId: () => 'BGD' },
      MinistryInteroperability: interop
    },
    OmegaMinistryInteroperability: interop,
    OmegaPrivateCompanyCapitalRuntimeV1: {
      ensureCountryInitializedForInvestment: async countryId => ({
        status: options.openingStatus || 'ALREADY_INITIALIZED', countryId
      })
    },
    OmegaPrivateEnterpriseRegistryV1: {
      ready: Promise.resolve({ status: 'READY', countryCount: 197 }),
      getCountryBaseline(countryId) { return /^[A-Z]{3}$/.test(countryId) ? { status: 'READY', countryId } : null; }
    },
    OmegaCountryRuntimeData: countryRuntime,
    OmegaForexMonetaryEngine: {
      getCurrencyCode(profile) { return profile.currencyCode; },
      getRate(currency) { return rates[currency] ?? null; }
    },
    addEventListener() {}
  };
  runInNewContext(source, sandbox);
  return { api: sandbox.OmegaPrivateInternationalInvestmentRuntimeV1, state, handlers, dispatchLog };
}

test('five canonical universal companies are the only eligible cross-border private investors', () => {
  const h = makeHarness();
  assert.equal(h.api.COMPANY_IDS.length, 5);
  assert.deepEqual([...h.api.COMPANY_IDS], COMPANY_IDS);
  assert.equal(h.api.AUTHORITY, 'OMEGA_PRIVATE_CROSS_BORDER_INVESTMENT_RUNTIME_V1');
});

test('foreign company capital converts BDT to USD, credits the host wallet, settles both ledgers, and never debits Treasury', async () => {
  const h = makeHarness();
  const investorTreasury = h.state.finance.BGD.available;
  const hostTreasury = h.state.finance.USA.available;
  const investorTreasuryUsd = h.state.finance.BGD.omegaFinance.treasuryBalanceUsd;
  const hostTreasuryUsd = h.state.finance.USA.omegaFinance.treasuryBalanceUsd;
  const result = await h.api.invest({
    investorCountryId: 'BGD', hostCountryId: 'USA', companyId: COMPANY,
    requestId: 'FDI-ORDER-001', amount: 11000
  });
  assert.equal(result.status, 'SETTLED', JSON.stringify(result));
  assert.equal(result.investorCurrencyCode, 'BDT');
  assert.equal(result.hostCurrencyCode, 'USD');
  assert.equal(result.investorAmount, 11000);
  assert.equal(result.hostAmount, 100);
  assert.equal(result.amountUsd, 100);
  const investor = h.state.finance.BGD.omegaFinance;
  const host = h.state.finance.USA.omegaFinance;
  assert.equal(investor.companyCapitalAccounts[COMPANY].availableBalance, 109000);
  assert.equal(investor.companyCapitalAccounts[COMPANY].internationalInvestmentEscrowBalance, 0);
  assert.equal(investor.companyCapitalAccounts[COMPANY].capitalSpent, 11000);
  assert.equal(host.companyCapitalAccounts[COMPANY].availableBalance, 350);
  assert.equal(host.companyCapitalAccounts[COMPANY].foreignCapitalLots.length, 1);
  assert.equal(host.companyCapitalAccounts[COMPANY].foreignCapitalLots[0].investorCountryId, 'BGD');
  assert.equal(host.companyCapitalAccounts[COMPANY].foreignCapitalLots[0].availableBalance, 100);
  assert.equal(host.foreignInvestmentLedger.length, 1);
  assert.equal(host.foreignInvestmentLedger[0].status, 'SETTLED');
  assert.equal(host.ledger.filter(row => row.type === 'PRIVATE_COMPANY_FOREIGN_INVESTMENT_RECEIPT').length, 1);
  assert.equal(investor.ledger.filter(row => row.type === 'PRIVATE_COMPANY_FOREIGN_INVESTMENT_DEBIT').length, 1);
  assert.equal(h.state.finance.BGD.available, investorTreasury);
  assert.equal(h.state.finance.USA.available, hostTreasury);
  assert.equal(investor.treasuryBalanceUsd, investorTreasuryUsd);
  assert.equal(host.treasuryBalanceUsd, hostTreasuryUsd);
  assert.equal(result.governmentTreasuryChanged, false);
});

test('replaying the same transfer ID is idempotent across investor, host receipt, and settlement confirmation', async () => {
  const h = makeHarness();
  const input = { investorCountryId: 'BGD', hostCountryId: 'USA', companyId: COMPANY,
    requestId: 'FDI-REPLAY-001', amount: 2200 };
  const first = await h.api.invest(input);
  assert.equal(first.status, 'SETTLED');
  const investorBalance = h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance;
  const hostBalance = h.state.finance.USA.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance;
  const hostLedgerCount = h.state.finance.USA.omegaFinance.foreignInvestmentLedger.length;
  const investorDebitCount = h.state.finance.BGD.omegaFinance.ledger.filter(row =>
    row.type === 'PRIVATE_COMPANY_FOREIGN_INVESTMENT_DEBIT').length;
  const replay = await h.api.invest(input);
  assert.equal(replay.status, 'SETTLED');
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance, investorBalance);
  assert.equal(h.state.finance.USA.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance, hostBalance);
  assert.equal(h.state.finance.USA.omegaFinance.foreignInvestmentLedger.length, hostLedgerCount);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.filter(row =>
    row.type === 'PRIVATE_COMPANY_FOREIGN_INVESTMENT_DEBIT').length, investorDebitCount);
});

test('host company currency mismatch compensates the investor reservation without losing capital', async () => {
  const h = makeHarness({ hostCurrency: 'EUR', hostBalance: 500 });
  const before = h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance;
  const result = await h.api.invest({
    investorCountryId: 'BGD', hostCountryId: 'USA', companyId: COMPANY,
    requestId: 'FDI-REFUND-001', amount: 1100
  });
  assert.equal(result.status, 'REFUNDED', JSON.stringify(result));
  const account = h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY];
  assert.equal(account.availableBalance, before);
  assert.equal(account.internationalInvestmentEscrowBalance, 0);
  assert.equal(account.capitalSpent, 0);
  assert.equal(h.state.finance.USA.omegaFinance.foreignInvestmentLedger, undefined);
});

test('unsupported identities, same-country transfers, insufficient capital, and missing FX rates are refused', async () => {
  const h = makeHarness();
  assert.equal((await h.api.invest({ investorCountryId: 'BGD', hostCountryId: 'BGD',
    companyId: COMPANY, requestId: 'FDI-SAME-001', amount: 100 })).reason, 'DISTINCT_INVESTOR_AND_HOST_COUNTRIES_REQUIRED');
  assert.equal((await h.api.invest({ investorCountryId: 'BGD', hostCountryId: 'USA',
    companyId: 'LOCAL_NON_UNIVERSAL_GROUP', requestId: 'FDI-BAD-001', amount: 100 })).reason, 'UNIVERSAL_PRIVATE_COMPANY_REQUIRED');
  assert.equal((await h.api.invest({ investorCountryId: 'BGD', hostCountryId: 'USA',
    companyId: COMPANY, requestId: 'FDI-OVER-001', amount: 999999999 })).reason, 'INSUFFICIENT_INVESTOR_COMPANY_CAPITAL');
  const missingFx = makeHarness();
  missingFx.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].currency = 'ZZZ';
  assert.equal((await missingFx.api.invest({ investorCountryId: 'BGD', hostCountryId: 'USA',
    companyId: COMPANY, requestId: 'FDI-FX-001', amount: 100 })).reason,
  'INVESTOR_WALLET_AND_COUNTRY_CURRENCY_MISMATCH');
});

test('foreign capital initialization failure does not write a cross-border transfer', async () => {
  const h = makeHarness({ openingStatus: 'WAITING' });
  const before = h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance;
  const result = await h.api.invest({ investorCountryId: 'BGD', hostCountryId: 'USA',
    companyId: COMPANY, requestId: 'FDI-WALLET-001', amount: 100 });
  assert.equal(result.status, 'WAITING');
  assert.equal(h.state.finance.BGD.omegaFinance.companyCapitalAccounts[COMPANY].availableBalance, before);
  assert.equal(h.state.finance.USA.omegaFinance.foreignInvestmentLedger, undefined);
});

test('runtime exposes host receipts and foreign-funded capital lots for the shared company factory pool', async () => {
  const h = makeHarness();
  await h.api.invest({ investorCountryId: 'BGD', hostCountryId: 'USA', companyId: COMPANY,
    requestId: 'FDI-READ-001', amount: 5500 });
  const ledger = h.api.getCountryLedger('USA');
  const capital = h.api.getCompanyCapital('USA', COMPANY);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].status, 'SETTLED');
  assert.equal(capital.availableBalance, 300);
  assert.equal(capital.foreignInvestmentReceivedLocal, 50);
  assert.equal(capital.foreignCapitalLots[0].investorCountryId, 'BGD');
  assert.equal(h.api.diagnostics().treasuryDebit, false);
});
