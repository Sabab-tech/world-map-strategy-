/* OMEGA BLACK MARKET UI v1.6.0 */
(function(g){
'use strict';
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(v,c){const n=Number(v);if(!Number.isFinite(n))return'Not available';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:String(c||'USD'),maximumFractionDigits:2}).format(n);}catch(_){return n.toLocaleString('en-US',{maximumFractionDigits:2})+' '+String(c||'');}}
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function fmt(v){const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(n):'Not recorded';}
function countryInfo(value){
 const code=String(value??'').trim().toUpperCase();let hit=null,profile=null;
 const registry=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
 try{hit=registry?.resolveCountry?.(code)||null;}catch(_){}
 const runtime=g.OmegaCountryRuntimeData||g.Omega?.CountryRuntimeData;
 try{profile=runtime?.resolveCountry?.(code)||null;}catch(_){}
 const raw=hit?.raw||hit||profile?.raw||profile||{},
  iso2=String(raw.iso2||raw.countryCode||profile?.countryCode||(/^[A-Z]{2}$/.test(code)?code:'')).toUpperCase(),
  name=String(raw.name||raw.officialName||raw.names?.[0]||hit?.surface||profile?.name||profile?.officialName||code||'Unknown country');
 let flag='';try{flag=runtime?.flagFor?.(code)||'';}catch(_){}
 if(!flag&&/^[A-Z]{2}$/.test(iso2))try{flag=String.fromCodePoint(...Array.from(iso2,ch=>127397+ch.charCodeAt(0)));}catch(_){}
 return{code,name,iso2,flag};
}
function countryLabel(value){const info=countryInfo(value);return(info.flag?info.flag+' ':'')+info.name;}
function human(value){return String(value||'Not established').replace(/_/g,' ').toLowerCase().replace(/\b[a-z]/g,x=>x.toUpperCase());}
function actorRole(value){
 const key=String(value||'').toUpperCase();
 return key==='STATE_LINKED'?'State-linked commercial actor':(key==='PRIVATE_BROKER'?'Private broker':'Private exporter or broker');
}
function percent(value){const n=num(value);return n===null?'Not recorded':(n>1?fmt(n):fmt(n*100))+'%';}
function compactCompanies(value){
 return Array.isArray(value)?value.slice(0,4).map(x=>[x.name||x.companyId||'Company',String(x.ownership||'PRIVATE').replace(/_/g,' ').toLowerCase(),x.exportShare!==null&&x.exportShare!==undefined?percent(x.exportShare)+' export share':null].filter(Boolean).join(' · ')).join(' | '):'';
}

function countryKeyToken(value){return String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
function lookupCountryResource(map,key){
 if(!map||typeof map!=='object')return undefined;
 const wanted=countryKeyToken(key),found=Object.keys(map).find(x=>countryKeyToken(x)===wanted);
 return found===undefined?undefined:map[found];
}
function demandBuyerSignals(resourceId,playerCountry){
 const state=g.Game?.state||g.gameState||g.Omega?.Simulation?.world?.state||{},
  source=state.resource,turn=Number(state.simulation?.turn??state.turn??state.simulationTurn??0)||0;
 if(!resourceId||!source||typeof source!=='object'||Array.isArray(source))return[];
 const rows=[];
 for(const [scope,record] of Object.entries(source)){
  const countryId=String(scope||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{2,3}$/.test(countryId)||countryId===playerCountry)continue;
  const runtime=record?.demandRuntime,signal=lookupCountryResource(runtime?.byResource,resourceId);
  if(!signal||typeof signal!=='object')continue;
  const unmet=Math.max(0,num(signal.unmetDemand)||0),daily=Math.max(0,num(signal.demandPerDay??signal.demand)||0),
   coverage=signal.stockCoverageDays==null||signal.stockCoverageDays===''?null:num(signal.stockCoverageDays),
   target=signal.stockCoverageTargetDays==null||signal.stockCoverageTargetDays===''?null:num(signal.stockCoverageTargetDays),
   low=daily>0&&coverage!==null&&target!==null&&target>coverage;
  if(unmet<=1e-8&&!low)continue;
  const gap=low?Math.max(unmet,daily*(target-coverage)):unmet;if(!(gap>0))continue;
  const stale=Math.max(0,turn-(num(runtime.lastTurn)??turn)),freshness=stale>30?.45:(stale>10?.7:1),
   pressure=Math.max(num(signal.procurementScore)||0,daily>0?unmet/daily:0,low?(target-coverage)/Math.max(target,1):0)*freshness;
  rows.push({countryId,quantity:gap,demandPerDay:daily,coverage,target,pressure,
   reason:num(signal.activeFactoryInputDemandPerDay)>0?'Active factory input shortage':
    (signal.status||'Recorded demand gap'),lastTurn:num(runtime.lastTurn)});
 }
 return rows.sort((a,b)=>b.pressure-a.pressure||b.quantity-a.quantity||a.countryId.localeCompare(b.countryId)).slice(0,24);
}
function knownParticipationDeals(bm,countryId,resourceId,localDeals,reports){
 const rows=[],seen=new Set(),add=(deal,source)=>{
  if(!deal||String(deal.resourceId||'')!==String(resourceId||''))return;
  const key=String(deal.dealId||[deal.buyerCountryId,deal.sellerCountryId,deal.resourceId,deal.createdTurn].join(':'));
  if(seen.has(key))return;seen.add(key);rows.push({...deal,participationSource:source});
 };
 for(const deal of Array.isArray(localDeals)?localDeals:[])add(deal,'PLAYER_COUNTRY_LEDGER');
 for(const report of Array.isArray(reports)?reports:[]){
  if(!report||!report.buyerCountryId||!report.sellerCountryId)continue;
  if(report.dealId&&typeof bm.getDeal==='function'){
   let detail=null;try{detail=bm.getDeal(report.dealId,report.buyerCountryId);}catch(_){}
   if(detail)add(detail,'PLAYER_INTELLIGENCE_CONFIRMED');
  }else{
   add({dealId:report.reportId||('INTEL-'+report.buyerCountryId+'-'+report.sellerCountryId+'-'+resourceId),
    buyerCountryId:report.buyerCountryId,sellerCountryId:report.sellerCountryId,resourceId,
    productName:report.productName||resourceId,status:'INTELLIGENCE_LEAD',createdTurn:report.turn,
    confidence:report.confidence,level:report.level,summary:report.summary,otherCountriesKnow:report.otherCountriesKnow},
    'PLAYER_INTELLIGENCE_LEAD');
  }
 }
 return rows.sort((a,b)=>(num(b.createdTurn)||0)-(num(a.createdTurn)||0)).slice(0,16);
}
function statusText(value){
 const key=String(value||'UNKNOWN').toUpperCase();
 const labels={REQUESTED:'REQUEST SENT',SENT:'AWAITING SELLER',NEGOTIATING:'NEGOTIATING',ACCEPTED:'OFFER ACCEPTED',
  IN_TRANSIT:'IN TRANSIT',ARRIVAL_PENDING:'ARRIVAL PENDING',SETTLED:'SETTLED',
  SETTLED_UNDER_INVESTIGATION:'UNDER INVESTIGATION',INTERCEPTED:'INTERCEPTED',FAILED:'REJECTED',
  EXPIRED:'EXPIRED',INTELLIGENCE_LEAD:'INTELLIGENCE LEAD'};
 return labels[key]||key.replace(/_/g,' ');
}
function cancelOfferScan(root){root.__omegaBmScanToken=(num(root.__omegaBmScanToken)||0)+1;root.__omegaBmScanning=false;root.__omegaBmScan=null;}
function yieldOfferScan(fn){if(typeof g.setTimeout==='function')g.setTimeout(fn,0);else fn();}

function styles(){return "<style>\n.omega-bm{--bm-bg:#06152c;--bm-panel:#0b2446;--bm-panel2:#0d3159;--bm-line:#28699d;--bm-muted:#b1cbe3;--bm-text:#f4faff;--bm-cyan:#35caff;--bm-green:#49e0bd;display:block;color:var(--bm-text);background:linear-gradient(145deg,#06152c,#08264b 56%,#061a35);border:1px solid #237fc0;border-radius:13px;overflow:hidden;box-shadow:0 0 26px rgba(0,146,255,.17),inset 0 1px rgba(255,255,255,.08);font-family:Arial,Helvetica,sans-serif;min-width:0}\n.omega-bm *{box-sizing:border-box}.omega-bm button,.omega-bm input,.omega-bm select{font:inherit}\n.omega-bm-head{display:flex;align-items:center;justify-content:space-between;gap:15px;min-height:126px;padding:18px 21px;background:linear-gradient(90deg,rgba(3,18,42,.96),rgba(5,37,77,.82) 58%,rgba(3,17,39,.93)),url(\"assets/omega-global-market/market-header.svg\") center/cover no-repeat;border-bottom:1px solid #228cd7}\n.omega-bm-kicker{font-size:10px;letter-spacing:.17em;color:#88e1ff;font-weight:900}.omega-bm-head h2{font-size:clamp(23px,3vw,34px);line-height:1.08;margin:7px 0 5px;color:#fff;letter-spacing:.045em;text-transform:uppercase;text-shadow:0 0 15px rgba(39,201,255,.23)}\n.omega-bm-sub{font-size:12px;line-height:1.5;color:#d2e7fa;margin:0;max-width:760px}.omega-bm-scope{display:inline-flex;align-items:center;gap:8px;margin-top:9px;font-size:12px;color:#ecf8ff;font-weight:800}.omega-bm-scope:before{content:\"\";width:8px;height:8px;border-radius:50%;background:#49e0bd;box-shadow:0 0 11px #49e0bd}\n.omega-bm-classified{flex:none;border:1px solid #f2c76e;background:rgba(29,32,40,.88);color:#ffe0a2;padding:9px 11px;border-radius:5px;font-size:10px;line-height:1.45;font-weight:900;letter-spacing:.1em;text-align:center}\n.omega-bm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:12px 13px 0}.omega-bm-stat{min-width:0;padding:10px 11px;border:1px solid #2a6597;border-radius:7px;background:linear-gradient(145deg,#10335d,#071c38);box-shadow:inset 0 1px rgba(255,255,255,.05)}\n.omega-bm-stat small{display:block;color:#b8d5ee;font-size:9px;line-height:1.35;font-weight:900;letter-spacing:.065em;text-transform:uppercase}.omega-bm-stat strong{display:block;margin-top:5px;font-size:21px;color:#fff;font-variant-numeric:tabular-nums}.omega-bm-stat em{display:block;margin-top:3px;font-size:9px;color:#9ec8e9;font-style:normal}\n.omega-bm-lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:11px 13px 0}.omega-bm-lane{display:flex;align-items:center;gap:10px;min-width:0;min-height:60px;padding:8px 11px;border:1px solid #28699e;border-radius:7px;background:linear-gradient(120deg,#123c69,#071f3d);color:#e9f7ff;font-size:11px;font-weight:900;text-align:left;cursor:pointer}\n.omega-bm-lane img{width:39px;height:39px;object-fit:contain;flex:none;filter:drop-shadow(0 0 6px rgba(25,169,255,.33))}.omega-bm-lane span{display:block;line-height:1.3}.omega-bm-lane small{display:block;margin-top:3px;color:#a9d2ef;font-size:9px;font-weight:600}\n.omega-bm-lane[aria-pressed=\"true\"]{border-color:#36d2ff;background:linear-gradient(120deg,#087ec6,#0b315d);box-shadow:0 0 15px rgba(39,201,255,.23),inset 0 0 14px rgba(39,201,255,.13)}\n.omega-bm-layout{display:grid;grid-template-columns:minmax(195px,245px) minmax(0,1fr);gap:11px;padding:11px 13px 15px;align-items:start}.omega-bm-box{min-width:0;border:1px solid #28699e;border-radius:8px;background:linear-gradient(150deg,#0c2f56,#061a35);overflow:hidden}.omega-bm-box>header{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:10px 11px;background:linear-gradient(90deg,#123966,#0a2548);border-bottom:1px solid #1d5487}.omega-bm-box>header strong{font-size:11px;letter-spacing:.055em;text-transform:uppercase}.omega-bm-box>header span{font-size:9px;color:#a9c9e5}\n.omega-bm-product-head{padding:10px}.omega-bm-product-head label{display:block;font-size:9px;color:#a8c8e3;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px}.omega-bm-search{width:100%;min-height:36px;padding:7px 9px;border:1px solid #3978a8;border-radius:5px;background:#061a34;color:#fff;font-size:11px}\n.omega-bm-product-list{max-height:520px;overflow:auto;padding:0 7px 8px}.omega-bm-product{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:42px;padding:7px 9px;border:1px solid transparent;border-bottom-color:rgba(91,154,198,.15);border-radius:5px;background:transparent;color:#e1effd;text-align:left;cursor:pointer}.omega-bm-product:hover{background:rgba(22,124,229,.15)}.omega-bm-product[aria-pressed=\"true\"]{background:linear-gradient(90deg,rgba(0,139,224,.44),rgba(10,55,94,.65));border-color:#2dcaff;box-shadow:inset 0 0 9px rgba(39,201,255,.15)}.omega-bm-product strong{font-size:11px;font-weight:800}.omega-bm-product small{font-size:9px;color:#94bce0;white-space:nowrap}.omega-bm-empty-products{padding:14px;color:#aac5df;font-size:11px;line-height:1.45;text-align:center}\n.omega-bm-main{display:grid;gap:10px;min-width:0}.omega-bm-product-hero{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:81px;padding:12px 15px;border:1px solid #2369a4;border-radius:8px;background:linear-gradient(105deg,rgba(6,38,77,.98),rgba(5,23,49,.94)),url(\"assets/omega-global-market/raw-mining.svg\") right center/auto 100% no-repeat}\n.omega-bm-product-hero small{display:block;color:#8edbff;font-size:9px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.omega-bm-product-hero h3{font-size:clamp(18px,2.2vw,25px);margin:5px 0 2px;color:#fff}.omega-bm-product-hero p{margin:0;color:#b4d0ea;font-size:10px}.omega-bm-product-type{border:1px solid rgba(68,191,255,.48);background:rgba(5,26,49,.8);border-radius:5px;padding:8px 9px;color:#b5e7ff;font-size:9px;font-weight:900;text-align:center;white-space:nowrap}\n.omega-bm-toolbar{display:grid;grid-template-columns:minmax(105px,155px) minmax(120px,170px) auto;gap:8px;align-items:end;padding:10px;border:1px solid #23649c;border-radius:7px;background:linear-gradient(135deg,#0b2b52,#071b37)}.omega-bm-field{display:flex;flex-direction:column;gap:5px;min-width:0}.omega-bm-field label{font-size:9px;color:#a9cce8;font-weight:800;text-transform:uppercase;letter-spacing:.06em}\n.omega-bm input,.omega-bm select{width:100%;min-width:0;min-height:36px;border:1px solid #3678a8;border-radius:5px;padding:7px 9px;background:#06182e;color:#fff;font-size:11px}.omega-bm-btn{min-height:36px;border:1px solid #33c5fa;border-radius:5px;padding:7px 12px;background:linear-gradient(145deg,#087fca,#07519a);color:#fff;font-size:9px;font-weight:900;letter-spacing:.055em;cursor:pointer;box-shadow:0 0 10px rgba(39,201,255,.12)}.omega-bm-btn:hover:not(:disabled){filter:brightness(1.13)}.omega-bm-btn:disabled{opacity:.45;cursor:not-allowed}.omega-bm-btn--quiet{border-color:#5585ad;background:linear-gradient(145deg,#163a5e,#0b2543);color:#d5edff}\n.omega-bm-progress{grid-column:1/-1;min-height:15px;color:#a9d7f5;font-size:10px;line-height:1.5}.omega-bm-outcome{padding:9px 11px;border-left:3px solid #35c7fa;border-radius:4px;background:rgba(20,106,154,.2);color:#d5efff;font-size:11px;line-height:1.5}\n.omega-bm-section{min-width:0;border:1px solid #28689e;border-radius:8px;background:linear-gradient(150deg,#0b2a50,#061a35);overflow:hidden}.omega-bm-section>header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;background:linear-gradient(90deg,#123e70,#0a2b51);border-bottom:1px solid #28689e}\n.omega-bm-section>header strong{font-size:10px;color:#f0f9ff;letter-spacing:.06em;text-transform:uppercase}.omega-bm-section>header span{font-size:9px;color:#a9cee9;text-align:right}.omega-bm-section-note{padding:7px 10px;color:#a9cce8;font-size:10px;line-height:1.4;border-bottom:1px solid rgba(94,160,203,.16)}\n.omega-bm-table-wrap{width:100%;overflow-x:auto;overscroll-behavior-x:contain}.omega-bm-table{width:100%;border-collapse:collapse;min-width:600px}.omega-bm-table th{padding:8px 9px;background:rgba(5,20,40,.78);color:#b7d8f1;font-size:9px;text-align:left;text-transform:uppercase;letter-spacing:.055em;white-space:nowrap}.omega-bm-table td{padding:8px 9px;border-top:1px solid rgba(90,153,196,.2);color:#e7f4ff;font-size:11px;vertical-align:middle}\n.omega-bm-table tbody tr:not(.omega-bm-detail-row):hover td{background:rgba(20,105,173,.16)}.omega-bm-country-row{display:flex;align-items:center;gap:8px;min-width:0}.omega-bm-flag{display:grid;place-items:center;flex:none;min-width:29px;height:22px;border:1px solid rgba(156,204,244,.34);border-radius:3px;background:rgba(2,13,27,.8);font-size:18px;line-height:1}\n.omega-bm-country-copy{display:block;min-width:0}.omega-bm-country-copy strong{display:block;color:#f4f9ff;font-size:11px;line-height:1.25;white-space:normal}.omega-bm-country-copy small{display:block;margin-top:2px;color:#a5c8e5;font-size:9px;line-height:1.3}.omega-bm-number{font-weight:900;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}.omega-bm-muted{color:#a9c8e4!important;font-size:9px}\n.omega-bm-tag{display:inline-block;padding:4px 6px;border:1px solid rgba(70,201,255,.36);border-radius:4px;background:rgba(9,92,143,.24);color:#b2edff;font-size:9px;font-weight:900;line-height:1.2;white-space:nowrap}.omega-bm-risk{display:inline-block;padding:4px 6px;border:1px solid rgba(255,195,105,.4);border-radius:4px;background:rgba(118,70,16,.24);color:#ffda99;font-size:9px;font-weight:900;white-space:nowrap}\n.omega-bm-row-action{display:flex;align-items:center;gap:5px;white-space:nowrap}.omega-bm-row-action input{width:78px;min-height:30px;padding:5px 6px;font-size:10px}.omega-bm-row-action button{min-height:30px;padding:5px 8px;font-size:9px}\n.omega-bm-detail-row td{padding:0 8px 8px;border-top:0}.omega-bm-detail{border:1px solid rgba(97,158,200,.22);border-radius:5px;background:rgba(3,15,32,.45)}.omega-bm-detail summary{padding:7px 9px;color:#9fe3ff;font-size:10px;font-weight:800;cursor:pointer}.omega-bm-detail-body{padding:7px 9px 9px;color:#c4daed;font-size:10px;line-height:1.55}\n.omega-bm-country-context{display:grid;gap:6px;margin-top:7px;padding:8px;border:1px solid rgba(70,150,205,.25);border-radius:5px;background:rgba(3,19,39,.45)}.omega-bm-country-context small{display:block;color:#a9c9e4;font-size:9px}.omega-bm-country-context strong{display:block;margin-top:3px;color:#ecf7ff;font-size:10px;line-height:1.45}.omega-bm-more{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:8px 10px;border-top:1px solid rgba(90,153,196,.17);color:#bdd8ef;font-size:10px}.omega-bm-more button{min-height:30px;padding:5px 8px;font-size:9px}\n.omega-bm-status{display:inline-block;padding:4px 6px;border-radius:4px;background:rgba(8,131,176,.22);border:1px solid rgba(51,196,243,.35);color:#b8efff;font-size:9px;font-weight:900;white-space:nowrap}.omega-bm-status.is-alert{background:rgba(135,72,18,.25);border-color:rgba(255,186,96,.42);color:#ffd390}\n.omega-bm-lower{display:grid;grid-template-columns:1fr 1fr;gap:9px;align-items:start}.omega-bm-panel{min-width:0;border:1px solid #28699e;border-radius:8px;background:linear-gradient(150deg,#0b2a50,#061a35);overflow:hidden}.omega-bm-panel>header{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:9px 10px;background:linear-gradient(90deg,#124477,#0a2b52);border-bottom:1px solid #28699e}.omega-bm-panel>header strong{font-size:10px;color:#f3faff;letter-spacing:.055em;text-transform:uppercase}.omega-bm-panel>header span{font-size:9px;color:#b3d0ea}\n.omega-bm-panel-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:8px}.omega-bm-deal{min-width:0;padding:8px;border:1px solid rgba(112,151,165,.24);border-radius:6px;background:rgba(5,14,21,.43)}.omega-bm-deal strong{display:block;margin-top:5px;font-size:10px;color:#f1f8ff;overflow-wrap:anywhere}.omega-bm-deal small{display:block;color:#b0c9e1;font-size:9px;line-height:1.45;margin-top:4px;overflow-wrap:anywhere}\n.omega-bm-impact{margin-top:7px;padding:7px;border-left:2px solid #ffba68;background:rgba(130,76,20,.15);color:#ffdba3;font-size:9px;line-height:1.5}.omega-bm-empty{padding:16px 11px;color:#bed6ed;font-size:11px;line-height:1.5;text-align:center}.omega-bm-risknote{margin:11px 0 0;color:#a8c2dd;font-size:9px;line-height:1.55;border-top:1px solid rgba(108,153,180,.22);padding-top:8px}\n.omega-bm button:focus-visible,.omega-bm input:focus-visible,.omega-bm select:focus-visible{outline:2px solid #71dfff;outline-offset:2px}\n@media(max-width:950px){.omega-bm-layout{grid-template-columns:minmax(175px,205px) minmax(0,1fr);gap:8px;padding:9px}.omega-bm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.omega-bm-lower{grid-template-columns:1fr}}\n@media(max-width:650px){.omega-bm-head{min-height:110px;padding:13px}.omega-bm-classified{font-size:8px;padding:7px}.omega-bm-grid{gap:6px;padding:9px 9px 0}.omega-bm-stat{padding:8px}.omega-bm-stat strong{font-size:18px}.omega-bm-lanes{gap:5px;padding:8px 9px 0}.omega-bm-lane{display:block;min-height:56px;padding:6px;text-align:center}.omega-bm-lane img{display:block;width:27px;height:27px;margin:0 auto 4px}.omega-bm-lane span{font-size:9px}.omega-bm-lane small{font-size:8px}.omega-bm-layout{grid-template-columns:1fr;padding:9px}.omega-bm-product-list{display:flex;gap:5px;max-height:none;overflow-x:auto;padding:0 7px 8px}.omega-bm-product{flex:none;min-width:110px;max-width:150px;min-height:47px;border:1px solid #255985;background:#0a2649}.omega-bm-toolbar{grid-template-columns:minmax(0,1fr) minmax(95px,.8fr)}.omega-bm-toolbar>.omega-bm-btn{grid-column:1/-1}.omega-bm-panel-body{grid-template-columns:1fr}.omega-bm-table{min-width:570px}.omega-bm-table td{padding:7px 8px}.omega-bm-section-note{font-size:9px}}\n@media(prefers-reduced-motion:reduce){.omega-bm *{scroll-behavior:auto!important;transition:none!important}}\n</style>";}
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
 root.__omegaBmResource=selectedProduct;root.__omegaBmLane=validLane;root.__omegaBmProducts=products;
 const opts=laneProducts.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===selectedProduct?' selected':'')+'>'+esc(x.name||x.id)+'</option>').join('');
 const offers=selectedProduct?allOffers.filter(x=>!x.resourceId||String(x.resourceId)===selectedProduct):[];
 const visibleOfferCount=Math.max(6,Math.min(24,Number(root.__omegaBmVisibleOffers)||6)),
  visibleBuyerCount=Math.max(6,Math.min(24,Number(root.__omegaBmVisibleBuyers)||8));
 const buyerSignals=selectedProduct?demandBuyerSignals(selectedProduct,c):[],
  participationDeals=selectedProduct?knownParticipationDeals(bm,c,selectedProduct,deals,networkReports):[],
  acceptedDeals=participationDeals.filter(x=>String(x.status||'').toUpperCase()==='ACCEPTED').length,
  playerInfo=countryInfo(c);
 const active=deals.filter(x=>!['FAILED','EXPIRED'].includes(String(x.status||'').toUpperCase()));
 const settled=deals.filter(x=>['SETTLED','SETTLED_UNDER_INVESTIGATION'].includes(String(x.status||'').toUpperCase())).length;
 const exposed=deals.filter(x=>['INTERCEPTED','SETTLED_UNDER_INVESTIGATION'].includes(String(x.status||'').toUpperCase())).length;
 const count=(v)=>fmt(v);
 const pct=(v)=>Math.max(0,Math.min(100,(Number(v)||0)*100));
 const section=(index,title,note)=>'<div class="omega-bm-section"><div class="omega-bm-section-copy"><span class="omega-bm-section-index">'+esc(index)+'</span><h3>'+esc(title)+'</h3></div><span class="omega-bm-section-note">'+esc(note||'')+'</span></div>';
 const sellerRows=offers.slice(0,visibleOfferCount).map(x=>{
  const sellerInfo=countryInfo(x.sellerCountryId),saving=num(x.expectedSavings),
   buyerCurrency=x.buyerCurrency||x.currency,math=x.pricingBreakdown||{},
   foreignBasis=(Array.isArray(x.foreignPolicyBasis)?x.foreignPolicyBasis:[]).join(' · ')||'No blocking foreign-policy measure observed',
   sanctions=(Array.isArray(x.sanctioningCountryIds)?x.sanctioningCountryIds:[]).map(countryLabel).map(esc).join(' · '),
   sanctionPolicies=(Array.isArray(x.sanctionPolicyIds)?x.sanctionPolicyIds:[]).map(esc).join(' · '),
   negotiation=root.__omegaBmNegotiation&&root.__omegaBmNegotiation.offerId===x.offerId?root.__omegaBmNegotiation:null,
   legalTag=x.legalMarketAvailable?(saving!==null&&saving>0?'PRICE ADVANTAGE':'LEGAL ACCESS EXISTS'):
    (x.embargoed?'IMPORT EMBARGO':x.exportRestrictionReason?'EXPORT RESTRICTION':x.sanctionsAtQuote?'SANCTIONS':'RESTRICTED CHANNEL'),
   risk=Math.max(0,Math.min(100,(num(x.detectionProbability)||0)*100)),
   quantity=Math.min(num(x.requestedQuantity)||1,num(x.availableQuantity)||1),
   thresholds=Array.isArray(x.scrutinyThresholds?.sellerFreeStockQuantity)?x.scrutinyThresholds.sellerFreeStockQuantity:[];
  const motive=(x.sellerMotiveReason||x.buyerMotiveReason)?
   '<div class="omega-bm-country-context">'+
    (x.sellerMotiveReason?'<div><small>Why '+esc(sellerInfo.name)+' sells</small><strong>'+esc(x.sellerMotiveReason)+'</strong></div>':'')+
    (x.buyerMotiveReason?'<div><small>Why '+esc(countryInfo(c).name)+' wants it</small><strong>'+esc(x.buyerMotiveReason)+'</strong></div>':'')+
    '<div><small>Seller actor</small><strong>'+esc(actorRole(x.sellerActorClass))+'</strong></div></div>':'';
  const scrutiny=x.shipmentSizeBand?
   '<div class="omega-bm-country-context"><div><small>Shipment class</small><strong>'+esc(human(x.shipmentSizeBand))+'</strong></div>'+
   '<div><small>Seller free stock exposed</small><strong>'+percent(x.sellerStockExposurePct)+'</strong></div>'+
   '<div><small>Attempts in last 10 turns</small><strong>'+fmt(x.repeatAttempts10Turns||0)+'</strong></div></div>':'';
  const thresholdText=thresholds.length?
   '<br>Free-stock thresholds (1% / 3% / 8% / 15%): '+thresholds.map(fmt).join(' / ')+' '+esc(x.unit||'units'):'';
  const sanctionText=(sanctions||sanctionPolicies)?
   '<br>Sanctioning countries: '+(sanctions||'Not recorded')+' · Policies: '+(sanctionPolicies||'Not recorded')+
   ' · Secondary sanctions: '+(x.secondarySanctionsAtQuote?'Yes':'No recorded evidence'):'';
  const detail='<details class="omega-bm-detail"><summary>STRATEGIC FILE · MOTIVE, SANCTIONS, SHIPMENT & PENALTIES</summary><div class="omega-bm-detail-body">'+
   'Legal landed price: '+(x.legalLandedUnitPrice===null?'No comparable legal quote':money(x.legalLandedUnitPrice,buyerCurrency))+
   ' · '+(saving===null?'No verified price comparison':(saving>=0?'Expected saving ':'Expected extra cost ')+money(Math.abs(saving),buyerCurrency))+
   '<br>Expected delivery: '+fmt(x.expectedDeliveredQuantity)+' '+esc(x.unit||'units')+
   ' · Expected cargo loss: '+fmt(x.expectedSeizedQuantity)+' '+esc(x.unit||'units')+
   ' · Expected fine: '+(x.expectedFineCostBuyer===null?'Not priced':money(x.expectedFineCostBuyer,buyerCurrency))+
   '<br>Detection before dispatch: '+percent(x.detectionProbability)+' · Late discovery: '+percent(x.lateDetectionProbability)+
   '<br>Policy basis: '+esc(foreignBasis)+sanctionText+
   '<br>Export policy IDs: '+esc((x.exportPolicyIds||[]).join(' · ')||'Not recorded')+
   '<br>Price components: tariff '+fmt(math.tariffDiscountPct)+'%, risk '+fmt(math.riskPremiumPct)+'%, policy '+fmt(math.policyPremiumPct)+
   '%, scarcity '+fmt(math.scarcityPremiumPct)+'%, broker '+fmt(math.brokerSpreadPct)+'%'+
   '<br>Attempt fine '+percent(x.attemptFineRate)+' · completed-trade fine '+percent(x.fineRate)+' · seizure '+percent(x.seizureRate)+
   thresholdText+motive+scrutiny+
   '<div class="omega-bm-row-action" style="margin-top:8px"><input type="number" min="0.001" step="any" value="'+esc(negotiation?.bidUnitPrice??x.unitPrice)+
   '" data-bm-bid="'+esc(x.offerId)+'" aria-label="Bid price per unit">'+
   '<button type="button" class="omega-bm-btn omega-bm-btn--quiet" data-bm-negotiate="'+esc(x.offerId)+
   '" data-bm-seller="'+esc(x.sellerCountryId)+'" data-bm-resource="'+esc(x.resourceId)+'">NEGOTIATE PRICE</button></div>'+
   (negotiation?'<div class="omega-bm-outcome">Negotiation '+esc(statusText(negotiation.status))+
    (negotiation.counterUnitPrice!==undefined?' · Counter '+money(negotiation.counterUnitPrice,x.currency):'')+
    (negotiation.agreedUnitPrice!==undefined?' · Agreed '+money(negotiation.agreedUnitPrice,x.currency):'')+'</div>':'')+
   (negotiation&&negotiation.status==='COUNTERED'?'<button type="button" class="omega-bm-btn omega-bm-btn--quiet" data-bm-accept-counter="'+esc(negotiation.negotiationId)+'">ACCEPT COUNTER · '+money(negotiation.counterUnitPrice,x.currency)+'</button>':'')+
   '</div></details>';
  return '<tr><td><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(sellerInfo.flag||'🏳️')+
   '</span><span class="omega-bm-country-copy"><strong>'+esc(sellerInfo.name)+'</strong><small>'+esc(actorRole(x.sellerActorClass))+'</small></span></div></td>'+
   '<td><span class="omega-bm-number">'+fmt(x.availableQuantity)+' '+esc(x.unit||'')+'</span></td>'+
   '<td><span class="omega-bm-number">'+esc(money(x.unitPrice,x.currency))+'</span><small class="omega-bm-muted"> / unit</small></td>'+
   '<td><span class="omega-bm-risk">'+fmt(risk)+'% RISK</span></td>'+
   '<td><span class="omega-bm-tag">'+esc(legalTag)+'</span></td>'+
   '<td><div class="omega-bm-row-action"><input type="number" min="0.001" max="'+esc(x.availableQuantity)+'" step="any" value="'+esc(quantity)+
   '" data-bm-quantity="'+esc(x.offerId)+'" aria-label="Order quantity from '+esc(sellerInfo.name)+'">'+
   '<button type="button" class="omega-bm-btn" data-bm-buy="'+esc(x.offerId)+'" data-bm-seller="'+esc(x.sellerCountryId)+
   '" data-bm-resource="'+esc(x.resourceId)+'">BUY</button></div></td></tr>'+
   '<tr class="omega-bm-detail-row"><td colspan="6">'+detail+'</td></tr>';
 }).join('');
 const sellerMore=offers.length>visibleOfferCount?
  '<div class="omega-bm-more"><span>Showing '+count(visibleOfferCount)+' / '+count(offers.length)+' verified sellers</span>'+
  '<button type="button" class="omega-bm-btn omega-bm-btn--quiet" data-bm-show-more>SHOW MORE SELLERS</button></div>':'';
 const buyerRows=buyerSignals.slice(0,visibleBuyerCount).map(x=>{
  const info=countryInfo(x.countryId);
  return '<tr><td><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(info.flag||'🏳️')+
   '</span><span class="omega-bm-country-copy"><strong>'+esc(info.name)+'</strong><small>'+esc(x.reason)+'</small></span></div></td>'+
   '<td><span class="omega-bm-number">'+fmt(x.quantity)+'</span> '+esc(selected?.unit||'')+'</td>'+
   '<td>'+fmt(x.demandPerDay)+'/day</td><td>'+(x.coverage===null?'—':fmt(x.coverage)+' days')+'</td>'+
   '<td><span class="omega-bm-tag">POTENTIAL BUYER</span></td></tr>';
 }).join('');
 const buyerMore=buyerSignals.length>visibleBuyerCount?
  '<div class="omega-bm-more"><span>Showing '+count(visibleBuyerCount)+' / '+count(buyerSignals.length)+' demand signals</span>'+
  '<button type="button" class="omega-bm-btn omega-bm-btn--quiet" data-bm-show-more-buyers>SHOW MORE COUNTRIES</button></div>':'';
 const participationRows=participationDeals.slice(0,16).map(x=>{
  const buyer=countryInfo(x.buyerCountryId),seller=countryInfo(x.sellerCountryId),status=String(x.status||'UNKNOWN').toUpperCase(),
   isAccepted=status==='ACCEPTED',lead=status==='INTELLIGENCE_LEAD';
  return '<tr><td><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(buyer.flag||'🏳️')+
   '</span><span class="omega-bm-country-copy"><strong>'+esc(buyer.name)+'</strong><small>BUYER</small></span></div></td>'+
   '<td><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(seller.flag||'🏳️')+
   '</span><span class="omega-bm-country-copy"><strong>'+esc(seller.name)+'</strong><small>SELLER</small></span></div></td>'+
   '<td>'+esc(x.productName||x.resourceId)+'</td><td>'+fmt(x.quantity)+' '+esc(x.unit||'')+'</td>'+
   '<td><span class="omega-bm-status'+(isAccepted?'':(lead?'':' is-alert'))+'">'+esc(statusText(status))+'</span></td>'+
   '<td>'+esc(money(x.unitPrice,x.currency))+'</td></tr>';
 }).join('');
const dealHtml=active.slice(0,8).map(x=>{
  const e=x.enforcement||{},attempt=x.attemptEnforcement||{},alert=['INTERCEPTED','SETTLED_UNDER_INVESTIGATION','FAILED'].includes(String(x.status||'').toUpperCase());
  return '<article class="omega-bm-deal"><span class="omega-bm-status'+(alert?' is-alert':'')+'">'+esc(String(x.status||'UNKNOWN').replace(/_/g,' '))+'</span><strong>'+esc(x.productName||x.resourceId)+'</strong><small>Seller '+esc(countryLabel(x.sellerCountryId))+' · '+fmt(x.quantity)+' '+esc(x.unit||'units')+'</small><small>'+money(x.unitPrice,x.currency)+' / unit · Turn '+fmt(x.createdTurn)+'</small>'+
   (attempt.amountDue!==undefined?'<div class="omega-bm-impact"><strong>Intercepted before delivery</strong><br>Attempt fine '+money(attempt.amountDue,x.attemptCurrency||x.currency)+' · paid '+money(attempt.amountPaid, x.attemptCurrency||x.currency)+' · outstanding '+money(attempt.amountOutstanding,x.attemptCurrency||x.currency)+'<br>Cargo stopped: no buyer inventory seized</div>':'')+
   (e.fineDue!==undefined?'<small>Fine paid '+money(e.finePaid,e.fineCurrency)+' / '+money(e.fineDue,e.fineCurrency)+' · outstanding '+money(e.fineOutstanding,e.fineCurrency)+'</small>':'')+
   (e.seizureTargetQuantity!==undefined?'<small>Cargo seized '+fmt(e.seizureQuantity)+' / '+fmt(e.seizureTargetQuantity)+' '+esc(x.unit||'units')+' · '+esc(e.seizureStatus||'')+'</small>':'')+
   (x.shipmentSizeBand?'<small>Shipment class '+esc(human(x.shipmentSizeBand))+' · '+percent(x.sellerStockExposurePct)+' of seller free stock · '+fmt(x.repeatAttempts10Turns||0)+' attempts in 10 turns</small>':'')+'</article>';
 }).join('');
 const caseHtml=cases.slice(-6).reverse().map(x=>'<article class="omega-bm-deal"><span class="omega-bm-status is-alert">'+esc(x.severity||x.status||'CASE')+'</span><strong>'+esc(x.resourceId||'Black Market case')+'</strong><small>'+esc(countryLabel(x.buyerCountryId))+' ↔ '+esc(countryLabel(x.sellerCountryId))+' · '+esc(human(x.detectionStage||'DETECTION'))+'</small><small>Evidence '+fmt((num(x.evidenceConfidence)||0)*100)+'% · Turn '+fmt(x.detectionTurn)+'</small>'+
  (Array.isArray(x.sanctioningCountryIds)&&x.sanctioningCountryIds.length?'<small>Sanction issuers: '+x.sanctioningCountryIds.map(countryLabel).map(esc).join(' · ')+'</small>':'')+
  (Array.isArray(x.sanctionPolicyIds)&&x.sanctionPolicyIds.length?'<small>Policy evidence: '+x.sanctionPolicyIds.map(esc).join(' · ')+'</small>':'')+
  (x.attemptedValueBuyer!==null&&x.attemptedValueBuyer!==undefined?'<small>Attempt value '+fmt(x.attemptedValueBuyer)+' · attempt fine '+percent(x.attemptFineRateAtCreation)+'</small>':'')+
  (x.sellerStockExposurePct!==null&&x.sellerStockExposurePct!==undefined?'<small>Shipment size '+esc(human(x.shipmentSizeBand))+' · '+percent(x.sellerStockExposurePct)+' of seller free stock · quantity thresholds '+(x.sellerFreeStockQuantityThresholds||[]).map(fmt).join(' / ')+' '+esc(x.unit||'units')+'</small>':'')+
  (x.fineRateAtCreation!==null&&x.fineRateAtCreation!==undefined?'<small>Potential completed-trade fine '+percent(x.fineRateAtCreation)+' · cargo seizure '+percent(x.seizureRateAtCreation)+'</small>':'')+
  (x.cargoDisposition?'<small>Cargo outcome '+esc(human(x.cargoDisposition))+'</small>':'')+'</article>').join('');
 const respHtml=responses.slice(-4).reverse().map(x=>{
  const impacts=Array.isArray(x.appliedRelationAdjustments)?x.appliedRelationAdjustments.map(a=>countryLabel(a.countryId)+' '+fmt(a.delta)).map(esc).join(' · '):'Not recorded';
  return '<article class="omega-bm-deal"><span class="omega-bm-status">FOREIGN RESPONSE</span><strong>'+esc(human(x.responseType||'Diplomatic response'))+'</strong><small>Target '+esc(countryLabel(x.targetCountryId))+' · Source '+esc(countryLabel(x.sourceCountryId))+' · '+esc(x.severity||'UNSPECIFIED')+'</small><small>Diplomatic relation impact: '+impacts+'</small></article>';
 }).join('');
 const transitHtml=transits.filter(x=>['IN_TRANSIT','ARRIVAL_PENDING'].includes(String(x.status||'').toUpperCase())).slice(-8).reverse().map(x=>'<article class="omega-bm-deal"><span class="omega-bm-status">'+esc(human(x.status||'IN_TRANSIT'))+'</span><strong>'+esc(x.resourceId)+' · '+fmt(x.quantity)+' '+esc(x.unit||'units')+'</strong><small>'+esc(countryLabel(x.sellerCountryId))+' → '+esc(countryLabel(x.buyerCountryId))+'</small><small>'+(Array.isArray(x.route)?x.route.map(y=>esc(y.checkpoint||y.role||countryLabel(y.countryId))).join(' → '):'Route not recorded')+'</small><small>Inspection checkpoints '+fmt((x.timeline||[]).length)+' / '+fmt((x.route||[]).length)+'</small></article>').join('');
 const reportHtml=networkReports.slice(-8).reverse().map(x=>{
  const profile=x.actorProfile||{},motive=x.motiveAssessment||{};
  const buyerReason=profile.buyerReason||motive.buyerReason||'';
  const sellerReason=profile.sellerReason||motive.sellerReason||'';
  const shock=profile.sellerExportShock||{},tariffs=profile.tariffAvoidance||{},
   buyerCommercial=profile.buyerCommercialActor||{},sellerCommercial=profile.sellerCommercialActor||{};
  const buyerCompanies=compactCompanies(profile.buyerCompanies),sellerCompanies=compactCompanies(profile.sellerCompanies);
  const actorDetails=[
   profile.buyerGovernmentLabel?'<small>Buyer actor: '+esc(profile.buyerGovernmentLabel)+'</small>':'',
   profile.sellerGovernmentLabel?'<small>Seller actor: '+esc(profile.sellerGovernmentLabel)+'</small>':'',
   buyerReason?'<small>Why buyer participates: '+esc(buyerReason)+'</small>':(motive.buyerMotive?'<small>Buyer motive: '+esc(human(motive.buyerMotive))+'</small>':''),
   sellerReason?'<small>Why seller participates: '+esc(sellerReason)+'</small>':(motive.sellerMotive?'<small>Seller motive: '+esc(human(motive.sellerMotive))+'</small>':''),
   profile.tactic?'<small>Network type: '+esc(human(profile.tactic))+'</small>':'',
   buyerCommercial.companyName?'<small>Buyer company: '+esc(buyerCommercial.companyName)+' · '+esc(human(buyerCommercial.actorType||'company'))+'</small>':'',
   sellerCommercial.companyName?'<small>Seller company: '+esc(sellerCommercial.companyName)+' · '+esc(human(sellerCommercial.actorType||'company'))+'</small>':'',
   shock.active?'<div class="omega-bm-impact"><strong>Major export-customer shock</strong><br>Customer: '+esc(countryLabel(shock.mainCustomerCountryId))+' · '+percent(shock.exportShare)+' of seller’s recorded '+esc(x.productName||x.resourceId)+' exports at risk<br>Sanction target: '+esc(countryLabel(shock.sanctionTargetCountryId||shock.mainCustomerCountryId))+' · '+esc(human(shock.sanctionTargetType||'SANCTIONS'))+'<br>Export value exposed: '+fmt(shock.exportValue)+' · Sanctioning country: '+(shock.sanctioningCountryIds||[]).map(countryLabel).map(esc).join(', ')+' · Secondary sanctions: '+(shock.secondarySanctionsRisk?'Yes':'Not recorded')+'</div>':'',
   tariffs.importTariffPct!==null&&tariffs.importTariffPct!==undefined?'<small>Buyer import tariff: '+percent(tariffs.importTariffPct)+' · import dependency: '+percent(tariffs.importDependency)+'</small>':'',
   buyerCompanies?'<small>Observed buyer companies: '+esc(buyerCompanies)+'</small>':'',
   sellerCompanies?'<small>Observed seller companies: '+esc(sellerCompanies)+'</small>':'',
   Array.isArray(profile.potentialIntermediaryCountryIds)&&profile.potentialIntermediaryCountryIds.length?
    '<small>Potential intermediaries: '+profile.potentialIntermediaryCountryIds.map(countryLabel).map(esc).join(' · ')+'</small>':''
  ].join('');
  return '<article class="omega-bm-deal"><span class="omega-bm-status'+(x.level==='HIGH'?' is-alert':'')+'">'+esc(x.level||'RUMOUR')+' INTELLIGENCE</span><strong>'+esc(x.productName||x.resourceId||'Covert network')+'</strong><small>'+esc(x.summary||'Covert activity observed')+'</small><small>'+(x.buyerCountryId?'Buyer '+esc(countryLabel(x.buyerCountryId))+' · ':'')+(x.sellerCountryId?'Seller '+esc(countryLabel(x.sellerCountryId)):'Counterparties unconfirmed')+'</small><small>Government role '+esc(human(x.governmentInvolvement||'NOT_ESTABLISHED'))+' · Confidence '+fmt((num(x.confidence)||0)*100)+'%</small>'+actorDetails+'<small>Other countries: '+esc(human(x.otherCountriesKnow||'NOT_RECORDED'))+'</small></article>';
 }).join('');
 const laneMeta=[
  ['RAW_RESOURCE','RAW RESOURCES','Natural resources','assets/omega-global-market/raw-mining.svg'],
  ['FACTORY_PRODUCT','FACTORY PRODUCTS','Manufactured goods','assets/omega-global-market/factory-refinery.svg'],
  ['FOOD_PRODUCT','FOOD PRODUCTS','Agriculture & food','assets/omega-global-market/food-products.svg']
 ];
 const laneButtons=laneMeta.map(([id,label,sub,img])=>
  '<button type="button" class="omega-bm-lane" data-bm-lane="'+id+'" aria-pressed="'+(validLane===id?'true':'false')+'"><img src="'+img+'" alt=""><span>'+label+'<small>'+sub+'</small></span></button>').join('');
 const productSearch=String(root.__omegaBmProductSearch||'').trim().toLowerCase(),
  visibleProducts=laneProducts.filter(x=>!productSearch||String(x.name||x.id).toLowerCase().includes(productSearch)).slice(0,80),
  productButtons=visibleProducts.map(x=>'<button type="button" class="omega-bm-product" data-bm-product="'+esc(x.id)+'" aria-pressed="'+(x.id===selectedProduct?'true':'false')+'"><strong>'+esc(x.name||x.id)+'</strong><small>'+esc(x.unit||'—')+'</small></button>').join(''),
  selectedMeta=laneProducts.find(x=>x.id===selectedProduct)||null;
 const sellerTable=offers.length?
  '<div class="omega-bm-table-wrap"><table class="omega-bm-table"><thead><tr><th>Seller country</th><th>Free stock</th><th>Shadow price</th><th>Detection</th><th>Channel</th><th>Order</th></tr></thead><tbody>'+sellerRows+'</tbody></table></div>'+sellerMore:
  '<div class="omega-bm-empty">'+(scanning?'Seller-country checks are running in small batches.':'Select a commodity and scan the seller network. No offer is assumed until stock, price, relation, route and policy evidence are checked.')+'</div>';
 const buyerTable=buyerSignals.length?
  '<div class="omega-bm-table-wrap"><table class="omega-bm-table"><thead><tr><th>Potential buyer country</th><th>Unmet supply</th><th>Demand / day</th><th>Stock coverage</th><th>Evidence</th></tr></thead><tbody>'+buyerRows+'</tbody></table></div>'+buyerMore:
  '<div class="omega-bm-empty">No other country currently has a matching recorded shortage signal for this commodity. Country names are not inferred from stereotypes.</div>';
 const acceptedTable=participationDeals.length?
  '<div class="omega-bm-table-wrap"><table class="omega-bm-table"><thead><tr><th>Buyer</th><th>Seller</th><th>Commodity</th><th>Quantity</th><th>Recorded status</th><th>Price</th></tr></thead><tbody>'+participationRows+'</tbody></table></div>':
  '<div class="omega-bm-empty">No request, negotiation, accepted offer or identified counterpart is recorded in the player’s own ledger or intelligence file for this commodity.</div>';
 const scanProgress=String(root.__omegaBmScanProgress||(scanning?'Seller scan in progress.':'Opening this screen does not scan all countries.'));
 root.innerHTML=styles()+
 '<section class="omega-bm"><header class="omega-bm-head"><div><div class="omega-bm-kicker">OMEGA WORLD ECONOMY · TRADE INTELLIGENCE DIVISION</div><h2>Black Market Network</h2><p class="omega-bm-sub">Covert supply channels, country-level demand, state-linked trade and evidence-based negotiations.</p><div class="omega-bm-scope">'+esc(playerInfo.flag||'🏳️')+' '+esc(playerInfo.name)+' · '+esc(c)+'</div></div><span class="omega-bm-classified">CLASSIFIED<br>OFF-GRID TRADE</span></header>'+
 '<div class="omega-bm-grid"><div class="omega-bm-stat"><small>Verified seller offers</small><strong>'+count(offers.length)+'</strong><em>Stock and route checks passed</em></div><div class="omega-bm-stat"><small>Potential buyer countries</small><strong>'+count(buyerSignals.length)+'</strong><em>Recorded domestic demand gaps</em></div><div class="omega-bm-stat"><small>Accepted offers</small><strong>'+count(acceptedDeals)+'</strong><em>Persisted ACCEPTED status only</em></div><div class="omega-bm-stat"><small>Active local pipeline</small><strong>'+count(active.length)+'</strong><em>'+count(settled)+' locally settled</em></div></div>'+
 '<nav class="omega-bm-lanes" aria-label="Commodity categories">'+laneButtons+'</nav>'+
 '<div class="omega-bm-layout"><aside class="omega-bm-box"><header><strong>Commodity board</strong><span>'+count(laneProducts.length)+' products</span></header>'+
 '<div class="omega-bm-product-head"><label for="omega-bm-product-search">Find commodity</label><input id="omega-bm-product-search" class="omega-bm-search" type="search" placeholder="Search products..." value="'+esc(root.__omegaBmProductSearch||'')+'" data-bm-product-search></div>'+
 '<div class="omega-bm-product-list">'+(productButtons||'<div class="omega-bm-empty-products">No products match this search.</div>')+'</div></aside>'+
 '<main class="omega-bm-main"><section class="omega-bm-product-hero"><div><small>SELECTED COMMODITY · '+esc(human(validLane))+'</small><h3>'+esc(selectedMeta?.name||selectedMeta?.title||selectedProduct||'Select a commodity')+'</h3><p>'+esc(selectedMeta?.unit?('Trading unit: '+selectedMeta.unit):'Choose a product from the commodity board')+'</p></div><span class="omega-bm-product-type">SHADOW<br>TRADE LANE</span></section>'+
 '<div class="omega-bm-toolbar"><div class="omega-bm-field"><label for="omega-bm-resource">Commodity</label><select id="omega-bm-resource" data-bm-resource>'+opts+'</select></div>'+
 '<div class="omega-bm-field"><label for="omega-bm-quantity">Required quantity</label><input id="omega-bm-quantity" type="number" min="0.001" step="any" value="'+esc(root.__omegaBmFindQuantity||'1')+'" data-bm-find-quantity></div>'+
 '<button class="omega-bm-btn" type="button" data-bm-find '+(scanning?'disabled':'')+'>'+(scanning?'SCANNING…':'SCAN SELLER NETWORK')+'</button>'+
 '<div class="omega-bm-progress" data-bm-scan-progress aria-live="polite">'+esc(scanProgress)+'</div></div>'+
 (root.__omegaBmOutcome?'<div class="omega-bm-outcome" role="status">'+esc(root.__omegaBmOutcome)+'</div>':'')+
 '<section class="omega-bm-section"><header><strong>01 · Seller offers</strong><span>'+count(offers.length)+' verified offer(s)</span></header><div class="omega-bm-section-note">Only countries with verified free stock, executable price, relationship, route and policy checks are shown. Expand a seller row for motive, sanctions, shipment-size and penalty evidence.</div>'+sellerTable+'</section>'+
 '<section class="omega-bm-section"><header><strong>02 · Countries interested in buying</strong><span>'+count(buyerSignals.length)+' potential buyer(s)</span></header><div class="omega-bm-section-note">These countries have a recorded domestic shortage or low stock coverage. A demand signal means potential buying interest, not a sent order or an accepted offer.</div>'+buyerTable+'</section>'+
 '<section class="omega-bm-section"><header><strong>03 · Recorded offers and acceptances</strong><span>'+count(participationDeals.length)+' known record(s) · '+count(acceptedDeals)+' accepted</span></header><div class="omega-bm-section-note">This panel uses the active country’s own deal ledger and its private intelligence reports only. Other countries’ confidential transactions are not exposed. An accepted offer requires the exact saved ACCEPTED status.</div>'+acceptedTable+'</section>'+
 '<div class="omega-bm-lower"><section class="omega-bm-panel"><header><strong>04 · Country operations ledger</strong><span>'+count(active.length)+' active · '+count(cases.length)+' case(s)</span></header><div class="omega-bm-panel-body">'+(dealHtml||'<div class="omega-bm-empty">No Black Market deal has been recorded for this country.</div>')+(caseHtml||'')+'</div></section>'+
 '<section class="omega-bm-panel"><header><strong>05 · Intelligence, foreign response & transit</strong><span>'+count(transits.filter(x=>x.status==='IN_TRANSIT').length)+' transit · '+count(responses.length)+' response(s)</span></header><div class="omega-bm-panel-body">'+(transitHtml||'')+(reportHtml||'')+(respHtml||'')+(!transitHtml&&!reportHtml&&!respHtml?'<div class="omega-bm-empty">No discovered network report, foreign response or covert transit is recorded in this country intelligence file.</div>':'')+'</div></section></div>'+
 '<p class="omega-bm-risknote">Country flags and names are resolved from canonical country records. Demand signals are not accepted orders. Seller quantities and risk are based on current game-state evidence. NPC deals and private intelligence remain hidden from countries that do not have authorization or their own discovery reports.</p></main></div></section>';
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
g.Omega=g.Omega||{};g.Omega.BlackMarketUI=Object.freeze({version:'1.6.0',render});g.OmegaBlackMarketUI=g.Omega.BlackMarketUI;
})(typeof window!=='undefined'?window:globalThis);
