import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(new URL('resource_industrial_catalog_v1.json', repoRoot), 'utf8'));
const supplement = JSON.parse(fs.readFileSync(new URL('resource_site_country_mineplay_batch_20261020_v1.json', repoRoot), 'utf8'));
const industrialSource = fs.readFileSync(new URL('omega_resource_industrial_network_v1.js', repoRoot), 'utf8');
const endowmentSource = fs.readFileSync(new URL('omega_resource_endowment_runtime.js', repoRoot), 'utf8');
const integritySource = fs.readFileSync(new URL('omega_resource_site_integrity_v1.js', repoRoot), 'utf8');
const bindingSource = fs.readFileSync(new URL('omega_resource_gameplay_binding_v1.js', repoRoot), 'utf8');
const uiSource = fs.readFileSync(new URL('omega_resource_mine_management_v1.js', repoRoot), 'utf8');
const indexSource = fs.readFileSync(new URL('index.html', repoRoot), 'utf8');

function fixture(overrides = {}) {
  const materials = {
    iron_ore: 50000,
    copper: 5000,
    limestone: 50000,
    coal: 50000,
    crude_oil: 5000,
    construction_aggregate: 50000
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
  assert.equal(supplement.records.length, 30);
  assert.ok(supplement.countryCount >= 8);
  assert.ok(supplement.records.filter(x => x.countryId === 'BWA').length >= 4);
  assert.equal(new Set(supplement.records.map(x => x.siteId)).size, supplement.records.length);
  for (const row of supplement.records) {
    assert.match(row.countryId, /^[A-Z]{3}$/);
    assert.ok(row.location.coordinates.lat >= -90 && row.location.coordinates.lat <= 90);
    assert.ok(row.location.coordinates.lng >= -180 && row.location.coordinates.lng <= 180);
    assert.equal(row.quantitative.reserve.status, 'UNOBSERVED');
    assert.equal(row.quantitative.production.status, 'UNOBSERVED');
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

test('niobium and ruby have extraction and processing rules', () => {
  for (const id of ['niobium', 'ruby']) {
    assert.ok(catalog.resourceRules[id], id + ' extraction rule missing');
    assert.ok(catalog.processingRules[id], id + ' processing rule missing');
    assert.equal(catalog.processingRules[id].inputs[id], 1);
    assert.ok(Object.keys(catalog.processingRules[id].outputs).length > 0);
  }
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
  }
  const completed = state.resource.BWA.industrialNetwork.projects.find(x => x.projectId === project.projectId);
  assert.equal(completed.status, 'COMPLETED');
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

test('mine project rejects cross-country identity and player-only actions require explicit scope check in UI', () => {
  const { ctx, state } = fixture();
  const api = ctx.Omega.ResourceIndustrialNetwork;
  assert.equal(api.quoteMineProject({ countryId: 'ZWE', siteId: 'SITE_BWA_TEST_GOLD_MINE', resourceId: 'gold', assignedWorkers: 1000 }).reason, 'COUNTRY_SITE_BOUNDARY_VIOLATION');
  assert.match(uiSource, /country!==playerCountry\(\)/);
  assert.match(uiSource, /startMineProject/);
  assert.match(uiSource, /quoteMineProject/);
  assert.match(uiSource, /My Mines/);
  assert.match(uiSource, /data-omega-mine-entry="my-mines"/);
  assert.match(uiSource, /data-omega-mine-entry="mines"/);
  assert.match(uiSource, /<svg/);
  assert.match(indexSource, /omega_resource_mine_management_v1\.js/);
  assert.match(endowmentSource, /OMEGA_RESOURCE_MINE_COMMISSIONED/);
  assert.match(bindingSource, /resource_site_country_mineplay_batch_20261020_v1\.json/);
});
