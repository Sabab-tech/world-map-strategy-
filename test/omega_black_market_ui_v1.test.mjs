import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../omega_black_market_ui_v1.js', import.meta.url), 'utf8');

function harness() {
  const calls = { offers: [], deals: [], begins: [], batches: [], timers: [] };
  const offer = {
    offerId: 'OFFER-1',
    sellerCountryId: 'SAU',
    resourceId: 'iron_ore',
    productName: 'Iron Ore',
    availableQuantity: 80,
    requestedQuantity: 4,
    unit: 'tonnes',
    unitPrice: 125,
    currency: 'USD',
    buyerCurrency: 'USD',
    expectedBlackMarketTotalBuyer: 560,
    legalLandedUnitPrice: 160,
    expectedSavings: 140,
    legalMarketAvailable: false,
    embargoed: true,
    whyUse: 'RESTRICTED_SUPPLY',
    foreignPolicyBasis: ['IMPORT EMBARGO', 'STATE_EXPORT_DIRECTIVE'],
    detectionProbability: 0.12,
    lateDetectionProbability: 0.08,
    expectedFineCostBuyer: 15,
    expectedSeizedQuantity: 0.8,
    expectedDeliveredQuantity: 3.2,
    pricingBreakdown: {
      tariffDiscountPct: 30,
      riskPremiumPct: 12,
      policyPremiumPct: 8,
      scarcityPremiumPct: 5,
      brokerSpreadPct: 3
    }
  };
  const state = {
    simulation: { turn: 8, session: { playerCountryId: 'BGD' } },
    resource: {
      BGD: {},
      USA: { demandRuntime: { lastTurn: 8, byResource: {
        iron_ore: { unmetDemand: 120, demandPerDay: 40, stockCoverageDays: 1, stockCoverageTargetDays: 5,
          procurementScore: 0.8, activeFactoryInputDemandPerDay: 25, status: 'SHORTAGE' }
      } } },
      IRN: { demandRuntime: { lastTurn: 8, byResource: {
        iron_ore: { unmetDemand: 35, demandPerDay: 18, stockCoverageDays: 2, stockCoverageTargetDays: 4,
          procurementScore: 0.55, status: 'SHORTAGE' }
      } } }
    },
    trade: {
      BGD: { blackMarketDeals: [
        { dealId: 'D-LOCAL', buyerCountryId: 'BGD', sellerCountryId: 'SAU', resourceId: 'iron_ore',
          productName: 'Iron Ore', quantity: 10, unit: 'tonnes', unitPrice: 100, currency: 'USD',
          status: 'SENT', createdTurn: 7 }
      ] },
      IRN: { blackMarketDeals: [
        { dealId: 'D-IRN-RUS', buyerCountryId: 'IRN', sellerCountryId: 'RUS', resourceId: 'iron_ore',
          productName: 'Iron Ore', quantity: 30, unit: 'tonnes', unitPrice: 118, currency: 'USD',
          status: 'ACCEPTED', createdTurn: 8 }
      ] }
    }
  };
  const profiles = {
    BGD: { countryCode: 'BD', iso3: 'BGD', name: 'Bangladesh' },
    USA: { countryCode: 'US', iso3: 'USA', name: 'United States' },
    IRN: { countryCode: 'IR', iso3: 'IRN', name: 'Iran' },
    RUS: { countryCode: 'RU', iso3: 'RUS', name: 'Russia' },
    SAU: { countryCode: 'SA', iso3: 'SAU', name: 'Saudi Arabia' }
  };
  const flags = { BGD: '🇧🇩', USA: '🇺🇸', IRN: '🇮🇷', RUS: '🇷🇺', SAU: '🇸🇦' };
  const api = {
    getDeals(country) {
      assert.equal(country, 'BGD');
      return state.trade.BGD.blackMarketDeals;
    },
    getCases(country) {
      assert.equal(country, 'BGD');
      return [{ status: 'OPEN', resourceId: 'iron_ore', buyerCountryId: 'BGD', sellerCountryId: 'SAU',
        evidenceConfidence: 0.7, detectionTurn: 8 }];
    },
    getResponses(country) {
      assert.equal(country, 'BGD');
      return [{ responseType: 'DIPLOMATIC_PROTEST', targetCountryId: 'BGD', sourceCountryId: 'SAU', severity: 'HIGH' }];
    },
    getNetworkReports(country) {
      assert.equal(country, 'BGD');
      return [];
    },
    getTransits() { return []; },
    beginOfferScan(country, resourceId, quantity) {
      calls.begins.push({ country, resourceId, quantity });
      return { status: 'READY', buyerCountryId: country, resourceId, quantity, cursor: 0, offers: [], total: 2 };
    },
    getOfferScanBatch(scan, size) {
      calls.batches.push(size);
      if (scan.cursor === 0) {
        scan.cursor = 1;
        scan.offers.push(offer);
        return { status: 'READY', offers: [offer], scanned: 1, total: 2, done: false };
      }
      scan.cursor = 2;
      return { status: 'READY', offers: [], scanned: 2, total: 2, done: true };
    },
    finishOfferScan(scan) {
      return { status: 'READY', offers: scan.offers.slice() };
    },
    getOffers(country, resourceId, quantity) {
      calls.offers.push({ country, resourceId, quantity });
      return { status: 'READY', offers: [offer] };
    },
    negotiateOffer(input) {
      return { accepted: true, decision: 'COUNTERED', negotiation: {
        ...input, offerId: input.offerId, negotiationId: 'NEG-1', status: 'COUNTERED',
        counterUnitPrice: 120, currency: 'USD'
      } };
    },
    acceptCounterOffer(country, negotiationId) {
      return { accepted: true, negotiation: { negotiationId, offerId: 'OFFER-1', status: 'ACCEPTED' } };
    },
    createDeal(payload) {
      calls.deals.push(payload);
      return { accepted: true, dealId: 'D-2' };
    }
  };
  const quantityField = {
    value: '4',
    getAttribute(name) { return name === 'data-bm-quantity' ? 'OFFER-1' : null; }
  };
  const bidField = {
    value: '125',
    getAttribute(name) { return name === 'data-bm-bid' ? 'OFFER-1' : null; }
  };
  const progressField = { textContent: '' };
  const productList = { innerHTML: '' };
  const root = {
    innerHTML: '',
    listeners: Object.create(null),
    findQuantity: { value: '4' },
    quantityField,
    bidField,
    progressField,
    productList,
    addEventListener(type, handler) { this.listeners[type] = handler; },
    contains() { return true; },
    querySelector(selector) {
      if (selector === '[data-bm-find-quantity]') return this.findQuantity;
      if (selector === '[data-bm-scan-progress]') return this.progressField;
      if (selector === '.omega-bm-product-list') return this.productList;
      return null;
    },
    querySelectorAll() { return [this.quantityField, this.bidField]; }
  };
  const context = {
    Game: { state },
    OmegaBlackMarket: api,
    OmegaGlobalMarket: {
      productCatalog() {
        return [
          { id: 'iron_ore', name: 'Iron Ore', productType: 'RAW_RESOURCE', unit: 'tonnes' },
          { id: 'steel_plate', name: 'Steel Plate', productType: 'FACTORY_PRODUCT', unit: 'tonnes' },
          { id: 'processed_food', name: 'Processed Food', productType: 'FOOD_PRODUCT', unit: 'tonnes' }
        ];
      }
    },
    OmegaCountryRuntimeData: {
      resolveCountry(value) { return profiles[String(value || '').toUpperCase()] || null; },
      flagFor(value) { return flags[String(value || '').toUpperCase()] || null; }
    },
    setTimeout(fn) { calls.timers.push(fn); return calls.timers.length; },
    Intl, Number, String, Array, Math, Object, Set, Date, console
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'omega_black_market_ui_v1.js' });
  return { api: context.OmegaBlackMarketUI, root, calls, context, offer };
}

function click(root, attributes) {
  const target = {
    closest() { return this; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name); },
    getAttribute(name) { return attributes[name] ?? null; }
  };
  root.listeners.click({ target, preventDefault() {} });
}

function flushTimers(calls) {
  let safety = 20;
  while (calls.timers.length && safety-- > 0) calls.timers.shift()();
  assert.ok(safety > 0, 'progressive scan must finish without an endless callback loop');
}

test('market board is readable and shows category lanes, country scope and visible participation panels', () => {
  const h = harness();
  const result = h.api.render(h.root, 'BGD');
  assert.equal(result.ok, true);
  assert.equal(result.countryId, 'BGD');
  assert.match(h.root.innerHTML, /Black Market Network/);
  assert.match(h.root.innerHTML, /RAW RESOURCES/);
  assert.match(h.root.innerHTML, /FACTORY PRODUCTS/);
  assert.match(h.root.innerHTML, /FOOD PRODUCTS/);
  assert.match(h.root.innerHTML, /Seller offers/);
  assert.match(h.root.innerHTML, /Buyer demand signals/);
  assert.match(h.root.innerHTML, /Confirmed offers, negotiations & acceptances/);
  assert.match(h.root.innerHTML, /Bangladesh/);
  assert.match(h.root.innerHTML, /🇧🇩/);
  assert.doesNotMatch(h.root.innerHTML, /undefined/);
});

test('buyer-demand country names and flags are listed without misrepresenting demand as acceptance', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  assert.match(h.root.innerHTML, /United States/);
  assert.match(h.root.innerHTML, /🇺🇸/);
  assert.match(h.root.innerHTML, /Iran/);
  assert.match(h.root.innerHTML, /🇮🇷/);
  assert.match(h.root.innerHTML, /POTENTIAL BUYER/);
  assert.match(h.root.innerHTML, /not a confirmed Black Market order or acceptance/);
  assert.match(h.root.innerHTML, /Russia/);
  assert.match(h.root.innerHTML, /🇷🇺/);
  assert.match(h.root.innerHTML, /OFFER ACCEPTED/);
});

test('seller scan runs in small asynchronous batches and displays verified offer details with country flag', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  assert.equal(h.root.__omegaBmScanning, true);
  assert.equal(h.calls.begins.length, 1);
  assert.equal(h.calls.batches.length, 0, 'scan work yields before the first batch');
  assert.match(h.root.innerHTML, /SCANNING NETWORK/);
  flushTimers(h.calls);
  assert.equal(h.root.__omegaBmScanning, false);
  assert.deepEqual(h.calls.batches, [16, 16]);
  assert.match(h.root.innerHTML, /Saudi Arabia/);
  assert.match(h.root.innerHTML, /🇸🇦/);
  assert.match(h.root.innerHTML, /\$125\.00/);
  assert.match(h.root.innerHTML, /IMPORT EMBARGO/);
  assert.match(h.root.innerHTML, /PRICE, POLICY & INTELLIGENCE DETAILS/);
  assert.match(h.root.innerHTML, /&lt;SAU&gt;|Saudi Arabia/);
  assert.doesNotMatch(h.root.innerHTML, /undefined/);
});

test('changing commodity lane clears old scan results and selects the first product in the new lane', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  flushTimers(h.calls);
  assert.match(h.root.innerHTML, /BUY/);
  click(h.root, { 'data-bm-lane': 'FACTORY_PRODUCT' });
  assert.match(h.root.innerHTML, /FACTORY PRODUCTS/);
  assert.match(h.root.innerHTML, /Steel Plate/);
  assert.doesNotMatch(h.root.innerHTML, /Saudi Arabia/);
  assert.equal(h.root.__omegaBmOffers.length, 0);
});

test('changing commodity during a pending scan invalidates its old batch callbacks', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  assert.equal(h.calls.timers.length, 1);
  click(h.root, { 'data-bm-lane': 'FACTORY_PRODUCT' });
  assert.equal(h.root.__omegaBmScanning, false);
  flushTimers(h.calls);
  assert.equal(h.root.__omegaBmOffers.length, 0);
  assert.match(h.root.innerHTML, /Steel Plate/);
});

test('seller deal action uses the original authoritative createDeal API with exact country, product and quantity', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  flushTimers(h.calls);
  click(h.root, {
    'data-bm-buy': 'OFFER-1',
    'data-bm-seller': 'SAU',
    'data-bm-resource': 'iron_ore'
  });
  assert.equal(h.calls.deals.length, 1);
  assert.equal(JSON.stringify(h.calls.deals[0]), JSON.stringify({
    buyerCountryId: 'BGD',
    sellerCountryId: 'SAU',
    resourceId: 'iron_ore',
    offerId: 'OFFER-1',
    quantity: 4
  }));
  assert.match(h.root.innerHTML, /Trade request recorded/);
});

test('broker negotiation and counter acceptance remain available in compact seller rows', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  flushTimers(h.calls);
  click(h.root, {
    'data-bm-negotiate': 'OFFER-1',
    'data-bm-seller': 'SAU',
    'data-bm-resource': 'iron_ore'
  });
  assert.match(h.root.innerHTML, /Broker countered at/);
  click(h.root, { 'data-bm-accept-counter': 'NEG-1' });
  assert.match(h.root.innerHTML, /Counteroffer accepted/);
});

test('HTML-sensitive country identifiers and names are escaped in country rows', () => {
  const h = harness();
  h.offer.sellerCountryId = '<SAU>';
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  flushTimers(h.calls);
  assert.match(h.root.innerHTML, /&lt;SAU&gt;/);
  assert.doesNotMatch(h.root.innerHTML, /<SAU>/);
  assert.doesNotMatch(h.root.innerHTML, /undefined/);
});
