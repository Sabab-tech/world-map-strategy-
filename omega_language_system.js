/*
 * OMEGA LANGUAGE SYSTEM v1.0.0
 * Canonical linguistic boundary for the game.
 *
 * IMPORTANT:
 * - This file is the runtime owner of language orchestration, not world-state.
 * - Existing language datasets remain lossless source-of-truth inputs until the
 *   generated bundle has passed migration/completeness tests.
 * - Country/resource/minister facts MUST come from authoritative runtime data.
 * - No eval(), Function(), dynamic code generation, or answer-fact catalogue.
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = 'OMEGA-LANGUAGE-SYSTEM/1';
  const MAX_INPUT_CHARS = 20000;
  const MAX_HISTORY_TURNS = 200;
  const MIN_ENTITY_CONFIDENCE = 0.82;
  const SECOND_BEST_MARGIN = 0.08;

  const SOURCE_MANIFEST = Object.freeze({
    offline_language_vocabulary: Object.freeze({ path: 'offline_language_vocabulary.json', sha: '1b1320412a3bfc3eabec82cc4a9ef8be37d2d358' }),
    offline_lexicon: Object.freeze({ path: 'offline_lexicon.json', sha: 'UNKNOWN_AT_RUNTIME' }),
    offline_semantic_knowledge: Object.freeze({ path: 'offline_semantic_knowledge.json', sha: '532cc159e1f63b1753a3a7970b7d5df0d87f5c07' }),
    omega_game_language_ontology: Object.freeze({ path: 'omega_game_language_ontology.json', sha: 'c54746c825a41d2ce036eb3cf31bea0d26de5d7f' }),
    omega_game_language_source_inventory: Object.freeze({ path: 'omega_game_language_source_inventory.json', sha: 'SOURCE_INVENTORY_LOCKED' }),
    offline_semantic_brain: Object.freeze({ path: 'offline_semantic_brain.js', sha: 'LEGACY_RUNTIME' }),
    offline_query_engine: Object.freeze({ path: 'offline_query_engine.js', sha: 'LEGACY_RUNTIME' }),
    omega_game_language_bridge: Object.freeze({ path: 'omega_game_language_bridge.js', sha: 'LEGACY_COMPATIBILITY' }),
    omega_reasoning_dispatcher: Object.freeze({ path: 'omega_reasoning_dispatcher.js', sha: 'LEGACY_BOUNDARY' }),
    omega_cognitive_engine: Object.freeze({ path: 'omega_cognitive_engine.js', sha: 'LEGACY_REASONING' }),
    omega_ai_integrity_layer: Object.freeze({ path: 'omega_ai_integrity_layer.js', sha: 'LEGACY_INTEGRITY' })
  });

  const SOURCE_PATHS = Object.freeze(Object.values(SOURCE_MANIFEST).map(x => x.path));
  const OPERATION_SET = Object.freeze([
    'IDENTIFY', 'COUNT', 'QUANTITY', 'SELECT', 'PERSON', 'LOCATION', 'TIME',
    'METHOD', 'CAUSE', 'POLICY', 'FEASIBILITY', 'FORECAST', 'COMPARE',
    'ANALYZE', 'EXPLAIN', 'RECOMMEND', 'ASSESS_RISK', 'ASSESS_SECURITY',
    'TRACE_DEPENDENCY', 'TRACE_SUPPLY_CHAIN', 'INCREASE', 'DECREASE',
    'MAINTAIN', 'BUILD', 'UPGRADE', 'IMPORT', 'EXPORT', 'APPOINT', 'REMOVE',
    'NEGOTIATE', 'ALLOCATE', 'START', 'HALT'
  ]);

  const EVENT_STATES = Object.freeze([
    'EVENT_REQUESTED', 'EVENT_CONFIRMED', 'EVENT_REJECTED',
    'EVENT_EXECUTED', 'EVENT_FAILED', 'EVENT_PENDING'
  ]);

  const GRAMMAR_FEATURES = Object.freeze([
    'Person', 'Number', 'Case', 'Tense', 'Aspect', 'Mood', 'Voice',
    'Polarity', 'Degree', 'VerbForm'
  ]);

  const DEPENDENCY_RELATIONS = Object.freeze([
    'nsubj', 'obj', 'obl', 'advmod', 'aux', 'mark', 'conj', 'nmod'
  ]);

  const RUNTIME = {
    loaded: false,
    loading: null,
    data: Object.create(null),
    datasets: [],
    vocabulary: null,
    brain: null,
    query: null,
    dispatcher: null,
    history: [],
    context: Object.create(null),
    learned: new Map(),
    lastAnalysis: null
  };

  function text(value) { return String(value == null ? '' : value); }
  function object(value) { return !!value && typeof value === 'object'; }
  function normalize(value) {
    return text(value).normalize('NFKC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').replace(/[?!,.:;"'“”‘’(){}\[\]<>—–]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function languageOf(value) { return /[\u0980-\u09FF]/.test(text(value)) ? 'bn' : 'en'; }
  function assertInput(value) {
    const q = text(value).normalize('NFKC');
    if (q.length > MAX_INPUT_CHARS) throw new Error('OMEGA_LANGUAGE_INPUT_TOO_LARGE');
    return q;
  }
  function clone(value) {
    if (value === undefined) return undefined;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  }
  function freeze(value) {
    if (!object(value) || Object.isFrozen(value)) return value;
    for (const key of Object.keys(value)) freeze(value[key]);
    return Object.freeze(value);
  }

  function safeHistoryRead() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const parsed = JSON.parse(localStorage.getItem('omega.language.context.v1') || '[]');
      return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY_TURNS) : [];
    } catch (_) { return []; }
  }
  function safeHistoryWrite(history) {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem('omega.language.context.v1', JSON.stringify(history.slice(-MAX_HISTORY_TURNS))); } catch (_) {}
  }

  function recordHistory(role, content, metadata) {
    const item = { role, content: text(content).slice(0, MAX_INPUT_CHARS), timestamp: Date.now() };
    if (metadata) item.metadata = clone(metadata);
    RUNTIME.history.push(item);
    RUNTIME.history = RUNTIME.history.slice(-MAX_HISTORY_TURNS);
    safeHistoryWrite(RUNTIME.history);
  }

  function currentContext(extra) {
    const gs = global.Game?.state || global.gameState || global.Omega?.World?.state || {};
    const ui = global.OmegaCabinetUI || {};
    const minister = ui.currentInterrogatedMinister || ui.currentMinister || ui.activeMinister || global.OmegaMinisterState?.activeMinister || {};
    const base = {
      countryId: gs.countryCode || gs.countryId || gs.playerCountryId || ui.activeCountry || '',
      countryName: gs.countryName || gs.country?.name || ui.activeCountry || '',
      ministerId: minister.id || ui.currentMinisterId || '',
      ministerName: minister.name || minister.displayName || '',
      ministerRole: minister.role || minister.title || '',
      ministryId: minister.ministryId || ui.currentMinistryId || '',
      gameState: gs
    };
    return Object.assign({}, base, RUNTIME.context, object(extra) ? extra : {});
  }

  function validateOntology(ontology) {
    const errors = [];
    if (!object(ontology)) return ['ONTOLOGY_NOT_OBJECT'];
    const required = ontology.concept_contract?.required || [];
    if (!Array.isArray(required) || !required.length) errors.push('ONTOLOGY_CONTRACT_MISSING');
    if (ontology.canonical_concept_target !== 4500) errors.push('ONTOLOGY_TARGET_CHANGED');
    if (ontology.grammar?.features && JSON.stringify(ontology.grammar.features) !== JSON.stringify(GRAMMAR_FEATURES)) errors.push('GRAMMAR_FEATURE_SET_CHANGED');
    if (ontology.grammar?.dependency_relations && JSON.stringify(ontology.grammar.dependency_relations) !== JSON.stringify(DEPENDENCY_RELATIONS)) errors.push('DEPENDENCY_SET_CHANGED');
    if (ontology.operational_rules?.unknown_entity !== 'UNRESOLVED') errors.push('UNKNOWN_ENTITY_POLICY_CHANGED');
    if (ontology.operational_rules?.ambiguous_entity !== 'ASK_OR_REPORT_AMBIGUITY') errors.push('AMBIGUITY_POLICY_CHANGED');
    if (ontology.operational_rules?.unknown_fact !== 'UNKNOWN_WHEN_NOT_EVIDENCED') errors.push('UNKNOWN_FACT_POLICY_CHANGED');
    return errors;
  }

  function validateVocabulary(vocabulary) {
    const errors = [];
    if (!object(vocabulary)) return ['VOCABULARY_NOT_OBJECT'];
    if (!vocabulary.languages?.en || !vocabulary.languages?.bn) errors.push('BILINGUAL_VOCABULARY_MISSING');
    if (vocabulary.semantic_policy?.world_entities_must_be_loaded_from_runtime_datasets !== true) errors.push('WORLD_ENTITY_POLICY_CHANGED');
    if (vocabulary.semantic_policy?.no_country_catalog_in_code !== true) errors.push('COUNTRY_CATALOG_POLICY_CHANGED');
    if (vocabulary.semantic_policy?.no_resource_catalog_in_code !== true) errors.push('RESOURCE_CATALOG_POLICY_CHANGED');
    if (vocabulary.semantic_policy?.no_answer_fact_catalog_in_code !== true) errors.push('ANSWER_FACT_POLICY_CHANGED');
    return errors;
  }

  async function fetchJSON(path) {
    if (typeof fetch !== 'function') return null;
    const response = await fetch('./' + path, { cache: 'no-store' });
    if (!response.ok) throw new Error('OMEGA_LANGUAGE_DATA_LOAD_FAILED:' + path);
    return response.json();
  }

  async function loadScript(path) {
    if (typeof document === 'undefined') return false;
    if ([...document.scripts].some(s => s.src && s.src.endsWith('/' + path))) return true;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './' + path;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error('OMEGA_LANGUAGE_SCRIPT_LOAD_FAILED:' + path));
      document.head.appendChild(script);
    });
    return true;
  }

  async function loadSources() {
    if (RUNTIME.loading) return RUNTIME.loading;
    RUNTIME.loading = (async () => {
      const jsonPaths = [
        'offline_language_vocabulary.json',
        'offline_lexicon.json',
        'offline_semantic_knowledge.json',
        'omega_game_language_ontology.json',
        'omega_game_language_source_inventory.json'
      ];
      const entries = await Promise.all(jsonPaths.map(async path => [path, await fetchJSON(path)]));
      for (const [path, data] of entries) RUNTIME.data[path] = data;
      if (typeof global.OfflineSemanticBrain === 'undefined') await loadScript('offline_semantic_brain.js');
      if (typeof global.OfflineQueryEngine === 'undefined') await loadScript('offline_query_engine.js');
      if (typeof global.OmegaReasoningDispatcher === 'undefined') {
        try { await loadScript('omega_reasoning_dispatcher.js'); } catch (_) {}
      }
      RUNTIME.brain = global.OfflineSemanticBrain || null;
      RUNTIME.query = global.OfflineQueryEngine || null;
      RUNTIME.dispatcher = global.OmegaReasoningDispatcher || null;
      RUNTIME.vocabulary = RUNTIME.data['offline_language_vocabulary.json'];
      const ontology = RUNTIME.data['omega_game_language_ontology.json'];
      const errors = [...validateOntology(ontology), ...validateVocabulary(RUNTIME.vocabulary)];
      if (errors.length) throw new Error('OMEGA_LANGUAGE_CONTRACT_INVALID:' + errors.join(','));
      RUNTIME.history = safeHistoryRead();
      RUNTIME.loaded = true;
      return diagnostics();
    })().catch(error => { RUNTIME.loading = null; RUNTIME.loaded = false; throw error; });
    return RUNTIME.loading;
  }

  function configure(options) {
    const opts = object(options) ? options : {};
    if (Array.isArray(opts.datasets)) RUNTIME.datasets = opts.datasets.filter(object).slice(0, 128);
    if (object(opts.vocabulary)) RUNTIME.vocabulary = opts.vocabulary;
    if (object(opts.context)) RUNTIME.context = Object.assign({}, RUNTIME.context, clone(opts.context));
    if (Array.isArray(opts.ministers)) RUNTIME.datasets.push({ ministers_database: { all: opts.ministers.slice(0, 10000) } });
    if (RUNTIME.brain?.configure && RUNTIME.vocabulary) {
      try { RUNTIME.brain.configure({ datasets: RUNTIME.datasets, vocabulary: RUNTIME.vocabulary }); } catch (_) {}
    }
    return diagnostics();
  }

  function sourceData(path) { return RUNTIME.data[path] || null; }

  function analyze(question, context) {
    const raw = assertInput(question);
    if (!raw.trim()) return { ok: false, error: 'EMPTY_INPUT' };
    const ctx = currentContext(context);
    let parsed;
    if (RUNTIME.brain && typeof RUNTIME.brain.parse === 'function') {
      parsed = RUNTIME.brain.parse(raw, ctx);
    } else {
      parsed = { raw, surface: raw, language: languageOf(raw), operation: 'IDENTIFY', entities: {} };
    }
    parsed = object(parsed) ? parsed : { raw, surface: raw, language: languageOf(raw), operation: 'IDENTIFY', entities: {} };
    const language = parsed.language || languageOf(raw);
    const operation = text(parsed.operation || parsed.intent || 'IDENTIFY').toUpperCase();
    const safe = {
      ...clone(parsed),
      raw,
      surface: text(parsed.surface || raw),
      language,
      operation: OPERATION_SET.includes(operation) ? operation : 'IDENTIFY',
      grammar: object(parsed.grammar) ? clone(parsed.grammar) : {},
      semanticRoles: object(parsed.semanticRoles) ? clone(parsed.semanticRoles) : {},
      unresolved: Array.isArray(parsed.unresolved) ? clone(parsed.unresolved) : [],
      confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : null,
      contract: {
        schema: SCHEMA_VERSION,
        unknownEntity: 'UNRESOLVED',
        ambiguousEntity: 'ASK_OR_REPORT_AMBIGUITY',
        unknownFact: 'UNKNOWN_WHEN_NOT_EVIDENCED',
        capabilityBoundary: 'LANGUAGE_DOES_NOT_GRANT_EXECUTION_CAPABILITY'
      }
    };
    RUNTIME.lastAnalysis = safe;
    return safe;
  }

  function resolve(parsed, context) {
    const p = object(parsed) ? parsed : analyze(parsed, context);
    const ctx = currentContext(context);
    const entities = clone(p.entities || {});
    const unresolved = Array.isArray(p.unresolved) ? [...p.unresolved] : [];
    const result = {
      ...clone(p),
      context: ctx,
      entities,
      unresolved,
      resolution: { status: 'PARTIAL', confidence: p.confidence ?? null }
    };
    if (p.confidence != null && p.confidence >= MIN_ENTITY_CONFIDENCE) result.resolution.status = 'RESOLVED';
    else if (p.confidence != null && p.confidence >= 0.66) result.resolution.status = 'AMBIGUOUS';
    return result;
  }

  function executeIntent(parsed, datasets, context) {
    const resolved = resolve(parsed, context);
    const ds = Array.isArray(datasets) ? datasets : RUNTIME.datasets;
    if (!RUNTIME.query || typeof RUNTIME.query.execute !== 'function') {
      return {
        ok: false,
        operation: resolved.operation,
        status: 'EXECUTOR_UNAVAILABLE',
        facts: [],
        evidence: [],
        unknowns: ['QUERY_EXECUTOR_UNAVAILABLE'],
        text: null,
        language: resolved.language
      };
    }
    let result;
    try {
      result = RUNTIME.query.execute(resolved, ds, resolved.language, currentContext(context));
    } catch (error) {
      return {
        ok: false,
        operation: resolved.operation,
        status: 'EXECUTION_ERROR',
        facts: [],
        evidence: [],
        unknowns: ['QUERY_EXECUTION_ERROR'],
        error: text(error.message).slice(0, 500),
        text: null,
        language: resolved.language
      };
    }
    return object(result) ? clone(result) : { ok: false, operation: resolved.operation, status: 'EMPTY_RESULT', text: null, facts: [], evidence: [], unknowns: ['EMPTY_RESULT'] };
  }

  function dispatchReasoning(question, parsed, result, context) {
    if (!RUNTIME.dispatcher || typeof RUNTIME.dispatcher.dispatch !== 'function') return null;
    try {
      return clone(RUNTIME.dispatcher.dispatch(assertInput(question), parsed, result, currentContext(context)));
    } catch (error) {
      return { used: false, error: 'REASONING_DISPATCH_ERROR', message: text(error.message).slice(0, 300) };
    }
  }

  function realize(result, language, options) {
    const r = object(result) ? result : {};
    const lang = language === 'bn' ? 'bn' : 'en';
    const opts = object(options) ? options : {};
    if (typeof r.text === 'string' && r.text.trim()) return r.text.trim();
    if (Array.isArray(r.unknowns) && r.unknowns.length) {
      return lang === 'bn'
        ? 'বর্তমান প্রামাণ্য গেম ডেটায় এই প্রশ্নের নির্ভরযোগ্য উত্তর পাওয়া যায়নি। অজানা: ' + r.unknowns.slice(0, 5).join(', ')
        : 'The current authoritative game data does not provide a reliable answer. Unknown: ' + r.unknowns.slice(0, 5).join(', ');
    }
    if (opts.allowEmpty === true) return '';
    return lang === 'bn'
      ? 'বর্তমান গেম ডেটা থেকে প্রামাণ্য উত্তর তৈরি করা যায়নি।'
      : 'An evidence-backed answer could not be produced from the current game data.';
  }

  async function run(question, context) {
    await loadSources();
    const raw = assertInput(question);
    const analysis = analyze(raw, context);
    const resolved = resolve(analysis, context);
    const result = executeIntent(resolved, RUNTIME.datasets, context);
    const reasoning = dispatchReasoning(raw, resolved, result, context);
    if (reasoning?.used && reasoning.text && !result.text) result.text = reasoning.text;
    const answer = realize(result, resolved.language);
    recordHistory('user', raw, { operation: resolved.operation });
    recordHistory('assistant', answer, { operation: resolved.operation, source: 'OMEGA_LANGUAGE_SYSTEM' });
    return { analysis: resolved, result, reasoning, answer, language: resolved.language };
  }

  function learnPhrase(surface, intent, entity, confidence) {
    const q = normalize(surface);
    const score = Number(confidence);
    if (!q || !Number.isFinite(score) || score < 0.95) return false;
    if (RUNTIME.learned.size >= 512 && !RUNTIME.learned.has(q)) return false;
    const key = q.toLowerCase();
    RUNTIME.learned.set(key, Object.freeze({ surface: q, intent: text(intent).toUpperCase() || null, entity: text(entity) || null, confidence: score }));
    return true;
  }

  function eventRequest(operation, parameters, context) {
    const op = text(operation).toUpperCase();
    if (!EVENT_STATES.includes('EVENT_REQUESTED')) return null;
    return Object.freeze({
      schema: SCHEMA_VERSION,
      type: 'GAME_EVENT_REQUEST',
      state: 'EVENT_REQUESTED',
      operation: OPERATION_SET.includes(op) ? op : 'IDENTIFY',
      parameters: clone(parameters || {}),
      context: clone(currentContext(context)),
      capabilityRequired: true,
      executionOwner: 'GAME_CAPABILITY_AND_EVENT_ENGINE'
    });
  }

  function diagnostics() {
    const ontology = RUNTIME.data['omega_game_language_ontology.json'];
    const inventory = RUNTIME.data['omega_game_language_source_inventory.json'];
    const vocab = RUNTIME.data['offline_language_vocabulary.json'];
    const lexicon = RUNTIME.data['offline_lexicon.json'];
    return {
      version: VERSION,
      schema: SCHEMA_VERSION,
      ready: RUNTIME.loaded,
      sourceFiles: SOURCE_PATHS.slice(),
      sourceCount: SOURCE_PATHS.length,
      ontologyTarget: ontology?.canonical_concept_target ?? 4500,
      ontologySeedCount: Array.isArray(ontology?.seed_concepts) ? ontology.seed_concepts.length : 0,
      sourceConceptCount: inventory?.source_concept_count ?? null,
      sourceRawSurfaceCount: inventory?.raw_surface_entry_count ?? null,
      sourceUniqueSurfaceCount: inventory?.unique_surface_entry_count ?? null,
      offlineLexiconTotalWords: lexicon?.TOTAL_WORDS ?? null,
      languages: Object.keys(vocab?.languages || {}),
      datasetsLoaded: RUNTIME.datasets.length,
      learnedMappings: RUNTIME.learned.size,
      historyTurns: RUNTIME.history.length,
      grammarFeatures: GRAMMAR_FEATURES.slice(),
      dependencyRelations: DEPENDENCY_RELATIONS.slice(),
      operationCount: OPERATION_SET.length,
      eventStates: EVENT_STATES.slice(),
      security: {
        maxInputChars: MAX_INPUT_CHARS,
        maxHistoryTurns: MAX_HISTORY_TURNS,
        maxLearnedMappings: 512,
        minimumEntityConfidence: MIN_ENTITY_CONFIDENCE,
        secondBestMargin: SECOND_BEST_MARGIN,
        usesEval: false,
        usesFunctionConstructor: false,
        answerFactCatalogInCode: false,
        worldStateOwnedByLanguageCore: false
      }
    };
  }

  function validate() {
    const ontologyErrors = validateOntology(RUNTIME.data['omega_game_language_ontology.json']);
    const vocabularyErrors = validateVocabulary(RUNTIME.data['offline_language_vocabulary.json']);
    const inventory = RUNTIME.data['omega_game_language_source_inventory.json'];
    const migration = {
      sourceConcepts: inventory?.source_concept_count ?? null,
      rawSurfaceEntries: inventory?.raw_surface_entry_count ?? null,
      uniqueSurfaceEntries: inventory?.unique_surface_entry_count ?? null,
      invariant: 'source = migrated + deduplicated + intentionally_excluded',
      silentLossAllowed: false
    };
    return { ok: ontologyErrors.length === 0 && vocabularyErrors.length === 0, ontologyErrors, vocabularyErrors, migration };
  }

  const API = {
    VERSION,
    SCHEMA_VERSION,
    SOURCE_MANIFEST,
    SOURCE_PATHS,
    OPERATION_SET,
    EVENT_STATES,
    GRAMMAR_FEATURES,
    DEPENDENCY_RELATIONS,
    load: loadSources,
    configure,
    analyze,
    parse: analyze,
    resolve,
    executeIntent,
    realize,
    run,
    dispatchReasoning,
    eventRequest,
    learnPhrase,
    diagnostics,
    validate,
    sourceData,
    get context() { return clone(RUNTIME.context); },
    setContext(value) { RUNTIME.context = object(value) ? Object.assign({}, RUNTIME.context, clone(value)) : RUNTIME.context; return clone(RUNTIME.context); }
  };

  global.OmegaLanguageSystem = Object.freeze(API);
  global.__OMEGA_LANGUAGE_SYSTEM_READY__ = true;
})(typeof window !== 'undefined' ? window : globalThis);
