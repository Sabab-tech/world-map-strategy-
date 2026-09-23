import assert from 'node:assert/strict';

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
await import('../omega_global_market_system.js');
const market=globalThis.OmegaGlobalMarket;
const books=market.rebuild();
assert(books.crude_oil);
const q=market.quote('crude_oil');
assert.equal(q.status,'CLEARED');
assert.equal(q.matchedQuantity,100);
assert.equal(q.clearingPriceUsd,100);
assert.equal(market.localPrice('BDG','crude_oil'),100);
console.log('OMEGA GLOBAL MARKET CLEARING TEST PASSED');