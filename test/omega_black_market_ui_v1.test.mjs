import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../omega_black_market_ui_v1.js', import.meta.url), 'utf8');

function harness() {
  const calls = { offers: [], deals: [] };
  const offer = {
    offerId: 'OFFER-1',
    sellerCountryId: '<SAU>',
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
    foreignPolicyBasis: ['EMBARGO-01', 'STATE_EXPORT_DIRECTIVE'],
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
  const api = {
    getDeals(country) {
      assert.equal(country, 'BGD');
      return [{ dealId: 'D-1', status: 'SETTLED', resourceId: 'iron_ore', productName: 'Iron Ore', sellerCountryId: 'SAU', quantity: 10, unit: 'tonnes', unitPrice: 100, currency: 'USD', createdTurn: 7 }];
    },
    getCases(country) {
      assert.equal(country, 'BGD');
      return [{ status: 'OPEN', resourceId: 'iron_ore', buyerCountryId: 'BGD', sellerCountryId: 'SAU', evidenceConfidence: 0.7, detectionTurn: 8 }];
    },
    getResponses(country) {
      assert.equal(country, 'BGD');
      return [{ responseType: 'DIPLOMATIC_PROTEST', targetCountryId: 'BGD', severity: 'HIGH' }];
    },
    getOffers(country, resourceId, quantity) {
      calls.offers.push({ country, resourceId, quantity });
      return { status: 'READY', offers: [offer] };
    },
    createDeal(payload) {
      calls.deals.push(payload);
      return { accepted: true, dealId: 'D-2' };
    }
  };
  const root = {
    innerHTML: '',
    listeners: Object.create(null),
    fields: {
      '[data-bm-resource]': { value: 'iron_ore' },
      '[data-bm-find-quantity]': { value: '4' }
    },
    quantityField: {
      value: '4',
      getAttribute(name) { return name === 'data-bm-quantity' ? 'OFFER-1' : null; }
    },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    contains() { return true; },
    querySelector(selector) { return this.fields[selector] || null; },
    querySelectorAll() { return [this.quantityField]; }
  };
  const context = {
    OmegaBlackMarket: api,
    OmegaGlobalMarket: {
      productCatalog() {
        return [
          { id: 'iron_ore', name: 'Iron Ore', productType: 'RAW_RESOURCE' },
          { id: 'steel_plate', name: 'Steel Plate', productType: 'FACTORY_PRODUCT' },
          { id: 'processed_food', name: 'Processed Food', productType: 'FOOD_PRODUCT' }
        ];
      }
    },
    Intl, Number, String, Array, Math, Object, Set, Date, console
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'omega_black_market_ui_v1.js' });
  return { api: context.OmegaBlackMarketUI, root, calls };
}

function click(root, attributes) {
  const target = {
    closest() { return this; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name); },
    getAttribute(name) { return attributes[name] ?? null; }
  };
  root.listeners.click({ target, preventDefault() {} });
}

test('strategy console renders country-scoped lanes, operational metrics and intelligence panels', () => {
  const h = harness();
  const result = h.api.render(h.root, 'BGD');
  assert.equal(result.ok, true);
  assert.equal(result.countryId, 'BGD');
  assert.match(h.root.innerHTML, /Black Market Operations/);
  assert.match(h.root.innerHTML, /RAW RESOURCES/);
  assert.match(h.root.innerHTML, /FACTORY PRODUCTS/);
  assert.match(h.root.innerHTML, /FOOD PRODUCTS/);
  assert.match(h.root.innerHTML, /Covert deal ledger/);
  assert.match(h.root.innerHTML, /Intelligence & foreign response/);
  assert.match(h.root.innerHTML, /Investigation files/);
  assert.match(h.root.innerHTML, /Country command scope · BGD/);
  assert.doesNotMatch(h.root.innerHTML, /undefined/);
});

test('offer scan uses the selected canonical commodity and displays real price and risk evidence safely', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  assert.equal(JSON.stringify(h.calls.offers), JSON.stringify([{ country: 'BGD', resourceId: 'iron_ore', quantity: 4 }]));
  assert.match(h.root.innerHTML, /SEND DEAL REQUEST/);
  assert.match(h.root.innerHTML, /125\.00/);
  assert.match(h.root.innerHTML, /EMBARGO BYPASS/);
  assert.match(h.root.innerHTML, /Foreign-policy exposure \/ evidence/);
  assert.match(h.root.innerHTML, /&lt;SAU&gt;/);
  assert.doesNotMatch(h.root.innerHTML, /<SAU>/);
  assert.doesNotMatch(h.root.innerHTML, /undefined/);
});

test('lane navigation clears stale offers and switches the canonical product category', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  click(h.root, { 'data-bm-lane': '', 'data-bm-lane': 'FACTORY_PRODUCT' });
  assert.match(h.root.innerHTML, /FACTORY PRODUCTS/);
  assert.match(h.root.innerHTML, /Steel Plate/);
  assert.doesNotMatch(h.root.innerHTML, /SEND DEAL REQUEST/);
  assert.equal(h.root.__omegaBmOffers.length, 0);
});

test('covert deal button calls the existing deal API with the requested country, seller, product and quantity', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  click(h.root, {
    'data-bm-buy': 'OFFER-1',
    'data-bm-seller': '<SAU>',
    'data-bm-resource': 'iron_ore'
  });
  assert.equal(h.calls.deals.length, 1);
  assert.equal(JSON.stringify(h.calls.deals[0]), JSON.stringify({
    buyerCountryId: 'BGD',
    sellerCountryId: '<SAU>',
    resourceId: 'iron_ore',
    offerId: 'OFFER-1',
    quantity: 4
  }));
  assert.match(h.root.innerHTML, /Trade request recorded/);
});
