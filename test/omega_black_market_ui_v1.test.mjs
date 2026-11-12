import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../omega_black_market_ui_v1.js', import.meta.url), 'utf8');

function harness() {
  const calls = { offers: [], begins: [], batches: [], deals: [], timers: [] };
  const offer = {
    offerId: 'OFFER-1', sellerCountryId: 'SAU', resourceId: 'iron_ore', productName: 'Iron Ore',
    productType: 'RAW_RESOURCE', availableQuantity: 800, requestedQuantity: 40, unit: 'tonnes',
    unitPrice: 125, currency: 'USD', buyerCurrency: 'USD', expectedBlackMarketTotalBuyer: 5600,
    legalLandedUnitPrice: null, expectedSavings: null, legalMarketAvailable: false, embargoed: true,
    sanctionsAtQuote: true, secondarySanctionsAtQuote: true,
    sanctioningCountryIds: ['USA'], sanctionPolicyIds: ['SAN-USA-BGD-IRON-01'],
    foreignPolicyBasis: ['IMPORT EMBARGO', 'EXPORT RESTRICTION', 'SECONDARY SANCTIONS'],
    whyUse: 'ACCESS DESPITE LEGAL OR DIPLOMATIC RESTRICTIONS',
    buyerMotiveCode: 'INDUSTRIAL_INPUT_SHORTAGE',
    buyerMotiveReason: 'Recorded factory input demand exceeds fulfilled domestic supply.',
    sellerMotiveCode: 'STATE_DIRECTED_EXPORT_REVENUE',
    sellerMotiveReason: 'A state supply directive makes export revenue through an intermediary attractive.',
    sellerActorClass: 'STATE_LINKED',
    shipmentSizeBand: 'LARGE', sellerStockExposurePct: 8, repeatAttempts10Turns: 3,
    attemptFineRate: 0.12, fineRate: 0.28, seizureRate: 0.36,
    scrutinyThresholds: { sellerFreeStockQuantity: [8, 24, 64, 120] },
    detectionProbability: 0.12, lateDetectionProbability: 0.08,
    expectedFineCostBuyer: 15, expectedSeizedQuantity: 0.8, expectedDeliveredQuantity: 39.2,
    pricingBreakdown: { tariffDiscountPct: 30, riskPremiumPct: 12, policyPremiumPct: 8,
      scarcityPremiumPct: 5, brokerSpreadPct: 3 }
  };
  const secondOffer = { ...offer, offerId:'OFFER-2', sellerCountryId:'RUS', unitPrice:131, brokerType:'PRIVATE_BROKER',
    sellerActorClass:'PRIVATE_BROKER', shipmentSizeBand:'SMALL', sellerStockExposurePct:2 };
  const reports = [
    { reportId:'INTEL-ACCEPTED', dealId:'NPC-DEAL-1', resourceId:'iron_ore', productName:'Iron Ore',
      buyerCountryId:'IRN', sellerCountryId:'RUS', level:'HIGH', confidence:.91,
      governmentInvolvement:'BOTH_GOVERNMENTS_OR_STATE_LINKED_ENTITIES',
      otherCountriesKnow:'NOT_OBSERVED_BY_OTHER_COUNTRIES',
      summary:'A covert shipment and accepting buyer were identified.' },
    { reportId:'INTEL-LEAD-1', resourceId:'iron_ore', productName:'Iron Ore',
      buyerCountryId:'USA', sellerCountryId:'SAU', level:'MEDIUM', confidence:.66,
      otherCountriesKnow:'NOT_OBSERVED_BY_OTHER_COUNTRIES',
      summary:'Potential buyer and seller identified; final acceptance is not established.' }
  ];
  const worldState = {
    simulation: { turn:8, session:{ playerCountryId:'BGD' } },
    resource: {
      BGD:{},
      USA:{ demandRuntime:{ lastTurn:8, byResource:{ iron_ore:{
        unmetDemand:120, demandPerDay:40, stockCoverageDays:1, stockCoverageTargetDays:5,
        procurementScore:.8, activeFactoryInputDemandPerDay:25, status:'SHORTAGE'
      }}}},
      IRN:{ demandRuntime:{ lastTurn:8, byResource:{ iron_ore:{
        unmetDemand:35, demandPerDay:18, stockCoverageDays:2, stockCoverageTargetDays:4,
        procurementScore:.55, status:'SHORTAGE'
      }}}}
    },
    trade:{ BGD:{ blackMarketDeals:[
      { dealId:'LOCAL-DEAL-1', buyerCountryId:'BGD', sellerCountryId:'SAU', resourceId:'iron_ore',
        productName:'Iron Ore', quantity:10, unit:'tonnes', unitPrice:100, currency:'USD',
        status:'SENT', createdTurn:7 }
    ]}}
  };
  const identities = {
    BGD:{ raw:{ iso2:'BD', iso3:'BGD', name:'Bangladesh' }},
    USA:{ raw:{ iso2:'US', iso3:'USA', name:'United States' }},
    IRN:{ raw:{ iso2:'IR', iso3:'IRN', name:'Iran' }},
    RUS:{ raw:{ iso2:'RU', iso3:'RUS', name:'Russia' }},
    SAU:{ raw:{ iso2:'SA', iso3:'SAU', name:'Saudi Arabia' }}
  };
  const api = {
    getDeals(country) { assert.equal(country,'BGD'); return worldState.trade.BGD.blackMarketDeals; },
    getDeal(dealId,country) {
      if(dealId==='NPC-DEAL-1'&&country==='IRN')return {
        dealId:'NPC-DEAL-1',buyerCountryId:'IRN',sellerCountryId:'RUS',resourceId:'iron_ore',
        productName:'Iron Ore',quantity:30,unit:'tonnes',unitPrice:118,currency:'USD',
        status:'ACCEPTED',createdTurn:8,autonomousNetwork:true
      };
      return null;
    },
    getCases(country) {
      assert.equal(country,'BGD');
      return [{ status:'OPEN',severity:'CRITICAL',resourceId:'iron_ore',buyerCountryId:'BGD',sellerCountryId:'SAU',
        evidenceConfidence:.9,detectionTurn:8,detectionStage:'ORIGIN_INSPECTION',shipmentSizeBand:'LARGE',
        sellerStockExposurePct:8,sellerFreeStockQuantityThresholds:[8,24,64,120],
        sanctioningCountryIds:['USA'],sanctionPolicyIds:['SAN-USA-BGD-IRON-01'] }];
    },
    getResponses(country) {
      assert.equal(country,'BGD');
      return [{ responseType:'SANCTIONS_ENFORCEMENT_AND_ENHANCED_INSPECTION',
        targetCountryId:'BGD',sourceCountryId:'USA',severity:'HIGH',
        appliedRelationAdjustments:[{countryId:'BGD',delta:-8},{countryId:'SAU',delta:-3}] }];
    },
    getNetworkReports(country) { assert.equal(country,'BGD'); return reports; },
    getTransits() { return []; },
    getOffers(country,resourceId,quantity) {
      calls.offers.push({country,resourceId,quantity});
      return {status:'READY',offers:[offer,secondOffer]};
    },
    beginOfferScan(country,resourceId,quantity) {
      calls.begins.push({country,resourceId,quantity});
      return {status:'READY',buyerCountryId:country,resourceId,quantity,cursor:0,
        sellerCountryIds:['SAU','RUS'],offers:[],total:2};
    },
    getOfferScanBatch(scan,size) {
      calls.batches.push(size);
      const index=scan.cursor++;
      if(index===0)scan.offers.push(offer);
      else scan.offers.push(secondOffer);
      return {status:'READY',scanned:scan.cursor,total:2,done:scan.cursor>=2,offers:[scan.offers[index]]};
    },
    finishOfferScan(scan) { return {status:'READY',offers:scan.offers.slice()}; },
    createDeal(payload) { calls.deals.push(payload); return {accepted:true,deal:{dealId:'LOCAL-DEAL-2',status:'SENT'}}; },
    negotiateOffer(input) { return {accepted:true,decision:'COUNTERED',negotiation:{
      offerId:input.offerId,negotiationId:'NEG-1',status:'COUNTERED',counterUnitPrice:120,currency:'USD'
    }}; },
    acceptCounterOffer(country,negotiationId) { return {accepted:true,negotiation:{
      offerId:'OFFER-1',negotiationId,status:'ACCEPTED',agreedUnitPrice:120
    }}; }
  };
  const root = {
    innerHTML:'',listeners:Object.create(null),findQuantity:{value:'40'},quantityField:{value:'40',
      getAttribute(name){return name==='data-bm-quantity'?'OFFER-1':null;}},
    bidField:{value:'125',getAttribute(name){return name==='data-bm-bid'?'OFFER-1':null;}},
    progressNode:{textContent:''},productList:{innerHTML:''},
    addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);},
    contains(){return true;},
    querySelector(selector){
      if(selector==='[data-bm-resource]')return this.resourceSelect;
      if(selector==='[data-bm-find-quantity]')return this.findQuantity;
      if(selector==='[data-bm-scan-progress]')return this.progressNode;
      if(selector==='.omega-bm-product-list')return this.productList;
      return null;
    },
    resourceSelect:{value:'iron_ore'},
    querySelectorAll(){return [this.quantityField,this.bidField];}
  };
  const context = {
    Game:{state:worldState}, OmegaBlackMarket:api,
    OmegaGlobalMarket:{productCatalog(){return[
      {id:'iron_ore',name:'Iron Ore',productType:'RAW_RESOURCE',unit:'tonnes'},
      {id:'steel_plate',name:'Steel Plate',productType:'FACTORY_PRODUCT',unit:'tonnes'},
      {id:'processed_food',name:'Processed Food',productType:'FOOD_PRODUCT',unit:'tonnes'}
    ];}},
    OmegaCanonicalIdentityRegistry:{resolveCountry(value){return identities[String(value||'').toUpperCase()]||null;}},
    setTimeout(fn){calls.timers.push(fn);return calls.timers.length;},
    Intl,Number,String,Array,Math,Object,Set,Date,console
  };
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'omega_black_market_ui_v1.js'});
  return {api:context.OmegaBlackMarketUI,root,calls,context,offer,secondOffer,reports,worldState};
}
function click(root,attributes){
 const target={closest(){return this;},hasAttribute(name){return Object.prototype.hasOwnProperty.call(attributes,name);},
  getAttribute(name){return attributes[name]??null;}};
 const listeners=root.listeners.click||[];for(const listener of listeners)listener({target,preventDefault(){}});
}
function input(root,attributes,value){
 const target={value,hasAttribute(name){return Object.prototype.hasOwnProperty.call(attributes,name);}};
 for(const listener of root.listeners.input||[])listener({target});
}
function flushTimers(calls){
 let guard=30;while(calls.timers.length&&guard-- >0)calls.timers.shift()();
 assert.ok(guard>0,'progressive seller scan must finish without an endless callback loop');
}

test('bright market board renders visible country flags and three commodity lanes',()=>{
 const h=harness(),result=h.api.render(h.root,'BGD');
 assert.equal(result.ok,true);assert.equal(result.countryId,'BGD');
 assert.match(h.root.innerHTML,/Black Market Network/);
 assert.match(h.root.innerHTML,/RAW RESOURCES/);assert.match(h.root.innerHTML,/FACTORY PRODUCTS/);assert.match(h.root.innerHTML,/FOOD PRODUCTS/);
 assert.match(h.root.innerHTML,/🇧🇩/);assert.match(h.root.innerHTML,/Bangladesh/);
 assert.match(h.root.innerHTML,/assets\/omega-global-market\/market-header\.svg/);
 assert.match(h.root.innerHTML,/assets\/omega-global-market\/raw-mining\.svg/);
 assert.match(h.root.innerHTML,/Seller country/);assert.match(h.root.innerHTML,/Commodity board/);
 assert.doesNotMatch(h.root.innerHTML,/undefined/);
});

test('buyer shortage countries are displayed as potential buyers with flags, not accepted orders',()=>{
 const h=harness();h.api.render(h.root,'BGD');
 assert.match(h.root.innerHTML,/United States/);assert.match(h.root.innerHTML,/🇺🇸/);
 assert.match(h.root.innerHTML,/Iran/);assert.match(h.root.innerHTML,/🇮🇷/);
 assert.match(h.root.innerHTML,/POTENTIAL BUYER/);
 assert.match(h.root.innerHTML,/demand gap or stock coverage below its target/i);
 assert.doesNotMatch(h.root.innerHTML,/United States.{0,120}OFFER ACCEPTED/);
});

test('player intelligence shows identified counterparties while keeping unconfirmed reports as intelligence leads',()=>{
 const h=harness();h.api.render(h.root,'BGD');
 assert.match(h.root.innerHTML,/Iran/);assert.match(h.root.innerHTML,/🇮🇷/);
 assert.match(h.root.innerHTML,/Russia/);assert.match(h.root.innerHTML,/🇷🇺/);
 assert.match(h.root.innerHTML,/OFFER ACCEPTED/);
 assert.match(h.root.innerHTML,/INTELLIGENCE LEAD/);
 assert.match(h.root.innerHTML,/Other countries: Not Observed By Other Countries/);
 assert.match(h.root.innerHTML,/Accepted offers<\/small><strong>1/);
});

test('opening the page does not scan the market; seller country scans yield between verified 16-country batches',()=>{
 const h=harness();h.api.render(h.root,'BGD');
 assert.equal(h.calls.begins.length,0);assert.equal(h.calls.offers.length,0);
 click(h.root,{'data-bm-find':''});
 assert.equal(h.calls.begins.length,1);
 assert.equal(h.calls.batches.length,0,'the first batch must yield before executing');
 assert.equal(h.root.__omegaBmScanning,true);
 assert.match(h.root.innerHTML,/SCAN SELLER NETWORK|SCANNING/);
 flushTimers(h.calls);
 assert.deepEqual(h.calls.batches,[16,16]);
 assert.equal(h.root.__omegaBmScanning,false);
 assert.match(h.root.innerHTML,/Saudi Arabia/);assert.match(h.root.innerHTML,/🇸🇦/);
 assert.match(h.root.innerHTML,/125\.00/);
 assert.match(h.root.innerHTML,/Why Saudi Arabia sells/);
 assert.match(h.root.innerHTML,/Secondary sanctions/);
 assert.match(h.root.innerHTML,/Seller free stock exposed/);
 assert.match(h.root.innerHTML,/NEGOTIATE PRICE/);
 assert.doesNotMatch(h.root.innerHTML,/undefined/);
});

test('changing category or commodity cancels a pending country scan and clears previous offers',()=>{
 const h=harness();h.api.render(h.root,'BGD');
 click(h.root,{'data-bm-find':''});assert.equal(h.calls.timers.length,1);
 click(h.root,{'data-bm-lane':'FACTORY_PRODUCT'});
 assert.equal(h.root.__omegaBmScanning,false);
 flushTimers(h.calls);
 assert.match(h.root.innerHTML,/Steel Plate/);assert.doesNotMatch(h.root.innerHTML,/data-bm-buy=/);
 h.root.resourceSelect.value='iron_ore';
 click(h.root,{'data-bm-find':''});
 assert.equal(h.root.__omegaBmScanning,true);
 click(h.root,{'data-bm-product':'steel_plate'});
 assert.equal(h.root.__omegaBmScanning,false);
 assert.equal(h.root.resourceSelect.value,'steel_plate');
});

test('deal action calls the authoritative createDeal once and avoids a synchronous world refresh',()=>{
 const h=harness();h.api.render(h.root,'BGD');
 click(h.root,{'data-bm-find':''});flushTimers(h.calls);
 click(h.root,{'data-bm-buy':'OFFER-1','data-bm-seller':'SAU','data-bm-resource':'iron_ore'});
 assert.equal(h.calls.deals.length,1);
 assert.deepEqual(h.calls.deals[0],{buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'iron_ore',
  offerId:'OFFER-1',quantity:40});
 assert.equal(h.calls.offers.length,0,'placing a deal must not immediately run a second full seller scan');
 assert.match(h.root.innerHTML,/Trade request recorded/);
});

test('country flags, sanctions, export actor and shipment-risk detail remain readable and escaped',()=>{
 const h=harness();h.offer.sellerCountryId='<SAU>';
 h.api.render(h.root,'BGD');click(h.root,{'data-bm-find':''});flushTimers(h.calls);
 assert.match(h.root.innerHTML,/&lt;SAU&gt;/);assert.doesNotMatch(h.root.innerHTML,/<SAU>/);
 assert.match(h.root.innerHTML,/IMPORT EMBARGO|RESTRICTED CHANNEL/);
 assert.match(h.root.innerHTML,/SHIPMENT/);
 assert.match(h.root.innerHTML,/SANCTIONS/);
 assert.doesNotMatch(h.root.innerHTML,/undefined/);
});

test('seller pagination, buyer pagination and product search change only their displayed lists',()=>{
 const h=harness();h.offerRows=[];
 h.api.render(h.root,'BGD');
 input(h.root,{'data-bm-product-search':''},'steel');
 assert.match(h.root.productList.innerHTML,/Steel Plate/);
 assert.doesNotMatch(h.root.productList.innerHTML,/Iron Ore/);
 h.root.__omegaBmVisibleBuyers=1;
 h.api.render(h.root,'BGD');
 assert.match(h.root.innerHTML,/SHOW MORE COUNTRIES/);
 click(h.root,{'data-bm-show-more-buyers':''});
 assert.equal(h.root.__omegaBmVisibleBuyers,8);
});

test('broker negotiation and counter acceptance continue to use the existing handlers',()=>{
 const h=harness();h.api.render(h.root,'BGD');
 click(h.root,{'data-bm-find':''});flushTimers(h.calls);
 click(h.root,{'data-bm-negotiate':'OFFER-1','data-bm-seller':'SAU','data-bm-resource':'iron_ore'});
 assert.match(h.root.innerHTML,/Negotiation COUNTERED/);
 click(h.root,{'data-bm-accept-counter':'NEG-1'});
 assert.match(h.root.innerHTML,/ACCEPTED/);
});
