(() => {
    'use strict';

    const LOGO_SRC = 'assets/ministers/image_ce791007%20(2).svg';
    const HEALTH_ID = 'health_welfare';
    const HEALTH_TITLE = 'Health & Welfare';

    const makeLogo = (size = '56px') => {
        const img = document.createElement('img');
        img.src = LOGO_SRC;
        img.alt = 'Health Ministry';
        img.draggable = false;
        img.style.width = size;
        img.style.height = size;
        img.style.objectFit = 'contain';
        img.style.display = 'block';
        img.style.margin = 'auto';
        img.style.pointerEvents = 'none';
        img.setAttribute('aria-hidden', 'true');
        return img;
    };

    const replaceElement = (element, size) => {
        if (!element || element.dataset.healthLogoApplied === 'true') return;
        element.replaceChildren(makeLogo(size));
        element.dataset.healthLogoApplied = 'true';
    };

    const applyHealthMinistryLogo = () => {
        // Cabinet card: the ministry's primary logo slot.
        document
            .querySelectorAll(`.parchment-card-btn[data-ministry-id="${HEALTH_ID}"] .parchment-icon-box`)
            .forEach(el => replaceElement(el, '64px'));

        // Ministry dashboard header: identify the Health & Welfare header block without
        // relying on a generated element id that the current renderer does not provide.
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
    };

    const start = () => {
        applyHealthMinistryLogo();
        const observer = new MutationObserver(() => applyHealthMinistryLogo());
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('OMEGA_READY', applyHealthMinistryLogo, { once: false });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
