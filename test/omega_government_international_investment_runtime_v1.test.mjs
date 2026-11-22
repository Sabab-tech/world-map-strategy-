import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../omega_government_international_investment_runtime_v1.js', import.meta.url), 'utf8');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const profiles = [
  { iso3: 'BGD', countryCode: 'BGD', name: 'Bangladesh', currencyCode: 'BDT', gdpCurrentUsd: 460000000000 },
  { iso3: 'USA', countryCode: 'USA', name: 'United States', currencyCode: 'USD', gdpCurrentUsd: 28000000000000 },
  { iso3: 'DEU', countryCode: 'DEU', name: 'Germany', currencyCode: 'EUR', gdpCurrentUsd: 4500000000000 },
  { iso3: 'JPN', countryCode: 'JPN', name: 'Japan', currencyCode: 'JPY', gdpCurrentUsd: 4200000000000 }
];

function makeHarness(options = {}) {
  const state = {
    simulation: { turn: 12, session: { playerCountryId: 'BGD' } },
    finance: {}, resource: {}, economy: {}
  };
  for (const profile of profiles) {
    const amount = options.treasury?.[profile.iso3] ?? 50000000;
    state.finance[profile.iso3] = {
      available: amount,
      omegaFinance: { treasuryBalanceUsd: amount, lastSyncedTreasuryBalanceUsd: amount, ledger: [] }
    };
    state.resource[profile.iso3] = { industrialNetwork: { projects: [], factoryProductionCycleHistory: [] } };
    state.economy[profile.iso3] = { productionAssets: [] };
  }
  const handlers = new Map();
  const dispatchLog = [];
  const currencies = { BDT: 110, USD: 1, EUR: 0.92, JPY: 150 };
  const fxOverrides = options.fx || {};
  const countryRuntime = {
    ready: Promise.resolve(true),
    getProfile(value) {
      const code = typeof value === 'string' ? value : value?.iso3 || value?.countryCode;
      return profiles.find(row => row.iso3 === code) || null;
    },
    listProfiles() { return profiles.map(clone); }
  };
  const finance = {
    init: async () => ({ status: 'READY' }),
    resolveCountry(value) {
      if (typeof value === 'object' && value) return value;
      return countryRuntime.getProfile(value);
    },
    getProfile(value) { return countryRuntime.getProfile(value); },
    getFinanceState(countryId) {
      const cash = state.finance[countryId]?.available;
      return {
        treasuryBalanceUsd: cash,
        fiscalModel: { annualSpendingUsd: 10000000, debtServiceDueUsd: 0 },
        policy: { minimumReservePctOfAnnualSpending: 10 }
      };
    },
    getIndicators(countryId) {
      if (options.unknownMacro?.includes(countryId)) return {};
      const profile = countryRuntime.getProfile(countryId);
      return {
        gdpCurrentUsd: profile?.gdpCurrentUsd,
        publicDebtToGdpPct: options.debt?.[countryId] ?? 65,
        economicStabilityIndex: 70
      };
    }
  };
  const interop = {
    registerCommandHandler(type, owner, handler) {
      assert.equal(owner, 'finance');
      assert.equal(typeof handler, 'function');
      if (handlers.has(type)) throw new Error('DUPLICATE_FINANCE_HANDLER:' + type);
      handlers.set(type, handler);
      return { commandType: type, ownerMinistry: owner };
    },
    dispatchCommand(source, actionId, countryId, payload, commandOptions = {}) {
      assert.equal(source, 'finance');
      assert.equal(commandOptions.ownerMinistry, 'finance');
      const handler = handlers.get(commandOptions.commandType || actionId);
      if (!handler) return { status: 'FAILED', reason: 'HANDLER_NOT_FOUND' };
      let nextAvailable;
      let nextOmegaFinance;
      const stateTransaction = {
        get(path) {
          if (path === 'finance.available') return state.finance[countryId]?.available;
          if (path === 'finance.omegaFinance') return clone(state.finance[countryId]?.omegaFinance || {});
          throw new Error('UNSUPPORTED_STATE_PATH:' + path);
        },
        set(path, value) {
          if (path === 'finance.available') nextAvailable = Number(value);
          else if (path === 'finance.omegaFinance') nextOmegaFinance = clone(value);
          else throw new Error('UNSUPPORTED_STATE_PATH:' + path);
          return true;
        }
      };
      const context = { countryId, simulationTurn: state.simulation.turn, stateTransaction };
      const result = handler({ payload: clone(payload), commandId: commandOptions.commandId,
        commandType: commandOptions.commandType }, context);
      dispatchLog.push({ commandType: commandOptions.commandType, countryId, result: clone(result) });
      if (result?.accepted === false) return { status: 'FAILED', result };
      if (nextAvailable !== undefined) state.finance[countryId].available = nextAvailable;
      if (nextOmegaFinance !== undefined) state.finance[countryId].omegaFinance = nextOmegaFinance;
      if (state.finance[countryId].omegaFinance) {
        state.finance[countryId].omegaFinance.treasuryBalanceUsd = state.finance[countryId].available;
        state.finance[countryId].omegaFinance.lastSyncedTreasuryBalanceUsd = state.finance[countryId].available;
      }
      return { status: 'APPLIED', result };
    }
  };
  const catalog = {
    factoryProfiles: {
      STEEL: { factoryType: 'STEEL', constructionCost: 250000, unit: 'GAME_CURRENCY_UNITS',
        constructionDays: 180, defaultRecipeId: 'STEEL_STANDARD' }
    },
    downstreamFactoryRecipes: {}
  };
  const sites = profiles.map(profile => ({
    siteId: profile.iso3 + '-IRON-01', countryId: profile.iso3, countryCode: profile.iso3,
    resourceId: 'IRON', real: { resourceId: 'IRON' }, operation: { status: 'ACTIVE' },
    map: { markerEligible: true }
  }));
  const network = {
    catalog,
    loadCatalog: async () => ({ status: 'READY' }),
    quoteMineProject({ countryId, siteId, assignedWorkers }) {
      if (!sites.some(site => site.siteId === siteId && site.countryId === countryId))
        return { status: 'BLOCKED', reason: 'SITE_NOT_FOUND' };
      const costUsd = options.mineCostUsd ?? 2000000;
      return {
        status: 'QUOTED', countryId, siteId, costUsd, durationDays: 120,
        workersRequired: 50, materialsReady: true, staffingReady: true,
        commissioningReady: true,
        treasury: { available: state.finance[countryId]?.available, sufficient: true },
        materials: [{ resourceId: 'STEEL', required: 20, available: 20, sufficient: true }]
      };
    },
    startMineProject(input) {
      const quote = this.quoteMineProject(input);
      if (quote.status !== 'QUOTED') return quote;
      if ((state.finance[input.countryId]?.available ?? 0) < quote.costUsd)
        return { status: 'BLOCKED', reason: 'INSUFFICIENT_TREASURY' };
      state.finance[input.countryId].available -= quote.costUsd;
      state.finance[input.countryId].omegaFinance.treasuryBalanceUsd = state.finance[input.countryId].available;
      const project = {
        projectId: 'MINE:' + input.countryId + ':' + input.siteId,
        requestId: input.requestId, countryId: input.countryId,
        projectType: 'MINE_CONSTRUCTION', siteId: input.siteId,
        costUsd: quote.costUsd, durationDays: quote.durationDays, status: 'UNDER_CONSTRUCTION'
      };
      state.resource[input.countryId].industrialNetwork.projects.push(project);
      return clone(project);
    },
    factoryConstructionMaterialQuote() {
      return { status: 'QUOTED', materials: [] };
    },
    startFactoryProject(input) {
      const project = {
        projectId: 'FACTORY:' + input.countryId + ':' + input.factoryType + ':001',
        requestId: input.requestId, countryId: input.countryId,
        projectType: 'FACTORY_CONSTRUCTION', factoryType: input.factoryType,
        investmentId: input.investmentId || null, sourceInvestmentId: input.sourceInvestmentId || null,
        sourceProposalId: input.sourceProposalId || null, investorCountryId: input.investorCountryId || null,
        factoryId: 'FAC:' + input.countryId + ':' + input.factoryType + ':001',
        cost: input.cost, costUnit: input.costUnit, durationDays: input.buildDays || 180,
        status: 'UNDER_CONSTRUCTION', ownerType: input.ownerType, operatorType: input.operatorType
      };
      state.resource[input.countryId].industrialNetwork.projects.push(project);
      return clone(project);
    },
    startInfrastructureProject(input) {
      const project = {
        projectId: 'INFRA:' + input.countryId + ':' + input.infrastructureType + ':001',
        requestId: input.requestId, countryId: input.countryId,
        projectType: 'INFRASTRUCTURE', infrastructureType: input.infrastructureType,
        cost: input.cost, durationDays: input.buildDays || 180, status: 'UNDER_CONSTRUCTION'
      };
      state.resource[input.countryId].industrialNetwork.projects.push(project);
      return clone(project);
    }
  };
  const sandbox = {
    Game: { state, playerCountry: 'BGD' },
    Omega: {
      Simulation: { world: { state }, getPlayerCountryId: () => 'BGD' },
      FinanceMinistry: finance,
      ForexMonetaryEngine: {
        getCurrencyCode(profile) { return profile.currencyCode; },
        getRate(currency) { return Object.prototype.hasOwnProperty.call(fxOverrides, currency) ? fxOverrides[currency] : currencies[currency] ?? null; }
      },
      CountryRuntimeData: countryRuntime,
      MinistryInteroperability: interop,
      MinistryStateTransaction: { VERSION: 'test' },
      ResourceIndustrialNetwork: network
    },
    OmegaFinanceMinistry: finance,
    OmegaForexMonetaryEngine: {
      getCurrencyCode(profile) { return profile.currencyCode; },
      getRate(currency) { return Object.prototype.hasOwnProperty.call(fxOverrides, currency) ? fxOverrides[currency] : currencies[currency] ?? null; }
    },
    OmegaCountryRuntimeData: countryRuntime,
    OmegaMinistryInteroperability: interop,
    OmegaMinistryStateTransaction: { VERSION: 'test' },
    OmegaResourceIndustrialNetwork: network,
    OmegaResourceIndustrialCatalogData: catalog,
    OmegaResourceSiteCanonicalCatalogData: { sites },
    addEventListener() {}
  };
  sandbox.window = sandbox;
  runInNewContext(source, sandbox);
  return { api: sandbox.OmegaGovernmentInvestmentRuntimeV1, state, handlers, dispatchLog, network };
}

async function ready(h) {
  const diagnostics = await h.api.init();
  assert.equal(diagnostics.ready, true);
  return diagnostics;
}

function mineInput(overrides = {}) {
  return {
    investorCountryId: 'BGD', hostCountryId: 'USA', actorType: 'PLAYER',
    requestId: 'GOV-MINE-0001', amount: 165000000,
    projectType: 'MINE', siteId: 'USA-IRON-01', resourceId: 'IRON',
    quantity: 1, assignedWorkers: 50,
    instrument: 'EQUITY', durationYears: 5, equityShareBps: 2500,
    ...overrides
  };
}

test('runtime registers Finance-owned, country-scoped commands without replacing existing private FDI', async () => {
  const h = makeHarness();
  const diagnostics = await ready(h);
  assert.equal(diagnostics.authority, 'OMEGA_GOVERNMENT_SOVEREIGN_INVESTMENT_V1');
  assert.equal(diagnostics.cashAuthority, 'Game.state.finance[ISO3].available');
  assert.ok(diagnostics.handlerCount >= 20);
  assert.equal(h.handlers.size, diagnostics.handlerCount);
  assert.equal(h.api.getBudget('BGD').status, 'READY');
  assert.equal(h.api.getRiskSnapshot('BGD').riskStatus, 'OBSERVED_WITHIN_POLICY');
});

test('foreign government equity funds a canonical Mine, co-funds the balance from the host Treasury, and preserves both ledgers', async () => {
  const h = makeHarness();
  await ready(h);
  const investorBefore = h.state.finance.BGD.available;
  const hostBefore = h.state.finance.USA.available;
  const result = await h.api.submitProposal(mineInput());
  assert.equal(result.status, 'PROJECT_STARTED', JSON.stringify(result));
  assert.equal(result.proposal.instrument, 'EQUITY');
  assert.equal(result.proposal.projectId, 'MINE:USA:USA-IRON-01');
  assert.equal(result.proposal.capitalAppliedUsd, 1500000);
  assert.equal(result.proposal.hostTreasuryCoFundingUsd, 500000);
  assert.equal(h.state.finance.BGD.available, investorBefore - 1500000);
  assert.equal(h.state.finance.USA.available, hostBefore - 500000);
  const hostInvestment = h.state.finance.USA.omegaFinance.governmentInvestmentV1;
  const investorInvestment = h.state.finance.BGD.omegaFinance.governmentInvestmentV1;
  assert.equal(hostInvestment.receipts[result.proposal.transferId].status, 'SETTLED');
  assert.equal(hostInvestment.investments[0].projectId, 'MINE:USA:USA-IRON-01');
  assert.equal(hostInvestment.investments[0].equityShareBps, 2500);
  assert.equal(hostInvestment.investedCapitalUsd || 0, 0);
  assert.equal(hostInvestment.receivedCapitalUsd, 1500000);
  assert.equal(hostInvestment.capitalizedProjectCapitalUsd, 1500000);
  assert.equal(investorInvestment.investedCapitalUsd, 1500000);
  assert.equal(investorInvestment.transfers[result.proposal.transferId].status, 'SETTLED');
  assert.equal(h.state.finance.USA.omegaFinance.ledger.filter(row => row.type === 'GOVERNMENT_INVESTMENT_PROJECT_CAPEX').length, 1);
  const replay = await h.api.submitProposal(mineInput());
  assert.equal(replay.duplicate, true);
  assert.equal(h.state.finance.BGD.available, investorBefore - 1500000);
  assert.equal(h.state.finance.USA.available, hostBefore - 500000);
});

test('domestic public investment uses a separate instrument and cannot be misreported as foreign equity', async () => {
  const h = makeHarness();
  await ready(h);
  const before = h.state.finance.BGD.available;
  const result = await h.api.submitProposal(mineInput({
    investorCountryId: 'BGD', hostCountryId: 'BGD',
    requestId: 'GOV-DOMESTIC-001', amount: 220000000,
    siteId: 'BGD-IRON-01', instrument: 'DOMESTIC_PUBLIC_CAPEX',
    durationYears: undefined, equityShareBps: undefined
  }));
  assert.equal(result.status, 'PROJECT_STARTED', JSON.stringify(result));
  assert.equal(result.proposal.instrument, 'DOMESTIC_PUBLIC_CAPEX');
  assert.equal(result.proposal.domesticPublicCapex, true);
  assert.equal(h.state.finance.BGD.available, before - 2000000);
  assert.equal(h.state.finance.BGD.omegaFinance.governmentInvestmentV1.outboundInvestedCapitalUsd || 0, 0);
  assert.ok(h.state.finance.BGD.omegaFinance.ledger.some(row =>
    row.debitAccount === 'GOVERNMENT:DOMESTIC_PUBLIC_CAPITAL'));
  const invalid = await h.api.submitProposal(mineInput({
    investorCountryId: 'BGD', hostCountryId: 'BGD', requestId: 'GOV-DOMESTIC-BAD',
    amount: 220000000, instrument: 'EQUITY'
  }));
  assert.equal(invalid.reason, 'DOMESTIC_INVESTMENT_MUST_USE_PUBLIC_CAPEX_INSTRUMENT');
});

test('factory investment preserves catalog cost units and links Finance CAPEX to the created project id', async () => {
  const h = makeHarness();
  await ready(h);
  const result = await h.api.submitProposal(mineInput({
    requestId: 'GOV-FACTORY-001', projectType: 'FACTORY',
    factoryType: 'STEEL', amount: 165000000,
    instrument: 'JOINT_VENTURE', equityShareBps: 3000
  }));
  assert.equal(result.status, 'PROJECT_STARTED', JSON.stringify(result));
  assert.equal(result.proposal.factoryCatalogConstructionCost, 250000);
  assert.equal(result.proposal.factoryCatalogCostUnit, 'GAME_CURRENCY_UNITS');
  assert.equal(result.proposal.projectId, 'FACTORY:USA:STEEL:001');
  const hostInv = h.state.finance.USA.omegaFinance.governmentInvestmentV1;
  assert.ok(hostInv.investments.some(row => row.projectId === 'FACTORY:USA:STEEL:001'));
  assert.ok(h.state.finance.USA.omegaFinance.ledger.some(row => row.projectId === 'FACTORY:USA:STEEL:001' && row.type === 'GOVERNMENT_INVESTMENT_PROJECT_CAPEX'));
  const project = h.state.resource.USA.industrialNetwork.projects[0];
  assert.equal(project.costUnit, 'GAME_CURRENCY_UNITS');
  assert.equal(project.ownerType, 'STATE_OWNED_ENTERPRISE');
});

test('loan investment creates borrower and lender schedules and services an evidenced installment', async () => {
  const h = makeHarness();
  await ready(h);
  const result = await h.api.submitProposal(mineInput({
    requestId: 'GOV-LOAN-001', instrument: 'LOAN', durationYears: 5,
    annualInterestRateBps: 500, gracePeriodYears: 0,
    equityShareBps: undefined
  }));
  assert.equal(result.status, 'PROJECT_STARTED', JSON.stringify(result));
  const hostInv = h.state.finance.USA.omegaFinance.governmentInvestmentV1;
  const investorInv = h.state.finance.BGD.omegaFinance.governmentInvestmentV1;
  assert.equal(hostInv.loans.length, 1);
  assert.equal(investorInv.loans.length, 1);
  assert.equal(hostInv.loans[0].ownerRole, 'BORROWER');
  assert.equal(investorInv.loans[0].ownerRole, 'LENDER');
  h.state.simulation.turn = hostInv.loans[0].nextDueTurn;
  const hostBefore = h.state.finance.USA.available;
  const investorBefore = h.state.finance.BGD.available;
  const serviced = h.api.serviceLoans('USA');
  assert.equal(serviced.status, 'PROCESSED', JSON.stringify(serviced));
  assert.equal(serviced.paid.length, 1);
  assert.ok(h.state.finance.USA.available < hostBefore);
  assert.ok(h.state.finance.BGD.available > investorBefore);
  const hostInvAfter = h.state.finance.USA.omegaFinance.governmentInvestmentV1;
  assert.ok(hostInvAfter.loans[0].totalInterestPaidUsd > 0);
});

test('equity return is blocked without realized project net-profit evidence, then paid once against exact project evidence', async () => {
  const h = makeHarness();
  await ready(h);
  const proposal = await h.api.submitProposal(mineInput({ requestId: 'GOV-RETURN-001' }));
  assert.equal(proposal.status, 'PROJECT_STARTED');
  const investorBefore = h.state.finance.BGD.available;
  const missing = h.api.distributeProjectProfit({
    hostCountryId: 'USA', investorCountryId: 'BGD',
    projectId: proposal.proposal.projectId, sourceTransactionId: 'MISSING'
  });
  assert.equal(missing.reason, 'VERIFIED_PROJECT_DISTRIBUTABLE_NET_PROFIT_NOT_FOUND');
  const hostLedger = h.state.finance.USA.omegaFinance.ledger;
  hostLedger.push({
    transactionId: 'PROJECT-NET-PROFIT-001', type: 'PROJECT_NET_PROFIT',
    status: 'POSTED', projectId: proposal.proposal.projectId,
    distributableNetProfitUsd: 500000
  });
  const first = h.api.distributeProjectProfit({
    hostCountryId: 'USA', investorCountryId: 'BGD',
    projectId: proposal.proposal.projectId, sourceTransactionId: 'PROJECT-NET-PROFIT-001'
  });
  assert.equal(first.status, 'DISTRIBUTED');
  assert.equal(first.amountUsd, 125000);
  assert.equal(h.state.finance.BGD.available, investorBefore + 125000);
  const replay = h.api.distributeProjectProfit({
    hostCountryId: 'USA', investorCountryId: 'BGD',
    projectId: proposal.proposal.projectId, sourceTransactionId: 'PROJECT-NET-PROFIT-001'
  });
  assert.equal(replay.status, 'DISTRIBUTED');
  assert.equal(h.state.finance.BGD.available, investorBefore + 125000);
});

test('FX gaps, over-budget concentration, wrong domestic instrument, and unverified country identities are refused', async () => {
  const noFx = makeHarness({ fx: { BDT: null } });
  await ready(noFx);
  const missingFx = await noFx.api.submitProposal(mineInput());
  assert.equal(missingFx.reason, 'CROSS_BORDER_FX_RATE_UNAVAILABLE');
  const budget = makeHarness({ treasury: { BGD: 1000000 } });
  await ready(budget);
  const tooLarge = await budget.api.submitProposal(mineInput({ amount: 10000000000 }));
  assert.equal(tooLarge.reason, 'SOVEREIGN_INVESTMENT_CONCENTRATION_LIMIT');
  const invalidCountry = await budget.api.submitProposal(mineInput({ investorCountryId: 'Atlantis' }));
  assert.equal(invalidCountry.reason, 'VALID_ISO3_INVESTOR_AND_HOST_COUNTRIES_REQUIRED');
});

test('bounded NPC cycle never uses the active player as an NPC investor and can send proposals to the player host', async () => {
  const h = makeHarness();
  await ready(h);
  h.state.resource.BGD.industrialNetwork.projects.push({
    projectId: 'PUBLIC-POWER-001', projectType: 'INFRASTRUCTURE',
    infrastructureType: 'power', costUsd: 100000000,
    status: 'COMPLETED', durationDays: 365
  });
  const cycle = await h.api.runNpcDecisionCycle({ hostCountryIds: ['BGD'] });
  assert.equal(cycle.status, 'COMPLETED');
  assert.ok(cycle.proposalsCreated <= 12);
  assert.ok(cycle.proposals.length > 0, JSON.stringify(cycle));
  assert.ok(cycle.proposals.every(row => row.investorCountryId !== 'BGD'));
  assert.ok(cycle.proposals.every(row => row.hostCountryId === 'BGD'));
  const incoming = h.api.getPortfolio('BGD').inboundProposals;
  assert.ok(incoming.length > 0, JSON.stringify({ cycle, incoming }));
  assert.ok(incoming.every(row => row.investorCountryId !== 'BGD'));
  assert.ok(incoming.every(row => row.status === 'PENDING_HOST_APPROVAL'));
  const nextCycle = await h.api.runNpcDecisionCycle({ hostCountryIds: ['BGD'] });
  assert.equal(nextCycle.status, 'COMPLETED');
  const afterNpcReview = h.api.getPortfolio('BGD').inboundProposals;
  assert.ok(afterNpcReview.every(row => row.status === 'PENDING_HOST_APPROVAL'),
    'NPC cycles must never approve or decline a proposal addressed to the active player country');
});

test('unknown host macro evidence leaves an NPC proposal for review rather than auto-approving it', async () => {
  const h = makeHarness({ unknownMacro: ['USA'] });
  await ready(h);
  const result = await h.api.submitProposal(mineInput({
    investorCountryId: 'DEU', hostCountryId: 'USA',
    actorType: 'NPC', __omegaNpcDecisionAuthority: 'OMEGA_GOVERNMENT_SOVEREIGN_INVESTMENT_V1',
    requestId: 'GOV-NPC-REVIEW-001', amount: 920000, amountUsd: 1000000
  }));
  assert.equal(result.status, 'PENDING_HOST_REVIEW');
  assert.equal(result.hostDecision.decision, 'REVIEW');
  const unauthorized = await h.api.respondProposal({
    hostCountryId: 'USA', proposalId: result.proposal.proposalId,
    decision: 'ACCEPT', actorType: 'NPC'
  });
  assert.equal(unauthorized.reason, 'NPC_DECISION_ENGINE_AUTHORITY_REQUIRED');
});

test('government funding request routes to its selected investor, then one investment identity reaches commissioning and real production', async () => {
  const h = makeHarness();
  await ready(h);
  const investorTreasuryBefore = h.state.finance.DEU.available;
  const hostTreasuryBefore = h.state.finance.BGD.available;
  const request = await h.api.requestGovernmentInvestment({
    hostCountryId: 'BGD', targetInvestorCountryId: 'DEU', requestId: 'REQ-BGD-DEU-FACTORY-001',
    amountUsd: 1000000, projectType: 'FACTORY', factoryType: 'STEEL',
    instrument: 'JOINT_VENTURE', durationYears: 5, equityShareBps: 2500, buildDays: 60,
    projectDescription: 'Increase domestic steelmaking capacity'
  });
  assert.equal(request.status, 'PENDING_INVESTOR_REVIEW', JSON.stringify(request));
  const requestRecord = h.api.getPortfolio('BGD').fundingRequests[0];
  assert.equal(requestRecord.targetInvestorCountryId, 'DEU');
  assert.equal(requestRecord.status, 'PENDING_INVESTOR_REVIEW');
  assert.equal(requestRecord.investmentId, 'GOVINV:DEU:BGD:REQ-BGD-DEU-FACTORY-001');
  assert.equal(h.state.finance.DEU.available, investorTreasuryBefore, 'request must not reserve investor cash');
  assert.equal(h.state.finance.BGD.available, hostTreasuryBefore, 'request must not move host cash');
  const screening = await h.api.runNpcDecisionCycle({ hostCountryIds: ['BGD'], investorCountryIds: ['DEU'] });
  assert.equal(screening.status, 'COMPLETED', JSON.stringify(screening));
  const reviewedRequest = h.api.getPortfolio('BGD').fundingRequests[0];
  assert.equal(reviewedRequest.status, 'OFFER_ISSUED', JSON.stringify(screening));
  const incoming = h.api.getPortfolio('BGD').inboundProposals.find(row => row.proposalId === reviewedRequest.proposalId);
  assert.ok(incoming, 'selected target government must issue a formal proposal');
  assert.equal(incoming.investorCountryId, 'DEU');
  assert.equal(incoming.hostCountryId, 'BGD');
  assert.equal(incoming.investmentId, requestRecord.investmentId);
  assert.equal(incoming.status, 'PENDING_HOST_APPROVAL');
  assert.equal(h.state.finance.DEU.available, investorTreasuryBefore, 'formal offer must not reserve investor cash before host approval');
  assert.equal(h.state.finance.BGD.available, hostTreasuryBefore, 'formal offer must not transfer funds before host approval');
  const funded = await h.api.respondProposal({ hostCountryId: 'BGD', proposalId: incoming.proposalId, decision: 'ACCEPT' });
  assert.equal(funded.status, 'PROJECT_STARTED', JSON.stringify(funded));
  assert.equal(funded.proposal.investmentId, requestRecord.investmentId);
  const project = h.state.resource.BGD.industrialNetwork.projects.find(row => row.projectId === funded.proposal.projectId);
  assert.ok(project);
  assert.equal(project.investmentId, requestRecord.investmentId);
  const hostInvestment = h.state.finance.BGD.omegaFinance.governmentInvestmentV1.investments.find(row => row.projectId === project.projectId);
  assert.equal(hostInvestment.investmentId, requestRecord.investmentId);
  assert.equal(h.state.finance.BGD.omegaFinance.ledger.find(row => row.type === 'GOVERNMENT_INVESTMENT_PROJECT_CAPEX').investmentId,
    requestRecord.investmentId);
  let portfolioRow = h.api.getPortfolio('BGD').investments.find(row => row.projectId === project.projectId);
  assert.equal(portfolioRow.lifecycle.stage, 'CONSTRUCTION');
  assert.equal(portfolioRow.lifecycle.investmentId, requestRecord.investmentId);
  project.status = 'COMPLETED';
  h.state.economy.BGD.productionAssets.push({
    id: project.factoryId, countryId: 'BGD', constructionProjectId: project.projectId,
    investmentId: requestRecord.investmentId, status: 'OPERATIONAL', commissionedTurn: 20,
    companyId: 'STATE_INDUSTRY_BGD'
  });
  portfolioRow = h.api.getPortfolio('BGD').investments.find(row => row.projectId === project.projectId);
  assert.equal(portfolioRow.lifecycle.stage, 'COMMISSIONED');
  assert.equal(portfolioRow.lifecycle.commissionedTurn, 20);
  h.state.resource.BGD.industrialNetwork.factoryProductionCycleHistory.push({
    cycleId: 'FACTORYCYCLE:BGD:FAC:STEEL:001:T21:1', factoryId: project.factoryId,
    investmentId: requestRecord.investmentId, status: 'COMPLETED', transactionId: 'PRODUCTION-TX-001',
    actualProductionQuantity: 125, outputQuantities: { STEEL: 125 }, turn: 21
  });
  portfolioRow = h.api.getPortfolio('BGD').investments.find(row => row.projectId === project.projectId);
  assert.equal(portfolioRow.lifecycle.stage, 'PRODUCTION');
  assert.equal(portfolioRow.lifecycle.investmentId, requestRecord.investmentId);
  assert.equal(portfolioRow.lifecycle.productionTransactionId, 'PRODUCTION-TX-001');
  assert.equal(portfolioRow.lifecycle.actualProductionQuantity, 125);
});

test('a selected foreign government declines a funding request when its sovereign debt risk exceeds policy', async () => {
  const h = makeHarness({ debt: { DEU: 160 } });
  await ready(h);
  const investorBefore = h.state.finance.DEU.available;
  const hostBefore = h.state.finance.BGD.available;
  const request = await h.api.requestGovernmentInvestment({
    hostCountryId: 'BGD', targetInvestorCountryId: 'DEU', requestId: 'REQ-BGD-DEU-RISK-001',
    amountUsd: 1000000, projectType: 'FACTORY', factoryType: 'STEEL',
    instrument: 'JOINT_VENTURE', durationYears: 5, equityShareBps: 2500
  });
  assert.equal(request.status, 'PENDING_INVESTOR_REVIEW');
  const cycle = await h.api.runNpcDecisionCycle({ hostCountryIds: ['BGD'], investorCountryIds: ['DEU'] });
  assert.equal(cycle.status, 'COMPLETED');
  assert.equal(h.api.getPortfolio('BGD').fundingRequests[0].status, 'DECLINED_BY_INVESTOR');
  assert.equal(h.api.getPortfolio('BGD').inboundProposals.length, 0);
  assert.equal(h.state.finance.DEU.available, investorBefore);
  assert.equal(h.state.finance.BGD.available, hostBefore);
});

test('investment duration and return projections stay explicit and do not fabricate ROI or jobs', async () => {
  const h = makeHarness();
  await ready(h);
  const result = await h.api.submitProposal(mineInput());
  assert.equal(result.status, 'PROJECT_STARTED');
  assert.equal(result.investment.estimatedAnnualReturnUsd, null);
  assert.equal(result.investment.estimatedPaybackYears, null);
  assert.match(result.investment.returnStatus, /NO_GUARANTEED_RETURN/);
  assert.equal(h.api.diagnostics().syntheticProfit, false);
  assert.equal(h.api.diagnostics().syntheticJobs, false);
});
