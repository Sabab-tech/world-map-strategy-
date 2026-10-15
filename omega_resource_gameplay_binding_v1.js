/* OMEGA INDIVIDUAL RESOURCE SITE GAMEPLAY BINDING
 * This UI is intentionally site-ID keyed. It never substitutes country averages for a selected site.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const CATALOG_URL='resource_site_canonical_catalog_v1.json';
const MASTER_URL='resource_site_master_registry_v1.json';
const EXPANSION_URL='resource_site_country_expansion_v1.json';
const LEGACY_GAMEPLAY_URLS=['resource_site_legacy_gameplay_expansion_part_1_v1.json','resource_site_legacy_gameplay_expansion_part_2_v1.json','resource_site_legacy_gameplay_expansion_part_3_v1.json','resource_site_legacy_gameplay_expansion_part_4_v1.json','resource_site_legacy_gameplay_expansion_part_5_v1.json','resource_site_legacy_gameplay_expansion_part_6_v1.json'];
const LEGACY_CANONICAL_ALIAS_IDS={SITE_AUS_olympic_dam_uranium_copper:'SITE_AUS_olympic_dam_mine',SITE_BRA_carajas_iron_ore_mine_legacy2:'SITE_BRA_carajas_iron_ore_mine',SITE_CHL_escondida_copper_mine_legacy2:'SITE_CHL_escondida_copper_mine',SITE_IDN_grasberg_copper_gold_mine:'SITE_IDN_grasberg_mine',SITE_COD_tenke_fungurume_copper_cobalt_complex:'SITE_COD_tenke_fungurume_mine',SITE_COD_kibali_gold_mine_complex:'SITE_COD_kibali_gold_mine'};
let sites=[], selected=null, markers=[], markerLayer=null, panel=null, statusNode=null, detailNode=null, selectNode=null;
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const state=()=>g.Game?.state||g.gameState||{};
const api=()=>g.Omega?.ResourceIndustrialNetwork||g.OmegaResourceIndustrialNetwork;
const endowment=()=>g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime;
const cid=v=>String(v||'').trim().toUpperCase();
function setStatus(s){if(statusNode)statusNode.textContent=String(s||'');}
function chosenSite(){return sites.find(s=>s.siteId===selected)||null;}
const PLACEHOLDER_VALUES=new Set(['','unknown','unspecified','not specified','not supplied','not recorded','not available','n/a','na','n.a.','none','null','undefined','source_status_not_set','source_status_unspecified','source status unspecified','coordinate status not supplied','unobserved','simulation data']);
function isPlaceholder(value){
 if(value===null||value===undefined)return true;
 if(typeof value!=='string')return false;
 const text=value.trim().toLowerCase();
 return PLACEHOLDER_VALUES.has(text)||PLACEHOLDER_VALUES.has(text.replace(/[_-]+/g,' '));
}
function hasValue(value){
 if(value===null||value===undefined)return false;
 if(typeof value==='string')return !isPlaceholder(value);
 if(typeof value==='number')return Number.isFinite(value);
 if(typeof value==='boolean')return true;
 if(Array.isArray(value))return value.some(hasValue);
 if(typeof value==='object'){
  return ['value','quantity','amount','rate','annual','estimate','name','label','displayName','type','method','routeName','routeId','id','mode','transportMode','origin','destination','from','to','distance','distanceKm','transitDays','durationDays','etaDays'].some(key=>hasValue(value[key]));
 }
 return false;
}
function humanize(value){
 if(!hasValue(value))return '';
 if(Array.isArray(value))return value.map(humanize).filter(Boolean).join(', ');
 if(typeof value==='object'){
  const preferred=value.label??value.name??value.displayName??value.value??value.quantity??value.amount??value.type??value.method??value.routeName??value.routeId??value.id;
  return hasValue(preferred)?humanize(preferred):'';
 }
 return String(value).trim().replace(/[_-]+/g,' ').replace(/\s+/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase());
}
function formatScalar(value){
 if(typeof value==='number'&&Number.isFinite(value))return new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(value);
 if(typeof value==='string'){
  const trimmed=value.trim();
  if(/^-?\d[\d,]*(\.\d+)?$/.test(trimmed))return new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(Number(trimmed.replace(/,/g,'')));
  return trimmed;
 }
 return humanize(value);
}
function formatUnit(unit){
 if(!hasValue(unit))return '';
 const raw=String(unit).trim(),key=raw.toUpperCase().replace(/[\s-]+/g,'_');
 const known={PERCENT:'%',PCT:'%',PERCENTAGE:'%',TONNES_PER_DAY:'t/day',TONS_PER_DAY:'t/day',METRIC_TONS_PER_DAY:'t/day',TONNES_PER_YEAR:'t/year',TONS_PER_YEAR:'t/year',METRIC_TONS_PER_YEAR:'t/year',KILOGRAMS:'kg',KILOGRAM:'kg',KG:'kg',KILOTONNES:'kt',MEGATONNES:'Mt',MILLION_TONNES:'million tonnes',MILLION_TONS:'million tons'};
 return known[key]||raw.replace(/_/g,' ').replace(/\s+/g,' ').trim();
}
function authorityOf(record,fallback){
 const raw=record&&typeof record==='object'?
  (record.authority||record.valueAuthority||record.provenance?.quantityAuthority||record.provenance?.authority||record.status||''): '';
 const token=String(raw||'').toUpperCase();
 if(/OBSERVED|MEASURED|REPORTED|VERIFIED_SOURCE/.test(token))return 'OBSERVED';
 if(/SIMULAT|GAMEPLAY|MODELLED|MODELED|ESTIMAT|INFERRED/.test(token))return 'SIMULATED';
 if(/UNOBSERVED|UNVERIFIED|NOT_SET|NOT_SPECIFIED/.test(token))return fallback||'';
 return fallback||'';
}
function authorityLabel(authority){
 if(authority==='OBSERVED')return 'Observed';
 if(authority==='SIMULATED')return 'Gameplay estimate';
 if(authority==='RECORDED')return 'Site record';
 return '';
}
function makeMeasure(value,unit,fallbackAuthority,authorityRecord){
 let raw=value,measureUnit=unit||'',record=authorityRecord||value;
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  record=value;
  raw=value.value??value.quantity??value.amount??value.rate??value.annual??value.estimate??value.nominal;
  measureUnit=measureUnit||value.unit||value.units||value.measurementUnit||'';
 }
 if(!hasValue(raw))return null;
 const unitText=formatUnit(measureUnit),rawText=formatScalar(raw);
 const embeddedUnit=typeof raw==='string'&&/[a-z%µ\/³]/i.test(raw.trim());
 if(!unitText&&!embeddedUnit)return null;
 const alreadyHasUnit=unitText&&String(rawText).toLowerCase().includes(unitText.toLowerCase());
 return {text:rawText+(unitText&&!alreadyHasUnit?(unitText==='%'?'':' ')+unitText:''),authority:authorityOf(record,fallbackAuthority)};
}
function detailRow(label,value,unit,fallbackAuthority){
 let text='',authority='';
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const measured=makeMeasure(value,unit,fallbackAuthority);
  text=measured?.text||humanize(value);authority=measured?.authority||authorityOf(value,fallbackAuthority);
 }else if(typeof value==='number'||(typeof value==='string'&&/^-?\d[\d,]*(\.\d+)?$/.test(value.trim()))){
  if(!hasValue(unit))return '';
  const unitText=formatUnit(unit);text=formatScalar(value)+(unitText==='%'?'':' ')+unitText;authority=fallbackAuthority||'';
 }else{
  text=humanize(value);authority=fallbackAuthority||'';
  if(text&&hasValue(unit)){const unitText=formatUnit(unit);text+=(unitText==='%'?'':' ')+unitText;}
 }
 if(!text)return '';
 const auth=authorityLabel(authority);
 return '<div class="omega-site-row"><span class="omega-site-row-label">'+esc(label)+'</span><span class="omega-site-row-value">'+esc(text)+(auth?'<small class="omega-site-authority">'+esc(auth)+'</small>':'')+'</span></div>';
}
function section(title,body){
 return body?'<section class="omega-site-section"><h4>'+esc(title)+'</h4>'+body+'</section>':'';
}
function renderRows(rows){
 return rows.filter(Boolean).length?'<div class="omega-site-rows">'+rows.filter(Boolean).join('')+'</div>':'';
}
function badge(label,kind){
 if(!hasValue(label))return '';
 return '<span class="omega-site-badge '+(kind?'omega-site-badge--'+esc(kind):'')+'">'+esc(label)+'</span>';
}
function renderChips(values){
 let items=[];
 if(Array.isArray(values))items=values.map(humanize).filter(Boolean);
 else if(values&&typeof values==='object'){
  const preferred=values.items||values.outputs||values.sectors||values.values;
  if(Array.isArray(preferred))items=preferred.map(humanize).filter(Boolean);
  else {const label=humanize(values);if(label)items=[label];}
 }else{const label=humanize(values);if(label)items=[label];}
 return items.length?'<div class="omega-site-chip-list">'+items.slice(0,8).map(x=>'<span class="omega-site-chip">'+esc(x)+'</span>').join('')+'</div>':'';
}
function routeCard(route,index){
 const row=route&&typeof route==='object'?route:{name:route};
 const title=row.routeName||row.name||row.label||('Route '+(index+1));
 const rows=[
  detailRow('Mode',row.mode||row.transportMode||row.method),
  detailRow('From',row.origin||row.from||row.source||row.startLocation),
  detailRow('To',row.destination||row.to||row.target||row.endLocation),
  detailRow('Distance',row.distanceKm??row.distance??row.lengthKm,row.distanceKm!==undefined?'km':row.distanceUnit||''),
  detailRow('Transit time',row.transitDays??row.durationDays??row.etaDays,Number(row.transitDays??row.durationDays??row.etaDays)===1?'day':'days'),
  detailRow('Status',row.status||row.operationalStatus)
 ].filter(Boolean).join('');
 const extras=rows.length?'<div class="omega-site-rows">'+rows+'</div>':'';
 if(!humanize(title)&&!extras)return '';
 return '<article class="omega-site-route"><h5>'+esc(humanize(title)||('Route '+(index+1)))+'</h5>'+extras+'</article>';
}
function detailDatum(value,unit){
 if(value&&typeof value==='object'){
  const measured=makeMeasure(value,unit,'RECORDED');
  return measured?.text||humanize(value);
 }
 if(typeof value==='number'||(typeof value==='string'&&/^-?\d[\d,]*(\.\d+)?$/.test(value.trim()))){
  if(!hasValue(unit))return '';const unitText=formatUnit(unit);return formatScalar(value)+(unitText==='%'?'':' ')+unitText;
 }
 const text=humanize(value);
 return text&&hasValue(unit)?text+' '+formatUnit(unit):text;
}
// No country-average substitution: the panel renders values attached to the selected site identity only.
// Individual transport route & delivery is kept in a collapsed section and only uses this site's own route fields.
function renderSiteDetail(s){
 if(!s)return '<p class="omega-site-empty">Select a mine, field or deposit on the map.</p>';
 const sim=s.simulation||{},real=s.real||{},loc=s.location||{},coords=s.coordinates||loc.coordinates||{};
 const source=s.sourceSiteRecord||{},identity=s.identity||{};
 const operation=s.operation||s.operationProfile||source.operation||{},ownership=s.ownership||source.ownership||{};
 const processing=s.processing||source.processing||{},quantitative=s.quantitative||source.quantitative||{};
 const production=quantitative.production||{},grade=quantitative.grade||{},purity=quantitative.purity||{};
 const recovery=quantitative.recovery||{},throughput=quantitative.throughput||{},capacity=quantitative.capacity||{};
 const commodity=real.resourceId||source.resourceId||source.resourceTypeId||source.resId||identity.resourceTypeId;
 const country=loc.countryName||s.countryName||source.countryName||s.countryId||source.countryCode;
 const region=[loc.locality,loc.adminRegion,loc.region,source.region].filter((x,i,a)=>hasValue(x)&&a.indexOf(x)===i).map(humanize);
 const locationText=region.join(', ');
 const siteStatus=real.operationStatus||operation.operationalStatus||operation.status||source.status;
 const statusText=humanize(siteStatus);
 const method=real.extractionMethod||operation.extractionMethod||operation.method||source.extractionMethod;
 const header='<header class="omega-site-hero"><h3>'+esc(s.siteName||s.name||'Resource deposit')+'</h3><div class="omega-site-badges">'+badge(humanize(commodity)||'Resource deposit','resource')+badge(humanize(country),'country')+(statusText?badge(statusText,'status'):'')+'</div>'+(locationText?'<p class="omega-site-location">'+esc(locationText)+'</p>':'')+'</header>';
 const metrics=[];
 const reserve=sim.reserve??sim.recoverableReserve??quantitative.reserve??source.reserve;
 const reserveFallback=(sim.reserve!==undefined||sim.recoverableReserve!==undefined)?'SIMULATED':'RECORDED';
 const reserveMetric=makeMeasure(reserve,sim.reserveUnit||sim.recoverableReserveUnit||quantitative.reserve?.unit||source.reserve?.unit||'',reserveFallback);
 if(reserveMetric)metrics.push({label:'Resource reserve',...reserveMetric});
 const daily=production.rate??sim.productionRate;
 const dailyUnit=production.unit||sim.productionRateUnit||'';
 const dailyFallback=production.rate!==undefined?'RECORDED':'SIMULATED';
 const dailyMetric=makeMeasure(daily,dailyUnit,dailyFallback,production);
 if(dailyMetric)metrics.push({label:'Daily output',...dailyMetric});
 const annual=production.annual??sim.annualProduction;
 const annualUnit=production.annualUnit||sim.annualProductionUnit||'';
 const annualMetric=makeMeasure(annual,annualUnit,production.annual!==undefined?'RECORDED':'SIMULATED',production);
 if(annualMetric)metrics.push({label:'Annual output',...annualMetric});
 const gradeRaw=grade.value??sim.grade?.value;
 const gradeUnit=grade.unit||sim.grade?.unit||'';
 const gradeMetric=makeMeasure(gradeRaw,gradeUnit,grade.value!==undefined?'RECORDED':'SIMULATED',grade);
 if(gradeMetric)metrics.push({label:'Grade',...gradeMetric});
 const purityRaw=purity.value??sim.purity?.value;
 const purityMetric=makeMeasure(purityRaw,purity.unit||sim.purity?.unit||'%',purity.value!==undefined?'RECORDED':'SIMULATED',purity);
 if(purityMetric)metrics.push({label:'Purity',...purityMetric});
 let recoveryRaw=recovery.value;
 let recoveryFallback=recovery.value!==undefined?'RECORDED':'SIMULATED';
 if(recoveryRaw===undefined&&sim.recovery!==undefined){
  const numeric=Number(sim.recovery);
  recoveryRaw=Number.isFinite(numeric)?numeric*100:sim.recovery;
 }
 const recoveryMetric=makeMeasure(recoveryRaw,recovery.unit||'%',recoveryFallback,recovery);
 if(recoveryMetric)metrics.push({label:'Recovery',...recoveryMetric});
 const throughputMetric=makeMeasure(throughput.value??sim.dailyThroughput,throughput.unit||sim.dailyThroughputUnit||'',throughput.value!==undefined?'RECORDED':'SIMULATED',throughput);
 if(throughputMetric)metrics.push({label:'Daily throughput',...throughputMetric});
 const utilization=sim.utilization;
 const utilizationMetric=utilization===undefined?null:makeMeasure(Number(utilization)*100,'%','SIMULATED');
 if(utilizationMetric)metrics.push({label:'Utilization',...utilizationMetric});
 const metricHtml=metrics.length?'<section class="omega-site-section"><h4>Resource & production</h4><div class="omega-site-metrics">'+metrics.map(metric=>'<article class="omega-site-metric"><span>'+esc(metric.label)+'</span><strong>'+esc(metric.text)+'</strong>'+(authorityLabel(metric.authority)?'<small>'+esc(authorityLabel(metric.authority))+'</small>':'')+'</article>').join('')+'</div></section>':'<p class="omega-site-data-note">No reserve or output figures are recorded for this site yet. Missing values are hidden rather than presented as zero.</p>';
 const operatingRows=renderRows([
  detailRow('Operational status',siteStatus),
  detailRow('Extraction method',method),
  detailRow('Owner',ownership.owner||real.owner||source.owner),
  detailRow('Operator',ownership.operator||real.operator||source.operator)
 ]);
 const capacityValues=[
  detailRow('Minimum daily capacity',capacity.minimum??sim.minimumDailyCapacity,capacity.unit||sim.productionRateUnit||''),
  detailRow('Nominal daily capacity',capacity.nominal??sim.nominalDailyCapacity,capacity.unit||sim.productionRateUnit||''),
  detailRow('Maximum daily capacity',capacity.maximum??sim.maximumDailyCapacity,capacity.unit||sim.productionRateUnit||'')
 ].filter(Boolean).join('');
 const operationHtml=section('Operations',operatingRows+renderRows([capacityValues]));
 const routesValue=sim.transportRoute||sim.transportRoutes||s.transportRoute||s.logistics?.routes||source.logistics?.routes||s.routes;
 const routeList=Array.isArray(routesValue)?routesValue:(hasValue(routesValue)?[routesValue]:[]);
 const routeHtml=routeList.map(routeCard).filter(Boolean).slice(0,4).join('');
 const upstream=processing.upstreamProcess||sim.upstreamProcess||source.upstreamProcess;
 const midstream=processing.midstreamProcess||sim.midstreamProcess||source.midstreamProcess;
 const outputs=processing.refinedOutputs||processing.factoryOutputs||sim.factoryOutputs||source.factoryOutputs;
 const downstream=processing.downstreamSectors||source.downstreamSectors;
 const processingHtml=renderRows([
  detailRow('Upstream process',upstream),
  detailRow('Midstream process',midstream),
  detailRow('Downstream sectors',downstream)
 ])+(renderChips(outputs)?'<div class="omega-site-output"><span class="omega-site-row-label">Potential outputs</span>'+renderChips(outputs)+'</div>':'');
 const detailSections=[];
 if(operationHtml)detailSections.push('<details class="omega-site-details"><summary>Operating details</summary>'+operationHtml+'</details>');
 if(routeHtml)detailSections.push('<details class="omega-site-details"><summary>Transport & routes</summary><div class="omega-site-route-list">'+routeHtml+'</div><p class="omega-site-muted">Only routes attached to this individual site are shown.</p></details>');
 if(processingHtml)detailSections.push('<details class="omega-site-details"><summary>Processing & factory outputs</summary>'+processingHtml+'</details>');
 const facts=Array.isArray(s.observedFacts)?s.observedFacts:(Array.isArray(source.observedFacts)?source.observedFacts:[]);
 const factRows=facts.map(f=>{
  if(!f||typeof f!=='object'||!hasValue(f.metric)||!hasValue(f.value))return '';
  const val=detailDatum(f.value,f.unit);
  return val?detailRow(humanize(f.metric),val,'',authorityOf(f,'')):'';
 }).filter(Boolean);
 if(factRows.length)detailSections.push('<details class="omega-site-details"><summary>Reported site facts</summary>'+renderRows(factRows)+'</details>');
 const coordinateStatus=coordinateStatusOf(s);
 const sourceRef=s.sourcePath||s.sourceReference?.source||s.sourceReference?.path||s.sourceReference?.url?.uri||s.sourceReference?.url||source.sourcePath||source.source||source.provenance?.source;
 const provenanceRows=[
  '<div class="omega-site-row"><span class="omega-site-row-label">Site ID</span><span class="omega-site-row-value"><code>'+esc(s.siteId||'')+'</code></span></div>',
  detailRow('Data source',sourceRef||'Resource site registry'),
  detailRow('Coordinate confidence',coordinateStatus),
  Number.isFinite(Number(coords.lat))&&Number.isFinite(Number(coords.lng))?detailRow('Coordinates',Number(coords.lat).toFixed(4)+', '+Number(coords.lng).toFixed(4)):''
 ].filter(Boolean).join('');
 detailSections.push('<details class="omega-site-details"><summary>Data quality & source</summary>'+renderRows([provenanceRows])+'<p class="omega-site-muted">Observed facts and gameplay estimates are labelled separately. Unavailable figures are not treated as zero.</p></details>');
 return header+metricHtml+'<div class="omega-site-detail-sections">'+detailSections.join('')+'</div>';
}
function detail(s){
 if(!detailNode)return;
 detailNode.innerHTML=renderSiteDetail(s);
}
g.Omega=g.Omega||{};
g.Omega.IndividualResourceSitePresentation={render:renderSiteDetail};
function setSelected(id){
 const s=sites.find(x=>x.siteId===id);if(!s)return;
 selected=id;if(selectNode)selectNode.value=id;detail(s);if(panel)panel.style.display='block';
 const c=s.coordinates||s.location?.coordinates||{};
 const map=g.Game?.Map?.map||g.map;
 if(map&&Number.isFinite(Number(c.lat))&&Number.isFinite(Number(c.lng))&&typeof map.setView==='function')map.setView([Number(c.lat),Number(c.lng)],Math.max(7,Number(map.getZoom?.()||4)));
 g.dispatchEvent?.(new CustomEvent('OMEGA_RESOURCE_SITE_SELECTED',{detail:{siteId:s.siteId,countryId:s.countryId,resourceId:s.real?.resourceId||s.sourceSiteRecord?.resourceId}}));
}

// Discover individual resource assets directly from the user's authoritative JSON files.
// A record is eligible only when it has its own identity, commodity, country and coordinates.
const SITE_COLLECTION_KEY=/^(mineSites|resourceSites|extractionSites|miningSites|mineralSites|oilFields|gasFields|quarries|mines|wells|resourceAssets|runtime_deposits)$/i;
const asText=v=>String(v??'').trim();
function coordsOf(s){
 const c=s?.coordinates||s?.location?.coordinates||s?.locationIdentity?.coordinates||s?.siteDataPackage?.location?.coordinates||s?.sourceSiteRecord?.coordinates||{};
 const lat=Number(c.lat??c.latitude??s?.lat??s?.latitude??s?.sourceSiteRecord?.lat);
 const lng=Number(c.lng??c.lon??c.longitude??s?.lng??s?.lon??s?.longitude??s?.sourceSiteRecord?.lng);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180?{lat,lng}:null;
}
function coordinateStatusOf(site){
 const s=site||{},source=s.sourceSiteRecord||{},real=s.real||{},loc=s.location||{};
 return String(
  loc.coordinateStatus||real.location?.coordinateStatus||
  source.locationIdentity?.coordinateStatus||source.dataStatus?.location||
  source.provenance?.coordinateStatus||'SOURCE_STATUS_UNSPECIFIED'
 ).trim().toUpperCase();
}
function normalizeSourceSite(raw,countryHint){
 if(!raw||typeof raw!=='object')return null;
 const p=raw.siteDataPackage||raw;
 const identity=raw.identity||p.identity||raw.siteIdentity||{};
 const loc=raw.location||p.location||raw.locationIdentity||{};
 const coords=coordsOf(raw)||coordsOf(p)||coordsOf(loc);
 const countryId=cid(raw.countryId||raw.countryCode||raw.country||identity.countryIso3||identity.countryId||loc.countryIso3||countryHint);
 const siteId=asText(raw.siteId||raw.id||raw.assetId||raw.occurrenceKey||p.siteId||identity.siteId);
 const siteName=asText(raw.siteName||raw.name||raw.title||p.siteName||identity.siteName);
 const resourceId=asText(raw.resourceId||raw.resourceTypeId||raw.resourceTypeKey||raw.resId||raw.resource||raw.commodity||identity.resourceTypeId||identity.resourceId||p.resourceId||p.resourceTypeId);
 if(!coords||!countryId||!resourceId||(!siteId&&!siteName))return null;
 // Source discovery returns a normalized candidate. Preserve its original JSON object
 // instead of nesting the candidate as though it were a raw deposit/site record.
 const nestedSource=raw.sourceSiteRecord&&typeof raw.sourceSiteRecord==='object'?raw.sourceSiteRecord:null;
 const sourceRecord=nestedSource&&nestedSource.sourceSiteRecord&&typeof nestedSource.sourceSiteRecord==='object'
  ?nestedSource.sourceSiteRecord:(nestedSource||raw);
 const stableId=siteId||('SITE_'+countryId+'_'+siteName.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
 return {siteId:stableId,countryId,siteName:siteName||stableId,real:{...(raw.real||{}),resourceId},sourceSiteRecord:sourceRecord,coordinates:coords,
  location:{
   ...loc,
   countryName:loc.countryName||raw.countryName||sourceRecord.countryName||(sourceRecord.country&&sourceRecord.country.length>3?sourceRecord.country:''),
   coordinateStatus:loc.coordinateStatus||raw.real?.location?.coordinateStatus||sourceRecord.locationIdentity?.coordinateStatus||sourceRecord.dataStatus?.location||sourceRecord.provenance?.coordinateStatus||'SOURCE_STATUS_UNSPECIFIED',
   coordinates:coords,
   locality:loc.locality||raw.region||raw.adminRegion||sourceRecord.region||''
  },
  identity:{...identity,countryIso3:countryId,resourceTypeId:resourceId,siteType:identity.siteType||raw.siteType||raw.type||'RESOURCE_SITE'},
  operation:raw.operation||p.operation||raw.extractionProfile||null,processing:raw.processing||p.processing||raw.extractionProfile?.processing||null};
}
function discoverSourceSites(root){
 const found=[],seenObjects=new Set();
 function walk(node,path,countryHint,insideSiteCollection){
  if(!node||typeof node!=='object'||seenObjects.has(node))return;
  seenObjects.add(node);
  if(Array.isArray(node)){for(const item of node)walk(item,path,countryHint,insideSiteCollection);return;}
  const country=cid(node.countryId||node.countryCode||node.identity?.countryIso3||node.identity?.countryId||node.identity?.countryCode||node.siteDataPackage?.identity?.countryIso3||countryHint);
  if(insideSiteCollection){
   const normalized=normalizeSourceSite(node,country);
   if(normalized)found.push(normalized);
  }
  for(const [key,value] of Object.entries(node)){
   if(value&&typeof value==='object'){
    const inCollection=insideSiteCollection||SITE_COLLECTION_KEY.test(key);
    walk(value,path+'.'+key,country,inCollection);
   }
  }
 }
 walk(root,'', '',false);
 return found;
}
function scheduleMarkerRender(attempt=0){
 const map=g.Game?.Map?.map||g.map;
 if(map&&g.L){addMapMarkers();map.whenReady?.(()=>addMapMarkers());return;}
 if(attempt<12)setTimeout(()=>scheduleMarkerRender(attempt+1),500);
}

function addMapMarkers(){
 const map=g.Game?.Map?.map||g.map,L=g.L;
 if(!map||!L||typeof L.marker!=='function'||typeof L.divIcon!=='function')return;
 if(!map.__omegaIndividualCollisionRefreshBound&&typeof map.on==='function'){
  map.on('zoomend',addMapMarkers);map.on('moveend',addMapMarkers);
  map.__omegaIndividualCollisionRefreshBound=true;
 }
 if(markerLayer&&map.hasLayer?.(markerLayer))map.removeLayer(markerLayer);
 markerLayer=L.layerGroup();
 const mapApi=g.Game?.Map||{},resourceState=mapApi.resourceState||{};
 // The legacy deposit layer duplicates many of these locations. The individual-site layer is authoritative while resource mode is active.
 if(resourceState.enabled&&mapApi.resourceDepositsLayer?.clearLayers)mapApi.resourceDepositsLayer.clearLayers();
 if(!resourceState.enabled)return;
 const scope=String(resourceState.scope||'NATION').toUpperCase();
 const activeCountry=String(g.Game?.currentActiveCountry||g.CountryIOS?.activeCountry||'').trim();
 if(scope!=='WORLD'&&!activeCountry)return;
 const norm=v=>String(v||'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
 const aliases={oil:'crude_oil',crudeoil:'crude_oil',gas:'natural_gas',naturalgas:'natural_gas',iron:'iron_ore',ironore:'iron_ore',rareearth:'rare_earth'};
 const canonical=id=>{const raw=String(id||'').trim().toLowerCase();const compact=raw.replace(/[\s_-]+/g,'');return aliases[compact]||raw.replace(/[\s-]+/g,'_');};
 const selected=resourceState.selectedResources instanceof Set?resourceState.selectedResources:new Set();
 const selectedKeys=new Set(Array.from(selected,canonical));
 const selectedAll=selectedKeys.has('all');
 const resourceCatalog=mapApi.resourceCatalog||g.Game?.resourceCatalog||[];
 const visibleSites=sites.filter(s=>{
  const c=s.coordinates||s.location?.coordinates||{},lat=Number(c.lat),lng=Number(c.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)return false;
  const rawResource=String(s.real?.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||s.sourceSiteRecord?.resId||s.identity?.resourceTypeId||'').toLowerCase();
  const resourceId=canonical(rawResource);
  if(selected.size>0&&!selectedAll&&!selectedKeys.has(resourceId)&&!selectedKeys.has(canonical(rawResource)))return false;
  if(scope!=='WORLD'){
   const candidateCountries=[s.countryId,s.countryName,s.location?.countryName,s.sourceSiteRecord?.country,s.sourceSiteRecord?.countryCode,s.sourceSiteRecord?.countryId].map(norm).filter(Boolean);
   if(!candidateCountries.includes(norm(activeCountry)))return false;
  }
  return true;
 });
 // Cluster markers by their current screen-space proximity, not just identical coordinates.
 // The visual offsets never modify a site's true latitude or longitude.
 const collisionGroups=[],collisionGroupBySite=new Map();
 for(const site of visibleSites){
  const c=site.coordinates||site.location?.coordinates||{},lat=Number(c.lat),lng=Number(c.lng);
  const point=typeof map.latLngToLayerPoint==='function'?map.latLngToLayerPoint([lat,lng]):{x:lng,y:lat};
  let group=collisionGroups.find(items=>items.some(item=>Math.hypot(item.point.x-point.x,item.point.y-point.y)<30));
  if(!group){group=[];collisionGroups.push(group);}
  group.push({site,point});collisionGroupBySite.set(site.siteId,group);
 }
 let rendered=0,offsetMarkerCount=0,overlapGroupCount=0;
 const renderedCoordinateKeys=new Set();
 for(const s of visibleSites){
  const c=s.coordinates||s.location?.coordinates||{},lat=Number(c.lat),lng=Number(c.lng);
  const rawResource=String(s.real?.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||s.sourceSiteRecord?.resId||s.identity?.resourceTypeId||'').toLowerCase();
  const resourceId=canonical(rawResource);
  const resource=resourceCatalog.find(r=>canonical(r.id)===resourceId||String(r.id||'').toLowerCase()===rawResource);
  const glyph=String(resource?.icon||resourceId.slice(0,2).toUpperCase()||'RS').replace(/[<>&"]/g,'');
  const color=/^#[0-9a-f]{6}$/i.test(resource?.color||'')?resource.color:'#76b7d8';
  const group=collisionGroupBySite.get(s.siteId)||[{site:s}],position=group.findIndex(item=>item.site.siteId===s.siteId);
  let dx=0,dy=0;
  if(group.length>1){
   renderedCoordinateKeys.add(group.map(item=>item.site.siteId).sort().join('|'));
   const radius=Math.max(20,14/Math.sin(Math.PI/group.length)+2);
   const angle=(Math.max(0,position)*(2*Math.PI/group.length))-(Math.PI/2);
   dx=Math.round(Math.cos(angle)*radius);dy=Math.round(Math.sin(angle)*radius);offsetMarkerCount++;
  }
  const icon=L.divIcon({className:'omega-individual-site-marker',html:'<span style="--site-color:'+color+'">'+esc(glyph)+'</span>',iconSize:[26,26],iconAnchor:[13-dx,13-dy],tooltipAnchor:[-dx,-12-dy]});
  const m=L.marker([lat,lng],{icon,title:String(s.siteName||s.siteId),keyboard:true,alt:String(s.siteName||s.siteId)});
  m.bindTooltip?.(String(s.siteName||s.siteId)+' · '+s.countryId+' · '+rawResource,{direction:'top',sticky:true});
  m.on('click',()=>setSelected(s.siteId));m.addTo(markerLayer);rendered++;
 }
 markerLayer.addTo(map);
 g.__OMEGA_INDIVIDUAL_RESOURCE_MARKER_DIAGNOSTICS__={loadedSiteCount:sites.length,renderedMarkerCount:rendered,scope,activeCountry:activeCountry||null,resourceFilterCount:selected.size,overlapGroupCount:renderedCoordinateKeys.size,offsetMarkerCount};
}
function attachMapRefreshHooks(){
 const targets=[
  {object:g.Game?.Map,names:['renderResourceDeposits','setResourceScope','applyResourceMapFilter','applyMultiResourceFilter','handleResourceCheckboxChange','toggleResourceMode','toggleResourceOverlay','toggleResourceChip','selectResourcePreset','applyResourceFilterAndClose','clearAndResetResourceMode','toggleResourceType','toggleResourceCheckbox','selectAllResourceTypes','deselectAllResourceTypes','renderResourceCheckboxesInPanel']},
  {object:g.CountryIOS,names:['open']}
 ];
 for(const target of targets){
  const object=target.object;if(!object)continue;
  for(const name of target.names){
   const original=object[name];
   if(typeof original!=='function'||original.__omegaSiteRefreshWrapped)continue;
   const wrapped=function(...args){
    const result=original.apply(this,args);
    setTimeout(()=>addMapMarkers(),0);
    return result;
   };
   wrapped.__omegaSiteRefreshWrapped=true;
   object[name]=wrapped;
  }
 }
}
function show(){
 if(!panel)return;panel.style.display=panel.style.display==='none'?'block':'none';
}
function findOccurrence(s,refs){
 const ids=new Set([s.siteId,s.sourceSiteRecord?.id,s.sourceSiteRecord?.linkedDepositId,s.sourceSiteRecord?.depositKey,s.sourceSiteRecord?.occurrenceKey].filter(Boolean).map(String));
 return refs.find(r=>[r.siteId,r.siteReferenceKey,r.id,r.occurrenceKey,r.depositKey,r.linkedDepositId,r.canonicalOccurrenceId].some(x=>x!=null&&ids.has(String(x))))||null;
}
async function plan(){
 const s=chosenSite();if(!s)return setStatus('Select a resource site first.');
 const net=api();if(!net)return setStatus('Extraction planning is unavailable right now.');
 const r=await net.loadCatalog?.();if(r?.status==='FAILED')return setStatus('Resource data is not ready for an extraction plan.');
 const out=net.planExtraction({countryId:s.countryId,siteId:s.siteId,resourceId:s.real?.resourceId||s.sourceSiteRecord?.resourceId});
 setStatus(out.status==='PLANNED'?'Extraction plan ready'+(hasValue(out.approvedQuantity)&&hasValue(out.unit)?' · '+formatScalar(out.approvedQuantity)+' '+formatUnit(out.unit):'')+(hasValue(out.totalDurationDays)?' · '+formatScalar(out.totalDurationDays)+' days':'')+'.':'Plan unavailable · '+(humanize(out.reason)||humanize(out.status)||'The engine could not confirm a valid plan.')+'.');
 g.__OMEGA_LAST_INDIVIDUAL_SITE_PLAN__=out;
}
async function execute(){
 const s=chosenSite();if(!s)return setStatus('BLOCKED: select a site first');
 const net=api();if(!net?.executeSitePipeline)return setStatus('The extraction pipeline is unavailable. Nothing was executed.');
 setStatus('Running extraction, transport and factory delivery…');
 try{
  const result=await net.executeSitePipeline({countryId:s.countryId,siteId:s.siteId,resourceId:s.real?.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||s.identity?.resourceTypeId,autoCommissionFactory:true});
  g.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__={siteId:s.siteId,result};
  if(result?.status==='IN_TRANSIT'){
   setStatus('Site pipeline committed · Shipment dispatched'+(result.shipment?.etaTurn!==undefined?' · estimated arrival turn '+formatScalar(result.shipment.etaTurn):'')+'.');
   return;
  }
  setStatus('Site pipeline '+(humanize(result?.status)||'blocked')+' · '+(humanize(result?.reason||result?.blockReason)||'The engine did not confirm a completed delivery.')+'.');
 }catch(e){
  const reason=String(e?.message||e);g.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__={siteId:s.siteId,status:'FAILED',reason};
  setStatus('Site pipeline failed · '+(humanize(reason)||'The run stopped before completion.')+'.');
 }
}
function mount(){
 if(document.getElementById('omega-individual-resource-open'))return;
 const btn=document.createElement('button');
 btn.id='omega-individual-resource-open';btn.className='omega-resource-open-button';btn.type='button';btn.textContent='Resource sites';
 btn.addEventListener('click',show);document.body.appendChild(btn);
 panel=document.createElement('section');panel.id='omega-individual-resource-panel';panel.className='omega-resource-site-panel';
 panel.innerHTML='<div class="omega-site-panel-header"><div><p class="omega-site-eyebrow">RESOURCE MAP</p><h2>Deposit details</h2></div><button id="omega-individual-close" class="omega-site-close" type="button" aria-label="Close resource details">Close</button></div>'+
  '<p id="omega-individual-status" class="omega-site-status" role="status" aria-live="polite">Loading resource site data…</p>'+
  '<label class="omega-site-select-label" for="omega-individual-select">Selected site</label>'+
  '<select id="omega-individual-select" class="omega-site-select"></select>'+
  '<div id="omega-individual-detail" class="omega-site-detail"></div>'+
  '<div class="omega-site-actions"><button id="omega-individual-plan" class="omega-site-action omega-site-action--plan" type="button">Plan extraction</button><button id="omega-individual-execute" class="omega-site-action omega-site-action--execute" type="button">Run site pipeline</button></div>';
 document.body.appendChild(panel);
 statusNode=panel.querySelector('#omega-individual-status');detailNode=panel.querySelector('#omega-individual-detail');selectNode=panel.querySelector('#omega-individual-select');
 panel.querySelector('#omega-individual-close').addEventListener('click',()=>panel.style.display='none');
 selectNode.addEventListener('change',()=>setSelected(selectNode.value));
 panel.querySelector('#omega-individual-plan').addEventListener('click',()=>void plan());
 panel.querySelector('#omega-individual-execute').addEventListener('click',()=>void execute());
}
async function init(){
 if(g.__OMEGA_RESOURCE_SITE_BINDING_INIT__)return;
 g.__OMEGA_RESOURCE_SITE_BINDING_INIT__=true;
 mount();
 try{
  const urls=['resources.json','resources_2.json',CATALOG_URL,MASTER_URL,EXPANSION_URL,...LEGACY_GAMEPLAY_URLS];
  const loaded=await Promise.all(urls.map(async url=>{
   try{const response=await fetch(url,{cache:'no-store'});if(!response.ok)return null;return {url,data:await response.json()};}
   catch(_){return null;}
  }));
  const sources=loaded.filter(Boolean);
  const getData=url=>sources.find(x=>x.url===url)?.data||null;
  const catalog=getData(CATALOG_URL),master=getData(MASTER_URL),expansion=getData(EXPANSION_URL);
  if(expansion?.datasetId==='OMEGA_RESOURCE_SITE_COUNTRY_EXPANSION_V1'){
   g.OmegaResourceSiteCountryExpansionData=expansion;g.Omega=g.Omega||{};g.Omega.ResourceSiteCountryExpansionData=expansion;
  }
  const baseCatalogSites=Array.isArray(catalog?.sites)?catalog.sites:[];
  const expansionSites=expansion?.datasetId==='OMEGA_RESOURCE_SITE_COUNTRY_EXPANSION_V1'&&Array.isArray(expansion.records)?expansion.records:[];
  const masterSites=Array.isArray(master?.sites)?master.sites:[];
  const knownSiteIds=new Set([...baseCatalogSites,...expansionSites,...masterSites].map(row=>String(row?.siteId||'')));
  const legacySiteRows=sources.filter(x=>LEGACY_GAMEPLAY_URLS.includes(x.url)).filter(x=>x.data?.datasetId?.startsWith('OMEGA_RESOURCE_SITE_LEGACY_GAMEPLAY_EXPANSION_PART_')).flatMap(x=>Array.isArray(x.data?.records)?x.data.records:[]);
   const canonicalLegacySites=Number(catalog?.legacyGameplayExpansion?.candidateRecordCount)===65?baseCatalogSites.slice(-65):baseCatalogSites.filter(row=>row?.runtime?.identityAuthority==='LEGACY_SITE_GAMEPLAY_EXPANSION_WITH_SOURCE_LINEAGE');
   const activeLegacySites=legacySiteRows.filter(row=>row?.siteId&&!row.runtime?.aliasOfSiteId&&row.map?.markerEligible!==false&&!LEGACY_CANONICAL_ALIAS_IDS[String(row.siteId)]&&!knownSiteIds.has(String(row.siteId)));
  const catalogSites=[...baseCatalogSites,...expansionSites,...activeLegacySites];
   const activeLegacyIds=new Set([...canonicalLegacySites,...activeLegacySites].filter(row=>row?.siteId&&row.map?.markerEligible!==false&&!row.runtime?.aliasOfSiteId&&!LEGACY_CANONICAL_ALIAS_IDS[String(row.siteId)]).map(row=>String(row.siteId)));
   const candidateReady=legacySiteRows.length===115&&activeLegacyIds.size===105;
   g.OmegaResourceLegacyGameplayExpansion={status:candidateReady?'READY':'PARTIAL',count:Math.max(legacySiteRows.length,canonicalLegacySites.length),candidateRecordCount:115,activeCandidateCount:activeLegacyIds.size,aliasCount:legacySiteRows.filter(row=>row.runtime?.aliasOfSiteId||row.map?.markerEligible===false).length,canonicalCandidateCount:canonicalLegacySites.length,loadedParts:sources.filter(x=>LEGACY_GAMEPLAY_URLS.includes(x.url)&&x.data?.records).length};
  g.Omega=g.Omega||{};g.Omega.ResourceLegacyGameplayExpansion=g.OmegaResourceLegacyGameplayExpansion;
  const masterById=new Map(masterSites.map(s=>[String(s.siteId),s]));
  const catalogById=new Map(catalogSites.map(s=>[String(s.siteId),s]));
  const discovered=sources.filter(x=>x.url==='resources.json'||x.url==='resources_2.json').flatMap(x=>discoverSourceSites(x.data));
  const candidates=[...catalogSites.map(s=>normalizeSourceSite(s,s.countryId)||s),...masterSites.map(s=>normalizeSourceSite(s,s.countryId)||s),...discovered];
  const byId=new Map(),physicalIndex=new Map();
  let mergedDepositAliases=0;
  for(const candidate of candidates){
   const normalized=normalizeSourceSite(candidate,candidate.countryId)||candidate;
   const id=String(normalized.siteId||'').trim(),coords=coordsOf(normalized);
   if(!id||!coords||!normalized.countryId)continue;
    if(normalized.runtime?.aliasOfSiteId||LEGACY_CANONICAL_ALIAS_IDS[id]||normalized.map?.markerEligible===false)continue;
   const masterRow=masterById.get(id)||{},catalogRow=catalogById.get(id)||{};
   const source=normalized.sourceSiteRecord||normalized;
   const resourceId=normalized.real?.resourceId||source.resourceId||source.resourceTypeId||source.resourceTypeKey||source.resId||catalogRow.identity?.resourceTypeId||'unknown';
   const countryId=cid(normalized.countryId||masterRow.countryId||catalogRow.countryId);
   const physicalKey=[countryId,String(resourceId).toLowerCase(),coords.lat.toFixed(4),coords.lng.toFixed(4)].join('|');
   const isDeposit=/^dep[-_]/i.test(String(source.id||id));
   const samePhysicalSite=isDeposit?physicalIndex.get(physicalKey):null;
   if(samePhysicalSite&&byId.has(samePhysicalSite)){
    const existing=byId.get(samePhysicalSite);
    existing.sourceDepositRecords=[...(existing.sourceDepositRecords||[]),source];
    existing.depositAliases=[...(existing.depositAliases||[]),id];
    mergedDepositAliases++;
    continue;
   }
   byId.set(id,{
    ...catalogRow,...masterRow,...normalized,
    siteId:id,countryId,
    siteName:normalized.siteName||masterRow.siteName||catalogRow.siteName||id,
    real:{...(catalogRow.real||{}),...(masterRow.real||{}),...(normalized.real||{}),resourceId},
    sourceSiteRecord:source,
    coordinates:coords,
    location:{...(catalogRow.location||{}),...(masterRow.location||{}),...(normalized.location||{}),coordinates:coords},
    identity:{...(catalogRow.identity||{}),...(masterRow.identity||{}),...(normalized.identity||{}),countryIso3:countryId,resourceTypeId:resourceId},
    operation:normalized.operation||source.operation||masterRow.operation||catalogRow.operation||{},
    ownership:normalized.ownership||source.ownership||masterRow.ownership||catalogRow.ownership||{},
    quantitative:normalized.quantitative||source.quantitative||masterRow.quantitative||catalogRow.quantitative||{},
    simulation:normalized.simulation||source.simulation||masterRow.simulation||catalogRow.simulation||{},
    logistics:normalized.logistics||source.logistics||masterRow.logistics||catalogRow.logistics||{},
    processing:normalized.processing||source.processing||masterRow.processing||catalogRow.processing||{},
    map:normalized.map||source.map||catalogRow.map||{},
    runtime:normalized.runtime||source.runtime||catalogRow.runtime||{},
    observedFacts:normalized.observedFacts||source.observedFacts||catalogRow.observedFacts||[],
    sources:normalized.sources||source.sources||catalogRow.sources||[]
   });
   if(!isDeposit)physicalIndex.set(physicalKey,id);
  }
  sites=[...byId.values()];
  const mapApi=g.Game?.Map,resourceState=mapApi?.resourceState,resourceCatalog=mapApi?.resourceCatalog;
  if(Array.isArray(resourceCatalog)){
   const known=new Set(resourceCatalog.map(r=>String(r.id||'').toLowerCase()));
   for(const resourceId of new Set(sites.map(s=>String(s.real?.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||s.sourceSiteRecord?.resId||s.identity?.resourceTypeId||'').trim().toLowerCase()).filter(Boolean))){
    if(known.has(resourceId))continue;
    resourceCatalog.push({id:resourceId,name:resourceId.replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),icon:resourceId.split(/[_-]+/).map(part=>part.slice(0,1)).join('').toUpperCase().slice(0,3)||'RS',color:'#76b7d8'});
    known.add(resourceId);
   }
  }
  if(resourceState?.__omegaDefaultSelection&&resourceState.selectedResources instanceof Set){
   for(const s of sites){
    const id=String(s.real?.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||s.sourceSiteRecord?.resId||s.identity?.resourceTypeId||'').trim().toLowerCase();
    if(id)resourceState.selectedResources.add(id);
   }
  }
  if(!sites.length)throw new Error('NO_INDIVIDUAL_RESOURCE_SITES_WITH_VALID_COORDINATES');
  if(new Set(sites.map(s=>s.siteId)).size!==sites.length)throw new Error('INDIVIDUAL_SITE_IDENTITY_NOT_UNIQUE');
  sites.sort((a,b)=>a.countryId.localeCompare(b.countryId)||a.siteName.localeCompare(b.siteName));
  selectNode.innerHTML=sites.map(s=>'<option value="'+esc(s.siteId)+'">'+esc((s.siteName||s.name||'Resource site')+' · '+humanize(s.location?.countryName||s.countryName||s.countryId)+' · '+humanize(s.real?.resourceId||s.sourceSiteRecord?.resourceId||s.identity?.resourceTypeId||'Resource'))+'</option>').join('');
  selected=sites[0].siteId;selectNode.value=selected;detail(chosenSite());
  g.Omega=g.Omega||{};
  g.Omega.IndividualResourceSiteBinding={version:VERSION,sites,select:setSelected,refresh:addMapMarkers,diagnostics:()=>{
   const coordinateStatusCounts={};
   for(const site of sites){const status=coordinateStatusOf(site);coordinateStatusCounts[status]=(coordinateStatusCounts[status]||0)+1;}
   const sourceRecordCounts=sources.reduce((counts,source)=>{
    if(source.url==='resources.json'||source.url==='resources_2.json'){
     const profiles=source.data?.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{};
     counts.mineSites+=Object.values(profiles).reduce((sum,profile)=>sum+(Array.isArray(profile?.resource_infrastructure_context?.mineSites)?profile.resource_infrastructure_context.mineSites.length:0),0);
     counts.runtimeDeposits+=Array.isArray(source.data?.runtime_deposits)?source.data.runtime_deposits.length:0;
    }
    return counts;
   },{mineSites:0,runtimeDeposits:0});
   return {status:'READY',siteCount:sites.length,uniqueSiteIds:new Set(sites.map(s=>s.siteId)).size,countryCount:new Set(sites.map(s=>s.countryId)).size,sourceFiles:sources.map(x=>x.url),sourceRecordCounts,coordinateStatusCounts,mergedDepositAliases,individualMapping:true};
  }};
  attachMapRefreshHooks();scheduleMarkerRender();setTimeout(()=>scheduleMarkerRender(),1000);setTimeout(()=>scheduleMarkerRender(),3000);
  setStatus('Resource site data loaded.');
 }catch(e){setStatus('Resource site data could not be loaded · '+(humanize(e?.message)||'an unexpected loading error')+'.');g.OmegaIndividualResourceSiteBindingError=String(e?.message||e);g.__OMEGA_RESOURCE_SITE_BINDING_INIT__=false;}
}
g.addEventListener?.('OMEGA_READY',()=>void init());
g.addEventListener?.('load',()=>setTimeout(()=>{if(!g.__OMEGA_RESOURCE_SITE_BINDING_INIT__)void init();else scheduleMarkerRender();},500));
})(typeof window!=='undefined'?window:globalThis);
