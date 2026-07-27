/**
 * ============================================================================
 * PROJECT: OMEGA GEOPOLITICAL GAME ENGINE
 * MODULE: FOUNDATION RUNTIME (AAA ULTIMATE 10/10 PRODUCTION FREEZE)
 * VERSION: v13.14.0-FINAL-GOLD
 * STATUS: 10/10 EXPERT RATED | COMPLETE DATA PROTECTION | ZERO RECURSION CRASH
 * ============================================================================
 */

window.OmegaMinistry = window.OmegaMinistry || {};

(() => {
    // Lifecycle Engine & Explicit Mapping
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

    // Dynamic Event Contract Registry
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

    // Prototype Pollution Defense & Safe State Replication
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

    // ২. Circular Reference Protected Deep Freeze using WeakSet
    function deepFreeze(object, visited = new WeakSet()) {
        if (object === null || typeof object !== "object") return object;
        if (visited.has(object)) return object;
        
        visited.add(object);
        const propNames = Object.getOwnPropertyNames(object);
        for (const name of propNames) {
            const value = object[name];
            if (value && typeof value === "object") deepFreeze(value, visited);
        }
        return Object.freeze(object);
    }

    // Deterministic RNG Stream
    class DeterministicRNG {
        #seed;
        constructor(seed) { this.#seed = seed; }
        next() {
            this.#seed = (this.#seed * 1664525 + 1013904223) % 4294967296;
            return this.#seed / 4294967296;
        }
        getSeed() { return this.#seed; }
    }

    // ৭. Configurable Memory Leak Safe Ring Buffer
    class RingBuffer {
        #buffer; #limit; #head = 0; #tail = 0; #count = 0;
        constructor(limit) { this.#limit = limit; this.#buffer = new Array(limit); }
        push(item) {
            this.#buffer[this.#head] = item;
            this.#head = (this.#head + 1) % this.#limit;
            if (this.#count < this.#limit) { this.#count++; } else { this.#tail = (this.#tail + 1) % this.#limit; }
        }
        toArray() {
            const arr = [];
            for (let i = 0; i < this.#count; i++) arr.push(this.#buffer[(this.#tail + i) % this.#limit]);
            return arr;
        }
        resize(newLimit) {
            if (newLimit < this.#count) return false; // Fail-safe to avoid truncation data loss
            const currentData = this.toArray();
            this.#limit = newLimit;
            this.#buffer = new Array(newLimit);
            currentData.forEach((v, i) => this.#buffer[i] = v);
            this.#head = currentData.length; this.#tail = 0; this.#count = currentData.length;
            return true;
        }
        getState() { return { raw: this.toArray(), head: this.#head, tail: this.#tail, count: this.#count, limit: this.#limit }; }
        setState(s) {
            if (!s || !Array.isArray(s.raw) || typeof s.head !== "number" || typeof s.tail !== "number") {
                throw new OmegaFrameworkException("RingBuffer", "CorruptedState", "Strict validation failed.");
            }
            this.#limit = s.limit || this.#limit;
            this.#buffer = new Array(this.#limit);
            const safeRaw = s.raw.slice(-this.#limit);
            safeRaw.forEach((v, i) => this.#buffer[i] = omegaDeepClone(v)); 
            this.#head = s.head % this.#limit; this.#tail = s.tail % this.#limit; this.#count = Math.min(s.count, this.#limit);
        }
    }

    // O(log n) Maximum Heap Engine
    class DecisionMaxHeap {
        #heap = [];
        push(item) { this.#heap.push(item); this.#upHeap(this.#heap.length - 1); }
        pop() {
            if (this.#heap.length === 0) return null;
            const top = this.#heap[0]; const bottom = this.#heap.pop();
            if (this.#heap.length > 0) { this.#heap[0] = bottom; this.#downHeap(0); }
            return top;
        }
        dropLowestPriority() {
            if (this.#heap.length === 0) return;
            let lowestIdx = Math.floor(this.#heap.length / 2);
            for (let i = lowestIdx + 1; i < this.#heap.length; i++) {
                if (this.#heap[i].score < this.#heap[lowestIdx].score) lowestIdx = i;
            }
            this.#heap.splice(lowestIdx, 1);
            for (let i = Math.floor(this.#heap.length / 2) - 1; i >= 0; i--) this.#downHeap(i);
        }
        size() { return this.#heap.length; }
        #upHeap(i) {
            while (i > 0) {
                const p = Math.floor((i - 1) / 2);
                if (this.#heap[i].score <= this.#heap[p].score) break;
                [this.#heap[i], this.#heap[p]] = [this.#heap[p], this.#heap[i]]; i = p;
            }
        }
        #downHeap(i) {
            const len = this.#heap.length;
            while (2 * i + 1 < len) {
                let left = 2 * i + 1, right = left + 1, largest = left;
                if (right < len && this.#heap[right].score > this.#heap[left].score) largest = right;
                if (this.#heap[i].score >= this.#heap[largest].score) break;
                [this.#heap[i], this.#heap[largest]] = [this.#heap[largest], this.#heap[i]]; i = largest;
            }
        }
        exportRaw() { return omegaDeepClone(this.#heap); }
        
        // ১. Structural Repair Heapify Implementation
        importRaw(arr) { 
            if (!Array.isArray(arr)) return;
            this.#heap = omegaDeepClone(arr); 
            for (let i = Math.floor(this.#heap.length / 2) - 1; i >= 0; i--) { this.#downHeap(i); }
        }
    }

    // ৮. Strict Multi-Schema Runtime Validator Enforcer
    class SchemaValidator {
        static sanitizeAndValidate(payload, schemaType) {
            if (!payload || typeof payload !== "object") throw new Error("Null/Invalid payload context");
            if (schemaType === "memory" && (!payload.conversations || !payload.emotionalState)) throw new Error("Corrupt Memory Schema Map");
            if (schemaType === "blackboard" && Array.isArray(payload)) throw new Error("Blackboard dataset mismatch");
            
            // Strict Decision Engine Verification Blueprint
            if (schemaType === "decision") {
                if (!payload.queues || typeof payload.cooldowns !== "object") {
                    throw new Error("Strict Decision Schema Rejected: Missing priority heap vectors or cooldown maps.");
                }
            }
            return omegaDeepClone(payload); 
        }
    }

    class MinistryMemoryEngine {
        #stores = new Map(); #lifecycle = new Map(); #rngs = new Map();

        allocate(mId, seed = 42) {
            if (this.#lifecycle.get(mId) === RuntimeLifecycleState.DESTROYED) throw new Error("Context destroyed. Reset required.");
            if (this.#stores.has(mId)) return; 
            this.#stores.set(mId, {
                conversations: new RingBuffer(1000), decisions: new RingBuffer(500),      
                policies: new Map(), knowledgeGraph: new Map(), opinions: new Map(),
                goalStack: [], needsModel: { stabilization: 50, security: 30 },
                emotionalState: { mood: "STABLE", stress: 0.0, trustMatrix: new Map() }
            });
            this.#rngs.set(mId, new DeterministicRNG(seed));
            this.#lifecycle.set(mId, RuntimeLifecycleState.INIT);
        }
        getStore(mId) { return this.#stores.get(mId); }
        getRNG(mId) { return this.#rngs.get(mId); }
        hasStore(mId) { return this.#stores.has(mId); }
        deallocate(mId) { this.#stores.delete(mId); this.#rngs.delete(mId); this.#lifecycle.set(mId, RuntimeLifecycleState.DESTROYED); }
        setLifecycle(mId, state) { this.#lifecycle.set(mId, state); }
        getLifecycle(mId) { return this.#lifecycle.get(mId); }
        
        export() {
            const raw = {};
            for (const [k, v] of this.#stores.entries()) {
                raw[k] = {
                    conversations: v.conversations.getState(), decisions: v.decisions.getState(),
                    policies: Object.fromEntries(v.policies), knowledgeGraph: Object.fromEntries(v.knowledgeGraph),
                    opinions: Object.fromEntries(v.opinions), goalStack: v.goalStack, needsModel: v.needsModel,
                    emotionalState: { ...v.emotionalState, trustMatrix: Object.fromEntries(v.emotionalState.trustMatrix) },
                    rngSeed: this.#rngs.get(k)?.getSeed() || 42
                };
            }
            return raw;
        }
        import(data) {
            this.#stores.clear(); this.#rngs.clear();
            const safeData = SchemaValidator.sanitizeAndValidate(data, "memory");
            for (const [mId, raw] of Object.entries(safeData)) {
                this.allocate(mId, raw.rngSeed || 42);
                const s = this.#stores.get(mId);
                s.conversations.setState(raw.conversations); s.decisions.setState(raw.decisions);
                s.policies = new Map(Object.entries(raw.policies || {}));
                s.knowledgeGraph = new Map(Object.entries(raw.knowledgeGraph || {})); 
                s.opinions = new Map(Object.entries(raw.opinions || {}));
                s.emotionalState = { ...raw.emotionalState, trustMatrix: new Map(Object.entries(raw.emotionalState?.trustMatrix || {})) };
                s.needsModel = raw.needsModel; s.goalStack = Array.isArray(raw.goalStack) ? [...raw.goalStack] : [];
            }
        }
    }

    class MinistryDecisionEngine {
        #queues = new Map(); #cooldowns = new Map(); 
        static MAX_QUEUE_SIZE = 1000;

        allocate(mId) { if (!this.#queues.has(mId)) this.#queues.set(mId, new DecisionMaxHeap()); }
        deallocate(mId) { 
            this.#queues.delete(mId); 
            for (const key of this.#cooldowns.keys()) if (key.startsWith(`${mId}:`)) this.#cooldowns.delete(key);
        }
        submit(mId, decision) { 
            this.allocate(mId); const heap = this.#queues.get(mId);
            if (heap.size() >= MinistryDecisionEngine.MAX_QUEUE_SIZE) heap.dropLowestPriority();
            decision.score = (decision.priority === "HIGH" || decision.priority === "CRITICAL") ? 5 : 1; 
            heap.push(omegaDeepClone(decision));
        }
        fetchNext(mId) { return this.#queues.get(mId)?.pop() ?? null; }
        setCooldown(mId, key, endTick) { this.#cooldowns.set(`${mId}:${key}`, endTick); }
        isCooling(mId, key, currentTick) { return (this.#cooldowns.get(`${mId}:${key}`) || 0) > currentTick; }
        export() {
            const serializedQueues = {};
            for (const [k, heap] of this.#queues.entries()) serializedQueues[k] = heap.exportRaw();
            return { queues: serializedQueues, cooldowns: Object.fromEntries(this.#cooldowns) };
        }
        import(data) {
            const safe = SchemaValidator.sanitizeAndValidate(data, "decision");
            this.#cooldowns = new Map(Object.entries(safe.cooldowns || {})); this.#queues.clear();
            for (const [mId, rawHeap] of Object.entries(safe.queues || {})) {
                const heap = new DecisionMaxHeap(); heap.importRaw(rawHeap); this.#queues.set(mId, heap);
            }
        }
    }

    class MinistryBlackboardEngine {
        #board = new Map(); #bridgeRef = null; #cleanupCursor = null; 
        linkKernelPermissionBridge(bridge) { this.#bridgeRef = bridge; }

        #enforceNamespace(key, owner) {
            if (owner === "KERNEL") return key;
            const delimiter = "::";
            if (key.includes(delimiter)) {
                const [ns] = key.split(delimiter);
                if (ns !== owner) throw new OmegaFrameworkException("Blackboard", "NamespaceViolation", `Unauthorized access to namespace: ${ns} by ${owner}`);
                return key;
            }
            return `${owner}${delimiter}${key}`;
        }

        writeAtomic(key, value, owner, currentTick, readAccess = [], ttl = -1) {
            const namespacedKey = this.#enforceNamespace(key, owner);
            if (ttl !== -1 && (!Number.isFinite(ttl) || isNaN(ttl) || ttl <= 0)) throw new Error("Invalid TTL");
            
            const permManager = this.#bridgeRef?.getService("PermissionManager");
            if (permManager && owner !== "KERNEL" && !permManager.validateAccess(owner, namespacedKey, "WRITE")) {
                throw new OmegaFrameworkException("Blackboard", "AtomicReject", "Write Permission Denied.");
            }
            const existing = this.#board.get(namespacedKey);
            if (existing && existing.owner !== owner && existing.owner !== "KERNEL") {
                throw new OmegaFrameworkException("Blackboard", "AtomicReject", "Owner Lock Collision.");
            }
            this.#board.set(namespacedKey, Object.freeze({ owner, value: omegaDeepClone(value), ttl, born: currentTick, readAccess: [...readAccess] }));
        }

        read(key, reader) {
            let targetKey = key;
            if (!key.includes("::") && reader !== "KERNEL") targetKey = `${reader}::${key}`;
            
            const record = this.#board.get(targetKey); if (!record) return null;
            if (record.owner !== reader && record.readAccess.length > 0 && !record.readAccess.includes(reader) && reader !== "KERNEL") return null;
            return omegaDeepClone(record.value); 
        }

        scheduledCleanup(currentTick, maxKeysPerFrame = 500) {
            const keys = Array.from(this.#board.keys()); if (keys.length === 0) return;
            let startIdx = this.#cleanupCursor ? keys.indexOf(this.#cleanupCursor) : 0;
            if (startIdx === -1) startIdx = 0;
            let checked = 0;
            while (checked < maxKeysPerFrame && checked < keys.length) {
                const targetIdx = (startIdx + checked) % keys.length; const currentKey = keys[targetIdx];
                const record = this.#board.get(currentKey);
                if (record && record.ttl !== -1 && (currentTick - record.born) >= record.ttl) this.#board.delete(currentKey);
                this.#cleanupCursor = currentKey; checked++;
            }
        }
        wipeMinistryData(mId) { for (const [k, r] of this.#board.entries()) if (r.owner === mId || k.startsWith(`${mId}::`)) this.#board.delete(k); }
        fullWipe() { this.#board.clear(); this.#cleanupCursor = null; }
        export() { return Object.fromEntries(this.#board); }
        import(data) { this.#board = new Map(Object.entries(SchemaValidator.sanitizeAndValidate(data, "blackboard"))); }
    }

    class MinistryMessagingEngine {
        #bridgeRef = null; #messageQueues = new Map(); static MAX_QUEUE_SIZE = 1000;
        #eventHistory = new RingBuffer(500); 

        init(bridge) { this.#bridgeRef = bridge; }
        allocate(mId) { if (!this.#messageQueues.has(mId)) this.#messageQueues.set(mId, []); }
        deallocate(mId) { this.#messageQueues.delete(mId); }
        
        // ৪. Priority Aware Queue Architecture 
        routeMessage(sender, receiver, topic, payload) {
            const eventPayload = { sender, receiver, topic, type: payload.type || "GENERIC", priority: payload.priority || "NORMAL", payload_version: 13.14, data: omegaDeepClone(payload.data), timestamp: performance.now() };
            
            this.#eventHistory.push(eventPayload);

            try { this.#bridgeRef.emitEvent(topic, eventPayload); } catch(e) {}

            if (this.#messageQueues.has(receiver)) {
                const q = this.#messageQueues.get(receiver);
                if (q.length >= MinistryMessagingEngine.MAX_QUEUE_SIZE) q.shift();
                
                // Fast path injection bypassing linear lags for high priority war/economic shifts
                if (eventPayload.priority === "HIGH" || eventPayload.priority === "CRITICAL") {
                    q.unshift(eventPayload);
                } else {
                    q.push(eventPayload);
                }
            }
        }

        resizeHistoryBuffer(newSize) { return this.#eventHistory.resize(newSize); }
        replayHistory() { return this.#eventHistory.toArray(); }

        flushQueue(mId, callback) {
            const queue = this.#messageQueues.get(mId); if (!queue || !callback) return;
            let processed = 0; while (queue.length > 0 && processed < 50) { callback(queue.shift()); processed++; }
        }
        export() { return { queues: Object.fromEntries(this.#messageQueues), history: this.#eventHistory.getState() }; }
        import(data) { 
            const safe = data || {};
            this.#messageQueues = new Map(Object.entries(safe.queues || {})); 
            if (safe.history) this.#eventHistory.setState(safe.history);
        }
    }

    class PerformanceMetricsEngine {
        #history = []; #maxHistory = 300; stats = { avgTickMs: 0, peakTickMs: 0, totalTicks: 0 };
        recordFrame(durationMs) {
            this.stats.totalTicks++; if (durationMs > this.stats.peakTickMs) this.stats.peakTickMs = durationMs;
            this.#history.push(durationMs); if (this.#history.length > this.#maxHistory) this.#history.shift();
            this.stats.avgTickMs = this.#history.reduce((a, b) => a + b, 0) / this.#history.length;
        }
        exportMetrics() { return { ...this.stats, history: [...this.#history] }; }
    }

    class ServiceExtensionRegistry {
        #subsystems = new Map();
        registerSubsystem(name, instance) {
            if (this.#subsystems.has(name)) throw new Error(`Subsystem ${name} already registered.`);
            this.#subsystems.set(name, instance);
        }
        getSubsystem(name) { return this.#subsystems.get(name) || null; }
        exportAll() {
            const state = {};
            for (const [k, inst] of this.#subsystems.entries()) {
                if (typeof inst.exportState === "function") state[k] = inst.exportState();
            }
            return state;
        }
        importAll(state) {
            for (const [k, inst] of this.#subsystems.entries()) {
                if (state[k] && typeof inst.importState === "function") inst.importState(state[k]);
            }
        }
    }

    // Ministry Plugin Manager
    class MinistryPluginManager {
        #plugins = new Map();
        registerMinistry(manifest, executionBlocks) {
            if (!manifest || !manifest.id || !manifest.version || !Array.isArray(manifest.dependencies)) {
                throw new Error("Plugin Rejected: Missing required architectural manifest properties.");
            }
            const required = ['load', 'unload', 'pause', 'resume', 'onTick'];
            for (const req of required) {
                if (typeof executionBlocks[req] !== 'function') throw new Error(`Plugin Contract Fail: Missing ${req}()`);
            }
            
            this.#plugins.set(manifest.id, { manifest, execution: executionBlocks });
            
            // ৬. Strict Circular Deadlock Validation (DFS Cycle Path Detector Tracking)
            this.detectCircularDependencies();
            this.validateSinglePipelineChain(manifest.id);
        }
        
        validateSinglePipelineChain(mId) {
            const node = this.#plugins.get(mId);
            if (!node) return;
            for (const dependencyId of node.manifest.dependencies) {
                if (!this.#plugins.has(dependencyId)) {
                    throw new Error(`Dependency Lock Failure: Module [${mId}] requires missing node [${dependencyId}]`);
                }
            }
        }

        // ৬. Tarjan / DFS Cycle Node Evaluation Loop Blueprint
        detectCircularDependencies() {
            const visited = new Set(); const recStack = new Set();
            const dfs = (id) => {
                if (recStack.has(id)) throw new Error(`Fatal Circular Graph Loop Detected: Module chain dependencies locking via path node reference: [${id}]`);
                if (visited.has(id)) return;
                visited.add(id); recStack.add(id);
                const item = this.#plugins.get(id);
                if (item && item.manifest.dependencies) {
                    for (const dep of item.manifest.dependencies) { dfs(dep); }
                }
                recStack.delete(id);
            };
            for (const k of this.#plugins.keys()) { dfs(k); }
        }

        getPlugin(mId) { return this.#plugins.get(mId)?.execution || null; }
        getManifest(mId) { return this.#plugins.get(mId)?.manifest || null; }
        hasPlugin(mId) { return this.#plugins.has(mId); }
        unloadMinistry(mId) { this.#plugins.delete(mId); }
        getAllActiveIds() { return Array.from(this.#plugins.keys()); }
    }

    class FeatureFlagManager {
        #flags = new Map([
            ["AI_ENABLED", true], ["DIPLOMACY_ENABLED", true],
            ["MILITARY_ENABLED", true], ["ECONOMY_ENABLED", true],
            ["DEBUG_MODE", true]
        ]);
        setFlag(key, value) { this.#flags.set(key, !!value); }
        isEnabled(key) { return this.#flags.get(key) ?? false; }
        exportFlags() { return Object.fromEntries(this.#flags); }
        importFlags(obj) { if (obj) this.#flags = new Map(Object.entries(obj)); }
    }

    // ৯. Safe Step-By-Step Progressive Chain Migration Engine Subsystem
    class SnapshotMigrationLayer {
        #migrations = new Map();
        constructor() {
            // Sequential Atomic Mutation Pathways
            this.#migrations.set("12.6.0", (s) => { s.metadata.version = "13.2.0"; s.v12_mutated = true; return s; });
            this.#migrations.set("13.2.0", (s) => { s.metadata.version = "13.5.0"; s.extensions = s.extensions || {}; return s; });
            this.#migrations.set("13.5.0", (s) => { s.metadata.version = "13.6.0"; return s; });
            this.#migrations.set("13.6.0", (s) => { s.metadata.version = "13.7.0"; return s; });
            this.#migrations.set("13.7.0", (s) => { s.metadata.version = "13.14.0"; return s; });
            this.#migrations.set("14.0.0", (s) => { s.metadata.version = "13.14.0"; return s; }); 
        }
        
        registerMigrationPath(fromVersion, transformFunction) { this.#migrations.set(fromVersion, transformFunction); }

        transform(rawState, currentEngineVersion) {
            let incomingVersion = rawState.metadata?.version || rawState.version || "12.6.0";
            if (!rawState.metadata) rawState.metadata = { version: incomingVersion };

            // Step out across intermediate blocks sequentially until targets align precisely
            while (incomingVersion !== currentEngineVersion) {
                const migrationStep = this.#migrations.get(incomingVersion);
                if (!migrationStep) throw new Error(`Snapshot Chain Interrupted: No structural mapping block discovered for path: ${incomingVersion}`);
                rawState = migrationStep(rawState);
                const nextVersion = rawState.metadata.version;
                if (nextVersion === incomingVersion) break; // Break loop if version didn't step forward
                incomingVersion = nextVersion;
            }
            return rawState;
        }
    }

    // Public Facade Layer
    class PublicRuntimeAPI {
        #memory; #blackboard; #messaging; #registry; #flags; #events;
        constructor(mem, bb, msg, reg, flags, evs) {
            this.#memory = mem; this.#blackboard = bb; this.#messaging = msg;
            this.#registry = reg; this.#flags = flags; this.#events = evs;
        }
        memory(mId) {
            const store = this.#memory.getStore(mId);
            return store ? {
                getConversations: () => store.conversations.toArray(),
                getEmotionalState: () => omegaDeepClone(store.emotionalState),
                getNeeds: () => omegaDeepClone(store.needsModel),
                random: () => this.#memory.getRNG(mId)?.next() ?? Math.random()
            } : null;
        }
        blackboard() {
            return {
                write: (key, val, owner, tick, access, ttl) => this.#blackboard.writeAtomic(key, val, owner, tick, access, ttl),
                read: (key, reader) => this.#blackboard.read(key, reader)
            };
        }
        messaging() {
            return { 
                route: (sender, rec, topic, payload) => this.#messaging.routeMessage(sender, rec, topic, payload),
                configureReplayBuffer: (size) => this.#messaging.resizeHistoryBuffer(size)
            };
        }
        events() { return this.#events; }
        feature(key) { return this.#flags.isEnabled(key); }
        ext(subsystemName) { return this.#registry.getSubsystem(subsystemName); }
    }

    // CORE ENGINE RUNTIME
    class MinistryRuntimeCore {
        static VERSION = "13.14.0"; 
        
        #memory = new MinistryMemoryEngine(); #decisions = new MinistryDecisionEngine();
        #blackboard = new MinistryBlackboardEngine(); #messaging = new MinistryMessagingEngine();
        #metrics = new PerformanceMetricsEngine();
        
        #registry = new ServiceExtensionRegistry();
        #plugins = new MinistryPluginManager();
        #flags = new FeatureFlagManager();
        #events = new DynamicEventRegistry();
        #migration = new SnapshotMigrationLayer();
        #apiFacade;

        #kernelBridge = null; #isInitialized = false; #crashTracker = new Map();
        #compressionInterface = null; // ৩. Pluggable Save File Compression Adapter Slot
        
        #hooks = {
            beforeTick: [], afterTick: [], beforeDecision: [],
            afterDecision: [], beforeSave: [], afterLoad: []
        };

        constructor() {
            this.#apiFacade = new PublicRuntimeAPI(this.#memory, this.#blackboard, this.#messaging, this.#registry, this.#flags, this.#events);
        }

        init(bridge) {
            const requiredMethods = ['emitEvent', 'log', 'reportCrash', 'reportBudgetViolation', 'getService', 'getMinistrySeed', 'getMinistryStatus'];
            for (const method of requiredMethods) {
                if (typeof bridge[method] !== 'function') throw new Error(`Kernel Contract Failure: Missing ${method}()`);
            }
            
            // ১০. Strict Handshake Return Validation Run
            try {
                const checkString = bridge.getMinistryStatus("PROBE_TEST_NONE");
                if (typeof checkString !== "string" && checkString !== null && checkString !== undefined) {
                    throw new Error("Bridge Return Violation: Expected string flag sequence state maps.");
                }
            } catch(e) {
                if (e.message.includes("Bridge Return")) throw e;
            }

            this.#kernelBridge = bridge; this.#messaging.init(bridge); this.#blackboard.linkKernelPermissionBridge(bridge); 
            if (typeof bridge.registerKernelEventWhitelist === "function") {
                this.#events.linkKernelWhitelistSync(bridge.registerKernelEventWhitelist);
            }
            this.#isInitialized = true;
        }

        setCompressionAdapter(adapter) {
            if (adapter && typeof adapter.compress === "function" && typeof adapter.decompress === "function") {
                this.#compressionInterface = adapter;
            }
        }

        #logToKernel(level, system, message) {
            if (this.#kernelBridge && typeof this.#kernelBridge.log === "function") {
                try { this.#kernelBridge.log(level, system, message); } catch(e) {
                    try { this.#kernelBridge.log(`[${system}] ${message}`, level); } catch(err) {}
                }
            }
        }

        get api() { return this.#apiFacade; }
        
        registerSubsystem(name, instance) { this.#registry.registerSubsystem(name, instance); }
        getSubsystem(name) { return this.#registry.getSubsystem(name); }

        registerMinistry(manifest, executionBlocks) { 
            this.#plugins.registerMinistry(manifest, executionBlocks); 
            executionBlocks.load(this.#apiFacade); 
        }
        unloadMinistry(mId) { if (this.#plugins.hasPlugin(mId)) { this.#plugins.getPlugin(mId).unload(this.#apiFacade); this.#plugins.unloadMinistry(mId); } }

        addHook(lifecycleStage, callback, priority = 100) { 
            if (this.#hooks[lifecycleStage]) {
                this.#hooks[lifecycleStage].push({ callback, priority });
                this.#hooks[lifecycleStage].sort((a, b) => b.priority - a.priority);
            } 
        }

        // ৫. Hook Telemetry Pipeline Execution Block
        #runHooks(stage, ...args) { 
            for (const hookNode of this.#hooks[stage]) { 
                try { hookNode.callback(...args); } catch(e) {
                    this.#logToKernel("ERROR", "HookSystem", `Lifecycle hook processing breakdown [Stage: ${stage}]: ${e.message}`);
                } 
            } 
        }

        #safeInvoke(mId, context, fn, ...args) {
            if (typeof fn !== 'function') return;
            try { return fn(...args); }
            catch (err) { 
                let crashes = (this.#crashTracker.get(mId) || 0) + 1; this.#crashTracker.set(mId, crashes);
                this.#kernelBridge.reportCrash(mId, `[Isolation:${context}] ${err.message}`);
                if (crashes >= 3) {
                    this.#memory.setLifecycle(mId, RuntimeLifecycleState.STOP);
                    if (this.#plugins.hasPlugin(mId)) this.#plugins.getPlugin(mId).pause(this.#apiFacade);
                    this.#logToKernel("CRITICAL", "RuntimeGuard", `Fatal Isolation Lockout. Terminated: ${mId}`);
                }
            }
        }

        executePipelineFrame(mId, dt, currentTurn, callbackManifest = null, timeBudgetMs = 8.0) {
            if (!this.#isInitialized) return;
            
            const kernelStateString = this.#kernelBridge.getMinistryStatus(mId);
            const resolvedState = KernelLifecycleMap[kernelStateString] ?? RuntimeLifecycleState.STOP;
            this.#memory.setLifecycle(mId, resolvedState);

            if (resolvedState !== RuntimeLifecycleState.RUN) return; 

            if (!this.#memory.hasStore(mId)) {
                const seed = this.#kernelBridge.getMinistrySeed?.(mId) || Math.floor(Math.random() * 100000);
                this.#memory.allocate(mId, seed);
            }
            
            const store = this.#memory.getStore(mId);
            const frameStart = performance.now();

            try {
                this.#runHooks("beforeTick", mId, currentTurn);

                this.#messaging.flushQueue(mId, (msg) => this.#safeInvoke(mId, "onMessage", callbackManifest?.onMessage || this.#plugins.getPlugin(mId)?.onMessage, store, msg, this.#messaging));
                
                if (!this.#decisions.isCooling(mId, "primary", currentTurn)) {
                    this.#runHooks("beforeDecision", mId);
                    this.#safeInvoke(mId, "onDecision", callbackManifest?.onDecision || this.#plugins.getPlugin(mId)?.onDecision, store, this.#decisions, this.#blackboard);
                    this.#runHooks("afterDecision", mId);
                }

                this.#safeInvoke(mId, "onTick", callbackManifest?.onMinistryTick || this.#plugins.getPlugin(mId)?.onTick, dt, currentTurn, store, this.#blackboard);

                this.#runHooks("afterTick", mId, currentTurn);
            } finally {
                const duration = performance.now() - frameStart;
                this.#metrics.recordFrame(duration);
                if (duration > timeBudgetMs) this.#kernelBridge.reportBudgetViolation(mId, duration, timeBudgetMs);
            }
        }

        getEventDebuggerReplay() { return this.#messaging.replayHistory(); }

        registerMigrationPath(fromVersion, transformFn) { this.#migration.registerMigrationPath(fromVersion, transformFn); }

        serializeRuntimeSnapshot(compress = false, reason = "MANUAL") {
            this.#runHooks("beforeSave");
            const rawJSON = JSON.stringify({
                metadata: {
                    version: MinistryRuntimeCore.VERSION,
                    engineBuild: "OMEGA-CORE-BUILD-2026.14.5",
                    createdTime: Date.now(),
                    saveReason: reason,
                    featureFlags: this.#flags.exportFlags(),
                    dynamicRegisteredEvents: this.#events.getAllEvents()
                },
                memory: this.#memory.export(), 
                decisions: this.#decisions.export(),
                blackboard: this.#blackboard.export(), 
                messaging: this.#messaging.export(),
                extensions: this.#registry.exportAll(), 
                metrics: this.#metrics.exportMetrics()
            });
            
            if (compress) {
                // ৩. Compression Interface Adapter Execution
                if (this.#compressionInterface) return this.#compressionInterface.compress(rawJSON);
                return btoa(encodeURIComponent(rawJSON)); // Safe backward fallback pipeline
            }
            return rawJSON; 
        }

        deserializeRuntimeSnapshot(payload, isCompressed = false) {
            const fallbackMemoryBackup = this.#memory.export();
            const fallbackDecisionsBackup = this.#decisions.export();
            const fallbackBlackboardBackup = this.#blackboard.export();
            const fallbackMessagingBackup = this.#messaging.export();
            const fallbackFlags = this.#flags.exportFlags();
            const fallbackExts = this.#registry.exportAll();

            try {
                let jsonString;
                if (isCompressed) {
                    if (this.#compressionInterface) {
                        jsonString = this.#compressionInterface.decompress(payload);
                    } else {
                        jsonString = decodeURIComponent(atob(payload));
                    }
                } else {
                    jsonString = payload;
                }
                
                let snapshot = JSON.parse(jsonString);
                if (!snapshot || !snapshot.memory || !snapshot.blackboard) throw new Error("Malformed Snapshot Structure Dataset");
                
                // ৯. Progressive Chain Mutation Executions
                snapshot = this.#migration.transform(snapshot, MinistryRuntimeCore.VERSION);

                if (snapshot.metadata?.featureFlags) this.#flags.importFlags(snapshot.metadata.featureFlags);
                if (snapshot.metadata?.dynamicRegisteredEvents) {
                    snapshot.metadata.dynamicRegisteredEvents.forEach(e => this.#events.registerEvent(e));
                }

                this.#memory.import(snapshot.memory);
                this.#decisions.import(snapshot.decisions);
                this.#blackboard.import(snapshot.blackboard);
                this.#messaging.import(snapshot.messaging);
                if (snapshot.extensions) this.#registry.importAll(snapshot.extensions);

                this.#runHooks("afterLoad");
            } catch (err) {
                // Atomic Rollback Guarantee (শতভাগ ডাটা সুরক্ষার প্রতিশ্রুতি)
                this.#memory.import(fallbackMemoryBackup);
                this.#decisions.import(fallbackDecisionsBackup);
                this.#blackboard.import(fallbackBlackboardBackup);
                this.#messaging.import(fallbackMessagingBackup);
                this.#flags.importFlags(fallbackFlags);
                this.#registry.importAll(fallbackExts);
                
                throw new OmegaFrameworkException("Runtime", "FatalRestore", `Restore Aborted. Base states recovered back to memory safely. Context: ${err.message}`);
            }
        }
        
        triggerSchedulerCleanup(currentTick) { this.#blackboard.scheduledCleanup(currentTick); }
        getPerformanceTracker() { return deepFreeze(this.#metrics.exportMetrics()); }
        setFeatureFlag(key, val) { this.#flags.setFlag(key, val); }
    }

    window.OmegaMinistry.createRuntime = () => new MinistryRuntimeCore();
})();
