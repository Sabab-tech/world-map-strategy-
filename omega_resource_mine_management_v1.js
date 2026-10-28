/* OMEGA RESOURCE MINISTRY · MINE MANAGEMENT UI v1.0.0
 * Additive UI layer. Uses the canonical site registry, mine construction projects,
 * endowment runtime, industrial pipeline and existing resource/finance state.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const SVG_MOUNTAIN='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 20 10 6l3.5 7L16 9l5 11H3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m7.8 10.4 2.2 2.1 2-1.1M14 17h.01" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const SVG_PICKAXE='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 20 10-12M12 3c2.6 1.7 5.1 2.1 8 1.2-1.1 2.9-3.1 4.1-6 3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="m3.5 20.5 2-2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const esc=v=>String(v===null||v===undefined?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const num=v=>Number.isFinite(Number(v))&&v!==null&&v!==undefined&&v!==''?Number(v):null;
const state=()=>g.Game?.state||g.gameState||{};
const network=()=>g.Omega?.ResourceIndustrialNetwork||g.OmegaResourceIndustrialNetwork||null;
const endowment=()=>g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime||null;
const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn)??0;
function iso3(value){
 const raw=String(value||'').trim();if(/^[A-Z]{3}$/i.test(raw))return raw.toUpperCase();
 try{const hit=(g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity)?.resolveCountry?.(raw);
 const from=hit?.raw?.iso3||hit?.raw?.iso3Code||hit?.raw?.countryCode||hit?.iso3||hit?.iso3Code||hit?.countryCode;
 if(from&&/^[A-Z]{3}$/i.test(String(from)))return String(from).toUpperCase();}catch(_){}
 try{const normalized=g.ResourceMinistryEngine?.normalizeCountryCode?.(raw);if(/^[A-Z]{3}$/i.test(String(normalized||'')))return String(normalized).toUpperCase();}catch(_){}
 return raw.toUpperCase();
}
function playerCountry(){
 const s=state();let value=null;
 try{value=g.Omega?.Simulation?.getPlayerCountryId?.();}catch(_){}
 value=value||s?.simulation?.session?.playerCountryId||s?.simulation?.playerCountryId||g.Omega?.Simulation?.playerCountryId||g.CountryIOS?.playerCountryId||g.Game?.playerCountryId||g.currentPlayerCountry||g.CountryIOS?.activeCountry||g.Game?.currentActiveCountry||g.currentActiveCountry;
 return iso3(value||'');
}
function selectedMinistryCountry(){
 const s=state();
 const value=g.OmegaMinistryViewCountry||g.Omega?.MinistryViewCountry||g.OmegaCabinetUI?.activeCountry||
   g.Omega?.CabinetUI?.activeCountry||s?.simulation?.viewCountryId||s?.selectedCountryId||
   g.Game?.currentActiveCountry||g.CountryIOS?.activeCountry||playerCountry();
 return iso3(value||playerCountry());
}
function siteIdOf(x){return String(x?.siteId||x?.siteReferenceKey||x?.id||'').trim();}
function countryOf(x){return iso3(x?.countryId||x?.countryCode||x?.identity?.countryIso3||x?.sourceSiteRecord?.countryCode||'');}
function resourceOf(x){return String(x?.real?.resourceId||x?.sourceSiteRecord?.resourceId||x?.sourceSiteRecord?.resourceTypeId||x?.identity?.resourceTypeId||x?.resourceId||x?.resourceTypeId||'').trim().toLowerCase();}
const REPORTED_METRIC_STATUSES=new Set(['OBSERVED','OBSERVED_ATTRIBUTABLE','MEASURED','REPORTED','VERIFIED_SOURCE']);
function isReportedMetric(metric){
 const status=String(metric?.status||'').trim().toUpperCase();
 const authority=String(metric?.authority||metric?.provenance?.authority||'').trim().toUpperCase();
 return REPORTED_METRIC_STATUSES.has(status)||/^(OBSERVED|MEASURED|REPORTED|VERIFIED_SOURCE)/.test(authority);
}
function mergeDefinedObject(base,preferred){
 const out={...(base&&typeof base==='object'&&!Array.isArray(base)?base:{})};
 if(!preferred||typeof preferred!=='object'||Array.isArray(preferred))return out;
 for(const [key,value] of Object.entries(preferred)){
  if(value===undefined||value===null||(typeof value==='string'&&!value.trim()))continue;
  if(Array.isArray(value)){if(value.length||!Array.isArray(out[key]))out[key]=value.slice();continue;}
  if(value&&typeof value==='object')out[key]=mergeDefinedObject(out[key],value);
  else out[key]=value;
 }
 return out;
}
function mergeMetric(base,preferred){
 const original=base&&typeof base==='object'?base:{},incoming=preferred&&typeof preferred==='object'?preferred:{};
 const out=mergeDefinedObject(original,incoming);
 // Runtime defaults may fill gaps, but they never replace measured/reported quantitative facts.
 if(isReportedMetric(original)){
  for(const key of ['quantity','value','amount','rate','annual','minimum','nominal','maximum','unit','units','annualUnit','year','period','basis','metric']){
   if(original[key]!==undefined&&original[key]!==null&&original[key]!=='')out[key]=original[key];
  }
  out.status=original.status;
  if(original.authority)out.authority=original.authority;
 }
 return out;
}
function mergeQuantitative(base,preferred){
 const out=mergeDefinedObject(base,preferred);
 for(const key of ['reserve','production','grade','recovery','throughput','purity','capacity']){
  if((base&&base[key]&&typeof base[key]==='object')||(preferred&&preferred[key]&&typeof preferred[key]==='object'))
   out[key]=mergeMetric(base?.[key],preferred?.[key]);
 }
 out.reportedMetrics=mergeDefinedObject(base?.reportedMetrics,preferred?.reportedMetrics);
 out.quantitativeProvenance=mergeDefinedObject(base?.quantitativeProvenance,preferred?.quantitativeProvenance);
 out.completeness=mergeDefinedObject(base?.completeness,preferred?.completeness);
 return out;
}
function mergeSiteRecords(base,preferred){
 const out=mergeDefinedObject(base,preferred);
 for(const key of ['identity','location','map','runtime','simulation','processing','logistics','real','sourceSiteRecord','transport','productionModel','operations']){
  if((base?.[key]&&typeof base[key]==='object')||(preferred?.[key]&&typeof preferred[key]==='object'))
   out[key]=mergeDefinedObject(base?.[key],preferred?.[key]);
 }
 out.quantitative=mergeQuantitative(base?.quantitative,preferred?.quantitative);
 if(base?.real?.quantitative||preferred?.real?.quantitative){
  out.real=mergeDefinedObject(base?.real,preferred?.real);
  out.real.quantitative=mergeQuantitative(base?.real?.quantitative,preferred?.real?.quantitative);
 }
 out.operation=mergeDefinedObject(base?.operation,preferred?.operation);
 const previousStatus=String(base?.operation?.realWorldStatus||base?.operation?.status||base?.sourceSiteRecord?.realWorldStatus||base?.sourceSiteRecord?.status||'');
 const incomingStatus=String(preferred?.operation?.realWorldStatus||preferred?.operation?.status||'');
 if(!out.operation.realWorldStatus&&previousStatus&&incomingStatus&&previousStatus!==incomingStatus)
  out.operation.realWorldStatus=previousStatus;
 const combinedSources=[...(Array.isArray(base?.sources)?base.sources:[]),...(Array.isArray(preferred?.sources)?preferred.sources:[])];
 out.sources=[...new Map(combinedSources.map(item=>[String(item?.url||item?.sourceId||JSON.stringify(item)),item])).values()];
 return out;
}
function sitesFor(country){
 const all=[];
 const catalog=g.OmegaResourceSiteCanonicalCatalogData||g.Omega?.ResourceSiteCanonicalCatalogData;
 if(Array.isArray(catalog?.sites))all.push(...catalog.sites);
 const binding=g.Omega?.IndividualResourceSiteBinding||g.OmegaIndividualResourceSiteBinding;
 if(Array.isArray(binding?.sites))all.push(...binding.sites);
 const ref=endowment()?.countryMineSiteReferences?.(country);
 if(Array.isArray(ref))all.push(...ref.map(x=>({...x,siteId:x.siteId||x.siteReferenceKey,countryId:x.countryId||country,identity:{...(x.identity||{}),countryIso3:x.identity?.countryIso3||x.countryId||country,resourceTypeId:x.resourceId||x.resourceTypeId||x.identity?.resourceTypeId}})));
 const unique=new Map();
 const absorb=row=>{
  const id=siteIdOf(row),cid=countryOf(row),rid=resourceOf(row);
  if(!id||!rid||!/^[A-Z]{3}$/.test(cid)||cid!==country||row?.runtime?.aliasOfSiteId||row?.map?.markerEligible===false)return;
  const normalized={...row,siteId:id,countryId:cid,identity:{...(row.identity||{}),countryIso3:row.identity?.countryIso3||cid,resourceTypeId:rid}};
  const previous=unique.get(id);
  // Runtime site rows arrive after raw catalogue rows; merge rather than discarding
  // normalized production, route and factory-binding data on the first duplicate siteId.
  unique.set(id,previous?mergeSiteRecords(previous,normalized):normalized);
 };
 for(const row of all)absorb(row);
 const rs=state()?.resource?.[country]||{};
 for(const row of Array.isArray(rs.mineSiteReferences)?rs.mineSiteReferences:[])
  absorb({...row,countryId:row.countryId||country,identity:{...(row.identity||{}),countryIso3:row.identity?.countryIso3||row.countryId||country,resourceTypeId:resourceOf(row)}});
 return [...unique.values()].sort((a,b)=>String(a.siteName||a.name||a.siteId).localeCompare(String(b.siteName||b.name||b.siteId)));
}
function formatNum(v,digits=0){const n=num(v);return n===null?'Not recorded':n.toLocaleString('en-US',{maximumFractionDigits:digits});}
function formatMoney(v){const n=num(v);if(n===null)return'Unavailable';return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);}
function label(v){
 const raw=String(v||'UNOBSERVED').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
 const upper=raw.toUpperCase();
 if(/DECOMMISSIONED|DESTROYED|STOPPED|INACTIVE|CLOSED/.test(upper))return'Stopped';
 if(/UNDER CONSTRUCTION|PENDING|PLANNED/.test(upper))return'In progress';
 if(/ACTIVE PRODUCING|OPERATIONAL|ACTIVE|COMMISSIONED/.test(upper)&&!/SIMULATED/.test(upper))return'Active';
 if(/BLOCKED|SHORTAGE|AWAITING/.test(upper))return'Needs attention';
 if(/SIMULATED|MODELED|MODELLED|SCENARIO|UNOBSERVED|UNQUANTIFIED|UNKNOWN|NOT RECORDED/.test(upper))return'Available';
 if(!raw)return'Not recorded';
 return raw.charAt(0).toUpperCase()+raw.slice(1).toLowerCase();
}

function playerState(country){return state()?.resource?.[country]||{};}
function playerProjects(country){const rs=playerState(country);return Array.isArray(rs.industrialNetwork?.projects)?rs.industrialNetwork.projects:[];}
function assetRows(country){const rs=playerState(country);return Array.isArray(rs.mineAssets)?rs.mineAssets:[];}
function sourceStatus(site){const op=site?.operation||{};return op.realWorldStatus||op.status||site?.sourceSiteRecord?.status||'UNOBSERVED';}
function playerCommissioned(site,country){return assetRows(country).some(a=>String(a.siteId)===siteIdOf(site)&&String(a.status||'').toUpperCase()==='OPERATIONAL');}
function projectFor(site,country){return playerProjects(country).filter(p=>p.projectType==='MINE_CONSTRUCTION'&&String(p.siteId)===siteIdOf(site)).slice(-1)[0]||null;}
function resourceLabel(site){return label(site?.identity?.resourceName||resourceOf(site));}
function reserveSummary(site){
 const reserve=site?.quantitative?.reserve||{},measured=num(reserve.quantity);
 const unit=unitLabel(reserve.unit||site?.simulation?.reserveUnit||site?.simulation?.reserve?.unit||site?.reserve?.unit||'');
 const sim=site?.simulation||{},legacy=sim.reserve||site?.reserve||{};
 let quantity=measured;
 if(quantity===null)quantity=num(sim.reserveQuantity);
 if(quantity===null)quantity=num(legacy.quantity);
 if(quantity===null)return'Reserve unavailable';
 return formatNum(quantity,2)+(unit?' '+unit:'');
}
function unitLabel(value){return String(value||'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase();}
function productionSummary(site){
 const q=site?.quantitative||{},p=q.production||{},capacity=q.capacity||{},sim=site?.simulation||{};
 const rate=num(p.rate)??num(sim.productionRate),annual=num(p.annual)??num(sim.annualProduction);
 const capMin=num(capacity.minimum)??num(sim.minimumDailyCapacity),capNominal=num(capacity.nominal)??num(sim.nominalDailyCapacity),capMax=num(capacity.maximum)??num(sim.maximumDailyCapacity);
 const parts=[];
 if(rate!==null)parts.push('Daily output '+formatNum(rate,2)+' '+unitLabel(p.unit||sim.productionRateUnit));
 if(annual!==null)parts.push('Annual output '+formatNum(annual,2)+' '+unitLabel(p.annualUnit||p.unit||sim.annualProductionUnit));
 if(capMin!==null||capNominal!==null||capMax!==null){
  const range=capMin!==null&&capMax!==null?formatNum(capMin,2)+'–'+formatNum(capMax,2):capMin!==null?formatNum(capMin,2):formatNum(capMax,2);
  parts.push('Daily capacity '+range+' '+unitLabel(capacity.unit||p.unit||sim.productionRateUnit));
 }
 return parts.length?parts.join(' · '):'Production data unavailable';
}

function quoteFor(site,country,workers,quantity){
 const api=network();if(!api?.quoteMineProject)return{status:'BLOCKED',reason:'MINE_CONSTRUCTION_API_UNAVAILABLE'};
 return api.quoteMineProject({countryId:country,siteId:siteIdOf(site),resourceId:resourceOf(site),assignedWorkers:workers,quantity:quantity==null?1:quantity});
}
function shellStyle(){
 if(g.document.getElementById('omega-mine-management-style-v1'))return;
 const style=g.document.createElement('style');style.id='omega-mine-management-style-v1';
 style.textContent=
 '#omega-mine-management-modal{position:fixed;inset:0;z-index:1000005;background:rgba(4,10,20,.88);display:none;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;color:#e7f0fb;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}'+
 '#omega-mine-management-modal *{box-sizing:border-box}#omega-mine-management-modal .omm-shell{width:min(1240px,100%);height:min(92vh,940px);overflow:auto;background:#0a1524;border:1px solid #2a405a;border-radius:16px;box-shadow:0 24px 80px #0009;padding:18px}'+
 '#omega-mine-management-modal .omm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid #26384d;padding-bottom:14px;margin-bottom:14px}'+
 '#omega-mine-management-modal h2,#omega-mine-management-modal h3,#omega-mine-management-modal h4{margin:0;color:#f1f6ff}#omega-mine-management-modal .omm-sub{color:#9db1c9;font-size:12px;margin-top:4px}'+
 '#omega-mine-management-modal .omm-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}#omega-mine-management-modal button,#omega-mine-management-modal input,#omega-mine-management-modal select{font:inherit}'+
 '#omega-mine-management-modal button{border:1px solid #36516d;background:#13253a;color:#e9f3ff;border-radius:8px;padding:8px 11px;cursor:pointer}#omega-mine-management-modal button:disabled{opacity:.45;cursor:not-allowed}'+
 '#omega-mine-management-modal .omm-primary{background:#126b64;border-color:#248f84}#omega-mine-management-modal .omm-danger{background:#362534;border-color:#6c4052}'+
 '#omega-mine-management-modal .omm-country{min-width:170px;background:#101f31;color:#edf5ff;border:1px solid #304a64;padding:8px;border-radius:8px}'+
 '#omega-mine-management-modal .omm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}#omega-mine-management-modal .omm-kpi,#omega-mine-management-modal .omm-card{background:#101f31;border:1px solid #253a51;border-radius:11px;padding:12px;min-width:0}'+
 '#omega-mine-management-modal .omm-kpi span{display:block;color:#9db1c9;font-size:12px}#omega-mine-management-modal .omm-kpi strong{display:block;font-size:21px;margin-top:4px;overflow-wrap:anywhere}'+
 '#omega-mine-management-modal .omm-site-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#omega-mine-management-modal .omm-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:9px}'+
 '#omega-mine-management-modal .omm-pill{display:inline-flex;align-items:center;border:1px solid #37526c;color:#bcd5ed;border-radius:999px;padding:2px 8px;font-size:11px}#omega-mine-management-modal .omm-muted{color:#9db1c9}'+
 '#omega-mine-management-modal .omm-lines{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:10px 0}#omega-mine-management-modal .omm-line{padding:7px;background:#091524;border-radius:7px;overflow-wrap:anywhere}'+
 '#omega-mine-management-modal .omm-stock-preview-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #26384d;padding:5px 0;font-size:12px}#omega-mine-management-modal .omm-stock-preview-row:last-child{border-bottom:0}'+
 '#omega-mine-management-modal .omm-materials{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin:8px 0}#omega-mine-management-modal .omm-material{display:flex;justify-content:space-between;gap:10px;background:#0b1827;border-radius:6px;padding:6px 8px;font-size:12px}'+
 '#omega-mine-management-modal .omm-short{color:#ffb9a8}#omega-mine-management-modal .omm-ok{color:#91e3c3}#omega-mine-management-modal .omm-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}'+
 '#omega-mine-management-modal .omm-input{max-width:140px;width:100%;border:1px solid #36516d;background:#071321;color:#eef6ff;padding:8px;border-radius:8px}'+
 '#omega-mine-management-modal .omm-progress{height:7px;background:#203249;overflow:hidden;border-radius:99px;margin:8px 0}#omega-mine-management-modal .omm-progress span{display:block;height:100%;background:#36b69b}'+
 '#omega-mine-management-modal .omm-alert{border-left:3px solid #dca45b;background:#201e19;padding:9px 11px;border-radius:5px;margin:10px 0;color:#f2dcb8}#omega-mine-management-modal .omm-status{color:#b8d4ee;margin:10px 0;white-space:pre-wrap}'+
 '#omega-mine-management-modal .omm-section{margin:15px 0}#omega-mine-management-modal .omm-empty{padding:20px;border:1px dashed #344d65;border-radius:10px;color:#9db1c9;text-align:center}'+
 '#omega-mine-management-modal .omm-table-wrap{overflow:auto}#omega-mine-management-modal table{width:100%;border-collapse:collapse;min-width:520px}#omega-mine-management-modal th,#omega-mine-management-modal td{padding:8px;border-bottom:1px solid #26384d;text-align:left;font-size:12px}'+
 '#omega-mine-management-modal svg{width:17px;height:17px;vertical-align:middle}'+
 '#omega-mine-management-modal .omm-mine-flip{perspective:1200px;min-width:0;height:470px} #omega-mine-management-modal .omm-flip-inner{display:grid;grid-template-columns:minmax(0,1fr);height:100%;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.2,.75,.2,1)} #omega-mine-management-modal .omm-mine-flip.is-flipped .omm-flip-inner{transform:rotateY(180deg)} #omega-mine-management-modal .omm-face{grid-area:1 / 1;min-width:0;height:100%;overflow:auto;backface-visibility:hidden;-webkit-backface-visibility:hidden} #omega-mine-management-modal .omm-face-front{transform:rotateY(0deg)} #omega-mine-management-modal .omm-face-back{transform:rotateY(180deg)} #omega-mine-management-modal .omm-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:9px} #omega-mine-management-modal .omm-panel-head h3{font-size:16px;line-height:1.25} #omega-mine-management-modal .omm-mine-art{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid #3b8a9a;border-radius:9px;color:#73d7df;background:#0d2735;margin-bottom:6px;box-shadow:inset 0 0 0 1px #163d50,0 0 12px #27a6c133} #omega-mine-management-modal .omm-mine-art svg{width:22px;height:22px} #omega-mine-management-modal .omm-count-field{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;padding:8px 9px;background:#091524;border:1px solid #263c51;border-radius:8px;font-size:12px} #omega-mine-management-modal .omm-count-field .omm-input{max-width:105px} #omega-mine-management-modal .omm-build-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:8px 0} #omega-mine-management-modal .omm-build-metric{min-width:0;padding:8px;background:#091524;border:1px solid #1e3449;border-radius:8px} #omega-mine-management-modal .omm-build-metric span,#omega-mine-management-modal .omm-build-metric small{display:block;color:#9db1c9;font-size:10px;line-height:1.35} #omega-mine-management-modal .omm-build-metric strong{display:block;margin:3px 0;font-size:14px;overflow-wrap:anywhere} #omega-mine-management-modal .omm-build-ready{font-size:12px;margin:7px 0} #omega-mine-management-modal .omm-build-preview .omm-materials,#omega-mine-management-modal .omm-destroy-preview .omm-materials{grid-template-columns:repeat(2,minmax(0,1fr))} #omega-mine-management-modal .omm-material{align-items:flex-start;font-size:11px;overflow-wrap:anywhere} #omega-mine-management-modal .omm-action-panel[hidden]{display:none!important} #omega-mine-management-modal .omm-confirm-overlay{position:fixed;inset:0;z-index:1000008;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,7,15,.86)} #omega-mine-management-modal .omm-confirm-dialog{width:min(460px,100%);padding:18px;background:#180d13;border:2px solid #ff334f;border-radius:12px;box-shadow:0 0 10px #ff1839,0 0 28px #ff183966, inset 0 0 14px #ff183922;animation:omm-danger-pulse 1.15s steps(2,end) infinite} #omega-mine-management-modal .omm-confirm-dialog h3{font-size:18px;color:#fff0f2;margin-bottom:8px} #omega-mine-management-modal .omm-confirm-dialog p{font-size:13px;color:#f0cbd1} #omega-mine-management-modal .omm-confirm-dialog .omm-actions{justify-content:flex-end} #omega-mine-management-modal .omm-danger-confirm{background:#8c1730!important;border-color:#ff5269!important;color:#fff!important} @keyframes omm-danger-pulse{0%,100%{border-color:#ff334f;box-shadow:0 0 7px #ff1839,0 0 18px #ff183955}50%{border-color:#791427;box-shadow:0 0 1px #ff1839,0 0 5px #ff183922}}'+
 '@media(max-width:760px){#omega-mine-management-modal{padding:4px}#omega-mine-management-modal .omm-shell{height:98vh;padding:11px;border-radius:10px}#omega-mine-management-modal .omm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#omega-mine-management-modal .omm-site-grid{grid-template-columns:1fr}#omega-mine-management-modal .omm-mine-flip{height:540px}#omega-mine-management-modal .omm-lines,#omega-mine-management-modal .omm-materials{grid-template-columns:1fr}#omega-mine-management-modal .omm-head{align-items:center}}';
 g.document.head.appendChild(style);
}
let currentView='my-mines',currentCountry='',lastOutcome='',isBound=false,observer=null,productionRunActive=false,currentTargetSiteId='',currentTargetAction='';
function allCountryIds(){
 const rows=new Set([playerCountry()]);
 Object.keys(state()?.resource||{}).forEach(x=>rows.add(iso3(x)));
 const catalog=g.OmegaResourceSiteCanonicalCatalogData||g.Omega?.ResourceSiteCanonicalCatalogData;
 for(const row of Array.isArray(catalog?.sites)?catalog.sites:[])rows.add(countryOf(row));
 const binding=g.Omega?.IndividualResourceSiteBinding||g.OmegaIndividualResourceSiteBinding;
 for(const row of Array.isArray(binding?.sites)?binding.sites:[])rows.add(countryOf(row));
 return [...rows].filter(x=>/^[A-Z]{3}$/.test(x)).sort();
}
function countryName(c){
 const binding=g.Omega?.IndividualResourceSiteBinding||g.OmegaIndividualResourceSiteBinding;
 const row=(binding?.sites||[]).find(x=>countryOf(x)===c);
 const catalog=g.OmegaResourceSiteCanonicalCatalogData||g.Omega?.ResourceSiteCanonicalCatalogData;
 const entry=(catalog?.sites||[]).find(x=>countryOf(x)===c);
 return entry?.identity?.countryName||entry?.location?.countryName||row?.identity?.countryName||row?.location?.countryName||c;
}
function countrySelect(){return '<select class="omm-country" data-omm-country aria-label="Country view">'+allCountryIds().map(c=>'<option value="'+esc(c)+'"'+(c===currentCountry?' selected':'')+'>'+esc(countryName(c))+' ('+esc(c)+')</option>').join('')+'</select>';}
function topCards(country){
 const rs=playerState(country),projects=playerProjects(country),assets=assetRows(country),flows=Array.isArray(rs.industrialNetwork?.siteFlowLedger)?rs.industrialNetwork.siteFlowLedger:[];
 const networkState=rs.industrialNetwork||{},receipts=flows.reduce((n,f)=>n+(Array.isArray(f.treasurySettlements)?f.treasurySettlements.filter(x=>/SETTLED|POSTED/.test(String(x.status||''))).length:0),0);
 const blocked=flows.filter(f=>/BLOCKED|AWAITING_ROUTE|AWAITING_CAPACITY|AWAITING_INPUTS|EXTRACTED_AWAITING_FACTORY|FACTORY_INPUT_SHORTAGE/.test(String(f.status||''))).length;
 const raw=rs.warehouse?.availableByResource||{},processed=rs.processedWarehouse?.availableByResource||{};
 function unitFor(id){
  const catalog=g.OmegaResourceIndustrialCatalogData||g.Omega?.ResourceIndustrialCatalogData||{};
  const rule=catalog.resourceRules&&catalog.resourceRules[id];
  return unitLabel(rule&&(rule.unit||rule.baseUnit||rule.outputUnit)||'');
 }
 function stockPreview(source){
  return Object.entries(source).filter(([,value])=>num(value)!==null&&num(value)>0).slice(0,4).map(([id,value])=>
   '<div class="omm-stock-preview-row"><span>'+esc(label(id))+'</span><strong>'+formatNum(value,2)+(unitFor(id)?' '+esc(unitFor(id)):'')+'</strong></div>').join('')||
   '<div class="omm-muted">No recorded stock</div>';
 }
 return '<div class="omm-grid">'+
  kpi('Operating mines',assets.filter(a=>/OPERATIONAL|ACTIVE|COMMISSIONED|PRODUCING/.test(String(a.status||'').toUpperCase())&&!/DECOMMISSIONED|DESTROYED|STOPPED|INACTIVE/.test(String(a.status||'').toUpperCase())).length)+
  kpi('Projects in progress',projects.filter(p=>p.projectType==='MINE_CONSTRUCTION'&&p.status==='UNDER_CONSTRUCTION').length)+
  kpi('Raw stock types',Object.keys(raw).length)+
  kpi('Processed stock types',Object.keys(processed).length)+
  '</div><div class="omm-lines"><div class="omm-line"><h4>Raw warehouse</h4>'+stockPreview(raw)+'</div>'+
  '<div class="omm-line"><h4>Processed inventory</h4>'+stockPreview(processed)+'</div></div>'+
  '<div class="omm-lines"><div class="omm-line"><span class="omm-muted">Production flows</span><br><strong>'+flows.length+'</strong></div>'+
  '<div class="omm-line"><span class="omm-muted">Recorded income events</span><br><strong>'+receipts+'</strong></div>'+
  '<div class="omm-line"><span class="omm-muted">Blocked supply</span><br><strong class="'+(blocked?'omm-short':'omm-ok')+'">'+blocked+'</strong></div>'+
  '<div class="omm-line"><span class="omm-muted">Shipments</span><br><strong>'+(Array.isArray(networkState.shipments)?networkState.shipments.length:0)+'</strong></div></div>';
}
function kpi(name,value){return '<div class="omm-kpi"><span>'+esc(name)+'</span><strong>'+esc(value)+'</strong></div>';}
function materialMarkup(quote){
 if(!Array.isArray(quote.materials)||!quote.materials.length)return '<div class="omm-muted">Construction materials unavailable.</div>';
 return '<div class="omm-materials">'+quote.materials.map(m=>'<div class="omm-material"><span>'+esc(label(m.resourceId))+'<br><small class="omm-muted">Available '+formatNum(m.available,2)+'</small></span><strong class="'+(m.sufficient?'omm-ok':'omm-short')+'">'+formatNum(m.required,2)+(m.unit?' '+esc(unitLabel(m.unit)):'')+(m.shortfall>0?' · short '+formatNum(m.shortfall,2):'')+'</strong></div>').join('')+'</div>';
}
function previewQuote(site,country,count){return quoteFor(site,country,1000000000,count);}
function buildPreviewMarkup(site,country,count){
 const quote=previewQuote(site,country,count);
 if(quote.status!=='QUOTED')return '<div class="omm-alert">Build quote unavailable: '+esc(label(quote.reason||quote.status))+'</div><button data-omm-action="flip-back">Back to mine</button>';
 const allowed=country===playerCountry()&&quote.ready;
 return '<div class="omm-build-summary"><div class="omm-build-metric"><span>Construction cost · total</span><strong>'+formatMoney(quote.costUsd)+'</strong><small>'+formatMoney(quote.unitCostUsd)+' / mine</small></div>'+
  '<div class="omm-build-metric"><span>Build time</span><strong>'+formatNum(quote.durationDays)+' days</strong><small>'+formatNum(quote.estimatedTurns)+' simulation turn(s)</small></div>'+
  '<div class="omm-build-metric"><span>Workers required</span><strong>'+formatNum(quote.workersRequired)+'</strong><small>'+formatNum(quote.workersRequiredPerAsset)+' / mine</small></div>'+
  '<div class="omm-build-metric"><span>Treasury check</span><strong class="'+(quote.treasury.sufficient?'omm-ok':'omm-short')+'">'+(quote.treasury.sufficient?'Funds available':'Insufficient funds')+'</strong><small>'+formatMoney(quote.treasury.available)+' / '+formatMoney(quote.treasury.required)+'</small></div></div>'+
  '<div class="omm-sub">Required materials for '+formatNum(quote.assetCount)+' mine unit(s). Quantities update from the selected count and live inventory/warehouse checks.</div>'+
  materialMarkup(quote)+
  (!quote.commissioningReady?'<div class="omm-alert">A construction project for this site is already in progress.</div>':'')+
  '<div class="omm-build-ready '+(quote.ready?'omm-ok':'omm-short')+'" role="status">'+(quote.ready?'All treasury, material and workforce checks passed.':'Build is blocked until every required material, treasury and workforce check passes.')+'</div>'+
  '<button class="omm-primary" data-omm-action="start-mine-build" data-site-id="'+esc(quote.siteId)+'" data-resource-id="'+esc(quote.resourceId)+'" data-count="'+formatNum(quote.assetCount)+'" '+(!allowed?'disabled':'')+'>Build '+formatNum(quote.assetCount)+' mine unit(s)</button>';
}
function demolitionPreviewMarkup(site,country,count){
 const api=network(),quote=api?.quoteMineDemolition?.({countryId:country,siteId:siteIdOf(site),quantity:count});
 if(!quote||quote.status!=='QUOTED')return '<div class="omm-alert">Demolition estimate unavailable: '+esc(label(quote?.reason||quote?.status||'RUNTIME_UNAVAILABLE'))+'</div>';
 const rows=Array.isArray(quote.wasteOutputs)?quote.wasteOutputs:[];
 return '<div class="omm-build-summary"><div class="omm-build-metric"><span>Workers affected</span><strong>'+formatNum(quote.jobsLost)+'</strong><small>Jobs removed with selected units</small></div>'+
  '<div class="omm-build-metric"><span>Output capacity lost</span><strong>'+(quote.productionLostPerDay===null?'Not recorded':formatNum(quote.productionLostPerDay,2))+'</strong><small>Estimated units per day</small></div>'+
  '<div class="omm-build-metric"><span>Mine units</span><strong>'+formatNum(quote.quantity)+'</strong><small>Selected for demolition</small></div></div>'+
  '<div class="omm-sub">Estimated recoverable demolition material</div>'+
  (rows.length?'<div class="omm-materials">'+rows.map(row=>'<div class="omm-material"><span>'+esc(label(row.resourceId))+'</span><strong>'+formatNum(row.quantity,2)+' '+esc(unitLabel(row.unit))+'</strong></div>').join('')+'</div>':'<div class="omm-alert">Material recovery cannot be calculated because this mine has no recorded construction-material lineage. The missing history will not be fabricated.</div>')+
  '<div class="omm-alert">Demolition permanently stops these mine assets. Warehouse stock and historical records remain. Production cannot resume after destruction.</div>'+
  '<button class="omm-danger" data-omm-action="request-mine-destruction" data-site-id="'+esc(siteIdOf(site))+'" data-count="'+formatNum(count)+'" '+(country!==playerCountry()?'disabled':'')+'>Review demolition and confirm</button>';
}
function operatingPreviewMarkup(site,country,count){
 const rows=assetRows(country).filter(a=>String(a.siteId)===siteIdOf(site));
 const active=rows.filter(a=>String(a.status||'').toUpperCase()==='OPERATIONAL').length;
 const stopped=rows.filter(a=>String(a.status||'').toUpperCase()==='STOPPED').length;
 return '<div class="omm-build-summary"><div class="omm-build-metric"><span>Operating</span><strong>'+formatNum(active)+'</strong><small>Units currently producing</small></div>'+
  '<div class="omm-build-metric"><span>Paused</span><strong>'+formatNum(stopped)+'</strong><small>Units available to resume</small></div>'+
  '<div class="omm-build-metric"><span>Simulation status</span><strong>Player controlled</strong><small>State changes are logged</small></div></div>'+
  '<label class="omm-count-field">Mine units <input class="omm-input" data-omm-operation-count type="number" min="1" max="'+Math.max(1,Math.max(active,stopped))+'" step="1" value="'+Math.max(1,Math.min(Number(count)||1,Math.max(1,Math.max(active,stopped))))+'"></label>'+
  '<div class="omm-actions">'+
   '<button class="omm-primary" data-omm-action="stop-mine-units" data-site-id="'+esc(siteIdOf(site))+'" '+(country!==playerCountry()||active<1?'disabled':'')+'>Pause selected units</button>'+
   '<button data-omm-action="resume-mine-units" data-site-id="'+esc(siteIdOf(site))+'" '+(country!==playerCountry()||stopped<1?'disabled':'')+'>Resume selected units</button></div>'+
  '<div class="omm-sub">Paused mines keep their assets and stock. Their extraction pipeline remains disabled until they are resumed.</div>';
}

function cardSiteById(siteId,country){return sitesFor(country).find(site=>siteIdOf(site)===String(siteId||''))||null;}
function updateBuildPreview(input){
 const card=input.closest('[data-omm-site-card]'),siteId=input.getAttribute('data-site-id'),panel=card?.querySelector('.omm-build-preview');
 if(!card||!panel)return;
 const count=num(input.value),site=cardSiteById(siteId,currentCountry||playerCountry());
 if(!site)return;
 panel.innerHTML=count===null||!Number.isInteger(count)||count<1||count>100?'<div class="omm-alert">Choose an integer from 1 to 100.</div>':buildPreviewMarkup(site,currentCountry||playerCountry(),count);
}
function updateDestroyPreview(input){
 const card=input.closest('[data-omm-site-card]'),siteId=input.getAttribute('data-site-id'),panel=card?.querySelector('.omm-destroy-preview');
 if(!card||!panel)return;
 const count=num(input.value),site=cardSiteById(siteId,currentCountry||playerCountry());
 if(!site)return;
 panel.innerHTML=count===null||!Number.isInteger(count)||count<1?'<div class="omm-alert">Choose at least one mine unit.</div>':demolitionPreviewMarkup(site,currentCountry||playerCountry(),count);
}
function updateOperatingButtons(input){
 const card=input.closest('[data-omm-site-card]'),siteId=card?.getAttribute('data-omm-site-card'),count=num(input.value);
 if(!card)return;
 const units=assetRows(currentCountry||playerCountry()).filter(a=>String(a.siteId)===String(siteId));
 const active=units.filter(a=>String(a.status||'').toUpperCase()==='OPERATIONAL').length,stopped=units.filter(a=>String(a.status||'').toUpperCase()==='STOPPED').length;
 const valid=count!==null&&Number.isInteger(count)&&count>0;
 const stop=card.querySelector('[data-omm-action="stop-mine-units"]'),resume=card.querySelector('[data-omm-action="resume-mine-units"]');
 if(stop)stop.disabled=currentCountry!==playerCountry()||!valid||count>active;
 if(resume)resume.disabled=currentCountry!==playerCountry()||!valid||count>stopped;
 if(stop)stop.textContent='Pause '+(valid?formatNum(count):'selected')+' unit(s)';
 if(resume)resume.textContent='Resume '+(valid?formatNum(count):'selected')+' unit(s)';
}
function flipCard(siteId,panelName){
 const modal=g.document.getElementById('omega-mine-management-modal');
 const card=Array.from(modal?.querySelectorAll('[data-omm-site-card]')||[]).find(el=>el.getAttribute('data-omm-site-card')===String(siteId));
 if(!card)return;
 const isAssetCard=!!card.querySelector('[data-omm-mine-asset-id]');
 if(isAssetCard)return;
 card.classList.add('is-flipped');
 card.querySelectorAll('[data-omm-panel]').forEach(panel=>{panel.hidden=panel.getAttribute('data-omm-panel')!==panelName;});
}
function openDestructionConfirmation(siteId,count,mineId){
 const modal=g.document.getElementById('omega-mine-management-modal'),api=network();
 if(!modal||!api?.quoteMineDemolition){lastOutcome='Demolition estimate runtime unavailable; no mine was changed.';render();return;}
 const quote=api.quoteMineDemolition({countryId:currentCountry||playerCountry(),siteId,quantity:count,mineId:mineId||undefined});
 if(quote?.status!=='QUOTED'){lastOutcome='Demolition blocked: '+label(quote?.reason||quote?.status||'UNAVAILABLE');render();return;}
 const previous=modal.querySelector('.omm-confirm-overlay');if(previous)previous.remove();
 const waste=Array.isArray(quote.wasteOutputs)&&quote.wasteOutputs.length?quote.wasteOutputs.map(x=>label(x.resourceId)+' '+formatNum(x.quantity,2)).join(', '):'No verified construction-material lineage for a waste estimate.';
 const overlay=g.document.createElement('div');overlay.className='omm-confirm-overlay';overlay.setAttribute('role','alertdialog');overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-label','Confirm permanent mine demolition');overlay.setAttribute('data-site-id',siteId);overlay.setAttribute('data-count',String(count));if(mineId)overlay.setAttribute('data-mine-id',mineId);
 overlay.innerHTML='<div class="omm-confirm-dialog"><h3>Are you sure you want to destroy '+formatNum(quote.quantity)+' mine unit(s)?</h3>'+
  '<p>This is permanent. Production will stop, the selected units will leave the active mine roster, and their history will be retained.</p>'+
  '<div class="omm-lines"><div class="omm-line"><span class="omm-muted">Workers affected</span><br><strong>'+formatNum(quote.jobsLost)+'</strong></div>'+
  '<div class="omm-line"><span class="omm-muted">Daily capacity loss</span><br><strong>'+(quote.productionLostPerDay===null?'Not recorded':formatNum(quote.productionLostPerDay,2))+'</strong></div></div>'+
  '<p><strong>Estimated recoverable material:</strong> '+esc(waste)+'</p><div class="omm-actions">'+
  '<button data-omm-action="cancel-mine-destruction">Cancel</button><button class="omm-danger-confirm" data-omm-action="confirm-mine-destruction">Yes, destroy selected mines</button></div></div>';
 modal.appendChild(overlay);
 const confirm=overlay.querySelector('[data-omm-action="confirm-mine-destruction"]');if(confirm)confirm.focus();
}

function siteCard(site,country,view){
 const id=siteIdOf(site),rid=resourceOf(site),name=site.siteName||site.name||id;
 const assets=assetRows(country).filter(a=>String(a.siteId)===id&&!/DECOMMISSIONED|DESTROYED|INACTIVE/.test(String(a.status||'').toUpperCase()));
 const active=assets.filter(a=>String(a.status||'').toUpperCase()==='OPERATIONAL'),stopped=assets.filter(a=>String(a.status||'').toUpperCase()==='STOPPED');
 const project=projectFor(site,country),status=active.length?'ACTIVE':stopped.length?'STOPPED':project?.status||sourceStatus(site);
 const loc=site.location?.adminRegion||site.location?.locality||site.location?.countryName||'';
 const rs=playerState(country),rawStock=num(rs.warehouse?.availableByResource?.[rid]),finishedStock=num(rs.processedWarehouse?.availableByResource?.[rid]);
 const canBuild=country===playerCountry()&&project?.status!=='UNDER_CONSTRUCTION';
 const buildQuote=previewQuote(site,country,1),destroyCount=active.length+stopped.length;
 const buildPanel=buildPreviewMarkup(site,country,1),destroyPanel=demolitionPreviewMarkup(site,country,Math.max(1,destroyCount)),operatingPanel=operatingPreviewMarkup(site,country,1);
 let html='<article class="omm-mine-flip" data-omm-site-card="'+esc(id)+'"><div class="omm-flip-inner">'+
  '<section class="omm-card omm-face omm-face-front"><div class="omm-card-head"><div><div class="omm-mine-art">'+SVG_MOUNTAIN+'</div><h3>'+esc(name)+'</h3><div class="omm-sub">'+esc(resourceLabel(site))+(loc?' · '+esc(loc):'')+'</div></div><span class="omm-pill">'+esc(label(status))+'</span></div>'+
  '<div class="omm-lines"><div class="omm-line"><span class="omm-muted">Operating units</span><br><strong>'+formatNum(active.length)+'</strong></div>'+
  '<div class="omm-line"><span class="omm-muted">Paused units</span><br><strong>'+formatNum(stopped.length)+'</strong></div>'+
  '<div class="omm-line"><span class="omm-muted">Reserve</span><br>'+esc(reserveSummary(site))+'</div>'+
  '<div class="omm-line"><span class="omm-muted">Daily production profile</span><br>'+esc(productionSummary(site))+'</div>'+
  '<div class="omm-line"><span class="omm-muted">Raw stock</span><br>'+esc(rawStock===null?'—':formatNum(rawStock,2))+'</div>'+
  '<div class="omm-line"><span class="omm-muted">Processed stock</span><br>'+esc(finishedStock===null?'—':formatNum(finishedStock,2))+'</div></div>'+
  (project?.status==='UNDER_CONSTRUCTION'?'<div class="omm-progress"><span style="width:'+Math.max(0,Math.min(100,Number(project.progressPct||0)*100))+'%"></span></div><div class="omm-sub">Construction in progress · '+formatNum(project.progressDays)+' / '+formatNum(project.durationDays)+' days</div>':'')+
  '<div class="omm-actions"><button class="omm-primary" data-omm-action="build-mine" data-site-id="'+esc(id)+'" '+(!canBuild?'disabled':'')+'>Build</button>'+
  '<button data-omm-action="run-mine" data-site-id="'+esc(id)+'" data-resource-id="'+esc(rid)+'" '+(country!==playerCountry()||active.length===0?'disabled':'')+'>Extract</button>'+
  '<button data-omm-action="operate-mine" data-site-id="'+esc(id)+'" '+(country!==playerCountry()||(!active.length&&!stopped.length)?'disabled':'')+'>Pause / Resume</button>'+
  '<button class="omm-danger" data-omm-action="destroy-mine-preview" data-site-id="'+esc(id)+'" '+(country!==playerCountry()||destroyCount===0?'disabled':'')+'>Demolish</button>'+
  '<button data-omm-action="focus-site" data-site-id="'+esc(id)+'">'+SVG_MOUNTAIN+' View</button></div></section>'+
  '<section class="omm-card omm-face omm-face-back" data-omm-site-back="'+esc(id)+'">'+
   '<div class="omm-action-panel" data-omm-panel="build"><div class="omm-panel-head"><div><h3>'+esc(name)+'</h3><div class="omm-sub">Mine construction plan</div></div><button data-omm-action="flip-back">Back</button></div>'+
   '<label class="omm-count-field">New mine units <input class="omm-input" data-omm-build-count data-site-id="'+esc(id)+'" type="number" min="1" max="100" step="1" value="1" aria-label="How many '+esc(name)+' mine units to build"></label>'+
   '<div class="omm-build-preview">'+buildPanel+'</div></div>'+
   '<div class="omm-action-panel" data-omm-panel="destroy" hidden><div class="omm-panel-head"><div><h3>'+esc(name)+'</h3><div class="omm-sub">Demolition impact</div></div><button data-omm-action="flip-back">Back</button></div>'+
   '<label class="omm-count-field">Mine units to destroy <input class="omm-input" data-omm-destroy-count data-site-id="'+esc(id)+'" type="number" min="1" max="'+Math.max(1,destroyCount)+'" step="1" value="'+Math.max(1,destroyCount)+'" '+(destroyCount===0?'disabled':'')+'></label>'+
   '<div class="omm-destroy-preview">'+demolitionPreviewMarkup(site,country,Math.max(1,destroyCount))+'</div></div>'+
   '<div class="omm-action-panel" data-omm-panel="operate" hidden><div class="omm-panel-head"><div><h3>'+esc(name)+'</h3><div class="omm-sub">Operational control</div></div><button data-omm-action="flip-back">Back</button></div>'+
   operatingPanel+'</div></section></div></article>';
 return html;
}

function stationRows(country){
 const rs=playerState(country),econ=state()?.economy?.[country]||{};
 const candidates=[
  ...(Array.isArray(econ.productionAssets)?econ.productionAssets:[]),
  ...(Array.isArray(rs.productionAssets)?rs.productionAssets:[]),
  ...(Array.isArray(rs.industrialNetwork?.productionAssets)?rs.industrialNetwork.productionAssets:[]),
  ...(Array.isArray(rs.industrialNetwork?.factoryAssets)?rs.industrialNetwork.factoryAssets:[])
 ];
 const byId=new Map();
 for(const asset of candidates){
  const id=String(asset?.id||asset?.assetId||asset?.factoryId||asset?.projectId||'').trim();
  if(!id)continue;
  const inputs=asset.inputCoefficients||asset.recipe?.inputs||asset.inputProfile||{};
  const outputs=asset.outputProfile||asset.recipe?.outputs||asset.outputCoefficients||{};
  const factoryType=String(asset.factoryType||asset.facilityType||asset.stage||'').toUpperCase();
  const stage=String(asset.stage||'').toUpperCase();
  if(!Object.keys(inputs).length&&!/PROCESS|MILL|REFIN|SMELT|CONCENTR|SORT/.test(factoryType+' '+stage))continue;
  if(!byId.has(id))byId.set(id,{...asset,id,inputCoefficients:inputs,outputProfile:outputs});
 }
 return [...byId.values()];
}
function stationDirectory(country){
 const assets=stationRows(country),canBuild=country===playerCountry();
 let out='<div class="omm-section"><h3>Mine & processing stations</h3><p class="omm-sub">Available processing facilities, input needs and output capacity.</p></div>';
 if(!assets.length)return out+'<div class="omm-empty">No processing station is commissioned in this country. Commission a compatible factory through the existing Industrial Network before processing ore.</div>';
 return out+'<div class="omm-site-grid">'+assets.map(asset=>{
  const id=String(asset.id),name=asset.name||asset.factoryName||asset.factoryType||id,inputs=asset.inputCoefficients||{},outputs=asset.outputProfile||{},resource=Object.keys(inputs)[0]||'';
  const status=String(asset.status||'UNOBSERVED').toUpperCase(),capacity=num(asset.capacity);
  const disabled=!canBuild||status!=='OPERATIONAL'||!resource;
  return '<article class="omm-card"><div class="omm-card-head"><div><h3>'+esc(name)+'</h3><div class="omm-sub">'+esc(label(asset.factoryType||asset.facilityType||asset.stage))+' · '+esc(id)+'</div></div><span class="omm-pill">'+esc(label(status))+'</span></div>'+
   '<div class="omm-lines"><div class="omm-line"><span class="omm-muted">Input capacity / cycle</span><br><strong>'+formatNum(capacity,2)+' '+esc(asset.capacityUnit||'units')+'</strong></div><div class="omm-line"><span class="omm-muted">Cycle duration</span><br><strong>'+formatNum(asset.cycleDays)+' days</strong></div>'+
   '<div class="omm-line"><span class="omm-muted">Inputs</span><br>'+Object.entries(inputs).map(([k,v])=>esc(label(k))+': '+formatNum(v,3)).join('<br>')+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Outputs</span><br>'+Object.entries(outputs).map(([k,v])=>esc(label(k))+': '+formatNum(v,3)).join('<br>')+'</div></div>'+
   (resource?'<div class="omm-actions"><label for="omm-factory-qty-'+esc(id)+'">Input quantity</label><input class="omm-input" id="omm-factory-qty-'+esc(id)+'" data-omm-factory-quantity="'+esc(id)+'" type="number" min="1" step="1" value="'+Math.max(1,Math.min(1000,capacity||1000))+'" aria-label="Processing input quantity for '+esc(name)+'">'+
   '<button data-omm-action="run-factory" data-factory-id="'+esc(id)+'" data-resource-id="'+esc(resource)+'" '+(disabled?'disabled':'')+'>Run processing cycle</button></div>':'')+
   '<div class="omm-sub">The existing factory runtime enforces input stock, once-per-turn capacity, route/logistics gates and material-batch lineage.</div></article>';
 }).join('')+'</div>';
}
function mineDirectory(country){
 const rows=sitesFor(country);
 if(!rows.length)return '<div class="omm-empty">Mine sites are not available for this country right now.</div>';
 const built=new Set(assetRows(country).filter(a=>String(a.status).toUpperCase()==='OPERATIONAL').map(a=>String(a.siteId)));
 return '<div class="omm-section"><h3>National mine-site portfolio</h3><p class="omm-sub">Explore this country’s mines, fields and extraction sites.</p></div>'+
 '<div class="omm-site-grid">'+rows.map(site=>siteCard(site,country,'mines')).join('')+'</div>'+stationDirectory(country);
}
function myMines(country){
 const rs=playerState(country),assets=assetRows(country),projects=playerProjects(country).filter(p=>p.projectType==='MINE_CONSTRUCTION');
 const canonical=sitesFor(country),allFlows=Array.isArray(rs.industrialNetwork?.siteFlowLedger)?rs.industrialNetwork.siteFlowLedger:[];
 const visibleAssets=assets.filter(a=>!['DECOMMISSIONED','DESTROYED','INACTIVE'].includes(String(a.status||'').toUpperCase())).slice().reverse();
 let out=topCards(country);
 out+='<div class="omm-section"><h3>My mine assets</h3><p class="omm-sub">Each commissioned mine unit has its own controls and live status.</p>';
 if(!visibleAssets.length)out+='<div class="omm-empty">No active or paused mine assets are commissioned. Open Mines to review site-specific construction requirements.</div>';
 else out+='<div class="omm-site-grid">'+visibleAssets.map(a=>{
  const site=canonical.find(x=>siteIdOf(x)===String(a.siteId))||{siteId:a.siteId,siteName:a.siteName,identity:{resourceTypeId:a.resourceId}};
  const status=String(a.status||'').toUpperCase(),active=status==='OPERATIONAL',paused=status==='STOPPED';
  const mineId=String(a.mineId||a.id||''),siteId=String(a.siteId||'');
  const rows=allFlows.filter(f=>String(f.siteId||'')===siteId&&Number(f.extractionTurn??f.turn??f.lastUpdatedTurn)===turn());
  const output=rows.reduce((sum,f)=>sum+Math.max(0,num(f.quantity)||0),0);
  const rid=String(a.resourceId||resourceOf(site)),raw=num(rs.warehouse?.availableByResource?.[rid]),processed=num(rs.processedWarehouse?.availableByResource?.[rid]);
  return '<article class="omm-card omm-mine-card" data-omm-site-card="'+esc(siteId)+'" data-omm-mine-asset-id="'+esc(mineId)+'"><div class="omm-card-head"><div><div class="omm-mine-art">'+SVG_MOUNTAIN+'</div><h3>'+esc(a.siteName||site.siteName||resourceLabel(site))+'</h3><div class="omm-sub">'+esc(label(rid))+' · '+esc(mineId)+'</div></div><span class="omm-pill">'+esc(label(status))+'</span></div>'+
   '<div class="omm-lines"><div class="omm-line"><span class="omm-muted">Current-turn output</span><br>'+formatNum(output,2)+(output?' '+esc(unitLabel(rows[0]?.unit||'')):'')+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Commissioned</span><br>'+esc(a.commissionedTurn??'—')+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Raw stock</span><br>'+esc(raw===null?'—':formatNum(raw,2))+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Processed stock</span><br>'+esc(processed===null?'—':formatNum(processed,2))+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Workforce</span><br>'+formatNum(a.workersCommitted)+' / '+formatNum(a.workersRequired)+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Construction cost</span><br>'+formatMoney(a.constructionCostUsd)+'</div></div>'+
   '<div class="omm-actions"><button data-omm-action="focus-site" data-site-id="'+esc(siteId)+'">'+SVG_MOUNTAIN+' View site</button>'+
   (active?'<button data-omm-action="run-mine" data-site-id="'+esc(siteId)+'" data-resource-id="'+esc(rid)+'">Extract</button><button data-omm-action="pause-single-mine" data-site-id="'+esc(siteId)+'" data-mine-id="'+esc(mineId)+'">Pause</button>':'')+
   (paused?'<button class="omm-primary" data-omm-action="resume-single-mine" data-site-id="'+esc(siteId)+'" data-mine-id="'+esc(mineId)+'">Resume</button>':'')+
   ((active||paused)?'<button class="omm-danger" data-omm-action="request-single-mine-destruction" data-site-id="'+esc(siteId)+'" data-mine-id="'+esc(mineId)+'">Demolish</button>':'')+
   '</div></article>';
 }).join('')+'</div>';
 out+='<div class="omm-section"><h3>Mine construction</h3>';
 if(!projects.length)out+='<div class="omm-empty">No mine construction projects are in progress.</div>';
 else out+='<div class="omm-site-grid">'+projects.slice().reverse().map(p=>{
   const pct=Math.max(0,Math.min(100,Number(p.progressPct||0)*100));
   return '<article class="omm-card"><div class="omm-card-head"><div><h3>'+esc(p.siteName||p.siteId)+'</h3><div class="omm-sub">'+esc(label(p.resourceId||''))+' · '+formatNum(p.assetCount||1)+' mine unit(s)</div></div><span class="omm-pill">'+esc(label(p.status))+'</span></div>'+
   '<div class="omm-progress"><span style="width:'+pct+'%"></span></div><div class="omm-lines"><div class="omm-line"><span class="omm-muted">Progress</span><br>'+pct.toFixed(1)+'%</div>'+
   '<div class="omm-line"><span class="omm-muted">Build time</span><br>'+formatNum(p.progressDays)+' / '+formatNum(p.durationDays)+' days</div>'+
   '<div class="omm-line"><span class="omm-muted">Cost</span><br>'+formatMoney(p.costUsd)+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Materials</span><br>'+esc(label(p.constructionMaterialsStatus))+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Committed workforce</span><br>'+formatNum(p.workersCommitted)+' / '+formatNum(p.workersRequired)+'</div></div>'+
   '<div class="omm-sub">Expected completion: '+esc(p.expectedCompletionDate||p.completionDate||'—')+'</div></article>';
 }).join('')+'</div>';
 out+='</div><div class="omm-section"><h3>Production flow</h3>';
 if(!allFlows.length)out+='<div class="omm-empty">No production flow has been recorded yet.</div>';
 else out+='<div class="omm-table-wrap"><table><thead><tr><th>Site</th><th>Resource</th><th>Status</th><th>Destination</th><th>Quantity</th></tr></thead><tbody>'+allFlows.slice(-16).reverse().map(f=>{
  const site=canonical.find(x=>siteIdOf(x)===String(f.siteId||''));
  return '<tr><td>'+esc(f.siteName||site?.siteName||'Mine')+'</td><td>'+esc(label(f.resourceId))+'</td><td>'+esc(label(f.status))+'</td>'+
   '<td>'+esc(f.factoryName||f.destinationFactoryName||f.destinationWarehouseName||'—')+'</td><td>'+formatNum(f.quantity,2)+' '+esc(unitLabel(f.unit||''))+'</td></tr>';
 }).join('')+'</tbody></table></div>';
 const raw=rs.warehouse?.availableByResource||{},finished=rs.processedWarehouse?.availableByResource||{};
 out+='<div class="omm-lines"><div class="omm-line"><h4>Raw warehouse</h4>'+Object.entries(raw).slice(0,12).map(([k,v])=>'<div>'+esc(label(k))+': <strong>'+formatNum(v,2)+'</strong></div>').join('')+'</div>'+
 '<div class="omm-line"><h4>Processed inventory</h4>'+Object.entries(finished).slice(0,12).map(([k,v])=>'<div>'+esc(label(k))+': <strong>'+formatNum(v,2)+'</strong></div>').join('')+'</div></div></div>';
 return out;
}

function ensureModal(){
 shellStyle();let modal=g.document.getElementById('omega-mine-management-modal');if(modal)return modal;
 modal=g.document.createElement('div');modal.id='omega-mine-management-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Resource Ministry mine management');
 modal.addEventListener('click',onClick);
 modal.addEventListener('input',function(e){
  if(e.target?.matches?.('[data-omm-build-count]'))updateBuildPreview(e.target);
  else if(e.target?.matches?.('[data-omm-destroy-count]'))updateDestroyPreview(e.target);
  else if(e.target?.matches?.('[data-omm-operation-count]'))updateOperatingButtons(e.target);
 });
 modal.addEventListener('change',function(e){if(e.target?.matches?.('[data-omm-country]')){currentCountry=currentView==='mines'?iso3(e.target.value):playerCountry();render();}});
 modal.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
 g.document.body.appendChild(modal);return modal;
}
function render(){
 const modal=ensureModal(),country=currentCountry||playerCountry(),player=playerCountry();currentCountry=country;
 const isPlayer=country===player;
 modal.innerHTML='<div class="omm-shell"><header class="omm-head"><div><h2>'+SVG_MOUNTAIN+' Resource Ministry · Mine Management</h2><div class="omm-sub">Country-scoped site registry, mine construction, extraction and stock ledger · '+esc(VERSION)+'</div></div><div class="omm-actions">'+(currentView==='mines'?countrySelect():'<span class="omm-pill">PLAYER COUNTRY · '+esc(countryName(country))+'</span>')+'<button class="omm-primary" data-omm-action="start-country-production" '+(!isPlayer||productionRunActive?'disabled':'')+' aria-label="Start production for this country">'+(productionRunActive?'Production running…':'Start production · 1 tap')+'</button><button data-omm-action="refresh" '+(productionRunActive?'disabled':'')+'>Refresh</button><button class="omm-danger" data-omm-action="close" aria-label="Close mine management">Close</button></div></header>'+
 '<div class="omm-tabs"><button data-omm-action="tab-my-mines" class="'+(currentView==='my-mines'?'omm-primary':'')+'">'+SVG_PICKAXE+' My Mines</button><button data-omm-action="tab-mines" class="'+(currentView==='mines'?'omm-primary':'')+'">'+SVG_MOUNTAIN+' Mines</button></div>'+
 (!isPlayer?'<div class="omm-alert">Viewing '+esc(countryName(country))+' in read-only mode. Mine building and production are restricted to the active player country ('+esc(player||'UNRESOLVED')+').</div>':'')+
 (lastOutcome?'<div class="omm-status" role="status" aria-live="polite">'+esc(lastOutcome)+'</div>':'')+
 '<main>'+(currentView==='my-mines'?myMines(country):mineDirectory(country))+'</main></div>';
 modal.style.display='flex';
 if(currentTargetSiteId){
  const card=Array.from(modal.querySelectorAll('[data-omm-site-card]')).find(el=>el.getAttribute('data-omm-site-card')===currentTargetSiteId);
  if(card&&typeof card.scrollIntoView==='function')card.scrollIntoView({block:'center',behavior:'auto'});
  const targetAction=currentTargetAction==='extract'?'[data-omm-quantity="'+currentTargetSiteId+'"]':currentTargetAction==='build'?'[data-omm-build-count][data-site-id="'+currentTargetSiteId+'"]':null;
  const target=targetAction?modal.querySelector(targetAction):null;
  if(target&&typeof target.focus==='function')target.focus({preventScroll:true});
 }
}
function close(){const modal=g.document.getElementById('omega-mine-management-modal');if(modal)modal.style.display='none';}
function updateRunStatus(value){
 lastOutcome=String(value||'');const modal=g.document.getElementById('omega-mine-management-modal');if(!modal)return;
 let node=modal.querySelector('.omm-status');
 if(!node){node=g.document.createElement('div');node.className='omm-status';node.setAttribute('role','status');node.setAttribute('aria-live','polite');
  const shell=modal.querySelector('.omm-shell'),main=shell?.querySelector('main');if(main)shell.insertBefore(node,main);else shell?.appendChild(node);}
 node.textContent=lastOutcome;
}
function yieldToMobileUi(){return new Promise(resolve=>{if(typeof g.setTimeout==='function')g.setTimeout(resolve,0);else Promise.resolve().then(resolve);});}
function message(title,result){
 const inner=result?.result&&typeof result.result==='object'?result.result:result||{};
 return title+': '+label(inner.status||result?.status||'UNSPECIFIED')+' · '+label(inner.reason||result?.reason||inner.code||result?.code||'See project/flow details');
}
function focusSite(siteId,country){
 const site=sitesFor(country).find(x=>siteIdOf(x)===siteId);
 const coords=site?.location?.coordinates,lat=num(coords?.lat),lng=num(coords?.lng),map=g.Game?.Map;
 if(map&&lat!==null&&lng!==null){
   const leaf=map.map||map.leafletMap||map.instance;
   try{if(typeof leaf?.flyTo==='function')leaf.flyTo([lat,lng],6);else if(typeof map.flyTo==='function')map.flyTo([lat,lng],6);}catch(_){}
 }
 lastOutcome='Selected site: '+(site?.siteName||siteId)+' · '+(lat===null||lng===null?'coordinates unavailable':'regional coordinates only');render();
}
async function onClick(event){
 const button=event.target?.closest?.('[data-omm-action]');if(!button)return;
 const action=button.getAttribute('data-omm-action'),country=currentCountry||playerCountry(),api=network();
 if(action==='close'){close();return;}
 if(action==='start-country-production'){
  if(country!==playerCountry()){lastOutcome='Rejected: production is restricted to the active player country.';render();return;}
  if(productionRunActive)return;
  const runtime=endowment();
  if(!runtime?.startCountryProduction||!runtime?.initialize||!runtime?.hydrateCountry||!runtime?.countryMineSiteControllers){
   lastOutcome='Country-scoped production runtime unavailable.';render();return;
  }
  productionRunActive=true;updateRunStatus('Preparing the selected country production network…');render();
  try{
   const initialized=await runtime.initialize();
   if(initialized?.status!=='READY')throw new Error(initialized?.reason||'RESOURCE_ENDOWMENT_NOT_READY');
   const hydrated=await runtime.hydrateCountry(country),hydration=hydrated?.result||hydrated;
   if(hydrated?.status!=='APPLIED'||hydration?.accepted===false)throw new Error(hydration?.reason||hydrated?.reason||'COUNTRY_HYDRATION_NOT_COMMITTED');
   const controllers=runtime.countryMineSiteControllers(country)||{};
   const siteIds=[...new Set(Object.entries(controllers).filter(([,row])=>Array.isArray(row?.linkedOccurrenceKeys)&&row.linkedOccurrenceKeys.length>0)
    .map(([key,row])=>String(row?.siteReferenceKey||key||'').trim()).filter(Boolean))];
   if(!siteIds.length)throw new Error('NO_EXECUTABLE_MINE_SITE_OCCURRENCES_FOR_PLAYER_COUNTRY');
   const BATCH_SIZE=32,totalBatches=Math.ceil(siteIds.length/BATCH_SIZE);
   let startedSiteCount=0,extractedRecordCount=0,blockedOccurrenceCount=0,attemptedOccurrenceCount=0;
   let processedBatchCount=0,failedBatchCount=0;const failures=[];
   for(let offset=0;offset<siteIds.length;offset+=BATCH_SIZE){
    const batch=siteIds.slice(offset,offset+BATCH_SIZE);
    updateRunStatus('Starting production for '+country+': batch '+(processedBatchCount+1)+'/'+totalBatches+' · '+(offset+batch.length)+'/'+siteIds.length+' mine sites.');
    const result=await runtime.startCountryProduction(country,batch),status=String(result?.status||'BLOCKED').toUpperCase();
    startedSiteCount+=Math.max(0,Number(result?.startedSiteCount)||0);
    extractedRecordCount+=Math.max(0,Number(result?.extractedRecordCount)||0);
    blockedOccurrenceCount+=Math.max(0,Number(result?.blockedOccurrenceCount)||0);
    attemptedOccurrenceCount+=Math.max(0,Number(result?.attemptedOccurrenceCount)||0);
    processedBatchCount++;
    if(!['STARTED','PARTIALLY_STARTED','ALREADY_ACTIVE'].includes(status)){failedBatchCount++;failures.push({batch:processedBatchCount,reason:result?.reason||status});}
    if(offset+BATCH_SIZE<siteIds.length)await yieldToMobileUi();
   }
   const partial=blockedOccurrenceCount>0||failedBatchCount>0;
   if(extractedRecordCount>0){
    lastOutcome='Production '+(partial?'partially started':'started')+' for '+country+': '+formatNum(startedSiteCount)+' producing site(s), '+formatNum(extractedRecordCount)+' extraction record(s), '+formatNum(blockedOccurrenceCount)+' blocked occurrence(s). '+formatNum(processedBatchCount)+' responsive batch(es) processed.';
    if(failedBatchCount)lastOutcome+=' Failed batches: '+formatNum(failedBatchCount)+'. First reason: '+label(failures[0]?.reason||'UNKNOWN')+'.';
   }else{
    lastOutcome='No production output committed for '+country+'. '+formatNum(attemptedOccurrenceCount)+' occurrence(s) attempted; '+formatNum(blockedOccurrenceCount)+' blocked. '+label(failures[0]?.reason||'CHECK SITE STATUS, RESERVES, WORKERS AND POLICY')+'.';
   }
  }catch(error){lastOutcome='Production start failed: '+String(error?.message||error);}
  finally{productionRunActive=false;}
  render();return;
 }
  if(action==='refresh'){lastOutcome='Refreshing resource data…';render();try{await api?.loadCatalog?.();await endowment()?.initialize?.();}catch(_){}lastOutcome='Refreshed from current runtime state.';render();return;}
 if(action==='tab-my-mines'){currentView='my-mines';currentCountry=playerCountry();lastOutcome='';render();return;}
 if(action==='tab-mines'){currentView='mines';lastOutcome='';render();return;}
 const siteId=String(button.getAttribute('data-site-id')||''),rid=String(button.getAttribute('data-resource-id')||'').toLowerCase();
 if(action==='run-factory'){
  if(country!==playerCountry()){lastOutcome='Rejected: processing is restricted to the active player country.';render();return;}
  if(!api?.executeFactoryCycle){lastOutcome='Factory processing runtime unavailable.';render();return;}
  const factoryId=String(button.getAttribute('data-factory-id')||'').trim();
  const qtyInput=Array.from(g.document.querySelectorAll('[data-omm-factory-quantity]')).find(el=>el.getAttribute('data-omm-factory-quantity')===factoryId);
  const quantity=num(qtyInput?.value);
  if(!factoryId||quantity===null||quantity<=0){lastOutcome='Factory and positive input quantity are required.';render();return;}
  button.disabled=true;
  try{const result=api.executeFactoryCycle({countryId:country,factoryId,resourceId:rid,quantity});lastOutcome=message('Factory processing cycle',result);}
  catch(error){lastOutcome='Factory processing failed: '+String(error?.message||error);}
  render();return;
 }
 if(action==='focus-site'){focusSite(siteId,country);return;}
 if(action==='build-mine'){flipCard(siteId,'build');return;}
  if(action==='destroy-mine-preview'){flipCard(siteId,'destroy');return;}
  if(action==='operate-mine'){flipCard(siteId,'operate');return;}
  if(action==='flip-back'){
   const card=button.closest('[data-omm-site-card]');card?.classList.remove('is-flipped');
   card?.querySelectorAll('[data-omm-panel]').forEach(panel=>{panel.hidden=true;});return;
  }
  if(action==='start-mine-build'){
   if(country!==playerCountry()){lastOutcome='Rejected: mine construction is restricted to the active player country.';render();return;}
   if(!api?.startMineProject||!api?.quoteMineProject){lastOutcome='Mine construction runtime unavailable; no resources were committed.';render();return;}
   const count=num(button.getAttribute('data-count')),site=cardSiteById(siteId,country);
   if(!site||count===null||!Number.isInteger(count)||count<1||count>100){lastOutcome='Choose a valid mine count from 1 to 100.';render();return;}
   button.disabled=true;button.textContent='Rechecking inventory…';
   let result;
   try{
    const quote=api.quoteMineProject({countryId:country,siteId,resourceId:rid,quantity:count,assignedWorkers:1000000000});
    if(quote.status!=='QUOTED')result=quote;
    else if(!quote.ready)result={status:'BLOCKED',reason:'CONSTRUCTION_REQUIREMENTS_NOT_MET',quote};
    else{
     const existing=assetRows(country).filter(a=>String(a.siteId)===siteId).length;
     result=api.startMineProject({countryId:country,siteId,resourceId:rid,quantity:count,assignedWorkers:quote.workersRequired,
      requestId:'MINE_BUILD:'+country+':'+siteId+':N'+count+':A'+existing+':T'+turn()});
    }
   }catch(error){result={status:'FAILED',reason:String(error?.message||error)};}
   lastOutcome=message('Mine construction',result);
   if(result?.status==='UNDER_CONSTRUCTION')lastOutcome+=' · '+formatNum(result.assetCount||count)+' mine unit(s); '+formatMoney(result.costUsd)+' committed; '+formatNum(result.durationDays)+' days scheduled for completion.';
   render();return;
  }
  if(action==='request-mine-destruction'){
   openDestructionConfirmation(siteId,Math.max(1,Math.floor(num(button.getAttribute('data-count'))||1)),null);return;
  }
  if(action==='request-single-mine-destruction'){
   openDestructionConfirmation(siteId,1,String(button.getAttribute('data-mine-id')||''));return;
  }
  if(action==='cancel-mine-destruction'){button.closest('.omm-confirm-overlay')?.remove();return;}
  if(action==='confirm-mine-destruction'){
   if(country!==playerCountry()){lastOutcome='Rejected: mine demolition is restricted to the active player country.';button.closest('.omm-confirm-overlay')?.remove();render();return;}
   if(!api?.destroyMineAssets){lastOutcome='Demolition runtime unavailable; no mine was changed.';button.closest('.omm-confirm-overlay')?.remove();render();return;}
   const overlay=button.closest('.omm-confirm-overlay'),targetSite=String(overlay?.getAttribute('data-site-id')||siteId),count=Math.max(1,Math.floor(num(overlay?.getAttribute('data-count'))||1)),mineId=String(overlay?.getAttribute('data-mine-id')||'');
   button.disabled=true;button.textContent='Destroying…';
   try{
    const result=api.destroyMineAssets({countryId:country,siteId:targetSite,quantity:count,mineId:mineId||undefined,confirmed:true});
    lastOutcome=message('Mine demolition',result);
    if(result?.status==='DESTROYED')lastOutcome+=' · '+formatNum(result.quantity)+' destroyed; '+formatNum(result.jobsLost)+' jobs lost; '+(result.productionLostPerDay===null?'production impact unavailable':formatNum(result.productionLostPerDay,2)+' units/day lost')+'. History and stock preserved.';
   }catch(error){lastOutcome='Demolition failed: '+String(error?.message||error)+'. No successful state change was reported.';}
   overlay?.remove();render();return;
  }
  if(action==='stop-mine-units'||action==='resume-mine-units'){
   if(country!==playerCountry()){lastOutcome='Rejected: mine operations are restricted to the active player country.';render();return;}
   if(!api?.setMineOperatingStatus){lastOutcome='Mine operating-status runtime unavailable.';render();return;}
   const input=button.closest('[data-omm-site-card]')?.querySelector('[data-omm-operation-count]'),quantity=num(input?.value);
   if(quantity===null||!Number.isInteger(quantity)||quantity<1){lastOutcome='Choose a positive whole number of mine units.';render();return;}
   try{
    const desired=action==='stop-mine-units'?'STOPPED':'OPERATIONAL';
    const result=api.setMineOperatingStatus({countryId:country,siteId,quantity,status:desired});
    lastOutcome=message(desired==='STOPPED'?'Pause mine units':'Resume mine units',result);
    if(result?.status==='APPLIED')lastOutcome+=' · '+formatNum(result.quantity)+' unit(s) updated; history and warehouse stock preserved.';
   }catch(error){lastOutcome='Mine operation change failed: '+String(error?.message||error);}
   render();return;
  }
  if(action==='pause-single-mine'||action==='resume-single-mine'){
   if(country!==playerCountry()){lastOutcome='Rejected: mine operations are restricted to the active player country.';render();return;}
   if(!api?.setMineOperatingStatus){lastOutcome='Mine operating-status runtime unavailable.';render();return;}
   const mineId=String(button.getAttribute('data-mine-id')||'');
   try{
    const desired=action==='pause-single-mine'?'STOPPED':'OPERATIONAL';
    const result=api.setMineOperatingStatus({countryId:country,siteId,mineId,quantity:1,status:desired});
    lastOutcome=message(desired==='STOPPED'?'Pause mine':'Resume mine',result);
   }catch(error){lastOutcome='Mine operation change failed: '+String(error?.message||error);}
   render();return;
  }
  if(action==='run-mine'){
   if(country!==playerCountry()){lastOutcome='Rejected: extraction is restricted to the active player country.';render();return;}
   if(!api?.executeSitePipeline){lastOutcome='Site extraction pipeline unavailable.';render();return;}
   const quantityInput=Array.from(g.document.querySelectorAll('[data-omm-quantity]')).find(el=>el.getAttribute('data-omm-quantity')===siteId),quantity=num(quantityInput?.value)??1000;
   if(quantity<=0){lastOutcome='Extraction quantity must be positive.';render();return;}
   button.disabled=true;
   try{const result=await api.executeSitePipeline({countryId:country,siteId,resourceId:rid,quantity});lastOutcome=message('Mine extraction pipeline',result);}
   catch(error){lastOutcome='Mine extraction failed: '+String(error?.message||error);}
   render();return;
 }
}
function injectButtons(){
 if(!g.document?.body)return;
 const modal=g.document.getElementById('gsrsk-intelligence-modal');
 if(!modal)return;
 const host=modal.querySelector('.omega-rescc-top .omega-rescc-headtools')||modal.querySelector('.omega-rescc-top')||modal.querySelector('.omega-rescc-headtools');
 if(!host||host.querySelector('[data-omega-mine-entry="my-mines"]'))return;
 const my=g.document.createElement('button');my.type='button';my.className='omega-rescc-button';my.setAttribute('data-omega-mine-entry','my-mines');my.innerHTML=SVG_PICKAXE+' My Mines';
 const all=g.document.createElement('button');all.type='button';all.className='omega-rescc-button';all.setAttribute('data-omega-mine-entry','mines');all.innerHTML=SVG_MOUNTAIN+' Mines';
 host.appendChild(my);host.appendChild(all);
}
function delegatedEntry(e){
 const button=e.target?.closest?.('[data-omega-mine-entry]');if(!button)return;
 e.preventDefault();currentView=button.getAttribute('data-omega-mine-entry')==='my-mines'?'my-mines':'mines';
 currentCountry=currentView==='my-mines'?playerCountry():(selectedMinistryCountry()||currentCountry||playerCountry());lastOutcome='';
 if(!currentCountry){lastOutcome='Player country is not resolvable; construction remains disabled.';}
 void Promise.resolve(network()?.loadCatalog?.()).then(()=>endowment()?.initialize?.()).catch(()=>{}).finally(render);
}
function boot(){
 if(!g.document||isBound)return;isBound=true;
 shellStyle();g.document.addEventListener('click',delegatedEntry);
 injectButtons();
 if(typeof MutationObserver==='function'){
  observer=new MutationObserver(injectButtons);
  observer.observe(g.document.body,{childList:true,subtree:true});
 }
 for(const name of ['OMEGA_RESOURCE_MINE_PROJECT_STARTED','OMEGA_RESOURCE_MINE_COMMISSIONED','OMEGA_SIMULATION_TURN_COMMITTED','OMEGA_RESOURCE_EXTRACTION_COMPLETED','OMEGA_RESOURCE_INVENTORY_CHANGED','OMEGA_RESOURCE_PROCESSING_COMPLETED','OMEGA_TRADE_SETTLEMENT_COMPLETED','OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED','OMEGA_RESOURCE_TRADE_RECONCILED','OMEGA_RESOURCE_SITE_BINDING_SYNCED','OMEGA_RESOURCE_BOOTSTRAP_STATUS']){
  g.addEventListener?.(name,function(){const modal=g.document.getElementById('omega-mine-management-modal');if(modal?.style.display==='flex')render();});
 }
 for(const name of ['MINISTRY_SELECTED','OMEGA_MINISTRY_VIEW_COUNTRY_CHANGED','OMEGA_COUNTRY_SELECTED','COUNTRY_SELECTED','OMEGA_COUNTRY_CONTEXT_CHANGED','OMEGA_SELECTED_COUNTRY_CHANGED']){
  g.addEventListener?.(name,function(event){
   if(currentView!=='mines')return;
   const detail=event?.detail||{};
   const next=iso3(detail.countryId||detail.countryCode||detail.iso3||detail.country||g.OmegaMinistryViewCountry||g.OmegaCabinetUI?.activeCountry||'');
   if(/^[A-Z]{3}$/.test(next)){currentCountry=next;const modal=g.document.getElementById('omega-mine-management-modal');if(modal?.style.display==='flex')render();}
  });
 }
}
if(g.document?.readyState==='loading')g.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
g.Omega=g.Omega||{};
g.Omega.ResourceMineManagementUI=Object.freeze({VERSION,open:function(view,country,siteId,action){currentView=view==='mines'?'mines':'my-mines';currentCountry=iso3(country||(currentView==='mines'?selectedMinistryCountry():playerCountry()));currentTargetSiteId=String(siteId||'');currentTargetAction=String(action||'');lastOutcome='';render();},refresh:render,getCountrySites:function(country){return sitesFor(iso3(country||playerCountry()));},getProductionSummary:productionSummary,getReserveSummary:reserveSummary});
g.OmegaResourceMineManagementUI=g.Omega.ResourceMineManagementUI;
})(typeof window!=='undefined'?window:globalThis);
