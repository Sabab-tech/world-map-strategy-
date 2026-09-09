import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import './omega_production_semantic_runtime_v3.js';
import './offline_semantic_brain.js';
import './offline_query_engine.js';
import './minister_query_router.js';

const ProductionSemanticRuntime = globalThis.OmegaProductionSemanticRuntime;
const OfflineSemanticBrain = globalThis.OfflineSemanticBrain;
const OfflineQueryEngine = globalThis.OfflineQueryEngine;
const MinisterQueryRouter = globalThis.MinisterQueryRouter;
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
  if (ProductionSemanticRuntime?.init) {
    canonicalSemanticRuntime = await ProductionSemanticRuntime.init();
  }
} catch (e) { console.warn('[Production Semantic Runtime] Initialization warning:', e.message); }
if (!canonicalSemanticRuntime && OfflineSemanticBrain?.configure) {
  canonicalSemanticRuntime = OfflineSemanticBrain.configure({ datasets: semanticDatasets, vocabulary: languageVocabulary });
}
console.log('[Semantic Runtime] Canonical authority:', ProductionSemanticRuntime?.VERSION || 'OFFLINE_COMPATIBILITY');

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
  res.json({ ok: true, aiAvailable: hasKey, models: CANDIDATE_MODELS, primaryModel: CANDIDATE_MODELS[0], integrityLayer: '2.0.0', ministerStateSystem: '1.0.0', semanticRuntime: { authority: ProductionSemanticRuntime?.VERSION || null, diagnostics: ProductionSemanticRuntime?.diagnostics?.() || canonicalSemanticRuntime }, timestamp: new Date().toISOString() });
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

app.post('/api/ai/semantic-query', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.prompt || typeof body.prompt !== 'string') return res.status(400).json({ ok: false, error: 'Prompt is required' });
    const plan = canonicalPlan(body.prompt, body);
    return res.json({ ok: true, authority: ProductionSemanticRuntime?.VERSION || 'OFFLINE_COMPATIBILITY', semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(body.prompt, body) : OfflineSemanticBrain.explain(plan.semantic), result: plan.result, plan });
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

app.post('/api/ai/minister-consult', async (req, res) => {
  try {
    const { ministerId, ministerName, ministerRole, ministryId, countryName, countryCode, prompt, language, gameState, reservesData, timeHorizon, conversationHistory } = req.body;
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ ok: false, error: 'Prompt is required' });
    const identity = { ministerId: String(ministerId || '').trim(), ministerName: String(ministerName || '').trim(), ministerRole: String(ministerRole || '').trim(), ministryId: String(ministryId || '').trim(), countryName: String(countryName || '').trim(), countryCode: String(countryCode || '').trim().toUpperCase() };

    const semanticPlan = canonicalPlan(prompt, { ...identity, language, gameState, reservesData, timeHorizon, history: conversationHistory ? String(conversationHistory).split('\n').slice(-24).map(x => ({ role: x.startsWith('assistant:') ? 'assistant' : 'user', content: x.replace(/^(assistant|user):\s*/, '') })) : [] });
    const semantic = semanticPlan.semantic || semanticPlan.plan?.semantic || (ProductionSemanticRuntime?.parse ? ProductionSemanticRuntime.parse(prompt, identity) : null);
    const offlineResult = semanticPlan.result || ProductionSemanticRuntime?.execute?.(semantic, identity) || null;
    const ai = getAI();
    if (!ai) {
      const text = ProductionSemanticRuntime?.formatOfflineAnswer && semantic ? ProductionSemanticRuntime.formatOfflineAnswer(semanticPlan) : offlineResult?.text || null;
      return res.json({ ok: true, aiPowered: false, mode: 'OFFLINE_GROUNDED', authority: ProductionSemanticRuntime?.VERSION || 'OFFLINE_COMPATIBILITY', text, semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(prompt, identity) : OfflineSemanticBrain.explain(semantic), result: offlineResult, identity, grounding: { runtimeDatasets: ProductionSemanticRuntime?.diagnostics?.() || canonicalSemanticRuntime, policy: 'NO_UNGROUNDED_DEFAULTS' } });
    }

    const routing = ProductionSemanticRuntime?.parse ? ProductionSemanticRuntime.parse(prompt, identity) : MinisterQueryRouter.routeMinisterQuery(prompt, { ministryId: identity.ministryId, ministerId: identity.ministerId, ministerName: identity.ministerName, ministerRole: identity.ministerRole }, { countryName: identity.countryName, countryCode: identity.countryCode });
    const profile = findMinisterProfile(identity.ministerId, identity.ministerName);
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
      economy: eco, population: pop, liveTelemetry: telemetry
    };
    const dossierText = JSON.stringify(dossier, null, 2), dossierFields = Object.values(dossier).filter(v => v && typeof v === 'object' && Object.keys(v).length).length / 10;
    const confidence = evidenceConfidence({ routing: semantic || routing, identityResolved: !!identity.ministerId && !!identity.ministerName && !!identity.countryCode, dossierFields, profileResolved: !!profile });
    const systemInstruction = `You are the minister identified in the canonical identity record. First obey the semantic contract and deterministic answer state. Answer the actual question, not a different interpretation. The canonical semantic runtime and grounded context are the evidence boundary. Never invent a country, resource, quantity, mine, reserve, identity, event, causal link or calculation. Distinguish VERIFIED FACT, DETERMINISTIC CALCULATION, INFERENCE and RECOMMENDATION. When the answer state is incomplete, say what is known and what is UNKNOWN. Preserve the user's language; respond in ${language === 'bn' ? 'standard Bengali' : 'English'}.`;
    const userContent = `CANONICAL IDENTITY:\n${JSON.stringify(identity, null, 2)}\n\nCANONICAL SEMANTIC PLAN:\n${JSON.stringify(semanticPlan, null, 2)}\n\nGROUNDED EXECUTIVE DOSSIER:\n${dossierText}\n\nEXECUTIVE COMMANDER QUESTION:\n${prompt}`;
    const result = await generateWithFallback(ai, { contents: userContent, config: { systemInstruction, temperature: .25, topP: .9 } });
    return res.json({ ok: true, aiPowered: true, model: result.model, text: result.text || '', confidence, authority: ProductionSemanticRuntime?.VERSION || 'OFFLINE_COMPATIBILITY', semantic: ProductionSemanticRuntime?.explain ? ProductionSemanticRuntime.explain(prompt, identity) : semantic, result: offlineResult, intent: semantic?.targetDomain || routing?.intent, domain: semantic?.targetDomain || routing?.domain, identity, grounding: { runtimeDatasets: ProductionSemanticRuntime?.diagnostics?.() || canonicalSemanticRuntime, policy: 'NO_UNGROUNDED_DEFAULTS' } });
  } catch (e) { console.error('[AI Minister Consult]', e); return res.status(500).json({ ok: false, error: e.message || 'AI consultation failed' }); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`OMEGA server running on http://0.0.0.0:${PORT}`));
