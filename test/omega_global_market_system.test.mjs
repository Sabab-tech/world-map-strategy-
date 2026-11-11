import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.Game={state:{
  simulation:{turn:1},
  finance:{BDG:{currencyCode:'USD'},SAU:{currencyCode:'USD'}},
  economy:{BDG:{currency_code:'USD',exchange_rate_usd:1},SAU:{currency_code:'USD',exchange_rate_usd:1}},
  resource:{BDG:{inventory:{crude_oil:0,steel:0},production:{crude_oil:0,steel:0},consumption:{crude_oil:0,steel:0}},
            SAU:{inventory:{crude_oil:5000,steel:100},production:{crude_oil:0,steel:0},consumption:{crude_oil:0,steel:0},
              processedWarehouse:{availableByResource:{steel:100},reservedByResource:{steel:10}}}},
  trade:{
    BDG:{importRequests:[
      {requestId:'BID-1',resourceId:'crude_oil',quantity:100,unitPrice:110,status:'SENT'},
      {requestId:'STEEL-BID-1',resourceId:'steel',quantity:30,unitPrice:120,status:'SENT'}
    ]},
    SAU:{offerBook:{
      crude_oil:{offerId:'ASK-1',resourceId:'crude_oil',quantity:100,unitPrice:90},
      steel:{offerId:'STEEL-ASK-1',resourceId:'steel',quantity:100,unitPrice:95,unit:'SIMULATION_RESOURCE_UNIT'}
    }}
  },
  foreign:{BDG:{relations:{SAU:{trade_agreement:true}}},SAU:{relations:{BDG:{trade_agreement:true}}}}
}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=String(type);this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){const t=new EventTarget();globalThis.dispatchEvent=t.dispatchEvent.bind(t);globalThis.addEventListener=t.addEventListener.bind(t);}

await import('../omega_universal_entity_identity_engine.js');
await import('../omega_country_semantic_bridge.js');
const identity=globalThis.OmegaCanonicalIdentityRegistry||globalThis.OmegaCountrySemanticBridge;
await identity.init();
await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');
// Production boot loads the authoritative resource catalog before market discovery.
// This Node test supplies only the same checked-in JSON files, not invented prices.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async function resourceCatalogTestFetch(input,init){
  const raw=String(typeof input==='string'?input:input?.url||input);
  const file=raw.split('?')[0];
  if(file==='resources.json'||file==='resources_2.json'){
    const data=JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
    return {ok:true,status:200,json:async()=>data};
  }
  if(typeof nativeFetch==='function')return nativeFetch(input,init);
  throw new Error('UNSUPPORTED_TEST_FETCH:'+file);
};
await import('../resource_ministry_engine.js');
await globalThis.ResourceMinistryEngine?._initializationPromise;
globalThis.fetch=nativeFetch;
assert.equal(globalThis.ResourceMinistryEngine?.isReady,true,JSON.stringify(globalThis.ResourceMinistryEngine?.getDataLoadReport?.()));
globalThis.OmegaResourceIndustrialCatalogData=JSON.parse(fs.readFileSync(new URL('../resource_industrial_catalog_v1.json',import.meta.url),'utf8'));
globalThis.OmegaResourceStrategicPolicyRules=JSON.parse(fs.readFileSync(new URL('../resource_strategic_policy_rules_v1.json',import.meta.url),'utf8'));
await import('../omega_resource_strategic_policy_runtime_v1.js');
await import('../omega_global_market_system.js');
const policy=globalThis.Omega?.ResourceStrategicPolicyRuntime||globalThis.OmegaResourceStrategicPolicyRuntime;
const policyDiagnostics=policy.diagnostics();
assert.equal(policyDiagnostics.handlersReady,true,JSON.stringify(policyDiagnostics));
assert.equal(policyDiagnostics.handlerErrors.length,0,JSON.stringify(policyDiagnostics.handlerErrors));
const embargo=policy.declareEmbargo('BDG',{targetCountryId:'SAU',resourceId:'crude_oil',direction:'IMPORT',policyId:'MARKET-EMBARGO-TEST'});
assert.equal(embargo.accepted,true,JSON.stringify(embargo));
const market=globalThis.OmegaGlobalMarket;
const blockedBooks=market.rebuild();
assert.equal(blockedBooks.crude_oil.clearing.status,'NO_CROSS');
assert.equal(blockedBooks.crude_oil.clearing.matchedQuantity,0);
assert.equal(market.suppliers('crude_oil',1,'BDG').some(x=>x.countryId==='SAU'),false,'an embargoed seller must not appear in eligible suppliers');
assert.equal(policy.liftEmbargo('BDG',{policyId:'MARKET-EMBARGO-TEST'}).accepted,true);
const blockade=policy.declareBlockade('BDG',{targetCountryId:'SAU',resourceId:'crude_oil',modes:['ship'],policyId:'MARKET-BLOCKADE-TEST'});
assert.equal(blockade.accepted,true,JSON.stringify(blockade));
const blockedByNavalBlockade=market.rebuild();
assert.equal(blockedByNavalBlockade.crude_oil.clearing.matchedQuantity,0);
assert.equal(blockedByNavalBlockade.crude_oil.clearing.blockedTradePairs.some(x=>x.reason==='RESOURCE_ROUTE_BLOCKADE_ACTIVE'),true);
assert.equal(market.suppliers('crude_oil',1,'BDG').some(x=>x.countryId==='SAU'),false,'a blockaded seller must not appear in eligible suppliers');
assert.equal(policy.liftBlockade('BDG',{policyId:'MARKET-BLOCKADE-TEST'}).accepted,true);
const domesticOnly=policy.setSupplyDirective('SAU',{directive:'DOMESTIC_ONLY',resourceId:'crude_oil',
  policyId:'MARKET-DOMESTIC-ONLY-TEST',reason:'Domestic supply shortage'});
assert.equal(domesticOnly.accepted,true,JSON.stringify(domesticOnly));
const stateRestrictedBooks=market.rebuild();
assert.equal(stateRestrictedBooks.crude_oil.clearing.matchedQuantity,0,
  'state domestic-only instruction must prevent an otherwise price-eligible cross-border market match');
assert.equal(stateRestrictedBooks.crude_oil.clearing.blockedTradePairs.some(x=>
  x.reason==='STATE_DIRECTIVE_DOMESTIC_ONLY'),true);
assert.equal(market.suppliers('crude_oil',1,'BDG').some(x=>x.countryId==='SAU'),false,
  'state-restricted exports must not appear in the eligible supplier list');
assert.equal(policy.liftSupplyDirective('SAU',{policyId:'MARKET-DOMESTIC-ONLY-TEST'}).accepted,true);
const books=market.rebuild();
assert(books.crude_oil);
const q=market.quote('crude_oil');
assert.equal(q.status,'CLEARED');
assert.equal(q.matchedQuantity,100);
assert.equal(q.clearingPriceUsd,100);
assert.equal(market.localPrice('BDG','crude_oil'),100);
assert.equal(books.crude_oil.clearing.productType,'RAW_RESOURCE');
const steelBook=books.steel;
assert.ok(steelBook,'factory output commodity must have its own market book');
assert.equal(steelBook.clearing.productType,'FACTORY_PRODUCT');
assert.equal(steelBook.clearing.productRole,'PRIMARY_OUTPUT');
assert.equal(steelBook.clearing.status,'CLEARED');
assert.equal(steelBook.clearing.matchedQuantity,30);
assert.equal(steelBook.clearing.settlementAuthority,'PRICE_DISCOVERY_ONLY');
assert.equal(steelBook.orders.asks.find(row=>!row.referenceOnly)?.productType,'FACTORY_PRODUCT');
assert.equal(market.describeProduct('crude_oil').productType,'RAW_RESOURCE');
assert.equal(market.describeProduct('steel').productType,'FACTORY_PRODUCT');
assert.equal(market.describeProduct('steel').productRole,'PRIMARY_OUTPUT');
assert.ok(market.productCatalog().some(row=>row.productType==='FACTORY_PRODUCT'&&row.id==='STEEL'),
  'the canonical factory recipe output catalog must expose factory products without adding new resource IDs');
const lanes=market.marketLanes();
assert.ok(lanes.rawResources.some(row=>row.id==='crude_oil'));
assert.ok(lanes.factoryProducts.some(row=>row.id==='STEEL'));
assert.equal(lanes.summary.activeFactoryProductCount,lanes.factoryProducts.length);

// Private company supply must be attributed to exact owner batches and available warehouse stock.
globalThis.OmegaPrivateEnterpriseLifecycleV1={
  companyIds:['AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP'],
  companyNames:{AURORA_INDUSTRIAL_GROUP:'Aurora Industrial Group',
    MERIDIAN_ENGINEERING_GROUP:'Meridian Engineering Group'}
};
globalThis.Game.state.resource.SAU.batches=[{
  batchId:'SAU-PRIVATE-CRUDE-MARKET-1',resourceId:'crude_oil',quantity:150,remainingQuantity:150,
  stage:'RAW_EXTRACTED',status:'AVAILABLE',ownerCompanyId:'AURORA_INDUSTRIAL_GROUP',
  operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',
  sourceFactoryId:'SAU-PRIVATE-OIL-FAC-1'
},{
  batchId:'SAU-UNKNOWN-CRUDE-MARKET-1',resourceId:'crude_oil',quantity:900,remainingQuantity:900,
  stage:'RAW_EXTRACTED',status:'AVAILABLE',ownerCompanyId:'MERIDIAN_ENGINEERING_GROUP',
  operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',ownerAttributionStatus:'UNKNOWN_SOURCE',
  sourceFactoryId:'SAU-UNKNOWN-OIL-FAC'
}];
globalThis.Game.state.resource.SAU.inventoryLots={
  'SAU-PRIVATE-CRUDE-MARKET-1':{batchId:'SAU-PRIVATE-CRUDE-MARKET-1',resourceId:'crude_oil',
    quantity:150,remainingQuantity:150,status:'AVAILABLE'},
  'SAU-UNKNOWN-CRUDE-MARKET-1':{batchId:'SAU-UNKNOWN-CRUDE-MARKET-1',resourceId:'crude_oil',
    quantity:900,remainingQuantity:900,status:'AVAILABLE'}
};
globalThis.Game.state.resource.SAU.warehouse={
  availableByResource:{crude_oil:150},reservedByResource:{crude_oil:10}
};
globalThis.Game.state.resource.SAU.processedWarehouse={availableByResource:{},reservedByResource:{}};
globalThis.Game.state.economy.SAU={
  privateEnterpriseLifecycle:{companyStatuses:{AURORA_INDUSTRIAL_GROUP:'ACTIVE',
    MERIDIAN_ENGINEERING_GROUP:'ACTIVE'}}
};
const exactPrivateSupplier=market.privateCompanySuppliers('crude_oil',100,'BDG',
  'AURORA_INDUSTRIAL_GROUP','SAU');
assert.equal(exactPrivateSupplier.length,1);
assert.equal(exactPrivateSupplier[0].companyId,'AURORA_INDUSTRIAL_GROUP');
assert.equal(exactPrivateSupplier[0].available,140,'reserved warehouse stock must not be offerable');
assert.deepEqual(exactPrivateSupplier[0].sourceBatchIds,['SAU-PRIVATE-CRUDE-MARKET-1']);
assert.deepEqual(exactPrivateSupplier[0].sourceFactoryIds,['SAU-PRIVATE-OIL-FAC-1']);
assert.equal(market.privateCompanySuppliers('crude_oil',145,'BDG','AURORA_INDUSTRIAL_GROUP','SAU').length,0,
  'a private supplier cannot offer more than its verified available quantity');
globalThis.Game.state.resource.SAU.industrialNetwork={shipments:[{
  shipmentId:'IN-TRANSIT-PRIVATE-1',batchId:'SAU-PRIVATE-CRUDE-MARKET-1',
  resourceId:'crude_oil',quantity:20,status:'IN_TRANSIT'
}]};
assert.equal(market.privateCompanySuppliers('crude_oil',131,'BDG','AURORA_INDUSTRIAL_GROUP','SAU').length,0,
  'stock already in transit cannot be promised again');
globalThis.Game.state.resource.SAU.industrialNetwork.shipments=[];
globalThis.Game.state.economy.SAU.privateEnterpriseLifecycle.companyStatuses.AURORA_INDUSTRIAL_GROUP='CLOSED';
assert.equal(market.privateCompanySuppliers('crude_oil',1,'BDG','AURORA_INDUSTRIAL_GROUP','SAU').length,0,
  'closed companies cannot publish supplier stock');
globalThis.Game.state.economy.SAU.privateEnterpriseLifecycle.companyStatuses.AURORA_INDUSTRIAL_GROUP='ACTIVE';
// Multiple private owners share one aggregate warehouse ceiling; the same free stock
// cannot be advertised independently by each company.
globalThis.Game.state.resource.SAU.batches.push({
  batchId:'SAU-MERIDIAN-CRUDE-MARKET-2',resourceId:'crude_oil',
  quantity:100,remainingQuantity:100,stage:'RAW_EXTRACTED',status:'AVAILABLE',
  ownerCompanyId:'MERIDIAN_ENGINEERING_GROUP',operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
  ownerAttributionStatus:'EXPLICIT_ASSET_OWNER',sourceFactoryId:'SAU-MERIDIAN-OIL-FAC-2'
});
globalThis.Game.state.resource.SAU.inventoryLots['SAU-MERIDIAN-CRUDE-MARKET-2']={
  batchId:'SAU-MERIDIAN-CRUDE-MARKET-2',resourceId:'crude_oil',
  quantity:100,remainingQuantity:100,status:'AVAILABLE'
};
globalThis.Game.state.resource.SAU.warehouse.availableByResource.crude_oil=150;
globalThis.Game.state.resource.SAU.warehouse.reservedByResource.crude_oil=0;
const allPrivateSuppliers=market.privateCompanySuppliers('crude_oil',1,'BDG',null,'SAU');
assert.equal(allPrivateSuppliers.length,2);
assert.equal(allPrivateSuppliers.reduce((sum,row)=>sum+Math.round(row.available*1e6),0),150000000,
  'all private suppliers together must not exceed the 150-unit warehouse free balance');
assert.equal(allPrivateSuppliers.find(row=>row.companyId==='AURORA_INDUSTRIAL_GROUP').available,90);
assert.equal(allPrivateSuppliers.find(row=>row.companyId==='MERIDIAN_ENGINEERING_GROUP').available,60);

// Removing the actual seller offer leaves only inventory-derived reference liquidity.
// It must inform the quote but must not count as an executable market trade.
globalThis.Game.state.trade.SAU.offerBook={};
const referenceOnlyBooks=market.rebuild();
const referenceOnly=referenceOnlyBooks.crude_oil.clearing;
assert(referenceOnly.microstructure.referenceAskCount>0,'inventory-derived reference liquidity should remain visible');
assert.equal(referenceOnly.matchedQuantity,0,'reference-only ask must never fill a buyer order');
assert.equal(referenceOnly.clearingPriceUsd,null,'reference-only liquidity must not publish an executed clearing price');
assert.notEqual(referenceOnly.status,'CLEARED');
assert.equal(referenceOnly.priceDiscovery,'REFERENCE_ONLY','a reference quote is not a negotiation range with an executable ask');
assert.equal(referenceOnly.bestAskUsd,null,'reference ask must not be presented as executable best ask');
assert.equal(referenceOnly.askDepth,0);
assert.equal(referenceOnly.referenceAskDepth>0,true);
assert.equal(referenceOnly.matches.some(x=>x.referenceLiquidity),false);
// Canonical Forex simulation rates are the authoritative fallback when legacy
// Finance exchange_rate_usd fields are absent. Both sides must remain executable.
// Deliberately omit per-country Finance currency snapshots. The canonical
// Forex profile registry remains the authority for both currency identity and rate.
// Remove the legacy misspelled buyer identity before this focused FX test.
// The earlier policy scenarios intentionally retain their original fixture keys.
for(const domain of ['finance','economy','resource','trade','foreign']){
  if(globalThis.Game.state[domain])delete globalThis.Game.state[domain].BDG;
}
globalThis.Game.state.finance.BGD={};
globalThis.Game.state.finance.SAU={};
globalThis.Game.state.economy.BGD={};
globalThis.Game.state.economy.SAU={};
globalThis.Game.state.trade.BGD={importRequests:[]};
globalThis.Game.state.trade.SAU=globalThis.Game.state.trade.SAU||{offerBook:[]};
globalThis.OmegaForexMonetaryEngine={
  getCountryQuotes(mode){
    assert.equal(mode,'SIMULATION');
    return[
      {countryCode:'BD',iso3:'BGD',currencyCode:'BDT',localPerUsd:77},
      {countryCode:'SA',iso3:'SAU',currencyCode:'SAR',localPerUsd:3.75}
    ];
  },
  getProfiles(){return[
    {countryCode:'BD',iso3:'BGD',currencyCode:'BDT'},
    {countryCode:'SA',iso3:'SAU',currencyCode:'SAR'}
  ];},
  getCurrencyCode(profile){return profile.currencyCode;},
  getRate(code,mode){
    assert.equal(mode,'SIMULATION');
    return ({BDT:77,SAR:3.75,USD:1})[String(code||'').toUpperCase()]??null;
  }
};
globalThis.Game.state.trade.BGD.importRequests=[{
  requestId:'FOREX-RATE-FALLBACK-BID',resourceId:'crude_oil',
  quantity:100,unitPrice:2566.666667,status:'SENT'
}];
globalThis.Game.state.trade.SAU.offerBook=[{
  offerId:'FOREX-RATE-FALLBACK-ASK',resourceId:'crude_oil',
  quantity:500,unitPrice:100,status:'ACTIVE'
}];
const forexFallbackBooks=market.rebuild();
const forexFallbackQuote=market.quote('crude_oil');
assert.equal(forexFallbackBooks.crude_oil.orders.bids[0]?.priceUsd,33.33333333766234,JSON.stringify({
  countryIds:Object.keys(globalThis.Game.state.trade),
  buyerRequests:globalThis.Game.state.trade.BGD?.importRequests,
  financeKeys:Object.keys(globalThis.Game.state.finance||{}),
  buyerFinance:globalThis.Game.state.finance?.BDG,
  forexQuotes:globalThis.OmegaForexMonetaryEngine.getCountryQuotes('SIMULATION'),
  marketOrders:forexFallbackBooks.crude_oil?.orders||null
}));
assert.equal(forexFallbackBooks.crude_oil.orders.asks.find(row=>!row.referenceOnly)?.priceUsd,100/3.75);
assert.equal(forexFallbackQuote.status,'CLEARED',JSON.stringify({forexFallbackBooks,forexFallbackQuote}));
assert.equal(forexFallbackQuote.matchedQuantity,100);
assert.equal(forexFallbackQuote.matches.some(row=>row.buyerCountryId==='BD'&&row.sellerCountryId==='SA'&&row.quantity===100),true);
delete globalThis.OmegaForexMonetaryEngine;

// Company market research is an information request, not a fabricated buy order.
// It must be accepted even when the requested resource has no current executable quote.
const requestsBefore=globalThis.Game.state.trade.BGD.importRequests.length;
const ironQuoteWithoutOrders=market.quote('iron_ore');
assert.notEqual(ironQuoteWithoutOrders.status,'CLEARED',
  'this scenario deliberately has no current executable iron-ore market clearing');
const companyResearchPayload={
  requestId:'COMPANY-RESEARCH-NO-MARKET-DATA-001',
  companyId:'AURORA_INDUSTRIAL_GROUP',
  companyName:'Aurora Industrial Group',
  factoryType:'STEEL_WORKS',
  factoryCount:1,
  outputResources:['steel'],
  inputResources:['iron_ore'],
  outputRequirements:[{
    resourceId:'steel',projectedProduction30Day:900,
    unmetDomesticDemand30Day:null,globalUnmatchedBuyOrderDepth:null,
    globalUnmatchedSellOfferDepth:null,
    domesticDemandEvidenceStatus:'UNOBSERVED',
    internationalMarketEvidenceStatus:'UNOBSERVED_OR_STALE'
  }],
  inputRequirements:[{
    resourceId:'iron_ore',requiredQuantity30Day:120,
    domesticUncommittedAvailable:20,expectedImportQuantity:100,
    matchedRawMaterialExportsFromCountry:null,
    demandEvidenceStatus:'UNOBSERVED',
    internationalMarketEvidenceStatus:'UNOBSERVED_OR_STALE',
    sourcingDecision:'DOMESTIC_PLUS_IMPORTED_INPUTS'
  }],
  plannedDailyCapacity:30,
  marketScopes:['DOMESTIC','INTERNATIONAL'],
  analysisHorizonDays:30,
  requestPurpose:'Assess demand, domestic input sourcing and international opportunity.'
};
const researchSubmission=market.requestCompanyResearch('BGD',companyResearchPayload);
assert.equal(researchSubmission.accepted,true,JSON.stringify(researchSubmission));
assert.equal(researchSubmission.request.status,'QUEUED');
assert.equal(researchSubmission.request.responseStatus,'AWAITING_MARKET_EVIDENCE');
assert.equal(researchSubmission.request.marketScopes.includes('DOMESTIC'),true);
assert.equal(researchSubmission.request.marketScopes.includes('INTERNATIONAL'),true);
assert.equal(researchSubmission.request.inputRequirements[0].requiredQuantity30Day,120);
assert.equal(researchSubmission.request.inputRequirements[0].expectedImportQuantity,100);
assert.equal(researchSubmission.request.outputRequirements[0].projectedProduction30Day,900);
assert.equal(researchSubmission.request.outputRequirements[0].unmetDomesticDemand30Day,null,
  'unknown demand must survive queue normalization without becoming zero');
assert.equal(globalThis.Game.state.trade.BGD.importRequests.length,requestsBefore,
  'research submission must not create an import trade order');
const repeatedResearchSubmission=market.requestCompanyResearch('BGD',companyResearchPayload);
assert.equal(repeatedResearchSubmission.accepted,true,JSON.stringify(repeatedResearchSubmission));
assert.equal(repeatedResearchSubmission.duplicate,true,'the same research request must be idempotent');
assert.equal(market.getCompanyResearchRequests('BGD','AURORA_INDUSTRIAL_GROUP').length,1);
assert.equal(globalThis.Game.state.trade.BGD.importRequests.length,requestsBefore);

console.log('OMEGA GLOBAL MARKET CLEARING TEST PASSED');