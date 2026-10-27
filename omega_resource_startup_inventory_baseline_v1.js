(function (g) {
  'use strict';

  var VERSION = '1.0.0';
  var GLOBAL_KEY = '__OMEGA_RESOURCE_STARTUP_INVENTORY_BASELINE_V1__';
  if (g[GLOBAL_KEY]) return;

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }
  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function token(value) {
    return String(value == null ? '' : value).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function state() {
    return (g.Game && g.Game.state) || g.gameState || null;
  }
  function canonicalCountry(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    var bridge = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge ||
      (g.Omega && g.Omega.CanonicalIdentity);
    try {
      var hit = bridge && typeof bridge.resolveCountry === 'function' ? bridge.resolveCountry(value) : null;
      if (hit && hit.id) {
        var details = object(hit.raw) || {};
        var nested = object(details.raw) || object(details.datasets && details.datasets['countries.json']) ||
          object(details['countries.json']) || details;
        var iso3 = nested.iso3 || nested.iso3Code || nested.iso3_code ||
          hit.iso3 || hit.iso3Code || hit.iso3_code;
        if (iso3 && /^[A-Z]{3}$/i.test(String(iso3).trim())) return String(iso3).trim().toUpperCase();
        if (/^[A-Z]{3}$/i.test(String(hit.id).trim())) return String(hit.id).trim().toUpperCase();
      }
    } catch (_) {}
    return /^[A-Z]{3}$/i.test(raw) ? raw.toUpperCase() : null;
  }
  function playerCountryId() {
    var s = state() || {}, session = object(s.simulation && s.simulation.session) || {};
    var player = object(s.player) || {}, pc = object(player.country) || {};
    var simulation = g.Omega && g.Omega.Simulation;
    var value = session.playerCountryId || (simulation && typeof simulation.getPlayerCountryId === 'function'
      ? simulation.getPlayerCountryId() : null) || s.playerCountryId || s.playerCountryCode ||
      player.countryId || player.countryCode || pc.iso3 || pc.countryId || pc.id || pc.code ||
      (g.Game && (g.Game.playerCountryId || g.Game.playerCountryCode));
    return canonicalCountry(value);
  }
  function readResourceBucket(countryId) {
    var s = state(), root = object(s && s.resource) || {};
    var direct = object(root[countryId]);
    if (direct) return direct;
    var key = Object.keys(root).find(function (k) { return canonicalCountry(k) === countryId; });
    return key === undefined ? null : object(root[key]);
  }
  function scopedValue(map, resourceId) {
    map = object(map) || {};
    if (Object.prototype.hasOwnProperty.call(map, resourceId)) return map[resourceId];
    var wanted = token(resourceId);
    var key = Object.keys(map).find(function (k) { return token(k) === wanted; });
    return key === undefined ? undefined : map[key];
  }
  function interop() {
    return (g.Omega && g.Omega.MinistryInteroperability) || g.OmegaMinistryInteroperability || null;
  }
  function dispatch(countryId, payload) {
    var mesh = interop();
    if (!mesh || typeof mesh.dispatchCommand !== 'function') {
      return { status: 'UNAVAILABLE', reason: 'MINISTRY_INTEROPERABILITY_UNAVAILABLE' };
    }
    try {
      return mesh.dispatchCommand('resource', 'OMEGA_RESOURCE_ECON_ADD_INVENTORY', countryId, payload, {
        commandType: 'OMEGA_RESOURCE_ECON_ADD_INVENTORY',
        correlationId: payload.batchId
      });
    } catch (error) {
      return { status: 'FAILED', reason: String(error && error.message || error) };
    }
  }
  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
  async function waitForReady() {
    for (var i = 0; i < 250; i++) {
      var economy = g.OmegaResourceEconomy || (g.Omega && g.Omega.ResourceEconomy);
      var d = economy && typeof economy.diagnostics === 'function' ? economy.diagnostics() : null;
      if (d && d.handlersReady === true && d.rulesLoaded === true) return { ready: true, diagnostics: d };
      await wait(10);
    }
    return { ready: false, reason: 'RESOURCE_ECONOMY_COMMANDS_NOT_READY' };
  }
  async function loadPolicy() {
    var rulesRoot = g.__OmegaResourceEconomyRules;
    var demand = object(rulesRoot && rulesRoot.demand);
    var existing = object(demand && demand.startupInventoryBaseline);
    if (existing && existing.enabled === true) return existing;
    if (typeof g.fetch !== 'function') return null;
    var response = await g.fetch('./resource_economy_rules.json', { cache: 'no-store' });
    if (!response || !response.ok) throw new Error('RESOURCE_STARTUP_INVENTORY_RULES_UNAVAILABLE');
    var file = await response.json();
    var fileDemand = object(file && file.demand);
    var config = object(fileDemand && fileDemand.startupInventoryBaseline);
    if (!config || config.enabled !== true) return null;
    return config;
  }
  function targetDays(row, config) {
    var targets = object(config && config.targetDays) || {};
    var priority = finite(row && row.priority);
    if (priority !== null && priority >= (finite(targets.criticalPriorityMin) || 8.5)) {
      return Math.max(1, finite(targets.critical) || 40);
    }
    if (priority !== null && priority >= (finite(targets.standardPriorityMin) || 6)) {
      return Math.max(1, finite(targets.standard) || 24);
    }
    return Math.max(1, finite(targets.nonCritical) || 10);
  }
  function batchExists(bucket, batchId) {
    var batches = Array.isArray(bucket && bucket.batches) ? bucket.batches : [];
    var lots = object(bucket && bucket.inventoryLots) || {};
    if (batches.some(function (row) { return row && String(row.batchId || '') === batchId; })) return true;
    return Object.prototype.hasOwnProperty.call(lots, batchId);
  }

  var lastReport = null;
  var inFlight = null;
  async function initializeNewGame(countryValue, options) {
    options = object(options) || {};
    if (options.reason !== 'FRESH_SESSION_NO_SAVE' || options.noSave !== true) {
      return { status: 'BLOCKED', reason: 'NOT_AN_EXPLICIT_FRESH_GAME_WITHOUT_SAVE' };
    }
    var cid = canonicalCountry(countryValue);
    if (!cid) return { status: 'BLOCKED', reason: 'PLAYER_COUNTRY_ID_UNKNOWN' };
    var currentPlayer = playerCountryId();
    if (currentPlayer && currentPlayer !== cid) {
      return { status: 'BLOCKED', reason: 'PLAYER_COUNTRY_SCOPE_MISMATCH', countryId: cid, playerCountryId: currentPlayer };
    }
    var session = object(state() && state().simulation && state().simulation.session);
    if (!session || canonicalCountry(session.playerCountryId) !== cid) {
      return { status: 'BLOCKED', reason: 'FRESH_SESSION_NOT_BOUND_TO_PLAYER_COUNTRY', countryId: cid };
    }
    if (inFlight) return inFlight;
    inFlight = runNewGame(cid);
    try { return await inFlight; }
    finally { inFlight = null; }
  }
  async function runNewGame(cid) {
    var report = {
      version: VERSION, countryId: cid, status: 'STARTING',
      quantityAuthority: 'SIMULATED', quantityUnit: 'SIMULATION_RESOURCE_UNIT',
      demandSource: 'OMEGA_RESOURCE_NATIONAL_DEMAND_RUNTIME',
      seededResourceCount: 0, preservedResourceCount: 0, unknownResourceCount: 0,
      existingBaselineBatchCount: 0, blockedResourceCount: 0, failedResourceCount: 0,
      details: []
    };
    try {
      var policy = await loadPolicy();
      if (!policy || policy.enabled !== true) {
        report.status = 'SKIPPED';
        report.reason = 'STARTUP_INVENTORY_BASELINE_DISABLED_OR_UNCONFIGURED';
        return remember(report);
      }
      var endowment = g.OmegaResourceEndowmentRuntime || (g.Omega && g.Omega.ResourceEndowmentRuntime);
      if (!endowment || typeof endowment.initialize !== 'function' || typeof endowment.hydrateCountry !== 'function') {
        report.status = 'BLOCKED';
        report.reason = 'RESOURCE_ENDOWMENT_RUNTIME_UNAVAILABLE';
        return remember(report);
      }
      var initialized = await endowment.initialize();
      if (!initialized || initialized.status !== 'READY') {
        report.status = 'BLOCKED';
        report.reason = 'RESOURCE_ENDOWMENT_NOT_READY';
        report.detail = initialized || null;
        return remember(report);
      }
      var hydrated = await endowment.hydrateCountry(cid);
      var hydration = hydrated && hydrated.result ? hydrated.result : hydrated;
      if (!hydrated || hydrated.status !== 'APPLIED' || !hydration || hydration.accepted === false) {
        report.status = 'BLOCKED';
        report.reason = 'COUNTRY_RESOURCE_STATE_NOT_HYDRATED';
        report.detail = hydrated || null;
        return remember(report);
      }
      var demand = g.OmegaResourceNationalDemandRuntime || (g.Omega && g.Omega.ResourceNationalDemandRuntime);
      if (!demand || typeof demand.prepare !== 'function' || typeof demand.previewCountry !== 'function') {
        report.status = 'BLOCKED';
        report.reason = 'SIDE_EFFECT_FREE_DEMAND_PREVIEW_UNAVAILABLE';
        return remember(report);
      }
      await demand.prepare();
      var ready = await waitForReady();
      if (!ready.ready) {
        report.status = 'BLOCKED';
        report.reason = ready.reason;
        return remember(report);
      }
      var preview = demand.previewCountry(cid, []);
      if (!preview || preview.status !== 'PREVIEW_ONLY' || !Array.isArray(preview.resources)) {
        report.status = 'BLOCKED';
        report.reason = 'RESOURCE_DEMAND_PREVIEW_FAILED';
        report.detail = preview || null;
        return remember(report);
      }
      var bucket = readResourceBucket(cid);
      if (!bucket || !object(bucket.inventory)) {
        report.status = 'BLOCKED';
        report.reason = 'AUTHORITATIVE_RESOURCE_INVENTORY_UNAVAILABLE';
        return remember(report);
      }
      var baselineVersion = String(policy.version || 'SIMULATED_STARTUP_INVENTORY_BASELINE_V1');
      for (var index = 0; index < preview.resources.length; index++) {
        var row = preview.resources[index] || {};
        var rid = String(row.resourceId || '').trim();
        var daily = finite(row.demandPerDay != null ? row.demandPerDay : row.demand);
        if (!rid || row.status === 'UNKNOWN' || daily === null || daily <= 0 ||
            (policy.onlyPositiveDemand === true && row.baselineSource && row.baselineProvenance === 'UNKNOWN')) {
          report.unknownResourceCount++;
          continue;
        }
        if (row.baselineSource === 'NO_BASELINE_OR_REQUIRED_METRICS' ||
            row.baselineSource === 'UNKNOWN' ||
            row.baselineProvenance === 'LEGACY_PROVENANCE_UNSPECIFIED') {
          report.unknownResourceCount++;
          continue;
        }
        var currentValue = finite(scopedValue(bucket.inventory, rid));
        if (currentValue === null) currentValue = 0;
        if (currentValue < 0) {
          report.blockedResourceCount++;
          report.details.push({ resourceId: rid, status: 'BLOCKED_NEGATIVE_EXISTING_BALANCE', currentStock: currentValue });
          continue;
        }
        var days = targetDays(row, policy);
        var target = daily * days;
        if (!Number.isFinite(target) || target <= 0) {
          report.unknownResourceCount++;
          continue;
        }
        var epsilon = Math.max(1e-9, target * 1e-9);
        if (currentValue + epsilon >= target) {
          report.preservedResourceCount++;
          report.details.push({ resourceId: rid, status: 'EXISTING_STOCK_PRESERVED', currentStock: currentValue, targetStock: target, targetDays: days });
          continue;
        }
        var batchId = 'OMEGA-STARTUP-STOCK-V1-' + cid + '-' + token(rid);
        if (batchExists(bucket, batchId)) {
          report.existingBaselineBatchCount++;
          report.details.push({ resourceId: rid, status: 'BASELINE_BATCH_ALREADY_EXISTS', currentStock: currentValue, targetStock: target, targetDays: days, batchId: batchId });
          continue;
        }
        var quantity = target - currentValue;
        var payload = {
          resourceId: rid, quantity: quantity, stage: 'RAW',
          unit: String(policy.quantityUnit || 'SIMULATION_RESOURCE_UNIT'),
          batchId: batchId, transactionId: batchId,
          provenance: {
            source: baselineVersion,
            quantityAuthority: String(policy.quantityAuthority || 'SIMULATED'),
            unitAuthority: 'SIMULATION_ONLY_UNIT_NORMALIZATION',
            sourceUnit: row.unit || null,
            forecastSource: String(row.baselineSource || 'OMEGA_RESOURCE_NATIONAL_DEMAND_RUNTIME'),
            forecastProvenance: String(row.baselineProvenance || 'RULE_PROFILE_ESTIMATE'),
            forecastDemandPerDay: daily,
            targetCoverageDays: days,
            countryId: cid,
            baselineVersion: baselineVersion
          }
        };
        var credited = dispatch(cid, payload);
        var accepted = credited && credited.status === 'APPLIED' && credited.result && credited.result.accepted === true;
        if (accepted) {
          report.seededResourceCount++;
          report.details.push({ resourceId: rid, status: credited.result.duplicate ? 'ALREADY_CREDITED_IDEMPOTENTLY' : 'OPENING_STOCK_CREDITED', quantity: quantity, targetStock: target, targetDays: days, batchId: batchId });
        } else {
          report.failedResourceCount++;
          report.details.push({ resourceId: rid, status: 'CREDIT_FAILED', reason: credited && credited.result && credited.result.reason || credited && credited.reason || credited && credited.status || 'UNKNOWN', batchId: batchId });
        }
      }
      report.status = report.failedResourceCount || report.blockedResourceCount ? 'PARTIAL' : 'READY';
      report.completion = {
        source: baselineVersion, quantityAuthority: 'SIMULATED',
        seedCount: report.seededResourceCount,
        preservedCount: report.preservedResourceCount,
        unknownCount: report.unknownResourceCount,
        blockedCount: report.blockedResourceCount,
        failedCount: report.failedResourceCount
      };
      return remember(report);
    } catch (error) {
      report.status = 'FAILED';
      report.reason = String(error && error.message || error);
      return remember(report);
    }
  }
  function remember(report) {
    lastReport = report;
    g.__OMEGA_STARTUP_STOCK_BASELINE_DIAGNOSTIC = report;
    return report;
  }
  function diagnostics() {
    return { version: VERSION, lastReport: lastReport };
  }
  var API = Object.freeze({
    VERSION: VERSION,
    initializeNewGame: initializeNewGame,
    diagnostics: diagnostics
  });
  g[GLOBAL_KEY] = API;
  g.Omega = g.Omega || {};
  g.Omega.ResourceStartupInventoryBaseline = API;
  g.OmegaResourceStartupInventoryBaseline = API;
})(typeof window !== 'undefined' ? window : globalThis);
