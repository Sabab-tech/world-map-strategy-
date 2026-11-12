import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../omega_black_market_ui_v1.js', import.meta.url), 'utf8');

function harness() {
  const calls = { offers: [], deals: [], batches: [], timers: [] };
  const networkReports = [];
  const offerRows = [];
  const offer = {
    offerId: 'OFFER-1', sellerCountryId: '<SAU>', resourceId: 'iron_ore',
    productName: 'Iron Ore', availableQuantity: 80, requestedQuantity: 4, unit: 'tonnes',
    unitPrice: 125, currency: 'USD', buyerCurrency: 'USD', expectedBlackMarketTotalBuyer: 560,
    legalLandedUnitPrice: null, expectedSavings: null, legalMarketAvailable: false, embargoed: true,
    whyUse: 'ACCESS DESPITE LEGAL OR DIPLOMATIC RESTRICTIONS',
    foreignPolicyBasis: ['IMPORT EMBARGO', 'STATE_EXPORT_DIRECTIVE'],
    detectionProbability: 0.12, lateDetectionProbability: 0.08, expectedFineCostBuyer: 15,
    expectedSeizedQuantity: 0.8, expectedDeliveredQuantity: 3.2,
    buyerMotiveCode: 'INDUSTRIAL_INPUT_SHORTAGE',
    buyerMotiveReason: 'Observed active factory input demand exceeds fulfilled supply.',
    sellerMotiveCode: 'STATE_DIRECTED_EXPORT_REVENUE',
    sellerMotiveReason: 'A recorded state supply directive creates a seller incentive.',
    sellerActorClass: 'STATE_LINKED',
    pricingBreakdown: {
      tariffDiscountPct: 30, riskPremiumPct: 12, policyPremiumPct: 8,
      scarcityPremiumPct: 5, brokerSpreadPct: 3
    }
  };
  offerRows.push(offer);
  const gameState = {
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
  const identities = {
    BGD: { id: 'BD', raw: { iso2: 'BD', iso3: 'BGD', name: 'Bangladesh' } },
    USA: { id: 'US', raw: { iso2: 'US', iso3: 'USA', name: 'United States' } },
    IRN: { id: 'IR', raw: { iso2: 'IR', iso3: 'IRN', name: 'Iran' } },
    RUS: { id: 'RU', raw: { iso2: 'RU', iso3: 'RUS', name: 'Russia' } },
    SAU: { id: 'SA', raw: { iso2: 'SA', iso3: 'SAU', name: 'Saudi Arabia' } }
  };
  const api = {
    getDeals(country) {
      assert.equal(country, 'BGD');
      return [{ dealId: 'D-1', status: 'SETTLED', resourceId: 'iron_ore', productName: 'Iron Ore',
        sellerCountryId: 'SAU', quantity: 10, unit: 'tonnes', unitPrice: 100, currency: 'USD', createdTurn: 7 }];
    },
    getCases(country) {
      assert.equal(country, 'BGD');
      return [{ status: 'OPEN', resourceId: 'iron_ore', buyerCountryId: 'BGD', sellerCountryId: 'SAU',
        evidenceConfidence: 0.7, detectionTurn: 8 }];
    },
    getResponses(country) {
      assert.equal(country, 'BGD');
      return [{ responseType: 'DIPLOMATIC_PROTEST', targetCountryId: 'BGD', severity: 'HIGH', sourceCountryId: 'SAU' }];
    },
    getNetworkReports(country) {
      assert.equal(country, 'BGD');
      return networkReports;
    },
    getTransits() { return []; },
    getOffers(country, resourceId, quantity) {
      calls.offers.push({ country, resourceId, quantity });
      return { status: 'READY', offers: offerRows };
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
      '[data-bm-find-quantity]': { value: '4' },
      '[data-bm-scan-progress]': { textContent: '' }
    },
    quantityField: {
      value: '4',
      getAttribute(name) { return name === 'data-bm-quantity' ? 'OFFER-1' : null; }
    },
    bidField: {
      value: '125',
      getAttribute(name) { return name === 'data-bm-bid' ? 'OFFER-1' : null; }
    },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    contains() { return true; },
    querySelector(selector) { return this.fields[selector] || null; },
    querySelectorAll() { return [this.quantityField, this.bidField]; }
  };
  const context = {
    Game: { state: gameState },
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
    OmegaCanonicalIdentityRegistry: {
      resolveCountry(value) { return identities[String(value || '').toUpperCase()] || null; }
    },
    setTimeout(fn) { calls.timers.push(fn); return calls.timers.length; },
    Intl, Number, String, Array, Math, Object, Set, Date, console
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'omega_black_market_ui_v1.js' });
  return { api: context.OmegaBlackMarketUI, root, calls, context, offer, offerRows, networkReports, gameState };
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
  let guard = 50;
  while (calls.timers.length && guard-- > 0) calls.timers.shift()();
  assert.ok(guard > 0, 'queued UI batches must finish without an endless callback loop');
}

test('blue market board renders readable category lanes and clear seller, buyer and acceptance panels', () => {
  const h = harness();
  const result = h.api.render(h.root, 'BGD');
  assert.equal(result.ok, true);
  assert.equal(result.countryId, 'BGD');
  assert.match(h.root.innerHTML, /Black Market Network/);
  assert.match(h.root.innerHTML, /RAW RESOURCES/);
  assert.match(h.root.innerHTML, /FACTORY PRODUCTS/);
  assert.match(h.root.innerHTML, /FOOD PRODUCTS/);
  assert.match(h.root.innerHTML, /Seller offers/);
  assert.match(h.root.innerHTML, /Countries interested in buying/);
  assert.match(h.root.innerHTML, /Recorded offers and acceptances/);
  assert.match(h.root.innerHTML, /Bangladesh/);
  assert.match(h.root.innerHTML, /🇧🇩/);
  assert.match(h.root.innerHTML, /assets\/omega-global-market\/raw-mining\.svg/);
  assert.doesNotMatch(h.root.innerHTML, /undefined/);
});

test('demand signals show potential buyer names and flags without implying acceptance', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  assert.match(h.root.innerHTML, /United States/);
  assert.match(h.root.innerHTML, /🇺🇸/);
  assert.match(h.root.innerHTML, /Iran/);
  assert.match(h.root.innerHTML, /🇮🇷/);
  assert.match(h.root.innerHTML, /POTENTIAL BUYER/);
  assert.match(h.root.innerHTML, /This is a buying-interest signal, not a Black Market request or acceptance/);
});

test('persisted deal records show the correct buyer, seller and exact accepted status', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  assert.match(h.root.innerHTML, /🇮🇷/);
  assert.match(h.root.innerHTML, /Iran/);
  assert.match(h.root.innerHTML, /🇷🇺/);
  assert.match(h.root.innerHTML, /Russia/);
  assert.match(h.root.innerHTML, /OFFER ACCEPTED/);
  assert.match(h.root.innerHTML, /1 accepted/);
});

test('seller scan uses the selected canonical commodity and displays verified stock, price, policy and flag', () => {
  const h = harness();
  h.offer.sellerCountryId = 'SAU';
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  assert.equal(JSON.stringify(h.calls.offers), JSON.stringify([{ country: 'BGD', resourceId: 'iron_ore', quantity: 4 }]));
  assert.match(h.root.innerHTML, /BUY/);
  assert.match(h.root.innerHTML, /125\.00/);
  assert.match(h.root.innerHTML, /IMPORT EMBARGO/);
  assert.match(h.root.innerHTML, /PRICE, POLICY, MOTIVE & RISK DETAILS/);
  assert.match(h.root.innerHTML, /Saudi Arabia/);
  assert.match(h.root.innerHTML, /🇸🇦/);
  assert.match(h.root.innerHTML, /Why Saudi Arabia sells/);
  assert.doesNotMatch(h.root.innerHTML, /undefined/);
});

test('HTML-sensitive country identifiers remain escaped inside seller and buyer rows', () => {
  const h = harness();
  h.offer.sellerCountryId = '<SAU>';
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  assert.match(h.root.innerHTML, /&lt;SAU&gt;/);
  assert.doesNotMatch(h.root.innerHTML, /<SAU>/);
  assert.doesNotMatch(h.root.innerHTML, /undefined/);
});

test('category navigation clears seller offers and chooses the first product in the new lane', () => {
  const h = harness();
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  click(h.root, { 'data-bm-lane': 'FACTORY_PRODUCT' });
  assert.match(h.root.innerHTML, /FACTORY PRODUCTS/);
  assert.match(h.root.innerHTML, /Steel Plate/);
  assert.doesNotMatch(h.root.innerHTML, /data-bm-buy=/);
  assert.equal(h.root.__omegaBmOffers.length, 0);
});

test('deal action uses the original createDeal API with exact buyer, seller, product and quantity', () => {
  const h = harness();
  h.offer.sellerCountryId = 'SAU';
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  click(h.root, { 'data-bm-buy': 'OFFER-1', 'data-bm-seller': 'SAU', 'data-bm-resource': 'iron_ore' });
  assert.equal(h.calls.deals.length, 1);
  assert.equal(JSON.stringify(h.calls.deals[0]), JSON.stringify({
    buyerCountryId: 'BGD', sellerCountryId: 'SAU', resourceId: 'iron_ore', offerId: 'OFFER-1', quantity: 4
  }));
  assert.match(h.root.innerHTML, /Trade request recorded/);
  assert.doesNotMatch(h.root.innerHTML, /data-bm-buy=/, 'old quotes are cleared after sending a request');
});

test('broker negotiation and counter acceptance remain available in the seller detail row', () => {
  const h = harness();
  h.offer.sellerCountryId = 'SAU';
  h.api.negotiateOffer = input => ({ accepted: true, decision: 'COUNTERED', negotiation: {
    ...input, negotiationId: 'NEG-1', status: 'COUNTERED', counterUnitPrice: 120, currency: 'USD'
  }});
  h.api.acceptCounterOffer = (_country, negotiationId) => ({ accepted: true, negotiation: {
    negotiationId, offerId: 'OFFER-1', status: 'ACCEPTED'
  }});
  h.api.createDeal = payload => { h.calls.deals.push(payload); return { accepted: true, dealId: 'D-2' }; };
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  click(h.root, { 'data-bm-negotiate': 'OFFER-1', 'data-bm-seller': 'SAU', 'data-bm-resource': 'iron_ore' });
  assert.match(h.root.innerHTML, /Broker counteroffer/);
  click(h.root, { 'data-bm-accept-counter': 'NEG-1' });
  assert.match(h.root.innerHTML, /Counter offer accepted/);
});

test('seller-country scan yields between batches and remains cancellable', () => {
  const h = harness();
  const api = h.context.OmegaBlackMarket;
  api.beginOfferScan = (country, resourceId, quantity) => {
    return { status: 'READY', buyerCountryId: country, resourceId, quantity, cursor: 0, offers: [], total: 2 };
  };
  api.getOfferScanBatch = (scan, size) => {
    h.calls.batches.push(size);
    scan.cursor++;
    if (scan.cursor === 1) {
      scan.offers.push({ ...h.offer, sellerCountryId: 'SAU' });
      return { status: 'READY', scanned: 1, total: 2, done: false };
    }
    return { status: 'READY', scanned: 2, total: 2, done: true };
  };
  api.finishOfferScan = scan => ({ status: 'READY', offers: scan.offers.slice() });
  h.api.render(h.root, 'BGD');
  click(h.root, { 'data-bm-find': '' });
  assert.equal(h.root.__omegaBmScanning, true);
  assert.equal(h.calls.batches.length, 0, 'the first batch runs only after yielding to the browser');
  assert.match(h.root.innerHTML, /SCANNING…/);
  flushTimers(h.calls);
  assert.deepEqual(h.calls.batches, [16, 16]);
  assert.equal(h.root.__omegaBmScanning, false);
  assert.match(h.root.innerHTML, /Saudi Arabia/);

  click(h.root, { 'data-bm-find': '' });
  assert.equal(h.calls.timers.length, 1);
  click(h.root, { 'data-bm-lane': 'FACTORY_PRODUCT' });
  assert.equal(h.root.__omegaBmScanning, false);
  flushTimers(h.calls);
  assert.doesNotMatch(h.root.innerHTML, /data-bm-buy=/);
  assert.match(h.root.innerHTML, /Steel Plate/);
});

test('high-confidence intelligence retains state actor evidence, motives and discovery privacy', () => {
  const h = harness();
  h.networkReports.push({
    level: 'HIGH', resourceId: 'copper', productName: 'Copper',
    summary: 'A transaction-linked covert network was identified.',
    buyerCountryId: 'IRN', sellerCountryId: 'RUS',
    governmentInvolvement: 'BOTH_GOVERNMENTS_OR_STATE_LINKED_ENTITIES',
    confidence: 0.9, otherCountriesKnow: 'NOT_OBSERVED_BY_OTHER_COUNTRIES',
    actorProfile: {
      buyerGovernmentLabel: 'State-linked trading network',
      sellerGovernmentLabel: 'State-directed trade channel',
      buyerReason: 'Observed industrial input demand exceeds available supply.',
      sellerReason: 'An active state supply directive is recorded for this commodity.',
      tactic: 'STATE_TO_STATE_COVERT_PROCUREMENT', potentialIntermediaryCountryIds: ['SAU']
    }
  });
  h.api.render(h.root, 'BGD');
  assert.match(h.root.innerHTML, /🇮🇷 Iran/);
  assert.match(h.root.innerHTML, /🇷🇺 Russia/);
  assert.match(h.root.innerHTML, /State-linked trading network/);
  assert.match(h.root.innerHTML, /State-directed trade channel/);
  assert.match(h.root.innerHTML, /Other countries: Not Observed By Other Countries/);
  assert.doesNotMatch(h.root.innerHTML, /undefined/);
});
