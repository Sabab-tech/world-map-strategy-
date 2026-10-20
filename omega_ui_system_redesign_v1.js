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

 

/* MAP MINISTRY DOCK RECOVERY v2
 * Runs in document capture phase and provides a direct layer fallback.
 * The button remains functional even if the older dock binding did not boot.
 */
(function installMainMinistryDockRecovery(global) {
  'use strict';
  const doc = global.document;
  const FLAG = '__OMEGA_MAIN_MINISTRY_DOCK_RECOVERY_V2__';
  if (!doc || global[FLAG]) return;
  global[FLAG] = true;

  function visible(element) {
    if (!element || element.isConnected === false) return false;
    const style = typeof global.getComputedStyle === 'function'
      ? global.getComputedStyle(element) : (element.style || {});
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    if (typeof element.getBoundingClientRect !== 'function') return style.display === 'flex' || style.display === 'block';
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function activeCountry() {
    return (global.Game && global.Game.currentActiveCountry) ||
      global.currentActiveCountry || global.OmegaMinistryViewCountry || 'BANGLADESH';
  }

  function setLayerState(layer) {
    const body = doc.body;
    if (body && typeof body.setAttribute === 'function') body.setAttribute('data-active-layer', String(layer));
    if (body && body.classList) {
      if (layer === 0) body.classList.remove('modal-open');
      else body.classList.add('modal-open');
    }
    const manager = global.OmegaLayerManager;
    if (manager) {
      manager.currentLayer = layer;
      if (Array.isArray(manager.layerStack) && manager.layerStack[manager.layerStack.length - 1] !== layer) {
        manager.layerStack.push(layer);
      }
    }
  }

  function openCabinet(event) {
    const cabinet = doc.getElementById('cabinet-full-window');
    if (!cabinet) {
      if (global.console && global.console.error) global.console.error('[OMEGA NAV] Cabinet entry failed: cabinet-full-window is missing.');
      return false;
    }

    try {
      if (typeof global.openMainMinistryView === 'function') {
        global.openMainMinistryView(event);
        if (visible(cabinet)) {
          const dock = doc.getElementById('omega-ministry-entry');
          if (dock) dock.setAttribute('data-last-open-result', 'opened');
          return true;
        }
      }
    } catch (error) {
      if (global.console && global.console.warn) global.console.warn('[OMEGA NAV] Primary cabinet route failed; trying recovery.', error);
    }

    const manager = global.OmegaLayerManager;
    try {
      if (manager && typeof manager.setLayer === 'function') manager.setLayer(1);
      if (visible(cabinet)) {
        const dock = doc.getElementById('omega-ministry-entry');
        if (dock) dock.setAttribute('data-last-open-result', 'opened');
        return true;
      }
    } catch (error) {
      if (global.console && global.console.warn) global.console.warn('[OMEGA NAV] Layer-manager route failed; using direct cabinet recovery.', error);
    }

    try {
      const dashboard = doc.getElementById('ministry-dashboard-view');
      if (dashboard) {
        dashboard.style.display = 'none';
        dashboard.style.pointerEvents = 'none';
        dashboard.style.opacity = '0';
        if (typeof dashboard.setAttribute === 'function') dashboard.setAttribute('aria-hidden', 'true');
      }
      Object.assign(cabinet.style, {
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
      if (typeof cabinet.setAttribute === 'function') cabinet.setAttribute('aria-hidden', 'false');
      setLayerState(1);

      const cabinetUI = global.OmegaCabinetUI;
      if (cabinetUI && typeof cabinetUI.renderCabinet === 'function') cabinetUI.renderCabinet(activeCountry());

      const opened = visible(cabinet);
      const dock = doc.getElementById('omega-ministry-entry');
      if (dock) dock.setAttribute('data-last-open-result', opened ? 'opened' : 'failed');
      if (!opened && typeof global.showOmegaNotification === 'function') {
        global.showOmegaNotification('MINISTRY ENTRY FAILED', 'Cabinet was requested but did not become visible. Check OMEGA diagnostics for the runtime error.', 'danger');
      }
      return opened;
    } catch (error) {
      const dock = doc.getElementById('omega-ministry-entry');
      if (dock) dock.setAttribute('data-last-open-result', 'failed');
      if (global.console && global.console.error) global.console.error('[OMEGA NAV] Cabinet recovery failed.', error);
      if (typeof global.showOmegaNotification === 'function') {
        global.showOmegaNotification('MINISTRY ENTRY FAILED', 'The cabinet view could not be initialized. See OMEGA diagnostics for the runtime error.', 'danger');
      }
      return false;
    }
  }

  function handleMapMinistryDockClick(event) {
    if (!event || !event.target || typeof event.target.closest !== 'function') return;
    const button = event.target.closest('#btn-ministry-dock');
    if (!button) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    openCabinet(event);
  }

  function syncDockPosition() {
    const dock = doc.getElementById('omega-ministry-entry');
    if (!dock || !dock.style) return;
    let top = 72;
    const header = doc.getElementById('top-status-bar');
    if (visible(header) && typeof header.getBoundingClientRect === 'function') {
      const rect = header.getBoundingClientRect();
      if (rect && Number.isFinite(rect.bottom) && rect.height > 0) top = Math.ceil(rect.bottom + 8);
    }
    // Inline !important wins against legacy stylesheets with equally important
    // top offsets, and follows the actual wrapped status bar on small phones.
    if (typeof dock.style.setProperty === 'function') dock.style.setProperty('top', top + 'px', 'important');
    else dock.style.top = top + 'px';
  }

  function syncDockVisibility() {
    const dock = doc.getElementById('omega-ministry-entry');
    if (!dock) return;
    const layer = doc.body && typeof doc.body.getAttribute === 'function'
      ? doc.body.getAttribute('data-active-layer') : null;
    const onMap = layer === null || layer === '' || layer === '0';
    // Let the layer CSS decide visibility. Avoid sticky inline display:none
    // after returning to the map when observers/events are delayed on WebView.
    dock.setAttribute('aria-hidden', onMap ? 'false' : 'true');
    dock.setAttribute('data-omega-map-active', onMap ? 'true' : 'false');
    syncDockPosition();
  }

  doc.addEventListener('click', handleMapMinistryDockClick, true);
  syncDockVisibility();
  global.addEventListener('resize', syncDockPosition, { passive: true });
  global.addEventListener('orientationchange', syncDockPosition, { passive: true });
  if (global.visualViewport) global.visualViewport.addEventListener('resize', syncDockPosition, { passive: true });
  if (typeof global.ResizeObserver === 'function') {
    const header = doc.getElementById('top-status-bar');
    if (header) {
      const resizeObserver = new global.ResizeObserver(syncDockPosition);
      resizeObserver.observe(header);
    }
  }
  if (typeof global.MutationObserver === 'function' && doc.body) {
    const observer = new global.MutationObserver(syncDockVisibility);
    observer.observe(doc.body, { attributes: true, attributeFilter: ['data-active-layer'] });
  }

  global.OMEGAMinistryDock = Object.freeze({
    version: '2.0.0',
    open: openCabinet,
    audit: function () {
      const dock = doc.getElementById('omega-ministry-entry');
      const cabinet = doc.getElementById('cabinet-full-window');
      return {
        buttonPresent: !!(dock && doc.getElementById('btn-ministry-dock')),
        buttonVisible: visible(dock),
        buttonDisplay: dock && dock.style ? dock.style.display : null,
        cabinetPresent: !!cabinet,
        cabinetVisible: visible(cabinet),
        activeLayer: doc.body && doc.body.getAttribute ? doc.body.getAttribute('data-active-layer') : null,
        lastOpenResult: dock && dock.getAttribute ? dock.getAttribute('data-last-open-result') || null : null
      };
    }
  });
})(window);
