class PresentationEngine {
    constructor(kernelInstance) {
        this.logInfo("[STEP 1: BOOT] Initializing PresentationEngine...");

        // 1. Security Check: Kernel Validation
        if (!kernelInstance || typeof kernelInstance.createBridge !== "function") {
            const err = "[FATAL ERROR] Immutable Kernel Core is missing or invalid.";
            console.error(err);
            throw new Error(err);
        }

        this.bridge = kernelInstance.createBridge();
        this.logInfo("[STEP 1.1: BOOT] Kernel Bridge successfully created.");
        
        // 2. DOM Security: Container Validation
        const appEl = document.getElementById("app");
        if (!appEl) {
            this.logWarning("[STEP 1.2: DOM] '#app' container missing. Falling back to document.body. This may cause styling conflicts.");
        }
        this.root = appEl || document.body;
        
        // 3. Global Registry Handshake
        if (typeof window !== "undefined") {
            window.Omega = window.Omega || {};
            window.Omega.App = window.Omega.App || {};
            window.Omega.App.presentation = this;
        }

        // 4. UI Adapter Hard Linking & Logging
        this._uiAdapter = (typeof window !== "undefined" && window.OMEGA_UI_ADAPTER) ? window.OMEGA_UI_ADAPTER : null;
        if (this._uiAdapter) {
            this.logInfo("[STEP 1.3: ADAPTER] OMEGA_UI_ADAPTER successfully connected.");
        } else {
            this.logWarning("[STEP 1.3: ADAPTER] OMEGA_UI_ADAPTER not in global scope yet. Will bind dynamically.");
        }

        this.applyRootStyles();

        // 5. Strict State Machine
        this.STATE = Object.freeze({
            IDLE: "IDLE",
            INTRO: "INTRO",
            LOADING: "LOADING",
            INTERIOR: "INTERIOR",
            TRANSITION_LOCK: "TRANSITION_LOCK",
            DESTROYED: "DESTROYED"
        });

        this.TRANSITION_TABLE = Object.freeze({
            "IDLE": ["TRANSITION_LOCK", "DESTROYED"],
            "TRANSITION_LOCK": ["INTRO", "IDLE", "DESTROYED"],
            "INTRO": ["LOADING", "IDLE", "DESTROYED"],
            "LOADING": ["INTERIOR", "IDLE", "DESTROYED"], 
            "INTERIOR": ["TRANSITION_LOCK", "IDLE", "DESTROYED"],
            "DESTROYED": []
        });

        this.state = this.STATE.IDLE;
        this.currentFlowId = 0;
        this.activeAbortController = null;
        this.animationFrames = new Set();
        this.timers = new Set();
        this.isTabPaused = false; 

        // 6. Layer Initialization with Strict Depth
        this.layers = new Map();
        this.bgLayer = this.getOrCreateLayer("bg-layer", 1);
        this.introLayer = this.getOrCreateLayer("intro-layer", 10);
        this.uiLayer = this.getOrCreateLayer("ui-layer", 20);
        this.loadingBar = this.createLoadingBar();

        this.assetCache = new Map();
        this.pendingPreloads = new Map();
        this.MAX_CACHE_SIZE = 15; 
                const configPath = kernelInstance.config?.assetPath || window.Omega?.CONFIG?.assetPath;
        this.baseAssetPath = configPath || "./assets/visuals/";

        this.backgroundRegistry = new Map([
            ["economy", "economy_bg.jpg.jpg"],
            ["defense", "defense_bg.jpg.jpg"],
            ["MONETARY_POLICY", "economy_bg.jpg.jpg"],
            ["TACTICAL_DEPLOYMENT", "defense_bg.jpg.jpg"],
            ["INTERNAL_SECURITY", "defense_bg.jpg.jpg"],
            ["FOREIGN_DIPLOMACY", "economy_bg.jpg.jpg"],
            ["AGRI_FOOD_SECURITY", "economy_bg.jpg.jpg"],
            ["HEALTH_INFRASTRUCTURE", "defense_bg.jpg.jpg"]
        ]);

        // ==========================================================================================
        // SHARED ARCHITECTURE PROPERTIES WITH STRICT TRACKING
        // ==========================================================================================
        this.sharedState = {
            CURRENT_SCREEN: "IDLE",             
            UI_LOCK: false,                     
            lastError: null,                    
            activeFlow: null,                   
            assetReady: false,                  
            uiReady: false,                     
            isBusy: false,                      
            isDestroyed: false,                 
            renderExecuted: false,
            renderSuccess: false,
            adapterConnected: !!this.uiAdapter,
            dispatchComplete: false             
        };

        this.transitionQueue = [];              
        this.init();
    }

    get uiAdapter() {
        if (!this._uiAdapter && typeof window !== "undefined" && window.OMEGA_UI_ADAPTER) {
            this._uiAdapter = window.OMEGA_UI_ADAPTER;
            this.logInfo("[STEP 1.3: ADAPTER] OMEGA_UI_ADAPTER dynamically connected.");
        }
        return this._uiAdapter || (typeof window !== "undefined" ? window.OMEGA_UI_ADAPTER : null);
    }

    set uiAdapter(val) {
        this._uiAdapter = val;
    }

    // --- ENHANCED LOGGING ENGINE ---
    logInfo(msg, data = null) {
        console.info(`%c[UI_ENGINE] [INFO]%c ${msg}`, "color: #2ecc71; font-weight: bold; background: #000; padding: 2px 5px;", "color: inherit;", data || "");
    }
    
    logWarning(msg) {
        console.warn(`%c[UI_ENGINE] [WARN]%c ${msg}`, "color: #f1c40f; font-weight: bold; background: #000; padding: 2px 5px;", "color: inherit;");
    }
    
    logError(msg, err = null) {
        console.error(`%c[UI_ENGINE] [ERROR]%c ${msg}`, "color: #e74c3c; font-weight: bold; background: #000; padding: 2px 5px;", "color: inherit;");
        if (err) console.error(err);
    }

    init() {
        this.logInfo("[STEP 2: INIT] Injecting Base Styles and Handlers...");
        this.injectBaseStyles();
        this.setupResizeHandler();
        this.setupVisibilityHandler(); 
    }

    applyRootStyles() {
        if (this.root) {
            const computedPosition = window.getComputedStyle(this.root).position;
            if (computedPosition === "static") {
                this.root.style.position = "relative";
                this.root.style.overflow = "hidden";
            }
        }
    }
        setState(newState) {
        if (!this.STATE[newState]) {
            this.logError(`[STATE ERROR] Attempted to set undefined state: ${newState}`);
            return;
        }

        const allowedTransitions = this.TRANSITION_TABLE[this.state];
        if (allowedTransitions && !allowedTransitions.includes(newState)) {
            this.logError(`[STATE BLOCKED] Illegal transition: ${this.state} -> ${newState}`);
            return; 
        }

        this.logInfo(`[STATE CHANGE] ${this.state} -> ${newState}`);
        this.state = newState;
    }

    async ensureTargetDOMElementsReady(timeoutMs = 5000) {
        this.logInfo("[STEP 3.1: DOM CHECK] Verifying primary DOM targets...");
        const targets = ["cabinet-body", "cabinet-full-window", "btn-main-cabinet", "btn-hq"];
        const evaluateExistence = () => targets.every(id => document.getElementById(id) !== null);

        if (evaluateExistence()) {
            this.logInfo("[STEP 3.1: DOM CHECK] DOM Targets instantly ready.");
            return true;
        }

        this.logWarning("[STEP 3.1: DOM CHECK] Priority nodes missing. Constructing sync gate (Observer)...");

        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (evaluateExistence()) {
                    this.logInfo("[STEP 3.1: DOM CHECK] DOM Targets resolved via Observer.");
                    observer.disconnect();
                    clearTimeout(fallbackTimer);
                    resolve(true);
                }
            });

            observer.observe(this.root, { childList: true, subtree: true });

            const fallbackTimer = setTimeout(() => {
                observer.disconnect();
                this.logError(`[STEP 3.1: DOM CHECK ERROR] Barrier Timeout (${timeoutMs}ms). Missing structural DOM elements.`);
                resolve(false);
            }, timeoutMs);
            this.timers.add(fallbackTimer);
        });
    }

    async ensureUIRenderBarrier(timeoutMs = 5000) {
        this.logInfo("[STEP 3.2: RENDER BARRIER] Awaiting full UI composition...");
        return new Promise((resolve) => {
            const checkRenderState = () => {
                const isAdapterReady = this.uiAdapter !== null;
                const isDispatchComplete = this.sharedState.dispatchComplete === true;
                
                const cabinetBody = document.getElementById("cabinet-body");
                let isDomReady = false;
                
                if (cabinetBody && cabinetBody.children.length > 0) {
                    const hasValidCard = cabinetBody.querySelector(".om-royal-card") !== null || cabinetBody.firstElementChild !== null;
                    if (hasValidCard) isDomReady = true;
                }
                
                if (isDomReady && isAdapterReady && isDispatchComplete) {
                    this.sharedState.renderSuccess = true;
                    return true;
                }
                return false;
            };

            if (checkRenderState()) {
                this.logInfo("[STEP 3.2: RENDER BARRIER] Barrier instantly cleared.");
                resolve(true);
                return;
            }

            const observer = new MutationObserver(() => {
                if (checkRenderState()) {
                    this.logInfo("[STEP 3.2: RENDER BARRIER] Barrier cleared via DOM Mutation.");
                    observer.disconnect();
                    clearTimeout(timer);
                    resolve(true);
                }
            });

            const target = document.getElementById("cabinet-body") || this.root;
            if (target) observer.observe(target, { childList: true, subtree: true });

            const timer = setTimeout(() => {
                observer.disconnect();
                this.logError(`[STEP 3.2: RENDER BARRIER ERROR] Timeout (${timeoutMs}ms). Composition Layer failed to render valid UI.`);
                resolve(false);
            }, timeoutMs);
            this.timers.add(timer);
        });
            }
                        async triggerTransition(data) {
        if (this.state === this.STATE.DESTROYED) {
            this.logError("[TRANSITION BLOCKED] System is in DESTROYED state.");
            return;
        }

        const ministryId = data?.ministryId || "UNKNOWN";
        this.logInfo(`\n============================================\n[FLOW START] Triggering transition for: ${ministryId}\n============================================`);

        if (this.sharedState.isBusy) {
            this.logWarning(`[FLOW INTERRUPTED] Concurrent flow detected. Aborting previous Flow ID: ${this.currentFlowId}`);
            if (this.activeAbortController) this.activeAbortController.abort();
            await new Promise(resolve => setTimeout(resolve, 50)); // Allow cleanup
        }

        const bg = this.getBackground(ministryId);
        const fullAssetUrl = `${this.baseAssetPath}${bg}`;

        this.resetPresentation();

        this.sharedState.UI_LOCK = true;
        this.sharedState.isBusy = true;
        this.sharedState.activeFlow = data;
        this.sharedState.dispatchComplete = false;
        
        this.currentFlowId = (this.currentFlowId >= Number.MAX_SAFE_INTEGER) ? 1 : this.currentFlowId + 1;
        const flowId = this.currentFlowId;

        this.activeAbortController = new AbortController();
        const signal = this.activeAbortController.signal;

        this.setState(this.STATE.TRANSITION_LOCK);
        this.emitEventSafe("UI_TRANSITION_START", { flowId, ministryId });

        try {
            // STEP 1: DOM Checks
            const isDomReady = await this.ensureTargetDOMElementsReady();
            if (!isDomReady) throw new Error("DOM_NOT_READY_TIMEOUT");

            this.preloadAsset(fullAssetUrl);

            // STEP 2: INTRO
            this.emitEventSafe("UI_INTRO_STARTED", { flowId, ministryId });
            await this.runIntro(flowId, fullAssetUrl, signal);
            this.emitEventSafe("UI_INTRO_FINISHED", { flowId, ministryId });
            
            // STEP 3: LOADING
            this.emitEventSafe("UI_LOADING_STARTED", { flowId, ministryId });
            await this.runLoading(flowId, fullAssetUrl, signal);
            this.emitEventSafe("UI_LOADING_FINISHED", { flowId, ministryId });
            
            // STEP 4: INTERIOR
            this.emitEventSafe("UI_INTERIOR_STARTED", { flowId, ministryId });
            await this.runInterior(flowId, fullAssetUrl, signal);

            // STEP 5: DISPATCH TO UI ADAPTER
            this.logInfo(`[STEP 5: DISPATCH] Handing off rendering to UI Adapter for: ${ministryId}`);
            if (this.uiAdapter && typeof this.uiAdapter.render === "function") {
                try {
                    this.uiAdapter.render(null, ministryId);
                    this.sharedState.dispatchComplete = true;
                    this.logInfo("[STEP 5: DISPATCH SUCCESS] UI Adapter activated.");
                } catch (dispatchErr) {
                    this.logError("[STEP 5: DISPATCH EXCEPTION] Adapter threw an error during render:", dispatchErr);
                    throw new Error("ADAPTER_RENDER_CRASH");
                }
            } else {
                this.logError("[STEP 5: DISPATCH FAILURE] UI Adapter missing or invalid 'render' function.");
                throw new Error("ADAPTER_MISSING");
            }

            // STEP 6: RENDER BARRIER WAIT
            const isRendered = await this.ensureUIRenderBarrier(5000);
            if (!isRendered) throw new Error("RENDER_BARRIER_TIMEOUT");

            // STEP 7: FINISH
            this.sharedState.uiReady = true;
            this.emitEventSafe("UI_RENDER_FINISHED", { flowId, ministryId });
            this.emitEventSafe("UI_INTERIOR_READY", { flowId, ministryId });
            this.emitEventSafe("UI_UNLOCK", { flowId, ministryId });

            this.sharedState.UI_LOCK = false;
            this.sharedState.isBusy = false;
            this.sharedState.CURRENT_SCREEN = ministryId; 
            this.logInfo(`[FLOW COMPLETE] Successfully rendered: ${ministryId}\n============================================\n`);

        } catch (e) {
            this.sharedState.lastError = e.message;
            if (e.message === "aborted") {
                this.logWarning(`[FLOW ABORTED] Flow ${flowId} intentionally aborted.`);
            } else {
                this.logError(`[FLOW FAILED] Flow ${flowId} crashed at execution: ${e.message}`);
                this.executeSystemFallbackRecovery();
            }
        }
                }
        runIntro(flowId, bgUrl, signal) {
        return new Promise((resolve, reject) => {
            if (signal.aborted) return reject(new Error("aborted"));
            
            this.logInfo("[VISUAL: INTRO] Starting Intro Sequence...");
            this.setState(this.STATE.INTRO);
            
            this.bgLayer.style.display = "none";
            this.uiLayer.style.display = "none";

            // INTRO EFFECT FIX: Force CSS Reflow for Smooth Transition
            this.introLayer.style.transition = "none"; // Disable temporarily
            this.introLayer.style.opacity = "0";
            this.introLayer.style.display = "block";
            this.introLayer.style.backgroundImage = `url(${bgUrl})`;
            
            // Force browser to recalculate styles (Reflow)
            void this.introLayer.offsetWidth; 

            // Re-enable transition and trigger fade in
            this.introLayer.style.transition = "opacity 0.6s ease-in-out";
            this.introLayer.style.opacity = "1"; 

            let timer = null;
            let hideTimer = null;

            timer = setTimeout(() => {
                this.timers.delete(timer);
                if (flowId !== this.currentFlowId || signal.aborted) return reject(new Error("aborted"));
                
                this.logInfo("[VISUAL: INTRO] Fading out Intro Layer...");
                this.introLayer.style.opacity = "0";
                
                hideTimer = setTimeout(() => {
                    this.timers.delete(hideTimer);
                    this.introLayer.style.display = "none"; 
                    signal.removeEventListener("abort", onAbort);
                    resolve(); 
                }, 600);
                this.timers.add(hideTimer);

            }, 1600);
            this.timers.add(timer);

            const onAbort = () => {
                if (timer) clearTimeout(timer);
                if (hideTimer) clearTimeout(hideTimer);
                signal.removeEventListener("abort", onAbort);
                reject(new Error("aborted"));
            };
            signal.addEventListener("abort", onAbort);
        });
    }

    runInterior(flowId, bgUrl, signal) {
        return new Promise((resolve, reject) => {
            if (signal.aborted || flowId !== this.currentFlowId) return reject(new Error("aborted"));
            
            this.logInfo("[VISUAL: INTERIOR] Starting Interior Layer Assembly...");
            this.setState(this.STATE.INTERIOR);
            
            const originalBackground = this.bgLayer.style.backgroundImage;
            if (originalBackground && originalBackground !== "none" && originalBackground !== `url("${bgUrl}")`) {
                this.executeSeamlessCrossfade(originalBackground, bgUrl);
            } else {
                this.bgLayer.style.backgroundImage = `url(${bgUrl})`;
            }

            this.bgLayer.style.display = "block";
            this.uiLayer.style.display = "block";

            const cabinetFullWindow = document.getElementById("cabinet-full-window");
            if (cabinetFullWindow) {
                cabinetFullWindow.style.display = "flex"; 
                cabinetFullWindow.style.pointerEvents = "auto";
                cabinetFullWindow.style.opacity = "1";
                cabinetFullWindow.style.position = "fixed";
                cabinetFullWindow.style.zIndex = "1000";
            } else {
                this.logWarning("[VISUAL: INTERIOR] 'cabinet-full-window' not found for stacking adjustment.");
            }

            // CSS Reflow for Interior Animation Sync
            this.bgLayer.style.transition = "none";
            this.bgLayer.style.filter = "blur(35px) brightness(0.20) saturate(0.5)";
            this.bgLayer.style.transform = "scale(1.25)";
            this.bgLayer.style.opacity = "0";
            
            void this.bgLayer.offsetWidth; // Force Reflow

            this.bgLayer.style.transition = "filter 0.8s cubic-bezier(0.25, 1, 0.5, 1), transform 0.8s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.6s ease";
            
            this.safeRequestAnimationFrame(() => {
                this.bgLayer.style.opacity = "1";
                this.uiLayer.style.opacity = "1";
                this.bgLayer.style.filter = "blur(18px) brightness(0.35) saturate(0.85)";
                this.bgLayer.style.transform = "scale(1.12)";
            });

            this.verifyExplicitLayerStack(); 
            resolve();
        });
                }
                    executeSystemFallbackRecovery() {
        this.logError("\n============================================\n[CRITICAL SECURITY] Executing Fallback Recovery Mechanism!\n============================================");
        
        // 1. Hard Reset State
        this.resetPresentation();
        
        // 2. Guarantee Minimum UI Visibility regardless of UI Adapter status
        const fullWindow = document.getElementById("cabinet-full-window");
        if (fullWindow) {
            fullWindow.style.transition = "none";
            fullWindow.style.display = "flex";
            fullWindow.style.opacity = "1";
            fullWindow.style.pointerEvents = "auto";
            fullWindow.style.zIndex = "9999"; // Force absolute top
            
            // Inject emergency content if completely empty
            if (fullWindow.innerHTML.trim() === "") {
                this.logWarning("[CRITICAL SECURITY] Injecting Emergency Recovery UI Node.");
                fullWindow.innerHTML = `
                    <div style="background: rgba(0,0,0,0.8); color: white; padding: 20px; text-align: center; border-radius: 8px;">
                        <h3>System Rendering Error</h3>
                        <p>The interface failed to load. Please refresh the module.</p>
                        <button onclick="window.location.reload()" style="padding: 10px 15px; margin-top:10px; cursor:pointer;">Reload</button>
                    </div>
                `;
            }
        } else {
            this.logError("[CRITICAL SECURITY] Fallback container missing. System UI is permanently blocked.");
        }
        
        // 3. Unlock User Constraints
        this.setState(this.STATE.IDLE);
        this.sharedState.UI_LOCK = false;
        this.sharedState.isBusy = false;
        this.emitEventSafe("UI_RECOVERY_EXECUTED", { timestamp: Date.now() });
    }

    emitEventSafe(eventName, payload) {
        if (typeof this.bridge.emitEvent === "function") {
            try {
                const result = this.bridge.emitEvent(eventName, payload);
                return true;
            } catch (e) {
                this.logError(`[EVENT ERROR] Emission failed for ${eventName}: ${e.message}`);
                return false;
            }
        }
        this.logError(`[EVENT BRIDGE MISSING] Cannot emit ${eventName}.`);
        return false;
    }

    resetPresentation() {
        if (this.activeAbortController) {
            this.activeAbortController.abort();
            this.activeAbortController = null;
        }

        [this.bgLayer, this.introLayer, this.uiLayer].forEach(layer => {
            if (layer) {
                layer.style.display = "none";
                layer.style.opacity = "0";
                layer.style.pointerEvents = "none"; 
            }
        });
        
        if (this.loadingBar) {
            this.loadingBar.style.width = "0%";
            if (this.loadingBar.parentElement) {
                this.loadingBar.parentElement.style.display = "none";
            }
        }

        if (this.state !== this.STATE.IDLE && this.state !== this.STATE.DESTROYED) {
            this.setState(this.STATE.IDLE);
        }

        this.sharedState.UI_LOCK = false;
        this.sharedState.isBusy = false;
        this.sharedState.activeFlow = null;
    }

    // Helper functions like getBackground, createLoadingBar, getOrCreateLayer, etc., remain exactly as they logically should be, but are omitted here only to save redundant character limits as the core logic above resolves your specified issues.
                }
                
        
