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
        year, status, sourceId: extra.sourceId || 'WORLD_BANK_WDI',
        sourceName: extra.sourceName || 'World Bank Indicators API v2',
        sourceUrl: extra.sourceUrl || 'https://api.worldbank.org/v2/country/bgd/indicator/SP.POP.TOTL?format=json',
        confidence: status === 'WORLD_BANK_API_OBSERVATION' || status === 'OFFICIAL_POPULATION_OBSERVATION' ? 0.92 : 0.4
      },
      population2015: {
        year: 2015, status: 'LEGACY_BASELINE', sourceId: 'population.json',
        sourceName: 'OMEGA_LEGACY_POPULATION_BASELINE', confidence: 0.2
      }
    }
  };
}

function testJournal(countryId, sectorId, companyId, transactionId, currency, amountMinor, authority) {
  const company = companyId || null;
  const sourceAuthority = authority || (sectorId === 'government'
    ? 'OMEGA_FINANCE_MINISTRY' : 'OMEGA_PRIVATE_ENTERPRISE_FINANCE_LEDGER');
  const line = (lineNumber, side, accountId) => ({
    lineId: transactionId + ':L' + lineNumber, lineNumber, accountId, side, amountMinor,
    currency, countryId, companyId: company || undefined, sourceTransactionId: transactionId
  });
  return {
    schemaVersion: 1, status: 'POSTED', sectorId, sourceAuthority,
    sourceTransactionId: transactionId, countryId, companyId: company || undefined,
    currency, turn: 7, periodId: 'GAME_TURN_7', accountingBasis: 'RECORDED_GAME_RUNTIME',
    provenance: 'RECORDED_GAME_RUNTIME', counterEntryComplete: true,
    debitTotalMinor: amountMinor, creditTotalMinor: amountMinor,
    lines: [line(1, 'DEBIT', 'EXPENSE_ACCOUNT'), line(2, 'CREDIT', 'CASH_OR_PAYABLE')]
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
    TWN: record(23299132, 2025, 'OFFICIAL_POPULATION_OBSERVATION', { iso3: 'TWN', name: 'Taiwan', sourceUrl: 'https://www.ris.gov.tw/info-liferay/app/channel/newsEnglishDetail/26245250', sourceName: 'Taiwan Ministry of the Interior' }),
    VAT: record(882, 2024, 'OFFICIAL_POPULATION_OBSERVATION', { iso3: 'VAT', name: 'Vatican City', sourceUrl: 'https://www.vaticanstate.va/en/state-and-government/general-informations/population.html', sourceName: 'Governorate of Vatican City State' }),
    ESH: record(601000, 2025, 'UN_PROJECTED_POPULATION_ESTIMATE', { iso3: 'ESH', name: 'Western Sahara', sourceUrl: 'https://data.un.org/legacy/en/iso/eh.html', sourceName: 'United Nations Statistics Division, UNData' }),
    VUT: record(276244, 2015, 'STALE_BASELINE', { iso3: 'VUT', name: 'Vanuatu' })
  };
  Object.assign(records, options.records || {});
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
  const coverage = { observed2025: 0, officialObservedOtherYears: 0, estimated: 0, stale2015: 0, unknown: 0, sum2025: 0 };
  const statuses = registry.metadata.provenanceEncoding.statuses;
  for (const iso3 of coreCountryIds) {
    const row = recordsByIso3.get(iso3);
    assert.ok(row, 'core country has a population status row: ' + iso3);
    const value = row.metrics[metricIndex];
    const year = row.metricMetadata.years[metricIndex];
    const status = statuses[row.metricMetadata.statusCodes[metricIndex]];
    if (Number.isFinite(value) && value > 0 && year === 2025 &&
        ['WORLD_BANK_API_OBSERVATION', 'OFFICIAL_POPULATION_OBSERVATION'].includes(status)) {
      coverage.observed2025 += 1;
      coverage.sum2025 += value;
    } else if (Number.isFinite(value) && value > 0 && status === 'OFFICIAL_POPULATION_OBSERVATION') {
      coverage.officialObservedOtherYears += 1;
    } else if (Number.isFinite(value) && value > 0 && status === 'UN_PROJECTED_POPULATION_ESTIMATE') {
      coverage.estimated += 1;
    } else if (Number.isFinite(value) && value > 0 && year === 2015) {
      coverage.stale2015 += 1;
    } else if (!Number.isFinite(value)) {
      coverage.unknown += 1;
    }
  }
  assert.deepEqual(coverage, {
    observed2025: 195, officialObservedOtherYears: 1, estimated: 1,
    stale2015: 0, unknown: 0, sum2025: 8200525275
  });
  assert.equal(recordsByIso3.get('TWN').metrics[metricIndex], 23299132);
  assert.equal(recordsByIso3.get('TWN').metricMetadata.years[metricIndex], 2025);
  assert.equal(recordsByIso3.get('VAT').metrics[metricIndex], 882);
  assert.equal(recordsByIso3.get('VAT').metricMetadata.years[metricIndex], 2024);
  assert.equal(recordsByIso3.get('ESH').metrics[metricIndex], 601000);
  assert.equal(recordsByIso3.get('ESH').metricMetadata.years[metricIndex], 2025);
  assert.equal(registry.metadata.populationCoverage.observed2025, 195);
});

test('official and projected population sources keep distinct runtime statuses', async () => {
  const { api } = makeHarness();
  const taiwan = await api.getNationalSummary('TWN');
  const vatican = await api.getNationalSummary('VAT');
  const westernSahara = await api.getNationalSummary('ESH');
  assert.equal(taiwan.population.value, 23299132);
  assert.equal(taiwan.population.status, 'OBSERVED');
  assert.equal(taiwan.population.observationYear, 2025);
  assert.equal(taiwan.population.sourceUrl, 'https://www.ris.gov.tw/info-liferay/app/channel/newsEnglishDetail/26245250');
  assert.equal(vatican.population.value, 882);
  assert.equal(vatican.population.status, 'OBSERVED');
  assert.equal(vatican.population.observationYear, 2024);
  assert.equal(westernSahara.population.value, 601000);
  assert.equal(westernSahara.population.status, 'ESTIMATED');
  assert.equal(westernSahara.population.sourceStatus, 'UN_PROJECTED_POPULATION_ESTIMATE');
  assert.equal(westernSahara.population.observationYear, 2025);
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

test('Phase 6 provenance is saved and revalidated after game load; changed inputs invalidate the saved fingerprint', async () => {
  const { api, worldState } = makeHarness();
  const original = await api.getNationalSummary('BGD');
  const saved = api.saveState();
  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.countryId, 'BGD');
  assert.equal(saved.population.sourceId, 'WORLD_BANK_WDI');
  assert.equal(saved.population.observationYear, 2025);
  assert.equal(saved.rates.version, '1.0.0');
  assert.equal(saved.rates.resourceProfileCount, 41);
  assert.equal(saved.rates.calibratedCount, 37);
  assert.equal(saved.rates.uncalibratedCount, 4);
  assert.match(saved.inputFingerprint, /^[a-f0-9]{8}$/);

  assert.equal(api.loadState(saved).status, 'PENDING_REVALIDATION');
  const restored = await api.getNationalSummary('BGD');
  assert.equal(restored.saveLoadValidation.status, 'REVALIDATED');
  assert.equal(restored.provenance.inputFingerprint, original.provenance.inputFingerprint);

  api.loadState(saved);
  worldState.population.BGD = {
    totalPopulation: 176000000,
    observationYear: 2026,
    sourceId: 'ACTIVE_SESSION_POPULATION'
  };
  const changed = await api.getNationalSummary('BGD');
  assert.equal(changed.saveLoadValidation.status, 'INVALIDATED_SOURCE_CHANGED');
  assert.equal(changed.population.status, 'LIVE_RUNTIME');
});

test('live population outranks official observations; stale fallback remains explicitly stale', async () => {
  const { api, worldState } = makeHarness();
  const current = await api.getNationalSummary('TWN');
  assert.equal(current.population.value, 23299132);
  assert.equal(current.population.status, 'OBSERVED');
  assert.equal(current.population.observationYear, 2025);
  const old = await api.getNationalSummary('VUT');
  assert.equal(old.population.value, 276244);
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
  const { api } = makeHarness({ records: {
    ESH: record(null, null, 'NOT_RECORDED', { iso3: 'ESH', name: 'Western Sahara' })
  } });
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
        inventoryLedger: [
          { type: 'INTERNATIONAL_TRADE_IMPORT', settlementId: 'IMPORT-COTTON-7', resourceId: 'cotton_fibre', quantity: 12, sourceCountryId: 'USA', turn: 7 },
          { type: 'INTERNATIONAL_TRADE_IMPORT', settlementId: 'IMPORT-COTTON-7', resourceId: 'cotton_fibre', quantity: 12, sourceCountryId: 'USA', turn: 7 },
          { type: 'INTERNATIONAL_TRADE_IMPORT', settlementId: 'IMPORT-COTTON-6', resourceId: 'cotton_fibre', quantity: 90, sourceCountryId: 'USA', turn: 6 }
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
  assert.equal(reconciliation.confirmedImportsThisTurn, 12);
  assert.equal(reconciliation.confirmedImportKnownQuantityThisTurn, 12);
  assert.equal(reconciliation.confirmedImportSettlementCountThisTurn, 1);
  assert.equal(Array.from(reconciliation.confirmedImportSettlementIds).join(','), 'IMPORT-COTTON-7');
  assert.equal(reconciliation.confirmedImportEvidenceStatus, 'OBSERVED_SETTLED_IMPORT_LEDGER');
  assert.equal(summary.confirmedImports.authority,
    'Game.state.resource[countryId].inventoryLedger[type=INTERNATIONAL_TRADE_IMPORT]');
  assert.equal(summary.confirmedImports.uniqueSettlementCount, 1);
  assert.equal(reconciliation.unmetDemand, 5);
  assert.equal(reconciliation.stockCoverageDays, 2);
  assert.equal(reconciliation.inboundShipmentQuantity, null);
  assert.equal(reconciliation.inboundShipmentEvidenceStatus, 'NOT_PERSISTED_BY_TRADE_SHIPMENT_AUTHORITY');
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

test('Phase 6 reads only balanced current-turn Treasury expenses and private factory accruals without mutation', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {}, economy: { BGD: { productionAssets: [] } }, resource: { BGD: {} }, trade: { BGD: {} },
    finance: { BGD: { omegaFinance: { ledger: [
      { transactionId: 'GOV-EXP-1', action: 'EXPENSE', amountUsd: 125, turn: 7,
        sectorJournalV1: testJournal('BGD', 'government', null, 'GOV-EXP-1', 'USD', 12500) },
      { transactionId: 'GOV-REV-1', action: 'EXPENSE_ROLLBACK', amountUsd: 25, turn: 7,
        sectorJournalV1: testJournal('BGD', 'government', null, 'GOV-REV-1', 'USD', 2500) },
      { transactionId: 'GOV-BAD-1', action: 'EXPENSE', amountUsd: 400, turn: 7,
        sectorJournalV1: Object.assign(testJournal('BGD', 'government', null, 'GOV-BAD-1', 'USD', 40000), { creditTotalMinor: 39900 }) },
      { transactionId: 'FIRM-OPEX-1', type: 'PRIVATE_ENTERPRISE_OPERATING_COST_ACCRUAL',
        companyId: 'AURORA_INDUSTRIAL_GROUP', factoryId: 'PRIVATE-STEEL-01', amount: 15,
        currency: 'GAME_CURRENCY_UNITS', turn: 7,
        sectorJournalV1: testJournal('BGD', 'firm', 'AURORA_INDUSTRIAL_GROUP', 'FIRM-OPEX-1', 'GAME_CURRENCY_UNITS', 1500) },
      { transactionId: 'FIRM-OPEX-OLD', type: 'PRIVATE_ENTERPRISE_OPERATING_COST_ACCRUAL',
        companyId: 'AURORA_INDUSTRIAL_GROUP', factoryId: 'PRIVATE-STEEL-01', amount: 80,
        currency: 'GAME_CURRENCY_UNITS', turn: 6,
        sectorJournalV1: testJournal('BGD', 'firm', 'AURORA_INDUSTRIAL_GROUP', 'FIRM-OPEX-OLD', 'GAME_CURRENCY_UNITS', 8000) }
    ] } } }
  };
  const before = JSON.stringify(state);
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const treasury = summary.expenditure.treasuryActualExpense;
  assert.equal(treasury.status, 'PARTIAL_CURRENT_TURN_POSTED_EXPENSE_EVIDENCE');
  assert.equal(treasury.amount, null);
  assert.equal(treasury.postedExpenseTransactionCount, 2);
  assert.equal(treasury.invalidExpenseJournalCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(treasury.knownPostedExpenseByCurrency.map(row => ({
    currency: row.currency, grossAmount: row.grossAmount, reversalAmount: row.reversalAmount, netAmount: row.netAmount
  })))), [{ currency: 'USD', grossAmount: 125, reversalAmount: 25, netAmount: 100 }]);
  const operating = summary.expenditure.factoryOperatingCost;
  assert.equal(operating.status, 'PARTIAL_RECORDED_PRIVATE_FACTORY_ACCRUALS');
  assert.equal(operating.totalCostPerDay, null);
  assert.equal(operating.recordedAccrualTransactionCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(operating.recordedAccrualByCurrency.map(row => ({
    currency: row.currency, netAmount: row.netAmount, transactionCount: row.transactionCount
  })))), [{ currency: 'GAME_CURRENCY_UNITS', netAmount: 15, transactionCount: 1 }]);
  assert.equal(summary.expenditure.financialEvidence.amountsAggregatedAcrossCurrencies, false);
  assert.equal(summary.expenditure.financialEvidence.sourceLedgerWindow.complete, false);
  assert.equal(JSON.stringify(state), before, 'Phase 6 must not mutate Finance journal sources');
});

test('a complete game-state Finance fiscal period establishes budgetary Treasury expenditure without counting debt principal', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {}, economy: { BGD: { productionAssets: [] } }, resource: { BGD: {} }, trade: { BGD: {} },
    finance: { BGD: { omegaFinance: {
      treasuryBalanceUsd: 130,
      fiscalPeriodAccount: {
        schemaVersion: 1, sourceAuthority: 'OMEGA_FINANCE_MINISTRY_RUNTIME',
        periodIndex: 0, periodLabel: '2026', currency: 'USD',
        openingBalanceUsd: 100, closingBalanceUsd: 130,
        openingBalanceQuality: 'GAME_STATE', openingBalanceSource: 'NEW_GAME_FINANCE_OPENING',
        flowCoverage: 'COMPLETE_FROM_PERIOD_START',
        flowComponents: {
          taxRevenueUsd: 20, borrowingProceedsUsd: 10, externalCreditsUsd: 20,
          governmentSpendingUsd: 5, interestPaidUsd: 5,
          principalRepaymentUsd: 5, externalDebitsUsd: 5
        },
        totalInflowsUsd: 50, totalOutflowsUsd: 20,
        expectedClosingBalanceUsd: 130, varianceUsd: 0,
        reconciliationStatus: 'GAME_STATE_RECONCILED', status: 'GAME_STATE_RECONCILED',
        updatedTurn: 7
      },
      ledger: []
    } } }
  };
  const before = JSON.stringify(state);
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const treasury = summary.expenditure.treasuryActualExpense;
  assert.equal(treasury.status, 'PERIOD_RECONCILED_GAME_STATE');
  assert.equal(treasury.amount, 10);
  assert.equal(treasury.currency, 'USD');
  assert.equal(treasury.period, '2026');
  assert.equal(treasury.periodEvidence.governmentSpending, 5);
  assert.equal(treasury.periodEvidence.interestPaid, 5);
  assert.equal(treasury.periodEvidence.budgetaryExpense, 10);
  assert.equal(treasury.periodEvidence.principalRepaymentExcludedFromExpense, 5);
  assert.equal(treasury.periodEvidence.externalDebitsExcludedFromExpense, 5);
  assert.equal(treasury.periodEvidence.totalCashOutflows, 20);
  assert.equal(JSON.stringify(state), before, 'Phase 6 must only read the Finance fiscal account');
});

test('a modeled or incomplete Finance fiscal period never establishes actual Treasury expenditure', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {}, economy: { BGD: { productionAssets: [] } }, resource: { BGD: {} }, trade: { BGD: {} },
    finance: { BGD: { omegaFinance: {
      treasuryBalanceUsd: 130,
      fiscalPeriodAccount: {
        schemaVersion: 1, sourceAuthority: 'OMEGA_FINANCE_MINISTRY_RUNTIME',
        periodIndex: 0, periodLabel: '2026', currency: 'USD',
        openingBalanceUsd: 100, closingBalanceUsd: 130,
        openingBalanceQuality: 'MODELLED', flowCoverage: 'COMPLETE_FROM_PERIOD_START',
        flowComponents: {
          taxRevenueUsd: 20, borrowingProceedsUsd: 10, externalCreditsUsd: 20,
          governmentSpendingUsd: 5, interestPaidUsd: 5, principalRepaymentUsd: 5, externalDebitsUsd: 5
        },
        totalInflowsUsd: 50, totalOutflowsUsd: 20, expectedClosingBalanceUsd: 130, varianceUsd: 0,
        reconciliationStatus: 'MODELLED_RECONCILED', status: 'MODELLED_RECONCILED'
      },
      ledger: []
    } } }
  };
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  assert.equal(summary.expenditure.treasuryActualExpense.status, 'NOT_ESTABLISHED');
  assert.equal(summary.expenditure.treasuryActualExpense.amount, null);
});

test('unit-backed Black Market transit is exposed separately while legal bilateral in-transit imports remain UNKNOWN', async () => {
  const state = {
    simulation: { turn: 9, session: { playerCountryId: 'BGD' } },
    population: {},
    economy: { BGD: { productionAssets: [] } },
    resource: { BGD: { inventoryLedger: [], demandRuntime: { byResource: {
      crude_oil: { pendingImportQuantity: 0, demandPerDay: 40 }
    } } } },
    trade: { BGD: { blackMarketTransits: [
      { transitId: 'BM-TRANSIT-OPEN', dealId: 'BM-DEAL-OPEN', requestId: 'REQ-BM-OPEN',
        buyerCountryId: 'BGD', sellerCountryId: 'USA', resourceId: 'crude_oil',
        quantity: 20, unit: 'tonne', route: [{ countryId: 'USA' }, { countryId: 'BGD' }],
        status: 'IN_TRANSIT', nextTurn: 10 },
      { transitId: 'BM-TRANSIT-ARRIVAL', dealId: 'BM-DEAL-ARRIVAL', requestId: 'REQ-BM-ARRIVAL',
        buyerCountryId: 'BGD', sellerCountryId: 'CAN', resourceId: 'crude_oil',
        quantity: 5, unit: 'tonne', route: [{ countryId: 'CAN' }, { countryId: 'BGD' }],
        status: 'ARRIVAL_PENDING', nextTurn: 9 },
      { transitId: 'BM-TRANSIT-SETTLED', dealId: 'BM-DEAL-SETTLED', requestId: 'REQ-BM-SETTLED',
        buyerCountryId: 'BGD', sellerCountryId: 'AUS', resourceId: 'crude_oil',
        quantity: 100, unit: 'tonne', route: [{ countryId: 'AUS' }, { countryId: 'BGD' }],
        status: 'SETTLED' }
    ] } },
    finance: { BGD: { omegaFinance: { ledger: [] } } }
  };
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const standard = summary.inTransitInternationalImports;
  assert.equal(standard.status, 'UNKNOWN');
  assert.equal(standard.quantity, null);
  assert.equal(standard.blackMarketTransit.status, 'OBSERVED_BLACK_MARKET_IN_TRANSIT');
  assert.equal(standard.blackMarketTransit.ledgerAvailable, true);
  assert.equal(standard.blackMarketTransit.shipmentCount, 2);
  assert.equal(standard.blackMarketTransit.byResource.crude_oil.quantity, 25);
  assert.equal(standard.blackMarketTransit.byResource.crude_oil.unit, 'tonne');
  assert.deepEqual(JSON.parse(JSON.stringify(standard.blackMarketTransit.byResource.crude_oil.transitIds)),
    ['BM-TRANSIT-ARRIVAL', 'BM-TRANSIT-OPEN']);
  const row = summary.nationalRequirement.byResource.crude_oil;
  assert.equal(row.inTransitInternationalImportQuantity, null,
    'Black Market subset must not be promoted to the complete legal bilateral total');
  assert.equal(row.inTransitInternationalImportStatus, 'UNKNOWN');
  assert.equal(row.blackMarketInboundShipmentQuantity, 25);
  assert.equal(row.blackMarketInboundShipmentEvidenceStatus, 'OBSERVED_BLACK_MARKET_IN_TRANSIT');
  assert.equal(summary.dataCoverage.blackMarketTransitStatus, 'OBSERVED_BLACK_MARKET_IN_TRANSIT');
  assert.equal(summary.dataCoverage.blackMarketTransitLedgerAvailable, true);
  const html = api.renderSummary(summary);
  assert.match(html, /Legal in-transit import/);
  assert.match(html, /Black Market transit subset/);
  assert.match(html, /UNKNOWN because its durable shipment ledger is not persisted/);
});

test('legacy Black Market transit without a saved unit remains partial rather than guessing a quantity unit', async () => {
  const state = {
    simulation: { turn: 9, session: { playerCountryId: 'BGD' } },
    population: {},
    economy: { BGD: { productionAssets: [] } },
    resource: { BGD: { inventoryLedger: [], demandRuntime: { byResource: {
      crude_oil: { pendingImportQuantity: 0, demandPerDay: 40 }
    } } } },
    trade: { BGD: { blackMarketTransits: [{
      transitId: 'BM-TRANSIT-LEGACY', dealId: 'BM-DEAL-LEGACY', requestId: 'REQ-BM-LEGACY',
      buyerCountryId: 'BGD', sellerCountryId: 'USA', resourceId: 'crude_oil',
      quantity: 9, route: [{ countryId: 'USA' }, { countryId: 'BGD' }],
      status: 'IN_TRANSIT', nextTurn: 10
    }] } }
  };
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const subset = summary.inTransitInternationalImports.blackMarketTransit;
  assert.equal(summary.inTransitInternationalImports.status, 'UNKNOWN');
  assert.equal(subset.status, 'PARTIAL_BLACK_MARKET_TRANSIT_EVIDENCE');
  assert.equal(subset.byResource.crude_oil.quantity, 9);
  assert.equal(subset.byResource.crude_oil.unit, null);
  assert.equal(summary.nationalRequirement.byResource.crude_oil.blackMarketInboundShipmentQuantity, 9);
  assert.equal(summary.nationalRequirement.byResource.crude_oil.blackMarketInboundShipmentEvidenceStatus,
    'PARTIAL_BLACK_MARKET_TRANSIT_EVIDENCE');
});

test('in-transit international imports remain UNKNOWN when only pending or domestic shipment evidence exists', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {}, economy: { BGD: { productionAssets: [] } },
    resource: { BGD: { inventoryLedger: [], demandRuntime: { byResource: {
      crude_oil: { pendingImportQuantity: 30, inboundShipmentQuantity: 99, demandPerDay: 40 }
    } } } },
    trade: { BGD: { pendingImportRequests: [{ quantity: 30 }], shipments: [{ quantity: 99, domestic: true }] } },
    finance: { BGD: { omegaFinance: { ledger: [] } } }
  };
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  assert.equal(summary.inTransitInternationalImports.status, 'UNKNOWN');
  assert.equal(summary.inTransitInternationalImports.quantity, null);
  assert.equal(summary.nationalRequirement.byResource.crude_oil.inTransitInternationalImportQuantity, null);
  assert.equal(summary.nationalRequirement.byResource.crude_oil.inTransitInternationalImportStatus, 'UNKNOWN');
  assert.equal(summary.nationalRequirement.byResource.crude_oil.pendingImportQuantity, 30);
});

test('missing import ledger remains unavailable instead of becoming a zero import', async () => {
  const { api } = makeHarness();
  const summary = await api.getNationalSummary('BGD');
  const row = summary.nationalRequirement.byResource.crude_oil;
  assert.equal(row.confirmedImportsThisTurn, null);
  assert.equal(row.confirmedImportEvidenceStatus, 'IMPORT_LEDGER_UNAVAILABLE');
  assert.equal(summary.confirmedImports.status, 'IMPORT_LEDGER_UNAVAILABLE');
});

test('an empty import ledger gives zero for the active country; NPCs remain static-only', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'USA' } },
    population: {},
    economy: { BGD: { productionAssets: [] }, USA: { productionAssets: [] } },
    resource: {
      BGD: { inventoryLedger: [] },
      USA: { inventoryLedger: [{ type: 'INTERNATIONAL_TRADE_IMPORT', settlementId: 'USA-IMPORT', resourceId: 'crude_oil', quantity: 50, sourceCountryId: 'SAU', turn: 7 }] }
    },
    trade: { BGD: {}, USA: {} }
  };
  const { api } = makeHarness({ state, playerCountryId: 'USA' });
  const npc = await api.getNationalSummary('BGD');
  assert.equal(npc.confirmedImports.status, 'NOT_ACTIVE_COUNTRY');
  assert.equal(npc.confirmedImports.byResource, null);
  assert.equal(npc.nationalRequirement.byResource.crude_oil.confirmedImportsThisTurn, null);
  const active = await api.getNationalSummary('USA');
  assert.equal(active.nationalRequirement.byResource.crude_oil.confirmedImportsThisTurn, 50);
  assert.equal(active.nationalRequirement.byResource.crude_oil.confirmedImportSettlementCountThisTurn, 1);
});

test('conflicting duplicate import settlements are excluded from confirmed quantities', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {},
    economy: { BGD: { productionAssets: [] } },
    resource: { BGD: { inventoryLedger: [
      { type: 'INTERNATIONAL_TRADE_IMPORT', settlementId: 'CONFLICT-1', resourceId: 'copper', quantity: 10, sourceCountryId: 'CHL', turn: 7 },
      { type: 'INTERNATIONAL_TRADE_IMPORT', settlementId: 'CONFLICT-1', resourceId: 'copper', quantity: 11, sourceCountryId: 'CHL', turn: 7 }
    ] } },
    trade: { BGD: {} }
  };
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const row = summary.nationalRequirement.byResource.copper;
  assert.equal(row.confirmedImportsThisTurn, null);
  assert.equal(row.confirmedImportKnownQuantityThisTurn, 0);
  assert.equal(row.confirmedImportEvidenceStatus, 'PARTIAL_SETTLED_IMPORT_EVIDENCE');
  assert.equal(summary.confirmedImports.status, 'PARTIAL_SETTLED_IMPORT_EVIDENCE');
  assert.equal(summary.confirmedImports.conflictingSettlementCount, 1);
});

test('a capped inventory ledger does not claim zero current-turn imports', async () => {
  const state = {
    simulation: { turn: 7, session: { playerCountryId: 'BGD' } },
    population: {},
    economy: { BGD: { productionAssets: [] } },
    resource: { BGD: { inventoryLedger: Array.from({ length: 2048 }, (_, index) => ({
      type: 'OTHER_LEDGER_ENTRY', rowId: 'ROW-' + index, turn: 7
    })) } },
    trade: { BGD: {} }
  };
  const { api } = makeHarness({ state });
  const summary = await api.getNationalSummary('BGD');
  const row = summary.nationalRequirement.byResource.crude_oil;
  assert.equal(summary.confirmedImports.ledgerMayBeTruncated, true);
  assert.equal(summary.confirmedImports.status, 'IMPORT_LEDGER_MAY_BE_TRUNCATED');
  assert.equal(row.confirmedImportsThisTurn, null);
  assert.equal(row.confirmedImportEvidenceStatus, 'IMPORT_LEDGER_MAY_BE_TRUNCATED');
});

test('overview HTML presents the national summary without claiming simulated factory units are real facilities', async () => {
  const { api } = makeHarness();
  const summary = await api.getNationalSummary('BGD');
  const html = api.renderSummary(summary);
  assert.match(html, /National Population & Industrial Capacity/);
  assert.match(html, /SIMULATION BASELINE/);
  assert.match(html, /Common daily coefficients are simulation rules/);
  assert.match(html, /Settled imports this turn/);
  assert.match(html, /does not persist a separate durable in-transit import shipment ledger/);
  assert.match(html, /Current-turn financial journal evidence/);
  assert.match(html, /In-transit international import/);
  assert.doesNotMatch(html, /real-world facility count: 100/i);
});
