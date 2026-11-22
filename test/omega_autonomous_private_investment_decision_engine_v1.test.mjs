import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const runtimeSource = readFileSync(new URL('../omega_autonomous_private_investment_decision_engine_v1.js', import.meta.url), 'utf8');
const rules = JSON.parse(readFileSync(new URL('../omega_autonomous_private_investment_rules_v1.json', import.meta.url), 'utf8'));
const COMPANY_IDS = [
  'AURORA_INDUSTRIAL_GROUP',
  'MERIDIAN_ENGINEERING_GROUP',
  'NOVA_CONSUMER_INDUSTRIES',
  'ATLAS_TECHNOLOGY_CORPORATION',
  'TERRA_INFRASTRUCTURE_GROUP'
];
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function createRuntime(options = {}) {
  const countryIds = options.countryIds || ['AUS', 'CAN', 'DEU', 'MEX', 'USA'];
  const state = {
    simulation: { turn: options.turn ?? 130, session: { playerCountryId: options.playerCountryId || 'USA' } },
    economy: {
      AUS: { gdp: 1.4e12, gdp_growth: 3.2, inflation: 3.4, debt: 700e9, productionAssets: [] },
      CAN: { gdp: 1.9e12, gdp_growth: 5, inflation: 2, debt: 760e9, productionAssets: [] },
      DEU: { gdp: 4.5e12, gdp_growth: 1.8, inflation: 4.1, debt: 1.8e12, productionAssets: [] },
      MEX: { gdp: 1.3e12, gdp_growth: 2.5, inflation: 4, debt: 600e9, productionAssets: [] },
      USA: { gdp: 28e12, gdp_growth: 2.5, inflation: 3.1, debt: 35e12, productionAssets: [] }
    },
    foreign: {
      AUS: { relations: { CAN: { overall: 80, trade: 82, trust: 79, political: 81, sanctions: false, war_state: false } } },
      CAN: { relations: { AUS: { overall: 81, trade: 80, trust: 82, political: 79, sanctions: false, war_state: false } } }
    },
    military: {},
    finance: {
      AUS: { available: 900000, omegaFinance: { treasuryBalanceUsd: 700000, companyCapitalAccounts: {} } },
      CAN: { omegaFinance: {} },
      DEU: { omegaFinance: {} },
      MEX: { omegaFinance: {} },
      USA: { available: 500000, omegaFinance: {} }
    }
  };
  const wallets = { AUS: {} };
  for (const companyId of COMPANY_IDS) {
    wallets.AUS[companyId] = {
      currency: 'AUD',
      availableBalance: options.availableBalance ?? 100000,
      reservedBalance: 0,
      capitalSpent: 0
    };
    state.finance.AUS.omegaFinance.companyCapitalAccounts[companyId] = clone(wallets.AUS[companyId]);
  }
  const inboundLedgers = {};
  const investments = [];
  const investmentStatuses = Array.isArray(options.investmentStatuses) ? options.investmentStatuses.slice() : [];
  const capitalInitializationCalls = [];
  const checkpointHandlers = new Map();
  const schedulerRegistrations = [];
  const scheduler = {
    registerCountryHandler(id, handler, metadata) {
      schedulerRegistrations.push({ id, handler, metadata: clone(metadata) });
      return () => {};
    }
  };
  const interop = {
    registerAction() {},
    registerCommandHandler(type, owner, handler) {
      assert.equal(owner, 'finance');
      if (checkpointHandlers.has(type)) throw new Error('duplicate investment checkpoint handler');
      checkpointHandlers.set(type, handler);
    },
    dispatchCommand(owner, type, countryId, payload, metadata = {}) {
      assert.equal(owner, 'finance');
      assert.equal(metadata.ownerMinistry, 'finance');
      const handler = checkpointHandlers.get(type);
      assert.ok(handler, 'investment checkpoint handler must be registered');
      let staged = null;
      const context = {
        countryId,
        simulationTurn: metadata.turn,
        stateTransaction: {
          get(path) {
            assert.equal(path, 'finance.omegaFinance');
            return clone(state.finance[countryId]?.omegaFinance || {});
          },
          set(path, value) {
            assert.equal(path, 'finance.omegaFinance');
            staged = clone(value);
          }
        }
      };
      const result = handler({ payload: clone(payload), commandId: metadata.commandId, commandType: type }, context);
      if (result?.accepted === false) return { status: 'FAILED', result };
      if (staged) state.finance[countryId].omegaFinance = staged;
      return { status: 'APPLIED', result };
    }
  };
  const registry = {
    ready: Promise.resolve({ status: 'READY' }),
    listCountryIds() { return countryIds.slice(); },
    getCountryBaseline(countryId) {
      return countryIds.includes(countryId) ? { status: 'READY', countryId } : null;
    },
    getCompanyRegistry() {
      return COMPANY_IDS.map(id => ({ id, name: id, sectorAffinity: 'test-only registry label' }));
    }
  };
  const capital = {
    async ensureCountryInitializedForInvestment(countryId) {
      capitalInitializationCalls.push(countryId);
      return { status: 'INITIALIZED', countryId };
    }
  };
  const investment = {
    getCompanyCapital(countryId, companyId) {
      const account = wallets[countryId] && wallets[countryId][companyId];
      return account ? clone(account) : null;
    },
    getCountryLedger(countryId) {
      return clone(inboundLedgers[countryId] || []);
    },
    async invest(request) {
      investments.push(clone(request));
      const forced = investmentStatuses.length ? investmentStatuses.shift() : 'SETTLED';
      if (forced !== 'SETTLED') return { status: forced, reason: 'TEST_STATUS_' + forced };
      const wallet = wallets[request.investorCountryId][request.companyId];
      if (wallet.availableBalance < request.amount) return { status: 'BLOCKED', reason: 'INSUFFICIENT_TEST_WALLET' };
      wallet.availableBalance = Number((wallet.availableBalance - request.amount).toFixed(2));
      state.finance[request.investorCountryId].omegaFinance.companyCapitalAccounts[request.companyId].availableBalance = wallet.availableBalance;
      const ledger = inboundLedgers[request.hostCountryId] || (inboundLedgers[request.hostCountryId] = []);
      ledger.push({
        status: 'SETTLED',
        investorCountryId: request.investorCountryId,
        hostCountryId: request.hostCountryId,
        companyId: request.companyId,
        amount: request.amount,
        turn: state.simulation.turn,
        settledTurn: state.simulation.turn
      });
      return { status: 'SETTLED', transferId: request.requestId };
    }
  };
  const sandbox = {
    Game: { state },
    Omega: {
      Simulation: { world: { state }, getPlayerCountryId: () => state.simulation.session.playerCountryId },
      MinistryInteroperability: interop,
      WorldSimulationScheduler: scheduler
    },
    OmegaPrivateInternationalInvestmentRuntimeV1: investment,
    OmegaPrivateCompanyCapitalRuntimeV1: capital,
    OmegaPrivateEnterpriseRegistryV1: registry,
    OmegaFinanceMinistry: { getProfiles: () => countryIds.map(iso3 => ({ iso3 })) },
    __OmegaAutonomousPrivateInvestmentRules: clone(rules),
    addEventListener() {}
  };
  runInNewContext(runtimeSource, sandbox);
  return {
    api: sandbox.OmegaAutonomousPrivateInvestmentDecisionEngineV1,
    state, investments, wallets, inboundLedgers, schedulerRegistrations,
    capitalInitializationCalls, investmentStatuses, checkpointHandlers
  };
}

test('registers on the existing bounded scheduler and never creates a second clock', () => {
  const h = createRuntime();
  const diagnostics = h.api.diagnostics();
  assert.equal(h.schedulerRegistrations.length, 1);
  assert.deepEqual({ ...h.schedulerRegistrations[0].metadata }, { tiers: ['ACTIVE', 'MACRO'], priority: 76 });
  assert.equal(diagnostics.usesExistingWorldScheduler, true);
  assert.equal(diagnostics.usesTimersOrAnimationLoop, false);
  assert.equal(diagnostics.debitsSovereignTreasury, false);
  assert.equal(diagnostics.createsFactoriesOrProduction, false);
  assert.equal(diagnostics.approvesHostGovernmentPermits, false);
});

test('player country is never autonomously used as an investor', async () => {
  const h = createRuntime();
  const result = await h.api.processCountry('USA', { turn: 130, tier: 'MACRO' });
  assert.equal(result.status, 'SKIPPED');
  assert.equal(result.reason, 'PLAYER_COUNTRY_AUTOMATION_DISABLED');
  assert.equal(h.investments.length, 0);
  assert.equal(h.capitalInitializationCalls.length, 0);
});

test('selects a safe foreign host and transfers only a small share of private company cash', async () => {
  const h = createRuntime();
  const treasuryBefore = h.state.finance.AUS.available;
  const treasuryUsdBefore = h.state.finance.AUS.omegaFinance.treasuryBalanceUsd;
  const result = await h.api.processCountry('AUS', { turn: 130, tier: 'MACRO' });
  assert.equal(result.status, 'SETTLED', JSON.stringify(result));
  assert.equal(result.decision.investorCountryId, 'AUS');
  assert.equal(result.decision.hostCountryId, 'CAN');
  assert.equal(result.decision.companyId, COMPANY_IDS[0]);
  assert.equal(result.decision.amount, 3000);
  assert.equal(result.decision.capitalRetainedPct, 97);
  assert.ok(result.decision.score >= rules.policy.minimumInvestmentScore);
  assert.equal(h.investments.length, 1);
  assert.equal(h.investments[0].requestId, 'NPCFDI-AUS-CAN-' + COMPANY_IDS[0] + '-130');
  assert.equal(h.wallets.AUS[COMPANY_IDS[0]].availableBalance, 97000);
  assert.equal(h.state.finance.AUS.available, treasuryBefore);
  assert.equal(h.state.finance.AUS.omegaFinance.treasuryBalanceUsd, treasuryUsdBefore);
  assert.equal(h.state.economy.CAN.productionAssets.length, 0);
  assert.equal(h.state.economy.AUS.productionAssets.length, 0);
  const checkpoint = h.state.finance.AUS.omegaFinance.autonomousPrivateInvestmentDecision;
  assert.equal(checkpoint.lastDecision.status, 'SETTLED');
  assert.equal(checkpoint.lastInvestmentTurn, 130);
  assert.equal(checkpoint.pendingTransfer, null);
  assert.equal(h.capitalInitializationCalls.length, 1);
});

test('war, sanctions, active conflict and economic crisis block foreign investment', async () => {
  const cases = [
    { name: 'war', mutate(state) { state.foreign.AUS.relations.CAN.war_state = true; } },
    { name: 'sanctions', mutate(state) { state.foreign.CAN.relations.AUS.sanctions = true; } },
    { name: 'conflict', mutate(state) { state.military.CAN = { activeConflict: true }; } },
    { name: 'crisis', mutate(state) { state.economy.CAN.activeCrisis = true; } },
    { name: 'recession', mutate(state) { state.economy.CAN.gdp_growth = -5; } },
    { name: 'inflation', mutate(state) { state.economy.CAN.inflation = 27; } },
    { name: 'debt', mutate(state) { state.economy.CAN.debt = 4e12; } }
  ];
  for (const entry of cases) {
    const h = createRuntime();
    entry.mutate(h.state);
    const screened = h.api.scoreHost('AUS', 'CAN', h.state);
    assert.equal(screened.eligible, false, entry.name + ' must fail screening');
    const result = await h.api.processCountry('AUS', { turn: 130, tier: 'MACRO' });
    assert.notEqual(result.status, 'SETTLED', entry.name + ' must not settle an investment');
    assert.equal(h.investments.length, 0, entry.name + ' must not call the FDI settlement API');
  }
});

test('missing macro or bilateral evidence stays unknown and is not filled with assumed values', async () => {
  const h = createRuntime();
  delete h.state.economy.CAN.inflation;
  const macro = h.api.scoreHost('AUS', 'CAN', h.state);
  assert.equal(macro.eligible, false);
  assert.equal(macro.reason, 'MACRO_EVIDENCE_INCOMPLETE');
  h.state.economy.CAN.inflation = 2;
  delete h.state.foreign.AUS.relations.CAN;
  delete h.state.foreign.CAN.relations.AUS;
  const diplomacy = h.api.scoreHost('AUS', 'CAN', h.state);
  assert.equal(diplomacy.eligible, false);
  assert.equal(diplomacy.reason, 'BILATERAL_RELATIONSHIP_EVIDENCE_UNAVAILABLE');
  const result = await h.api.processCountry('AUS', { turn: 130, tier: 'MACRO' });
  assert.equal(result.status, 'NO_QUALIFIED_HOST');
  assert.equal(h.investments.length, 0);
});

test('a host with too many recent settled inbound investments is skipped', async () => {
  const h = createRuntime();
  h.inboundLedgers.CAN = Array.from({ length: 6 }, (_, index) => ({
    status: 'SETTLED', hostCountryId: 'CAN', investorCountryId: 'INV' + index,
    turn: 120 + index, settledTurn: 120 + index
  }));
  const result = await h.api.processCountry('AUS', { turn: 130, tier: 'MACRO' });
  assert.equal(result.status, 'NO_QUALIFIED_INVESTMENT');
  assert.equal(h.investments.length, 0);
});

test('unfinished transfers replay the same immutable idempotency key and amount', async () => {
  const h = createRuntime({ investmentStatuses: ['SETTLEMENT_PENDING', 'SETTLED'] });
  const first = await h.api.processCountry('AUS', { turn: 130, tier: 'MACRO' });
  assert.equal(first.status, 'SETTLEMENT_PENDING');
  const pending = clone(h.state.finance.AUS.omegaFinance.autonomousPrivateInvestmentDecision.pendingTransfer);
  assert.ok(pending);
  const retry = await h.api.processCountry('AUS', { turn: 131, tier: 'MACRO' });
  assert.equal(retry.status, 'SETTLED');
  assert.equal(h.investments.length, 2);
  assert.equal(h.investments[0].requestId, h.investments[1].requestId);
  assert.equal(h.investments[0].amount, h.investments[1].amount);
  assert.equal(h.investments[0].requestId, pending.requestId);
  assert.equal(h.state.finance.AUS.omegaFinance.autonomousPrivateInvestmentDecision.pendingTransfer, null);
  assert.equal(h.wallets.AUS[pending.companyId].availableBalance, 97000);
});

test('the engine enforces scan and investment cooldowns between scheduler visits', async () => {
  const h = createRuntime();
  const first = await h.api.processCountry('AUS', { turn: 130, tier: 'ACTIVE' });
  assert.equal(first.status, 'SETTLED');
  assert.equal((await h.api.processCountry('AUS', { turn: 131, tier: 'MACRO' })).status, 'COOLDOWN');
  assert.equal((await h.api.processCountry('AUS', { turn: 160, tier: 'MACRO' })).status, 'INVESTMENT_COOLDOWN');
  assert.equal(h.investments.length, 1);
});

test('recovered company capital does not allow duplicate investment into the same host-company pair inside its cooldown', async () => {
  const h = createRuntime();
  const checkpoint = {
    schemaVersion: '1.0.0', countryId: 'AUS', revision: 0, lastProcessedTurn: -1,
    lastScanTurn: null, lastInvestmentTurn: null, candidateCursor: 0, nextCompanyIndex: 0,
    pendingTransfer: null,
    lastByHostCompany: { ['CAN|' + COMPANY_IDS[0]]: 100 },
    lastDecision: null, history: [], updatedTurn: 100
  };
  h.state.finance.AUS.omegaFinance.autonomousPrivateInvestmentDecision = checkpoint;
  const result = await h.api.processCountry('AUS', { turn: 130, tier: 'MACRO' });
  assert.equal(result.status, 'SETTLED');
  assert.equal(result.decision.companyId, COMPANY_IDS[1]);
  assert.equal(h.investments.length, 1);
});

test('same-turn replay does not initiate another foreign capital transfer', async () => {
  const h = createRuntime();
  await h.api.processCountry('AUS', { turn: 130, tier: 'MACRO' });
  const replay = await h.api.processCountry('AUS', { turn: 130, tier: 'ACTIVE' });
  assert.equal(replay.status, 'DUPLICATE');
  assert.equal(h.investments.length, 1);
});
