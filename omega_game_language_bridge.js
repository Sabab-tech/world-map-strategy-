/**
 * OMEGA GAME LANGUAGE BRIDGE v1.0.1
 * Adds canonical concept metadata to the existing semantic parser without
 * replacing authoritative country/resource datasets.
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.1';
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
      for (const form of surfaceForms(concept, language)) {
        if (!form) continue;
        let score = 0;
        if (q === form) score = 1;
        else if (q.includes(form) || form.includes(q)) score = 0.60 + 0.34 * Math.min(q.length, form.length) / Math.max(q.length, form.length);
        if (score >= 0.60) {
          hits.push({ concept_id: concept.concept_id, domain: concept.domain, semantic_type: concept.semantic_type, score: Number(score.toFixed(3)), priority: concept.priority });
        }
      }
    }
    const best = new Map();
    for (const hit of hits) if (!best.has(hit.concept_id) || best.get(hit.concept_id).score < hit.score) best.set(hit.concept_id, hit);
    return [...best.values()].sort((a, b) => b.score - a.score || a.concept_id.localeCompare(b.concept_id));
  }

  function enrich(parsed) {
    if (!parsed || typeof parsed !== 'object' || !ontology) return parsed;
    const surface = text(parsed.surface || parsed.raw || '');
    const language = parsed.language || (/[ঀ-৿]/.test(surface) ? 'bn' : 'en');
    const candidates = match(surface, language);
    const out = { ...parsed, gameLanguage: { ontologyVersion: ontology.schema_version || null, candidates } };
    if (candidates.length && candidates[0].score >= 0.94) out.gameLanguage.canonicalConcept = candidates[0].concept_id;
    return out;
  }

  function install() {
    if (installed) return true;
    if (!global.OfflineSemanticBrain || typeof global.OfflineSemanticBrain.parse !== 'function') return false;
    const original = global.OfflineSemanticBrain.parse;
    if (original.__omegaGameLanguageWrapped) { installed = true; return true; }
    const wrapped = function (question, context) { return enrich(original.call(this, question, context)); };
    Object.defineProperty(wrapped, '__omegaGameLanguageWrapped', { value: true });
    global.OfflineSemanticBrain.parse = wrapped;
    installed = true;
    return true;
  }

  global.OmegaGameLanguageBridge = Object.freeze({ VERSION, load, match, enrich, install, get ontology() { return ontology; } });
})(typeof window !== 'undefined' ? window : globalThis);
