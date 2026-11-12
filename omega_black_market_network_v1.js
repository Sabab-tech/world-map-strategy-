/* OMEGA BLACK MARKET NPC NETWORK v1.0.0
 * Lightweight, evidence-gated world shadow-network planner.
 * Only the selected player's committed game turn advances the planner. It does
 * not run all country economies or create commodity, inventory, cash or batch data.
 */
(function(g){
'use strict';
if(g.OmegaBlackMarketNetworkV1&&g.OmegaBlackMarketNetworkV1.VERSION==='1.2.0')return;
const VERSION='1.2.0',AUTHORITY='OMEGA_BLACK_MARKET_NPC_NETWORK_V1';
const MAX_DEMAND_ROWS=14,MAX_PRODUCTS_PER_BUYER=3,MAX_WORLD_MARKET_QUERIES_PER_TURN=24,
 PRIORITY_WORLD_MARKET_QUERIES=12,MAX_PENDING_PROCESSES=6,MAX_NEW_DEALS_PER_TURN=1,COOLDOWN_TURNS=8;
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,num(v)??lo));
const token=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const clone=v=>{try{return JSON.parse(JSON.stringify(v));}catch(_){return null;}};
const state=()=>g.Game?.state||g.gameState||g.Omega?.Simulation?.world?.state||{};
const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
const market=()=>g.OmegaGlobalMarket||g.Omega?.GlobalMarket||null;
const trade=()=>g.OmegaGlobalTrade||g.Omega?.GlobalTrade||null;
const blackMarket=()=>g.OmegaBlackMarket||g.Omega?.BlackMarket||null;
const mesh=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
function country(v){
 const raw=v&&typeof v==='object'?(v.iso3||v.iso3Code||v.countryCode||v.countryId||v.code||v.id||v.name):v;
 if(raw==null)return'';
 try{const r=(g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity)?.resolveCountry?.(raw);
  const id=r?.raw?.iso3||r?.iso3||r?.iso3Code||r?.id;if(id&&/^[A-Z0-9]{2,3}$/i.test(String(id)))return String(id).toUpperCase();}catch(_){}
 const id=String(raw).trim().toUpperCase();return/^[A-Z0-9]{2,3}$/.test(id)?id:'';
}
function player(){
 const s=state(),sim=g.Omega?.Simulation;let direct=null;try{direct=sim?.getPlayerCountryId?.();}catch(_){}
 for(const v of [s.simulation?.session?.playerCountryId,s.simulation?.playerCountryId,direct,s.playerCountryId,s.playerCountryCode,
  g.Game?.playerCountryId,g.Game?.playerCountryCode,g.Game?.currentActiveCountry,g.OmegaCabinetUI?.activeCountry,g.currentActiveCountry,g.OMEGA_PLAYER_COUNTRY_ID]){
  const c=country(v);if(c&&c!=='GLOBAL'&&c!=='WORLD')return c;
 }return null;
}
function bucket(domain,c){const root=state()?.[domain],id=country(c);if(!root||typeof root!=='object'||Array.isArray(root))return{};
 const key=Object.keys(root).find(k=>country(k)===id);return key===undefined?{}:(root[key]||{});}
function countries(domain){const root=state()?.[domain];if(!root||typeof root!=='object'||Array.isArray(root))return[];
 return [...new Set(Object.keys(root).map(country).filter(x=>/^[A-Z0-9]{2,3}$/.test(x)))].sort();}
function field(map,key){if(!map||typeof map!=='object')return undefined;const k=Object.keys(map).find(x=>token(x)===token(key));return k===undefined?undefined:map[k];}
function worldCountries(){
 const out=new Set();
 for(const domain of ['resource','trade','foreign','finance','economy'])for(const id of countries(domain))out.add(id);
 try{
  const registry=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
  const rows=registry?.list?.('COUNTRY')||registry?.list?.()||
   registry?.getDataset?.('countries.json')||registry?.getDataset?.('./countries.json')||[];
  for(const row of rows){
   const id=country(row);if(id)out.add(id);
  }
 }catch(_){}
 return [...out].sort();
}
function relation(a,b){const one=field(bucket('foreign',a).relations,b)||field(bucket('trade',a).relations,b);
 return one||field(bucket('foreign',b).relations,a)||field(bucket('trade',b).relations,a)||null;}
function tariffRate(c){
 const bank=g.OmegaGovernmentBanking||g.Omega?.GovernmentBanking;
 try{const n=num(bank?.getCountryPolicy?.(c)?.importTariffPct);if(n!==null&&n>=0&&n<=100)return n;}catch(_){}
 const map=state()?.governmentBanking?.tradePolicies||{},row=field(map,c),n=num(row?.importTariffPct);
 return n!==null&&n>=0&&n<=100?n:null;
}
function policyActive(row){
 if(!row||typeof row!=='object')return false;
 const status=String(row.status||row.stage||'ACTIVE').toUpperCase();
 if(/EXPIRED|REVOKED|INACTIVE|CANCELLED|LIFTED/.test(status))return false;
 const start=num(row.startTurn??row.effectiveTurn),end=num(row.endTurn??row.expiresTurn);
 return (start===null||start<=turn())&&(end===null||turn()<=end);
}
function sanctionRows(c){
 const t=bucket('trade',c),f=bucket('foreign',c);
 return [...(Array.isArray(t.sanctions)?t.sanctions:[]),...(Array.isArray(f.sanctions)?f.sanctions:[])].filter(policyActive);
}
function sanctionContext(buyer,seller,rid){
 const relationRow=relation(buyer,seller),rows=[];
 for(const issuer of [buyer,seller]){
  for(const row of sanctionRows(issuer)){
   const target=country(row.targetCountryId||row.subjectCountryId||row.countryId||row.targetId);
   const resourceId=String(row.resourceId||row.commodityId||'');
   if(target&&(target!==(issuer===buyer?seller:buyer)))continue;
   if(resourceId&&token(resourceId)!==token(rid))continue;
   rows.push({issuerCountryId:issuer,targetCountryId:target||null,policyId:row.policyId||row.sanctionId||null,
    type:row.type||row.measure||row.scope||'SANCTIONS',secondary:row.secondarySanctions===true||/SECONDARY|EXTRATERRITORIAL/i.test(String(row.scope||row.type||''))});
  }
 }
 const bilateral=relationRow?.sanctions===true||relationRow?.embargo===true;
 if(bilateral&&!rows.length)rows.push({issuerCountryId:country(relationRow?.issuerCountryId||relationRow?.sanctioningCountryId)||null,
  targetCountryId:null,policyId:null,type:'BILATERAL_SANCTIONS_RELATION',secondary:relationRow?.secondarySanctions===true});
 return{active:rows.length>0||bilateral,rows,bilateral,secondary:rows.some(x=>x.secondary)||relationRow?.secondarySanctions===true,
  issuerCountryIds:[...new Set(rows.map(x=>x.issuerCountryId).filter(Boolean))],
  targetCountryIds:[...new Set(rows.map(x=>x.targetCountryId).filter(Boolean))]};
}
function exportExposure(seller,buyer,rid){
 const t=bucket('trade',seller),e=bucket('economy',seller),rel=relation(seller,buyer);
 const maps=[t.exportDependenceByPartner,t.exportExposureByPartner,t.exportsByDestination,t.bilateralExports,t.partnerExports,
  e.exportDependenceByPartner,e.exportExposureByPartner,e.exportsByDestination,e.exportByPartner,e.tradePartners];
 let row=null;
 for(const map of maps){
  if(Array.isArray(map)){
   row=map.find(x=>country(x.partnerCountryId||x.destinationCountryId||x.countryId||x.partnerId)===buyer&&
    (!x.resourceId||token(x.resourceId)===token(rid)));
  }else row=field(map,buyer);
  if(row!==undefined&&row!==null)break;
 }
 if(row&&typeof row==='object'&&row.byResource){
  const specific=field(row.byResource,rid);if(specific&&typeof specific==='object')row=Object.assign({},row,specific);
 }else if(row&&typeof row==='object'){
  const direct=field(row,rid);if(direct&&typeof direct==='object')row=Object.assign({},row,direct);
 }
 if(row&&Array.isArray(row.resources)){
  const specific=row.resources.find(x=>token(x.resourceId||x.id)===token(rid));if(specific)row=Object.assign({},row,specific);
 }
 const shareKeys=['shareOfSellerExports','shareOfExports','shareOfTotalExports','exportShare','destinationExportShare','partnerExportShare','percentOfExports','exportDependencyShare','dependenceShare'];
 let share=null;
 for(const key of shareKeys){const n=num(row?.[key]??rel?.[key]);if(n!==null){share=clamp(n>1?n/100:n);break;}}
 const valueKeys=['exportValue','annualExportValue','revenue','tradeValue','bilateralExportValue','value'];
 const volumeKeys=['exportQuantity','annualExportQuantity','quantity','volume','bilateralExportQuantity'];
 let valueAmount=null,volume=null;
 for(const key of valueKeys){const n=num(row?.[key]??rel?.[key]);if(n!==null&&n>=0){valueAmount=n;break;}}
 for(const key of volumeKeys){const n=num(row?.[key]??rel?.[key]);if(n!==null&&n>=0){volume=n;break;}}
 const totalExports=num(t.totalExportValue??e.totalExportValue??t.exportRevenue??e.exportRevenue);
 if(share===null&&valueAmount!==null&&totalExports!==null&&totalExports>0)share=clamp(valueAmount/totalExports);
 return{observed:share!==null||valueAmount!==null||volume!==null,share,value:valueAmount,volume,
  totalExports,source:row?'SELLER_BILATERAL_EXPORT_LEDGER':(rel?'BILATERAL_RELATIONSHIP_EVIDENCE':null),
  lastObservedTurn:num(row?.lastUpdatedTurn??row?.turn??rel?.lastTradeTurn)};
}
let sanctionIndexTurn=-1,sanctionIndex=new Map();
function buildSanctionIndex(){
 if(sanctionIndexTurn===turn())return;
 const index=new Map();
 for(const issuer of worldCountries()){
  for(const row of sanctionRows(issuer)){
   const targetId=country(row.targetCountryId||row.subjectCountryId||row.countryId||row.targetId);
   if(!targetId)continue;
   const resourceId=String(row.resourceId||row.commodityId||'');
   const entry={issuerCountryId:country(row.issuerCountryId)||issuer,policyId:row.policyId||row.sanctionId||null,
    resourceId,type:row.type||row.measure||row.scope||'SANCTIONS',
    secondary:row.secondarySanctions===true||/SECONDARY|EXTRATERRITORIAL/i.test(String(row.scope||row.type||''))};
   const rows=index.get(targetId)||[];rows.push(entry);index.set(targetId,rows);
  }
 }
 sanctionIndex=index;sanctionIndexTurn=turn();
}
function sanctionsAgainst(target,rid){
 buildSanctionIndex();
 const rows=(sanctionIndex.get(target)||[]).filter(row=>!row.resourceId||token(row.resourceId)===token(rid));
 return{active:rows.length>0,rows:rows.slice(),secondary:rows.some(x=>x.secondary),
  issuerCountryIds:[...new Set(rows.map(x=>x.issuerCountryId))],
  policyIds:[...new Set(rows.map(x=>x.policyId).filter(Boolean))]};
}
function normalMetric(v){const n=num(v);return n===null?0:clamp(n>1?n/100:n);}
function hash(v){let h=2166136261;for(const ch of String(v)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0)/4294967296;}
function policyRows(c){const t=bucket('trade',c);return{
 directives:Array.isArray(t.stateSupplyDirectives)?t.stateSupplyDirectives:[],
 embargoes:Array.isArray(t.resourceEmbargoes)?t.resourceEmbargoes:[],
 sanctions:Array.isArray(t.sanctions)?t.sanctions:[]};}
function stateActorEvidence(c,rid){
 const policy=activePolicyFor(c,rid),economy=bucket('economy',c),finance=bucket('finance',c),foreign=bucket('foreign',c);
 const evidence=[],linkEvidence=[];
 if(policy.directives.length){evidence.push('ACTIVE_STATE_SUPPLY_DIRECTIVE');linkEvidence.push('ACTIVE_STATE_SUPPLY_DIRECTIVE');}
 if(policy.embargoes.length)evidence.push('ACTIVE_RESOURCE_EMBARGO_POLICY');
 if(foreign.stateTradeNetwork===true||finance.stateTradeNetwork===true||economy.stateTradingNetwork===true){
  evidence.push('RECORDED_STATE_TRADING_NETWORK');linkEvidence.push('RECORDED_STATE_TRADING_NETWORK');
 }
 let directGovernment=false,stateOwnedEnterprise=false;
 for(const list of [economy.companies,economy.enterprises,finance.stateOwnedEnterprises]){
  if(!Array.isArray(list))continue;
  for(const row of list){
   const ownership=String(row?.ownership||row?.ownerType||row?.sector||'').toUpperCase();
   if(/MINISTRY|GOVERNMENT/.test(ownership)){directGovernment=true;linkEvidence.push('RECORDED_GOVERNMENT_ENTITY');evidence.push('RECORDED_GOVERNMENT_ENTITY');}
   else if(/STATE|PUBLIC|STATE_OWNED/.test(ownership)){stateOwnedEnterprise=true;linkEvidence.push('RECORDED_STATE_OWNED_ENTERPRISE');evidence.push('RECORDED_STATE_OWNED_ENTERPRISE');}
  }
 }
 const linked=linkEvidence.length>0;
 const role=directGovernment?'DIRECT_GOVERNMENT_ENTITY':
  (stateOwnedEnterprise?'STATE_OWNED_ENTERPRISE':
   (policy.directives.length?'STATE_POLICY_DIRECTED':
    (linked?'STATE_LINKED_TRADING_NETWORK':
     (policy.embargoes.length?'STATE_POLICY_CONTEXT_ONLY':'PRIVATE_ACTOR'))));
 const label=role==='DIRECT_GOVERNMENT_ENTITY'?'Government body':
  (role==='STATE_OWNED_ENTERPRISE'?'State-owned enterprise':
   (role==='STATE_POLICY_DIRECTED'?'State-directed trade channel':
    (role==='STATE_POLICY_CONTEXT_ONLY'?'State policy context only':
     (linked?'State-linked trading network':'Private actor'))));
 return{linked,role,label,evidence:[...new Set(evidence)].slice(0,6)};
}
function hasStateLink(c,rid){return stateActorEvidence(c,rid).linked;}
function activePolicyFor(c,rid){
 const p=policyRows(c),match=row=>policyActive(row)&&(!row.resourceId||token(row.resourceId)===token(rid));
 return{directives:p.directives.filter(match),embargoes:p.embargoes.filter(match),sanctions:p.sanctions.filter(match)};
}
function demandCandidates(c){
 const r=bucket('resource',c),runtime=r.demandRuntime||{},by=runtime.byResource&&typeof runtime.byResource==='object'?runtime.byResource:{},rows=[];
 for(const [rid,row] of Object.entries(by)){
  if(!row||typeof row!=='object')continue;
  const unmet=Math.max(0,num(row.unmetDemand)||0),perDay=Math.max(0,num(row.demandPerDay??row.demand)||0),
   coverage=num(row.stockCoverageDays),target=num(row.stockCoverageTargetDays),score=Math.max(0,num(row.procurementScore)||0),
   low=coverage!==null&&target!==null&&target>coverage,tariff=tariffRate(c),
   importDependency=num(row.importDependencyPct??row.importDependency??row.importShare??value(r.importDependencyByResource,rid)),
   incomingSanctions=sanctionsAgainst(c,rid),
   restricted=activePolicyFor(c,rid).embargoes.some(x=>country(x.targetCountryId||x.subjectCountryId)===c)||incomingSanctions.active,
   tariffDriven=tariff!==null&&tariff>=20&&perDay>0,
   importDriven=importDependency!==null&&importDependency>0&&perDay>0,
   hasCommercialDemand=tariffDriven||importDriven||restricted&&perDay>0;
  if(unmet<=1e-8&&!low&&!hasCommercialDemand)continue;
  if(perDay<=0&&unmet<=1e-8)continue;
  const gap=low?Math.max(unmet,perDay*(target-coverage)):Math.max(unmet,hasCommercialDemand?perDay:0);
  if(!(gap>0))continue;
  const stale=Math.max(0,turn()-(num(runtime.lastTurn)??turn())),freshness=stale>30?.45:(stale>10?.7:1);
  const pressure=clamp(Math.max(score,perDay>0?unmet/perDay:0,low?((target-coverage)/Math.max(target,1)):0)*freshness,0,1);
  rows.push({resourceId:rid,quantity:Number(gap.toFixed(6)),unmetDemand:unmet,demandPerDay:perDay,stockCoverageDays:coverage,
   stockCoverageTargetDays:target,procurementScore:score,pressure:Number((pressure+(tariffDriven?.12:0)+(importDriven?.10:0)+(restricted?.15:0)).toFixed(6)),
   freshness,lastDemandTurn:num(runtime.lastTurn),demandStatus:row.status||'UNKNOWN',
   factoryInputDemandPerDay:Math.max(0,num(row.activeFactoryInputDemandPerDay)||0),importDependency,tariffPct:tariff,
   commercialIntent:!low&&unmet<=1e-8?'TARIFF_OR_IMPORT_DEPENDENCY':'OBSERVED_SHORTAGE',unit:row.unit||null});
 }
 return rows.sort((a,b)=>b.pressure-a.pressure||b.quantity-a.quantity).slice(0,MAX_DEMAND_ROWS);
}
function buyerMotive(c,row,rid){
 const p=activePolicyFor(c,rid),finance=bucket('finance',c),intel=bucket('intelligence',c),tariff=row.tariffPct??tariffRate(c),
  incomingSanctions=sanctionsAgainst(c,rid),incomingEmbargo=p.embargoes.some(x=>country(x.targetCountryId||x.subjectCountryId)===c);
 if(incomingSanctions.active||incomingEmbargo||p.embargoes.length)return{code:'SANCTIONS_OR_RESTRICTED_MARKET_ACCESS',reason:'This country has an active incoming sanction or recorded import-embargo policy restricting access to this input.'};
 if(row.factoryInputDemandPerDay>0)return{code:'INDUSTRIAL_INPUT_SHORTAGE',reason:'Recorded active factory input demand exceeds currently fulfilled supply.'};
 if(num(tariff)!==null&&num(tariff)>=20)return{code:'TARIFF_AVOIDANCE_PRESSURE',reason:'The recorded import tariff is '+num(tariff).toFixed(1)+'%; a private buyer may compare the tariff saving with detection and penalty exposure.'};
 if(num(row.importDependency)!==null&&num(row.importDependency)>0)return{code:'IMPORT_DEPENDENCY',reason:'The country has recorded import dependence for this commodity and seeks an alternative source.'};
 if(/coal|oil|gas|uranium|electric|energy/i.test(rid))return{code:'ENERGY_SECURITY_GAP',reason:'Observed national resource coverage is below its demand target.'};
 if(/food|grain|wheat|rice|fertili/i.test(rid))return{code:'FOOD_AND_AGRICULTURE_STABILITY',reason:'Observed domestic demand and stock coverage indicate replenishment pressure.'};
 if(num(finance.foreignReserveCoverageDays)!==null&&num(finance.foreignReserveCoverageDays)<30)return{code:'FOREIGN_EXCHANGE_PRESSURE',reason:'Recorded foreign-reserve coverage is weak; an intermediary or non-cash commercial structure may be attractive.'};
 if(num(intel.strategicProcurementPriority)!==null&&num(intel.strategicProcurementPriority)>.6)return{code:'STRATEGIC_PROCUREMENT',reason:'Recorded strategic procurement priority increases the value of otherwise unavailable supply.'};
 return{code:'DOMESTIC_SUPPLY_GAP',reason:'Recorded unmet demand or low stock coverage creates a replenishment incentive.'};
}
function sellerMotive(c,rid,offer,shock=null){
 const p=activePolicyFor(c,rid),finance=bucket('finance',c),resource=bucket('resource',c);
 if(shock?.active&&shock.exposure?.share!==null&&shock.exposure?.share>=.25)
  return{code:'LOST_MAJOR_EXPORT_CUSTOMER',reason:countryName(shock.exposure.partnerCountryId)+' accounted for '+Math.round(shock.exposure.share*100)+'% of the seller’s recorded exports; sanctions or a trade prohibition now threaten this customer revenue.'};
 if(shock?.active&&shock.exposure?.observed)
  return{code:'SANCTIONED_CUSTOMER_ACCESS_LOSS',reason:'A recorded sanction or export restriction blocks an observed customer relationship; the exporter has an incentive to seek replacement demand.'};
 if(p.directives.length)return{code:'STATE_DIRECTED_EXPORT_REVENUE',reason:'An observed state supply directive or export restriction creates an incentive to preserve export revenue through alternate commercial channels.'};
 if(hasStateLink(c,rid))return{code:'STATE_LINKED_COMMODITY_MONETIZATION',reason:'Observed state-linked trading capacity can monetize exportable stock while obscuring direct counterparty exposure.'};
 if(num(finance.foreignReserveCoverageDays)!==null&&num(finance.foreignReserveCoverageDays)<45)return{code:'HARD_CURRENCY_LIQUIDITY',reason:'Recorded foreign-reserve pressure makes hard-currency commodity sales more attractive.'};
 if(num(resource.tradeableSurplusByResource?.[rid])>0)return{code:'SURPLUS_MONETIZATION',reason:'Observed exportable surplus can be sold without drawing protected reserves.'};
 return{code:'PRIVATE_BROKER_MARGIN',reason:'A private broker can earn a spread by serving a buyer with limited legal access.'};
}
function chooseTactic(buyer,seller,rid,offer,buyerState,sellerState,shock=null){
 const sellerPolicy=activePolicyFor(seller,rid),buyerPolicy=activePolicyFor(buyer,rid),r=relation(buyer,seller);
 if(shock?.active&&shock.exposure?.share>=.25&&shock.sanctions?.issuerCountryIds?.length)
  return{code:'LOST_PRIMARY_EXPORT_MARKET_REDIRECTION',intermediaryHubs:0,intermediaryHubCountryIds:[],level:'EXPORT_SHOCK',
   sanctioningCountryIds:shock.sanctions.issuerCountryIds};
 const hubCandidates=countries('foreign').filter(c=>c!==buyer&&c!==seller).filter(c=>{
  const x=relation(buyer,c),y=relation(c,seller);return!!x&&!!y&&x.war_state!==true&&y.war_state!==true&&x.sanctions!==true&&y.sanctions!==true;
 });
 const hubIds=hubCandidates.slice(0,3);
 if(buyerState&&sellerState&&(buyerPolicy.embargoes.length||r?.sanctions===true))
  return{code:'STATE_TO_STATE_COVERT_PROCUREMENT',intermediaryHubs:hubCandidates.length,intermediaryHubCountryIds:hubIds,level:'STATE_LINKED'};
 if(sellerState&&(sellerPolicy.directives.length||sellerPolicy.embargoes.length))
  return{code:'STATE_DIRECTED_INTERMEDIARY_NETWORK',intermediaryHubs:hubCandidates.length,intermediaryHubCountryIds:hubIds,level:'STATE_LINKED'};
 if(hubCandidates.length)return{code:'THIRD_COUNTRY_BROKERAGE',intermediaryHubs:hubCandidates.length,intermediaryHubCountryIds:hubIds,level:'BROKERED'};
 return{code:offer.exportRestrictionReason?'RESTRICTED_EXPORT_BROKERAGE':'PRIVATE_SHADOW_BROKERAGE',intermediaryHubs:0,intermediaryHubCountryIds:[],level:'PRIVATE'};
}
function priorDeal(c,seller,rid){
 const rows=blackMarket()?.getDeals?.(c)||[];
 return rows.find(x=>x.sellerCountryId===seller&&token(x.resourceId)===token(rid)&&
  (turn()-(num(x.createdTurn)??turn())<COOLDOWN_TURNS||['REQUESTED','SENT','NEGOTIATING','ACCEPTED','IN_TRANSIT'].includes(String(x.status||'').toUpperCase())));
}
function legalRouteReason(offer,shock=null){
 if(offer.legalMarketAvailable===false)return offer.embargoed?'IMPORT_EMBARGO_BLOCKS_VERIFIED_SUPPLY':
  (offer.exportRestrictionReason?'STATE_EXPORT_RESTRICTION_BLOCKS_VERIFIED_SUPPLY':
   (offer.sanctionsAtQuote?'BILATERAL_SANCTIONS_BLOCKS_VERIFIED_SUPPLY':'NO_VERIFIED_GENERAL_MARKET_SUPPLIER'));
 if(num(offer.expectedSavings)>0)return'TARIFF_AND_LANDED_COST_ARBITRAGE';
 if(shock?.active&&shock.exposure?.share>=.25)return'SANCTIONED_MAJOR_CUSTOMER_EXPORT_REDIRECTION';
 return null;
}
function makeCandidate(buyer,row){
 const bm=blackMarket(),catalog=market()?.productCatalog?.()||[],product=catalog.find(x=>token(x.id||x.resourceId||x.productId)===token(row.resourceId));
 if(!product||!['RAW_RESOURCE','FACTORY_PRODUCT','FOOD_PRODUCT'].includes(String(product.productType||'').toUpperCase()))return null;
 const quantity=row.quantity,book=bm?.getOffers?.(buyer,row.resourceId,quantity,{networkAuthority:AUTHORITY});
 if(!book||book.status!=='READY'||!Array.isArray(book.offers))return null;
 const candidates=[];
 for(const offer of book.offers){
  const seller=country(offer.sellerCountryId);if(!seller||seller===buyer||seller===player()||priorDeal(buyer,seller,row.resourceId))continue;
  const buyerState=hasStateLink(buyer,row.resourceId),sellerState=hasStateLink(seller,row.resourceId);
  const buyerSanctions=sanctionsAgainst(buyer,row.resourceId),sellerSanctions=sanctionsAgainst(seller,row.resourceId);
  const directExposure=Object.assign({partnerCountryId:buyer},exportExposure(seller,buyer,row.resourceId));
  const sellerSanctionExposures=sellerSanctions.issuerCountryIds.map(issuer=>Object.assign({partnerCountryId:issuer},exportExposure(seller,issuer,row.resourceId)));
  sellerSanctionExposures.sort((a,b)=>(b.share??-1)-(a.share??-1)||(b.value??-1)-(a.value??-1));
  const sellerExposure=sellerSanctionExposures[0]||null;
  const buyerTargetShock=buyerSanctions.active&&directExposure.observed;
  const sellerTargetShock=sellerSanctions.active&&!!sellerExposure?.observed;
  const exposure=buyerTargetShock?directExposure:(sellerTargetShock?sellerExposure:null);
  const sanctions=buyerTargetShock?buyerSanctions:(sellerTargetShock?sellerSanctions:{active:false,rows:[],secondary:false,issuerCountryIds:[]});
  const shock={active:!!exposure,exposure,sanctions,
   sanctionTargetCountryId:buyerTargetShock?buyer:(sellerTargetShock?seller:null),
   sanctionTargetType:buyerTargetShock?'SANCTIONED_EXPORT_CUSTOMER':(sellerTargetShock?'SANCTIONED_EXPORTER':'NONE')};
  const reason=legalRouteReason(offer,shock);if(!reason)continue;
  const bmReason=buyerMotive(buyer,row,row.resourceId),smReason=sellerMotive(seller,row.resourceId,offer,shock);
  const tactic=chooseTactic(buyer,seller,row.resourceId,offer,buyerState,sellerState,shock);
  const score=row.pressure*100+(offer.expectedSavings!==null?Math.max(-20,Math.min(30,num(offer.expectedSavings)||0)):0)+
   (offer.embargoed?18:0)+(offer.exportRestrictionReason?12:0)+(buyerState?8:0)+(sellerState?8:0)+
   (shock.active?24+(exposure.share||0)*40:0)-(offer.detectionProbability||0)*35;
  candidates.push({buyer,seller,row,offer,score,buyerState,sellerState,bmReason,smReason,tactic,legalReason:reason,sellerExportShock:shock});
 }
 candidates.sort((a,b)=>b.score-a.score||a.offer.detectionProbability-b.offer.detectionProbability||a.seller.localeCompare(b.seller));
 return candidates[0]||null;
}
function governmentLabel(candidate){
 if(candidate.buyerState&&candidate.sellerState)return'BOTH_GOVERNMENTS_OR_STATE_LINKED_ENTITIES';
 if(candidate.buyerState)return'BUYER_STATE_LINKED';
 if(candidate.sellerState)return'SELLER_STATE_LINKED';
 return'PRIVATE_ACTORS_ONLY';
}
function countryName(value){
 const id=country(value);if(!id)return'Unknown country';
 try{const row=(g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity)?.resolveCountry?.(id);
  return String(row?.raw?.name||row?.name||row?.surface||id);}catch(_){return id;}
}
function companyEvidence(c){
 const economy=bucket('economy',c),finance=bucket('finance',c),rows=[...(Array.isArray(economy.companies)?economy.companies:[]),
  ...(Array.isArray(economy.enterprises)?economy.enterprises:[]),...(Array.isArray(finance.stateOwnedEnterprises)?finance.stateOwnedEnterprises:[])];
 return rows.slice(0,24).map(x=>({companyId:String(x.companyId||x.id||x.code||'').trim()||null,
  name:String(x.name||x.legalName||x.companyName||'').trim()||null,
  ownership:String(x.ownership||x.ownerType||x.sector||'PRIVATE').toUpperCase(),
  exportShare:num(x.exportShare??x.shareOfExports),
  importDependencyPct:num(x.importDependencyPct??x.importDependency),
  inputDemandPerDay:num(x.inputDemandPerDay??x.resourceDemandPerDay),
  sector:String(x.sector||x.industry||'').toUpperCase(),resourceId:x.resourceId||null})).filter(x=>x.companyId||x.name);
}
function selectCompanyActor(c,rid,side,stateLinked){
 const rows=companyEvidence(c).filter(x=>!x.resourceId||token(x.resourceId)===token(rid));
 rows.sort((a,b)=>side==='SELLER'?(b.exportShare??-1)-(a.exportShare??-1):
  (b.inputDemandPerDay??-1)-(a.inputDemandPerDay??-1));
 const company=rows[0]||null;
 if(company)return{actorType:/STATE|PUBLIC|GOVERNMENT|MINISTRY/.test(company.ownership)?'STATE_OWNED_COMPANY':'PRIVATE_COMPANY',
  companyId:company.companyId,companyName:company.name,ownership:company.ownership,
  exportShare:company.exportShare,importDependencyPct:company.importDependencyPct,
  inputDemandPerDay:company.inputDemandPerDay,sector:company.sector,resourceId:company.resourceId};
 return{actorType:stateLinked?(side==='BUYER'?'STATE_PROCUREMENT_ENTITY':'STATE_LINKED_EXPORTER'):
  (side==='BUYER'?'PRIVATE_IMPORTER_OR_COMPANY':'PRIVATE_EXPORTER_OR_COMPANY'),
  companyId:null,companyName:null,ownership:stateLinked?'STATE_LINKED':'PRIVATE',
  actorIdentityStatus:'NO_MATCHING_COMPANY_RECORD',resourceId:rid};
}
function actorProfile(candidate){
 const buyerEvidence=stateActorEvidence(candidate.buyer,candidate.row.resourceId);
 const sellerEvidence=stateActorEvidence(candidate.seller,candidate.row.resourceId);
 const buyerActor=buyerEvidence.linked?'STATE_PROCUREMENT_OR_STATE_OWNED_ENTERPRISE':'PRIVATE_IMPORTER_OR_BROKER';
 const sellerActor=sellerEvidence.linked?'STATE_TRADING_NETWORK_OR_STATE_LINKED_EXPORTER':'PRIVATE_EXPORTER_OR_BROKER';
 const buyerCommercialActor=selectCompanyActor(candidate.buyer,candidate.row.resourceId,'BUYER',buyerEvidence.linked);
 const sellerCommercialActor=selectCompanyActor(candidate.seller,candidate.row.resourceId,'SELLER',sellerEvidence.linked);
 const shock=candidate.sellerExportShock||null;
 return{buyerActor,sellerActor,buyerCommercialActor,sellerCommercialActor,governmentInvolvement:governmentLabel(candidate),
  buyerGovernmentRole:buyerEvidence.role,buyerGovernmentLabel:buyerEvidence.label,buyerStateEvidence:buyerEvidence.evidence,
  sellerGovernmentRole:sellerEvidence.role,sellerGovernmentLabel:sellerEvidence.label,sellerStateEvidence:sellerEvidence.evidence,
  buyerCompanies:companyEvidence(candidate.buyer),sellerCompanies:companyEvidence(candidate.seller),
  buyerMotive:candidate.bmReason.code,buyerReason:candidate.bmReason.reason,
  sellerMotive:candidate.smReason.code,sellerReason:candidate.smReason.reason,
  stateLinkedBuyer:candidate.buyerState,stateLinkedSeller:candidate.sellerState,
  sellerExportShock:shock?{active:!!shock.active,mainCustomerCountryId:shock.exposure.partnerCountryId,
   exportShare:shock.exposure.share,exportValue:shock.exposure.value,exportQuantity:shock.exposure.volume,
   sanctionTargetCountryId:shock.sanctionTargetCountryId,sanctionTargetType:shock.sanctionTargetType,
   evidenceSource:shock.exposure.source,sanctioningCountryIds:shock.sanctions.issuerCountryIds,
   secondarySanctionsRisk:shock.sanctions.secondary}:null,
  tariffAvoidance:{importTariffPct:candidate.row.tariffPct??null,importDependency:candidate.row.importDependency??null},
  tactic:candidate.tactic.code,intermediaryHubsAvailable:candidate.tactic.intermediaryHubs,
  potentialIntermediaryCountryIds:candidate.tactic.intermediaryHubCountryIds||[]};
}
function dispatch(owner,type,c,p){
 const m=mesh();if(!m?.dispatchCommand)return{accepted:false,reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
 try{const r=m.dispatchCommand(owner,type,c,clone(p||{}),{turn:turn(),commandType:type,correlationId:p?.report?.reportId||p?.dealId||null});
  return r&&['APPLIED','FAILED','REJECTED'].includes(String(r.status||''))&&r.result?r.result:r;
 }catch(e){return{accepted:false,reason:String(e?.message||e)};}
}
function intelStrength(c){
 const i=bucket('intelligence',c),inside=bucket('interior',c),defence=bucket('defense',c);
 return clamp(.45*normalMetric(i.tradeSurveillance??i.counterSmugglingReadiness??i.blackMarketDetection)+
  .25*normalMetric(i.foreignIntelligenceCapability??i.collectionCapability)+
  .2*normalMetric(inside.customsInspectionCoverage??inside.borderInspectionCoverage??inside.customsReadiness)+
  .1*normalMetric(defence.maritimeAwareness??defence.borderSecurityReadiness));
}
function maybeDiscover(candidate,deal,route=[]){
 const pc=player();if(!pc)return null;
 const involved=pc===candidate.buyer||pc===candidate.seller||route.some(x=>country(x.countryId)===pc);
 const strength=intelStrength(pc),chance=clamp(involved?.42+strength*.52:.008+strength*.12,.005,.96);
 if(hash(deal.dealId+'|PLAYER-INTEL|'+pc)>=chance)return null;
 const confidence=clamp(.38+strength*.48+(candidate.offer.detectionProbability||0)*.12,.35,.97);
 const level=confidence>=.78?'HIGH':(confidence>=.58?'MEDIUM':'LOW');
 const stateAttribution=confidence>=.78&&(candidate.buyerState||candidate.sellerState);
 const report={reportId:'BM-INTEL-'+deal.dealId+'-'+pc,playerCountryId:pc,dealId:level==='HIGH'?deal.dealId:null,
  resourceId:candidate.row.resourceId,productName:candidate.offer.productName||candidate.row.resourceId,
  buyerCountryId:level==='LOW'?null:candidate.buyer,sellerCountryId:level==='LOW'?null:candidate.seller,
  actorProfile:level==='HIGH'?actorProfile(candidate):null,brokerId:level==='HIGH'?deal.brokerId:null,
  governmentInvolvement:stateAttribution?governmentLabel(candidate):'NOT_ESTABLISHED',
  confidence,level,source:involved?'DIRECT_COUNTERPARTY_OR_ROUTE_EXPOSURE':'COUNTERINTELLIGENCE_AND_TRADE_SURVEILLANCE',
  evidence:['OBSERVED_DEMAND_OR_STOCK_SIGNAL','COVERT_TRADE_ACTIVITY',
   ...(candidate.sellerExportShock?.active?['SANCTIONED_MAJOR_CUSTOMER_EXPORT_EXPOSURE']:[]),
   ...(candidate.row.tariffPct>=20?['HIGH_IMPORT_TARIFF_INCENTIVE']:[])],turn:turn(),
  summary:level==='LOW'?'An unusual covert supply channel is suspected; the counterparties are not yet identified.':
   (level==='MEDIUM'?'A covert shipment corridor and at least one participating country have been identified.':
    'A transaction-linked covert network has been identified with broker and possible state-sponsor evidence.'),
  motiveAssessment:level==='LOW'?null:{
   buyerMotive:candidate.bmReason.code,sellerMotive:candidate.smReason.code,
   buyerReason:level==='HIGH'?candidate.bmReason.reason:null,
   sellerReason:level==='HIGH'?candidate.smReason.reason:null,
   stateRoleAttribution:stateAttribution?governmentLabel(candidate):'NOT_ESTABLISHED'},
  otherCountriesKnow:involved?'PARTICIPANTS_ONLY':'NOT_OBSERVED_BY_OTHER_COUNTRIES'};
 const saved=dispatch('intelligence','OMEGA_BLACK_MARKET_RECORD_NETWORK_REPORT',pc,{report});
 return saved?.accepted===true?report:null;
}
function processPending(){
 const api=trade(),bm=blackMarket();if(!api||typeof api.processBlackMarketNetworkRequest!=='function')return{processed:0};
 let processed=0;
 for(const buyer of countries('trade'))for(const deal of (bm?.getDeals?.(buyer)||[])){
  if(processed>=MAX_PENDING_PROCESSES)return{processed};
  if(deal.autonomousNetwork!==true||!['SENT','ACCEPTED'].includes(String(deal.status||'').toUpperCase()))continue;
  const result=api.processBlackMarketNetworkRequest({buyerCountryId:buyer,requestId:deal.requestId,dealId:deal.dealId,permitId:deal.permitId});
  if(result?.accepted)processed++;
 }
 return{processed};
}
function runTurn(){
 const pc=player();if(!pc)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED',turn:turn()};
 if(g.__omegaBlackMarketNetworkProcessedTurn===turn())return{status:'ALREADY_PROCESSED',turn:turn()};
 g.__omegaBlackMarketNetworkProcessedTurn=turn();
 const pending=processPending(),world=worldCountries().filter(c=>c!==pc),candidates=[],potentialRows=[];
 let buyerCountriesScanned=0,buyerCountriesWithEvidence=0,offerSearches=0,activeBuyersSkipped=0;
 for(const buyer of world){
  buyerCountriesScanned++;
  const existing=blackMarket()?.getDeals?.(buyer)||[];
  const active=existing.some(x=>x.autonomousNetwork===true&&['REQUESTED','SENT','ACCEPTED','IN_TRANSIT'].includes(String(x.status||'').toUpperCase()));
  if(active){activeBuyersSkipped++;continue;}
  const demand=demandCandidates(buyer);
  if(!demand.length)continue;
  buyerCountriesWithEvidence++;
  const selected=[demand[0]],pool=demand.slice(1);
  if(pool.length){
   const start=(turn()*2+Math.floor(hash(buyer)*pool.length))%pool.length;
   for(let i=0;i<Math.min(MAX_PRODUCTS_PER_BUYER-1,pool.length);i++){
    const row=pool[(start+i)%pool.length];
    if(!selected.some(x=>token(x.resourceId)===token(row.resourceId)))selected.push(row);
   }
  }
  for(const row of selected){
   const priority=row.pressure*100+(row.commercialIntent==='TARIFF_OR_IMPORT_DEPENDENCY'?8:0)+
    (row.factoryInputDemandPerDay>0?5:0)+(row.importDependency>0?3:0);
   potentialRows.push({buyer,row,priority});
  }
 }
 potentialRows.sort((a,b)=>b.priority-a.priority||a.buyer.localeCompare(b.buyer)||token(a.row.resourceId).localeCompare(token(b.row.resourceId)));
 const chosen=[],priorityBuyerKeys=new Set(),chosenKeys=new Set();
 for(const item of potentialRows){
  if(chosen.length>=PRIORITY_WORLD_MARKET_QUERIES)break;
  if(priorityBuyerKeys.has(item.buyer))continue;
  chosen.push(item);priorityBuyerKeys.add(item.buyer);chosenKeys.add(item.buyer+'::'+token(item.row.resourceId));
 }
 const rest=potentialRows.filter(item=>!chosenKeys.has(item.buyer+'::'+token(item.row.resourceId)));
 if(rest.length){
  const count=Math.min(MAX_WORLD_MARKET_QUERIES_PER_TURN-chosen.length,rest.length);
  const offset=(turn()*count)%rest.length;
  for(let i=0;i<count;i++)chosen.push(rest[(offset+i)%rest.length]);
 }
 const bestByBuyer=new Map();
 for(const item of chosen){
  offerSearches++;
  const candidate=makeCandidate(item.buyer,item.row);
  if(!candidate)continue;
  const prior=bestByBuyer.get(item.buyer);
  if(!prior||candidate.score>prior.score)bestByBuyer.set(item.buyer,candidate);
 }
 candidates.push(...bestByBuyer.values());
 candidates.sort((a,b)=>b.score-a.score||a.buyer.localeCompare(b.buyer)||a.seller.localeCompare(b.seller));
 let created=null,discovery=null;
 for(const c of candidates){
  if(created)break;
  const bm=blackMarket(),profile=actorProfile(c),reason=[c.legalReason,c.bmReason.code,c.smReason.code].join(' | ');
  const result=bm?.createAutonomousDeal?.({buyerCountryId:c.buyer,sellerCountryId:c.seller,resourceId:c.row.resourceId,
   quantity:c.row.quantity,offerId:c.offer.offerId,brokerId:c.sellerState?('STATE-NETWORK:'+c.seller):c.offer.brokerId,brokerType:c.sellerState?'STATE_LINKED':c.offer.brokerType,
   actorProfile:profile,networkTactic:c.tactic.code,networkRationale:reason});
  if(!result?.accepted)continue;
  created=result.deal||result;
  if(profile.sellerExportShock?.active&&profile.sellerExportShock.exportShare>=.15){
   dispatch('trade','OMEGA_BLACK_MARKET_RECORD_EXPORT_SHOCK',c.seller,{shock:{
    shockId:'BM-EXPORT-SHOCK-'+created.dealId,sellerCountryId:c.seller,mainCustomerCountryId:profile.sellerExportShock.mainCustomerCountryId,
    sanctionTargetCountryId:profile.sellerExportShock.sanctionTargetCountryId,
    sanctionTargetType:profile.sellerExportShock.sanctionTargetType,
    resourceId:c.row.resourceId,exportShare:profile.sellerExportShock.exportShare,
    exportValueAtRisk:profile.sellerExportShock.exportValue,exportQuantityAtRisk:profile.sellerExportShock.exportQuantity,
    sanctioningCountryIds:profile.sellerExportShock.sanctioningCountryIds||[],secondarySanctionsRisk:profile.sellerExportShock.secondarySanctionsRisk,
    dealId:created.dealId,evidenceSource:profile.sellerExportShock.evidenceSource,createdTurn:turn(),
    rationale:'A major customer has imposed or is affected by a recorded sanction; seller is seeking an alternative channel.'}});
  }
  const process=trade()?.processBlackMarketNetworkRequest?.({buyerCountryId:c.buyer,requestId:created.requestId,dealId:created.dealId,permitId:created.permitId});
  const latest=bm.getDeal(created.dealId,c.buyer)||created;
  const route=latest.transitRoute||[];
  discovery=maybeDiscover(c,latest,route);
  created={deal:latest,process:process||null,candidate:{buyer:c.buyer,seller:c.seller,resourceId:c.row.resourceId,quantity:c.row.quantity,
   score:c.score,governmentInvolvement:profile.governmentInvolvement,tactic:c.tactic.code,buyerMotive:c.bmReason.code,sellerMotive:c.smReason.code,
   sellerExportShock:profile.sellerExportShock,tariffAvoidance:profile.tariffAvoidance},intelReport:discovery};
 }
 return{status:'COMPLETED',turn:turn(),playerCountryId:pc,pendingProcessed:pending.processed||0,
  worldCountryCount:world.length,buyerCountriesScanned,buyerCountriesWithEvidence,activeBuyersSkipped,
  potentialOpportunityCount:potentialRows.length,offerSearches,marketQueryBudget:MAX_WORLD_MARKET_QUERIES_PER_TURN,
  candidateCount:candidates.length,newDeal:created,limitPerTurn:MAX_NEW_DEALS_PER_TURN,
  worldSimulation:'ALL_COUNTRIES_EVIDENCE_SCAN_BOUNDED_ROTATING_MARKET_QUERY'};
}
function diagnostics(){const pc=player(),world=worldCountries();return{version:VERSION,ready:!!blackMarket()&&!!trade(),playerCountryId:pc,turn:turn(),
  worldCountryCount:world.length,economicCountryCount:countries('resource').length,
  marketQueryBudget:MAX_WORLD_MARKET_QUERIES_PER_TURN,priorityQuerySlots:PRIORITY_WORLD_MARKET_QUERIES,
  playerReports:pc?(blackMarket()?.getNetworkReports?.(pc)||[]).length:0,planner:'ALL_COUNTRY_EVIDENCE_SCAN_BOUNDED_ROTATING_MARKET_QUERY_ONE_NPC_DEAL_PER_PLAYER_TURN',
  authorities:['CANONICAL_COUNTRY_REGISTRY','OBSERVED_DEMAND_AND_IMPORT_DEPENDENCE','BILATERAL_EXPORT_EXPOSURE','SANCTION_AND_TARIFF_POLICY',
   'GLOBAL_MARKET_STOCK','GLOBAL_TRADE_AND_PLAYER_COUNTRY_INTELLIGENCE']};}
function init(){if(!blackMarket()||!trade())return false;if(g.__omegaBlackMarketNetworkHooks)return true;
 g.__omegaBlackMarketNetworkHooks=true;g.addEventListener?.('OMEGA_READY',()=>{if(!blackMarket()||!trade())return;});
 g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',runTurn);return true;}
const API=Object.freeze({VERSION,AUTHORITY,diagnostics,runTurn,demandCandidates,hasStateLink,stateActorEvidence,actorProfile,maybeDiscover,
 MAX_WORLD_MARKET_QUERIES_PER_TURN,PRIORITY_WORLD_MARKET_QUERIES,worldCountries,sanctionContext,sanctionsAgainst,exportExposure,tariffRate});
g.Omega=g.Omega||{};g.Omega.BlackMarketNetworkV1=API;g.OmegaBlackMarketNetworkV1=API;try{init();}catch(e){g.OmegaBlackMarketNetworkError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
