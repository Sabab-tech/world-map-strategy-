/* OMEGA Mine Production Command UI.
 * Uses canonical mine identities and the authoritative country-scoped resource runtimes.
 * UI totals are derived from saved game state; this module does not fabricate production.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0.0';
  var RESOURCE_FALLBACK = 'Not recorded';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function num(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function key(value) { return String(value == null ? '' : value).trim().toUpperCase(); }
  function fmt(value, digits) {
    var n = num(value);
    return n === null ? RESOURCE_FALLBACK : n.toLocaleString('en-US', { maximumFractionDigits:digits === undefined ? 2 : digits });
  }
  function label(value) {
    return String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function state() { return g.Game && g.Game.state || g.gameState || {}; }
  function playerCountry() {
    var s = state(), value = null;
    try { value = g.Omega && g.Omega.Simulation && g.Omega.Simulation.getPlayerCountryId && g.Omega.Simulation.getPlayerCountryId(); } catch (_) {}
    value = value || s.simulation && s.simulation.session && s.simulation.session.playerCountryId ||
      s.simulation && s.simulation.playerCountryId || g.Omega && g.Omega.Simulation && g.Omega.Simulation.playerCountryId ||
      g.CountryIOS && (g.CountryIOS.playerCountryId || g.CountryIOS.activeCountry) ||
      g.Game && (g.Game.playerCountryId || g.Game.currentActiveCountry) || g.currentPlayerCountry || g.currentActiveCountry;
    return key(value);
  }
  function pickBucket(map, country) {
    if (!map || typeof map !== 'object') return {};
    if (map[country]) return map[country];
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i += 1) if (key(keys[i]) === key(country)) return map[keys[i]];
    return {};
  }
  function activeAsset(asset) { return /^(OPERATIONAL|ACTIVE|RUNNING)$/.test(key(asset && asset.status)); }
  function siteId(row) { return String(row && (row.siteId || row.siteReferenceKey || row.id) || '').trim(); }
  function countryId(row) {
    return key(row && (row.countryId || row.countryCode || row.identity && row.identity.countryIso3 ||
      row.sourceSiteRecord && row.sourceSiteRecord.countryCode) || '');
  }
  function resourceId(row) {
    return String(row && (row.identity && (row.identity.resourceId || row.identity.resourceTypeId || row.identity.resourceName) ||
      row.real && row.real.resourceId || row.sourceSiteRecord && (row.sourceSiteRecord.resourceId || row.sourceSiteRecord.resourceTypeId) ||
      row.resourceId || row.resourceTypeId || row.resId) || '').trim().toLowerCase();
  }
  function currentTurn(s) {
    var value = num(s && s.simulation && (s.simulation.turn !== undefined ? s.simulation.turn : s.simulation.currentTurn));
    if (value !== null) return value;
    value = num(s && s.turn);
    if (value !== null) return value;
    value = num(s && s.simulationTurn);
    return value === null ? 0 : value;
  }
  function isBlockedStatus(value) {
    return /BLOCKED|FAILED|AWAITING_FACTORY|NO_ROUTE|INSUFFICIENT|REJECTED|CANCELLED/.test(key(value));
  }
  function quantityOf(row) {
    return num(row && (row.producedQuantity !== undefined ? row.producedQuantity :
      row.approvedQuantity !== undefined ? row.approvedQuantity :
      row.outputQuantity !== undefined ? row.outputQuantity :
      row.quantity !== undefined ? row.quantity : row.amount));
  }
  function rowTurn(row) {
    return num(row && (row.turn !== undefined ? row.turn :
      row.simulationTurn !== undefined ? row.simulationTurn :
      row.lastMovementTurn !== undefined ? row.lastMovementTurn : row.productionTurn));
  }
  function groupFlows(flows, turn) {
    var result = { bySite:Object.create(null), byResource:Object.create(null), byTurn:Object.create(null), blockedSites:Object.create(null), totalRows:0 };
    (Array.isArray(flows) ? flows : []).forEach(function (row) {
      if (!row || typeof row !== 'object') return;
      result.totalRows += 1;
      var id = String(row.siteId || row.siteReferenceKey || row.sourceSiteId || row.mineId || '').trim();
      var rid = String(row.resourceId || row.materialIdentity || row.commodity || '').trim().toLowerCase();
      var unit = String(row.unit || row.quantityUnit || '').trim();
      var status = key(row.status || row.stage || '');
      var q = quantityOf(row);
      if (id) {
        if (!result.bySite[id]) result.bySite[id] = [];
        result.bySite[id].push(row);
      }
      if (rowTurn(row) === turn && q !== null && q > 0 && rid) {
        var resourceKey = rid + '|' + unit;
        if (!result.byResource[resourceKey]) result.byResource[resourceKey] = { resourceId:rid, unit:unit || 'units', quantity:0, records:0 };
        result.byResource[resourceKey].quantity += q;
        result.byResource[resourceKey].records += 1;
        result.byTurn[String(turn)] = (result.byTurn[String(turn)] || 0) + q;
      }
    });
    Object.keys(result.bySite).forEach(function (id) {
      result.bySite[id].sort(function (a,b) { return (rowTurn(a) || 0) - (rowTurn(b) || 0); });
      var latest = result.bySite[id][result.bySite[id].length - 1];
      result.blockedSites[id] = !!(latest && (isBlockedStatus(latest.status || latest.stage) || latest.blockReason));
    });
    return result;
  }
  function pathForResource(value) {
    var api = g.OmegaUIV2ResourceMinistry;
    return api && typeof api.resourceIconPath === 'function' ? api.resourceIconPath(value) : '';
  }
  function icon(value) {
    var path = pathForResource(value);
    if (!path) return '<span class="omega-mpc-icon-fallback" aria-hidden="true">' + esc(label(value).split(' ').map(function (part) { return part.charAt(0); }).join('').slice(0,2)) + '</span>';
    return '<img class="omega-mpc-resource-svg" src="' + esc(path) + '" loading="lazy" decoding="async" alt="" aria-hidden="true">';
  }
  function archetype(site, modelApi) {
    return modelApi && modelApi.mineArchetype ? modelApi.mineArchetype(site) : 'OPEN_PIT';
  }
  function resourceName(id) { return label(id || 'resource'); }
  function readableResult(title, result) {
    var data = result && result.result && typeof result.result === 'object' ? result.result : result || {};
    var code = key(data.reason || result && result.reason || data.code || result && result.code || data.status || result && result.status);
    var messages = {
      'UNDER_CONSTRUCTION':'Construction has started.',
      'OPERATIONAL':'Mine is operational.',
      'DECOMMISSIONED':'Mine has been closed. Its records are preserved.',
      'CONFIRMATION_REQUIRED':'Confirm the operation to continue.',
      'INSUFFICIENT_WORKER_COMMITMENT':'Assign more construction workers.',
      'TREASURY_AVAILABLE_BALANCE_UNAVAILABLE':'Treasury balance is unavailable.',
      'INSUFFICIENT_TREASURY':'The treasury cannot cover construction costs.',
      'INSUFFICIENT_CONSTRUCTION_MATERIALS':'Required construction materials are missing.',
      'MINE_CONSTRUCTION_ALREADY_IN_PROGRESS':'This mine already has a construction project.',
      'SITE_NOT_FOUND':'This mine is no longer available in the selected country.',
      'COUNTRY_SITE_BOUNDARY_VIOLATION':'This mine belongs to another country.',
      'SITE_COUNTRY_MISMATCH':'This mine belongs to another country.',
      'MINE_DECOMMISSION_CONFIRMATION_REQUIRED':'Confirm mine closure to continue.',
      'MINE_NOT_FOUND':'No operating mine asset was found for this site.',
      'MINE_ALREADY_EXECUTED_THIS_TURN':'This mine has already run this turn.',
      'SITE_ALREADY_EXECUTED_THIS_TURN':'This mine has already run this turn.',
      'NO_MATCHING_FACTORY':'Extraction is recorded in raw stock until a compatible factory is available.',
      'NO_COMPATIBLE_FACTORY':'Extraction is recorded in raw stock until a compatible factory is available.',
      'FACTORY_NOT_FOUND':'The destination factory could not be found.',
      'PLAYER_COUNTRY_SCOPE_VIOLATION':'Only the selected player country can run operations.',
      'PLAYER_COUNTRY_SCOPE_VIOLATION':'Only the selected player country can run operations.'
    };
    if (code === 'BLOCKED' && data.detail && data.detail.reason) code = key(data.detail.reason);
    if (code === 'BLOCKED' && data.quote && data.quote.reason) code = key(data.quote.reason);
    if (messages[code]) return title + ': ' + messages[code];
    if (/^(STARTED|APPLIED|COMMITTED|DISPATCHED|DELIVERED|PROCESSED)$/.test(code)) return title + ': completed.';
    if (code === 'EXTRACTED_AWAITING_FACTORY') return title + ': raw material added to stock; a compatible factory is still needed.';
    if (code === 'PARTIALLY_STARTED') return title + ': started, with some sites waiting for requirements.';
    if (code === 'BLOCKED' || code === 'FAILED') return title + ': requirements were not met. Check workforce, stock, reserve and transport.';
    return title + ': ' + (label(code) || 'the operation did not complete.');
  }
  function runtimeApi() {
    return g.Omega && g.Omega.ResourceIndustrialNetwork || g.OmegaResourceIndustrialNetwork || null;
  }
  function allMineAssets(rs) {
    var industrial = rs && rs.industrialNetwork || {};
    var rows = (Array.isArray(rs && rs.mineAssets) ? rs.mineAssets : []).concat(Array.isArray(industrial.mineAssets) ? industrial.mineAssets : []);
    var map = Object.create(null);
    rows.forEach(function (row) {
      var id = String(row && (row.mineId || row.id || row.assetId) || '').trim();
      if (id && !map[id]) map[id] = row;
    });
    return Object.keys(map).map(function (id) { return map[id]; });
  }
  function buildData(options) {
    options = options || {};
    var s = state(), country = key(options.countryId || g.OmegaMinistryViewCountry ||
      g.Omega && g.Omega.MinistryViewCountry || g.CountryIOS && g.CountryIOS.activeCountry || playerCountry());
    var resourceApi = g.OmegaUIV2ResourceMinistry;
    var mineManager = g.Omega && g.Omega.ResourceMineManagementUI || g.OmegaResourceMineManagementUI;
    var supplied = [];
    try { if (mineManager && typeof mineManager.getCountrySites === 'function') supplied = mineManager.getCountrySites(country) || []; } catch (_) {}
    var model = resourceApi && typeof resourceApi.buildViewModel === 'function'
      ? (supplied.length ? resourceApi.buildViewModel({ countryId:country, sites:supplied }) : resourceApi.buildViewModel({ countryId:country }))
      : { countryId:country, siteCount:0, sites:[], statusCounts:{} };
    var rs = pickBucket(s.resource || s.resources, country);
    var industrial = rs.industrialNetwork && typeof rs.industrialNetwork === 'object' ? rs.industrialNetwork : {};
    var inventory = rs.inventory && typeof rs.inventory === 'object' ? rs.inventory :
      rs.warehouseInventory && typeof rs.warehouseInventory === 'object' ? rs.warehouseInventory : {};
    var rawWarehouse = rs.warehouse && typeof rs.warehouse === 'object' ? rs.warehouse : {};
    var finishedWarehouse = rs.processedWarehouse && typeof rs.processedWarehouse === 'object' ? rs.processedWarehouse : {};
    var projects = Array.isArray(industrial.projects) ? industrial.projects.filter(function (p) {
      return /MINE_CONSTRUCTION/.test(key(p && p.projectType)) && !/^(COMPLETED|CANCELLED|FAILED|DECOMMISSIONED)$/.test(key(p && p.status));
    }) : [];
    var assets = allMineAssets(rs);
    var flows = Array.isArray(industrial.siteFlowLedger) ? industrial.siteFlowLedger :
      Array.isArray(rs.siteFlowLedger) ? rs.siteFlowLedger :
      Array.isArray(rs.extractionLedger) ? rs.extractionLedger :
      Array.isArray(rs.mineProductionLedger) ? rs.mineProductionLedger : [];
    var shipments = Array.isArray(industrial.shipments) ? industrial.shipments :
      Array.isArray(industrial.transportJobs) ? industrial.transportJobs :
      Array.isArray(rs.shipmentLedger) ? rs.shipmentLedger : Array.isArray(rs.shipments) ? rs.shipments : [];
    var turn = currentTurn(s), grouped = groupFlows(flows, turn);
    var siteModels = (model.sites || []).map(function (site) {
      var id = site.siteId, siteAssets = assets.filter(function (a) { return String(a.siteId || '') === String(id); });
      var activeMine = siteAssets.filter(activeAsset).slice(-1)[0] || null;
      var project = projects.filter(function (p) { return String(p.siteId || '') === String(id); }).slice(-1)[0] || null;
      var siteFlow = grouped.bySite[id] || [];
      var currentRows = siteFlow.filter(function (f) { return rowTurn(f) === turn; });
      var output = currentRows.reduce(function (sum, f) { var q = quantityOf(f); return sum + (q !== null && q > 0 && !isBlockedStatus(f.status || f.stage) ? q : 0); }, 0);
      var flowBlocked = !!grouped.blockedSites[id];
      var shipmentBlocked = shipments.some(function (sh) {
        var linked = String(sh.siteId || sh.sourceSiteId || sh.originSiteId || sh.mineId || '') === String(id);
        return linked && isBlockedStatus(sh.status);
      });
      var demand = demandForResource(rs, site.resourceId);
      var comparableOutput = demand && demand.unit ? resourceOutputForDemand(grouped.byResource, site.resourceId, demand.unit) : null;
      var shortage = demand && demand.unit && comparableOutput !== null && comparableOutput < demand.quantity;
      var status, statusState;
      if (project) { status = 'Under construction'; statusState = 'warning'; }
      else if (activeMine && output > 0 && (flowBlocked || shipmentBlocked)) { status = 'Supply constrained'; statusState = 'warning'; }
      else if (activeMine && output > 0 && shortage) { status = 'Supply shortage'; statusState = 'warning'; }
      else if (activeMine && output > 0) { status = 'Producing'; statusState = 'good'; }
      else { status = 'Stopped'; statusState = 'danger'; }
      var stock = stockForResource(rs, site.resourceId);
      var reserve = site.reserve && site.reserve.value !== null ? fmt(site.reserve.value) + ' ' + site.reserve.unit :
        site.modeledReserve && site.modeledReserve.modeledValue !== null ? fmt(site.modeledReserve.modeledValue) + ' ' + site.modeledReserve.unit : RESOURCE_FALLBACK;
      return Object.assign({}, site, {
        asset:activeMine, assets:siteAssets, project:project, currentOutput:output, currentRows:currentRows,
        stock:stock, reserveText:reserve, flowBlocked:flowBlocked || shipmentBlocked,
        statusLabel:status, statusState:statusState, archetype:archetype(site.raw, resourceApi)
      });
    });
    var activeAssetIds = Object.create(null);
    assets.filter(activeAsset).forEach(function (asset) { activeAssetIds[String(asset.siteId || '')] = true; });
    var blockedMap = Object.create(null);
    Object.keys(grouped.blockedSites).forEach(function (id) { if (grouped.blockedSites[id]) blockedMap[id] = true; });
    shipments.forEach(function (shipment) {
      if (!isBlockedStatus(shipment && shipment.status)) return;
      blockedMap[String(shipment.siteId || shipment.sourceSiteId || shipment.shipmentId || shipment.id || 'blocked-shipment')] = true;
    });
    var blockedSiteCount = Object.keys(blockedMap).length;
    var statusCounts = {
      producing:siteModels.filter(function (site) { return site.currentOutput > 0 && site.asset; }).length,
      pending:projects.length,
      blocked:blockedSiteCount,
      operational:Object.keys(activeAssetIds).length
    };
    return {
      countryId:country, playerCountry:playerCountry(), turn:turn, siteCount:siteModels.length, sites:siteModels,
      resourceState:rs, industrial:industrial, inventory:inventory, rawWarehouse:rawWarehouse, finishedWarehouse:finishedWarehouse,
      projects:projects, assets:assets, flows:flows, flowGroups:grouped, shipments:shipments, statusCounts:statusCounts
    };
  }
  function demandForResource(rs, resourceId) {
    var maps = [rs && rs.consumption, rs && rs.demand, rs && rs.resourceDemand, rs && rs.nationalDemand, rs && rs.exportDemand];
    var wanted = key(resourceId).replace(/[- ]+/g, '_');
    for (var i = 0; i < maps.length; i += 1) {
      var map = maps[i];
      if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
      var keys = Object.keys(map);
      for (var j = 0; j < keys.length; j += 1) {
        if (key(keys[j]).replace(/[- ]+/g, '_') !== wanted) continue;
        var raw = map[keys[j]], quantity = num(raw && typeof raw === 'object' ?
          (raw.quantity !== undefined ? raw.quantity : raw.dailyConsumption !== undefined ? raw.dailyConsumption :
            raw.consumption !== undefined ? raw.consumption : raw.amount !== undefined ? raw.amount : raw.value) : raw);
        if (quantity !== null) return { quantity:quantity, unit:String(raw && typeof raw === 'object' ? raw.unit || raw.quantityUnit || '' : '') };
      }
    }
    return null;
  }
  function resourceOutputForDemand(groups, resourceId, unit) {
    var total = 0, found = false;
    Object.keys(groups || {}).forEach(function (id) {
      var row = groups[id];
      if (row.resourceId !== String(resourceId || '').toLowerCase()) return;
      if (!row.unit || !unit || key(row.unit) !== key(unit)) return;
      total += row.quantity; found = true;
    });
    return found ? total : null;
  }
  function stockForResource(rs, resourceId) {
    var candidates = [rs && rs.warehouse && rs.warehouse.availableByResource, rs && rs.inventory && rs.inventory.availableByResource,
      rs && rs.inventory && rs.inventory.onHandByResource, rs && rs.inventory, rs && rs.warehouseInventory && rs.warehouseInventory.availableByResource];
    for (var i = 0; i < candidates.length; i += 1) {
      var map = candidates[i];
      if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
      var wanted = key(resourceId).replace(/[- ]+/g, '_'), found = null, keys = Object.keys(map);
      for (var j = 0; j < keys.length; j += 1) {
        if (key(keys[j]).replace(/[- ]+/g, '_') === wanted) { found = map[keys[j]]; break; }
      }
      if (found !== null && found !== undefined) {
        var q = num(found && typeof found === 'object' ? (found.available !== undefined ? found.available : found.quantity !== undefined ? found.quantity : found.onHand) : found);
        if (q !== null) return { quantity:q, unit:String(found && typeof found === 'object' ? found.unit || '' : '') };
      }
    }
    return null;
  }
  function warehouseRows(data) {
    var maps = [
      { title:'Raw stock', map:data.rawWarehouse.availableByResource || data.inventory.availableByResource || data.inventory.onHandByResource || {} },
      { title:'Finished goods', map:data.finishedWarehouse.availableByResource || {} }
    ];
    var rows = [];
    maps.forEach(function (group) {
      Object.keys(group.map || {}).forEach(function (id) {
        var v = group.map[id], quantity = num(v && typeof v === 'object' ? (v.quantity !== undefined ? v.quantity : v.available !== undefined ? v.available : v.onHand) : v);
        rows.push({ resourceId:id, warehouse:group.title, quantity:quantity, unit:String(v && typeof v === 'object' ? v.unit || '' : '') });
      });
    });
    if (!rows.length) {
      var batches = Array.isArray(data.inventory.batches) ? data.inventory.batches :
        Array.isArray(data.inventory.inventoryBatches) ? data.inventory.inventoryBatches :
        Array.isArray(data.resourceState.warehouseBatches) ? data.resourceState.warehouseBatches : [];
      rows = batches.map(function (b) { return { resourceId:b.resourceId || b.materialId || b.commodity || 'Resource', warehouse:b.warehouseId || b.warehouse || 'Stock', quantity:num(b.availableQuantity !== undefined ? b.availableQuantity : b.remainingQuantity !== undefined ? b.remainingQuantity : b.quantity), unit:b.unit || b.quantityUnit || '' }; });
    }
    return rows;
  }
  function statusPill(status, stateName) {
    return '<span class="omega-mpc-status" data-state="' + esc(stateName || 'unknown') + '"><i aria-hidden="true"></i>' + esc(status) + '</span>';
  }
  function card(site, data, options) {
    var country = data.countryId, canOperate = country && country === data.playerCountry;
    var canBuild = canOperate && !site.asset && !site.project && site.raw && !(site.raw.runtime && site.raw.runtime.aliasOfSiteId) && !(site.raw.map && site.raw.map.markerEligible === false);
    var canExtract = canOperate && !!site.asset && !site.project;
    var canDemolish = canOperate && !!site.asset;
    var selectedConfirm = options.root && options.root.__omegaMineConfirmSiteId === site.siteId;
    var outputUnit = site.production && site.production.unit && site.production.unit !== 'unit not recorded' ? site.production.unit : 'units';
    var outputText = site.currentOutput > 0 ? fmt(site.currentOutput) + ' ' + outputUnit : '0 this turn';
    var stockText = site.stock ? fmt(site.stock.quantity) + (site.stock.unit ? ' ' + esc(site.stock.unit) : '') : RESOURCE_FALLBACK;
    var reserveText = site.reserveText;
    var kind = site.archetype || 'OPEN_PIT';
    var kindLabel = ({ OPEN_PIT:'Open-pit mine', UNDERGROUND_MINE:'Underground mine', QUARRY:'Quarry', OIL_GAS_FIELD:'Oil & gas field', OFFSHORE_PLATFORM:'Offshore platform' })[kind] || 'Mine site';
    return '<article class="omega-mpc-mine-card" data-omega-mpc-card data-site-id="' + esc(site.siteId) + '" data-resource="' + esc(site.resourceId) +
      '" data-search="' + esc((site.name + ' ' + site.resourceId + ' ' + site.location + ' ' + kindLabel).toLowerCase()) + '" data-mine-type="' + esc(kind.toLowerCase()) + '">' +
      '<div class="omega-mpc-card-head"><div class="omega-mpc-identity"><span class="omega-mpc-resource-frame">' + icon(site.resourceId) + '</span><div class="omega-mpc-name"><span class="omega-mpc-kicker">' + esc(resourceName(site.resourceId)) + '</span><h3>' + esc(site.name) + '</h3><p>' + esc(site.location || data.countryId) + ' · ' + esc(kindLabel) + '</p></div></div>' +
      statusPill(site.statusLabel, site.statusState) + '</div>' +
      '<div class="omega-mpc-metrics"><div><span>Production today</span><strong>' + esc(outputText) + '</strong></div><div><span>Warehouse stock</span><strong>' + esc(stockText) + '</strong></div><div><span>Mine reserve</span><strong>' + esc(reserveText) + '</strong></div><div><span>Capacity</span><strong>' + esc(site.production && site.production.value !== null ? fmt(site.production.value) + ' ' + site.production.unit : RESOURCE_FALLBACK) + '</strong></div></div>' +
      (site.project ? '<div class="omega-mpc-project"><span>Construction</span><strong>' + esc(label(site.project.status || 'Under construction')) + '</strong></div>' : '') +
      '<div class="omega-mpc-card-foot"><span class="omega-mpc-card-kind">' + esc(kindLabel) + '</span><button type="button" class="omega-mpc-text-action" data-mine-action="details" data-site-id="' + esc(site.siteId) + '">Details</button></div>' +
      '<div class="omega-mpc-operation-row">' +
      (canBuild ? '<label class="omega-mpc-worker-field">Workers committed<input type="number" min="0" step="1" inputmode="numeric" value="0" data-mine-workers="' + esc(site.siteId) + '" aria-label="Construction workers for ' + esc(site.name) + '"></label><button type="button" class="omega-mpc-btn omega-mpc-btn-build" data-mine-action="build" data-site-id="' + esc(site.siteId) + '" data-resource-id="' + esc(site.resourceId) + '">Build mine</button>' : '') +
      (canExtract ? '<label class="omega-mpc-quantity-field">Extract quantity<input type="number" min="1" step="1" inputmode="decimal" value="1" data-mine-quantity="' + esc(site.siteId) + '" aria-label="Extraction quantity for ' + esc(site.name) + '"></label><button type="button" class="omega-mpc-btn omega-mpc-btn-extract" data-mine-action="extract" data-site-id="' + esc(site.siteId) + '" data-resource-id="' + esc(site.resourceId) + '">Start extraction</button><button type="button" class="omega-mpc-btn omega-mpc-btn-demolish" data-mine-action="' + (selectedConfirm ? 'confirm-demolish' : 'demolish') + '" data-site-id="' + esc(site.siteId) + '">' + (selectedConfirm ? 'Confirm closure' : 'Demolish') + '</button>' : '') +
      (!canOperate ? '<span class="omega-mpc-readonly">View only · select this country to operate its mines.</span>' : (!canBuild && !canExtract ? '<span class="omega-mpc-readonly">Production is stopped until this mine is commissioned.</span>' : '')) +
      '</div></article>';
  }
  function renderOverview(data, options) {
    var producing = data.statusCounts.producing, all = data.siteCount;
    return '<div class="omega-mpc-kpis">' +
      kpi('Registered mines', fmt(all), 'Unique sites') +
      kpi('Producing now', fmt(producing), 'Confirmed this turn', producing ? 'good' : 'danger') +
      kpi('Projects pending', fmt(data.statusCounts.pending), 'Construction') +
      kpi('Supply blocked', fmt(data.statusCounts.blocked), 'Requires attention', data.statusCounts.blocked ? 'warning' : 'good') +
      '</div><div class="omega-mpc-panel omega-mpc-flow-panel"><div class="omega-mpc-panel-title"><div><span class="omega-mpc-kicker">NATIONAL RESOURCE ECONOMY</span><h2>Mine to market</h2></div><span class="omega-mpc-turn">Turn ' + fmt(data.turn,0) + '</span></div>' +
      '<div class="omega-mpc-flow"><span>Extraction</span><b>›</b><span>Raw stock</span><b>›</b><span>Transport</span><b>›</b><span>Factory</span><b>›</b><span>Economy</span></div>' +
      '<div class="omega-mpc-overview-grid"><button type="button" data-mine-tab="mines"><strong>' + fmt(all) + '</strong><span>Mines and fields</span></button><button type="button" data-mine-tab="logistics"><strong>' + fmt(data.shipments.length) + '</strong><span>Shipment records</span></button><button type="button" data-mine-tab="inventory"><strong>' + fmt(warehouseRows(data).length) + '</strong><span>Stock lines</span></button><button type="button" data-mine-tab="reports"><strong>' + fmt(data.flowGroups.totalRows) + '</strong><span>Production records</span></button></div></div>' +
      (data.sites.length ? '<div class="omega-mpc-section-title"><div><span class="omega-mpc-kicker">SITE OPERATIONS</span><h2>Priority mines</h2></div><button type="button" class="omega-mpc-link" data-mine-tab="mines">View all</button></div><div class="omega-mpc-card-grid">' + data.sites.slice(0,4).map(function (site) { return card(site, data, options); }).join('') + '</div>' : empty('No mine sites are available for the selected country.'));
  }
  function kpi(title, value, meta, stateName) {
    return '<div class="omega-mpc-kpi" data-state="' + esc(stateName || 'neutral') + '"><span>' + esc(title) + '</span><strong>' + esc(value) + '</strong><small>' + esc(meta || '') + '</small></div>';
  }
  function empty(message) { return '<div class="omega-mpc-empty">' + esc(message) + '</div>'; }
  function renderInventory(data) {
    var rows = warehouseRows(data), turn = data.turn, out = '';
    if (!rows.length) return '<div class="omega-mpc-panel"><div class="omega-mpc-panel-title"><h2>Inventory / Warehouse</h2></div>' + empty('No warehouse quantities have been recorded for this country yet.') + '</div>';
    var groups = Object.create(null);
    rows.forEach(function (row) {
      var k = row.resourceId + '|' + row.unit;
      if (!groups[k]) groups[k] = { resourceId:row.resourceId, unit:row.unit, raw:null, finished:null };
      if (/finished/i.test(row.warehouse)) groups[k].finished = row.quantity;
      else groups[k].raw = row.quantity;
    });
    out = '<div class="omega-mpc-panel"><div class="omega-mpc-panel-title"><div><span class="omega-mpc-kicker">NATIONAL STOCK</span><h2>Inventory / Warehouse</h2></div><span class="omega-mpc-turn">' + fmt(rows.length,0) + ' stock lines</span></div>' +
      '<div class="omega-mpc-stock-grid">' + Object.keys(groups).map(function (key) {
        var row = groups[key], raw = row.raw === null ? RESOURCE_FALLBACK : fmt(row.raw) + (row.unit ? ' ' + row.unit : '');
        var finished = row.finished === null ? RESOURCE_FALLBACK : fmt(row.finished) + (row.unit ? ' ' + row.unit : '');
        var low = row.raw !== null && row.raw <= 0;
        return '<article class="omega-mpc-stock-card" data-state="' + (low ? 'danger' : 'good') + '"><div class="omega-mpc-stock-icon">' + icon(row.resourceId) + '</div><h3>' + esc(resourceName(row.resourceId)) + '</h3><div><span>Raw stock</span><strong>' + esc(raw) + '</strong></div><div><span>Finished stock</span><strong>' + esc(finished) + '</strong></div></article>';
      }).join('') + '</div></div>';
    var batches = Array.isArray(data.inventory.batches) ? data.inventory.batches : Array.isArray(data.inventory.inventoryBatches) ? data.inventory.inventoryBatches : [];
    out += '<div class="omega-mpc-panel"><div class="omega-mpc-panel-title"><h2>Stock movement</h2><span class="omega-mpc-turn">Turn ' + fmt(turn,0) + '</span></div>' +
      '<div class="omega-mpc-table-wrap"><table class="omega-mpc-table"><thead><tr><th>Resource</th><th>Batch</th><th>Quantity</th><th>Location</th><th>State</th></tr></thead><tbody>' +
      (batches.length ? batches.slice(-80).reverse().map(function (b) {
        return '<tr><td>' + esc(resourceName(b.resourceId || b.materialId || b.commodity)) + '</td><td>' + esc(b.batchId || b.id || RESOURCE_FALLBACK) + '</td><td>' +
          esc(fmt(b.remainingQuantity !== undefined ? b.remainingQuantity : b.availableQuantity !== undefined ? b.availableQuantity : b.quantity)) + ' ' + esc(b.unit || b.quantityUnit || '') +
          '</td><td>' + esc(b.warehouseId || b.warehouse || b.location || RESOURCE_FALLBACK) + '</td><td>' + statusPill(label(b.status || b.stage || 'Available'), isBlockedStatus(b.status) ? 'warning' : 'good') + '</td></tr>';
      }).join('') : rows.map(function (row) {
        return '<tr><td>' + esc(resourceName(row.resourceId)) + '</td><td>—</td><td>' + esc(fmt(row.quantity)) + ' ' + esc(row.unit || '') + '</td><td>' + esc(row.warehouse) + '</td><td>' + statusPill('Available', row.quantity > 0 ? 'good' : 'danger') + '</td></tr>';
      }).join('')) + '</tbody></table></div></div>';
    return out;
  }
  function renderLogistics(data) {
    var shipments = data.shipments.slice().reverse();
    var blocked = shipments.filter(function (row) { return isBlockedStatus(row.status); }).length;
    var inTransit = shipments.filter(function (row) { return /IN_TRANSIT|DISPATCHED|EN_ROUTE/.test(key(row.status)); }).length;
    var delivered = shipments.filter(function (row) { return /DELIVERED|RECEIVED|ARRIVED/.test(key(row.status)); }).length;
    var html = '<div class="omega-mpc-kpis">' + kpi('Shipments', fmt(shipments.length), 'Recorded moves') +
      kpi('In transit', fmt(inTransit), 'Awaiting receipt', inTransit ? 'warning' : 'neutral') +
      kpi('Delivered', fmt(delivered), 'Receipt recorded', delivered ? 'good' : 'neutral') +
      kpi('Blocked', fmt(blocked), 'Route or supply issue', blocked ? 'warning' : 'good') + '</div>';
    if (!shipments.length) return html + '<div class="omega-mpc-panel"><div class="omega-mpc-panel-title"><h2>Stock & Logistics</h2></div>' + empty('No shipment records are available yet. Extracted materials remain in stock until dispatched.') + '</div>';
    html += '<div class="omega-mpc-logistics-grid">' + shipments.slice(0,80).map(function (s) {
      var st = key(s.status), stateName = /DELIVERED|RECEIVED|ARRIVED/.test(st) ? 'good' : isBlockedStatus(st) ? 'warning' : /IN_TRANSIT|DISPATCHED|EN_ROUTE/.test(st) ? 'info' : 'neutral';
      return '<article class="omega-mpc-shipment"><div class="omega-mpc-panel-title"><h3>' + esc(s.shipmentId || s.id || s.reservationId || 'Shipment') + '</h3>' + statusPill(label(st), stateName) + '</div>' +
        '<div class="omega-mpc-route"><span>' + esc(s.sourceSiteId || s.originSiteId || s.origin || s.from || 'Origin not recorded') + '</span><b>→</b><span>' + esc(s.destinationFactoryId || s.destinationWarehouseId || s.destination || s.to || 'Destination not recorded') + '</span></div>' +
        '<div class="omega-mpc-shipment-stats"><div><span>Quantity</span><strong>' + esc(fmt(s.quantity !== undefined ? s.quantity : s.dispatchedQuantity)) + ' ' + esc(s.unit || s.quantityUnit || '') + '</strong></div><div><span>Transport</span><strong>' + esc(label(s.transportMode || s.mode || s.route && (s.route.transportMode || s.route.mode) || RESOURCE_FALLBACK)) + '</strong></div><div><span>ETA</span><strong>' + esc(fmt(s.etaTurn !== undefined ? s.etaTurn : s.estimatedArrivalTurn,0)) + '</strong></div></div></article>';
    }).join('') + '</div>';
    return html;
  }
  function renderReports(data) {
    var rows = Object.keys(data.flowGroups.byResource).map(function (id) { return data.flowGroups.byResource[id]; })
      .sort(function (a,b) { return b.quantity-a.quantity; }).slice(0,8);
    var max = rows.reduce(function (n, row) { return Math.max(n, row.quantity); }, 0);
    var bar = rows.length ? '<div class="omega-mpc-chart" role="img" aria-label="Confirmed extraction by resource this turn">' + rows.map(function (row) {
      var width = max > 0 ? Math.max(3, Math.min(100, row.quantity/max*100)) : 0;
      return '<div class="omega-mpc-bar-row"><div class="omega-mpc-bar-label"><span>' + esc(resourceName(row.resourceId)) + '</span><strong>' + esc(fmt(row.quantity)) + ' ' + esc(row.unit) + '</strong></div><div class="omega-mpc-bar-track"><i style="width:' + width.toFixed(2) + '%"></i></div></div>';
    }).join('') + '</div>' : empty('No confirmed extraction amounts have been recorded this turn.');
    var stock = warehouseRows(data);
    var rawValues = Object.keys(data.rawWarehouse.availableByResource || {}).length;
    var finishedValues = Object.keys(data.finishedWarehouse.availableByResource || {}).length;
    var blocked = data.statusCounts.blocked, totalOutputLines = rows.length;
    return '<div class="omega-mpc-kpis">' + kpi('Producing mines', fmt(data.statusCounts.producing), 'Output confirmed this turn', data.statusCounts.producing ? 'good' : 'danger') +
      kpi('Pending projects', fmt(data.statusCounts.pending), 'Construction not complete') +
      kpi('Blocked flows', fmt(blocked), 'Transport or processing', blocked ? 'warning' : 'good') +
      kpi('Stock lines', fmt(stock.length), 'Raw and finished goods') + '</div>' +
      '<div class="omega-mpc-report-grid"><section class="omega-mpc-panel"><div class="omega-mpc-panel-title"><div><span class="omega-mpc-kicker">PRODUCTION ANALYTICS</span><h2>Confirmed output by resource</h2></div><span class="omega-mpc-turn">Turn ' + fmt(data.turn,0) + '</span></div>' + bar + '</section>' +
      '<section class="omega-mpc-panel"><div class="omega-mpc-panel-title"><div><span class="omega-mpc-kicker">COUNTRY RESOURCE ECONOMY</span><h2>Supply overview</h2></div></div><div class="omega-mpc-economy-list">' +
      economyLine('Registered mine sites', fmt(data.siteCount)) + economyLine('Commissioned mines', fmt(data.statusCounts.operational)) +
      economyLine('Confirmed production records', fmt(data.flowGroups.totalRows)) + economyLine('Blocked supply flows', fmt(blocked)) +
      economyLine('Raw stock resources', fmt(rawValues)) + economyLine('Finished-goods resources', fmt(finishedValues)) +
      '</div><p class="omega-mpc-footnote">Reserve, warehouse stock, output and delivery are tracked separately. A shipment counts as delivered only after receipt is recorded.</p></section></div>' +
      '<section class="omega-mpc-panel"><div class="omega-mpc-panel-title"><h2>Recent production flow</h2><span class="omega-mpc-turn">' + fmt(data.flows.length) + ' entries</span></div>' +
      (data.flows.length ? '<div class="omega-mpc-table-wrap"><table class="omega-mpc-table"><thead><tr><th>Mine</th><th>Resource</th><th>Turn</th><th>Output</th><th>Status</th></tr></thead><tbody>' + data.flows.slice(-30).reverse().map(function (f) {
        var q = quantityOf(f), blockedFlow = isBlockedStatus(f.status || f.stage);
        return '<tr><td>' + esc(f.siteName || f.siteId || f.siteReferenceKey || RESOURCE_FALLBACK) + '</td><td>' + esc(resourceName(f.resourceId || f.materialIdentity)) + '</td><td>' +
          esc(fmt(rowTurn(f),0)) + '</td><td>' + esc(q === null ? RESOURCE_FALLBACK : fmt(q) + ' ' + (f.unit || f.quantityUnit || '')) + '</td><td>' + statusPill(label(f.status || f.stage || 'Recorded'), blockedFlow ? 'warning' : 'neutral') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : empty('No production movement has been recorded yet.')) + '</section>';
  }
  function economyLine(title, value) {
    return '<div><span>' + esc(title) + '</span><strong>' + esc(value) + '</strong></div>';
  }
  function renderMines(data, options) {
    var filter = '<div class="omega-mpc-filterbar"><label class="omega-mpc-search"><span aria-hidden="true">⌕</span><input type="search" data-mine-search placeholder="Search mines, regions or resources" aria-label="Search mines"></label><select data-mine-filter aria-label="Filter mines by resource"><option value="all">All resources</option>' +
      Array.from(new Set(data.sites.map(function (site) { return site.resourceId; })).values()).filter(Boolean).sort().map(function (rid) { return '<option value="' + esc(rid) + '">' + esc(resourceName(rid)) + '</option>'; }).join('') + '</select></div>';
    return '<div class="omega-mpc-section-title"><div><span class="omega-mpc-kicker">NATIONAL MINE NETWORK</span><h2>Mine sites</h2></div><span class="omega-mpc-count">' + fmt(data.siteCount,0) + ' sites</span></div>' + filter +
      (data.sites.length ? '<div class="omega-mpc-card-grid" data-mine-card-grid>' + data.sites.map(function (site) { return card(site, data, options); }).join('') + '</div>' : empty('No mine sites are available for the selected country.'));
  }
  function render(root, options) {
    options = options || {};
    if (!root || typeof root !== 'object') return { ok:false, code:'MINE_COMMAND_ROOT_REQUIRED' };
    var data = buildData(options);
    var active = options.tab || root.__omegaMineTab || 'overview';
    if (['overview','mines','logistics','inventory','reports'].indexOf(active) < 0) active = 'overview';
    var titleCountry = options.countryName || data.countryId || 'Select a country';
    var tabs = [['overview','Overview'],['mines','Mines'],['logistics','Stock & Logistics'],['inventory','Inventory / Warehouse'],['reports','Reports']];
    var tabMarkup = '<nav class="omega-mpc-tabs" aria-label="Mine production sections">' + tabs.map(function (tab) {
      return '<button type="button" data-mine-tab="' + tab[0] + '" class="' + (active === tab[0] ? 'is-active' : '') + '" aria-pressed="' + (active === tab[0] ? 'true' : 'false') + '">' + esc(tab[1]) + '</button>';
    }).join('') + '</nav>';
    var siteMarkup = active === 'mines' ? renderMines(data, { root:root }) :
      active === 'logistics' ? renderLogistics(data) :
      active === 'inventory' ? renderInventory(data) :
      active === 'reports' ? renderReports(data) : renderOverview(data, { root:root });
    var canRun = data.countryId && data.countryId === data.playerCountry;
    root.classList.add('omega-v2-screen');
    root.innerHTML = '<section class="omega-mpc" data-mine-command-version="' + VERSION + '">' +
      '<header class="omega-mpc-header"><div class="omega-mpc-head-main"><div class="omega-mpc-ministry-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 34 29 13m-8-3 17 0 0 17M6 40h36" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="m24 24 11 11" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg></div><div><span class="omega-mpc-kicker">OMEGA · RESOURCE OPERATIONS</span><h1>Mine Production</h1><p>' + esc(titleCountry) + ' <span>·</span> Extraction, stock, transport and output</p></div></div>' +
      '<div class="omega-mpc-header-side">' + statusPill(canRun ? 'Player country' : 'View only', canRun ? 'good' : 'neutral') + '<span class="omega-mpc-turn">Turn ' + fmt(data.turn,0) + '</span></div></header>' +
      '<div class="omega-mpc-country-band"><span>Selected country</span><strong>' + esc(titleCountry) + '</strong><span class="omega-mpc-country-rule"></span><span>' + fmt(data.siteCount,0) + ' mine sites</span></div>' +
      (root.__omegaMineNotice ? '<div class="omega-mpc-notice" role="status" aria-live="polite">' + esc(root.__omegaMineNotice) + '<button type="button" data-mine-action="dismiss-notice" aria-label="Dismiss message">×</button></div>' : '') +
      tabMarkup + '<main class="omega-mpc-main" data-mine-tab-content>' + siteMarkup + '</main>' +
      '<footer class="omega-mpc-footer"><span><i aria-hidden="true"></i> Country-scoped operations</span><span>Stock ≠ reserve · delivery is confirmed on receipt</span></footer></section>';
    if (!root.__omegaMineBound && typeof root.addEventListener === 'function') {
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var tab = target.closest('[data-mine-tab]');
        if (tab && root.contains(tab)) {
          root.__omegaMineTab = tab.getAttribute('data-mine-tab') || 'overview';
          render(root, Object.assign({}, root.__omegaMineOptions || {}, { tab:root.__omegaMineTab }));
          return;
        }
        var button = target.closest('[data-mine-action]');
        if (!button || !root.contains(button)) return;
        void handleAction(root, button, event);
      });
      root.addEventListener('input', function (event) {
        if (event && event.target && event.target.matches && event.target.matches('[data-mine-search]')) applyFilter(root);
      });
      root.addEventListener('change', function (event) {
        if (event && event.target && event.target.matches && event.target.matches('[data-mine-filter]')) applyFilter(root);
      });
      root.__omegaMineBound = true;
    }
    root.__omegaMineOptions = options;
    root.__omegaMineTab = active;
    if (active === 'mines') applyFilter(root);
    return { ok:true, countryId:data.countryId, siteCount:data.siteCount, producingCount:data.statusCounts.producing,
      pendingProjectCount:data.statusCounts.pending, blockedFlowCount:data.statusCounts.blocked, tab:active, model:data };
  }
  function applyFilter(root) {
    var input = root.querySelector('[data-mine-search]'), select = root.querySelector('[data-mine-filter]');
    var q = String(input && input.value || '').trim().toLowerCase(), rid = String(select && select.value || 'all');
    var cards = root.querySelectorAll('[data-omega-mpc-card]');
    Array.prototype.forEach.call(cards, function (node) {
      var search = node.getAttribute('data-search') || '', resource = node.getAttribute('data-resource') || '';
      node.hidden = !!((q && search.indexOf(q) < 0) || (rid !== 'all' && resource !== rid));
    });
  }
  async function handleAction(root, button) {
    var action = button.getAttribute('data-mine-action'), id = String(button.getAttribute('data-site-id') || '');
    var options = root.__omegaMineOptions || {}, data = buildData(options);
    if (action === 'dismiss-notice') { root.__omegaMineNotice = ''; render(root, options); return; }
    if (action === 'details') { if (typeof options.onOpenSite === 'function') options.onOpenSite(id); else { root.__omegaMineNotice = 'Site details are unavailable in this view.'; render(root, options); } return; }
    if (action === 'locate') { if (typeof options.onLocateMine === 'function') options.onLocateMine(id, data.countryId); return; }
    if (data.countryId !== data.playerCountry) {
      root.__omegaMineNotice = 'Operations are locked to the selected player country.';
      render(root, options); return;
    }
    var modelSite = data.sites.find(function (site) { return site.siteId === id; });
    if (!modelSite) { root.__omegaMineNotice = 'The selected mine could not be found in this country.'; render(root, options); return; }
    var api = runtimeApi();
    if (action === 'build') {
      if (!api || typeof api.quoteMineProject !== 'function' || typeof api.startMineProject !== 'function') {
        root.__omegaMineNotice = 'Mine construction services are unavailable.';
        render(root, options); return;
      }
      var worker = root.querySelector('[data-mine-workers="' + cssEscape(id) + '"]');
      var workers = num(worker && worker.value);
      if (workers === null || workers < 0 || Math.floor(workers) !== workers) {
        root.__omegaMineNotice = 'Enter a whole number of construction workers.';
        render(root, options); return;
      }
      button.disabled = true;
      root.__omegaMineNotice = 'Checking treasury, materials, workforce and construction requirements…';
      render(root, options);
      var result;
      try {
        var quote = api.quoteMineProject({ countryId:data.countryId, siteId:id, resourceId:modelSite.resourceId, assignedWorkers:workers });
        result = quote && quote.status === 'QUOTED'
          ? (!quote.ready ? { status:'BLOCKED', reason:constructionBlockReason(quote), quote:quote } :
            api.startMineProject({ countryId:data.countryId, siteId:id, resourceId:modelSite.resourceId, assignedWorkers:workers,
              requestId:'MINE_BUILD:' + data.countryId + ':' + id + ':T' + data.turn }))
          : quote;
      } catch (error) { result = { status:'FAILED', reason:String(error && error.message || error) }; }
      root.__omegaMineNotice = readableResult('Mine construction', result);
      render(root, Object.assign({}, options, { tab:'mines' })); return;
    }
    if (action === 'extract') {
      if (!api || typeof api.executeSitePipeline !== 'function') { root.__omegaMineNotice = 'The extraction service is unavailable.'; render(root, options); return; }
      if (!modelSite.asset) { root.__omegaMineNotice = 'Build and commission this mine before starting extraction.'; render(root, options); return; }
      var qtyInput = root.querySelector('[data-mine-quantity="' + cssEscape(id) + '"]');
      var quantity = num(qtyInput && qtyInput.value);
      if (quantity === null || quantity <= 0) { root.__omegaMineNotice = 'Enter a positive extraction quantity.'; render(root, options); return; }
      button.disabled = true;
      root.__omegaMineNotice = 'Checking reserve, output capacity, route and stock before extraction…';
      render(root, options);
      var extraction;
      try { extraction = await api.executeSitePipeline({ countryId:data.countryId, siteId:id, resourceId:modelSite.resourceId, quantity:quantity }); }
      catch (error) { extraction = { status:'FAILED', reason:String(error && error.message || error) }; }
      root.__omegaMineNotice = readableResult('Extraction', extraction);
      render(root, Object.assign({}, options, { tab:'mines' })); return;
    }
    if (action === 'demolish') {
      root.__omegaMineConfirmSiteId = id;
      root.__omegaMineNotice = 'Closure stops future production for this mine. Existing stock and records are preserved. Confirm on the mine card to continue.';
      render(root, Object.assign({}, options, { tab:'mines' })); return;
    }
    if (action === 'confirm-demolish') {
      if (!api || typeof api.decommissionMine !== 'function') {
        root.__omegaMineNotice = 'Mine closure is unavailable until the resource runtime supports it.';
        root.__omegaMineConfirmSiteId = null; render(root, options); return;
      }
      button.disabled = true;
      var closed;
      try { closed = api.decommissionMine({ countryId:data.countryId, siteId:id, confirmed:true }); }
      catch (error) { closed = { status:'FAILED', reason:String(error && error.message || error) }; }
      root.__omegaMineConfirmSiteId = null;
      root.__omegaMineNotice = readableResult('Mine closure', closed);
      render(root, Object.assign({}, options, { tab:'mines' })); return;
    }
  }
  function constructionBlockReason(quote) {
    if (!quote) return 'CONSTRUCTION_REQUIREMENTS_NOT_MET';
    if (quote.treasury && quote.treasury.available === null) return 'TREASURY_AVAILABLE_BALANCE_UNAVAILABLE';
    if (quote.treasury && !quote.treasury.sufficient) return 'INSUFFICIENT_TREASURY';
    if (quote.materials && quote.materials.some(function (item) { return !item.sufficient; })) return 'INSUFFICIENT_CONSTRUCTION_MATERIALS';
    if (quote.assignedWorkers !== null && quote.assignedWorkers < quote.workersRequired) return 'INSUFFICIENT_WORKER_COMMITMENT';
    if (!quote.commissioningReady) return 'MINE_CONSTRUCTION_ALREADY_IN_PROGRESS';
    return 'CONSTRUCTION_REQUIREMENTS_NOT_MET';
  }
  function cssEscape(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, '');
  }

  g.OmegaUIV2MineProductionCommand = Object.freeze({
    version:VERSION,
    buildData:buildData,
    render:render,
    resourceIconPath:pathForResource
  });
})(typeof window !== 'undefined' ? window : globalThis);
