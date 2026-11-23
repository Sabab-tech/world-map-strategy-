import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const engineSource = await readFile(new URL('../omega_autonomous_national_trade_decision_engine_v1.js', import.meta.url), 'utf8');
const rules = JSON.parse(await readFile(new URL('../omega_autonomous_national_trade_decision_rules_v1.json', import.meta.url), 'utf8'));

function createRuntime(options = {}) {
  const state = {
    simulation: { turn: 1, session: { playerCountryId: 'USA' } },
    trade: {
      AUS: { importRequests: [], bilateralProposalOutbox: [], bilateralProposalInbox: [], bilateralContracts: [] },
      CAN: { importRequests: [], bilateralProposalOutbox: [], bilateralProposalInbox: [], bilateralContracts: [] },
      MEX: { importRequests: [], bilateralProposalOutbox: [], bilateralProposalInbox: [], bilateralContracts: [] }
    },
    resource: {
      AUS: {
        inventory: { iron_ore: 5 },
        demandRuntime: { byResource: options.demandRows === undefined ? {
          iron_ore: {
            resourceId: 'iron_ore', status: 'SHORTAGE', demandPerDay: 2,
            spendableStockAfter: 5, pendingImportQuantity: 0,
            unresolvedImportRequestCount: 0, stockCoverageTargetDays: 30,
            procurementScore: 0.9, priority: 5, unmetDemand: 1
          }
        } : options.demandRows }
      },
      CAN: { inventory: {}, demandRuntime: { byResource: {} } },
      MEX: { inventory: {}, demandRuntime: { byResource: {} } }
    },
    foreign: {
      AUS: { relations: {
        CAN: { overall: 80, trade: 85, trust: 80, political: 75 },
        MEX: { overall: 70, trade: 70, trust: 70, political: 70 }
      } },
      CAN: { relations: { AUS: { overall: 80, trade: 85, trust: 80, political: 75 } } },
      MEX: { relations: { AUS: { overall: 70, trade: 70, trust: 70, political: 70 } } }
    }
  };
  if (options.noRelations) {
    state.foreign.AUS.relations = {};
    state.foreign.CAN.relations = {};
    state.foreign.MEX.relations = {};
  }
  if (options.contracts) state.trade.AUS.bilateralContracts = structuredClone(options.contracts);
  if (options.outbox) state.trade.AUS.bilateralProposalOutbox = structuredClone(options.outbox);

  const commandHandlers = new Map();
  const schedulerRegistrations = [];
  const dispatchLog = [];
  const reports = new Map();
  const metrics = { supplierCalls: 0, marketPriceCalls: 0, previewCalls: 0, proposalCalls: 0, syncCalls: 0, acceptCalls: 0, demandCalls: {} };
  const key = (a, b) => a + '|' + b;

  const interop = {
    registerAction() {},
    registerCommandHandler(type, owner, handler) { commandHandlers.set(type, { owner, handler }); },
    dispatchCommand(owner, type, countryId, payload, metadata = {}) {
      dispatchLog.push({ owner, type, countryId, payload: structuredClone(payload), metadata });
      if (type === 'OMEGA_AUTONOMOUS_NATIONAL_TRADE_CHECKPOINT') {
        const registered = commandHandlers.get(type);
        assert.ok(registered, 'checkpoint command must be registered');
        const ctx = {
          countryId,
          stateTransaction: {
            get(path) {
              assert.equal(path, 'trade.autonomousNationalTradeDecision');
              return state.trade[countryId].autonomousNationalTradeDecision || null;
            },
            set(path, value) {
              assert.equal(path, 'trade.autonomousNationalTradeDecision');
              state.trade[countryId].autonomousNationalTradeDecision = structuredClone(value);
            }
          }
        };
        return { status: 'APPLIED', result: registered.handler({ payload }, ctx) };
      }
      if (type === 'OMEGA_BILATERAL_APPLY_RESPONSE') {
        const rows = state.trade[countryId].bilateralProposalOutbox;
        const row = rows.find(x => x.proposalId === payload.proposalId);
        assert.ok(row, 'counteroffer response must match an existing outbox proposal');
        row.decision = structuredClone(payload.review);
        row.status = payload.review.decision;
        row.lastResponseTurn = state.simulation.turn;
        return { status: 'APPLIED', result: { accepted: true, proposalId: row.proposalId, status: row.status } };
      }
      return { status: 'FAILED', reason: 'UNEXPECTED_COMMAND:' + type };
    }
  };

  const scheduler = {
    registerCountryHandler(id, handler, config) {
      schedulerRegistrations.push({ id, handler, config });
      return () => {};
    }
  };

  const bilateral = {
    getProposals(countryId) {
      const own = state.trade[countryId] || {};
      return {
        outbox: structuredClone(own.bilateralProposalOutbox || []),
        inbox: structuredClone(own.bilateralProposalInbox || [])
      };
    },
    getContracts(countryId) {
      return structuredClone((state.trade[countryId] || {}).bilateralContracts || []);
    },
    getBilateralTradeBalance(countryId, partnerId) {
      const completed = state.trade.AUS.bilateralContracts
        .filter(x => x.partnerCountryId === partnerId)
        .reduce((sum, row) => sum + (Number(row.completedDeliveries) || 0), 0);
      return { status: 'OBSERVED_SETTLEMENTS_ONLY', settledTransactionCount: completed, tradeBalance: 15 };
    },
    getMarketReport(countryId, partnerId) {
      return reports.get(key(countryId, partnerId)) || { status: 'NOT_SYNCED', report: null };
    },
    syncMarket(countryId, partnerId) {
      metrics.syncCalls++;
      reports.set(key(countryId, partnerId), {
        status: 'CURRENT',
        report: { snapshotId: 'TEST-MARKET-' + countryId + '-' + partnerId, generatedTurn: state.simulation.turn }
      });
      return { accepted: true, report: reports.get(key(countryId, partnerId)).report };
    },
    previewProposal(countryId, payload) {
      metrics.previewCalls++;
      if (options.previewResult) return structuredClone(options.previewResult);
      return {
        status: 'FEASIBLE', canSend: true, reason: 'CURRENT_STOCK_AND_PAYMENT_CAPACITY_OBSERVED',
        direction: payload.direction, resourceId: payload.resourceId,
        quantityPerDelivery: payload.quantityPerDelivery, marketSnapshotId: 'TEST'
      };
    },
    createProposal(countryId, payload) {
      metrics.proposalCalls++;
      const proposal = {
        proposalId: 'TEST-PROPOSAL-' + metrics.proposalCalls,
        requestorCountryId: countryId, targetCountryId: payload.targetCountryId,
        direction: payload.direction, resourceId: payload.resourceId,
        quantityPerDelivery: payload.quantityPerDelivery, unitPrice: payload.unitPrice,
        status: 'SENT', createdTurn: state.simulation.turn
      };
      state.trade[countryId].bilateralProposalOutbox.push(proposal);
      state.trade[payload.targetCountryId].bilateralProposalInbox.push({ ...proposal, inboxStatus: 'PENDING' });
      return { accepted: true, proposal };
    },
    acceptCounteroffer(countryId, proposalId) {
      metrics.acceptCalls++;
      const row = state.trade[countryId].bilateralProposalOutbox.find(x => x.proposalId === proposalId);
      row.status = 'ACCEPTED_COUNTER';
      return { accepted: true, status: 'ACTIVE', agreementId: 'TEST-AGREEMENT' };
    }
  };

  const market = {
    suppliers(resourceId, quantity, buyerId) {
      metrics.supplierCalls++;
      if (options.suppliers) return structuredClone(options.suppliers);
      return [
        { countryId: 'CAN', available: 100 },
        { countryId: 'MEX', available: 80 }
      ];
    },
    executableLocalPrice(countryId, resourceId) {
      metrics.marketPriceCalls++;
      if (options.priceMap && Object.prototype.hasOwnProperty.call(options.priceMap, countryId))
        return options.priceMap[countryId];
      return countryId === 'CAN' ? 10 : 12;
    }
  };

  const trade = {
    relationScore(row) {
      const values = ['overall', 'trade', 'trust', 'political']
        .map(key => row[key] === undefined ? null : Number(row[key]) / 100).filter(x => x !== null);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    },
    settlementValues(buyerId, sellerId, quantity, unitPrice) {
      if (options.fxUnavailable) return { buyerValue: null, sellerValue: null, fx: null };
      return { buyerValue: quantity * unitPrice, sellerValue: quantity * unitPrice, fx: 1 };
    }
  };

  const context = {
    console, setTimeout, clearTimeout, structuredClone,
    Game: { state },
    Omega: {
      MinistryInteroperability: interop,
      WorldSimulationScheduler: scheduler,
      BilateralTradeAgreementV1: bilateral,
      GlobalMarket: market,
      GlobalTrade: trade,
      ResourceNationalDemandRuntime: {
        evaluateDemand(countryId) {
          metrics.demandCalls[countryId] = (metrics.demandCalls[countryId] || 0) + 1;
          const rows = state.resource[countryId]?.demandRuntime?.byResource || {};
          return { countryId, turn: state.simulation.turn, status: 'ACTIVE',
            profiles: Object.keys(rows).map(key => structuredClone(rows[key])),
            mode: 'READ_ONLY', stateMutation: false };
        }
      }
    },
    __OmegaGlobalCommercialBaselineIndex: options.commercialBaselineIndex,
    __OmegaGlobalCommercialBaselineShards: options.commercialBaselineShards,
    __OmegaAutonomousNationalTradeDecisionRules: options.pendingRules ? undefined : (() => {
      const configured = structuredClone(rules);
      if (options.readOnly === true) {
        configured.autonomousProposals = false;
        configured.autonomousCounteroffers = false;
        configured.marketIntelligenceSyncEnabled = false;
      } else if (options.enablePhase2 === true) {
        configured.autonomousProposals = true;
        configured.autonomousCounteroffers = true;
        configured.marketIntelligenceSyncEnabled = true;
      } else if (options.partialPhase2 === true) {
        configured.autonomousProposals = true;
        configured.autonomousCounteroffers = false;
        configured.marketIntelligenceSyncEnabled = false;
      }
      return configured;
    })(),
    fetch: options.pendingRules ? (() => new Promise(() => {})) : undefined,
    addEventListener() {}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(engineSource, context, { filename: 'omega_autonomous_national_trade_decision_engine_v1.js' });

  return {
    context, state, bilateral, schedulerRegistrations, dispatchLog, metrics, reports,
    process: (countryId, turnNumber) => {
      state.simulation.turn = turnNumber;
      return context.Omega.AutonomousNationalTradeDecisionV1.processCountry(countryId, { turn: turnNumber });
    }
  };
}


test('global commercial baseline expands NPC trade partners and only ranks live market evidence', async () => {
  const baselineIndex = {
    schemaVersion: 1,
    datasetId: 'OMEGA_GLOBAL_COMMERCIAL_BASELINE_V1',
    countryCount: 197,
    commodityCount: 185,
    countries: {
      AUS: { majorPartners: [['CAN', 50], ['MEX', 50]] },
      CAN: { majorPartners: [['AUS', 70]] },
      MEX: { majorPartners: [['AUS', 70]] }
    },
    commodityToShard: { iron_ore: '01' },
    shards: [{ id: '01', file: 'omega_global_commercial_baseline_v1_part_01.json' }]
  };
  const shard = {
    schemaVersion: 1,
    datasetId: 'OMEGA_GLOBAL_COMMERCIAL_BASELINE_V1',
    shardId: '01',
    commodityCount: 1,
    commodities: {
      iron_ore: {
        productType: 'RAW_RESOURCE',
        productRole: 'INDUSTRIAL_INTERMEDIATE',
        countries: {
          AUS: {
            supplierPartners: [['MEX', 90], ['CAN', 10]],
            buyerMarkets: []
          }
        }
      }
    }
  };
  const runtime = createRuntime({
    noRelations: true,
    priceMap: { CAN: 10, MEX: 10 },
    commercialBaselineIndex: baselineIndex,
    commercialBaselineShards: { '01': shard }
  });

  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'PLANNED');
  assert.equal(result.topCandidate.direction, 'IMPORT');
  assert.equal(result.topCandidate.targetCountryId, 'MEX',
    'commodity-specific supplier share breaks equal-price ties');
  assert.equal(runtime.metrics.supplierCalls, 1, 'the existing live supplier authority is still queried');
  assert.equal(runtime.metrics.marketPriceCalls > 0, true, 'a cleared live market price is still required');
  assert.equal(runtime.metrics.proposalCalls, 0, 'baseline preferences never create a proposal by themselves');
  assert.deepEqual(runtime.state.resource.AUS.inventory, { iron_ore: 5 },
    'baseline profiles do not create or credit inventory');
  assert.equal(runtime.state.trade.AUS.importRequests.length, 0);
  const diagnostics = runtime.context.Omega.AutonomousNationalTradeDecisionV1.diagnostics();
  assert.equal(diagnostics.commercialBaselineStatus, 'READY');
  assert.equal(diagnostics.commercialBaselineLoadedShardCount, 1);
});

test('registers only on the existing ACTIVE/MACRO scheduler and never schedules the player country', async () => {
  const runtime = createRuntime();
  assert.equal(runtime.schedulerRegistrations.length, 1);
  assert.deepEqual(Array.from(runtime.schedulerRegistrations[0].config.tiers), ['ACTIVE', 'MACRO']);
  assert.equal(runtime.schedulerRegistrations[0].config.priority, 75);

  const result = await runtime.process('USA', 1);
  assert.equal(result.status, 'SKIPPED');
  assert.equal(result.reason, 'PLAYER_COUNTRY_AUTOMATION_DISABLED');
  assert.equal(runtime.metrics.proposalCalls, 0);

  const diag = runtime.context.Omega.AutonomousNationalTradeDecisionV1.diagnostics();
  assert.equal(diag.createsIndependentScheduler, false);
  assert.equal(diag.usesTimersOrAnimationLoop, false);
  assert.equal(diag.playerCountryAutomation, false);
});

test('production rules enable all Phase 2 flags together and run PLAN, sync and proposal across separate visits', async () => {
  assert.equal(rules.autonomousProposals, true);
  assert.equal(rules.autonomousCounteroffers, true);
  assert.equal(rules.marketIntelligenceSyncEnabled, true);
  const runtime = createRuntime();
  const productionDiag = runtime.context.Omega.AutonomousNationalTradeDecisionV1.diagnostics();
  assert.equal(productionDiag.rolloutMode, 'AUTONOMOUS');
  assert.equal(productionDiag.autonomousProposals, true);
  assert.equal(productionDiag.autonomousCounteroffers, true);
  assert.equal(productionDiag.marketIntelligenceSyncEnabled, true);
  runtime.state.resource.AUS.demandRuntime.byResource.copper_ore = {
    resourceId: 'copper_ore', status: 'SHORTAGE', demandPerDay: 1,
    spendableStockAfter: 29, pendingImportQuantity: 0,
    unresolvedImportRequestCount: 0, stockCoverageTargetDays: 30,
    procurementScore: 0.5, priority: 3, unmetDemand: 1
  };

  const plan = await runtime.process('AUS', 1);
  assert.equal(plan.status, 'PLANNED');
  assert.equal(plan.candidateCount, 2);
  assert.equal(runtime.metrics.supplierCalls, 1, 'global market roster scan is capped to one resource per visit');
  assert.equal(runtime.metrics.syncCalls, 0);
  assert.equal(runtime.metrics.proposalCalls, 0);
  assert.equal(runtime.state.trade.AUS.autonomousNationalTradeDecision.phase, 'MARKET_INTELLIGENCE');

  const synced = await runtime.process('AUS', 2);
  assert.equal(synced.status, 'MARKET_INTELLIGENCE_SYNCED');
  assert.equal(runtime.metrics.syncCalls, 1);
  assert.equal(runtime.metrics.proposalCalls, 0);
  assert.equal(runtime.state.trade.AUS.autonomousNationalTradeDecision.phase, 'VALIDATE');

  const proposed = await runtime.process('AUS', 3);
  assert.equal(proposed.status, 'PROPOSAL_SENT');
  assert.equal(runtime.metrics.proposalCalls, 1);
  assert.equal(runtime.metrics.previewCalls, 1);
  assert.equal(proposed.proposal.proposal.direction, 'IMPORT');
  assert.equal(proposed.proposal.proposal.resourceId, 'iron_ore');
  assert.equal(proposed.proposal.proposal.targetCountryId, 'CAN');
  assert.equal(proposed.proposal.proposal.quantityPerDelivery, 55);
  assert.equal(runtime.state.trade.AUS.autonomousNationalTradeDecision.phase, 'PLAN');

  const duplicate = await runtime.process('AUS', 3);
  assert.equal(duplicate.status, 'ALREADY_PROCESSED');
  assert.equal(runtime.metrics.proposalCalls, 1);
  const afterCooldown = await runtime.process('AUS', 28);
  assert.equal(afterCooldown.status, 'PLANNED');
  const nextCandidates = runtime.context.Omega.AutonomousNationalTradeDecisionV1.getDecisionPlan('AUS').candidates;
  assert.ok(nextCandidates.length > 0);
  assert.ok(nextCandidates.every(row => row.targetCountryId !== 'CAN'),
    'the existing pending CAN proposal must not be duplicated');
  assert.ok(nextCandidates.some(row => row.targetCountryId === 'MEX'),
    'a different feasible supplier remains available as an alternative');
  assert.equal(runtime.metrics.proposalCalls, 1);
});

test('explicit read-only mode saves a ranked plan without syncing market data or sending proposals', async () => {
  const runtime = createRuntime({ readOnly: true });
  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'PLANNED_READ_ONLY');
  assert.equal(result.phase, 'PLAN');
  assert.ok(result.candidateCount > 0);
  assert.equal(runtime.metrics.supplierCalls, 1);
  assert.equal(runtime.metrics.syncCalls, 0);
  assert.equal(runtime.metrics.proposalCalls, 0);
  assert.equal(runtime.metrics.previewCalls, 0);
  const plan = runtime.context.Omega.AutonomousNationalTradeDecisionV1.getDecisionPlan('AUS');
  assert.equal(plan.phase, 'PLAN');
  assert.ok(plan.candidates.length > 0);
  const diag = runtime.context.Omega.AutonomousNationalTradeDecisionV1.diagnostics();
  assert.equal(diag.rolloutMode, 'READ_ONLY_PLANNER');
  assert.equal(diag.autonomousProposals, false);
  assert.equal(diag.autonomousCounteroffers, false);
  assert.equal(diag.marketIntelligenceSyncEnabled, false);
});

test('rejects a partially enabled Phase 2 rules configuration', async () => {
  const runtime = createRuntime({ partialPhase2: true });
  const result = await runtime.context.Omega.AutonomousNationalTradeDecisionV1.prepare();
  assert.equal(result.status, 'UNAVAILABLE');
  assert.match(result.reason, /RULES_INVALID/);
  const visit = await runtime.process('AUS', 1);
  assert.equal(visit.status, 'DEFERRED');
  assert.equal(runtime.metrics.proposalCalls, 0);
  assert.equal(runtime.metrics.syncCalls, 0);
});

test('does not block the world-turn scheduler while offline rules are still loading', async () => {
  const runtime = createRuntime({ pendingRules: true });
  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'DEFERRED');
  assert.equal(result.reason, 'AUTONOMOUS_TRADE_RULES_LOADING');
  assert.equal(runtime.metrics.supplierCalls, 0);
  assert.equal(runtime.metrics.syncCalls, 0);
  assert.equal(runtime.metrics.proposalCalls, 0);
});

test('ranks national import gaps against the engine 30-day coverage policy, not the player cache score', async () => {
  const runtime = createRuntime({ enablePhase2: true });
  runtime.state.resource.AUS.demandRuntime.byResource.copper_ore = {
    resourceId: 'copper_ore', status: 'BALANCED', demandPerDay: 1,
    spendableStockAfter: 28, pendingImportQuantity: 0,
    unresolvedImportRequestCount: 0, stockCoverageTargetDays: 3,
    procurementScore: 0, priority: 5
  };
  runtime.state.resource.AUS.demandRuntime.byResource.iron_ore.procurementScore = 0;
  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'PLANNED');
  assert.equal(result.topCandidate.resourceId, 'iron_ore',
    'the larger 30-day import gap must outrank a zero-score player 3-day coverage cache');
  assert.equal(result.topCandidate.quantityPerDelivery, 55);
  assert.equal(runtime.metrics.supplierCalls, 1);
});

test('ranks import suppliers by cleared buyer-currency cost rather than ISO ordering', async () => {
  const runtime = createRuntime({
    enablePhase2: true,
    suppliers: [
      { countryId: 'MEX', available: 80 },
      { countryId: 'CAN', available: 100 }
    ],
    priceMap: { MEX: 8, CAN: 10 }
  });
  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'PLANNED');
  assert.equal(result.topCandidate.targetCountryId, 'MEX');
  assert.equal(result.topCandidate.expectedBuyerUnitCost, 8);
  assert.equal(runtime.metrics.supplierCalls, 1);
  assert.equal(runtime.context.Omega.AutonomousNationalTradeDecisionV1.diagnostics().maximumMarketSupplierScansPerCountryVisit, 1);
});

test('does not treat missing demand or inventory evidence as zero and does not create a proposal', async () => {
  const runtime = createRuntime({
    demandRows: {
      iron_ore: {
        resourceId: 'iron_ore', demandPerDay: 2, pendingImportQuantity: 0,
        unresolvedImportRequestCount: 0, stockCoverageTargetDays: 30,
        procurementScore: 0.9, priority: 5
      }
    }
  });
  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'NO_KNOWN_FEASIBLE_TRADE_NEED_OR_SURPLUS');
  assert.equal(runtime.metrics.proposalCalls, 0);
  assert.equal(runtime.metrics.syncCalls, 0);
});

test('requires observed diplomacy and respects existing embargo/war/sanctions evidence', async () => {
  const runtime = createRuntime();
  delete runtime.state.foreign.AUS.relations.CAN;
  delete runtime.state.foreign.AUS.relations.MEX;
  delete runtime.state.foreign.CAN.relations.AUS;
  delete runtime.state.foreign.MEX.relations.AUS;
  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'HOLD');
  assert.equal(runtime.metrics.proposalCalls, 0);
});

test('refuses to trade when the observed diplomatic relationship is at war or sanctioned', async () => {
  const runtime = createRuntime();
  runtime.state.foreign.AUS.relations.CAN.war_state = true;
  runtime.state.foreign.AUS.relations.MEX.sanctions = true;
  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'NO_KNOWN_FEASIBLE_TRADE_NEED_OR_SURPLUS');
  assert.equal(runtime.metrics.proposalCalls, 0);
});

test('refuses imports when the required FX settlement value is unknown', async () => {
  const runtime = createRuntime({ fxUnavailable: true });
  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'HOLD');
  assert.equal(runtime.metrics.proposalCalls, 0);
  assert.equal(runtime.metrics.syncCalls, 0);
});

test('read-only export planner requires a known partner shortage and preserves the seller-side reserve', async () => {
  const runtime = createRuntime({ readOnly: true });
  const own = runtime.state.resource.AUS.demandRuntime.byResource.iron_ore;
  own.spendableStockAfter = 1000;
  runtime.state.resource.CAN.demandRuntime.byResource.iron_ore = {
    resourceId: 'iron_ore', status: 'SHORTAGE', demandPerDay: 2,
    spendableStockAfter: 0, pendingImportQuantity: 0,
    unresolvedImportRequestCount: 0, stockCoverageTargetDays: 30,
    procurementScore: 0.8, priority: 4
  };
  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'PLANNED_READ_ONLY');
  const candidate = runtime.context.Omega.AutonomousNationalTradeDecisionV1
    .getDecisionPlan('AUS').candidates.find(row => row.direction === 'EXPORT');
  assert.ok(candidate);
  assert.equal(candidate.targetCountryId, 'CAN');
  assert.equal(candidate.quantityPerDelivery, 60);
  assert.equal(runtime.metrics.demandCalls.CAN, 1,
    'partner demand must come from one fresh, read-only national-demand evaluation, not a cached demandRuntime');
  assert.equal(runtime.metrics.proposalCalls, 0);
});

test('evaluates and accepts at most one counteroffer when price, stock and Treasury preview are feasible', async () => {
  const runtime = createRuntime({
    enablePhase2: true,
    outbox: [{
      proposalId: 'BTP-COUNTER-1', requestorCountryId: 'AUS', targetCountryId: 'CAN',
      direction: 'IMPORT', resourceId: 'iron_ore', quantityPerDelivery: 5, unitPrice: 9,
      status: 'COUNTER', counterTerms: { unitPrice: 10, quantityPerDelivery: 5, durationMonths: 12, intervalDays: 30 }
    }]
  });
  runtime.reports.set('AUS|CAN', { status: 'CURRENT', report: { snapshotId: 'CURRENT' } });

  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'ACCEPTED');
  assert.equal(runtime.metrics.acceptCalls, 1);
  assert.equal(runtime.metrics.previewCalls, 1);
  assert.equal(runtime.metrics.proposalCalls, 0);
  assert.equal(runtime.state.trade.AUS.bilateralProposalOutbox[0].status, 'ACCEPTED_COUNTER');
});

test('rejects a counteroffer outside the cleared-market premium policy through the existing bilateral response handler', async () => {
  const runtime = createRuntime({
    enablePhase2: true,
    outbox: [{
      proposalId: 'BTP-COUNTER-2', requestorCountryId: 'AUS', targetCountryId: 'CAN',
      direction: 'IMPORT', resourceId: 'iron_ore', quantityPerDelivery: 5, unitPrice: 9,
      status: 'COUNTER', counterTerms: { unitPrice: 20, quantityPerDelivery: 5, durationMonths: 12, intervalDays: 30 }
    }]
  });
  runtime.reports.set('AUS|CAN', { status: 'CURRENT', report: { snapshotId: 'CURRENT' } });

  const result = await runtime.process('AUS', 1);
  assert.equal(result.status, 'REJECTED');
  assert.equal(runtime.metrics.acceptCalls, 0);
  assert.equal(runtime.state.trade.AUS.bilateralProposalOutbox[0].status, 'REJECT');
  assert.ok(runtime.dispatchLog.some(x => x.type === 'OMEGA_BILATERAL_APPLY_RESPONSE'));
});

test('records partner reliability only from delivery counters and SETTLED-only trade evidence', async () => {
  const runtime = createRuntime({
    demandRows: {},
    contracts: [{
      agreementId: 'BTA-AUS-CAN', partnerCountryId: 'CAN', resourceId: 'iron_ore',
      status: 'ACTIVE', completedDeliveries: 3, failedDeliveries: 1
    }]
  });
  await runtime.process('AUS', 1);
  const experience = runtime.state.trade.AUS.autonomousNationalTradeDecision.partnerExperience.CAN;
  assert.equal(experience.reliability, 0.75);
  assert.equal(experience.reliabilityStatus, 'KNOWN');
  assert.equal(experience.settledTransactions, 3);
  assert.equal(experience.settledEvidenceStatus, 'KNOWN');
});

test('checkpoint writes are country-scoped through Ministry Interoperability and planner state is bounded', async () => {
  const runtime = createRuntime();
  await runtime.process('AUS', 1);
  const checkpoint = runtime.state.trade.AUS.autonomousNationalTradeDecision;
  assert.equal(checkpoint.countryId, 'AUS');
  assert.equal(checkpoint.schemaVersion, '1.0.0');
  assert.ok(checkpoint.revision >= 1);
  assert.ok(runtime.dispatchLog.some(x => x.type === 'OMEGA_AUTONOMOUS_NATIONAL_TRADE_CHECKPOINT' && x.owner === 'trade'));

  const plan = runtime.context.Omega.AutonomousNationalTradeDecisionV1.getDecisionPlan('AUS');
  assert.ok(plan.candidates.length <= rules.limits.maxCandidates);
  assert.equal(runtime.context.Omega.AutonomousNationalTradeDecisionV1.diagnostics().maximumProposalsPerCountryTurn, 1);
});


test('handles a 197-country fixture without enumerating the global roster or starting background loops', async () => {
  const runtime = createRuntime({ demandRows: {} });
  const countries = [];
  for (let a = 65; a < 91 && countries.length < 197; a++) {
    for (let b = 65; b < 91 && countries.length < 197; b++) {
      for (let c = 65; c < 91 && countries.length < 197; c++) {
        const code = String.fromCharCode(a, b, c);
        if (['USA', 'AUS', 'CAN', 'MEX'].includes(code)) continue;
        countries.push(code);
      }
    }
  }
  assert.equal(countries.length, 197);
  countries.forEach(code => {
    runtime.state.trade[code] = { importRequests: [], bilateralProposalOutbox: [], bilateralProposalInbox: [], bilateralContracts: [] };
    runtime.state.resource[code] = { inventory: {}, demandRuntime: { byResource: {} } };
    runtime.state.foreign[code] = { relations: {} };
  });
  for (let index = 0; index < countries.length; index++) {
    const result = await runtime.process(countries[index], index + 2);
    assert.equal(result.status, 'HOLD');
    assert.equal(result.reason, 'NO_KNOWN_FEASIBLE_TRADE_NEED_OR_SURPLUS');
  }
  assert.equal(runtime.metrics.proposalCalls, 0);
  assert.equal(runtime.metrics.syncCalls, 0);
  assert.equal(runtime.schedulerRegistrations.length, 1);
  assert.equal(runtime.context.Omega.AutonomousNationalTradeDecisionV1.diagnostics().createsIndependentScheduler, false);
});
