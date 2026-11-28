(function () {
    "use strict";

    const g = typeof window !== "undefined" ? window : globalThis;
    const doc = g.document;
    if (!doc) return;

    const MAX_ENTRIES = 512;
    const MAX_FRAME_SAMPLES = 120;
    const MAX_SPAN_IDS = 96;
    const MAX_SPAN_SAMPLES = 32;
    const longTasks = [];
    const longAnimationFrames = [];
    const frameIntervals = [];
    const spanStats = new Map();
    const observers = [];
    let rafId = null;
    let framesInWindow = 0;
    let fps = 0;
    let fpsWindowStart = now();
    let lastFrameTimestamp = null;
    let maxFrameGapMs = 0;
    let longTaskSupported = false;
    let longAnimationFrameSupported = false;

    function now() {
        try {
            if (g.performance && typeof g.performance.now === "function") {
                return g.performance.now();
            }
        } catch (_) {}
        return Date.now();
    }

    function finite(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function boundedPush(rows, value, limit) {
        rows.push(value);
        if (rows.length > limit) rows.splice(0, rows.length - limit);
    }

    function percentile(values, ratio) {
        if (!values.length) return null;
        const sorted = values.slice().sort((a, b) => a - b);
        return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)].toFixed(2));
    }

    function storeEntry(type, entry) {
        const startTime = finite(entry && entry.startTime, NaN);
        const duration = Math.max(0, finite(entry && entry.duration, 0));
        if (!Number.isFinite(startTime) || !(duration > 0)) return;
        const row = {
            startTime,
            endTime: startTime + duration,
            duration,
            blockingDuration: Math.max(0, finite(entry && entry.blockingDuration, 0)),
            name: String(entry && entry.name || type).slice(0, 100)
        };
        boundedPush(type === "longtask" ? longTasks : longAnimationFrames, row, MAX_ENTRIES);
        publishMetrics();
    }

    function installObserver(type) {
        const Observer = g.PerformanceObserver;
        if (typeof Observer !== "function") return false;
        try {
            const observer = new Observer(list => {
                const entries = list && typeof list.getEntries === "function" ? list.getEntries() : [];
                for (const entry of entries) storeEntry(type, entry);
            });
            observer.observe({ type, buffered: true });
            observers.push({ type, observer });
            return true;
        } catch (_) {
            return false;
        }
    }

    longTaskSupported = installObserver("longtask");
    longAnimationFrameSupported = installObserver("long-animation-frame");

    function drainObservers() {
        for (const item of observers) {
            try {
                const entries = item.observer.takeRecords ? item.observer.takeRecords() : [];
                for (const entry of entries || []) storeEntry(item.type, entry);
            } catch (_) {}
        }
    }

    function measureRange(startValue, endValue) {
        drainObservers();
        const start = finite(startValue, 0);
        const end = Math.max(start, finite(endValue, start));
        let mainThreadBlockingMs = 0;
        let longTaskCount = 0;
        let maxLongTaskMs = 0;
        let longAnimationFrameCount = 0;
        let longAnimationFrameBlockingMs = 0;
        let longAnimationFrameDurationMs = 0;

        for (const row of longTasks) {
            const overlap = Math.max(0, Math.min(end, row.endTime) - Math.max(start, row.startTime));
            if (!(overlap > 0)) continue;
            longTaskCount++;
            mainThreadBlockingMs += overlap;
            maxLongTaskMs = Math.max(maxLongTaskMs, overlap);
        }
        for (const row of longAnimationFrames) {
            const overlap = Math.max(0, Math.min(end, row.endTime) - Math.max(start, row.startTime));
            if (!(overlap > 0)) continue;
            longAnimationFrameCount++;
            longAnimationFrameDurationMs += overlap;
            const ratio = row.duration > 0 ? overlap / row.duration : 0;
            longAnimationFrameBlockingMs += row.blockingDuration * ratio;
        }

        return {
            startTime: start,
            endTime: end,
            durationMs: Number((end - start).toFixed(2)),
            mainThreadBlockingMs: longTaskSupported ? Number(mainThreadBlockingMs.toFixed(2)) : null,
            longTaskCount: longTaskSupported ? longTaskCount : null,
            maxLongTaskMs: longTaskSupported ? Number(maxLongTaskMs.toFixed(2)) : null,
            longAnimationFrameCount: longAnimationFrameSupported ? longAnimationFrameCount : null,
            longAnimationFrameDurationMs: longAnimationFrameSupported ? Number(longAnimationFrameDurationMs.toFixed(2)) : null,
            longAnimationFrameBlockingMs: longAnimationFrameSupported ? Number(longAnimationFrameBlockingMs.toFixed(2)) : null
        };
    }

    function recordSpan(idValue, startValue, endValue, metadata) {
        const id = String(idValue || "").trim().slice(0, 120);
        if (!id) return null;
        const range = measureRange(startValue, endValue);
        const sample = {
            durationMs: range.durationMs,
            mainThreadBlockingMs: range.mainThreadBlockingMs,
            longTaskCount: range.longTaskCount,
            maxLongTaskMs: range.maxLongTaskMs,
            longAnimationFrameCount: range.longAnimationFrameCount,
            longAnimationFrameBlockingMs: range.longAnimationFrameBlockingMs
        };
        let row = spanStats.get(id);
        if (!row) {
            row = { count: 0, totalMs: 0, maxMs: 0, samples: [], blockingSamples: [], last: null, metadata: null };
            spanStats.set(id, row);
        }
        row.count++;
        row.totalMs += sample.durationMs;
        row.maxMs = Math.max(row.maxMs, sample.durationMs);
        boundedPush(row.samples, sample.durationMs, MAX_SPAN_SAMPLES);
        if (Number.isFinite(sample.mainThreadBlockingMs)) {
            row.totalBlockingMs = finite(row.totalBlockingMs, 0) + sample.mainThreadBlockingMs;
            row.lastMainThreadBlockingMs = sample.mainThreadBlockingMs;
            row.maxMainThreadBlockingMs = Math.max(finite(row.maxMainThreadBlockingMs, 0), sample.mainThreadBlockingMs);
            boundedPush(row.blockingSamples, sample.mainThreadBlockingMs, MAX_SPAN_SAMPLES);
        }
        row.last = sample;
        row.metadata = metadata && typeof metadata === "object" ? {
            turn: metadata.turn ?? metadata.targetTurn ?? null,
            periodTurn: metadata.periodTurn ?? null,
            tier: metadata.tier ?? null,
            countryId: metadata.countryId ?? null,
            status: metadata.status ?? null
        } : null;
        while (spanStats.size > MAX_SPAN_IDS) spanStats.delete(spanStats.keys().next().value);
        return { id, ...sample };
    }

    function getSpanDiagnostics(prefix) {
        const filter = prefix == null ? "" : String(prefix);
        return Array.from(spanStats.entries())
            .filter(([id]) => !filter || id.startsWith(filter))
            .map(([id, row]) => ({
                id,
                sampleCount: row.count,
                rollingSampleCount: row.samples.length,
                lastDurationMs: row.last && row.last.durationMs,
                averageDurationMs: Number((row.totalMs / Math.max(1, row.count)).toFixed(2)),
                maxDurationMs: Number(row.maxMs.toFixed(2)),
                p95DurationMs: percentile(row.samples, 0.95),
                lastMainThreadBlockingMs: row.lastMainThreadBlockingMs ?? null,
                averageMainThreadBlockingMs: row.blockingSamples.length
                    ? Number((row.blockingSamples.reduce((sum, value) => sum + value, 0) / row.blockingSamples.length).toFixed(2)) : null,
                maxMainThreadBlockingMs: row.maxMainThreadBlockingMs ?? null,
                p95MainThreadBlockingMs: percentile(row.blockingSamples, 0.95),
                lastLongTaskCount: row.last && row.last.longTaskCount,
                metadata: row.metadata
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }

    function snapshot() {
        drainObservers();
        const current = now();
        const activeTasks = longTasks.filter(row => row.endTime >= current - 10000);
        const activeFrames = longAnimationFrames.filter(row => row.endTime >= current - 10000);
        const intervals = frameIntervals.slice();
        return {
            sampledAt: current,
            fps,
            frameSampleCount: intervals.length,
            frameIntervalMsP50: percentile(intervals, 0.50),
            frameIntervalMsP95: percentile(intervals, 0.95),
            maxFrameGapMs: Number(maxFrameGapMs.toFixed(2)),
            slowFrameCount32ms: intervals.filter(value => value > 32).length,
            slowFrameCount50ms: intervals.filter(value => value > 50).length,
            longTaskSupported,
            longTaskCount10s: longTaskSupported ? activeTasks.length : null,
            longTaskDurationMs10s: longTaskSupported
                ? Number(activeTasks.reduce((sum, row) => sum + row.duration, 0).toFixed(2)) : null,
            maxLongTaskMs10s: longTaskSupported
                ? Number(Math.max(0, ...activeTasks.map(row => row.duration)).toFixed(2)) : null,
            longAnimationFrameSupported,
            longAnimationFrameCount10s: longAnimationFrameSupported ? activeFrames.length : null,
            longAnimationFrameBlockingMs10s: longAnimationFrameSupported
                ? Number(activeFrames.reduce((sum, row) => sum + row.blockingDuration, 0).toFixed(2)) : null,
            domainSpanCount: spanStats.size
        };
    }

    function publishMetrics() {
        try {
            const target = g.__OMEGA_DIAG__ && g.__OMEGA_DIAG__.metrics;
            if (target && typeof target === "object") {
                Object.assign(target, snapshot());
            }
        } catch (_) {}
    }

    function scheduleMonitorFrame() {
        if (doc.hidden === true || rafId !== null || typeof g.requestAnimationFrame !== "function") return;
        rafId = g.requestAnimationFrame(monitorLoop);
    }

    function monitorLoop(timestamp) {
        rafId = null;
        if (doc.hidden === true) {
            framesInWindow = 0;
            lastFrameTimestamp = null;
            fpsWindowStart = now();
            return;
        }

        const current = finite(timestamp, now());
        framesInWindow++;
        if (lastFrameTimestamp !== null) {
            const interval = Math.max(0, current - lastFrameTimestamp);
            if (interval > 0) {
                boundedPush(frameIntervals, interval, MAX_FRAME_SAMPLES);
                if (interval > maxFrameGapMs) maxFrameGapMs = interval;
            }
        }
        lastFrameTimestamp = current;

        const elapsed = current - fpsWindowStart;
        if (elapsed >= 1000) {
            fps = Math.round(framesInWindow * 1000 / Math.max(1, elapsed));
            framesInWindow = 0;
            fpsWindowStart = current;
            const recent = frameIntervals.slice(-MAX_FRAME_SAMPLES);
            maxFrameGapMs = recent.length ? Math.max(...recent) : 0;
            publishMetrics();
        }
        scheduleMonitorFrame();
    }

    function stopMonitor() {
        if (rafId !== null && typeof g.cancelAnimationFrame === "function") {
            g.cancelAnimationFrame(rafId);
        }
        rafId = null;
        framesInWindow = 0;
        lastFrameTimestamp = null;
        fpsWindowStart = now();
    }

    if (typeof doc.addEventListener === "function") {
        doc.addEventListener("visibilitychange", function () {
            if (doc.hidden === true) {
                stopMonitor();
                return;
            }
            fpsWindowStart = now();
            lastFrameTimestamp = null;
            scheduleMonitorFrame();
        });
    }

    const api = Object.freeze({
        version: "2.0.0",
        measureRange,
        recordSpan,
        getSpanDiagnostics,
        snapshot,
        dispose() {
            stopMonitor();
            for (const item of observers) {
                try { item.observer.disconnect(); } catch (_) {}
            }
            observers.length = 0;
        }
    });
    g.OmegaBootPerformanceMonitor = api;
    publishMetrics();
    scheduleMonitorFrame();
})();