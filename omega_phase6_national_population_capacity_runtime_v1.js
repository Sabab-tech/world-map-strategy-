/* OMEGA PHASE 6 — NATIONAL POPULATION & INDUSTRIAL CAPACITY
 * Read-only projection layer over the existing country, resource-demand,
 * factory-baseline and industrial-network authorities.
 *
 * This module does not create a scheduler, mutate inventories, register assets,
 * or simulate non-player factories. It calculates population-standard demand
 * for the requested country and exposes existing factory/demand evidence.
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  if (root.OmegaPhase6NationalCapacity &&
      root.OmegaPhase6NationalCapacity.VERSION === VERSION) return;

  var preparePromise = null;
  var cataloguePromise = null;
  var lastProvenanceSnapshot = null;
  var restoredProvenanceSnapshot = null;

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }
  function finite(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
  }
  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var out = {};
    Object.keys(value).forEach(function (key) {
      if (key !== '__proto__' && key !== 'constructor' && typeof value[key] !== 'function') out[key] = clone(value[key]);
    });
    return out;
  }
  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).filter(function (key) {
      return key !== '__proto__' && key !== 'constructor' && typeof value[key] !== 'function' &&
        value[key] !== undefined;
    }).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  }
  function fingerprint(value) {
    var source = stableStringify(value);
    var hash = 2166136261;
    for (var i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  function id(value) { return String(value == null ? '' : value).trim().toUpperCase(); }
  function token(value) {
    return String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function sameKey(map, wanted) {
    map = object(map) || {};
    if (Object.prototype.hasOwnProperty.call(map, wanted)) return wanted;
    var target = token(wanted);
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) if (token(keys[i]) === target) return keys[i];
    return null;
  }
  function valueAt(map, wanted) {
    var key = sameKey(map, wanted);
    return key === null ? null : finite(map[key]);
  }
  function state() { return root.Game && root.Game.state ? root.Game.state : (root.gameState || {}); }
  function currentTurn() {
    var s = state();
    var candidates = [s.simulation && s.simulation.turn, s.turn, s.simulationTurn,
      root.Omega && root.Omega.Simulation && root.Omega.Simulation.clock && root.Omega.Simulation.clock.turn];
    for (var i = 0; i < candidates.length; i++) {
      var n = finite(candidates[i]);
      if (n !== null && n >= 0) return n;
    }
    return 0;
  }
  function playerCountryId() {
    var simulation = root.Omega && root.Omega.Simulation;
    try {
      if (simulation && typeof simulation.getPlayerCountryId === 'function') {
        var selected = id(simulation.getPlayerCountryId());
        if (/^[A-Z]{3}$/.test(selected)) return selected;
      }
    } catch (_) {}
    var session = state().simulation && state().simulation.session;
    var fallback = id(session && (session.playerCountryId || session.countryId));
    return /^[A-Z]{3}$/.test(fallback) ? fallback : null;
  }
  function canonicalCountry(value) {
    var direct = id(value);
    if (/^[A-Z]{3}$/.test(direct)) return direct;
    var registries = [
      root.OmegaCanonicalIdentityRegistry,
      root.OmegaCountrySemanticBridge,
      root.Omega && root.Omega.CanonicalIdentity,
      root.Omega && root.Omega.CountryGeneralData
    ];
    for (var i = 0; i < registries.length; i++) {
      try {
        var bridge = registries[i];
        var resolved = bridge && typeof bridge.resolveCountry === 'function' ? bridge.resolveCountry(value) : null;
        var candidate = id(resolved && (resolved.iso3 || resolved.iso3Code || resolved.countryId || resolved.code || resolved.id));
        if (/^[A-Z]{3}$/.test(candidate)) return candidate;
        var nested = resolved && resolved.identity;
        candidate = id(nested && (nested.iso3 || nested.iso3Code || nested.countryCode || nested.id));
        if (/^[A-Z]{3}$/.test(candidate)) return candidate;
      } catch (_) {}
    }
    var row = null;
    try {
      var general = root.OmegaCountryGeneralDataRuntime || (root.Omega && root.Omega.CountryGeneralData);
      row = general && typeof general.getCountryRecord === 'function' ? general.getCountryRecord(value) : null;
    } catch (_) {}
    var fromRecord = id(row && row.identity && (row.identity.iso3 || row.identity.iso3Code || row.identity.countryCode));
    return /^[A-Z]{3}$/.test(fromRecord) ? fromRecord : null;
  }
  function resourceRules() {
    var rules = root.__OmegaResourceEconomyRules || {};
    var demand = object(rules.demand) || {};
    return object(demand.resourceProfiles) || {};
  }
  function catalogue() {
    return root.OmegaResourceIndustrialCatalogData ||
      (root.Omega && root.Omega.ResourceIndustrialCatalogData) || null;
  }
  function generalDataApi() {
    return root.OmegaCountryGeneralDataRuntime || (root.Omega && root.Omega.CountryGeneralData) || null;
  }
  function factoryBaselineApi() {
    return root.OmegaCountryFactoryStartingBaselineV1 ||
      (root.Omega && root.Omega.CountryFactoryStartingBaselineV1) || null;
  }
  function industrialApi() {
    return root.OmegaResourceIndustrialNetwork ||
      (root.Omega && root.Omega.ResourceIndustrialNetwork) || null;
  }
  function prepare() {
    if (preparePromise) return preparePromise;
    preparePromise = Promise.resolve().then(async function () {
      var baseline = factoryBaselineApi();
      var report = null;
      if (baseline && typeof baseline.init === 'function') report = await baseline.init();
      var network = industrialApi();
      var catalogReport = null;
      if (network && typeof network.loadCatalog === 'function' && !catalogue()) {
        if (!cataloguePromise) cataloguePromise = Promise.resolve(network.loadCatalog());
        catalogReport = await cataloguePromise;
      }
      return {
        status: report && report.status === 'BLOCKED' ? 'PARTIAL' : 'READY',
        factoryBaseline: report || null,
        industrialCatalog: catalogReport || null,
        generalDataAvailable: !!generalDataApi(),
        resourceRulesAvailable: Object.keys(resourceRules()).length > 0
      };
    }).catch(function (error) {
      return { status: 'PARTIAL', reason: String(error && error.message || error) };
    });
    return preparePromise;
  }
  function livePopulation(countryId) {
    var s = state();
    var pop = object(s.population && s.population[countryId]) || {};
    var economy = object(s.economy && s.economy[countryId]) || {};
    var candidates = [
      ['population.totalPopulation', pop.totalPopulation],
      ['population.currentPopulation', pop.currentPopulation],
      ['population.population', pop.population],
      ['population.total', pop.total],
      ['economy.totalPopulation', economy.totalPopulation],
      ['economy.population', economy.population],
      ['economy.demographics.totalPopulation', economy.demographics && economy.demographics.totalPopulation]
    ];
    for (var i = 0; i < candidates.length; i++) {
      var n = finite(candidates[i][1]);
      if (n !== null && n > 0) return {
        value: n, status: 'LIVE_RUNTIME', source: 'Game.state.' + candidates[i][0],
        observationYear: finite(pop.observationYear || pop.year || economy.populationObservationYear),
        sourceId: pop.sourceId || economy.populationSourceId || 'ACTIVE_GAME_RUNTIME',
        confidence: 'RUNTIME_AUTHORITY'
      };
    }
    return null;
  }
  function countryGeneralRecord(countryId) {
    var api = generalDataApi();
    if (!api || typeof api.getCountryRecord !== 'function') return null;
    try { return api.getCountryRecord(countryId); } catch (_) { return null; }
  }
  function resolvePopulation(countryId) {
    var live = livePopulation(countryId);
    if (live) return live;
    var record = countryGeneralRecord(countryId);
    var metrics = object(record && record.metrics) || {};
    var metadata = object(record && record.metricMetadata) || {};
    var currentValue = finite(metrics.populationTotal);
    var currentMeta = object(metadata.populationTotal) || {};
    if (currentValue !== null && currentValue > 0) {
      var year = finite(currentMeta.year);
      var sourceStatus = String(currentMeta.status || '').toUpperCase();
      var isFreshObservation = sourceStatus === 'WORLD_BANK_API_OBSERVATION' && year !== null && year >= 2025;
      return {
        value: currentValue,
        status: isFreshObservation ? 'OBSERVED' : 'STALE_BASELINE',
        source: currentMeta.sourceName || currentMeta.sourceId || 'COUNTRY_GENERAL_DATA_REGISTRY',
        sourceId: currentMeta.sourceId || null,
        sourceUrl: currentMeta.sourceUrl || null,
        observationYear: year,
        sourceStatus: currentMeta.status || 'NOT_RECORDED',
        confidence: finite(currentMeta.confidence),
        note: currentMeta.note || null
      };
    }
    var oldValue = finite(metrics.population2015);
    var oldMeta = object(metadata.population2015) || {};
    if (oldValue !== null && oldValue > 0) return {
      value: oldValue, status: 'STALE_BASELINE',
      source: oldMeta.sourceName || oldMeta.sourceId || 'COUNTRY_GENERAL_DATA_REGISTRY:population2015',
      sourceId: oldMeta.sourceId || null, sourceUrl: oldMeta.sourceUrl || null,
      observationYear: finite(oldMeta.year) || 2015,
      sourceStatus: oldMeta.status || 'LEGACY_BASELINE',
      confidence: finite(oldMeta.confidence), note: oldMeta.note || 'Historical population baseline; not a current estimate.'
    };
    return {
      value: null, status: 'UNKNOWN', source: null, sourceId: null,
      sourceUrl: currentMeta.sourceUrl || null, observationYear: null,
      sourceStatus: currentMeta.status || 'NOT_RECORDED',
      confidence: 0, note: currentMeta.note || 'Population observation unavailable; unknown is not zero.'
    };
  }
  function demographics(countryId, population) {
    var record = countryGeneralRecord(countryId);
    var metrics = object(record && record.metrics) || {};
    var workingPct = finite(metrics.populationAge15To64Pct);
    var urbanPct = finite(metrics.urbanizationPct);
    var dependency = finite(metrics.ageDependencyRatioPct);
    var growth = finite(metrics.populationGrowthPct);
    var metricMetadata = object(record && record.metricMetadata) || {};
    return {
      annualPopulationGrowthPct: growth,
      annualGrowthObservation: clone(metricMetadata.populationGrowthPct || null),
      urbanPopulationPct: urbanPct,
      urbanPopulationObservation: clone(metricMetadata.urbanizationPct || null),
      workingAgePopulationPct: workingPct,
      workingAgePopulation: population.value !== null && workingPct !== null
        ? population.value * workingPct / 100 : null,
      workingAgePopulationObservation: clone(metricMetadata.populationAge15To64Pct || null),
      dependencyRatioPct: dependency,
      dependencyRatioObservation: clone(metricMetadata.ageDependencyRatioPct || null)
    };
  }
  function getPer100kRateCatalog() {
    var demandRules = object((root.__OmegaResourceEconomyRules || {}).demand) || {};
    var profiles = object(demandRules.resourceProfiles) || {};
    return Object.keys(profiles).sort().map(function (resourceId) {
      var profile = object(profiles[resourceId]) || {};
      var rate = finite(profile.basePerMillionPopulation);
      var calibrated = rate !== null && rate > 0;
      return {
        resourceId: resourceId,
        unit: profile.unit || null,
        ratePerMillionPerDay: calibrated ? rate : null,
        ratePer100kPerDay: calibrated ? rate / 10 : null,
        status: calibrated ? 'CALIBRATED_FROM_EXISTING_RULE' : 'RATE_NOT_CALIBRATED',
        source: calibrated ? 'resource_economy_rules.json:demand.resourceProfiles.' + resourceId + '.basePerMillionPopulation' : null,
        sourceUnitBasis: calibrated ? 'PER_MILLION_POPULATION_PER_DAY' : null,
        standardPopulation: 100000,
        simulationOnly: true,
        ruleVersion: demandRules.ruleVersion || null
      };
    });
  }
  function calculatePopulationDemand(population, rates) {
    return (Array.isArray(rates) ? rates : getPer100kRateCatalog()).map(function (row) {
      if (population.value === null) return Object.assign({}, clone(row), {
        population: null, populationMultiplierPer100k: null, quantityPerDay: null,
        calculationStatus: 'POPULATION_UNKNOWN'
      });
      if (row.status !== 'CALIBRATED_FROM_EXISTING_RULE') return Object.assign({}, clone(row), {
        population: population.value, populationMultiplierPer100k: population.value / 100000,
        quantityPerDay: null, calculationStatus: 'RATE_NOT_CALIBRATED'
      });
      var quantity = (population.value / 100000) * row.ratePer100kPerDay;
      return Object.assign({}, clone(row), {
        population: population.value,
        populationMultiplierPer100k: population.value / 100000,
        quantityPerDay: quantity,
        calculationStatus: 'CALCULATED'
      });
    });
  }
  function baselineFor(countryId) {
    var api = factoryBaselineApi();
    if (!api || typeof api.getCountryBaseline !== 'function') return null;
    try { return api.getCountryBaseline(countryId); } catch (_) { return null; }
  }
  function statusBucket(status) {
    var value = id(status);
    if (value === 'OPERATIONAL' || value === 'ACTIVE' || value === 'RUNNING' || value === 'COMMISSIONED') return 'operational';
    if (value === 'UNDER_CONSTRUCTION' || value === 'CONSTRUCTION' || value === 'BUILDING') return 'underConstruction';
    if (value === 'MAINTENANCE' || value === 'REPAIR' || value === 'UNDER_MAINTENANCE') return 'maintenance';
    if (value === 'PAUSED' || value === 'SUSPENDED') return 'paused';
    if (value === 'OFFLINE' || value === 'CLOSED' || value === 'STOPPED' || value === 'FAILED' || value === 'BLOCKED') return 'offline';
    if (value === 'DECOMMISSIONED' || value === 'DESTROYED' || value === 'CANCELLED' || value === 'CANCELED') return 'decommissioned';
    return 'unknown';
  }
  function ownershipBucket(asset) {
    var value = id(asset && (asset.ownerType || asset.ownershipType || asset.ownerCategory || asset.companyType));
    if (value.indexOf('STATE') >= 0 || value.indexOf('GOVERNMENT') >= 0 || value.indexOf('PUBLIC') >= 0) return 'governmentOwned';
    if (value.indexOf('PRIVATE') >= 0) return 'privateOwned';
    if (asset && (asset.ownerCompanyId || asset.ownerId)) return 'ownershipUnclassified';
    return 'ownershipUnclassified';
  }
  function capacityOf(asset) {
    var candidates = [asset && asset.ratedCapacityPerDay, asset && asset.capacityPerDay,
      asset && asset.productionCapacity, asset && asset.capacity, asset && asset.throughputPerDay];
    for (var i = 0; i < candidates.length; i++) {
      var n = finite(candidates[i]);
      if (n !== null && n >= 0) return n;
    }
    return null;
  }
  function utilizationOf(asset) {
    var candidates = [asset && asset.operatingUtilizationRatio, asset && asset.utilizationRatio,
      asset && asset.capacityUtilization, asset && asset.utilization];
    for (var i = 0; i < candidates.length; i++) {
      var n = finite(candidates[i]);
      if (n !== null) return n >= 0 && n <= 1 ? n : null;
    }
    var pct = finite(asset && (asset.operatingUtilizationPct != null
      ? asset.operatingUtilizationPct : asset.utilizationPct));
    return pct !== null && pct >= 0 && pct <= 100 ? pct / 100 : null;
  }
  function factoryType(asset) {
    return id(asset && (asset.factoryType || asset.type || asset.facilityType));
  }
  function authoritativeOutput(resource, turn) {
    var ledger = Array.isArray(resource && resource.finishedGoodsLedger) ? resource.finishedGoodsLedger : [];
    var seen = Object.create(null), totals = {}, transactionIds = [];
    ledger.forEach(function (row) {
      if (!row || finite(row.turn) !== turn) return;
      var transactionId = String(row.transactionId || '').trim();
      if (!transactionId || seen[transactionId]) return;
      seen[transactionId] = true;
      transactionIds.push(transactionId);
      var outputs = object(row.outputQuantities) || {};
      Object.keys(outputs).forEach(function (resourceId) {
        var quantity = finite(outputs[resourceId]);
        if (quantity !== null && quantity > 0) totals[resourceId] = (totals[resourceId] || 0) + quantity;
      });
    });
    return {
      status: ledger.length ? 'OBSERVED_LEDGER' : 'NO_LEDGER_ENTRIES',
      authority: 'resource.finishedGoodsLedger',
      byProduct: totals,
      transactionCount: transactionIds.length,
      transactionIds: transactionIds
    };
  }
  function activeFactoryDemand(resource) {
    var runtime = object(resource && resource.demandRuntime) || {};
    var byResource = object(runtime.byResource) || {};
    var rows = {};
    Object.keys(byResource).forEach(function (resourceId) {
      var entry = object(byResource[resourceId]) || {};
      var factoryDemand = finite(entry.activeFactoryInputDemandPerDay);
      if (factoryDemand === null) factoryDemand = finite(entry.completedFactoryInputRatePerDay);
      rows[resourceId] = {
        resourceId: resourceId,
        factoryInputDemandPerDay: factoryDemand,
        existingNationalDemandPerDay: finite(entry.demandPerDay != null ? entry.demandPerDay : entry.demand),
        factoryConsumption: finite(entry.factoryConsumption),
        nationalConsumption: finite(entry.nationalConsumption),
        fulfilledDemand: finite(entry.fulfilledDemand),
        unmetDemand: finite(entry.unmetDemand),
        inventoryBefore: finite(entry.inventoryBefore),
        inventoryAfter: finite(entry.inventoryAfter),
        protectedStock: finite(entry.protectedStock),
        spendableStockAfter: finite(entry.spendableStockAfter),
        stockCoverageDays: finite(entry.stockCoverageDays),
        stockCoverageTargetDays: finite(entry.stockCoverageTargetDays),
        lowStockCoverage: typeof entry.lowStockCoverage === 'boolean' ? entry.lowStockCoverage : null,
        pendingImportQuantity: finite(entry.pendingImportQuantity),
        unresolvedImportRequestCount: finite(entry.unresolvedImportRequestCount),
        inboundShipmentQuantity: null,
        inboundShipmentEvidenceStatus: 'NOT_EXPOSED_BY_NATIONAL_DEMAND_RUNTIME',
        source: 'resource.demandRuntime.byResource',
        overlapPolicy: 'EXISTING_NATIONAL_DEMAND_RUNTIME_AUTHORITY'
      };
    });
    return rows;
  }
  function factoryCapacityProfile(type, profiles) {
    var profile = object(profiles && profiles[type]) || {};
    var network = industrialApi();
    var requirements = null;
    try {
      if (network && typeof network.factoryProductionRequirements === 'function') {
        requirements = network.factoryProductionRequirements(type);
      }
    } catch (_) {}
    var capacity = finite(profile.defaultCapacityPerDay);
    if (capacity === null && requirements && requirements.status === 'READY') {
      capacity = finite(requirements.ratedCapacityPerDay);
    }
    var unit = (requirements && requirements.status === 'READY' && requirements.outputUnit) ||
      profile.outputUnit || profile.capacityUnit || 'SIMULATION_RESOURCE_UNIT';
    return {
      capacityPerFactoryPerDay: capacity,
      unit: unit,
      status: capacity !== null && capacity > 0 ? 'PROFILE_CAPACITY_AVAILABLE' : 'CAPACITY_PROFILE_UNAVAILABLE',
      authority: capacity !== null && capacity > 0
        ? (profile.authority || 'OMEGA_FACTORY_PRODUCTION_REQUIREMENTS_V1') : null
    };
  }
  function factorySummary(countryId, baseline) {
    var baselineCounts = object(baseline && baseline.factoryCounts) || {};
    var factoryTypeIds = Object.keys(baselineCounts).sort();
    var startingUnits = finite(baseline && baseline.totalStartingFactoryUnits);
    var selected = playerCountryId();
    var isActive = selected === countryId;
    var s = state();
    var economy = isActive ? object(s.economy && s.economy[countryId]) || {} : {};
    var assets = isActive && Array.isArray(economy.productionAssets) ? economy.productionAssets : [];
    var eligibleAssets = assets.filter(function (asset) {
      return factoryTypeIds.indexOf(factoryType(asset)) >= 0;
    });
    var statuses = { operational: 0, underConstruction: 0, maintenance: 0, paused: 0,
      offline: 0, decommissioned: 0, unknown: 0 };
    var ownership = { governmentOwned: 0, privateOwned: 0, ownershipUnclassified: 0 };
    var workers = 0, workersCount = 0;
    eligibleAssets.forEach(function (asset) {
      var status = statusBucket(asset.status);
      statuses[status] += 1;
      ownership[ownershipBucket(asset)] += 1;
      var staff = finite(asset.currentWorkers != null ? asset.currentWorkers :
        (asset.employees != null ? asset.employees : asset.workers));
      if (staff !== null && staff >= 0) { workers += staff; workersCount += 1; }
    });
    var profiles = object(catalogue() && catalogue().factoryProfiles) || {};
    var staticBaselineCapacityByType = {};
    var ratedCapacityByFactoryType = {};
    var effectiveCapacityByFactoryType = {};
    var staticCapacityTypes = 0, liveRatedCapacityTypes = 0, effectiveCapacityTypes = 0;
    factoryTypeIds.forEach(function (type) {
      var baselineCount = finite(baselineCounts[type]);
      var profile = factoryCapacityProfile(type, profiles);
      var staticAvailable = baselineCount !== null && profile.capacityPerFactoryPerDay !== null &&
        baselineCount >= 0 && !!profile.unit;
      staticBaselineCapacityByType[type] = {
        factoryType: type,
        startingFactoryUnits: baselineCount,
        capacityPerFactoryPerDay: profile.capacityPerFactoryPerDay,
        ratedCapacityPerDay: staticAvailable ? baselineCount * profile.capacityPerFactoryPerDay : null,
        unit: staticAvailable ? profile.unit : null,
        status: staticAvailable ? 'SIMULATED_PROFILE_CAPACITY' : 'CAPACITY_PROFILE_UNAVAILABLE',
        authority: staticAvailable ? profile.authority : null,
        simulationOnly: true
      };
      if (staticAvailable) staticCapacityTypes += 1;

      if (!isActive) {
        ratedCapacityByFactoryType[type] = null;
        effectiveCapacityByFactoryType[type] = null;
        return;
      }
      var typeAssets = eligibleAssets.filter(function (asset) { return factoryType(asset) === type; });
      var ratedAssets = typeAssets.filter(function (asset) { return statusBucket(asset.status) !== 'decommissioned'; });
      var operatingAssets = typeAssets.filter(function (asset) { return statusBucket(asset.status) === 'operational'; });
      var unknownStatus = typeAssets.some(function (asset) { return statusBucket(asset.status) === 'unknown'; });
      var unitCandidates = typeAssets.map(function (asset) {
        return String(asset.outputUnit || asset.capacityUnit || asset.throughputUnit || profile.unit || '').trim();
      }).filter(Boolean);
      var uniqueUnits = unitCandidates.filter(function (unit, index) { return unitCandidates.indexOf(unit) === index; });
      var resolvedUnit = uniqueUnits.length === 1 ? uniqueUnits[0] : null;
      var unitConflict = uniqueUnits.length > 1;
      var ratedTotal = 0, ratedKnown = 0, ratedComplete = ratedAssets.length > 0;
      ratedAssets.forEach(function (asset) {
        var capacity = capacityOf(asset);
        if (capacity === null) ratedComplete = false;
        else { ratedTotal += capacity; ratedKnown += 1; }
      });
      var effectiveTotal = 0, effectiveKnown = 0, effectiveComplete = typeAssets.length > 0 && !unknownStatus;
      operatingAssets.forEach(function (asset) {
        var capacity = capacityOf(asset);
        var utilization = utilizationOf(asset);
        if (capacity === null || utilization === null) effectiveComplete = false;
        else { effectiveTotal += capacity * utilization; effectiveKnown += 1; }
      });
      if (unitConflict || !resolvedUnit) {
        ratedComplete = false;
        effectiveComplete = false;
      }
      ratedCapacityByFactoryType[type] = {
        factoryType: type,
        ratedCapacityPerDay: ratedComplete ? ratedTotal : null,
        unit: ratedComplete ? resolvedUnit : null,
        assetCount: ratedAssets.length,
        coverage: ratedKnown + '/' + ratedAssets.length,
        status: ratedComplete ? 'OBSERVED_LIVE_ASSET_CAPACITY' :
          (unitConflict ? 'CAPACITY_UNIT_CONFLICT' : 'CAPACITY_EVIDENCE_INCOMPLETE')
      };
      effectiveCapacityByFactoryType[type] = {
        factoryType: type,
        effectiveCapacityPerDay: effectiveComplete ? effectiveTotal : null,
        unit: effectiveComplete ? resolvedUnit : null,
        operationalAssetCount: operatingAssets.length,
        ratedCapacityCoverage: effectiveKnown + '/' + operatingAssets.length,
        status: effectiveComplete ? 'OBSERVED_OPERATIONAL_CAPACITY' :
          (unknownStatus ? 'FACTORY_STATUS_UNKNOWN' :
            (unitConflict ? 'CAPACITY_UNIT_CONFLICT' : 'UTILIZATION_OR_CAPACITY_UNOBSERVED'))
      };
      if (ratedComplete) liveRatedCapacityTypes += 1;
      if (effectiveComplete) effectiveCapacityTypes += 1;
    });
    var registry = null;
    var baselineApi = factoryBaselineApi();
    try {
      if (isActive && baselineApi && typeof baselineApi.getCountryFactoryRegistry === 'function') {
        var row = baselineApi.getCountryFactoryRegistry(countryId);
        if (row && row.status === 'READY') registry = row;
      }
    } catch (_) {}
    var liveTotal = statuses.operational + statuses.underConstruction + statuses.maintenance +
      statuses.paused + statuses.offline + statuses.unknown;
    var trackedFactoryAssets = liveTotal + statuses.decommissioned;
    return {
      status: baseline ? 'READY' : 'BASELINE_UNAVAILABLE',
      countryId: countryId,
      factoryTypeCount: factoryTypeIds.length,
      factoryTypeIds: factoryTypeIds,
      startingFactoryUnits: startingUnits,
      startingFactoryCounts: clone(baselineCounts),
      startingFactoryAuthority: 'SIMULATED_COUNTRY_STARTING_INDUSTRY_PROFILE_V1',
      simulationOnly: true,
      realWorldFacilityCounts: false,
      staticBaselineCapacityByType: staticBaselineCapacityByType,
      staticBaselineCapacityTypeCoverage: staticCapacityTypes + '/' + factoryTypeIds.length,
      staticBaselineCapacityStatus: staticCapacityTypes === factoryTypeIds.length
        ? 'SIMULATED_TYPE_SPECIFIC_CAPACITY_AVAILABLE' : 'SOME_FACTORY_TYPE_CAPACITY_UNAVAILABLE',
      activePlayerCountry: isActive,
      liveRegistrationStatus: registry && registry.runtimeStatus || (isActive ? 'LIVE_REGISTRY_UNAVAILABLE' : 'STATIC_BASELINE_ONLY'),
      liveFactoryUnits: isActive ? liveTotal : null,
      trackedFactoryAssetCount: isActive ? trackedFactoryAssets : null,
      liveFactoryStatusCounts: isActive ? statuses : null,
      ownershipCounts: isActive ? ownership : null,
      ratedCapacityByFactoryType: isActive ? ratedCapacityByFactoryType : null,
      ratedCapacityTypeCoverage: isActive ? liveRatedCapacityTypes + '/' + factoryTypeIds.length : 'NOT_ACTIVE_COUNTRY',
      effectiveCapacityByFactoryType: isActive ? effectiveCapacityByFactoryType : null,
      effectiveCapacityTypeCoverage: isActive ? effectiveCapacityTypes + '/' + factoryTypeIds.length : 'NOT_ACTIVE_COUNTRY',
      capacityAggregateStatus: 'CROSS_FACTORY_TYPE_UNITS_NOT_ADDITIVE',
      currentWorkers: isActive && workersCount === eligibleAssets.length && eligibleAssets.length > 0 ? workers : null,
      workforceCoverage: isActive ? workersCount + '/' + eligibleAssets.length : 'NOT_ACTIVE_COUNTRY',
      liveAssets: isActive ? eligibleAssets.map(function (asset) {
        return {
          factoryId: asset.id || asset.assetId || asset.projectId || null,
          factoryType: factoryType(asset),
          status: id(asset.status) || 'UNKNOWN',
          ratedCapacityPerDay: capacityOf(asset),
          capacityUnit: asset.outputUnit || asset.capacityUnit || asset.throughputUnit || null,
          utilizationRatio: utilizationOf(asset),
          ownerType: asset.ownerType || asset.ownershipType || null,
          ownerCompanyId: asset.ownerCompanyId || asset.ownerId || null,
          operatorCompanyId: asset.operatorCompanyId || asset.operatorId || null,
          simulationOnly: asset.simulationOnly === true
        };
      }) : null
    };
  }
  function marketQuote(countryId, resourceId) {
    var s = state();
    var trade = object(s.trade && s.trade[countryId]) || {};
    var market = object(trade.marketPrice || trade.marketPrices) || {};
    var key = sameKey(market, resourceId);
    if (key === null) return { status: 'PRICE_UNAVAILABLE', price: null, currency: null, observation: null };
    var raw = market[key], quote = object(raw) || {};
    var price = finite(quote.price != null ? quote.price :
      (quote.value != null ? quote.value : (quote.amount != null ? quote.amount : raw)));
    var currency = quote.currency || quote.currencyCode || trade.marketPriceCurrency ||
      trade.priceCurrency || trade.currencyCode || null;
    var observation = quote.observation || quote.observedAt || quote.observationDate ||
      quote.turn || trade.marketPriceObservation || trade.marketPriceUpdatedAt || null;
    if (price === null || price < 0) return { status: 'PRICE_UNAVAILABLE', price: null, currency: currency, observation: observation };
    if (!currency) return { status: 'CURRENCY_UNAVAILABLE', price: price, currency: null, observation: observation };
    if (!observation) return { status: 'PRICE_OBSERVATION_UNAVAILABLE', price: price, currency: currency, observation: null };
    return { status: 'AVAILABLE', price: price, currency: String(currency), observation: clone(observation) };
  }
  function expenditure(populationDemand) {
    var rows = populationDemand.map(function (row) {
      if (row.calculationStatus !== 'CALCULATED') return Object.assign({}, clone(row), {
        price: null, currency: null, costPerDay: null, costStatus: row.calculationStatus
      });
      var quote = marketQuote(row.countryId || '', row.resourceId);
      var cost = quote.status === 'AVAILABLE' ? row.quantityPerDay * quote.price : null;
      var costPer100k = quote.status === 'AVAILABLE' && finite(row.ratePer100kPerDay) !== null
        ? row.ratePer100kPerDay * quote.price : null;
      return Object.assign({}, clone(row), {
        price: quote.price, currency: quote.currency, priceObservation: quote.observation,
        costPer100kPerDay: costPer100k,
        costPerDay: cost, costStatus: quote.status
      });
    });
    var complete = rows.length > 0 && rows.every(function (row) { return row.costStatus === 'AVAILABLE'; });
    var currencies = rows.filter(function (row) { return row.costStatus === 'AVAILABLE'; })
      .map(function (row) { return row.currency; }).filter(function (value, index, all) { return all.indexOf(value) === index; });
    var oneCurrency = currencies.length === 1;
    return {
      status: complete && oneCurrency ? 'COMPLETE' : (currencies.length > 1 ? 'MIXED_CURRENCY' : 'INCOMPLETE'),
      totalCostPerDay: complete && oneCurrency
        ? rows.reduce(function (sum, row) { return sum + row.costPerDay; }, 0) : null,
      currency: oneCurrency ? currencies[0] : null,
      rows: rows
    };
  }
  function createProvenanceSnapshot(summary, rates) {
    var population = summary.population || {};
    var demandRules = object((root.__OmegaResourceEconomyRules || {}).demand) || {};
    var economyRules = object(root.__OmegaResourceEconomyRules) || {};
    var rateRows = (rates || []).map(function (row) {
      return {
        resourceId: row.resourceId,
        ratePer100kPerDay: row.ratePer100kPerDay,
        unit: row.unit,
        status: row.status
      };
    });
    var priceRows = (summary.expenditure.populationConsumption.rows || []).map(function (row) {
      return {
        resourceId: row.resourceId,
        price: row.price,
        currency: row.currency,
        priceObservation: row.priceObservation,
        costStatus: row.costStatus
      };
    });
    var inputEvidence = {
      runtimeVersion: VERSION,
      countryId: summary.countryId,
      turn: summary.turn,
      population: {
        value: population.value,
        status: population.status,
        source: population.source,
        sourceId: population.sourceId,
        observationYear: population.observationYear,
        sourceStatus: population.sourceStatus
      },
      rateVersion: demandRules.ruleVersion || economyRules.schemaVersion || 'UNVERSIONED',
      rateRows: rateRows,
      factoryBaseline: {
        startingFactoryUnits: summary.factories.startingFactoryUnits,
        startingFactoryCounts: summary.factories.startingFactoryCounts,
        staticCapacityByType: summary.factories.staticBaselineCapacityByType
      },
      liveFactories: summary.factories.activePlayerCountry ? summary.factories.liveAssets : null,
      factoryDemand: summary.factoryDemand.byResource,
      nationalDemand: summary.nationalRequirement.byResource,
      production: {
        status: summary.production.status,
        transactionIds: summary.production.transactionIds,
        outputs: summary.production.outputByProductThisTurn
      },
      prices: priceRows
    };
    var rateFingerprint = fingerprint({
      ruleVersion: inputEvidence.rateVersion,
      standardBasis: 'COMMON_DAILY_RATE_PER_100K',
      rows: rateRows
    });
    return {
      schemaVersion: 1,
      runtimeVersion: VERSION,
      countryId: summary.countryId,
      turn: summary.turn,
      population: {
        value: population.value,
        status: population.status,
        source: population.source || null,
        sourceId: population.sourceId || null,
        observationYear: population.observationYear || null,
        sourceStatus: population.sourceStatus || null
      },
      rates: {
        version: inputEvidence.rateVersion,
        basis: 'COMMON_DAILY_RATE_PER_100K',
        resourceProfileCount: rateRows.length,
        calibratedCount: rateRows.filter(function (row) { return row.status === 'CALIBRATED_FROM_EXISTING_RULE'; }).length,
        uncalibratedCount: rateRows.filter(function (row) { return row.status === 'RATE_NOT_CALIBRATED'; }).length,
        fingerprint: rateFingerprint
      },
      authorities: {
        population: 'OmegaCountryGeneralDataRuntime',
        factoryBaseline: 'OmegaCountryFactoryStartingBaselineV1',
        liveFactories: summary.factories.activePlayerCountry ? 'Game.state.economy[countryId].productionAssets' : 'STATIC_BASELINE_ONLY',
        factoryDemand: summary.factories.activePlayerCountry ? 'Game.state.resource[countryId].demandRuntime' : 'NOT_ACTIVE_COUNTRY',
        nationalDemand: 'OmegaResourceNationalDemandRuntime',
        production: 'Game.state.resource[countryId].finishedGoodsLedger',
        prices: 'Game.state.trade[countryId].marketPrice'
      },
      calculation: {
        populationDemandFormula: '(population / 100000) * ratePer100kPerDay',
        factoryPopulationDemandOverlap: 'EXISTING_NATIONAL_DEMAND_RUNTIME_ONLY',
        capacityAggregation: 'BY_FACTORY_TYPE_ONLY',
        monetaryCost: 'QUANTITY_TIMES_OBSERVED_PRICE_WITH_CURRENCY_AND_TIME'
      },
      inputFingerprint: fingerprint(inputEvidence)
    };
  }
  function loadProvenanceSnapshot(snapshot) {
    lastProvenanceSnapshot = null;
    restoredProvenanceSnapshot = null;
    if (snapshot === null || snapshot === undefined) return { status: 'NO_SNAPSHOT' };
    var saved = object(snapshot);
    if (!saved || saved.schemaVersion !== 1 || !/^[A-Z]{3}$/.test(id(saved.countryId)) ||
        typeof saved.inputFingerprint !== 'string' || !/^[a-f0-9]{8}$/i.test(saved.inputFingerprint)) {
      return { status: 'INVALID_SNAPSHOT', reason: 'PHASE6_PROVENANCE_SCHEMA_INVALID' };
    }
    restoredProvenanceSnapshot = clone(saved);
    return {
      status: 'PENDING_REVALIDATION',
      countryId: saved.countryId,
      turn: finite(saved.turn),
      inputFingerprint: saved.inputFingerprint
    };
  }
  function getNationalSummary(countryValue) {
    var countryId = canonicalCountry(countryValue);
    if (!countryId) return Promise.resolve({ status: 'BLOCKED', reason: 'COUNTRY_ISO3_REQUIRED' });
    return prepare().then(async function (prepared) {
      var general = generalDataApi();
      if (general && typeof general.init === 'function') {
        try { await general.init(countryId); } catch (_) {}
      }
      var population = resolvePopulation(countryId);
      var baseline = baselineFor(countryId);
      var rates = getPer100kRateCatalog();
      var populationDemand = calculatePopulationDemand(population, rates);
      var factories = factorySummary(countryId, baseline);
      var s = state();
      var resource = object(s.resource && s.resource[countryId]) || {};
      var demandRows = factories.activePlayerCountry ? activeFactoryDemand(resource) : {};
      var byResource = {};
      populationDemand.forEach(function (row) {
        var demand = demandRows[row.resourceId] || demandRows[Object.keys(demandRows).find(function (key) {
          return token(key) === token(row.resourceId);
        })] || null;
        byResource[row.resourceId] = Object.assign({}, clone(row), {
          factoryInputDemandPerDay: demand ? demand.factoryInputDemandPerDay : null,
          existingNationalDemandPerDay: demand ? demand.existingNationalDemandPerDay : null,
          factoryConsumption: demand ? demand.factoryConsumption : null,
          nationalConsumption: demand ? demand.nationalConsumption : null,
          unmetDemand: demand ? demand.unmetDemand : null,
          fulfilledDemand: demand ? demand.fulfilledDemand : null,
          inventoryBefore: demand ? demand.inventoryBefore : null,
          inventoryAfter: demand ? demand.inventoryAfter : null,
          protectedStock: demand ? demand.protectedStock : null,
          spendableStockAfter: demand ? demand.spendableStockAfter : null,
          stockCoverageDays: demand ? demand.stockCoverageDays : null,
          stockCoverageTargetDays: demand ? demand.stockCoverageTargetDays : null,
          lowStockCoverage: demand ? demand.lowStockCoverage : null,
          pendingImportQuantity: demand ? demand.pendingImportQuantity : null,
          unresolvedImportRequestCount: demand ? demand.unresolvedImportRequestCount : null,
          inboundShipmentQuantity: null,
          inboundShipmentEvidenceStatus: 'NOT_EXPOSED_BY_NATIONAL_DEMAND_RUNTIME',
          combinedDemandStatus: demand ? 'EXISTING_RUNTIME_VALUE' : 'NOT_AVAILABLE',
          combinedDemandAuthority: demand ? demand.source : null,
          overlapPolicy: demand ? demand.overlapPolicy : 'NOT_RECOMPUTED_TO_AVOID_DOUBLE_COUNTING'
        });
      });
      Object.keys(demandRows).forEach(function (key) {
        if (byResource[key]) return;
        byResource[key] = Object.assign({ resourceId: key, ratePer100kPerDay: null,
          quantityPerDay: null, calculationStatus: 'NO_POPULATION_RATE_PROFILE' }, clone(demandRows[key]));
      });
      var output = factories.activePlayerCountry
        ? authoritativeOutput(resource, currentTurn())
        : { status: 'NOT_ACTIVE_COUNTRY', authority: 'resource.finishedGoodsLedger', byProduct: null, transactionCount: null, transactionIds: [] };
      var expenseRows = populationDemand.map(function (row) {
        return Object.assign({ countryId: countryId }, clone(row));
      });
      var populationExpenditure = expenditure(expenseRows);
      var operating = object((root.__OmegaResourceEconomyRules || {}).companyOperatingCosts) || null;
      var summary = {
        version: VERSION,
        status: 'READY',
        countryId: countryId,
        turn: currentTurn(),
        population: Object.assign({}, clone(population), demographics(countryId, population)),
        factories: factories,
        consumption: {
          standardBasis: 'COMMON_DAILY_RATE_PER_100K',
          populationDemandOnly: true,
          rows: populationDemand
        },
        factoryDemand: {
          status: factories.activePlayerCountry ? 'ACTIVE_COUNTRY_RUNTIME_EVIDENCE' : 'STATIC_BASELINE_ONLY',
          byResource: factories.activePlayerCountry ? demandRows : null,
          note: 'Factory recipe inputs remain distinct from population demand.'
        },
        nationalRequirement: {
          byResource: byResource,
          combinationPolicy: 'USE_EXISTING_NATIONAL_DEMAND_RUNTIME_ONLY',
          sumPopulationAndFactoryDemand: false
        },
        production: {
          status: output.status,
          authority: output.authority,
          outputByProductThisTurn: output.byProduct,
          uniqueTransactionCount: output.transactionCount,
          transactionIds: output.transactionIds
        },
        expenditure: {
          populationConsumption: populationExpenditure,
          factoryOperatingCost: {
            status: 'NOT_FINALIZED',
            totalCostPerDay: null,
            currency: null,
            costDefaults: operating ? clone(operating) : null,
            note: 'Simulation defaults are not a posted country expense. Actual employment, utility use, material prices and currency evidence are required.'
          },
          treasuryActualExpense: {
            status: 'NOT_ESTABLISHED',
            amount: null,
            note: 'Modeled consumption cost is not a Treasury journal posting.'
          }
        },
        dataCoverage: {
          populationStatus: population.status,
          populationSource: population.source || null,
          populationObservationYear: population.observationYear || null,
          calibratedRateCount: rates.filter(function (row) { return row.status === 'CALIBRATED_FROM_EXISTING_RULE'; }).length,
          uncalibratedRateCount: rates.filter(function (row) { return row.status === 'RATE_NOT_CALIBRATED'; }).length,
          resourceProfileCount: rates.length,
          factoryBaselineStatus: baseline ? 'READY' : 'UNAVAILABLE',
          startingFactoryUnits: factories.startingFactoryUnits,
          factoryTypeCount: factories.factoryTypeCount,
          activeCountryDetailedRuntime: factories.activePlayerCountry
        },
        preparation: prepared
      };
      var provenance = createProvenanceSnapshot(summary, rates);
      summary.provenance = provenance;
      if (restoredProvenanceSnapshot && restoredProvenanceSnapshot.countryId === countryId) {
        if (finite(restoredProvenanceSnapshot.turn) !== finite(summary.turn)) {
          summary.saveLoadValidation = {
            status: 'RECOMPUTED_AFTER_TURN_CHANGE',
            savedTurn: finite(restoredProvenanceSnapshot.turn),
            currentTurn: summary.turn
          };
        } else {
          summary.saveLoadValidation = {
            status: restoredProvenanceSnapshot.inputFingerprint === provenance.inputFingerprint
              ? 'REVALIDATED' : 'INVALIDATED_SOURCE_CHANGED',
            savedTurn: finite(restoredProvenanceSnapshot.turn),
            currentTurn: summary.turn,
            fingerprintMatched: restoredProvenanceSnapshot.inputFingerprint === provenance.inputFingerprint
          };
        }
        restoredProvenanceSnapshot = null;
      } else {
        summary.saveLoadValidation = { status: 'NO_RESTORED_SNAPSHOT' };
      }
      lastProvenanceSnapshot = clone(provenance);
      return summary;
    });
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char];
    });
  }
  function formatNumber(value, digits) {
    return value === null || value === undefined || !Number.isFinite(Number(value))
      ? 'UNKNOWN' : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits == null ? 2 : digits });
  }
  function renderSummary(summary) {
    if (!summary || summary.status !== 'READY') {
      return '<section data-omega-phase6-summary style="margin-top:12px;padding:12px;border:1px solid #334155;border-radius:12px;background:#0b1220;color:#cbd5e1"><strong>National Population & Industrial Capacity</strong><div style="margin-top:6px">Data unavailable: ' +
        escapeHtml(summary && summary.reason || 'WAITING_FOR_COUNTRY_DATA') + '</div></section>';
    }
    var pop = summary.population, factories = summary.factories;
    var rows = summary.consumption.rows;
    var calibrated = rows.filter(function (row) { return row.calculationStatus === 'CALCULATED'; });
    var unknown = rows.filter(function (row) { return row.calculationStatus !== 'CALCULATED'; });
    var expenditure = summary.expenditure.populationConsumption;
    var expenseByResource = {};
    (expenditure.rows || []).forEach(function (row) { expenseByResource[row.resourceId] = row; });
    var resourceRows = calibrated.map(function (row) {
      var cost = expenseByResource[row.resourceId] || {};
      return '<tr><td>' + escapeHtml(row.resourceId) + '</td><td>' + formatNumber(row.ratePer100kPerDay, 5) + '</td><td>' +
        formatNumber(row.quantityPerDay, 3) + '</td><td>' + escapeHtml(row.unit || 'UNIT_UNSPECIFIED') + '</td><td>' +
        formatNumber(cost.costPer100kPerDay, 3) + ' ' + escapeHtml(cost.currency || '') + '</td><td>' +
        formatNumber(cost.costPerDay, 2) + ' ' + escapeHtml(cost.currency || '') + '</td><td>' +
        escapeHtml(cost.costStatus || 'PRICE_UNAVAILABLE') + '</td></tr>';
    }).join('');
    var reconciliationRows = Object.keys(summary.nationalRequirement.byResource || {}).map(function (resourceId) {
      var row = summary.nationalRequirement.byResource[resourceId];
      if (row.existingNationalDemandPerDay === null && row.inventoryAfter === null &&
          row.factoryInputDemandPerDay === null && row.unmetDemand === null) return '';
      return '<tr><td>' + escapeHtml(resourceId) + '</td><td style="text-align:right">' +
        formatNumber(row.quantityPerDay, 3) + '</td><td style="text-align:right">' +
        formatNumber(row.factoryInputDemandPerDay, 3) + '</td><td style="text-align:right">' +
        formatNumber(row.existingNationalDemandPerDay, 3) + '</td><td style="text-align:right">' +
        formatNumber(row.inventoryAfter, 3) + '</td><td style="text-align:right">' +
        formatNumber(row.pendingImportQuantity, 3) + '</td><td style="text-align:right">' +
        formatNumber(row.unmetDemand, 3) + '</td><td style="text-align:right">' +
        formatNumber(row.stockCoverageDays, 2) + '</td></tr>';
    }).filter(Boolean).join('');
    var productionRows = summary.production.outputByProductThisTurn
      ? Object.keys(summary.production.outputByProductThisTurn).sort().map(function (resourceId) {
        return '<tr><td>' + escapeHtml(resourceId) + '</td><td style="text-align:right">' +
          formatNumber(summary.production.outputByProductThisTurn[resourceId], 3) + '</td></tr>';
      }).join('') : '';
    var factoryStatus = factories.liveFactoryStatusCounts || {};
    var ownership = factories.ownershipCounts || {};
    var factoryStatusText = factories.activePlayerCountry
      ? 'Operational ' + formatNumber(factoryStatus.operational, 0) +
        ' · Under construction ' + formatNumber(factoryStatus.underConstruction, 0) +
        ' · Maintenance ' + formatNumber(factoryStatus.maintenance, 0) +
        ' · Paused ' + formatNumber(factoryStatus.paused, 0) +
        ' · Offline ' + formatNumber(factoryStatus.offline, 0) +
        ' · Decommissioned ' + formatNumber(factoryStatus.decommissioned, 0) +
        ' · Ownership: Government ' + formatNumber(ownership.governmentOwned, 0) +
        ', Private ' + formatNumber(ownership.privateOwned, 0) +
        ', Unclassified ' + formatNumber(ownership.ownershipUnclassified, 0) +
        ' · Observed workers ' + formatNumber(factories.currentWorkers, 0)
      : 'Non-player countries expose static factory baseline only.';
    var factoryRows = Object.keys(factories.startingFactoryCounts || {}).sort().map(function (type) {
      var baselineCapacity = object(factories.staticBaselineCapacityByType && factories.staticBaselineCapacityByType[type]) || {};
      var ratedCapacity = object(factories.ratedCapacityByFactoryType && factories.ratedCapacityByFactoryType[type]) || {};
      var effectiveCapacity = object(factories.effectiveCapacityByFactoryType && factories.effectiveCapacityByFactoryType[type]) || {};
      return '<tr><td>' + escapeHtml(type.replace(/_/g, ' ')) + '</td><td style="text-align:right">' +
        formatNumber(factories.startingFactoryCounts[type], 0) + '</td><td style="text-align:right">' +
        formatNumber(baselineCapacity.ratedCapacityPerDay, 2) + '</td><td>' +
        escapeHtml(baselineCapacity.unit || '') + '</td><td style="text-align:right">' +
        formatNumber(ratedCapacity.ratedCapacityPerDay, 2) + '</td><td style="text-align:right">' +
        formatNumber(effectiveCapacity.effectiveCapacityPerDay, 2) + '</td><td>' +
        escapeHtml(effectiveCapacity.unit || ratedCapacity.unit || baselineCapacity.unit || '') + '</td></tr>';
    }).join('');
    var yearText = pop.observationYear ? String(pop.observationYear) : 'YEAR UNKNOWN';
    var statusText = pop.status === 'STALE_BASELINE' ? 'STALE BASELINE' : pop.status;
    return '<section data-omega-phase6-summary data-country-id="' + escapeHtml(summary.countryId) +
      '" style="margin-top:12px;padding:12px;border-radius:12px;background:linear-gradient(145deg,#0b1220,#14223a);color:#e2e8f0;border:1px solid rgba(96,165,250,.4)">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong style="font-size:14px;color:#f8fafc">National Population & Industrial Capacity</strong>' +
      '<span style="font-size:10px;color:#93c5fd">PHASE 6 · TURN ' + formatNumber(summary.turn, 0) + '</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin-top:10px">' +
      '<div style="padding:9px;border:1px solid #334155;border-radius:9px"><div style="font-size:10px;color:#94a3b8">TOTAL POPULATION</div><strong>' +
      formatNumber(pop.value, 0) + '</strong><div style="font-size:10px;color:#93c5fd">' + escapeHtml(statusText + ' · ' + yearText) + '</div></div>' +
      '<div style="padding:9px;border:1px solid #334155;border-radius:9px"><div style="font-size:10px;color:#94a3b8">STARTING FACTORY UNITS</div><strong>' +
      formatNumber(factories.startingFactoryUnits, 0) + '</strong><div style="font-size:10px;color:#93c5fd">SIMULATION BASELINE · ' +
      formatNumber(factories.factoryTypeCount, 0) + ' TYPES</div></div>' +
      '<div style="padding:9px;border:1px solid #334155;border-radius:9px"><div style="font-size:10px;color:#94a3b8">LIVE FACTORY UNITS</div><strong>' +
      (factories.activePlayerCountry ? formatNumber(factories.liveFactoryUnits, 0) : 'STATIC BASELINE ONLY') +
      '</strong><div style="font-size:10px;color:#93c5fd">' + escapeHtml(factories.liveRegistrationStatus) + '</div></div>' +
      '<div style="padding:9px;border:1px solid #334155;border-radius:9px"><div style="font-size:10px;color:#94a3b8">BASELINE CAPACITY COVERAGE</div><strong>' +
      escapeHtml(factories.staticBaselineCapacityTypeCoverage) + '</strong><div style="font-size:10px;color:#93c5fd">Rated capacity by factory type</div></div>' +
      '<div style="padding:9px;border:1px solid #334155;border-radius:9px"><div style="font-size:10px;color:#94a3b8">LIVE CAPACITY COVERAGE</div><strong>' +
      escapeHtml(factories.activePlayerCountry ? factories.effectiveCapacityTypeCoverage : 'STATIC ONLY') +
      '</strong><div style="font-size:10px;color:#93c5fd">No cross-type unit aggregation</div></div>' +
      '<div style="padding:9px;border:1px solid #334155;border-radius:9px"><div style="font-size:10px;color:#94a3b8">MODELED POPULATION COST / DAY</div><strong>' +
      (expenditure.totalCostPerDay === null ? escapeHtml(expenditure.status) : formatNumber(expenditure.totalCostPerDay, 2) + ' ' + escapeHtml(expenditure.currency)) +
      '</strong><div style="font-size:10px;color:#93c5fd">Not a Treasury posting</div></div></div>' +
      '<div style="font-size:10px;color:#94a3b8;margin-top:8px">Population source: ' + escapeHtml(pop.source || 'NOT RECORDED') +
      ' · 100k multiplier: ' + formatNumber(pop.value === null ? null : pop.value / 100000, 5) +
      ' · Growth: ' + formatNumber(pop.annualPopulationGrowthPct, 3) + '% · Urban: ' + formatNumber(pop.urbanPopulationPct, 2) +
      '% · Working age: ' + formatNumber(pop.workingAgePopulation, 0) +
      ' · Common daily coefficients are simulation rules, not measured real-world household use.</div>' +
      '<div style="font-size:10px;color:#cbd5e1;margin-top:7px">' + escapeHtml(factoryStatusText) + '</div>' +
      '<div style="font-size:10px;color:#94a3b8;margin-top:5px">Rate coverage: ' +
      formatNumber(summary.dataCoverage.calibratedRateCount, 0) + '/' +
      formatNumber(summary.dataCoverage.resourceProfileCount, 0) + ' calibrated; ' +
      formatNumber(summary.dataCoverage.uncalibratedRateCount, 0) + ' explicitly uncalibrated.</div>' +
      '<details style="margin-top:10px;border:1px solid #334155;border-radius:9px"><summary style="padding:9px;cursor:pointer;color:#bfdbfe;font-size:12px;font-weight:700">Population consumption standard (' +
      calibrated.length + ' calibrated · ' + unknown.length + ' unavailable)</summary><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="text-align:left;padding:7px">Resource</th><th style="text-align:right;padding:7px">Per 100k / day</th><th style="text-align:right;padding:7px">Country / day</th><th style="text-align:left;padding:7px">Unit</th><th style="text-align:right;padding:7px">Cost / 100k / day</th><th style="text-align:right;padding:7px">Country cost / day</th><th style="text-align:left;padding:7px">Price status</th></tr></thead><tbody>' +
      resourceRows + '</tbody></table>' + (unknown.length ? '<div style="padding:8px;color:#fbbf24;font-size:10px">Uncalibrated or unavailable: ' +
        escapeHtml(unknown.map(function (row) { return row.resourceId + ' (' + row.calculationStatus + ')'; }).join(', ')) + '</div>' : '') +
      '</div></details><details style="margin-top:8px;border:1px solid #334155;border-radius:9px"><summary style="padding:9px;cursor:pointer;color:#bfdbfe;font-size:12px;font-weight:700">Existing national demand and supply reconciliation</summary><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr><th style="text-align:left;padding:6px">Resource</th><th style="text-align:right;padding:6px">Population/day</th><th style="text-align:right;padding:6px">Factory input/day</th><th style="text-align:right;padding:6px">National/day</th><th style="text-align:right;padding:6px">Stock after</th><th style="text-align:right;padding:6px">Pending import</th><th style="text-align:right;padding:6px">Shortage</th><th style="text-align:right;padding:6px">Coverage days</th></tr></thead><tbody>' +
      reconciliationRows + '</tbody></table><div style="padding:8px;color:#94a3b8;font-size:10px">Pending import requests are not confirmed inbound shipments. Inbound shipment quantity is unavailable unless the existing runtime exposes it.</div></div></details>' +
      '<details style="margin-top:8px;border:1px solid #334155;border-radius:9px"><summary style="padding:9px;cursor:pointer;color:#bfdbfe;font-size:12px;font-weight:700">Current-turn confirmed production</summary><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="text-align:left;padding:7px">Product/resource</th><th style="text-align:right;padding:7px">Output</th></tr></thead><tbody>' +
      productionRows + '</tbody></table><div style="padding:8px;color:#94a3b8;font-size:10px">Ledger source: ' + escapeHtml(summary.production.authority) +
      ' · Transactions: ' + formatNumber(summary.production.uniqueTransactionCount, 0) + '</div></div></details>' +
      '<details style="margin-top:8px;border:1px solid #334155;border-radius:9px"><summary style="padding:9px;cursor:pointer;color:#bfdbfe;font-size:12px;font-weight:700">Factory allocation and type-specific capacity (21 canonical types)</summary><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr><th style="text-align:left;padding:7px">Factory type</th><th style="text-align:right;padding:7px">Starting units</th><th style="text-align:right;padding:7px">Baseline rated/day</th><th style="text-align:left;padding:7px">Unit</th><th style="text-align:right;padding:7px">Live rated/day</th><th style="text-align:right;padding:7px">Effective/day</th><th style="text-align:left;padding:7px">Unit</th></tr></thead><tbody>' +
      factoryRows + '</tbody></table><div style="padding:8px;color:#94a3b8;font-size:10px">Capacity is reported separately for each factory type. Different output units are not added into one misleading national total.</div></div></details><div style="font-size:10px;color:#94a3b8;margin-top:8px">Factory input demand remains separate from population demand. The existing national-demand runtime remains the only combined-demand authority; confirmed inbound shipments are not inferred from pending requests. Factory operating costs and Treasury expense remain unfinalized without evidence.</div></section>';
  }
  function refreshPanel(panel, countryId) {
    getNationalSummary(countryId).then(function (summary) {
      if (panel && panel.isConnected) panel.outerHTML = renderSummary(summary);
    }).catch(function () {});
  }
  function installUi() {
    var ios = root.CountryIOS;
    if (!ios || typeof ios.renderChapter1_Overview !== 'function' || ios.__omegaPhase6NationalSummaryWrapped) return false;
    var original = ios.renderChapter1_Overview;
    ios.renderChapter1_Overview = function () {
      var args = Array.prototype.slice.call(arguments);
      var country = args[0] || this.activeCountry || root.OmegaMinistryViewCountry || playerCountryId() || 'USA';
      var countryId = canonicalCountry(country) || id(country);
      var base = original.apply(this, args);
      var panel = '<section data-omega-phase6-summary data-country-id="' + escapeHtml(countryId) +
        '" style="margin-top:12px;padding:12px;border:1px solid #334155;border-radius:12px;background:#0b1220;color:#cbd5e1"><strong>National Population & Industrial Capacity</strong><div style="margin-top:6px">Loading verified country data…</div></section>';
      Promise.resolve().then(function () {
        var nodes = root.document && root.document.querySelectorAll('[data-omega-phase6-summary][data-country-id="' + countryId + '"]');
        var target = nodes && nodes[nodes.length - 1];
        if (target) refreshPanel(target, countryId);
      });
      return base + panel;
    };
    Object.defineProperty(ios, '__omegaPhase6NationalSummaryWrapped', { value: true });
    return true;
  }
  if (root.document) installUi();
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('OMEGA_READY', installUi, { once: true });
  }

  var API = Object.freeze({
    VERSION: VERSION,
    prepare: prepare,
    getPer100kRateCatalog: getPer100kRateCatalog,
    calculatePopulationDemand: function (countryValue) {
      var countryId = canonicalCountry(countryValue);
      if (!countryId) return { status: 'BLOCKED', reason: 'COUNTRY_ISO3_REQUIRED' };
      var population = resolvePopulation(countryId);
      return { status: 'READY', countryId: countryId, population: population,
        rows: calculatePopulationDemand(population, getPer100kRateCatalog()) };
    },
    getNationalSummary: getNationalSummary,
    renderSummary: renderSummary,
    saveState: function () {
      return lastProvenanceSnapshot ? clone(lastProvenanceSnapshot) : null;
    },
    loadState: loadProvenanceSnapshot,
    diagnostics: function () {
      return {
        version: VERSION,
        prepared: !!preparePromise,
        coreCountryScope: 'REQUESTED_COUNTRY_ONLY',
        detailedFactoryScope: 'ACTIVE_PLAYER_COUNTRY_ONLY',
        populationSource: 'OmegaCountryGeneralDataRuntime',
        factoryBaselineSource: 'OmegaCountryFactoryStartingBaselineV1',
        demandAuthority: 'OmegaResourceNationalDemandRuntime_STATE',
        newSchedulerRegistered: false,
        stateMutation: false,
        resourceProfileCount: Object.keys(resourceRules()).length,
        rateCatalogCount: getPer100kRateCatalog().length,
        uncalibratedRateCount: getPer100kRateCatalog().filter(function (row) { return row.status === 'RATE_NOT_CALIBRATED'; }).length,
        savedProvenanceAvailable: !!lastProvenanceSnapshot,
        restoredProvenancePending: !!restoredProvenanceSnapshot
      };
    }
  });
  root.Omega = root.Omega || {};
  root.Omega.Phase6NationalCapacity = API;
  root.OmegaPhase6NationalCapacity = API;
  if (Object.prototype.hasOwnProperty.call(root, '__OMEGA_PENDING_PHASE6_NATIONAL_CAPACITY_SAVE__')) {
    loadProvenanceSnapshot(root.__OMEGA_PENDING_PHASE6_NATIONAL_CAPACITY_SAVE__);
    try { delete root.__OMEGA_PENDING_PHASE6_NATIONAL_CAPACITY_SAVE__; } catch (_) {
      root.__OMEGA_PENDING_PHASE6_NATIONAL_CAPACITY_SAVE__ = null;
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
