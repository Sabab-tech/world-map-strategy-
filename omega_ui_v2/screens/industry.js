/* OMEGA UI v2 Industry screen.
 * Read-only view over existing production assets, cycles, inventory and projects.
 * Does not execute factory construction, procurement, input transfer or production.
 */
(function (g) {
  'use strict';

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
  function num(value) { if (value === null || value === undefined || value === '') return null; var n = Number(value); return Number.isFinite(n) ? n : null; }
  function fmt(value, unit) { var n = num(value); return n === null ? 'Not recorded' : n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + (unit ? ' ' + esc(unit) : ''); }
  function stateRoot() { return g.Game && g.Game.state || g.gameState || null; }
  function countryProfile(value) {
    var runtime = g.OmegaCountryRuntimeData || (g.Omega && g.Omega.CountryRuntimeData);
    if (runtime && typeof runtime.resolveCountry === 'function') {
      try { var profile = runtime.resolveCountry(value); if (profile) return profile; } catch (_) {}
    }
    return null;
  }
  function countryAliases(value) {
    var aliases = [], seen = Object.create(null);
    function add(item) { var key = String(item == null ? '' : item).trim().toUpperCase(); if (key && !seen[key]) { seen[key] = true; aliases.push(key); } }
    add(value);
    var profile = countryProfile(value), identity = profile && (profile.identity || profile.country || profile);
    [profile && profile.iso3, profile && profile.alpha3, profile && profile.cca3, profile && profile.countryCode,
      profile && profile.numericCode, profile && profile.name, profile && profile.officialName, profile && profile.shortName,
      profile && profile.economyKey, profile && profile.populationKey,
      identity && identity.iso3, identity && identity.countryIso3, identity && identity.countryCode,
      identity && identity.name, identity && identity.officialName].forEach(add);
    return aliases;
  }
  function canonicalCountry(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    var profile = countryProfile(raw), identity = profile && (profile.identity || profile.country || profile);
    var code = String(profile && (profile.iso3 || profile.alpha3 || profile.cca3 || profile.countryIso3) ||
      identity && (identity.iso3 || identity.alpha3 || identity.cca3 || identity.countryIso3) || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : raw.toUpperCase();
  }
  function pickCountryBucket(root, country) {
    if (!root || typeof root !== 'object') return null;
    var aliases = countryAliases(country);
    for (var a = 0; a < aliases.length; a += 1) {
      var direct = root[aliases[a]];
      if (direct && typeof direct === 'object') return direct;
    }
    var keys = Object.keys(root);
    for (var i = 0; i < keys.length; i += 1) {
      if (aliases.indexOf(keys[i].trim().toUpperCase()) >= 0 && root[keys[i]] && typeof root[keys[i]] === 'object') return root[keys[i]];
    }
    return null;
  }
  function countryContext(country) {
    var code = canonicalCountry(country || g.OmegaMinistryViewCountry || (g.OmegaCabinetUI && g.OmegaCabinetUI.activeCountry) || g.currentActiveCountry || '');
    var root = stateRoot() || {};
    return {
      countryId: code || null,
      resource: pickCountryBucket(root.resource, code) || pickCountryBucket(root.resources, code) || null,
      economy: pickCountryBucket(root.economy, code) || null
    };
  }
  function safeNetwork() { return g.OmegaResourceIndustrialNetwork || (g.Omega && g.Omega.ResourceIndustrialNetwork) || null; }
  function safeCatalog() { return g.OmegaResourceIndustrialCatalogData || (g.Omega && g.Omega.ResourceIndustrialCatalogData) || null; }
  function normalizeFactoryType(value, catalog) {
    var aliases = (catalog || safeCatalog() || {}).factoryTypeAliases || {};
    var key = String(value == null ? '' : value).trim().toUpperCase(), seen = Object.create(null);
    while (aliases[key] && !seen[key]) { seen[key] = true; key = String(aliases[key]).trim().toUpperCase(); }
    return key;
  }


  function playerCountryId() {
    var state = stateRoot() || {};
    var value = state.simulation && state.simulation.session && state.simulation.session.playerCountryId ||
      state.simulation && state.simulation.playerCountryId || state.playerCountryId ||
      g.Omega && g.Omega.Simulation && g.Omega.Simulation.playerCountryId ||
      g.Game && g.Game.playerCountryId || g.currentPlayerCountry || '';
    if (!value) {
      try { value = g.Omega && g.Omega.Simulation && typeof g.Omega.Simulation.getPlayerCountryId === 'function'
        ? g.Omega.Simulation.getPlayerCountryId() : ''; } catch (_) {}
    }
    return canonicalCountry(value);
  }
  function factoryAssetRows(resource, economy) {
    resource = resource && typeof resource === 'object' ? resource : {};
    economy = economy && typeof economy === 'object' ? economy : {};
    var industrial = resource.industrialNetwork && typeof resource.industrialNetwork === 'object' ? resource.industrialNetwork : {};
    var sources = [
      { rows: economy.productionAssets, force: true },
      { rows: resource.productionAssets, force: false },
      { rows: industrial.productionAssets, force: true },
      { rows: industrial.factoryAssets, force: true }
    ];
    var byId = Object.create(null), ordered = [];
    sources.forEach(function (source) {
      (Array.isArray(source.rows) ? source.rows : []).forEach(function (asset) {
        if (!asset || typeof asset !== 'object') return;
        var id = String(asset.id || asset.assetId || asset.factoryId || asset.projectId || asset.name || '').trim();
        if (!id) return;
        var descriptor = [asset.factoryType, asset.facilityType, asset.assetType, asset.type, asset.stage, asset.name].join(' ').toUpperCase();
        var clearlyMineOnly = /(^|[\s_-])(MINE|MINING|EXTRACTION|EXTRACTOR|QUARRY|DEPOSIT|OIL_FIELD|GAS_FIELD)([\s_-]|$)/.test(descriptor) &&
          !/(PROCESS|MILL|SMELT|REFIN|FACTORY|PLANT)/.test(descriptor);
        if (clearlyMineOnly) return;
        var recipe = asset.recipe && typeof asset.recipe === 'object' ? asset.recipe : {};
        var hasInputs = !!(asset.inputCoefficients || asset.inputProfile || recipe.inputs || asset.inputInventory);
        var hasOutputs = !!(asset.outputProfile || asset.outputCoefficients || recipe.outputs);
        var looksFactory = source.force || /FACTORY|PLANT|MILL|SMELT|REFIN|FURNACE|PROCESS|GENERATOR|POWER_STATION|CEMENT|TEXTILE|ASSEMBLY|MANUFACTUR|PACKAGING|CHEMICAL|CONCENTRATOR/.test(descriptor) || (hasInputs && hasOutputs);
        if (!looksFactory) return;
        var key = id.toUpperCase();
        if (byId[key]) {
          byId[key] = Object.assign({}, byId[key], asset);
          return;
        }
        byId[key] = Object.assign({}, asset);
        ordered.push(key);
      });
    });
    return ordered.map(function (key) { return byId[key]; });
  }
  function countryMineSiteRows(country, resource) {
    var wanted = canonicalCountry(country), aliases = countryAliases(wanted), all = [];
    if (!wanted) return [];
    var canonical = g.OmegaResourceSiteCanonicalCatalogData || (g.Omega && g.Omega.ResourceSiteCanonicalCatalogData);
    var binding = g.OmegaIndividualResourceSiteBinding || (g.Omega && g.Omega.IndividualResourceSiteBinding);
    if (canonical && Array.isArray(canonical.sites)) all = all.concat(canonical.sites);
    if (binding && Array.isArray(binding.sites)) all = all.concat(binding.sites);
    if (resource && Array.isArray(resource.mineSiteReferences)) all = all.concat(resource.mineSiteReferences);
    var byId = Object.create(null);
    all.forEach(function (site) {
      if (!site || typeof site !== 'object' || (site.runtime && site.runtime.aliasOfSiteId)) return;
      var id = String(site.siteId || site.siteReferenceKey || site.id || '').trim();
      var siteCountry = site.countryId || site.countryCode || site.identity && site.identity.countryIso3 ||
        site.sourceSiteRecord && site.sourceSiteRecord.countryCode || '';
      if (!id || !siteCountry) return;
      var candidate = canonicalCountry(siteCountry);
      var matched = candidate === wanted;
      if (!matched) {
        var candidateAliases = countryAliases(siteCountry);
        matched = candidateAliases.some(function (value) { return aliases.indexOf(value) >= 0; });
      }
      if (!matched) return;
      if (!byId[id]) byId[id] = Object.assign({}, site, { siteId: id });
    });
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) {
      return String(a.siteName || a.name || a.siteId).localeCompare(String(b.siteName || b.name || b.siteId));
    });
  }
  function metricBasis(metric) {
    var status = String(metric && metric.status || metric && metric.authority || '').toUpperCase();
    if (/OBSERVED|MEASURED|REPORTED|VERIFIED_SOURCE/.test(status)) return 'Reported';
    if (/SIMULATED|MODELED|GAMEPLAY/.test(status)) return 'Game model';
    return status ? 'Source status: ' + status : 'Source not recorded';
  }
  function unitIsDaily(unit) { return /(?:\/\s*day|per[_\s-]*day|daily|day[_\s-]*1)/i.test(String(unit || '')); }
  function dayUnit(unit) {
    var value = String(unit || '').trim();
    if (!value) return 'units/day';
    if (unitIsDaily(value)) return value.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return value.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() + '/day';
  }
  function mineDailyProduction(site) {
    site = site && typeof site === 'object' ? site : {};
    var quantitative = site.quantitative || site.real && site.real.quantitative || {};
    var production = quantitative.production || site.production || {};
    var capacity = quantitative.capacity || site.capacity || {};
    var simulation = site.simulation || {};
    var rate = num(production.rate !== undefined ? production.rate : production.dailyRate);
    var unit = production.unit || production.rateUnit || simulation.rateUnit || simulation.productionRateUnit || '';
    if (rate !== null && unitIsDaily(unit)) {
      return { value: rate, unit: dayUnit(unit), basis: metricBasis(production), kind: 'rate' };
    }
    var annual = num(production.annual !== undefined ? production.annual : production.annualProduction);
    var annualUnit = production.annualUnit || unit;
    if (annual !== null && /(?:\/\s*year|per[_\s-]*year|annual|yearly)/i.test(String(annualUnit || ''))) {
      return { value: annual / 365, unit: dayUnit(String(annualUnit).replace(/\/\s*year|per[_\s-]*year|annual|yearly/i, '')), basis: metricBasis(production) + ' · annual ÷ 365 days', kind: 'derived' };
    }
    var simulatedDaily = num(simulation.dailyRate !== undefined ? simulation.dailyRate : simulation.dailyProductionRate);
    if (simulatedDaily !== null) {
      return { value: simulatedDaily, unit: dayUnit(simulation.rateUnit || simulation.productionRateUnit || unit), basis: 'Game model', kind: 'rate' };
    }
    var modeledRate = num(simulation.productionRate);
    if (modeledRate !== null && unitIsDaily(simulation.rateUnit || simulation.productionRateUnit || unit)) {
      return { value: modeledRate, unit: dayUnit(simulation.rateUnit || simulation.productionRateUnit || unit), basis: 'Game model', kind: 'rate' };
    }
    var nominal = num(capacity.nominal !== undefined ? capacity.nominal : capacity.quantity);
    var capacityUnit = capacity.unit || production.unit || '';
    if (nominal !== null && unitIsDaily(capacityUnit)) {
      return { value: nominal, unit: dayUnit(capacityUnit), basis: metricBasis(capacity) + ' · capacity, not guaranteed output', kind: 'capacity' };
    }
    var simulatedCapacity = num(simulation.nominalDailyCapacity !== undefined ? simulation.nominalDailyCapacity : simulation.minimumDailyCapacity);
    if (simulatedCapacity !== null) {
      return { value: simulatedCapacity, unit: dayUnit(simulation.productionRateUnit || simulation.capacityUnit || unit), basis: 'Game model · capacity, not guaranteed output', kind: 'capacity' };
    }
    return { value: null, unit: '', basis: 'Not recorded', kind: 'unknown' };
  }
  function currentTurnResourceAdded(resource, countryId) {
    var root = stateRoot() || {}, sim = root.simulation || {};
    var turn = num(sim.turn !== undefined ? sim.turn : root.turn !== undefined ? root.turn : root.simulationTurn);
    var daysPerTurn = num(sim.daysPerTurn !== undefined ? sim.daysPerTurn : root.daysPerTurn);
    if (daysPerTurn !== null && daysPerTurn <= 0) daysPerTurn = null;
    var industrial = resource && resource.industrialNetwork || {};
    var flows = Array.isArray(industrial.siteFlowLedger) ? industrial.siteFlowLedger :
      resource && Array.isArray(resource.siteFlowLedger) ? resource.siteFlowLedger : [];
    var groups = Object.create(null), ordered = [];
    flows.forEach(function (flow) {
      if (!flow || typeof flow !== 'object') return;
      var flowCountry = flow.countryId ? canonicalCountry(flow.countryId) : countryId;
      if (flowCountry !== countryId) return;
      var flowTurn = num(flow.extractionTurn !== undefined ? flow.extractionTurn : flow.createdTurn !== undefined ? flow.createdTurn : flow.turn);
      if (turn === null || flowTurn !== turn) return;
      if (/BLOCKED_EXTRACTION|EXTRACTION_BLOCKED|NO_EXTRACTION/.test(String(flow.status || '').toUpperCase())) return;
      var quantity = num(flow.quantity);
      var resourceId = String(flow.resourceId || flow.materialIdentity || 'Not recorded').trim();
      var unit = String(flow.unit || flow.quantityUnit || 'unit not recorded').trim();
      if (quantity === null || quantity <= 0) return;
      var key = resourceId.toLowerCase() + '|' + unit.toLowerCase();
      if (!groups[key]) {
        groups[key] = { resourceId: resourceId, unit: unit, quantity: 0, batchCount: 0, siteIds: Object.create(null) };
        ordered.push(key);
      }
      groups[key].quantity += quantity;
      groups[key].batchCount += 1;
      if (flow.siteId) groups[key].siteIds[String(flow.siteId)] = true;
    });
    return {
      turn: turn,
      rows: ordered.map(function (key) {
        var row = groups[key];
        return { resourceId: row.resourceId, unit: row.unit, quantity: row.quantity, batchCount: row.batchCount,
          siteCount: Object.keys(row.siteIds).length, averagePerDay: daysPerTurn === null ? null : Number((row.quantity / daysPerTurn).toFixed(6)) };
      }),
      daysPerTurn: daysPerTurn
    };
  }
  function mineAssetRows(resource) {
    var network = resource && resource.industrialNetwork || {};
    var rows = []
      .concat(Array.isArray(resource && resource.mineAssets) ? resource.mineAssets : [])
      .concat(Array.isArray(network.mineAssets) ? network.mineAssets : []);
    var byId = Object.create(null);
    rows.forEach(function (row) {
      if (!row || typeof row !== 'object') return;
      var id = String(row.siteId || row.assetId || row.id || '').trim();
      if (!id) return;
      byId[id] = Object.assign({}, byId[id] || {}, row);
    });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }

  function buildViewModel(options) {
    options = options || {};
    var context = countryContext(options.countryId);
    var resource = context.resource || {};
    var economy = context.economy || {};
    var industrial = resource.industrialNetwork && typeof resource.industrialNetwork === 'object' ? resource.industrialNetwork : {};
    var catalog = safeCatalog() || {};
    var inventoryRuntime = g.OmegaCountryInventoryRuntime || (g.Omega && g.Omega.CountryInventoryRuntime) || null;
    var nationalInventory = null;
    if (context.countryId && inventoryRuntime && typeof inventoryRuntime.getInventory === 'function') {
      try { nationalInventory = inventoryRuntime.getInventory(context.countryId, { includeZero: true, includeLedger: false }); } catch (_) { nationalInventory = null; }
    }
    var assets = factoryAssetRows(resource, economy);
    var rawMineSites = countryMineSiteRows(context.countryId, resource);
    var mineAssets = mineAssetRows(resource);
    var currentExtraction = currentTurnResourceAdded(resource, context.countryId);
    var projects = Array.isArray(industrial.projects) ? industrial.projects : (Array.isArray(economy.projects) ? economy.projects : []);
    var researchProjects = Array.isArray(resource.technologyResearchProjects) ? resource.technologyResearchProjects : [];
    var technologyTransfers = Array.isArray(resource.technologyTransfers) ? resource.technologyTransfers : [];
    var technologyCapabilities = Array.isArray(resource.technologyCapabilities) ? resource.technologyCapabilities : [];
    var technologyContracts = Array.isArray(industrial.technologyContracts) ? industrial.technologyContracts : [];
    var cycles = industrial.factoryProductionCycles && typeof industrial.factoryProductionCycles === 'object' ? industrial.factoryProductionCycles : {};
    var runs = industrial.factoryRuntime && typeof industrial.factoryRuntime === 'object' ? industrial.factoryRuntime : {};
    var profiles = catalog.factoryProfiles && typeof catalog.factoryProfiles === 'object' ? catalog.factoryProfiles : {};
    var flows = Array.isArray(industrial.siteFlowLedger) ? industrial.siteFlowLedger : (Array.isArray(resource.siteFlowLedger) ? resource.siteFlowLedger : []);
    var mappedAssets = assets.map(function (asset) {
      asset = asset && typeof asset === 'object' ? asset : {};
      var id = String(asset.id || asset.assetId || asset.projectId || '');
      var rawType = String(asset.factoryType || asset.type || asset.facilityType || '');
      var type = normalizeFactoryType(rawType, catalog) || rawType;
      var profile = profiles[type] || profiles[rawType.toUpperCase()] || profiles[rawType] || {};
      var cycle = cycles[id] || null;
      var run = runs[id] || null;
      var health = asset.productionHealth && typeof asset.productionHealth === 'object' ? asset.productionHealth : {};
      var input = asset.inputInventory && typeof asset.inputInventory === 'object' ? asset.inputInventory : {};
      var inputRows = Object.keys(input).map(function (key) { return { resourceId: key, quantity: num(input[key]), rawValue: input[key] }; });
      var employment = asset.employment && typeof asset.employment === 'object' ? asset.employment : {};
      return {
        id: id || null,
        name: String(asset.name || asset.factoryName || profile.name || type || id || 'Unnamed registered factory'),
        type: type || 'Not recorded',
        recipeId: String(asset.recipeId || profile.defaultRecipeId || 'Not recorded'),
        status: String(asset.status || 'NOT_RECORDED'),
        capacityPerDay: num(asset.capacityPerDay !== undefined ? asset.capacityPerDay : asset.capacity !== undefined ? asset.capacity : asset.productionCapacity),
        productivityPct: num(health.productivityPct),
        healthStatus: String(health.status || 'NOT_RECORDED'),
        healthReason: String(health.reason || 'Not recorded'),
        location: String(asset.locationNodeKey || asset.location || 'Not recorded'),
        jobsFilled: num(employment.jobsFilled),
        jobSlots: num(employment.jobsSupported !== undefined ? employment.jobsSupported : profile.employment && profile.employment.jobsPerFactory),
        vacancies: num(employment.vacancies),
        inputRows: inputRows,
        cycle: cycle,
        lastRun: run,
        lastProductionTurn: run && (run.turn !== undefined ? run.turn : run.simulationTurn) !== undefined ? (run.turn !== undefined ? run.turn : run.simulationTurn) : (asset.lastProductionTurn !== undefined ? asset.lastProductionTurn : null),
        latestOutputs: run && (run.outputQuantities || run.outputs) || null,
        authority: String(profile.authority || asset.authority || 'NOT_RECORDED'),
        raw: asset
      };
    }).filter(function (factory) { return !/^(DECOMMISSIONED|DESTROYED)$/.test(String(factory.status || '').trim().toUpperCase()); });
    var mineSites = rawMineSites.map(function (site) {
      var quantitative = site.quantitative || site.real && site.real.quantitative || {};
      var production = mineDailyProduction(site);
      var resourceId = String(site.identity && (site.identity.resourceTypeId || site.identity.resourceId || site.identity.resourceName) ||
        site.sourceSiteRecord && (site.sourceSiteRecord.resourceId || site.sourceSiteRecord.resourceTypeId) || site.resourceId || site.resourceTypeId || 'Not recorded');
      var operation = site.operation || {};
      return {
        siteId: String(site.siteId || site.siteReferenceKey || site.id || ''),
        name: String(site.siteName || site.name || site.siteId || 'Unnamed resource site'),
        resourceId: resourceId,
        status: String(operation.realWorldStatus || operation.status || site.status || site.sourceSiteRecord && site.sourceSiteRecord.status || 'NOT_RECORDED'),
        dailyProduction: production,
        reserve: quantitative.reserve || null,
        raw: site
      };
    });
    var dailyProductionKnownCount = mineSites.filter(function (site) { return site.dailyProduction && site.dailyProduction.value !== null; }).length;
    var currentExtractionRows = currentExtraction.rows;
    var operatingMineCount = mineAssets.filter(function (asset) { return /^(OPERATIONAL|ACTIVE|RUNNING)$/.test(String(asset.status || '').toUpperCase()); }).length;
    var factoryTypeCountsIndex = Object.create(null);
    mappedAssets.forEach(function (factory) {
      var typeKey = String(factory.type || 'NOT_RECORDED').trim().toUpperCase() || 'NOT_RECORDED';
      if (!factoryTypeCountsIndex[typeKey]) {
        var profile = profiles[typeKey] || profiles[factory.type] || {};
        factoryTypeCountsIndex[typeKey] = { type: typeKey, name: String(profile.name || factory.type || 'Not recorded'), count: 0 };
      }
      factoryTypeCountsIndex[typeKey].count += 1;
    });
    var factoryTypeCounts = Object.keys(factoryTypeCountsIndex).map(function (key) {
      return factoryTypeCountsIndex[key];
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var seenCatalogTypes = Object.create(null);
    var factoryTypeCatalog = Object.keys(profiles).map(function (rawType) {
      var profile = profiles[rawType] || {};
      var type = normalizeFactoryType(rawType, catalog) || rawType;
      if (seenCatalogTypes[type]) return null;
      seenCatalogTypes[type] = true;
      return {
        type: type, name: String(profile.name || type),
        category: String(profile.category || profile.subCategory || 'Uncategorised'),
        constructionCost: num(profile.constructionCost), constructionDays: num(profile.constructionDays),
        defaultCapacityPerDay: num(profile.defaultCapacityPerDay),
        defaultRecipeId: String(profile.defaultRecipeId || ''), simulationOnly: profile.simulationOnly === true
      };
    }).filter(Boolean).sort(function (a, b) {
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    });
    var cyclesList = Object.keys(cycles).map(function (id) { return Object.assign({ factoryId: id }, cycles[id] || {}); });
    return {
      countryId: context.countryId,
      hasCountryState: !!(context.resource || context.economy),
      factoryCount: mappedAssets.length,
      factoryTypeCounts: factoryTypeCounts,
      factoryTypeCatalog: factoryTypeCatalog,
      factories: mappedAssets,
      factoryNames: mappedAssets.map(function (row) { return row.name; }),
      playerCountryId: playerCountryId() || null,
      canOperateSelectedCountry: !!context.countryId && !!playerCountryId() && playerCountryId() === context.countryId,
      registeredMineSiteCount: mineSites.length,
      mineAssetCount: mineAssets.length,
      operatingMineCount: operatingMineCount,
      mineSites: mineSites,
      dailyProductionKnownCount: dailyProductionKnownCount,
      currentTurnExtraction: currentExtractionRows,
      currentTurnNumber: currentExtraction.turn,
      currentTurnDaysPerTurn: currentExtraction.daysPerTurn,
      projects: projects.slice(),
      researchProjects: researchProjects.slice(),
      technologyTransfers: technologyTransfers.slice(),
      technologyCapabilities: technologyCapabilities.slice(),
      technologyContracts: technologyContracts.slice(),
      cycles: cyclesList,
      recentFlowCount: flows.length,
      recentFlows: flows.slice(-20).reverse(),
      catalogProfileCount: Object.keys(profiles).length,
      catalogProfiles: profiles,
      inputInventoryCount: mappedAssets.reduce(function (total, row) { return total + row.inputRows.filter(function (input) { return input.quantity !== null && input.quantity > 0; }).length; }, 0),
      nationalInventory: nationalInventory,
      source: 'Game.state.resource[country].industrialNetwork + Game.state.economy[country].productionAssets + canonical industrial catalogue'
    };
  }

  function tabButton(id, label, active) {
    var fullLabels = {
      factories:'Factories',
      'production-lines':'Production Lines',
      inventory:'Input Inventory',
      'national-inventory':'National Inventory',
      research:'Research & Technology',
      projects:'Build Projects'
    };
    var accessibleLabel = fullLabels[id] || label;
    return '<button type="button" class="omega-v2-button ' + (active === id ? 'omega-v2-button--accent' : 'omega-v2-button--quiet') +
      '" data-omega-v2-industry-tab="' + esc(id) + '" aria-label="' + esc(accessibleLabel) + '" title="' + esc(accessibleLabel) +
      '" aria-pressed="' + (active === id ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }
  function factoryVisual(type, label) {
    var catalog = g.OmegaFactoryVisualCatalog;
    if (catalog && typeof catalog.render === 'function') {
      try { return catalog.render(type, label); } catch (_) {}
    }
    return '<div class="omega-v2-photo-placeholder" aria-label="' + esc(label) + '">Factory art unavailable</div>';
  }
  function factoryPhoto(factory) {
    factory = factory && typeof factory === 'object' ? factory : {};
    var descriptor = [factory.type, factory.name, factory.recipeId, factory.category].join(' ').toUpperCase();
    var photoId = 'industrial-production-line';
    if (/(REFIN|PETRO|CHEMICAL|CHEM\b|OIL|GAS|FERTIL|FUEL)/.test(descriptor)) photoId = 'geelong-oil-refinery';
    else if (/(POWER|ENERGY|ELECTRIC|HYDRO|TURBINE|GENERATOR)/.test(descriptor)) photoId = 'hydroelectric-plant';
    else if (/(MINE|ORE|MINERAL|SMELT|STEEL|METAL|COPPER|ALUMIN)/.test(descriptor)) photoId = 'open-pit-mine';
    else if (/(AGRI|FOOD|WHEAT|GRAIN|SUGAR|COTTON|CEREAL)/.test(descriptor)) photoId = 'wheat-field';
    var lib=g.OmegaUIPhotoAssets,item=null;try{item=lib&&typeof lib.get==='function'?lib.get(photoId):null;}catch(_){}
    var defaultFactoryPhotoPath = 'assets/ui-photos/industrial-production-line.webp';
    var fallbackPaths = {
      'industrial-production-line':defaultFactoryPhotoPath,
      'geelong-oil-refinery':'assets/ui-photos/geelong-oil-refinery.webp',
      'hydroelectric-plant':'assets/ui-photos/hydroelectric-plant.webp',
      'open-pit-mine':'assets/ui-photos/open-pit-mine.webp',
      'wheat-field':'assets/ui-photos/wheat-field.webp'
    };
    var path=item&&/^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(String(item.path||''))?item.path:(fallbackPaths[photoId]||fallbackPaths['industrial-production-line']);
    var credit=item&&item.author&&item.sourcePageUrl&&item.licenseUrl?'<small class="omega-v2-photo-credit">Photo: <a href="'+esc(item.sourcePageUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.author)+'</a> · <a href="'+esc(item.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.licenseShortName||'License')+'</a></small>':'';
    return '<figure class="omega-v2-photo omega-v2-photo--tile omega-v2-factory-photo"><img loading="lazy" decoding="async" width="1280" height="720" src="'+esc(path)+'" alt="'+esc(factory.name||factory.type||'Industrial production')+', representative factory reference photograph"><figcaption><strong>'+esc(item&&item.caption||'INDUSTRIAL PRODUCTION')+'</strong><small>Representative reference photography only. Actual ownership, location, operating status and output come from the canonical game state.</small>'+credit+'</figcaption></figure>';
  }
  function factorySvgPath(factory) {
    var catalog = safeCatalog() || {};
    var type = normalizeFactoryType(factory && factory.type, catalog) || String(factory && factory.type || '');
    var slug = String(type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug || slug.length > 90) slug = 'generic-resource-processing-plant';
    return 'assets/omega-industrial-icons-v1/factories/' + slug + '.svg';
  }

  function factorySvgMarkup(factory) {
    var label = String(factory && (factory.name || factory.type) || 'Factory');
    return '<img class="omega-v2-factory-svg" data-omega-v2-factory-svg src="' + esc(factorySvgPath(factory)) +
      '" data-fallback="assets/omega-industrial-icons-v1/factories/generic-resource-processing-plant.svg" alt="' +
      esc(label + ' factory illustration') + '" width="128" height="128" loading="eager" decoding="async">';
  }

  function factoryDailyOutput(factory) {
    factory = factory && typeof factory === 'object' ? factory : {};
    var raw = factory.raw && typeof factory.raw === 'object' ? factory.raw : {};
    var health = raw.productionHealth && typeof raw.productionHealth === 'object' ? raw.productionHealth : {};
    var run = factory.lastRun && typeof factory.lastRun === 'object' ? factory.lastRun : {};
    var earlyHealthStatus = String(health.status || factory.healthStatus || '').trim().toUpperCase();
    var earlyAssetStatus = String(raw.status || factory.status || '').trim().toUpperCase();
    var earlyCycleStatus = String(factory.cycle && factory.cycle.status || '').trim().toUpperCase();
    var earlyReason = String(health.reason || factory.healthReason || '').trim().toUpperCase();
    if (/^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|READY)$/.test(earlyHealthStatus) ||
        /^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|READY)$/.test(earlyAssetStatus) ||
        /^(PAUSED|CANCELLED|BLOCKED|FAILED|STOPPED)$/.test(earlyCycleStatus) ||
        /FACTORY_DECOMMISSIONED_BY_PLAYER/.test(earlyReason)) {
      return { value: 0, unit: String(health.outputUnit || raw.outputUnit || raw.productionUnit || ''), product: String(health.outputResourceId || raw.outputResourceId || ''), basis: 'Production stopped' };
    }
    var candidates = [
      { value: health.actualOutputPerDay, unit: health.outputUnit || raw.outputUnit, product: health.outputResourceId || raw.outputResourceId },
      { value: health.outputPerDay, unit: health.outputUnit || raw.outputUnit, product: health.outputResourceId || raw.outputResourceId },
      { value: health.dailyOutput, unit: health.outputUnit || raw.outputUnit, product: health.outputResourceId || raw.outputResourceId },
      { value: raw.actualOutputPerDay, unit: raw.outputUnit || raw.productionUnit, product: raw.outputResourceId || raw.primaryOutputResourceId },
      { value: raw.outputPerDay, unit: raw.outputUnit || raw.productionUnit, product: raw.outputResourceId || raw.primaryOutputResourceId },
      { value: raw.dailyOutput, unit: raw.outputUnit || raw.productionUnit, product: raw.outputResourceId || raw.primaryOutputResourceId },
      { value: run.actualOutputPerDay, unit: run.outputUnit || raw.outputUnit, product: run.outputResourceId || run.resourceId },
      { value: run.outputPerDay, unit: run.outputUnit || raw.outputUnit, product: run.outputResourceId || run.resourceId }
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i], value = candidate.value, unit = candidate.unit || '';
      if (value && typeof value === 'object') {
        unit = value.unit || value.outputUnit || unit;
        value = value.valuePerDay !== undefined ? value.valuePerDay :
          value.quantityPerDay !== undefined ? value.quantityPerDay :
          value.rate !== undefined ? value.rate :
          value.quantity !== undefined ? value.quantity :
          value.value !== undefined ? value.value : value.amount;
      }
      var number = num(value);
      if (number !== null && number >= 0) {
        return { value: number, unit: String(unit || ''), product: String(candidate.product || ''), basis: 'Recorded daily output' };
      }
    }

    var activeCycle = factory.cycle && typeof factory.cycle === 'object' ? factory.cycle : null;
    var activeCycleStatus = String(activeCycle && activeCycle.status || '').trim().toUpperCase();
    var activeCycleDays = num(activeCycle && (activeCycle.cycleDays !== undefined ? activeCycle.cycleDays : activeCycle.durationDays));
    var activeCycleQuantity = num(activeCycle && activeCycle.productionQuantity);
    if (activeCycleStatus === 'IN_PROGRESS' && activeCycleDays !== null && activeCycleDays > 0 &&
        activeCycleQuantity !== null && activeCycleQuantity > 0) {
      return {
        value: activeCycleQuantity / activeCycleDays,
        unit: String(health.outputUnit || raw.outputUnit || raw.productionUnit || run.outputUnit || ''),
        product: String(health.outputResourceId || raw.outputResourceId || raw.primaryOutputResourceId || ''),
        basis: 'Active cycle quantity averaged over ' + activeCycleDays + ' game-day(s)'
      };
    }

    var outputs = factory.latestOutputs;
    var days = num(run.cycleDays !== undefined ? run.cycleDays : run.durationDays);
    if (outputs && typeof outputs === 'object' && !Array.isArray(outputs) && days !== null && days > 0) {
      var outputKeys = Object.keys(outputs);
      for (var oi = 0; oi < outputKeys.length; oi += 1) {
        var outputId = outputKeys[oi], outputValue = outputs[outputId];
        if (outputValue && typeof outputValue === 'object') {
          outputValue = outputValue.quantity !== undefined ? outputValue.quantity :
            outputValue.value !== undefined ? outputValue.value : outputValue.amount;
        }
        var outputNumber = num(outputValue);
        if (outputNumber !== null && outputNumber > 0) {
          return {
            value: outputNumber / days,
            unit: String(run.outputUnit || raw.outputUnit || raw.productionUnit || ''),
            product: String(outputId),
            basis: 'Committed output averaged across ' + days + ' game-day(s)'
          };
        }
      }
    }

    var healthStatus = String(health.status || factory.healthStatus || '').toUpperCase();
    var assetStatus = String(raw.status || factory.status || '').toUpperCase();
    if (/^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|READY)$/.test(healthStatus) ||
        /^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|READY)$/.test(assetStatus)) {
      return { value: 0, unit: String(health.outputUnit || raw.outputUnit || ''), product: String(raw.outputResourceId || ''), basis: 'Production stopped' };
    }
    return null;
  }

  function factoryProductionState(factory) {
    factory = factory && typeof factory === 'object' ? factory : {};
    var raw = factory.raw && typeof factory.raw === 'object' ? factory.raw : {};
    var health = raw.productionHealth && typeof raw.productionHealth === 'object' ? raw.productionHealth : {};
    var healthStatus = String(health.status || factory.healthStatus || '').trim().toUpperCase();
    var assetStatus = String(raw.status || factory.status || '').trim().toUpperCase();
    var cycleStatus = String(factory.cycle && factory.cycle.status || '').trim().toUpperCase();
    var reason = String(health.reason || factory.healthReason || health.detail && health.detail.reason || '').trim().toUpperCase();
    var actual = num(health.productionUnitsPerCycle);
    var daily = factoryDailyOutput(factory);
    var hasPositiveProduction = actual !== null && actual > 0 || !!(daily && daily.value > 0);
    var blockingReason = /FACTORY_(INPUT|UTILITY|POWER|WORKFORCE|OPERATION).*SHORTAGE/.test(reason) || /FACTORY_DECOMMISSIONED_BY_PLAYER/.test(reason);
    var stopped = /^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|PAUSED)$/.test(healthStatus) ||
      /^(STOPPED|BLOCKED|FAILED|CLOSED|DECOMMISSIONED|DESTROYED|OFFLINE|DISABLED|UNDER_CONSTRUCTION|MAINTENANCE|TECHNOLOGY_LOCKED|READY)$/.test(assetStatus) ||
      /^(PAUSED|CANCELLED|BLOCKED|FAILED|STOPPED)$/.test(cycleStatus) ||
      /FACTORY_DECOMMISSIONED_BY_PLAYER/.test(reason) || blockingReason && !hasPositiveProduction;
    if (stopped) return { key: 'stopped', label: /DECOMMISSIONED|DESTROYED/.test(assetStatus) ? 'Decommissioned' : 'Stopped', reason: reason };
    var productivity = num(health.productivityPct !== undefined ? health.productivityPct : factory.productivityPct);
    var degradedStatus = /^(REDUCED|DEGRADED|PARTIAL|UNDERPOWERED)$/.test(healthStatus);
    if (degradedStatus || productivity !== null && productivity > 0 && productivity < 99.999) {
      if (hasPositiveProduction || cycleStatus === 'IN_PROGRESS') return { key: 'reduced', label: 'Reduced output', reason: reason };
      return { key: 'stopped', label: 'Stopped', reason: reason };
    }
    var claimsRunning = /^(RUNNING|PRODUCING)$/.test(healthStatus) || cycleStatus === 'IN_PROGRESS';
    if (claimsRunning && hasPositiveProduction) return { key: 'running', label: 'Producing', reason: reason };
    return { key: 'unknown', label: 'Output not recorded', reason: reason };
  }

  function factoryTypeLabel(factory) {
    var catalog = safeCatalog() || {};
    var type = normalizeFactoryType(factory && factory.type, catalog) || String(factory && factory.type || '').toUpperCase();
    var profiles = catalog.factoryProfiles && typeof catalog.factoryProfiles === 'object' ? catalog.factoryProfiles : {};
    var profile = profiles[type] || profiles[String(factory && factory.type || '').toUpperCase()] || {};
    return String(profile.name || factory && factory.type || 'Factory');
  }

  function factoryTypeOwnedCount(factory, model) {
    var catalog = safeCatalog() || {};
    var type = normalizeFactoryType(factory && factory.type, catalog) || String(factory && factory.type || '').toUpperCase();
    var rows = model && Array.isArray(model.factoryTypeCounts) ? model.factoryTypeCounts : [];
    for (var i = 0; i < rows.length; i += 1) {
      if ((normalizeFactoryType(rows[i].type, catalog) || String(rows[i].type || '').toUpperCase()) === type) {
        return rows[i].count;
      }
    }
    return 0;
  }

  function factoryCard(factory, options) {
    options = options || {};
    var model = options.model || {};
    var id = String(factory.id || factory.raw && (factory.raw.id || factory.raw.assetId || factory.raw.projectId) || '');
    var status = factoryProductionState(factory);
    var daily = factoryDailyOutput(factory);
    var selected = String(options.selectedFactoryId || '') === id;
    var ownedCount = factoryTypeOwnedCount(factory, model);
    var displayOutput = daily
      ? (daily.value > 0 ? '+ ' : '') + fmt(daily.value) + (daily.unit ? ' ' + esc(daily.unit) : '') + '/day'
      : 'Not recorded';
    var outputProduct = daily && daily.product ? '<small class="omega-v2-factory-output-product">' + esc(daily.product) + '</small>' : '';
    var reasonText = String(status.reason || '').trim();
    var reason = reasonText && !/^(NOT_RECORDED|NOT RECORDED|UNKNOWN)$/.test(reasonText.toUpperCase())
      ? '<small class="omega-v2-factory-reason">' + esc(reasonText.replace(/_/g, ' ').toLowerCase()) + '</small>' : '';
    var canOperate = model.canOperateSelectedCountry === true;
    var isDecommissioned = /^(DECOMMISSIONED|DESTROYED)$/.test(String(factory.status || '').toUpperCase());
    return '<article class="omega-v2-factory-card fp-card" data-omega-v2-factory-card data-factory-id="' + esc(id) +
      '" data-state="' + status.key + '" data-selected="' + (selected ? 'true' : 'false') +
      '" data-search="' + esc((factory.name + ' ' + id + ' ' + factory.type + ' ' + factory.recipeId).toLowerCase()) + '">' +
      '<span class="fp-badge" aria-hidden="true">' + factorySvgMarkup(factory) + '</span>' +
      '<button type="button" class="omega-v2-factory-title" data-omega-v2-factory-select="' + esc(id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '" aria-label="Select ' + esc(factory.name) + '">' +
        '<strong>' + esc(factory.name) + '</strong><small>' + esc(factoryTypeLabel(factory)) + '</small><span class="omega-v2-factory-title-mark" aria-hidden="true"></span>' +
      '</button>' +
      '<button type="button" class="omega-v2-factory-art" data-omega-v2-factory-select="' + esc(id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '" aria-label="Select ' + esc(factory.name) + ' factory">' +
        '<span class="omega-v2-factory-ring" aria-hidden="true"></span><span class="omega-v2-factory-artwell">' + factorySvgMarkup(factory) + '</span>' +
      '</button>' +
      '<div class="omega-v2-factory-status-plate" data-state="' + status.key + '">' +
        '<span class="omega-v2-factory-status-led" aria-hidden="true"></span><strong>' + esc(status.label) + '</strong>' +
        '<span class="omega-v2-factory-output">' + displayOutput + '</span>' + outputProduct + reason +
      '</div>' +
      '<div class="omega-v2-factory-count"><span>Total:</span><strong>' + fmt(ownedCount) + '</strong></div>' +
      '<div class="omega-v2-factory-actions">' +
        '<button type="button" class="omega-v2-factory-button omega-v2-factory-button--build" data-omega-v2-factory-build="' + esc(id) + '" data-factory-type="' + esc(factory.type) + '"' +
          (canOperate ? '' : ' disabled title="Build actions are available only for the active player country."') + '><span aria-hidden="true" class="omega-v2-action-icon omega-v2-action-icon--build"></span>Build</button>' +
        '<button type="button" class="omega-v2-factory-button omega-v2-factory-button--destroy" data-omega-v2-factory-destroy="' + esc(id) + '"' +
          (!canOperate || isDecommissioned ? ' disabled title="This factory cannot be decommissioned from the current country view."': '') +
          '><span aria-hidden="true" class="omega-v2-action-icon omega-v2-action-icon--destroy"></span>Destroy</button>' +
      '</div></article>';
  }
  function metalCommandCard(model) {
    var factoryNames = model.factories.length
      ? model.factories.map(function (factory) {
        return '<li><strong>' + esc(factory.name) + '</strong><span>' + esc(factory.type) + '</span></li>';
      }).join('')
      : '<li class="omega-v2-industry-register-empty">No commissioned factories are recorded. Catalog profiles are not counted as owned assets.</li>';
    var factoryTypeRows = (model.factoryTypeCounts || []).map(function (row) {
      return '<tr><td><strong>' + esc(row.name) + '</strong><small>' + esc(row.type) + '</small></td><td class="omega-v2-metal-number">' + fmt(row.count) + '</td></tr>';
    }).join('');
    var rates = model.mineSites.map(function (site) {
      var daily = site.dailyProduction || {};
      return '<tr><td><strong>' + esc(site.name) + '</strong><small>' + esc(site.siteId) + '</small></td>' +
        '<td>' + esc(site.resourceId) + '</td>' +
        '<td><strong>' + (daily.value === null || daily.value === undefined ? 'Not recorded' : fmt(daily.value, daily.unit)) + '</strong><small>' + esc(daily.basis || 'Not recorded') + '</small></td>' +
        '<td>' + esc(site.status) + '</td></tr>';
    }).join('');
    var additions = model.currentTurnExtraction.length
      ? model.currentTurnExtraction.map(function (row) {
        return '<div class="omega-v2-industry-addition"><span><strong>' + esc(row.resourceId) + '</strong><small>' + fmt(row.batchCount) + ' batch(es) · ' + fmt(row.siteCount) + ' site(s)</small><small>Average per simulation day: ' + (row.averagePerDay === null ? 'Not recorded (days per turn unavailable)' : fmt(row.averagePerDay, row.unit + '/game-day')) + '</small></span><b>' + fmt(row.quantity, row.unit) + '</b></div>';
      }).join('')
      : '<p class="omega-v2-industry-muted">No new extraction batches are recorded for ' + (model.currentTurnNumber === null ? 'the current turn' : 'turn ' + fmt(model.currentTurnNumber)) + '.</p>';
    var readOnly = !model.canOperateSelectedCountry;
    var accessLabel = model.canOperateSelectedCountry ? 'PLAYER COUNTRY · OPERATIONS AVAILABLE' : 'REFERENCE VIEW · OPERATIONS LOCKED';
    return '<section class="omega-v2-industry-command" aria-label="Country industrial and resource command panel">' +
      '<header class="omega-v2-industry-command-head"><div><div class="omega-v2-eyebrow">NATIONAL INDUSTRY REGISTER</div><h2>Industrial Command Plate</h2><p>Selected country: <strong>' + esc(model.countryId || 'Not recorded') + '</strong> · factory ownership comes from live game state</p></div>' +
      '<span class="omega-v2-industry-access" data-mode="' + (readOnly ? 'readonly' : 'player') + '">' + esc(accessLabel) + '</span></header>' +
      '<div class="omega-v2-industry-command-grid">' +
        '<div class="omega-v2-metal-plate omega-v2-metal-plate--gold"><span class="omega-v2-metal-label">TOTAL FACTORIES</span><strong class="omega-v2-metal-number">' + fmt(model.factoryCount) + '</strong><small>Registered factory assets</small><span class="omega-v2-metal-stamp">COUNTRY ' + esc(model.countryId || 'N/A') + '</span></div>' +
        '<div class="omega-v2-industry-svg-slot" data-omega-factory-svg-slot data-country-id="' + esc(model.countryId || '') + '" role="img" aria-label="Empty reserved factory SVG artwork area"><div class="omega-v2-industry-svg-frame"><span>FACTORY SVG SLOT</span><small>Paste the country factory SVG here</small></div></div>' +
        '<div class="omega-v2-metal-plate omega-v2-metal-plate--silver omega-v2-industry-register"><div class="omega-v2-metal-label">FACTORY TYPE · TOTAL COUNT</div><div class="omega-v2-industry-register-count">' + fmt(model.factoryCount) + ' recorded</div>' +
          '<div class="omega-v2-industry-table-wrap omega-v2-industry-type-table"><table><thead><tr><th>Factory name / type</th><th>Total</th></tr></thead><tbody>' +
          (factoryTypeRows || '<tr><td colspan="2">No factory assets</td></tr>') + '</tbody></table></div>' +
          '<details class="omega-v2-industry-factory-names"><summary>Individual registered factory names (' + fmt(model.factoryNames.length) + ')</summary><ul>' + factoryNames + '</ul></details></div>' +
      '</div>' +
      '<div class="omega-v2-industry-resource-stats">' +
        '<div class="omega-v2-metal-plate omega-v2-metal-plate--blue"><span class="omega-v2-metal-label">REGISTERED RESOURCE SITES</span><strong class="omega-v2-metal-number">' + fmt(model.registeredMineSiteCount) + '</strong><small>Country-specific canonical sites</small></div>' +
        '<div class="omega-v2-metal-plate omega-v2-metal-plate--copper"><span class="omega-v2-metal-label">OPERATING MINE ASSETS</span><strong class="omega-v2-metal-number">' + fmt(model.operatingMineCount) + '</strong><small>Operational player/game assets</small></div>' +
        '<div class="omega-v2-metal-plate omega-v2-metal-plate--steel"><span class="omega-v2-metal-label">DAILY OUTPUT DATA</span><strong class="omega-v2-metal-number">' + fmt(model.dailyProductionKnownCount) + ' / ' + fmt(model.registeredMineSiteCount) + '</strong><small>Sites with a usable daily rate or capacity</small></div>' +
      '</div>' +
      '<div class="omega-v2-industry-production-row"><section class="omega-v2-industry-panel"><h3>Daily mine production / capacity</h3><p>Values are shown per site and keep their source status. Different resource units are not added into a misleading world-total number.</p>' +
        (rates ? '<div class="omega-v2-industry-table-wrap"><table><thead><tr><th>Mine / resource site</th><th>Resource</th><th>Daily rate or capacity</th><th>Source status</th></tr></thead><tbody>' + rates + '</tbody></table></div>' : '<div class="omega-v2-empty">No canonical resource sites are recorded for this selected country.</div>') +
      '</section><section class="omega-v2-industry-panel"><h3>New resources added this turn</h3><p>' + (model.currentTurnNumber === null ? 'Current game turn not recorded.' : 'Authoritative extraction ledger · turn ' + fmt(model.currentTurnNumber)) + '</p><div class="omega-v2-industry-additions">' + additions + '</div><small>Counts only committed extraction-ledger quantities from the selected country and current turn. Old turns, foreign-country rows and catalog estimates are excluded.</small></section></div>' +
      '<div class="omega-v2-industry-actions">' +
        '<button type="button" class="omega-v2-button omega-v2-button--primary" data-omega-v2-industry-action="open-mines">Build / view mines</button>' +
        '<button type="button" class="omega-v2-button" data-omega-v2-industry-action="open-extraction"' + (readOnly ? ' disabled title="Extraction controls are locked outside the active player country."' : '') + '>Open extraction controls</button>' +
        '<button type="button" class="omega-v2-button" data-omega-v2-industry-action="factory-projects">Factory projects</button>' +
        '<button type="button" class="omega-v2-button" data-omega-v2-industry-action="research">Research records</button>' +
        '<button type="button" class="omega-v2-button" data-omega-v2-jump-ministry="science_research">Technology development</button>' +
        '<button type="button" class="omega-v2-button" data-omega-v2-jump-ministry="infrastructure">Roads &amp; logistics</button>' +
      '</div>' +
      '<p class="omega-v2-industry-footnote">Real-world reported quantities and simulated gameplay capacity are kept distinct. Unknown values stay “Not recorded”. Buttons open existing game systems; they do not fabricate a build, extraction, road or technology result.</p>' +
    '</section>';
  }

  function factoryTypeBuildSupport(type, catalog) {
    catalog = catalog || safeCatalog() || {};
    var wanted = normalizeFactoryType(type, catalog) || String(type || '').toUpperCase();
    var recipes = Object.keys(catalog.downstreamFactoryRecipes || {}).map(function (key) {
      return Object.assign({ recipeId: key }, catalog.downstreamFactoryRecipes[key] || {});
    }).filter(function (row) {
      return (normalizeFactoryType(row.factoryType, catalog) || String(row.factoryType || '').toUpperCase()) === wanted;
    }).sort(function (a, b) { return String(a.recipeId || '').localeCompare(String(b.recipeId || '')); });
    var resources = Object.keys(catalog.processingRules || {}).filter(function (resourceId) {
      var row = catalog.processingRules[resourceId] || {};
      return (normalizeFactoryType(row.factoryType, catalog) || String(row.factoryType || '').toUpperCase()) === wanted;
    }).sort();
    return { recipes: recipes, resources: resources, canBuild: recipes.length > 0 || resources.length > 0 };
  }

  function factoryTypeCard(item, model) {
    item = item || {};
    model = model || {};
    var catalog = safeCatalog() || {};
    var type = normalizeFactoryType(item.type, catalog) || String(item.type || '').toUpperCase();
    var support = factoryTypeBuildSupport(type, catalog);
    var ownedCount = model.hasCountryState ? factoryTypeOwnedCount({ type: type }, model) : null;
    var canBuild = model.canOperateSelectedCountry === true && support.canBuild;
    var duration = item.constructionDays == null ? 'Not recorded' : fmt(item.constructionDays) + ' game-days';
    var capacity = item.defaultCapacityPerDay == null ? 'Not recorded' : fmt(item.defaultCapacityPerDay) + ' simulation units/day';
    var cost = item.constructionCost == null ? 'Not recorded' : fmt(item.constructionCost);
    var disabledReason = !model.canOperateSelectedCountry
      ? 'Building is available only for the active player country.'
      : !support.canBuild ? 'No canonical recipe/input is registered for this type.' : '';
    return '<article class="omega-v2-factory-type-card" data-omega-v2-factory-type-card data-factory-type="' + esc(type) + '">' +
      '<header class="fp-type-card-head"><span class="fp-type-card-art">' + factorySvgMarkup({ type:type, name:item.name || type }) + '</span>' +
      '<span class="fp-type-card-name"><strong>' + esc(item.name || type) + '</strong><small>' + esc(item.category || 'Uncategorised') + '</small></span></header>' +
      '<div class="fp-type-card-count"><span>Registered game assets</span><strong>' + fmt(ownedCount) + '</strong></div>' +
      '<dl class="fp-type-card-metrics"><div><dt>Modeled build time</dt><dd>' + esc(duration) + '</dd></div>' +
      '<div><dt>Modeled capacity</dt><dd>' + esc(capacity) + '</dd></div>' +
      '<div><dt>Modeled construction cost</dt><dd>' + esc(cost) + '</dd></div></dl>' +
      '<div class="fp-type-card-actions"><button type="button" class="omega-v2-factory-button omega-v2-factory-button--build" data-omega-v2-factory-build="CATALOG" data-factory-type="' + esc(type) + '"' +
      (canBuild ? '' : ' disabled title="' + esc(disabledReason) + '"') +
      '><span aria-hidden="true" class="omega-v2-action-icon omega-v2-action-icon--build"></span>Build project</button></div></article>';
  }

  function factoryTypeCatalogMarkup(model) {
    model = model || {};
    var rows = Array.isArray(model.factoryTypeCatalog) ? model.factoryTypeCatalog.slice() : [];
    rows.sort(function (a, b) {
      var categoryA = String(a && a.category || 'Uncategorised');
      var categoryB = String(b && b.category || 'Uncategorised');
      var byCategory = categoryA.localeCompare(categoryB);
      return byCategory || String(a && (a.name || a.type) || '').localeCompare(String(b && (b.name || b.type) || ''));
    });
    var cards = '', lastCategory = null;
    rows.forEach(function (item) {
      var category = String(item && item.category || 'Uncategorised');
      if (lastCategory !== null && category !== lastCategory) cards += '<div class="fp-type-catalog-divider" role="separator" aria-hidden="true"></div>';
      cards += factoryTypeCard(item, model);
      lastCategory = category;
    });
    var empty = '<div class="omega-v2-factory-type-empty">Factory type profiles are not loaded. No ownership or production figures have been invented.</div>';
    return '<section class="fp-type-catalog" aria-label="Factory types and selected-country totals">' +
      '<header class="fp-type-catalog-heading"><div><span>OMEGA / COUNTRY INDUSTRY REGISTER</span><strong>Factory types &amp; country totals</strong></div>' +
      '<span class="fp-type-catalog-total">' + fmt(rows.length) + ' types</span></header>' +
      '<p class="fp-type-catalog-note">These are canonical factory-type definitions. Country totals count only registered OMEGA game-state assets; catalogue profiles are not owned factories. Missing country state is shown as “Not recorded”.</p>' +
      '<div class="fp-type-catalog-grid">' + (cards || empty) + '</div></section>';
  }

  function factoryProjectModal(model, requestedType) {
    model = model || {};
    var catalog = safeCatalog() || {};
    var type = normalizeFactoryType(requestedType, catalog) || String(requestedType || '').toUpperCase();
    var profiles = catalog.factoryProfiles && typeof catalog.factoryProfiles === 'object' ? catalog.factoryProfiles : {};
    var profile = profiles[type] || {};
    var support = factoryTypeBuildSupport(type, catalog);
    var recipeControl = support.recipes.length
      ? '<label>Production recipe<select name="recipeId"><option value="">Use the profile default</option>' + support.recipes.map(function (recipe) {
          var id = String(recipe.recipeId || recipe.id || '');
          var selected = id && id === String(profile.defaultRecipeId || '') ? ' selected' : '';
          return '<option value="' + esc(id) + '"' + selected + '>' + esc(recipe.name || recipe.title || id) + ' · ' + esc(id) + '</option>';
        }).join('') + '</select></label>'
      : '';
    var resourceControl = !support.recipes.length && support.resources.length
      ? '<label>Processing input<select name="resourceId" required><option value="">Select a registered input</option>' + support.resources.map(function (resourceId) {
          return '<option value="' + esc(resourceId) + '">' + esc(resourceId.replace(/_/g, ' ')) + '</option>';
        }).join('') + '</select></label>'
      : '';
    var disabled = !model.canOperateSelectedCountry || !support.canBuild;
    var gateText = !model.canOperateSelectedCountry
      ? 'This is a read-only country view. Select it as the active player country before building.'
      : !support.canBuild
        ? 'No canonical recipe/input is linked to this type. Construction cannot start with missing production rules.'
        : 'The authoritative runtime validates recipe, construction materials and stock. Opening this form does not guarantee approval.';
    return '<div class="omega-v2-factory-project-overlay" role="presentation"><section class="omega-v2-factory-project-dialog" role="dialog" aria-modal="true" aria-labelledby="omega-v2-factory-project-title">' +
      '<header class="fp-project-heading"><div><span>OMEGA / INDUSTRIAL PROJECTS</span><h2 id="omega-v2-factory-project-title">Start factory construction</h2></div>' +
      '<button type="button" class="fp-project-close" data-omega-v2-factory-project-cancel aria-label="Close construction form">×</button></header>' +
      '<form data-omega-v2-factory-project-form><input type="hidden" name="factoryType" value="' + esc(type) + '">' +
      '<div class="fp-project-type"><span>Factory type</span><strong>' + esc(profile.name || type) + '</strong><small>' + esc(type) + '</small></div>' +
      recipeControl + resourceControl +
      '<div class="fp-project-fields"><label>Build duration (modeled game-days)<input type="number" name="buildDays" min="1" step="1" inputmode="numeric" placeholder="' + esc(profile.constructionDays || 'Use profile default') + '"></label>' +
      '<label>Capacity (simulation units/day)<input type="number" name="capacityPerDay" min="1" step="any" inputmode="decimal" placeholder="' + esc(profile.defaultCapacityPerDay || 'Use profile default') + '"></label>' +
      '<label>Construction cost (' + esc(profile.unit || 'GAME_CURRENCY_UNITS') + ')<input type="number" name="cost" min="1" step="any" inputmode="decimal" placeholder="' + esc(profile.constructionCost || 'Use profile default') + '"></label></div>' +
      '<p class="fp-project-note">' + esc(gateText) + '</p><div class="fp-project-actions">' +
      '<button type="submit" class="omega-v2-factory-button omega-v2-factory-button--build"' + (disabled ? ' disabled' : '') + '>Start construction project</button>' +
      '<button type="button" class="omega-v2-factory-button fp-project-cancel" data-omega-v2-factory-project-cancel>Cancel</button></div></form></section></div>';
  }

  function render(root, options) {
    options = options || {};
    if (!root) return { ok: false, code: 'INDUSTRY_ROOT_REQUIRED' };
    var model = buildViewModel(options);
    var active = options.tab || root.__omegaV2IndustryTab || 'factories';
    var countryKey = String(model.countryId || '');
    if (root.__omegaV2IndustryCountryId !== countryKey) {
      root.__omegaV2IndustryCountryId = countryKey;
      root.__omegaV2IndustryFactoryViewExplicit = false;
      root.__omegaV2IndustryFactoryView = model.factoryCount > 0 ? 'assets' : 'types';
    }
    if (options.factoryView === 'assets' || options.factoryView === 'types') {
      root.__omegaV2IndustryFactoryView = options.factoryView;
      root.__omegaV2IndustryFactoryViewExplicit = true;
    }
    if (!root.__omegaV2IndustryFactoryViewExplicit) root.__omegaV2IndustryFactoryView = model.factoryCount > 0 ? 'assets' : 'types';
    var factoryView = root.__omegaV2IndustryFactoryView === 'types' ? 'types' : 'assets';
    var content = '';
    if (active === 'factories') {
      content = model.factories.length ? '<div class="omega-v2-grid">' + model.factories.map(function (row) { return factoryCard(row, options); }).join('') + '</div>' : '<div class="omega-v2-empty">No commissioned production assets are recorded for ' + esc(model.countryId || 'the selected country') + '. Catalog profiles are not counted as owned factories.</div>';
    } else if (active === 'production-lines') {
      content = model.cycles.length ? '<div class="omega-v2-grid">' + model.cycles.map(function (cycle) {
        return '<article class="omega-v2-card"><h3 class="omega-v2-card-title">' + esc(cycle.factoryId) + '</h3><span class="omega-v2-status">' + esc(cycle.status || 'NOT_RECORDED') + '</span><div class="omega-v2-vehicle-stats"><div><span>Output quantity</span><strong>' + fmt(cycle.productionQuantity) + '</strong></div><div><span>Start date</span><strong>' + esc(cycle.startDate || 'Not recorded') + '</strong></div><div><span>Finish date</span><strong>' + esc(cycle.finishDate || 'Not recorded') + '</strong></div><div><span>Source batches</span><strong>' + fmt(Array.isArray(cycle.sourceBatchIds) ? cycle.sourceBatchIds.length : null) + '</strong></div></div></article>';
      }).join('') + '</div>' : '<div class="omega-v2-empty">No tracked production cycles were returned by this country’s industrial state.</div>';
    } else if (active === 'inventory') {
      var rows = [];
      model.factories.forEach(function (factory) { factory.inputRows.forEach(function (item) { rows.push({ factory: factory.id || factory.name, resource: item.resourceId, quantity: item.quantity }); }); });
      content = rows.length ? '<div class="omega-v2-card"><div class="omega-v2-table-wrap"><table><thead><tr><th>Factory</th><th>Input resource</th><th>Recorded quantity</th></tr></thead><tbody>' + rows.map(function (row) { return '<tr><td>' + esc(row.factory) + '</td><td>' + esc(row.resource) + '</td><td>' + fmt(row.quantity) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="omega-v2-source">Rows reflect per-factory input inventory only. They do not assert country-wide warehouse availability or a completed logistics receipt.</p></div>' : '<div class="omega-v2-empty">No per-factory input quantities are recorded. Shared warehouse stock is not inferred.</div>';
    } else if (active === 'research') {
      var researchRows = model.researchProjects.map(function (item) { return Object.assign({ recordType:'RESEARCH' }, item || {}); })
        .concat(model.technologyTransfers.map(function (item) { return Object.assign({ recordType:'TECHNOLOGY TRANSFER' }, item || {}); }))
        .concat(model.technologyContracts.map(function (item) { return Object.assign({ recordType:'TECHNOLOGY CONTRACT' }, item || {}); }));
      var researchCards = researchRows.map(function (item) {
        var title = item.technologyName || item.name || item.title || item.technologyId || item.projectId || item.id || item.contractId || 'Technology record';
        var progress = num(item.progressPct !== undefined ? item.progressPct : item.progress);
        var progressText = progress === null ? 'Not recorded' : fmt(Math.max(0, Math.min(100, progress)), '%');
        var progressUnits = item.progressUnits !== undefined || item.requiredUnits !== undefined
          ? fmt(item.progressUnits) + ' / ' + fmt(item.requiredUnits) : 'Not recorded';
        var source = item.donorCountryName || item.donorCountryId || item.sourceCountryId || item.source || 'Not recorded';
        return '<article class="omega-v2-card"><div class="omega-v2-card-header"><div><h3 class="omega-v2-card-title">' + esc(title) + '</h3><div class="omega-v2-card-meta">' + esc(item.recordType) + ' · ' + esc(item.technologyId || item.projectId || item.id || 'ID not recorded') + '</div></div><span class="omega-v2-status">' + esc(item.status || 'NOT_RECORDED') + '</span></div><div class="omega-v2-vehicle-stats"><div><span>Progress</span><strong>' + progressText + '</strong></div><div><span>Progress units</span><strong>' + progressUnits + '</strong></div><div><span>Research / transfer rate</span><strong>' + fmt(item.researchRate !== undefined ? item.researchRate : item.transferRate) + '</strong></div><div><span>Source / donor</span><strong>' + esc(source) + '</strong></div><div><span>Started turn</span><strong>' + fmt(item.startedTurn !== undefined ? item.startedTurn : item.requestedTurn) + '</strong></div><div><span>Completed turn</span><strong>' + fmt(item.completedTurn) + '</strong></div></div></article>';
      }).join('');
      var capabilityCards = model.technologyCapabilities.map(function (item) {
        var title = item.technologyName || item.name || item.technologyId || item.capabilityId || item.id || 'Technology capability';
        return '<article class="omega-v2-card"><div class="omega-v2-card-header"><h3 class="omega-v2-card-title">' + esc(title) + '</h3><span class="omega-v2-status">' + esc(item.status || item.sourceType || 'UNLOCKED') + '</span></div><div class="omega-v2-vehicle-stats"><div><span>Capability ID</span><strong>' + esc(item.capabilityId || item.technologyId || item.id || 'Not recorded') + '</strong></div><div><span>Source</span><strong>' + esc(item.sourceType || item.source || 'Not recorded') + '</strong></div><div><span>Completed turn</span><strong>' + fmt(item.completedTurn) + '</strong></div></div></article>';
      }).join('');
      content = '<section><h3 class="omega-v2-section-title">Research projects and technology transfers</h3>' +
        (researchCards ? '<div class="omega-v2-grid">' + researchCards + '</div>' : '<div class="omega-v2-empty">No research or technology-transfer records are recorded for ' + esc(model.countryId || 'the selected country') + '.</div>') +
        '<h3 class="omega-v2-section-title">Unlocked technology capabilities</h3>' +
        (capabilityCards ? '<div class="omega-v2-grid">' + capabilityCards + '</div>' : '<div class="omega-v2-empty">No technology capabilities are recorded for this country.</div>') +
        '<p class="omega-v2-source">Research, transfer and capability rows are read from this country’s authoritative resource state. Foreign-country project rows are not copied into this view.</p></section>';
    } else if (active === 'national-inventory') {
      var snapshot = model.nationalInventory;
      if (snapshot && snapshot.status === 'READY') {
        var stockRows = Array.isArray(snapshot.items) ? snapshot.items : [];
        var inventoryStatus = snapshot.active ? 'PLAYER INVENTORY · ACTIVE' : 'READ-ONLY SNAPSHOT';
        content = '<div class="omega-v2-card"><div class="omega-v2-card-header"><div><h3 class="omega-v2-card-title">' + esc(snapshot.countryName || snapshot.countryId || model.countryId) + ' inventory</h3><div class="omega-v2-card-meta">' + esc(inventoryStatus) + ' · ' + fmt(stockRows.length) + ' product records</div></div><span class="omega-v2-status">' + (snapshot.unbounded ? 'UNBOUNDED STOCK LOG' : 'STOCK STATUS') + '</span></div>' +
          (stockRows.length ? '<div class="omega-v2-table-wrap"><table><thead><tr><th>Product</th><th>Product ID</th><th>Base</th><th>On hand</th><th>Change</th><th>Unit</th></tr></thead><tbody>' + stockRows.map(function (row) {
            return '<tr><td>' + esc(row.name) + '</td><td>' + esc(row.productId) + '</td><td>' + fmt(row.base) + '</td><td><strong>' + fmt(row.quantity) + '</strong></td><td>' + fmt(row.deltaFromBase) + '</td><td>' + esc(row.unit || 'Not recorded') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="omega-v2-empty">No product catalog rows are available for this country yet.</p>') +
          '<p class="omega-v2-source">Factory output, imports, consumption and exports are recorded against the selected country. Other countries are read-only snapshots until selected by the player. Inventory has no fixed capacity or ledger-entry cap.</p></div>';
      } else {
        content = '<div class="omega-v2-empty">Country inventory runtime is initializing or no country has been selected.</div>';
      }
    } else {
      content = model.projects.length ? '<div class="omega-v2-grid">' + model.projects.slice().reverse().map(function (project) {
        return '<article class="omega-v2-card"><div class="omega-v2-card-header"><h3 class="omega-v2-card-title">' + esc(project.projectType || 'Industrial project') + '</h3><span class="omega-v2-status">' + esc(project.status || 'NOT_RECORDED') + '</span></div><div class="omega-v2-vehicle-stats"><div><span>Project ID</span><strong>' + esc(project.projectId || 'Not recorded') + '</strong></div><div><span>Site / factory</span><strong>' + esc(project.siteId || project.factoryId || 'Not recorded') + '</strong></div><div><span>Start turn</span><strong>' + fmt(project.createdTurn !== undefined ? project.createdTurn : project.startedTurn) + '</strong></div><div><span>Cost</span><strong>' + (num(project.costUsd) === null ? 'Not recorded' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num(project.costUsd))) + '</strong></div></div></article>';
      }).join('') + '</div>' : '<div class="omega-v2-empty">No industrial or construction project rows are recorded for this country.</div>';
    }

    root.classList.add('omega-v2-screen');
    var tabLabels = {
      factories:'Factory assets',
      'production-lines':'Production lines',
      inventory:'Factory input records',
      'national-inventory':'National Inventory',
      research:'Research & technology',
      projects:'Industrial projects'
    };
    var activeLabel = tabLabels[active] || 'Factory production';
    if (active !== 'factories') root.__omegaV2IndustryNotice = '';
    var compactTabs = '<header class="fp-top" aria-label="Factory production navigation">' +
      '<div class="fp-logo" aria-hidden="true"><svg class="fp-ic" viewBox="0 0 24 24"><path d="M3 21V9l6 3V8l6 4V6l6 3v12Z"/><path d="M6 21v-5m5 5v-5m5 5v-5M3 21h18"/></svg></div>' +
      '<div class="fp-top-identity"><span>OMEGA / INDUSTRIAL SYSTEMS</span><strong>FACTORY PRODUCTION</strong><small>COUNTRY: ' + esc(model.countryId || 'Not recorded') + ' · ' + (model.canOperateSelectedCountry ? 'PLAYER CONTROL' : 'REFERENCE VIEW') + '</small></div>' +
      '<nav class="omega-v2-factory-tabs fp-tabs" aria-label="Industrial panels">' +
      tabButton('factories', 'Factories', active) +
      tabButton('production-lines', 'Lines', active) +
      tabButton('inventory', 'Inputs', active) +
      tabButton('national-inventory', 'Stock', active) +
      tabButton('research', 'R&D', active) +
      tabButton('projects', 'Projects', active) +
      (active === 'factories' ? '<button type="button" class="omega-v2-button fp-view-toggle" data-omega-v2-factory-view-toggle aria-label="' +
        (factoryView === 'types' ? 'Show owned factory assets' : 'Show canonical factory types and country totals') + '">' +
        (factoryView === 'types' ? 'Assets' : 'Types &amp; totals') + '</button>' : '') +
      '</nav></header>';
    var factoryCards = model.factories.length
      ? model.factories.map(function (row) {
          return factoryCard(row, Object.assign({}, options, {
            model: model,
            selectedFactoryId: root.__omegaV2SelectedFactoryId || '',
            onOpenFactory: options.onOpenFactory
          }));
        }).join('')
      : '<div class="omega-v2-factory-empty">No commissioned factories are recorded for ' + esc(model.countryId || 'the selected country') + '.</div>';
    var summaryMarkup = '<div class="fp-summary" aria-label="Selected country production summary">' +
      '<div class="fp-summary-item"><span>COUNTRY</span><strong>' + esc(model.countryId || 'Not recorded') + '</strong></div>' +
      '<div class="fp-summary-item"><span>FACTORIES</span><strong>' + fmt(model.factoryCount) + '</strong></div>' +
      '<div class="fp-summary-item"><span>PRODUCTION CYCLES</span><strong>' + fmt(model.cycles.length) + '</strong></div>' +
      '<div class="fp-summary-item"><span>RECORDED INPUT ROWS</span><strong>' + fmt(model.inputInventoryCount) + '</strong></div>' +
      '</div>';
    var panelBody = active === 'factories'
      ? (factoryView === 'types' ? factoryTypeCatalogMarkup(model) : '<div class="omega-v2-factory-deck">' + factoryCards + '</div>')
      : '<div class="fp-content" data-omega-v2-industry-content data-active-tab="' + esc(active) + '">' +
          '<header class="fp-content-heading"><div><span>OMEGA / COUNTRY DATA</span><strong>' + esc(activeLabel) + '</strong></div>' +
          '<span class="fp-content-country">' + esc(model.countryId || 'Country not selected') + '</span></header>' +
          '<div class="fp-content-body">' + content + '</div>' +
        '</div>';
    root.innerHTML = '<section class="omega-v2-shell omega-v2-industry omega-v2-industry--factory-home">' +
      '<div class="omega-v2-factory-command fp-stage" data-glow="hover" data-active-tab="' + esc(active) + '" data-factory-view="' + esc(active === 'factories' ? factoryView : 'assets') + '" aria-label="Factory production control">' +
      '<img class="omega-v2-factory-backdrop" src="assets/ui-photos/industrial-production-line.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" width="1280" height="720">' +
      '<a class="omega-v2-factory-photo-credit" href="https://commons.wikimedia.org/wiki/File:Industrial_production_line_operating_in_a_large_modern_factory.jpg" target="_blank" rel="noopener noreferrer" aria-label="Photo credit: Shixart1985. CC BY 2.0 license. Image resized and converted to WebP.">Photo: <span class="omega-v2-factory-photo-author">Shixart1985</span></a><a class="omega-v2-factory-photo-license" href="https://creativecommons.org/licenses/by/2.0/" target="_blank" rel="license noopener noreferrer" aria-label="Creative Commons Attribution 2.0 license">CC BY 2.0</a><span class="omega-v2-factory-photo-credit__changes">Image resized and converted to WebP.</span>' +
      (root.__omegaV2IndustryNotice ? '<div class="omega-v2-factory-notice" role="status">' + esc(root.__omegaV2IndustryNotice) + '</div>' : '') +
      compactTabs + summaryMarkup + panelBody + '<div class="fp-deck" aria-hidden="true"></div></div>' +
      (root.__omegaV2IndustryBuildFactoryType ? factoryProjectModal(model, root.__omegaV2IndustryBuildFactoryType) : '') + '</section>';

    if (!root.__omegaV2IndustryBound && typeof root.addEventListener === 'function') {
      root.addEventListener('error', function (event) {
        var image = event && event.target;
        if (!image || !image.matches || !image.matches('[data-omega-v2-factory-svg]')) return;
        var fallback = image.getAttribute('data-fallback') || '';
        if (!fallback || image.getAttribute('src') === fallback) return;
        image.setAttribute('src', fallback);
      }, true);
      root.addEventListener('click', function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;

        var viewToggle = target.closest('[data-omega-v2-factory-view-toggle]');
        if (viewToggle && root.contains(viewToggle)) {
          root.__omegaV2IndustryFactoryView = factoryView === 'types' ? 'assets' : 'types';
          root.__omegaV2IndustryFactoryViewExplicit = true;
          root.__omegaV2IndustryNotice = '';
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories', factoryView: root.__omegaV2IndustryFactoryView }));
          return;
        }
        var cancelProject = target.closest('[data-omega-v2-factory-project-cancel]');
        if (cancelProject && root.contains(cancelProject)) {
          root.__omegaV2IndustryBuildFactoryType = '';
          root.__omegaV2IndustryNotice = '';
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: root.__omegaV2IndustryTab || 'factories' }));
          return;
        }

        var factorySelect = target.closest('[data-omega-v2-factory-select]');
        if (factorySelect && root.contains(factorySelect)) {
          root.__omegaV2SelectedFactoryId = factorySelect.getAttribute('data-omega-v2-factory-select') || '';
          root.__omegaV2IndustryNotice = '';
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }

        var buildFactory = target.closest('[data-omega-v2-factory-build]');
        if (buildFactory && root.contains(buildFactory) && !buildFactory.disabled) {
          var selectedFactoryType = normalizeFactoryType(buildFactory.getAttribute('data-factory-type') || '', safeCatalog() || {});
          if (!selectedFactoryType) {
            root.__omegaV2IndustryNotice = 'This factory type is not registered in the canonical catalogue.';
            render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
            return;
          }
          root.__omegaV2IndustryBuildFactoryType = selectedFactoryType;
          root.__omegaV2IndustryNotice = '';
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }

        var destroyFactory = target.closest('[data-omega-v2-factory-destroy]');
        if (destroyFactory && root.contains(destroyFactory) && !destroyFactory.disabled) {
          var destroyModel = root.__omegaV2IndustryModel || model;
          var factoryIdToDestroy = destroyFactory.getAttribute('data-omega-v2-factory-destroy') || '';
          var industrialNetwork = safeNetwork();
          if (!industrialNetwork || typeof industrialNetwork.decommissionFactory !== 'function') {
            root.__omegaV2IndustryNotice = 'Factory decommissioning is unavailable; no game state was changed.';
            render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
            return;
          }
          var confirmed = typeof g.confirm === 'function' && g.confirm('Decommission this factory? Active production will stop. Historical records will be preserved.');
          if (!confirmed) return;
          var decommissionResult = industrialNetwork.decommissionFactory({
            countryId: destroyModel.countryId, factoryId: factoryIdToDestroy, confirmed: true
          });
          var decommissionStatus = String(decommissionResult && decommissionResult.status || '').toUpperCase();
          root.__omegaV2IndustryNotice = decommissionStatus === 'DECOMMISSIONED'
            ? 'Factory decommissioned. Production stopped; history preserved.'
            : 'Factory unchanged. ' + String(decommissionResult && (decommissionResult.reason || decommissionResult.status) || 'Runtime rejected the request').replace(/_/g, ' ').toLowerCase() + '.';
          root.__omegaV2SelectedFactoryId = '';
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }
        var tab = target.closest('[data-omega-v2-industry-tab]');
        if (tab && root.contains(tab)) {
          root.__omegaV2IndustryTab = tab.getAttribute('data-omega-v2-industry-tab');
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: root.__omegaV2IndustryTab }));
          return;
        }
        var commandAction = target.closest('[data-omega-v2-industry-action]');
        if (commandAction && root.contains(commandAction) && !commandAction.disabled) {
          var activeModel = root.__omegaV2IndustryModel || model;
          var actionName = commandAction.getAttribute('data-omega-v2-industry-action');
          if (actionName === 'open-mines' || actionName === 'open-extraction') {
            var mineUi = g.OmegaResourceMineManagementUI || (g.Omega && g.Omega.ResourceMineManagementUI);
            if (mineUi && typeof mineUi.open === 'function') {
              var selected = activeModel.countryId;
              if (actionName === 'open-extraction' && activeModel.canOperateSelectedCountry) mineUi.open('my-mines', selected);
              else mineUi.open('mines', selected);
            } else {
              var app = g.OmegaUIV2App;
              if (app && typeof app.navigate === 'function') app.navigate(root.closest('.omega-v2-app-root') || root, 'resources');
              else if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') {
                g.dispatchEvent(new g.CustomEvent('OMEGA_OPEN_RESOURCE_MINE_MANAGEMENT', { detail: { countryId: activeModel.countryId, view: actionName === 'open-extraction' ? 'my-mines' : 'mines' } }));
              }
            }
            return;
          }
          if (actionName === 'factory-projects') {
            root.__omegaV2IndustryTab = 'projects';
            render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'projects' }));
            return;
          }
          if (actionName === 'research') {
            root.__omegaV2IndustryTab = 'research';
            render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'research' }));
            return;
          }
        }
        var factory = target.closest('[data-omega-v2-open-factory]');
        if (factory && root.contains(factory) && !factory.disabled) {
          var callback = root.__omegaV2IndustryOptions && root.__omegaV2IndustryOptions.onOpenFactory;
          if (typeof callback === 'function') callback(factory.getAttribute('data-omega-v2-open-factory'), root.__omegaV2IndustryModel || model);
        }
      });
      root.addEventListener('submit', async function (event) {
        var target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        var form = target.closest('[data-omega-v2-factory-project-form]');
        if (!form || !root.contains(form)) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        function valueOf(name) {
          var control = form.elements && form.elements[name];
          return control && control.value !== undefined ? String(control.value).trim() : '';
        }
        function positiveNumber(name) {
          var raw = valueOf(name);
          if (!raw) return null;
          var parsed = Number(raw);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        }
        var activeModel = root.__omegaV2IndustryModel || model;
        var catalog = safeCatalog() || {};
        var type = normalizeFactoryType(valueOf('factoryType'), catalog) || '';
        var modalType = normalizeFactoryType(root.__omegaV2IndustryBuildFactoryType, catalog) || '';
        if (!type || type !== modalType) {
          root.__omegaV2IndustryNotice = 'Construction cancelled: the selected factory type changed.';
          root.__omegaV2IndustryBuildFactoryType = '';
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }
        if (!activeModel.canOperateSelectedCountry) {
          root.__omegaV2IndustryNotice = 'Construction blocked: only the active player country may start factory projects.';
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }
        var network = safeNetwork();
        if (!network || typeof network.startFactoryProject !== 'function') {
          root.__omegaV2IndustryNotice = 'Factory construction runtime is unavailable. No game state was changed.';
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          return;
        }
        var request = {
          countryId: activeModel.countryId, factoryType: type,
          requestId: 'OMEGA-UI-V2-FACTORY:' + String(activeModel.countryId || '') + ':' + type + ':' + Date.now()
        };
        var recipeId = valueOf('recipeId');
        var resourceId = valueOf('resourceId');
        var cost = positiveNumber('cost');
        var capacityPerDay = positiveNumber('capacityPerDay');
        var buildDays = positiveNumber('buildDays');
        if (recipeId) request.recipeId = recipeId;
        if (resourceId) request.resourceId = resourceId;
        if (cost !== null) request.cost = cost;
        if (capacityPerDay !== null) request.capacityPerDay = capacityPerDay;
        if (buildDays !== null) request.buildDays = buildDays;
        try {
          if (typeof network.loadCatalog === 'function') await network.loadCatalog();
          var result = network.startFactoryProject(request);
          var status = String(result && result.status || '').toUpperCase();
          if (status === 'UNDER_CONSTRUCTION' && String(result.projectType || '') === 'FACTORY_CONSTRUCTION') {
            root.__omegaV2IndustryBuildFactoryType = '';
            root.__omegaV2IndustryFactoryView = 'assets';
            root.__omegaV2IndustryFactoryViewExplicit = true;
            render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'projects', factoryView: 'assets' }));
          } else {
            var reason = String(result && (result.reason || result.status) || 'FACTORY_PROJECT_NOT_STARTED').replace(/_/g, ' ').toLowerCase();
            root.__omegaV2IndustryNotice = 'Factory project not started. ' + reason + '. The runtime did not confirm construction.';
            render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
          }
        } catch (error) {
          root.__omegaV2IndustryNotice = 'Factory construction failed safely: ' + String(error && error.message || error || 'runtime error') + '.';
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: 'factories' }));
        }
      });
      root.addEventListener('keydown', function (event) {
        if (!event || event.key !== 'Escape' || !root.__omegaV2IndustryBuildFactoryType) return;
        root.__omegaV2IndustryBuildFactoryType = '';
        root.__omegaV2IndustryNotice = '';
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: root.__omegaV2IndustryTab || 'factories' }));
      });
      root.__omegaV2IndustryBound = true;
    }
    if (!root.__omegaV2IndustryEventsBound && typeof g.addEventListener === 'function') {
      ['OMEGA_RESOURCE_EXTRACTION_COMPLETED','OMEGA_RESOURCE_SITE_FLOW_DISPATCHED','OMEGA_RESOURCE_INVENTORY_CHANGED',
       'OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE','OMEGA_RESOURCE_PROCESSING_COMPLETED','OMEGA_RESOURCE_TECHNOLOGY_PROJECT_STARTED',
       'OMEGA_INFRASTRUCTURE_PROJECT_STARTED','OMEGA_RESOURCE_MINE_PROJECT_STARTED','OMEGA_RESOURCE_MINE_COMMISSIONED',
       'OMEGA_RESOURCE_MINE_CAPACITY_CHANGED','OMEGA_SIMULATION_TURN_COMMITTED',
       'OMEGA_FACTORY_CAPACITY_CHANGED'].forEach(function (eventName) {
        g.addEventListener(eventName, function () {
          if (!root.querySelector || !root.querySelector('.omega-v2-industry-command, .omega-v2-factory-command')) return;
          render(root, Object.assign({}, root.__omegaV2IndustryOptions || {}, { tab: root.__omegaV2IndustryTab || 'factories' }));
        });
      });
      root.__omegaV2IndustryEventsBound = true;
    }
    root.__omegaV2IndustryOptions = options;
    root.__omegaV2IndustryModel = model;
    if (active !== 'factories') root.__omegaV2IndustryNotice = '';
    root.__omegaV2IndustryTab = active;
    try {
      var visuals = g.OmegaFactoryVisualCatalog;
      if (visuals && typeof visuals.ready === 'function') visuals.ready().then(function () { if (typeof visuals.refresh === 'function') visuals.refresh(root); }).catch(function () {});
    } catch (_) {}
    return { ok: true, model: model };
  }

  g.OmegaUIV2Industry = Object.freeze({ version: '1.0.0', buildViewModel: buildViewModel, render: render });
})(typeof window !== 'undefined' ? window : globalThis);
