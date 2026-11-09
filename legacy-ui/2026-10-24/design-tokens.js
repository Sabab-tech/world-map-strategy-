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
window.fetchResilient = async function(filename) {
    if (!filename) return null;
    const cleanName = filename.replace(/^\/+/, '');
    
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
        for (const url of uniqueCandidates) {
            try {
                const response = await fetch(url + cacheBuster);
                if (response.ok) {
                    const data = await response.json();
                    return data;
                }
            } catch (e) {
                // Silently try next path or retry attempt
            }
        }
        await new Promise(r => setTimeout(r, 150));
    }

    console.warn(`[ResilientFetch] Could not fetch "${filename}" after retries.`);
    return null;
};

