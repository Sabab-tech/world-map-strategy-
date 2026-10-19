/* OMEGA UI SYSTEM REDESIGN RUNTIME v1
 * Viewport sizing, safe Escape-to-close behavior and a read-only UI audit.
 * It does not replace ministry engines or remove/disable existing controls.
 */
(function (global) {
  'use strict';

  if (global.OMEGAUiSystem && global.OMEGAUiSystem.version === '1.0.0') return;

  const root = global.document && global.document.documentElement;
  const doc = global.document;
  if (!root || !doc) return;

  const SURFACE_SELECTORS = [
    '#minister-interrogation-modal',
    '#city-detail-bar',
    '#resource-filter-box',
    '#map-metric-dropdown',
    '#search-drawer',
    '#events-drawer',
    '#layers-drawer',
    '#daily-quests-modal',
    '#ministry-dashboard-view',
    '#cabinet-full-window',
    '#command-hub-modal'
  ];

  let resizeFrame = 0;

  function finitePositive(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function updateViewport() {
    const viewport = global.visualViewport;
    const height = Math.round(finitePositive(viewport && viewport.height, global.innerHeight || root.clientHeight || 1));
    const width = Math.round(finitePositive(viewport && viewport.width, global.innerWidth || root.clientWidth || 1));
    root.style.setProperty('--omega-app-height', height + 'px');
    root.style.setProperty('--omega-app-width', width + 'px');
    root.dataset.omegaUiViewport = width <= 760 ? 'compact' : (width <= 1100 ? 'tablet' : 'desktop');

    const active = doc.activeElement;
    const editing = !!(active && active.matches && active.matches('input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]'));
    const layoutHeight = finitePositive(global.innerHeight, height);
    const keyboardLikelyOpen = editing && height < layoutHeight * 0.78;
    if (keyboardLikelyOpen) root.setAttribute('data-omega-ui-keyboard-open', 'true');
    else root.removeAttribute('data-omega-ui-keyboard-open');
  }

  function scheduleViewportUpdate() {
    if (resizeFrame) return;
    const requestFrame = global.requestAnimationFrame || function (callback) { return global.setTimeout(callback, 16); };
    resizeFrame = requestFrame(function () {
      resizeFrame = 0;
      updateViewport();
    });
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = global.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function panelOrder(element) {
    const z = Number.parseInt(global.getComputedStyle(element).zIndex, 10);
    return Number.isFinite(z) ? z : 0;
  }

  function visibleSurfaces() {
    return SURFACE_SELECTORS
      .map(function (selector, index) {
        const element = doc.querySelector(selector);
        return element && isVisible(element) ? { element: element, selector: selector, index: index, zIndex: panelOrder(element) } : null;
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return (a.zIndex - b.zIndex) || (a.index - b.index);
      });
  }

  function closeTopSurface() {
    const surfaces = visibleSurfaces();
    const top = surfaces[surfaces.length - 1];
    if (top) {
      const button = top.element.querySelector([
        'button[id^="btn-close-"]',
        'button.drawer-close',
        'button.omega-close-btn',
        'button.ios-exit-btn',
        '.city-modal-exit-btn',
        '.parchment-back-btn',
        'button[aria-label*="close" i]',
        'button[title*="close" i]'
      ].join(','));
      if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
        button.click();
        return true;
      }
    }

    const layers = global.OmegaLayerManager;
    if (layers && typeof layers.popLayer === 'function' && Number(layers.currentLayer) > 0) {
      layers.popLayer();
      return true;
    }
    return false;
  }

  function handleEscape(event) {
    if (!event || event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
    if (closeTopSurface()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function hasAccessibleName(element) {
    const explicit = element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      element.getAttribute('aria-labelledby') ||
      element.getAttribute('placeholder');
    if (explicit && explicit.trim()) return true;
    if (element.labels && element.labels.length) return true;
    const text = String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 0;
  }

  function audit() {
    const controls = Array.from(doc.querySelectorAll('button,[role="button"],a[href],input,select,textarea'));
    const unnamedControls = controls.filter(function (element) {
      return !hasAccessibleName(element);
    });
    const disabledControls = controls.filter(function (element) {
      return element.disabled === true || element.getAttribute('aria-disabled') === 'true';
    });
    const surfaces = visibleSurfaces().map(function (surface) {
      return { id: surface.element.id || surface.selector, zIndex: surface.zIndex };
    });
    return {
      version: '1.0.0',
      viewport: root.dataset.omegaUiViewport || 'unknown',
      viewportWidth: Math.round(global.visualViewport ? global.visualViewport.width : global.innerWidth || 0),
      viewportHeight: Math.round(global.visualViewport ? global.visualViewport.height : global.innerHeight || 0),
      controlCount: controls.length,
      controlsWithoutAccessibleName: unnamedControls.map(function (element) {
        return { tag: element.tagName.toLowerCase(), id: element.id || null, className: typeof element.className === 'string' ? element.className : null };
      }),
      disabledControlCount: disabledControls.length,
      visibleSurfaces: surfaces
    };
  }

  function boot() {
    updateViewport();
    global.addEventListener('resize', scheduleViewportUpdate, { passive: true });
    global.addEventListener('orientationchange', scheduleViewportUpdate, { passive: true });
    global.addEventListener('focusin', scheduleViewportUpdate, true);
    global.addEventListener('focusout', scheduleViewportUpdate, true);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', scheduleViewportUpdate, { passive: true });
      global.visualViewport.addEventListener('scroll', scheduleViewportUpdate, { passive: true });
    }
    doc.addEventListener('keydown', handleEscape);
  }

  global.OMEGAUiSystem = Object.freeze({
    version: '1.0.0',
    refresh: updateViewport,
    audit: audit,
    closeTopSurface: closeTopSurface
  });

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window);

/* MINISTRY ENTRY RECOVERY v1
 * Keeps main-cabinet ministry cards navigable even when a legacy inline
 * handler is lost, shadowed, or fails to finish the layer transition.
 */
(function installMinistryEntryRecovery(global) {
  'use strict';
  const doc = global.document;
  const FLAG = '__OMEGA_MINISTRY_ENTRY_RECOVERY_V1__';
  if (!doc || global[FLAG]) return;
  global[FLAG] = true;

  function isSurfaceVisible(element) {
    if (!element || element.isConnected === false) return false;
    const style = typeof global.getComputedStyle === 'function'
      ? global.getComputedStyle(element) : (element.style || {});
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    if (typeof element.getBoundingClientRect !== 'function') return style.display === 'flex' || style.display === 'block';
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function openMinistry(ministryId) {
    const id = String(ministryId || '').trim();
    if (!id) return false;

    const manager = global.OmegaLayerManager;
    const dashboard = doc.getElementById('ministry-dashboard-view');
    const cabinet = doc.getElementById('cabinet-full-window');

    if (manager && typeof manager.setLayer === 'function') {
      try {
        manager.setLayer(2, { ministryId: id });
        if (isSurfaceVisible(dashboard)) return true;
      } catch (error) {
        if (global.console && typeof global.console.warn === 'function') {
          global.console.warn('[OMEGA NAV] Layer manager failed; trying ministry-view recovery.', error);
        }
      }
    }

    const ministryUI = global.OmegaCabinetUI;
    if (!dashboard || !ministryUI || typeof ministryUI.renderMinistryDashboard !== 'function') return false;

    try {
      if (cabinet) {
        cabinet.style.display = 'none';
        cabinet.style.opacity = '0';
        cabinet.style.pointerEvents = 'none';
        if (typeof cabinet.setAttribute === 'function') cabinet.setAttribute('aria-hidden', 'true');
      }
      Object.assign(dashboard.style, {
        display: 'flex',
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        opacity: '1',
        visibility: 'visible',
        pointerEvents: 'auto',
        zIndex: '999999'
      });
      if (dashboard.classList && typeof dashboard.classList.add === 'function') dashboard.classList.add('omega-ui-active');
      if (typeof dashboard.setAttribute === 'function') dashboard.setAttribute('aria-hidden', 'false');
      if (doc.body) {
        if (doc.body.classList && typeof doc.body.classList.add === 'function') doc.body.classList.add('modal-open');
        if (typeof doc.body.setAttribute === 'function') doc.body.setAttribute('data-active-layer', '2');
      }

      ministryUI.renderMinistryDashboard(id);
      if (manager) {
        manager.currentLayer = 2;
        manager.activeMinistryId = id;
        if (Array.isArray(manager.layerStack) && manager.layerStack[manager.layerStack.length - 1] !== 2) {
          manager.layerStack.push(2);
        }
      }
      if (global.OmegaUIInteractionGuard && typeof global.OmegaUIInteractionGuard.refresh === 'function') {
        global.OmegaUIInteractionGuard.refresh();
      }
      if (typeof global.updateGlobalBackButtonVisibility === 'function') {
        global.updateGlobalBackButtonVisibility();
      }
      return isSurfaceVisible(dashboard);
    } catch (error) {
      if (global.console && typeof global.console.error === 'function') {
        global.console.error('[OMEGA NAV] Could not open ministry dashboard:', id, error);
      }
      return false;
    }
  }

  function handleMinistryCardClick(event) {
    if (!event || !event.target || typeof event.target.closest !== 'function') return;
    const card = event.target.closest('#cabinet-full-window .parchment-card-btn[data-ministry-id]');
    if (!card) return;

    const ministryId = String(
      (typeof card.getAttribute === 'function' && card.getAttribute('data-ministry-id')) ||
      (card.dataset && card.dataset.ministryId) || ''
    ).trim();
    if (!ministryId) return;

    if (ministryId === 'cabinet_council') {
      const cabinetUI = global.OmegaCabinetUI;
      if (cabinetUI && typeof cabinetUI.setCabinetMainView === 'function') {
        event.preventDefault();
        event.stopImmediatePropagation();
        cabinetUI.setCabinetMainView('council');
      }
      return;
    }

    if (openMinistry(ministryId)) {
      // The delegated route has now opened the destination; avoid firing a
      // second legacy inline route for the same tap.
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  doc.addEventListener('click', handleMinistryCardClick, true);
  global.OMEGAMinistryEntryRecovery = Object.freeze({
    version: '1.0.0',
    openMinistry: openMinistry
  });
})(window);

