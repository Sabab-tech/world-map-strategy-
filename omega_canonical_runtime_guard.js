/**
 * OMEGA CANONICAL RUNTIME GUARD v1.1.0
 * Single owner for minister interrogation, identity and UI layer isolation.
 */
(function(global){
  'use strict';
  if (global.__OMEGA_CANONICAL_RUNTIME_GUARD__) return;
  global.__OMEGA_CANONICAL_RUNTIME_GUARD__ = true;

  const MODAL_IDS = ['command-hub-modal','cabinet-full-window','ministry-dashboard-view','minister-interrogation-modal','omega-rel-ideology-modal','daily-quests-modal','search-drawer','events-drawer','layers-drawer'];
  const asset=file=>{try{return new URL(String(file).replace(/^\/+/,''),document.baseURI).href;}catch(_){return file;}};

  function isOpen(el){
    if(!el || el.hidden || el.getAttribute('aria-hidden')==='true') return false;
    const s=getComputedStyle(el); return s.display!=='none' && s.visibility!=='hidden' && s.opacity!=='0';
  }

  function syncLayerIsolation(){
    const mapRoot=document.getElementById('render-engine-root');
    const deep=MODAL_IDS.some(id=>isOpen(document.getElementById(id)));
    if(mapRoot){
      mapRoot.style.pointerEvents=deep?'none':'';
      mapRoot.style.userSelect=deep?'none':'';
      mapRoot.style.webkitUserSelect=deep?'none':'';
      mapRoot.setAttribute('aria-hidden',deep?'true':'false');
      try{mapRoot.inert=!!deep;}catch(_){ }
    }
    document.body.classList.toggle('omega-deep-layer-active',deep);
    document.body.setAttribute('data-omega-deep-layer',deep?'1':'0');
  }

  function activeMinister(ministerId){
    const ui=global.OmegaCabinetUI||{}, gs=global.Game?.state||global.gameState||global.OmegaGameState||{};
    const runtime=global.OmegaMinisterSystem;
    const country=gs.countryCode||gs.countryId||gs.playerCountryId||ui.activeCountry||'';
    const ministry=ui.currentMinistryId||ui.activeMinistryId||'';
    if(runtime?.getActive && country && ministry){
      try{const x=runtime.getActive(country,ministry);if(x?.profile)return x.profile;}catch(_){ }
    }
    if(runtime?.getMinister && ministerId){
      try{const x=runtime.getMinister(ministerId);if(x?.profile)return x.profile;}catch(_){ }
    }
    const db=ui.ministriesDatabase||{};
    return (ministerId&&db[ministerId])||ui.currentInterrogatedMinister||ui.currentMinister||ui.activeMinister||null;
  }

  function ministerContext(ministerId){
    const ui=global.OmegaCabinetUI||{}, gs=global.Game?.state||global.gameState||global.OmegaGameState||{};
    const m=activeMinister(ministerId)||{};
    const profile=m.profile||m;
    return {
      countryId:gs.countryCode||gs.countryId||gs.playerCountryId||ui.activeCountry||'',
      countryName:gs.countryName||gs.country?.name||ui.activeCountry||'',
      ministerId:profile.id||m.id||ministerId||ui.currentMinisterId||'',
      ministerName:profile.name||profile.ministerName||m.name||m.ministerName||'',
      ministerRole:profile.role||profile.title||m.role||m.title||'',
      ministryId:profile.ministryId||m.ministryId||ui.currentMinistryId||''
    };
  }

  function syncVisibleIdentity(){
    const ui=global.OmegaCabinetUI||{};
    const ctx=ministerContext(ui.currentMinisterId||ui.currentInterrogatedMinister?.id||ui.currentMinister?.id||'');
    const fields={
      'interrogation-name':ctx.ministerName||'IDENTITY UNRESOLVED',
      'interrogation-role':ctx.ministerRole||'ROLE UNRESOLVED',
      'interrogation-cognitive-status':ctx.ministerName?'Canonical minister runtime active.':'Awaiting authoritative minister identity.'
    };
    for(const[id,text] of Object.entries(fields)){const el=document.getElementById(id);if(el)el.textContent=text;}
  }

  function appendConversation(question,answer,ctx){
    const host=document.getElementById('interrogation-chat-history');if(!host)return;
    const block=document.createElement('div');
    block.style.cssText='padding:10px 12px;margin:6px 0;border:1px solid rgba(0,229,255,.18);border-radius:8px;background:#06111d;color:#e8f7ff;white-space:pre-wrap;user-select:text;-webkit-user-select:text;font-family:var(--font-mono,monospace);font-size:11px;line-height:1.5;';
    block.textContent=`${ctx.ministerName||'MINISTER'}:\n${answer}`;
    host.appendChild(block);host.scrollTop=host.scrollHeight;
  }

  async function answer(question,ministerId){
    const q=String(question||'').trim();if(!q)return;
    const ctx=ministerContext(ministerId);
    syncVisibleIdentity();
    const frame=global.OmegaSemanticPlanner?.frame?global.OmegaSemanticPlanner.frame(q):null;
    try{
      const result=global.MinisterQueryRouter?.offlineQuery ? await global.MinisterQueryRouter.offlineQuery(q,{...ctx,semanticFrame:frame}) : null;
      const text=result?.text||result?.answer||'No evidence-backed answer is available in the current authoritative game data.';
      appendConversation(q,text,ctx);
      try{const h=JSON.parse(localStorage.getItem('omega.ai.canonical.history.v1')||'[]');h.push({q,a:text,frame,ministerId:ctx.ministerId,ministryId:ctx.ministryId,ts:Date.now()});localStorage.setItem('omega.ai.canonical.history.v1',JSON.stringify(h.slice(-200)));}catch(_){ }
    }catch(e){
      const msg=/[\u0980-\u09FF]/.test(q)?`উত্তর তৈরির সময় সমস্যা হয়েছে: ${e.message}`:`The canonical answer pipeline failed: ${e.message}`;
      appendConversation(q,msg,ctx);
    }
  }

  function patchInterrogationAPI(){
    const ui=global.OmegaCabinetUI;if(!ui||ui.__omegaCanonicalPatched)return false;
    ui.__omegaCanonicalPatched=true;
    const originalAskCustom=typeof ui.askCustomQuestion==='function'?ui.askCustomQuestion.bind(ui):null;
    const originalAskPreset=typeof ui.askPresetQuestion==='function'?ui.askPresetQuestion.bind(ui):null;
    const originalProcess=typeof ui.processQuestionAndReply==='function'?ui.processQuestionAndReply.bind(ui):null;
    ui.askCustomQuestion=function(id,q){return answer(q,id);};
    ui.askPresetQuestion=function(id,qid){const m=this.ministriesDatabase?.[id];const q=m?.presetQuestions?.find(x=>String(x.id)===String(qid));return answer(q?.text||String(qid||''),id);};
    ui.processQuestionAndReply=function(m,q){return answer(q,m?.id||this.currentMinisterId||'');};
    global.__OMEGA_LEGACY_INTERROGATION__={originalAskCustom,originalAskPreset,originalProcess};
    syncVisibleIdentity();
    return true;
  }

  function installCapture(){
    if(document.__omegaCanonicalCapture)return;document.__omegaCanonicalCapture=true;
    document.addEventListener('click',e=>{
      const b=e.target?.closest?.('#btn-submit-interrogation');if(!b)return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      const input=document.getElementById('interrogation-input'),ui=global.OmegaCabinetUI||{};const q=input?.value?.trim()||'';const id=ui.currentMinisterId||ui.currentInterrogatedMinister?.id||ui.currentMinister?.id||'';
      if(q){input.value='';answer(q,id);}
    },true);
    document.addEventListener('keydown',e=>{
      if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.target?.id!=='interrogation-input')return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      const q=e.target.value?.trim()||'',ui=global.OmegaCabinetUI||{},id=ui.currentMinisterId||ui.currentInterrogatedMinister?.id||ui.currentMinister?.id||'';
      if(q){e.target.value='';answer(q,id);}
    },true);
  }

  function loadIntegrityOnce(){
    if(global.OmegaAIIntegrity||global.__OMEGA_AI_INTEGRITY__||document.querySelector('script[data-omega-integrity-loader]'))return;
    const s=document.createElement('script');s.src=asset('omega_ai_integrity_layer.js');s.async=false;s.dataset.omegaIntegrityLoader='true';
    s.onerror=()=>console.warn('[OMEGA] Integrity layer unavailable; canonical router remains authoritative.');document.head.appendChild(s);
  }

  function boot(){
    installCapture();syncLayerIsolation();syncVisibleIdentity();loadIntegrityOnce();
    const observer=new MutationObserver(syncLayerIsolation);
    observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['style','class','hidden','aria-hidden']});
    let attempts=0;const timer=setInterval(()=>{attempts++;patchInterrogationAPI();syncLayerIsolation();syncVisibleIdentity();if(attempts>=150||(global.OmegaCabinetUI&&global.OmegaCabinetUI.__omegaCanonicalPatched))clearInterval(timer);},100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
