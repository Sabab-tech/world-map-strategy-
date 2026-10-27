/* OMEGA RESOURCE STARTUP BASELINE RUNTIME v1.0.0
 * Additive new-game seed for opening stock and source-context-driven starter
 * factories. This runtime reuses the existing national demand rules, industrial
 * catalog, simulated site records, and country profile registry. It does not
 * convert geological reserves into stock or create import/production ledgers.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0.0';
  if (g.OmegaResourceStartupBaseline && g.OmegaResourceStartupBaseline.VERSION === VERSION) return;

  var PATHS = {
    policy: './resource_startup_baseline_rules_v1.json',
    economyRules: './resource_economy_rules.json',
    industrialCatalog: './resource_industrial_catalog_v1.json',
    sites: './resource_site_reserve_simulation_v1.json',
    countryProfiles: './economy_global_profiles_v1.json'
  };
  var data = null;
  var loadPromise = null;
  var lastReport = null;
  var pendingSession = null;
  var pendingInitialization = Promise.resolve(null);
  var simulationUnsubscribe = null;
  var running = Object.create(null);
  var installed = false;

  function own(value, key) {
    return !!value && Object.prototype.hasOwnProperty.call(value, key);
  }
  function finite(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      var number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    return null;
  }
  function positive(value) {
    var number = finite(value);
    return number !== null && number > 0 ? number : null;
  }
  function id(value) {
    return String(value == null ? '' : value).trim().toUpperCase();
  }
  function token(value) {
    return String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function clone(value, seen) {
    if (value === null || typeof value !== 'object') return value;
    seen = seen || [];
    for (var i = 0; i < seen.length; i++) {
      if (seen[i][0] === value) return seen[i][1];
    }
    var out = Array.isArray(value) ? [] : {};
    seen.push([value, out]);
    Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor') return;
      if (value[key] === undefined || typeof value[key] === 'function') return;
      out[key] = clone(value[key], seen);
    });
    return out;
  }
  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }
  function rootState() {
    return (g.Game && g.Game.state) || g.gameState ||
      (g.Omega && g.Omega.SimulationRuntime && g.Omega.SimulationRuntime.world &&
      g.Omega.SimulationRuntime.world.state) || (g.Omega && g.Omega.Simulation && g.Omega.Simulation.world &&
      g.Omega.Simulation.world.state) || null;
  }
  function currentTurn(state) {
    state = state || rootState() || {};
    var values = [
      state.simulation && state.simulation.turn,
      state.turn,
      state.simulationTurn,
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.clock && g.Omega.Simulation.clock.turn
    ];
    for (var i = 0; i < values.length; i++) {
      var number = finite(values[i]);
      if (number !== null) return Math.max(0, number);
    }
    return 0;
  }
  function sessionFromState(state) {
    return state && state.simulation && object(state.simulation.session) || null;
  }
  function profileAliases(profile) {
    return [profile && profile.iso3, profile && profile.countryCode, profile && profile.iso2,
      profile && profile.economyKey, profile && profile.populationKey, profile && profile.name,
      profile && profile.officialName, profile && profile.countryName]
      .filter(Boolean).map(function (value) { return token(value); });
  }
  function countryBucket(table, profile, create) {
    if (!table || typeof table !== 'object' || Array.isArray(table)) {
      if (!create) return { key: null, value: null };
      return { key: null, value: null, invalid: true };
    }
    var aliases = profileAliases(profile);
    var keys = Object.keys(table);
    for (var i = 0; i < keys.length; i++) {
      if (aliases.indexOf(token(keys[i])) >= 0 && object(table[keys[i]])) {
        return { key: keys[i], value: table[keys[i]] };
      }
    }
    var iso3 = id(profile && profile.iso3);
    if (iso3 && object(table[iso3])) return { key: iso3, value: table[iso3] };
    if (!create || !iso3) return { key: null, value: null };
    table[iso3] = {};
    return { key: iso3, value: table[iso3], created: true };
  }
  function ensureDomain(state, domain) {
    if (!own(state, domain)) {
      state[domain] = {};
      return state[domain];
    }
    return object(state[domain]);
  }
  function bucketFor(state, domain, profile, create) {
    var table = ensureDomain(state, domain);
    if (!table) return { key: null, value: null, invalid: true };
    return countryBucket(table, profile, create);
  }
  function findKeyByToken(map, resourceId) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
    if (own(map, resourceId)) return resourceId;
    var wanted = token(resourceId), keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      if (token(keys[i]) === wanted) return keys[i];
    }
    return null;
  }
  function mapValue(map, resourceId) {
    var key = findKeyByToken(map, resourceId);
    return key === null ? null : finite(map[key]);
  }
  function normalizeFactoryType(value) {
    var key = id(value), aliases = data && data.industrialCatalog && data.industrialCatalog.factoryTypeAliases || {};
    var seen = Object.create(null);
    while (aliases[key] && !seen[key]) {
      seen[key] = true;
      key = id(aliases[key]);
    }
    return key;
  }
  function siteGroupsByCountry() {
    var grouped = Object.create(null), identities = data.economyRules.demand.resourceProfiles;
    data.siteRows.forEach(function (site) {
      if (!site || site.commercialExtraction !== true) return;
      var cid = id(site.countryId || site.countryCode), rid = token(site.resourceId || '');
      if (!cid || !rid || !own(identities, rid) || !own(data.industrialCatalog.processingRules, rid)) return;
      var key = cid + '|' + rid;
      if (!grouped[key]) grouped[key] = { countryId: cid, resourceId: rid, siteIds: [], siteNames: [] };
      var group = grouped[key];
      var siteId = String(site.siteId || '').trim();
      if (siteId && group.siteIds.indexOf(siteId) < 0) group.siteIds.push(siteId);
      if (site.siteName && group.siteNames.indexOf(String(site.siteName)) < 0) group.siteNames.push(String(site.siteName));
    });
    var byCountry = Object.create(null);
    Object.keys(grouped).forEach(function (key) {
      var group = grouped[key];
      if (!byCountry[group.countryId]) byCountry[group.countryId] = [];
      byCountry[group.countryId].push(group);
    });
    Object.keys(byCountry).forEach(function (cid) {
      byCountry[cid].sort(function (a, b) { return a.resourceId.localeCompare(b.resourceId); });
    });
    return byCountry;
  }
  function checkData(loaded) {
    var policy = loaded.policy, rules = loaded.economyRules, catalog = loaded.industrialCatalog;
    if (!object(policy) || !object(rules) || !object(rules.demand) ||
        !object(rules.demand.resourceProfiles) || !object(catalog) ||
        !object(catalog.factoryProfiles) || !object(catalog.processingRules) ||
        !object(catalog.downstreamFactoryRecipes) || !object(catalog.technologyProjects) ||
        !Array.isArray(loaded.siteDocument.records) || !Array.isArray(loaded.countryDocument.countries)) {
      throw new Error('STARTUP_BASELINE_SOURCE_SCHEMA_INVALID');
    }
    var expectedResources = finite(policy.canonicalIdentityPolicy && policy.canonicalIdentityPolicy.resourceProfileCount);
    var expectedFactories = finite(policy.canonicalIdentityPolicy && policy.canonicalIdentityPolicy.factoryProfileCount);
    if (Object.keys(rules.demand.resourceProfiles).length !== expectedResources ||
        Object.keys(catalog.factoryProfiles).length !== expectedFactories) {
      throw new Error('STARTUP_BASELINE_CANONICAL_CATALOG_COUNT_MISMATCH');
    }
    if (!rules.demand.resourceProfiles || !catalog.factoryProfiles) throw new Error('STARTUP_BASELINE_CATALOG_UNAVAILABLE');
    loaded.countryProfiles = loaded.countryDocument.countries;
    loaded.siteRows = loaded.siteDocument.records;
    loaded.resourceProfiles = rules.demand.resourceProfiles;
    loaded.factoryProfiles = catalog.factoryProfiles;
    loaded.processingRules = catalog.processingRules;
    loaded.downstreamRecipes = catalog.downstreamFactoryRecipes;
    return loaded;
  }
  async function fetchJson(url) {
    if (typeof g.fetch !== 'function') throw new Error('STARTUP_BASELINE_FETCH_UNAVAILABLE:' + url);
    var response = await g.fetch(url, { cache: 'default' });
    if (!response || response.ok === false) throw new Error('STARTUP_BASELINE_FETCH_FAILED:' + url);
    return response.json();
  }
  function loadSources() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetchJson(PATHS.policy),
      fetchJson(PATHS.economyRules),
      fetchJson(PATHS.industrialCatalog),
      fetchJson(PATHS.sites),
      fetchJson(PATHS.countryProfiles)
    ]).then(function (values) {
      data = checkData({
        policy: values[0], economyRules: values[1], industrialCatalog: values[2],
        siteDocument: values[3], countryDocument: values[4]
      });
      return { status: 'READY', version: VERSION, countryCount: data.countryProfiles.length,
        resourceProfileCount: Object.keys(data.resourceProfiles).length,
        factoryProfileCount: Object.keys(data.factoryProfiles).length };
    }).catch(function (error) {
      data = null;
      loadPromise = null;
      return { status: 'BLOCKED', reason: String(error && error.message || error), version: VERSION };
    });
    return loadPromise;
  }
  function utilityCapabilityRows(resourceState) {
    var caps = resourceState && resourceState.technologyCapabilities;
    return Array.isArray(caps) ? caps : null;
  }
  function capabilityAvailable(row) {
    return ['COMPLETE', 'COMPLETED', 'AVAILABLE', 'UNLOCKED', 'OPERATIONAL', 'ACTIVE']
      .indexOf(id(row && row.status)) >= 0;
  }
  function installStarterTechnology(resourceState, typeProfile, countryId, turn) {
    var required = Array.isArray(typeProfile && typeProfile.requiredTechnologyIds)
      ? typeProfile.requiredTechnologyIds.map(id).filter(Boolean) : [];
    if (!required.length) return { ready: true, required: [] };
    if (!own(resourceState, 'technologyCapabilities')) resourceState.technologyCapabilities = [];
    var capabilities = utilityCapabilityRows(resourceState);
    if (!capabilities) return { ready: false, required: required, reason: 'TECHNOLOGY_CAPABILITY_STATE_INVALID' };
    var knownTech = data.industrialCatalog.technologyProjects || {};
    var unverified = required.filter(function (tech) { return !own(knownTech, tech); });
    if (unverified.length) return { ready: false, required: required, reason: 'TECHNOLOGY_NOT_IN_CANONICAL_CATALOG', missing: unverified };
    var policy = data.policy.startupFactories || {};
    if (policy.seedTechnologyCapabilitiesForStarterAssets !== true) {
      var missing = required.filter(function (tech) {
        return !capabilities.some(function (row) { return id(row && row.technologyId) === tech && capabilityAvailable(row); });
      });
      return { ready: missing.length === 0, required: required, missing: missing };
    }
    var missing = [], seededCount = 0;
    required.forEach(function (tech) {
      var matching = capabilities.filter(function (row) { return id(row && row.technologyId) === tech; });
      if (matching.some(capabilityAvailable)) return;
      // Do not turn an explicitly LOCKED/RESEARCHING/FAILED capability into an
      // available technology. Preserve that gameplay state and keep the starter
      // factory gated until the player completes the real technology path.
      if (matching.length) {
        missing.push(tech);
        return;
      }
      capabilities.push({
        technologyId: tech,
        targetSiteId: '*',
        targetResourceId: '*',
        targetSiteType: '*',
        sourceType: 'SIMULATED_STARTUP_BASELINE',
        status: 'AVAILABLE',
        grantedTurn: turn,
        authority: policy.technologyCapabilityAuthority || 'SIMULATED_STARTUP_BASELINE_CAPABILITY',
        simulationOnly: true,
        provenance: {
          authority: 'SIMULATED_STARTUP_BASELINE_V1',
          factoryType: id(typeProfile.factoryType),
          countryId: countryId,
          statement: 'Scenario capability for an explicitly simulated opening factory asset; not a real-world technology observation.'
        }
      });
      seededCount++;
    });
    return { ready: missing.length === 0, required: required, seededCount: seededCount, missing: missing };
  }
  function inputKeys(asset) {
    var map = object(asset && (asset.inputCoefficients || asset.inputs)) || {};
    return Object.keys(map).map(token).filter(Boolean);
  }
  function outputKeys(asset) {
    var out = object(asset && (asset.outputProfile || asset.outputs)) || {};
    if (Object.keys(out).length) return Object.keys(out).map(token).filter(Boolean);
    var recipeId = String(asset && asset.recipeId || '').trim();
    if (recipeId && data.downstreamRecipes[recipeId]) return Object.keys(data.downstreamRecipes[recipeId].outputs || {}).map(token).filter(Boolean);
    var input = inputKeys(asset);
    if (input.length === 1 && data.processingRules[input[0]]) {
      return Object.keys(data.processingRules[input[0]].outputs || {}).map(token).filter(Boolean);
    }
    return [];
  }
  function assetType(asset) {
    return normalizeFactoryType(asset && (asset.factoryType || asset.type || asset.facilityType));
  }
  function sameValues(left, right) {
    var a = (left || []).map(token).filter(Boolean).sort();
    var b = (right || []).map(token).filter(Boolean).sort();
    return a.length === b.length && a.every(function (value, index) { return value === b[index]; });
  }
  function existingProcessor(assets, group, recipe) {
    return assets.find(function (asset) {
      if (!asset || assetType(asset) !== normalizeFactoryType(recipe.factoryType || 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT')) return false;
      return sameValues(inputKeys(asset), Object.keys(recipe.inputs || {})) &&
        sameValues(outputKeys(asset), Object.keys(recipe.outputs || {}));
    }) || null;
  }
  function existingRecipe(assets, recipeId, factoryType) {
    return assets.find(function (asset) {
      if (!asset || assetType(asset) !== normalizeFactoryType(factoryType)) return false;
      var savedRecipeId = String(asset.recipeId || asset.factoryProfile && asset.factoryProfile.defaultRecipeId || '').trim();
      if (savedRecipeId && savedRecipeId === recipeId) return true;
      return false;
    }) || null;
  }
  function makeFactoryAsset(countryId, type, recipeId, recipe, profile, extra, status, turn) {
    var inputs = object(recipe && recipe.inputs) || {};
    var outputs = object(recipe && recipe.outputs) || {};
    var capacity = positive(profile && profile.defaultCapacityPerDay);
    var cycleDays = positive(recipe && recipe.cycleDays) || positive(profile && profile.cycleDays) || 1;
    var assetId = extra && extra.assetId || ('STARTUP-FAC-' + (extra && extra.priority || '10') + '-' + countryId + '-' +
      (recipeId ? String(type) : String(token(extra && extra.resourceId || 'UNKNOWN')).toUpperCase()));
    var requiredTechnologyIds = Array.isArray(profile && profile.requiredTechnologyIds)
      ? profile.requiredTechnologyIds.map(id).filter(Boolean) : [];
    return {
      id: assetId,
      countryId: countryId,
      stage: 'PROCESSING',
      factoryType: type,
      recipeId: recipeId || null,
      recipeMode: Object.keys(inputs).length > 1 ? 'MULTI_INPUT' : 'SINGLE_INPUT',
      recipeAuthority: recipe && (recipe.recipeAuthority || recipe.authority) ||
        (recipeId ? 'SIMULATED_STARTUP_CATALOG_RECIPE' : 'INDUSTRIAL_CATALOG_RULE'),
      capacity: capacity || 1,
      capacityPerDay: capacity || 1,
      locationNodeKey: 'INDUSTRIAL_ZONE:' + countryId,
      status: status || 'OPERATIONAL',
      inputCoefficients: clone(inputs),
      outputProfile: clone(outputs),
      cycleDays: cycleDays,
      inputInventory: {},
      inputBatchLots: [],
      inputUnit: recipe && recipe.inputUnit || profile && profile.inputUnit || 'SIMULATION_RESOURCE_UNIT',
      outputUnit: recipe && recipe.outputUnit || profile && profile.outputUnit || 'SIMULATION_RESOURCE_UNIT',
      productionHealth: {
        status: 'STOPPED',
        productivityPct: 0,
        reason: 'NO_FACTORY_INPUTS',
        missingInputs: Object.keys(inputs),
        updatedTurn: turn,
        authority: 'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1'
      },
      requireTrackedInputs: Object.keys(inputs).length > 1 || profile && profile.requireTrackedInputs === true,
      workforce: clone(profile && profile.workforce || {}),
      employmentProfile: clone(profile && profile.employment || null),
      utilityRequirements: clone(profile && profile.utilities || { electricityMWhPerDay: 0, waterM3PerDay: 0 }),
      requiredInfrastructure: clone(profile && profile.requiredInfrastructure || []),
      companyId: 'SIMULATED_STARTUP_BASELINE',
      simulationOnly: true,
      authority: 'SIMULATED_STARTUP_BASELINE_V1',
      transportAccess: ['road', 'rail', 'ship'],
      commissionedTurn: turn,
      requiredTechnologyIds: requiredTechnologyIds,
      startupBaselineV1: {
        version: VERSION,
        notObservedFacility: true,
        sourceFile: extra && extra.sourceFile || 'resource_industrial_catalog_v1.json',
        sourceSiteIds: clone(extra && extra.sourceSiteIds || []),
        sourceResourceIds: clone(extra && extra.sourceResourceIds || []),
        sourceSiteAuthority: extra && extra.sourceSiteIds && extra.sourceSiteIds.length
          ? 'SCENARIO_SIMULATION_DATA' : 'EXISTING_CATALOG_RECIPE_GRAPH',
        recipeId: recipeId || null,
        reserveQuantityUsedAsWarehouseStock: false,
        provenance: 'SCENARIO_STARTUP_FACTORY_ASSET_NOT_A_REAL_WORLD_FACILITY'
      }
    };
  }
  function sourceAssetOutputs(assets) {
    var products = Object.create(null);
    assets.forEach(function (asset) {
      if (!asset || ['CLOSED', 'DECOMMISSIONED', 'BLOCKED', 'TECHNOLOGY_LOCKED', 'UNDER_CONSTRUCTION', 'MAINTENANCE'].indexOf(id(asset.status)) >= 0) return;
      outputKeys(asset).forEach(function (product) { products[product] = true; });
    });
    return products;
  }
  function addProductOutputs(products, outputProfile) {
    Object.keys(outputProfile || {}).forEach(function (key) {
      var normalized = token(key);
      if (normalized) products[normalized] = true;
    });
  }
  function startupFactoryCountry(state, profile, turn, groups) {
    var econHit = bucketFor(state, 'economy', profile, true);
    var resourceHit = bucketFor(state, 'resource', profile, true);
    if (econHit.invalid || resourceHit.invalid || !econHit.value || !resourceHit.value) {
      return { status: 'BLOCKED', reason: 'COUNTRY_STATE_BUCKET_INVALID', countryId: id(profile.iso3) };
    }
    var economy = econHit.value, resource = resourceHit.value;
    var marker = object(economy.startupBaselineV1);
    var assets = Array.isArray(economy.productionAssets) ? economy.productionAssets : null;
    if (!assets && !own(economy, 'productionAssets')) {
      economy.productionAssets = [];
      assets = economy.productionAssets;
    }
    if (!assets) {
      return { status: 'BLOCKED', reason: 'EXISTING_FACTORY_ASSET_STATE_INVALID', countryId: id(profile.iso3) };
    }
    var countryId = id(profile.iso3);
    var policy = data.policy.startupFactories || {};
    var created = [], existingCount = assets.length;
    if (marker && marker.version === VERSION && marker.factoryAssetsInitialized === true) {
      return { status: 'ALREADY_INITIALIZED', countryId: countryId, created: 0,
        assetCount: assets.length, existingCount: assets.length, siteResourceGroupCount: (groups || []).length };
    }
    var factoryProfiles = data.factoryProfiles;
    var processingRules = data.processingRules;
    var groupList = groups || [];
    var availableProducts = sourceAssetOutputs(assets);
    var chosenDownstreamTypes = Object.create(null);
    assets.forEach(function (asset) {
      var t = assetType(asset);
      if (t) chosenDownstreamTypes[t] = true;
    });
    groupList.forEach(function (group) {
      var recipe = processingRules[group.resourceId];
      if (!recipe) return;
      var normalizedType = normalizeFactoryType(recipe.factoryType || 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT');
      if (!own(factoryProfiles, normalizedType)) return;
      var duplicate = existingProcessor(assets, group, recipe);
      if (duplicate) {
        outputKeys(duplicate).forEach(function (product) { availableProducts[product] = true; });
        return;
      }
      var typeProfile = factoryProfiles[normalizedType];
      var tech = installStarterTechnology(resource, typeProfile, countryId, turn);
      var status = tech.ready ? 'OPERATIONAL' : 'TECHNOLOGY_LOCKED';
      var multiplierTable = policy.processorSiteCountCapacityMultipliers || {};
      var count = group.siteIds.length;
      var multiplier = count >= 4 ? positive(multiplierTable['4plus']) :
        positive(multiplierTable[String(count)]) || 1;
      var processorRecipe = {
        inputs: recipe.inputs || { [group.resourceId]: 1 },
        outputs: recipe.outputs || {},
        cycleDays: recipe.cycleDays || 1,
        inputUnit: recipe.inputUnit || 'SIMULATION_RESOURCE_UNIT',
        outputUnit: recipe.outputUnit || 'SIMULATION_RESOURCE_UNIT',
        recipeAuthority: 'INDUSTRIAL_CATALOG_RULE'
      };
      var capacity = (positive(typeProfile.defaultCapacityPerDay) || 1) * (multiplier || 1);
      var asset = makeFactoryAsset(countryId, normalizedType, null, processorRecipe, typeProfile, {
        assetId: 'STARTUP-FAC-00-' + countryId + '-' + id(group.resourceId),
        priority: '00',
        resourceId: group.resourceId,
        sourceSiteIds: group.siteIds,
        sourceResourceIds: [group.resourceId],
        sourceFile: PATHS.sites
      }, status, turn);
      asset.capacity = capacity;
      asset.capacityPerDay = capacity;
      asset.startupBaselineV1.sourceSiteCount = group.siteIds.length;
      asset.startupBaselineV1.sourceSiteNames = clone(group.siteNames || []);
      asset.startupBaselineV1.siteCapacityMultiplier = multiplier || 1;
      assets.push(asset);
      created.push(asset);
      addProductOutputs(availableProducts, asset.outputProfile);
    });

    var factoryPolicy = policy;
    var minLocalCount = Math.max(1, Math.floor(finite(factoryPolicy.minimumLocallySupportedInputCount) || 2));
    var minLocalShare = Math.max(0, Math.min(1, finite(factoryPolicy.minimumLocallySupportedInputShare) === null
      ? 0.5 : finite(factoryPolicy.minimumLocallySupportedInputShare)));
    var maxDownstream = Math.max(0, Math.floor(finite(factoryPolicy.maxDownstreamAssetsPerCountry) === null
      ? 3 : finite(factoryPolicy.maxDownstreamAssetsPerCountry)));
    var downstreamEntries = Object.keys(data.downstreamRecipes).map(function (recipeId) {
      var recipe = data.downstreamRecipes[recipeId] || {};
      var inputs = object(recipe.inputs) || {};
      var inputNames = Object.keys(inputs).map(token).filter(Boolean);
      var locallySupported = inputNames.filter(function (name) { return !!availableProducts[name]; });
      return {
        recipeId: recipeId,
        recipe: recipe,
        factoryType: normalizeFactoryType(recipe.factoryType),
        inputNames: inputNames,
        locallySupportedInputIds: locallySupported,
        externalInputResourceIds: inputNames.filter(function (name) { return !availableProducts[name]; }),
        localInputShare: inputNames.length ? locallySupported.length / inputNames.length : 0
      };
    }).filter(function (entry) {
      return !!entry.factoryType && own(factoryProfiles, entry.factoryType) &&
        entry.inputNames.length > 0 && Object.keys(entry.recipe.outputs || {}).length > 0;
    }).sort(function (a, b) {
      return b.localInputShare - a.localInputShare ||
        b.locallySupportedInputIds.length - a.locallySupportedInputIds.length ||
        a.recipeId.localeCompare(b.recipeId);
    });
    var downstreamCreated = 0;
    downstreamEntries.forEach(function (entry) {
      var recipe = entry.recipe;
      var recipeId = entry.recipeId;
      var factoryType = entry.factoryType;
      var inputs = object(recipe.inputs) || {};
      var outputs = object(recipe.outputs) || {};
      var inputNames = entry.inputNames;
      if (chosenDownstreamTypes[factoryType]) return;
      if (entry.locallySupportedInputIds.length < minLocalCount || entry.localInputShare + 1e-9 < minLocalShare) return;
      if (downstreamCreated >= maxDownstream) return;
      var existing = existingRecipe(assets, recipeId, factoryType);
      if (existing) {
        chosenDownstreamTypes[factoryType] = true;
        outputKeys(existing).forEach(function (product) { availableProducts[product] = true; });
        return;
      }
      // Existing country assets are authoritative. A starter baseline never adds a
      // duplicate factory type just because a different recipe might also fit.
      var alreadyType = assets.some(function (asset) { return asset && assetType(asset) === factoryType; });
      if (alreadyType) return;
      var typeProfile = factoryProfiles[factoryType];
      var tech = installStarterTechnology(resource, typeProfile, countryId, turn);
      var status = tech.ready ? 'OPERATIONAL' : 'TECHNOLOGY_LOCKED';
      var asset = makeFactoryAsset(countryId, factoryType, recipeId, recipe, typeProfile, {
        assetId: 'STARTUP-FAC-10-' + countryId + '-' + factoryType,
        priority: '10',
        sourceResourceIds: entry.locallySupportedInputIds,
        sourceFile: 'resource_industrial_catalog_v1.json:downstreamFactoryRecipes'
      }, status, turn);
      asset.startupBaselineV1.locallySupportedInputIds = clone(entry.locallySupportedInputIds);
      asset.startupBaselineV1.locallySupportedInputShare = entry.localInputShare;
      asset.startupBaselineV1.externalInputResourceIds = clone(entry.externalInputResourceIds);
      asset.startupBaselineV1.externalInputsRequireConfirmedSupply = entry.externalInputResourceIds.length > 0;
      asset.startupBaselineV1.newStarterOutputsDoNotSeedAdditionalFactoryAssets = true;
      assets.push(asset);
      created.push(asset);
      chosenDownstreamTypes[factoryType] = true;
      downstreamCreated++;
      // Intentionally do not add these unstocked, inactive recipe outputs to
      // availableProducts. A planned/idle factory is not a delivered producer.
    });

    var utilityTarget = { electricityMWhPerDay: 0, waterM3PerDay: 0 };
    // If national utility capacity is absent, ensure a scenario opening allowance
    // for all already-built and newly-seeded operational assets, not only new ones.
    assets.forEach(function (asset) {
      if (!asset || id(asset.status || 'OPERATIONAL') !== 'OPERATIONAL') return;
      var assetTypeKey = assetType(asset);
      var typeProfile = factoryProfiles[assetTypeKey] || {};
      var recordedUtility = object(asset.utilityRequirements);
      var utility = recordedUtility || object(typeProfile.utilities) || {};
      utilityTarget.electricityMWhPerDay += Math.max(0, finite(utility.electricityMWhPerDay) || 0);
      utilityTarget.waterM3PerDay += Math.max(0, finite(utility.waterM3PerDay) || 0);
    });
    var utilityResult = ensureStartupUtilitySupply(state, profile, utilityTarget, turn);
    var profilePop = positive(profile.populationValues && profile.populationValues.population_2015);
    var sourceUnemployment = finite(profile.sourceValues && profile.sourceValues.unemployment_rate);
    var populationKnown = positive(economy.population_2015) !== null || profilePop !== null;
    var unemploymentKnown = finite(economy.unemployment_rate) !== null || sourceUnemployment !== null;
    var existingMarker = object(economy.startupBaselineV1) || {};
    economy.startupBaselineV1 = {
      version: VERSION,
      status: 'INITIALIZED',
      factoryAssetsInitialized: true,
      countryId: countryId,
      initializedTurn: turn,
      sourceContextAuthority: 'EXISTING_GAME_BASELINE_NOT_EXTERNALLY_REVALIDATED',
      sourceFiles: [PATHS.countryProfiles, PATHS.sites, PATHS.industrialCatalog],
      simulatedSiteResourceGroupCount: groupList.length,
      factoryAssetsCreated: created.length,
      factoryAssetsPresentAfterInitialization: assets.length,
      factoryAssetIdsCreated: created.map(function (asset) { return asset.id; }),
      factoryProfileTypesUsed: Array.from(new Set(created.map(function (asset) { return asset.factoryType; }))),
      populationContextAvailable: populationKnown,
      unemploymentContextAvailable: unemploymentKnown,
      utilitySupply: utilityResult,
      factoryAssetsNotObservedFacilities: true,
      previousBaselineMarkerPreserved: !!(existingMarker.version && existingMarker.version !== VERSION),
      previousMarkerVersion: existingMarker.version || null,
      previousMarker: existingMarker.version && existingMarker.version !== VERSION ? clone(existingMarker) : null
    };
    created.forEach(function (asset) {
      dispatchEvent('OMEGA_FACTORY_CAPACITY_CHANGED', {
        countryId: countryId, factoryId: asset.id, capacity: asset.capacityPerDay,
        status: asset.status, startupBaseline: true, authority: 'SIMULATED_STARTUP_BASELINE_V1'
      });
    });
    return {
      status: 'INITIALIZED',
      countryId: countryId,
      created: created.length,
      assetCount: assets.length,
      existingCount: existingCount,
      siteResourceGroupCount: groupList.length,
      factoryTypesUsed: Array.from(new Set(created.map(function (asset) { return asset.factoryType; }))),
      utilitySupply: utilityResult
    };
  }
  function ensureStartupUtilitySupply(state, profile, requested, turn) {
    var policy = data.policy.simulatedUtilities || {};
    if (policy.enabled !== true || requested.electricityMWhPerDay + requested.waterM3PerDay <= 0) {
      return { status: 'NOT_REQUIRED', seeded: false };
    }
    var hit = bucketFor(state, 'transport', profile, true);
    if (hit.invalid || !hit.value) return { status: 'BLOCKED', reason: 'TRANSPORT_STATE_BUCKET_INVALID', seeded: false };
    var transport = hit.value;
    if (!own(transport, 'infrastructure')) transport.infrastructure = {};
    var infrastructure = object(transport.infrastructure);
    if (!infrastructure) return { status: 'BLOCKED', reason: 'EXISTING_INFRASTRUCTURE_STATE_INVALID', seeded: false };
    if (own(infrastructure, 'utilitySupply') && infrastructure.utilitySupply !== null &&
        !object(infrastructure.utilitySupply)) {
      return { status: 'BLOCKED', reason: 'EXISTING_UTILITY_SUPPLY_STATE_INVALID', seeded: false };
    }
    var supply = object(infrastructure.utilitySupply);
    var multiplier = positive(policy.reserveMultiplier) || 1;
    var neededPower = Math.max(0, requested.electricityMWhPerDay * multiplier);
    var neededWater = Math.max(0, requested.waterM3PerDay * multiplier);
    var created = !supply;
    if (!supply) supply = {};
    var seededFields = [];
    if (!own(supply, 'electricityMWhPerDay') && neededPower > 0) {
      supply.electricityMWhPerDay = Number(neededPower.toFixed(6));
      seededFields.push('electricityMWhPerDay');
    }
    if (!own(supply, 'waterM3PerDay') && neededWater > 0) {
      supply.waterM3PerDay = Number(neededWater.toFixed(6));
      seededFields.push('waterM3PerDay');
    }
    if (created || seededFields.length) {
      supply.status = supply.status || 'AVAILABLE';
      supply.authority = supply.authority || 'SIMULATED_STARTUP_UTILITY_BASELINE_V1';
      supply.simulationOnly = true;
      supply.baselineVersion = VERSION;
      supply.baselineTurn = turn;
      supply.reserveMultiplier = multiplier;
      supply.provenance = supply.provenance || {
        sourceType: 'SIMULATED_STARTUP_UTILITY_BASELINE',
        sourceFile: PATHS.industrialCatalog,
        statement: 'Capacity is a scenario-only opening utility allowance derived from existing catalog requirements; it is not a claim about real national grid/water capacity.'
      };
      infrastructure.utilitySupply = supply;
    }
    var power = finite(supply.electricityMWhPerDay), water = finite(supply.waterM3PerDay);
    var powerGap = power === null ? neededPower : Math.max(0, neededPower - power);
    var waterGap = water === null ? neededWater : Math.max(0, neededWater - water);
    return {
      status: powerGap > 1e-9 || waterGap > 1e-9 ? 'EXISTING_CAPACITY_BELOW_STARTER_NEED' : 'AVAILABLE',
      seeded: created || seededFields.length > 0,
      seededFields: seededFields,
      requested: { electricityMWhPerDay: neededPower, waterM3PerDay: neededWater },
      preservedExisting: { electricityMWhPerDay: power, waterM3PerDay: water },
      shortfall: { electricityMWhPerDay: powerGap, waterM3PerDay: waterGap },
      authority: supply.authority || 'EXISTING_GAME_STATE'
    };
  }
  function populateMissingCountryContext(state, profile, economy) {
    var added = [];
    var profilePopulation = positive(profile.populationValues && profile.populationValues.population_2015);
    var profileUnemployment = finite(profile.sourceValues && profile.sourceValues.unemployment_rate);
    if (!own(economy, 'population_2015') && profilePopulation !== null) {
      economy.population_2015 = profilePopulation;
      added.push('population_2015');
    }
    if (!own(economy, 'unemployment_rate') && profileUnemployment !== null && profileUnemployment >= 0 && profileUnemployment <= 100) {
      economy.unemployment_rate = profileUnemployment;
      added.push('unemployment_rate');
    }
    return {
      addedFields: added,
      sourceAuthority: 'EXISTING_GAME_BASELINE_NOT_EXTERNALLY_REVALIDATED',
      populationKnown: positive(economy.population_2015) !== null,
      unemploymentKnown: finite(economy.unemployment_rate) !== null
    };
  }
  function declaredUnitBridge(sourceUnit, targetUnit) {
    var source = String(sourceUnit || '').trim(), target = String(targetUnit || '').trim();
    if (!source || !target) return null;
    if (token(source) === token(target)) return { factor: 1, sourceUnit: source, targetUnit: target };
    var normalization = object(data.industrialCatalog.factoryCatalogPolicy &&
      data.industrialCatalog.factoryCatalogPolicy.unitNormalization) || {};
    var sourceUnits = object(normalization.sourceUnits) || {};
    var row = sourceUnits[source.toUpperCase()] || sourceUnits[token(source).toUpperCase()] || null;
    var factor = finite(row && row.factor);
    if (!row || row.simulationOnly !== true || token(row.targetUnit) !== token(target) ||
        factor === null || factor <= 0) return null;
    return { factor: factor, sourceUnit: source, targetUnit: target,
      authority: row.authority || normalization.authority || 'SIMULATION_ONLY_UNIT_NORMALIZATION',
      simulationOnly: true };
  }
  function mappedStockUnit(profile) {
    var rateUnit = String(profile && profile.unit || '').trim();
    var table = data.economyRules.demand.stockUnitByRateUnit || {};
    return own(table, rateUnit) && String(table[rateUnit] || '').trim()
      ? String(table[rateUnit]).trim() : null;
  }
  function inventoryUnitFor(resourceId, profile, existingUnits, rateSource) {
    var existingKey = findKeyByToken(existingUnits, resourceId);
    var recorded = existingKey !== null ? String(existingUnits[existingKey] || '').trim() : '';
    var expected = mappedStockUnit(profile);
    var sourceType = String(rateSource || 'RULE_PROFILE_POPULATION_BASELINE');
    if (sourceType === 'OBSERVED_RESOURCE_CONSUMPTION') {
      if (recorded) return { unit: recorded, source: 'EXISTING_INVENTORY_UNIT', quantityFactor: 1 };
      if (expected) return { unit: expected, source: 'BASELINE_RULES_UNIT_MAP', quantityFactor: 1 };
      return { unit: null, source: 'UNKNOWN_OBSERVED_CONSUMPTION_UNIT', quantityFactor: 1 };
    }
    if (!expected) {
      // A per-capita coefficient has no trustworthy unit without a declared profile
      // rate-unit mapping. An existing unit label alone cannot repair that gap.
      return { unit: null, source: 'UNKNOWN_PROFILE_RATE_UNIT', quantityFactor: 1 };
    }
    if (!recorded) return { unit: expected, source: 'BASELINE_RULES_UNIT_MAP', quantityFactor: 1 };
    var bridge = declaredUnitBridge(expected, recorded);
    if (!bridge) return { unit: null, source: 'INCOMPATIBLE_EXISTING_STOCK_UNIT', quantityFactor: 1 };
    return {
      unit: recorded,
      source: bridge.simulationOnly ? 'DECLARED_SIMULATION_UNIT_BRIDGE' : 'EXISTING_INVENTORY_UNIT',
      quantityFactor: bridge.factor,
      unitBridgeAuthority: bridge.authority || 'IDENTICAL_DECLARED_UNIT',
      simulationOnlyUnitBridge: bridge.simulationOnly === true
    };
  }
  function observedFactoryInputRate(resourceId, assets, resource) {
    var total = 0, stockUnit = null, factories = [], units = object(resource && resource.inventoryUnits) || {};
    var profile = data.resourceProfiles[resourceId] || data.resourceProfiles[token(resourceId)] || null;
    var existingKey = findKeyByToken(units, resourceId);
    var recordedUnit = existingKey === null ? null : String(units[existingKey] || '').trim() || null;
    var expectedUnit = mappedStockUnit(profile);
    var storageUnit = recordedUnit || expectedUnit;
    (Array.isArray(assets) ? assets : []).forEach(function (asset) {
      if (!asset || ['CLOSED', 'DECOMMISSIONED', 'BLOCKED', 'TECHNOLOGY_LOCKED', 'UNDER_CONSTRUCTION',
        'MAINTENANCE', 'CANCELLED', 'CANCELED', 'DESTROYED', 'OFFLINE', 'PAUSED', 'SUSPENDED', 'FAILED']
        .indexOf(id(asset.status)) >= 0) return;
      var inputs = object(asset.inputCoefficients || asset.inputs) || {};
      var key = findKeyByToken(inputs, resourceId);
      if (key === null) return;
      var coefficient = positive(inputs[key]);
      var capacity = positive(asset.capacityPerDay || asset.ratedCapacityPerDay ||
        asset.productionCapacity || asset.capacity);
      var cycle = positive(asset.cycleDays) || 1;
      if (coefficient === null || capacity === null) return;
      var inputUnits = object(asset.inputUnits) || {};
      var inputUnitKey = findKeyByToken(inputUnits, resourceId);
      var targetUnit = inputUnitKey !== null && String(inputUnits[inputUnitKey] || '').trim()
        ? String(inputUnits[inputUnitKey]).trim()
        : String(asset.inputUnit || asset.recipeInputUnit || 'SIMULATION_RESOURCE_UNIT').trim();
      var currentStockUnit = storageUnit || targetUnit;
      var bridge = declaredUnitBridge(currentStockUnit, targetUnit);
      if (!bridge) return;
      var rate = capacity * coefficient / cycle / bridge.factor;
      if (!(rate > 0) || !Number.isFinite(rate)) return;
      if (stockUnit && token(stockUnit) !== token(currentStockUnit)) return;
      stockUnit = currentStockUnit;
      storageUnit = currentStockUnit;
      total += rate;
      factories.push(String(asset.id || asset.assetId || asset.factoryType || 'UNNAMED_FACTORY'));
    });
    return total > 0 ? { rate: total, unit: String(stockUnit || 'SIMULATION_RESOURCE_UNIT'),
      source: 'EXISTING_FACTORY_INPUT_RATE', factoryIds: factories } : null;
  }
  function seedCountryStock(state, profile, economy, resource, assets, turn) {
    var marker = object(resource.startupBaselineV1);
    if (marker && marker.version === VERSION && marker.openingStockInitialized === true) {
      return {
        status: 'ALREADY_INITIALIZED',
        seeded: 0,
        preserved: marker.existingStockPreservedCount || 0,
        unknownResourceIds: clone(marker.unknownResourceIds || []),
        sourceCounts: clone(marker.stockSourceCounts || {})
      };
    }
    var policies = data.policy.openingStock || {};
    var inventoryPresent = own(resource, 'inventory');
    var inventory = object(resource.inventory);
    if (!inventory && inventoryPresent) {
      return { status: 'BLOCKED', reason: 'EXISTING_RESOURCE_INVENTORY_STATE_INVALID',
        seeded: 0, preserved: 0, unknownResourceIds: Object.keys(data.resourceProfiles) };
    }
    if (!inventory) inventory = resource.inventory = {};
    var unitsPresent = own(resource, 'inventoryUnits');
    var inventoryUnits = object(resource.inventoryUnits);
    if (!inventoryUnits && unitsPresent) {
      return { status: 'BLOCKED', reason: 'EXISTING_RESOURCE_INVENTORY_UNITS_INVALID',
        seeded: 0, preserved: 0, unknownResourceIds: Object.keys(data.resourceProfiles) };
    }
    if (!inventoryUnits) inventoryUnits = resource.inventoryUnits = {};
    var siteProfile = profile.populationValues || {};
    var storedPopulation = finite(economy.population_2015);
    var currentPopulation = storedPopulation !== null
      ? (storedPopulation > 0 ? storedPopulation : null)
      : positive(siteProfile.population_2015);
    var resourceProfiles = data.resourceProfiles;
    var seeded = 0, preserved = 0, unresolved = [], sourceCounts = Object.create(null), rows = [], preservedIds = [];
    var existingAssets = Array.isArray(economy.productionAssets) ? economy.productionAssets : [];
    Object.keys(resourceProfiles).forEach(function (resourceId) {
      var profileRow = resourceProfiles[resourceId] || {};
      var existingKey = findKeyByToken(inventory, resourceId);
      if (existingKey !== null) {
        preserved++;
        preservedIds.push(resourceId);
        sourceCounts.PRESERVED_EXISTING_STOCK = (sourceCounts.PRESERVED_EXISTING_STOCK || 0) + 1;
        return;
      }
      var consumption = object(resource.consumption) || {};
      var observedConsumption = positive(mapValue(consumption, resourceId));
      var factoryInput = observedFactoryInputRate(resourceId, existingAssets, resource);
      var rate = null, source = null, stockUnit = null, unitSource = null, populationForRate = null, quantityFactor = 1;
      if (observedConsumption !== null) {
        rate = observedConsumption;
        source = 'OBSERVED_RESOURCE_CONSUMPTION';
        var observedUnit = inventoryUnitFor(resourceId, profileRow, inventoryUnits, 'OBSERVED_RESOURCE_CONSUMPTION');
        stockUnit = observedUnit.unit;
        unitSource = observedUnit.source;
        quantityFactor = finite(observedUnit.quantityFactor) || 1;
      } else {
        var coefficient = positive(profileRow.basePerMillionPopulation);
        if (coefficient !== null && currentPopulation !== null) {
          rate = coefficient * currentPopulation / 1000000;
          source = 'RULE_PROFILE_POPULATION_BASELINE';
          populationForRate = currentPopulation;
          var mappedUnit = inventoryUnitFor(resourceId, profileRow, inventoryUnits, 'RULE_PROFILE_POPULATION_BASELINE');
          stockUnit = mappedUnit.unit;
          unitSource = mappedUnit.source;
          quantityFactor = finite(mappedUnit.quantityFactor) || 1;
        } else if (factoryInput) {
          // Metadata-only resource identities may be modeled only when an actual
          // eligible factory input supplies a rate; never invent their profile rate.
          rate = factoryInput.rate;
          source = factoryInput.source;
          stockUnit = factoryInput.unit || 'SIMULATION_RESOURCE_UNIT';
          unitSource = 'EXISTING_FACTORY_RECIPE_UNIT';
        }
      }
      if (rate === null || !(rate > 0) || !Number.isFinite(rate)) {
        unresolved.push(resourceId);
        return;
      }
      if (!stockUnit) {
        unresolved.push(resourceId);
        return;
      }
      var days = positive(policies.coverageDays);
      if (days === null) days = 14;
      var quantity = Number((rate * days * quantityFactor).toPrecision(12));
      if (!(quantity > 0) || !Number.isFinite(quantity)) {
        unresolved.push(resourceId);
        return;
      }
      inventory[resourceId] = quantity;
      if (!own(inventoryUnits, resourceId) && findKeyByToken(inventoryUnits, resourceId) === null) {
        inventoryUnits[resourceId] = stockUnit;
      } else {
        var unitKey = findKeyByToken(inventoryUnits, resourceId);
        if (unitKey === null) inventoryUnits[resourceId] = stockUnit;
      }
      seeded++;
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      // Compact per-resource provenance keeps the persisted save bounded on Android.
      // Common authority, source files, coverage days, and source definitions live on
      // the country marker rather than being repeated for every resource.
      rows.push({
        resourceId: resourceId,
        quantity: quantity,
        unit: stockUnit,
        dailyRate: rate,
        demandSource: source,
        profileRateUnit: profileRow.unit || null,
        populationUsed: populationForRate,
        unitSource: unitSource,
        unitConversionFactor: quantityFactor,
        factoryIds: factoryInput && factoryInput.factoryIds || []
      });
    });
    var countryId = id(profile.iso3);
    var previousMarker = object(resource.startupBaselineV1) || {};
    resource.startupBaselineV1 = {
      version: VERSION,
      status: unresolved.length ? 'INITIALIZED_WITH_UNKNOWN_ROWS' : 'INITIALIZED',
      openingStockInitialized: true,
      countryId: countryId,
      initializedTurn: turn,
      openingStockCoverageDays: positive(policies.coverageDays) || 14,
      openingStockSeededCount: seeded,
      existingStockPreservedCount: preserved,
      unknownResourceIds: unresolved,
      preservedResourceIds: preservedIds,
      stockSourceCounts: sourceCounts,
      authority: 'SIMULATED_STARTUP_BASELINE_V1',
      stockRows: rows,
      stockRowsEncoding: 'COMPACT_PER_RESOURCE_PROVENANCE_V1',
      stockAuthority: policies.stockAuthority || 'SIMULATED_STARTUP_STOCK',
      sourceFiles: [PATHS.policy, PATHS.economyRules, PATHS.countryProfiles],
      geologicalReserveQuantityUsedAsStock: false,
      previousMarkerVersion: previousMarker.version && previousMarker.version !== VERSION ? previousMarker.version : null,
      previousMarker: previousMarker.version && previousMarker.version !== VERSION ? clone(previousMarker) : null
    };
    return { status: unresolved.length ? 'INITIALIZED_WITH_UNKNOWN_ROWS' : 'INITIALIZED',
      seeded: seeded, preserved: preserved, unknownResourceIds: unresolved, sourceCounts: sourceCounts };
  }
  function seedCountryContext(state, profile) {
    var econHit = bucketFor(state, 'economy', profile, true);
    if (econHit.invalid || !econHit.value) return { status: 'BLOCKED', reason: 'ECONOMY_STATE_BUCKET_INVALID' };
    return populateMissingCountryContext(state, profile, econHit.value);
  }
  function reportCountry(state, profile, groupList, factoryResult, stockResult, contextResult) {
    var resourceHit = bucketFor(state, 'resource', profile, false);
    var economyHit = bucketFor(state, 'economy', profile, false);
    var resourceMarker = resourceHit.value && object(resourceHit.value.startupBaselineV1) || {};
    var economyMarker = economyHit.value && object(economyHit.value.startupBaselineV1) || {};
    return {
      countryId: id(profile.iso3),
      countryCode: id(profile.countryCode),
      name: profile.name || profile.officialName || null,
      profileStatus: profile.profileStatus || 'UNKNOWN',
      populationKnown: contextResult && contextResult.populationKnown === true,
      unemploymentKnown: contextResult && contextResult.unemploymentKnown === true,
      simulatedSiteResourceGroupCount: (groupList || []).length,
      openingStockStatus: stockResult && stockResult.status || 'NOT_RUN',
      openingStockSeeded: stockResult && stockResult.seeded || 0,
      openingStockPreserved: stockResult && stockResult.preserved || 0,
      unknownResourceIds: clone(stockResult && stockResult.unknownResourceIds || []),
      stockSourceCounts: clone(stockResult && stockResult.sourceCounts || {}),
      factoryStatus: factoryResult && factoryResult.status || 'NOT_RUN',
      factoryAssetsCreated: factoryResult && factoryResult.status === 'ALREADY_INITIALIZED'
        ? (economyMarker.factoryAssetsCreated || 0) : (factoryResult && factoryResult.created || 0),
      factoryAssetsPresent: factoryResult && factoryResult.assetCount || economyMarker.factoryAssetsPresentAfterInitialization || 0,
      factoryTypesUsed: clone(factoryResult && factoryResult.factoryTypesUsed && factoryResult.factoryTypesUsed.length ? factoryResult.factoryTypesUsed : economyMarker.factoryProfileTypesUsed || []),
      factoryAssetIdsCreated: clone(economyMarker.factoryAssetIdsCreated || []),
      factoryContextAuthority: 'SIMULATED_STARTUP_BASELINE_V1',
      stockAuthority: resourceMarker.authority || 'SIMULATED_STARTUP_BASELINE_V1'
    };
  }
  function dispatchEvent(type, detail) {
    try {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') {
        g.dispatchEvent(new g.CustomEvent(type, { detail: clone(detail || {}) }));
      }
    } catch (_) {}
  }
  function isSessionEligible(state, session) {
    var config = data && data.policy.bootstrap || {};
    var turnLimit = finite(config.allowTurnAtOrBefore);
    if (turnLimit === null) turnLimit = 1;
    var turn = currentTurn(state);
    var createdTurn = finite(session && session.createdTurn);
    if (turn > turnLimit || (createdTurn !== null && createdTurn > turnLimit)) return false;
    var status = id(session && session.status);
    return ['READY', 'RUNNING', 'PAUSED'].indexOf(status) >= 0;
  }
  async function initializeForSession(sessionInput) {
    var loaded = await loadSources();
    if (!loaded || loaded.status !== 'READY') return loaded || { status: 'BLOCKED', reason: 'STARTUP_BASELINE_SOURCES_NOT_READY' };
    var state = rootState();
    if (!state || typeof state !== 'object') return { status: 'BLOCKED', reason: 'AUTHORITATIVE_GAME_STATE_UNAVAILABLE' };
    var currentSession = sessionFromState(state);
    var session = object(sessionInput) || currentSession;
    if (!session) return { status: 'BLOCKED', reason: 'GAME_SESSION_NOT_AVAILABLE' };
    var expectedSessionId = String(session.sessionId || '');
    var liveSessionId = String(currentSession && currentSession.sessionId || '');
    if (expectedSessionId && liveSessionId && expectedSessionId !== liveSessionId) {
      return { status: 'STALE_SESSION_IGNORED', expectedSessionId: expectedSessionId, liveSessionId: liveSessionId };
    }
    if (!isSessionEligible(state, currentSession || session)) {
      return { status: 'SKIPPED_NOT_NEW_GAME', turn: currentTurn(state), sessionId: expectedSessionId };
    }
    var playerCountryId = id((currentSession || session).playerCountryId || session.playerCountryId);
    if (!playerCountryId || playerCountryId === 'GLOBAL' || playerCountryId === 'WORLD') {
      return { status: 'BLOCKED', reason: 'PLAYER_COUNTRY_NOT_SELECTED' };
    }
    var key = expectedSessionId || playerCountryId + ':T' + currentTurn(state);
    if (running[key]) return running[key];
    running[key] = runNewGameBaseline(state, currentSession || session, key).finally(function () {
      delete running[key];
    });
    return running[key];
  }
  async function runNewGameBaseline(state, session, runKey) {
    var turn = currentTurn(state);
    var policy = data.policy || {};
    if (!object(state.simulation)) {
      if (own(state, 'simulation') && state.simulation !== null) return { status: 'BLOCKED', reason: 'SIMULATION_STATE_INVALID' };
      state.simulation = {};
    }
    if (object(state.simulation.startupBaselineV1) &&
        state.simulation.startupBaselineV1.version === VERSION &&
        state.simulation.startupBaselineV1.sessionId === String(session.sessionId || '')) {
      lastReport = clone(state.simulation.startupBaselineV1);
      return { status: 'ALREADY_INITIALIZED', report: diagnostics() };
    }
    var groups = siteGroupsByCountry(), results = [], totals = {
      countriesConsidered: data.countryProfiles.length,
      countriesCompleted: 0,
      countriesBlocked: 0,
      openingStocksSeeded: 0,
      existingStocksPreserved: 0,
      unknownStockRows: 0,
      factoryAssetsCreated: 0,
      factoryAssetCountries: 0,
      countriesWithEligibleSiteGroups: Object.keys(groups).length,
      simulatedSiteResourceGroups: 0,
      factoryTypesCreated: Object.create(null),
      unknownProfileResources: 0
    };
    data.countryProfiles.forEach(function (profile) {
      var countryId = id(profile.iso3);
      if (!countryId) {
        totals.countriesBlocked++;
        return;
      }
      var context = seedCountryContext(state, profile);
      var groupList = groups[countryId] || [];
      var factoryResult = startupFactoryCountry(state, profile, turn, groupList);
      var economyHit = bucketFor(state, 'economy', profile, false);
      var resourceHit = bucketFor(state, 'resource', profile, false);
      var economy = economyHit.value || {};
      var resource = resourceHit.value || {};
      var assets = Array.isArray(economy.productionAssets) ? economy.productionAssets : [];
      var stockResult = seedCountryStock(state, profile, economy, resource, assets, turn);
      var country = reportCountry(state, profile, groupList, factoryResult, stockResult, context);
      results.push(country);
      if (context.status === 'BLOCKED' || factoryResult.status === 'BLOCKED' || stockResult.status === 'BLOCKED') {
        totals.countriesBlocked++;
      } else {
        totals.countriesCompleted++;
      }
      totals.openingStocksSeeded += finite(stockResult.seeded) || 0;
      totals.existingStocksPreserved += finite(stockResult.preserved) || 0;
      totals.unknownStockRows += (stockResult.unknownResourceIds || []).length;
      totals.simulatedSiteResourceGroups += groupList.length;
      totals.factoryAssetsCreated += finite(factoryResult.created) || 0;
      if ((finite(factoryResult.created) || 0) > 0) totals.factoryAssetCountries++;
      (factoryResult.factoryTypesUsed || []).forEach(function (type) {
        totals.factoryTypesCreated[type] = (totals.factoryTypesCreated[type] || 0) + 1;
      });
    });
    var report = {
      version: VERSION,
      status: (totals.countriesBlocked || totals.unknownStockRows) ? 'COMPLETED_WITH_REPORTED_GAPS' : 'COMPLETED',
      sessionId: String(session.sessionId || runKey),
      playerCountryId: playerCountryId,
      initializedTurn: turn,
      authority: 'SIMULATED_STARTUP_BASELINE_V1',
      scope: 'ADDITIVE_COUNTRY_STARTUP_STATE',
      sources: {
        openingStockRules: PATHS.policy,
        demandProfiles: PATHS.economyRules,
        factoryProfilesAndRecipes: PATHS.industrialCatalog,
        mineSiteIdentityGroups: PATHS.sites,
        countryPopulationAndEconomicContext: PATHS.countryProfiles
      },
      counts: {
        countryCount: data.countryProfiles.length,
        resourceProfileCount: Object.keys(data.resourceProfiles).length,
        resourceProfilesWithPopulationRate: Object.keys(data.resourceProfiles).filter(function (rid) {
          return positive(data.resourceProfiles[rid].basePerMillionPopulation) !== null;
        }).length,
        factoryProfileCount: Object.keys(data.factoryProfiles).length,
        siteResourceGroupCount: totals.simulatedSiteResourceGroups,
        countriesWithEligibleSiteGroups: totals.countriesWithEligibleSiteGroups,
        countriesCompleted: totals.countriesCompleted,
        countriesBlocked: totals.countriesBlocked,
        openingStocksSeeded: totals.openingStocksSeeded,
        existingStocksPreserved: totals.existingStocksPreserved,
        unknownStockRows: totals.unknownStockRows,
        factoryAssetsCreated: totals.factoryAssetsCreated,
        factoryAssetCountries: totals.factoryAssetCountries
      },
      factoryTypeCountCreated: Object.keys(totals.factoryTypesCreated).length,
      factoryTypesCreated: totals.factoryTypesCreated,
      notRealWorldFacilityCount: totals.factoryAssetsCreated,
      openingStockCoverageDays: positive(policy.openingStock && policy.openingStock.coverageDays) || 14,
      automaticSupplyWindowDays: positive(data.economyRules.demand.playerSupplyLifeline &&
        data.economyRules.demand.playerSupplyLifeline.termDays) || 100,
      automaticSupplyRenewal: false,
      geologicalReserveQuantityUsedAsStock: false,
      existingSaveDataOverwritten: false,
      countrySummaries: results
    };
    // The report is additive and version-scoped. It never replaces resource,
    // economy, mine-reserve, or trade ledgers.
    state.simulation.startupBaselineV1 = report;
    lastReport = clone(report);
    dispatchEvent('OMEGA_RESOURCE_STARTUP_BASELINE_COMPLETED', report);
    return { status: report.status, report: diagnostics() };
  }
  function diagnostics() {
    var state = rootState();
    var report = state && state.simulation && object(state.simulation.startupBaselineV1) || lastReport;
    if (!report) return {
      version: VERSION,
      status: data ? 'READY' : 'LOADING',
      sourceStatus: data ? 'READY' : (loadPromise ? 'LOADING' : 'NOT_READY')
    };
    return {
      version: VERSION,
      status: report.status || 'UNKNOWN',
      sessionId: report.sessionId || null,
      playerCountryId: report.playerCountryId || null,
      counts: clone(report.counts || {}),
      factoryTypesCreated: clone(report.factoryTypesCreated || {}),
      openingStockCoverageDays: report.openingStockCoverageDays,
      automaticSupplyWindowDays: report.automaticSupplyWindowDays,
      automaticSupplyRenewal: report.automaticSupplyRenewal,
      geologicalReserveQuantityUsedAsStock: report.geologicalReserveQuantityUsedAsStock,
      existingSaveDataOverwritten: report.existingSaveDataOverwritten,
      sourceFiles: clone(report.sources || {})
    };
  }
  function getCountryReport(countryId) {
    var state = rootState();
    var report = state && state.simulation && object(state.simulation.startupBaselineV1) || lastReport;
    var wanted = id(countryId);
    if (!report || !Array.isArray(report.countrySummaries)) return null;
    var row = report.countrySummaries.find(function (item) {
      return id(item.countryId) === wanted || id(item.countryCode) === wanted;
    });
    return row ? clone(row) : null;
  }
  function onSessionCreated(event) {
    var detail = event && event.detail !== undefined ? event.detail
      : (event && event.payload !== undefined ? event.payload : event || {});
    if (detail && detail.payload && !detail.session && detail.payload.session) detail = detail.payload;
    var session = object(detail.session) || object(detail);
    if (!session || !session.playerCountryId) return;
    pendingSession = clone(session);
    pendingInitialization = loadSources().then(function (result) {
      if (!pendingSession) return result;
      if (result.status !== 'READY') {
        lastReport = { version: VERSION, status: 'BLOCKED', reason: result.reason || 'STARTUP_BASELINE_SOURCES_NOT_READY' };
        dispatchEvent('OMEGA_RESOURCE_STARTUP_BASELINE_FAILED', lastReport);
        return result;
      }
      var target = pendingSession;
      var state = rootState(), current = sessionFromState(state);
      if (current && target.sessionId && current.sessionId !== target.sessionId) return { status: 'STALE_SESSION_IGNORED' };
      return initializeForSession(target).catch(function (error) {
        lastReport = { version: VERSION, status: 'BLOCKED', reason: String(error && error.message || error) };
        dispatchEvent('OMEGA_RESOURCE_STARTUP_BASELINE_FAILED', lastReport);
        return lastReport;
      });
    });
  }
  function attachSimulationEventBus() {
    if (simulationUnsubscribe) return true;
    var runtime = g.Omega && (g.Omega.SimulationRuntime || g.Omega.Simulation);
    var ledger = runtime && runtime.events;
    if (!ledger || typeof ledger.subscribe !== 'function') return false;
    try {
      simulationUnsubscribe = ledger.subscribe('OMEGA_GAME_SESSION_CREATED', function (row) {
        var payload = row && row.payload !== undefined ? row.payload : row;
        onSessionCreated({ detail: payload });
      });
      return typeof simulationUnsubscribe === 'function' || !!simulationUnsubscribe;
    } catch (error) {
      simulationUnsubscribe = null;
      lastReport = { version: VERSION, status: 'BLOCKED', reason: 'SIMULATION_EVENT_SUBSCRIPTION_FAILED' };
      return false;
    }
  }
  function install() {
    if (installed) return;
    installed = true;
    if (typeof g.addEventListener === 'function') {
      // Older builds may dispatch this as a browser CustomEvent. The current
      // SimulationRuntime uses its own EventLedger, so both supported paths are wired.
      g.addEventListener('OMEGA_GAME_SESSION_CREATED', onSessionCreated);
      g.addEventListener('OMEGA_READY', attachSimulationEventBus);
      if (g.document && typeof g.document.addEventListener === 'function') {
        if (g.document.readyState === 'loading') {
          g.document.addEventListener('DOMContentLoaded', attachSimulationEventBus, { once: true });
        } else {
          attachSimulationEventBus();
        }
      }
    }
    attachSimulationEventBus();
  }
  function init() {
    install();
    return loadSources();
  }

  var api = {
    VERSION: VERSION,
    init: init,
    get ready() { return loadSources(); },
    initializeForSession: initializeForSession,
    diagnostics: diagnostics,
    getCountryReport: getCountryReport,
    waitForPendingInitialization: function () { return pendingInitialization; },
    getSourceStatus: function () {
      return { status: data ? 'READY' : (loadPromise ? 'LOADING' : 'BLOCKED'), version: VERSION,
        sourcePaths: clone(PATHS), reason: data ? null : lastReport && lastReport.reason || null };
    }
  };
  g.OmegaResourceStartupBaseline = api;
  g.Omega = g.Omega || {};
  g.Omega.ResourceStartupBaseline = api;
  install();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
