import test from 'node:test';
import assert from 'node:assert/strict';

function readPath(root, path) {
  return String(path || '').split('.').reduce((value, key) => value == null ? undefined : value[key], root);
}
function writePath(root, path, value) {
  const parts = String(path || '').split('.');
  const last = parts.pop();
  let cursor = root;
  for (const part of parts) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[last] = structuredClone(value);
}
function countryResource(stock, reserve, daily, unmet) {
  return {
    inventory: { crude_oil: stock },
    reserves: { crude_oil: reserve },
    production: { crude_oil: 10 },
    demandRuntime: { byResource: { crude_oil: {
      demandPerDay: daily, consumerDemandPerDay: daily, unmetDemand: unmet,
      pendingImportQuantity: 0, stockCoverageDays: stock / Math.max(daily, 1)
    } } }
  };
}

test('bilateral trade market intelligence, negotiation, contract execution and balance are deterministic', async () => {
  const relation = () => ({ overall: 85, trade: 90, trust: 80, political: 85, trade_agreement: true, sanctions: false, war_state: false });
  globalThis.Game = { state: {
    simulation: { turn: 0, date: '2015-01-01T00:00:00.000Z', stepDurationMs: 10000 },
    resource: {
      BGD: countryResource(18000, 500, 10, 500),
      SAU: countryResource(30000, 1000, 1, 1000),
      IND: countryResource(12000, 400, 2, 350)
    },
    finance: {
      BGD: { available: 500000, reserves: 600000, currencyCode: 'USD' },
      SAU: { available: 350000, reserves: 450000, currencyCode: 'USD' },
      IND: { available: 100000, reserves: 150000, currencyCode: 'USD' }
    },
    foreign: {
      BGD: { relations: { SAU: relation(), IND: relation() }, treaties: {} },
      SAU: { relations: { BGD: relation(), IND: relation() }, treaties: {} },
      IND: { relations: { BGD: relation(), SAU: relation() }, treaties: {} }
    },
    trade: {
      BGD: { importRequests: [], globalTradeLedger: { requests: [], decisions: [], settlements: [] } },
      SAU: { importRequests: [], globalTradeLedger: { requests: [], decisions: [], settlements: [] } },
      IND: { importRequests: [], globalTradeLedger: { requests: [], decisions: [], settlements: [] } }
    }
  } };

  globalThis.Omega = {};
  const handlers = new Map();
  const schedulerHandlers = new Map();
  globalThis.Omega.WorldSimulationScheduler = {
    registerCountryHandler(name, handler, options) {
      schedulerHandlers.set(name, { handler, options });
      return () => schedulerHandlers.delete(name);
    }
  };

  let failNextSellerRatification = false;

  globalThis.Omega.MinistryInteroperability = {
    registerAction() { return true; },
    registerCommandHandler(type, owner, handler) { handlers.set(owner + ':' + type, handler); },
    emitEvent() { return true; },
    dispatchCommand(source, actionId, countryId, payload = {}, options = {}) {
      const country = String(countryId || '').toUpperCase();
      const type = String(options.commandType || actionId || '');
      if (type === 'OMEGA_TREATY_ACTIVATE') {
        if (country === 'SAU' && failNextSellerRatification) {
          failNextSellerRatification = false;
          return { status: 'FAILED', result: { accepted: false, reason: 'TEST_SELLER_RATIFICATION_TEMPORARY_FAILURE' } };
        }
        const foreign = globalThis.Game.state.foreign[country] || (globalThis.Game.state.foreign[country] = {});
        foreign.treaties = foreign.treaties || {};
        foreign.treaties[String(payload.targetCountryId).toUpperCase()] = {
          status: 'ACTIVE', stage: 'IMPLEMENTED', treatyType: payload.treatyType,
          terms: structuredClone(payload.terms || {}), activatedTurn: globalThis.Game.state.simulation.turn
        };
        return { status: 'APPLIED', result: { accepted: true, status: 'ACTIVE' } };
      }
      if (type === 'OMEGA_TREATY_TERMINATE') {
        const foreign = globalThis.Game.state.foreign[country] || {};
        if (foreign.treaties) delete foreign.treaties[String(payload.targetCountryId).toUpperCase()];
        return { status: 'APPLIED', result: { accepted: true } };
      }
      if (type === 'OMEGA_TRADE_FINANCE_DEBIT' || type === 'OMEGA_TRADE_FINANCE_CREDIT') {
        const finance = globalThis.Game.state.finance[country];
        const amount = Number(payload.amount);
        if (!finance || !Number.isFinite(amount) || amount < 0) {
          return { status: 'FAILED', result: { accepted: false, reason: 'FINANCE_AMOUNT_INVALID' } };
        }
        const settlementId = String(payload.settlementId || '');
        const history = Array.isArray(finance.tradeSettlementHistory) ? finance.tradeSettlementHistory : [];
        const ledgerType = type.endsWith('_DEBIT') ? 'DEBIT' : 'CREDIT';
        const previous = history.find(row => row.settlementId === settlementId && row.type === ledgerType);
        if (previous) return { status: 'APPLIED', result: { accepted: true, duplicate: true, amount: previous.amount } };
        if (ledgerType === 'DEBIT' && finance.available < amount) {
          return { status: 'FAILED', result: { accepted: false, reason: 'FINANCE_LIQUIDITY_INSUFFICIENT' } };
        }
        finance.available += ledgerType === 'DEBIT' ? -amount : amount;
        history.push({ settlementId, type: ledgerType, amount, turn: globalThis.Game.state.simulation.turn });
        finance.tradeSettlementHistory = history;
        return { status: 'APPLIED', result: { accepted: true, amount } };
      }
      const handler = handlers.get(source + ':' + type);
      if (!handler) return { status: 'UNHANDLED', result: { accepted: false, reason: 'HANDLER_NOT_FOUND' } };
      if (!globalThis.Game.state[source]) globalThis.Game.state[source] = {};
      if (!globalThis.Game.state[source][country]) globalThis.Game.state[source][country] = {};
      const tx = {
        get(path) {
          const parts = String(path || '').split('.');
          const domainName = parts.shift();
          return structuredClone(readPath(globalThis.Game.state[domainName] && globalThis.Game.state[domainName][country], parts.join('.')));
        },
        set(path, value) {
          const parts = String(path || '').split('.');
          const domainName = parts.shift();
          if (!globalThis.Game.state[domainName]) globalThis.Game.state[domainName] = {};
          if (!globalThis.Game.state[domainName][country]) globalThis.Game.state[domainName][country] = {};
          writePath(globalThis.Game.state[domainName][country], parts.join('.'), value);
        }
      };
      try {
        const result = handler({ commandId: options.commandId || type + '-' + country, commandType: type, payload: structuredClone(payload) },
          { countryId: country, stateTransaction: tx });
        return { status: result && result.accepted === false ? 'FAILED' : 'APPLIED', result };
      } catch (error) {
        return { status: 'FAILED', result: { accepted: false, reason: String(error && error.message || error) } };
      }
    }
  };

  const priceMap = { BGD: 95, SAU: 100, IND: 75 };
  globalThis.OmegaGlobalMarket = {
    productCatalog() {
      return [{ id: 'crude_oil', name: 'Crude oil', productType: 'RAW_RESOURCE', unit: 'barrels' }];
    },
    quote() { return { status: 'CLEARED', clearingPriceUsd: 100, referencePrice: 100, generatedTurn: globalThis.Game.state.simulation.turn }; },
    localPrice(country) { return priceMap[String(country).toUpperCase()] ?? null; },
    suppliers(resourceId, quantity, buyer) {
      if (resourceId !== 'crude_oil') return [];
      const target = String(buyer || '').toUpperCase();
      const rows = [
        { countryId: 'BGD', available: 17000 },
        { countryId: 'SAU', available: 28000 },
        { countryId: 'IND', available: 11000 }
      ];
      return rows.filter(row => row.countryId !== target && row.available >= (Number(quantity) || 0))
        .map(row => ({ ...row, marketQuote: { status: 'CLEARED' }, relationObserved: true }));
    }
  };

  globalThis.OmegaGlobalTrade = {
    currencyOf(country) {
      return globalThis.Game.state.finance[String(country).toUpperCase()]?.currencyCode || null;
    },
    settlementValues(buyer, seller, quantity, unitPrice) {
      const buyerCurrency = this.currencyOf(buyer), sellerCurrency = this.currencyOf(seller);
      if (!buyerCurrency || !sellerCurrency) return { buyerValue: null, sellerValue: null, fx: null };
      const value = Number(quantity) * Number(unitPrice);
      return { buyerValue: value, sellerValue: value, fx: 1, buyerCurrency, sellerCurrency };
    },
    relationScore(r) {
      if (!r) return null;
      if (r.war_state || r.sanctions) return 0;
      return (Number(r.overall) + Number(r.trade) + Number(r.trust) + Number(r.political)) / 400;
    },
    createRequest(country, payload) {
      const c = String(country).toUpperCase();
      const trade = globalThis.Game.state.trade[c];
      trade.importRequests = trade.importRequests || [];
      if (trade.importRequests.some(row => row.requestId === payload.requestId)) return { accepted: true, duplicate: true };
      trade.importRequests.push({
        requestId: payload.requestId, countryId: c, targetCountryId: payload.targetCountryId,
        resourceId: payload.resourceId, quantity: payload.quantity, unitPrice: payload.unitPrice,
        governmentContractId: payload.governmentContractId, status: 'SENT', stage: 'OPEN',
        createdTurn: globalThis.Game.state.simulation.turn
      });
      return { accepted: true, requestId: payload.requestId };
    }
  };

  await import('../omega_bilateral_trade_agreement_system_v1.js');
  const bilateral = globalThis.OmegaBilateralTradeAgreementV1;
  assert.ok(bilateral, 'bilateral trade runtime must expose its API');
  assert.equal(bilateral.diagnostics().handlersInstalled, true, JSON.stringify(bilateral.diagnostics()));
  assert.equal(bilateral.diagnostics().schedulerRegistered, true, JSON.stringify(bilateral.diagnostics()));
  assert.deepEqual(bilateral.diagnostics().scheduledTiers, ['PLAYER', 'ACTIVE', 'MACRO']);
  assert.equal(bilateral.diagnostics().worldRosterScansOnTurn, false);
  assert.ok(schedulerHandlers.has('omega.bilateral-trade-agreement.country-runtime'));

  const synced = bilateral.syncMarket('BGD', 'SAU');
  assert.equal(synced.accepted, true, JSON.stringify(synced));
  const report = bilateral.getMarketReport('BGD', 'SAU');
  assert.equal(report.status, 'CURRENT');
  assert.equal(report.report.products[0].stock.status, 'KNOWN');
  assert.equal(report.report.products[0].expectedPrice.status, 'KNOWN');
  assert.equal(report.report.alternativeMarkets.competingBuyersForExports[0].status, 'OBSERVED');
  assert.equal(report.report.generatedTurn, 0);

  const feasible = bilateral.previewProposal('BGD', {
    targetCountryId: 'SAU', direction: 'IMPORT', resourceId: 'crude_oil',
    quantityPerDelivery: 100, unitPrice: 100, durationMonths: 12, intervalDays: 30
  });
  assert.equal(feasible.status, 'FEASIBLE', JSON.stringify(feasible));
  assert.equal(feasible.canSend, true);
  assert.equal(feasible.durationTurns, 365, '12 months must use the game calendar, not wall-clock stepDurationMs');
  assert.equal(feasible.buyerAvailableForeignCurrency, 500000);
  assert.equal(feasible.exportableSupply, 28970);

  const noFundsBefore = globalThis.Game.state.finance.BGD.available;
  globalThis.Game.state.finance.BGD.available = 1;
  const unaffordable = bilateral.previewProposal('BGD', {
    targetCountryId: 'SAU', direction: 'IMPORT', resourceId: 'crude_oil',
    quantityPerDelivery: 100, unitPrice: 100, durationMonths: 12, intervalDays: 30
  });
  assert.equal(unaffordable.status, 'INFEASIBLE');
  assert.equal(unaffordable.canSend, false);
  globalThis.Game.state.finance.BGD.available = noFundsBefore;

  const firstProposal = bilateral.createProposal('BGD', {
    proposalId: 'BTP-BGD-SAU-ACCEPT', targetCountryId: 'SAU', direction: 'IMPORT',
    resourceId: 'crude_oil', quantityPerDelivery: 100, unitPrice: 100,
    durationMonths: 12, intervalDays: 30, quantityTolerancePct: 5, terminationPenaltyPct: 5,
    relationshipPenaltyPoints: 4
  });
  assert.equal(firstProposal.accepted, true, JSON.stringify(firstProposal));
  assert.equal(globalThis.Game.state.trade.BGD.bilateralProposalOutbox.length, 1);
  assert.equal(globalThis.Game.state.trade.SAU.bilateralProposalInbox.length, 1);
  assert.equal(bilateral.createProposal('BGD', {
    proposalId: 'BTP-BGD-SAU-ACCEPT', targetCountryId: 'SAU', direction: 'IMPORT',
    resourceId: 'crude_oil', quantityPerDelivery: 100, unitPrice: 100,
    durationMonths: 12, intervalDays: 30, quantityTolerancePct: 5, terminationPenaltyPct: 5,
    relationshipPenaltyPoints: 4
  }).accepted, true, 'an exact retry must be idempotent');

  globalThis.Game.state.simulation.turn = 1;
  const review = bilateral.processCountry('SAU');
  assert.equal(review.status, 'COMPLETED', JSON.stringify(review));
  assert.equal(review.proposals[0].status, 'ACTIVE', JSON.stringify(review));
  const agreementId = globalThis.Game.state.trade.BGD.bilateralContracts[0].agreementId;
  const buyerContract = globalThis.Game.state.trade.BGD.bilateralContracts[0];
  const sellerContract = globalThis.Game.state.trade.SAU.bilateralContracts[0];
  assert.equal(buyerContract.role, 'BUYER');
  assert.equal(sellerContract.role, 'SELLER');
  assert.equal(buyerContract.status, 'ACTIVE');
  assert.equal(globalThis.Game.state.foreign.BGD.treaties.SAU.status, 'ACTIVE');
  assert.equal(globalThis.Game.state.foreign.SAU.treaties.BGD.status, 'ACTIVE');

  // A transient failure on one side of treaty ratification must recover idempotently.
  globalThis.Game.state.simulation.turn = 2;
  assert.equal(bilateral.syncMarket('BGD', 'SAU').accepted, true);
  const partialProposal = bilateral.createProposal('BGD', {
    proposalId: 'BTP-PARTIAL-RATIFICATION', targetCountryId: 'SAU', direction: 'IMPORT',
    resourceId: 'crude_oil', quantityPerDelivery: 75, unitPrice: 100, durationMonths: 12, intervalDays: 30
  });
  assert.equal(partialProposal.accepted, true, JSON.stringify(partialProposal));
  failNextSellerRatification = true;
  globalThis.Game.state.simulation.turn = 3;
  const partialAttempt = bilateral.processCountry('SAU');
  assert.equal(partialAttempt.proposals[0].status, 'RATIFICATION_PENDING');
  const pendingInbox = globalThis.Game.state.trade.SAU.bilateralProposalInbox.find(row => row.proposalId === 'BTP-PARTIAL-RATIFICATION');
  assert.equal(pendingInbox.inboxStatus, 'ACCEPT_PENDING_RATIFICATION');
  globalThis.Game.state.simulation.turn = 4;
  const recovered = bilateral.processCountry('SAU');
  assert.equal(recovered.proposals[0].status, 'ACTIVE', JSON.stringify(recovered));
  assert.equal(globalThis.Game.state.trade.BGD.bilateralContracts.filter(row => row.proposalId === 'BTP-PARTIAL-RATIFICATION').length, 1);
  assert.equal(globalThis.Game.state.trade.SAU.bilateralContracts.filter(row => row.proposalId === 'BTP-PARTIAL-RATIFICATION').length, 1);

  assert.equal(bilateral.syncMarket('BGD', 'SAU').accepted, true);
  const duplicateProposal = bilateral.createProposal('BGD', {
    proposalId: 'BTP-BGD-SAU-COLLISION', targetCountryId: 'SAU', direction: 'IMPORT',
    resourceId: 'crude_oil', quantityPerDelivery: 101, unitPrice: 100,
    durationMonths: 12, intervalDays: 30
  });
  assert.equal(duplicateProposal.accepted, true);
  const outboxCollision = globalThis.Game.state.trade.BGD.bilateralProposalOutbox.find(row => row.proposalId === 'BTP-BGD-SAU-COLLISION');
  assert.ok(outboxCollision);

  globalThis.Game.state.foreign.SAU.relations.BGD.war_state = true;
  const warRejected = bilateral.evaluateProposal('SAU', {
    proposalId: 'BTP-WAR-TEST', requestorCountryId: 'BGD', buyerCountryId: 'BGD',
    sellerCountryId: 'SAU', resourceId: 'crude_oil', quantityPerDelivery: 10, unitPrice: 100
  });
  assert.equal(warRejected.decision, 'REJECT');
  assert.equal(warRejected.reason, 'WAR_STATE_PROHIBITED');
  globalThis.Game.state.foreign.SAU.relations.BGD.war_state = false;

  const competingOffer = bilateral.evaluateProposal('SAU', {
    proposalId: 'BTP-COMPETING-BUYER', requestorCountryId: 'BGD', buyerCountryId: 'BGD',
    sellerCountryId: 'SAU', resourceId: 'crude_oil', quantityPerDelivery: 100, unitPrice: 100,
    intervalDays: 30, intervalTurns: 30
  });
  assert.equal(competingOffer.decision, 'ACCEPT', JSON.stringify(competingOffer));
  assert.equal(competingOffer.decisionFactors.alternativeMarketEvidence.competingBuyerCount, 1);

  const reportChangeStock = globalThis.Game.state.resource.SAU.inventory.crude_oil;
  globalThis.Game.state.resource.SAU.inventory.crude_oil = reportChangeStock - 1;
  assert.equal(bilateral.getMarketReport('BGD', 'SAU').status, 'STALE');
  globalThis.Game.state.resource.SAU.inventory.crude_oil = reportChangeStock;
  const priorCompetitorDemand = globalThis.Game.state.resource.IND.demandRuntime.byResource.crude_oil.unmetDemand;
  globalThis.Game.state.resource.IND.demandRuntime.byResource.crude_oil.unmetDemand = priorCompetitorDemand + 1;
  const staleCompetition = bilateral.previewProposal('BGD', { targetCountryId: 'SAU', direction: 'IMPORT', resourceId: 'crude_oil', quantityPerDelivery: 100, unitPrice: 100, durationMonths: 12, intervalDays: 30 });
  assert.equal(staleCompetition.status, 'STALE');
  assert.equal(staleCompetition.reason, 'ALTERNATIVE_MARKET_DATA_CHANGED');
  globalThis.Game.state.resource.IND.demandRuntime.byResource.crude_oil.unmetDemand = priorCompetitorDemand;
  assert.equal(bilateral.syncMarket('BGD', 'SAU').accepted, true);

  globalThis.Game.state.simulation.turn = buyerContract.nextDeliveryTurn;
  const due = bilateral.processCountry('BGD');
  assert.equal(due.status, 'COMPLETED');
  assert.equal(due.contracts[0].status, 'DELIVERY_REQUESTED', JSON.stringify(due));
  const buyerRequest = globalThis.Game.state.trade.BGD.importRequests.find(row => row.governmentContractId === agreementId);
  assert.ok(buyerRequest, 'agreement delivery must use the existing Global Trade request path');
  assert.equal(buyerRequest.quantity, 100);
  assert.equal(buyerRequest.governmentContractId, agreementId);

  buyerRequest.quantity = 97;
  buyerRequest.status = 'SETTLED';
  buyerRequest.settlementId = 'SETTLEMENT-' + agreementId + '-0001';
  buyerRequest.settledTurn = globalThis.Game.state.simulation.turn + 1;
  const settlement = {
    settlementId: buyerRequest.settlementId, requestId: buyerRequest.requestId, status: 'SETTLED',
    buyerCountryId: 'BGD', sellerCountryId: 'SAU', resourceId: 'crude_oil',
    quantity: 97, buyerValue: 9700, sellerValue: 9700, buyerCurrency: 'USD', sellerCurrency: 'USD',
    turn: globalThis.Game.state.simulation.turn + 1
  };
  globalThis.Game.state.trade.BGD.globalTradeLedger.settlements.push(structuredClone(settlement));
  globalThis.Game.state.trade.SAU.globalTradeLedger.settlements.push({ ...structuredClone(settlement), ledgerType: 'SELLER_SETTLEMENT' });
  globalThis.Game.state.simulation.turn += 1;
  const deliveryClosed = bilateral.processCountry('BGD');
  assert.equal(deliveryClosed.contracts[0].status, 'DELIVERY_SETTLED', JSON.stringify(deliveryClosed));
  assert.equal(globalThis.Game.state.trade.BGD.bilateralContracts[0].completedDeliveries, 1);
  assert.equal(globalThis.Game.state.trade.SAU.bilateralContracts[0].deliveredQuantity, 97);
  assert.equal(globalThis.Game.state.trade.BGD.bilateralContracts[0].deliveries[0].withinTolerance, true);

  const balance = bilateral.getBilateralTradeBalance('BGD', 'SAU');
  assert.equal(balance.status, 'OBSERVED_SETTLEMENTS_ONLY');
  assert.equal(balance.totalImportValue, 9700);
  assert.equal(balance.totalExportValue, 0);
  assert.equal(balance.tradeBalance, -10000);
  assert.equal(balance.settledTransactionCount, 1);
  assert.equal(balance.outstandingContractQuantity, 1100);
  assert.equal(balance.inTransitStatus, 'NOT_INFERRED_FROM_SETTLEMENT_LEDGER');
  const globalBalance = bilateral.getGlobalTradeBalance('SAU');
  assert.equal(globalBalance.totalExportValue, 10000);
  assert.equal(globalBalance.totalImportValue, 0);

  const beforePenalty = globalThis.Game.state.finance.BGD.available;
  const terminated = bilateral.terminateContract('BGD', agreementId, 'PLAYER_REQUESTED_TERMINATION');
  assert.equal(terminated.accepted, true, JSON.stringify(terminated));
  assert.equal(terminated.status, 'TERMINATED');
  assert.equal(terminated.penalty.status, 'PAID');
  assert.ok(globalThis.Game.state.finance.BGD.available < beforePenalty);
  assert.ok(globalThis.Game.state.trade.SAU.bilateralPenaltyClaims.length > 0);
  assert.ok(globalThis.Game.state.foreign.BGD.relationAdjustments.SAU.length > 0);
  assert.ok(globalThis.Game.state.foreign.SAU.relationAdjustments.BGD.length > 0);

  assert.equal(bilateral.syncMarket('BGD', 'SAU').accepted, true);
  const forceMajeureProposal = bilateral.createProposal('BGD', {
    proposalId: 'BTP-FORCE-MAJEURE', targetCountryId: 'SAU', direction: 'IMPORT',
    resourceId: 'crude_oil', quantityPerDelivery: 50, unitPrice: 100, priceModel: 'MARKET_LINKED',
    marketAdjustmentPct: 10, quantityTolerancePct: 5,
    durationMonths: 24, intervalDays: 30
  });
  assert.equal(forceMajeureProposal.accepted, true, JSON.stringify(forceMajeureProposal));
  globalThis.Game.state.simulation.turn += 1;
  const forceReview = bilateral.processCountry('SAU');
  assert.equal(forceReview.proposals[0].status, 'ACTIVE');
  const forceAgreement = globalThis.Game.state.trade.BGD.bilateralContracts.find(row => row.proposalId === 'BTP-FORCE-MAJEURE');
  assert.equal(forceAgreement.priceModel, 'MARKET_LINKED');
  assert.equal(forceAgreement.unitPrice, 110);
  globalThis.Game.state.simulation.turn = forceAgreement.nextDeliveryTurn;
  const linkedDelivery = bilateral.processCountry('BGD');
  assert.equal(linkedDelivery.contracts.find(row => row.agreementId === forceAgreement.agreementId).status, 'DELIVERY_REQUESTED');
  const forceRequest = globalThis.Game.state.trade.BGD.importRequests.find(row => row.governmentContractId === forceAgreement.agreementId);
  assert.equal(forceRequest.unitPrice, 110);
  forceRequest.quantity = 45;
  forceRequest.status = 'SETTLED';
  forceRequest.settlementId = 'SETTLEMENT-' + forceAgreement.agreementId + '-0001';
  forceRequest.settledTurn = globalThis.Game.state.simulation.turn + 1;
  const forceSettlement = { settlementId: forceRequest.settlementId, requestId: forceRequest.requestId, status: 'SETTLED',
    buyerCountryId: 'BGD', sellerCountryId: 'SAU', resourceId: 'crude_oil', quantity: 45,
    buyerValue: 4950, sellerValue: 4950, buyerCurrency: 'USD', sellerCurrency: 'USD', turn: forceRequest.settledTurn };
  globalThis.Game.state.trade.BGD.globalTradeLedger.settlements.push(structuredClone(forceSettlement));
  globalThis.Game.state.trade.SAU.globalTradeLedger.settlements.push({ ...structuredClone(forceSettlement), ledgerType: 'SELLER_SETTLEMENT' });
  globalThis.Game.state.simulation.turn += 1;
  const outOfTolerance = bilateral.processCountry('BGD');
  assert.equal(outOfTolerance.contracts.find(row => row.agreementId === forceAgreement.agreementId).status, 'DELIVERY_SETTLED');
  const forceContractAfterSettlement = globalThis.Game.state.trade.BGD.bilateralContracts.find(row => row.agreementId === forceAgreement.agreementId);
  assert.equal(forceContractAfterSettlement.status, 'AT_RISK');
  assert.equal(forceContractAfterSettlement.deliveries[0].withinTolerance, false);
  assert.equal(forceContractAfterSettlement.lastDeliveryStatus, 'SETTLED_OUTSIDE_TOLERANCE');
  const beforeForcePenalty = globalThis.Game.state.finance.BGD.available;
  const forceEnded = bilateral.terminateContract('BGD', forceAgreement.agreementId, 'FORCE_MAJEURE', { forceMajeure: true });
  assert.equal(forceEnded.penalty.status, 'WAIVED');
  assert.equal(globalThis.Game.state.finance.BGD.available, beforeForcePenalty);
});
