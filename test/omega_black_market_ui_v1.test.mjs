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
    offerId: 'OFFER-1', sellerCountryId: 'SAU', resourceId: 'iron_ore',
    productName: 'Iron Ore', availableQuantity: 80, requestedQuantity: 4, unit: 'tonnes',
    unitPrice: 125, currency: 'USD', buyerCurrency: 'USD', expectedBlackMarketTotalBuyer: 560,
    quotedTradeValueBuyer: 500, legalLandedUnitPrice: 160, expectedSavings: 140, legalMarketAvailable: false,
    embargoed: true, whyUse: 'ACCESS DESPITE LEGAL OR DIPLOMATIC RESTRICTIONS',
    foreignPolicyBasis: ['IMPORT EMBARGO', 'STATE_EXPORT_DIRECTIVE'], detectionProbability: 0.12,
    lateDetectionProbability: 0.08, shipmentSizeBand: 'CRITICAL', sellerStockExposurePct: 18,
    repeatAttempts10Turns: 5, fineRate: 0.28, attemptFineRate: 0.126, seizureRate: 0.42,
    scrutinyThresholds: { sellerStockExposurePct: [1,3,8,15], sellerFreeStockQuantity: [1,3,8,15], unit: 'tonnes' },
    expectedFineCostBuyer: 15, expectedSeizedQuantity: 0.8, expectedDeliveredQuantity: 3.2,
    buyerMotiveCode: 'INDUSTRIAL_INPUT_SHORTAGE',
    buyerMotiveReason: 'Observed active factory input demand exceeds fulfilled supply.',
    sellerMotiveCode: 'STATE_DIRECTED_EXPORT_REVENUE',
    sellerMotiveReason: 'A recorded state supply directive creates a seller incentive.',
    sellerActorClass: 'STATE_LINKED', brokerType: 'STATE_LINKED', brokerReputation: 84,
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
        iron_ore: { unmetDemand: 120, demandPerDay: 40, stockCoverageDays: 1,
          stockCoverageTargetDays: 5, procurementScore: 0.8,
          activeFactoryInputDemandPerDay: 25, status: 'SHORTAGE' }
      } } },
      IRN: { demandRuntime: { lastTurn: 8, byResource: {
        iron_ore: { unmetDemand: 35, demandPerDay: 18, stockCoverageDays: 2,
          stockCoverageTargetDays: 4, procurementScore: 0.55, status: 'SHORTAGE' }
      } } }
    },
    trade: {
      BGD: { blackMarketDeals: [
        { dealId: 'D-LOCAL', buyerCountryId: 'BGD', sellerCountryId: 'SAU', resourceId: 'iron_ore',
          productName: 'Iron Ore', quantity: 10, unit: 'tonnes', unitPrice: 100, currency: 'USD',
          status: 'ACCEPTED', createdTurn: 7 }
      ] },
      IRN: { blackMarketDeals: [
        { dealId: 'D-SECRET', buyerCountryId: 'IRN', sellerCountryId: 'RUS', resourceId: 'iron_ore',
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
      return gameState.trade.BGD.blackMarketDeals;
    },
    getCases(country) {
      assert.equal(country, 'BGD');
      return [{ status: 'OPEN', severity: 'CRITICAL', resourceId: 'iron_ore',
        buyerCountryId: 'BGD', sellerCountryId: 'SAU', evidenceConfidence: 0.9,
        detectionTurn: 8, detectionStage: 'ORIGIN_INSPECTION', shipmentSizeBand: 'CRITICAL',
        sellerStockExposurePct: 18, attemptedValueBuyer: 50000, attemptFineRateAtCreation: 0.12,
        fineRateAtCreation: 0.30, seizureRateAtCreation: 0.50,
        cargoDisposition: 'STOPPED_BEFORE_IMPORT_NO_BUYER_STOCK_SEIZED',
        sanctionPolicyIds: ['SAN-USA-BGD-COAL'], sanctioningCountryIds: ['USA'] }];
    },
    getResponses(country) {
      assert.equal(country, 'BGD');
      return [{ responseType: 'SANCTIONS_ENFORCEMENT_AND_ENHANCED_INSPECTION',
        targetCountryId: 'BGD', severity: 'HIGH', sourceCountryId: 'USA',
        appliedRelationAdjustments: [
          { countryId: 'BGD', delta: -8, type: 'PRIMARY_SANCTIONS_VIOLATION' },
          { countryId: 'SAU', delta: -3, type: 'SECONDARY_TRADE_ASSOCIATION' }
        ] }];
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
    },
    negotiateOffer(input) {
      return { accepted: true, decision: 'COUNTERED', negotiation: {
        ...input, offerId: input.offerId, negotiationId: 'NEG-1',
        status: 'COUNTERED', counterUnitPrice: 120, currency: 'USD'
      } };
    },
    acceptCounterOffer(_country, negotiationId) {
      return { accepted: true, negotiation: { negotiationId, offerId: 'OFFER-1', status: 'ACCEPTED' } };
    }
  };
  const root = {
    innerHTML: '', listeners: Object.create(null),
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
  assert.ok(guard > 0, 'queued scan batches must finish without endless callbacks');
}

test('blue strategy board renders three commodity lanes and structured market panels', () => {
  const h = harness(),result=h.api.render(h.root,'BGD');
  assert.equal(result.ok,true);
  assert.equal(result.countryId,'BGD');
  assert.match(h.root.innerHTML,/Black Market Network/);
  assert.match(h.root.innerHTML,/RAW RESOURCES/);
  assert.match(h.root.innerHTML,/FACTORY PRODUCTS/);
  assert.match(h.root.innerHTML,/FOOD PRODUCTS/);
  assert.match(h.root.innerHTML,/assets\/omega-global-market\/raw-mining\.svg/);
  assert.match(h.root.innerHTML,/Seller offers/);
  assert.match(h.root.innerHTML,/Countries interested in buying/);
  assert.match(h.root.innerHTML,/Player-country requests & acceptances/);
  assert.match(h.root.innerHTML,/Bangladesh/);
  assert.match(h.root.innerHTML,/🇧🇩/);
  assert.doesNotMatch(h.root.innerHTML,/undefined/);
});

test('buyer interest table shows demand-backed countries and flags, not invented participants', () => {
  const h = harness();
  h.api.render(h.root,'BGD');
  assert.match(h.root.innerHTML,/United States/);
  assert.match(h.root.innerHTML,/🇺🇸/);
  assert.match(h.root.innerHTML,/Iran/);
  assert.match(h.root.innerHTML,/🇮🇷/);
  assert.match(h.root.innerHTML,/POTENTIAL BUYER/);
  assert.match(h.root.innerHTML,/not proof of an order/i);
});

test('player deal table counts only local saved acceptances and does not expose secret foreign NPC deals', () => {
  const h = harness();
  h.api.render(h.root,'BGD');
  assert.match(h.root.innerHTML,/Player-country acceptances/);
  assert.match(h.root.innerHTML,/1/);
  assert.match(h.root.innerHTML,/OFFER ACCEPTED/);
  assert.doesNotMatch(h.root.innerHTML,/D-SECRET/);
  assert.doesNotMatch(h.root.innerHTML,/Russia/);
});

test('seller scan displays flag, actor motive, policy, shipment exposure and penalty evidence', () => {
  const h = harness();
  h.api.render(h.root,'BGD');
  click(h.root,{'data-bm-find':''});
  assert.equal(JSON.stringify(h.calls.offers),JSON.stringify([{country:'BGD',resourceId:'iron_ore',quantity:4}]));
  assert.match(h.root.innerHTML,/BUY/);
  assert.match(h.root.innerHTML,/Saudi Arabia/);
  assert.match(h.root.innerHTML,/🇸🇦/);
  assert.match(h.root.innerHTML,/125\.00/);
  assert.match(h.root.innerHTML,/IMPORT EMBARGO/);
  assert.match(h.root.innerHTML,/Why Saudi Arabia sells/);
  assert.match(h.root.innerHTML,/Why Bangladesh wants this commodity/);
  assert.match(h.root.innerHTML,/Shipment class/);
  assert.match(h.root.innerHTML,/Quantity thresholds from verified free stock/);
  assert.match(h.root.innerHTML,/Potential penalties/);
  assert.match(h.root.innerHTML,/Foreign-policy exposure \/ evidence/);
  assert.doesNotMatch(h.root.innerHTML,/undefined/);
});

test('HTML-sensitive country identifiers are escaped in seller rows', () => {
  const h=harness();
  h.offer.sellerCountryId='<SAU>';
  h.api.render(h.root,'BGD');
  click(h.root,{'data-bm-find':''});
  assert.match(h.root.innerHTML,/&lt;SAU&gt;/);
  assert.doesNotMatch(h.root.innerHTML,/<SAU>/);
});

test('category navigation clears stale offers and changes the canonical product lane',()=>{
  const h=harness();
  h.api.render(h.root,'BGD');
  click(h.root,{'data-bm-find':''});
  click(h.root,{'data-bm-lane':'FACTORY_PRODUCT'});
  assert.match(h.root.innerHTML,/FACTORY PRODUCTS/);
  assert.match(h.root.innerHTML,/Steel Plate/);
  assert.doesNotMatch(h.root.innerHTML,/data-bm-buy=/);
  assert.equal(h.root.__omegaBmOffers.length,0);
});

test('buy action delegates to original createDeal API and clears stale seller quotes',()=>{
  const h=harness();
  h.api.render(h.root,'BGD');
  click(h.root,{'data-bm-find':''});
  click(h.root,{'data-bm-buy':'OFFER-1','data-bm-seller':'SAU','data-bm-resource':'iron_ore'});
  assert.equal(h.calls.deals.length,1);
  assert.equal(JSON.stringify(h.calls.deals[0]),JSON.stringify({
    buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'iron_ore',offerId:'OFFER-1',quantity:4
  }));
  assert.match(h.root.innerHTML,/Trade request recorded/);
  assert.doesNotMatch(h.root.innerHTML,/data-bm-buy=/);
});

test('seller scan yields between country batches and category switching cancels pending work',()=>{
  const h=harness(),api=h.context.OmegaBlackMarket;
  api.beginOfferScan=(country,resourceId,quantity)=>({status:'READY',buyerCountryId:country,resourceId,quantity,
    cursor:0,offers:[],total:2});
  api.getOfferScanBatch=(scan,size)=>{
    h.calls.batches.push(size);
    scan.cursor++;
    if(scan.cursor===1){scan.offers.push({...h.offer,sellerCountryId:'SAU'});return{status:'READY',scanned:1,total:2,done:false};}
    return{status:'READY',scanned:2,total:2,done:true};
  };
  api.finishOfferScan=scan=>({status:'READY',offers:scan.offers.slice()});
  h.api.render(h.root,'BGD');
  click(h.root,{'data-bm-find':''});
  assert.equal(h.root.__omegaBmScanning,true);
  assert.equal(h.calls.batches.length,0,'the first batch runs after the browser gets control');
  assert.match(h.root.innerHTML,/SCANNING/);
  flushTimers(h.calls);
  assert.equal(h.root.__omegaBmScanning,false);
  assert.deepEqual(h.calls.batches,[16,16]);
  assert.match(h.root.innerHTML,/Saudi Arabia/);

  click(h.root,{'data-bm-find':''});
  assert.equal(h.calls.timers.length,1);
  click(h.root,{'data-bm-lane':'FACTORY_PRODUCT'});
  assert.equal(h.root.__omegaBmScanning,false);
  flushTimers(h.calls);
  assert.doesNotMatch(h.root.innerHTML,/data-bm-buy=/);
  assert.match(h.root.innerHTML,/Steel Plate/);
});

test('broker counteroffer workflow remains available inside the seller details row',()=>{
  const h=harness();
  h.api.render(h.root,'BGD');
  click(h.root,{'data-bm-find':''});
  click(h.root,{'data-bm-negotiate':'OFFER-1','data-bm-seller':'SAU','data-bm-resource':'iron_ore'});
  assert.match(h.root.innerHTML,/counter price/);
  click(h.root,{'data-bm-accept-counter':'NEG-1'});
  assert.match(h.root.innerHTML,/Counter offer accepted/);
});

test('high-confidence intelligence keeps state-actor motives, export shock and private company evidence',()=>{
  const h=harness();
  h.networkReports.push({
    level:'HIGH',resourceId:'copper',productName:'Copper',summary:'A transaction-linked covert network was identified.',
    buyerCountryId:'IRN',sellerCountryId:'RUS',
    governmentInvolvement:'BOTH_GOVERNMENTS_OR_STATE_LINKED_ENTITIES',confidence:.9,
    otherCountriesKnow:'NOT_OBSERVED_BY_OTHER_COUNTRIES',
    actorProfile:{
      buyerGovernmentLabel:'State-linked trading network',sellerGovernmentLabel:'State-directed trade channel',
      buyerReason:'Observed industrial input demand exceeds available supply.',
      sellerReason:'An active state supply directive is recorded for this commodity.',
      tactic:'STATE_TO_STATE_COVERT_PROCUREMENT',potentialIntermediaryCountryIds:['SAU'],
      sellerExportShock:{active:true,mainCustomerCountryId:'IRN',exportShare:.42,sanctionTargetCountryId:'IRN',
        sanctionTargetType:'SANCTIONED_EXPORT_CUSTOMER',exportValue:420,sanctioningCountryIds:['USA'],secondarySanctionsRisk:true},
      tariffAvoidance:{importTariffPct:30,importDependency:.65},
      buyerCommercialActor:{actorType:'PRIVATE_COMPANY',companyName:'Bangla Industrial Imports'},
      sellerCommercialActor:{actorType:'STATE_OWNED_COMPANY',companyName:'Russian State Trading Group'},
      buyerCompanies:[{companyId:'BD-PRIVATE-1',name:'Bangla Industrial Imports',ownership:'PRIVATE',exportShare:.2}],
      sellerCompanies:[{companyId:'RU-STATE-1',name:'Russian State Trading Group',ownership:'STATE_OWNED'}]
    }
  });
  h.api.render(h.root,'BGD');
  assert.match(h.root.innerHTML,/🇮🇷 Iran/);
  assert.match(h.root.innerHTML,/🇷🇺 Russia/);
  assert.match(h.root.innerHTML,/State-linked trading network/);
  assert.match(h.root.innerHTML,/State-directed trade channel/);
  assert.match(h.root.innerHTML,/Major export-customer shock/);
  assert.match(h.root.innerHTML,/42% of seller’s recorded Copper exports at risk/);
  assert.match(h.root.innerHTML,/Secondary sanctions: Yes/);
  assert.match(h.root.innerHTML,/Sanction target: 🇮🇷 Iran/);
  assert.match(h.root.innerHTML,/Buyer import tariff: 30%/);
  assert.match(h.root.innerHTML,/Diplomatic relation impact: 🇧🇩 Bangladesh -8 · 🇸🇦 Saudi Arabia -3/);
  assert.match(h.root.innerHTML,/Sanction issuers: 🇺🇸 United States/);
  assert.match(h.root.innerHTML,/Bangla Industrial Imports/);
  assert.match(h.root.innerHTML,/Russian State Trading Group/);
  assert.match(h.root.innerHTML,/Other countries: Not Observed By Other Countries/);
  assert.doesNotMatch(h.root.innerHTML,/undefined/);
});

test('mobile country tables switch from wide desktop tables to readable stacked cards',()=>{
  assert.match(source,/omega-bm-seller-table/);
  assert.match(source,/omega-bm-buyer-table/);
  assert.match(source,/omega-bm-local-deal-table/);
  assert.ok((source.match(/data-label=/g)||[]).length>=15,
    'seller, buyer and local deal rows must expose labels for compact mobile rendering');
  assert.match(source,/@media\\(max-width:520px\\)\\{[^}]*omega-bm-board-table\\{display:block;min-width:0!important;width:100%/);
  assert.match(source,/omega-bm-board-table tbody tr:not\\(\\.omega-bm-detail-row\\)\\{display:grid;grid-template-columns:repeat\\(2,minmax\\(0,1fr\\)\\)/);
  assert.match(source,/omega-bm-board-table tbody tr\\.omega-bm-detail-row/);
  assert.match(source,/omega-bm-board-table \\.omega-bm-row-action button\\{width:100%/);
});
