/* OMEGA UI v2 Police Fleet view.
 * Reads all vehicle profiles from the canonical Home Ministry engine.
 * Procurement, ownership, maintenance and deployment remain engine-owned.
 */
(function (g) {
  'use strict';

  var EXPECTED_VEHICLE_TIER_COUNT = 15;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    var valueNumber = Number(value);
    return Number.isFinite(valueNumber) ? valueNumber : null;
  }

  function fmtCount(value) {
    var n = numberOrNull(value);
    return n === null ? 'Not recorded' : Math.max(0, Math.floor(n)).toLocaleString('en-US');
  }

  function fmtMoney(value) {
    var n = numberOrNull(value);
    return n === null ? 'Unavailable' : new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0
    }).format(n);
  }

  function safeEngine() {
    return g.OmegaHomeMinistryEngine || (g.Omega && g.Omega.HomeMinistry) || null;
  }

  function safeAdapter() {
    return g.OMEGA_UI_ADAPTER || null;
  }

  function safeState(engine, countryId) {
    if (!engine || typeof engine.getState !== 'function') return null;
    try { return engine.getState(countryId); } catch (_) { return null; }
  }

  function ownValue(map, key) {
    if (!map || typeof map !== 'object' || !Object.prototype.hasOwnProperty.call(map, String(key))) return null;
    return numberOrNull(map[String(key)]);
  }

  function buildViewModel(options) {
    options = options || {};
    var engine = safeEngine();
    var rawVehicles = engine && Array.isArray(engine.VEHICLES) ? engine.VEHICLES : [];
    if (!engine || !rawVehicles.length) {
      return {
        ready: false,
        reason: 'CANONICAL_POLICE_VEHICLE_CATALOG_UNAVAILABLE',
        expectedVehicleTierCount: EXPECTED_VEHICLE_TIER_COUNT,
        catalogCount: 0,
        vehicles: [],
        countryId: options.countryId || null
      };
    }

    var countryId = options.countryId || (typeof engine.getCurrentCountryId === 'function' ? engine.getCurrentCountryId() : null);
    var state = safeState(engine, countryId);
    var owned = state && state.vehiclesOwned && typeof state.vehiclesOwned === 'object' ? state.vehiclesOwned : null;
    var unlockedTier = numberOrNull(state && state.unlockedVehicleLevel);
    var pending = state && state.pendingVehicleOrder && typeof state.pendingVehicleOrder === 'object' ? state.pendingVehicleOrder : null;

    var vehicles = rawVehicles.slice().sort(function (a, b) {
      return (numberOrNull(a && a.level) || 0) - (numberOrNull(b && b.level) || 0);
    }).map(function (vehicle) {
      var level = numberOrNull(vehicle && vehicle.level);
      var ownedCount = level === null ? null : ownValue(owned, level);
      var isPendingTier = !!(pending && level !== null && numberOrNull(pending.level) === level);
      var speed = numberOrNull(vehicle && vehicle.speed);
      var capacity = numberOrNull(vehicle && vehicle.capacity);
      var durability = numberOrNull(vehicle && vehicle.durability);
      var range = numberOrNull(vehicle && vehicle.rangeKm);
      var endurance = numberOrNull(vehicle && vehicle.enduranceHours);
      var cost = numberOrNull(vehicle && vehicle.cost);
      var maintenance = numberOrNull(vehicle && vehicle.maintenancePerDay);
      return {
        level: level,
        id: String(vehicle && vehicle.id || ''),
        iconId: String(vehicle && vehicle.iconId || ''),
        name: String(vehicle && vehicle.name || (vehicle && vehicle.id) || 'Unnamed vehicle profile'),
        className: String(vehicle && vehicle.className || 'POLICE VEHICLE'),
        specialty: String(vehicle && vehicle.specialty || vehicle && vehicle.role || 'Not recorded'),
        role: String(vehicle && vehicle.role || 'Not recorded'),
        strengths: String(vehicle && vehicle.strengths || 'Not recorded'),
        tradeoff: String(vehicle && vehicle.tradeoff || 'Not recorded'),
        specialFeatures: Array.isArray(vehicle && vehicle.specialFeatures) ? vehicle.specialFeatures.slice() : [],
        environmentFit: vehicle && vehicle.environmentFit && typeof vehicle.environmentFit === 'object' ? vehicle.environmentFit : {},
        speed: speed,
        acceleration: numberOrNull(vehicle && vehicle.acceleration),
        capacity: capacity,
        durability: durability,
        rangeKm: range,
        enduranceHours: endurance,
        terrain: String(vehicle && vehicle.terrain || 'Not recorded'),
        capabilities: vehicle && vehicle.capabilities && typeof vehicle.capabilities === 'object' ? vehicle.capabilities : {},
        cost: cost,
        maintenancePerDay: maintenance,
        ownedCount: ownedCount,
        ownedStateAvailable: ownedCount !== null,
        unlocked: unlockedTier !== null && level !== null ? level <= unlockedTier : null,
        pendingOrder: isPendingTier ? {
          level: numberOrNull(pending.level),
          quantity: numberOrNull(pending.quantity),
          totalCost: numberOrNull(pending.totalCost)
        } : null,
        source: 'OmegaHomeMinistryEngine.VEHICLES'
      };
    });

    return {
      ready: true,
      reason: null,
      countryId: countryId || null,
      stateAvailable: !!state,
      unlockedTier: unlockedTier,
      expectedVehicleTierCount: EXPECTED_VEHICLE_TIER_COUNT,
      catalogCount: vehicles.length,
      catalogCountMatchesExpected: vehicles.length === EXPECTED_VEHICLE_TIER_COUNT,
      vehicles: vehicles,
      source: 'OmegaHomeMinistryEngine.VEHICLES'
    };
  }

  function vehicleArt(vehicle) {
    var adapter = safeAdapter();
    if (adapter && typeof adapter.getPoliceVehicleSvg === 'function' && vehicle.level !== null) {
      try {
        var art = adapter.getPoliceVehicleSvg(vehicle.level, 'card');
        if (typeof art === 'string' && /<svg[\s>]/i.test(art)) return art;
      } catch (_) {}
    }
    return '<div class="omega-v2-empty" role="img" aria-label="Vehicle illustration unavailable">Local vehicle illustration unavailable</div>';
  }

  function vehicleCard(vehicle) {
    var state = vehicle.unlocked === true ? 'ready' : vehicle.unlocked === false ? 'locked' : 'unknown';
    var stateText = vehicle.unlocked === true ? 'UNLOCKED' : vehicle.unlocked === false ? 'LOCKED TIER' : 'UNLOCK STATE UNAVAILABLE';
    var owned = vehicle.ownedStateAvailable ? fmtCount(vehicle.ownedCount) : 'Not recorded';
    var pendingText = vehicle.pendingOrder
      ? '<div class="omega-v2-note">Order pending: ' + fmtCount(vehicle.pendingOrder.quantity) + ' unit(s). Delivery remains pending until the simulation confirms it.</div>'
      : '';
    var adapter = safeAdapter();
    var canInspect = !!(adapter && typeof adapter.renderVehicleCatalog === 'function');
    var features = vehicle.specialFeatures.length
      ? '<div class="omega-v2-card-meta">' + vehicle.specialFeatures.map(esc).join(' · ') + '</div>'
      : '<div class="omega-v2-card-meta">Equipment detail not recorded</div>';
    var fitLabels = Object.keys(vehicle.environmentFit || {});
    var fitLine = fitLabels.length ? fitLabels.map(function (key) {
      var fit = numberOrNull(vehicle.environmentFit[key]);
      return esc(key) + ': ' + (fit === null ? 'Not recorded' : fmtCount(fit) + '%');
    }).join(' · ') : 'Route/terrain profile not recorded';

    return '<article class="omega-v2-card omega-v2-police-vehicle' + (vehicle.unlocked === false ? ' is-locked' : '') + '" data-omega-v2-vehicle-card data-level="' + esc(vehicle.level) + '" data-vehicle-id="' + esc(vehicle.id) + '" data-unlocked="' + (vehicle.unlocked === true ? 'true' : vehicle.unlocked === false ? 'false' : 'unknown') + '" data-owned="' + (vehicle.ownedStateAvailable && vehicle.ownedCount > 0 ? 'true' : vehicle.ownedStateAvailable ? 'false' : 'unknown') + '" data-search="' + esc((vehicle.name + ' ' + vehicle.className + ' ' + vehicle.specialty + ' ' + vehicle.id).toLowerCase()) + '">' +
      '<div class="omega-v2-card-header"><div><div class="omega-v2-eyebrow">TIER ' + esc(vehicle.level === null ? 'Not recorded' : vehicle.level) + '</div><h3 class="omega-v2-card-title">' + esc(vehicle.name) + '</h3><div class="omega-v2-card-meta">' + esc(vehicle.className) + '</div></div><span class="omega-v2-status" data-state="' + state + '">' + stateText + '</span></div>' +
      '<div class="omega-v2-vehicle-art">' + vehicleArt(vehicle) + '</div>' +
      '<div class="omega-v2-card-meta">' + esc(vehicle.specialty) + '</div>' +
      '<div class="omega-v2-vehicle-stats">' +
      '<div><span>Owned in selected country</span><strong>' + owned + '</strong></div>' +
      '<div><span>Maximum speed</span><strong>' + (vehicle.speed === null ? 'Not recorded' : fmtCount(vehicle.speed) + ' km/h') + '</strong></div>' +
      '<div><span>Acceleration</span><strong>' + fmtCount(vehicle.acceleration) + '</strong></div>' +
      '<div><span>Passenger capacity</span><strong>' + fmtCount(vehicle.capacity) + '</strong></div>' +
      '<div><span>Durability</span><strong>' + fmtCount(vehicle.durability) + '</strong></div>' +
      '<div><span>Range</span><strong>' + (vehicle.rangeKm === null ? 'Not recorded' : fmtCount(vehicle.rangeKm) + ' km') + '</strong></div>' +
      '<div><span>Duty endurance</span><strong>' + (vehicle.enduranceHours === null ? 'Not recorded' : fmtCount(vehicle.enduranceHours) + ' hours') + '</strong></div>' +
      '<div><span>Procurement / unit</span><strong>' + fmtMoney(vehicle.cost) + '</strong></div>' +
      '<div><span>Maintenance / day</span><strong>' + fmtMoney(vehicle.maintenancePerDay) + '</strong></div>' +
      '</div>' +
      '<div class="omega-v2-section-title">Equipment & capability</div>' + features +
      '<div class="omega-v2-section-title">Strengths</div><div class="omega-v2-card-meta">' + esc(vehicle.strengths) + '</div>' +
      '<div class="omega-v2-section-title">Trade-off</div><div class="omega-v2-card-meta">' + esc(vehicle.tradeoff) + '</div>' +
      '<div class="omega-v2-section-title">Environment fit</div><div class="omega-v2-card-meta">' + esc(vehicle.terrain) + ' · ' + fitLine + '</div>' +
      '<details class="omega-v2-capability-details"><summary>Full capability profile</summary><div class="omega-v2-capability-bars">' +
      Object.keys(vehicle.capabilities).map(function (key) {
        var value = numberOrNull(vehicle.capabilities[key]);
        var width = value === null ? 0 : Math.max(0, Math.min(100, value));
        var label = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
        return '<div class="omega-v2-capability-row"><span>' + esc(label) + '</span><div class="omega-v2-capability-track"><span style="width:' + width + '%"></span></div><strong>' + (value === null ? 'Not recorded' : fmtCount(value) + '/100') + '</strong></div>';
      }).join('') +
      '</div></details>' +
      pendingText +
      '<div class="omega-v2-actions"><button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-action="inspect-vehicle" data-level="' + esc(vehicle.level) + '"' + (canInspect ? '' : ' disabled title="The existing police hangar action adapter is not available."') + '>Inspect in existing hangar</button></div>' +
      '</article>';
  }

  function applyFilter(root, filter, search) {
    var cards = root.querySelectorAll('[data-omega-v2-vehicle-card]');
    var query = String(search || '').trim().toLowerCase();
    Array.prototype.forEach.call(cards, function (card) {
      var unlocked = card.getAttribute('data-unlocked');
      var owned = card.getAttribute('data-owned');
      var searchable = card.getAttribute('data-search') || '';
      var show = (!query || searchable.indexOf(query) >= 0) &&
        (filter === 'all' || (filter === 'unlocked' && unlocked === 'true') || (filter === 'owned' && owned === 'true'));
      card.hidden = !show;
    });
    var visible = root.querySelectorAll('[data-omega-v2-vehicle-card]:not([hidden])').length;
    var counter = root.querySelector('[data-omega-v2-visible-count]');
    if (counter) counter.textContent = String(visible);
    Array.prototype.forEach.call(root.querySelectorAll('[data-omega-v2-fleet-filter]'), function (button) {
      var active = button.getAttribute('data-omega-v2-fleet-filter') === filter;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('omega-v2-button--accent', active);
    });
  }

  function fleetHeroPhoto() {
    var lib=g.OmegaUIPhotoAssets,item=null;try{item=lib&&typeof lib.get==='function'?lib.get('bangladesh-police-headquarters'):null;}catch(_){}
    var path=item&&/^assets\/ui-photos\/bangladesh-police-headquarters\.webp$/.test(String(item.path||''))?item.path:'assets/ui-photos/bangladesh-police-headquarters.webp';
    var credit=item&&item.author&&item.sourcePageUrl&&item.licenseUrl?'<small class="omega-v2-photo-credit">Photo: <a href="'+esc(item.sourcePageUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.author)+'</a> · <a href="'+esc(item.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.licenseShortName||'License')+'</a></small>':'';
    return '<figure class="omega-v2-photo omega-v2-photo--hero omega-v2-fleet-hero"><img loading="lazy" decoding="async" width="1280" height="720" src="'+esc(path)+'" alt="Police headquarters, representative public safety reference photograph"><figcaption><strong>'+esc(item&&item.caption||'PUBLIC SAFETY & FLEET')+'</strong><small>Representative public-safety image. It is not evidence that the selected country owns a pictured facility or vehicle.</small>'+credit+'</figcaption></figure>';
  }
  function render(root, options) {
    options = options || {};
    if (!root || typeof root !== 'object') return { ok: false, code: 'POLICE_FLEET_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    if (!model.ready) {
      root.innerHTML = '<section class="omega-v2-screen omega-v2-shell"><div class="omega-v2-empty">Police vehicle data is unavailable. No vehicle catalogue was fabricated.</div></section>';
      return { ok: false, code: model.reason };
    }

    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-v2-shell omega-v2-police-fleet">' +
      '<header class="omega-v2-heading"><div><div class="omega-v2-eyebrow">INTERIOR & SECURITY · FLEET</div><h1 class="omega-v2-title">Police Vehicle Hangar</h1><p class="omega-v2-subtitle">All ' + model.catalogCount + ' canonical vehicle profiles · selected country ' + esc(model.countryId || 'Not recorded') + '</p></div><span class="omega-v2-status" data-state="' + (model.catalogCountMatchesExpected ? 'operational' : 'attention') + '">' + (model.catalogCountMatchesExpected ? '15-TIER CATALOG' : fmtCount(model.catalogCount) + ' PROFILES · VERIFY CATALOG') + '</span></header>' +
      '<div class="omega-v2-kpis">' +
      '<div class="omega-v2-kpi"><span>Canonical tiers</span><strong>' + fmtCount(model.catalogCount) + '</strong></div>' +
      '<div class="omega-v2-kpi"><span>Highest unlocked tier</span><strong>' + fmtCount(model.unlockedTier) + '</strong></div>' +
      '<div class="omega-v2-kpi"><span>Owned units</span><strong>' + (model.stateAvailable && model.vehicles.every(function (v) { return v.ownedStateAvailable; }) ? fmtCount(model.vehicles.reduce(function (total, v) { return total + v.ownedCount; }, 0)) : 'Not recorded') + '</strong></div>' +
      '<div class="omega-v2-kpi"><span>Order in transit</span><strong>' + (model.stateAvailable && model.vehicles.some(function (v) { return !!v.pendingOrder; }) ? 'Pending' : model.stateAvailable ? 'None recorded' : 'Unavailable') + '</strong></div>' +
      '</div>' +
      (!model.catalogCountMatchesExpected ? '<div class="omega-v2-note">The canonical catalogue currently exposes ' + fmtCount(model.catalogCount) + ' profiles, not the expected 15 tiers. The UI displays the actual registry; it will not synthesize missing vehicles.</div>' : '') +
      '<p class="omega-v2-note">Vehicle selection is not procurement. Buying, maintenance and deployment stay with the existing authoritative Home Ministry engine and its Finance, unlock, route, staffing and delivery checks.</p>' +
      '<div class="omega-v2-filterbar"><input type="search" aria-label="Search police vehicles" placeholder="Search vehicle name, tier or role" data-omega-v2-fleet-search><button type="button" class="omega-v2-button omega-v2-button--accent" data-omega-v2-fleet-filter="all" aria-pressed="true">All tiers</button><button type="button" class="omega-v2-button" data-omega-v2-fleet-filter="unlocked" aria-pressed="false">Unlocked</button><button type="button" class="omega-v2-button" data-omega-v2-fleet-filter="owned" aria-pressed="false">Owned</button></div>' +
      '<div class="omega-v2-card-meta">Showing <strong data-omega-v2-visible-count>' + model.catalogCount + '</strong> vehicle profiles. Locked vehicles remain inspectable; order eligibility is enforced by the existing hangar.</div>' +
      '<div class="omega-v2-grid" data-omega-v2-fleet-grid>' + model.vehicles.map(vehicleCard).join('') + '</div>' +
      '<p class="omega-v2-source">Authority: ' + esc(model.source) + '. Illustrations are local SVGs returned by the existing OMEGA UI adapter. Prices/capabilities are canonical game-model values, not real-world procurement advice.</p>' +
      '</section>';

    if (!root.__omegaV2PoliceFleetBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var filterButton = target.closest('[data-omega-v2-fleet-filter]');
        if (filterButton && root.contains(filterButton)) {
          root.__omegaV2PoliceFleetFilter = filterButton.getAttribute('data-omega-v2-fleet-filter') || 'all';
          var input = root.querySelector('[data-omega-v2-fleet-search]');
          applyFilter(root, root.__omegaV2PoliceFleetFilter, input && input.value || '');
          return;
        }
        var inspect = target.closest('[data-omega-v2-action="inspect-vehicle"]');
        if (inspect && root.contains(inspect) && !inspect.disabled) {
          var level = numberOrNull(inspect.getAttribute('data-level'));
          var adapter = safeAdapter();
          if (level !== null && adapter && typeof adapter.renderVehicleCatalog === 'function') {
            adapter.renderVehicleCatalog(level);
          }
        }
      });
      root.addEventListener('input', function (event) {
        var target = event && event.target;
        if (!target || !target.matches || !target.matches('[data-omega-v2-fleet-search]')) return;
        applyFilter(root, root.__omegaV2PoliceFleetFilter || 'all', target.value);
      });
      root.__omegaV2PoliceFleetBound = true;
    }
    root.__omegaV2PoliceFleetModel = model;
    applyFilter(root, root.__omegaV2PoliceFleetFilter || 'all', '');
    return { ok: true, catalogCount: model.catalogCount, model: model };
  }

  g.OmegaUIV2PoliceFleet = Object.freeze({
    version: '1.0.0',
    expectedVehicleTierCount: EXPECTED_VEHICLE_TIER_COUNT,
    buildViewModel: buildViewModel,
    render: render
  });
})(typeof window !== 'undefined' ? window : globalThis);
