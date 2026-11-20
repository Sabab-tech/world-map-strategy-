(function (global) {
  'use strict';

  const doc = global.document;
  if (!doc) return;

  const BUTTON_ID = 'omega-gov-entry-v3';
  const CABINET_ID = 'cabinet-full-window';
  const DASHBOARD_ID = 'ministry-dashboard-view';
  const LOADER_ID = 'cabinet-loading-overlay';

  function element(id) {
    return doc.getElementById(id);
  }

  function computed(el) {
    try {
      return typeof global.getComputedStyle === 'function' ? global.getComputedStyle(el) : (el && el.style) || {};
    } catch (_) {
      return (el && el.style) || {};
    }
  }

  function visible(el) {
    if (!el) return false;
    const style = computed(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    if (el.hidden === true) return false;
    if (typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (rect && rect.width === 0 && rect.height === 0) return false;
    }
    return true;
  }

  function activeCountry() {
    const game = global.Game || {};
    const simulation = global.Omega && global.Omega.Simulation;
    const candidates = [
      global.OmegaMinistryViewCountry,
      global.CountryIOS && global.CountryIOS.activeCountry,
      global.OmegaCabinetUI && global.OmegaCabinetUI.activeCountry,
      game.currentActiveCountry,
      game.selectedCountryId,
      game.activeCountry,
      global.currentActiveCountry,
      simulation && typeof simulation.getPlayerCountryId === 'function' ? simulation.getPlayerCountryId() : null,
      global.playerCountryId,
      global.playerCountry
    ];
    const runtime = global.OmegaCountryRuntimeData;
    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined || candidate === '') continue;
      try {
        const identity = runtime && typeof runtime.resolveCountry === 'function'
          ? runtime.resolveCountry(candidate) : null;
        if (identity && (identity.countryCode || identity.iso3)) return identity.countryCode || identity.iso3;
      } catch (_) {}
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      if (typeof candidate === 'object') {
        const raw = candidate.countryId || candidate.countryCode || candidate.iso3 ||
          candidate.iso2 || candidate.code || candidate.name;
        if (raw) return String(raw);
      }
    }
    return 'USA';
  }

  function closeCompetingDrawers() {
    [
      'command-hub-modal', 'country-info-card', 'city-detail-bar',
      'search-drawer', 'events-drawer', 'layers-drawer',
      'resource-filter-box', 'relation-filter-box', 'daily-quests-modal'
    ].forEach(function (id) {
      const panel = element(id);
      if (panel && panel.style) {
        panel.style.display = 'none';
        panel.style.pointerEvents = 'none';
      }
    });
  }

  function syncVisibility() {
    const button = element(BUTTON_ID);
    if (!button || !button.style) return;
    const currentLayer = Number(doc.body && doc.body.getAttribute ? doc.body.getAttribute('data-active-layer') || 0 : 0);
    const loader = element(LOADER_ID);
    const shouldShow = currentLayer === 0 && !visible(loader);
    button.style.visibility = shouldShow ? 'visible' : 'hidden';
    button.style.opacity = shouldShow ? '1' : '0';
    button.style.pointerEvents = shouldShow ? 'auto' : 'none';
    button.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }

  function failClosed(cabinet, button, reason) {
    if (cabinet) {
      if (cabinet.removeAttribute) cabinet.removeAttribute('data-omega-ui-v2-active');
      if (cabinet.style) {
        cabinet.style.display = 'none';
        cabinet.style.visibility = 'hidden';
        cabinet.style.opacity = '0';
        cabinet.style.pointerEvents = 'none';
      }
      if (cabinet.setAttribute) cabinet.setAttribute('aria-hidden', 'true');
      const dashboard = element(DASHBOARD_ID);
      if (dashboard && dashboard.style) {
        dashboard.style.display = 'none';
        dashboard.style.visibility = 'hidden';
        dashboard.style.opacity = '0';
        dashboard.style.pointerEvents = 'none';
      }
    }
    if (doc.body) {
      if (doc.body.setAttribute) doc.body.setAttribute('data-active-layer', '0');
      if (doc.body.classList && doc.body.classList.remove) {
        doc.body.classList.remove('modal-open');
        doc.body.classList.remove('omega-ui-v2-cabinet-active');
        doc.body.classList.remove('omega-ministry-active');
      }
    }
    if (button) button.setAttribute('data-last-open-result', reason);
    syncVisibility();
  }

  function open(event) {
    const button = element(BUTTON_ID);
    const cabinet = element(CABINET_ID);
    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }
    if (!cabinet || !cabinet.style) {
      if (button) button.setAttribute('data-last-open-result', 'failed-no-cabinet');
      return false;
    }

    // Pointer/touch/click recovery can call the entry twice for one physical tap.
    // Once UI v2 is mounted, do not rerender the root or repeat expensive setup.
    if (cabinet.getAttribute && cabinet.getAttribute('data-omega-ui-v2-active') === 'true' &&
        cabinet.__omegaUIV2State) {
      if (button) button.setAttribute('data-last-open-result', 'opened-ui-v2');
      syncVisibility();
      return true;
    }

    closeCompetingDrawers();
    const uiV2 = global.OmegaUIV2Integration;
    if (!uiV2 || typeof uiV2.isEnabled !== 'function' || uiV2.isEnabled() !== true ||
        typeof uiV2.mountIntoCabinet !== 'function') {
      failClosed(cabinet, button, 'failed-ui-v2-unavailable');
      if (typeof global.showOmegaNotification === 'function') {
        global.showOmegaNotification('GOVERNMENT UI UNAVAILABLE',
          'The new government interface could not start. The retired interface is disabled.', 'warning');
      }
      return false;
    }

    try {
      const result = uiV2.mountIntoCabinet(cabinet);
      if (result && result.ok === true) {
        if (button) button.setAttribute('data-last-open-result', 'opened-ui-v2');
        syncVisibility();
        return true;
      }
      failClosed(cabinet, button, 'failed-ui-v2-mount');
      if (typeof global.showOmegaNotification === 'function') {
        global.showOmegaNotification('GOVERNMENT UI UNAVAILABLE',
          'The new government interface failed to mount. Reload after updating; no legacy UI fallback was started.', 'warning');
      }
      return false;
    } catch (error) {
      failClosed(cabinet, button, 'failed-ui-v2-exception');
      if (global.console && typeof global.console.error === 'function') {
        global.console.error('[OMEGA GOV ENTRY v3] UI v2 mount failed.', error);
      }
      if (typeof global.showOmegaNotification === 'function') {
        global.showOmegaNotification('GOVERNMENT UI UNAVAILABLE',
          'The new government interface encountered an error. The retired interface remains disabled.', 'warning');
      }
      return false;
    }
  }

  function onWindowClick(event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;
    const button = target.closest('#' + BUTTON_ID);
    if (!button) return;
    open(event);
  }

  function init() {
    const button = element(BUTTON_ID);
    if (!button) return;
    // Window capture runs before body, app, Leaflet and target-level handlers.
    global.addEventListener('click', onWindowClick, true);

    const Observer = global.MutationObserver;
    if (typeof Observer === 'function') {
      const bodyObserver = new Observer(syncVisibility);
      if (doc.body) bodyObserver.observe(doc.body, { attributes: true, attributeFilter: ['data-active-layer'] });
      const loader = element(LOADER_ID);
      if (loader) bodyObserver.observe(loader, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    }
    global.addEventListener('pageshow', syncVisibility);
    global.addEventListener('resize', syncVisibility);
    syncVisibility();
  }

  global.OMEGAGovEntryV3 = Object.freeze({
    version: '3.0.0',
    open: open,
    syncVisibility: syncVisibility,
    audit: function () {
      const button = element(BUTTON_ID);
      const cabinet = element(CABINET_ID);
      return {
        buttonPresent: !!button,
        buttonVisible: visible(button),
        buttonId: BUTTON_ID,
        cabinetPresent: !!cabinet,
        cabinetVisible: visible(cabinet),
        activeLayer: doc.body && doc.body.getAttribute ? doc.body.getAttribute('data-active-layer') : null,
        lastOpenResult: button && button.getAttribute ? button.getAttribute('data-last-open-result') : null
      };
    }
  });

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
