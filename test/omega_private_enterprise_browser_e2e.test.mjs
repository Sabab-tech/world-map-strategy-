import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function startStaticServer() {
  const server = http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      res.writeHead(405).end();
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname); }
    catch {
      res.writeHead(400).end();
      return;
    }
    if (pathname === '/') pathname = '/index.html';
    const file = path.resolve(ROOT, '.' + pathname);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.stat(file, (statError, stat) => {
      if (statError || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        origin: 'http://127.0.0.1:' + address.port,
        close: () => new Promise(done => { server.closeAllConnections?.(); server.close(() => done()); })
      });
    });
  });
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

test('real Chromium browser boots OMEGA, submits a no-side-effect private proposal, survives responsive navigation and records performance', {
  timeout: 240000
}, async () => {
  const artifacts = process.env.OMEGA_BROWSER_TEST_ARTIFACT_DIR || path.join(ROOT, 'test-results', 'omega-private-enterprise-browser');
  fs.mkdirSync(artifacts, { recursive: true });
  const server = await startStaticServer();
  let browser;
  const pageErrors = [];
  const consoleErrors = [];
  const factoryInputPerfLogs = [];
  const blockedExternalRequests = [];
  const navigationLatencyMs = [];
  const metrics = { origin: server.origin, browser: 'Chromium', viewportRuns: [], navigationLatencyMs };

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const viewportSession = await context.newCDPSession(page);
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
    page.on('console', message => {
      const text = message.text();
      if (message.type() === 'error') consoleErrors.push(text);
      if (text.startsWith('[OMEGA_BOOT_FACTORY_INPUT_PERF_')) factoryInputPerfLogs.push(text);
    });
    page.on('requestfailed', request => {
      const url = request.url();
      if (!url.startsWith(server.origin)) blockedExternalRequests.push({
        url,
        error: request.failure()?.errorText || 'REQUEST_FAILED'
      });
    });
    await page.route('**/*', route => {
      const target = route.request().url();
      if (target.startsWith(server.origin)) return route.continue();
      blockedExternalRequests.push({ url: target, error: 'EXTERNAL_NETWORK_DISABLED_FOR_OFFLINE_ACCEPTANCE' });
      return route.abort('blockedbyclient');
    });

    const loadStarted = performance.now();
    await page.goto(server.origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => {
      return document.readyState === 'complete' &&
        !!document.getElementById('omega-gov-entry-v3') &&
        !!window.Game?.state &&
        !!window.Omega?.Simulation &&
        !!window.OmegaUIV2Integration &&
        typeof window.OmegaUIV2Integration.openRoute === 'function' &&
        !!window.OmegaPrivateEnterpriseLifecycleV1;
    }, null, { timeout: 150000 });
    metrics.coreBootMs = Number((performance.now() - loadStarted).toFixed(2));

    const routeResult = await page.evaluate(() => {
      const country = 'BGD';
      // Set every country-selection authority before opening the existing route.
      // The UI host intentionally prioritizes OmegaMinistryViewCountry and the
      // cabinet's selected country over Game.currentActiveCountry.
      window.OmegaMinistryViewCountry = country;
      window.Game.currentActiveCountry = country;
      window.Game.selectedCountryId = country;
      window.Game.playerCountry = country;
      window.Game.state.playerCountryId = country;
      if (window.OmegaCabinetUI) window.OmegaCabinetUI.activeCountry = country;
      if (window.CountryIOS) window.CountryIOS.activeCountry = country;
      if (window.Omega?.Simulation?.createSession) {
        const session = window.Omega.Simulation.createSession({ playerCountryId: country });
        if (!session || session.playerCountryId !== country) return { ok: false, reason: 'PLAYER_SESSION_NOT_CREATED' };
      }
      // Reconcile an already-mounted cabinet before navigating. This invokes
      // the real country-select handler rather than mutating its private state.
      const cabinet = document.getElementById('cabinet-full-window');
      const selector = cabinet?.querySelector('[data-omega-v2-country]');
      if (selector && selector.value !== country) {
        selector.value = country;
        selector.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const opened = window.OmegaUIV2Integration.openRoute('industry') === true;
      const mountedCountry = cabinet?.__omegaUIV2State?.countryId || null;
      return {
        ok: opened && (!mountedCountry || mountedCountry === country),
        reason: mountedCountry && mountedCountry !== country ? 'UI_COUNTRY_MISMATCH' : null,
        mountedCountry,
        country
      };
    });
    assert.equal(routeResult.ok, true, 'existing Industry route must open for the selected country');

    const linesTab = page.locator('#cabinet-full-window [data-omega-v2-main] [data-omega-v2-industry-tab="production-lines"]');
    await linesTab.waitFor({ state: 'visible', timeout: 30000 });
    await linesTab.click();
    try {
      await page.locator('[data-omega-private-company-lifecycle] [data-pe-proposal-form]').waitFor({
        state: 'visible',
        timeout: 45000
      });
    } catch (error) {
      const diagnostics = await page.evaluate(() => {
        const cabinet = document.getElementById('cabinet-full-window');
        const main = cabinet?.querySelector('[data-omega-v2-main]');
        const shell = main?.querySelector('.omega-v2-factory-command');
        const panel = cabinet?.querySelector('[data-omega-private-company-lifecycle]');
        const industryRoots = [cabinet, ...(cabinet ? Array.from(cabinet.querySelectorAll('*')) : [])]
          .filter(node => node && (
            Object.prototype.hasOwnProperty.call(node, '__omegaV2IndustryTab') ||
            Object.prototype.hasOwnProperty.call(node, '__omegaV2IndustryCountryId') ||
            Object.prototype.hasOwnProperty.call(node, '__omegaV2IndustryOptions')
          ))
          .map(node => ({
            tag:node.tagName || null,
            id:node.id || null,
            className:typeof node.className === 'string' ? node.className.slice(0,160) : null,
            industryTab:node.__omegaV2IndustryTab || null,
            industryCountry:node.__omegaV2IndustryCountryId || null,
            optionsTab:node.__omegaV2IndustryOptions?.tab || null,
            optionsCountry:node.__omegaV2IndustryOptions?.countryId || null,
            shellTab:node.querySelector?.('.omega-v2-factory-command')?.getAttribute('data-active-tab') || null
          }));
        const describe = api => {
          try { return api && typeof api.diagnostics === 'function' ? api.diagnostics() : null; }
          catch (diagnosticError) { return { error:String(diagnosticError && diagnosticError.message || diagnosticError) }; }
        };
        return {
          playerCountry: window.Omega?.Simulation?.getPlayerCountryId?.() ||
            window.Game?.state?.simulation?.session?.playerCountryId ||
            window.Game?.state?.playerCountryId || null,
          uiCountry: cabinet?.__omegaUIV2State?.countryId || main?.__omegaUIV2State?.countryId || null,
          industryRoots,
          ministryViewCountry: window.OmegaMinistryViewCountry || null,
          cabinetActiveCountry: window.OmegaCabinetUI?.activeCountry || null,
          countrySelectorValue: main?.querySelector('[data-omega-v2-country]')?.value || null,
          industryHookInstalled: !!window.OmegaUIV2Industry?.__privateLifecycleWrapped,
          industryTab: shell?.getAttribute('data-active-tab') || null,
          lifecycleApiReady: !!window.OmegaPrivateEnterpriseLifecycleV1,
          privateRegistry: describe(window.OmegaPrivateEnterpriseRegistryV1),
          governmentFactoryRegistry: describe(window.OmegaCountryFactoryStartingBaselineV1),
          panelText: panel?.textContent?.slice(0, 1200) || null,
          panelHtml: panel?.outerHTML?.slice(0, 2400) || null,
          bootResourceErrors: window.__OMEGA_DIAG__?.resources?.slice(-25) || [],
          baselineRequests: performance.getEntriesByType('resource')
            .filter(entry => /factory.*baseline|resource.*catalog|country.*context|economy.*profiles/i.test(entry.name))
            .map(entry => ({ name:entry.name, duration:Math.round(entry.duration), transferSize:entry.transferSize || 0 }))
        };
      }).catch(diagnosticError => ({ diagnosticError:String(diagnosticError && diagnosticError.message || diagnosticError) }));
      throw new Error('Private Company proposal form did not mount. Initial wait: ' +
        String(error && error.message || error) + '. Runtime diagnostics: ' + JSON.stringify(diagnostics));
    }
    await page.locator('[data-omega-private-company-lifecycle] select[name="operatorCompanyId"]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const form = document.querySelector('[data-omega-private-company-lifecycle] [data-pe-proposal-form]');
      const owner = form?.querySelector('select[name="companyId"]');
      const operator = form?.querySelector('select[name="operatorCompanyId"]');
      const factory = form?.querySelector('select[name="factoryType"]');
      return !!form && form.getAttribute('aria-busy') !== 'true' &&
        !!owner && !owner.disabled && !!operator && !operator.disabled &&
        !!factory && !factory.disabled && owner.options.length === 5 && operator.options.length === 5;
    }, null, { timeout: 45000 });

    const marketDetails = page.locator('[data-omega-private-company-lifecycle] [data-pe-market-details]');
    await marketDetails.locator('summary').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-pe-market-host]')?.getAttribute('data-loaded') === 'true'
    , null, { timeout: 15000 });
    const marketPanelText = await page.locator('[data-pe-market-host]').textContent();
    assert.match(marketPanelText,/No verified, settled private-company sales|concentration/i,
      'market concentration panel must render from the recorded settled-sales ledger');
    await marketDetails.locator('summary').click();

    const oversightDetails = page.locator('[data-omega-private-company-lifecycle] [data-pe-oversight-details]');
    await oversightDetails.locator('summary').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-pe-oversight-host]')?.getAttribute('data-loaded') === 'true'
    , null, { timeout: 15000 });
    const oversightPanelText = await page.locator('[data-pe-oversight-host]').textContent();
    assert.match(oversightPanelText,/Company solvency and current liabilities/);
    assert.match(oversightPanelText,/AURORA|NOVA|MERIDIAN/);
    assert.match(oversightPanelText,/Government restructuring decisions/);
    await oversightDetails.locator('summary').click();

    const before = await page.evaluate(() => {
      const state = window.Game.state;
      const country = 'BGD';
      const resource = state.resource?.[country] || {};
      const economy = state.economy?.[country] || {};
      const finance = state.finance?.[country] || {};
      const network = resource.industrialNetwork || {};
      const proposalRows = window.OmegaPrivateEnterpriseLifecycleV1?.getCountryDashboard?.(country)?.proposals || [];
      return {
        inventory: JSON.stringify(resource.inventory || {}),
        warehouse: JSON.stringify(resource.warehouse || {}),
        treasury: Number(finance.available ?? finance.omegaFinance?.treasuryBalanceUsd ?? 0),
        assets: (economy.productionAssets || []).length,
        projects: (network.projects || []).length,
        proposalCount: proposalRows.length,
        proposalIds: proposalRows.map(row => row.proposalId),
        turn: Number(state.simulation?.turn || 0),
        foreignCountry: JSON.stringify({
          inventory: state.resource?.USA?.inventory || {},
          warehouse: state.resource?.USA?.warehouse || {},
          treasury: state.finance?.USA?.available || 0,
          assets: state.economy?.USA?.productionAssets || []
        })
      };
    });

    const form = page.locator('[data-pe-proposal-form]');
    const companySelect = form.locator('select[name="companyId"]');
    const operatorSelect = form.locator('select[name="operatorCompanyId"]');
    const factorySelect = form.locator('select[name="factoryType"]');
    const processingResourceSelect = form.locator('select[name="processingResourceId"]');
    await page.evaluate(() => {
      const target = document.querySelector('[data-pe-proposal-form]');
      const button = target?.querySelector('button[type="submit"]');
      window.__omegaProposalSubmitTrace = {
        validity:target?.checkValidity?.() ?? null,
        validityMessage:target?.validationMessage || '',
        submitButtonType:button?.type || null,
        lifecycleRootHasSubmitHandler:!![...document.querySelectorAll('#cabinet-full-window *')]
          .find(node=>node.__omegaPrivateEnterpriseUiBound)
      };
      document.addEventListener('submit', event => {
        window.__omegaProposalSubmitTrace = Object.assign({},window.__omegaProposalSubmitTrace,{
          captureSeen:true, captureDefaultPrevented:event.defaultPrevented,
          captureFormMatches:!!event.target?.matches?.('[data-pe-proposal-form]')
        });
      }, true);
      document.addEventListener('submit', event => {
        window.__omegaProposalSubmitTrace = Object.assign({},window.__omegaProposalSubmitTrace,{
          bubbleSeen:true, bubbleDefaultPrevented:event.defaultPrevented,
          bubbleFormMatches:!!event.target?.matches?.('[data-pe-proposal-form]')
        });
      });
    });
    const companyOptions = await companySelect.locator('option').evaluateAll(nodes =>
      nodes.map(node => node.value).filter(Boolean)
    );
    assert.equal(companyOptions.length, 5, 'the player must see the five globally canonical companies');
    await companySelect.selectOption(companyOptions[0]);
    await operatorSelect.selectOption(companyOptions[1]);
    const factoryOptions = await factorySelect.locator('option').evaluateAll(nodes =>
      nodes.map(node => node.value).filter(Boolean)
    );
    assert.ok(factoryOptions.length >= 1, 'at least one existing canonical factory profile must be selectable');
    const selectedFactoryType = factoryOptions[0];
    await factorySelect.selectOption(selectedFactoryType);
    let processingResourceId = null;
    if (selectedFactoryType === 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT') {
      await processingResourceSelect.waitFor({state:'visible'});
      const processingOptions = await processingResourceSelect.locator('option').evaluateAll(nodes =>
        nodes.map(node => node.value).filter(Boolean)
      );
      assert.ok(processingOptions.length > 0, 'Universal Materials must use an existing catalog processing rule');
      processingResourceId = processingOptions[0];
      await processingResourceSelect.selectOption(processingResourceId);
    }
    await form.locator('textarea[name="requestReason"]').fill(
      'The company requests additional manufacturing capacity to support a documented domestic supply need.');
    await form.locator('textarea[name="expectedBenefit"]').fill(
      'The project adds modeled processing capacity; realized revenue depends on confirmed customer demand and settled sales.');
    await form.locator('textarea[name="riskForecast"]').fill(
      'Material risks include recipe inputs, capital, utilities, workforce, transport, storage and unconfirmed customer demand.');
    await form.locator('input[name="quantity"]').fill('1');
    await form.locator('select[name="sourcingPolicy"]').selectOption('MIXED');
    await form.locator('button[type="submit"]').click();

    const proposalCriteria = {
      owner:companyOptions[0], operator:companyOptions[1],
      factoryType:selectedFactoryType, processingResourceId, previousTurn:before.turn
    };
    try {
      await page.waitForFunction(criteria => {
        const rows = window.OmegaPrivateEnterpriseLifecycleV1?.getCountryDashboard?.('BGD')?.proposals || [];
        return rows.some(row => row.status === 'PROPOSED' &&
          row.companyId === criteria.owner &&
          row.operatorCompanyId === criteria.operator &&
          row.factoryType === criteria.factoryType &&
          (!criteria.processingResourceId || row.processingResourceId === criteria.processingResourceId) &&
          Number(row.createdTurn) >= criteria.previousTurn);
      }, proposalCriteria, { timeout: 15000 });
    } catch (error) {
      const submitDiagnostics = await page.evaluate(({ pageErrors: recentPageErrors, consoleErrors: recentConsoleErrors }) => {
        const cabinet = document.getElementById('cabinet-full-window');
        const main = cabinet?.querySelector('[data-omega-v2-main]');
        const lifecycleRoot = [cabinet, ...(cabinet ? Array.from(cabinet.querySelectorAll('*')) : [])]
          .find(node => node && Object.prototype.hasOwnProperty.call(node, '__omegaPrivateEnterpriseUiBound'));
        const proposals = window.OmegaPrivateEnterpriseLifecycleV1?.getCountryDashboard?.('BGD')?.proposals || [];
        return {
          uiBound:lifecycleRoot?.__omegaPrivateEnterpriseUiBound || false,
          submitTrace:window.__omegaProposalSubmitTrace || null,
          lastProposalResult:lifecycleRoot?.__omegaPrivateEnterpriseLastProposalResult || null,
          pageErrors:recentPageErrors,
          consoleErrors:recentConsoleErrors,
          uiMessage:lifecycleRoot?.__omegaPrivateEnterpriseMessage || null,
          rootCountry:lifecycleRoot?.__omegaV2IndustryCountryId || null,
          rootTab:lifecycleRoot?.__omegaV2IndustryTab || null,
          rootError:lifecycleRoot?.__omegaPrivateBaselineError || null,
          panelText:cabinet?.querySelector('[data-omega-private-company-lifecycle]')?.textContent?.slice(0,1200) || null,
          formPresent:!!cabinet?.querySelector('[data-pe-proposal-form]'),
          formValues:Array.from(cabinet?.querySelectorAll('[data-pe-proposal-form] select,[data-pe-proposal-form] input') || [])
            .map(node => ({name:node.name,value:node.value,checked:node.checked})),
          proposalCount:proposals.length,
          recentProposals:proposals.slice(-5).map(row=>({status:row.status,reason:row.reason,companyId:row.companyId,operatorCompanyId:row.operatorCompanyId,factoryType:row.factoryType,createdTurn:row.createdTurn})),
          lifecycleDiagnostics:window.OmegaPrivateEnterpriseLifecycleV1?.diagnostics?.() || null,
          privateRegistryDiagnostics:window.OmegaPrivateEnterpriseRegistryV1?.diagnostics?.() || null,
          currentTab:main?.querySelector('.omega-v2-factory-command')?.getAttribute('data-active-tab') || null
        };
      }, { pageErrors:pageErrors.slice(-12), consoleErrors:consoleErrors.slice(-12) })
        .catch(diagnosticError => ({diagnosticError:String(diagnosticError && diagnosticError.message || diagnosticError)}));
      throw new Error('Private Company proposal submit did not persist. Initial wait: ' +
        String(error && error.message || error) + '. Submit diagnostics: ' + JSON.stringify(submitDiagnostics));
    }
    const after = await page.evaluate(criteria => {
      const state = window.Game.state;
      const resource = state.resource?.BGD || {};
      const economy = state.economy?.BGD || {};
      const finance = state.finance?.BGD || {};
      const network = resource.industrialNetwork || {};
      const proposals = window.OmegaPrivateEnterpriseLifecycleV1?.getCountryDashboard?.('BGD')?.proposals || [];
      return {
        inventory: JSON.stringify(resource.inventory || {}),
        warehouse: JSON.stringify(resource.warehouse || {}),
        treasury: Number(finance.available ?? finance.omegaFinance?.treasuryBalanceUsd ?? 0),
        assets: (economy.productionAssets || []).length,
        projects: (network.projects || []).length,
        proposalCount: proposals.length,
        newManualProposalCount: proposals.filter(row => row.status === 'PROPOSED' &&
          row.companyId === criteria.owner &&
          row.operatorCompanyId === criteria.operator &&
          row.factoryType === criteria.factoryType &&
          !criteria.beforeProposalIds.includes(row.proposalId)).length,
        foreignCountry: JSON.stringify({
          inventory: state.resource?.USA?.inventory || {},
          warehouse: state.resource?.USA?.warehouse || {},
          treasury: state.finance?.USA?.available || 0,
          assets: state.economy?.USA?.productionAssets || []
        }),
        proposal: proposals.slice().reverse().find(row => row.status === 'PROPOSED' &&
          row.companyId === criteria.owner &&
          row.operatorCompanyId === criteria.operator &&
          row.factoryType === criteria.factoryType) || null
      };
    }, { owner: companyOptions[0], operator: companyOptions[1], factoryType: selectedFactoryType, beforeProposalIds: before.proposalIds });
    assert.ok(after.proposal, 'the real browser form must create the exact submitted owner/operator/factory proposal');
    assert.equal(after.newManualProposalCount, 1,
      'one manual form submission must append exactly one matching private owner/operator/factory proposal');
    assert.equal(after.inventory, before.inventory, 'a proposal alone must not mutate raw/finished inventory');
    assert.equal(after.warehouse, before.warehouse, 'a proposal alone must not reserve or create warehouse stock');
    assert.equal(after.foreignCountry, before.foreignCountry, 'a player-country proposal must not mutate another country');
    assert.equal(after.treasury, before.treasury, 'a proposal alone must not debit or credit Treasury');
    assert.equal(after.assets, before.assets, 'a proposal alone must not create a production asset');
    assert.equal(after.projects, before.projects, 'a proposal alone must not create a construction project');
    assert.equal(after.proposal.companyId, companyOptions[0]);
    assert.equal(after.proposal.operatorCompanyId, companyOptions[1]);
    assert.equal(after.proposal.status, 'PROPOSED');
    metrics.proposalStage = 'PASS_NO_ECONOMIC_SIDE_EFFECTS';

    // Exercise the real page's canonical persistence API, not a test-only snapshot copy.
    // Use a unique temporary slot and a harmless simulation-root sentinel so the live
    // inventory, finance, route and commissioned asset records are never deliberately
    // corrupted while the game page is running.
    metrics.browserSaveLoad = await page.evaluate(async () => {
      const runtime = window.Omega?.Simulation;
      const stateRoot = window.Game?.state;
      if (!runtime || typeof runtime.saveSlot !== 'function' || typeof runtime.loadSlot !== 'function' || !stateRoot) {
        throw new Error('CANONICAL_BROWSER_SAVE_SLOT_API_UNAVAILABLE');
      }
      const previousStatus = runtime.status;
      if (previousStatus === 'RUNNING' && typeof runtime.pauseSession === 'function') runtime.pauseSession();
      const slot = 'private-enterprise-browser-e2e-' + Date.now();
      const sentinel = '__omegaPrivateBrowserSaveLoadProbe';
      const proposalIds = (stateRoot.economy?.BGD?.privateEnterpriseLifecycle?.proposals || []).map(row => row.proposalId);
      const saved = await runtime.saveSlot(slot);
      if (!saved || saved.ok !== true) throw new Error('BROWSER_SAVE_SLOT_FAILED');
      const localStorageSaveAbsent = window.localStorage.getItem(saved.key) === null;
      stateRoot.simulation[sentinel] = 'IN_MEMORY_TAMPER_AFTER_SAVE';
      const loaded = await runtime.loadSlot(slot);
      const restoredIds = (window.Game.state.economy?.BGD?.privateEnterpriseLifecycle?.proposals || []).map(row => row.proposalId);
      const result = {
        saveOk: saved.ok === true,
        storage: saved.storage || null,
        localStorageSaveAbsent,
        loadIntegrity: runtime.lastLoadIntegrity,
        sameAuthoritativeRoot: window.Game.state === stateRoot && runtime.world?.state === stateRoot,
        worldStateLinked: loaded?.authoritativeState?.worldStateLinked === true,
        sentinelCleared: stateRoot.simulation[sentinel] === undefined,
        proposalIdsPreserved: JSON.stringify(proposalIds) === JSON.stringify(restoredIds),
        proposalIds: restoredIds,
        restoredTurn: runtime.clock?.turn,
        previousStatus
      };
      try { window.localStorage.removeItem(saved.key); } catch (_) {}
      if (previousStatus === 'RUNNING' && typeof runtime.resumeSession === 'function') runtime.resumeSession();
      if (!result.saveOk || result.storage !== 'INDEXEDDB' || !result.localStorageSaveAbsent || result.loadIntegrity !== 'VERIFIED' || !result.sameAuthoritativeRoot ||
          !result.worldStateLinked || !result.sentinelCleared || !result.proposalIdsPreserved) {
        throw new Error('BROWSER_SAVE_LOAD_INTEGRITY_FAILED:' + JSON.stringify(result));
      }
      return result;
    });
    metrics.browserSaveLoadStage = 'PASS_CANONICAL_SAVE_LOAD';

    await page.evaluate(() => {
      window.__omegaBrowserLongTasks = [];
      window.__omegaBrowserLongTaskObserverSupported = false;
      window.__omegaBrowserHeapBefore = performance.memory?.usedJSHeapSize || null;
      if (typeof PerformanceObserver === 'function') {
        try {
          const observer = new PerformanceObserver(list => {
            list.getEntries().forEach(entry => {
              const history = window.__omegaBrowserNavigationHistory || [];
              let navigation = null;
              for (let index = history.length - 1; index >= 0; index -= 1) {
                if (Number(history[index].startedAt) <= Number(entry.startTime)) {
                  navigation = history[index];
                  break;
                }
              }
              window.__omegaBrowserLongTasks.push({
                duration: entry.duration,
                startTime: entry.startTime,
                navigation,
                attribution: Array.from(entry.attribution || []).map(row => ({
                  name:row.name || null,
                  entryType:row.entryType || null,
                  containerType:row.containerType || null,
                  containerName:row.containerName || null,
                  containerId:row.containerId || null
                }))
              });
            });
          });
          observer.observe({ entryTypes: ['longtask'] });
          window.__omegaBrowserLongTaskObserverSupported = true;
          window.__omegaBrowserLongTaskObserver = observer;
        } catch (_) {}
      }
    });

    const tabs = [
      { id: 'inventory', label: 'Input' },
      { id: 'national-inventory', label: 'Stock' },
      { id: 'production-lines', label: 'Lines' }
    ];
    for (const viewport of [
      { name: 'mobile-portrait', width: 390, height: 844 },
      { name: 'mobile-landscape', width: 844, height: 390 },
      { name: 'desktop', width: 1365, height: 768 }
    ]) {
      await page.evaluate(name => { window.__omegaBrowserCurrentViewport = name; }, viewport.name);
      // The browser context already starts at 390x844 with isMobile/touch enabled.
      // Reapplying the identical CDP metrics triggers an unnecessary initial
      // resize/reflow on the loaded Industry screen, so only emulate transitions.
      if (viewport.name !== 'mobile-portrait') await viewportSession.send('Emulation.setDeviceMetricsOverride', {
        width:viewport.width,
        height:viewport.height,
        deviceScaleFactor:1,
        mobile:viewport.name !== 'desktop',
        screenWidth:viewport.width,
        screenHeight:viewport.height,
        screenOrientation:{
          type:viewport.width > viewport.height ? 'landscapePrimary' : 'portraitPrimary',
          angle:viewport.width > viewport.height ? 90 : 0
        }
      });
      await page.waitForTimeout(100);
      const layout = await page.locator('[data-omega-private-company-lifecycle]').evaluate(element => ({
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
        panelWidth: element.clientWidth,
        panelScrollWidth: element.scrollWidth,
        bodyScrollWidth: document.documentElement.scrollWidth,
        privateFormVisible: !!element.querySelector('[data-pe-proposal-form]'),
        operatorSelectorVisible: !!element.querySelector('select[name="operatorCompanyId"]'),
        tab: element.closest('[data-omega-v2-industry-content]')?.getAttribute('data-active-tab') || null
      }));
      assert.ok(layout.panelWidth > 0, viewport.name + ': private lifecycle panel must remain measurable');
      assert.ok(layout.panelScrollWidth <= layout.panelWidth + 2,
        viewport.name + ': private lifecycle panel must not overflow its own width: ' + JSON.stringify(layout));
      assert.ok(layout.bodyScrollWidth <= viewport.width + 2,
        viewport.name + ': the whole page must not overflow horizontally: ' + JSON.stringify(layout));
      assert.equal(layout.privateFormVisible, true, viewport.name + ': proposal form must remain visible');
      assert.equal(layout.operatorSelectorVisible, true, viewport.name + ': operator selector must remain visible');
      metrics.viewportRuns.push({ ...viewport, ...layout });

      for (let round = 0; round < 6; round++) {
        for (const tab of tabs) {
          const locator = page.locator('#cabinet-full-window [data-omega-v2-main] [data-omega-v2-industry-tab="' + tab.id + '"]');
          const latency = await locator.evaluate((element, meta) => {
            const started = performance.now();
            window.__omegaBrowserNavigationHistory = window.__omegaBrowserNavigationHistory || [];
            window.__omegaBrowserNavigationHistory.push({
              startedAt:started,viewport:meta.viewport,tab:meta.tab,round:meta.round
            });
            element.click();
            return Number((performance.now() - started).toFixed(2));
          }, { viewport:viewport.name, tab:tab.id, round:round });
          navigationLatencyMs.push(latency);
          assert.ok(latency <= 1000, viewport.name + ' ' + tab.label + ' click handler exceeded 1000ms: ' + latency);
          await page.waitForFunction(tabId => {
            const main = document.querySelector('#cabinet-full-window [data-omega-v2-main]');
            const panel = main?.querySelector('[data-omega-v2-industry-content][data-active-tab="' + tabId + '"]');
            return !!(panel?.querySelector('.fp-content-heading') && panel?.querySelector('.fp-content-body'));
          }, tab.id, { timeout: 10000 });
        }
      }
    }

    metrics.navigationP95Ms = Number(percentile(navigationLatencyMs, 0.95).toFixed(2));
    metrics.navigationMaxMs = Number(Math.max(...navigationLatencyMs).toFixed(2));
    assert.ok(metrics.navigationP95Ms <= 500,
      'real Chromium tab click p95 must remain <=500ms; observed ' + metrics.navigationP95Ms + 'ms');
    assert.ok(metrics.navigationMaxMs <= 1000,
      'real Chromium tab click max must remain <=1000ms; observed ' + metrics.navigationMaxMs + 'ms');

    metrics.runtime = await page.evaluate(() => {
      const rows = window.__omegaBrowserLongTasks || [];
      const bootTasks = rows.filter(row => !row.navigation);
      const interactionTasks = rows.filter(row => !!row.navigation);
      // The first mobile Input-panel activation is a cold-view render, not a
      // repeated navigation. Keep it measured under a separate 1.5s ceiling;
      // every subsequent user navigation must remain within 1s.
      const coldFirstViewTasks = interactionTasks.filter(row =>
        row.navigation?.viewport === 'mobile-portrait' &&
        row.navigation?.tab === 'inventory' &&
        Number(row.navigation?.round) === 0
      );
      const repeatedInteractionTasks = interactionTasks.filter(row =>
        !(row.navigation?.viewport === 'mobile-portrait' &&
          row.navigation?.tab === 'inventory' &&
          Number(row.navigation?.round) === 0)
      );
      const maximum = list => list.reduce((max, row) => Math.max(max, Number(row.duration) || 0), 0);
      return {
        longTaskObserverSupported: !!window.__omegaBrowserLongTaskObserverSupported,
        longTaskCount: rows.length,
        currentViewport:window.__omegaBrowserCurrentViewport || null,
        longTasks: rows,
        maxLongTaskMs: maximum(rows),
        bootLongTaskCount: bootTasks.length,
        maxBootLongTaskMs: maximum(bootTasks),
        interactionLongTaskCount: interactionTasks.length,
        maxInteractionLongTaskMs: maximum(interactionTasks),
        coldFirstViewLongTaskCount: coldFirstViewTasks.length,
        maxColdFirstViewLongTaskMs: maximum(coldFirstViewTasks),
        repeatedInteractionLongTaskCount: repeatedInteractionTasks.length,
        maxRepeatedInteractionLongTaskMs: maximum(repeatedInteractionTasks),
        heapBeforeBytes: window.__omegaBrowserHeapBefore || null,
        usedHeapBytes: performance.memory?.usedJSHeapSize || null,
        heapLimitBytes: performance.memory?.jsHeapSizeLimit || null,
        pageErrors: []
      };
    });
    if (metrics.runtime.longTaskObserverSupported) {
      assert.ok(metrics.runtime.maxBootLongTaskMs <= 1500,
        'cold-boot main-thread task exceeded 1500ms: ' + JSON.stringify(metrics.runtime));
      assert.ok(metrics.runtime.coldFirstViewLongTaskCount <= 1 &&
        metrics.runtime.maxColdFirstViewLongTaskMs <= 1500,
        'first mobile Input-panel activation exceeded its 1500ms cold-view budget: ' + JSON.stringify(metrics.runtime) +
        '; factoryInputPerf=' + JSON.stringify(factoryInputPerfLogs));
      assert.ok(metrics.runtime.maxRepeatedInteractionLongTaskMs <= 1000,
        'repeated UI navigation long task exceeded 1000ms: ' + JSON.stringify(metrics.runtime) +
        '; factoryInputPerf=' + JSON.stringify(factoryInputPerfLogs));
    }
    if (metrics.runtime.heapBeforeBytes && metrics.runtime.usedHeapBytes) {
      assert.ok(metrics.runtime.usedHeapBytes - metrics.runtime.heapBeforeBytes <= 64 * 1024 * 1024,
        'repeated real-browser navigation must not grow the JS heap by more than 64 MiB: ' + JSON.stringify(metrics.runtime));
    }

    metrics.pageErrors = pageErrors.slice();
    metrics.consoleErrors = consoleErrors.slice();
    metrics.factoryInputPerfLogs = factoryInputPerfLogs.slice();
    metrics.blockedExternalRequests = blockedExternalRequests.length;
    const fatalConsoleErrors = consoleErrors.filter(message =>
      !/net::ERR_BLOCKED_BY_CLIENT|blockedbyclient/i.test(message)
    );
    metrics.fatalConsoleErrors = fatalConsoleErrors;
    assert.deepEqual(pageErrors, [], 'actual browser E2E must not leave uncaught page exceptions');
    assert.deepEqual(fatalConsoleErrors, [], 'actual browser E2E must not leave local script/runtime console errors');
    metrics.completed = true;
    fs.writeFileSync(path.join(artifacts, 'omega-private-enterprise-browser-metrics.json'), JSON.stringify(metrics, null, 2));
    await page.screenshot({ path: path.join(artifacts, 'omega-private-enterprise-browser-final.png'), fullPage: true });
    await context.close();
  } catch (error) {
    metrics.completed = false;
    metrics.failure = String(error && error.stack || error);
    metrics.pageErrors = pageErrors;
    metrics.consoleErrors = consoleErrors;
    metrics.factoryInputPerfLogs = factoryInputPerfLogs.slice();
    metrics.blockedExternalRequests = blockedExternalRequests.length;
    fs.writeFileSync(path.join(artifacts, 'omega-private-enterprise-browser-failure.json'), JSON.stringify(metrics, null, 2));
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close();
  }
});


test('real Chromium map marker runs the exact site through a commissioned private factory and canonical save/load', {
  timeout: 600000
}, async () => {
  const artifacts = process.env.OMEGA_BROWSER_TEST_ARTIFACT_DIR || path.join(ROOT, 'test-results', 'sab34-real-browser-pipeline');
  fs.mkdirSync(artifacts, { recursive: true });
  const server = await startStaticServer();
  let browser;
  const pageErrors = [];
  const consoleErrors = [];
  const metrics = { browser: 'Chromium', offlineNetwork: true, stages: [] };

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('**/*', route => {
      const target = route.request().url();
      if (target.startsWith(server.origin)) return route.continue();
      return route.abort('blockedbyclient');
    });

    const bootStarted = performance.now();
    await page.goto(server.origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => {
      return document.readyState === 'complete' &&
        !!document.getElementById('omega-gov-entry-v3') &&
        !!window.Game?.state &&
        !!window.Omega?.Simulation &&
        typeof window.Omega.Simulation.advance === 'function' &&
        !!window.OmegaPrivateEnterpriseLifecycleV1 &&
        !!window.OmegaUIV2Integration;
    }, null, { timeout: 150000 });
    await page.waitForFunction(() => {
      const binding = window.Omega?.IndividualResourceSiteBinding;
      if (!binding || typeof binding.diagnostics !== 'function') return false;
      try { return binding.diagnostics().status === 'READY'; } catch (_) { return false; }
    }, null, { timeout: 120000 });
    metrics.bootAndSiteBindingMs = Number((performance.now() - bootStarted).toFixed(2));
    metrics.stages.push('REAL_APP_BOOT_AND_SITE_BINDING_READY');

    const preparation = await page.evaluate(async () => {
      const state = window.Game.state;
      const simulation = window.Omega?.Simulation;
      const endowment = window.OmegaResourceEndowmentRuntime || window.Omega?.ResourceEndowmentRuntime;
      const industry = window.OmegaResourceIndustrialNetwork || window.Omega?.ResourceIndustrialNetwork;
      const economy = window.OmegaResourceEconomy || window.Omega?.ResourceEconomy;
      const governmentBaseline = window.OmegaCountryFactoryStartingBaselineV1 || window.Omega?.CountryFactoryStartingBaselineV1;
      const privateBaseline = window.OmegaPrivateEnterpriseRegistryV1 || window.Omega?.PrivateEnterpriseRegistryV1;
      if (!simulation?.clock || !endowment || !industry || !economy || !governmentBaseline || !privateBaseline) {
        throw new Error('SAB34_REQUIRED_RUNTIME_NOT_MOUNTED');
      }

      const clock = simulation.clock;
      const currentTurn = Number(state.simulation?.turn ?? clock.turn) || 0;
      const currentDate = String(state.simulation?.date || '2015-01-01').slice(0, 10);
      const preservedSimulationTime = Number(clock.simulationTimeMs) || 0;
      const dateEpoch = Date.parse(currentDate + 'T00:00:00.000Z');
      if (!Number.isFinite(dateEpoch)) throw new Error('SAB34_GAME_DATE_INVALID:' + currentDate);

      window.OmegaMinistryViewCountry = 'BGD';
      window.Game.currentActiveCountry = 'BGD';
      window.Game.selectedCountryId = 'BGD';
      window.Game.playerCountry = 'BGD';
      state.playerCountryId = 'BGD';
      if (window.OmegaCabinetUI) window.OmegaCabinetUI.activeCountry = 'BGD';
      if (window.CountryIOS) window.CountryIOS.activeCountry = 'BGD';

      // This is a test-only game-clock acceleration. It keeps the existing game date
      // continuous while making real committed 30-day turns usable in CI.
      clock.stop();
      clock.gameDaysPerTurn = 30;
      clock.stepDurationMs = 30 * 86400000;
      clock.startEpochMs = dateEpoch - preservedSimulationTime;
      simulation.createSession({
        playerCountryId: 'BGD',
        startTurn: currentTurn,
        simulationTimeMs: preservedSimulationTime,
        sessionId: 'SAB34-REAL-CHROMIUM'
      });
      // The application lifecycle autosave uses its separate legacy structured
      // snapshot store. This isolated proof exercises the canonical Simulation
      // saveSlot/loadSlot API after the exact resource pipeline below. Suppress
      // only that unrelated finalizer while driving deterministic CI game turns;
      // the canonical persistent save/load round-trip is still required later.
      const autosaveFinalizerId = 'omega.game-lifecycle.autosave';
      const autosaveFinalizer = simulation.turnFinalizers?.get?.(autosaveFinalizerId);
      if (!autosaveFinalizer) throw new Error('SAB34_CANONICAL_TURN_AUTOSAVE_FINALIZER_NOT_REGISTERED');
      simulation.turnFinalizers.delete(autosaveFinalizerId);
      window.__sab34RemovedLifecycleAutosaveFinalizer = autosaveFinalizer;
      state.simulation.daysPerTurn = 30;

      const [endowmentReady, governmentReady, privateReady] = await Promise.all([
        endowment.initialize(),
        governmentBaseline.ready,
        privateBaseline.ready
      ]);
      if (endowmentReady?.status !== 'READY') throw new Error('SAB34_ENDOWMENT_INIT_FAILED:' + JSON.stringify(endowmentReady));
      if (governmentReady?.status !== 'READY') throw new Error('SAB34_GOVERNMENT_BASELINE_FAILED:' + JSON.stringify(governmentReady));
      if (privateReady?.status !== 'READY') throw new Error('SAB34_PRIVATE_BASELINE_FAILED:' + JSON.stringify(privateReady));

      const hydration = await endowment.hydrateCountry('BGD');
      if (hydration?.status !== 'APPLIED') throw new Error('SAB34_BGD_HYDRATION_FAILED:' + JSON.stringify(hydration));
      const routeLoad = await industry.loadSiteLogisticsRoutes('BGD');
      if (routeLoad?.status !== 'READY') throw new Error('SAB34_BGD_ROUTE_LOAD_FAILED:' + JSON.stringify(routeLoad));
      const catalogLoad = await industry.loadCatalog();
      if (catalogLoad?.status !== 'READY') throw new Error('SAB34_INDUSTRIAL_CATALOG_FAILED:' + JSON.stringify(catalogLoad));

      const resource = state.resource?.BGD;
      if (!resource) throw new Error('SAB34_BGD_RESOURCE_STATE_MISSING');
      resource.inventory = resource.inventory || {};
      resource.warehouse = resource.warehouse && typeof resource.warehouse === 'object' ? resource.warehouse : {
        warehouseId: 'WH-BGD-RAW',
        countryId: 'BGD',
        type: 'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
        availableByResource: {},
        reservedByResource: {},
        receipts: []
      };
      resource.warehouse.availableByResource = resource.warehouse.availableByResource || {};
      resource.warehouse.reservedByResource = resource.warehouse.reservedByResource || {};
      resource.warehouse.receipts = Array.isArray(resource.warehouse.receipts) ? resource.warehouse.receipts : [];
      resource.batches = Array.isArray(resource.batches) ? resource.batches : [];
      resource.inventoryLots = resource.inventoryLots || {};
      resource.demandRuntime = resource.demandRuntime && typeof resource.demandRuntime === 'object'
        ? resource.demandRuntime : {};
      resource.demandRuntime.byResource = resource.demandRuntime.byResource && typeof resource.demandRuntime.byResource === 'object'
        ? resource.demandRuntime.byResource : {};
      resource.demandRuntime.lastTurn = Number(state.simulation.turn) || currentTurn;
      resource.demandRuntime.byResource.coal = Object.assign({
        demandPerDay: 0,
        consumerDemandPerDay: 0,
        activeFactoryInputDemandPerDay: 0,
        pendingImportQuantity: 0,
        authority: 'SAB34_REAL_BROWSER_TEST_FIXTURE'
      }, resource.demandRuntime.byResource.coal || {});

      const catalog = window.OmegaResourceIndustrialCatalogData || window.Omega?.ResourceIndustrialCatalogData;
      const profiles = catalog?.factoryProfiles || {};
      const profile = profiles.UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT;
      if (!profile || Object.keys(profiles).length !== 21) {
        throw new Error('SAB34_CANONICAL_21_FACTORY_CATALOG_NOT_READY');
      }
      const startupStock = Object.assign({}, profile.constructionMaterials || {}, { coal: 60000 });
      const fixtureBatchIds = [];
      for (const [resourceId, rawQuantity] of Object.entries(startupStock)) {
        const quantity = Number(rawQuantity);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('SAB34_INVALID_TEST_STOCK:' + resourceId);
        const batchId = 'SAB34-REAL-BROWSER-OPENING-STOCK:BGD:' + String(resourceId).toUpperCase();
        if (resource.batches.some(row => String(row.batchId) === batchId) || resource.inventoryLots[batchId]) {
          throw new Error('SAB34_TEST_STOCK_BATCH_COLLISION:' + batchId);
        }
        resource.inventory[resourceId] = (Number(resource.inventory[resourceId]) || 0) + quantity;
        resource.warehouse.availableByResource[resourceId] =
          (Number(resource.warehouse.availableByResource[resourceId]) || 0) + quantity;
        const provenance = {
          sourceAuthority: 'TEST_FIXTURE_IMPORT',
          sourceType: 'SIMULATED_OPENING_IMPORT',
          simulationOnly: true,
          authority: 'SAB34_REAL_BROWSER_TEST_FIXTURE'
        };
        const batch = {
          batchId,
          resourceId,
          countryId: 'BGD',
          ownerCountryCode: 'BGD',
          sourceCountryId: 'BGD',
          quantity,
          remainingQuantity: quantity,
          unit: 'SIMULATION_RESOURCE_UNIT',
          stage: 'RAW_INVENTORY',
          status: 'AVAILABLE',
          warehouseId: 'WH-BGD-RAW',
          sourceType: 'TEST_FIXTURE_IMPORT',
          provenance,
          createdTurn: Number(state.simulation.turn) || currentTurn
        };
        resource.batches.push(batch);
        resource.inventoryLots[batchId] = {
          batchId,
          resourceId,
          countryId: 'BGD',
          quantity,
          remainingQuantity: quantity,
          unit: batch.unit,
          stage: 'RAW_INVENTORY',
          status: 'AVAILABLE',
          warehouseId: 'WH-BGD-RAW',
          sourceType: batch.sourceType,
          provenance: Object.assign({}, provenance)
        };
        fixtureBatchIds.push(batchId);
      }

      state.economy.BGD = state.economy.BGD || { productionAssets: [] };
      state.economy.BGD.productionAssets = Array.isArray(state.economy.BGD.productionAssets)
        ? state.economy.BGD.productionAssets : [];
      state.economy.BGD.unemploymentCount = 100000;
      state.economy.BGD.laborForce = 1000000;
      state.economy.BGD.unemployment_rate = 10;
      state.transport = state.transport || {};
      state.transport.BGD = state.transport.BGD || {};
      state.transport.BGD.infrastructure = Object.assign({}, state.transport.BGD.infrastructure || {}, {
        roads: { capacityPerDay: 40000, quality: 0.9 },
        rail: { capacityPerDay: 90000, quality: 0.9 },
        ports: { capacityPerDay: 180000, quality: 0.9 },
        bridges: { capacityPerDay: 45000, quality: 0.9 },
        pipelines: { capacityPerDay: 350000, quality: 0.9 },
        utilitySupply: {
          electricityMWhPerDay: 1000000,
          waterM3PerDay: 1000000,
          authority: 'SAB34_REAL_BROWSER_TEST_FIXTURE',
          status: 'AVAILABLE',
          simulationOnly: true,
          assets: []
        }
      });

      const finance = state.finance.BGD || (state.finance.BGD = {});
      // Test-only grant liquidity is explicitly identified and is never production data.
      finance.available = Math.max(Number(finance.available) || 0, 1000000000000);
      finance.sab34TestFixture = { authority: 'SAB34_REAL_BROWSER_TEST_FIXTURE', simulationOnly: true };

      const canonical = window.OmegaResourceSiteCanonicalCatalogData || window.Omega?.ResourceSiteCanonicalCatalogData;
      const canonicalSites = Array.isArray(canonical?.sites) ? canonical.sites : [];
      const canonicalSiteIds = canonicalSites.map(row => String(row?.siteId || '').trim()).filter(Boolean);
      const uniqueCanonicalSiteIds = new Set(canonicalSiteIds);
      const bindingDiagnostics = window.Omega.IndividualResourceSiteBinding.diagnostics();
      const masterMineSiteReferenceCount = Number(bindingDiagnostics?.sourceRecordCounts?.mineSites) || 0;
      if (canonicalSites.length !== 607 || uniqueCanonicalSiteIds.size !== 607 || masterMineSiteReferenceCount !== 199) {
        throw new Error('SAB34_SITE_REGISTRY_COVERAGE_FAILED:' + JSON.stringify({
          canonicalRows: canonicalSites.length,
          uniqueCanonicalSiteIds: uniqueCanonicalSiteIds.size,
          masterMineSiteReferences: masterMineSiteReferenceCount
        }));
      }

      const foreignSnapshot = JSON.stringify({
        resource: state.resource?.KWT || null,
        economy: state.economy?.KWT || null,
        finance: state.finance?.KWT || null
      });
      return {
        currentTurn: Number(state.simulation.turn) || 0,
        daysPerTurn: Number(clock.gameDaysPerTurn),
        governmentCountryCount: governmentReady.countryCount,
        privateCountryCount: privateReady.diagnostics?.countryCount,
        privateFactoryTypeCount: privateReady.diagnostics?.factoryTypeCount,
        privateCompanyCount: privateReady.diagnostics?.companyCount,
        canonicalSiteCount: canonicalSites.length,
        uniqueCanonicalSiteCount: uniqueCanonicalSiteIds.size,
        masterMineSiteReferenceCount,
        selectedCountryRouteCount: routeLoad.routeCount,
        fixtureBatchIds,
        foreignSnapshot,
        startingTreasury: Number(finance.available) || 0
      };
    });
    assert.equal(preparation.canonicalSiteCount, 607);
    assert.equal(preparation.uniqueCanonicalSiteCount, 607);
    assert.equal(preparation.masterMineSiteReferenceCount, 199);
    assert.equal(preparation.governmentCountryCount, 197);
    assert.equal(preparation.privateCountryCount, 197);
    assert.equal(preparation.privateFactoryTypeCount, 21);
    assert.equal(preparation.privateCompanyCount, 5);
    assert.ok(preparation.selectedCountryRouteCount > 0);
    metrics.preparation = preparation;
    metrics.stages.push('199_CANONICAL_SITES_AND_197_COUNTRY_FACTORY_BASELINES_READY');

    const commissioning = await page.evaluate(async () => {
      const state = window.Game.state;
      const simulation = window.Omega.Simulation;
      const industry = window.OmegaResourceIndustrialNetwork || window.Omega?.ResourceIndustrialNetwork;
      const lifecycle = window.OmegaPrivateEnterpriseLifecycleV1 || window.Omega?.PrivateEnterpriseLifecycleV1;
      if (!lifecycle || typeof lifecycle.createProposal !== 'function' || !lifecycle.productionProofReady()) {
        throw new Error('SAB34_PRIVATE_ENTERPRISE_PRODUCTION_RUNTIME_NOT_READY');
      }
      const proposal = lifecycle.createProposal({
        countryId: 'BGD',
        companyId: 'NOVA_CONSUMER_INDUSTRIES',
        operatorCompanyId: 'MERIDIAN_ENGINEERING_GROUP',
        factoryType: 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT',
        processingResourceId: 'coal',
        quantity: 1,
        sourcingPolicy: 'COMPANY_FUNDED_IMPORTS',
        stateSupportRequested: true,
        requestReason: 'Nova Consumer Industries requests a coal-processing facility to convert attributable domestic coal extraction into a saleable industrial intermediate.',
        expectedBenefit: 'The commissioned plant adds modeled coal-concentrate output capacity. Company income is recognized only after a buyer consumes attributable output and the market settlement posts.',
        riskForecast: 'The project remains exposed to mine output, shipment delays, recipe input quality, utility availability, construction capital, warehouse capacity and uncertain customer demand.'
      });
      if (proposal.status !== 'PROPOSED') throw new Error('SAB34_PRIVATE_PROPOSAL_FAILED:' + JSON.stringify(proposal));
      const decision = lifecycle.decideProposal({
        countryId: 'BGD',
        proposalId: proposal.proposalId,
        decision: 'APPROVE',
        allowStateSupport: true,
        conditions: { allowStateSupport: true }
      });
      if (decision.status !== 'APPROVED_AWAITING_FUNDING') {
        throw new Error('SAB34_PRIVATE_PERMIT_FAILED:' + JSON.stringify(decision));
      }
      const funding = lifecycle.fundProposal({
        countryId: 'BGD',
        proposalId: proposal.proposalId,
        sourceType: 'GOVERNMENT_GRANT',
        amount: proposal.capitalRequired
      });
      if (funding.status !== 'FUNDED') throw new Error('SAB34_PRIVATE_FUNDING_FAILED:' + JSON.stringify(funding));
      const construction = lifecycle.startConstruction({ countryId: 'BGD', proposalId: proposal.proposalId });
      if (construction.status !== 'UNDER_CONSTRUCTION' || construction.started?.length !== 1) {
        throw new Error('SAB34_PRIVATE_CONSTRUCTION_FAILED:' + JSON.stringify(construction));
      }
      const projectId = construction.started[0].projectId;

      // This browser proof advances authoritative turns directly below. Keep the
      // wall-clock scheduler paused so its 100 ms frame loop cannot race those
      // deterministic turns or fan out unrelated background work across 17 ministries.
      // SimulationCoordinator.advance() still executes the full canonical turn pipeline
      // while the clock is paused; it advances the clock explicitly via step().
      if (!simulation.clock || typeof simulation.clock.pause !== 'function') {
        throw new Error('SAB34_CANONICAL_CLOCK_PAUSE_UNAVAILABLE');
      }
      simulation.clock.pause();
      if (simulation.clock.paused !== true) {
        throw new Error('SAB34_BACKGROUND_ENGINE_CLOCK_NOT_PAUSED');
      }

      const advanced = await simulation.advance(6);
      if (advanced.status === 'ERROR' || advanced.steps !== 6) {
        throw new Error('SAB34_CENTRAL_GAME_CLOCK_CONSTRUCTION_ADVANCE_FAILED:' + JSON.stringify(advanced));
      }
      const resource = state.resource.BGD;
      const project = resource.industrialNetwork.projects.find(row => String(row.projectId) === String(projectId));
      const factory = state.economy.BGD.productionAssets.find(row => String(row.constructionProjectId) === String(projectId));
      if (project?.status !== 'COMPLETED' || !factory) {
        throw new Error('SAB34_PRIVATE_FACTORY_NOT_COMMISSIONED:' + JSON.stringify({
          project: project ? { status: project.status, progressDays: project.progressDays, durationDays: project.durationDays } : null,
          projectId,
          assetCount: state.economy.BGD.productionAssets.length,
          lastTurn: advanced.last?.turn
        }));
      }
      if (factory.ownerType !== 'PRIVATE_ENTERPRISE' || factory.ownerCompanyId !== 'NOVA_CONSUMER_INDUSTRIES' ||
          factory.operatorType !== 'PRIVATE_COMPANY_OPERATOR' || factory.operatorCompanyId !== 'MERIDIAN_ENGINEERING_GROUP') {
        throw new Error('SAB34_PRIVATE_FACTORY_OWNER_OPERATOR_MISMATCH:' + JSON.stringify(factory));
      }
      if (factory.productionEnabled !== true) throw new Error('SAB34_PRIVATE_FACTORY_PRODUCTION_NOT_ENABLED:' + JSON.stringify(factory));
      return {
        proposalId: proposal.proposalId,
        projectId,
        factoryId: String(factory.id || factory.assetId || factory.projectId),
        ownerCompanyId: factory.ownerCompanyId,
        operatorCompanyId: factory.operatorCompanyId,
        constructionStatus: project.status,
        productionEnabled: factory.productionEnabled,
        committedTurn: Number(simulation.clock.turn)
      };
    });
    metrics.commissioning = commissioning;
    metrics.stages.push('PRIVATE_FACTORY_PROPOSED_APPROVED_FUNDED_AND_COMMISSIONED_ON_CENTRAL_GAME_TURNS');

    const targetSite = await page.evaluate(() => {
      const binding = window.Omega?.IndividualResourceSiteBinding;
      const canonical = window.OmegaResourceSiteCanonicalCatalogData || window.Omega?.ResourceSiteCanonicalCatalogData;
      const rows = Array.isArray(canonical?.sites) ? canonical.sites : [];
      const eligible = rows.filter(row => {
        const country = String(row.countryId || row.identity?.countryIso3 || '').toUpperCase();
        const resource = String(row.identity?.resourceTypeId || row.real?.resourceId || row.sourceSiteRecord?.resourceId || '').toLowerCase();
        return country === 'BGD' && resource.includes('coal') && row.map?.markerEligible !== false &&
          !row.runtime?.aliasOfSiteId && row.operation?.commercialExtraction !== false;
      });
      const source = eligible.find(row => /barapukuria/i.test(String(row.siteName || ''))) || eligible[0];
      if (!source) throw new Error('SAB34_NO_EXECUTABLE_BGD_COAL_SITE_IN_CANONICAL_REGISTRY');
      const site = binding?.sites?.find(row => String(row.siteId) === String(source.siteId));
      if (!site) throw new Error('SAB34_CANONICAL_SITE_NOT_BOUND_TO_PLAYABLE_RUNTIME:' + source.siteId);
      const coordinates = site.coordinates || site.location?.coordinates || {};
      const lat = Number(coordinates.lat ?? coordinates.latitude);
      const lng = Number(coordinates.lng ?? coordinates.lon ?? coordinates.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('SAB34_SELECTED_SITE_COORDINATES_MISSING:' + site.siteId);
      const mapApi = window.Game?.Map;
      const map = mapApi?.map || window.map;
      if (!map || typeof map.setView !== 'function') throw new Error('SAB34_REAL_LEAFLET_MAP_NOT_READY');
      mapApi.__omegaMapUiActive = true;
      mapApi.resourceState = mapApi.resourceState || {};
      mapApi.resourceState.enabled = true;
      mapApi.resourceState.scope = 'NATION';
      mapApi.resourceState.selectedResources = new Set(['all']);
      window.Game.currentActiveCountry = 'BGD';
      if (window.CountryIOS) window.CountryIOS.activeCountry = 'BGD';
      map.setView([lat, lng], Math.max(8, Number(map.getZoom?.() || 4)));
      window.__sab34SiteSelectionEvents = [];
      window.addEventListener('OMEGA_RESOURCE_SITE_SELECTED', event => {
        window.__sab34SiteSelectionEvents.push(event.detail || {});
      });
      binding.refresh();
      return {
        siteId: String(site.siteId),
        siteName: String(site.siteName || site.name || site.siteId),
        countryId: String(site.countryId || site.countryCode || ''),
        resourceId: String(site.real?.resourceId || site.sourceSiteRecord?.resourceId || site.identity?.resourceTypeId || ''),
        latitude: lat,
        longitude: lng
      };
    });
    metrics.selectedSite = targetSite;
    metrics.stages.push('REAL_MAP_MARKER_READY:' + targetSite.siteId);

    const marker = page.locator('.omega-individual-site-marker[title=' + JSON.stringify(targetSite.siteName) + ']').first();
    await marker.waitFor({ state: 'visible', timeout: 90000 });
    await marker.click({ force: true, timeout: 45000 });
    await page.waitForFunction(siteId => {
      const selected = document.getElementById('omega-individual-select');
      return selected?.value === siteId &&
        (window.__sab34SiteSelectionEvents || []).some(event => String(event.siteId) === String(siteId));
    }, targetSite.siteId, { timeout: 30000 });
    const selection = await page.evaluate(() => ({
      events: window.__sab34SiteSelectionEvents || [],
      selectedSiteId: document.getElementById('omega-individual-select')?.value || null,
      panelVisible: document.getElementById('omega-individual-resource-panel')?.style.display !== 'none',
      panelText: document.getElementById('omega-individual-detail')?.textContent || ''
    }));
    assert.equal(selection.selectedSiteId, targetSite.siteId);
    assert.ok(selection.events.some(event => String(event.siteId) === targetSite.siteId));
    metrics.selection = selection;
    metrics.stages.push('REAL_MAP_MARKER_CLICK_SELECTED_THE_EXACT_SITE_ID');

    const executeHitTest = await page.locator('#omega-individual-execute').evaluate(button => {
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const panel = document.getElementById('omega-individual-resource-panel');
      const cabinet = document.getElementById('cabinet-full-window');
      const countryCard = document.getElementById('country-info-card');
      const style = element => element ? {
        position: getComputedStyle(element).position,
        zIndex: getComputedStyle(element).zIndex,
        pointerEvents: getComputedStyle(element).pointerEvents
      } : null;
      return {
        hitTarget: !!hit && (hit === button || button.contains(hit)),
        hitElement: hit ? (hit.tagName + (hit.id ? '#' + hit.id : '') +
          (hit.className && typeof hit.className === 'string' ? '.' + hit.className.trim().replace(/\\s+/g, '.') : '')) : null,
        buttonRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        panel: style(panel),
        cabinet: style(cabinet),
        countryCard: style(countryCard)
      };
    });
    metrics.executeHitTest = executeHitTest;
    assert.ok(
      Number(executeHitTest.panel?.zIndex) > Number(executeHitTest.cabinet?.zIndex),
      'resource site panel must be above the active cabinet stacking context: ' +
      JSON.stringify(executeHitTest)
    );
    assert.ok(executeHitTest.hitTarget,
      'resource site action must be the topmost hit target in the active UI layer: ' +
      JSON.stringify(executeHitTest));

    await page.locator('#omega-individual-execute').click({ timeout: 30000 });
    await page.waitForFunction(siteId => {
      const run = window.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__;
      return String(run?.siteId || '') === String(siteId) && !!run.result;
    }, targetSite.siteId, { timeout: 90000 });
    const extraction = await page.evaluate(() => {
      const selected = window.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__;
      return {
        siteId: selected?.siteId || null,
        result: selected?.result || null,
        statusText: document.getElementById('omega-individual-status')?.textContent || ''
      };
    });
    assert.equal(extraction.siteId, targetSite.siteId);
    assert.equal(extraction.result?.status, 'IN_TRANSIT', JSON.stringify(extraction));
    assert.equal(extraction.result?.extractionStatus, 'COMMITTED');
    assert.equal(extraction.result?.shipment?.shipmentType, 'MINE_TO_WAREHOUSE');
    assert.equal(String(extraction.result?.factoryId), commissioning.factoryId);
    assert.equal(extraction.result?.factoryBootstrapStatus, 'EXISTING');
    assert.ok(extraction.result?.batchId && extraction.result?.shipmentId && extraction.result?.extractionPlanId);
    metrics.extraction = extraction;
    metrics.stages.push('REAL_SITE_PANEL_ACTION_COMMITTED_EXTRACTION_AND_DISPATCHED_MINE_HAUL');

    const mineEta = Number(extraction.result.shipment.etaTurn);
    assert.ok(Number.isFinite(mineEta), 'mine haul must expose its real ETA game turn');
    const mineArrival = await page.evaluate(async eta => {
      const simulation = window.Omega.Simulation;
      const current = Number(simulation.clock.turn) || 0;
      const turns = Math.max(1, Math.ceil(eta - current));
      if (turns > 90) throw new Error('SAB34_MINE_ETA_EXCEEDS_TEST_BOUND:' + turns);
      const advanced = await simulation.advance(turns);
      if (advanced.status === 'ERROR' || advanced.steps !== turns) {
        throw new Error('SAB34_MINE_HAUL_CENTRAL_TURN_ADVANCE_FAILED:' + JSON.stringify(advanced));
      }
      const state = window.Game.state;
      const resource = state.resource.BGD;
      const run = window.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__.result;
      const receiptId = 'MINE-WH-REC:' + run.shipmentId;
      const receipt = (resource.warehouse?.receipts || []).find(row => String(row.receiptId) === receiptId);
      const factoryShipment = (resource.industrialNetwork?.shipments || []).find(row =>
        String(row.batchId) === String(run.batchId) && row.shipmentType === 'RAW_TO_FACTORY' && row.status === 'IN_TRANSIT');
      return {
        advancedTurns: turns,
        currentTurn: Number(simulation.clock.turn),
        receipt: receipt || null,
        factoryShipment: factoryShipment || null,
        siteRuntime: resource.industrialNetwork?.siteLogisticsBySiteId?.[run.siteId] || null
      };
    }, mineEta);
    assert.equal(mineArrival.receipt?.status, 'RECEIVED', JSON.stringify(mineArrival));
    assert.equal(mineArrival.receipt?.receivedFrom, 'MINE_SITE_LOGISTICS');
    assert.ok(mineArrival.factoryShipment, 'mine receipt must dispatch a separate raw-to-factory shipment');
    assert.equal(mineArrival.factoryShipment.siteId, targetSite.siteId);
    metrics.mineArrival = mineArrival;
    metrics.stages.push('MINE_HAUL_RECEIPT_POSTED_AND_FACTORY_LEG_DISPATCHED');

    const factoryEta = Number(mineArrival.factoryShipment.etaTurn);
    assert.ok(Number.isFinite(factoryEta), 'factory-bound shipment must expose its ETA game turn');
    const factoryArrival = await page.evaluate(async eta => {
      const simulation = window.Omega.Simulation;
      const current = Number(simulation.clock.turn) || 0;
      const turns = Math.max(1, Math.ceil(eta - current));
      if (turns > 90) throw new Error('SAB34_FACTORY_ETA_EXCEEDS_TEST_BOUND:' + turns);
      const advanced = await simulation.advance(turns);
      if (advanced.status === 'ERROR' || advanced.steps !== turns) {
        throw new Error('SAB34_FACTORY_HAUL_CENTRAL_TURN_ADVANCE_FAILED:' + JSON.stringify(advanced));
      }
      const state = window.Game.state;
      const resource = state.resource.BGD;
      const run = window.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__.result;
      const shipment = (resource.industrialNetwork?.shipments || []).find(row =>
        String(row.shipmentId) === String(advanced.last?.phases?.SIMULATE?.shipments?.[0]?.shipmentId || '') ||
        (String(row.batchId) === String(run.batchId) && row.shipmentType === 'RAW_TO_FACTORY' && row.status === 'DELIVERED'));
      const factory = state.economy.BGD.productionAssets.find(row =>
        String(row.id || row.assetId || row.projectId) === String(run.factoryId));
      const delivery = (resource.industrialNetwork?.shipments || []).find(row =>
        String(row.batchId) === String(run.batchId) && row.shipmentType === 'RAW_TO_FACTORY' && row.status === 'DELIVERED');
      const inputLot = delivery && factory?.inputBatchLots?.find(row => String(row.batchId) === String(delivery.factoryInputBatchId));
      return {
        advancedTurns: turns,
        currentTurn: Number(simulation.clock.turn),
        delivery: delivery || shipment || null,
        factoryId: String(factory?.id || factory?.assetId || factory?.projectId || ''),
        inputLot: inputLot || null,
        inputInventory: factory?.inputInventory || {}
      };
    }, factoryEta);
    assert.equal(factoryArrival.delivery?.status, 'DELIVERED', JSON.stringify(factoryArrival));
    assert.equal(factoryArrival.delivery?.destinationStatus, 'FACTORY_RECEIVED');
    assert.equal(factoryArrival.factoryId, commissioning.factoryId);
    assert.ok(factoryArrival.inputLot, 'factory receipt must create an input batch lot');
    assert.ok(factoryArrival.inputLot.sourceBatchIds.includes(extraction.result.batchId));
    assert.ok(Number(factoryArrival.inputInventory.coal) > 0);
    metrics.factoryArrival = factoryArrival;
    metrics.stages.push('RAW_TO_FACTORY_DELIVERY_CREATED_TRACEABLE_FACTORY_INPUT_LOT');

    const production = await page.evaluate(async () => {
      const simulation = window.Omega.Simulation;
      const state = window.Game.state;
      const resource = state.resource.BGD;
      const run = window.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__.result;
      const factory = state.economy.BGD.productionAssets.find(row =>
        String(row.id || row.assetId || row.projectId) === String(run.factoryId));
      if (!factory) throw new Error('SAB34_RECEIVING_FACTORY_DISAPPEARED');
      let turns = 0;
      const finishedRows = () => (resource.batches || []).filter(row =>
        row.stage === 'FINISHED' && Array.isArray(row.sourceBatchIds) && row.sourceBatchIds.includes(run.batchId));
      const inputBalance = () => Number(factory.inputInventory?.coal) || 0;
      while (turns < 20 && (inputBalance() > 1e-6 || finishedRows().length < 2)) {
        const advanced = await simulation.advance(1);
        if (advanced.status === 'ERROR' || advanced.steps !== 1) {
          throw new Error('SAB34_FACTORY_CYCLE_CENTRAL_TURN_FAILED:' + JSON.stringify(advanced));
        }
        turns += 1;
      }
      const finished = finishedRows();
      const offer = (state.trade?.BGD?.offerBook || []).find(row =>
        row.resourceId === 'COAL_CONCENTRATE' && Number(row.quantity) > 0);
      const reconciliationApi = window.OmegaResourceEconomy || window.Omega?.ResourceEconomy;
      const reconciliation = reconciliationApi?.reconcileCountry?.('BGD') || null;
      const fiscal = reconciliationApi?.processCountry?.('BGD') || null;
      const fiscalRow = (state.finance?.BGD?.resourceExtractionFiscalLedger || []).find(row =>
        String(row.batchId) === String(run.batchId));
      return {
        turns,
        inputBalance: inputBalance(),
        finished: finished.map(row => ({
          batchId: row.batchId,
          resourceId: row.resourceId,
          sourceBatchIds: row.sourceBatchIds,
          sourceSiteIds: row.sourceSiteIds,
          sourceFactoryId: row.sourceFactoryId,
          stage: row.stage
        })),
        finishedGoodsLedgerCount: resource.finishedGoodsLedger?.length || 0,
        offer: offer || null,
        fiscal,
        fiscalRow: fiscalRow || null,
        treasury: Number(state.finance?.BGD?.available) || 0,
        reconciliation
      };
    });
    assert.equal(production.inputBalance, 0, JSON.stringify(production));
    assert.ok(production.finished.length >= 2, JSON.stringify(production));
    assert.ok(production.finished.every(row => row.sourceBatchIds.includes(extraction.result.batchId)));
    assert.ok(production.offer, 'finished goods must become available in the real market offer book');
    assert.ok(production.offer.sourceBatchIds.includes(extraction.result.batchId));
    assert.ok(production.offer.sourceSiteIds.includes(targetSite.siteId));
    assert.ok(production.fiscalRow?.valuationComplete && production.fiscalRow?.cashPosted, JSON.stringify(production));
    assert.ok(production.reconciliation?.result?.status === 'HEALTHY', JSON.stringify(production.reconciliation));
    metrics.production = production;
    metrics.stages.push('FACTORY_PROCESSED_INPUTS_TO_FINISHED_GOODS_MARKET_AND_TREASURY');

    const foreignAfterPipeline = await page.evaluate(() => JSON.stringify({
      resource: window.Game.state.resource?.KWT || null,
      economy: window.Game.state.economy?.KWT || null,
      finance: window.Game.state.finance?.KWT || null
    }));
    assert.equal(foreignAfterPipeline, preparation.foreignSnapshot,
      'running the selected BGD pipeline must not mutate the non-selected KWT country');

    const saveLoad = await page.evaluate(async slot => {
      const simulation = window.Omega.Simulation;
      const stateRoot = window.Game.state;
      const run = window.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__.result;
      const resource = stateRoot.resource.BGD;
      const factory = stateRoot.economy.BGD.productionAssets.find(row =>
        String(row.id || row.assetId || row.projectId) === String(run.factoryId));
      const finishedIds = (resource.batches || []).filter(row =>
        row.stage === 'FINISHED' && Array.isArray(row.sourceBatchIds) && row.sourceBatchIds.includes(run.batchId))
        .map(row => String(row.batchId)).sort();
      const finishedLedgerCount = resource.finishedGoodsLedger?.length || 0;
      const expected = {
        siteId: run.siteId,
        batchId: run.batchId,
        factoryId: String(factory?.id || factory?.assetId || factory?.projectId || ''),
        inputInventory: JSON.parse(JSON.stringify(factory?.inputInventory || {})),
        finishedIds,
        finishedLedgerCount,
        offer: JSON.parse(JSON.stringify((stateRoot.trade?.BGD?.offerBook || []).find(row =>
          row.resourceId === 'COAL_CONCENTRATE' && Number(row.quantity) > 0) || null)),
        treasury: Number(stateRoot.finance?.BGD?.available) || 0,
        sourceFlow: JSON.parse(JSON.stringify((resource.industrialNetwork?.siteFlowLedger || []).find(row =>
          String(row.batchId) === String(run.batchId)) || null))
      };
      const saved = await simulation.saveSlot(slot);
      if (!saved?.ok) throw new Error('SAB34_BROWSER_SAVE_FAILED:' + JSON.stringify(saved));
      const localStorageSaveAbsent = window.localStorage.getItem(saved.key) === null;
      const sentinel = '__sab34BrowserSaveLoadProbe';
      stateRoot.simulation[sentinel] = 'TAMPERED_AFTER_SAVE';
      const loaded = await simulation.loadSlot(slot);
      const restored = window.Game.state;
      const restoredResource = restored.resource.BGD;
      const restoredFactory = restored.economy.BGD.productionAssets.find(row =>
        String(row.id || row.assetId || row.projectId) === String(run.factoryId));
      const restoredFinishedIds = (restoredResource.batches || []).filter(row =>
        row.stage === 'FINISHED' && Array.isArray(row.sourceBatchIds) && row.sourceBatchIds.includes(run.batchId))
        .map(row => String(row.batchId)).sort();
      const result = {
        saveOk: saved.ok === true,
        storage: saved.storage || null,
        localStorageSaveAbsent,
        loadIntegrity: simulation.lastLoadIntegrity,
        sameAuthoritativeRoot: restored === stateRoot && simulation.world?.state === stateRoot,
        worldStateLinked: loaded?.authoritativeState?.worldStateLinked === true,
        sentinelCleared: stateRoot.simulation[sentinel] === undefined,
        siteId: (restoredResource.industrialNetwork?.siteFlowLedger || [])
          .find(row => String(row.batchId) === String(run.batchId))?.siteId || null,
        sourceBatchPresent: (restoredResource.batches || []).some(row => String(row.batchId) === String(run.batchId)),
        factoryPresent: !!restoredFactory,
        inputInventory: JSON.parse(JSON.stringify(restoredFactory?.inputInventory || {})),
        finishedIds: restoredFinishedIds,
        finishedLedgerCount: restoredResource.finishedGoodsLedger?.length || 0,
        offer: JSON.parse(JSON.stringify((restored.trade?.BGD?.offerBook || []).find(row =>
          row.resourceId === 'COAL_CONCENTRATE' && Number(row.quantity) > 0) || null)),
        treasury: Number(restored.finance?.BGD?.available) || 0,
        sourceFlow: JSON.parse(JSON.stringify((restoredResource.industrialNetwork?.siteFlowLedger || []).find(row =>
          String(row.batchId) === String(run.batchId)) || null))
      };
      try { window.localStorage.removeItem(saved.key); } catch (_) {}
      if (!result.saveOk || result.storage !== 'INDEXEDDB' || !result.localStorageSaveAbsent ||
          result.loadIntegrity !== 'VERIFIED' || !result.sameAuthoritativeRoot ||
          !result.worldStateLinked || !result.sentinelCleared) {
        throw new Error('SAB34_BROWSER_SAVE_LOAD_INTEGRITY_FAILED:' + JSON.stringify(result));
      }
      if (result.siteId !== expected.siteId || !result.sourceBatchPresent || !result.factoryPresent ||
          JSON.stringify(result.inputInventory) !== JSON.stringify(expected.inputInventory) ||
          JSON.stringify(result.finishedIds) !== JSON.stringify(expected.finishedIds) ||
          result.finishedLedgerCount !== expected.finishedLedgerCount ||
          JSON.stringify(result.offer) !== JSON.stringify(expected.offer) ||
          result.treasury !== expected.treasury ||
          JSON.stringify(result.sourceFlow) !== JSON.stringify(expected.sourceFlow)) {
        throw new Error('SAB34_SITE_PIPELINE_SAVE_LOAD_DATA_DRIFT:' + JSON.stringify({ expected, result }));
      }
      const replay = await simulation.advance(1);
      if (replay.status === 'ERROR' || replay.steps !== 1) throw new Error('SAB34_POST_RESTORE_REPLAY_FAILED:' + JSON.stringify(replay));
      const replayedLedgerCount = restoredResource.finishedGoodsLedger?.length || 0;
      const replayedFinishedIds = (restoredResource.batches || []).filter(row =>
        row.stage === 'FINISHED' && Array.isArray(row.sourceBatchIds) && row.sourceBatchIds.includes(run.batchId))
        .map(row => String(row.batchId)).sort();
      if (replayedLedgerCount !== expected.finishedLedgerCount ||
          JSON.stringify(replayedFinishedIds) !== JSON.stringify(expected.finishedIds)) {
        throw new Error('SAB34_POST_RESTORE_REPLAY_DUPLICATED_OUTPUT:' + JSON.stringify({
          expectedFinishedLedgerCount: expected.finishedLedgerCount,
          replayedLedgerCount,
          expectedFinishedIds: expected.finishedIds,
          replayedFinishedIds
        }));
      }
      return { ...result, replayTurn: replay.last?.turn, replayedLedgerCount, replayedFinishedIds };
    }, 'sab34-real-chromium-pipeline-' + Date.now());
    metrics.saveLoad = saveLoad;
    metrics.stages.push('INDEXEDDB_SAVE_LOAD_RESTORED_SITE_BATCH_FACTORY_MARKET_TREASURY_AND_REPLAY_IDEMPOTENCY');

    const finalErrors = { pageErrors, consoleErrors };
    metrics.errors = finalErrors;
    if (pageErrors.length || consoleErrors.some(message => !/net::ERR_BLOCKED_BY_CLIENT|blockedbyclient/i.test(message))) {
      throw new Error('SAB34_REAL_BROWSER_PAGE_OR_CONSOLE_ERRORS:' + JSON.stringify(finalErrors));
    }
    await page.screenshot({
      path: path.join(artifacts, 'sab34-real-browser-pipeline.png'),
      fullPage: true
    });
    fs.writeFileSync(path.join(artifacts, 'sab34-real-browser-pipeline.json'), JSON.stringify(metrics, null, 2));
    console.log('SAB34 REAL CHROMIUM SITE -> PRIVATE FACTORY -> FINISHED GOODS -> INDEXEDDB SAVE/LOAD PASSED');
  } catch (error) {
    metrics.failure = String(error && error.stack || error);
    metrics.errors = { pageErrors, consoleErrors };
    try { fs.writeFileSync(path.join(artifacts, 'sab34-real-browser-pipeline-failure.json'), JSON.stringify(metrics, null, 2)); } catch (_) {}
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
});
