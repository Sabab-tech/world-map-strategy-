import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const runtimeSource = fs.readFileSync(new URL('../omega_phase6_national_population_capacity_runtime_v1.js', import.meta.url), 'utf8');
const readJson = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const registry = readJson('country_general_data_registry_v1.json');
const baseline = readJson('country_factory_starting_baseline_v1.json');
const countryContext = readJson('resource_country_resource_context_index.json');
const economyRules = readJson('resource_economy_rules.json');
const industrialCatalog = readJson('resource_industrial_catalog_v1.json');
const factoryTypes = Object.keys(industrialCatalog.factoryProfiles).sort();
const coreCountryIds = Object.keys(countryContext.countries).sort();

function record(population, year, status = 'WORLD_BANK_API_OBSERVATION', extra = {}) {
  return {
    identity: { iso3: extra.iso3 || 'BGD', name: extra.name || 'Bangladesh' },
    metrics: {
      populationTotal: population,
      population2015: extra.population2015 ?? null,
      populationGrowthPct: 1.1,
      urbanizationPct: 34.5,
      populationAge15To64Pct: 65,
      ageDependencyRatioPct: 45
    },
    metricMetadata: {
      populationTotal: {
        year, status, sourceId: 'WORLD_BANK_WDI', sourceName: 'World Bank Indicators API v2',
        sourceUrl: extra.sourceUrl || 'https://api.worldbank.org/v2/country/bgd/indicator/SP.POP.TOTL?format=json',
        confidence: status === 'WORLD_BANK_API_OBSERVATION' ? 0.92 : 0.4
      },
      population2015: {
        year: 2015, status: 'LEGACY_BASELINE', sourceId: 'population.json',
        sourceName: 'OMEGA_LEGACY_POPULATION_BASELINE', confidence: 0.2
      }
    }
  };
}

function makeHarness(options = {}) {
  const countryId = options.countryId || 'BGD';
  const worldState = options.state || {
    simulation: { turn: 7, session: { playerCountryId: countryId } },
    population: {},
    economy: { [countryId]: { productionAssets: [] } },
    resource: { [countryId]: {} },
    trade: { [countryId]: {} }
  };
  const records = {
    BGD: record(175686899, 2025, 'WORLD_BANK_API_OBSERVATION', { iso3: 'BGD', name: 'Bangladesh' }),
    USA: record(341784857, 2025, 'WORLD_BANK_API_OBSERVATION', { iso3: 'USA', name: 'United States' }),
    TWN: record(23500000, 2015, 'STALE_BASELINE', { iso3: 'TWN', name: 'Taiwan' }),
    VAT: record(800, 2015, 'STALE_BASELINE', { iso3: 'VAT', name: 'Vatican City' }),
    ESH: record(null, null, 'NOT_RECORDED', { iso3: 'ESH', name: 'Western Sahara' })
  };
  const calls = { generalInit: [], baselineInit: 0, catalogLoad: 0, factoryRegistryQueries: [] };
  const baselineApi = {
    async init() { calls.baselineInit += 1; return { status: 'READY', countryCount: 197, factoryTypeCount: 21 }; },
    getCountryBaseline(id) { return baseline.countries[id] || null; },
    getCountryFactoryRegistry(id) {
      calls.factoryRegistryQueries.push(id);
      const row = baseline.countries[id];
      if (!row) return null;
      return {
        status: 'READY', countryId: id, totalStartingFactoryUnits: row.totalStartingFactoryUnits,
        factoryTypeCount: 21, runtimeStatus: id === countryId ? 'REGISTERED' : 'STATIC_BASELINE_NOT_ACTIVE_PLAYER_COUNTRY'
      };
    }
  };
  const context = {
    console,
    Game: { state: worldState },
    gameState: worldState,
    __OmegaResourceEconomyRules: structuredClone(economyRules),
    OmegaResourceIndustrialCatalogData: structuredClone(industrialCatalog),
    OmegaCountryGeneralDataRuntime: {
      async init(id) { calls.generalInit.push(id); return true; },
      getCountryRecord(id) { return records[id] || null; },
      resolveCountry(value) {
        const key = String(value || '').toUpperCase();
        if (key === 'BANGLADESH') return { iso3: 'BGD' };
        if (/^[A-Z]{3}$/.test(key)) return { iso3: key };
        return null;
      }
    },
    OmegaCountryFactoryStartingBaselineV1: baselineApi,
    OmegaResourceIndustrialNetwork: {
      async loadCatalog() { calls.catalogLoad += 1; return { status: 'READY' }; }
    },
    Omega: {
      Simulation: { getPlayerCountryId: () => options.playerCountryId || countryId, clock: { turn: 7 } },
      CountryGeneralData: null,
      CountryFactoryStartingBaselineV1: baselineApi,
      ResourceIndustrialNetwork: null
    },
    OmegaCanonicalIdentityRegistry: {
      resolveCountry(value) {
        const key = String(value || '').trim().toUpperCase();
        if (key === 'BANGLADESH') return { iso3: 'BGD' };
        if (key === 'UNITED STATES') return { iso3: 'USA' };
        if (/^[A-Z]{3}$/.test(key)) return { iso3: key };
        return null;
      }
    },
    addEventListener() {},
    document: null
  };
  context.globalThis = context;
  vm.runInNewContext(runtimeSource, context, { filename: 'omega_phase6_national_population_capacity_runtime_v1.js' });
  return { context, api: context.OmegaPhase6NationalCapacity, worldState, calls, records };
}

test('Phase 6 audits the 197-country population coverage without filling unknown values', () => {
  assert.equal(coreCountryIds.length, 197);
  const metricIndex = registry.fieldCatalogue.findIndex(field => field.key === 'populationTotal');
  assert.equal(metricIndex, 0);
  const recordsByIso3 = new Map(Object.values(registry.countries).map(row => [row.identity[2], row]));
  const coverage = { observed2025: 0, stale2015: 0, unknown: 0, sum2025: 0 };
  for (const iso3 of coreCountryIds) {
    const row = recordsByIso3.get(iso3);
    assert.ok(row, 'core country has a population status row: ' + iso3);
    const value = row.metrics[metricIndex];
    const year = row.metricMetadata.years[metricIndex];
    if (Number.isFinite(value) && value > 0 && year === 2025) {
      coverage.observed2025 += 1;
      coverage.sum2025 += value;
    } else if (Number.isFinite(value) && value > 0 && year === 2015) {
      coverage.stale2015 += 1;
    } else {
      coverage.unknown += 1;
    }
  }
  assert.deepEqual(coverage, {
    observed2025: 194, stale2015: 2, unknown: 1, sum2025: 8177226143
  });
  assert.equal(recordsByIso3.get('TWN').metrics[metricIndex], 23500000);
  assert.equal(recordsByIso3.get('TWN').metricMetadata.years[metricIndex], 2015);
  assert.equal(recordsByIso3.get('VAT').metricMetadata.years[metricIndex], 2015);
  assert.equal(recordsByIso3.get('ESH').metrics[metricIndex], null);
});

test('every core country retains the same canonical 21 factory-type keys and simulation-only counts', () => {
  assert.equal(baseline.countryCount, 197);
  assert.equal(Object.keys(baseline.countries).length, 197);
  assert.equal(baseline.factoryTypeCount, 21);
  assert.deepEqual(Object.keys(baseline.countries).sort(), coreCountryIds);
  let totalUnits = 0;
  for (const country of Object.values(baseline.countries)) {
    assert.deepEqual(Object.keys(country.factoryCounts).sort(), factoryTypes);
    assert.equal(country.provenance.simulationOnly, true);
    assert.equal(country.provenance.realWorldFacilityCounts, false);
    assert.equal(Object.values(country.factoryCounts).reduce((sum, count) => sum + count, 0),
      country.totalStartingFactoryUnits);
    totalUnits += country.totalStartingFactoryUnits;
  }
  assert.equal(totalUnits, 15920);
  assert.equal(baseline.countries.BGD.totalStartingFactoryUnits, 100);
  assert.equal(baseline.countries.BGD.factoryCounts.TEXTILE_GARMENT_MILL, 40);
});

test('the universal per-100k catalogue reuses the 37 calibrated rules and leaves four rates uncalibrated', () => {
  const { api } = makeHarness();
  const rates = api.getPer100kRateCatalog();
  assert.equal(rates.length, 41);
  assert.equal(rates.filter(row => row.status === 'CALIBRATED_FROM_EXISTING_RULE').length, 37);
  assert.equal(rates.filter(row => row.status === 'RATE_NOT_CALIBRATED').length, 4);
  for (const key of ['gypsum', 'niobium', 'ruby', 'limestone']) {
    const row = rates.find(item => item.resourceId === key);
    assert.equal(row.status, 'RATE_NOT_CALIBRATED');
    assert.equal(row.ratePer100kPerDay, null);
  }
  assert.equal(rates.find(row => row.resourceId === 'crude_oil').ratePer100kPerDay, 1050);
  assert.equal(rates.find(row => row.resourceId === 'coal').ratePer100kPerDay, 290);
  assert.equal(rates.find(row => row.resourceId === 'iron_ore').ratePer100kPerDay, 85);
  assert.equal(rates.find(row => row.resourceId === 'copper').ratePer100kPerDay, 1.03);
  assert.equal(rates.find(row => row.resourceId === 'lithium').ratePer100kPerDay, 0.008);
});

test('population scaling preserves one common per-100k rate across countries', async () => {
  const { api } = makeHarness();
  const bangladesh = await api.getNationalSummary('BGD');
  const usa = await api.getNationalSummary('USA');
  const bdOil = bangladesh.consumption.rows.find(row => row.resourceId === 'crude_oil');
  const usOil = usa.consumption.rows.find(row => row.resourceId === 'crude_oil');
  assert.equal(bangladesh.population.value, 175686899);
  assert.equal(bangladesh.population.status, 'OBSERVED');
  assert.equal(bdOil.ratePer100kPerDay, usOil.ratePer100kPerDay);
  assert.ok(Math.abs((bdOil.quantityPerDay / bangladesh.population.value) * 100000 - bdOil.ratePer100kPerDay) < 1e-9);
  assert.ok(Math.abs((usOil.quantityPerDay / usa.population.value) * 100000 - usOil.ratePer100kPerDay) < 1e-9);
  assert.equal(bangladesh.dataCoverage.populationObservationYear, 2025);
  assert.equal(bangladesh.consumption.populationDemandOnly, true);
});

test('live population outranks the static observation; old observations remain explicitly stale', async () => {
  const { api, worldState } = makeHarness();
  const old = await api.getNationalSummary('TWN');
  assert.equal(old.population.value, 23500000);
  assert.equal(old.population.status, 'STALE_BASELINE');
  assert.equal(old.population.observationYear, 2015);

  worldState.population.BGD = {
    totalPopulation: 176000000,
    observationYear: 2026,
    sourceId: 'ACTIVE_SESSION_POPULATION'
  };
  const live = await api.getNationalSummary('BGD');
  assert.equal(live.population.value, 176000000);
  assert.equal(live.population.status, 'LIVE_RUNTIME');
  assert.equal(live.population.source, 'Game.state.population.totalPopulation');
});

test('unknown population is not zero and yields unavailable population-demand calculations', async () => {
  const { api } = makeHarness();
  const summary = await api.getNationalSummary('ESH');
  assert.equal(summary.population.value, null);
  assert.equal(summary.population.status, 'UNKNOWN');
  assert.equal(summary.consumption.rows.find(row => row.resourceId === 'crude_oil').quantityPerDay, null);
  assert.equal(summary.consumption.rows.find(row => row.resourceId === 'crude_oil').calculationStatus, 'POPULATION_UNKNOWN');
});

test('active-country factory inventory is read once, capacity is evidence-gated and output uses the physical ledger only', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {},
    economy: {
      BGD: {
        productionAssets: [
          { id: 'F-1', factoryType: 'TEXTILE_GARMENT_MILL', status: 'OPERATIONAL',
            capacityPerDay: 500, operatingUtilizationRatio: 0.8,
            ownerType: 'STATE_OWNED_ENTERPRISE', currentWorkers: 420 },
          { id: 'F-2', factoryType: 'TEXTILE_GARMENT_MILL', status: 'MAINTENANCE',
            capacityPerDay: 500, operatingUtilizationRatio: 0.5,
            ownerType: 'PRIVATE_COMPANY', currentWorkers: 200 },
          { id: 'F-3', factoryType: 'STEEL_AND_ALLOY_WORKS', status: 'UNDER_CONSTRUCTION',
            capacityPerDay: 1000 }
        ],
        finishedGoodsLedger: [
          { transactionId: 'MIRROR-ONLY', turn: 7, outputQuantities: { garments: 999 } }
        ]
      }
    },
    resource: {
      BGD: {
        finishedGoodsLedger: [
          { transactionId: 'TX-1', turn: 7, outputQuantities: { garments: 100, shoes: 20 } },
          { transactionId: 'TX-1', turn: 7, outputQuantities: { garments: 100, shoes: 20 } },
          { transactionId: 'TX-OLD', turn: 6, outputQuantities: { garments: 500 } }
        ],
        demandRuntime: { byResource: {
          cotton_fibre: { activeFactoryInputDemandPerDay: 45, demandPerDay: 60, factoryConsumption: 40,
            fulfilledDemand: 55, unmetDemand: 5, inventoryBefore: 100, inventoryAfter: 40,
            protectedStock: 10, spendableStockAfter: 30, stockCoverageDays: 2,
            stockCoverageTargetDays: 5, lowStockCoverage: true, pendingImportQuantity: 15,
            unresolvedImportRequestCount: 1 }
        } }
      }
    },
    trade: { BGD: {} }
  };
  const { api, calls } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  assert.equal(summary.factories.activePlayerCountry, true);
  assert.equal(summary.factories.startingFactoryUnits, 100);
  assert.equal(summary.factories.liveFactoryUnits, 3);
  assert.equal(summary.factories.liveFactoryStatusCounts.operational, 1);
  assert.equal(summary.factories.liveFactoryStatusCounts.maintenance, 1);
  assert.equal(summary.factories.liveFactoryStatusCounts.underConstruction, 1);
  assert.equal(summary.factories.ownershipCounts.governmentOwned, 1);
  assert.equal(summary.factories.ownershipCounts.privateOwned, 1);
  assert.equal(summary.factories.ratedCapacityByFactoryType.TEXTILE_GARMENT_MILL.ratedCapacityPerDay, 1000);
  assert.equal(summary.factories.ratedCapacityByFactoryType.STEEL_AND_ALLOY_WORKS.ratedCapacityPerDay, 1000);
  assert.equal(summary.factories.effectiveCapacityByFactoryType.TEXTILE_GARMENT_MILL.effectiveCapacityPerDay, 400);
  assert.equal(summary.factories.effectiveCapacityByFactoryType.STEEL_AND_ALLOY_WORKS.effectiveCapacityPerDay, 0);
  assert.equal(summary.factories.capacityAggregateStatus, 'CROSS_FACTORY_TYPE_UNITS_NOT_ADDITIVE');
  assert.equal(summary.factories.staticBaselineCapacityByType.TEXTILE_GARMENT_MILL.unit, 'SIMULATION_RESOURCE_UNIT');
  assert.deepEqual(calls.factoryRegistryQueries, ['BGD']);
  assert.equal(summary.production.outputByProductThisTurn.garments, 100);
  assert.equal(summary.production.outputByProductThisTurn.shoes, 20);
  assert.equal(summary.production.uniqueTransactionCount, 1);
  assert.equal(summary.production.authority, 'resource.finishedGoodsLedger');
  assert.equal(summary.factoryDemand.byResource.cotton_fibre.factoryInputDemandPerDay, 45);
  const reconciliation = summary.nationalRequirement.byResource.cotton_fibre;
  assert.equal(reconciliation.inventoryBefore, 100);
  assert.equal(reconciliation.inventoryAfter, 40);
  assert.equal(reconciliation.pendingImportQuantity, 15);
  assert.equal(reconciliation.unmetDemand, 5);
  assert.equal(reconciliation.stockCoverageDays, 2);
  assert.equal(reconciliation.inboundShipmentQuantity, null);
  assert.equal(reconciliation.inboundShipmentEvidenceStatus, 'NOT_EXPOSED_BY_NATIONAL_DEMAND_RUNTIME');
});

test('ambiguous utilization ratios and missing live capacity remain unavailable', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {},
    economy: {
      BGD: { productionAssets: [
        { id: 'AMBIGUOUS-RATIO', factoryType: 'TEXTILE_GARMENT_MILL', status: 'OPERATIONAL',
          capacityPerDay: 500, utilizationRatio: 1.5 },
        { id: 'UNKNOWN-CAPACITY', factoryType: 'TEXTILE_GARMENT_MILL', status: 'OPERATIONAL',
          utilizationRatio: 0.5 }
      ] }
    },
    resource: { BGD: {} },
    trade: { BGD: {} }
  };
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const effective = summary.factories.effectiveCapacityByFactoryType.TEXTILE_GARMENT_MILL;
  const rated = summary.factories.ratedCapacityByFactoryType.TEXTILE_GARMENT_MILL;
  assert.equal(effective.effectiveCapacityPerDay, null);
  assert.equal(effective.status, 'UTILIZATION_OR_CAPACITY_UNOBSERVED');
  assert.equal(rated.ratedCapacityPerDay, null);
  assert.equal(rated.status, 'CAPACITY_EVIDENCE_INCOMPLETE');
  assert.equal(summary.factories.liveAssets.find(row => row.factoryId === 'AMBIGUOUS-RATIO').utilizationRatio, null);
});

test('non-player countries expose static baselines only and do not read detailed live factory assets', async () => {
  const state = {
    simulation: { turn: 3, session: { playerCountryId: 'USA' } },
    population: {},
    economy: {
      BGD: { productionAssets: [{ id: 'NPC-FACTORY', factoryType: 'TEXTILE_GARMENT_MILL', status: 'OPERATIONAL', capacityPerDay: 500 }] },
      USA: { productionAssets: [] }
    },
    resource: { BGD: { finishedGoodsLedger: [{ transactionId: 'NPC-TX', turn: 3, outputQuantities: { garments: 10 } }] } },
    trade: {}
  };
  const { api, calls } = makeHarness({ state, countryId: 'BGD', playerCountryId: 'USA' });
  const summary = await api.getNationalSummary('BGD');
  assert.equal(summary.factories.activePlayerCountry, false);
  assert.equal(summary.factories.startingFactoryUnits, 100);
  assert.equal(summary.factories.liveFactoryUnits, null);
  assert.equal(summary.factories.liveAssets, null);
  assert.equal(summary.production.status, 'NOT_ACTIVE_COUNTRY');
  assert.equal(summary.production.outputByProductThisTurn, null);
  assert.equal(summary.factoryDemand.byResource, null);
  assert.deepEqual(calls.factoryRegistryQueries, [],
    'the static NPC summary must not query a detailed live factory registry');
});

test('population expenditure stays unavailable without explicit price currency and Treasury proof', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {},
    economy: { BGD: { productionAssets: [] } },
    resource: { BGD: {} },
    trade: { BGD: { marketPrice: { crude_oil: 80 } } }
  };
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const oil = summary.expenditure.populationConsumption.rows.find(row => row.resourceId === 'crude_oil');
  assert.equal(oil.price, 80);
  assert.equal(oil.currency, null);
  assert.equal(oil.costPerDay, null);
  assert.equal(oil.costStatus, 'CURRENCY_UNAVAILABLE');
  assert.equal(summary.expenditure.populationConsumption.totalCostPerDay, null);
  assert.equal(summary.expenditure.factoryOperatingCost.status, 'NOT_FINALIZED');
  assert.equal(summary.expenditure.treasuryActualExpense.status, 'NOT_ESTABLISHED');
});

test('price currency without an observation does not produce a modeled expense', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {},
    economy: { BGD: { productionAssets: [] } },
    resource: { BGD: {} },
    trade: { BGD: { marketPrice: { crude_oil: { price: 80, currency: 'USD' } } } }
  };
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const oil = summary.expenditure.populationConsumption.rows.find(row => row.resourceId === 'crude_oil');
  assert.equal(oil.costStatus, 'PRICE_OBSERVATION_UNAVAILABLE');
  assert.equal(oil.costPerDay, null);
  assert.equal(summary.expenditure.populationConsumption.totalCostPerDay, null);
});

test('explicit price, currency and observation allow a resource-level modeled cost only', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {},
    economy: { BGD: { productionAssets: [] } },
    resource: { BGD: {} },
    trade: { BGD: { marketPrice: { crude_oil: { price: 80, currency: 'USD', observation: { turn: 7, source: 'TEST_MARKET_QUOTE' } } } } }
  };
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const oil = summary.expenditure.populationConsumption.rows.find(row => row.resourceId === 'crude_oil');
  assert.equal(oil.costStatus, 'AVAILABLE');
  assert.equal(oil.currency, 'USD');
  assert.ok(Math.abs(oil.costPer100kPerDay - oil.ratePer100kPerDay * 80) < 1e-9);
  assert.ok(Math.abs(oil.costPerDay - oil.quantityPerDay * 80) < 1e-6);
  assert.equal(summary.expenditure.treasuryActualExpense.amount, null);
});

test('the projection is read-only, does not schedule turns, and does not sum two demand authorities', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {},
    economy: { BGD: { productionAssets: [] } },
    resource: { BGD: { demandRuntime: { byResource: {
      iron_ore: { activeFactoryInputDemandPerDay: 2, demandPerDay: 10 }
    } } } },
    trade: { BGD: {} }
  };
  const before = JSON.stringify(state);
  const { api, context } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const row = summary.nationalRequirement.byResource.iron_ore;
  assert.equal(row.quantityPerDay,
    summary.consumption.rows.find(item => item.resourceId === 'iron_ore').quantityPerDay,
    'population demand remains a separate per-resource field');
  assert.equal(row.factoryInputDemandPerDay, 2);
  assert.equal(row.existingNationalDemandPerDay, 10);
  assert.equal(row.combinedDemandStatus, 'EXISTING_RUNTIME_VALUE');
  assert.equal(summary.nationalRequirement.sumPopulationAndFactoryDemand, false);
  assert.equal(JSON.stringify(state), before);
  const diagnostics = api.diagnostics();
  assert.equal(diagnostics.newSchedulerRegistered, false);
  assert.equal(diagnostics.stateMutation, false);
  assert.equal(context.OmegaPhase6NationalCapacity, api);
});

test('overview HTML presents the national summary without claiming simulated factory units are real facilities', async () => {
  const { api } = makeHarness();
  const summary = await api.getNationalSummary('BGD');
  const html = api.renderSummary(summary);
  assert.match(html, /National Population & Industrial Capacity/);
  assert.match(html, /SIMULATION BASELINE/);
  assert.match(html, /Common daily coefficients are simulation rules/);
  assert.doesNotMatch(html, /real-world facility count: 100/i);
});
