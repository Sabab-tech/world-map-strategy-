/* OMEGA COUNTRY STARTUP BASELINE RUNTIME v1.0.0
 * Seeds permanent starter factory assets and finite initial stocks into the existing
 * country resource/economy state. Mines are commissioned only from eligible canonical
 * site records already exposed by the shared site registry. No parallel inventory ledger.
 */
(function (g) {
  'use strict';
  const VERSION = '1.0.0';
  const DATA_URL = 'resource_country_startup_baseline_v1.json';
  const CATALOG_URL = 'resource_industrial_catalog_v1.json';
  if (g.OmegaResourceStartupBaseline && g.OmegaResourceStartupBaseline.VERSION === VERSION) return;

  let baseline = g.OmegaResourceStartupBaselineData || g.Omega && g.Omega.ResourceStartupBaselineData || null;
  let catalog = g.OmegaResourceIndustrialCatalogData || g.Omega && g.Omega.ResourceIndustrialCatalogData || null;
  let loadPromise = null, catalogPromise = null, lastError = null, initialized = false;
  const num = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const obj = value => value && typeof value === 'object' && !Array.isArray(value);
  const arr = value => Array.isArray(value) ? value : [];
  const upper = value => String(value == null ? '' : value).trim().toUpperCase();
  const token = value => String(value == null ? '' : value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const clone = (value, seen) => {
    if (value === null || typeof value !== 'object') return value;
    seen = seen || new WeakMap();
    if (seen.has(value)) return seen.get(value);
    const copy = Array.isArray(value) ? [] : {};
    seen.set(value, copy);
    Object.keys(value).forEach(key => {
      if (key === '__proto__' || key === 'constructor' || typeof value[key] === 'function' || value[key] === undefined) return;
      copy[key] = clone(value[key], seen);
    });
    return copy;
  };
  const state = () => g.Game && g.Game.state || g.gameState || g.Omega && g.Omega.Simulation && g.Omega.Simulation.world && g.Omega.Simulation.world.state || {};
  const turn = () => num((state().simulation && state().simulation.turn) ?? state().turn ?? state().simulationTurn) ?? 0;
  function canonical(value) {
    const raw = typeof value === 'object' && value ? value.iso3 || value.iso3Code || value.countryId || value.countryCode || value.code || value.id : value;
    const text = upper(raw);
    if (/^[A-Z]{3}$/.test(text)) return text;
    try {
      const identity = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || g.Omega && g.Omega.CanonicalIdentity;
      const row = identity && identity.resolveCountry && identity.resolveCountry(text);
      const source = row && (row.raw && (row.raw.raw || row.raw.datasets && row.raw.datasets['countries.json'] || row.raw) || {});
      const iso3 = upper(source.iso3 || source.iso3Code || source.countryIso3 || row && (row.iso3 || row.iso3Code || row.countryId));
      if (/^[A-Z]{3}$/.test(iso3)) return iso3;
    } catch (_) {}
    return text;
  }
  function emit(name, detail) {
    try {
      if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function')
        g.dispatchEvent(new g.CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }
  async function loadData() {
    if (baseline && obj(baseline.countries)) return baseline;
    if (loadPromise) return loadPromise;
    loadPromise = Promise.resolve().then(() => {
      if (typeof g.fetch !== 'function') throw new Error('FETCH_UNAVAILABLE');
      return g.fetch(DATA_URL, { cache: 'no-store' });
    }).then(response => {
      if (!response || !response.ok) throw new Error('STARTUP_BASELINE_FETCH_FAILED');
      return response.json();
    }).then(data => {
      if (!obj(data) || !obj(data.countries) || Number(data.coverage && data.coverage.countryCount) !== Object.keys(data.countries).length)
        throw new Error('STARTUP_BASELINE_SCHEMA_INVALID');
      if (Number(data.coverage && data.coverage.factoryProfileCount) !== 21 || Number(data.coverage && data.coverage.resourceIdentityCount) !== 41)
        throw new Error('STARTUP_BASELINE_CANONICAL_COUNTS_INVALID');
      baseline = data;
      g.OmegaResourceStartupBaselineData = data;
      g.Omega = g.Omega || {};
      g.Omega.ResourceStartupBaselineData = data;
      return data;
    }).catch(error => {
      lastError = String(error && error.message || error);
      throw error;
    }).finally(() => { loadPromise = null; });
    return loadPromise;
  }
  async function loadCatalog() {
    if (catalog && obj(catalog.factoryProfiles)) return catalog;
    if (catalogPromise) return catalogPromise;
    catalogPromise = Promise.resolve().then(() => {
      const runtime = g.Omega && g.Omega.ResourceIndustrialNetwork || g.OmegaResourceIndustrialNetwork;
      if (runtime && typeof runtime.loadCatalog === 'function') return runtime.loadCatalog().then(result => {
        const loaded = g.OmegaResourceIndustrialCatalogData || g.Omega && g.Omega.ResourceIndustrialCatalogData;
        if (loaded && obj(loaded.factoryProfiles)) { catalog = loaded; return loaded; }
        if (result && result.status === 'FAILED') throw new Error(result.reason || 'INDUSTRIAL_CATALOG_UNAVAILABLE');
      });
      if (typeof g.fetch !== 'function') throw new Error('FETCH_UNAVAILABLE');
      return g.fetch(CATALOG_URL, { cache: 'no-store' }).then(response => {
        if (!response || !response.ok) throw new Error('INDUSTRIAL_CATALOG_FETCH_FAILED');
        return response.json();
      }).then(data => { catalog = data; g.OmegaResourceIndustrialCatalogData = data; g.Omega = g.Omega || {}; g.Omega.ResourceIndustrialCatalogData = data; return data; });
    }).then(data => {
      if (data && obj(data.factoryProfiles)) catalog = data;
      if (!catalog || Object.keys(catalog.factoryProfiles || {}).length !== 21) throw new Error('CANONICAL_FACTORY_CATALOG_INVALID');
      return catalog;
    }).finally(() => { catalogPromise = null; });
    return catalogPromise;
  }
  function ensureStateBucket(root, cid) {
    root[cid] = obj(root[cid]) ? root[cid] : {};
    return root[cid];
  }
  function findKeyByToken(map, wanted) {
    if (!obj(map)) return null;
    const direct = Object.keys(map).filter(key => token(key) === token(wanted));
    return direct.length === 1 ? direct[0] : direct.length > 1 ? false : null;
  }
  function hasPositive(map, key) {
    const found = findKeyByToken(map, key);
    return found !== null && found !== false && (num(map[found]) || 0) > 0;
  }
  function productionAssetRows(cid) {
    const s = state(), econ = s.economy && s.economy[cid], resource = s.resource && s.resource[cid];
    const out = [], byId = new Set();
    [econ && econ.productionAssets, resource && resource.productionAssets,
      resource && resource.industrialNetwork && resource.industrialNetwork.productionAssets,
      resource && resource.industrialNetwork && resource.industrialNetwork.factoryAssets].forEach(rows => {
      arr(rows).forEach(asset => {
        if (!obj(asset)) return;
        const id = String(asset.id || asset.assetId || asset.factoryId || asset.projectId || '').trim();
        if (!id || byId.has(id)) return;
        byId.add(id); out.push(asset);
      });
    });
    return out;
  }
  function mineAssetRows(cid) { return arr(state().resource && state().resource[cid] && state().resource[cid].mineAssets); }
  function stockRows(cid) {
    const resource = state().resource && state().resource[cid] || {};
    const stocks = obj(resource.warehouse && resource.warehouse.availableByResource) ? resource.warehouse.availableByResource : {};
    const ids = arr(baseline && baseline.countries && baseline.countries[cid] && baseline.countries[cid].primaryResourceStockPolicy && baseline.countries[cid].primaryResourceStockPolicy.eligibleResourceIds);
    return Object.keys(stocks).filter(key => ids.includes(token(key)) && (num(stocks[key]) || 0) > 0)
      .map(key => ({ resourceId: token(key), quantity: num(stocks[key]), unit: batchUnit(resource, key) }));
  }
  function batchUnit(resource, resourceId) {
    const batch = arr(resource && resource.batches).slice().reverse().find(row => token(row.resourceId || row.materialIdentity) === token(resourceId) && (num(row.remainingQuantity != null ? row.remainingQuantity : row.quantity) || 0) > 0);
    return batch && batch.unit || resource && resource.inventoryUnits && resource.inventoryUnits[resourceId] || 'SIMULATION_RESOURCE_UNIT';
  }
  function isOperationalFactory(asset) {
    const status = upper(asset && asset.status);
    return /^(OPERATIONAL|ACTIVE|COMMISSIONED|PRODUCING|RUNNING)$/.test(status) &&
      !/DECOMMISSIONED|DESTROYED|CLOSED|INACTIVE|TECHNOLOGY_LOCKED/.test(status);
  }
  function isOperationalMine(asset) {
    const status = upper(asset && asset.status), production = upper(asset && asset.productionStatus);
    return /OPERATIONAL|ACTIVE|COMMISSIONED|PRODUCING/.test(status) &&
      !/DECOMMISSIONED|DESTROYED|STOPPED|INACTIVE|CLOSED/.test(status) &&
      (!production || /READY|ACTIVE|PRODUCING/.test(production)) &&
      (num(asset && (asset.capacityPerDay || asset.nominalDailyCapacity || asset.productionRate)) || 0) > 0;
  }
  function getCountrySummary(countryId) {
    const cid = canonical(countryId), source = baseline && baseline.countries && baseline.countries[cid];
    if (!cid) return { status: 'BLOCKED', reason: 'COUNTRY_ID_REQUIRED' };
    const s = state(), resource = s.resource && s.resource[cid] || {}, inventory = obj(resource.inventory) ? resource.inventory : {};
    const assets = productionAssetRows(cid), mines = mineAssetRows(cid), builtMineIds = new Set();
    const factories = assets.filter(asset => {
      const type = upper(asset.factoryType || asset.type || asset.facilityType);
      return !!(type && catalog && catalog.factoryProfiles && catalog.factoryProfiles[type]);
    });
    const operationalFactories = factories.filter(isOperationalFactory);
    const operatingMines = mines.filter(isOperationalMine).filter(asset => {
      const siteId = String(asset.siteId || '').trim();
      if (!siteId || builtMineIds.has(siteId)) return false;
      builtMineIds.add(siteId); return true;
    });
    const rs = resource;
    const raw = obj(rs.warehouse && rs.warehouse.availableByResource) ? rs.warehouse.availableByResource : {};
    const resources = arr(source && source.primaryResourceStockPolicy && source.primaryResourceStockPolicy.eligibleResourceIds);
    const primaryStock = Object.keys(raw).filter(key => resources.includes(token(key)) && (num(raw[key]) || 0) > 0)
      .map(key => ({ resourceId: token(key), quantity: num(raw[key]), unit: batchUnit(rs, key) }));
    const meta = obj(rs.startupBaseline) ? rs.startupBaseline : {};
    return {
      status: meta.factoryAssetsInitialized && meta.minesInitialized ? 'READY' : meta.factoryAssetsInitialized ? 'PARTIAL' : 'NOT_INITIALIZED',
      countryId: cid, countryName: source && source.countryName || s.countryNames && s.countryNames[cid] || cid,
      factoriesInitialized: meta.factoryAssetsInitialized === true,
      minesInitialized: meta.minesInitialized === true,
      primaryStocksInitialized: meta.primaryStocksInitialized === true,
      factoryCount: factories.length, operationalFactoryCount: operationalFactories.length,
      starterFactoryCount: factories.filter(asset => /^FAC-START:/.test(String(asset.id || asset.assetId || ''))).length,
      operationalMineCount: operatingMines.length,
      builtMineCount: mines.filter(asset => {
        const status = upper(asset && asset.status);
        return !!String(asset.siteId || '').trim() && !/REMOVED|CANCELLED/.test(status);
      }).length,
      availableSiteCount: meta.minesInitialized ? (num(meta.availableSiteCount) || 0) : null,
      primaryResourceTypeCount: meta.primaryStocksInitialized ? primaryStock.length : null,
      primaryResourceStocks: meta.primaryStocksInitialized ? primaryStock : [],
      openingStockSeeded: meta.primaryStocksInitialized === true, sourceAuthority: meta.authority || 'SIMULATED_STARTUP_ECONOMY_V1',
      simulationOnly: true, permanentFactories: true, finiteConsumableStocks: true
    };
  }
  function makeFactoryInputLots(asset, source, cid) {
    asset.inputInventory = obj(asset.inputInventory) ? asset.inputInventory : {};
    asset.inputBatchLots = arr(asset.inputBatchLots);
    const stock = obj(source.initialInputStock) ? source.initialInputStock : {};
    const coeffs = obj(source.inputCoefficients) ? source.inputCoefficients : {};
    const outputs = obj(source.outputProfile) ? source.outputProfile : {};
    Object.keys(stock).forEach(rid => {
      const quantity = Math.max(0, num(stock[rid]) || 0);
      if (!quantity || hasOwnToken(asset.inputInventory, rid)) return;
      const batchId = 'STARTUP-INPUT:' + String(asset.id || source.assetId) + ':' + token(rid);
      if (asset.inputBatchLots.some(row => String(row && row.batchId || '') === batchId)) return;
      asset.inputInventory[rid] = quantity;
      asset.inputBatchLots.push({
        batchId, resourceId: token(rid), materialIdentity: token(rid), quantity, remainingQuantity: quantity,
        unit: source.inputUnit || 'SIMULATION_RESOURCE_UNIT', stage: 'FACTORY_INPUT', countryId: cid,
        sourceCountryId: cid, originCountryId: cid, destinationCountryId: cid,
        ownerCountryCode: cid, factoryId: String(asset.id || source.assetId),
        locationNodeKey: String(asset.locationNodeKey || 'INDUSTRIAL_ZONE:' + cid),
        status: 'AVAILABLE_TO_FACTORY', createdTurn: turn(), lastMovementTurn: turn(),
        provenance: { source: 'OMEGA_COUNTRY_STARTUP_BASELINE_V1', authority: 'SIMULATED_STARTING_FACTORY_INPUT_STOCK_V1',
          sourceFactoryType: source.factoryType, recipeId: source.recipeId || null, daysOfCover: 3,
          simulationOnly: true, consumedByProductionOverTime: true }
      });
    });
    asset.inputCoefficients = obj(asset.inputCoefficients) ? asset.inputCoefficients : clone(coeffs);
    asset.outputProfile = obj(asset.outputProfile) ? asset.outputProfile : clone(outputs);
  }
  function hasOwnToken(map, key) {
    if (!obj(map)) return false;
    return Object.keys(map).some(name => token(name) === token(key));
  }
  function seedFactoryOperationalSupport(countryId, source, seededAssets) {
    const cid = canonical(countryId), s = state();
    if (!cid || !Array.isArray(seededAssets) || !seededAssets.length) return { utility: 'NOT_REQUIRED', labor: 'NOT_REQUIRED' };
    s.economy = obj(s.economy) ? s.economy : {};
    const econ = ensureStateBucket(s.economy, cid);
    const input = source && source.modelInputs || {}, policy = source && source.laborStartupPolicy || {};
    const population = num(input.population);
    const countKeys = ['unemploymentCount','unemployedCount','unemployedPeople','unemployed_people','unemployment_count','joblessCount'];
    const hasDirectCount = countKeys.some(key => num(econ[key]) !== null && num(econ[key]) >= 0);
    const rateKeys = ['unemployment_rate','unemploymentRatePct','unemploymentRate','unemployment_rate_pct'];
    let rate = rateKeys.map(key => num(econ[key])).find(value => value !== undefined && value !== null && value >= 0 && value <= 100);
    let laborAuthority = 'EXISTING_COUNTRY_LABOR_INPUT_PRESERVED';
    if (rate === undefined) rate = null;
    if (rate === null && num(input.unemploymentRatePct) !== null) {
      rate = num(input.unemploymentRatePct);
      if (num(econ.unemployment_rate) === null) econ.unemployment_rate = rate;
      laborAuthority = 'ECONOMY_JSON_SCENARIO_INPUT';
    }
    if (rate === null) {
      rate = Math.max(0, Math.min(100, num(policy.unemploymentFallbackPct) ?? 6));
      if (num(econ.unemployment_rate) === null) econ.unemployment_rate = rate;
      laborAuthority = 'SIMULATED_STARTUP_LABOR_RATE_FALLBACK';
    }
    if (population !== null && population > 0 &&
        num(econ.population_2015) === null && num(econ.population) === null && num(econ.populationTotal) === null)
      econ.population_2015 = population;
    const supportedJobs = seededAssets.reduce((sum, asset) => {
      const profile = catalog && catalog.factoryProfiles && catalog.factoryProfiles[upper(asset.factoryType)] || {};
      return sum + Math.max(0, Math.floor(num(profile.employment && profile.employment.jobsPerFactory) ??
        num(asset.employmentProfile && asset.employmentProfile.jobsPerFactory) ?? 0));
    }, 0);
    if (!hasDirectCount) {
      if (population !== null && population > 0) {
        const participation = Math.max(1, Math.min(100, num(policy.populationLabourForceParticipationPct) ?? 60));
        econ.unemploymentCount = Math.round(population * participation / 100 * rate / 100);
        laborAuthority = laborAuthority === 'ECONOMY_JSON_SCENARIO_INPUT'
          ? 'ECONOMY_JSON_SCENARIO_UNEMPLOYMENT_X_SIMULATED_LABOR_FORCE' : 'SIMULATED_STARTUP_LABOR_BASELINE_V1';
      } else {
        econ.unemploymentCount = Math.max(1, supportedJobs);
        laborAuthority = 'SIMULATED_STARTUP_POOL_SIZED_TO_STARTER_FACTORY_JOBS';
      }
    }
    econ.startupLaborBaseline = {
      authority: laborAuthority, simulationOnly: true, populationInput: population,
      unemploymentRatePct: rate, supportedStarterJobs: supportedJobs, finiteInitialUnemployedPool: true
    };
    s.transport = obj(s.transport) ? s.transport : {};
    const t = ensureStateBucket(s.transport, cid);
    t.infrastructure = obj(t.infrastructure) ? t.infrastructure : {};
    const infra = t.infrastructure, existing = obj(infra.utilitySupply) ? infra.utilitySupply : {};
    const requiredPower = seededAssets.reduce((sum, asset) => {
      const profile = catalog && catalog.factoryProfiles && catalog.factoryProfiles[upper(asset.factoryType)] || {};
      return sum + Math.max(0, num(profile.utilities && profile.utilities.electricityMWhPerDay) || 0);
    }, 0);
    const requiredWater = seededAssets.reduce((sum, asset) => {
      const profile = catalog && catalog.factoryProfiles && catalog.factoryProfiles[upper(asset.factoryType)] || {};
      return sum + Math.max(0, num(profile.utilities && profile.utilities.waterM3PerDay) || 0);
    }, 0);
    const needPower = num(existing.electricityMWhPerDay) === null;
    const needWater = num(existing.waterM3PerDay) === null;
    if (needPower || needWater) {
      const assetId = 'UTIL-START:' + cid + ':V1';
      const utilityAsset = { assetId, countryId: cid, status: 'OPERATIONAL',
        electricityMWhPerDay: needPower ? Number((requiredPower * 1.25 + 1).toFixed(3)) : num(existing.electricityMWhPerDay),
        waterM3PerDay: needWater ? Number((requiredWater * 1.25 + 1).toFixed(3)) : num(existing.waterM3PerDay),
        authority: 'SIMULATED_STARTUP_UTILITY_CAPACITY_V1', simulationOnly: true,
        provisionedForStarterFactoryCount: seededAssets.length };
      const assets = arr(existing.assets).filter(row => String(row && row.assetId || '') !== assetId);
      assets.push(utilityAsset);
      infra.utilitySupply = Object.assign({}, existing, {
        electricityMWhPerDay: needPower ? utilityAsset.electricityMWhPerDay : existing.electricityMWhPerDay,
        waterM3PerDay: needWater ? utilityAsset.waterM3PerDay : existing.waterM3PerDay,
        status: 'OPERATIONAL', assets,
        authority: needPower && needWater && !existing.authority ? 'SIMULATED_STARTUP_UTILITY_CAPACITY_V1' : 'MIXED_RECORDED_AND_SIMULATED_STARTUP_UTILITY_V1',
        simulationOnly: true
      });
      return { utility: 'SEEDED_MISSING_SUPPLY', labor: laborAuthority };
    }
    return { utility: 'EXISTING_SUPPLY_PRESERVED', labor: laborAuthority };
  }

  function seedFactories() {
    if (!baseline || !catalog) return { status: 'BLOCKED', reason: 'BASELINE_OR_CATALOG_UNAVAILABLE' };
    const s = state(); s.economy = obj(s.economy) ? s.economy : {}; s.resource = obj(s.resource) ? s.resource : {};
    let created = 0, preserved = 0, countryCount = 0;
    for (const cid of arr(baseline.countryOrder)) {
      const source = baseline.countries[cid]; if (!source) continue;
      let countryCreated = 0;
      const existingResource = s.resource[cid];
      const existingEconomy = s.economy[cid];
      const existingAssets = productionAssetRows(cid);
      const meta = existingResource && obj(existingResource.startupBaseline) ? existingResource.startupBaseline : {};
      const isLegacyState = !meta.factoryAssetsInitialized && (turn() > 1 ||
        existingAssets.some(asset => !/^FAC-START:/.test(String(asset.id || asset.assetId || ''))) ||
        arr(existingResource && existingResource.batches).length > 0 || arr(existingResource && existingResource.mineAssets).length > 0);
      if (meta.factoryAssetsInitialized || isLegacyState) {
        const rs = ensureStateBucket(s.resource, cid);
        rs.startupBaseline = Object.assign({}, meta, { version: VERSION, factoryAssetsInitialized: true,
          minesInitialized: meta.minesInitialized === true, primaryStocksInitialized: meta.primaryStocksInitialized === true,
          skippedLegacyFactorySeed: isLegacyState || meta.skippedLegacyFactorySeed === true,
          authority: 'OMEGA_COUNTRY_STARTUP_BASELINE_V1' });
        preserved += existingAssets.length; countryCount++; continue;
      }
      const economy = ensureStateBucket(s.economy, cid);
      if (!Array.isArray(economy.productionAssets)) economy.productionAssets = [];
      const existingIds = new Set(economy.productionAssets.map(asset => String(asset && (asset.id || asset.assetId || asset.factoryId) || '')).filter(Boolean));
      for (const descriptor of arr(source.factoryAssets)) {
        const id = String(descriptor.assetId || '').trim();
        if (!id || existingIds.has(id)) { if (id && existingIds.has(id)) preserved++; continue; }
        const type = upper(descriptor.factoryType);
        const profile = catalog.factoryProfiles && catalog.factoryProfiles[type];
        if (!profile) continue;
        const status = upper(descriptor.status) || 'OPERATIONAL';
        const asset = {
          id, assetId: id, countryId: cid, name: String(profile.name || type) + (descriptor.resourceId ? ' · ' + String(descriptor.resourceId).replace(/[_-]+/g, ' ') : ''),
          resourceId: descriptor.resourceId || null, stage: 'PROCESSING', factoryType: type, recipeId: descriptor.recipeId || null,
          recipeMode: Object.keys(descriptor.inputCoefficients || {}).length > 1 ? 'MULTI_INPUT' : 'SINGLE_INPUT',
          recipeAuthority: descriptor.recipeAuthority || 'SIMULATED_STARTUP_BASELINE_RECIPE',
          capacity: Math.max(1, num(descriptor.capacityPerDay) || num(profile.defaultCapacityPerDay) || 500),
          capacityPerDay: Math.max(1, num(descriptor.capacityPerDay) || num(profile.defaultCapacityPerDay) || 500),
          capacityUnit: profile.inputUnit || 'SIMULATION_RESOURCE_UNIT',
          locationNodeKey: descriptor.locationNodeKey || 'INDUSTRIAL_ZONE:' + cid,
          status, inputCoefficients: clone(descriptor.inputCoefficients || {}), outputProfile: clone(descriptor.outputProfile || {}),
          inputs: clone(descriptor.inputCoefficients || {}), outputs: clone(descriptor.outputProfile || {}),
          cycleDays: Math.max(1, num(descriptor.cycleDays) || 1), inputUnit: profile.inputUnit || 'SIMULATION_RESOURCE_UNIT',
          outputUnit: profile.outputUnit || 'SIMULATION_RESOURCE_UNIT',
          inputInventory: {}, inputBatchLots: [], productionHealth: {
            status: 'STOPPED', productivityPct: 0, reason: 'STARTING_INPUT_STOCK_AVAILABLE',
            missingInputs: [], updatedTurn: turn(), authority: 'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1'
          },
          workforce: clone(profile.workforce || {}), employmentProfile: clone(profile.employment || null),
          utilityRequirements: clone(profile.utilities || {}), requiredInfrastructure: clone(profile.requiredInfrastructure || []),
          companyId: 'SIM-STARTUP-COMPANY:' + cid, transportAccess: ['truck', 'rail', 'ship'],
          commissioningLevel: 1, commissionedTurn: turn(), permanentAsset: true,
          lifecycle: 'PERMANENT', sourceProfileAuthority: descriptor.profileAuthority || 'SIMULATED_GAMEPLAY_PROFILE',
          authority: 'SIMULATED_STARTUP_BASELINE_FACTORY_ASSET_V1', simulationOnly: true,
          openingInputStockAuthority: 'SIMULATED_STARTING_FACTORY_INPUT_STOCK_V1',
          starterAsset: true
        };
        makeFactoryInputLots(asset, descriptor, cid);
        economy.productionAssets.push(asset); existingIds.add(id); created++; countryCreated++;
      }
      const seededAssets = economy.productionAssets.filter(asset => String(asset && (asset.id || asset.assetId || asset.factoryId) || '').startsWith('FAC-START:' + cid + ':'));
      const support = seedFactoryOperationalSupport(cid, source, seededAssets);
      const rs = ensureStateBucket(s.resource, cid);
      rs.startupBaseline = Object.assign({}, meta, { version: VERSION, factoryAssetsInitialized: true,
        minesInitialized: false, primaryStocksInitialized: false, skippedLegacyFactorySeed: false,
        seededFactoryCount: arr(source.factoryAssets).length, createdFactoryCount: countryCreated,
        operationalSupport: support, authority: 'OMEGA_COUNTRY_STARTUP_BASELINE_V1', initializedTurn: turn() });
      countryCount++;
    }
    emit('OMEGA_COUNTRY_STARTUP_FACTORY_ASSETS_INITIALIZED', { version: VERSION, countryCount, created, preserved, turn: turn() });
    return { status: 'READY', countryCount, createdFactoryCount: created, preservedFactoryCount: preserved };
  }
  function getScenarioRecord(siteId, resourceId) {
    const data = g.OmegaResourceScenarioEngineeringData || g.Omega && g.Omega.ResourceScenarioEngineeringData;
    return arr(data && data.records).find(row => String(row.siteId || '') === String(siteId) &&
      (!resourceId || token(row.resourceId) === token(resourceId))) || null;
  }
  function positiveFrom(rows) {
    for (const value of rows) { const n = num(value); if (n !== null && n > 0) return n; }
    return null;
  }
  function normalizeSiteQuantity(resourceId, quantity, unit) {
    const value = num(quantity), sourceUnit = String(unit || '').trim();
    if (value === null || value <= 0 || !sourceUnit) return null;
    const normalization = g.Omega && g.Omega.ResourceQuantityNormalization || g.OmegaResourceQuantityNormalization;
    if (!normalization || typeof normalization.normalizeQuantity !== 'function') return null;
    const result = normalization.normalizeQuantity(resourceId, value, sourceUnit, { simulationOnly: true });
    return num(result && result.quantity) > 0 ? { quantity: num(result.quantity), unit: String(result.unit || normalization.canonicalUnit(resourceId)), method: result.method || 'NORMALIZED_SIMULATION_QUANTITY' } : null;
  }
  function dailyCapacity(site, scenario) {
    const quantitative = site && site.quantitative || {}, simulation = site && site.simulation || {}, production = quantitative.production || {},
      throughput = quantitative.throughput || {}, capacity = quantitative.capacity || {}, model = site && site.productionModel || {},
      rid = resourceIdOf(site);
    const candidates = [
      [simulation.nominalDailyCapacity, simulation.productionRateUnit || simulation.nominalDailyCapacityUnit || scenario && scenario.unit],
      [simulation.productionRate, simulation.productionRateUnit || simulation.production && simulation.production.rateUnit || scenario && scenario.unit],
      [simulation.dailyCapacity, simulation.productionRateUnit || scenario && scenario.unit],
      [scenario && scenario.nominalCapacity, scenario && (scenario.rateUnit || scenario.unit)],
      [scenario && scenario.dailyProduction, scenario && (scenario.rateUnit || scenario.unit)],
      [model.nominalCapacity, model.rateUnit || model.unit || scenario && scenario.unit],
      [model.productionRate, model.rateUnit || model.unit || scenario && scenario.unit],
      [throughput.value, throughput.unit],
      [production.rate && /PER_DAY|\/DAY|DAILY/i.test(String(production.unit || '')) ? production.rate : null, production.unit],
      [capacity.nominal && /PER_DAY|\/DAY|DAILY/i.test(String(capacity.unit || '')) ? capacity.nominal : null, capacity.rateUnit || capacity.unit]
    ];
    for (const [value, unit] of candidates) {
      if (!(num(value) > 0) || !unit) continue;
      const normalized = normalizeSiteQuantity(rid, value, unit);
      if (normalized) return normalized.quantity;
    }
    return null;
  }
  function reserveQuantity(site, scenario) {
    const rid = resourceIdOf(site);
    const candidates = [
      [site && site.simulation && site.simulation.reserve && site.simulation.reserve.quantity, site && site.simulation && site.simulation.reserve && site.simulation.reserve.unit],
      [site && site.reserve && site.reserve.quantity, site && site.reserve && site.reserve.unit],
      [site && site.quantitative && site.quantitative.reserve && site.quantitative.reserve.quantity, site && site.quantitative && site.quantitative.reserve && site.quantitative.reserve.unit],
      [site && site.sourceSiteRecord && site.sourceSiteRecord.simulation && site.sourceSiteRecord.simulation.reserve && site.sourceSiteRecord.simulation.reserve.quantity,
        site && site.sourceSiteRecord && site.sourceSiteRecord.simulation && site.sourceSiteRecord.simulation.reserve && site.sourceSiteRecord.simulation.reserve.unit],
      [scenario && scenario.reserveQuantity, scenario && (scenario.reserveUnit || scenario.unit)]
    ];
    for (const [quantity, unit] of candidates) {
      if (!(num(quantity) > 0) || !unit) continue;
      const normalized = normalizeSiteQuantity(rid, quantity, unit);
      if (normalized) return normalized.quantity;
    }
    return null;
  }
  function resourceIdOf(site) {
    const source = site && site.sourceSiteRecord || {}, identity = site && site.identity || {}, real = site && site.real || {};
    return token(real.resourceId || source.resourceId || source.resourceTypeId || source.resId ||
      identity.resourceTypeId || identity.resourceId || site.resourceId || site.resourceTypeId);
  }
  function siteRows() {
    const binding = g.Omega && g.Omega.IndividualResourceSiteBinding || g.OmegaIndividualResourceSiteBinding;
    const sites = arr(binding && binding.sites);
    const seen = new Map();
    sites.forEach(site => {
      const id = String(site && site.siteId || site && site.siteReferenceKey || '').trim();
      if (id && !seen.has(id)) seen.set(id, site);
    });
    return Array.from(seen.values());
  }
  function operationalMineDescriptor(site, knownResources) {
    const cid = canonical(site && (site.countryId || site.identity && site.identity.countryIso3));
    const siteId = String(site && (site.siteId || site.siteReferenceKey) || '').trim();
    const rid = resourceIdOf(site), scenario = getScenarioRecord(siteId, rid);
    if (!cid || !siteId || !knownResources.has(rid)) return null;
    if (site.runtime && site.runtime.aliasOfSiteId || site.map && site.map.markerEligible === false) return null;
    const operation = site.operation || {}, source = site.sourceSiteRecord || {};
    if (operation.commercialExtraction === false || source.commercialExtraction === false ||
        String(operation.status || source.status || '').toUpperCase() === 'NOT_APPLICABLE' ||
        operation.gameplayConstructionAllowed === false || source.gameplayConstructionAllowed === false) return null;
    const reserve = reserveQuantity(site, scenario), capacity = dailyCapacity(site, scenario);
    if (!(reserve > 0) || !(capacity > 0)) return null;
    const simulation = site.simulation || {}, quantitative = site.quantitative || {};
    const normalization = g.Omega && g.Omega.ResourceQuantityNormalization || g.OmegaResourceQuantityNormalization;
    const stockUnit = normalization && typeof normalization.canonicalUnit === 'function' ? normalization.canonicalUnit(rid) :
      String(simulation.productionRateUnit || scenario && scenario.unit || quantitative.production && quantitative.production.unit || 'SIMULATION_RESOURCE_UNIT').replace(/_PER_DAY$/i, '');
    const rateUnit = stockUnit + '_PER_DAY';
    const reserveAuthority = simulation.reserveAuthority || simulation.reserve && simulation.reserve.authority ||
      site.reserve && site.reserve.authority || quantitative.reserve && quantitative.reserve.authority ||
      source.reserve && source.reserve.authority || 'SIMULATED_GAMEPLAY_RESERVE';
    return { countryId: cid, siteId, siteName: String(site.siteName || site.name || siteId), resourceId: rid,
      reserveQuantity: reserve, dailyCapacity: capacity, unit: stockUnit, rateUnit,
      sourceSiteStatus: operation.realWorldStatus || operation.status || source.realWorldStatus || source.status || 'UNOBSERVED',
      siteSnapshot: { siteId, countryId: cid, siteName: String(site.siteName || site.name || siteId),
        identity: clone(site.identity || {}), location: clone(site.location || {}), resourceId: rid }
    };
  }
  function ensureWarehouse(rs, cid) {
    rs.warehouse = obj(rs.warehouse) ? rs.warehouse : {
      warehouseId: 'WH-' + cid + '-RAW', countryId: cid, type: 'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
      locationNodeKey: 'WAREHOUSE:' + cid + ':RAW', status: 'OPERATIONAL',
      availableByResource: {}, reservedByResource: {}, storedBatchIds: [], receipts: []
    };
    const w = rs.warehouse;
    w.availableByResource = obj(w.availableByResource) ? w.availableByResource : {};
    w.reservedByResource = obj(w.reservedByResource) ? w.reservedByResource : {};
    w.storedBatchIds = arr(w.storedBatchIds); w.receipts = arr(w.receipts);
    return w;
  }
  function hasResourceHistory(rs, rid) {
    return arr(rs.batches).some(batch => token(batch && (batch.resourceId || batch.materialIdentity)) === token(rid)) ||
      Object.keys(obj(rs.inventoryLots) ? rs.inventoryLots : {}).some(key => {
        const lot = rs.inventoryLots[key]; return token(lot && (lot.resourceId || lot.materialIdentity)) === token(rid);
      });
  }
  function seedOpeningStocks(siteDescriptors) {
    if (!baseline) return { status: 'BLOCKED', reason: 'STARTUP_BASELINE_UNAVAILABLE' };
    const s = state();
    const rawIds = new Set();
    Object.values(baseline.countries || {}).forEach(row =>
      arr(row && row.primaryResourceStockPolicy && row.primaryResourceStockPolicy.eligibleResourceIds).forEach(rid => rawIds.add(token(rid))));
    const knownResources = rawIds;
    const grouped = Object.create(null);
    siteDescriptors.forEach(row => {
      const key = row.countryId + '|' + row.resourceId;
      if (!grouped[key]) grouped[key] = { countryId: row.countryId, resourceId: row.resourceId, dailyCapacity: 0, unit: row.unit, siteIds: [] };
      const group = grouped[key]; group.dailyCapacity += row.dailyCapacity; group.siteIds.push(row.siteId);
      if (!group.unit || group.unit === 'SIMULATION_RESOURCE_UNIT') group.unit = row.unit;
    });
    const byCountry = Object.create(null);
    Object.values(grouped).forEach(group => {
      if (!knownResources.has(group.resourceId) || !rawIds.has(group.resourceId)) return;
      if (!byCountry[group.countryId]) byCountry[group.countryId] = [];
      byCountry[group.countryId].push(group);
    });
    let seededCountries = 0, seededTypes = 0, preservedTypes = 0, skippedLateCountries = 0;
    for (const cid of arr(baseline.countryOrder)) {
      const source = baseline.countries[cid]; if (!source) continue;
      const rs = ensureStateBucket(s.resource, cid), meta = obj(rs.startupBaseline) ? rs.startupBaseline : {};
      if (meta.primaryStocksInitialized) continue;
      const startupScenarioInitialized = meta.factoryAssetsInitialized === true && meta.skippedLegacyFactorySeed === false;
      const hasCurrentActivity = !startupScenarioInitialized &&
        (turn() > 1 || arr(rs.batches).length > 0 || arr(rs.mineAssets).length > 0);
      if (hasCurrentActivity) {
        const existingRaw = obj(rs.warehouse && rs.warehouse.availableByResource) ? rs.warehouse.availableByResource : {};
        const existingRows = Object.keys(existingRaw).filter(key => rawIds.has(token(key)) && (num(existingRaw[key]) || 0) > 0)
          .map(key => ({ resourceId: token(key), quantity: num(existingRaw[key]), unit: batchUnit(rs, key), openingAuthority: 'EXISTING_SAVE_STOCK_NOT_RESEEDED' }));
        rs.startupBaseline = Object.assign({}, meta, { version: VERSION, primaryStocksInitialized: true,
          openingStocksSkippedForExistingGame: true, openingPrimaryResourceStocks: existingRows,
          openingStockTypesCreated: 0, authority: 'OMEGA_COUNTRY_STARTUP_BASELINE_V1' });
        skippedLateCountries++; continue;
      }
      const inv = obj(rs.inventory) ? rs.inventory : (rs.inventory = {});
      const warehouse = ensureWarehouse(rs, cid);
      let seededAny = false;
      for (const group of byCountry[cid] || []) {
        if (!knownResources.has(group.resourceId)) continue;
        const invKey = findKeyByToken(inv, group.resourceId), whKey = findKeyByToken(warehouse.availableByResource, group.resourceId);
        if (invKey === false || whKey === false) { preservedTypes++; continue; }
        if ((invKey !== null && invKey !== false && (num(inv[invKey]) || 0) > 0) ||
            (whKey !== null && whKey !== false && (num(warehouse.availableByResource[whKey]) || 0) > 0) ||
            hasResourceHistory(rs, group.resourceId)) { preservedTypes++; continue; }
        const quantity = Math.max(0, group.dailyCapacity * Math.max(1, Number(source.primaryResourceStockPolicy.daysOfSiteOutput) || 3));
        if (!(quantity > 0)) continue;
        const batchId = 'STARTUP-STOCK:' + cid + ':' + group.resourceId + ':V1';
        if (arr(rs.batches).some(row => String(row && row.batchId || '') === batchId)) { preservedTypes++; continue; }
        const unit = group.unit || 'SIMULATION_RESOURCE_UNIT', newBatch = {
          batchId, resourceId: group.resourceId, materialIdentity: group.resourceId,
          quantity, remainingQuantity: quantity, unit, stage: 'RAW', countryId: cid,
          sourceCountryId: cid, originCountryId: cid, destinationCountryId: cid, ownerCountryCode: cid,
          warehouseId: warehouse.warehouseId, locationNodeKey: warehouse.locationNodeKey,
          status: 'AVAILABLE', createdTurn: turn(), lastMovementTurn: turn(),
          sourceSiteIds: group.siteIds.slice(), provenance: { source: 'OMEGA_COUNTRY_STARTUP_BASELINE_V1',
            authority: 'SIMULATED_STARTING_RAW_STOCK_V1', reserveIsNotInventory: true,
            quantityBasis: 'SUM_OF_ELIGIBLE_SITE_DAILY_CAPACITY_X_OPENING_STOCK_DAYS',
            siteIds: group.siteIds.slice(), daysOfSiteOutput: Number(source.primaryResourceStockPolicy.daysOfSiteOutput) || 3,
            simulationOnly: true, finiteAndConsumable: true }
        };
        inv[invKey !== null && invKey !== false ? invKey : group.resourceId] = quantity;
        warehouse.availableByResource[whKey !== null && whKey !== false ? whKey : group.resourceId] = quantity;
        rs.batches = arr(rs.batches); rs.batches.push(newBatch);
        rs.inventoryLots = obj(rs.inventoryLots) ? rs.inventoryLots : {};
        rs.inventoryLots[batchId] = clone(newBatch);
        if (!warehouse.storedBatchIds.includes(batchId)) warehouse.storedBatchIds.push(batchId);
        warehouse.receipts.push({ receiptId: 'WH-REC-' + batchId, warehouseId: warehouse.warehouseId, countryId: cid,
          batchId, resourceId: group.resourceId, quantity, unit, simulationTurn: turn(),
          status: 'RECEIVED', authority: 'SIMULATED_STARTING_RAW_STOCK_V1' });
        seededTypes++; seededAny = true;
      }
      const openingRows = arr(rs.batches).filter(row => String(row && row.batchId || '').indexOf('STARTUP-STOCK:' + cid + ':') === 0)
        .map(row => ({ resourceId: token(row.resourceId || row.materialIdentity), quantity: num(row.quantity) || 0,
          remainingQuantity: num(row.remainingQuantity != null ? row.remainingQuantity : row.quantity) || 0,
          unit: row.unit || 'SIMULATION_RESOURCE_UNIT', siteIds: arr(row.sourceSiteIds).slice(),
          authority: row.provenance && row.provenance.authority || 'SIMULATED_STARTING_RAW_STOCK_V1' }));
      rs.startupBaseline = Object.assign({}, meta, { version: VERSION, primaryStocksInitialized: true,
        openingStocksSkippedForExistingGame: false, openingPrimaryResourceStocks: openingRows,
        openingStockTypesCreated: openingRows.length,
        authority: 'OMEGA_COUNTRY_STARTUP_BASELINE_V1' });
      if (seededAny) seededCountries++;
    }
    return { status: 'READY', seededCountries, seededResourceTypes: seededTypes,
      preservedResourceTypes: preservedTypes, skippedExistingGameCountries: skippedLateCountries };
  }
  function seedMinesAndStocks() {
    if (!baseline || !catalog) return { status: 'BLOCKED', reason: 'BASELINE_OR_CATALOG_UNAVAILABLE' };
    const registryRows = siteRows(), resources = new Set(Object.keys(catalog.resourceRules || {}).map(token));
    const descriptors = [];
    for (const site of registryRows) {
      const descriptor = operationalMineDescriptor(site, resources);
      if (descriptor) descriptors.push(descriptor);
    }
    const s = state(); s.resource = obj(s.resource) ? s.resource : {};
    const existingByCountry = Object.create(null);
    for (const row of descriptors) {
      if (!existingByCountry[row.countryId]) existingByCountry[row.countryId] = new Map();
      existingByCountry[row.countryId].set(row.siteId, row);
    }
    let seededMines = 0, preservedMines = 0, eligibleSites = 0, initializedCountries = 0;
    for (const cid of arr(baseline.countryOrder)) {
      const source = baseline.countries[cid]; if (!source) continue;
      const rs = ensureStateBucket(s.resource, cid), meta = obj(rs.startupBaseline) ? rs.startupBaseline : {};
      if (meta.minesInitialized) continue;
      const existing = arr(rs.mineAssets);
      const bySite = new Set(existing.map(asset => String(asset && asset.siteId || '')).filter(Boolean));
      const candidates = Array.from((existingByCountry[cid] || new Map()).values());
      eligibleSites += candidates.length;
      rs.mineAssets = existing;
      if (meta.skippedLegacyFactorySeed === true) {
        rs.startupBaseline = Object.assign({}, meta, { version: VERSION, minesInitialized: true,
          primaryStocksInitialized: true, availableSiteCount: candidates.length,
          openingStocksSkippedForExistingGame: true, skippedLegacyMineSeed: true,
          authority: 'OMEGA_COUNTRY_STARTUP_BASELINE_V1' });
        initializedCountries++;
        continue;
      }
      candidates.forEach(row => {
        if (bySite.has(row.siteId)) { preservedMines++; return; }
        const asset = {
          mineId: 'MINE-START:' + cid + ':' + row.siteId, assetId: 'MINE-START:' + cid + ':' + row.siteId,
          siteId: row.siteId, countryId: cid, siteName: row.siteName, resourceId: row.resourceId,
          status: 'OPERATIONAL', productionStatus: 'READY_FOR_EXTRACTION', capacityPerDay: row.dailyCapacity,
          nominalDailyCapacity: row.dailyCapacity, productionRate: row.dailyCapacity, productionRateUnit: row.rateUnit,
          outputUnit: row.unit, reserveAuthority: row.reserveAuthority, capacityAuthority: row.capacityAuthority,
          sourceSiteStatus: row.sourceSiteStatus, siteSnapshot: clone(row.siteSnapshot),
          workersRequired: null, workersCommitted: null, staffingStatus: 'SIMULATED_STARTING_MINE_STAFFED',
          constructionCostUsd: null, commissioningLevel: 1, capacityMultiplier: 1,
          commissionedTurn: turn(), permanentAsset: true, lifecycle: 'PERMANENT',
          authority: 'SIMULATED_STARTING_MINE_ASSET_V1', simulationOnly: true,
          sourceRecordIsNotPlayerCommissioningProof: true
        };
        rs.mineAssets.push(asset); bySite.add(row.siteId); seededMines++;
      });
      rs.startupBaseline = Object.assign({}, meta, { version: VERSION, factoryAssetsInitialized: true,
        minesInitialized: true, availableSiteCount: candidates.length, operationalMineCount: rs.mineAssets.filter(isOperationalMine).length,
        permanentMineAssetsSeeded: (num(meta.permanentMineAssetsSeeded) || 0) + candidates.filter(row => !existing.some(a => String(a && a.siteId || '') === row.siteId)).length,
        authority: 'OMEGA_COUNTRY_STARTUP_BASELINE_V1', mineInitializedTurn: turn() });
      initializedCountries++;
    }
    const stockResult = seedOpeningStocks(descriptors);
    return { status: 'READY', countryCount: initializedCountries, eligibleSiteCount: eligibleSites,
      seededMineCount: seededMines, preservedMineCount: preservedMines, stock: stockResult };
  }
  async function initialize(reason) {
    if (initialized) return diagnostics();
    try {
      await loadData();
      await loadCatalog();
      const factoryResult = seedFactories();
      const binding = g.Omega && g.Omega.IndividualResourceSiteBinding || g.OmegaIndividualResourceSiteBinding;
      const sitesReady = binding && Array.isArray(binding.sites) && binding.sites.length > 0;
      const mineResult = sitesReady ? seedMinesAndStocks() : { status: 'WAITING_FOR_SITE_REGISTRY', reason: 'SITE_REGISTRY_NOT_READY' };
      initialized = true;
      lastError = null;
      const result = { status: 'READY', version: VERSION, reason: reason || 'INITIALIZE', factories: factoryResult, mines: mineResult };
      emit('OMEGA_COUNTRY_STARTUP_BASELINE_READY', result);
      return result;
    } catch (error) {
      lastError = String(error && error.message || error);
      emit('OMEGA_COUNTRY_STARTUP_BASELINE_FAILED', { version: VERSION, reason: lastError });
      return { status: 'FAILED', version: VERSION, reason: lastError };
    }
  }
  function onSiteRegistryReady() {
    if (!baseline || !catalog) { initialize('SITE_REGISTRY_READY').then(() => {}); return; }
    try {
      const result = seedMinesAndStocks();
      emit('OMEGA_COUNTRY_STARTUP_BASELINE_READY', { status: 'READY', version: VERSION, reason: 'SITE_REGISTRY_READY', mines: result });
    } catch (error) { lastError = String(error && error.message || error); }
  }
  function diagnostics() {
    const s = state(), countryIds = arr(baseline && baseline.countryOrder);
    let factories = 0, mines = 0, stockTypes = 0, factoryReady = 0, mineReady = 0, fullyInitialized = 0;
    countryIds.forEach(cid => {
      const summary = getCountrySummary(cid);
      factories += summary.factoryCount || 0; factoryReady += summary.operationalFactoryCount || 0;
      mines += summary.builtMineCount || 0; mineReady += summary.operationalMineCount || 0;
      stockTypes += summary.primaryResourceTypeCount || 0;
      if (summary.status === 'READY') fullyInitialized++;
    });
    return { version: VERSION, initialized, dataLoaded: !!baseline, catalogLoaded: !!catalog, countryCount: countryIds.length,
      factoryAssets: factories, operationalFactories: factoryReady, builtMines: mines, operationalMines: mineReady,
      primaryStockTypes: stockTypes, fullyInitializedCountries: fullyInitialized, lastError, turn: turn() };
  }
  const api = Object.freeze({ VERSION, initialize, ensureRuntime: initialize, getCountrySummary, diagnostics,
    getBaselineCountry: countryId => baseline && baseline.countries && baseline.countries[canonical(countryId)] || null,
    refreshCountry: countryId => {
      const cid = canonical(countryId), source = baseline && baseline.countries && baseline.countries[cid];
      if (!source) return { status: 'NOT_FOUND', countryId: cid };
      const result = seedFactories();
      const mines = seedMinesAndStocks();
      return { status: 'READY', countryId: cid, factories: result, mines };
    } });
  g.Omega = g.Omega || {};
  g.Omega.ResourceStartupBaseline = api;
  g.OmegaResourceStartupBaseline = api;
  g.addEventListener && g.addEventListener('OMEGA_RESOURCE_SITE_BINDING_READY', onSiteRegistryReady);
  g.addEventListener && g.addEventListener('OMEGA_READY', () => { initialize('OMEGA_READY').then(() => {}); });
  g.addEventListener && g.addEventListener('OMEGA_GAME_SESSION_STARTED', () => { initialize('GAME_SESSION_STARTED').then(() => {}); });
  g.addEventListener && g.addEventListener('OMEGA_COUNTRY_STARTUP_BASELINE_READY', () => {});
  if (g.document && g.document.readyState === 'loading')
    g.document.addEventListener('DOMContentLoaded', () => { initialize('DOM_CONTENT_LOADED').then(() => {}); }, { once: true });
  else initialize('SCRIPT_LOADED').then(() => {});
})(typeof window !== 'undefined' ? window : globalThis);
