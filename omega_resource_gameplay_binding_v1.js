/* OMEGA INDIVIDUAL RESOURCE SITE GAMEPLAY BINDING
 * This UI is intentionally site-ID keyed. It never substitutes country averages for a selected site.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const CATALOG_URL='resource_site_canonical_catalog_v1.json';
const MASTER_URL='resource_site_master_registry_v1.json';
let sites=[], selected=null, markers=[], markerLayer=null, panel=null, statusNode=null, detailNode=null, selectNode=null;
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const state=()=>g.Game?.state||g.gameState||{};
const api=()=>g.Omega?.ResourceIndustrialNetwork||g.OmegaResourceIndustrialNetwork;
const endowment=()=>g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime;
const cid=v=>String(v||'').trim().toUpperCase();
function setStatus(s){if(statusNode)statusNode.textContent=String(s||'');}
function chosenSite(){return sites.find(s=>s.siteId===selected)||null;}
function detail(s){
 if(!detailNode)return;
 if(!s){detailNode.innerHTML='<p>Select an individual mine or field.</p>';return;}
 const sim=s.simulation||{},real=s.real||{},loc=s.location||{},coords=s.coordinates||loc.coordinates||{};
 detailNode.innerHTML=`<b>${esc(s.siteName)}</b><br><small>${esc(s.siteId)}</small>
 <p>Country: <b>${esc(s.countryId)}</b> · Commodity: <b>${esc(real.resourceId||s.sourceSiteRecord?.resourceId||'unknown')}</b></p>
 <p>Location: ${esc(loc.locality||loc.adminRegion||'unknown')} (${esc(coords.lat)}, ${esc(coords.lng)})</p>
 <p>Method: ${esc(real.extractionMethod||'UNSPECIFIED')} · Status: ${esc(real.operationStatus||s.sourceSiteRecord?.status||'UNKNOWN')}</p>
 <p>Gameplay reserve: ${Number(sim.reserve?.quantity||0).toLocaleString()} ${esc(sim.reserve?.unit||'units')} <small>(${esc(sim.reserve?.status||'UNAVAILABLE')})</small></p>
 <p>Site capacity: ${Number(sim.nominalDailyCapacity||0).toLocaleString()} / day · Utilization ${Math.round((Number(sim.utilization)||0)*100)}%</p>
 <p>Location evidence: ${esc(coords.coordinateStatus||loc.coordinateStatus||s.real?.coordinateStatus||'see provenance')} · Values labelled SIMULATED are gameplay values.</p>`;
}
function setSelected(id){
 const s=sites.find(x=>x.siteId===id);if(!s)return;
 selected=id;if(selectNode)selectNode.value=id;detail(s);
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
function normalizeSourceSite(raw,countryHint){
 if(!raw||typeof raw!=='object')return null;
 const p=raw.siteDataPackage||raw;
 const identity=raw.identity||p.identity||raw.siteIdentity||{};
 const loc=raw.location||p.location||raw.locationIdentity||{};
 const coords=coordsOf(raw)||coordsOf(p)||coordsOf(loc);
 const countryId=cid(raw.countryId||raw.countryCode||raw.country||identity.countryIso3||identity.countryId||loc.countryIso3||countryHint);
 const siteId=asText(raw.siteId||raw.id||raw.assetId||raw.occurrenceKey||p.siteId||identity.siteId);
 const siteName=asText(raw.siteName||raw.name||raw.title||p.siteName||identity.siteName);
 const resourceId=asText(raw.resourceId||raw.resourceTypeId||raw.resourceTypeKey||identity.resourceTypeId||identity.resourceId||p.resourceId||p.resourceTypeId);
 if(!coords||!countryId||!resourceId||(!siteId&&!siteName))return null;
 const stableId=siteId||('SITE_'+countryId+'_'+siteName.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
 return {siteId:stableId,countryId,siteName:siteName||stableId,real:{...(raw.real||{}),resourceId},sourceSiteRecord:raw,coordinates:coords,
  location:{...loc,coordinates:coords,locality:loc.locality||raw.region||raw.adminRegion||''},
  identity:{...identity,countryIso3:countryId,resourceTypeId:resourceId,siteType:identity.siteType||raw.siteType||raw.type||'RESOURCE_SITE'},
  operation:raw.operation||p.operation||raw.extractionProfile||{},processing:raw.processing||p.processing||{}};
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
 if(markerLayer&&map.hasLayer?.(markerLayer))map.removeLayer(markerLayer);
 markerLayer=L.layerGroup();
 for(const s of sites){
  const c=s.coordinates||s.location?.coordinates||{},lat=Number(c.lat),lng=Number(c.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))continue;
  const resourceId=String(s.real?.resourceId||s.sourceSiteRecord?.resourceId||s.identity?.resourceTypeId||'').toLowerCase();
  const resourceCatalog=g.Game?.Map?.resourceCatalog||g.Game?.resourceCatalog||[];
  const resource=resourceCatalog.find(r=>String(r.id||'').toLowerCase()===resourceId);
  const glyph=String(resource?.icon||resourceId.slice(0,2).toUpperCase()||'RS').replace(/[<>&"]/g,'');
  const color=/^#[0-9a-f]{6}$/i.test(resource?.color||'')?resource.color:'#76b7d8';
  const icon=L.divIcon({
   className:'omega-individual-site-marker',
   html:'<span style="--site-color:'+color+'">'+esc(glyph)+'</span>',
   iconSize:[26,26],iconAnchor:[13,13],tooltipAnchor:[0,-12]
  });
  const m=L.marker([lat,lng],{icon,title:String(s.siteName||s.siteId),keyboard:true,alt:String(s.siteName||s.siteId)});
  m.bindTooltip?.(String(s.siteName||s.siteId)+' · '+s.countryId+' · '+resourceId,{direction:'top',sticky:true});
  m.on('click',()=>setSelected(s.siteId));m.addTo(markerLayer);
 }
 markerLayer.addTo(map);
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
 const refs=e.countryMineSiteReferences?.(s.countryId)||[];
 const ref=findOccurrence(s,refs);
 if(!ref){setStatus('BLOCKED · No exact site-to-occurrence binding for '+s.siteId+'; no extraction was executed.');return;}
 const occurrence=ref.occurrenceKey||ref.canonicalOccurrenceKey||ref.depositKey||ref.linkedDepositId||ref.siteId||ref.id;
 if(!occurrence){setStatus('BLOCKED · matched reference has no executable occurrence key.');return;}
 const result=await e.extractCountry(s.countryId,[occurrence]);
 const ok=!['FAILED','UNAVAILABLE','BLOCKED'].includes(String(result?.status||'').toUpperCase())&&(result?.status==='COMMITTED'||result?.status==='EXECUTED'||result?.result?.status==='COMMITTED'||Array.isArray(result?.result?.records)&&result.result.records.length>0);
 setStatus(ok?'EXTRACTION COMMITTED · '+s.siteId+' · turn '+(state().simulation?.turn??state().turn??0):'EXTRACTION NOT CONFIRMED · '+JSON.stringify({status:result?.status,reason:result?.reason||result?.result?.reason||null,siteId:s.siteId}).slice(0,240));
 g.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__={siteId:s.siteId,result};
}
function mount(){
 if(document.getElementById('omega-individual-resource-open'))return;
 const btn=document.createElement('button');btn.id='omega-individual-resource-open';btn.textContent='INDIVIDUAL SITES';btn.style.cssText='position:fixed;left:12px;bottom:18px;z-index:1000001;padding:10px 12px;background:#172331;color:#e9d29a;border:1px solid #bca366;border-radius:6px;font:700 11px monospace;letter-spacing:.5px';
 btn.addEventListener('click',show);document.body.appendChild(btn);
 panel=document.createElement('section');panel.id='omega-individual-resource-panel';panel.style.cssText='display:none;position:fixed;left:12px;bottom:62px;z-index:1000002;width:min(390px,calc(100vw - 24px));max-height:72vh;overflow:auto;padding:14px;background:#101923;color:#e8edf2;border:1px solid #9b895b;border-radius:8px;box-shadow:0 10px 36px #000b;font:12px/1.5 monospace';
 panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><b>INDIVIDUAL RESOURCE SITE</b><button id="omega-individual-close" style="background:#293440;color:#fff;border:1px solid #66717b;padding:3px 8px">CLOSE</button></div><p id="omega-individual-status">Loading 199 site records…</p><label for="omega-individual-select">Exact site identity</label><select id="omega-individual-select" style="display:block;width:100%;padding:8px;margin:5px 0 10px;background:#202b37;color:#fff;border:1px solid #697887"></select><div id="omega-individual-detail"></div><div style="display:flex;gap:7px;margin-top:12px"><button id="omega-individual-plan" style="flex:1;padding:9px;background:#253c4b;color:#fff;border:1px solid #547c91">PLAN EXTRACTION</button><button id="omega-individual-execute" style="flex:1;padding:9px;background:#423a27;color:#f2d99a;border:1px solid #bca366">EXECUTE SITE</button></div><small style="display:block;margin-top:9px;color:#aab4bf">No country-average substitution. Execution is reported only when an exact occurrence binding is found and the runtime confirms a committed result.</small>';
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
  const urls=['resources.json','resources_2.json',CATALOG_URL,MASTER_URL];
  const loaded=await Promise.all(urls.map(async url=>{
   try{const response=await fetch(url,{cache:'no-store'});if(!response.ok)return null;return {url,data:await response.json()};}
   catch(_){return null;}
  }));
  const sources=loaded.filter(Boolean);
  const getData=url=>sources.find(x=>x.url===url)?.data||null;
  const catalog=getData(CATALOG_URL),master=getData(MASTER_URL);
  const catalogSites=Array.isArray(catalog?.sites)?catalog.sites:[];
  const masterSites=Array.isArray(master?.sites)?master.sites:[];
  const masterById=new Map(masterSites.map(s=>[String(s.siteId),s]));
  const catalogById=new Map(catalogSites.map(s=>[String(s.siteId),s]));
  const discovered=sources.filter(x=>x.url==='resources.json'||x.url==='resources_2.json').flatMap(x=>discoverSourceSites(x.data));
  const candidates=[...catalogSites.map(s=>normalizeSourceSite(s,s.countryId)||s),...masterSites.map(s=>normalizeSourceSite(s,s.countryId)||s),...discovered];
  const byId=new Map();
  for(const candidate of candidates){
   const normalized=normalizeSourceSite(candidate,candidate.countryId)||candidate;
   const id=String(normalized.siteId||'').trim(),coords=coordsOf(normalized);
   if(!id||!coords||!normalized.countryId)continue;
   const masterRow=masterById.get(id)||{},catalogRow=catalogById.get(id)||{};
   const source=normalized.sourceSiteRecord||normalized;
   const resourceId=normalized.real?.resourceId||source.resourceId||source.resourceTypeId||catalogRow.identity?.resourceTypeId||'unknown';
   byId.set(id,{
    ...catalogRow,...masterRow,...normalized,
    siteId:id,countryId:cid(normalized.countryId||masterRow.countryId||catalogRow.countryId),
    siteName:normalized.siteName||masterRow.siteName||catalogRow.siteName||id,
    real:{...(catalogRow.real||{}),...(masterRow.real||{}),...(normalized.real||{}),resourceId},
    sourceSiteRecord:source,
    coordinates:coords,
    location:{...(catalogRow.location||{}),...(masterRow.location||{}),...(normalized.location||{}),coordinates:coords},
    identity:{...(catalogRow.identity||{}),...(masterRow.identity||{}),...(normalized.identity||{}),countryIso3:cid(normalized.countryId),resourceTypeId:resourceId},
    operation:normalized.operation||masterRow.operation||catalogRow.operation||{},
    processing:normalized.processing||masterRow.processing||catalogRow.processing||{}
   });
  }
  sites=[...byId.values()];
  if(!sites.length)throw new Error('NO_INDIVIDUAL_RESOURCE_SITES_WITH_VALID_COORDINATES');
  if(new Set(sites.map(s=>s.siteId)).size!==sites.length)throw new Error('INDIVIDUAL_SITE_IDENTITY_NOT_UNIQUE');
  sites.sort((a,b)=>a.countryId.localeCompare(b.countryId)||a.siteName.localeCompare(b.siteName));
  selectNode.innerHTML=sites.map(s=>'<option value="'+esc(s.siteId)+'">'+esc(s.countryId+' · '+s.siteName+' · '+(s.real?.resourceId||'?'))+'</option>').join('');
  selected=sites[0].siteId;selectNode.value=selected;detail(chosenSite());
  g.Omega=g.Omega||{};
  g.Omega.IndividualResourceSiteBinding={version:VERSION,sites,select:setSelected,diagnostics:()=>({status:'READY',siteCount:sites.length,uniqueSiteIds:new Set(sites.map(s=>s.siteId)).size,countryCount:new Set(sites.map(s=>s.countryId)).size,sourceFiles:sources.map(x=>x.url),individualMapping:true,missingCoordinates:0})};
  scheduleMarkerRender();setTimeout(()=>scheduleMarkerRender(),1000);setTimeout(()=>scheduleMarkerRender(),3000);
  setStatus('READY · '+sites.length+' individual sites · '+new Set(sites.map(s=>s.countryId)).size+' countries · exact coordinates');
 }catch(e){setStatus('FAILED · '+String(e?.message||e));g.OmegaIndividualResourceSiteBindingError=String(e?.message||e);g.__OMEGA_RESOURCE_SITE_BINDING_INIT__=false;}
}
g.addEventListener?.('OMEGA_READY',()=>void init());
g.addEventListener?.('load',()=>setTimeout(()=>{if(!g.__OMEGA_RESOURCE_SITE_BINDING_INIT__)void init();else scheduleMarkerRender();},500));
})(typeof window!=='undefined'?window:globalThis);
