/**
 * OMEGA UNIVERSAL AI RUNTIME v1.6.0
 * Canonical interrogation owner. Uses the production semantic runtime for
 * evidence routing and the reasoning dispatcher for full 40-stage cognition.
 * Conversation handling is configuration-driven from offline_language_vocabulary.json.
 */
(function (global) {
  'use strict';

  const KEY = 'omega.universal.ai.history.v1';
  const MAX_TURNS = 200;
  let installed = false;
  let queue = Promise.resolve();
  let datasetPromise = null;
  let gameLanguagePromise = null;
  let conversationVocabulary = null;
  let conversationVocabularyPromise = null;

  const norm = s => String(s || '').normalize('NFKC').trim();
  const normalizeForMatch = s => norm(s).toLowerCase().replace(/[?!,.:;'"“”‘’(){}\[\]<>—–\/\\]+/g, ' ').replace(/\s+/g, ' ').trim();
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

  async function ensureConversationVocabulary() {
    if (conversationVocabulary) return conversationVocabulary;
    if (conversationVocabularyPromise) return conversationVocabularyPromise;
    conversationVocabularyPromise = (async () => {
      try {
        const response = await fetch(asset('offline_language_vocabulary.json'), { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        conversationVocabulary = await response.json();
      } catch (e) {
        conversationVocabulary = null;
        console.warn('[OMEGA UNIVERSAL AI] Conversation vocabulary unavailable:', e?.message || e);
      }
      return conversationVocabulary;
    })().finally(() => { conversationVocabularyPromise = null; });
    return conversationVocabularyPromise;
  }

  function tokenCount(text) { const n = normalizeForMatch(text); return n ? n.split(/\s+/).filter(Boolean).length : 0; }
  function containsQuestionMarker(text) {
    const q = norm(text);
    return /\?/.test(q) || /\b(what|who|whom|whose|which|where|when|why|how|should|can|could|will|would|is there|are there|does|do|did|has|have)\b/i.test(q) || /(কি|কী|কে|কারা|কেন|কোথায়|কোথায়|কখন|কোন|কীভাবে|কিভাবে|কত|হবে কি|সম্ভব কি|আছে কি)/.test(q);
  }

  function conversationIntent(text) {
    const vocab = conversationVocabulary?.conversation;
    if (!vocab?.intentRules) return null;
    const detection = vocab.detection || {};
    const normalized = normalizeForMatch(text);
    if (!normalized || (detection.maxTokens && tokenCount(normalized) > Number(detection.maxTokens))) return null;
    if (detection.ignoreWhenQuestionMarkersPresent && containsQuestionMarker(text)) return null;

    const lang = isBn(text) ? 'bn' : 'en';
    const rules = Object.entries(vocab.intentRules);
    const matches = [];
    for (const [intent, rule] of rules) {
      const phrases = rule?.phrases?.[lang] || [];
      for (const phrase of phrases) {
        const p = normalizeForMatch(phrase);
        if (!p) continue;
        const standalone = p === normalized;
        if (!standalone && detection.standaloneOnly) continue;
        if (standalone) matches.push({ intent, priority: Number(rule?.priority || 0), phrase: p, score: 1 });
      }
    }
    if (!matches.length) return null;
    matches.sort((a, b) => b.priority - a.priority || b.phrase.length - a.phrase.length);
    return { ...matches[0], language: lang };
  }

  function renderMelody(intentMatch, text) {
    const melodies = conversationVocabulary?.conversation?.melody?.[intentMatch?.intent]?.[intentMatch?.language] || [];
    if (!Array.isArray(melodies) || !melodies.length) return null;
    const seed = normalizeForMatch(text).split('').reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return String(melodies[seed % melodies.length]);
  }

  function localConversation(text) {
    const match = conversationIntent(text);
    if (!match) return null;
    return { intent: match.intent, text: renderMelody(match, text), language: match.language, evidence: { source: 'offline_language_vocabulary.json', phrase: match.phrase, priority: match.priority } };
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
    if (meta.reasoning) node.dataset.reasoning = JSON.stringify(meta.reasoning).slice(0, 4000);
    if (meta.conversation) node.dataset.conversation = JSON.stringify(meta.conversation).slice(0, 2000);
    if (meta.gameLanguage) node.dataset.gameLanguage = JSON.stringify(meta.gameLanguage).slice(0, 2000);
    const h = readHistory();
    h.push({ role: 'user', content: question, timestamp: Date.now() });
    h.push({ role: 'assistant', content: String(text || ''), timestamp: Date.now(), source: meta.source || '', reasoning: meta.reasoning || null, conversation: meta.conversation || null, gameLanguage: meta.gameLanguage || null });
    writeHistory(h);
  }

  async function postJson(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(data?.error || `HTTP_${r.status}`);
    return data || {};
  }

  async function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src && (s.src === asset(src) || s.src.endsWith('/' + src)))) return resolve();
      const s = document.createElement('script');
      s.src = asset(src);
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Unable to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureReasoningDispatcher() {
    if (global.OmegaReasoningDispatcher) return global.OmegaReasoningDispatcher;
    try { await loadScript('omega_reasoning_dispatcher.js'); } catch (_) { return null; }
    return global.OmegaReasoningDispatcher || null;
  }

  async function ensureGameLanguageLayer(ctx = context()) {
    if (gameLanguagePromise) {
      const bridge = await gameLanguagePromise;
      syncLanguageContext(ctx);
      return bridge;
    }
    gameLanguagePromise = (async () => {
      if (!global.OmegaLanguageSystem) await loadScript('omega_language_system.js');
      const system = global.OmegaLanguageSystem;
      const bridge = global.OmegaGameLanguageBridge || null;
      if (!system) return null;
      try {
        if (bridge) { bridge.load(system.gameLanguageOntology()); bridge.install(); }
        syncLanguageContext(ctx, system);
        return bridge;
      } catch (_) { return null; }
    })().catch(() => null);
    const bridge = await gameLanguagePromise;
    syncLanguageContext(ctx);
    return bridge;
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

  async function ensureCognitiveEngine() {
    if (global.OmegaCognitiveEngine || global.OmegaSharedCognition || global.OmegaCognitiveOS) return true;
    try { await loadScript('omega_cognitive_engine.js'); } catch (_) { return false; }
    return !!(global.OmegaCognitiveEngine || global.OmegaSharedCognition || global.OmegaCognitiveOS);
  }

  async function browserOffline(common = context()) {
    await ensureConversationVocabulary();
    if (datasetPromise) {
      await ensureGameLanguageLayer(common);
      await ensureProductionSemanticRuntime();
      return datasetPromise;
    }
    datasetPromise = (async () => {
      await ensureGameLanguageLayer(common);
      await ensureProductionSemanticRuntime();
      if (!global.OfflineSemanticBrain) await loadScript('offline_semantic_brain.js');
      if (!global.OfflineQueryEngine) await loadScript('offline_query_engine.js');
      const files = ['resources.json','resources_2.json','economy.json','population.json','countries.json','relations.json','country_policy.json','world.json','society.json','offline_semantic_knowledge.json','resource_ontology.json','offline_language_vocabulary.json'];
      const loaded = await Promise.all(files.map(async f => {
        try { const r = await fetch(asset(f), { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch (_) { return null; }
      }));
      const datasets = loaded.filter(Boolean);
      const vocab = loaded[files.indexOf('offline_language_vocabulary.json')] || conversationVocabulary || {};
      conversationVocabulary = vocab;
      if (global.OfflineSemanticBrain.configure) {
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
    await ensureCognitiveEngine();

    if (production && typeof production.parse === 'function' && typeof production.execute === 'function') {
      const parsed = production.parse(question, {
        countryId: common.countryId, resourceId: common.resourceId, ministerId: common.ministerId,
        timeHorizon: common.timeHorizon, countryName: common.countryName, ministryId: common.ministryId,
        gameState: common.gameState
      });
      let result = production.execute(parsed, common);
      if (!result?.ok) {
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
    result.reasoning = reasoning;
    result.gameLanguage = parsed?.gameLanguage || bridge || null;
    return { parsed, result, reasoning, canonical: false };
  }

  async function runTurn(question) {
    const ctx = context();
    await ensureGameLanguageLayer(ctx);
    await ensureConversationVocabulary();
    syncLanguageContext(ctx);

    const conversation = localConversation(question);
    if (conversation?.text) {
      output(conversation.text, question, { source: 'OFFLINE_CONVERSATION_VOCABULARY', conversation });
      return;
    }

    const provider = String(localStorage.getItem('omega_ai_provider') || document.getElementById('omega-ai-provider')?.value || 'OFFLINE').toUpperCase();
    const common = { prompt: question, language: isBn(question) ? 'bn' : 'en', ...ctx, timeHorizon: 'CURRENT' };
    syncLanguageContext(common);
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
        if (data?.result?.text) {
          output(data.result.text, question, { source: 'OFFLINE_GROUNDED_FALLBACK', reasoning: data.result.reasoning || null, gameLanguage: data.result.gameLanguage || null });
          return;
        }
      } catch (e) {
        console.warn('[OMEGA UNIVERSAL AI] Server/Google transport unavailable; switching to browser offline executor:', e.message);
      }
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

  function enqueue(question) {
    const q = norm(question);
    if (!q) return;
    queue = queue.then(() => runTurn(q)).catch(e => {
      console.error('[OMEGA UNIVERSAL AI] turn failed', e);
      output(isBn(q) ? `উত্তর তৈরির পাইপলাইনে সমস্যা হয়েছে: ${e.message}` : `The answer pipeline failed: ${e.message}`, q, { source: 'PIPELINE_ERROR' });
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
      e.preventDefault(); e.stopImmediatePropagation(); submitFromUI();
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.target?.id !== 'interrogation-input') return;
      e.preventDefault(); e.stopImmediatePropagation(); submitFromUI();
    }, true);
    global.OmegaUniversalAIRuntime = Object.freeze({ enqueue, submitFromUI, context, readHistory, syncLanguageContext, version: '1.6.0', semanticAuthority: 'OmegaProductionSemanticRuntime', conversationSource: 'offline_language_vocabulary.json', cognitive40: true });
    console.log('[OMEGA UNIVERSAL AI] Canonical interrogation pipeline installed. Data-driven conversation layer + full 40-stage reasoning routing enabled.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})(window);
