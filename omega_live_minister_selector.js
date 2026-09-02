/* OMEGA LIVE MINISTER CONTROL v7.0.0-PRODUCTION
 * Authoritative minister selection + responsive UI + direct OmegaAIIntegrity bridge.
 * The legacy canned interrogation path is intentionally never called.
 */
(function(global){
'use strict';
const VERSION='7.0.0-PRODUCTION';
const STORAGE_KEY='OMEGA_APPOINTED_MINISTERS_V7';
let profiles=null;
let loading=null;
let integrityLoading=null;

const text=v=>v==null?'':String(v).trim();
const norm=v=>text(v).toLowerCase().replace(/[&/]+/g,' ').replace(/[._-]+/g,' ').replace(/\s+/g,' ').trim();
const game=()=>global.Game||{};
const storage=()=>{try{return global.localStorage}catch(_){return null}};

function country(){
  const g=game(),s=g.state||{};
  return text(g.currentActiveCountry||s.countryId||s.playerCountryId||'BANGLADESH').toUpperCase().replace(/\s+/g,'_');
}
function ministry(){
  const ui=global.OmegaCabinetUI||{},g=game(),s=g.state||{};
  return text(global.OmegaLayerManager&&global.OmegaLayerManager.activeMinistryId||ui.currentDashboardMinistryId||ui.activeMinistryId||ui.currentMinistryId||s.activeMinistryId||'');
}
function readStore(){const s=storage();if(!s)return{};try{return JSON.parse(s.getItem(STORAGE_KEY)||'{}')}catch(_){return{}}}
function writeStore(v){const s=storage();if(!s)return;try{s.setItem(STORAGE_KEY,JSON.stringify(v))}catch(_){}}
function selectedIndex(m){const v=Number(readStore()[country()+'_'+m]);return Number.isFinite(v)&&v>=0?Math.floor(v):0}
function region(){const ui=global.OmegaCabinetUI;try{return norm(ui&&ui.getRegionForCountry?ui.getRegionForCountry(country()):'').replace(/\s+/g,'_')||'western'}catch(_){return'western'}}
function nameOf(c){
  const direct=text(c&&(c.name||c.ministerName||c.baseName));
  if(direct)return direct;
  const rn=c&&c.regional_names;
  if(rn&&typeof rn==='object'){
    const keys=[region(),'south_asia','islamic','western','east_asia','sub_saharan','latin_america','slavic','south_east_asia'];
    for(const k of keys)if(text(rn[k]))return text(rn[k]);
  }
  return text(c&&(c.id||c.ministerId||'Minister'));
}
function candidates(m){
  const ui=global.OmegaCabinetUI;
  if(ui&&typeof ui.getMinisterProfile==='function'){
    try{const p=ui.getMinisterProfile(m,country());if(p&&Array.isArray(p.candidates)&&p.candidates.length)return p.candidates}catch(_){}
  }
  if(!profiles)return[];
  const wanted=norm(m),out=[];
  if(Array.isArray(profiles))return profiles.filter(p=>norm(p&&p.ministryId||p&&p.ministry||p&&p.department||'')===wanted);
  for(const[k,a]of Object.entries(profiles)){
    if(!Array.isArray(a))continue;
    if(norm(k)===wanted)out.push(...a);
    else out.push(...a.filter(p=>norm(p&&p.ministryId||p&&p.ministry||p&&p.department||'')===wanted));
  }
  return out;
}
function identity(c,m,i){
  return Object.assign({},c,{__omegaIndex:i,name:nameOf(c),ministerName:nameOf(c),ministerId:text(c&&((c.ministerId)||c.id)),ministryId:m,countryCode:country()});
}
function sync(ui,m,c,i){
  if(!ui||!c)return;
  const id=identity(c,m,i),key=country()+'_'+m;
  ui.appointedMinisterIndex=ui.appointedMinisterIndex||{};
  ui.appointedMinisterIndex[key]=i;
  ui.appointedMinisterIndex[m]=i;
  ui.currentInterrogatedMinister=id;
  if(ui.ministriesDatabase&&ui.ministriesDatabase[m]){
    const target=ui.ministriesDatabase[m];
    target.ministerName=id.ministerName;
    if(id.role)target.role=id.role;
    if(id.efficiency&&typeof id.efficiency==='object'){
      const vals=Object.values(id.efficiency).map(Number).filter(Number.isFinite);
      if(vals.length)target.efficiency=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    }else if(Number.isFinite(Number(id.efficiency)))target.efficiency=Number(id.efficiency);
    if(Number.isFinite(Number(id.trust)))target.trust=Number(id.trust);
    if(id.loyalty)target.loyalty=id.loyalty;
    if(Number.isFinite(Number(id.stress)))target.stress=Number(id.stress);
    target.__omegaSelectedMinisterId=id.ministerId;
  }
  try{global.dispatchEvent(new CustomEvent('MINISTER_SELECTED',{detail:id}))}catch(_){}
}
function profileCard(c){
  const old=document.getElementById('omega-minister-profile-card');if(old)old.remove();
  const stats=c&&c.stats&&typeof c.stats==='object'?c.stats:{};
  const eff=c&&c.efficiency&&typeof c.efficiency==='object'?c.efficiency:{};
  const ideology=c&&c.ideology&&typeof c.ideology==='object'?c.ideology.type:c&&c.ideology;
  const box=document.createElement('section');box.id='omega-minister-profile-card';box.className='omega-minister-profile-card';
  const statText=Object.entries(stats).map(([k,v])=>`${k.replace(/_/g,' ')} ${v}`).join(' • ')||'No skill vector exposed';
  const effText=Object.entries(eff).map(([k,v])=>`${k.replace(/_/g,' ')} ${v}`).join(' • ')||'No efficiency vector exposed';
  box.innerHTML=`<div class="omega-profile-head"><strong>${nameOf(c)}</strong><span>${text(c&&((c.id)||c.ministerId))}</span></div><div class="omega-profile-grid"><div>AGE<strong>${text(c&&c.age||c&&c.baseAge||'—')}</strong></div><div>BACKGROUND<strong>${text(c&&c.background||'—')}</strong></div><div>IDEOLOGY<strong>${text(ideology||'—')}</strong></div><div>GENDER<strong>${text(c&&c.gender||'—')}</strong></div></div><div class="omega-profile-line"><span>SKILLS</span>${statText}</div><div class="omega-profile-line"><span>EFFICIENCY</span>${effText}</div>`;
  const content=document.getElementById('ministry-dashboard-content');if(content)content.insertBefore(box,content.firstChild||null);
}
function injectStyle(){
  if(document.getElementById('omega-minister-control-style-v7'))return;
  const s=document.createElement('style');s.id='omega-minister-control-style-v7';
  s.textContent=`
#omega-live-minister-selector{display:block!important;box-sizing:border-box!important;width:100%!important;max-width:100%!important;margin:8px 0!important;padding:8px 10px!important;border:1px solid rgba(0,229,255,.42)!important;border-radius:9px!important;background:rgba(3,15,28,.96)!important;color:#f8fafc!important;position:relative!important;z-index:20!important;overflow:hidden!important}
#omega-live-minister-selector .omega-minister-selector-title{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:0 0 6px;font:800 10px var(--font-mono,monospace);letter-spacing:.4px}
#omega-live-minister-selector .omega-minister-selector-title label{color:#00e5ff}
#omega-live-minister-selector .omega-minister-selector-title span{color:#94a3b8;font-size:9px}
#omega-live-minister-selector .omega-minister-selector-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(112px,150px);gap:6px;align-items:stretch}
#omega-live-minister-selector select{box-sizing:border-box!important;width:100%!important;min-width:0!important;height:34px!important;padding:6px 8px!important;border:1px solid #00e5ff!important;border-radius:7px!important;background:#081522!important;color:#f8fafc!important;font:700 11px var(--font-mono,monospace)!important;overflow:hidden!important}
#omega-live-minister-selector button{box-sizing:border-box!important;width:100%!important;min-width:0!important;height:34px!important;padding:6px 8px!important;border:1px solid #00e5ff!important;border-radius:7px!important;background:linear-gradient(135deg,#00e5ff,#2563eb)!important;color:#001018!important;font:900 10px var(--font-mono,monospace)!important;white-space:nowrap!important;cursor:pointer!important}
#omega-live-minister-selector .omega-minister-selector-meta{margin-top:5px;color:#64748b;font:9px/1.35 var(--font-mono,monospace);white-space:normal}
#omega-minister-profile-card{display:block;box-sizing:border-box;width:100%;margin:0 0 8px;padding:9px 10px;border:1px solid rgba(255,215,0,.25);border-radius:9px;background:rgba(10,17,28,.94);color:#cbd5e1;font:9px/1.35 var(--font-mono,monospace);overflow:hidden}
#omega-minister-profile-card .omega-profile-head{display:flex;justify-content:space-between;gap:6px;padding-bottom:5px;margin-bottom:5px;border-bottom:1px solid rgba(255,255,255,.08)}
#omega-minister-profile-card .omega-profile-head strong{font-size:13px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#omega-minister-profile-card .omega-profile-head span{color:#00e5ff;white-space:nowrap}
#omega-minister-profile-card .omega-profile-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}
#omega-minister-profile-card .omega-profile-grid>div{min-width:0;padding:5px;background:rgba(255,255,255,.03);border-radius:5px;overflow:hidden}
#omega-minister-profile-card .omega-profile-grid strong{display:block;color:#fff;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#omega-minister-profile-card .omega-profile-line{margin-top:5px;overflow:hidden}
#omega-minister-profile-card .omega-profile-line span{color:#ffd700;font-weight:800;margin-right:4px}
@media(max-width:600px){#omega-live-minister-selector .omega-minister-selector-row{grid-template-columns:1fr 118px}#omega-live-minister-selector button{font-size:9px;padding:5px 4px}#omega-minister-profile-card .omega-profile-grid{grid-template-columns:1fr 1fr}}
@media(max-width:380px){#omega-live-minister-selector .omega-minister-selector-row{grid-template-columns:1fr}#omega-live-minister-selector button{width:100%}}
`;
  document.head.appendChild(s);
}
function applyDisplayed(m,c){
  const ui=global.OmegaCabinetUI;if(!ui||!c)return;
  sync(ui,m,c,c.__omegaIndex||0);
  const dash=document.getElementById('ministry-dashboard-view');if(!dash)return;
  const wanted=nameOf(c);
  dash.querySelectorAll('strong').forEach(n=>{const t=text(n.textContent);if(t==='Eng. Tariq Al-Hassan'||t==='Minister: Eng. Tariq Al-Hassan'||/^Eng\.\s/.test(t)&&t.length<80)n.textContent=wanted});
  profileCard(c);
}
function install(m){
  const ui=global.OmegaCabinetUI,dash=document.getElementById('ministry-dashboard-view'),content=document.getElementById('ministry-dashboard-content');
  if(!ui||!dash||!content||!m)return false;
  const cs=candidates(m);if(!cs.length)return false;
  injectStyle();
  const old=document.getElementById('omega-live-minister-selector');if(old)old.remove();
  const i=Math.min(selectedIndex(m),cs.length-1),active=identity(cs[i],m,i);sync(ui,m,cs[i],i);
  const box=document.createElement('section');box.id='omega-live-minister-selector';
  box.innerHTML=`<div class="omega-minister-selector-title"><label>ACTIVE MINISTER</label><span id="omega-minister-selector-status">${nameOf(cs[i])}</span></div><div class="omega-minister-selector-row"><select id="omega-minister-choice" aria-label="Select active minister"></select><button type="button" id="omega-minister-appoint">CHANGE MINISTER</button></div><div class="omega-minister-selector-meta">Selection is saved for this country + ministry. Identity, profile, skills and interrogation use the selected Minister ID.</div>`;
  const select=box.querySelector('#omega-minister-choice');
  cs.forEach((c,n)=>{const o=document.createElement('option');o.value=String(n);o.textContent=`${nameOf(c)} • ${text(c.id||c.ministerId||'')}`;select.appendChild(o)});
  select.value=String(i);
  content.insertBefore(box,content.firstChild||null);
  applyDisplayed(m,active);profileCard(active);
  select.addEventListener('change',()=>{const c=cs[Number(select.value)];const label=box.querySelector('#omega-minister-selector-status');if(label&&c)label.textContent='READY: '+nameOf(c)});
  box.querySelector('#omega-minister-appoint').addEventListener('click',()=>{
    const k=Number(select.value),c=cs[k];if(!c)return;
    const store=readStore();store[country()+'_'+m]=k;writeStore(store);c.__omegaIndex=k;sync(ui,m,c,k);applyDisplayed(m,c);
    const label=box.querySelector('#omega-minister-selector-status');if(label)label.textContent='APPOINTED: '+nameOf(c);
    if(typeof ui.renderMinistryDashboard==='function'&&!ui.__omegaSelectorRefreshing){ui.__omegaSelectorRefreshing=true;ui.renderMinistryDashboard(m);setTimeout(()=>{ui.__omegaSelectorRefreshing=false;install(m)},100)}
  });
  return true;
}
async function loadProfiles(){
  if(profiles)return profiles;
  if(loading)return loading;
  loading=fetch('ministers.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('ministers.json HTTP '+r.status);return r.json()}).then(d=>{profiles=d&&((d.ministers_database)||d.ministers)||d;return profiles}).catch(e=>{console.warn('[OMEGA Minister Control] ministers.json load failed',e);return null}).finally(()=>{loading=null});
  return loading;
}
function ensureIntegrity(){
  if(global.OmegaAIIntegrity&&typeof global.OmegaAIIntegrity.answer==='function')return Promise.resolve(true);
  if(integrityLoading)return integrityLoading;
  integrityLoading=new Promise(resolve=>{
    const existing=document.querySelector('script[data-omega-ai-integrity]');
    if(existing){existing.addEventListener('load',()=>resolve(!!global.OmegaAIIntegrity),{once:true});existing.addEventListener('error',()=>resolve(false),{once:true});setTimeout(()=>resolve(!!global.OmegaAIIntegrity),1500);return;}
    const s=document.createElement('script');s.src='/omega_ai_integrity_layer.js?v=7.0.0';s.async=false;s.dataset.omegaAiIntegrity='true';s.onload=()=>resolve(!!global.OmegaAIIntegrity);s.onerror=()=>resolve(false);document.head.appendChild(s);
  }).finally(()=>{integrityLoading=null});
  return integrityLoading;
}
function patchDashboard(){
  const ui=global.OmegaCabinetUI;if(!ui||ui.__omegaMinisterControlV7)return false;
  ui.__omegaMinisterControlV7=true;loadProfiles();
  if(typeof ui.renderMinistryDashboard==='function'){
    const original=ui.renderMinistryDashboard;
    ui.renderMinistryDashboard=function(m){const r=original.apply(this,arguments);setTimeout(()=>{if(!ui.__omegaSelectorRefreshing)install(m)},0);setTimeout(()=>{if(!document.getElementById('omega-live-minister-selector'))install(m)},300);return r};
  }
  if(typeof ui.openInterrogationModal==='function'){
    const originalOpen=ui.openInterrogationModal;
    ui.openInterrogationModal=function(m){const cs=candidates(m),i=Math.min(selectedIndex(m),Math.max(0,cs.length-1));if(cs[i]){sync(ui,m,cs[i],i);applyDisplayed(m,cs[i])}return originalOpen.apply(this,arguments)};
  }
  return true;
}
function patchQuestion(){
  const ui=global.OmegaCabinetUI;if(!ui||typeof ui.processQuestionAndReply!=='function')return false;
  if(ui.__omegaSemanticQuestionV7)return true;
  ui.__omegaSemanticQuestionV7=true;
  ui.__omegaLegacyQuestionHandler=ui.processQuestionAndReply;
  ui.processQuestionAndReply=function(minister,questionText){
    const q=text(questionText),m=ui.currentInterrogatedMinister||minister||{};
    const id=text(m.ministerId||m.id);
    if(!id){console.error('[OMEGA LIVE MINISTER] No active Minister ID; refusing legacy canned response.');return}
    if(!global.OmegaAIIntegrity||typeof global.OmegaAIIntegrity.answer!=='function'){
      ensureIntegrity().then(()=>{if(global.OmegaAIIntegrity&&typeof global.OmegaAIIntegrity.answer==='function')dispatchRuntimeQuestion(q);else dispatchRuntimeFailure(q,id)});return;
    }
    dispatchRuntimeQuestion(q);
    function dispatchRuntimeQuestion(question){
      try{
        const answer=global.OmegaAIIntegrity.answer(question,ui);
        ui.chatHistories=ui.chatHistories||{};ui.chatHistories[id]=ui.chatHistories[id]||[];
        ui.chatHistories[id].push({sender:'USER',text:question,timestamp:Date.now()});
        ui.chatHistories[id].push({sender:'MINISTER',senderName:text(m.ministerName||m.name),text:answer,response:answer,timestamp:Date.now(),aiPowered:true,source:'OMEGA_AI_INTEGRITY_V2_RUNTIME',grounded:true});
        if(typeof ui.renderChatHistory==='function')ui.renderChatHistory(id);
        return answer;
      }catch(e){console.error('[OMEGA LIVE MINISTER] Runtime answer failure',e);dispatchRuntimeFailure(question,id)}
    }
    function dispatchRuntimeFailure(question,ministerId){
      const msg='Runtime cognitive answer unavailable. The legacy canned response has been disabled.';
      ui.chatHistories=ui.chatHistories||{};ui.chatHistories[ministerId]=ui.chatHistories[ministerId]||[];ui.chatHistories[ministerId].push({sender:'MINISTER',senderName:text(m.ministerName||m.name),text:msg,response:msg,timestamp:Date.now(),aiPowered:false,grounded:false});if(typeof ui.renderChatHistory==='function')ui.renderChatHistory(ministerId);return msg;
    }
  };
  return true;
}
function boot(){patchDashboard();patchQuestion();const m=ministry();if(m)install(m);setTimeout(boot,500)}
global.OmegaLiveMinisterSelector={VERSION,install,ensureIntegrity};
boot();
})(typeof globalThis!=='undefined'?globalThis:window);