import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../omega_sanction_response_runtime_v1.js', import.meta.url), 'utf8');

function makeHarness(options = {}) {
  const state = {
    simulation: { turn: 40, session: { playerCountryId: 'BGD' } },
    trade: {
      USA: { sanctions: [{ policyId: 'SAN-USA-IRN-COPPER', issuerCountryId: 'USA',
        targetCountryId: 'IRN', resourceId: 'copper', type: 'IMPORT_PROHIBITION',
        direction: 'IMPORT', status: options.expired ? 'EXPIRED' : 'ACTIVE',
        startTurn: 35, endTurn: options.expired ? 39 : 80 }] },
      IRN: {
        exportLedger: [
          { settlementId: 'EX-IRN-01', resourceId: 'copper', buyerCountryId: 'USA',
            quantity: 48, totalValue: 480, currency: 'USD', turn: 38 },
          { settlementId: 'EX-IRN-OLD', resourceId: 'copper', buyerCountryId: 'USA',
            quantity: 100, totalValue: 900, currency: 'USD', turn: 2 },
          { settlementId: 'EX-CHN', resourceId: 'copper', buyerCountryId: 'CHN',
            quantity: 52, totalValue: 520, currency: 'USD', turn: 39 }],
        importLedger: [{ settlementId: 'IM-IRN-01', resourceId: 'copper',
          sourceCountryId: 'USA', quantity: 8, totalValue: 96, currency: 'USD', turn: 39 }]
      },
      BGD: {}, CHN: {}
    },
    foreign: {
      USA: { relations: { IRN: { overall: 32, trade: 24, trust: 30, war_state: false, sanctions: false } } },
      IRN: { relations: { USA: { overall: 32, trade: 24, trust: 30, war_state: false, sanctions: false } } },
      BGD: {}, CHN: {}
    },
    resource: {
      IRN: { demandRuntime: { lastTurn: 40, byResource: { copper: {
        resourceId: 'copper', unmetDemand: 20, demandPerDay: 30,
        stockCoverageDays: 1, stockCoverageTargetDays: 10,
        activeFactoryInputDemandPerDay: 12, productionPerDay: 4, unit: 'tonnes'
      } } }, inventory: { copper: 120 }, productionByResource: {
        copper: { outputPerDay: 4, installedCapacityPerDay: 15 }
      } },
      USA: { demandRuntime: { lastTurn: 40, byResource: { copper: {
        unmetDemand: 0, demandPerDay: 5, stockCoverageDays: 30, stockCoverageTargetDays: 30
      } } }, inventory: { copper: 10 } },
      CHN: { demandRuntime: { lastTurn: 40, byResource: { copper: {
        unmetDemand: 12, demandPerDay: 25, stockCoverageDays: 1, stockCoverageTargetDays: 8
      } } } }, BGD: {}
    },
    economy: {
      IRN: { employmentTotal: 120000, unemploymentRate: 0.12,
        companies: [{ companyId: 'IRN-STEEL-STATE', name: 'National Metals Group',
          ownership: 'STATE_OWNED', sector: 'METALS' }] },
      USA: {}, CHN: {}, BGD: {}
    },
    finance: {
      IRN: { available: 1000000, currencyCode: 'IRR', foreignReserveCoverageDays: 28,
        ministryAllocations: { foreign_affairs: { allocatedUsd: 120000,
          spentUsd: 30000, remainingUsd: 90000, source: 'OMEGA_FINANCE_MINISTRY' } } },
      USA: { available: 9000000, currencyCode: 'USD', foreignReserveCoverageDays: 90 },
      CHN: {}, BGD: {}
    },
    transport: { IRN: { routes: [{ routeId: 'R-IRN-USA', resourceId: 'copper',
      originCountryId: 'IRN', destinationCountryId: 'USA', status: 'ACTIVE' }] } },
    intelligence: { IRN: {}, USA: {}, BGD: {}, CHN: {} }
  };
  const handlers = new Map(), events = new Map(), writes = [], marketCalls = [];
  const market = {
    describeProduct(id) { return id === 'copper' ? { id, name: 'Copper' } : null; },
    localPrice(countryId, id) {
      return id === 'copper' ? ({ IRN: 100, CHN: 90, USA: 120 }[countryId] ?? null) : null;
    },
    suppliers(id, quantity, buyer) {
      marketCalls.push({ id, quantity, buyer });
      if (options.noLegalSuppliers) return [];
      if (buyer === 'IRN') return [{ countryId: 'CHN', available: 60, relationObserved: true }];
      if (buyer === 'CHN') return [{ countryId: 'IRN', available: 80, relationObserved: true }];
      return [];
    }
  };
  function getPath(root, path) { return path.split('.').reduce((value, key) => value && value[key], root); }
  function setPath(root, path, value) {
    const keys = path.split('.'), leaf = keys.pop();
    let cursor = root;
    for (const key of keys) cursor = cursor[key] ||= {};
    cursor[leaf] = value;
  }
  const authority = {
    registerAction() { return true; },
    registerCommandHandler(command, owner, handler) { handlers.set(command, { owner, handler }); },
    dispatchCommand(owner, command, countryId, payload) {
      const entry = handlers.get(command);
      if (!entry || entry.owner !== owner)
        return { status: 'UNHANDLED', result: { accepted: false, reason: 'NO_HANDLER' } };
      const staged = structuredClone(state);
      const scopedContainer = path => {
        const parts = String(path).split('.');
        const domain = parts.shift();
        const bucket = staged[domain]?.[countryId];
        return { domain, bucket, parts };
      };
      const tx = {
        get(path) {
          const ref = scopedContainer(path);
          return ref.parts.reduce((value, key) => value && value[key], ref.bucket);
        },
        set(path, value) {
          const ref = scopedContainer(path);
          staged[ref.domain] ||= {};
          staged[ref.domain][countryId] ||= {};
          let cursor = staged[ref.domain][countryId];
          for (const key of ref.parts.slice(0, -1)) cursor = cursor[key] ||= {};
          cursor[ref.parts.at(-1)] = structuredClone(value);
        }
      };
      const result = entry.handler({ payload }, { countryId, stateTransaction: tx });
      if (result?.accepted !== false) {
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, staged);
        writes.push({ owner, command, countryId });
      }
      return { status: result?.accepted === false ? 'REJECTED' : 'APPLIED', result };
    }
  };
  const context = {
    Game: { state },
    Omega: {
      CanonicalIdentity: { resolveCountry(value) {
        const id = String(value || '').toUpperCase(); return { id, iso3: id };
      } },
      MinistryInteroperability: authority,
      EconomicTransmissionRuntime: {
        getImportCostMultiplier(countryId) { return countryId === 'IRN' ? 1.35 : 1; },
        getMonetaryStress(currency) { return currency === 'IRR'
          ? { stressIndex: 72 } : { stressIndex: 12 }; }
      }
    },
    OmegaCanonicalIdentityRegistry: {
      resolveCountry(value) { const id = String(value || '').toUpperCase(); return { id, iso3: id }; },
      list() { return ['BGD', 'USA', 'IRN', 'CHN']; }
    },
    OmegaGlobalMarket: market,
    OmegaGovernmentBanking: {
      getCountryPolicy() { return { importTariffPct: 5 }; },
      getCountryAccount(countryId) { return {
        homeCurrencyCode: countryId === 'IRN' ? 'IRR' : 'USD',
        available: state.finance[countryId]?.available ?? null
      }; }
    },
    OmegaBlackMarketNetworkV1: { VERSION: '1.4.0' },
    addEventListener(type, handler) {
      const rows = events.get(type) || []; rows.push(handler); events.set(type, rows);
    },
    dispatchEvent(event) { for (const handler of events.get(event.type) || []) handler(event); return true; },
    CustomEvent: function CustomEvent(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'omega_sanction_response_runtime_v1.js' });
  return { context, state, handlers, events, writes, marketCalls };
}

test('active sanctions deliver formal notifications only to issuer and target records', () => {
  const h = makeHarness();
  const result = h.context.OmegaSanctionResponseRuntime.runTurn();
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.policiesProcessed, 1);
  assert.equal(h.state.foreign.IRN.sanctionNotifications.length, 1);
  assert.equal(h.state.foreign.USA.sanctionNotifications.length, 1);
  assert.equal(h.state.foreign.BGD.sanctionNotifications, undefined);
  assert.equal(h.state.foreign.CHN.sanctionNotifications, undefined);
  assert.equal(h.state.foreign.IRN.sanctionNotifications[0].role, 'TARGET');
  assert.equal(h.state.foreign.IRN.sanctionNationalDecisions[0].role, 'TARGET');
  assert.equal(h.state.foreign.USA.sanctionNationalDecisions[0].role, 'ISSUER');
  assert.equal(h.state.foreign.USA.sanctionNationalDecisions[0].selectedAction, 'SANCTION_COMPLIANCE_REVIEW');
});

test('economic impact uses settled bilateral ledgers in the rolling window and recorded shortage', () => {
  const h = makeHarness();
  h.context.OmegaSanctionResponseRuntime.runTurn();
  const impact = h.state.economy.IRN.sanctionEconomicAssessments[0];
  assert.equal(impact.aggregateExportsAtRisk, 480);
  assert.equal(impact.aggregateImportsAtRisk, 96);
  assert.equal(impact.demandAndIndustry[0].domesticDemand.unmetDemand, 20);
  assert.equal(impact.demandAndIndustry[0].production.productionPerDay, 4);
  assert.equal(impact.demandAndIndustry[0].employment.employedPersons, 120000);
  assert.equal(impact.actualLossAssumed, false);
});

test('national decision prefers verified legal suppliers when they are available', () => {
  const h = makeHarness();
  h.context.OmegaSanctionResponseRuntime.runTurn();
  const decision = h.state.foreign.IRN.sanctionNationalDecisions[0];
  assert.equal(decision.selectedAction, 'LEGAL_SOURCE_DIVERSIFICATION');
  assert.equal(decision.options[0].feasibility, 'SUPPORTED_BY_CURRENT_MARKET_STOCK');
  assert.equal(decision.options[0].evidence[0].suppliers.join(','), 'CHN');
});

test('no legal alternative creates only an evidence-gated Black Market referral option', () => {
  const h = makeHarness({ noLegalSuppliers: true });
  h.context.OmegaSanctionResponseRuntime.runTurn();
  const decision = h.state.foreign.IRN.sanctionNationalDecisions[0];
  assert.equal(decision.selectedAction, 'DIPLOMATIC_WAIVER_OR_RENEGOTIATION');
  const referral = decision.options.find(row => row.id === 'BLACK_MARKET_EVIDENCE_REVIEW');
  assert.ok(referral);
  assert.equal(referral.feasibility, 'REVIEW_CANDIDATE_NOT_AN_ACCEPTED_ORDER');
  assert.equal(h.state.trade.IRN.blackMarketDeals, undefined);
  assert.equal(h.state.resource.IRN.inventory.copper, 120);
  assert.equal(h.state.finance.IRN.available, 1000000);
});

test('exporter recovery verifies alternative buyers against observed demand and legal seller stock', () => {
  const h = makeHarness();
  h.context.OmegaSanctionResponseRuntime.runTurn();
  const plan = h.state.trade.IRN.sanctionMarketRecoveryPlans[0];
  const copper = plan.exportRedirection.find(row => row.resourceId === 'copper');
  assert.ok(copper);
  assert.ok(copper.alternativeBuyers.some(row => row.buyerCountryId === 'CHN'));
  assert.ok(h.marketCalls.some(row => row.buyer === 'CHN'));
});

test('financial exposure records Treasury, reserve, FX and appropriation evidence without spending', () => {
  const h = makeHarness();
  h.context.OmegaSanctionResponseRuntime.runTurn();
  const finance = h.state.finance.IRN.sanctionFinancialExposureLedger[0];
  assert.equal(finance.treasuryAvailable, 1000000);
  assert.equal(finance.foreignReserveCoverageDays, 28);
  assert.equal(finance.fxImportCostMultiplier, 1.35);
  assert.equal(finance.monetaryStress.stressIndex, 72);
  assert.equal(finance.ministryBudgetEvidence[0].remaining, 90000);
  assert.equal(finance.budgetSpent, 0);
});

test('issuer and target receive investigations in their own intelligence case files', () => {
  const h = makeHarness();
  const result = h.context.OmegaSanctionResponseRuntime.runTurn();
  assert.equal(result.results[0].countries.length, 2);
  assert.deepEqual(h.writes.filter(row => row.command === 'OMEGA_SANCTION_RECORD_INVESTIGATION')
    .map(row => row.countryId).sort(), ['IRN', 'USA']);
  assert.equal(h.state.intelligence.IRN.sanctionInvestigations.length, 1);
  assert.equal(h.state.intelligence.USA.sanctionInvestigations.length, 1);
  assert.equal(h.state.intelligence.BGD.sanctionInvestigations, undefined);
  assert.ok(h.state.intelligence.IRN.sanctionInvestigations[0].triggerReasons
    .includes('COMPLETED_BILATERAL_TRADE_EXPOSURE'));
  assert.equal(h.state.intelligence.IRN.sanctionInvestigations[0].noOmniscientIntelligence, true);
});

test('expired sanctions create no notifications or economic assessments', () => {
  const h = makeHarness({ expired: true });
  const result = h.context.OmegaSanctionResponseRuntime.runTurn();
  assert.equal(result.activePoliciesFound, 0);
  assert.equal(h.state.foreign.IRN.sanctionNotifications, undefined);
  assert.equal(h.state.economy.IRN.sanctionEconomicAssessments, undefined);
});

test('turn processing is idempotent and updates assessments on the next turn', () => {
  const h = makeHarness();
  h.context.OmegaSanctionResponseRuntime.runTurn();
  const count = h.writes.length;
  assert.equal(h.context.OmegaSanctionResponseRuntime.runTurn().status, 'ALREADY_PROCESSED');
  assert.equal(h.writes.length, count);
  h.state.simulation.turn = 41;
  assert.equal(h.context.OmegaSanctionResponseRuntime.runTurn().status, 'COMPLETED');
  assert.equal(h.state.economy.IRN.sanctionEconomicAssessments.length, 2);
  assert.equal(h.state.foreign.IRN.sanctionNotifications.length, 1);
});

test('Global Market query budget is bounded', () => {
  const h = makeHarness();
  h.context.OmegaSanctionResponseRuntime.runTurn();
  assert.ok(h.marketCalls.length <= 12);
  assert.equal(h.context.OmegaSanctionResponseRuntime.diagnostics().caps.marketQueriesPerTurn, 12);
});

test('missing evidence remains null rather than being represented as zero', () => {
  const h = makeHarness();
  h.state.resource.IRN.demandRuntime.byResource = {};
  h.state.trade.IRN.exportLedger = [];
  h.state.trade.IRN.importLedger = [];
  h.context.OmegaSanctionResponseRuntime.runTurn();
  const impact = h.state.economy.IRN.sanctionEconomicAssessments[0];
  assert.equal(impact.tradeExposure[0].exportsAtRisk.recordCount, 0);
  assert.equal(impact.tradeExposure[0].exportsAtRisk.value, null);
  assert.equal(impact.demandAndIndustry[0].domesticDemand, null);
});


test('active sanction processing rotates so every country is notified within the bounded policy budget', () => {
  const h = makeHarness();
  for (let index = 0; index < 8; index++) {
    const target = 'C' + String(index).padStart(2, '0');
    h.state.trade[target] = {};
    h.state.foreign[target] = {};
    h.state.resource[target] = {};
    h.state.finance[target] = {};
    h.state.economy[target] = {};
    h.state.trade.USA.sanctions.push({
      policyId: 'SAN-USA-' + target, issuerCountryId: 'USA',
      targetCountryId: target, type: 'FINANCIAL_SANCTIONS',
      direction: 'BOTH', status: 'ACTIVE', startTurn: 20 + index
    });
  }
  const first = h.context.OmegaSanctionResponseRuntime.runTurn();
  assert.equal(first.policiesProcessed, 6);
  h.state.simulation.turn = 41;
  const second = h.context.OmegaSanctionResponseRuntime.runTurn();
  assert.equal(second.policiesProcessed, 6);
  for (let index = 0; index < 8; index++) {
    const target = 'C' + String(index).padStart(2, '0');
    assert.equal(h.state.foreign[target].sanctionNotifications.length, 1, target);
  }
});
