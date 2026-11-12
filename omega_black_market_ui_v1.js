/* OMEGA BLACK MARKET UI v1.3.0 · Country participation and progressive market scan */
(function(g){
'use strict';
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function fmt(v){const n=num(v);return n===null?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n);}
function money(v,c){const n=num(v);if(n===null)return'—';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:String(c||'USD'),maximumFractionDigits:2}).format(n);}catch(_){return fmt(n)+' '+String(c||'');}}
function token(v){return String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
function gameState(){return g.Game?.state||g.gameState||g.Omega?.Simulation?.world?.state||{};}
function flagFromIso2(code){
 const s=String(code||'').trim().toUpperCase();if(!/^[A-Z]{2}$/.test(s))return null;
 return Array.from(s,c=>String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-65)).join('');
}
function countryMeta(value){
 const code=String(value||'').trim().toUpperCase(),runtime=g.OmegaCountryRuntimeData||g.Omega?.CountryRuntimeData||null;
 let profile=null;
 try{profile=runtime?.resolveCountry?.(code)||null;}catch(_){}
 if(!profile){
  try{profile=(g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity)?.resolveCountry?.(code)||null;}catch(_){}
 }
 const raw=profile?.raw||profile?.profile||profile||{};
 let name=raw?.name||raw?.officialName||raw?.shortName||profile?.name||profile?.officialName||profile?.displayName||'';
 if(!name||name===code)name=code;
 let flag=null;
 try{flag=runtime?.flagFor?.(code)||null;}catch(_){}
 if(!flag)flag=flagFromIso2(raw?.countryCode||raw?.iso2||profile?.countryCode||profile?.iso2);
 return{code,name:String(name),flag:flag||'🏳️'};
}
function countryCell(value,sub){
 const c=countryMeta(value),extra=sub?'<small>'+esc(sub)+'</small>':'';
 return'<span class="omega-bm-country-cell"><span class="omega-bm-flag" aria-label="'+esc(c.name)+' flag">'+esc(c.flag)+'</span><span class="omega-bm-country-name">'+esc(c.name)+extra+'</span></span>';
}
function productName(row){return String(row?.name||row?.title||row?.displayName||row?.id||'Unknown product');}
function productsFor(root){
 if(Array.isArray(root.__omegaBmProducts))return root.__omegaBmProducts;
 const api=g.OmegaGlobalMarket||g.Omega?.GlobalMarket;
 let rows=[];try{rows=api?.productCatalog?.()||[];}catch(_){}
 root.__omegaBmProducts=Array.isArray(rows)?rows.filter(x=>x?.id&&['RAW_RESOURCE','FACTORY_PRODUCT','FOOD_PRODUCT'].includes(String(x.productType||'').toUpperCase())):[];
 return root.__omegaBmProducts;
}
function lookup(map,key){
 if(!map||typeof map!=='object')return undefined;
 const wanted=token(key),found=Object.keys(map).find(x=>token(x)===wanted);
 return found===undefined?undefined:map[found];
}
function demandSignals(resourceId,playerCountryId){
 const resources=gameState()?.resource;
 if(!resources||typeof resources!=='object')return[];
 const rows=[];
 for(const [countryId,record] of Object.entries(resources)){
  const code=String(countryId||'').trim().toUpperCase();if(!/^[A-Z0-9]{2,3}$/.test(code)||code===playerCountryId)continue;
  const runtime=record?.demandRuntime,by=runtime?.byResource,demand=lookup(by,resourceId);
  if(!demand||typeof demand!=='object')continue;
  const unmet=Math.max(0,num(demand.unmetDemand)||0),perDay=Math.max(0,num(demand.demandPerDay??demand.demand)||0),
   coverage=num(demand.stockCoverageDays),target=num(demand.stockCoverageTargetDays),
   low=perDay>0&&coverage!==null&&target!==null&&target>coverage;
  if(unmet<=1e-8&&!low)continue;
  const gap=low?Math.max(unmet,perDay*(target-coverage)):unmet;if(!(gap>0))continue;
  const stale=Math.max(0,(num(gameState()?.simulation?.turn??gameState()?.turn)??0)-(num(runtime.lastTurn)??num(gameState()?.simulation?.turn??gameState()?.turn)??0)),
   freshness=stale>30?.45:(stale>10?.7:1),
   pressure=Math.max(num(demand.procurementScore)||0,perDay>0?unmet/perDay:0,low?(target-coverage)/Math.max(target,1):0)*freshness;
  rows.push({countryId:code,quantity:gap,demandPerDay:perDay,coverage,target,pressure,
   reason:demand.activeFactoryInputDemandPerDay>0?'FACTORY INPUT SHORTAGE':'DOMESTIC SUPPLY GAP',
   status:String(demand.status||'DEMAND SIGNAL')});
 }
 return rows.sort((a,b)=>b.pressure-a.pressure||b.quantity-a.quantity||a.countryId.localeCompare(b.countryId));
}
function globalDeals(resourceId){
 const trade=gameState()?.trade;if(!trade||typeof trade!=='object')return[];
 const seen=new Set(),rows=[];
 for(const [scope,record] of Object.entries(trade)){
  const deals=Array.isArray(record?.blackMarketDeals)?record.blackMarketDeals:[];
  for(const row of deals){
   if(!row||token(row.resourceId)!==token(resourceId))continue;
   const key=String(row.dealId||[row.buyerCountryId,row.sellerCountryId,row.resourceId,row.createdTurn].join(':'));
   if(seen.has(key))continue;seen.add(key);
   rows.push({...row,buyerCountryId:row.buyerCountryId||scope});
  }
 }
 return rows.sort((a,b)=>(num(b.createdTurn)||0)-(num(a.createdTurn)||0)).slice(0,24);
}
function statusLabel(value){
 const key=String(value||'UNKNOWN').toUpperCase();
 const labels={REQUESTED:'REQUEST SENT',SENT:'AWAITING SELLER RESPONSE',NEGOTIATING:'NEGOTIATING',
  ACCEPTED:'OFFER ACCEPTED',IN_TRANSIT:'IN TRANSIT',ARRIVAL_PENDING:'ARRIVAL PENDING',
  SETTLED:'SETTLED',SETTLED_UNDER_INVESTIGATION:'UNDER INVESTIGATION',
  INTERCEPTED:'INTERCEPTED',FAILED:'REJECTED',EXPIRED:'EXPIRED'};
 return labels[key]||key.replace(/_/g,' ');
}
function styles(){return '<style>'+
'.omega-bm{--bm-bg:#06152a;--bm-panel:#0b2241;--bm-panel2:#0d2b50;--bm-line:#245582;--bm-muted:#a8c4df;--bm-text:#f1f8ff;--bm-cyan:#27c9ff;--bm-blue:#167ce5;--bm-green:#36d6b1;color:var(--bm-text);background:linear-gradient(145deg,#06142a,#071d39 55%,#06152c);border:1px solid #1a659d;border-radius:13px;overflow:hidden;box-shadow:0 0 24px rgba(0,149,255,.13),inset 0 1px rgba(255,255,255,.08);font-family:Arial,Helvetica,sans-serif;min-width:0;isolation:isolate}'+
'.omega-bm *{box-sizing:border-box}.omega-bm button,.omega-bm input,.omega-bm select{font:inherit}.omega-bm-head{position:relative;display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:124px;padding:19px 22px;background:linear-gradient(90deg,rgba(3,18,42,.96),rgba(4,29,64,.80) 56%,rgba(3,17,39,.93)),url("assets/omega-global-market/market-header.svg") center/cover no-repeat;border-bottom:1px solid #218bd0;overflow:hidden}.omega-bm-head:after{content:"";position:absolute;right:8%;top:15px;width:130px;height:94px;border:1px solid rgba(47,196,255,.28);border-radius:50%;box-shadow:0 0 0 15px rgba(47,196,255,.04),0 0 0 31px rgba(47,196,255,.025);pointer-events:none}.omega-bm-kicker{font-size:10px;letter-spacing:.18em;color:#7ddcff;font-weight:900}.omega-bm-head h1{font-size:clamp(22px,3vw,34px);line-height:1.05;margin:7px 0 5px;letter-spacing:.055em;text-transform:uppercase;color:#fff;text-shadow:0 0 15px rgba(39,201,255,.24)}.omega-bm-sub{font-size:12px;line-height:1.5;color:#c5d9ef;margin:0;max-width:680px}.omega-bm-scope{display:inline-flex;align-items:center;gap:7px;margin-top:9px;font-size:11px;color:#e0f4ff;font-weight:700}.omega-bm-scope:before{content:"";width:7px;height:7px;border-radius:50%;background:#42dfb8;box-shadow:0 0 10px #42dfb8}.omega-bm-classified{z-index:1;flex:none;border:1px solid #e5b75d;background:rgba(31,31,35,.82);color:#ffdf9a;padding:9px 12px;border-radius:5px;font-size:10px;line-height:1.4;font-weight:900;letter-spacing:.11em;text-align:center}.omega-bm-lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:12px 14px 0}.omega-bm-lane{display:flex;align-items:center;gap:10px;min-width:0;min-height:62px;padding:8px 12px;border:1px solid #28649b;border-radius:8px;background:linear-gradient(120deg,#102e54,#071c37);color:#d5edff;font-weight:800;text-align:left;cursor:pointer}.omega-bm-lane img{width:42px;height:42px;object-fit:contain;flex:none;filter:drop-shadow(0 0 6px rgba(25,169,255,.3))}.omega-bm-lane span{font-size:12px;line-height:1.25}.omega-bm-lane small{display:block;font-size:10px;color:#99c4e5;font-weight:600;margin-top:3px}.omega-bm-lane[aria-pressed="true"]{border-color:#32cfff;background:linear-gradient(120deg,#087ac3,#0b315c);box-shadow:0 0 15px rgba(39,201,255,.24),inset 0 0 14px rgba(39,201,255,.12);color:#fff}.omega-bm-layout{display:grid;grid-template-columns:minmax(210px,285px) minmax(0,1fr);gap:12px;padding:12px 14px 15px;align-items:start}.omega-bm-box{min-width:0;border:1px solid #22598a;border-radius:9px;background:linear-gradient(150deg,rgba(12,39,72,.98),rgba(5,21,44,.98));box-shadow:inset 0 1px rgba(255,255,255,.045),0 7px 18px rgba(0,0,0,.16);overflow:hidden}.omega-bm-box>header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 13px;background:linear-gradient(90deg,#123966,#0a2548);border-bottom:1px solid #1d5487}.omega-bm-box>header strong{font-size:12px;letter-spacing:.055em;text-transform:uppercase;color:#eef8ff}.omega-bm-box>header span{font-size:10px;color:#a9c9e5}.omega-bm-product-head{padding:13px}.omega-bm-product-head label{display:block;font-size:10px;color:#a8c8e3;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}.omega-bm-search{width:100%;min-width:0;min-height:38px;padding:8px 10px;border:1px solid #3978a8;border-radius:6px;background:#061a34;color:#fff;font-size:12px;outline:none}.omega-bm-product-list{max-height:490px;overflow:auto;padding:0 8px 9px}.omega-bm-product{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:43px;padding:8px 10px;border:1px solid transparent;border-bottom-color:rgba(91,154,198,.15);border-radius:5px;background:transparent;color:#e1effd;text-align:left;cursor:pointer}.omega-bm-product:hover{background:rgba(22,124,229,.15)}.omega-bm-product[aria-pressed="true"]{background:linear-gradient(90deg,rgba(0,139,224,.44),rgba(10,55,94,.65));border-color:#2dcaff;box-shadow:inset 0 0 9px rgba(39,201,255,.15)}.omega-bm-product strong{font-size:12px;font-weight:800}.omega-bm-product small{font-size:9px;color:#94bce0}.omega-bm-empty-products{padding:16px;color:#aac5df;font-size:12px;line-height:1.5;text-align:center}.omega-bm-main{display:grid;gap:11px;min-width:0}.omega-bm-product-hero{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid #2369a4;border-radius:9px;background:linear-gradient(105deg,rgba(6,38,77,.98),rgba(5,23,49,.96)),url("assets/omega-global-market/raw-mining.svg") right center/auto 100% no-repeat;min-height:86px}.omega-bm-product-hero small{display:block;color:#8edbff;font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.omega-bm-product-hero h2{font-size:clamp(19px,2.2vw,27px);margin:5px 0 2px;color:#fff}.omega-bm-product-hero p{margin:0;color:#b4d0ea;font-size:11px}.omega-bm-product-hero .omega-bm-product-type{border:1px solid rgba(68,191,255,.48);background:rgba(5,26,49,.8);border-radius:5px;padding:8px 10px;color:#b5e7ff;font-size:10px;font-weight:900;text-align:center}.omega-bm-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.omega-bm-stat{min-width:0;padding:10px 11px;border:1px solid #235b8e;border-radius:7px;background:linear-gradient(145deg,#0c2d55,#071b37)}.omega-bm-stat small{display:block;color:#a6c5e2;font-size:9px;line-height:1.35;font-weight:800;letter-spacing:.075em;text-transform:uppercase}.omega-bm-stat strong{display:block;margin-top:5px;font-size:20px;color:#f6fbff;font-variant-numeric:tabular-nums}.omega-bm-stat em{display:block;margin-top:3px;font-size:9px;color:#82b4dc;font-style:normal}.omega-bm-toolbar{display:grid;grid-template-columns:minmax(90px,150px) auto minmax(120px,1fr);gap:8px;align-items:end;padding:11px;border:1px solid #23649c;border-radius:8px;background:linear-gradient(135deg,#0b2b52,#071b37)}.omega-bm-field{display:flex;flex-direction:column;gap:5px;min-width:0}.omega-bm-field label{font-size:10px;color:#a9cce8;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.omega-bm input{width:100%;min-width:0;min-height:37px;border:1px solid #3678a8;border-radius:5px;padding:8px 9px;background:#06182e;color:#fff;font-size:12px}.omega-bm-btn{min-height:37px;border:1px solid #33c5fa;border-radius:5px;padding:8px 13px;background:linear-gradient(145deg,#087fca,#07519a);color:#fff;font-size:10px;font-weight:900;letter-spacing:.055em;cursor:pointer;box-shadow:0 0 10px rgba(39,201,255,.12)}.omega-bm-btn:hover:not(:disabled){filter:brightness(1.13)}.omega-bm-btn:disabled{opacity:.45;cursor:not-allowed}.omega-bm-btn--quiet{border-color:#5585ad;background:linear-gradient(145deg,#163a5e,#0b2543);color:#d5edff}.omega-bm-btn--green{border-color:#40d9b5;background:linear-gradient(145deg,#097b75,#07534f);color:#ecfffb}.omega-bm-progress{min-width:0;color:#a9d7f5;font-size:11px;line-height:1.5;align-self:center}.omega-bm-outcome{padding:9px 11px;border-left:3px solid #35c7fa;border-radius:4px;background:rgba(20,106,154,.2);color:#d5efff;font-size:11px;line-height:1.5}.omega-bm-section-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}.omega-bm-section{min-width:0;border:1px solid #28689e;border-radius:8px;background:linear-gradient(150deg,#0b2a50,#061a35);overflow:hidden}.omega-bm-section>header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;background:linear-gradient(90deg,#123e70,#0a2b51);border-bottom:1px solid #28689e}.omega-bm-section>header strong{font-size:11px;color:#f0f9ff;letter-spacing:.06em;text-transform:uppercase}.omega-bm-section>header span{font-size:9px;color:#a9cee9;text-align:right}.omega-bm-note{padding:7px 10px;color:#9fc4e5;font-size:10px;line-height:1.4;border-bottom:1px solid rgba(94,160,203,.16)}.omega-bm-table-wrap{width:100%;overflow:auto}.omega-bm-table{width:100%;border-collapse:collapse;min-width:430px}.omega-bm-table th{padding:8px 9px;background:rgba(5,20,40,.78);color:#a6c9e7;font-size:9px;text-align:left;text-transform:uppercase;letter-spacing:.055em;white-space:nowrap}.omega-bm-table td{padding:8px 9px;border-top:1px solid rgba(90,153,196,.19);color:#e5f2ff;font-size:11px;vertical-align:middle;white-space:nowrap}.omega-bm-table tr:hover td{background:rgba(20,105,173,.13)}.omega-bm-country-cell{display:flex;align-items:center;gap:8px;min-width:0}.omega-bm-flag{display:inline-grid;place-items:center;flex:none;min-width:27px;height:21px;border:1px solid rgba(156,204,244,.32);border-radius:3px;background:rgba(2,13,27,.8);font-size:17px;line-height:1}.omega-bm-country-name{display:block;color:#f2f8ff;font-weight:800;font-size:11px;white-space:normal;line-height:1.25}.omega-bm-country-name small{display:block;margin-top:2px;color:#91b9db;font-size:9px;font-weight:600}.omega-bm-muted{color:#9bb9d7!important;font-size:10px}.omega-bm-value{font-weight:800;font-variant-numeric:tabular-nums;color:#f6fbff!important}.omega-bm-positive{color:#63e5bf!important}.omega-bm-warning{color:#ffd17f!important}.omega-bm-risk{display:inline-block;padding:4px 6px;border:1px solid rgba(255,195,105,.35);border-radius:4px;background:rgba(118,70,16,.24);color:#ffd58b;font-size:9px;font-weight:900}.omega-bm-tag{display:inline-block;padding:4px 6px;border:1px solid rgba(70,201,255,.34);border-radius:4px;background:rgba(9,92,143,.24);color:#a8e6ff;font-size:9px;font-weight:900}.omega-bm-table .omega-bm-btn{min-height:30px;padding:6px 8px;font-size:9px}.omega-bm-inline-input{width:84px!important;min-height:30px!important;padding:5px 6px!important;font-size:10px!important}.omega-bm-offer-actions{display:flex;align-items:center;gap:5px}.omega-bm-detail{margin:8px 9px 9px;border:1px solid rgba(97,158,200,.2);border-radius:5px;background:rgba(3,15,32,.45)}.omega-bm-detail summary{padding:7px 9px;color:#9bdcff;font-size:10px;font-weight:800;cursor:pointer}.omega-bm-detail-body{padding:6px 9px 9px;color:#b7d0e7;font-size:10px;line-height:1.6}.omega-bm-decision{display:grid;gap:3px;min-width:0}.omega-bm-decision strong{color:#f4f9ff;font-size:10px}.omega-bm-decision small{color:#98bbda;font-size:9px}.omega-bm-ledger{padding:9px}.omega-bm-ledger-row{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(80px,.7fr) minmax(95px,.8fr) minmax(105px,.8fr);gap:8px;align-items:center;padding:9px 7px;border-top:1px solid rgba(90,153,196,.17)}.omega-bm-ledger-row:first-child{border-top:0}.omega-bm-ledger-status{display:inline-block;padding:4px 6px;border-radius:4px;background:rgba(8,131,176,.22);border:1px solid rgba(51,196,243,.35);color:#a6e7ff;font-size:9px;font-weight:900}.omega-bm-ledger-status.is-alert{background:rgba(135,72,18,.25);border-color:rgba(255,186,96,.42);color:#ffd390}.omega-bm-more{display:flex;justify-content:center;padding:8px;border-top:1px solid rgba(90,153,196,.17)}.omega-bm-empty{padding:16px 12px;color:#a9c5df;font-size:11px;line-height:1.55;text-align:center}.omega-bm-lower{display:grid;grid-template-columns:1fr 1fr;gap:10px}.omega-bm-intel{display:grid;gap:7px;padding:10px}.omega-bm-intel-row{padding:8px 9px;border:1px solid rgba(95,157,202,.2);border-radius:5px;background:rgba(2,15,32,.35)}.omega-bm-intel-row strong{display:block;color:#eef8ff;font-size:10px}.omega-bm-intel-row small{display:block;color:#a1c1df;font-size:9px;line-height:1.45;margin-top:4px}.omega-bm-footnote{margin:0;padding:9px 11px;border-top:1px solid rgba(65,135,184,.2);color:#91afca;font-size:9px;line-height:1.55}.omega-bm button:focus-visible,.omega-bm input:focus-visible{outline:2px solid #71dfff;outline-offset:2px}'+
'@media(max-width:900px){.omega-bm-layout{grid-template-columns:minmax(175px,220px) minmax(0,1fr);gap:9px;padding:10px}.omega-bm-lanes{gap:6px;padding:10px 10px 0}.omega-bm-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.omega-bm-section-grid,.omega-bm-lower{grid-template-columns:1fr}.omega-bm-toolbar{grid-template-columns:110px auto}.omega-bm-progress{grid-column:1/-1}}'+
'@media(max-width:650px){.omega-bm-head{min-height:112px;padding:15px}.omega-bm-head:after{right:-15px}.omega-bm-lanes{grid-template-columns:repeat(3,minmax(0,1fr));padding:8px 8px 0}.omega-bm-lane{display:block;min-height:60px;padding:7px 6px;text-align:center}.omega-bm-lane img{display:block;margin:0 auto 3px;width:27px;height:27px}.omega-bm-lane span{font-size:9px}.omega-bm-lane small{font-size:8px}.omega-bm-layout{grid-template-columns:1fr;padding:9px}.omega-bm-product-list{display:flex;gap:6px;max-height:none;overflow:auto;padding:0 8px 9px}.omega-bm-product{flex:none;min-width:112px;max-width:155px;min-height:50px;border:1px solid #255985;background:#0a2649}.omega-bm-product-head{padding:9px}.omega-bm-main{gap:8px}.omega-bm-product-hero{min-height:78px;padding:11px;background-size:auto 85%}.omega-bm-stats{gap:6px}.omega-bm-stat{padding:8px}.omega-bm-stat strong{font-size:18px}.omega-bm-toolbar{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:9px}.omega-bm-toolbar .omega-bm-btn{width:100%}.omega-bm-progress{grid-column:1/-1}.omega-bm-section-grid{grid-template-columns:1fr}.omega-bm-table{min-width:450px}.omega-bm-ledger-row{grid-template-columns:minmax(0,1fr) auto;gap:5px}.omega-bm-ledger-row>div:nth-child(2){display:none}.omega-bm-ledger-row>div:nth-child(3){grid-column:1}.omega-bm-ledger-row>div:nth-child(4){grid-column:2;grid-row:1/3}.omega-bm-country-name{font-size:10px}}'+
'@media(prefers-reduced-motion:reduce){.omega-bm *{scroll-behavior:auto!important;transition:none!important}}'+
'</style>';}
function render(root,countryValue){
 const bm=g.OmegaBlackMarket||g.Omega?.BlackMarket;
 if(!root||!bm)return{ok:false,reason:'BLACK_MARKET_RUNTIME_UNAVAILABLE'};
 const c=String(countryValue||g.OmegaMinistryViewCountry||g.OmegaCabinetUI?.activeCountry||g.currentActiveCountry||'').trim().toUpperCase();
 root.__omegaBmCountry=c;
 const products=productsFor(root),lane=String(root.__omegaBmLane||'RAW_RESOURCE'),
  validLane=['RAW_RESOURCE','FACTORY_PRODUCT','FOOD_PRODUCT'].includes(lane)?lane:'RAW_RESOURCE';
 const laneProducts=products.filter(x=>String(x.productType||'').toUpperCase()===validLane);
 if(!root.__omegaBmResource||!laneProducts.some(x=>x.id===root.__omegaBmResource))root.__omegaBmResource=laneProducts[0]?.id||'';
 const rid=String(root.__omegaBmResource||''),selected=laneProducts.find(x=>String(x.id)===rid)||null,
  allOffers=Array.isArray(root.__omegaBmOffers)?root.__omegaBmOffers:[],
  offers=rid?allOffers.filter(x=>token(x.resourceId)===token(rid)):[],
  dealRows=typeof bm.getDeals==='function'?bm.getDeals(c):[],
  caseRows=typeof bm.getCases==='function'?bm.getCases(c):[],
  responseRows=typeof bm.getResponses==='function'?bm.getResponses(c):[],
  reportRows=typeof bm.getNetworkReports==='function'?bm.getNetworkReports(c):[],
  transitRows=typeof bm.getTransits==='function'?bm.getTransits(c):[];
 const deals=Array.isArray(dealRows)?dealRows:[],cases=Array.isArray(caseRows)?caseRows:[],
  responses=Array.isArray(responseRows)?responseRows:[],reports=Array.isArray(reportRows)?reportRows:[],
  transits=Array.isArray(transitRows)?transitRows:[];
 const active=deals.filter(x=>!['FAILED','EXPIRED'].includes(String(x.status||'').toUpperCase())),
  settled=deals.filter(x=>['SETTLED','SETTLED_UNDER_INVESTIGATION'].includes(String(x.status||'').toUpperCase())).length,
  buyers=rid?demandSignals(rid,c):[],confirmed=rid?globalDeals(rid):[],
  playerInfo=countryMeta(c),visibleOffers=Math.max(6,Math.min(24,num(root.__omegaBmOfferVisible)||6)),
  visibleBuyers=Math.max(6,Math.min(24,num(root.__omegaBmBuyerVisible)||8)),
  productLabel=selected?productName(selected):'No commodity in this category',
  scanning=!!root.__omegaBmScanning,progress=root.__omegaBmScanProgress||'Ready to scan';
 const laneMeta=[
  ['RAW_RESOURCE','RAW RESOURCES','Natural resources','assets/omega-global-market/raw-mining.svg'],
  ['FACTORY_PRODUCT','FACTORY PRODUCTS','Manufactured goods','assets/omega-global-market/factory-refinery.svg'],
  ['FOOD_PRODUCT','FOOD PRODUCTS','Agricultural & food','assets/omega-global-market/food-products.svg']
 ];
 const laneButtons=laneMeta.map(([id,label,sub,img])=>'<button type="button" class="omega-bm-lane" data-bm-lane="'+id+'" aria-pressed="'+(validLane===id?'true':'false')+'"><img src="'+img+'" alt=""><span>'+label+'<small>'+sub+'</small></span></button>').join('');
 const productButtons=laneProducts.map(x=>'<button type="button" class="omega-bm-product" data-bm-product="'+esc(x.id)+'" aria-pressed="'+(String(x.id)===rid?'true':'false')+'"><strong>'+esc(productName(x))+'</strong><small>'+esc(x.unit||'—')+'</small></button>').join('');
 const offersHtml=offers.slice(0,visibleOffers).map(x=>{
  const seller=countryMeta(x.sellerCountryId),restricted=!x.legalMarketAvailable,
   tag=x.legalMarketAvailable?(num(x.expectedSavings)>0?'PRICE ADVANTAGE':'ACCESS CHANNEL'):
    (x.embargoed?'IMPORT EMBARGO':x.exportRestrictionReason?'EXPORT RESTRICTION':x.sanctionsAtQuote?'SANCTIONS':'RESTRICTED SUPPLY'),
   negotiation=root.__omegaBmNegotiation&&root.__omegaBmNegotiation.offerId===x.offerId?root.__omegaBmNegotiation:null,
   qty=Math.min(num(x.requestedQuantity)||1,num(x.availableQuantity)||1),
   risk=Math.max(0,Math.min(100,(num(x.detectionProbability)||0)*100)),
   comparisonCurrency=x.buyerCurrency||x.currency,
   foreignBasis=(Array.isArray(x.foreignPolicyBasis)?x.foreignPolicyBasis:[]).join(' · ')||'No blocking policy recorded',
   math=x.pricingBreakdown||{};
  const acceptedCounter=negotiation?.status==='COUNTERED'?'<div class="omega-bm-outcome">Broker counteroffer: '+esc(money(negotiation.counterUnitPrice,x.currency))+' / unit <button class="omega-bm-btn omega-bm-btn--green" type="button" data-bm-accept-counter="'+esc(negotiation.negotiationId)+'">ACCEPT COUNTER</button></div>':'';
  const priceText=money(x.unitPrice,x.currency),
   compareText=x.legalLandedUnitPrice===null?'No verified legal quote':
    ((num(x.expectedSavings)||0)>=0?'Expected saving ':'Expected extra cost ')+money(Math.abs(num(x.expectedSavings)||0),comparisonCurrency);
  const quantityField='<input class="omega-bm-inline-input" type="number" min="0.001" max="'+esc(x.availableQuantity)+'" step="any" value="'+esc(qty)+'" data-bm-quantity="'+esc(x.offerId)+'" aria-label="Quantity from '+esc(seller.name)+'">';
  const bidField='<input class="omega-bm-inline-input" type="number" min="0.001" step="any" value="'+esc(negotiation?.bidUnitPrice??x.unitPrice)+'" data-bm-bid="'+esc(x.offerId)+'" aria-label="Bid price for '+esc(seller.name)+'">';
  return'<tr><td>'+countryCell(x.sellerCountryId,x.brokerType==='STATE_LINKED'?'State-linked seller':'Private seller')+'</td>'+
   '<td class="omega-bm-value">'+fmt(x.availableQuantity)+' '+esc(x.unit||'')+'</td>'+
   '<td><strong class="omega-bm-value">'+esc(priceText)+'</strong><small class="omega-bm-muted">/ unit</small></td>'+
   '<td><span class="omega-bm-risk">'+fmt(risk)+'% risk</span></td>'+
   '<td><span class="omega-bm-tag'+(restricted?' omega-bm-warning':'')+'">'+esc(tag)+'</span></td>'+
   '<td><div class="omega-bm-offer-actions">'+quantityField+'<button type="button" class="omega-bm-btn" data-bm-buy="'+esc(x.offerId)+'" data-bm-seller="'+esc(x.sellerCountryId)+'" data-bm-resource="'+esc(x.resourceId)+'">BUY</button></div></td></tr>'+
   '<tr><td colspan="6"><details class="omega-bm-detail"><summary>PRICE, POLICY & INTELLIGENCE DETAILS · '+esc(seller.name)+'</summary><div class="omega-bm-detail-body">'+
    'Legal landed price: '+esc(x.legalLandedUnitPrice===null?'Not comparable':money(x.legalLandedUnitPrice,comparisonCurrency))+' · '+esc(compareText)+
    '<br>Expected delivered: '+esc(fmt(x.expectedDeliveredQuantity))+' '+esc(x.unit||'')+
    ' · Expected cargo loss: '+esc(fmt(x.expectedSeizedQuantity))+' '+esc(x.unit||'')+
    ' · Expected fine: '+esc(x.expectedFineCostBuyer===null?'Not priced':money(x.expectedFineCostBuyer,comparisonCurrency))+
    '<br>Policy evidence: '+esc(foreignBasis)+
    '<br>Price components: tariff '+esc(fmt(math.tariffDiscountPct))+'%, risk '+esc(fmt(math.riskPremiumPct))+'%, policy '+esc(fmt(math.policyPremiumPct))+'%, scarcity '+esc(fmt(math.scarcityPremiumPct))+'%, broker '+esc(fmt(math.brokerSpreadPct))+'%'+
    '<div class="omega-bm-offer-actions" style="margin-top:8px">'+bidField+'<button type="button" class="omega-bm-btn omega-bm-btn--quiet" data-bm-negotiate="'+esc(x.offerId)+'" data-bm-seller="'+esc(x.sellerCountryId)+'" data-bm-resource="'+esc(x.resourceId)+'">NEGOTIATE PRICE</button></div>'+
    acceptedCounter+'</div></details></td></tr>';
 }).join('');
 const buyerHtml=buyers.slice(0,visibleBuyers).map(x=>'<tr><td>'+countryCell(x.countryId,x.reason)+'</td>'+
  '<td class="omega-bm-value">'+fmt(x.quantity)+'</td><td>'+fmt(x.demandPerDay)+'/day</td>'+
  '<td>'+ (x.coverage===null?'—':fmt(x.coverage)+' days')+'</td>'+
  '<td><span class="omega-bm-tag">POTENTIAL BUYER</span></td></tr>').join('');
 const confirmedHtml=confirmed.slice(0,10).map(x=>{
  const status=String(x.status||'UNKNOWN').toUpperCase(),
   alert=['INTERCEPTED','SETTLED_UNDER_INVESTIGATION','FAILED','EXPIRED'].includes(status);
  return'<div class="omega-bm-ledger-row"><div><div class="omega-bm-decision">'+countryCell(x.buyerCountryId,'BUYER')+'</div><div class="omega-bm-muted">↔</div><div class="omega-bm-decision">'+countryCell(x.sellerCountryId,'SELLER')+'</div></div>'+
   '<div><strong>'+esc(x.productName||x.resourceId)+'</strong><small class="omega-bm-muted">'+fmt(x.quantity)+' '+esc(x.unit||'units')+'</small></div>'+
   '<div><span class="omega-bm-ledger-status'+(alert?' is-alert':'')+'">'+esc(statusLabel(status))+'</span></div>'+
   '<div><strong>'+esc(money(x.unitPrice,x.currency))+'</strong><small class="omega-bm-muted">Turn '+fmt(x.createdTurn)+'</small></div></div>';
 }).join('');
 const localDealHtml=active.slice(0,6).map(x=>'<article class="omega-bm-intel-row"><strong>'+esc(x.productName||x.resourceId)+' · '+esc(statusLabel(x.status))+'</strong><small>'+countryCell(x.sellerCountryId,'Seller')+' · '+fmt(x.quantity)+' '+esc(x.unit||'units')+' · '+esc(money(x.unitPrice,x.currency))+' / unit</small></article>').join('');
 const caseHtml=cases.slice(-5).reverse().map(x=>'<article class="omega-bm-intel-row"><strong>INVESTIGATION · '+esc(x.status||'OPEN')+'</strong><small>'+countryCell(x.buyerCountryId,'Buyer')+' ↔ '+countryCell(x.sellerCountryId,'Seller')+' · '+esc(x.resourceId||'Commodity')+' · Evidence '+fmt((num(x.evidenceConfidence)||0)*100)+'%</small></article>').join('');
 const responseHtml=responses.slice(-4).reverse().map(x=>'<article class="omega-bm-intel-row"><strong>FOREIGN RESPONSE · '+esc(String(x.responseType||'Response').replace(/_/g,' '))+'</strong><small>'+countryCell(x.sourceCountryId,'Issuing country')+' · Target '+countryMeta(x.targetCountryId).flag+' '+esc(countryMeta(x.targetCountryId).name)+' · '+esc(x.severity||'UNSPECIFIED')+'</small></article>').join('');
 const transitHtml=transits.filter(x=>['IN_TRANSIT','ARRIVAL_PENDING'].includes(String(x.status||'').toUpperCase())).slice(-5).reverse().map(x=>'<article class="omega-bm-intel-row"><strong>COVERT TRANSIT · '+esc(statusLabel(x.status))+'</strong><small>'+countryMeta(x.sellerCountryId).flag+' '+esc(countryMeta(x.sellerCountryId).name)+' → '+countryMeta(x.buyerCountryId).flag+' '+esc(countryMeta(x.buyerCountryId).name)+' · '+fmt(x.quantity)+' '+esc(x.unit||'units')+'</small></article>').join('');
 const reportHtml=reports.slice(-5).reverse().map(x=>'<article class="omega-bm-intel-row"><strong>INTELLIGENCE · '+esc(x.level||'UNASSESSED')+' CONFIDENCE</strong><small>'+esc(x.productName||x.resourceId||'Covert channel')+' · '+(x.buyerCountryId?countryMeta(x.buyerCountryId).flag+' '+esc(countryMeta(x.buyerCountryId).name):'Buyer unconfirmed')+' ↔ '+(x.sellerCountryId?countryMeta(x.sellerCountryId).flag+' '+esc(countryMeta(x.sellerCountryId).name):'Seller unconfirmed')+' · '+esc(x.summary||'Activity observed')+'</small></article>').join('');
 const optionSummary=offers.length?offers.length+' verified seller offer(s)':'No seller scan completed';
 const countryDeals=confirmed.filter(x=>['ACCEPTED','NEGOTIATING','SENT','REQUESTED','IN_TRANSIT','ARRIVAL_PENDING'].includes(String(x.status||'').toUpperCase()));
 const productType=validLane.replace(/_/g,' ');
 const productListSearch=String(root.__omegaBmProductSearch||'').trim().toLowerCase(),
  visibleProducts=productListSearch?laneProducts.filter(x=>productName(x).toLowerCase().includes(productListSearch)).slice(0,60):laneProducts.slice(0,60);
 root.innerHTML=styles()+
 '<section class="omega-bm"><header class="omega-bm-head"><div><div class="omega-bm-kicker">OMEGA WORLD ECONOMY · TRADE INTELLIGENCE DIVISION</div><h1>Black Market Network</h1><p class="omega-bm-sub">Covert supply channels, state-linked trade, buyer demand and seller negotiations. Country participation is shown only when supported by game records.</p><div class="omega-bm-scope">Active country: '+esc(playerInfo.flag)+' '+esc(playerInfo.name)+' · '+esc(c)+'</div></div><span class="omega-bm-classified">CLASSIFIED<br>OFF-GRID TRADE</span></header>'+
 '<nav class="omega-bm-lanes" aria-label="Commodity categories">'+laneButtons+'</nav>'+
 '<div class="omega-bm-layout"><aside class="omega-bm-box"><header><strong>Commodity board</strong><span>'+fmt(laneProducts.length)+' products</span></header>'+
 '<div class="omega-bm-product-head"><label for="omega-bm-product-search">Find a commodity</label><input id="omega-bm-product-search" class="omega-bm-search" type="search" placeholder="Search products..." value="'+esc(root.__omegaBmProductSearch||'')+'" data-bm-product-search></div>'+
 '<div class="omega-bm-product-list">'+(visibleProducts.length?productButtonsFor(visibleProducts,rid):'<div class="omega-bm-empty-products">No products match this search.</div>')+'</div></aside>'+
 '<main class="omega-bm-main"><section class="omega-bm-product-hero"><div><small>SELECTED COMMODITY · '+esc(productType)+'</small><h2>'+esc(productLabel)+'</h2><p>'+esc(selected?.unit?('Trading unit: '+selected.unit):'Select an item from the commodity board')+'</p></div><span class="omega-bm-product-type">SHADOW<br>TRADE LANE</span></section>'+
 '<div class="omega-bm-stats"><div class="omega-bm-stat"><small>Executable seller offers</small><strong>'+fmt(offers.length)+'</strong><em>'+esc(optionSummary)+'</em></div><div class="omega-bm-stat"><small>Potential buyer countries</small><strong>'+fmt(buyers.length)+'</strong><em>Observed shortage signals</em></div><div class="omega-bm-stat"><small>Recorded negotiations / deals</small><strong>'+fmt(countryDeals.length)+'</strong><em>Across visible country ledgers</em></div><div class="omega-bm-stat"><small>Active local pipeline</small><strong>'+fmt(active.length)+'</strong><em>'+fmt(settled)+' settled locally</em></div></div>'+
 '<div class="omega-bm-toolbar"><div class="omega-bm-field"><label for="omega-bm-find-quantity">Required quantity</label><input id="omega-bm-find-quantity" type="number" min="0.001" step="any" value="'+esc(root.__omegaBmFindQuantity||'1')+'" data-bm-find-quantity></div>'+
 '<button class="omega-bm-btn" type="button" data-bm-find '+(scanning?'disabled':'')+'>'+(scanning?'SCANNING NETWORK…':'SCAN SELLER NETWORK')+'</button>'+
 '<div class="omega-bm-progress" data-bm-scan-progress>'+(scanning?esc(progress):'Scan is manual. Opening this screen does not run a world-wide offer search.')+'</div></div>'+
 (root.__omegaBmOutcome?'<div class="omega-bm-outcome" role="status">'+esc(root.__omegaBmOutcome)+'</div>':'')+
 '<div class="omega-bm-section-grid"><section class="omega-bm-section"><header><strong>Seller offers</strong><span>'+fmt(offers.length)+' verified offer(s)</span></header><div class="omega-bm-note">Countries with observed available stock, usable routes and an executable seller quote for this player country.</div>'+
 (offers.length?'<div class="omega-bm-table-wrap"><table class="omega-bm-table"><thead><tr><th>Seller country</th><th>Stock</th><th>Shadow price</th><th>Risk</th><th>Policy</th><th>Order</th></tr></thead><tbody>'+offersHtml+'</tbody></table></div>'+
 (offers.length>visibleOffers?'<div class="omega-bm-more"><button type="button" class="omega-bm-btn omega-bm-btn--quiet" data-bm-show-more-offers>SHOW MORE SELLERS · '+fmt(offers.length-visibleOffers)+' LEFT</button></div>':''):'<div class="omega-bm-empty">'+(scanning?'Seller scan is running in small country batches.':'Choose a commodity and scan the seller network. No offer is assumed before stock and route checks finish.')+'</div>')+
 '</section><section class="omega-bm-section"><header><strong>Buyer demand signals</strong><span>'+fmt(buyers.length)+' country signal(s)</span></header><div class="omega-bm-note">Countries showing unmet demand or stock-coverage pressure. This indicates potential buying interest; it is not a confirmed Black Market order or acceptance.</div>'+
 (buyers.length?'<div class="omega-bm-table-wrap"><table class="omega-bm-table"><thead><tr><th>Potential buyer</th><th>Supply gap</th><th>Demand / day</th><th>Stock cover</th><th>Signal</th></tr></thead><tbody>'+buyerHtml+'</tbody></table></div>'+
 (buyers.length>visibleBuyers?'<div class="omega-bm-more"><button type="button" class="omega-bm-btn omega-bm-btn--quiet" data-bm-show-more-buyers>SHOW MORE COUNTRIES · '+fmt(buyers.length-visibleBuyers)+' LEFT</button></div>':''):'<div class="omega-bm-empty">No other country has a current, recorded shortage signal for this commodity.</div>')+
 '</section></div>'+
 '<section class="omega-bm-section"><header><strong>Confirmed offers, negotiations & acceptances</strong><span>'+fmt(confirmed.length)+' recorded deal(s)</span></header><div class="omega-bm-note">This list is based on persisted Black Market deal records. “Offer accepted” appears only when the deal status is actually ACCEPTED.</div>'+
 (confirmedHtml?'<div class="omega-bm-ledger">'+confirmedHtml+'</div>':'<div class="omega-bm-empty">No country has a recorded Black Market request, negotiation or accepted offer for this commodity yet.</div>')+
 '</section>'+
 '<div class="omega-bm-lower"><section class="omega-bm-section"><header><strong>Country operations ledger</strong><span>'+fmt(active.length)+' local active · '+fmt(cases.length)+' cases</span></header><div class="omega-bm-intel">'+
 (localDealHtml||'')+(caseHtml||'')+(transitHtml||'')+(reportHtml||'')+(responseHtml||'')+
 (!localDealHtml&&!caseHtml&&!transitHtml&&!reportHtml&&!responseHtml?'<div class="omega-bm-empty">No local deals, investigations, transit inspections or discovered country-intelligence reports.</div>':'')+
 '</div></section><section class="omega-bm-section"><header><strong>Participation rules</strong><span>Evidence labels</span></header><div class="omega-bm-intel">'+
 '<article class="omega-bm-intel-row"><strong>SELLER OFFER · VERIFIED</strong><small>Real seller stock, route and quote passed the Black Market runtime checks.</small></article>'+
 '<article class="omega-bm-intel-row"><strong>POTENTIAL BUYER · DEMAND SIGNAL</strong><small>National demand data shows a shortage. The country has not necessarily placed or accepted an order.</small></article>'+
 '<article class="omega-bm-intel-row"><strong>OFFER ACCEPTED · CONFIRMED</strong><small>Only a persisted deal whose status is ACCEPTED is shown as accepted. A demand signal alone never means acceptance.</small></article>'+
 '<article class="omega-bm-intel-row"><strong>STATE PARTICIPATION · EVIDENCE REQUIRED</strong><small>Government involvement is labelled only when state-owned or state-directed activity is supported by country records. A sanction or embargo alone is not proof.</small></article>'+
 '</div></section></div>'+
 '</main></div><p class="omega-bm-footnote">Seller scans run progressively across small country batches; opening the page does not scan the world. Other countries’ shortages are shown as buying-interest signals, not as confirmed covert participation. Pricing, permits, trade requests, cargo inspections, settlement, penalties and intelligence secrecy remain controlled by their existing authoritative runtimes.</p></section>';
 if(!root.__omegaBmBound){
  root.addEventListener('click',function(event){
   const t=event.target?.closest?.('button');if(!t||!root.contains(t))return;
   if(t.hasAttribute('data-bm-lane')){
    cancelScan(root);const next=t.getAttribute('data-bm-lane');
    root.__omegaBmLane=['RAW_RESOURCE','FACTORY_PRODUCT','FOOD_PRODUCT'].includes(next)?next:'RAW_RESOURCE';
    root.__omegaBmResource='';root.__omegaBmOffers=[];root.__omegaBmNegotiation=null;root.__omegaBmOutcome='';
    root.__omegaBmOfferVisible=6;render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-product')){
    cancelScan(root);root.__omegaBmResource=t.getAttribute('data-bm-product')||'';
    root.__omegaBmOffers=[];root.__omegaBmNegotiation=null;root.__omegaBmOutcome='';
    root.__omegaBmOfferVisible=6;render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-show-more-offers')){
    root.__omegaBmOfferVisible=Math.min(24,(num(root.__omegaBmOfferVisible)||6)+6);render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-show-more-buyers')){
    root.__omegaBmBuyerVisible=Math.min(24,(num(root.__omegaBmBuyerVisible)||8)+8);render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-negotiate')){
    const offerId=t.getAttribute('data-bm-negotiate'),seller=t.getAttribute('data-bm-seller'),productId=t.getAttribute('data-bm-resource'),
     qf=Array.from(root.querySelectorAll('[data-bm-quantity]')).find(x=>x.getAttribute('data-bm-quantity')===offerId),
     bf=Array.from(root.querySelectorAll('[data-bm-bid]')).find(x=>x.getAttribute('data-bm-bid')===offerId);
    const result=bm.negotiateOffer?.({buyerCountryId:root.__omegaBmCountry||c,sellerCountryId:seller,resourceId:productId,offerId,
     quantity:Number(qf?.value),bidUnitPrice:Number(bf?.value)})||{accepted:false,reason:'NEGOTIATION_API_UNAVAILABLE'};
    root.__omegaBmNegotiation=result.negotiation||null;
    root.__omegaBmOutcome=result.accepted?(result.decision==='COUNTERED'?'Broker countered at '+money(result.negotiation.counterUnitPrice,result.negotiation.currency||'USD')+' per unit. Review and accept the counter before ordering.':'Broker accepted the negotiated price. Place the deal request to continue.'):(result.reason||'NEGOTIATION_REJECTED');
    render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-accept-counter')){
    const result=bm.acceptCounterOffer?.(root.__omegaBmCountry||c,t.getAttribute('data-bm-accept-counter'))||{accepted:false,reason:'COUNTER_ACCEPTANCE_API_UNAVAILABLE'};
    root.__omegaBmNegotiation=result.negotiation||null;
    root.__omegaBmOutcome=result.accepted?'Broker counteroffer accepted. Place the deal request to continue.':(result.reason||'COUNTER_ACCEPTANCE_FAILED');
    render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-find')){
    const productId=String(root.__omegaBmResource||''),quantity=Number(root.querySelector('[data-bm-find-quantity]')?.value);
    root.__omegaBmFindQuantity=String(quantity);
    root.__omegaBmNegotiation=null;root.__omegaBmOffers=[];root.__omegaBmOfferVisible=6;
    if(!productId||!Number.isFinite(quantity)||quantity<=0){
     root.__omegaBmScanning=false;root.__omegaBmOutcome='Select a commodity and enter a quantity greater than zero.';render(root,root.__omegaBmCountry||c);return;
    }
    cancelScan(root);root.__omegaBmScanning=true;root.__omegaBmScanProgress='Preparing seller-country scan…';
    root.__omegaBmOutcome='Seller scan started. The screen remains responsive while countries are checked in batches.';
    render(root,root.__omegaBmCountry||c);
    const scanToken=root.__omegaBmScanToken;
    if(typeof bm.beginOfferScan==='function'&&typeof bm.getOfferScanBatch==='function'&&typeof bm.finishOfferScan==='function'){
     const scan=bm.beginOfferScan(root.__omegaBmCountry||c,productId,quantity);
     if(scan?.status!=='READY'){
      root.__omegaBmScanning=false;root.__omegaBmOutcome=scan?.reason||scan?.status||'OFFER_SCAN_UNAVAILABLE';render(root,root.__omegaBmCountry||c);return;
     }
     root.__omegaBmScan=scan;
     const nextBatch=function(){
      if(scanToken!==root.__omegaBmScanToken||!root.__omegaBmScanning)return;
      const part=bm.getOfferScanBatch(scan,16);
      if(part?.status!=='READY'){
       root.__omegaBmScanning=false;root.__omegaBmOutcome=part?.reason||part?.status||'OFFER_SCAN_FAILED';root.__omegaBmScan=null;render(root,root.__omegaBmCountry||c);return;
      }
      root.__omegaBmScanProgress='Scanned '+fmt(part.scanned)+' / '+fmt(part.total)+' seller countries · '+fmt(scan.offers.length)+' executable offer(s)';
      const label=root.querySelector?.('[data-bm-scan-progress]');if(label)label.textContent=root.__omegaBmScanProgress;
      if(!part.done){schedule(nextBatch);return;}
      const final=bm.finishOfferScan(scan);
      root.__omegaBmOffers=Array.isArray(final?.offers)?final.offers:[];
      root.__omegaBmScanning=false;root.__omegaBmScan=null;
      root.__omegaBmOutcome=root.__omegaBmOffers.length?'Network scan complete. '+root.__omegaBmOffers.length+' executable seller offer(s) found.':
       'Network scan complete. No seller passed the current stock, policy and route checks.';
      render(root,root.__omegaBmCountry||c);
     };
     schedule(nextBatch);return;
    }
    const result=bm.getOffers(root.__omegaBmCountry||c,productId,quantity);
    root.__omegaBmOffers=result.status==='READY'?(Array.isArray(result.offers)?result.offers:[]):[];
    root.__omegaBmScanning=false;root.__omegaBmOutcome=result.status==='READY'?
     (root.__omegaBmOffers.length?'Found '+root.__omegaBmOffers.length+' executable seller offer(s).':'No executable seller offer meets the current checks.'):(result.reason||result.status);
    render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-buy')){
    const offerId=t.getAttribute('data-bm-buy'),seller=t.getAttribute('data-bm-seller'),productId=t.getAttribute('data-bm-resource'),
     field=Array.from(root.querySelectorAll('[data-bm-quantity]')).find(x=>x.getAttribute('data-bm-quantity')===offerId),
     quantity=Number(field?.value);
    if(!Number.isFinite(quantity)||quantity<=0){root.__omegaBmOutcome='Enter a quantity greater than zero.';render(root,root.__omegaBmCountry||c);return;}
    const negotiation=root.__omegaBmNegotiation;
    if(negotiation&&negotiation.offerId===offerId&&negotiation.status==='COUNTERED'){
     root.__omegaBmOutcome='Accept the broker counteroffer before placing this order.';render(root,root.__omegaBmCountry||c);return;
    }
    const result=bm.createDeal({buyerCountryId:root.__omegaBmCountry||c,sellerCountryId:seller,resourceId:productId,offerId,quantity,
     negotiationId:negotiation&&negotiation.offerId===offerId&&negotiation.status==='ACCEPTED'?negotiation.negotiationId:undefined});
    root.__omegaBmOutcome=result.accepted?'Trade request recorded. Seller review, cargo inspection and authoritative settlement are pending.':
     (result.reason||'BLACK_MARKET_ORDER_REJECTED');
    root.__omegaBmNegotiation=null;root.__omegaBmOffers=[];
    if(typeof bm.getOffers==='function'){
     const next=bm.getOffers(root.__omegaBmCountry||c,productId,quantity);
     root.__omegaBmOffers=next.status==='READY'?(Array.isArray(next.offers)?next.offers:[]):[];
    }
    render(root,root.__omegaBmCountry||c);return;
   }
  });
  root.addEventListener('input',function(event){
   const target=event.target;if(!target||!root.contains(target))return;
   if(target.hasAttribute?.('data-bm-product-search')){
    root.__omegaBmProductSearch=target.value||'';
    const list=root.querySelector?.('.omega-bm-product-list');if(list){
     const filtered=laneProducts.filter(x=>productName(x).toLowerCase().includes(root.__omegaBmProductSearch.toLowerCase())).slice(0,60);
     list.innerHTML=filtered.length?productButtonsFor(filtered,root.__omegaBmResource):'<div class="omega-bm-empty-products">No products match this search.</div>';
    }
   }
  });
  root.__omegaBmBound=true;
 }
 return{ok:true,countryId:c,offerCount:offers.length,dealCount:deals.length,buyerSignalCount:buyers.length,
  confirmedDealCount:confirmed.length,scanning:scanning};
}
function productButtonsFor(rows,selected){
 return rows.map(x=>'<button type="button" class="omega-bm-product" data-bm-product="'+esc(x.id)+'" aria-pressed="'+(String(x.id)===String(selected)?'true':'false')+'"><strong>'+esc(productName(x))+'</strong><small>'+esc(x.unit||'—')+'</small></button>').join('');
}
function cancelScan(root){
 root.__omegaBmScanToken=(num(root.__omegaBmScanToken)||0)+1;
 root.__omegaBmScanning=false;root.__omegaBmScan=null;
}
function schedule(fn){if(typeof g.setTimeout==='function')g.setTimeout(fn,0);else fn();}
g.Omega=g.Omega||{};
g.Omega.BlackMarketUI=Object.freeze({version:'1.3.0',render});
g.OmegaBlackMarketUI=g.Omega.BlackMarketUI;
})(typeof window!=='undefined'?window:globalThis);
