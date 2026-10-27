/* OMEGA LIVE MINISTER CONTROL v9.1.1
 * Authoritative bridge for minister appointment + grounded interrogation.
 * Source of truth: ministers.json -> omega_minister_runtime_v2.js.
 */
(function(global){'use strict';
  if(global.__OMEGA_MINISTER_CONTROL_V9_1_1__) return; global.__OMEGA_MINISTER_CONTROL_V9_1_1__=true;
  const text=v=>v==null?'':String(v).trim(), norm=v=>text(v).normalize('NFKC').toLowerCase().replace(/[._-]+/g,' ').replace(/\s+/g,' ').trim();
  const country=()=>{const v=[global.OmegaCabinetUI?.activeCountry,global.Game?.state?.countryId,global.Game?.state?.playerCountryId,global.Game?.currentActiveCountry,global.Omega?.World?.state?.countryId,document.body?.dataset?.countryId].find(x=>x!==undefined&&x!==null&&text(x));return text(v).toUpperCase().replace(/\s+/g,'_')||null};
  const ministry=()=>text(global.OmegaLayerManager?.activeMinistryId||global.OmegaCabinetUI?.currentDashboardMinistryId||global.OmegaCabinetUI?.activeMinistryId||global.OmegaCabinetUI?.currentMinistryId||global.Game?.state?.activeMinistryId);
  const legacyRegistry=()=>global.OmegaMinisterState?.registry||null;
  const canonicalRegistry=()=>{const r=global.OmegaMinisterStateRegistry;return r&&typeof r.recruitCandidate==='function'&&typeof r.getActiveMinister==='function'?r:null};
  const registry=()=>legacyRegistry()||canonicalRegistry()||null, ministerId=p=>String(p?.id||p?.ministerId||''), safeName=p=>text(p?.baseName||p?.name||p?.ministerName||ministerId(p)||'Minister');
  const candidates=m=>{const r=registry();return r?.profiles?[...r.profiles.values()].filter(p=>norm(p?.ministryId)===norm(m)):[]};
  const active=(m,countryOverride)=>{
    const c=text(countryOverride).toUpperCase().replace(/\s+/g,'_')||country();if(!c||!m)return null;
    const canonical=canonicalRegistry();
    if(canonical){try{
      // Ministry lists render many rows at once. Prefer a lightweight active assignment
      // summary so opening a screen does not clone each minister's memory and learning logs.
      const state=typeof canonical.getActiveMinisterSummary==='function'
        ?canonical.getActiveMinisterSummary(c,m):canonical.getActiveMinister(c,m);
      return state?Object.assign({},state,{profile:state.staticProfile||{},runtime:state.runtimeState||{},learning:state.learningState||{}}):null;
    }catch(_){return null}}
    const legacy=legacyRegistry();
    try{return legacy&&typeof legacy.getActiveMinister==='function'?legacy.getActiveMinister(c,m):null}catch(_){return null}
  };
  // Never alias the legacy V2 registry over the canonical lifecycle authority.
  function ensureGlobalRegistryAlias(){return canonicalRegistry()||legacyRegistry()}
  async function appoint(m,p,countryOverride){
    // The calling screen owns the selected-country context. Never silently appoint
    // into whichever country happens to be active in the legacy cabinet globals.
    const c=text(countryOverride).toUpperCase().replace(/\s+/g,'_')||country(),id=ministerId(p);
    if(!c)throw Error('COUNTRY_CONTEXT_UNRESOLVED');
    if(!m)throw Error('MINISTRY_CONTEXT_UNRESOLVED');
    if(!id)throw Error('MINISTER_ID_UNRESOLVED');
    const engine=global.OmegaMinisterRecruitment;
    if(!engine||typeof engine.recruit!=='function'||typeof engine.fire!=='function')throw Error('MINISTER_RECRUITMENT_ENGINE_UNAVAILABLE');
    const current=active(m,c);
    const currentId=String(current?.ministerId||current?.profile?.id||current?.profile?.ministerId||'');
    if(currentId===id){
      try{localStorage.setItem('OMEGA_MINISTER_SELECTED_V9::'+c+'::'+m,id)}catch(_){}
      return current;
    }
    if(currentId)await engine.fire(m,{id:currentId,name:safeName(current.profile||{})},c);
    try{
      const result=await engine.recruit(m,p,c);
      try{localStorage.setItem('OMEGA_MINISTER_SELECTED_V9::'+c+'::'+m,id)}catch(_){}
      if(global.OmegaCabinetUI){global.OmegaCabinetUI.currentInterrogatedMinister=p;global.OmegaCabinetUI.currentActiveMinisterId=id}
      const payload={countryId:c,ministryId:m,ministerId:id,profile:p,timestamp:Date.now()};
      ['MINISTER_ASSIGNED','MINISTER_SELECTED'].forEach(t=>global.dispatchEvent(new CustomEvent(t,{detail:payload})));
      return active(m,c)||result;
    }catch(error){
      if(currentId&&current?.profile){
        const previous=current.profile;
        const restoreProfile={
          id:currentId,name:previous.baseName||previous.name||currentId,
          age:previous.baseAge??previous.age,background:previous.background,gender:previous.gender,
          stats:previous.baseStats||previous.stats||{},efficiency:previous.efficiencyProfile||previous.efficiency||{},
          ideology:previous.ideology||{},personalityProfile:previous.personalityProfile||{},
          education:previous.education||null,careerBackground:previous.careerBackground||null,
          regional_names:previous.regionalNames||previous.regional_names||{}
        };
        try{await engine.recruit(m,restoreProfile,c)}
        catch(restoreError){error.message=String(error.message||error)+'; previous minister restoration also failed: '+String(restoreError.message||restoreError)}
      }
      throw error;
    }
  }
  function selected(m,cs){const a=active(m),aid=a?.profile?.id||a?.profile?.ministerId;if(aid){const i=cs.findIndex(p=>ministerId(p)===String(aid));if(i>=0)return i}try{const s=localStorage.getItem(`OMEGA_MINISTER_SELECTED_V9::${country()}::${m}`),i=cs.findIndex(p=>ministerId(p)===s);if(i>=0)return i}catch(_){}return 0}
  function style(){if(document.getElementById('omega-minister-control-v9-style'))return;const s=document.createElement('style');s.id='omega-minister-control-v9-style';s.textContent=`#omega-live-minister-selector{width:100%;box-sizing:border-box;margin:6px 0;padding:8px;border:1px solid rgba(0,229,255,.4);border-radius:8px;background:rgba(5,14,25,.97);color:#fff;font:10px var(--font-mono,monospace);position:relative;z-index:50}#omega-live-minister-selector .v9-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}#omega-live-minister-selector .v9-head b{color:#00e5ff}#omega-live-minister-selector .v9-head span{color:#94a3b8}#omega-live-minister-selector .v9-row{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:6px}#omega-live-minister-selector select,#omega-live-minister-selector button{height:34px;width:100%;box-sizing:border-box;border-radius:6px;font:800 10px var(--font-mono,monospace)}#omega-live-minister-selector select{background:#081522;color:#fff;border:1px solid #00e5ff;padding:4px}#omega-live-minister-selector button{background:#00e5ff;color:#001018;border:1px solid #00e5ff;cursor:pointer}#omega-live-minister-selector .v9-meta{margin-top:5px;color:#94a3b8;font-size:8px;line-height:1.35}.omega-v9-profile{width:100%;box-sizing:border-box;margin:0 0 6px;padding:8px;border:1px solid rgba(255,215,0,.25);border-radius:8px;background:rgba(8,15,25,.96);font:8px/1.35 var(--font-mono,monospace);color:#cbd5e1}.omega-v9-profile b{color:#ffd700}.omega-v9-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:5px 0}.omega-v9-grid div{padding:4px;background:rgba(255,255,255,.04);border-radius:4px;overflow:hidden}.omega-v9-grid strong{display:block;color:#fff;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:600px){.omega-v9-grid{grid-template-columns:1fr 1fr}.omega-v9-profile{font-size:8px}}@media(max-width:380px){#omega-live-minister-selector .v9-row{grid-template-columns:1fr}#omega-live-minister-selector button{margin-top:4px}}`;document.head.appendChild(s)}
  function profile(m,p,countryOverride){document.querySelectorAll('.omega-v9-profile').forEach(x=>x.remove());const r=active(m,countryOverride)?.runtime||{},stats=p?.baseStats||p?.stats||{},eff=p?.efficiencyProfile||p?.efficiency||{},ideology=p?.ideology?.type||p?.ideology||'—',el=document.createElement('section');el.className='omega-v9-profile';el.innerHTML=`<div><strong style="font-size:12px;color:#fff">${safeName(p)}</strong> <span style="color:#00e5ff">${text(p?.id||p?.ministerId)}</span></div><div class="omega-v9-grid"><div>AGE<strong>${text(p?.baseAge??p?.age??'—')}</strong></div><div>BACKGROUND<strong>${text(p?.background||'—')}</strong></div><div>IDEOLOGY<strong>${text(ideology)}</strong></div><div>STATUS<strong>${text(r.status||'ACTIVE')}</strong></div></div><div><b>STATS</b> ${Object.entries(stats).map(([k,v])=>`${k.replace(/_/g,' ')} ${v}`).join(' • ')||'—'}</div><div style="margin-top:4px"><b>EFFICIENCY</b> ${Object.entries(eff).map(([k,v])=>`${k.replace(/_/g,' ')} ${v}`).join(' • ')||'—'}</div><div style="margin-top:4px"><b>LIVE</b> workload ${Math.round(r.workload||0)} • stress ${Math.round(r.stress||0)} • fatigue ${Math.round(r.fatigue||0)} • confidence ${Math.round((r.confidence||0)*100)}%</div>`;document.getElementById('ministry-dashboard-content')?.prepend(el)}
  function install(m){if(!m)return false;const c=country();ensureGlobalRegistryAlias();const ui=global.OmegaCabinetUI,content=document.getElementById('ministry-dashboard-content');if(!c||!ui||!content)return false;const cs=candidates(m);if(!cs.length)return false;style();document.getElementById('omega-live-minister-selector')?.remove();let idx=selected(m,cs),a=active(m);if(a){idx=cs.findIndex(p=>ministerId(p)===String(a.profile?.id||a.profile?.ministerId));if(idx<0)idx=0}const box=document.createElement('section');box.id='omega-live-minister-selector';box.innerHTML=`<div class="v9-head"><b>MINISTER APPOINTMENT</b><span id="omega-v9-status">${a?.profile?`CURRENT: ${safeName(a.profile)}`:'NO ACTIVE MINISTER'}</span></div><div class="v9-row"><select id="omega-v9-choice" aria-label="Select Minister"></select><button type="button" id="omega-v9-appoint">APPOINT MINISTER</button></div><div class="v9-meta">Five authoritative candidates are read from ministers.json through the V2 registry. Selecting a candidate does not appoint them until APPOINT MINISTER is pressed.</div>`;const select=box.querySelector('#omega-v9-choice');cs.forEach((p,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${safeName(p)} • ${ministerId(p)} • AGE ${p.baseAge??p.age??'—'}`;select.appendChild(o)});select.value=String(idx);content.prepend(box);profile(m,cs[idx]);select.addEventListener('change',()=>{const p=cs[Number(select.value)];box.querySelector('#omega-v9-status').textContent=p?`READY: ${safeName(p)}`:'';profile(m,p)});const appointButton=box.querySelector('#omega-v9-appoint');appointButton.addEventListener('click',()=>{const p=cs[Number(select.value)];if(!p||appointButton.disabled)return;const status=box.querySelector('#omega-v9-status');appointButton.disabled=true;status.textContent='APPOINTING...';Promise.resolve(appoint(m,p)).then(()=>{status.textContent=`APPOINTED: ${safeName(p)}`;profile(m,p)}).catch(e=>{status.textContent='APPOINTMENT FAILED: '+text(e?.message||e);console.error('[OMEGA V9] appointment failed',e)}).finally(()=>{appointButton.disabled=false})});return true}
  function patchUI(){ensureGlobalRegistryAlias();const ui=global.OmegaCabinetUI;if(!ui||ui.__omegaMinisterV9)return false;ui.__omegaMinisterV9=true;if(typeof ui.renderMinistryDashboard==='function'){const old=ui.renderMinistryDashboard;ui.renderMinistryDashboard=function(m){const out=old.apply(this,arguments);setTimeout(()=>install(m),50);return out}}return true}
  function renderAnswer(q,m,p){const n=norm(q),bn=/[\u0980-\u09FF]/.test(q),age=p?.baseAge??p?.age;if((/\bhow old are you\b|\bwhat is your age\b|\bhow old\b/.test(n)||/তোমার বয়স কত|তোমার বয়স কত|আপনার বয়স কত|আপনার বয়স কত|কত বছর বয়স|কত বছর বয়স/.test(n))&&age!=null)return bn?`আমার বয়স ${age} বছর।`:`I am ${age} years old.`;if(/\bwho are you\b|\bwhat is your name\b|তুমি কে|আপনি কে|তোমার নাম কী|তোমার নাম কি|আপনার নাম কী|আপনার নাম কি/.test(n))return bn?`আমি ${safeName(p)}, ${text(m).replace(/_/g,' ')}-এর মন্ত্রী।`:`I am ${safeName(p)}, Minister of ${text(m).replace(/_/g,' ')}.`;if(/\bbackground\b|\bwhat did you do\b|পেশা|পটভূমি|কী কাজ|কি কাজ/.test(n))return text(p.background)||'এই মন্ত্রীর প্রামাণ্য প্রোফাইলে পটভূমির তথ্য নেই।';if(/\bideology\b|মতাদর্শ|আদর্শ/.test(n))return bn?`আমার মতাদর্শ: ${text(p.ideology?.type||p.ideology)||'প্রোফাইলে নির্দিষ্ট নয়'}.`:`My ideology is ${text(p.ideology?.type||p.ideology)||'not specified in my profile'}.`;if(/\bminister id\b|\byour id\b|মন্ত্রী আইডি|তোমার আইডি|আপনার আইডি/.test(n))return bn?`আমার মন্ত্রী আইডি ${ministerId(p)}।`:`My minister ID is ${ministerId(p)}.`;if(/\bwhat ministry\b|\bwhich ministry\b|কোন মন্ত্রণালয়|কোন মন্ত্রণালয়ে|কোন মন্ত্রণালয়ে/.test(n))return bn?`আমি ${text(m).replace(/_/g,' ')} মন্ত্রণালয়ের মন্ত্রী।`:`I serve as Minister of ${text(m).replace(/_/g,' ')}.`;if(/\bstrengths?\b|\bskills?\b|\bcapabilit|দক্ষতা|সক্ষমতা/.test(n)){const s=p.baseStats||p.stats||{};return bn?`আমার নথিভুক্ত সক্ষমতা: ${Object.entries(s).map(([k,v])=>`${k.replace(/_/g,' ')} ${v}`).join(', ')||'কোনো স্কোর নেই'}.`:`My recorded capabilities are ${Object.entries(s).map(([k,v])=>`${k.replace(/_/g,' ')} ${v}`).join(', ')||'not recorded'}.`}return null}
  function appendChat(q,a){const c=document.getElementById('interrogation-chat-history');if(!c)return;const add=(role,t,cls)=>{const d=document.createElement('div');d.className=`minister-chat-message ${cls||''}`;d.innerHTML=`<strong>${role}:</strong><div>${t}</div>`;c.appendChild(d)};add('EXECUTIVE COMMANDER (You)',q,'user-message');add('MINISTER',a,'minister-message');c.scrollTop=c.scrollHeight}
  function interceptInterrogation(){document.addEventListener('click',e=>{const b=e.target.closest?.('#btn-submit-interrogation');if(!b)return;const input=document.getElementById('interrogation-input'),q=text(input?.value);if(!q)return;const m=ministry(),a=active(m),p=a?.profile;if(!m||!p)return;const answer=renderAnswer(q,m,p);if(!answer)return;e.preventDefault();e.stopImmediatePropagation();appendChat(q,answer);if(input)input.value=''},true)}
  function boot(){ensureGlobalRegistryAlias();patchUI();interceptInterrogation();let tries=0;const timer=setInterval(()=>{tries++;ensureGlobalRegistryAlias();patchUI();const m=ministry();if(m)install(m);if(tries>100)clearInterval(timer)},100)}
  global.OmegaLiveMinisterSelectorV9={VERSION:'9.1.1',install,appoint,active,candidates};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(typeof window!=='undefined'?window:globalThis);

/* ============================================================================
 * OMEGA 17-MINISTRY LIVE ACTIVATION BRIDGE v2.0.0
 * Compatibility shim for the canonical 17-ministry runtime controller.
 * Scheduling is owned by index.html's single engine loop. This file does not
 * create a second timer and therefore cannot double-tick ministries.
 * ============================================================================ */
(function(global){'use strict';
  const runtime=global.OMEGA_MINISTRY_RUNTIME_V1||global.Omega?.MinistryRuntime;
  function sync(){
    if(!runtime || typeof runtime.init!=='function') return false;
    const kernel=global.Omega?.Kernel;
    if(!kernel) return false;
    if(!runtime.init(kernel)) return false;

    const ids=runtime.getIds();
    // GLOBAL_MINISTRY_MANIFEST is canonical, immutable source data. Keep live
    // activation in runtime-owned state below instead of mutating frozen records.

    global.Omega=global.Omega||{};
    global.Omega.App=global.Omega.App||{};
    global.Omega.App.MINISTRIES=Object.freeze(ids.slice());
    global.Omega.App.activeMinistries=Object.freeze(ids.slice());

    const runtimeStatus = global.__OMEGA_MINISTRY_RUNTIME_STATUS__ || {};
    if (!Object.isFrozen(runtimeStatus)) {
      ids.forEach(id => { runtimeStatus[String(id)] = 'ACTIVE'; });
      global.__OMEGA_MINISTRY_RUNTIME_STATUS__ = runtimeStatus;
    }
    global.__OMEGA_17_MINISTRY_ACTIVATION__={
      version:'2.0.0',
      controllerVersion:runtime.version,
      ids:ids.slice(),
      scheduler:'OMEGA_ENGINE_LOOP',
      startedAt:global.__OMEGA_17_MINISTRY_ACTIVATION__?.startedAt||Date.now()
    };

    try{
      global.dispatchEvent?.(new CustomEvent('OMEGA_ALL_17_MINISTRIES_LIVE',{
        detail:{count:ids.length,ids:ids.slice(),scheduler:'OMEGA_ENGINE_LOOP'}
      }));
    }catch(_){}
    console.info('[OMEGA 17M] ALL 17 MINISTRIES LIVE VIA CANONICAL RUNTIME',ids);
    return true;
  }
  function start(){
    if(sync()) return;
    setTimeout(start,250);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})(typeof window!=='undefined'?window:globalThis);
