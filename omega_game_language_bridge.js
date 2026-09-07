/**
 * OMEGA GAME LANGUAGE BRIDGE v1.0.0
 * Adds canonical concept metadata to the existing semantic parser without
 * replacing the authoritative country/resource datasets.
 *
 * This bridge is intentionally conservative: it only emits concepts that
 * exist in the ontology and never invents world-state facts or capabilities.
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  let ontology = null;
  let installed = false;

  const text = value => String(value == null ? '' : value).trim();
  const norm = value => text(value).normalize('NFKC').toLowerCase().replace(/[?!,.:;"'“”‘’(){}\[\]<>—–]/g, ' ').replace(/\s+/g, ' ').trim();

  function surfaceForms(concept, language) {
    const lexical = concept?.lexical?.[language] || {};
    return [...new Set([lexical.lemma, ...(lexical.aliases || []), ...(lexical.forms || [])].filter(Boolean).map(norm))];
  }

  function load(value) {
    ontology = value && typeof value === 'object' ? value : null;
    return ontology;
  }

  function match(surface, language) {
    const q = norm(surface);
    if (!q || !ontology?.seed_concepts?.length) return [];
    const hits = [];
    for (const concept of ontology.seed_concepts) {
      const forms = surfaceForms(concept, language);
      let score = 0;
      for (const form of forms) {
        if (q === form) score = Math.max(score, 1);
        else if (q.includes(form) || form.includes(q)) score = Math.max(score, Math.min(q.length, form.length) / Math.max(q.length, form.length) * 0.94);
      }
      if (score >= 0.60) hits.push({ concept_id: concept.concept_id, domain: concept.domain, semantic_type: concept.semantic_type, score: Number(score.toFixed(3)), priority: concept.priority });
    }
    return hits.sort((a, b) => b.score - a.score || a.concept_id.localeCompare(b.concept_id));
  }

  function enrich(parsed) {
    if (!parsed || typeof parsed !== 'object' || !ontology) return parsed;
    const language = parsed.language || (/\u0980-\u09FF/.test(text(parsed.surface || parsed.raw)) ? 'bn' : 'en');
    const candidates = match(parsed.surface || parsed.raw || '', language);
    const out = { ...parsed, gameLanguage: { ontologyVersion: ontology.schema_version || null, candidates } };
    if (candidates.length && candidates[0].score >= 0.94) out.gameLanguage.canonicalConcept = candidates[0].concept_id;
    return out;
  }

  function install() {
    if (installed || !global.OfflineSemanticBrain || typeof global.OfflineSemanticBrain.parse !== 'function') return false;
    const original = global.OfflineSemanticBrain.parse.bind(global.OfflineSemanticBrain);
    if (original.__omegaGameLanguageWrapped) return true;
    const wrapped = function (question, context) {
      return enrich(original(question, context));
    };
    Object.defineProperty(wrapped, '__omegaGameLanguageWrapped', { value: true });
    global.OfflineSemanticBrain.parse = wrapped;
    installed = true;
    return true;
  }

  global.OmegaGameLanguageBridge = Object.freeze({ VERSION, load, match, enrich, install, get ontology() { return ontology; } });
})(typeof window !== 'undefined' ? window : globalThis);
