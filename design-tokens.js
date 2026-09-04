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

window.fetchResilient = async function(filename) {
    if (!filename) return null;
    const cleanName = filename.replace(/^\/+/, '');
    const base = (() => { try { return new URL(cleanName, document.baseURI).href; } catch (_) { return cleanName; } })();
    const candidates = Array.from(new Set([
        base,
        cleanName,
        './' + cleanName,
        '/' + cleanName
    ]));

    for (let attempt = 0; attempt < 3; attempt++) {
        for (const url of candidates) {
            try {
                const response = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' });
                if (response.ok) return await response.json();
            } catch (_) {}
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 150));
    }

    console.warn(`[ResilientFetch] Could not fetch "${filename}" after retries.`);
    return null;
};

/* Static-host helper loader. index.html remains untouched. */
(() => {
    const load = () => {
        if (document.querySelector('script[data-omega-client-bootstrap]')) return;
        let src;
        try { src = new URL('omega_client_bootstrap.js', document.baseURI).href; }
        catch (_) { src = 'omega_client_bootstrap.js'; }
        const s = document.createElement('script');
        s.src = src;
        s.defer = true;
        s.dataset.omegaClientBootstrap = 'true';
        s.onerror = () => console.warn('[OMEGA BOOT] Client asset bootstrap could not be loaded:', src);
        document.head.appendChild(s);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
    else load();
})();
