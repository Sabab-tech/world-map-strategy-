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
  var logisticsRouteManifestRequest = null;

  function fetchLogisticsJson(path) {
    if (typeof g.fetch !== 'function') return Promise.reject(new Error('FETCH_UNAVAILABLE'));
    return g.fetch('./' + path, { cache: 'force-cache' }).then(function (response) {
      if (!response || response.ok === false) throw new Error('LOGISTICS_DATA_REQUEST_FAILED');
      return response.json();
    });
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
      if (!root || root.__omegaV2ResourceTab !== 'logistics' ||
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
    if (!logisticsRouteManifestRequest) {
      logisticsRouteManifestRequest = fetchLogisticsJson('resource_site_logistics_routes_v1.json');
    }
    var request = logisticsRouteManifestRequest.then(function (manifest) {
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
      if (!logisticsRouteShardRequests[file]) {
        logisticsRouteShardRequests[file] = fetchLogisticsJson(file).then(function (shard) {
          if (!shard || !Array.isArray(shard.routes)) throw new Error('LOGISTICS_ROUTE_SHARD_INVALID');
          return shard.routes;
        });
      }
      return logisticsRouteShardRequests[file].then(function (rows) {
        var routes = rows.filter(function (route) {
          return key(route && route.countryId) === country &&
            String(route.siteId || '').trim() && String(route.resourceId || '').trim() &&
            route.routePlan && typeof route.routePlan === 'object';
        }).slice().sort(function (a, b) {
          return String(a.siteName || a.siteId).localeCompare(String(b.siteName || b.siteId));
        });
        return { status:'ready', routes:routes };
      });
    }).catch(function () {
      return { status:'unavailable', routes:[] };
    }).then(function (result) {
      logisticsRoutePlanCache[country] = result;
      delete logisticsRoutePlanRequests[country];
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

  function countrySelectMarkup(currentCountry) {
    var rows = countryRoster(currentCountry);
    return '<label class="omega-v2-resource-country-select"><span>Selected country</span><select data-omega-v2-resource-country aria-label="Browse resource country">' +
      rows.map(function (row) {
        return '<option value="' + esc(row.id) + '"' + (row.id === currentCountry ? ' selected' : '') + '>' +
          esc(row.name) + ' (' + esc(row.id) + ')</option>';
      }).join('') + '</select></label>';
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
    var model = buildViewModel(options);
    var active = options.tab || root.__omegaV2ResourceTab || 'dashboard';
    if (active === 'reserves') active = 'mines';
    if (active === 'warehouses') active = 'inventory';
    if (active === 'transport') active = 'logistics';
    var stateRoot = g.Game && g.Game.state || g.gameState || {};
    var countryKey = String(model.countryId || options.countryId || '').trim().toUpperCase();
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
      var values = [
        stateRoot.simulation && stateRoot.simulation.session && stateRoot.simulation.session.playerCountryId,
        stateRoot.simulation && stateRoot.simulation.playerCountryId,
        stateRoot.playerCountryId, g.Game && g.Game.playerCountryId
      ];
      try {
        var simulation = g.Omega && g.Omega.Simulation;
        if (simulation && typeof simulation.getPlayerCountryId === 'function') values.unshift(simulation.getPlayerCountryId());
      } catch (_) {}
      for (var i = 0; i < values.length; i += 1) {
        if (values[i] != null && String(values[i]).trim()) return selectedCountryKey(values[i]);
      }
      return '';
    }
    var canOperate = !!countryKey && countryKey === playerCountryKey();
    var gameResource = countryBucket(stateRoot.resource) || countryBucket(stateRoot.resources) || {};
    var industrial = gameResource.industrialNetwork && typeof gameResource.industrialNetwork === 'object' ? gameResource.industrialNetwork : {};
    var rawWarehouse = gameResource.warehouse && typeof gameResource.warehouse === 'object' ? gameResource.warehouse : {};
    var processedWarehouse = gameResource.processedWarehouse && typeof gameResource.processedWarehouse === 'object' ? gameResource.processedWarehouse : {};
    var inventory = gameResource.inventory && typeof gameResource.inventory === 'object' ? gameResource.inventory :
      gameResource.warehouseInventory && typeof gameResource.warehouseInventory === 'object' ? gameResource.warehouseInventory : {};
    var batchesRaw = Array.isArray(inventory.batches) ? inventory.batches :
      Array.isArray(inventory.inventoryBatches) ? inventory.inventoryBatches :
      Array.isArray(gameResource.warehouseBatches) ? gameResource.warehouseBatches :
      Array.isArray(gameResource.stockBatches) ? gameResource.stockBatches : null;
    var inventoryRows = [];
    if (batchesRaw) {
      inventoryRows = batchesRaw.map(function (row) {
        return { batchId:row.batchId || row.id || '', resourceId:row.resourceId || row.materialId || row.commodity || '',
          quantity:val(row.availableQuantity !== undefined ? row.availableQuantity : row.quantity !== undefined ? row.quantity : row.amount),
          unit:row.unit || row.quantityUnit || '', location:row.warehouseId || row.warehouse || row.location || '',
          status:row.status || '' };
      });
    }
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
    function dailyDemand(resourceId) {
      var maps = [
        gameResource.demandByResource, gameResource.resourceDemand,
        gameResource.nationalDemand && (gameResource.nationalDemand.byResource || gameResource.nationalDemand),
        gameResource.demand && (gameResource.demand.byResource || gameResource.demand)
      ];
      for (var i = 0; i < maps.length; i += 1) {
        var map = maps[i];
        if (!map || typeof map !== 'object') continue;
        var hit = map[resourceId];
        if (hit === undefined) {
          var match = Object.keys(map).find(function (key) { return key.toLowerCase() === String(resourceId).toLowerCase(); });
          if (match) hit = map[match];
        }
        if (hit && typeof hit === 'object') {
          var value = numberOrNull(hit.dailyDemand !== undefined ? hit.dailyDemand :
            hit.demandPerDay !== undefined ? hit.demandPerDay : hit.quantityPerDay !== undefined ? hit.quantityPerDay :
            hit.perDay !== undefined ? hit.perDay : hit.perTurn !== undefined ? hit.perTurn : null);
          if (value !== null && value >= 0) return value;
        }
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
      var rules = g.OmegaResourceIndustrialCatalogData || g.Omega && g.Omega.ResourceIndustrialCatalogData || {};
      var rule = rules.resourceRules && rules.resourceRules[resourceId];
      if (!rule) return '';
      return String(rule.unit || rule.baseUnit || rule.outputUnit || '');
    }
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
    var distinctResources = Array.from(new Set(model.sites.filter(eligible).map(function (site) { return site.resourceId; })));
    var rawStock = rawWarehouse.availableByResource && typeof rawWarehouse.availableByResource === 'object' ? rawWarehouse.availableByResource : {};
    var finishedStock = processedWarehouse.availableByResource && typeof processedWarehouse.availableByResource === 'object' ? processedWarehouse.availableByResource : {};
    var inventoryKeys = Array.from(new Set(distinctResources.concat(Object.keys(rawStock), Object.keys(finishedStock)))).sort();
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
    function shortageFor(resourceId) {
      var demand = dailyDemand(resourceId), raw = stockFor(resourceId, rawStock), processed = stockFor(resourceId, finishedStock);
      if (demand === null || raw === null && processed === null) return null;
      return Math.max(0, demand - (raw || 0) - (processed || 0));
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
      var state = g.Game && g.Game.state || g.gameState || {};
      var values = [state.simulation && state.simulation.session && state.simulation.session.playerCountryId,
        state.simulation && state.simulation.playerCountryId,state.playerCountryId,g.Game && g.Game.playerCountryId];
      try { var sim = g.Omega && g.Omega.Simulation; if (sim && typeof sim.getPlayerCountryId === 'function') values.unshift(sim.getPlayerCountryId()); } catch (_) {}
      for (var i=0;i<values.length;i+=1) if (values[i]!=null && String(values[i]).trim()) return selectedCountryKey(values[i]);
      return '';
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
    var heroCountry = g.OmegaCountryRuntimeData && typeof g.OmegaCountryRuntimeData.resolveCountry === 'function'
      ? g.OmegaCountryRuntimeData.resolveCountry(countryKey) : null;
    var rosterCountry = countryRoster(countryKey).find(function (row) { return row.id === countryKey; });
    var countryLabel = String(heroCountry && (heroCountry.officialName || heroCountry.name || heroCountry.countryName) ||
      rosterCountry && rosterCountry.name || countryKey || 'Selected country');
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
    function stockRow(rid) {
      var raw = stockFor(rid, rawStock), processed = stockFor(rid, finishedStock);
      var demand = dailyDemand(rid), shortage = shortageFor(rid);
      var unit = resourceUnit(rid);
      return '<tr><td><span class="omega-v2-resource-table-icon">' + resourceIconMarkup(rid, resourceLabel(rid)) + '</span>' +
        esc(resourceLabel(rid)) + '</td><td>' + amount(raw, unit) + '</td><td>' + amount(processed, unit) + '</td><td>' +
        (movementIn[rid] !== undefined ? amount(movementIn[rid], unit) : '—') + '</td><td>' +
        (movementOut[rid] !== undefined ? amount(movementOut[rid], unit) : '—') + '</td><td>' +
        (demand !== null ? amount(shortage, unit) : '—') + '</td></tr>';
    }
    var stockTable = inventoryKeys.length ? '<div class="omega-v2-table-wrap"><table><thead><tr><th>Resource</th><th>Raw stock</th><th>Processed</th><th>In</th><th>Out</th><th>Shortage</th></tr></thead><tbody>' +
      inventoryKeys.map(stockRow).join('') + '</tbody></table></div>' : '<div class="omega-v2-empty">No warehouse balances have been recorded.</div>';
    var inventoryMarkup = '<div class="omega-v2-kpis">' +
      renderKpi('Raw stock types', String(Object.keys(rawStock).length), 'Country warehouse', 'neutral') +
      renderKpi('Processed types', String(Object.keys(finishedStock).length), 'Finished stock', 'neutral') +
      renderKpi('Tracked batches', String(inventoryRows.length), 'Recorded inventory entries', 'neutral') +
      renderKpi('Stock shortages', String(inventoryKeys.filter(function (rid) { return shortageFor(rid) > 0; }).length), 'Where demand is recorded', inventoryKeys.some(function (rid) { return shortageFor(rid) > 0; }) ? 'shortage' : 'neutral') +
      '</div><section class="omega-v2-card omega-v2-movement-card"><h2>Inventory movement</h2><p>Stored quantity, confirmed receipts and recorded dispatches for the selected country.</p>' + stockTable + '</section>' +
      (inventoryRows.length ? '<section class="omega-v2-card omega-v2-movement-card"><h2>Recent batches</h2><div class="omega-v2-table-wrap"><table><thead><tr><th>Resource</th><th>Quantity</th><th>Warehouse</th><th>Status</th></tr></thead><tbody>' +
        inventoryRows.slice(-40).reverse().map(function (row) { return '<tr><td>' + esc(resourceLabel(row.resourceId)) + '</td><td>' + amount(row.quantity, row.unit) +
          '</td><td>' + esc(row.location || '—') + '</td><td>' + esc(human(row.status)) + '</td></tr>'; }).join('') +
        '</tbody></table></div></section>' : '');
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
            reference.capacityUnit));
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

    function logisticsDesignFleetEstimate(route, legs, byMode) {
      var production = route && route.planningProduction || null;
      var rate = numberOrNull(production && production.rate);
      var productionUnit = logisticsPlanningUnit(production && production.unit);
      var totals = Object.create(null);
      safeArray(legs).forEach(function (leg) {
        var mode = String(leg && (leg.transportMode || leg.mode) || '').toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(logisticsTransportModeMeta, mode)) return;
        var profile = byMode && byMode[mode] || {};
        var payload = numberOrNull(leg && leg.designCapacityPerTrip);
        if (payload === null) payload = numberOrNull(profile.payloadTonnes);
        var payloadUnit = logisticsPlanningUnit(leg && leg.designCapacityPerTripUnit);
        if (!payloadUnit && payload !== null) payloadUnit = 'TONNES_PER_TRIP';
        var capacity = numberOrNull(leg && leg.designCapacityPerDay);
        var capacityUnit = logisticsPlanningUnit(leg && leg.designCapacityUnit);
        var lineCapacity = numberOrNull(leg && (leg.designCapacityPerLinePerDay !== undefined ?
          leg.designCapacityPerLinePerDay : (leg.capacityPerLinePerDay !== undefined ?
          leg.capacityPerLinePerDay : leg.lineCapacityPerDay)));
        // Do not substitute corridor capacity for per-line capacity.
        var units = null, tripsPerDay = null, basis = '', rateAvailable = rate !== null && rate >= 0 && !!productionUnit;
        if (rateAvailable && rate === 0) {
          units = 0;
          tripsPerDay = mode === 'pipeline' ? null : 0;
          basis = 'zero-simulated-production';
        } else if (rateAvailable && mode === 'pipeline') {
          var pipelineUnit = lineCapacity !== null && lineCapacity > 0 ? capacityUnit : null;
          if (lineCapacity !== null && lineCapacity > 0 && pipelineUnit && productionUnit === pipelineUnit) {
            units = Math.max(0, Math.ceil(rate / lineCapacity));
            basis = 'compatible-production-rate-divided-by-modeled-pipeline-line-capacity';
          }
        } else if (rateAvailable && capacity !== null && capacity > 0 && capacityUnit && productionUnit === capacityUnit) {
          units = Math.max(0, Math.ceil(rate / capacity));
          basis = 'compatible-production-rate-divided-by-distance-aware-per-vehicle-capacity';
          var tripBase = payloadUnit.replace(/_PER_TRIP$/, '');
          var rateBase = productionUnit.replace(/_PER_DAY$/, '');
          if (payload !== null && payload > 0 && tripBase && rateBase && tripBase === rateBase) tripsPerDay = rate / payload;
        }
        if (!totals[mode]) totals[mode] = { estimatedUnits: 0, estimatedTripsPerDay: 0, hasTripRate: true,
          available: true, legCount: 0, basis: [] };
        var stat = totals[mode];
        stat.legCount += 1;
        stat.basis.push(basis || 'production-rate-or-unit-compatible-capacity-unavailable');
        if (units === null || !Number.isFinite(units)) stat.available = false;
        else stat.estimatedUnits += units;
        if (tripsPerDay === null || !Number.isFinite(tripsPerDay)) stat.hasTripRate = false;
        else stat.estimatedTripsPerDay += tripsPerDay;
      });
      Object.keys(totals).forEach(function (mode) {
        var stat = totals[mode];
        if (!stat.available) stat.estimatedUnits = null;
        if (!stat.hasTripRate) stat.estimatedTripsPerDay = null;
      });
      return totals;
    }
    function logisticsTransportIconPath(mode, resourceId) {
      var value = String(mode || '').trim().toLowerCase();
      var iconMode = value === 'rail' || value === 'train' ? 'train' :
        (value === 'ship' || value === 'truck' || value === 'barge' || value === 'pipeline' ? value : 'truck');
      var rid = String(resourceId || '').trim().toLowerCase();
      var cargo = /coal|lignite|coke|dry[_ -]?bulk/.test(rid) ? 'coal-dry-bulk' :
        /oil|petroleum|diesel|fuel|crude|liquid/.test(rid) ? 'oil-liquid' :
        /gas|lng|methane/.test(rid) ? 'gas-lng' :
        /ore|iron|copper|bauxite|aggregate|limestone|gravel|stone|mineral|gold|nickel|rare[_ -]?earth/.test(rid)
          ? 'ore-aggregate' : 'general-cargo';
      return 'assets/omega-industrial-icons-v1/transport/cargo/' + cargo + '/' + iconMode + '.svg';
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
      var cards = Object.keys(logisticsTransportModeMeta).map(function (mode) {
        var meta = logisticsTransportModeMeta[mode], row = byMode[mode];
        var count = row ? numberOrNull(row.count) : null;
        var configured = !!(ready && row && row.configured === true && count !== null && count >= 0);
        if (configured) configuredModeCount += 1;
        var estimate = designByMode[mode] || null;
        var used = routeModes.indexOf(mode) >= 0;
        var estimateLabel = !used ? 'Not used by this route' :
          (estimate && estimate.available ? 'Design need: ' + fmt(estimate.estimatedUnits) + ' ' +
            (estimate.estimatedUnits === 1 ? meta.single : meta.unit) : 'Design need unavailable');
        var tripRate = estimate && estimate.estimatedTripsPerDay !== null
          ? ' · ' + fmt(Number(estimate.estimatedTripsPerDay.toFixed(4))) + ' trips/day' : '';
        if (used && estimate && estimate.available) { designTotal += estimate.estimatedUnits; designAvailableModes += 1; }
        if (used && (!estimate || !estimate.available)) unknownRouteModes += 1;
        var iconPath = logisticsTransportIconPath(mode, route && route.resourceId);
        return '<div class="omega-v2-logistics-fleet-mode" data-transport-mode="' + esc(mode) +
          '" data-fleet-configured="' + (configured ? 'true' : 'false') +
          '" data-design-estimate-available="' + (estimate && estimate.available ? 'true' : 'false') + '">' +
          '<img class="omega-v2-logistics-fleet-mode-icon" src="' + esc(iconPath) + '" alt="' +
          esc(meta.label) + '" width="46" height="30" loading="lazy" decoding="async">' +
          '<div class="omega-v2-logistics-fleet-mode-copy"><span>' + esc(meta.label) + '</span><strong>' +
          esc(configured ? fmt(count) + ' ' + meta.unit : (ready ? 'Not configured' : 'Unknown')) +
          '</strong><small>' + esc(estimateLabel + tripRate) + '</small></div></div>';
      var countFields = Object.keys(logisticsTransportModeMeta).map(function (mode) {
        var meta = logisticsTransportModeMeta[mode], row = byMode[mode];
        var count = row ? numberOrNull(row.count) : null;
        var configured = !!(ready && row && row.configured === true && count !== null && count >= 0);
        return '<label class="omega-v2-logistics-count-field"><span>' + esc(meta.label) + '</span>' +
          '<input type="number" inputmode="numeric" min="0" step="1" data-omega-v2-fleet-count-input data-transport-mode="' +
          esc(mode) + '" aria-label="' + esc(meta.label + ' count') + '" value="' +
          esc(configured ? String(Math.floor(count)) : '') + '" placeholder="Not configured"></label>';
      }).join('');
      }).join('');
      return '<section class="omega-v2-logistics-fleet-summary" data-omega-v2-logistics-fleet-summary data-site-id="' +
        esc(route && route.siteId || '') + '"><div class="omega-v2-logistics-fleet-heading">' +
        '<span class="omega-v2-eyebrow">TRANSPORT AT THIS MINE</span><strong>' +
        (ready ? fmt(configuredModeCount) + ' of 5 counts configured' : 'Actual fleet counts unknown') +
        '</strong></div><div class="omega-v2-logistics-fleet-grid">' + cards + '</div>' +
        '<div class="omega-v2-logistics-fleet-foot"><span>Route legs: <strong>' + fmt(safeArray(legs).length) +
        '</strong></span><span>Transport modes: <strong>' + fmt(routeModes.length) + '</strong></span>' +
        '<span>Calculated design units: <strong>' + (routeModes.length && designAvailableModes ? fmt(designTotal) : 'Unavailable') +
        '</strong></span><span>Design estimates available: <strong>' + fmt(designAvailableModes) + ' of ' +
        fmt(routeModes.length) + '</strong></span></div>' +
        ((ready && configuredModeCount < 5) || !ready || unknownRouteModes
          ? '<p class="omega-v2-logistics-fleet-note">Configured fleet counts are actual in-game settings. Design needs are calculated separately from route flow, payload and round-trip cycle time. Missing pipeline per-line capacity remains unknown.</p>'
          : '<p class="omega-v2-logistics-fleet-note">Actual fleet counts and calculated design requirements are separate values; route legs are not vehicle IDs.</p>') +
        '<details class="omega-v2-logistics-fleet-editor"><summary>Configure transport counts</summary>' +
        '<p class="omega-v2-logistics-fleet-note">Enter a whole-number count for any transport type. Leave a field blank to keep its current value; enter 0 to record that none are available.</p>' +
        '<form data-omega-v2-logistics-fleet-form data-site-id="' + esc(route && route.siteId || '') +
        '" data-country-id="' + esc(route && route.countryId || countryKey || '') + '">' +
        '<div class="omega-v2-logistics-count-grid">' + countFields + '</div>' +
        '<button type="submit" class="omega-v2-button omega-v2-button--accent">Save transport counts</button></form></details>' +
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
            stat.total += count; stat.configuredSites += 1; configuredProfiles += 1;
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
        var design = stat.designSites ? 'Design need: ' + fmt(stat.designUnits) + ' ' +
          (stat.designUnits === 1 ? meta.single : meta.unit) : 'Design need unavailable';
        return '<div class="omega-v2-logistics-overview-mode" data-transport-mode="' + esc(mode) + '">' +
          '<img class="omega-v2-logistics-overview-mode-icon" src="' + esc(logisticsModeGenericIconPath(mode)) +
          '" alt="' + esc(meta.label) + '" width="48" height="34" loading="lazy" decoding="async">' +
          '<div><span>' + esc(meta.label) + '</span><strong>' + esc(actual) + '</strong>' +
          '<small>' + esc(fmt(stat.configuredSites) + ' of ' + fmt(sites.length) + ' mine sites have counts') + '</small>' +
          '<small>' + esc(design) + '</small><small>' + esc(fmt(stat.designSites) + ' site estimates available') +
          '</small></div></div>';
      }).join('');
      return '<section class="omega-v2-card omega-v2-logistics-fleet-overview" data-omega-v2-logistics-fleet-overview>' +
        '<div class="omega-v2-logistics-fleet-heading"><div><h2>Transport Fleet Summary</h2>' +
        '<p>Configured fleets and design needs across the selected country’s registered mine routes.</p></div>' +
        '<strong>' + fmt(sites.length) + ' mine sites · ' + fmt(readableSites) + ' readable fleet records</strong></div>' +
        '<div class="omega-v2-logistics-overview-grid">' + modeCards + '</div>' +
        '<div class="omega-v2-logistics-fleet-foot"><span>Mode profiles configured: <strong>' +
        fmt(configuredProfiles) + '</strong></span><span>Unknown count profiles: <strong>' + fmt(unknownProfiles) +
        '</strong></span><span>Per-vehicle IDs required: <strong>No</strong></span></div>' +
        '<p class="omega-v2-logistics-fleet-note">Actual configured fleet totals are not the same as design-needed trips or route legs. Unconfigured counts stay unknown, not zero.</p></section>';
    }
    function logisticsRouteCard(route) {
      var plan = route && route.routePlan || {};
      var destination = route.destination && route.destination.warehouseId || 'National raw inventory';
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
      var matched = hasCurrentShipmentMatch(route);
      var resource = route.resourceId || route.resourceIconKey || 'supply';
      var siteName = route.siteName || route.siteId || 'Registered mine site';
      var from = siteName, to = destination;
      var routeIcons = legs.map(function (leg, index) {
        var mode = String(leg && (leg.transportMode || leg.mode) || 'truck').toLowerCase();
        var meta = logisticsTransportModeMeta[mode] || {label:human(mode)};
        return '<span class="omega-v2-logistics-route-leg-icon" data-route-leg="' + (index + 1) +
          '" data-route-leg-mode="' + esc(mode) + '"><img src="' +
          esc(logisticsTransportIconPath(mode, resource)) + '" alt="' + esc(meta.label) +
          '" width="40" height="28" loading="lazy" decoding="async"><small>' + esc(meta.label) + '</small></span>';
      }).join('');
      return '<article class="omega-v2-card omega-v2-logistics-card omega-v2-logistics-route-card" data-logistics-state="attention" data-logistics-plan-site-id="' +
        esc(route.siteId || '') + '" data-current-match="' + (matched ? 'matched' : 'unavailable') +
        '" data-logistics-mode-chain="' + esc(legs.map(function (leg) { return String(leg.transportMode || leg.mode || '').toLowerCase(); }).join(',')) + '">' +
        '<div class="omega-v2-logistics-header"><div class="omega-v2-logistics-cargo"><span class="omega-v2-resource-icon omega-v2-logistics-resource-art">' +
        resourceIconMarkup(resource, resourceLabel(resource)) + '</span><div class="omega-v2-logistics-cargo-copy">' +
        '<span class="omega-v2-eyebrow">SITE ROUTE PLAN</span><h3 class="omega-v2-card-title">' + esc(siteName) +
        '</h3><span class="omega-v2-card-meta">' + esc(resourceLabel(resource)) + '</span></div></div>' +
        '<span class="omega-v2-status" data-state="attention">Route plan</span></div>' +
        '<div class="omega-v2-logistics-path" aria-label="Planned route from ' + esc(from) + ' to ' + esc(to) + '">' +
        '<div class="omega-v2-logistics-node omega-v2-logistics-node--origin"><span class="omega-v2-logistics-node-art">' +
        logisticsIconMarkup('origin') + '</span><span class="omega-v2-logistics-node-copy"><small>ORIGIN</small><strong>' +
        esc(from) + '</strong></span></div><div class="omega-v2-logistics-link"><span class="omega-v2-logistics-route-icons">' +
        routeIcons + '</span><span class="omega-v2-logistics-link-line"></span><span class="omega-v2-logistics-mode">' +
        esc(modes) + '</span></div><div class="omega-v2-logistics-node omega-v2-logistics-node--destination"><span class="omega-v2-logistics-node-art">' +
        logisticsIconMarkup('warehouse') + '</span><span class="omega-v2-logistics-node-copy"><small>DESTINATION</small><strong>' +
        esc(to) + '</strong></span></div></div><div class="omega-v2-logistics-metrics">' +
        '<div class="omega-v2-logistics-metric"><span>Distance · estimate</span><strong>' +
        (distance !== null ? esc(fmt(distance) + ' km') : 'Unavailable') + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Transit · planned</span><strong>' +
        (transit !== null ? esc(fmt(transit) + ' days') : 'Unavailable') + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Design capacity</span><strong>' +
        (capacity !== null ? esc(fmt(capacity) + (capacityUnit ? ' ' + capacityUnit : '')) : 'Unavailable') + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Route legs</span><strong>' + fmt(legs.length) + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Transport types</span><strong>' + fmt(routeModes.length) + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Current Match</span><strong>' + (matched ? 'Matched' : 'Unavailable') +
        '</strong></div></div>' + logisticsSiteFleetMarkup(route, legs) + '</article>';
    }

    function logisticsRoutePlansMarkup(routeState) {
      if (!routeState || routeState.status === 'idle' || routeState.status === 'loading') {
        return '<section class="omega-v2-card omega-v2-logistics-route-status" data-logistics-route-state="loading" role="status">' +
          '<h2 class="omega-v2-card-title">Mine Site Route Plans</h2><p>Loading registered site routes…</p></section>';
      }
      if (routeState.status !== 'ready') {
        return '<div class="omega-v2-empty" data-logistics-route-state="unavailable">Site route plans unavailable. Current Match: Unavailable.</div>';
      }
      var routes = safeArray(routeState.routes);
      if (!routes.length) {
        return '<div class="omega-v2-empty" data-logistics-route-state="empty">No registered mine/site route plans for this country. Current Match: Unavailable.</div>';
      }
      return '<section class="omega-v2-logistics-route-section" data-logistics-route-state="ready">' +
        logisticsFleetOverviewMarkup(routes) +
        '<div class="omega-v2-logistics-route-heading"><div><h2>Mine Site Route Plans</h2><p>Configured mine-to-warehouse routes</p></div>' +
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
          '<div class="omega-v2-logistics-link"><span class="omega-v2-logistics-route-vehicle">' + logisticsIconMarkup('transport') + '</span><span class="omega-v2-logistics-link-line"></span><span class="omega-v2-logistics-mode">' + esc(modeLabel) + '</span></div>' +
          '<div class="omega-v2-logistics-node omega-v2-logistics-node--destination"><span class="omega-v2-logistics-node-art">' + logisticsIconMarkup(destinationKind) +
          '</span><span class="omega-v2-logistics-node-copy"><small>DESTINATION</small><strong>' + esc(to) + '</strong></span></div></    function logisticsRouteCard(route) {
      var plan = route.routePlan || {};
      var legs = safeArray(plan.legs);
      var distance = numberOrNull(plan.estimatedRouteDistanceKm);
      var transit = numberOrNull(plan.plannedTransitDays);
      var capacity = numberOrNull(plan.capacityBottleneckPerDay);
      var capacityUnit = /RAW_CARGO_TONNES_PER_DAY/i.test(String(plan.capacityUnit || ''))
        ? 'tonnes/day' : buildDisplayUnit(plan.capacityUnit || '');
      var matched = hasCurrentShipmentMatch(route);
      var resource = route.resourceId || route.resourceIconKey || 'supply';
      var siteName = route.siteName || route.siteId || 'Registered mine site';
      var warehouseId = String(route.destination && route.destination.warehouseId || 'WH-' + (route.countryId || countryKey) + '-RAW');
      var destination = route.destination && (route.destination.warehouseName || route.destination.name) || 'Raw-material warehouse';
      var modes = legs.map(function (leg) { return leg && leg.transportMode ? modeDisplayName(String(leg.transportMode).toLowerCase()) : ''; })
        .filter(Boolean).join(' → ') || 'Route not recorded';
      var network = g.OmegaResourceIndustrialNetwork || (g.Omega && g.Omega.ResourceIndustrialNetwork);
      var fleetSnapshot = null;
      try {
        if (network && typeof network.getTransportFleet === 'function') {
          fleetSnapshot = network.getTransportFleet({ countryId: route.countryId || countryKey, siteId: route.siteId });
          if (!fleetSnapshot || fleetSnapshot.status !== 'READY') fleetSnapshot = null;
        }
      } catch (_) { fleetSnapshot = null; }
      var fleetTypes = safeArray(fleetSnapshot && fleetSnapshot.transportTypes);
      var modesByKey = Object.create(null);
      legs.forEach(function (leg) {
        var mode = String(leg && (leg.transportMode || leg.mode) || '').trim().toLowerCase();
        if (!mode) return;
        if (!modesByKey[mode]) {
          var configuredRow = fleetTypes.find(function (row) {
            var type = String(row && row.transportType || '').toLowerCase();
            return type === mode || (mode === 'rail' && type === 'train');
          });
          modesByKey[mode] = {
            mode:mode, legCount:0, distanceKm:0, hasDistance:false, designSlots:0, hasDesignSlots:false,
            capacityPerDay:null, fleetCount:configuredRow && configuredRow.configured === true
              ? numberOrNull(configuredRow.count) : null,
            configured:!!(configuredRow && configuredRow.configured === true),
            vehicleAssetPath:String(leg.transportIconAssetPath || '')
          };
        }
        var row = modesByKey[mode];
        row.legCount += 1;
        var legDistance = numberOrNull(leg.estimatedDistanceKm !== undefined ? leg.estimatedDistanceKm : leg.distanceKm);
        if (legDistance !== null) { row.distanceKm += Math.max(0, legDistance); row.hasDistance = true; }
        var slotCount = numberOrNull(leg.requiredDesignFleetSlots);
        if (slotCount !== null && slotCount >= 0) { row.designSlots += slotCount; row.hasDesignSlots = true; }
        var legCapacity = numberOrNull(leg.designCapacityPerDay);
        if (legCapacity !== null && legCapacity >= 0) row.capacityPerDay = row.capacityPerDay === null
          ? legCapacity : Math.min(row.capacityPerDay, legCapacity);
      });
      var modeRows = Object.keys(modesByKey).map(function (mode) { return modesByKey[mode]; });
      var vehicleRows = modeRows.filter(function (row) { return row.mode !== 'pipeline'; });
      var configuredVehicleUnits = vehicleRows.reduce(function (sum, row) {
        return sum + (row.configured && row.fleetCount !== null ? row.fleetCount : 0);
      }, 0);
      var unconfiguredVehicleModes = vehicleRows.filter(function (row) { return !row.configured; }).length;
      var hasVehicleCount = vehicleRows.some(function (row) { return row.configured; });
      var pipelineRow = modesByKey.pipeline || null;
      var pipelineCount = pipelineRow && pipelineRow.configured ? pipelineRow.fleetCount : null;
      var designSlots = numberOrNull(plan.designFleetSlots);
      if (designSlots === null) {
        var anySlots = modeRows.some(function (row) { return row.hasDesignSlots; });
        designSlots = anySlots ? modeRows.reduce(function (sum, row) { return sum + (row.hasDesignSlots ? row.designSlots : 0); }, 0) : null;
      }
      function modeDisplayName(mode) {
        return ({ truck:'Truck', rail:'Train', ship:'Ship', barge:'Barge', pipeline:'Pipeline' })[mode] || resourceLabel(mode);
      }
      function modeIconPath(row) {
        var path = row.vehicleAssetPath;
        if (!/^assets\/omega-industrial-icons-v1\/transport\/[a-z0-9/_-]+\.svg$/i.test(path)) {
          path = 'assets/omega-industrial-icons-v1/transport/' +
            ({ truck:'truck', rail:'train', ship:'ship', barge:'barge', pipeline:'pipeline' })[row.mode] + '.svg';
        }
        return path;
      }
      var modeSummaryMarkup = modeRows.map(function (row) {
        var countLabel = row.mode === 'pipeline'
          ? (row.configured && row.fleetCount !== null ? fmt(row.fleetCount) + ' lines' : 'Not configured')
          : (row.configured && row.fleetCount !== null ? fmt(row.fleetCount) + ' units' : 'Not configured');
        var slotLabel = row.hasDesignSlots ? fmt(row.designSlots) : 'Not recorded';
        var distanceLabel = row.hasDistance ? fmt(row.distanceKm) + ' km' : 'Not recorded';
        var capLabel = row.capacityPerDay !== null ? fmt(row.capacityPerDay) + ' t/day' : 'Not recorded';
        return '<div class="omega-v2-logistics-mode-row" data-transport-mode="' + esc(row.mode) + '">' +
          '<img class="omega-v2-logistics-mode-icon" src="' + esc(modeIconPath(row)) + '" alt="" loading="lazy" decoding="async">' +
          '<div class="omega-v2-logistics-mode-copy"><strong>' + esc(modeDisplayName(row.mode)) + ' · ' + fmt(row.legCount) +
          (row.legCount === 1 ? ' leg' : ' legs') + '</strong><span>Count: ' + esc(countLabel) +
          ' · Design slots: ' + esc(slotLabel) + '</span><span>Distance: ' + esc(distanceLabel) +
          ' · Design capacity: ' + esc(capLabel) + '</span></div></div>';
      }).join('');
      var legMarkup = legs.map(function (leg, index) {
        var mode = String(leg && (leg.transportMode || leg.mode) || 'transport').toLowerCase();
        var assetPath = String(leg && leg.transportIconAssetPath || '');
        if (!/^assets\/omega-industrial-icons-v1\/transport\/[a-z0-9/_-]+\.svg$/i.test(assetPath)) {
          assetPath = 'assets/omega-industrial-icons-v1/transport/' +
            ({ truck:'truck', rail:'train', ship:'ship', barge:'barge', pipeline:'pipeline' })[mode] + '.svg';
        }
        var legDistance = numberOrNull(leg && (leg.estimatedDistanceKm !== undefined ? leg.estimatedDistanceKm : leg.distanceKm));
        var perTrip = numberOrNull(leg && leg.designCapacityPerTrip);
        var perDay = numberOrNull(leg && leg.designCapacityPerDay);
        var slots = numberOrNull(leg && leg.requiredDesignFleetSlots);
        return '<div class="omega-v2-logistics-leg-row"><img src="' + esc(assetPath) + '" alt="" loading="lazy" decoding="async">' +
          '<div><strong>Leg ' + (index + 1) + ' · ' + esc(modeDisplayName(mode)) + '</strong><span>' +
          (legDistance !== null ? esc(fmt(legDistance) + ' km') : 'Distance not recorded') + ' · ' +
          (perTrip !== null ? esc(fmt(perTrip) + ' per trip') : 'Payload not recorded') + ' · ' +
          (perDay !== null ? esc(fmt(perDay) + ' t/day') : 'Capacity not recorded') + ' · ' +
          (slots !== null ? esc(fmt(slots) + ' design slots') : 'Slots not recorded') + '</span></div></div>';
      }).join('');
      var from = siteName;
      var to = destination + (warehouseId ? ' · ' + warehouseId : '');
      var configuredVehicleLabel = hasVehicleCount
        ? fmt(configuredVehicleUnits) + ' configured' + (unconfiguredVehicleModes ? ' · ' + unconfiguredVehicleModes + ' modes unknown' : '')
        : (vehicleRows.length ? 'Not configured' : '—');
      var pipelineLabel = pipelineRow ? (pipelineCount === null ? 'Not configured' : fmt(pipelineCount) + ' lines') : '—';
      return '<article class="omega-v2-card omega-v2-logistics-card omega-v2-logistics-route-card" data-logistics-state="attention" data-logistics-plan-site-id="' +
        esc(route.siteId || '') + '" data-current-match="' + (matched ? 'matched' : 'unavailable') + '">' +
        '<div class="omega-v2-logistics-header"><div class="omega-v2-logistics-cargo">' +
        '<span class="omega-v2-resource-icon omega-v2-logistics-resource-art">' + resourceIconMarkup(resource, resourceLabel(resource)) + '</span>' +
        '<div class="omega-v2-logistics-cargo-copy"><span class="omega-v2-eyebrow">MINE LOGISTICS</span><h3 class="omega-v2-card-title">' +
        esc(siteName) + '</h3><span class="omega-v2-card-meta">' + esc(resourceLabel(resource)) + '</span></div></div>' +
        '<span class="omega-v2-status" data-state="attention">Route plan</span></div>' +
        '<div class="omega-v2-logistics-path" aria-label="Planned route from ' + esc(from) + ' to ' + esc(to) + '">' +
        '<div class="omega-v2-logistics-node omega-v2-logistics-node--origin"><span class="omega-v2-logistics-node-art">' + logisticsIconMarkup('origin') +
        '</span><span class="omega-v2-logistics-node-copy"><small>MINE</small><strong>' + esc(from) + '</strong></span></div>' +
        '<div class="omega-v2-logistics-link"><span class="omega-v2-logistics-route-vehicle">' + logisticsIconMarkup('transport') +
        '</span><span class="omega-v2-logistics-link-line"></span><span class="omega-v2-logistics-mode">' + esc(modes) + '</span></div>' +
        '<div class="omega-v2-logistics-node omega-v2-logistics-node--destination"><span class="omega-v2-logistics-node-art">' + logisticsIconMarkup('warehouse') +
        '</span><span class="omega-v2-logistics-node-copy"><small>WAREHOUSE</small><strong>' + esc(to) + '</strong></span></div></div>' +
        '<div class="omega-v2-logistics-metrics">' +
        '<div class="omega-v2-logistics-metric"><span>Total distance</span><strong>' + (distance !== null ? esc(fmt(distance) + ' km') : 'Unavailable') + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Planned transit</span><strong>' + (transit !== null ? esc(fmt(transit) + ' days') : 'Unavailable') + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Route legs</span><strong>' + fmt(legs.length) + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Design fleet slots</span><strong>' + (designSlots !== null ? esc(fmt(designSlots)) : 'Not recorded') + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Configured vehicles</span><strong>' + esc(configuredVehicleLabel) + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Pipeline lines</span><strong>' + esc(pipelineLabel) + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Design bottleneck</span><strong>' +
        (capacity !== null ? esc(fmt(capacity) + (capacityUnit ? ' ' + capacityUnit : '')) : 'Unavailable') + '</strong></div>' +
        '<div class="omega-v2-logistics-metric"><span>Current Match</span><strong>' + (matched ? 'Matched' : 'Unavailable') + '</strong></div></div>' +
        (modeSummaryMarkup ? '<section class="omega-v2-logistics-fleet-overview" data-omega-v2-logistics-fleet-overview><div class="omega-v2-logistics-fleet-overview-heading"><h4>Transport Fleet Summary</h4><span>' + esc(configuredVehicleLabel) + '</span></div><div class="omega-v2-logistics-fleet-overview-stats"><div><span>Calculated design units</span><strong>' + (designSlots !== null ? esc(fmt(designSlots)) : 'Unavailable') + '</strong></div><div><span>Configured vehicles</span><strong>' + esc(configuredVehicleLabel) + '</strong></div><div><span>Pipeline lines</span><strong>' + esc(pipelineLabel) + '</strong></div></div><div class="omega-v2-logistics-mode-grid">' + modeSummaryMarkup + '</div></section>' : '') +
        (legMarkup ? '<div class="omega-v2-logistics-leg-list">' + legMarkup + '</div>' : '') +
        '</article>';
    }
(selectedMine);
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
    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-resource omega-v2-resource-premium" data-resource-ui-version="command-v2">' +
      '<header class="omega-v2-heading omega-v2-resource-heading"><div class="omega-v2-resource-heading-copy"><img class="omega-v2-resource-ministry-mark" src="assets/ministry-logos/energy_mining.svg" alt="" aria-hidden="true" loading="lazy" decoding="async"><div>' +
      '<div class="omega-v2-eyebrow">RESOURCE COMMAND</div><h1 class="omega-v2-title">Mine Production Ministry</h1><p class="omega-v2-subtitle">' + esc(countryLabel) +
      ' · Resource Extraction · National Wealth</p></div></div><div class="omega-v2-resource-heading-actions">' + countrySelectMarkup(countryKey) +
      '<span class="omega-v2-status" data-state="' + (model.ready ? 'operational' : 'attention') + '">' +
      fmt(model.sites.filter(eligible).length) + ' mines</span></div></header>' + notice + tabMarkup + '<div data-omega-v2-resource-content>' + contentMarkup + '</div></section>';
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
          var viewedCountry = selectedCountryKey(event.target.value);
          var prior = root.__omegaV2ResourceOptions || {};
          // Country browsing changes only this view. All mutations remain player-country guarded.
          root.__omegaV2ResourceNotice = '';
          root.__omegaV2ResourceSelectedCountryId = viewedCountry;
          scheduleRender(root, Object.assign({}, prior, { countryId:viewedCountry, tab:root.__omegaV2ResourceTab || 'dashboard' }));
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
            var state = g.Game && g.Game.state || g.gameState || {};
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
        ['OMEGA_RESOURCE_MINE_PROJECT_STARTED','OMEGA_RESOURCE_MINE_PROJECT_PROGRESS','OMEGA_RESOURCE_MINE_COMMISSIONED','OMEGA_SIMULATION_TURN_COMMITTED'].forEach(function (name) {
          g.addEventListener(name,function(){ if(root.__omegaV2ResourceOptions) scheduleRender(root,Object.assign({},root.__omegaV2ResourceOptions,{tab:root.__omegaV2ResourceTab||'mines'})); });
        });
        root.__omegaV2RuntimeEventsBound = true;
      }
      root.__omegaV2ResourceBound = true;
    }
    root.__omegaV2ResourceOptions = Object.assign({}, options, { countryId:countryKey });
    root.__omegaV2ResourceModel = model;
    root.__omegaV2CurrentCountryKey = countryKey;
    root.__omegaV2ResourceTab = active;
    if (active === 'mines') applySiteFilter(root);
    if (active === 'logistics') ensureLogisticsRoutePlans(countryKey, root);
    return { ok:true, tab:active, siteCount:model.siteCount, model:model, inventoryRowCount:inventoryRows.length,
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

  g.OmegaUIV2ResourceMinistry = Object.freeze({
    version: '1.1.0',
    resourceIconIds: RESOURCE_ICON_IDS.slice(),
    resourceIconPath: resourceIconPath,
    mineArchetype: mineArchetype,
    buildViewModel: buildViewModel,
    render: render
  });
})(typeof window !== 'undefined' ? window : globalThis);
