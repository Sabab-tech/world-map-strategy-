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
const HEALTH_LOGO_SCRIPT = '<script src="/health-ministry-logo.js"></script>';

// Load and aggregate sovereign geological knowledge from resources.json & resources_2.json
let cachedResourceProfiles = {};
let resourceTypesRegistry = {};

try {
    const r1Path = path.join(__dirname, 'resources.json');
    const r2Path = path.join(__dirname, 'resources_2.json');
    
    if (fs.existsSync(r1Path)) {
        const raw1 = JSON.parse(fs.readFileSync(r1Path, 'utf8'));
        if (raw1.resource_types) resourceTypesRegistry = { ...resourceTypesRegistry, ...raw1.resource_types };
        if (raw1.GSRSK_Master_CountryProfiles_v14?.countryProfiles) {
            cachedResourceProfiles = { ...cachedResourceProfiles, ...raw1.GSRSK_Master_CountryProfiles_v14.countryProfiles };
        }
    }
    if (fs.existsSync(r2Path)) {
        const raw2 = JSON.parse(fs.readFileSync(r2Path, 'utf8'));
        if (raw2.resource_types) resourceTypesRegistry = { ...resourceTypesRegistry, ...raw2.resource_types };
        if (raw2.GSRSK_Master_CountryProfiles_v14?.countryProfiles) {
            cachedResourceProfiles = { ...cachedResourceProfiles, ...raw2.GSRSK_Master_CountryProfiles_v14.countryProfiles };
        }
    }
    console.log(`[Server Resources DB] Successfully indexed ${Object.keys(cachedResourceProfiles).length} sovereign geological profiles and ${Object.keys(resourceTypesRegistry).length} resource types.`);
} catch (e) {
    console.warn('[Server Resources DB] Failed to pre-cache resources.json:', e.message);
}

function resolveCountryResourceData(countryCode, countryName) {
    const code = (countryCode || '').toUpperCase();
    if (cachedResourceProfiles[code]) return cachedResourceProfiles[code];
    
    // Fuzzy search by country name
    const match = Object.values(cachedResourceProfiles).find(p => 
        (p.identity?.name && p.identity.name.toLowerCase() === (countryName || '').toLowerCase()) ||
        (p.identity?.officialName && p.identity.officialName.toLowerCase().includes((countryName || '').toLowerCase()))
    );
    if (match) return match;

    // Return sovereign empty schema rather than misattributing Bangladesh
    return {
        identity: { name: countryName || countryCode || 'Sovereign State', iso: code },
        hydrocarbon_resource_base: {},
        mineral_resource_base: {},
        strategic_resources: {},
        resource_dependency: {},
        processing_and_industrial_capacities: {},
        resource_infrastructure_context: { mineSites: [] }
    };
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname, { index: false }));

// Lazy GoogleGenAI Initialization
let aiClient = null;
function getAI() {
    if (!aiClient) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            aiClient = new GoogleGenAI({
                apiKey: apiKey,
                httpOptions: {
                    headers: {
                        'User-Agent': 'aistudio-build'
                    }
                }
            });
        }
    }
    return aiClient;
}

// Fallback candidate models in priority order
const CANDIDATE_MODELS = [
    'gemini-3.1-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.1-pro-preview',
    'gemini-flash-latest'
];

let cachedEconomies = {};
let cachedPopulations = {};
let cachedMinisters = {};

try {
    const ecoPath = path.join(__dirname, 'economy.json');
    const popPath = path.join(__dirname, 'population.json');
    const minPath = path.join(__dirname, 'ministers.json');
    if (fs.existsSync(ecoPath)) cachedEconomies = JSON.parse(fs.readFileSync(ecoPath, 'utf8'));
    if (fs.existsSync(popPath)) cachedPopulations = JSON.parse(fs.readFileSync(popPath, 'utf8'));
    if (fs.existsSync(minPath)) cachedMinisters = JSON.parse(fs.readFileSync(minPath, 'utf8'));
} catch (e) {
    console.warn('[Server DB] Auxiliary datasets loading notice:', e.message);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithFallback(ai, options) {
    let lastError = null;
    for (const model of CANDIDATE_MODELS) {
        // Try up to 2 attempts per candidate model for transient 503/429 errors
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const response = await ai.models.generateContent({
                    model: model,
                    contents: options.contents,
                    config: options.config
                });
                if (response && response.text) {
                    return {
                        ok: true,
                        model: model,
                        text: response.text
                    };
                }
            } catch (err) {
                lastError = err;
                const isTransient = err.message && (err.message.includes('503') || err.message.includes('429') || err.message.includes('high demand') || err.message.includes('UNAVAILABLE'));
                if (isTransient && attempt === 1) {
                    await sleep(350 + Math.random() * 200);
                    continue;
                }
                break; // Move to next candidate model
            }
        }
    }
    throw lastError || new Error('All Gemini model candidates temporarily unavailable');
}

// AI Status check endpoint
app.get('/api/ai/status', (req, res) => {
    const hasKey = !!process.env.GEMINI_API_KEY;
    res.json({
        ok: true,
        aiAvailable: hasKey,
        models: CANDIDATE_MODELS,
        primaryModel: CANDIDATE_MODELS[0],
        timestamp: new Date().toISOString()
    });
});

// AI Minister Consultation & Strategy Reasoning Endpoint
app.post('/api/ai/minister-consult', async (req, res) => {
    try {
        const {
            ministerId,
            ministerName,
            ministerRole,
            countryName,
            countryCode,
            prompt,
            language,
            gameState,
            reservesData
        } = req.body;

        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ ok: false, error: 'Prompt is required' });
        }

        const ai = getAI();
        if (!ai) {
            return res.json({
                ok: false,
                aiPowered: false,
                reason: 'NO_API_KEY',
                message: 'Gemini API key is not configured; using offline cognitive engine.'
            });
        }

        const isBn = language === 'bn' || (typeof prompt === 'string' && /[\u0980-\u09FF]/.test(prompt));
        const countryResourceProfile = resolveCountryResourceData(countryCode, countryName);
        const isoUpper = (countryCode || 'BGD').toUpperCase();
        const countryEco = cachedEconomies[isoUpper] || {};
        const countryPop = cachedPopulations[isoUpper] || {};

        // Query Routing & Intent Extraction
        const routing = MinisterQueryRouter.routeMinisterQuery(prompt, { ministerId, ministerName, ministerRole }, { countryName, countryCode });

        // Resolve Minister Identity Profile
        let ministerProfile = null;
        if (cachedMinisters && cachedMinisters.ministers_database) {
            for (const category of Object.values(cachedMinisters.ministers_database)) {
                if (Array.isArray(category)) {
                    const found = category.find(m => m.id === ministerId || (m.regional_names && Object.values(m.regional_names).includes(ministerName)));
                    if (found) {
                        ministerProfile = found;
                        break;
                    }
                }
            }
        }

        const systemInstruction = `You are ${ministerName || 'the Minister'}, serving as the esteemed ${ministerRole || 'Cabinet Minister'} of ${countryName || 'the Sovereign Nation'} (ISO: ${countryCode || 'BGD'}).
You are participating in a deep sovereign geopolitical simulation game.
The Executive Commander (User) is consulting you.

Your core directives:
1. Speak in character as a dedicated, highly articulate, patriotic, analytical sovereign minister with decades of strategic statecraft experience.
2. Address the user with supreme respect (e.g. "মাননীয় এক্সিকিউটিভ কমান্ডার" in Bengali, or "Executive Commander" in English).
3. If the user asks in Bengali or with Bengali characters, respond in flawless, high-register, authoritative sovereign Bengali (সাধু/প্রমিত বাংলা). If asked in English, reply in articulate, sophisticated English.
4. SPECIFIC QUERY INTENT EXECUTION:
   - Intent Detected: ${routing.intent} (Domain: ${routing.domain})
   - If Intent is MINISTER_IDENTITY (e.g. asking your name, age, background, credentials, who you are): Explicitly state your full name (${ministerName}), age (${ministerProfile?.age || '52'} years), professional background (${ministerProfile?.background || 'Senior Sovereign Policy Specialist'}), alma mater, and ministerial duties directly and proudly. Do not output generic macroeconomic summaries.
   - If Intent is RESOURCE_SECURITY / STOCKPILES: Focus specifically on the audited stockpile numbers, emergency consumption runway (days), physical bunker storage security, and foreign exchange backup.
   - If Intent is RESOURCE_MINING_DISCOVERY: Focus specifically on known active mine sites, deposits, and geological basins.
   - If Intent is MACROECONOMICS: Focus on GDP, inflation, sovereign debt, liquid treasury cash, and foreign exchange reserves.
5. Ground your answers strictly in the verified data provided in the Executive Intelligence Dossier below. If a specific metric is not present in the dossier, state its strategic operational status realistically without inventing fake numbers.
6. Do NOT include markdown code blocks or meta disclaimers. Speak directly in persona.`;

        const userContent = `Executive Ministerial Intelligence Dossier:
- Minister Identity Record:
  * Name: ${ministerName}
  * Portfolio: ${ministerRole}
  * Age: ${ministerProfile?.age || '52'}
  * Background: ${ministerProfile?.background || 'Senior Statecraft & Policy Specialist'}
  * Ideology: ${JSON.stringify(ministerProfile?.ideology || { type: 'nationalist' })}
  * Core Stats: ${JSON.stringify(ministerProfile?.stats || { discipline: 88, strategic: 85 })}
- Sovereign State: ${countryName} [${countryCode}]
- Query Routing Analysis:
  * Intent: ${routing.intent}
  * Detected Resource Entities: ${JSON.stringify(routing.entities)}
  * Required Cognition: ${JSON.stringify(routing.requiredData)}
- Official Geological & Mineral Resource Profile:
${JSON.stringify({
    hydrocarbon_reserves: countryResourceProfile?.hydrocarbon_resource_base || {},
    mineral_deposits: countryResourceProfile?.mineral_resource_base || {},
    strategic_resources: countryResourceProfile?.strategic_resources || {},
    resource_dependency: countryResourceProfile?.resource_dependency || {},
    industrial_capacities: countryResourceProfile?.processing_resource_context || countryResourceProfile?.processing_and_industrial_capacities || {},
    mineSites: countryResourceProfile?.resource_infrastructure_context?.mineSites || []
}, null, 2)}
- National Macroeconomics: ${JSON.stringify(countryEco)}
- National Demographics: ${JSON.stringify(countryPop)}
- Live Financial & Game Telemetry: ${JSON.stringify(reservesData || gameState || {})}
- Executive Commander's Inquiry: "${prompt}"

Provide your comprehensive, realistic ministerial briefing answering the specific inquiry directly now.`;

        const result = await generateWithFallback(ai, {
            contents: userContent,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7,
                topP: 0.95
            }
        });

        const dynamicConfidence = Math.min(99.5, Math.max(88.0, 92.0 + (routing.confidence * 6.0)));

        return res.json({
            ok: true,
            aiPowered: true,
            model: result.model,
            text: result.text || '',
            confidence: Number(dynamicConfidence.toFixed(1)),
            intent: routing.intent,
            domain: routing.domain,
            status: 'GEMINI_AI_AUTONOMOUS_SYNTHESIS'
        });

    } catch (err) {
        console.warn('[Gemini consultation fallback warning]:', err.message || err);
        return res.json({
            ok: false,
            aiPowered: false,
            error: err.message || 'Error generating AI response'
        });
    }
});

// General AI generation endpoint
app.post('/api/ai/generate', async (req, res) => {
    try {
        const { prompt, systemInstruction } = req.body;
        if (!prompt) return res.status(400).json({ ok: false, error: 'Prompt is required' });

        const ai = getAI();
        if (!ai) {
            return res.json({ ok: false, aiPowered: false, reason: 'NO_API_KEY' });
        }

        const result = await generateWithFallback(ai, {
            contents: prompt,
            config: {
                systemInstruction: systemInstruction || 'You are a sovereign strategic advisor in a geopolitical strategy simulator.',
                temperature: 0.7
            }
        });

        return res.json({
            ok: true,
            aiPowered: true,
            model: result.model,
            text: result.text || ''
        });
    } catch (err) {
        console.warn('[Gemini general generate error]:', err.message || err);
        return res.json({ ok: false, aiPowered: false, error: err.message });
    }
});

app.get('*', (req, res, next) => {
    fs.readFile(INDEX_PATH, 'utf8', (err, html) => {
        if (err) return next(err);
        const output = html.includes('/health-ministry-logo.js')
            ? html
            : html.replace('</body>', `    ${HEALTH_LOGO_SCRIPT}\n</body>`);
        res.type('html').send(output);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});

