import assert from 'node:assert/strict';

const handlers = new Map();
const actionMetadata = new Map();
globalThis.Game = { state: {
  simulation: { turn: 12, session: { playerCountryId: 'BGD' } },
  trade: { BGD: { routeCapacity: { crude_oil: 5000 } }, SAU: { internationalShipmentLedger: [] } },
  resource: {
    BGD: {
      inventory: { crude_oil: 120 },
      production: { crude_oil: 8 },
      consumption: { crude_oil: 12 }
    },
    SAU: {
      inventory: { crude_oil: 2500 },
      reserves: { crude_oil: 200 },
      production: { crude_oil: 120 },
      consumption: { crude_oil: 75 },
      demandRuntime: { byResource: { crude_oil: { demandPerDay: 75 } } },
      industrialNetwork: {}
    }
  },
  finance: { BGD: { available: 100000, currencyCode: 'BDT' }, SAU: { available: 80000, currencyCode: 'SAR' } },
  economy: { BGD: { currencyCode: 'BDT' }, SAU: { currencyCode: 'SAR' } },
  foreign: {
    BGD: { relations: { SAU: { overall: 82, trade: 88, trust: 80, political: 78, sanctions: false, war_state: false } } },
    SAU: { relations: { BGD: { overall: 82, trade: 88, trust: 80, political: 78, sanctions: false, war_state: false } } }
  }
} };
globalThis.Omega = {
  MinistryInteroperability: {
    configure() {},
    registerAction(type, metadata) { actionMetadata.set(type, metadata); },
    registerCommandHandler(type, owner, handler) { handlers.set(type, { owner, handler }); },
    dispatchCommand(owner, type, countryId, payload) {
      const registered = handlers.get(type);
      if (!registered || registered.owner !== owner) return { status: 'UNHANDLED', reason: type };
      const cid = String(countryId).toUpperCase();
      const domains = globalThis.Game.state;
      domains[owner] = domains[owner] || {};
      domains[owner][cid] = domains[owner][cid] || {};
      const record = domains[owner][cid];
      const transaction = {
        get(key) {
          const parts = String(key).split('.');
          if (parts.shift() !== owner) return undefined;
          let current = record;
          for (const part of parts) current = current == null ? undefined : current[part];
          return current;
        },
        set(key, value) {
          const parts = String(key).split('.');
          if (parts.shift() !== owner) throw new Error('STATE_OWNER_MISMATCH');
          let current = record;
          while (parts.length > 1) {
            const part = parts.shift();
            current[part] = current[part] && typeof current[part] === 'object' ? current[part] : {};
            current = current[part];
          }
          current[parts[0]] = value;
        }
      };
      const result = registered.handler({ payload }, { countryId: cid, stateTransaction: transaction });
      return result && result.accepted
        ? { status: 'APPLIED', result }
        : { status: 'REJECTED', result, reason: result && result.reason };
    }
  }
};
globalThis.OmegaGlobalTrade = {
  currencyOf(countryId) { return countryId === 'SAU' ? 'SAR' : 'BDT'; },
  fxRate() { return 0.012; },
  createRequest(countryId, payload) { return { accepted: true, request: { countryId, ...payload, requestId: 'TEST-IMPORT-1' } }; }
};
globalThis.OmegaGlobalMarket = {
  describeProduct(resourceId) { return { id: resourceId, available: true }; },
  localPrice(countryId, resourceId) { return resourceId === 'crude_oil' ? 95 : 190; },
  suppliers(resourceId, limit, buyerCountryId) {
    return [{ countryId: 'SAU', price: 95, currency: 'SAR', availableQuantity: 2500, evidenceStatus: 'VERIFIED_MARKET_STOCK' }];
  }
};

await import('../omega_bilateral_trade_system_v1.js');
const bilateral = globalThis.OmegaBilateralTrade;
assert.ok(bilateral, 'Bilateral Trade API must be registered');
const diagnostics = bilateral.diagnostics();
assert.equal(diagnostics.handlerInstalled, true, JSON.stringify(diagnostics));
assert.equal(diagnostics.registeredCommandHandlers, 2);
assert.equal(diagnostics.automaticWorldRosterScan, false);
assert.equal(diagnostics.schedulerHandlers, 0);

// Intelligence is on-demand, persisted under the requesting country's Trade state,
// and keeps source evidence distinct from derived estimates and missing data.
const built = bilateral.buildMarketIntelligence('BGD', 'SAU', { resourceId: 'crude_oil' });
assert.equal(built.ok, true, JSON.stringify(built));
assert.equal(built.report.resources.length, 1);
const oil = built.report.resources[0];
assert.equal(oil.domesticProduction.status, 'KNOWN');
assert.equal(oil.domesticProduction.value, 120);
assert.equal(oil.domesticConsumption.value, 75);
assert.equal(oil.potentialExportableSurplus.status, 'ESTIMATED');
assert.equal(oil.potentialExportableSurplus.value, 45);
assert.equal(oil.inboundInTransit.status, 'KNOWN');
assert.equal(oil.inboundInTransit.value, 0);
assert.equal(oil.supplierReliability.status, 'UNKNOWN');
assert.equal(oil.strategicImportance.status, 'UNKNOWN',
  'no national strategic priority is fabricated when no source record exists');
assert.equal(oil.expectedLocalPrice.value, 95);
const noLedger = bilateral.buildMarketIntelligence('BGD', 'BGD', { resourceId: 'crude_oil' });
assert.equal(noLedger.ok, false, 'self-country intelligence requests must be rejected');
const legacyReport = bilateral.buildMarketIntelligence('SAU', 'BGD', { resourceId: 'crude_oil' });
assert.equal(legacyReport.ok, true);
assert.equal(legacyReport.report.resources[0].inboundInTransit.status, 'UNKNOWN',
  'a missing shipment ledger is not treated as zero');
const saved = bilateral.requestMarketIntelligence('BGD', 'SAU', { resourceId: 'crude_oil' });
assert.equal(saved.ok, true, JSON.stringify(saved));
assert.equal(saved.persisted, true);
assert.equal(bilateral.getReport('BGD', saved.report.reportId).dataVersion, saved.report.dataVersion);
assert.equal(globalThis.Game.state.trade.BGD.marketIntelligenceReports.length, 1);

// The first offer is stored in both country-owned ledgers. The counterparty's
// acceptance activates the same terms version on both sides.
const offer = bilateral.createAgreementOffer('BGD', 'SAU', 'IMPORT', {
  resourceId: 'crude_oil', quantityPerShipment: 800, unitPrice: 95,
  currency: 'SAR', durationTurns: 30, deliveryMode: 'SHIP'
});
assert.equal(offer.accepted, true, JSON.stringify(offer));
const agreementId = offer.agreement.agreementId;
assert.equal(bilateral.getAgreements('BGD').length, 1);
assert.equal(bilateral.getAgreements('SAU').length, 1);
const accepted = bilateral.respondToOffer('SAU', agreementId, 'ACCEPT');
assert.equal(accepted.accepted, true, JSON.stringify(accepted));
assert.equal(accepted.agreement.status, 'ACTIVE');
assert.equal(bilateral.isAgreementActiveFor('BGD', 'SAU', 'crude_oil', 800, 95, agreementId), true);
assert.equal(bilateral.isAgreementActiveFor('BGD', 'SAU', 'crude_oil', 801, 95, agreementId), false);
assert.equal(bilateral.isAgreementActiveFor('BGD', 'SAU', 'crude_oil', 800, 96, agreementId), false);
assert.equal(bilateral.getActiveAgreement('BGD', 'SAU', 'crude_oil', agreementId).status, 'ACTIVE');

// Agreed procurement is routed into the existing Global Trade API with the
// durable agreement identity; it does not debit stock or Treasury itself.
const procurement = bilateral.procureAgreement('BGD', agreementId, 600);
assert.equal(procurement.accepted, true, JSON.stringify(procurement));
assert.equal(procurement.request.bilateralAgreementId, agreementId);
assert.equal(procurement.request.quantity, 600);
assert.equal(procurement.request.targetCountryId, 'SAU');
assert.equal(procurement.assessment.status, 'READY');
const sellerInitiated = bilateral.procureAgreement('SAU', agreementId, 500);
assert.equal(sellerInitiated.accepted, true, JSON.stringify(sellerInitiated));
assert.equal(sellerInitiated.request.countryId, 'BGD',
  'seller-side initiation must create the agreed buyer-side request in the buyer country state');

// A counteroffer increments the terms version and requires acceptance of that
// version by the original offerer before either mirror becomes active.
const counterOffer = bilateral.createAgreementOffer('BGD', 'SAU', 'IMPORT', {
  resourceId: 'steel', quantityPerShipment: 30, unitPrice: 200, currency: 'SAR', durationTurns: 12
});
assert.equal(counterOffer.accepted, true, JSON.stringify(counterOffer));
const counterId = counterOffer.agreement.agreementId;
const counter = bilateral.respondToOffer('SAU', counterId, 'COUNTER', {
  resourceId: 'steel', quantityPerShipment: 25, unitPrice: 190, currency: 'SAR', durationTurns: 12
});
assert.equal(counter.accepted, true, JSON.stringify(counter));
assert.equal(counter.agreement.termVersion, 2);
assert.equal(counter.agreement.status, 'COUNTER_OFFERED');
assert.equal(bilateral.isAgreementActiveFor('BGD', 'SAU', 'steel', 25, 190, counterId), false);
const counterAccepted = bilateral.respondToOffer('BGD', counterId, 'ACCEPT');
assert.equal(counterAccepted.accepted, true, JSON.stringify(counterAccepted));
assert.equal(counterAccepted.agreement.status, 'ACTIVE');
assert.equal(bilateral.isAgreementActiveFor('BGD', 'SAU', 'steel', 25, 190, counterId), true);

// Agreement IDs cannot be reused for a different contract or country pair.
const conflict = bilateral.createAgreementOffer('BGD', 'SAU', 'IMPORT', {
  resourceId: 'crude_oil', quantityPerShipment: 5, unitPrice: 1
});
assert.equal(conflict.accepted, true);
const original = bilateral.getAgreements('BGD').find(x => x.agreementId === agreementId);
assert.equal(original.terms.quantityPerShipment, 800);
console.log('OMEGA BILATERAL TRADE TEST PASSED');
