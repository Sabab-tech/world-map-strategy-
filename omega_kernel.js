/**
 * ============================================================================
 * PROJECT: OMEGA GEOPOLITICAL GAME ENGINE
 * MODULE: HARDENED UNIFIED KERNEL & RUNTIME CORE
 * VERSION: v13.2.0-PRODUCTION-ENTERPRISE-MASTER
 * STATUS: FULL DATA PRESERVED | EVENT QUEUED | RETRY LIMITED | HARDENED LOGGER
 * ============================================================================
 */

window.Omega = window.Omega || {};

(() => {
    // ========================================================================
    // I. CORE LIFECYCLE & SEMANTIC VERSIONING MATRIX WITH HARDENED CONSTANTS
    // ========================================================================
    const KernelLifecycle = Object.freeze({
        REGISTERED: "REGISTERED", INITIALIZING: "INITIALIZING", READY: "READY",
        RUNNING: "RUNNING", SUSPENDED: "SUSPENDED", FAILED: "FAILED",
        RECOVERING: "RECOVERING", STOPPED: "STOPPED"
    });

    const RuntimeLifecycle = Object.freeze({
        INIT: 0, RUN: 1, SUSPEND: 2, STOP: 3, RECOVERING: 4, DESTROYED: 5
    });

    // 7. Configurable Recovery Timing & Retry Constants
    const RECOVERY_TICK_DELAY = 3;
    const MAX_RECOVERY_RETRIES = 3;

    const LifecycleMap = new Map([
        [KernelLifecycle.INITIALIZING, RuntimeLifecycle.INIT],
        [KernelLifecycle.READY, RuntimeLifecycle.RUN],
        [KernelLifecycle.RUNNING, RuntimeLifecycle.RUN],
        [KernelLifecycle.SUSPENDED, RuntimeLifecycle.SUSPEND],
        [KernelLifecycle.STOPPED, RuntimeLifecycle.STOP],
        [KernelLifecycle.FAILED, RuntimeLifecycle.RECOVERING],
        [KernelLifecycle.RECOVERING, RuntimeLifecycle.RECOVERING]
    ]);

    class OmegaFrameworkException extends Error {
        constructor(sys, type, msg) {
            super(`[${sys} - ${type}] ${msg}`);
            this.name = "OmegaFrameworkException";
            this.system = sys; this.type = type;
        }
    }

    // ========================================================================
    // II. CYCLIC-SAFE CLONE, MULTI-PLANE DEEP FREEZE & RE-BALANCED MAX-HEAP
    // ========================================================================
    function omegaDeepClone(obj, seen = new WeakMap()) {
        if (obj === null || typeof obj !== "object") return obj;
        if (seen.has(obj)) return seen.get(obj);

        if (obj instanceof ArrayBuffer || ArrayBuffer.isView(obj) || typeof obj === "bigint" || obj instanceof Error || obj instanceof URL) {
            throw new OmegaFrameworkException("Serialization", "UnsupportedType", `Forbidden type: ${obj.constructor.name}`);
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

        const proto = Object.getPrototypeOf(obj);
        if (proto && proto !== Object.prototype && proto !== null) {
            if (obj.constructor && obj.constructor.name === "Object") {
                const copy = Object.create(null); seen.set(obj, copy);
                for (const key of Object.keys(obj)) copy[key] = omegaDeepClone(obj[key], seen);
                return copy;
            }
        }
        
        const copy = Object.create(proto);
        seen.set(obj, copy);
        for (const key of Object.keys(obj)) {
            if (key === "__proto__" || key === "constructor") continue;
            copy[key] = omegaDeepClone(obj[key], seen);
        }
        return copy;
    }

    function deepFreeze(obj, frozen = new Set()) {
        if (obj === null || typeof obj !== "object" || frozen.has(obj)) return obj;
        frozen.add(obj);

        if (obj instanceof Map) {
            for (const [k, v] of obj.entries()) { deepFreeze(k, frozen); deepFreeze(v, frozen); }
        } else if (obj instanceof Set) {
            for (const v of obj.values()) { deepFreeze(v, frozen); }
        } else {
            for (const key of Object.getOwnPropertyNames(obj)) {
                const prop = obj[key];
                if (prop !== null && typeof prop === "object") deepFreeze(prop, frozen);
            }
        }
        return Object.freeze(obj);
    }

    class MaxHeapPriorityQueue {
        #heap = []; #limit;
        constructor(limit = 1000) { this.#limit = limit; }
        push(item) {
            if (this.#heap.length >= this.#limit) this.pop();
            this.#heap.push(omegaDeepClone(item));
            this.#upHeap(this.#heap.length - 1);
        }
        pop() {
            if (this.#heap.length === 0) return null;
            const top = this.#heap[0];
            const bottom = this.#heap.pop();
            if (this.#heap.length > 0) { this.#heap[0] = bottom; this.#downHeap(0); }
            return top;
        }
        toArray() { return this.#heap.map(v => omegaDeepClone(v)); }
        setRaw(arr) { this.#heap = Array.isArray(arr) ? arr.slice(0, this.#limit).map(v => omegaDeepClone(v)) : []; }
        #upHeap(i) {
            while (i > 0) {
                const p = Math.floor((i - 1) / 2);
                if (this.#heap[i].priority <= this.#heap[p].priority) break;
                this.#swap(i, p); i = p;
            }
        }
        #downHeap(i) {
            const len = this.#heap.length;
            while (2 * i + 1 < len) {
                let left = 2 * i + 1, right = left + 1, largest = left;
                if (right < len && this.#heap[right].priority > this.#heap[left].priority) largest = right;
                if (this.#heap[i].priority >= this.#heap[largest].priority) break;
                this.#swap(i, largest); i = largest;
            }
        }
        #swap(i, j) { const tmp = this.#heap[i]; this.#heap[i] = this.#heap[j]; this.#heap[j] = tmp; }
    }

    class RingBuffer {
        #buffer; #limit; #head = 0; #tail = 0; #count = 0;
        constructor(limit) { this.#limit = limit; this.#buffer = new Array(limit); }
        push(item) {
            this.#buffer[this.#head] = item;
            this.#head = (this.#head + 1) % this.#limit;
            if (this.#count < this.#limit) this.#count++; else this.#tail = (this.#tail + 1) % this.#limit;
        }
        toArray() {
            const arr = [];
            for (let i = 0; i < this.#count; i++) arr.push(this.#buffer[(this.#tail + i) % this.#limit]);
            return arr;
        }
        getState() { return { raw: this.toArray(), head: this.#head, tail: this.#tail, count: this.#count }; }
        setState(s) {
            this.#buffer = new Array(this.#limit);
            s.raw.slice(-this.#limit).forEach((v, i) => this.#buffer[i] = omegaDeepClone(v));
            this.#head = s.head % this.#limit; this.#tail = s.tail % this.#limit; this.#count = Math.min(s.count, this.#limit);
        }
    }

    // ========================================================================
    // III. ENGINE SUBSYSTEMS & PROFILERS
    // ========================================================================
    class MinistryMemoryEngine {
        #stores = new Map();
        allocate(mId) {
            if (this.#stores.has(mId)) return;
            this.#stores.set(mId, {
                conversations: new RingBuffer(1000), decisions: new RingBuffer(500),
                policies: new Map(), knowledgeGraph: new Map(), opinions: new Map(),
                goalStack: [], needsModel: { stabilization: 50, security: 30 },
                emotionalState: { mood: "STABLE", stress: 0.0 }
            });
        }
        getStore(mId) { return this.#stores.get(mId); }
        hasStore(mId) { return this.#stores.has(mId); }
        deallocate(mId) { this.#stores.delete(mId); }
        export() { return deepFreeze(omegaDeepClone(Object.fromEntries(this.#stores.entries()))); }
        import(data) {
            this.#stores.clear();
            for (const [mId, raw] of Object.entries(data)) {
                this.allocate(mId); const s = this.#stores.get(mId);
                s.conversations.setState(raw.conversations); s.decisions.setState(raw.decisions);
                s.policies = new Map(Object.entries(raw.policies || {}));
                s.knowledgeGraph = new Map(Object.entries(raw.knowledgeGraph || {}));
                s.opinions = new Map(Object.entries(raw.opinions || {}));
                s.emotionalState = raw.emotionalState; s.needsModel = raw.needsModel; s.goalStack = [...raw.goalStack];
            }
        }
    }

    class MinistryDecisionEngine {
        #queues = new Map(); #cooldowns = new Map();
        allocate(mId) { if (!this.#queues.has(mId)) this.#queues.set(mId, new MaxHeapPriorityQueue(1000)); }
        deallocate(mId) {
            this.#queues.delete(mId);
            for (const k of this.#cooldowns.keys()) if (k.startsWith(`${mId}:`)) this.#cooldowns.delete(k);
        }
        submit(mId, decision) { this.allocate(mId); this.#queues.get(mId).push(decision); }
        fetchNext(mId) { return this.#queues.get(mId)?.pop() ?? null; }
        setCooldown(mId, key, endTick) { this.#cooldowns.set(`${mId}:${key}`, endTick); }
        isCooling(mId, key, currentTick) { return (this.#cooldowns.get(`${mId}:${key}`) || 0) > currentTick; }
        export() { return deepFreeze(omegaDeepClone({ queues: Object.fromEntries(Array.from(this.#queues.entries()).map(([k, v]) => [k, v.toArray()])), cooldowns: Object.fromEntries(this.#cooldowns) })); }
        import(data) {
            this.#cooldowns = new Map(Object.entries(data.cooldowns || {})); this.#queues.clear();
            for (const [mId, arr] of Object.entries(data.queues || {})) {
                const q = new MaxHeapPriorityQueue(1000); q.setRaw(arr); this.#queues.set(mId, q);
            }
        }
    }

    class MinistryBlackboardEngine {
        #board = new Map(); #bridgeRef = null; #keysCache = []; #cursorIndex = 0;
        linkKernelPermissionBridge(bridge) { this.#bridgeRef = bridge; }
        
        writeAtomic(key, value, owner, currentTick, readAccess = [], ttl = -1) {
            if (typeof ttl === "number" && (isNaN(ttl) || !isFinite(ttl))) throw new Error("Invalid TTL Boundary");
            const perm = this.#bridgeRef?.getService("PermissionManager");
            if (perm && owner !== "KERNEL" && !perm.validateAccess(owner, key, "WRITE")) throw new Error("Permission Refusal");
            
            const existing = this.#board.get(key);
            if (existing && existing.owner !== owner && existing.owner !== "KERNEL") throw new Error("Owner Lock Collision");
            
            this.#board.set(key, Object.freeze({ owner, value: omegaDeepClone(value), ttl, born: currentTick, readAccess: [...readAccess] }));
            this.#keysCache = []; 
        }
        read(key, reader) {
            const r = this.#board.get(key); if (!r) return null;
            return omegaDeepClone(r.value);
        }
        scheduledCleanup(currentTick, maxScans = 100) {
            if (this.#keysCache.length === 0) this.#keysCache = Array.from(this.#board.keys());
            if (this.#keysCache.length === 0) return;
            let scanned = 0;
            while (scanned < maxScans && this.#cursorIndex < this.#keysCache.length) {
                const targetKey = this.#keysCache[this.#cursorIndex]; const record = this.#board.get(targetKey);
                if (record && record.ttl !== -1 && (currentTick - record.born) >= record.ttl) this.#board.delete(targetKey);
                this.#cursorIndex++; scanned++;
            }
            if (this.#cursorIndex >= this.#keysCache.length) { this.#cursorIndex = 0; this.#keysCache = []; }
        }
        export() { return deepFreeze(omegaDeepClone(Object.fromEntries(this.#board))); }
        import(data) { this.#board = new Map(Object.entries(data)); this.#keysCache = []; this.#cursorIndex = 0; }
    }

    class MinistryMessagingEngine {
        #bridgeRef = null; #queues = new Map();
        init(bridge) { this.#bridgeRef = bridge; }
        allocate(mId) { if (!this.#queues.has(mId)) this.#queues.set(mId, new MaxHeapPriorityQueue(1000)); }
        deallocate(mId) { this.#queues.delete(mId); }
        routeMessage(sender, receiver, topic, rawPayload) {
            this.allocate(receiver);
            const msg = {
                sender, receiver, topic, priority: rawPayload.priority === "HIGH" ? 3 : 1,
                payload_version: 1.0, data: omegaDeepClone(rawPayload.data), timestamp: performance.now()
            };
            this.#bridgeRef.emitEvent(topic, msg);
            this.#queues.get(receiver).push(msg); 
        }
        flushQueue(mId, callback) {
            const q = this.#queues.get(mId); if (!q || !callback) return;
            let count = 0; while (count++ < 50) { const m = q.pop(); if (!m) break; callback(m); }
        }
        export() { return deepFreeze(omegaDeepClone(Object.fromEntries(Array.from(this.#queues.entries()).map(([k, v]) => [k, v.toArray()])))); }
        import(data) {
            this.#queues.clear();
            for (const [mId, arr] of Object.entries(data)) {
                const q = new MaxHeapPriorityQueue(1000); q.setRaw(arr); this.#queues.set(mId, q);
            }
        }
    }

    class MinistryMetricsEngine {
        #history = new Map();
        allocate(mId) { if (!this.#history.has(mId)) this.#history.set(mId, []); }
        record(mId, duration) {
            const h = this.#history.get(mId); if (h) { h.push(duration); if (h.length > 500) h.shift(); }
        }
        export() { return deepFreeze(omegaDeepClone(Object.fromEntries(this.#history))); }
        import(data) { this.#history = new Map(Object.entries(data)); }
    }

    class MinistryAIEngine {
        #runtimeSeeds = new Map();
        spawn(mId, seed) { this.#runtimeSeeds.set(mId, seed); }
        export() { return deepFreeze(omegaDeepClone(Object.fromEntries(this.#runtimeSeeds))); }
        import(data) { this.#runtimeSeeds = new Map(Object.entries(data)); }
    }

    // ========================================================================
    // IV. RUNTIME ENGINE ORCHESTRATOR CORE
    // ========================================================================
    class MinistryRuntimeCore {
        #memory = new MinistryMemoryEngine(); #decisions = new MinistryDecisionEngine();
        #blackboard = new MinistryBlackboardEngine(); #messaging = new MinistryMessagingEngine();
        #metrics = new MinistryMetricsEngine(); #ai = new MinistryAIEngine();
        #isInitialized = false; #kernelBridge = null;

        init(bridge) {
            if (this.#isInitialized) return; 

            const requiredContract = ['emitEvent', 'log', 'reportCrash', 'reportBudgetViolation', 'getService', 'getMinistrySeed', 'getMinistryStatus'];
            for (const api of requiredContract) {
                if (typeof bridge[api] !== "function") throw new Error(`CRITICAL COMPATIBILITY DRIFT: Missing API Bridge Contract: ${api}`);
            }
            this.#kernelBridge = bridge; this.#messaging.init(bridge); this.#blackboard.linkKernelPermissionBridge(bridge);
            this.#isInitialized = true;
        }

        executePipelineFrame(mId, dt, currentTurn, callbackManifest) {
            if (!this.#isInitialized) return;
            const kState = this.#kernelBridge.getMinistryStatus(mId);
            if (LifecycleMap.get(kState) !== RuntimeLifecycle.RUN) return;

            const start = performance.now();
            if (!this.#memory.hasStore(mId)) {
                this.#memory.allocate(mId); this.#messaging.allocate(mId); this.#decisions.allocate(mId);
                this.#metrics.allocate(mId); this.#ai.spawn(mId, this.#kernelBridge.getMinistrySeed(mId));
            }
            const store = this.#memory.getStore(mId);
            try {
                this.#messaging.flushQueue(mId, (m) => callbackManifest.onMessage?.(store, m));
                callbackManifest.onMinistryTick?.(dt, currentTurn, store, this.#blackboard);
            } catch (err) {
                this.#kernelBridge.reportCrash(mId, err.message);
                throw err;
            } finally {
                const duration = performance.now() - start;
                this.#metrics.record(mId, duration);
                if (duration > 8.0) this.#kernelBridge.reportBudgetViolation(mId, duration, 8.0);
            }
        }

        serializeRuntimeSnapshot(currentVersion) {
            return {
                version: currentVersion || "13.2.0",
                memory: this.#memory.export(), decisions: this.#decisions.export(),
                blackboard: this.#blackboard.export(), messaging: this.#messaging.export(),
                metrics: this.#metrics.export(), ai: this.#ai.export()
            };
        }

        deserializeRuntimeSnapshot(snapshotObj, currentVersion) {
            if (!snapshotObj || !snapshotObj.version) throw new Error("Missing Save Version Token");
            
            const targetParts = (currentVersion || "13.2.0").split('.');
            const incomingParts = snapshotObj.version.split('.');
            
            if (targetParts[0] !== incomingParts[0] || targetParts[1] !== incomingParts[1]) {
                throw new Error(`Incompatible Build Version Detected. Dynamic Block Executed: target ${currentVersion} vs incoming ${snapshotObj.version}`);
            }

            const rollbacks = {
                memory: this.#memory.export(), decisions: this.#decisions.export(),
                blackboard: this.#blackboard.export(), messaging: this.#messaging.export(),
                metrics: this.#metrics.export(), ai: this.#ai.export()
            };
            try {
                this.#memory.import(snapshotObj.memory); this.#decisions.import(snapshotObj.lastDecisions || snapshotObj.decisions);
                this.#blackboard.import(snapshotObj.blackboard); this.#messaging.import(snapshotObj.messaging);
                this.#metrics.import(snapshotObj.metrics || {}); this.#ai.import(snapshotObj.ai || {});
            } catch (err) {
                this.#memory.import(rollbacks.memory); this.#decisions.import(rollbacks.decisions);
                this.#blackboard.import(rollbacks.blackboard); this.#messaging.import(rollbacks.messaging);
                this.#metrics.import(rollbacks.metrics); this.#ai.import(rollbacks.ai);
                throw err;
            }
        }
        triggerSchedulerCleanup(currentTick) { this.#blackboard.scheduledCleanup(currentTick); }
    }

    // ========================================================================
    // V. EXPANDED NATIVE KERNEL INTERFACES & SCHEDULER MATRIX
    // ========================================================================
    class HardenedPermissionManager {
        #acl = new Map([["MINISTRY_ALPHA", new Set(["alpha.core", "shared.blackboard"])]]);
        validateAccess(entity, key, mode) {
            if (entity === "KERNEL") return true;
            const allowedKeys = this.#acl.get(entity);
            return allowedKeys ? allowedKeys.has(key) : false;
        }
        // Dynamic registration hooks preserved for future layer scalability expansions
        registerAccessRule(entity, scope) { if(this.#acl.has(entity)) { this.#acl.get(entity).add(scope); } else { this.#acl.set(entity, new Set([scope])); } }
    }

    // 1, 2, 8. Production-Hardened Non-Blocking Event Bus Implementation
    class ProductionEventBus {
        #listeners = new Map();
           #maxListeners = 1000; // 8. Maximum Listener Bound Guard

        subscribe(topic, cb) { 
            if (!this.#listeners.has(topic)) this.#listeners.set(topic, []);
            const targets = this.#listeners.get(topic);
            if (targets.length >= this.#maxListeners) {
                console.warn(`[EventBus] Max listener limit reached for topic: ${topic}`);
                return;
            }
            targets.push(cb); 
        }

        // 1. Memory Leak Fix: Complete Unsubscribe Interface Engine
        unsubscribe(topic, cb) {
            if (!this.#listeners.has(topic)) return;
            const targets = this.#listeners.get(topic);
            const index = targets.indexOf(cb);
            if (index !== -1) targets.splice(index, 1);
        }

        // 2. Asynchronous Queue Processing Framework Matrix
        emit(topic, data) { 
            const targets = this.#listeners.get(topic);
            if (!targets) return;
            
            // Defers execution to a clean microtask context to enforce absolute non-blocking frame execution
            queueMicrotask(() => {
                for (let i = 0; i < targets.length; i++) {
                    try {
                        targets[i](data);
                    } catch (isolatedException) {
                        console.error(`[EventBus] Isolated Exception Suppressed on Subscriber Node:`, isolatedException);
                    }
                }
            });
        }
    }

    // 6. Configurable Production Level Level-Filtered Logging Hub
    class ProductionLogger {
        #logLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4 };
        #minThreshold = 1; // Maps to INFO as runtime core default baseline filter

        setLogLevel(levelToken) {
            if (this.#logLevels[levelToken] !== undefined) this.#minThreshold = this.#logLevels[levelToken];
        }

        log(level, system, msg) { 
            const targetWeight = this.#logLevels[level] !== undefined ? this.#logLevels[level] : 1;
            if (targetWeight < this.#minThreshold) return; // Silent discard filters applied natively
            console.log(`[${new Date().toISOString()}] [${level}] [${system}] => ${msg}`); 
        }
    }

    class OmegaKernelController {
        #ministryStates = new Map(); #permissionManager = new HardenedPermissionManager();
        #eventBus = new ProductionEventBus(); #logger = new ProductionLogger();
        #runtimeCore = new MinistryRuntimeCore(); #activePipelines = new Set(); 
        #recoveryQueue = new Map(); 
        #crashTracker = new Map(); // 3. Crash Retry Tracker Storage Mapping

        // 4. Duplicate Registration Interception Protection Hub
        registerMinistry(mId) { 
            if (this.#ministryStates.has(mId)) {
                this.#logger.log("WARN", "KERNEL", `Intercepted duplicate ministry registration track for: ${mId}`);
                return;
            }
            this.#ministryStates.set(mId, KernelLifecycle.REGISTERED); 
        }

        setMinistryState(mId, state) { if (KernelLifecycle[state]) this.#ministryStates.set(mId, state); }
        getMinistryState(mId) { return this.#ministryStates.get(mId) || KernelLifecycle.STOPPED; }

        // 5. Hardened Dynamic Command Dispatcher Gateway Interface
        #commandRegistry = new Map();
        registerCommand(cmd, handler) { this.#commandRegistry.set(cmd, handler); }

        createBridge() {
            const self = this;
            return {
                getState: () => Object.fromEntries(self.#ministryStates),
                // 5. Wired Placeholder to Active Runtime Dispatch Tree Array Core
                executeCommand: (cmd, payload) => { 
                    self.#logger.log("INFO", "KERNEL", `Command Routing Activated: ${cmd}`);
                    if (self.#commandRegistry.has(cmd)) {
                        try { self.#commandRegistry.get(cmd)(payload); } catch(e) { self.#logger.log("ERROR", "KERNEL", `Dispatcher Fail: ${e.message}`); }
                    }
                },
                getService: (name) => name === "PermissionManager" ? self.#permissionManager : null,
                emitEvent: (topic, payload) => self.#eventBus.emit(topic, payload),
                log: (level, sys, msg) => self.#logger.log(level, sys, msg),

                reportCrash: (mId, errorStr) => {
                    self.#logger.log("CRITICAL", `MINISTRY:${mId}`, `Crash reported: ${errorStr}`);
                    
                    // 3. Max Crash Limit Security Circuit Breaker
                    const currentCrashes = (self.#crashTracker.get(mId) || 0) + 1;
                    self.#crashTracker.set(mId, currentCrashes);

                    if (currentCrashes > MAX_RECOVERY_RETRIES) {
                        self.setMinistryState(mId, KernelLifecycle.STOPPED);
                        self.#logger.log("CRITICAL", `MINISTRY:${mId}`, `Infinite Crash Loop Shield Triggered. Core Halted.`);
                        self.#recoveryQueue.delete(mId);
                        return;
                    }

                    self.setMinistryState(mId, KernelLifecycle.FAILED);
                    self.#recoveryQueue.set(mId, { triggerTick: 0, currentPhase: "PENDING" });
                },
                reportBudgetViolation: (mId, actual, budget) => {
                    self.#logger.log("WARN", "SCHEDULER", `Budget breach on ${mId}. Allocation: ${budget}ms | Spent: ${actual}ms`);
                },
                getMinistrySeed: (mId) => {
                    let hash = 0; for (let i = 0; i < mId.length; i++) hash = (hash << 5) - hash + mId.charCodeAt(i);
                    return Math.abs(hash | 0);
                },
                getMinistryStatus: (mId) => self.getMinistryState(mId)
            };
        }

        pumpOrchestratedPipelineTick(mId, dt, currentTurn, callbackManifest) {
            if (!this.#activePipelines.has(mId)) {
                const bridge = this.createBridge();
                this.#runtimeCore.init(bridge);
                this.#activePipelines.add(mId);
                this.setMinistryState(mId, KernelLifecycle.RUNNING);
            }
            
            // 3 & 7. Pure Tick-Driven Multi-Phase Recovery State Loops (Magic number 3 replaced by RECOVERY_TICK_DELAY)
            if (this.#recoveryQueue.has(mId)) {
                const recoveryMeta = this.#recoveryQueue.get(mId);
                if (recoveryMeta.currentPhase === "PENDING") {
                    this.setMinistryState(mId, KernelLifecycle.RECOVERING);
                    recoveryMeta.triggerTick = currentTurn + RECOVERY_TICK_DELAY; 
                    recoveryMeta.currentPhase = "STABILIZING";
                    this.#logger.log("INFO", `MINISTRY:${mId}`, `Tick Orchestrator: State locked to RECOVERING.`);
                    return; 
                } else if (recoveryMeta.currentPhase === "STABILIZING" && currentTurn >= recoveryMeta.triggerTick) {
                    this.setMinistryState(mId, KernelLifecycle.READY);
                    this.setMinistryState(mId, KernelLifecycle.RUNNING);
                    this.#recoveryQueue.delete(mId); 
                    this.#logger.log("INFO", `MINISTRY:${mId}`, `Tick Orchestrator: State restored to RUNNING.`);
                } else {
                    return; 
                }
            }
            
            this.#runtimeCore.executePipelineFrame(mId, dt, currentTurn, callbackManifest);
            this.#runtimeCore.triggerSchedulerCleanup(currentTurn);
        }

        stopOrchestratedPipeline(mId) {
            this.#activePipelines.delete(mId);
            this.#recoveryQueue.delete(mId);
            this.#crashTracker.delete(mId); // Reset tracking metrics gracefully on manual override
            this.setMinistryState(mId, KernelLifecycle.STOPPED);
            this.#logger.log("INFO", "SCHEDULER", `Pipeline ${mId} halted successfully. Resources reclaimed.`);
        }
    }

    // ========================================================================
    // VI. GLOBAL NAMING SPACE ASSIGNMENTS
    // ========================================================================
    window.Omega.Kernel = new OmegaKernelController();
    window.Omega.createRuntime = () => new MinistryRuntimeCore();
})();
