/**
 * OMEGA CANONICAL RUNTIME GUARD v1.0.0
 * Single owner for minister interrogation + strict UI layer isolation.
 * Legacy ministry renderers remain available for display, but cannot own answers.
 */
(function(global){
  'use strict';
  if (global.__OMEGA_CANONICAL_RUNTIME_GUARD__) return;
  global.__OMEGA_CANONICAL_RUNTIME_GUARD__ = true;

  const MODAL_IDS = [
    'command-hub-modal', 'cabinet-full-window', 'ministry-dashboard-view',
    'minister-interrogation-modal', 'omega-rel-ideology-modal',
    'daily-quests-modal', 'search-drawer', 'events-drawer', 'layers-drawer'
  ];

  const asset = file => {
    try { return new URL(String(file).replace(/^\/+/, ''), document.baseURI).href; }
    catch (_) { return file; }
  };

  function isOpen(el) {
    if (!el) return false;
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function syncLayerIsolation() {
    const mapRoot = document.getElementById('render-engine-root');
    const deepOpen = MODAL_IDS.some(id => isOpen(document.getElementById(id)));
    if (mapRoot) {
      mapRoot.style.pointerEvents = deepOpen ? 'none' : '';
      mapRoot.style.userSelect = deepOpen ? 'none' : '';
      mapRoot.style.webkitUserSelect = deepOpen ? 'none' : '';
      mapRoot.setAttribute('aria-hidden', deepOpen ? 'true' : 'false');
      mapRoot.inert = !!deepOpen;
    }
    document.body.classList.toggle('omega-deep-layer-active', deepOpen);
    document.body.setAttribute('data-omega-deep-layer', deepOpen ? '1' : '0');
  }

  function ministerContext(ministerId) {
    const ui = global.OmegaCabinetUI || {};
    const gs = global.Game?.state || global.gameState || global.OmegaGameState || {};
    const db = ui.ministriesDatabase || {};
    const m = (ministerId && db[ministerId]) || ui.currentInterrogatedMinister || ui.currentMinister || ui.activeMinister || global.OmegaMinisterState?.activeMinister || {};
    return {
      countryId: gs.countryCode || gs.countryId || gs.playerCountryId || ui.activeCountry || '',
      countryName: gs.countryName || gs.country?.name || ui.activeCountry || '',
      ministerId: m.id || ministerId || ui.currentMinisterId || '',
      ministerName: m.ministerName || m.name || m.displayName || '',
      ministerRole: m.role || m.title || '',
      ministryId: m.ministryId || ui.currentMinistryId || ''
    };
  }

  function appendConversation(question, answer, ctx) {
    const host = document.getElementById('interrogation-chat-history');
    if (!host) return;
    const block = document.createElement('div');
    block.style.cssText = 'padding:10px 12px;margin:6px 0;border:1px solid rgba(0,229,255,.18);border-radius:8px;background:rgba(3,12,22,.92);white-space:pre-wrap;font-family:var(--font-mono,monospace);font-size:11px;line-height:1.5;';
    const name = ctx.ministerName || 'Minister';
    block.textContent = `${name}:\n${answer}`;
    host.appendChild(block);
    host.scrollTop = host.scrollHeight;
  }

  async function answer(question, ministerId) {
    const q = String(question || '').trim();
    if (!q || !global.MinisterQueryRouter?.offlineQuery) return;
    const ctx = ministerContext(ministerId);
    appendConversation('SYSTEM', 'Processing through canonical minister intelligence pipeline…', ctx);
    try {
      const result = await global.MinisterQueryRouter.offlineQuery(q, ctx);
      const text = result?.text || result?.answer || 'No evidence-backed answer is available in the current game state.';
      appendConversation(q, text, ctx);
      try {
        const h = JSON.parse(localStorage.getItem('omega.ai.canonical.history.v1') || '[]');
        h.push({ q, a: text, ministerId: ctx.ministerId, ministryId: ctx.ministryId, ts: Date.now() });
        localStorage.setItem('omega.ai.canonical.history.v1', JSON.stringify(h.slice(-200)));
      } catch (_) {}
    } catch (e) {
      const msg = /[\u0980-\u09FF]/.test(q) ? `উত্তর তৈরির সময় সমস্যা হয়েছে: ${e.message}` : `The canonical answer pipeline failed: ${e.message}`;
      appendConversation(q, msg, ctx);
    }
  }

  function patchInterrogationAPI() {
    const ui = global.OmegaCabinetUI;
    if (!ui || ui.__omegaCanonicalPatched) return false;
    ui.__omegaCanonicalPatched = true;

    const originalAskCustom = typeof ui.askCustomQuestion === 'function' ? ui.askCustomQuestion.bind(ui) : null;
    const originalAskPreset = typeof ui.askPresetQuestion === 'function' ? ui.askPresetQuestion.bind(ui) : null;
    const originalProcess = typeof ui.processQuestionAndReply === 'function' ? ui.processQuestionAndReply.bind(ui) : null;

    ui.askCustomQuestion = function(ministerId, questionText) {
      return answer(questionText, ministerId);
    };

    ui.askPresetQuestion = function(ministerId, questionId) {
      const m = this.ministriesDatabase?.[ministerId];
      const q = m?.presetQuestions?.find(x => String(x.id) === String(questionId));
      if (q?.text) return answer(q.text, ministerId);
      return answer(String(questionId || ''), ministerId);
    };

    ui.processQuestionAndReply = function(minister, questionText) {
      const id = minister?.id || this.currentMinisterId || '';
      return answer(questionText, id);
    };

    const btn = document.getElementById('btn-submit-interrogation');
    if (btn) btn.onclick = null;
    const input = document.getElementById('interrogation-input');
    if (input) input.onkeydown = null;

    global.__OMEGA_LEGACY_INTERROGATION__ = { originalAskCustom, originalAskPreset, originalProcess };
    return true;
  }

  function installCapture() {
    if (document.__omegaCanonicalCapture) return;
    document.__omegaCanonicalCapture = true;
    document.addEventListener('click', e => {
      const b = e.target?.closest?.('#btn-submit-interrogation');
      if (!b) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const input = document.getElementById('interrogation-input');
      const ui = global.OmegaCabinetUI || {};
      const q = input?.value?.trim() || '';
      const id = ui.currentMinisterId || ui.currentInterrogatedMinister?.id || ui.currentMinister?.id || '';
      if (q) { if (input) input.value = ''; answer(q, id); }
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.target?.id !== 'interrogation-input') return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const q = e.target.value?.trim() || '';
      const ui = global.OmegaCabinetUI || {};
      const id = ui.currentMinisterId || ui.currentInterrogatedMinister?.id || ui.currentMinister?.id || '';
      if (q) { e.target.value = ''; answer(q, id); }
    }, true);
  }

  async function loadIntegrityOnce() {
    if (global.OmegaAIIntegrity || global.__OMEGA_AI_INTEGRITY__ || document.querySelector('script[data-omega-integrity-loader]')) return;
    const s = document.createElement('script');
    s.src = asset('omega_ai_integrity_layer.js');
    s.async = false;
    s.dataset.omegaIntegrityLoader = 'true';
    s.onerror = () => console.warn('[OMEGA] Integrity layer unavailable; canonical router remains authoritative.');
    document.head.appendChild(s);
  }

  function boot() {
    installCapture();
    syncLayerIsolation();
    loadIntegrityOnce();
    const observer = new MutationObserver(() => syncLayerIsolation());
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style','class','hidden','aria-hidden'] });

    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      patchInterrogationAPI();
      syncLayerIsolation();
      if (attempts >= 120 || (global.OmegaCabinetUI && global.OmegaCabinetUI.__omegaCanonicalPatched)) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window);
