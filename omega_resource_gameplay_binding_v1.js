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
function addMapMarkers(){
 const map=g.Game?.Map?.map||g.map,L=g.L;
 if(!map||!L||typeof L.circleMarker!=='function')return;
 if(markerLayer&&map.hasLayer?.(markerLayer))map.removeLayer(markerLayer);
 markerLayer=L.layerGroup();
 for(const s of sites){
  const c=s.coordinates||s.location?.coordinates||{},lat=Number(c.lat),lng=Number(c.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))continue;
  const m=L.circleMarker([lat,lng],{radius:5,color:'#d6b76c',weight:1,fillColor:'#e6c878',fillOpacity:.85});
  m.bindTooltip?.(String(s.siteName||s.siteId));
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
 mount();
 try{
  const [a,b]=await Promise.all([fetch(CATALOG_URL,{cache:'no-store'}),fetch(MASTER_URL,{cache:'no-store'})]);
  if(!a.ok||!b.ok)throw new Error('SITE_DATA_FETCH_FAILED');
  const catalog=await a.json(),master=await b.json();
  if(!Array.isArray(catalog.sites)||catalog.sites.length!==199||!Array.isArray(master.sites)||master.sites.length!==199)throw new Error('SITE_REGISTRY_COUNT_MISMATCH');
  const map=new Map(master.sites.map(s=>[s.siteId,s]));
  sites=catalog.sites.map(s=>{const m=map.get(s.siteId);return m?Object.assign({},m,{location:s.location,coordinates:s.location?.coordinates,identity:s.identity,operation:s.operation,processing:s.processing}):null;}).filter(Boolean);
  if(sites.length!==199||new Set(sites.map(s=>s.siteId)).size!==199)throw new Error('INDIVIDUAL_SITE_IDENTITY_NOT_UNIQUE');
  selectNode.innerHTML=sites.map(s=>'<option value="'+esc(s.siteId)+'">'+esc(s.countryId+' · '+s.siteName+' · '+(s.real?.resourceId||'?'))+'</option>').join('');
  selected=sites[0].siteId;selectNode.value=selected;detail(chosenSite());
  g.Omega=g.Omega||{};g.Omega.IndividualResourceSiteBinding={version:VERSION,sites,select:setSelected,diagnostics:()=>({status:'READY',siteCount:sites.length,uniqueSiteIds:new Set(sites.map(s=>s.siteId)).size,individualMapping:true})};
  addMapMarkers();setStatus('READY · '+sites.length+' individual sites · exact site IDs');
  setTimeout(addMapMarkers,1000);
 }catch(e){setStatus('FAILED · '+String(e?.message||e));g.OmegaIndividualResourceSiteBindingError=String(e?.message||e);}
}
g.addEventListener?.('OMEGA_READY',()=>void init());
g.addEventListener?.('load',()=>setTimeout(()=>{if(g.__OMEGA_DIAG__?.state==='RUNNING')void init();},500));
})(typeof window!=='undefined'?window:globalThis);
