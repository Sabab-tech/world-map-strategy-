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
globalThis.OmegaResourceStrategicPolicyRules=JSON.parse(fs.readFileSync(new URL('../resource_strategic_policy_rules_v1.json',import.meta.url),'utf8'));
await import('../omega_resource_strategic_policy_runtime_v1.js');
await import('../omega_global_market_system.js');
const policy=globalThis.Omega?.ResourceStrategicPolicyRuntime||globalThis.OmegaResourceStrategicPolicyRuntime;
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
assert.equal(referenceOnly.matches.some(x=>x.referenceLiquidity),false);
console.log('OMEGA GLOBAL MARKET CLEARING TEST PASSED');