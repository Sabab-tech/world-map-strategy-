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
    return key(row && (row.countryId || row.countryCode || row.identity && row.identity.countryIso3 || row.sourceSiteRecord && row.sourceSiteRecord.countryCode) || '');
  }

  function resourceId(row) {
    return String(row && (row.identity && (row.identity.resourceId || row.identity.resourceTypeId || row.identity.resourceName) ||
      row.sourceSiteRecord && (row.sourceSiteRecord.resourceId || row.sourceSiteRecord.resourceTypeId) ||
      row.resourceId || row.resourceTypeId || row.resId) || '').trim();
  }

  function uniqueSiteRows(rows) {
    var byId = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var id = siteId(row), cid = countryId(row), rid = resourceId(row);
      if (!id || !cid || !rid || row && row.runtime && row.runtime.aliasOfSiteId) return;
      if (!Object.prototype.hasOwnProperty.call(byId, id)) byId[id] = row;
    });
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) {
      return String(a.siteName || a.name || siteId(a)).localeCompare(String(b.siteName || b.name || siteId(b)));
    });
  }

  function sourceCatalogs() {
    var rows = [];
    var canonical = g.OmegaResourceSiteCanonicalCatalogData || (g.Omega && g.Omega.ResourceSiteCanonicalCatalogData);
    var binding = g.OmegaIndividualResourceSiteBinding || (g.Omega && g.Omega.IndividualResourceSiteBinding);
    if (canonical && Array.isArray(canonical.sites)) rows = rows.concat(canonical.sites);
    if (binding && Array.isArray(binding.sites)) rows = rows.concat(binding.sites);
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
    var rows = Array.isArray(options.sites) ? uniqueSiteRows(options.sites) : sourceCatalogs();
    var selectedCountry = key(options.countryId || '');
    if (selectedCountry) rows = rows.filter(function (row) { return countryId(row) === selectedCountry; });
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

  function render(root, options) {
    options = options || {};
    if (!root || typeof root !== 'object') return { ok: false, code: 'RESOURCE_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    var selectOptions = '<option value="all">All registered resources</option>' + Array.from(new Set(model.sites.map(function (item) { return item.resourceId; })).values()).map(function (id) {
      return '<option value="' + esc(id) + '">' + esc(id.replace(/[_-]+/g, ' ')) + '</option>';
    }).join('');
    var cards = model.sites.map(function (site) {
      var stockLabel = site.stock ? fmt(site.stock.quantity) + ' ' + esc(site.stock.unit) : 'Unavailable';
      var reserveLabel = site.reserve.value !== null ? fmt(site.reserve.value) + ' ' + esc(site.reserve.unit) + ' · ' + esc(site.reserve.status) :
        site.modeledReserve && site.modeledReserve.modeledValue !== null ? fmt(site.modeledReserve.modeledValue) + ' ' + esc(site.modeledReserve.unit) + ' · MODELED' :
          esc(site.reserve.status);
      var productionLabel = site.production.value !== null ? fmt(site.production.value) + ' ' + esc(site.production.unit) + ' · ' + esc(site.production.status) : esc(site.production.status);
      var openEnabled = typeof options.onOpenSite === 'function';
      var locateEnabled = typeof options.onLocateSite === 'function';
      return '<article class="omega-v2-card" data-omega-v2-site-card data-site-id="' + esc(site.siteId) + '" data-resource="' + esc(site.resourceId) + '" data-search="' + esc((site.name + ' ' + site.resourceId + ' ' + site.location + ' ' + site.status).toLowerCase()) + '">' +
        '<div class="omega-v2-card-header"><div><div class="omega-v2-eyebrow">' + esc(site.resourceId.replace(/[_-]+/g, ' ')) + '</div><h3 class="omega-v2-card-title">' + esc(site.name) + '</h3><div class="omega-v2-card-meta">' + esc(site.countryId) + ' · ' + esc(site.location) + '</div></div><span class="omega-v2-status" data-state="' + (site.status === 'OPERATIONAL' || site.status === 'ACTIVE' ? 'operational' : site.status === 'UNOBSERVED' ? 'unknown' : 'attention') + '">' + esc(site.status) + '</span></div>' +
        '<div class="omega-v2-vehicle-stats">' +
        '<div><span>Reported reserve</span><strong>' + reserveLabel + '</strong></div>' +
        '<div><span>Current warehouse stock</span><strong>' + stockLabel + '</strong></div>' +
        '<div><span>Measured production</span><strong>' + productionLabel + '</strong></div>' +
        '<div><span>Coordinates</span><strong>' + (site.coordinates ? esc((site.coordinates.latitude !== undefined ? site.coordinates.latitude : site.coordinates.lat) + ', ' + (site.coordinates.longitude !== undefined ? site.coordinates.longitude : site.coordinates.lng)) : 'Not recorded') + '</strong></div>' +
        '</div><div class="omega-v2-source">Site ID: ' + esc(site.siteId) + ' · Source: ' + esc(site.source) + '</div>' +
        '<div class="omega-v2-actions">' +
        '<button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-site-action="open" data-site-id="' + esc(site.siteId) + '"' + (openEnabled ? '' : ' disabled title="No canonical site-detail route is connected."') + '>View site</button>' +
        '<button type="button" class="omega-v2-button omega-v2-button--quiet" data-omega-v2-site-action="locate" data-site-id="' + esc(site.siteId) + '"' + (locateEnabled ? '' : ' disabled title="No map locator adapter is connected."') + '>Locate on map</button>' +
        '</div></article>';
    }).join('');

    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-resource">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">ENERGY & MINING</div><h1 class="omega-v2-title">Mines & Fields</h1><p class="omega-v2-subtitle">Each entry is a unique registered site. Missing measurements remain unavailable.</p></div><span class="omega-v2-status" data-state="' + (model.ready ? 'operational' : 'attention') + '">' + fmt(model.siteCount) + ' registered sites</span></header>' +
      '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>Registered sites</span><strong>' + fmt(model.siteCount) + '</strong></div><div class="omega-v2-kpi"><span>Selected country</span><strong>' + esc(model.countryId || 'All countries') + '</strong></div><div class="omega-v2-kpi"><span>Observed reserves</span><strong>Site-level only</strong></div><div class="omega-v2-kpi"><span>Stock source</span><strong>' + (typeof options.getInventoryForSite === 'function' ? 'Inventory adapter' : 'Unavailable') + '</strong></div></div>' +
      '<div class="omega-v2-note">Reserve is not warehouse stock. Modeled reserves are labeled MODELED; a transfer is not complete until the authoritative shipment/warehouse runtime confirms receipt. This screen does not execute mining actions on its own.</div>' +
      '<div class="omega-v2-filterbar"><input type="search" aria-label="Search mine sites" placeholder="Search site, commodity or region" data-omega-v2-site-search><select aria-label="Filter by resource" data-omega-v2-resource-filter>' + selectOptions + '</select></div>' +
      '<div class="omega-v2-card-meta">Found <strong data-omega-v2-site-visible-count>' + fmt(model.siteCount) + '</strong> registered site(s).</div>' +
      (model.siteCount ? '<div class="omega-v2-grid" data-omega-v2-site-grid>' + cards + '</div>' : '<div class="omega-v2-empty">No canonical site records are available for this context. ' + esc(model.emptyReason) + '</div>') +
      '</section>';

    if (!root.__omegaV2ResourceBound && typeof root.addEventListener === 'function') {
      root.addEventListener('input', function (event) {
        if (!event || !event.target) return;
        if (event.target.matches && event.target.matches('[data-omega-v2-site-search]')) applySiteFilter(root);
      });
      root.addEventListener('change', function (event) {
        if (!event || !event.target) return;
        if (event.target.matches && event.target.matches('[data-omega-v2-resource-filter]')) applySiteFilter(root);
      });
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var button = target.closest('[data-omega-v2-site-action]');
        if (!button || !root.contains(button) || button.disabled) return;
        var id = button.getAttribute('data-site-id');
        if (button.getAttribute('data-omega-v2-site-action') === 'open' && typeof root.__omegaV2ResourceOptions.onOpenSite === 'function') {
          root.__omegaV2ResourceOptions.onOpenSite(id);
        } else if (button.getAttribute('data-omega-v2-site-action') === 'locate' && typeof root.__omegaV2ResourceOptions.onLocateSite === 'function') {
          root.__omegaV2ResourceOptions.onLocateSite(id);
        }
      });
      root.__omegaV2ResourceBound = true;
    }
    root.__omegaV2ResourceOptions = options;
    return { ok: true, siteCount: model.siteCount, model: model };
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
    version: '1.0.0',
    buildViewModel: buildViewModel,
    render: render
  });
})(typeof window !== 'undefined' ? window : globalThis);
