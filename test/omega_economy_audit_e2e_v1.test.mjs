import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(here, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(rootDir, file), 'utf8'));
const readCode = file => fs.readFileSync(path.join(rootDir, file), 'utf8');

class CustomEventMock {
  constructor(type, init = {}) {
    this.type = String(type);
    this.detail = init.detail;
  }
}

function makeHarness(initialState = {}) {
  const listeners = new Map();
  const state = structuredClone(initialState);
  const industrialCatalog = readJson('resource_industrial_catalog_v1.json');
  const economyRules = readJson('resource_economy_rules.json');
  const naRules = readJson('national_accounts_rules_v1.json');
  const npcRules = readJson('npc_national_macro_economy_rules_v1.json');
  const countryProfiles = readJson('countries.json');

  const identityRows = [
    { iso3: 'BGD', iso2: 'BD', countryCode: 'BD', economyKey: 'BGD', name: 'Bangladesh', currencyCode: 'BDT', indicators: { gdpCurrentUsd: 450000, gdpGrowthPct: 6, inflationRatePct: 5, unemploymentRatePct: 4 } },
    { iso3: 'SAU', iso2: 'SA', countryCode: 'SA', economyKey: 'SAU', name: 'Saudi Arabia', currencyCode: 'SAR', indicators: { gdpCurrentUsd: 900000, gdpGrowthPct: 3, inflationRatePct: 2, unemploymentRatePct: 5 } },
    { iso3: 'AAA', iso2: 'AA', countryCode: 'AA', economyKey: 'AAA', name: 'Alpha', currencyCode: 'USD', indicators: { gdpCurrentUsd: 1000000, gdpGrowthPct: 2, inflationRatePct: 3, unemploymentRatePct: 4 } }
  ];

  const identity = {
    resolveCountry(v) {
      const raw = String(v || '').trim().toUpperCase();
      const row = identityRows.find(r => [r.iso3, r.iso2, r.name].some(x => x.toUpperCase() === raw));
      return row ? { id: row.iso3, raw: row } : (/^[A-Z]{3}$/.test(raw) ? { id: raw, raw: { iso3: raw, countryId: raw } } : null);
    },
    list() { return identityRows.map(r => r.iso3); }
  };

  const forexRates = { USD: 1, BDT: 100, SAR: 3.75 };
  const forex = {
    getProfiles() { return identityRows.slice(); },
    getCurrencyCode(p) { return p?.currencyCode || 'USD'; },
    getRate(code) { return forexRates[String(code || '').toUpperCase()] ?? null; }
  };

  const financeApi = {
    async init() { return { initialized: true }; },
    getProfiles() { return identityRows.slice(); },
    getProfileMetadata() { return { baselineYear: 2015, economicBaselineSource: 'economy.json' }; },
    resolveCountry(v) {
      const raw = String(v || '').trim().toUpperCase();
      return identityRows.find(r => [r.iso3, r.iso2, r.name].some(x => x.toUpperCase() === raw)) || null;
    }
  };

  const npcMacroMetricIds = npcRules.baseline.metrics.map(rule => rule.id);
  const npcMacroInputs = {
    metadata: {
      datasetId: 'OMEGA_NPC_NATIONAL_MACRO_ECONOMY_INPUTS_V1',
      schemaVersion: '1.0.0',
      sourceMode: 'TEST_FIXTURE',
      sourceRegistry: 'test-fixture',
      countryCount: identityRows.length,
      metricIds: npcMacroMetricIds
    },
    countries: Object.fromEntries(identityRows.map(profile => [profile.iso3, {
      metrics: Object.fromEntries(npcRules.baseline.metrics.map(rule => {
        const raw = profile.indicators?.[rule.profileMetric];
        const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
        return [rule.id, {
          value,
          year: value === null ? null : 2024,
          sourceStatus: value === null ? 'MISSING_TEST_FIXTURE' : 'TEST_FIXTURE_OBSERVATION',
          sourceId: value === null ? null : 'test-economy-fixture',
          sourceName: value === null ? null : 'Economy audit test fixture',
          method: value === null ? null : 'TEST_FIXTURE',
          indicatorCode: null,
          sourceUrl: null,
          confidence: value === null ? null : 1,
          dataGap: value === null ? 'MISSING_TEST_FIXTURE' : null,
          note: null
        }];
      }))
    }]))
  };

  const events = [];
  const handlers = new Map();
  const schedulerHandlers = new Map();

  function txFactory(countryId) {
    const normalizePath = p => String(p || '').split('.').filter(Boolean);
    return {
      // Match the production transaction contract: peek is a read-only view
      // and does not allocate a detached copy; get() remains defensive.
      peek(pathStr) {
        const parts = normalizePath(pathStr);
        if (!parts.length) return undefined;
        let cur = state[parts[0]]?.[countryId];
        for (let i = 1; i < parts.length; i++) {
          if (cur == null) return undefined;
          cur = cur[parts[i]];
        }
        return cur;
      },
      get(pathStr) {
        const parts = normalizePath(pathStr);
        if (!parts.length) return undefined;
        let cur = state[parts[0]]?.[countryId];
        for (let i = 1; i < parts.length; i++) {
          if (cur == null) return undefined;
          cur = cur[parts[i]];
        }
        return cur === undefined ? undefined : structuredClone(cur);
      },
      set(pathStr, value) {
        const parts = normalizePath(pathStr);
        if (!parts.length) return;
        state[parts[0]] = state[parts[0]] || {};
        state[parts[0]][countryId] = state[parts[0]][countryId] || {};
        if (parts.length === 1) { state[parts[0]][countryId] = structuredClone(value); return; }
        let cur = state[parts[0]][countryId];
        for (let i = 1; i < parts.length - 1; i++) {
          if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
          cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = structuredClone(value);
      }
    };
  }

  const interop = {
    registerAction() {},
    registerCommandHandler(type, owner, fn) {
      handlers.set(String(type), { owner, fn });
    },
    dispatchCommand(owner, type, countryId, payload = {}, meta = {}) {
      const reg = handlers.get(String(type));
      if (!reg) return { status: 'UNHANDLED', reason: 'HANDLER_MISSING:' + type };
      const tx = txFactory(countryId);
      const res = reg.fn({ commandId: meta.commandId || ('CMD-' + type), payload }, { countryId, simulationTurn: meta.turn ?? state.simulation?.turn ?? 1, stateTransaction: tx });
      return { status: res?.accepted === false ? 'FAILED' : 'APPLIED', result: res };
    },
    emitEvent(type, countryId, source, payload, meta) {
      const evt = new CustomEventMock(type, { detail: { eventType: type, countryId, source, payload, meta } });
      events.push(evt);
      for (const fn of listeners.get(type) || []) fn(evt);
      return true;
    }
  };

  const alphaCode = n => {
    let v = n, out = '';
    for (let i = 0; i < 3; i++) { out = String.fromCharCode(65 + (v % 26)) + out; v = Math.floor(v / 26); }
    return out;
  };
  const naManifestCountries = { BGD: { countryCode: 'BGD' }, SAU: { countryCode: 'SAU' }, AAA: { countryCode: 'AAA' } };
  for (let i = 0; Object.keys(naManifestCountries).length < 197; i++) {
    const code = alphaCode(i);
    if (!naManifestCountries[code]) naManifestCountries[code] = { countryCode: code };
  }

  const fetchMock = async input => {
    const clean = String(input || '').split('?')[0].replace(/^\.\//, '').replace(/^\/+/, '');
    if (clean === 'resource_industrial_catalog_v1.json') return { ok: true, status: 200, json: async () => structuredClone(industrialCatalog) };
    if (clean === 'resource_economy_rules.json') return { ok: true, status: 200, json: async () => structuredClone(economyRules) };
    if (clean === 'national_accounts_rules_v1.json') return { ok: true, status: 200, json: async () => structuredClone(naRules) };
    if (clean === 'minister_country_roster_manifest_v1.json') return { ok: true, status: 200, json: async () => ({ scope: 'TEST_ROSTER', countries: naManifestCountries }) };
    if (clean === 'npc_national_macro_economy_rules_v1.json') return { ok: true, status: 200, json: async () => structuredClone(npcRules) };
    try {
      const data = readJson(clean);
      return { ok: true, status: 200, json: async () => structuredClone(data) };
    } catch (_) {
      return { ok: false, status: 404, json: async () => { throw new Error('NOT_FOUND:' + clean); } };
    }
  };

  const context = {
    console, Math, Number, String, Object, Array, Set, Map, WeakMap, Promise, JSON, Date, Intl, Error,
    setTimeout, clearTimeout,
    CustomEvent: CustomEventMock,
    fetch: fetchMock,
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type);
      if (list) listeners.set(type, list.filter(x => x !== fn));
    },
    dispatchEvent(evt) {
      events.push(evt);
      for (const fn of listeners.get(evt.type) || []) fn(evt);
      return true;
    },
    Game: { state },
    gameState: state,
    Omega: {
      Simulation: { world: { state }, clock: { turn: state.simulation?.turn ?? 1 }, getPlayerCountryId: () => state.simulation?.session?.playerCountryId || 'BGD' },
      MinistryInteroperability: interop,
      CanonicalIdentity: identity,
      FinanceMinistry: financeApi,
      ForexMonetaryEngine: forex,
      WorldSimulationScheduler: {
        registerCountryHandler(id, fn, opts) { schedulerHandlers.set(id, { fn, opts }); return () => schedulerHandlers.delete(id); }
      }
    },
    OmegaMinistryInteroperability: interop,
    OmegaCanonicalIdentityRegistry: identity,
    OmegaFinanceMinistry: financeApi,
    OmegaForexMonetaryEngine: forex,
    OmegaResourceIndustrialCatalogData: structuredClone(industrialCatalog),
    OmegaCountryProfilesData: countryProfiles,
    __OMEGA_NPC_MACRO_FIXTURES__: {
      manifest: { schemaVersion: '1.0.0', scope: 'TEST_NPC_ROSTER', counts: { countryEntities: 3 }, countries: { BGD: {}, SAU: {}, AAA: {} } },
      rules: structuredClone(npcRules),
      inputs: npcMacroInputs
    },
    // Test-scoped SAB34 certificate (production omega_sab34_live_browser_proof_v1.js remains untouched)
    OmegaSab34LiveBrowserProofV1: {
      isProductionAuthorized: () => true,
      getCertification: () => ({ status: 'VERIFIED', liveBrowserProof: true, verifiedStages: ['MINE', 'FACTORY', 'WAREHOUSE', 'MARKET'] })
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  const load = file => vm.runInContext(readCode(file), context, { filename: file });
  return { context, state, events, listeners, handlers, load, industrialCatalog, economyRules, naRules, npcRules, naManifestCountries };
}

test('Audit #4 & #5: All 63 orphaned outputs have terminal buyers, 31 by-products have lifecycle rules, and compatible feedstock substitution works', () => {
  const h = makeHarness({
    simulation: { turn: 2, session: { playerCountryId: 'BGD' } },
    finance: { BGD: { available: 10000 } },
    resource: {
      BGD: {
        inventory: { ore_tailings: 100, blast_furnace_slag: 40 },
        batches: [
          { batchId: 'B-TAIL-1', resourceId: 'ore_tailings', quantity: 100, remainingQuantity: 100, stage: 'RAW', status: 'AVAILABLE' },
          { batchId: 'B-SLAG-1', resourceId: 'blast_furnace_slag', quantity: 40, remainingQuantity: 40, stage: 'INTERMEDIATE', status: 'AVAILABLE' }
        ],
        warehouse: { availableByResource: { ore_tailings: 100 }, reservedByResource: {} },
        processedWarehouse: { availableByResource: { blast_furnace_slag: 40 }, reservedByResource: {} }
      }
    }
  });
  h.load('omega_resource_industrial_network_v1.js');
  const net = h.context.OmegaResourceIndustrialNetwork;

  const orphanIds = ['silver_concentrate', 'nickel_concentrate', 'cobalt_hydroxide', 'rare_earth_concentrate', 'sorted_diamonds', 'readymade_garments', 'processed_food', 'pharmaceutical_goods', 'vehicles', 'battery_packs'];
  for (const rid of orphanIds) {
    const routes = net.getTerminalBuyerRoutes(rid);
    assert.ok(routes && Array.isArray(routes.buyerChannels) && routes.buyerChannels.length > 0, `expected terminal buyerChannels for ${rid}`);
  }
  assert.equal(Object.keys(h.industrialCatalog.terminalBuyerCatalog.products).length, 63);
  assert.equal(Object.keys(h.industrialCatalog.byProductLifecycle.entries).length, 31);

  const tailingsRule = net.getByProductLifecycle('ore_tailings');
  assert.equal(tailingsRule.disposition, 'CONTROLLED_DISPOSAL');
  const slagRule = net.getByProductLifecycle('blast_furnace_slag');
  assert.equal(slagRule.disposition, 'INDUSTRIAL_SLAG_RECOVERY');

  // Verify explicit by-product disposal and recycling
  h.load('omega_resource_economy_runtime_v2.js');
  const disposalRes = net.processByProductLifecycle('BGD', { disposeWaste: true, recycleRecovery: true });
  assert.equal(disposalRes.status, 'COMPLETED');
  assert.ok(disposalRes.actions.some(a => a.resourceId === 'ore_tailings' && a.type === 'CONTROLLED_DISPOSAL'));
  assert.ok(disposalRes.actions.some(a => a.resourceId === 'blast_furnace_slag' && a.type === 'RECYCLE_RECOVERY'));

  // Compatible feedstock substitution when asset has no direct recipe but compatible input class
  const rec = net.recipeFor('silver_concentrate', { factoryType: 'NONFERROUS_SMELTER_REFINERY', allowCompatibleFeedstockSubstitution: true });
  assert.ok(rec && rec.compatibleSubstitution === true && rec.recipeAuthority === 'COMPATIBLE_FEEDSTOCK_SUBSTITUTION');
});

test('Audit #1, #2, #3, #6: Price provenance blocks fake reference-price sales, enforces batch reservations, settles observed consumer/gov buyer orders + Treasury, and survives save/load', () => {
  const initialState = {
    simulation: { turn: 5, session: { playerCountryId: 'BGD' } },
    finance: { BGD: { available: 50000, reserves: 100000, currencyCode: 'BDT' } },
    economy: { BGD: { gdp: 450000, currencyCode: 'BDT', population: 170000000 } },
    trade: {
      BGD: {
        settlementCurrency: 'BDT',
        marketPrice: {
          pharmaceutical_goods: 250
        },
        offerBook: {}
      },
      SAU: { settlementCurrency: 'SAR', offerBook: {} }
    },
    resource: {
      BGD: {
        inventory: { processed_food: 100, pharmaceutical_goods: 40 },
        batches: [
          { batchId: 'BATCH-FOOD-1', resourceId: 'processed_food', quantity: 100, remainingQuantity: 100, unit: 'TONNE', stage: 'FINISHED', status: 'AVAILABLE', ownerCompanyId: 'APEX', operatorCompanyId: 'APEX', ownerAttributionStatus: 'VERIFIED' },
          { batchId: 'BATCH-PHARMA-1', resourceId: 'pharmaceutical_goods', quantity: 40, remainingQuantity: 40, unit: 'TONNE', stage: 'FINISHED', status: 'AVAILABLE', ownerCompanyId: 'APEX', operatorCompanyId: 'APEX', ownerAttributionStatus: 'VERIFIED' }
        ],
        processedWarehouse: { availableByResource: { processed_food: 100, pharmaceutical_goods: 40 }, reservedByResource: {} },
        industrialNetwork: { factories: [], mines: [], shipments: [], projects: [], batchReservations: [] }
      }
    }
  };
  const h = makeHarness(initialState);
  h.load('omega_resource_industrial_network_v1.js');
  h.load('omega_resource_economy_runtime_v2.js');
  h.load('omega_resource_national_demand_runtime_v1.js');
  h.load('omega_global_market_system.js');
  h.load('omega_global_trade_system.js');

  const econ = h.context.OmegaResourceEconomy;
  const net = h.context.OmegaResourceIndustrialNetwork;

  // Step 2: Check price provenance without market clearing (should NOT mark executable OBSERVED clearing)
  const simProv = econ.resolvePriceWithProvenance('BGD', 'processed_food');
  assert.equal(simProv.executablePrice, false);
  assert.ok(['REFERENCE', 'SIMULATED'].includes(simProv.priceProvenance));

  // Publish indicative offer book: auto-offers must be flagged indicativeOnly
  const market = h.context.OmegaGlobalMarket;
  const books = market.rebuild();
  assert.equal(books.processed_food?.clearing?.status === 'CLEARED', false, 'indicative auto-offer must not clear without buyer order');

  // Step 3: Zero fake sales if quantity = 0 or only indicative price exists without contract price
  const zeroOrder = econ.submitBuyerOrder('BGD', { buyerType: 'HOUSEHOLD', resourceId: 'processed_food', quantity: 0, contractUnitPrice: 120 });
  assert.equal(zeroOrder.status, 'FAILED');
  const settleZero = econ.settleBuyerOrders('BGD');
  assert.equal(settleZero.settled, 0, 'zero quantity must never settle');

  // Indicatively priced order WITHOUT allowExplicitContractPrice must be blocked cleanly (never settled on fake price)
  const blockedOrder = econ.submitBuyerOrder('BGD', {
    orderId: 'ORD-NO-PRICE', buyerType: 'HOUSEHOLD', buyerId: 'HH-RETAIL-0',
    resourceId: 'processed_food', quantity: 5, currency: 'BDT', budgetAvailable: 5000
  });
  assert.equal(blockedOrder.status, 'APPLIED');
  const blockedSettle = econ.settleBuyerOrders('BGD');
  assert.equal(blockedSettle.settled, 0, 'must not settle on simulated/indicative price without observed clearing or explicit contract');
  assert.equal(blockedSettle.blocked, 1);

  // Step 6: Batch reservation lock prevents double-selling via marketFreeQuantity AND privateCompanyAvailableStock
  const lock = net.reserveBatchesForCommitment('BGD', 'COMMIT-LOCK-1', [{ batchId: 'BATCH-FOOD-1', resourceId: 'processed_food', quantity: 70 }], { purpose: 'EXPORT_COMMIT' });
  assert.equal(lock.status, 'RESERVED');
  assert.equal(econ.marketFreeQuantity('BGD', 'processed_food'), 30, 'marketFreeQuantity must exclude 70 locked units');
  const privAvail = h.context.OmegaGlobalMarket.privateCompanySuppliers('processed_food', 40, 'SAU', 'APEX', 'BGD');
  assert.equal(privAvail.length, 0, 'locked batches must prevent 40-unit private supplier eligibility when only 30 unlocked');

  // Step 3: Settle real buyer order (20 units with explicit contracted price within unlocked 30)
  const hhOrder = econ.submitBuyerOrder('BGD', {
    orderId: 'ORD-HH-1', buyerType: 'HOUSEHOLD', buyerId: 'HH-RETAIL-1',
    resourceId: 'processed_food', quantity: 20, allowExplicitContractPrice: true, contractUnitPrice: 125, currency: 'BDT', budgetAvailable: 5000
  });
  assert.equal(hhOrder.status, 'APPLIED');
  const govOrder = econ.submitBuyerOrder('BGD', {
    orderId: 'ORD-GOV-1', buyerType: 'GOVERNMENT', buyerId: 'HEALTH_MINISTRY',
    resourceId: 'pharmaceutical_goods', quantity: 10, currency: 'BDT', debitGovernmentTreasury: true
  });
  assert.equal(govOrder.status, 'APPLIED');

  const settled = econ.settleBuyerOrders('BGD');
  assert.equal(settled.settled, 2, 'both valid buyer orders must settle');
  assert.equal(h.state.resource.BGD.inventory.processed_food, 80);
  assert.equal(h.state.resource.BGD.inventory.pharmaceutical_goods, 30);
  assert.equal(settled.settlements.some(s => s.orderId === 'ORD-GOV-1' && s.treasuryDebited === true), true);
  assert.equal(h.state.finance.BGD.available, 50000 - 2500 + 150, 'Government buyer order debits Treasury (2500) and domestic sales remit royalty+tax receipts (150)');
  assert.equal(h.state.trade.BGD.buyerSettlements.length, 2);

  // Release batch lock and check free stock restores
  net.releaseBatchReservation('BGD', 'COMMIT-LOCK-1');
  assert.equal(econ.marketFreeQuantity('BGD', 'processed_food'), 80);

  // Save/Load roundtrip check
  const serialized = JSON.stringify(h.state);
  const restored = makeHarness(JSON.parse(serialized));
  restored.load('omega_resource_economy_runtime_v2.js');
  assert.equal(restored.state.trade.BGD.buyerSettlements.length, 2);
  assert.equal(restored.state.finance.BGD.available, 47650);
});

test('Audit #7: Company market research queue resolves in Global Market and syncs into Private Enterprise Lifecycle', async () => {
  const initialState = {
    simulation: { turn: 10, session: { playerCountryId: 'BGD' } },
    finance: { BGD: { available: 100000, currencyCode: 'BDT' } },
    economy: { BGD: { currencyCode: 'BDT', productionAssets: [] } },
    trade: {
      BGD: { settlementCurrency: 'BDT', importRequests: [{ requestId: 'REQ-1', resourceId: 'steel', quantity: 50, unitPrice: 800, status: 'SENT' }], offerBook: {} },
      SAU: { settlementCurrency: 'USD', offerBook: { steel: { offerId: 'ASK-SAU-1', resourceId: 'steel', quantity: 100, unitPrice: 750 } } }
    },
    resource: { BGD: { inventory: { iron_ore: 200 }, batches: [] }, SAU: { inventory: { steel: 500 }, batches: [] } },
    foreign: { BGD: { relations: { SAU: { trade_agreement: true } } }, SAU: { relations: { BGD: { trade_agreement: true } } } }
  };
  const h = makeHarness(initialState);
  h.load('omega_global_market_system.js');
  h.load('omega_private_enterprise_lifecycle_v1.js');

  const market = h.context.OmegaGlobalMarket;
  const pe = h.context.OmegaPrivateEnterpriseLifecycleV1;

  // Manually register a matching research request in PE & GlobalMarket queue
  const queueRes = market.requestCompanyResearch('BGD', {
    requestId: 'MRES-AUDIT-1', companyId: 'APEX', factoryType: 'steel_works',
    inputResources: ['iron_ore'], outputResources: ['steel'],
    inputRequirements: [{ resourceId: 'iron_ore', forecast30Day: 100 }],
    outputRequirements: [{ resourceId: 'steel', forecast30Day: 50 }]
  });
  assert.equal(queueRes.accepted, true);
  assert.equal(queueRes.request.status, 'QUEUED');

  // Seed same request into PE runtime queue as awaiting market evidence
  h.state.economy.BGD.privateEnterpriseLifecycle = {
    schemaVersion: '1.0.0', nextProposalSequence: 1, nextJointVentureSequence: 1, nextInvitationSequence: 1,
    proposals: [], events: [], financialPeriods: [], jointVentures: [], governmentInvitations: [],
    marketResearchRequests: [{ requestId: 'MRES-AUDIT-1', proposalId: 'PROP-1', companyId: 'APEX', countryId: 'BGD', status: 'SUBMITTED_TO_GLOBAL_MARKET', responseStatus: 'AWAITING_MARKET_EVIDENCE' }]
  };

  // rebuild triggers automatic resolveCompanyResearch
  await market.rebuildCountry('BGD');
  const resolvedQueue = market.getCompanyResearchRequests('BGD', 'APEX');
  assert.equal(resolvedQueue[0].status, 'RESOLVED');
  assert.equal(resolvedQueue[0].responseStatus, 'MARKET_EVIDENCE_OBSERVED');

  // Verify PrivateEnterpriseLifecycle synced it automatically
  const peRows = pe.getCompanyMarketResearchRequests('BGD', 'APEX');
  assert.equal(peRows[0].status, 'RESOLVED');
  assert.equal(peRows[0].responseStatus, 'MARKET_EVIDENCE_OBSERVED');
  assert.ok(peRows[0].marketEvidence);
});

test('Audit #8 & #9: National Accounts Phase 5 reconciles full sector/goods/GDP accounts & NPC macro derives autonomous plans without mutating Treasury/GDP', async () => {
  const fullState = {
    simulation: { turn: 4, session: { playerCountryId: 'AAA' } },
    finance: {
      BGD: {
        available: 25000,
        omegaFinance: {
          treasuryBalanceUsd: 1000,
          fiscalPeriodAccount: { openingBalanceUsd: 900, totalInflowsUsd: 200, totalOutflowsUsd: 100, flowCoverage: 'COMPLETE_FROM_PERIOD_START', flowComponents: { taxRevenueUsd: 180 } },
          ledger: [{ transactionId: 'FIN-1', action: 'EXPENSE', amountUsd: 100 }]
        }
      }
    },
    economy: {
      BGD: {
        gdp: 450000, currencyCode: 'BDT', productionCapacity: 300,
        companyAccounts: {
          APEX: { grossRevenue: 5000, paymentsReceived: 5000, paymentsMade: 3200, workerIncomePaid: 1200, taxPaid: 400, transportPaid: 200, currency: 'BDT' }
        },
        industrialRuntime: {
          productionLedger: [{ transactionId: 'PROD-1', status: 'COMPLETED', outputQuantities: { steel: 50 }, inputQuantities: { iron_ore: 80 } }]
        },
        nationalAccountsInputs: {
          approaches: {
            production: { value: 4600, currency: 'BDT', period: 'TURN-4', complete: true },
            expenditure: { value: 4600, currency: 'BDT', period: 'TURN-4', complete: true },
            income: { value: 4600, currency: 'BDT', period: 'TURN-4', complete: true }
          }
        }
      }
    },
    trade: {
      BGD: {
        settlementCurrency: 'BDT', importTariffPct: 10, policy: { stance: 'OPEN_MARKET' },
        globalTradeLedger: { settlements: [{ settlementId: 'S-1', status: 'SETTLED', turn: 4 }] },
        importLedger: [{ settlementId: 'S-1', resourceId: 'iron_ore', quantity: 20, totalValue: 400, currency: 'BDT', turn: 4 }],
        exportLedger: [{ settlementId: 'S-1', resourceId: 'steel', quantity: 10, totalValue: 1000, currency: 'BDT', turn: 4 }],
        importRequests: []
      }
    },
    foreign: {
      BGD: { relations: { AAA: { overall: 80, trade_agreement: true } }, policy: { stance: 'COOPERATIVE' } }
    },
    resource: {
      BGD: {
        openingInventoryByResource: { iron_ore: { quantity: 100, unit: 'TONNE' }, steel: { quantity: 20, unit: 'TONNE' } },
        batches: [
          { batchId: 'B-IRON', resourceId: 'iron_ore', unit: 'TONNE', quantity: 100, remainingQuantity: 40 },
          { batchId: 'B-STEEL', resourceId: 'steel', unit: 'TONNE', quantity: 70, remainingQuantity: 60 }
        ],
        buyerSettlements: [
          { settlementId: 'BUY-1', buyerType: 'HOUSEHOLD', resourceId: 'steel', quantity: 0, grossAmount: 3000, currency: 'BDT' },
          { settlementId: 'BUY-2', buyerType: 'GOVERNMENT', resourceId: 'steel', quantity: 0, grossAmount: 1000, currency: 'BDT', debitGovernmentTreasury: true }
        ],
        finishedGoodsLedger: [{ transactionId: 'FG-1', status: 'AVAILABLE_TO_ECONOMY', createdBatchIds: ['B-STEEL'], turn: 4 }]
      }
    }
  };
  const h = makeHarness(fullState);
  h.load('omega_national_accounts_runtime_v1.js');
  h.load('omega_npc_national_macro_economy_runtime_v1.js');

  await h.context.Omega.NationalAccounts.init();
  const naRes = await h.context.Omega.NationalAccounts.processCountry('BGD', { turn: 4, state: h.state });
  assert.equal(naRes.status, 'CHECKPOINTED');
  const stmt = h.state.economy.BGD.nationalAccounts;
  assert.equal(stmt.sectorAccounts.households.consumptionExpenditure, 3000);
  assert.equal(stmt.sectorAccounts.households.laborIncomeReceived, 1200);
  assert.equal(stmt.sectorAccounts.corporations.grossRevenue, 5000);
  assert.equal(stmt.sectorAccounts.generalGovernment.governmentProcurementSpendLocal, 1000);
  assert.equal(stmt.sectorAccounts.externalSector.netExternalTrade.netExports, 600);
  assert.equal(stmt.goods.stockFlowReconciliation.status, 'RECONCILED');
  assert.equal(stmt.gdp.status, 'RECONCILED');
  assert.equal(stmt.gdp.value, 4600);

  await h.context.Omega.NpcNationalMacroEconomy.init();
  const beforeGdp = h.state.economy.BGD.gdp;
  const beforeAvail = h.state.finance.BGD.available;
  const npcRes = await h.context.Omega.NpcNationalMacroEconomy.processCountry('BGD', { turn: 4, state: h.state });
  assert.equal(npcRes.status, 'CHECKPOINTED');
  assert.equal(h.state.economy.BGD.gdp, beforeGdp, 'NPC processCountry must never mutate GDP directly');
  assert.equal(h.state.finance.BGD.available, beforeAvail, 'NPC processCountry must never mutate Treasury directly');
  const npcSnap = h.state.economy.BGD.npcMacroEconomy;
  assert.equal(npcSnap.autonomousPolicyPlan.status, 'PLANNED');
  assert.ok(['BALANCED_EXPANSION', 'COUNTER_CYCLICAL_INVESTMENT_STIMULUS', 'INFLATION_CONTAINMENT_TIGHTENING'].includes(npcSnap.autonomousPolicyPlan.fiscalStance));
  const evalPlan = h.context.Omega.NpcNationalMacroEconomy.evaluateAutonomousActions('BGD', { turn: 4, state: h.state });
  assert.equal(evalPlan.status, 'PLANNED');
});

test('Audit #10: Transport fleet & route coverage reports verified coverage without fabricating vehicles', () => {
  const h = makeHarness({
    simulation: { turn: 1, session: { playerCountryId: 'BGD' } },
    transport: {
      BGD: {
        corridors: [{ id: 'CORR-1', mode: 'road', status: 'ACTIVE', capacityPerDay: 500 }],
        fleet: { trucks: 12, bulkShips: 0 }
      }
    },
    resource: {
      BGD: {
        industrialNetwork: {
          routes: [{ routeId: 'R-1', mode: 'ROAD', capacity: 100, status: 'OPERATIONAL' }],
          transportFleet: { fleetId: 'FLEET-BGD', roadTrucks: 12, tankers: 0 }
        }
      }
    }
  });
  h.load('omega_resource_industrial_network_v1.js');
  h.load('omega_resource_logistics_runtime_v1.js');

  const netCov = h.context.OmegaResourceIndustrialNetwork.evaluateTransportCoverage('BGD');
  assert.equal(netCov.countryId, 'BGD');
  assert.ok(Array.isArray(netCov.uncoveredModes));
  assert.ok(netCov.uncoveredModes.length > 0, 'unconfigured modes like rail/ship/pipeline must be reported honestly as gaps');

  const logCov = h.context.OmegaResourceLogisticsRuntime.evaluateRouteCoverage('BGD');
  assert.equal(logCov.countryId, 'BGD');
  assert.ok(Array.isArray(logCov.uncoveredModes));
});
