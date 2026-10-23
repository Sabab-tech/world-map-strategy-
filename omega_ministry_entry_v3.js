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

  function setLayerState(layer) {
    if (!doc.body) return;
    doc.body.setAttribute('data-active-layer', String(layer));
    if (doc.body.classList) {
      if (layer === 0) doc.body.classList.remove('modal-open');
      else doc.body.classList.add('modal-open');
    }
  }

  function closeCompetingDrawers() {
    try {
      if (global.Game && typeof global.Game.closeAllDrawers === 'function') {
        global.Game.closeAllDrawers();
        return;
      }
    } catch (error) {
      if (global.console && typeof global.console.warn === 'function') {
        global.console.warn('[OMEGA GOV ENTRY v3] Drawer close helper failed; using targeted fallback.', error);
      }
    }
    [
      'command-hub-modal', 'country-info-card', 'city-detail-bar',
      'search-drawer', 'events-drawer', 'layers-drawer',
      'resource-filter-box', 'relation-filter-box', 'daily-quests-modal'
    ].forEach(function (id) {
      const panel = element(id);
      if (panel && panel.style) panel.style.display = 'none';
    });
  }

  function directCabinetFallback(cabinet) {
    const dashboard = element(DASHBOARD_ID);
    if (dashboard && dashboard.style) {
      dashboard.style.display = 'none';
      dashboard.style.opacity = '0';
      dashboard.style.pointerEvents = 'none';
      if (typeof dashboard.setAttribute === 'function') dashboard.setAttribute('aria-hidden', 'true');
    }

    Object.assign(cabinet.style, {
      display: 'flex',
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      minHeight: '100%',
      opacity: '1',
      visibility: 'visible',
      pointerEvents: 'auto',
      zIndex: '999999'
    });
    if (typeof cabinet.setAttribute === 'function') cabinet.setAttribute('aria-hidden', 'false');
    setLayerState(1);

    const manager = global.OmegaLayerManager;
    if (manager) {
      manager.currentLayer = 1;
      if (Array.isArray(manager.layerStack) && manager.layerStack[manager.layerStack.length - 1] !== 1) {
        manager.layerStack.push(1);
      }
    }

    const cabinetUI = global.OmegaCabinetUI;
    if (cabinetUI && typeof cabinetUI.renderCabinet === 'function') {
      cabinetUI.renderCabinet(activeCountry());
    }
    if (typeof global.updateGlobalBackButtonVisibility === 'function') {
      global.updateGlobalBackButtonVisibility();
    }
    return visible(cabinet);
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
      if (global.console && typeof global.console.error === 'function') {
        global.console.error('[OMEGA GOV ENTRY v3] Cabinet surface is missing.');
      }
      return false;
    }

    closeCompetingDrawers();

    try {
      if (typeof global.openMainMinistryView === 'function') {
        global.openMainMinistryView(event || {
          preventDefault: function () {},
          stopPropagation: function () {},
          stopImmediatePropagation: function () {}
        });
        if (visible(cabinet)) {
          const uiV2 = global.OmegaUIV2Integration;
          if (uiV2 && typeof uiV2.isEnabled === 'function' && uiV2.isEnabled() && typeof uiV2.mountIntoCabinet === 'function') {
            const mountResult = uiV2.mountIntoCabinet(cabinet);
            if (mountResult && mountResult.ok === true) {
              if (button) button.setAttribute('data-last-open-result', 'opened-ui-v2');
              syncVisibility();
              return true;
            }
            // The integration bridge restores the legacy cabinet if mounting UI v2 fails.
          }
          if (button) button.setAttribute('data-last-open-result', 'opened-primary');
          syncVisibility();
          return true;
        }
      }
    } catch (error) {
      if (global.console && typeof global.console.warn === 'function') {
        global.console.warn('[OMEGA GOV ENTRY v3] Primary ministry route failed.', error);
      }
    }

    try {
      const manager = global.OmegaLayerManager;
      if (manager && typeof manager.setLayer === 'function') manager.setLayer(1);
      if (visible(cabinet)) {
        if (button) button.setAttribute('data-last-open-result', 'opened-layer-manager');
        syncVisibility();
        return true;
      }
    } catch (error) {
      if (global.console && typeof global.console.warn === 'function') {
        global.console.warn('[OMEGA GOV ENTRY v3] Layer-manager route failed.', error);
      }
    }

    try {
      const opened = directCabinetFallback(cabinet);
      if (button) button.setAttribute('data-last-open-result', opened ? 'opened-direct-fallback' : 'failed');
      if (!opened && typeof global.showOmegaNotification === 'function') {
        global.showOmegaNotification('MINISTRY ENTRY FAILED', 'The government cabinet did not become visible. Check OMEGA diagnostics.', 'danger');
      }
      syncVisibility();
      return opened;
    } catch (error) {
      if (button) button.setAttribute('data-last-open-result', 'failed-exception');
      if (global.console && typeof global.console.error === 'function') {
        global.console.error('[OMEGA GOV ENTRY v3] All cabinet routes failed.', error);
      }
      if (typeof global.showOmegaNotification === 'function') {
        global.showOmegaNotification('MINISTRY ENTRY FAILED', 'The government cabinet could not be initialized. Check OMEGA diagnostics.', 'danger');
      }
      syncVisibility();
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
