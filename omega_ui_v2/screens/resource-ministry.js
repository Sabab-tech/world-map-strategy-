/* OMEGA UI v2 resource/mining view model and renderer.
 * It does not mint resource totals or execute extraction/shipment actions.
 */
(function (g) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function fmt(value, digits) {
    var n = numberOrNull(value);
    return n === null ? 'Not recorded' : n.toLocaleString('en-US', { maximumFractionDigits: digits === undefined ? 2 : digits });
  }

  function key(value) {
    return String(value == null ? '' : value).trim().toUpperCase();
  }

  function siteId(row) {
    return String(row && (row.siteId || row.siteReferenceKey || row.id) || '').trim();
  }

  function countryId(row) {
    var value = key(row && (row.countryId || row.countryCode || row.identity && row.identity.countryIso3 || row.sourceSiteRecord && row.sourceSiteRecord.countryCode) || '');
    if (!value || /^[A-Z]{3}$/.test(value)) return value;
    return selectedCountryKey(value);
  }

  function selectedCountryKey(value) {
    var requested = key(value);
    if (!requested) return '';
    // Map/legacy ministry controls may pass a display name (for example BANGLADESH),
    // while authoritative mine/site records use ISO3 (BGD). Resolve the identity once
    // before filtering so a valid country never gets an empty resource screen.
    var runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    if (runtime && typeof runtime.resolveCountry === 'function') {
      try {
        var profile = runtime.resolveCountry(value);
        // Country Runtime countryCode is ISO2 (BD), while resource registries use ISO3 (BGD).
        // Prefer explicit alpha-3 identity keys before the shorter countryCode fallback.
        var resolved = key(profile && (profile.iso3 || profile.alpha3 || profile.cca3 ||
          profile.identity && profile.identity.countryIso3 || profile.countryId ||
          profile.countryCode || profile.identity && profile.identity.countryCode));
        if (resolved) return resolved;
      } catch (_) {}
    }
    var game = g.Game;
    if (game && typeof game.getCountryId === 'function') {
      try {
        var resolvedId = key(game.getCountryId(value));
        if (resolvedId) return resolvedId;
      } catch (_) {}
    }
    return requested;
  }

  function authoritativeGameState() {
    var runtime = g.Omega && (g.Omega.SimulationRuntime || g.Omega.Simulation);
    var simulationState = runtime && runtime.world && runtime.world.state;
    if (simulationState && typeof simulationState === 'object') return simulationState;
    if (g.Game && g.Game.state && typeof g.Game.state === 'object') return g.Game.state;
    return g.gameState && typeof g.gameState === 'object' ? g.gameState : {};
  }

  function activePlayerCountryKey(state) {
    state = state && typeof state === 'object' ? state : authoritativeGameState();
    var runtime = g.Omega && (g.Omega.SimulationRuntime || g.Omega.Simulation);
    var values = [
      state.simulation && state.simulation.session && state.simulation.session.playerCountryId,
      state.simulation && state.simulation.playerCountryId,
      state.playerCountryId,
      g.Game && g.Game.playerCountryId
    ];
    try {
      if (runtime && typeof runtime.getPlayerCountryId === 'function') values.unshift(runtime.getPlayerCountryId());
    } catch (_) {}
    for (var i = 0; i < values.length; i += 1) {
      if (values[i] != null && String(values[i]).trim()) return selectedCountryKey(values[i]);
    }
    return '';
  }

  function resourceId(row) {
    return String(row && (row.identity && (row.identity.resourceId || row.identity.resourceTypeId || row.identity.resourceName) ||
      row.sourceSiteRecord && (row.sourceSiteRecord.resourceId || row.sourceSiteRecord.resourceTypeId) ||
      row.resourceId || row.resourceTypeId || row.resId) || '').trim();
  }

  var RESOURCE_ICON_IDS = ["aragonite","basalt","bauxite","boron","chromite","coal","cobalt","construction_aggregate","copper","coral_aggregate","crude_oil","diamond","diatomite","dolomite","gold","granite","graphite","gypsum","ilmenite","iron_ore","limestone","lithium","magnesite","manganese","marble","natural_gas","nickel","niobium","oil_shale","phosphate","platinum","potash","rare_earth","ruby","rutile","salt","silica_sand","silver","tin","tungsten","uranium","zinc"];

  function resourceIconPath(value) {
    var id = String(value == null ? '' : value).trim().toLowerCase()
      .replace(/^res[_-]?type[:_\/-]?/, '')
      .replace(/[\s-]+/g, '_');
    if (RESOURCE_ICON_IDS.indexOf(id) < 0) return '';
    return 'assets/omega-industrial-icons-v1/resources/' + id.replace(/_/g, '-') + '.svg';
  }

  function resourceIconMarkup(value, label) {
    var path = resourceIconPath(value);
    var safeLabel = String(label || value || 'Resource');
    if (path) {
      return '<img class="omega-v2-resource-icon-image" src="' + esc(path) + '" loading="lazy" decoding="async" alt="' + esc(safeLabel) + ' resource icon" data-omega-v2-resource-icon="' + esc(String(value || '').toLowerCase()) + '">';
    }
    var normalized = String(value || '?').replace(/[_-]+/g, ' ').trim();
    var initials = normalized.split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join('') || '?';
    return '<span class="omega-v2-resource-icon--fallback" role="img" aria-label="' + esc(safeLabel) + ' resource icon">' + esc(initials) + '</span>';
  }

  // Route plans are configuration, not shipment events. Load only the selected country's shard.
  var logisticsRoutePlanCache = Object.create(null);
  var logisticsRoutePlanRequests = Object.create(null);
  var logisticsRouteShardRequests = Object.create(null);
  var logisticsRoutePlanWaiters = Object.create(null);
  var logisticsRoutePlanGenerations = Object.create(null);
  var logisticsRoutePlanControllers = Object.create(null);
  var logisticsRouteManifestRequest = null;

  function fetchLogisticsJson(path, signal) {
    if (typeof g.fetch !== 'function') return Promise.reject(new Error('FETCH_UNAVAILABLE'));
    var scheduleTimeout = typeof g.setTimeout === 'function' ? g.setTimeout.bind(g) :
      (typeof setTimeout === 'function' ? setTimeout : null);
    var cancelTimeout = typeof g.clearTimeout === 'function' ? g.clearTimeout.bind(g) :
      (typeof clearTimeout === 'function' ? clearTimeout : null);
    if (!scheduleTimeout) return Promise.reject(new Error('LOGISTICS_REQUEST_TIMEOUT_UNAVAILABLE:' + path));
    var controller = typeof g.AbortController === 'function' ? new g.AbortController() : null;
    var requestOptions = { cache: 'force-cache' };
    if (controller) requestOptions.signal = controller.signal;
    else if (signal) requestOptions.signal = signal;
    var timeoutHandle = null;
    var abortListener = null;
    var request = Promise.resolve().then(function () {
      if (signal && signal.aborted) {
        var aborted = new Error('LOGISTICS_DATA_REQUEST_ABORTED:' + path);
        aborted.name = 'AbortError';
        throw aborted;
      }
      return g.fetch('./' + path, requestOptions);
    }).then(function (response) {
      if (!response || response.ok === false) throw new Error('LOGISTICS_DATA_REQUEST_FAILED:' + path);
      return response.json();
    });
    var timeout = new Promise(function (_, reject) {
      timeoutHandle = scheduleTimeout(function () {
        try { if (controller) controller.abort(); } catch (_) {}
        reject(new Error('LOGISTICS_DATA_REQUEST_TIMEOUT:' + path));
      }, 15000);
    });
    var races = [request, timeout];
    if (signal) {
      var abortedRequest = new Promise(function (_, reject) {
        abortListener = function () {
          try { if (controller) controller.abort(); } catch (_) {}
          var error = new Error('LOGISTICS_DATA_REQUEST_ABORTED:' + path);
          error.name = 'AbortError';
          reject(error);
        };
        if (signal.aborted) abortListener();
        else if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', abortListener, { once:true });
      });
      races.push(abortedRequest);
    }
    return Promise.race(races).finally(function () {
      if (timeoutHandle !== null && cancelTimeout) {
        try { cancelTimeout(timeoutHandle); } catch (_) {}
      }
      if (signal && abortListener && typeof signal.removeEventListener === 'function') {
        try { signal.removeEventListener('abort', abortListener); } catch (_) {}
      }
    });
  }

  function getLogisticsRouteManifest() {
    if (!logisticsRouteManifestRequest) {
      var sharedRequest = fetchLogisticsJson('resource_site_logistics_routes_v1.json').catch(function (error) {
        if (logisticsRouteManifestRequest === sharedRequest) logisticsRouteManifestRequest = null;
        throw error;
      });
      logisticsRouteManifestRequest = sharedRequest;
    }
    return logisticsRouteManifestRequest;
  }

  function getLogisticsRoutePlanState(countryValue) {
    var country = key(countryValue);
    if (!/^[A-Z]{3}$/.test(country)) return { status:'unavailable', routes:[] };
    if (Object.prototype.hasOwnProperty.call(logisticsRoutePlanCache, country)) return logisticsRoutePlanCache[country];
    return { status:typeof g.fetch === 'function' ? 'idle' : 'unavailable', routes:[] };
  }

  function notifyLogisticsRoutePlanWaiters(country) {
    var waiters = logisticsRoutePlanWaiters[country] || [];
    delete logisticsRoutePlanWaiters[country];
    waiters.forEach(function (root) {
      if (!root || root.__omegaV2ResourceActive === false || root.__omegaV2ResourceTab !== 'logistics' ||
          key(root.__omegaV2CurrentCountryKey) !== country || !root.__omegaV2ResourceOptions) return;
      scheduleRender(root, Object.assign({}, root.__omegaV2ResourceOptions, {
        countryId:country, tab:'logistics'
      }), 'Loading mine site route plans');
    });
  }

  function ensureLogisticsRoutePlans(countryValue, root) {
    var country = key(countryValue);
    if (!/^[A-Z]{3}$/.test(country)) return Promise.resolve({ status:'unavailable', routes:[] });
    if (Object.prototype.hasOwnProperty.call(logisticsRoutePlanCache, country)) {
      return Promise.resolve(logisticsRoutePlanCache[country]);
    }
    if (root) {
      if (!logisticsRoutePlanWaiters[country]) logisticsRoutePlanWaiters[country] = [];
      if (logisticsRoutePlanWaiters[country].indexOf(root) < 0) logisticsRoutePlanWaiters[country].push(root);
    }
    if (logisticsRoutePlanRequests[country]) return logisticsRoutePlanRequests[country];
    if (typeof g.fetch !== 'function') {
      logisticsRoutePlanCache[country] = { status:'unavailable', routes:[] };
      notifyLogisticsRoutePlanWaiters(country);
      return Promise.resolve(logisticsRoutePlanCache[country]);
    }
    var manifestRequest = getLogisticsRouteManifest();
    var generation = Number(logisticsRoutePlanGenerations[country]) || 0;
    var controller = typeof g.AbortController === 'function' ? new g.AbortController() : null;
    if (controller) logisticsRoutePlanControllers[country] = controller;
    function hasActiveWaiter() {
      return (logisticsRoutePlanWaiters[country] || []).some(function (waiter) {
        return waiter && waiter.__omegaV2ResourceActive !== false &&
          key(waiter.__omegaV2CurrentCountryKey) === country;
      });
    }
    var request = manifestRequest.then(function (manifest) {
      // The manifest is shared and cheap. Do not fetch a large country shard
      // after every screen that requested it has already been unloaded.
      if ((Number(logisticsRoutePlanGenerations[country]) || 0) !== generation || !hasActiveWaiter()) {
        return { status:'unloaded', routes:[] };
      }
      if (!manifest || manifest.datasetId !== 'OMEGA_RESOURCE_SITE_LOGISTICS_ROUTES_V1' ||
          manifest.simulationOnly !== true || !manifest.countryToPart || !Array.isArray(manifest.parts)) {
        throw new Error('LOGISTICS_ROUTE_MANIFEST_INVALID');
      }
      var partNumber = manifest.countryToPart[country];
      if (partNumber === undefined || partNumber === null) return { status:'ready', routes:[] };
      var partInfo = manifest.parts.find(function (part) {
        return String(part.part) === String(partNumber) || String(part.file) === String(partNumber);
      });
      var file = String(partInfo && partInfo.file || '');
      if (!/^resource_site_logistics_routes_v1_part_0[1-6]\.json$/.test(file)) {
        throw new Error('LOGISTICS_ROUTE_SHARD_INVALID');
      }
      // Parse the shared shard temporarily, but retain only the selected country's
      // routes in memory. This prevents inactive countries' route rows from lingering.
      return fetchLogisticsJson(file, controller && controller.signal).then(function (shard) {
        if (!shard || !Array.isArray(shard.routes)) throw new Error('LOGISTICS_ROUTE_SHARD_INVALID');
        var routes = shard.routes.filter(function (route) {
          return key(route && route.countryId) === country &&
            String(route.siteId || '').trim() && String(route.resourceId || '').trim() &&
            route.routePlan && typeof route.routePlan === 'object';
        }).slice().sort(function (a, b) {
          return String(a.siteName || a.siteId).localeCompare(String(b.siteName || b.siteId));
        });
        return { status:'ready', routes:routes };
      });
    }).catch(function (error) {
      if (error && error.name === 'AbortError') return { status:'unloaded', routes:[] };
      return { status:'unavailable', routes:[] };
    }).then(function (result) {
      var waiters = logisticsRoutePlanWaiters[country] || [];
      var activeWaiter = waiters.some(function (waiter) {
        return waiter && waiter.__omegaV2ResourceActive !== false &&
          key(waiter.__omegaV2CurrentCountryKey) === country;
      });
      if ((Number(logisticsRoutePlanGenerations[country]) || 0) !== generation || !activeWaiter) {
        if (logisticsRoutePlanRequests[country] === request) delete logisticsRoutePlanRequests[country];
        if (logisticsRoutePlanControllers[country] === controller) delete logisticsRoutePlanControllers[country];
        return { status:'unloaded', routes:[] };
      }
      logisticsRoutePlanCache[country] = result;
      if (logisticsRoutePlanRequests[country] === request) delete logisticsRoutePlanRequests[country];
      if (logisticsRoutePlanControllers[country] === controller) delete logisticsRoutePlanControllers[country];
      notifyLogisticsRoutePlanWaiters(country);
      return result;
    });
    logisticsRoutePlanRequests[country] = request;
    return request;
  }
  function mineArchetype(site) {
    site = site && typeof site === 'object' ? site : {};
    var identity = site.identity && typeof site.identity === 'object' ? site.identity : {};
    var location = site.location && typeof site.location === 'object' ? site.location : {};
    var textValue = [
      site.siteType, site.extractionMethod, site.method, site.extractionMode, site.siteName, site.name,
      site.resourceId, site.resourceTypeId, identity.resourceTypeId, location.siteType
    ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g, ' ');
    if (/offshore|platform|marine field|subsea|floating production/.test(textValue)) return 'OFFSHORE_PLATFORM';
    if (/underground|deep shaft|subterranean|shaft mine|tunnel mine/.test(textValue)) return 'UNDERGROUND_MINE';
    if (/quarry|open quarry|stone pit|aggregate pit/.test(textValue)) return 'QUARRY';
    if (/crude oil|natural gas|oil field|gas field|petroleum|wellhead|drilling well/.test(textValue)) return 'OIL_GAS_FIELD';
    return 'OPEN_PIT';
  }

  function mineArchetypeLabel(site) {
    var labels = {
      OPEN_PIT: 'Open-pit mine',
      UNDERGROUND_MINE: 'Underground mine',
      QUARRY: 'Quarry',
      OIL_GAS_FIELD: 'Oil & gas field',
      OFFSHORE_PLATFORM: 'Offshore platform'
    };
    return labels[mineArchetype(site)] || labels.OPEN_PIT;
  }

  function mineArchetypeMarkup(site) {
    var kind = mineArchetype(site);
    var motifs = {
      OPEN_PIT: '<path d="M3 25h26M5 23h6v-4h6v-4h6V8h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m18 8 5-3 4 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      UNDERGROUND_MINE: '<path d="M3 26h26M6 25V15h20v10M10 15V6h12v9M13 6V3h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M11 20h3m4 0h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      QUARRY: '<path d="M2 29h28M3 26h6v-4h6v-4h6v-4h7V6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 26h5v-4h6v-4h6v-4h7V7l2-2" fill="currentColor" opacity=".18"/><path d="M7 22h7v-4h6v-4h7V9" fill="none" stroke="currentColor" stroke-opacity=".8" stroke-width="1.2"/><path d="M5 24h8l2 2H5zM15 24h8l2 2h-8z" fill="currentColor" opacity=".85"/><circle cx="8" cy="27" r="1.2" fill="currentColor"/><circle cx="18" cy="27" r="1.2" fill="currentColor"/><path d="M24 8h6M26 5h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
      OIL_GAS_FIELD: '<path d="M4 25h24M8 24l5-12 5 12M13 12l11-5m-8-2 8 2-2 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="7" r="2" fill="currentColor"/>',
      OFFSHORE_PLATFORM: '<path d="M3 26h26M5 23l3-5h16l3 5M10 18V9h12v9M13 9V5h6v4M16 5V3M3 29c3-2 5-2 8 0s5 2 8 0 5-2 8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    };
    return '<span class="omega-v2-mine-kind-art" data-mine-archetype="' + kind + '" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false">' + (motifs[kind] || motifs.OPEN_PIT) + '</svg></span>';
  }

  function uniqueSiteRows(rows) {
    var byId = Object.create(null);
    var physicalKeys = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var id = siteId(row), cid = countryId(row), rid = resourceId(row);
      var alias = row && (row.runtime && row.runtime.aliasOfSiteId ||
        row.map && row.map.aliasOfSiteId || row.identity && row.identity.aliasOfSiteId);
      if (!id || !cid || !rid || alias) return;
      var coords = row.location && row.location.coordinates || row.coordinates || row.map && row.map.coordinates || {};
      var lat = numberOrNull(coords.lat !== undefined ? coords.lat : coords.latitude);
      var lng = numberOrNull(coords.lng !== undefined ? coords.lng : coords.longitude);
      var normName = String(row.siteName || row.name || id).normalize('NFKD')
        .replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      var physicalKey = cid + '|' + String(rid).toLowerCase().replace(/[\s-]+/g, '_') + '|' + normName +
        (lat !== null && lng !== null ? '|' + lat.toFixed(5) + '|' + lng.toFixed(5) : '');
      if (Object.prototype.hasOwnProperty.call(byId, id)) return;
      if (Object.prototype.hasOwnProperty.call(physicalKeys, physicalKey)) return;
      byId[id] = row;
      physicalKeys[physicalKey] = id;
    });
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) {
      return String(a.siteName || a.name || siteId(a)).localeCompare(String(b.siteName || b.name || siteId(b)));
    });
  }
  function sourceCatalogs(selectedCountry) {
    var rows = [];
    var countryFilter = selectedCountryKey(selectedCountry);
    if (!countryFilter) return rows;
    function appendCountry(sites) {
      if (!Array.isArray(sites)) return;
      for (var i = 0; i < sites.length; i += 1) {
        if (countryId(sites[i]) === countryFilter) rows.push(sites[i]);
      }
    }
    var canonical = g.OmegaResourceSiteCanonicalCatalogData || (g.Omega && g.Omega.ResourceSiteCanonicalCatalogData);
    var binding = g.OmegaIndividualResourceSiteBinding || (g.Omega && g.Omega.IndividualResourceSiteBinding);
    if (canonical && Array.isArray(canonical.sites)) appendCountry(canonical.sites);
    if (binding && Array.isArray(binding.sites)) appendCountry(binding.sites);
    // The endowment reference view is read only for the requested country. This
    // fills gaps without activating any foreign country's production runtime.
    var endowment = g.OmegaResourceEndowmentRuntime || (g.Omega && g.Omega.ResourceEndowmentRuntime);
    if (endowment && typeof endowment.countryMineSiteReferences === 'function') {
      try { appendCountry(endowment.countryMineSiteReferences(countryFilter)); } catch (_) {}
    }
    return uniqueSiteRows(rows);
  }
  function observedMetric(metric) {
    metric = metric && typeof metric === 'object' ? metric : {};
    var value = numberOrNull(metric.quantity !== undefined ? metric.quantity : metric.annual !== undefined ? metric.annual : metric.rate);
    var status = String(metric.status || 'UNOBSERVED').toUpperCase();
    var observed = ['OBSERVED', 'OBSERVED_ATTRIBUTABLE', 'REPORTED', 'MEASURED'].indexOf(status) >= 0;
    return {
      value: observed ? value : null,
      unit: String(metric.unit || metric.annualUnit || 'unit not recorded'),
      status: status,
      modeledValue: status === 'SIMULATED' || status === 'MODELED' ? value : null,
      basis: String(metric.measurementBasis || metric.basis || 'Not recorded')
    };
  }

  function buildViewModel(options) {
    options = options || {};
    var selectedCountry = selectedCountryKey(options.countryId || '');
    var rows;
    if (Array.isArray(options.sites)) {
      var providedRows = options.sites;
      rows = selectedCountry
        ? uniqueSiteRows(providedRows.filter(function (row) { return countryId(row) === selectedCountry; }))
        : [];
    } else {
      rows = sourceCatalogs(selectedCountry);
    }
    var items = rows.map(function (row) {
      var reserve = observedMetric(row.quantitative && row.quantitative.reserve || row.reserve);
      var production = observedMetric(row.quantitative && row.quantitative.production || row.production);
      var modeledReserveRaw = row.simulation && row.simulation.reserve || (row.reserve && String(row.reserve.status || '').toUpperCase() === 'SIMULATED' ? row.reserve : null);
      var modeledReserve = modeledReserveRaw ? observedMetric(Object.assign({ status: 'SIMULATED' }, modeledReserveRaw)) : null;
      var inventory = null;
      if (typeof options.getInventoryForSite === 'function') {
        try { inventory = options.getInventoryForSite(siteId(row)); } catch (_) { inventory = null; }
      }
      var inventoryKnown = inventory && typeof inventory === 'object' && numberOrNull(inventory.quantity) !== null;
      var rawStatus = row.operation && (row.operation.status || row.operation.realWorldStatus) || row.status || row.sourceSiteRecord && row.sourceSiteRecord.status;
      return {
        siteId: siteId(row),
        countryId: countryId(row),
        resourceId: resourceId(row),
        name: String(row.siteName || row.name || siteId(row) || 'Unnamed registered site'),
        location: String(row.location && (row.location.region || row.location.area || row.location.locality) ||
          row.region || row.province || row.sourceSiteRecord && (row.sourceSiteRecord.region || row.sourceSiteRecord.province) || 'Not recorded'),
        status: String(rawStatus || 'UNOBSERVED').toUpperCase(),
        reserve: reserve,
        modeledReserve: modeledReserve,
        production: production,
        stock: inventoryKnown ? { quantity: numberOrNull(inventory.quantity), unit: String(inventory.unit || 'unit not recorded'), source: String(inventory.source || 'inventory adapter') } : null,
        coordinates: row.coordinates || row.location && row.location.coordinates || row.map && row.map.coordinates || null,
        source: String(row.provenance && (row.provenance.source || row.provenance.sourceDataset) ||
          row.sourceSiteRecord && (row.sourceSiteRecord.provenance || row.sourceSiteRecord.source) || 'Not recorded'),
        raw: row
      };
    });
    var byStatus = Object.create(null);
    items.forEach(function (item) { byStatus[item.status] = (byStatus[item.status] || 0) + 1; });
    return {
      ready: items.length > 0,
      countryId: selectedCountry || null,
      siteCount: items.length,
      statusCounts: byStatus,
      sites: items,
      emptyReason: items.length ? null : (selectedCountry ? 'NO_REGISTERED_SITES_FOR_SELECTED_COUNTRY' : 'CANONICAL_SITE_CATALOG_UNAVAILABLE_OR_EMPTY')
    };
  }

  function countryRoster(currentCountry) {
    var rows = Object.create(null);
    function add(rawId, rawName) {
      var id = selectedCountryKey(rawId);
      if (!/^[A-Z]{3}$/.test(id)) return;
      var name = String(rawName || '').trim();
      if (!name || name.toUpperCase() === id) name = id;
      if (!rows[id] || rows[id].name === id) rows[id] = { id:id, name:name };
    }
    var engine = g.ResourceMinistryEngine;
    var profiles = engine && engine.countryProfiles;
    if (profiles && typeof profiles === 'object') {
      Object.keys(profiles).forEach(function (rawId) {
        var profile = profiles[rawId] || {};
        var identity = profile.identity || profile.country || profile;
        add(identity.iso3 || identity.iso3Code || identity.alpha3 || identity.cca3 ||
          identity.countryId || identity.countryCode || rawId,
          identity.officialName || identity.countryName || identity.name || profile.officialName || profile.name || rawId);
      });
    }
    var canonical = g.OmegaResourceSiteCanonicalCatalogData || (g.Omega && g.Omega.ResourceSiteCanonicalCatalogData);
    var binding = g.OmegaIndividualResourceSiteBinding || (g.Omega && g.Omega.IndividualResourceSiteBinding);
    [canonical && canonical.sites, binding && binding.sites].forEach(function (sites) {
      if (!Array.isArray(sites)) return;
      sites.forEach(function (site) {
        var identity = site.identity || {};
        var location = site.location || {};
        add(site.countryId || identity.countryIso3 || site.countryCode,
          identity.countryName || identity.officialName || location.countryName || site.countryName || site.countryId);
      });
    });
    var gameState = g.Game && g.Game.state || g.gameState || {};
    [gameState.resource, gameState.resources].forEach(function (buckets) {
      if (!buckets || typeof buckets !== 'object') return;
      Object.keys(buckets).forEach(function (rawId) {
        var bucket = buckets[rawId] || {};
        add(rawId, bucket.countryName || bucket.identity && bucket.identity.countryName || rawId);
      });
    });
    add(currentCountry, rows[currentCountry] && rows[currentCountry].name || currentCountry);
    var result = Object.keys(rows).map(function (id) { return rows[id]; });
    var playerId = '';
    try {
      var sim = g.Omega && g.Omega.Simulation;
      if (sim && typeof sim.getPlayerCountryId === 'function') playerId = selectedCountryKey(sim.getPlayerCountryId());
    } catch (_) {}
    if (!playerId) {
      var st = g.Game && g.Game.state || g.gameState || {};
      playerId = selectedCountryKey(st.simulation && st.simulation.session && st.simulation.session.playerCountryId ||
        st.simulation && st.simulation.playerCountryId || st.playerCountryId || g.Game && g.Game.playerCountryId || '');
    }
    return result.sort(function (a, b) {
      if (a.id === currentCountry) return -1;
      if (b.id === currentCountry) return 1;
      if (a.id === playerId) return -1;
      if (b.id === playerId) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  function playerCountryDisplayName(currentCountry) {
    var profile = null, runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    try {
      if (runtime && typeof runtime.resolveCountry === 'function') profile = runtime.resolveCountry(currentCountry);
    } catch (_) {}
    if (!profile) {
      var engine = g.ResourceMinistryEngine;
      var profiles = engine && engine.countryProfiles;
      profile = profiles && (profiles[currentCountry] || profiles[String(currentCountry).toLowerCase()]) || null;
    }
    var identity = profile && (profile.identity || profile.country || profile) || {};
    return String(identity.officialName || identity.countryName || identity.name ||
      profile && (profile.officialName || profile.countryName || profile.name) || currentCountry || 'Not selected');
  }

  function countrySelectMarkup(currentCountry) {
    // Resolve only the selected player's identity; never enumerate the country roster.
    var name = playerCountryDisplayName(currentCountry);
    return '<div class="omega-v2-resource-country-select" aria-label="Active player country">' +
      '<span>Player country</span><strong>' + esc(name + (currentCountry ? ' (' + currentCountry + ')' : '')) + '</strong></div>';
  }

  function scheduleRender(root, options, label) {
    options = options || {};
    var scheduler = options.onScheduleRender;
    if (typeof scheduler === 'function') {
      return scheduler(function () { return render(root, options); }, label || 'Updating this section', root);
    }
    return render(root, options);
  }

  function render(root, options) {
    options = options || {};
    if (!root || typeof root !== 'object') return { ok:false, code:'RESOURCE_ROOT_REQUIRED' };
    root.__omegaV2ResourceActive = true;
    var stateRoot = authoritativeGameState();
    var playerCountry = activePlayerCountryKey(stateRoot);
    var requestedCountry = selectedCountryKey(options.countryId || playerCountry);
    // Once a player session exists, this screen is locked to that country.
    // Passive previews without a session remain available for tests and recovery.
    var countryKey = playerCountry || requestedCountry;
    if (playerCountry && requestedCountry && requestedCountry !== playerCountry) {
      root.__omegaV2ResourceNotice = 'Only the active player country is available in Resource Ministry.';
    }
    if (!countryKey) {
      root.innerHTML = '<section class="omega-v2-shell omega-v2-resource"><div class="omega-v2-empty" role="status">Select a player country before opening the resource inventory.</div></section>';
      return { ok:false, code:'PLAYER_COUNTRY_NOT_SELECTED' };
    }
    var renderOptions = Object.assign({}, options, { countryId:countryKey });
    var active = renderOptions.tab || root.__omegaV2ResourceTab || 'dashboard';
    if (active === 'reserves') active = 'mines';
    if (active === 'warehouses') active = 'inventory';
    if (active === 'transport') active = 'logistics';
    root.__omegaV2ResourceOptions = renderOptions;
    root.__omegaV2CurrentCountryKey = countryKey;
    root.__omegaV2ResourceTab = active;
    var startupBaselineForLoad = g.OmegaResourceStartupBaseline || g.Omega && g.Omega.ResourceStartupBaseline || null;
    if (startupBaselineForLoad && typeof startupBaselineForLoad.ensurePlayerCountryBaseline === 'function' &&
        root.__omegaV2ResourceLoadedCountry !== countryKey) {
      var sameRequest = root.__omegaV2ResourceLoadingCountry === countryKey && root.__omegaV2ResourceLoadPromise;
      var failedRequest = root.__omegaV2ResourceLoadFailedCountry === countryKey;
      if (!sameRequest && !failedRequest) {
        root.__omegaV2ResourceLoadGeneration = (Number(root.__omegaV2ResourceLoadGeneration) || 0) + 1;
        root.__omegaV2ResourceLoadFailedCountry = '';
        var loadGeneration = root.__omegaV2ResourceLoadGeneration;
        root.__omegaV2ResourceLoadingCountry = countryKey;
        root.__omegaV2ResourceLoadError = '';
        root.__omegaV2ResourceLoadPromise = Promise.resolve().then(function () {
          return startupBaselineForLoad.ensurePlayerCountryBaseline(countryKey);
        }).then(function (result) {
          if (root.__omegaV2ResourceActive === false ||
              root.__omegaV2ResourceLoadGeneration !== loadGeneration || root.isConnected === false) return result;
          var status = String(result && result.status || '').toUpperCase();
          var ready = ['COMPLETED','COMPLETED_WITH_REPORTED_GAPS','ALREADY_INITIALIZED','INITIALIZED','INITIALIZED_WITH_GAPS'].indexOf(status) >= 0;
          root.__omegaV2ResourceLoadingCountry = '';
          root.__omegaV2ResourceLoadPromise = null;
          if (ready) {
            root.__omegaV2ResourceLoadedCountry = countryKey;
            root.__omegaV2ResourceLoadStatus = status;
            root.__omegaV2ResourceLoadError = '';
            root.__omegaV2ResourceLoadFailedCountry = '';
          } else {
            root.__omegaV2ResourceLoadError = String(result && (result.reason || result.message || result.status) || 'PLAYER_COUNTRY_BASELINE_NOT_READY');
            root.__omegaV2ResourceLoadFailedCountry = countryKey;
          }
          var latest = Object.assign({}, root.__omegaV2ResourceOptions || renderOptions, {
            countryId:countryKey, tab:root.__omegaV2ResourceTab || active
          });
          if (typeof latest.onScheduleRender === 'function') scheduleRender(root, latest, 'Showing current player inventory');
          else render(root, latest);
          return result;
        }).catch(function (error) {
          if (root.__omegaV2ResourceActive === false || root.__omegaV2ResourceLoadGeneration !== loadGeneration) return null;
          root.__omegaV2ResourceLoadingCountry = '';
          root.__omegaV2ResourceLoadPromise = null;
          root.__omegaV2ResourceLoadError = String(error && error.message || error || 'PLAYER_COUNTRY_BASELINE_FAILED');
          root.__omegaV2ResourceLoadFailedCountry = countryKey;
          var latest = Object.assign({}, root.__omegaV2ResourceOptions || renderOptions, {
            countryId:countryKey, tab:root.__omegaV2ResourceTab || active
          });
          if (typeof latest.onScheduleRender === 'function') scheduleRender(root, latest, 'Resource inventory could not be loaded');
          else render(root, latest);
          return null;
        });
      }
    }
    var baselineLoading = root.__omegaV2ResourceLoadingCountry === countryKey;
    var baselineFailed = root.__omegaV2ResourceLoadFailedCountry === countryKey && !!root.__omegaV2ResourceLoadError;
    var model = buildViewModel(renderOptions);
    function countryBucket(map) {
      if (!map || typeof map !== 'object' || !countryKey) return null;
      if (map[countryKey]) return map[countryKey];
      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i += 1) if (keys[i].trim().toUpperCase() === countryKey) return map[keys[i]];
      return null;
    }
    function safeArray(value) { return Array.isArray(value) ? value : []; }
    function val(value) {
      if (value && typeof value === 'object') return numberOrNull(value.quantity !== undefined ? value.quantity :
        value.available !== undefined ? value.available : value.amount);
      return numberOrNull(value);
    }
    function human(value) {
      var text = String(value == null ? '' : value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) return 'Not recorded';
      var upper = text.toUpperCase();
      if (/UNOBSERVED|UNQUANTIFIED|UNKNOWN|NOT RECORDED|NOT AVAILABLE/.test(upper)) return 'Not recorded';
      if (/SIMULATED|MODELED|MODELLED|SCENARIO/.test(upper)) return 'Available';
      if (/NOT APPLICABLE/.test(upper)) return 'Unavailable';
      if (/ACTIVE PRODUCING|OPERATIONAL|ACTIVE|COMMISSIONED/.test(upper)) return 'Active';
      if (/UNDER CONSTRUCTION|PENDING|PLANNED/.test(upper)) return 'In progress';
      if (/DECOMMISSIONED|DESTROYED|STOPPED|INACTIVE|CLOSED/.test(upper)) return 'Stopped';
      if (/BLOCKED|SHORTAGE|AWAITING/.test(upper)) return 'Needs attention';
      return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }
    function resourceLabel(value) {
      var key = String(value == null ? '' : value).trim().toLowerCase();
      var meta = resourceCatalogById[key];
      if (meta && meta.name) return String(meta.name);
      return String(value == null ? '' : value).trim().replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, function (ch) { return ch.toUpperCase(); }) || 'Resource';
    }
    function amount(value, unit) {
      var n = numberOrNull(value);
      if (n === null) return '—';
      return fmt(n, 2) + (unit ? ' ' + String(unit) : '');
    }
    function compactBuildNumber(value) {
      var n = numberOrNull(value);
      if (n === null) return '—';
      var magnitude = Math.abs(n), divisor = 1, suffix = '';
      if (magnitude >= 1e12) { divisor = 1e12; suffix = 'T'; }
      else if (magnitude >= 1e9) { divisor = 1e9; suffix = 'B'; }
      else if (magnitude >= 1e6) { divisor = 1e6; suffix = 'M'; }
      else if (magnitude >= 1e3) { divisor = 1e3; suffix = 'K'; }
      if (!suffix) return fmt(n, 2);
      var scaled = n / divisor;
      var digits = Math.abs(scaled) < 10 ? 2 : (Math.abs(scaled) < 100 ? 1 : 0);
      return scaled.toLocaleString('en-US', { maximumFractionDigits: digits }) + suffix;
    }
    function buildDisplayUnit(unit) {
      var normalized = String(unit == null ? '' : unit).trim().replace(/[_-]+/g, ' ');
      if (!normalized || /SIMULATION.*UNIT/i.test(normalized)) return '';
      return normalized.toLowerCase().replace(/\b[a-z]/g, function (ch) { return ch.toUpperCase(); });
    }
    function buildResourceAmount(value, unit) {
      var n = numberOrNull(value);
      if (n === null) return '—';
      var displayUnit = buildDisplayUnit(unit);
      var precise = fmt(n, 2) + (displayUnit ? ' ' + displayUnit : '');
      return '<span class="omega-v2-build-amount" title="' + esc(precise) + '">' +
        esc(compactBuildNumber(n)) + (displayUnit ? ' ' + esc(displayUnit) : '') + '</span>';
    }
    function currentTurn() {
      return numberOrNull(stateRoot.simulation && (stateRoot.simulation.turn || stateRoot.simulation.currentTurn)) ||
        numberOrNull(stateRoot.turn) || 0;
    }
    function playerCountryKey() {
      return activePlayerCountryKey(stateRoot);
    }
    var canOperate = !!countryKey && countryKey === playerCountryKey();
    var gameResource = countryBucket(stateRoot.resource) || countryBucket(stateRoot.resources) || {};
    var gameEconomy = countryBucket(stateRoot.economy) || {};
    var countryFactoryAssets = safeArray(gameEconomy.productionAssets);
    var gameTrade = countryBucket(stateRoot.trade) || {};
    var industrial = gameResource.industrialNetwork && typeof gameResource.industrialNetwork === 'object' ? gameResource.industrialNetwork : {};
    var rawWarehouse = gameResource.warehouse && typeof gameResource.warehouse === 'object' ? gameResource.warehouse : {};
    var processedWarehouse = gameResource.processedWarehouse && typeof gameResource.processedWarehouse === 'object' ? gameResource.processedWarehouse : {};
    var inventoryRuntime = g.OmegaCountryInventoryRuntime || g.Omega && g.Omega.CountryInventoryRuntime || null;
    var canonicalResourceCatalog = [];
    try {
      if (inventoryRuntime && typeof inventoryRuntime.getResourceCatalog === 'function') {
        canonicalResourceCatalog = safeArray(inventoryRuntime.getResourceCatalog());
      }
      if (!canonicalResourceCatalog.length) {
        var startupBaseline = g.OmegaResourceStartupBaseline || g.Omega && g.Omega.ResourceStartupBaseline || null;
        if (startupBaseline && typeof startupBaseline.getResourceCatalog === 'function') {
          canonicalResourceCatalog = safeArray(startupBaseline.getResourceCatalog());
        }
      }
    } catch (_) { canonicalResourceCatalog = []; }
    var resourceCatalogById = Object.create(null);
    canonicalResourceCatalog.forEach(function (row) {
      var rid = String(row && (row.resourceId || row.id) || '').trim().toLowerCase();
      if (rid) resourceCatalogById[rid] = row;
    });
    var inventoryUnits = gameResource.inventoryUnits && typeof gameResource.inventoryUnits === 'object' ? gameResource.inventoryUnits : {};
    var inventory = gameResource.inventory && typeof gameResource.inventory === 'object' ? gameResource.inventory :
      gameResource.warehouseInventory && typeof gameResource.warehouseInventory === 'object' ? gameResource.warehouseInventory : {};
    var batchesRaw = Array.isArray(gameResource.batches) ? gameResource.batches :
      Array.isArray(inventory.batches) ? inventory.batches :
      Array.isArray(inventory.inventoryBatches) ? inventory.inventoryBatches :
      Array.isArray(gameResource.warehouseBatches) ? gameResource.warehouseBatches :
      Array.isArray(gameResource.stockBatches) ? gameResource.stockBatches : null;
    var inventoryRows = [];
    if (batchesRaw) {
      inventoryRows = batchesRaw.map(function (row) {
        return { batchId:row.batchId || row.id || '', resourceId:row.resourceId || row.materialId || row.commodity || '',
          quantity:val(row.availableQuantity !== undefined ? row.availableQuantity : row.quantity !== undefined ? row.quantity : row.amount),
          unit:row.unit || row.quantityUnit || '', location:row.warehouseId || row.warehouse || row.location || '',
          status:row.status || '', stage:String(row.stage || row.inventoryStage || row.materialStage || '').toUpperCase(), warehouseId:String(row.warehouseId || row.warehouse || row.location || '') };
      });
    }
    var inventoryLotsForOrigin = gameResource.inventoryLots && typeof gameResource.inventoryLots === 'object' ? gameResource.inventoryLots : {};
    var sourceBatchRows = [], sourceBatchIds = Object.create(null);
    safeArray(batchesRaw).concat(Object.keys(inventoryLotsForOrigin).map(function (key) {
      var row = inventoryLotsForOrigin[key];
      return row && typeof row === 'object' ? Object.assign({ batchId:key }, row) : null;
    })).forEach(function (row, index) {
      if (!row || typeof row !== 'object') return;
      var batchKey = String(row.batchId || row.id || 'UNKEYED:' + index);
      if (sourceBatchIds[batchKey] !== undefined) {
        // inventoryLots is the latest warehouse/remaining-quantity projection;
        // merge it over the original batch so extraction lineage is retained.
        sourceBatchRows[sourceBatchIds[batchKey]] = Object.assign({}, sourceBatchRows[sourceBatchIds[batchKey]], row);
        return;
      }
      sourceBatchIds[batchKey] = sourceBatchRows.length;
      sourceBatchRows.push(row);
    });
    var shipments = Array.isArray(industrial.shipments) ? industrial.shipments :
      Array.isArray(industrial.transportJobs) ? industrial.transportJobs :
      Array.isArray(gameResource.shipmentLedger) ? gameResource.shipmentLedger :
      Array.isArray(gameResource.shipments) ? gameResource.shipments :
      Array.isArray(gameResource.transportLedger) ? gameResource.transportLedger : [];
    var projectRows = safeArray(industrial.projects).concat(safeArray(gameResource.projects));
    var seenProjects = Object.create(null);
    var projects = projectRows.filter(function (row) {
      var id = String(row.projectId || row.requestId || row.id ||
        [row.projectType || row.kind || row.type || '', row.siteId || '', row.factoryId || '', row.createdTurn || row.startedTurn || ''].join('|'));
      if (seenProjects[id]) return false;
      seenProjects[id] = true;
      return true;
    });
    var mineProjects = projects.filter(function (row) {
      return /MINE_CONSTRUCTION/.test(String(row.projectType || row.kind || row.type || '').toUpperCase()) &&
        !/COMPLETED|COMMISSIONED|CANCELLED|FAILED|REJECTED/.test(String(row.status || '').toUpperCase());
    });
    var flows = Array.isArray(industrial.siteFlowLedger) ? industrial.siteFlowLedger :
      Array.isArray(gameResource.siteFlowLedger) ? gameResource.siteFlowLedger :
      Array.isArray(gameResource.extractionLedger) ? gameResource.extractionLedger : [];
    var assets = safeArray(gameResource.mineAssets);
    var photoLib = g.OmegaUIPhotoAssets;
    var minePhoto = photoLib && typeof photoLib.get === 'function' ? photoLib.get('open-pit-mine') : null;
    var photoMarkup = minePhoto && /^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(minePhoto.path || ''))
      ? '<figure class="omega-v2-photo omega-v2-mine-hero"><img src="' + esc(minePhoto.path) + '" loading="lazy" decoding="async" alt="Mining landscape" ></figure>' : '';
    var turn = currentTurn();
    var assetsBySite = Object.create(null);
    assets.forEach(function (asset) {
      var id = String(asset && asset.siteId || '').trim();
      if (id) assetsBySite[id] = asset;
    });
    function assetFor(id) { return assetsBySite[String(id || '').trim()] || null; }
    function isOperationalAsset(asset) {
      var status = String(asset && asset.status || '').toUpperCase();
      return !!asset && !/DECOMMISSIONED|DESTROYED|STOPPED|CLOSED|INACTIVE/.test(status) &&
        /OPERATIONAL|ACTIVE|COMMISSIONED|PRODUCING/.test(status);
    }
    function projectFor(id) {
      for (var i = mineProjects.length - 1; i >= 0; i -= 1) if (String(mineProjects[i].siteId || '') === String(id || '')) return mineProjects[i];
      return null;
    }
    function flowIsBlocked(row) {
      var status = String(row && row.status || '').toUpperCase();
      return /BLOCKED|AWAITING_ROUTE|AWAITING_CAPACITY|AWAITING_INPUTS|EXTRACTED_AWAITING_FACTORY|FACTORY_INPUT_SHORTAGE/.test(status);
    }
    function isCurrentTurnFlow(row) {
      var tick = numberOrNull(row && (row.extractionTurn !== undefined ? row.extractionTurn :
        row.turn !== undefined ? row.turn : row.lastUpdatedTurn));
      if (tick !== null && tick === turn) return true;
      return safeArray(row && row.stages).some(function (stage) {
        return String(stage.stage || '').toUpperCase() === 'EXTRACTION' &&
          /COMPLETED|COMMITTED/.test(String(stage.status || '').toUpperCase()) &&
          numberOrNull(stage.turn) === turn;
      });
    }
    function outputForSite(id, rows) {
      return rows.reduce(function (sum, row) {
        if (String(row.siteId || '') !== String(id || '') || !isCurrentTurnFlow(row)) return sum;
        return sum + Math.max(0, numberOrNull(row.quantity) || 0);
      }, 0);
    }
    function resourceOutputRows(sourceFlows) {
      var groups = Object.create(null);
      sourceFlows.forEach(function (row) {
        if (!isCurrentTurnFlow(row)) return;
        var resource = String(row.resourceId || '').toLowerCase();
        var unit = String(row.unit || row.quantityUnit || '').trim();
        var quantity = numberOrNull(row.quantity);
        if (!resource || quantity === null || quantity <= 0) return;
        var key = resource + '|' + unit;
        if (!groups[key]) groups[key] = { resourceId:resource, unit:unit, quantity:0, sites:Object.create(null) };
        groups[key].quantity += quantity;
        if (row.siteId) groups[key].sites[row.siteId] = true;
      });
      return Object.keys(groups).map(function (key) { return groups[key]; });
    }
    function sumUnitGroups(groups) {
      if (!groups.length) return '—';
      return groups.slice().sort(function (a,b) { return b.quantity - a.quantity; }).slice(0, 3)
        .map(function (row) { return amount(row.quantity, row.unit || ''); }).join(' · ');
    }
    function hasAlias(row) {
      return !!(row && (row.runtime && row.runtime.aliasOfSiteId || row.map && row.map.aliasOfSiteId ||
        row.identity && row.identity.aliasOfSiteId || row.map && row.map.markerEligible === false));
    }
    function eligible(site) {
      var row = site.raw || {};
      if (hasAlias(row)) return false;
      if (row.operation && row.operation.commercialExtraction === false) return false;
      if (row.commercialExtraction === false || row.extractionEligibility === 'NON_EXECUTABLE') return false;
      if (String(row.status || row.operation && row.operation.status || '').toUpperCase() === 'NOT_APPLICABLE') return false;
      return true;
    }
    function resourceEntryFor(map, resourceId) {
      if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
      if (Object.prototype.hasOwnProperty.call(map, resourceId)) return map[resourceId];
      var wanted = String(resourceId || '').trim().toLowerCase();
      var match = Object.keys(map).find(function (key) { return key.toLowerCase() === wanted; });
      return match === undefined ? null : map[match];
    }
    function demandRuntimeFor(resourceId) {
      var snapshot = gameResource.demandRuntime && typeof gameResource.demandRuntime === 'object'
        ? gameResource.demandRuntime : {};
      var maps = [
        snapshot.byResource,
        gameResource.nationalDemand && (gameResource.nationalDemand.byResource || gameResource.nationalDemand),
        gameResource.resourceDemand,
        gameResource.demandByResource,
        gameResource.demand && (gameResource.demand.byResource || gameResource.demand)
      ];
      for (var i = 0; i < maps.length; i += 1) {
        var row = resourceEntryFor(maps[i], resourceId);
        if (row && typeof row === 'object') return row;
      }
      return null;
    }
    function factoryInputBaselineRowFor(resourceId) {
      var marker = gameResource.factoryInputBaselineV1 && typeof gameResource.factoryInputBaselineV1 === 'object'
        ? gameResource.factoryInputBaselineV1 : {};
      var rows = safeArray(marker.stockRows);
      var wanted = String(resourceId || '').trim().toLowerCase();
      return rows.find(function (row) {
        return String(row && (row.productId || row.resourceId) || '').trim().toLowerCase() === wanted;
      }) || null;
    }
    function targetCoverageDaysFor(resourceId) {
      var runtimeRow = demandRuntimeFor(resourceId);
      var targetMap = gameResource.resourceStockCoverageTargetDays ||
        gameResource.stockCoverageTargetDaysByResource || {};
      var targetKey = Object.keys(targetMap).find(function (key) {
        return key.toLowerCase() === String(resourceId || '').trim().toLowerCase();
      });
      var candidates = [
        runtimeRow && runtimeRow.stockCoverageTargetDays,
        targetKey ? targetMap[targetKey] : null
      ];
      for (var i = 0; i < candidates.length; i += 1) {
        var days = numberOrNull(candidates[i]);
        if (days !== null && days > 0) return days;
      }
      return null;
    }
    function dailyDemand(resourceId) {
      var runtimeRow = demandRuntimeFor(resourceId);
      var runtimeRate = numberOrNull(runtimeRow && (runtimeRow.demandPerDay !== undefined
        ? runtimeRow.demandPerDay : runtimeRow.dailyDemandQuantity));
      if (runtimeRate !== null && runtimeRate >= 0) return runtimeRate;
      var maps = [
        gameResource.demandByResource, gameResource.resourceDemand,
        gameResource.nationalDemand && (gameResource.nationalDemand.byResource || gameResource.nationalDemand),
        gameResource.demand && (gameResource.demand.byResource || gameResource.demand)
      ];
      for (var i = 0; i < maps.length; i += 1) {
        var hit = resourceEntryFor(maps[i], resourceId);
        if (!hit || typeof hit !== 'object') continue;
        var value = numberOrNull(hit.dailyDemand !== undefined ? hit.dailyDemand :
          hit.demandPerDay !== undefined ? hit.demandPerDay : hit.quantityPerDay !== undefined ? hit.quantityPerDay :
          hit.perDay !== undefined ? hit.perDay : null);
        if (value !== null && value >= 0) return value;
        var perTurn = numberOrNull(hit.perTurn);
        var daysPerTurn = numberOrNull(hit.turnDurationDays) ||
          numberOrNull(stateRoot.simulation && stateRoot.simulation.daysPerTurn);
        if (perTurn !== null && perTurn >= 0 && daysPerTurn !== null && daysPerTurn > 0) return perTurn / daysPerTurn;
      }
      return null;
    }
    function stockFor(resourceId, source) {
      var row = source && source[resourceId];
      if (row === undefined && source) {
        var match = Object.keys(source).find(function (key) { return key.toLowerCase() === String(resourceId).toLowerCase(); });
        if (match) row = source[match];
      }
      return val(row);
    }
    function resourceUnit(resourceId) {
      var wanted = String(resourceId || '').trim().toLowerCase();
      var unitKey = Object.keys(inventoryUnits).find(function (key) { return key.toLowerCase() === wanted; });
      var recordedUnit = unitKey && inventoryUnits[unitKey] ? String(inventoryUnits[unitKey]) : '';
      if (recordedUnit && !/SIMULATION.*UNIT/i.test(recordedUnit)) return recordedUnit;
      var meta = resourceCatalogById[wanted];
      if (meta && meta.unit && !/PER[_\s-]*DAY|\/\s*DAY/i.test(String(meta.unit))) return String(meta.unit);
      var rules = g.OmegaResourceIndustrialCatalogData || g.Omega && g.Omega.ResourceIndustrialCatalogData || {};
      var rule = rules.resourceRules && (rules.resourceRules[resourceId] || rules.resourceRules[wanted]);
      if (rule) return String(rule.unit || rule.baseUnit || rule.outputUnit || '');
      if (meta && meta.stockUnit) return String(meta.stockUnit);
      // A configured rate unit such as METRIC_TONS_PER_DAY has the same
      // numerator unit for a recorded warehouse quantity, without the rate suffix.
      if (meta && meta.unit && /_PER_DAY$/i.test(String(meta.unit))) {
        return String(meta.unit).replace(/_PER_DAY$/i, '');
      }
      return '';
    }
    function resourceDemandUnit(resourceId, unit) {
      var meta = resourceCatalogById[String(resourceId || '').trim().toLowerCase()] || {};
      var runtimeRow = demandRuntimeFor(resourceId) || {};
      var explicit = String(runtimeRow.demandUnit || runtimeRow.unit || meta.demandUnit || meta.dailyDemandUnit || '').trim();
      if (explicit) return explicit.replace(/_/g, ' ');
      return (unit || 'units') + '/day';
    }
    // Factory input is a separate physical stock location. It has already left
    // the country warehouse, but it is not consumed until a production cycle commits.
    // Read the factory aggregate only; inputBatchLots is a lineage projection of the
    // same quantity and must never be added a second time.
    var factoryHeldInputRows = [];
    countryFactoryAssets.forEach(function (asset) {
      var inputs = asset && asset.inputInventory && typeof asset.inputInventory === 'object'
        ? asset.inputInventory : {};
      Object.keys(inputs).forEach(function (resourceId) {
        var quantity = val(inputs[resourceId]);
        if (quantity === null) return;
        var inputUnits = asset.inputUnits && typeof asset.inputUnits === 'object' ? asset.inputUnits : {};
        var unitKey = Object.keys(inputUnits).find(function (key) {
          return key.toLowerCase() === String(resourceId).toLowerCase();
        });
        factoryHeldInputRows.push({
          factoryId: String(asset.id || asset.assetId || asset.projectId || ''),
          factoryName: String(asset.name || asset.factoryName || asset.factoryType || asset.type ||
            asset.id || asset.assetId || 'Registered factory'),
          factoryType: String(asset.factoryType || asset.type || asset.facilityType || ''),
          resourceId: String(resourceId),
          quantity: quantity,
          unit: String(unitKey ? inputUnits[unitKey] : asset.inputUnit || resourceUnit(resourceId) || '')
        });
      });
    });
    var factoryHeldInputMarkup = '<section class="omega-v2-card omega-v2-movement-card omega-v2-factory-held-input">' +
      '<div class="omega-v2-card-header"><div><h2>Factory-held input</h2><p>Materials already delivered inside each factory. Kept separate from national warehouse stock; consumption is posted only when a production cycle completes.</p></div>' +
      '<span class="omega-v2-status" data-state="' + (factoryHeldInputRows.length ? 'operational' : 'attention') + '">' +
      fmt(factoryHeldInputRows.length) + ' recorded input balances</span></div>' +
      (factoryHeldInputRows.length
        ? '<div class="omega-v2-table-wrap"><table><thead><tr><th>Factory</th><th>Input resource</th><th>Stock at factory</th></tr></thead><tbody>' +
          factoryHeldInputRows.map(function (row) {
            return '<tr data-factory-id="' + esc(row.factoryId) + '" data-resource-id="' + esc(row.resourceId) + '">' +
              '<td><strong>' + esc(row.factoryName) + '</strong>' +
              (row.factoryType ? '<small>' + esc(row.factoryType) + '</small>' : '') + '</td><td>' +
              resourceIconMarkup(row.resourceId, resourceLabel(row.resourceId)) + esc(resourceLabel(row.resourceId)) +
              '</td><td class="omega-v2-current-stock-cell">' + amount(row.quantity, row.unit) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="omega-v2-empty">No factory-held input balances have been recorded for this country.</div>') +
      '</section>';

    function balanceState(site, asset, currentOutput, blocked) {
      if (!isOperationalAsset(asset)) return asset && /DECOMMISSIONED|DESTROYED|STOPPED|INACTIVE|CLOSED/.test(String(asset.status || '').toUpperCase())
        ? 'stopped' : projectFor(site.siteId) ? 'building' : 'unbuilt';
      if (currentOutput <= 0) return 'stopped';
      var demand = dailyDemand(site.resourceId);
      if (demand !== null) return currentOutput + 1e-9 >= demand ? 'adequate' : 'shortage';
      if (blocked) return 'shortage';
      return 'producing';
    }
    function balanceLabel(balance) {
      return ({adequate:'Balanced',shortage:'Shortage',stopped:'Stopped',building:'Building',unbuilt:'Available',producing:'Producing'})[balance] || 'Available';
    }
    var currentOutputGroups = resourceOutputRows(flows);
    var activeSiteCount = model.sites.filter(function (site) { return isOperationalAsset(assetFor(site.siteId)); }).length;
    var outputShortageCount = currentOutputGroups.filter(function (row) { var demand=dailyDemand(row.resourceId); return demand!==null && row.quantity+1e-9<demand; }).length;
    var outputDemandKnown = currentOutputGroups.length>0 && currentOutputGroups.every(function (row) { return dailyDemand(row.resourceId)!==null; });
    var portfolioBalanceState = currentOutputGroups.length ? (outputShortageCount ? 'shortage' : outputDemandKnown ? 'adequate' : 'producing') : activeSiteCount ? 'stopped' : 'neutral';
    var producingSites = model.sites.filter(function (site) { return outputForSite(site.siteId, flows) > 0; });
    var blockedFlows = flows.filter(flowIsBlocked);
    var distinctSiteResources = model.sites.filter(eligible).map(function (site) { return site.resourceId; });
    var distinctResources = Array.from(new Set(distinctSiteResources.concat(canonicalResourceCatalog.map(function (row) {
      return String(row && (row.resourceId || row.id) || '').trim();
    }).filter(Boolean))));
    var rawStock = Object.assign({}, rawWarehouse.availableByResource && typeof rawWarehouse.availableByResource === 'object'
      ? rawWarehouse.availableByResource : {});
    var finishedStock = processedWarehouse.availableByResource && typeof processedWarehouse.availableByResource === 'object' ? processedWarehouse.availableByResource : {};
    // Older saves may contain aggregate resource.inventory balances without a warehouse projection.
    // Use those balances only for the canonical 41 raw identities, and only when the raw warehouse has no row.
    canonicalResourceCatalog.forEach(function (row) {
      var rid = String(row && (row.resourceId || row.id) || '').trim();
      if (!rid) return;
      var warehouseKey = Object.keys(rawStock).find(function (key) { return key.toLowerCase() === rid.toLowerCase(); });
      if (warehouseKey) return;
      var inventoryKey = Object.keys(inventory).find(function (key) { return key.toLowerCase() === rid.toLowerCase(); });
      if (inventoryKey) rawStock[rid] = inventory[inventoryKey];
    });
    var canonicalRawResourceIds = canonicalResourceCatalog.map(function (row) {
      return String(row && (row.resourceId || row.id) || '').trim().toLowerCase();
    }).filter(Boolean);
    var rawInventoryKeys = canonicalRawResourceIds.length
      ? Array.from(new Set(canonicalRawResourceIds)).sort()
      : Array.from(new Set(distinctResources.concat(Object.keys(rawStock)).map(function (rid) {
          return String(rid || '').trim().toLowerCase();
        }).filter(Boolean))).sort();
    // Only the processed warehouse is authoritative for finished-goods stock.
    // Factory-held input and legacy aggregate balances remain in their own ledgers;
    // neither is promoted into this physical warehouse projection.
    var processedStockDisplay = Object.assign({}, finishedStock);
    var processedInventoryKeys = Object.keys(processedStockDisplay).filter(function (rid) {
      return val(processedStockDisplay[rid]) > 0;
    }).sort();
    var inventoryKeys = rawInventoryKeys.slice();
    var movementIn = Object.create(null), movementOut = Object.create(null);
    safeArray(rawWarehouse.receipts).concat(safeArray(processedWarehouse.receipts)).concat(safeArray(gameResource.inventoryLedger))
      .forEach(function (row) {
        var rid = String(row.resourceId || row.materialId || row.productId || '').trim();
        var q = numberOrNull(row.quantity !== undefined ? row.quantity : row.receivedQuantity !== undefined ? row.receivedQuantity : row.amount);
        if (!rid || q === null || q <= 0) return;
        if (/OUT|CONSUM|DISPATCH|EXPORT|SALE/.test(String(row.movementType || row.type || row.direction || '').toUpperCase())) {
          movementOut[rid] = (movementOut[rid] || 0) + q;
        } else if (/IN|RECEIPT|EXTRACTION|PRODUCTION|IMPORT/.test(String(row.movementType || row.type || row.direction || row.status || '').toUpperCase())) {
          movementIn[rid] = (movementIn[rid] || 0) + q;
        }
      });
    flows.forEach(function (flow) {
      var rid = String(flow.resourceId || '').trim();
      safeArray(flow.stages).forEach(function (stage) {
        if (String(stage.stage || '').toUpperCase() !== 'TRANSPORT') return;
        var q = numberOrNull(stage.dispatchQuantity !== undefined ? stage.dispatchQuantity : stage.deliveredQuantity);
        if (q !== null && q > 0 && rid) movementOut[rid] = (movementOut[rid] || 0) + q;
      });
      Object.keys(flow.outputQuantities || {}).forEach(function (rid) {
        var q = numberOrNull(flow.outputQuantities[rid]);
        if (q !== null && q > 0) movementIn[rid] = (movementIn[rid] || 0) + q;
      });
    });
    function currentStockFor(resourceId, raw, processed) {
      var aggregate = stockFor(resourceId, inventory);
      if (aggregate !== null) return aggregate;
      // If only one warehouse projection exists, it is a safe fallback. If both
      // exist without an aggregate balance, do not add them and risk double-counting.
      if (raw !== null && processed === null) return raw;
      if (processed !== null && raw === null) return processed;
      return null;
    }
    function coverageDaysFor(resourceId) {
      var stock = currentStockFor(resourceId, stockFor(resourceId, rawStock), stockFor(resourceId, finishedStock));
      var demand = dailyDemand(resourceId);
      return stock !== null && demand !== null && demand > 0 ? stock / demand : null;
    }
    function targetGapFor(resourceId) {
      var stock = currentStockFor(resourceId, stockFor(resourceId, rawStock), stockFor(resourceId, finishedStock));
      var demand = dailyDemand(resourceId);
      var targetDays = targetCoverageDaysFor(resourceId);
      if (stock === null || demand === null || demand <= 0 || targetDays === null) return null;
      return Math.max(0, demand * targetDays - stock);
    }
    function countryNameForSupply(countryId) {
      var code = String(countryId || '').trim().toUpperCase();
      if (!code) return 'Country not recorded';
      var runtime = g.OmegaCountryRuntimeData || g.Omega && g.Omega.CountryRuntimeData;
      try {
        var profile = runtime && typeof runtime.resolveCountry === 'function' ? runtime.resolveCountry(code) : null;
        if (profile) {
          var name = String(profile.name || profile.shortName || profile.officialName || '').trim();
          if (name && name.toUpperCase() !== code) return name;
        }
      } catch (_) {}
      var engineProfiles = g.ResourceMinistryEngine && g.ResourceMinistryEngine.countryProfiles;
      var profile = engineProfiles && (engineProfiles[code] || engineProfiles[code.toLowerCase()]);
      var identity = profile && (profile.identity || profile.country || profile) || {};
      var name = String(identity.name || identity.countryName || identity.officialName ||
        profile && (profile.name || profile.countryName) || '').trim();
      return name && name.toUpperCase() !== code ? name : code;
    }
    function sourceSummaryFor(resourceId, unit, currentStock) {
      var domesticMine = 0, openingAllocation = 0, unknown = 0, tracked = 0;
      var foreignByCountry = Object.create(null);
      sourceBatchRows.forEach(function (row) {
        var rid = String(row && (row.resourceId || row.materialId || row.productId || '')).trim().toLowerCase();
        if (rid !== String(resourceId || '').trim().toLowerCase()) return;
        var stage = String(row.stage || row.inventoryStage || row.materialStage || '').toUpperCase();
        if (stage && stage !== 'RAW') return;
        var status = String(row.status || row.lifecycleStatus || '').toUpperCase();
        if (/CONSUMED|DEPLETED|TRANSFERRED_OUT|DISPATCHED|EXPORTED|SOLD|CANCELLED/.test(status)) return;
        var warehouseId = String(row.warehouseId || '').trim();
        var locationNodeKey = String(row.locationNodeKey || '').trim().toUpperCase();
        if (!warehouseId && locationNodeKey.indexOf('WAREHOUSE:') !== 0) return;
        var quantity = numberOrNull(row.remainingQuantity !== undefined ? row.remainingQuantity :
          row.availableQuantity !== undefined ? row.availableQuantity :
          row.quantity !== undefined ? row.quantity : row.amount);
        if (quantity === null || quantity <= 0) return;
        tracked += quantity;
        var provenance = row.provenance && typeof row.provenance === 'object' ? row.provenance : {};
        var sourceCountry = String(row.sourceCountryId || row.originCountryId ||
          provenance.sourceCountryId || provenance.originCountryId || '').trim().toUpperCase();
        var transferType = String(row.transferType || row.sourceType || provenance.transferType || '').toUpperCase();
        var sourceSystem = String(provenance.sourceSubsystem || provenance.source || provenance.authority ||
          row.source || row.authority || '').toUpperCase();
        var hasMineLineage = !!(row.occurrenceKey || row.siteReferenceKey || row.siteId ||
          (Array.isArray(row.sourceSiteIds) && row.sourceSiteIds.length) ||
          /LOCAL_EXTRACTION|MINE/.test(transferType) || /ENDOWMENT/.test(sourceSystem));
        var isStartupAllocation = /STARTUP.BASELINE|STARTUP.STOCK|OPENING.STOCK/.test(
          [sourceSystem, transferType, String(row.batchId || '')].join('|'));
        if (sourceCountry && sourceCountry !== countryKey) {
          foreignByCountry[sourceCountry] = (foreignByCountry[sourceCountry] || 0) + quantity;
        } else if (hasMineLineage && (!sourceCountry || sourceCountry === countryKey)) {
          domesticMine += quantity;
        } else if (isStartupAllocation) {
          openingAllocation += quantity;
        } else {
          unknown += quantity;
        }
      });
      var parts = [];
      if (domesticMine > 0) parts.push('<span class="omega-v2-origin-pill" data-origin="mine"><span class="omega-v2-origin-kind">Domestic mine</span><strong>' + amount(domesticMine, unit) + '</strong></span>');
      Object.keys(foreignByCountry).sort().forEach(function (country) {
        parts.push('<span class="omega-v2-origin-pill" data-origin="import"><span class="omega-v2-origin-kind">Foreign import</span><strong>' +
          amount(foreignByCountry[country], unit) + '</strong><small>(' + esc(countryNameForSupply(country)) + ')</small></span>');
      });
      if (openingAllocation > 0) parts.push('<span class="omega-v2-origin-pill" data-origin="opening"><span class="omega-v2-origin-kind">Opening allocation</span><strong>' + amount(openingAllocation, unit) + '</strong><small>Initial stock; no mine or import receipt is asserted</small></span>');
      if (unknown > 0) parts.push('<span class="omega-v2-origin-pill" data-origin="unknown"><span class="omega-v2-origin-kind">Source not recorded</span><strong>' + amount(unknown, unit) + '</strong></span>');
      if (currentStock !== null && currentStock > tracked + 1e-9) {
        parts.push('<span class="omega-v2-origin-pill" data-origin="unmatched"><span class="omega-v2-origin-kind">Unmatched stock</span><strong>' + amount(currentStock - tracked, unit) + '</strong><small>Current stock without a matching on-hand batch lineage</small></span>');
      } else if (currentStock === null && !tracked) {
        parts.push('<span class="omega-v2-origin-empty">Source and on-hand batch are not recorded</span>');
      } else if (currentStock !== null && tracked > currentStock + 1e-9) {
        parts.push('<span class="omega-v2-origin-pill" data-origin="warning"><span class="omega-v2-origin-kind">Ledger mismatch</span><strong>' + amount(tracked - currentStock, unit) + '</strong></span>');
      }
      var requests = safeArray(gameTrade.importRequests), suppliers = Object.create(null), unknownInbound = 0;
      requests.forEach(function (request) {
        if (!request || String(request.resourceId || '').trim().toLowerCase() !== String(resourceId || '').trim().toLowerCase()) return;
        var status = String(request.status || '').toUpperCase();
        var stage = String(request.stage || '').toUpperCase();
        var terminal = ['SETTLED','DELIVERED','COMPLETED','FULFILLED','REJECTED','CANCELLED','CANCELED','FAILED','EXPIRED'];
        var confirmed = ['ACCEPTED','SETTLEMENT_PREPARING','IN_TRANSIT','SHIPPED','DISPATCHED','AWAITING_DELIVERY','CONFIRMED','CONTRACTED','LOADED'];
        if (terminal.indexOf(status) >= 0 || terminal.indexOf(stage) >= 0 ||
            (confirmed.indexOf(status) < 0 && confirmed.indexOf(stage) < 0)) return;
        var quantity = numberOrNull(request.remainingQuantity !== undefined ? request.remainingQuantity : request.quantity);
        if (quantity === null || quantity <= 0) return;
        var supplier = String(request.supplierCountryId || request.sellerCountryId ||
          request.sourceCountryId || request.counterpartyCountryId || '').trim().toUpperCase();
        if (supplier && supplier !== countryKey) {
          var entry = suppliers[supplier] || (suppliers[supplier] = { quantity:0, status:status || stage || 'CONFIRMED' });
          entry.quantity += quantity;
        } else if (!supplier) {
          unknownInbound += quantity;
        }
      });
      Object.keys(suppliers).sort().forEach(function (country) {
        var entry = suppliers[country];
        parts.push('<span class="omega-v2-origin-pill" data-origin="in-transit"><span class="omega-v2-origin-kind">Confirmed foreign inbound · ' +
          esc(human(entry.status)) + '</span><strong>' + amount(entry.quantity, unit) + '</strong><small>(' +
          esc(countryNameForSupply(country)) + ') · not yet added to current stock</small></span>');
      });
      if (unknownInbound > 0) parts.push('<span class="omega-v2-origin-pill" data-origin="in-transit-unknown"><span class="omega-v2-origin-kind">Inbound import · supplier not recorded</span><strong>' + amount(unknownInbound, unit) + '</strong></span>');
      return parts.length ? parts.join('') : '<span class="omega-v2-origin-empty">Source not recorded</span>';
    }
    function stockStatusInfo(resourceId, currentStock, demand, unit) {
      var runtimeRow = demandRuntimeFor(resourceId) || {};
      var coverage = currentStock !== null && demand !== null && demand > 0 ? currentStock / demand : null;
      var targetDays = targetCoverageDaysFor(resourceId);
      var targetStock = demand !== null && demand > 0 && targetDays !== null ? demand * targetDays : null;
      var targetGap = demand !== null && demand > 0 && targetStock !== null && currentStock !== null
        ? Math.max(0, targetStock - currentStock) : null;
      var runtimeStatus = String(runtimeRow.status || '').toUpperCase();
      var unmetDemand = numberOrNull(runtimeRow.unmetDemand);
      var label = 'Not verified', state = 'unknown', targetNote = '';
      if (runtimeStatus === 'SHORTAGE' || (unmetDemand !== null && unmetDemand > 1e-9) ||
          (currentStock !== null && demand !== null && demand > 0 && currentStock + 1e-9 < demand)) {
        label = 'Shortage'; state = 'critical';
      } else if (runtimeStatus === 'LOW_COVERAGE' || runtimeRow.lowStockCoverage === true ||
          (targetGap !== null && targetGap > 1e-9)) {
        label = 'Low stock'; state = 'warning';
      } else if (demand === 0) {
        label = 'No recorded demand'; state = 'unknown';
      } else if (targetStock !== null && currentStock !== null && currentStock > targetStock + 1e-9) {
        label = 'Surplus'; state = 'surplus';
      } else if (demand !== null && currentStock !== null) {
        label = 'Adequate'; state = 'adequate';
      }
      if (targetGap !== null && targetGap > 1e-9) {
        targetNote = 'Target gap: ' + amount(targetGap, unit);
      } else if (targetStock !== null && currentStock !== null && currentStock > targetStock + 1e-9) {
        targetNote = 'Above target: ' + amount(currentStock - targetStock, unit);
      } else if (targetDays !== null) {
        targetNote = 'Target: ' + fmt(targetDays) + ' days';
      }
      return {
        label:label, state:state,
        coverageLabel:coverage !== null ? fmt(coverage) + ' days' :
          (demand === 0 ? 'No daily use recorded' : 'Not available'),
        targetNote:targetNote,
        origin:sourceSummaryFor(resourceId, unit, currentStock)
      };
    }
    function siteCard(site) {
      var asset = assetFor(site.siteId), project = projectFor(site.siteId), output = outputForSite(site.siteId, flows);
      var isBuilt = isOperationalAsset(asset), balance = balanceState(site, asset, output, blockedFlows.some(function (row) { return String(row.siteId || '') === site.siteId; }));
      var reserveValue = site.reserve.value !== null ? site.reserve.value :
        site.modeledReserve && site.modeledReserve.modeledValue !== null ? site.modeledReserve.modeledValue : null;
      var capacity = site.production.value !== null ? site.production.value : site.production.modeledValue;
      var stock = stockFor(site.resourceId, rawStock);
      var unit = site.production.unit && site.production.unit !== 'unit not recorded' ? site.production.unit : resourceUnit(site.resourceId);
      var outputUnit = '';
      var outputRow = currentOutputGroups.find(function (row) { return row.resourceId === String(site.resourceId).toLowerCase(); });
      if (outputRow) outputUnit = outputRow.unit;
      var kind = mineArchetypeLabel(site.raw);
      var siteEligible = eligible(site);
      var disabledAction = !canOperate || !siteEligible;
      // Additional mine units may be built at a site that already has operational assets.
      var buildDisabled = disabledAction || !!project;
      var extractDisabled = disabledAction || !isBuilt;
      var demolishDisabled = disabledAction || !isBuilt;
      var state = balance;
      var operationClass = 'omega-v2-mine-operations';
      return '<article class="omega-v2-card omega-v2-resource-site-card omega-v2-mine-card" data-omega-v2-site-card data-site-id="' + esc(site.siteId) +
        '" data-resource="' + esc(site.resourceId) + '" data-balance-state="' + esc(state) + '" data-search="' + esc((site.name + ' ' + site.resourceId + ' ' + site.location).toLowerCase()) + '">' +
        '<div class="omega-v2-resource-card-top"><button type="button" class="omega-v2-resource-card-identity omega-v2-mine-select" data-omega-v2-select-site="' + esc(site.siteId) + '" aria-label="Select ' + esc(site.name) + '">' +
        '<span class="omega-v2-resource-icon">' + resourceIconMarkup(site.resourceId, resourceLabel(site.resourceId)) + '</span>' +
        '<span class="omega-v2-resource-card-heading"><span class="omega-v2-eyebrow">' + esc(resourceLabel(site.resourceId)) + '</span><span class="omega-v2-card-title">' + esc(site.name) + '</span><span class="omega-v2-card-meta">' + esc(site.location) + '</span></span></button>' +
        '<span class="omega-v2-resource-card-flags"><span class="omega-v2-status" data-state="' + (state === 'adequate' ? 'operational' : state === 'shortage' || state === 'building' ? 'attention' : state === 'stopped' ? 'danger' : 'unknown') + '">' + esc(balanceLabel(balance)) + '</span>' +
        '<span class="omega-v2-mine-kind">' + mineArchetypeMarkup(site.raw) + '<span>' + esc(kind) + '</span></span></span></div>' +
        '<div class="omega-v2-vehicle-stats omega-v2-mine-metrics"><div><span>Daily output</span><strong>' + (output > 0 ? amount(output, outputUnit) : '—') + '</strong></div>' +
        '<div><span>Reserve</span><strong>' + amount(reserveValue, site.reserve.unit || '') + '</strong></div>' +
        '<div><span>Raw stock</span><strong>' + amount(stock, resourceUnit(site.resourceId)) + '</strong></div>' +
        '<div><span>Daily capacity</span><strong>' + amount(capacity, unit) + '</strong></div></div>' +
        '<div class="' + operationClass + '">' +
        '<button type="button" class="omega-v2-button omega-v2-button--build" data-omega-v2-mine-action="build" data-site-id="' + esc(site.siteId) + '"' + (buildDisabled ? ' disabled' : '') + '>Build</button>' +
        '<button type="button" class="omega-v2-button omega-v2-button--extract" data-omega-v2-mine-action="extract" data-site-id="' + esc(site.siteId) + '"' + (extractDisabled ? ' disabled' : '') + '>Extract</button>' +
        '<button type="button" class="omega-v2-button omega-v2-button--demolish" data-omega-v2-mine-action="demolish" data-site-id="' + esc(site.siteId) + '"' + (demolishDisabled ? ' disabled' : '') + '>Demolish</button></div></article>';
    }
    var cards = model.sites.map(siteCard).join('');
    var selectedId = String(root.__omegaV2SelectedMineId || '');
    var selectedMine = model.sites.find(function (site) { return site.siteId === selectedId; }) || model.sites[0] || null;
    if (selectedMine) root.__omegaV2SelectedMineId = selectedMine.siteId;
    function livePlayerCountryKey() {
      return activePlayerCountryKey(authoritativeGameState());
    }
    function mineBuildQuoteMarkup(site,country,count,workers) {
      if (!Number.isInteger(count)||count<1||count>100) return '<div class="omega-v2-build-notice" role="status">Choose a whole-number batch size from 1 to 100.</div>';
      if (!Number.isInteger(workers)||workers<0) return '<div class="omega-v2-build-notice" role="status">Enter a non-negative whole-number workforce commitment.</div>';
      if (!country||country!==livePlayerCountryKey()) return '<div class="omega-v2-build-notice" role="status">Construction is available only for the active player country.</div>';
      var network=g.OmegaResourceIndustrialNetwork||g.Omega&&g.Omega.ResourceIndustrialNetwork;
      if (!network||typeof network.quoteMineProject!=='function'||typeof network.startMineProject!=='function') return '<div class="omega-v2-build-notice" role="status">Construction runtime unavailable. No resources have been committed.</div>';
      var q;
      try { q=network.quoteMineProject({countryId:country,siteId:site.siteId,resourceId:site.resourceId,quantity:count,assignedWorkers:workers}); }
      catch (_) { return '<div class="omega-v2-build-notice" role="status">Construction quote failed. No resources have been committed.</div>'; }
      if (!q||q.status!=='QUOTED') return '<div class="omega-v2-build-notice" role="status">Build quote unavailable: '+esc(human(q&&(q.reason||q.status)||'runtime unavailable'))+'.</div>';
      var treasury=q.treasury||{};
      var rows=safeArray(q.materials).map(function(m){
        var name=resourceLabel(m.resourceId);
        return '<div class="omega-v2-build-material" data-resource-id="'+esc(m.resourceId||'')+'">'+
          '<div class="omega-v2-build-material-resource">'+resourceIconMarkup(m.resourceId,name)+
            '<span class="omega-v2-build-material-copy"><strong>'+esc(name)+'</strong><small>Available: '+buildResourceAmount(m.available,m.unit||'')+'</small></span></div>'+
          '<div class="omega-v2-build-material-need"><strong><em>Need '+buildResourceAmount(m.required,m.unit||'')+'</em></strong>'+
            '<small class="'+(m.sufficient?'is-stocked':'is-short')+'">'+(m.sufficient?'In stock':'Short by '+buildResourceAmount(m.shortfall,m.unit||''))+'</small></div></div>';
      }).join('');
      var ready=q.ready===true&&country===livePlayerCountryKey();
      var reason=!q.staffingReady?'Commit at least '+fmt(q.workersRequired||0)+' workers.':
        treasury.sufficient!==true?'Treasury funds are insufficient or unavailable.':
        q.materialsReady!==true?'Required construction materials are missing.':
        q.commissioningReady===false?'A construction project is already active at this site.':'Review requirements before building.';
      return '<div class="omega-v2-build-summary-grid">'+
        '<div><span>Total construction cost</span><strong>$'+fmt(q.costUsd||0,0)+'</strong><small>$'+fmt(q.unitCostUsd||0,0)+' per mine</small></div>'+
        '<div><span>Build duration</span><strong>'+fmt(q.durationDays||0)+' days</strong><small>'+fmt(q.estimatedTurns||0)+' game turns</small></div>'+
        '<div><span>Workers required</span><strong>'+fmt(q.workersRequired||0)+'</strong><small>'+fmt(q.workersRequiredPerAsset||0)+' per mine · committed '+fmt(q.assignedWorkers||0)+'</small></div>'+
        '<div><span>Treasury</span><strong>'+(treasury.sufficient?'Funds available':'Insufficient / unknown')+'</strong><small>$'+fmt(treasury.available,0)+' available · $'+fmt(treasury.required||q.costUsd||0,0)+' required</small></div></div>'+
        '<h4 class="omega-v2-build-material-heading">Resources needed to establish this mine <span>· '+fmt(count)+' mine unit(s)</span></h4>'+
        (rows?'<div class="omega-v2-build-material-list">'+rows+'</div>':'<div class="omega-v2-build-notice">Material requirements are unavailable.</div>')+
        '<div class="omega-v2-build-notice" role="status" aria-live="polite">'+(ready?'Treasury, materials, workforce and project checks passed.':esc(reason))+'</div>'+
        '<button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-build-submit'+(ready?'':' disabled')+'>Start construction</button>';
    }
    function mineConstructionMarkup(site) {
      var project=projectFor(site.siteId);
      if (project&&project.status==='UNDER_CONSTRUCTION') {
        var pct=Math.max(0,Math.min(100,Number(project.progressPct||0)*100));
        var remain=project.remainingDays!==undefined?project.remainingDays:Math.max(0,(numberOrNull(project.durationDays)||0)-(numberOrNull(project.progressDays)||0));
        return '<section class="omega-v2-card omega-v2-mine-construction-progress"><div class="omega-v2-card-header"><h3>Construction in progress</h3><strong>'+fmt(pct,1)+'%</strong></div>'+
          '<div class="omega-v2-progress-track"><span style="width:'+pct+'%"></span></div><div class="omega-v2-build-progress-meta"><span>'+fmt(project.progressDays||0)+' / '+fmt(project.durationDays||0)+' days completed</span><strong>'+fmt(remain)+' days remaining</strong></div>'+
          '<div class="omega-v2-build-project-metrics"><div><span>Mine units</span><strong>'+fmt(project.assetCount||1)+'</strong></div><div><span>Workers committed</span><strong>'+fmt(project.workersCommitted||0)+' / '+fmt(project.workersRequired||0)+'</strong></div></div>'+
          '<p>Expected completion: '+esc(project.expectedCompletionDate||project.estimatedCompletionDate||'Game date unavailable')+'</p></section>';
      }
      if (root.__omegaV2MineAction!=='build'||String(root.__omegaV2BuildSiteId||'')!==String(site.siteId)) return '';
      var country=selectedCountryKey((root.__omegaV2ResourceOptions||{}).countryId||root.__omegaV2CurrentCountryKey||'');
      var count=numberOrNull(root.__omegaV2BuildQuantity); if(count===null)count=1;
      var workers=numberOrNull(root.__omegaV2BuildWorkers); if(workers===null)workers=0;
      return '<section class="omega-v2-card omega-v2-mine-build-plan" data-omega-v2-build-plan data-site-id="'+esc(site.siteId)+'">'+
        '<div class="omega-v2-card-header"><div><span class="omega-v2-eyebrow">NEW CONSTRUCTION</span><h3>Build at '+esc(site.name)+'</h3><p>Choose batch size and commit the required workforce.</p></div><button type="button" class="omega-v2-button omega-v2-button--quiet" data-omega-v2-build-cancel>Cancel</button></div>'+
        '<div class="omega-v2-build-plan-fields"><label><span>Mine units</span><input type="number" min="1" max="100" step="1" value="'+esc(count)+'" data-omega-v2-build-count aria-label="Mine units to build"></label>'+
        '<label><span>Workers committed</span><input type="number" min="0" step="1" value="'+esc(workers)+'" data-omega-v2-build-workers aria-label="Workers committed to construction"></label></div>'+
        '<div class="omega-v2-build-preview" data-omega-v2-build-preview>'+mineBuildQuoteMarkup(site,country,count,workers)+'</div></section>';
    }
    function selectedSiteDetail(site) {
      if (!site) return '<div class="omega-v2-empty">No mine sites are available for this country.</div>';
      var asset = assetFor(site.siteId), output = outputForSite(site.siteId, flows);
      var reserveValue = site.reserve.value !== null ? site.reserve.value :
        site.modeledReserve && site.modeledReserve.modeledValue !== null ? site.modeledReserve.modeledValue : null;
      var unitRow = currentOutputGroups.find(function (row) { return row.resourceId === String(site.resourceId).toLowerCase(); });
      var outputUnit = unitRow && unitRow.unit || '';
      var assignedWorkers = numberOrNull(asset && (asset.workersCommitted !== undefined ? asset.workersCommitted : asset.workersAssigned));
      var workersRequired = numberOrNull(asset && asset.workersRequired);
      var trucks = numberOrNull(asset && (asset.trucksAssigned !== undefined ? asset.trucksAssigned : asset.vehicleCount));
      var power = numberOrNull(asset && (asset.powerAvailability !== undefined ? asset.powerAvailability : asset.powerPercent));
      var balance = balanceState(site, asset, output, blockedFlows.some(function (row) { return String(row.siteId || '') === site.siteId; }));
      return '<section class="omega-v2-card omega-v2-mine-detail" data-omega-v2-mine-detail><div class="omega-v2-mine-detail-head"><span class="omega-v2-resource-icon omega-v2-resource-icon--large">' +
        resourceIconMarkup(site.resourceId, resourceLabel(site.resourceId)) + '</span><div><h2 class="omega-v2-card-title">' + esc(site.name) + '</h2><p class="omega-v2-card-meta">' +
        esc(site.location) + ' · ' + esc(resourceLabel(site.resourceId)) + '</p><span class="omega-v2-status" data-state="' +
        (balance === 'adequate' ? 'operational' : balance === 'shortage' || balance === 'building' ? 'attention' : balance === 'stopped' ? 'danger' : 'unknown') + '">' +
        esc(balanceLabel(balance)) + '</span></div></div><div class="omega-v2-vehicle-stats omega-v2-mine-metrics"><div><span>Daily output</span><strong>' +
        (output > 0 ? amount(output, outputUnit) : '—') + '</strong></div><div><span>Reserve</span><strong>' + amount(reserveValue, site.reserve.unit || '') +
        '</strong></div><div><span>Raw stock</span><strong>' + amount(stockFor(site.resourceId, rawStock), resourceUnit(site.resourceId)) + '</strong></div><div><span>Daily capacity</span><strong>' +
        amount(site.production.value !== null ? site.production.value : site.production.modeledValue, site.production.unit || resourceUnit(site.resourceId)) + '</strong></div></div>' +
        '<div class="omega-v2-mine-assigned"><h3>Assigned resources</h3><div><span>Workers</span><strong>' + (assignedWorkers !== null ? amount(assignedWorkers) +
        (workersRequired !== null ? ' / ' + amount(workersRequired) : '') : '—') + '</strong></div><div><span>Vehicles</span><strong>' + amount(trucks) +
        '</strong></div><div><span>Power</span><strong>' + amount(power, power === null ? '' : '%') + '</strong></div></div>' +
        '<div class="omega-v2-production-flow"><h3>Production Flow</h3><div class="omega-v2-flow-steps">' +
        [['Extraction','mine'],['Raw Stock','warehouse'],['Transport','truck'],['Factory','factory'],['Economy','chart']].map(function (step, i) {
          return '<span class="omega-v2-flow-step"><span class="omega-v2-flow-icon" data-flow-icon="' + step[1] + '">' +
            ({mine:'⛏',warehouse:'▤',truck:'⇢',factory:'▥',chart:'↗'}[step[1]]) + '</span><span>' + step[0] + '</span>' +
            (i < 4 ? '<span class="omega-v2-flow-arrow">›</span>' : '') + '</span>';
        }).join('') + '</div></div></section>' + mineConstructionMarkup(site);
    }
    function renderKpi(labelText, value, meta, stateClass) {
      return '<div class="omega-v2-kpi" data-kpi-state="' + esc(stateClass || 'neutral') + '"><span>' + esc(labelText) + '</span><strong>' +
        esc(value) + '</strong><small>' + esc(meta || '') + '</small></div>';
    }
    var outputHeadline = sumUnitGroups(currentOutputGroups);
    var countryLabel = playerCountryDisplayName(countryKey);
    var dashMarkup = photoMarkup + '<div class="omega-v2-kpis omega-v2-resource-command-kpis">' +
      renderKpi('Registered mines', String(model.sites.filter(eligible).length), model.sites.length + ' sites', 'neutral') +
      renderKpi('Producing now', String(producingSites.length), 'Recorded this turn', portfolioBalanceState) +
      renderKpi('Pending projects', String(mineProjects.length), 'Mine construction', mineProjects.length ? 'shortage' : 'neutral') +
      renderKpi('Blocked supply', String(blockedFlows.length), 'Recorded unresolved flows', blockedFlows.length ? 'shortage' : 'adequate') +
      renderKpi('Resource types', String(distinctResources.length), 'Available in country', 'neutral') +
      renderKpi('Today output', outputHeadline, 'Kept separate by unit', portfolioBalanceState) +
      '</div><div class="omega-v2-mine-summary-grid"><section class="omega-v2-card omega-v2-mine-summary"><h2>Mine portfolio · ' + esc(countryLabel) +
      '</h2><p>Review mine projects, daily output and supply availability for this country.</p><div class="omega-v2-mine-summary-links">' +
      '<button class="omega-v2-button omega-v2-button--primary" data-omega-v2-resource-tab="mines">Mines</button>' +
      '<button class="omega-v2-button omega-v2-button--quiet" data-omega-v2-resource-tab="logistics">Stock &amp; Logistics</button>' +
      '<button class="omega-v2-button omega-v2-button--quiet" data-omega-v2-resource-tab="inventory">Inventory / Warehouse</button>' +
      '<button class="omega-v2-button omega-v2-button--quiet" data-omega-v2-resource-tab="reports">Reports</button></div></section>' +
      '<section class="omega-v2-card omega-v2-production-flow"><h2>Mine-to-industry flow</h2><div class="omega-v2-flow-steps">' +
      [['Extraction','mine'],['Raw Warehouse','warehouse'],['Transport','truck'],['Factory','factory'],['Economy','chart']].map(function (step, i) {
        return '<span class="omega-v2-flow-step"><span class="omega-v2-flow-icon" data-flow-icon="' + step[1] + '">' +
          ({mine:'⛏',warehouse:'▤',truck:'⇢',factory:'▥',chart:'↗'}[step[1]]) + '</span><span>' + step[0] + '</span>' +
          (i < 4 ? '<span class="omega-v2-flow-arrow">›</span>' : '') + '</span>';
      }).join('') + '</div></section></div>';
    function rawResourceCard(rid) {
      var rawWarehouseStock = stockFor(rid, rawStock);
      var currentStock = currentStockFor(rid, rawWarehouseStock, null);
      var demand = dailyDemand(rid);
      var unit = resourceUnit(rid);
      var state = stockStatusInfo(rid, currentStock, demand, unit);
      return '<article class="omega-v2-inventory-resource-card" data-resource-id="' + esc(rid) +
        '" data-stock-state="' + esc(state.state) + '">' +
        '<div class="omega-v2-inventory-resource-head"><span class="omega-v2-inventory-resource-icon">' +
        resourceIconMarkup(rid, resourceLabel(rid)) + '</span><div class="omega-v2-inventory-resource-name"><h3>' +
        esc(resourceLabel(rid)) + '</h3></div></div>' +
        '<div class="omega-v2-inventory-resource-metrics">' +
        '<div><span>Current stock</span><strong class="omega-v2-current-stock-cell">' +
        (currentStock === null ? 'Not recorded' : amount(currentStock, unit)) + '</strong></div>' +
        '<div><span>Daily demand</span><strong>' +
        (demand === null ? 'Not recorded' : amount(demand, resourceDemandUnit(rid, unit))) + '</strong></div>' +
        '</div><div class="omega-v2-inventory-status-line">' +
        '<span class="omega-v2-inventory-status-badge omega-v2-stock-status" data-state="' + esc(state.state) + '">' +
        '<strong>Status</strong>' + esc(state.label) + '</span></div>' +
        '<div class="omega-v2-inventory-coverage"><span>Stock coverage</span><strong>' + esc(state.coverageLabel) + '</strong></div>' +
        (state.targetNote ? '<div class="omega-v2-inventory-target-note">' + esc(state.targetNote) + '</div>' : '') +
        '<div class="omega-v2-inventory-resource-origin"><span class="omega-v2-inventory-origin-heading">Supply source</span>' +
        '<div class="omega-v2-inventory-origin-list">' + state.origin + '</div></div></article>';
    }
    function processedProductLabel(productId) {
      var catalog = g.OmegaResourceIndustrialCatalogData || g.Omega && g.Omega.ResourceIndustrialCatalogData || {};
      var products = catalog.productProfiles || catalog.products || {};
      var row = products[productId] || products[String(productId || '').toLowerCase()] || null;
      return String(row && (row.name || row.displayName || row.label) ||
        String(productId || '').trim().replace(/[_-]+/g, ' ').replace(/\b\w/g, function (ch) { return ch.toUpperCase(); }) ||
        'Industrial product');
    }
    function processedProductCard(productId) {
      var quantity = stockFor(productId, processedStockDisplay);
      var productUnit = '';
      var unitMap = processedWarehouse.unitsByProduct || processedWarehouse.inventoryUnits || inventoryUnits;
      var unitKey = Object.keys(unitMap).find(function (key) { return key.toLowerCase() === String(productId).toLowerCase(); });
      if (unitKey) productUnit = String(unitMap[unitKey] || '');
      return '<article class="omega-v2-inventory-product-card" data-product-id="' + esc(productId) + '">' +
        '<div class="omega-v2-inventory-product-art">' + resourceIconMarkup(productId, processedProductLabel(productId)) + '</div>' +
        '<div class="omega-v2-inventory-product-copy"><span>Finished goods · Processed warehouse</span><h3>' +
        esc(processedProductLabel(productId)) + '</h3><strong>' +
        (quantity === null ? 'Not recorded' : amount(quantity, productUnit)) + '</strong></div></article>';
    }
    var rawInventoryCardsMarkup = rawInventoryKeys.length
      ? '<div class="omega-v2-grid omega-v2-raw-resource-grid" data-omega-v2-raw-resource-inventory>' +
        rawInventoryKeys.map(rawResourceCard).join('') + '</div>'
      : '<div class="omega-v2-empty">No canonical raw-resource identities are available.</div>';
    var processedGoodsCardsMarkup = processedInventoryKeys.length
      ? '<div class="omega-v2-grid omega-v2-processed-goods-grid" data-omega-v2-processed-goods-inventory>' +
        processedInventoryKeys.map(processedProductCard).join('') + '</div>'
      : '<div class="omega-v2-empty">No finished-goods stock is currently recorded in the processed warehouse.</div>';
    var rawInventorySectionMarkup = '<section class="omega-v2-card omega-v2-raw-inventory-section">' +
      '<div class="omega-v2-card-header"><div><h2>Current Stock · Raw Resource Inventory</h2><p>Mine output and raw-resource receipts held by the national warehouse.</p></div>' +
      '<span class="omega-v2-status" data-state="operational">' + fmt(rawInventoryKeys.length) + ' resource identities</span></div>' +
      rawInventoryCardsMarkup + '</section>';
    var processedInventorySectionMarkup = '<section class="omega-v2-card omega-v2-processed-inventory-section">' +
      '<div class="omega-v2-card-header"><div><h2>Processed Goods Warehouse</h2><p>Processed goods held by the processed-goods warehouse. Kept separate from raw resources and factory-held inputs.</p></div>' +
      '<span class="omega-v2-status" data-state="neutral">' + fmt(processedInventoryKeys.length) + ' product balances</span></div>' +
      processedGoodsCardsMarkup + '</section>';
    var rawInventoryRows = inventoryRows.filter(function (row) {
      var stage = String(row.stage || '').toUpperCase();
      var isRawResource = canonicalRawResourceIds.indexOf(String(row.resourceId || '').toLowerCase()) >= 0;
      return stage === 'RAW' || (!stage && isRawResource);
    });
    var processedInventoryRows = inventoryRows.filter(function (row) {
      var stage = String(row.stage || '').toUpperCase();
      return stage === 'INTERMEDIATE' || stage === 'FINISHED' || stage === 'PROCESSED';
    });
    var rawBatchHistoryMarkup = rawInventoryRows.length
      ? '<section class="omega-v2-card omega-v2-movement-card"><h2>Recent batches · raw resources</h2><div class="omega-v2-table-wrap"><table><thead><tr><th>Resource</th><th>Quantity</th><th>Raw warehouse</th><th>Status</th></tr></thead><tbody>' +
        rawInventoryRows.slice(-40).reverse().map(function (row) {
          return '<tr><td>' + resourceIconMarkup(row.resourceId, resourceLabel(row.resourceId)) + esc(resourceLabel(row.resourceId)) +
            '</td><td>' + amount(row.quantity, resourceUnit(row.resourceId) || (/SIMULATION.*UNIT/i.test(String(row.unit || '')) ? '' : row.unit)) +
            '</td><td>' + esc(row.location || '—') + '</td><td>' + esc(human(row.status)) + '</td></tr>';
        }).join('') + '</tbody></table></div></section>' : '';
    var processedBatchHistoryMarkup = processedInventoryRows.length
      ? '<section class="omega-v2-card omega-v2-movement-card"><h2>Recent processed-product batches</h2><div class="omega-v2-table-wrap"><table><thead><tr><th>Product</th><th>Quantity</th><th>Processed warehouse</th><th>Status</th></tr></thead><tbody>' +
        processedInventoryRows.slice(-40).reverse().map(function (row) {
          return '<tr><td>' + esc(processedProductLabel(row.resourceId)) + '</td><td>' + amount(row.quantity, row.unit) +
            '</td><td>' + esc(row.location || '—') + '</td><td>' + esc(human(row.status)) + '</td></tr>';
        }).join('') + '</tbody></table></div></section>' : '';
    var dashboardStockMarkup = rawInventorySectionMarkup + processedInventorySectionMarkup;
    dashMarkup += dashboardStockMarkup + factoryHeldInputMarkup;

    var startupBaselineRuntime = g.OmegaResourceStartupBaseline || g.Omega && g.Omega.ResourceStartupBaseline || null;
    var stockTargetDays = null;
    try {
      if (startupBaselineRuntime && typeof startupBaselineRuntime.getFactoryInputCoverageDays === 'function') {
        stockTargetDays = numberOrNull(startupBaselineRuntime.getFactoryInputCoverageDays(countryKey));
      }
    } catch (_) {}
    if (stockTargetDays === null) {
      stockTargetDays = numberOrNull(gameResource.factoryInputCoverageDays) ||
        numberOrNull(gameResource.factoryInputBaselineV1 && gameResource.factoryInputBaselineV1.targetCoverageDays);
    }
    var canEditStockTarget = canOperate && startupBaselineRuntime &&
      typeof startupBaselineRuntime.setFactoryInputCoverageDays === 'function';
    var stockTargetControl = '<section class="omega-v2-stock-target"><div class="omega-v2-stock-target-copy"><strong>Factory input stock target</strong>' +
      '<small>Daily input demand × target days. Only the missing quantity is added.</small></div>' +
      (canEditStockTarget ? '<div class="omega-v2-stock-target-control"><label>Coverage days<input type="number" min="1" max="3650" step="1" value="' +
        esc(stockTargetDays === null ? '' : String(Math.round(stockTargetDays))) + '" data-omega-v2-coverage-days-input></label>' +
        '<button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-coverage-apply' +
        (root.__omegaV2CoverageSaving ? ' disabled' : '') + '>Apply</button></div>' :
        '<span class="omega-v2-stock-target-readonly">Saved target: ' +
          (stockTargetDays === null ? 'Not recorded' : esc(fmt(stockTargetDays) + ' days')) + '</span>') +
      '</section>';
    var inventoryMarkup = stockTargetControl + '<div class="omega-v2-kpis">' +
      renderKpi('Raw resource types', String(rawInventoryKeys.length), 'Canonical natural-resource identities', 'neutral') +
      renderKpi('Stocked raw types', String(rawInventoryKeys.filter(function (key) { return val(rawStock[key]) > 0; }).length), 'Positive on-hand raw balances', 'neutral') +
      renderKpi('Finished goods types', String(processedInventoryKeys.length), 'Processed warehouse only', 'neutral') +
      renderKpi('Raw batches', String(rawInventoryRows.length), 'Raw warehouse batch records', 'neutral') +
      renderKpi('Processed batches', String(processedInventoryRows.length), 'Finished-goods batch records', 'neutral') +
      '</div>' + rawInventorySectionMarkup + processedInventorySectionMarkup +
      factoryHeldInputMarkup + rawBatchHistoryMarkup + processedBatchHistoryMarkup;
    function logisticsStatus(value) {
      var s = String(value || '').toUpperCase();
      if (/DELIVERED|RECEIVED|COMPLETED/.test(s)) return {label:'Delivered',state:'operational'};
      if (/IN_TRANSIT|DISPATCHED|RESERVED/.test(s)) return {label:'In transit',state:'unknown'};
      if (/BLOCKED|FAILED|REJECTED|SHORTAGE/.test(s)) return {label:'Blocked',state:'danger'};
      if (/AWAITING|PENDING|QUEUED/.test(s)) return {label:'Pending',state:'attention'};
      return {label:human(s),state:'unknown'};
    }
    var logisticsFleetViewCache = Object.create(null);
    var logisticsTransportModeMeta = {
      truck: { label: 'Road trucks', unit: 'trucks', single: 'truck' },
      rail: { label: 'Freight train sets', unit: 'train sets', single: 'train set' },
      ship: { label: 'Cargo ships', unit: 'ships', single: 'ship' },
      barge: { label: 'River barges', unit: 'barges', single: 'barge' },
      pipeline: { label: 'Pipeline lines', unit: 'lines', single: 'line' }
    };
    function readSiteTransportFleet(route) {
      var siteId = String(route && route.siteId || '').trim();
      var countryId = String(route && route.countryId || countryKey || '').trim().toUpperCase();
      var cacheKey = countryId + '|' + siteId;
      if (!siteId || !countryId) return null;
      if (Object.prototype.hasOwnProperty.call(logisticsFleetViewCache, cacheKey)) return logisticsFleetViewCache[cacheKey];
      var network = g.OmegaResourceIndustrialNetwork || (g.Omega && g.Omega.ResourceIndustrialNetwork);
      var result = null;
      try {
        if (network && typeof network.getTransportFleet === 'function') {
          result = network.getTransportFleet({ countryId: countryId, siteId: siteId });
        }
      } catch (_) { result = null; }
      logisticsFleetViewCache[cacheKey] = result;
      return result;
    }
    function logisticsNormalizedRouteLegs(route) {
      var plan = route && route.routePlan || {};
      var rows = safeArray(plan.legs);
      var routeType = String(plan.routeType || '').toUpperCase();
      var strategyCode = String(plan.strategyCode || '').toUpperCase();
      var rowModes = rows.map(function (leg) { return String(leg && (leg.transportMode || leg.mode) || '').toLowerCase(); });
      var genericIntermodal = routeType === 'TRUCK_TO_RAIL_TO_TRUCK' ||
        (strategyCode === 'MINE_HAULAGE_RAIL_LAST_MILE' && rowModes.indexOf('truck') >= 0 && rowModes.indexOf('rail') >= 0);
      if (!genericIntermodal || rows.length < 2) return rows;
      if (rowModes.indexOf('truck') < 0 || rowModes.indexOf('rail') < 0 ||
          rowModes.some(function (mode) { return mode !== 'truck' && mode !== 'rail'; })) return rows;
      var catalog = g.OmegaResourceIndustrialCatalogData || (g.Omega && g.Omega.ResourceIndustrialCatalogData);
      var resourceRules = catalog && catalog.resourceRules || {};
      var preferred = safeArray(resourceRules[route.resourceId] && resourceRules[route.resourceId].preferredModes)
        .map(function (mode) { return String(mode || '').toLowerCase(); });
      var modeProfiles = catalog && catalog.transportModes || {};
      var chosen = preferred.filter(function (mode) { return Object.prototype.hasOwnProperty.call(modeProfiles, mode); })[0];
      if (!chosen) chosen = preferred.filter(function (mode) { return rowModes.indexOf(mode) >= 0; })[0];
      if (!chosen) return rows;
      var distance = numberOrNull(plan.estimatedRouteDistanceKm);
      if (distance === null) distance = rows.reduce(function (sum, leg) {
        return sum + (numberOrNull(leg && (leg.estimatedDistanceKm !== undefined ? leg.estimatedDistanceKm : leg.distanceKm)) || 0);
      }, 0);
      var profile = modeProfiles[chosen] || {};
      var reference = rows.filter(function (leg) {
        return String(leg && (leg.transportMode || leg.mode) || '').toLowerCase() === chosen;
      })[0] || null;
      var speed = Math.max(1, numberOrNull(profile.speedKmh) || 1);
      var loadHours = Math.max(0, numberOrNull(profile.loadHours) || 0);
      var unloadHours = Math.max(0, numberOrNull(profile.unloadHours) || 0);
      var transferHours = Math.max(0, numberOrNull(reference && (reference.transferHours !== undefined ?
        reference.transferHours : reference.transferTimeHours)) || 0);
      var cycleHours = (2 * Math.max(0, distance) / speed) + loadHours + unloadHours + transferHours;
      var payload = numberOrNull(reference && reference.designCapacityPerTrip);
      if (payload === null) payload = numberOrNull(profile.payloadTonnes);
      var production = route && route.planningProduction || null;
      var rate = numberOrNull(production && production.rate);
      var productionUnit = logisticsPlanningUnit(production && production.unit);
      var capacityPerDay = null, capacityUnit = null;
      if (chosen === 'pipeline') {
        // A pipeline's count unit is lines, not trucks. Only explicit per-line
        // throughput can convert cargo flow into a line count; corridor capacity
        // alone does not prove how many parallel lines are installed.
        var lineCapacity = numberOrNull(reference && (reference.designCapacityPerLinePerDay !== undefined ?
          reference.designCapacityPerLinePerDay : (reference.capacityPerLinePerDay !== undefined ?
          reference.capacityPerLinePerDay : reference.lineCapacityPerDay)));
        if (lineCapacity !== null && lineCapacity > 0) {
          capacityPerDay = lineCapacity;
          capacityUnit = logisticsPlanningUnit(reference && (reference.designCapacityPerLineUnit ||
            reference.capacityPerLineUnit || reference.lineCapacityUnit || reference.designCapacityUnit ||
            reference.capacityUnit || plan.capacityUnit));
        } else {
          capacityPerDay = null;
          capacityUnit = null;
        }
      } else if (payload !== null && payload > 0 && cycleHours > 0) {
        // Cycle time is distance-aware: one design vehicle's throughput falls as
        // round-trip distance and load/unload time increase.
        capacityPerDay = payload * 24 / cycleHours;
        capacityUnit = 'TONNES_PER_DAY';
      }
      var slots = rate !== null && rate >= 0 && capacityPerDay !== null && capacityPerDay > 0 &&
        productionUnit && capacityUnit && productionUnit === capacityUnit ? Math.max(0, Math.ceil(rate / capacityPerDay)) : null;
      var leg = {};
      Object.keys(reference || {}).forEach(function (key) { leg[key] = reference[key]; });
      leg.legId = 'ROUTE_' + String(route.siteId || route.routeId || 'MINE') + '_COMMODITY_MODE_ONLY';
      leg.sequence = 1;
      leg.fromNodeId = rows[0] && rows[0].fromNodeId || route.siteId || null;
      leg.fromNodeType = 'MINE_SITE';
      leg.toNodeId = rows[rows.length - 1] && rows[rows.length - 1].toNodeId || plan.destinationWarehouseId || null;
      leg.toNodeType = 'COUNTRY_RAW_INVENTORY_WAREHOUSE';
      leg.transportMode = chosen;
      leg.vehicleClass = profile.vehicle || reference && reference.vehicleClass || chosen;
      leg.estimatedDistanceKm = Math.max(0, distance);
      leg.distanceAuthority = 'SIMULATED_TOTAL_ROUTE_DISTANCE_NOT_A_SURVEYED_MODE_PATH';
      leg.estimatedTravelHours = Math.max(0, distance) / speed;
      leg.designCapacityPerTrip = chosen === 'pipeline' ? null : payload;
      leg.designCapacityPerDay = capacityPerDay;
      leg.designCapacityUnit = capacityUnit;
      leg.designCapacityPerLinePerDay = chosen === 'pipeline' && capacityPerDay !== null ? capacityPerDay : null;
      leg.cycleHoursForOneDesignVehicle = cycleHours;
      leg.tripsPerVehiclePerDay = chosen === 'pipeline' ? null : (cycleHours > 0 ? 24 / cycleHours : null);
      leg.requiredDesignFleetSlots = slots;
      leg.designFleetCalculation = {
        status: slots === null ? 'UNAVAILABLE' : 'CALCULATED', requiredUnits: slots,
        countUnit: chosen === 'pipeline' ? 'PIPELINE_LINES' : 'TRANSPORT_VEHICLES',
        productionRate: rate, productionUnit: productionUnit || null,
        capacityPerDesignUnitPerDay: capacityPerDay, capacityUnit: capacityUnit || null,
        reason: slots === null ? 'PRODUCTION_RATE_OR_COMPATIBLE_MODE_CAPACITY_UNAVAILABLE' : null,
        authority: 'SCENARIO_SIMULATION_DATA_AND_DISTANCE_AWARE_TRANSPORT_CATALOG', simulationOnly: true
      };
      leg.actualBoundFleetUnits = null;
      leg.vehicleAssetIds = null;
      leg.status = 'DESIGN_ONLY_NOT_DISPATCHABLE';
      leg.transportIconKey = chosen === 'rail' ? 'train' : chosen;
      leg.transportIconAssetPath = 'assets/omega-industrial-icons-v1/transport/' + (chosen === 'rail' ? 'train' : chosen) + '.svg';
      leg.routeSelectionAuthority = 'RESOURCE_RULE_PREFERRED_MODE_FROM_UNVERIFIED_INTERMODAL_TEMPLATE';
      return [leg];
    }
    function logisticsPlanningUnit(value) {
      var unit = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
      var aliases = {
        RAW_CARGO_TONNES_PER_DAY:'TONNES_PER_DAY', RAW_CARGO_TONS_PER_DAY:'TONNES_PER_DAY',
        METRIC_TONS_PER_DAY:'TONNES_PER_DAY', METRIC_TONNES_PER_DAY:'TONNES_PER_DAY',
        TONS_PER_DAY:'TONNES_PER_DAY', TONNE_PER_DAY:'TONNES_PER_DAY', TONNES_ORE_PER_DAY:'TONNES_PER_DAY',
        BARREL_PER_DAY:'BARRELS_PER_DAY', BBL_PER_DAY:'BARRELS_PER_DAY'
      };
      return aliases[unit] || unit;
    }

    function logisticsProductionRatePerDay(route) {
      route = route && typeof route === 'object' ? route : {};
      var routePlan = route.routePlan && typeof route.routePlan === 'object' ? route.routePlan : {};
      var matchedSite = safeArray(model && model.sites).find(function (site) {
        return String(site && site.siteId || '') === String(route.siteId || '');
      }) || null;
      var rawSite = matchedSite && matchedSite.raw && typeof matchedSite.raw === 'object' ? matchedSite.raw : {};
      var productionMetric = matchedSite && matchedSite.production || null;
      var runtimeCandidates = [
        route.planningProduction, route.productionInput, routePlan.productionInput,
        route.productionModel, rawSite.productionModel, rawSite.simulation,
        rawSite.quantitative && rawSite.quantitative.production, rawSite.production,
        rawSite.sourceSiteRecord && rawSite.sourceSiteRecord.production,
        rawSite.sourceSiteRecord && rawSite.sourceSiteRecord.quantitative &&
          rawSite.sourceSiteRecord.quantitative.production
      ];
      if (productionMetric) {
        runtimeCandidates.push({
          rate: productionMetric.value !== null && productionMetric.value !== undefined
            ? productionMetric.value : productionMetric.modeledValue,
          unit: productionMetric.unit,
          status: productionMetric.status,
          basis: productionMetric.basis
        });
      }
      function readRate(source) {
        if (!source || typeof source !== 'object') return null;
        var annualObject = source.annualProduction && typeof source.annualProduction === 'object'
          ? source.annualProduction : null;
        var dailyValue = numberOrNull(source.dailyRate !== undefined ? source.dailyRate :
          source.dailyProductionRate !== undefined ? source.dailyProductionRate :
          source.productionRatePerDay !== undefined ? source.productionRatePerDay : null);
        var annualValue = numberOrNull(annualObject && annualObject.value !== undefined
          ? annualObject.value : source.annualProduction !== undefined && !annualObject
            ? source.annualProduction : source.annual !== undefined ? source.annual : null);
        var rate = dailyValue !== null ? dailyValue : numberOrNull(source.rate !== undefined ? source.rate :
          source.productionRate !== undefined ? source.productionRate :
          source.outputRate !== undefined ? source.outputRate :
          source.quantity !== undefined ? source.quantity : source.value);
        var hasDirectRate = rate !== null;
        var rawUnit = String(source.dailyRateUnit || source.rateUnit || source.productionRateUnit ||
          source.productionUnit || (hasDirectRate ? source.unit : null) ||
          source.annualUnit || (annualObject && annualObject.unit) || source.unit || '').trim().toUpperCase();
        var period = String(source.productionPeriod || source.ratePeriod || source.period ||
          source.timeBasis || source.measurementPeriod || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
        var unit = rawUnit.replace(/\s*\/\s*/g, '_PER_').replace(/[\s-]+/g, '_');
        var unitDay = /(?:_PER_DAY|_DAILY|_DAY)$/.test(unit) || /^(?:PER_DAY|DAILY)$/.test(period);
        var unitYear = /(?:_PER_YEAR|_YEARLY|_ANNUAL|_YEAR)$/.test(unit) ||
          /^(?:PER_YEAR|ANNUAL|YEARLY|YEAR)$/.test(period) || annualValue !== null;
        var unitMonth = /(?:_PER_MONTH|_MONTHLY|_MONTH)$/.test(unit) ||
          /^(?:PER_MONTH|MONTHLY|MONTH)$/.test(period);
        var explicitDaily = dailyValue !== null || /^(?:PER_DAY|DAILY|DAY)$/.test(period);
        // A declared daily rate wins over a separate annual summary. Some source
        // records carry both values, and the annual value may use a different unit.
        if (annualValue !== null && dailyValue === null && !unitDay && !explicitDaily) {
          rate = annualValue;
          if (source.annualUnit || (annualObject && annualObject.unit)) {
            unit = String(source.annualUnit || annualObject.unit).trim().toUpperCase()
              .replace(/\s*\/\s*/g, '_PER_').replace(/[\s-]+/g, '_');
          }
        }
        if (rate === null || rate < 0 || !unit) return null;
        if (unitDay || explicitDaily) {
          unit = unit.replace(/(?:_PER_DAY|_DAILY|_DAY|_PER_YEAR|_YEARLY|_ANNUAL|_YEAR|_PER_MONTH|_MONTHLY|_MONTH)$/, '');
          return { rate:rate, unit:logisticsPlanningUnit(unit + '_PER_DAY'),
            source:dailyValue !== null ? 'EXPLICIT_DAILY_PRODUCTION_RATE' : 'DECLARED_PER_DAY_UNIT' };
        }
        if (unitMonth) {
          unit = unit.replace(/(?:_PER_MONTH|_MONTHLY|_MONTH)$/, '');
          return { rate:rate / 30, unit:logisticsPlanningUnit(unit + '_PER_DAY'), source:'MONTHLY_RATE_CONVERTED_TO_DAILY_30_DAY_MONTH' };
        }
        if (unitYear) {
          unit = unit.replace(/(?:_PER_YEAR|_YEARLY|_ANNUAL|_YEAR)$/, '');
          return { rate:rate / 365, unit:logisticsPlanningUnit(unit + '_PER_DAY'), source:'ANNUAL_PRODUCTION_CONVERTED_TO_DAILY_365_DAY_YEAR' };
        }
        // A raw quantity with no declared time basis is not a daily production rate.
        return null;
      }
      for (var i = 0; i < runtimeCandidates.length; i += 1) {
        var value = readRate(runtimeCandidates[i]);
        if (value) return value;
      }
      return null;
    }

    function logisticsDesignFleetEstimate(route, legs, byMode) {
      var production = logisticsProductionRatePerDay(route);
      var rate = numberOrNull(production && production.rate);
      var productionUnit = logisticsPlanningUnit(production && production.unit);
      var gasVolumeBaseUnit = String(productionUnit || '').replace(/_PER_DAY$/, '');
      var gasVolumeFactorsToMmcF = {
        BCM:35314.6667, BCF:1000, MCM:35.3146667, MCF:0.001,
        BILLION_CUBIC_METRES:35314.6667, BILLION_CUBIC_METERS:35314.6667,
        BILLION_CUBIC_FEET:1000, MILLION_CUBIC_METRES:35.3146667,
        MILLION_CUBIC_METERS:35.3146667, THOUSAND_CUBIC_FEET:0.001
      };
      var gasVolumeFactorToMmcF = gasVolumeFactorsToMmcF[gasVolumeBaseUnit] || 1;
      if (rate !== null && gasVolumeFactorToMmcF !== 1) {
        rate *= gasVolumeFactorToMmcF;
        productionUnit = 'MMCF_PER_DAY';
      }
      var routePlan = route && route.routePlan || {};
      var catalog = g.OmegaResourceIndustrialCatalogData || (g.Omega && g.Omega.ResourceIndustrialCatalogData);
      var transportProfiles = catalog && catalog.transportModes || {};
      var totals = Object.create(null);
      safeArray(legs).forEach(function (leg, index) {
        var mode = String(leg && (leg.transportMode || leg.mode) || '').toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(logisticsTransportModeMeta, mode)) return;
        var saved = byMode && byMode[mode] || {};
        var overrides = saved.profileOverrides && typeof saved.profileOverrides === 'object' ? saved.profileOverrides : {};
        var profile = Object.assign({}, transportProfiles[mode] || {}, overrides);
        var payload = mode === 'pipeline' ? null : numberOrNull(leg && leg.designCapacityPerTrip);
        if (payload === null && mode !== 'pipeline') payload = numberOrNull(saved.payloadTonnes);
        if (payload === null && mode !== 'pipeline') payload = numberOrNull(profile.payloadTonnes);
        var payloadUnit = logisticsPlanningUnit(leg && (leg.designCapacityPerTripUnit || leg.payloadUnit) ||
          saved.payloadUnit || profile.payloadUnit || profile.payloadCapacityUnit || '');
        if (payloadUnit && mode !== 'pipeline') {
          // Route data may name payload by carrier class (train/vessel) instead of trip.
          // Treat these as per-trip cargo units so they can match daily mine-production units.
          payloadUnit = payloadUnit.replace(/_PER_(?:TRAIN|TRAIN_SET|TRAINSET|VESSEL|SHIP|BARGE|TRUCK|RAIL_CAR|RAILCAR|TANKER|CARRIER|VEHICLE)$/, '_PER_TRIP');
          payloadUnit = payloadUnit.replace(/_PER_DAY$/, '').replace(/_PER_TRIP$/, '') + '_PER_TRIP';
        }
        else if (payload !== null) payloadUnit = 'TONNES_PER_TRIP';
        var distance = numberOrNull(leg && (leg.estimatedDistanceKm !== undefined ? leg.estimatedDistanceKm : leg.distanceKm));
        var speed = numberOrNull(leg && leg.speedKmh);
        if (speed === null) speed = numberOrNull(saved.speedKmh);
        if (speed === null) speed = numberOrNull(profile.speedKmh);
        speed = speed !== null && speed > 0 ? speed : null;
        var loadHours = numberOrNull(leg && leg.loadHours);
        if (loadHours === null) loadHours = numberOrNull(saved.loadHours);
        if (loadHours === null) loadHours = numberOrNull(profile.loadHours);
        loadHours = loadHours !== null && loadHours >= 0 ? loadHours : null;
        var unloadHours = numberOrNull(leg && leg.unloadHours);
        if (unloadHours === null) unloadHours = numberOrNull(saved.unloadHours);
        if (unloadHours === null) unloadHours = numberOrNull(profile.unloadHours);
        unloadHours = unloadHours !== null && unloadHours >= 0 ? unloadHours : null;
        var transferHours = numberOrNull(leg && (leg.transferHours !== undefined ? leg.transferHours : leg.transferTimeHours));
        transferHours = transferHours !== null && transferHours >= 0 ? transferHours : 0;
        var cycleHours = numberOrNull(leg && leg.cycleHoursForOneDesignVehicle);
        if ((cycleHours === null || cycleHours <= 0) && distance !== null && distance >= 0 &&
            speed !== null && loadHours !== null && unloadHours !== null) {
          cycleHours = (2 * distance / speed) + loadHours + unloadHours + transferHours;
        }
        var perVehicleCapacityPerDay = mode !== 'pipeline' && payload !== null && payload > 0 &&
          cycleHours !== null && cycleHours > 0 ? payload * 24 / cycleHours : null;
        var perVehicleUnit = payloadUnit ? payloadUnit.replace(/_PER_TRIP$/, '_PER_DAY') : null;
        var lineCapacity = mode === 'pipeline' ? numberOrNull(leg && (
          leg.designCapacityPerLinePerDay !== undefined ? leg.designCapacityPerLinePerDay :
          (leg.capacityPerLinePerDay !== undefined ? leg.capacityPerLinePerDay : leg.lineCapacityPerDay))) : null;
        var lineUnit = logisticsPlanningUnit(leg && (
          leg.designCapacityPerLineUnit || leg.capacityPerLineUnit || leg.lineCapacityUnit ||
          (lineCapacity !== null ? (leg.designCapacityUnit || leg.capacityUnit || routePlan.capacityUnit) : '')));
        if (lineUnit && !/_PER_DAY$/.test(lineUnit)) lineUnit = lineUnit.replace(/_PER_TRIP$/, '') + '_PER_DAY';
        var routeCapacity = numberOrNull(leg && leg.designCapacityPerDay);
        var routeCapacityUnit = logisticsPlanningUnit(leg && (leg.designCapacityUnit || leg.capacityUnit || routePlan.capacityUnit || ''));
        var rateAvailable = rate !== null && rate >= 0 && !!productionUnit;
        var vehicleDemandRate = rate, vehicleDemandUnit = productionUnit, routeCapacityBased = false;
        // When mine output is missing or uses another unit, the route's own
        // corridor capacity is a valid design target for sizing non-pipeline modes.
        // This is not displayed as mine production or as an actual fleet count.
        if (mode !== 'pipeline' && (vehicleDemandRate === null || vehicleDemandUnit !== perVehicleUnit) &&
            routeCapacity !== null && routeCapacity >= 0 && routeCapacityUnit && routeCapacityUnit === perVehicleUnit) {
          vehicleDemandRate = routeCapacity;
          vehicleDemandUnit = routeCapacityUnit;
          routeCapacityBased = true;
        }
        var units = null, tripsPerDay = null, basis = '';
        var routeCapacityComparable = routeCapacity !== null && routeCapacityUnit === productionUnit;
        var routeBottleneck = rateAvailable && routeCapacityComparable && routeCapacity + 1e-9 < rate;
        if (rateAvailable && rate === 0) {
          units = 0; tripsPerDay = mode === 'pipeline' ? null : 0; basis = 'zero-production-rate';
        } else if (rateAvailable && mode === 'pipeline') {
          if (lineCapacity !== null && lineCapacity > 0 && lineUnit && lineUnit === productionUnit) {
            units = Math.ceil(rate / lineCapacity);
            basis = 'ceil-production-per-day-divided-by-explicit-pipeline-line-capacity';
          }
        } else if (mode !== 'pipeline' && vehicleDemandRate !== null && vehicleDemandRate >= 0 &&
            perVehicleCapacityPerDay !== null && perVehicleCapacityPerDay > 0 &&
            perVehicleUnit && vehicleDemandUnit === perVehicleUnit) {
          units = Math.max(0, Math.ceil(vehicleDemandRate / perVehicleCapacityPerDay));
          tripsPerDay = payload !== null && payload > 0 ? vehicleDemandRate / payload : null;
          basis = routeCapacityBased
            ? 'route-capacity-envelope-divided-by-distance-aware-per-vehicle-daily-capacity'
            : 'ceil-production-per-day-divided-by-distance-aware-per-vehicle-daily-capacity';
        }
        if (!totals[mode]) totals[mode] = {
          estimatedUnits: 0, estimatedTripsPerDay: 0, hasTripRate: true, available: true,
          legCount: 0, basis: [], routeBottleneckLegs: 0, legs: []
        };
        var stat = totals[mode];
        stat.legCount += 1;
        stat.basis.push(basis || 'production-rate-or-unit-compatible-capacity-unavailable');
        if (units === null || !Number.isFinite(units)) stat.available = false;
        else stat.estimatedUnits += units;
        if (tripsPerDay === null || !Number.isFinite(tripsPerDay)) stat.hasTripRate = false;
        else stat.estimatedTripsPerDay += tripsPerDay;
        if (routeBottleneck) stat.routeBottleneckLegs += 1;
        stat.legs.push({
          legIndex:index+1, distanceKm:distance, cycleHours:cycleHours,
          payloadPerTrip:payload, perVehicleCapacityPerDay:perVehicleCapacityPerDay,
          perVehicleCapacityUnit:perVehicleUnit, lineCapacityPerDay:lineCapacity, lineCapacityUnit:lineUnit || null,
          requiredUnits:units, routeCapacityPerDay:routeCapacity, routeCapacityUnit:routeCapacityUnit || null,
          routeCapacityStatus:!routeCapacityComparable ? 'UNKNOWN' : (routeBottleneck ? 'BOTTLENECK' : 'SUFFICIENT'),
          demandBasis:routeCapacityBased ? 'ROUTE_CAPACITY_ENVELOPE' : (rateAvailable ? 'MINE_PRODUCTION_RATE' : 'UNKNOWN'),
          formula:mode === 'pipeline'
            ? 'ceil(production per day / explicit pipeline-line capacity per day)'
            : (routeCapacityBased
              ? 'ceil(route capacity per day / (payload per trip x 24 / round-trip cycle hours))'
              : 'ceil(production per day / (payload per trip x 24 / round-trip cycle hours))')
        });
      });
      Object.keys(totals).forEach(function (mode) {
        var stat = totals[mode];
        if (!stat.available) stat.estimatedUnits = null;
        if (!stat.hasTripRate) stat.estimatedTripsPerDay = null;
        stat.formula = mode === 'pipeline'
          ? 'ceil(production per day / explicit pipeline-line capacity per day)'
          : (stat.basis.length && stat.basis.every(function (entry) {
            return entry === 'route-capacity-envelope-divided-by-distance-aware-per-vehicle-daily-capacity';
          }) ? 'ceil(route capacity per day / (payload per trip x 24 / round-trip cycle hours))'
            : 'ceil(production per day / (payload per trip x 24 / round-trip cycle hours))');
        stat.distanceAware = mode !== 'pipeline' && stat.available && stat.legs.every(function (leg) {
          return leg.cycleHours !== null && leg.perVehicleCapacityPerDay !== null;
        });
      });
      return totals;
    }
        function logisticsTransportIconPath(modeValue, resourceIdValue) {
      var mode = String(modeValue || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      var aliases = {road:'truck',highway:'truck',lorry:'truck',railway:'rail',heavy_rail:'rail',
        train:'rail',sea:'ship',sea_lane:'ship',seaway:'ship',maritime:'ship',inland_waterway:'barge',
        waterway:'barge',pipeline_line:'pipeline'};
      mode = aliases[mode] || mode;
      var resource = String(resourceIdValue || '').trim().toLowerCase();
      var gas = new Set(['natural_gas']);
      var liquid = new Set(['crude_oil','oil_shale']);
      var ore = new Set(['iron_ore','bauxite','chromite','cobalt','copper','nickel','manganese','niobium',
        'tungsten','zinc','rutile','ilmenite','uranium','rare_earth','lithium','tin','platinum','silver',
        'gold','graphite','boron','magnesite']);
      var dryBulk = new Set(['coal','phosphate','potash','salt','silica_sand','construction_aggregate',
        'coral_aggregate','limestone','gypsum','aragonite','basalt','granite','marble','dolomite','diatomite']);
      var cargo = gas.has(resource) ? 'gas' : liquid.has(resource) ? 'liquid' :
        ore.has(resource) ? 'ore' : dryBulk.has(resource) ? 'dry_bulk' : 'general_cargo';
      var byMode = {
        truck:{dry_bulk:'truck-dry-bulk-tipper.svg',liquid:'truck-liquid-tanker.svg',gas:'truck-gas-tanker.svg',
          ore:'truck-ore-hauler.svg',general_cargo:'truck-container-hauler.svg'},
        rail:{dry_bulk:'train-bulk-hopper.svg',liquid:'train-liquid-tank-cars.svg',gas:'train-gas-tank-cars.svg',
          ore:'train-ore-hopper.svg',general_cargo:'train-container-freight.svg'},
        ship:{dry_bulk:'ship-bulk-carrier.svg',liquid:'ship-oil-tanker.svg',gas:'ship-lng-carrier.svg',
          ore:'ship-ore-carrier.svg',general_cargo:'ship-container-carrier.svg'},
        barge:{dry_bulk:'barge-inland-bulk.svg',liquid:'barge-liquid-tanker.svg',gas:'barge-gas-tanker.svg',
          ore:'barge-ore-carrier.svg',general_cargo:'barge-container-cargo.svg'}
      };
      if (mode === 'pipeline') return 'assets/omega-industrial-icons-v1/transport/pipeline.svg';
      var file = byMode[mode] && byMode[mode][cargo];
      if (!file) file = ({truck:'truck.svg',rail:'train.svg',ship:'ship.svg',barge:'barge.svg'})[mode] || 'truck.svg';
      return 'assets/omega-industrial-icons-v1/transport/variants/' + file;
    }
    function logisticsModeGenericIconPath(mode) {
      var icons = { truck:'truck.svg', rail:'train.svg', ship:'ship.svg', barge:'barge.svg', pipeline:'pipeline.svg' };
      return 'assets/omega-industrial-icons-v1/transport/' + (icons[String(mode || '').toLowerCase()] || 'truck.svg');
    }
    function logisticsSiteFleetMarkup(route, legs) {
      var fleet = readSiteTransportFleet(route);
      var ready = !!(fleet && fleet.status === 'READY' && Array.isArray(fleet.transportTypes));
      var byMode = Object.create(null);
      (ready ? fleet.transportTypes : []).forEach(function (row) {
        if (row && row.transportType) byMode[String(row.transportType).toLowerCase()] = row;
      });
      var designByMode = logisticsDesignFleetEstimate(route, legs, byMode);
      var routeModes = [];
      safeArray(legs).forEach(function (leg) {
        var mode = String(leg && (leg.transportMode || leg.mode) || '').toLowerCase();
        if (mode && routeModes.indexOf(mode) === -1) routeModes.push(mode);
      });
      var configuredModeCount = 0, designTotal = 0, designAvailableModes = 0, unknownRouteModes = 0;
      var knownVehicleCount = 0, unknownVehicleModes = 0, pipelineLines = null, pipelineConfigured = false;
      var cards = Object.keys(logisticsTransportModeMeta).map(function (mode) {
        var meta = logisticsTransportModeMeta[mode], row = byMode[mode];
        var count = row ? numberOrNull(row.count) : null;
        var configured = !!(ready && row && row.configured === true && count !== null && count >= 0);
        if (configured) configuredModeCount += 1;
        if (mode === 'pipeline') {
          pipelineConfigured = configured;
          if (configured) pipelineLines = Math.floor(count);
        } else if (configured) {
          knownVehicleCount += Math.floor(count);
        } else {
          unknownVehicleModes += 1;
        }
        var estimate = designByMode[mode] || null;
        var used = routeModes.indexOf(mode) >= 0;
        var estimateLeg = estimate && estimate.legs && estimate.legs.length === 1 ? estimate.legs[0] : null;
        var perUnitCapacity = estimateLeg && (mode === 'pipeline' ? estimateLeg.lineCapacityPerDay :
          estimateLeg.perVehicleCapacityPerDay);
        var perUnitCapacityUnit = estimateLeg && (mode === 'pipeline' ? estimateLeg.lineCapacityUnit :
          estimateLeg.perVehicleCapacityUnit);
        var capacityDetail = perUnitCapacity !== null && perUnitCapacity !== undefined &&
          Number.isFinite(Number(perUnitCapacity)) && perUnitCapacityUnit
          ? ' · ' + fmt(Number(Number(perUnitCapacity).toFixed(4))) + ' ' + buildDisplayUnit(perUnitCapacityUnit) +
            (mode === 'pipeline' ? ' per line' : ' per vehicle') : '';
        var capacityBasedEstimate = !!(estimate && estimate.basis &&
          estimate.basis.indexOf('route-capacity-envelope-divided-by-distance-aware-per-vehicle-daily-capacity') >= 0);
        var estimateLabel = !used ? 'Not used by this route' :
          (estimate && estimate.available ? (capacityBasedEstimate ? 'Route capacity need: ' : 'Design need: ') +
            fmt(estimate.estimatedUnits) + ' ' + (estimate.estimatedUnits === 1 ? meta.single : meta.unit) + capacityDetail +
            (estimate.routeBottleneckLegs ? ' · route capacity bottleneck' : '') :
            (estimate && estimate.routeBottleneckLegs && mode === 'pipeline'
              ? 'Corridor bottleneck · line count unavailable' : 'Design need unavailable'));
        var tripRate = estimate && estimate.estimatedTripsPerDay !== null
          ? ' · ' + fmt(Number(estimate.estimatedTripsPerDay.toFixed(4))) + ' trips/day' : '';
        if (used && estimate && estimate.available) { designTotal += estimate.estimatedUnits; designAvailableModes += 1; }
        if (used && (!estimate || !estimate.available)) unknownRouteModes += 1;
        var perUnitCapacityData = perUnitCapacity !== null && perUnitCapacity !== undefined && Number.isFinite(Number(perUnitCapacity))
          ? String(Number(Number(perUnitCapacity).toFixed(6))) : '';
        var estimateFormula = estimate && estimate.formula || '';
        var iconPath = logisticsTransportIconPath(mode, route && route.resourceId);
        return '<div class="omega-v2-logistics-fleet-mode" data-transport-mode="' + esc(mode) +
          '" data-fleet-configured="' + (configured ? 'true' : 'false') +
          '" data-design-estimate-available="' + (estimate && estimate.available ? 'true' : 'false') +
          '" data-design-estimated-units="' + (estimate && estimate.available ? esc(String(estimate.estimatedUnits)) : '') +
          '" data-design-formula="' + esc(estimateFormula) +
          '" data-design-capacity-per-unit-day="' + esc(perUnitCapacityData) + '">' +
          '<img class="omega-v2-logistics-fleet-mode-icon" src="' + esc(iconPath) + '" alt="' +
          esc(meta.label) + '" width="46" height="30" loading="lazy" decoding="async">' +
          '<div class="omega-v2-logistics-fleet-mode-copy"><span>' + esc(meta.label) + '</span><strong>' +
          esc(configured ? fmt(count) + ' ' + meta.unit : (ready ? 'Not configured' : 'Unknown')) +
          '</strong><small>' + esc(estimateLabel + tripRate) + '</small></div></div>';
      }).join('');
      var countFields = Object.keys(logisticsTransportModeMeta).map(function (mode) {
        var meta = logisticsTransportModeMeta[mode], row = byMode[mode];
        var count = row ? numberOrNull(row.count) : null;
        var configured = !!(ready && row && row.configured === true && count !== null && count >= 0);
        return '<label class="omega-v2-logistics-count-field"><span>' + esc(meta.label) + '</span>' +
          '<input type="number" inputmode="numeric" min="0" step="1" data-omega-v2-fleet-count-input data-transport-mode="' +
          esc(mode) + '" aria-label="' + esc(meta.label + ' count') + '" value="' +
          esc(configured ? String(Math.floor(count)) : '') + '" placeholder="Not configured"></label>';
      }).join('');
      var canManage = !!(ready && String(route && route.countryId || '').trim().toUpperCase() === countryKey &&
        countryKey === livePlayerCountryKey());
      var calculatedTotal = designAvailableModes > 0
         ? fmt(designTotal) + (unknownRouteModes ? ' · partial' : '')
         : '—';
       var calculatedTotalLabel = unknownRouteModes ? 'Known design-unit subtotal' : 'Calculated design units';
      var knownTransportUnitTotal = knownVehicleCount + (pipelineConfigured ? pipelineLines : 0);
      var vehicleSubtotalLabel = unknownVehicleModes ? 'Known vehicle subtotal (some counts unknown)' : 'Configured vehicle total';
      var unknownPipelineLabel = !pipelineConfigured ? 'Pipeline lines unknown' : 'Pipeline lines recorded';
      var combinedSubtotalLabel = unknownVehicleModes || !pipelineConfigured
        ? 'Known combined transport-unit subtotal (vehicles + lines)' : 'Configured combined transport-unit total';
      return '<section class="omega-v2-logistics-fleet-summary" data-omega-v2-logistics-fleet-summary data-site-id="' +
        esc(route && route.siteId || '') + '"><div class="omega-v2-logistics-fleet-heading">' +
        '<span class="omega-v2-eyebrow">TRANSPORT AT THIS MINE</span><strong>' +
        (ready ? fmt(configuredModeCount) + ' of 5 counts configured' : 'Actual fleet counts unknown') +
        '</strong></div><div class="omega-v2-logistics-fleet-grid">' + cards + '</div>' +
        '<div class="omega-v2-logistics-fleet-foot"><span>' + esc(vehicleSubtotalLabel) + ': <strong>' +
        (ready ? fmt(knownVehicleCount) : 'Unknown') + '</strong></span><span>' + esc(unknownPipelineLabel) + ': <strong>' +
        (pipelineConfigured ? fmt(pipelineLines) : 'Unknown') + '</strong></span>' +
        '<span>' + esc(combinedSubtotalLabel) + ': <strong>' +
        (ready ? fmt(knownTransportUnitTotal) : 'Unknown') + '</strong></span>' +
        '<span>Route legs: <strong>' + fmt(safeArray(legs).length) + '</strong></span>' +
        '<span>Transport modes: <strong>' + fmt(routeModes.length) + '</strong></span>' +
        '<span>' + esc(calculatedTotalLabel) + ': <strong>' + calculatedTotal + '</strong></span>' +
        '<span>Design estimates available: <strong>' + fmt(designAvailableModes) + ' of ' +
        fmt(routeModes.length) + '</strong></span></div>' +
        
        (canManage
          ? '<details class="omega-v2-logistics-fleet-editor"><summary>Configure transport counts</summary>' +
            
            '<form data-omega-v2-logistics-fleet-form data-site-id="' + esc(route && route.siteId || '') +
            '" data-country-id="' + esc(route && route.countryId || countryKey || '') + '">' +
            '<div class="omega-v2-logistics-count-grid">' + countFields + '</div>' +
            '<button type="submit" class="omega-v2-button omega-v2-button--accent">Save transport counts</button></form></details>'
          : '') +
        '</section>';
    }
    function logisticsFleetOverviewMarkup(routes) {
      var seen = Object.create(null), sites = [];
      safeArray(routes).forEach(function (route) {
        var id = String(route && route.siteId || '').trim();
        if (id && !Object.prototype.hasOwnProperty.call(seen, id)) { seen[id] = true; sites.push(route); }
      });
      var totals = Object.create(null);
      Object.keys(logisticsTransportModeMeta).forEach(function (mode) {
        totals[mode] = { total:0, configuredSites:0, designUnits:0, designSites:0, unknownDesignSites:0 };
      });
      var readableSites = 0, configuredProfiles = 0, unknownProfiles = 0;
      sites.forEach(function (route) {
        var fleet = readSiteTransportFleet(route);
        var ready = !!(fleet && fleet.status === 'READY' && Array.isArray(fleet.transportTypes));
        var byMode = Object.create(null);
        if (ready) {
          readableSites += 1;
          fleet.transportTypes.forEach(function (row) {
            if (row && row.transportType) byMode[String(row.transportType).toLowerCase()] = row;
          });
        }
        Object.keys(logisticsTransportModeMeta).forEach(function (mode) {
          var row = byMode[mode], count = row ? numberOrNull(row.count) : null, stat = totals[mode];
          if (ready && row && row.configured === true && count !== null && count >= 0) {
            stat.total += Math.floor(count);
            stat.configuredSites += 1;
            configuredProfiles += 1;
          } else { unknownProfiles += 1; }
        });
        var design = logisticsDesignFleetEstimate(route, logisticsNormalizedRouteLegs(route), byMode);
        Object.keys(design).forEach(function (mode) {
          var estimate = design[mode], stat = totals[mode];
          if (!stat) return;
          if (estimate.available) { stat.designUnits += estimate.estimatedUnits; stat.designSites += 1; }
          else stat.unknownDesignSites += 1;
        });
      });
      var modeCards = Object.keys(logisticsTransportModeMeta).map(function (mode) {
        var meta = logisticsTransportModeMeta[mode], stat = totals[mode];
        var actual = stat.configuredSites ? fmt(stat.total) + ' ' + meta.unit : 'Not configured';
        var design = stat.designSites
          ? (stat.unknownDesignSites ? 'Known design need subtotal: ' : 'Design need: ') +
            fmt(stat.designUnits) + ' ' + (stat.designUnits === 1 ? meta.single : meta.unit)
          : 'Design need unavailable';
        return '<div class="omega-v2-logistics-overview-mode" data-transport-mode="' + esc(mode) + '">' +
          '<img class="omega-v2-logistics-overview-mode-icon" src="' + esc(logisticsModeGenericIconPath(mode)) +
          '" alt="' + esc(meta.label) + '" width="48" height="34" loading="lazy" decoding="async">' +
          '<div><span>' + esc(meta.label) + '</span><strong>' + esc(actual) + '</strong>' +
          '<small>' + esc(fmt(stat.configuredSites) + ' of ' + fmt(sites.length) + ' mine sites have counts') + '</small>' +
          '<small>' + esc(design) + '</small><small>' + esc(fmt(stat.designSites) + ' site estimates available') +
          '</small></div></div>';
      }).join('');
      var knownVehicleTotal = totals.truck.total + totals.rail.total + totals.ship.total + totals.barge.total;
      var unknownVehicleProfiles = ['truck','rail','ship','barge'].reduce(function (sum, mode) {
        return sum + Math.max(0, sites.length - totals[mode].configuredSites);
      }, 0);
      var unknownPipelineProfiles = Math.max(0, sites.length - totals.pipeline.configuredSites);
      var vehicleTotalLabel = unknownVehicleProfiles ? 'Known configured vehicle subtotal' : 'Configured vehicle total';
      var pipelineTotalLabel = unknownPipelineProfiles ? 'Known pipeline-line subtotal' : 'Configured pipeline-line total';
      var combinedTotalLabel = unknownVehicleProfiles || unknownPipelineProfiles
        ? 'Known combined transport-unit subtotal (vehicles + lines)' : 'Configured combined transport-unit total';
      return '<section class="omega-v2-card omega-v2-logistics-fleet-overview" data-omega-v2-logistics-fleet-overview>' +
        '<div class="omega-v2-logistics-fleet-heading"><div><h2>Transport Fleet Summary</h2>' +
        '</div>' +
        '<strong>' + fmt(sites.length) + ' mine sites · ' + fmt(readableSites) + ' readable fleet records</strong></div>' +
        '<div class="omega-v2-logistics-overview-grid">' + modeCards + '</div>' +
        '<div class="omega-v2-logistics-fleet-foot"><span>' + esc(vehicleTotalLabel) + ': <strong>' + fmt(knownVehicleTotal) +
        '</strong></span><span>' + esc(pipelineTotalLabel) + ': <strong>' + (totals.pipeline.configuredSites ? fmt(totals.pipeline.total) : 'Unknown') +
        '</strong></span><span>' + esc(combinedTotalLabel) + ': <strong>' +
        fmt(knownVehicleTotal + totals.pipeline.total) + '</strong></span><span>Vehicle mode counts unknown: <strong>' + fmt(unknownVehicleProfiles) +
        '</strong></span><span>Mode profiles configured: <strong>' + fmt(configuredProfiles) +
        '</strong></span><span>Unknown count profiles: <strong>' + fmt(unknownProfiles) +
        '</strong></span><span>Per-vehicle IDs required: <strong>No</strong></span></div>' +
        '</section>';
    }
    function logisticsIconMarkup(kind) {
      var value = String(kind || 'destination').toLowerCase();
      if (value === 'origin') {
        return '<img class="omega-v2-logistics-svg omega-v2-logistics-svg--place" data-omega-v2-logistics-icon="origin" src="assets/omega-industrial-icons-v1/logistics/mine-site.svg" alt="" aria-hidden="true" loading="lazy" decoding="async">';
      }
      if (value === 'warehouse') {
        return '<img class="omega-v2-logistics-svg omega-v2-logistics-svg--place" data-omega-v2-logistics-icon="warehouse" src="assets/omega-industrial-icons-v1/logistics/warehouse-node.svg" alt="" aria-hidden="true" loading="lazy" decoding="async">';
      }
      var paths = {
        transport: '<path d="M3 10h16v12H3zM19 14h5l5 5v3H19z" /><circle cx="8" cy="24" r="2.5" /><circle cx="24" cy="24" r="2.5" />',
        factory: '<path d="M3 27V13l8 5v-5l8 5V8h10v19z" /><path d="M23 12h2m-2 4h2M7 22h3m4 0h3" />',
        destination: '<rect x="5" y="6" width="22" height="20" rx="4" /><path d="M11 13h10M11 18h10M11 23h5" />'
      };
      return '<svg class="omega-v2-logistics-svg" data-omega-v2-logistics-icon="' + esc(value) +
        '" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        (paths[value] || paths.destination) + '</svg>';
    }

    function logisticsRouteCard(route) {
      var plan = route && route.routePlan || {};
      var destination = route.destination && (route.destination.warehouseName || route.destination.name) || 'Raw-material warehouse';
      var legs = logisticsNormalizedRouteLegs(route);
      var modes = legs.map(function (leg) {
        return leg && (leg.transportMode || leg.mode) ? human(leg.transportMode || leg.mode) : '';
      }).filter(Boolean).join(' → ') || 'Route not recorded';
      var routeModes = [];
      legs.forEach(function (leg) {
        var mode = String(leg && (leg.transportMode || leg.mode) || '').toLowerCase();
        if (mode && routeModes.indexOf(mode) < 0) routeModes.push(mode);
      });
      var distance = numberOrNull(plan.estimatedRouteDistanceKm);
      var transit = numberOrNull(plan.plannedTransitDays);
      var capacity = numberOrNull(plan.capacityBottleneckPerDay);
      var capacityUnit = /RAW_CARGO_TONNES_PER_DAY/i.test(String(plan.capacityUnit || ''))
        ? 'tonnes/day' : buildDisplayUnit(plan.capacityUnit || '');
      var resource = route.resourceId || route.resourceIconKey || 'supply';
      var siteName = route.siteName || route.siteId || 'Registered mine site';
      var from = siteName, to = destination;
      var modeDistanceMarkup = routeModes.map(function (mode) {
        var modeLegs = legs.filter(function (leg) {
          return String(leg && (leg.transportMode || leg.mode) || '').toLowerCase() === mode;
        });
        var values = modeLegs.map(function (leg) {
          return numberOrNull(leg && (leg.estimatedDistanceKm !== undefined ? leg.estimatedDistanceKm : leg.distanceKm));
        });
        var complete = values.length > 0 && values.every(function (value) { return value !== null && value >= 0; });
        var distanceByMode = complete ? values.reduce(function (sum, value) { return sum + value; }, 0) : null;
        var meta = logisticsTransportModeMeta[mode] || {label:human(mode)};
        return '<div class="omega-v2-logistics-distance-mode" data-route-mode-distance="' + esc(mode) + '">' +
          '<span>' + esc(meta.label) + '</span><strong>' +
          (distanceByMode !== null ? esc(fmt(Number(distanceByMode.toFixed(3))) + ' km') : 'Unavailable') +
          '</strong><small>' + esc(fmt(modeLegs.length) + (modeLegs.length === 1 ? ' leg' : ' legs')) + '</small></div>';
      }).join('');
      var routeModeDistanceMarkup = '<section class="omega-v2-logistics-distance-summary" aria-label="Distance by transport type">' +
        '<div class="omega-v2-logistics-distance-heading"><span>Distance by transport type</span></div>' +
        '<div class="omega-v2-logistics-distance-grid">' + modeDistanceMarkup + '</div></section>';
      var routeIcons = legs.map(function (leg, index) {
        var mode = String(leg && (leg.transportMode || leg.mode) || 'truck').toLowerCase();
        var meta = logisticsTransportModeMeta[mode] || {label:human(mode)};
        var legDistance = numberOrNull(leg && (leg.estimatedDistanceKm !== undefined ? leg.estimatedDistanceKm : leg.distanceKm));
        var legCapacity = numberOrNull(leg && leg.designCapacityPerDay);
        var legCapacityUnit = /RAW_CARGO_TONNES_PER_DAY/i.test(String(leg && (leg.designCapacityUnit || plan.capacityUnit) || ''))
          ? 'tonnes/day' : buildDisplayUnit(leg && (leg.designCapacityUnit || plan.capacityUnit) || '');
        return '<span class="omega-v2-logistics-route-leg-icon" data-route-leg="' + (index + 1) +
          '" data-route-leg-mode="' + esc(mode) + '"><img data-omega-v2-logistics-icon="transport" data-omega-v2-transport-mode="' + esc(mode) + '" src="' +
          esc(logisticsTransportIconPath(mode, resource)) + '" alt="' + esc(meta.label) +
          '" width="40" height="28" loading="lazy" decoding="async"><small>' + esc(meta.label) + '</small>' +
          '<small>' + (legDistance !== null ? esc(fmt(legDistance) + ' km') : 'Distance unavailable') + '</small>' +
          '<small>' + (legCapacity !== null ? esc('Cap ' + fmt(legCapacity) + (legCapacityUnit ? ' ' + legCapacityUnit : '')) : 'Capacity unavailable') +
          '</small></span>';
      }).join('');
      return '<article class="omega-v2-card omega-v2-logistics-card omega-v2-logistics-route-card" data-logistics-state="attention" data-logistics-plan-site-id="' +
        esc(route.siteId || '') +
        '" data-logistics-mode-chain="' + esc(legs.map(function (leg) { return String(leg.transportMode || leg.mode || '').toLowerCase(); }).join(',')) + '">' +
        '<div class="omega-v2-logistics-header"><div class="omega-v2-logistics-cargo"><span class="omega-v2-resource-icon omega-v2-logistics-resource-art">' +
        resourceIconMarkup(resource, resourceLabel(resource)) + '</span><div class="omega-v2-logistics-cargo-copy">' +
        '<span class="omega-v2-eyebrow">SITE ROUTE PLAN</span><h3 class="omega-v2-card-title">' + esc(siteName) +
        '</h3><span class="omega-v2-card-meta">' + esc(resourceLabel(resource)) + '</span></div></div>' +
        '<span class="omega-v2-status" data-state="attention">Route plan</span></div>' +
        '<div class="omega-v2-logistics-path" aria-label="Planned route from ' + esc(from) + ' to ' + esc(to) + '">' +
        '<div class="omega-v2-logistics-node omega-v2-logistics-node--origin"><span class="omega-v2-logistics-node-art">' +
        logisticsIconMarkup('origin') + '</span><span class="omega-v2-logistics-node-copy"><small>MINE</small><strong>' +
        esc(from) + '</strong></span></div><div class="omega-v2-logistics-link"><span class="omega-v2-logistics-route-icons">' +
        routeIcons + '</span><span class="omega-v2-logistics-link-line"></span><span class="omega-v2-logistics-mode">' +
        esc(modes) + '</span></div><div class="omega-v2-logistics-node omega-v2-logistics-node--destination"><span class="omega-v2-logistics-node-art">' +
        logisticsIconMarkup('warehouse') + '</span><span class="omega-v2-logistics-node-copy"><small>WAREHOUSE</small><strong>' +
        esc(to) + '</strong></span></div></div><div class="omega-v2-logistics-metrics">' +
        '<div class="omega-v2-logistics-metric"><span>Total distance · estimate</span><strong>' +
        (distance !== null ? esc(fmt(distance) + ' km') : 'Unavailable') + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Transit · planned</span><strong>' +
        (transit !== null ? esc(fmt(transit) + ' days') : 'Unavailable') + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Design capacity</span><strong>' +
        (capacity !== null ? esc(fmt(capacity) + (capacityUnit ? ' ' + capacityUnit : '')) : 'Unavailable') + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Route legs</span><strong>' + fmt(legs.length) + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Transport types</span><strong>' + fmt(routeModes.length) + '</strong></div>' +
        '</div>' + routeModeDistanceMarkup + logisticsSiteFleetMarkup(route, legs) + '</article>';
    }

    function logisticsRoutePlansMarkup(routeState) {
      if (!routeState || routeState.status === 'idle' || routeState.status === 'loading') {
        return '<section class="omega-v2-card omega-v2-logistics-route-status" data-logistics-route-state="loading" role="status">' +
          '<h2 class="omega-v2-card-title">Mine Site Route Plans</h2><p>Loading registered site routes…</p></section>';
      }
      if (routeState.status !== 'ready') {
        return '<div class="omega-v2-empty" data-logistics-route-state="unavailable">Site route plans unavailable.</div>';
      }
      var routes = safeArray(routeState.routes);
      if (!routes.length) {
        return '<div class="omega-v2-empty" data-logistics-route-state="empty">No registered mine/site route plans for this country.</div>';
      }
      return '<section class="omega-v2-logistics-route-section" data-logistics-route-state="ready">' +
        logisticsFleetOverviewMarkup(routes) +
        '<div class="omega-v2-logistics-route-heading"><div><h2>Mine Site Route Plans</h2></div>' +
        '<span class="omega-v2-status" data-state="attention">' + fmt(routes.length) + ' route plans</span></div>' +
        '<div class="omega-v2-grid omega-v2-logistics-grid">' + routes.map(logisticsRouteCard).join('') + '</div></section>';
    }
    var routePlanState = getLogisticsRoutePlanState(countryKey);
    var liveShipmentsMarkup = shipments.length ? '<section class="omega-v2-logistics-live-section">' +
      '<div class="omega-v2-logistics-route-heading"><div><h2>Current Shipments</h2></div><span class="omega-v2-status" data-state="unknown">' +
      fmt(shipments.length) + ' records</span></div>' +
      '<div class="omega-v2-grid omega-v2-logistics-grid">' + shipments.slice(-80).reverse().map(function (shipment) {
        var status = logisticsStatus(shipment.status), q = numberOrNull(shipment.quantity);
        var from = shipment.sourceSiteName || shipment.siteName || shipment.sourceSiteId || shipment.origin || shipment.from || '—';
        var to = shipment.destinationFactoryName || shipment.destinationFactoryId || shipment.destinationWarehouseId || shipment.destination || shipment.to || '—';
        var mode = shipment.route && (shipment.route.transportMode || shipment.route.mode) || shipment.transportMode || shipment.mode || '';
        var destinationKind = shipment.destinationFactoryId || shipment.destinationFactoryName ? 'factory' :
          shipment.destinationWarehouseId ? 'warehouse' : 'destination';
        var modeLabel = mode ? human(mode) : 'Route not recorded';
        var modeIcon = logisticsTransportIconPath(mode || 'truck', shipment.resourceId || '');
        var etaLabel = numberOrNull(shipment.etaTurn) !== null ? 'Turn ' + fmt(shipment.etaTurn) : 'Not recorded';
        return '<article class="omega-v2-card omega-v2-logistics-card" data-logistics-state="' + status.state + '">' +
          '<div class="omega-v2-logistics-header"><div class="omega-v2-logistics-cargo">' +
          '<span class="omega-v2-resource-icon omega-v2-logistics-resource-art">' + resourceIconMarkup(shipment.resourceId || 'supply', resourceLabel(shipment.resourceId || 'Supply')) + '</span>' +
          '<div class="omega-v2-logistics-cargo-copy"><span class="omega-v2-eyebrow">RESOURCE CARGO</span><h3 class="omega-v2-card-title">' +
          esc(resourceLabel(shipment.resourceId || 'Supply')) + '</h3></div></div><span class="omega-v2-status" data-state="' + status.state + '">' +
          esc(status.label) + '</span></div>' +
          '<div class="omega-v2-logistics-path" aria-label="Shipment route from ' + esc(from) + ' to ' + esc(to) + '">' +
          '<div class="omega-v2-logistics-node omega-v2-logistics-node--origin"><span class="omega-v2-logistics-node-art">' + logisticsIconMarkup('origin') +
          '</span><span class="omega-v2-logistics-node-copy"><small>ORIGIN</small><strong>' + esc(from) + '</strong></span></div>' +
          '<div class="omega-v2-logistics-link"><span class="omega-v2-logistics-route-vehicle"><img class="omega-v2-logistics-svg omega-v2-logistics-svg--mode" data-omega-v2-logistics-icon="transport" data-omega-v2-transport-mode="' + esc(mode || 'unknown') + '" src="' + esc(modeIcon) +
          '" alt="' + esc(modeLabel) + '" loading="lazy" decoding="async"></span><span class="omega-v2-logistics-link-line"></span><span class="omega-v2-logistics-mode">' +
          esc(modeLabel) + '</span></div>' +
          '<div class="omega-v2-logistics-node omega-v2-logistics-node--destination"><span class="omega-v2-logistics-node-art">' + logisticsIconMarkup(destinationKind) +
          '</span><span class="omega-v2-logistics-node-copy"><small>DESTINATION</small><strong>' + esc(to) + '</strong></span></div></div>' +
          '<div class="omega-v2-logistics-metrics"><div class="omega-v2-logistics-metric"><span>Shipment quantity</span><strong>' +
          amount(q, shipment.unit || '') + '</strong></div><div class="omega-v2-logistics-metric"><span>Estimated arrival</span><strong>' +
          esc(etaLabel) + '</strong></div></div></article>';
      }).join('') + '</div></section>' : '';
    var logisticsMarkup = liveShipmentsMarkup + logisticsRoutePlansMarkup(routePlanState);
    var reportGroups = Object.create(null);
    flows.forEach(function (row) {
      var rid = String(row.resourceId || '').toLowerCase(), q = numberOrNull(row.quantity);
      var tick = numberOrNull(row.extractionTurn !== undefined ? row.extractionTurn : row.turn !== undefined ? row.turn : row.lastUpdatedTurn);
      if (!rid || q === null || q <= 0 || tick === null) return;
      var unit = String(row.unit || '');
      var k = rid + '|' + unit;
      if (!reportGroups[k]) reportGroups[k] = {resourceId:rid,unit:unit,turns:Object.create(null),total:0};
      reportGroups[k].turns[tick] = (reportGroups[k].turns[tick] || 0) + q;
      reportGroups[k].total += q;
    });
    var reportCharts = Object.keys(reportGroups).map(function (key) { return reportGroups[key]; })
      .sort(function (a,b) { return b.total - a.total; }).slice(0,6).map(function (group) {
        var ticks = Object.keys(group.turns).map(Number).sort(function (a,b) { return a-b; }).slice(-7);
        var max = ticks.reduce(function (m, tick) { return Math.max(m, group.turns[tick] || 0); }, 0) || 1;
        return '<section class="omega-v2-card omega-v2-report-chart"><div class="omega-v2-card-header"><h3 class="omega-v2-card-title">' +
          esc(resourceLabel(group.resourceId)) + '</h3><span class="omega-v2-card-meta">' + esc(group.unit || 'Recorded units') + '</span></div><div class="omega-v2-chart-bars" role="img" aria-label="' +
          esc(resourceLabel(group.resourceId) + ' production over recent turns') + '">' + ticks.map(function (tick) {
            var q = group.turns[tick] || 0, height = Math.max(3, Math.round(q / max * 100));
            return '<div class="omega-v2-chart-column"><span class="omega-v2-chart-value">' + esc(fmt(q)) + '</span><span class="omega-v2-chart-bar" style="height:' +
              height + '%"></span><span class="omega-v2-chart-label">T' + tick + '</span></div>';
          }).join('') + '</div></section>';
      }).join('');
    var reportsMarkup = '<div class="omega-v2-kpis">' +
      renderKpi('Mine sites', String(model.sites.filter(eligible).length), 'Mine sites available to manage', 'neutral') +
      renderKpi('Producing this turn', String(producingSites.length), 'Mine sites with output', portfolioBalanceState) +
      renderKpi('Projects pending', String(mineProjects.length), 'Under construction', mineProjects.length ? 'shortage' : 'neutral') +
      renderKpi('Blocked supply flows', String(blockedFlows.length), 'Current flow ledger', blockedFlows.length ? 'shortage' : 'adequate') + '</div>' +
      '<section class="omega-v2-card omega-v2-report-overview"><h2>National resource economy</h2><p>Production and stock remain grouped by their own units.</p><div class="omega-v2-report-unit-totals">' +
      currentOutputGroups.map(function (row) { return '<div><span>' + esc(resourceLabel(row.resourceId)) + '</span><strong>' + amount(row.quantity,row.unit) +
        '</strong><small>' + fmt(Object.keys(row.sites).length) + ' sites</small></div>'; }).join('') +
      (currentOutputGroups.length ? '' : '<div class="omega-v2-empty">No extraction output has been recorded this turn.</div>') +
      '</div></section>' + (reportCharts ? '<div class="omega-v2-grid omega-v2-report-grid">' + reportCharts + '</div>' :
        '<div class="omega-v2-empty">Charts appear when production records have been created by the game.</div>');
    var selectedDetail = selectedSiteDetail(selectedMine);
    var mineMarkup = '<div class="omega-v2-filterbar omega-v2-mine-filterbar"><input type="search" aria-label="Search mine sites" placeholder="Search mines..." data-omega-v2-site-search>' +
      '<select aria-label="Filter by resource" data-omega-v2-resource-filter>' + '<option value="all">All resources</option>' +
      Array.from(new Set(model.sites.map(function (item) { return item.resourceId; })).values()).map(function (id) {
        return '<option value="' + esc(id) + '">' + esc(resourceLabel(id)) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="omega-v2-card-meta">Showing <strong data-omega-v2-site-visible-count>' + fmt(model.sites.filter(eligible).length) + '</strong> mines</div>' +
      (model.siteCount ? '<div class="omega-v2-mine-workspace"><div class="omega-v2-grid" data-omega-v2-site-grid>' + cards + '</div><aside class="omega-v2-mine-side-panel">' + selectedDetail + '</aside></div>' :
        '<div class="omega-v2-empty">No mine sites are available for this country.</div>');
    var tabRows = [
      ['dashboard','Overview'],['mines','Mines'],['logistics','Stock & Logistics'],['inventory','Inventory / Warehouse'],['reports','Reports']
    ];
    var tabMarkup = '<div class="omega-v2-filterbar omega-v2-resource-tabs" role="group" aria-label="Resource management sections">' + tabRows.map(function (row) {
      return '<button type="button" class="omega-v2-button ' + (row[0] === active ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') +
        '" data-omega-v2-resource-tab="' + row[0] + '" aria-pressed="' + (row[0] === active ? 'true' : 'false') + '">' + esc(row[1]) + '</button>';
    }).join('') + '</div>';
    var contentMarkup = active === 'mines' ? mineMarkup :
      active === 'logistics' ? logisticsMarkup :
      active === 'inventory' ? inventoryMarkup :
      active === 'reports' ? reportsMarkup : dashMarkup;
    var notice = root.__omegaV2ResourceNotice ? '<div class="omega-v2-note omega-v2-resource-notice" role="status" aria-live="polite">' + esc(root.__omegaV2ResourceNotice) + '</div>' : '';
    var baselineStatusMarkup = baselineLoading
      ? '<div class="omega-v2-note omega-v2-resource-notice" role="status" aria-live="polite">Loading ' + esc(countryKey) + ' inventory. Current recorded stock remains visible while opening balances are checked.</div>'
      : (baselineFailed
        ? '<div class="omega-v2-note omega-v2-resource-notice" role="alert">Inventory baseline update did not complete: ' + esc(root.__omegaV2ResourceLoadError) +
          ' <button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-resource-retry>Retry inventory update</button></div>'
        : '');
    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-resource omega-v2-resource-premium" data-resource-ui-version="command-v2">' +
      '<header class="omega-v2-heading omega-v2-resource-heading"><div class="omega-v2-resource-heading-copy"><img class="omega-v2-resource-ministry-mark" src="assets/ministry-logos/energy_mining.svg" alt="" aria-hidden="true" loading="lazy" decoding="async"><div>' +
      '<div class="omega-v2-eyebrow">RESOURCE COMMAND</div><h1 class="omega-v2-title">Mine Production Ministry</h1><p class="omega-v2-subtitle">' + esc(countryLabel) +
      ' · Resource Extraction · National Wealth</p></div></div><div class="omega-v2-resource-heading-actions">' + countrySelectMarkup(countryKey) +
      '<span class="omega-v2-status" data-state="' + (model.ready ? 'operational' : 'attention') + '">' +
      fmt(model.sites.filter(eligible).length) + ' mines</span></div></header>' + notice + baselineStatusMarkup + tabMarkup + '<div data-omega-v2-resource-content>' + contentMarkup + '</div></section>';
    if (!root.__omegaV2ResourceBound && typeof root.addEventListener === 'function') {
      root.addEventListener('input', function (event) {
        if (!event || !event.target) return;
        if (event.target.matches && event.target.matches('[data-omega-v2-site-search]')) applySiteFilter(root);
      });
      root.addEventListener('change', function (event) {
        if (!event || !event.target) return;
        if (event.target.matches && event.target.matches('[data-omega-v2-resource-filter]')) {
          applySiteFilter(root);
          return;
        }
        if (event.target.matches && event.target.matches('[data-omega-v2-resource-country]')) {
          var activePlayer = livePlayerCountryKey();
          if (activePlayer) {
            root.__omegaV2ResourceNotice = 'Only the active player country is available in Resource Ministry.';
            scheduleRender(root, Object.assign({}, root.__omegaV2ResourceOptions || {}, {
              countryId:activePlayer, tab:root.__omegaV2ResourceTab || 'dashboard'
            }));
          }
        }
      });
      root.addEventListener('submit', function (event) {
        var form = event && event.target;
        if (!form || typeof form.matches !== 'function' ||
            !form.matches('[data-omega-v2-logistics-fleet-form]') || !root.contains(form)) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        var options = root.__omegaV2ResourceOptions || {};
        var country = selectedCountryKey(form.getAttribute('data-country-id') || options.countryId || root.__omegaV2CurrentCountryKey || '');
        var siteId = String(form.getAttribute('data-site-id') || '').trim();
        var playerCountry = livePlayerCountryKey();
        if (!playerCountry || country !== playerCountry) {
          root.__omegaV2ResourceNotice = 'Transport counts can only be changed for the active player country.';
          scheduleRender(root, Object.assign({}, options, { tab:'logistics' }));
          return;
        }
        var network = g.OmegaResourceIndustrialNetwork || (g.Omega && g.Omega.ResourceIndustrialNetwork);
        if (!siteId || !network || typeof network.setTransportFleet !== 'function') {
          root.__omegaV2ResourceNotice = 'Transport count saving is unavailable; no changes were made.';
          scheduleRender(root, Object.assign({}, options, { tab:'logistics' }));
          return;
        }
        var inputs = typeof form.querySelectorAll === 'function'
          ? form.querySelectorAll('[data-omega-v2-fleet-count-input]') : [];
        var updates = [], invalid = null;
        Array.prototype.forEach.call(inputs, function (input) {
          var raw = String(input && input.value !== undefined ? input.value : '').trim();
          if (!raw) return;
          var count = Number(raw);
          var mode = String(input && input.getAttribute && input.getAttribute('data-transport-mode') || '').trim().toLowerCase();
          if (!mode || !Number.isInteger(count) || count < 0) {
            invalid = 'Enter a whole number of 0 or more for each count you want to save.';
            return;
          }
          updates.push({ transportType:mode, count:count });
        });
        if (invalid || !updates.length) {
          root.__omegaV2ResourceNotice = invalid || 'Enter at least one transport count. Blank fields keep existing settings.';
          scheduleRender(root, Object.assign({}, options, { tab:'logistics' }));
          return;
        }
        var saved = 0, failed = [];
        updates.forEach(function (update) {
          try {
            var result = network.setTransportFleet({
              countryId:country, siteId:siteId, transportType:update.transportType, count:update.count
            });
            if (result && result.status === 'APPLIED') saved += 1;
            else failed.push(update.transportType + ': ' + human(result && (result.reason || result.status) || 'rejected'));
          } catch (_) { failed.push(update.transportType + ': save failed'); }
        });
        delete logisticsFleetViewCache[country + '|' + siteId];
        root.__omegaV2ResourceNotice = failed.length
          ? saved + ' transport count(s) saved. Not saved: ' + failed.join('; ') + '.'
          : 'Saved ' + saved + ' transport count(s). Route estimates now use the saved counts.';
        scheduleRender(root, Object.assign({}, options, { tab:'logistics' }));
      });
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var retryBaseline = target.closest('[data-omega-v2-resource-retry]');
        if (retryBaseline && root.contains(retryBaseline) && !retryBaseline.disabled) {
          var retryOptions = Object.assign({}, root.__omegaV2ResourceOptions || {}, {
            countryId:root.__omegaV2CurrentCountryKey || countryKey,
            tab:root.__omegaV2ResourceTab || 'dashboard'
          });
          root.__omegaV2ResourceLoadFailedCountry = '';
          root.__omegaV2ResourceLoadError = '';
          root.__omegaV2ResourceLoadPromise = null;
          render(root, retryOptions);
          return;
        }
        var coverageApply = target.closest('[data-omega-v2-coverage-apply]');
        if (coverageApply && root.contains(coverageApply) && !coverageApply.disabled) {
          var coverageOptions = root.__omegaV2ResourceOptions || {};
          var coverageCountry = selectedCountryKey(coverageOptions.countryId || root.__omegaV2CurrentCountryKey || countryKey);
          var coverageInput = root.querySelector('[data-omega-v2-coverage-days-input]');
          var requestedDays = numberOrNull(coverageInput && coverageInput.value);
          var baselineRuntime = g.OmegaResourceStartupBaseline || g.Omega && g.Omega.ResourceStartupBaseline || null;
          if (!livePlayerCountryKey() || coverageCountry !== livePlayerCountryKey()) {
            root.__omegaV2ResourceNotice = 'Stock targets can only be changed for the active player country.';
          } else if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 3650) {
            root.__omegaV2ResourceNotice = 'Enter a whole number from 1 to 3650 days. No stock was changed.';
          } else if (!baselineRuntime || typeof baselineRuntime.setFactoryInputCoverageDays !== 'function') {
            root.__omegaV2ResourceNotice = 'The stock target runtime is unavailable. No stock was changed.';
          } else if (root.__omegaV2CoverageSaving) {
            return;
          } else {
            root.__omegaV2CoverageSaving = true;
            coverageApply.disabled = true;
            Promise.resolve().then(function () {
              return baselineRuntime.setFactoryInputCoverageDays(coverageCountry, requestedDays);
            }).then(function (result) {
              var status = String(result && result.status || '').toUpperCase();
              if (status === 'APPLIED' || status === 'ALREADY_INITIALIZED') {
                root.__omegaV2ResourceNotice = 'Stock target updated to ' + requestedDays +
                  ' days. Existing stock was preserved; only the required difference was added.';
              } else if (status === 'COMPLETED_WITH_REPORTED_GAPS') {
                root.__omegaV2ResourceNotice = 'Target set to ' + requestedDays +
                  ' days. Some source or warehouse records still need reconciliation.';
              } else {
                root.__omegaV2ResourceNotice = 'Stock target was not changed: ' +
                  human(result && (result.reason || result.status) || 'runtime rejected the request') + '.';
              }
            }).catch(function () {
              root.__omegaV2ResourceNotice = 'Stock target could not be saved. No success was recorded.';
            }).finally(function () {
              root.__omegaV2CoverageSaving = false;
              scheduleRender(root, Object.assign({}, coverageOptions, { tab:'inventory' }));
            });
          }
          if (!root.__omegaV2CoverageSaving) scheduleRender(root, Object.assign({}, coverageOptions, { tab:'inventory' }));
          return;
        }
        var tab = target.closest('[data-omega-v2-resource-tab]');
        if (tab && root.contains(tab)) {
          root.__omegaV2ResourceTab = tab.getAttribute('data-omega-v2-resource-tab') || 'dashboard';
          scheduleRender(root, Object.assign({}, root.__omegaV2ResourceOptions || {}, { tab:root.__omegaV2ResourceTab }));
          return;
        }
        var selectSite = target.closest('[data-omega-v2-select-site]');
        if (selectSite && root.contains(selectSite)) {
          root.__omegaV2SelectedMineId = selectSite.getAttribute('data-omega-v2-select-site') || '';
          scheduleRender(root, Object.assign({}, root.__omegaV2ResourceOptions || {}, { tab:root.__omegaV2ResourceTab || 'mines' }));
          return;
        }
        var actionButton = target.closest('[data-omega-v2-mine-action]');
        if (actionButton && root.contains(actionButton) && !actionButton.disabled) {
          var action = actionButton.getAttribute('data-omega-v2-mine-action');
          var id = actionButton.getAttribute('data-site-id') || '';
          var actionCountry = selectedCountryKey((root.__omegaV2ResourceOptions || {}).countryId || root.__omegaV2CurrentCountryKey || countryKey);
          if (!livePlayerCountryKey() || actionCountry !== livePlayerCountryKey()) {
            root.__omegaV2ResourceNotice = 'Operations are available only for the active player country.';
            scheduleRender(root, Object.assign({}, root.__omegaV2ResourceOptions || {}, { tab:'mines' }));
            return;
          }
          if (action === 'build') {
            root.__omegaV2SelectedMineId = id;
            root.__omegaV2BuildSiteId = id;
            root.__omegaV2MineAction = 'build';
            root.__omegaV2BuildQuantity = 1;
            root.__omegaV2BuildWorkers = 0;
            root.__omegaV2ResourceNotice = '';
            scheduleRender(root,Object.assign({},root.__omegaV2ResourceOptions||{},{tab:'mines'}));
            return;
          }
          if (action === 'extract') {
            var mineUi = g.OmegaResourceMineManagementUI || (g.Omega && g.Omega.ResourceMineManagementUI);
            if (mineUi && typeof mineUi.open === 'function') mineUi.open('mines',countryKey,id,action);
            else { root.__omegaV2ResourceNotice = 'Mine extraction is not available right now.';
              scheduleRender(root,Object.assign({},root.__omegaV2ResourceOptions||{},{tab:'mines'})); }
            return;
          }
          if (action === 'demolish') {
            var network = g.OmegaResourceIndustrialNetwork || g.Omega && g.Omega.ResourceIndustrialNetwork;
            if (!network || typeof network.decommissionMine !== 'function') {
              root.__omegaV2ResourceNotice = 'Mine shutdown is unavailable; no game state was changed.';
            } else if (typeof g.confirm === 'function' && !g.confirm('Stop this mine? Its records and stock will be preserved.')) {
              return;
            } else {
              try {
                var result = network.decommissionMine({ countryId:countryKey, siteId:id, confirmed:true });
                root.__omegaV2ResourceNotice = result && result.status === 'DECOMMISSIONED'
                  ? 'Mine stopped. Existing inventory and history have been preserved.'
                  : 'Mine was not changed. ' + human(result && (result.reason || result.status));
              } catch (error) {
                root.__omegaV2ResourceNotice = 'Mine could not be stopped. No stock was deleted.';
              }
            }
            scheduleRender(root, Object.assign({}, root.__omegaV2ResourceOptions || {}, { tab:'mines' }));
            return;
          }
        }
        var button = target.closest('[data-omega-v2-site-action]');
        if (!button || !root.contains(button) || button.disabled) return;
        var id = button.getAttribute('data-site-id');
        if (button.getAttribute('data-omega-v2-site-action') === 'open' && typeof root.__omegaV2ResourceOptions.onOpenSite === 'function') {
          root.__omegaV2ResourceOptions.onOpenSite(id);
        } else if (button.getAttribute('data-omega-v2-site-action') === 'locate' && typeof root.__omegaV2ResourceOptions.onLocateSite === 'function') {
          root.__omegaV2ResourceOptions.onLocateSite(id);
        }
      });
      root.addEventListener('input', function (event) {
        var target = event && event.target;
        if (!target || typeof target.matches !== 'function') return;
        if (!target.matches('[data-omega-v2-build-count]') && !target.matches('[data-omega-v2-build-workers]')) return;
        var countNode = root.querySelector('[data-omega-v2-build-count]');
        var workersNode = root.querySelector('[data-omega-v2-build-workers]');
        var count = numberOrNull(countNode && countNode.value);
        var workers = numberOrNull(workersNode && workersNode.value);
        root.__omegaV2BuildQuantity = count;
        root.__omegaV2BuildWorkers = workers;
        var siteId = root.__omegaV2BuildSiteId || '';
        var model = root.__omegaV2ResourceModel;
        var site = model && Array.isArray(model.sites) ? model.sites.find(function (s) { return String(s.siteId) === String(siteId); }) : null;
        var country = selectedCountryKey((root.__omegaV2ResourceOptions || {}).countryId || root.__omegaV2CurrentCountryKey || '');
        var preview = root.querySelector('[data-omega-v2-build-preview]');
        if (preview && site) preview.innerHTML = mineBuildQuoteMarkup(site,country,count,workers);
      });
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var options = root.__omegaV2ResourceOptions || {};
        var cancel = target.closest('[data-omega-v2-build-cancel]');
        if (cancel && root.contains(cancel)) {
          root.__omegaV2MineAction = '';
          root.__omegaV2BuildSiteId = '';
          root.__omegaV2ResourceNotice = '';
          scheduleRender(root,Object.assign({},options,{tab:'mines'}));
          return;
        }
        var submit = target.closest('[data-omega-v2-build-submit]');
        if (!submit || !root.contains(submit) || submit.disabled) return;
        var country = selectedCountryKey(options.countryId || root.__omegaV2CurrentCountryKey || '');
        if (!country || country !== livePlayerCountryKey()) {
          root.__omegaV2ResourceNotice = 'Construction is available only for the active player country.';
          scheduleRender(root,Object.assign({},options,{tab:'mines'}));
          return;
        }
        if (root.__omegaV2BuildInFlight) return;
        var siteId = String(root.__omegaV2BuildSiteId || '');
        var model = root.__omegaV2ResourceModel;
        var site = model && Array.isArray(model.sites) ? model.sites.find(function (s) { return String(s.siteId) === siteId; }) : null;
        var countNode = root.querySelector('[data-omega-v2-build-count]');
        var workersNode = root.querySelector('[data-omega-v2-build-workers]');
        var count = numberOrNull(countNode && countNode.value);
        var workers = numberOrNull(workersNode && workersNode.value);
        var network = g.OmegaResourceIndustrialNetwork || g.Omega && g.Omega.ResourceIndustrialNetwork;
        if (!site || !Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(workers) || workers < 0 ||
            !network || typeof network.quoteMineProject !== 'function' || typeof network.startMineProject !== 'function') {
          root.__omegaV2ResourceNotice = 'Invalid construction request or runtime unavailable. No resources have been committed.';
          scheduleRender(root,Object.assign({},options,{tab:'mines'}));
          return;
        }
        root.__omegaV2BuildInFlight = true;
        try {
          var quote = network.quoteMineProject({countryId:country,siteId:site.siteId,resourceId:site.resourceId,quantity:count,assignedWorkers:workers});
          if (!quote || quote.status !== 'QUOTED' || quote.ready !== true) {
            root.__omegaV2BuildQuantity = count;
            root.__omegaV2BuildWorkers = workers;
            root.__omegaV2ResourceNotice = 'Construction blocked: ' + human(quote && (quote.reason || (!quote.staffingReady ? 'INSUFFICIENT_WORKER_COMMITMENT' : 'CONSTRUCTION_REQUIREMENTS_NOT_MET')) || 'requirements not verified') + '. No resources were committed.';
          } else {
            var state = authoritativeGameState();
            var activeTurn = numberOrNull(state.simulation && (state.simulation.turn || state.simulation.currentTurn)) || numberOrNull(state.turn) || 0;
            root.__omegaV2BuildAttempt = (numberOrNull(root.__omegaV2BuildAttempt) || 0) + 1;
            var result = network.startMineProject({countryId:country,siteId:site.siteId,resourceId:site.resourceId,quantity:count,assignedWorkers:workers,
              requestId:'MINE_UI_V2:' + country + ':' + site.siteId + ':N' + count + ':W' + workers + ':T' + activeTurn + ':A' + root.__omegaV2BuildAttempt});
            if (result && result.status === 'UNDER_CONSTRUCTION') {
              root.__omegaV2MineAction = '';
              root.__omegaV2ResourceNotice = fmt(result.assetCount || count) + ' mine unit(s) started. $' +
                fmt(result.costUsd || quote.costUsd || 0,0) + ' committed; ' +
                fmt(result.remainingDays !== undefined ? result.remainingDays : result.durationDays) + ' days remaining. Expected completion: ' +
                String(result.expectedCompletionDate || result.estimatedCompletionDate || 'game date unavailable') + '.';
            } else {
              root.__omegaV2BuildQuantity = count;
              root.__omegaV2BuildWorkers = workers;
              root.__omegaV2ResourceNotice = 'Construction did not start: ' + human(result && (result.reason || result.status) || 'runtime rejected the request') + '.';
            }
          }
        } catch (_) {
          root.__omegaV2ResourceNotice = 'Construction failed before confirmation. No success was recorded.';
        } finally {
          root.__omegaV2BuildInFlight = false;
        }
        scheduleRender(root,Object.assign({},options,{tab:'mines'}));
      });
      if (!root.__omegaV2RuntimeEventsBound && typeof g.addEventListener === 'function') {
        root.__omegaV2ResourceRuntimeEventHandlers = [];
        ['OMEGA_RESOURCE_MINE_PROJECT_STARTED','OMEGA_RESOURCE_MINE_PROJECT_PROGRESS','OMEGA_RESOURCE_MINE_COMMISSIONED',
          'OMEGA_RESOURCE_FACTORY_INPUT_STOCK_TARGET_UPDATED','OMEGA_RESOURCE_NATIONAL_DEMAND_UPDATED',
          'OMEGA_RESOURCE_ECONOMY_UPDATED','OMEGA_RESOURCE_MINE_HAUL_DELIVERED',
          'OMEGA_RESOURCE_MINE_WAREHOUSE_RECEIPT_POSTED','OMEGA_RESOURCE_INVENTORY_CHANGED',
          'OMEGA_RESOURCE_IMPORT_COMPLETED','OMEGA_RESOURCE_EXPORT_COMPLETED','OMEGA_RESOURCE_CONSUMPTION_COMPLETED',
          'OMEGA_RESOURCE_FACTORY_INPUT_AVAILABLE','OMEGA_FACTORY_INPUT_SHIPMENT_DELIVERED',
          'OMEGA_FACTORY_PRODUCTION_CYCLE_STARTED','OMEGA_FACTORY_PRODUCTION_CYCLE_PAUSED',
          'OMEGA_FACTORY_PRODUCTION_CYCLE_COMPLETED','OMEGA_SIMULATION_TURN_COMMITTED','OMEGA_RESOURCE_STARTUP_BASELINE_COMPLETED',
          'OMEGA_RESOURCE_PLAYER_COUNTRY_READY'].forEach(function (name) {
          var handler = function () {
            if (root.__omegaV2ResourceActive && root.__omegaV2ResourceOptions) {
              scheduleRender(root,Object.assign({},root.__omegaV2ResourceOptions,{tab:root.__omegaV2ResourceTab||'mines'}));
            }
          };
          g.addEventListener(name, handler);
          root.__omegaV2ResourceRuntimeEventHandlers.push({ type:name, callback:handler });
        });
        root.__omegaV2RuntimeEventsBound = true;
      }
      root.__omegaV2ResourceBound = true;
    }
    root.__omegaV2ResourceOptions = Object.assign({}, renderOptions, { countryId:countryKey });
    root.__omegaV2ResourceModel = model;
    root.__omegaV2CurrentCountryKey = countryKey;
    root.__omegaV2ResourceTab = active;
    if (active === 'mines') applySiteFilter(root);
    if (active === 'logistics') ensureLogisticsRoutePlans(countryKey, root);
    return { ok:true, code:baselineLoading ? 'PLAYER_COUNTRY_BASELINE_LOADING' : null,
      tab:active, siteCount:model.siteCount, model:model, inventoryRowCount:inventoryRows.length,
      shipmentRowCount:shipments.length, producingSiteCount:producingSites.length, blockedFlowCount:blockedFlows.length };
  }
  function applySiteFilter(root) {
    var input = root.querySelector('[data-omega-v2-site-search]');
    var select = root.querySelector('[data-omega-v2-resource-filter]');
    var search = String(input && input.value || '').trim().toLowerCase();
    var resource = String(select && select.value || 'all');
    var rows = root.querySelectorAll('[data-omega-v2-site-card]');
    Array.prototype.forEach.call(rows, function (row) {
      var query = row.getAttribute('data-search') || '';
      var category = row.getAttribute('data-resource') || '';
      row.hidden = !!((search && query.indexOf(search) < 0) || (resource !== 'all' && category !== resource));
    });
    var count = root.querySelectorAll('[data-omega-v2-site-card]:not([hidden])').length;
    var counter = root.querySelector('[data-omega-v2-site-visible-count]');
    if (counter) counter.textContent = String(count);
  }

  function unload(root) {
    if (!root || typeof root !== 'object') return { ok:false, code:'RESOURCE_ROOT_REQUIRED' };
    var country = key(root.__omegaV2CurrentCountryKey || root.__omegaV2ResourceLoadedCountry || '');
    root.__omegaV2ResourceActive = false;
    root.__omegaV2ResourceLoadGeneration = (Number(root.__omegaV2ResourceLoadGeneration) || 0) + 1;
    root.__omegaV2ResourceLoadingCountry = '';
    root.__omegaV2ResourceLoadPromise = null;
    root.__omegaV2ResourceLoadedCountry = '';
    root.__omegaV2ResourceLoadStatus = '';
    root.__omegaV2ResourceLoadError = '';
    root.__omegaV2ResourceLoadFailedCountry = '';
    var handlers = Array.isArray(root.__omegaV2ResourceRuntimeEventHandlers)
      ? root.__omegaV2ResourceRuntimeEventHandlers : [];
    handlers.forEach(function (row) {
      try { if (g.removeEventListener) g.removeEventListener(row.type, row.callback); } catch (_) {}
    });
    root.__omegaV2ResourceRuntimeEventHandlers = [];
    root.__omegaV2RuntimeEventsBound = false;
    Object.keys(logisticsRoutePlanWaiters).forEach(function (countryId) {
      logisticsRoutePlanWaiters[countryId] = (logisticsRoutePlanWaiters[countryId] || []).filter(function (waiter) {
        return waiter !== root;
      });
      if (!logisticsRoutePlanWaiters[countryId].length) delete logisticsRoutePlanWaiters[countryId];
    });
    if (country) {
      var remainingRouteWaiters = logisticsRoutePlanWaiters[country] || [];
      var hasRemainingRouteWaiter = remainingRouteWaiters.some(function (waiter) {
        return waiter && waiter.__omegaV2ResourceActive !== false &&
          key(waiter.__omegaV2CurrentCountryKey) === country;
      });
      // A route request can be shared by more than one mounted screen. Keep it
      // alive until the last active screen for this country leaves.
      if (!hasRemainingRouteWaiter) {
        logisticsRoutePlanGenerations[country] = (Number(logisticsRoutePlanGenerations[country]) || 0) + 1;
        var routeController = logisticsRoutePlanControllers[country];
        if (routeController && typeof routeController.abort === 'function') {
          try { routeController.abort(); } catch (_) {}
        }
        delete logisticsRoutePlanControllers[country];
        delete logisticsRoutePlanCache[country];
        delete logisticsRoutePlanRequests[country];
      }
    }
    delete root.__omegaV2ResourceOptions;
    delete root.__omegaV2ResourceModel;
    delete root.__omegaV2CurrentCountryKey;
    delete root.__omegaV2ResourceTab;
    delete root.__omegaV2SelectedMineId;
    delete root.__omegaV2BuildSiteId;
    delete root.__omegaV2MineAction;
    return { ok:true, countryId:country, unloaded:true };
  }

  g.OmegaUIV2ResourceMinistry = Object.freeze({
    version: '1.2.0',
    resourceIconIds: RESOURCE_ICON_IDS.slice(),
    resourceIconPath: resourceIconPath,
    mineArchetype: mineArchetype,
    buildViewModel: buildViewModel,
    render: render,
    unload: unload
  });
})(typeof window !== 'undefined' ? window : globalThis);
