(() => {
    'use strict';

    const LOGO_SRC = (() => { try { return new URL('assets/ministers/health.svg', document.baseURI).href; } catch (_) { return 'assets/ministers/health.svg'; } })();
    const HEALTH_ID = 'health_welfare';
    const HEALTH_TITLE = 'Health & Welfare';

    const makeLogo = () => {
        const img = document.createElement('img');
        img.src = LOGO_SRC;
        img.alt = 'Health Ministry';
        img.draggable = false;
        img.decoding = 'async';
        img.loading = 'eager';
        Object.assign(img.style, {
            width:'100%', height:'100%', maxWidth:'100%', maxHeight:'100%',
            objectFit:'contain', objectPosition:'center', display:'block',
            borderRadius:'0', margin:'0', padding:'0', pointerEvents:'none',
            flex:'0 0 auto'
        });
        img.setAttribute('aria-hidden', 'true');
        return img;
    };

    const fitBox = element => {
        if (!element) return;
        Object.assign(element.style, {
            overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center',
            padding:'0', margin:'0', boxSizing:'border-box', flexShrink:'0'
        });
        element.replaceChildren(makeLogo());
        element.dataset.healthLogoApplied = 'true';
    };

    let scheduled = false;
    let applying = false;
    const applyHealthMinistryLogo = () => {
        if (applying) return;
        applying = true;
        try {
            document.querySelectorAll(`.parchment-card-btn[data-ministry-id="${HEALTH_ID}"] .parchment-icon-box`).forEach(el => {
                el.style.width = '44px';
                el.style.height = '44px';
                el.style.borderRadius = '8px';
                fitBox(el);
            });

            const dashboard = document.getElementById('ministry-dashboard-view');
            if (dashboard && dashboard.style.display !== 'none') {
                const title = Array.from(dashboard.querySelectorAll('h1')).find(el => el.textContent.trim() === HEALTH_TITLE);
                if (title) {
                    const header = title.parentElement?.parentElement;
                    const icon = header?.querySelector('div[style*="font-size:40px"]') || header?.querySelector('div[style*="font-size:36px"]');
                    if (icon) {
                        icon.style.width = '64px';
                        icon.style.height = '64px';
                        icon.style.borderRadius = '12px';
                        fitBox(icon);
                    }
                }
            }
        } finally { applying = false; }
    };

    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        const run = () => { scheduled = false; applyHealthMinistryLogo(); };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
    };

    const loadIntegrityLayer = () => {
        if (window.__OMEGA_AI_INTEGRITY__ || document.querySelector('script[data-omega-ai-integrity]')) return;
        const script = document.createElement('script');
        script.src = (() => { try { return new URL('omega_ai_integrity_layer.js', document.baseURI).href; } catch (_) { return 'omega_ai_integrity_layer.js'; } })();
        script.async = false;
        script.dataset.omegaAiIntegrity = 'true';
        script.onload = () => window.dispatchEvent(new CustomEvent('OMEGA_AI_INTEGRITY_READY'));
        script.onerror = () => console.warn('[OMEGA AI] Integrity layer could not be loaded; existing engine preserved.');
        document.head.appendChild(script);
    };

    const start = () => {
        applyHealthMinistryLogo();
        loadIntegrityLayer();

        const observeRoots = [
            document.getElementById('cabinet-body'),
            document.getElementById('ministry-dashboard-view')
        ].filter(Boolean);

        if (typeof MutationObserver === 'function' && observeRoots.length) {
            const observer = new MutationObserver(() => schedule());
            observeRoots.forEach(root => observer.observe(root, { childList: true, subtree: true }));
        }

        window.addEventListener('OMEGA_READY', schedule, { passive: true });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
