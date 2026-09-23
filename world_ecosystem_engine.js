/**
 * ============================================================================
 * OMEGA WORLD ECOSYSTEM & CAUSAL DEPENDENCY STATE ENGINE (v12.0 - AAA CORE)
 * ============================================================================
 * Transforms the Geopolitical Simulator into a living, interconnected World State
 * Ecosystem (inspired by HOI4, Victoria 3, Terra Invicta, Shadow Empire, Distant Worlds 2).
 *
 * Relations are no longer static numbers—they are an EMERGENT OUTPUT computed from:
 * 1. World & Alliance Blocs Ecosystem
 * 2. Geography & Border Tactical Ecosystem
 * 3. 17-Commodity Strategic Resource & Supply Chain Ecosystem
 * 4. Demographics & Population Social Ecosystem
 * 5. Government, Cabinet & Executive Institutional Ecosystem
 * 6. AI Cognitive Sovereign Personality Engine (10 Dimensions)
 * 7. Media, Propaganda & Narrative Ecosystem
 * 8. Corporate, Mega-Corp & PMC Ecosystem
 * 9. Scientific, Tech & Cyber Sovereignty Ecosystem
 * 10. Climate & Planetary Environment Ecosystem
 * 11. Multi-Tier Causal Graph Engine
 * 12. Structural Node Dependency Graph Engine
 * 13. Dynamic Multi-Stage Event Cascade Engine
 * 14. Multi-Scale Time Ticks (Realtime, Daily, Monthly, Yearly, Decadal)
 * 15. Meta World State Engine & Dynamic Emergent Relation Calculator
 * ============================================================================
 */

const _globalTarget = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global));
_globalTarget.WorldEcosystemEngine = (() => {
    // -------------------------------------------------------------------------
    // 1. ALLIANCES, STRATEGIC BLOCS & INFLUENCE SPHERES
    // -------------------------------------------------------------------------
    const STRATEGIC_BLOCS = {
        NATO: { id: "NATO", name: "NATO Military Alliance", icon: "🛡️", type: "military", core: ["USA", "GBR", "FRA", "DEU", "ITA", "TUR", "POL"] },
        EU: { id: "EU", name: "European Union", icon: "🇪🇺", type: "economic_political", core: ["DEU", "FRA", "ITA", "ESP", "POL", "BEL", "NLD"] },
        BRICS: { id: "BRICS", name: "BRICS+ Sovereign Economic Bloc", icon: "🌐", type: "economic", core: ["BRA", "RUS", "IND", "CHN", "ZAF", "EGY", "ETH", "IRN", "ARE"] },
        ASEAN: { id: "ASEAN", name: "Association of Southeast Asian Nations", icon: "🌏", type: "regional", core: ["IDN", "MYS", "SGP", "THA", "VNM", "PHL"] },
        AU: { id: "AU", name: "African Union", icon: "🌍", type: "continental", core: ["NGA", "ZAF", "EGY", "ETH", "KEN", "DZA"] },
        MERCOSUR: { id: "MERCOSUR", name: "Southern Common Market", icon: "🧉", type: "economic", core: ["BRA", "ARG", "PRY", "URY"] },
        SCO: { id: "SCO", name: "Shanghai Cooperation Organisation", icon: "🦅", type: "security", core: ["CHN", "RUS", "IND", "PAK", "KAZ", "IRN"] },
        GCC: { id: "GCC", name: "Gulf Cooperation Council", icon: "🕌", type: "economic_security", core: ["SAU", "ARE", "QAT", "KWT", "OMN", "BHR"] },
        AUKUS: { id: "AUKUS", name: "AUKUS Indo-Pacific Defense Pact", icon: "⚓", type: "military_tech", core: ["USA", "GBR", "AUS"] },
        OPEC: { id: "OPEC", name: "OPEC Petroleum Exporting Cartel", icon: "🛢️", type: "resource", core: ["SAU", "IRQ", "IRN", "ARE", "KWT", "DZA", "NGA"] },
        CSTO: { id: "CSTO", name: "Collective Security Treaty Organization", icon: "⚔️", type: "military", core: ["RUS", "BLR", "KAZ", "KGZ", "TJK"] }
    };

    // Global Strategic Chokepoints
    const CHOKEPOINTS = {
        MALACCA: { id: "MALACCA", name: "Strait of Malacca", icon: "🚢", flowPercentage: 25, guardians: ["MYS", "SGP", "IDN"], riskIndex: 18 },
        SUEZ: { id: "SUEZ", name: "Suez Canal", icon: "🌊", flowPercentage: 12, guardians: ["EGY"], riskIndex: 35 },
        HORMUZ: { id: "HORMUZ", name: "Strait of Hormuz", icon: "🛢️", flowPercentage: 21, guardians: ["IRN", "OMN", "ARE"], riskIndex: 68 },
        BAB_EL_MANDEB: { id: "BAB_EL_MANDEB", name: "Bab-el-Mandeb Strait", icon: "⚓", flowPercentage: 10, guardians: ["YEM", "DJI"], riskIndex: 82 },
        PANAMA: { id: "PANAMA", name: "Panama Canal", icon: "🇵🇦", flowPercentage: 5, guardians: ["PAN"], riskIndex: 22 },
        BOSPORUS: { id: "BOSPORUS", name: "Bosporus & Dardanelles", icon: "🇹🇷", flowPercentage: 4, guardians: ["TUR"], riskIndex: 45 },
        TAIWAN_STRAIT: { id: "TAIWAN_STRAIT", name: "Taiwan Strait", icon: "🔬", flowPercentage: 48, guardians: ["TWN", "CHN"], riskIndex: 85 },
        SUWALKI_GAP: { id: "SUWALKI_GAP", name: "Suwalki Gap", icon: "🌲", flowPercentage: 2, guardians: ["POL", "LTU"], riskIndex: 78 }
    };

    // Global Strategic Commodity Market Baseline
    const DEFAULT_GLOBAL_MARKET = Object.freeze({});
const GLOBAL_MARKET = {};

    // Helper for deterministic geographic and trait hashing (replaces Math.random)
    function getDeterministicHash(id) {
        let hash = 0;
        const str = String(id || "DEFAULT");
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    // -------------------------------------------------------------------------
    // 2. SOVEREIGN COUNTRY WORLD STATE REGISTRY WITH EPISTEMIC INTEGRITY
    // -------------------------------------------------------------------------
    let stateRegistry = {};
    let authoritativeState = null;

    function setAuthoritativeState(state) {
        if (!state || typeof state !== 'object') throw new Error("WORLD_AUTHORITY_STATE_REQUIRED");
        authoritativeState = state;
        if (!state.worldEcosystem || typeof state.worldEcosystem !== 'object') state.worldEcosystem = {};
        if (!state.worldEcosystem.countryProfiles || typeof state.worldEcosystem.countryProfiles !== 'object') {
            state.worldEcosystem.countryProfiles = {};
        }
        stateRegistry = state.worldEcosystem.countryProfiles;
        if (!state.worldEcosystem.market || typeof state.worldEcosystem.market !== 'object') {
            state.worldEcosystem.market = {};
        }
        Object.keys(GLOBAL_MARKET).forEach(k=>delete GLOBAL_MARKET[k]);Object.assign(GLOBAL_MARKET, state.worldEcosystem.market);
        state.worldEcosystem.market = GLOBAL_MARKET;

        if (!Array.isArray(state.worldEcosystem.causalEventLog)) state.worldEcosystem.causalEventLog = [];
        causalEventLog = state.worldEcosystem.causalEventLog;
        causalLogCounter = Number.isFinite(Number(state.worldEcosystem.causalLogCounter))
            ? Number(state.worldEcosystem.causalLogCounter)
            : 1;
        state.worldEcosystem.causalLogCounter = causalLogCounter;

        if (!state.simulation || typeof state.simulation !== 'object') state.simulation = {};
        if (!state.simulation.subsystemTurns || typeof state.simulation.subsystemTurns !== 'object') {
            state.simulation.subsystemTurns = {};
        }
        currentSimulationTick = Number.isFinite(Number(state.simulation.subsystemTurns.worldEcosystem))
            ? Number(state.simulation.subsystemTurns.worldEcosystem)
            : Number.isFinite(Number(state.simulation.turn))
                ? Number(state.simulation.turn)
                : 0;
        state.simulation.subsystemTurns.worldEcosystem = currentSimulationTick;
        return true;
    }

    /**
     * Epistemic metric resolver: distinguishes between verified numbers,
     * confirmed zero, and unknown/missing data without fabricating defaults.
     */
    function resolveEpistemicMetric(val, defaultIfMissing = null) {
        if (val === undefined || val === null) {
            return { value: defaultIfMissing, epistemicStatus: "MISSING" };
        }
        if (typeof val === 'object' && val.epistemicStatus) {
            return val;
        }
        const num = Number(val);
        if (isNaN(num)) {
            return { value: defaultIfMissing, epistemicStatus: "INVALID" };
        }
        if (num === 0) {
            return { value: 0, epistemicStatus: "ZERO" };
        }
        return { value: num, epistemicStatus: "VERIFIED_FACT" };
    }

    function createEpistemicResourceEntry(resvVal, invVal, prodVal, consVal) {
        const reserve = resolveEpistemicMetric(resvVal, null);
        const inventory = resolveEpistemicMetric(invVal, null);
        const prod = resolveEpistemicMetric(prodVal, null);
        const cons = resolveEpistemicMetric(consVal, null);

        let importNeedVal = null;
        if (cons.value !== null && prod.value !== null) {
            importNeedVal = Math.max(0, cons.value - prod.value);
        }

        return {
            reserve: reserve.value,
            reserveEpistemic: reserve.epistemicStatus,
            inventory: inventory.value,
            inventoryEpistemic: inventory.epistemicStatus,
            domesticProd: prod.value,
            prodEpistemic: prod.epistemicStatus,
            industrialReq: cons.value,
            reqEpistemic: cons.epistemicStatus,
            importNeed: importNeedVal,
            // Numerical accessors for backward-compatibility with UI / charts
            reserveBbl: reserve.value,
            reserveMcf: reserve.value,
            reserveTon: reserve.value,
            reserveUnits: reserve.value,
            reserveKg: reserve.value,
            reserveM3: reserve.value,
            inventoryBbl: inventory.value,
            inventoryMcf: inventory.value,
            inventoryTon: inventory.value,
            inventoryUnits: inventory.value,
            inventoryKg: inventory.value
        };
    }

    // Sovereign AI personality is runtime/data supplied. No country-specific synthetic profile is created here.

    let causalLogCounter = 1;
    let causalEventLog = [];

    /**
     * Initializes sovereign state profiles for countries with deterministic data derivation
     */
    function initCountryProfile(countryId) {
        const id = String(countryId || '').trim().toUpperCase();
        if (!id) return null;
        if (stateRegistry[id]) return stateRegistry[id];

        const state = authoritativeState || _globalTarget.Game?.state || _globalTarget.gameState || {};
        const registry = _globalTarget.OmegaCanonicalIdentityRegistry || _globalTarget.OmegaCountrySemanticBridge || null;
        let canonical = null;
        try { canonical = registry?.resolveCountry?.(id)?.raw || registry?.resolveCountry?.(id) || null; } catch (_) {}

        const aliases = [...new Set([id, canonical?.id, canonical?.code, canonical?.iso2, canonical?.iso3, canonical?.name, canonical?.countryName].filter(Boolean).map(x => String(x).toUpperCase()))];
        const bucket = (domain) => {
            const section = state?.[domain];
            if (!section || typeof section !== 'object') return null;
            for (const key of aliases) {
                if (section[key] !== undefined) return section[key];
                const found = Object.keys(section).find(k => String(k).toUpperCase() === key);
                if (found !== undefined) return section[found];
            }
            return null;
        };

        let resState = null;
        try {
            const engine = _globalTarget.ResourceMinistryEngine;
            if (engine?.getIntegratedResourceState) resState = engine.getIntegratedResourceState(id) || null;
        } catch (_) {}

        const inv = resState?.inventory || {}, prod = resState?.production || {}, cons = resState?.consumption || {}, resv = resState?.reserves || {};
        const resourceIds = [...new Set([...Object.keys(inv), ...Object.keys(prod), ...Object.keys(cons), ...Object.keys(resv)])];
        const resources = {};
        for (const rid of resourceIds) {
            resources[rid] = createEpistemicResourceEntry(resv[rid], inv[rid], prod[rid], cons[rid]);
        }

        const pop = bucket('population') || {};
        const econ = bucket('economy') || {};
        const geography = bucket('geography') || {};
        const government = bucket('government') || bucket('interior') || {};
        const media = bucket('media') || {};
        const corporate = bucket('corporate') || {};
        const tech = bucket('technology') || bucket('tech') || {};
        const environment = bucket('environment') || {};
        const ai = bucket('aiPersonality') || bucket('ai') || null;

        stateRegistry[id] = {
            id,
            geography: {
                borderLengthKm: pop?.borderLengthKm ?? geography?.borderLengthKm ?? null,
                borderShapeComplexity: geography?.borderShapeComplexity ?? null,
                mountainBarrierRating: geography?.mountainBarrierRating ?? null,
                riverBarrierDefense: geography?.riverBarrierDefense ?? null,
                isLandlocked: geography?.isLandlocked ?? null,
                deepSeaPortQuality: geography?.deepSeaPortQuality ?? null,
                chokepointControl: Array.isArray(geography?.chokepointControl) ? [...geography.chokepointControl] : [],
                terrainDifficulty: geography?.terrainDifficulty ?? null
            },
            resources,
            population: {
                total: pop?.population_2015 ?? pop?.total ?? null,
                totalEpistemic: pop?.population_2015 !== undefined || pop?.total !== undefined ? 'VERIFIED_FACT' : 'MISSING',
                urbanizationRate: pop?.urbanization_rate ?? pop?.urbanizationRate ?? null,
                educationIndex: pop?.educationIndex ?? null,
                healthcareIndex: pop?.healthcareIndex ?? null,
                happinessScore: pop?.happinessScore ?? null,
                radicalizationIndex: pop?.radicalizationIndex ?? null,
                nationalismIndex: pop?.nationalismIndex ?? null,
                povertyRate: pop?.povertyRate ?? null,
                middleClassShare: pop?.middleClassShare ?? null,
                eliteClassShare: pop?.eliteClassShare ?? null,
                refugeeInflowAnnual: pop?.refugeeInflowAnnual ?? null,
                youthBulgeRatio: pop?.youthBulgeRatio ?? null,
                veteransCount: pop?.veteransCount ?? null
            },
            economy: {
                gdp: econ?.gdp ?? econ?.nominal_gdp ?? null,
                gdpEpistemic: econ?.gdp !== undefined || econ?.nominal_gdp !== undefined ? 'VERIFIED_FACT' : 'MISSING',
                gdpGrowth: econ?.gdp_growth ?? null,
                inflation: econ?.inflation ?? null,
                unemploymentRate: econ?.unemployment_rate ?? null,
                budgetBalance: econ?.budget_balance ?? null,
                debt: econ?.debt ?? null,
                tradeBalance: econ?.trade_balance ?? null,
                exchangeRateUsd: econ?.exchange_rate_usd ?? null,
                reserves: econ?.reserves ?? null
            },
            government: government && typeof government === 'object' ? CLONE(government) : {},
            aiPersonality: ai && typeof ai === 'object' ? CLONE(ai) : null,
            media: media && typeof media === 'object' ? CLONE(media) : {},
            corporate: corporate && typeof corporate === 'object' ? CLONE(corporate) : {},
            tech: tech && typeof tech === 'object' ? CLONE(tech) : {},
            environment: environment && typeof environment === 'object' ? CLONE(environment) : {},
            blocs: Array.isArray(bucket('blocs')) ? [...bucket('blocs')] : [],
            influenceSphere: bucket('influenceSphere') ?? null
        };

        return stateRegistry[id];
    }

    // -------------------------------------------------------------------------
    // 3. MULTI-NODE CAUSAL GRAPH ENGINE
    // -------------------------------------------------------------------------

    /**
     * Executes a cascading multi-tier causal chain reaction across the world ecosystem.
     * @param {Object} triggerEvent - { originCountry, type, severity, targetCountry }
     */
    function triggerCausalCascade(triggerEvent = {}) {
        const origin = String(triggerEvent.originCountry || '').trim().toUpperCase();
        const target = String(triggerEvent.targetCountry || '').trim().toUpperCase();
        const eventType = String(triggerEvent.type || '').trim();
        if (!origin || !target || !eventType) throw new Error("CAUSAL_EVENT_SCOPE_REQUIRED");

        const impactedNodes = [...new Set([...(triggerEvent.impactedNodes || []), ...(triggerEvent.impactedSignals || []), ...(triggerEvent.domains || [])].map(String).filter(Boolean))];
        const declaredSteps = Array.isArray(triggerEvent.steps) ? triggerEvent.steps.map(CLONE) : [];
        const cascadeSteps = declaredSteps.length ? declaredSteps : impactedNodes.map((node, index) => ({
            step: index + 1,
            layer: 'CAUSAL_PROPAGATION',
            node,
            impact: 'PENDING_CAUSAL_EXECUTOR',
            source: triggerEvent.provenance || null
        }));

        const logEntry = {
            id: 'CAUSAL_LOG_' + currentSimulationTick + '_' + causalLogCounter++,
            timestamp: new Date().toISOString(),
            origin, target, eventType,
            severity: triggerEvent.severity ?? null,
            status: 'RECORDED_NO_SYNTHETIC_MUTATION',
            impactedNodes,
            steps: cascadeSteps
        };
        if (authoritativeState?.worldEcosystem) authoritativeState.worldEcosystem.causalLogCounter = causalLogCounter;
        causalEventLog.unshift(logEntry);
        if (causalEventLog.length > 50) causalEventLog.pop();
        if (typeof _globalTarget.dispatchEvent === 'function') {
            try { _globalTarget.dispatchEvent(new CustomEvent('CAUSAL_CASCADE_EXECUTED', { detail: logEntry })); } catch (_) {}
        }
        return logEntry;
    }

    // -------------------------------------------------------------------------
    // 4. STRUCTURAL NODE DEPENDENCY GRAPH ENGINE
    // -------------------------------------------------------------------------
    /**
     * Inspects the full dependency tree for a strategic node (e.g., Missile Defense, Chip Fab, Energy Grid)
     */
    function inspectNodeDependencyTree(countryId, nodeType = null) {
        const id = String(countryId || '').trim().toUpperCase();
        if (!id) return { status: 'UNKNOWN', country: null, dependencies: [], reason: 'COUNTRY_ID_REQUIRED' };

        const state = authoritativeState || _globalTarget.Game?.state || _globalTarget.gameState || {};
        const world = state?.worldEcosystem || {};
        const explicit = world?.dependencyGraph?.[id] || world?.dependencies?.[id] || null;
        if (!explicit || typeof explicit !== 'object') {
            return {
                status: 'UNKNOWN',
                country: id,
                nodeType: nodeType || null,
                dependencies: [],
                reason: 'DEPENDENCY_DATA_UNAVAILABLE'
            };
        }

        const node = nodeType ? explicit[nodeType] : explicit;
        if (!node) {
            return {
                status: 'UNKNOWN',
                country: id,
                nodeType,
                dependencies: [],
                reason: 'NODE_DEPENDENCY_DATA_UNAVAILABLE'
            };
        }

        return {
            status: 'OBSERVED',
            country: id,
            nodeType: nodeType || null,
            dependencies: Array.isArray(node.dependencies) ? CLONE(node.dependencies) : [],
            source: 'AUTHORITATIVE_WORLD_STATE'
        };
    }

    // -------------------------------------------------------------------------
    // 5. META WORLD STATE & EMERGENT RELATION GENERATOR
    // -------------------------------------------------------------------------
    /**
     * Replaces static relation lookup with real-time emergent calculation
     */
    function computeEmergentRelation(countryA, countryB) {
        const idA = String(countryA || '').trim().toUpperCase();
        const idB = String(countryB || '').trim().toUpperCase();
        if (!idA || !idB) return { status: 'UNKNOWN', score: null, reason: 'COUNTRY_ID_REQUIRED' };
        if (idA === idB) return { status: 'VERIFIED_SELF_RELATION', score: 100 };

        const state = authoritativeState || _globalTarget.Game?.state || _globalTarget.gameState || {};
        const relations = state?.relations || state?.foreign?.relations || {};
        const rowA = relations?.[idA] || relations?.[idA.toLowerCase()] || relations?.[idA.replace(/-/g, '_')] || null;
        const rowB = rowA?.[idB] || rowA?.[idB.toLowerCase()] || null;
        const score = Number(rowB?.overall ?? rowB?.score ?? rowB);
        if (Number.isFinite(score)) return { status: 'OBSERVED_RELATION', score, source: 'AUTHORITATIVE_RUNTIME_STATE' };
        return { status: 'UNKNOWN', score: null, reason: 'RELATION_DATA_UNAVAILABLE' };
    }

    // -------------------------------------------------------------------------
    // 6. MULTI-SCALE TIME TICK SIMULATION ENGINE
    // -------------------------------------------------------------------------
    let currentSimulationTick = 0;

    function processSimulationTick(dt, targetTurn) {
        const next = Number.isFinite(Number(targetTurn)) ? Number(targetTurn) : currentSimulationTick + 1;
        if (next <= currentSimulationTick) return { tick: currentSimulationTick, advanced: false, countriesProcessed: Object.keys(stateRegistry).length, syntheticMutations: 0 };
        currentSimulationTick = next;
        if (authoritativeState?.simulation?.subsystemTurns) authoritativeState.simulation.subsystemTurns.worldEcosystem = currentSimulationTick;
        return { tick: currentSimulationTick, advanced: true, countriesProcessed: Object.keys(stateRegistry).length, syntheticMutations: 0 };
    }

    // -------------------------------------------------------------------------
    // 7. DETERMINISTIC SAVE / LOAD STATE CONTRACT
    // -------------------------------------------------------------------------
    function exportSaveState(saveMetadata = {}) {
        return {
            engineVersion: "1.0.0",
            savedAt: new Date().toISOString(),
            currentSimulationTick,
            causalLogCounter,
            globalMarket: JSON.parse(JSON.stringify(GLOBAL_MARKET)),
            registeredCountries: Object.keys(stateRegistry),
            stateRegistry: JSON.parse(JSON.stringify(stateRegistry)),
            causalEventLog: JSON.parse(JSON.stringify(causalEventLog)),
            metadata: saveMetadata
        };
    }

    function importSaveState(saveObj) {
        if (!saveObj || typeof saveObj !== 'object') {
            throw new Error("Invalid save state format");
        }
        if (saveObj.currentSimulationTick !== undefined) {
            currentSimulationTick = Number(saveObj.currentSimulationTick);
        }
        if (saveObj.causalLogCounter !== undefined) {
            causalLogCounter = Number(saveObj.causalLogCounter);
        }
        if (saveObj.globalMarket && typeof saveObj.globalMarket === 'object') {
            Object.assign(GLOBAL_MARKET, saveObj.globalMarket);
        }
        if (saveObj.stateRegistry && typeof saveObj.stateRegistry === 'object') {
            Object.keys(saveObj.stateRegistry).forEach(k => {
                stateRegistry[k] = saveObj.stateRegistry[k];
            });
        }
        if (Array.isArray(saveObj.causalEventLog)) {
            causalEventLog.length = 0;
            causalEventLog.push(...saveObj.causalEventLog);
        }
        return {
            success: true,
            tick: currentSimulationTick,
            countriesLoaded: Object.keys(stateRegistry).length
        };
    }

    // Public Interface
    return {
        STRATEGIC_BLOCS,
        CHOKEPOINTS,
        GLOBAL_MARKET,
        setAuthoritativeState,
        getAuthoritativeState: () => authoritativeState,
        getCountryProfile: initCountryProfile,
        computeEmergentRelation,
        triggerCausalCascade,
        inspectNodeDependencyTree,
        getCausalEventLog: () => causalEventLog,
        processSimulationTick,
        exportSaveState,
        importSaveState
    };
})();

console.log("[ECOSYSTEM] World Ecosystem & Causal Dependency Engine Initialized.");
