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
    if (!root || typeof root !== 'object') return { ok:false, code:'RESOURCE_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    var active = options.tab || root.__omegaV2ResourceTab || 'dashboard';
    var stateRoot = g.Game && g.Game.state || g.gameState || {};
    var countryKey = String(model.countryId || options.countryId || '').trim().toUpperCase();
    function countryBucket(map) {
      if (!map || typeof map !== 'object') return null;
      if (map[countryKey]) return map[countryKey];
      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i += 1) if (keys[i].trim().toUpperCase() === countryKey) return map[keys[i]];
      return null;
    }
    var gameResource = countryBucket(stateRoot.resource) || countryBucket(stateRoot.resources) || {};
    var industrial = gameResource.industrialNetwork && typeof gameResource.industrialNetwork === 'object' ? gameResource.industrialNetwork : {};
    var inventory = gameResource.inventory && typeof gameResource.inventory === 'object' ? gameResource.inventory :
      gameResource.warehouseInventory && typeof gameResource.warehouseInventory === 'object' ? gameResource.warehouseInventory : {};
    var batchesRaw = Array.isArray(inventory.batches) ? inventory.batches :
      Array.isArray(inventory.inventoryBatches) ? inventory.inventoryBatches :
      Array.isArray(gameResource.warehouseBatches) ? gameResource.warehouseBatches :
      Array.isArray(gameResource.stockBatches) ? gameResource.stockBatches : null;
    var inventoryRows = [];
    if (batchesRaw) {
      inventoryRows = batchesRaw.map(function (row) {
        return { batchId:row.batchId || row.id || 'BATCH_ID_NOT_RECORDED', resourceId:row.resourceId || row.materialId || row.commodity || 'RESOURCE_NOT_RECORDED',
          quantity:num(row.availableQuantity !== undefined ? row.availableQuantity : row.quantity !== undefined ? row.quantity : row.amount),
          unit:row.unit || row.quantityUnit || 'unit not recorded', location:row.warehouseId || row.warehouse || row.location || 'Location not recorded',
          status:row.status || 'NOT_RECORDED', provenance:row.provenance || row.source || 'NOT_RECORDED' };
      });
    } else {
      var mapRows = inventory.availableByResource && typeof inventory.availableByResource === 'object' ? inventory.availableByResource :
        inventory.onHandByResource && typeof inventory.onHandByResource === 'object' ? inventory.onHandByResource :
        inventory.stockByResource && typeof inventory.stockByResource === 'object' ? inventory.stockByResource : null;
      if (mapRows) inventoryRows = Object.keys(mapRows).map(function (id) {
        var value = mapRows[id];
        var quantity = value && typeof value === 'object' ? num(value.quantity !== undefined ? value.quantity : value.available) : num(value);
        return { batchId:'BATCH LEVEL NOT RECORDED', resourceId:id, quantity:quantity, unit:value && typeof value === 'object' ? value.unit || 'unit not recorded' : 'unit not recorded',
          location:'Warehouse location not recorded', status:'AGGREGATED INVENTORY ROW', provenance:'COUNTRY INVENTORY SUMMARY' };
      });
    }
    var shipments = Array.isArray(industrial.shipments) ? industrial.shipments :
      Array.isArray(industrial.transportJobs) ? industrial.transportJobs :
      Array.isArray(gameResource.shipmentLedger) ? gameResource.shipmentLedger :
      Array.isArray(gameResource.shipments) ? gameResource.shipments :
      Array.isArray(gameResource.transportLedger) ? gameResource.transportLedger : null;
    var projects = Array.isArray(industrial.projects) ? industrial.projects : [];
    var flows = Array.isArray(industrial.siteFlowLedger) ? industrial.siteFlowLedger :
      Array.isArray(gameResource.siteFlowLedger) ? gameResource.siteFlowLedger :
      Array.isArray(gameResource.extractionLedger) ? gameResource.extractionLedger : [];
    var photoLib = g.OmegaUIPhotoAssets;
    var minePhoto = photoLib && typeof photoLib.get === 'function' ? photoLib.get('open-pit-mine') : null;
    var photoMarkup = minePhoto && /^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(minePhoto.path || ''))
      ? '<figure class="omega-v2-photo"><img src="' + esc(minePhoto.path) + '" loading="lazy" decoding="async" alt="Open-pit mine, representative reference photograph"><figcaption>' + esc(minePhoto.caption || 'Open-pit mine') + '<small>Reference photo; not proof of this country’s live mine ownership</small></figcaption></figure>' : '';
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
        '<div class="omega-v2-vehicle-stats"><div><span>Reported reserve</span><strong>' + reserveLabel + '</strong></div>' +
        '<div><span>Current warehouse stock</span><strong>' + stockLabel + '</strong></div><div><span>Measured production</span><strong>' + productionLabel + '</strong></div>' +
        '<div><span>Coordinates</span><strong>' + (site.coordinates ? esc((site.coordinates.latitude !== undefined ? site.coordinates.latitude : site.coordinates.lat) + ', ' + (site.coordinates.longitude !== undefined ? site.coordinates.longitude : site.coordinates.lng)) : 'Not recorded') + '</strong></div></div>' +
        '<div class="omega-v2-source">Site ID: ' + esc(site.siteId) + ' · Source: ' + esc(site.source) + '</div>' +
        '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-site-action="open" data-site-id="' + esc(site.siteId) + '"' + (openEnabled ? '' : ' disabled title="No canonical site-detail route is connected."') + '>View site</button>' +
        '<button type="button" class="omega-v2-button omega-v2-button--quiet" data-omega-v2-site-action="locate" data-site-id="' + esc(site.siteId) + '"' + (locateEnabled ? '' : ' disabled title="No map locator adapter is connected."') + '>Locate on map</button></div></article>';
    }).join('');
    var tabRows = [
      ['dashboard','Dashboard'],['mines','Mines & Fields'],['reserves','Reserves'],
      ['warehouses','Stock & Warehouses'],['transport','Transport & Supply'],['reports','Reports']
    ];
    var tabMarkup = '<div class="omega-v2-filterbar omega-v2-resource-tabs" role="group" aria-label="Energy and mining sections">' + tabRows.map(function (row) {
      return '<button type="button" class="omega-v2-button ' + (row[0] === active ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') + '" data-omega-v2-resource-tab="' + row[0] + '" aria-pressed="' + (row[0] === active ? 'true' : 'false') + '">' + esc(row[1]) + '</button>';
    }).join('') + '</div>';
    var contentMarkup = '';
    if (active === 'mines') {
      contentMarkup = '<div class="omega-v2-filterbar"><input type="search" aria-label="Search mine sites" placeholder="Search site, commodity or region" data-omega-v2-site-search><select aria-label="Filter by resource" data-omega-v2-resource-filter>' + selectOptions + '</select></div>' +
        '<div class="omega-v2-card-meta">Found <strong data-omega-v2-site-visible-count>' + fmt(model.siteCount) + '</strong> registered site(s).</div>' +
        (model.siteCount ? '<div class="omega-v2-grid" data-omega-v2-site-grid>' + cards + '</div>' : '<div class="omega-v2-empty">No canonical site records are available for this context. ' + esc(model.emptyReason) + '</div>');
    } else if (active === 'reserves') {
      contentMarkup = model.sites.length ? '<div class="omega-v2-grid">' + model.sites.map(function (site) {
        var observed = site.reserve.value !== null ? fmt(site.reserve.value) + ' ' + esc(site.reserve.unit) + ' · ' + esc(site.reserve.status) : 'Not recorded (' + esc(site.reserve.status) + ')';
        var modeled = site.modeledReserve && site.modeledReserve.modeledValue !== null ? fmt(site.modeledReserve.modeledValue) + ' ' + esc(site.modeledReserve.unit) + ' · MODELED' : 'Not recorded';
        return '<article class="omega-v2-card"><h3 class="omega-v2-card-title">' + esc(site.name) + '</h3><p class="omega-v2-card-meta">' + esc(site.siteId) + ' · ' + esc(site.resourceId) + '</p><div class="omega-v2-vehicle-stats"><div><span>Reported / observed reserve</span><strong>' + observed + '</strong></div><div><span>Modeled gameplay reserve</span><strong>' + modeled + '</strong></div></div><p class="omega-v2-source">Source: ' + esc(site.source) + '</p></article>';
      }).join('') + '</div>' : '<div class="omega-v2-empty">No site reserves can be listed because the selected country has no resolved canonical site records.</div>';
    } else if (active === 'warehouses') {
      contentMarkup = inventoryRows.length ? '<div class="omega-v2-card"><div class="omega-v2-table-wrap"><table><thead><tr><th>Batch / record</th><th>Resource</th><th>Recorded quantity</th><th>Location</th><th>Status</th><th>Source</th></tr></thead><tbody>' + inventoryRows.map(function (row) {
        return '<tr><td>' + esc(row.batchId) + '</td><td>' + esc(row.resourceId) + '</td><td>' + (row.quantity === null ? 'Not recorded' : fmt(row.quantity, row.unit)) + '</td><td>' + esc(row.location) + '</td><td>' + esc(row.status) + '</td><td>' + esc(row.provenance) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="omega-v2-source">Inventory rows are read from the selected country’s current inventory object; aggregated inventory rows are not claimed to be distinct physical lots.</p></div>' : '<div class="omega-v2-empty">No explicit warehouse batches or per-resource on-hand quantities are exposed by the selected country’s current inventory state. Reserve values are not substituted for stock.</div>';
    } else if (active === 'transport') {
      contentMarkup = shipments ? (shipments.length ? '<div class="omega-v2-grid">' + shipments.slice(-60).reverse().map(function (shipment) {
        return '<article class="omega-v2-card"><div class="omega-v2-card-header"><h3 class="omega-v2-card-title">' + esc(shipment.shipmentId || shipment.id || shipment.reservationId || 'Shipment record') + '</h3><span class="omega-v2-status">' + esc(shipment.status || 'NOT_RECORDED') + '</span></div><div class="omega-v2-vehicle-stats"><div><span>Origin</span><strong>' + esc(shipment.sourceSiteId || shipment.originSiteId || shipment.origin || shipment.from || 'Not recorded') + '</strong></div><div><span>Destination</span><strong>' + esc(shipment.destinationFactoryId || shipment.destinationWarehouseId || shipment.destination || shipment.to || 'Not recorded') + '</strong></div><div><span>Mode</span><strong>' + esc(shipment.route && (shipment.route.transportMode || shipment.route.mode) || shipment.transportMode || shipment.mode || 'Not recorded') + '</strong></div><div><span>ETA turn</span><strong>' + fmt(shipment.etaTurn) + '</strong></div></div><p class="omega-v2-source">Authority/provenance: ' + esc(shipment.provenance && (shipment.provenance.authority || shipment.provenance.sourceAuthority) || shipment.authority || 'Not recorded') + '. In-transit is not delivered.</p></article>';
      }).join('') + '</div>' : '<div class="omega-v2-empty">The selected country exposes a shipment collection, but it contains no shipment records.</div>') :
        '<div class="omega-v2-empty">A country-specific shipment collection is not exposed by the current state adapter. No routes or deliveries are inferred from a generic country profile.</div>';
    } else if (active === 'reports') {
      var observedReserves = model.sites.filter(function (site) { return site.reserve.value !== null; }).length;
      var measuredProduction = model.sites.filter(function (site) { return site.production.value !== null; }).length;
      contentMarkup = '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>Registered sites</span><strong>' + fmt(model.siteCount) + '</strong></div><div class="omega-v2-kpi"><span>Sites with reported reserves</span><strong>' + fmt(observedReserves) + '</strong></div><div class="omega-v2-kpi"><span>Sites with measured production</span><strong>' + fmt(measuredProduction) + '</strong></div><div class="omega-v2-kpi"><span>Inventory rows returned</span><strong>' + fmt(inventoryRows.length) + '</strong></div><div class="omega-v2-kpi"><span>Shipment rows returned</span><strong>' + fmt(shipments ? shipments.length : null) + '</strong></div><div class="omega-v2-kpi"><span>Project rows returned</span><strong>' + fmt(projects.length) + '</strong></div></div>' +
        '<div class="omega-v2-card"><h3 class="omega-v2-card-title">Coverage & interpretation</h3><p class="omega-v2-card-meta">Production values are visible only when their source declares an observed/reported status. Model quantities remain labeled MODELED. Rate and stock units are never added together.</p><p class="omega-v2-source">Extraction/flow ledger rows: ' + fmt(flows.length) + ' · shipment provenance must be inspected before claiming delivery.</p></div>';
    } else {
      var byStatus = model.statusCounts || {};
      var operational = (byStatus.OPERATIONAL || 0) + (byStatus.ACTIVE || 0);
      var unknown = (byStatus.UNOBSERVED || 0) + (byStatus.UNKNOWN || 0);
      contentMarkup = photoMarkup + '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>Registered sites</span><strong>' + fmt(model.siteCount) + '</strong></div><div class="omega-v2-kpi"><span>Known active/operational tags</span><strong>' + fmt(operational) + '</strong></div><div class="omega-v2-kpi"><span>Unknown status tags</span><strong>' + fmt(unknown) + '</strong></div><div class="omega-v2-kpi"><span>Tracked project rows</span><strong>' + fmt(projects.length) + '</strong></div><div class="omega-v2-kpi"><span>Explicit inventory rows</span><strong>' + fmt(inventoryRows.length) + '</strong></div><div class="omega-v2-kpi"><span>Site-flow ledger rows</span><strong>' + fmt(flows.length) + '</strong></div></div>' +
        '<div class="omega-v2-note">The dashboard counts registered tags and records. It does not claim an extraction operation is currently running unless the authoritative operation state confirms it.</div>' +
        '<div class="omega-v2-grid"><button type="button" class="omega-v2-card omega-v2-resource-quicklink" data-omega-v2-resource-tab="mines"><h3 class="omega-v2-card-title">Mines & Fields</h3><p class="omega-v2-card-meta">Inspect every site by unique siteId.</p></button><button type="button" class="omega-v2-card omega-v2-resource-quicklink" data-omega-v2-resource-tab="warehouses"><h3 class="omega-v2-card-title">Stock & Warehouses</h3><p class="omega-v2-card-meta">Show tracked batches, never underground reserve.</p></button><button type="button" class="omega-v2-card omega-v2-resource-quicklink" data-omega-v2-resource-tab="transport"><h3 class="omega-v2-card-title">Transport & Supply</h3><p class="omega-v2-card-meta">Review actual recorded shipments and statuses.</p></button></div>';
    }

    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-resource">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">ENERGY & MINING</div><h1 class="omega-v2-title">Energy, Resources & Mining</h1><p class="omega-v2-subtitle">Country ' + esc(model.countryId || 'All countries') + ' · site identity uses unique canonical siteId</p></div><span class="omega-v2-status" data-state="' + (model.ready ? 'operational' : 'attention') + '">' + fmt(model.siteCount) + ' registered sites</span></header>' +
      '<div class="omega-v2-note">Reserve is not warehouse stock. Modeled reserves are labeled MODELED; transfers are not complete until an authoritative shipment/warehouse runtime confirms receipt. This screen does not execute mine actions by itself.</div>' +
      tabMarkup + '<div data-omega-v2-resource-content>' + contentMarkup + '</div>' +
      '<p class="omega-v2-source">Mine sites and recorded operational data are managed within this UI v2 screen. Retired console navigation is disabled.</p></section>';

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
        var tab = target.closest('[data-omega-v2-resource-tab]');
        if (tab && root.contains(tab)) {
          root.__omegaV2ResourceTab = tab.getAttribute('data-omega-v2-resource-tab') || 'dashboard';
          render(root, Object.assign({}, root.__omegaV2ResourceOptions || {}, { tab:root.__omegaV2ResourceTab }));
          return;
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
      root.__omegaV2ResourceBound = true;
    }
    root.__omegaV2ResourceOptions = options;
    root.__omegaV2ResourceTab = active;
    if (active === 'mines') applySiteFilter(root);
    return { ok:true, tab:active, siteCount:model.siteCount, model:model, inventoryRowCount:inventoryRows.length, shipmentRowCount:shipments ? shipments.length : null };
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
