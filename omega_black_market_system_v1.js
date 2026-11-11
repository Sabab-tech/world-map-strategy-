/* OMEGA BLACK MARKET / SHADOW ECONOMY v1.0.0
 * Player-scoped covert-commerce orchestration. Existing market, trade, inventory,
 * finance, logistics and policy authorities remain authoritative. This module
 * owns auditable deal metadata only; it never creates stock, cash or products.
 */
(function(g){
'use strict';
const VERSION='1.0.0',MAX_DEALS=256,MAX_CASES=256,MAX_RESPONSES=128,PERMIT_TTL=12;
const clone=(v,seen=new WeakMap())=>{if(v===null||typeof v!=='object')return v;if(seen.has(v))return seen.get(v);if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);return o;};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;},id=v=>String(v??'').trim().toUpperCase();
const tok=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,num(v)??lo));
const state=()=>g.Omega?.Simulation?.world?.state||g.Game?.state||g.gameState||{};
const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
const mesh=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
const market=()=>g.OmegaGlobalMarket||g.Omega?.GlobalMarket||null;
const trade=()=>g.OmegaGlobalTrade||g.Omega?.GlobalTrade||null;
const policy=()=>g.OmegaResourceStrategicPolicyRuntime||g.Omega?.ResourceStrategicPolicyRuntime||null;
const bank=()=>g.OmegaGovernmentBanking||g.Omega?.GovernmentBanking||null;
let report={ready:false,registered:0,total:4,errors:[]},sequence=0;
function country(v){
 const raw=v&&typeof v==='object'?(v.iso3||v.iso3Code||v.countryCode||v.countryId||v.code||v.id||v.name):v;
 if(raw==null)return'';
 try{const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity,h=b?.resolveCountry?.(raw),x=h?.iso3||h?.iso3Code||h?.raw?.iso3||h?.id;if(x&&/^[A-Z0-9]{2,3}$/i.test(String(x)))return id(x);}catch(_){}
 const s=id(raw);return s.length<=3?s:s.replace(/[^A-Z0-9]/g,'').slice(0,3);
}
function player(){
 const s=state(),sim=g.Omega?.Simulation;let direct=null;try{direct=sim?.getPlayerCountryId?.()||null;}catch(_){}
 for(const v of [s.simulation?.session?.playerCountryId,s.simulation?.playerCountryId,direct,s.playerCountryId,s.playerCountryCode,g.Game?.playerCountryId,g.Game?.playerCountryCode,g.Game?.currentActiveCountry,g.OmegaCabinetUI?.activeCountry,g.currentActiveCountry,g.OMEGA_PLAYER_COUNTRY_ID]){
  const c=country(v);if(c&&c!=='GLOBAL'&&c!=='WORLD')return c;
 }return null;
}
function bucket(domain,c){
 const root=state()?.[domain],cid=country(c);if(!root||typeof root!=='object'||Array.isArray(root))return{};
 const key=Object.keys(root).find(k=>country(k)===cid);return key===undefined?{}:root[key]||{};
}
function countryKeys(domain){
 const root=state()?.[domain];if(!root||typeof root!=='object'||Array.isArray(root))return[];
 return [...new Set(Object.keys(root).map(country).filter(x=>/^[A-Z0-9]{2,3}$/.test(x)))].sort();
}
function value(map,key){if(!map||typeof map!=='object')return undefined;const k=Object.keys(map).find(x=>tok(x)===tok(key));return k===undefined?undefined:map[k];}
function relation(buyer,seller){return value(bucket('foreign',buyer).relations,seller)||value(bucket('trade',buyer).relations,seller)||value(bucket('foreign',seller).relations,buyer)||value(bucket('trade',seller).relations,buyer)||null;}
function agreement(r){return !!r&&(r.trade_agreement===true||/SIGNED|RATIFIED|ACTIVE|IMPLEMENTED/.test(String(r.status||r.stage||'').toUpperCase()));}
function dispatch(owner,type,c,p){
 const m=mesh();if(!m?.dispatchCommand)return{accepted:false,reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
 try{const r=m.dispatchCommand(owner,type,country(c),clone(p||{}),{turn:turn(),commandType:type,correlationId:p?.dealId||p?.caseId||p?.responseId||p?.requestId||null});return r&&['APPLIED','FAILED','REJECTED'].includes(String(r.status||''))&&r.result?r.result:r;}
 catch(e){return{accepted:false,reason:String(e?.message||e)};}
}
function emit(type,c,p){
 const body={eventType:type,countryId:country(c),turn:turn(),source:'OMEGA_BLACK_MARKET',payload:clone(p||{})};
 try{mesh()?.emitEvent?.(type,country(c),'trade',body,{turn:turn(),correlationId:p?.dealId||p?.caseId||null});}catch(_){}
 try{g.dispatchEvent?.(new g.CustomEvent(type,{detail:body}));}catch(_){}
}
function random(value){let h=2166136261;const s=String(value||'');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0)/4294967296;}
function product(rid){try{const rows=market()?.productCatalog?.()||[];return rows.find(x=>tok(x.id||x.resourceId||x.productId)===tok(rid))||market()?.describeProduct?.(rid)||null;}catch(_){return null;}}
function price(c,rid){
 try{const n=num(market()?.localPrice?.(country(c),rid));if(n!==null&&n>0)return{value:n,source:'OMEGA_GLOBAL_MARKET_LOCAL_PRICE'};}catch(_){}
 try{const n=num(trade()?.marketPrice?.(country(c),rid));if(n!==null&&n>0)return{value:n,source:'OMEGA_GLOBAL_TRADE_MARKET_PRICE'};}catch(_){}
 return{value:null,source:'UNAVAILABLE'};
}
function tariff(c){
 try{const n=num(bank()?.getCountryPolicy?.(country(c))?.importTariffPct);if(n!==null&&n>=0&&n<=80)return n;}catch(_){}
 const n=num(value(state()?.governmentBanking?.tradePolicies,country(c))?.importTariffPct);return n!==null&&n>=0&&n<=80?n:null;
}
function stock(c,rid){
 let inv=null;try{inv=trade()?.inventory?.(country(c),rid)||null;}catch(_){}
 const r=bucket('resource',c),q=num(inv?.stock)??num(value(r.inventory,rid));if(q===null)return null;
 const reserve=Math.max(0,num(inv?.reserve)??num(value(r.reserves,rid))??0),strategic=Math.max(0,num(value(r.strategicReserve?.availableByResource,rid))||0);
 let warehouse=0,observed=false;
 for(const w of [r.warehouse,r.processedWarehouse]){if(!w||typeof w!=='object')continue;const a=num(value(w.availableByResource,rid));if(a===null)continue;warehouse+=Math.max(0,a-Math.max(0,num(value(w.reservedByResource,rid))||0));observed=true;}
 if(!observed)return null;
 return{stock:q,reserve,strategic,warehouse,available:Math.max(0,Math.min(q-Math.max(reserve,strategic),warehouse))};
}
function embargo(b,s,r){try{return policy()?.isResourceEmbargoed?.(b,s,r)||{blocked:false,policies:[]};}catch(_){return{blocked:true,policies:[]};}}
function routeBlocked(c,r){try{return policy()?.isRouteBlocked?.(c,{resourceId:r,transportMode:'ship'})||{blocked:false};}catch(_){return{blocked:true};}}
function exportDirective(s,b,r,q,stockValue){try{return policy()?.evaluateExportDirective?.(s,b,r,q,null,{[r]:stockValue})||{allowed:true,policies:[]};}catch(_){return{allowed:false,reason:'EXPORT_POLICY_EVALUATION_FAILED'};}}
function riskOf(buyer,seller,r,embargoed,restricted,q,available){
 let risk=.055;if(embargoed)risk+=.18;if(restricted)risk+=.13;if(r?.sanctions===true)risk+=.16;if(!agreement(r))risk+=.09;
 const relationValue=[num(r?.overall),num(r?.trade),num(r?.trust)].find(x=>x!==null);
 if(relationValue!==undefined&&relationValue!==null&&(relationValue>1?relationValue/100:relationValue)<.3)risk+=.06;
 if(available>0)risk+=Math.min(.06,q/available*.06);
 const intel=bucket('intelligence',buyer),interior=bucket('interior',buyer);
 const surveillance=num(intel.tradeSurveillance??intel.counterSmugglingReadiness??intel.blackMarketDetection);
 const inspection=num(interior.customsInspectionCoverage??interior.borderInspectionCoverage??interior.policeCoverage);
 if(surveillance!==null)risk+=clamp(surveillance>1?surveillance/100:surveillance)*.05;
 if(inspection!==null)risk+=clamp(inspection>1?inspection/100:inspection)*.04;
 return clamp(risk,.04,.82);
}
function makePrice(base,tariffPct,risk,embargoed,restricted,noAgreement,q,available){
 const discount=Math.min(.32,tariffPct/100*.55);
 const premium=.035+risk*.16+(embargoed?.19:0)+(restricted?.11:0)+(noAgreement?.045:0);
 const scarcity=available>0?Math.min(.15,q/available*.08):.15,broker=.035;
 const multiplier=clamp(1-discount+premium+scarcity+broker,.35,2.25),unit=Number((base*multiplier).toFixed(6));
 return{unit,multiplier,expectedUnit:Number((unit*(1+risk*1.15)).toFixed(6))};
}
function getOffers(buyerValue,ridValue,qValue=1){
 const buyer=country(buyerValue||player()),rid=String(ridValue||'').trim(),q=num(qValue),p=product(rid);
 if(!buyer||buyer!==player())return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY',offers:[]};
 if(!rid||!p)return{status:'UNAVAILABLE',reason:'CANONICAL_MARKET_PRODUCT_NOT_FOUND',offers:[]};
 if(q===null||q<=0)return{status:'INVALID',reason:'QUANTITY_MUST_BE_POSITIVE',offers:[]};
 const tariffPct=tariff(buyer);if(tariffPct===null)return{status:'WAITING_DATA',reason:'IMPORT_TARIFF_POLICY_NOT_OBSERVED',offers:[]};
 const legal=(()=>{try{return market()?.suppliers?.(rid,q,buyer)||[];}catch(_){return[];}})(),offers=[];
 for(const seller of countryKeys('resource')){
  if(seller===buyer)continue;const r=relation(buyer,seller);if(!r||r.war_state===true)continue;
  const s=stock(seller,rid);if(!s||s.available+1e-8<q)continue;const quote=price(seller,rid);if(quote.value===null)continue;
  const emb=embargo(buyer,seller,rid),rule=exportDirective(seller,buyer,rid,q,s.stock);
  const restricted=!rule.allowed&&['STATE_DIRECTIVE_DOMESTIC_ONLY','STATE_DIRECTIVE_EXPORT_RESTRICTED'].includes(String(rule.reason||''));
  if(!rule.allowed&&!restricted)continue;if(routeBlocked(buyer,rid).blocked||routeBlocked(seller,rid).blocked)continue;
  const hasAgreement=agreement(r),sanctioned=r.sanctions===true;
  const legalAvailable=!!(hasAgreement&&!emb.blocked&&!sanctioned&&rule.allowed&&legal.some(x=>country(x.countryId)===seller));
  const detection=riskOf(buyer,seller,r,!!emb.blocked,restricted,q,s.available),px=makePrice(quote.value,tariffPct,detection,!!emb.blocked,restricted,!hasAgreement||sanctioned,q,s.available);
  const legalUnit=legalAvailable?Number((quote.value*(1+tariffPct/100)).toFixed(6)):null;
  const legalTotal=legalUnit===null?null:Number((legalUnit*q).toFixed(2)),expectedTotal=Number((px.expectedUnit*q).toFixed(2));
  offers.push({offerId:'BM-OFFER:'+buyer+':'+seller+':'+tok(rid),buyerCountryId:buyer,sellerCountryId:seller,resourceId:rid,
   productName:p.name||p.title||rid,productType:p.productType||null,unit:p.unit||null,
   currency:(()=>{try{return trade()?.currencyOf?.(seller)||'USD';}catch(_){return'USD';}})(),
   availableQuantity:Number(s.available.toFixed(6)),requestedQuantity:q,benchmarkUnitPrice:quote.value,benchmarkSource:quote.source,
   unitPrice:px.unit,priceMultiplier:px.multiplier,importTariffPct:tariffPct,legalLandedUnitPrice:legalUnit,
   expectedUnitCost:px.expectedUnit,legalLandedTotal:legalTotal,expectedBlackMarketTotal:expectedTotal,
   expectedSavings:legalTotal===null?null:Number((legalTotal-expectedTotal).toFixed(2)),detectionProbability:detection,
   embargoed:!!emb.blocked,embargoPolicyIds:(emb.policies||[]).map(x=>String(x.policyId||'')).filter(Boolean),
   sanctionsAtQuote:sanctioned,exportRestrictionReason:restricted?rule.reason:null,
   exportPolicyIds:(rule.policies||[]).map(x=>typeof x==='string'?x:String(x.policyId||'')).filter(Boolean),
   legalMarketAvailable:legalAvailable,reason:!legalAvailable?'RESTRICTED_OR_UNAVAILABLE_LEGAL_ACCESS':(expectedTotal<legalTotal?'EXPECTED_COST_ADVANTAGE':'STRATEGIC_ACCESS_ONLY'),
   stockAuthority:'GAME_STATE_RESOURCE_INVENTORY_RESERVE_AND_WAREHOUSE'});
 }
 offers.sort((a,b)=>(b.expectedSavings??-Infinity)-(a.expectedSavings??-Infinity)||a.detectionProbability-b.detectionProbability||a.sellerCountryId.localeCompare(b.sellerCountryId));
 return{status:'READY',buyerCountryId:buyer,resourceId:rid,quantity:q,offers:offers.slice(0,24),diagnostics:{sellerCountryCount:countryKeys('resource').length,offerCount:offers.length,tariffPct,turn:turn()}};
}
function rows(c){const v=bucket('trade',c).blackMarketDeals;return Array.isArray(v)?v:[];}
function getDeal(dealId,c){return rows(c).find(x=>String(x.dealId)===String(dealId))||null;}
function getDeals(c){return rows(c).slice().sort((a,b)=>(num(b.createdTurn)||0)-(num(a.createdTurn)||0)).map(clone);}
function validateAuthorization(dealId,scope={}){
 const buyer=country(scope.buyerCountryId||scope.countryId||scope.blackMarketBuyerCountryId),row=buyer?getDeal(dealId,buyer):null;if(!row)return null;
 const status=String(row.status||'').toUpperCase();if(!['REQUESTED','SENT','NEGOTIATING','ACCEPTED','SETTLED','SETTLED_UNDER_INVESTIGATION'].includes(status))return null;
 if(!['SETTLED','SETTLED_UNDER_INVESTIGATION'].includes(status)&&turn()>num(row.expiresTurn))return null;
 const seller=country(scope.sellerCountryId||scope.targetCountryId||scope.sourceCountryId||scope.destinationCountryId);
 if(seller&&seller!==country(row.sellerCountryId))return null;
 if(scope.resourceId&&tok(scope.resourceId)!==tok(row.resourceId))return null;
 if(num(scope.quantity)!==null&&Math.abs(num(scope.quantity)-num(row.quantity))>1e-7)return null;
 if(num(scope.unitPrice)!==null&&Math.abs(num(scope.unitPrice)-num(row.unitPrice))>1e-7)return null;
 const supplied=String(scope.blackMarketPermitId||scope.permitId||'').trim();if(supplied&&supplied!==String(row.permitId||''))return null;
 return Object.assign({},clone(row),{verified:true,allowEmbargoBypass:!!row.embargoedAtCreation,
  allowTradeAgreementBypass:!row.tradeAgreementAtCreation,allowSanctionsBypass:!!row.sanctionsAtCreation,
  allowExportRestrictionBypass:['STATE_DIRECTIVE_DOMESTIC_ONLY','STATE_DIRECTIVE_EXPORT_RESTRICTED'].includes(String(row.exportRestrictionReason||''))});
}
function getAuthorizedDeal(dealId,request){return validateAuthorization(dealId,{
 buyerCountryId:request?.countryId||request?.buyerCountryId||request?.blackMarketBuyerCountryId,
 sellerCountryId:request?.targetCountryId||request?.sellerCountryId||request?.sourceCountryId,
 resourceId:request?.resourceId,quantity:request?.quantity,unitPrice:request?.unitPrice,blackMarketPermitId:request?.blackMarketPermitId});}
function updateDeal(dealId,patch){const row=getDeal(dealId,patch?.buyerCountryId);if(!row)return{accepted:false,reason:'BLACK_MARKET_DEAL_NOT_FOUND'};return dispatch('trade','OMEGA_BLACK_MARKET_UPDATE_DEAL',row.buyerCountryId,{dealId,patch:clone(patch||{})});}
function createDeal(input={}){
 const buyer=country(input.buyerCountryId||input.countryId||player()),seller=country(input.sellerCountryId||input.targetCountryId),rid=String(input.resourceId||'').trim(),q=num(input.quantity);
 if(!buyer||buyer!==player())return{accepted:false,reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
 if(!seller||seller===buyer||!rid||q===null||q<=0)return{accepted:false,reason:'BLACK_MARKET_ORDER_FIELDS_INVALID'};
 const book=getOffers(buyer,rid,q);if(book.status!=='READY')return{accepted:false,reason:book.reason||'BLACK_MARKET_OFFERS_UNAVAILABLE'};
 const offer=book.offers.find(x=>x.sellerCountryId===seller&&(!input.offerId||x.offerId===input.offerId));if(!offer)return{accepted:false,reason:'BLACK_MARKET_OFFER_NOT_FOUND_OR_STALE'};
 const rel=relation(buyer,seller);if(!rel||rel.war_state===true)return{accepted:false,reason:'WAR_OR_RELATION_EVIDENCE_REQUIRED'};
 sequence++;const dealId='BM-'+buyer+'-'+seller+'-T'+turn()+'-'+sequence+'-'+tok(rid).slice(0,18);
 const permitId='BM-PERMIT-'+random(dealId+'|'+buyer+'|'+seller).toString(16).slice(2).toUpperCase();
 const row={dealId,permitId,requestId:dealId+'-TRADE',buyerCountryId:buyer,sellerCountryId:seller,resourceId:rid,
  productName:offer.productName,productType:offer.productType,quantity:q,unit:offer.unit,unitPrice:offer.unitPrice,currency:offer.currency,
  benchmarkUnitPrice:offer.benchmarkUnitPrice,benchmarkSource:offer.benchmarkSource,legalLandedUnitPrice:offer.legalLandedUnitPrice,
  expectedUnitCost:offer.expectedUnitCost,legalLandedTotal:offer.legalLandedTotal,
  expectedBlackMarketTotal:Number((offer.expectedBlackMarketTotal*q/offer.requestedQuantity).toFixed(2)),
  expectedSavings:offer.expectedSavings===null?null:Number((offer.expectedSavings*q/offer.requestedQuantity).toFixed(2)),
  importTariffPctAtCreation:offer.importTariffPct,importTariffPct:0,detectionProbability:offer.detectionProbability,
  embargoedAtCreation:offer.embargoed,embargoPolicyIds:offer.embargoPolicyIds,tradeAgreementAtCreation:agreement(rel),
  sanctionsAtCreation:offer.sanctionsAtQuote,exportRestrictionReason:offer.exportRestrictionReason,exportPolicyIds:offer.exportPolicyIds,
  legalMarketAvailable:offer.legalMarketAvailable,commercialReason:offer.reason,createdTurn:turn(),expiresTurn:turn()+PERMIT_TTL,
  status:'REQUESTED',source:'OMEGA_BLACK_MARKET_SHADOW_ECONOMY',authorizationVersion:VERSION};
 const saved=dispatch('trade','OMEGA_BLACK_MARKET_RECORD_DEAL',buyer,{deal:row});if(saved?.accepted!==true)return{accepted:false,reason:saved?.reason||'BLACK_MARKET_DEAL_RECORD_FAILED'};
 const api=trade();if(!api||typeof api.createRequest!=='function'){updateDeal(dealId,{buyerCountryId:buyer,status:'FAILED',failureReason:'GLOBAL_TRADE_API_UNAVAILABLE'});return{accepted:false,reason:'GLOBAL_TRADE_API_UNAVAILABLE'};}
 const req=api.createRequest(buyer,{requestId:row.requestId,targetCountryId:seller,resourceId:rid,quantity:q,unitPrice:offer.unitPrice,
  currency:offer.currency,importTariffPct:0,needPressure:.85,source:'OMEGA_BLACK_MARKET',blackMarketDealId:dealId,blackMarketPermitId:permitId});
 if(req?.accepted!==true){updateDeal(dealId,{buyerCountryId:buyer,status:'FAILED',failureReason:req?.reason||'TRADE_REQUEST_REJECTED'});return{accepted:false,reason:req?.reason||'TRADE_REQUEST_REJECTED',detail:req};}
 updateDeal(dealId,{buyerCountryId:buyer,status:'SENT',requestId:req.request?.requestId||row.requestId});
 emit('OMEGA_BLACK_MARKET_DEAL_CREATED',buyer,{dealId,permitId,requestId:row.requestId,resourceId:rid,sellerCountryId:seller,quantity:q,unitPrice:offer.unitPrice});
 return{accepted:true,deal:Object.assign({},row,{status:'SENT'}),tradeRequest:req.request||null};
}
function shouldIntercept(dealId,request){
 const row=getAuthorizedDeal(dealId,request);if(!row)return{detected:true,reason:'BLACK_MARKET_AUTHORIZATION_INVALID',probability:1,roll:0};
 const roll=random(row.dealId+'|INSPECTION|'+row.createdTurn);return{detected:roll<row.detectionProbability,reason:roll<row.detectionProbability?'BLACK_MARKET_INTERCEPTED':'INSPECTION_NOT_DETECTED',probability:row.detectionProbability,roll};
}
function recordCaseFor(c,row){return dispatch('intelligence','OMEGA_BLACK_MARKET_RECORD_CASE',c,{case:Object.assign({},clone(row),{caseCountryId:country(c)})});}
function detectedCase(deal,detail={}){
 const row={caseId:'BM-CASE-'+deal.dealId,dealId:deal.dealId,buyerCountryId:deal.buyerCountryId,sellerCountryId:deal.sellerCountryId,
  resourceId:deal.resourceId,quantity:deal.quantity,unitPrice:deal.unitPrice,currency:deal.currency,detectionTurn:turn(),
  detectionStage:detail.stage||'PRE_DISPATCH',evidenceConfidence:detail.stage==='POST_SETTLEMENT'?.72:.9,
  attributionStatus:'TRANSACTION_LINKED_STATE_SPONSORSHIP_NOT_ESTABLISHED',embargoPolicyIds:deal.embargoPolicyIds||[],
  exportRestrictionReason:deal.exportRestrictionReason||null,settlementId:detail.settlementId||null,
  status:detail.stage==='POST_SETTLEMENT'?'UNDER_INVESTIGATION':'INTERCEPTED',source:'OMEGA_BLACK_MARKET_DETECTION'};
 [deal.buyerCountryId,deal.sellerCountryId].forEach(c=>recordCaseFor(c,row));
 const issuers=[];
 for(const pid of deal.embargoPolicyIds||[])for(const c of countryKeys('trade')){
  const list=bucket('trade',c).resourceEmbargoes;if(Array.isArray(list)){const hit=list.find(x=>String(x.policyId||'')===String(pid));if(hit?.issuerCountryId)issuers.push(country(hit.issuerCountryId));}
 }
 [...new Set(issuers)].forEach(issuer=>dispatch('foreign','OMEGA_BLACK_MARKET_RECORD_RESPONSE',issuer,{response:{
  responseId:'BM-RESPONSE-'+deal.dealId+'-'+issuer,caseId:row.caseId,dealId:deal.dealId,targetCountryId:deal.buyerCountryId,
  sourceCountryId:deal.sellerCountryId,resourceId:deal.resourceId,severity:deal.embargoedAtCreation?'HIGH':'MODERATE',
  responseType:'ENHANCED_INSPECTION_AND_DIPLOMATIC_PROTEST',reason:'DETECTED_BLACK_MARKET_TRADE_ATTEMPT',
  createdTurn:turn(),evidenceConfidence:row.evidenceConfidence,status:'ACTIVE'}}));
 emit('OMEGA_BLACK_MARKET_DETECTED',deal.buyerCountryId,row);return row;
}
function handleTradeRejection(request,decision){
 const deal=getAuthorizedDeal(request?.blackMarketDealId,request);if(!deal)return{accepted:false,reason:'BLACK_MARKET_AUTHORIZATION_INVALID'};
 if(String(decision?.reason||'')==='BLACK_MARKET_INTERCEPTED'){
  updateDeal(deal.dealId,{buyerCountryId:deal.buyerCountryId,status:'INTERCEPTED',detectionTurn:turn()});
  return{accepted:true,status:'INTERCEPTED',case:detectedCase(deal,{stage:'PRE_DISPATCH'})};
 }
 updateDeal(deal.dealId,{buyerCountryId:deal.buyerCountryId,status:'FAILED',failureReason:decision?.reason||'SELLER_DECLINED'});
 return{accepted:true,status:'FAILED',reason:decision?.reason||'SELLER_DECLINED'};
}
function findByRequest(requestId,buyer){return getDeals(buyer).find(x=>String(x.requestId||'')===String(requestId||''))||null;}
function onTradeEvent(type,event){
 const d=event?.detail||{},p=d.payload||d,buyer=country(p.destinationCountryId||p.countryId||d.countryId||p.buyerCountryId);
 const deal=p.blackMarketDealId?getDeal(p.blackMarketDealId,buyer):findByRequest(p.requestId,buyer);if(!deal)return;
 if(type==='OMEGA_TRADE_SETTLEMENT_COMPLETED'){
  updateDeal(deal.dealId,{buyerCountryId:deal.buyerCountryId,status:'SETTLED',settlementId:p.settlementId||null,settledTurn:turn(),
   createdBatchIds:clone(p.createdBatchIds||[]),batchTransfers:clone(p.batchTransfers||[])});
  if(random(deal.dealId+'|POST_SETTLEMENT_DISCOVERY|'+deal.createdTurn)<deal.detectionProbability*.18){
   updateDeal(deal.dealId,{buyerCountryId:deal.buyerCountryId,status:'SETTLED_UNDER_INVESTIGATION',investigationTurn:turn()});
   detectedCase(deal,{stage:'POST_SETTLEMENT',settlementId:p.settlementId||null});
  }
  emit('OMEGA_BLACK_MARKET_DEAL_SETTLED',deal.buyerCountryId,{dealId:deal.dealId,settlementId:p.settlementId||null,resourceId:deal.resourceId});
 }else updateDeal(deal.dealId,{buyerCountryId:deal.buyerCountryId,status:'FAILED',failureReason:p.reason||'TRADE_SETTLEMENT_FAILED',failedTurn:turn()});
}
function recordDealHandler(cmd,ctx){
 const r=cmd?.payload?.deal||{},c=country(ctx.countryId),buyer=country(r.buyerCountryId),seller=country(r.sellerCountryId),dealId=String(r.dealId||'');
 if(!dealId||buyer!==c||!seller||seller===buyer||!r.permitId||!r.resourceId||num(r.quantity)===null||num(r.quantity)<=0||num(r.unitPrice)===null||num(r.unitPrice)<=0)
  return{accepted:false,reason:'BLACK_MARKET_DEAL_RECORD_INVALID'};
 const raw=ctx.stateTransaction.get('trade.blackMarketDeals'),arr=Array.isArray(raw)?clone(raw):[],prior=arr.find(x=>String(x.dealId||'')===dealId);
 if(prior){const same=prior.permitId===r.permitId&&prior.resourceId===r.resourceId&&Math.abs((num(prior.quantity)||0)-num(r.quantity))<1e-7&&prior.sellerCountryId===seller;
  return same?{accepted:true,duplicate:true,deal:clone(prior)}:{accepted:false,reason:'BLACK_MARKET_DEAL_IDEMPOTENCY_COLLISION'};}
 arr.push(clone(r));ctx.stateTransaction.set('trade.blackMarketDeals',arr.slice(-MAX_DEALS));return{accepted:true,deal:clone(r)};
}
function updateDealHandler(cmd,ctx){
 const p=cmd?.payload||{},dealId=String(p.dealId||''),patch=p.patch||{},raw=ctx.stateTransaction.get('trade.blackMarketDeals'),arr=Array.isArray(raw)?clone(raw):[];
 const i=arr.findIndex(x=>String(x.dealId||'')===dealId);if(i<0)return{accepted:false,reason:'BLACK_MARKET_DEAL_NOT_FOUND'};
 const prior=arr[i],old=String(prior.status||'REQUESTED').toUpperCase(),next=String(patch.status||old).toUpperCase();
 if(['SETTLED','SETTLED_UNDER_INVESTIGATION','INTERCEPTED','FAILED','EXPIRED'].includes(old)&&next!==old&&!(old==='SETTLED'&&next==='SETTLED_UNDER_INVESTIGATION'))
  return{accepted:false,reason:'BLACK_MARKET_DEAL_TERMINAL_STATE'};
 arr[i]=Object.assign({},prior,clone(patch),{dealId,updatedTurn:turn()});ctx.stateTransaction.set('trade.blackMarketDeals',arr.slice(-MAX_DEALS));
 return{accepted:true,deal:clone(arr[i])};
}
function recordCaseHandler(cmd,ctx){
 const r=cmd?.payload?.case||{},c=country(ctx.countryId),caseId=String(r.caseId||'');
 if(!caseId||![r.buyerCountryId,r.sellerCountryId,r.caseCountryId].some(x=>country(x)===c))return{accepted:false,reason:'BLACK_MARKET_CASE_SCOPE_INVALID'};
 const raw=ctx.stateTransaction.get('intelligence.blackMarketCases'),arr=Array.isArray(raw)?clone(raw):[],prior=arr.find(x=>String(x.caseId||'')===caseId);
 if(prior)return{accepted:true,duplicate:true,case:clone(prior)};
 arr.push(clone(r));ctx.stateTransaction.set('intelligence.blackMarketCases',arr.slice(-MAX_CASES));return{accepted:true,case:clone(r)};
}
function recordResponseHandler(cmd,ctx){
 const r=cmd?.payload?.response||{},responseId=String(r.responseId||''),target=country(r.targetCountryId),c=country(ctx.countryId);
 if(!responseId||!target||!country(r.sourceCountryId))return{accepted:false,reason:'BLACK_MARKET_FOREIGN_RESPONSE_INVALID'};
 const raw=ctx.stateTransaction.get('foreign.blackMarketResponses'),arr=Array.isArray(raw)?clone(raw):[],prior=arr.find(x=>String(x.responseId||'')===responseId);
 if(prior)return{accepted:true,duplicate:true,response:clone(prior)};
 arr.push(clone(r));ctx.stateTransaction.set('foreign.blackMarketResponses',arr.slice(-MAX_RESPONSES));
 const rawAdj=ctx.stateTransaction.get('foreign.relationAdjustments'),adj=rawAdj&&typeof rawAdj==='object'?clone(rawAdj):{},list=Array.isArray(adj[target])?adj[target].slice():[];
 list.push({source:'BLACK_MARKET_ENFORCEMENT',type:'DIPLOMATIC_PROTEST',delta:-4,turn:turn(),caseId:r.caseId||null,responseId,reason:r.reason||'BLACK_MARKET_DETECTED'});
 adj[target]=list.slice(-64);ctx.stateTransaction.set('foreign.relationAdjustments',adj);
 emit('OMEGA_BLACK_MARKET_FOREIGN_RESPONSE',c,r);return{accepted:true,response:clone(r)};
}
function getCases(c){const v=bucket('intelligence',c).blackMarketCases;return Array.isArray(v)?v.slice().map(clone):[];}
function getResponses(c){const v=bucket('foreign',c).blackMarketResponses;return Array.isArray(v)?v.slice().map(clone):[];}
function onTurn(){const c=player();if(!c)return;for(const d of getDeals(c))if(['REQUESTED','SENT','NEGOTIATING','ACCEPTED'].includes(String(d.status||'').toUpperCase())&&turn()>num(d.expiresTurn))updateDeal(d.dealId,{buyerCountryId:c,status:'EXPIRED',failureReason:'BLACK_MARKET_PERMIT_EXPIRED'});}
function install(){
 const m=mesh();if(!m?.registerCommandHandler)return false;
 const defs=[['OMEGA_BLACK_MARKET_RECORD_DEAL','trade',recordDealHandler],['OMEGA_BLACK_MARKET_UPDATE_DEAL','trade',updateDealHandler],['OMEGA_BLACK_MARKET_RECORD_CASE','intelligence',recordCaseHandler],['OMEGA_BLACK_MARKET_RECORD_RESPONSE','foreign',recordResponseHandler]];
 let registered=0;const errors=[];for(const [type,owner,handler]of defs)try{m.registerAction?.(type,{actionId:type,stateOwnerMinistry:owner,authority:'OMEGA_BLACK_MARKET_V1'});m.registerCommandHandler(type,owner,handler);registered++;}catch(e){errors.push({type,reason:String(e?.message||e)});}
 report={ready:registered===defs.length,registered,total:defs.length,errors};return report.ready;
}
function diagnostics(){const c=player();return{version:VERSION,handlers:clone(report),playerCountryId:c,dealCount:c?getDeals(c).length:0,caseCount:c?getCases(c).length:0,
 globalMarketAvailable:!!market(),globalTradeAvailable:!!trade(),policyAvailable:!!policy(),authority:'EXISTING_MARKET_TRADE_INVENTORY_FINANCE_POLICY'};}
function init(){install();if(!g.__omegaBlackMarketHooks){g.__omegaBlackMarketHooks=true;g.addEventListener?.('OMEGA_READY',install);g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',install);
 g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);g.addEventListener?.('OMEGA_TRADE_SETTLEMENT_COMPLETED',e=>onTradeEvent('OMEGA_TRADE_SETTLEMENT_COMPLETED',e));
 g.addEventListener?.('OMEGA_TRADE_SETTLEMENT_FAILED',e=>onTradeEvent('OMEGA_TRADE_SETTLEMENT_FAILED',e));}return diagnostics();}
const API=Object.freeze({VERSION,diagnostics,install,getOffers,createDeal,getDeals,getDeal,getCases,getResponses,validateAuthorization,getAuthorizedDeal,shouldIntercept,handleTradeRejection});
g.Omega=g.Omega||{};g.Omega.BlackMarket=API;g.OmegaBlackMarket=API;try{init();}catch(e){g.OmegaBlackMarketError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
