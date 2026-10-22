(function() {
            let frames = 0, lastTime = performance.now();
            function monitorLoop() {
                frames++; const now = performance.now();
                if (now >= lastTime + 1000) {
                    window.__OMEGA_DIAG__.metrics.fps = frames;
                    frames = 0; lastTime = now;
                }
                requestAnimationFrame(monitorLoop);
            }
            monitorLoop();
        })();
