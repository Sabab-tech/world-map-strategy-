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
  res.json({ ok: true, aiAvailable: hasKey, models: CANDIDATE_MODELS, primaryModel: CANDIDATE_MODELS[0], integrityLayer: '2.1.0', ministerStateSystem: '1.0.0', semanticRuntime: { authority: ProductionSemanticRuntime?.VERSION || null, diagnostics: ProductionSemanticRuntime?.diagnostics?.() || canonicalSemanticRuntime }, cognitiveBridge: { authority: OmegaReasoningDispatcher?.VERSION || null, full40: OmegaReasoningDispatcher?.full40 === true }, timestamp: new Date().toISOString() });
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
  if (MinisterQueryRouter?.routeMinisterQuery) {
    const routed = MinisterQueryRouter.routeMinisterQuery(prompt, ctx, ctx);
    if (routed?.semantic) return { semantic: routed.semantic, result: routed.result || null, router: routed };
  }
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
