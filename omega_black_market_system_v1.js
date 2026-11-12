/* OMEGA BLACK MARKET / SHADOW ECONOMY v1.0.0
 * Player-scoped covert-commerce orchestration. Existing market, trade, inventory,
 * finance, logistics and policy authorities remain authoritative. This module
 * owns auditable deal metadata only; it never creates stock, cash or products.
 */
(function(g){
'use strict';
const VERSION='1.2.0',MAX_DEALS=256,MAX_CASES=256,MAX_RESPONSES=128,PERMIT_TTL=12,MAX_TURN_MAINTENANCE=12;
const clone=(v,seen=new WeakMap())=>{if(v===null||typeof v!=='object')return v;if(seen.has(v))return seen.get(v);if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);return o;};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;},id=v=>String(v??'').trim().toUpperCase();
const tok=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,num(v)??lo));
const state=()=>g.Game?.state||g.gameState||g.Omega?.Simulation?.world?.state||{};
const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
const mesh=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
const market=()=>g.OmegaGlobalMarket||g.Omega?.GlobalMarket||null;
const trade=()=>g.OmegaGlobalTrade||g.Omega?.GlobalTrade||null;
const policy=()=>g.OmegaResourceStrategicPolicyRuntime||g.Omega?.ResourceStrategicPolicyRuntime||null;
const bank=()=>g.OmegaGovernmentBanking||g.Omega?.GovernmentBanking||null;
let report={ready:false,registered:0,total:6,errors:[]},sequence=0;
function country(v){
 const raw=v&&typeof v==='object'?(v.iso3||v.iso3Code||v.countryCode||v.countryId||v.code||v.id||v.name):v;
 if(raw==null)return'';
 try{const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity,h=b?.resolveCountry?.(raw),x=h?.iso3||h?.iso3Code||h?.raw?.iso3||h?.id;if(x&&/^[A-Z0-9]{2,3}$/i.test(String(x)))return id(x);}catch(_){}
 const s=id(raw);return /^[A-Z0-9]{2,3}$/.test(s)?s:'';
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
function product(rid){
 const wanted=tok(rid);if(!wanted)return null;
 const valid=row=>!!row&&['RAW_RESOURCE','FACTORY_PRODUCT','FOOD_PRODUCT'].includes(String(row.productType||'').toUpperCase());
 try{const rows=market()?.productCatalog?.()||[],row=rows.find(x=>tok(x.id||x.resourceId||x.productId)===wanted);
  if(valid(row))return row;const described=market()?.describeProduct?.(rid);return valid(described)?described:null;
 }catch(_){return null;}
}
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
function shipmentSizeProfile(quantity,available){
 const ratio=available>0?clamp(quantity/available,0,1):1;
 const bands=[
  {max:.01,label:'MICRO',risk:.00,fine:.00,seizure:.00},
  {max:.03,label:'SMALL',risk:.02,fine:.00,seizure:.01},
  {max:.08,label:'MODERATE',risk:.05,fine:.01,seizure:.03},
  {max:.15,label:'LARGE',risk:.10,fine:.03,seizure:.06},
  {max:1,label:'CRITICAL',risk:.18,fine:.06,seizure:.10}
 ];
 const band=bands.find(x=>ratio<=x.max)||bands[bands.length-1];
 return{ratio,percent:Number((ratio*100).toFixed(2)),band:band.label,riskAdd:band.risk,
  fineAdd:band.fine,seizureAdd:band.seizure,thresholds:[1,3,8,15]};
}
function recentPattern(buyer,seller,rid){
 const history=rows(buyer),recent=history.filter(x=>country(x.sellerCountryId)===seller&&turn()-(num(x.createdTurn)??turn())<=10);
 const sameResource=recent.filter(x=>tok(x.resourceId)===tok(rid));
 const count=recent.length,resourceCount=sameResource.length;
 return{attempts10Turns:count,resourceAttempts10Turns:resourceCount,
  riskAdd:Math.min(.16,Math.max(0,count-1)*.025+Math.max(0,resourceCount-1)*.02),
  fineAdd:count>=5?.05:(count>=3?.03:0),seizureAdd:count>=5?.06:(count>=3?.03:0)};
}
function riskOf(buyer,seller,r,embargoed,restricted,q,available){
 let risk=.055;if(embargoed)risk+=.18;if(restricted)risk+=.13;if(r?.sanctions===true)risk+=.16;if(!agreement(r))risk+=.09;
 const relationValue=[num(r?.overall),num(r?.trade),num(r?.trust)].find(x=>x!==null);
 if(relationValue!==undefined&&relationValue!==null&&(relationValue>1?relationValue/100:relationValue)<.3)risk+=.06;
 const intel=bucket('intelligence',buyer),interior=bucket('interior',buyer);
 const surveillance=num(intel.tradeSurveillance??intel.counterSmugglingReadiness??intel.blackMarketDetection);
 const inspection=num(interior.customsInspectionCoverage??interior.borderInspectionCoverage??interior.policeCoverage);
 if(surveillance!==null)risk+=clamp(surveillance>1?surveillance/100:surveillance)*.05;
 if(inspection!==null)risk+=clamp(inspection>1?inspection/100:inspection)*.04;
 return clamp(risk,.04,.82);
}
function penaltyProfile(embargoed,restricted,sanctioned,tariffPct,size,pattern){
 const tariffAdd=tariffPct>=35?.07:(tariffPct>=20?.04:0);
 const fineRate=clamp(.06+(embargoed?.08:0)+(restricted?.04:0)+(sanctioned?.07:0)+tariffAdd+size.fineAdd+pattern.fineAdd,.06,.35);
 const attemptFineRate=clamp(fineRate*.45,.025,.16);
 const seizureRate=clamp(.05+(embargoed?.15:0)+(restricted?.10:0)+(sanctioned?.15:0)+size.seizureAdd+pattern.seizureAdd,.05,.55);
 return{fineRate,attemptFineRate,seizureRate,tariffAvoidanceRate:tariffAdd};
}
function makePrice(base,tariffPct,risk,embargoed,restricted,noAgreement,q,available){
 const discount=Math.min(.32,tariffPct/100*.55),riskPremium=risk*.16;
 const policyPremium=(embargoed?.19:0)+(restricted?.11:0)+(noAgreement?.045:0);
 const baseSpread=.035,scarcity=available>0?Math.min(.15,q/available*.08):.15,broker=.035;
 const multiplier=clamp(1-discount+baseSpread+riskPremium+policyPremium+scarcity+broker,.35,2.25),unit=Number((base*multiplier).toFixed(6));
 return{unit,multiplier,expectedUnit:Number((unit*(1+risk*1.15)).toFixed(6)),
  tariffDiscountPct:discount*100,baseSpreadPct:baseSpread*100,riskPremiumPct:riskPremium*100,
  policyPremiumPct:policyPremium*100,scarcityPremiumPct:scarcity*100,brokerSpreadPct:broker*100};
}
function getOffers(buyerValue,ridValue,qValue=1,options={}){
 const buyer=country(buyerValue||player()),rid=String(ridValue||'').trim(),q=num(qValue),p=product(rid);
 const networkAuthority=options?.networkAuthority==='OMEGA_BLACK_MARKET_NPC_NETWORK_V1';
 if(!buyer||(!networkAuthority&&buyer!==player()))return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY',offers:[]};
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
  const size=shipmentSizeProfile(q,s.available),pattern=recentPattern(buyer,seller,rid),
   detection=clamp(riskOf(buyer,seller,r,!!emb.blocked,restricted,q,s.available)+size.riskAdd+pattern.riskAdd,.04,.88),
   penalty=penaltyProfile(!!emb.blocked,restricted,sanctioned,tariffPct,size,pattern),
   px=makePrice(quote.value,tariffPct,detection,!!emb.blocked,restricted,!hasAgreement||sanctioned,q,s.available);
  let sellerCurrency=null,buyerCurrency=null,fx=null;
  try{sellerCurrency=trade()?.currencyOf?.(seller)||null;buyerCurrency=trade()?.currencyOf?.(buyer)||null;fx=num(trade()?.fxRate?.(buyer,seller));}catch(_){}
  if(fx===null&&sellerCurrency&&buyerCurrency&&sellerCurrency===buyerCurrency)fx=1;
  const legalUnit=legalAvailable&&fx!==null?Number((quote.value*fx*(1+tariffPct/100)).toFixed(6)):null;
  const legalTotal=legalUnit===null?null:Number((legalUnit*q).toFixed(2));
  const lateDetectionProbability=detection*.18,
   fineRate=penalty.fineRate,seizureRate=penalty.seizureRate;
  const expectedGrossBuyer=fx===null?null:Number((px.expectedUnit*q*fx).toFixed(2)),
   expectedFineBuyer=fx===null?null:Number((px.unit*q*fx*lateDetectionProbability*fineRate).toFixed(2)),
   expectedSeizedQuantity=Number((q*lateDetectionProbability*seizureRate).toFixed(6)),
   expectedDeliveredQuantity=Number(Math.max(0,q-expectedSeizedQuantity).toFixed(6)),
   expectedCostBuyer=expectedGrossBuyer===null?null:Number((expectedGrossBuyer+expectedFineBuyer).toFixed(2)),
   expectedDeliveredUnitCost=expectedCostBuyer===null||expectedDeliveredQuantity<=0?null:Number((expectedCostBuyer/expectedDeliveredQuantity).toFixed(6)),
   expectedLegalCost=legalUnit===null?null:Number((legalUnit*expectedDeliveredQuantity).toFixed(2)),
   expectedSavings=expectedLegalCost===null||expectedCostBuyer===null?null:Number((expectedLegalCost-expectedCostBuyer).toFixed(2));
  const foreignPolicyBasis=[emb.blocked?'IMPORT EMBARGO':null,restricted?'EXPORT RESTRICTION':null,
   sanctioned?'SANCTIONS':null,!hasAgreement?'NO TRADE AGREEMENT':null].filter(Boolean);
  const buyerMotivation=buyerMotiveEvidence(buyer,rid,q),sellerMotivation=sellerMotiveEvidence(seller,rid,rule,emb);
  const whyUse=!legalAvailable?(foreignPolicyBasis.length?'ACCESS DESPITE LEGAL OR DIPLOMATIC RESTRICTIONS':'NO VERIFIED GENERAL-MARKET OFFER'):
   fx===null?'FX RATE NOT OBSERVED — PRICE ADVANTAGE CANNOT BE CONFIRMED':(expectedSavings>0?'EXPECTED COST ADVANTAGE AFTER RISK':'STRATEGIC ACCESS ONLY — EXPECTED COST IS HIGHER');
  offers.push({offerId:'BM-OFFER:'+buyer+':'+seller+':'+tok(rid),buyerCountryId:buyer,sellerCountryId:seller,resourceId:rid,
   productName:p.name||p.title||rid,productType:p.productType||null,unit:p.unit||null,
   currency:sellerCurrency||'USD',buyerCurrency:buyerCurrency||sellerCurrency||'USD',fxRateToBuyer:fx,
   availableQuantity:Number(s.available.toFixed(6)),requestedQuantity:q,benchmarkUnitPrice:quote.value,benchmarkSource:quote.source,
   unitPrice:px.unit,priceMultiplier:px.multiplier,importTariffPct:tariffPct,legalLandedUnitPrice:legalUnit,
   expectedUnitCost:px.expectedUnit,legalLandedTotal:legalTotal,expectedBlackMarketTotal:Number((px.expectedUnit*q).toFixed(2)),
   expectedBlackMarketTotalBuyer:expectedCostBuyer,expectedFineCostBuyer:expectedFineBuyer,expectedSeizedQuantity,
   expectedDeliveredQuantity,expectedDeliveredUnitCost,expectedSavings,detectionProbability:detection,
   lateDetectionProbability,fineRate,seizureRate,pricingBreakdown:{tariffDiscountPct:px.tariffDiscountPct,baseSpreadPct:px.baseSpreadPct,
    riskPremiumPct:px.riskPremiumPct,policyPremiumPct:px.policyPremiumPct,scarcityPremiumPct:px.scarcityPremiumPct,brokerSpreadPct:px.brokerSpreadPct},
   embargoed:!!emb.blocked,embargoPolicyIds:(emb.policies||[]).map(x=>String(x.policyId||'')).filter(Boolean),
   sanctionsAtQuote:sanctioned,exportRestrictionReason:restricted?rule.reason:null,
   exportPolicyIds:(rule.policies||[]).map(x=>typeof x==='string'?x:String(x.policyId||'')).filter(Boolean),
   legalMarketAvailable:legalAvailable,foreignPolicyBasis,whyUse,
   reason:!legalAvailable?'RESTRICTED_OR_UNAVAILABLE_LEGAL_ACCESS':(expectedSavings!==null&&expectedSavings>0?'EXPECTED_COST_ADVANTAGE':'STRATEGIC_ACCESS_ONLY'),
   buyerMotiveCode:buyerMotivation.code,buyerMotiveReason:buyerMotivation.reason,
   sellerMotiveCode:sellerMotivation.code,sellerMotiveReason:sellerMotivation.reason,
   sellerActorClass:stateBrokerType(seller,rid,rule,emb),
   shipmentSizeBand:size.band,sellerStockExposurePct:size.percent,repeatAttempts10Turns:pattern.attempts10Turns,
   importTariffAvoidedPct:tariffPct,fineRate,attemptFineRate:penalty.attemptFineRate,seizureRate,
   scrutinyThresholds:{sellerStockExposurePct:[1,3,8,15],interpretation:'share of currently verified seller tradable stock'},
   penaltyModel:{tariffAvoidanceRate:penalty.tariffAvoidanceRate,repeatAttempts:pattern.attempts10Turns},
   brokerId:'SHADOW-BROKER:'+seller,brokerType:stateBrokerType(seller,rid,rule,emb),brokerReputation:getBrokerReputation(seller,'SHADOW-BROKER:'+seller),
   stockAuthority:'GAME_STATE_RESOURCE_INVENTORY_RESERVE_AND_WAREHOUSE'});
 }
 offers.sort((a,b)=>(b.expectedSavings??-Infinity)-(a.expectedSavings??-Infinity)||a.detectionProbability-b.detectionProbability||a.sellerCountryId.localeCompare(b.sellerCountryId));
 return{status:'READY',buyerCountryId:buyer,resourceId:rid,quantity:q,offers:offers.slice(0,24),diagnostics:{sellerCountryCount:countryKeys('resource').length,offerCount:offers.length,tariffPct,turn:turn()}};
}
function getBrokerReputation(c,brokerId){const book=bucket('trade',c).blackMarketBrokerReputation||{},row=value(book,brokerId);return clamp(num(row?.score)??50,0,100);}
function rows(c){const v=bucket('trade',c).blackMarketDeals;return Array.isArray(v)?v:[];}
function getTransits(c){const v=bucket('trade',c).blackMarketTransits;return Array.isArray(v)?v.map(x=>clone(x)):[];}
function getNetworkReports(c){const v=bucket('intelligence',c).blackMarketNetworkReports;return Array.isArray(v)?v.map(x=>clone(x)):[];}
function stateBrokerType(c,rid,rule,emb){const t=bucket('trade',c),f=bucket('foreign',c),directives=Array.isArray(t.stateSupplyDirectives)?t.stateSupplyDirectives:[],embargoes=Array.isArray(t.resourceEmbargoes)?t.resourceEmbargoes:[];
 const stateLinked=directives.some(x=>!x.resourceId||tok(x.resourceId)===tok(rid))||embargoes.some(x=>!x.resourceId||tok(x.resourceId)===tok(rid))||!!f.stateTradeNetwork;
 return stateLinked?'STATE_LINKED':'PRIVATE_BROKER';}
function buyerMotiveEvidence(c,rid,quantity){
 const resource=bucket('resource',c),finance=bucket('finance',c),tradeState=bucket('trade',c);
 const runtime=resource.demandRuntime||{},demand=value(runtime.byResource,rid)||{};
 const unmet=Math.max(0,num(demand.unmetDemand)||0),factoryInput=Math.max(0,num(demand.activeFactoryInputDemandPerDay)||0);
 const coverage=num(demand.stockCoverageDays),target=num(demand.stockCoverageTargetDays);
 const embargoes=Array.isArray(tradeState.resourceEmbargoes)?tradeState.resourceEmbargoes:[];
 const restricted=embargoes.some(x=>(!x.resourceId||tok(x.resourceId)===tok(rid))&&!/EXPIRED|REVOKED|INACTIVE/.test(String(x.status||'').toUpperCase()));
 if(restricted)return{code:'RESTRICTED_INPUT_ACCESS',reason:'The buyer country has an active resource restriction affecting the selected commodity.'};
 if(factoryInput>0)return{code:'INDUSTRIAL_INPUT_SHORTAGE',reason:'Recorded active factory input demand exists for this commodity.'};
 if(unmet>0||coverage!==null&&target!==null&&coverage<target){
  if(/coal|oil|gas|uranium|electric|energy/i.test(rid))return{code:'ENERGY_SECURITY_PRESSURE',reason:'Recorded unmet demand or low stock coverage affects a nationally important energy input.'};
  if(/food|grain|wheat|rice|fertili/i.test(rid))return{code:'FOOD_SECURITY_PRESSURE',reason:'Recorded unmet demand or low stock coverage creates food or agricultural replenishment pressure.'};
  return{code:'DOMESTIC_SUPPLY_GAP',reason:'Recorded unmet demand or stock coverage below target indicates a domestic replenishment need.'};
 }
 if(num(finance.foreignReserveCoverageDays)!==null&&num(finance.foreignReserveCoverageDays)<30)
  return{code:'FOREIGN_EXCHANGE_PRESSURE',reason:'Recorded foreign-reserve coverage is weak, increasing the value of alternative supply access.'};
 return{code:'PLAYER_SELECTED_NEED_NOT_VERIFIED',reason:'No matching shortage signal was observed; this offer was found from seller stock and policy evidence, not an assumed national shortage.'};
}
function sellerMotiveEvidence(c,rid,rule,emb){
 const t=bucket('trade',c),finance=bucket('finance',c),resource=bucket('resource',c);
 const directives=Array.isArray(t.stateSupplyDirectives)?t.stateSupplyDirectives:[];
 const activeDirective=directives.some(x=>(!x.resourceId||tok(x.resourceId)===tok(rid))&&!/EXPIRED|REVOKED|INACTIVE/.test(String(x.status||'').toUpperCase()));
 if(activeDirective||rule?.allowed===false&&['STATE_DIRECTIVE_DOMESTIC_ONLY','STATE_DIRECTIVE_EXPORT_RESTRICTED'].includes(String(rule?.reason||'')))
  return{code:'STATE_DIRECTED_EXPORT_REVENUE',reason:'An active state supply directive or export restriction is recorded for this commodity.'};
 if(stateBrokerType(c,rid,rule,emb)==='STATE_LINKED')
  return{code:'STATE_LINKED_COMMODITY_MONETIZATION',reason:'Recorded state-linked trading capacity can participate in selling exportable stock.'};
 if(num(finance.foreignReserveCoverageDays)!==null&&num(finance.foreignReserveCoverageDays)<45)
  return{code:'FOREIGN_CURRENCY_LIQUIDITY',reason:'Recorded foreign-reserve pressure creates an incentive to earn foreign currency.'};
 if(num(resource.tradeableSurplusByResource?.[rid])>0)
  return{code:'SURPLUS_MONETIZATION',reason:'Recorded tradeable surplus can be sold without using protected inventory.'};
 return{code:'PRIVATE_BROKER_MARGIN',reason:'No state mandate or export-surplus signal was observed; a private broker margin is the remaining modeled incentive.'};
}
function getDeal(dealId,c){return rows(c).find(x=>String(x.dealId)===String(dealId))||null;}
function getDeals(c){return rows(c).slice().sort((a,b)=>(num(b.createdTurn)||0)-(num(a.createdTurn)||0)).map(x=>clone(x));}
function validateAuthorization(dealId,scope={}){
 const buyer=country(scope.buyerCountryId||scope.countryId||scope.blackMarketBuyerCountryId),row=buyer?getDeal(dealId,buyer):null;if(!row)return null;
 const status=String(row.status||'').toUpperCase();if(!['REQUESTED','SENT','NEGOTIATING','ACCEPTED','IN_TRANSIT','SETTLED','SETTLED_UNDER_INVESTIGATION'].includes(status))return null;
 if(!['SETTLED','SETTLED_UNDER_INVESTIGATION'].includes(status)&&turn()>num(row.expiresTurn))return null;
 const seller=country(scope.sellerCountryId||scope.targetCountryId||scope.sourceCountryId||scope.destinationCountryId);
 if(seller&&seller!==country(row.sellerCountryId))return null;
 if(scope.resourceId&&tok(scope.resourceId)!==tok(row.resourceId))return null;
 if(num(scope.quantity)!==null&&Math.abs(num(scope.quantity)-num(row.quantity))>1e-7)return null;
 if(num(scope.unitPrice)!==null&&Math.abs(num(scope.unitPrice)-num(row.unitPrice))>1e-7)return null;
 const supplied=String(scope.blackMarketPermitId||scope.permitId||'').trim();if(!supplied||supplied!==String(row.permitId||''))return null;
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
 const negotiationId=String(input.negotiationId||'').trim(),negotiation=negotiationId?(bucket('trade',buyer).blackMarketNegotiations||[]).find(x=>String(x.negotiationId)===negotiationId):null;
 if(negotiationId&&(!negotiation||negotiation.status!=='ACCEPTED'||turn()>num(negotiation.expiresTurn)||country(negotiation.sellerCountryId)!==seller||tok(negotiation.resourceId)!==tok(rid)||Math.abs((num(negotiation.quantity)||0)-(q||0))>1e-7))return{accepted:false,reason:'BLACK_MARKET_NEGOTIATION_NOT_AUTHORIZED'};
 if(negotiation)input=Object.assign({},input,{negotiatedUnitPrice:negotiation.agreedUnitPrice,brokerId:negotiation.brokerId});
 const autonomousNetwork=input.autonomousNetwork===true&&input.source==='OMEGA_BLACK_MARKET_NPC_NETWORK';
 if(!buyer||(!autonomousNetwork&&buyer!==player()))return{accepted:false,reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
 if(!seller||seller===buyer||!rid||q===null||q<=0)return{accepted:false,reason:'BLACK_MARKET_ORDER_FIELDS_INVALID'};
 const book=getOffers(buyer,rid,q,autonomousNetwork?{networkAuthority:'OMEGA_BLACK_MARKET_NPC_NETWORK_V1'}:{});if(book.status!=='READY')return{accepted:false,reason:book.reason||'BLACK_MARKET_OFFERS_UNAVAILABLE'};
 const offer=book.offers.find(x=>x.sellerCountryId===seller&&(!input.offerId||x.offerId===input.offerId));if(!offer)return{accepted:false,reason:'BLACK_MARKET_OFFER_NOT_FOUND_OR_STALE'};
 const rel=relation(buyer,seller);if(!rel||rel.war_state===true)return{accepted:false,reason:'WAR_OR_RELATION_EVIDENCE_REQUIRED'};
 sequence++;const dealId=autonomousNetwork?'BM-NPC-'+buyer+'-'+seller+'-T'+turn()+'-'+tok(rid).slice(0,18):'BM-'+buyer+'-'+seller+'-T'+turn()+'-'+sequence+'-'+tok(rid).slice(0,18);
 const permitId='BM-PERMIT-'+random(dealId+'|'+buyer+'|'+seller).toString(16).slice(2).toUpperCase();
 const unitPrice=Number.isFinite(num(input.negotiatedUnitPrice))&&num(input.negotiatedUnitPrice)>0?Math.min(offer.unitPrice,num(input.negotiatedUnitPrice)):offer.unitPrice;
 const row={dealId,permitId,requestId:dealId+'-TRADE',buyerCountryId:buyer,sellerCountryId:seller,resourceId:rid,
  productName:offer.productName,productType:offer.productType,quantity:q,unit:offer.unit,unitPrice,currency:offer.currency,
  availableQuantityAtCreation:offer.availableQuantity,brokerId:String(input.brokerId||offer.brokerId||('SHADOW-BROKER:'+seller)),brokerType:String(input.brokerType||offer.brokerType||'PRIVATE_BROKER'),
  brokerReputationAtCreation:getBrokerReputation(seller,String(input.brokerId||offer.brokerId||('SHADOW-BROKER:'+seller))),
  autonomousNetwork,networkGenerated:autonomousNetwork,actorProfile:autonomousNetwork?clone(input.actorProfile||null):null,
  networkTactic:autonomousNetwork?String(input.networkTactic||'COVERT_BROKERING'):null,networkRationale:autonomousNetwork?String(input.networkRationale||'OBSERVED_SUPPLY_AND_DEMAND_GAP'):null,
  benchmarkUnitPrice:offer.benchmarkUnitPrice,benchmarkSource:offer.benchmarkSource,legalLandedUnitPrice:offer.legalLandedUnitPrice,
  expectedUnitCost:offer.expectedUnitCost,legalLandedTotal:offer.legalLandedTotal,
  expectedBlackMarketTotal:Number((unitPrice*q).toFixed(2)),
  expectedSavings:offer.expectedSavings===null?null:Number((offer.expectedSavings*q/offer.requestedQuantity).toFixed(2)),
  importTariffPctAtCreation:offer.importTariffPct,importTariffPct:0,importTariffAvoidedPct:offer.importTariffAvoidedPct,
  detectionProbability:offer.detectionProbability,shipmentSizeBand:offer.shipmentSizeBand,sellerStockExposurePct:offer.sellerStockExposurePct,
  repeatAttempts10Turns:offer.repeatAttempts10Turns,fineRateAtCreation:offer.fineRate,
  attemptFineRateAtCreation:offer.attemptFineRate,seizureRateAtCreation:offer.seizureRate,
  attemptedValueBuyer:offer.expectedBlackMarketTotalBuyer,attemptCurrency:offer.buyerCurrency,
  embargoedAtCreation:offer.embargoed,embargoPolicyIds:offer.embargoPolicyIds,tradeAgreementAtCreation:agreement(rel),
  sanctionsAtCreation:offer.sanctionsAtQuote,exportRestrictionReason:offer.exportRestrictionReason,exportPolicyIds:offer.exportPolicyIds,
  legalMarketAvailable:offer.legalMarketAvailable,commercialReason:offer.reason,createdTurn:turn(),expiresTurn:turn()+PERMIT_TTL,
  status:'REQUESTED',source:'OMEGA_BLACK_MARKET_SHADOW_ECONOMY',authorizationVersion:VERSION};
 const saved=dispatch('trade','OMEGA_BLACK_MARKET_RECORD_DEAL',buyer,{deal:row});if(saved?.accepted!==true)return{accepted:false,reason:saved?.reason||'BLACK_MARKET_DEAL_RECORD_FAILED'};
 if(negotiation)dispatch('trade','OMEGA_BLACK_MARKET_RECORD_NEGOTIATION',buyer,{negotiation:Object.assign({},clone(negotiation),{status:'USED',usedTurn:turn(),dealId})});
 const api=trade();if(!api||typeof api.createRequest!=='function'){updateDeal(dealId,{buyerCountryId:buyer,status:'FAILED',failureReason:'GLOBAL_TRADE_API_UNAVAILABLE'});return{accepted:false,reason:'GLOBAL_TRADE_API_UNAVAILABLE'};}
 const req=api.createRequest(buyer,{requestId:row.requestId,targetCountryId:seller,resourceId:rid,quantity:q,unitPrice:row.unitPrice,
  currency:offer.currency,importTariffPct:0,needPressure:.85,source:autonomousNetwork?'OMEGA_BLACK_MARKET_NPC_NETWORK':'OMEGA_BLACK_MARKET',blackMarketDealId:dealId,blackMarketPermitId:permitId});
 if(req?.accepted!==true){updateDeal(dealId,{buyerCountryId:buyer,status:'FAILED',failureReason:req?.reason||'TRADE_REQUEST_REJECTED'});return{accepted:false,reason:req?.reason||'TRADE_REQUEST_REJECTED',detail:req};}
 updateDeal(dealId,{buyerCountryId:buyer,status:'SENT',requestId:req.request?.requestId||row.requestId});
 emit('OMEGA_BLACK_MARKET_DEAL_CREATED',buyer,{dealId,permitId,requestId:row.requestId,resourceId:rid,sellerCountryId:seller,quantity:q,unitPrice:offer.unitPrice});
 return{accepted:true,deal:Object.assign({},row,{status:'SENT'}),tradeRequest:req.request||null};
}
function createAutonomousDeal(input={}){return createDeal(Object.assign({},input,{autonomousNetwork:true,source:'OMEGA_BLACK_MARKET_NPC_NETWORK'}));}
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
  exportPolicyIds:deal.exportPolicyIds||[],exportRestrictionReason:deal.exportRestrictionReason||null,settlementId:detail.settlementId||null,
  status:detail.stage==='POST_SETTLEMENT'?'UNDER_INVESTIGATION':'INTERCEPTED',source:'OMEGA_BLACK_MARKET_DETECTION'};
 [deal.buyerCountryId,deal.sellerCountryId].forEach(c=>recordCaseFor(c,row));
 const issuers=[];
 const citedPolicies=new Set([...(deal.embargoPolicyIds||[]),...(deal.exportPolicyIds||[])] .map(String));
 for(const c of countryKeys('trade')){
  const t=bucket('trade',c);
  for(const field of ['resourceEmbargoes','stateSupplyDirectives']){
   const list=t[field];if(!Array.isArray(list))continue;
   for(const policyRow of list){
    if(citedPolicies.has(String(policyRow?.policyId||''))&&policyRow?.issuerCountryId)issuers.push(country(policyRow.issuerCountryId));
   }
  }
 }
 [...new Set(issuers)].filter(Boolean).forEach(issuer=>dispatch('foreign','OMEGA_BLACK_MARKET_RECORD_RESPONSE',issuer,{response:{
  responseId:'BM-RESPONSE-'+deal.dealId+'-'+issuer,caseId:row.caseId,dealId:deal.dealId,targetCountryId:deal.buyerCountryId,
  sourceCountryId:deal.sellerCountryId,resourceId:deal.resourceId,severity:(deal.embargoedAtCreation||deal.sanctionsAtQuote||deal.exportRestrictionReason)?'HIGH':'MODERATE',
  responseType:'ENHANCED_INSPECTION_AND_DIPLOMATIC_PROTEST',reason:'DETECTED_BLACK_MARKET_TRADE_ATTEMPT',
  policyIds:[...citedPolicies],createdTurn:turn(),evidenceConfidence:row.evidenceConfidence,status:'ACTIVE'}}));
 emit('OMEGA_BLACK_MARKET_DETECTED',deal.buyerCountryId,row);return row;
}
const ENFORCEMENT=Object.freeze({baseFineRate:.06,embargoFineRate:.08,exportRestrictionFineRate:.04,
 baseSeizureRate:.05,embargoSeizureRate:.15,exportRestrictionSeizureRate:.10});
function collectFineHandler(cmd,ctx){
 const f=cmd?.payload?.fine||{},fineId=String(f.fineId||''),dealId=String(f.dealId||''),amountDue=num(f.amountDue);
 if(!fineId||!dealId||amountDue===null||amountDue<0)return{accepted:false,reason:'BLACK_MARKET_FINE_INVALID'};
 const deals=ctx.stateTransaction.get('trade.blackMarketDeals'),deal=Array.isArray(deals)?deals.find(x=>String(x.dealId||'')===dealId):null;
 if(!deal||String(deal.status||'').toUpperCase()!=='SETTLED_UNDER_INVESTIGATION'||!deal.settlementId)
  return{accepted:false,reason:'BLACK_MARKET_FINE_REQUIRES_CONFIRMED_INVESTIGATION'};
 if(f.settlementId&&String(f.settlementId)!==String(deal.settlementId))return{accepted:false,reason:'BLACK_MARKET_FINE_SETTLEMENT_MISMATCH'};
 const buyerValue=num(deal.buyerSettlementValue),currency=String(f.currency||deal.buyerCurrency||'').toUpperCase();
 if(buyerValue===null||buyerValue<=0||!currency||currency!==String(deal.buyerCurrency||currency))
  return{accepted:false,reason:'BLACK_MARKET_FINE_SETTLEMENT_VALUE_UNOBSERVED'};
 const expectedRate=Math.min(.18,ENFORCEMENT.baseFineRate+(deal.embargoedAtCreation?ENFORCEMENT.embargoFineRate:0)+(deal.exportRestrictionReason?ENFORCEMENT.exportRestrictionFineRate:0));
 const expectedDue=Number((buyerValue*expectedRate).toFixed(6));
 if(Math.abs(amountDue-expectedDue)>Math.max(.00001,expectedDue*.000001))
  return{accepted:false,reason:'BLACK_MARKET_FINE_AMOUNT_OUTSIDE_AUTHORIZED_PENALTY'};
 const raw=ctx.stateTransaction.get('finance.blackMarketEnforcementHistory'),arr=Array.isArray(raw)?clone(raw):[];
 const index=arr.findIndex(x=>String(x.fineId||'')===fineId),prior=index>=0?arr[index]:null;
 if(prior&&(String(prior.dealId||'')!==dealId||Math.abs((num(prior.amountDue)||0)-amountDue)>1e-7||
   String(prior.settlementId||'')!==String(deal.settlementId)))
  return{accepted:false,reason:'BLACK_MARKET_FINE_IDEMPOTENCY_COLLISION'};
 const alreadyPaid=Math.max(0,num(prior?.amountPaid)||0),outstanding=Math.max(0,amountDue-alreadyPaid);
 const forex=g.OmegaForexMonetaryEngine||g.Omega?.ForexMonetaryEngine;
 const localPerUsd=currency==='USD'?1:num(forex?.getRate?.(currency,'SIMULATION'));
 const available=num(ctx.stateTransaction.get('finance.available')),reserves=num(ctx.stateTransaction.get('finance.reserves'));
 const balance=available!==null?available:reserves,writePath=available!==null?'finance.available':(reserves!==null?'finance.reserves':null);
 const bank=g.OmegaGovernmentBanking||g.Omega?.GovernmentBanking;
 const held=writePath==='finance.available'&&typeof bank?.getReservedTreasuryUsd==='function'?
  Math.max(0,num(bank.getReservedTreasuryUsd(ctx.countryId,'BLACK_MARKET_FINE'))||0):0;
 const spendable=Math.max(0,(num(balance)||0)-held);
 const paidUsd=localPerUsd!==null&&localPerUsd>0&&writePath?Math.min(outstanding/localPerUsd,spendable):0;
 const paidLocal=Number((paidUsd*(localPerUsd||0)).toFixed(6));
 if(writePath&&paidUsd>0)ctx.stateTransaction.set(writePath,Math.max(0,balance-paidUsd));
 const totalPaid=Number((alreadyPaid+paidLocal).toFixed(6)),remaining=Number(Math.max(0,amountDue-totalPaid).toFixed(6));
 const row=Object.assign({},prior||{}, {fineId,dealId,caseId:f.caseId||prior?.caseId||null,settlementId:deal.settlementId,
  amountDue:Number(amountDue.toFixed(6)),amountPaid:totalPaid,amountOutstanding:remaining,
  amountPaidUsd:Number(((num(prior?.amountPaidUsd)||0)+paidUsd).toFixed(6)),currency,
  lastAttemptTurn:turn(),status:remaining<=1e-7?'PAID':(localPerUsd===null||localPerUsd<=0?'WAITING_FX':(writePath?'PARTIALLY_PAID':'WAITING_LIQUIDITY')),
  authority:'OMEGA_BLACK_MARKET_ENFORCEMENT'});
 if(index>=0)arr[index]=row;else arr.push(row);
 ctx.stateTransaction.set('finance.blackMarketEnforcementHistory',arr.slice(-MAX_CASES));
 return{accepted:true,fine:clone(row),paidNow:paidLocal,paidUsd:Number(paidUsd.toFixed(6)),amountOutstanding:remaining};
}
function seizeCargoHandler(cmd,ctx){
 const s=cmd?.payload?.seizure||{},seizureId=String(s.seizureId||''),dealId=String(s.dealId||''),
  settlementId=String(s.settlementId||''),rid=String(s.resourceId||'').trim(),requested=num(s.quantity),
  batchIds=Array.isArray(s.createdBatchIds)?[...new Set(s.createdBatchIds.map(String).filter(Boolean))]:[];
 if(!seizureId||!dealId||!settlementId||!rid||requested===null||requested<0||!batchIds.length)
  return{accepted:false,reason:'BLACK_MARKET_SEIZURE_INPUT_INVALID'};
 const deals=ctx.stateTransaction.get('trade.blackMarketDeals'),deal=Array.isArray(deals)?deals.find(x=>String(x.dealId||'')===dealId):null;
 if(!deal||String(deal.status||'').toUpperCase()!=='SETTLED_UNDER_INVESTIGATION'||String(deal.settlementId||'')!==settlementId)
  return{accepted:false,reason:'BLACK_MARKET_SEIZURE_REQUIRES_CONFIRMED_INVESTIGATION'};
 if(tok(deal.resourceId)!==tok(rid))return{accepted:false,reason:'BLACK_MARKET_SEIZURE_RESOURCE_MISMATCH'};
 const authorizedBatches=new Set((deal.createdBatchIds||[]).map(String));
 if(batchIds.some(id=>!authorizedBatches.has(id)))return{accepted:false,reason:'BLACK_MARKET_SEIZURE_BATCH_PROVENANCE_INVALID'};
 const authorizedRate=Math.min(.30,ENFORCEMENT.baseSeizureRate+(deal.embargoedAtCreation?ENFORCEMENT.embargoSeizureRate:0)+(deal.exportRestrictionReason?ENFORCEMENT.exportRestrictionSeizureRate:0));
 const maxSeizure=Number(((num(deal.settledQuantity)??num(deal.quantity)??0)*authorizedRate).toFixed(8));
 if(requested>maxSeizure+1e-7)return{accepted:false,reason:'BLACK_MARKET_SEIZURE_AMOUNT_EXCEEDS_AUTHORIZED_RATE',maxSeizure};
 const oldLedger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[];
 const prior=oldLedger.find(x=>String(x?.type||'')==='BLACK_MARKET_CARGO_SEIZURE'&&String(x?.seizureId||'')===seizureId);
 if(prior)return{accepted:true,duplicate:true,quantitySeized:num(prior.quantity)||0,seizure:clone(prior)};
 const inventory=clone(ctx.stateTransaction.get('resource.inventory')||{}),inventoryKey=Object.keys(inventory).find(k=>tok(k)===tok(rid));
 if(inventoryKey===undefined)return{accepted:false,reason:'BLACK_MARKET_BUYER_INVENTORY_UNOBSERVED'};
 const stockNow=num(inventory[inventoryKey]);if(stockNow===null)return{accepted:false,reason:'BLACK_MARKET_BUYER_INVENTORY_INVALID'};
 const batches=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
 const lots=clone(ctx.stateTransaction.get('resource.inventoryLots')||{});
 const raw=clone(ctx.stateTransaction.get('resource.warehouse')||{}),processed=clone(ctx.stateTransaction.get('resource.processedWarehouse')||{});
 raw.availableByResource=raw.availableByResource||{};raw.reservedByResource=raw.reservedByResource||{};
 processed.availableByResource=processed.availableByResource||{};processed.reservedByResource=processed.reservedByResource||{};
 const keyFor=(book)=>Object.keys(book||{}).find(k=>tok(k)===tok(rid));
 const rawKey=keyFor(raw.availableByResource),processedKey=keyFor(processed.availableByResource);
 let rawBudget=rawKey===undefined?0:Math.max(0,(num(raw.availableByResource[rawKey])||0)-(num(raw.reservedByResource[rawKey])||num(raw.reservedByResource[rid])||0));
 let processedBudget=processedKey===undefined?0:Math.max(0,(num(processed.availableByResource[processedKey])||0)-(num(processed.reservedByResource[processedKey])||num(processed.reservedByResource[rid])||0));
 const nonCentral=new Set(['FACTORY_INPUT','CONSUMED','TRANSFERRED_TO_FACTORY','SOLD','TRANSFERRED_OUT','DEPLETED','TRANSFERRED']);
 const inTransit=new Map();
 const network=ctx.stateTransaction.get('resource.industrialNetwork'),shipments=Array.isArray(network?.shipments)?network.shipments:[];
 shipments.forEach(row=>{if(String(row?.status||'').toUpperCase()!=='IN_TRANSIT'||!row?.batchId||tok(row.resourceId)!==tok(rid))return;
  const batchId=String(row.batchId);inTransit.set(batchId,(inTransit.get(batchId)||0)+Math.max(0,num(row.quantity)||0));});
 let remaining=Math.min(requested,Math.max(0,stockNow)),rawSeized=0,processedSeized=0;const seizedBatches=[];
 for(const batchId of batchIds){
  if(remaining<=1e-8)break;
  const batch=batches.find(x=>String(x?.batchId||'')===batchId);if(!batch||tok(batch.resourceId||batch.materialIdentity)!==tok(rid))continue;
  const proof=String(batch.transferReference||batch.provenance?.settlementId||'');if(proof!==settlementId)continue;
  const stage=String(batch.stage||'').toUpperCase(),status=String(batch.status||'').toUpperCase();
  if(nonCentral.has(stage)||['SOLD','CONSUMED','TRANSFERRED','DEPLETED','SEIZED'].includes(status))continue;
  const lot=lots[batchId];if(!lot||['SOLD','CONSUMED','TRANSFERRED','DEPLETED','SEIZED'].includes(String(lot.status||'').toUpperCase()))continue;
  const batchRemaining=Math.max(0,num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);
  const lotRemaining=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0);
  const available=Math.max(0,Math.min(batchRemaining,lotRemaining)-(inTransit.get(batchId)||0));if(available<=1e-8)continue;
  const warehouseId=String(batch.warehouseId||lot.warehouseId||'').toUpperCase();
  const isProcessed=warehouseId===String(processed.warehouseId||'').toUpperCase()||['PROCESSED','INTERMEDIATE','FINISHED','REFINED','OUTPUT'].includes(stage);
  const budget=isProcessed?processedBudget:rawBudget,take=Math.min(available,remaining,budget);if(take<=1e-8)continue;
  const batchAfter=Math.max(0,batchRemaining-take),lotAfter=Math.max(0,lotRemaining-take);
  batch.remainingQuantity=Number(batchAfter.toFixed(8));batch.lastMovementType='BLACK_MARKET_CARGO_SEIZURE';batch.lastMovementTurn=turn();
  batch.status=batchAfter<=1e-8?'SEIZED':'PARTIALLY_SEIZED';
  lot.remainingQuantity=Number(lotAfter.toFixed(8));lot.status=lotAfter<=1e-8?'SEIZED':'PARTIALLY_SEIZED';
  lot.lastMovementType='BLACK_MARKET_CARGO_SEIZURE';lot.lastMovementTurn=turn();
  if(isProcessed){processedBudget-=take;processedSeized+=take;}else{rawBudget-=take;rawSeized+=take;}
  seizedBatches.push({batchId,quantity:Number(take.toFixed(8)),warehouse:isProcessed?'PROCESSED':'RAW'});remaining-=take;
 }
 const totalSeized=Number((rawSeized+processedSeized).toFixed(8));
 if(totalSeized>0){inventory[inventoryKey]=Math.max(0,stockNow-totalSeized);
  if(rawKey!==undefined)raw.availableByResource[rawKey]=Math.max(0,(num(raw.availableByResource[rawKey])||0)-rawSeized);
  if(processedKey!==undefined)processed.availableByResource[processedKey]=Math.max(0,(num(processed.availableByResource[processedKey])||0)-processedSeized);
 }
 const row={type:'BLACK_MARKET_CARGO_SEIZURE',seizureId,dealId,caseId:s.caseId||null,settlementId,resourceId:rid,
  requestedQuantity:Number(requested.toFixed(8)),quantity:totalSeized,remainingImportedQuantity:Math.max(0,requested-totalSeized),
  batches:seizedBatches,turn:turn(),status:totalSeized<=1e-8?'NO_AVAILABLE_IMPORTED_CARGO':(totalSeized+1e-8>=requested?'SEIZED':'PARTIALLY_SEIZED'),
  authority:'OMEGA_BLACK_MARKET_ENFORCEMENT'};
 oldLedger.push(row);while(oldLedger.length>2048)oldLedger.shift();
 ctx.stateTransaction.set('resource.inventory',inventory);ctx.stateTransaction.set('resource.batches',batches);
 ctx.stateTransaction.set('resource.inventoryLots',lots);ctx.stateTransaction.set('resource.warehouse',raw);
 ctx.stateTransaction.set('resource.processedWarehouse',processed);ctx.stateTransaction.set('resource.inventoryLedger',oldLedger);
 return{accepted:true,quantitySeized:totalSeized,seizure:clone(row)};
}
function enforcePostSettlement(deal,settlement={},caseRow=null){
 const buyer=country(deal?.buyerCountryId),seller=country(deal?.sellerCountryId),settlementId=String(settlement.settlementId||deal?.settlementId||''),
  quantity=Math.max(0,num(settlement.quantity)??num(deal?.quantity)??0),createdBatchIds=settlement.createdBatchIds||deal?.createdBatchIds||[];
 const persisted=buyer?getDeal(deal?.dealId,buyer):null;
 if(!buyer||(!persisted?.autonomousNetwork&&buyer!==player())||!persisted||String(persisted.status||'').toUpperCase()!=='SETTLED_UNDER_INVESTIGATION'||
   !settlementId||String(persisted.settlementId||'')!==settlementId)
  return{accepted:false,reason:'BLACK_MARKET_ENFORCEMENT_SETTLEMENT_SCOPE_INVALID'};
 const allowedBatches=new Set((persisted.createdBatchIds||[]).map(String));
 if(!Array.isArray(createdBatchIds)||createdBatchIds.some(x=>!allowedBatches.has(String(x))))
  return{accepted:false,reason:'BLACK_MARKET_ENFORCEMENT_BATCH_PROVENANCE_INVALID'};
 const embargoed=!!persisted.embargoedAtCreation,restricted=!!persisted.exportRestrictionReason;
 const fineRate=Math.min(.18,ENFORCEMENT.baseFineRate+(embargoed?ENFORCEMENT.embargoFineRate:0)+(restricted?ENFORCEMENT.exportRestrictionFineRate:0));
 const seizureRate=Math.min(.30,ENFORCEMENT.baseSeizureRate+(embargoed?ENFORCEMENT.embargoSeizureRate:0)+(restricted?ENFORCEMENT.exportRestrictionSeizureRate:0));
 const buyerValue=num(settlement.buyerValue)??num(persisted.buyerSettlementValue),fineDue=buyerValue!==null&&buyerValue>0?Number((buyerValue*fineRate).toFixed(6)):null;
 const fine=fineDue===null?{accepted:false,reason:'BLACK_MARKET_BUYER_SETTLEMENT_VALUE_UNOBSERVED'}:
  dispatch('finance','OMEGA_BLACK_MARKET_COLLECT_FINE',buyer,{fine:{fineId:'BM-FINE-'+persisted.dealId,dealId:persisted.dealId,
   caseId:caseRow?.caseId||null,settlementId,amountDue:fineDue,currency:settlement.buyerCurrency||persisted.buyerCurrency||null}});
 const seizureTarget=Number((quantity*seizureRate).toFixed(8));
 const seizure=dispatch('resource','OMEGA_BLACK_MARKET_SEIZE_CARGO',buyer,{seizure:{seizureId:'BM-SEIZURE-'+persisted.dealId,
  dealId:persisted.dealId,caseId:caseRow?.caseId||null,settlementId,resourceId:persisted.resourceId,
  quantity:seizureTarget,createdBatchIds}});
 const fineRow=fine.fine||{},seizureRow=seizure.seizure||{};
 const result={caseId:caseRow?.caseId||null,fineCurrency:settlement.buyerCurrency||persisted.buyerCurrency||null,
  fineRate,fineDue,finePaid:num(fineRow.amountPaid)||0,fineOutstanding:num(fineRow.amountOutstanding)||0,
  fineStatus:fineRow.status||fine.reason||'NOT_RECORDED',seizureRate,seizureTargetQuantity:seizureTarget,
  seizureQuantity:num(seizure.quantitySeized)||0,seizureStatus:seizureRow.status||seizure.reason||'NOT_RECORDED',settlementId,appliedTurn:turn()};
 updateDeal(persisted.dealId,{buyerCountryId:buyer,enforcement:result});
 emit('OMEGA_BLACK_MARKET_ENFORCEMENT_APPLIED',buyer,{dealId:persisted.dealId,sellerCountryId:seller,...result});
 return{accepted:!!(fine.accepted||seizure.accepted),enforcement:result,fine,seizure};
}
function handleTradeRejection(request,decision){
 const deal=getAuthorizedDeal(request?.blackMarketDealId,request);if(!deal)return{accepted:false,reason:'BLACK_MARKET_AUTHORIZATION_INVALID'};
 if(String(decision?.reason||'')==='BLACK_MARKET_INTERCEPTED'){
  updateDeal(deal.dealId,{buyerCountryId:deal.buyerCountryId,status:'INTERCEPTED',detectionTurn:turn(),interceptionStage:decision?.stage||'PRE_DISPATCH'});
  if(deal.brokerId)adjustBrokerReputation(deal.sellerCountryId,deal.brokerId,-7,'INTERCEPTED',String(decision?.stage||'PRE')+':'+deal.dealId);
  return{accepted:true,status:'INTERCEPTED',case:detectedCase(deal,{stage:decision?.stage||'PRE_DISPATCH'})};
 }
 updateDeal(deal.dealId,{buyerCountryId:deal.buyerCountryId,status:'FAILED',failureReason:decision?.reason||'SELLER_DECLINED'});
 return{accepted:true,status:'FAILED',reason:decision?.reason||'SELLER_DECLINED'};
}
function findByRequest(requestId,buyer){return getDeals(buyer).find(x=>String(x.requestId||'')===String(requestId||''))||null;}
function onTradeEvent(type,event){
 const d=event?.detail||{},p=d.payload||d,buyer=country(p.destinationCountryId||p.countryId||d.countryId||p.buyerCountryId);
 const deal=p.blackMarketDealId?getDeal(p.blackMarketDealId,buyer):findByRequest(p.requestId,buyer);if(!deal)return;
 if(type==='OMEGA_TRADE_SETTLEMENT_COMPLETED'){
  const settlement={settlementId:p.settlementId||null,quantity:num(p.quantity)??num(deal.quantity),buyerValue:num(p.buyerValue),
   buyerCurrency:p.buyerCurrency||null,createdBatchIds:clone(p.createdBatchIds||[]),batchTransfers:clone(p.batchTransfers||[])};
  const settledDeal=Object.assign({},deal,{settlementId:settlement.settlementId,createdBatchIds:settlement.createdBatchIds,
   buyerCurrency:settlement.buyerCurrency,buyerSettlementValue:settlement.buyerValue});
  updateDeal(deal.dealId,{buyerCountryId:deal.buyerCountryId,status:'SETTLED',settlementId:settlement.settlementId,settledTurn:turn(),
   buyerCurrency:settlement.buyerCurrency,buyerSettlementValue:settlement.buyerValue,settledQuantity:settlement.quantity,
   createdBatchIds:settlement.createdBatchIds,batchTransfers:settlement.batchTransfers});
  if(deal.brokerId)adjustBrokerReputation(deal.sellerCountryId,deal.brokerId,2,'SETTLED','SETTLED:'+deal.dealId);
  if(random(deal.dealId+'|POST_SETTLEMENT_DISCOVERY|'+deal.createdTurn)<deal.detectionProbability*.18){
   updateDeal(deal.dealId,{buyerCountryId:deal.buyerCountryId,status:'SETTLED_UNDER_INVESTIGATION',investigationTurn:turn()});
   const caseRow=detectedCase(settledDeal,{stage:'POST_SETTLEMENT',settlementId:settlement.settlementId});
   enforcePostSettlement(settledDeal,settlement,caseRow);
  }
  emit('OMEGA_BLACK_MARKET_DEAL_SETTLED',deal.buyerCountryId,{dealId:deal.dealId,settlementId:settlement.settlementId,resourceId:deal.resourceId});
 }else updateDeal(deal.dealId,{buyerCountryId:deal.buyerCountryId,status:'FAILED',failureReason:p.reason||'TRADE_SETTLEMENT_FAILED',failedTurn:turn()});
}
function recordNetworkReportHandler(cmd,ctx){
 const r=cmd?.payload?.report||{},c=country(ctx.countryId),reportId=String(r.reportId||'');
 if(!reportId||country(r.playerCountryId)!==c||!r.resourceId||!r.confidence)return{accepted:false,reason:'BLACK_MARKET_NETWORK_REPORT_INVALID'};
 const raw=ctx.stateTransaction.get('intelligence.blackMarketNetworkReports'),arr=Array.isArray(raw)?clone(raw):[],prior=arr.find(x=>String(x.reportId)===reportId);
 if(prior)return{accepted:true,duplicate:true,report:clone(prior)};
 arr.push(Object.assign({},clone(r),{recordedTurn:turn(),visibility:'PLAYER_COUNTRY_INTELLIGENCE_ONLY'}));
 ctx.stateTransaction.set('intelligence.blackMarketNetworkReports',arr.slice(-MAX_CASES));return{accepted:true,report:clone(arr[arr.length-1])};
}
function recordBrokerReputationHandler(cmd,ctx){
 const p=cmd?.payload||{},brokerId=String(p.brokerId||''),delta=num(p.delta),eventId=String(p.eventId||'');
 if(!brokerId||delta===null||!eventId)return{accepted:false,reason:'BLACK_MARKET_BROKER_REPUTATION_INVALID'};
 const raw=ctx.stateTransaction.get('trade.blackMarketBrokerReputation'),book=raw&&typeof raw==='object'?clone(raw):{},prior=book[brokerId]||{brokerId,score:50,history:[]},history=Array.isArray(prior.history)?prior.history:[];
 if(history.some(x=>String(x.eventId)===eventId))return{accepted:true,duplicate:true,broker:clone(prior)};
 const score=clamp((num(prior.score)??50)+delta,0,100),entry={eventId,delta,reason:String(p.reason||'TRADE_OUTCOME'),turn:turn(),score};
 book[brokerId]={brokerId,score,lastUpdatedTurn:turn(),history:history.concat([entry]).slice(-64)};
 ctx.stateTransaction.set('trade.blackMarketBrokerReputation',book);return{accepted:true,broker:clone(book[brokerId])};
}
function adjustBrokerReputation(c,brokerId,delta,reason,eventId){return dispatch('trade','OMEGA_BLACK_MARKET_UPDATE_BROKER_REPUTATION',c,{brokerId,delta,reason,eventId});}
function recordTransitHandler(cmd,ctx){
 const r=cmd?.payload?.transit||{},c=country(ctx.countryId),transitId=String(r.transitId||'');
 if(!transitId||country(r.buyerCountryId)!==c||!country(r.sellerCountryId)||!r.dealId||!r.requestId||!Array.isArray(r.route)||r.route.length<2)return{accepted:false,reason:'BLACK_MARKET_TRANSIT_INVALID'};
 const raw=ctx.stateTransaction.get('trade.blackMarketTransits'),arr=Array.isArray(raw)?clone(raw):[],prior=arr.find(x=>String(x.transitId)===transitId);
 if(prior)return String(prior.dealId)===String(r.dealId)?{accepted:true,duplicate:true,transit:clone(prior)}:{accepted:false,reason:'BLACK_MARKET_TRANSIT_ID_COLLISION'};
 arr.push(clone(r));ctx.stateTransaction.set('trade.blackMarketTransits',arr.slice(-MAX_DEALS));return{accepted:true,transit:clone(r)};
}
function updateTransitHandler(cmd,ctx){
 const p=cmd?.payload||{},transitId=String(p.transitId||''),raw=ctx.stateTransaction.get('trade.blackMarketTransits'),arr=Array.isArray(raw)?clone(raw):[],i=arr.findIndex(x=>String(x.transitId)===transitId);
 if(i<0)return{accepted:false,reason:'BLACK_MARKET_TRANSIT_NOT_FOUND'};arr[i]=Object.assign({},arr[i],clone(p.patch||{}),{updatedTurn:turn()});
 ctx.stateTransaction.set('trade.blackMarketTransits',arr.slice(-MAX_DEALS));return{accepted:true,transit:clone(arr[i])};
}
function reserveTransitStockHandler(cmd,ctx){
 const p=cmd?.payload||{},r=p.reservation||{},c=country(ctx.countryId),reservationId=String(r.reservationId||''),quantity=num(r.quantity),resourceId=String(r.resourceId||'');
 const raw=ctx.stateTransaction.get('trade.blackMarketTransitReservations'),arr=Array.isArray(raw)?clone(raw):[],prior=arr.find(x=>String(x.reservationId)===reservationId);
 if(p.release===true){if(prior){prior.status='RELEASED';prior.releasedTurn=turn();ctx.stateTransaction.set('trade.blackMarketTransitReservations',arr.slice(-MAX_DEALS));}return{accepted:true,released:!!prior};}
 if(!reservationId||country(r.sellerCountryId)!==c||quantity===null||quantity<=0||!resourceId||!r.requestId||!r.dealId)return{accepted:false,reason:'BLACK_MARKET_STOCK_RESERVATION_INVALID'};
 if(prior)return prior.dealId===r.dealId&&Math.abs((num(prior.quantity)||0)-quantity)<1e-7?{accepted:true,duplicate:true,reservation:clone(prior)}:{accepted:false,reason:'BLACK_MARKET_RESERVATION_ID_COLLISION'};
 const inv=ctx.stateTransaction.get('resource.inventory'),res=ctx.stateTransaction.get('resource.reserves'),sr=ctx.stateTransaction.get('resource.strategicReserve'),rawWh=ctx.stateTransaction.get('resource.warehouse'),procWh=ctx.stateTransaction.get('resource.processedWarehouse');
 const k=Object.keys(inv||{}).find(x=>tok(x)===tok(resourceId)),rk=Object.keys(res||{}).find(x=>tok(x)===tok(resourceId)),sk=Object.keys(sr?.availableByResource||{}).find(x=>tok(x)===tok(resourceId)),stockNow=k===undefined?null:num(inv[k]);
 if(stockNow===null)return{accepted:false,reason:'BLACK_MARKET_STOCK_RESERVATION_INVENTORY_UNOBSERVED'};
 const protectedQty=Math.max(rk===undefined?0:num(res[rk])||0,sk===undefined?0:num(sr.availableByResource[sk])||0);
 let warehouseFree=0,warehouseObserved=false;for(const w of [rawWh,procWh]){const key=Object.keys(w?.availableByResource||{}).find(x=>tok(x)===tok(resourceId));if(key===undefined)continue;warehouseFree+=Math.max(0,(num(w.availableByResource[key])||0)-(num(w.reservedByResource?.[key])||0));warehouseObserved=true;}
 if(!warehouseObserved)return{accepted:false,reason:'BLACK_MARKET_STOCK_RESERVATION_WAREHOUSE_UNOBSERVED'};
 const locked=arr.filter(x=>x.status==='ACTIVE'&&tok(x.resourceId)===tok(resourceId)).reduce((sum,x)=>sum+Math.max(0,num(x.quantity)||0),0),free=Math.max(0,Math.min(stockNow-protectedQty,warehouseFree)-locked);
 if(free+1e-8<quantity)return{accepted:false,reason:'BLACK_MARKET_TRANSIT_STOCK_ALREADY_RESERVED',available:free,requested:quantity};
 const row=Object.assign({},clone(r),{reservationId,status:'ACTIVE',reservedTurn:turn(),authority:'OMEGA_BLACK_MARKET_TRANSIT'});arr.push(row);ctx.stateTransaction.set('trade.blackMarketTransitReservations',arr.slice(-MAX_DEALS));return{accepted:true,reservation:clone(row)};
}
function recordNegotiationHandler(cmd,ctx){
 const p=cmd?.payload||{},r=p.negotiation||{},c=country(ctx.countryId),negotiationId=String(r.negotiationId||'');
 if(!negotiationId||country(r.buyerCountryId)!==c||!r.sellerCountryId||!r.offerId||num(r.quantity)===null||num(r.quantity)<=0)return{accepted:false,reason:'BLACK_MARKET_NEGOTIATION_INVALID'};
 const raw=ctx.stateTransaction.get('trade.blackMarketNegotiations'),arr=Array.isArray(raw)?clone(raw):[],i=arr.findIndex(x=>String(x.negotiationId)===negotiationId);
 if(i>=0){if(arr[i].status==='USED')return{accepted:false,reason:'BLACK_MARKET_NEGOTIATION_ALREADY_USED'};arr[i]=Object.assign({},arr[i],clone(r),{updatedTurn:turn()});}else arr.push(Object.assign({},clone(r),{createdTurn:turn()}));
 ctx.stateTransaction.set('trade.blackMarketNegotiations',arr.slice(-MAX_DEALS));return{accepted:true,negotiation:clone(i>=0?arr[i]:arr[arr.length-1])};
}
function acceptCounterOffer(c,negotiationId){
 const row=(bucket('trade',c).blackMarketNegotiations||[]).find(x=>String(x.negotiationId)===String(negotiationId));
 if(!row||row.status!=='COUNTERED'||turn()>num(row.expiresTurn))return{accepted:false,reason:'BLACK_MARKET_COUNTER_OFFER_EXPIRED_OR_INVALID'};
 return dispatch('trade','OMEGA_BLACK_MARKET_RECORD_NEGOTIATION',c,{negotiation:Object.assign({},clone(row),{status:'ACCEPTED',agreedUnitPrice:row.counterUnitPrice,acceptedTurn:turn()})});
}
function negotiateOffer(input={}){
 const buyer=country(input.buyerCountryId||player()),seller=country(input.sellerCountryId),rid=String(input.resourceId||''),q=num(input.quantity),bid=num(input.bidUnitPrice);
 if(!buyer||buyer!==player())return{accepted:false,reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
 if(!seller||!rid||q===null||q<=0||bid===null||bid<=0)return{accepted:false,reason:'BLACK_MARKET_NEGOTIATION_FIELDS_INVALID'};
 const book=getOffers(buyer,rid,q),offer=book.status==='READY'&&book.offers.find(x=>x.offerId===input.offerId&&x.sellerCountryId===seller);
 if(!offer)return{accepted:false,reason:'BLACK_MARKET_OFFER_NOT_FOUND_OR_STALE'};
 const reputation=getBrokerReputation(seller,offer.brokerId),rel=relation(buyer,seller),trust=num(rel?.trust)??num(rel?.overall)??0,trust01=clamp(trust>1?trust/100:trust);
 const concession=clamp(.02+reputation/100*.10+trust01*.03,.02,.15),floor=Number(Math.max(offer.unitPrice*(1-concession),offer.benchmarkUnitPrice*.9).toFixed(6));
 const accepted=bid>=floor,negotiationId='BM-NEG-'+random([buyer,seller,rid,turn(),q,bid].join('|')).toString(16).slice(2).toUpperCase();
 const row={negotiationId,buyerCountryId:buyer,sellerCountryId:seller,resourceId:rid,offerId:offer.offerId,quantity:q,bidUnitPrice:bid,
  counterUnitPrice:accepted?null:floor,agreedUnitPrice:accepted?Math.min(offer.unitPrice,bid):null,status:accepted?'ACCEPTED':'COUNTERED',expiresTurn:turn()+PERMIT_TTL,
  brokerId:offer.brokerId,brokerReputation:reputation,currency:offer.currency,maxConcessionPct:concession*100,source:'PLAYER_NEGOTIATION'};
 const saved=dispatch('trade','OMEGA_BLACK_MARKET_RECORD_NEGOTIATION',buyer,{negotiation:row});if(saved?.accepted!==true)return{accepted:false,reason:saved?.reason||'BLACK_MARKET_NEGOTIATION_SAVE_FAILED'};
 return{accepted:true,decision:row.status,negotiation:row};
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
function getCases(c){const v=bucket('intelligence',c).blackMarketCases;return Array.isArray(v)?v.slice().map(x=>clone(x)):[];}
function getResponses(c){const v=bucket('foreign',c).blackMarketResponses;return Array.isArray(v)?v.slice().map(x=>clone(x)):[];}
function onTurn(){
 const selected=player();if(!selected)return;
 const servicedCountries=[selected,...countryKeys('trade').filter(c=>c!==selected&&
  getDeals(c).some(d=>d.autonomousNetwork===true))];
 let serviced=0;
 for(const c of servicedCountries){
  for(const d of getDeals(c)){
   if(serviced>=MAX_TURN_MAINTENANCE)return;
   if(['REQUESTED','SENT','NEGOTIATING','ACCEPTED'].includes(String(d.status||'').toUpperCase())&&turn()>num(d.expiresTurn)){
    updateDeal(d.dealId,{buyerCountryId:c,status:'EXPIRED',failureReason:'BLACK_MARKET_PERMIT_EXPIRED'});serviced++;
   }
  }
  const fines=bucket('finance',c).blackMarketEnforcementHistory;
  if(Array.isArray(fines))for(const f of fines){
   if(serviced>=MAX_TURN_MAINTENANCE)return;
   if(num(f.amountOutstanding)>1e-7){
    dispatch('finance','OMEGA_BLACK_MARKET_COLLECT_FINE',c,{fine:{fineId:f.fineId,dealId:f.dealId,caseId:f.caseId,
     amountDue:f.amountDue,currency:f.currency}});serviced++;
   }
  }
 }
}
function install(){
 const m=mesh();if(!m?.registerCommandHandler)return false;
 const defs=[['OMEGA_BLACK_MARKET_RECORD_DEAL','trade',recordDealHandler],['OMEGA_BLACK_MARKET_UPDATE_DEAL','trade',updateDealHandler],
  ['OMEGA_BLACK_MARKET_RECORD_CASE','intelligence',recordCaseHandler],['OMEGA_BLACK_MARKET_RECORD_RESPONSE','foreign',recordResponseHandler],
  ['OMEGA_BLACK_MARKET_COLLECT_FINE','finance',collectFineHandler],['OMEGA_BLACK_MARKET_SEIZE_CARGO','resource',seizeCargoHandler],
  ['OMEGA_BLACK_MARKET_UPDATE_BROKER_REPUTATION','trade',recordBrokerReputationHandler],['OMEGA_BLACK_MARKET_RECORD_TRANSIT','trade',recordTransitHandler],
  ['OMEGA_BLACK_MARKET_UPDATE_TRANSIT','trade',updateTransitHandler],['OMEGA_BLACK_MARKET_RESERVE_TRANSIT_STOCK','trade',reserveTransitStockHandler],
  ['OMEGA_BLACK_MARKET_RECORD_NEGOTIATION','trade',recordNegotiationHandler],['OMEGA_BLACK_MARKET_RECORD_NETWORK_REPORT','intelligence',recordNetworkReportHandler]];
 let registered=0;const errors=[];for(const [type,owner,handler]of defs)try{m.registerAction?.(type,{actionId:type,stateOwnerMinistry:owner,authority:'OMEGA_BLACK_MARKET_V1'});m.registerCommandHandler(type,owner,handler);registered++;}catch(e){errors.push({type,reason:String(e?.message||e)});}
 report={ready:registered===defs.length,registered,total:defs.length,errors};return report.ready;
}
function selectTransitHub(buyer,seller,rid){const candidates=countryKeys('foreign').filter(c=>c!==buyer&&c!==seller);let best=null;
 for(const c of candidates){const a=relation(buyer,c),b=relation(c,seller);if(!a||!b||a.war_state===true||b.war_state===true||a.sanctions===true||b.sanctions===true||routeBlocked(c,rid).blocked)continue;
  const score=(num(a.trade)??num(a.overall)??0)+(num(b.trade)??num(b.overall)??0);if(!best||score>best.score)best={countryId:c,score};}return best?.countryId||null;}
function startTransit(request={}){
 const buyer=country(request.countryId||request.buyerCountryId),deal=getAuthorizedDeal(request.blackMarketDealId,request);
 if(!deal||country(deal.buyerCountryId)!==buyer)return{accepted:false,reason:'BLACK_MARKET_TRANSIT_AUTHORIZATION_INVALID'};
 const existing=getTransits(buyer).find(x=>String(x.dealId)===String(deal.dealId)&&['IN_TRANSIT','ARRIVAL_PENDING'].includes(String(x.status)));
 if(existing)return{accepted:true,duplicate:true,transit:existing};
 const hub=selectTransitHub(deal.buyerCountryId,deal.sellerCountryId,deal.resourceId),route=[{countryId:deal.sellerCountryId,checkpoint:'EXPORT_CLEARANCE',role:'ORIGIN'}];
 if(hub)route.push({countryId:hub,checkpoint:'INTERMEDIARY_HANDOFF',role:'TRANSIT_HUB'});route.push({countryId:deal.buyerCountryId,checkpoint:'IMPORT_CLEARANCE',role:'DESTINATION'});
 const reservationId='BM-TRANSIT-RESERVATION-'+deal.dealId,api=trade();
 const reserved=dispatch('trade','OMEGA_BLACK_MARKET_RESERVE_TRANSIT_STOCK',deal.sellerCountryId,{reservation:{reservationId,dealId:deal.dealId,requestId:deal.requestId,sellerCountryId:deal.sellerCountryId,buyerCountryId:deal.buyerCountryId,resourceId:deal.resourceId,quantity:deal.quantity}});
 if(reserved?.accepted!==true)return{accepted:false,reason:reserved?.reason||'BLACK_MARKET_TRANSIT_STOCK_RESERVATION_FAILED'};
 const transit={transitId:'BM-TRANSIT-'+deal.dealId,dealId:deal.dealId,requestId:deal.requestId,buyerCountryId:deal.buyerCountryId,sellerCountryId:deal.sellerCountryId,
  resourceId:deal.resourceId,quantity:deal.quantity,permitId:deal.permitId,route,reservationId,brokerId:deal.brokerId||null,createdTurn:turn(),nextTurn:turn()+1,
  currentIndex:-1,status:'IN_TRANSIT',timeline:[],authority:'OMEGA_BLACK_MARKET_ROUTE_RUNTIME'};
 const saved=dispatch('trade','OMEGA_BLACK_MARKET_RECORD_TRANSIT',buyer,{transit});
 if(saved?.accepted!==true){dispatch('trade','OMEGA_BLACK_MARKET_RESERVE_TRANSIT_STOCK',deal.sellerCountryId,{release:true,reservation:{reservationId}});return{accepted:false,reason:saved?.reason||'BLACK_MARKET_TRANSIT_RECORD_FAILED'};}
 updateDeal(deal.dealId,{buyerCountryId:buyer,status:'IN_TRANSIT',transitId:transit.transitId,transitRoute:route,reservationId});emit('OMEGA_BLACK_MARKET_TRANSIT_STARTED',buyer,transit);return{accepted:true,transit};
}
function checkpointRisk(deal,checkpoint){const c=country(checkpoint.countryId),interior=bucket('interior',c),intel=bucket('intelligence',c),customs=num(interior.customsInspectionCoverage??interior.borderInspectionCoverage??interior.customsReadiness),surveillance=num(intel.tradeSurveillance??intel.counterSmugglingReadiness??intel.blackMarketDetection),norm=x=>x===null?0:clamp(x>1?x/100:x),base=clamp(num(deal.detectionProbability)??.1),rep=deal.brokerId?getBrokerReputation(deal.sellerCountryId,deal.brokerId):50,roleFactor=checkpoint.role==='TRANSIT_HUB'?.75:(checkpoint.role==='DESTINATION'?1.15:1);return clamp((.025+base*.33+norm(customs)*.16+norm(surveillance)*.12+(50-rep)/1000)*roleFactor,.015,.82);}
function releaseTransitReservation(transit){if(transit?.reservationId)dispatch('trade','OMEGA_BLACK_MARKET_RESERVE_TRANSIT_STOCK',transit.sellerCountryId,{release:true,reservation:{reservationId:transit.reservationId}});}
function advanceTransits(){const api=trade();if(!api||typeof api.settleBlackMarketTransit!=='function')return{status:'WAITING_FOR_GLOBAL_TRADE'};let advanced=0,intercepted=0,settled=0;
 for(const buyer of countryKeys('trade'))for(const transit of getTransits(buyer)){if(advanced>=12)return{status:'LIMITED',advanced,intercepted,settled};if(!['IN_TRANSIT','ARRIVAL_PENDING'].includes(transit.status)||turn()<num(transit.nextTurn))continue;
  const deal=getDeal(transit.dealId,buyer);if(!deal){dispatch('trade','OMEGA_BLACK_MARKET_UPDATE_TRANSIT',buyer,{transitId:transit.transitId,patch:{status:'FAILED',failureReason:'DEAL_RECORD_MISSING'}});releaseTransitReservation(transit);continue;}
  if(transit.status==='ARRIVAL_PENDING'){
   const result=api.settleBlackMarketTransit({buyerCountryId:buyer,requestId:transit.requestId,dealId:transit.dealId,permitId:transit.permitId});
   if(result?.accepted===true){dispatch('trade','OMEGA_BLACK_MARKET_UPDATE_TRANSIT',buyer,{transitId:transit.transitId,patch:{status:'SETTLED',settledTurn:turn()}});releaseTransitReservation(transit);settled++;}
   else if(['FAILED','INTERCEPTED','EXPIRED'].includes(String(getDeal(transit.dealId,buyer)?.status||'').toUpperCase())){dispatch('trade','OMEGA_BLACK_MARKET_UPDATE_TRANSIT',buyer,{transitId:transit.transitId,patch:{status:'FAILED',settlementFailure:result?.reason||'BLACK_MARKET_SETTLEMENT_FAILED'}});releaseTransitReservation(transit);}
   else dispatch('trade','OMEGA_BLACK_MARKET_UPDATE_TRANSIT',buyer,{transitId:transit.transitId,patch:{nextTurn:turn()+1,settlementFailure:result?.reason||'BLACK_MARKET_SETTLEMENT_PENDING'}});
   advanced++;continue;
  }
  const index=Math.min(transit.route.length-1,(num(transit.currentIndex)??-1)+1),checkpoint=transit.route[index],risk=checkpointRisk(deal,checkpoint),roll=random(transit.transitId+'|'+index+'|'+checkpoint.countryId),event={turn:turn(),countryId:checkpoint.countryId,checkpoint:checkpoint.checkpoint,role:checkpoint.role,risk,roll,detected:roll<risk},timeline=(transit.timeline||[]).concat([event]);advanced++;
  if(event.detected){handleTradeRejection({countryId:buyer,buyerCountryId:buyer,targetCountryId:deal.sellerCountryId,sellerCountryId:deal.sellerCountryId,resourceId:deal.resourceId,quantity:deal.quantity,unitPrice:deal.unitPrice,blackMarketDealId:deal.dealId,blackMarketPermitId:deal.permitId},{reason:'BLACK_MARKET_INTERCEPTED',stage:'IN_TRANSIT:'+checkpoint.checkpoint});
   dispatch('trade','OMEGA_BLACK_MARKET_UPDATE_TRANSIT',buyer,{transitId:transit.transitId,patch:{status:'INTERCEPTED',currentIndex:index,lastCheckpoint:checkpoint,timeline,interceptedTurn:turn()}});releaseTransitReservation(transit);intercepted++;continue;}
  if(index>=transit.route.length-1){const result=api.settleBlackMarketTransit({buyerCountryId:buyer,requestId:transit.requestId,dealId:transit.dealId,permitId:transit.permitId});
   if(result?.accepted===true){dispatch('trade','OMEGA_BLACK_MARKET_UPDATE_TRANSIT',buyer,{transitId:transit.transitId,patch:{status:'SETTLED',currentIndex:index,lastCheckpoint:checkpoint,timeline,settledTurn:turn()}});releaseTransitReservation(transit);settled++;}
   else dispatch('trade','OMEGA_BLACK_MARKET_UPDATE_TRANSIT',buyer,{transitId:transit.transitId,patch:{status:'ARRIVAL_PENDING',currentIndex:index,lastCheckpoint:checkpoint,timeline,nextTurn:turn()+1,settlementFailure:result?.reason||'SETTLEMENT_PENDING'}});
  }else dispatch('trade','OMEGA_BLACK_MARKET_UPDATE_TRANSIT',buyer,{transitId:transit.transitId,patch:{currentIndex:index,lastCheckpoint:checkpoint,timeline,nextTurn:turn()+1}});
 }
 return{status:'COMPLETED',advanced,intercepted,settled,turn:turn()};}
function diagnostics(){const c=player();return{version:VERSION,handlers:clone(report),playerCountryId:c,dealCount:c?getDeals(c).length:0,caseCount:c?getCases(c).length:0,
 globalMarketAvailable:!!market(),globalTradeAvailable:!!trade(),policyAvailable:!!policy(),transitCount:c?getTransits(c).filter(x=>x.status==='IN_TRANSIT').length:0,
 authority:'EXISTING_MARKET_TRADE_INVENTORY_FINANCE_POLICY_PLUS_ROUTE_AND_BROKER_LEDGER'};}
function init(){install();if(!g.__omegaBlackMarketHooks){g.__omegaBlackMarketHooks=true;g.addEventListener?.('OMEGA_READY',install);g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',install);
 g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',()=>{onTurn();advanceTransits();});g.addEventListener?.('OMEGA_TRADE_SETTLEMENT_COMPLETED',e=>onTradeEvent('OMEGA_TRADE_SETTLEMENT_COMPLETED',e));
 g.addEventListener?.('OMEGA_TRADE_SETTLEMENT_FAILED',e=>onTradeEvent('OMEGA_TRADE_SETTLEMENT_FAILED',e));}return diagnostics();}
const API=Object.freeze({VERSION,diagnostics,install,getOffers,createDeal,createAutonomousDeal,negotiateOffer,acceptCounterOffer,getBrokerReputation,getTransits,getNetworkReports,startTransit,advanceTransits,getDeals,getDeal,getCases,getResponses,validateAuthorization,getAuthorizedDeal,shouldIntercept,handleTradeRejection,enforcePostSettlement});
g.Omega=g.Omega||{};g.Omega.BlackMarket=API;g.OmegaBlackMarket=API;try{init();}catch(e){g.OmegaBlackMarketError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
