import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import './omega_universal_entity_identity_engine.js';
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
const CANDIDATE_MODELS = ['gemini-2.5-flash','gemini-2.0-flash'];
const AI_INTEGRITY_SCRIPT = '<script src="/omega_ai_integrity_layer.js"></script>';
const HEALTH_LOGO_SCRIPT = '<script src="/health-ministry-logo.js"></script>';
const MINISTRY_REGISTRY_SCRIPT = '<script src="/omega_ministry_registry.js"></script>';
const MINISTRY_STATE_PROVIDER_SCRIPT = '<script src="/omega_ministry_state_provider.js"></script>';
const MINISTRY_INFORMATION_POLICY_SCRIPT = '<script src="/omega_ministry_information_policy.js"></script>';
const MINISTRY_DECISION_FRAMEWORK_SCRIPT = '<script src="/omega_ministry_decision_framework.js"></script>';
const MINISTRY_STATE_TRANSACTION_SCRIPT = '<script src="/omega_ministry_state_transaction.js"></script>';
const MINISTRY_INTEROPERABILITY_SCRIPT = '<script src="/omega_ministry_interoperability_system.js"></script>';
const MINISTRY_DOMAIN_ENGINES_SCRIPT = '<script src="/omega_ministry_domain_engines.js"></script>';
const MINISTRY_RUNTIME_V1_SCRIPT = '<script src="/omega_ministry_runtime_v1.js"></script>';
const SIMULATION_RUNTIME_SCRIPT = '<script src="/omega_simulation_runtime.js"></script>';
const OPPONENT_COUNTRY_RULES_SCRIPT = '<script src="/opponent_country_rules.js"></script>';
const OPPONENT_DEEP_MEMORY_SCRIPT = '<script src="/omega_opponent_deep_memory_system.js"></script>';
const OPPONENT_MEMORY_TRACE_SCRIPT = '<script src="/omega_opponent_memory_trace_log_system.js"></script>';
const RESOURCE_ENDOWMENT_SCRIPT = '<script src="/omega_resource_endowment_runtime.js"></script>';
const RESOURCE_TRANSPORT_SCRIPT = '<script src="/omega_resource_transport_runtime.js"></script>';
const RESOURCE_ECONOMY_SCRIPT = '<script src="/omega_resource_economy_runtime_v2.js"></script>';
const GLOBAL_MARKET_SCRIPT = '<script src="/omega_global_market_system.js"></script>';
const OPPONENT_INTELLIGENCE_SCRIPT = '<script src="/omega_opponent_intelligence_evolution_system.js"></script>';
const OPPONENT_STRATEGY_SCRIPT = '<script src="/omega_opponent_adaptive_strategy_system.js"></script>';
const OPPONENT_AUTONOMY_SCRIPT = '<script src="/omega_opponent_autonomy_system.js"></script>';
const OPPONENT_TRADE_SCRIPT = '<script src="/omega_global_trade_system.js"></script>';
const OPPONENT_TREATY_SCRIPT = '<script src="/omega_opponent_treaty_lifecycle_system.js"></script>';
const OPPONENT_CONSEQUENCE_SCRIPT = '<script src="/omega_opponent_second_order_consequence_system.js"></script>';
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
const RESOURCE_MINISTRY_ENGINE_SCRIPT = '<script src="/resource_ministry_engine.js"></script>';
const UNIVERSAL_AI_SCRIPT = '<script src="/omega_universal_ai_runtime.js"></script>';
const LANGUAGE_SYSTEM_SCRIPT = '<script src="/omega_language_system.js"></script>';
const LANGUAGE_BATCH03_SCRIPT = '<script src="/omega_language_batch03_semantic_extension.js"></script>';
const UNIVERSAL_ENTITY_SCRIPT = '<script src="/omega_universal_entity_identity_engine.js"></script>';

let cachedResourceProfiles = {}, resourceTypesRegistry = {};
try {
  for (const fileName of fs.readdirSync(__dirname)) {
    if (!/\.json$/i.test(fileName)) continue;
    const file = path.join(__dirname, fileName);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
    if (raw?.resource_types && typeof raw.resource_types === 'object') resourceTypesRegistry = { ...resourceTypesRegistry, ...raw.resource_types };
    if (raw?.GSRSK_Master_CountryProfiles_v14?.countryProfiles && typeof raw.GSRSK_Master_CountryProfiles_v14.countryProfiles === 'object') cachedResourceProfiles = { ...cachedResourceProfiles, ...raw.GSRSK_Master_CountryProfiles_v14.countryProfiles };
  }
  console.log(`[Server Resources DB] Discovered ${Object.keys(cachedResourceProfiles).length} sovereign profiles and ${Object.keys(resourceTypesRegistry).length} resource types.`);
} catch (e) { console.warn('[Server Resources DB] Discovery warning:', e.message); }

let languageVocabulary = {};
try {
  const file = path.join(__dirname, 'offline_language_vocabulary.json');
  if (fs.existsSync(file)) languageVocabulary = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) { console.warn('[Semantic Vocabulary] Load warning:', e.message); }

let canonicalSemanticRuntime = null;
try { if (ProductionSemanticRuntime?.init) canonicalSemanticRuntime = await ProductionSemanticRuntime.init(); }
catch (e) { console.warn('[Production Semantic Runtime] Initialization warning:', e.message); }
if (!canonicalSemanticRuntime && OfflineSemanticBrain?.configure) canonicalSemanticRuntime = OfflineSemanticBrain.configure({ vocabulary: languageVocabulary });
console.log('[Semantic Runtime] Canonical authority:', ProductionSemanticRuntime?.VERSION || 'OFFLINE_COMPATIBILITY');
console.log('[Deep Core] Authority:', OfflineQueryEngine?.VERSION || 'UNAVAILABLE');
console.log('[Cognitive Bridge] Dispatcher:', OmegaReasoningDispatcher?.VERSION || 'UNAVAILABLE');

let cachedMinisters = {};
try { const file = path.join(__dirname, 'ministers.json'); if (fs.existsSync(file)) cachedMinisters = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.warn('[Server DB] Minister dataset warning:', e.message); }

function normalizeKey(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
function tokens(value) { return new Set(normalizeKey(value).split('_').filter(Boolean)); }
function resolveCountryResourceData(countryCode, countryName) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (code && cachedResourceProfiles[code]) return cachedResourceProfiles[code];
  const name = String(countryName || '').trim().toLowerCase();
  if (name) { const match = Object.values(cachedResourceProfiles).find(p => String(p.identity?.name || '').trim().toLowerCase() === name || String(p.identity?.officialName || '').trim().toLowerCase() === name); if (match) return match; }
  return null;
}
function candidateName(candidate, countryCode) {
  const p = resolveCountryResourceData(countryCode), identity = p?.identity || {}, region = String(identity.region || identity.region_group || identity.worldRegion || identity.subregion || '').trim().toLowerCase().replace(/[^a-z0-9_ -]/g, '_'), names = candidate.regional_names || {};
  if (region) for (const k of Object.keys(names)) if (normalizeKey(k) === normalizeKey(region) || normalizeKey(region).includes(normalizeKey(k)) || normalizeKey(k).includes(normalizeKey(region))) return names[k];
  const first = Object.keys(names).sort()[0]; return names[first] || candidate.name || candidate.id;
}
function flattenMinisterDatabase() { const db = cachedMinisters?.ministers_database || {}, out = []; for (const [category, list] of Object.entries(db)) if (Array.isArray(list)) for (const minister of list) out.push({ ...minister, __category: category }); return out; }
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
const PORT = Number(process.env.PORT || 3000);
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function renderIndex(res, next) {
  fs.readFile(INDEX_PATH, 'utf8', (err, html) => {
    if (err) return next(err);
    let output = html;
    const scripts = [
      LANGUAGE_SYSTEM_SCRIPT, LANGUAGE_BATCH03_SCRIPT, UNIVERSAL_ENTITY_SCRIPT, COUNTRY_BRIDGE_SCRIPT, RESOURCE_BRIDGE_SCRIPT, RESOURCE_MINISTRY_ENGINE_SCRIPT,
      MINISTRY_REGISTRY_SCRIPT, MINISTRY_STATE_PROVIDER_SCRIPT, MINISTRY_INFORMATION_POLICY_SCRIPT,
      MINISTRY_DECISION_FRAMEWORK_SCRIPT, MINISTRY_STATE_TRANSACTION_SCRIPT, MINISTRY_DOMAIN_ENGINES_SCRIPT,
      MINISTRY_INTEROPERABILITY_SCRIPT, MINISTRY_RUNTIME_V1_SCRIPT, SIMULATION_RUNTIME_SCRIPT, RESOURCE_ENDOWMENT_SCRIPT, RESOURCE_TRANSPORT_SCRIPT, RESOURCE_ECONOMY_SCRIPT, OPPONENT_DEEP_MEMORY_SCRIPT, OPPONENT_MEMORY_TRACE_SCRIPT, OPPONENT_INTELLIGENCE_SCRIPT, OPPONENT_STRATEGY_SCRIPT, OPPONENT_COUNTRY_RULES_SCRIPT, OPPONENT_AUTONOMY_SCRIPT, GLOBAL_MARKET_SCRIPT, OPPONENT_TRADE_SCRIPT, OPPONENT_TREATY_SCRIPT, OPPONENT_CONSEQUENCE_SCRIPT,
      MINISTER_CAPABILITY_SCRIPT, MINISTER_STATE_SCRIPT,
      MINISTER_RECRUITMENT_SCRIPT, MINISTER_BOOTSTRAP_SCRIPT, MINISTER_RUNTIME_SCRIPT, COGNITIVE_SCRIPT,
      REASONING_SCRIPT, UNIVERSAL_AI_SCRIPT, AI_INTEGRITY_SCRIPT, HEALTH_LOGO_SCRIPT, UI_INTERACTION_GUARD_SCRIPT
    ];
    for (const script of scripts) { const src = script.match(/src="([^"]+)"/)?.[1]; if (src && !output.includes(src)) output = output.replace('</body>', `    ${script}\n</body>`); }
    res.type('html').send(output);
  });
}
app.get('/', (req, res, next) => renderIndex(res, next));
app.get('/index.html', (req, res, next) => renderIndex(res, next));
app.use(express.static(__dirname, { index: false }));
app.get('/minister_system_config.json', (req, res) => res.sendFile(path.join(__dirname, 'minister_system_config.json')));

app.get('/api/minister-candidates', (req, res) => {
  try { const ministryId = String(req.query.ministryId || '').trim(), countryCode = String(req.query.countryCode || '').trim().toUpperCase(); if (!ministryId) return res.status(400).json({ ok: false, error: 'ministryId is required' }); const candidates = ministerCandidates(ministryId, countryCode); if (candidates.length !== 5) return res.status(404).json({ ok: false, error: `Five verified candidates are required but only ${candidates.length} were available in ministers.json.`, candidateCount: candidates.length, required: 5 }); res.json({ ok: true, ministryId, countryCode, candidates, source: 'ministers.json', count: candidates.length }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/ai/status', (req, res) => { const hasKey = !!process.env.GEMINI_API_KEY; res.json({ ok: true, aiAvailable: hasKey, models: CANDIDATE_MODELS, primaryModel: CANDIDATE_MODELS[0], integrityLayer: '2.1.0', ministerStateSystem: '1.0.0', deepCore: OfflineQueryEngine?.VERSION || null, semanticRuntime: { authority: ProductionSemanticRuntime?.VERSION || null, diagnostics: ProductionSemanticRuntime?.diagnostics?.() || canonicalSemanticRuntime }, cognitiveBridge: { authority: OmegaReasoningDispatcher?.VERSION || null, full40: OmegaReasoningDispatcher?.full40 === true }, timestamp: new Date().toISOString() }); });

app.post('/api/minister-state/diagnostics', (req, res) => { try { const registry = globalThis.OmegaMinisterStateRegistry; if (!registry) return res.status(503).json({ ok: false, error: 'Minister state registry unavailable' }); res.json(registry.consistencyCheck()); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });

function deepCoreContext(req) {
  const source = req.method === 'GET' ? req.query : req.body;
  const body = source && typeof source === 'object' ? source : {};
  return {
    ...body,
    countryId: body.countryId || body.countryCode,
    countryCode: body.countryCode || body.countryId,
    ministerId: body.ministerId || body.ministerID,
    ministryId: body.ministryId || body.ministryID,
    ministerName: body.ministerName || body.ministerDisplayName
  };
}
function buildDeepCoreIR(prompt, input = {}) {
  if (ProductionSemanticRuntime?.parse) {
    try {
      const canonical = ProductionSemanticRuntime.parse(prompt, {
        countryCode: input.countryCode || input.countryId,
        ministryId: input.ministryId,
        ministerId: input.ministerId,
        ministerName: input.ministerName
      });
      if (canonical?.targetDomain === 'MINISTER') return canonical;
    } catch (e) {
      console.warn('[Deep Core] Production minister semantic parse fallback:', e.message);
    }
  }
  if (!OfflineSemanticBrain?.parse) throw new Error('OfflineSemanticBrain is unavailable');
  return OfflineSemanticBrain.parse(prompt, input);
}
function findMinisterRecordLocation(ministerId) {
  const id = String(ministerId || '').trim();
  const db = cachedMinisters?.ministers_database || {};
  for (const [category, list] of Object.entries(db)) {
    if (!Array.isArray(list)) continue;
    const index = list.findIndex(row => String(row?.id || '').trim() === id);
    if (index >= 0) return { category, index };
  }
  return null;
}
function executeProductionMinisterQuery(prompt, input, ir) {
  if (!ProductionSemanticRuntime?.buildAnswerPlan || ir?.targetDomain !== 'MINISTER') return null;
  const identity = {
    countryCode: input.countryCode || input.countryId,
    ministryId: input.ministryId,
    ministerId: input.ministerId,
    ministerName: input.ministerName
  };
  let plan;
  try {
    plan = ProductionSemanticRuntime.buildAnswerPlan(
      prompt,
      identity,
      input.gameState || input.worldState || {},
      Array.isArray(input.history) ? input.history : []
    );
  } catch (e) {
    return {
      handled: true,
      result: {
        ok: false,
        status: 'MINISTER_RUNTIME_EXECUTION_ERROR',
        value: null,
        evidence: [],
        trace: [{ step: 'MINISTER_RUNTIME', status: 'EXECUTION_ERROR', error: e.message }]
      }
    };
  }
  const semantic = plan?.semantic || ir;
  if (semantic?.targetDomain !== 'MINISTER') return null;
  const base = plan?.result || {};
  const ministerId = semantic?.entities?.minister?.id || input.ministerId || null;
  if (!base?.ok) {
    return {
      handled: true,
      result: {
        ok: false,
        status: base.reason || 'MINISTER_QUERY_UNRESOLVED',
        value: base.value ?? null,
        evidence: [],
        trace: [
          { step: 'QUESTION_INTERPRETATION', operation: semantic?.operation || null },
          { step: 'MINISTER_IDENTITY_RESOLUTION', status: 'UNRESOLVED', ministerId: ministerId || null }
        ],
        dataAccess: { repositoryIndexed: true, authority: 'NODE_FILESYSTEM' }
      }
    };
  }
  const attribute = semantic?.attribute?.name || base?.attribute || null;
  const location = findMinisterRecordLocation(ministerId);
  const recordLocator = location
    ? `ministers_database.${location.category}[${location.index}]`
    : 'ministers_database';
  const fieldPath = attribute && location
    ? `ministers_database.${location.category}[${location.index}].${attribute}`
    : attribute || null;
  const evidence = [{
    dataset: 'ministers.json',
    physicalPath: 'ministers.json',
    logicalDatasetId: 'ministers.json',
    recordLocator,
    fieldPath,
    canonicalEntityId: ministerId,
    entityType: 'MINISTER',
    property: attribute,
    rawValue: base.value,
    operation: String(semantic?.operation || base?.operation || 'ATTRIBUTE').toUpperCase(),
    relationPath: [],
    authority: 'NODE_FILESYSTEM',
    source: 'DEEP_CORE_PRODUCTION_MINISTER_EXECUTOR'
  }];
  return {
    handled: true,
    result: {
      ok: true,
      status: 'VERIFIED_FACT',
      operation: base.operation || semantic.operation || 'ATTRIBUTE',
      attribute,
      value: base.value,
      source: base.source || 'ministers.json',
      evidence,
      trace: [
        { step: 'QUESTION_INTERPRETATION', operation: semantic.operation || null, attribute },
        { step: 'MINISTER_IDENTITY_RESOLUTION', ministerId, status: 'RESOLVED', authority: 'OMEGA_PRODUCTION_SEMANTIC_RUNTIME' },
        { step: 'RAW_RECORD_RESOLUTION', dataset: 'ministers.json', recordLocator },
        { step: 'ATTRIBUTE_EXTRACTION', property: attribute },
        { step: 'EVIDENCE_VALIDATION', status: 'VERIFIED_FACT' }
      ],
      dataAccess: { repositoryIndexed: true, authority: 'NODE_FILESYSTEM', dataset: 'ministers.json' }
    }
  };
}
function executeDeepCorePrompt(prompt, input = {}) {
  const ir = buildDeepCoreIR(prompt, input);
  const runtimeDataContext = {
    ...input,
    ir,
    countryId: input.countryId || input.countryCode,
    countryCode: input.countryCode || input.countryId,
    ministerId: input.ministerId,
    ministryId: input.ministryId
  };
  const ministerExecution = executeProductionMinisterQuery(prompt, runtimeDataContext, ir);
  if (ministerExecution?.handled) {
    const result = ministerExecution.result;
    const evidenceLedger = OfflineQueryEngine?.buildEvidenceLedger ? OfflineQueryEngine.buildEvidenceLedger(result) : null;
    return {
      prompt,
      ir,
      searchStrategy: ir.searchStrategy || null,
      executionPlan: {
        version: OfflineQueryEngine?.VERSION || null,
        authority: 'NODE_FILESYSTEM',
        route: 'PRODUCTION_SEMANTIC_RUNTIME -> MINISTER_ATTRIBUTE_EXECUTOR',
        runtimeContextKeys: Object.keys(runtimeDataContext),
        identity: { ministerId: ir?.entities?.minister?.id || input.ministerId || null },
        operation: ir?.operation || null
      },
      result,
      evidenceLedger,
      diagnostics: OfflineQueryEngine?.diagnostics ? OfflineQueryEngine.diagnostics() : null
    };
  }
  const executionPlan = OfflineQueryEngine?.buildExecutionPlan ? OfflineQueryEngine.buildExecutionPlan(ir, runtimeDataContext) : null;
  const result = OfflineQueryEngine?.execute ? OfflineQueryEngine.execute(ir, runtimeDataContext, ir.language || input.language || 'en', input) : { ok: false, status: 'DEEP_CORE_UNAVAILABLE', value: null, evidence: [] };
  const evidenceLedger = OfflineQueryEngine?.buildEvidenceLedger ? OfflineQueryEngine.buildEvidenceLedger(result) : null;
  return { prompt, ir, searchStrategy: ir.searchStrategy || null, executionPlan, result, evidenceLedger, diagnostics: OfflineQueryEngine?.diagnostics ? OfflineQueryEngine.diagnostics() : null };
}

app.get('/api/deep-core/diagnostics', (req, res) => { try { res.json(OfflineQueryEngine.diagnostics()); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.get('/api/deep-core/catalog', (req, res) => { try { res.json({ ok: true, version: OfflineQueryEngine.VERSION, catalog: OfflineQueryEngine.catalog() }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.get('/api/deep-core/schema', (req, res) => { try { const dataset = String(req.query.dataset || '').trim(); if (!dataset) return res.status(400).json({ ok: false, error: 'dataset query parameter is required' }); const schema = OfflineQueryEngine.schema(dataset); if (!schema) return res.status(404).json({ ok: false, status: 'DATASET_NOT_FOUND', dataset }); res.json({ ok: true, dataset, schema }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.get('/api/deep-core/lookup', (req, res) => { try { const id = String(req.query.id || '').trim(); if (!id) return res.status(400).json({ ok: false, error: 'id query parameter is required' }); const result = OfflineQueryEngine.lookupId(id); res.status(result.status === 'IDENTITY_NOT_FOUND' ? 404 : 200).json({ ok: result.status !== 'IDENTITY_NOT_FOUND', ...result }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.get('/api/deep-core/resolve', (req, res) => { try { const id = String(req.query.id || '').trim(), type = String(req.query.type || '').trim(); if (!id) return res.status(400).json({ ok: false, error: 'id query parameter is required' }); const result = OfflineQueryEngine.resolve({ id, type: type || undefined }); res.status(result.status === 'IDENTITY_NOT_FOUND' ? 404 : 200).json({ ok: result.status !== 'IDENTITY_NOT_FOUND', ...result }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.get('/api/deep-core/search', (req, res) => { try { const q = String(req.query.q || '').trim(); if (!q) return res.status(400).json({ ok: false, error: 'q query parameter is required' }); const result = OfflineQueryEngine.search(q, { dataset: req.query.dataset, type: req.query.type, limit: req.query.limit }); res.status(result.status === 'NOT_FOUND' ? 404 : 200).json({ ok: result.status !== 'NOT_FOUND', ...result }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.get('/api/deep-core/select', (req, res) => { try { const q = String(req.query.q || '').trim(); if (!q) return res.status(400).json({ ok: false, error: 'q query parameter is required' }); const result = OfflineQueryEngine.select(q, req.query.type || null, Number(req.query.limit || 25)); res.status(result.status === 'NOT_FOUND' ? 404 : 200).json({ ok: result.status !== 'NOT_FOUND', ...result }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });

function respondDeepCoreQuery(req, res) {
  try {
    const input = deepCoreContext(req), prompt = String(input.prompt || input.question || '').trim();
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt or question is required' });
    const output = executeDeepCorePrompt(prompt, input), status = output.result?.status || 'UNRESOLVED';
    return res.status(status === 'VERIFIED_FACT' ? 200 : 422).json({ ok: status === 'VERIFIED_FACT', ...output });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message, source: 'DEEP_CORE_GATEWAY' }); }
}

app.get('/api/deep-core/query', respondDeepCoreQuery);
app.post('/api/deep-core/query', respondDeepCoreQuery);
app.post('/api/deep-core/plan', (req, res) => { try { const input = deepCoreContext(req), prompt = String(input.prompt || input.question || '').trim(); if (!prompt) return res.status(400).json({ ok: false, error: 'prompt or question is required' }); const ir = buildDeepCoreIR(prompt, input); const runtimeDataContext = { ...input, ir }; const executionPlan = OfflineQueryEngine.buildExecutionPlan(ir, runtimeDataContext); res.json({ ok: true, prompt, ir, searchStrategy: ir.searchStrategy || null, executionPlan, diagnostics: OfflineQueryEngine.diagnostics() }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.post('/api/deep-core/refresh', (req, res) => { try { res.json({ ok: true, refresh: OfflineQueryEngine.refresh(), diagnostics: OfflineQueryEngine.diagnostics() }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });

function canonicalPlan(prompt, input = {}) {
  const ctx = { ...input, countryId: input.countryId || input.countryCode, countryCode: input.countryCode || input.countryId };
  if (MinisterQueryRouter?.routeMinisterQuery) { const routed = MinisterQueryRouter.routeMinisterQuery(prompt, ctx, ctx); if (routed?.semantic && routed?.result) return { semantic: routed.semantic, result: routed.result, router: routed }; }
  if (ProductionSemanticRuntime?.buildAnswerPlan) { try { const result = ProductionSemanticRuntime.buildAnswerPlan(prompt, { countryCode: ctx.countryCode, ministryId: ctx.ministryId, ministerId: ctx.ministerId, ministerName: ctx.ministerName }, ctx.gameState || ctx.worldState || {}, ctx.history || []); if (result?.semantic && result?.result) return result; } catch (e) { console.warn('[Canonical Plan] Production runtime fallback:', e.message); } }
  return executeDeepCorePrompt(prompt, ctx);
}
function runCognitiveBridge(prompt, semantic, offlineResult, identity, language, gameState, conversationHistory) { if (!OmegaReasoningDispatcher?.dispatch) return { available: false, reason: 'COGNITIVE_DISPATCHER_UNAVAILABLE' }; try { const parsed = semantic || { operation: 'LOOKUP', language: language || 'en', surface: prompt }; const history = Array.isArray(conversationHistory) ? conversationHistory : []; return OmegaReasoningDispatcher.dispatch(prompt, parsed, offlineResult || {}, { ...identity, language, gameState: gameState || {}, history, timeHorizon: 'CURRENT' }); } catch (e) { return { available: false, reason: 'COGNITIVE_DISPATCH_ERROR', error: e.message }; } }
app.get('/api/deep-core/health', (req, res) => { try { const diagnostics = OfflineQueryEngine.diagnostics(); res.json({ ok: diagnostics.initialized === true, engine: 'OMEGA_DEEP_CORE', version: OfflineQueryEngine.VERSION, diagnostics }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });

app.listen(PORT, () => { console.log(`[OMEGA Server] Listening on port ${PORT}`); try { console.log('[Deep Core Diagnostics]', JSON.stringify(OfflineQueryEngine.diagnostics())); } catch (e) { console.warn('[Deep Core Diagnostics] unavailable:', e.message); } });
