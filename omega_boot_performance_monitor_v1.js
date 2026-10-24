(function () {
    let frames = 0;
    let lastTime = performance.now();
    let rafId = null;

    function scheduleMonitorFrame() {
        if (document.hidden || rafId !== null || typeof window.requestAnimationFrame !== "function") return;
        rafId = window.requestAnimationFrame(monitorLoop);
    }

    function monitorLoop() {
        rafId = null;
        if (document.hidden) {
            frames = 0;
            lastTime = performance.now();
            return;
        }

        frames++;
        const now = performance.now();
        if (now >= lastTime + 1000) {
            if (window.__OMEGA_DIAG__ && window.__OMEGA_DIAG__.metrics) {
                window.__OMEGA_DIAG__.metrics.fps = frames;
            }
            frames = 0;
            lastTime = now;
        }
        scheduleMonitorFrame();
    }

    function stopMonitor() {
        if (rafId !== null && typeof window.cancelAnimationFrame === "function") {
            window.cancelAnimationFrame(rafId);
        }
        rafId = null;
        frames = 0;
        lastTime = performance.now();
    }

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            stopMonitor();
            return;
        }
        lastTime = performance.now();
        scheduleMonitorFrame();
    });

    scheduleMonitorFrame();
})();