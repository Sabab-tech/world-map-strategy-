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
        close: () => new Promise(done => server.close(() => done()))
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
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
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

    const before = await page.evaluate(() => {
      const state = window.Game.state;
      const country = 'BGD';
      const resource = state.resource?.[country] || {};
      const economy = state.economy?.[country] || {};
      const finance = state.finance?.[country] || {};
      const network = resource.industrialNetwork || {};
      return {
        inventory: JSON.stringify(resource.inventory || {}),
        warehouse: JSON.stringify(resource.warehouse || {}),
        treasury: Number(finance.available ?? finance.omegaFinance?.treasuryBalanceUsd ?? 0),
        assets: (economy.productionAssets || []).length,
        projects: (network.projects || []).length,
        proposalCount: (economy.privateEnterpriseLifecycle?.proposals || []).length,
        proposalIds: (economy.privateEnterpriseLifecycle?.proposals || []).map(row => row.proposalId),
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
    await form.locator('input[name="quantity"]').fill('1');
    await form.locator('select[name="sourcingPolicy"]').selectOption('MIXED');
    await form.locator('button[type="submit"]').click();

    const proposalCriteria = {
      owner:companyOptions[0], operator:companyOptions[1],
      factoryType:selectedFactoryType, previousTurn:before.turn
    };
    try {
      await page.waitForFunction(criteria => {
        const rows = window.Game?.state?.economy?.BGD?.privateEnterpriseLifecycle?.proposals || [];
        return rows.some(row => row.status === 'PROPOSED' &&
          row.companyId === criteria.owner &&
          row.operatorCompanyId === criteria.operator &&
          row.factoryType === criteria.factoryType &&
          Number(row.createdTurn) >= criteria.previousTurn);
      }, proposalCriteria, { timeout: 15000 });
    } catch (error) {
      const submitDiagnostics = await page.evaluate(() => {
        const cabinet = document.getElementById('cabinet-full-window');
        const main = cabinet?.querySelector('[data-omega-v2-main]');
        const lifecycleRoot = [cabinet, ...(cabinet ? Array.from(cabinet.querySelectorAll('*')) : [])]
          .find(node => node && Object.prototype.hasOwnProperty.call(node, '__omegaPrivateEnterpriseUiBound'));
        const proposals = window.Game?.state?.economy?.BGD?.privateEnterpriseLifecycle?.proposals || [];
        return {
          uiBound:lifecycleRoot?.__omegaPrivateEnterpriseUiBound || false,
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
      }).catch(diagnosticError => ({diagnosticError:String(diagnosticError && diagnosticError.message || diagnosticError)}));
      throw new Error('Private Company proposal submit did not persist. Initial wait: ' +
        String(error && error.message || error) + '. Submit diagnostics: ' + JSON.stringify(submitDiagnostics));
    }
    const after = await page.evaluate(criteria => {
      const state = window.Game.state;
      const resource = state.resource?.BGD || {};
      const economy = state.economy?.BGD || {};
      const finance = state.finance?.BGD || {};
      const network = resource.industrialNetwork || {};
      const proposals = economy.privateEnterpriseLifecycle?.proposals || [];
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
    metrics.browserSaveLoad = await page.evaluate(() => {
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
      const saved = runtime.saveSlot(slot);
      if (!saved || saved.ok !== true) throw new Error('BROWSER_SAVE_SLOT_FAILED');
      stateRoot.simulation[sentinel] = 'IN_MEMORY_TAMPER_AFTER_SAVE';
      const loaded = runtime.loadSlot(slot);
      const restoredIds = (window.Game.state.economy?.BGD?.privateEnterpriseLifecycle?.proposals || []).map(row => row.proposalId);
      const result = {
        saveOk: saved.ok === true,
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
      if (!result.saveOk || result.loadIntegrity !== 'VERIFIED' || !result.sameAuthoritativeRoot ||
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
            list.getEntries().forEach(entry => window.__omegaBrowserLongTasks.push({
              duration: entry.duration,
              startTime: entry.startTime
            }));
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
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
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
          const latency = await locator.evaluate(element => {
            const started = performance.now();
            element.click();
            return Number((performance.now() - started).toFixed(2));
          });
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
      return {
        longTaskObserverSupported: !!window.__omegaBrowserLongTaskObserverSupported,
        longTaskCount: rows.length,
        maxLongTaskMs: rows.reduce((max, row) => Math.max(max, Number(row.duration) || 0), 0),
        heapBeforeBytes: window.__omegaBrowserHeapBefore || null,
        usedHeapBytes: performance.memory?.usedJSHeapSize || null,
        heapLimitBytes: performance.memory?.jsHeapSizeLimit || null,
        pageErrors: []
      };
    });
    if (metrics.runtime.longTaskObserverSupported) {
      assert.ok(metrics.runtime.maxLongTaskMs <= 1000,
        'no sustained UI long task may exceed 1000ms; metrics=' + JSON.stringify(metrics.runtime));
    }
    if (metrics.runtime.heapBeforeBytes && metrics.runtime.usedHeapBytes) {
      assert.ok(metrics.runtime.usedHeapBytes - metrics.runtime.heapBeforeBytes <= 64 * 1024 * 1024,
        'repeated real-browser navigation must not grow the JS heap by more than 64 MiB: ' + JSON.stringify(metrics.runtime));
    }

    metrics.pageErrors = pageErrors.slice();
    metrics.consoleErrors = consoleErrors.slice();
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
    metrics.blockedExternalRequests = blockedExternalRequests.length;
    fs.writeFileSync(path.join(artifacts, 'omega-private-enterprise-browser-failure.json'), JSON.stringify(metrics, null, 2));
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close();
  }
});
