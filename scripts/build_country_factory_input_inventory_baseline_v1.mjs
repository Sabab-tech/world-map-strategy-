#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = name => path.join(root, name);
const read = name => JSON.parse(fs.readFileSync(file(name), 'utf8'));
const round = value => Number(Number(value).toFixed(6));

function build({ baseline, catalog, sites, economyRules }) {
  const rawResources = new Set(Object.keys(economyRules.demand.resourceProfiles || {}));
  const factoryTypes = Object.keys(catalog.factoryProfiles || {}).sort();
  if (factoryTypes.length !== 21 || Object.keys(baseline.countries || {}).length !== 197) {
    throw new Error('COUNTRY_FACTORY_INPUT_BASELINE_CANONICAL_MATRIX_INVALID');
  }
  const siteMix = Object.create(null);
  for (const site of sites.records || []) {
    if (site.commercialExtraction !== true) continue;
    const countryId = String(site.countryId || site.countryCode || '').trim().toUpperCase();
    const resourceId = String(site.resourceId || '').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!countryId || !rawResources.has(resourceId) || !catalog.processingRules[resourceId]) continue;
    siteMix[countryId] ||= {};
    siteMix[countryId][resourceId] = (siteMix[countryId][resourceId] || 0) + 1;
  }

  const countries = {}, worldOpening = {}, productIds = new Set();
  let worldFactoryUnits = 0, totalRows = 0, totalCycle = 0, totalOpening = 0;
  let domesticProcessorCountries = 0, importFallbackCountries = 0, importFallbackUnits = 0;
  let countriesUsingMultipleFactoryRoutes = 0, startingFactoryUnitsAcrossMultiRouteTypes = 0;

  for (const countryId of Object.keys(baseline.countries).sort()) {
    const country = baseline.countries[countryId];
    const counts = country.factoryCounts || {};
    if (Object.keys(counts).sort().join('|') !== factoryTypes.join('|')) {
      throw new Error('COUNTRY_FACTORY_TYPE_MATRIX_MISMATCH:' + countryId);
    }
    const productSources = Object.create(null);
    let countryUsesMultipleFactoryRoutes = false;
    for (const factoryType of factoryTypes) {
      const count = Number(counts[factoryType]);
      const profile = catalog.factoryProfiles[factoryType];
      if (!Number.isSafeInteger(count) || count < 0 || !profile) {
        throw new Error('COUNTRY_FACTORY_COUNT_INVALID:' + countryId + ':' + factoryType);
      }
      worldFactoryUnits += count;
      if (!count) continue;
      const capacity = Number(profile.defaultCapacityPerDay);
      if (!Number.isFinite(capacity) || capacity <= 0) {
        throw new Error('FACTORY_CAPACITY_NOT_RECORDED:' + factoryType);
      }

      if (factoryType === 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT') {
        const mineResources = Object.entries(siteMix[countryId] || {}).sort((a, b) => a[0].localeCompare(b[0]));
        let allocations = [], allocationSource = 'DOMESTIC_COMMERCIAL_SITE_MIX';
        if (mineResources.length) {
          domesticProcessorCountries++;
          const totalWeight = mineResources.reduce((sum, row) => sum + row[1], 0);
          allocations = mineResources.map(([resourceId, siteCount]) => {
            const exact = count * siteCount / totalWeight;
            const baseUnits = Math.floor(exact);
            return { resourceId, siteCount, factoryUnits: baseUnits, remainder: exact - baseUnits };
          });
          const remaining = count - allocations.reduce((sum, row) => sum + row.factoryUnits, 0);
          const priority = allocations.slice().sort((a, b) =>
            b.remainder - a.remainder || a.resourceId.localeCompare(b.resourceId));
          for (let index = 0; index < remaining; index++) {
            allocations.find(row => row.resourceId === priority[index].resourceId).factoryUnits++;
          }
        } else {
          allocationSource = 'SIMULATED_IMPORT_BASELINE_NO_DOMESTIC_SITE';
          importFallbackCountries++;
          importFallbackUnits += count;
          const fallback = ['coal', 'iron_ore'];
          const each = Math.floor(count / fallback.length);
          const extra = count - each * fallback.length;
          allocations = fallback.map((resourceId, index) => ({
            resourceId, siteCount: 0, factoryUnits: each + (index < extra ? 1 : 0)
          }));
        }

        for (const allocation of allocations) {
          if (!allocation.factoryUnits) continue;
          const processing = catalog.processingRules[allocation.resourceId];
          const coefficient = Number(Object.values(processing.inputs || {})[0]);
          const demand = round(allocation.factoryUnits * capacity * coefficient);
          productSources[allocation.resourceId] ||= [];
          productSources[allocation.resourceId].push({
            factoryType, factoryUnits: allocation.factoryUnits,
            recipeId: 'PROCESSING:' + allocation.resourceId,
            cycleDays: Number(processing.cycleDays) || 1,
            capacityPerCycle: capacity, inputCoefficient: coefficient,
            demandQuantity: demand, allocationSource, siteCount: allocation.siteCount
          });
        }
        continue;
      }

      const recipeIds = (profile.recipeIds || [])
        .filter(recipeId => catalog.downstreamFactoryRecipes &&
          catalog.downstreamFactoryRecipes[recipeId] &&
          catalog.downstreamFactoryRecipes[recipeId].factoryType === factoryType);
      const routes = recipeIds.length ? recipeIds : [profile.defaultRecipeId].filter(Boolean);
      if (!routes.length) {
        throw new Error('FACTORY_RECIPE_ROUTE_NOT_FOUND:' + countryId + ':' + factoryType);
      }
      let routeAllocations = [];
      if (routes.length === 1) {
        routeAllocations = [{ recipeId: routes[0], factoryCount: count }];
      } else {
        countryUsesMultipleFactoryRoutes = true;
        startingFactoryUnitsAcrossMultiRouteTypes += count;
        const priority = routes.slice().sort((left, right) =>
          left === profile.defaultRecipeId ? -1 : right === profile.defaultRecipeId ? 1 :
            routes.indexOf(left) - routes.indexOf(right));
        const each = Math.floor(count / routes.length);
        const extra = count - each * routes.length;
        routeAllocations = priority.map((recipeId, index) => ({
          recipeId, factoryCount: each + (index < extra ? 1 : 0)
        })).filter(row => row.factoryCount > 0);
      }
      for (const allocation of routeAllocations) {
        const recipeId = allocation.recipeId;
        const recipe = catalog.downstreamFactoryRecipes && catalog.downstreamFactoryRecipes[recipeId];
        if (!recipe || recipe.factoryType !== factoryType) {
          throw new Error('FACTORY_RECIPE_ROUTE_INVALID:' + countryId + ':' + factoryType + ':' + recipeId);
        }
        for (const [productId, rawCoefficient] of Object.entries(recipe.inputs || {})) {
          const coefficient = Number(rawCoefficient);
          if (!Number.isFinite(coefficient) || coefficient <= 0) {
            throw new Error('FACTORY_RECIPE_INPUT_INVALID:' + recipeId + ':' + productId);
          }
          const demand = round(allocation.factoryCount * capacity * coefficient);
          productSources[productId] ||= [];
          productSources[productId].push({
            factoryType, factoryCount: allocation.factoryCount, recipeId,
            cycleDays: Number(recipe.cycleDays) || 1,
            capacityPerCycle: capacity, inputCoefficient: coefficient,
            demandQuantity: demand
          });
        }
      }
    }
    if (countryUsesMultipleFactoryRoutes) countriesUsingMultipleFactoryRoutes++;

    const factoryInputRows = Object.keys(productSources).sort().map(productId => {
      const sources = productSources[productId];
      const demand = round(sources.reduce((sum, source) => sum + source.demandQuantity, 0));
      const isRawResource = rawResources.has(productId);
      const externalSource = (catalog.externalInputSources || {})[productId];
      const row = {
        productId,
        productNamespace: isRawResource ? 'RAW_RESOURCE' :
          externalSource ? 'EXTERNAL_SECTOR_INPUT' : 'INDUSTRIAL_INTERMEDIATE',
        stage: isRawResource || externalSource ? 'RAW' : 'INTERMEDIATE',
        demandPerFullCycle: demand,
        bufferQuantity: round(demand * 0.4),
        openingStockQuantity: round(demand * 1.4),
        sources
      };
      if (externalSource) {
        row.supplySource = externalSource.sourceSector || 'EXTERNAL_SECTOR';
        row.sourceAuthority = externalSource.sourceAuthority || null;
        row.supplyMode = externalSource.supplyMode || 'STARTUP_BASELINE_STOCK';
        row.requiresRecordedUpstreamBatch = externalSource.requiresRecordedBatch === true;
      }
      worldOpening[productId] = round((worldOpening[productId] || 0) + row.openingStockQuantity);
      productIds.add(productId);
      return row;
    });
    const cycleTotal = round(factoryInputRows.reduce((sum, row) => sum + row.demandPerFullCycle, 0));
    const openingTotal = round(factoryInputRows.reduce((sum, row) => sum + row.openingStockQuantity, 0));
    totalRows += factoryInputRows.length;
    totalCycle += cycleTotal;
    totalOpening += openingTotal;
    const processorCount = Number(counts.UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT) || 0;
    const processorSources = Object.values(productSources).flat().filter(row =>
      row.factoryType === 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT');
    const processorImportFallback = processorSources.some(row =>
      row.allocationSource === 'SIMULATED_IMPORT_BASELINE_NO_DOMESTIC_SITE');
    countries[countryId] = {
      countryId,
      countryName: country.countryName,
      industryArchetype: country.industryArchetype || null,
      totalStartingFactoryUnits: Number(country.totalStartingFactoryUnits) || 0,
      factoryInputRows,
      totalCycleInputQuantity: cycleTotal,
      totalOpeningStockQuantity: openingTotal,
      universalProcessorUnits: processorCount,
      universalProcessorInputSource: processorImportFallback ? 'SIMULATED_IMPORT_FALLBACK' :
        processorSources.length ? 'DOMESTIC_SITE_MIX' : processorCount ? 'NO_DOMESTIC_PROCESSOR_INPUT' : 'NOT_APPLICABLE'
    };
  }

  return {
    schemaVersion: '1.0.0',
    datasetId: 'OMEGA_COUNTRY_FACTORY_INPUT_INVENTORY_BASELINE_V1',
    version: '1.0.0',
    purpose: 'One-time simulation-only input stock for all 197 core countries, computed from their 21-type factory allocation and canonical production requirements.',
    countryCount: 197,
    factoryTypeCount: 21,
    worldStartingFactoryUnits: worldFactoryUnits,
    buffer: { percent: 40, multiplier: 1.4, appliedTo: 'FULL_CYCLE_INPUT_DEMAND_BY_PRODUCT' },
    quantityBasis: {
      cycle: 'ONE_FULL_FACTORY_CAPACITY_CYCLE',
      capacity: 'factoryProfiles.defaultCapacityPerDay',
      formula: 'allocatedFactoryUnits × defaultCapacityPerDay × recipeInputCoefficient × 1.40',
      cycleTimePolicy: 'cycleDays is a completion delay and is not multiplied into one-cycle stock.',
      unit: 'SIMULATION_RESOURCE_UNIT',
      unitNormalizationIsGameOnly: true
    },
    model: {
      authority: 'SIMULATED_COUNTRY_FACTORY_INPUT_STARTUP_BASELINE_V1',
      simulationOnly: true,
      realWorldInventory: false,
      defaultRecipePolicy: 'Single-route types use their declared route. Multi-route types split starting factory units across all canonical routes, prioritising defaultRecipeId for any remainder; alternatives are not double-counted.',
      universalProcessorPolicy: 'Split universal processor capacity over commercial mine resource groups by site-count weight. Countries without a domestic site receive coal/iron-ore as simulated opening import stock.',
      externalInputsPolicy: 'Agricultural/external recipe inputs are one-time simulated opening stock. No import contracts, transactions or automatic replenishment are created.',
      reservePolicy: 'Geological reserves are never used as inventory.',
      stockPolicy: 'Every row becomes a separately tracked startup batch in the correct warehouse and is added without overwriting existing inventory.'
    },
    sources: {
      factoryCounts: 'country_factory_starting_baseline_v1.json',
      factoryProfilesAndRecipes: 'resource_industrial_catalog_v1.json',
      commercialMineResourceMix: 'resource_site_reserve_simulation_v1.json',
      rawResourceIdentityCatalog: 'resource_economy_rules.json:demand.resourceProfiles'
    },
    worldOpeningStockByProduct: Object.fromEntries(Object.keys(worldOpening).sort()
      .map(productId => [productId, worldOpening[productId]])),
    countries,
    summary: {
      coreCountryCount: 197,
      factoryTypeCount: 21,
      worldTotalStartingFactoryUnits: worldFactoryUnits,
      worldInputProductCount: productIds.size,
      totalCountryProductRows: totalRows,
      totalCycleInputSimulationUnits: round(totalCycle),
      totalOpeningStockSimulationUnits: round(totalOpening),
      countriesWithDomesticProcessorSiteAllocation: domesticProcessorCountries,
      countriesUsingProcessorImportFallback: importFallbackCountries,
      processorImportFallbackUnits: importFallbackUnits,
      countriesUsingMultipleFactoryRoutes,
      startingFactoryUnitsAcrossMultiRouteTypes,
      missingRecipeCount: 0
    }
  };
}

const input = {
  baseline: read('country_factory_starting_baseline_v1.json'),
  catalog: read('resource_industrial_catalog_v1.json'),
  sites: read('resource_site_reserve_simulation_v1.json'),
  economyRules: read('resource_economy_rules.json')
};
const output = fileURLToPath(new URL('../country_factory_input_inventory_baseline_v1.json', import.meta.url));
const expected = JSON.stringify(build(input)) + '\n';
if (process.argv.includes('--check')) {
  const actual = fs.readFileSync(output, 'utf8');
  if (actual !== expected) {
    console.error('Country factory input inventory baseline is out of date.');
    process.exitCode = 1;
  } else {
    console.log('OMEGA COUNTRY FACTORY INPUT INVENTORY BASELINE CHECK PASSED');
    console.log('Countries:', input.baseline.countryCount);
    console.log('Factory types:', Object.keys(input.catalog.factoryProfiles).length);
    console.log('Input products:', Object.keys(build(input).worldOpeningStockByProduct).length);
    console.log('Opening input stock includes exactly 40% buffer.');
  }
} else {
  fs.writeFileSync(output, expected);
  console.log('Generated country factory input inventory baseline:', output);
}
