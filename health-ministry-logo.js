(() => {
    'use strict';

    const LOGO_SRC = 'assets/ministers/health.svg';
    const HEALTH_ID = 'health_welfare';
    const HEALTH_TITLE = 'Health & Welfare';

    const makeLogo = () => {
        const img = document.createElement('img');
        img.src = LOGO_SRC;
        img.alt = 'Health Ministry';
        img.draggable = false;
        Object.assign(img.style, { width:'100%', height:'100%', maxWidth:'100%', maxHeight:'100%', objectFit:'cover', display:'block', borderRadius:'8px', margin:'0', padding:'0', pointerEvents:'none' });
        img.setAttribute('aria-hidden', 'true');
        return img;
    };

    const replaceElement = element => {
        if (!element) return;
        const existingImg = element.querySelector('img[src*="health.svg"]');
        if (existingImg) return;
        element.replaceChildren(makeLogo());
        element.dataset.healthLogoApplied = 'true';
    };

    let isApplying = false;
    const applyHealthMinistryLogo = () => {
        if (isApplying) return;
        isApplying = true;
        try {
            document.querySelectorAll(`.parchment-card-btn[data-ministry-id="${HEALTH_ID}"] .parchment-icon-box`).forEach(el => {
                el.style.overflow = 'hidden'; el.style.borderRadius = '8px'; replaceElement(el);
            });
            const dashboard = document.getElementById('ministry-dashboard-view');
            if (dashboard && dashboard.style.display !== 'none') {
                const title = Array.from(dashboard.querySelectorAll('h1')).find(el => el.textContent.trim() === HEALTH_TITLE);
                if (title) {
                    const header = title.parentElement?.parentElement;
                    const icon = header?.querySelector('div[style*="font-size:40px"]') || header?.querySelector('div[style*="font-size:36px"]');
                    if (icon) { icon.style.overflow='hidden'; icon.style.borderRadius='12px'; icon.style.padding='0'; icon.style.width='64px'; icon.style.height='64px'; replaceElement(icon); }
                }
            }
        } finally { isApplying = false; }
    };

    let scheduled = false;
    const debouncedApply = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; applyHealthMinistryLogo(); });
    };

    const loadIntegrityLayer = () => {
        if (window.__OMEGA_AI_INTEGRITY__ || document.querySelector('script[data-omega-ai-integrity]')) return;
        const script = document.createElement('script');
        script.src = '/omega_ai_integrity_layer.js';
        script.async = false;
        script.dataset.omegaAiIntegrity = 'true';
        script.onload = () => window.dispatchEvent(new CustomEvent('OMEGA_AI_INTEGRITY_READY'));
        script.onerror = () => console.warn('[OMEGA AI] Integrity layer could not be loaded; existing engine preserved.');
        document.head.appendChild(script);
    };

    const start = () => {
        applyHealthMinistryLogo();
        loadIntegrityLayer();
        const observer = new MutationObserver(() => debouncedApply());
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('OMEGA_READY', applyHealthMinistryLogo, { once: false });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
