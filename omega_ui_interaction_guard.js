/* OMEGA UI INTERACTION GUARD v1.0.0
 * Owns active modal hit-testing, vertical touch scrolling and background input isolation.
 */
(function (global) {
  'use strict';
  if (global.__OMEGA_UI_INTERACTION_GUARD__) return;
  global.__OMEGA_UI_INTERACTION_GUARD__ = true;

  const STYLE_ID = 'omega-ui-interaction-guard-style';
  const SELECTORS = [
    '#cabinet-full-window',
    '#command-hub-modal',
    '#ministry-dashboard',
    '#ministry-dashboard-content',
    '.omega-minister-recruitment'
  ];

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html, body, #app { width:100%; height:100%; overflow:hidden; }

      #cabinet-full-window,
      #command-hub-modal,
      #ministry-dashboard {
        isolation:isolate;
      }

      #cabinet-full-window {
        pointer-events:none;
        overscroll-behavior:contain;
        touch-action:pan-y;
      }
      #cabinet-full-window.omega-ui-active,
      #cabinet-full-window.omega-ui-active * {
        pointer-events:auto;
      }

      #command-hub-modal {
        overscroll-behavior:contain;
      }

      #ministry-dashboard {
        position:absolute;
        inset:0;
        z-index:9000 !important;
        display:none;
        flex-direction:column;
        min-height:0;
        overflow:hidden !important;
        pointer-events:none;
        isolation:isolate;
        overscroll-behavior:contain;
      }
      #ministry-dashboard.omega-ui-active {
        display:flex !important;
        pointer-events:auto !important;
      }

      #ministry-dashboard-content {
        min-height:0 !important;
        flex:1 1 auto !important;
        width:100%;
        max-height:none !important;
        overflow-y:auto !important;
        overflow-x:hidden !important;
        -webkit-overflow-scrolling:touch;
        overscroll-behavior-y:contain;
        touch-action:pan-y;
        pointer-events:auto !important;
        box-sizing:border-box;
      }

      #ministry-dashboard-content button,
      #ministry-dashboard-content a,
      #ministry-dashboard-content input,
      #ministry-dashboard-content select,
      #ministry-dashboard-content textarea,
      #ministry-dashboard-content [role="button"] {
        pointer-events:auto !important;
        touch-action:manipulation;
        position:relative;
        z-index:1;
      }

      .omega-minister-recruitment,
      .omega-minister-recruitment * {
        pointer-events:auto;
      }

      body.omega-modal-lock #cabinet-full-window,
      body.omega-modal-lock #command-hub-modal,
      body.omega-modal-lock #render-engine-root,
      body.omega-modal-lock #map,
      body.omega-modal-lock #special-map-controls {
        pointer-events:none !important;
      }

      body.omega-modal-lock #ministry-dashboard,
      body.omega-modal-lock #ministry-dashboard * {
        pointer-events:auto;
      }
    `;
    document.head.appendChild(style);
  }

  function visible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && r.width > 0 && r.height > 0;
  }

  function activeMinistry() {
    const el = document.querySelector('#ministry-dashboard');
    return visible(el) || !!document.querySelector('.omega-minister-recruitment');
  }

  function lockBackground() {
    const ministry = document.querySelector('#ministry-dashboard');
    const cabinet = document.querySelector('#cabinet-full-window');
    const command = document.querySelector('#command-hub-modal');
    const active = activeMinistry();

    document.body.classList.toggle('omega-modal-lock', active);
    if (cabinet) cabinet.classList.toggle('omega-ui-active', !active && visible(cabinet));
    if (ministry) ministry.classList.toggle('omega-ui-active', active);

    if (active) {
      if (cabinet) cabinet.setAttribute('aria-hidden', 'true');
      if (command) command.setAttribute('aria-hidden', 'true');
    }
  }

  function stopBackgroundClick(event) {
    if (!activeMinistry()) return;
    const ministry = document.querySelector('#ministry-dashboard');
    if (!ministry) return;
    if (event.target === ministry || ministry.contains(event.target)) return;
    event.stopPropagation();
    event.preventDefault();
  }

  function guardPointer(event) {
    if (!activeMinistry()) return;
    const ministry = document.querySelector('#ministry-dashboard');
    if (!ministry || ministry.contains(event.target)) return;
    event.stopImmediatePropagation();
    event.preventDefault();
  }

  function installObservers() {
    const observer = new MutationObserver(() => lockBackground());
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['style','class','hidden'] });
    setInterval(lockBackground, 250);
  }

  function installEvents() {
    ['pointerdown', 'pointerup', 'click', 'touchend'].forEach(type => {
      document.addEventListener(type, type === 'pointerdown' ? guardPointer : stopBackgroundClick, true);
    });
  }

  function boot() {
    injectStyles();
    installEvents();
    installObservers();
    lockBackground();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();

  global.OmegaUIInteractionGuard = { version:'1.0.0', lockBackground };
})(window);
