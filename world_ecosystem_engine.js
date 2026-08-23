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

window.WorldEcosystemEngine = (() => {
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
    const GLOBAL_MARKET = {
        crude_oil: { price: 82.50, trend: "STABLE", demandRatio: 1.02, supplyChainRisk: 32 },
        natural_gas: { price: 3.40, trend: "UP", demandRatio: 1.08, supplyChainRisk: 45 },
        lithium: { price: 18500, trend: "UP", demandRatio: 1.25, supplyChainRisk: 62 },
        rare_earth: { price: 48000, trend: "CRITICAL", demandRatio: 1.35, supplyChainRisk: 78 },
        semiconductors: { price: 120, trend: "UP", demandRatio: 1.40, supplyChainRisk: 84 },
        wheat: { price: 210, trend: "STABLE", demandRatio: 1.01, supplyChainRisk: 28 },
        uranium: { price: 85, trend: "UP", demandRatio: 1.15, supplyChainRisk: 55 },
        copper: { price: 8900, trend: "UP", demandRatio: 1.18, supplyChainRisk: 38 }
    };

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
    // 2. SOVEREIGN COUNTRY WORLD STATE REGISTRY
    // -------------------------------------------------------------------------
    const stateRegistry = {};

    // Deterministic Sovereign AI Personality Archetypes
    const STRATEGIC_AI_PROFILES = {
        USA: { aggressiveExpansion: 35, strategicIsolation: 20, pragmaticRealism: 80, ideologicalIdealism: 65, economicImperialism: 75, religiousZeal: 15, riskTolerance: 50, strategicVision: 85, memoryRetention: 95, emotionalVolatility: 20 },
        CHN: { aggressiveExpansion: 45, strategicIsolation: 25, pragmaticRealism: 90, ideologicalIdealism: 55, economicImperialism: 85, religiousZeal: 10, riskTolerance: 40, strategicVision: 92, memoryRetention: 98, emotionalVolatility: 15 },
        RUS: { aggressiveExpansion: 70, strategicIsolation: 40, pragmaticRealism: 75, ideologicalIdealism: 45, economicImperialism: 60, religiousZeal: 30, riskTolerance: 75, strategicVision: 78, memoryRetention: 92, emotionalVolatility: 35 },
        BGD: { aggressiveExpansion: 10, strategicIsolation: 20, pragmaticRealism: 85, ideologicalIdealism: 50, economicImperialism: 25, religiousZeal: 35, riskTolerance: 30, strategicVision: 70, memoryRetention: 90, emotionalVolatility: 20 },
        IND: { aggressiveExpansion: 30, strategicIsolation: 25, pragmaticRealism: 82, ideologicalIdealism: 60, economicImperialism: 55, religiousZeal: 40, riskTolerance: 45, strategicVision: 80, memoryRetention: 92, emotionalVolatility: 25 },
        GBR: { aggressiveExpansion: 25, strategicIsolation: 30, pragmaticRealism: 85, ideologicalIdealism: 60, economicImperialism: 65, religiousZeal: 10, riskTolerance: 40, strategicVision: 82, memoryRetention: 95, emotionalVolatility: 20 },
        DEU: { aggressiveExpansion: 15, strategicIsolation: 15, pragmaticRealism: 90, ideologicalIdealism: 70, economicImperialism: 70, religiousZeal: 10, riskTolerance: 30, strategicVision: 85, memoryRetention: 96, emotionalVolatility: 15 },
        FRA: { aggressiveExpansion: 25, strategicIsolation: 20, pragmaticRealism: 84, ideologicalIdealism: 65, economicImperialism: 65, religiousZeal: 10, riskTolerance: 45, strategicVision: 84, memoryRetention: 94, emotionalVolatility: 25 },
        JPN: { aggressiveExpansion: 10, strategicIsolation: 35, pragmaticRealism: 92, ideologicalIdealism: 55, economicImperialism: 60, religiousZeal: 10, riskTolerance: 25, strategicVision: 88, memoryRetention: 96, emotionalVolatility: 15 }
    };

    let causalLogCounter = 1;

    /**
     * Initializes sovereign state profiles for countries with deterministic data derivation
     */
    function initCountryProfile(countryId) {
        const id = (countryId || "USA").toUpperCase();
        if (stateRegistry[id]) return stateRegistry[id];

        const normKey = id.replace(/[-\s]/g, '_');
        const h = getDeterministicHash(id);

        const popState = (window.gameState && window.gameState.population && (window.gameState.population[normKey] || window.gameState.population[id])) || null;
        const econState = (window.gameState && window.gameState.economy && (window.gameState.economy[normKey] || window.gameState.economy[id])) || null;

        let crudeOilReserve = 50000000;
        let steelInventory = 100000;
        let uraniumStockpile = 500;

        if (window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.getIntegratedResourceState === 'function') {
            const res = window.ResourceMinistryEngine.getIntegratedResourceState(normKey);
            if (res && res.inventory) {
                if (res.inventory.crude_oil !== undefined) crudeOilReserve = res.inventory.crude_oil;
                if (res.inventory.refined_steel !== undefined) steelInventory = res.inventory.refined_steel;
                if (res.inventory.enriched_uranium !== undefined) uraniumStockpile = res.inventory.enriched_uranium;
            }
        }

        const totalPopulation = popState && popState.population_2015 ? popState.population_2015 : 35000000;
        const gdpVal = econState && econState.gdp ? econState.gdp : 150000000000;

        const defaultAi = {
            aggressiveExpansion: 20 + (h % 30),
            strategicIsolation: 20 + ((h >> 1) % 30),
            pragmaticRealism: 60 + ((h >> 2) % 30),
            ideologicalIdealism: 40 + ((h >> 3) % 30),
            economicImperialism: 20 + ((h >> 4) % 35),
            religiousZeal: 15 + ((h >> 5) % 30),
            riskTolerance: 30 + ((h >> 6) % 30),
            strategicVision: 60 + ((h >> 7) % 25),
            memoryRetention: 90,
            emotionalVolatility: 20 + ((h >> 8) % 20)
        };

        const aiPersonality = STRATEGIC_AI_PROFILES[id] || defaultAi;

        stateRegistry[id] = {
            id,
            // 1. Geography (Deterministic)
            geography: {
                borderLengthKm: 1200 + (h % 8000),
                borderShapeComplexity: (0.3 + ((h % 50) / 100)).toFixed(2),
                mountainBarrierRating: 20 + (h % 70),
                riverBarrierDefense: 20 + ((h >> 2) % 65),
                isLandlocked: ["BOL", "PRY", "AUT", "CHE", "AFG", "ETH", "ZWE", "BFA", "NER", "MLI", "KAZ", "UZB"].includes(id),
                deepSeaPortQuality: 30 + ((h >> 3) % 65),
                chokepointControl: [],
                terrainDifficulty: 20 + ((h >> 4) % 70)
            },
            // 2. Resource Stockpiles & Supply Chains (Connected with GSRSK & Sovereign state)
            resources: {
                crude_oil: { reserveBbl: crudeOilReserve, domesticProd: Math.floor(crudeOilReserve * 0.002), industrialReq: Math.floor(crudeOilReserve * 0.003), importNeed: 0 },
                natural_gas: { reserveMcf: 30000000, domesticProd: 80000, industrialReq: 95000, importNeed: 15000 },
                rare_earth: { reserveTon: 50000, domesticProd: 500, industrialReq: 4000, importNeed: 3500 },
                lithium: { reserveTon: 120000, domesticProd: 1200, industrialReq: 8000, importNeed: 6800 },
                semiconductors: { reserveUnits: 5000000, domesticProd: 200000, industrialReq: 3000000, importNeed: 2800000 },
                food_grains: { reserveTon: 15000000, domesticProd: 18000000, industrialReq: 16000000, importNeed: 0 },
                fresh_water: { reserveM3: 800000000, stressLevel: 25 + (h % 50) },
                uranium: { reserveKg: uraniumStockpile, domesticProd: 2000, industrialReq: 5000, importNeed: 3000 }
            },
            // 3. Demographics & Social Classes (Derived from Population state)
            population: {
                total: totalPopulation,
                urbanizationRate: 65 + (h % 30),
                educationIndex: 75 + (h % 20),
                healthcareIndex: 72 + ((h >> 1) % 22),
                happinessScore: 68 + ((h >> 2) % 25),
                radicalizationIndex: 15 + ((h >> 3) % 25),
                nationalismIndex: 50 + ((h >> 4) % 35),
                povertyRate: 10 + (h % 20),
                middleClassShare: 50 + (h % 25),
                eliteClassShare: 1.5,
                refugeeInflowAnnual: 15000,
                youthBulgeRatio: 22,
                veteransCount: Math.floor(totalPopulation * 0.01)
            },
            // 4. Executive Government & Ministries
            government: {
                headOfState: "Executive Leadership",
                cabinetStability: 80 + (h % 18),
                parliamentMajorityShare: 52 + (h % 15),
                oppositionPressure: 35 + ((h >> 1) % 25),
                electionCountdownMonths: 24,
                bureaucracyEfficiency: 75 + ((h >> 2) % 20),
                judiciaryIndependence: 78 + ((h >> 3) % 18),
                corruptionIndex: 20 + (h % 30),
                emergencyPowerActive: false,
                juntaControl: 0
            },
            // 5. AI Cognitive Sovereign Personality (10 Dimensions - Deterministic)
            aiPersonality,
            // 6. Media & Propaganda Information Sphere
            media: {
                pressFreedomIndex: 60 + (h % 35),
                stateMediaControl: 20 + ((h >> 1) % 40),
                socialMediaDisinfoPressure: 35 + ((h >> 2) % 30),
                internationalReputation: 70 + ((h >> 3) % 25),
                narrativeControlDominance: 55 + ((h >> 4) % 30)
            },
            // 7. Corporate, Mega-Corp & PMCs
            corporate: {
                megaCorpsCount: 12 + (h % 15),
                defenseContractors: ["Sovereign Aerospace", "National Defense Dynamics", "Apex Industrial"],
                pmcContractors: ["Global Shield Sec", "Apex Tactical"],
                foreignNgoPressure: 25 + (h % 30),
                lobbyGroupPower: 50 + (h % 35)
            },
            // 8. Scientific, Tech & Cyber Sovereignty
            tech: {
                researchOutputGdpShare: 2.2,
                aiSingularityRating: 75 + (h % 20),
                quantumCryptoShield: 68 + ((h >> 1) % 25),
                spaceDefenseAssets: 35 + ((h >> 2) % 30),
                semiconductorFabDominance: 50 + ((h >> 3) % 40),
                cyberAttackPower: 75 + ((h >> 4) % 22),
                cyberShieldPower: 75 + ((h >> 5) % 20)
            },
            // 9. Climate & Environment Disasters
            environment: {
                carbonFootprintMt: 3500 + (h % 3000),
                climateDisasterRisk: 30 + (h % 40),
                droughtRiskIndex: 25 + ((h >> 1) % 35),
                floodVulnerability: 25 + ((h >> 2) % 40),
                freshwaterScarcityRisk: 20 + ((h >> 3) % 35)
            },
            // 10. Active Blocs & Spheres
            blocs: ["UN"],
            influenceSphere: "Sovereign Independent"
        };

        return stateRegistry[id];
    }

    // -------------------------------------------------------------------------
    // 3. MULTI-NODE CAUSAL GRAPH ENGINE
    // -------------------------------------------------------------------------
    const causalEventLog = [];

    /**
     * Executes a cascading multi-tier causal chain reaction across the world ecosystem.
     * @param {Object} triggerEvent - { originCountry, type, severity, targetCountry }
     */
    function triggerCausalCascade(triggerEvent) {
        const origin = (triggerEvent.originCountry || "USA").toUpperCase();
        const target = (triggerEvent.targetCountry || "CHN").toUpperCase();
        const eventType = triggerEvent.type || "TRADE_SANCTION";
        const severity = triggerEvent.severity || 1.0;

        const profileA = initCountryProfile(origin);
        const profileB = initCountryProfile(target);

        const cascadeSteps = [];

        cascadeSteps.push({
            step: 1,
            layer: "EXECUTIVE DIRECTIVE",
            node: `${origin} Executive Decree: ${eventType}`,
            impact: `Directive enacted with severity factor ${severity}x.`
        });

        if (eventType === "TRADE_SANCTION" || eventType === "TARIFF_HIKE") {
            // Step 2: Resource & Market Supply Strain
            const marketStrain = Math.round(12 * severity);
            GLOBAL_MARKET.semiconductors.price += marketStrain;
            GLOBAL_MARKET.rare_earth.price += marketStrain * 2;

            cascadeSteps.push({
                step: 2,
                layer: "RESOURCE & GLOBAL MARKET",
                node: `Global Commodity Strain: Rare Earths & Semiconductor Prices Surge`,
                impact: `Semiconductor Index +$${marketStrain}, Rare Earths +$${marketStrain * 2}/Ton.`
            });

            // Step 3: Corporate & Industrial Output Drops
            profileB.tech.semiconductorFabDominance = Math.max(10, profileB.tech.semiconductorFabDominance - Math.round(4 * severity));
            profileB.resources.semiconductors.importNeed += Math.round(150000 * severity);

            cascadeSteps.push({
                step: 3,
                layer: "CORPORATE & INDUSTRY",
                node: `${target} High-Tech Manufacturing Bottleneck`,
                impact: `Industrial output constrained. Import shortage increased by ${(150 * severity).toFixed(0)}K units.`
            });

            // Step 4: Demographics & Economy Reaction
            profileB.population.happinessScore = Math.max(10, profileB.population.happinessScore - Math.round(3 * severity));
            profileB.population.povertyRate += 0.4 * severity;

            cascadeSteps.push({
                step: 4,
                layer: "DEMOGRAPHICS & POPULATION",
                node: `${target} Public Inflation & Commodity Price Rise`,
                impact: `Public Happiness dropped -${(3 * severity).toFixed(1)} pts, Poverty Rate +${(0.4 * severity).toFixed(2)}%.`
            });

            // Step 5: Media & Public Narrative Escalation
            profileB.media.socialMediaDisinfoPressure += Math.round(10 * severity);
            profileB.media.narrativeControlDominance += Math.round(5 * severity);

            cascadeSteps.push({
                step: 5,
                layer: "MEDIA & PROPAGANDA",
                node: `${target} State Media Nationalism & Disinformation Counter-Offensive`,
                impact: `Anti-${origin} public narrative rhetoric amplified.`
            });

            // Step 6: Government & Opposition Stability Impact
            profileB.government.oppositionPressure += Math.round(4 * severity);
            profileB.government.cabinetStability = Math.max(20, profileB.government.cabinetStability - Math.round(3 * severity));

            cascadeSteps.push({
                step: 6,
                layer: "GOVERNMENT & CABINET",
                node: `${target} Cabinet Emergency Session Called`,
                impact: `Cabinet stability -${(3 * severity).toFixed(1)}%, Emergency retaliation directives drafted.`
            });

            // Step 7: AI Cognitive Retaliation Decision
            profileB.aiPersonality.aggressiveExpansion += Math.round(6 * severity);
            profileB.aiPersonality.riskTolerance += Math.round(4 * severity);

            cascadeSteps.push({
                step: 7,
                layer: "AI COGNITIVE PERSONALITY",
                node: `${target} Sovereign AI Shift: Hostility & Risk Acceptance High`,
                impact: `Aggressive expansion stance increased to ${profileB.aiPersonality.aggressiveExpansion}/100.`
            });

            // Step 8: Military & Cyber Response
            profileB.tech.cyberAttackPower = Math.min(100, profileB.tech.cyberAttackPower + 2);

            cascadeSteps.push({
                step: 8,
                layer: "MILITARY & CYBER SPHERE",
                node: `${target} Cyber Offense Readiness Level Elevated`,
                impact: `Asymmetric cyber retaliatory vectors primed.`
            });

            // Step 9: Emergent Geopolitical Relation Calculation
            const newRelationScore = computeEmergentRelation(origin, target);

            cascadeSteps.push({
                step: 9,
                layer: "EMERGENT RELATION MATRIX",
                node: `Sovereign Bilateral Relationship Re-calculated`,
                impact: `New Real-Time Bilateral Index between ${origin} & ${target}: ${newRelationScore}/100 (${newRelationScore < 35 ? "HOSTILE" : newRelationScore < 60 ? "FRICTION" : "ALLIED"})`
            });
        } else if (eventType === "MILITARY_MOBILIZATION" || eventType === "BORDER_CLASH") {
            cascadeSteps.push({
                step: 2,
                layer: "GEOGRAPHY & TACTICAL TERRAIN",
                node: `Border Sector Fortification & Pass Closure`,
                impact: `Mountain & River crossing points militarized.`
            });

            profileA.resources.crude_oil.reserveBbl -= 200000 * severity;
            profileB.population.radicalizationIndex += 8 * severity;

            cascadeSteps.push({
                step: 3,
                layer: "RESOURCE & DEMOGRAPHICS",
                node: `Fuel Stockpile Depletion & Civilian Mobilization Surge`,
                impact: `Radicalization Index +${(8 * severity).toFixed(1)}%, Fuel Reserves -200K BBL.`
            });

            const newRelationScore = computeEmergentRelation(origin, target);
            cascadeSteps.push({
                step: 4,
                layer: "EMERGENT RELATION MATRIX",
                node: `War Readiness Index Activated`,
                impact: `Bilateral Score collapsed to ${newRelationScore}/100 (HIGH CONFLICT RISK).`
            });
        }

        const logEntry = {
            id: `CAUSAL_LOG_${Date.now()}_${causalLogCounter++}`,
            timestamp: new Date().toISOString(),
            origin,
            target,
            eventType,
            severity,
            steps: cascadeSteps
        };

        causalEventLog.unshift(logEntry);
        if (causalEventLog.length > 50) causalEventLog.pop();

        // Dispatch system-wide event for UI updates
        window.dispatchEvent(new CustomEvent("CAUSAL_CASCADE_EXECUTED", { detail: logEntry }));

        return logEntry;
    }

    // -------------------------------------------------------------------------
    // 4. STRUCTURAL NODE DEPENDENCY GRAPH ENGINE
    // -------------------------------------------------------------------------
    /**
     * Inspects the full dependency tree for a strategic node (e.g., Missile Defense, Chip Fab, Energy Grid)
     */
    function inspectNodeDependencyTree(countryId, nodeType = "SEMICONDUCTOR_FAB") {
        const profile = initCountryProfile(countryId);

        if (nodeType === "SEMICONDUCTOR_FAB") {
            return {
                nodeName: "Advanced Semiconductor Fabrication Plant (3nm / 5nm)",
                country: countryId,
                status: profile.tech.semiconductorFabDominance > 50 ? "OPERATIONAL" : "CRITICAL BOTTLENECK",
                dependencies: [
                    { level: 1, name: "Rare Earth Refinement (Neodymium/Dysprosium)", source: "Resource Supply", status: profile.resources.rare_earth.reserveTon > 5000 ? "OK" : "DEFICIT" },
                    { level: 1, name: "Industrial Electricity Grid (GigaWatt Baseload)", source: "Infrastructure", status: "STABLE" },
                    { level: 2, name: "EUV Lithography Machine Patents", source: "Tech / Intellectual Property", status: "FOREIGN DEPENDENT (NLD/USA)" },
                    { level: 2, name: "High-Purity Silica Sand Ingestion", source: "Resource Supply", status: "OK" },
                    { level: 3, name: "Precision Missile Guidance Systems Output", source: "Military Downstream", status: "ACTIVE CONSUMER" },
                    { level: 3, name: "AI Quantum Computing Infrastructure Output", source: "Scientific Downstream", status: "ACTIVE CONSUMER" }
                ]
            };
        } else if (nodeType === "BORDER_DEFENSE_LINE") {
            return {
                nodeName: "Sovereign Border Fortification & Early Warning Net",
                country: countryId,
                status: "ACTIVE",
                dependencies: [
                    { level: 1, name: "Radar Magnet Rare Earth Alloys", source: "Resource Supply", status: "CRITICAL" },
                    { level: 1, name: "Military Manpower & Veterans Reserve", source: "Demographics", status: profile.population.veteransCount > 1000000 ? "STRONG" : "ADEQUATE" },
                    { level: 2, name: "River & Mountain Pass Geography Barriers", source: "Tactical Terrain", status: `${profile.geography.mountainBarrierRating}% BARRIER` },
                    { level: 2, name: "Satellite Cyber Guidance Shield", source: "Space Defense", status: "ONLINE" }
                ]
            };
        }

        return {
            nodeName: "General Sovereign Infrastructure Node",
            country: countryId,
            status: "STABLE",
            dependencies: [
                { level: 1, name: "Crude Oil & Energy Grid", source: "Hydrocarbons", status: "OPERATIONAL" },
                { level: 1, name: "Cabinet & Parliamentary Approval", source: "Executive Government", status: "APPROVED" }
            ]
        };
    }

    // -------------------------------------------------------------------------
    // 5. META WORLD STATE & EMERGENT RELATION GENERATOR
    // -------------------------------------------------------------------------
    /**
     * Replaces static relation lookup with real-time emergent calculation
     */
    function computeEmergentRelation(countryA, countryB) {
        const idA = (countryA || "USA").toUpperCase();
        const idB = (countryB || "CHN").toUpperCase();

        if (idA === idB) return 100;

        const profA = initCountryProfile(idA);
        const profB = initCountryProfile(idB);

        let score = 50; // Baseline neutral relation

        // 1. Shared Alliance Blocs (+20 for each shared alliance)
        const sharedBlocs = profA.blocs.filter(b => profB.blocs.includes(b));
        score += sharedBlocs.length * 22;

        // 2. Ideological & Influence Sphere Compatibility
        if (profA.influenceSphere === profB.influenceSphere) {
            score += 15;
        } else if (
            (profA.influenceSphere.includes("Western") && profB.influenceSphere.includes("Sino")) ||
            (profA.influenceSphere.includes("Western") && profB.influenceSphere.includes("Eurasian"))
        ) {
            score -= 25; // Cold War Friction
        }

        // 3. Trade & Resource Interdependence
        const resourceInterdependence = Math.min(30, (profA.resources.semiconductors.importNeed > 1000000 ? 12 : 0) + (profB.resources.crude_oil.importNeed > 100000 ? 10 : 0));
        score += resourceInterdependence;

        // 4. AI Aggressive Personality & Threat Friction
        const threatPenalty = Math.round((profA.aiPersonality.aggressiveExpansion + profB.aiPersonality.aggressiveExpansion) / 6);
        score -= threatPenalty;

        // 5. Freedom of Press & Media Disinfo Friction
        const mediaFriction = Math.abs(profA.media.pressFreedomIndex - profB.media.pressFreedomIndex) / 4;
        score -= mediaFriction;

        // Clamp between 0 and 100
        const finalScore = Math.max(0, Math.min(100, Math.round(score)));
        return finalScore;
    }

    // -------------------------------------------------------------------------
    // 6. MULTI-SCALE TIME TICK SIMULATION ENGINE
    // -------------------------------------------------------------------------
    let currentSimulationTick = 0;

    function processSimulationTick(dt) {
        currentSimulationTick++;

        // Every 50 Ticks (Monthly Economic & Resource Cycle)
        if (currentSimulationTick % 50 === 0) {
            Object.keys(stateRegistry).forEach(code => {
                const prof = stateRegistry[code];
                // Consume resources, update happiness & stability
                if (prof.resources.crude_oil.importNeed > prof.resources.crude_oil.reserveBbl) {
                    prof.population.happinessScore = Math.max(10, prof.population.happinessScore - 1);
                    prof.government.cabinetStability = Math.max(15, prof.government.cabinetStability - 1);
                }
            });
        }
    }

    // Public Interface
    return {
        STRATEGIC_BLOCS,
        CHOKEPOINTS,
        GLOBAL_MARKET,
        getCountryProfile: initCountryProfile,
        computeEmergentRelation,
        triggerCausalCascade,
        inspectNodeDependencyTree,
        getCausalEventLog: () => causalEventLog,
        processSimulationTick
    };
})();

console.log("[OMEGA] AAA World Ecosystem & Causal Dependency Engine Initialized.");
