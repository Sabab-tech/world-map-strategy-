/**
 * OMEGA MINISTER RECRUITMENT ENGINE v1.0.0
 * Runtime candidate roster, recruitment/firing, active assignment and Cabinet sync.
 * Candidate facts come from /api/minister-candidates -> ministers.json only.
 */
(function(global){
  'use strict';
  const VERSION='1.0.0';
  const STORAGE_KEY='OMEGA_ACTIVE_MINISTERS_V1';
  const MAX_CANDIDATES=5;
  const state={rosters:new Map(),active:new Map(),details:new Map()};
  const text=v=>String(v==null?'':v).trim();
  const key=(countryCode,ministryId)=>`${text(countryCode).toUpperCase()}:${text(ministryId).toLowerCase()}`;
  const esc=v=>text(v).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  function storage(){try{return global.localStorage||null}catch(_){return null}}
  function load(){const s=storage();if(!s)return;try{const obj=JSON.parse(s.getItem(STORAGE_KEY)||'{}');Object.entries(obj).forEach(([k,v])=>state.active.set(k,v));}catch(_){} }
  function save(){const s=storage();if(!s)return false;try{const obj={};state.active.forEach((v,k)=>obj[k]=v);s.setItem(STORAGE_KEY,JSON.stringify(obj));return true}catch(_){return false}}
  load();

  async function fetchRoster(ministryId,countryCode){
    const k=key(countryCode,ministryId);
    if(state.rosters.has(k)) return state.rosters.get(k);
    const url=`/api/minister-candidates?ministryId=${encodeURIComponent(ministryId)}&countryCode=${encodeURIComponent(countryCode||'')}`;
    const response=await fetch(url,{headers:{Accept:'application/json'}});
    if(!response.ok) throw new Error(`Minister roster request failed (${response.status})`);
    const data=await response.json();
    if(!data.ok) throw new Error(data.error||'Minister roster unavailable');
    const roster=Array.isArray(data.candidates)?data.candidates.slice(0,MAX_CANDIDATES):[];
    if(roster.length!==MAX_CANDIDATES) throw new Error(`Ministry ${ministryId} has ${roster.length} candidates; exactly five are required.`);
    state.rosters.set(k,roster); return roster;
  }

  function countryCode(){
    const g=global.Game||{};
    const c=g.currentActiveCountry;
    if(typeof c==='string') return text(c).toUpperCase();
    return text(c?.iso||c?.iso3||c?.code||g.countryCode||'').toUpperCase();
  }

  function activeId(ministryId,cc){return state.active.get(key(cc||countryCode(),ministryId))||null;}

  async function ensureRoster(ministryId,cc){
    const roster=await fetchRoster(ministryId,cc);
    const k=key(cc||countryCode(),ministryId);
    const current=state.active.get(k);
    if(current && roster.some(x=>x.id===current)) return roster;
    const cabinet=global.OmegaCabinetUI;
    let fallback=null;
    if(cabinet && typeof cabinet.getMinisterProfile==='function'){
      for(const candidate of roster){
        try{const p=cabinet.getMinisterProfile(ministryId,cc,candidate.id)||cabinet.getMinisterProfile(candidate.id,cc);if(p){fallback=candidate;break;}}catch(_){}
      }
    }
    const next=fallback?.id||roster[0].id;
    state.active.set(k,next); save();
    return roster;
  }

  function candidateDisplay(candidate,cc){
    const cabinet=global.OmegaCabinetUI;
    try{
      if(cabinet && typeof cabinet.getMinisterProfile==='function'){
        const p=cabinet.getMinisterProfile(candidate.id,cc);
        if(p?.name) return p.name;
      }
    }catch(_){}
    const names=candidate.regional_names||{};
    const region=(global.Game?.currentActiveCountry?.region||global.Game?.currentActiveCountry?.worldRegion||'').toString().toLowerCase();
    return names[region]||names.south_asia||names.western||candidate.name||candidate.id;
  }

  function enrichCandidate(candidate,cc){
    return {...candidate,displayName:candidateDisplay(candidate,cc)};
  }

  async function render(ministryId, container){
    const cc=countryCode();
    const roster=(await ensureRoster(ministryId,cc)).map(x=>enrichCandidate(x,cc));
    const current=activeId(ministryId,cc);
    container.innerHTML=`
      <section class="omega-minister-recruitment">
        <div class="omr-header">
          <div><h2>MINISTER RECRUITMENT</h2><p>Five candidates are available for this ministry. Select a candidate to inspect the full dossier.</p></div>
          <span class="omr-badge">5 CANDIDATES</span>
        </div>
        <div class="omr-grid">
          ${roster.map((m,i)=>`<button class="omr-card ${m.id===current?'is-active':''}" data-minister-id="${esc(m.id)}" type="button">
            <span class="omr-index">${String(i+1).padStart(2,'0')}</span>
            <strong>${esc(m.displayName)}</strong>
            <span>${esc(m.background||'Candidate Minister')}</span>
            <span>Age ${esc(m.age)}</span>
            <span class="omr-status">${m.id===current?'ACTIVE MINISTER':'AVAILABLE'}</span>
          </button>`).join('')}
        </div>
        <div class="omr-detail" id="omega-minister-detail">
          <div class="omr-empty">Select one of the five candidates to view the full dossier.</div>
        </div>
      </section>`;

    container.querySelectorAll('.omr-card').forEach(card=>card.addEventListener('click',()=>showDetail(ministryId,roster.find(x=>x.id===card.dataset.ministerId),container)));
  }

  function skills(candidate){
    const stats=candidate.stats||{}; const eff=candidate.efficiency||{};
    const entries=[...Object.entries(stats),...Object.entries(eff)].filter(([k,v])=>typeof v==='number');
    return entries.map(([k,v])=>`<div class="omr-skill"><span>${esc(k.replace(/_/g,' ').toUpperCase())}</span><b>${v}</b><i><em style="width:${Math.max(0,Math.min(100,v))}%"></em></i></div>`).join('');
  }

  async function showDetail(ministryId,candidate,container){
    if(!candidate)return;
    const cc=countryCode();
    const current=activeId(ministryId,cc);
    const detail=container.querySelector('#omega-minister-detail');
    if(!detail)return;
    const isActive=candidate.id===current;
    const action=isActive
      ? `<button class="omr-fire" type="button" data-action="fire">FIRE MINISTER</button>`
      : `<button class="omr-recruit" type="button" data-action="recruit">RECRUIT MINISTER</button>`;
    detail.innerHTML=`
      <div class="omr-dossier">
        <div class="omr-dossier-top"><div><span class="omr-role">CANDIDATE PROFILE</span><h3>${esc(candidate.displayName)}</h3><p>${esc(candidate.background||'')}</p></div><span class="omr-active-tag">${isActive?'CURRENTLY ACTIVE':'CANDIDATE'}</span></div>
        <div class="omr-meta"><span>AGE <b>${esc(candidate.age)}</b></span><span>GENDER <b>${esc(candidate.gender)}</b></span><span>IDEOLOGY <b>${esc(candidate.ideology?.type||'Unspecified')}</b></span></div>
        <div class="omr-sections"><div><h4>CORE SKILLS</h4>${skills(candidate)}</div><div><h4>PROFESSIONAL PROFILE</h4><p>${esc(candidate.background||'No background supplied by the minister database.')}</p></div></div>
        <div class="omr-actions">${action}</div>
      </div>`;
    const btn=detail.querySelector('button[data-action]');
    if(btn)btn.addEventListener('click',()=>isActive?fire(ministryId,candidate):recruit(ministryId,candidate));
  }

  function syncActive(ministryId,candidate){
    const ui=global.OmegaCabinetUI; if(!ui||!ui.ministriesDatabase)return;
    const m=ui.ministriesDatabase[ministryId]; if(!m)return;
    const cc=countryCode();
    const display=candidateDisplay(candidate,cc);
    m.ministerId=candidate.id; m.ministerName=display; m.activeMinisterId=candidate.id; m.ministerProfile=candidate;
    m.efficiency=Number(candidate.efficiency?.accuracy??m.efficiency??0);
    m.trust=Number(candidate.stats?.strategic??m.trust??0);
    m.stress=Number(Math.max(0,100-(candidate.efficiency?.crisis_handling??70)));
    ui.currentInterrogatedMinister={ministerId:candidate.id,name:display,ministerName:display,ministryId,countryCode:cc,role:m.role,profile:candidate};
    state.active.set(key(cc,ministryId),candidate.id); save();
    try{window.dispatchEvent(new CustomEvent('OMEGA_MINISTER_CHANGED',{detail:{countryCode:cc,ministryId,candidateId:candidate.id,candidate}}));}catch(_){}
    if(typeof ui.renderCabinet==='function') ui.renderCabinet(ui.activeCountry);
  }

  async function recruit(ministryId,candidate){
    const roster=await ensureRoster(ministryId,countryCode()); syncActive(ministryId,candidate);
    global.OmegaMinisterRecruitment.refresh(ministryId);
    global.OmegaMinisterRecruitment.notify('MINISTER RECRUITED',`${candidateDisplay(candidate,countryCode())} is now Minister of ${ministryId.replace(/_/g,' ')}.`);
  }

  async function fire(ministryId,candidate){
    const cc=countryCode();
    const current=activeId(ministryId,cc); if(current!==candidate.id)return;
    const roster=await ensureRoster(ministryId,cc); const replacement=roster.find(x=>x.id!==candidate.id);
    if(!replacement)return;
    const ok=global.confirm?global.confirm('Fire the current minister? A replacement must be recruited immediately.'):true;
    if(!ok)return;
    state.active.delete(key(cc,ministryId));save();
    global.OmegaMinisterRecruitment.notify('MINISTER FIRED',`${candidateDisplay(candidate,cc)} has been removed from office.`);
    syncActive(ministryId,replacement);
    global.OmegaMinisterRecruitment.refresh(ministryId);
  }

  function patchDashboard(){
    const ui=global.OmegaCabinetUI;if(!ui||ui.__ministerRecruitmentPatched)return false;ui.__ministerRecruitmentPatched=true;
    const original=ui.renderMinistryDashboard;
    ui.renderMinistryDashboard=async function(ministryId){
      const result=original.call(this,ministryId);
      Promise.resolve(result).then(()=>injectButtonAndPanel(this,ministryId));
      return result;
    };
    const originalTab=ui.setDashboardTab;
    ui.setDashboardTab=function(tab){
      if(tab==='personnel'&&this.currentDashboardMinistryId){injectButtonAndPanel(this,this.currentDashboardMinistryId,true);return;}
      return originalTab.call(this,tab);
    };
    return true;
  }

  function injectButtonAndPanel(ui,ministryId,open=false){
    const content=document.getElementById('ministry-dashboard-content');if(!content)return;
    const existing=content.querySelector('[data-omega-recruitment="button"]');
    if(!existing){const host=document.createElement('div');host.dataset.omegaRecruitment='button';host.style.margin='10px 0';host.innerHTML=`<button type="button" class="omega-open-recruitment">MINISTER RECRUITMENT • VIEW 5 CANDIDATES</button>`;host.firstElementChild.addEventListener('click',()=>openRecruitment(ui,ministryId));content.prepend(host);}
    if(open)openRecruitment(ui,ministryId);
  }
  async function openRecruitment(ui,ministryId){
    const content=document.getElementById('ministry-dashboard-content');if(!content)return;
    const old=content.querySelector('.omega-recruitment-host'); if(old)old.remove();
    const host=document.createElement('div');host.className='omega-recruitment-host';content.appendChild(host);
    try{await render(ministryId,host);}catch(e){host.innerHTML=`<div class="omr-error">MINISTER ROSTER ERROR: ${esc(e.message)}</div>`;}
  }

  function refresh(ministryId){const content=document.getElementById('ministry-dashboard-content');const host=content?.querySelector('.omega-recruitment-host');if(host)render(ministryId,host).catch(()=>{});}
  function notify(title,message){if(typeof global.showOmegaNotification==='function')global.showOmegaNotification(title,message,'success');else console.log(`[${title}] ${message}`);}

  const api={VERSION,fetchRoster,ensureRoster,render,refresh,recruit,fire,activeId,notify,patchDashboard};
  global.OmegaMinisterRecruitment=api;
  let tries=0;const timer=setInterval(()=>{tries++;if(patchDashboard()||tries>200)clearInterval(timer)},100);patchDashboard();
})(typeof window!=='undefined'?window:globalThis);
