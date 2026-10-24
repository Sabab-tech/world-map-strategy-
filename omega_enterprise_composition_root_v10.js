/** 
     * OMEGA ENTERPRISE COMPOSITION ROOT (V10.0.0)
     * Responsibility: Orchestration, Lifecycle, Shutdown, Sync.
     */
    (function () {
        const OMEGA_BOOT = {
            validateContract: () => {
                const req = [
                    'map', 'res-cash', 'res-oil', 'command-hub-modal', 'cabinet-full-window',
                    'econ-gdp', 'econ-debt', 'diplomacy-list', 'tab-internal', 'tab-projects'
                ];
                const missing = req.filter(id => !document.getElementById(id));
                if (missing.length > 0) throw new Error("Contract Violation: Missing IDs " + missing.join(", "));
                
                // [FIX P1] Verify Script Load Status
                const critical = ['leaflet.js', 'omega_kernel.js'];
                critical.forEach(src => {
                    if(window.__OMEGA_DIAG__.boot.scriptStatus[src] === 'ERROR') {
                        console.warn(`[OMEGA WARN] Script load warning for: ${src}`);
                    }
                });
                window.__LOG_EVENT__("ALL_CONTRACTS_VERIFIED");
            }
        };

        const triggerFatal = (msg) => {
            const screen = document.getElementById('fatal-screen');
            const msgEl = document.getElementById('fatal-msg');
            if (screen) { screen.style.display = 'flex'; msgEl.innerText = msg; }
            window.__OMEGA_DIAG__.state = "FAILED";
            if (window.Omega && window.Omega.App && window.Omega.App.stopLoop) window.Omega.App.stopLoop();
        };

        const initOmega = () => {
            if (window.__OMEGA_DIAG__.state === "RUNNING") return;
            window.__LOG_EVENT__("BOOTSTRAP_SEQUENCE_START");

            try {
                OMEGA_BOOT.validateContract();

                if (!window.Omega || !window.Omega.Kernel) throw new Error("Kernel Core Missing.");
                const kernel = window.Omega.Kernel;
                
                // [FIX P1] Single Shared Bridge Creation
                let sharedBridge = null;
                if (typeof kernel.createBridge === "function") {
                    sharedBridge = kernel.createBridge();
                    window.__LOG_EVENT__("SHARED_BRIDGE_ESTABLISHED");
                }
                
                const PE = window.PresentationEngine || window.PresentationEngine;
                let presentation;
                if (typeof PE === 'function') {
                    try {
                        presentation = new PE(kernel);
                        // [FIX P1] Inject Shared Bridge into Presentation
                        if(sharedBridge) presentation.bridge = sharedBridge; 
                        
                        // [FIX P3] Subscribe to Presentation Ready State
                        window.addEventListener('UI_INTERIOR_READY', () => window.__LOG_EVENT__("PRESENTATION_INTERIOR_READY"));
                    } catch (peErr) { console.warn("Presentation Sync Warn", peErr); }
                }

                // [OMEGA 17M] Canonical runtime controller owns the complete ministry set.
                const ministryRuntimeController = window.OMEGA_MINISTRY_RUNTIME_V1 || window.Omega?.MinistryRuntime || null;
                const MINISTRIES = ministryRuntimeController && typeof ministryRuntimeController.getIds === "function"
                    ? ministryRuntimeController.getIds()
                    : ["cabinet","defense","military","finance","economy","trade","foreign","intelligence","interior","transport","resource","health","education","technology","projects","culture","statistics"];

                if (ministryRuntimeController && typeof ministryRuntimeController.init === "function") {
                    if (!ministryRuntimeController.init(kernel)) {
                        let controllerHealth = null;
                        try {
                            const health = typeof ministryRuntimeController.health === "function"
                                ? ministryRuntimeController.health() : null;
                            if (health) controllerHealth = {
                                initialized:health.initialized,
                                engineRegistryHealthy:health.engineRegistryHealthy,
                                engineRegistryReason:health.engineRegistryReason,
                                missingEngineIds:health.missingEngineIds,
                                count:health.count,
                                independent:health.independent,
                                uniqueInstances:health.uniqueInstances,
                                interoperability:health.interoperability
                                    ? { ok:health.interoperability.ok, initialized:health.interoperability.initialized,
                                        reason:health.interoperability.reason, version:health.interoperability.version }
                                    : null
                            };
                        } catch (_) {}
                        throw new Error("17-Ministry Runtime Controller initialization failed: " +
                            JSON.stringify(controllerHealth || {health:"UNAVAILABLE"}));
                    }
                    window.__LOG_EVENT__("MINISTRY_RUNTIME_17_CONTROLLER_READY");
                } else {
                    MINISTRIES.forEach(id => {
                        if (typeof kernel.registerMinistry === "function") kernel.registerMinistry(id);
                    });
                    console.warn("[OMEGA] Canonical 17-Ministry Runtime Controller missing; kernel-only fallback active.");
                }

                // [FIX P3] Expose System Objects
                window.Omega.App = {
                    kernel,
                    presentation,
                    bridge: sharedBridge,
                    state: "READY",
                    ministryRuntime: ministryRuntimeController,
                    simulation: window.Omega && window.Omega.Simulation ? window.Omega.Simulation : null
                };

                // [OMEGA SIMULATION AUTHORITY] Establish one canonical orchestration path.
                const simulationRuntime = window.Omega?.Simulation || null;
                if (simulationRuntime && typeof simulationRuntime.configure === "function") {
                    simulationRuntime.configure({
                        state: window.Game?.state || window.gameState || {},
                        worldEngine: window.WorldEcosystemEngine || null,
                        interoperability: window.Omega?.MinistryInteroperability || window.OmegaMinistryInteroperability || null,
                        ministryRuntime: ministryRuntimeController,
                        ministryPump: ({ turn, stepDurationMs }) => {
                            const results = [];
                            MINISTRIES.forEach(id => {
                                if (typeof kernel.pumpOrchestratedPipelineTick !== "function") return;
                                const result = kernel.pumpOrchestratedPipelineTick(id, stepDurationMs, turn, {
                                    onMessage: (message) => ministryRuntimeController?.handleMessage?.(id, message),
                                    onMinistryTick: (tickDt, currentTurn, store, blackboard) => {
                                        ministryRuntimeController?.tick?.(id, tickDt, currentTurn, store, blackboard);
                                    }
                                });
                                results.push({ id, result: result ?? null });
                            });
                            return results;
                        }
                    });
                    window.Omega.App.simulation = simulationRuntime;
                    window.__LOG_EVENT__("SIMULATION_COORDINATOR_CONFIGURED");
                }

                // UI v2 owns player-facing ministry navigation. Do not instantiate the
                // retired OmegaMinistry runtime / UI adapter as part of application boot:
                // its constructor can throw before the UI is ready, and the legacy fatal
                // overlay then intercepts every touch even though the kernel is initialized.
                // Keep the old source files intact for reference, but do not execute them.
                if (window.OMEGA_UI_ADAPTER && typeof window.OMEGA_UI_ADAPTER.dispose === "function") {
                    try {
                        window.OMEGA_UI_ADAPTER.dispose();
                    } catch (adapterError) {
                        console.warn("[OMEGA] Retired UI adapter cleanup was skipped:", adapterError?.message || adapterError);
                    }
                }
                window.__LOG_EVENT__("LEGACY_MINISTRY_UI_ADAPTER_SKIPPED");

                // The simulation clock advances in 10-second steps. Polling it at display
                // refresh rate repeatedly hydrated world state while no game turn was due.
                // A 100 ms scheduler is responsive for the day-based clock without tying
                // simulation work to the screen's 60 Hz paint loop.
                const SIMULATION_FRAME_INTERVAL_MS = 100;
                // Preserve bounded catch-up during a slow asynchronous turn.
                const MAX_FRAME_DELTA_MS = 10000;
                let isPaused = document.hidden === true;
                let loopTimerId = null;
                let loopInProgress = false;
                let shutdownRequested = false;
                let lastTime = performance.now();
                let frameTick = 0;

                window.Omega.markMinistryDirty = (id) => {
                    window.__LOG_EVENT__("MINISTRY_REFRESH_REQUEST:" + String(id || "ALL"));
                };
                window.Omega.setActiveMinistry = (id) => {
                    if (id) window.__LOG_EVENT__("MINISTRY_ACTIVE:" + String(id));
                };
                window.Omega.requestMinistryUpdate = window.Omega.markMinistryDirty;

                window.addEventListener("MINISTRY_STATE_CHANGED", () => {});
                window.addEventListener("MINISTRY_SELECTED", () => {});
                window.addEventListener("RESOURCE_STATE_UPDATED", () => {});
                window.addEventListener("POLICY_VOTE_CAST", () => {});
                window.addEventListener("DECISION_ENACTED", () => {});

                function scheduleEngineLoop(delayMs) {
                    if (isPaused || shutdownRequested || loopInProgress || loopTimerId !== null) return;
                    loopTimerId = window.setTimeout(() => {
                        loopTimerId = null;
                        engineLoop();
                    }, Math.max(0, delayMs));
                }

                async function engineLoop() {
                    if (isPaused || shutdownRequested || loopInProgress) return;
                    loopInProgress = true;
                    try {
                        const now = performance.now();
                        const dt = Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - lastTime));
                        lastTime = now;
                        frameTick += 1;
                        if (window.__OMEGA_DIAG__ && window.__OMEGA_DIAG__.metrics) {
                            window.__OMEGA_DIAG__.metrics.tick = frameTick;
                        }

                        const simulation = window.Omega?.Simulation;
                        if (simulation && typeof simulation.frame === "function") {
                            await simulation.frame(dt);
                        }

                        if (frameTick === 1) {
                            window.setTimeout(() => {
                                const mapInst = window.map || (window.Game && window.Game.Map && window.Game.Map.map);
                                if (mapInst && typeof mapInst.invalidateSize === 'function') mapInst.invalidateSize();
                            }, 200);
                        }
                    } catch (error) {
                        try {
                            window.__OMEGA_DIAG__.errors.push({
                                msg: error?.message || String(error),
                                type: "SIMULATION_RUNTIME"
                            });
                        } catch (_) {}
                        try { window.__LOG_EVENT__("SIMULATION_STEP_FAILED"); } catch (_) {}
                    } finally {
                        loopInProgress = false;
                        scheduleEngineLoop(SIMULATION_FRAME_INTERVAL_MS);
                    }
                }

                document.addEventListener("visibilitychange", () => {
                    isPaused = document.hidden === true;
                    if (isPaused) {
                        if (loopTimerId !== null) window.clearTimeout(loopTimerId);
                        loopTimerId = null;
                        window.__LOG_EVENT__("CORE_SLEEP");
                        return;
                    }
                    // Do not count time spent in the background as active simulation time.
                    lastTime = performance.now();
                    window.__LOG_EVENT__("CORE_WAKE");
                    scheduleEngineLoop(0);
                });

                // Auto transition disabled on boot so player lands cleanly on primary interface
                // if (presentation && typeof presentation.triggerTransition === "function") {
                //     presentation.triggerTransition({ ministryId: "economy" });
                // }

                // [FIX P2] Safe Dispatch
                setTimeout(() => {
                    window.__OMEGA_DIAG__.state = "RUNNING";
                    window.dispatchEvent(new CustomEvent("OMEGA_READY", { detail: window.Omega.App }));
                    window.__LOG_EVENT__("SYSTEM_LIVE_ENTERPRISE");
                }, 500);

                // [FIX P1/P2] Universal Cleanup & Shutdown
                const shutdown = () => {
                    if (shutdownRequested) return;
                    shutdownRequested = true;
                    isPaused = true;
                    if (loopTimerId !== null) window.clearTimeout(loopTimerId);
                    loopTimerId = null;
                    window.__LOG_EVENT__("SYSTEM_SHUTDOWN_CLEANUP");
                    if (kernel && typeof kernel.stopOrchestratedPipeline === 'function') kernel.stopOrchestratedPipeline();
                    if (presentation && typeof presentation.destroy === 'function') presentation.destroy();
                };

                scheduleEngineLoop(0);
                window.Omega.App.stopLoop = shutdown;
                window.addEventListener("beforeunload", shutdown);

            } catch (err) {
                const fatalDetail = String(err && (err.stack || err.message) || err || "UNKNOWN_BOOT_ERROR").slice(0, 3000);
                try {
                    window.__OMEGA_DIAG__.errors.push({ msg:fatalDetail, type:"FATAL_BOOT" });
                } catch (_) {}
                triggerFatal(err && err.message ? err.message : fatalDetail);
                // Android WebChromeClient receives one console message at a time. A
                // multi-argument console.error("[FATAL]", err) drops the useful error
                // because the bridge logs only message.message().
                console.error("[FATAL_BOOT_DETAIL] " + fatalDetail);
            }
        };

        // [FIX P1] Boot only when window and all assets are ready
        window.addEventListener("load", initOmega);
    })();
