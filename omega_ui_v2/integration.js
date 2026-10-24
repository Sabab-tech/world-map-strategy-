/* OMEGA UI v2 integration bridge.
 * Mounts UI v2 into the cabinet host; legacy presentation and navigation are disabled.
 */
(function (g) {
  'use strict';
  var VERSION = '1.0.0';
  var ACTIVE_ATTR = 'data-omega-ui-v2-active';
  var enabled = true;
  var lastMount = null;
  var lastError = null;
  var resumeOnCabinetReturn = false;
  var resumeUiState = null;

  function cabinetRoot() {
    return g.document && g.document.getElementById('cabinet-full-window') || null;
  }
  function setV2CabinetActive(root, active) {
    root = root || cabinetRoot();
    if (root) {
      if (active && root.setAttribute) root.setAttribute(ACTIVE_ATTR, 'true');
      else if (!active && root.removeAttribute) root.removeAttribute(ACTIVE_ATTR);
    }
    var body = g.document && g.document.body;
    var classes = body && body.classList;
    if (classes) {
      if (typeof classes.toggle === 'function') classes.toggle('omega-ui-v2-cabinet-active', !!active);
      else if (active && typeof classes.add === 'function') classes.add('omega-ui-v2-cabinet-active');
      else if (!active && typeof classes.remove === 'function') classes.remove('omega-ui-v2-cabinet-active');
    }
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
  function failClosed(root) {
    setV2CabinetActive(root, false);
    try {
      if (root && root.__omegaUIV2State && g.OmegaUIV2App && typeof g.OmegaUIV2App.unmount === 'function') {
        g.OmegaUIV2App.unmount(root);
      }
    } catch (_) {}
    var dashboard = g.document && g.document.getElementById('ministry-dashboard-view');
    if (dashboard && dashboard.style) {
      dashboard.style.display = 'none';
      dashboard.style.visibility = 'hidden';
      dashboard.style.opacity = '0';
      dashboard.style.pointerEvents = 'none';
      if (dashboard.setAttribute) dashboard.setAttribute('aria-hidden', 'true');
    }
    if (root) {
      if (root.innerHTML !== undefined) root.innerHTML = '';
      if (root.style) {
        root.style.display = 'none';
        root.style.visibility = 'hidden';
        root.style.opacity = '0';
        root.style.pointerEvents = 'none';
      }
      if (root.setAttribute) root.setAttribute('aria-hidden', 'true');
      if (root.removeAttribute) root.removeAttribute(ACTIVE_ATTR);
    }
    var body = g.document && g.document.body;
    if (body) {
      if (body.setAttribute) body.setAttribute('data-active-layer', '0');
      if (body.classList && typeof body.classList.remove === 'function') body.classList.remove('modal-open');
    }
    var worldUi = g.document && g.document.getElementById('world-ui-root');
    if (worldUi && worldUi.style) {
      worldUi.style.filter = 'none';
      worldUi.style.opacity = '1';
      worldUi.style.pointerEvents = 'auto';
    }
    var manager = g.OmegaLayerManager;
    if (manager) {
      manager.currentLayer = 0;
      if (Array.isArray(manager.layerStack)) manager.layerStack = [0];
    }
  }
  function mountIntoCabinet(root, mountOptions) {
    mountOptions = mountOptions || {};
    root = root || cabinetRoot();
    if (!enabled || !root || !g.OmegaUIV2App || typeof g.OmegaUIV2App.mount !== 'function') return { ok:false, code:'UI_V2_INTEGRATION_UNAVAILABLE' };
    var country = String(mountOptions.countryId || selectedCountry() || '').trim().toUpperCase();
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
      setV2CabinetActive(root, true);
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
      }
      if (country) g.OmegaMinistryViewCountry = country;
      var supportedRoutes = ['map','overview','government','economy','more','industry','reports','religion','home-affairs','resources','ministry-detail','mine-detail'];
      var initialRoute = supportedRoutes.indexOf(mountOptions.initialRoute) >= 0 ? mountOptions.initialRoute : 'government';
      var result = g.OmegaUIV2App.mount(root, {
        initialRoute:initialRoute,
        initialMinistryId:mountOptions.initialMinistryId || null,
        initialSection:mountOptions.initialSection || 'dashboard',
        initialResourceSiteId:mountOptions.initialResourceSiteId || null,
        initialGovernmentView:mountOptions.initialGovernmentView === 'all-ministries' ? 'all-ministries' : 'executive-ministry',
        initialHistory:Array.isArray(mountOptions.initialHistory) ? mountOptions.initialHistory : [],
        countryId:country,
        countryOptions:availableCountryOptions(country),
        onBackToMap:closeToWorldMap,
        onCountryChange:function (id) {
          var code = String(id || '').trim().toUpperCase();
          if (code) g.OmegaMinistryViewCountry = code;
        },
      });
      if (!result || result.ok === false || result.mounted !== true) {
        lastError = result && result.code || 'UI_V2_MOUNT_FAILED';
        failClosed(root);
        return { ok:false, code:lastError };
      }
      lastMount = { countryId:country || null, route:result.route || initialRoute || 'government', mounted:true };
      lastError = null;
      if (mountOptions.ministryId && g.OmegaUIV2App && typeof g.OmegaUIV2App.openMinistry === 'function') { if (!g.OmegaUIV2App.openMinistry(root, mountOptions.ministryId)) { lastError = 'UI_V2_MINISTRY_ROUTE_FAILED'; failClosed(root); return { ok:false, code:lastError }; } lastMount.route = 'ministry-detail'; }
      return { ok:true, countryId:country || null, result:result, route:lastMount.route || mountOptions.initialRoute || 'government' };
    } catch (error) {
      lastError = String(error && error.message || error || 'UI_V2_MOUNT_EXCEPTION');
      failClosed(root);
      return { ok:false, code:'UI_V2_MOUNT_EXCEPTION', message:lastError };
    }
  }
  function openOperationalConsole(ministryId) {
    var id = String(ministryId || '').trim();
    var result = { ok:false, code:'LEGACY_UI_DISCONNECTED', ministryId:id || null,
      message:'The retired operational UI is disconnected. Use actions available in the active UI v2 screen.' };
    if (typeof g.showOmegaNotification === 'function') {
      g.showOmegaNotification('LEGACY UI DISCONNECTED', result.message, 'warning');
    }
    return result;
  }
  function openRoute(route) {
    route=String(route||'').trim().toLowerCase();
    if(!enabled||!g.OmegaUIV2App)return false;
    if(route==='map'||route==='world'){var active=cabinetRoot();if(active&&active.getAttribute&&active.getAttribute(ACTIVE_ATTR)==='true'&&active.__omegaUIV2State)return !!g.OmegaUIV2App.navigate(active,'map');return true;}
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
    setV2CabinetActive(root, false);
    try {
      if (root && g.OmegaUIV2App && root.__omegaUIV2State && typeof g.OmegaUIV2App.unmount === 'function') {
        g.OmegaUIV2App.unmount(root);
      }
    } catch (_) {}
    if (root) {
      if (root.removeAttribute) {
        root.removeAttribute(ACTIVE_ATTR);
        root.removeAttribute('aria-busy');
      }
      if (root.style) {
        root.style.display = 'none';
        root.style.visibility = 'hidden';
        root.style.opacity = '0';
        root.style.pointerEvents = 'none';
      }
      if (root.setAttribute) root.setAttribute('aria-hidden', 'true');
    }
    var manager = g.OmegaLayerManager;
    if (manager) {
      manager.currentLayer = 0;
      if (Array.isArray(manager.layerStack)) manager.layerStack = [0];
    }
    var body = g.document && g.document.body;
    if (body) {
      if (body.setAttribute) body.setAttribute('data-active-layer', '0');
      if (body.classList && typeof body.classList.remove === 'function') body.classList.remove('modal-open');
    }
    var worldUi = g.document && g.document.getElementById('world-ui-root');
    if (worldUi && worldUi.style) {
      worldUi.style.filter = 'none';
      worldUi.style.opacity = '1';
      worldUi.style.pointerEvents = 'auto';
    }
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
    closeToWorldMap:closeToWorldMap,
    audit:audit
  });
})(typeof window !== 'undefined' ? window : globalThis);
