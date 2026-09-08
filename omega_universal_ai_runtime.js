/**
 * OMEGA UNIVERSAL AI RUNTIME v1.4.0
 * Canonical interrogation owner. Works on both Node-backed hosts and static hosts
 * such as GitHub Pages: no POST-only dependency for offline execution.
 *
 * Game-language ontology + bridge now live inside omega_language_system.js.
 * World-state facts remain authoritative in runtime datasets and capabilities
 * remain authoritative in their own registry/engines.
 */
(function (global) {
  'use strict';
  const KEY = 'omega.universal.ai.history.v1';
  const MAX_TURNS = 200;
  let installed = false;
  let queue = Promise.resolve();
  let datasetPromise = null;
  let gameLanguagePromise = null;
  const norm = s => String(s || '').normalize('NFKC').trim();
  const isBn = s => /[\u0980-\u09FF]/.test(String(s || ''));

  function readHistory() { try { const x = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(x) ? x : []; } catch (_) { return []; } }
  function writeHistory(h) { try { localStorage.setItem(KEY, JSON.stringify(h.slice(-MAX_TURNS))); } catch (_) {} }

  function context() {
    const gs = global.Game?.state || global.gameState || global.Omega?.World?.state || {};
    const ui = global.OmegaCabinetUI || {};
    const m = ui.currentInterrogatedMinister || ui.currentMinister || ui.activeMinister || global.OmegaMinisterState?.activeMinister || {};
    return {
      countryId: gs.countryCode || gs.countryId || gs.playerCountryId || ui.activeCountry || '',
      countryName: gs.countryName || gs.country?.name || ui.activeCountry || '',
      ministerId: m.id || ui.currentMinisterId || '', ministerName: m.name || m.displayName || '',
      ministerRole: m.role || m.title || '', ministryId: m.ministryId || ui.currentMinistryId || '', gameState: gs
    };
  }

  function localConversation(text, ctx) {
    const n = norm(text).toLowerCase(), bn = isBn(text);
    if (/^(hi|hello|hey|good morning|good afternoon|good evening)([.!? ]|$)/i.test(n) || /^(হ্যালো|হাই|আসসালামু আলাইকুম)([.!? ]|$)/i.test(n)) return bn ? 'আমি ভালো আছি এবং আপনার প্রশ্নের জন্য প্রস্তুত।' : 'I am operating normally and ready for your next question.';
    if (/\bhow are you\b/i.test(n) || /তুমি কেমন আছ|তুমি কেমন আছেন|কেমন আছো|কেমন আছেন/i.test(n)) return bn ? 'আমি ভালো আছি এবং আপনার প্রশ্নের জন্য প্রস্তুত।' : 'I am operating normally and ready for your next question.';
    if (/\b(what is your name|what's your name|who are you)\b/i.test(n) || /তোমার নাম কী|তোমার নাম কি|তুমি কে/i.test(n)) return ctx.ministerName ? (bn ? `আমি ${ctx.ministerName}। আমি বর্তমানে নির্বাচিত মন্ত্রীর পরিচয় অনুযায়ী উত্তর দিচ্ছি।` : `My name is ${ctx.ministerName}. I am answering as the currently selected minister.`) : (bn ? 'আমি OMEGA-এর বর্তমান AI সহকারী।' : 'I am the current OMEGA AI assistant.');
    if (/\b(how old are you|what is your age|what's your age)\b/i.test(n) || /তোমার বয়স কত|তোমার বয়স কত|তোমার বয়স কী|তোমার বয়স কী/i.test(n)) return bn ? 'আমার মানুষের মতো কোনো বয়স নেই। আমি একটি সফটওয়্যার AI, তাই আমার বয়স বছর দিয়ে মাপা হয় না।' : 'I do not have a human age. I am software AI, so my age is not measured in years.';
    if (/\b(thanks|thank you)\b/i.test(n) || /ধন্যবাদ/i.test(n)) return bn ? 'স্বাগতম।' : 'You are welcome.';
    return null;
  }

  function output(text, question, meta = {}) {
    let node = document.getElementById('omega-ai-answer-text');
    if (!node) { node = document.createElement('div'); node.id = 'omega-ai-answer-text'; const host = document.getElementById('omega-ai-answer') || document.getElementById('minister-ai-answer') || document.getElementById('interrogation-answer') || document.getElementById('interrogation-modal-content'); if (host) host.appendChild(node); }
    if (!node) return;
    node.textContent = String(text || ''); node.dataset.source = meta.source || 'OMEGA_UNIVERSAL_AI_RUNTIME'; node.dataset.operation = meta.operation || '';
    if (meta.reasoning) node.dataset.reasoning = JSON.stringify(meta.reasoning).slice(0, 2000);
    if (meta.gameLanguage) node.dataset.gameLanguage = JSON.stringify(meta.gameLanguage).slice(0, 2000);
    const h = readHistory(); h.push({ role: 'user', content: question, timestamp: Date.now() }); h.push({ role: 'assistant', content: String(text || ''), timestamp: Date.now(), source: meta.source || '', reasoning: meta.reasoning || null, gameLanguage: meta.gameLanguage || null }); writeHistory(h);
  }

  async function postJson(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = null; try { data = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(data?.error || `HTTP_${r.status}`);
    return data || {};
  }

  async function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src && s.src.endsWith('/' + src))) return resolve();
      const s = document.createElement('script'); s.src = '/' + src; s.onload = resolve; s.onerror = () => reject(new Error(`Unable to load ${src}`)); document.head.appendChild(s);
    });
  }

  async function ensureReasoningDispatcher() {
    if (global.OmegaReasoningDispatcher) return global.OmegaReasoningDispatcher;
    try { await loadScript('omega_reasoning_dispatcher.js'); } catch (_) { return null; }
    return global.OmegaReasoningDispatcher || null;
  }

  async function ensureGameLanguageLayer() {
    if (gameLanguagePromise) return gameLanguagePromise;
    gameLanguagePromise = (async () => {
      if (!global.OmegaLanguageSystem) await loadScript('omega_language_system.js');
      const system = global.OmegaLanguageSystem;
      const bridge = global.OmegaGameLanguageBridge || null;
      if (!system || !bridge) return null;
      try {
        bridge.load(system.gameLanguageOntology());
        bridge.install();
        return bridge;
      } catch (_) { return null; }
    })().catch(() => null);
    return gameLanguagePromise;
  }

  async function browserOffline() {
    if (datasetPromise) return datasetPromise;
    datasetPromise = (async () => {
      if (!global.OfflineSemanticBrain) await loadScript('offline_semantic_brain.js');
      if (!global.OfflineQueryEngine) await loadScript('offline_query_engine.js');
      await ensureGameLanguageLayer();
      const files = ['resources.json','resources_2.json','economy.json','population.json','countries.json','relations.json','country_policy.json','world.json','society.json','offline_semantic_knowledge.json','resource_ontology.json','offline_language_vocabulary.json'];
      const loaded = await Promise.all(files.map(async f => { try { const r = await fetch('/' + f, { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch (_) { return null; } }));
      const datasets = loaded.filter(Boolean);
      if (global.OfflineSemanticBrain.configure) {
        const vocab = datasets[files.indexOf('offline_language_vocabulary.json')] || {};
        try { global.OfflineSemanticBrain.configure({ datasets, vocabulary: vocab }); } catch (_) {}
      }
      return { datasets };
    })().catch(e => { datasetPromise = null; throw e; });
    return datasetPromise;
  }

  async function runOfflineDirect(question, common) {
    const { datasets } = await browserOffline();
    const brain = global.OfflineSemanticBrain, engine = global.OfflineQueryEngine;
    if (!brain || !engine || typeof brain.parse !== 'function' || typeof engine.execute !== 'function') throw new Error('Browser offline execution engine is unavailable');
    const parsed = brain.parse(question, { countryId: common.countryId, resourceId: common.resourceId, ministerId: common.ministerId, timeHorizon: common.timeHorizon, countryName: common.countryName, ministryId: common.ministryId });
    const result = engine.execute(parsed, datasets, common.language, common);
    const dispatcher = await ensureReasoningDispatcher();
    const reasoning = dispatcher ? dispatcher.dispatch(question, parsed, result, { ...common, gameState: common.gameState }) : null;
    if (reasoning?.used && reasoning.text && !result?.text) result.text = reasoning.text;
    result.reasoning = reasoning;
    result.gameLanguage = parsed?.gameLanguage || null;
    return { parsed, result, reasoning };
  }

  async function runTurn(question) {
    const ctx = context();
    const conversation = localConversation(question, ctx);
    if (conversation) { output(conversation, question, { source: 'OFFLINE_CONVERSATION' }); return; }
    const provider = String(localStorage.getItem('omega_ai_provider') || document.getElementById('omega-ai-provider')?.value || 'OFFLINE').toUpperCase();
    const common = { prompt: question, language: isBn(question) ? 'bn' : 'en', ...ctx, timeHorizon: 'CURRENT' };
    const dispatcher = await ensureReasoningDispatcher();

    if (provider.includes('GOOGLE')) {
      try {
        const history = readHistory().slice(-40).map(x => `${x.role}: ${x.content}`).join('\n');
        const data = await postJson('/api/ai/minister-consult', { ...common, conversationHistory: history, gameState: common.gameState });
        if (data?.text) {
          const reasoning = dispatcher && data?.result ? dispatcher.dispatch(question, data.semantic || {}, data.result, common) : null;
          output(data.text, question, { source: data.aiPowered ? `GOOGLE:${data.model || 'GEMINI'}` : 'OFFLINE_GROUNDED', reasoning, gameLanguage: data.semantic?.gameLanguage || null });
          return;
        }
        if (data?.result?.text) { output(data.result.text, question, { source: 'OFFLINE_GROUNDED_FALLBACK', reasoning: data.result.reasoning || null, gameLanguage: data.result.gameLanguage || null }); return; }
      } catch (e) { console.warn('[OMEGA UNIVERSAL AI] Server/Google transport unavailable; switching to browser offline executor:', e.message); }
    }

    try {
      const data = await runOfflineDirect(question, common);
      const text = data?.result?.text || 'The offline execution engine could not produce an evidence-backed answer from the current game data.';
      output(text, question, { source: 'BROWSER_OFFLINE_GROUNDED', operation: data?.result?.operation || '', reasoning: data?.reasoning || null, gameLanguage: data?.result?.gameLanguage || null });
      return;
    } catch (directError) {
      try {
        const data = await postJson('/api/ai/semantic-query', { ...common, gameState: common.gameState, reservesData: global.Omega?.World?.reservesData || null });
        const reasoning = dispatcher && data?.result ? dispatcher.dispatch(question, data.semantic || {}, data.result, common) : null;
        const text = data?.result?.text || data?.text || reasoning?.text || 'The offline runtime could not produce an evidence-backed answer from the current game state.';
        output(text, question, { source: 'SERVER_OFFLINE_GROUNDED', operation: data?.result?.operation || '', reasoning, gameLanguage: data?.semantic?.gameLanguage || data?.result?.gameLanguage || null });
      } catch (serverError) {
        throw new Error(`Offline execution failed: ${directError.message}; server fallback: ${serverError.message}`);
      }
    }
  }

  function enqueue(question) { const q = norm(question); if (!q) return; queue = queue.then(() => runTurn(q)).catch(e => { console.error('[OMEGA UNIVERSAL AI] turn failed', e); output(isBn(q) ? `উত্তর তৈরির পাইপলাইনে সমস্যা হয়েছে: ${e.message}` : `The answer pipeline failed: ${e.message}`, q, { source: 'PIPELINE_ERROR' }); }); }
  function submitFromUI() { const input = document.getElementById('interrogation-input'); const q = input?.value || ''; if (!norm(q)) return; input.value = ''; enqueue(q); }

  function install() {
    if (installed || typeof document === 'undefined') return; installed = true;
    document.addEventListener('click', e => { const button = e.target?.closest?.('#btn-submit-interrogation'); if (!button) return; e.preventDefault(); e.stopImmediatePropagation(); submitFromUI(); }, true);
    document.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.target?.id !== 'interrogation-input') return; e.preventDefault(); e.stopImmediatePropagation(); submitFromUI(); }, true);
    global.OmegaUniversalAIRuntime = Object.freeze({ enqueue, submitFromUI, context, readHistory, version: '1.4.0' });
    console.log('[OMEGA UNIVERSAL AI] Canonical interrogation pipeline installed. Browser offline execution, live-state context, consolidated game-language system, reasoning dispatch and sequential turns enabled.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})(window);
