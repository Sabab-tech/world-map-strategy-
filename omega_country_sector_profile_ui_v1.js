/* OMEGA Country Sector Profile UI v1.0.0
 * Lazy, read-only presentation of compact sector-profile references.
 * Reuses the canonical country registry; this module never mutates simulation state.
 */
(function(root){
'use strict';
const VERSION='1.1.0';
if(root.OmegaCountrySectorProfileUI&&root.OmegaCountrySectorProfileUI.VERSION===VERSION)return;
const PROFILE_URL='./country_sector_profiles_v1.json',SCHEMA_URL='./country_sector_profile_schema_v1.json';
const state={promise:null,profiles:null,profileByIso3:null,schema:null,lastError:null,mountCount:0,panelObserver:null};
const str=v=>String(v==null?'':v),norm=v=>str(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const esc=v=>str(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const titleCase=v=>str(v).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().replace(/\b[a-z]/g,ch=>ch.toUpperCase());
const internalOnlyStatus=status=>/GAME_DERIVED|SIMULATION|GAMEPLAY|SCENARIO|MODELED|MODELLED|DERIVED_HEURISTIC|DERIVED_SIMULATION|POLICY_ONLY/i.test(str(status));
function friendlyStatus(status,value){
 if(value===null||value===undefined||value==='')return 'Not recorded';
 const raw=str(status).toUpperCase();
 if(raw.includes('WORLD_BANK_API_OBSERVATION'))return 'World Bank observation';
 if(raw.includes('UNDP_HDR_OBSERVATION'))return 'UNDP observation';
 if(raw.includes('TRANSPARENCY_INTERNATIONAL_CPI'))return 'Transparency International observation';
 if(raw.includes('DERIVED_SAME_YEAR_OBSERVATIONS'))return 'Calculated from same-year data';
 if(raw.includes('CANONICAL_GENERAL_FACT'))return 'Country fact';
 if(raw.includes('LEGACY')||raw.includes('LOCAL_BASELINE'))return 'Earlier recorded data';
 if(raw.includes('SOURCE_OBSERVATION'))return 'Source observation';
 return 'Recorded value';
}
function safeSourceName(evidence){
 const name=str(evidence&&(evidence.sourceName||evidence.sourceId));
 if(!name||/OMEGA_|GAME|SIMULATION|RUNTIME|LOCAL_GAME|SCENARIO|MODELLED|MODELED/i.test(name))return '';
 if(/\.json$/i.test(name))return '';
 return name;
}
const formatNumber=v=>{try{return new Intl.NumberFormat('en',{maximumFractionDigits:3}).format(v)}catch(_){return str(v)}};
function formatValue(value,depth){
 const level=depth||0;
 if(value===null||value===undefined||value==='')return 'NOT RECORDED';
 if(typeof value==='number')return Number.isFinite(value)?formatNumber(value):'NOT RECORDED';
 if(typeof value==='boolean')return value?'Yes':'No';
 if(typeof value==='string')return value;
 if(Array.isArray(value))return value.length?value.slice(0,6).map(item=>formatValue(item,level+1)).join(', ')+(value.length>6?' (+'+(value.length-6)+' more)':''):'NOT RECORDED';
 if(obj(value)){
  if(level>=2)return '[structured record]';
  const entries=Object.entries(value).filter(([,item])=>item!==null&&item!==undefined&&item!=='');
  return entries.length?entries.slice(0,5).map(([key,item])=>titleCase(key)+': '+formatValue(item,level+1)).join(' · ')+(entries.length>5?' · +'+(entries.length-5)+' more':''):'NOT RECORDED';
 }
 return str(value);
}
async function readJson(url){
 if(typeof root.fetch!=='function')throw Error('FETCH_UNAVAILABLE');
 const response=await root.fetch(url,{cache:'default'});
 if(!response||!response.ok)throw Error('DATA_FETCH_FAILED: '+url);
 return response.json();
}
async function loadData(){
 if(state.profiles&&state.schema)return true;
 if(state.promise)return state.promise;
 state.lastError=null;
 state.promise=Promise.all([readJson(PROFILE_URL),readJson(SCHEMA_URL)]).then(rows=>{
  const profiles=rows[0],schema=rows[1];
  if(!Array.isArray(profiles&&profiles.countries)||!Array.isArray(schema&&schema.sectors))throw Error('SECTOR_PROFILE_SCHEMA_INVALID');
  const byIso3=new Map();
  profiles.countries.forEach(profile=>{const code=norm(profile&&profile.identity&&profile.identity.iso3);if(code&&!byIso3.has(code))byIso3.set(code,profile)});
  if(!byIso3.size)throw Error('SECTOR_PROFILE_IDENTITY_INDEX_EMPTY');
  state.profiles=profiles;state.profileByIso3=byIso3;state.schema=schema;return true;
 }).catch(error=>{state.lastError=str(error&&(error.message||error));state.promise=null;throw error});
 return state.promise;
}
function generalApi(){return root.OmegaCountryGeneralDataRuntime||(root.Omega&&root.Omega.CountryGeneralData)||null}
async function resolveCanonicalRecord(countryId,profile){
 const api=generalApi();if(!api)return null;
 if(typeof api.init==='function'){
  const diagnostic=typeof api.diagnostics==='function'?api.diagnostics():null;
  if(!diagnostic||!diagnostic.ready)await api.init();
 }
 if(typeof api.getCountryRecord!=='function')return null;
 const identity=profile&&profile.identity||{};
 return api.getCountryRecord(countryId)||api.getCountryRecord(identity.iso3)||api.getCountryRecord(identity.iso2)||null;
}
function getDefinition(key){
 const api=generalApi();
 const source=api&&typeof api.getMetricDefinition==='function'?api.getMetricDefinition(key):null;
 const derived=(state.schema.derivedMetrics||[]).find(row=>row.key===key);
 const external=(state.schema.extensionMetricDefinitions||[]).find(row=>row.key===key);
 return source||derived||external||{key,title:titleCase(key),unit:null};
}
function resolvedValue(profile,record,key,refType){
 if(refType==='METRIC'){
  const metadata=record&&record.metricMetadata&&record.metricMetadata[key]||{};
  const value=record&&record.metrics&&record.metrics[key]!==undefined?record.metrics[key]:null;
  if(internalOnlyStatus(metadata.status))return {value:null,unit:null,year:null,status:null,sourceId:null,sourceName:null,sourceUrl:null,note:null};
  return {value,unit:getDefinition(key).unit||null,
   year:metadata.year,status:metadata.status||null,sourceId:metadata.sourceId||null,sourceName:metadata.sourceName||null,sourceUrl:metadata.sourceUrl||null,note:/SIMULATION|GAMEPLAY|RUNTIME|MODELLED|MODELED/i.test(str(metadata.note))?null:(metadata.note||null)};
 }
 if(refType==='DERIVED_METRIC'){
  const value=profile.derivedMetrics&&profile.derivedMetrics[key]||null;
  return value&&internalOnlyStatus(value.status)?{value:null,status:null,sourceId:null,sourceName:null,sourceUrl:null,note:null}:value;
 }
 if(refType==='EXTERNAL_METRIC')return profile.externalMetrics&&profile.externalMetrics[key]||null;
 if(refType==='ANALYTICS')return null;
 if(refType==='GENERAL_FACT')return {value:record&&record.generalFacts&&record.generalFacts[key]!==undefined?record.generalFacts[key]:null,unit:null,year:null,status:'CANONICAL_GENERAL_FACT',sourceName:'Canonical country general-data registry'};
 return null;
}
function evidenceRows(profile,record,entries,fallbackType){
 return Object.entries(entries||{}).map(([key,reference])=>{
  const actualKey=reference&&reference.key||key;
  const kind=reference&&reference.refType||fallbackType;
  const evidence=resolvedValue(profile,record,actualKey,kind)||{},definition=getDefinition(actualKey);
  const label=definition.title||definition.label||definition.name||titleCase(actualKey),value=evidence.value!==undefined?evidence.value:null;
  const internal=internalOnlyStatus(evidence.status);
  const status=friendlyStatus(internal?'':evidence.status,value);
  const bits=[status];
  if(value!==null&&value!==undefined&&evidence.year!==null&&evidence.year!==undefined)bits.push('Year '+evidence.year);
  const source=safeSourceName(evidence);if(value!==null&&source)bits.push(source);
  const unit=evidence.unit||definition.unit||'',display=formatValue(value)+(value!==null&&unit?' '+unit:'');
  const search=norm([label,actualKey,value,status,source].join(' '));
  return '<article class="ocsp-evidence-row" data-ocsp-evidence data-search="'+esc(search)+'"><div class="ocsp-evidence-label"><strong>'+esc(label)+'</strong><code>'+esc(actualKey)+'</code></div>'+
   '<div class="ocsp-evidence-value">'+esc(display)+'</div><div class="ocsp-evidence-meta">'+esc(bits.join(' · '))+'</div>'+
   (value!==null&&evidence.note&&!/SIMULATION|GAMEPLAY|RUNTIME|MODELLED|MODELED|OMEGA_/i.test(str(evidence.note))?'<p class="ocsp-evidence-note">'+esc(evidence.note)+'</p>':'')+
   (value!==null&&evidence.sourceUrl&&/^https:\/\//i.test(evidence.sourceUrl)?'<p class="ocsp-evidence-note">Source: <a href="'+esc(evidence.sourceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(evidence.sourceUrl)+'</a></p>':'')+'</article>';
 }).join('');
}
function sourceGroupRows(record,sourceGroup){
 if(!sourceGroup||!sourceGroup.key||!record)return '';
 const key=sourceGroup.key,value=record[key];
 if(value===null||value===undefined)return '';
 const rows=(obj(value)?Object.entries(value):[['value',value]]).filter(([field])=>! /status|source|provenance|diagnostic/i.test(str(field)));
 if(!rows.length)return '';
 return '<details class="ocsp-source-group" open><summary>Additional country facts</summary><div class="ocsp-source-grid">'+
  rows.map(([field,item])=>'<div><span>'+esc(titleCase(field))+'</span><strong>'+esc(formatValue(item))+'</strong></div>').join('')+
  '</div><small>Unavailable values are marked Not recorded.</small></details>';
}
function sectorRows(profile,definition){
 const sector=profile.sectors&&profile.sectors[definition.id]||{};
 const indicators={...(sector.indicators||{})};
 for(const key of definition.metricKeys||[])if(!indicators[key])indicators[key]={refType:'METRIC',key};
 for(const key of definition.derivedMetricKeys||[])if(!indicators[key])indicators[key]={refType:'DERIVED_METRIC',key};
 for(const key of definition.externalMetricKeys||[])if(!indicators[key])indicators[key]={refType:'EXTERNAL_METRIC',key};
 return {sector,indicators,facts:sector.facts||{}};
}
function extensionRows(profile,definition){
 const slots=Array.isArray(definition.extensionSlots)?definition.extensionSlots:[];
 if(!slots.length)return '';
 const values=[...(profile.extensions&&profile.extensions.customAttributes||[]),...(profile.extensions&&profile.extensions.customMetrics||[]),...(profile.extensions&&profile.extensions.customTimeSeries||[])];
 return '<div class="ocsp-extension-list">'+slots.map(slot=>{
  const valueRow=values.find(row=>row&&(row.key===slot.key||row.metricKey===slot.key||row.name===slot.key));
  const value=valueRow?(valueRow.value??valueRow.values??valueRow.observation??null):null;
  const recorded=value!==null&&value!==undefined&&value!=='';
  const description=/future game score|project model|gameplay|simulation/i.test(str(slot.description))?'No comparable source record is available yet.':str(slot.description);
  return '<article class="ocsp-evidence-row" data-ocsp-evidence data-search="'+esc(norm([slot.key,description,value].join(' ')))+'"><div class="ocsp-evidence-label"><strong>'+esc(slot.title||titleCase(slot.key))+'</strong><code>'+esc(slot.key)+'</code></div><div class="ocsp-evidence-value">'+esc(formatValue(recorded?value:null))+'</div><div class="ocsp-evidence-meta">'+(recorded?'Recorded value':'Not recorded')+'</div>'+(description?'<p class="ocsp-evidence-note">'+esc(description)+'</p>':'')+'</article>';
 }).join('')+'</div>';
}
function renderSector(profile,record,definition){
 const resolved=sectorRows(profile,definition),sector=resolved.sector,indicators=resolved.indicators,facts=resolved.facts;
 const blocks=[evidenceRows(profile,record,indicators,null),evidenceRows(profile,record,facts,'GENERAL_FACT')].filter(Boolean).join('');
 const allRows=[indicators,facts].flatMap((group,index)=>Object.entries(group||{}).map(([key,ref])=>({key,ref,type:index===1?'GENERAL_FACT':null})));
 let available=0;
 allRows.forEach(row=>{const item=resolvedValue(profile,record,row.ref&&row.ref.key||row.key,row.ref&&row.ref.refType||row.type);if(item&&item.value!==null&&item.value!==undefined&&item.value!=='')available++});
 const extensions=extensionRows(profile,definition);
 const totalRows=allRows.length+(Array.isArray(definition.extensionSlots)?definition.extensionSlots.length:0);
 const search=norm([definition.title,definition.description,definition.id].join(' '));
 return '<details class="ocsp-sector" open data-ocsp-sector data-search="'+esc(search)+'"><summary><span class="ocsp-sector-title"><strong>'+esc(definition.title||titleCase(definition.id))+'</strong>'+
  '<small>'+esc(definition.description||'Country information')+'</small></span><span class="ocsp-sector-count">'+available+' / '+totalRows+' recorded</span></summary><div class="ocsp-sector-body">'+
  (blocks||'<p class="ocsp-empty">No registered fields for this section.</p>')+extensions+sourceGroupRows(record,sector.sourceGroup||definition.sourceGroup)+
  '</div></details>';
}
function signalsBlock(profile,key,title,description){
 const rows=profile.relativeSignals&&Array.isArray(profile.relativeSignals[key])?profile.relativeSignals[key]:[];
 if(!rows.length)return '';
 return '<details class="ocsp-signals"><summary>'+esc(title)+' · '+rows.length+'</summary><p class="ocsp-sector-note">'+esc(description)+'</p><div class="ocsp-signal-list">'+
  rows.map(signal=>'<article class="ocsp-signal-row" data-search="'+esc(norm([signal.title,signal.metricKey,signal.sectorId].join(' ')))+'"><strong>'+esc(signal.title||titleCase(signal.metricKey))+'</strong>'+
   '<span>'+esc(formatValue(signal.value))+(signal.unit?' '+esc(signal.unit):'')+'</span><small>'+esc(titleCase(signal.evidenceStatus||'STATUS NOT RECORDED'))+
   (signal.year==null?'':' · Year '+esc(signal.year))+(signal.peerPercentile==null?'':' · Peer percentile '+esc(formatNumber(signal.peerPercentile)))+'</small>'+
   (signal.caveat?'<p>'+esc(signal.caveat)+'</p>':'')+'</article>').join('')+'</div></details>';
}
function displaySectors(profile,record){
 const sectors=(state.schema.sectors||[]).slice(),covered=new Set();
 for(const def of sectors){
  for(const key of [...(def.metricKeys||[]),...(def.derivedMetricKeys||[]),...(def.externalMetricKeys||[])])covered.add(key);
  const section=profile.sectors&&profile.sectors[def.id]||{};
  Object.entries(section.indicators||{}).forEach(([key,ref])=>covered.add(ref&&ref.key||key));
 }
 const extras=Object.keys(record&&record.metrics||{}).filter(key=>!covered.has(key));
 if(extras.length)sectors.push({id:'additionalIndicators',title:'Additional country indicators',description:'Other registered indicators not assigned to a main sector.',metricKeys:extras});
 return sectors;
}
function profileMarkup(profile,record){
 const sectors=displaySectors(profile,record),metrics=Object.entries(record&&record.metrics||{}),facts=Object.entries(record&&record.generalFacts||{});
 const recordedMetrics=metrics.filter(([key,value])=>value!==null&&value!==undefined&&value!==''&&!internalOnlyStatus(record.metricMetadata&&record.metricMetadata[key]&&record.metricMetadata[key].status)).length;
 const recordedFacts=facts.filter(([,value])=>value!==null&&value!==undefined&&value!==''&&(!Array.isArray(value)||value.length>0)).length;
 return '<div class="ocsp-summary-grid"><div><strong>'+esc(sectors.length)+'</strong><span>Information sections</span></div><div><strong>'+esc(recordedMetrics)+' / '+esc(metrics.length)+'</strong><span>Recorded indicators</span></div>'+
  '<div><strong>'+esc(Math.max(0,metrics.length-recordedMetrics))+'</strong><span>Not recorded indicators</span></div><div><strong>'+esc(recordedFacts)+' / '+esc(facts.length)+'</strong><span>Recorded general facts</span></div></div>'+
  '<div class="ocsp-profile-toolbar"><label for="ocsp-sector-filter">Find a country field</label><input id="ocsp-sector-filter" type="search" data-ocsp-filter placeholder="Search indicators, facts, or missing fields…" autocomplete="off">'+
  '<div class="ocsp-profile-actions"><button type="button" data-ocsp-expand>Expand all</button><button type="button" data-ocsp-collapse>Collapse all</button></div></div>'+
  '<div class="ocsp-sector-list" data-ocsp-sector-list>'+sectors.map(def=>renderSector(profile,record,def)).join('')+'</div>'+
  '<p class="ocsp-data-policy">Values retain source and observation year where available. Missing values are marked Not recorded.</p>';
}
function shellHtml(countryId){
 return '<section class="ocsp-shell" data-ocsp-root data-country-value="'+esc(countryId)+'" aria-label="Country sector profile"><header class="ocsp-header"><div><p class="ocsp-eyebrow">OMEGA / COUNTRY INTELLIGENCE</p>'+
  '<h3>National sector profiles</h3><p>Source-traceable economic, trade, governance, industry, security, human-development, resource and infrastructure data.</p></div>'+
  '<button type="button" class="ocsp-primary" data-ocsp-toggle aria-expanded="false">Hide details</button></header>'+
  '<div class="ocsp-status" data-ocsp-status role="status" aria-live="polite">Country information</div><div class="ocsp-content" data-ocsp-content hidden></div></section>';
}
function mount(panel){
 if(!panel||!root.document)return;
 const countryValue=panel.dataset&&(panel.dataset.countryId||panel.dataset.countryCode)||'';
 if(!countryValue)return;
 const current=panel.querySelector('[data-ocsp-root]');
 if(current&&current.getAttribute('data-country-value')===countryValue)return;
 if(current)current.remove();
 panel.insertAdjacentHTML('beforeend',shellHtml(countryValue));state.mountCount++;
 const toggle=panel.querySelector('[data-ocsp-root] [data-ocsp-toggle]');
 if(toggle)Promise.resolve().then(()=>toggleDossier(toggle));
}
function filterContent(content,query){
 const term=norm(query),sectors=content.querySelectorAll('[data-ocsp-sector]');let visible=0;
 sectors.forEach(sector=>{
  const rows=sector.querySelectorAll('[data-ocsp-evidence],.ocsp-signal-row');
  const metaMatches=!term||norm(sector.getAttribute('data-search')||'').includes(term);
  let rowVisible=0;
  rows.forEach(row=>{const match=!term||metaMatches||norm(row.getAttribute('data-search')||row.textContent).includes(term);row.hidden=!match;if(match)rowVisible++});
  const matchSector=metaMatches||rowVisible>0;
  sector.hidden=!matchSector;if(matchSector){visible++;if(term&&rowVisible)sector.open=true}
 });
 const shell=content.closest('[data-ocsp-root]'),status=shell&&shell.querySelector('[data-ocsp-status]');
 if(status)status.textContent=term?(visible?'Matching country fields are shown.':'No country field matches that search.'):'Country information and missing fields are shown below.';
}
async function toggleDossier(button){
 const shell=button.closest('[data-ocsp-root]');if(!shell)return;
 const content=shell.querySelector('[data-ocsp-content]'),status=shell.querySelector('[data-ocsp-status]');if(!content)return;
 if(!content.hidden){content.hidden=true;button.textContent='Show details';button.setAttribute('aria-expanded','false');return}
 if(shell.dataset.loaded==='true'){content.hidden=false;button.textContent='Hide details';button.setAttribute('aria-expanded','true');return}
 button.disabled=true;button.textContent='Loading…';shell.setAttribute('aria-busy','true');content.hidden=false;content.innerHTML='<p class="ocsp-empty">Loading country information…</p>';
 if(status)status.textContent='Loading country information…';
 try{
  await loadData();
  const countryId=shell.getAttribute('data-country-value')||'';
  const record=await resolveCanonicalRecord(countryId,null);
  const iso3=norm(record&&record.identity&&record.identity.iso3)||norm(countryId);
  let profile=state.profileByIso3.get(iso3)||null;
  if(!profile){
   const recordIdentity=record&&record.identity||{};
   const aliases=[countryId,recordIdentity.iso2,recordIdentity.name,recordIdentity.officialName].map(norm).filter(Boolean);
   profile=Array.from(state.profileByIso3.values()).find(item=>{
    const identity=item.identity||{};
    return [identity.iso3,identity.iso2,identity.name,identity.officialName].map(norm).some(code=>code&&aliases.includes(code));
   })||null;
  }
  if(!profile)throw Error('PROFILE_NOT_FOUND_FOR_SELECTED_COUNTRY');
  content.innerHTML=profileMarkup(profile,record);content.hidden=false;shell.dataset.loaded='true';
  button.textContent='Hide details';button.setAttribute('aria-expanded','true');
  if(status)status.textContent='Country details are visible. Fields without a recorded value are labelled Not recorded.';
 }catch(error){
  const message=str(error&&(error.message||error));
  if(status)status.textContent='Country information could not be loaded. Check the connection or retry.';
  content.innerHTML='<p class="ocsp-empty">Country information could not be loaded.</p>';content.hidden=false;button.textContent='Retry';button.setAttribute('aria-expanded','true');
 }finally{button.disabled=false;shell.removeAttribute('aria-busy')}
}
function onClick(event){
 const target=event&&event.target;if(!target||typeof target.closest!=='function')return;
 const toggle=target.closest('[data-ocsp-toggle]');if(toggle){event.preventDefault();toggleDossier(toggle);return}
 const expand=target.closest('[data-ocsp-expand]');if(expand){const shell=expand.closest('[data-ocsp-root]');if(shell)shell.querySelectorAll('[data-ocsp-sector],.ocsp-signals').forEach(item=>{item.open=true});return}
 const collapse=target.closest('[data-ocsp-collapse]');if(collapse){const shell=collapse.closest('[data-ocsp-root]');if(shell)shell.querySelectorAll('[data-ocsp-sector],.ocsp-signals').forEach(item=>{item.open=false})}
}
function onInput(event){const input=event&&event.target;if(!input||input.id!=='ocsp-sector-filter')return;const shell=input.closest('[data-ocsp-root]'),content=shell&&shell.querySelector('[data-ocsp-content]');if(content)filterContent(content,input.value||'')}
function attach(){
 if(!root.document||!root.MutationObserver)return false;
 const panel=root.document.getElementById('omega-country-overview-panel');
 if(panel){const observer=new root.MutationObserver(()=>mount(panel));observer.observe(panel,{childList:true});mount(panel);state.panelObserver=observer;return true}
 const waitObserver=new root.MutationObserver(()=>{
  const found=root.document.getElementById('omega-country-overview-panel');
  if(found){waitObserver.disconnect();const observer=new root.MutationObserver(()=>mount(found));observer.observe(found,{childList:true});mount(found);state.panelObserver=observer}
 });
 waitObserver.observe(root.document.documentElement||root.document.body,{childList:true,subtree:true});return true;
}
function diagnostics(){return {version:VERSION,initialized:!!state.panelObserver,profilesLoaded:!!state.profiles,
 profileCount:state.profiles&&Array.isArray(state.profiles.countries)?state.profiles.countries.length:0,
 sectorCount:state.schema&&Array.isArray(state.schema.sectors)?state.schema.sectors.length:0,lastError:state.lastError,mountCount:state.mountCount,profileUrl:PROFILE_URL}}
const API=Object.freeze({VERSION,init:attach,loadData,diagnostics,formatValue});
root.Omega=root.Omega||{};root.Omega.CountrySectorProfileUI=API;root.OmegaCountrySectorProfileUI=API;
if(root.document&&root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
if(root.document){root.document.addEventListener('click',onClick);root.document.addEventListener('input',onInput)}
})(typeof window!=='undefined'?window:globalThis);
