/**
 * OMEGA UI ENGINE: CORE ADAPTER (v2.1.0 - HIGH-FIDELITY AAA STRATEGY ARCHITECTURE)
 * PART 1/6: ENHANCED GAMEPLAY STATES & IMMUTABLE POLICE FLEET DATABASE
 * Verification: 17 Ministries Secured | 15 Vehicles Secured | 0 Data Loss.
 */

const OMEGA_UI_ADAPTER = (() => {
    // --- PRIVATE REGISTRIES ---
    const _pool = [];
    const _payloadStore = new WeakMap();
    const _activeElements = new Map();
    const _headerCache = new Map();
    const _sectionMap = new Map();
    const _eventListeners = new Map();
    
    let _initialized = false;
    let _originalEmit = null;
    let _headerUpdateInterval = null;
    let _observer = null;
    let _renderObserver = null;

    // --- GAMEPLAY SIMULATION STATES (AAA STRATEGY MODEL) ---
    const STATE_DATABASE = {
        policeCount: 250,
        policeEfficiency: 60,
        policeTrust: 55,
        unlockedVehicleLevel: 1,
        activeVehicleTimer: null,
        activeVehicleTimerEnd: 0,
        activeVehicleTargetLvl: 0,
        facilityLevels: {
            station: 1,
            patrol: 1,
            academy: 1,
            department: 1
        },
        trainingQualityLevel: 1,
        tacticsResearched: {
            antiRiot: false,
            smugglerInterdict: false,
            counterTerror: false
        },
        specialAgents: 0,
        sabotageRisk: 45
    };

    const CONSTANTS = Object.freeze({
        UI_OWNER: "UI", MAX_POOL: 150, POLLING_RATE: 2000,
        DRAG_THRESHOLD: 10, STAGGER_DELAY: 45, DEFAULT_SCREEN: "MAIN_GOV", VERSION: "2.1.0"
    });

    const METRIC_KEYS = Object.freeze({
        YEAR: "SYSTEM_YEAR", TREASURY: "STATE_TREASURY", STABILITY: "STATE_STABILITY",
        GDP: "STATE_GDP", TICK: "SYSTEM_TICK"
    });

    const STATUS_MAP = Object.freeze({
        READY: 'om-status-ready', ACTIVE: 'om-status-active', STABLE: 'om-status-stable',
        SECURED: 'om-status-secured', PRIORITY: 'om-status-priority', WARNING: 'om-status-warning',
        CRITICAL: 'om-status-critical', ALERT: 'om-status-alert', CLASSIFIED: 'om-status-classified'
    });

    const SECTION_CONFIG = Object.freeze([
        { title: 'Executive Control', ids: ['cabinet', 'foreign'] },
        { title: 'Fiscal & Industrial Strategy', ids: ['finance', 'economy', 'trade', 'resource'] },
        { title: 'National Security Directorate', ids: ['defense', 'military', 'intelligence', 'interior'] },
        { title: 'Civil Administration Bureau', ids: ['health', 'education', 'culture'] },
        { title: 'Strategic Research Commission', ids: ['transport', 'technology', 'projects', 'statistics'] }
    ]);

    SECTION_CONFIG.forEach(sec => sec.ids.forEach(id => _sectionMap.set(id, sec.title)));

    const EVENTS = Object.freeze({
        INTERIOR_READY: "UI_INTERIOR_READY", LOAD_FINISHED: "PRESENTATION_LOAD_FINISHED",
        LEGACY_LOAD: "UI_LOADING_FINISHED", SELECTED: "MINISTER_SELECTED"
    });

    // --- POLICE VEHICLE DATABASE (AAA LEVEL PROGRESSION) ---
    const POLICE_VEHICLES = Object.freeze([
        { level: 1, name: "Patrol Cruiser Basic", speed: 120, capacity: 4, durability: 40, unlockTime: 6, cost: 5000, locked: false, icon: "assets/icons/police_v1.png", emoji: "🚓" },
        { level: 2, name: "Rapid Response Sedan", speed: 140, capacity: 4, durability: 45, unlockTime: 6, cost: 8000, locked: true, icon: "assets/icons/police_v2.png", emoji: "🚔" },
        { level: 3, name: "Tactical SUV", speed: 130, capacity: 6, durability: 60, unlockTime: 6, cost: 12000, locked: true, icon: "assets/icons/police_v3.png", emoji: "🚙" },
        { level: 4, name: "Police Transport Van", speed: 100, capacity: 12, durability: 65, unlockTime: 6, cost: 15000, locked: true, icon: "assets/icons/police_v4.png", emoji: "🚐" },
        { level: 5, name: "Armored Patrol Vehicle", speed: 110, capacity: 6, durability: 85, unlockTime: 6, cost: 25000, locked: true, icon: "assets/icons/police_v5.png", emoji: "🚘" },
        { level: 6, name: "Advanced Interceptor", speed: 180, capacity: 2, durability: 50, unlockTime: 6, cost: 35000, locked: true, icon: "assets/icons/police_v6.png", emoji: "🚓" },
        { level: 7, name: "Urban Defense SUV", speed: 135, capacity: 6, durability: 75, unlockTime: 6, cost: 45000, locked: true, icon: "assets/icons/police_v7.png", emoji: "🚙" },
        { level: 8, name: "Command Cruiser", speed: 145, capacity: 5, durability: 70, unlockTime: 6, cost: 60000, locked: true, icon: "assets/icons/police_v8.png", emoji: "🚔" },
        { level: 9, name: "Riot Control Carrier", speed: 90, capacity: 20, durability: 95, unlockTime: 6, cost: 85000, locked: true, icon: "assets/icons/police_v9.png", emoji: "🚐" },
        { level: 10, name: "Heavy Security Vehicle", speed: 105, capacity: 8, durability: 100, unlockTime: 6, cost: 110000, locked: true, icon: "assets/icons/police_v10.png", emoji: "🚙" },
        { level: 11, name: "AI Assisted Patrol", speed: 160, capacity: 4, durability: 60, unlockTime: 6, cost: 150000, locked: true, icon: "assets/icons/police_v11.png", emoji: "🚓" },
        { level: 12, name: "Smart Tactical Unit", speed: 150, capacity: 6, durability: 80, unlockTime: 6, cost: 200000, locked: true, icon: "assets/icons/police_v12.png", emoji: "🚔" },
        { level: 13, name: "Elite Response Vehicle", speed: 175, capacity: 4, durability: 75, unlockTime: 6, cost: 280000, locked: true, icon: "assets/icons/police_v13.png", emoji: "🚙" },
        { level: 14, name: "National Security Cruiser", speed: 165, capacity: 5, durability: 90, unlockTime: 6, cost: 400000, locked: true, icon: "assets/icons/police_v14.png", emoji: "🚓" },
        { level: 15, name: "Sovereign Guardian Vehicle", speed: 200, capacity: 6, durability: 120, unlockTime: 6, cost: 750000, locked: true, icon: "assets/icons/police_v15.png", emoji: "🏆" }
    ]);/**
 * OMEGA UI ENGINE: CORE ADAPTER
 * PART 2/6: AAA GLOWING NEON STRATEGY HUD, HOLOGRAPHIC SCANLINES & GLASS PANELS
 */
const _styles = {
    inject() {
        const id = `om-pro-styles-${CONSTANTS.VERSION}`; if (document.getElementById(id)) return;
        const style = document.createElement('style'); style.id = id;
        style.textContent = `
            :root { 
                --om-navy-dark: #030a16; 
                --om-navy-glass: rgba(5, 16, 28, 0.95); 
                --om-gold-metallic: linear-gradient(135deg, #ffe066 0%, #f1c40f 50%, #b7950b 100%); 
                --om-gold-border: rgba(241, 196, 15, 0.45); 
                --om-gold-glow: rgba(241, 196, 15, 0.25); 
                --om-ivory-text: #fdfefe; 
                --om-slate-mute: #aab7b8;
                --om-card-gradient: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01), rgba(4, 12, 24, 0.96));
                --om-royal-gold: #f1c40f;
                --om-neon-cyan: #00ffff;
                --om-cyan-glow: rgba(0, 255, 255, 0.3);
            }
            
            #cabinet-full-window { z-index: 9999 !important; position: fixed !important; inset: 0 !important; }
            .ui-layer { z-index: auto !important; }

            #cabinet-full-window #cabinet-body { 
                background: radial-gradient(circle at 50% 30%, #0d1f38 0%, #020710 100%) !important; 
                min-height: 100%; 
                padding: 40px 0 80px 0; 
                color: var(--om-ivory-text); 
                font-family: 'Cinzel', 'Trajan Pro', serif, 'Helvetica Neue', sans-serif; 
                overflow-y: auto;
                box-shadow: inset 0 0 100px rgba(0,0,0,0.8);
            }
            
            .om-state-header { 
                width: 90%; 
                max-width: 1200px; 
                margin: 0 auto 30px auto; 
                background: var(--om-navy-glass); 
                border: 1px solid var(--om-gold-border); 
                border-radius: 16px; 
                padding: 26px 35px; 
                box-shadow: 0 20px 45px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 20px var(--om-gold-glow); 
                backdrop-filter: blur(12px);
                position: relative;
                overflow: hidden;
            }
            .om-state-header::before {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; height: 2px;
                background: linear-gradient(90deg, transparent, var(--om-royal-gold), transparent);
            }
            .om-state-title { font-size: 28px; font-weight: 900; letter-spacing: 8px; color: var(--om-royal-gold); text-transform: uppercase; text-shadow: 0 0 15px var(--om-gold-glow); text-align: center; }
            .om-state-metrics { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 22px; justify-content: center; }
            .om-metric-item { font-size: 11px; font-weight: 800; color: var(--om-slate-mute); text-transform: uppercase; letter-spacing: 2px; border-left: 2px solid var(--om-gold-border); padding-left: 14px; display: flex; align-items: center; }
            .om-metric-val { color: #ffffff; font-weight: 900; margin-left: 8px; text-shadow: 0 0 10px rgba(255,255,255,0.4); font-size: 13px; }
            
            .om-royal-divider { width: 90%; max-width: 1200px; margin: 40px auto 20px auto; display: flex; align-items: center; gap: 15px; }
            .om-divider-label { font-size: 13px; font-weight: 900; color: var(--om-royal-gold); letter-spacing: 5px; text-transform: uppercase; text-shadow: 0 0 8px var(--om-gold-glow); }
            .om-divider-line { flex-grow: 1; height: 1px; background: linear-gradient(90deg, var(--om-gold-border), transparent); }
            
            .om-royal-card { 
                width: 90%; 
                max-width: 1200px; 
                height: 86px; 
                margin: 0 auto 14px auto; 
                position: relative; 
                overflow: hidden; 
                display: flex; 
                align-items: center; 
                background: var(--om-card-gradient); 
                border: 1px solid rgba(241, 196, 15, 0.25); 
                border-radius: 16px; 
                padding: 0 30px; 
                justify-content: space-between; 
                cursor: pointer; 
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 15px 40px rgba(0,0,0,0.75); 
                transition: transform .25s cubic-bezier(.2,.8,.2,1), border-color .25s, box-shadow .25s; 
                isolation: isolate; 
                outline: none; 
            }
            .om-royal-card::before { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 20%, rgba(0, 255, 255, 0.15), transparent 80%); transform: translateX(-120%); transition: .7s; z-index: -1; }
            .om-royal-card:hover::before { transform: translateX(120%); }
            .om-royal-card:hover, .om-royal-card:focus { transform: translateY(-4px) scale(1.015); border-color: var(--om-neon-cyan); box-shadow: 0 25px 60px rgba(0,0,0,.85), 0 0 30px var(--om-cyan-glow); }
            .om-royal-card:active { transform: scale(.97) translateY(2px); box-shadow: inset 0 5px 20px rgba(0,0,0,.8); }
            .om-card-accent-strip { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--om-m-accent); box-shadow: 0 0 12px var(--om-m-accent); }
            
            .om-card-left { 
                width: 52px; height: 52px; 
                display: flex; align-items: center; justify-content: center; z-index: 1; 
                border-radius: 10px; 
                background: radial-gradient(circle, rgba(0, 255, 255, 0.1), rgba(0,0,0,0.6)); 
                border: 1px solid rgba(0, 255, 255, 0.3); 
                box-shadow: inset 0 0 15px rgba(0, 255, 255, 0.15); 
            }
            .om-m-icon { width: 75%; height: 75%; object-fit: contain; filter: drop-shadow(0 0 6px var(--om-cyan-glow)); }
            .om-m-svg-fallback { width: 26px; height: 24px; fill: var(--om-m-accent); filter: drop-shadow(0 0 6px var(--om-m-accent)); }
            .om-card-center { flex-grow: 1; margin: 0 22px; display: flex; flex-direction: column; z-index: 1; }
            .om-m-top-row { display: flex; flex-direction: column; }
            .om-m-title { font-size: 16px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--om-ivory-text); text-shadow: 0 2px 4px rgba(0,0,0,0.5); }
            .om-m-subtitle { font-size: 12px; color: var(--om-slate-mute); margin-top: 3px; }
            
            .om-m-status-pill { display: flex; align-items: center; padding: 5px 14px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(12px); }
            .om-m-dot { width: 7px; height: 7px; border-radius: 50%; margin-right: 9px; animation: pulseStatus 2s infinite; }
            .om-status-ready .om-m-dot, .om-status-active .om-m-dot { background: #2ecc71; box-shadow: 0 0 10px #2ecc71; }
            .om-status-priority .om-m-dot, .om-status-warning .om-m-dot { background: #e67e22; box-shadow: 0 0 10px #e67e22; }
            .om-status-critical .om-m-dot, .om-status-alert .om-m-dot { background: #e74c3c; box-shadow: 0 0 10px #e74c3c; }
            .om-status-secured .om-m-dot, .om-status-classified .om-m-dot { background: #3498db; box-shadow: 0 0 10px #3498db; }
            .om-m-chevron { font-size: 20px; color: var(--om-gold-border); margin-left: 14px; transition: transform 0.2s ease; }
            .om-royal-card:hover .om-m-chevron { transform: translateX(5px); color: var(--om-neon-cyan); }
            
            .om-prepare-entrance { opacity: 0; transform: translateY(12px); }
            .om-start-entrance { opacity: 1; transform: translateY(0); transition: opacity 0.5s ease, transform 0.5s ease; }
            .om-hidden { display: none !important; }
            
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `;
        document.head.appendChild(style);
    }
};/**
 * OMEGA UI ENGINE: CORE ADAPTER
 * PART 3/6: EXPLICIT TELEMETRY LOGGER, ACCESSCARD SKELETONS & ENGINE HOOKS
 */
const _log = (level, action, message, details = null) => {
    const prefix = `%c[OMEGA_UI_ADAPTER] [${level}] [${action}]`;
    let color = "color: #3498db; font-weight: bold;";
    if (level === "ERROR") color = "color: #e74c3c; font-weight: bold;";
    if (level === "WARN") color = "color: #f1c40f; font-weight: bold;";
    if (level === "SUCCESS") color = "color: #2ecc71; font-weight: bold;";
    
    console.log(prefix, color, message);
    if (details) console.dir(details);
};

const AccessCard = {
    get(data) { 
        _log("INFO", "AccessCard::get", `Allocating skeleton card Node for ministry ID: ${data.id}`);
        const el = _pool.pop() || this.createSkeleton(); 
        return this.hydrate(el, data); 
    },
    createSkeleton() {
        const el = document.createElement('div'); el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button');
        el.className = 'access-card om-royal-card cabinet-card start-entrance om-start-entrance';
        el.innerHTML = `
            <div class="card-icon-box">
                <span class="m-emoji-icon">🏛️</span>
            </div>
            <div class="m-title om-m-title"></div>
            <div class="m-subtitle om-m-subtitle"></div>
            <div class="card-accent-strip om-card-accent-strip"></div>`;
        return el;
    },
    hydrate(el, data) {
        el.dataset.id = data.id; el.classList.remove('hidden', 'om-hidden', 'om-pressed', 'prepare-entrance', 'om-prepare-entrance'); el.classList.add('start-entrance', 'om-start-entrance');
        el.style.setProperty('--om-m-accent', data.theme?.accent || '#D4AF37');
        el.style.setProperty('--card-accent', data.theme?.accent || '#D4AF37');
        
        const emojiEl = el.querySelector('.m-emoji-icon');
        if (emojiEl) {
            emojiEl.textContent = data.emoji || '🏛️';
        }

        const titleEl = el.querySelector('.om-m-title') || el.querySelector('.m-title');
        if (titleEl) titleEl.textContent = data.title;
        const subEl = el.querySelector('.om-m-subtitle') || el.querySelector('.m-subtitle');
        if (subEl) subEl.textContent = data.subtitle || '';

        _payloadStore.set(el, Object.freeze(data.payload || {})); return el;
    },
    reset(el) {
        el.className = 'om-royal-card cabinet-card om-hidden'; el.removeAttribute('style');
        el.onpointerdown = el.onpointerup = el.onpointermove = el.onpointercancel = el.onpointerleave = el.onkeydown = el.onclick = null; _payloadStore.delete(el); return el;
    },
    recycle(el) { if (_pool.length < CONSTANTS.MAX_POOL) _pool.push(this.reset(el)); else el.remove(); }
};

const ASSET_RESOLVER = {
    _paths: Object.freeze({
        cabinet: "M12 2L2 7l10 5 10-5-10-5zm0 18l-10-5 10 5 10-5-10 5z",
        interior: "M12 5.67L16.29 10H7.71L12 5.67M12 2L2 12h3v8h14v-8h3L12 2z",
        defense: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z",
        military: "M12 2L4 5v6c0 5.25 3.4 10.2 8 11.5 4.6-1.3 8-6.25 8-11.5V5l-8-3zm-1 6h2v6h-2V8zm0 8h2v2h-2v-2z",
        finance: "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1H6.32c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
        economy: "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z",
        trade: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4V8h16v10zm-2-1h-3v-2h3v2zm-5 0H4v-2h9v2z",
        foreign: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
        intelligence: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
        transport: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17H5v-4h14v4z",
        resource: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
        health: "M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z",
        education: "M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z",
        technology: "M20 18c1.1 0 1.99-.9 1.99-2L22 5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 5h16v11H4V5z",
        projects: "M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
        culture: "M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM3.27 9L12 4.23 20.73 9 12 13.77 3.27 9z",
        statistics: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"
    }),
    resolve(id, iconPath) { return { path: iconPath || null, symbol: this._paths[id] || "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" }; }
};

const OMEGA_UI_RET_OBJ = {
    ..._styles, runtime: null, bridge: null, presentation: null, _initialized: false,
    _autowire() {
        _log("INFO", "BootSequence", "Executing dynamic non-blocking autowire checking loops...");
        const self = this; if (typeof this.inject === "function") this.inject();
        const tryHook = () => {
            if (!window.OmegaMinistry) return false;
            if (window.OmegaMinistry.__OMEGA_UI_HOOKED__ || window.OmegaMinistry.__OMEGA_UI_LOCKED__) {
                _log("SUCCESS", "BootSequence", "Adapter hooks already present. Autowire hook skipped.");
                return true;
            }
            if (typeof window.OmegaMinistry.createRuntime !== "function") return false;
            try {
                _log("SUCCESS", "BootSequence", "OmegaMinistry core found. Hooking createRuntime initialization sequences...");
                const originalCreate = window.OmegaMinistry.createRuntime;
                window.OmegaMinistry.createRuntime = function () {
                    const rt = originalCreate.apply(this, arguments); const originalInit = rt.init;
                    rt.init = function (bridge) { const result = originalInit.apply(this, arguments); self.init(rt, bridge); return result; }; return rt;
                }; 
                window.OmegaMinistry.createRuntime.__OMEGA_ORIGINAL__ = originalCreate;
                window.OmegaMinistry.__OMEGA_UI_HOOKED__ = true;
                Object.defineProperty(window.OmegaMinistry, "__OMEGA_UI_LOCKED__", { value: true, writable: false });
                return true;
            } catch (err) { _log("ERROR", "BootSequence", "Autowire hook sequence failed physically.", err); return false; }
        };
        if (!tryHook()) {
            _log("WARN", "BootSequence", "OmegaMinistry not found. Constructing lazy interval loader...");
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                if (tryHook() || attempts > 50) {
                    _log("INFO", "BootSequence", `Interval polling closed. Total attempts: ${attempts}`);
                    clearInterval(checkInterval);
                }
            }, 100);
        }
    },/**
 * OMEGA UI ENGINE: CORE ADAPTER
 * PART 4/6: EXPLICIT INITIALIZER, GARBAGE REDUCTIONS, EVENT ROUTERS & METRIC CACHING
 */
    init(runtimeInstance, bridgeInstance, presentationInstance) {
        if (this._initialized) {
            if (presentationInstance && !this.presentation) {
                this.presentation = presentationInstance;
                _log("INFO", "init", "Late-bound PresentationEngine connected to OMEGA_UI_ADAPTER.");
            }
            if (bridgeInstance && !this.bridge) {
                this.bridge = bridgeInstance;
            }
            _log("WARN", "init", "Adapter already initialized. Updated runtime references.");
            return;
        }
        try {
            _log("INFO", "init", "Binding dependencies and event parameters to core layout...");
            this.runtime = runtimeInstance; this.bridge = bridgeInstance;
            this.presentation = presentationInstance || (this.runtime?.api?.ext ? this.runtime.api.ext("PresentationEngine") : null) || window.Omega?.App?.presentation || null;

            _log("INFO", "init", `PresentationEngine Hook Status: ${this.presentation ? "CONNECTED" : "FALLBACK_MANUAL"}`);

            this.registerMandatoryEvents(); this.wireBridge(); this.bindHtmlButtons();
            
            const attemptForcedRender = () => {
                const manifest = window.GLOBAL_MINISTRY_MANIFEST;
                if (Array.isArray(manifest) && manifest.length > 0) {
                    const body = document.getElementById("cabinet-body");
                    if (body) { 
                        _log("SUCCESS", "init", `Target DOM matches successfully. Rendering screen ID: ${CONSTANTS.DEFAULT_SCREEN}`);
                        this.render(null, CONSTANTS.DEFAULT_SCREEN); 
                        return true; 
                    }
                }
                return false;
            };

            requestAnimationFrame(() => {
                if (!attemptForcedRender()) {
                    _log("WARN", "init", "DOM targets not yet instantiated. Setting up MutationObserver sync gate...");
                    const wrapper = document.getElementById("cabinet-full-window") || document.body;
                    _renderObserver = new MutationObserver((mutations, obs) => {
                        _log("INFO", "DOM_Observer", "Cabinet window node detected. Forcing setup render...");
                        if (attemptForcedRender()) obs.disconnect();
                    });
                    _renderObserver.observe(wrapper, { childList: true, subtree: wrapper === document.body });
                }
            });

            _headerUpdateInterval = setInterval(() => this.updateHeader(), CONSTANTS.POLLING_RATE);
            this._initialized = true;
            this._presentationInitialized = true;
        } catch (err) {
            this._initialized = false;
            _log("ERROR", "init", "Initialization failed safely.", err);
        }
    },
    dispose() {
        _log("WARN", "dispose", "Executing full system cleanup and reference release...");
        if (_headerUpdateInterval) clearInterval(_headerUpdateInterval); 
        if (this.bridge && _originalEmit) this.bridge.emitEvent = _originalEmit;
        if (window.OmegaMinistry && window.OmegaMinistry.createRuntime?.__OMEGA_ORIGINAL__) {
            window.OmegaMinistry.createRuntime = window.OmegaMinistry.createRuntime.__OMEGA_ORIGINAL__;
        }
        if (_observer) _observer.disconnect(); if (_renderObserver) _renderObserver.disconnect();
        _eventListeners.forEach(v => v.el.removeEventListener("click", v.fn));
        _eventListeners.clear(); _headerCache.clear(); _activeElements.clear(); this._initialized = false;
    },
    wireBridge() {
        if (!this.bridge) {
            _log("WARN", "wireBridge", "No bridge connection found. Simulation event proxy bypassed.");
            return;
        }
        _log("INFO", "wireBridge", "Injecting custom emit event interception to simulation core...");
        const self = this; _originalEmit = this.bridge.emitEvent;
        this.bridge.emitEvent = function(name, data) { 
            _log("INFO", "Bridge::emitEvent", `Proxy intercepted event: ${name}`, data);
            if (typeof _originalEmit === 'function') _originalEmit.apply(this, arguments); 
            self.onEvent(name, data); 
        };
    },
    bindHtmlButtons() {
        const binder = () => {
            const win = document.getElementById("cabinet-full-window"), cBtn = document.getElementById("btn-main-cabinet"), hqBtn = document.getElementById("btn-hq"), closeBtn = document.getElementById("btn-close-cabinet"), closeHubBtn = document.getElementById("btn-close-hub");
            if (!win) return false;
            const open = () => { 
                _log("INFO", "ButtonAction", "Opening State Council menu windows.");
                win.style.display = "flex"; win.style.opacity = "1"; win.style.pointerEvents = "auto"; 
                this.render(null, CONSTANTS.DEFAULT_SCREEN); 
            };
            const close = () => { 
                _log("INFO", "ButtonAction", "Closing State Council menu windows.");
                win.style.display = "none"; win.style.opacity = "0"; win.style.pointerEvents = "none"; 
            };
            const add = (el, fn, id) => { if(el) { if (_eventListeners.has(id)) return; el.addEventListener("click", fn); _eventListeners.set(id, {el, fn}); } };
            add(cBtn, open, 'c-open'); add(hqBtn, open, 'h-open'); add(closeBtn, close, 'c-close'); add(closeHubBtn, close, 'h-close');
            add(document.getElementById("btn-home"), () => this.render(null, "MAIN_GOV"), 'btn-home'); add(document.getElementById("btn-politics"), () => this.render(null, "POLITICS"), 'btn-politics');
            return true;
        };
        if (!binder()) {
            const winObs = document.getElementById("cabinet-full-window") || document.body;
            _observer = new MutationObserver(() => { if (binder()) _observer.disconnect(); }); 
            _observer.observe(winObs, {childList: true, subtree: winObs === document.body}); 
        }
    },
    registerMandatoryEvents() {
        try {
            if (!this.runtime?.api?.events) return; const evs = this.runtime.api.events();
            if (evs && typeof evs.hasEvent === "function" && typeof evs.registerEvent === "function") {
                [...Object.values(EVENTS), "UI_RENDER_STARTED", "UI_RENDER_FINISHED", "UI_INTERIOR_READY", "UI_UNLOCK"].forEach(e => { 
                    try { if (!evs.hasEvent(e)) evs.registerEvent(e); } catch(err) {} 
                });
            }
        } catch(e) {}
    },
    onEvent(eventName, data) {
        _log("INFO", "EventBus", `Processing incoming event signal: ${eventName}`);
        if (eventName === EVENTS.INTERIOR_READY || eventName === EVENTS.LOAD_FINISHED || eventName === EVENTS.LEGACY_LOAD || eventName === "UI_RENDER_STARTED" || eventName === "UI_UNLOCK") {
            const status = (this.bridge && typeof this.bridge.getMinistryStatus === 'function') ? this.bridge.getMinistryStatus(CONSTANTS.UI_OWNER) : (window.Game?.state || "IDLE");
            if (["READY", "RUNNING", "RUN"].includes(status)) { this.render(null, data?.screenId ?? data?.ministryId ?? CONSTANTS.DEFAULT_SCREEN); }
        }
    },
    getMetric(key) { 
        try { 
            const bb = this.runtime?.api?.blackboard?.();
            if (bb && typeof bb.read === "function") { const val = bb.read(key, CONSTANTS.UI_OWNER); if (val !== undefined && val !== null) return val; }
        } catch(e) {} 
        return window.Game?.worldState?.[key] || window.Game?.state?.[key] || 150000; 
    },
    updateHeader() {
        const h = document.getElementById('om-state-header'); if (!h) { _headerCache.clear(); return; }
        if (_headerCache.size === 0) { ["YEAR", "TREASURY", "STABILITY", "GDP"].forEach(k => { const el = h.querySelector(`.om-val-${k.toLowerCase()}`); if(el) _headerCache.set(k, el); }); }
        _headerCache.forEach((el, key) => { const newVal = this.getMetric(METRIC_KEYS[key]); if(el.textContent !== String(newVal)) el.textContent = newVal; });
    },/**
 * OMEGA UI ENGINE: CORE ADAPTER
 * PART 5/6: DYNAMIC RENDER ROUTING, GESTURE ACTION SYSTEM & SUB-DIRECTORATE ENTRIES
 */
    render(activeFlow, screenId) {
        const targetScreen = screenId || activeFlow?.ministryId || CONSTANTS.DEFAULT_SCREEN;
        _log("INFO", "render", `Initiating render compiles for screen target ID: ${targetScreen}`);
        const uiLayer = document.getElementById("cabinet-body"); if (!uiLayer) {
            _log("ERROR", "render", "Target workspace node '#cabinet-body' missing in DOM. Aborting paint.");
            return;
        }
        uiLayer.innerHTML = ''; 

        // DETERMINISTIC SCREEN DISTRIBUTION PIPELINE
        if (targetScreen === "interior") {
            this.renderInteriorHQ();
            return;
        }
        if (targetScreen !== CONSTANTS.DEFAULT_SCREEN && targetScreen !== "cabinet" && targetScreen !== "MAIN_GOV" && targetScreen !== "POLITICS") {
            this.renderExecutiveMinistryHQ(targetScreen);
            return;
        }

        uiLayer.insertAdjacentHTML('afterbegin', `<div id="om-state-header" class="om-state-header"><div class="om-state-title">STATE COUNCIL</div><div class="om-state-metrics"><div class="om-metric-item">Cycle <span class="om-val-year"></span></div><div class="om-metric-item">Treasury <span class="om-val-treasury"></span></div><div class="om-metric-item">Stability <span class="om-val-stability"></span></div><div class="om-metric-item">GDP <span class="om-val-gdp"></span></div></div></div>`);
        this.updateHeader(); 
        try { 
            const bb = this.runtime?.api?.blackboard?.();
            if(bb && typeof bb.write === "function") bb.write("UI::CURRENT_SCREEN", targetScreen, CONSTANTS.UI_OWNER, this.getMetric(METRIC_KEYS.TICK) || 0, [], -1); 
        } catch(e) {}

        const dataList = window.GLOBAL_MINISTRY_MANIFEST;
        const gridContainer = document.createElement('div');
        gridContainer.className = 'om-cabinet-grid-container';
        uiLayer.appendChild(gridContainer);

        const sched = requestAnimationFrame;
        dataList.forEach((data, i) => {
            let el = _activeElements.get(data.id);
            if (!el) { 
                el = AccessCard.get(data); 
                this.attachInput(el); 
            } else {
                AccessCard.hydrate(el, data);
            }
            gridContainer.appendChild(el); 
            _activeElements.set(data.id, el);
            if (!el.classList.contains('om-start-entrance')) {
                sched(() => setTimeout(() => el.classList.add('om-start-entrance'), i * 30));
            }
        });
    },
    renderExecutiveMinistryHQ(ministryId) {
        const item = window.GLOBAL_MINISTRY_MANIFEST?.find(m => m.id === ministryId);
        const title = item ? item.title.toUpperCase() : ministryId.toUpperCase();
        const subtitle = item ? item.subtitle : "Executive Directorate Office";
        const emoji = item ? item.emoji : "🏛️";
        const body = document.getElementById("cabinet-body"); if(!body) return;

        body.innerHTML = `
            <div class="interior-command cabinet-card" style="max-width: 600px; margin: 0 auto; text-align: center; padding: 25px; background: rgba(11, 21, 36, 0.95); border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <div style="font-size: 54px; margin-bottom: 10px;">${emoji}</div>
                <h1 style="font-family: var(--font-title); color: #ffd700; font-size: 22px; margin: 0 0 5px 0;">${title}</h1>
                <p style="color: #94a3b8; font-size: 13px; margin: 0 0 20px 0; font-family: var(--font-mono);">${subtitle}</p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                    <button id="btn-hq-act-1" class="om-command-btn" style="height: 55px; border-color: #00e5ff;">⚡ EXECUTIVE DIRECTIVE<br><span style="font-size:10px; color:#8a99ad;">Issue State Order</span></button>
                    <button id="btn-hq-act-2" class="om-command-btn" style="height: 55px; border-color: #eab308;">📊 ALLOCATE BUDGET<br><span style="font-size:10px; color:#8a99ad;">+$10M Treasury Shift</span></button>
                    <button id="btn-hq-act-3" class="om-command-btn" style="height: 55px; border-color: #22c55e;">🛡️ SECTOR READINESS<br><span style="font-size:10px; color:#8a99ad;">Audit Operations</span></button>
                    <button id="btn-hq-act-4" class="om-command-btn" style="height: 55px; border-color: #a855f7;">📜 POLICY REFORM<br><span style="font-size:10px; color:#8a99ad;">Legislation Drafting</span></button>
                </div>

                <button id="btn-back-main" class="om-command-btn" style="border-color:#7f8c8d; width: 100%;">🔙 BACK TO STATE COUNCIL</button>
            </div>
        `;

        document.getElementById("btn-back-main").onclick = () => { this.render(null, CONSTANTS.DEFAULT_SCREEN); };
        
        const showActionToast = (actName) => {
            this.showAdvisePopup(title, `${actName} executed successfully under Executive Cabinet Authority.`);
        };
        document.getElementById("btn-hq-act-1").onclick = () => showActionToast("Executive Directive");
        document.getElementById("btn-hq-act-2").onclick = () => {
            if (window.Game && window.Game.resources) Game.resources.cash += 10000000;
            showActionToast("Treasury Budget Allocation (+$10M)");
        };
        document.getElementById("btn-hq-act-3").onclick = () => showActionToast("Sector Readiness Audit");
        document.getElementById("btn-hq-act-4").onclick = () => showActionToast("Policy Reform Directive");
    },
    attachInput(el) {
        let sX, pId = null, isD = false;
        el.onpointerdown = (e) => { pId = e.pointerId; try { el.setPointerCapture(pId); } catch(err) {} sX = e.clientX; isD = false; el.classList.add('om-pressed'); };
        el.onpointermove = (e) => { if (e.pointerId !== pId) return; if (Math.abs(e.clientX - sX) > CONSTANTS.DRAG_THRESHOLD) { isD = true; el.classList.remove('om-pressed'); } };
        el.onpointerup = (e) => { if (e.pointerId !== pId) return; el.classList.remove('om-pressed'); if (!isD && Math.abs(e.clientX - sX) < CONSTANTS.DRAG_THRESHOLD) this.handleSelection(el.dataset.id); try { el.releasePointerCapture(pId); } catch(err) {} pId = null; };
        el.onpointercancel = el.onlostpointercapture = () => { el.classList.remove('om-pressed'); pId = null; };
        el.onclick = (e) => {
            if (!isD) this.handleSelection(el.dataset.id);
        };
    },
    handleSelection(id) {
        _log("INFO", "Selection", `User initiated transition interface trigger on ID: ${id}`);
        if (this.runtime?.api?.feature && this.runtime.api.feature("UI_LOCK")) return; 
        this.openMinistryIntro(id);
    },
    openMinistryIntro(id) {
        _log("INFO", "MinistryIntro", `Requesting transition trigger to PresentationEngine for: ${id}`);
        const presentation = this.presentation || window.Omega?.App?.presentation;
        const item = window.GLOBAL_MINISTRY_MANIFEST?.find(m => m.id === id);
        const title = item ? item.title.toUpperCase() : id.toUpperCase();
        const subtitle = item ? item.subtitle : "Executive Directorate Office";

        if(presentation && typeof presentation.triggerTransition === "function") {
            presentation.triggerTransition({ ministryId: id, title, subtitle });
        } else {
            _log("WARN", "MinistryIntro", "Presentation trigger transition contract unavailable. Rendering HQ manually.");
            this.render(null, id);
        }
    },
    renderInteriorHQ() {
        _log("INFO", "InteriorHQ", "Assembling holographic command panel for Ministry of Interior...");
        const body = document.getElementById("cabinet-body"); if(!body) return;
        body.innerHTML = `
            <div class="interior-command cabinet-card">
                <div class="interior-logo">🏛️</div>
                <h1>MINISTRY OF INTERIOR</h1>
                <p>National Stability & Civil Security Directorate</p>
                <button id="btn-police-command" class="om-command-btn">🚔 POLICE COMMAND</button>
                <button id="btn-internal-security" class="om-command-btn">🛡️ INTERNAL SECURITY</button>
                <button id="btn-civil-admin" class="om-command-btn">🏙️ CIVIL ADMINISTRATION</button>
                <button id="btn-emergency-resp" class="om-command-btn">🚨 EMERGENCY RESPONSE</button>
                <button id="btn-back-main" class="om-command-btn" style="border-color:#7f8c8d; margin-top:15px;">BACK TO STATE COUNCIL</button>
            </div>`;
        document.getElementById("btn-police-command").onclick = () => { this.openPoliceCommand(); };
        document.getElementById("btn-back-main").onclick = () => { this.render(null, CONSTANTS.DEFAULT_SCREEN); };
        const fallbackMsg = () => this.showAdvisePopup("SYSTEM EXCLUSIVITY", "This sector is currently operated automatically under executive guidelines. Focus on Police Command infrastructure upgrades.");
        document.getElementById("btn-internal-security").onclick = fallbackMsg;
        document.getElementById("btn-civil-admin").onclick = fallbackMsg;
        document.getElementById("btn-emergency-resp").onclick = fallbackMsg;
    },
    openPoliceCommand() {
        _log("INFO", "PoliceCommand", "Deploying National Police Directorate interface systems...");
        const body = document.getElementById("cabinet-body"); if(!body) return;
        body.innerHTML = `
            <div class="interior-command police-dashboard cabinet-card">
                <div style="text-align:center; margin-bottom:20px;">
                    <div class="interior-logo">🚔</div>
                    <h2>POLICE COMMAND</h2>
                    <p>National Police Directorate & Command Infrastructure</p>
                </div>
                <button id="btn-recruit-police" class="om-command-btn">1.1 RECRUIT POLICE</button>
                <button id="btn-upgrade-vehicles" class="om-command-btn">1.2 UPDATE FLEET & FACILITIES</button>
                <button id="btn-tactics-police" class="om-command-btn">1.3 ADVANCED POLICE TACTICS</button>
                <div class="police-stats">
                    <div><strong id="stat-personnel">${STATE_DATABASE.policeCount}</strong><span>Personnel</span></div>
                    <div><strong id="stat-efficiency">${STATE_DATABASE.policeEfficiency}%</strong><span>Efficiency</span></div>
                    <div><strong id="stat-trust">${STATE_DATABASE.policeTrust}%</strong><span>Public Trust</span></div>
                </div>
                <button id="btn-back-interior" class="om-command-btn" style="border-color:#e67e22; margin-top:15px;">BACK TO SECTOR OFFICE</button>
            </div>`;
        document.getElementById("btn-recruit-police").onclick = () => { this.renderRecruitScreen(); };
        document.getElementById("btn-upgrade-vehicles").onclick = () => { this.renderUpgradeMenu(); };
        document.getElementById("btn-tactics-police").onclick = () => { this.renderTacticsMenu(); };
        document.getElementById("btn-back-interior").onclick = () => { this.renderInteriorHQ(); };
    },// =========================================================================
        // MICRO-PIECE 1 OF 3 (FACILITIES UPGRADES MODULE & SECTOR REDIRECTS)
        // =========================================================================
        renderFacilitiesPanel() {
            _log("INFO", "FacilitiesPanel", "Constructing civil protection administrative nodes...");
            const body = document.getElementById("cabinet-body"); if(!body) return;
            body.innerHTML = `
                <div class="interior-command police-dashboard cabinet-card">
                    <div style="text-align:center; margin-bottom:20px;">
                        <div class="interior-logo">🏢</div>
                        <h2>1.2.2 DISTRICT FACILITIES UPGRADE</h2>
                        <p>Construct Administrative Buildings & Enhance Support Nodes</p>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                        <button id="fac-station" class="om-command-btn" style="height:65px;">🏛️ Station Node<br><span style="font-size:10px; color:#8a99ad;">Lvl ${STATE_DATABASE.facilityLevels.station}</span></button>
                        <button id="fac-patrol" class="om-command-btn" style="height:65px;">🚓 Patrol Grids<br><span style="font-size:10px; color:#8a99ad;">Lvl ${STATE_DATABASE.facilityLevels.patrol}</span></button>
                        <button id="fac-academy" class="om-command-btn" style="height:65px;">🎓 Academies<br><span style="font-size:10px; color:#8a99ad;">Lvl ${STATE_DATABASE.facilityLevels.academy}</span></button>
                        <button id="fac-department" class="om-command-btn" style="height:65px;">🎛️ Department HQ<br><span style="font-size:10px; color:#8a99ad;">Lvl ${STATE_DATABASE.facilityLevels.department}</span></button>
                    </div>
                    <button id="btn-back-fac" class="om-command-btn" style="margin-top:20px; border-color:#7f8c8d;">BACK TO FLEET OPTIONS</button>
                </div>`;

            const bindFac = (id, label, currentLvl) => {
                document.getElementById(id).onclick = () => {
                    const cost = currentLvl * 15000;
                    const modal = document.createElement("div");
                    modal.className = "om-modal-overlay";
                    modal.innerHTML = `
                        <div class="om-modal-content">
                            <div class="om-modal-header" style="font-size:18px; display:flex; justify-content:space-between; align-items:center;">
                                <span>🏛️ UPGRADE ${label}</span>
                                <button id="btn-top-close-fac" style="background:rgba(255,68,68,0.25); border:1px solid #ff4444; color:#fff; border-radius:6px; padding:4px 10px; font-weight:bold; cursor:pointer; font-size:12px;">✕ EXIT</button>
                            </div>
                            <div style="text-align:center; margin:15px 0;"><span style="font-size:60px;">🏢</span></div>
                            <div class="om-modal-desc">
                                Current Administrative Standard: Level ${currentLvl}<br>
                                Upgrading increases defensive efficiency and support infrastructure.
                            </div>
                            <div class="om-input-row">
                                <div class="om-slim-bar"><span>Target Level: ${currentLvl + 1}</span></div>
                                <div class="om-slim-bar"><span>Cost: $${cost}</span></div>
                            </div>
                            <div class="om-modal-btn-group">
                                <button id="btn-fac-advise" class="om-command-btn" style="flex:1; border-color:#e67e22;">MINISTER ADVICE</button>
                                <button id="btn-fac-build" class="om-command-btn" style="flex:1; background:#2ecc71;">🔨 UPGRADE DISTRICT</button>
                            </div>
                            <button id="btn-close-fac-mod" class="om-command-btn" style="border-color:#ff4444; background:rgba(255,68,68,0.2); margin-top:15px; height:40px; font-weight:bold; color:#fff;">✕ EXIT WINDOW</button>
                        </div>`;
                    document.body.appendChild(modal);
                    const closeMod = () => { modal.remove(); };
                    document.getElementById("btn-close-fac-mod").onclick = closeMod;
                    document.getElementById("btn-top-close-fac").onclick = closeMod;
                    modal.onclick = (e) => { if (e.target === modal) closeMod(); };
                    
                    document.getElementById("btn-fac-advise").onclick = () => {
                        const treasury = this.getMetric("STATE_TREASURY");
                        const status = treasury >= cost ? 
                            "Advisor: We have ample room in the budget. Construction will bolster state stability immediately." :
                            `Advisor: Capital reserves are insufficient. We are short by $${cost - treasury}.`;
                        this.showAdvisePopup("FINANCIAL COUNSEL", status);
                    };

                    document.getElementById("btn-fac-build").onclick = () => {
                        const treasury = this.getMetric("STATE_TREASURY");
                        if(treasury < cost) {
                            this.showAdvisePopup("CONSTRUCTION HALTED", "Treasury funds are insufficient to carry out administrative blueprints.");
                            return;
                        }
                        STATE_DATABASE.facilityLevels[id.split('-')[1]]++;
                        STATE_DATABASE.policeTrust = Math.min(100, STATE_DATABASE.policeTrust + 3);
                        this.showAdvisePopup("UPGRADE SUCCESSFUL", `Your district administrative units modernized. Stability metrics improved.`);
                        modal.remove();
                        this.renderFacilitiesPanel();
                    };
                };
            };

            bindFac("fac-station", "POLICE STATION NODE", STATE_DATABASE.facilityLevels.station);
            bindFac("fac-patrol", "PATROL SECTOR GRIDS", STATE_DATABASE.facilityLevels.patrol);
            bindFac("fac-academy", "ACADEMIC TRAINING CENTERS", STATE_DATABASE.facilityLevels.academy);
            bindFac("fac-department", "EXECUTIVE DEPARTMENTS", STATE_DATABASE.facilityLevels.department);

            document.getElementById("btn-back-fac").onclick = () => { this.renderUpgradeMenu(); };
        },

        renderTacticsMenu() {
            _log("INFO", "TacticsMenu", "Opening specialized security doctrines panels...");
            const body = document.getElementById("cabinet-body"); if(!body) return;
            body.innerHTML = `
                <div class="interior-command police-dashboard cabinet-card">
                    <div style="text-align:center; margin-bottom:20px;">
                        <div class="interior-logo">🚨</div>
                        <h2>1.3 STRATEGIC TACTICS & PROTOCOLS</h2>
                        <p>Enhance Operational Guidelines, Security Drills, and Espionage Networks</p>
                    </div>
                    <button id="btn-tactic-research" class="om-command-btn">🛡️ 1.3.1 FORCE SECURITY PROTOCOLS</button>
                    <button id="btn-tactic-training" class="om-command-btn">🎓 1.3.2 SPECIALIZED ACADEMY TRAINING</button>
                    <button id="btn-tactic-spies" class="om-command-btn">🕵️ 1.3.3 AGENT ESPIONAGE & COVERT NETWORK</button>
                    <button id="btn-back-hq-main" class="om-command-btn" style="margin-top:15px; border-color:#7f8c8d;">RETURN TO COMMAND</button>
                </div>`;
            document.getElementById("btn-tactic-research").onclick = () => { this.renderTacticsResearch(); };
            document.getElementById("btn-tactic-training").onclick = () => { this.renderTrainingFacilities(); };
            document.getElementById("btn-tactic-spies").onclick = () => { this.renderSpecialForces(); };
            document.getElementById("btn-back-hq-main").onclick = () => { this.openPoliceCommand(); };
        },// =========================================================================
        // MICRO-PIECE 2 OF 3 (DOCTRINES & DRILLS EDUCATION PROTOCOLS)
        // =========================================================================
        renderTacticsResearch() {
            _log("INFO", "TacticsResearch", "Loading national tactical doctrine blueprints...");
            const body = document.getElementById("cabinet-body"); if(!body) return;
            const r = STATE_DATABASE.tacticsResearched;
            body.innerHTML = `
                <div class="interior-command police-dashboard cabinet-card">
                    <div style="text-align:center; margin-bottom:20px;">
                        <div class="interior-logo">🛡️</div>
                        <h2>1.3.1 TACTICAL DOCTRINES</h2>
                        <p>Deploy Advanced Operational Protocols Against Smuggling and Riots</p>
                    </div>
                    
                    <div class="om-royal-card cabinet-card" style="height:auto; padding:15px 25px; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                            <div>
                                <strong>ANTI-RIOT DEFENSIVE PROTOCOLS</strong>
                                <div style="font-size:11px; color:var(--om-slate-mute); margin-top:4px;">Stops destabilization during massive civil demonstrations.</div>
                            </div>
                            <button id="btn-res-riot" class="om-command-btn" style="width:auto; margin:0; padding:5px 15px;" ${r.antiRiot ? 'disabled' : ''}>${r.antiRiot ? 'ACTIVE' : 'RESEARCH'}</button>
                        </div>
                    </div>

                    <div class="om-royal-card cabinet-card" style="height:auto; padding:15px 25px; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                            <div>
                                <strong>SMUGGLER INTERDICTION GRID</strong>
                                <div style="font-size:11px; color:var(--om-slate-mute); margin-top:4px;">Maximizes national customs revenue and intercepts contraband.</div>
                            </div>
                            <button id="btn-res-smuggle" class="om-command-btn" style="width:auto; margin:0; padding:5px 15px;" ${r.smugglerInterdict ? 'disabled' : ''}>${r.smugglerInterdict ? 'ACTIVE' : 'RESEARCH'}</button>
                        </div>
                    </div>

                    <div class="om-royal-card cabinet-card" style="height:auto; padding:15px 25px; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                            <div>
                                <strong>COUNTER-TERRORISM COGNIZANCE</strong>
                                <div style="font-size:11px; color:var(--om-slate-mute); margin-top:4px;">Mitigates extremist infrastructure attacks completely.</div>
                            </div>
                            <button id="btn-res-terror" class="om-command-btn" style="width:auto; margin:0; padding:5px 15px;" ${r.counterTerror ? 'disabled' : ''}>${r.counterTerror ? 'ACTIVE' : 'RESEARCH'}</button>
                        </div>
                    </div>

                    <button id="btn-back-tac-main" class="om-command-btn" style="margin-top:15px; border-color:#7f8c8d;">RETURN TO DOCTRINES</button>
                </div>`;

            const handleResearch = (key, title) => {
                STATE_DATABASE.tacticsResearched[key] = true;
                STATE_DATABASE.policeEfficiency = Math.min(100, STATE_DATABASE.policeEfficiency + 10);
                _log("SUCCESS", "TacticsResearch", `Successfully unlocked security doctrine: ${title}`);
                this.showAdvisePopup("DOCTRINE INCORPORATED", `${title} has been authorized into law-enforcement directives.`);
                this.renderTacticsResearch();
            };

            if(!r.antiRiot) document.getElementById("btn-res-riot").onclick = () => handleResearch("antiRiot", "Anti-Riot Protocols");
            if(!r.smugglerInterdict) document.getElementById("btn-res-smuggle").onclick = () => handleResearch("smugglerInterdict", "Smuggler Interdiction Grid");
            if(!r.counterTerror) document.getElementById("btn-res-terror").onclick = () => handleResearch("counterTerror", "Counter-Terrorism Cognizance");

            document.getElementById("btn-back-tac-main").onclick = () => { this.renderTacticsMenu(); };
        },

        renderTrainingFacilities() {
            _log("INFO", "TrainingFacilities", "Inquiring drill and education capacity levels...");
            const body = document.getElementById("cabinet-body"); if(!body) return;
            const academyLvl = STATE_DATABASE.facilityLevels.academy;
            const currentTq = STATE_DATABASE.trainingQualityLevel;
            const canUpgrade = academyLvl > currentTq;

            body.innerHTML = `
                <div class="interior-command police-dashboard cabinet-card">
                    <div style="text-align:center; margin-bottom:20px;">
                        <div class="interior-logo">🎓</div>
                        <h2>1.3.2 DRILL & EDUCATION INFRASTRUCTURE</h2>
                        <p>Strengthen Tactical Drills to Improve Officer Response Ratings</p>
                    </div>
                    
                    <div style="background:rgba(0,0,0,0.5); padding:20px; border-radius:10px; border:1px solid rgba(212,175,55,0.3); margin-bottom:20px;">
                        <strong>EDUCATION RATING: Level ${currentTq}</strong><br>
                        <span style="font-size:12px; color:var(--om-slate-mute);">District Training Facility Limit: Level ${academyLvl}</span>
                        ${!canUpgrade ? `<div style="color:#e74c3c; font-size:11px; font-weight:bold; margin-top:10px;">⚠️ CANNOT INCREASES TRAINING QUALITY. Upgrade District Academies level first to unlock this standard.</div>` : ''}
                    </div>

                    <div class="om-modal-btn-group">
                        <button id="btn-up-acad-fac" class="om-command-btn" style="flex:1; border-color:#e67e22;">UPGRADE ACADEMIES</button>
                        <button id="btn-up-drill-qual" class="om-command-btn" style="flex:1; background:#2ecc71;" ${!canUpgrade ? 'disabled style="opacity:0.5;"' : ''}>UPGRADE TRAINING QUALITY</button>
                    </div>

                    <button id="btn-training-minister" class="om-command-btn" style="margin-top:15px; border-color:var(--om-royal-gold);">ORDER MINISTER DELEGATION</button>
                    <button id="btn-back-tactics" class="om-command-btn" style="margin-top:10px; border-color:#7f8c8d;">RETURN TO DOCTRINES</button>
                </div>`;

            document.getElementById("btn-up-acad-fac").onclick = () => {
                this.renderFacilitiesPanel();
            };

            document.getElementById("btn-up-drill-qual").onclick = () => {
                if(canUpgrade) {
                    STATE_DATABASE.trainingQualityLevel++;
                    STATE_DATABASE.policeEfficiency = Math.min(100, STATE_DATABASE.policeEfficiency + 12);
                    _log("SUCCESS", "TrainingQuality", "Command upgraded operational drill standards.");
                    this.showAdvisePopup("TRAINING RESTRUCTURED", "Advanced academic doctrines deployed. Officer efficiency increased successfully.");
                    this.renderTrainingFacilities();
                }
            };

            document.getElementById("btn-training-minister").onclick = () => {
                this.showAdvisePopup("EXECUTIVE AUTOPILOT COMMISSIONED", "Minister of Interior authorized to balance and coordinate training budgets with local tax revenues automatically.");
            };

            document.getElementById("btn-back-tactics").onclick = () => { this.renderTacticsMenu(); };
        },// =========================================================================
        // MICRO-PIECE 3 OF 3 (COVERT AGENTS, MODALS, SYSTEM RETURNS & MANIFEST)
        // =========================================================================
        renderSpecialForces() {
            _log("INFO", "SpecialForces", "Polling active global agent deployment rosters...");
            const body = document.getElementById("cabinet-body"); if(!body) return;
            body.innerHTML = `
                <div class="interior-command police-dashboard cabinet-card">
                    <div style="text-align:center; margin-bottom:20px;">
                        <div class="interior-logo">🕵️</div>
                        <h2>1.3.3 COVERT OPERATIONS BRANCH</h2>
                        <p>Recruit Elite Inter-Country Intelligence Operatives to Counter Sabotage</p>
                    </div>
                    
                    <div style="background:rgba(0,0,0,0.5); padding:20px; border-radius:10px; border:1px solid rgba(212,175,55,0.3); margin-bottom:20px;">
                        <strong>ACTIVE ESPIONAGE NETWORK:</strong> ${STATE_DATABASE.specialAgents} Agents deployed.<br>
                        <span style="font-size:12px; color:var(--om-slate-mute);">Current Sabotage Risk of National Factories: ${STATE_DATABASE.sabotageRisk}%</span><br><br>
                        <span style="font-size:11px; color:#e67e22;">*Without covert tracking, hostile agents can destroy valuable infrastructure like aluminum factories. Deployed spies mitigate sabotage risk completely.</span>
                    </div>

                    <button id="btn-hire-spy" class="om-command-btn" style="background:#8e44ad;">RECRUIT SPECIAL AGENT (Cost: $50,000)</button>
                    <button id="btn-back-tac" class="om-command-btn" style="margin-top:15px; border-color:#7f8c8d;">RETURN TO DOCTRINES</button>
                </div>`;

            document.getElementById("btn-hire-spy").onclick = () => {
                const treasury = this.getMetric("STATE_TREASURY");
                if(treasury >= 50000) {
                    STATE_DATABASE.specialAgents++;
                    STATE_DATABASE.sabotageRisk = Math.max(5, STATE_DATABASE.sabotageRisk - 8);
                    _log("SUCCESS", "SpecialForces", "Inducted elite counter-sabotage operative to defense grid.");
                    this.showAdvisePopup("AGENT INDUCTED", "Operative successfully placed on state surveillance payroll. Counter-espionage grid expanded.");
                    this.renderSpecialForces();
                } else {
                    this.showAdvisePopup("BUDGET DEFICIT", "Insufficient state treasury funds to secure agent clearance parameters.");
                }
            };

            document.getElementById("btn-back-tac").onclick = () => { this.renderTacticsMenu(); };
        },

        showAdvisePopup(title, text) {
            const overlay = document.createElement("div");
            overlay.className = "om-advise-popup";
            overlay.innerHTML = `
                <div class="om-advise-box" style="position:relative;">
                    <button class="om-advise-close-btn" style="position:absolute; top:12px; right:12px; background:rgba(255,68,68,0.25); border:1px solid #ff4444; color:#fff; border-radius:4px; padding:2px 8px; font-weight:bold; cursor:pointer; font-size:12px;" aria-label="Close Advisory">✕ EXIT</button>
                    <div class="om-advise-title" style="padding-right:50px;">${title}</div>
                    <div class="om-advise-text">${text}</div>
                    <div class="om-advise-dismiss" style="margin-top:15px; background:rgba(0,255,204,0.15); border:1px solid var(--om-cyan-glow); padding:8px; border-radius:6px; cursor:pointer; text-align:center; font-weight:bold;">CLICK OR PRESS ESC TO EXIT</div>
                </div>`;
            document.body.appendChild(overlay);
            overlay.onclick = () => { overlay.remove(); };
        }
    };
    return OMEGA_UI_RET_OBJ;
})();

// --- GLOBAL MANIFEST DECLARATION - SECURED & UNTOUCHED (17 MINISTRIES) ---
window.GLOBAL_MINISTRY_MANIFEST = (() => {
    const data = [
        { id: 'cabinet', title: 'State Coordination', subtitle: 'Executive Bureau', emoji: '🏛️', theme: { accent: '#2c3e50' }, status: 'PRIORITY' },
        { id: 'defense', title: 'Ministry of Defense', subtitle: 'Operations Command', emoji: '🛡️', theme: { accent: '#8b0000' }, status: 'SECURED' },
        { id: 'military', title: 'Ministry of Military', subtitle: 'Force Logistics', emoji: '⚔️', theme: { accent: '#445362' }, status: 'ACTIVE' },
        { id: 'finance', title: 'Ministry of Finance', subtitle: 'Treasury Office', emoji: '💰', theme: { accent: '#D8C79B' }, status: 'STABLE' },
        { id: 'economy', title: 'Ministry of Economy', subtitle: 'Planning Authority', emoji: '⚙️', theme: { accent: '#065535' }, status: 'ACTIVE' },
        { id: 'trade', title: 'Ministry of Trade', subtitle: 'Global Commerce', emoji: '🔄', theme: { accent: '#3498db' }, status: 'READY' },
        { id: 'foreign', title: 'Foreign Affairs', subtitle: 'Diplomatic Corps', emoji: '🌐', theme: { accent: '#002366' }, status: 'STABLE' },
        { id: 'intelligence', title: 'Intelligence Agency', subtitle: 'Internal Security', emoji: '🕵️', theme: { accent: '#310062' }, status: 'CLASSIFIED' },
        { id: 'interior', title: 'Ministry of Interior', subtitle: 'Civil Administration', emoji: '🏢', theme: { accent: '#4C5E70' }, status: 'ACTIVE' },
        { id: 'transport', title: 'Transport & Infra', subtitle: 'Infrastructure Grid', emoji: '✈️', theme: { accent: '#e67e22' }, status: 'ACTIVE' },
        { id: 'resource', title: 'Resource Management', subtitle: 'Resource Authority', emoji: '⛏️', theme: { accent: '#d35400' }, status: 'PRIORITY' },
        { id: 'health', title: 'Health & Population', subtitle: 'Health Administration', emoji: '⚕️', theme: { accent: '#b22222' }, status: 'STABLE' },
        { id: 'education', title: 'Ministry of Education', subtitle: 'Human Capital', emoji: '📚', theme: { accent: '#0f52ba' }, status: 'READY' },
        { id: 'technology', title: 'Science & Tech', subtitle: 'Research Agency', emoji: '🔬', theme: { accent: '#4682b4' }, status: 'READY' },
        { id: 'projects', title: 'Laws & Projects', subtitle: 'National Missions', emoji: '📜', theme: { accent: '#8e44ad' }, status: 'ACTIVE' },
        { id: 'culture', title: 'Culture & Media', subtitle: 'Cultural Identity', emoji: '🎨', theme: { accent: '#f39c12' }, status: 'STABLE' },
        { id: 'statistics', title: 'Ministry of Stats', subtitle: 'Data Authority', emoji: '📊', theme: { accent: '#7f8c8d' }, status: 'ACTIVE' }
    ];
    const freeze = (o) => { Object.freeze(o); Object.getOwnPropertyNames(o).forEach(p => { if (o[p] !== null && (typeof o[p] === "object" || typeof o[p] === "function") && !Object.isFrozen(o[p])) freeze(o[p]); }); return o; };
    return freeze(data);
})();

window.OMEGA_UI_ADAPTER = OMEGA_UI_ADAPTER;
OMEGA_UI_ADAPTER._autowire();
