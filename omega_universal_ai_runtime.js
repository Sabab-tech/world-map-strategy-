/**
 * OMEGA UNIVERSAL AI RUNTIME v1.5.0
 * Canonical interrogation owner. The production semantic runtime is the
 * primary semantic/execution authority; OfflineSemanticBrain remains only
 * as a compatibility fallback for unsupported operations or startup gaps.
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
  const asset = p => { try { return typeof document !== 'undefined' && document.baseURI ? new URL(p, document.baseURI).href : p; } catch (_) { return p; } };

  function readHistory() { try { const x = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(x) ? x : []; } catch (_) { return []; } }
  function writeHistory(h) { try { localStorage.setItem(KEY, JSON.stringify(h.slice(-MAX_TURNS))); } catch (_) {} }

  function context() {
    const gs = global.Game?.state || global.gameState || global.Omega?.World?.state || {};
    const ui = global.OmegaCabinetUI || {};
    const m = ui.currentInterrogatedMinister || ui.currentMinister || ui.activeMinister || global.OmegaMinisterState?.activeMinister || {};
    return {
      countryId: gs.countryCode || gs.countryId || gs.playerCountryId || ui.activeCountry || '',
      countryName: gs.countryName || gs.country?.name || ui.activeCountry || '',
      ministerId: m.id || m.ministerId || ui.currentMinisterId || '',
      ministerName: m.name || m.ministerName || m.displayName || '',
      ministerRole: m.role || m.title || '',
      ministryId: m.ministryId || ui.currentMinistryId || '',
      gameState: gs
    };
  }

  function syncLanguageContext(ctx, system = global.OmegaLanguageSystem) {
    if (!system || typeof system.setContext !== 'function') return false;
    try {
      system.setContext({
        countryId: ctx?.countryId || '', countryName: ctx?.countryName || '',
        ministerId: ctx?.ministerId || '', ministerName: ctx?.ministerName || '',
        ministerRole: ctx?.ministerRole || '', ministryId: ctx?.ministryId || '',
        gameState: ctx?.gameState || {}
      });
      return true;
    } catch (e) {
      console.warn('[OMEGA UNIVERSAL AI] Language context bridge rejected live state:', e?.message || e);
      return false;
    }
  }

  function localConversation(text, ctx) {
    const n = norm(text).toLowerCase(), bn = isBn(text);
    if (/^(hi|hello|hey|good morning|good afternoon|good evening)([.!? ]|$)/i.test(n) || /^(হ্যালো|হাই|আসসালামু আলাইকুম)([.!? ]|$)/i.test(n)) return bn ? 'আমি ভালো আছি এবং আপনার প্রশ্নের জন্য প্রস্তুত।' : 'I am operating normally and ready for your next question.';
    if (/\bhow are you\b/i.test(n) || /তুমি কেমন আছ|তুমি কেমন আছেন|কেমন আছো|কেমন আছেন/i.test(n)) return bn ? 'আমি ভালো আছি এবং আপনার প্রশ্নের জন্য প্রস্তুত।' : 'I am operating normally and ready for your next question.';
    if (/\b(what is your name|what\'s your name|who are you)\b/i.test(n) || /তোমার নাম কী|তোমার নাম কি|তুমি কে/i.test(n)) return ctx.ministerName ? (bn ? `আমি ${ctx.ministerName}। আমি বর্তমানে নির্বাচিত মন্ত্রীর পরিচয় অনুযায়ী উত্তর দিচ্ছি।` : `My name is ${ctx.ministerName}. I am answering as the currently selected minister.`) : (bn ? 'আমি OMEGA-এর বর্তমান AI সহকারী।' : 'I am the current OMEGA AI assistant.');
    if (/\b(how old are you|what is your age|what\'s your age)\b/i.test(n) || /তোমার বয়স কত|তোমার বয়স কত|তোমার বয়স কী|তোমার বয়স কী/i.test(n)) return bn ? 'আমার মানুষের মতো কোনো বয়স নেই। আমি একটি সফটওয়্যার AI, তাই আমার বয়স বছর দিয়ে মাপা হয় না।' : 'I do not have a human age. I am software AI, so my age is not measured in years.';
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
      if ([...document.scripts].some(s => s.src && (s.src === asset(src) || s.src.endsWith('/' + src)))) return resolve();
      const s = document.createElement('script'); s.src = asset(src); s.onload = resolve; s.onerror = () => reject(new Error(`Unable to load ${src}`)); document.head.appendChild(s);
    });
  }

  async function ensureReasoningDispatcher() {
    if (global.OmegaReasoningDispatcher) return global.OmegaReasoningDispatcher;
    try { await loadScript('omega_reasoning_dispatcher.js'); } catch (_) { return null; }
    return global.OmegaReasoningDispatcher || null;
  }

  async function ensureGameLanguageLayer(ctx = context()) {
    if (gameLanguagePromise) {
      const bridge = await gameLanguagePromise; syncLanguageContext(ctx); return bridge;
    }
    gameLanguagePromise = (async () => {
      if (!global.OmegaLanguageSystem) await loadScript('omega_language_system.js');
      const system = global.OmegaLanguageSystem, bridge = global.OmegaGameLanguageBridge || null;
      if (!system) return null;
      try {
        if (bridge) { bridge.load(system.gameLanguageOntology()); bridge.install(); }
        syncLanguageContext(ctx, system);
        return bridge;
      } catch (_) { return null; }
    })().catch(() => null);
    const bridge = await gameLanguagePromise; syncLanguageContext(ctx); return bridge;
  }

  async function ensureProductionSemanticRuntime() {
    let rt = global.OmegaProductionSemanticRuntime;
    if (rt && rt.VERSION === '4.1.0-PRODUCTION') return rt;
    try { await loadScript('omega_production_semantic_runtime_v3.js'); } catch (_) { return null; }
    rt = global.OmegaProductionSemanticRuntime;
    if (!rt) return null;
    if (typeof rt.diagnostics === 'function' && !rt.diagnostics().ready && typeof rt.init === 'function') {
      try { await rt.init(); } catch (_) {}
    }
    return rt.VERSION === '4.1.0-PRODUCTION' ? rt : null;
  }

  async function browserOffline(common = context()) {
    if (datasetPromise) { await ensureGameLanguageLayer(common); await ensureProductionSemanticRuntime(); return datasetPromise; }
    datasetPromise = (async () => {
      await ensureGameLanguageLayer(common);
      await ensureProductionSemanticRuntime();
      if (!global.OfflineSemanticBrain) await loadScript('offline_semantic_brain.js');
      if (!global.OfflineQueryEngine) await loadScript('offline_query_engine.js');
      const files = ['resources.json','resources_2.json','economy.json','population.json','countries.json','relations.json','country_policy.json','world.json','society.json','offline_semantic_knowledge.json','resource_ontology.json','offline_language_vocabulary.json'];
      const loaded = await Promise.all(files.map(async f => { try { const r = await fetch(asset(f), { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch (_) { return null; } }));
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
    const { datasets } = await browserOffline(common);
    const bridge = await ensureGameLanguageLayer(common);
    const system = global.OmegaLanguageSystem;
    syncLanguageContext(common, system);
    const production = await ensureProductionSemanticRuntime();
    const dispatcher = await ensureReasoningDispatcher();

    if (production && typeof production.parse === 'function' && typeof production.execute === 'function') {
      const parsed = production.parse(question, {
        countryId: common.countryId, resourceId: common.resourceId, ministerId: common.ministerId,
        timeHorizon: common.timeHorizon, countryName: common.countryName, ministryId: common.ministryId,
        gameState: common.gameState
      });
      let result = production.execute(parsed, common);
      if (!result?.ok && !['OPERATION_NOT_IMPLEMENTED','SEMANTIC_RUNTIME_NOT_READY'].includes(result?.reason)) {
        result = { ...result };
      } else if (!result?.ok) {
        const brain = global.OfflineSemanticBrain, engine = global.OfflineQueryEngine;
        if (!brain || !engine || typeof brain.parse !== 'function' || typeof engine.execute !== 'function') throw new Error('Compatibility offline execution engine is unavailable');
        const fallbackParsed = brain.parse(question, { countryId: common.countryId, resourceId: common.resourceId, ministerId: common.ministerId, timeHorizon: common.timeHorizon, countryName: common.countryName, ministryId: common.ministryId });
        const fallback = engine.execute(fallbackParsed, datasets, common.language, common);
        result = { ...fallback, semanticFallback: true, canonicalSemantic: parsed };
      }
      const reasoning = dispatcher ? dispatcher.dispatch(question, parsed, result, { ...common, gameState: common.gameState }) : null;
      if (reasoning?.used && reasoning.text && !result?.text) result.text = reasoning.text;
      result.reasoning = reasoning;
      result.gameLanguage = parsed?.gameLanguage || bridge || null;
      return { parsed, result, reasoning, canonical: true };
    }

    const brain = global.OfflineSemanticBrain, engine = global.OfflineQueryEngine;
    if (!brain || !engine || typeof brain.parse !== 'function' || typeof engine.execute !== 'function') throw new Error('Browser semantic execution engines are unavailable');
    const parsed = brain.parse(question, { countryId: common.countryId, resourceId: common.resourceId, ministerId: common.ministerId, timeHorizon: common.timeHorizon, countryName: common.countryName, ministryId: common.ministryId });
    const result = engine.execute(parsed, datasets, common.language, common);
    const reasoning = dispatcher ? dispatcher.dispatch(question, parsed, result, { ...common, gameState: common.gameState }) : null;
    if (reasoning?.used && reasoning.text && !result?.text) result.text = reasoning.text;
    result.reasoning = reasoning; result.gameLanguage = parsed?.gameLanguage || bridge || null;
    return { parsed, result, reasoning, canonical: false };
  }

  async function runTurn(question) {
    const ctx = context();
    await ensureGameLanguageLayer(ctx); syncLanguageContext(ctx);
    const conversation = localConversation(question, ctx);
    if (conversation) { output(conversation, question, { source: 'OFFLINE_CONVERSATION' }); return; }
    const provider = String(localStorage.getItem('omega_ai_provider') || document.getElementById('omega-ai-provider')?.value || 'OFFLINE').toUpperCase();
    const common = { prompt: question, language: isBn(question) ? 'bn' : 'en', ...ctx, timeHorizon: 'CURRENT' };
    syncLanguageContext(common);
    const dispatcher = await ensureReasoningDispatcher();

    if (provider.includes('GOOGLE')) {
      try {
        const history = readHistory().slice(-40).map(x => `${x.role}: ${x.content}`).join('\n');
        const data = await postJson('/api/ai/minister-consult', { ...common, conversationHistory: history, gameState: common.gameState });
        if (data?.text) { const reasoning = dispatcher && data?.result ? dispatcher.dispatch(question, data.semantic || {}, data.result, common) : null; output(data.text, question, { source: data.aiPowered ? `GOOGLE:${data.model || 'GEMINI'}` : 'OFFLINE_GROUNDED', reasoning, gameLanguage: data.semantic?.gameLanguage || null }); return; }
        if (data?.result?.text) { output(data.result.text, question, { source: 'OFFLINE_GROUNDED_FALLBACK', reasoning: data.result.reasoning || null, gameLanguage: data.result.gameLanguage || null }); return; }
      } catch (e) { console.warn('[OMEGA UNIVERSAL AI] Server/Google transport unavailable; switching to browser offline executor:', e.message); }
    }

    try {
      const data = await runOfflineDirect(question, common);
      const text = data?.result?.text || 'The offline semantic executor could not produce an evidence-backed answer from the current game data.';
      output(text, question, { source: data.canonical ? 'BROWSER_PRODUCTION_SEMANTIC' : 'BROWSER_COMPATIBILITY_OFFLINE', operation: data?.result?.operation || '', reasoning: data?.reasoning || null, gameLanguage: data?.result?.gameLanguage || null });
      return;
    } catch (directError) {
      try {
        const data = await postJson('/api/ai/semantic-query', { ...common, gameState: common.gameState, reservesData: global.Omega?.World?.reservesData || null });
        const reasoning = dispatcher && data?.result ? dispatcher.dispatch(question, data.semantic || {}, data.result, common) : null;
        const text = data?.result?.text || data?.text || reasoning?.text || 'The offline runtime could not produce an evidence-backed answer from the current game state.';
        output(text, question, { source: 'SERVER_OFFLINE_GROUNDED', operation: data?.result?.operation || '', reasoning, gameLanguage: data?.semantic?.gameLanguage || data?.result?.gameLanguage || null });
      } catch (serverError) {
        throw new Error(`Semantic execution failed: ${directError.message}; server fallback: ${serverError.message}`);
      }
    }
  }

  function enqueue(question) { const q = norm(question); if (!q) return; queue = queue.then(() => runTurn(q)).catch(e => { console.error('[OMEGA UNIVERSAL AI] turn failed', e); output(isBn(q) ? `উত্তর তৈরির পাইপলাইনে সমস্যা হয়েছে: ${e.message}` : `The answer pipeline failed: ${e.message}`, q, { source: 'PIPELINE_ERROR' }); }); }
  function submitFromUI() { const input = document.getElementById('interrogation-input'); const q = input?.value || ''; if (!norm(q)) return; input.value = ''; enqueue(q); }

  function install() {
    if (installed || typeof document === 'undefined') return; installed = true;
    document.addEventListener('click', e => { const button = e.target?.closest?.('#btn-submit-interrogation'); if (!button) return; e.preventDefault(); e.stopImmediatePropagation(); submitFromUI(); }, true);
    document.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.target?.id !== 'interrogation-input') return; e.preventDefault(); e.stopImmediatePropagation(); submitFromUI(); }, true);
    global.OmegaUniversalAIRuntime = Object.freeze({ enqueue, submitFromUI, context, readHistory, syncLanguageContext, version: '1.5.0', semanticAuthority: 'OmegaProductionSemanticRuntime' });
    console.log('[OMEGA UNIVERSAL AI] Canonical interrogation pipeline installed. Production semantic runtime is primary; compatibility offline executor is fallback.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})(window);
