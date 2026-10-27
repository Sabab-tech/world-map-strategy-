/* OMEGA NATIONAL RESOURCE DEMAND BRAIN v1.0.0
 * Rule-driven demand forecasting, inventory-constrained domestic consumption,
 * shortage memory and evidence-gated opponent procurement.
 *
 * Quantities stay in each resource's existing runtime-native unit. This is a
 * gameplay simulation model, not a claim that all global source datasets share
 * one physical unit or one empirical consumption series.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0.0';
  if (g.OmegaResourceNationalDemandRuntime && g.OmegaResourceNationalDemandRuntime.VERSION === VERSION) return;

  var populationData = null;
  var economyData = null;
  var preparePromise = null;
  var prepared = false;
  var prepareErrors = [];

  function finite(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      var parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function token(value) {
    return String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function id(value) { return String(value == null ? '' : value).trim().toUpperCase(); }
  function clone(value, seen) {
    if (value === null || typeof value !== 'object') return value;
    seen = seen || [];
    for (var i = 0; i < seen.length; i++) if (seen[i][0] === value) return seen[i][1];
    var result = Array.isArray(value) ? [] : {};
    seen.push([value, result]);
    Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor' || typeof value[key] === 'function' || value[key] === undefined) return;
      result[key] = clone(value[key], seen);
    });
    return result;
  }
  function state() { return g.Game && g.Game.state ? g.Game.state : (g.gameState || {}); }
  function canonical(value) {
    var bridge = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge ||
      (g.Omega && g.Omega.CanonicalIdentity);
    try {
      var row = bridge && typeof bridge.resolveCountry === 'function' ? bridge.resolveCountry(value) : null;
      if (row && (row.id || row.canonicalId)) return id(row.id || row.canonicalId);
    } catch (_) {}
    return id(value);
  }
  function currentTurn() {
    var s = state();
    var turn = finite(s && s.simulation && s.simulation.turn);
    if (turn === null) turn = finite(s && s.turn);
    if (turn === null) turn = finite(s && s.simulationTurn);
    if (turn === null) turn = finite(g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock && g.Omega.Simulation.clock.turn);
    return turn === null ? 0 : turn;
  }
  function simulationTurnDays() {
    var s = state(), clock = g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock;
    var milliseconds = finite(clock && clock.stepDurationMs);
    if (milliseconds === null) milliseconds = finite(s && s.simulation && s.simulation.stepDurationMs);
    if (milliseconds === null) milliseconds = finite(rules().defaultTurnDurationMs);
    // Match the endowment runtime's daily fallback when no authoritative clock exists.
    if (milliseconds === null || milliseconds <= 0) milliseconds = 86400000;
    return Math.max(1 / 86400000, milliseconds / 86400000);
  }
  function bucket(countryId, domain) {
    var root = state()[domain];
    if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
    var wanted = canonical(countryId);
    if (root[wanted] && typeof root[wanted] === 'object') return root[wanted];
    var keys = Object.keys(root);
    for (var i = 0; i < keys.length; i++) {
      if (canonical(keys[i]) === wanted) return root[keys[i]];
    }
    return null;
  }
  function deep(root, path) {
    var parts = String(path || '').split('.');
    var cursor = root;
    for (var i = 0; i < parts.length; i++) {
      if (cursor == null || !Object.prototype.hasOwnProperty.call(Object(cursor), parts[i])) return undefined;
      cursor = cursor[parts[i]];
    }
    return cursor;
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
  function numericAt(root, paths) {
    for (var i = 0; i < paths.length; i++) {
      var value = finite(deep(root, paths[i]));
      if (value !== null && value >= 0) return { value: value, path: paths[i] };
    }
    return { value: null, path: null };
  }
  function resourceValue(map, resourceId) {
    var rows = object(map);
    if (!rows) return null;
    if (Object.prototype.hasOwnProperty.call(rows, resourceId)) return finite(rows[resourceId]);
    var wanted = token(resourceId);
    var keys = Object.keys(rows);
    for (var i = 0; i < keys.length; i++) if (token(keys[i]) === wanted) return finite(rows[keys[i]]);
    return null;
  }
  function resourceKey(map, resourceId) {
    var rows = object(map);
    if (!rows) return null;
    if (Object.prototype.hasOwnProperty.call(rows, resourceId)) return resourceId;
    var wanted = token(resourceId);
    var keys = Object.keys(rows);
    for (var i = 0; i < keys.length; i++) if (token(keys[i]) === wanted) return keys[i];
    return null;
  }
  function rules() {
    var all = g.__OmegaResourceEconomyRules || {};
    return object(all.demand) || { enabled: false, resourceProfiles: {} };
  }
  function profiles() { return object(rules().resourceProfiles) || {}; }
  function profileFor(resourceId) {
    var all = profiles(), wanted = token(resourceId), keys = Object.keys(all);
    for (var i = 0; i < keys.length; i++) if (token(keys[i]) === wanted) return all[keys[i]];
    return null;
  }
  function datasetRecord(dataset, countryId) {
    if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) return null;
    var keys = Object.keys(dataset), wanted = canonical(countryId);
    for (var i = 0; i < keys.length; i++) {
      if (canonical(keys[i]) === wanted) return { record: dataset[keys[i]], sourceKey: keys[i] };
    }
    return null;
  }
  function loadDataset(path) {
    if (typeof g.fetch !== 'function') return Promise.reject(new Error('FETCH_UNAVAILABLE'));
    return g.fetch(path, { cache: 'no-store' }).then(function (response) {
      if (!response || !response.ok) throw new Error('DATASET_NOT_AVAILABLE:' + path);
      return response.json();
    });
  }
  function prepare() {
    if (prepared) return Promise.resolve(diagnostics());
    if (preparePromise) return preparePromise;
    preparePromise = Promise.all([
      loadDataset('./population.json').then(function (data) { populationData = data; }).catch(function (error) {
        prepareErrors.push({ dataset: 'population.json', reason: String(error && error.message || error) });
      }),
      loadDataset('./economy.json').then(function (data) { economyData = data; }).catch(function (error) {
        prepareErrors.push({ dataset: 'economy.json', reason: String(error && error.message || error) });
      })
    ]).then(function () {
      prepared = true;
      return diagnostics();
    }).catch(function (error) {
      prepareErrors.push({ dataset: 'PREPARE', reason: String(error && error.message || error) });
      prepared = true;
      return diagnostics();
    });
    return preparePromise;
  }

  function populationMetric(countryId) {
    var runtime = bucket(countryId, 'population');
    var hit = numericAt(runtime, [
      'totalPopulation', 'population', 'total', 'populationTotal', 'currentPopulation',
      'demographics.totalPopulation', 'demographics.population'
    ]);
    if (hit.value !== null && hit.value > 0) return { value: hit.value, source: 'RUNTIME_STATE:' + hit.path };
    var economy = bucket(countryId, 'economy');
    hit = numericAt(economy, ['population', 'totalPopulation', 'demographics.population']);
    if (hit.value !== null && hit.value > 0) return { value: hit.value, source: 'RUNTIME_STATE:ECONOMY.' + hit.path };
    var row = datasetRecord(populationData, countryId);
    if (row) {
      hit = numericAt(row.record, ['population_current', 'population', 'population_2015', 'total_population']);
      if (hit.value !== null && hit.value > 0) return { value: hit.value, source: 'STATIC_DATASET:population.json:' + row.sourceKey + '.' + hit.path };
    }
    return { value: null, source: null };
  }
  function gdpMetric(countryId, population) {
    var economy = bucket(countryId, 'economy');
    var hit = numericAt(economy, ['gdp', 'GDP', 'gdpUsd', 'gdpCurrentUsd', 'nominalGdp']);
    if (hit.value !== null && hit.value > 0 && population.value !== null && population.value > 0) {
      return { value: hit.value / population.value, source: 'RUNTIME_STATE:economy.' + hit.path + '/population' };
    }
    var row = datasetRecord(economyData, countryId);
    if (row) {
      hit = numericAt(row.record, ['gdp', 'GDP', 'gdp_usd', 'gdp_current_usd']);
      if (hit.value !== null && hit.value > 0 && population.value !== null && population.value > 0) {
        return { value: hit.value / population.value, source: 'STATIC_DATASET:economy.json:' + row.sourceKey + '.' + hit.path + '/population' };
      }
    }
    return { value: null, source: null };
  }
  function industryMetric(countryId) {
    var economy = bucket(countryId, 'economy') || {};
    var assets = Array.isArray(economy.productionAssets) ? economy.productionAssets : [];
    var capacity = 0, observedAssets = 0;
    assets.forEach(function (asset) {
      if (!asset || ['CLOSED', 'DECOMMISSIONED', 'OFFLINE', 'DESTROYED'].indexOf(id(asset.status)) >= 0) return;
      var value = finite(asset.capacity != null ? asset.capacity :
        (asset.productionCapacity != null ? asset.productionCapacity : asset.throughput));
      if (value !== null && value > 0) { capacity += value; observedAssets++; }
    });
    var hit = numericAt(economy, ['productionCapacity', 'industrialCapacity', 'industry.capacity', 'production', 'industrialOutput']);
    if (observedAssets > 0) return { value: capacity, source: 'RUNTIME_STATE:economy.productionAssets', count: observedAssets };
    if (hit.value !== null && hit.value > 0) return { value: hit.value, source: 'RUNTIME_STATE:economy.' + hit.path };
    return { value: null, source: null };
  }
  function militaryMetric(countryId) {
    var military = bucket(countryId, 'military') || {};
    var hit = numericAt(military, [
      'forceStructure.personnel', 'forceStructure.totalPersonnel', 'activePersonnel',
      'personnel', 'totalPersonnel', 'armedForces.personnel'
    ]);
    if (hit.value !== null) return { value: hit.value, source: 'RUNTIME_STATE:military.' + hit.path };
    var defense = bucket(countryId, 'defense') || {};
    hit = numericAt(defense, ['personnel', 'activePersonnel', 'forceStrength', 'activeStrength']);
    if (hit.value !== null) return { value: hit.value, source: 'RUNTIME_STATE:defense.' + hit.path };
    return { value: null, source: null };
  }
  function marketPrice(countryId, resourceId, trade) {
    var quote = resourceValue(trade && (trade.marketPrice || trade.marketPrices), resourceId);
    if (quote !== null && quote > 0) return { value: quote, source: 'RUNTIME_STATE:trade.marketPrice' };
    var market = g.OmegaGlobalMarket || (g.Omega && g.Omega.GlobalMarket);
    try {
      quote = finite(market && typeof market.localPrice === 'function' ? market.localPrice(canonical(countryId), resourceId) : null);
      if (quote !== null && quote > 0) return { value: quote, source: 'OMEGA_GLOBAL_MARKET' };
    } catch (_) {}
    var engine = g.ResourceMinistryEngine || g.OmegaResourceMinistryEngine || (g.Omega && g.Omega.ResourceMinistryEngine);
    var types = engine && Array.isArray(engine.resourceTypes) ? engine.resourceTypes : [];
    for (var i = 0; i < types.length; i++) {
      if (token(types[i].id || types[i].resourceId || types[i].key) === token(resourceId)) {
        quote = finite(types[i].basePrice != null ? types[i].basePrice : (types[i].referencePrice != null ? types[i].referencePrice : types[i].marketPrice));
        if (quote !== null && quote > 0) return { value: quote, source: 'RESOURCE_CATALOG_REFERENCE_PRICE' };
      }
    }
    return { value: null, source: null };
  }
  function warActive(countryId) {
    var military = bucket(countryId, 'military') || {};
    var foreign = bucket(countryId, 'foreign') || {};
    var relation = bucket(countryId, 'relations') || {};
    if (military.warState === true || military.atWar === true || foreign.warState === true || foreign.atWar === true) return true;
    var relations = foreign.relations || relation;
    if (relations && typeof relations === 'object') {
      var keys = Object.keys(relations);
      for (var i = 0; i < keys.length; i++) {
        var row = relations[keys[i]];
        if (row && (row.war_state === true || row.warState === true || id(row.status) === 'WAR')) return true;
      }
    }
    return false;
  }
  function policyMultiplier(resource, resourceId) {
    var policy = object(resource.demandPolicy) || {};
    var perResource = object(policy.multipliers) || object(policy.resourceMultipliers) || {};
    var specific = resourceValue(perResource, resourceId);
    var base = finite(policy.globalMultiplier != null ? policy.globalMultiplier : resource.demandPolicyMultiplier);
    if (base === null || base <= 0) base = 1;
    if (specific === null || specific <= 0) specific = 1;
    return clamp(base, 0.5, 2) * clamp(specific, 0.5, 2);
  }
  function factoryInputTotals(factoryRows) {
    var totals = {};
    (Array.isArray(factoryRows) ? factoryRows : []).forEach(function (row) {
      var inputs = object(row && row.inputQuantities) || {};
      Object.keys(inputs).forEach(function (resourceId) {
        var quantity = finite(inputs[resourceId]);
        if (quantity !== null && quantity > 0) totals[resourceId] = (totals[resourceId] || 0) + quantity;
      });
    });
    return totals;
  }
  function protectedStock(resource, resourceId) {
    var strategic = object(resource.strategicReserve) || {};
    var map = strategic.availableByResource || strategic.protectedByResource || strategic.minimumByResource ||
      resource.protectedStockByResource || resource.minimumStockByResource;
    var value = resourceValue(map, resourceId);
    return value !== null && value > 0 ? value : 0;
  }
  function pendingImports(countryId, resourceId, trade) {
    var rows = trade && Array.isArray(trade.importRequests) ? trade.importRequests : [];
    var pending = 0;
    rows.forEach(function (row) {
      if (!row || token(row.resourceId) !== token(resourceId)) return;
      var status = id(row.status), stage = id(row.stage);
      if (['SETTLED', 'DELIVERED', 'COMPLETED', 'FULFILLED', 'REJECTED', 'CANCELLED', 'CANCELED', 'FAILED', 'EXPIRED'].indexOf(status) >= 0 ||
          ['SETTLED', 'DELIVERED', 'COMPLETED', 'FULFILLED', 'CANCELLED', 'CANCELED', 'FAILED', 'EXPIRED'].indexOf(stage) >= 0) return;
      var quantity = finite(row.remainingQuantity != null ? row.remainingQuantity : row.quantity);
      if (quantity !== null && quantity > 0) pending += quantity;
    });
    return pending;
  }
  function playerCountryId() {
    var s = state(), session = s.simulation && s.simulation.session || {};
    var player = object(s.player) || {}, playerCountry = object(player.country) || {};
    var simulation = g.Omega && g.Omega.Simulation;
    var simulationPlayer = null;
    try {
      simulationPlayer = simulation && typeof simulation.getPlayerCountryId === 'function'
        ? simulation.getPlayerCountryId() : null;
    } catch (_) {}
    var candidates = [
      session.playerCountryId, simulationPlayer,
      s.playerCountryId, s.playerCountryCode, s.sovereignCountryId, s.countryId,
      player.countryId, player.countryCode, playerCountry.iso3, playerCountry.countryId,
      playerCountry.id, playerCountry.code, playerCountry.name,
      g.Game && (g.Game.playerCountryId || g.Game.playerCountryCode),
      g.OMEGA_PLAYER_COUNTRY_ID
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (typeof candidates[i] === 'string' && candidates[i].trim()) return canonical(candidates[i]);
    }
    // Selected/active UI country is only a fallback, never preferred to a
    // stored sovereign identity. Procurement remains disabled if identity is unknown.
    var selected = [
      s.currentActiveCountry, g.Game && (g.Game.selectedCountryId || g.Game.activeCountry || g.Game.currentActiveCountry),
      g.currentActiveCountry, g.CountryIOS && g.CountryIOS.activeCountry,
      g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry
    ];
    for (var j = 0; j < selected.length; j++) {
      if (typeof selected[j] === 'string' && selected[j].trim()) return canonical(selected[j]);
    }
    return null;
  }
  function dispatch(owner, type, countryId, payload) {
    var mesh = g.OmegaMinistryInteroperability || (g.Omega && g.Omega.MinistryInteroperability);
    if (!mesh || typeof mesh.dispatchCommand !== 'function') return { status: 'UNAVAILABLE', reason: 'MINISTRY_INTEROPERABILITY_UNAVAILABLE' };
    try {
      return mesh.dispatchCommand(owner, type, canonical(countryId), payload || {}, {
        turn: currentTurn(), commandType: type,
        correlationId: payload && (payload.correlationId || payload.decisionId || payload.transactionId) || null
      });
    } catch (error) {
      return { status: 'FAILED', reason: String(error && error.message || error) };
    }
  }
  function formulaFactor(value, reference, elasticity, config) {
    if (value === null || reference === null || value < 0) return { value: 1, available: false, ratio: null };
    var minRatio = finite(config.minContextRatio); if (minRatio === null || minRatio <= 0) minRatio = 0.25;
    var maxRatio = finite(config.maxContextRatio); if (maxRatio === null || maxRatio < minRatio) maxRatio = 4;
    var ratio;
    if (reference === 0) {
      if (value === 0) ratio = 1;
      else {
        var zeroScale = finite(config.zeroReferenceScale); if (zeroScale === null || zeroScale <= 0) zeroScale = 1;
        ratio = clamp(1 + value / zeroScale, minRatio, maxRatio);
      }
    } else ratio = clamp(value / reference, minRatio, maxRatio);
    return { value: Math.pow(ratio, Math.max(-2, Math.min(2, finite(elasticity) === null ? 0 : finite(elasticity)))), available: true, ratio: ratio };
  }
  function referenceContext(resource, countryId, runtime) {
    var prior = object(runtime.referenceContext);
    var pop = populationMetric(countryId), gdp = gdpMetric(countryId, pop), industry = industryMetric(countryId), military = militaryMetric(countryId);
    if (!prior) {
      prior = {
        population: pop.value, populationSource: pop.source,
        gdpPerCapita: gdp.value, gdpSource: gdp.source,
        industry: industry.value, industrySource: industry.source,
        militaryPersonnel: military.value, militarySource: military.source,
        createdTurn: currentTurn()
      };
    } else {
      // If a metric was initially unavailable, its first valid observation becomes
      // the reference. Re-base only once when a static fallback is replaced by live state.
      if ((prior.population == null || prior.populationSource == null) && pop.value !== null) {
        prior.population = pop.value; prior.populationSource = pop.source;
      }
      if ((prior.gdpPerCapita == null || prior.gdpSource == null) && gdp.value !== null) {
        prior.gdpPerCapita = gdp.value; prior.gdpSource = gdp.source;
      }
      if ((prior.industry == null || prior.industrySource == null) && industry.value !== null) {
        prior.industry = industry.value; prior.industrySource = industry.source;
      }
      if ((prior.militaryPersonnel == null || prior.militarySource == null) && military.value !== null) {
        prior.militaryPersonnel = military.value; prior.militarySource = military.source;
      }
      if (prior.populationSource && String(prior.populationSource).indexOf('STATIC_DATASET:') === 0 &&
          pop.source && String(pop.source).indexOf('RUNTIME_STATE:') === 0 && pop.value !== null) {
        prior.population = pop.value; prior.populationSource = pop.source;
      }
      if (prior.gdpSource && String(prior.gdpSource).indexOf('STATIC_DATASET:') === 0 &&
          gdp.source && String(gdp.source).indexOf('RUNTIME_STATE:') === 0 && gdp.value !== null) {
        prior.gdpPerCapita = gdp.value; prior.gdpSource = gdp.source;
      }
      if (prior.industrySource && String(prior.industrySource).indexOf('STATIC_DATASET:') === 0 &&
          industry.source && String(industry.source).indexOf('RUNTIME_STATE:') === 0 && industry.value !== null) {
        prior.industry = industry.value; prior.industrySource = industry.source;
      }
      if (prior.militarySource && String(prior.militarySource).indexOf('STATIC_DATASET:') === 0 &&
          military.source && String(military.source).indexOf('RUNTIME_STATE:') === 0 && military.value !== null) {
        prior.militaryPersonnel = military.value; prior.militarySource = military.source;
      }
    }
    return { reference: prior, current: { population: pop, gdpPerCapita: gdp, industry: industry, militaryPersonnel: military } };
  }

  function calculateDemand(input) {
    var config = input.config || {};
    var defaults = object(config.defaultElasticities) || {};
    var profile = object(input.profile) || {};
    var factors = {};
    var unknown = [];
    var population = formulaFactor(input.current.population, input.reference.population,
      profile.populationElasticity != null ? profile.populationElasticity : defaults.population, config);
    var gdp = formulaFactor(input.current.gdpPerCapita, input.reference.gdpPerCapita,
      profile.gdpPerCapitaElasticity != null ? profile.gdpPerCapitaElasticity : defaults.gdpPerCapita, config);
    var industry = formulaFactor(input.current.industry, input.reference.industry,
      profile.industryElasticity != null ? profile.industryElasticity : defaults.industry, config);
    var military = formulaFactor(input.current.militaryPersonnel, input.reference.militaryPersonnel,
      profile.militaryElasticity != null ? profile.militaryElasticity : defaults.military, config);
    var priceFactor = 1;
    if (input.currentPrice !== null && input.referencePrice !== null && input.currentPrice > 0 && input.referencePrice > 0) {
      var priceMin = finite(config.priceFactorMin); if (priceMin === null || priceMin <= 0) priceMin = 0.65;
      var priceMax = finite(config.priceFactorMax); if (priceMax === null || priceMax < priceMin) priceMax = 1.25;
      var pRatio = clamp(input.currentPrice / input.referencePrice, 0.1, 10);
      var elasticity = profile.priceElasticity != null ? finite(profile.priceElasticity) : finite(defaults.price);
      priceFactor = clamp(Math.pow(pRatio, -(elasticity === null ? 0 : elasticity)), priceMin, priceMax);
      factors.price = { ratio: pRatio, multiplier: priceFactor, source: input.priceSource || 'RUNTIME_PRICE' };
    } else {
      factors.price = { ratio: null, multiplier: 1, source: null };
      unknown.push('MARKET_PRICE');
    }
    function addFactor(name, row) {
      factors[name] = { ratio: row.ratio, multiplier: row.value, available: row.available };
      if (!row.available) unknown.push(name.toUpperCase());
    }
    addFactor('population', population);
    addFactor('gdpPerCapita', gdp);
    addFactor('industry', industry);
    addFactor('military', military);
    var policy = clamp(finite(input.policyMultiplier) === null ? 1 : finite(input.policyMultiplier), 0.25, 4);
    var wartime = input.warActive ? Math.max(1, finite(profile.wartimeMultiplier) === null ? finite(config.wartimeMultiplier) || 1.2 : finite(profile.wartimeMultiplier)) : 1;
    factors.policy = { multiplier: policy };
    factors.wartime = { multiplier: wartime, active: !!input.warActive };
    var factor = population.value * gdp.value * industry.value * military.value * priceFactor * policy * wartime;
    var minFactor = finite(config.minFactor); if (minFactor === null || minFactor <= 0) minFactor = 0.2;
    var maxFactor = finite(config.maxFactor); if (maxFactor === null || maxFactor < minFactor) maxFactor = 5;
    factor = clamp(factor, minFactor, maxFactor);
    return {
      demand: Math.max(0, input.baselineRate * factor),
      baselineRate: input.baselineRate,
      totalFactor: factor,
      factors: factors,
      unknownFactors: unknown,
      reference: clone(input.reference),
      current: {
        population: input.current.population,
        gdpPerCapita: input.current.gdpPerCapita,
        industry: input.current.industry,
        militaryPersonnel: input.current.militaryPersonnel
      }
    };
  }
  function baselineFor(resourceId, resource, profile, runtime, metrics, factoryInput) {
    var map = object(runtime.baselineByResource) || {};
    var existing = map[resourceId];
    if (existing && finite(existing.rate) !== null && finite(existing.rate) >= 0) {
      var cached = clone(existing);
      // Preserve legacy rates, but disclose that the old source label omitted whether the
      // domestic-use share was observed, profile-derived, or supplied by a general default.
      if (cached.source === 'OBSERVED_PRODUCTION_DOMESTIC_SHARE' && !cached.provenance) {
        cached.legacySource = cached.source;
        cached.source = 'LEGACY_ESTIMATED_PRODUCTION_DOMESTIC_SHARE';
        cached.provenance = 'LEGACY_ESTIMATE_PROVENANCE_UNKNOWN';
      }
      return cached;
    }
    var consumption = object(resource.consumption) || {};
    var observed = resourceValue(consumption, resourceId);
    if (observed !== null && observed > 0) {
      return { rate: observed, source: 'OBSERVED_RESOURCE_CONSUMPTION', provenance: 'OBSERVED', evidencePath: 'resource.consumption', createdTurn: currentTurn() };
    }
    var coefficient = finite(profile && profile.basePerMillionPopulation);
    if (coefficient !== null && coefficient > 0 && metrics.current.population.value !== null && metrics.current.population.value > 0) {
      return {
        rate: coefficient * metrics.current.population.value / 1000000,
        source: 'RULE_PROFILE_POPULATION_BASELINE_PER_DAY',
        provenance: 'RULE_PROFILE_ESTIMATE',
        coefficientSource: 'resource_economy_rules.json:demand.resourceProfiles.basePerMillionPopulation',
        createdTurn: currentTurn()
      };
    }
    var produced = resourceValue(resource.production, resourceId);
    var domesticShare = finite(profile && profile.domesticUseShare);
    var domesticShareSource = domesticShare !== null ? 'RESOURCE_PROFILE' : null;
    if (domesticShare === null) {
      domesticShare = finite(rules().defaultDomesticUseShare);
      if (domesticShare !== null) domesticShareSource = 'RULE_DEFAULT_SIMULATED';
    }
    if (produced !== null && produced > 0 && domesticShare !== null) {
      var boundedDomesticShare = clamp(domesticShare, 0, 1);
      return {
        rate: produced * boundedDomesticShare,
        source: 'ESTIMATED_PRODUCTION_DOMESTIC_SHARE',
        provenance: 'SIMULATED_ESTIMATE',
        productionEvidenceSource: 'OBSERVED_RESOURCE_PRODUCTION',
        domesticUseShare: boundedDomesticShare,
        domesticUseShareSource: domesticShareSource,
        createdTurn: currentTurn()
      };
    }
    if (factoryInput > 0) {
      return { rate: factoryInput, source: 'OBSERVED_FACTORY_INPUT_FLOOR_PER_DAY', provenance: 'OBSERVED_FACTORY_INPUT_PROXY', evidencePath: 'factory.recipe.inputRate', createdTurn: currentTurn() };
    }
    return null;
  }

  function playerSupplyLifelineConfig() {
    return object(rules().playerSupplyLifeline) || {};
  }
  function pushSupplyAlert(runtime, policy, countryId, type, alertKey, detail) {
    if (!policy || !policy.policyId) return null;
    if (!Array.isArray(policy.alerts)) policy.alerts = [];
    if (!Array.isArray(policy.alertedKeys)) policy.alertedKeys = [];
    if (policy.alertedKeys.indexOf(alertKey) >= 0) return null;
    var cfg = playerSupplyLifelineConfig();
    var alert = {
      alertId: String(policy.policyId) + ':' + String(alertKey),
      policyId: policy.policyId, countryId: canonical(countryId), type: type,
      turn: currentTurn(), elapsedGameDays: Math.max(0, finite(policy.elapsedGameDays) || 0),
      remainingGameDays: Math.max(0, finite(policy.remainingGameDays) || 0),
      status: 'OPEN',
      requiredAction: type === 'SUPPLY_WINDOW_EXPIRED' ? 'REAUTHORIZE_SUPPLY_POLICY'
        : (type === 'CONTRACT_WINDOW_EXPIRING' ? 'REVIEW_AND_REAUTHORIZE_SUPPLY_POLICY'
        : (type === 'LOW_STOCK_COVERAGE' ? 'REVIEW_REPLENISHMENT_AND_SUPPLY_RISK'
        : (type === 'DEMAND_RISING_STOCK_FALLING' ? 'REVIEW_DEMAND_AND_REPLENISHMENT'
        : 'REVIEW_IMPORT_FAILURE_AND_ALTERNATIVES'))),
      detail: clone(detail || {})
    };
    policy.alertedKeys.push(alertKey);
    policy.alerts.push(alert);
    var cap = Math.max(8, Math.floor(finite(cfg.maxPersistedAlerts) || 64));
    if (policy.alerts.length > cap) policy.alerts.splice(0, policy.alerts.length - cap);
    if (policy.alertedKeys.length > cap * 8) policy.alertedKeys.splice(0, policy.alertedKeys.length - cap * 8);
    try {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') {
        g.dispatchEvent(new g.CustomEvent('OMEGA_RESOURCE_SUPPLY_ALERT_CREATED', { detail: clone(alert) }));
      }
    } catch (_) {}
    return alert;
  }
  function advancePlayerSupplyLifeline(runtime, countryId, turnDays) {
    var policy = object(runtime.playerSupplyLifeline);
    if (!policy || policy.approved !== true) return null;
    var cfg = playerSupplyLifelineConfig(), now = currentTurn();
    var termDays = Math.max(1, finite(policy.termDays) || finite(cfg.termDays) || 100);
    policy.termDays = termDays;
    policy.targetCoverageDays = Math.max(1, finite(policy.targetCoverageDays) || finite(cfg.targetCoverageDays) || 100);
    policy.automaticRenewal = false;
    if (!Array.isArray(policy.alerts)) policy.alerts = [];
    if (!Array.isArray(policy.alertedKeys)) policy.alertedKeys = [];
    if (policy.status === 'SCHEDULED' && now >= (finite(policy.startTurn) || now)) {
      policy.status = 'ACTIVE';
      policy.lastAdvancedTurn = now;
    } else if (policy.status === 'ACTIVE') {
      var last = finite(policy.lastAdvancedTurn);
      if (last === null) last = finite(policy.startTurn) === null ? now : finite(policy.startTurn);
      var elapsed = Math.max(0, finite(policy.elapsedGameDays) || 0);
      if (now > last) elapsed += (now - last) * Math.max(1 / 86400000, finite(turnDays) || 1);
      policy.elapsedGameDays = Math.min(termDays, elapsed);
      policy.lastAdvancedTurn = now;
      if (policy.elapsedGameDays >= termDays - 1e-9) {
        policy.elapsedGameDays = termDays;
        policy.status = 'EXPIRED';
      }
    }
    if (policy.status === 'SCHEDULED') {
      policy.elapsedGameDays = Math.max(0, finite(policy.elapsedGameDays) || 0);
      policy.remainingGameDays = termDays;
    } else {
      policy.elapsedGameDays = Math.max(0, finite(policy.elapsedGameDays) || 0);
      policy.remainingGameDays = Math.max(0, termDays - policy.elapsedGameDays);
      // Catch up missed warning thresholds after a skipped turn or save/load.
      var offsets = Array.isArray(cfg.expiryWarningDays) ? cfg.expiryWarningDays : [30, 14, 7];
      offsets.map(finite).filter(function (x) { return x !== null && x > 0; })
        .sort(function (a, b) { return b - a; }).forEach(function (offset) {
          if (policy.remainingGameDays <= offset + 1e-9) {
            pushSupplyAlert(runtime, policy, countryId, 'CONTRACT_WINDOW_EXPIRING', 'CONTRACT_WINDOW_EXPIRING:' + offset, {
              warningDays: offset, remainingGameDays: policy.remainingGameDays,
              crossedThresholdAtRemainingDays: offset,
              message: 'The automatic supply authorization is approaching expiry.'
            });
          }
        });
      if (policy.status === 'EXPIRED') {
        pushSupplyAlert(runtime, policy, countryId, 'SUPPLY_WINDOW_EXPIRED', 'SUPPLY_WINDOW_EXPIRED', {
          termDays: termDays,
          message: 'Automatic replenishment has ended; existing stock and inbound shipments remain valid.'
        });
      }
    }
    policy.updatedTurn = now;
    return policy;
  }
  function getPlayerSupplyLifeline(countryId) {
    var cid = canonical(countryId), player = playerCountryId();
    if (!cid || !player || cid !== player) return { accepted: false, status: 'NOT_PLAYER_COUNTRY', countryId: cid || null };
    var resource = bucket(cid, 'resource');
    var saved = resource && object(resource.demandRuntime);
    var policy = saved && object(saved.playerSupplyLifeline);
    return policy ? clone(policy) : { accepted: true, status: 'NOT_APPROVED', approved: false, countryId: cid };
  }
  function authorizePlayerSupplyLifeline(countryId) {
    var cid = canonical(countryId), player = playerCountryId(), cfg = playerSupplyLifelineConfig();
    if (!cid || !player || cid !== player) return { accepted: false, status: 'NOT_PLAYER_COUNTRY', reason: 'PLAYER_COUNTRY_ID_MISMATCH', countryId: cid || null };
    if (cfg.enabled !== true || cfg.requiresExplicitPlayerApproval !== true) return { accepted: false, status: 'DISABLED', reason: 'PLAYER_SUPPLY_LIFELINE_NOT_ENABLED' };
    var resource = bucket(cid, 'resource');
    if (!resource || !object(resource.inventory)) return { accepted: false, status: 'WAITING_FOR_INVENTORY', reason: 'AUTHORITATIVE_INVENTORY_REQUIRED' };
    var savedRuntime = object(resource.demandRuntime) || {};
    var current = object(savedRuntime.playerSupplyLifeline);
    if (current && current.approved === true && (current.status === 'ACTIVE' || current.status === 'SCHEDULED')) {
      return { accepted: true, duplicate: true, status: current.status, policy: clone(current) };
    }
    var runtime = clone(savedRuntime);
    if (!Array.isArray(runtime.playerSupplyLifelineHistory)) runtime.playerSupplyLifelineHistory = [];
    if (current) runtime.playerSupplyLifelineHistory.push(clone(current));
    if (runtime.playerSupplyLifelineHistory.length > 16) runtime.playerSupplyLifelineHistory.splice(0, runtime.playerSupplyLifelineHistory.length - 16);
    var alreadyProcessed = finite(runtime.lastTurn) === currentTurn();
    var startTurn = currentTurn() + (alreadyProcessed ? 1 : 0);
    var termDays = Math.max(1, finite(cfg.termDays) || 100);
    var policy = {
      policyId: 'PLAYER-SUPPLY-LIFELINE-' + cid + '-' + startTurn,
      countryId: cid, approved: true, approvedBy: 'PLAYER',
      status: startTurn > currentTurn() ? 'SCHEDULED' : 'ACTIVE',
      startTurn: startTurn, lastAdvancedTurn: startTurn,
      elapsedGameDays: 0, remainingGameDays: termDays, termDays: termDays,
      targetCoverageDays: Math.max(1, finite(cfg.targetCoverageDays) || 100),
      automaticRenewal: false, nextManualActionRequiredAtExpiry: true,
      approvedTurn: currentTurn(), alerts: [], alertedKeys: []
    };
    runtime.playerSupplyLifeline = policy;
    var saved = dispatch('resource', 'OMEGA_RESOURCE_ECON_PUBLISH_DEMAND_RUNTIME', cid, {
      demandRuntime: runtime, correlationId: 'SUPPLY-LIFELINE-APPROVE-' + policy.policyId
    });
    if (!saved || saved.status !== 'APPLIED' || (saved.result && saved.result.accepted === false)) {
      return { accepted: false, status: saved && saved.status || 'UNKNOWN',
        reason: saved && saved.result && saved.result.reason || saved && saved.reason || 'SUPPLY_POLICY_PERSIST_FAILED' };
    }
    return { accepted: true, status: policy.status, policy: clone(policy) };
  }

  function processCountry(countryId, completedFactoryRows) {
    var cfg = rules();
    if (cfg.enabled !== true) return { countryId: canonical(countryId), status: 'DISABLED', reason: 'DEMAND_RULES_DISABLED' };
    var cid = canonical(countryId), resource = bucket(cid, 'resource'), trade = bucket(cid, 'trade') || {};
    if (!resource || typeof resource !== 'object') {
      return { countryId: cid, turn: currentTurn(), status: 'WAITING_FOR_EVIDENCE', reason: 'RESOURCE_STATE_NOT_OBSERVED' };
    }
    var savedRuntime = object(resource.demandRuntime);
    if (savedRuntime && finite(savedRuntime.lastTurn) === currentTurn() && object(savedRuntime.lastSummary) && object(savedRuntime.byResource)) {
      var cachedRows = Object.keys(savedRuntime.byResource).map(function (key) { return clone(savedRuntime.byResource[key]); });
      return {
        countryId: cid, turn: currentTurn(), status: savedRuntime.status || 'ACTIVE',
        publishStatus: savedRuntime.publishStatus || null, resourceCount: cachedRows.length,
        modeled: finite(savedRuntime.lastSummary.modeled) || 0,
        unknown: finite(savedRuntime.lastSummary.unknown) || 0,
        shortages: finite(savedRuntime.lastSummary.shortages) || 0,
        consumedResourceCount: finite(savedRuntime.lastSummary.consumedResourceCount) || 0,
        procurement: (Array.isArray(savedRuntime.procurementDecisions) ? savedRuntime.procurementDecisions : []).filter(function (row) { return finite(row.turn) === currentTurn(); }).map(function (row) { return clone(row); }),
        resources: cachedRows, cached: true
      };
    }
    var inventory = object(resource.inventory);
    var runtime = clone(savedRuntime || {});
    var turnDays = simulationTurnDays();
    if (!object(runtime.baselineByResource)) runtime.baselineByResource = {};
    if (!Array.isArray(runtime.history)) runtime.history = [];
    if (!Array.isArray(runtime.procurementDecisions)) runtime.procurementDecisions = [];
    var priorByResource = clone(object(runtime.byResource) || {});
    var player = playerCountryId();
    var lifeline = advancePlayerSupplyLifeline(runtime, cid, turnDays);
    var playerSupplyWindowActive = !!(player === cid && lifeline && lifeline.approved === true && lifeline.status === 'ACTIVE');
    var playerSupplyTargetDays = playerSupplyWindowActive
      ? Math.max(1, finite(lifeline.targetCoverageDays) || finite(playerSupplyLifelineConfig().targetCoverageDays) || 100)
      : 0;
    var metrics = referenceContext(resource, cid, runtime);
    runtime.referenceContext = metrics.reference;
    var factoryInputs = factoryInputTotals(completedFactoryRows);
    var factoryInputDailyRates = {};
    Object.keys(factoryInputs).forEach(function (resourceId) {
      factoryInputDailyRates[resourceId] = factoryInputs[resourceId] / turnDays;
    });
    var allConsumption = object(resource.consumption) || {};
    var resourceIds = Object.keys(profiles());
    Object.keys(allConsumption).forEach(function (rid) {
      if (!resourceIds.some(function (existing) { return token(existing) === token(rid); })) resourceIds.push(rid);
    });
    Object.keys(factoryInputs).forEach(function (rid) {
      if (!resourceIds.some(function (existing) { return token(existing) === token(rid); })) resourceIds.push(rid);
    });
    var outputConsumption = clone(allConsumption), summaries = [], pendingByResource = {};
    var hasInventoryBook = !!inventory;
    var maxLedger = Math.max(1, Math.floor(finite(cfg.maxLedgerEntries) || 2048));
    var minCoverageDays = Math.max(0, finite(cfg.stockCoverageDays) || finite(cfg.stockCoverageTurns) || 3);
    var bufferDays = Math.max(0, finite(cfg.procurementBufferDays) || finite(cfg.procurementBufferTurns) || 2);
    var maxPurchaseDays = Math.max(bufferDays, finite(cfg.maxPurchaseCoverageDays) || finite(cfg.maxPurchaseCoverageTurns) || 6, playerSupplyTargetDays);
    var allowPlayerProcurement = !!(cfg.automaticProcurement && cfg.automaticProcurement.forPlayerCountry === true);
    var autoProcure = !!(cfg.automaticProcurement && cfg.automaticProcurement.enabled === true);
    var pendingRows = Array.isArray(trade.importRequests) ? trade.importRequests : [];
    pendingRows.forEach(function (row) {
      if (!row || !row.resourceId) return;
      var status = id(row.status), stage = id(row.stage);
      if (['SETTLED', 'DELIVERED', 'COMPLETED', 'FULFILLED', 'REJECTED', 'CANCELLED', 'CANCELED', 'FAILED', 'EXPIRED'].indexOf(status) >= 0 ||
          ['SETTLED', 'DELIVERED', 'COMPLETED', 'FULFILLED', 'CANCELLED', 'CANCELED', 'FAILED', 'EXPIRED'].indexOf(stage) >= 0) return;
      var q = finite(row.remainingQuantity != null ? row.remainingQuantity : row.quantity);
      if (q !== null && q > 0) pendingByResource[token(row.resourceId)] = (pendingByResource[token(row.resourceId)] || 0) + q;
    });

    resourceIds.forEach(function (rid) {
      var profile = profileFor(rid) || {};
      var inputQty = resourceValue(factoryInputs, rid);
      if (inputQty === null) inputQty = 0;
      var inputDailyRate = resourceValue(factoryInputDailyRates, rid);
      if (inputDailyRate === null) inputDailyRate = 0;
      var baseline = baselineFor(rid, resource, profile, runtime, metrics, inputDailyRate);
      if (!baseline) {
        summaries.push({
          resourceId: rid, status: 'UNKNOWN', source: 'NO_BASELINE_OR_REQUIRED_METRICS',
          demand: null, consumption: null, unmetDemand: null, inventoryObserved: hasInventoryBook
        });
        return;
      }
      runtime.baselineByResource[rid] = clone(baseline);
      var transmission = g.OmegaEconomicTransmissionRuntime || (g.Omega && g.Omega.EconomicTransmission);
      var purchasingPowerMultiplier = 1, importCostMultiplier = 1, producerCostMultiplier = 1;
      try {
        if (transmission && typeof transmission.getHouseholdPurchasingPowerMultiplier === 'function') {
          var pp = finite(transmission.getHouseholdPurchasingPowerMultiplier(cid));
          if (pp !== null && pp > 0) purchasingPowerMultiplier = clamp(pp, 0.2, 1.5);
        }
        if (transmission && typeof transmission.getImportCostMultiplier === 'function') {
          var ic = finite(transmission.getImportCostMultiplier(cid));
          if (ic !== null && ic > 0) importCostMultiplier = clamp(ic, 0.4, 5);
        }
        if (transmission && typeof transmission.getProducerCostMultiplier === 'function') {
          var pc = finite(transmission.getProducerCostMultiplier(cid));
          if (pc !== null && pc > 0) producerCostMultiplier = clamp(pc, 0.5, 3);
        }
      } catch (_) {}
      var refPrices = object(runtime.referencePriceByResource) || {};
      runtime.referencePriceByResource = refPrices;
      var rawCurrentPrice = marketPrice(cid, rid, trade);
      var currentPrice = {
        value: rawCurrentPrice.value === null ? null : rawCurrentPrice.value * importCostMultiplier,
        source: rawCurrentPrice.source
          ? rawCurrentPrice.source + (importCostMultiplier !== 1 ? ':FINANCIAL_TRANSMISSION_IMPORT_COST' : '')
          : null
      };
      if (refPrices[rid] == null && currentPrice.value !== null) refPrices[rid] = currentPrice.value;
      var referencePrice = finite(refPrices[rid]);
      var factors = calculateDemand({
        config: cfg, profile: profile, baselineRate: baseline.rate,
        reference: metrics.reference, current: {
          population: metrics.current.population.value,
          gdpPerCapita: metrics.current.gdpPerCapita.value,
          industry: metrics.current.industry.value,
          militaryPersonnel: metrics.current.militaryPersonnel.value
        },
        currentPrice: currentPrice.value, referencePrice: referencePrice,
        priceSource: currentPrice.source,
        policyMultiplier: policyMultiplier(resource, rid), warActive: warActive(cid)
      });
      // Resource demand falls with reduced real household purchasing power; higher import
      // costs also enter the existing price-elasticity formula above. Industry/producer
      // cost pressure is supplied to the strategy telemetry and trade unit-price runtime.
      var demanded = Math.max(inputDailyRate, factors.demand) * purchasingPowerMultiplier;
      factors.factors.financialTransmission = {
        householdPurchasingPowerMultiplier: purchasingPowerMultiplier,
        importCostMultiplier: importCostMultiplier,
        producerCostMultiplier: producerCostMultiplier,
        source: transmission ? 'OMEGA_ECONOMIC_TRANSMISSION' : 'BASELINE_NO_TRANSMISSION'
      };
      factors.transmittedDemand = demanded;
      var demandThisTurn = demanded * turnDays;
      var consumptionKey = resourceKey(outputConsumption, rid) || rid;
      outputConsumption[consumptionKey] = demanded;
      var stock = hasInventoryBook ? (resourceValue(inventory, rid) == null ? 0 : Math.max(0, resourceValue(inventory, rid))) : null;
      var protectedQty = stock === null ? null : Math.min(stock, protectedStock(resource, rid));
      var spendable = stock === null ? null : Math.max(0, stock - protectedQty);
      var nonFactoryDemand = Math.max(0, demandThisTurn - inputQty);
      var consumeRequest = stock === null ? 0 : Math.min(nonFactoryDemand, spendable);
      var consumed = 0, consumeStatus = stock === null ? 'UNKNOWN_INVENTORY' : (consumeRequest > 0 ? 'NOT_ATTEMPTED' : 'NO_DEBIT_REQUIRED');
      if (consumeRequest > 0) {
        var tx = 'NAT-CONSUME-' + currentTurn() + '-' + cid + '-' + token(rid);
        var debit = dispatch('resource', 'OMEGA_RESOURCE_ECON_CONSUME_INVENTORY', cid, {
          resourceId: rid, quantity: consumeRequest, reason: 'NATIONAL_DEMAND',
          decisionId: tx, transactionId: tx, correlationId: tx
        });
        consumeStatus = debit && debit.status || 'UNKNOWN';
        if (debit && debit.status === 'APPLIED' && !(debit.result && debit.result.accepted === false)) {
          consumed = consumeRequest;
        } else {
          consumeStatus = (debit && debit.result && debit.result.reason) || (debit && debit.reason) || consumeStatus;
        }
      }
      var inventoryAfter = hasInventoryBook ? resourceValue((bucket(cid, 'resource') || {}).inventory, rid) : null;
      if (hasInventoryBook && inventoryAfter === null) inventoryAfter = 0;
      var fulfilled = stock === null ? null : Math.min(demandThisTurn, inputQty + consumed);
      var unmet = fulfilled === null ? null : Math.max(0, demandThisTurn - fulfilled);
      var remainingSpendable = inventoryAfter === null ? null : Math.max(0, inventoryAfter - protectedStock(bucket(cid, 'resource') || resource, rid));
      var coverage = remainingSpendable === null ? null : (demanded > 0 ? remainingSpendable / demanded : null);
      var pending = pendingByResource[token(rid)] || 0;
      var coverageTarget = playerSupplyWindowActive
        ? playerSupplyTargetDays
        : Math.max(0, finite(profile.stockCoverageDays) === null
          ? (finite(profile.stockCoverageTurns) === null ? minCoverageDays : finite(profile.stockCoverageTurns))
          : finite(profile.stockCoverageDays));
      var lowStockCoverage = coverage !== null && demanded > 0 && coverage < coverageTarget;
      var shortagePressure = unmet !== null && demandThisTurn > 0 ? clamp(unmet / demandThisTurn, 0, 1) : 0;
      var coveragePressure = coverage !== null && coverageTarget > 0 ? clamp((coverageTarget - coverage) / coverageTarget, 0, 1) : 0;
      var score = Math.max(shortagePressure, lowStockCoverage ? coveragePressure : 0) * (finite(profile.priority) || 1);
      var summary = {
        resourceId: rid, unit: profile.unit || null,
        status: stock === null ? 'WAITING_FOR_INVENTORY' : (unmet > 1e-9 ? 'SHORTAGE' : (lowStockCoverage ? 'LOW_COVERAGE' : 'BALANCED')),
        baselineRate: baseline.rate, baselineSource: baseline.source,
        baselineProvenance: baseline.provenance || 'LEGACY_PROVENANCE_UNSPECIFIED',
        baselineEvidenceSource: baseline.productionEvidenceSource || baseline.evidencePath || baseline.coefficientSource || null,
        baselineDomesticUseShare: finite(baseline.domesticUseShare),
        baselineDomesticUseShareSource: baseline.domesticUseShareSource || null,
        demand: demanded, demandPerDay: demanded, demandThisTurn: demandThisTurn,
        factoryConsumption: inputQty, nationalConsumption: consumed,
        fulfilledDemand: fulfilled, unmetDemand: unmet,
        inventoryBefore: stock, inventoryAfter: inventoryAfter, protectedStock: protectedQty,
        spendableStockAfter: remainingSpendable, stockCoverageDays: coverage, stockCoverageTurns: coverage,
        stockCoverageTargetDays: coverageTarget, stockCoverageTargetTurns: coverageTarget,
        lowStockCoverage: lowStockCoverage, pendingImportQuantity: pending,
        priority: finite(profile.priority) || 1, procurementScore: score,
        consumeStatus: consumeStatus, price: currentPrice.value, turnDurationDays: turnDays,
        formula: factors
      };
      summaries.push(summary);
    });

    if (playerSupplyWindowActive) {
      var lifelineCfg = playerSupplyLifelineConfig();
      var lowStockWarningDays = Math.max(0, finite(lifelineCfg.lowStockWarningDays) || 30);
      var demandIncreaseThreshold = Math.max(0, finite(lifelineCfg.demandIncreaseAlertFraction) || 0.1);
      summaries.forEach(function (row) {
        if (row.stockCoverageDays !== null && row.stockCoverageDays <= lowStockWarningDays) {
          pushSupplyAlert(runtime, lifeline, cid, 'LOW_STOCK_COVERAGE', 'LOW_STOCK_COVERAGE:' + token(row.resourceId), {
            resourceId: row.resourceId, stockCoverageDays: row.stockCoverageDays, targetCoverageDays: playerSupplyTargetDays
          });
        }
        var prior = object(priorByResource[row.resourceId]);
        var priorDemand = prior && finite(prior.demandPerDay), priorStock = prior && finite(prior.inventoryAfter);
        var currentDemand = finite(row.demandPerDay), currentStock = finite(row.inventoryAfter);
        if (priorDemand !== null && priorDemand !== undefined && priorStock !== null && priorStock !== undefined &&
            currentDemand !== null && currentStock !== null &&
            currentDemand > priorDemand * (1 + demandIncreaseThreshold) && currentStock < priorStock) {
          pushSupplyAlert(runtime, lifeline, cid, 'DEMAND_RISING_STOCK_FALLING', 'DEMAND_RISING_STOCK_FALLING:' + token(row.resourceId), {
            resourceId: row.resourceId, previousDemandPerDay: priorDemand, currentDemandPerDay: currentDemand,
            previousInventory: priorStock, currentInventory: currentStock, thresholdFraction: demandIncreaseThreshold
          });
        }
      });
    }

    // The per-resource consumption rate and decision snapshot are written through
    // the existing resource-economy command authority, never as a parallel save file.
    var rowLimit = maxLedger;
    var maxHistoryTurns = Math.max(1, Math.floor(finite(cfg.maxHistoryTurns) || 128));
    runtime.lastTurn = currentTurn();
    runtime.status = hasInventoryBook ? 'ACTIVE' : 'WAITING_FOR_INVENTORY';
    runtime.resourceCount = summaries.length;
    runtime.byResource = {};
    summaries.forEach(function (row) { runtime.byResource[row.resourceId] = clone(row); });
    runtime.lastSummary = {
      turn: currentTurn(), status: runtime.status,
      modeled: summaries.filter(function (x) { return x.demand !== null; }).length,
      unknown: summaries.filter(function (x) { return x.status === 'UNKNOWN'; }).length,
      shortages: summaries.filter(function (x) { return x.unmetDemand !== null && x.unmetDemand > 1e-9; }).length,
      consumedResourceCount: summaries.filter(function (x) { return x.nationalConsumption > 0; }).length
    };
    runtime.history.push({
      turn: currentTurn(), status: runtime.status,
      resources: summaries.map(function (row) {
        return {
          resourceId: row.resourceId, status: row.status, demandPerDay: row.demandPerDay,
          demandThisTurn: row.demandThisTurn, nationalConsumption: row.nationalConsumption,
          unmetDemand: row.unmetDemand, inventoryAfter: row.inventoryAfter,
          stockCoverageDays: row.stockCoverageDays,
          totalFactor: row.formula && row.formula.totalFactor
        };
      }),
      summary: clone(runtime.lastSummary)
    });
    if (runtime.history.length > maxHistoryTurns) runtime.history.splice(0, runtime.history.length - maxHistoryTurns);

    var publish = dispatch('resource', 'OMEGA_RESOURCE_ECON_PUBLISH_DEMAND_RUNTIME', cid, {
      consumption: outputConsumption, demandRuntime: runtime,
      correlationId: 'DEMAND-' + currentTurn() + '-' + cid
    });
    var publishStatus = publish && publish.status || 'UNKNOWN';
    if (!publish || publish.status !== 'APPLIED' || (publish.result && publish.result.accepted === false)) {
      runtime.publishStatus = publish && publish.result && publish.result.reason || publish && publish.reason || publishStatus;
    } else {
      runtime.publishStatus = 'APPLIED';
    }

    // Rank unmet critical needs and ask the existing autonomy orchestrator to route
    // at most N procurement decisions. It may wait for supplier/price/access evidence.
    var procurement = [];
    var canProcure = autoProcure && !!player &&
      (player !== cid || allowPlayerProcurement || playerSupplyWindowActive) &&
      hasInventoryBook && g.OmegaOpponentAutonomy && typeof g.OmegaOpponentAutonomy.routeDecision === 'function';
    if (canProcure) {
      summaries.forEach(function (row) {
        if (row.demandPerDay === null || row.demandPerDay <= 0 ||
            !((row.unmetDemand !== null && row.unmetDemand > 1e-9) || row.lowStockCoverage === true)) return;
        var availablePending = pendingByResource[token(row.resourceId)] || 0;
        var targetDays = Math.max(bufferDays, finite(row.stockCoverageTargetDays) || finite(row.stockCoverageTargetTurns) || 0);
        var spendable = Math.max(0, row.spendableStockAfter || 0);
        var bufferTarget = Math.max(0, row.demandPerDay * targetDays - spendable - availablePending);
        var uncoveredDemand = Math.max(0, (row.unmetDemand || 0) - availablePending);
        var quantity = Math.max(uncoveredDemand, bufferTarget);
        quantity = Math.min(quantity, row.demandPerDay * maxPurchaseDays);
        if (!(quantity > 1e-9)) return;
        procurement.push({ row: row, quantity: quantity, score: row.procurementScore || 0 });
      });
      procurement.sort(function (a, b) { return b.score - a.score || token(a.row.resourceId).localeCompare(token(b.row.resourceId)); });
      var maxDecisions = playerSupplyWindowActive
        ? Math.max(1, Math.floor(finite(playerSupplyLifelineConfig().maxDecisionsPerTurn) || 4))
        : Math.max(0, Math.floor(finite(cfg.maxProcurementDecisionsPerCountryPerTurn) || 2));
      procurement = procurement.slice(0, maxDecisions);
      procurement = procurement.map(function (entry) {
        var decisionId = 'RESOURCE-NEED-' + currentTurn() + '-' + cid + '-' + token(entry.row.resourceId);
        var decision = {
          decisionId: decisionId, countryId: cid, scenarioId: 'RESOURCE_DEFICIT',
          supplyWindowId: playerSupplyWindowActive ? lifeline.policyId : null,
          supplyWindowTermDays: playerSupplyWindowActive ? lifeline.termDays : null,
          supplyWindowRemainingDays: playerSupplyWindowActive ? lifeline.remainingGameDays : null,
          supplyWindowTargetCoverageDays: playerSupplyWindowActive ? playerSupplyTargetDays : null,
          candidateActions: ['IMPORT', 'RESERVE_RELEASE', 'DOMESTIC_EXPANSION', 'SUBSTITUTION', 'EFFICIENCY', 'SUPPLIER_CHANGE'],
          goal: { priorityClass: entry.row.priority >= 8 ? 'PRESSURE' : 'OPPORTUNITY' },
          runtimeMeasurement: {
            resourceId: entry.row.resourceId, required: entry.row.demandThisTurn,
            requiredPerDay: entry.row.demandPerDay,
            available: Math.max(0, entry.row.spendableStockAfter || 0), gap: entry.row.unmetDemand,
            quantity: entry.quantity,
            selected: { action: 'IMPORT', quantity: entry.quantity },
            source: 'OMEGA_RESOURCE_NATIONAL_DEMAND_RUNTIME'
          }
        };
        try {
          var routed = g.OmegaOpponentAutonomy.routeDecision(decision, currentTurn());
          var queued = routed && routed.status === 'READY_TO_QUEUE' && !!routed.command;
          return {
            resourceId: entry.row.resourceId, decisionId: decisionId, quantity: entry.quantity,
            supplyWindowId: playerSupplyWindowActive ? lifeline.policyId : null,
            supplyWindowTermDays: playerSupplyWindowActive ? lifeline.termDays : null,
            status: queued ? 'QUEUED' : (routed && routed.status || 'WAITING_FOR_EVIDENCE'),
            selectedAction: routed && routed.route && routed.route.selectedAction || null,
            reason: queued ? null : (routed && routed.route && (routed.route.reason || routed.route.status) || 'AUTONOMY_DID_NOT_QUEUE'),
            turn: currentTurn()
          };
        } catch (error) {
          return { resourceId: entry.row.resourceId, decisionId: decisionId, quantity: entry.quantity,
            status: 'FAILED', reason: String(error && error.message || error), turn: currentTurn() };
        }
      });
      runtime.procurementDecisions = (runtime.procurementDecisions || []).concat(procurement).slice(-rowLimit);
      runtime.lastProcurementTurn = currentTurn();
      if (playerSupplyWindowActive && lifeline) {
        procurement.forEach(function (row) {
          if (row.status !== 'QUEUED') {
            pushSupplyAlert(runtime, lifeline, cid, 'PROCUREMENT_BLOCKED', 'PROCUREMENT_BLOCKED:' + token(row.resourceId) + ':' + token(row.reason || row.status), {
              resourceId: row.resourceId, procurementStatus: row.status, reason: row.reason || null
            });
          }
        });
      }
    }
    var finalPublish = dispatch('resource', 'OMEGA_RESOURCE_ECON_PUBLISH_DEMAND_RUNTIME', cid, {
      consumption: {}, demandRuntime: clone(runtime),
      correlationId: 'DEMAND-TELEMETRY-' + currentTurn() + '-' + cid
    });
    if (finalPublish && finalPublish.status !== 'APPLIED') runtime.telemetryPublishStatus = finalPublish.reason || finalPublish.status;
    try {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') {
        g.dispatchEvent(new g.CustomEvent('OMEGA_RESOURCE_NATIONAL_DEMAND_UPDATED', {
          detail: { countryId: cid, turn: currentTurn(), summary: clone(runtime.lastSummary) }
        }));
      }
    } catch (_) {}
    return {
      countryId: cid, turn: currentTurn(),
      status: runtime.status, publishStatus: runtime.publishStatus || publishStatus,
      resourceCount: summaries.length,
      modeled: runtime.lastSummary.modeled, unknown: runtime.lastSummary.unknown,
      shortages: runtime.lastSummary.shortages,
      consumedResourceCount: runtime.lastSummary.consumedResourceCount,
      procurement: clone(procurement), resources: clone(summaries)
    };
  }

  function diagnostics() {
    var cfg = rules();
    return {
      version: VERSION, prepared: prepared,
      populationDatasetLoaded: !!populationData, economyDatasetLoaded: !!economyData,
      prepareErrors: clone(prepareErrors), rulesEnabled: cfg.enabled === true,
      configuredResourceProfiles: Object.keys(profiles()).length,
      lastTurn: currentTurn()
    };
  }

  var API = Object.freeze({
    VERSION: VERSION,
    prepare: prepare,
    processCountry: processCountry,
    calculateDemand: calculateDemand,
    authorizePlayerSupplyLifeline: authorizePlayerSupplyLifeline,
    getPlayerSupplyLifeline: getPlayerSupplyLifeline,
    diagnostics: diagnostics
  });
  g.Omega = g.Omega || {};
  g.Omega.ResourceNationalDemandRuntime = API;
  g.OmegaResourceNationalDemandRuntime = API;
})(typeof window !== 'undefined' ? window : globalThis);
