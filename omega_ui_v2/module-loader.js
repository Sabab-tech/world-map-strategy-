/* OMEGA UI v2 route-scoped screen module loader.
 * Core simulation and data authorities remain in the ordered application shell.
 * Only presentation renderers are fetched and evaluated when their route is opened.
 */
(function (g) {
  'use strict';

  var MODULE_EXPORTS = Object.freeze({
    'omega_ui_v2/screens/government.js':'OmegaUIV2Government',
    'omega_ui_v2/screens/ministry-detail.js':'OmegaUIV2MinistryDetail',
    'omega_ui_v2/screens/economy.js':'OmegaUIV2Economy',
    'omega_ui_v2/screens/resource-ministry.js':'OmegaUIV2ResourceMinistry',
    'omega_ui_v2/screens/mine-detail.js':'OmegaUIV2MineDetail',
    'omega_ui_v2/screens/industry.js':'OmegaUIV2Industry',
    'omega_ui_v2/screens/home-affairs.js':'OmegaUIV2HomeAffairs',
    'omega_ui_v2/screens/police-fleet.js':'OmegaUIV2PoliceFleet',
    'omega_ui_v2/screens/reports.js':'OmegaUIV2Reports',
    'omega_ui_v2/screens/autonomous-development.js':'OmegaUIV2AutonomousDevelopment'
  });

  function unique(files) {
    var seen = Object.create(null), output = [];
    files.forEach(function (file) {
      if (!seen[file]) { seen[file] = true; output.push(file); }
    });
    return output;
  }

  function modulesForContext(context) {
    context = context || {};
    var route = String(context.route || 'map').trim().toLowerCase();
    var ministry = String(context.ministryId || '').trim().toLowerCase();
    var files = [];

    if (route === 'government') files.push('omega_ui_v2/screens/government.js');
    else if (route === 'economy') files.push('omega_ui_v2/screens/economy.js');
    else if (route === 'industry' || (route === 'ministry-detail' && ministry === 'production')) {
      files.push('omega_ui_v2/screens/industry.js');
    } else if (route === 'home-affairs' || (route === 'ministry-detail' && ministry === 'interior_security')) {
      files.push('omega_ui_v2/screens/home-affairs.js', 'omega_ui_v2/screens/police-fleet.js');
    } else if (route === 'resources' || (route === 'ministry-detail' && ministry === 'energy_mining')) {
      files.push('omega_ui_v2/screens/resource-ministry.js');
    } else if (route === 'mine-detail') {
      files.push('omega_ui_v2/screens/resource-ministry.js', 'omega_ui_v2/screens/mine-detail.js');
    } else if (route === 'reports') files.push('omega_ui_v2/screens/reports.js');
    else if (route === 'autonomous-development') files.push('omega_ui_v2/screens/autonomous-development.js');
    else if (route === 'ministry-detail') {
      files.push(
        'omega_ui_v2/screens/government.js',
        'omega_ui_v2/screens/economy.js',
        'omega_ui_v2/screens/ministry-detail.js'
      );
    }
    return unique(files);
  }

  function createLoader(options) {
    options = options || {};
    var doc = options.document || g.document || null;
    var baseUrl = String(options.baseUrl || './').replace(/\/?$/, '/');
    var loaded = Object.create(null);
    var inFlight = Object.create(null);
    var failureCount = 0;

    function isReady(file) {
      if (typeof options.isReady === 'function') return options.isReady(file) === true;
      var exportName = MODULE_EXPORTS[file];
      var api = exportName && g[exportName];
      return !!(api && typeof api.render === 'function');
    }

    function loadFile(file) {
      if (loaded[file] || isReady(file)) {
        loaded[file] = true;
        return Promise.resolve(file);
      }
      if (inFlight[file]) return inFlight[file];
      if (!doc || typeof doc.createElement !== 'function' || !doc.head ||
          typeof doc.head.appendChild !== 'function') {
        return Promise.reject(new Error('UI_MODULE_LOADER_DOCUMENT_UNAVAILABLE:' + file));
      }
      var script = doc.createElement('script');
      script.src = baseUrl + file;
      script.async = false;
      if (script.setAttribute) script.setAttribute('data-omega-lazy-module', file);
      script.__omegaLazyModule = file;

      var pending = new Promise(function (resolve, reject) {
        script.onload = function () {
          delete inFlight[file];
          if (!isReady(file)) {
            failureCount += 1;
            reject(new Error('UI_SCREEN_MODULE_REGISTER_FAILED:' + file));
            return;
          }
          loaded[file] = true;
          resolve(file);
        };
        script.onerror = function () {
          delete inFlight[file];
          failureCount += 1;
          try { if (script.parentNode) script.parentNode.removeChild(script); } catch (_) {}
          reject(new Error('UI_SCREEN_MODULE_LOAD_FAILED:' + file));
        };
      });
      inFlight[file] = pending;
      doc.head.appendChild(script);
      return pending;
    }

    function loadModules(files) {
      var rows = unique(Array.isArray(files) ? files : []);
      return rows.reduce(function (chain, file) {
        return chain.then(function () { return loadFile(file); });
      }, Promise.resolve()).then(function () { return rows.slice(); });
    }

    function loadForContext(context) {
      return loadModules(modulesForContext(context));
    }

    function isLoadedForContext(context) {
      return modulesForContext(context).every(function (file) {
        return loaded[file] === true || isReady(file);
      });
    }

    function diagnostics() {
      return {
        loadedCount:Object.keys(loaded).length,
        loadedModules:Object.keys(loaded),
        inFlightCount:Object.keys(inFlight).length,
        inFlightModules:Object.keys(inFlight),
        failureCount:failureCount
      };
    }

    return Object.freeze({
      loadModules:loadModules,
      loadForContext:loadForContext,
      isLoadedForContext:isLoadedForContext,
      diagnostics:diagnostics
    });
  }

  var defaultLoader = createLoader();
  var api = Object.freeze({
    version:'1.0.0',
    modulesForContext:modulesForContext,
    createLoader:createLoader,
    loadForContext:defaultLoader.loadForContext,
    loadModules:defaultLoader.loadModules,
    isLoadedForContext:defaultLoader.isLoadedForContext,
    diagnostics:defaultLoader.diagnostics
  });
  g.OmegaUIV2ModuleLoader = api;
  g.Omega = g.Omega || {};
  g.Omega.UIV2ModuleLoader = api;
})(typeof window !== 'undefined' ? window : globalThis);
