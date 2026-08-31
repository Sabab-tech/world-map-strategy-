/* OMEGA MINISTER RUNTIME V2
 * Data-driven minister lifecycle, recruitment, replacement, state ownership,
 * capability/workload/stress/experience, and UI synchronization.
 * No minister identity or country-specific profile is hardcoded here.
 */
(() => {
  'use strict';
  if (window.__OMEGA_MINISTER_RUNTIME_V2__) return;
  window.__OMEGA_MINISTER_RUNTIME_V2__ = true;

  const VERSION = '2.0.0';
  const STORAGE_KEY = 'OMEGA_MINISTER_RUNTIME_V2';
  const EVENTS = {
    RECRUITED: 'MINISTER_RECRUITED', FIRED: 'MINISTER_FIRED',
    ASSIGNED: 'MINISTER_ASSIGNED', STATE: 'MINISTER_STATE_UPDATED',
    SYNC: 'MINISTER_STATE_SYNCHRONIZED'
  };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(n)) ? Number(n) : lo));
  const now = () => Date.now();
  const deepClone = o => JSON.parse(JSON.stringify(o));

  class EventBus {
    constructor(){ this.map = new Map(); }
    on(type, fn){ if(!this.map.has(type)) this.map.set(type, new Set()); this.map.get(type).add(fn); return () => this.map.get(type)?.delete(fn); }
    emit(type, payload){ (this.map.get(type) || []).forEach(fn => { try { fn(payload); } catch(e){ console.error('[OMEGA Minister]', type, e); } }); window.dispatchEvent(new CustomEvent(type,{detail:payload})); }
  }

  class MinisterStateRegistry {
    constructor(){ this.profiles = new Map(); this.states = new Map(); this.learning = new Map(); this.active = new Map(); this.version = 0; }
    key(countryId, ministryId){ return `${String(countryId)}::${String(ministryId)}`; }
    registerProfile(p){ if(!p?.id) return; this.profiles.set(String(p.id), deepClone(p)); }
    getMinister(id){ return this.profiles.get(String(id)) || null; }
    getRuntime(id){ return this.states.get(String(id)) || null; }
    getLearning(id){ return this.learning.get(String(id)) || null; }
    getActiveMinister(countryId, ministryId){ const id=this.active.get(this.key(countryId,ministryId)); return id ? this.getEffectiveState(id) : null; }
    getEffectiveState(id){ const p=this.getMinister(id); const r=this.getRuntime(id); const l=this.getLearning(id); if(!p||!r||!l) return null; return {profile:deepClone(p),runtime:deepClone(r),learning:deepClone(l)}; }
    activeIds(){ return [...this.active.values()]; }
    setRuntime(id, patch){ const old=this.states.get(String(id))||{}; this.states.set(String(id), {...old,...deepClone(patch),ministerId:String(id)}); this.version++; }
    setLearning(id, patch){ const old=this.learning.get(String(id))||{}; this.learning.set(String(id), {...old,...deepClone(patch),ministerId:String(id)}); this.version++; }
    assign(id,countryId,ministryId,time){
      const key=this.key(countryId,ministryId), existing=this.active.get(key);
      if(existing && existing !== String(id)) throw new Error('MINISTRY_ALREADY_OCCUPIED');
      this.active.set(key,String(id));
      this.setRuntime(id,{countryId,ministryId,status:'ACTIVE',assignmentTime:time,lastUpdateTick:time});
    }
    unassign(id){ const sid=String(id); for(const [k,v] of this.active) if(v===sid) this.active.delete(k); }
    registerRuntime(id,r,l){ this.states.set(String(id),deepClone(r)); this.learning.set(String(id),deepClone(l)); this.version++; }
    snapshot(){ return {version:this.version,states:Object.fromEntries(this.states),learning:Object.fromEntries(this.learning),active:Object.fromEntries(this.active)}; }
    restore(s){ this.states=new Map(Object.entries(s?.states||{})); this.learning=new Map(Object.entries(s?.learning||{})); this.active=new Map(Object.entries(s?.active||{})); }
  }

  const bus = new EventBus();
  const registry = new MinisterStateRegistry();
  const engine = {
    version: VERSION, bus, registry, profilesLoaded:false,
    config:{ workload:{task:1,urgent:4,crisis:8,decision:2,communication:1,planning:2,administrative:1}, stress:{workload:.25,crisis:.35,economic:.15,political:.1,decision:.1,uncertainty:.05,recovery:.12}, learning:{base:.08,diminishing:.35,maxSkillGain:25} }
  };

  function readConfig(raw){
    if(!raw || typeof raw!=='object') return;
    const src=raw.ministerRuntime || raw.minister_runtime || raw;
    for(const k of ['workload','stress','learning']) if(src[k] && typeof src[k]==='object') engine.config[k]={...engine.config[k],...src[k]};
  }
  function profileName(profile){
    const rn=profile?.regional_names||profile?.regionalNames;
    const region=window.Game?.state?.playerRegion || window.Game?.playerRegion || window.Omega?.World?.playerRegion;
    return (rn && region && rn[region]) || profile?.baseName || profile?.name || profile?.id || 'Minister';
  }
  function normalizeProfiles(raw){
    const db=raw?.ministers_database || raw?.ministers || raw;
    if(!db || typeof db!=='object') throw new Error('INVALID_MINISTERS_JSON');
    for(const [ministry,arr] of Object.entries(db)) if(Array.isArray(arr)) for(const p0 of arr){
      if(!p0?.id) continue;
      const p={...p0, ministryId:p0.ministryId||ministry, baseName:p0.baseName||p0.name||null,
        baseAge:Number(p0.baseAge ?? p0.age ?? 0), baseStats:{...(p0.baseStats||p0.stats||{})},
        efficiencyProfile:{...(p0.efficiencyProfile||p0.efficiency||{})}, personalityProfile:{...(p0.personalityProfile||p0.personality||{})},
        regionalNames:{...(p0.regionalNames||p0.regional_names||{})}};
      registry.registerProfile(p);
    }
    engine.profilesLoaded=true;
  }
  async function loadJson(path){ const r=await fetch(path,{cache:'no-store'}); if(!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); }
  function restore(){ try{ const s=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); if(s) registry.restore(s); }catch(e){ console.warn('[OMEGA Minister] state restore skipped',e); } }
  function persist(){ try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(registry.snapshot())); }catch(e){ console.warn('[OMEGA Minister] persist failed',e); } }
  function candidateList(ministryId){ return [...registry.profiles.values()].filter(p=>p.ministryId===ministryId); }
  function initLearning(id){ return {ministerId:id,totalServiceTime:0,totalTaskExposure:0,domainExperience:{},crisisExperience:0,decisionExperience:0,successfulDecisions:0,failedDecisions:0,completedPlans:0,failedPlans:0,learnedLessons:[],forecastCalibration:0.5,strategyEffectiveness:0.5,skillEvolution:{},specialization:{}}; }
  function initRuntime(id,countryId,ministryId,time){ return {ministerId:id,countryId,ministryId,status:'ACTIVE',recruitmentTime:time,assignmentTime:time,lastUpdateTick:time,workload:0,cognitiveLoad:0,stress:0,fatigue:0,politicalPressure:0,economicPressure:0,crisisPressure:0,confidence:0.5,trust:0.5,activeTasks:[],activePlans:[],pendingDecisions:[],currentObjectives:[],currentAttention:[],currentStrategicPosture:'BALANCED'}; }
  function recruit(id,countryId,ministryId){
    id=String(id); countryId=String(countryId); ministryId=String(ministryId);
    const p=registry.getMinister(id); if(!p) throw new Error('CANDIDATE_NOT_FOUND');
    if(p.ministryId!==ministryId) throw new Error('MINISTRY_MISMATCH');
    const existing=registry.getActiveMinister(countryId,ministryId);
    if(existing && existing.runtime.ministerId!==id) throw new Error('MINISTRY_ALREADY_OCCUPIED');
    const t=now(), old=registry.getRuntime(id), learning=registry.getLearning(id)||initLearning(id);
    const runtime=old && old.status==='ACTIVE' ? old : initRuntime(id,countryId,ministryId,t);
    registry.assign(id,countryId,ministryId,t); registry.setLearning(id,learning); persist();
    const payload={ministerId:id,countryId,ministryId,recruitmentTime:runtime.recruitmentTime,assignmentTime:t};
    bus.emit(EVENTS.RECRUITED,payload); bus.emit(EVENTS.ASSIGNED,payload); synchronize(); return registry.getEffectiveState(id);
  }
  function fire(id){
    id=String(id); const r=registry.getRuntime(id); if(!r || r.status!=='ACTIVE') throw new Error('MINISTER_NOT_ACTIVE');
    const t=now(); registry.unassign(id); registry.setRuntime(id,{status:'FIRED',lastUpdateTick:t}); persist();
    bus.emit(EVENTS.FIRED,{ministerId:id,countryId:r.countryId,ministryId:r.ministryId,timestamp:t}); synchronize(); return registry.getEffectiveState(id);
  }
  function resolveFactors(id,task={}){
    const e=registry.getEffectiveState(id); if(!e) return null; const p=e.profile,r=e.runtime,l=e.learning;
    const stats=Object.values(p.baseStats||{}).map(Number).filter(Number.isFinite); const eff=Object.values(p.efficiencyProfile||{}).map(Number).filter(Number.isFinite);
    const base=(stats.length?stats.reduce((a,b)=>a+b,0)/stats.length:50); const accuracy=eff.length?eff.reduce((a,b)=>a+b,0)/eff.length:50;
    const domain=String(task.domain||'general'); const exp=Number(l.domainExperience?.[domain]||0); const taskFit=Number(task.fit ?? (p.efficiencyProfile?.[domain] ?? 1));
    const experienceFactor=1+Math.min(engine.config.learning.maxSkillGain,exp)/100; const info=clamp(task.informationQuality??1,0,1.5);
    const workloadFactor=1-clamp(r.workload/100,0,.8)*.35; const stressFactor=1-clamp(r.stress/100,0,.9)*.3; const timeFactor=1-clamp(task.timePressure??0,0,1)*.2;
    const capability=clamp(((base*.55+accuracy*.45)/100)*taskFit*experienceFactor*info*workloadFactor*stressFactor*(1-timeFactor),0,1);
    return {capability,breakdown:{base,accuracy,taskFit,experienceFactor,informationQuality:info,workloadFactor,stressFactor,timePressureFactor:1-timeFactor}};
  }
  function updateWorkload(id,ctx={}){
    const r=registry.getRuntime(id); if(!r||r.status!=='ACTIVE') return;
    const c=engine.config.workload, tasks=r.activeTasks||[]; let score=0;
    for(const t of tasks) score += Number(t.complexity||c.task)+Number(t.urgent?c.urgent:0)+Number(t.crisis?c.crisis:0);
    score += (r.pendingDecisions?.length||0)*c.decision + Number(ctx.communicationLoad||0)*c.communication + Number(ctx.planningLoad||0)*c.planning + Number(ctx.administrativeLoad||0)*c.administrative;
    const workload=clamp(score,0,100), cognitiveLoad=clamp(workload*.7+(r.pendingDecisions?.length||0)*2,0,100);
    registry.setRuntime(id,{workload,cognitiveLoad,lastUpdateTick:now()}); bus.emit(EVENTS.STATE,{ministerId:id,reason:'WORKLOAD'});
  }
  function updateStress(id,ctx={}){
    const r=registry.getRuntime(id); if(!r||r.status!=='ACTIVE') return;
    const s=engine.config.stress, recovery=Number(ctx.recovery||0), pressure=clamp(Number(r.workload||0)*s.workload+Number(ctx.crisis||r.crisisPressure||0)*s.crisis+Number(r.economicPressure||0)*s.economic+Number(r.politicalPressure||0)*s.political+Number(ctx.decisionPressure||0)*s.decision+Number(ctx.uncertainty||0)*s.uncertainty-recovery*s.recovery,0,100);
    registry.setRuntime(id,{stress:pressure,fatigue:clamp((r.fatigue||0)+pressure*.01,0,100),lastUpdateTick:now()}); bus.emit(EVENTS.STATE,{ministerId:id,reason:'STRESS'});
  }
  function applyExposure(id,context={}){
    const r=registry.getRuntime(id); if(!r||r.status!=='ACTIVE') return;
    const p=registry.getMinister(id), role=String(p?.ministryId||'').toLowerCase();
    const weights=context.roleExposure||{}; const domain=weights[role]||{};
    registry.setRuntime(id,{economicPressure:clamp(Number(context.economicPressure||0)*Number(domain.economic??1),0,100),politicalPressure:clamp(Number(context.politicalPressure||0)*Number(domain.political??1),0,100),crisisPressure:clamp(Number(context.crisisPressure||0)*Number(domain.crisis??1),0,100)});
    updateWorkload(id,context); updateStress(id,context);
  }
  function recordOutcome(id,task={},outcome={}){
    const r=registry.getRuntime(id), l=registry.getLearning(id); if(!r||!l||r.status!=='ACTIVE') return;
    const domain=String(task.domain||'general'), gain=engine.config.learning.base*Math.pow(1/(1+Number(l.domainExperience?.[domain]||0)*engine.config.learning.diminishing),.5);
    const evolution={...(l.skillEvolution||{})}; evolution[domain]=clamp(Number(evolution[domain]||0)+gain*(outcome.success?1:.35),0,engine.config.learning.maxSkillGain);
    const de={...(l.domainExperience||{})}; de[domain]=clamp(Number(de[domain]||0)+gain,0,100000);
    const lessons=[...(l.learnedLessons||[])]; if(outcome.lesson) lessons.push({time:now(),domain,lesson:String(outcome.lesson)}); if(lessons.length>100) lessons.splice(0,lessons.length-100);
    registry.setLearning(id,{totalTaskExposure:Number(l.totalTaskExposure||0)+1,domainExperience:de,skillEvolution:evolution,learnedLessons:lessons,successfulDecisions:Number(l.successfulDecisions||0)+(outcome.success?1:0),failedDecisions:Number(l.failedDecisions||0)+(outcome.success?0:1),decisionExperience:Number(l.decisionExperience||0)+gain});
    persist(); bus.emit(EVENTS.STATE,{ministerId:id,reason:'LEARNING'});
  }
  function tick(gameYears=0){
    for(const id of registry.activeIds()){
      const r=registry.getRuntime(id),l=registry.getLearning(id); if(!r||!l) continue;
      const dt=Math.max(0,Number(gameYears)||0); if(dt) registry.setLearning(id,{totalServiceTime:Number(l.totalServiceTime||0)+dt});
      updateWorkload(id); updateStress(id,{recovery:dt});
    }
    persist(); synchronize();
  }
  function synchronize(){
    const active=[...registry.active.values()]; const byKey={}; for(const [k,id] of registry.active) byKey[k]=id;
    const snapshot={version:registry.version,activeIds:active,assignments:byKey};
    window.OmegaMinisterState=window.OmegaMinisterState||{}; window.OmegaMinisterState.registry=registry; window.OmegaMinisterState.snapshot=()=>deepClone(snapshot);
    // Notify existing engines without inventing parallel authoritative state.
    for(const target of [window.Omega?.Cabinet,window.CabinetEngine,window.MinistryEngine,window.OmegaCognitiveEngine,window.Omega?.Cognitive]){
      if(target && typeof target.syncMinisterState==='function') { try{ target.syncMinisterState(snapshot); }catch(e){ console.warn('[OMEGA Minister] consumer sync failed',e); } }
    }
    bus.emit(EVENTS.SYNC,snapshot); syncVisibleUI();
  }
  function currentCountryId(){
    const candidates=[window.Game?.state?.countryId,window.Game?.state?.playerCountryId,window.Game?.countryId,window.Omega?.World?.state?.countryId,document.body?.dataset?.countryId];
    return candidates.find(v=>v!==undefined&&v!==null&&String(v).trim()) || null;
  }
  function ministryFromContext(){
    const el=document.querySelector('[data-ministry-id].active,[data-ministry-id][aria-current="true"],[data-ministry-id]');
    if(el?.dataset?.ministryId) return el.dataset.ministryId;
    const txt=(document.body?.innerText||'');
    for(const p of registry.profiles.values()) if(txt.includes(p.ministryId)) return p.ministryId;
    return null;
  }
  function syncVisibleUI(){
    document.querySelectorAll('[data-minister-active-id]').forEach(el=>{ const id=el.getAttribute('data-minister-active-id'); const r=registry.getRuntime(id); el.textContent=r?.status==='ACTIVE'?profileName(registry.getMinister(id)):'VACANT'; });
    document.querySelectorAll('[data-minister-id]').forEach(el=>{ const id=el.getAttribute('data-minister-id'), r=registry.getRuntime(id); const b=el.querySelector('[data-minister-status]'); if(b) b.textContent=r?.status||'AVAILABLE'; });
  }

  function css(){ if(document.getElementById('omega-minister-runtime-css')) return; const s=document.createElement('style'); s.id='omega-minister-runtime-css'; s.textContent=`
#omega-minister-command{position:fixed;inset:0;z-index:2147483000;display:none;pointer-events:none;font-family:Inter,system-ui,sans-serif}
#omega-minister-command.open{display:block}
#omega-minister-command .om-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.68);pointer-events:auto}
#omega-minister-command .om-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(920px,94vw);height:min(82vh,760px);background:#07111d;color:#e6f7ff;border:1px solid #24c8ff;border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.8);display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;isolation:isolate}
#omega-minister-command .om-head{flex:0 0 auto;padding:14px 16px;border-bottom:1px solid rgba(36,200,255,.25);display:flex;justify-content:space-between;gap:12px;align-items:center;background:#0a1725}
#omega-minister-command .om-title{font-weight:800;letter-spacing:.6px}.om-sub{font-size:11px;color:#8fa9ba;margin-top:3px}
#omega-minister-command .om-close{border:1px solid #ef4444;background:#28131a;color:#ff8c8c;border-radius:7px;padding:7px 11px;cursor:pointer}
#omega-minister-command .om-body{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:14px}
#omega-minister-command .om-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
#omega-minister-command .om-card{background:#0b1a29;border:1px solid rgba(36,200,255,.2);border-radius:10px;padding:12px;cursor:pointer}.om-card:hover{border-color:#24c8ff}.om-card.active{box-shadow:0 0 0 1px #24c8ff inset}
#omega-minister-command .om-name{font-weight:800;color:#7fe4ff}.om-meta{font-size:11px;color:#a8b9c5;margin-top:4px;line-height:1.5}.om-actions{display:flex;gap:8px;margin-top:9px}.om-btn{border:1px solid #2a7691;background:#0d2635;color:#dff8ff;border-radius:7px;padding:7px 9px;cursor:pointer;font-weight:700}.om-btn.recruit{border-color:#20c997}.om-btn.fire{border-color:#ef4444;color:#ffb0b0}.om-detail{margin-top:12px;padding:13px;border:1px solid rgba(36,200,255,.25);border-radius:10px;background:#081522;line-height:1.55}.om-kv{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px}.om-bar{height:6px;background:#162a39;border-radius:99px;overflow:hidden}.om-fill{height:100%;background:#24c8ff}.om-empty{padding:22px;text-align:center;color:#8fa9ba;border:1px dashed #35505e;border-radius:10px}
`; document.head.appendChild(s); }

  function openPanel(ministryId){
    if(!engine.profilesLoaded) return;
    const countryId=currentCountryId(); if(!countryId){ alert('Select a country before managing ministers.'); return; }
    const ministry=ministryId||ministryFromContext(); if(!ministry){ alert('Open a ministry before managing ministers.'); return; }
    css(); let root=document.getElementById('omega-minister-command'); if(!root){ root=document.createElement('div'); root.id='omega-minister-command'; root.innerHTML='<div class="om-backdrop"></div><section class="om-panel" role="dialog" aria-modal="true"><header class="om-head"><div><div class="om-title">MINISTER RECRUITMENT & COMMAND</div><div class="om-sub"></div></div><button class="om-close">CLOSE</button></header><main class="om-body"></main></section>'; document.body.appendChild(root); root.querySelector('.om-backdrop').addEventListener('click',()=>root.classList.remove('open')); root.querySelector('.om-close').addEventListener('click',()=>root.classList.remove('open')); }
    root.classList.add('open'); root.querySelector('.om-sub').textContent=`Country: ${countryId} • Ministry: ${ministry} • Five candidates`; renderPanel(root,countryId,ministry);
  }
  function renderPanel(root,countryId,ministry){
    const body=root.querySelector('.om-body'), candidates=candidateList(ministry).slice(0,5), active=registry.getActiveMinister(countryId,ministry);
    body.innerHTML=''; if(candidates.length<5){ body.innerHTML=`<div class="om-empty">The authoritative candidate source currently provides ${candidates.length} candidate(s) for ${ministry}. The UI will not invent missing ministers.</div>`; return; }
    const grid=document.createElement('div'); grid.className='om-grid';
    for(const p of candidates){ const r=registry.getRuntime(p.id), l=registry.getLearning(p.id)||initLearning(p.id); const card=document.createElement('article'); card.className='om-card'+(r?.status==='ACTIVE'?' active':''); card.dataset.ministerId=p.id; card.innerHTML=`<div class="om-name"></div><div class="om-meta">ID: ${p.id}<br>Background: ${p.background||'—'}<br>Age: ${p.baseAge||'—'} • Ideology: ${p.ideology?.type||'—'}<br>Status: <span data-minister-status>${r?.status||'AVAILABLE'}</span></div><div class="om-actions"></div>`; card.querySelector('.om-name').textContent=profileName(p); const actions=card.querySelector('.om-actions'); if(r?.status==='ACTIVE' && r.countryId===countryId && r.ministryId===ministry){ const b=document.createElement('button'); b.className='om-btn fire'; b.textContent='FIRE'; b.onclick=e=>{e.stopPropagation();try{fire(p.id);renderPanel(root,countryId,ministry)}catch(x){alert(x.message)}}; actions.appendChild(b); } else if(!r||r.status!=='ACTIVE'){ const b=document.createElement('button'); b.className='om-btn recruit'; b.textContent='RECRUIT'; b.onclick=e=>{e.stopPropagation();try{recruit(p.id,countryId,ministry);renderPanel(root,countryId,ministry)}catch(x){alert(x.message)}}; actions.appendChild(b); } card.addEventListener('click',()=>showDetail(card,p,countryId,ministry)); grid.appendChild(card); }
    body.appendChild(grid); const detail=document.createElement('div'); detail.className='om-detail'; detail.innerHTML=active?`<strong>ACTIVE MINISTER</strong><div class="om-meta">${profileName(active.profile)} • ${active.runtime.ministerId}<br>Workload ${Math.round(active.runtime.workload)} • Stress ${Math.round(active.runtime.stress)} • Service ${Number(active.learning.totalServiceTime||0).toFixed(2)} years</div>`:`<strong>MINISTRY STATUS: VACANT</strong><div class="om-meta">Recruit one of the five authoritative candidates to fill this position.</div>`; body.appendChild(detail);
  }
  function showDetail(card,p,countryId,ministry){ const root=document.getElementById('omega-minister-command'), old=root.querySelector('.om-detail'); const r=registry.getRuntime(p.id)||{},l=registry.getLearning(p.id)||initLearning(p.id); old.innerHTML=`<strong>${profileName(p)}</strong><div class="om-meta">${p.background||''} • ${p.gender||''} • Age ${p.baseAge||'—'}<br>Minister ID: ${p.id}<br>Ministry: ${ministry}<br>Status: ${r.status||'AVAILABLE'}</div><div class="om-kv"><div>Workload: ${Math.round(r.workload||0)}</div><div>Stress: ${Math.round(r.stress||0)}</div><div>Fatigue: ${Math.round(r.fatigue||0)}</div><div>Trust: ${Math.round((r.trust??.5)*100)}%</div><div>Service: ${Number(l.totalServiceTime||0).toFixed(2)} years</div><div>Tasks: ${(r.activeTasks||[]).length}</div></div>`; }

  async function boot(){
    try{
      const [ministers,config]=await Promise.all([loadJson('ministers.json'),loadJson('minister_system_config.json').catch(()=>null)]);
      normalizeProfiles(ministers); readConfig(config); restore(); synchronize();
      window.OmegaMinisterSystem={...engine,recruit,fire,tick,recordOutcome,applyExposure,resolveFactors,getActive:(c,m)=>registry.getActiveMinister(c,m),openRecruitment:openPanel,getCandidates:candidateList,getMinister:id=>registry.getEffectiveState(id),persist,synchronize};
      window.dispatchEvent(new CustomEvent('OMEGA_MINISTER_RUNTIME_READY',{detail:{version:VERSION,profileCount:registry.profiles.size}}));
      // Public command hook for existing ministry UI. Existing buttons may call this without owning state.
      window.OmegaMinisterSystem.openForMinistry=openPanel;
      console.info('[OMEGA Minister Runtime V2] ready',registry.profiles.size,'profiles');
    }catch(e){ console.error('[OMEGA Minister Runtime V2] boot failed',e); window.__OMEGA_DIAG__?.errors?.push({msg:String(e),type:'MINISTER_RUNTIME_BOOT'}); }
  }
  // A safe, single delegated click hook. It never steals clicks from unrelated UI.
  document.addEventListener('click',e=>{ const b=e.target.closest?.('[data-open-minister-recruitment],[data-minister-recruitment]'); if(!b) return; e.preventDefault(); e.stopPropagation(); openPanel(b.dataset.ministryId||b.getAttribute('data-minister-recruitment')||ministryFromContext()); },true);
  document.addEventListener('DOMContentLoaded',boot,{once:true}); if(document.readyState!=='loading') boot();
})();
