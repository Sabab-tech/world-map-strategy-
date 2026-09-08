/*
 * OMEGA LANGUAGE SYSTEM v1.2.0
 * Single-file canonical linguistic runtime.
 *
 * This file consolidates the former:
 *   1) omega_language_system.js
 *   2) omega_game_language_bridge.js
 *   3) omega_game_language_ontology.json
 *
 * The ontology is embedded losslessly. The bridge behavior is embedded as
 * executable runtime behavior. World-state facts remain owned by game data.
 * No eval(), Function(), dynamic code generation or answer-fact catalogue.
 */
(function (global) {
  'use strict';

  const VERSION = '1.2.0';
  const SCHEMA_VERSION = 'OMEGA-LANGUAGE-SYSTEM/1.2';
  const MAX_INPUT_CHARS = 20000;
  const MAX_HISTORY_TURNS = 200;
  const MAX_LEARNED_MAPPINGS = 512;
  const MIN_ENTITY_CONFIDENCE = 0.82;
  const SECOND_BEST_MARGIN = 0.08;

  /* Lossless in-file merge of omega_game_language_ontology.json. */
  const EMBEDDED_GAME_LANGUAGE_ONTOLOGY = Object.freeze({
    "schema_version": "1.0.0",
    "ontology_id": "OMEGA_GAME_LANGUAGE",
    "implementation_status": "DESIGN_LOCKED_INCREMENTAL_POPULATION",
    "canonical_concept_target": 4500,
    "counting_rule": "A concept_id counts once. Synonyms, aliases, inflections, phrases, and bilingual realizations never count as additional concepts.",
    "separation_of_concerns": {
      "language_core": "Canonical game-language concepts, lexical realizations, morphology, grammar, semantic roles and operational compatibility.",
      "domain_knowledge": "Existing country/resource/minister/facility datasets remain authoritative for world entities and facts.",
      "capability_registry": "Determines whether a requested game operation is actually executable; vocabulary alone never grants capability.",
      "reasoning": "Consumes deterministic runtime evidence and may infer only within the evidence boundary."
    },
    "tiers": {
      "P0": "Core game control and command language",
      "P1": "Core simulation state and operational language",
      "P2": "Strategy, policy, trade-offs and analysis",
      "P3": "Advanced analysis and specialized domain language",
      "P4": "Rare technical/domain language"
    },
    "target_tiers": {
      "core_game_language": 3200,
      "advanced_strategy_language": 800,
      "grammar_discourse_command_language": 500
    },
    "domains": [
      {"id":"GAME_STATE","name":"Core Game State & Simulation","target":300},
      {"id":"GOVERNMENT","name":"Government & State Administration","target":350},
      {"id":"POLITICS","name":"Politics & Political Strategy","target":300},
      {"id":"ECONOMY","name":"Economy & Macroeconomics","target":450},
      {"id":"RESOURCES","name":"Resources & Raw Materials","target":500},
      {"id":"EXTRACTION_PRODUCTION","name":"Extraction, Mining & Production","target":400},
      {"id":"INDUSTRY","name":"Industrial Capacity & Factories","target":250},
      {"id":"TRADE_LOGISTICS","name":"Trade, Import, Export & Logistics","target":400},
      {"id":"ENERGY","name":"Energy System","target":250},
      {"id":"INFRASTRUCTURE","name":"Infrastructure","target":250},
      {"id":"POPULATION_SOCIETY","name":"Population & Society","target":250},
      {"id":"MILITARY","name":"Military & Defense","target":350},
      {"id":"DIPLOMACY","name":"Diplomacy & International Relations","target":300},
      {"id":"TECHNOLOGY","name":"Technology, Research & Industrial Development","target":250},
      {"id":"RISK_REASONING","name":"Risk, Causality, Strategy & Reasoning","target":300},
      {"id":"GAME_ACTIONS","name":"Game Action & Policy Operators","target":250},
      {"id":"LANGUAGE_CONTROL","name":"Language, Grammar & Discourse Control","target":100}
    ],
    "concept_contract": {
      "required": [
        "concept_id","domain","subdomain","semantic_type","lexical.en","lexical.bn","morphology","grammar_features","semantic_roles","allowed_actions","compatible_variables","compatible_entities","phrase_patterns","paraphrase_family","register","priority"
      ],
      "lexical": {
        "english": ["lemma","aliases","forms","pos"],
        "bengali": ["lemma","aliases","forms","pos"]
      },
      "semantic_identity": "concept_id is the only canonical identity; surface strings are realizations, never identities."
    },
    "grammar": {
      "source_alignment": "Universal-Dependencies-compatible feature names where useful, with an OMEGA game-optimized subset.",
      "features": ["Person","Number","Case","Tense","Aspect","Mood","Voice","Polarity","Degree","VerbForm"],
      "bengali_case_subset": ["Nom","Gen","Acc","Loc"],
      "verb_forms": ["Fin","Inf","Part","Vnoun"],
      "dependency_relations": ["nsubj","obj","obl","advmod","aux","mark","conj","nmod"],
      "rule": "Grammar metadata describes a realization; it never creates a new canonical concept."
    },
    "semantic_pipeline": ["LEXICAL","MORPHOLOGICAL","SYNTACTIC","SEMANTIC","OPERATIONAL"],
    "operational_rules": {
      "direction": ["POSITIVE_CHANGE","NEGATIVE_CHANGE","NEUTRAL"],
      "action_parameters": ["actor","target","scope","quantity","unit","intensity","time_horizon","constraint","condition"],
      "capability_boundary": "A compatible action is a semantic possibility, not proof that the game currently permits execution.",
      "unknown_entity": "UNRESOLVED",
      "ambiguous_entity": "ASK_OR_REPORT_AMBIGUITY",
      "unknown_fact": "UNKNOWN_WHEN_NOT_EVIDENCED"
    },
    "seed_concepts": [
      {
        "concept_id":"STATE_VARIABLE",
        "domain":"GAME_STATE",
        "subdomain":"STATE",
        "semantic_type":"STATE_VARIABLE",
        "lexical":{"en":{"lemma":"state","aliases":["status","condition"],"forms":["state","status","condition"],"pos":["NOUN"]},"bn":{"lemma":"অবস্থা","aliases":["স্থিতি","পরিস্থিতি"],"forms":["অবস্থা","স্থিতি","পরিস্থিতি"],"pos":["NOUN"]}},
        "morphology":{"derivation":"runtime"},"grammar_features":{},"semantic_roles":["TARGET"],"allowed_actions":["COMPARE","FORECAST","ANALYZE"],"compatible_variables":["*"],"compatible_entities":["*"],"phrase_patterns":[],"paraphrase_family":"STATE","register":["neutral","formal"],"priority":"P1"
      },
      {
        "concept_id":"RESOURCE_PRODUCTION",
        "domain":"RESOURCES",
        "subdomain":"PRODUCTION",
        "semantic_type":"STATE_VARIABLE",
        "lexical":{"en":{"lemma":"production","aliases":["output","production rate","domestic output"],"forms":["production","output","production rate","domestic output"],"pos":["NOUN"]},"bn":{"lemma":"উৎপাদন","aliases":["উৎপাদনের পরিমাণ","উৎপাদন হার","আউটপুট"],"forms":["উৎপাদন","উৎপাদনের পরিমাণ","উৎপাদন হার","আউটপুট"],"pos":["NOUN"]}},
        "morphology":{"derivation":"runtime"},"grammar_features":{},"semantic_roles":["TARGET","BASELINE","DESIRED_STATE"],"allowed_actions":["INCREASE","DECREASE","MAINTAIN","FORECAST","COMPARE"],"compatible_variables":["PRODUCTION"],"compatible_entities":["RESOURCE","COUNTRY"],"phrase_patterns":["increase {target}","{target} production"],"paraphrase_family":"PRODUCTION","register":["neutral","technical"],"priority":"P0"
      },
      {
        "concept_id":"ACTION_INCREASE",
        "domain":"GAME_ACTIONS",
        "subdomain":"CHANGE_OF_STATE",
        "semantic_type":"ACTION",
        "lexical":{"en":{"lemma":"increase","aliases":["raise","boost","expand"],"forms":["increase","increases","increased","increasing","raise","boost","expand"],"pos":["VERB"]},"bn":{"lemma":"বাড়ানো","aliases":["বৃদ্ধি করা","বাড়িয়ে দেওয়া"],"forms":["বাড়ানো","বৃদ্ধি করা","বাড়িয়ে দেওয়া"],"pos":["VERB"]}},
        "morphology":{"derivation":"runtime","inflectional_features":["Tense","Aspect","Mood","Voice","Polarity","Person","Number","VerbForm"]},"grammar_features":{"direction":"POSITIVE_CHANGE"},"semantic_roles":["ACTOR","TARGET","DESIRED_STATE","CONSTRAINT"],"allowed_actions":["INCREASE"],"compatible_variables":["PRODUCTION","EXPORTS","IMPORTS","CAPACITY","GDP","ENERGY","POPULATION"],"compatible_entities":["COUNTRY","RESOURCE","FACILITY","ECONOMIC_VARIABLE"],"phrase_patterns":["increase {target}","{actor} increases {target}"],"paraphrase_family":"POSITIVE_CHANGE","register":["neutral","formal","technical"],"priority":"P0"
      }
    ],
    "population_policy": {
      "current_seed_count": 3,
      "target_count": 4500,
      "do_not_fabricate": true,
      "next_step": "Populate exact category-by-category inventory, deduplicate against existing domain lexicon, then validate every concept against this contract before wiring it into runtime."
    }
  });

  const SOURCE_MANIFEST = Object.freeze({
    offline_language_vocabulary: Object.freeze({ path: 'offline_language_vocabulary.json', role: 'lexicon+grammar+policy', required: true }),
    offline_lexicon: Object.freeze({ path: 'offline_lexicon.json', role: 'full_lexical_corpus', required: true }),
    offline_semantic_knowledge: Object.freeze({ path: 'offline_semantic_knowledge.json', role: 'semantic_aliases+relations+normalization', required: true }),
    omega_game_language_ontology: Object.freeze({ path: '<embedded:omega_game_language_ontology.json>', role: 'canonical_concepts+grammar_contract', required: true, embedded: true }),
    omega_game_language_source_inventory: Object.freeze({ path: 'omega_game_language_source_inventory.json', role: 'migration_inventory', required: true }),
    offline_semantic_brain: Object.freeze({ path: 'offline_semantic_brain.js', role: 'legacy_parser_adapter', required: true }),
    offline_query_engine: Object.freeze({ path: 'offline_query_engine.js', role: 'query_execution_adapter', required: true }),
    omega_game_language_bridge: Object.freeze({ path: '<embedded:omega_game_language_bridge.js>', role: 'canonical_concept_adapter', required: true, embedded: true }),
    omega_reasoning_dispatcher: Object.freeze({ path: 'omega_reasoning_dispatcher.js', role: 'reasoning_boundary', required: true }),
    omega_cognitive_engine: Object.freeze({ path: 'omega_cognitive_engine.js', role: 'reasoning_consumer', required: true }),
    omega_ai_integrity_layer: Object.freeze({ path: 'omega_ai_integrity_layer.js', role: 'epistemic_integrity', required: true })
  });
  const SOURCE_PATHS = Object.freeze(Object.values(SOURCE_MANIFEST).filter(x => !x.embedded).map(x => x.path));
  const EMBEDDED_SOURCE_PATHS = Object.freeze(Object.values(SOURCE_MANIFEST).filter(x => x.embedded).map(x => x.path));

  const OPERATION_SET = Object.freeze([
    'IDENTIFY','COUNT','QUANTITY','SELECT','PERSON','LOCATION','TIME','METHOD','CAUSE','CONSEQUENCE',
    'POLICY','FEASIBILITY','FORECAST','SCENARIO','COUNTERFACTUAL','COMPARE','ANALYZE','EXPLAIN','RECOMMEND',
    'ASSESS_RISK','ASSESS_SECURITY','TRACE_DEPENDENCY','TRACE_SUPPLY_CHAIN','INCREASE','DECREASE','MAINTAIN',
    'BUILD','UPGRADE','IMPORT','EXPORT','APPOINT','REMOVE','NEGOTIATE','ALLOCATE','START','HALT'
  ]);
  const EVENT_STATES = Object.freeze(['EVENT_REQUESTED','EVENT_CONFIRMED','EVENT_REJECTED','EVENT_EXECUTED','EVENT_FAILED','EVENT_PENDING']);
  const GRAMMAR_FEATURES = Object.freeze(['Person','Number','Case','Tense','Aspect','Mood','Voice','Polarity','Degree','VerbForm']);
  const DEPENDENCY_RELATIONS = Object.freeze(['nsubj','obj','obl','advmod','aux','mark','conj','nmod']);

  const RUNTIME = {
    loaded: false, loading: null, data: Object.create(null), datasets: [], vocabulary: null,
    lexicon: null, semanticKnowledge: null, ontology: EMBEDDED_GAME_LANGUAGE_ONTOLOGY, inventory: null,
    brain: null, query: null, bridge: null, dispatcher: null, history: [], context: Object.create(null),
    learned: new Map(), index: { concepts: new Map(), surfaces: new Map(), pronunciations: new Map(), events: new Map(), sourceStats: Object.create(null) },
    lastAnalysis: null
  };

  const text = v => String(v == null ? '' : v);
  const object = v => !!v && typeof v === 'object';
  const clone = v => { if (v === undefined) return undefined; try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } };
  const normalize = v => text(v).normalize('NFKC').toLowerCase().replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/[?!,.:;"'“”‘’(){}\[\]<>—–]/g, ' ').replace(/\s+/g, ' ').trim();
  const languageOf = v => /[\u0980-\u09FF]/.test(text(v)) ? 'bn' : 'en';
  const assertInput = v => { const q = text(v).normalize('NFKC'); if (q.length > MAX_INPUT_CHARS) throw new Error('OMEGA_LANGUAGE_INPUT_TOO_LARGE'); return q; };

  function safeHistoryRead() { if (typeof localStorage === 'undefined') return []; try { const x = JSON.parse(localStorage.getItem('omega.language.context.v1') || '[]'); return Array.isArray(x) ? x.slice(-MAX_HISTORY_TURNS) : []; } catch (_) { return []; } }
  function safeHistoryWrite(h) { if (typeof localStorage === 'undefined') return; try { localStorage.setItem('omega.language.context.v1', JSON.stringify(h.slice(-MAX_HISTORY_TURNS))); } catch (_) {} }
  function recordHistory(role, content, metadata) { RUNTIME.history.push({ role, content: text(content).slice(0, MAX_INPUT_CHARS), timestamp: Date.now(), metadata: metadata ? clone(metadata) : undefined }); RUNTIME.history = RUNTIME.history.slice(-MAX_HISTORY_TURNS); safeHistoryWrite(RUNTIME.history); }

  function currentContext(extra) {
    const gs = global.Game?.state || global.gameState || global.Omega?.World?.state || {};
    const ui = global.OmegaCabinetUI || {};
    const minister = ui.currentInterrogatedMinister || ui.currentMinister || ui.activeMinister || global.OmegaMinisterState?.activeMinister || {};
    return Object.assign({
      countryId: gs.countryCode || gs.countryId || gs.playerCountryId || ui.activeCountry || '',
      countryName: gs.countryName || gs.country?.name || ui.activeCountry || '',
      ministerId: minister.id || ui.currentMinisterId || '', ministerName: minister.name || minister.displayName || '',
      ministerRole: minister.role || minister.title || '', ministryId: minister.ministryId || ui.currentMinistryId || '', gameState: gs
    }, RUNTIME.context, object(extra) ? extra : {});
  }

  function validateOntology(o) {
    const e = [];
    if (!object(o)) return ['ONTOLOGY_NOT_OBJECT'];
    if (!Array.isArray(o.concept_contract?.required) || !o.concept_contract.required.length) e.push('ONTOLOGY_CONTRACT_MISSING');
    if (o.canonical_concept_target !== 4500) e.push('ONTOLOGY_TARGET_CHANGED');
    if (o.grammar?.features && JSON.stringify(o.grammar.features) !== JSON.stringify(GRAMMAR_FEATURES)) e.push('GRAMMAR_FEATURE_SET_CHANGED');
    if (o.grammar?.dependency_relations && JSON.stringify(o.grammar.dependency_relations) !== JSON.stringify(DEPENDENCY_RELATIONS)) e.push('DEPENDENCY_SET_CHANGED');
    if (o.operational_rules?.unknown_entity !== 'UNRESOLVED') e.push('UNKNOWN_ENTITY_POLICY_CHANGED');
    if (o.operational_rules?.ambiguous_entity !== 'ASK_OR_REPORT_AMBIGUITY') e.push('AMBIGUITY_POLICY_CHANGED');
    if (o.operational_rules?.unknown_fact !== 'UNKNOWN_WHEN_NOT_EVIDENCED') e.push('UNKNOWN_FACT_POLICY_CHANGED');
    return e;
  }
  function validateVocabulary(v) {
    const e = [];
    if (!object(v) || !v.languages?.en || !v.languages?.bn) e.push('BILINGUAL_VOCABULARY_MISSING');
    if (v?.semantic_policy?.world_entities_must_be_loaded_from_runtime_datasets !== true) e.push('WORLD_ENTITY_POLICY_CHANGED');
    if (v?.semantic_policy?.no_country_catalog_in_code !== true) e.push('COUNTRY_CATALOG_POLICY_CHANGED');
    if (v?.semantic_policy?.no_resource_catalog_in_code !== true) e.push('RESOURCE_CATALOG_POLICY_CHANGED');
    if (v?.semantic_policy?.no_asset_alias_catalog_in_code !== true) e.push('ASSET_CATALOG_POLICY_CHANGED');
    if (v?.semantic_policy?.no_answer_fact_catalog_in_code !== true) e.push('ANSWER_FACT_POLICY_CHANGED');
    return e;
  }

  async function fetchJSON(path) {
    if (typeof fetch !== 'function') throw new Error('OMEGA_LANGUAGE_FETCH_UNAVAILABLE:' + path);
    const r = await fetch('./' + path, { cache: 'no-store' });
    if (!r.ok) throw new Error('OMEGA_LANGUAGE_DATA_LOAD_FAILED:' + path);
    return r.json();
  }
  async function loadScript(path) {
    if (typeof document === 'undefined') return false;
    if ([...document.scripts].some(s => s.src && s.src.endsWith('/' + path))) return true;
    await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = './' + path; s.async = false; s.onload = resolve; s.onerror = () => reject(new Error('OMEGA_LANGUAGE_SCRIPT_LOAD_FAILED:' + path)); document.head.appendChild(s); });
    return true;
  }

  function addSurface(surface, record) { const s = normalize(surface); if (!s) return; if (!RUNTIME.index.surfaces.has(s)) RUNTIME.index.surfaces.set(s, []); const list = RUNTIME.index.surfaces.get(s); const key = JSON.stringify(record); if (!list.some(x => JSON.stringify(x) === key)) list.push(record); }
  function addPronunciation(value, record) { const p = normalize(value); if (!p) return; if (!RUNTIME.index.pronunciations.has(p)) RUNTIME.index.pronunciations.set(p, []); RUNTIME.index.pronunciations.get(p).push(record); }
  function registerConcept(concept, source) {
    if (!object(concept)) return;
    const id = text(concept.concept_id || concept.id || concept.term || '').trim(); if (!id) return;
    if (!RUNTIME.index.concepts.has(id)) RUNTIME.index.concepts.set(id, { source, record: clone(concept) });
    for (const lang of ['en','bn']) {
      const lex = concept.lexical?.[lang] || concept[lang] || {};
      for (const field of ['lemma','aliases','forms']) { const vals = Array.isArray(lex[field]) ? lex[field] : [lex[field]]; for (const v of vals) if (v) addSurface(v, { conceptId: id, language: lang, source, field }); }
      for (const field of ['pronunciation','pronunciations','phonetic','ipa']) { const vals = Array.isArray(lex[field]) ? lex[field] : [lex[field]]; for (const v of vals) if (v) addPronunciation(v, { conceptId: id, language: lang, source, field }); }
    }
    if (Array.isArray(concept.allowed_actions)) for (const a of concept.allowed_actions) registerEvent(a, id, source);
  }
  function registerEvent(name, conceptId, source) { const n = text(name).toUpperCase(); if (!n) return; if (!RUNTIME.index.events.has(n)) RUNTIME.index.events.set(n, { name: n, concepts: [], sources: [] }); const e = RUNTIME.index.events.get(n); if (conceptId && !e.concepts.includes(conceptId)) e.concepts.push(conceptId); if (source && !e.sources.includes(source)) e.sources.push(source); }

  function walkLexicalData(value, source, path, seen) {
    if (!object(value)) return;
    if (seen.has(value)) return; seen.add(value);
    if (Array.isArray(value)) { value.forEach((x, i) => walkLexicalData(x, source, path + '[' + i + ']', seen)); return; }
    const conceptLike = value.concept_id || (value.lexical && (value.lexical.en || value.lexical.bn)); if (conceptLike) registerConcept(value, source);
    for (const [k, v] of Object.entries(value)) {
      const p = path ? path + '.' + k : k;
      if (['pronunciation','pronunciations','phonetic','ipa'].includes(k)) { const vals = Array.isArray(v) ? v : [v]; vals.forEach(x => addPronunciation(x, { source, path: p })); }
      if (['event','events','event_types','event_states','allowed_actions','actions'].includes(k) && Array.isArray(v)) v.forEach(x => registerEvent(x, null, source));
      walkLexicalData(v, source, p, seen);
    }
  }

  function buildCanonicalIndex() {
    RUNTIME.index = { concepts: new Map(), surfaces: new Map(), pronunciations: new Map(), events: new Map(), sourceStats: Object.create(null) };
    RUNTIME.data['<embedded:omega_game_language_ontology.json>'] = RUNTIME.ontology;
    for (const [path, data] of Object.entries(RUNTIME.data)) { if (!data) continue; walkLexicalData(data, path, '', new Set()); RUNTIME.index.sourceStats[path] = { loaded: true, topLevelKeys: object(data) ? Object.keys(data).length : 0 }; }
    RUNTIME.index.sourceStats['<embedded:omega_game_language_bridge.js>'] = { loaded: true, type: 'runtime-behavior', version: GAME_LANGUAGE_BRIDGE.VERSION };
    for (const op of OPERATION_SET) registerEvent(op, null, 'OMEGA_OPERATION_SET');
    for (const state of EVENT_STATES) registerEvent(state, null, 'OMEGA_EVENT_STATE_SET');
    const learned = safeLearnedRead(); for (const x of learned) if (x?.surface) RUNTIME.learned.set(x.surface, Object.freeze(x));
  }

  function safeLearnedRead() { if (typeof localStorage === 'undefined') return []; try { const x = JSON.parse(localStorage.getItem('omega.language.learned.v1') || '[]'); return Array.isArray(x) ? x.slice(-MAX_LEARNED_MAPPINGS) : []; } catch (_) { return []; } }
  function safeLearnedWrite() { if (typeof localStorage === 'undefined') return; try { localStorage.setItem('omega.language.learned.v1', JSON.stringify([...RUNTIME.learned.values()].slice(-MAX_LEARNED_MAPPINGS))); } catch (_) {} }

  async function loadSources() {
    if (RUNTIME.loading) return RUNTIME.loading;
    RUNTIME.loading = (async () => {
      const jsonPaths = SOURCE_PATHS.filter(p => p.endsWith('.json'));
      const results = await Promise.all(jsonPaths.map(async p => [p, await fetchJSON(p)]));
      for (const [p, d] of results) RUNTIME.data[p] = d;
      for (const p of ['offline_semantic_brain.js','offline_query_engine.js','omega_reasoning_dispatcher.js']) { try { await loadScript(p); } catch (e) { if (p !== 'omega_reasoning_dispatcher.js') throw e; } }
      RUNTIME.vocabulary = RUNTIME.data['offline_language_vocabulary.json'];
      RUNTIME.lexicon = RUNTIME.data['offline_lexicon.json'];
      RUNTIME.semanticKnowledge = RUNTIME.data['offline_semantic_knowledge.json'];
      RUNTIME.ontology = EMBEDDED_GAME_LANGUAGE_ONTOLOGY;
      RUNTIME.inventory = RUNTIME.data['omega_game_language_source_inventory.json'];
      const errors = [...validateOntology(RUNTIME.ontology), ...validateVocabulary(RUNTIME.vocabulary)]; if (errors.length) throw new Error('OMEGA_LANGUAGE_CONTRACT_INVALID:' + errors.join(','));
      RUNTIME.brain = global.OfflineSemanticBrain || null; RUNTIME.query = global.OfflineQueryEngine || null; RUNTIME.dispatcher = global.OmegaReasoningDispatcher || null;
      GAME_LANGUAGE_BRIDGE.load(RUNTIME.ontology); GAME_LANGUAGE_BRIDGE.install(); RUNTIME.bridge = GAME_LANGUAGE_BRIDGE;
      global.OmegaGameLanguageBridge = GAME_LANGUAGE_BRIDGE;
      RUNTIME.history = safeHistoryRead(); buildCanonicalIndex(); RUNTIME.loaded = true; return diagnostics();
    })().catch(error => { RUNTIME.loading = null; RUNTIME.loaded = false; throw error; });
    return RUNTIME.loading;
  }

  function configure(options) {
    const o = object(options) ? options : {};
    if (Array.isArray(o.datasets)) RUNTIME.datasets = o.datasets.filter(object).slice(0, 128);
    if (object(o.vocabulary)) RUNTIME.vocabulary = o.vocabulary;
    if (object(o.context)) RUNTIME.context = Object.assign({}, RUNTIME.context, clone(o.context));
    if (Array.isArray(o.ministers)) RUNTIME.datasets.push({ ministers_database: { all: o.ministers.slice(0, 10000) } });
    if (RUNTIME.brain?.configure) { try { RUNTIME.brain.configure({ datasets: RUNTIME.datasets, vocabulary: RUNTIME.vocabulary, lexicon: RUNTIME.lexicon, semanticKnowledge: RUNTIME.semanticKnowledge }); } catch (_) {} }
    return diagnostics();
  }
  function sourceData(path) { if (path === '<embedded:omega_game_language_ontology.json>') return clone(EMBEDDED_GAME_LANGUAGE_ONTOLOGY); return RUNTIME.data[path] || null; }
  function concept(conceptId) { return clone(RUNTIME.index.concepts.get(text(conceptId))?.record || null); }

  function canonicalCandidates(surface, language) {
    const q = normalize(surface); if (!q) return [];
    const exact = RUNTIME.index.surfaces.get(q) || []; const candidates = new Map();
    for (const hit of exact) candidates.set(hit.conceptId, { conceptId: hit.conceptId, language: hit.language, source: hit.source, score: 1 });
    if (!exact.length) for (const [s, hits] of RUNTIME.index.surfaces) if (s !== q && (q.includes(s) || s.includes(q))) { const score = 0.60 + 0.34 * Math.min(q.length, s.length) / Math.max(q.length, s.length); for (const h of hits) { const old = candidates.get(h.conceptId); if (!old || score > old.score) candidates.set(h.conceptId, { conceptId: h.conceptId, language: h.language, source: h.source, score }); } }
    return [...candidates.values()].sort((a,b) => b.score-a.score || a.conceptId.localeCompare(b.conceptId));
  }

  function analyze(question, context) {
    const raw = assertInput(question); if (!raw.trim()) return { ok:false, error:'EMPTY_INPUT' }; const ctx = currentContext(context); let parsed;
    if (RUNTIME.brain?.parse) parsed = RUNTIME.brain.parse(raw, ctx); else parsed = { raw, surface:raw, language:languageOf(raw), operation:'IDENTIFY', entities:{} };
    parsed = object(parsed) ? parsed : { raw, surface:raw, language:languageOf(raw), operation:'IDENTIFY', entities:{} };
    const language = parsed.language || languageOf(raw); const operation = text(parsed.operation || parsed.intent || 'IDENTIFY').toUpperCase(); const candidates = canonicalCandidates(parsed.surface || raw, language);
    const confidence = Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : (candidates[0]?.score ?? null); const margin = candidates.length > 1 ? candidates[0].score - candidates[1].score : null; const ambiguity = candidates.length > 1 && margin < SECOND_BEST_MARGIN;
    const out = { ...clone(parsed), raw, surface:text(parsed.surface || raw), language, operation:OPERATION_SET.includes(operation) ? operation : 'IDENTIFY', grammar:object(parsed.grammar)?clone(parsed.grammar):{}, semanticRoles:object(parsed.semanticRoles)?clone(parsed.semanticRoles):{}, unresolved:Array.isArray(parsed.unresolved)?clone(parsed.unresolved):[], confidence, canonicalCandidates:candidates.slice(0,20), ambiguity, secondBestMargin:margin, contract:{schema:SCHEMA_VERSION,unknownEntity:'UNRESOLVED',ambiguousEntity:'ASK_OR_REPORT_AMBIGUITY',unknownFact:'UNKNOWN_WHEN_NOT_EVIDENCED',capabilityBoundary:'LANGUAGE_DOES_NOT_GRANT_EXECUTION_CAPABILITY'} };
    if (ambiguity) out.unresolved.push('AMBIGUOUS_CANONICAL_CONCEPT'); RUNTIME.lastAnalysis = out; return out;
  }
  function parse(q,c) { return analyze(q,c); }
  function resolve(parsed, context) { const p = object(parsed) ? parsed : analyze(parsed, context); const ctx = currentContext(context); const unresolved = Array.isArray(p.unresolved) ? [...p.unresolved] : []; const status = p.ambiguity ? 'AMBIGUOUS' : (p.confidence != null && p.confidence >= MIN_ENTITY_CONFIDENCE ? 'RESOLVED' : 'PARTIAL'); return { ...clone(p), context:ctx, entities:clone(p.entities||{}), unresolved, resolution:{status,confidence:p.confidence??null,secondBestMargin:p.secondBestMargin??null} }; }
  function executeIntent(parsed, datasets, context) { const resolved = resolve(parsed, context); const ds = Array.isArray(datasets) ? datasets : RUNTIME.datasets; if (!RUNTIME.query?.execute) return {ok:false,operation:resolved.operation,status:'EXECUTOR_UNAVAILABLE',facts:[],evidence:[],unknowns:['QUERY_EXECUTOR_UNAVAILABLE'],text:null,language:resolved.language}; try { const r = RUNTIME.query.execute(resolved, ds, resolved.language, currentContext(context)); return object(r)?clone(r):{ok:false,operation:resolved.operation,status:'EMPTY_RESULT',facts:[],evidence:[],unknowns:['EMPTY_RESULT'],text:null}; } catch(e) { return {ok:false,operation:resolved.operation,status:'EXECUTION_ERROR',facts:[],evidence:[],unknowns:['QUERY_EXECUTION_ERROR'],error:text(e.message).slice(0,500),text:null,language:resolved.language}; } }
  function dispatchReasoning(question, parsed, result, context) { if (!RUNTIME.dispatcher?.dispatch) return null; try { return clone(RUNTIME.dispatcher.dispatch(assertInput(question),parsed,result,currentContext(context))); } catch(e) { return {used:false,error:'REASONING_DISPATCH_ERROR',message:text(e.message).slice(0,300)}; } }
  function realize(result, language, options) { const r=object(result)?result:{}; const lang=language==='bn'?'bn':'en'; const o=object(options)?options:{}; if (typeof r.text==='string'&&r.text.trim()) return r.text.trim(); if (Array.isArray(r.unknowns)&&r.unknowns.length) return lang==='bn' ? 'বর্তমান প্রামাণ্য গেম ডেটায় এই প্রশ্নের নির্ভরযোগ্য উত্তর পাওয়া যায়নি। অজানা: '+r.unknowns.slice(0,5).join(', ') : 'The current authoritative game data does not provide a reliable answer. Unknown: '+r.unknowns.slice(0,5).join(', '); return o.allowEmpty===true?'':(lang==='bn'?'বর্তমান গেম ডেটা থেকে প্রামাণ্য উত্তর তৈরি করা যায়নি।':'An evidence-backed answer could not be produced from the current game data.'); }
  async function run(question, context) { await loadSources(); const raw=assertInput(question); const analysis=resolve(analyze(raw,context),context); const result=executeIntent(analysis,RUNTIME.datasets,context); const reasoning=dispatchReasoning(raw,analysis,result,context); if (reasoning?.used&&reasoning.text&&!result.text) result.text=reasoning.text; const answer=realize(result,analysis.language); recordHistory('user',raw,{operation:analysis.operation}); recordHistory('assistant',answer,{operation:analysis.operation,source:'OMEGA_LANGUAGE_SYSTEM'}); return {analysis,result,reasoning,answer,language:analysis.language}; }
  function learnPhrase(surface,intent,entity,confidence) { const q=normalize(surface), score=Number(confidence); if(!q||!Number.isFinite(score)||score<0.95) return false; if(RUNTIME.learned.size>=MAX_LEARNED_MAPPINGS&&!RUNTIME.learned.has(q)) return false; RUNTIME.learned.set(q,Object.freeze({surface:q,intent:text(intent).toUpperCase()||null,entity:text(entity)||null,confidence:score})); safeLearnedWrite(); return true; }
  function eventRequest(operation,parameters,context) { const op=text(operation).toUpperCase(); registerEvent(op,null,'RUNTIME_EVENT_REQUEST'); return Object.freeze({schema:SCHEMA_VERSION,type:'GAME_EVENT_REQUEST',state:'EVENT_REQUESTED',operation:OPERATION_SET.includes(op)?op:'IDENTIFY',parameters:clone(parameters||{}),context:clone(currentContext(context)),capabilityRequired:true,executionOwner:'GAME_CAPABILITY_AND_EVENT_ENGINE'}); }
  function gameLanguageOntology() { return clone(EMBEDDED_GAME_LANGUAGE_ONTOLOGY); }
  function diagnostics() { const i=RUNTIME.inventory, l=RUNTIME.lexicon, v=RUNTIME.vocabulary; return {version:VERSION,schema:SCHEMA_VERSION,ready:RUNTIME.loaded,sourceFiles:SOURCE_PATHS.slice(),embeddedSourceFiles:EMBEDDED_SOURCE_PATHS.slice(),sourceCount:SOURCE_PATHS.length,embeddedSourceCount:EMBEDDED_SOURCE_PATHS.length,ontologyTarget:RUNTIME.ontology?.canonical_concept_target??4500,ontologySeedCount:Array.isArray(RUNTIME.ontology?.seed_concepts)?RUNTIME.ontology.seed_concepts.length:0,sourceConceptCount:i?.source_concept_count??null,sourceRawSurfaceCount:i?.raw_surface_entry_count??null,sourceUniqueSurfaceCount:i?.unique_surface_entry_count??null,offlineLexiconTotalWords:l?.TOTAL_WORDS??null,languages:Object.keys(v?.languages||{}),datasetsLoaded:RUNTIME.datasets.length,canonicalConcepts:RUNTIME.index.concepts.size,indexedSurfaces:RUNTIME.index.surfaces.size,indexedPronunciations:RUNTIME.index.pronunciations.size,indexedEvents:RUNTIME.index.events.size,learnedMappings:RUNTIME.learned.size,historyTurns:RUNTIME.history.length,grammarFeatures:GRAMMAR_FEATURES.slice(),dependencyRelations:DEPENDENCY_RELATIONS.slice(),operationCount:OPERATION_SET.length,eventStates:EVENT_STATES.slice(),sourceStats:clone(RUNTIME.index.sourceStats),security:{maxInputChars:MAX_INPUT_CHARS,maxHistoryTurns:MAX_HISTORY_TURNS,maxLearnedMappings:MAX_LEARNED_MAPPINGS,minimumEntityConfidence:MIN_ENTITY_CONFIDENCE,secondBestMargin:SECOND_BEST_MARGIN,usesEval:false,usesFunctionConstructor:false,answerFactCatalogInCode:false,worldStateOwnedByLanguageCore:false}}; }
  function validate() { const ontologyErrors=validateOntology(RUNTIME.ontology), vocabularyErrors=validateVocabulary(RUNTIME.vocabulary), i=RUNTIME.inventory; const canonical=RUNTIME.loaded ? {concepts:RUNTIME.index.concepts.size,surfaces:RUNTIME.index.surfaces.size,pronunciations:RUNTIME.index.pronunciations.size,events:RUNTIME.index.events.size} : null; return {ok:ontologyErrors.length===0&&vocabularyErrors.length===0,ontologyErrors,vocabularyErrors,canonical,migration:{sourceConcepts:i?.source_concept_count??null,rawSurfaceEntries:i?.raw_surface_entry_count??null,uniqueSurfaceEntries:i?.unique_surface_entry_count??null,invariant:'source = migrated + deduplicated + intentionally_excluded',silentLossAllowed:false,embeddedOntology:true,embeddedBridge:true}}; }

  const API=Object.freeze({VERSION,SCHEMA_VERSION,SOURCE_MANIFEST,SOURCE_PATHS,EMBEDDED_SOURCE_PATHS,OPERATION_SET,EVENT_STATES,GRAMMAR_FEATURES,DEPENDENCY_RELATIONS,load:loadSources,configure,sourceData,concept,analyze,parse,resolve,executeIntent,realize,run,dispatchReasoning,eventRequest,learnPhrase,canonicalCandidates,diagnostics,validate,gameLanguageOntology,get context(){return clone(RUNTIME.context);},setContext(v){RUNTIME.context=object(v)?Object.assign({},RUNTIME.context,clone(v)):RUNTIME.context;return clone(RUNTIME.context);}});
  global.OmegaLanguageSystem=API;
  global.__OMEGA_LANGUAGE_SYSTEM_READY__=true;

  /* Exact executable behavior formerly provided by omega_game_language_bridge.js. */
  const GAME_LANGUAGE_BRIDGE_STATE = { ontology: EMBEDDED_GAME_LANGUAGE_ONTOLOGY, installed: false };
  function bridgeText(value) { return String(value == null ? '' : value).trim(); }
  function bridgeNorm(value) { return bridgeText(value).normalize('NFKC').toLowerCase().replace(/[?!,.:;"'“”‘’(){}\[\]<>—–]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function bridgeSurfaceForms(conceptRecord, language) { const lexical = conceptRecord?.lexical?.[language] || {}; return [...new Set([lexical.lemma, ...(lexical.aliases || []), ...(lexical.forms || [])].filter(Boolean).map(bridgeNorm))]; }
  const GAME_LANGUAGE_BRIDGE = {
    VERSION: '1.0.1',
    load(value) { GAME_LANGUAGE_BRIDGE_STATE.ontology = value && typeof value === 'object' ? value : EMBEDDED_GAME_LANGUAGE_ONTOLOGY; return GAME_LANGUAGE_BRIDGE_STATE.ontology; },
    match(surface, language) {
      const q = bridgeNorm(surface); const ontology = GAME_LANGUAGE_BRIDGE_STATE.ontology;
      if (!q || !ontology?.seed_concepts?.length) return [];
      const hits = [];
      for (const conceptRecord of ontology.seed_concepts) for (const form of bridgeSurfaceForms(conceptRecord, language)) {
        if (!form) continue;
        let score = 0;
        if (q === form) score = 1;
        else if (q.includes(form) || form.includes(q)) score = 0.60 + 0.34 * Math.min(q.length, form.length) / Math.max(q.length, form.length);
        if (score >= 0.60) hits.push({ concept_id: conceptRecord.concept_id, domain: conceptRecord.domain, semantic_type: conceptRecord.semantic_type, score: Number(score.toFixed(3)), priority: conceptRecord.priority });
      }
      const best = new Map(); for (const hit of hits) if (!best.has(hit.concept_id) || best.get(hit.concept_id).score < hit.score) best.set(hit.concept_id, hit); return [...best.values()].sort((a, b) => b.score - a.score || a.concept_id.localeCompare(b.concept_id));
    },
    enrich(parsed) {
      if (!parsed || typeof parsed !== 'object') return parsed;
      const surface = bridgeText(parsed.surface || parsed.raw || ''); const language = parsed.language || (/[\u0980-\u09FF]/.test(surface) ? 'bn' : 'en'); const candidates = GAME_LANGUAGE_BRIDGE.match(surface, language);
      const out = { ...parsed, gameLanguage: { ontologyVersion: GAME_LANGUAGE_BRIDGE_STATE.ontology.schema_version || null, candidates } }; if (candidates.length && candidates[0].score >= 0.94) out.gameLanguage.canonicalConcept = candidates[0].concept_id; return out;
    },
    install() {
      if (GAME_LANGUAGE_BRIDGE_STATE.installed) return true;
      if (!global.OfflineSemanticBrain || typeof global.OfflineSemanticBrain.parse !== 'function') return false;
      const original = global.OfflineSemanticBrain.parse;
      if (original.__omegaGameLanguageWrapped) { GAME_LANGUAGE_BRIDGE_STATE.installed = true; return true; }
      const wrapped = function (question, context) { return GAME_LANGUAGE_BRIDGE.enrich(original.call(this, question, context)); };
      Object.defineProperty(wrapped, '__omegaGameLanguageWrapped', { value: true }); global.OfflineSemanticBrain.parse = wrapped; GAME_LANGUAGE_BRIDGE_STATE.installed = true; return true;
    }
  };
  Object.defineProperty(GAME_LANGUAGE_BRIDGE, 'ontology', { enumerable: true, get() { return GAME_LANGUAGE_BRIDGE_STATE.ontology; } });
  Object.freeze(GAME_LANGUAGE_BRIDGE);
  global.OmegaGameLanguageBridge = GAME_LANGUAGE_BRIDGE;
})(typeof window !== 'undefined' ? window : globalThis);
