(() => {
    'use strict';

    const LOGO_SRC = 'assets/ministers/health.svg';
    const HEALTH_ID = 'health_welfare';
    const HEALTH_TITLE = 'Health & Welfare';

    const makeLogo = (size = '68px') => {
        const img = document.createElement('img');
        img.src = LOGO_SRC;
        img.alt = 'Health Ministry';
        img.draggable = false;
        img.style.width = size;
        img.style.height = size;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.style.display = 'block';
        img.style.margin = 'auto';
        img.style.pointerEvents = 'none';
        img.setAttribute('aria-hidden', 'true');
        return img;
    };

    const replaceElement = (element, size) => {
        if (!element) return;
        // Strict guard: if already has health.svg image, do not mutate DOM!
        const existingImg = element.querySelector('img[src*="health.svg"]');
        if (existingImg) return;

        element.replaceChildren(makeLogo(size));
        element.dataset.healthLogoApplied = 'true';
    };

    let isApplying = false;
    const applyHealthMinistryLogo = () => {
        if (isApplying) return;
        isApplying = true;

        try {
            // Cabinet card: the ministry's primary logo slot.
            document
                .querySelectorAll(`.parchment-card-btn[data-ministry-id="${HEALTH_ID}"] .parchment-icon-box`)
                .forEach(el => replaceElement(el, '68px'));

            // Ministry dashboard header
            const dashboard = document.getElementById('ministry-dashboard-view');
            if (dashboard && dashboard.style.display !== 'none') {
                const title = Array.from(dashboard.querySelectorAll('h1')).find(
                    el => el.textContent.trim() === HEALTH_TITLE
                );
                if (title) {
                    const header = title.parentElement?.parentElement;
                    const icon = header?.querySelector('div[style*="font-size:40px"]');
                    if (icon) replaceElement(icon, '54px');
                }
            }
        } finally {
            isApplying = false;
        }
    };

    let scheduled = false;
    const debouncedApply = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            applyHealthMinistryLogo();
        });
    };

    const start = () => {
        applyHealthMinistryLogo();
        const observer = new MutationObserver(() => debouncedApply());
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('OMEGA_READY', applyHealthMinistryLogo, { once: false });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();

