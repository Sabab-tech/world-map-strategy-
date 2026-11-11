import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../omega_black_market_system_v1.js',import.meta.url),'utf8');
const tradeSource=fs.readFileSync(new URL('../omega_global_trade_system.js',import.meta.url),'utf8');
function makeHarness(){
 const state={simulation:{turn:7,session:{playerCountryId:'BGD'}},
 resource:{BGD:{inventory:{},reserves:{}},SAU:{inventory:{coal:100},reserves:{coal:10},strategicReserve:{availableByResource:{coal:5}},
  warehouse:{countryId:'SAU',status:'OPERATIONAL',availableByResource:{coal:90},reservedByResource:{coal:0}}}},
 trade:{BGD:{},SAU:{}},
 foreign:{BGD:{relations:{SAU:{overall:30,trade:20,trust:25,political:35,trade_agreement:false,sanctions:true,war_state:false}}},
  SAU:{relations:{BGD:{overall:35,trade:20,trust:25,political:40,trade_agreement:false,sanctions:true,war_state:false}}},XYZ:{}},
 finance:{BGD:{available:1000000}},governmentBanking:{tradePolicies:{BGD:{importTariffPct:30}}},intelligence:{}};
 const handlers=new Map(),listeners=new Map();
 const ctx={Game:{state},Omega:{CanonicalIdentity:{resolveCountry(v){const x=String(v||'').toUpperCase();return{id:x,iso3:x};}}},
 OmegaCanonicalIdentityRegistry:{resolveCountry(v){const x=String(v||'').toUpperCase();return{id:x,iso3:x};}},
 CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
 addEventListener(type,fn){const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a);},
 dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e);return true;},
 OmegaGlobalMarket:{productCatalog(){return[{id:'coal',name:'Coal',productType:'RAW_RESOURCE',unit:'tonne'}];},
 describeProduct(r){return r==='coal'?{id:r,name:'Coal',productType:'RAW_RESOURCE',unit:'tonne'}:null;},
 localPrice(c,r){return c==='SAU'&&r==='coal'?100:null;},suppliers(){return[];}},
 OmegaGlobalTrade:{inventory(c,r){return c==='SAU'&&r==='coal'?{stock:100,reserve:10,production:0}:{stock:0,reserve:0,production:0};},
 marketPrice(c,r){return c==='SAU'&&r==='coal'?100:null;},currencyOf(){return'USD';},
 createRequest(c,p){this.lastRequest={country:c,payload:p};return{accepted:true,request:{...p,status:'SENT'}};}},
 OmegaResourceStrategicPolicyRuntime:{
 isResourceEmbargoed(b,s,r){return b==='BGD'&&s==='SAU'&&r==='coal'?{blocked:true,policies:[{policyId:'EMB-BGD-SAU',issuerCountryId:'BGD'}]}:{blocked:false,policies:[]};},
 evaluateExportDirective(){return{allowed:false,reason:'STATE_DIRECTIVE_EXPORT_RESTRICTED',policies:['DIR-SAU-COAL']};},
 isRouteBlocked(){return{blocked:false};}},
 OmegaGovernmentBanking:{getCountryPolicy(){return{importTariffPct:30};}},
 OmegaMinistryInteroperability:{registerAction(){},registerCommandHandler(t,o,h){handlers.set(t,{owner:o,handler:h});},
 dispatchCommand(o,t,c,p){const r=handlers.get(t);if(!r)return{status:'UNHANDLED',result:{accepted:false,reason:'NO_HANDLER'}};
 const tx={get(path){let v=state[o]?.[c];for(const k of String(path).split('.')){if(v==null)return undefined;v=v[k];}return v;},
 set(path,val){state[o]=state[o]||{};state[o][c]=state[o][c]||{};const ps=String(path).split('.');let v=state[o][c];for(const k of ps.slice(0,-1)){v[k]=v[k]||{};v=v[k];}v[ps.at(-1)]=val;}};
 const result=r.handler({payload:p},{countryId:c,stateTransaction:tx});return{status:result?.accepted===false?'REJECTED':'APPLIED',result};},
 emitEvent(t,c,o,p){for(const fn of listeners.get(t)||[])fn({detail:{eventType:t,countryId:c,payload:p}});}}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'omega_black_market_system_v1.js'});return{ctx,state,handlers};
}
test('offers use canonical products and observed stock, warehouse and protected reserve',()=>{
 const h=makeHarness(),r=h.ctx.OmegaBlackMarket.getOffers('BGD','coal',10);
 assert.equal(r.status,'READY');assert.equal(r.offers.length,1);assert.equal(r.offers[0].availableQuantity,90);
 assert.equal(r.offers[0].legalMarketAvailable,false);assert.equal(r.offers[0].legalLandedTotal,null);
 assert.ok(r.offers[0].unitPrice>r.offers[0].benchmarkUnitPrice);
});
test('covert order stores a permit and sends the same quantity, price and zero-tariff instruction into Global Trade',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket,o=api.getOffers('BGD','coal',10).offers[0];
 const r=api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:o.offerId});
 assert.equal(r.accepted,true,JSON.stringify(r));const d=h.state.trade.BGD.blackMarketDeals[0];
 assert.equal(d.status,'SENT');assert.equal(d.importTariffPct,0);assert.ok(d.permitId);
 assert.equal(h.ctx.OmegaGlobalTrade.lastRequest.payload.blackMarketDealId,d.dealId);
 assert.equal(h.ctx.OmegaGlobalTrade.lastRequest.payload.importTariffPct,0);
 assert.equal(api.validateAuthorization(d.dealId,{buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,unitPrice:d.unitPrice,blackMarketPermitId:d.permitId}).verified,true);
 assert.equal(api.validateAuthorization(d.dealId,{buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:11,unitPrice:d.unitPrice,blackMarketPermitId:d.permitId}),null);
});
test('foreign enforcement response is idempotent and records the issuer diplomatic adjustment',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket,o=api.getOffers('BGD','coal',10).offers[0];
 api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:o.offerId});
 const response={responseId:'BM-RESPONSE-1',caseId:'BM-CASE-1',targetCountryId:'BGD',sourceCountryId:'SAU',responseType:'ENHANCED_INSPECTION_AND_DIPLOMATIC_PROTEST',severity:'HIGH'};
 const m=h.ctx.OmegaMinistryInteroperability;
 assert.equal(m.dispatchCommand('foreign','OMEGA_BLACK_MARKET_RECORD_RESPONSE','SAU',{response}).status,'APPLIED');
 assert.equal(h.state.foreign.SAU.blackMarketResponses.length,1);assert.equal(h.state.foreign.SAU.relationAdjustments.BGD[0].delta,-4);
 assert.equal(m.dispatchCommand('foreign','OMEGA_BLACK_MARKET_RECORD_RESPONSE','SAU',{response}).result.duplicate,true);
});
test('war and route blockades remain hard prohibitions',()=>{
 const h=makeHarness(),api=h.ctx.OmegaBlackMarket;h.state.foreign.BGD.relations.SAU.war_state=true;
 assert.equal(api.getOffers('BGD','coal',10).offers.length,0);h.state.foreign.BGD.relations.SAU.war_state=false;
 h.ctx.OmegaResourceStrategicPolicyRuntime.isRouteBlocked=()=>({blocked:true});assert.equal(api.getOffers('BGD','coal',10).offers.length,0);
});
test('deal creation never creates stock, treasury cash or new commodity identities',()=>{
 const h=makeHarness(),before=JSON.stringify({resource:h.state.resource,finance:h.state.finance}),ids=h.ctx.OmegaGlobalMarket.productCatalog().map(x=>x.id);
 const api=h.ctx.OmegaBlackMarket,o=api.getOffers('BGD','coal',10).offers[0];
 api.createDeal({buyerCountryId:'BGD',sellerCountryId:'SAU',resourceId:'coal',quantity:10,offerId:o.offerId});
 assert.equal(JSON.stringify({resource:h.state.resource,finance:h.state.finance}),before);
 assert.deepEqual(h.ctx.OmegaGlobalMarket.productCatalog().map(x=>x.id),ids);
});
test('Global Trade keeps permit verification, interception, route and strategic-stock guards wired',()=>{
 assert.match(tradeSource,/blackMarketDealFor/);assert.match(tradeSource,/BLACK_MARKET_INTERCEPTED/);
 assert.match(tradeSource,/blackMarketPermitId/);assert.match(tradeSource,/RESOURCE_ROUTE_BLOCKADE_ACTIVE/);
 assert.match(tradeSource,/STRATEGIC_STOCKPILE_PROTECTED/);
});
