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
function dataToken(value){return String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
function dataValue(map,key){
 if(!map||typeof map!=='object')return undefined;
 const wanted=dataToken(key),found=Object.keys(map).find(item=>dataToken(item)===wanted);
 return found===undefined?undefined:map[found];
}
function demandSignals(resourceId,playerCountryId){
 const state=g.Game?.state||g.gameState||g.Omega?.Simulation?.world?.state||{},root=state.resource;
 if(!resourceId||!root||typeof root!=='object'||Array.isArray(root))return[];
 const currentTurn=Number(state.simulation?.turn??state.turn??state.simulationTurn??0)||0,rows=[];
 for(const [countryId,record] of Object.entries(root)){
  const code=String(countryId||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{2,3}$/.test(code)||code===playerCountryId)continue;
  const runtime=record?.demandRuntime,demand=dataValue(runtime?.byResource,resourceId);
  if(!demand||typeof demand!=='object')continue;
  const unmet=Math.max(0,Number(demand.unmetDemand)||0),
   perDay=Math.max(0,Number(demand.demandPerDay??demand.demand)||0),
   coverage=demand.stockCoverageDays==null||demand.stockCoverageDays===''?null:Number(demand.stockCoverageDays),
   target=demand.stockCoverageTargetDays==null||demand.stockCoverageTargetDays===''?null:Number(demand.stockCoverageTargetDays),
   low=perDay>0&&Number.isFinite(coverage)&&Number.isFinite(target)&&target>coverage;
  if(unmet<=1e-8&&!low)continue;
  const gap=low?Math.max(unmet,perDay*(target-coverage)):unmet;
  if(!(gap>0))continue;
  const stale=Math.max(0,currentTurn-(Number(runtime.lastTurn)||currentTurn)),freshness=stale>30?.45:(stale>10?.7:1);
  const pressure=Math.max(Number(demand.procurementScore)||0,perDay>0?unmet/perDay:0,
   low?(target-coverage)/Math.max(target,1):0)*freshness;
  rows.push({countryId:code,quantity:gap,demandPerDay:perDay,coverage:Number.isFinite(coverage)?coverage:null,
   pressure,reason:Number(demand.activeFactoryInputDemandPerDay)>0?'Active factory input shortage':
    (/food|wheat|rice|fertili/i.test(String(resourceId))?'Domestic food demand gap':
     (/coal|oil|gas|uranium|energy/i.test(String(resourceId))?'Energy or industrial supply gap':'Recorded unmet demand')),
   status:String(demand.status||'SHORTAGE'),freshness,lastDemandTurn:Number(runtime.lastTurn)||null});
 }
 return rows.sort((a,b)=>b.pressure-a.pressure||b.quantity-a.quantity||a.countryId.localeCompare(b.countryId)).slice(0,24);
}
function confirmedParticipationDeals(resourceId,localDeals){
 const rows=Array.isArray(localDeals)?localDeals:[];
 return rows.filter(row=>row&&dataToken(row.resourceId)===dataToken(resourceId))
  .sort((a,b)=>(Number(b.createdTurn)||0)-(Number(a.createdTurn)||0)).slice(0,24);
}
function dealStatusLabel(value){
 const key=String(value||'UNKNOWN').toUpperCase();
 const labels={REQUESTED:'REQUEST SENT',SENT:'AWAITING SELLER RESPONSE',NEGOTIATING:'NEGOTIATING',
  ACCEPTED:'OFFER ACCEPTED',IN_TRANSIT:'IN TRANSIT',ARRIVAL_PENDING:'ARRIVAL PENDING',
  SETTLED:'SETTLED',SETTLED_UNDER_INVESTIGATION:'UNDER INVESTIGATION',
  INTERCEPTED:'INTERCEPTED',FAILED:'REJECTED',EXPIRED:'EXPIRED'};
 return labels[key]||human(key);
}
function styles(){return '<style>'+
'.omega-bm{--bm-bg:#070d13;--bm-panel:#101b25;--bm-panel2:#142330;--bm-line:rgba(119,155,174,.22);--bm-muted:#91a7b5;--bm-text:#edf5f6;--bm-gold:#d7ad68;--bm-cyan:#73d6e3;color:var(--bm-text);background:radial-gradient(ellipse at 8% -8%,rgba(52,116,130,.22),transparent 34%),radial-gradient(ellipse at 100% 18%,rgba(167,111,48,.10),transparent 29%),linear-gradient(150deg,#080f16 0%,#0b141d 56%,#09111a 100%);border:1px solid rgba(135,164,177,.24);border-radius:15px;overflow:hidden;box-shadow:inset 0 1px rgba(255,255,255,.07),0 16px 36px rgba(0,0,0,.28);min-width:0;isolation:isolate;position:relative}'+
'.omega-bm *{box-sizing:border-box}.omega-bm button,.omega-bm input,.omega-bm select{font:inherit}.omega-bm-head{position:relative;isolation:isolate;overflow:hidden;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:20px 20px 18px;min-height:142px;background:linear-gradient(105deg,rgba(15,39,50,.97),rgba(9,20,29,.96) 56%,rgba(20,25,29,.98));border-bottom:1px solid rgba(131,170,181,.22)}'+
'.omega-bm-head:before{content:"";position:absolute;inset:0;z-index:-1;opacity:.38;background-image:linear-gradient(rgba(143,184,190,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(143,184,190,.08) 1px,transparent 1px);background-size:25px 25px;mask-image:linear-gradient(90deg,black,transparent 88%)}'+
'.omega-bm-head:after{content:"";position:absolute;z-index:-1;width:270px;height:270px;right:8%;top:-152px;border:1px solid rgba(215,173,104,.20);border-radius:50%;box-shadow:0 0 0 22px rgba(215,173,104,.025),0 0 0 46px rgba(215,173,104,.02),inset 0 0 40px rgba(115,214,227,.06)}'+
'.omega-bm-head-main{min-width:0}.omega-bm-kicker{font-size:9px;font-weight:900;letter-spacing:.21em;color:#a9c5ca;text-transform:uppercase}.omega-bm-head h2{margin:7px 0 5px;font-size:clamp(22px,3.3vw,31px);line-height:1.05;letter-spacing:.12em;color:#f4f5ee;text-transform:uppercase}.omega-bm-sub{max-width:680px;margin:0;color:#a7bac0;font-size:11px;line-height:1.6}.omega-bm-classified{align-self:flex-start;flex:none;padding:7px 10px;border:1px solid rgba(215,173,104,.48);border-radius:4px;color:#efcd8c;background:rgba(94,65,30,.22);font-size:8px;letter-spacing:.15em;font-weight:900;text-align:center}.omega-bm-scope{display:flex;align-items:center;gap:7px;margin-top:11px;color:#a6bbc1;font-size:9px;letter-spacing:.12em;text-transform:uppercase}.omega-bm-scope:before{content:"";width:6px;height:6px;border-radius:50%;background:#7cd6c5;box-shadow:0 0 10px rgba(124,214,197,.7)}'+
'.omega-bm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:13px 15px 0}.omega-bm-stat{position:relative;min-width:0;padding:11px 12px 10px;border:1px solid var(--bm-line);border-radius:8px;background:linear-gradient(145deg,rgba(25,42,53,.96),rgba(12,23,32,.98));box-shadow:inset 0 1px rgba(255,255,255,.055),0 7px 16px rgba(0,0,0,.18)}.omega-bm-stat:before{content:"";position:absolute;left:12px;right:12px;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(115,214,227,.45),transparent)}.omega-bm-stat small{display:block;color:#91a9b3;font-size:8px;letter-spacing:.13em;text-transform:uppercase;font-weight:800}.omega-bm-stat strong{display:block;margin-top:6px;font-size:21px;line-height:1;color:#f0f4ef;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.omega-bm-stat em{display:block;margin-top:5px;color:#718b98;font-size:8px;font-style:normal;letter-spacing:.04em}'+
'.omega-bm-body{padding:14px 15px 17px}.omega-bm-brief{display:flex;align-items:flex-start;gap:10px;margin:0 0 13px;padding:10px 12px;border-left:2px solid var(--bm-gold);background:linear-gradient(90deg,rgba(135,97,46,.16),rgba(12,22,30,.18));color:#b8c7c9;font-size:10px;line-height:1.55}.omega-bm-brief strong{color:#e8c991;font-weight:800}.omega-bm-tools{border:1px solid rgba(114,159,174,.25);border-radius:10px;padding:11px;background:linear-gradient(145deg,rgba(17,32,43,.95),rgba(9,19,28,.96));box-shadow:inset 0 1px rgba(255,255,255,.04)}.omega-bm-lanes{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.omega-bm-lane{min-height:32px;padding:6px 11px;border:1px solid rgba(115,153,167,.24);border-radius:5px;background:rgba(8,19,28,.85);color:#9fb5bc;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;cursor:pointer}.omega-bm-lane[aria-pressed="true"]{border-color:rgba(215,173,104,.68);background:linear-gradient(145deg,rgba(119,83,39,.46),rgba(44,37,28,.62));color:#f2d59e;box-shadow:inset 0 1px rgba(255,255,255,.08),0 0 13px rgba(204,157,81,.10)}.omega-bm-tool-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,170px) auto;gap:8px;align-items:end}.omega-bm-field{display:flex;flex-direction:column;gap:5px;min-width:0}.omega-bm-field label{font-size:8px;letter-spacing:.13em;text-transform:uppercase;color:#93abb4;font-weight:900}.omega-bm select,.omega-bm input{width:100%;min-width:0;min-height:39px;border-radius:6px;border:1px solid rgba(116,161,178,.37);background:#0a1721;color:#e9f3f3;padding:8px 10px;font-size:11px;outline:none}.omega-bm select:focus,.omega-bm input:focus{border-color:#8bd1d9;box-shadow:0 0 0 2px rgba(115,214,227,.12)}.omega-bm button{min-height:38px;border-radius:6px;border:1px solid rgba(215,173,104,.48);padding:8px 14px;background:linear-gradient(145deg,#76572e,#3c3527);color:#fff0d2;font-size:9px;font-weight:900;letter-spacing:.09em;cursor:pointer;box-shadow:inset 0 1px rgba(255,255,255,.10),0 4px 10px rgba(0,0,0,.18);transition:transform .16s ease,border-color .16s ease,filter .16s ease}.omega-bm button:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.12);border-color:rgba(237,199,129,.8)}.omega-bm button:active:not(:disabled){transform:translateY(0)}.omega-bm button:disabled{opacity:.45;cursor:not-allowed}'+
'.omega-bm-section{margin:17px 0 9px;display:flex;align-items:center;justify-content:space-between;gap:8px}.omega-bm-section-copy{display:flex;align-items:center;gap:9px;min-width:0}.omega-bm-section-index{color:#c89d5c;font-size:9px;font-weight:900;letter-spacing:.12em}.omega-bm-section h3{margin:0;color:#e6efed;font-size:11px;letter-spacing:.13em;text-transform:uppercase}.omega-bm-section-note{color:#8098a2;font-size:9px;line-height:1.4;text-align:right}.omega-bm-muted{color:#8da4ad;font-size:9px;line-height:1.5}.omega-bm-offers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.omega-bm-offer{position:relative;min-width:0;padding:13px;border:1px solid rgba(112,154,169,.29);border-radius:9px;background:linear-gradient(148deg,rgba(24,40,50,.98),rgba(10,20,29,.99) 72%);box-shadow:inset 0 1px rgba(255,255,255,.075),0 9px 18px rgba(0,0,0,.20);overflow:hidden}.omega-bm-offer:before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:linear-gradient(180deg,rgba(215,173,104,.9),rgba(115,214,227,.28),transparent)}.omega-bm-offer:after{content:"";position:absolute;right:-48px;top:-66px;width:130px;height:130px;border:1px solid rgba(122,171,183,.10);border-radius:50%;box-shadow:0 0 0 13px rgba(122,171,183,.025)}.omega-bm-offer-top{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.omega-bm-seller{display:flex;align-items:center;gap:9px;min-width:0}.omega-bm-node{display:grid;place-items:center;flex:none;width:34px;height:34px;border:1px solid rgba(215,173,104,.44);border-radius:7px;background:linear-gradient(145deg,rgba(126,92,46,.44),rgba(25,35,39,.9));color:#f0d39e;font-size:9px;font-weight:900;letter-spacing:.06em;box-shadow:inset 0 1px rgba(255,255,255,.12),0 4px 9px rgba(0,0,0,.20)}.omega-bm-country{font-weight:900;font-size:12px;color:#eff4ee;letter-spacing:.02em}.omega-bm-country-context{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:8px}.omega-bm-country-context>div{min-width:0;padding:7px 8px;border:1px solid rgba(117,154,163,.13);border-radius:5px;background:rgba(4,13,19,.34)}.omega-bm-country-context small{display:block;color:#8da5ac;font-size:7px;letter-spacing:.07em;text-transform:uppercase}.omega-bm-country-context strong{display:block;margin-top:3px;color:#c9d9d5;font-size:8px;line-height:1.45;font-weight:700;overflow-wrap:anywhere}.omega-bm-country-context.is-impact{grid-template-columns:repeat(3,minmax(0,1fr))}.omega-bm-thresholds{margin-top:8px;padding:8px;border:1px solid rgba(215,173,104,.22);border-radius:6px;background:rgba(72,52,29,.14);color:#b9c4bf;font-size:8px;line-height:1.55}.omega-bm-thresholds strong{color:#e9cb91}.omega-bm-impact{margin-top:8px;padding:8px 9px;border:1px solid rgba(114,159,174,.18);border-radius:6px;background:rgba(5,14,21,.38);color:#afc0be;font-size:8px;line-height:1.55}.omega-bm-impact strong{color:#e8c58b}.omega-bm-tag{flex:none;max-width:48%;font-size:7px;letter-spacing:.09em;text-align:center;border-radius:4px;padding:5px 6px;color:#b8e4df;background:rgba(36,111,101,.17);border:1px solid rgba(91,182,166,.30)}.omega-bm-tag.is-restricted{color:#efca8c;background:rgba(127,83,33,.20);border-color:rgba(215,173,104,.39)}.omega-bm-prices{position:relative;z-index:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0 9px}.omega-bm-price{min-width:0;border-radius:7px;padding:9px;background:rgba(3,11,17,.50);border:1px solid rgba(125,159,170,.15)}.omega-bm-price.is-shadow{border-color:rgba(215,173,104,.25);background:linear-gradient(145deg,rgba(89,63,31,.22),rgba(5,13,19,.64))}.omega-bm-price small{display:block;color:#8da6ad;font-size:7px;letter-spacing:.10em;text-transform:uppercase;line-height:1.45}.omega-bm-price strong{display:block;margin-top:5px;font-size:13px;color:#f3f3e8;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.omega-bm-price.is-shadow strong{color:#efcf97}.omega-bm-price .omega-bm-price-note{margin-top:4px;color:#80959e;font-size:8px;line-height:1.4}.omega-bm-risk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:8px}.omega-bm-risk-cell{min-width:0;padding:7px 8px;border:1px solid rgba(112,151,166,.13);border-radius:6px;background:rgba(5,14,21,.42)}.omega-bm-risk-cell small{display:block;color:#8da3ac;font-size:7px;letter-spacing:.09em;text-transform:uppercase;line-height:1.35}.omega-bm-risk-cell strong{display:block;margin-top:4px;color:#e0ece8;font-size:10px;font-weight:800;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.omega-bm-risk-cell.is-alert strong{color:#e8c184}.omega-bm-riskline{display:flex;justify-content:space-between;gap:8px;padding-top:7px;margin-top:7px;border-top:1px solid rgba(113,155,178,.13);font-size:9px;color:#a7bbc0}.omega-bm-riskline strong{color:#e4c184;text-align:right}.omega-bm-meter{height:4px;margin-top:6px;overflow:hidden;border-radius:4px;background:rgba(148,166,168,.13)}.omega-bm-meter span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#5aa99e,#d5aa62);box-shadow:0 0 9px rgba(116,199,185,.25)}.omega-bm-policy{margin-top:8px;padding:8px 9px;border:1px solid rgba(125,151,153,.15);border-radius:6px;background:rgba(4,12,17,.35)}.omega-bm-policy small{display:block;margin-bottom:4px;color:#8da5ac;font-size:7px;letter-spacing:.10em;text-transform:uppercase}.omega-bm-policy span{color:#bbccca;font-size:8px;line-height:1.5;overflow-wrap:anywhere}.omega-bm-breakdown{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:9px}.omega-bm-breakdown-item{min-width:0;padding:6px;border-radius:5px;background:rgba(6,14,20,.4);border:1px solid rgba(115,150,160,.10)}.omega-bm-breakdown-item small{display:block;color:#7f98a0;font-size:6px;line-height:1.35;letter-spacing:.04em;text-transform:uppercase}.omega-bm-breakdown-item strong{display:block;margin-top:3px;color:#c7d6d2;font-size:8px;font-variant-numeric:tabular-nums}.omega-bm-order{display:grid;grid-template-columns:minmax(70px,105px) auto;gap:7px;margin-top:10px;position:relative;z-index:1}.omega-bm-order input{min-height:36px}.omega-bm-order button{width:100%;min-height:36px}.omega-bm-negotiate{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:8px;position:relative;z-index:1}.omega-bm-negotiate button{min-height:36px}.omega-bm-empty{padding:19px;border:1px dashed rgba(127,164,175,.34);border-radius:8px;color:#a2b4b7;text-align:center;font-size:10px;line-height:1.6;background:rgba(7,17,24,.42)}.omega-bm-outcome{margin:10px 0 0;padding:10px 12px;border-left:2px solid #d7ad68;background:rgba(123,83,31,.16);color:#ead5b0;font-size:10px;line-height:1.55}.omega-bm-lower{display:grid;grid-template-columns:1.1fr .9fr;gap:10px;align-items:start}.omega-bm-panel{min-width:0;border:1px solid rgba(112,151,165,.24);border-radius:8px;background:linear-gradient(150deg,rgba(18,32,42,.95),rgba(8,17,25,.98));box-shadow:inset 0 1px rgba(255,255,255,.04),0 6px 14px rgba(0,0,0,.15);overflow:hidden}.omega-bm-panel>header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;border-bottom:1px solid rgba(112,151,165,.16);background:linear-gradient(100deg,rgba(33,51,58,.72),rgba(12,22,30,.68))}.omega-bm-panel>header strong{color:#e8efeb;font-size:9px;letter-spacing:.12em;text-transform:uppercase}.omega-bm-panel>header span{color:#8fa5ac;font-size:8px}.omega-bm-panel-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:9px}.omega-bm-deal{min-width:0;padding:9px;border:1px solid rgba(112,151,165,.17);border-radius:6px;background:rgba(5,14,21,.43)}.omega-bm-deal strong{display:block;margin-top:5px;font-size:10px;color:#e9f0eb;overflow-wrap:anywhere}.omega-bm-deal small{display:block;color:#8da4ad;font-size:8px;line-height:1.5;margin-top:4px;overflow-wrap:anywhere}.omega-bm-status{display:inline-block;border-radius:3px;padding:3px 5px;background:rgba(43,126,151,.18);color:#9bd9dc;font-size:7px;font-weight:900;letter-spacing:.08em}.omega-bm-status.is-alert{background:rgba(133,83,34,.20);color:#e8c287}.omega-bm-more{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-top:9px;padding:8px 10px;border:1px solid rgba(112,151,165,.19);border-radius:6px;background:rgba(7,17,24,.55)}.omega-bm-more span{color:#8da5ad;font-size:8px}.omega-bm-more button{min-height:30px;padding:6px 10px;font-size:8px}.omega-bm-risknote{margin:12px 0 0;color:#7f969f;font-size:8px;line-height:1.6;border-top:1px solid rgba(108,153,180,.17);padding-top:9px}'+
'@media(max-width:760px){.omega-bm-offers{grid-template-columns:1fr}.omega-bm-lower{grid-template-columns:1fr}.omega-bm-head{padding:16px;min-height:130px}.omega-bm-grid{padding:10px 11px 0}.omega-bm-body{padding:12px}}'+
'@media(max-width:520px){.omega-bm-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.omega-bm-stat{padding:9px}.omega-bm-stat strong{font-size:18px}.omega-bm-head{align-items:flex-start;gap:8px}.omega-bm-classified{font-size:7px;padding:6px}.omega-bm-tool-row{grid-template-columns:minmax(0,1fr) minmax(90px,115px)}.omega-bm-tool-row>button{grid-column:1/-1}.omega-bm-lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.omega-bm-lane{padding:6px 5px;font-size:7px;letter-spacing:.02em}.omega-bm-breakdown{grid-template-columns:repeat(3,minmax(0,1fr))}.omega-bm-panel-body{grid-template-columns:1fr}.omega-bm-prices{grid-template-columns:1fr 1fr}}'+
'@media(prefers-reduced-motion:reduce){.omega-bm button{transition:none}}'+
'.omega-bm{--bm-text:#f4faff;--bm-muted:#b3cde5;color:#f4faff;background:linear-gradient(145deg,#06152d,#08264b 56%,#061a35);border-color:#237fc0;box-shadow:0 0 26px rgba(0,146,255,.18),inset 0 1px rgba(255,255,255,.09)}'+
'.omega-bm-head{background:linear-gradient(90deg,rgba(3,18,42,.97),rgba(5,37,77,.83) 58%,rgba(3,17,39,.94)),url("assets/omega-global-market/market-header.svg") center/cover no-repeat;border-bottom-color:#228cd7}.omega-bm-head:before{opacity:.5;background-image:linear-gradient(rgba(143,184,190,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(143,184,190,.08) 1px,transparent 1px)}'+
'.omega-bm-kicker{color:#88e1ff}.omega-bm-head h2{color:#fff;text-shadow:0 0 15px rgba(39,201,255,.26)}.omega-bm-sub{color:#d2e7fa}.omega-bm-scope{color:#ecf8ff}.omega-bm-stat,.omega-bm-panel,.omega-bm-tools{background:linear-gradient(145deg,#10335d,#071c38);border-color:#2a689e}.omega-bm-stat small{color:#b8d5ee}.omega-bm-stat strong{color:#fff}.omega-bm-stat em{color:#9ec8e9}'+
'.omega-bm-brief,.omega-bm-outcome{border-left-color:#36cfff;background:rgba(10,92,145,.23);color:#d8efff}.omega-bm-lane{border-color:#28699e;background:linear-gradient(120deg,#123c69,#071f3d);color:#e9f7ff}.omega-bm-lane[aria-pressed=true]{border-color:#36d2ff;background:linear-gradient(120deg,#087ec6,#0b315d);box-shadow:0 0 15px rgba(39,201,255,.23)}'+
'.omega-bm-tool-row select,.omega-bm-tool-row input,.omega-bm select,.omega-bm input{border-color:#397cac;background:#061a34;color:#fff}.omega-bm-tools button,.omega-bm button{border-color:#32c9fa;background:linear-gradient(145deg,#0783cf,#07539a);color:#fff}.omega-bm-section,.omega-bm-panel{border-color:#28699e;background:linear-gradient(150deg,#0b2a50,#061a35)}.omega-bm-section-copy,.omega-bm-section>header,.omega-bm-panel>header{background:linear-gradient(90deg,#124477,#0a2b52);border-bottom-color:#2b6ea2}.omega-bm-section-copy h3,.omega-bm-panel>header strong{color:#f3faff}.omega-bm-section-note,.omega-bm-panel>header span{color:#b7d9f4}.omega-bm-deal{border-color:rgba(112,151,165,.35);background:rgba(5,14,21,.43)}.omega-bm-deal strong{color:#f1f8ff}.omega-bm-deal small,.omega-bm-risknote{color:#b0c9e1}.omega-bm-tag,.omega-bm-status{background:rgba(9,92,143,.24);border-color:rgba(70,201,255,.36);color:#b2edff}.omega-bm-status.is-alert{background:rgba(135,72,18,.25);border-color:rgba(255,186,96,.42);color:#ffd390}'+
'.omega-bm-board-table{width:100%;min-width:600px;border-collapse:collapse}.omega-bm-board-table th{padding:9px 10px;background:rgba(4,20,42,.85);color:#b7d8f1;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.055em;white-space:nowrap}.omega-bm-board-table td{padding:9px 10px;border-top:1px solid rgba(90,153,196,.2);color:#eef7ff;font-size:12px;vertical-align:middle}.omega-bm-board-table tbody tr:not(.omega-bm-detail-row):hover td{background:rgba(20,105,173,.16)}.omega-bm-table-wrap{width:100%;overflow-x:auto;overscroll-behavior-x:contain}'+
'.omega-bm-country-row{display:flex;align-items:center;gap:9px;min-width:0}.omega-bm-flag{display:grid;place-items:center;flex:none;min-width:30px;height:23px;border:1px solid rgba(156,204,244,.34);border-radius:3px;background:rgba(2,13,27,.8);font-size:19px;line-height:1}.omega-bm-country-copy{display:block;min-width:0}.omega-bm-country-copy strong{display:block;color:#f4f9ff;font-size:12px;white-space:normal;line-height:1.25}.omega-bm-country-copy small{display:block;margin-top:2px;color:#a5c8e5;font-size:10px;font-weight:600;line-height:1.3}.omega-bm-row-action{display:flex;align-items:center;gap:6px;white-space:nowrap}.omega-bm-row-action input{width:85px;min-height:32px;padding:5px 7px;font-size:11px}.omega-bm-row-action button{min-height:32px;padding:6px 10px;font-size:10px}.omega-bm-number{font-weight:900;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}.omega-bm-risk{display:inline-block;padding:5px 7px;border:1px solid rgba(255,195,105,.4);border-radius:4px;background:rgba(118,70,16,.24);color:#ffda99;font-size:10px;font-weight:900;white-space:nowrap}'+
'.omega-bm-detail-row td{padding:0 9px 9px;border-top:0}.omega-bm-detail{border:1px solid rgba(97,158,200,.22);border-radius:5px;background:rgba(3,15,32,.45)}.omega-bm-detail summary{padding:8px 10px;color:#9fe3ff;font-size:11px;font-weight:800;cursor:pointer}.omega-bm-detail-body{padding:8px 10px 10px;color:#c4daed;font-size:11px;line-height:1.65}.omega-bm-detail-body .omega-bm-country-context{margin:8px 0}.omega-bm-more{border-color:rgba(90,153,196,.28);background:rgba(3,18,39,.55)}.omega-bm-more span{color:#bdd8ef}.omega-bm-empty{color:#bed6ed}'+
'.omega-bm-lanes{gap:8px}.omega-bm-lane{min-height:61px;display:flex;align-items:center;gap:9px}.omega-bm-lane img{width:38px;height:38px;object-fit:contain;flex:none;filter:drop-shadow(0 0 6px rgba(25,169,255,.33))}.omega-bm-lane span{display:block;line-height:1.3}.omega-bm-lane small{display:block;margin-top:3px;color:#a9d2ef;font-size:9px;font-weight:600}'+
'.omega-bm-progress{display:block;margin-top:7px;color:#b7e5fb;font-size:10px;line-height:1.45;min-height:15px}.omega-bm-section-note{color:#b4d2ea}.omega-bm-country-context{background:rgba(3,19,39,.5);border-color:rgba(70,150,205,.25)}.omega-bm-country-context strong{color:#ecf7ff}.omega-bm-thresholds{color:#c0d5e8}.omega-bm-riskline strong{color:#f0f8ff}.omega-bm-price strong{color:#fff}.omega-bm-price small,.omega-bm-price-note{color:#b0cde6}'+
'@media(max-width:760px){.omega-bm-board-table{min-width:570px}.omega-bm-lower{grid-template-columns:1fr}}@media(max-width:520px){.omega-bm-lane{display:block;text-align:center;padding:6px 4px}.omega-bm-lane img{display:block;width:27px;height:27px;margin:0 auto 4px}.omega-bm-lane span{font-size:8px}.omega-bm-lane small{font-size:7px}.omega-bm-board-table{min-width:550px}}'+'.omega-bm-mobile-card-note{display:none}'+
'@media(max-width:520px){.omega-bm-table-wrap{overflow:visible}.omega-bm-board-table{display:block;min-width:0!important;width:100%}.omega-bm-board-table thead{display:none}.omega-bm-board-table tbody{display:grid;gap:9px;width:100%;padding:8px}.omega-bm-board-table tbody tr:not(.omega-bm-detail-row){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:10px;border:1px solid #2b6ea2;border-radius:8px;background:linear-gradient(140deg,#10345e,#071d38);width:100%;min-width:0}.omega-bm-board-table tbody tr:not(.omega-bm-detail-row) td{display:block;min-width:0;width:100%;padding:4px 3px;border:0;white-space:normal;overflow-wrap:anywhere}.omega-bm-board-table tbody tr:not(.omega-bm-detail-row) td:before{content:attr(data-label);display:block;margin-bottom:4px;color:#9ac4e5;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.omega-bm-board-table tbody tr:not(.omega-bm-detail-row) td:first-child{grid-column:1/-1;border-bottom:1px solid rgba(120,175,214,.25);padding-bottom:9px}.omega-bm-board-table tbody tr:not(.omega-bm-detail-row) td:last-child{grid-column:1/-1}.omega-bm-board-table tbody tr.omega-bm-detail-row{display:block;width:100%;min-width:0}.omega-bm-board-table tbody tr.omega-bm-detail-row td{display:block;padding:0 2px 9px}.omega-bm-board-table .omega-bm-row-action{display:flex;flex-wrap:wrap;width:100%;gap:6px}.omega-bm-board-table .omega-bm-row-action input{width:100%;min-width:0;min-height:36px}.omega-bm-board-table .omega-bm-row-action button{width:100%;min-height:36px}.omega-bm-board-table .omega-bm-number{white-space:normal}.omega-bm-board-table .omega-bm-country-row{gap:8px}.omega-bm-board-table .omega-bm-country-copy strong{font-size:12px}.omega-bm-board-table .omega-bm-detail summary{font-size:10px;padding:8px}.omega-bm-board-table .omega-bm-detail-body{font-size:10px;line-height:1.55}}'+'</style>';}
function cancelScan(root){
 root.__omegaBmScanToken=(Number(root.__omegaBmScanToken)||0)+1;
 root.__omegaBmScanning=false;root.__omegaBmScan=null;
}
function scheduleScan(fn){
 if(typeof g.setTimeout==='function')g.setTimeout(fn,0);else fn();
}
function render(root,countryValue){
 const bm=g.OmegaBlackMarket||g.Omega?.BlackMarket;if(!root||!bm)return{ok:false,reason:'BLACK_MARKET_RUNTIME_UNAVAILABLE'};
 const c=String(countryValue||g.OmegaMinistryViewCountry||g.OmegaCabinetUI?.activeCountry||g.currentActiveCountry||'').trim().toUpperCase();
 const appState=g.Game?.state||g.gameState||g.Omega?.Simulation?.world?.state||{};
 const localBucket=domain=>{
  const root=appState?.[domain];
  if(!root||typeof root!=='object'||Array.isArray(root))return{};
  const key=Object.keys(root).find(value=>String(value||'').trim().toUpperCase()===c);
  return key===undefined?{}:(root[key]||{});
 };
 const localForeign=localBucket('foreign'),localEconomy=localBucket('economy'),
  localTrade=localBucket('trade'),localIntelligence=localBucket('intelligence');
 const sanctionNotices=Array.isArray(localForeign.sanctionNotifications)?localForeign.sanctionNotifications:[],
  sanctionDecisions=Array.isArray(localForeign.sanctionNationalDecisions)?localForeign.sanctionNationalDecisions:[],
  sanctionImpacts=Array.isArray(localEconomy.sanctionEconomicAssessments)?localEconomy.sanctionEconomicAssessments:[],
  sanctionRecovery=Array.isArray(localTrade.sanctionMarketRecoveryPlans)?localTrade.sanctionMarketRecoveryPlans:[],
  sanctionInvestigations=Array.isArray(localIntelligence.sanctionInvestigations)?localIntelligence.sanctionInvestigations:[];
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
  visibleBuyerCount=Math.max(8,Math.min(24,Number(root.__omegaBmVisibleBuyers)||8));
 const buyerSignals=selectedProduct?demandSignals(selectedProduct,c):[],
  participationDeals=selectedProduct?confirmedParticipationDeals(selectedProduct,deals):[],
  acceptedDeals=participationDeals.filter(x=>String(x.status||'').toUpperCase()==='ACCEPTED').length,
  scanning=!!root.__omegaBmScanning;
 const active=deals.filter(x=>!['FAILED','EXPIRED'].includes(String(x.status||'').toUpperCase()));
 const settled=deals.filter(x=>['SETTLED','SETTLED_UNDER_INVESTIGATION'].includes(String(x.status||'').toUpperCase())).length;
 const exposed=deals.filter(x=>['INTERCEPTED','SETTLED_UNDER_INVESTIGATION'].includes(String(x.status||'').toUpperCase())).length;
 const count=(v)=>fmt(v);
 const pct=(v)=>Math.max(0,Math.min(100,(Number(v)||0)*100));
 const section=(index,title,note)=>'<div class="omega-bm-section"><div class="omega-bm-section-copy"><span class="omega-bm-section-index">'+esc(index)+'</span><h3>'+esc(title)+'</h3></div><span class="omega-bm-section-note">'+esc(note||'')+'</span></div>';
 const cards=offers.slice(0,visibleOfferCount).map(x=>{
  const q=Math.min(num(x.requestedQuantity)||1,num(x.availableQuantity)||1),saving=num(x.expectedSavings),comparisonCurrency=x.buyerCurrency||x.currency;
  const legalTag=x.legalMarketAvailable?(saving!==null&&saving>0?'COST ADVANTAGE':'STRATEGIC ACCESS'):(x.embargoed?'EMBARGO BYPASS':x.exportRestrictionReason?'EXPORT RESTRICTION':x.sanctionsAtQuote?'SANCTIONS':'NO LEGAL OFFER');
  const foreignBasis=(Array.isArray(x.foreignPolicyBasis)?x.foreignPolicyBasis:[]).join(' · ')||'No blocking foreign-policy measure observed',math=x.pricingBreakdown||{},
   negotiation=root.__omegaBmNegotiation&&root.__omegaBmNegotiation.offerId===x.offerId?root.__omegaBmNegotiation:null;
  const detected=pct(x.detectionProbability),late=pct(x.lateDetectionProbability);
  const restricted=!x.legalMarketAvailable;
  const metrics=[
   ['DETECTION BEFORE DISPATCH',fmt(num(x.detectionProbability)===null?null:num(x.detectionProbability)*100)+'%',true],
   ['LATE DISCOVERY',fmt(num(x.lateDetectionProbability)===null?null:num(x.lateDetectionProbability)*100)+'%',true],
   ['EXPECTED DELIVERED',fmt(x.expectedDeliveredQuantity)+' '+(x.unit||'units'),false],
   ['EXPECTED CARGO LOSS',fmt(x.expectedSeizedQuantity)+' '+(x.unit||'units'),true],
   ['EXPECTED FINE COST',x.expectedFineCostBuyer===null?'Not priced':money(x.expectedFineCostBuyer,comparisonCurrency),true],
   ['SELLER STOCK OBSERVED',fmt(x.availableQuantity)+' '+(x.unit||'units'),false]
  ].map((m,i)=>'<div class="omega-bm-risk-cell'+(m[2]?' is-alert':'')+'"><small>'+m[0]+'</small><strong>'+esc(m[1])+'</strong>'+(i===0?'<div class="omega-bm-meter"><span style="width:'+detected.toFixed(1)+'%"></span></div>':i===1?'<div class="omega-bm-meter"><span style="width:'+late.toFixed(1)+'%"></span></div>':'')+'</div>').join('');
  const breakdown=[['Tariff discount',math.tariffDiscountPct],['Risk premium',math.riskPremiumPct],['Policy premium',math.policyPremiumPct],['Scarcity premium',math.scarcityPremiumPct],['Broker spread',math.brokerSpreadPct]].map(row=>'<div class="omega-bm-breakdown-item"><small>'+row[0]+'</small><strong>'+fmt(row[1])+'%</strong></div>').join('');
  const sellerInfo=countryInfo(x.sellerCountryId);
  const motiveMarkup=(x.sellerMotiveReason||x.buyerMotiveReason)?
   '<div class="omega-bm-country-context">'+
    (x.sellerMotiveReason?'<div><small>Why '+esc(sellerInfo.name)+' sells</small><strong>'+esc(x.sellerMotiveReason)+'</strong></div>':'')+
    (x.buyerMotiveReason?'<div><small>Why '+esc(countryInfo(c).name)+' wants this commodity</small><strong>'+esc(x.buyerMotiveReason)+'</strong></div>':'')+
   '</div>':'';
  const thresholdAmounts=Array.isArray(x.scrutinyThresholds?.sellerFreeStockQuantity)?x.scrutinyThresholds.sellerFreeStockQuantity:[],
   thresholdLabels=['1%','3%','8%','15%'],thresholdAmountText=thresholdAmounts.length===4?
    thresholdAmounts.map((v,i)=>thresholdLabels[i]+' = '+fmt(v)+' '+(x.unit||'units')).join(' · '):'';
  const scrutinyMarkup=x.shipmentSizeBand?
   '<div class="omega-bm-country-context is-impact">'+
    '<div><small>Shipment class</small><strong>'+esc(human(x.shipmentSizeBand))+'</strong></div>'+
    '<div><small>Seller stock exposed</small><strong>'+percent(x.sellerStockExposurePct)+'</strong></div>'+
    '<div><small>Attempts in 10 turns</small><strong>'+fmt(x.repeatAttempts10Turns||0)+'</strong></div>'+
   '</div>'+
   '<div class="omega-bm-thresholds"><strong>Quantity thresholds from verified free stock</strong>'+
    (thresholdAmountText?'<br>'+esc(thresholdAmountText):' · 1%, 3%, 8% and 15% of verified free stock')+
    '<br><strong>Detection bands</strong> · ≤1% Micro · 1–3% Small · 3–8% Moderate · 8–15% Large · &gt;15% Critical.'+
    ' <strong>Potential penalties</strong>: interception attempt fine '+percent(x.attemptFineRate)+' · completed-trade fine '+percent(x.fineRate)+' · post-settlement cargo seizure '+percent(x.seizureRate)+'.</div>':'';
  const detailMarkup='<details class="omega-bm-detail"><summary>PRICE, POLICY, MOTIVE & ENFORCEMENT DETAILS · '+esc(sellerInfo.name)+'</summary><div class="omega-bm-detail-body">'+
   '<div class="omega-bm-prices"><div class="omega-bm-price is-shadow"><small>Quoted trade value · buyer currency</small><strong>'+(x.quotedTradeValueBuyer===null?'FX not observed':money(x.quotedTradeValueBuyer,comparisonCurrency))+'</strong></div>'+
   '<div class="omega-bm-price"><small>Legal landed cost · buyer currency</small><strong>'+(x.legalLandedUnitPrice===null?'No comparable quote':money(x.legalLandedUnitPrice,comparisonCurrency))+'</strong><div class="omega-bm-price-note">'+(saving===null?'Legal benchmark unavailable':(saving>=0?'Expected saving ':'Expected extra cost ')+money(Math.abs(saving),comparisonCurrency))+'</div></div></div>'+
   '<div class="omega-bm-riskline"><span>Strategic rationale</span><strong>'+esc(String(x.whyUse||'').replace(/_/g,' '))+'</strong></div>'+motiveMarkup+scrutinyMarkup+
   '<div class="omega-bm-riskline"><span>Broker standing</span><strong>'+esc(actorRole(x.sellerActorClass))+' · '+esc(String(x.brokerType||'PRIVATE_BROKER').replace(/_/g,' '))+' · '+fmt(x.brokerReputation===undefined?50:x.brokerReputation)+'/100</strong></div>'+
   '<div class="omega-bm-risk-grid">'+metrics+'</div>'+
   '<div class="omega-bm-policy"><small>Foreign-policy exposure / evidence</small><span>'+esc(foreignBasis)+
    (Array.isArray(x.sanctioningCountryIds)&&x.sanctioningCountryIds.length?'<br>Sanction issuers: '+esc(x.sanctioningCountryIds.map(countryLabel).join(' · ')):'')+'</span></div>'+
   '<div class="omega-bm-breakdown">'+breakdown+'</div>'+
   '<div class="omega-bm-negotiate"><input type="number" min="0.001" step="any" value="'+esc(negotiation?.bidUnitPrice??x.unitPrice)+'" data-bm-bid="'+esc(x.offerId)+'" aria-label="Bid price per unit">'+
   '<button type="button" data-bm-negotiate="'+esc(x.offerId)+'" data-bm-seller="'+esc(x.sellerCountryId)+'" data-bm-resource="'+esc(x.resourceId)+'">NEGOTIATE PRICE</button></div>'+
   (negotiation?'<div class="omega-bm-outcome">Broker '+esc(human(negotiation.status))+': '+(negotiation.status==='COUNTERED'?'counter price '+money(negotiation.counterUnitPrice,x.currency)+' / unit':(negotiation.status==='ACCEPTED'?'agreed price '+money(negotiation.agreedUnitPrice,x.currency)+' / unit':'negotiation recorded'))+'</div>':'')+
   (negotiation&&negotiation.status==='COUNTERED'?'<button type="button" data-bm-accept-counter="'+esc(negotiation.negotiationId)+'">ACCEPT COUNTER · '+money(negotiation.counterUnitPrice,x.currency)+'</button>':'')+
   '</div></details>';
  return '<tr><td data-label="Seller country"><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(sellerInfo.flag||String(x.sellerCountryId||'??').slice(0,3))+'</span><span class="omega-bm-country-copy"><strong>'+esc(sellerInfo.name)+'</strong><small>'+esc(actorRole(x.sellerActorClass))+'</small></span></div></td>'+
   '<td data-label="Available stock"><span class="omega-bm-number">'+fmt(x.availableQuantity)+' '+esc(x.unit||'')+'</span></td>'+
   '<td data-label="Shadow price"><span class="omega-bm-number">'+money(x.unitPrice,x.currency)+'</span><small class="omega-bm-muted"> / unit</small></td>'+
   '<td data-label="Detection risk"><span class="omega-bm-risk">'+fmt(detected)+'% RISK</span></td>'+
   '<td data-label="Channel"><span class="omega-bm-tag'+(restricted?' is-restricted':'')+'">'+esc(legalTag)+'</span></td>'+
   '<td data-label="Order"><div class="omega-bm-row-action"><input type="number" min="0.001" max="'+esc(x.availableQuantity)+'" step="any" value="'+esc(q)+'" data-bm-quantity="'+esc(x.offerId)+'" aria-label="Order quantity from '+esc(sellerInfo.name)+'">'+
   '<button type="button" data-bm-buy="'+esc(x.offerId)+'" data-bm-seller="'+esc(x.sellerCountryId)+'" data-bm-resource="'+esc(x.resourceId)+'">BUY</button></div></td></tr>'+
   '<tr class="omega-bm-detail-row"><td colspan="6">'+detailMarkup+'</td></tr>';
 }).join('');
 const offerMore=offers.length>visibleOfferCount?
  '<div class="omega-bm-more"><span>Showing '+count(visibleOfferCount)+' of '+count(offers.length)+' seller offers</span><button type="button" data-bm-show-more>SHOW '+count(Math.min(6,offers.length-visibleOfferCount))+' MORE SELLERS</button></div>':''; 
 const buyerRows=buyerSignals.slice(0,visibleBuyerCount).map(x=>{
  const info=countryInfo(x.countryId);
  return '<tr><td data-label="Potential buyer country"><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(info.flag||'🏳️')+'</span><span class="omega-bm-country-copy"><strong>'+esc(info.name)+'</strong><small>'+esc(x.reason)+'</small></span></div></td>'+
   '<td data-label="Recorded supply gap"><span class="omega-bm-number">'+fmt(x.quantity)+'</span></td><td data-label="Demand per day">'+fmt(x.demandPerDay)+'/day</td>'+
   '<td data-label="Stock coverage">'+(x.coverage===null?'—':fmt(x.coverage)+' days')+'</td><td data-label="Signal"><span class="omega-bm-tag">POTENTIAL BUYER</span></td></tr>';
 }).join('');
 const buyerMore=buyerSignals.length>visibleBuyerCount?
  '<div class="omega-bm-more"><span>Showing '+count(visibleBuyerCount)+' of '+count(buyerSignals.length)+' demand signals</span><button type="button" data-bm-show-more-buyers>SHOW MORE COUNTRIES</button></div>':'';
 const participationRows=participationDeals.slice(0,16).map(x=>{
  const status=String(x.status||'UNKNOWN').toUpperCase(),alert=['INTERCEPTED','SETTLED_UNDER_INVESTIGATION','FAILED','EXPIRED'].includes(status),
   buyerInfo=countryInfo(x.buyerCountryId),sellerInfo=countryInfo(x.sellerCountryId);
  return '<tr><td data-label="Buyer country"><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(buyerInfo.flag||'🏳️')+'</span><span class="omega-bm-country-copy"><strong>'+esc(buyerInfo.name)+'</strong><small>BUYER</small></span></div></td>'+
   '<td data-label="Seller country"><div class="omega-bm-country-row"><span class="omega-bm-flag">'+esc(sellerInfo.flag||'🏳️')+'</span><span class="omega-bm-country-copy"><strong>'+esc(sellerInfo.name)+'</strong><small>SELLER</small></span></div></td>'+
   '<td data-label="Commodity">'+esc(x.productName||x.resourceId)+'</td><td data-label="Quantity">'+fmt(x.quantity)+' '+esc(x.unit||'')+'</td>'+
   '<td data-label="Recorded status"><span class="omega-bm-status'+(alert?' is-alert':'')+'">'+esc(dealStatusLabel(status))+'</span></td><td data-label="Unit price">'+esc(money(x.unitPrice,x.currency))+'</td></tr>';
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

 const sanctionMoney = row => {
  if(!row||typeof row!=='object')return 'Not recorded';
  if(row.value!==null&&row.value!==undefined&&row.currency)return money(row.value,row.currency);
  const byCurrency=row.valueByCurrency&&typeof row.valueByCurrency==='object'?row.valueByCurrency:{};
  const pairs=Object.entries(byCurrency).filter(([,value])=>num(value)!==null);
  return pairs.length?pairs.map(([currency,value])=>money(value,currency)).join(' · '):
   (row.currencyStatus==='MIXED_OR_UNATTRIBUTED_CURRENCY'?'Mixed or unattributed currencies':'Not recorded');
 };
 const sanctionNoticeHtml=sanctionNotices.slice(-8).reverse().map(notice=>{
  const issuer=countryInfo(notice.issuerCountryId),target=countryInfo(notice.targetCountryId),
   impact=sanctionImpacts.find(row=>row.policyKey===notice.policyKey),
   decision=sanctionDecisions.find(row=>row.policyKey===notice.policyKey),
   recovery=sanctionRecovery.find(row=>row.policyKey===notice.policyKey);
  const impactRows=(impact?.tradeExposure||[]).map(item=>{
   const tradeValue=item.exportsAtRisk||{},importValue=item.importsAtRisk||{},
    demand=(impact?.demandAndIndustry||[]).find(row=>row.resourceId===item.resourceId)||{},
    stock=demand.domesticDemand||{};
   return '<article class="omega-bm-deal"><strong>'+esc(human(item.resourceId))+'</strong>'+
    '<div class="omega-bm-country-context is-impact">'+
     '<div><small>Settled exports exposed</small><strong>'+esc(sanctionMoney(tradeValue))+
      ' · '+fmt(tradeValue.recordCount||0)+' settlement(s)</strong></div>'+
     '<div><small>Settled imports exposed</small><strong>'+esc(sanctionMoney(importValue))+
      ' · '+fmt(importValue.recordCount||0)+' settlement(s)</strong></div>'+
     '<div><small>Domestic shortage / stock</small><strong>'+
      (stock.unmetDemand===null||stock.unmetDemand===undefined?'Demand not recorded':fmt(stock.unmetDemand)+' unmet')+
      (stock.stockCoverageDays===null||stock.stockCoverageDays===undefined?'':' · '+fmt(stock.stockCoverageDays)+' days cover')+
      '</strong></div>'+
    '</div></article>';
  }).join('');
  const optionRows=(decision?.options||[]).slice(0,4).map(option=>
   '<div class="omega-bm-riskline"><span>'+esc(option.title||human(option.id))+'</span><strong>'+esc(human(option.feasibility||''))+'</strong></div>'
  ).join('');
  const recoveryDetails=[];
  for(const item of recovery?.importDiversification||[])
   recoveryDetails.push('Import '+human(item.resourceId)+': '+(item.legalSources||[]).map(x=>countryInfo(x.sellerCountryId).name).join(', '));
  for(const item of recovery?.exportRedirection||[])
   recoveryDetails.push('Export '+human(item.resourceId)+': '+(item.alternativeBuyers||[]).map(x=>countryInfo(x.buyerCountryId).name).join(', '));
  return '<article class="omega-bm-deal"><span class="omega-bm-status'+(notice.role==='SUPPLIER'?'':' is-alert')+'">'+
   esc(notice.role==='SUPPLIER'?'SUPPLY-CHAIN SPILLOVER':notice.role==='ISSUER'?'ISSUER POLICY NOTICE':'SANCTION NOTICE')+
   '</span><strong>'+esc(issuer.name)+' → '+esc(target.name)+'</strong>'+
   '<small>Policy '+esc(notice.policyId||notice.policyKey)+' · '+esc(human(notice.policyType||'SANCTIONS'))+
    ' · '+esc(human(notice.direction||'BOTH'))+' · Effective turn '+fmt(notice.effectiveTurn)+'</small>'+
   '<small>Country role: '+esc(human(notice.role))+
    (notice.secondarySanctions?' · Secondary-sanctions scope recorded':'')+
    (notice.expiryTurn===null||notice.expiryTurn===undefined?'':' · Expiry turn '+fmt(notice.expiryTurn))+'</small>'+
   (impactRows||'<small>No settled bilateral commodity record matched this policy. Financial loss is not assumed.</small>')+
   (decision?'<div class="omega-bm-impact"><strong>National response · '+esc(decision.selectedActionTitle||human(decision.selectedAction))+'</strong>'+
    '<br>'+esc((decision.governmentMotives||[]).map(human).join(' · '))+
    optionRows+'</div>':'')+
   (recoveryDetails.length?'<div class="omega-bm-policy"><small>Recovery candidates · planning only</small><span>'+
    esc(recoveryDetails.join(' · '))+'</span></div>':'')+
   '</article>';
 }).join('');
 const investigationMarkup=sanctionInvestigations.slice(-8).reverse().map(item=>
  '<article class="omega-bm-deal"><span class="omega-bm-status">'+esc(human(item.status||'MONITORING'))+'</span>'+
  '<strong>'+esc(human(item.role||'National investigation'))+' · '+esc(countryInfo(item.counterpartCountryId).name)+'</strong>'+
  '<small>'+esc((item.triggerReasons||[]).map(human).join(' · '))+'</small>'+
  '<small>Capability '+(item.capabilityScore===null||item.capabilityScore===undefined?'Not observed':fmt(item.capabilityScore*100)+'%')+
  ' · '+esc(human(item.collectionMode||'PASSIVE MONITORING ONLY'))+
  ' · No automatic spending</small></article>'
 ).join('');
 const sanctionPanel='<section class="omega-bm-panel" style="margin-top:12px"><header><strong>06 · Sanctions, economic exposure & national response</strong>'+
  '<span>'+fmt(sanctionNotices.length)+' notice(s) · '+fmt(sanctionDecisions.length)+' decision(s) · '+fmt(sanctionInvestigations.length)+' case(s)</span></header>'+
  '<div class="omega-bm-panel-body">'+(sanctionNoticeHtml||'<div class="omega-bm-empty">No sanction or supply-chain spillover notice is recorded for this country.</div>')+
   (investigationMarkup||'')+'</div>'+
  '<p class="omega-bm-risknote">Only this country’s own Foreign Affairs, Economy, Trade and Intelligence records are shown. Exposure uses settled trade evidence; it is not proof of a realised loss or automatic sanction causation. National options are assessments, not executed purchases or covert orders.</p></section>';
 const selectedProductMeta=laneProducts.find(x=>x.id===selectedProduct)||null;
 const laneButtons=[
  ['RAW_RESOURCE','RAW RESOURCES','Natural resources','assets/omega-global-market/raw-mining.svg'],
  ['FACTORY_PRODUCT','FACTORY PRODUCTS','Manufactured goods','assets/omega-global-market/factory-refinery.svg'],
  ['FOOD_PRODUCT','FOOD PRODUCTS','Agriculture & food','assets/omega-global-market/food-products.svg']
 ].map(([id,label,sub,img])=>'<button type="button" class="omega-bm-lane" data-bm-lane="'+id+'" aria-pressed="'+(validLane===id?'true':'false')+'"><img src="'+img+'" alt=""><span>'+label+'<small>'+sub+'</small></span></button>').join('');
 const sellerTable=offers.length?
  '<div class="omega-bm-table-wrap"><table class="omega-bm-board-table omega-bm-seller-table"><thead><tr><th>Seller country</th><th>Available stock</th><th>Shadow price</th><th>Detection risk</th><th>Channel</th><th>Order</th></tr></thead><tbody>'+cards+'</tbody></table></div>'+offerMore:
  '<div class="omega-bm-empty">'+(scanning?'Seller-country checks are running in small batches.':'Select a commodity and scan. Offers appear only after the runtime checks stock, route, policy and price.')+'</div>';
 const buyerTable=buyerSignals.length?
  '<div class="omega-bm-table-wrap"><table class="omega-bm-board-table omega-bm-buyer-table"><thead><tr><th>Potential buyer country</th><th>Recorded supply gap</th><th>Demand / day</th><th>Stock coverage</th><th>Signal</th></tr></thead><tbody>'+buyerRows+'</tbody></table></div>'+buyerMore:
  '<div class="omega-bm-empty">No other country currently has a matching demand-runtime shortage signal for this commodity. No buyer is inferred from country identity alone.</div>';
 const localDealTable=participationRows?
  '<div class="omega-bm-table-wrap"><table class="omega-bm-board-table omega-bm-local-deal-table"><thead><tr><th>Buyer country</th><th>Seller country</th><th>Commodity</th><th>Quantity</th><th>Recorded status</th><th>Unit price</th></tr></thead><tbody>'+participationRows+'</tbody></table></div>':
  '<div class="omega-bm-empty">This player country has no saved Black Market request or acceptance for this commodity. Foreign NPC deals remain hidden until discovered through country-scoped intelligence.</div>';
 root.innerHTML=styles()+'<section class="omega-bm"><header class="omega-bm-head"><div class="omega-bm-head-main"><div class="omega-bm-kicker">OMEGA WORLD ECONOMY · TRADE INTELLIGENCE DIVISION</div><h2>Black Market Network</h2><p class="omega-bm-sub">Country-by-country shadow trade: verified sellers, evidence-backed buyer demand and restricted intelligence.</p><div class="omega-bm-scope">Active country · '+esc(countryLabel(c||'COUNTRY NOT SELECTED'))+'</div></div><span class="omega-bm-classified">CLASSIFIED<br>OFF-GRID TRADE</span></header>'+
  '<div class="omega-bm-grid"><div class="omega-bm-stat"><small>Verified seller offers</small><strong>'+count(offers.length)+'</strong><em>Stock and route checks passed</em></div><div class="omega-bm-stat"><small>Potential buyer countries</small><strong>'+count(buyerSignals.length)+'</strong><em>Recorded shortage indicators</em></div><div class="omega-bm-stat"><small>Player-country acceptances</small><strong>'+count(acceptedDeals)+'</strong><em>Saved ACCEPTED status only</em></div><div class="omega-bm-stat"><small>Active local pipeline</small><strong>'+count(active.length)+'</strong><em>'+count(settled)+' locally settled · '+count(exposed)+' enforcement cases</em></div></div>'+
  '<div class="omega-bm-body"><p class="omega-bm-brief"><span>◆</span><span><strong>Strategic market reading:</strong> Seller offers require verified tradeable stock, pricing, policy and route checks. Buyer demand is an indicator—not proof of an order. Foreign NPC deals are not exposed until the player discovers them through country-scoped intelligence.</span></p>'+
  '<div class="omega-bm-tools"><div class="omega-bm-lanes" role="group" aria-label="Commodity categories">'+laneButtons+'</div><div class="omega-bm-tool-row"><div class="omega-bm-field"><label for="omega-bm-resource">Select strategic commodity</label><select id="omega-bm-resource" data-bm-resource>'+opts+'</select></div><div class="omega-bm-field"><label for="omega-bm-quantity">Required quantity</label><input id="omega-bm-quantity" type="number" min="0.001" step="any" value="'+esc(root.__omegaBmFindQuantity||'1')+'" data-bm-find-quantity></div><button type="button" data-bm-find '+(scanning?'disabled':'')+'>'+(scanning?'SCANNING…':'SCAN SELLER NETWORK')+'</button></div><div class="omega-bm-progress" data-bm-scan-progress aria-live="polite">'+esc(root.__omegaBmScanProgress||(scanning?'Seller-country scan is in progress.':'Opening this screen does not run a world-wide seller search.'))+'</div></div>'+
  (root.__omegaBmOutcome?'<div class="omega-bm-outcome" role="status">'+esc(root.__omegaBmOutcome)+'</div>':'')+
  '<section class="omega-bm-section"><header><strong>01 · Seller offers</strong><span>'+count(offers.length)+' verified offer(s) · '+esc(selectedProductMeta?.name||selectedProductMeta?.title||selectedProduct||'No selected commodity')+'</span></header><div class="omega-bm-section-note">Seller country, free stock, shadow quote, detection risk and channel are visible at a glance. Expand a row for price breakdown, company/state motive, shipment exposure, penalty and negotiation details.</div>'+sellerTable+'</section>'+
  '<section class="omega-bm-section"><header><strong>02 · Countries interested in buying</strong><span>'+count(buyerSignals.length)+' potential buyer(s)</span></header><div class="omega-bm-section-note">Demand-runtime shortage or stock-cover signals, ordered by current pressure. This is market intelligence, not a confirmed covert order or acceptance.</div>'+buyerTable+'</section>'+
  '<section class="omega-bm-section"><header><strong>03 · Player-country requests & acceptances</strong><span>'+count(participationDeals.length)+' saved deal(s) · '+count(acceptedDeals)+' accepted</span></header><div class="omega-bm-section-note">Only the active country’s saved ledger is shown here. Foreign NPC participation is revealed separately only when the player discovers it.</div>'+localDealTable+'</section>'+
  sanctionPanel+
  '<div class="omega-bm-lower">'+
   '<section class="omega-bm-panel"><header><strong>04 · Country operations ledger</strong><span>'+count(active.length)+' active · '+count(cases.length)+' investigation file(s)</span></header><div class="omega-bm-panel-body">'+(dealHtml||'<div class="omega-bm-empty">No Black Market deal has been recorded for this country.</div>')+(caseHtml||'')+'</div></section>'+
   '<section class="omega-bm-panel"><header><strong>05 · Discovered intelligence, response & transit</strong><span>'+count(transits.filter(x=>x.status==='IN_TRANSIT').length)+' transit · '+count(responses.length)+' response(s)</span></header><div class="omega-bm-panel-body">'+(transitHtml||'')+(reportHtml||'')+(respHtml||'')+(!transitHtml&&!reportHtml&&!respHtml?'<div class="omega-bm-empty">No discovered NPC network report, foreign response or covert transit exists in this country’s intelligence file.</div>':'')+'</div></section>'+
  '</div>'+
  '<p class="omega-bm-risknote">Flags and full country names are presentation only. National motives depend on saved demand, export, sanctions, company and state-actor evidence. Discovered network reports stay scoped to the player’s intelligence file; unknown foreign transactions are not revealed by this screen.</p></div></section>';
 if(!root.__omegaBmBound){
  root.addEventListener('click',function(event){
   const t=event.target?.closest?.('button');if(!t||!root.contains(t))return;
   if(t.hasAttribute('data-bm-lane')){
    cancelScan(root);const next=t.getAttribute('data-bm-lane');
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
   if(t.hasAttribute('data-bm-show-more-buyers')){
    root.__omegaBmVisibleBuyers=Math.min(24,Math.max(8,Number(root.__omegaBmVisibleBuyers)||8)+8);
    render(root,root.__omegaBmCountry||c);return;
   }
   if(t.hasAttribute('data-bm-find')){
    const rid=String(root.querySelector('[data-bm-resource]')?.value||''),q=Number(root.querySelector('[data-bm-find-quantity]')?.value);
    root.__omegaBmResource=rid;root.__omegaBmFindQuantity=String(q);
    root.__omegaBmVisibleOffers=6;root.__omegaBmNegotiation=null;root.__omegaBmOffers=[];
    if(!rid||!Number.isFinite(q)||q<=0){
     cancelScan(root);root.__omegaBmOutcome='Choose a commodity and a quantity greater than zero.';
     render(root,root.__omegaBmCountry||c);return;
    }
    cancelScan(root);root.__omegaBmScanning=true;root.__omegaBmScanProgress='Preparing seller-country scan…';
    root.__omegaBmOutcome='Seller scan started. Country batches will be checked without holding the UI thread.';
    render(root,root.__omegaBmCountry||c);
    const scanToken=root.__omegaBmScanToken;
    if(typeof bm.beginOfferScan==='function'&&typeof bm.getOfferScanBatch==='function'&&typeof bm.finishOfferScan==='function'){
     let scan;
     try{scan=bm.beginOfferScan(root.__omegaBmCountry||c,rid,q);}catch(error){
      cancelScan(root);root.__omegaBmOutcome='Seller scan failed: '+String(error?.message||error);
      render(root,root.__omegaBmCountry||c);return;
     }
     if(scan?.status!=='READY'){
      cancelScan(root);root.__omegaBmOutcome=scan?.reason||scan?.status||'OFFER_SCAN_UNAVAILABLE';
      render(root,root.__omegaBmCountry||c);return;
     }
     root.__omegaBmScan=scan;
     const nextBatch=function(){
      if(scanToken!==root.__omegaBmScanToken||!root.__omegaBmScanning)return;
      let part;
      try{part=bm.getOfferScanBatch(scan,16);}catch(error){
       cancelScan(root);root.__omegaBmOutcome='Seller scan failed: '+String(error?.message||error);
       render(root,root.__omegaBmCountry||c);return;
      }
      if(part?.status!=='READY'){
       cancelScan(root);root.__omegaBmOutcome=part?.reason||part?.status||'OFFER_SCAN_FAILED';
       render(root,root.__omegaBmCountry||c);return;
      }
      root.__omegaBmScanProgress='Checked '+fmt(part.scanned)+' / '+fmt(part.total)+' seller countries · '+fmt(scan.offers.length)+' verified offer(s)';
      const progress=root.querySelector?.('[data-bm-scan-progress]');if(progress)progress.textContent=root.__omegaBmScanProgress;
      if(!part.done){scheduleScan(nextBatch);return;}
      let result;
      try{result=bm.finishOfferScan(scan);}catch(error){
       cancelScan(root);root.__omegaBmOutcome='Could not finish seller scan: '+String(error?.message||error);
       render(root,root.__omegaBmCountry||c);return;
      }
      root.__omegaBmOffers=Array.isArray(result?.offers)?result.offers:[];
      root.__omegaBmScanning=false;root.__omegaBmScan=null;
      root.__omegaBmScanProgress='Scan complete · '+fmt(part.total)+' seller countries checked';
      root.__omegaBmOutcome=root.__omegaBmOffers.length?
       'Network scan complete. '+root.__omegaBmOffers.length+' verified seller offer(s) found.':
       'Network scan complete. No seller passed the current stock, relationship, route and policy checks.';
      render(root,root.__omegaBmCountry||c);
     };
     scheduleScan(nextBatch);return;
    }
    let result;
    try{result=bm.getOffers(root.__omegaBmCountry||c,rid,q);}catch(error){
     cancelScan(root);root.__omegaBmOutcome='Seller scan failed: '+String(error?.message||error);
     render(root,root.__omegaBmCountry||c);return;
    }
    root.__omegaBmOffers=result.status==='READY'?(Array.isArray(result.offers)?result.offers:[]):[];
    root.__omegaBmScanning=false;
    root.__omegaBmOutcome=result.status==='READY'?
     (root.__omegaBmOffers.length?'Found '+root.__omegaBmOffers.length+' seller offer(s).':'No executable offer meets the current checks.'):(result.reason||result.status);
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
    root.__omegaBmResource=rid;root.__omegaBmVisibleOffers=6;root.__omegaBmOffers=[];root.__omegaBmNegotiation=null;root.__omegaBmOutcome+=(r.accepted?' Refresh seller quotes with a new network scan.':'');render(root,root.__omegaBmCountry||c);return;
   }
  });
  root.__omegaBmBound=true;
 }
 return{ok:true,countryId:c,offerCount:offers.length,dealCount:deals.length};
}
g.Omega=g.Omega||{};g.Omega.BlackMarketUI=Object.freeze({version:'1.8.0',render});g.OmegaBlackMarketUI=g.Omega.BlackMarketUI;
})(typeof window!=='undefined'?window:globalThis);
