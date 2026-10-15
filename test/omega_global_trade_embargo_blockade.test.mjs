import assert from 'node:assert/strict';
import test from 'node:test';

const relationship={overall:85,trade:90,political:80,trust:85,trade_agreement:true,sanctions:false,war_state:false};
globalThis.Game={state:{
  simulation:{turn:1},
  finance:{
    BGD:{available:1000000,reserves:2000000,currencyCode:'USD'},
    SAU:{available:1000000,reserves:2000000,currencyCode:'USD'}
  },
  economy:{BGD:{currency_code:'USD'},SAU:{currency_code:'USD'}},
  resource:{BGD:{inventory:{crude_oil:0}},SAU:{inventory:{crude_oil:5000}}},
  trade:{
    BGD:{marketPrice:{crude_oil:100},routeCapacity:{crude_oil:5000},importRequests:[]},
    SAU:{marketPrice:{crude_oil:100},routeCapacity:{crude_oil:5000},offerBook:[]}
  },
  transport:{BGD:{},SAU:{}},
  foreign:{
    BGD:{relations:{SAU:{...relationship}},treaties:{}},
    SAU:{relations:{BGD:{...relationship}},treaties:{}}
  }
}};
globalThis.CustomEvent=globalThis.CustomEvent||class{constructor(type,init={}){this.type=type;this.detail=init.detail;}};
if(typeof globalThis.dispatchEvent!=='function'){
  const target=new EventTarget();globalThis.dispatchEvent=target.dispatchEvent.bind(target);globalThis.addEventListener=target.addEventListener.bind(target);
}
globalThis.OmegaCanonicalIdentityRegistry={resolveCountry(value){const x=String(value??'').trim().toUpperCase();return /^[A-Z]{3}$/.test(x)?{id:x}:null;},list(){return['BGD','SAU'];}};
await import('../omega_global_trade_system.js');
const trade=globalThis.OmegaGlobalTrade;
assert.ok(trade,'global trade runtime must load');

const request={requestId:'REQ-MILESTONE-C-1',countryId:'BGD',targetCountryId:'SAU',resourceId:'crude_oil',
  quantity:1000,unitPrice:100,status:'SENT',transportMode:'ship',needPressure:.8};

test('active resource embargo rejects international trade during negotiation and final settlement preflight',()=>{
  globalThis.Game.state.foreign.BGD.resourceEmbargoes={SAU:{status:'ACTIVE',direction:'IMPORT',resourceIds:['crude_oil']}};
  const decision=trade.reviewRequest(request);
  assert.equal(decision.decision,'REJECT');
  assert.equal(decision.reason,'RESOURCE_EMBARGO_ACTIVE');
  const settlement=trade.validateSettlementPolicy({...request,status:'ACCEPTED'});
  assert.equal(settlement.ok,false);
  assert.equal(settlement.reason,'RESOURCE_EMBARGO_ACTIVE');
  delete globalThis.Game.state.foreign.BGD.resourceEmbargoes;
  assert.equal(trade.resourceTradeRestriction('BGD','SAU','crude_oil',request).blocked,false);
});

test('active naval blockade blocks maritime trade even when diplomatic agreement is signed',()=>{
  globalThis.Game.state.transport.BGD.navalBlockades={SAU:{status:'ACTIVE',blockadeType:'NAVAL',modes:['ship'],resourceIds:['crude_oil']}};
  const decision=trade.reviewRequest(request);
  assert.equal(decision.decision,'REJECT');
  assert.equal(decision.reason,'TRADE_ROUTE_BLOCKADED');
  const settlement=trade.validateSettlementPolicy({...request,status:'ACCEPTED'});
  assert.equal(settlement.ok,false);
  assert.equal(settlement.reason,'TRADE_ROUTE_BLOCKADED');
  delete globalThis.Game.state.transport.BGD.navalBlockades;
  const clear=trade.resourceTradeRestriction('BGD','SAU','crude_oil',request);
  assert.equal(clear.blocked,false);
});

test('embargo and blockade scopes distinguish commodities and transport modes',()=>{
  globalThis.Game.state.foreign.BGD.resourceEmbargoes={SAU:{status:'ACTIVE',direction:'IMPORT',resourceIds:['uranium']}};
  globalThis.Game.state.transport.BGD.navalBlockades={SAU:{status:'ACTIVE',blockadeType:'NAVAL',modes:['ship'],resourceIds:['crude_oil']}};
  assert.equal(trade.resourceTradeRestriction('BGD','SAU','crude_oil',{transportMode:'rail'}).blocked,false,
    'commodity embargo must not block an unrelated resource and a sea-only blockade must not block rail');
  assert.equal(trade.resourceTradeRestriction('BGD','SAU','uranium',{transportMode:'rail'}).reason,'RESOURCE_EMBARGO_ACTIVE');
  assert.equal(trade.resourceTradeRestriction('BGD','SAU','crude_oil',{transportMode:'ship'}).reason,'TRADE_ROUTE_BLOCKADED');
});
