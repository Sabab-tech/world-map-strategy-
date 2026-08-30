import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import './minister_query_router.js';
const MinisterQueryRouter = globalThis.MinisterQueryRouter;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.join(__dirname, 'index.html');
const AI_INTEGRITY_SCRIPT = '<script src="/omega_ai_integrity_layer.js"></script>';
const HEALTH_LOGO_SCRIPT = '<script src="/health-ministry-logo.js"></script>';

let cachedResourceProfiles = {};
let resourceTypesRegistry = {};
try {
  for (const filename of ['resources.json', 'resources_2.json']) {
    const file = path.join(__dirname, filename);
    if (!fs.existsSync(file)) continue;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw.resource_types) resourceTypesRegistry = { ...resourceTypesRegistry, ...raw.resource_types };
    if (raw.GSRSK_Master_CountryProfiles_v14?.countryProfiles) {
      cachedResourceProfiles = { ...cachedResourceProfiles, ...raw.GSRSK_Master_CountryProfiles_v14.countryProfiles };
    }
  }
  console.log(`[Server Resources DB] Indexed ${Object.keys(cachedResourceProfiles).length} sovereign profiles and ${Object.keys(resourceTypesRegistry).length} resource types.`);
} catch (e) {
  console.warn('[Server Resources DB] Load warning:', e.message);
}

function resolveCountryResourceData(countryCode, countryName) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (code && cachedResourceProfiles[code]) return cachedResourceProfiles[code];
  const name = String(countryName || '').trim().toLowerCase();
  if (name) {
    const match = Object.values(cachedResourceProfiles).find(p =>
      String(p.identity?.name || '').trim().toLowerCase() === name ||
      String(p.identity?.officialName || '').trim().toLowerCase() === name
    );
    if (match) return match;
  }
  return {
    identity: { name: countryName || countryCode || 'Sovereign State', iso: code || 'UNKNOWN' },
    hydrocarbon_resource_base: {}, mineral_resource_base: {}, strategic_resources: {},
    resource_dependency: {}, processing_and_industrial_capacities: {},
    resource_infrastructure_context: { mineSites: [] }
  };
}

const app = express();
const PORT = 3000;
app.use(express.json({ limit: '10mb' }));

function renderIndex(res, next) {
  fs.readFile(INDEX_PATH, 'utf8', (err, html) => {
    if (err) return next(err);
    let output = html;
    if (!output.includes('/omega_ai_integrity_layer.js')) output = output.replace('</body>', `    ${AI_INTEGRITY_SCRIPT}\n</body>`);
    if (!output.includes('/health-ministry-logo.js')) output = output.replace('</body>', `    ${HEALTH_LOGO_SCRIPT}\n</body>`);
    res.type('html').send(output);
  });
}

// Explicitly serve the boot document through the integrity injector. Static assets remain untouched.
app.get('/', (req, res, next) => renderIndex(res, next));
app.get('/index.html', (req, res, next) => renderIndex(res, next));
app.use(express.static(__dirname, { index: false }));

let aiClient = null;
function getAI() {
  if (!aiClient && process.env.GEMINI_API_KEY) aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
  return aiClient;
}

const CANDIDATE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-3.1-pro-preview', 'gemini-flash-latest'];
let cachedEconomies = {}, cachedPopulations = {}, cachedMinisters = {};
try {
  const eco = path.join(__dirname, 'economy.json');
  const pop = path.join(__dirname, 'population.json');
  const min = path.join(__dirname, 'ministers.json');
  if (fs.existsSync(eco)) cachedEconomies = JSON.parse(fs.readFileSync(eco, 'utf8'));
  if (fs.existsSync(pop)) cachedPopulations = JSON.parse(fs.readFileSync(pop, 'utf8'));
  if (fs.existsSync(min)) cachedMinisters = JSON.parse(fs.readFileSync(min, 'utf8'));
} catch (e) { console.warn('[Server DB] Auxiliary dataset warning:', e.message); }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function generateWithFallback(ai, options) {
  let lastError = null;
  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
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
  }
  throw lastError || new Error('All Gemini model candidates temporarily unavailable');
}

function findMinisterProfile(ministerId, ministerName) {
  const db = cachedMinisters?.ministers_database;
  if (!db) return null;
  for (const category of Object.values(db)) {
    if (!Array.isArray(category)) continue;
    const found = category.find(m => m.id === ministerId || (m.regional_names && ministerName && Object.values(m.regional_names).includes(ministerName)));
    if (found) return found;
  }
  return null;
}

function evidenceConfidence({ routing, identityResolved, dossierFields, profileResolved }) {
  const routingScore = Math.max(0, Math.min(1, Number(routing?.confidence ?? 0)));
  const dataScore = Math.max(0, Math.min(1, dossierFields));
  const identityScore = identityResolved ? 1 : 0.25;
  const profileScore = profileResolved ? 1 : 0.35;
  return Number((100 * (0.25 * routingScore + 0.35 * dataScore + 0.25 * identityScore + 0.15 * profileScore)).toFixed(1));
}

app.get('/api/ai/status', (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.json({ ok: true, aiAvailable: hasKey, models: CANDIDATE_MODELS, primaryModel: CANDIDATE_MODELS[0], integrityLayer: '1.1.0', timestamp: new Date().toISOString() });
});

app.post('/api/ai/minister-consult', async (req, res) => {
  try {
    const { ministerId, ministerName, ministerRole, ministryId, countryName, countryCode, prompt, language, gameState, reservesData } = req.body;
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ ok: false, error: 'Prompt is required' });

    const identity = {
      ministerId: String(ministerId || '').trim(), ministerName: String(ministerName || '').trim(),
      ministerRole: String(ministerRole || '').trim(), ministryId: String(ministryId || '').trim(),
      countryName: String(countryName || '').trim(), countryCode: String(countryCode || '').trim().toUpperCase()
    };
    const profile = findMinisterProfile(identity.ministerId, identity.ministerName);
    const ai = getAI();
    if (!ai) return res.json({ ok: false, aiPowered: false, reason: 'NO_API_KEY', message: 'Gemini API key is not configured; use the grounded offline cognitive path.' });

    const isBn = language === 'bn' || /[\u0980-\u09FF]/.test(prompt);
    const routing = MinisterQueryRouter.routeMinisterQuery(prompt, { ministryId: identity.ministryId, ministerId: identity.ministerId, ministerName: identity.ministerName, ministerRole: identity.ministerRole }, { countryName: identity.countryName, countryCode: identity.countryCode });
    const resourceProfile = resolveCountryResourceData(identity.countryCode, identity.countryName);
    const eco = cachedEconomies[identity.countryCode] || {};
    const pop = cachedPopulations[identity.countryCode] || {};
    const telemetry = reservesData || gameState || {};
    const dossier = {
      minister: { id: identity.ministerId || 'UNKNOWN', name: identity.ministerName || 'UNKNOWN', role: identity.ministerRole || 'UNKNOWN', ministryId: identity.ministryId || 'UNKNOWN', profileFound: !!profile },
      country: { name: identity.countryName || 'UNKNOWN', iso: identity.countryCode || 'UNKNOWN' },
      routing: { intent: routing.intent, domain: routing.domain, entities: routing.entities || [], requiredData: routing.requiredData || [] },
      resources: {
        hydrocarbons: resourceProfile.hydrocarbon_resource_base || {}, minerals: resourceProfile.mineral_resource_base || {},
        strategic: resourceProfile.strategic_resources || {}, dependency: resourceProfile.resource_dependency || {},
        processing: resourceProfile.processing_and_industrial_capacities || {}, mineSites: resourceProfile.resource_infrastructure_context?.mineSites || []
      },
      economy: eco, population: pop, liveTelemetry: telemetry
    };
    const dossierText = JSON.stringify(dossier, null, 2);
    const dossierFields = Object.values(dossier).filter(v => v && typeof v === 'object' && Object.keys(v).length).length / 7;
    const confidence = evidenceConfidence({ routing, identityResolved: !!identity.ministerId && !!identity.ministerName && !!identity.countryCode, dossierFields, profileResolved: !!profile });

    const systemInstruction = `You are the minister identified in the CANONICAL IDENTITY RECORD below. Identity is authoritative and must never be changed. Never invent a different name, country, ministry, age, credentials, reserves, stockpile, infrastructure or event.\n\nCANONICAL IDENTITY:\n${JSON.stringify(identity, null, 2)}\n\nRules:\n1. Answer the user's actual question, not a generic briefing.\n2. Treat only values explicitly present in the dossier as observed data.\n3. Derived values must be labeled as calculated/derived and must show the basic equation when material.\n4. Missing values are UNKNOWN. Do not replace missing data with defaults.\n5. Separate fact, calculation, inference and recommendation.\n6. If the question asks your identity, answer from the canonical identity record and do not discuss unrelated macroeconomics.\n7. ${isBn ? 'Respond in standard Bengali.' : 'Respond in English.'}`;

    const userContent = `EXECUTIVE INTELLIGENCE DOSSIER:\n${dossierText}\n\nEXECUTIVE COMMANDER QUESTION:\n${prompt}`;
    const result = await generateWithFallback(ai, { contents: userContent, config: { systemInstruction, temperature: 0.35, topP: 0.9 } });
    return res.json({ ok: true, aiPowered: true, model: result.model, text: result.text || '', confidence, intent: routing.intent, domain: routing.domain, identity, grounding: { dossierFields: Number(dossierFields.toFixed(3)), profileResolved: !!profile, policy: 'NO_UNGROUNDED_DEFAULTS' }, status: 'GEMINI_GROUNDED_SYNTHESIS' });
  } catch (err) {
    console.warn('[Gemini consultation error]:', err.message || err);
    return res.json({ ok: false, aiPowered: false, error: err.message || 'Error generating AI response' });
  }
});

app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt, systemInstruction } = req.body;
    if (!prompt) return res.status(400).json({ ok: false, error: 'Prompt is required' });
    const ai = getAI();
    if (!ai) return res.json({ ok: false, aiPowered: false, reason: 'NO_API_KEY' });
    const result = await generateWithFallback(ai, { contents: prompt, config: { systemInstruction: systemInstruction || 'You are a sovereign strategic advisor. Do not invent facts not present in the supplied state.', temperature: 0.35 } });
    return res.json({ ok: true, aiPowered: true, model: result.model, text: result.text || '' });
  } catch (err) {
    console.warn('[Gemini general generate error]:', err.message || err);
    return res.json({ ok: false, aiPowered: false, error: err.message || 'AI generation failed' });
  }
});

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  renderIndex(res, next);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://0.0.0.0:${PORT}`));
