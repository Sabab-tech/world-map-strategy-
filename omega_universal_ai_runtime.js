/**
 * OMEGA UNIVERSAL AI RUNTIME v1.0.0
 * Canonical UI owner for minister interrogation.
 * Goals: conversation is not rejected as "outside game"; every turn is queued;
 * offline execution is always available; Google AI is optional; no preset-question fallback.
 */
(function (global) {
  'use strict';
  const KEY = 'omega.universal.ai.history.v1';
  const MAX_TURNS = 200;
  let installed = false;
  let queue = Promise.resolve();

  const norm = s => String(s || '').normalize('NFKC').trim();
  const isBn = s => /[\u0980-\u09FF]/.test(String(s || ''));

  function readHistory() {
    try { const x = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(x) ? x : []; }
    catch (_) { return []; }
  }
  function writeHistory(h) {
    try { localStorage.setItem(KEY, JSON.stringify(h.slice(-MAX_TURNS))); } catch (_) {}
  }

  function context() {
    const gs = global.Game?.state || global.gameState || global.Omega?.World?.state || {};
    const ui = global.OmegaCabinetUI || {};
    const m = ui.currentInterrogatedMinister || ui.currentMinister || ui.activeMinister || global.OmegaMinisterState?.activeMinister || {};
    return {
      countryId: gs.countryCode || gs.countryId || gs.playerCountryId || ui.activeCountry || '',
      countryName: gs.countryName || gs.country?.name || ui.activeCountry || '',
      ministerId: m.id || ui.currentMinisterId || '',
      ministerName: m.name || m.displayName || '',
      ministerRole: m.role || m.title || '',
      ministryId: m.ministryId || ui.currentMinistryId || ''
    };
  }

  function localConversation(text, ctx) {
    const n = norm(text).toLowerCase();
    const bn = isBn(text);
    if (/^(hi|hello|hey|good morning|good afternoon|good evening)([.!? ]|$)/i.test(n) || /^(হ্যালো|হাই|আসসালামু আলাইকুম)([.!? ]|$)/i.test(n)) {
      return bn ? 'আমি ভালো আছি এবং আপনার প্রশ্নের জন্য প্রস্তুত।' : 'I am operating normally and ready for your next question.';
    }
    if (/\bhow are you\b/i.test(n) || /তুমি কেমন আছ|তুমি কেমন আছেন|কেমন আছো|কেমন আছেন/i.test(n)) {
      return bn ? 'আমি ভালো আছি এবং আপনার প্রশ্নের জন্য প্রস্তুত।' : 'I am operating normally and ready for your next question.';
    }
    if (/\b(what is your name|what's your name|who are you)\b/i.test(n) || /তোমার নাম কী|তোমার নাম কি|তুমি কে/i.test(n)) {
      if (ctx.ministerName) return bn ? `আমি ${ctx.ministerName}। আমি বর্তমানে নির্বাচিত মন্ত্রীর পরিচয় অনুযায়ী উত্তর দিচ্ছি।` : `My name is ${ctx.ministerName}. I am answering as the currently selected minister.`;
      return bn ? 'আমি OMEGA-এর বর্তমান AI সহকারী। কোনো নির্বাচিত মন্ত্রীর পরিচয় না থাকলে আমি কাল্পনিক মন্ত্রীর নাম ব্যবহার করি না।' : 'I am the current OMEGA AI assistant. I do not invent a minister identity when none is selected.';
    }
    if (/\b(thanks|thank you)\b/i.test(n) || /ধন্যবাদ/i.test(n)) return bn ? 'স্বাগতম।' : 'You are welcome.';
    return null;
  }

  function setBusy(b) {
    const input = document.getElementById('interrogation-input');
    const button = document.getElementById('btn-submit-interrogation');
    if (input) input.removeAttribute('disabled');
    if (button) { button.removeAttribute('disabled'); button.dataset.omegaBusy = b ? '1' : '0'; }
  }

  function output(text, question, meta = {}) {
    let node = document.getElementById('omega-ai-answer-text');
    if (!node) {
      node = document.createElement('div');
      node.id = 'omega-ai-answer-text';
      const host = document.getElementById('omega-ai-answer') || document.getElementById('minister-ai-answer') || document.getElementById('interrogation-answer') || document.getElementById('interrogation-modal-content');
      if (host) host.appendChild(node);
    }
    if (!node) return;
    node.textContent = String(text || '');
    node.dataset.source = meta.source || 'OMEGA_UNIVERSAL_AI_RUNTIME';
    node.dataset.operation = meta.operation || '';

    const h = readHistory();
    h.push({ role: 'user', content: question, timestamp: Date.now() });
    h.push({ role: 'assistant', content: String(text || ''), timestamp: Date.now(), source: meta.source || '' });
    writeHistory(h);
  }

  async function postJson(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = null; try { data = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(data?.error || `HTTP_${r.status}`);
    return data || {};
  }

  async function runTurn(question) {
    const ctx = context();
    const conversation = localConversation(question, ctx);
    if (conversation) { output(conversation, question, { source: 'OFFLINE_CONVERSATION' }); return; }

    const provider = String(localStorage.getItem('omega_ai_provider') || document.getElementById('omega-ai-provider')?.value || 'OFFLINE').toUpperCase();
    const common = { prompt: question, language: isBn(question) ? 'bn' : 'en', ...ctx, timeHorizon: 'CURRENT' };

    if (provider.includes('GOOGLE')) {
      const history = readHistory().slice(-40).map(x => `${x.role}: ${x.content}`).join('\n');
      try {
        const data = await postJson('/api/ai/minister-consult', {
          ...common,
          conversationHistory: history,
          gameState: global.Game?.state || global.gameState || null
        });
        if (data?.text) { output(data.text, question, { source: data.aiPowered ? `GOOGLE:${data.model || 'GEMINI'}` : 'OFFLINE_GROUNDED' }); return; }
        if (data?.result?.text) { output(data.result.text, question, { source: 'OFFLINE_GROUNDED_FALLBACK' }); return; }
      } catch (e) {
        console.warn('[OMEGA UNIVERSAL AI] Google failed, falling back to offline execution:', e.message);
      }
    }

    const data = await postJson('/api/ai/semantic-query', {
      ...common,
      gameState: global.Game?.state || global.gameState || null,
      reservesData: global.Omega?.World?.reservesData || null
    });
    const text = data?.result?.text || data?.text || 'The offline runtime could not produce an evidence-backed answer from the current game state.';
    output(text, question, { source: 'OFFLINE_GROUNDED', operation: data?.result?.operation || '' });
  }

  function enqueue(question) {
    const q = norm(question);
    if (!q) return;
    queue = queue.then(() => runTurn(q)).catch(e => {
      console.error('[OMEGA UNIVERSAL AI] turn failed', e);
      output(isBn(q) ? `উত্তর তৈরি করতে সমস্যা হয়েছে: ${e.message}` : `The answer pipeline failed: ${e.message}`, q, { source: 'PIPELINE_ERROR' });
    });
  }

  function submitFromUI() {
    const input = document.getElementById('interrogation-input');
    const q = input?.value || '';
    if (!norm(q)) return;
    input.value = '';
    enqueue(q);
  }

  function install() {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    document.addEventListener('click', e => {
      const button = e.target?.closest?.('#btn-submit-interrogation');
      if (!button) return;
      e.preventDefault(); e.stopImmediatePropagation();
      submitFromUI();
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      if (e.target?.id !== 'interrogation-input') return;
      e.preventDefault(); e.stopImmediatePropagation();
      submitFromUI();
    }, true);
    global.OmegaUniversalAIRuntime = Object.freeze({ enqueue, submitFromUI, context, readHistory, version: '1.0.0' });
    console.log('[OMEGA UNIVERSAL AI] Canonical interrogation pipeline installed. Unlimited sequential turns enabled.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})(window);
