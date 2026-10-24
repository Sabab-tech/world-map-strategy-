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
  var resumeOnCabinetReturn = false;

  function cabinetRoot() {
    return g.document && g.document.getElementById('cabinet-full-window') || null;
  }
  function selectedCountry() {
    var values = [
      g.OmegaMinistryViewCountry,
      g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry,
      g.CountryIOS && g.CountryIOS.activeCountry,
      g.Game && (g.Game.currentActiveCountry || g.Game.selectedCountryId),
      g.OmegaHomeMinistryEngine && typeof g.OmegaHomeMinistryEngine.getCurrentCountryId === 'function' ? g.OmegaHomeMinistryEngine.getCurrentCountryId() : null,
      g.currentActiveCountry,
      g.playerCountryId,
      g.playerCountry
    ];
    for (var i = 0; i < values.length; i += 1) {
      if (values[i] != null && String(values[i]).trim()) return String(values[i]).trim().toUpperCase();
    }
    return '';
  }
  function availableCountryOptions(country) {
    var engine = g.OmegaHomeMinistryEngine || g.Omega && g.Omega.HomeMinistry;
    var ids = [];
    if (country) ids.push(String(country).toUpperCase());
    try {
      var additional = engine && typeof engine.getAvailableCountries === 'function' ? engine.getAvailableCountries(country) : [];
      if (Array.isArray(additional)) ids = ids.concat(additional);
    } catch (_) {}
    ids = Array.from(new Set(ids.map(function (id) { return String(id || '').trim().toUpperCase(); }).filter(Boolean))).slice(0, 300);
    var gateway = g.OmegaCountryDataGateway || g.Omega && g.Omega.CountryDataGateway;
    return ids.map(function (id) {
      var label = id;
      try {
        var resolved = gateway && typeof gateway.resolveCountry === 'function' ? gateway.resolveCountry(id) : null;
        var identity = resolved && (resolved.identity || resolved.country || resolved);
        label = String(identity && (identity.officialName || identity.name || identity.countryName) || id) + ' (' + id + ')';
      } catch (_) {}
      return { id:id, name:label };
    });
  }
  function restoreLegacy(root, country) {
    try {
      var cabinet = g.OmegaCabinetUI;
      if (cabinet && typeof cabinet.renderCabinet === 'function') cabinet.renderCabinet(country || selectedCountry());
    } catch (_) {}
    if (root && root.removeAttribute) root.removeAttribute(ACTIVE_ATTR);
  }
  function mountIntoCabinet(root, mountOptions) {
    mountOptions = mountOptions || {};
    root = root || cabinetRoot();
    if (!enabled || !root || !g.OmegaUIV2App || typeof g.OmegaUIV2App.mount !== 'function') return { ok:false, code:'UI_V2_INTEGRATION_UNAVAILABLE' };
    var country = selectedCountry();
    try {
      // Open the already-existing cabinet surface without rendering the legacy cabinet HTML first.
      var dashboard = g.document && g.document.getElementById('ministry-dashboard-view');
      if (dashboard && dashboard.style) {
        dashboard.style.display = 'none';
        dashboard.style.opacity = '0';
        dashboard.style.pointerEvents = 'none';
        if (dashboard.setAttribute) dashboard.setAttribute('aria-hidden', 'true');
      }
      if (root.style) Object.assign(root.style, {
        display:'flex', position:'fixed', inset:'0', width:'100vw', height:'100vh',
        minHeight:'100%', opacity:'1', visibility:'visible', pointerEvents:'auto', zIndex:'999999'
      });
      if (root.setAttribute) root.setAttribute('aria-hidden','false');
      if (g.document.body && g.document.body.setAttribute) g.document.body.setAttribute('data-active-layer','1');
      if (g.document.body && g.document.body.classList) g.document.body.classList.add('modal-open');
      var worldUi = g.document && g.document.getElementById('world-ui-root');
      if (worldUi && worldUi.style) {
        worldUi.style.filter = 'none';
        worldUi.style.opacity = '0.5';
        worldUi.style.pointerEvents = 'none';
      }
      var layerManager = g.OmegaLayerManager;
      if (layerManager) {
        layerManager.currentLayer = 1;
        if (Array.isArray(layerManager.layerStack) && layerManager.layerStack[layerManager.layerStack.length - 1] !== 1) layerManager.layerStack.push(1);
        if (typeof layerManager.updateRightSidebar === 'function') layerManager.updateRightSidebar(1);
      }
      if (typeof g.updateGlobalBackButtonVisibility === 'function') g.updateGlobalBackButtonVisibility();
      if (country) g.OmegaMinistryViewCountry = country;
      var result = g.OmegaUIV2App.mount(root, {
        initialRoute:mountOptions.initialRoute && g.OmegaUIV2App.destinations.indexOf(mountOptions.initialRoute) >= 0 ? mountOptions.initialRoute : 'government',
        countryId:country,
        countryOptions:availableCountryOptions(country),
        onBackToMap:closeToWorldMap,
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
      if (mountOptions.ministryId && g.OmegaUIV2App && typeof g.OmegaUIV2App.openMinistry === 'function') { if (!g.OmegaUIV2App.openMinistry(root, mountOptions.ministryId)) return { ok:false, code:'UI_V2_MINISTRY_ROUTE_FAILED' }; lastMount.route = 'ministry-detail'; }
      return { ok:true, countryId:country || null, result:result, route:lastMount.route || mountOptions.initialRoute || 'government' };
    } catch (error) {
      lastError = String(error && error.message || error || 'UI_V2_MOUNT_EXCEPTION');
      restoreLegacy(root, country);
      return { ok:false, code:'UI_V2_MOUNT_EXCEPTION', message:lastError };
    }
  }
  function installOperationalConsoleResumeHook(manager) {
    if (!manager || typeof manager.popLayer !== 'function' || manager.__omegaUIV2ResumeHookInstalled) return;
    var originalPopLayer = manager.popLayer;
    manager.popLayer = function () {
      var result = originalPopLayer.apply(this, arguments);
      var active = Number(this.currentLayer);
      try {
        if (!Number.isFinite(active) && g.document && g.document.body) active = Number(g.document.body.getAttribute('data-active-layer'));
      } catch (_) {}
      if (resumeOnCabinetReturn && active === 1) {
        var resumed = resumeAfterOperationalConsole();
        if (!resumed) resumeOnCabinetReturn = false;
      }
      return result;
    };
    manager.__omegaUIV2ResumeHookInstalled = true;
  }

  function openOperationalConsole(ministryId) {
    var id = String(ministryId || '').trim();
    var manager = g.OmegaLayerManager;
    if (!id || !manager || typeof manager.setLayer !== 'function') return { ok:false, code:'LEGACY_OPERATIONAL_CONSOLE_UNAVAILABLE' };
    resumeOnCabinetReturn = true;
    installOperationalConsoleResumeHook(manager);
    try {
      manager.setLayer(2, { ministryId:id });
      return { ok:true, ministryId:id, destination:'EXISTING_CANONICAL_MINISTRY_CONSOLE' };
    } catch (error) {
      resumeOnCabinetReturn = false;
      return { ok:false, code:'LEGACY_OPERATIONAL_CONSOLE_OPEN_FAILED', message:String(error && error.message || error) };
    }
  }
  function resumeAfterOperationalConsole(root) {
    if (!resumeOnCabinetReturn) return false;
    resumeOnCabinetReturn = false;
    var result = mountIntoCabinet(root || cabinetRoot());
    return result && result.ok === true;
  }

  function openRoute(route) {
    route=String(route||'').trim().toLowerCase();
    if(!enabled||!g.OmegaUIV2App)return false;
    if(route==='map'||route==='world'){var active=cabinetRoot();if(active&&active.getAttribute&&active.getAttribute(ACTIVE_ATTR)==='true')return closeToWorldMap();return true;}
    var mappings={resources:'energy_mining',security:'interior_security','public-safety':'interior_security',logistics:'trade',foreign:'foreign_affairs',defense:'defense',research:'science_research',society:'infrastructure',projects:'mega_projects',agriculture:'agriculture_food',health:'health_welfare',laws:'laws',education:'education',taxes:'taxes',treasury:'treasury_finance','central-bank':'central_bank',cabinet_council:'cabinet_council'};
    var ministryId=mappings[route]||null,destinations=g.OmegaUIV2App.destinations||[];
    if(destinations.indexOf(route)<0&&!ministryId)return false;
    var root=cabinetRoot();
    try{if(root&&root.getAttribute&&root.getAttribute(ACTIVE_ATTR)==='true'&&root.__omegaUIV2State){if(ministryId)return !!g.OmegaUIV2App.openMinistry(root,ministryId);g.OmegaUIV2App.navigate(root,route);return true;}
      var initial=destinations.indexOf(route)>=0?route:'government';return !!(mountIntoCabinet(root,{initialRoute:initial,ministryId:ministryId})||{}).ok;
    }catch(_){return false;}
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
      // Do not call popLayer here: legacy cabinet subsystems can consume Back
      // before closing the active UI-v2 host. Return directly to World Map.
      if (manager && typeof manager.setLayer === 'function') {
        manager.setLayer(0, {}, true);
        manager.currentLayer = 0;
        if (Array.isArray(manager.layerStack)) manager.layerStack = [0];
      } else if (g.document && g.document.body && g.document.body.setAttribute) {
        g.document.body.setAttribute('data-active-layer','0');
      }
      // Layer 0 owns visibility of the old dashboard; do not resurrect it over the map.
      if (typeof g.updateGlobalBackButtonVisibility === 'function') g.updateGlobalBackButtonVisibility();
    } catch (_) {}
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
    openRoute:openRoute,
    openOperationalConsole:openOperationalConsole,
    resumeAfterOperationalConsole:resumeAfterOperationalConsole,
    closeToWorldMap:closeToWorldMap,
    audit:audit
  });
})(typeof window !== 'undefined' ? window : globalThis);
