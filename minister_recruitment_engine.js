/* OMEGA MINISTER RECRUITMENT ENGINE v2.2.0 */
(function(global){'use strict';
const VERSION='2.2.0',MAX_CANDIDATES=5;
const text=v=>String(v==null?'':v).trim(),esc=v=>text(v).replace(/[&<>\"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[s]));
const registry=()=>global.OmegaMinisterStateRegistry;
function countryCode(){const g=global.Game||{},c=g.currentActiveCountry;if(typeof c==='string')return text(c).toUpperCase();return text(c?.iso||c?.iso3||c?.code||g.countryCode||global.currentActiveCountry||'').toUpperCase()}
function normalizeCandidateKey(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')}
function candidateTokens(value){return new Set(normalizeCandidateKey(value).split('_').filter(Boolean))}
function scoreCandidateCategory(category,ministryId){const a=candidateTokens(category),b=candidateTokens(ministryId);let score=0;for(const token of a)if(b.has(token))score+=3;return score}
function scoreCandidate(minister,ministryId){const target=candidateTokens(ministryId),blob=[minister.__category,minister.background,minister.id].map(normalizeCandidateKey).join(' ');let score=scoreCandidateCategory(minister.__category,ministryId);for(const token of target)if(blob.includes(token))score+=1;return score}
async function offlineRoster(ministryId,cc){
  let source=global.OmegaMinistersDB;
  if(!source||!Object.values(source).some(Array.isArray)){
    try{
      const response=await fetch('ministers.json',{cache:'no-store'});
      if(response.ok){const raw=await response.json();source=raw.ministers_database||raw.ministers||raw;global.OmegaMinistersDB=source}
    }catch(_){}
  }
  const database=source?.ministers_database||source?.ministers||source||{};
  const all=[];
  for(const [category,list] of Object.entries(database)){
    if(!Array.isArray(list))continue;
    for(const minister of list){
      const id=text(minister?.id||minister?.ministerId);
      if(id)all.push({...minister,id,__category:category});
    }
  }
  const target=normalizeCandidateKey(ministryId);
  const exact=all.filter(minister=>normalizeCandidateKey(minister.__category)===target);
  const pool=exact.length>=MAX_CANDIDATES?exact:[...all].sort((a,b)=>scoreCandidate(b,ministryId)-scoreCandidate(a,ministryId)||String(a.id).localeCompare(String(b.id)));
  const unique=new Map();
  for(const minister of pool){if(!unique.has(minister.id))unique.set(minister.id,minister);if(unique.size>=MAX_CANDIDATES)break}
  return [...unique.values()].slice(0,MAX_CANDIDATES).map(minister=>({...minister,displayName:displayName(minister),ministryCategory:minister.__category,rosterSource:'MINISTERS_JSON_OFFLINE'}));
}
async function fetchRoster(ministryId,cc){
  let apiError='API unavailable';
  try{
    const r=await fetch(`api/minister-candidates?ministryId=${encodeURIComponent(ministryId)}&countryCode=${encodeURIComponent(cc||countryCode())}`,{headers:{Accept:'application/json'}});
    if(!r.ok)apiError=`HTTP ${r.status}`;
    else{
      const d=await r.json();
      if(d.ok&&Array.isArray(d.candidates)&&d.candidates.length===MAX_CANDIDATES)return d.candidates;
      apiError=d.error||`Expected five verified candidates; received ${d.candidates?.length||0}`;
    }
  }catch(error){apiError=text(error?.message||error||apiError)}
  const roster=await offlineRoster(ministryId,cc||countryCode());
  if(roster.length===MAX_CANDIDATES)return roster;
  throw new Error(`Minister roster unavailable (${apiError}). ${roster.length} unique candidates could be found in ministers.json; five are required.`);
}
function activeId(ministryId,cc){return registry()?.getActiveMinister(cc||countryCode(),ministryId)?.ministerId||null}
function operationFor(ministryId){const rules=registry()?.getConfig?.()?.roles||[];const n=String(ministryId||'').toLowerCase();return rules.find(r=>(r.match||[]).some(x=>n.includes(String(x).toLowerCase())))?.operations?.[0]||rules.find(r=>!(r.match||[]).length)?.operations?.[0]||'EXECUTION'}
function capability(candidate,ministryId){const engine=global.OmegaMinisterCapability;if(!engine)return null;return engine.evaluate(candidate,operationFor(ministryId),{workload:0,stress:0,experience:0,informationQuality:1})}
function profileEffects(candidate,ministryId){const behavior=global.OmegaMinisterBehavior;if(!behavior?.analyzeProfile)return null;try{return behavior.analyzeProfile(candidate,operationFor(ministryId),{ministryId,domain:ministryId})}catch(_){return null}}
function displayName(candidate){return candidate.displayName||candidate.name||candidate.regional_names?.south_asia||candidate.regional_names?.western||candidate.id}
function syncDashboard(ministryId){const ui=global.OmegaCabinetUI;if(!ui)return;const active=registry()?.getActiveMinister(countryCode(),ministryId);if(active&&ui.ministriesDatabase?.[ministryId]){const m=ui.ministriesDatabase[ministryId];m.ministerId=active.ministerId;m.activeMinisterId=active.ministerId;m.ministerName=active.staticProfile.baseName;m.ministerProfile=active.staticProfile;m.ministerRuntime=active.runtimeState;m.ministerLearning=active.learningState;m.effectiveCapability=active.effectiveCapability;try{ui.renderCabinet?.(ui.activeCountry)}catch(_){} }}
async function recruit(ministryId,candidate){const cc=countryCode(),name=displayName(candidate),profile={...candidate,name};if(!registry())throw new Error('MINISTER_STATE_REGISTRY_UNAVAILABLE');registry().recruitCandidate(profile,cc,ministryId,global.Game?.gameTime??0);syncDashboard(ministryId);refresh(ministryId);notify('MINISTER RECRUITED',`${name} is now the active minister.`)}
async function fire(ministryId,candidate){const cc=countryCode(),current=registry()?.getActiveMinister(cc,ministryId);if(!current||current.ministerId!==candidate.id)return;registry().removeMinister(candidate.id,'FIRED',global.Game?.gameTime??0);notify('MINISTER FIRED',`${displayName(candidate)} has left office. The ministry is now vacant until a replacement is recruited.`);syncDashboard(ministryId);refresh(ministryId)}
async function render(ministryId,container){const cc=countryCode(),roster=await fetchRoster(ministryId,cc),active=activeId(ministryId,cc);container.innerHTML=`<section class="omega-minister-recruitment"><div class="omr-header"><div><h2>MINISTER RECRUITMENT</h2><p>Select one of five verified candidates. Candidate identity and base attributes come only from ministers.json.</p></div><span class="omr-badge">5 CANDIDATES</span></div><div class="omr-grid">${roster.map((m,i)=>`<button class="omr-card ${m.id===active?'is-active':''}" data-id="${esc(m.id)}" type="button"><span class="omr-index">${String(i+1).padStart(2,'0')}</span><strong>${esc(displayName(m))}</strong><span class="omr-id">ID: ${esc(m.id)}</span><span>${esc(m.background||'')}</span><span>Age ${esc(m.age)}</span><span class="omr-status">${m.id===active?'ACTIVE':'AVAILABLE'}</span></button>`).join('')}</div><div class="omr-detail"><div class="omr-empty">Select a candidate to inspect the complete dossier.</div></div></section>`;const detail=container.querySelector('.omr-detail');container.querySelectorAll('.omr-card').forEach(card=>card.addEventListener('click',()=>{const c=roster.find(x=>x.id===card.dataset.id);const cap=capability(c,ministryId),effects=profileEffects(c,ministryId),isActive=c.id===active;detail.innerHTML=`<div class="omr-dossier"><div class="omr-dossier-top"><div><span class="omr-role">CANDIDATE PROFILE</span><h3>${esc(displayName(c))}</h3><p>${esc(c.background||'No professional background supplied.')}</p></div><span class="omr-active-tag">${isActive?'CURRENTLY ACTIVE':'CANDIDATE'}</span></div><div class="omr-meta"><span>ID <b>${esc(c.id)}</b></span><span>AGE <b>${esc(c.age)}</b></span><span>GENDER <b>${esc(c.gender)}</b></span><span>IDEOLOGY <b>${esc(c.ideology?.type||'Unspecified')}</b></span></div><div class="omr-sections"><div><h4>CORE SKILLS</h4>${Object.entries({...c.stats,...c.efficiency}).filter(([,v])=>typeof v==='number').map(([k,v])=>`<div class="omr-skill"><span>${esc(k.replace(/_/g,' ').toUpperCase())}</span><b>${v}</b><i><em style="width:${Math.max(0,Math.min(100,v))}%"></em></i></div>`).join('')}</div><div><h4>EFFECTIVE CAPABILITY</h4><p>Capability is derived from the runtime role configuration plus candidate attributes and current minister state.</p>${cap?`<div class="omr-capability"><strong>${esc(cap.operation)}</strong><span>Base ${cap.baseCapability} • Effective ${cap.effectiveCapability}</span></div>`:''}</div></div><div class="omr-actions">${isActive?'<button class="omr-fire" data-action="fire" type="button">FIRE MINISTER</button>':'<button class="omr-recruit" data-action="recruit" type="button">RECRUIT MINISTER</button>'}</div></div>`;if(effects){const host=detail.querySelector('.omr-sections > div:nth-child(2)');if(host){const panel=document.createElement('div');panel.className='omr-profile-effects';panel.style.cssText='margin-top:12px;padding:12px;border:1px solid rgba(100,155,190,.35);border-radius:9px;background:rgba(12,28,42,.55)';panel.innerHTML='<h4 style="margin:0 0 8px">PROFILE EFFECTS</h4>'+'<p style="margin:4px 0"><b>Work style:</b> '+esc(effects.workStyle.map(x=>x.replace(/_/g,' ')).join(', '))+'</p>'+'<p style="margin:4px 0"><b>Age stage:</b> '+esc(effects.age.band)+' · operation modifier ×'+effects.age.capabilityMultiplier.toFixed(2)+'</p>'+'<p style="margin:4px 0"><b>Stress resilience:</b> '+esc(effects.stressResilience.handlingLabel)+' ('+effects.stressResilience.score+'/100)</p>'+'<p style="margin:4px 0"><b>Training rate:</b> ×'+effects.training.ageMultiplier.toFixed(2)+' age · ×'+effects.training.learningAgilityMultiplier.toFixed(2)+' learning agility</p>'+'<p style="margin:4px 0"><b>Career fit:</b> '+(effects.careerFit.matched?'match +'+Math.round(effects.careerFit.bonus*100)+'% ('+esc(effects.careerFit.matchedKeywords.join(', '))+')':'no recorded specialty match; neutral modifier')+'</p>';host.appendChild(panel)}}const action=detail.querySelector('[data-action]');action?.addEventListener('click',()=>isActive?fire(ministryId,c):recruit(ministryId,c))}));}
function openRecruitment(ministryId){const content=document.getElementById('ministry-dashboard-content');if(!content)return;let host=content.querySelector('.omega-recruitment-host');if(host)host.remove();host=document.createElement('div');host.className='omega-recruitment-host';content.appendChild(host);render(ministryId,host).catch(e=>host.innerHTML=`<div class="omr-error">MINISTER ROSTER ERROR: ${esc(e.message)}</div>`)}
function injectButton(ui,ministryId){const content=document.getElementById('ministry-dashboard-content');if(!content)return;let b=content.querySelector('[data-omega-recruitment="button"]');if(!b){b=document.createElement('div');b.dataset.omegaRecruitment='button';b.className='omr-launch';b.innerHTML='<button type="button" class="omega-open-recruitment">MINISTER RECRUITMENT • VIEW 5 CANDIDATES</button>';b.firstElementChild.addEventListener('click',()=>openRecruitment(ministryId));content.prepend(b)}}
function patchDashboard(){const ui=global.OmegaCabinetUI;if(!ui||ui.__ministerRecruitmentPatchedV2)return false;ui.__ministerRecruitmentPatchedV2=true;const original=ui.renderMinistryDashboard;ui.renderMinistryDashboard=function(ministryId){const result=original.call(this,ministryId);Promise.resolve(result).then(()=>injectButton(this,ministryId));return result};return true}
function refresh(ministryId){const host=document.querySelector('#ministry-dashboard-content .omega-recruitment-host');if(host)render(ministryId,host).catch(()=>{})}
function notify(title,message){if(typeof global.showOmegaNotification==='function')global.showOmegaNotification(title,message,'success');else console.log(`[${title}] ${message}`)}
const api={VERSION,fetchRoster,activeId,render,openRecruitment,recruit,fire,refresh,notify,patchDashboard,operationFor};global.OmegaMinisterRecruitment=api;
let tries=0;const timer=setInterval(()=>{tries++;if(patchDashboard()||tries>200)clearInterval(timer)},100);patchDashboard();
})(typeof window!=='undefined'?window:globalThis);
