/* OMEGA BLACK MARKET UI v1.3.0 */
(function(g){
'use strict';
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(v,c){const n=Number(v);if(!Number.isFinite(n))return'Not available';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:String(c||'USD'),maximumFractionDigits:2}).format(n);}catch(_){return n.toLocaleString('en-US',{maximumFractionDigits:2})+' '+String(c||'');}}
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function fmt(v){const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(n):'Not recorded';}
function countryInfo(value){
 const code=String(value??'').trim().toUpperCase();let hit=null;
 try{const registry=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
  hit=registry?.resolveCountry?.(code)||null;}catch(_){}
 const raw=hit?.raw||hit||{},iso2=String(raw.iso2||raw.countryCode||(/^[A-Z]{2}$/.test(code)?code:'')).toUpperCase();
 const name=String(raw.name||raw.officialName||raw.names?.[0]||hit?.surface||code||'Unknown country');
 let flag='';
 if(/^[A-Z]{2}$/.test(iso2))try{flag=String.fromCodePoint(...Array.from(iso2,ch=>127397+ch.charCodeAt(0)));}catch(_){}
 return{code,name,iso2,flag};
}
function countryLabel(value){const info=countryInfo(value);return(info.flag?info.flag+' ':'')+info.name;}
function human(value){return String(value||'Not established').replace(/_/g,' ').toLowerCase().replace(/\b[a-z]/g,x=>x.toUpperCase());}
function actorRole(value){
 const key=String(value||'').toUpperCase();
 return key==='STATE_LINKED'?'State-linked commercial actor':(key==='PRIVATE_BROKER'?'Private broker':'Private exporter or broker');
}
function dataToken(value){return String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
function dataValue(map,key){
 if(!map||typeof map!=='object')return undefined;
 const wanted=dataToken(key),found=Object.keys(map).find(item=>dataToken(item)===wanted);
 return found===undefined?undefined:map[found];
}
function demandSignals(resourceId,playerCountryId){
 const state=g.Game?.state||g.gameState||g.Omega?.Simulation?.world?.state||{},
  root=state.resource;
 if(!resourceId||!root||typeof root!=='object'||Array.isArray(root))return[];
 const currentTurn=Number(state.simulation?.turn??state.turn??state.simulationTurn??0)||0,rows=[];
 for(const [countryId,record] of Object.entries(root)){
  const code=String(countryId||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{2,3}$/.test(code)||code===playerCountryId)continue;
  const runtime=record?.demandRuntime,by=runtime?.byResource,
   demand=dataValue(by,resourceId);
  if(!demand||typeof demand!=='object')continue;
  const unmet=Math.max(0,Number(demand.unmetDemand)||0),
   perDay=Math.max(0,Number(demand.demandPerDay??demand.demand)||0),
   coverage=Number.isFinite(Number(demand.stockCoverageDays))?Number(demand.stockCoverageDays):null,
   target=Number.isFinite(Number(demand.stockCoverageTargetDays))?Number(demand.stockCoverageTargetDays):null,
   low=perDay>0&&coverage!==null&&target!==null&&target>coverage;
  if(unmet<=1e-8&&!low)continue;
  const gap=low?Math.max(unmet,perDay*(target-coverage)):unmet;
  if(!(gap>0))continue;
  const stale=Math.max(0,currentTurn-(Number(runtime.lastTurn)||currentTurn)),
   freshness=stale>30?.45:(stale>10?.7:1),
   pressure=Math.max(Number(demand.procurementScore)||0,perDay>0?unmet/perDay:0,
    low?(target-coverage)/Math.max(target,1):0)*freshness;
  rows.push({countryId:code,quantity:gap,demandPerDay:perDay,coverage,target,pressure,
   reason:Number(demand.activeFactoryInputDemandPerDay)>0?'Active factory input shortage':
    (/food|wheat|rice|fertili/i.test(String(resourceId))?'Domestic food demand gap':
     (/coal|oil|gas|uranium|energy/i.test(String(resourceId))?'Energy or industrial supply gap':'Recorded unmet demand')),
   status:String(demand.status||'SHORTAGE'),freshness,lastDemandTurn:Number(runtime.lastTurn)||null});
 }
 return rows.sort((a,b)=>b.pressure-a.pressure||b.quantity-a.quantity||a.countryId.localeCompare(b.countryId)).slice(0,24);
}
function confirmedParticipationDeals(resourceId){
 const state=g.Game?.state||g.gameState||g.Omega?.Simulation?.world?.state||{},
  root=state.trade,rows=[],seen=new Set();
 if(!resourceId||!root||typeof root!=='object'||Array.isArray(root))return[];
 for(const [scope,record] of Object.entries(root)){
  const deals=Array.isArray(record?.blackMarketDeals)?record.blackMarketDeals:[];
  for(const row of deals){
   if(!row||dataToken(row.resourceId)!==dataToken(resourceId))continue;
   const key=String(row.dealId||[row.buyerCountryId||scope,row.sellerCountryId,row.resourceId,row.createdTurn].join(':'));
   if(seen.has(key))continue;seen.add(key);
   rows.push({...row,buyerCountryId:row.buyerCountryId||scope});
  }
 }
 return rows.sort((a,b)=>(Number(b.createdTurn)||0)-(Number(a.createdTurn)||0)).slice(0,24);
}
function dealStatusLabel(value){
 const key=String(value||'UNKNOWN').toUpperCase();
 const labels={REQUESTED:'REQUEST SENT',SENT:'AWAITING SELLER RESPONSE',NEGOTIATING:'NEGOTIATING',
  ACCEPTED:'OFFER ACCEPTED',IN_TRANSIT:'IN TRANSIT',ARRIVAL_PENDING:'ARRIVAL PENDING',
  SETTLED:'SETTLED',SETTLED_UNDER_INVESTIGATION:'UNDER INVESTIGATION',
  INTERCEPTED:'INTERCEPTED',FAILED:'REJECTED',EXPIRED:'EXPIRED'};
 return labels[key]||human(key);
}
function styles(){return \`<style>
.omega-bm{--bm-bg:#06162d;--bm-panel:#0b2445;--bm-panel2:#0d3159;--bm-line:#28689b;--bm-muted:#b0cce6;--bm-text:#f5faff;--bm-cyan:#35caff;--bm-green:#49e0bd;color:var(--bm-text);background:linear-gradient(145deg,#06152d,#08264b 56%,#061a35);border:1px solid #237fc0;border-radius:13px;overflow:hidden;box-shadow:0 0 26px rgba(0,146,255,.18),inset 0 1px rgba(255,255,255,.09);font-family:Arial,Helvetica,sans-serif;min-width:0}
.omega-bm *{box-sizing:border-box}.omega-bm button,.omega-bm input,.omega-bm select{font:inherit}
.omega-bm-head{display:flex;align-items:center;justify-content:space-between;gap:15px;min-height:132px;padding:18px 22px;background:linear-gradient(90deg,rgba(3,18,42,.97),rgba(5,37,77,.83) 58%,rgba(3,17,39,.94)),url('assets/omega-global-market/market-header.svg') center/cover no-repeat;border-bottom:1px solid #228cd7}
.omega-bm-kicker{font-size:11px;letter-spacing:.16em;color:#88e1ff;font-weight:900}.omega-bm-head h2{font-size:clamp(24px,3.2vw,35px);line-height:1.08;margin:7px 0 5px;color:#fff;letter-spacing:.04em;text-transform:uppercase;text-shadow:0 0 15px rgba(39,201,255,.26)}
.omega-bm-sub{font-size:13px;line-height:1.5;color:#d2e7fa;margin:0;max-width:760px}.omega-bm-scope{display:inline-flex;align-items:center;gap:8px;margin-top:9px;font-size:12px;color:#ecf8ff;font-weight:800}.omega-bm-scope:before{content:"";width:8px;height:8px;border-radius:50%;background:#49e0bd;box-shadow:0 0 11px #49e0bd}
.omega-bm-classified{flex:none;border:1px solid #f2c76e;background:rgba(29,32,40,.88);color:#ffe0a2;padding:10px 12px;border-radius:5px;font-size:10px;line-height:1.45;font-weight:900;letter-spacing:.11em;text-align:center}
.omega-bm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:12px 14px 0}.omega-bm-stat{min-width:0;padding:10px 12px;border:1px solid #2a6597;border-radius:7px;background:linear-gradient(145deg,#10335d,#071c38);box-shadow:inset 0 1px rgba(255,255,255,.05)}
.omega-bm-stat small{display:block;color:#b8d5ee;font-size:10px;line-height:1.35;font-weight:900;letter-spacing:.065em;text-transform:uppercase}.omega-bm-stat strong{display:block;margin-top:5px;font-size:22px;color:#fff;font-variant-numeric:tabular-nums}.omega-bm-stat em{display:block;margin-top:3px;font-size:10px;color:#9ec8e9;font-style:normal}
.omega-bm-body{padding:13px 14px 16px}.omega-bm-brief{display:flex;align-items:flex-start;gap:9px;margin:0 0 11px;padding:10px 12px;border-left:3px solid #36cfff;border-radius:3px;background:rgba(10,92,145,.23);color:#d8efff;font-size:12px;line-height:1.55}.omega-bm-brief strong{color:#fff}
.omega-bm-tools{border:1px solid #2a689e;border-radius:8px;padding:10px;background:linear-gradient(145deg,#0d2e55,#071c37)}.omega-bm-lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:9px}
.omega-bm-lane{display:flex;align-items:center;gap:9px;min-width:0;min-height:61px;padding:8px 11px;border:1px solid #28699e;border-radius:7px;background:linear-gradient(120deg,#123c69,#071f3d);color:#e9f7ff;font-size:12px;font-weight:900;letter-spacing:.02em;text-align:left;cursor:pointer}
.omega-bm-lane img{width:40px;height:40px;object-fit:contain;flex:none;filter:drop-shadow(0 0 6px rgba(25,169,255,.33))}.omega-bm-lane span{display:block;line-height:1.3}.omega-bm-lane small{display:block;margin-top:3px;color:#a9d2ef;font-size:10px;font-weight:600}
.omega-bm-lane[aria-pressed="true"]{border-color:#36d2ff;background:linear-gradient(120deg,#087ec6,#0b315d);box-shadow:0 0 15px rgba(39,201,255,.23),inset 0 0 14px rgba(39,201,255,.13)}
.omega-bm-tool-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,180px) auto;gap:9px;align-items:end}.omega-bm-field{display:flex;flex-direction:column;gap:5px;min-width:0}.omega-bm-field label{font-size:10px;color:#b6d3eb;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.omega-bm select,.omega-bm input{width:100%;min-width:0;min-height:39px;border:1px solid #397cac;border-radius:5px;padding:8px 10px;background:#061a34;color:#fff;font-size:12px;outline:none}.omega-bm select:focus,.omega-bm input:focus{border-color:#7be1ff;box-shadow:0 0 0 2px rgba(39,201,255,.15)}
.omega-bm button{min-height:39px;border:1px solid #32c9fa;border-radius:5px;padding:8px 14px;background:linear-gradient(145deg,#0783cf,#07539a);color:#fff;font-size:10px;font-weight:900;letter-spacing:.06em;cursor:pointer;box-shadow:0 0 10px rgba(39,201,255,.12)}
.omega-bm button:hover:not(:disabled){filter:brightness(1.13)}.omega-bm button:disabled{opacity:.48;cursor:not-allowed}.omega-bm button:focus-visible{outline:2px solid #8be8ff;outline-offset:2px}
.omega-bm-section{margin:14px 0 9px;border:1px solid #28699e;border-radius:8px;background:linear-gradient(150deg,#0b2a50,#061a35);overflow:hidden}
.omega-bm-section>header{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:10px 12px;background:linear-gradient(90deg,#124477,#0a2b52);border-bottom:1px solid #2b6ea2}
.omega-bm-section>header strong{font-size:12px;color:#f3faff;letter-spacing:.06em;text-transform:uppercase}.omega-bm-section>header span{font-size:10px;color:#b7d9f4;text-align:right}
.omega-bm-section-note{padding:8px 11px;color:#b4d2ea;font-size:11px;line-height:1.45;border-bottom:1px solid rgba(94,160,203,.16)}
.omega-bm-table-wrap{width:100%;overflow-x:auto;overscroll-behavior-x:contain}
.omega-bm-board-table{width:100%;min-width:600px;border-collapse:collapse}.omega-bm-board-table th{padding:9px 10px;background:rgba(4,20,42,.85);color:#b7d8f1;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.055em;white-space:nowrap}
.omega-bm-board-table td{padding:9px 10px;border-top:1px solid rgba(90,153,196,.2);color:#eef7ff;font-size:12px;vertical-align:middle}
.omega-bm-board-table tbody tr:not(.omega-bm-detail-row):hover td{background:rgba(20,105,173,.16)}
.omega-bm-country-row{display:flex;align-items:center;gap:9px;min-width:0}.omega-bm-flag{display:grid;place-items:center;flex:none;min-width:30px;height:23px;border:1px solid rgba(156,204,244,.34);border-radius:3px;background:rgba(2,13,27,.8);font-size:19px;line-height:1}
.omega-bm-country-copy{display:block;min-width:0}.omega-bm-country-copy strong{display:block;color:#f4f9ff;font-size:12px;white-space:normal;line-height:1.25}.omega-bm-country-copy small{display:block;margin-top:2px;color:#a5c8e5;font-size:10px;font-weight:600;line-height:1.3}
.omega-bm-number{font-weight:900;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}.omega-bm-muted{color:#a9c8e4!important;font-size:10px}.omega-bm-good{color:#6be7c5!important}.omega-bm-warn{color:#ffd38a!important}
.omega-bm-tag{display:inline-block;padding:5px 7px;border:1px solid rgba(70,201,255,.36);border-radius:4px;background:rgba(9,92,143,.24);color:#b2edff;font-size:10px;font-weight:900;line-height:1.2;white-space:nowrap}
.omega-bm-risk{display:inline-block;padding:5px 7px;border:1px solid rgba(255,195,105,.4);border-radius:4px;background:rgba(118,70,16,.24);color:#ffda99;font-size:10px;font-weight:900;white-space:nowrap}
.omega-bm-row-action{display:flex;align-items:center;gap:6px;white-space:nowrap}.omega-bm-row-action input{width:88px;min-height:33px;padding:5px 7px;font-size:11px}.omega-bm-row-action button{min-height:33px;padding:6px 10px;font-size:10px}
.omega-bm-detail-row td{padding:0 9px 9px;border-top:0}.omega-bm-detail{border:1px solid rgba(97,158,200,.22);border-radius:5px;background:rgba(3,15,32,.45)}
.omega-bm-detail summary{padding:8px 10px;color:#9fe3ff;font-size:11px;font-weight:800;cursor:pointer}.omega-bm-detail-body{padding:8px 10px 10px;color:#c4daed;font-size:11px;line-height:1.65}
.omega-bm-more{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px;border-top:1px solid rgba(90,153,196,.17);color:#bdd8ef;font-size:11px}.omega-bm-more button{min-height:32px;padding:6px 10px;font-size:10px}
.omega-bm-status{display:inline-block;padding:5px 7px;border-radius:4px;background:rgba(8,131,176,.22);border:1px solid rgba(51,196,243,.35);color:#b8efff;font-size:10px;font-weight:900;white-space:nowrap}
.omega-bm-status.is-alert{background:rgba(135,72,18,.25);border-color:rgba(255,186,96,.42);color:#ffd390}
.omega-bm-lower{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}.omega-bm-panel{min-width:0;border:1px solid #28699e;border-radius:8px;background:linear-gradient(150deg,#0b2a50,#061a35);overflow:hidden}
.omega-bm-panel>header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;background:linear-gradient(90deg,#124477,#0a2b52);border-bottom:1px solid #28699e}
.omega-bm-panel>header strong{font-size:11px;color:#f3faff;letter-spacing:.055em;text-transform:uppercase}.omega-bm-panel>header span{font-size:10px;color:#b3d0ea}
.omega-bm-panel-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:9px}.omega-bm-deal{min-width:0;padding:9px;border:1px solid rgba(112,151,165,.24);border-radius:6px;background:rgba(5,14,21,.43)}
.omega-bm-deal strong{display:block;margin-top:5px;font-size:11px;color:#f1f8ff;overflow-wrap:anywhere}.omega-bm-deal small{display:block;color:#b0c9e1;font-size:10px;line-height:1.5;margin-top:4px;overflow-wrap:anywhere}
.omega-bm-intel{display:grid;gap:7px;padding:10px}.omega-bm-intel-row{padding:8px 9px;border:1px solid rgba(95,157,202,.22);border-radius:5px;background:rgba(2,15,32,.35)}
.omega-bm-intel-row strong{display:block;color:#eef8ff;font-size:11px}.omega-bm-intel-row small{display:block;color:#a9c7e2;font-size:10px;line-height:1.5;margin-top:4px}
.omega-bm-empty{padding:18px 12px;color:#bed6ed;font-size:12px;line-height:1.55;text-align:center}
.omega-bm-outcome{margin:10px 0 0;padding:10px 12px;border-left:3px solid #36cfff;border-radius:4px;background:rgba(20,106,154,.2);color:#dcf3ff;font-size:12px;line-height:1.5}
.omega-bm-progress{display:block;margin-top:7px;color:#b7e5fb;font-size:11px;line-height:1.45}.omega-bm-progress[aria-live]{min-height:16px}
.omega-bm-country-context{display:grid;gap:6px;margin-top:8px;padding:8px;border:1px solid rgba(70,150,205,.25);border-radius:5px;background:rgba(3,19,39,.45)}
.omega-bm-country-context small{display:block;color:#a9c9e4;font-size:10px}.omega-bm-country-context strong{display:block;margin-top:3px;color:#ecf7ff;font-size:11px;line-height:1.45}
.omega-bm-risknote{margin:12px 0 0;color:#a8c2dd;font-size:10px;line-height:1.6;border-top:1px solid rgba(108,153,180,.22);padding-top:9px}
@media(max-width:900px){.omega-bm-lower{grid-template-columns:1fr}.omega-bm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.omega-bm-panel-body{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:650px){.omega-bm-head{min-height:112px;padding:14px}.omega-bm-classified{font-size:8px;padding:7px}.omega-bm-body{padding:10px}.omega-bm-grid{gap:6px;padding:10px 10px 0}.omega-bm-stat{padding:8px}.omega-bm-stat strong{font-size:19px}.omega-bm-lanes{gap:5px}.omega-bm-lane{display:block;min-height:58px;padding:6px;text-align:center}.omega-bm-lane img{display:block;width:28px;height:28px;margin:0 auto 4px}.omega-bm-lane span{font-size:9px}.omega-bm-lane small{font-size:8px}.omega-bm-tool-row{grid-template-columns:minmax(0,1fr) minmax(95px,.6fr)}.omega-bm-tool-row>button{grid-column:1/-1}.omega-bm-panel-body{grid-template-columns:1fr}.omega-bm-board-table{min-width:570px}.omega-bm-brief{font-size:11px}}
@media(prefers-reduced-motion:reduce){.omega-bm *{scroll-behavior:auto!important;transition:none!important}}
</style>\`;}

function render(root,countryValue){
 const bm=g.OmegaBlackMarket||g.Omega?.BlackMarket;if(!root||!bm)return{ok:false,reason:'BLACK_MARKET_RUNTIME_UNAVAILABLE'};
 const c=String(countryValue||g.OmegaMinistryViewCountry||g.OmegaCabinetUI?.activeCountry||g.currentActiveCountry||'').trim().toUpperCase();
 root.__omegaBmCountry=c;
 const selected=String(root.__omegaBmResource||''),lane=String(root.__omegaBmLane||'RAW_RESOURCE');
 const allOffers=Array.isArray(root.__omegaBmOffers)?root.__omegaBmOffers:[];
 const dealRows=bm.getDeals(c),caseRows=bm.getCases(c),responseRows=bm.getResponses(c),
  networkReports=typeof bm.getNetworkReports==='function'?bm.getNetworkReports(c):[],transits=typeof bm.getTransits==='function'?bm.getTransits(c):[];
 const deals=Array.isArray(dealRows)?dealRows:[],cases=Array.isArray(caseRows)?caseRows:[],responses=Array.isArray(responseRows)?responseRows:[];
 const products=(g.OmegaGlobalMarket||g.Omega?.GlobalMarket)?.productCatalog?.()||[];
 const validLane=['RAW_RESOURCE','FACTORY_PRODUCT','FOOD_PRODUCT'].includes(lane)?lane:'RAW_RESOURCE';
 const laneProducts=products.filter(x=>x?.id&&x.productType===validLane).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id)));
 const selectedProduct=laneProducts.some(x=>x.id===selected)?selected:(laneProducts[0]?.id||'');
 root.__omegaBmResource=selectedProduct;
 const opts=laneProducts.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===selectedProduct?' selected':'')+'>'+esc(x.name||x.id)+'</option>').join('');
 const offers=selectedProduct?allOffers.filter(x=>String(x.resourceId||selectedProduct)===selectedProduct):[];
 const visibleOfferCount=Math.max(6,Math.min(24,Number(root.__omegaBmVisibleOffers)||6)),
  visibleBuyerCount=Math.max(6,Math.min(24,Number(root.__omegaBmVisibleBuyers)||8));
 const buyerSignals=selectedProduct?demandSignals(selectedProduct,c):[],
  participationDeals=selectedProduct?confirmedParticipationDeals(selectedProduct):[],
  acceptedDeals=participationDeals.filter(x=>String(x.status||'').toUpperCase()==='ACCEPTED').length;
 const active=deals.filter(x=>!['FAILED','EXPIRED'].includes(String(x.status||'').toUpperCase()));
 const settled=deals.filter(x=>['SETTLED','SETTLED_UNDER_INVESTIGATION'].includes(String(x.status||'').toUpperCase())).length;
 const exposed=deals.filter(x=>['INTERCEPTED','SETTLED_UNDER_INVESTIGATION'].includes(String(x.status||'').toUpperCase())).length;
 const scanning=!!root.__omegaBmScanning;
 const count=(v)=>fmt(v);
 const pct=(v)=>Math.max(0,Math.min(100,(Number(v)||0)*100));
 const section=(index,title,note)=>'<div class="omega-bm-section"><div class="omega-bm-section-copy"><span class="omega-bm-section-index">'+esc(index)+'</span><h3>'+esc(title)+'</h3></div><span class="omega-bm-section-note">'+esc(note||'')+'</span></div>';
 const cards=offers.slice(0,visibleOfferCount).map(x=>{
  const q=Math.min(num(x.requestedQuantity)||1,num(x.availableQuantity)||1),
   saving=num(x.expectedSavings),comparisonCurrency=x.buyerCurrency||x.currency,
   legalTag=x.legalMarketAvailable?(saving!==null&&saving>0?'PRICE ADVANTAGE':'STRATEGIC ACCESS'):
    (x.embargoed?'IMPORT EMBARGO':x.exportRestrictionReason?'EXPORT RESTRICTION':x.sanctionsAtQuote?'SANCTIONS':'RESTRICTED SUPPLY'),
   foreignBasis=(Array.isArray(x.foreignPolicyBasis)?x.foreignPolicyBasis:[]).join(' · ')||'No blocking foreign-policy measure observed',
   math=x.pricingBreakdown||{},sellerInfo=countryInfo(x.sellerCountryId),
   negotiation=root.__omegaBmNegotiation&&root.__omegaBmNegotiation.offerId===x.offerId?root.__omegaBmNegotiation:null,
   risk=pct(x.detectionProbability);
  const acceptedCounter=negotiation?.status==='COUNTERED'?
   '<p class="omega-bm-outcome">Broker counteroffer: '+money(negotiation.counterUnitPrice,x.currency)+
   ' / unit <button type="button" data-bm-accept-counter="'+esc(negotiation.negotiationId)+'">ACCEPT COUNTER</button></p>':'';
  const motiveMarkup='<div class="omega-bm-country-context">'+
   (x.sellerMotiveReason?'<div><small>Why '+esc(sellerInfo.name)+' sells</small><strong>'+esc(x.sellerMotiveReason)+'</strong></div>':'')+
   (x.buyerMotiveReason?'<div><small>Why '+esc(countryInfo(c).name)+' wants this commodity</small><strong>'+esc(x.buyerMotiveReason)+'</strong></div>':'')+
   '<div><small>Seller actor</small><strong>'+esc(actorRole(x.sellerActorClass))+'</strong></div></div>';
  const detail='<details class="omega-bm-detail"><summary>PRICE, POLICY, MOTIVE & RISK DETAILS · '+esc(sellerInfo.name)+'</summary><div class="omega-bm-detail-body">'+
   'Legal landed price: '+(x.legalLandedUnitPrice===null?'No comparable legal quote':money(x.legalLandedUnitPrice,comparisonCurrency))+
   ' · '+(saving===null?'Legal benchmark unavailable':(saving>=0?'Expected saving ':'Expected extra cost ')+money(Math.abs(saving),comparisonCurrency))+
   '<br>Expected delivered: '+fmt(x.expectedDeliveredQuantity)+' '+esc(x.unit||'')+
   ' · Expected cargo loss: '+fmt(x.expectedSeizedQuantity)+' '+esc(x.unit||'')+
   ' · Expected fine: '+(x.expectedFineCostBuyer===null?'Not priced':money(x.expectedFineCostBuyer,comparisonCurrency))+
   '<br>Detection before dispatch: '+fmt(risk)+'% · Late discovery: '+fmt(pct(x.lateDetectionProbability))+'%'+
   '<br>Policy evidence: '+esc(foreignBasis)+
   '<br>Price components: tariff '+fmt(math.tariffDiscountPct)+'%, risk '+fmt(math.riskPremiumPct)+'%, policy '+fmt(math.policyPremiumPct)+
   '%, scarcity '+fmt(math.scarcityPremiumPct)+'%, broker '+fmt(math.brokerSpreadPct)+'%'+motiveMarkup+
   '<div class="omega-bm-row-action" style="margin-top:9px"><input type="number" min="0.001" step="any" value="'+esc(negotiation?.bidUnitPrice??x.unitPrice)+
   '" data-bm-bid="'+esc(x.offerId)+'" aria-label="Bid price per unit">'+
   '<button type="button" data-bm-negotiate="'+esc(x.offerId)+'" data-bm-seller="'+esc(x.sellerCountryId)+
   '" data-bm-resource="'+esc(x.resourceId)+'">NEGOTIATE PRICE</button></div>'+
   (negotiation?'<p class="omega-bm-outcome">Negotiation: '+esc(human(negotiation.status))+
    (negotiation.counterUnitPrice!==undefined?' · Counter '+money(negotiation.counterUnitPrice,x.currency):'')+
    (negotiation.agreedUnitPrice!==undefined?' · Agreed '+money(negotiation.agreedUnitPrice,x.currency):'')+'</p>':'')+
   acceptedCounter+'</div></details>';
  return '<tr><td><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(sellerInfo.flag||'🏳️')+
   '</span><span class="omega-bm-country-copy"><strong>'+esc(sellerInfo.name)+'</strong><small>'+esc(actorRole(x.sellerActorClass))+'</small></span></div></td>'+
   '<td><span class="omega-bm-number">'+fmt(x.availableQuantity)+' '+esc(x.unit||'')+'</span></td>'+
   '<td><span class="omega-bm-number">'+money(x.unitPrice,x.currency)+'</span><small class="omega-bm-muted"> / unit</small></td>'+
   '<td><span class="omega-bm-risk">'+fmt(risk)+'% RISK</span></td>'+
   '<td><span class="omega-bm-tag">'+esc(legalTag)+'</span></td>'+
   '<td><div class="omega-bm-row-action"><input type="number" min="0.001" max="'+esc(x.availableQuantity)+
   '" step="any" value="'+esc(q)+'" data-bm-quantity="'+esc(x.offerId)+'" aria-label="Order quantity from '+esc(sellerInfo.name)+'">'+
   '<button type="button" data-bm-buy="'+esc(x.offerId)+'" data-bm-seller="'+esc(x.sellerCountryId)+
   '" data-bm-resource="'+esc(x.resourceId)+'">BUY</button></div></td></tr>'+
   '<tr class="omega-bm-detail-row"><td colspan="6">'+detail+'</td></tr>';
 }).join('');
 const offerMore=offers.length>visibleOfferCount?
  '<div class="omega-bm-more"><span>Showing '+count(visibleOfferCount)+' of '+count(offers.length)+' verified seller offers</span>'+
  '<button type="button" data-bm-show-more>SHOW '+count(Math.min(6,offers.length-visibleOfferCount))+' MORE SELLERS</button></div>':'';
 const buyerRows=buyerSignals.slice(0,visibleBuyerCount).map(x=>{
  const info=countryInfo(x.countryId);
  return '<tr><td><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(info.flag||'🏳️')+
   '</span><span class="omega-bm-country-copy"><strong>'+esc(info.name)+'</strong><small>'+esc(x.reason)+'</small></span></div></td>'+
   '<td><span class="omega-bm-number">'+fmt(x.quantity)+'</span></td>'+
   '<td>'+fmt(x.demandPerDay)+'/day</td>'+
   '<td>'+(x.coverage===null?'—':fmt(x.coverage)+' days')+'</td>'+
   '<td><span class="omega-bm-tag">POTENTIAL BUYER</span></td></tr>';
 }).join('');
 const buyerMore=buyerSignals.length>visibleBuyerCount?
  '<div class="omega-bm-more"><span>Showing '+count(visibleBuyerCount)+' of '+count(buyerSignals.length)+' demand signals</span>'+
  '<button type="button" data-bm-show-more-buyers>SHOW MORE COUNTRIES</button></div>':'';
 const participationRows=participationDeals.slice(0,16).map(x=>{
  const status=String(x.status||'UNKNOWN').toUpperCase(),
   alert=['INTERCEPTED','SETTLED_UNDER_INVESTIGATION','FAILED','EXPIRED'].includes(status);
  return '<tr><td><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(countryInfo(x.buyerCountryId).flag||'🏳️')+
   '</span><span class="omega-bm-country-copy"><strong>'+esc(countryInfo(x.buyerCountryId).name)+'</strong><small>BUYER</small></span></div></td>'+
   '<td><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(countryInfo(x.sellerCountryId).flag||'🏳️')+
   '</span><span class="omega-bm-country-copy"><strong>'+esc(countryInfo(x.sellerCountryId).name)+'</strong><small>SELLER</small></span></div></td>'+
   '<td>'+esc(x.productName||x.resourceId)+'</td><td>'+fmt(x.quantity)+' '+esc(x.unit||'')+'</td>'+
   '<td><span class="omega-bm-status'+(status==='ACCEPTED'?'':'')+(alert?' is-alert':'')+'">'+esc(dealStatusLabel(status))+'</span></td>'+
   '<td>'+esc(money(x.unitPrice,x.currency))+'</td></tr>';
 }).join('');
 const dealHtml=active.slice(0,8).map(x=>{const e=x.enforcement||{},alert=['INTERCEPTED','SETTLED_UNDER_INVESTIGATION','FAILED'].includes(String(x.status||'').toUpperCase());return '<article class="omega-bm-deal"><span class="omega-bm-status'+(alert?' is-alert':'')+'">'+esc(String(x.status||'UNKNOWN').replace(/_/g,' '))+'</span><strong>'+esc(x.productName||x.resourceId)+'</strong><small>Seller '+esc(countryLabel(x.sellerCountryId))+' · '+fmt(x.quantity)+' '+esc(x.unit||'units')+'</small><small>'+money(x.unitPrice,x.currency)+' / unit · Turn '+fmt(x.createdTurn)+'</small>'+(e.fineDue!==undefined?'<small>Fine paid '+money(e.finePaid,e.fineCurrency)+' / '+money(e.fineDue,e.fineCurrency)+' · outstanding '+money(e.fineOutstanding,e.fineCurrency)+'</small>':'')+(e.seizureTargetQuantity!==undefined?'<small>Cargo seized '+fmt(e.seizureQuantity)+' / '+fmt(e.seizureTargetQuantity)+' '+esc(x.unit||'units')+'</small>':'')+'</article>';}).join('');
 const caseHtml=cases.slice(-6).reverse().map(x=>'<article class="omega-bm-deal"><span class="omega-bm-status is-alert">'+esc(x.status||'CASE')+'</span><strong>'+esc(x.resourceId||'Black Market case')+'</strong><small>'+esc(countryLabel(x.buyerCountryId))+' ↔ '+esc(countryLabel(x.sellerCountryId))+'</small><small>Evidence '+fmt((num(x.evidenceConfidence)||0)*100)+'% · Turn '+fmt(x.detectionTurn)+'</small></article>').join('');
 const respHtml=responses.slice(-4).reverse().map(x=>'<article class="omega-bm-deal"><span class="omega-bm-status">FOREIGN RESPONSE</span><strong>'+esc(human(x.responseType||'Diplomatic response'))+'</strong><small>Target '+esc(countryLabel(x.targetCountryId))+' · Source '+esc(countryLabel(x.sourceCountryId))+' · '+esc(x.severity||'UNSPECIFIED')+'</small></article>').join('');
 const transitHtml=transits.filter(x=>['IN_TRANSIT','ARRIVAL_PENDING'].includes(String(x.status||'').toUpperCase())).slice(-8).reverse().map(x=>'<article class="omega-bm-deal"><span class="omega-bm-status">'+esc(human(x.status||'IN_TRANSIT'))+'</span><strong>'+esc(x.resourceId)+' · '+fmt(x.quantity)+' '+esc(x.unit||'units')+'</strong><small>'+esc(countryLabel(x.sellerCountryId))+' → '+esc(countryLabel(x.buyerCountryId))+'</small><small>'+(Array.isArray(x.route)?x.route.map(y=>esc(y.checkpoint||y.role||countryLabel(y.countryId))).join(' → '):'Route not recorded')+'</small><small>Inspection checkpoints '+fmt((x.timeline||[]).length)+' / '+fmt((x.route||[]).length)+'</small></article>').join('');
 const reportHtml=networkReports.slice(-8).reverse().map(x=>{
  const profile=x.actorProfile||{},motive=x.motiveAssessment||{};
  const buyerReason=profile.buyerReason||motive.buyerReason||'';
  const sellerReason=profile.sellerReason||motive.sellerReason||'';
  const actorDetails=[
   profile.buyerGovernmentLabel?'<small>Buyer actor: '+esc(profile.buyerGovernmentLabel)+'</small>':'',
   profile.sellerGovernmentLabel?'<small>Seller actor: '+esc(profile.sellerGovernmentLabel)+'</small>':'',
   buyerReason?'<small>Why buyer participates: '+esc(buyerReason)+'</small>':(motive.buyerMotive?'<small>Buyer motive: '+esc(human(motive.buyerMotive))+'</small>':''),
   sellerReason?'<small>Why seller participates: '+esc(sellerReason)+'</small>':(motive.sellerMotive?'<small>Seller motive: '+esc(human(motive.sellerMotive))+'</small>':''),
   profile.tactic?'<small>Network type: '+esc(human(profile.tactic))+'</small>':'',
   Array.isArray(profile.potentialIntermediaryCountryIds)&&profile.potentialIntermediaryCountryIds.length?
    '<small>Potential intermediaries: '+profile.potentialIntermediaryCountryIds.map(countryLabel).map(esc).join(' · ')+'</small>':''
  ].join('');
  return '<article class="omega-bm-deal"><span class="omega-bm-status'+(x.level==='HIGH'?' is-alert':'')+'">'+esc(x.level||'RUMOUR')+' INTELLIGENCE</span><strong>'+esc(x.productName||x.resourceId||'Covert network')+'</strong><small>'+esc(x.summary||'Covert activity observed')+'</small><small>'+(x.buyerCountryId?'Buyer '+esc(countryLabel(x.buyerCountryId))+' · ':'')+(x.sellerCountryId?'Seller '+esc(countryLabel(x.sellerCountryId)):'Counterparties unconfirmed')+'</small><small>Government role '+esc(human(x.governmentInvolvement||'NOT_ESTABLISHED'))+' · Confidence '+fmt((num(x.confidence)||0)*100)+'%</small>'+actorDetails+'<small>Other countries: '+esc(human(x.otherCountriesKnow||'NOT_RECORDED'))+'</small></article>';
 }).join('');
 const laneButtons=[
  ['RAW_RESOURCE','RAW RESOURCES','Natural resources','assets/omega-global-market/raw-mining.svg'],
  ['FACTORY_PRODUCT','FACTORY PRODUCTS','Manufactured goods','assets/omega-global-market/factory-refinery.svg'],
  ['FOOD_PRODUCT','FOOD PRODUCTS','Agriculture & food','assets/omega-global-market/food-products.svg']
 ].map(([id,label,sub,img])=>'<button type="button" class="omega-bm-lane" data-bm-lane="'+id+'" aria-pressed="'+(validLane===id?'true':'false')+'"><img src="'+img+'" alt=""><span>'+label+'<small>'+sub+'</small></span></button>').join('');
 const sellerTable=offers.length?
  '<div class="omega-bm-table-wrap"><table class="omega-bm-board-table"><thead><tr><th>Seller country</th><th>Available stock</th><th>Shadow price</th><th>Detection risk</th><th>Channel</th><th>Order</th></tr></thead><tbody>'+cards+'</tbody></table></div>'+offerMore:
  '<div class="omega-bm-empty">'+(scanning?'Seller-country checks are running in small batches.':'Select a commodity and scan. Offers appear only after stock, route, policy and price checks.')+'</div>';
 const buyerTable=buyerSignals.length?
  '<div class="omega-bm-table-wrap"><table class="omega-bm-board-table"><thead><tr><th>Potential buyer country</th><th>Supply gap</th><th>Demand / day</th><th>Stock coverage</th><th>Evidence</th></tr></thead><tbody>'+buyerRows+'</tbody></table></div>'+buyerMore:
  '<div class="omega-bm-empty">No other country currently has a matching recorded shortage signal for this commodity. This list does not invent buyers from country stereotypes.</div>';
 const confirmedTable=participationRows?
  '<div class="omega-bm-table-wrap"><table class="omega-bm-board-table"><thead><tr><th>Buyer country</th><th>Seller country</th><th>Commodity</th><th>Quantity</th><th>Recorded status</th><th>Unit price</th></tr></thead><tbody>'+participationRows+'</tbody></table></div>':
  '<div class="omega-bm-empty">No other country has a persisted request, negotiation or accepted offer for this commodity yet.</div>';
 root.innerHTML=styles()+'<section class="omega-bm"><header class="omega-bm-head"><div class="omega-bm-head-main"><div class="omega-bm-kicker">OMEGA WORLD ECONOMY · TRADE INTELLIGENCE DIVISION</div><h2>Black Market Network</h2><p class="omega-bm-sub">Country-by-country shadow trade: verified sellers, evidence-backed buyer demand and recorded offer decisions.</p><div class="omega-bm-scope">Active country · '+esc(countryLabel(c||'COUNTRY NOT SELECTED'))+'</div></div><span class="omega-bm-classified">CLASSIFIED<br>OFF-GRID TRADE</span></header>'+
  '<div class="omega-bm-grid"><div class="omega-bm-stat"><small>Verified seller offers</small><strong>'+count(offers.length)+'</strong><em>Stock and route checks passed</em></div><div class="omega-bm-stat"><small>Potential buyer countries</small><strong>'+count(buyerSignals.length)+'</strong><em>Recorded unmet demand</em></div><div class="omega-bm-stat"><small>Accepted offers</small><strong>'+count(acceptedDeals)+'</strong><em>Persisted ACCEPTED status only</em></div><div class="omega-bm-stat"><small>Active local pipeline</small><strong>'+count(active.length)+'</strong><em>'+count(settled)+' locally settled</em></div></div>'+
  '<div class="omega-bm-body"><p class="omega-bm-brief"><span>◆</span><span><strong>How to read this market:</strong> A seller appears only when the Black Market runtime verifies its stock, quote, route and policies. Buyer demand is a potential interest signal, not a confirmed order. An offer is labelled accepted only after the country deal record says ACCEPTED.</span></p>'+
  '<div class="omega-bm-tools"><div class="omega-bm-lanes" role="group" aria-label="Commodity categories">'+laneButtons+'</div><div class="omega-bm-tool-row"><div class="omega-bm-field"><label for="omega-bm-resource">Select commodity</label><select id="omega-bm-resource" data-bm-resource>'+opts+'</select></div><div class="omega-bm-field"><label for="omega-bm-quantity">Required quantity</label><input id="omega-bm-quantity" type="number" min="0.001" step="any" value="'+esc(root.__omegaBmFindQuantity||'1')+'" data-bm-find-quantity></div><button type="button" data-bm-find '+(scanning?'disabled':'')+'>'+(scanning?'SCANNING…':'SCAN SELLER NETWORK')+'</button></div><div class="omega-bm-progress" data-bm-scan-progress aria-live="polite">'+(scanning?'Seller-country scan is in progress.':'Opening this screen does not trigger a world-wide search.')+'</div></div>'+
  (root.__omegaBmOutcome?'<div class="omega-bm-outcome" role="status">'+esc(root.__omegaBmOutcome)+'</div>':'')+
  '<section class="omega-bm-section"><header><strong>01 · Seller offers</strong><span>'+count(offers.length)+' verified offer(s) · '+esc(selected?.name||selected?.title||selectedProduct||'No selected commodity')+'</span></header><div class="omega-bm-section-note">Countries with available tradeable stock, a quote and a usable route. Expand a row for the seller’s motive, actor evidence, legal comparison, risk and negotiation.</div>'+sellerTable+'</section>'+
  '<section class="omega-bm-section"><header><strong>02 · Countries interested in buying</strong><span>'+count(buyerSignals.length)+' potential buyer(s)</span></header><div class="omega-bm-section-note">A country appears here when its saved demand runtime records unmet demand or stock coverage below its target. This is a buying-interest signal, not a Black Market request or acceptance.</div>'+buyerTable+'</section>'+
  '<section class="omega-bm-section"><header><strong>03 · Recorded offers and acceptances</strong><span>'+count(participationDeals.length)+' saved deal(s) · '+count(acceptedDeals)+' accepted</span></header><div class="omega-bm-section-note">Buyer and seller flags are read from persisted country deal records. Only the exact ACCEPTED state counts as acceptance.</div>'+confirmedTable+'</section>'+
  '<div class="omega-bm-lower">'+
   '<section class="omega-bm-panel"><header><strong>04 · Country operations ledger</strong><span>'+count(active.length)+' active · '+count(cases.length)+' investigation file(s)</span></header><div class="omega-bm-panel-body">'+(dealHtml||'<div class="omega-bm-empty">No Black Market deal has been recorded for this country.</div>')+(caseHtml||'')+'</div></section>'+
   '<section class="omega-bm-panel"><header><strong>05 · Intelligence, response & transit</strong><span>'+count(transits.filter(x=>x.status==='IN_TRANSIT').length)+' transit · '+count(responses.length)+' response(s)</span></header><div class="omega-bm-panel-body">'+(transitHtml||'')+(reportHtml||'')+(respHtml||'')+(!transitHtml&&!reportHtml&&!respHtml?'<div class="omega-bm-empty">No discovered network report, foreign response or covert transit exists in this country intelligence file.</div>':'')+'</div></section>'+
  '</div>'+
  '<p class="omega-bm-risknote">Flags and full country names are presentation only. Country roles depend on current demand, verified stock, policy, relationship and route evidence. Intelligence reports remain country-scoped: another country does not automatically receive the player’s private discovery report.</p></div></section>';
 if(!root.__omegaBmBound){
  root.addEventListener('click',function(event){
   const t=event.target?.closest?.('button');if(!t||!root.contains(t))return;
   if(t.hasAttribute('data-bm-lane')){
    const next=t.getAttribute('data-bm-lane');
    root.__omegaBmLane=['RAW_RESOURCE','FACTORY_PRODUCT','FOOD_PRODUCT'].includes(next)?next:'RAW_RESOURCE';
    root.__omegaBmResource='';root.__omegaBmOffers=[];root.__omegaBmVisibleOffers=6;root.__omegaBmOutcome='';render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-negotiate')){
    const offerId=t.getAttribute('data-bm-negotiate'),seller=t.getAttribute('data-bm-seller'),rid=t.getAttribute('data-bm-resource');
    const qf=Array.from(root.querySelectorAll('[data-bm-quantity]')).find(x=>x.getAttribute('data-bm-quantity')===offerId),bf=Array.from(root.querySelectorAll('[data-bm-bid]')).find(x=>x.getAttribute('data-bm-bid')===offerId);
    const result=bm.negotiateOffer({buyerCountryId:root.__omegaBmCountry||c,sellerCountryId:seller,resourceId:rid,offerId,quantity:Number(qf?.value),bidUnitPrice:Number(bf?.value)});
    root.__omegaBmNegotiation=result.negotiation||null;root.__omegaBmOutcome=result.accepted?(result.decision==='COUNTERED'?'Broker countered at '+money(result.negotiation.counterUnitPrice,result.negotiation.currency||'USD')+' per unit. Accept the counter before ordering.':'Broker accepted the negotiated price. Place the order to continue.'):(result.reason||'NEGOTIATION_REJECTED');render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-accept-counter')){
    const result=bm.acceptCounterOffer(root.__omegaBmCountry||c,t.getAttribute('data-bm-accept-counter'));
    root.__omegaBmNegotiation=result.negotiation||null;root.__omegaBmOutcome=result.accepted?'Counter offer accepted. Place the order to continue.':(result.reason||'COUNTER_ACCEPTANCE_FAILED');render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-show-more')){
    root.__omegaBmVisibleOffers=Math.min(24,Math.max(6,Number(root.__omegaBmVisibleOffers)||6)+6);
    render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-find')){
    const rid=String(root.querySelector('[data-bm-resource]')?.value||''),q=Number(root.querySelector('[data-bm-find-quantity]')?.value);
    root.__omegaBmResource=rid;root.__omegaBmVisibleOffers=6;root.__omegaBmNegotiation=null;
    if(!rid||!Number.isFinite(q)||q<=0){root.__omegaBmOffers=[];root.__omegaBmOutcome='Choose a valid commodity and a quantity greater than zero.';render(root,root.__omegaBmCountry||c);return;}
    const r=bm.getOffers(root.__omegaBmCountry||c,rid,q);root.__omegaBmOffers=r.status==='READY'?(Array.isArray(r.offers)?r.offers:[]):[];
    root.__omegaBmOutcome=r.status==='READY'?(r.offers.length?'Found '+r.offers.length+' seller offer(s).':'No executable offer meets the current stock and policy checks.'):(r.reason||r.status);
    render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-buy')){
    const offerId=t.getAttribute('data-bm-buy'),seller=t.getAttribute('data-bm-seller'),rid=t.getAttribute('data-bm-resource');
    const f=Array.from(root.querySelectorAll('[data-bm-quantity]')).find(x=>x.getAttribute('data-bm-quantity')===offerId),quantity=Number(f?.value);
    if(!Number.isFinite(quantity)||quantity<=0){root.__omegaBmOutcome='Enter a valid order quantity greater than zero.';render(root,root.__omegaBmCountry||c);return;}
    const negotiation=root.__omegaBmNegotiation;
    if(negotiation&&negotiation.offerId===offerId&&negotiation.status==='COUNTERED'){root.__omegaBmOutcome='Accept the broker counteroffer before placing this order.';render(root,root.__omegaBmCountry||c);return;}
    const r=bm.createDeal({buyerCountryId:root.__omegaBmCountry||c,sellerCountryId:seller,resourceId:rid,offerId,quantity,
     negotiationId:negotiation&&negotiation.offerId===offerId&&negotiation.status==='ACCEPTED'?negotiation.negotiationId:undefined});
    root.__omegaBmOutcome=r.accepted?'Trade request recorded. Seller review, inspection and authoritative settlement are pending.':(r.reason||'BLACK_MARKET_ORDER_REJECTED');
    const next=bm.getOffers(root.__omegaBmCountry||c,rid,quantity);root.__omegaBmResource=rid;root.__omegaBmVisibleOffers=6;root.__omegaBmOffers=next.status==='READY'?(Array.isArray(next.offers)?next.offers:[]):[];root.__omegaBmNegotiation=null;render(root,root.__omegaBmCountry||c);return;
   }
  });
  root.__omegaBmBound=true;
 }
 return{ok:true,countryId:c,offerCount:offers.length,dealCount:deals.length};
}
g.Omega=g.Omega||{};g.Omega.BlackMarketUI=Object.freeze({version:'1.3.0',render});g.OmegaBlackMarketUI=g.Omega.BlackMarketUI;
})(typeof window!=='undefined'?window:globalThis);
