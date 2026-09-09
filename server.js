import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import './omega_production_semantic_runtime_v3.js';
import './offline_semantic_brain.js';
import './offline_query_engine.js';
import './minister_query_router.js';
import './omega_cognitive_engine.js';
import './omega_reasoning_dispatcher.js';

const ProductionSemanticRuntime = globalThis.OmegaProductionSemanticRuntime;
const OfflineSemanticBrain = globalThis.OfflineSemanticBrain;
const OfflineQueryEngine = globalThis.OfflineQueryEngine;
const MinisterQueryRouter = globalThis.MinisterQueryRouter;
const OmegaCognitiveEngine = globalThis.OmegaCognitiveEngine || globalThis.OmegaSharedCognition || null;
const OmegaReasoningDispatcher = globalThis.OmegaReasoningDispatcher || null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.join(__dirname, 'index.html');
const AI_INTEGRITY_SCRIPT = '<script src="/omega_ai_integrity_layer.js"></script>';
const HEALTH_LOGO_SCRIPT = '<script src="/health-ministry-logo.js"></script>';
const MINISTER_CAPABILITY_SCRIPT = '<script src="/minister_capability_engine.js"></script>';
const MINISTER_STATE_SCRIPT = '<script src="/omega_minister_state_system.js"></script>';
const MINISTER_RECRUITMENT_SCRIPT = '<script src="/minister_recruitment_engine.js"></script>';
const MINISTER_BOOTSTRAP_SCRIPT = '<script src="/omega_minister_bootstrap.js"></script>';
const MINISTER_RUNTIME_SCRIPT = '<script src="/omega_minister_runtime_v2.js"></script>';
const UI_INTERACTION_GUARD_SCRIPT = '<script src="/omega_ui_interaction_guard.js"></script>';
const COGNITIVE_SCRIPT = '<script src="/omega_cognitive_engine.js"></script>';
const REASONING_SCRIPT = '<script src="/omega_reasoning_dispatcher.js"></script>';
const COUNTRY_BRIDGE_SCRIPT = '<script src="/omega_country_semantic_bridge.js"></script>';
const RESOURCE_BRIDGE_SCRIPT = '<script src="/omega_resource_semantic_bridge.js"></script>';
const UNIVERSAL_AI_SCRIPT = '<script src="/omega_universal_ai_runtime.js"></script>';
const LANGUAGE_SYSTEM_SCRIPT = '<script src="/omega_language_system.js"></script>';
const LANGUAGE_BATCH03_SCRIPT = '<script src="/omega_language_batch03_semantic_extension.js"></script>';

let cachedResourceProfiles = {}, resourceTypesRegistry = {};
const semanticDatasets = [];
try {
  for (const filename of ['resources.json', 'resources_2.json']) {
    const file = path.join(__dirname, filename);
    if (!fs.existsSync(file)) continue;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    semanticDatasets.push(raw);
    if (raw.resource_types) resourceTypesRegistry = { ...resourceTypesRegistry, ...raw.resource_types };
    if (raw.GSRSK_Master_CountryProfiles_v14?.countryProfiles) cachedResourceProfiles = { ...cachedResourceProfiles, ...raw.GSRSK_Master_CountryProfiles_v14.countryProfiles };
  }
  console.log(`[Server Resources DB] Indexed ${Object.keys(cachedResourceProfiles).length} sovereign profiles and ${Object.keys(resourceTypesRegistry).length} resource types.`);
} catch (e) { console.warn('[Server Resources DB] Load warning:', e.message); }

let languageVocabulary = {};
try {
  const file = path.join(__dirname, 'offline_language_vocabulary.json');
  if (fs.existsSync(file)) languageVocabulary = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) { console.warn('[Semantic Vocabulary] Load warning:', e.message); }

let canonicalSemanticRuntime = null;
try {
  if (ProductionSemanticRuntime?.init) canonicalSemanticRuntime = await ProductionSemanticRuntime.init();
} catch (e) { console.warn('[Production Semantic Runtime] Initialization warning:', e.message); }
if (!canonicalSemanticRuntime && OfflineSemanticBrain?.configure) canonicalSemanticRuntime = OfflineSemanticBrain.configure({ datasets: semanticDatasets, vocabulary: languageVocabulary });
console.log('[Semantic Runtime] Canonical authority:', ProductionSemanticRuntime?.VERSION || 'OFFLINE_COMPATIBILITY');
console.log('[Cognitive Bridge] 40-stage dispatcher:', OmegaReasoningDispatcher?.VERSION || 'UNAVAILABLE');

let cachedEconomies = {}, cachedPopulations = {}, cachedMinisters = {};
try {
  const eco = path.join(__dirname, 'economy.json'), pop = path.join(__dirname, 'population.json'), min = path.join(__dirname, 'ministers.json');
  if (fs.existsSync(eco)) cachedEconomies = JSON.parse(fs.readFileSync(eco, 'utf8'));
  if (fs.existsSync(pop)) cachedPopulations = JSON.parse(fs.readFileSync(pop, 'utf8'));
  if (fs.existsSync(min)) cachedMinisters = JSON.parse(fs.readFileSync(min, 'utf8'));
} catch (e) { console.warn('[Server DB] Auxiliary dataset warning:', e.message); }

function normalizeKey(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
function tokens(value) { return new Set(normalizeKey(value).split('_').filter(Boolean)); }
function resolveCountryResourceData(countryCode, countryName) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (code && cachedResourceProfiles[code]) return cachedResourceProfiles[code];
  const name = String(countryName || '').trim().toLowerCase();
  if (name) {
    const match = Object.values(cachedResourceProfiles).find(p => String(p.identity?.name || '').trim().toLowerCase() === name || String(p.identity?.officialName || '').trim().toLowerCase() === name);
    if (match) return match;
  }
  return null;
}
function candidateName(candidate, countryCode) {
  const p = resolveCountryResourceData(countryCode), identity = p?.identity || {}, region = String(identity.region || identity.region_group || identity.worldRegion || identity.subregion || '').trim().toLowerCase().replace(/[^a-z0-9_ -]/g, '_'), names = candidate.regional_names || {};
  if (region) for (const k of Object.keys(names)) if (normalizeKey(k) === normalizeKey(region) || normalizeKey(region).includes(normalizeKey(k)) || normalizeKey(k).includes(normalizeKey(region))) return names[k];
  const first = Object.keys(names).sort()[0]; return names[first] || candidate.name || candidate.id;
}
function flattenMinisterDatabase() {
  const db = cachedMinisters?.ministers_database || {}, out = [];
  for (const [category, list] of Object.entries(db)) if (Array.isArray(list)) for (const minister of list) out.push({ ...minister, __category: category });
  return out;
}
function scoreCategory(category, ministryId) { const a = tokens(category), b = tokens(ministryId); let score = 0; for (const x of a) if (b.has(x)) score += 3; return score; }
function scoreMinister(minister, ministryId) { const target = tokens(ministryId), blob = [minister.__category, minister.background, minister.id].map(normalizeKey).join(' '); let score = scoreCategory(minister.__category, ministryId); for (const t of target) if (blob.includes(t)) score += 1; return score; }
function ministerCandidates(ministryId, countryCode) {
  const all = flattenMinisterDatabase(); if (!all.length) return [];
  const target = normalizeKey(ministryId), exact = all.filter(m => normalizeKey(m.__category) === target);
  const pool = exact.length >= 5 ? exact : [...all].sort((a, b) => scoreMinister(b, ministryId) - scoreMinister(a, ministryId) || String(a.id).localeCompare(String(b.id)));
  const unique = new Map(); for (const m of pool) { if (!unique.has(m.id)) unique.set(m.id, m); if (unique.size >= 5) break; }
  return [...unique.values()].slice(0, 5).map(m => ({ ...m, displayName: candidateName(m, countryCode), ministryCategory: m.__category }));
}

const app = express();
const PORT = 3000;
app.use(express.json({ limit: '10mb' }));

function renderIndex(res, next) {
  fs.readFile(INDEX_PATH, 'utf8', (err, html) => {
    if (err) return next(err);
    let output = html;
    const scripts = [
      LANGUAGE_SYSTEM_SCRIPT, LANGUAGE_BATCH03_SCRIPT,
      COUNTRY_BRIDGE_SCRIPT, RESOURCE_BRIDGE_SCRIPT,
      MINISTER_CAPABILITY_SCRIPT, MINISTER_STATE_SCRIPT, MINISTER_RECRUITMENT_SCRIPT, MINISTER_BOOTSTRAP_SCRIPT, MINISTER_RUNTIME_SCRIPT,
      COGNITIVE_SCRIPT, REASONING_SCRIPT, UNIVERSAL_AI_SCRIPT,
      AI_INTEGRITY_SCRIPT, HEALTH_LOGO_SCRIPT, UI_INTERACTION_GUARD_SCRIPT
    ];
    for (const script of scripts) {
      const src = script.match(/src="([^"]+)"/)?.[1];
      if (src && !output.includes(src)) output = output.replace('</body>', `    ${script}\n</body>`);
    }
    res.type('html').send(output);
  });
}
app.get('/', (req, res, next) => renderIndex(res, next));
app.get('/index.html', (req, res, next) => renderIndex(res, next));
app.use(express.static(__dirname, { index: false }));
app.get('/minister_system_config.json', (req, res) => res.sendFile(path.join(__dirname, 'minister_system_config.json')));

app.get('/api/minister-candidates', (req, res) => {
  try {
    const ministryId = String(req.query.ministryId || '').trim(), countryCode = String(req.query.countryCode || '').trim().toUpperCase();
    if (!ministryId) return res.status(400).json({ ok: false, error: 'ministryId is required' });
    const candidates = ministerCandidates(ministryId, countryCode);
    if (candidates.length !== 5) return res.status(404).json({ ok: false, error: `Five verified candidates are required but only ${candidates.length} were available in ministers.json.`, candidateCount: candidates.length, required: 5 });
    res.json({ ok: true, ministryId, countryCode, candidates, source: 'ministers.json', count: candidates.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/ai/status', (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.json({ ok: true, aiAvailable: hasKey, models: CANDIDATE_MODELS, primaryModel: CANDIDATE_MODELS[0], integrityLayer: '2.0.0', ministerStateSystem: '1.0.0', semanticRuntime: { authority: ProductionSemanticRuntime?.VERSION || null, diagnostics: ProductionSemanticRuntime?.diagnostics?.() || canonicalSemanticRuntime }, cognitiveBridge: { authority: OmegaReasoningDispatcher?.VERSION || null, full40: OmegaReasoningDispatcher?.full40 === true }, timestamp: new Date().toISOString() });
});

app.post('/api/minister-state/diagnostics', (req, res) => {
  try {
    const registry = globalThis.OmegaMinisterStateRegistry;
    if (!registry) return res.status(503).json({ ok: false, error: 'Minister state registry unavailable' });
    const result = registry.consistencyCheck();
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

function canonicalPlan(prompt, input = {}) {
  const ctx = { ...input, countryId: input.countryId || input.countryCode, countryCode: input.countryCode || input.countryId };
  if (ProductionSemanticRuntime?.buildAnswerPlan) return ProductionSemanticRuntime.buildAnswerPlan(prompt, { countryCode: ctx.countryCode, ministryId: ctx.ministryId, ministerId: ctx.ministerId, ministerName: ctx.ministerName }, ctx.gameState || ctx.worldState || {}, ctx.history || []);
  if (!OfflineSemanticBrain?.parse || !OfflineQueryEngine?.execute) throw new Error('No semantic execution authority is available');
  const semantic = OfflineSemanticBrain.parse(prompt, ctx);
  const result = OfflineQueryEngine.execute(semantic, semanticDatasets, input.language === 'bn' || semantic.language === 'bn' ? 'bn' : 'en', ctx);
  return { semantic, result };
}

function runCognitiveBridge(prompt, semantic, offlineResult, identity, language, gameState, conversationHistory) {
  if (!OmegaReasoningDispatcher?.dispatch) return { available: false, reason: 'COGNITIVE_DISPATCHER_UNAVAILABLE' };
  try {
    const parsed = semantic || { operation: 'LOOKUP', language: language || 'en', surface: prompt };
    const history = Array.isArray(conversationHistory) ? conversationHistory : [];
    return OmegaReasoningDispatcher.dispatch(prompt, parsed, offlineResult || {}, { ...identity, language, gameState: gameState || {}, history, timeHorizon: 'CURRENT' });
  } catch (e) {
    return { available: false, reason: 'COGNITIVE_DISPATCH_ERROR', error: e.message };
  }
}

app.post('/api/ai/semantic-query', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.prompt || typeof body.prompt !== 'string') return res.status(400).json({ ok: false, error: 'Prompt is required' });
    const plan = canonicalPlan(body.prompt, body);
    const cognitive = runCognitiveBridge(body.prompt, plan.semantic || null, plan.result || null, body, body.language || (plan.semantic?.language === 'bn' ? 'bn' : 'en'), body.gameState || {}, body.history || []);
    return res.json({ ok: true, authority: ProductionSemanticRuntime?.VERSION || 'OFFLINE_COMPATIBILITY', semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(body.prompt, body) : OfflineSemanticBrain.explain(plan.semantic), result: plan.result, plan, cognitiveTrace: cognitive.cognitiveTrace || cognitive });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message || 'Semantic query failed' }); }
});

let aiClient = null;
function getAI() { if (!aiClient && process.env.GEMINI_API_KEY) aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } }); return aiClient; }
const CANDIDATE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-3.1-pro-preview', 'gemini-flash-latest'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function generateWithFallback(ai, options) {
  let lastError = null;
  for (const model of CANDIDATE_MODELS) for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await ai.models.generateContent({ model, contents: options.contents, config: options.config });
      if (response?.text) return { ok: true, model, text: response.text };
    } catch (err) {
      lastError = err;
      const transient = /503|429|high demand|UNAVAILABLE/i.test(err.message || '');
      if (transient && attempt === 1) { await sleep(350 + Math.random() * 200); continue; }
      break;
    }
  }
  throw lastError || new Error('All Gemini model candidates temporarily unavailable');
}
function findMinisterProfile(ministerId, ministerName) {
  const db = cachedMinisters?.ministers_database; if (!db) return null;
  for (const category of Object.values(db)) if (Array.isArray(category)) {
    const found = category.find(m => m.id === ministerId || (m.regional_names && ministerName && Object.values(m.regional_names).includes(ministerName)));
    if (found) return found;
  }
  return null;
}
function evidenceConfidence({ routing, identityResolved, dossierFields, profileResolved }) {
  const routingScore = Math.max(0, Math.min(1, Number(routing?.confidence ?? 0))), dataScore = Math.max(0, Math.min(1, dossierFields)), identityScore = identityResolved ? 1 : .25, profileScore = profileResolved ? 1 : .35;
  return Number((100 * (.25 * routingScore + .35 * dataScore + .25 * identityScore + .15 * profileScore)).toFixed(1));
}

function vocabularyIntentMatches(prompt, wantedIntent) {
  const raw = String(prompt || '').trim().toLowerCase();
  const sources = [languageVocabulary?.conversation?.intentRules?.[wantedIntent], global.OmegaLanguageBatch03?.discourseLexicon?.intents?.[wantedIntent]];
  for (const rule of sources) {
    if (!rule) continue;
    for (const lang of ['en', 'bn']) {
      for (const phrase of Array.isArray(rule?.phrases?.[lang]) ? rule.phrases[lang] : []) {
        const p = String(phrase || '').trim().toLowerCase();
        if (p && raw === p) return true;
      }
    }
  }
  return false;
}

function providerRead(provider, context) {
  const methods = ['getWellbeing', 'getAffectState', 'getEmotionalState', 'getState', 'snapshot', 'diagnostics'];
  for (const method of methods) {
    if (typeof provider?.[method] !== 'function') continue;
    try {
      const value = provider[method](context);
      if (value && typeof value === 'object') return { value, method };
    } catch (_) {}
  }
  const direct = provider?.wellbeing || provider?.affect || provider?.emotion || provider?.state;
  return direct && typeof direct === 'object' ? { value: direct, method: 'DIRECT_STATE' } : null;
}

function ministerWellbeingEvidence(identity, profile) {
  const providers = [];
  const registry = globalThis.OmegaSelfStateProviders;
  if (registry) {
    const entries = Array.isArray(registry) ? registry : Object.values(registry);
    for (const provider of entries) if (provider && typeof provider === 'object') providers.push(provider);
  }
  for (const key of ['OmegaEmotionEngine', 'OmegaAffectEngine', 'OmegaWellbeingEngine', 'OmegaStressSystem', 'OmegaHappinessSystem', 'OmegaPsychologySystem']) {
    const provider = globalThis[key];
    if (provider && typeof provider === 'object' && !providers.includes(provider)) providers.push(provider);
  }
  for (const provider of providers) {
    const reading = providerRead(provider, { ministerId: identity.ministerId, ministerName: identity.ministerName, ministryId: identity.ministryId, countryCode: identity.countryCode, profile });
    if (reading) return { ok: true, source: reading.method, evidence: reading.value };
  }
  return { ok: false, reason: 'AFFECT_PROVIDER_UNAVAILABLE' };
}

function findResourceQuantity(root, resourceId, countryCode) {
  if (!root || typeof root !== 'object') return null;
  const resourceNeedles = [String(resourceId || '').toLowerCase(), String(resourceId || '').replace(/_/g, ' ').toLowerCase()];
  const countryNeedle = String(countryCode || '').toLowerCase();
  const quantityKeys = new Set(['quantity', 'amount', 'stock', 'stockpile', 'inventory', 'reserve', 'reserves', 'provenreserve', 'proven_reserve', 'totalreserve', 'total_reserve', 'remainingreserve', 'remaining_reserve', 'production', 'productionrate', 'production_rate', 'capacity']);
  const seen = new Set();
  const walk = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) { const r = walk(item); if (r) return r; }
      return null;
    }
    const blob = JSON.stringify(value).toLowerCase();
    const resourceMatch = resourceNeedles.some(n => n && blob.includes(n));
    const countryMatch = !countryNeedle || blob.includes(countryNeedle);
    if (resourceMatch && countryMatch) {
      for (const [key, candidate] of Object.entries(value)) {
        const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (quantityKeys.has(normalizedKey) && (typeof candidate === 'number' || (typeof candidate === 'string' && candidate.trim() !== '' && Number.isFinite(Number(candidate))))) {
          return { value: Number(candidate), field: key, record: value };
        }
      }
    }
    for (const child of Object.values(value)) { const r = walk(child); if (r) return r; }
    return null;
  };
  return walk(root);
}

function resourceQuantityEvidence(identity, semantic, semanticPlan, gameState, reservesData) {
  const countryId = identity.countryCode || identity.countryName;
  const resourceId = semantic?.entities?.resource?.id;
  if (!resourceId || !countryId || semantic?.assetClass) return null;
  const roots = [gameState, reservesData, resolveCountryResourceData(identity.countryCode, identity.countryName), ...semanticDatasets].filter(Boolean);
  for (const root of roots) {
    const found = findResourceQuantity(root, resourceId, countryId);
    if (found) return { ...found, source: 'RUNTIME_DATASET_SEARCH', resourceId, countryId };
  }
  return null;
}

function directMinisterAnswer(prompt, semantic, semanticPlan, identity, profile, gameState, reservesData) {
  const activeMinisterResolved = !!identity.ministerId || !!identity.ministerName;
  if (!activeMinisterResolved || semantic?.targetDomain !== 'MINISTER') return null;

  if (semantic.operation === 'ATTRIBUTE' && semantic.attribute?.name) {
    const runtime = ProductionSemanticRuntime?.execute?.(semantic, { ...identity, gameState, reservesData });
    if (runtime?.ok && runtime.value !== undefined && runtime.value !== null) {
      return { ok: true, kind: 'DETERMINISTIC_MINISTER_ATTRIBUTE', text: String(runtime.value), value: runtime.value, source: runtime.source || 'MINISTER_RUNTIME' };
    }
    const value = ProductionSemanticRuntime?.explain ? null : null;
    if (value !== null) return { ok: true, kind: 'DETERMINISTIC_MINISTER_ATTRIBUTE', text: String(value), value };
    return null;
  }

  if (vocabularyIntentMatches(prompt, 'WELLBEING')) {
    const wellbeing = ministerWellbeingEvidence(identity, profile);
    if (wellbeing.ok) return { ok: true, kind: 'DETERMINISTIC_MINISTER_WELLBEING', evidence: wellbeing.evidence, source: wellbeing.source };
    return { ok: true, kind: 'MINISTER_WELLBEING_UNKNOWN', text: null, unknown: true, reason: wellbeing.reason };
  }

  return null;
}

app.post('/api/ai/minister-consult', async (req, res) => {
  try {
    const { ministerId, ministerName, ministerRole, ministryId, countryName, countryCode, prompt, language, gameState, reservesData, timeHorizon, conversationHistory } = req.body;
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ ok: false, error: 'Prompt is required' });
    const identity = { ministerId: String(ministerId || '').trim(), ministerName: String(ministerName || '').trim(), ministerRole: String(ministerRole || '').trim(), ministryId: String(ministryId || '').trim(), countryName: String(countryName || '').trim(), countryCode: String(countryCode || '').trim().toUpperCase() };
    const parsedHistory = conversationHistory ? String(conversationHistory).split('\n').slice(-24).map(x => ({ role: x.startsWith('assistant:') ? 'assistant' : 'user', content: x.replace(/^(assistant|user):\s*/, '') })) : [];

    const semanticPlan = canonicalPlan(prompt, { ...identity, language, gameState, reservesData, timeHorizon, history: parsedHistory });
    const semantic = semanticPlan.semantic || semanticPlan.plan?.semantic || (ProductionSemanticRuntime?.parse ? ProductionSemanticRuntime.parse(prompt, identity) : null);
    const offlineResult = semanticPlan.result || ProductionSemanticRuntime?.execute?.(semantic, { ...identity, gameState, reservesData }) || null;
    const profile = findMinisterProfile(identity.ministerId, identity.ministerName);

    const direct = directMinisterAnswer(prompt, semantic, semanticPlan, identity, profile, gameState, reservesData);
    if (direct) {
      if (direct.kind === 'DETERMINISTIC_MINISTER_ATTRIBUTE') {
        return res.json({ ok: true, aiPowered: false, mode: 'DIRECT_GROUNDED_ATTRIBUTE', text: direct.text, answerContract: { exactQuestion: prompt, target: identity.ministerId || identity.ministerName, responseCardinality: 1, topicLock: true, source: direct.source }, semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(prompt, identity) : semantic, result: offlineResult, identity, grounding: { policy: 'NO_UNGROUNDED_DEFAULTS', answerMode: 'DETERMINISTIC_RUNTIME_VALUE' } });
      }
      if (direct.kind === 'MINISTER_WELLBEING_UNKNOWN') {
        return res.json({ ok: true, aiPowered: false, mode: 'DIRECT_GROUNDED_UNKNOWN', text: null, answerContract: { exactQuestion: prompt, target: identity.ministerId || identity.ministerName, responseCardinality: 1, topicLock: true, status: 'UNKNOWN', reason: direct.reason }, semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(prompt, identity) : semantic, result: offlineResult, identity, grounding: { policy: 'UNKNOWN_WHEN_PROVIDER_UNAVAILABLE', answerMode: 'NO_AFFECT_PROVIDER' } });
      }
      if (direct.kind === 'DETERMINISTIC_MINISTER_WELLBEING') {
        return res.json({ ok: true, aiPowered: false, mode: 'DIRECT_GROUNDED_PROVIDER_STATE', text: null, evidence: direct.evidence, answerContract: { exactQuestion: prompt, target: identity.ministerId || identity.ministerName, responseCardinality: 1, topicLock: true, source: direct.source }, semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(prompt, identity) : semantic, result: offlineResult, identity, grounding: { policy: 'PROVIDER_GROUNDED' } });
      }
    }

    const resourceQuestion = semantic?.targetDomain === 'COUNTRY_RESOURCE' && semantic?.entities?.resource?.id && !semantic?.assetClass && ['COUNT', 'QUANTITY'].includes(String(semantic?.operation || '').toUpperCase());
    if (resourceQuestion) {
      const quantity = resourceQuantityEvidence(identity, semantic, semanticPlan, gameState, reservesData);
      if (quantity) {
        return res.json({ ok: true, aiPowered: false, mode: 'DIRECT_GROUNDED_RESOURCE_QUANTITY', text: `${quantity.value}`, value: quantity.value, unit: resourceTypesRegistry?.[semantic.entities.resource.id]?.unit || null, answerContract: { exactQuestion: prompt, responseCardinality: 1, topicLock: true, target: semantic.entities.resource.id, country: identity.countryCode, source: quantity.source, field: quantity.field }, semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(prompt, identity) : semantic, result: offlineResult, identity, grounding: { policy: 'NO_UNGROUNDED_DEFAULTS', answerMode: 'RUNTIME_RESOURCE_QUANTITY' } });
      }
      return res.json({ ok: true, aiPowered: false, mode: 'DIRECT_GROUNDED_UNKNOWN', text: null, answerContract: { exactQuestion: prompt, responseCardinality: 1, topicLock: true, status: 'UNKNOWN', reason: 'RESOURCE_QUANTITY_NOT_PRESENT_IN_LOADED_RUNTIME_DATA' }, semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(prompt, identity) : semantic, result: offlineResult, identity, grounding: { policy: 'NO_GROUNDED_QUANTITY_NO_ANSWER', answerMode: 'RESOURCE_QUANTITY_MISSING' } });
    }

    const cognitive = runCognitiveBridge(prompt, semantic, offlineResult, identity, language || semantic?.language || 'en', gameState || reservesData || {}, parsedHistory);
    const ai = getAI();
    if (!ai) {
      const text = ProductionSemanticRuntime?.formatOfflineAnswer && semantic ? ProductionSemanticRuntime.formatOfflineAnswer(semanticPlan) : offlineResult?.text || null;
      return res.json({ ok: true, aiPowered: false, mode: 'OFFLINE_GROUNDED', text, semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(prompt, identity) : OfflineSemanticBrain.explain(semantic), result: offlineResult, identity, cognitiveTrace: cognitive.cognitiveTrace || cognitive, grounding: { runtimeDatasets: ProductionSemanticRuntime?.diagnostics?.() || canonicalSemanticRuntime, policy: 'NO_UNGROUNDED_DEFAULTS' } });
    }

    const routing = ProductionSemanticRuntime?.parse ? ProductionSemanticRuntime.parse(prompt, identity) : MinisterQueryRouter.routeMinisterQuery(prompt, { ministryId: identity.ministryId, ministerId: identity.ministerId, ministerName: identity.ministerName, ministerRole: identity.ministerRole }, { countryName: identity.countryName, countryCode: identity.countryCode });
    const resourceProfile = resolveCountryResourceData(identity.countryCode, identity.countryName) || {};
    const eco = cachedEconomies[identity.countryCode] || {}, pop = cachedPopulations[identity.countryCode] || {}, telemetry = reservesData || gameState || {};
    const dossier = {
      authority: ProductionSemanticRuntime?.VERSION || 'OFFLINE_COMPATIBILITY',
      minister: { id: identity.ministerId || 'UNKNOWN', name: identity.ministerName || 'UNKNOWN', role: identity.ministerRole || 'UNKNOWN', ministryId: identity.ministryId || 'UNKNOWN', profileFound: !!profile, profile: profile || {} },
      country: { name: identity.countryName || 'UNKNOWN', iso: identity.countryCode || 'UNKNOWN' },
      semanticQuery: semantic,
      queryPlan: semanticPlan.plan || semanticPlan,
      answerState: offlineResult?.answerState || null,
      contextPacket: offlineResult?.contextPacket || null,
      routing: { operation: semantic?.operation || routing?.operation || routing?.targetDomain || null, domain: semantic?.targetDomain || routing?.domain || null, entities: semantic?.entities ? Object.values(semantic.entities).filter(x => x?.id) : [], requiredData: semantic?.operation ? [semantic.operation] : [] },
      resources: { hydrocarbons: resourceProfile.hydrocarbon_resource_base || {}, minerals: resourceProfile.mineral_resource_base || {}, strategic: resourceProfile.strategic_resources || {}, dependency: resourceProfile.resource_dependency || {}, processing: resourceProfile.processing_and_industrial_capacities || {}, mineSites: resourceProfile.resource_infrastructure_context?.mineSites || [] },
      economy: eco, population: pop, liveTelemetry: telemetry,
      cognitive40: cognitive.cognitiveTrace || cognitive
    };
    const dossierText = JSON.stringify(dossier, null, 2), dossierFields = Object.values(dossier).filter(v => v && typeof v === 'object' && Object.keys(v).length).length / 10;
    const confidence = evidenceConfidence({ routing: semantic || routing, identityResolved: !!identity.ministerId && !!identity.ministerName && !!identity.countryCode, dossierFields, profileResolved: !!profile });
    const systemInstruction = `You are the minister identified in the canonical identity record. The active minister identity is the only speaker reference for this consultation. Never replace the active minister with a global runtime, AI system, or another minister. First obey the exact-question answer contract. Answer ONLY the question asked. For a simple identity, age, status, quantity, location, date, or other single-value request, return only the requested value or a single concise sentence. Do not append a dossier, audit, recommendation, strategic report, or unrelated resource analysis unless explicitly requested. Runtime datasets and the cognitive packet are evidence boundaries. Never invent a country, resource, quantity, mine, reserve, identity, event, causal link, calculation, or missing telemetry. Distinguish VERIFIED FACT, DETERMINISTIC CALCULATION, INFERENCE, RECOMMENDATION and UNKNOWN. The cognitive packet is analytical metadata, not the answer itself. If the required fact is absent, return UNKNOWN rather than substituting another topic. Preserve the user's language; respond in ${language === 'bn' ? 'standard Bengali' : 'English'}.`;
    const cognitiveText = JSON.stringify(cognitive.cognitiveTrace || cognitive, null, 2);
    const answerContract = { exactQuestion: prompt, activeSpeaker: { ministerId: identity.ministerId || null, ministerName: identity.ministerName || null, ministryId: identity.ministryId || null }, responseCardinality: 1, topicLock: true, noTopicSubstitution: true, noDossierExpansion: true, missingDataPolicy: 'UNKNOWN', evidenceBoundary: 'RUNTIME_DATA_AND_GROUNDED_COGNITIVE_PACKET' };
    const userContent = `ANSWER CONTRACT:\n${JSON.stringify(answerContract, null, 2)}\n\nCANONICAL IDENTITY:\n${JSON.stringify(identity, null, 2)}\n\nCANONICAL SEMANTIC PLAN:\n${JSON.stringify(semanticPlan, null, 2)}\n\nGROUNDED EXECUTIVE DOSSIER:\n${dossierText}\n\n40-STAGE GROUNDED COGNITIVE PACKET:\n${cognitiveText}\n\nEXECUTIVE COMMANDER QUESTION:\n${prompt}`;
    const result = await generateWithFallback(ai, { contents: userContent, config: { systemInstruction, temperature: .15, topP: .85 } });
    return res.json({ ok: true, aiPowered: true, model: result.model, text: result.text || '', confidence, authority: ProductionSemanticRuntime?.VERSION || 'OFFLINE_COMPATIBILITY', semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(prompt, identity) : semantic, result: offlineResult, intent: semantic?.targetDomain || routing?.intent, domain: semantic?.targetDomain || routing?.domain, identity, answerContract, cognitiveTrace: cognitive.cognitiveTrace || cognitive, grounding: { runtimeDatasets: ProductionSemanticRuntime?.diagnostics?.() || canonicalSemanticRuntime, cognitiveBridge: cognitive.cognitiveTrace || cognitive, policy: 'NO_UNGROUNDED_DEFAULTS' } });
  } catch (e) { console.error('[AI Minister Consult]', e); return res.status(500).json({ ok: false, error: e.message || 'AI consultation failed' }); }
});