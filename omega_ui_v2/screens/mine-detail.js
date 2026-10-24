/* OMEGA UI v2 individual mine/site detail page.
 * One stable siteId resolves the image type, reserve/stock/production and route data.
 */
(function (g) {
  'use strict';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
  function fmt(v, unit) { var n = num(v); return n === null ? 'Not recorded' : n.toLocaleString('en-US', { maximumFractionDigits:2 }) + (unit ? ' ' + esc(unit) : ''); }
  function displayStatus(value) { var text = String(value == null ? '' : value).replace(/[_-]+/g, ' ').trim().toUpperCase(); var labels = { SIMULATED:'Estimated', MODELED:'Estimated', MODELLED:'Estimated', UNOBSERVED:'Not measured', NOT_RECORDED:'Not recorded', OBSERVED:'Observed', OBSERVED_ATTRIBUTABLE:'Observed', REPORTED:'Reported', REPORTED_OBSERVED:'Reported', OPERATIONAL:'Operational', ACTIVE:'Active', INACTIVE:'Inactive', IN_TRANSIT:'In transit', DELIVERED:'Delivered', BLOCKED:'Blocked', FAILED:'Failed' }; return labels[text] || (text ? text.toLowerCase().replace(/\b\w/g, function (ch) { return ch.toUpperCase(); }) : 'Not recorded'); }
  function photoIdFor(site) {
    var raw = site && site.raw || {};
    var type = String(raw.siteType || raw.identity && raw.identity.siteType || raw.sourceSiteRecord && raw.sourceSiteRecord.siteType || '').toUpperCase();
    var resource = String(site && site.resourceId || '').toLowerCase();
    if (/OFFSHORE|OIL_FIELD|GAS_FIELD|PETROLEUM|OIL|GAS/.test(type + ' ' + resource)) return 'geelong-oil-refinery';
    if (/HYDRO|POWER|ENERGY|ELECTRIC/.test(type + ' ' + resource)) return 'hydroelectric-plant';
    return 'open-pit-mine';
  }
  function photo(site) {
    var lib = g.OmegaUIPhotoAssets;
    var id = photoIdFor(site);
    var item = lib && typeof lib.get === 'function' ? lib.get(id) : null;
    if (!item || !/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path || ''))) return '<div class="omega-v2-photo-placeholder">Representative mine/site image unavailable</div>';
    return '<figure class="omega-v2-photo omega-v2-photo--hero"><img loading="lazy" decoding="async" src="' + esc(item.path) + '" alt="Representative illustration for ' + esc(site.name) + '"><figcaption>' + esc(item.caption || 'Representative site image') + '</figcaption></figure>';
  }
  function routeRows(raw) {
    var routes = raw && raw.simulation && Array.isArray(raw.simulation.transportRoute) ? raw.simulation.transportRoute :
      raw && raw.transportRoute && Array.isArray(raw.transportRoute) ? raw.transportRoute : [];
    return routes;
  }
  function render(root, options) {
    options = options || {};
    if (!root) return { ok:false, code:'MINE_DETAIL_ROOT_REQUIRED' };
    var api = g.OmegaUIV2ResourceMinistry;
    var country = String(options.countryId || g.OmegaMinistryViewCountry || (g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry) || g.currentActiveCountry || '').toUpperCase();
    var model = api && typeof api.buildViewModel === 'function' ? api.buildViewModel({ countryId:country, sites:options.sites, getInventoryForSite:options.getInventoryForSite }) : null;
    var siteId = String(options.siteId || '').trim();
    var site = model && model.sites ? model.sites.find(function (item) { return item.siteId === siteId; }) : null;
    if (!site) {
      root.classList.add('omega-v2-screen');
      root.innerHTML = '<section class="omega-v2-shell"><h1 class="omega-v2-title">Mine / Resource Site</h1><div class="omega-v2-empty">This mine record could not be found for the selected country.</div></section>';
      return { ok:false, code:'CANONICAL_SITE_ID_NOT_FOUND', siteId:siteId || null, countryId:country || null };
    }
    var raw = site.raw || {};
    var measuredReserve = site.reserve;
    var modeledReserve = site.modeledReserve;
    var capacity = raw.quantitative && raw.quantitative.capacity || raw.capacity || {};
    var capacityStatus = String(capacity.status || 'UNOBSERVED').toUpperCase();
    var capacityValue = ['OBSERVED','OBSERVED_ATTRIBUTABLE','REPORTED','MEASURED'].indexOf(capacityStatus) >= 0
      ? (capacity.nominal !== undefined ? capacity.nominal : capacity.quantity) : null;
    var owner = raw.ownership && raw.ownership.owner || raw.owner || null;
    var operator = raw.ownership && raw.ownership.operator || raw.operator || null;
    var extractionMethod = raw.operation && raw.operation.extractionMethod || raw.extractionMethod || null;
    var routes = routeRows(raw);
    var buttons = [];
    if (options.onLocateMine) buttons.push('<button type="button" class="omega-v2-button" data-omega-v2-mine-action="locate">Locate on map</button>');
    ['survey','develop','extract','upgrade','ship'].forEach(function (action) {
      var actions = options.actions || {};
      if (typeof actions[action] === 'function') buttons.push('<button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-mine-action="' + action + '">' + ({ survey:'Survey site', develop:'Develop mine', extract:'Start extraction', upgrade:'Upgrade capacity', ship:'Send batch' })[action] + '</button>');
    });
    var routeMarkup = routes.length ? '<div class="omega-v2-grid">' + routes.map(function (route) {
      var authority = String(route.authority || route.statusAuthority || route.provenance || 'NOT_RECORDED');
      var status = String(route.status || route.routeStatus || (authority === 'BLOCKED' ? 'BLOCKED' : 'NOT_RECORDED'));
      return '<article class="omega-v2-card"><div class="omega-v2-card-header"><h3 class="omega-v2-card-title">' + esc(route.routeId || route.id || 'Registered route') + '</h3><span class="omega-v2-status" data-state="' + (/BLOCKED|FAILED/.test(status.toUpperCase()) ? 'blocked' : /OBSERVED|CONFIRMED|DELIVERED/.test(status.toUpperCase()) ? 'operational' : 'unknown') + '">' + esc(displayStatus(status)) + '</span></div><div class="omega-v2-vehicle-stats"><div><span>Transport mode</span><strong>' + esc(route.transportMode || route.mode || 'Not recorded') + '</strong></div><div><span>Distance</span><strong>' + fmt(route.distanceKm, 'km') + '</strong></div><div><span>ETA / travel time</span><strong>' + fmt(route.etaTurn !== undefined ? route.etaTurn : route.travelTimeHours, route.etaTurn !== undefined ? 'turn' : 'hours') + '</strong></div></div><p class="omega-v2-card-meta">Delivery is complete when the destination stock is updated.</p></article>';
    }).join('') + '</div>' : '<div class="omega-v2-empty">No transport route has been recorded for this site yet.</div>';
    var inventoryLabel = site.stock ? fmt(site.stock.quantity, site.stock.unit) : 'Unavailable';
    var reserveLabel = measuredReserve && measuredReserve.value !== null ? fmt(measuredReserve.value, measuredReserve.unit) + ' · ' + esc(displayStatus(measuredReserve.status)) : 'Not recorded';
    var modeledLabel = modeledReserve && modeledReserve.modeledValue !== null ? fmt(modeledReserve.modeledValue, modeledReserve.unit) + ' · Estimated' : 'Not recorded';
    var productionLabel = site.production && site.production.value !== null ? fmt(site.production.value, site.production.unit) + ' · ' + esc(displayStatus(site.production.status)) : 'Not recorded';
    var provenance = raw.quantitative && raw.quantitative.quantitativeProvenance || raw.quantitativeProvenance || raw.provenance || {};
    var provenanceText = provenance && typeof provenance === 'object' ? Object.keys(provenance).map(function (key) { return key + ': ' + provenance[key]; }).join(' · ') : String(provenance || 'Not recorded');
    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-mine-detail">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">ENERGY & MINING · SITE DETAIL</div><h1 class="omega-v2-title">' + esc(site.name) + '</h1><p class="omega-v2-subtitle">' + esc(site.countryId) + ' · ' + esc(site.location) + '</p></div><span class="omega-v2-status">' + esc(displayStatus(site.status)) + '</span></header>' +
      photo(site) +
      '<div class="omega-v2-kpis"><div class="omega-v2-kpi"><span>Reported reserve</span><strong>' + reserveLabel + '</strong></div><div class="omega-v2-kpi"><span>Estimated reserve</span><strong>' + modeledLabel + '</strong></div><div class="omega-v2-kpi"><span>Warehouse stock</span><strong>' + inventoryLabel + '</strong></div><div class="omega-v2-kpi"><span>Measured production</span><strong>' + productionLabel + '</strong></div><div class="omega-v2-kpi"><span>Reported capacity</span><strong>' + (capacityValue === null ? 'Not recorded' : fmt(capacityValue, capacity.unit || 'unit not recorded')) + '</strong></div></div>' +
      '<div class="omega-v2-note">Reported reserves, estimated reserves, stored stock and production are separate quantities.</div>' +
      '<h2 class="omega-v2-section-title">Site details</h2><div class="omega-v2-grid">' +
      '<div class="omega-v2-card"><h3 class="omega-v2-card-title">Site identity</h3><div class="omega-v2-vehicle-stats"><div><span>Resource ID</span><strong>' + esc(site.resourceId) + '</strong></div><div><span>Site type</span><strong>' + esc(raw.siteType || raw.identity && raw.identity.siteType || 'Not recorded') + '</strong></div><div><span>Owner</span><strong>' + esc(owner || 'Not recorded') + '</strong></div><div><span>Operator</span><strong>' + esc(operator || 'Not recorded') + '</strong></div><div><span>Extraction method</span><strong>' + esc(extractionMethod || 'Not recorded') + '</strong></div><div><span>Coordinates</span><strong>' + (site.coordinates ? esc((site.coordinates.latitude !== undefined ? site.coordinates.latitude : site.coordinates.lat) + ', ' + (site.coordinates.longitude !== undefined ? site.coordinates.longitude : site.coordinates.lng)) : 'Not recorded') + '</strong></div></div></div>' +
      '<div class="omega-v2-card"><h3 class="omega-v2-card-title">Operation flow</h3><div class="omega-v2-flow"><span>Site</span><b>→</b><span>Extraction</span><b>→</b><span>Raw batch</span><b>→</b><span>Warehouse</span><b>→</b><span>Transport</span><b>→</b><span>Factory / Market</span></div><p class="omega-v2-card-meta">Material moves through extraction, storage, transport and processing.</p></div></div>' +
      '<h2 class="omega-v2-section-title">Route & destination</h2>' + routeMarkup +
      '<h2 class="omega-v2-section-title">Actions</h2><div class="omega-v2-actions">' + (buttons.length ? buttons.join('') : '<span class="omega-v2-card-meta">No actions are available for this site right now.</span>') + '</div>' +
      '<div class="omega-v2-note" data-omega-v2-mine-result role="status">Action results will appear here.</div>' +
      '<details class="omega-v2-record-details"><summary>Site record details</summary><p class="omega-v2-card-meta">Site ID: ' + esc(site.siteId) + ' · Source: ' + esc(site.source || 'Not recorded') + '</p><p class="omega-v2-card-meta">' + esc(provenanceText || 'No additional record details') + '</p></details></section>';
    if (!root.__omegaV2MineDetailBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        var button = target && typeof target.closest === 'function' ? target.closest('[data-omega-v2-mine-action]') : null;
        if (!button || !root.contains(button)) return;
        var action = button.getAttribute('data-omega-v2-mine-action');
        var current = root.__omegaV2MineDetailOptions || {};
        if (action === 'locate' && typeof current.onLocateMine === 'function') {
          current.onLocateMine(site.siteId, country);
          return;
        }
        var handler = current.actions && current.actions[action];
        if (typeof handler !== 'function') return;
        var output = root.querySelector('[data-omega-v2-mine-result]');
        button.disabled = true;
        try {
          var result = handler({ siteId:site.siteId, countryId:country, site:site.raw });
          var finish = function (value) {
            button.disabled = false;
            if (output) output.textContent = value && value.ok === true ? 'Action accepted by its runtime for site ' + site.siteId + '. Refresh the site view to confirm the authoritative state change.' : 'Action not confirmed: ' + String(value && (value.message || value.code || value.reason) || 'The runtime returned no accepted result.');
          };
          if (result && typeof result.then === 'function') result.then(finish).catch(function () { button.disabled = false; if (output) output.textContent = 'Action failed. The runtime did not confirm a successful operation.'; });
          else finish(result);
        } catch (_) {
          button.disabled = false;
          if (output) output.textContent = 'Action failed before confirmation. No success is reported.';
        }
      });
      root.__omegaV2MineDetailBound = true;
    }
    root.__omegaV2MineDetailOptions = options;
    return { ok:true, siteId:site.siteId, countryId:site.countryId, model:site };
  }
  g.OmegaUIV2MineDetail = Object.freeze({ version:'1.0.0', render:render, photoIdFor:photoIdFor });
})(typeof window !== 'undefined' ? window : globalThis);
