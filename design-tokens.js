/**
 * ============================================================================
 * AAA GEOPOLITICAL STRATEGY GAME - DESIGN TOKEN SYSTEM v10.0
 * ============================================================================
 */
window.OmegaDesign = {
    colors: {
        background: "#07111F",
        panel: "#101B30",
        gold: "#C9A227",
        cyan: "#00A8C6",
        success: "#2ECC71",
        warning: "#F1C40F",
        danger: "#E74C3C"
    },
    spacing: {
        tiny: "4px",
        small: "8px",
        medium: "16px",
        large: "24px",
        huge: "40px"
    },
    radius: {
        small: "4px",
        medium: "8px",
        large: "14px"
    },
    animation: {
        fast: "150ms",
        normal: "300ms",
        slow: "600ms"
    },
    layout: {
        headerHeight: 70,
        navigationHeight: 60,
        maxWidth: "1400px"
    }
};

console.log("[OMEGA DESIGN TOKENS] System loaded successfully.");

/**
 * Global Resilient Fetch Utility for JSON resources with multiple path attempts and retries
 */
window.fetchResilient = async function(filename, options) {
    options = options && typeof options === 'object' ? options : {};
    if (!filename) return null;
    const cleanName = filename.replace(/^\/+/, '');
    const signal = options.signal || null;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const candidates = [
        cleanName,
        './' + cleanName,
        '/' + cleanName
    ];

    if (window.location && window.location.pathname) {
        const dir = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        if (dir) candidates.push(dir + cleanName);
    }
    if (window.location && window.location.origin && window.location.origin !== 'null') {
        candidates.push(window.location.origin + '/' + cleanName);
    }

    const uniqueCandidates = Array.from(new Set(candidates));
    const cacheBuster = '?v=' + Date.now();

    for (let attempt = 0; attempt < 3; attempt++) {
        if (signal && signal.aborted) {
            const aborted = new Error('FETCH_ABORTED:' + cleanName);
            aborted.name = 'AbortError';
            throw aborted;
        }
        for (const url of uniqueCandidates) {
            try {
                const response = await fetch(url + cacheBuster, signal ? { signal:signal } : undefined);
                if (!response.ok) continue;
                if (!onProgress || !response.body || typeof response.body.getReader !== 'function' ||
                    typeof TextDecoder === 'undefined') {
                    const data = await response.json();
                    if (onProgress) onProgress(1, 1, 1);
                    return data;
                }

                const total = Number(response.headers && response.headers.get('content-length')) || 0;
                const reader = response.body.getReader();
                const chunks = [];
                let received = 0;
                let completed = false;
                try {
                    onProgress(total > 0 ? 0 : null, 0, total);
                    while (!completed) {
                        if (signal && signal.aborted) {
                            try { await reader.cancel(); } catch (_) {}
                            const aborted = new Error('FETCH_ABORTED:' + cleanName);
                            aborted.name = 'AbortError';
                            throw aborted;
                        }
                        const part = await reader.read();
                        completed = part.done === true;
                        if (completed) break;
                        if (part.value) {
                            chunks.push(part.value);
                            received += part.value.byteLength;
                            onProgress(total > 0 ? Math.min(1, received / total) : null, received, total);
                        }
                    }
                } catch (readError) {
                    try { await reader.cancel(); } catch (_) {}
                    throw readError;
                }

                const bytes = new Uint8Array(received);
                let offset = 0;
                chunks.forEach(function (chunk) {
                    bytes.set(chunk, offset);
                    offset += chunk.byteLength;
                });
                const text = new TextDecoder('utf-8').decode(bytes);
                const data = JSON.parse(text);
                onProgress(1, received, total || received);
                return data;
            } catch (e) {
                if ((signal && signal.aborted) || (e && e.name === 'AbortError')) throw e;
                // Silently try next path or retry attempt.
            }
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 150));
    }

    console.warn('[ResilientFetch] Could not fetch "' + filename + '" after retries.');
    return null;
};
