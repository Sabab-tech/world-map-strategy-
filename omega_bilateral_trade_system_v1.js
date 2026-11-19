/* OMEGA BILATERAL TRADE SYSTEM v1.0.0
 * Separate bilateral agreement/intelligence channel alongside Open Market.
 * Reuses the existing country state, Ministry State Transaction mesh, Global Trade
 * settlement and internationalShipmentLedger. No parallel scheduler or market is added.
 */
(function(g){
'use strict';
const VERSION='1.0.0',MAX_AGREEMENTS=256,MAX_REPORTS=48,MAX_RESOURCES=64,MAX_NPC_REVIEWS_PER_COUNTRY_TURN=2;
const processedNpcTurns=new Set();
const COMMANDS={SAVE_REPORT:'OMEGA_BILATERAL_TRADE_SAVE_INTELLIGENCE',UPSERT:'OMEGA_BILATERAL_TRADE_UPSERT_AGREEMENT'};
let installReport={ready:false,registered:0,total:2,errors:[],actionWarnings:[]};
const clone=(v,seen)=>{if(v===null||typeof v!=='object')return v;const s=seen||new WeakMap();if(s.has(v))return s.get(v);if(Array.isArray(v)){const a=[];s.set(v,a);v.forEach(x=>a.push(clone(x,s)));return a;}const o={};s.set(v,o);Object.keys(v).forEach(k=>{if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k],s);});return o;};
const id=v=>String(v==null?'':v).trim().toUpperCase();
const token=v=>String(v==null?'':v).normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const state=()=>g.Game&&g.Game.state||g.gameState||{};
const turn=()=>{const s=state(),sim=s.simulation||{},clock=g.Omega&&g.Omega.Simulation&&g.Omega.Simulation.clock;return num(sim.turn!==undefined?sim.turn:s.turn!==undefined?s.turn:s.simulationTurn!==undefined?s.simulationTurn:clock&&clock.turn)??0;};
const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega&&g.Omega.CanonicalIdentity||null;
function canonical(v){const raw=String(v==null?'':v).trim();if(!raw)return'';try{const r=registry()&&registry().resolveCountry&&registry().resolveCountry(raw);if(r&&r.id)return id(r.id);}catch(_){}return id(raw);}
function bucket(domain,c){const root=state()[domain],cid=canonical(c);if(!root||typeof root!=='object'||!cid)return null;if(Object.prototype.hasOwnProperty.call(root,cid))return root[cid];const key=Object.keys(root).find(k=>canonical(k)===cid);return key===undefined?null:root[key];}
function path(root,path){let v=root;for(const part of String(path||'').split('.')){if(v==null||!Object.prototype.hasOwnProperty.call(Object(v),part))return undefined;v=v[part];}return v;}
const value=(c,d,p)=>path(bucket(d,c),p);
function recordValue(c,d,p,rid){const row=value(c,d,p);if(!row||typeof row!=='object')return null;const key=Object.keys(row).find(k=>token(k)===token(rid));return key===undefined?null:num(row[key]);}
const trade=()=>g.OmegaGlobalTrade||g.Omega&&g.Omega.GlobalTrade||null;
const market=()=>g.OmegaGlobalMarket||g.Omega&&g.Omega.GlobalMarket||null;
const mesh=()=>g.Omega&&g.Omega.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
function relation(a,b){const left=canonical(a),right=canonical(b),roots=[bucket('foreign',left)?.relations,bucket('relations',left),bucket('foreign',right)?.relations,bucket('relations',right)];for(let i=0;i<roots.length;i++){const r=roots[i];if(!r||typeof r!=='object')continue;const k=Object.keys(r).find(x=>canonical(x)===(i<2?right:left));if(k!==undefined)return clone(r[k]);}return null;}
function relationScore(r){if(!r)return null;if(r.war_state===true||r.sanctions===true)return 0;const a=['overall','trade','trust','political'].map(k=>num(r[k])).filter(x=>x!==null).map(x=>x>1?x/100:x);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;}
function field(v,unit,status,source,note){return{value:v===undefined?null:v,unit:unit||null,status:status||(v===null||v===undefined?'UNKNOWN':'KNOWN'),source:source||null,note:note||null,asOfTurn:turn()};}
function numberFrom(rows){for(const r of rows){const n=num(r&&r.value);if(n!==null)return{value:n,source:r.source||null};}return null;}
function resourceIds(c){const out=new Set();['inventory','production','consumption'].forEach(k=>{const r=value(c,'resource',k);if(r&&typeof r==='object')Object.keys(r).forEach(x=>{if(token(x))out.add(token(x));});});const d=value(c,'resource','demandRuntime.byResource');if(d&&typeof d==='object')Object.keys(d).forEach(x=>{if(token(x))out.add(token(x));});return[...out].sort().slice(0,MAX_RESOURCES);}
function shipmentLedger(c){const rows=value(c,'trade','internationalShipmentLedger');return Array.isArray(rows)?rows:null;}
function inbound(c,rid){const rows=shipmentLedger(c);if(!rows)return field(null,'declared resource unit','UNKNOWN','trade.internationalShipmentLedger','Legacy save has no shipment ledger; absence is not interpreted as zero.');const seen=new Map();let invalid=0;rows.forEach(r=>{if(!r||canonical(r.destinationCountryId)!==canonical(c)||token(r.resourceId)!==rid)return;const sid=String(r.shipmentId||'').trim(),q=num(r.quantity);if(!sid||q===null||q<0){invalid++;return;}if(seen.has(sid)&&Math.abs(seen.get(sid)-q)>1e-7)invalid++;else seen.set(sid,q);});if(invalid)return field(null,'declared resource unit','UNKNOWN','trade.internationalShipmentLedger','Invalid or conflicting shipment identity prevents a complete quantity.');let qty=0,count=0;seen.forEach((q,sid)=>{const r=rows.find(x=>x&&String(x.shipmentId)===sid&&canonical(x.destinationCountryId)===canonical(c)&&token(x.resourceId)===rid);const status=id(r.status),arrival=id(r.arrivalStatus);if(status==='IN_TRANSIT'||status==='DISPATCHED'||(status!=='ARRIVED'&&status!=='SETTLED'&&arrival!=='RECEIVED'&&arrival!=='ARRIVED'&&id(r.settlementStatus)!=='SETTLED')){qty+=q;count++;}});return field(Number(qty.toFixed(6)),'declared resource unit','KNOWN','trade.internationalShipmentLedger','Unique in-transit inbound shipments: '+count+'.');}
function reliability(c,rid){const rows=shipmentLedger(c);if(!rows)return field(null,'ratio','UNKNOWN','trade.internationalShipmentLedger','Shipment evidence unavailable.');const outcomes=new Map();rows.filter(r=>r&&canonical(r.originCountryId)===canonical(c)&&token(r.resourceId)===rid).forEach(r=>{const sid=String(r.shipmentId||''),s=id(r.status);if(!sid)return;if(['ARRIVED','SETTLED','FAILED','CANCELLED','LOST'].includes(s)){const v=['ARRIVED','SETTLED'].includes(s)?'OK':'FAILED',old=outcomes.get(sid);outcomes.set(sid,old&&old!==v?'CONFLICT':v);}});const a=[...outcomes.values()];if(!a.length||a.includes('CONFLICT'))return field(null,'ratio','UNKNOWN','trade.internationalShipmentLedger','No complete, conflict-free terminal shipment outcomes.');const done=a.filter(x=>x==='OK'||x==='FAILED');return field(Number((done.filter(x=>x==='OK').length/done.length).toFixed(4)),'ratio','KNOWN','trade.internationalShipmentLedger','Based on '+done.length+' terminal shipment outcomes.');}
function routeCapacity(c,rid){const raw=value(c,'trade','routeCapacity');if(raw&&typeof raw==='object'){const k=Object.keys(raw).find(x=>token(x)===rid);if(k!==undefined&&num(raw[k])!==null)return field(num(raw[k]),'declared capacity','KNOWN','trade.routeCapacity.'+k);}if(num(raw)!==null)return field(num(raw),'declared capacity','KNOWN','trade.routeCapacity');return field(null,'declared capacity','UNKNOWN','trade.routeCapacity','No comparable route-capacity record.');}
function priceEvidence(c,rid){
 try{
  const engine=market(),quote=engine?.quote?.(rid),price=num(engine?.executableLocalPrice?.(canonical(c),rid));
  if(String(quote?.status||'').toUpperCase()==='CLEARED'&&price!==null&&price>0)
   return field(price,'local currency / declared unit','KNOWN','OmegaGlobalMarket.executableLocalPrice','Price comes from a cleared executable market book.');
 }catch(_){}
 return field(null,'local currency / declared unit','UNKNOWN','OmegaGlobalMarket executable price authority','No cleared executable quote is available. Reference-only prices are not used for contract approval.');
}
function indicativePriceEvidence(c,rid){
 try{
  const engine=market(),quote=engine?.quote?.(rid);
  if(String(quote?.status||'').toUpperCase()!=='CLEARED'){
   const price=num(engine?.localPrice?.(canonical(c),rid));
   if(price!==null&&price>=0)return field(price,'local currency / declared unit','ESTIMATED','OmegaGlobalMarket.referencePrice','Indicative reference only; not an executable offer and not suitable for contract acceptance.');
  }
 }catch(_){}
 return field(null,'local currency / declared unit','UNKNOWN','OmegaGlobalMarket reference price','No indicative reference price is available.');
}
function strategicImportance(c,rid,demandField,production,consumption){
 const sources=[['resource.strategicImportanceByResource',value(c,'resource','strategicImportanceByResource')],['resource.strategicPriorityByResource',value(c,'resource','strategicPriorityByResource')],['economy.strategicResourceImportance',value(c,'economy','strategicResourceImportance')]];
 for(const [source,row] of sources){if(!row||typeof row!=='object')continue;const key=Object.keys(row).find(k=>token(k)===rid);if(key!==undefined&&row[key]!==null&&row[key]!==undefined&&row[key]!=='')return field(row[key],'national priority classification','KNOWN',source+'.'+key);}
 if(demandField&&demandField.status!=='UNKNOWN'&&num(demandField.value)>0&&production!==null&&consumption!==null&&production<consumption)return field('IMPORT_DEPENDENCY_SIGNAL','classification','ESTIMATED','resource.production + resource.consumption + import demand','This flags import dependence only; it is not an assigned strategic rank or national-security score.');
 return field(null,'classification','UNKNOWN','national strategic-priority evidence','No explicit country/resource priority record exists; no arbitrary importance score is assigned.');
}
function strategicRisk(relationRow,route,demandField,surplus,reliabilityField){
 const signals=[];
 if(relationRow&&(relationRow.war_state===true||relationRow.sanctions===true))signals.push('WAR_OR_SANCTIONS');
 if(route&&route.status==='KNOWN'&&num(route.value)===0)signals.push('NO_RECORDED_ROUTE_CAPACITY');
 if(demandField&&num(demandField.value)>0&&surplus&&num(surplus.value)===0)signals.push('DOMESTIC_SUPPLY_SHORTFALL');
 if(reliabilityField&&reliabilityField.status==='KNOWN'&&num(reliabilityField.value)<1)signals.push('RECORDED_FAILED_SHIPMENT_OUTCOMES');
 return signals.length?field(signals,'evidence flags','ESTIMATED','foreign.relations + supply/demand + shipment outcomes','Evidence flags, not a probabilistic risk score.'):field(null,'evidence flags','UNKNOWN','country strategic-risk evidence','No active risk signal is evidenced; absence of a signal is not proof of zero risk.');
}
function resourceIntelligence(requester,target,rid){
 const prod=recordValue(target,'resource','production',rid),cons=recordValue(target,'resource','consumption',rid),stock=recordValue(target,'resource','inventory',rid);
 const demand=value(target,'resource','demandRuntime.byResource'),dk=demand&&Object.keys(demand).find(k=>token(k)===rid),dr=dk?demand[dk]:null;
 const explicit=numberFrom([{value:dr&&dr.importDemandPerDay,source:'resource.demandRuntime.byResource.'+rid+'.importDemandPerDay'},{value:dr&&dr.unmetDemandPerDay,source:'resource.demandRuntime.byResource.'+rid+'.unmetDemandPerDay'},{value:dr&&dr.pendingImportQuantity,source:'resource.demandRuntime.byResource.'+rid+'.pendingImportQuantity'}]);
 const demandField=explicit?field(explicit.value,'declared unit / day','KNOWN',explicit.source):prod!==null&&cons!==null?field(Math.max(0,cons-prod),'declared unit / day','ESTIMATED','resource.production + resource.consumption','max(0, consumption − production); excludes inventory change, arrivals, exports and existing contracts.'):field(null,'declared unit / day','UNKNOWN','resource demand evidence','No complete explicit demand or production/consumption pair.');
 const surplus=prod!==null&&cons!==null?field(Math.max(0,prod-cons),'declared unit / day','ESTIMATED','resource.production + resource.consumption','Production minus consumption before reserves, stock targets, existing contracts and route limits.'):field(null,'declared unit / day','UNKNOWN','resource supply/demand evidence','Both production and consumption are required.');
 let alternatives=[];try{
  const engine=market(),rows=engine?.suppliers?.(rid,12,requester)||[],tradeEngine=trade();
  if(Array.isArray(rows))alternatives=rows.slice(0,12).map(r=>{
   const countryId=canonical(r.countryId||r.sellerCountryId),localPrice=num(engine?.executableLocalPrice?.(countryId,rid)),quote=engine?.quote?.(rid);
   return{countryId,price:localPrice,currency:id(tradeEngine?.currencyOf?.(countryId))||null,
    availableQuantity:num(r.availableQuantity??r.quantity??r.available),
    priceEvidenceStatus:localPrice!==null&&localPrice>0&&String(quote?.status||'').toUpperCase()==='CLEARED'?'KNOWN':'UNKNOWN',
    evidenceStatus:r.evidenceStatus||r.status||'PROVIDER_RESULT'};
  });
 }catch(_){}
 const route=routeCapacity(target,rid),supplier=reliability(target,rid),relationRow=relation(requester,target);
 return{resourceId:rid,domesticProduction:field(prod,'declared unit / day',prod===null?'UNKNOWN':'KNOWN',prod===null?'resource.production':'resource.production.'+rid),domesticConsumption:field(cons,'declared unit / day',cons===null?'UNKNOWN':'KNOWN',cons===null?'resource.consumption':'resource.consumption.'+rid),currentInventory:field(stock,'declared resource unit',stock===null?'UNKNOWN':'KNOWN',stock===null?'resource.inventory':'resource.inventory.'+rid),importDemand:demandField,potentialExportableSurplus:surplus,inboundInTransit:inbound(target,rid),expectedLocalPrice:priceEvidence(target,rid),indicativeReferencePrice:indicativePriceEvidence(target,rid),routeCapacity:route,supplierReliability:supplier,strategicImportance:strategicImportance(target,rid,demandField,prod,cons),strategicRisk:strategicRisk(relationRow,route,demandField,surplus,supplier),alternativeSuppliers:alternatives,evidenceRule:'KNOWN_ESTIMATED_UNKNOWN_NO_MISSING_VALUE_IS_ZERO'};
}
function fnv1a(s){let h=0x811c9dc5;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,0x01000193);}return('00000000'+(h>>>0).toString(16)).slice(-8);}
function agreementRows(c){const rows=value(c,'trade','bilateralAgreementLedger');return Array.isArray(rows)?rows:[];}
function pairAgreements(a,b){const seen=new Set();return agreementRows(a).concat(agreementRows(b)).filter(r=>{if(!r||!r.agreementId||seen.has(String(r.agreementId)))return false;seen.add(String(r.agreementId));return[canonical(r.buyerCountryId),canonical(r.sellerCountryId)].includes(canonical(a))&&[canonical(r.buyerCountryId),canonical(r.sellerCountryId)].includes(canonical(b));}).map(row=>clone(row));}
function buildMarketIntelligence(requesterValue,targetValue,options){
 const requester=canonical(requesterValue),target=canonical(targetValue);if(!/^[A-Z]{3}$/.test(requester)||!/^[A-Z]{3}$/.test(target)||requester===target)return{ok:false,reason:'TWO_DISTINCT_CANONICAL_COUNTRIES_REQUIRED'};
 const opts=options||{},provided=(Array.isArray(opts.resourceIds)?opts.resourceIds:[]).concat(opts.resourceId?[opts.resourceId]:[]),resources=[...new Set((provided.length?provided:resourceIds(target)).map(token).filter(Boolean))].slice(0,MAX_RESOURCES);
 if(!resources.length)return{ok:false,reason:'NO_COMMODITY_IDENTITIES_AVAILABLE'};
 const r=relation(requester,target),score=relationScore(r),t=trade();let targetCurrency=null,buyerCurrency=null,fx=null;
 try{targetCurrency=t?.currencyOf?.(target)||null;buyerCurrency=t?.currencyOf?.(requester)||null;fx=num(t?.fxRate?.(requester,target));}catch(_){}
 const requesterAvailable=num(value(requester,'finance','available')),requesterTreasuryReserve=num(value(requester,'finance','reserves')),
  targetAvailable=num(value(target,'finance','available')),targetTreasuryReserve=num(value(target,'finance','reserves')),
  requesterFxReserve=num(value(requester,'economy','reserves')),targetFxReserve=num(value(target,'economy','reserves')),
  active=pairAgreements(requester,target).filter(x=>x.status==='ACTIVE');
 const requesterCash=requesterAvailable??requesterTreasuryReserve,targetCash=targetAvailable??targetTreasuryReserve;
 const treatyMap=value(requester,'foreign','treaties'),treatyKey=treatyMap&&Object.keys(treatyMap).find(k=>canonical(k)===target),legacyTreaty=treatyKey?clone(treatyMap[treatyKey]):null;
 const existingAgreements=active.map(x=>Object.assign({source:'BILATERAL_TRADE_LEDGER'},x));
 if(legacyTreaty&&/SIGNED|RATIFIED|ACTIVE|IMPLEMENTED/.test(id(legacyTreaty.status||legacyTreaty.stage)))existingAgreements.push({source:'FOREIGN_TREATY_LEDGER',status:legacyTreaty.status||legacyTreaty.stage,treatyType:legacyTreaty.treatyType||null,terms:clone(legacyTreaty.terms||{})});
 const report={schemaVersion:1,reportId:'BTR-MI-'+turn()+'-'+requester+'-'+target+'-'+Date.now(),generatedAt:new Date().toISOString(),generatedTurn:turn(),requesterCountryId:requester,targetCountryId:target,dataVersion:null,evidencePolicy:'KNOWN_ESTIMATED_UNKNOWN',countryOverview:{
  currency:field(targetCurrency,'ISO 4217',targetCurrency?'KNOWN':'UNKNOWN','Finance / FX currency authority'),
  foreignCurrencyPaymentCapacity:field(targetCash,targetCurrency||'local currency',targetCash===null?'UNKNOWN':'KNOWN',targetAvailable!==null?'finance.available':targetTreasuryReserve!==null?'finance.reserves':'Finance Treasury','Counterparty Treasury liquidity in its own currency; not the same as USD FX reserves or freely transferable foreign currency.'),
  requesterTreasuryLiquidity:field(requesterCash,buyerCurrency||'local currency',requesterCash===null?'UNKNOWN':'KNOWN',requesterAvailable!==null?'requester finance.available':requesterTreasuryReserve!==null?'requester finance.reserves':'requester Finance Treasury','Requesting country Treasury liquidity in its own currency; this is not FX reserves.'),
  targetTreasuryLiquidity:field(targetCash,targetCurrency||'local currency',targetCash===null?'UNKNOWN':'KNOWN',targetAvailable!==null?'target finance.available':targetTreasuryReserve!==null?'target finance.reserves':'target Finance Treasury','Counterparty Treasury liquidity in its own currency; this is not FX reserves.'),
  requesterForeignExchangeReservesUsd:field(requesterFxReserve,'USD',requesterFxReserve===null?'UNKNOWN':'KNOWN','requester economy.reserves / FX monetary profile','FX reserve balance is kept separate from Treasury cash; underlying baseline may be modeled or legacy source data.'),
  targetForeignExchangeReservesUsd:field(targetFxReserve,'USD',targetFxReserve===null?'UNKNOWN':'KNOWN','target economy.reserves / FX monetary profile','FX reserve balance is kept separate from Treasury cash; underlying baseline may be modeled or legacy source data.'),
  buyerCurrency:field(buyerCurrency,'ISO 4217',buyerCurrency?'KNOWN':'UNKNOWN','Finance / FX currency authority'),
  bilateralFxRate:field(fx,'buyer currency per seller currency',fx===null?'UNKNOWN':'KNOWN','OmegaGlobalTrade.fxRate'),
  diplomaticRelation:field(r,'record',r?'KNOWN':'UNKNOWN','foreign.relations'),
  diplomaticRelationScore:field(score,'0–1',score===null?'UNKNOWN':'KNOWN','foreign.relations.overall/trade/trust/political'),
  warOrSanctionsRisk:field(r?(r.war_state===true||r.sanctions===true?'PROHIBITIVE':'NO_RECORDED_WAR_OR_SANCTIONS'):null,'risk status',r?'KNOWN':'UNKNOWN','foreign.relations.war_state/sanctions'),
  existingBilateralAgreements:field(existingAgreements,'agreements','KNOWN','trade.bilateralAgreementLedger + foreign.treaties'),
  agreementCount:field(existingAgreements.length,'agreements','KNOWN','trade.bilateralAgreementLedger + foreign.treaties')
 },resources:resources.map(rid=>resourceIntelligence(requester,target,rid))};
 const fingerprint={requester,target,turn:turn(),overview:report.countryOverview,resources:report.resources};report.dataVersion='turn-'+turn()+'-'+fnv1a(JSON.stringify(fingerprint));return{ok:true,report};
}
function dispatch(country,type,payload){const m=mesh();if(!m?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};try{return m.dispatchCommand('trade',type,canonical(country),clone(payload||{}),{turn:turn(),commandType:type,correlationId:payload?.report?.reportId||payload?.agreement?.agreementId||null});}catch(e){return{status:'FAILED',reason:String(e?.message||e)};}}
function saveReportHandler(cmd,ctx){const report=clone(cmd?.payload?.report),owner=canonical(ctx?.countryId);if(!report?.reportId||owner!==canonical(report.requesterCountryId))return{accepted:false,reason:'INTELLIGENCE_REPORT_SCOPE_INVALID'};const raw=ctx.stateTransaction.get('trade.marketIntelligenceReports'),rows=Array.isArray(raw)?clone(raw):[],prior=rows.find(x=>x&&x.reportId===report.reportId);if(prior)return prior.dataVersion===report.dataVersion?{accepted:true,duplicate:true}:{accepted:false,reason:'INTELLIGENCE_REPORT_ID_CONFLICT'};rows.push(report);ctx.stateTransaction.set('trade.marketIntelligenceReports',rows.slice(-MAX_REPORTS));return{accepted:true,reportId:report.reportId,dataVersion:report.dataVersion};}
function upsertHandler(cmd,ctx){const a=clone(cmd?.payload?.agreement),owner=canonical(ctx?.countryId),parties=a&&[canonical(a.buyerCountryId),canonical(a.sellerCountryId)];if(!a?.agreementId||!/^[A-Z]{3}$/.test(owner)||!parties?.includes(owner)||parties[0]===parties[1]||!token(a.resourceId)||num(a.terms?.quantityPerShipment)===null||num(a.terms?.unitPrice)===null)return{accepted:false,reason:'BILATERAL_AGREEMENT_RECORD_INVALID_OR_OUT_OF_SCOPE'};const raw=ctx.stateTransaction.get('trade.bilateralAgreementLedger'),rows=Array.isArray(raw)?clone(raw):[],i=rows.findIndex(x=>x&&String(x.agreementId)===String(a.agreementId));if(i>=0){const p=rows[i];if(canonical(p.buyerCountryId)!==parties[0]||canonical(p.sellerCountryId)!==parties[1]||token(p.resourceId)!==token(a.resourceId))return{accepted:false,reason:'BILATERAL_AGREEMENT_IDENTITY_COLLISION'};rows[i]=Object.assign({},p,a,{createdAt:p.createdAt||a.createdAt,createdTurn:num(p.createdTurn)??num(a.createdTurn)});}else rows.push(a);ctx.stateTransaction.set('trade.bilateralAgreementLedger',rows.slice(-MAX_AGREEMENTS));return{accepted:true,agreementId:a.agreementId,status:a.status};}
function installHandlers(){const m=mesh();try{if(m?.instance&&Array.isArray(m.instance.ids)&&!m.instance.ids.length)m.configure?.({});}catch(e){installReport={ready:false,registered:0,total:2,errors:[String(e?.message||e)],actionWarnings:[]};return false;}if(!m?.registerCommandHandler){installReport={ready:false,registered:0,total:2,errors:['MINISTRY_COMMAND_REGISTRY_UNAVAILABLE'],actionWarnings:[]};return false;}const defs=[[COMMANDS.SAVE_REPORT,saveReportHandler],[COMMANDS.UPSERT,upsertHandler]],r={ready:false,registered:0,total:defs.length,errors:[],actionWarnings:[]};defs.forEach(([type,handler])=>{try{m.registerAction?.(type,{actionId:type,stateOwnerMinistry:'trade',authority:'OMEGA_BILATERAL_TRADE'});}catch(e){r.actionWarnings.push({type,reason:String(e?.message||e)});}try{m.registerCommandHandler(type,'trade',handler);r.registered++;}catch(e){r.errors.push({type,reason:String(e?.message||e)});}});r.ready=r.registered===r.total;installReport=r;return r.ready;}
function requestMarketIntelligence(requester,target,options){if(!canActFor(requester))return{ok:false,reason:'PLAYER_COUNTRY_SCOPE_ONLY'};const built=buildMarketIntelligence(requester,target,options||{});if(!built.ok)return built;const result=dispatch(requester,COMMANDS.SAVE_REPORT,{report:built.report});if(result?.status==='APPLIED'&&result.result?.accepted)return{ok:true,report:built.report,persisted:true};return{ok:false,reason:result?.reason||result?.result?.reason||'INTELLIGENCE_REPORT_PERSIST_FAILED',detail:result};}
function getReport(country,reportId){const rows=value(country,'trade','marketIntelligenceReports');const row=Array.isArray(rows)?rows.find(x=>x&&String(x.reportId)===String(reportId)):null;return row?clone(row):null;}
function normalizeTerms(input,base){
 const v=Object.assign({},base||{},input||{}),rid=token(v.resourceId),q=num(v.quantityPerShipment),p=num(v.unitPrice),
   paymentTerms=String(v.paymentTerms||'SETTLEMENT_ON_DELIVERY').trim().toUpperCase();
 if(!rid||q===null||q<=0||p===null||p<0)return{ok:false,reason:'RESOURCE_QUANTITY_AND_NON_NEGATIVE_UNIT_PRICE_REQUIRED'};
 if(paymentTerms!=='SETTLEMENT_ON_DELIVERY')return{ok:false,reason:'PAYMENT_TERMS_NOT_SUPPORTED_BY_CURRENT_SETTLEMENT_AUTHORITY'};
 const m=market();
 if(m?.describeProduct){try{const product=m.describeProduct(rid);if(!product||product.available===false||product.status==='UNKNOWN')return{ok:false,reason:'PRODUCT_NOT_IN_CANONICAL_MARKET_CATALOG'};}catch(_){}}
 return{ok:true,terms:{resourceId:rid,quantityPerShipment:q,unitPrice:p,currency:id(v.currency)||null,unit:String(v.unit||'').trim()||null,
  durationTurns:Math.max(1,Math.min(10000,Math.floor(num(v.durationTurns)||100))),paymentTerms,
  deliveryMode:String(v.deliveryMode||'').trim().toUpperCase()||null,routeId:String(v.routeId||'').trim()||null,
  conditions:String(v.conditions||'').trim().slice(0,1000)||null}};
}
function mirrorAgreement(a){const results=[];for(const c of [canonical(a.buyerCountryId),canonical(a.sellerCountryId)]){const r=dispatch(c,COMMANDS.UPSERT,{agreement:a});results.push({countryId:c,accepted:r?.status==='APPLIED'&&r.result?.accepted===true,status:r?.status||'UNKNOWN',reason:r?.reason||r?.result?.reason||null});}return{accepted:results.every(x=>x.accepted),results};}
function createAgreementOffer(offererValue,counterpartyValue,direction,termsInput){installHandlers();const offerer=canonical(offererValue),counterparty=canonical(counterpartyValue);if(!/^[A-Z]{3}$/.test(offerer)||!/^[A-Z]{3}$/.test(counterparty)||offerer===counterparty)return{accepted:false,reason:'TWO_DISTINCT_CANONICAL_COUNTRIES_REQUIRED'};if(!canActFor(offerer))return{accepted:false,reason:'PLAYER_COUNTRY_SCOPE_ONLY'};const normalized=normalizeTerms(termsInput);if(!normalized.ok)return{accepted:false,reason:normalized.reason};const side=id(direction||'IMPORT');if(!['IMPORT','EXPORT'].includes(side))return{accepted:false,reason:'DIRECTION_MUST_BE_IMPORT_OR_EXPORT'};const buyer=side==='IMPORT'?offerer:counterparty,seller=side==='IMPORT'?counterparty:offerer,rel=relation(buyer,seller);
 const sellerCurrency=id(trade()?.currencyOf?.(seller));
 if(!sellerCurrency)return{accepted:false,reason:'SELLER_SETTLEMENT_CURRENCY_UNAVAILABLE'};
 if(normalized.terms.currency&&normalized.terms.currency!==sellerCurrency)return{accepted:false,reason:'AGREEMENT_CURRENCY_MUST_MATCH_SELLER_LOCAL_CURRENCY',expectedCurrency:sellerCurrency};
 normalized.terms.currency=sellerCurrency;
 if(rel&&(rel.war_state===true||rel.sanctions===true))return{accepted:false,reason:'WAR_OR_SANCTIONS_PROHIBIT_BILATERAL_TRADE'};
 const now=new Date().toISOString(),version=1,a={schemaVersion:1,agreementId:'BTA-'+turn()+'-'+offerer+'-'+counterparty+'-'+Date.now(),buyerCountryId:buyer,sellerCountryId:seller,offererCountryId:offerer,counterpartyCountryId:counterparty,resourceId:normalized.terms.resourceId,termVersion:version,terms:normalized.terms,responses:{[offerer]:{decision:'OFFER',acceptedVersion:version,turn:turn(),at:now},[counterparty]:{decision:'PENDING',acceptedVersion:null,turn:null,at:null}},status:'OFFERED',stage:'AWAITING_COUNTERPARTY',createdAt:now,updatedAt:now,createdTurn:turn(),startTurn:turn(),endTurn:turn()+normalized.terms.durationTurns,lastDecisionTurn:null,evidencePolicy:'PLAYER_AUTHORIZED_BILATERAL_TERMS'};const saved=mirrorAgreement(a);return saved.accepted?{accepted:true,agreement:a,delivery:saved.results}:{accepted:false,reason:'BILATERAL_OFFER_DELIVERY_INCOMPLETE',agreementId:a.agreementId,results:saved.results};}
function localAgreement(c,idValue){const row=agreementRows(c).find(x=>x&&String(x.agreementId)===String(idValue));return row?clone(row):null;}
function applyAgreementResponse(countryValue,agreementId,decisionValue,counterTerms){installHandlers();const c=canonical(countryValue),a=localAgreement(c,agreementId);if(!a)return{accepted:false,reason:'BILATERAL_AGREEMENT_NOT_FOUND_FOR_COUNTRY'};if(['ACTIVE','REJECTED','TERMINATED'].includes(a.status))return{accepted:false,reason:'BILATERAL_AGREEMENT_IS_NOT_PENDING'};const parties=[canonical(a.buyerCountryId),canonical(a.sellerCountryId)],d=id(decisionValue),next=clone(a),now=new Date().toISOString();if(!parties.includes(c))return{accepted:false,reason:'BILATERAL_AGREEMENT_PARTY_SCOPE_INVALID'};next.responses=clone(next.responses||{});if(d==='REJECT'){next.responses[c]={decision:'REJECT',acceptedVersion:null,turn:turn(),at:now};next.status='REJECTED';next.stage='COUNTERPARTY_REJECTED';}else if(d==='COUNTER'){const n=normalizeTerms(counterTerms,next.terms);if(!n.ok)return{accepted:false,reason:n.reason};const sellerCurrency=id(trade()?.currencyOf?.(a.sellerCountryId));if(!sellerCurrency)return{accepted:false,reason:'SELLER_SETTLEMENT_CURRENCY_UNAVAILABLE'};if(n.terms.currency&&n.terms.currency!==sellerCurrency)return{accepted:false,reason:'AGREEMENT_CURRENCY_MUST_MATCH_SELLER_LOCAL_CURRENCY',expectedCurrency:sellerCurrency};n.terms.currency=sellerCurrency;next.termVersion=Math.max(1,Math.floor(num(next.termVersion)||1))+1;next.terms=n.terms;next.resourceId=n.terms.resourceId;next.responses={[parties[0]]:{decision:'PENDING_COUNTER_REVIEW',acceptedVersion:null,turn:null,at:null},[parties[1]]:{decision:'PENDING_COUNTER_REVIEW',acceptedVersion:null,turn:null,at:null}};next.responses[c]={decision:'COUNTER',acceptedVersion:next.termVersion,turn:turn(),at:now};next.status='COUNTER_OFFERED';next.stage='AWAITING_ORIGINAL_OFFERER';}else if(d==='ACCEPT'){next.responses[c]={decision:'ACCEPT',acceptedVersion:next.termVersion,turn:turn(),at:now};const all=parties.every(p=>next.responses[p]&&num(next.responses[p].acceptedVersion)===num(next.termVersion));next.status=all?'ACTIVE':'ACCEPTED_AWAITING_COUNTERPARTY';next.stage=all?'IMPLEMENTED':'AWAITING_SECOND_PARTY_ACCEPTANCE';}else return{accepted:false,reason:'DECISION_MUST_BE_ACCEPT_COUNTER_OR_REJECT'};next.updatedAt=now;next.lastDecisionTurn=turn();const saved=mirrorAgreement(next);return saved.accepted?{accepted:true,agreement:next,results:saved.results}:{accepted:false,reason:'BILATERAL_DECISION_MIRROR_INCOMPLETE',agreement:next,results:saved.results};}
function changeStatus(country,idValue,status){if(!canActFor(country))return{accepted:false,reason:'PLAYER_COUNTRY_SCOPE_ONLY'};const a=localAgreement(country,idValue);if(!a)return{accepted:false,reason:'BILATERAL_AGREEMENT_NOT_FOUND'};const s=id(status);if(s==='SUSPENDED'&&a.status!=='ACTIVE')return{accepted:false,reason:'ONLY_ACTIVE_AGREEMENTS_CAN_BE_SUSPENDED'};if(s==='TERMINATED'&&['REJECTED','TERMINATED'].includes(a.status))return{accepted:false,reason:'AGREEMENT_ALREADY_CLOSED'};if(!['SUSPENDED','TERMINATED'].includes(s))return{accepted:false,reason:'UNSUPPORTED_AGREEMENT_STATUS'};const next=Object.assign({},a,{status:s,stage:s,updatedAt:new Date().toISOString(),lastDecisionTurn:turn()}),saved=mirrorAgreement(next);return{accepted:saved.accepted,agreement:next,results:saved.results,reason:saved.accepted?null:'BILATERAL_STATUS_MIRROR_INCOMPLETE'};}
function acceptedTermsVersion(row){
 const version=num(row&&row.termVersion),responses=row&&row.responses||{};
 if(version===null||!Number.isInteger(version)||version<1)return false;
 return [canonical(row.buyerCountryId),canonical(row.sellerCountryId)].every(party=>{
  const response=responses[party],decision=id(response&&response.decision);
  return !!response&&num(response.acceptedVersion)===version&&['OFFER','ACCEPT','COUNTER'].includes(decision);
 });
}
function sameContractTerms(a,b){
 if(!a||!b||token(a.resourceId)!==token(b.resourceId))return false;
 const numeric=['quantityPerShipment','unitPrice','durationTurns'];
 const keys=['currency','unit','paymentTerms','deliveryMode','routeId','conditions'];
 return numeric.every(key=>num(a.terms&&a.terms[key])===num(b.terms&&b.terms[key]))&&
  keys.every(key=>String(a.terms&&a.terms[key]||'')===String(b.terms&&b.terms[key]||''));
}
function isAgreementActiveFor(buyerValue,sellerValue,resourceValue,quantityValue,priceValue,agreementId,currencyValue){
 const buyer=canonical(buyerValue),seller=canonical(sellerValue),rid=token(resourceValue);
 if(!buyer||!seller||buyer===seller)return false;
 const a=agreementRows(buyer).find(x=>x&&(!agreementId||String(x.agreementId)===String(agreementId))&&canonical(x.buyerCountryId)===buyer&&canonical(x.sellerCountryId)===seller&&x.status==='ACTIVE'&&(!rid||token(x.resourceId)===rid));
 if(!a||!acceptedTermsVersion(a))return false;
 const mirror=agreementRows(seller).find(x=>x&&String(x.agreementId)===String(a.agreementId)&&x.status==='ACTIVE'&&num(x.termVersion)===num(a.termVersion)&&token(x.resourceId)===token(a.resourceId));
 if(!mirror||!acceptedTermsVersion(mirror)||!sameContractTerms(a,mirror)||turn()<num(a.startTurn)||turn()>num(a.endTurn))return false;
 const q=num(quantityValue),p=num(priceValue),currency=id(currencyValue);
 if(currency&&currency!==id(a.terms.currency))return false;
 if(q!==null&&q>num(a.terms.quantityPerShipment))return false;
 if(p!==null&&Math.abs(p-num(a.terms.unitPrice))>Math.max(1e-7,Math.abs(num(a.terms.unitPrice))*1e-6))return false;
 return true;
}
function getActiveAgreement(buyer,seller,rid,agreementId){const row=agreementRows(buyer).find(x=>x&&(!agreementId||String(x.agreementId)===String(agreementId))&&canonical(x.buyerCountryId)===canonical(buyer)&&canonical(x.sellerCountryId)===canonical(seller)&&(!rid||token(x.resourceId)===token(rid))&&x.status==='ACTIVE');return row&&isAgreementActiveFor(buyer,seller,rid,null,null,row.agreementId)?clone(row):null;}
function assessTradePosition(a,quantity){
 const buyer=canonical(a.buyerCountryId),seller=canonical(a.sellerCountryId),rid=token(a.resourceId),q=num(quantity),
   relationRow=relation(buyer,seller),fx=num(trade()?.fxRate?.(buyer,seller)),
   buyerCash=num(value(buyer,'finance','available'))??num(value(buyer,'finance','reserves')),
   sellerStock=recordValue(seller,'resource','inventory',rid),
   sellerReserve=recordValue(seller,'resource','reserves',rid),
   sellerFree=sellerStock===null||sellerReserve===null?null:Math.max(0,sellerStock-Math.max(0,sellerReserve)),
   buyerRoute=routeCapacity(buyer,rid),
   buyerImport=resourceIntelligence(seller,buyer,rid).importDemand,
   estimatedBuyerCost=q!==null&&num(a.terms.unitPrice)!==null&&fx!==null?q*num(a.terms.unitPrice)*fx:null,
   blockers=[],unknown=[];
 if(relationRow&&(relationRow.war_state===true||relationRow.sanctions===true))blockers.push('WAR_OR_SANCTIONS');
 if(sellerStock!==null&&q!==null&&sellerStock<q)blockers.push('SELLER_TOTAL_STOCK_BELOW_REQUEST');
 if(sellerFree!==null&&q!==null&&sellerFree<q)blockers.push('SELLER_FREE_STOCK_BELOW_REQUEST');
 if(buyerRoute.status==='KNOWN'&&num(buyerRoute.value)<=0)blockers.push('BUYER_TRADE_ROUTE_UNAVAILABLE');
 if(buyerCash!==null&&estimatedBuyerCost!==null&&buyerCash<estimatedBuyerCost)blockers.push('BUYER_LIQUIDITY_BELOW_ESTIMATED_COST');
 if(!relationRow)unknown.push('DIPLOMATIC_RELATION_NOT_OBSERVED');
 if(sellerStock===null)unknown.push('SELLER_STOCK_NOT_OBSERVED');
 if(sellerReserve===null)unknown.push('SELLER_RESERVED_STOCK_NOT_OBSERVED');
 if(buyerRoute.status==='UNKNOWN')unknown.push('BUYER_ROUTE_CAPACITY_NOT_OBSERVED');
 if(buyerCash===null)unknown.push('BUYER_LIQUIDITY_NOT_OBSERVED');
 if(fx===null)unknown.push('BILATERAL_FX_NOT_OBSERVED');

 return{status:blockers.length?'BLOCKED':unknown.length?'REVIEW_REQUIRED':'READY',
  buyerCountryId:buyer,sellerCountryId:seller,resourceId:rid,quantity:q,
  sellerFreeStock:field(sellerFree,'declared resource unit',sellerFree===null?'UNKNOWN':'KNOWN','resource.inventory − resource.reserves'),
  buyerRouteCapacity:buyerRoute,
  buyerLiquidity:field(buyerCash,'buyer local currency',buyerCash===null?'UNKNOWN':'KNOWN','finance.available / finance.reserves'),
  estimatedBuyerCost:field(estimatedBuyerCost,'buyer local currency',estimatedBuyerCost===null?'UNKNOWN':'ESTIMATED','agreed unit price × quantity × recorded FX'),
  buyerImportDemand:buyerImport,fxRate:field(fx,'buyer currency per seller currency',fx===null?'UNKNOWN':'KNOWN','OmegaGlobalTrade.fxRate'),
  diplomaticRisk:field(relationRow?(relationRow.war_state===true||relationRow.sanctions===true?'PROHIBITIVE':'NO_RECORDED_WAR_OR_SANCTIONS'):null,'risk status',relationRow?'KNOWN':'UNKNOWN','foreign.relations'),
  blockers,unknown,settlementAuthority:'OMEGA_GLOBAL_TRADE_REMAINS_FINAL_AUTHORITY'};
}
function procureAgreement(partyValue,agreementId,quantityValue){
 const party=canonical(partyValue);if(!canActFor(party))return{accepted:false,reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
 const a=localAgreement(party,agreementId);
 if(!a||a.status!=='ACTIVE'||![canonical(a.buyerCountryId),canonical(a.sellerCountryId)].includes(party))
  return{accepted:false,reason:'ACTIVE_AGREEMENT_PARTY_RECORD_REQUIRED'};
 const buyer=canonical(a.buyerCountryId),seller=canonical(a.sellerCountryId),
   q=num(quantityValue)??num(a.terms.quantityPerShipment);
 if(q===null||q<=0||q>num(a.terms.quantityPerShipment))
  return{accepted:false,reason:'QUANTITY_EXCEEDS_AGREEMENT_PER_SHIPMENT_LIMIT'};
 if(!isAgreementActiveFor(buyer,seller,a.resourceId,q,a.terms.unitPrice,agreementId,a.terms.currency))
  return{accepted:false,reason:'BILATERAL_AGREEMENT_NOT_ACTIVE_ON_BOTH_PARTIES'};
 const assessment=assessTradePosition(a,q);
 if(assessment.status==='BLOCKED')return{accepted:false,reason:'BILATERAL_TRADE_READINESS_BLOCKED',assessment};
 const t=trade();if(!t?.createRequest)return{accepted:false,reason:'GLOBAL_TRADE_SETTLEMENT_RUNTIME_UNAVAILABLE'};
 const r=t.createRequest(buyer,{targetCountryId:seller,resourceId:a.resourceId,quantity:q,
  unitPrice:a.terms.unitPrice,currency:a.terms.currency,bilateralAgreementId:a.agreementId,
  transportMode:a.terms.deliveryMode,routeId:a.terms.routeId,source:'OMEGA_BILATERAL_TRADE_AGREEMENT'});
 return r?.accepted===true?{accepted:true,agreementId:a.agreementId,assessment,request:clone(r.request||r)}:
  {accepted:false,reason:r?.reason||'BILATERAL_PROCUREMENT_REQUEST_REJECTED',assessment,detail:r};
}
function playerCountryId(){
 const root=state(),sim=g.Omega&&g.Omega.Simulation,session=root.simulation&&root.simulation.session||
  sim&&sim.world&&sim.world.state&&sim.world.state.simulation&&sim.world.state.simulation.session||{};
 let direct=null;try{if(sim&&typeof sim.getPlayerCountryId==='function')direct=sim.getPlayerCountryId();}catch(_){}
 const candidates=[session.playerCountryId,direct,root.simulation&&root.simulation.playerCountryId,
  root.playerCountryId,root.playerCountryCode,g.Game&&(g.Game.playerCountryId||g.Game.playerCountryCode||g.Game.playerCountry),g.OMEGA_PLAYER_COUNTRY_ID];
 for(const candidate of candidates){const raw=candidate&&typeof candidate==='object'
  ?(candidate.iso3||candidate.iso3Code||candidate.countryCode||candidate.countryId||candidate.code||candidate.id||candidate.name):candidate;
  const country=canonical(raw);if(/^[A-Z]{3}$/.test(country))return country;}
 return null;
}
function npcDecision(country,a){
 const buyer=canonical(a.buyerCountryId),seller=canonical(a.sellerCountryId),rid=token(a.resourceId),
  quantity=num(a.terms&&a.terms.quantityPerShipment),unitPrice=num(a.terms&&a.terms.unitPrice),
  relationRow=relation(buyer,seller),score=relationScore(relationRow);
 if(!buyer||!seller||!rid||quantity===null||unitPrice===null)return{decision:'WAITING',reason:'AGREEMENT_TERMS_INCOMPLETE'};
 if(relationRow&&(relationRow.war_state===true||relationRow.sanctions===true))return{decision:'REJECT',reason:'WAR_OR_SANCTIONS'};
 if(score===null)return{decision:'WAITING',reason:'DIPLOMATIC_RELATION_NOT_OBSERVED'};
 if(score<0.25)return{decision:'REJECT',reason:'DIPLOMATIC_RELATION_BELOW_TRADE_THRESHOLD'};
 const assessment=assessTradePosition(a,quantity);
 if(assessment.blockers.some(x=>!['SELLER_FREE_STOCK_BELOW_REQUEST','BUYER_LIQUIDITY_BELOW_ESTIMATED_COST','SELLER_TOTAL_STOCK_BELOW_REQUEST'].includes(x)))
  return{decision:'REJECT',reason:assessment.blockers.join(','),assessment};
 const currentPrice=priceEvidence(seller,rid),marketPrice=num(currentPrice.value);
 if(currentPrice.status==='UNKNOWN'||marketPrice===null||marketPrice<=0)
  return{decision:'WAITING',reason:'SELLER_LOCAL_MARKET_PRICE_NOT_OBSERVED',assessment};
 let counterQuantity=quantity,counterPrice=unitPrice,needsCounter=false;
 const freeStock=num(assessment.sellerFreeStock&&assessment.sellerFreeStock.value);
 if(freeStock!==null&&freeStock<counterQuantity){counterQuantity=Math.min(counterQuantity,freeStock);needsCounter=true;}
 const buyerCash=num(assessment.buyerLiquidity&&assessment.buyerLiquidity.value),fx=num(assessment.fxRate&&assessment.fxRate.value);
 if(buyerCash!==null&&fx!==null&&fx>0){
  const affordable=Math.max(0,buyerCash/(Math.max(0.000001,counterPrice)*fx));
  if(affordable<counterQuantity){counterQuantity=Math.min(counterQuantity,affordable);needsCounter=true;}
 }
 if(counterQuantity<=0)return{decision:'REJECT',reason:'NO_FEASIBLE_QUANTITY',assessment};
 const deviation=Math.abs(counterPrice-marketPrice)/marketPrice;
 if(deviation>0.15){counterPrice=marketPrice;needsCounter=true;}
 if(assessment.unknown.length)return{decision:'WAITING',reason:'REQUIRED_MARKET_EVIDENCE_INCOMPLETE',assessment};
 if(needsCounter)return{decision:'COUNTER',reason:'TERMS_OUTSIDE_RECORDED_STOCK_LIQUIDITY_OR_MARKET_BAND',
  terms:Object.assign({},a.terms,{quantityPerShipment:Number(counterQuantity.toFixed(6)),unitPrice:Number(counterPrice.toFixed(6)),currency:id(a.terms.currency)})};
 return{decision:'ACCEPT',reason:'RECORDED_STOCK_LIQUIDITY_FX_ROUTE_AND_MARKET_TERMS_SUPPORT_OFFER',assessment};
}
function canActFor(countryValue){const player=playerCountryId();return !!player&&canonical(countryValue)===player;}
function respondToOffer(countryValue,agreementId,decisionValue,counterTerms){
 if(!canActFor(countryValue))return{accepted:false,reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
 return applyAgreementResponse(countryValue,agreementId,decisionValue,counterTerms);
}
function processCountry(countryValue,context){
 const country=canonical(countryValue),player=playerCountryId(),nowTurn=num(context&&context.turn)??turn();
 if(!country)return{status:'SKIPPED',reason:'BILATERAL_TRADE_COUNTRY_REQUIRED'};
 if(!player)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
 if(country===player)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_REQUIRES_MANUAL_DECISION',countryId:country};
 const tokenKey=String(nowTurn)+':'+country;
 if(processedNpcTurns.has(tokenKey))return{status:'ALREADY_PROCESSED',countryId:country,turn:nowTurn,processed:0};
 const pending=agreementRows(country).filter(a=>{
  if(!a||!['OFFERED','COUNTER_OFFERED','ACCEPTED_AWAITING_COUNTERPARTY'].includes(id(a.status)))return false;
  const response=a.responses&&a.responses[country];
  return response&&['PENDING','PENDING_COUNTER_REVIEW','WAITING_DATA'].includes(id(response.decision));
 }).slice(0,MAX_NPC_REVIEWS_PER_COUNTRY_TURN);
 let accepted=0,countered=0,rejected=0,waiting=0,failed=0;
 for(const a of pending){
  const decision=npcDecision(country,a);
  if(decision.decision==='WAITING'){waiting++;continue;}
  const result=applyAgreementResponse(country,a.agreementId,decision.decision,decision.terms);
  if(!result||result.accepted!==true){failed++;continue;}
  if(decision.decision==='ACCEPT')accepted++;
  else if(decision.decision==='COUNTER')countered++;
  else rejected++;
 }
 processedNpcTurns.add(tokenKey);
 if(processedNpcTurns.size>512)processedNpcTurns.delete(processedNpcTurns.values().next().value);
 return{status:'COMPLETED',countryId:country,playerCountryId:player,turn:nowTurn,
  scanned:pending.length,accepted,countered,rejected,waiting,failed,
  limit:MAX_NPC_REVIEWS_PER_COUNTRY_TURN,scope:'SCHEDULED_NPC_COUNTRY_ONLY'};
}
function diagnostics(){return{version:VERSION,handlerInstalled:!!installReport.ready,registeredCommandHandlers:installReport.registered,commandHandlerCount:installReport.total,registrationErrors:clone(installReport.errors),actionRegistrationWarnings:clone(installReport.actionWarnings),automaticWorldRosterScan:false,schedulerHandlers:0,npcReviewLimitPerCountryTurn:MAX_NPC_REVIEWS_PER_COUNTRY_TURN,usesExistingGlobalTradeScheduler:true,usesGlobalTradeSettlement:true,usesDurableInternationalShipmentLedger:true,provenanceStates:['KNOWN','ESTIMATED','UNKNOWN']};}
function init(){installHandlers();if(!g.__omegaBilateralTradeInitHook){g.__omegaBilateralTradeInitHook=true;g.addEventListener?.('OMEGA_READY',installHandlers);g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',installHandlers);}return diagnostics();}
const API=Object.freeze({VERSION,COMMANDS,init,diagnostics,buildMarketIntelligence,requestMarketIntelligence,getReport,createAgreementOffer,respondToOffer,processCountry,suspendAgreement:(c,a)=>changeStatus(c,a,'SUSPENDED'),terminateAgreement:(c,a)=>changeStatus(c,a,'TERMINATED'),getAgreements:c=>agreementRows(c).map(row=>clone(row)),getActiveAgreement,isAgreementActiveFor,assessTradePosition,canActFor,playerCountryId,procureAgreement});
g.Omega=g.Omega||{};g.Omega.BilateralTrade=API;g.OmegaBilateralTrade=API;try{init();}catch(e){g.OmegaBilateralTradeError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
