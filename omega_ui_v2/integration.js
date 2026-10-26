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
  function countryProfile(value) {
    var runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    if (runtime && typeof runtime.resolveCountry === 'function') {
      try { var profile = runtime.resolveCountry(value); if (profile) return profile; } catch (_) {}
    }
    var gateway = g.OmegaCountryDataGateway || (g.Omega && g.Omega.CountryDataGateway);
    if (gateway && typeof gateway.resolveCountry === 'function') {
      try { var resolved = gateway.resolveCountry(value); if (resolved) return resolved; } catch (_) {}
    }
    return null;
  }
  function canonicalCountry(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    var profile = countryProfile(raw);
    var identity = profile && (profile.identity || profile.country || profile);
    var code = String(profile && (profile.iso3 || profile.alpha3 || profile.cca3 || profile.countryIso3) ||
      identity && (identity.iso3 || identity.alpha3 || identity.cca3 || identity.countryIso3) || '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(code)) return code;
    try {
      var game = g.Game;
      var mapped = game && typeof game.getCountryId === 'function' ? String(game.getCountryId(raw) || '').trim().toUpperCase() : '';
      if (/^[A-Z]{3}$/.test(mapped)) return mapped;
      var mappedProfile = mapped ? countryProfile(mapped) : null;
      var mappedIdentity = mappedProfile && (mappedProfile.identity || mappedProfile.country || mappedProfile);
      var mappedIso3 = String(mappedProfile && (mappedProfile.iso3 || mappedProfile.alpha3 || mappedProfile.cca3) ||
        mappedIdentity && (mappedIdentity.iso3 || mappedIdentity.alpha3 || mappedIdentity.cca3 || mappedIdentity.countryIso3) || '').trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(mappedIso3)) return mappedIso3;
    } catch (_) {}
    return raw.toUpperCase();
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
      if (values[i] != null && String(values[i]).trim()) return canonicalCountry(values[i]);
    }
    return '';
  }
  function availableCountryOptions(country) {
    // Country browsing must not depend on whether a Home Ministry state bucket has
    // been initialized. The canonical runtime roster is the browseable-world source;
    // game-state keys and Home Ministry availability are additive fallbacks.
    var runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    var gateway = g.OmegaCountryDataGateway || g.Omega && g.Omega.CountryDataGateway;
    var engine = g.OmegaHomeMinistryEngine || g.Omega && g.Omega.HomeMinistry;
    var ids = [], seen = Object.create(null), labels = Object.create(null), aliasToIso3 = Object.create(null);
    var profiles = [];
    try {
      var listedProfiles = runtime && typeof runtime.listProfiles === 'function' ? runtime.listProfiles() : [];
      if (Array.isArray(listedProfiles)) profiles = listedProfiles;
    } catch (_) {}
    function aliasKey(value) { return String(value == null ? '' : value).trim().toUpperCase(); }
    function registerProfileAliases(profile) {
      if (!profile || typeof profile !== 'object') return;
      var identity = profile.identity || profile.country || profile;
      var iso3 = String(profile.iso3 || profile.alpha3 || profile.cca3 || profile.countryIso3 ||
        identity && (identity.iso3 || identity.alpha3 || identity.cca3 || identity.countryIso3) || '').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(iso3)) return;
      [
        profile.iso3, profile.alpha3, profile.cca3, profile.countryIso3,
        profile.countryCode, profile.countryId, profile.code, profile.id, profile.value,
        profile.numericCode, profile.numeric_code, profile.name, profile.officialName, profile.shortName,
        profile.economyKey, profile.populationKey,
        identity && identity.iso3, identity && identity.alpha3, identity && identity.cca3,
        identity && identity.countryIso3, identity && identity.countryCode, identity && identity.countryId,
        identity && identity.code, identity && identity.id, identity && identity.numericCode,
        identity && identity.name, identity && identity.officialName, identity && identity.shortName,
        identity && identity.economyKey, identity && identity.populationKey
      ].forEach(function (alias) {
        var key = aliasKey(alias);
        if (key) aliasToIso3[key] = iso3;
      });
      var label = identity && (identity.officialName || identity.name || identity.countryName) || iso3;
      if (!labels[iso3]) labels[iso3] = String(label);
    }
    profiles.forEach(registerProfileAliases);
    function codeOf(value) {
      var raw = value;
      if (value && typeof value === 'object') {
        var identity = value.identity || value.country || value;
        raw = value.iso3 || value.alpha3 || value.cca3 || value.countryIso3 ||
          identity && (identity.iso3 || identity.alpha3 || identity.cca3 || identity.countryIso3) ||
          value.countryCode || value.countryId || value.code || value.id || value.value || '';
      }
      var key = aliasKey(raw);
      var code = aliasToIso3[key] || canonicalCountry(raw);
      return /^[A-Z]{3}$/.test(code) ? code : '';
    }
    function add(value, label) {
      var code = codeOf(value);
      if (!code) return;
      if (!seen[code]) { seen[code] = true; ids.push(code); }
      if (label && !labels[code]) labels[code] = String(label);
    }
    var active = codeOf(country);
    if (active) add(active);
    profiles.forEach(function (profile) {
      var identity = profile && (profile.identity || profile.country || profile);
      add(profile, identity && (identity.officialName || identity.name || identity.countryName));
    });
    try {
      var additional = engine && typeof engine.getAvailableCountries === 'function' ? engine.getAvailableCountries(country) : [];
      if (Array.isArray(additional)) additional.forEach(function (value) { add(value); });
    } catch (_) {}
    // Existing game buckets can contain a country before it has a fully hydrated
    // canonical profile. Include only resolvable ISO-3 identities, never arbitrary keys.
    var state = g.Game && g.Game.state || g.gameState || {};
    ['resource','resources','economy','population','finance','transport','trade','government','foreign','military'].forEach(function (key) {
      var bucket = state && state[key];
      if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return;
      Object.keys(bucket).forEach(function (value) { add(value); });
    });
    if (active && seen[active]) {
      ids = [active].concat(ids.filter(function (id) { return id !== active; }));
    }
    var otherIds = ids.filter(function (id) { return id !== active; });
    otherIds.sort(function (a, b) {
      var aLabel = labels[a], bLabel = labels[b];
      if (!aLabel) {
        try { var aProfile = runtime && runtime.resolveCountry ? runtime.resolveCountry(a) : null;
          var aIdentity = aProfile && (aProfile.identity || aProfile.country || aProfile);
          aLabel = aIdentity && (aIdentity.officialName || aIdentity.name || aIdentity.countryName) || a;
        } catch (_) { aLabel = a; }
      }
      if (!bLabel) {
        try { var bProfile = runtime && runtime.resolveCountry ? runtime.resolveCountry(b) : null;
          var bIdentity = bProfile && (bProfile.identity || bProfile.country || bProfile);
          bLabel = bIdentity && (bIdentity.officialName || bIdentity.name || bIdentity.countryName) || b;
        } catch (_) { bLabel = b; }
      }
      return String(aLabel).localeCompare(String(bLabel)) || a.localeCompare(b);
    });
    ids = active && seen[active] ? [active].concat(otherIds) : otherIds;
    return ids.map(function (id) {
      var label = labels[id] || id;
      try {
        var resolved = gateway && typeof gateway.resolveCountry === 'function' ? gateway.resolveCountry(id) : null;
        if (!resolved) resolved = runtime && typeof runtime.resolveCountry === 'function' ? runtime.resolveCountry(id) : null;
        var identity = resolved && (resolved.identity || resolved.country || resolved);
        label = String(identity && (identity.officialName || identity.name || identity.countryName) || label) + ' (' + id + ')';
      } catch (_) { label = label + ' (' + id + ')'; }
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
    var country = canonicalCountry(mountOptions.countryId || selectedCountry() || '');
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
          var code = canonicalCountry(id);
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
  // Central compatibility guard: any old caller that requests Cabinet or ministry
  // layers is redirected into UI v2. It cannot reach OmegaCabinetUI.renderCabinet or
  // renderMinistryDashboard, even if a forgotten legacy button still invokes setLayer.
  function installLegacyLayerBridge() {
    var manager = g.OmegaLayerManager;
    if (!manager || typeof manager.setLayer !== 'function') return false;
    if (manager.__omegaUIV2LayerBridgeInstalled === true) return true;
    var originalSetLayer = manager.setLayer;
    var originalPopLayer = typeof manager.popLayer === 'function' ? manager.popLayer : null;
    manager.setLayer = function (layerNum, data) {
      var target = Number(layerNum);
      var api = g.OmegaUIV2Integration;
      if (api) {
        var root = cabinetRoot();
        var activeV2 = !!(root && root.getAttribute && root.getAttribute(ACTIVE_ATTR) === 'true' && root.__omegaUIV2State);
        if (target === 0 && activeV2) {
          return api.closeToWorldMap() === true;
        }
        if (target === 1) {
          return api.isEnabled() ? api.openRoute('government') === true : false;
        }
        if (target === 2 || target === 3) {
          if (!api.isEnabled()) return false;
          var ministryId = data && (data.ministryId || data.ministry_id || data.id);
          if (ministryId) {
            if (activeV2 && g.OmegaUIV2App && typeof g.OmegaUIV2App.openMinistry === 'function') {
              return g.OmegaUIV2App.openMinistry(root, ministryId) === true;
            }
            var mounted = api.mountIntoCabinet(root, { initialRoute:'government', ministryId:ministryId });
            return !!(mounted && mounted.ok);
          }
          return api.openRoute('government') === true;
        }
      }
      return originalSetLayer.apply(this, arguments);
    };
    if (originalPopLayer) {
      manager.popLayer = function () {
        var api = g.OmegaUIV2Integration;
        var root = cabinetRoot();
        var activeV2 = !!(root && root.getAttribute && root.getAttribute(ACTIVE_ATTR) === 'true' && root.__omegaUIV2State);
        if (activeV2 && api && g.OmegaUIV2App && typeof g.OmegaUIV2App.back === 'function') {
          return g.OmegaUIV2App.back(root) === true;
        }
        return originalPopLayer.apply(this, arguments);
      };
      manager.__omegaUIV2OriginalPopLayer = originalPopLayer;
    }
    manager.__omegaUIV2LayerBridgeInstalled = true;
    manager.__omegaUIV2OriginalSetLayer = originalSetLayer;
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
    installLegacyLayerBridge:installLegacyLayerBridge,
    audit:audit
  });
  installLegacyLayerBridge();
})(typeof window !== 'undefined' ? window : globalThis);
