(() => {
    'use strict';

    const LOGO_SRC = 'assets/ministers/health.svg';
    const HEALTH_ID = 'health_welfare';
    const HEALTH_TITLE = 'Health & Welfare';

    const makeLogo = (size = '100%') => {
        const img = document.createElement('img');
        img.src = LOGO_SRC;
        img.alt = 'Health Ministry';
        img.draggable = false;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'cover';
        img.style.display = 'block';
        img.style.borderRadius = '8px';
        img.style.margin = '0';
        img.style.padding = '0';
        img.style.pointerEvents = 'none';
        img.setAttribute('aria-hidden', 'true');
        return img;
    };

    const replaceElement = (element, size = '100%') => {
        if (!element) return;
        // Strict guard: if already has health.svg image, do not mutate DOM!
        const existingImg = element.querySelector('img[src*="health.svg"]');
        if (existingImg) {
            existingImg.style.width = '100%';
            existingImg.style.height = '100%';
            existingImg.style.objectFit = 'cover';
            existingImg.style.borderRadius = '8px';
            return;
        }

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
                .forEach(el => {
                    el.style.overflow = 'hidden';
                    el.style.borderRadius = '8px';
                    replaceElement(el, '100%');
                });

            // Ministry dashboard header
            const dashboard = document.getElementById('ministry-dashboard-view');
            if (dashboard && dashboard.style.display !== 'none') {
                const title = Array.from(dashboard.querySelectorAll('h1')).find(
                    el => el.textContent.trim() === HEALTH_TITLE
                );
                if (title) {
                    const header = title.parentElement?.parentElement;
                    const icon = header?.querySelector('div[style*="font-size:40px"]') || header?.querySelector('div[style*="font-size:36px"]');
                    if (icon) {
                        icon.style.overflow = 'hidden';
                        icon.style.borderRadius = '12px';
                        icon.style.padding = '0';
                        icon.style.width = '64px';
                        icon.style.height = '64px';
                        replaceElement(icon, '100%');
                    }
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

