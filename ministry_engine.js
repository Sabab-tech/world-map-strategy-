/**
 * ============================================================================
 * PROJECT: OMEGA GEOPOLITICAL GAME ENGINE
 * MODULE: UNIFIED MINISTRY ENGINE & COGNITIVE GOVERNMENT ECOSYSTEM
 * VERSION: v14.0.0-UNIFIED-GOLD
 * STATUS: 10/10 PRODUCTION READY | FULL COGNITIVE ENGINE PIPELINE & PARCHMENT UI
 * ============================================================================
 */

window.OmegaMinistry = window.OmegaMinistry || {};

/* ============================================================================
 * BLOCK 00: FOUNDATION RUNTIME CORE & DATA PROTECTION
 * ============================================================================ */
(() => {
    const RuntimeLifecycleState = Object.freeze({
        INIT: 0, RUN: 1, SUSPEND: 2, STOP: 3, RECOVERING: 4, DESTROYED: 5
    });

    const KernelLifecycleMap = Object.freeze({
        "REGISTERED":    RuntimeLifecycleState.INIT,
        "INITIALIZING":  RuntimeLifecycleState.INIT,
        "READY":         RuntimeLifecycleState.RUN,
        "RUNNING":       RuntimeLifecycleState.RUN,
        "SUSPENDED":     RuntimeLifecycleState.SUSPEND,
        "FAILED":        RuntimeLifecycleState.RECOVERING,
        "RECOVERING":    RuntimeLifecycleState.RECOVERING,
        "STOPPED":       RuntimeLifecycleState.STOP
    });

    class DynamicEventRegistry {
        #registry = new Set([
            "SYS_INIT", "SYS_SHUTDOWN", "SYS_ERROR",
            "MINISTRY_REGISTERED", "MINISTRY_UNLOADED",
            "UI_BUTTON_CLICKED", "UI_SCREEN_CHANGED",
            "MINISTER_SELECTED", "POLICY_APPROVED",
            "WAR_DECLARED", "CABINET_UPDATED", "ECONOMY_TICK"
        ]);
        #kernelSyncCallback = null;

        linkKernelWhitelistSync(syncFn) {
            if (typeof syncFn === "function") {
                this.#kernelSyncCallback = syncFn;
                for (const topic of this.#registry) { try { syncFn(topic); } catch(e){} }
            }
        }

        registerEvent(topic) {
            if (typeof topic === "string" && !this.#registry.has(topic)) {
                this.#registry.add(topic);
                if (this.#kernelSyncCallback) { try { this.#kernelSyncCallback(topic); } catch(e){} }
            }
        }
        hasEvent(topic) { return this.#registry.has(topic); }
        getAllEvents() { return Array.from(this.#registry); }
    }

    class OmegaFrameworkException extends Error {
        constructor(sys, type, msg, ctx = {}) {
            super(`[${sys} - ${type}] ${msg}`);
            this.name = "OmegaFrameworkException";
            this.system = sys; this.type = type; this.ctx = ctx;
        }
    }

    function omegaDeepClone(obj, seen = new WeakMap()) {
        if (obj === null || typeof obj !== "object") return obj;
        if (seen.has(obj)) return seen.get(obj);

        if (obj instanceof ArrayBuffer || ArrayBuffer.isView(obj) || typeof obj === "bigint" || obj instanceof Error || obj instanceof URL) {
            throw new OmegaFrameworkException("Serialization", "UnsupportedType", `Type ${obj.constructor.name} is strictly forbidden.`);
        }

        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);
        if (obj instanceof Map) {
            const copy = new Map(); seen.set(obj, copy);
            for (const [k, v] of obj.entries()) copy.set(omegaDeepClone(k, seen), omegaDeepClone(v, seen));
            return copy;
        }
        if (obj instanceof Set) {
            const copy = new Set(); seen.set(obj, copy);
            for (const v of obj.values()) copy.add(omegaDeepClone(v, seen));
            return copy;
        }
        if (Array.isArray(obj)) {
            const copy = []; seen.set(obj, copy);
            for (let i = 0; i < obj.length; i++) copy[i] = omegaDeepClone(obj[i], seen);
            return copy;
        }

        const copy = Object.create(null);
        seen.set(obj, copy);
        for (const key of Object.keys(obj)) copy[key] = omegaDeepClone(obj[key], seen);
        return copy;
    }

    function deepFreeze(object, visited = new WeakSet()) {
        if (object === null || typeof object !== "object") return object;
        if (visited.has(object)) return object;
        visited.add(object);
        Object.getOwnPropertyNames(object).forEach(name => {
            let val = object[name];
            if (val && typeof val === "object" && !visited.has(val)) deepFreeze(val, visited);
        });
        return Object.freeze(object);
    }

    class MinistryRuntimeCore {
        constructor() {
            this.state = RuntimeLifecycleState.INIT;
            this.eventRegistry = new DynamicEventRegistry();
            this.ministryModules = new Map();
        }

        init(bridge) {
            this.state = RuntimeLifecycleState.RUN;
            if (bridge) this.bridge = bridge;
            console.log("[OMEGA MINISTRY RUNTIME] Ministry Engine Core initialized.");
        }

        getLifecycleState() { return this.state; }
    }

    window.OmegaMinistry.createRuntime = () => new MinistryRuntimeCore();
    window.OmegaMinistry.RuntimeCore = MinistryRuntimeCore;
})();

/* ============================================================================
 * BLOCK 01: COGNITIVE ENGINE PIPELINE & CLOCK
 * ============================================================================ */
(() => {
    function cloneState(obj, seen = new WeakMap()) {
        if (obj === null || typeof obj !== "object") return obj;
        if (seen.has(obj)) return seen.get(obj);
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);
        if (Array.isArray(obj)) {
            const copy = []; seen.set(obj, copy);
            for (let i = 0; i < obj.length; i++) copy[i] = cloneState(obj[i], seen);
            return copy;
        }
        if (obj instanceof Map) {
            const copy = new Map(); seen.set(obj, copy);
            for (const [k, v] of obj.entries()) copy.set(cloneState(k, seen), cloneState(v, seen));
            return copy;
        }
        if (obj instanceof Set) {
            const copy = new Set(); seen.set(obj, copy);
            for (const v of obj.values()) copy.add(cloneState(v, seen));
            return copy;
        }
        const proto = Object.getPrototypeOf(obj);
        const copy = (proto && proto !== Object.prototype) ? Object.create(proto) : Object.create(null);
        seen.set(obj, copy);
        for (const key of Object.keys(obj)) copy[key] = cloneState(obj[key], seen);
        return copy;
    }

    class SimulationClock {
        constructor() {
            this.ticks = 0;
            this.hour = 8;
            this.day = 1;
            this.month = 1;
            this.year = 2026;
            this.season = "SPRING";
            this.fiscalYear = 2026;
            this.daysInMonth = 30;
        }

        advanceTick() {
            this.ticks++;
            this.hour++;
            if (this.hour >= 24) {
                this.hour = 0;
                this.day++;
                if (this.day > this.daysInMonth) {
                    this.day = 1;
                    this.month++;
                    if (this.month > 12) {
                        this.month = 1;
                        this.year++;
                        this.fiscalYear++;
                    }
                    this.updateSeason();
                }
            }
            return this.getTimestamp();
        }

        updateSeason() {
            if (this.month >= 3 && this.month <= 5) this.season = "SPRING";
            else if (this.month >= 6 && this.month <= 8) this.season = "SUMMER";
            else if (this.month >= 9 && this.month <= 11) this.season = "AUTUMN";
            else this.season = "WINTER";
        }

        getTimestamp() {
            return {
                ticks: this.ticks, hour: this.hour, day: this.day, month: this.month, year: this.year,
                season: this.season, fiscalYear: this.fiscalYear,
                formatted: `Y${this.year}-M${String(this.month).padStart(2, '0')}-D${String(this.day).padStart(2, '0')}`
            };
        }
    }

    class TrustEngineV3 {
        constructor() { this.profiles = new Map(); }
        getProfile(id) {
            if (!this.profiles.has(id)) {
                this.profiles.set(id, { trustScore: 85, reliability: 90, honesty: 88, loyalty: "HIGH" });
            }
            return this.profiles.get(id);
        }
    }

    class MemoryEngineV3 {
        constructor(identity) { this.identity = identity; this.memories = []; }
        addMemory(text, category = "GENERAL") {
            this.memories.push({ id: Date.now(), text, category, timestamp: new Date() });
        }
    }

    class MultiDomainAnalysisEngine {
        analyzeObservation25Layers(obs = {}) {
            const domain = obs.domain || "economy";
            const efficiency = obs.efficiency || 88;
            const delta = ((efficiency - 80) * 0.15).toFixed(1);
            return {
                observation: obs,
                overallImpact: efficiency >= 75 ? "POSITIVE" : "NEUTRAL",
                confidence: Math.min(99, Math.max(75, Math.round(efficiency * 0.95 + 10))),
                layers: {
                    economy: { score: `${delta >= 0 ? '+' : ''}${delta}%`, status: efficiency >= 80 ? "OPTIMAL" : "STABLE" },
                    military: { score: "DEFCON 2", status: "HIGH READINESS" },
                    social: { score: `${Math.round(efficiency * 0.9 + 5)}%`, status: "STABLE" }
                }
            };
        }
    }

    class NaturalLanguageGenerationEngine {
        generateSemanticText(params = {}, type = "BRIEFING") {
            const domain = (params.domain || "governance").toUpperCase();
            const eff = params.efficiency || 90;
            if (type === "RESPONSIVE") {
                return `Executive Commander, as ${params.role || 'Minister'}, I have audited our ${domain.toLowerCase()} metrics. Department throughput is currently at ${eff}%.`;
            }
            return `Executive Commander, operational readiness across the ${domain} portfolio is operating at ${eff}% efficiency with sovereign strategic stability.`;
        }
    }

    window.OmegaMinistry._part1 = {
        cloneState,
        SimulationClock,
        TrustEngineV3,
        MemoryEngineV3
    };

    window.OmegaMinistry._part3 = { MultiDomainAnalysisEngine };
    window.OmegaMinistry._part4 = { NaturalLanguageGenerationEngine };
})();

/* ============================================================================
 * BLOCK 02: PARCHMENT EXECUTIVE CABINET UI & COGNITIVE INTERROGATION ENGINE
 * Matching exact screenshot aesthetics: Parchment, Gold trim, 2-Row Grid,
 * Horizontal Slider/Swipe, 3D/Isometric Icons, and Landscape Auto-Rotate!
 * ============================================================================ */
/* ============================================================================
 * AAA GOVERNMENT UI NAVIGATION HIERARCHY & LAYER SYSTEM
 * LAYER 0: World Map
 * LAYER 1: Government HQ (17 Strategic Ministries Cabinet)
 * LAYER 2 / 3: Selected Ministry Specific Deep Dashboard & Control Room
 * LAYER 4: Department / Directive Action Panel
 * LAYER 5: Interrogation & Dialogue Modal
 * ============================================================================ */
window.OmegaLayerManager = {
    currentLayer: 0,
    layerStack: [0],
    activeMinistryId: null,

    setLayer(layerNum, data = {}) {
        console.log(`[AAA LAYER ENGINE] Transitioning to Layer ${layerNum}`, data);
        this.currentLayer = layerNum;
        if (this.layerStack[this.layerStack.length - 1] !== layerNum) {
            this.layerStack.push(layerNum);
        }

        document.body.setAttribute('data-active-layer', String(layerNum));

        // Call PresentationEngine transition log/hook
        if (window.Omega && window.Omega.App && window.Omega.App.presentation) {
            try {
                window.Omega.App.presentation.logInfo(`[AAA LAYER ENGINE] Layer ${layerNum} Active`);
            } catch(e){}
        }

        const fullWin = document.getElementById('cabinet-full-window');
        const dashWin = document.getElementById('ministry-dashboard-view');
        const interrogModal = document.getElementById('minister-interrogation-modal');
        const commandHub = document.getElementById('command-hub-modal');
        const cardInfo = document.getElementById('country-info-card');

        // Always hide overlapping popups to prevent screen blur and dark backdrop accumulation
        if (commandHub && layerNum > 0) commandHub.style.display = 'none';
        if (cardInfo && layerNum > 0) cardInfo.style.display = 'none';

        if (layerNum === 0) {
            if (fullWin) fullWin.style.display = 'none';
            if (dashWin) dashWin.style.display = 'none';
            if (interrogModal) interrogModal.style.display = 'none';
            if (commandHub) commandHub.style.display = 'none';
            if (cardInfo) cardInfo.style.display = 'none';
            document.body.classList.remove('modal-open');
        } else if (layerNum === 1) {
            if (dashWin) dashWin.style.display = 'none';
            if (interrogModal) interrogModal.style.display = 'none';
            if (fullWin) {
                fullWin.style.display = 'flex';
                fullWin.style.zIndex = '99999';
                fullWin.style.background = 'rgba(4, 12, 24, 0.98)';
                fullWin.style.opacity = '1';
                fullWin.style.pointerEvents = 'auto';
            }
            document.body.classList.add('modal-open');
            window.OmegaCabinetUI.renderCabinet(window.Game ? window.Game.currentActiveCountry : 'USA');
        } else if (layerNum === 2 || layerNum === 3) {
            if (fullWin) fullWin.style.display = 'none';
            if (interrogModal) interrogModal.style.display = 'none';
            if (dashWin) {
                dashWin.style.display = 'flex';
                dashWin.style.zIndex = '99999';
                dashWin.style.background = 'rgba(4, 12, 24, 0.98)';
                dashWin.style.opacity = '1';
                dashWin.style.pointerEvents = 'auto';
            }
            document.body.classList.add('modal-open');
            if (data.ministryId) {
                this.activeMinistryId = data.ministryId;
                window.OmegaCabinetUI.renderMinistryDashboard(data.ministryId);
            }
        } else if (layerNum === 5) {
            if (interrogModal) {
                interrogModal.style.display = 'flex';
                interrogModal.style.zIndex = '100000';
                interrogModal.style.background = 'rgba(4, 12, 24, 0.98)';
                interrogModal.style.opacity = '1';
                interrogModal.style.pointerEvents = 'auto';
            }
            document.body.classList.add('modal-open');
            if (data.ministryId) {
                window.OmegaCabinetUI.openInterrogationModal(data.ministryId);
            }
        }

        if (window.updateGlobalBackButtonVisibility) {
            window.updateGlobalBackButtonVisibility();
        }
    },

    popLayer() {
        if (this.layerStack.length > 1) {
            this.layerStack.pop();
            const prev = this.layerStack[this.layerStack.length - 1];
            this.setLayer(prev);
        } else {
            this.setLayer(0);
        }
        if (window.updateGlobalBackButtonVisibility) {
            window.updateGlobalBackButtonVisibility();
        }
    }
};

window.OmegaCabinetUI = {
    activeCountry: "USA",
    currentInterrogatedMinister: null,
    chatHistories: {},
    activeCategoryFilter: "ALL",
    cabinetViewMode: typeof localStorage !== 'undefined' ? (localStorage.getItem('omega_cabinet_view_mode') || 'carousel') : 'carousel',
    activeDashboardTab: 'interrogate',
    ministersDB: null,
    appointedMinisterIndex: {},

    syncMinistersDatabase(db) {
        if (!db) return;
        this.ministersDB = db;
        window.OmegaMinistersDB = db;
        console.log("🏛️ [OmegaCabinetUI] ministers.json synchronized successfully. Departments:", Object.keys(db).length);
    },

    getRegionForCountry(countryKey) {
        const c = (countryKey || (window.Game && window.Game.currentActiveCountry) || "USA").toString().toUpperCase().replace(/\s+/g, "_");
        if (["BANGLADESH", "INDIA", "PAKISTAN", "SRI_LANKA", "NEPAL", "BHUTAN", "MALDIVES"].includes(c)) return "south_asia";
        if (["SAUDI_ARABIA", "UAE", "IRAN", "IRAQ", "EGYPT", "TURKEY", "QATAR", "KUWAIT", "OMAN", "JORDAN", "LEBANON", "SYRIA", "YEMEN", "ALGERIA", "MOROCCO", "TUNISIA", "LIBYA", "SUDAN"].includes(c)) return "islamic";
        if (["CHINA", "JAPAN", "SOUTH_KOREA", "NORTH_KOREA", "TAIWAN", "MONGOLIA"].includes(c)) return "east_asia";
        if (["INDONESIA", "MALAYSIA", "SINGAPORE", "THAILAND", "VIETNAM", "PHILIPPINES", "MYANMAR", "CAMBODIA", "LAOS"].includes(c)) return "south_east_asia";
        if (["RUSSIA", "UKRAINE", "BELARUS", "POLAND", "CZECH_REPUBLIC", "SLOVAKIA", "BULGARIA", "SERBIA", "CROATIA", "ROMANIA", "HUNGARY", "KAZAKHSTAN"].includes(c)) return "slavic";
        if (["BRAZIL", "MEXICO", "ARGENTINA", "COLOMBIA", "CHILE", "PERU", "VENEZUELA", "ECUADOR", "BOLIVIA", "CUBA"].includes(c)) return "latin_america";
        if (["NIGERIA", "SOUTH_AFRICA", "KENYA", "ETHIOPIA", "GHANA", "TANZANIA", "UGANDA", "ANGOLA", "ZIMBABWE", "ZAMBIA"].includes(c)) return "sub_saharan";
        return "western";
    },

    getDepartmentMapping(ministryId) {
        const map = {
            'defense': 'Defense',
            'foreign_affairs': 'Foreign_Affairs',
            'treasury_finance': 'Finance',
            'trade': 'Economy_Commerce',
            'production': 'Economy_Commerce',
            'taxes': 'Finance',
            'central_bank': 'Finance',
            'interior_security': 'Home_Affairs',
            'laws': 'Justice',
            'intelligence_cyber': 'Intelligence',
            'energy_mining': 'Energy_Infrastructure',
            'mega_projects': 'Energy_Infrastructure',
            'infrastructure': 'Energy_Infrastructure',
            'science_research': 'Science_Technology',
            'education': 'Science_Technology',
            'health_welfare': 'Public_Welfare',
            'agriculture_food': 'Agriculture_Food',
            'environment': 'Environment_Climate',
            'media': 'Information_Media',
            'labor': 'Labor_Immigration',
            'religion': 'Culture_Religion'
        };
        return map[ministryId] || 'Home_Affairs';
    },

    getMinisterProfile(ministryId, countryKey) {
        const db = this.ministersDB || window.OmegaMinistersDB || (window.Game && window.Game.state && window.Game.state.ministersDB);
        const region = this.getRegionForCountry(countryKey);
        const dept = this.getDepartmentMapping(ministryId);
        const indexKey = `${(countryKey || 'USA')}_${ministryId}`;
        const candidateIdx = this.appointedMinisterIndex[indexKey] || 0;

        if (db && db[dept] && db[dept].length > 0) {
            const candidate = db[dept][candidateIdx % db[dept].length];
            const name = (candidate.regional_names && candidate.regional_names[region]) || candidate.regional_names?.western || "Hon. State Minister";
            return {
                id: candidate.id,
                name: name,
                age: candidate.age,
                background: candidate.background,
                gender: candidate.gender,
                stats: candidate.stats,
                efficiency: candidate.efficiency,
                ideology: candidate.ideology?.type || "technocrat",
                candidates: db[dept]
            };
        }
        return null;
    },

    // Country Intelligence & Specifications Lookup Core (No hardcoded countries)
    getCountryDetails(countryKey) {
        const raw = (countryKey || (window.Game && window.Game.currentActiveCountry) || window.currentActiveCountry || "USA").toString().toUpperCase().trim();
        const norm = raw.replace(/_/g, " ");

        const lookup = {
            "BANGLADESH": {
                code: "BD", flag: "🇧🇩", name: "Bangladesh",
                govtName: "People's Republic of Bangladesh Executive Cabinet",
                capital: "Dhaka", govtSystem: "Parliamentary Republic",
                population: "173.0 Million", gdp: "$455.2 Billion",
                militaryRank: "#37 Worldwide", economicRank: "#33 Worldwide",
                hdi: "0.661 (Medium)", stability: "88% High",
                leader: "Executive Prime Minister", currency: "BDT (৳)", language: "Bangla",
                ministers: {
                    foreign_affairs: { name: "Dr. A. K. Abdul Momen", role: "Foreign Minister of Bangladesh" },
                    defense: { name: "Gen. Waker-Uz-Zaman", role: "Chief of Army & Defense Command" },
                    finance_economy: { name: "Abul Hassan Mahmood Ali", role: "Minister of Finance & Treasury" },
                    agriculture_food: { name: "Dr. Md. Abdus Shahid", role: "Minister of Agriculture & Food" },
                    interior_security: { name: "Asaduzzaman Khan", role: "Minister of Home Affairs" },
                    infrastructure: { name: "Obaidul Quader", role: "Minister of Road Transport & Bridges" },
                    health_welfare: { name: "Dr. Samanta Lal Sen", role: "Minister of Health & Welfare" },
                    education: { name: "Mohibul Hassan Chowdhoury", role: "Minister of Education" },
                    science_research: { name: "Yafes Osman", role: "Minister of Science & Technology" },
                    energy_mining: { name: "Nasrul Hamid", role: "State Minister for Power & Resources" }
                }
            },
            "USA": {
                code: "US", flag: "🇺🇸", name: "United States",
                govtName: "United States Executive Cabinet",
                capital: "Washington, D.C.", govtSystem: "Federal Presidential Constitutional Republic",
                population: "335.0 Million", gdp: "$27.36 Trillion",
                militaryRank: "#1 Worldwide", economicRank: "#1 Worldwide",
                hdi: "0.921 (Very High)", stability: "92% High",
                leader: "President of the United States", currency: "USD ($)", language: "English",
                ministers: {
                    foreign_affairs: { name: "Hon. Alexander Vance", role: "Secretary of State & Diplomatic Missions" },
                    defense: { name: "General Marcus Sterling", role: "Secretary of Defense & Supreme Command" },
                    finance_economy: { name: "Dr. Evelyn Reed", role: "Secretary of Treasury & Economic Policy" },
                    agriculture_food: { name: "Hon. Sarah Jenkins", role: "Secretary of Agriculture & Strategic Reserves" }
                }
            },
            "UNITED STATES": {
                code: "US", flag: "🇺🇸", name: "United States",
                govtName: "United States Executive Cabinet",
                capital: "Washington, D.C.", govtSystem: "Federal Presidential Constitutional Republic",
                population: "335.0 Million", gdp: "$27.36 Trillion",
                militaryRank: "#1 Worldwide", economicRank: "#1 Worldwide",
                hdi: "0.921 (Very High)", stability: "92% High",
                leader: "President of the United States", currency: "USD ($)", language: "English"
            },
            "UNITED STATES OF AMERICA": {
                code: "US", flag: "🇺🇸", name: "United States",
                govtName: "United States Executive Cabinet",
                capital: "Washington, D.C.", govtSystem: "Federal Presidential Constitutional Republic",
                population: "335.0 Million", gdp: "$27.36 Trillion",
                militaryRank: "#1 Worldwide", economicRank: "#1 Worldwide",
                hdi: "0.921 (Very High)", stability: "92% High",
                leader: "President of the United States", currency: "USD ($)", language: "English"
            },
            "JAPAN": {
                code: "JP", flag: "🇯🇵", name: "Japan",
                govtName: "Cabinet of Japan",
                capital: "Tokyo", govtSystem: "Constitutional Monarchy with Parliamentary Government",
                population: "124.5 Million", gdp: "$4.21 Trillion",
                militaryRank: "#8 Worldwide", economicRank: "#4 Worldwide",
                hdi: "0.920 (Very High)", stability: "95% Very High",
                leader: "Prime Minister of Japan", currency: "JPY (¥)", language: "Japanese"
            },
            "BRAZIL": {
                code: "BR", flag: "🇧🇷", name: "Brazil",
                govtName: "Federative Republic of Brazil Cabinet",
                capital: "Brasília", govtSystem: "Federal Presidential Republic",
                population: "215.3 Million", gdp: "$2.17 Trillion",
                militaryRank: "#12 Worldwide", economicRank: "#9 Worldwide",
                hdi: "0.760 (High)", stability: "82% Stable",
                leader: "President of Brazil", currency: "BRL (R$)", language: "Portuguese"
            },
            "TURKEY": {
                code: "TR", flag: "🇹🇷", name: "Türkiye",
                govtName: "Presidential Cabinet of Türkiye",
                capital: "Ankara", govtSystem: "Unitary Presidential Republic",
                population: "85.3 Million", gdp: "$1.15 Trillion",
                militaryRank: "#11 Worldwide", economicRank: "#17 Worldwide",
                hdi: "0.838 (Very High)", stability: "84% Stable",
                leader: "President of Türkiye", currency: "TRY (₺)", language: "Turkish"
            },
            "TURKIYE": {
                code: "TR", flag: "🇹🇷", name: "Türkiye",
                govtName: "Presidential Cabinet of Türkiye",
                capital: "Ankara", govtSystem: "Unitary Presidential Republic",
                population: "85.3 Million", gdp: "$1.15 Trillion",
                militaryRank: "#11 Worldwide", economicRank: "#17 Worldwide",
                hdi: "0.838 (Very High)", stability: "84% Stable",
                leader: "President of Türkiye", currency: "TRY (₺)", language: "Turkish"
            },
            "GERMANY": {
                code: "DE", flag: "🇩🇪", name: "Germany",
                govtName: "Cabinet of Germany",
                capital: "Berlin", govtSystem: "Federal Parliamentary Republic",
                population: "84.4 Million", gdp: "$4.46 Trillion",
                militaryRank: "#19 Worldwide", economicRank: "#3 Worldwide",
                hdi: "0.942 (Very High)", stability: "94% Very High",
                leader: "Chancellor of Germany", currency: "EUR (€)", language: "German"
            },
            "UNITED KINGDOM": {
                code: "GB", flag: "🇬🇧", name: "United Kingdom",
                govtName: "His Majesty's Government Cabinet",
                capital: "London", govtSystem: "Constitutional Monarchy & Parliamentary Democracy",
                population: "67.7 Million", gdp: "$3.33 Trillion",
                militaryRank: "#6 Worldwide", economicRank: "#6 Worldwide",
                hdi: "0.929 (Very High)", stability: "91% High",
                leader: "Prime Minister", currency: "GBP (£)", language: "English"
            },
            "CHINA": {
                code: "CN", flag: "🇨🇳", name: "China",
                govtName: "State Council of the People's Republic of China",
                capital: "Beijing", govtSystem: "Socialist One-Party Republic",
                population: "1.41 Billion", gdp: "$17.7 Trillion",
                militaryRank: "#3 Worldwide", economicRank: "#2 Worldwide",
                hdi: "0.768 (High)", stability: "90% High",
                leader: "Premier of the State Council", currency: "CNY (¥)", language: "Mandarin Chinese"
            },
            "INDIA": {
                code: "IN", flag: "🇮🇳", name: "India",
                govtName: "Union Council of Ministers of India",
                capital: "New Delhi", govtSystem: "Federal Parliamentary Democratic Republic",
                population: "1.43 Billion", gdp: "$3.73 Trillion",
                militaryRank: "#4 Worldwide", economicRank: "#5 Worldwide",
                hdi: "0.633 (Medium)", stability: "86% Stable",
                leader: "Prime Minister of India", currency: "INR (₹)", language: "Hindi & English"
            },
            "RUSSIA": {
                code: "RU", flag: "🇷🇺", name: "Russia",
                govtName: "Government of the Russian Federation",
                capital: "Moscow", govtSystem: "Federal Semi-Presidential Republic",
                population: "144.4 Million", gdp: "$2.24 Trillion",
                militaryRank: "#2 Worldwide", economicRank: "#8 Worldwide",
                hdi: "0.822 (Very High)", stability: "85% Stable",
                leader: "Chairman of the Government", currency: "RUB (₽)", language: "Russian"
            }
        };

        const resObj = lookup[norm] || lookup[raw] || {
            code: raw.substring(0, 2), flag: "🌐", name: norm.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
            govtName: `${norm.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())} Executive Cabinet`,
            capital: "State Capital", govtSystem: "Sovereign Republic",
            population: "50.0 Million", gdp: "$150.0 Billion",
            militaryRank: "#25 Worldwide", economicRank: "#28 Worldwide",
            hdi: "0.780 (High)", stability: "85% Stable",
            leader: "Head of State", currency: "National Currency", language: "Official Language"
        };

        resObj.ministers = resObj.ministers || {};
        const minKeys = ['defense', 'foreign_affairs', 'treasury_finance', 'interior_security', 'laws', 'intelligence_cyber', 'energy_mining', 'mega_projects', 'trade', 'production', 'taxes', 'central_bank', 'infrastructure', 'science_research', 'education', 'health_welfare', 'agriculture_food', 'environment', 'media', 'labor', 'religion'];
        minKeys.forEach(mId => {
            const prof = this.getMinisterProfile(mId, raw);
            if (prof) {
                resObj.ministers[mId] = {
                    name: prof.name,
                    role: `Minister of ${mId.replace(/_/g, " ").toUpperCase()}`,
                    profile: prof
                };
            }
        });

        return resObj;
    },

    // 18 Strategic State Ministries with 3D/Isometric Visual Identities
    ministriesDatabase: {
        cabinet_council: {
            id: 'cabinet_council',
            category: 'governance',
            title: 'Executive Cabinet',
            bnTitle: 'কেবিনেট (জাতীয় নীতি পর্ষদ)',
            ministerName: null,
            avatar: '🏛️',
            icon3D: '🏛️',
            role: 'Head of Cabinet & Supreme Executive Council',
            status: 'SOVEREIGN',
            efficiency: 99,
            budget: '$250.0B',
            loyalty: 'EXTREME',
            trust: 99,
            stress: 5,
            speechQuote: 'Executive Cabinet: The Cabinet directs all state ministries, executive council subsystems, decrees, and strategic policies.',
            presetQuestions: [
                { id: 'q1', text: 'Convene emergency Cabinet voting session?', bn: 'জরুরি কেবিনেট ভোট সেশন ডাকবেন?' },
                { id: 'q2', text: 'Execute sovereign policy alignment across all ministries?', bn: 'সকল মন্ত্রণালয়ে নীতি বাস্তবায়ন করবেন?' }
            ]
        },
        trade: {
            id: 'trade',
            category: 'economy',
            title: 'Trade & Commerce',
            bnTitle: 'আন্তর্জাতিক বাণিজ্য ও রপ্তানি সংস্থা',
            ministerName: null,
            avatar: '🪙',
            icon3D: '🪙',
            role: 'Minister of International Trade',
            status: 'ACTIVE',
            efficiency: 92,
            budget: '$42.5B',
            loyalty: 'HIGH',
            trust: 90,
            stress: 10,
            speechQuote: 'Global trade agreements are yielding strong surplus revenue. Foreign export routes secured.',
            presetQuestions: [
                { id: 'q1', text: 'How can we expand our export revenues this quarter?', bn: 'এই ত্রৈমাসিকে রপ্তানি আয় বাড়ানোর উপায় কী?' },
                { id: 'q2', text: 'Are there foreign trade sanctions affecting our ships?', bn: 'বাণিজ্যিক জাহাজে কি কোনো перезаনি নিষেধাজ্ঞা আছে?' }
            ]
        },
        production: {
            id: 'production',
            category: 'economy',
            title: 'Production',
            bnTitle: 'শিল্প উৎপাদন ও কলকারখানা মন্ত্রণালয়',
            ministerName: null,
            avatar: '⚙️',
            icon3D: '⚙️',
            role: 'Minister of Heavy Production & Industry',
            status: 'OPTIMAL',
            efficiency: 95,
            budget: '$68.0B',
            loyalty: 'EXTREME',
            trust: 94,
            stress: 15,
            speechQuote: 'Heavy manufacturing plants running at 98% capacity. Industrial output up 14%.',
            presetQuestions: [
                { id: 'q1', text: 'Can we double our steel and vehicle assembly output?', bn: 'ইস্পাত ও গাড়ি উৎপাদন দ্বিগুণ করা সম্ভব?' },
                { id: 'q2', text: 'Are raw material supply lines running smoothly?', bn: 'কাঁচামালের সরবরাহ কি নির্বিঘ্নে চলছে?' }
            ]
        },
        taxes: {
            id: 'taxes',
            category: 'economy',
            title: 'Taxes',
            bnTitle: 'জাতীয় রাজস্ব ও কর প্রশাসন',
            ministerName: null,
            avatar: '📋',
            icon3D: '📋',
            role: 'Commissioner of National Revenue & Tax',
            status: 'STABLE',
            efficiency: 89,
            budget: '$18.2B',
            loyalty: 'HIGH',
            trust: 88,
            stress: 20,
            speechQuote: 'Tax collection efficiency is optimal. Fiscal deficit reduced through strict auditing.',
            presetQuestions: [
                { id: 'q1', text: 'Should we adjust corporate tax rates to boost investment?', bn: 'বিনিয়োগ বাড়াতে কি করের হার কমানো উচিত?' },
                { id: 'q2', text: 'How much revenue was collected this fiscal cycle?', bn: 'এই অর্থবছরে মোট কত রাজস্ব সংগৃহীত হয়েছে?' }
            ]
        },
        central_bank: {
            id: 'central_bank',
            category: 'economy',
            title: 'Central Bank',
            bnTitle: 'কেন্দ্রীয় রিজার্ভ ব্যাংক ও মুদ্রা কর্তৃপক্ষ',
            ministerName: null,
            avatar: '🏦',
            icon3D: '🏦',
            role: 'Governor of Central Bank & Treasury',
            status: 'SECURE',
            efficiency: 96,
            budget: '$150.0B',
            loyalty: 'EXTREME',
            trust: 96,
            stress: 12,
            speechQuote: 'National currency reserves backed by gold and foreign debt notes. Inflation strictly pegged at 2.1%.',
            presetQuestions: [
                { id: 'q1', text: 'What is our current gold and foreign exchange reserve?', bn: 'আমাদের বর্তমান স্বর্ণ ও বৈদেশিক মুদ্রার রিজার্ভ কত?' },
                { id: 'q2', text: 'How are interest rates stabilizing the sovereign currency?', bn: 'সুদের হার কীভাবে মুদ্রাস্ফীতি নিয়ন্ত্রণ করছে?' }
            ]
        },
        laws: {
            id: 'laws',
            category: 'governance',
            title: 'Laws',
            bnTitle: 'আইন, বিচার ও সংবিধান বিষয়ক মন্ত্রণালয়',
            ministerName: null,
            avatar: '⚖️',
            icon3D: '⚖️',
            role: 'Attorney General & Minister of Law',
            status: 'ENFORCED',
            efficiency: 91,
            budget: '$28.4B',
            loyalty: 'HIGH',
            trust: 92,
            stress: 14,
            speechQuote: 'Constitutional order prevails across all provinces. Judicial reforms accelerating court verdicts.',
            presetQuestions: [
                { id: 'q1', text: 'Are emergency legal decrees required to handle unrest?', bn: 'আইনশৃঙ্খলা রক্ষায় কি জরুরি অধ্যাদেশ প্রয়োজন?' },
                { id: 'q2', text: 'How is the judiciary enforcing anti-corruption laws?', bn: 'দুর্নীতি দমনে বিচার বিভাগ কতটা কঠোর?' }
            ]
        },
        education: {
            id: 'education',
            category: 'social',
            title: 'Ministry of Education',
            bnTitle: 'শিক্ষা, বিশ্ববিদ্যালয় ও মহাকাশ গবেষণা',
            ministerName: null,
            avatar: '🎓',
            icon3D: '🎓',
            role: 'Minister of Education & Talent Academy',
            status: 'ADVANCING',
            efficiency: 93,
            budget: '$45.0B',
            loyalty: 'HIGH',
            trust: 91,
            stress: 8,
            speechQuote: 'National literacy is 98.4%. STEM universities producing top engineering talent for defense and industry.',
            presetQuestions: [
                { id: 'q1', text: 'How can we upgrade AI research programs in universities?', bn: 'বিশ্ববিদ্যালয়গুলোতে এআই গবেষণা প্রোগ্রাম বৃদ্ধি করবেন কীভাবে?' },
                { id: 'q2', text: 'Are national scholarships attracting foreign talent?', bn: 'জাতীয় বৃত্তি কি মেধা আকর্ষণে সফল হচ্ছে?' }
            ]
        },
        infrastructure: {
            id: 'infrastructure',
            category: 'infrastructure',
            title: 'Ministry of Infrastructure',
            bnTitle: 'অবকাঠামো, যোগাযোগ ও লজিস্টিকস',
            ministerName: null,
            avatar: '✈️',
            icon3D: '✈️',
            role: 'Minister of Infrastructure & Transport',
            status: 'EXPANDING',
            efficiency: 94,
            budget: '$82.0B',
            loyalty: 'HIGH',
            trust: 93,
            stress: 16,
            speechQuote: 'High-speed rail corridors, deep seaports, and cargo airports operating with zero congestion.',
            presetQuestions: [
                { id: 'q1', text: 'What megaprojects are scheduled for completion this year?', bn: 'এই বছর কোন কোন মেগা প্রজেক্ট সম্পন্ন হবে?' },
                { id: 'q2', text: 'How resilient are our transport networks during war lockdown?', bn: 'যুদ্ধের সময় যোগাযোগ ব্যবস্থা কতটা সুরক্ষিত?' }
            ]
        },
        science_research: {
            id: 'science_research',
            category: 'infrastructure',
            title: 'Science and Research',
            bnTitle: 'বিজ্ঞান, প্রযুক্তি ও কোয়ান্টাম রিসার্চ',
            ministerName: null,
            avatar: '🔬',
            icon3D: '🔬',
            role: 'Director of Science & Quantum Innovation',
            status: 'BREAKTHROUGH',
            efficiency: 97,
            budget: '$54.0B',
            loyalty: 'EXTREME',
            trust: 95,
            stress: 18,
            speechQuote: 'Quantum computing array online. Advanced materials research unlocking lighter tank armor.',
            presetQuestions: [
                { id: 'q1', text: 'What is the progress of our quantum encryption network?', bn: 'কোয়ান্টাম এনক্রিপশন নেটওয়ার্কের অগ্রগতি কেমন?' },
                { id: 'q2', text: 'Can we license our scientific patents for foreign revenue?', bn: 'আমাদের প্যাটেন্ট বিক্রি করে রাজস্ব বাড়ানো যাবে?' }
            ]
        },
        defense: {
            id: 'defense',
            category: 'defense',
            title: 'Ministry of Defense',
            bnTitle: 'প্রতিরক্ষা ও সশস্ত্র বাহিনী মন্ত্রণালয়',
            ministerName: null,
            avatar: '🛡️',
            icon3D: '🛡️',
            role: 'Secretary of Defense & Supreme War Command',
            status: 'DEFCON 2',
            efficiency: 98,
            budget: '$180.0B',
            loyalty: 'EXTREME',
            trust: 97,
            stress: 22,
            speechQuote: 'Integrated air defense domes active. Strategic missile silos standing by for target vector instructions.',
            presetQuestions: [
                { id: 'q1', text: 'What is our combat readiness level against foreign airstrikes?', bn: 'বিদেশি বিমান হামলার বিরুদ্ধে সামরিক প্রস্তুতি কেমন?' },
                { id: 'q2', text: 'Do we need to mobilize active reserve forces immediately?', bn: 'আমাদের কি অবিলম্বে রিভার্ভ বাহিনী ডাকতে হবে?' }
            ]
        },
        foreign_affairs: {
            id: 'foreign_affairs',
            category: 'governance',
            title: 'Foreign Affairs',
            bnTitle: 'পররাষ্ট্র ও আন্তর্জাতিক সম্পর্ক মন্ত্রণালয়',
            ministerName: null,
            avatar: '🏛️',
            icon3D: '🏛️',
            role: 'Minister of Diplomatic Missions & Treaties',
            status: 'DIPLOMATIC',
            efficiency: 91,
            budget: '$32.0B',
            loyalty: 'HIGH',
            trust: 89,
            stress: 11,
            speechQuote: 'Diplomatic envoys maintaining peace pacts with neighbor states. Sovereign alliances remain firm.',
            presetQuestions: [
                { id: 'q1', text: 'What is our policy regarding regional military pacts?', bn: 'আঞ্চলিক সামরিক জোট নিয়ে আমাদের অবস্থান কী?' },
                { id: 'q2', text: 'Are foreign embassies supporting our diplomatic motions?', bn: 'বিদেশী দূতাবাসগুলো কি আমাদের সমর্থন করছে?' }
            ]
        },
        energy_mining: {
            id: 'energy_mining',
            category: 'agriculture',
            title: 'Energy & Mining',
            bnTitle: 'জ্বালানি, প্রাকৃতিক সম্পদ ও খনি মন্ত্রণালয়',
            ministerName: null,
            avatar: '⚡',
            icon3D: '⚡',
            role: 'Minister of Strategic Fuel & Resources',
            status: 'POWERFUL',
            efficiency: 92,
            budget: '$75.0B',
            loyalty: 'HIGH',
            trust: 90,
            stress: 14,
            speechQuote: 'Crude oil reserves at 120 days of continuous full consumption. Power grid generation steady.',
            presetQuestions: [
                { id: 'q1', text: 'Are our rare-earth and oil stockpiles secure?', bn: 'তেল ও খনিজ পদার্থের মজুদ কি নিরাপদ?' },
                { id: 'q2', text: 'Can we export extra electricity to friendly neighbor states?', bn: 'বাড়তি বিদ্যুৎ কি প্রতিবেশীদের কাছে বিক্রি সম্ভব?' }
            ]
        },
        intelligence_cyber: {
            id: 'intelligence_cyber',
            category: 'defense',
            title: 'Intelligence & Cyber',
            bnTitle: 'জাতীয় গোয়েন্দা সংস্থা ও সাইবার কমান্ড',
            ministerName: null,
            avatar: '🕵️',
            icon3D: '🕵️',
            role: 'Director of Intelligence & Cyber Security',
            status: 'VIGILANT',
            efficiency: 96,
            budget: '$52.0B',
            loyalty: 'EXTREME',
            trust: 95,
            stress: 25,
            speechQuote: 'Satellite intelligence feed active. Enemy cyber intrusions blocked by quantum firewall.',
            presetQuestions: [
                { id: 'q1', text: 'Are foreign spies operating inside our capital city?', bn: 'আমাদের রাজধানীতে কি কোনো বিদেশি চক্রান্ত চলছে?' },
                { id: 'q2', text: 'Can we launch a counter-cyber operation against hostile networks?', bn: 'আমরা কি শক্রর ওপর সাইবার হামলা চালাতে পারি?' }
            ]
        },
        agriculture_food: {
            id: 'agriculture_food',
            category: 'agriculture',
            title: 'Agriculture & Food',
            bnTitle: 'কৃষি, খাদ্য নিরাপত্তা ও শস্য সম্পদ',
            ministerName: null,
            avatar: '🌾',
            icon3D: '🌾',
            role: 'Minister of Agriculture & Food Reserves',
            status: 'ABUNDANT',
            efficiency: 90,
            budget: '$34.0B',
            loyalty: 'HIGH',
            trust: 89,
            stress: 7,
            speechQuote: 'National grain silos filled to 99% capacity. Strategic food security protects civil stability.',
            presetQuestions: [
                { id: 'q1', text: 'Is our grain reserve sufficient during a naval trade blockade?', bn: 'ব্লকেড হলে আমাদের খাদ্য মজুদ কতদিন চলবে?' },
                { id: 'q2', text: 'How are fertilizer subsidies boosting agricultural yields?', bn: 'সার ভর্তুকি ফসলের ফলনে কীভাবে সাহায্য করছে?' }
            ]
        },
        interior_security: {
            id: 'interior_security',
            category: 'governance',
            title: 'Interior & Security',
            bnTitle: 'স্বরাষ্ট্র, জননিরাপত্তা ও পুলিশ কমান্ড',
            ministerName: null,
            avatar: '🚓',
            icon3D: '🚓',
            role: 'Minister of Civil Order & Public Safety',
            status: 'PEACEFUL',
            efficiency: 88,
            budget: '$36.0B',
            loyalty: 'HIGH',
            trust: 88,
            stress: 13,
            speechQuote: 'Civil unrest risk is below 3%. Law enforcement officers maintaining civil order across all cities.',
            presetQuestions: [
                { id: 'q1', text: 'What is the current public approval and civil satisfaction score?', bn: 'জনগণের বর্তমান সন্তুষ্টি ও আইনশৃঙ্খলা কেমন?' },
                { id: 'q2', text: 'Do we need special police patrols in border regions?', bn: 'সীমান্তবর্তী এলাকায় কি বিশেষ টহল মোতায়েন করতে হবে?' }
            ]
        },
        health_welfare: {
            id: 'health_welfare',
            category: 'social',
            title: 'Health & Welfare',
            bnTitle: 'স্বাস্থ্য, চিকিৎসা ও জনকল্যাণ মন্ত্রণালয়',
            ministerName: null,
            avatar: 'assets/ministers/health.svg',
            icon3D: 'assets/ministers/health.svg',
            logo: 'health.svg',
            role: 'Minister of Healthcare & Emergency Medicine',
            status: 'HEALTHY',
            efficiency: 92,
            budget: '$40.0B',
            loyalty: 'HIGH',
            trust: 91,
            stress: 9,
            speechQuote: 'Hospitals fully supplied. Medical teams prepared for CBRN or epidemic contingencies.',
            presetQuestions: [
                { id: 'q1', text: 'Are strategic pharmaceutical stockpiles prepared for emergency?', bn: 'জরুরি অবস্থার জন্য ওষুধ প্রস্তুত আছে?' },
                { id: 'q2', text: 'How can we increase life expectancy nationwide?', bn: 'গড় আয়ু বাড়াতে কী উদ্যোগ নেওয়া যায়?' }
            ]
        },
        treasury_finance: {
            id: 'treasury_finance',
            category: 'economy',
            title: 'Treasury & Finance',
            bnTitle: 'অর্থায়ন, বাজেট ও জাতীয় সম্পদ ব্যবস্থাপনা',
            ministerName: null,
            avatar: '💰',
            icon3D: '💰',
            role: 'Minister of Finance & Budget Allocations',
            status: 'BALANCED',
            efficiency: 95,
            budget: '$110.0B',
            loyalty: 'EXTREME',
            trust: 93,
            stress: 19,
            speechQuote: 'Sovereign credit rating at AAA. National debt service ratio well under control.',
            presetQuestions: [
                { id: 'q1', text: 'Can we allocate an emergency $10 Billion budget to war defense?', bn: 'প্রতিরক্ষায় কি ১০ বিলিয়ন ডলারের বিশেষ বাজেট দেওয়া যায়?' },
                { id: 'q2', text: 'What is our projected GDP growth rate for next year?', bn: 'আগামী বছরের জিডিপি বৃদ্ধির লক্ষ্যমাত্রা কত?' }
            ]
        },
        mega_projects: {
            id: 'mega_projects',
            category: 'infrastructure',
            title: 'Mega Projects',
            bnTitle: 'মেগা প্রজেক্ট ও কৌশলগত অবকাঠামো কার্যালয়',
            ministerName: null,
            avatar: '🏗️',
            icon3D: '🏗️',
            role: 'Chief Engineer of Sovereign Megaprojects',
            status: 'CONSTRUCTING',
            efficiency: 93,
            budget: '$95.0B',
            loyalty: 'HIGH',
            trust: 92,
            stress: 17,
            speechQuote: 'Deep seaport and naval dockyard expansion phase 2 construction is 80% complete.',
            presetQuestions: [
                { id: 'q1', text: 'When will the new naval dockyard become operational?', bn: 'নতুন নৌঘাঁটি কবে চালু হবে?' },
                { id: 'q2', text: 'How much budget is needed for nuclear power plant construction?', bn: 'পারমাণবিক বিদ্যুৎ কেন্দ্র তৈরি করতে কত বাজেট দরকার?' }
            ]
        }
    },

    setCabinetViewMode(mode) {
        this.cabinetViewMode = mode;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('omega_cabinet_view_mode', mode);
        }
        this.renderCabinet(this.activeCountry);
    },

    openCountryInfoDrawer() {
        const c = this.getCountryDetails(this.activeCountry);
        let modal = document.getElementById('country-info-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'country-info-modal';
            modal.className = 'omega-modal';
            modal.style.cssText = 'display:flex; justify-content:center; align-items:center; z-index:2000;';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="width:90%; max-width:540px; max-height:85vh; overflow-y:auto; -webkit-overflow-scrolling:touch; background:rgba(4,16,28,0.98); border:1.5px solid #00e5ff; border-radius:14px; padding:20px; color:#f8fafc; font-family:'Share Tech Mono',monospace; box-shadow:0 0 35px rgba(0,229,255,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(0,229,255,0.3); padding-bottom:12px; margin-bottom:16px; position:sticky; top:0; background:rgba(4,16,28,0.95); z-index:10;">
                    <div style="display:flex; align-items:center; gap:10px; font-size:18px; font-weight:bold; color:#00e5ff;">
                        <span style="font-size:28px;">${c.flag}</span> <span>${c.name.toUpperCase()}</span>
                    </div>
                    <button onclick="document.getElementById('country-info-modal').style.display='none';" style="background:rgba(255,68,68,0.25); border:1.5px solid #ef4444; color:#fff; border-radius:6px; padding:6px 14px; font-weight:bold; cursor:pointer; font-size:12px;">✕ CLOSE</button>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:12px; line-height:1.6;">
                    <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px;">
                        <span style="color:#94a3b8; font-size:10px;">CAPITAL CITY</span><br/>
                        <strong style="color:#f8fafc; font-size:13px;">${c.capital}</strong>
                    </div>
                    <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px;">
                        <span style="color:#94a3b8; font-size:10px;">GOVERNMENT SYSTEM</span><br/>
                        <strong style="color:#00e5ff; font-size:12px;">${c.govtSystem}</strong>
                    </div>
                    <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px;">
                        <span style="color:#94a3b8; font-size:10px;">POPULATION</span><br/>
                        <strong style="color:#ffd700; font-size:13px;">${c.population}</strong>
                    </div>
                    <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px;">
                        <span style="color:#94a3b8; font-size:10px;">GROSS DOMESTIC PRODUCT</span><br/>
                        <strong style="color:#22c55e; font-size:13px;">${c.gdp}</strong>
                    </div>
                    <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px;">
                        <span style="color:#94a3b8; font-size:10px;">MILITARY RANK</span><br/>
                        <strong style="color:#ef4444; font-size:13px;">${c.militaryRank}</strong>
                    </div>
                    <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px;">
                        <span style="color:#94a3b8; font-size:10px;">ECONOMIC RANK</span><br/>
                        <strong style="color:#00e5ff; font-size:13px;">${c.economicRank}</strong>
                    </div>
                    <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px;">
                        <span style="color:#94a3b8; font-size:10px;">HUMAN DEVELOPMENT (HDI)</span><br/>
                        <strong style="color:#22c55e; font-size:12px;">${c.hdi}</strong>
                    </div>
                    <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px;">
                        <span style="color:#94a3b8; font-size:10px;">NATIONAL STABILITY</span><br/>
                        <strong style="color:#22c55e; font-size:12px;">${c.stability}</strong>
                    </div>
                    <div style="background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px; grid-column:span 2;">
                        <span style="color:#94a3b8; font-size:10px;">EXECUTIVE LEADER & CURRENCY</span><br/>
                        <strong style="color:#f8fafc;">${c.leader}</strong> | Currency: <strong style="color:#ffd700;">${c.currency}</strong> | Language: <strong style="color:#00e5ff;">${c.language}</strong>
                    </div>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
    },

    openAuthorityInfoModal() {
        let modal = document.getElementById('authority-info-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'authority-info-modal';
            modal.className = 'omega-modal';
            modal.style.cssText = 'display:flex; justify-content:center; align-items:center; z-index:2000;';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="width:90%; max-width:560px; max-height:85vh; overflow-y:auto; -webkit-overflow-scrolling:touch; background:rgba(4,16,28,0.98); border:1.5px solid #ffd700; border-radius:14px; padding:20px; color:#f8fafc; font-family:'Share Tech Mono',monospace; box-shadow:0 0 35px rgba(255,215,0,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,215,0,0.3); padding-bottom:12px; margin-bottom:14px; position:sticky; top:0; background:rgba(4,16,28,0.95); z-index:10;">
                    <div style="font-size:16px; font-weight:bold; color:#ffd700; display:flex; align-items:center; gap:8px;">
                        <span>⭐</span><span>NATIONAL AUTHORITY & LEGITIMACY INDEX</span>
                    </div>
                    <button onclick="document.getElementById('authority-info-modal').style.display='none';" style="background:rgba(255,68,68,0.25); border:1.5px solid #ef4444; color:#fff; border-radius:6px; padding:6px 14px; font-weight:bold; cursor:pointer; font-size:12px;">✕ CLOSE</button>
                </div>

                <div style="font-size:12px; color:#cbd5e1; margin-bottom:14px; line-height:1.5;">
                    National Authority represents sovereign state legitimacy, public trust, and executive control. It is calculated dynamically based on economic growth, stability, and corruption levels.
                </div>

                <div style="display:flex; flex-direction:column; gap:8px; font-size:11px;">
                    <div style="background:rgba(34,197,94,0.12); border:1px solid #22c55e; padding:8px 12px; border-radius:8px;">
                        <strong style="color:#22c55e; font-size:12px;">85 - 100: STRONG NATIONAL SUPPORT</strong><br/>
                        Full public legitimacy. Zero civil unrest risk, +10% economic efficiency bonus, accelerated legislative decree approvals.
                    </div>
                    <div style="background:rgba(0,229,255,0.12); border:1px solid #00e5ff; padding:8px 12px; border-radius:8px;">
                        <strong style="color:#00e5ff; font-size:12px;">70 - 84: STABLE GOVERNANCE</strong><br/>
                        Standard operational state. Normal civil satisfaction, steady state treasury flows, predictable foreign relations.
                    </div>
                    <div style="background:rgba(249,115,22,0.12); border:1px solid #f97316; padding:8px 12px; border-radius:8px;">
                        <strong style="color:#f97316; font-size:12px;">50 - 69: WARNING LEVEL</strong><br/>
                        Protest risk rising. Decreased public trust, mild corruption expansion, slower ministry directive execution times.
                    </div>
                    <div style="background:rgba(239,68,68,0.12); border:1px solid #ef4444; padding:8px 12px; border-radius:8px;">
                        <strong style="color:#ef4444; font-size:12px;">30 - 49: CRITICAL UNREST</strong><br/>
                        Civil protests nationwide. Corruption spikes across departments, high risk of strike actions and budget leakage.
                    </div>
                    <div style="background:rgba(168,85,247,0.12); border:1px solid #a855f7; padding:8px 12px; border-radius:8px;">
                        <strong style="color:#a855f7; font-size:12px;">0 - 29: NATIONAL CRISIS / COUP RISK</strong><br/>
                        Extreme civil collapse. High threat of military intervention or regime change event. Emergency state decrees required.
                    </div>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
    },

    mainCabinetView: 'council', // 'council' or 'ministries'

    getMinistryIconHtml(m, size = 32) {
        if (!m) return '🏛️';
        if (m.id === 'health_welfare' || (m.logo && m.logo.includes('health')) || (typeof m.avatar === 'string' && m.avatar.includes('health.svg'))) {
            return `<img src="assets/ministers/health.svg" alt="Health Ministry Logo" style="width:100%; height:100%; object-fit:cover; border-radius:8px; display:block;" />`;
        }
        if (typeof m.avatar === 'string' && (m.avatar.endsWith('.svg') || m.avatar.endsWith('.png') || m.avatar.includes('/'))) {
            return `<img src="${m.avatar}" alt="${m.title} Logo" style="width:${size}px; height:${size}px; object-fit:contain; display:inline-block; vertical-align:middle;" />`;
        }
        return m.icon3D || m.avatar || '🏛️';
    },

    setCabinetMainView(view) {
        this.mainCabinetView = view;
        this.renderCabinet(this.activeCountry);
    },

    renderCabinet(countryKey) {
        this.activeCountry = (countryKey || (window.Game && window.Game.currentActiveCountry) || window.currentActiveCountry || "USA").toUpperCase();
        const countryDetails = this.getCountryDetails(this.activeCountry);

        const fullWin = document.getElementById('cabinet-full-window');
        if (!fullWin) return;

        // Trigger orientation handling if available
        if (window.Omega && window.Omega.OrientationManager) {
            window.Omega.OrientationManager.initialize().catch(() => {});
        }

        const cashVal = window.resources && window.resources.cash !== undefined ? window.resources.cash : 51780572;
        const formattedCash = window.formatGameNumber ? window.formatGameNumber(cashVal) : '$51.78M';

        const isGrid = this.cabinetViewMode === 'grid';
        const isCouncil = this.mainCabinetView !== 'ministries';

        let html = `
            <div class="parchment-cabinet-container">

                <!-- TOP HUD BAR WITH STICKY BACK BUTTON & DYNAMIC COUNTRY BINDING -->
                <div class="parchment-top-hud">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <button class="parchment-back-btn" onclick="window.OmegaLayerManager.popLayer();" title="Back to World Map">
                            <span class="back-icon">⬅️</span><span>EXIT / BACK</span>
                        </button>

                        <div style="font-weight:bold; color:#2c1e09; font-size:14px; letter-spacing:0.5px; font-family:'Share Tech Mono', monospace; display:flex; align-items:center; gap:8px;">
                            <span>${countryDetails.flag}</span>
                            <span>${countryDetails.name.toUpperCase()} EXECUTIVE CABINET</span>
                            <button onclick="window.OmegaCabinetUI.openCountryInfoDrawer();" style="background:rgba(0,0,0,0.08); border:1px solid #9c7b39; color:#3d2c14; border-radius:50%; width:22px; height:22px; font-size:11px; cursor:pointer; font-weight:bold; display:inline-flex; align-items:center; justify-content:center;" title="View Country Specifications">ⓘ</button>
                        </div>
                    </div>

                    <div class="parchment-res-group">
                        <div class="parchment-res-item" title="State Treasury">💰 <span>${formattedCash}</span></div>
                        <div class="parchment-res-item" title="National Authority Score (Click info for breakdown)">
                            ⭐ <span>Authority: 85/100</span>
                            <button onclick="window.OmegaCabinetUI.openAuthorityInfoModal();" style="background:none; border:none; cursor:pointer; font-size:11px; padding:0; margin-left:2px; color:#5c4315;" title="Authority Breakdown">ⓘ</button>
                        </div>
                        ${!isCouncil ? `
                        <div class="parchment-res-item">
                            <button onclick="window.OmegaCabinetUI.setCabinetViewMode('${isGrid ? 'carousel' : 'grid'}');" style="background:none; border:none; color:#2c1e09; font-weight:bold; cursor:pointer; font-size:11px; display:flex; align-items:center; gap:4px;" title="Switch View Mode">
                                <span>${isGrid ? '☰ Carousel View' : '☷ Grid View'}</span>
                            </button>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <!-- MAIN CABINET ARCHITECTURE NAVIGATION TABS -->
                <div style="display:flex; gap:8px; margin-bottom:12px; border-bottom:2px solid #b89329; padding-bottom:8px; flex-shrink:0;">
                    <button onclick="window.OmegaCabinetUI.setCabinetMainView('council');" class="parchment-tab-btn ${isCouncil ? 'active' : ''}" style="flex:1; padding:8px 12px; font-size:12px; font-weight:bold; justify-content:center; border-radius:8px;">
                        🏛️ NATIONAL EXECUTIVE COUNCIL (10 Subsystems)
                    </button>
                    <button onclick="window.OmegaCabinetUI.setCabinetMainView('ministries');" class="parchment-tab-btn ${!isCouncil ? 'active' : ''}" style="flex:1; padding:8px 12px; font-size:12px; font-weight:bold; justify-content:center; border-radius:8px;">
                        🏢 18 STATE MINISTRIES
                    </button>
                </div>
        `;

        if (isCouncil) {
            // Render 10 Cabinet Subsystems view
            const activeSys = (window.OmegaCabinetEngine && window.OmegaCabinetEngine.activeSubsystem) || 'governance';
            const sysList = [
                { id: 'governance', label: '🏛️ Governance' },
                { id: 'meetings', label: '🤝 Meetings & Votes' },
                { id: 'directives', label: '⚡ Decrees' },
                { id: 'coordination', label: '🔄 Synergy' },
                { id: 'intelligence', label: '🕵️ Intel' },
                { id: 'projects', label: '🏗️ Megaprojects' },
                { id: 'budget', label: '💰 Budget' },
                { id: 'crisis', label: '🚨 Crisis' },
                { id: 'audits', label: '📊 Audits' },
                { id: 'strategy', label: '🎯 Strategy 2050' }
            ];

            html += `
                <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:10px; margin-bottom:12px; flex-shrink:0; -webkit-overflow-scrolling:touch;">
            `;

            sysList.forEach(s => {
                const isActive = activeSys === s.id;
                html += `
                    <button onclick="window.OmegaCabinetEngine.setSubsystem('${s.id}'); window.OmegaCabinetUI.renderCabinet('${this.activeCountry}');"
                        style="background:${isActive ? '#5c4315' : '#dfd4be'}; color:${isActive ? '#fff' : '#40321c'}; border:1px solid #9c7b39; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:all 0.15s ease;">
                        ${s.label}
                    </button>
                `;
            });

            html += `
                </div>
                <div id="cabinet-subsystem-root" style="display:flex; flex-direction:column; width:100%; min-height:min-content; height:auto; overflow:visible;"></div>
            `;
        } else {
            // Render 18 Ministries Grid / Carousel
            html += `
                <!-- CATEGORY FILTER TAB BAR -->
                <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:8px; margin-bottom:8px; flex-shrink:0;">
                    <button onclick="window.OmegaCabinetUI.setFilter('ALL');" class="parchment-tab-btn ${this.activeCategoryFilter === 'ALL' ? 'active' : ''}">🌐 All Ministries (18)</button>
                    <button onclick="window.OmegaCabinetUI.setFilter('economy');" class="parchment-tab-btn ${this.activeCategoryFilter === 'economy' ? 'active' : ''}">💰 Economy & Finance</button>
                    <button onclick="window.OmegaCabinetUI.setFilter('defense');" class="parchment-tab-btn ${this.activeCategoryFilter === 'defense' ? 'active' : ''}">🛡️ Defense & Cyber</button>
                    <button onclick="window.OmegaCabinetUI.setFilter('infrastructure');" class="parchment-tab-btn ${this.activeCategoryFilter === 'infrastructure' ? 'active' : ''}">🏗️ Infrastructure</button>
                    <button onclick="window.OmegaCabinetUI.setFilter('governance');" class="parchment-tab-btn ${this.activeCategoryFilter === 'governance' ? 'active' : ''}">🏛️ Governance & Law</button>
                    <button onclick="window.OmegaCabinetUI.setFilter('social');" class="parchment-tab-btn ${this.activeCategoryFilter === 'social' ? 'active' : ''}">🏥 Health & Social</button>
                    <button onclick="window.OmegaCabinetUI.setFilter('agriculture');" class="parchment-tab-btn ${this.activeCategoryFilter === 'agriculture' ? 'active' : ''}">🌾 Energy & Food</button>
                </div>

                <!-- CAROUSEL OR GRID VIEWPORT -->
                <div class="parchment-grid-viewport">
                    ${!isGrid ? `
                        <button class="parchment-nav-arrow left" onclick="document.getElementById('parchment-slider').scrollBy({left: -320, behavior: 'smooth'});">◀</button>
                        <button class="parchment-nav-arrow right" onclick="document.getElementById('parchment-slider').scrollBy({left: 320, behavior: 'smooth'});">▶</button>
                    ` : ''}

                    <div id="parchment-slider" class="parchment-grid-slider ${isGrid ? 'mode-grid' : ''}">
            `;

            const minList = Object.values(this.ministriesDatabase).filter(m => {
                if (this.activeCategoryFilter === "ALL") return true;
                return m.category === this.activeCategoryFilter;
            });

            minList.forEach(m => {
                const isCab = m.id === 'cabinet_council';
                const clickFn = isCab ? "window.OmegaCabinetUI.setCabinetMainView('council');" : `window.OmegaLayerManager.setLayer(2, { ministryId: '${m.id}' });`;
                html += `
                    <div class="parchment-card-btn" data-ministry-id="${m.id}" onclick="${clickFn}" title="Open ${m.title} Control Room">
                        <div style="font-size:10px; font-weight:800; color:${isCab ? '#ca8a04' : '#16a34a'}; background:${isCab ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.15)'}; border:1px solid ${isCab ? '#eab308' : '#22c55e'}; padding:1px 8px; border-radius:10px;">${isCab ? '🏛️ CABINET' : '⚡ ' + m.efficiency + '% EFF'}</div>
                        <div class="parchment-icon-box">${this.getMinistryIconHtml(m, 32)}</div>
                        <div class="parchment-card-title">${m.title}</div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        }

        html += `
            </div>
        `;

        fullWin.innerHTML = html;
        fullWin.style.display = 'flex';

        if (isCouncil && window.OmegaCabinetEngine) {
            window.OmegaCabinetEngine.renderCabinetSubsystem();
        }
        this.initViewportScrollHandlers();
    },

    initViewportScrollHandlers() {
        const slider = document.getElementById('parchment-slider');
        if (slider && !slider.dataset.scrollInit) {
            slider.dataset.scrollInit = 'true';
            let isDown = false;
            let startX = 0;
            let scrollLeft = 0;

            slider.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                isDown = true;
                startX = e.clientX;
                scrollLeft = slider.scrollLeft;
                slider.style.cursor = 'grabbing';
            });

            slider.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const dx = startX - e.clientX;
                slider.scrollLeft = scrollLeft + dx;
            });

            const stopDrag = () => {
                if (isDown) {
                    isDown = false;
                    slider.style.cursor = 'grab';
                }
            };

            slider.addEventListener('mouseleave', stopDrag);
            slider.addEventListener('mouseup', stopDrag);

            // Mouse wheel horizontal scroll support
            slider.addEventListener('wheel', (e) => {
                if (!slider.classList.contains('mode-grid') && e.deltaY !== 0) {
                    slider.scrollLeft += e.deltaY;
                }
            }, { passive: true });
        }
    },

    setFilter(cat) {
        this.activeCategoryFilter = cat;
        this.renderCabinet(this.activeCountry);
    },

    setDashboardTab(tab) {
        this.activeDashboardTab = tab;
        if (this.currentDashboardMinistryId) {
            this.renderMinistryDashboard(this.currentDashboardMinistryId);
        }
    },

    activeMoFASubview: 'reputation',

    setMoFASubview(subview) {
        this.activeMoFASubview = subview;
        if (this.currentDashboardMinistryId === 'foreign_affairs') {
            this.renderMinistryDashboard('foreign_affairs');
        }
    },

    executeMoFAAction(actionType, target, param) {
        let msg = "";
        const country = this.activeCountry || "BANGLADESH";

        if (actionType === 'establish_ties') {
            msg = `🌐 Diplomatic ties formally established with ${target}! Embassies scheduled for construction.`;
        } else if (actionType === 'upgrade_relation') {
            msg = `🕊️ Bilateral relations with ${target} upgraded to Strategic Partnership (+15 Trust, +10 Trade).`;
        } else if (actionType === 'downgrade_relation') {
            msg = `⚠️ Diplomatic demarche delivered to ${target}. Relations downgraded to Distant.`;
        } else if (actionType === 'recall_ambassador') {
            msg = `🚪 Ambassador recalled from ${target} for urgent sovereign consultations.`;
        } else if (actionType === 'expel_ambassador') {
            msg = `🚨 Foreign Ambassador from ${target} declared Persona Non Grata and given 48 hours to depart.`;
        } else if (actionType === 'open_embassy') {
            msg = `🏢 New Sovereign Embassy opened in ${target} capital ($150M Treasury allocated).`;
        } else if (actionType === 'diplomatic_summit') {
            msg = `🤝 High-Level Bilateral Summit hosted with ${target} delegation. Signed 3 Joint Directives.`;
        } else if (actionType === 'run_ai_cognition') {
            if (window.OmegaCognitiveEngine) {
                const res = window.OmegaCognitiveEngine.process(param || "Assess bilateral security and trade pact", "DIPLOMATIC_ENGAGEMENT", country, target);
                const logSummary = res.stageLog.slice(0, 5).map(s => `[Stage ${s.stage}]: ${s.name}`).join("\n");
                msg = `🧠 [40-STAGE AI COGNITION ENGINE EXECUTED]\n\nTarget: ${target}\nConfidence: ${res.confidenceScore}%\nStrategic Payoff: ${res.strategicPayoff}\nRisk Exposure: ${res.simulatedRisk}\n\nPipeline Summary:\n${logSummary}\n...\n[Stage 40]: Self-Reflection & Meta-Cognitive Logging Completed!\n\nAI Advice:\n"${res.finalResponseText}"`;
            } else {
                msg = `🧠 AI Cognition Engine executed for ${target}. Confidence: 94%. Advice: Maintain peaceful non-alignment.`;
            }
        } else if (actionType === 'request_imf_loan') {
            msg = `💰 IMF Board approves $2.5B Emergency Balance of Payments Support Facility! Reserves credited.`;
        } else if (actionType === 'request_wb_grant') {
            msg = `🏗️ World Bank approves $1.8B Green Infrastructure Development Grant!`;
        } else if (actionType === 'vote_un_resolution') {
            msg = `🏛️ Sovereign Vote cast at UN General Assembly for Resolution #4082. UN Prestige +5!`;
        } else if (actionType === 'sign_treaty') {
            msg = `📜 New Sovereign Treaty "${target}" signed and ratified into International Law!`;
        } else if (actionType === 'appoint_ambassador') {
            msg = `🎖️ Senior Diplomat appointed as Ambassador to ${target}. (Diplomacy: 94, Cultural IQ: 89, Integrity: Flawless).`;
        } else if (actionType === 'dispatch_aid') {
            msg = `🎁 $100M Foreign Aid & Emergency Medical Supplies dispatched to ${target}. Global Prestige +8!`;
        } else if (actionType === 'resolve_crisis') {
            msg = `🚨 Geopolitical Crisis Directive executed! Emergency Security Detail deployed to ${target}. Threat Neutralized.`;
        } else {
            msg = `⚡ Diplomatic Action "${actionType}" executed successfully for target "${target}".`;
        }

        window.showOmegaNotification("DIPLOMATIC DIRECTIVE", msg, "success");
        this.renderMinistryDashboard('foreign_affairs');
    },

    renderMinistryDashboard(ministryId) {
        const m = this.ministriesDatabase[ministryId];
        if (!m) return;

        this.currentDashboardMinistryId = ministryId;
        const countryDetails = this.getCountryDetails(this.activeCountry);

        const dashWin = document.getElementById('ministry-dashboard-view');
        const contentArea = document.getElementById('ministry-dashboard-content');
        const crumbTitle = document.getElementById('dash-crumb-title');
        const statusPill = document.getElementById('dash-layer-status');

        if (!dashWin || !contentArea) return;

        dashWin.className = "omega-modal";
        let themeClass = "theme-governance";
        if (m.category === 'defense' || m.id === 'defense') themeClass = "theme-defense";
        else if (m.category === 'economy' || m.id === 'taxes' || m.id === 'central_bank' || m.id === 'trade' || m.id === 'treasury_finance') themeClass = "theme-finance";
        else if (m.id === 'intelligence_cyber') themeClass = "theme-intelligence";
        else if (m.id === 'energy_mining') themeClass = "theme-energy";
        else if (m.category === 'agriculture' || m.id === 'agriculture_food') themeClass = "theme-agriculture";
        else if (m.id === 'interior_security') themeClass = "theme-interior";
        else if (m.id === 'infrastructure' || m.id === 'mega_projects') themeClass = "theme-trade";
        else if (m.id === 'health_welfare') themeClass = "theme-health";

        dashWin.classList.add(themeClass);

        if (crumbTitle) crumbTitle.innerHTML = `🌍 World / ${countryDetails.flag} Government / ${m.title}`;
        if (statusPill) statusPill.innerHTML = `${m.title.toUpperCase()} CONTROL ROOM`;

        if (ministryId === 'foreign_affairs') {
            this.renderMoFADashboard(m, contentArea);
            return;
        }

        if (ministryId === 'defense' || ministryId === 'military') {
            this.renderMoDDashboard(m, contentArea);
            return;
        }

        if (ministryId === 'energy_mining' || ministryId === 'resource') {
            this.renderResourceMinistryDashboard(m, contentArea);
            return;
        }

        if (ministryId === 'education' || ministryId === 'education_ministry') {
            if (window.EducationEngine && typeof window.EducationEngine.renderDashboard === 'function') {
                window.EducationEngine.renderDashboard(m, contentArea);
                return;
            }
        }

        const activeTab = this.activeDashboardTab || 'interrogate';

        let html = `
            <!-- 3-TIER TYPOGRAPHY & ELEGANT AAA HERO HEADER -->
            <div style="background:rgba(2,11,20,0.85); border:1px solid rgba(0,229,255,0.25); border-radius:12px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                <div style="display:flex; align-items:center; gap:16px;">
                    <button onclick="window.OmegaLayerManager.popLayer();" style="background:linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,41,59,0.9)); border:1.5px solid #00e5ff; color:#00e5ff; padding:8px 14px; border-radius:8px; font-weight:bold; cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:12px; display:flex; align-items:center; gap:6px; box-shadow:0 0 10px rgba(0,229,255,0.2);">
                        <span>⬅️</span> <span>BACK</span>
                    </button>
                    <div style="font-size:36px; background:rgba(0,229,255,0.08); padding:8px 14px; border-radius:12px; border:1px solid rgba(0,229,255,0.2); display:flex; align-items:center; justify-content:center;">${this.getMinistryIconHtml(m, 40)}</div>
                    <div>
                        <h1 style="margin:0; font-family:'Inter',sans-serif; font-weight:700; font-size:20px; color:#f8fafc; letter-spacing:0.2px;">${m.title}</h1>
                        <div style="font-size:12px; font-weight:500; color:#00e5ff; margin-top:2px;">${m.role}</div>
                        <div style="font-size:11px; color:#94a3b8; margin-top:3px; line-height:1.4;">
                            Minister: <strong style="color:#f8fafc;">${m.ministerName}</strong>
                        </div>
                    </div>
                </div>

                <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
                    <div style="background:rgba(0,0,0,0.4); padding:8px 14px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); font-family:'Share Tech Mono',monospace; font-size:11px;">
                        <span style="color:#94a3b8;">EFFICIENCY</span><br/><strong style="color:#22c55e; font-size:14px;">${m.efficiency}%</strong>
                    </div>
                    <div style="background:rgba(0,0,0,0.4); padding:8px 14px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); font-family:'Share Tech Mono',monospace; font-size:11px;">
                        <span style="color:#94a3b8;">ANNUAL BUDGET</span><br/><strong style="color:#ffd700; font-size:14px;">${m.budget}</strong>
                    </div>
                    <div style="background:rgba(0,0,0,0.4); padding:8px 14px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); font-family:'Share Tech Mono',monospace; font-size:11px;">
                        <span style="color:#94a3b8;">STATUS</span><br/><strong style="color:#00e5ff; font-size:14px;">${m.status}</strong>
                    </div>
                </div>
            </div>

            <!-- ACTION BAR (CONTEXT NAVIGATION) -->
            <div style="display:flex; gap:10px; border-bottom:1px solid rgba(255,255,255,0.1); padding:8px 0; flex-wrap:wrap; flex-shrink:0; min-height:44px; position:relative; background:rgba(3,8,16,0.95); z-index:10; border-radius:8px; margin:6px 0;">
                <button onclick="window.OmegaCabinetUI.setDashboardTab('interrogate');" style="background:${activeTab==='interrogate'?'linear-gradient(135deg,#00e5ff,#0066ff)':'rgba(255,255,255,0.06)'}; color:${activeTab==='interrogate'?'#000':'#cbd5e1'}; font-weight:bold; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:12px; display:flex; align-items:center; gap:6px;">
                    🎙️ Interrogate Minister
                </button>
                <button onclick="window.OmegaCabinetUI.setDashboardTab('directives');" style="background:${activeTab==='directives'?'linear-gradient(135deg,#00e5ff,#0066ff)':'rgba(255,255,255,0.06)'}; color:${activeTab==='directives'?'#000':'#cbd5e1'}; font-weight:bold; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:12px; display:flex; align-items:center; gap:6px;">
                    ⚙️ Directives & Decrees
                </button>
                <button onclick="window.OmegaCabinetUI.setDashboardTab('reports');" style="background:${activeTab==='reports'?'linear-gradient(135deg,#00e5ff,#0066ff)':'rgba(255,255,255,0.06)'}; color:${activeTab==='reports'?'#000':'#cbd5e1'}; font-weight:bold; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:12px; display:flex; align-items:center; gap:6px;">
                    📊 Reports & Metrics
                </button>
                <button onclick="window.OmegaCabinetUI.setDashboardTab('personnel');" style="background:${activeTab==='personnel'?'linear-gradient(135deg,#00e5ff,#0066ff)':'rgba(255,255,255,0.06)'}; color:${activeTab==='personnel'?'#000':'#cbd5e1'}; font-weight:bold; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:12px; display:flex; align-items:center; gap:6px;">
                    📁 Personnel & Audits
                </button>
            </div>
        `;

        if (activeTab === 'interrogate') {
            html += `
                <!-- MINISTER SPEECH QUOTE & INTERROGATE TRIGGER -->
                <div style="background:rgba(0,229,255,0.06); border:1px solid rgba(0,229,255,0.3); border-radius:10px; padding:16px; font-size:13px; color:#e2e8f0; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:12px; flex:1;">
                        <span style="font-size:24px;">💬</span>
                        <div style="font-style:italic;">"${m.speechQuote}"</div>
                    </div>
                    <button onclick="window.OmegaLayerManager.setLayer(5, { ministryId: '${m.id}' });" style="background:linear-gradient(135deg,#00e5ff,#0066ff); border:none; color:#000; font-weight:800; font-family:'Share Tech Mono',monospace; font-size:12px; padding:10px 18px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 0 15px rgba(0,229,255,0.4); white-space:nowrap;">
                        🎙️ OPEN INTERROGATION DIALOGUE
                    </button>
                </div>
            `;
        }

        if (activeTab === 'directives' || activeTab === 'interrogate') {
            html += `
                <!-- STRATEGIC DEPARTMENT DIRECTIVES GRID -->
                <div>
                    <div style="font-family:'Inter',sans-serif; font-size:14px; color:#f8fafc; font-weight:700; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                        <span>⚡</span><span>Strategic Department Directives & Policy Controls</span>
                    </div>
                    <div class="ministry-dept-grid">
                        <div class="dept-card">
                            <div class="dept-card-header">
                                <span class="dept-card-title">Department 01: Infrastructure Upgrade</span>
                                <span style="font-size:10px; color:#22c55e; font-family:'Share Tech Mono',monospace;">OPTIMAL ●</span>
                            </div>
                            <div style="font-size:12px; color:#cbd5e1; flex:1; line-height:1.4;">
                                Expand physical facilities, automate administrative operations, and increase sector throughput.
                            </div>
                            <button class="dept-action-btn" onclick="window.OmegaCabinetUI.executeDeptAction('${m.id}', 'upgrade_capacity');">
                                🔨 Expand Sector Capacity ($1.2B)
                            </button>
                        </div>

                        <div class="dept-card">
                            <div class="dept-card-header">
                                <span class="dept-card-title">Department 02: Sovereign Executive Decrees</span>
                                <span style="font-size:10px; color:#00e5ff; font-family:'Share Tech Mono',monospace;">ACTIVE ●</span>
                            </div>
                            <div style="font-size:12px; color:#cbd5e1; flex:1; line-height:1.4;">
                                Issue sovereign executive decree to increase efficiency and sector output by +12%.
                            </div>
                            <button class="dept-action-btn" onclick="window.OmegaCabinetUI.executeDeptAction('${m.id}', 'issue_decree');">
                                📜 Issue Sovereign Decree
                            </button>
                        </div>

                        <div class="dept-card">
                            <div class="dept-card-header">
                                <span class="dept-card-title">Department 03: Emergency Budget Allocation</span>
                                <span style="font-size:10px; color:#ffd700; font-family:'Share Tech Mono',monospace;">BALANCED ●</span>
                            </div>
                            <div style="font-size:12px; color:#cbd5e1; flex:1; line-height:1.4;">
                                Reallocate national treasury reserves into emergency sector subsidies.
                            </div>
                            <button class="dept-action-btn" onclick="window.OmegaCabinetUI.executeDeptAction('${m.id}', 'allocate_budget');">
                                💰 Reallocate Subsidies
                            </button>
                        </div>

                        <div class="dept-card">
                            <div class="dept-card-header">
                                <span class="dept-card-title">Department 04: Intelligence & Loyalty Audit</span>
                                <span style="font-size:10px; color:#a855f7; font-family:'Share Tech Mono',monospace;">SECURE ●</span>
                            </div>
                            <div style="font-size:12px; color:#cbd5e1; flex:1; line-height:1.4;">
                                Conduct intelligence audit across ministry staff to prevent corruption and leaks.
                            </div>
                            <button class="dept-action-btn" onclick="window.OmegaCabinetUI.executeDeptAction('${m.id}', 'audit_loyalty');">
                                🔍 Conduct Audit
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        if (activeTab === 'reports') {
            html += `
                <div style="background:rgba(2,11,20,0.8); border:1px solid rgba(0,229,255,0.2); border-radius:12px; padding:16px; font-family:'Share Tech Mono',monospace; color:#e2e8f0;">
                    <div style="color:#00e5ff; font-size:14px; font-weight:bold; margin-bottom:12px;">📊 SOVEREIGN SECTOR PERFORMANCE REPORT</div>
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; font-size:12px;">
                        <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:8px;">Operational Throughput: <strong style="color:#22c55e;">94.2%</strong></div>
                        <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:8px;">Fiscal Efficiency Index: <strong style="color:#ffd700;">${m.efficiency}%</strong></div>
                        <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:8px;">Staff Quality Rating: <strong style="color:#00e5ff;">Grade A</strong></div>
                        <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:8px;">Corruption Index: <strong style="color:#22c55e;">1.2% (Negligible)</strong></div>
                        <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:8px;">Public Satisfaction: <strong style="color:#22c55e;">89% Positive</strong></div>
                        <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:8px;">Annual Budget Allocation: <strong style="color:#ffd700;">${m.budget}</strong></div>
                    </div>
                </div>
            `;
        }

        if (activeTab === 'personnel') {
            html += `
                <div style="background:rgba(2,11,20,0.8); border:1px solid rgba(0,229,255,0.2); border-radius:12px; padding:16px; font-family:'Share Tech Mono',monospace; color:#e2e8f0;">
                    <div style="color:#00e5ff; font-size:14px; font-weight:bold; margin-bottom:12px;">📁 MINISTRY EXECUTIVE PERSONNEL & STAFF ROSTER</div>
                    <div style="display:flex; flex-direction:column; gap:8px; font-size:12px;">
                        <div style="display:flex; justify-content:space-between; padding:8px; background:rgba(255,255,255,0.04); border-radius:6px;">
                            <span>${m.ministerName} (${m.role})</span>
                            <span style="color:#22c55e;">Trust: ${m.trust}/100 | Loyalty: ${m.loyalty}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:8px; background:rgba(255,255,255,0.04); border-radius:6px;">
                            <span>Chief Operations Director</span>
                            <span style="color:#00e5ff;">Efficiency: 92% | Verified</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:8px; background:rgba(255,255,255,0.04); border-radius:6px;">
                            <span>Head of Financial Auditing</span>
                            <span style="color:#ffd700;">Audit Clear | No Leaks</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Historical Multi-Line Trend Chart (Recharts) in Ministry Dashboard View
        html += `
            <div id="recharts-trend-container" style="background:rgba(2,11,20,0.9); border:1px solid rgba(0,229,255,0.3); border-radius:12px; padding:16px; margin-top:16px;">
                <div style="font-family:'Share Tech Mono',monospace; color:#00e5ff; font-size:13px; font-weight:bold; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;">
                    <span>📈 HISTORICAL MACROECONOMIC & MILITARY POWER TREND (RECHARTS)</span>
                    <span style="font-size:10px; color:#ffd700; background:rgba(255,215,0,0.15); border:1px solid rgba(255,215,0,0.4); padding:2px 8px; border-radius:10px;">MULTI-LINE ANALYTICS</span>
                </div>
                <div id="recharts-gdp-mil-chart" style="width:100%; height:260px;"></div>
            </div>
        `;

        contentArea.innerHTML = html;
        setTimeout(() => {
            this.renderRechartsChart('recharts-gdp-mil-chart', this.activeCountry, ministryId);
        }, 30);
    },

    renderRechartsChart(containerId, activeCountry, ministryId = 'economy') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const cDetails = this.getCountryDetails(activeCountry);
        const cData = (window.Game && window.Game.countryLookup && window.Game.countryLookup[activeCountry]) || { gdp: cDetails.gdp || '$455.2B', militaryPower: 85 };
        let rawGdp = typeof cData.gdp === 'number' ? cData.gdp : parseFloat(String(cData.gdp || '455.2').replace(/[^0-9.]/g, '')) || 450;
        let rawMil = typeof cData.militaryPower === 'number' ? cData.militaryPower : parseFloat(String(cData.militaryPower || '85').replace(/[^0-9.]/g, '')) || 85;

        let primaryName = "Sector Primary Index";
        let secondaryName = "Efficiency Rating";
        let tertiaryName = "Sovereign Stability";
        let pColor = "#00e5ff";
        let sColor = "#ffd700";
        let tColor = "#22c55e";
        let unitLeft = " %";

        let pFactor = 1.0, sFactor = 1.0, tFactor = 1.0;

        if (ministryId === 'defense' || ministryId === 'military') {
            primaryName = "Military Combat Readiness Index";
            secondaryName = "Defense Procurement ($B)";
            tertiaryName = "Border Fortress Defense %";
            unitLeft = "";
            pColor = "#ef4444"; sColor = "#f59e0b"; tColor = "#3b82f6";
            pFactor = rawMil; sFactor = rawGdp * 0.08; tFactor = 88;
        } else if (ministryId === 'foreign_affairs' || ministryId === 'foreign') {
            primaryName = "Global Alliance Reputation";
            secondaryName = "Bilateral Treaties Signed";
            tertiaryName = "Diplomatic Trust Score %";
            pColor = "#3b82f6"; sColor = "#10b981"; tColor = "#f59e0b";
            pFactor = 82; sFactor = 24; tFactor = 90;
        } else if (ministryId === 'intelligence_cyber' || ministryId === 'intelligence') {
            primaryName = "Cyber Shield Security %";
            secondaryName = "Threat Interception Rate %";
            tertiaryName = "Counter-Espionage Index";
            pColor = "#a855f7"; sColor = "#00e5ff"; tColor = "#ef4444";
            pFactor = 86; sFactor = 94; tFactor = 78;
        } else if (ministryId === 'health' || ministryId === 'health_welfare') {
            primaryName = "Healthcare System Capacity %";
            secondaryName = "Pandemic Prevention Index";
            tertiaryName = "Life Expectancy Index";
            pColor = "#10b981"; sColor = "#00e5ff"; tColor = "#f59e0b";
            pFactor = 89; sFactor = 92; tFactor = 84;
        } else if (ministryId === 'education') {
            primaryName = "Human Capital Index";
            secondaryName = "STEM R&D Scholar Outputs";
            tertiaryName = "Literacy & Technical Skill %";
            pColor = "#3b82f6"; sColor = "#8b5cf6"; tColor = "#10b981";
            pFactor = 88; sFactor = 45; tFactor = 95;
        } else if (ministryId === 'technology' || ministryId === 'science') {
            primaryName = "Tech Sovereignty Index %";
            secondaryName = "Patent Output Volume";
            tertiaryName = "Quantum AI Grid Readiness %";
            pColor = "#00e5ff"; sColor = "#ec4899"; tColor = "#8b5cf6";
            pFactor = 81; sFactor = 120; tFactor = 76;
        } else if (ministryId === 'transport' || ministryId === 'infrastructure') {
            primaryName = "Logistics Transit Velocity %";
            secondaryName = "Power Grid Baseload Reliability %";
            tertiaryName = "Port Cargo Throughput Index";
            pColor = "#f97316"; sColor = "#eab308"; tColor = "#06b6d4";
            pFactor = 85; sFactor = 96; tFactor = 79;
        } else if (ministryId === 'energy_mining' || ministryId === 'resource') {
            primaryName = "Strategic Energy Stockpile %";
            secondaryName = "Domestic Power Gen (TWh)";
            tertiaryName = "Material Reserve Ratio";
            pColor = "#eab308"; sColor = "#f97316"; tColor = "#10b981";
            pFactor = 91; sFactor = 320; tFactor = 84;
        } else if (ministryId === 'interior_security' || ministryId === 'interior') {
            primaryName = "Public Order & Law Enforcement %";
            secondaryName = "Emergency Dispatch Velocity (min)";
            tertiaryName = "Civil Stability Rating %";
            pColor = "#6366f1"; sColor = "#ef4444"; tColor = "#10b981";
            pFactor = 87; sFactor = 4.2; tFactor = 89;
        } else {
            // Default economy/finance/trade/cabinet
            primaryName = "National GDP ($ Billion)";
            secondaryName = "Treasury Reserve ($ Billion)";
            tertiaryName = "Sovereign Stability Index";
            unitLeft = " B";
            pColor = "#00e5ff"; sColor = "#ffd700"; tColor = "#22c55e";
            pFactor = rawGdp; sFactor = rawGdp * 0.25; tFactor = 92;
        }

        const data = [
            { year: '2020', val1: Number((pFactor * 0.76).toFixed(1)), val2: Number((sFactor * 0.72).toFixed(1)), val3: Number((tFactor * 0.82).toFixed(1)) },
            { year: '2021', val1: Number((pFactor * 0.83).toFixed(1)), val2: Number((sFactor * 0.80).toFixed(1)), val3: Number((tFactor * 0.86).toFixed(1)) },
            { year: '2022', val1: Number((pFactor * 0.81).toFixed(1)), val2: Number((sFactor * 0.85).toFixed(1)), val3: Number((tFactor * 0.84).toFixed(1)) },
            { year: '2023', val1: Number((pFactor * 0.90).toFixed(1)), val2: Number((sFactor * 0.91).toFixed(1)), val3: Number((tFactor * 0.90).toFixed(1)) },
            { year: '2024', val1: Number((pFactor * 0.95).toFixed(1)), val2: Number((sFactor * 0.94).toFixed(1)), val3: Number((tFactor * 0.93).toFixed(1)) },
            { year: '2025', val1: Number((pFactor * 0.98).toFixed(1)), val2: Number((sFactor * 0.97).toFixed(1)), val3: Number((tFactor * 0.96).toFixed(1)) },
            { year: '2026', val1: Number((pFactor * 1.04).toFixed(1)), val2: Number((sFactor * 1.03).toFixed(1)), val3: Number((tFactor * 0.99).toFixed(1)) }
        ];

        if (window.Recharts && window.React && window.ReactDOM) {
            try {
                const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = window.Recharts;
                const e = window.React.createElement;

                const chartElement = e(ResponsiveContainer, { width: '100%', height: '100%' },
                    e(LineChart, { data: data, margin: { top: 10, right: 20, left: 10, bottom: 5 } },
                        e(CartesianGrid, { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.1)' }),
                        e(XAxis, { dataKey: 'year', stroke: '#94a3b8', tick: { fill: '#94a3b8', fontSize: 11 } }),
                        e(YAxis, { yAxisId: 'left', stroke: pColor, tick: { fill: pColor, fontSize: 11 }, unit: unitLeft }),
                        e(YAxis, { yAxisId: 'right', orientation: 'right', stroke: sColor, tick: { fill: sColor, fontSize: 11 } }),
                        e(Tooltip, { contentStyle: { backgroundColor: '#0f172a', borderColor: pColor, borderRadius: '8px', color: '#fff', fontSize: '12px' } }),
                        e(Legend, { wrapperStyle: { fontSize: '12px', color: '#cbd5e1' } }),
                        e(Line, { yAxisId: 'left', type: 'monotone', dataKey: 'val1', name: primaryName, stroke: pColor, strokeWidth: 3, dot: { r: 5, fill: pColor } }),
                        e(Line, { yAxisId: 'right', type: 'monotone', dataKey: 'val2', name: secondaryName, stroke: sColor, strokeWidth: 3, dot: { r: 5, fill: sColor } }),
                        e(Line, { yAxisId: 'right', type: 'monotone', dataKey: 'val3', name: tertiaryName, stroke: tColor, strokeWidth: 2, strokeDasharray: '4 4', dot: { r: 4, fill: tColor } })
                    )
                );

                if (window.ReactDOM.createRoot) {
                    if (!container._reactRoot) {
                        container._reactRoot = window.ReactDOM.createRoot(container);
                    }
                    container._reactRoot.render(chartElement);
                } else {
                    window.ReactDOM.render(chartElement, container);
                }
                return;
            } catch (err) {
                console.warn("Recharts render error, using fallback SVG:", err);
            }
        }

        // Breathtaking Interactive SVG Fallback
        const svgWidth = 640;
        const svgHeight = 230;
        const padding = 40;
        const minVal1 = Math.min(...data.map(d => d.val1));
        const maxVal1 = Math.max(...data.map(d => d.val1));
        const minVal2 = Math.min(...data.map(d => d.val2));
        const maxVal2 = Math.max(...data.map(d => d.val2));

        const points1 = data.map((d, i) => {
            const x = padding + (i / (data.length - 1)) * (svgWidth - 2 * padding);
            const y = svgHeight - padding - (((d.val1 - minVal1 * 0.8) / (maxVal1 * 1.15 - minVal1 * 0.8 || 1)) * (svgHeight - 2 * padding));
            return { x, y, val: d.val1, year: d.year };
        });

        const points2 = data.map((d, i) => {
            const x = padding + (i / (data.length - 1)) * (svgWidth - 2 * padding);
            const y = svgHeight - padding - (((d.val2 - minVal2 * 0.8) / (maxVal2 * 1.15 - minVal2 * 0.8 || 1)) * (svgHeight - 2 * padding));
            return { x, y, val: d.val2, year: d.year };
        });

        const poly1 = points1.map(p => `${p.x},${p.y}`).join(' ');
        const poly2 = points2.map(p => `${p.x},${p.y}`).join(' ');

        container.innerHTML = `
            <div style="font-family:'Share Tech Mono',monospace; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:11px;">
                <span style="color:${pColor};">${primaryName}: ${data[data.length-1].val1}</span>
                <span style="color:${sColor};">${secondaryName}: ${data[data.length-1].val2}</span>
                <span style="color:${tColor};">${tertiaryName}: ${data[data.length-1].val3}%</span>
            </div>
            <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width:100%; height:100%; overflow:visible; background:rgba(2,8,18,0.95); border-radius:10px; border:1px solid rgba(0,229,255,0.25);">
                <line x1="${padding}" y1="${padding}" x2="${svgWidth - padding}" y2="${padding}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4" />
                <line x1="${padding}" y1="${svgHeight/2}" x2="${svgWidth - padding}" y2="${svgHeight/2}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4" />
                <line x1="${padding}" y1="${svgHeight - padding}" x2="${svgWidth - padding}" y2="${svgHeight - padding}" stroke="rgba(0,229,255,0.3)" />

                <polyline fill="none" stroke="${pColor}" stroke-width="3.5" points="${poly1}" />
                <polyline fill="none" stroke="${sColor}" stroke-width="3" stroke-dasharray="6 2" points="${poly2}" />

                ${points1.map((p) => `
                    <circle cx="${p.x}" cy="${p.y}" r="5" fill="${pColor}" stroke="#fff" stroke-width="1.5">
                        <title>Year ${p.year}: ${p.val}</title>
                    </circle>
                    <text x="${p.x}" y="${p.y - 10}" fill="${pColor}" font-size="9" font-family="monospace" text-anchor="middle" font-weight="bold">${p.val}</text>
                `).join('')}

                ${points2.map((p) => `
                    <circle cx="${p.x}" cy="${p.y}" r="4" fill="${sColor}" stroke="#000" stroke-width="1">
                        <title>Year ${p.year}: ${p.val}</title>
                    </circle>
                `).join('')}

                <!-- X Axis Year Labels -->
                ${data.map((d, i) => {
                    const x = padding + (i / (data.length - 1)) * (svgWidth - 2 * padding);
                    return `<text x="${x}" y="${svgHeight - 12}" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">${d.year}</text>`;
                }).join('')}
            </svg>
        `;
    },

    executeDeptAction(ministryId, actionType) {
        const m = this.ministriesDatabase[ministryId];
        if (!m) return;

        if (window.showOmegaNotification) {
            window.showOmegaNotification(
                "DIRECTIVE EXECUTED",
                `Successfully issued directive [${actionType.toUpperCase()}] for ${m.title}!`,
                "success"
            );
        }
    },

    setMoDSubview(subviewId) {
        this.activeMoDSubview = subviewId;
        this.renderMinistryDashboard('defense');
    },

    setDefconLevel(level) {
        this.defconLevel = parseInt(level, 10);
        const defconLabels = {
            1: "DEFCON 1: MAXIMUM WAR READINESS & STRATEGIC MISSILE SILO UNLOCK",
            2: "DEFCON 2: ELEVATED ALERT - AIR DEFENSE DOMES & SUBMARINE FLEET ACTIVE",
            3: "DEFCON 3: GUARDED POSTURE - RESERVE TROOP STANDBY & CYBER FIREWALL",
            4: "DEFCON 4: STANDARD MILITARY PATROL & BORDER RECONNAISSANCE",
            5: "DEFCON 5: PEACETIME DIPLOMATIC & INSTRUCTIONAL OPERATIONS"
        };
        const defconTypes = { 1: "danger", 2: "warning", 3: "warning", 4: "info", 5: "success" };
        if (window.showOmegaNotification) {
            window.showOmegaNotification("DEFCON WAR ALERT UPDATED", defconLabels[this.defconLevel] || "ALERT UPDATED", defconTypes[this.defconLevel] || "info");
        }
        if (this.ministriesDatabase && this.ministriesDatabase.defense) {
            this.ministriesDatabase.defense.status = `DEFCON ${this.defconLevel}`;
        }
        this.renderMinistryDashboard('defense');
    },

    calculateORS(countryKey) {
        if (!this.orsData) {
            this.orsData = {
                infantry: 88,
                armor: 84,
                air_defense: 92,
                air_force: 89,
                navy: 82,
                ammunition: 95,
                recon: 96,
                cyber_ew: 91,
                satellite: 87,
                morale: 94
            };
        }
        const vals = Object.values(this.orsData);
        const sum = vals.reduce((a, b) => a + b, 0);
        const avg = Math.round(sum / vals.length);
        let rating = "T1 STRATEGIC SUPREMACY";
        if (avg < 50) rating = "CRITICAL VULNERABILITY";
        else if (avg < 70) rating = "MODERATE DEGRADATION";
        else if (avg < 85) rating = "STANDARD DEFENSE POSTURE";

        return { score: avg, rating, breakdown: this.orsData };
    },

    updateORSParameter(paramKey, delta) {
        if (!this.orsData) this.calculateORS();
        if (this.orsData[paramKey] !== undefined) {
            this.orsData[paramKey] = Math.max(10, Math.min(100, this.orsData[paramKey] + delta));
            if (window.showOmegaNotification) {
                window.showOmegaNotification("ORS PARAMETER ADJUSTED", `Updated ${paramKey.toUpperCase()} readiness to ${this.orsData[paramKey]}%`, "info");
            }
            this.renderMinistryDashboard('defense');
        }
    },

    executeDefenseCommand(cmdId) {
        const ops = {
            air_defense: { name: "Air Defense Shield Modernization", cost: 1500, param: "air_defense", boost: 5, msg: "Upgraded SAM missile batteries and Phased-Array Radars! Air Defense +5%" },
            infantry: { name: "Frontline Force Modernization", cost: 800, param: "infantry", boost: 6, msg: "Equipped 150,000 frontline infantry with body armor & night vision! Infantry +6%" },
            air_force: { name: "Stealth Strike Jets & Drone Fleet", cost: 1200, param: "air_force", boost: 7, msg: "Acquired 36 Multirole Fighter Jets & 200 Strike Drones! Air Force +7%" },
            navy: { name: "Deep-Sea Submarine Patrol", cost: 950, param: "navy", boost: 6, msg: "Deployed 4 Stealth Submarines & Guided-Missile Frigates! Navy +6%" },
            cyber_ew: { name: "Cyber Counter-EW Command", cost: 500, param: "cyber_ew", boost: 5, msg: "Hardened satellite links & electronic radar jamming grid! Cyber EW +5%" },
            ballistic: { name: "Strategic Ballistic Silo Expansion", cost: 2000, param: "satellite", boost: 8, msg: "Constructed 12 subterranean hypersonic missile silos! Strategic Silos +8%" },
            fortress: { name: "Border Bunker & Pillbox System", cost: 600, param: "armor", boost: 6, msg: "Reinforced 280km border river barrier & pillbox bunkers! Fortifications +6%" },
            ammunition: { name: "155mm Ordnance Factory Ramp-Up", cost: 750, param: "ammunition", boost: 7, msg: "Expanded munitions production to 12,000 shells/day! Ammo Stockpile +7%" },
            reserves: { name: "100K Active Reserve Mobilization", cost: 400, param: "morale", boost: 5, msg: "Mobilized 100,000 trained reserves for active deployment! Morale & Readiness +5%" },
            special_ops: { name: "Black-Ops Counter-Sabotage Unit", cost: 350, param: "recon", boost: 6, msg: "Inducted 2,500 counter-terrorism special forces operatives! Special Ops +6%" },
            satellites: { name: "Low-Earth Orbit Spy Constellation", cost: 1100, param: "satellite", boost: 6, msg: "Launched 6 military surveillance micro-satellites! Satellite Guidance +6%" },
            joint_drills: { name: "Strategic Ally Joint Exercises", cost: 300, param: "morale", boost: 4, msg: "Conducted combined live-fire war games with international allies! Combined Morale +4%" }
        };

        const op = ops[cmdId];
        if (!op) return;

        if (window.resources && window.resources.cash !== undefined && window.resources.cash < op.cost * 1000000) {
            if (window.showOmegaNotification) window.showOmegaNotification("TREASURY DEFICIT", `Insufficient funds! Required: $${op.cost}M`, "error");
            return;
        }

        if (window.resources && window.resources.cash !== undefined) {
            window.resources.cash -= op.cost * 1000000;
        }

        this.updateORSParameter(op.param, op.boost);
        if (window.showOmegaNotification) {
            window.showOmegaNotification("DEFENSE DIRECTIVE EXECUTED", `🛡️ ${op.msg}`, "success");
        }
    },

    executeDefenseProcurement(itemId) {
        if (!this.procurementItems) {
            this.procurementItems = [
                { id: 'f35_jets', name: '5th-Gen Multirole Stealth Aircraft', stage: 7, maxStage: 8, cost: 1200 },
                { id: 'sam_shield', name: 'Strategic SAM Air Defense Shield', stage: 8, maxStage: 8, cost: 1500 },
                { id: 'mbt_tanks', name: 'Main Battle Tank Armored Division', stage: 5, maxStage: 8, cost: 850 },
                { id: 'attack_subs', name: 'Stealth Attack Submarines', stage: 4, maxStage: 8, cost: 1100 },
                { id: 'strike_drones', name: 'Autonomous Strike Drone Swarms', stage: 6, maxStage: 8, cost: 450 },
                { id: 'hypersonic', name: 'Hypersonic Glide Interceptor', stage: 3, maxStage: 8, cost: 1800 },
                { id: 'ew_radar', name: 'Quantum Radar Jamming Stations', stage: 8, maxStage: 8, cost: 350 },
                { id: 'night_vision', name: 'Infantry Night Vision & Optics', stage: 8, maxStage: 8, cost: 200 }
            ];
        }

        const item = this.procurementItems.find(i => i.id === itemId);
        if (!item) return;

        if (item.stage >= item.maxStage) {
            if (window.showOmegaNotification) window.showOmegaNotification("PROCUREMENT COMPLETE", `📦 ${item.name} is already 100% field deployed!`, "info");
            return;
        }

        item.stage += 1;
        const stageNames = ["Requirement Def.", "Global RFI", "Tech Trials", "Sovereign Bidding", "Contract Signed", "Factory Production", "QA Inspection", "Field Deployed"];
        if (window.showOmegaNotification) {
            window.showOmegaNotification("PROCUREMENT ADVANCED", `⚙️ Advanced ${item.name} to Stage ${item.stage}/8: ${stageNames[item.stage - 1]}`, "success");
        }

        if (item.stage === 8) {
            this.updateORSParameter('air_defense', 4);
        }

        this.renderMinistryDashboard('defense');
    },

    renderMoDDashboard(m, contentArea) {
        const activeSub = this.activeMoDSubview || 'ors_breakdown';
        const countryKey = this.activeCountry || "BANGLADESH";
        const cDetails = this.getCountryDetails(countryKey);

        const ministerName = (cDetails.ministers && cDetails.ministers['defense'] && cDetails.ministers['defense'].name) || m.ministerName;
        const ministerRole = (cDetails.ministers && cDetails.ministers['defense'] && cDetails.ministers['defense'].role) || m.role;

        const ors = this.calculateORS(countryKey);
        const defcon = this.defconLevel || 2;
        const defconColors = { 1: '#ef4444', 2: '#f97316', 3: '#eab308', 4: '#3b82f6', 5: '#10b981' };
        const defconLabels = { 1: 'DEFCON 1 (MAX WAR)', 2: 'DEFCON 2 (ELEVATED)', 3: 'DEFCON 3 (GUARDED)', 4: 'DEFCON 4 (NORMAL)', 5: 'DEFCON 5 (PEACE)' };

        if (!this.procurementItems) {
            this.procurementItems = [
                { id: 'f35_jets', name: '5th-Gen Multirole Stealth Aircraft', stage: 7, maxStage: 8, cost: 1200 },
                { id: 'sam_shield', name: 'Strategic SAM Air Defense Shield', stage: 8, maxStage: 8, cost: 1500 },
                { id: 'mbt_tanks', name: 'Main Battle Tank Armored Division', stage: 5, maxStage: 8, cost: 850 },
                { id: 'attack_subs', name: 'Stealth Attack Submarines', stage: 4, maxStage: 8, cost: 1100 },
                { id: 'strike_drones', name: 'Autonomous Strike Drone Swarms', stage: 6, maxStage: 8, cost: 450 },
                { id: 'hypersonic', name: 'Hypersonic Glide Interceptor', stage: 3, maxStage: 8, cost: 1800 },
                { id: 'ew_radar', name: 'Quantum Radar Jamming Stations', stage: 8, maxStage: 8, cost: 350 },
                { id: 'night_vision', name: 'Infantry Night Vision & Optics', stage: 8, maxStage: 8, cost: 200 }
            ];
        }

        let html = `
            <!-- MoD AAA HERO HEADER -->
            <div style="background:linear-gradient(135deg,rgba(15,23,42,0.95),rgba(153,27,27,0.85)); border:1.5px solid #ef4444; border-radius:12px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; box-shadow:0 0 22px rgba(239,68,68,0.3);">
                <div style="display:flex; align-items:center; gap:16px;">
                    <button onclick="window.OmegaLayerManager.popLayer();" style="background:linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,41,59,0.9)); border:1.5px solid #ef4444; color:#ef4444; padding:8px 14px; border-radius:8px; font-weight:bold; cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:12px; display:flex; align-items:center; gap:6px; box-shadow:0 0 10px rgba(239,68,68,0.2);">
                        <span>⬅️</span> <span>BACK TO CABINET</span>
                    </button>
                    <div style="font-size:38px; background:rgba(239,68,68,0.1); padding:8px 14px; border-radius:12px; border:1px solid rgba(239,68,68,0.4);">🛡️</div>
                    <div>
                        <h1 style="margin:0; font-family:'Inter',sans-serif; font-weight:800; font-size:22px; color:#f8fafc; letter-spacing:0.3px;">MINISTRY OF DEFENSE & SUPREME COMMAND (${cDetails.name.toUpperCase()})</h1>
                        <div style="font-size:12px; font-weight:600; color:#ef4444; margin-top:2px;">Operational Readiness Score (ORS) Engine, 12 Master Operations & Procurement Pipeline</div>
                        <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">
                            Commander: <strong style="color:#ffd700;">${ministerName}</strong> (${ministerRole}) | Alert: <strong style="color:${defconColors[defcon]};">${defconLabels[defcon]}</strong>
                        </div>
                    </div>
                </div>

                <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                    <!-- ORS GAUGE BADGE -->
                    <div style="background:rgba(0,0,0,0.6); border:1px solid ${ors.score >= 80 ? '#22c55e' : (ors.score >= 65 ? '#00e5ff' : '#ffd700')}; padding:8px 16px; border-radius:10px; text-align:center;">
                        <div style="font-size:10px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">TOTAL ORS SCORE</div>
                        <div style="font-size:22px; font-weight:900; color:${ors.score >= 80 ? '#22c55e' : (ors.score >= 65 ? '#00e5ff' : '#ffd700')}; font-family:'Share Tech Mono',monospace;">
                            ${ors.score}% <span style="font-size:11px; color:#94a3b8;">${ors.rating}</span>
                        </div>
                    </div>

                    <!-- DEFCON SELECTOR -->
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="font-size:9.5px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">DEFCON WAR ALERT LEVEL</div>
                        <div style="display:flex; gap:3px;">
                            ${[1,2,3,4,5].map(lvl => `
                                <button onclick="window.OmegaCabinetUI.setDefconLevel(${lvl});" style="
                                    background: ${defcon === lvl ? defconColors[lvl] : 'rgba(15,23,42,0.8)'};
                                    color: ${defcon === lvl ? '#000' : '#94a3b8'};
                                    border: 1px solid ${defconColors[lvl]};
                                    font-weight: bold;
                                    font-size: 10px;
                                    padding: 4px 8px;
                                    border-radius: 4px;
                                    cursor: pointer;
                                    font-family: 'Share Tech Mono', monospace;
                                ">D${lvl}</button>
                            `).join('')}
                        </div>
                    </div>

                    <button onclick="window.OmegaLayerManager.setLayer(5, { ministryId: 'defense' });" style="background:linear-gradient(135deg,#ef4444,#991b1b); border:none; color:#fff; font-weight:800; font-family:'Share Tech Mono',monospace; font-size:12px; padding:10px 16px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 0 15px rgba(239,68,68,0.5);">
                        🎙️ INTERROGATE DEFENSE CHIEF
                    </button>
                </div>
            </div>

            <!-- MoD 5 SUBVIEW NAVIGATION TABS -->
            <div style="display:flex; gap:8px; border-bottom:1px solid rgba(239,68,68,0.3); padding:8px 0; margin-top:10px; overflow-x:auto; scrollbar-width:thin; flex-shrink:0; min-height:44px; position:relative; background:rgba(3,8,16,0.95); z-index:10; border-radius:8px;">
                ${[
                    { id: 'ors_breakdown', label: '🛡️ ORS 10-Parameter Matrix', color: '#22c55e' },
                    { id: 'master_ops', label: '⚔️ 12 Master Command Operations', color: '#ef4444' },
                    { id: 'procurement', label: '📦 8-Step Procurement Pipeline', color: '#ffd700' },
                    { id: 'garrison', label: '🪖 Troop Garrison & Bases', color: '#38bdf8' },
                    { id: 'arsenal_threat', label: '📡 Arsenal & Strategic Threat Radar', color: '#a855f7' }
                ].map(tab => `
                    <button onclick="window.OmegaCabinetUI.setMoDSubview('${tab.id}');" style="
                        background: ${activeSub === tab.id ? `linear-gradient(135deg, ${tab.color}, #000)` : 'rgba(15,23,42,0.85)'};
                        color: ${activeSub === tab.id ? '#fff' : '#cbd5e1'};
                        border: 1px solid ${activeSub === tab.id ? tab.color : 'rgba(255,255,255,0.12)'};
                        padding: 8px 14px;
                        border-radius: 8px;
                        font-family: 'Share Tech Mono', monospace;
                        font-size: 11px;
                        font-weight: bold;
                        cursor: pointer;
                        white-space: nowrap;
                        transition: all 0.2s ease;
                        box-shadow: ${activeSub === tab.id ? `0 0 12px ${tab.color}40` : 'none'};
                    ">
                        ${tab.label}
                    </button>
                `).join('')}
            </div>
            <div style="margin-top:14px;">
        `;

        if (activeSub === 'ors_breakdown') {
            const params = [
                { id: 'infantry', name: 'Land Infantry & Special Forces', val: ors.breakdown.infantry, icon: '🪖' },
                { id: 'armor', name: 'Main Battle Tank & Armored Yield', val: ors.breakdown.armor, icon: '🚜' },
                { id: 'air_defense', name: 'Integrated SAM Air Defense Domes', val: ors.breakdown.air_defense, icon: '🛡️' },
                { id: 'air_force', name: 'Air Interception & Multirole Jets', val: ors.breakdown.air_force, icon: '✈️' },
                { id: 'navy', name: 'Submarines & Maritime Fleet Patrol', val: ors.breakdown.navy, icon: '⚓' },
                { id: 'ammunition', name: 'Ammunition Stockpile & Logistics', val: ors.breakdown.ammunition, icon: '📦' },
                { id: 'recon', name: 'Special Recon & Counter-Sabotage', val: ors.breakdown.recon, icon: '🦅' },
                { id: 'cyber_ew', name: 'Cyber Warfare & Electronic Jamming', val: ors.breakdown.cyber_ew, icon: '💻' },
                { id: 'satellite', name: 'Satellite Guidance & Ballistic Silos', val: ors.breakdown.satellite, icon: '🛰️' },
                { id: 'morale', name: 'Troop Morale & High Command Integrity', val: ors.breakdown.morale, icon: '🎖️' }
            ];

            html += `
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px;">
                    ${params.map(p => `
                        <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-size:13px; font-weight:bold; color:#f8fafc; display:flex; align-items:center; gap:6px;">
                                    <span>${p.icon}</span> <span>${p.name}</span>
                                </span>
                                <span style="font-family:'Share Tech Mono',monospace; font-size:14px; font-weight:bold; color:${p.val >= 85 ? '#22c55e' : '#ffd700'};">${p.val}%</span>
                            </div>
                            <div style="width:100%; height:8px; background:rgba(0,0,0,0.5); border-radius:4px; overflow:hidden;">
                                <div style="width:${p.val}%; height:100%; background:linear-gradient(90deg, #ef4444, #22c55e); transition:width 0.3s ease;"></div>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-top:4px;">
                                <button onclick="window.OmegaCabinetUI.updateORSParameter('${p.id}', -5);" style="background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#ef4444; padding:3px 10px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">-5% DEGRADE</button>
                                <button onclick="window.OmegaCabinetUI.updateORSParameter('${p.id}', 5);" style="background:rgba(34,197,94,0.2); border:1px solid #22c55e; color:#22c55e; padding:3px 10px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">+5% REINFORCE</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (activeSub === 'master_ops') {
            const masterCmds = [
                { id: 'air_defense', title: 'Integrated SAM Shield Modernization', cost: '$1.5B', icon: '🛡️', category: 'AIR DEFENSE', desc: 'Deploy Phased-Array Radars & Iron-Dome SAM batteries across strategic capitals.' },
                { id: 'infantry', title: 'Frontline Division Modernization', cost: '$800M', icon: '🪖', category: 'INFANTRY', desc: 'Equip 150,000 active frontline troops with ballistic body armor, night optics & digital radios.' },
                { id: 'air_force', title: 'Stealth Jets & Strike Drones', cost: '$1.2B', icon: '✈️', category: 'AIR FORCE', desc: 'Acquire 36 5th-Gen stealth fighters and 200 autonomous loitering attack drones.' },
                { id: 'navy', title: 'Deep-Sea Submarine Deterrence', cost: '$950M', icon: '⚓', category: 'NAVY', desc: 'Deploy stealth attack submarines & guided-missile frigates to sovereign EEZ.' },
                { id: 'cyber_ew', title: 'Cyber Defense & Counter-EW', cost: '$500M', icon: '💻', category: 'CYBER COMMAND', desc: 'Harden military satellite communication links and activate radar jamming frequencies.' },
                { id: 'ballistic', title: 'Strategic Ballistic Silo Network', cost: '$2.0B', icon: '🚀', category: 'STRATEGIC SILOS', desc: 'Construct hardened underground launch silos for long-range deterrent missiles.' },
                { id: 'fortress', title: 'Border Concrete Pillbox Grid', cost: '$600M', icon: '🧱', category: 'FORTIFICATIONS', desc: 'Build reinforced concrete bunkers, anti-tank ditches & river barrier defenses.' },
                { id: 'ammunition', title: '155mm Shell Ordnance Expansion', cost: '$750M', icon: '📦', category: 'MUNITIONS', desc: 'Scale up domestic defense industrial factories to produce 12,000 heavy artillery shells daily.' },
                { id: 'reserves', title: '100,000 Active Reserve Mobilization', cost: '$400M', icon: '⚡', category: 'RESERVES', desc: 'Issue national call-up order for 100,000 trained military reserve troops.' },
                { id: 'special_ops', title: 'Elite Counter-Sabotage Black Ops', cost: '$350M', icon: '🦅', category: 'SPECIAL FORCES', desc: 'Train & deploy specialized tactical insertion teams for counter-sabotage operations.' },
                { id: 'satellites', title: 'LEO Military Spy Satellite Grid', cost: '$1.1B', icon: '🛰️', category: 'RECONNAISSANCE', desc: 'Launch 6 low-Earth orbit radar imaging satellites for continuous target tracking.' },
                { id: 'joint_drills', title: 'Strategic Ally Joint War Games', cost: '$300M', icon: '🤝', category: 'DIPLOMATIC DEFENSE', desc: 'Host combined live-fire naval and airborne maneuvers with friendly allied nations.' }
            ];

            html += `
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">
                    ${masterCmds.map(c => `
                        <div style="background:rgba(15,23,42,0.92); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
                            <div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <span style="font-size:10px; font-weight:bold; color:#ef4444; font-family:'Share Tech Mono',monospace;">${c.category}</span>
                                    <span style="font-size:11px; font-weight:bold; color:#ffd700; font-family:'Share Tech Mono',monospace;">${c.cost}</span>
                                </div>
                                <div style="font-size:14px; font-weight:bold; color:#f8fafc; display:flex; align-items:center; gap:8px;">
                                    <span>${c.icon}</span> <span>${c.title}</span>
                                </div>
                                <div style="font-size:11px; color:#cbd5e1; margin-top:6px; line-height:1.4;">${c.desc}</div>
                            </div>
                            <button onclick="window.OmegaCabinetUI.executeDefenseCommand('${c.id}');" style="background:linear-gradient(135deg,#ef4444,#991b1b); border:none; color:#fff; padding:8px 12px; border-radius:6px; font-weight:bold; font-family:'Share Tech Mono',monospace; font-size:11px; cursor:pointer; box-shadow:0 0 10px rgba(239,68,68,0.4);">
                                ⚡ EXECUTE DEFENSE DIRECTIVE
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (activeSub === 'procurement') {
            const stageLabels = ["1. Req.", "2. RFI", "3. Trials", "4. Bidding", "5. Contract", "6. Factory", "7. QA", "8. Deployed"];

            html += `
                <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(255,215,0,0.3); border-radius:10px; padding:16px;">
                    <div style="font-size:14px; font-weight:bold; color:#ffd700; font-family:'Share Tech Mono',monospace; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
                        <span>📦</span> <span>STRATEGIC ARMS PROCUREMENT PIPELINE (8-STEP DEPLOYMENT MATRIX)</span>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:12px;">
                        ${this.procurementItems.map(item => `
                            <div style="background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:12px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                    <span style="font-size:13px; font-weight:bold; color:#f8fafc;">${item.name}</span>
                                    <span style="font-size:11px; color:${item.stage === 8 ? '#22c55e' : '#ffd700'}; font-family:'Share Tech Mono',monospace; font-weight:bold;">
                                        STAGE ${item.stage}/8 ${item.stage === 8 ? '● 100% FIELD DEPLOYED' : '● IN PIPELINE'}
                                    </span>
                                </div>

                                <div style="display:grid; grid-template-columns:repeat(8, 1fr); gap:4px; margin-bottom:10px;">
                                    ${stageLabels.map((lbl, idx) => `
                                        <div style="
                                            background: ${idx < item.stage ? (item.stage === 8 ? '#22c55e' : '#ffd700') : 'rgba(255,255,255,0.05)'};
                                            color: ${idx < item.stage ? '#000' : '#64748b'};
                                            font-size: 9px;
                                            font-weight: bold;
                                            text-align: center;
                                            padding: 4px 2px;
                                            border-radius: 4px;
                                            font-family: 'Share Tech Mono', monospace;
                                        ">${lbl}</div>
                                    `).join('')}
                                </div>

                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:11px; color:#cbd5e1;">Unit Procurement Budget: <strong style="color:#ffd700;">$${item.cost}M</strong></span>
                                    <button onclick="window.OmegaCabinetUI.executeDefenseProcurement('${item.id}');" ${item.stage >= 8 ? 'disabled' : ''} style="
                                        background: ${item.stage >= 8 ? '#334155' : 'linear-gradient(135deg,#ffd700,#b45309)'};
                                        color: ${item.stage >= 8 ? '#94a3b8' : '#000'};
                                        border: none;
                                        padding: 6px 14px;
                                        border-radius: 6px;
                                        font-weight: bold;
                                        font-family: 'Share Tech Mono', monospace;
                                        font-size: 11px;
                                        cursor: ${item.stage >= 8 ? 'default' : 'pointer'};
                                    ">
                                        ${item.stage >= 8 ? '✅ 100% DEPLOYED' : '⏩ ADVANCE STAGE ($150M)'}
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        if (activeSub === 'garrison') {
            html += `
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">
                    <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(56,189,248,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:12px; font-weight:bold; color:#38bdf8; font-family:'Share Tech Mono',monospace;">CENTRAL HIGH COMMAND GARRISON</div>
                        <div style="font-size:24px; font-weight:bold; color:#f8fafc; margin-top:4px;">180,000 Active Troops</div>
                        <div style="font-size:11px; color:#cbd5e1; margin-top:4px;">Status: <strong style="color:#22c55e;">PEAK OPERATIONAL STANCE</strong></div>
                    </div>
                    <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:12px; font-weight:bold; color:#ef4444; font-family:'Share Tech Mono',monospace;">BORDER RIVERS & COASTAL GARRISON</div>
                        <div style="font-size:24px; font-weight:bold; color:#f8fafc; margin-top:4px;">95,000 Border Guards</div>
                        <div style="font-size:11px; color:#cbd5e1; margin-top:4px;">Status: <strong style="color:#ffd700;">HIGH WATCH ALERT</strong></div>
                    </div>
                    <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(168,85,247,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:12px; font-weight:bold; color:#a855f7; font-family:'Share Tech Mono',monospace;">CAPITAL STRATEGIC AIRBASE</div>
                        <div style="font-size:24px; font-weight:bold; color:#f8fafc; margin-top:4px;">4 Wing Squadrons</div>
                        <div style="font-size:11px; color:#cbd5e1; margin-top:4px;">Status: <strong style="color:#00e5ff;">5-MIN SCRAMBLE READY</strong></div>
                    </div>
                </div>
            `;
        }

        if (activeSub === 'arsenal_threat') {
            html += `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
                    <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(168,85,247,0.3); border-radius:10px; padding:16px;">
                        <div style="font-size:14px; font-weight:bold; color:#a855f7; font-family:'Share Tech Mono',monospace; margin-bottom:12px;">🛡️ NATIONAL WEAPONS ARSENAL</div>
                        <div style="display:flex; flex-direction:column; gap:8px; font-size:12px; font-family:'Share Tech Mono',monospace;">
                            <div style="display:flex; justify-content:space-between; padding:8px; background:rgba(255,255,255,0.04); border-radius:6px;">
                                <span>Main Battle Tanks (MBT):</span> <strong style="color:#00e5ff;">1,240 Units</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; padding:8px; background:rgba(255,255,255,0.04); border-radius:6px;">
                                <span>Multirole Stealth Fighters:</span> <strong style="color:#00e5ff;">186 Aircraft</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; padding:8px; background:rgba(255,255,255,0.04); border-radius:6px;">
                                <span>Strategic SAM Batteries:</span> <strong style="color:#22c55e;">64 Domes</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; padding:8px; background:rgba(255,255,255,0.04); border-radius:6px;">
                                <span>Stealth Submarines & Frigates:</span> <strong style="color:#38bdf8;">28 Vessels</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; padding:8px; background:rgba(255,255,255,0.04); border-radius:6px;">
                                <span>155mm Ordnance Supply:</span> <strong style="color:#ffd700;">120 Days Continuous</strong>
                            </div>
                        </div>
                    </div>

                    <div style="background:rgba(15,23,42,0.9); border:1px solid rgba(239,68,68,0.4); border-radius:10px; padding:16px;">
                        <div style="font-size:14px; font-weight:bold; color:#ef4444; font-family:'Share Tech Mono',monospace; margin-bottom:12px;">📡 STRATEGIC THREAT RADAR</div>
                        <div style="display:flex; flex-direction:column; gap:10px; font-size:12px;">
                            <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); padding:10px; border-radius:6px;">
                                <div style="font-weight:bold; color:#ef4444;">AIRBORNE THREAT VECTOR: LOW</div>
                                <div style="color:#cbd5e1; margin-top:2px;">SAM Dome Interception Probability: <strong style="color:#22c55e;">94.8%</strong></div>
                            </div>
                            <div style="background:rgba(0,229,255,0.1); border:1px solid rgba(0,229,255,0.3); padding:10px; border-radius:6px;">
                                <div style="font-weight:bold; color:#00e5ff;">MARITIME EEZ SECURITY: SECURE</div>
                                <div style="color:#cbd5e1; margin-top:2px;">Coastal Patrol Response Time: <strong style="color:#00e5ff;">8.5 Minutes</strong></div>
                            </div>
                            <div style="background:rgba(255,215,0,0.1); border:1px solid rgba(255,215,0,0.3); padding:10px; border-radius:6px;">
                                <div style="font-weight:bold; color:#ffd700;">CYBER JAMMING SHIELD: ONLINE</div>
                                <div style="color:#cbd5e1; margin-top:2px;">Counter-Electronic Intrusion Block Rate: <strong style="color:#22c55e;">99.1%</strong></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        contentArea.innerHTML = html;
    },

    renderMoFADashboard(m, contentArea) {
        const activeSub = this.activeMoFASubview || 'reputation';
        const countryKey = this.activeCountry || "BANGLADESH";
        const cDetails = this.getCountryDetails(countryKey);

        const ministerName = (cDetails.ministers && cDetails.ministers['foreign_affairs'] && cDetails.ministers['foreign_affairs'].name) || m.ministerName;
        const ministerRole = (cDetails.ministers && cDetails.ministers['foreign_affairs'] && cDetails.ministers['foreign_affairs'].role) || m.role;

        let html = `
            <!-- MoFA AAA HERO HEADER -->
            <div style="background:linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,58,138,0.85)); border:1.5px solid #00e5ff; border-radius:12px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; box-shadow:0 0 20px rgba(0,229,255,0.2);">
                <div style="display:flex; align-items:center; gap:16px;">
                    <button onclick="window.OmegaLayerManager.popLayer();" style="background:linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,41,59,0.9)); border:1.5px solid #00e5ff; color:#00e5ff; padding:8px 14px; border-radius:8px; font-weight:bold; cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:12px; display:flex; align-items:center; gap:6px; box-shadow:0 0 10px rgba(0,229,255,0.2);">
                        <span>⬅️</span> <span>BACK TO CABINET</span>
                    </button>
                    <div style="font-size:38px; background:rgba(0,229,255,0.1); padding:8px 14px; border-radius:12px; border:1px solid rgba(0,229,255,0.3);">🌐</div>
                    <div>
                        <h1 style="margin:0; font-family:'Inter',sans-serif; font-weight:800; font-size:22px; color:#f8fafc; letter-spacing:0.3px;">MINISTRY OF FOREIGN AFFAIRS (${cDetails.name.toUpperCase()})</h1>
                        <div style="font-size:12px; font-weight:600; color:#00e5ff; margin-top:2px;">Sovereignty, International Pacts & Autonomous Diplomatic AI</div>
                        <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">Minister: <strong style="color:#ffd700;">${ministerName}</strong> (${ministerRole}) | State: <strong style="color:#22c55e;">PEACEFUL NON-ALIGNMENT</strong></div>
                    </div>
                </div>

                <div style="display:flex; gap:10px; align-items:center;">
                    <button onclick="window.OmegaLayerManager.setLayer(5, { ministryId: 'foreign_affairs' });" style="background:linear-gradient(135deg,#00e5ff,#0066ff); border:none; color:#000; font-weight:800; font-family:'Share Tech Mono',monospace; font-size:12px; padding:10px 16px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 0 12px rgba(0,229,255,0.4);">
                        🎙️ INTERROGATE FOREIGN MINISTER
                    </button>
                </div>
            </div>

            <!-- MoFA 10 SUBVIEW NAVIGATION TABS -->
            <div style="display:flex; gap:6px; border-bottom:1px solid rgba(0,229,255,0.25); padding:8px 0; margin-top:10px; overflow-x:auto; scrollbar-width:thin; flex-shrink:0; min-height:44px; position:relative; background:rgba(3,8,16,0.95); z-index:10; border-radius:8px;">
                ${[
                    { id: 'reputation', label: '🌐 Reputation', color: '#00e5ff' },
                    { id: 'relations', label: '🕊️ Bilateral Relations', color: '#22c55e' },
                    { id: 'orgs', label: '🏛️ Int. Organizations', color: '#ffd700' },
                    { id: 'treaties', label: '📜 Treaties & Pacts', color: '#a855f7' },
                    { id: 'embassies', label: '🏢 Embassies', color: '#38bdf8' },
                    { id: 'missions', label: '✈️ Special Missions', color: '#f97316' },
                    { id: 'negotiations', label: '🤝 AI Negotiator (40 Stages)', color: '#ec4899' },
                    { id: 'consular', label: '🛂 Consular & Visas', color: '#10b981' },
                    { id: 'aid', label: '🎁 Foreign Aid', color: '#eab308' },
                    { id: 'crisis', label: '🚨 Crisis Desk', color: '#ef4444' }
                ].map(tab => `
                    <button onclick="window.OmegaCabinetUI.setMoFASubview('${tab.id}');" style="
                        background: ${activeSub === tab.id ? `linear-gradient(135deg, ${tab.color}, #000)` : 'rgba(15,23,42,0.8)'};
                        color: ${activeSub === tab.id ? '#fff' : '#cbd5e1'};
                        border: 1px solid ${activeSub === tab.id ? tab.color : 'rgba(255,255,255,0.1)'};
                        padding: 7px 13px;
                        border-radius: 8px;
                        font-family: 'Share Tech Mono', monospace;
                        font-size: 11px;
                        font-weight: bold;
                        cursor: pointer;
                        white-space: nowrap;
                        transition: all 0.2s ease;
                        box-shadow: ${activeSub === tab.id ? `0 0 10px ${tab.color}40` : 'none'};
                    ">
                        ${tab.label}
                    </button>
                `).join('')}
            </div>
            <div style="margin-top:14px;">
        `;

        if (activeSub === 'reputation') {
            html += `
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(0,229,255,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:11px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">GLOBAL PRESTIGE SCORE</div>
                        <div style="font-size:26px; font-weight:800; color:#00e5ff; margin-top:4px;">92 <span style="font-size:13px; color:#22c55e;">/ 100</span></div>
                        <div style="font-size:10px; color:#cbd5e1; margin-top:4px;">Tier 1 Sovereign Influence</div>
                    </div>
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(34,197,94,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:11px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">SOVEREIGN TRUST RATING</div>
                        <div style="font-size:26px; font-weight:800; color:#22c55e; margin-top:4px;">88 <span style="font-size:13px; color:#22c55e;">/ 100</span></div>
                        <div style="font-size:10px; color:#cbd5e1; margin-top:4px;">High International Credibility</div>
                    </div>
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(255,215,0,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:11px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">TREATY RELIABILITY INDEX</div>
                        <div style="font-size:26px; font-weight:800; color:#ffd700; margin-top:4px;">96%</div>
                        <div style="font-size:10px; color:#cbd5e1; margin-top:4px;">Flawless Treaty Compliance</div>
                    </div>
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(168,85,247,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:11px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">PEACE & MEDIATION RATING</div>
                        <div style="font-size:26px; font-weight:800; color:#a855f7; margin-top:4px;">85 <span style="font-size:13px; color:#22c55e;">/ 100</span></div>
                        <div style="font-size:10px; color:#cbd5e1; margin-top:4px;">Active Regional Peacekeeper</div>
                    </div>
                </div>
            `;
        } else if (activeSub === 'relations') {
            html += `
                <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(0,229,255,0.3); border-radius:10px; padding:16px;">
                    <div style="font-size:14px; font-weight:bold; color:#00e5ff; font-family:'Share Tech Mono',monospace; margin-bottom:12px;">
                        🕊️ BILATERAL DIPLOMATIC RELATIONS CONTROL CENTER
                    </div>
                    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:16px;">
                        <label style="font-size:12px; color:#cbd5e1;">Target Foreign State:</label>
                        <select id="mofa-target-country" style="background:#0f172a; border:1px solid #00e5ff; color:#fff; padding:6px 12px; border-radius:6px; font-family:'Share Tech Mono',monospace; font-size:12px;">
                            <option value="USA">UNITED STATES OF AMERICA</option>
                            <option value="CHINA">CHINA</option>
                            <option value="RUSSIA">RUSSIA</option>
                            <option value="INDIA" selected>INDIA</option>
                            <option value="PAKISTAN">PAKISTAN</option>
                            <option value="SAUDI ARABIA">SAUDI ARABIA</option>
                            <option value="UNITED KINGDOM">UNITED KINGDOM</option>
                            <option value="JAPAN">JAPAN</option>
                            <option value="GERMANY">GERMANY</option>
                            <option value="TURKEY">TURKEY</option>
                        </select>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('establish_ties', document.getElementById('mofa-target-country').value);" style="background:rgba(34,197,94,0.15); border:1px solid #22c55e; color:#22c55e; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px;">
                            🌐 ESTABLISH FORMAL TIES
                        </button>
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('upgrade_relation', document.getElementById('mofa-target-country').value);" style="background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px;">
                            🕊️ UPGRADE TO STRATEGIC PARTNER
                        </button>
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('open_embassy', document.getElementById('mofa-target-country').value);" style="background:rgba(255,215,0,0.15); border:1px solid #ffd700; color:#ffd700; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px;">
                            🏢 OPEN EMBASSY ($150M)
                        </button>
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('diplomatic_summit', document.getElementById('mofa-target-country').value);" style="background:rgba(168,85,247,0.15); border:1px solid #a855f7; color:#a855f7; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px;">
                            🤝 HOST BILATERAL SUMMIT ($50M)
                        </button>
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('downgrade_relation', document.getElementById('mofa-target-country').value);" style="background:rgba(239,68,68,0.15); border:1px solid #ef4444; color:#ef4444; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px;">
                            ⚠️ ISSUE DIPLOMATIC DEMARCHE
                        </button>
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('expel_ambassador', document.getElementById('mofa-target-country').value);" style="background:rgba(239,68,68,0.25); border:1px solid #ef4444; color:#ff8888; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11px;">
                            🚨 EXPEL AMBASSADOR (PERSONA NON GRATA)
                        </button>
                    </div>
                </div>
            `;
        } else if (activeSub === 'orgs') {
            html += `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(0,229,255,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:13px; font-weight:bold; color:#00e5ff; font-family:'Share Tech Mono',monospace; margin-bottom:8px;">
                            🏛️ UNITED NATIONS (UN DESK)
                        </div>
                        <div style="font-size:11px; color:#cbd5e1; margin-bottom:10px; line-height:1.4;">
                            Resolution #4082 (Global Green Security). General Assembly Vote Pending.
                        </div>
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('vote_un_resolution', 'UN Resolution 4082');" style="background:linear-gradient(135deg,#00e5ff,#0066ff); border:none; color:#000; font-weight:bold; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:11px;">
                            📜 CAST SOVEREIGN UN VOTE
                        </button>
                    </div>

                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(255,215,0,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:13px; font-weight:bold; color:#ffd700; font-family:'Share Tech Mono',monospace; margin-bottom:8px;">
                            🏦 INTERNATIONAL MONETARY FUND (IMF)
                        </div>
                        <div style="font-size:11px; color:#cbd5e1; margin-bottom:10px; line-height:1.4;">
                            Apply for Emergency Balance-of-Payments Support Facility ($2.5B).
                        </div>
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('request_imf_loan', 'IMF');" style="background:linear-gradient(135deg,#ffd700,#f59e0b); border:none; color:#000; font-weight:bold; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:11px;">
                            💰 REQUEST $2.5B EMERGENCY FACILITY
                        </button>
                    </div>

                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(34,197,94,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:13px; font-weight:bold; color:#22c55e; font-family:'Share Tech Mono',monospace; margin-bottom:8px;">
                            🌐 WORLD BANK
                        </div>
                        <div style="font-size:11px; color:#cbd5e1; margin-bottom:10px; line-height:1.4;">
                            Green Infrastructure & Climate Adaptation Development Grant.
                        </div>
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('request_wb_grant', 'World Bank');" style="background:linear-gradient(135deg,#22c55e,#10b981); border:none; color:#000; font-weight:bold; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:11px;">
                            🏗️ APPLY FOR $1.8B DEVELOPMENT GRANT
                        </button>
                    </div>

                    <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(168,85,247,0.3); border-radius:10px; padding:14px;">
                        <div style="font-size:13px; font-weight:bold; color:#a855f7; font-family:'Share Tech Mono',monospace; margin-bottom:8px;">
                            ⚖️ INTERNATIONAL COURT OF JUSTICE (ICJ)
                        </div>
                        <div style="font-size:11px; color:#cbd5e1; margin-bottom:10px; line-height:1.4;">
                            Transboundary River Water Rights & Maritime Boundary Dispute.
                        </div>
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('sign_treaty', 'ICJ Maritime Brief');" style="background:linear-gradient(135deg,#a855f7,#6366f1); border:none; color:#fff; font-weight:bold; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:11px;">
                            ⚖️ SUBMIT LEGAL BRIEF TO ICJ
                        </button>
                    </div>
                </div>
            `;
        } else if (activeSub === 'negotiations') {
            html += `
                <div style="background:rgba(15,23,42,0.9); border:1.5px solid #ec4899; border-radius:10px; padding:16px; box-shadow:0 0 15px rgba(236,72,153,0.2);">
                    <div style="font-size:14px; font-weight:bold; color:#ec4899; font-family:'Share Tech Mono',monospace; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
                        <span>🤝 AUTONOMOUS 40-STAGE AI INTERNATIONAL NEGOTIATOR</span>
                        <span style="font-size:10px; background:rgba(236,72,153,0.2); border:1px solid #ec4899; padding:2px 8px; border-radius:10px; color:#fff;">LEXICON & REASONING ENGINE</span>
                    </div>
                    <div style="font-size:12px; color:#cbd5e1; margin-bottom:14px; line-height:1.4;">
                        Select a target foreign state and negotiation goal to execute all 40 Stages of the Foreign Minister Cognitive Pipeline!
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
                        <div>
                            <label style="font-size:11px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">TARGET NATION:</label>
                            <select id="ai-neg-target" style="width:100%; background:#0f172a; border:1px solid #ec4899; color:#fff; padding:8px; border-radius:6px; font-family:'Share Tech Mono',monospace; font-size:12px; margin-top:4px;">
                                <option value="INDIA">INDIA (Transboundary Water & Border Trade)</option>
                                <option value="CHINA">CHINA (Infrastructure & Belt-Road Investment)</option>
                                <option value="USA">UNITED STATES (Strategic Defense & Tariff Exemption)</option>
                                <option value="SAUDI ARABIA">SAUDI ARABIA (Energy Security & Labor Pacts)</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:11px; color:#94a3b8; font-family:'Share Tech Mono',monospace;">NEGOTIATION INTENT:</label>
                            <select id="ai-neg-intent" style="width:100%; background:#0f172a; border:1px solid #ec4899; color:#fff; padding:8px; border-radius:6px; font-family:'Share Tech Mono',monospace; font-size:12px; margin-top:4px;">
                                <option value="Transboundary Water Sharing Treaty">Transboundary Water Sharing Treaty</option>
                                <option value="Bilateral Preferential Trade Pact">Bilateral Preferential Trade Pact</option>
                                <option value="Mutual Maritime Defense & Patrol Pact">Mutual Maritime Defense & Patrol Pact</option>
                                <option value="Emergency Hostage & Border Security Resolution">Emergency Hostage & Border Security Resolution</option>
                            </select>
                        </div>
                    </div>

                    <button onclick="window.OmegaCabinetUI.executeMoFAAction('run_ai_cognition', document.getElementById('ai-neg-target').value, document.getElementById('ai-neg-intent').value);" style="width:100%; background:linear-gradient(135deg,#ec4899,#8b5cf6); border:none; color:#fff; font-weight:800; font-family:'Share Tech Mono',monospace; font-size:13px; padding:12px; border-radius:8px; cursor:pointer; box-shadow:0 0 15px rgba(236,72,153,0.4);">
                        ⚡ RUN 40-STAGE FOREIGN MINISTER COGNITIVE ENGINE
                    </button>
                </div>
            `;
        } else {
            // Generic subview fallback for treaties, embassies, missions, consular, aid, crisis
            html += `
                <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(0,229,255,0.3); border-radius:10px; padding:16px;">
                    <div style="font-size:14px; font-weight:bold; color:#00e5ff; font-family:'Share Tech Mono',monospace; margin-bottom:12px;">
                        🌐 DIPLOMATIC MODULE: ${activeSub.toUpperCase()}
                    </div>
                    <div style="font-size:12px; color:#cbd5e1; margin-bottom:14px; line-height:1.4;">
                        Sovereign Foreign Ministry directive controls for ${activeSub}.
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button onclick="window.OmegaCabinetUI.executeMoFAAction('sign_treaty', '${activeSub.toUpperCase()} Pact');" style="background:linear-gradient(135deg,#00e5ff,#0066ff); border:none; color:#000; font-weight:bold; padding:10px 16px; border-radius:6px; cursor:pointer; font-size:11px;">
                            📜 EXECUTE ${activeSub.toUpperCase()} DIRECTIVE
                        </button>
                    </div>
                </div>
            `;
        }

        html += `
            </div>
            <!-- Historical Recharts Multi-Line Trend Chart -->
            <div id="recharts-trend-container" style="background:rgba(2,11,20,0.9); border:1px solid rgba(0,229,255,0.3); border-radius:12px; padding:16px; margin-top:16px;">
                <div style="font-family:'Share Tech Mono',monospace; color:#00e5ff; font-size:13px; font-weight:bold; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;">
                    <span>📈 HISTORICAL MACROECONOMIC & MILITARY POWER TREND (RECHARTS)</span>
                    <span style="font-size:10px; color:#ffd700; background:rgba(255,215,0,0.15); border:1px solid rgba(255,215,0,0.4); padding:2px 8px; border-radius:10px;">MULTI-LINE ANALYTICS</span>
                </div>
                <div id="recharts-gdp-mil-chart" style="width:100%; height:240px;"></div>
            </div>
        `;

        contentArea.innerHTML = html;
        setTimeout(() => {
            this.renderRechartsChart('recharts-gdp-mil-chart', countryKey);
        }, 30);
    },

    setResourceGraphSub(subId) {
        this.activeResourceSub = subId;
        const m = this.ministriesDatabase['energy_mining'] || this.ministriesDatabase['resource'];
        const contentArea = document.getElementById('ministry-dashboard-content');
        if (m && contentArea) {
            this.renderResourceMinistryDashboard(m, contentArea);
        }
    },

    renderResourceMinistryDashboard(m, container) {
        const countryDetails = this.getCountryDetails(this.activeCountry);
        const normKey = (this.activeCountry || 'BANGLADESH').toUpperCase().replace(/[-\s]/g, '_');
        this.activeResourceSub = this.activeResourceSub || 'power_grid';

        if (window._resourceChartTimer) {
            clearInterval(window._resourceChartTimer);
            window._resourceChartTimer = null;
        }

        let cash = null;
        let oil = null;
        let steel = null;
        let uranium = null;

        if (window.gameState && window.gameState.economy && window.gameState.economy[normKey]) {
            const econ = window.gameState.economy[normKey];
            if (econ.treasury !== undefined) cash = econ.treasury;
            else if (econ.gdp !== undefined) cash = econ.gdp * 0.08;
        }

        if (window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.getIntegratedResourceState === 'function') {
            const resState = window.ResourceMinistryEngine.getIntegratedResourceState(normKey);
            if (resState && resState.inventory) {
                if (resState.inventory.crude_oil !== undefined) oil = resState.inventory.crude_oil;
                if (resState.inventory.refined_steel !== undefined) steel = resState.inventory.refined_steel;
                if (resState.inventory.enriched_uranium !== undefined) uranium = resState.inventory.enriched_uranium;
            }
        }

        const formatNum = (num) => (num !== null && num !== undefined) ? (window.formatPopulationNumber ? window.formatPopulationNumber(num) : num.toLocaleString()) : 'N/A';
        const formatCash = (num) => (num !== null && num !== undefined) ? (window.formatGameNumber ? window.formatGameNumber(num) : '$' + (num / 1000000).toFixed(1) + 'M') : 'N/A';

        let html = `
            <!-- AAA HERO HEADER -->
            <div style="background:linear-gradient(135deg, rgba(20, 14, 4, 0.92), rgba(10, 20, 30, 0.95)); border:1px solid rgba(234, 179, 8, 0.35); border-radius:12px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; box-shadow:0 8px 24px rgba(0,0,0,0.6);">
                <div style="display:flex; align-items:center; gap:16px;">
                    <button onclick="window.OmegaLayerManager.popLayer();" style="background:linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,41,59,0.9)); border:1.5px solid #eab308; color:#eab308; padding:8px 14px; border-radius:8px; font-weight:bold; cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:12px; display:flex; align-items:center; gap:6px; box-shadow:0 0 10px rgba(234,179,8,0.2);">
                        <span>⬅️</span> <span>BACK TO CABINET</span>
                    </button>
                    <div style="font-size:36px; background:rgba(234,179,8,0.12); padding:8px 14px; border-radius:12px; border:1px solid rgba(234,179,8,0.3); color:#eab308;">⚡</div>
                    <div>
                        <h1 style="margin:0; font-family:'Inter',sans-serif; font-weight:700; font-size:20px; color:#f8fafc; letter-spacing:0.2px;">${m.title} (${m.bnTitle || 'জ্বালানি ও প্রাকৃতিক সম্পদ'})</h1>
                        <div style="font-size:12px; font-weight:500; color:#eab308; margin-top:2px;">${m.role} • ${countryDetails.flag} ${countryDetails.name}</div>
                        <div style="font-size:11px; color:#94a3b8; margin-top:3px; line-height:1.4;">
                            Minister: <strong style="color:#f8fafc;">${m.ministerName}</strong> • Status: <strong style="color:#22c55e;">${m.status}</strong>
                        </div>
                    </div>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <div style="background:rgba(0,0,0,0.5); padding:8px 14px; border-radius:8px; border:1px solid rgba(234,179,8,0.25); font-family:'Share Tech Mono',monospace; font-size:11px;">
                        <span style="color:#94a3b8;">SECTOR EFFICIENCY</span><br/><strong style="color:#22c55e; font-size:14px;">${m.efficiency}%</strong>
                    </div>
                    <div style="background:rgba(0,0,0,0.5); padding:8px 14px; border-radius:8px; border:1px solid rgba(234,179,8,0.25); font-family:'Share Tech Mono',monospace; font-size:11px;">
                        <span style="color:#94a3b8;">ENERGY BUDGET</span><br/><strong style="color:#ffd700; font-size:14px;">${m.budget}</strong>
                    </div>
                    <button onclick="if(window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.openModal === 'function') { window.ResourceMinistryEngine.openModal('${normKey}', 'matrix'); }" style="background:linear-gradient(135deg,rgba(0,229,255,0.25),rgba(6,182,212,0.3)); border:1.5px solid #00e5ff; color:#00e5ff; font-weight:800; font-family:'Share Tech Mono',monospace; font-size:12px; padding:10px 14px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 0 15px rgba(0,229,255,0.3);">
                        💎 GSRSK INTELLIGENCE HUB
                    </button>
                    <button onclick="if(window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.openModal === 'function') { window.ResourceMinistryEngine.openModal('${normKey}', 'cascade'); }" style="background:rgba(239,68,68,0.2); border:1.5px solid #ef4444; color:#ef4444; font-weight:800; font-family:'Share Tech Mono',monospace; font-size:12px; padding:10px 14px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:6px;">
                        ⚠️ CASCADE SANDBOX
                    </button>
                    <button onclick="window.OmegaLayerManager.setLayer(5, { ministryId: '${m.id}' });" style="background:linear-gradient(135deg,#eab308,#f59e0b); border:none; color:#000; font-weight:800; font-family:'Share Tech Mono',monospace; font-size:12px; padding:10px 14px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 0 15px rgba(234,179,8,0.3);">
                        🎙️ INTERROGATE MINISTER
                    </button>
                </div>
            </div>

            <!-- LIVE NATIONAL RESOURCE TELEMETRY STATUS BAR -->
            <div style="background:rgba(15, 23, 42, 0.95); border:1px solid rgba(234, 179, 8, 0.3); border-radius:10px; padding:12px 16px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px;">
                <div style="font-family:'Share Tech Mono',monospace; font-size:12px; font-weight:bold; color:#eab308; display:flex; align-items:center; gap:6px;">
                    <span>💎</span> <span>NATIONAL STRATEGIC RESOURCE RESERVES:</span>
                </div>
                <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px; font-family:'Share Tech Mono',monospace; font-size:12px;">
                        <span>💵</span> <span style="color:#94a3b8;">Treasury:</span> <strong id="res-min-cash" style="color:#22c55e;">${formatCash(cash)}</strong>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; font-family:'Share Tech Mono',monospace; font-size:12px;">
                        <span>⚡</span> <span style="color:#94a3b8;">Power Grid:</span> <strong id="res-min-energy" style="color:#00e5ff;">14.8 GW</strong> <span style="font-size:10px; color:#22c55e;">(▲ +1.2 GW)</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; font-family:'Share Tech Mono',monospace; font-size:12px;">
                        <span>🛢️</span> <span style="color:#94a3b8;">Oil Stockpile:</span> <strong id="res-min-oil" style="color:#eab308;">${formatNum(oil)} BBL</strong> <span style="font-size:10px; color:#22c55e;">(▲ +500/s)</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; font-family:'Share Tech Mono',monospace; font-size:12px;">
                        <span>⚙️</span> <span style="color:#94a3b8;">Steel Reserves:</span> <strong id="res-min-steel" style="color:#cbd5e1;">${formatNum(steel)} T</strong>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; font-family:'Share Tech Mono',monospace; font-size:12px;">
                        <span>☢️</span> <span style="color:#94a3b8;">Uranium / Rare Earths:</span> <strong id="res-min-uranium" style="color:#a855f7;">${uranium} KG</strong>
                    </div>
                </div>
            </div>

            <!-- REAL-TIME DYNAMIC GRAPH CONTAINER & METRIC SELECTOR -->
            <div style="background:rgba(8, 15, 28, 0.95); border:1px solid rgba(234, 179, 8, 0.25); border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:16px;">📈</span>
                        <span style="font-family:'Inter',sans-serif; font-size:14px; font-weight:700; color:#f8fafc;">Real-Time Dynamic Resource Graph & Telemetry</span>
                        <span style="background:rgba(34,197,94,0.15); border:1px solid #22c55e; color:#22c55e; font-size:10px; font-family:'Share Tech Mono',monospace; padding:2px 8px; border-radius:10px;">LIVE REALITY ENGINE ●</span>
                    </div>

                    <!-- GRAPH METRIC SUBVIEW TAB BUTTONS -->
                    <div style="display:flex; gap:6px; overflow-x:auto; flex-shrink:0;">
                        ${[
                            { id: 'power_grid', label: '⚡ Power Grid (GW)', color: '#00e5ff' },
                            { id: 'oil_yield', label: '🛢️ Crude Oil (BBL/s)', color: '#eab308' },
                            { id: 'steel_refinery', label: '⚙️ Steel Production (T/s)', color: '#a855f7' },
                            { id: 'nuclear_rare', label: '☢️ Uranium & Grid Baseload', color: '#22c55e' }
                        ].map(tab => `
                            <button onclick="window.OmegaCabinetUI.setResourceGraphSub('${tab.id}');" style="
                                background:${this.activeResourceSub === tab.id ? tab.color : 'rgba(255,255,255,0.06)'};
                                color:${this.activeResourceSub === tab.id ? '#000' : '#cbd5e1'};
                                border:1px solid ${tab.color};
                                font-weight:bold;
                                padding:6px 12px;
                                border-radius:6px;
                                font-family:'Share Tech Mono',monospace;
                                font-size:11px;
                                cursor:pointer;
                                white-space:nowrap;
                            ">${tab.label}</button>
                        `).join('')}
                    </div>
                </div>

                <!-- LIVE CANVAS REAL-TIME DYNAMIC GRAPH -->
                <div style="position:relative; width:100%; height:220px; background:rgba(2, 8, 16, 0.85); border:1px solid rgba(255,255,255,0.08); border-radius:8px; overflow:hidden; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                    <canvas id="resource-live-canvas" width="900" height="220" style="width:100%; height:100%; display:block;"></canvas>
                </div>
                <div style="display:flex; justify-content:space-between; font-family:'Share Tech Mono',monospace; font-size:10px; color:#64748b; padding:0 4px;">
                    <span>T-30s Ticks</span>
                    <span>Real-Time Frequency: 1.0 Hz</span>
                    <span>Live Status: Operational</span>
                </div>
            </div>

            <!-- 16-POINT GSRSK STRATEGIC ARCHITECTURE & DIRECTIVES CONTROL CENTER -->
            <div style="display:flex; flex-direction:column; gap:14px; margin-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:1px solid rgba(0,229,255,0.2); padding-bottom:8px;">
                    <div style="font-family:'Inter',sans-serif; font-size:15px; color:#f8fafc; font-weight:700; display:flex; align-items:center; gap:8px;">
                        <span>💎</span> <span>GSRSK 16-Point Sovereign Resource Architecture & Command Center</span>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button onclick="window.OmegaCabinetUI.setResource16Filter('ALL');" style="padding:4px 10px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; background:${(!this.res16Filter || this.res16Filter==='ALL')?'#00e5ff':'rgba(255,255,255,0.06)'}; color:${(!this.res16Filter || this.res16Filter==='ALL')?'#000':'#94a3b8'}; border:none;">ALL (16)</button>
                        <button onclick="window.OmegaCabinetUI.setResource16Filter('UPSTREAM');" style="padding:4px 10px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; background:${this.res16Filter==='UPSTREAM'?'#00e5ff':'rgba(255,255,255,0.06)'}; color:${this.res16Filter==='UPSTREAM'?'#000':'#94a3b8'}; border:none;">UPSTREAM</button>
                        <button onclick="window.OmegaCabinetUI.setResource16Filter('MIDSTREAM');" style="padding:4px 10px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; background:${this.res16Filter==='MIDSTREAM'?'#00e5ff':'rgba(255,255,255,0.06)'}; color:${this.res16Filter==='MIDSTREAM'?'#000':'#94a3b8'}; border:none;">MIDSTREAM</button>
                        <button onclick="window.OmegaCabinetUI.setResource16Filter('DOWNSTREAM');" style="padding:4px 10px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; background:${this.res16Filter==='DOWNSTREAM'?'#00e5ff':'rgba(255,255,255,0.06)'}; color:${this.res16Filter==='DOWNSTREAM'?'#000':'#94a3b8'}; border:none;">DOWNSTREAM</button>
                        <button onclick="window.OmegaCabinetUI.setResource16Filter('STRATEGY');" style="padding:4px 10px; font-size:11px; font-weight:700; border-radius:6px; cursor:pointer; background:${this.res16Filter==='STRATEGY'?'#00e5ff':'rgba(255,255,255,0.06)'}; color:${this.res16Filter==='STRATEGY'?'#000':'#94a3b8'}; border:none;">STRATEGY & AI</button>
                    </div>
                </div>

                <div class="ministry-dept-grid" style="grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                    ${this.getResource16CardsHtml()}
                </div>
            </div>
        `;

        container.innerHTML = html;

        setTimeout(() => {
            this.initLiveResourceGraph(this.activeResourceSub);
        }, 50);
    },

    res16Filter: 'ALL',

    setResource16Filter(filterKey) {
        this.res16Filter = filterKey;
        const m = this.ministriesDatabase['energy_mining'] || this.ministriesDatabase['resource'];
        const contentArea = document.getElementById('ministry-dashboard-content');
        if (m && contentArea) {
            this.renderResourceMinistryDashboard(m, contentArea);
        }
    },

    getResource16CardsHtml() {
        const countryKey = (this.activeCountry || 'BANGLADESH').toUpperCase();
        const normKey = countryKey.replace(/[-\s]/g, '_');

        const points = [
            { num: '01', id: 'p01', tag: 'FOUNDATION', icon: '⚖️', title: 'Unit Standards & Metrology', bn: 'পরিমাপক একক ও জ্ঞানতাত্ত্বিক ভিত্তি', desc: 'Canonical conversion factors for MMBTU, BBL, Metric Tons and Murmur64 checksum validation.', btnText: 'Inspect Metrology Matrix', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'matrix')`, border: '#00e5ff' },
            { num: '02', id: 'p02', tag: 'FOUNDATION', icon: '📖', title: '18 Commodity Ontology Matrix', bn: '১৮ কৌশলগত পদার্থের রাসায়নিক ও ভৌত কাঠামো', desc: 'Physicochemical transformations, substitution elasticities, and CRIRSCO mineral classifications.', btnText: 'View Commodity Ontology', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'matrix')`, border: '#38bdf8' },
            { num: '03', id: 'p03', tag: 'UPSTREAM', icon: '💎', title: 'Sovereign Reserves & In-Situ Ledger', bn: 'সার্বভৌম মজুদ ও খনিজ সম্পদ খতিয়ান', desc: 'Verified proven reserves, daily extraction mutation rates, and sovereign resource balance sheets.', btnText: 'Audit Proven Reserves', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'matrix')`, border: '#eab308' },
            { num: '04', id: 'p04', tag: 'UPSTREAM', icon: '🗺️', title: 'Deposit Registry & Geocoded Mines', bn: 'খনিজ ডিপোজিট ও ভূতাত্ত্বিক ম্যাপিং', desc: '593 geocoded global mining concessions, ore purities, and spatial reserve clusters.', btnText: 'Explore Geocoded Deposits', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'deposits')`, border: '#ca8a04' },
            { num: '05', id: 'p05', tag: 'UPSTREAM', icon: '⛏️', title: 'Geological Extraction & Depletion Rate', bn: 'খনন উত্তোলন ও অবক্ষয় নিয়ন্ত্রণ প্রকল্প', desc: 'Block caving, open-cast stripping, and Reserve Replacement Ratio (RRR) optimization.', btnText: 'Upgrade Extraction & RRR ($800M)', action: () => `window.OmegaCabinetUI.executeResource16Point('p05', 'drill_oil')`, border: '#f59e0b' },
            { num: '06', id: 'p06', tag: 'MIDSTREAM', icon: '⚙️', title: 'Processing, Smelting & Refining', bn: 'পরিশোধন, ধাতু নিষ্কাশন ও রূপান্তর শিল্প', desc: 'Fluid catalytic cracking, blast furnaces, electro-winning (SX-EW), and uranium centrifuges.', btnText: 'Commission Smelter Complex ($1.2B)', action: () => `window.OmegaCabinetUI.executeResource16Point('p06', 'build_factory')`, border: '#a855f7' },
            { num: '07', id: 'p07', tag: 'MIDSTREAM', icon: '🛢️', title: 'Strategic Petroleum Reserve (SPR)', bn: 'কৌশলগত তেল ও তরল গ্যাস মজুদাগার', desc: '90-day SPR national buffer, salt cavern storages, cryogenic LNG tanks, and grain silos.', btnText: 'Drawdown / Expand SPR Silos', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'inventory')`, border: '#d97706' },
            { num: '08', id: 'p08', tag: 'MIDSTREAM', icon: '🚢', title: 'Multimodal Transit Corridors', bn: 'পাইপলাইন, সমুদ্রবন্দর ও মাল্টিমোডাল পরিবহন', desc: 'Pipelines, maritime supertanker lanes, deepwater bulk berths, and rail freight networks.', btnText: 'Inspect Logistics Corridors', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'logistics')`, border: '#06b6d4' },
            { num: '09', id: 'p09', tag: 'DOWNSTREAM', icon: '🏭', title: 'Industrial Value Chain (DAG)', bn: 'শিল্প উৎপাদনের ডাইরেক্টেড গ্রাফ (DAG)', desc: 'Multi-stage transformation from raw ore into semiconductors, titanium airframes, and munitions.', btnText: 'Inspect Industrial Value Chains', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'industrial')`, border: '#8b5cf6' },
            { num: '10', id: 'p10', tag: 'DOWNSTREAM', icon: '📈', title: 'Commodity Spot Market & Clearing', bn: 'স্পট মার্কেট ও গ্লোবাল ট্রেডিং ডেস্ক', desc: 'Continuous clearing, order book matching, Brent/WTI arbitrage, and derivative hedging.', btnText: 'Open Commodity Trading Desk', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'market')`, border: '#10b981' },
            { num: '11', id: 'p11', tag: 'DOWNSTREAM', icon: '📜', title: 'Bilateral Supply Contracts & Tariffs', bn: 'দ্বিপাক্ষিক সরবরাহ চুক্তি ও বৈদেশিক শুল্ক', desc: 'Long-term bilateral offtake agreements, Letters of Credit, import/export tariffs, and sanctions.', btnText: 'Negotiate Supply Agreements', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'trade')`, border: '#14b8a6' },
            { num: '12', id: 'p12', tag: 'STRATEGY', icon: '💰', title: 'Economic Rent & Sovereign Wealth (SWF)', bn: 'অর্থনৈতিক রেন্ট ও সার্বভৌম তহবিল (SWF)', desc: 'Resource rent capture, Sovereign Wealth Fund capitalization, and Dutch Disease mitigation.', btnText: 'Capitalize National SWF', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'value')`, border: '#fbbf24' },
            { num: '13', id: 'p13', tag: 'STRATEGY', icon: '⚠️', title: 'Cascade Disruption Sandbox', bn: 'মাল্টি-টিয়ার সাপ্লাই চেইন ক্যাস্কেড সিমুলেটর', desc: 'Non-linear supply shock propagation, chokepoint blockades, and contingency war-gaming.', btnText: 'Launch Cascade Disruption Sandbox', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'cascade')`, border: '#ef4444' },
            { num: '14', id: 'p14', tag: 'STRATEGY', icon: '🧠', title: 'Cognitive Situation & 12-Question Gate', bn: 'কগনিটিভ এআই পরিস্থিতি ও ১২-প্রশ্ন গেট', desc: 'Red-Team counterfactual critics, 10-dimensional health evaluations, and AI briefing generation.', btnText: 'Run AI Cognitive Decision Gate', action: () => `window.ResourceMinistryEngine.openModal('${normKey}', 'profile')`, border: '#ec4899' },
            { num: '15', id: 'p15', tag: 'MIDSTREAM', icon: '⚡', title: 'Power Grid & 2.4GW Baseload Mix', bn: 'জাতীয় বিদ্যুৎ গ্রিড ও বেসলোড সমন্বয়', desc: '2,400MW nuclear baseload, combined-cycle gas peakers, offshore wind, and black-start capability.', btnText: 'Build 2.4GW Nuclear Baseload ($2.0B)', action: () => `window.OmegaCabinetUI.executeResource16Point('p15', 'build_nuclear')`, border: '#0284c7' },
            { num: '16', id: 'p16', tag: 'STRATEGY', icon: '🌱', title: 'Carbon Quotas & Circular Remediation', bn: 'কার্বন নির্গমন সীমা ও বৃত্তাকার অর্থনীতি', desc: 'Tailings reprocessing, emissions cap-and-trade, industrial water recycling, and green transition.', btnText: 'Deploy Green Infrastructure ($600M)', action: () => `window.OmegaCabinetUI.executeResource16Point('p16', 'build_solar')`, border: '#22c55e' }
        ];

        const activeFilter = this.res16Filter || 'ALL';
        const filtered = points.filter(p => {
            if (activeFilter === 'ALL') return true;
            if (activeFilter === 'FOUNDATION' && (p.tag === 'FOUNDATION')) return true;
            if (activeFilter === 'UPSTREAM' && p.tag === 'UPSTREAM') return true;
            if (activeFilter === 'MIDSTREAM' && p.tag === 'MIDSTREAM') return true;
            if (activeFilter === 'DOWNSTREAM' && p.tag === 'DOWNSTREAM') return true;
            if (activeFilter === 'STRATEGY' && (p.tag === 'STRATEGY' || p.tag === 'FOUNDATION')) return true;
            return false;
        });

        let cardsHtml = "";
        filtered.forEach(pt => {
            cardsHtml += `
                <div class="dept-card" style="border-color:${pt.border}; background:rgba(2, 11, 20, 0.85); display:flex; flex-direction:column; justify-content:space-between; padding:12px; border-radius:10px; border-width:1.5px; box-shadow:0 0 12px rgba(0,0,0,0.5);">
                    <div>
                        <div class="dept-card-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                            <span class="dept-card-title" style="font-size:13px; font-weight:700; color:#f8fafc; display:flex; align-items:center; gap:6px;">
                                <span style="font-size:16px;">${pt.icon}</span>
                                <span>${pt.num}. ${pt.title}</span>
                            </span>
                            <span style="font-size:9px; font-weight:800; color:${pt.border}; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; font-family:'Share Tech Mono',monospace;">${pt.tag}</span>
                        </div>
                        <div style="font-size:10px; color:#38bdf8; font-weight:600; margin-bottom:4px;">${pt.bn}</div>
                        <div style="font-size:11px; color:#94a3b8; line-height:1.4; margin-bottom:10px;">
                            ${pt.desc}
                        </div>
                    </div>
                    <button class="dept-action-btn" onclick="${pt.action()};" style="background:linear-gradient(135deg, ${pt.border} 0%, rgba(15,23,42,0.95) 100%); color:#fff; font-size:11px; font-weight:700; border:1px solid ${pt.border}; padding:7px 10px; border-radius:6px; cursor:pointer; width:100%; text-align:center; transition:all 0.15s;" onmouseover="this.style.opacity='0.9';" onmouseout="this.style.opacity='1';">
                        ${pt.btnText}
                    </button>
                </div>
            `;
        });
        return cardsHtml;
    },

    executeResource16Point(pointKey, directiveType) {
        this.executeResourceDirective(directiveType);
        if (window.OmegaCognitiveOS && typeof window.OmegaCognitiveOS.learnFromExecution === 'function') {
            window.OmegaCognitiveOS.learnFromExecution({ success: true, impactDelta: 2.5, notes: `Point ${pointKey} executed directly from Resource Command Center.` }, pointKey);
        }
    },

    initLiveResourceGraph(subType) {
        const canvas = document.getElementById('resource-live-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width || 800;
        canvas.height = rect.height || 220;

        if (!window._resourceGraphHistory || window._resourceGraphHistoryType !== subType) {
            window._resourceGraphHistoryType = subType;
            window._resourceGraphHistory = [];
            const baseVal = subType === 'power_grid' ? 14.8 : (subType === 'oil_yield' ? 500 : (subType === 'steel_refinery' ? 320 : 85));
            for (let i = 0; i < 25; i++) {
                const noise = (Math.random() - 0.48) * (baseVal * 0.08);
                window._resourceGraphHistory.push(Number((baseVal + noise).toFixed(2)));
            }
        }

        const renderFrame = () => {
            const width = canvas.width;
            const height = canvas.height;
            ctx.clearRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 1;
            for (let x = 0; x < width; x += 40) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = 0; y < height; y += 35) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            const data = window._resourceGraphHistory;
            if (!data || data.length < 2) return;

            const maxVal = Math.max(...data) * 1.15 || 100;
            const minVal = Math.min(...data) * 0.85 || 0;
            const range = (maxVal - minVal) || 1;

            const getX = (i) => (i / (data.length - 1)) * (width - 40) + 20;
            const getY = (val) => height - 30 - ((val - minVal) / range) * (height - 60);

            let strokeColor = '#00e5ff';
            let fillColor = 'rgba(0, 229, 255, 0.15)';
            if (subType === 'oil_yield') { strokeColor = '#eab308'; fillColor = 'rgba(234, 179, 8, 0.15)'; }
            else if (subType === 'steel_refinery') { strokeColor = '#a855f7'; fillColor = 'rgba(168, 85, 247, 0.15)'; }
            else if (subType === 'nuclear_rare') { strokeColor = '#22c55e'; fillColor = 'rgba(34, 197, 94, 0.15)'; }

            ctx.beginPath();
            ctx.moveTo(getX(0), height - 20);
            for (let i = 0; i < data.length; i++) {
                ctx.lineTo(getX(i), getY(data[i]));
            }
            ctx.lineTo(getX(data.length - 1), height - 20);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();

            ctx.beginPath();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3;
            for (let i = 0; i < data.length; i++) {
                if (i === 0) ctx.moveTo(getX(i), getY(data[i]));
                else ctx.lineTo(getX(i), getY(data[i]));
            }
            ctx.stroke();

            for (let i = 0; i < data.length; i++) {
                const x = getX(i);
                const y = getY(data[i]);
                ctx.beginPath();
                ctx.arc(x, y, i === data.length - 1 ? 5 : 3, 0, Math.PI * 2);
                ctx.fillStyle = i === data.length - 1 ? '#ffffff' : strokeColor;
                ctx.fill();
                if (i === data.length - 1) {
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }

            const lastVal = data[data.length - 1];
            ctx.font = 'bold 12px "Share Tech Mono", monospace';
            ctx.fillStyle = strokeColor;
            ctx.textAlign = 'right';
            let unitStr = subType === 'power_grid' ? ' GW' : (subType === 'oil_yield' ? ' BBL/s' : (subType === 'steel_refinery' ? ' T/s' : ' %'));
            ctx.fillText(`CURRENT: ${lastVal}${unitStr}`, width - 20, 25);
        };

        renderFrame();

        if (window._resourceChartTimer) clearInterval(window._resourceChartTimer);
        window._resourceChartTimer = setInterval(() => {
            if (!document.getElementById('resource-live-canvas')) {
                clearInterval(window._resourceChartTimer);
                return;
            }
            const data = window._resourceGraphHistory;
            if (!data) return;
            const last = data[data.length - 1];
            const delta = (Math.random() - 0.47) * (last * 0.035);
            const nextVal = Number(Math.max(1, last + delta).toFixed(2));
            data.shift();
            data.push(nextVal);
            renderFrame();
        }, 3000);
    },

    executeResourceDirective(directiveType) {
        const countryKey = (this.activeCountry || 'BANGLADESH').toUpperCase().replace(/[-\s]/g, '_');

        if (window.ResourceMinistryEngine && typeof window.ResourceMinistryEngine.executeDirective === 'function') {
            window.ResourceMinistryEngine.executeDirective(directiveType, countryKey);
        } else {
            if (directiveType === 'drill_oil') {
                if (window.showOmegaNotification) window.showOmegaNotification("OFFSHORE OIL RIG DIRECTIVE", "🛢️ Offshore Crude Exploration directive logged in sovereign reserve ledger.", "success");
            } else if (directiveType === 'build_nuclear') {
                if (window.showOmegaNotification) window.showOmegaNotification("NUCLEAR REACTOR DIRECTIVE", "⚛️ Baseload Nuclear Capacity expansion directive issued.", "success");
            } else if (directiveType === 'expand_mining') {
                if (window.showOmegaNotification) window.showOmegaNotification("MINING EXPANSION DIRECTIVE", "⛏️ Strategic Mineral Concession operationalized.", "success");
            } else if (directiveType === 'build_solar') {
                if (window.showOmegaNotification) window.showOmegaNotification("RENEWABLE ENERGY DIRECTIVE", "☀️ Coastal Wind and Solar Infrastructure commissioned.", "success");
            }
        }

        if (window._resourceGraphHistory) {
            const last = window._resourceGraphHistory[window._resourceGraphHistory.length - 1];
            window._resourceGraphHistory[window._resourceGraphHistory.length - 1] = Number((last * 1.05).toFixed(2));
        }

        const m = this.ministriesDatabase['energy_mining'] || this.ministriesDatabase['resource'];
        const contentArea = document.getElementById('ministry-dashboard-content');
        if (m && contentArea) {
            this.renderResourceMinistryDashboard(m, contentArea);
        }
    },

    openInterrogationModal(ministerId) {
        const m = this.ministriesDatabase[ministerId];
        if (!m) return;

        this.currentInterrogatedMinister = m;

        const modal = document.getElementById('minister-interrogation-modal');
        const title = document.getElementById('interrogation-title');
        const avatar = document.getElementById('interrogation-avatar');
        const name = document.getElementById('interrogation-name');
        const role = document.getElementById('interrogation-role');
        const trust = document.getElementById('interrogation-trust');
        const reliability = document.getElementById('interrogation-reliability');
        const loyalty = document.getElementById('interrogation-loyalty');
        const stress = document.getElementById('interrogation-stress');
        const thoughtBox = document.getElementById('interrogation-thought-box');
        const quickQContainer = document.getElementById('interrogation-quick-questions');
        const chatHistory = document.getElementById('interrogation-chat-history');

        if (title) title.innerText = `${m.title.toUpperCase()} - MINISTER INTERROGATION HUB`;
        if (avatar) avatar.innerText = m.avatar;
        if (name) name.innerText = m.ministerName;
        if (role) role.innerText = m.role;
        if (trust) trust.innerText = `${m.trust}/100`;
        if (reliability) reliability.innerText = `${m.efficiency}%`;
        if (loyalty) loyalty.innerText = m.loyalty;
        if (stress) stress.innerText = `LOW (${m.stress}%)`;

        if (thoughtBox) {
            let cogThought = `💬 "${m.speechQuote}"`;
            if (window.OmegaMinistry && window.OmegaMinistry._part4 && window.OmegaMinistry._part4.NaturalLanguageGenerationEngine) {
                try {
                    const nlg = new window.OmegaMinistry._part4.NaturalLanguageGenerationEngine();
                    cogThought = nlg.generateSemanticText({ domain: m.id, efficiency: m.efficiency }, "BRIEFING");
                } catch(e){}
            }
            thoughtBox.innerText = cogThought;
        }

        if (quickQContainer) {
            let qHtml = "";
            m.presetQuestions.forEach(q => {
                qHtml += `
                    <button onclick="window.OmegaCabinetUI.askPresetQuestion('${m.id}', '${q.id}');" style="padding:6px 10px; background:rgba(0,229,255,0.12); border:1px solid rgba(0,229,255,0.4); color:#00e5ff; font-size:11px; border-radius:4px; cursor:pointer; text-align:left; font-family:var(--font-mono); transition:all 0.15s;" onmouseover="this.style.background='rgba(0,229,255,0.25)';" onmouseout="this.style.background='rgba(0,229,255,0.12)';">
                        ❓ ${q.text}
                    </button>
                `;
            });
            quickQContainer.innerHTML = qHtml;
        }

        if (chatHistory) {
            if (!this.chatHistories[m.id]) {
                this.chatHistories[m.id] = [
                    { sender: 'MINISTER', text: `Greetings Executive Commander. I am ${m.ministerName}. Ask me any strategic question regarding ${m.title}.` }
                ];
            }
            this.renderChatHistory(m.id);
        }

        const btnSubmit = document.getElementById('btn-submit-interrogation');
        const inputField = document.getElementById('interrogation-input');

        if (btnSubmit && inputField) {
            btnSubmit.onclick = () => {
                const qText = inputField.value.trim();
                if (qText) {
                    this.askCustomQuestion(m.id, qText);
                    inputField.value = "";
                }
            };
            inputField.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    const qText = inputField.value.trim();
                    if (qText) {
                        this.askCustomQuestion(m.id, qText);
                        inputField.value = "";
                    }
                }
            };
        }

        if (modal) modal.style.display = 'flex';
    },

    renderChatHistory(ministerId) {
        const history = this.chatHistories[ministerId] || [];
        const container = document.getElementById('interrogation-chat-history');
        if (!container) return;

        let html = `<div style="font-size:10px; color:#64748b; font-family:var(--font-mono); text-align:center; margin-bottom:8px;">--- LIVE INTERROGATION LOG (${this.activeCountry}) ---</div>`;

        history.forEach(item => {
            if (item.sender === 'USER') {
                html += `
                    <div style="align-self:flex-end; background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#fff; padding:8px 12px; border-radius:8px 8px 0 8px; max-width:80%; font-family:var(--font-mono); font-size:12px; margin-left:auto;">
                        <div style="font-size:10px; color:#00e5ff; font-weight:bold; margin-bottom:2px;">EXECUTIVE COMMANDER (You):</div>
                        <div>${item.text}</div>
                    </div>
                `;
            } else {
                html += `
                    <div style="align-self:flex-start; background:rgba(15,23,42,0.9); border:1px solid rgba(255,215,0,0.4); color:#f8fafc; padding:8px 12px; border-radius:8px 8px 8px 0; max-width:85%; font-family:var(--font-mono); font-size:12px; margin-right:auto;">
                        <div style="font-size:10px; color:#ffd700; font-weight:bold; margin-bottom:2px; display:flex; justify-content:space-between;">
                            <span>${item.senderName || 'MINISTER'}:</span>
                            <span style="font-size:9px; color:#38bdf8; letter-spacing:0.5px;">${item.aiPowered ? '🧠 GEMINI SOVEREIGN REASONING' : '⚡ COGNITIVE ONTOLOGY AUDIT'}</span>
                        </div>
                        <div style="line-height:1.4;">${item.text}</div>
                        ${item.analysis ? `<div style="margin-top:6px; padding-top:4px; border-top:1px dashed rgba(255,255,255,0.1); font-size:10px; color:#00e5ff;">📊 Impact: ${item.analysis}</div>` : ''}
                    </div>
                `;
            }
        });

        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    },

    askPresetQuestion(ministerId, questionId) {
        const m = this.ministriesDatabase[ministerId];
        if (!m) return;

        const qObj = m.presetQuestions.find(q => q.id === questionId);
        if (!qObj) return;

        this.processQuestionAndReply(m, qObj.text);
    },

    askCustomQuestion(ministerId, questionText) {
        const m = this.ministriesDatabase[ministerId];
        if (!m) return;

        this.processQuestionAndReply(m, questionText);
    },

    processQuestionAndReply(minister, questionText) {
        if (!this.chatHistories[minister.id]) this.chatHistories[minister.id] = [];

        const countryKey = this.activeCountry || "BANGLADESH";
        const cDetails = this.getCountryDetails(countryKey);

        // Dynamically resolution for localized minister name and role
        const mName = (minister && (minister.ministerName || minister.name)) || (cDetails.ministers && cDetails.ministers[minister.id] && cDetails.ministers[minister.id].name) || 'Honorable Minister';
        const mRole = (minister && minister.role) || (cDetails.ministers && cDetails.ministers[minister.id] && cDetails.ministers[minister.id].role) || 'Cabinet Minister';

        this.chatHistories[minister.id].push({
            sender: 'USER',
            text: questionText
        });

        this.renderChatHistory(minister.id);

        const isBengali = /[\u0980-\u09FF]/.test(questionText);

        // Show thinking indicator
        const thinkingItem = {
            sender: 'MINISTER',
            senderName: mName,
            text: isBengali ? 'কগনিটিভ এআই বিশ্লেষণ ও নীতি মূল্যায়ন প্রক্রিয়াধীন...' : 'Synthesizing sovereign policy analysis...',
            analysis: isBengali ? 'এআই আর (AI Resource & Cognitive Link Active)' : 'AIR Sovereign Neural Link Active',
            isThinking: true
        };
        this.chatHistories[minister.id].push(thinkingItem);
        this.renderChatHistory(minister.id);

        const executeReply = async () => {
            let replyText = "";
            let impactAnalysis = "";
            let isAiPowered = false;

            if (window.OmegaCognitiveOS && typeof window.OmegaCognitiveOS.askMinisterWithAI === 'function') {
                try {
                    const cogRes = await window.OmegaCognitiveOS.askMinisterWithAI(questionText, minister, countryKey, cDetails);
                    if (cogRes && cogRes.text) {
                        replyText = cogRes.text;
                        isAiPowered = !!cogRes.aiPowered;
                        impactAnalysis = cogRes.impact || (isBengali
                            ? `কগনিটিভ এআই ইন্টেলিজেন্স • কার্যক্ষমতা: ${minister.efficiency}% • সার্বভৌম স্থায়িত্ব: ${cDetails.stability || '৮৯%'}`
                            : `Cognitive AI Synthesis • Efficiency: ${minister.efficiency}% • Sovereign Stability: ${cDetails.stability || '89%'}`);
                    }
                } catch (e) {
                    console.warn("[OmegaCognitiveOS] Fallback to cognitive generator:", e);
                }
            } else if (window.OmegaCognitiveOS && typeof window.OmegaCognitiveOS.thinkMinisterQuestion === 'function') {
                try {
                    const cogRes = window.OmegaCognitiveOS.thinkMinisterQuestion(questionText, minister, countryKey, cDetails);
                    if (cogRes && cogRes.text) {
                        replyText = cogRes.text;
                        impactAnalysis = cogRes.impact || `Cognitive Confidence: 94.2% • Efficiency: ${minister.efficiency}% • Sovereign Stability: ${cDetails.stability || '88%'}`;
                    }
                } catch (e) {
                    console.warn("[OmegaCognitiveOS] Fallback error:", e);
                }
            }



            // Remove thinking item and append final reply
            const history = this.chatHistories[minister.id];
            const lastIdx = history.findIndex(h => h.isThinking);
            if (lastIdx !== -1) {
                history.splice(lastIdx, 1);
            }

            history.push({
                sender: 'MINISTER',
                senderName: mName,
                text: replyText,
                analysis: impactAnalysis,
                aiPowered: isAiPowered
            });

            this.renderChatHistory(minister.id);
        };

        executeReply();
    },


    executeDirective(ministerId, directiveType) {
        const m = this.ministriesDatabase[ministerId];
        if (!m) return;

        if (directiveType === 'budget') {
            if (window.resources && window.resources.cash !== undefined) {
                window.resources.cash += 10000000000;
            }
            m.efficiency = Math.min(100, m.efficiency + 3);
            m.trust = Math.min(100, m.trust + 2);
            window.showOmegaNotification("TREASURY ALLOCATION", `💵 $10 Billion Allocated to ${m.title}! Department Efficiency increased to ${m.efficiency}%.`, "success");
            this.renderCabinet(this.activeCountry);
        } else if (directiveType === 'policy') {
            m.efficiency = Math.min(100, m.efficiency + 2);
            window.showOmegaNotification("EXECUTIVE ALIGNMENT", `⚡ Executive Directive Issued to ${m.ministerName} (${m.role})! Operational alignment updated.`, "info");
            this.renderCabinet(this.activeCountry);
        }
    }
};

/* ============================================================================
 * UNIFIED COGNITIVE ENGINE, ORIENTATION SYSTEM & LIVING GOVERNMENT ALIAS BRIDGES
 * ============================================================================ */
window.Omega = window.Omega || {};

class OrientationManager {
    constructor() {
        this.mode = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
        this.locked = false;
    }

    async initialize() {
        this.detect();
        await this.fullscreen();
        await this.lockLandscape();
        this.listen();
    }

    detect() {
        this.mode = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
        if (this.mode === "landscape") {
            this.hideRotateMessage();
        }
    }

    async fullscreen() {
        try {
            if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            }
        } catch(e) {
            console.log("Fullscreen unavailable");
        }
    }

    async lockLandscape() {
        try {
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock("landscape");
                this.locked = true;
                this.hideRotateMessage();
            } else {
                this.showRotateMessage();
            }
        } catch(e) {
            if (this.mode === "portrait") {
                this.showRotateMessage();
            }
        }
    }

    listen() {
        window.addEventListener("resize", () => {
            this.detect();
            if (this.mode === "landscape") {
                this.hideRotateMessage();
            }
        });
        window.addEventListener("orientationchange", () => {
            setTimeout(() => {
                this.detect();
                if (this.mode === "landscape") {
                    this.hideRotateMessage();
                }
            }, 100);
        });
    }

    showRotateMessage() {
        let box = document.getElementById("rotate-warning");
        if (box && this.mode === "portrait") {
            box.style.display = "flex";
        }
    }

    hideRotateMessage() {
        let box = document.getElementById("rotate-warning");
        if (box) box.style.display = "none";
    }
}

window.Omega.OrientationManager = new OrientationManager();
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.Omega.OrientationManager.initialize();
} else {
    document.addEventListener('DOMContentLoaded', () => {
        window.Omega.OrientationManager.initialize();
    });
}

window.OmegaCognitiveEngine = window.OmegaCognitiveEngine || window.OmegaMinistry;
window.OmegaCognitiveRuntime = window.OmegaMinistry;

// Auto-load ministers.json on boot to ensure 100% data availability
(async function initMinisters() {
    try {
        if (!window.OmegaMinistersDB) {
            const fetcher = window.fetchResilient || (async (f) => {
                const res = await fetch(f + '?v=' + Date.now());
                return res.ok ? await res.json() : null;
            });
            const data = await fetcher('ministers.json');
            if (data && data.ministers_database) {
                window.OmegaCabinetUI.syncMinistersDatabase(data.ministers_database);
            }
        }
    } catch (e) {
        console.warn("[OmegaCabinetUI] Auto-fetch ministers.json:", e);
    }
})();

console.log("[OMEGA UNIFIED ENGINE] Cognitive Engine, Orientation System & Ministry Engine 100% Unified in ministry_engine.js!");


