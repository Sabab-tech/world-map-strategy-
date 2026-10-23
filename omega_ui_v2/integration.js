/* OMEGA UI v2 integration bridge.
 * Reuses the existing Cabinet layer as the host and keeps a recovery path.
 */
(function (g) {
  'use strict';
  var VERSION = '1.0.0';
  var ACTIVE_ATTR = 'data-omega-ui-v2-active';
  var enabled = true;
  var lastMount = null;
  var lastError = null;

  function cabinetRoot() {
    return g.document && g.document.getElementById('cabinet-full-window') || null;
  }
  function selectedCountry() {
    var values = [
      g.OmegaMinistryViewCountry,
      g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry,
      g.CountryIOS && g.CountryIOS.activeCountry,
      g.Game && (g.Game.currentActiveCountry || g.Game.selectedCountryId),
      g.currentActiveCountry,
      g.playerCountryId,
      g.playerCountry
    ];
    for (var i = 0; i < values.length; i += 1) {
      if (values[i] != null && String(values[i]).trim()) return String(values[i]).trim().toUpperCase();
    }
    return '';
  }
  function restoreLegacy(root, country) {
    try {
      var cabinet = g.OmegaCabinetUI;
      if (cabinet && typeof cabinet.renderCabinet === 'function') cabinet.renderCabinet(country || selectedCountry());
    } catch (_) {}
    if (root && root.removeAttribute) root.removeAttribute(ACTIVE_ATTR);
  }
  function mountIntoCabinet(root) {
    root = root || cabinetRoot();
    if (!enabled || !root || !g.OmegaUIV2App || typeof g.OmegaUIV2App.mount !== 'function') return { ok:false, code:'UI_V2_INTEGRATION_UNAVAILABLE' };
    var country = selectedCountry();
    try {
      if (country) g.OmegaMinistryViewCountry = country;
      var result = g.OmegaUIV2App.mount(root, {
        initialRoute:'government',
        countryId:country,
        onBackToMap:closeToWorldMap,
        renderMap:function () { return closeToWorldMap(); },
        onCountryChange:function (id) {
          var code = String(id || '').trim().toUpperCase();
          if (code) g.OmegaMinistryViewCountry = code;
        },
        onOpenOperations:function () {
          var adapter = g.OMEGA_UI_ADAPTER;
          if (adapter && typeof adapter.openPoliceCommand === 'function') return adapter.openPoliceCommand();
          return false;
        }
      });
      if (!result || result.ok === false || result.mounted !== true) {
        lastError = result && result.code || 'UI_V2_MOUNT_FAILED';
        restoreLegacy(root, country);
        return { ok:false, code:lastError };
      }
      if (root.setAttribute) root.setAttribute(ACTIVE_ATTR, 'true');
      lastMount = { countryId:country || null, route:result.route || 'government', mounted:true };
      lastError = null;
      return { ok:true, countryId:country || null, result:result };
    } catch (error) {
      lastError = String(error && error.message || error || 'UI_V2_MOUNT_EXCEPTION');
      restoreLegacy(root, country);
      return { ok:false, code:'UI_V2_MOUNT_EXCEPTION', message:lastError };
    }
  }
  function closeToWorldMap() {
    var root = cabinetRoot();
    try {
      if (root && g.OmegaUIV2App && root.__omegaUIV2State && typeof g.OmegaUIV2App.unmount === 'function') g.OmegaUIV2App.unmount(root);
    } catch (_) {}
    if (root) {
      if (root.removeAttribute) root.removeAttribute(ACTIVE_ATTR);
      if (root.style) {
        root.style.display = 'none';
        root.style.visibility = 'hidden';
      }
    }
    var manager = g.OmegaLayerManager;
    try {
      if (manager && typeof manager.popLayer === 'function') manager.popLayer();
      else if (manager && typeof manager.setLayer === 'function') manager.setLayer(0);
    } catch (_) {}
    try { if (typeof g.updateGlobalBackButtonVisibility === 'function') g.updateGlobalBackButtonVisibility(); } catch (_) {}
    return true;
  }
  function audit() {
    var root = cabinetRoot();
    return {
      version:VERSION,
      enabled:enabled,
      appAvailable:!!(g.OmegaUIV2App && typeof g.OmegaUIV2App.mount === 'function'),
      cabinetPresent:!!root,
      mounted:!!(root && root.getAttribute && root.getAttribute(ACTIVE_ATTR) === 'true'),
      countryId:selectedCountry() || null,
      lastMount:lastMount,
      lastError:lastError
    };
  }
  g.OmegaUIV2Integration = Object.freeze({
    version:VERSION,
    isEnabled:function () { return enabled; },
    setEnabled:function (value) { enabled = value === true; return enabled; },
    mountIntoCabinet:mountIntoCabinet,
    closeToWorldMap:closeToWorldMap,
    audit:audit
  });
})(typeof window !== 'undefined' ? window : globalThis);
