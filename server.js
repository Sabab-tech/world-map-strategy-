import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.join(__dirname, 'index.html');
const HEALTH_LOGO_SCRIPT = '<script src="/health-ministry-logo.js"></script>';

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
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-flash-latest'
];

async function generateWithFallback(ai, options) {
    let lastError = null;
    for (const model of CANDIDATE_MODELS) {
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
            console.warn(`[Gemini API] Model ${model} returned error (${err.message}). Trying fallback model...`);
            lastError = err;
        }
    }
    throw lastError || new Error('All Gemini model candidates failed');
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

        const systemInstruction = `You are ${ministerName || 'the Minister'}, serving as the ${ministerRole || 'Cabinet Minister'} of ${countryName || 'the Sovereign State'} (${countryCode || 'BGD'}).
You are participating in a sovereign geopolitical simulation game.
The Executive Commander (User) is consulting you for strategic directives, policy advice, national resource management, economic planning, defense, health, foreign affairs, or energy sovereignty.

Your core directives:
1. Speak in character as a dedicated, highly articulate, patriotic, analytical sovereign minister with decades of strategic experience.
2. Address the user with supreme respect (e.g. "মাননীয় এক্সিকিউটিভ কমান্ডার" in Bengali, or "Executive Commander" in English).
3. If the user asks in Bengali or with Bengali characters, respond in flawless, high-register, authoritative sovereign Bengali (সাধু/প্রমিত বাংলা).
4. Provide structured, insightful answers with actionable policy steps, numerical reserve intelligence, strategic trade implications, and sovereign recommendations.
5. If the user asks about resources, mines, age, biography, or policy, provide rich contextual data grounded in actual geography and statecraft.
6. Do NOT include markdown code blocks or meta disclaimers. Speak directly in persona.`;

        const userContent = `Executive Consultation Context:
- Minister: ${ministerName} (${ministerRole})
- Sovereign State: ${countryName} [${countryCode}]
- Strategic Reserves & Financial Telemetry: ${JSON.stringify(reservesData || gameState || {})}
- Executive Commander's Query: "${prompt}"

Provide your comprehensive ministerial briefing, analysis, and concrete policy directives now.`;

        const result = await generateWithFallback(ai, {
            contents: userContent,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7,
                topP: 0.95
            }
        });

        return res.json({
            ok: true,
            aiPowered: true,
            model: result.model,
            text: result.text || '',
            confidence: 98,
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

