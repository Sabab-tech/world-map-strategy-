/* OMEGA Resource & Mining: hard handoff to UI v2.
 * The former renderers stay in the repository for audit/compatibility, but may
 * never mount a second Resource Ministry over the unified cards/SVG screen.
 */
(function (g) {
  'use strict';

  var INSTALL_FLAG = '__omegaUIV2ResourceLegacyBridgeInstalled';
  var ACTIVE_ATTR = 'data-omega-ui-v2-active';
  var RESOURCE_IDS = Object.freeze([
    'resource',
    'resources',
    'energy_mining',
    'energy-mining',
    'energy & mining',
    'resources & mining'
  ]);

  function normalizeMinistry(value) {
    var raw = value && typeof value === 'object'
      ? (value.id || value.ministryId || value.ministry_id || value.key || '')
      : value;
    return String(raw == null ? '' : raw).trim().toLowerCase().replace(/[_-]+/g, ' ');
  }

  function isResourceMinistry(value) {
    return RESOURCE_IDS.indexOf(normalizeMinistry(value)) >= 0;
  }

  function rootNode() {
    return g.document && typeof g.document.getElementById === 'function'
      ? g.document.getElementById('cabinet-full-window')
      : null;
  }

  function activeCountry(owner) {
    var candidates = [];
    try {
      if (owner && typeof owner.getActiveCountryKey === 'function') {
        candidates.push(owner.getActiveCountryKey());
      }
    } catch (_) {}
    candidates.push(
      owner && owner.activeCountry,
      g.OmegaMinistryViewCountry,
      g.CountryIOS && g.CountryIOS.activeCountry,
      g.Game && (g.Game.currentActiveCountry || g.Game.selectedCountryId),
      g.currentActiveCountry,
      g.playerCountryId,
      g.playerCountry
    );
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i] != null && String(candidates[i]).trim()) return String(candidates[i]).trim();
    }
    return '';
  }

  function failClosed(reason) {
    try {
      if (typeof g.showOmegaNotification === 'function') {
        g.showOmegaNotification(
          'RESOURCE & MINING UI UNAVAILABLE',
          'The unified Resource Ministry screen could not be opened (' + String(reason || 'UI_V2_UNAVAILABLE') + '). The retired renderer remains disabled.',
          'warning'
        );
      }
    } catch (_) {}
    return false;
  }

  function resourceRouteActive(root) {
    return !!(root && root.getAttribute &&
      root.getAttribute(ACTIVE_ATTR) === 'true' &&
      root.__omegaUIV2State &&
      root.__omegaUIV2State.route === 'resources');
  }

  function openResourceV2(owner) {
    var root = rootNode();
    var integration = g.OmegaUIV2Integration;
    var app = g.OmegaUIV2App;
    if (!root || !integration ||
        typeof integration.isEnabled !== 'function' ||
        integration.isEnabled() !== true) {
      return failClosed('UI_V2_INTEGRATION_UNAVAILABLE');
    }

    if (root.getAttribute && root.getAttribute(ACTIVE_ATTR) === 'true' && root.__omegaUIV2State) {
      if (!app || typeof app.openMinistry !== 'function') return failClosed('UI_V2_MINISTRY_ROUTER_UNAVAILABLE');
      var opened = false;
      try { opened = app.openMinistry(root, 'energy_mining') === true; } catch (_) {}
      return opened && resourceRouteActive(root) ? true : failClosed('RESOURCE_ROUTE_NOT_ACTIVE');
    }

    if (typeof integration.mountIntoCabinet !== 'function') {
      return failClosed('UI_V2_MOUNT_UNAVAILABLE');
    }
    var result;
    try {
      result = integration.mountIntoCabinet(root, {
        initialRoute: 'government',
        ministryId: 'energy_mining',
        countryId: activeCountry(owner)
      });
    } catch (_) {
      return failClosed('UI_V2_MOUNT_EXCEPTION');
    }
    if (!result || result.ok !== true || !resourceRouteActive(root)) {
      return failClosed(result && result.code || 'RESOURCE_ROUTE_NOT_ACTIVE');
    }
    return true;
  }

  function install() {
    var ui = g.OmegaCabinetUI;
    if (!ui || typeof ui !== 'object') return false;
    if (ui[INSTALL_FLAG] === true) return true;

    var originalRenderMinistryDashboard = typeof ui.renderMinistryDashboard === 'function'
      ? ui.renderMinistryDashboard
      : null;
    var originalRenderResourceDashboard = typeof ui.renderResourceMinistryDashboard === 'function'
      ? ui.renderResourceMinistryDashboard
      : null;

    if (originalRenderMinistryDashboard) {
      ui.renderMinistryDashboard = function (ministryId) {
        if (isResourceMinistry(ministryId)) return openResourceV2(this);
        return originalRenderMinistryDashboard.apply(this, arguments);
      };
    }
    if (originalRenderResourceDashboard) {
      ui.renderResourceMinistryDashboard = function () {
        return openResourceV2(this);
      };
    }

    try {
      Object.defineProperty(ui, INSTALL_FLAG, { value: true, configurable: true });
    } catch (_) {
      ui[INSTALL_FLAG] = true;
    }
    return true;
  }

  g.OmegaUIV2ResourceLegacyBridge = Object.freeze({
    version: '1.0.0',
    install: install,
    isResourceMinistry: isResourceMinistry,
    openResourceV2: openResourceV2
  });

  // Script order is deliberate: this file loads after ministry_engine.js and UI v2.
  install();
})(typeof window !== 'undefined' ? window : globalThis);
