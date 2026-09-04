(() => {
  'use strict';

  const LOGO_SRC = 'assets/ministers/health.svg';
  const HEALTH_ID = 'health_welfare';
  const HEALTH_TITLE = 'Health & Welfare';

  const asset = file => {
    try { return new URL(file, document.baseURI).href; } catch (_) { return file; }
  };

  const makeLogo = (size = 48) => {
    const box = document.createElement('span');
    Object.assign(box.style, {
      width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', borderRadius: '10px', flex: '0 0 auto', padding: '0', margin: '0'
    });
    const img = document.createElement('img');
    img.src = asset(LOGO_SRC);
    img.alt = 'Health Ministry';
    img.draggable = false;
    Object.assign(img.style, {
      width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%',
      objectFit: 'contain', objectPosition: 'center', display: 'block',
      margin: '0', padding: '0', pointerEvents: 'none'
    });
    img.setAttribute('aria-hidden', 'true');
    box.appendChild(img);
    return box;
  };

  const replaceElement = (element, size) => {
    if (!element || element.dataset.healthLogoApplied === 'true') return;
    element.replaceChildren(makeLogo(size));
    element.dataset.healthLogoApplied = 'true';
    element.style.overflow = 'hidden';
    element.style.padding = '0';
    element.style.display = 'inline-flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
  };

  function applyHealthMinistryLogo() {
    document.querySelectorAll(`.parchment-card-btn[data-ministry-id="${HEALTH_ID}"] .parchment-icon-box`).forEach(el => {
      el.style.width = el.style.width || '48px';
      el.style.height = el.style.height || '48px';
      replaceElement(el, 48);
    });

    const dashboard = document.getElementById('ministry-dashboard-view');
    if (!dashboard || dashboard.style.display === 'none') return;
    const title = Array.from(dashboard.querySelectorAll('h1')).find(el => el.textContent.trim() === HEALTH_TITLE);
    if (!title) return;
    const header = title.parentElement?.parentElement;
    const icon = header?.querySelector('div[style*="font-size:40px"], div[style*="font-size:36px"]');
    if (icon) {
      icon.style.width = '64px'; icon.style.height = '64px';
      replaceElement(icon, 64);
    }
  }

  function start() {
    applyHealthMinistryLogo();
    const dashboard = document.getElementById('ministry-dashboard-view');
    const observerTargets = [dashboard, document.getElementById('cabinet-body')].filter(Boolean);
    const observers = observerTargets.map(target => {
      const observer = new MutationObserver(() => requestAnimationFrame(applyHealthMinistryLogo));
      observer.observe(target, { childList: true, subtree: true });
      return observer;
    });
    window.addEventListener('OMEGA_READY', applyHealthMinistryLogo);
    window.__OMEGA_HEALTH_LOGO_OBSERVERS__ = observers;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
