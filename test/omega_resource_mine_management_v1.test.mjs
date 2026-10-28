import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(new URL('resource_industrial_catalog_v1.json', repoRoot), 'utf8'));
const canonicalSiteCatalog = JSON.parse(fs.readFileSync(new URL('resource_site_canonical_catalog_v1.json', repoRoot), 'utf8'));
const masterSiteRegistry = JSON.parse(fs.readFileSync(new URL('resource_site_master_registry_v1.json', repoRoot), 'utf8'));
const supplement = JSON.parse(fs.readFileSync(new URL('resource_site_country_mineplay_batch_20261020_v1.json', repoRoot), 'utf8'));
const expandedCoverageBatch = JSON.parse(fs.readFileSync(new URL('resource_site_country_mineplay_batch_20261024_v1.json', repoRoot), 'utf8'));
const criticalMineralsBatch = JSON.parse(fs.readFileSync(new URL('resource_site_country_mineplay_critical_batch_20261024_v1.json', repoRoot), 'utf8'));
const reserveRegistry = JSON.parse(fs.readFileSync(new URL('resource_site_reserve_simulation_v1.json', repoRoot), 'utf8'));
const legacySiteRegistries = [1,2,3,4,5,6].map(n =>
  JSON.parse(fs.readFileSync(new URL('resource_site_legacy_gameplay_expansion_part_' + n + '_v1.json', repoRoot), 'utf8'))
);
const expandedSiteRegistries = [1,2,3,4].map(n =>
  JSON.parse(fs.readFileSync(new URL('resource_site_reference_expanded_part_' + String(n).padStart(2,'0') + '.json', repoRoot), 'utf8'))
);
const industrialSource = fs.readFileSync(new URL('omega_resource_industrial_network_v1.js', repoRoot), 'utf8');
const endowmentSource = fs.readFileSync(new URL('omega_resource_endowment_runtime.js', repoRoot), 'utf8');
const economySource = fs.readFileSync(new URL('omega_resource_economy_runtime_v2.js', repoRoot), 'utf8');
const financeSource = fs.readFileSync(new URL('omega_finance_ministry_runtime_v1.js', repoRoot), 'utf8');
const integritySource = fs.readFileSync(new URL('omega_resource_site_integrity_v1.js', repoRoot), 'utf8');
const bindingSource = fs.readFileSync(new URL('omega_resource_gameplay_binding_v1.js', repoRoot), 'utf8');
const uiSource = fs.readFileSync(new URL('omega_resource_mine_management_v1.js', repoRoot), 'utf8');
const indexSource = fs.readFileSync(new URL('index.html', repoRoot), 'utf8');
const serviceWorkerSource = fs.readFileSync(new URL('omega-offline-map-sw.js', repoRoot), 'utf8');

function fixture(overrides = {}) {
  const materials = {
    iron_ore: 50000,
    copper: 5000,
    limestone: 50000,
    coal: 50000,
    crude_oil: 5000,
    construction_aggregate: 50000,
    cement: 50000,
    steel: 50000,
    alloy_steel: 50000,
    industrial_machinery: 50000,
    grid_equipment: 50000,
    industrial_chemicals: 50000,
    industrial_gases: 50000,
    polymer_resin: 50000,
    recycled_feedstock: 50000
  };
  const resource = {
    BWA: {
      inventory: { ...materials },
      warehouse: { warehouseId: 'WH-BWA-RAW', countryId: 'BWA', availableByResource: { ...materials }, reservedByResource: {} },
      batches: [], inventoryLots: {}, technologyCapabilities: [], mineAssets: [],
      industrialNetwork: { projects: [], shipments: [], reservations: {}, deliveries: [], siteFlowLedger: [], infrastructure: { nodes: {}, edges: {}, corridors: {} }, events: [], factoryRuntime: {}, technologyContracts: [] }
    }
  };
  const gameState = {
    simulation: { turn: 1, startYear: 2020, date: '2020-01-01', daysPerTurn: 30, session: { playerCountryId: 'BWA' } },
    resource,
    economy: { BWA: { productionAssets: [] } },
    finance: { BWA: { available: 500000000 } },
    transport: { BWA: { infrastructure: { roads: { capacityPerDay: 30000, quality: 0.8 }, rail: { capacityPerDay: 80000, quality: 0.7 }, ports: { capacityPerDay: 100000, quality: 0.8 }, bridges: { capacityPerDay: 40000, quality: 0.7 }, pipelines: { capacityPerDay: 200000, quality: 0.7 } } } }
  };
  const site = {
    siteId: 'SITE_BWA_TEST_GOLD_MINE',
    countryId: 'BWA',
    siteName: 'Test Gold Mine',
    siteType: 'OPEN_PIT_GOLD_MINE',
    real: { resourceId: 'gold' },
    identity: { countryIso3: 'BWA', resourceTypeId: 'gold', resourceName: 'Gold', siteType: 'OPEN_PIT_GOLD_MINE' },
    location: { coordinates: { lat: -21.2, lng: 25.5 }, coordinatePrecision: 'REGIONAL_APPROXIMATION' },
    operation: { status: 'OPERATING', commercialExtraction: true, extractionMethod: 'OPEN_PIT_DRILL_BLAST' },
    sourceSiteRecord: { id: 'SITE_BWA_TEST_GOLD_MINE', siteId: 'SITE_BWA_TEST_GOLD_MINE', countryCode: 'BWA', resourceId: 'gold', commercialExtraction: true, status: 'OPERATING' },
    quantitative: { reserve: { quantity: null, unit: 'TONNES_ORE', status: 'UNOBSERVED' } },
    map: { markerEligible: true, countryIsolationKey: 'BWA' },
    runtime: { identityAuthority: 'TEST_FIXTURE' },
    simulation: { simulationOnly: true, transportRoute: [] }
  };
  const events = [];
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, WeakMap, JSON, Date, Promise, Intl,
    OmegaResourceIndustrialCatalogData: catalog,
    OmegaResourceSiteMasterResearchData: { siteCount: 1, sites: [site] },
    OmegaResourceSiteCanonicalCatalogData: { datasetId: 'TEST_SITE_CATALOG', sites: [site] },
    Game: { state: gameState },
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail || {}; } },
    dispatchEvent(event) { events.push(event); return true; },
    addEventListener() {},
    Omega: {
      MinistryInteroperability: { emitEvent(type, countryId, source, detail, meta) { events.push({ type, countryId, source, detail, meta }); return true; } }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(industrialSource, ctx, { filename: 'omega_resource_industrial_network_v1.js' });
  ctx.Game.state = {
    ...gameState,
    resource: { ...gameState.resource, ...(overrides.resource || {}) },
    finance: overrides.finance || gameState.finance
  };
  return { ctx, state: ctx.Game.state, events, site };
}

test('supplemental dataset adds valid, distinct sites without pretending simulated reserve/production is observed', () => {
  assert.equal(supplement.datasetId, 'OMEGA_RESOURCE_SITE_COUNTRY_MINEPLAY_BATCH_V1');
  assert.equal(supplement.recordCount, supplement.records.length);
  assert.equal(supplement.records.length, 44);
  assert.ok(supplement.countryCount >= 20);
  assert.ok(supplement.records.filter(x => x.countryId === 'BWA').length >= 4);
  for (const country of ['GIN','COD','IDN','MNG','PER','MRT','BFA','UZB','KAZ','DZA','CIV','PNG']) {
    assert.ok(supplement.records.some(x => x.countryId === country), 'missing expanded country ' + country);
  }
  assert.equal(new Set(supplement.records.map(x => x.siteId)).size, supplement.records.length);
  const existingIds = new Set([
    ...reserveRegistry.records.map(x => x.siteId),
    ...legacySiteRegistries.flatMap(pack => (pack.records || []).map(x => x.siteId)),
    ...expandedSiteRegistries.flatMap(pack => (pack.records || []).map(x => x.siteId))
  ].filter(Boolean));
  assert.deepEqual(supplement.records.filter(x => existingIds.has(x.siteId)).map(x => x.siteId), [],
    'the additive site batch must not duplicate identities in authoritative reserve, expanded site parts, or any legacy map/gameplay pack');
  for (const row of supplement.records) {
    assert.match(row.countryId, /^[A-Z]{3}$/);
    assert.ok(row.location.coordinates.lat >= -90 && row.location.coordinates.lat <= 90);
    assert.ok(row.location.coordinates.lng >= -180 && row.location.coordinates.lng <= 180);
    assert.ok(['UNOBSERVED', 'REPORTED'].includes(row.quantitative.reserve.status),
      'quantitative reserve evidence must distinguish unobserved from source-reported values');
    assert.ok(['UNOBSERVED', 'REPORTED'].includes(row.quantitative.production.status),
      'quantitative production evidence must distinguish unobserved from source-reported values');
    assert.notEqual(row.quantitative.reserve.status, 'SIMULATED',
      'scenario reserve must never be promoted into an observed reserve');
    assert.notEqual(row.quantitative.production.status, 'SIMULATED',
      'scenario output must never be promoted into observed production');
    if (row.quantitative.reserve.status === 'REPORTED' || row.quantitative.production.status === 'REPORTED') {
      assert.ok(row.quantitative.quantitativeProvenance?.sourceUrls?.length,
        'every source-reported quantitative metric must retain provenance URLs');
      assert.equal(row.quantitative.quantitativeProvenance?.simulatedReserveSeparate, true,
        'source-reported values and simulated gameplay reserve must remain separate');
    }
    assert.equal(row.reserve.status, 'SIMULATED');
    assert.equal(row.simulation.reserve.status, 'SIMULATED');
    assert.ok(Array.isArray(row.sources) && row.sources.some(source => /^https?:\/\//.test(source.url)));
    assert.ok(row.operation.realWorldStatus || row.operation.status);
  }
});

test('supplemental records pass the canonical resource site integrity contract', () => {
  const ctx = { console, Math, Number, String, Object, Array, Set, Map, WeakMap, JSON, Date, Intl };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(integritySource, ctx, { filename: 'omega_resource_site_integrity_v1.js' });
  const api = ctx.Omega?.ResourceSiteIntegrity || ctx.OmegaResourceSiteIntegrity;
  assert.ok(api && typeof api.auditRegistry === 'function', 'site integrity API must be loadable');
  const report = api.auditRegistry(supplement.records, {});
  assert.equal(report.status, 'PASS', JSON.stringify(report.errors.slice(0, 10)));
  assert.equal(report.siteCount, supplement.records.length);
});


test('global mine coverage batch contains 108 complete records across 36 countries with duplicate sites safely aliased', () => {
  assert.equal(expandedCoverageBatch.datasetId, 'OMEGA_RESOURCE_SITE_COUNTRY_MINEPLAY_BATCH_V1');
  assert.equal(expandedCoverageBatch.batchId, 'COUNTRY_MINEPLAY_GLOBAL_COVERAGE_20261024');
  assert.equal(expandedCoverageBatch.recordCount, 108);
  assert.equal(expandedCoverageBatch.records.length, 108);
  assert.equal(expandedCoverageBatch.countryCount, 36);
  assert.ok(bindingSource.includes('resource_site_country_mineplay_batch_20261024_v1.json'), 'map/gameplay binding must load the added batch');
  assert.ok(endowmentSource.includes('resource_site_country_mineplay_batch_20261024_v1.json'), 'endowment/runtime must load the added batch');
  assert.ok(serviceWorkerSource.includes('resource_site_country_mineplay_batch_20261024_v1.json'), 'new batch must be cached for offline use');
  assert.equal(new Set(expandedCoverageBatch.records.map(x => x.siteId)).size, 108);
  const aliasTargets = { SITE_PRK_musan_iron_ore_mine: 'SITE_PRK_musan_iron_mine' };
  assert.equal(expandedCoverageBatch.records.filter(x => !aliasTargets[x.siteId]).length, 107, 'one same-coordinate Musan record is retained for audit but aliases the existing physical mine');
  const normalize = v => String(v ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const country = row => String(row?.countryId || row?.identity?.countryIso3 || row?.location?.countryBoundaryKey || '').toUpperCase();
  const resource = row => String(row?.resourceId || row?.identity?.resourceTypeId || '').toLowerCase();
  const name = row => normalize(row?.siteName || row?.name);
  const coord = row => { const c = row?.location?.coordinates || {}; return Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)) ? {lat:Number(c.lat),lng:Number(c.lng)} : null; };
  const distanceKm = (a,b) => { const rad = Math.PI/180, dl=(b.lat-a.lat)*rad, dg=(b.lng-a.lng)*rad, la=a.lat*rad, lb=b.lat*rad, h=Math.sin(dl/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dg/2)**2; return 6371*2*Math.asin(Math.min(1,Math.sqrt(h))); };
  const allExisting = [
    ...(canonicalSiteCatalog.sites || []), ...(masterSiteRegistry.sites || []),
    ...reserveRegistry.records, ...supplement.records,
    ...legacySiteRegistries.flatMap(x => x.records || []),
    ...expandedSiteRegistries.flatMap(x => x.sites || [])
  ];
  const existingIds = new Set(allExisting.map(x => String(x?.siteId || '')).filter(Boolean));
  const existingNames = new Set(allExisting.map(x => country(x) + '|' + name(x)).filter(x => !x.endsWith('|')));
  for (const sourceRow of expandedCoverageBatch.records) {
    const target = aliasTargets[sourceRow.siteId] || null;
    const row = target ? {
      ...sourceRow,
      operation: { ...(sourceRow.operation || {}), commercialExtraction: false },
      map: { ...(sourceRow.map || {}), markerEligible: false, aliasOfSiteId: target },
      runtime: { ...(sourceRow.runtime || {}), aliasOfSiteId: target }
    } : sourceRow;
    assert.ok(row.siteId && /^SITE_[A-Z]{3}_[a-z0-9_]+$/.test(row.siteId), row.siteId + ': stable site ID');
    assert.equal(existingIds.has(row.siteId), false, row.siteId + ': duplicate ID in existing registries');
    assert.equal(existingNames.has(country(row) + '|' + name(row)), false, row.siteId + ': duplicate country/site name');
    assert.equal(row.identity.countryIso3, row.countryId, row.siteId + ': country identity');
    assert.equal(row.identity.resourceTypeId, row.resourceId, row.siteId + ': resource identity');
    assert.equal(row.location.countryBoundaryKey, row.countryId, row.siteId + ': country boundary');
    assert.equal(row.map.countryIsolationKey, row.countryId, row.siteId + ': country isolation');
    if (target) {
      assert.equal(row.map.markerEligible, false, row.siteId + ': duplicate reference must not create a second marker');
      assert.equal(row.map.aliasOfSiteId, target, row.siteId + ': duplicate reference points to its canonical physical mine');
      assert.equal(row.runtime.aliasOfSiteId, target, row.siteId + ': runtime alias target');
      assert.equal(row.operation.commercialExtraction, false, row.siteId + ': duplicate alias cannot execute a second extraction');
      assert.ok(existingIds.has(target), row.siteId + ': canonical mine exists in current registries');
      continue;
    }
    assert.equal(row.map.markerEligible, true, row.siteId + ': map marker must be eligible');
    assert.equal(row.operation.status, 'SIMULATED_OPERATIONAL_SCENARIO');
    assert.equal(row.operation.operationalStatus, 'SIMULATED_ACTIVE');
    assert.equal(row.operation.commercialExtraction, true);
    assert.equal(row.operation.siteCommissioningLevel, 5);
    assert.equal(row.operation.gameplayConstructionAllowed, true);
    assert.equal(row.runtime.requiresSiteSpecificRoute, true);
    assert.equal(row.runtime.requiresFactoryBinding, true);
    assert.equal(row.logistics.warehouseCountryId, row.countryId);
    assert.equal(row.logistics.transport.originSiteId, row.siteId);
    assert.equal(row.logistics.transport.originCountryId, row.countryId);
    assert.equal(row.logistics.transport.destinationCountryId, row.countryId);
    assert.equal(row.logistics.transport.warehouseId, 'WH-' + row.countryId + '-RAW');
    assert.equal(row.simulation.factoryBinding.countryId, row.countryId);
    assert.equal(row.simulation.factoryBinding.inputResourceId, row.resourceId);
    assert.equal(row.simulation.factoryBinding.status, 'SIMULATED_READY');
    assert.ok(row.simulation.factoryBinding.factoryId);
    assert.ok(row.simulation.transportRoute.length > 0);
    assert.ok(row.processing.refinedOutputs.length > 0);
    assert.ok(catalog.resourceRules[row.resourceId], row.siteId + ': extraction rule');
    assert.ok(catalog.processingRules[row.resourceId], row.siteId + ': processing rule');
    const q = row.quantitative;
    for (const field of ['reserve','production','grade','recovery','throughput','purity','capacity']) {
      assert.equal(q[field].status, 'SIMULATED', row.siteId + ': ' + field + ' must not be presented as observed');
      assert.equal(q.completeness[field], 'SIMULATED', row.siteId + ': ' + field + ' coverage');
    }
    assert.ok(q.reserve.quantity > 0);
    assert.equal(q.production.annual, q.production.rate * 365);
    assert.equal(q.reserve.quantity, q.production.annual * 400);
    assert.ok(q.production.rate > 0 && q.production.annual > 0);
    assert.ok(q.grade.value > 0 && q.recovery.value > 0 && q.recovery.value <= 100);
    assert.ok(q.throughput.value > 0 && q.purity.value > 0 && q.purity.value <= 100);
    assert.ok(q.capacity.minimum > 0 && q.capacity.minimum <= q.capacity.nominal && q.capacity.nominal <= q.capacity.maximum);
    assert.equal(q.quantitativeProvenance.authority, 'SCENARIO_SIMULATION_DATA');
    assert.equal(q.quantitativeProvenance.gameplayHorizonYears, 400);
    assert.equal(q.quantitativeProvenance.realWorldDataRequired, false);
    assert.equal(q.completeness.overall, 'GAMEPLAY_SIMULATION_COMPLETE');
    assert.deepEqual(row.observedFacts, []);
    assert.ok(row.sources.some(source => String(source.url).startsWith('https://') || String(source.url).startsWith('http://')), row.siteId + ': identity/source URL');
    assert.equal(row.sourceReference.facts.measuredReservePromoted, false);
    assert.equal(row.sourceReference.facts.measuredProductionPromoted, false);
    assert.equal(row.sourceReference.facts.quantitativeValuesAreSimulated, true);
    const pt = coord(row);
    assert.ok(pt && Math.abs(pt.lat) <= 90 && Math.abs(pt.lng) <= 180);
    for (const old of allExisting) {
      if (country(old) !== country(row) || resource(old) !== resource(row)) continue;
      const oldPt = coord(old);
      if (oldPt) assert.ok(distanceKm(pt, oldPt) >= 2, row.siteId + ': possible same-commodity duplicate of ' + old.siteId);
    }
  }
  const integrityContext = { console, Math, Number, String, Object, Array, Set, Map, WeakMap, JSON, Date, Intl };
  integrityContext.globalThis = integrityContext;
  vm.createContext(integrityContext);
  vm.runInContext(integritySource, integrityContext, { filename: 'omega_resource_site_integrity_v1.js' });
  const api = integrityContext.Omega?.ResourceSiteIntegrity || integrityContext.OmegaResourceSiteIntegrity;
  assert.ok(api && typeof api.auditRegistry === 'function');
  const auditRows = expandedCoverageBatch.records.map(sourceRow => {
    const target = aliasTargets[sourceRow.siteId];
    return target ? {
      ...sourceRow,
      operation: { ...(sourceRow.operation || {}), commercialExtraction: false },
      map: { ...(sourceRow.map || {}), markerEligible: false, aliasOfSiteId: target },
      runtime: { ...(sourceRow.runtime || {}), aliasOfSiteId: target }
    } : sourceRow;
  });
  const audit = api.auditRegistry(auditRows, {
    aliasMap: aliasTargets,
    allowExternalAliasTargets: new Set(Object.values(aliasTargets))
  });
  assert.equal(audit.status, 'PASS', JSON.stringify(audit.errors.slice(0, 12)));
  assert.equal(audit.siteCount, 108);
});

test('niobium and ruby have extraction and processing rules', () => {
  for (const id of ['niobium', 'ruby']) {
    assert.ok(catalog.resourceRules[id], id + ' extraction rule missing');
    assert.ok(catalog.processingRules[id], id + ' processing rule missing');
    assert.equal(catalog.processingRules[id].inputs[id], 1);
    assert.ok(Object.keys(catalog.processingRules[id].outputs).length > 0);
  }
});

test('factory output follows inventory, economy offer, and confirmed fiscal/treasury event wiring', () => {
  assert.match(industrialSource, /OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE/);
  assert.match(industrialSource, /OMEGA_RESOURCE_FINISHED_GOODS_ECONOMY_REGISTERED/);
  assert.match(industrialSource, /OMEGA_RESOURCE_DOMESTIC_SALE_SETTLED/);
  assert.match(industrialSource, /OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED/);
  assert.match(industrialSource, /OMEGA_RESOURCE_TRADE_RECONCILED/);
  assert.match(economySource, /function finishedGoodsEventHandler/);
  assert.match(economySource, /publishOffers\(c\)/);
  assert.match(economySource, /g\.addEventListener\('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',finishedGoodsEventHandler\)/);
  assert.match(economySource, /g\.addEventListener\('OMEGA_TRADE_SETTLEMENT_COMPLETED',fiscalizeTrade\)/);
  assert.match(economySource, /OMEGA_RESOURCE_ECON_FISCAL_RECEIPT/);
  assert.match(financeSource, /financeBucketFor/);
  assert.match(financeSource, /treasuryBalanceUsd/);
  assert.match(economySource, /OMEGA_RESOURCE_TRADE_RECONCILED/);
});

test('mine construction quote details costs, staffing and each material shortfall', () => {
  const { ctx, state } = fixture();
  const api = ctx.Omega.ResourceIndustrialNetwork;
  const quote = api.quoteMineProject({ countryId: 'BWA', siteId: 'SITE_BWA_TEST_GOLD_MINE', resourceId: 'gold', assignedWorkers: 1000 });
  assert.equal(quote.status, 'QUOTED');
  assert.equal(quote.countryId, 'BWA');
  assert.ok(quote.costUsd > 0);
  assert.ok(quote.durationDays > 0);
  assert.ok(quote.workersRequired > 0);
  assert.ok(quote.materials.length >= 6);
  assert.equal(quote.treasury.available, 500000000);
  assert.equal(quote.materialsReady, true);
  assert.equal(quote.staffingReady, true);
  assert.equal(quote.ready, true);

  state.resource.BWA.inventory.iron_ore = 0;
  const blocked = api.quoteMineProject({ countryId: 'BWA', siteId: 'SITE_BWA_TEST_GOLD_MINE', resourceId: 'gold', assignedWorkers: 1000 });
  assert.equal(blocked.status, 'QUOTED');
  assert.equal(blocked.ready, false);
  assert.ok(blocked.materials.find(x => x.resourceId === 'iron_ore').shortfall > 0);
});

test('mine construction commits treasury/materials once, deduplicates request and commissions on game turns', () => {
  const { ctx, state, events } = fixture();
  const api = ctx.Omega.ResourceIndustrialNetwork;
  const originalCash = state.finance.BWA.available;
  const originalIron = state.resource.BWA.inventory.iron_ore;
  const originalWarehouseIron = state.resource.BWA.warehouse.availableByResource.iron_ore;
  const input = { countryId: 'BWA', siteId: 'SITE_BWA_TEST_GOLD_MINE', resourceId: 'gold', assignedWorkers: 1000, requestId: 'TEST-MINE-REQUEST-001' };
  const project = api.startMineProject(input);
  assert.equal(project.status, 'UNDER_CONSTRUCTION');
  assert.equal(project.remainingDays, project.durationDays, 'new mine projects begin with their full day countdown');
  assert.ok(project.expectedCompletionDate, 'construction records a game-calendar completion date');
  assert.equal(project.treasuryStatus, 'DEBITED');
  assert.equal(project.constructionMaterialsStatus, 'CONSUMED');
  assert.equal(state.finance.BWA.available, originalCash - project.costUsd);
  assert.ok(state.resource.BWA.inventory.iron_ore < originalIron);
  assert.equal(state.resource.BWA.warehouse.availableByResource.iron_ore, originalWarehouseIron - project.materialsRequired.find(x => x.resourceId === 'iron_ore').quantity);
  const second = api.startMineProject(input);
  assert.equal(second.projectId, project.projectId);
  assert.equal(second.idempotent, true);
  assert.equal(state.finance.BWA.available, originalCash - project.costUsd);
  assert.equal(state.resource.BWA.industrialNetwork.projects.filter(x => x.projectType === 'MINE_CONSTRUCTION').length, 1);
  assert.equal(state.resource.BWA.mineConstructionLedger.filter(x => x.transactionId === project.treasuryTransactionId).length, 1);

  for (let i = 1; i <= Math.ceil(project.durationDays / 30); i++) {
    state.simulation.turn = i;
    api.advanceProjects('BWA');
    const persisted = state.resource.BWA.industrialNetwork.projects.find(x => x.projectId === project.projectId);
    assert.equal(persisted.remainingDays, Math.max(0, project.durationDays - persisted.progressDays), 'countdown tracks authoritative progress');
  }
  const completed = state.resource.BWA.industrialNetwork.projects.find(x => x.projectId === project.projectId);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.remainingDays, 0, 'completed construction has no remaining days');
  assert.equal(completed.progressPct, 1, 'completed construction reaches full progress');
  assert.equal(completed.assetStatus, 'OPERATIONAL');
  const mine = state.resource.BWA.mineAssets.find(x => x.mineId === project.mineId);
  assert.ok(mine);
  assert.equal(mine.status, 'OPERATIONAL');
  assert.equal(mine.siteId, project.siteId);
  assert.equal(mine.constructionCostUsd, project.costUsd);
  assert.ok(events.some(x => (x.type === 'OMEGA_RESOURCE_MINE_COMMISSIONED') || (x.detail?.eventType === 'OMEGA_RESOURCE_MINE_COMMISSIONED')));
});

test('mine construction resolves synchronized finance-model cash without losing the canonical balance', () => {
  const { ctx, state } = fixture();
  const api = ctx.Omega.ResourceIndustrialNetwork;
  state.finance.BWA.omegaFinance = {
    treasuryBalanceUsd: 420000000,
    lastSyncedTreasuryBalanceUsd: 420000000,
    currentYearSpendingUsd: 0,
    cumulativeSpendingUsd: 0,
    revision: 0,
    ledger: []
  };
  state.economy.BWA.treasury = 420000000;
  delete state.finance.BWA.available;
  const quote = api.quoteMineProject({
    countryId: 'BWA', siteId: 'SITE_BWA_TEST_GOLD_MINE', resourceId: 'gold', assignedWorkers: 1000
  });
  assert.equal(quote.status, 'QUOTED');
  assert.equal(quote.treasury.available, 420000000);
  assert.equal(quote.treasury.source, 'state.finance.BWA.omegaFinance.treasuryBalanceUsd');
  assert.equal(quote.ready, true);
  const project = api.startMineProject({
    countryId: 'BWA', siteId: 'SITE_BWA_TEST_GOLD_MINE', resourceId: 'gold',
    assignedWorkers: 1000, requestId: 'FINANCE-FALLBACK-MINE-001'
  });
  assert.equal(project.status, 'UNDER_CONSTRUCTION');
  assert.equal(state.finance.BWA.available, 420000000 - project.costUsd);
  assert.equal(state.finance.BWA.omegaFinance.treasuryBalanceUsd, 420000000 - project.costUsd);
  assert.equal(state.finance.BWA.omegaFinance.lastSyncedTreasuryBalanceUsd, 420000000 - project.costUsd);
  assert.equal(state.economy.BWA.treasury, 420000000 - project.costUsd);
  assert.equal(state.finance.BWA.omegaFinance.ledger.filter(x => x.action === 'MINE_CONSTRUCTION_PAYMENT').length, 1);
});

test('mine construction blocks without changing ledgers when treasury, materials or workforce is insufficient', () => {
  const { ctx, state } = fixture();
  const api = ctx.Omega.ResourceIndustrialNetwork;
  state.finance.BWA.available = 1;
  const noCash = api.startMineProject({ countryId: 'BWA', siteId: 'SITE_BWA_TEST_GOLD_MINE', resourceId: 'gold', assignedWorkers: 1000, requestId: 'NO-CASH' });
  assert.equal(noCash.status, 'BLOCKED');
  assert.equal(noCash.reason, 'INSUFFICIENT_TREASURY');
  assert.equal(state.resource.BWA.mineConstructionLedger, undefined);
  assert.equal(state.resource.BWA.inventory.iron_ore, 50000);

  state.finance.BWA.available = 500000000;
  state.resource.BWA.inventory.iron_ore = 0;
  const noMaterials = api.startMineProject({ countryId: 'BWA', siteId: 'SITE_BWA_TEST_GOLD_MINE', resourceId: 'gold', assignedWorkers: 1000, requestId: 'NO-MATERIALS' });
  assert.equal(noMaterials.status, 'BLOCKED');
  assert.equal(noMaterials.reason, 'INSUFFICIENT_CONSTRUCTION_MATERIALS');
  assert.equal(state.finance.BWA.available, 500000000);
  assert.equal(state.resource.BWA.warehouse.availableByResource.iron_ore, 50000);

  const noWorkers = api.startMineProject({ countryId: 'BWA', siteId: 'SITE_BWA_TEST_GOLD_MINE', resourceId: 'gold', assignedWorkers: 1, requestId: 'NO-WORKERS' });
  assert.equal(noWorkers.status, 'BLOCKED');
  assert.equal(noWorkers.reason, 'INSUFFICIENT_WORKER_COMMITMENT');
  assert.equal(state.finance.BWA.available, 500000000);
});


test('batch mine construction scales materials, capex and workers, then commissions unique mine assets', () => {
  const { ctx, state, site } = fixture();
  const api = ctx.Omega.ResourceIndustrialNetwork;
  const one = api.quoteMineProject({ countryId:'BWA', siteId:'SITE_BWA_TEST_GOLD_MINE', resourceId:'gold', quantity:1, assignedWorkers:1000000000 });
  const two = api.quoteMineProject({ countryId:'BWA', siteId:'SITE_BWA_TEST_GOLD_MINE', resourceId:'gold', quantity:2, assignedWorkers:1000000000 });
  assert.equal(one.status, 'QUOTED');
  assert.equal(two.status, 'QUOTED');
  assert.equal(two.assetCount, 2);
  assert.equal(two.costUsd, one.costUsd * 2);
  assert.equal(two.workersRequired, one.workersRequired * 2);

  const uraniumSite = {
    ...site,
    siteId: 'SITE_BWA_TEST_URANIUM_MINE',
    siteName: 'Test Uranium Mine',
    siteType: 'UNDERGROUND_URANIUM_MINE',
    real: { resourceId: 'uranium' },
    identity: { ...site.identity, resourceTypeId: 'uranium', resourceName: 'Uranium', siteType: 'UNDERGROUND_URANIUM_MINE' },
    operation: { ...site.operation, extractionMethod: 'UNDERGROUND_LONGWALL' },
    sourceSiteRecord: { ...site.sourceSiteRecord, id: 'SITE_BWA_TEST_URANIUM_MINE', siteId: 'SITE_BWA_TEST_URANIUM_MINE', resourceId: 'uranium', siteType: 'UNDERGROUND_URANIUM_MINE', extractionMethod: 'UNDERGROUND_LONGWALL' }
  };
  ctx.OmegaResourceSiteMasterResearchData.sites.push(uraniumSite);
  ctx.OmegaResourceSiteCanonicalCatalogData.sites.push(uraniumSite);
  const uraniumQuote = api.quoteMineProject({
    countryId: 'BWA', siteId: uraniumSite.siteId, resourceId: 'uranium', quantity: 1, assignedWorkers: 1000000000
  });
  assert.equal(uraniumQuote.status, 'QUOTED');
  assert.equal(uraniumQuote.buildClass, 'UNDERGROUND');
  assert.equal(uraniumQuote.durationDays, 345);
  assert.equal(uraniumQuote.workersRequired, 1008, 'precision-safe rounding must not turn exactly 900 × 1.12 into 1009 workers');

  for (const material of one.materials) {
    const batchMaterial = two.materials.find(row => row.resourceId === material.resourceId);
    assert.ok(batchMaterial, 'batch quote retains material ' + material.resourceId);
    assert.equal(batchMaterial.required, material.required * 2, 'quantity scales material ' + material.resourceId);
  }

  const project = api.startMineProject({
    countryId:'BWA',siteId:'SITE_BWA_TEST_GOLD_MINE',resourceId:'gold',quantity:2,
    assignedWorkers:two.workersRequired,requestId:'BATCH-MINE-COUNT-2'
  });
  assert.equal(project.status, 'UNDER_CONSTRUCTION');
  assert.equal(project.assetCount, 2);
  assert.equal(project.workersRequired, two.workersRequired);
  for (let i = 1; i <= Math.ceil(project.durationDays / 30); i++) {
    state.simulation.turn = i;
    api.advanceProjects('BWA');
  }
  const mines = state.resource.BWA.mineAssets.filter(row => row.siteId === project.siteId && row.status === 'OPERATIONAL');
  assert.equal(mines.length, 2);
  assert.equal(new Set(mines.map(row => row.mineId)).size, 2);
  assert.ok(mines.every(row => row.workersRequired === two.workersRequired / 2));
  const completed = state.resource.BWA.industrialNetwork.projects.find(row => row.projectId === project.projectId);
  assert.ok(completed, 'completed construction project remains in the persistent project ledger');
  assert.equal(completed.commissionedMineIds.length, 2);
});

test('mine pause, resume and confirmed demolition update runtime status while preserving audit and recoverable waste', () => {
  const { ctx, state } = fixture();
  const api = ctx.Omega.ResourceIndustrialNetwork;
  const project = api.startMineProject({
    countryId:'BWA',siteId:'SITE_BWA_TEST_GOLD_MINE',resourceId:'gold',quantity:1,
    assignedWorkers:1000,requestId:'MINE-STOP-RESUME-DEMOLISH'
  });
  assert.equal(project.status, 'UNDER_CONSTRUCTION');
  for (let i = 1; i <= Math.ceil(project.durationDays / 30); i++) {
    state.simulation.turn = i;
    api.advanceProjects('BWA');
  }
  const mine = state.resource.BWA.mineAssets.find(row => row.mineId === project.mineId);
  assert.ok(mine);
  const stopped = api.setMineOperatingStatus({countryId:'BWA',siteId:project.siteId,mineId:mine.mineId,quantity:1,status:'STOPPED'});
  assert.equal(stopped.status, 'APPLIED');
  assert.equal(mine.status, 'STOPPED');

  const resumed = api.setMineOperatingStatus({countryId:'BWA',siteId:project.siteId,mineId:mine.mineId,quantity:1,status:'OPERATIONAL'});
  assert.equal(resumed.status, 'APPLIED');
  assert.equal(mine.status, 'OPERATIONAL');

  const quote = api.quoteMineDemolition({countryId:'BWA',siteId:project.siteId,mineId:mine.mineId,quantity:1});
  assert.equal(quote.status, 'QUOTED');
  assert.equal(quote.jobsLost, mine.workersRequired);
  assert.equal(quote.requiresExplicitConfirmation, true);
  const noConfirmation = api.destroyMineAssets({countryId:'BWA',siteId:project.siteId,mineId:mine.mineId,quantity:1});
  assert.equal(noConfirmation.status, 'CONFIRMATION_REQUIRED');
  assert.equal(mine.status, 'OPERATIONAL');

  const destroyed = api.destroyMineAssets({countryId:'BWA',siteId:project.siteId,mineId:mine.mineId,quantity:1,confirmed:true});
  assert.equal(destroyed.status, 'DESTROYED');
  assert.equal(destroyed.quantity, 1);
  assert.equal(destroyed.jobsLost, mine.workersRequired);
  assert.equal(mine.status, 'DESTROYED');
  assert.equal(mine.productionStatus, 'STOPPED');
  assert.ok(Object.keys(destroyed.wasteOutputs).length > 0);
  assert.ok(state.resource.BWA.batches.some(row => String(row.batchId).startsWith('MINE-DEMO-WASTE:')));
  assert.equal(state.resource.BWA.industrialNetwork.mineDemolitionHistory.length, 1);
  assert.equal(state.resource.BWA.mineAssets.length, 1, 'historical asset row remains for audit; it is no longer operational');
});


test('mine project rejects cross-country identity and player-only actions require explicit scope check in UI', () => {
  const { ctx, state } = fixture();
  const api = ctx.Omega.ResourceIndustrialNetwork;
  assert.equal(api.quoteMineProject({ countryId: 'ZWE', siteId: 'SITE_BWA_TEST_GOLD_MINE', resourceId: 'gold', assignedWorkers: 1000 }).reason, 'COUNTRY_SITE_BOUNDARY_VIOLATION');
  assert.match(uiSource, /country!==playerCountry\(\)/);
  assert.match(uiSource, /startMineProject/);
  assert.match(uiSource, /quoteMineProject/);
  assert.match(uiSource, /My Mines/);
  assert.match(uiSource, /data-omega-mine-entry="my-mines"/);
  assert.match(uiSource, /setAttribute\('data-omega-mine-entry','mines'\)/);
  assert.match(uiSource, /function stationDirectory/);
  assert.match(uiSource, /action==='run-factory'/);
  assert.match(uiSource, /executeFactoryCycle/);
  assert.match(uiSource, /<svg/);
  assert.match(uiSource, /omm-mine-flip/);
  assert.ok(uiSource.includes('.omm-mine-flip.is-flipped .omm-flip-inner{transform:rotateY(180deg)}'), 'flipped card must rotate the 3D card stack');
  assert.ok(uiSource.includes('overflow:visible;backface-visibility:hidden;'), '3D faces must not flatten the card with a scrolling overflow context');
  assert.ok(uiSource.includes('.omm-action-panel{max-height:calc(100% - 4px);overflow:auto;'), 'long build data must scroll inside the panel without breaking 3D flipping');
  assert.match(uiSource, /data-omm-build-count/);
  assert.match(uiSource, /data-omm-build-workers/);
  assert.match(uiSource, /OMEGA_RESOURCE_MINE_PROJECT_PROGRESS/);
  assert.match(uiSource, /days remaining/);
  assert.match(uiSource, /function updateBuildPreview/);
  assert.match(uiSource, /quoteMineDemolition/);
  assert.match(uiSource, /destroyMineAssets/);
  assert.match(uiSource, /setMineOperatingStatus/);
  assert.match(uiSource, /omm-confirm-dialog/);
  assert.doesNotMatch(uiSource, /data-omm-workers/);
  assert.doesNotMatch(uiSource, /data-omm-action="decommission-mine"/);
  assert.match(indexSource, /omega_resource_mine_management_v1\.js/);
  assert.match(fs.readFileSync(new URL('server.js', repoRoot), 'utf8'), /RESOURCE_MINE_MANAGEMENT_SCRIPT/);
  assert.match(serviceWorkerSource, /omega-offline-atlas-shell-v\d+/);
  assert.match(serviceWorkerSource, /\.\/omega_resource_mine_management_v1\.js/);
  assert.match(serviceWorkerSource, /\.\/resource_site_country_mineplay_batch_20261020_v1\.json/);
  assert.match(serviceWorkerSource, /\.\/resource_industrial_catalog_v1\.json/);
  assert.match(uiSource, /selectedMinistryCountry\(\)/);
  assert.match(bindingSource, /MINEPLAY_BATCH_URL/);
  assert.match(endowmentSource, /OMEGA_RESOURCE_MINE_COMMISSIONED/);
  assert.match(endowmentSource, /const operationalMineSiteIds=new Set/);
  assert.match(endowmentSource, /A site is paused only when none of its commissioned mine units remain operational/);
  assert.match(bindingSource, /resource_site_country_mineplay_batch_20261020_v1\.json/);
});


test('Mine Management prefers hydrated canonical runtime profiles over sparse duplicate source rows', () => {
  const siteId = 'SITE_BWA_PROFILE_PRECEDENCE_TEST';
  const sourceSite = {
    siteId, countryId: 'BWA', siteName: 'Test Gold Mine',
    identity: { countryIso3: 'BWA', resourceTypeId: 'gold' },
    location: { coordinates: { lat: -21.2, lng: 25.5 } },
    operation: { status: 'OPERATING', commercialExtraction: true },
    real: { resourceId: 'gold' },
    quantitative: {
      production: { rate: null, annual: null, unit: 'TONNES_PER_DAY', status: 'UNOBSERVED' },
      reserve: { quantity: null, unit: 'TONNES', status: 'UNOBSERVED' }
    },
    sourceSiteRecord: { siteId, countryCode: 'BWA', resourceId: 'gold', status: 'OPERATING' },
    map: { markerEligible: true, countryIsolationKey: 'BWA' },
    runtime: { identityAuthority: 'SOURCE_CATALOG' }
  };
  const runtimeSite = {
    ...sourceSite, resourceId: 'gold',
    operation: { status: 'SIMULATED_PLAYER_MINE_OPERATIONAL', realWorldStatus: 'OPERATING', commercialExtraction: true },
    quantitative: {
      production: { rate: 123.5, annual: 45077.5, unit: 'TONNES_PER_DAY', annualUnit: 'TONNES_PER_YEAR', status: 'SIMULATED', authority: 'GAMEPLAY_SIMULATION' },
      reserve: { quantity: 9000000, unit: 'TONNES', status: 'SIMULATED', authority: 'GAMEPLAY_SIMULATION' },
      grade: { value: 2.4, unit: 'PERCENT', status: 'SIMULATED' },
      recovery: { value: 82, unit: 'PERCENT', status: 'SIMULATED' },
      purity: { value: 91, unit: 'PERCENT', status: 'SIMULATED' },
      throughput: { value: 110, unit: 'TONNES_PER_DAY', status: 'SIMULATED' },
      capacity: { minimum: 80, nominal: 150, maximum: 200, unit: 'TONNES_PER_DAY', status: 'SIMULATED' }
    },
    simulation: {
      productionReadiness: 'CAPACITY_READY', gameplayProductionEnabled: true,
      productionRate: 123.5, productionRateUnit: 'TONNES_PER_DAY',
      annualProduction: 45077.5, annualProductionUnit: 'TONNES_PER_YEAR'
    },
    runtime: { identityAuthority: 'CANONICAL_SITE_REGISTRY', countryWarehouseId: 'WH-BWA-RAW' }
  };
  const context = {
    console,
    Game: { state: { simulation: { session: { playerCountryId: 'BWA' } }, resource: {} } },
    OmegaResourceSiteCanonicalCatalogData: { sites: [sourceSite] },
    OmegaIndividualResourceSiteBinding: { sites: [sourceSite] },
    OmegaResourceEndowmentRuntime: { countryMineSiteReferences: country => country === 'BWA' ? [runtimeSite] : [] },
    document: { readyState: 'loading', addEventListener() {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(uiSource, context, { filename: 'omega_resource_mine_management_v1.js' });
  const api = context.Omega.ResourceMineManagementUI;
  const sites = api.getCountrySites('BWA');
  assert.equal(sites.length, 1, 'deduplication should keep one physical site');
  const merged = sites[0];
  assert.equal(merged.quantitative.production.rate, 123.5, 'runtime profile must fill the sparse source record');
  assert.equal(merged.quantitative.production.status, 'SIMULATED', 'generated output must remain visibly simulated');
  assert.equal(merged.quantitative.reserve.quantity, 9000000);
  assert.equal(merged.simulation.productionReadiness, 'CAPACITY_READY');
  assert.equal(merged.runtime.countryWarehouseId, 'WH-BWA-RAW');
  assert.equal(merged.operation.realWorldStatus, 'OPERATING', 'runtime status must not erase separate real-world status');
  assert.equal(api.getReserveSummary(merged), '9,000,000 tonnes',
    'the player-facing reserve summary must not expose simulation terminology');
  const summary = api.getProductionSummary(merged);
  assert.match(summary, /Daily output 123\.5 tonnes per day/);
  assert.match(summary, /Annual output 45,077\.5 tonnes per year/);
  assert.match(summary, /Daily capacity 80–200 tonnes per day/);
  assert.doesNotMatch(summary, /SIMULATED|MODELED|GAMEPLAY_SIMULATION|actual extraction remains subject to runtime gates/i);
});

test('every mapped resource site joins the executable runtime and has a one-tap country production action', () => {
  assert.match(endowmentSource, /function normalizeBoundSiteForRuntime/);
  assert.match(endowmentSource, /function syncBoundSiteRegistry/);
  assert.match(endowmentSource, /syncBoundSiteRegistry\(binding\.sites\)/);
  assert.match(endowmentSource, /simulation\.routeAuthority='SIMULATED_TOPOLOGY_FALLBACK'/);
  assert.match(endowmentSource, /distanceKm:null,distanceStatus:'UNOBSERVED'/,
    'a fallback route must not invent an observed transport distance');
  assert.match(endowmentSource, /async function startCountryProduction\(countryId,siteIds=null\)/);
  assert.match(endowmentSource, /PRODUCTION_ALREADY_STARTED_THIS_TURN/);
  assert.match(endowmentSource, /NO_UNATTEMPTED_SITE_OCCURRENCES/);
  assert.match(endowmentSource, /registerCanonicalSiteSimulationRecord/);
  assert.match(uiSource, /data-omm-action="start-country-production"/);
  assert.match(uiSource, /runtime\.startCountryProduction\(country,batch\)/);
  assert.match(uiSource, /const BATCH_SIZE=32/);
  assert.match(uiSource, /await yieldToMobileUi\(\)/);
  assert.match(uiSource, /countryMineSiteControllers\(country\)/);
  assert.match(uiSource, /country!==playerCountry\(\)/,
    'the one-tap action must stay within the active player-country boundary');
  assert.match(uiSource, /if\(productionRunActive\)return/);
});


test('critical mineral batch has complete runtime profiles and joins the canonical mine system', () => {
  assert.equal(criticalMineralsBatch.datasetId, 'OMEGA_RESOURCE_SITE_COUNTRY_MINEPLAY_BATCH_V1');
  assert.equal(criticalMineralsBatch.batchId, 'COUNTRY_MINEPLAY_CRITICAL_MINERALS_20261024');
  assert.equal(criticalMineralsBatch.recordCount, 58);
  assert.equal(criticalMineralsBatch.records.length, 58);
  assert.equal(criticalMineralsBatch.countryCount, 23);
  assert.ok(bindingSource.includes('resource_site_country_mineplay_critical_batch_20261024_v1.json'));
  assert.ok(endowmentSource.includes('resource_site_country_mineplay_critical_batch_20261024_v1.json'));
  assert.ok(serviceWorkerSource.includes('resource_site_country_mineplay_critical_batch_20261024_v1.json'));
  assert.match(serviceWorkerSource, /omega-offline-atlas-shell-v\d+/);
  assert.ok(catalog.resourceRules.aragonite, 'aragonite extraction must be a catalog rule');
  assert.ok(catalog.processingRules.aragonite, 'aragonite processing must be a catalog recipe');

  const normalize = v => String(v ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const country = row => String(row?.countryId || row?.identity?.countryIso3 || row?.location?.countryBoundaryKey || '').toUpperCase();
  const resource = row => String(row?.resourceId || row?.identity?.resourceTypeId || row?.real?.resourceId || '').toLowerCase();
  const siteName = row => normalize(row?.siteName || row?.name);
  const coord = row => {
    const c = row?.location?.coordinates || {};
    return Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)) ? { lat: Number(c.lat), lng: Number(c.lng) } : null;
  };
  const distanceKm = (a,b) => {
    const rad=Math.PI/180,dl=(b.lat-a.lat)*rad,dg=(b.lng-a.lng)*rad,la=a.lat*rad,lb=b.lat*rad;
    const h=Math.sin(dl/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dg/2)**2;
    return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));
  };
  const existing = [
    ...(canonicalSiteCatalog.sites || []), ...(masterSiteRegistry.sites || []),
    ...reserveRegistry.records, ...supplement.records, ...expandedCoverageBatch.records,
    ...legacySiteRegistries.flatMap(x => x.records || []),
    ...expandedSiteRegistries.flatMap(x => x.sites || [])
  ];
  const ids = new Set(existing.map(x => String(x?.siteId || '')).filter(Boolean));
  const names = new Set(existing.map(x => country(x) + '|' + siteName(x)).filter(x => !x.endsWith('|')));
  const sameCommoditySites = existing.filter(x => country(x) && resource(x) && coord(x));
  const candidateIds = new Set();
  const candidateNames = new Set();
  const candidateRows = [];
  for (const row of criticalMineralsBatch.records) {
    assert.ok(row.siteId && /^SITE_[A-Z]{3}_[a-z0-9_]+$/.test(row.siteId), row.siteId + ': stable site identity');
    assert.equal(candidateIds.has(row.siteId), false, row.siteId + ': duplicate ID within critical batch');
    assert.equal(ids.has(row.siteId), false, row.siteId + ': duplicate ID in existing registries');
    assert.match(row.countryId, /^[A-Z]{3}$/);
    assert.equal(row.identity.countryIso3, row.countryId);
    assert.equal(row.identity.resourceTypeId, resource(row));
    assert.equal(row.location.countryBoundaryKey, row.countryId);
    assert.equal(row.map.countryIsolationKey, row.countryId);
    const p=coord(row);
    assert.ok(p && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180, row.siteId + ': map coordinates');
    assert.equal(row.map.markerEligible, true);
    assert.equal(row.operation.status, 'SIMULATED_OPERATIONAL_SCENARIO');
    assert.equal(row.operation.operationalStatus, 'SIMULATED_ACTIVE');
    assert.equal(row.operation.commercialExtraction, true);
    assert.equal(row.operation.siteCommissioningLevel, 5);
    assert.equal(row.operation.gameplayConstructionAllowed, true);
    assert.equal(row.runtime.requiresSiteSpecificRoute, true);
    assert.equal(row.runtime.requiresFactoryBinding, true);
    assert.equal(row.logistics.warehouseCountryId, row.countryId);
    assert.equal(row.logistics.transport.originSiteId, row.siteId);
    assert.equal(row.logistics.transport.originCountryId, row.countryId);
    assert.equal(row.logistics.transport.destinationCountryId, row.countryId);
    assert.equal(row.logistics.transport.warehouseId, 'WH-' + row.countryId + '-RAW');
    assert.equal(row.simulation.rawWarehouseId, 'WH-' + row.countryId + '-RAW');
    assert.equal(row.simulation.factoryBinding.countryId, row.countryId);
    assert.equal(row.simulation.factoryBinding.inputResourceId, resource(row));
    assert.equal(row.simulation.factoryBinding.status, 'SIMULATED_READY');
    assert.ok(row.simulation.factoryBinding.factoryId);
    assert.ok(row.simulation.transportRoute.length > 0);
    assert.ok(row.processing.refinedOutputs.length > 0);
    assert.ok(catalog.resourceRules[resource(row)], row.siteId + ': missing extraction catalog rule');
    assert.ok(catalog.processingRules[resource(row)], row.siteId + ': missing processing catalog recipe');
    const q=row.quantitative;
    for(const field of ['reserve','production','grade','recovery','throughput','purity','capacity']) {
      assert.equal(q[field].status,'SIMULATED',row.siteId+': '+field+' must be gameplay-only');
      assert.equal(q.completeness[field],'SIMULATED',row.siteId+': '+field+' completeness');
    }
    assert.ok(q.reserve.quantity>0);
    assert.equal(q.production.annual,q.production.rate*365);
    assert.equal(q.reserve.quantity,q.production.annual*400);
    assert.ok(q.production.rate>0 && q.production.annual>0);
    assert.ok(q.grade.value>0 && q.recovery.value>0 && q.recovery.value<=100);
    assert.ok(q.throughput.value>0 && q.purity.value>0 && q.purity.value<=100);
    assert.ok(q.capacity.minimum>0 && q.capacity.minimum<=q.capacity.nominal && q.capacity.nominal<=q.capacity.maximum);
    assert.equal(q.quantitativeProvenance.authority,'SCENARIO_SIMULATION_DATA');
    assert.equal(q.quantitativeProvenance.gameplayHorizonYears,400);
    assert.equal(q.quantitativeProvenance.realWorldDataRequired,false);
    assert.equal(q.completeness.overall,'GAMEPLAY_SIMULATION_COMPLETE');
    assert.deepEqual(row.observedFacts,[]);
    assert.ok(Array.isArray(row.sources) && row.sources.some(source=>/^https?:\/\//.test(source.url)),row.siteId+': source lineage');
    assert.equal(row.sourceReference.facts.measuredReservePromoted,false);
    assert.equal(row.sourceReference.facts.measuredProductionPromoted,false);
    assert.equal(row.sourceReference.facts.quantitativeValuesAreSimulated,true);
    assert.ok(row.operation.realWorldStatus && row.sourceReference.statusNote.includes('not represented as currently operating'),
      row.siteId + ': preserve actual real-world/project status separately');
    const normalizedName=country(row)+'|'+siteName(row);
    assert.equal(candidateNames.has(normalizedName),false,row.siteId+': duplicate name within critical batch');
    assert.equal(names.has(normalizedName),false,row.siteId+': duplicate name in existing registries');
    for(const old of sameCommoditySites) {
      if(country(old)!==country(row)||resource(old)!==resource(row)) continue;
      const oldPoint=coord(old);
      if(oldPoint)assert.ok(distanceKm(p,oldPoint)>=2,row.siteId+': possible same-commodity duplicate of '+old.siteId);
    }
    for(const old of candidateRows) {
      if(country(old)!==country(row)||resource(old)!==resource(row))continue;
      const oldPoint=coord(old);
      if(oldPoint)assert.ok(distanceKm(p,oldPoint)>=2,row.siteId+': duplicate/overlapping candidate site '+old.siteId);
    }
    ids.add(row.siteId);candidateIds.add(row.siteId);names.add(normalizedName);candidateNames.add(normalizedName);candidateRows.push(row);
  }
  const counts=criticalMineralsBatch.records.reduce((out,row)=>{const id=resource(row);out[id]=(out[id]||0)+1;return out;},{});
  assert.ok(counts.rare_earth>=5,'rare-earth site coverage was not expanded');
  assert.ok(counts.coral_aggregate>=2,'coral aggregate source-area coverage was not expanded');
  for(const id of ['graphite','platinum','tungsten','potash','salt','ilmenite','tin','chromite']) assert.ok(counts[id]>=3,id+' site coverage was not expanded');
});
