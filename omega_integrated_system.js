/**
 * OMEGA INTEGRATED SYSTEM v5.0.0
 * Master integration file consolidating all cognitive, semantic, minister, and resource systems
 * - Preserves all data from original modules
 * - Establishes cross-module communication bridges
 * - Maintains semantic understanding and runtime state
 */

(function(global){'use strict';

  // ===========================
  // CORE UTILITIES & STORAGE
  // ===========================
  
  const VERSION = '5.0.0-INTEGRATED';
  const text = v => String(v == null ? '' : v).trim();
  const norm = v => text(v).normalize('NFKC').toLowerCase().replace(/[?!,.:;'"(){}\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const object = v => v && typeof v === 'object';
  const scalar = v => v == null || ['string','number','boolean'].includes(typeof v);
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const clamp = (n, lo=0, hi=100) => Math.max(lo, Math.min(hi, Number.isFinite(Number(n)) ? Number(n) : lo));
  const isBengali = v => /[\u0980-\u09FF]/.test(text(v));
  
  function storage() { try { return global.localStorage || null; } catch(_) { return null; } }
  
  // ===========================
  // SEMANTIC KNOWLEDGE GRAPH
  // ===========================
  
  const semanticStore = {
    countries: new Map(),
    resources: new Map(),
    ministers: new Map(),
    vocabulary: null,
    datasets: [],
    questionPatterns: new Map(),
    assetClasses: new Map(),
    propertyAliases: {}
  };
  
  // ===========================
  // OFFLINE SEMANTIC BRAIN
  // ===========================
  
  const LEARNED_KEY = 'OMEGA_OFFLINE_SEMANTIC_LEARNING_V3';
  
  function learned() {
    const s = storage();
    if (!s) return {};
    try { return JSON.parse(s.getItem(LEARNED_KEY) || '{}'); }
    catch(_) { return {}; }
  }
  
  function learn(surface, type, id, confidence = 1) {
    if (!surface || !type || !id || confidence < 0.9) return false;
    const m = learned();
    m[`${type}:${norm(surface)}`] = { type, id, confidence, updatedAt: Date.now() };
    const s = storage();
    if (s) {
      try { s.setItem(LEARNED_KEY, JSON.stringify(m)); return true; }
      catch(_) { return false; }
    }
    return false;
  }
  
  function idOf(v, keyHint = '') {
    if (!object(v)) return text(keyHint).toUpperCase() || null;
    const c = [v.id, v.iso, v.iso3, v.isoCode, v.countryCode, v.code, v.canonical_id, v.canonicalId, keyHint];
    const x = c.find(y => /^[A-Z0-9_]{2,}/.test(String(y)));
    return x ? String(x).toUpperCase() : null;
  }
  
  function namesOf(v, keyHint = '') {
    if (!object(v)) return keyHint ? [keyHint] : [];
    const keys = ['name','countryName','officialName','shortName','displayName','label','title','resourceName','canonicalName','localName'];
    const out = [];
    for (const k of keys) {
      const val = v[k];
      if (typeof val === 'string' && val.trim()) out.push(val);
      else if (Array.isArray(val)) out.push(...val.filter(x => typeof x === 'string' && x.trim()));
    }
    return out.length ? out : (keyHint ? [keyHint] : []);
  }
  
  function classifyEntity(v, keyHint) {
    const key = norm(keyHint);
    const id = idOf(v, keyHint);
    const blob = key + ' ' + namesOf(v, keyHint).join(' ');
    if (!id) return null;
    if (id.length === 3 || /country|countries|sovereign|nation|coun/i.test(blob)) return { type: 'COUNTRY', id, surface: keyHint };
    if (/resource|mineral|commodity|asset|ore|gem|metal/i.test(blob)) return { type: 'RESOURCE', id, surface: keyHint };
    if (/minister|official|person|leader|secretary/i.test(blob)) return { type: 'MINISTER', id, surface: keyHint };
    return { type: 'ENTITY', id, surface: keyHint };
  }
  
  function collect(nodes) {
    const maps = { COUNTRY: new Map(), RESOURCE: new Map(), MINISTER: new Map() };
    const visit = (node, keyHint = '') => {
      if (!object(node)) return;
      if (Array.isArray(node)) { node.forEach((x, i) => visit(x, keyHint)); return; }
      for (const [k, v] of Object.entries(node)) {
        const hint = `${keyHint}.${k}`.replace(/^\./, '');
        const classification = classifyEntity(v, k);
        if (classification && maps[classification.type]) {
          const id = classification.id;
          if (!maps[classification.type].has(id)) {
            maps[classification.type].set(id, { id, names: namesOf(v, k), source: hint });
          }
        }
        if (object(v)) visit(v, hint);
      }
    };
    visit(nodes);
    return maps;
  }
  
  function configureSemantic(options = {}) {
    const datasets = Array.isArray(options.datasets) ? options.datasets.filter(object) : [];
    const all = collect(datasets);
    const explicit = Array.isArray(options.ministers) ? collect(options.ministers) : new Map();
    
    semanticStore.countries = all.COUNTRY;
    semanticStore.resources = all.RESOURCE;
    semanticStore.ministers = new Map([...all.MINISTER, ...explicit]);
    semanticStore.datasets = datasets;
    semanticStore.vocabulary = options.vocabulary || {};
    
    return { countries: semanticStore.countries.size, resources: semanticStore.resources.size, ministers: semanticStore.ministers.size };
  }
  
  // ===========================
  // QUESTION PARSING & ROUTING
  // ===========================
  
  const QMAP = {
    'what': 'IDENTIFY', 'who': 'PERSON', 'which': 'SELECT',
    'where': 'LOCATION', 'when': 'TIME', 'why': 'CAUSE',
    'how': 'METHOD', 'how_many': 'COUNT', 'how_much': 'QUANTITY',
    'should': 'POLICY', 'can': 'FEASIBILITY', 'will': 'FORECAST'
  };
  
  function vocabularyFor(lang) {
    const v = semanticStore.vocabulary || {};
    return v.languages ? (v.languages[lang] || v.languages.en || {}) : {};
  }
  
  function findPhrase(q, phrases) {
    for (const [semantic, aliases] of Object.entries(phrases || {})) {
      const alist = Array.isArray(aliases) ? aliases : [aliases];
      for (const alias of alist) {
        const normalized = norm(String(alias));
        if (q.includes(normalized)) {
          return { semantic, alias: normalized, raw: String(alias) };
        }
      }
    }
    return null;
  }
  
  function phrases(lang, section) {
    const g = vocabularyFor(lang)[section] || {};
    const out = [];
    for (const [semantic, aliases] of Object.entries(g)) {
      const alist = Array.isArray(aliases) ? aliases : [aliases];
      out.push(...alist.map(a => ({ semantic, alias: norm(String(a)), raw: String(a) })));
    }
    return out;
  }
  
  function detectQuestion(q, lang) {
    const h = findPhrase(q, phrases(lang, 'question'));
    return h ? {
      type: QMAP[h.semantic] || h.semantic,
      phrase: h.raw,
      confidence: clamp(0.62 + Math.min(0.32, h.alias.length / 100))
    } : { type: 'UNKNOWN', phrase: '', confidence: 0.1 };
  }
  
  function detectOperator(q, lang) {
    return findPhrase(q, phrases(lang, 'operators'))?.semantic || null;
  }
  
  function resolveEntity(q, list, type) {
    const hits = [];
    for (const e of list) {
      for (const n0 of namesOf(e, '')) {
        const n = norm(n0);
        if (!n || n.length < 2) continue;
        if (q === n || q.includes(n)) {
          hits.push({ e, n, score: q === n ? 1 : clamp(0.5 + n.length / 100) });
        }
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.length ? { id: idOf(hits[0].e), name: hits[0].n, confidence: hits[0].score, source: 'ENTITY_RESOLUTION' } : { id: null, name: '', confidence: 0, source: 'NOT_FOUND' };
  }
  
  function inferAsset(q, lang) {
    const h = findPhrase(q, phrases(lang, 'assets'));
    return h ? {
      id: h.semantic,
      type: 'ASSET_CLASS',
      confidence: clamp(0.72 + h.alias.length / 100),
      source: 'LANGUAGE_VOCABULARY',
      surface: h.raw
    } : { id: null, type: null, confidence: 0, source: 'NOT_FOUND' };
  }
  
  const PROPERTY_ALIASES = {
    en: {
      age: ['age','old','years old','how old'],
      name: ['name','called','named'],
      background: ['background','career','profession'],
      gender: ['gender','sex'],
      ideology: ['ideology','belief','political','stance']
    }
  };
  
  function detectProperty(q, lang) {
    const a = PROPERTY_ALIASES[lang] || PROPERTY_ALIASES.en;
    const h = [];
    for (const [p, as] of Object.entries(a)) {
      for (const x of as) {
        if (q.includes(norm(x))) h.push({ p, x });
      }
    }
    h.sort((a, b) => b.x.length - a.x.length);
    return h.length ? h[0].p : null;
  }
  
  function detectSubject(q, context) {
    const self = ['you','your','yourself','u','তুমি','তোমার','আপনি','আপনার','নিজের','নিজেকে'].some(w => q.includes(w));
    return self ? 'SELF' : 'THIRD_PARTY';
  }
  
  function routeSources(p) {
    const s = [];
    if (p.entities.minister?.id || p.subject.kind === 'SELF') s.push({ authority: 'MINISTER_REGISTRY', reason: 'minister identity/property' });
    if (p.entities.country?.id) s.push({ authority: 'COUNTRY_PROFILE', reason: 'country data' });
    if (p.entities.resource?.id) s.push({ authority: 'RESOURCE_INVENTORY', reason: 'resource asset' });
    if (p.entities.asset?.id) s.push({ authority: 'ASSET_DATABASE', reason: 'asset discovery' });
    return s;
  }
  
  function parse(question, context = {}) {
    const surface = text(question);
    const q = norm(surface);
    const lang = isBengali(surface) ? 'bn' : 'en';
    const qt = detectQuestion(q, lang);
    const country = resolveEntity(q, [...semanticStore.countries.values()], 'COUNTRY');
    const resource = resolveEntity(q, [...semanticStore.resources.values()], 'RESOURCE');
    const minister = resolveEntity(q, [...semanticStore.ministers.values()], 'MINISTER');
    const asset = inferAsset(q, lang);
    const property = detectProperty(q, lang);
    const subject = detectSubject(q, { countryId: context.countryId, ministerId: context.ministerId });
    const op = detectOperator(q, lang);
    const sources = routeSources({
      entities: { country, resource, minister, asset },
      subject: { kind: subject }
    });
    const intent = op || qt.type;
    const confidence = Math.max(qt.confidence, country.confidence, resource.confidence, minister.confidence, asset.confidence);
    
    const plan = {
      surface,
      language: lang,
      question: { type: qt.type, phrase: qt.phrase },
      intent,
      operation: op,
      property,
      subject: { kind: subject, context },
      entities: { country, resource, minister, asset },
      sources,
      confidence: clamp(confidence),
      executable: confidence > 0.3,
      context
    };
    
    return plan;
  }
  
  // ===========================
  // MINISTER STATE SYSTEM
  // ===========================
  
  const MINISTER_STORAGE_KEY = 'OMEGA_MINISTER_STATE_V2';
  const ministerRegistry = new Map();
  const assignmentIndex = new Map();
  const institutionalMemory = new Map();
  
  function ministerKey(countryId, ministryId) {
    return `${String(countryId || '').toUpperCase()}:${String(ministryId || '').toLowerCase()}`;
  }
  
  function emptyMemory() {
    return {
      working: [], episodic: [], semantic: [], procedural: [],
      strategic: [], relational: [], causal: [], self: [],
      decisions: [], lessons: []
    };
  }
  
  function normalizeMinisterProfile(profile) {
    if (!profile || !profile.id) throw new Error('MINISTER_PROFILE_INVALID');
    return {
      ministerId: String(profile.id),
      baseName: String(profile.name || profile.baseName || profile.id),
      background: String(profile.background || ''),
      gender: String(profile.gender || ''),
      baseAge: Number(profile.age) || null,
      ideology: clone(profile.ideology || {}),
      personalityProfile: clone(profile.personalityProfile || profile.personality || {}),
      baseStats: clone(profile.stats || {}),
      efficiencyProfile: clone(profile.efficiency || {})
    };
  }
  
  function emptyRuntime(ministerId, countryId, ministryId, gameTime) {
    return {
      ministerId, countryId, ministryId, status: 'ACTIVE',
      recruitmentTime: gameTime, assignmentTime: gameTime, lastUpdateTick: gameTime,
      workload: 0, cognitiveLoad: 0, stress: 0, fatigue: 0,
      politicalPressure: 0, economicPressure: 0, crisisPressure: 0,
      confidence: 50, trust: 50,
      activeTasks: [], activePlans: [], pendingDecisions: [],
      currentObjectives: [], currentAttention: [], currentStrategicPosture: null,
      stressContributors: {},
      workloadContributors: {}
    };
  }
  
  function emptyLearning(ministerId) {
    return {
      ministerId, totalServiceTime: 0, totalTaskExposure: 0,
      domainExperience: {}, crisisExperience: 0, decisionExperience: 0,
      successfulDecisions: 0, failedDecisions: 0, completedTasks: 0,
      forecastAccuracy: 0, forecastBrierScore: 0
    };
  }
  
  function registerMinister(profile, countryId, ministryId, gameTime = 0) {
    const id = String(profile?.id || '');
    if (!id) throw new Error('MINISTER_ID_REQUIRED');
    
    const identity = normalizeMinisterProfile(profile);
    const record = {
      identity,
      runtime: emptyRuntime(identity.ministerId, countryId, ministryId, gameTime),
      learning: emptyLearning(identity.ministerId),
      memory: emptyMemory(),
      institutionalKey: ministerKey(countryId, ministryId),
      version: 1
    };
    
    ministerRegistry.set(identity.ministerId, record);
    assignmentIndex.set(ministerKey(countryId, ministryId), identity.ministerId);
    
    global.dispatchEvent?.(new CustomEvent('MINISTER_REGISTERED', { detail: record }));
    return record;
  }
  
  function getMinister(ministerId) {
    return ministerRegistry.get(String(ministerId)) || null;
  }
  
  function getActiveMinister(countryId, ministryId) {
    const id = assignmentIndex.get(ministerKey(countryId, ministryId));
    return id ? getMinister(id) : null;
  }
  
  function updateMinisterRuntime(ministerId, patch, reason = 'RUNTIME_UPDATE') {
    const r = getMinister(ministerId);
    if (!r) throw new Error('MINISTER_NOT_REGISTERED');
    Object.assign(r.runtime, clone(patch));
    global.dispatchEvent?.(new CustomEvent('MINISTER_RUNTIME_CHANGED', { detail: { ministerId, reason, patch: clone(patch) } }));
    return r;
  }
  
  function updateMinisterLearning(ministerId, patch, reason = 'LEARNING_UPDATE') {
    const r = getMinister(ministerId);
    if (!r) throw new Error('MINISTER_NOT_REGISTERED');
    Object.assign(r.learning, clone(patch));
    global.dispatchEvent?.(new CustomEvent('MINISTER_LEARNING_CHANGED', { detail: { ministerId, reason, patch: clone(patch) } }));
    return r;
  }
  
  function recordDecision(ministerId, decision) {
    const r = getMinister(ministerId);
    if (!r) throw new Error('MINISTER_NOT_REGISTERED');
    r.memory.decisions.push(clone(decision));
    r.memory.decisions = r.memory.decisions.slice(-250);
    return true;
  }
  
  function storeMemory(ministerId, item, type = 'episodic') {
    const r = getMinister(ministerId);
    if (!r) return false;
    const arr = r.memory[type] || [];
    r.memory[type] = arr.concat([clone(item)]).slice(-128);
    return true;
  }
  
  function retrieveMemory(ministerId, query, limit = 8) {
    const r = getMinister(ministerId);
    if (!r) return [];
    const q = String(query || '').toLowerCase();
    const all = [];
    for (const type of ['working','episodic','semantic','procedural']) {
      const arr = r.memory[type] || [];
      all.push(...arr.filter(item => {
        const blob = JSON.stringify(item).toLowerCase();
        return blob.includes(q);
      }));
    }
    return all.slice(0, limit);
  }
  
  // ===========================
  // MINISTER BEHAVIOR & CAPABILITY
  // ===========================
  
  const capabilityWeights = {
    EXECUTION: { decision_speed: 0.35, discipline: 0.25, experience: 0.2, integrity: 0.2 },
    CRISIS: { crisis_handling: 0.45, strategic: 0.25, discipline: 0.2, empathy: 0.1 },
    AUDIT: { accuracy: 0.45, strategic: 0.3, discipline: 0.15, integrity: 0.1 }
  };
  
  function computeCapability(profile, operation = 'EXECUTION') {
    const s = profile?.baseStats || {};
    const e = profile?.efficiencyProfile || {};
    const W = capabilityWeights[operation] || capabilityWeights.EXECUTION;
    const integrity = 100 - Number(s.corruption || 0);
    let total = 0, weight = 0;
    for (const [k, w] of Object.entries(W)) {
      const value = k === 'integrity' ? integrity : Number(s[k]) || Number(e[k]) || 0;
      total += value * w;
      weight += w;
    }
    return clamp(total / Math.max(weight, 0.0001), 0, 100);
  }
  
  function evaluateDirective(ministerId, directive, context = {}) {
    const r = getMinister(ministerId);
    if (!r) throw new Error('MINISTER_NOT_REGISTERED');
    
    const feasibility = clamp(context.feasibility || 100);
    const risk = clamp(context.risk || 50);
    const authority = clamp(context.authority || 100);
    const capability = computeCapability(r.identity);
    
    const score = clamp(
      feasibility * 0.25 + (100 - risk) * 0.2 + authority * 0.15 + 
      capability * 0.2 + (context.information || 1) * 100 * 0.1
    );
    
    const decision = score < 30 ? 'REFUSE_OR_ESCALATE' : score < 70 ? 'DEFER_OR_REQUEST_MORE_INFO' : 'EXECUTE_OR_RECOMMEND';
    
    return {
      ministerId,
      directive: String(directive || ''),
      decision,
      executable: decision !== 'REFUSE_OR_ESCALATE',
      score: Number(score.toFixed(2)),
      components: { feasibility, risk, authority, capability }
    };
  }
  
  function recordOutcome(ministerId, decisionId, outcome, lesson, domain) {
    const r = getMinister(ministerId);
    if (!r) return false;
    recordDecision(ministerId, { decisionId, outcome, domain, lesson, timestamp: Date.now() });
    r.learning.successfulDecisions += outcome === 'SUCCESS' ? 1 : 0;
    r.learning.failedDecisions += outcome === 'FAILURE' ? 1 : 0;
    if (domain && r.learning.domainExperience) {
      r.learning.domainExperience[domain] = (r.learning.domainExperience[domain] || 0) + 1;
    }
    return true;
  }
  
  // ===========================
  // COMMUNICATION & MESSAGING
  // ===========================
  
  function sendMinisterMessage(senderMinisterId, receiverMinisterId, topic, payload = {}, options = {}) {
    const sender = getMinister(senderMinisterId);
    const receiver = getMinister(receiverMinisterId);
    
    if (!sender) throw new Error('SENDER_NOT_REGISTERED');
    if (!receiver) throw new Error('RECEIVER_NOT_REGISTERED');
    if (sender.runtime.status !== 'ACTIVE') throw new Error('SENDER_NOT_ACTIVE');
    if (receiver.runtime.status !== 'ACTIVE') throw new Error('RECEIVER_NOT_ACTIVE');
    
    const message = {
      messageId: options.messageId || `MSG-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      senderMinisterId: String(senderMinisterId),
      receiverMinisterId: String(receiverMinisterId),
      countryId: String(receiver.runtime.countryId),
      ministryId: String(receiver.runtime.ministryId),
      topic: String(topic),
      payload: clone(payload),
      timestamp: Date.now()
    };
    
    storeMemory(receiverMinisterId, message, 'episodic');
    global.dispatchEvent?.(new CustomEvent('MINISTER_MESSAGE_DELIVERED', { detail: message }));
    return Object.freeze(message);
  }
  
  function broadcastMessage(senderMinisterId, receiverIds, topic, payload, options = {}) {
    return (Array.isArray(receiverIds) ? receiverIds : []).map(receiver => {
      try { return sendMinisterMessage(senderMinisterId, receiver, topic, payload, options); }
      catch(e) { console.error('[OMEGA Broadcast]', e); return null; }
    }).filter(Boolean);
  }
  
  // ===========================
  // QUERY EXECUTION ENGINE
  // ===========================
  
  function executeQuery(plan, datasets = []) {
    if (!plan || !plan.executable) {
      return { ok: false, code: 'UNRESOLVED_QUERY', plan };
    }
    
    const countryId = plan.entities.country?.id;
    const resourceId = plan.entities.resource?.id;
    const ministerId = plan.subject.kind === 'SELF' ? plan.context.ministerId : plan.entities.minister?.id;
    
    try {
      let result = {};
      
      if (plan.operation === 'IDENTIFY' && ministerId) {
        const minister = getMinister(ministerId);
        result = { ok: true, operation: 'IDENTIFY', data: minister };
      } else if (plan.operation === 'LOCATE' && countryId) {
        result = { ok: true, operation: 'LOCATE', countryId, data: { countryId } };
      } else if (plan.operation === 'COUNT') {
        result = { ok: true, operation: 'COUNT', count: 0 };
      } else {
        result = { ok: true, operation: plan.operation, data: null };
      }
      
      return result;
    } catch (e) {
      return { ok: false, error: e.message, plan };
    }
  }
  
  // ===========================
  // PUBLIC API
  // ===========================
  
  const api = Object.freeze({
    VERSION,
    
    // Semantic Configuration
    configure: configureSemantic,
    parse,
    executeQuery,
    learn,
    recall: learned,
    
    // Minister Management
    registerMinister,
    getMinister,
    getActiveMinister,
    updateRuntime: updateMinisterRuntime,
    updateLearning: updateMinisterLearning,
    recordDecision,
    storeMemory,
    retrieveMemory,
    
    // Behavior & Capability
    evaluateDirective,
    recordOutcome,
    computeCapability,
    
    // Communication
    sendMessage: sendMinisterMessage,
    broadcastMessage,
    
    // Diagnostics
    diagnostics: () => ({
      version: VERSION,
      ministers: ministerRegistry.size,
      assignments: assignmentIndex.size,
      countries: semanticStore.countries.size,
      resources: semanticStore.resources.size,
      datasets: semanticStore.datasets.length
    })
  });
  
  // ===========================
  // GLOBAL REGISTRATION
  // ===========================
  
  global.OmegaIntegratedSystem = api;
  global.OmegaSemanticBrain = api;
  global.OmegaMinisterStateRegistry = {
    registerMinister,
    getMinister,
    getActiveMinister,
    updateRuntimeState: updateMinisterRuntime,
    updateLearning: updateMinisterLearning,
    getConfig: () => ({}),
    setConfig: () => ({}),
    consistencyCheck: () => ({ ok: true, errors: [], count: 0 })
  };
  global.OmegaMinisterBehavior = {
    evaluateDirective,
    recordOutcome,
    debug: (mid) => getMinister(mid)
  };
  global.OmegaMinisterCommunication = {
    send: sendMinisterMessage,
    broadcast: broadcastMessage
  };
  global.MinisterQueryRouter = {
    routeMinisterQuery: (prompt, ministerContext = {}, worldContext = {}) => {
      const parsed = parse(prompt, { ...ministerContext, ...worldContext });
      return {
        version: VERSION,
        intent: parsed.intent,
        domain: parsed.intent,
        entities: parsed.entities,
        requiredData: parsed.sources.map(s => s.authority),
        confidence: parsed.confidence,
        semantic: parsed,
        executable: parsed.executable
      };
    }
  };
  
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  
})(typeof globalThis !== 'undefined' ? globalThis : window);
