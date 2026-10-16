import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.Game={state:{
  simulation:{turn:1},
  finance:{BDG:{currencyCode:'USD'},SAU:{currencyCode:'USD'}},
  economy:{BDG:{currency_code:'USD',exchange_rate_usd:1},SAU:{currency_code:'USD',exchange_rate_usd:1}},
  resource:{BDG:{inventory:{crude_oil:0},production:{crude_oil:0},consumption:{crude_oil:0}},
            SAU:{inventory:{crude_oil:5000},production:{crude_oil:0},consumption:{crude_oil:0}}},
  trade:{
    BDG:{importRequests:[{requestId:'BID-1',resourceId:'crude_oil',quantity:100,unitPrice:110,status:'SENT'}]},
    SAU:{offerBook:{crude_oil:{offerId:'ASK-1',resourceId:'crude_oil',quantity:100,unitPrice:90}}}
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
globalThis.OmegaResourceStrategicPolicyRules=JSON.parse(fs.readFileSync(new URL('../resource_strategic_policy_rules_v1.json',import.meta.url),'utf8'));
await import('../omega_resource_strategic_policy_runtime_v1.js');
// This source-backed site exists in the canonical global site-binding registry, but has
// no country inventory, production row, offer, or import request yet.
globalThis.Omega=globalThis.Omega||{};
globalThis.Omega.IndividualResourceSiteBinding={sites:[
  {siteId:'SITE_GLOBAL_CATALOG_ONLY_1',countryId:'SAU',resourceId:'site_only_mineral',siteName:'Catalog-only site'}
]};
globalThis.OmegaResourceSiteCanonicalCatalogData={siteCount:315,sites:[
  {siteId:'SITE_CANONICAL_ONLY_1',countryId:'AUS',resourceId:'canonical_only_mineral',siteName:'Canonical-only site'}
]};
globalThis.Game.state.resources={CAN:{inventory:{namespace_only_mineral:5}}};
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
const books=market.rebuild();
assert(books.crude_oil);
const depositResourceIds=[...new Set((globalThis.ResourceMinistryEngine?.deposits||[])
  .map(site=>site?.resourceId||site?.resId||site?.resourceTypeId||site?.resource_id||site?.resource)
  .filter(Boolean).map(String))];
for(const resourceId of depositResourceIds){
  assert.ok(books[resourceId], 'global market must index the resource referenced by registered deposits: '+resourceId);
}
assert.ok(books.site_only_mineral, 'global market must also index resources found only in the canonical site-binding registry');
assert.equal(market.quote('site_only_mineral').status,'NO_ORDERS',
  'site-binding resources without bids or asks are visible without an invented executable market price');
assert.ok(books.canonical_only_mineral, 'global market indexes every commodity represented in the full canonical site catalog');
assert.equal(market.quote('canonical_only_mineral').status,'NO_ORDERS',
  'canonical-only commodities without orders have a visible no-orders state, not a made-up price');
assert.ok(books.namespace_only_mineral, 'global market includes resource IDs under the plural resources namespace');
assert.equal(market.quote('namespace_only_mineral').status,'NO_ORDERS',
  'plural-namespace resources without orders remain visible without a fabricated price');
const q=market.quote('crude_oil');
assert.equal(q.status,'CLEARED');
assert.equal(q.matchedQuantity,100);
assert.equal(q.clearingPriceUsd,100);
assert.equal(market.localPrice('BDG','crude_oil'),100);

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
console.log('OMEGA GLOBAL MARKET CLEARING TEST PASSED');