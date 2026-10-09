/* OMEGA INDIVIDUAL RESOURCE SITE GAMEPLAY BINDING
 * This UI is intentionally site-ID keyed. It never substitutes country averages for a selected site.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const CATALOG_URL='resource_site_canonical_catalog_v1.json';
const MASTER_URL='resource_site_master_registry_v1.json';
let sites=[], selected=null, markers=[], markerLayer=null, panel=null, statusNode=null, detailNode=null, selectNode=null, searchNode=null;
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const state=()=>g.Game?.state||g.gameState||{};
const api=()=>g.Omega?.ResourceIndustrialNetwork||g.OmegaResourceIndustrialNetwork;
const endowment=()=>g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime;
const cid=v=>String(v||'').trim().toUpperCase();
function setStatus(s){if(statusNode)statusNode.textContent=String(s||'');}
function chosenSite(){return sites.find(s=>s.siteId===selected)||null;}
function renderSiteSearch(query=''){
 if(!selectNode)return;
 const q=String(query||'').trim().toLowerCase();
 const matches=sites.filter(s=>!q||[s.siteName,s.siteId,s.countryId,s.location?.countryName,s.real?.resourceId,s.identity?.resourceTypeId,s.sourceSiteRecord?.rawCommodity].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,100);
 selectNode.innerHTML=matches.map(s=>'<option value="'+esc(s.siteId)+'">'+esc(s.countryId+' · '+s.siteName+' · '+(s.real?.resourceId||'?'))+'</option>').join('');
 if(selected&&matches.some(s=>s.siteId===selected))selectNode.value=selected;
 if(q&&matches.length===100)setStatus('Search is limited to the first 100 matches. Refine the search to narrow results.');
 else if(q&&!matches.length)setStatus('No site matches this search.');
}
function displayValue(value){
 if(value===null||value===undefined||value==='')return 'Not specified';
 if(Array.isArray(value))return value.length?value.map((item,i)=>'<div class="omega-site-list-item"><b>'+esc(typeof item==='object'?(item.name||item.routeName||item.id||('Item '+(i+1))):item)+'</b>'+(typeof item==='object'?'<pre>'+esc(JSON.stringify(item,null,2))+'</pre>':'')+'</div>').join(''):'None';
 if(typeof value==='object')return '<pre>'+esc(JSON.stringify(value,null,2))+'</pre>';
 return esc(value);
}
function detail(s){
 if(!detailNode)return;
 if(!s){detailNode.innerHTML='<p>Select an individual mine or field.</p>';return;}
 const sim=s.simulation||{},real=s.real||{},loc=s.location||{},coords=s.coordinates||loc.coordinates||{};
 const operation=s.operation||s.operationProfile||{},ownership=s.ownership||{},processing=s.processing||{};
 const routes=sim.transportRoute||sim.transportRoutes||s.transportRoute||s.logistics?.routes||s.routes||[];
 const reserve=sim.reserve||sim.recoverableReserve||s.quantitative?.reserve||{};
 const routeRows=Array.isArray(routes)?routes:(routes?[routes]:[]);
 const routeHtml=routeRows.length?routeRows.map((route,i)=>{
  const row=route&&typeof route==='object'?route:{route};
  const label=row.routeName||row.name||row.routeId||row.id||('Route '+(i+1));
  return '<section class="omega-site-route"><b>'+esc(label)+'</b><pre>'+esc(JSON.stringify(row,null,2))+'</pre></section>';
 }).join(''):'<p>No per-site transport route is recorded in the loaded site profile.</p>';
 detailNode.innerHTML='<style>#omega-individual-detail .omega-site-section{border-top:1px solid #34465c;padding-top:8px;margin-top:9px}#omega-individual-detail .omega-site-section h4{margin:0 0 6px;color:#9fcbe0;font:700 11px/1.4 Arial,sans-serif;text-transform:uppercase;letter-spacing:.4px}#omega-individual-detail .omega-site-route{padding:7px;margin:6px 0;background:#172437;border:1px solid #34465c;border-radius:5px}#omega-individual-detail pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:150px;overflow:auto;margin:5px 0 0;color:#c7d3df;font:10px/1.4 monospace}#omega-individual-detail p{margin:5px 0}</style>'+
 '<b>'+esc(s.siteName)+'</b><br><small>'+esc(s.siteId)+'</small>'+
 '<p>Country: <b>'+esc(s.countryId)+'</b> · Commodity: <b>'+esc(real.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resId||s.identity?.resourceTypeId||'unknown')+'</b></p>'+
 '<p>Location: '+esc(loc.locality||loc.adminRegion||loc.countryName||'unknown')+' ('+esc(coords.lat)+', '+esc(coords.lng)+')</p>'+
 '<div class="omega-site-section"><h4>Extraction & ownership</h4><p>Method: <b>'+esc(real.extractionMethod||operation.extractionMethod||operation.method||'UNSPECIFIED')+'</b></p><p>Status: '+esc(real.operationStatus||operation.status||operation.operationalStatus||s.sourceSiteRecord?.status||'UNKNOWN')+'</p><p>Owner: '+esc(ownership.owner||real.owner||'Not specified')+' · Operator: '+esc(ownership.operator||real.operator||'Not specified')+'</p></div>'+
 '<div class="omega-site-section"><h4>Reserve & site capacity</h4><p>Gameplay reserve: '+displayValue(typeof reserve==='object'?((reserve.quantity??reserve.value??'')+' '+(reserve.unit||'')):reserve)+' <small>('+esc(reserve.status||sim.reserveStatus||'SIMULATION DATA')+')</small></p><p>Nominal capacity: '+esc(sim.nominalDailyCapacity??sim.capacityModel?.nominalDailyCapacity??'Not specified')+' / day</p><p>Utilization: '+esc(sim.utilization===undefined?'Not specified':Math.round(Number(sim.utilization)*100)+'%')+' · Recovery: '+esc(sim.recovery===undefined?'Not specified':Math.round(Number(sim.recovery)*100)+'%')+'</p><small>Simulation assumptions are gameplay values, not verified real-world production rates.</small></div>'+
 '<div class="omega-site-section"><h4>Individual transport route & delivery</h4>'+routeHtml+'<p>Route data is taken from this site record; no country-average route is substituted.</p></div>'+
 '<div class="omega-site-section"><h4>Processing & factory outputs</h4><p>Upstream: '+displayValue(processing.upstreamProcess||sim.upstreamProcess||'Not specified')+'</p><p>Midstream: '+displayValue(processing.midstreamProcess||sim.midstreamProcess||'Not specified')+'</p><p>Factory outputs: '+displayValue(processing.refinedOutputs||processing.factoryOutputs||sim.factoryOutputs||[])+'</p><p>Downstream sectors: '+displayValue(processing.downstreamSectors||[])+'</p></div>'+
 '<div class="omega-site-section"><h4>Coordinate & data provenance</h4><p>'+esc(coords.coordinateStatus||loc.coordinateStatus||s.real?.coordinateStatus||'Coordinate status not supplied')+'</p><p>Source: '+esc(s.sourcePath||s.sourceReference?.source||s.sourceReference?.url||s.sourceSiteRecord?.sourceDataset||s.sourceSiteRecord?.source||'Existing OMEGA resource JSON / site registry')+'</p></div>';
}
function setSelected(id){
 const s=sites.find(x=>x.siteId===id);if(!s)return;
 selected=id;if(selectNode)selectNode.value=id;if(searchNode)searchNode.value=s.siteName+' ['+s.countryId+' · '+s.siteId+']';detail(s);if(panel)panel.style.display='block';
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
// Build a light GeoJSON country index once. It is used to detect records whose coordinates
// land inside a different country; offshore/outside-land points remain valid but unverified.
function geometryBounds(geometry){
 const b=[Infinity,Infinity,-Infinity,-Infinity];
 function walk(node){
  if(!Array.isArray(node))return;
  if(node.length>=2&&typeof node[0]==='number'&&typeof node[1]==='number'){
   b[0]=Math.min(b[0],node[0]);b[1]=Math.min(b[1],node[1]);
   b[2]=Math.max(b[2],node[0]);b[3]=Math.max(b[3],node[1]);return;
  }
  for(const child of node)walk(child);
 }
 walk(geometry?.coordinates);
 return b[0]===Infinity?null:b;
}
function pointInRing(lng,lat,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if(!a||!b)continue;
  if(((a[1]>lat)!==(b[1]>lat))&&(lng<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]))inside=!inside;
 }
 return inside;
}
function pointInPolygon(lng,lat,rings){
 return Array.isArray(rings)&&rings.length>0&&pointInRing(lng,lat,rings[0])&&!rings.slice(1).some(r=>pointInRing(lng,lat,r));
}
function pointInGeometry(lng,lat,geometry){
 if(geometry?.type==='Polygon')return pointInPolygon(lng,lat,geometry.coordinates);
 if(geometry?.type==='MultiPolygon')return geometry.coordinates.some(poly=>pointInPolygon(lng,lat,poly));
 return false;
}
function buildCountryGeometryIndex(world){
 const index=new Map();
 for(const feature of world?.features||[]){
  const id=cid(feature?.id||feature?.properties?.iso_a3||feature?.properties?.ISO_A3);
  const bounds=geometryBounds(feature?.geometry);
  if(id&&bounds)index.set(id,{id,name:feature.properties?.name||id,geometry:feature.geometry,bounds});
 }
 return index;
}
function resolveCountryCode(site,index){
 const raw=cid(site?.countryId);
 if(index?.has(raw))return raw;
 const source=site?.sourceSiteRecord||{};
 const aliases=[site?.location?.countryName,site?.countryName,source?.countryName,source?.country,source?.countryCode,source?.location?.countryName]
  .map(v=>String(v||'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().toUpperCase()).filter(Boolean);
 for(const feature of index?.values?.()||[]){
  const names=[feature.name,feature.id].map(v=>String(v||'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().toUpperCase());
  if(aliases.some(alias=>names.includes(alias)))return feature.id;
 }
 const knownAliases={'KSA':'SAU','KINGDOM OF SAUDI ARABIA':'SAU','UNITED STATES':'USA','UNITED STATES OF AMERICA':'USA','UAE':'ARE','RUSSIA':'RUS','SOUTH KOREA':'KOR','NORTH KOREA':'PRK','VIETNAM':'VNM','IRAN':'IRN','BOLIVIA':'BOL','TANZANIA':'TZA','VENEZUELA':'VEN','SYRIA':'SYR','LAOS':'LAO','BRUNEI':'BRN','MOLDOVA':'MDA','CZECH REPUBLIC':'CZE','PALESTINE':'PSE','TAIWAN':'TWN'};
 for(const alias of aliases)if(knownAliases[alias]&&index?.has(knownAliases[alias]))return knownAliases[alias];
 return raw;
}
function validateSiteCoordinate(site,index){
 const c=site.coordinates||site.location?.coordinates||{},lat=Number(c.lat),lng=Number(c.lng);
 if(!Number.isFinite(lat)||!Number.isFinite(lng))return {status:'INVALID_COORDINATES'};
 if(!index?.size)return {status:'GEOMETRY_DATA_UNAVAILABLE'};
 const owner=cid(site.countryId),ownerFeature=index.get(owner);
 const inOwner=ownerFeature&&lng>=ownerFeature.bounds[0]&&lng<=ownerFeature.bounds[2]&&lat>=ownerFeature.bounds[1]&&lat<=ownerFeature.bounds[3]&&pointInGeometry(lng,lat,ownerFeature.geometry);
 if(inOwner)return {status:'INSIDE_OWNER',ownerCountryId:owner};
 for(const feature of index.values()){
  if(feature.id===owner)continue;
  const b=feature.bounds;
  if(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3])continue;
  if(pointInGeometry(lng,lat,feature.geometry)){
   return {status:ownerFeature?'INSIDE_OTHER_COUNTRY':'OWNER_GEOMETRY_MISSING',ownerCountryId:owner,containingCountryId:feature.id,containingCountryName:feature.name};
  }
 }
 return {status:ownerFeature?'OFFSHORE_OR_OUTSIDE_LAND':'OWNER_GEOMETRY_MISSING',ownerCountryId:owner};
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
 if((!coords&&!String(raw.sourceType||p.sourceType||'').startsWith('GLOBAL_'))||(!countryId&&!String(raw.sourceType||p.sourceType||'').startsWith('GLOBAL_'))||!resourceId||(!siteId&&!siteName))return null;
 // Source discovery returns a normalized candidate. Preserve its original JSON object
 // instead of nesting the candidate as though it were a raw deposit/site record.
 const nestedSource=raw.sourceSiteRecord&&typeof raw.sourceSiteRecord==='object'?raw.sourceSiteRecord:null;
 const sourceRecord=nestedSource&&nestedSource.sourceSiteRecord&&typeof nestedSource.sourceSiteRecord==='object'
  ?nestedSource.sourceSiteRecord:(nestedSource||raw);
 const stableId=siteId||('SITE_'+countryId+'_'+siteName.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
 return {siteId:stableId,countryId,siteName:siteName||stableId,sourceType:raw.sourceType||p.sourceType||identity.siteType||null,real:{...(raw.real||{}),resourceId},sourceSiteRecord:sourceRecord,coordinates:coords,
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
 // Country selectors may expose an ISO code, display name, or internal underscored key.
 // Resolve the selection against canonical identities already present in the loaded site registry.
 const activeCountryNorm=norm(activeCountry);
 const activeCountryResolved=String(g.Game?.getCountryId?.(activeCountry)||g.Game?.getCountryId?.(activeCountryNorm)||'').trim().toUpperCase();
 const activeCountrySiteIds=new Set(sites.filter(site=>{
  const names=[site.countryId,site.countryName,site.location?.countryName,site.sourceSiteRecord?.country,site.sourceSiteRecord?.countryName,site.sourceSiteRecord?.countryCode,site.sourceSiteRecord?.countryId].map(norm).filter(Boolean);
  return names.includes(activeCountryNorm)||(activeCountryResolved&&names.includes(norm(activeCountryResolved)));
 }).map(site=>String(site.countryId||'').trim().toUpperCase()).filter(Boolean));
 const activeCountryCode=activeCountryResolved||[...activeCountrySiteIds][0]||'';
 const aliases={oil:'crude_oil',crudeoil:'crude_oil',gas:'natural_gas',naturalgas:'natural_gas',iron:'iron_ore',ironore:'iron_ore',rareearth:'rare_earth'};
 const canonical=id=>{const raw=String(id||'').trim().toLowerCase();const compact=raw.replace(/[\s_-]+/g,'');return aliases[compact]||raw.replace(/[\s-]+/g,'_');};
 const selected=resourceState.selectedResources instanceof Set?resourceState.selectedResources:new Set();
 const selectedKeys=new Set(Array.from(selected,canonical));
 const selectedAll=selectedKeys.has('all');
 const resourceCatalog=mapApi.resourceCatalog||g.Game?.resourceCatalog||[];
 const visibleSites=sites.filter(s=>{
  const c=s.coordinates||s.location?.coordinates||{},lat=Number(c.lat),lng=Number(c.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)return false;
  if(typeof map.getContainer==='function'&&bounds&&typeof bounds.contains==='function'&&zoom>2&&!bounds.contains([lat,lng]))return false;
  // Do not draw a site's marker inside another country's land polygon. Keep the source row
  // intact and expose the exact mismatch in diagnostics instead of inventing a new location.
  if(s.coordinateValidation?.status==='INSIDE_OTHER_COUNTRY')return false;
  const rawResource=String(s.real?.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||s.sourceSiteRecord?.resId||s.identity?.resourceTypeId||'').toLowerCase();
  const resourceId=canonical(rawResource);
  if(selected.size>0&&!selectedAll&&!selectedKeys.has(resourceId)&&!selectedKeys.has(canonical(rawResource)))return false;
  if(scope!=='WORLD'){
   const siteCountryId=String(s.countryId||'').trim().toUpperCase();
   const candidateCountries=[s.countryId,s.countryName,s.location?.countryName,s.sourceSiteRecord?.country,s.sourceSiteRecord?.countryName,s.sourceSiteRecord?.countryCode,s.sourceSiteRecord?.countryId].map(norm).filter(Boolean);
   const selectedMatches=candidateCountries.includes(activeCountryNorm)||
    (activeCountryCode&&siteCountryId===activeCountryCode)||
    (activeCountrySiteIds.size>0&&activeCountrySiteIds.has(siteCountryId));
   if(!selectedMatches)return false;
  }
  return true;
 });
 // Cluster the global dataset in screen space. Individual records remain searchable and clusters zoom in.
 const clusterMode=visibleSites.length>1200,collisionGroupBySite=new Map(),gridGroups=new Map();
 for(const site of visibleSites){
  const c=site.coordinates||site.location?.coordinates||{},lat=Number(c.lat),lng=Number(c.lng);
  const point=typeof map.latLngToLayerPoint==='function'?map.latLngToLayerPoint([lat,lng]):{x:lng,y:lat};
  let group;
  if(clusterMode){
   const key=Math.floor(point.x/34)+':'+Math.floor(point.y/34);
   group=gridGroups.get(key);if(!group){group=[];gridGroups.set(key,group);}
  }else{
   group=[...collisionGroupBySite.values()].find(items=>items.some(item=>Math.hypot(item.point.x-point.x,item.point.y-point.y)<30));
   if(!group)group=[];
  }
  group.push({site,point});collisionGroupBySite.set(site.siteId,group);
 }
 let rendered=0,offsetMarkerCount=0,clusterMarkerCount=0;
 const renderedCoordinateKeys=new Set(),renderedClusterKeys=new Set();
 for(const s of visibleSites){
  const c=s.coordinates||s.location?.coordinates||{},lat=Number(c.lat),lng=Number(c.lng);
  const rawResource=String(s.real?.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||s.sourceSiteRecord?.resId||s.identity?.resourceTypeId||'').toLowerCase();
  const resourceId=canonical(rawResource),resource=resourceCatalog.find(r=>canonical(r.id)===resourceId||String(r.id||'').toLowerCase()===rawResource);
  const group=collisionGroupBySite.get(s.siteId)||[{site:s}],position=group.findIndex(item=>item.site.siteId===s.siteId);
  const clusterKey=clusterMode?Math.floor((group[0]?.point?.x??0)/34)+':'+Math.floor((group[0]?.point?.y??0)/34):'';
  if(clusterMode&&group.length>1){
   if(renderedClusterKeys.has(clusterKey))continue;
   renderedClusterKeys.add(clusterKey);
   const count=group.length,clusterIcon=L.divIcon({className:'omega-individual-site-marker omega-resource-cluster',html:'<span style="display:flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 4px;border-radius:14px;background:#172b3d;border:2px solid #9fcbe0;color:#f3f7fb;font:700 11px Arial,sans-serif;box-shadow:0 1px 5px #0009">'+count+'</span>',iconSize:[Math.max(30,String(count).length*8+16),30],iconAnchor:[15,15]});
   const cluster=L.marker([lat,lng],{icon:clusterIcon,title:count+' resource sites in this map area',keyboard:true,alt:count+' resource sites'});
   cluster.bindTooltip?.(count+' resource sites · zoom in to separate sites',{direction:'top',sticky:true});
   cluster.on('click',()=>{if(typeof map.setView==='function')map.setView([lat,lng],Math.min(10,Number(map.getZoom?.()||2)+2));});
   cluster.addTo(markerLayer);clusterMarkerCount++;rendered++;continue;
  }
  if(clusterMode&&group.length>1)continue;
  const glyph=String(resource?.icon||resourceId.slice(0,2).toUpperCase()||'RS').replace(/[<>&"]/g,'');
  const color=/^#[0-9a-f]{6}$/i.test(resource?.color||'')?resource.color:'#76b7d8';
  let dx=0,dy=0;
  if(!clusterMode&&group.length>1){
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
 g.__OMEGA_INDIVIDUAL_RESOURCE_MARKER_DIAGNOSTICS__={loadedSiteCount:sites.length,visibleSiteCount:visibleSites.length,renderedMarkerCount:rendered,clusterMarkerCount,clusterMode,scope,activeCountry:activeCountry||null,resourceFilterCount:selected.size,overlapGroupCount:renderedCoordinateKeys.size,offsetMarkerCount,coordinateAudit:g.__OMEGA_RESOURCE_COORDINATE_AUDIT__||null};
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
 const s=chosenSite();if(!s)return setStatus('BLOCKED: select a site first');
 if(!s.countryId)return setStatus('BLOCKED: unresolved sovereign country identity; site remains searchable but cannot enter a country-owned extraction pipeline');
 const coords=s.coordinates||s.location?.coordinates||{};
 if(!Number.isFinite(Number(coords.lat))||!Number.isFinite(Number(coords.lng)))return setStatus('BLOCKED: upstream coordinates are missing; no synthetic map point or extraction plan will be created');
 if(s.operation?.commercialExtraction!==true)return setStatus('BLOCKED: source does not establish an active commercial operation; survey/development verification is required before extraction');
 const net=api();if(!net)return setStatus('BLOCKED: industrial runtime not loaded');
 const r=await net.loadCatalog?.();if(r?.status==='FAILED')return setStatus('BLOCKED: industrial catalog unavailable');
 const out=net.planExtraction({countryId:s.countryId,siteId:s.siteId,resourceId:s.real?.resourceId||s.sourceSiteRecord?.resourceId});
 setStatus(out.status==='PLANNED'?'PLAN CREATED · '+out.approvedQuantity+' '+out.unit+' · '+out.totalDurationDays+' days':'BLOCKED · '+(out.reason||out.status));
 g.__OMEGA_LAST_INDIVIDUAL_SITE_PLAN__=out;
}
async function execute(){
 const s=chosenSite();if(!s)return setStatus('BLOCKED: select a site first');
 const e=endowment();if(!e?.hydrateCountry||!e?.extractCountry)return setStatus('BLOCKED: endowment runtime unavailable');
 setStatus('Loading country state for '+s.siteId+'…');
 await e.hydrateCountry(s.countryId);
 if(!s.countryId){setStatus('BLOCKED · unresolved sovereign country identity.');return;}
 const refs=e.countryMineSiteReferences?.(s.countryId)||[];
 const ref=findOccurrence(s,refs);
 if(!ref){setStatus('BLOCKED · No exact site-to-occurrence binding for '+s.siteId+'; no extraction was executed.');return;}
 const controllers=e.countryMineSiteControllers?.(s.countryId)||{};
 const controller=controllers[String(ref.siteReferenceKey||ref.siteId||s.siteId)]||null;
 const linked=Array.isArray(controller?.linkedOccurrenceKeys)?controller.linkedOccurrenceKeys:[];
 const occurrence=linked[0]||ref.occurrenceKey||ref.canonicalOccurrenceKey||null;
 if(s.operation?.commercialExtraction!==true){setStatus('BLOCKED · this is a deposit/occurrence, not a confirmed active mine or producing field. It is registered but not automatically executable.');return;}
 if(!occurrence){setStatus('BLOCKED · site identity is registered but its Part 05 reserve/extraction occurrence is not executable. No batch or inventory was created.');return;}
 const result=await e.extractCountry(s.countryId,[occurrence]);
 const ok=!['FAILED','UNAVAILABLE','BLOCKED'].includes(String(result?.status||'').toUpperCase())&&(result?.status==='COMMITTED'||result?.status==='EXECUTED'||result?.result?.status==='COMMITTED'||Array.isArray(result?.result?.records)&&result.result.records.length>0);
 setStatus(ok?'EXTRACTION COMMITTED · '+s.siteId+' · turn '+(state().simulation?.turn??state().turn??0):'EXTRACTION NOT CONFIRMED · '+JSON.stringify({status:result?.status,reason:result?.reason||result?.result?.reason||null,siteId:s.siteId}).slice(0,240));
 g.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__={siteId:s.siteId,result};
}
function mount(){
 if(document.getElementById('omega-individual-resource-open'))return;
 const btn=document.createElement('button');btn.id='omega-individual-resource-open';btn.textContent='GLOBAL RESOURCE SITES';btn.style.cssText='position:fixed;left:12px;bottom:18px;z-index:1000001;padding:10px 12px;background:#172331;color:#e9d29a;border:1px solid #bca366;border-radius:6px;font:700 11px monospace;letter-spacing:.5px';
 btn.addEventListener('click',show);document.body.appendChild(btn);
 panel=document.createElement('section');panel.id='omega-individual-resource-panel';panel.style.cssText='display:none;position:fixed;left:12px;bottom:62px;z-index:1000002;width:min(390px,calc(100vw - 24px));max-height:72vh;overflow:auto;padding:14px;background:#101923;color:#e8edf2;border:1px solid #9b895b;border-radius:8px;box-shadow:0 10px 36px #000b;font:12px/1.5 monospace';
 panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><b>GLOBAL RESOURCE SITES</b><button id="omega-individual-close" style="background:#293440;color:#fff;border:1px solid #66717b;padding:3px 8px">CLOSE</button></div><p id="omega-individual-status">Loading worldwide mine and deposit records…</p><label for="omega-individual-search">Search site, country or commodity</label><input id="omega-individual-search" type="search" placeholder="e.g. Ghawar, Chile, copper" style="display:block;width:100%;box-sizing:border-box;padding:8px;margin:5px 0;background:#202b37;color:#fff;border:1px solid #697887"><label for="omega-individual-select">Matching individual sites</label><select id="omega-individual-select" size="6" style="display:block;width:100%;padding:8px;margin:5px 0 10px;background:#202b37;color:#fff;border:1px solid #697887"></select><div id="omega-individual-detail"></div><div style="display:flex;gap:7px;margin-top:12px"><button id="omega-individual-plan" style="flex:1;padding:9px;background:#253c4b;color:#fff;border:1px solid #547c91">PLAN EXTRACTION</button><button id="omega-individual-execute" style="flex:1;padding:9px;background:#423a27;color:#f2d99a;border:1px solid #bca366">EXECUTE SITE</button></div><small style="display:block;margin-top:9px;color:#aab4bf">No country-average substitution. Execution is reported only when an exact occurrence binding is found and the runtime confirms a committed result.</small>';
 document.body.appendChild(panel);
 statusNode=panel.querySelector('#omega-individual-status');detailNode=panel.querySelector('#omega-individual-detail');selectNode=panel.querySelector('#omega-individual-select');searchNode=panel.querySelector('#omega-individual-search');
 panel.querySelector('#omega-individual-close').addEventListener('click',()=>panel.style.display='none');
 selectNode.addEventListener('change',()=>setSelected(selectNode.value));
  searchNode.addEventListener('input',()=>renderSiteSearch(searchNode.value));
 panel.querySelector('#omega-individual-plan').addEventListener('click',()=>void plan());
 panel.querySelector('#omega-individual-execute').addEventListener('click',()=>void execute());
}
async function init(){
 if(g.__OMEGA_RESOURCE_SITE_BINDING_INIT__)return;
 g.__OMEGA_RESOURCE_SITE_BINDING_INIT__=true;
 mount();
 try{
  const urls=['resources.json','resources_2.json',CATALOG_URL,MASTER_URL,'resource_site_global_deposit_catalog_v1.json','resource_site_global_energy_catalog_v1.json','world.json'];
  const loaded=await Promise.all(urls.map(async url=>{
   try{const response=await fetch(url,{cache:'no-store'});if(!response.ok)return null;return {url,data:await response.json()};}
   catch(_){return null;}
  }));
  const sources=loaded.filter(Boolean);
  const getData=url=>sources.find(x=>x.url===url)?.data||null;
  const catalog=getData(CATALOG_URL),master=getData(MASTER_URL),globalCatalog=getData('resource_site_global_deposit_catalog_v1.json'),energyCatalog=getData('resource_site_global_energy_catalog_v1.json');
  const catalogSites=Array.isArray(catalog?.sites)?catalog.sites:[];
  const masterSites=Array.isArray(master?.sites)?master.sites:[];
  const globalSites=Array.isArray(globalCatalog?.sites)?globalCatalog.sites:[];
  const globalEnergySites=Array.isArray(energyCatalog?.sites)?energyCatalog.sites:[];
  const masterById=new Map(masterSites.map(s=>[String(s.siteId),s]));
  const catalogById=new Map(catalogSites.map(s=>[String(s.siteId),s]));
  const discovered=sources.filter(x=>x.url==='resources.json'||x.url==='resources_2.json').flatMap(x=>discoverSourceSites(x.data));
  const candidates=[...catalogSites.map(s=>normalizeSourceSite(s,s.countryId)||s),...masterSites.map(s=>normalizeSourceSite(s,s.countryId)||s),...globalSites.map(s=>normalizeSourceSite(s,s.countryId)||s),...globalEnergySites.map(s=>normalizeSourceSite(s,s.countryId)||s),...discovered];
  const byId=new Map(),physicalIndex=new Map();
  let mergedDepositAliases=0;
  for(const candidate of candidates){
   const normalized=normalizeSourceSite(candidate,candidate.countryId)||candidate;
   const id=String(normalized.siteId||'').trim(),coords=coordsOf(normalized);
   const isGlobal=String(normalized.sourceType||candidate.sourceType||'').startsWith('GLOBAL_');
   if(!id||(!isGlobal&&(!coords||!normalized.countryId)))continue;
   const masterRow=masterById.get(id)||{},catalogRow=catalogById.get(id)||{};
   const source=normalized.sourceSiteRecord||normalized;
   const resourceId=normalized.real?.resourceId||source.resourceId||source.resourceTypeId||source.resourceTypeKey||source.resId||catalogRow.identity?.resourceTypeId||'unknown';
   const countryId=cid(normalized.countryId||masterRow.countryId||catalogRow.countryId);
   const physicalKey=[countryId||'UNRESOLVED_COUNTRY',String(resourceId).toLowerCase(),coords?coords.lat.toFixed(4):'NO_LAT',coords?coords.lng.toFixed(4):'NO_LNG',coords?'':String(source.sourceRecordId||source.upstreamRecordId||source.id||id)].join('|');
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
    location:{...(catalogRow.location||{}),...(masterRow.location||{}),...(normalized.location||{}),coordinates:coords,countryName:(normalized.location?.countryName||catalogRow.location?.countryName||masterRow.location?.countryName||(countryId||null))},
    identity:{...(catalogRow.identity||{}),...(masterRow.identity||{}),...(normalized.identity||{}),countryIso3:countryId,resourceTypeId:resourceId},
    operation:normalized.operation||masterRow.operation||catalogRow.operation||{},
    processing:normalized.processing||masterRow.processing||catalogRow.processing||{}
   });
   if(!isDeposit)physicalIndex.set(physicalKey,id);
  }
  sites=[...byId.values()];
  const countryGeometryIndex=buildCountryGeometryIndex(getData('world.json'));
  const coordinateAudit={};
  for(const site of sites){
   if(String(site.sourceType||'').startsWith('GLOBAL_')){
   const c=site.coordinates||site.location?.coordinates||{};
   const hasCoordinates=Number.isFinite(Number(c.lat))&&Number.isFinite(Number(c.lng))&&Number(c.lat)>=-90&&Number(c.lat)<=90&&Number(c.lng)>=-180&&Number(c.lng)<=180;
   const status=hasCoordinates?'UPSTREAM_SOURCE_COORDINATE_NOT_INDEPENDENTLY_VALIDATED':(!site.countryId?'UNRESOLVED_COUNTRY_AND_COORDINATE':'MISSING_UPSTREAM_COORDINATES');
   site.coordinateValidation={status,ownerCountryId:site.countryId||null};coordinateAudit[status]=(coordinateAudit[status]||0)+1;continue;
  }
   const sourceCountryId=site.countryId;
   const resolvedCountryId=resolveCountryCode(site,countryGeometryIndex);
   if(resolvedCountryId&&countryGeometryIndex.has(resolvedCountryId)&&resolvedCountryId!==sourceCountryId){
    site.sourceCountryId=sourceCountryId;
    site.countryId=resolvedCountryId;
    site.identity={...(site.identity||{}),countryIso3:resolvedCountryId};
    site.location={...(site.location||{}),countryName:site.location?.countryName||countryGeometryIndex.get(resolvedCountryId)?.name};
   }
   site.coordinateValidation=validateSiteCoordinate(site,countryGeometryIndex);
   if(site.sourceCountryId)site.coordinateValidation.sourceCountryId=site.sourceCountryId;
   const key=site.coordinateValidation.status;
   coordinateAudit[key]=(coordinateAudit[key]||0)+1;
  }
  const quarantinedCoordinates=sites.filter(s=>s.coordinateValidation?.status==='INSIDE_OTHER_COUNTRY');
  const unresolvedOwnerGeometry=sites.filter(s=>s.coordinateValidation?.status==='OWNER_GEOMETRY_MISSING');
  g.__OMEGA_RESOURCE_COORDINATE_AUDIT__={
   status:countryGeometryIndex.size?'COMPLETE':'GEOMETRY_DATA_UNAVAILABLE',
   siteCount:sites.length,coordinateAudit,
   quarantined:quarantinedCoordinates.map(s=>({siteId:s.siteId,countryId:s.countryId,siteName:s.siteName,coordinates:s.coordinates,...s.coordinateValidation})),
   unresolvedOwnerGeometry:unresolvedOwnerGeometry.map(s=>({siteId:s.siteId,countryId:s.countryId,siteName:s.siteName,coordinates:s.coordinates,...s.coordinateValidation}))
  };
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
  if(!countryGeometryIndex.size)throw new Error('COUNTRY_GEOMETRY_DATA_UNAVAILABLE_FOR_COORDINATE_AUDIT');
  if(new Set(sites.map(s=>s.siteId)).size!==sites.length)throw new Error('INDIVIDUAL_SITE_IDENTITY_NOT_UNIQUE');
  sites.sort((a,b)=>String(a.countryId||'UNRESOLVED_COUNTRY').localeCompare(String(b.countryId||'UNRESOLVED_COUNTRY'))||String(a.siteName||'').localeCompare(String(b.siteName||'')));
  const supplementalRows=sites.filter(site=>String(site.sourceType||'').startsWith('GLOBAL_'));
  const pipelineRegistration=endowment()?.registerSupplementalSiteCatalog?.(supplementalRows)||{status:'UNAVAILABLE',registeredCount:0,reason:'RESOURCE_ENDOWMENT_REGISTRATION_API_UNAVAILABLE'};
  g.__OMEGA_GLOBAL_RESOURCE_PIPELINE_DIAGNOSTICS__={...pipelineRegistration,sourceSiteCount:supplementalRows.length,sourceCatalogs:['resource_site_global_deposit_catalog_v1.json','resource_site_global_energy_catalog_v1.json'],identityChain:'GLOBAL_CATALOG -> COUNTRY_SITE_REFERENCE -> PART04_IDENTITY -> PART05_RESERVE_EXTRACTION -> BATCH -> COUNTRY_RAW_WAREHOUSE -> INDUSTRIAL_NETWORK_ROUTE -> FACTORY'};
  selected=sites[0].siteId;renderSiteSearch('');selectNode.value=selected;if(searchNode)searchNode.value=sites[0].siteName+' ['+sites[0].countryId+' · '+sites[0].siteId+']';detail(chosenSite());
  g.Omega=g.Omega||{};
  g.Omega.IndividualResourceSiteBinding={version:VERSION,sites,select:setSelected,refresh:addMapMarkers,diagnostics:()=>{
   const coordinateStatusCounts={};
   for(const site of sites){const status=coordinateStatusOf(site);coordinateStatusCounts[status]=(coordinateStatusCounts[status]||0)+1;}
   const sourceRecordCounts=sources.reduce((counts,source)=>{
     if(source.url==='resource_site_global_deposit_catalog_v1.json')counts.globalMineralDeposits=Array.isArray(source.data?.sites)?source.data.sites.length:0;
     if(source.url==='resource_site_global_energy_catalog_v1.json')counts.globalEnergySites=Array.isArray(source.data?.sites)?source.data.sites.length:0;
    if(source.url==='resources.json'||source.url==='resources_2.json'){
     const profiles=source.data?.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{};
     counts.mineSites+=Object.values(profiles).reduce((sum,profile)=>sum+(Array.isArray(profile?.resource_infrastructure_context?.mineSites)?profile.resource_infrastructure_context.mineSites.length:0),0);
     counts.runtimeDeposits+=Array.isArray(source.data?.runtime_deposits)?source.data.runtime_deposits.length:0;
    }
    return counts;
   },{mineSites:0,runtimeDeposits:0});
   return {status:'READY',siteCount:sites.length,uniqueSiteIds:new Set(sites.map(s=>s.siteId)).size,countryCount:new Set(sites.map(s=>s.countryId)).size,globalMineralDepositCount:globalSites.length,globalEnergySiteCount:globalEnergySites.length,sourceFiles:sources.map(x=>x.url),sourceRecordCounts,coordinateStatusCounts,mergedDepositAliases,individualMapping:true,searchableAllSites:true};
  }};
  attachMapRefreshHooks();scheduleMarkerRender();setTimeout(()=>scheduleMarkerRender(),1000);setTimeout(()=>scheduleMarkerRender(),3000);
  setStatus('READY · '+sites.length+' sites · '+new Set(sites.map(s=>s.countryId)).size+' countries · '+(globalSites.length+globalEnergySites.length)+' global mine/field records · '+quarantinedCoordinates.length+' verified wrong-country records quarantined');
 }catch(e){setStatus('FAILED · '+String(e?.message||e));g.OmegaIndividualResourceSiteBindingError=String(e?.message||e);g.__OMEGA_RESOURCE_SITE_BINDING_INIT__=false;}
}
g.addEventListener?.('OMEGA_READY',()=>void init());
g.addEventListener?.('load',()=>setTimeout(()=>{if(!g.__OMEGA_RESOURCE_SITE_BINDING_INIT__)void init();else scheduleMarkerRender();},500));
})(typeof window!=='undefined'?window:globalThis);
