/**
 * OMEGA UNIVERSAL AI RUNTIME v1.2.0-GROUNDED
 * Canonical interrogation owner.
 *
 * Factual resource/country questions are executed locally against the runtime datasets
 * before any generative layer is allowed to answer. Legacy cognitive speech is never
 * used as a source of factual quantities.
 */
(function (global) {
  'use strict';
  const KEY = 'omega.universal.ai.history.v1';
  const MAX_TURNS = 200;
  let installed = false;
  let queue = Promise.resolve();
  let datasetPromise = null;
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
      ministerId: m.id || ui.currentMinisterId || '',
      ministerName: m.name || m.displayName || '',
      ministerRole: m.role || m.title || '',
      ministryId: m.ministryId || ui.currentMinistryId || ''
    };
  }

  function localConversation(text, ctx) {
    const n = norm(text).toLowerCase(), bn = isBn(text);
    if (/^(hi|hello|hey|good morning|good afternoon|good evening)([.!? ]|$)/i.test(n) || /^(হ্যালো|হাই|আসসালামু আলাইকুম)([.!? ]|$)/i.test(n)) return bn ? 'আমি প্রশ্নের জন্য প্রস্তুত।' : 'I am ready for the next question.';
    if (/\bhow are you\b/i.test(n) || /তুমি কেমন আছ|তুমি কেমন আছেন|কেমন আছো|কেমন আছেন/i.test(n)) return bn ? 'আমি প্রশ্নের জন্য প্রস্তুত।' : 'I am ready for the next question.';
    if (/\b(what is your name|what's your name|who are you)\b/i.test(n) || /তোমার নাম কী|তোমার নাম কি|তুমি কে/i.test(n)) return ctx.ministerName ? (bn ? `আমি ${ctx.ministerName}। নির্বাচিত মন্ত্রীর পরিচয় অনুযায়ী উত্তর দিচ্ছি।` : `My name is ${ctx.ministerName}. I am answering as the currently selected minister.`) : (bn ? 'আমি OMEGA-এর বর্তমান AI সহকারী।' : 'I am the current OMEGA AI assistant.');
    if (/\b(how old are you|what is your age|what's your age)\b/i.test(n) || /তোমার বয়স কত|তোমার বয়স কত|তোমার বয়স কী|তোমার বয়স কী/i.test(n)) return bn ? 'আমার মানুষের মতো কোনো বয়স নেই। আমি একটি সফটওয়্যার AI।' : 'I do not have a human age. I am software AI.';
    if (/\b(thanks|thank you)\b/i.test(n) || /ধন্যবাদ/i.test(n)) return bn ? 'স্বাগতম।' : 'You are welcome.';
    return null;
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
    node.dataset.state = meta.state || '';
    const h = readHistory();
    h.push({ role: 'user', content: question, timestamp: Date.now() });
    h.push({ role: 'assistant', content: String(text || ''), timestamp: Date.now(), source: meta.source || '', state: meta.state || '', operation: meta.operation || '' });
    writeHistory(h);
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

  async function browserDatasets() {
    if (datasetPromise) return datasetPromise;
    datasetPromise = (async () => {
      await loadScript('omega_grounded_query_engine.js');
      const files = ['resources.json','resources_2.json','economy.json','population.json','countries.json','relations.json','country_policy.json','world.json','society.json','offline_semantic_knowledge.json','resource_ontology.json','offline_language_vocabulary.json'];
      const loaded = await Promise.all(files.map(async f => {
        try { const r = await fetch('/' + f, { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); }
        catch (_) { return null; }
      }));
      return { datasets: loaded.filter(Boolean) };
    })().catch(e => { datasetPromise = null; throw e; });
    return datasetPromise;
  }

  function isGroundingCandidate(question) {
    const q = norm(question).toLowerCase();
    const resource = /\b(copper|lithium|cobalt|nickel|rare earths?|ree|uranium|gold|bauxite|phosphate|potash|iron(?: ore)?|oil|petroleum|natural gas|gas|coal)\b|কপার|তামা|লিথিয়াম|লিথিয়াম|কোবাল্ট|নিকেল|রেয়ার আর্থ|বিরল মৃত্তিকা|ইউরেনিয়াম|ইউরেনিয়াম|সোনা|স্বর্ণ|বক্সাইট|ফসফেট|পটাশ|লোহা|তেল|গ্যাস|কয়লা|কয়লা/.test(q);
    const entity = /\b(mine|mines|deposit|deposits|field|fields|facility|facilities|refinery|smelter)\b|খনি|ডিপোজিট|ক্ষেত্র|রিফাইনারি|স্মেল্টার/.test(q);
    const metric = /\bhow many\b|\bhow much\b|\breserve|reserves\b|\bproduction\b|\bconsumption\b|\bimport|imports\b|\bexport|exports\b|\bprice\b|\bcost\b|\bstock\b|\bcapacity\b|\bwhere\b|\blocate\b|\bcount\b|কত|রিজার্ভ|মজুদ|উৎপাদন|উত্তোলন|খরচ|আমদানি|রপ্তানি|দাম|মূল্য|কোথায়|কোথায়|সংখ্যা/.test(q);
    return resource && metric || entity && metric;
  }

  function formatGrounded(result) {
    const bn = result.plan.language === 'bn';
    const title = bn ? '⚡ GROUNDED RESOURCE ANSWER' : 'GROUNDED RESOURCE ANSWER';
    const direct = result.directAnswer || (bn ? 'প্রামাণ্য উত্তর পাওয়া যায়নি।' : 'No authoritative answer was produced.');
    const lines = [title, '', direct];
    if (result.facts?.length) {
      lines.push('', bn ? 'প্রমাণিত তথ্য:' : 'Verified data:');
      for (const f of result.facts.slice(0, 12)) lines.push(`• ${f.metric || f.key || f.entityType}: ${typeof f.value === 'object' ? JSON.stringify(f.value) : f.value}`);
    }
    if (result.evidence?.length) {
      lines.push('', bn ? 'ডেটা উৎস/রেকর্ড:' : 'Data record:');
      for (const e of result.evidence.slice(0, 8)) lines.push(`• ${e.dataset || 'runtime_dataset'} :: ${e.path}`);
    }
    if (result.uncertainty?.length) {
      lines.push('', bn ? 'অনিশ্চয়তা:' : 'Uncertainty:');
      for (const u of result.uncertainty.slice(0, 8)) lines.push(`• ${u}`);
    }
    if (result.state === 'UNKNOWN' || result.state === 'UNRESOLVED' || result.state === 'AMBIGUOUS' || result.state === 'UNSUPPORTED') lines.push('', bn ? 'কোনো অনুমানভিত্তিক সংখ্যা/সুপারিশ যোগ করা হয়নি।' : 'No synthetic quantity or recommendation was added.');
    return lines.join('\n');
  }

  async function runGrounded(question, common) {
    const { datasets } = await browserDatasets();
    const engine = global.OmegaGroundedQueryEngine;
    if (!engine || typeof engine.execute !== 'function') throw new Error('Grounded query engine is unavailable');
    const result = engine.execute(question, datasets, common);
    return result;
  }

  async function runTurn(question) {
    const ctx = context();
    const conversation = localConversation(question, ctx);
    if (conversation) { output(conversation, question, { source: 'OFFLINE_CONVERSATION', state: 'KNOWN' }); return; }
    const common = { prompt: question, language: isBn(question) ? 'bn' : 'en', ...ctx, timeHorizon: 'CURRENT' };

    if (isGroundingCandidate(question)) {
      try {
        const result = await runGrounded(question, common);
        output(formatGrounded(result), question, { source: 'BROWSER_GROUNDED_DATA', operation: result.plan.operation, state: result.state });
        return;
      } catch (e) {
        console.warn('[OMEGA GROUNDED] factual execution failed:', e.message);
        output(isBn(question) ? `এই তথ্যভিত্তিক প্রশ্নটি যাচাই করা যায়নি। কারণ: ${e.message}` : `This factual query could not be verified. Reason: ${e.message}`, question, { source: 'GROUNDING_ERROR', state: 'UNKNOWN' });
        return;
      }
    }

    const provider = String(localStorage.getItem('omega_ai_provider') || document.getElementById('omega-ai-provider')?.value || 'OFFLINE').toUpperCase();
    if (provider.includes('GOOGLE')) {
      try {
        const history = readHistory().slice(-40).map(x => `${x.role}: ${x.content}`).join('\n');
        const data = await postJson('/api/ai/minister-consult', { ...common, conversationHistory: history, gameState: global.Game?.state || global.gameState || null });
        if (data?.text) { output(data.text, question, { source: data.aiPowered ? `GOOGLE:${data.model || 'GEMINI'}` : 'OFFLINE_GROUNDED' }); return; }
      } catch (e) { console.warn('[OMEGA UNIVERSAL AI] server AI unavailable:', e.message); }
    }

    output(isBn(question) ? 'এই প্রশ্নের জন্য grounded execution contract এখনো সংযুক্ত নেই।' : 'A grounded execution contract is not connected for this question yet.', question, { source: 'UNSUPPORTED_QUERY', state: 'UNSUPPORTED' });
  }

  function enqueue(question) { const q = norm(question); if (!q) return; queue = queue.then(() => runTurn(q)).catch(e => { console.error('[OMEGA UNIVERSAL AI] turn failed', e); output(isBn(q) ? `উত্তর তৈরির পাইপলাইনে সমস্যা হয়েছে: ${e.message}` : `The answer pipeline failed: ${e.message}`, q, { source: 'PIPELINE_ERROR', state: 'UNKNOWN' }); }); }
  function submitFromUI() { const input = document.getElementById('interrogation-input'); const q = input?.value || ''; if (!norm(q)) return; input.value = ''; enqueue(q); }

  function install() {
    if (installed || typeof document === 'undefined') return; installed = true;
    document.addEventListener('click', e => { const button = e.target?.closest?.('#btn-submit-interrogation'); if (!button) return; e.preventDefault(); e.stopImmediatePropagation(); submitFromUI(); }, true);
    document.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.target?.id !== 'interrogation-input') return; e.preventDefault(); e.stopImmediatePropagation(); submitFromUI(); }, true);
    global.OmegaUniversalAIRuntime = Object.freeze({ enqueue, submitFromUI, context, readHistory, version: '1.2.0-GROUNDED' });
    console.log('[OMEGA UNIVERSAL AI] Grounded interrogation pipeline installed. Factual resource queries bypass legacy cognitive speech generation.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})(window);
