import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = process.cwd();
const ARTIFACT_DIR = process.env.OMEGA_BROWSER_TEST_ARTIFACT_DIR || path.join(ROOT, '.omega-mine-market-treasury-artifacts');

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.ico': 'image/x-icon', '.wasm': 'application/wasm'
  })[ext] || 'application/octet-stream';
}

async function startStaticOrigin() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const absolute = path.resolve(ROOT, '.' + requested);
      if (absolute !== ROOT && !absolute.startsWith(ROOT + path.sep)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const bytes = await readFile(absolute);
      response.writeHead(200, {
        'content-type': contentType(absolute),
        'cache-control': 'no-store, max-age=0',
        'x-content-type-options': 'nosniff'
      });
      response.end(bytes);
    } catch (error) {
      response.writeHead(error?.code === 'ENOENT' ? 404 : 500, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store'
      });
      response.end(error?.code === 'ENOENT' ? 'Not found' : String(error?.message || error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return { server, origin: 'http://127.0.0.1:' + address.port };
}

async function saveArtifact(name, value) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(path.join(ARTIFACT_DIR, name), JSON.stringify(value, null, 2) + '\n');
}

test('one fresh Chromium gameplay session completes mine extraction through factory production, market clearing and Treasury settlement', {
  timeout: 16 * 60 * 1000
}, async (t) => {
  const host = await startStaticOrigin();
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking']
  });
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US'
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  try {
    await page.goto(host.origin + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => {
      const g = window;
      return !!(g.Game?.state && g.Omega?.Simulation &&
        g.Omega?.ResourceIndustrialNetwork && g.Omega?.GlobalMarket &&
        g.OmegaGlobalTrade && g.OmegaResourceEndowmentRuntime &&
        g.OmegaCountryFactoryStartingBaselineV1 &&
        g.Omega?.IndividualResourceSiteBinding?.sites?.length);
    }, { timeout: 240000 });

    const setup = await page.evaluate(async () => {
      const g = window;
      const fail = (stage, details) => {
        let diagnostic = '';
        if (details !== undefined) {
          try { diagnostic = ':' + JSON.stringify(details); }
          catch { diagnostic = ':DIAGNOSTICS_SERIALIZATION_FAILED'; }
        }
        const error = new Error('MINE_MARKET_TREASURY_E2E:' + stage + diagnostic);
        error.details = details;
        throw error;
      };
      const token = value => String(value ?? '').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const countryCode = row => String(row?.iso3 || row?.countryCode || row?.code || '').trim().toUpperCase();
      const bankBalance = country => {
        const row = g.OmegaGovernmentBanking.accountSummary(country);
        const amount = Number(row?.treasuryBalanceUsd ?? row?.availableTreasuryUsd);
        return Number.isFinite(amount) ? amount : null;
      };

      const simulation = g.Omega.Simulation;
      const finance = g.Omega.FinanceMinistry || g.OmegaFinanceMinistry;
      const forex = g.OmegaForexMonetaryEngine;
      const bank = g.OmegaGovernmentBanking;
      const baseline = g.OmegaCountryFactoryStartingBaselineV1;
      const endowment = g.OmegaResourceEndowmentRuntime;
      const industrial = g.Omega.ResourceIndustrialNetwork;
      const market = g.Omega.GlobalMarket;
      const trade = g.OmegaGlobalTrade;
      if (!finance || !forex || !bank || !baseline || !endowment || !industrial || !market || !trade)
        fail('RUNTIME_REGISTRY_INCOMPLETE');

      await finance.init();
      await forex.init();
      await bank.init();
      await industrial.loadCatalog();
      await endowment.initialize();
      if (typeof baseline.waitForPendingInitialization === 'function')
        await baseline.waitForPendingInitialization();

      const profiles = finance.getProfiles() || [];
      const sites = g.Omega.IndividualResourceSiteBinding.sites || [];
      const catalogDiag = industrial.factoryCatalogDiagnostics();
      const profileByCountry = new Map();
      for (const profile of profiles) {
        const code = countryCode(profile);
        if (/^[A-Z]{3}$/.test(code)) profileByCountry.set(code, profile);
      }

      const currencyGroups = new Map();
      for (const [code, profile] of profileByCountry) {
        const currency = trade.currencyOf(code);
        if (!currency) continue;
        if (!currencyGroups.has(currency)) currencyGroups.set(currency, []);
        currencyGroups.get(currency).push(code);
      }

      const candidateCountries = [];
      for (const [seller, profile] of profileByCountry) {
        const row = baseline.getCountryBaseline(seller);
        const factoryCounts = row?.factoryCounts || {};
        const stateFactoryCount = Number(factoryCounts.UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT || 0);
        if (!(stateFactoryCount > 0)) continue;
        const currency = trade.currencyOf(seller);
        const sameCurrencyBuyers = (currencyGroups.get(currency) || []).filter(code => code !== seller)
          .map(code => ({ code, treasury: bankBalance(code) }))
          .filter(item => item.treasury !== null && item.treasury > 100);
        if (!sameCurrencyBuyers.length) continue;
        const mineSites = sites.filter(site => {
          if (String(site?.countryId || site?.identity?.countryIso3 || '').toUpperCase() !== seller) return false;
          const rid = token(site?.real?.resourceId || site?.sourceSiteRecord?.resourceId ||
            site?.identity?.resourceTypeId || site?.sourceSiteRecord?.resourceTypeId);
          return !!rid;
        });
        if (mineSites.length) candidateCountries.push({
          seller, profile, currency, mineSites, stateFactoryCount,
          buyers: sameCurrencyBuyers.sort((a, b) => b.treasury - a.treasury)
        });
      }
      candidateCountries.sort((a, b) => b.mineSites.length - a.mineSites.length);
      if (!candidateCountries.length) fail('NO_COUNTRY_WITH_MINE_BASELINE_FACTORY_AND_FUNDED_SAME_CURRENCY_BUYER', {
        profileCount: profileByCountry.size, siteCount: sites.length, factoryCatalog: catalogDiag,
        currencyGroups: [...currencyGroups.entries()].map(([currency, rows]) => ({ currency, countries: rows.length }))
      });

      const chosenCountry = candidateCountries[0];
      const seller = chosenCountry.seller;
      const buyer = chosenCountry.buyers[0].code;
      const sessionId = 'MINE-MARKET-TREASURY-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      const session = simulation.createSession({ playerCountryId: seller, sessionId, startTurn: 0 });
      const baselineResult = await baseline.initializeForSession(session);
      if (typeof baseline.waitForPendingInitialization === 'function')
        await baseline.waitForPendingInitialization();
      const baselineRow = baseline.getCountryBaseline(seller);
      if (!baselineRow || baselineRow.countryId !== seller)
        fail('PLAYER_FACTORY_BASELINE_NOT_REGISTERED', { seller, baselineResult, diagnostics: baseline.diagnostics() });

      const baselineRuntimeRegistry = baseline.getCountryFactoryRegistry(seller);
      if (!baselineRuntimeRegistry || baselineRuntimeRegistry.runtimeStatus !== 'REGISTERED' ||
          baselineRuntimeRegistry.runtimeRegistered !== true) {
        fail('FRESH_PLAYER_COUNTRY_FACTORY_REGISTRY_NOT_ACTIVE', {
          seller,
          simulationSession: g.Game.state?.simulation?.session || null,
          baselineResult,
          baselineRuntimeRegistry,
          baselineDiagnostics: baseline.diagnostics(),
          baselineSource: baseline.getSourceStatus(),
          factoryRegistration: g.Game.state?.simulation?.countryFactoryStartingBaselineV1?.playerCountryFactoryRegistration || null,
          countryFactoryAssetCount: (g.Game.state?.economy?.[seller]?.productionAssets || []).length
        });
      }

      const hydration = await endowment.hydrateCountry(seller);
      const routes = await industrial.loadSiteLogisticsRoutes(seller);
      if (routes?.status && !['READY', 'COMPLETED', 'APPLIED', 'INITIALIZED', 'HYDRATED'].includes(String(routes.status).toUpperCase()))
        fail('MINE_LOGISTICS_ROUTE_REGISTRY_NOT_READY', { seller, routes });
      if (!(Number(catalogDiag?.processingRuleCount) > 0))
        fail('PROCESSING_RULE_CATALOG_EMPTY', catalogDiag);

      const mineCandidates = [];
      const rejectedSites = [];
      for (const site of chosenCountry.mineSites) {
        const resourceId = token(site?.real?.resourceId || site?.sourceSiteRecord?.resourceId ||
          site?.identity?.resourceTypeId || site?.sourceSiteRecord?.resourceTypeId);
        if (!resourceId) continue;
        const factories = industrial.candidateFactories(seller, resourceId, site.siteId);
        for (const candidate of factories) {
          const asset = candidate.asset;
          const recipe = industrial.recipeFor(resourceId, asset);
          const inputs = Object.entries(recipe?.inputs || {});
          const outputs = Object.entries(recipe?.outputs || {})
            .map(([id, ratio]) => ({ id, ratio: Number(ratio) }))
            .filter(row => row.id && Number.isFinite(row.ratio) && row.ratio > 0)
            .sort((a, b) => b.ratio - a.ratio);
          if (inputs.length !== 1 || token(inputs[0][0]) !== resourceId || !outputs.length) continue;

          const plan = industrial.planExtraction({ countryId: seller, siteId: site.siteId, resourceId });
          if (plan?.status !== 'PLANNED' || !(Number(plan.approvedQuantity) > 0)) {
            rejectedSites.push({ siteId: site.siteId, resourceId, reason: plan?.reason || plan?.status || 'EXTRACTION_NOT_PLANNED' });
            continue;
          }
          const routePreview = await industrial.previewSiteTransport({
            countryId: seller, siteId: site.siteId,
            quantity: Number(plan.approvedQuantity), unit: plan.unit
          });
          if (!['READY', 'SIMULATION_ONLY'].includes(String(routePreview?.status || '').toUpperCase())) {
            rejectedSites.push({ siteId: site.siteId, resourceId, reason: routePreview?.reason || routePreview?.status || 'ROUTE_NOT_READY' });
            continue;
          }
          mineCandidates.push({
            siteId: String(site.siteId),
            siteName: String(site.siteName || site.siteId),
            resourceId,
            factoryId: String(asset.id || asset.assetId || asset.projectId || ''),
            factoryType: String(asset.factoryType || asset.type || ''),
            factoryOwnerCompanyId: String(asset.ownerCompanyId || asset.ownerId || ''),
            recipeId: recipe.recipeId || null,
            recipeAuthority: recipe.recipeAuthority || null,
            cycleDays: Number(recipe.cycleDays) || 1,
            inputCoefficient: Number(inputs[0][1]),
            outputProductId: outputs[0].id,
            outputRatio: outputs[0].ratio,
            expectedOutput: Number(plan.approvedQuantity) * outputs[0].ratio,
            plan,
            routePreview
          });
        }
      }
      mineCandidates.sort((a, b) => b.expectedOutput - a.expectedOutput);
      if (!mineCandidates.length)
        fail('NO_REAL_MINE_SITE_HAS_A_LIVE_BASELINE_FACTORY_AND_EXECUTABLE_ROUTE', {
          seller, buyer, hydration, routes, rejectedSites: rejectedSites.slice(0, 40),
          siteCount: chosenCountry.mineSites.length, factoryCount: sellerFactoryAssets.length
        });

      const selected = mineCandidates[0];
      const resourceState = g.Game.state.resource?.[seller];
      if (!resourceState || !Array.isArray(resourceState.batches))
        fail('PLAYER_RESOURCE_LEDGER_NOT_READY', { seller, hydration });
      const beforeBatchIds = new Set(resourceState.batches.map(row => String(row?.batchId || '')).filter(Boolean));
      const turnBeforeExtraction = Number(g.Game.state.simulation?.turn ?? simulation.turn ?? 0);
      const pipelineStart = await industrial.executeSitePipeline({
        countryId: seller,
        siteId: selected.siteId,
        resourceId: selected.resourceId,
        factoryId: selected.factoryId,
        quantity: Number(selected.plan.approvedQuantity)
      });
      const afterExtraction = resourceState.batches.filter(row => {
        const id = String(row?.batchId || '');
        return id && !beforeBatchIds.has(id) && token(row?.resourceId || row?.materialIdentity) === selected.resourceId;
      });
      const network = resourceState.industrialNetwork || {};
      const flowRows = Array.isArray(network.siteFlowLedger) ? network.siteFlowLedger : [];
      const flow = flowRows.filter(row =>
        String(row?.siteId || row?.siteReferenceKey || '') === selected.siteId &&
        token(row?.resourceId) === selected.resourceId &&
        (Number(row?.createdTurn) >= turnBeforeExtraction || afterExtraction.some(batch => String(batch.batchId) === String(row.batchId))))
        .sort((a, b) => Number(b?.createdTurn || b?.lastUpdatedTurn || 0) - Number(a?.createdTurn || a?.lastUpdatedTurn || 0))[0];
      const originBatchId = String(
        pipelineStart?.batchId || pipelineStart?.extraction?.batchId ||
        pipelineStart?.batch?.batchId || pipelineStart?.mineBatch?.batchId ||
        flow?.batchId || afterExtraction[0]?.batchId || ''
      );
      const rawBatch = resourceState.batches.find(row => String(row?.batchId || '') === originBatchId);
      if (['BLOCKED', 'FAILED', 'WAITING_DEPENDENCIES'].includes(String(pipelineStart?.status || '').toUpperCase()))
        fail('MINE_TO_FACTORY_PIPELINE_REJECTED', { pipelineStart, selected: { ...selected, routePreview: undefined } });
      if (!originBatchId || !rawBatch || !(Number(rawBatch.remainingQuantity ?? rawBatch.quantity) > 0))
        fail('MINE_EXTRACTION_DID_NOT_CREATE_A_NEW_PHYSICAL_BATCH', {
          seller, selected: { ...selected, routePreview: undefined }, pipelineStart, afterExtraction, flow
        });

      return {
        seller, buyer, currency: chosenCountry.currency, sessionId,
        sessionStatus: session?.status || null,
        turnBeforeExtraction,
        baselineResult: { status: baselineResult?.status || null, activeAssetCount: baselineRuntimeRegistry?.liveProductionAssetsCreated || 0 },
        hydrationStatus: hydration?.status || null,
        routeRegistryStatus: routes?.status || null,
        selected: {
          siteId: selected.siteId, siteName: selected.siteName, resourceId: selected.resourceId,
          factoryId: selected.factoryId, factoryType: selected.factoryType,
          factoryOwnerCompanyId: selected.factoryOwnerCompanyId, recipeId: selected.recipeId,
          recipeAuthority: selected.recipeAuthority, cycleDays: selected.cycleDays,
          outputProductId: selected.outputProductId, outputRatio: selected.outputRatio,
          expectedOutput: selected.expectedOutput, plan: selected.plan,
          routePreview: {
            status: selected.routePreview.status, routeId: selected.routePreview.routeId || null,
            legs: (selected.routePreview.legs || []).map(leg => ({
              mode: leg.mode || leg.transportMode, distanceKm: leg.distanceKm,
              fleetCount: leg.fleetCount, capacityPerDay: leg.capacityPerDay
            }))
          }
        },
        pipelineStartStatus: pipelineStart?.status || null,
        originBatchId,
        originQuantity: Number(rawBatch.remainingQuantity ?? rawBatch.quantity),
        originUnit: rawBatch.unit || selected.plan.unit || null,
        initialFlowStageCount: Array.isArray(flow?.stages) ? flow.stages.length : 0
      };
    });

    const production = await page.evaluate(async (setup) => {
      const g = window;
      const seller = setup.seller;
      const originBatchId = setup.originBatchId;
      const resource = g.Game.state.resource[seller];
      const simulation = g.Omega.Simulation;
      const finishedStages = new Set(['PROCESSED', 'INTERMEDIATE', 'FINISHED', 'REFINED', 'OUTPUT']);
      const completeStatuses = new Set(['COMPLETED', 'FINISHED', 'PROCESSED', 'AVAILABLE', 'DELIVERED', 'RECEIVED', 'ARRIVED']);
      const batchMap = () => new Map((resource.batches || []).map(row => [String(row?.batchId || ''), row]));
      const hasOrigin = (batch, target, map, seen = new Set()) => {
        const id = String(batch?.batchId || '');
        if (!id || seen.has(id)) return false;
        if (id === target) return true;
        seen.add(id);
        for (const parent of Array.isArray(batch?.sourceBatchIds) ? batch.sourceBatchIds : []) {
          if (String(parent) === target) return true;
          if (hasOrigin(map.get(String(parent)), target, map, seen)) return true;
        }
        return false;
      };
      const currentFlow = () => (resource.industrialNetwork?.siteFlowLedger || [])
        .filter(row => String(row?.batchId || '') === originBatchId).slice(-1)[0] || null;

      const snapshots = [];
      let finished = null;
      for (let offset = 1; offset <= 64; offset++) {
        const turnResult = await simulation.advance(1);
        const turn = Number(g.Game.state.simulation?.turn ?? simulation.turn ?? offset);
        const map = batchMap();
        const candidates = (resource.batches || []).filter(row =>
          finishedStages.has(String(row?.stage || '').toUpperCase()) &&
          hasOrigin(row, originBatchId, map) &&
          Number(row?.remainingQuantity ?? row?.quantity) > 1e-8);
        const chosen = candidates.find(row =>
          String(row.resourceId || row.materialIdentity) === setup.selected.outputProductId) || candidates[0] || null;
        const flow = currentFlow();
        const shipments = Array.isArray(resource.industrialNetwork?.shipments) ? resource.industrialNetwork.shipments : [];
        const relatedShipments = shipments.filter(row => String(row?.batchId || '') === originBatchId);
        const receipts = [
          ...(resource.warehouse?.receipts || []),
          ...(resource.rawWarehouse?.receipts || []),
          ...(resource.warehouseReceiptLedger || [])
        ];
        const receipt = receipts.find(row =>
          String(row?.batchId || '') === originBatchId &&
          completeStatuses.has(String(row?.status || 'RECEIVED').toUpperCase()));
        snapshots.push({
          turn, simulationStatus: turnResult?.status || null,
          flowStages: (flow?.stages || []).map(row => String(row.stage) + ':' + String(row.status)),
          shipmentStages: relatedShipments.map(row => String(row.shipmentType) + ':' + String(row.status)),
          receiptId: receipt?.receiptId || null, finishedBatchId: chosen?.batchId || null
        });
        if (turnResult?.status && ['FAILED', 'ERROR'].includes(String(turnResult.status).toUpperCase()))
          throw new Error('SIMULATION_TURN_FAILED:' + turn + ':' + JSON.stringify(turnResult).slice(0, 1200));

        const mineShipmentDelivered = relatedShipments.some(row =>
          String(row.shipmentType || '').toUpperCase().includes('MINE') &&
          String(row.shipmentType || '').toUpperCase().includes('WAREHOUSE') &&
          completeStatuses.has(String(row.status || '').toUpperCase()));
        const factoryShipmentDelivered = relatedShipments.some(row =>
          ['WAREHOUSE_TO_FACTORY', 'RAW_TO_FACTORY', 'FACTORY_INPUT'].includes(String(row.shipmentType || '').toUpperCase()) &&
          completeStatuses.has(String(row.status || '').toUpperCase()));
        if (chosen && receipt && mineShipmentDelivered && factoryShipmentDelivered) {
          finished = { batch: chosen, flow, receipt, shipments: relatedShipments, turn, snapshots: snapshots.slice(-18) };
          break;
        }
        if (offset % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (!finished) {
        throw new Error('MINE_TO_FINISHED_GOODS_DID_NOT_COMPLETE:' + JSON.stringify({
          turn: Number(g.Game.state.simulation?.turn ?? simulation.turn ?? 0),
          flow: currentFlow(), snapshots: snapshots.slice(-20),
          mineShipments: (resource.industrialNetwork?.shipments || []).filter(row => String(row?.batchId || '') === originBatchId)
        }).slice(0, 10000));
      }

      const output = finished.batch;
      const outputResourceId = String(output.resourceId || output.materialIdentity);
      const outputQuantity = Number(output.remainingQuantity ?? output.quantity);
      const factoryAssets = g.Game.state.economy?.[seller]?.productionAssets || [];
      const factory = factoryAssets.find(asset =>
        String(asset?.id || asset?.assetId || asset?.projectId) === setup.selected.factoryId);
      const inputLots = Array.isArray(factory?.inputBatchLots) ? factory.inputBatchLots : [];
      const relatedInputLots = inputLots.filter(lot =>
        String(lot?.batchId || '') === originBatchId ||
        (Array.isArray(lot?.sourceBatchIds) && lot.sourceBatchIds.map(String).includes(originBatchId)));
      const outputInventory = resource.inventory || {};
      const processedInventory = resource.processedWarehouse?.availableByResource || {};
      const inventoryValue = map => {
        const key = Object.keys(map).find(value => String(value).toLowerCase() === outputResourceId.toLowerCase());
        return key === undefined ? 0 : Math.max(0, Number(map[key]) || 0);
      };
      const inventoryQuantity = Math.min(inventoryValue(outputInventory), inventoryValue(processedInventory));
      if (!(outputQuantity > 0 && inventoryQuantity > 0))
        throw new Error('FINISHED_GOODS_NOT_POSTED_TO_PROCESSED_WAREHOUSE:' + JSON.stringify({
          output, outputInventory, processedInventory
        }).slice(0, 3500));
      if (!finished.flow || !(Number(finished.flow.mineWarehouseReceivedQuantity) > 0))
        throw new Error('MINE_RAW_WAREHOUSE_RECEIPT_LINEAGE_MISSING:' + JSON.stringify(finished.flow).slice(0, 3500));
      const processingStage = (finished.flow.stages || []).find(row =>
        String(row.stage || '').toUpperCase() === 'PROCESSING' &&
        completeStatuses.has(String(row.status || '').toUpperCase()));
      if (!processingStage)
        throw new Error('FACTORY_PROCESSING_COMPLETION_NOT_IN_MINE_FLOW:' + JSON.stringify(finished.flow.stages || []).slice(0, 3500));

      return {
        outputBatchId: String(output.batchId),
        outputResourceId,
        outputQuantity,
        outputUnit: output.unit || null,
        sourceBatchIds: Array.isArray(output.sourceBatchIds) ? output.sourceBatchIds.map(String) : [],
        originBatchId,
        factoryId: setup.selected.factoryId,
        factoryType: setup.selected.factoryType,
        factoryOwnerCompanyId: output.ownerCompanyId || factory?.ownerCompanyId || null,
        outputInventoryQuantity: inventoryValue(outputInventory),
        processedWarehouseQuantity: inventoryValue(processedInventory),
        processingStage: { stage: processingStage.stage, status: processingStage.status, turn: processingStage.turn || null },
        mineWarehouseReceipt: {
          receiptId: finished.receipt.receiptId, quantity: finished.receipt.quantity, status: finished.receipt.status
        },
        shipments: finished.shipments.map(row => ({
          shipmentId: row.shipmentId, shipmentType: row.shipmentType, status: row.status,
          quantity: row.quantity, warehouseId: row.warehouseId, factoryId: row.factoryId || null
        })),
        relatedInputLotCount: relatedInputLots.length,
        inputLotStatuses: relatedInputLots.map(row => row.status),
        turn: finished.turn,
        turnSnapshots: finished.snapshots
      };
    }, setup);

    const sale = await page.evaluate(async ({ setup, production }) => {
      const g = window;
      const seller = setup.seller;
      const buyer = setup.buyer;
      const productId = production.outputResourceId;
      const resourceRoot = g.Game.state.resource || (g.Game.state.resource = {});
      const buyerResource = resourceRoot[buyer] || (resourceRoot[buyer] = {});
      buyerResource.inventory = buyerResource.inventory && typeof buyerResource.inventory === 'object'
        ? buyerResource.inventory : {};
      const normalize = value => String(value ?? '').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const readStock = (country, id) => {
        const inventory = g.Game.state.resource?.[country]?.inventory || {};
        const key = Object.keys(inventory).find(candidate => normalize(candidate) === normalize(id));
        return key === undefined ? 0 : Math.max(0, Number(inventory[key]) || 0);
      };
      const openingKeys = Object.keys(buyerResource.inventory).filter(key => normalize(key) === normalize(productId));
      if (openingKeys.length > 1) throw new Error('BUYER_PRODUCT_STOCK_KEYS_AMBIGUOUS:' + openingKeys.join(','));
      if (!openingKeys.length) buyerResource.inventory[productId] = 0;
      const buyerOpeningStock = readStock(buyer, productId);
      if (buyerOpeningStock !== 0) throw new Error('BUYER_ALREADY_OWNS_FINISHED_GOODS:' + buyerOpeningStock);

      const relationRoot = g.Game.state.foreign || (g.Game.state.foreign = {});
      const buyerForeign = relationRoot[buyer] || (relationRoot[buyer] = {});
      buyerForeign.relations = buyerForeign.relations && typeof buyerForeign.relations === 'object'
        ? buyerForeign.relations : {};
      buyerForeign.relations[seller] = {
        overall: 95, trade: 95, trust: 95, political: 95,
        trade_agreement: true, war_state: false, sanctions: false,
        testPreconditionOnly: true
      };

      const bank = g.OmegaGovernmentBanking;
      const market = g.Omega.GlobalMarket;
      const trade = g.OmegaGlobalTrade;
      const rawOffers = () => {
        const value = g.Game.state.trade?.[seller]?.offerBook;
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return [];
        return Object.entries(value).flatMap(([resourceId, row]) => Array.isArray(row)
          ? row.map(item => ({ ...item, resourceId: item.resourceId || resourceId, countryId: item.countryId || seller }))
          : row && typeof row === 'object'
            ? [{ ...row, resourceId: row.resourceId || resourceId, countryId: row.countryId || seller }]
            : []);
      };
      const includesOrigin = offer => {
        const direct = Array.isArray(offer.sourceBatchIds) ? offer.sourceBatchIds.map(String) : [];
        const allocations = Array.isArray(offer.batchAllocations) ? offer.batchAllocations : [];
        const ids = allocations.flatMap(row => [
          row.batchId, row.originatingBatchId, ...(Array.isArray(row.sourceBatchIds) ? row.sourceBatchIds : [])
        ].filter(Boolean).map(String));
        return direct.includes(production.originBatchId) || direct.includes(production.outputBatchId) ||
          ids.includes(production.originBatchId) || ids.includes(production.outputBatchId);
      };

      let chosenOffer = null;
      for (let offset = 0; offset <= 28; offset++) {
        market.rebuild();
        const offers = rawOffers().filter(row =>
          normalize(row.resourceId) === normalize(productId) &&
          row.source === 'OMEGA_RESOURCE_ECON_AUTO_OFFER' &&
          Number(row.unitPrice ?? row.price) > 0 &&
          Number(row.quantity ?? row.available) >= 1 &&
          includesOrigin(row));
        offers.sort((a, b) => Number(b.quantity ?? b.available) - Number(a.quantity ?? a.available));
        if (offers.length) {
          chosenOffer = offers[0];
          break;
        }
        if (offset < 28) {
          const tick = await g.Omega.Simulation.advance(1);
          if (tick?.status && ['FAILED', 'ERROR'].includes(String(tick.status).toUpperCase()))
            throw new Error('POST_PRODUCTION_MARKET_TURN_FAILED:' + JSON.stringify(tick).slice(0, 1000));
        }
      }
      if (!chosenOffer)
        throw new Error('FINISHED_BATCH_NEVER_ENTERED_EXECUTABLE_MARKET_OFFER_BOOK:' + JSON.stringify({
          productId, outputBatchId: production.outputBatchId, originBatchId: production.originBatchId,
          offers: rawOffers().filter(row => normalize(row.resourceId) === normalize(productId)),
          market: market.diagnostics()
        }).slice(0, 9000));

      const offerQuantity = Number(chosenOffer.quantity ?? chosenOffer.available);
      const quantity = Math.min(1, offerQuantity, production.outputQuantity);
      const unitPrice = Number(chosenOffer.unitPrice ?? chosenOffer.price);
      if (!(quantity > 0 && unitPrice > 0)) throw new Error('MARKET_ORDER_QUANTITY_OR_PRICE_INVALID');
      const sellerBeforeStock = readStock(seller, productId);
      const buyerBeforeTreasury = bank.accountSummary(buyer);
      const sellerBeforeTreasury = bank.accountSummary(seller);
      const buyerBeforeUsd = Number(buyerBeforeTreasury?.treasuryBalanceUsd);
      const sellerBeforeUsd = Number(sellerBeforeTreasury?.treasuryBalanceUsd);
      if (!Number.isFinite(buyerBeforeUsd) || buyerBeforeUsd < unitPrice * quantity)
        throw new Error('BUYER_TREASURY_CANNOT_FUND_MARKET_ORDER:' + JSON.stringify(buyerBeforeTreasury));
      if (!Number.isFinite(sellerBeforeUsd)) throw new Error('SELLER_TREASURY_SNAPSHOT_UNAVAILABLE');

      const requestId = 'MINE-MARKET-' + seller + '-' + buyer + '-' + Date.now() + '-' +
        Math.random().toString(36).slice(2, 8);
      const created = trade.createRequest(buyer, {
        requestId, targetCountryId: seller, resourceId: productId, quantity, unitPrice,
        currency: chosenOffer.currency || trade.currencyOf(buyer),
        needPressure: 0.99,
        source: 'OMEGA_REAL_BROWSER_MINE_FACTORY_MARKET_TREASURY'
      });
      if (!created?.accepted) throw new Error('MARKET_BUY_ORDER_NOT_ACCEPTED:' + JSON.stringify(created));

      market.rebuild();
      const quote = market.quote(productId);
      if (String(quote?.status || '').toUpperCase() !== 'CLEARED' ||
          !(Number(quote?.matchedQuantity) > 0 || Number(quote?.clearingPriceUsd) > 0))
        throw new Error('REAL_MARKET_BID_DID_NOT_CLEAR_AGAINST_FACTORY_OFFER:' + JSON.stringify(quote).slice(0, 3500));

      const outputBatch = (g.Game.state.resource?.[seller]?.batches || [])
        .find(row => String(row.batchId) === production.outputBatchId);
      const outputBatchQuantityBefore = Number(outputBatch?.remainingQuantity ?? outputBatch?.quantity);
      if (!(outputBatchQuantityBefore + 1e-7 >= quantity))
        throw new Error('SELLER_OUTPUT_BATCH_CANNOT_BACK_MARKET_ORDER:' + outputBatchQuantityBefore);

      for (let attempt = 0; attempt < 3; attempt++) {
        trade.processAll();
        const requests = g.Game.state.trade?.[buyer]?.importRequests || [];
        const current = requests.find(row => String(row.requestId) === requestId);
        if (String(current?.status || '').toUpperCase() === 'SETTLED') break;
      }
      const request = (g.Game.state.trade?.[buyer]?.importRequests || [])
        .find(row => String(row.requestId) === requestId);
      const settlementId = 'SET-' + buyer + '-' + seller + '-' +
        requestId.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 180);
      if (String(request?.status || '').toUpperCase() !== 'SETTLED')
        throw new Error('MARKET_REQUEST_NOT_SETTLED:' + JSON.stringify({
          request, settlementTrace: g.__OMEGA_SETTLEMENT_TRACE,
          buyerTreasury: bank.accountSummary(buyer), sellerTreasury: bank.accountSummary(seller)
        }).slice(0, 6500));

      const storedTransaction = bank.getTransaction(settlementId);
      const transaction = storedTransaction?.result || storedTransaction;
      if (!storedTransaction || String(storedTransaction.status || transaction?.status || '').toUpperCase() !== 'SETTLED')
        throw new Error('BANK_TREASURY_TRANSACTION_NOT_SETTLED:' + JSON.stringify(storedTransaction).slice(0, 3500));
      const buyerDebitUsd = Number(transaction.buyerDebitUsd);
      const sellerCreditUsd = Number(transaction.sellerCreditUsd);
      if (!(buyerDebitUsd > 0 && sellerCreditUsd > 0))
        throw new Error('BANK_TREASURY_DEBIT_CREDIT_MISSING:' + JSON.stringify(transaction).slice(0, 3500));

      const buyerAfterStock = readStock(buyer, productId);
      const sellerAfterStock = readStock(seller, productId);
      const buyerAfterTreasury = bank.accountSummary(buyer);
      const sellerAfterTreasury = bank.accountSummary(seller);
      const buyerAfterUsd = Number(buyerAfterTreasury?.treasuryBalanceUsd);
      const sellerAfterUsd = Number(sellerAfterTreasury?.treasuryBalanceUsd);
      const close = (actual, expected, label, tolerance = 0.05) => {
        if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance)
          throw new Error('LEDGER_RECONCILIATION_FAILED:' + label + ':actual=' + actual + ':expected=' + expected);
      };
      close(buyerAfterUsd, buyerBeforeUsd - buyerDebitUsd, 'BUYER_TREASURY_DEBIT');
      close(sellerAfterUsd, sellerBeforeUsd + sellerCreditUsd, 'SELLER_TREASURY_CREDIT');
      close(buyerAfterStock - buyerOpeningStock, quantity, 'BUYER_FINISHED_GOODS_RECEIPT', 1e-5);
      close(sellerBeforeStock - sellerAfterStock, quantity, 'SELLER_FINISHED_GOODS_DEBIT', 1e-5);

      const transactionTransfers = Array.isArray(transaction.batchTransfers) ? transaction.batchTransfers : [];
      const soldOutputBatch = transactionTransfers.some(row =>
        String(row.sourceBatchId || '') === production.outputBatchId ||
        (Array.isArray(row.sourceBatchIds) && row.sourceBatchIds.map(String).includes(production.outputBatchId)));
      const soldOriginBatch = transactionTransfers.some(row =>
        String(row.sourceBatchId || '') === production.originBatchId ||
        (Array.isArray(row.sourceBatchIds) && row.sourceBatchIds.map(String).includes(production.originBatchId)));
      if (!soldOutputBatch || !soldOriginBatch)
        throw new Error('TREASURY_TRANSACTION_LOST_MINE_TO_FACTORY_BATCH_LINEAGE:' + JSON.stringify({
          outputBatchId: production.outputBatchId, originBatchId: production.originBatchId,
          batchTransfers: transactionTransfers
        }).slice(0, 4500));

      const clearingRows = g.Game.state.finance?.[seller]?.resourceSettlementClearing || [];
      const companyClearing = clearingRows.find(row => String(row.settlementId || '') === settlementId);
      if (!companyClearing || !(Number(companyClearing.amount) > 0) ||
          String(companyClearing.companyId || '') !== String(production.factoryOwnerCompanyId || ''))
        throw new Error('SELLER_COMPANY_RECEIPT_NOT_RECONCILED_TO_TREASURY_CLEARING:' + JSON.stringify({
          settlementId, expectedCompany: production.factoryOwnerCompanyId, clearingRows: clearingRows.slice(-8)
        }).slice(0, 4000));

      return {
        productId, quantity, unitPrice, offerId: chosenOffer.offerId, offerQuantity,
        offerSourceBatchIds: chosenOffer.sourceBatchIds || [],
        marketQuote: {
          status: quote.status, clearingPriceUsd: quote.clearingPriceUsd,
          matchedQuantity: quote.matchedQuantity, bestBidUsd: quote.bestBidUsd, bestAskUsd: quote.bestAskUsd
        },
        requestId, requestStatus: request.status, settlementId,
        treasuryTransaction: {
          transactionId: transaction.transactionId || transaction.id || settlementId,
          status: storedTransaction.status,
          buyerDebitUsd, sellerCreditUsd,
          buyerTreasuryBeforeUsd: buyerBeforeUsd, buyerTreasuryAfterUsd: buyerAfterUsd,
          sellerTreasuryBeforeUsd: sellerBeforeUsd, sellerTreasuryAfterUsd: sellerAfterUsd
        },
        goodsLedger: {
          buyerBefore: buyerOpeningStock, buyerAfter: buyerAfterStock,
          sellerBefore: sellerBeforeStock, sellerAfter: sellerAfterStock,
          soldOutputBatchId: production.outputBatchId,
          transferredBatchCount: transactionTransfers.length,
          companyReceipt: companyClearing
        }
      };
    }, { setup, production });

    const persistence = await page.evaluate(async ({ setup, production, sale }) => {
      const simulation = window.Omega.Simulation;
      const slot = 'OMEGA-MINE-MARKET-TREASURY-' + setup.seller + '-' + Date.now();
      const save = await simulation.saveSlot(slot);
      if (!save || save.ok === false || String(save.status || '').toUpperCase() === 'FAILED')
        throw new Error('FULL_PIPELINE_SAVE_FAILED:' + JSON.stringify(save).slice(0, 1500));
      const load = await simulation.loadSlot(slot);
      if (!load || load.ok === false || String(load.status || '').toUpperCase() === 'FAILED')
        throw new Error('FULL_PIPELINE_LOAD_FAILED:' + JSON.stringify(load).slice(0, 1500));

      const stored = window.OmegaGovernmentBanking.getTransaction(sale.settlementId);
      const transaction = stored?.result || stored;
      const sellerResource = window.Game.state.resource?.[setup.seller];
      const buyerResource = window.Game.state.resource?.[setup.buyer];
      const savedOutput = (sellerResource?.batches || []).find(row => String(row.batchId) === production.outputBatchId);
      const savedOrigin = (sellerResource?.batches || []).find(row => String(row.batchId) === production.originBatchId);
      const buyerInventoryKey = Object.keys(buyerResource?.inventory || {}).find(key =>
        String(key).toLowerCase() === production.outputResourceId.toLowerCase());
      const buyerFinishedGoods = buyerInventoryKey === undefined ? 0 : Number(buyerResource.inventory[buyerInventoryKey]);
      if (String(stored?.status || transaction?.status || '').toUpperCase() !== 'SETTLED' ||
          !savedOutput || !savedOrigin || !(buyerFinishedGoods > 0))
        throw new Error('SAVE_LOAD_DID_NOT_RESTORE_THE_COMPLETED_PIPELINE:' + JSON.stringify({
          load, transaction: stored, savedOutput: !!savedOutput, savedOrigin: !!savedOrigin,
          buyerFinishedGoods
        }).slice(0, 3500));
      return {
        slot, saveStatus: save.status || 'COMPLETED', loadStatus: load.status || 'COMPLETED',
        loadIntegrity: simulation.lastLoadIntegrity || null,
        restoredSettlementStatus: stored.status || transaction.status,
        restoredMineBatchId: savedOrigin.batchId,
        restoredFinishedGoodsBatchId: savedOutput.batchId,
        restoredBuyerFinishedGoods: buyerFinishedGoods
      };
    }, { setup, production, sale });

    const report = {
      status: 'PASS',
      test: 'ONE_CHROMIUM_SESSION_MINE_FACTORY_MARKET_TREASURY',
      session: { id: setup.sessionId, seller: setup.seller, buyer: setup.buyer, currency: setup.currency },
      mine: {
        siteId: setup.selected.siteId, siteName: setup.selected.siteName,
        resourceId: setup.selected.resourceId, batchId: setup.originBatchId,
        quantity: setup.originQuantity, unit: setup.originUnit,
        pipelineStartStatus: setup.pipelineStartStatus
      },
      factory: {
        factoryId: production.factoryId, factoryType: production.factoryType,
        ownerCompanyId: production.factoryOwnerCompanyId,
        inputLots: production.relatedInputLotCount, outputBatchId: production.outputBatchId,
        outputResourceId: production.outputResourceId, outputQuantity: production.outputQuantity,
        processingStage: production.processingStage
      },
      logistics: { mineWarehouseReceipt: production.mineWarehouseReceipt, shipments: production.shipments },
      marketAndTreasury: sale,
      persistence
    };
    await saveArtifact('omega-mine-factory-market-treasury-result.json', report);
    if (pageErrors.length) throw new Error('BROWSER_PAGE_ERRORS:' + pageErrors.slice(0, 8).join('\n'));
    t.diagnostic('Full pipeline completed in one Chromium context: ' + setup.seller + ' mine → ' +
      production.outputResourceId + ' → ' + setup.buyer + ' → Treasury.');
  } catch (error) {
    const diagnostic = {
      status: 'FAIL', error: String(error?.stack || error),
      details: error?.details || null, pageErrors,
      consoleErrors: consoleErrors.slice(-80)
    };
    try {
      await mkdir(ARTIFACT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'omega-mine-factory-market-treasury-failure.png'),
        fullPage: true
      });
    } catch {}
    await saveArtifact('omega-mine-factory-market-treasury-failure.json', diagnostic).catch(() => {});
    throw error;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await new Promise(resolve => host.server.close(resolve)).catch(() => {});
  }
});
