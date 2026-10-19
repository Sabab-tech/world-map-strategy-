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
 value=value||s?.simulation?.session?.playerCountryId||s?.simulation?.playerCountryId||g.CountryIOS?.activeCountry||g.Game?.currentActiveCountry||g.currentActiveCountry;
 return iso3(value||'');
}
function siteIdOf(x){return String(x?.siteId||x?.siteReferenceKey||x?.id||'').trim();}
function countryOf(x){return iso3(x?.countryId||x?.countryCode||x?.identity?.countryIso3||x?.sourceSiteRecord?.countryCode||'');}
function resourceOf(x){return String(x?.real?.resourceId||x?.sourceSiteRecord?.resourceId||x?.sourceSiteRecord?.resourceTypeId||x?.identity?.resourceTypeId||x?.resourceId||x?.resourceTypeId||'').trim().toLowerCase();}
function sitesFor(country){
 const all=[];
 const catalog=g.OmegaResourceSiteCanonicalCatalogData||g.Omega?.ResourceSiteCanonicalCatalogData;
 if(Array.isArray(catalog?.sites))all.push(...catalog.sites);
 const binding=g.Omega?.IndividualResourceSiteBinding||g.OmegaIndividualResourceSiteBinding;
 if(Array.isArray(binding?.sites))all.push(...binding.sites);
 const ref=endowment()?.countryMineSiteReferences?.(country);
 if(Array.isArray(ref))all.push(...ref.map(x=>({...x,siteId:x.siteId||x.siteReferenceKey,countryId:country,identity:{...(x.identity||{}),resourceTypeId:x.resourceId||x.resourceTypeId}})));
 const unique=new Map();
 for(const row of all){
   const id=siteIdOf(row),cid=countryOf(row),rid=resourceOf(row);
   if(!id||!rid||!/^[A-Z]{3}$/.test(cid)||cid!==country||row?.runtime?.aliasOfSiteId||row?.map?.markerEligible===false)continue;
   if(!unique.has(id))unique.set(id,{...row,siteId:id,countryId:cid,identity:{...(row.identity||{}),resourceTypeId:rid}});
 }
 const rs=state()?.resource?.[country]||{};
 for(const row of Array.isArray(rs.mineSiteReferences)?rs.mineSiteReferences:[]){
   const id=siteIdOf(row),rid=resourceOf(row);
   if(id&&rid&&!unique.has(id))unique.set(id,{...row,siteId:id,countryId:country,identity:{...(row.identity||{}),resourceTypeId:rid}});
 }
 return [...unique.values()].sort((a,b)=>String(a.siteName||a.name||a.siteId).localeCompare(String(b.siteName||b.name||b.siteId)));
}
function formatNum(v,digits=0){const n=num(v);return n===null?'Not recorded':n.toLocaleString('en-US',{maximumFractionDigits:digits});}
function formatMoney(v){const n=num(v);if(n===null)return'Unavailable';return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);}
function label(v){return String(v||'UNOBSERVED').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();}
function playerState(country){return state()?.resource?.[country]||{};}
function playerProjects(country){const rs=playerState(country);return Array.isArray(rs.industrialNetwork?.projects)?rs.industrialNetwork.projects:[];}
function assetRows(country){const rs=playerState(country);return Array.isArray(rs.mineAssets)?rs.mineAssets:[];}
function sourceStatus(site){const op=site?.operation||{};return op.realWorldStatus||op.status||site?.sourceSiteRecord?.status||'UNOBSERVED';}
function playerCommissioned(site,country){return assetRows(country).some(a=>String(a.siteId)===siteIdOf(site)&&String(a.status||'').toUpperCase()==='OPERATIONAL');}
function projectFor(site,country){return playerProjects(country).filter(p=>p.projectType==='MINE_CONSTRUCTION'&&String(p.siteId)===siteIdOf(site)).slice(-1)[0]||null;}
function resourceLabel(site){return label(site?.identity?.resourceName||resourceOf(site));}
function reserveSummary(site){
 const reserve=site?.quantitative?.reserve||{},measured=num(reserve.quantity),status=String(reserve.status||'UNOBSERVED').toUpperCase();
 if(measured!==null&&['OBSERVED','OBSERVED_ATTRIBUTABLE','REPORTED'].includes(status))return 'Reported reserve: '+formatNum(measured,2)+' '+String(reserve.unit||'units')+' ('+label(status)+')';
 const seed=num(site?.simulation?.reserve?.quantity??site?.reserve?.quantity);
 if(seed!==null&&String(site?.simulation?.reserve?.status||site?.reserve?.status||'').toUpperCase()==='SIMULATED')return 'Gameplay seed only: '+formatNum(seed,2)+' '+String(site?.simulation?.reserve?.unit||site?.reserve?.unit||'units');
 return 'Reserve: '+label(status)+' (no measured quantity)';
}
function productionSummary(site){
 const p=site?.quantitative?.production||{},annual=num(p.annual),rate=num(p.rate),status=String(p.status||'UNOBSERVED').toUpperCase();
 if(annual!==null&&['OBSERVED','OBSERVED_ATTRIBUTABLE','REPORTED'].includes(status))return 'Annual output: '+formatNum(annual,2)+' '+String(p.annualUnit||p.unit||'units')+' ('+label(status)+')';
 if(rate!==null&&['OBSERVED','OBSERVED_ATTRIBUTABLE','REPORTED'].includes(status))return 'Output rate: '+formatNum(rate,2)+' '+String(p.unit||'units')+' ('+label(status)+')';
 return 'Measured production: '+label(status);
}
function quoteFor(site,country,workers){
 const api=network();if(!api?.quoteMineProject)return{status:'BLOCKED',reason:'MINE_CONSTRUCTION_API_UNAVAILABLE'};
 return api.quoteMineProject({countryId:country,siteId:siteIdOf(site),resourceId:resourceOf(site),assignedWorkers:workers});
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
 '#omega-mine-management-modal .omm-materials{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin:8px 0}#omega-mine-management-modal .omm-material{display:flex;justify-content:space-between;gap:10px;background:#0b1827;border-radius:6px;padding:6px 8px;font-size:12px}'+
 '#omega-mine-management-modal .omm-short{color:#ffb9a8}#omega-mine-management-modal .omm-ok{color:#91e3c3}#omega-mine-management-modal .omm-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}'+
 '#omega-mine-management-modal .omm-input{max-width:140px;width:100%;border:1px solid #36516d;background:#071321;color:#eef6ff;padding:8px;border-radius:8px}'+
 '#omega-mine-management-modal .omm-progress{height:7px;background:#203249;overflow:hidden;border-radius:99px;margin:8px 0}#omega-mine-management-modal .omm-progress span{display:block;height:100%;background:#36b69b}'+
 '#omega-mine-management-modal .omm-alert{border-left:3px solid #dca45b;background:#201e19;padding:9px 11px;border-radius:5px;margin:10px 0;color:#f2dcb8}#omega-mine-management-modal .omm-status{color:#b8d4ee;margin:10px 0;white-space:pre-wrap}'+
 '#omega-mine-management-modal .omm-section{margin:15px 0}#omega-mine-management-modal .omm-empty{padding:20px;border:1px dashed #344d65;border-radius:10px;color:#9db1c9;text-align:center}'+
 '#omega-mine-management-modal .omm-table-wrap{overflow:auto}#omega-mine-management-modal table{width:100%;border-collapse:collapse;min-width:520px}#omega-mine-management-modal th,#omega-mine-management-modal td{padding:8px;border-bottom:1px solid #26384d;text-align:left;font-size:12px}'+
 '#omega-mine-management-modal svg{width:17px;height:17px;vertical-align:middle}'+
 '@media(max-width:760px){#omega-mine-management-modal{padding:4px}#omega-mine-management-modal .omm-shell{height:98vh;padding:11px;border-radius:10px}#omega-mine-management-modal .omm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#omega-mine-management-modal .omm-site-grid{grid-template-columns:1fr}#omega-mine-management-modal .omm-lines,#omega-mine-management-modal .omm-materials{grid-template-columns:1fr}#omega-mine-management-modal .omm-head{align-items:center}}';
 g.document.head.appendChild(style);
}
let currentView='my-mines',currentCountry='',lastOutcome='',isBound=false,observer=null;
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
 const blocked=flows.filter(f=>/BLOCKED|AWAITING_ROUTE/.test(String(f.status||''))).length;
 const raw=rs.warehouse?.availableByResource||{},processed=rs.processedWarehouse?.availableByResource||{};
 const rawTotal=Object.values(raw).reduce((n,v)=>n+(num(v)||0),0),processedTotal=Object.values(processed).reduce((n,v)=>n+(num(v)||0),0);
 return '<div class="omm-grid">'+
  kpi('Commissioned player mines',assets.filter(a=>String(a.status).toUpperCase()==='OPERATIONAL').length)+
  kpi('Mine projects',projects.filter(p=>p.projectType==='MINE_CONSTRUCTION'&&p.status==='UNDER_CONSTRUCTION').length)+
  kpi('Raw warehouse stock',formatNum(rawTotal,2)+' t')+
  kpi('Processed stock',formatNum(processedTotal,2)+' t')+
  '</div><div class="omm-lines"><div class="omm-line"><span class="omm-muted">Site-flow ledger</span><br><strong>'+flows.length+'</strong> tracked batches / flows</div>'+
  '<div class="omm-line"><span class="omm-muted">Treasury settlement records</span><br><strong>'+receipts+'</strong> receipt / settlement events</div>'+
  '<div class="omm-line"><span class="omm-muted">Currently blocked flows</span><br><strong class="'+(blocked?'omm-short':'omm-ok')+'">'+blocked+'</strong></div>'+
  '<div class="omm-line"><span class="omm-muted">Shipment records</span><br><strong>'+(Array.isArray(networkState.shipments)?networkState.shipments.length:0)+'</strong></div></div>';
}
function kpi(name,value){return '<div class="omm-kpi"><span>'+esc(name)+'</span><strong>'+esc(value)+'</strong></div>';}
function materialMarkup(quote){
 if(!Array.isArray(quote.materials)||!quote.materials.length)return '<div class="omm-muted">Construction bill of materials unavailable.</div>';
 return '<div class="omm-materials">'+quote.materials.map(m=>'<div class="omm-material"><span>'+esc(label(m.resourceId))+'<br><small class="omm-muted">Available '+formatNum(m.available,2)+' t</small></span><strong class="'+(m.sufficient?'omm-ok':'omm-short')+'">'+formatNum(m.required,2)+' t'+(m.shortfall>0?' · short '+formatNum(m.shortfall,2):'')+'</strong></div>').join('')+'</div>';
}
function siteCard(site,country,view){
 const id=siteIdOf(site),rid=resourceOf(site),name=site.siteName||site.name||id,asset=assetRows(country).filter(a=>String(a.siteId)===id&&String(a.status).toUpperCase()==='OPERATIONAL').slice(-1)[0];
 const project=projectFor(site,country),status=asset?'PLAYER COMMISSIONED':project?.status||sourceStatus(site),quote=quoteFor(site,country,0);
 const source=sourceStatus(site),loc=site.location?.adminRegion||site.location?.locality||site.location?.countryName||'Regional location';
 let html='<article class="omm-card"><div class="omm-card-head"><div><h3>'+esc(name)+'</h3><div class="omm-sub">'+esc(resourceLabel(site))+' · '+esc(loc)+'</div></div><span class="omm-pill">'+esc(label(status))+'</span></div>';
 html+='<div class="omm-lines"><div class="omm-line"><span class="omm-muted">Site source status</span><br>'+esc(label(source))+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Mine asset status</span><br>'+esc(asset?'Operational · turn '+asset.commissionedTurn:(project?label(project.status):'Not player-commissioned'))+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Resource ID</span><br>'+esc(rid)+'</div>'+
   '<div class="omm-line"><span class="omm-muted">Data precision</span><br>'+esc(label(site.location?.coordinatePrecision||site.location?.coordinateStatus||'UNOBSERVED'))+'</div>'+
    '<div class="omm-line"><span class="omm-muted">Reserve status</span><br>'+esc(reserveSummary(site))+'</div>'+
    '<div class="omm-line"><span class="omm-muted">Production status</span><br>'+esc(productionSummary(site))+'</div></div>';
 if(quote.status==='QUOTED'){
  html+='<div class="omm-section"><h4>Construction estimate</h4><div class="omm-lines">'+
   '<div class="omm-line"><span class="omm-muted">Estimated capital cost</span><br><strong>'+formatMoney(quote.costUsd)+'</strong></div>'+
   '<div class="omm-line"><span class="omm-muted">Expected construction time</span><br><strong>'+formatNum(quote.durationDays)+' days · '+formatNum(quote.estimatedTurns)+' turns</strong></div>'+
   '<div class="omm-line"><span class="omm-muted">Required workforce</span><br><strong>'+formatNum(quote.workersRequired)+' workers</strong></div>'+
   '<div class="omm-line"><span class="omm-muted">Treasury balance / requirement</span><br>'+formatMoney(quote.treasury.available)+' / '+formatMoney(quote.costUsd)+'<br><span class="'+(quote.treasury.sufficient?'omm-ok':'omm-short')+'">'+(quote.treasury.sufficient?'Cash check passed':'Insufficient or unavailable cash')+'</span></div></div>'+
   '<div class="omm-sub">Materials are debited from the existing resource inventory and raw warehouse. Values are simulated game rules, not a real contractor quote.</div>'+
   materialMarkup(quote);
  if(project?.status==='UNDER_CONSTRUCTION'){
    const pct=Math.max(0,Math.min(100,Number(project.progressPct||0)*100));
    html+='<div class="omm-progress"><span style="width:'+pct+'%"></span></div><div class="omm-sub">Construction: '+pct.toFixed(1)+'% · '+formatNum(project.progressDays)+' / '+formatNum(project.durationDays)+' days · project '+esc(project.projectId)+'</div>';
  }else if(asset){
    html+='<div class="omm-alert">This deposit has a player-commissioned mine asset. Real-world source status remains separate. Production uses the same extraction, routing and factory pipeline as other resource sites.</div>';
  }else{
    const canBuild=country===playerCountry();
    html+='<div class="omm-actions"><label for="omm-workers-'+esc(id)+'">Workers committed</label><input class="omm-input" id="omm-workers-'+esc(id)+'" data-omm-workers="'+esc(id)+'" type="number" min="0" step="1" value="'+quote.workersRequired+'" aria-label="Workers committed for '+esc(name)+'">'+
      '<button class="omm-primary" data-omm-action="build-mine" data-site-id="'+esc(id)+'" data-resource-id="'+esc(rid)+'" '+(!canBuild?'disabled':'')+'>Build mine</button></div>'+
      '<div class="omm-sub">Build allowed only for the active player country. The project requires the full cash balance, every listed material and the committed workforce.</div>';
  }
 }else{
  html+='<div class="omm-alert">Estimate unavailable: '+esc(label(quote.reason||quote.status))+'</div>';
 }
 if(asset){
  html+='<div class="omm-actions"><label for="omm-output-'+esc(id)+'">Ore quantity</label><input class="omm-input" id="omm-output-'+esc(id)+'" data-omm-quantity="'+esc(id)+'" type="number" min="1" step="1" value="1000" aria-label="Extraction quantity for '+esc(name)+'"><button data-omm-action="run-mine" data-site-id="'+esc(id)+'" data-resource-id="'+esc(rid)+'" '+(country!==playerCountry()?'disabled':'')+'>Run extraction pipeline</button></div>';
  html+='<div class="omm-sub">Runtime gates still decide reserve, staffing, policy, route and factory availability. A commissioned asset does not guarantee production will be approved.</div>';
 }
 return html+'</article>';
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
 let out='<div class="omm-section"><h3>Mine & processing stations</h3><p class="omm-sub">Existing processing facilities, their inputs/outputs and cycle capacity. Processing consumes inventory and produces tracked batches; it does not directly mint treasury cash.</p></div>';
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
 if(!rows.length)return '<div class="omm-empty">No valid mine-site references loaded for '+esc(country)+'. Check the canonical site loader and supplemental dataset diagnostic.</div>';
 const built=new Set(assetRows(country).filter(a=>String(a.status).toUpperCase()==='OPERATIONAL').map(a=>String(a.siteId)));
 return '<div class="omm-section"><h3>National mine-site portfolio</h3><p class="omm-sub">Known deposits and projects, not necessarily government-owned or player-operated. Commissioning changes only game state, never the source-reported real-world status.</p></div>'+
 '<div class="omm-site-grid">'+rows.map(site=>siteCard(site,country,'mines')).join('')+'</div>'+stationDirectory(country);
}
function myMines(country){
 const rs=playerState(country),assets=assetRows(country),projects=playerProjects(country).filter(p=>p.projectType==='MINE_CONSTRUCTION');
 const canonical=sitesFor(country),flow=Array.isArray(rs.industrialNetwork?.siteFlowLedger)?rs.industrialNetwork.siteFlowLedger.slice(-12).reverse():[];
 let out=topCards(country);
 out+='<div class="omm-section"><h3>My mine assets</h3><p class="omm-sub">Assets commissioned for this country in the active save. Under-construction sites remain projects, not operating mines.</p>';
 if(!assets.length)out+='<div class="omm-empty">No player mine assets commissioned in '+esc(country)+'. Use the Mines section to compare deposits and construction requirements.</div>';
 else out+='<div class="omm-site-grid">'+assets.slice().reverse().map(a=>{
  const site=canonical.find(x=>siteIdOf(x)===String(a.siteId))||{siteId:a.siteId,siteName:a.siteName,identity:{resourceTypeId:a.resourceId}};
  return '<article class="omm-card"><div class="omm-card-head"><div><h3>'+esc(a.siteName||site.siteName||a.siteId)+'</h3><div class="omm-sub">'+esc(label(a.resourceId))+'</div></div><span class="omm-pill">'+esc(label(a.status))+'</span></div>'+
  '<div class="omm-lines"><div class="omm-line"><span class="omm-muted">Commissioned</span><br>'+esc(a.commissionedTurn??'—')+'</div><div class="omm-line"><span class="omm-muted">Project</span><br>'+esc(a.buildProjectId||'—')+'</div><div class="omm-line"><span class="omm-muted">Construction cost</span><br>'+formatMoney(a.constructionCostUsd)+'</div><div class="omm-line"><span class="omm-muted">Staffed workforce</span><br>'+formatNum(a.workersCommitted)+' / '+formatNum(a.workersRequired)+'</div></div>'+
  '<div class="omm-actions"><label for="omm-output-'+esc(a.siteId)+'">Ore quantity</label><input class="omm-input" id="omm-output-'+esc(a.siteId)+'" data-omm-quantity="'+esc(a.siteId)+'" type="number" min="1" step="1" value="1000" aria-label="Extraction quantity for '+esc(a.siteName||a.siteId)+'"><button data-omm-action="focus-site" data-site-id="'+esc(a.siteId)+'">'+SVG_MOUNTAIN+' View site</button><button data-omm-action="run-mine" data-site-id="'+esc(a.siteId)+'" data-resource-id="'+esc(a.resourceId)+'">Run extraction pipeline</button></div></article>';
 }).join('')+'</div>';
 out+='<div class="omm-section"><h3>Mine construction & commissioning</h3>';
 if(!projects.length)out+='<div class="omm-empty">No mine construction projects yet.</div>';
 else out+='<div class="omm-site-grid">'+projects.slice().reverse().map(p=>{
   const pct=Math.max(0,Math.min(100,Number(p.progressPct||0)*100));
   return '<article class="omm-card"><div class="omm-card-head"><div><h3>'+esc(p.siteName||p.siteId)+'</h3><div class="omm-sub">'+esc(p.projectId)+'</div></div><span class="omm-pill">'+esc(label(p.status))+'</span></div>'+
   '<div class="omm-progress"><span style="width:'+pct+'%"></span></div><div class="omm-lines"><div class="omm-line"><span class="omm-muted">Progress</span><br>'+pct.toFixed(1)+'%</div><div class="omm-line"><span class="omm-muted">Build time</span><br>'+formatNum(p.progressDays)+' / '+formatNum(p.durationDays)+' days</div><div class="omm-line"><span class="omm-muted">CAPEX</span><br>'+formatMoney(p.costUsd)+'</div><div class="omm-line"><span class="omm-muted">Construction materials</span><br>'+esc(label(p.constructionMaterialsStatus))+'</div></div>'+
   '<div class="omm-sub">Paid transaction: '+esc(p.treasuryTransactionId||'—')+' · Commissioned turn: '+esc(p.commissionedTurn??'pending')+'</div></article>';
 }).join('')+'</div>';
 out+='</div><div class="omm-section"><h3>Extraction → inventory → factory → market / treasury pipeline</h3><p class="omm-sub">Raw goods enter the sovereign raw warehouse; processed output enters finished-goods inventory. Treasury receipts appear only on confirmed fiscal posting or settlement events.</p>';
 if(!flow.length)out+='<div class="omm-empty">No tracked mine flow yet. Start extraction from a commissioned mine to populate the live pipeline ledger.</div>';
 else out+='<div class="omm-table-wrap"><table><thead><tr><th>Site</th><th>Commodity</th><th>Batch</th><th>Latest state</th><th>Factory</th><th>Receipts</th><th>Reason</th></tr></thead><tbody>'+flow.map(f=>'<tr><td>'+esc(f.siteName||f.siteId)+'</td><td>'+esc(f.resourceId)+'</td><td>'+esc(f.batchId||'—')+'</td><td>'+esc(label(f.status))+'</td><td>'+esc(f.factoryId||'—')+'</td><td>'+formatNum((f.treasurySettlements||[]).length)+'</td><td>'+esc(label(f.blockReason||'—'))+'</td></tr>').join('')+'</tbody></table></div>';
 const raw=rs.warehouse?.availableByResource||{},finished=rs.processedWarehouse?.availableByResource||{};
 out+='<div class="omm-lines"><div class="omm-line"><h4>Raw warehouse</h4>'+Object.entries(raw).slice(0,14).map(([k,v])=>'<div>'+esc(label(k))+': <strong>'+formatNum(v,2)+'</strong></div>').join('')+'</div>'+
 '<div class="omm-line"><h4>Processed inventory</h4>'+Object.entries(finished).slice(0,14).map(([k,v])=>'<div>'+esc(label(k))+': <strong>'+formatNum(v,2)+'</strong></div>').join('')+'</div></div></div>';
 return out;
}
function ensureModal(){
 shellStyle();let modal=g.document.getElementById('omega-mine-management-modal');if(modal)return modal;
 modal=g.document.createElement('div');modal.id='omega-mine-management-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Resource Ministry mine management');
 modal.addEventListener('click',onClick);
 modal.addEventListener('change',function(e){if(e.target?.matches?.('[data-omm-country]')){currentCountry=currentView==='mines'?iso3(e.target.value):playerCountry();render();}});
 modal.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
 g.document.body.appendChild(modal);return modal;
}
function render(){
 const modal=ensureModal(),country=currentCountry||playerCountry(),player=playerCountry();currentCountry=country;
 const isPlayer=country===player;
 modal.innerHTML='<div class="omm-shell"><header class="omm-head"><div><h2>'+SVG_MOUNTAIN+' Resource Ministry · Mine Management</h2><div class="omm-sub">Country-scoped site registry, mine construction, extraction and stock ledger · '+esc(VERSION)+'</div></div><div class="omm-actions">'+(currentView==='mines'?countrySelect():'<span class="omm-pill">PLAYER COUNTRY · '+esc(countryName(country))+'</span>')+'<button data-omm-action="refresh">Refresh</button><button class="omm-danger" data-omm-action="close" aria-label="Close mine management">Close</button></div></header>'+
 '<div class="omm-tabs"><button data-omm-action="tab-my-mines" class="'+(currentView==='my-mines'?'omm-primary':'')+'">'+SVG_PICKAXE+' My Mines</button><button data-omm-action="tab-mines" class="'+(currentView==='mines'?'omm-primary':'')+'">'+SVG_MOUNTAIN+' Mines</button></div>'+
 (!isPlayer?'<div class="omm-alert">Viewing '+esc(countryName(country))+' in read-only mode. Mine building and production are restricted to the active player country ('+esc(player||'UNRESOLVED')+').</div>':'')+
 (lastOutcome?'<div class="omm-status" role="status" aria-live="polite">'+esc(lastOutcome)+'</div>':'')+
 '<main>'+(currentView==='my-mines'?myMines(country):mineDirectory(country))+'</main></div>';
 modal.style.display='flex';
}
function close(){const modal=g.document.getElementById('omega-mine-management-modal');if(modal)modal.style.display='none';}
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
 if(action==='build-mine'){
   if(country!==playerCountry()){lastOutcome='Rejected: mine construction is restricted to the active player country.';render();return;}
   if(!api?.startMineProject){lastOutcome='Mine construction runtime unavailable.';render();return;}
   const workerInput=Array.from(g.document.querySelectorAll('[data-omm-workers]')).find(el=>el.getAttribute('data-omm-workers')===siteId);
   const assignedWorkers=num(workerInput?.value);
   if(assignedWorkers===null||assignedWorkers<0||!Number.isInteger(assignedWorkers)){lastOutcome='Enter a non-negative whole number of committed construction workers.';render();return;}
   button.disabled=true;button.textContent='Validating…';
   let result;
   try{
    const quote=api.quoteMineProject({countryId:country,siteId,resourceId:rid,assignedWorkers});
    if(quote.status!=='QUOTED')result=quote;
    else if(!quote.ready)result={status:'BLOCKED',reason:'CONSTRUCTION_REQUIREMENTS_NOT_MET',quote};
    else result=api.startMineProject({countryId:country,siteId,resourceId:rid,assignedWorkers,requestId:'MINE_BUILD:'+country+':'+siteId+':T'+turn()});
   }catch(error){result={status:'FAILED',reason:String(error?.message||error)};}
   lastOutcome=message('Mine construction',result);
   if(result?.status==='UNDER_CONSTRUCTION')lastOutcome+=' · '+formatMoney(result.costUsd)+' committed; '+formatNum(result.durationDays)+' days scheduled.';
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
 currentCountry=currentView==='my-mines'?playerCountry():(currentCountry||playerCountry());lastOutcome='';
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
 for(const name of ['OMEGA_RESOURCE_MINE_PROJECT_STARTED','OMEGA_RESOURCE_MINE_COMMISSIONED','OMEGA_SIMULATION_TURN_COMMITTED','OMEGA_RESOURCE_EXTRACTION_COMPLETED','OMEGA_RESOURCE_INVENTORY_CHANGED','OMEGA_RESOURCE_PROCESSING_COMPLETED','OMEGA_TRADE_SETTLEMENT_COMPLETED','OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED','OMEGA_RESOURCE_TRADE_RECONCILED']){
  g.addEventListener?.(name,function(){const modal=g.document.getElementById('omega-mine-management-modal');if(modal?.style.display==='flex')render();});
 }
}
if(g.document?.readyState==='loading')g.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
g.Omega=g.Omega||{};
g.Omega.ResourceMineManagementUI=Object.freeze({VERSION,open:function(view,country){currentView=view==='mines'?'mines':'my-mines';currentCountry=iso3(country||playerCountry());render();},refresh:render});
g.OmegaResourceMineManagementUI=g.Omega.ResourceMineManagementUI;
})(typeof window!=='undefined'?window:globalThis);
