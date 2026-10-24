import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Reuse the authoritative runtime fixture and its existing single-site end-to-end regressions.
// Unlike a sample-only test, this audit requires an extraction-to-finished-goods proof for each eligible physical site.
// This test then adds the missing exhaustive pass over every eligible physical site.
await import('./omega_resource_endowment_runtime.test.mjs');

const readJson = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const runtime = globalThis.Omega?.ResourceEndowmentRuntime || globalThis.OmegaResourceEndowmentRuntime;
const industry = globalThis.Omega?.ResourceIndustrialNetwork || globalThis.OmegaResourceIndustrialNetwork;
assert.ok(runtime?.initialize && runtime?.normalizeBoundSiteForRuntime && runtime?.countryResourceState,
  'authoritative endowment runtime must be loaded by the base fixture');
assert.ok(industry?.executeSitePipeline && industry?.advanceShipments && industry?.processPendingFactoryInputs,
  'industrial network runtime must be loaded by the base fixture');
const initialized = await runtime.initialize();
assert.equal(initialized.status, 'READY', JSON.stringify(initialized));
assert.equal((await industry.loadCatalog()).status, 'READY');

const liveCatalog = globalThis.OmegaResourceSiteCanonicalCatalogData ||
  globalThis.Omega?.ResourceSiteCanonicalCatalogData;
const liveCatalogRows = Array.isArray(liveCatalog?.sites) ? liveCatalog.sites : [];
assert.ok(liveCatalogRows.length >= 500,
  'the live canonical runtime catalog must cover at least 500 distinct site records; count=' + liveCatalogRows.length);
assert.equal(Number(liveCatalog?.totalSiteCount), liveCatalogRows.length,
  'runtime catalog totalSiteCount must match its actual site rows');
const sourceRows = [
  // The live catalog is the execution authority, including approved country expansion rows.
  // Then add raw source batches to catch rows accidentally omitted from runtime authority.
  ...liveCatalogRows,
  ...(readJson('resource_site_canonical_catalog_v1.json').sites || []),
  ...(readJson('resource_site_country_mineplay_batch_20261020_v1.json').records || []),
  ...(readJson('resource_site_country_mineplay_batch_20261024_v1.json').records || []),
  ...[1, 2, 3, 4, 5, 6].flatMap(part =>
    readJson('resource_site_legacy_gameplay_expansion_part_' + part + '_v1.json').records || [])
];
const excludedRejections = new Set(['SITE_ALIAS_OR_NON_MARKER_CANNOT_EXECUTE', 'NON_COMMERCIAL_SITE']);
const sourceById = new Map();
const profileFailures = [];
for (const source of sourceRows) {
  const siteId = String(source?.siteId || '').trim();
  // The base integration fixture deliberately registers synthetic SITE_TEST_* rows.
  // They are covered by their dedicated fixture assertions, not counted as physical mines.
  if (!siteId || /^SITE_TEST_/i.test(siteId) || source?.sourceReference?.sourcePath === 'TEST_FIXTURE_CANONICAL_ONLY' ||
      sourceById.has(siteId) || source?.runtime?.aliasOfSiteId ||
      source?.map?.markerEligible === false || source?.operation?.commercialExtraction === false ||
      source?.commercialExtraction === false ||
      String(source?.operation?.status || source?.operation?.operationalStatus || source?.status || '').toUpperCase() === 'NOT_APPLICABLE') continue;
  const normalized = runtime.normalizeBoundSiteForRuntime(source);
  if (normalized?.status === 'REJECTED' && excludedRejections.has(normalized.reason)) continue;
  if (normalized?.status !== 'READY') {
    profileFailures.push({ siteId, status: normalized?.status || null, reason: normalized?.reason || null });
    continue;
  }
  const site = normalized.site;
  const countryId = String(site?.countryId || site?.identity?.countryIso3 || '').toUpperCase();
  const resourceId = String(site?.real?.resourceId || site?.identity?.resourceTypeId || '').trim().toLowerCase();
  if (!/^[A-Z]{3}$/.test(countryId) || !resourceId) {
    profileFailures.push({ siteId, countryId, resourceId, reason: 'NORMALIZED_IDENTITY_INCOMPLETE' });
    continue;
  }
  sourceById.set(siteId, { siteId, countryId, resourceId, site, source });
}
assert.equal(profileFailures.length, 0,
  'every eligible physical site must normalize: ' + JSON.stringify(profileFailures.slice(0, 30)));
const eligibleSites = [...sourceById.values()];
assert.ok(eligibleSites.length >= 400,
  'the exhaustive test must cover the expanded physical-site population; count=' + eligibleSites.length);

function commissionGameplayMine(entry) {
  const { siteId, countryId, resourceId, source } = entry;
  const root = globalThis.Game?.state || globalThis.gameState;
  const row = root?.resource?.[countryId] || {};
  if (!root?.resource) throw new Error('EXHAUSTIVE_SITE_GAME_STATE_RESOURCE_MISSING');
  if (!root.resource[countryId]) root.resource[countryId] = row;
  row.mineAssets = Array.isArray(row.mineAssets) ? row.mineAssets : [];
  let asset = row.mineAssets.find(x => String(x?.siteId || '') === siteId &&
    String(x?.status || '').toUpperCase() === 'OPERATIONAL');
  if (!asset) {
    asset = {
      mineId: 'TEST-COMMISSIONED-MINE:' + countryId + ':' + siteId,
      id: 'TEST-COMMISSIONED-MINE:' + countryId + ':' + siteId,
      siteId, siteName: source?.siteName || entry.site?.siteName || siteId,
      resourceId, countryId, ownerCountryId: countryId, status: 'OPERATIONAL',
      buildProjectId: 'TEST-COMMISSION:' + siteId, commissionedTurn: Number(root.simulation?.turn) || 1,
      capacityMultiplier: 1, workersRequired: 1, workersCommitted: 1,
      sourceSiteStatus: String(source?.operation?.status || source?.status || 'NOT_RECORDED'),
      siteIdentityAuthority: 'CANONICAL_SITE_REGISTRY',
      authority: 'SIMULATED_PLAYER_MINE_ASSET_TEST_FIXTURE',
      productionStatus: 'READY_FOR_EXTRACTION', lastProductionTurn: null
    };
    row.mineAssets.push(asset);
  }
  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('OMEGA_RESOURCE_MINE_COMMISSIONED', {
      detail: { countryId, payload: { countryId, siteId, resourceId, mineId: asset.mineId,
        status: 'OPERATIONAL', sourceSiteStatus: asset.sourceSiteStatus,
        authority: 'SIMULATED_PLAYER_MINE_ASSET_TEST_FIXTURE' } }
    }));
  }
  const commission=(row.commissionedSites||[]).find(x=>String(x?.siteId||'')===siteId&&
    String(x?.status||'').toUpperCase()==='COMMISSIONED');
  if(!commission)throw new Error('MINE_COMMISSION_EVENT_DID_NOT_UPDATE_POLICY_LEDGER:'+countryId+':'+siteId);
}
function provisionCountry(countryId) {
  for (const root of [globalThis.Game?.state, globalThis.OmegaMinistryStateProvider?.getState?.()].filter(Boolean)) {
    root.transport = root.transport || {};
    root.transport[countryId] = root.transport[countryId] || {};
    const transport = root.transport[countryId];
    transport.infrastructure = transport.infrastructure || {};
    for (const key of ['roads', 'rail', 'ports', 'bridges', 'pipelines']) {
      transport.infrastructure[key] = transport.infrastructure[key] || { capacityPerDay: 1e9, quality: 0.99 };
    }
    transport.infrastructure.utilitySupply = transport.infrastructure.utilitySupply || {
      electricityMWhPerDay: 1e9, waterM3PerDay: 1e9,
      authority: 'TEST_FIXTURE', status: 'AVAILABLE', simulationOnly: true, assets: []
    };
    root.economy = root.economy || {};
    root.economy[countryId] = root.economy[countryId] || { productionAssets: [] };
    const economy = root.economy[countryId];
    if (!Array.isArray(economy.productionAssets)) economy.productionAssets = [];
    economy.unemploymentCount = 1000000;
    economy.laborForce = 1000000;
    economy.unemployment_rate = 10;
    root.finance = root.finance || {};
    root.finance[countryId] = root.finance[countryId] || { available: 1e15, reserves: 1e15 };
    if (!Number.isFinite(Number(root.finance[countryId].available)) || Number(root.finance[countryId].available) < 1e12) {
      root.finance[countryId].available = 1e15;
    }
  }
}
function advanceOneTurn(state) {
  const sim = state.simulation || (state.simulation = {});
  const step = Math.max(1, Math.round(Number(sim.daysPerTurn) || 1));
  const base = String(sim.date || String(Number(sim.startYear) || 2015) + '-01-01');
  const date = new Date(base + 'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + step);
  sim.date = date.toISOString().slice(0, 10);
  sim.turn = (Number(sim.turn) || 1) + 1;
}
function advanceToTurn(state, targetTurn) {
  const target = Math.max(1, Number(targetTurn) || 1);
  let guard = 0;
  while ((Number(state.simulation?.turn) || 1) < target) {
    advanceOneTurn(state);
    if (++guard > 10000) throw new Error('EXHAUSTIVE_SITE_TURN_GUARD');
  }
}
function advanceToCycleFinish(state, cycle) {
  const sim = state.simulation || (state.simulation = {});
  if (!sim.date) sim.date = String(cycle?.startDate || String(Number(sim.startYear) || 2015) + '-01-01');
  const currentTurn = Number(sim.turn) || 1;
  const targetTurn = Math.max(currentTurn + 1, Number(cycle?.finishTurn) || currentTurn + 1);
  const targetDate = cycle?.finishDate ? new Date(String(cycle.finishDate) + 'T00:00:00.000Z') : null;
  let guard = 0;
  while ((Number(sim.turn) || 1) < targetTurn ||
      (targetDate && new Date(String(sim.date) + 'T00:00:00.000Z') < targetDate)) {
    advanceOneTurn(state);
    if (++guard > 10000) throw new Error('EXHAUSTIVE_SITE_CYCLE_GUARD');
  }
}
function flowFor(countryId, batchId) {
  return (runtime.countryResourceState(countryId)?.industrialNetwork?.siteFlowLedger || [])
    .find(row => String(row.batchId || '') === String(batchId || ''));
}
function completeFactoryCycle(state, countryId, factoryId, batchId, maxTurns = 48) {
  const history = [];
  for (let step = 0; step < maxTurns; step++) {
    const flow = flowFor(countryId, batchId);
    if (flow?.stages?.some(stage => stage.stage === 'PROCESSING' && stage.status === 'COMPLETED')) {
      return { status: 'COMPLETED', history };
    }
    const resourceState = runtime.countryResourceState(countryId) || {};
    const cycle = resourceState.industrialNetwork?.factoryProductionCycles?.[String(factoryId)];
    if (cycle && cycle.status === 'IN_PROGRESS' && cycle.finishDate) advanceToCycleFinish(state, cycle);
    else advanceOneTurn(state);
    const result = industry.processPendingFactoryInputs(countryId);
    history.push({ turn: state.simulation?.turn, completedCount: result?.completedCount || 0,
      startedCount: result?.startedCount || 0, blockedCount: (result?.blocked || []).length });
  }
  throw new Error('EXHAUSTIVE_SITE_FACTORY_CYCLE_NOT_COMPLETED ' + JSON.stringify({
    countryId, factoryId, batchId, flow: flowFor(countryId, batchId), history: history.slice(-12)
  }));
}

const dispatchFailures = [];
const pipelines = [];
const dispatchTotals = { eligible: eligibleSites.length, dispatched: 0, blocked: 0, invalidLineage: 0 };
const turnState = globalThis.Game?.state || globalThis.gameState;
assert.ok(turnState?.simulation, 'game simulation state must exist');
for (const entry of eligibleSites) {
  const { siteId, countryId, resourceId, source } = entry;
  provisionCountry(countryId);
  turnState.simulation.turn = Number(turnState.simulation.turn || 0) + 1;
  // This is a post-commission capability audit. Construction costs/material checks
  // are tested by the normal mine-management suite; here every mine is explicitly
  // commissioned so source-world inactive/development status cannot fake a pipeline bug.
  commissionGameplayMine(entry);
  const pipeline = await industry.executeSitePipeline({
    countryId, siteId, resourceId, quantity: 1, autoCommissionFactory: true,
    transportMode: source?.simulation?.transportRoute?.[0]?.mode || entry.site?.simulation?.transportRoute?.[0]?.mode || 'rail'
  });
  if (pipeline?.status !== 'IN_TRANSIT' || pipeline?.extractionStatus !== 'COMMITTED' ||
      pipeline?.shipmentStatus !== 'DISPATCHED' || !pipeline?.batchId || !pipeline?.shipmentId || !pipeline?.factoryId) {
    dispatchTotals.blocked++;
    dispatchFailures.push({ siteId, countryId, resourceId, status: pipeline?.status || null,
      reason: pipeline?.reason || null, extractionStatus: pipeline?.extractionStatus || null,
      shipmentStatus: pipeline?.shipmentStatus || null, detail: pipeline?.detail || pipeline?.shipment?.reason || null,
      linkedOccurrenceCount: pipeline?.linkedOccurrenceCount ?? null });
    continue;
  }
  const country = runtime.countryResourceState(countryId) || {};
  const batch = (country.batches || []).find(row => String(row.batchId || '') === String(pipeline.batchId));
  const shipment = (country.industrialNetwork?.shipments || [])
    .find(row => String(row.shipmentId || '') === String(pipeline.shipmentId));
  const flow = flowFor(countryId, pipeline.batchId);
  const factoryExists = [globalThis.Game?.state, globalThis.OmegaMinistryStateProvider?.getState?.()].filter(Boolean)
    .some(root => (root?.economy?.[countryId]?.productionAssets || []).some(asset =>
      String(asset?.id || asset?.assetId || asset?.projectId || '') === String(pipeline.factoryId)));
  const rawAvailable = Number(country.warehouse?.availableByResource?.[resourceId] || 0);
  const rawReserved = Number(country.warehouse?.reservedByResource?.[resourceId] || 0);
  const ledgerValid = Boolean(batch && shipment && flow && factoryExists &&
    String(batch.countryId || '').toUpperCase() === countryId &&
    String(batch.sourceCountryId || countryId).toUpperCase() === countryId &&
    String(batch.warehouseId || '') === 'WH-' + countryId + '-RAW' &&
    String(shipment.factoryId || '') === String(pipeline.factoryId) &&
    String(flow.siteId || '') === siteId && String(flow.countryId || '').toUpperCase() === countryId &&
    (rawAvailable > 0 || rawReserved > 0) && pipeline.route?.crossBorderRequired === false);
  if (!ledgerValid) {
    dispatchTotals.invalidLineage++;
    dispatchFailures.push({ siteId, countryId, resourceId, reason: 'BATCH_WAREHOUSE_SHIPMENT_FACTORY_LEDGER_MISMATCH',
      batchFound: Boolean(batch), shipmentFound: Boolean(shipment), flowFound: Boolean(flow), factoryExists,
      rawAvailable, rawReserved, crossBorderRequired: pipeline.route?.crossBorderRequired ?? null });
  }
  pipelines.push({ siteId, countryId, resourceId, batchId: pipeline.batchId,
    shipmentId: pipeline.shipmentId, factoryId: pipeline.factoryId, etaTurn: Number(pipeline.shipment?.etaTurn) || 0 });
  dispatchTotals.dispatched++;
}
console.log('OMEGA EXHAUSTIVE SITE DISPATCH AUDIT ' + JSON.stringify({
  ...dispatchTotals, failureCount: dispatchFailures.length, failures: dispatchFailures.slice(0, 50)
}));
assert.equal(dispatchTotals.blocked, 0,
  'all eligible sites must commit extraction and dispatch transport: ' + JSON.stringify(dispatchFailures.slice(0, 30)));
assert.equal(dispatchTotals.invalidLineage, 0,
  'all eligible sites must retain matching batch/warehouse/shipment/factory lineage: ' + JSON.stringify(dispatchFailures.slice(0, 30)));
assert.equal(dispatchTotals.dispatched, dispatchTotals.eligible);

// Drive every dispatch through actual arrival and factory completion, not merely route creation.
const maxEta = Math.max(Number(turnState.simulation.turn) || 1, ...pipelines.map(row => row.etaTurn || 1));
advanceToTurn(turnState, maxEta);
const countries = [...new Set(pipelines.map(row => row.countryId))];
for (const countryId of countries) {
  const advanced = await industry.advanceShipments(countryId);
  const after = runtime.countryResourceState(countryId) || {};
  const targetShipments = pipelines.filter(row => row.countryId === countryId);
  for (const target of targetShipments) {
    const shipment = (after.industrialNetwork?.shipments || [])
      .find(row => String(row.shipmentId || '') === String(target.shipmentId));
    if (shipment?.status !== 'DELIVERED') dispatchFailures.push({
      siteId: target.siteId, countryId, shipmentId: target.shipmentId,
      reason: 'SITE_SHIPMENT_NOT_DELIVERED', status: shipment?.status || null,
      etaTurn: shipment?.etaTurn ?? target.etaTurn, advanceStatus: advanced?.status || null
    });
  }
}
assert.equal(dispatchFailures.length, 0,
  'all site shipments must arrive in their owning country: ' + JSON.stringify(dispatchFailures.slice(0, 30)));

const processingFailures = [];
let processedCount = 0;
for (const target of pipelines) {
  try {
    completeFactoryCycle(turnState, target.countryId, target.factoryId, target.batchId);
    const country = runtime.countryResourceState(target.countryId) || {};
    const flow = flowFor(target.countryId, target.batchId);
    const delivery = (country.industrialNetwork?.deliveries || [])
      .find(row => String(row.shipmentId || '') === String(target.shipmentId));
    const outputs = delivery?.processing?.outputs && typeof delivery.processing.outputs === 'object'
      ? Object.keys(delivery.processing.outputs) : [];
    const finishedGoodsPresent = outputs.some(id => Number(country.inventory?.[id]) > 0);
    const flowCompleted = flow?.stages?.some(stage => stage.stage === 'PROCESSING' && stage.status === 'COMPLETED');
    if (delivery?.processingStatus !== 'PROCESSED' || !flowCompleted || !outputs.length || !finishedGoodsPresent) {
      processingFailures.push({ siteId: target.siteId, countryId: target.countryId, batchId: target.batchId,
        shipmentId: target.shipmentId, reason: 'FINISHED_GOODS_NOT_COMMITTED',
        processingStatus: delivery?.processingStatus || null, outputs, finishedGoodsPresent, flowCompleted,
        flowStages: (flow?.stages || []).map(stage => ({ stage: stage.stage, status: stage.status, reason: stage.reason || null })) });
    } else {
      processedCount++;
    }
  } catch (error) {
    processingFailures.push({ siteId: target.siteId, countryId: target.countryId, batchId: target.batchId,
      factoryId: target.factoryId, reason: String(error?.message || error).slice(0, 1600) });
  }
}
console.log('OMEGA EXHAUSTIVE SITE OUTPUT AUDIT ' + JSON.stringify({
  eligible: eligibleSites.length, dispatched: pipelines.length, processed: processedCount,
  failed: processingFailures.length, failures: processingFailures.slice(0, 50)
}));
assert.equal(processingFailures.length, 0,
  'every eligible physical mine must finish a factory cycle and commit finished goods: ' + JSON.stringify(processingFailures.slice(0, 30)));
assert.equal(processedCount, eligibleSites.length,
  'all eligible physical mines must complete the same site-to-output gameplay path');
console.log('OMEGA EXHAUSTIVE ALL-SITE PRODUCTION PIPELINE PASSED');
