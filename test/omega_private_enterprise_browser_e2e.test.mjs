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

test('real Chromium browser verifies company-originated proposals, government tenders, responsive navigation and performance', {
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
    await page.waitForFunction(() =>
      !!window.Game?.state && !!window.Omega?.Simulation?.world?.state &&
      window.Game.state === window.Omega.Simulation.world.state
    , null, { timeout: 30000 });
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
      if (window.Omega?.Simulation?.clock && typeof window.Omega.Simulation.clock.stop === 'function') {
        window.Omega.Simulation.clock.stop();
      }
      if (window.Omega?.Simulation?.createSession) {
        const session = window.Omega.Simulation.createSession({ playerCountryId: country });
        if (!session || session.playerCountryId !== country) return { ok: false, reason: 'PLAYER_SESSION_NOT_CREATED' };
      }
      // Mount the route, then exercise its real country selector. A matching DOM
      // value alone is not proof that the UI-owned selection state received the change.
      const opened = window.OmegaUIV2Integration.openRoute('industry') === true;
      if (!opened) return { ok: false, reason: 'INDUSTRY_ROUTE_NOT_OPENED', country };
      const cabinet = document.getElementById('cabinet-full-window');
      if (!cabinet) return { ok: false, reason: 'CABINET_ROOT_MISSING', country };
      const selector = cabinet.querySelector('[data-omega-v2-country]');
      if (!selector) return { ok: false, reason: 'COUNTRY_SELECTOR_MISSING', country };
      selector.value = country;
      selector.dispatchEvent(new Event('change', { bubbles: true }));
      const mountedCountry = cabinet.__omegaUIV2State?.countryId || null;
      const selectedCountry = selector.value || null;
      const selectionAuthority = window.OmegaMinistryViewCountry || null;
      return {
        ok: selectedCountry === country && mountedCountry === country && selectionAuthority === country,
        reason: selectedCountry !== country ? 'COUNTRY_SELECTOR_MISMATCH' :
          mountedCountry !== country ? 'UI_COUNTRY_MISMATCH' :
          selectionAuthority !== country ? 'COUNTRY_SELECTION_AUTHORITY_MISMATCH' : null,
        selectedCountry,
        mountedCountry,
        selectionAuthority,
        country
      };
    });
    assert.equal(routeResult.ok, true, 'existing Industry route must open for the selected country');


    const linesTab = page.locator('#cabinet-full-window [data-omega-v2-main] [data-omega-v2-industry-tab="production-lines"]');
    await linesTab.waitFor({ state: 'visible', timeout: 30000 });
    await linesTab.click();
    const lifecyclePanel = page.locator('[data-omega-private-company-lifecycle]');
    await lifecyclePanel.waitFor({state:'visible',timeout:45000});
    await lifecyclePanel.locator('[data-pe-invitation-form]').waitFor({state:'visible',timeout:15000});
    assert.equal(await lifecyclePanel.locator('[data-pe-proposal-form]').count(),0,
      'government must not receive a form that lets it write a company proposal');
    assert.equal(await lifecyclePanel.locator('select[name="operatorCompanyId"]').count(),0,
      'government must not choose the company owner or operator');

    const marketDetails = lifecyclePanel.locator('[data-pe-market-details]');
    await marketDetails.locator('summary').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-pe-market-host]')?.getAttribute('data-loaded') === 'true'
    , null, { timeout: 15000 });
    const marketPanelText = await page.locator('[data-pe-market-host]').textContent();
    assert.match(marketPanelText,/No verified, settled private-company sales|concentration/i,
      'market concentration must continue to use recorded settled-sales evidence');
    await marketDetails.locator('summary').click();

    const oversightDetails = lifecyclePanel.locator('[data-pe-oversight-details]');
    await oversightDetails.locator('summary').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-pe-oversight-host]')?.getAttribute('data-loaded') === 'true'
    , null, { timeout: 15000 });
    const oversightPanelText = await page.locator('[data-pe-oversight-host]').textContent();
    assert.match(oversightPanelText,/Company solvency and current liabilities/);
    assert.match(oversightPanelText,/AURORA|NOVA|MERIDIAN/i,
      'oversight must still show the canonical private companies');
    assert.match(oversightPanelText,/Government restructuring decisions/);
    await oversightDetails.locator('summary').click();

    const companyPlan = await page.evaluate(() => {
      const api = window.OmegaPrivateEnterpriseLifecycleV1;
      const state = window.Game?.state;
      const baseline = window.OmegaPrivateEnterpriseRegistryV1?.getCountryBaseline?.('BGD');
      if (!api || !state || !baseline || baseline.status !== 'READY') {
        throw new Error('COMPANY_BASELINE_OR_LIFECYCLE_API_NOT_READY');
      }
      const proposals = api.getCountryDashboard('BGD').proposals || [];
      const activeStatuses = new Set([
        'PROPOSED','ON_HOLD','NEGOTIATION_PENDING_COMPANY','APPROVED_AWAITING_FUNDING',
        'FUNDED','UNDER_CONSTRUCTION','PARTIALLY_UNDER_CONSTRUCTION','COMMISSIONED_PRODUCTION_GATED'
      ]);
      const lastPeriod = Number(state.economy?.BGD?.privateEnterpriseLifecycle?.lastAutonomousProposalPeriod || 0);
      const currentTurn = Number(state.simulation?.turn || 0);
      const currentPeriod = Math.floor(currentTurn / 30);
      const firstPeriod = Math.max(lastPeriod,currentPeriod,0) + 1;
      for (let period = firstPeriod; period <= firstPeriod + 9; period += 1) {
        const companyId = api.companyIds[(period - 1) % api.companyIds.length];
        if (proposals.some(row => row.companyId === companyId && activeStatuses.has(row.status))) continue;
        const company = (baseline.companies || []).find(row => String(row.companyId || row.id).toUpperCase() === companyId);
        const counts = company?.factoryCounts || {};
        const factoryTypes = Object.keys(counts).filter(type =>
          Number(counts[type]) > 0 && type !== 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'
        ).sort();
        for (const factoryType of factoryTypes) {
          const preview = api.previewCompanyExpansion('BGD',companyId,factoryType,1);
          if (preview?.status === 'READY') {
            return {period,companyId,factoryType,previewStatus:preview.status};
          }
        }
      }
      throw new Error('NO_COMPANY_WITH_A_READY_OPENING_FACTORY_ALLOCATION');
    });
    assert.ok(companyPlan.companyId && companyPlan.factoryType,
      'a company must select its own existing factory allocation before responding to a tender');

    const before = await page.evaluate(() => {
      const state = window.Game.state;
      const resource = state.resource?.BGD || {};
      const economy = state.economy?.BGD || {};
      const finance = state.finance?.BGD || {};
      const proposals = window.OmegaPrivateEnterpriseLifecycleV1.getCountryDashboard('BGD').proposals || [];
      return {
        inventory:JSON.stringify(resource.inventory || {}),
        warehouse:JSON.stringify(resource.warehouse || {}),
        treasury:Number(finance.available ?? finance.omegaFinance?.treasuryBalanceUsd ?? 0),
        assets:(economy.productionAssets || []).length,
        projects:(resource.industrialNetwork?.projects || []).length,
        proposalIds:proposals.map(row=>row.proposalId),
        proposalCount:proposals.length,
        foreignCountry:JSON.stringify({
          inventory:state.resource?.USA?.inventory || {},
          warehouse:state.resource?.USA?.warehouse || {},
          treasury:state.finance?.USA?.available || 0,
          assets:state.economy?.USA?.productionAssets || []
        })
      };
    });

    const invitationForm = lifecyclePanel.locator('[data-pe-invitation-form]');
    await invitationForm.locator('select[name="factoryType"]').selectOption(companyPlan.factoryType);
    await invitationForm.locator('input[name="quantity"]').fill('1');
    await invitationForm.locator('select[name="supportType"]').selectOption('NO_PUBLIC_FINANCING');
    await invitationForm.locator('input[name="maxGovernmentContribution"]').fill('0');
    const invitationId = 'BROWSER-INDUSTRIAL-TENDER-' + Date.now();
    await invitationForm.locator('input[name="requestId"]').fill(invitationId);
    await invitationForm.locator('textarea[name="governmentRationale"]').fill(
      'The government identifies a domestic capacity gap and invites existing private companies to submit independently researched offers.'
    );
    await invitationForm.locator('button[type="submit"]').click();
    await page.waitForFunction(id => {
      const rows = window.OmegaPrivateEnterpriseLifecycleV1?.getCountryDashboard?.('BGD')?.governmentInvitations || [];
      return rows.some(row => row.requestId === id && row.status === 'OPEN');
    }, invitationId, {timeout:15000});
    const afterInvitation = await page.evaluate(id => {
      const state=window.Game.state,resource=state.resource?.BGD||{},economy=state.economy?.BGD||{},
        finance=state.finance?.BGD||{},dashboard=window.OmegaPrivateEnterpriseLifecycleV1.getCountryDashboard('BGD');
      return {
        inventory:JSON.stringify(resource.inventory||{}),
        warehouse:JSON.stringify(resource.warehouse||{}),
        treasury:Number(finance.available??finance.omegaFinance?.treasuryBalanceUsd??0),
        assets:(economy.productionAssets||[]).length,
        projects:(resource.industrialNetwork?.projects||[]).length,
        proposalCount:dashboard.proposals.length,
        invitation:dashboard.governmentInvitations.find(row=>row.requestId===id) || null
      };
    }, invitationId);
    assert.equal(afterInvitation.proposalCount,before.proposalCount,
      'publishing a government tender must not manufacture a company proposal');
    assert.equal(afterInvitation.inventory,before.inventory,'publishing a tender must not alter inventory');
    assert.equal(afterInvitation.warehouse,before.warehouse,'publishing a tender must not reserve warehouse stock');
    assert.equal(afterInvitation.treasury,before.treasury,'publishing a tender must not spend public funds');
    assert.equal(afterInvitation.assets,before.assets,'publishing a tender must not create a factory');
    assert.equal(afterInvitation.projects,before.projects,'publishing a tender must not create a construction project');

    const companyResponse = await page.evaluate(period => {
      window.Game.state.simulation.turn = period * 30;
      return window.OmegaPrivateEnterpriseLifecycleV1.advanceAutonomousProposalCycle();
    }, companyPlan.period);
    assert.equal(companyResponse.status,'PROPOSED',JSON.stringify(companyResponse));
    assert.equal(companyResponse.proposal.companyId,companyPlan.companyId);
    assert.equal(companyResponse.proposal.submittedBy,companyPlan.companyId);
    assert.equal(companyResponse.proposal.proposalOrigin,'GOVERNMENT_INVITATION_RESPONSE');
    await page.waitForFunction(() => {
      const card=document.querySelector('[data-pe-decision-card]');
      return card && card.querySelector('[data-pe-offer-summary]') &&
        card.querySelector('[data-pe-company-case-details]') &&
        card.querySelector('[data-pe-government-review-details]');
    },null,{timeout:15000});
    const companyOfferText=await lifecyclePanel.locator('[data-pe-offer-summary]').first().innerText();
    assert.match(companyOfferText,/Company wants to build/i);
    assert.match(companyOfferText,/Construction period/i);
    const invitationRecord = await page.evaluate(id => window.OmegaPrivateEnterpriseLifecycleV1
      .getCountryDashboard('BGD').governmentInvitations.find(row=>row.requestId===id),invitationId);
    assert.equal(companyResponse.proposal.governmentInvitationId,invitationRecord.invitationId);
    assert.ok(companyResponse.proposal.companyCase?.marketAnalysis,
      'company must submit its own market analysis');
    assert.ok(companyResponse.proposal.companyCase?.supplyChainProof,
      'company must submit its own supply-chain evidence');
    assert.ok(companyResponse.proposal.companyCase?.financingOffer,
      'company must state its preferred financing and funding gap');
    const afterCompany = await page.evaluate(proposalId => {
      const state=window.Game.state,resource=state.resource?.BGD||{},economy=state.economy?.BGD||{},
        finance=state.finance?.BGD||{},dashboard=window.OmegaPrivateEnterpriseLifecycleV1.getCountryDashboard('BGD');
      return {
        inventory:JSON.stringify(resource.inventory||{}),
        warehouse:JSON.stringify(resource.warehouse||{}),
        treasury:Number(finance.available??finance.omegaFinance?.treasuryBalanceUsd??0),
        assets:(economy.productionAssets||[]).length,
        projects:(resource.industrialNetwork?.projects||[]).length,
        foreignCountry:JSON.stringify({
          inventory:state.resource?.USA?.inventory||{},
          warehouse:state.resource?.USA?.warehouse||{},
          treasury:state.finance?.USA?.available||0,
          assets:state.economy?.USA?.productionAssets||[]
        }),
        proposal:dashboard.proposals.find(row=>row.proposalId===proposalId) || null
      };
    }, companyResponse.proposal.proposalId);
    assert.equal(afterCompany.inventory,before.inventory,'a proposal must not change raw/finished inventory');
    assert.equal(afterCompany.warehouse,before.warehouse,'a proposal must not create or reserve warehouse stock');
    assert.equal(afterCompany.treasury,before.treasury,'a proposal must not move company or Treasury cash');
    assert.equal(afterCompany.assets,before.assets,'a proposal must not create a production asset');
    assert.equal(afterCompany.projects,before.projects,'a proposal must not create a construction project');
    assert.equal(afterCompany.foreignCountry,before.foreignCountry,'selected-country proposal must not change another country');
    assert.equal(afterCompany.proposal.companyId,companyPlan.companyId);
    assert.equal(afterCompany.proposal.submittedBy,companyPlan.companyId);
    assert.equal(afterCompany.proposal.proposalOrigin,'GOVERNMENT_INVITATION_RESPONSE');
    metrics.proposalStage = 'PASS_COMPANY_ORIGINATED_TENDER_RESPONSE_NO_SIDE_EFFECTS';

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
        governmentInvitationVisible: !!element.querySelector('[data-pe-invitation-form]'),
        governmentDoesNotAuthorCompanyProposal: !element.querySelector('[data-pe-proposal-form]'),
        operatorSelectorAbsent: !element.querySelector('select[name="operatorCompanyId"]'),
        tab: element.closest('[data-omega-v2-industry-content]')?.getAttribute('data-active-tab') || null
      }));
      assert.ok(layout.panelWidth > 0, viewport.name + ': private lifecycle panel must remain measurable');
      assert.ok(layout.panelScrollWidth <= layout.panelWidth + 2,
        viewport.name + ': private lifecycle panel must not overflow its own width: ' + JSON.stringify(layout));
      assert.ok(layout.bodyScrollWidth <= viewport.width + 2,
        viewport.name + ': the whole page must not overflow horizontally: ' + JSON.stringify(layout));
      assert.equal(layout.governmentInvitationVisible, true, viewport.name + ': government tender form must remain visible');
      assert.equal(layout.governmentDoesNotAuthorCompanyProposal, true, viewport.name + ': government must not author a company proposal');
      assert.equal(layout.operatorSelectorAbsent, true, viewport.name + ': government must not select the private operator');
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


test('real Chromium map marker routes the exact site to selected factory input and canonical save/load', {
  timeout: 300000
}, async () => {
  const artifacts = process.env.OMEGA_BROWSER_TEST_ARTIFACT_DIR || path.join(ROOT, 'test-results', 'sab34-real-browser-pipeline');
  fs.mkdirSync(artifacts, { recursive: true });
  const server = await startStaticServer();
  let browser;
  let page;
  const pageErrors = [];
  const consoleErrors = [];
  const metrics = { browser: 'Chromium', offlineNetwork: true, stages: [], progressLogs: [] };

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
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
    page.on('console', message => {
      const messageText=message.text();
      if(messageText.startsWith('[SAB34_PROGRESS]'))metrics.progressLogs.push(messageText);
      if (message.type() === 'error') consoleErrors.push(messageText);
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
      // Turn-level profiling is opt-in and confined to this isolated SAB-34 browser proof.
      window.__OMEGA_RESOURCE_ECONOMY_PERF__ = true;
      window.__OMEGA_RESOURCE_ECON_PERF__ = true;
      const simulation = window.Omega?.Simulation;
      const endowment = window.OmegaResourceEndowmentRuntime || window.Omega?.ResourceEndowmentRuntime;
      const industry = window.OmegaResourceIndustrialNetwork || window.Omega?.ResourceIndustrialNetwork;
      const economy = window.OmegaResourceEconomy || window.Omega?.ResourceEconomy;
      const governmentBaseline = window.OmegaCountryFactoryStartingBaselineV1 || window.Omega?.CountryFactoryStartingBaselineV1;
      const privateBaseline = window.OmegaPrivateEnterpriseRegistryV1 || window.Omega?.PrivateEnterpriseRegistryV1;
      if (!simulation?.clock || !endowment || !industry || !economy || !governmentBaseline || !privateBaseline) {
        throw new Error('SAB34_REQUIRED_RUNTIME_NOT_MOUNTED');
      }
      // Preserve the authoritative runtime behavior while exposing the exact turn result
      // to this isolated browser proof. This is diagnostic-only and does not change state.
      if (!window.__sab34IndustryTurnProbeInstalled) {
        const authoritativeIndustry = industry;
        const observedIndustry = Object.assign({}, authoritativeIndustry, {
          runCountryTurn: async function(countryId, ...args) {
            const call = {
              countryId: String(countryId || ''),
              turnBefore: Number(window.Game?.state?.simulation?.turn) || 0,
              dateBefore: String(window.Game?.state?.simulation?.date || ''),
              playerCountryBefore: String(window.Omega?.Simulation?.getPlayerCountryId?.() || ''),
              sessionCountryBefore: String(window.Game?.state?.simulation?.session?.playerCountryId || '')
            };
            window.__sab34IndustrialTurnCalls = (window.__sab34IndustrialTurnCalls || []).concat(call).slice(-16);
            try {
              const result = await authoritativeIndustry.runCountryTurn(countryId, ...args);
              window.__sab34LastIndustrialTurnResult = JSON.parse(JSON.stringify(result));
              window.__sab34LastIndustrialTurnError = null;
              return result;
            } catch (error) {
              window.__sab34LastIndustrialTurnError = {
                countryId: call.countryId, turn: Number(window.Game?.state?.simulation?.turn) || 0,
                message: String(error?.message || error),
                stack: String(error?.stack || '')
              };
              throw error;
            } finally {
              call.turnAfter = Number(window.Game?.state?.simulation?.turn) || 0;
              call.dateAfter = String(window.Game?.state?.simulation?.date || '');
            }
          }
        });
        window.Omega = window.Omega || {};
        window.Omega.ResourceIndustrialNetwork = observedIndustry;
        window.OmegaResourceIndustrialNetwork = observedIndustry;
        window.__sab34ObservedIndustryApi = observedIndustry;
        window.__sab34IndustryTurnProbeInstalled = true;
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

      // This acceptance proof exercises the real authoritative turn coordinator and every
      // registered turn participant, including Resource Economy, mine logistics, Trade,
      // private-enterprise lifecycle and production/fiscal settlement. The global world
      // simulation and the separate 17-ministry pump are intentionally excluded here:
      // they do not contribute to this single-country resource pipeline and have their own
      // independent required CI workflows (OMEGA Ministry Runtime / OMEGA Language System).
      // Keep these exclusions test-local; never modify the production coordinator or gate.
      const turnParticipants = typeof simulation.participantDiagnostics === 'function'
        ? simulation.participantDiagnostics() : [];
      const resourceEconomy = window.OmegaResourceEconomy || window.Omega?.ResourceEconomy;
      const globalTrade = window.OmegaGlobalTrade || window.Omega?.GlobalTrade;
      const privateLifecycle = window.OmegaPrivateEnterpriseLifecycleV1 || window.Omega?.PrivateEnterpriseLifecycleV1;
      if (!turnParticipants.length || typeof resourceEconomy?.runTurn !== 'function' ||
          typeof globalTrade?.processCountry !== 'function' ||
          typeof privateLifecycle?.getCountryDashboard !== 'function') {
        throw new Error('SAB34_RESOURCE_TURN_PARTICIPANTS_NOT_READY:' + JSON.stringify({
          participantCount: turnParticipants.length,
          resourceEconomyReady: typeof resourceEconomy?.runTurn === 'function',
          globalTradeReady: typeof globalTrade?.processCountry === 'function',
          privateLifecycleReady: typeof privateLifecycle?.getCountryDashboard === 'function'
        }));
      }
      window.__sab34ResourceTurnParticipantIds = turnParticipants.map(row => row.id);
      window.__sab34ResourceTurnAdvanceInProgress = false;
      window.__sab34ResourceTurnWatch = window.__sab34ResourceTurnWatch || {
        active: null, trace: [], timeoutMs: 120000
      };
      const wrapTurnStage = (label, handler) => {
        if (typeof handler !== 'function' || handler.__sab34TurnWatchWrapped) return handler;
        const wrapped = async function(...args) {
          const watch = window.__sab34ResourceTurnWatch;
          const entry = { label, startedAt: Date.now(), status: 'RUNNING' };
          watch.trace.push(entry);
          if (watch.trace.length > 128) watch.trace.splice(0, watch.trace.length - 128);
          watch.active = label;
          try{console.info('[SAB34_PROGRESS] TURN_STAGE_START '+label);}catch(_){}
          let timeoutId = null;
          try {
            const timeout = new Promise((_, reject) => {
              timeoutId = window.setTimeout(() => reject(
                new Error('SAB34_TURN_STAGE_TIMEOUT:' + label)
              ), watch.timeoutMs);
            });
            const result = await Promise.race([
              Promise.resolve().then(() => handler.apply(this, args)),
              timeout
            ]);
            entry.status = 'COMPLETED';
            return result;
          } catch (error) {
            entry.status = 'FAILED';
            entry.error = String(error && error.message || error);
            throw error;
          } finally {
            if (timeoutId !== null) window.clearTimeout(timeoutId);
            entry.finishedAt = Date.now();
            entry.durationMs = entry.finishedAt - entry.startedAt;
            try{console.info('[SAB34_PROGRESS] TURN_STAGE_FINISH '+label+' '+entry.status+' '+entry.durationMs+'ms');}catch(_){}
            watch.active = null;
          }
        };
        wrapped.__sab34TurnWatchWrapped = true;
        return wrapped;
      };
      window.__sab34AdvanceResourceTurns = async function(turns) {
        if (window.__sab34ResourceTurnAdvanceInProgress) {
          throw new Error('SAB34_RESOURCE_TURN_ADVANCE_REENTRANT');
        }
        const previousWorldEngine = simulation.worldEngine;
        const previousMinistryPump = simulation.ministryPump;
        const requestedTurns = Math.max(0, Math.floor(Number(turns) || 0));
        window.__sab34ResourceTurnAdvanceInProgress = true;
        simulation.worldEngine = {
          setAuthoritativeState() {},
          processSimulationTick() {
            return { status: 'SKIPPED_TEST_SCOPE', authority: 'SAB34_BROWSER_RESOURCE_PIPELINE_SCOPE' };
          }
        };
        simulation.ministryPump = null;
        try {
          for (const [phase, handler] of simulation.phaseHandlers.entries()) {
            simulation.phaseHandlers.set(phase, wrapTurnStage('phase:' + phase, handler));
          }
          for (const [id, entry] of simulation.turnParticipants.entries()) {
            entry.handler = wrapTurnStage('participant:' + id, entry.handler);
          }
          for (const [id, entry] of simulation.turnFinalizers.entries()) {
            entry.handler = wrapTurnStage('finalizer:' + id, entry.handler);
          }
          return await simulation.advance(requestedTurns);
        } finally {
          simulation.worldEngine = previousWorldEngine;
          simulation.ministryPump = previousMinistryPump;
          window.__sab34ResourceTurnAdvanceInProgress = false;
        }
      };

      // Route ETA is persisted as both a game turn and a calendar date. The browser
      // proof must exercise the real due-shipment and receipt handlers, but it does
      // not need to simulate every intervening month with all 197-country/ministry
      // listeners. Move the isolated test clock to the day before the recorded ETA,
      // then commit one real turn so the production shipment pipeline settles it.
      window.__sab34AdvanceResourceTurnsToEta = async function(etaTurn, etaDate, label) {
        const clock = simulation.clock;
        const state = window.Game.state;
        const dayMs = 86400000;
        const requestedDateMs = Date.parse(String(etaDate || '').slice(0, 10) + 'T00:00:00.000Z');
        const currentDate = String(state.simulation?.date || clock.simulationDate()).slice(0, 10);
        const currentDateMs = Date.parse(currentDate + 'T00:00:00.000Z');
        if (!Number.isFinite(requestedDateMs) || !Number.isFinite(currentDateMs)) {
          throw new Error('SAB34_SHIPMENT_ETA_DATE_INVALID:' + JSON.stringify({label, etaDate, currentDate}));
        }
        const currentTurn = Math.max(0, Number(clock.turn) || 0);
        const targetTurn = Math.max(currentTurn + 1, Math.ceil(Number(etaTurn) || currentTurn + 1));
        const targetDateMs = Math.max(requestedDateMs, currentDateMs + dayMs);
        const compressedTurns = Math.max(0, targetTurn - currentTurn - 1);
        clock.turn = targetTurn - 1;
        clock.simulationTimeMs = targetDateMs - dayMs - clock.startEpochMs;
        clock.stepDurationMs = dayMs;
        clock.gameDaysPerTurn = 1;
        state.simulation.turn = clock.turn;
        state.simulation.date = new Date(targetDateMs - dayMs).toISOString().slice(0, 10);
        state.simulation.daysPerTurn = 1;
        console.info('[SAB34_PROGRESS] ETA_FAST_FORWARD ' + JSON.stringify({
          label, fromTurn: currentTurn, targetTurn, compressedTurns,
          recordedEtaDate: new Date(requestedDateMs).toISOString().slice(0, 10),
          committedEtaDate: new Date(targetDateMs).toISOString().slice(0, 10)
        }));
        try {
          const advanced = await window.__sab34AdvanceResourceTurns(1);
          if (advanced.status === 'ERROR' || advanced.steps !== 1 || Number(clock.turn) !== targetTurn) {
            throw new Error('SAB34_SHIPMENT_ETA_FAST_FORWARD_FAILED:' + JSON.stringify({advanced, targetTurn, label}));
          }
          return { ...advanced, requestedEtaTurn: Number(etaTurn), requestedEtaDate: new Date(requestedDateMs).toISOString().slice(0, 10),
            committedEtaDate: clock.simulationDate().slice(0, 10), compressedTurns };
        } finally {
          clock.gameDaysPerTurn = 30;
          clock.stepDurationMs = 30 * dayMs;
          state.simulation.daysPerTurn = 30;
        }
      };

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
      const startupStock = Object.fromEntries(Object.entries(profile.constructionMaterials || {})
        .map(([resourceId, quantity]) => [resourceId, Number(quantity) * 2]));
      startupStock.coal = Math.max(Number(startupStock.coal) || 0, 60000);
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

      // Finance has its own country-wide turn participant and may initialize a non-selected
      // country's finance bucket when a real global turn is committed. This site-runtime
      // isolation check therefore compares only the selected-country resource/economy stores.
      const foreignResourceEconomySnapshot = JSON.stringify({
        resource: state.resource?.KWT || null,
        economy: state.economy?.KWT || null
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
        foreignResourceEconomySnapshot,
        legacyTurnListenerDiagnostics: Array.isArray(window.__OMEGA_LEGACY_TURN_LISTENER_DIAGNOSTICS__)
          ? window.__OMEGA_LEGACY_TURN_LISTENER_DIAGNOSTICS__.map(row => Object.assign({}, row)) : [],
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

    const commissioningPromise = page.evaluate(async () => {
      const state = window.Game.state;
      const simulation = window.Omega.Simulation;
      const industry = window.OmegaResourceIndustrialNetwork || window.Omega?.ResourceIndustrialNetwork;
      const lifecycle = window.OmegaPrivateEnterpriseLifecycleV1 || window.Omega?.PrivateEnterpriseLifecycleV1;
      const catalog = window.OmegaResourceIndustrialCatalogData || window.Omega?.ResourceIndustrialCatalogData;
      const profile = catalog?.factoryProfiles?.UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT;
      if (!lifecycle || typeof lifecycle.createProposal !== 'function' ||
          typeof lifecycle.productionGateReason !== 'function' || !industry ||
          typeof industry.startFactoryProject !== 'function' || !profile) {
        throw new Error('SAB34_ACCEPTANCE_GATE_OR_CANONICAL_FACTORY_RUNTIME_NOT_MOUNTED');
      }
      const proofAcceptedAtStart = lifecycle.productionProofReady() === true;
      const gateReasonAtStart = lifecycle.productionGateReason();
      if (!proofAcceptedAtStart && gateReasonAtStart !== 'SAB34_LIVE_BROWSER_SITE_TO_FACTORY_PROOF_NOT_ACCEPTED') {
        throw new Error('SAB34_PRIVATE_PRODUCTION_DID_NOT_FAIL_CLOSED_FOR_MISSING_BROWSER_CERTIFICATE:' + gateReasonAtStart);
      }
      console.info('[SAB34_PROGRESS] COMMISSIONING_BEGIN '+JSON.stringify({turn:simulation.clock.turn,participants:simulation.participantDiagnostics?.().map(row=>row.id)||[]}));
      const proposal = lifecycle.createProposal({
        countryId:'BGD',companyId:'NOVA_CONSUMER_INDUSTRIES',operatorCompanyId:'MERIDIAN_ENGINEERING_GROUP',
        factoryType:'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT',processingResourceId:'coal',
        quantity:1,sourcingPolicy:'COMPANY_FUNDED_IMPORTS',stateSupportRequested:true,
        requestReason:'Nova Consumer Industries requests a coal-processing facility to convert attributable domestic coal extraction into a saleable industrial intermediate.',
        expectedBenefit:'The commissioned plant adds modeled coal-concentrate output capacity. Company income is recognized only after a buyer consumes attributable output and the market settlement posts.',
        riskForecast:'The project remains exposed to mine output, shipment delays, recipe input quality, utility availability, construction capital, warehouse capacity and uncertain customer demand.'
      });
      if(proposal.status!=='PROPOSED')throw new Error('SAB34_PRIVATE_PROPOSAL_FAILED:'+JSON.stringify(proposal));
      console.info('[SAB34_PROGRESS] PROPOSAL_CREATED '+proposal.proposalId);
      const decision=lifecycle.decideProposal({countryId:'BGD',proposalId:proposal.proposalId,decision:'APPROVE',
        allowStateSupport:true,conditions:{allowStateSupport:true}});
      if(decision.status!=='APPROVED_AWAITING_FUNDING')throw new Error('SAB34_PRIVATE_PERMIT_FAILED:'+JSON.stringify(decision));
      console.info('[SAB34_PROGRESS] PROPOSAL_APPROVED '+proposal.proposalId);
      const funding=lifecycle.fundProposal({countryId:'BGD',proposalId:proposal.proposalId,
        sourceType:'GOVERNMENT_GRANT',amount:proposal.capitalRequired});
      if(funding.status!=='FUNDED')throw new Error('SAB34_PRIVATE_FUNDING_FAILED:'+JSON.stringify(funding));
      console.info('[SAB34_PROGRESS] PROPOSAL_FUNDED '+proposal.proposalId);
      const privateConstruction=lifecycle.startConstruction({countryId:'BGD',proposalId:proposal.proposalId});
      console.info('[SAB34_PROGRESS] PRIVATE_CONSTRUCTION_STARTED '+JSON.stringify(privateConstruction));
      if(privateConstruction.status!=='UNDER_CONSTRUCTION'||privateConstruction.started?.length!==1)
        throw new Error('SAB34_PRIVATE_CONSTRUCTION_FAILED:'+JSON.stringify(privateConstruction));
      const privateProjectId=privateConstruction.started[0].projectId;
      let governmentProject=null;
      if(!proofAcceptedAtStart){
        const qualificationFactoryStartedAt=performance.now();
        console.info('[SAB34_PROGRESS] QUALIFICATION_FACTORY_START '+JSON.stringify({
          countryId:'BGD',factoryType:'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT',
          batchCount:Array.isArray(state.resource?.BGD?.batches)?state.resource.BGD.batches.length:0,
          bomResourceCount:Object.keys(profile.constructionMaterials||{}).length
        }));
        governmentProject=industry.startFactoryProject({
          countryId:'BGD',factoryType:'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT',
          recipeId:privateConstruction.started[0].recipeId,resourceId:'coal',
          buildDays:Math.max(1,Number(privateConstruction.started[0].durationDays)||180),
          capacityPerDay:Math.max(1,Number(profile.defaultCapacityPerDay)||1),
          requestId:'SAB34_LIVE_BROWSER_STATE_OWNED_FACTORY_QUALIFICATION'
        });
        console.info('[SAB34_PROGRESS] QUALIFICATION_FACTORY_FINISH '+JSON.stringify({
          durationMs:Number((performance.now()-qualificationFactoryStartedAt).toFixed(2)),
          status:governmentProject?.status||null,projectId:governmentProject?.projectId||null
        }));
        if(governmentProject?.status!=='UNDER_CONSTRUCTION')
          throw new Error('SAB34_STATE_OWNED_QUALIFICATION_FACTORY_CONSTRUCTION_FAILED:'+JSON.stringify(governmentProject));
      }
      if(!simulation.clock||typeof simulation.clock.pause!=='function')throw new Error('SAB34_CANONICAL_CLOCK_PAUSE_UNAVAILABLE');
      simulation.clock.pause();
      if(simulation.clock.paused!==true)throw new Error('SAB34_BACKGROUND_ENGINE_CLOCK_NOT_PAUSED');
      const constructionDays=Math.max(1,Math.ceil(Math.max(
        Number(governmentProject?.durationDays)||0,Number(privateConstruction.started[0].durationDays)||180)));
      // Construction receives its own explicit project-progress window. The central
      // simulation clock, mine extraction, mine-haul routing and every other turn
      // participant remain on the normal 30-day window.
      const resourceWindowDays=30;
      const resourceWindowMs=resourceWindowDays*86400000;
      simulation.clock.gameDaysPerTurn=resourceWindowDays;
      simulation.clock.stepDurationMs=resourceWindowMs;
      state.simulation.daysPerTurn=resourceWindowDays;
      if(Number(simulation.clock.stepDurationMs)!==resourceWindowMs||
         Number(simulation.clock.gameDaysPerTurn)!==resourceWindowDays)
        throw new Error('SAB34_CONSTRUCTION_FAST_FORWARD_CHANGED_RESOURCE_WINDOW');
      const constructionAdvance=industry.advanceProjects('BGD',{
        constructionDaysOverride:constructionDays,
        projectIds:[privateProjectId,governmentProject?.projectId].filter(Boolean)
      });
      const advancedProjectIds=(constructionAdvance.completed||[]).map(row=>String(row.projectId||''));
      if(constructionAdvance.status!=='ADVANCED'||!advancedProjectIds.includes(String(privateProjectId))||
         (governmentProject&&!advancedProjectIds.includes(String(governmentProject.projectId))))
        throw new Error('SAB34_CONSTRUCTION_ONLY_ADVANCE_FAILED:'+JSON.stringify({
          constructionDays,constructionAdvance,privateProjectId,governmentProjectId:governmentProject?.projectId||null
        }));
      console.info('[SAB34_PROGRESS] CONSTRUCTION_ONLY_ADVANCE_FINISH '+JSON.stringify({
        constructionDays,completedProjectIds:advancedProjectIds,turn:simulation.clock.turn,
        resourceWindowDays:simulation.clock.stepDurationMs/86400000
      }));
      const advanced=await window.__sab34AdvanceResourceTurns(1);
      console.info('[SAB34_PROGRESS] NORMAL_RESOURCE_TURN_FINISH '+JSON.stringify({
        steps:advanced.steps,status:advanced.status,turn:simulation.clock.turn,
        resourceWindowDays:simulation.clock.stepDurationMs/86400000,
        gameDaysPerTurn:simulation.clock.gameDaysPerTurn
      }));
      if(advanced.status==='ERROR'||advanced.steps!==1)
        throw new Error('SAB34_CENTRAL_GAME_CLOCK_RESOURCE_TURN_FAILED:'+JSON.stringify({constructionDays,advanced}));
      const projects=state.resource.BGD.industrialNetwork.projects;
      const privateProject=projects.find(row=>String(row.projectId)===String(privateProjectId));
      const privateFactory=state.economy.BGD.productionAssets.find(row=>String(row.constructionProjectId)===String(privateProjectId));
      if(privateProject?.status!=='COMPLETED'||!privateFactory)
        throw new Error('SAB34_PRIVATE_FACTORY_NOT_COMMISSIONED:'+JSON.stringify({privateProject,privateFactoryPresent:!!privateFactory}));
      if(privateFactory.ownerType!=='PRIVATE_ENTERPRISE'||privateFactory.ownerCompanyId!=='NOVA_CONSUMER_INDUSTRIES'||
         privateFactory.operatorType!=='PRIVATE_COMPANY_OPERATOR'||privateFactory.operatorCompanyId!=='MERIDIAN_ENGINEERING_GROUP')
        throw new Error('SAB34_PRIVATE_FACTORY_OWNER_OPERATOR_MISMATCH:'+JSON.stringify(privateFactory));
      if(proofAcceptedAtStart){
        if(privateFactory.productionEnabled!==true||privateFactory.status!=='OPERATIONAL')
          throw new Error('SAB34_VERIFIED_BROWSER_PROOF_DID_NOT_ENABLE_PRIVATE_FACTORY:'+JSON.stringify(privateFactory));
      }else if(privateFactory.productionEnabled===true||privateFactory.status!=='BLOCKED'||
               privateFactory.blockedReason!=='SAB34_LIVE_BROWSER_SITE_TO_FACTORY_PROOF_NOT_ACCEPTED'){
        throw new Error('SAB34_PRIVATE_FACTORY_DID_NOT_FAIL_CLOSED_BEFORE_BROWSER_PROOF:'+JSON.stringify({
          factory:privateFactory,gateReason:lifecycle.productionGateReason()
        }));
      }
      let governmentFactory=null;
      if(governmentProject){
        const governmentProjectRow=projects.find(row=>String(row.projectId)===String(governmentProject.projectId));
        governmentFactory=state.economy.BGD.productionAssets.find(row=>String(row.constructionProjectId)===String(governmentProject.projectId));
        if(governmentProjectRow?.status!=='COMPLETED'||!governmentFactory||
           governmentFactory.ownerType!=='STATE_OWNED_ENTERPRISE'||
           String(governmentFactory.status||'').toUpperCase()!=='OPERATIONAL')
          throw new Error('SAB34_STATE_OWNED_QUALIFICATION_FACTORY_NOT_OPERATIONAL:'+JSON.stringify({governmentProjectRow,governmentFactory}));
      }
      // Select through the same live candidate API that executeSitePipeline uses,
      // but pin the candidate to the factory commissioned by this proof. Taking
      // candidateRows[0] can silently route the mine to an older starting-baseline
      // factory (FAC-START) with an unrelated in-progress cycle, leaving the newly
      // commissioned qualification asset unused.
      const candidateRows=industry.candidateFactories('BGD','coal');
      const expectedFactory=proofAcceptedAtStart?privateFactory:governmentFactory;
      const expectedFactoryId=String(expectedFactory?.id||expectedFactory?.assetId||expectedFactory?.projectId||'');
      const selectedCandidate=candidateRows.find(({asset})=>
        String(asset?.id||asset?.assetId||asset?.projectId||'')===expectedFactoryId)||null;
      if(!expectedFactoryId||!selectedCandidate){
        throw new Error('SAB34_COMMISSIONED_FACTORY_NOT_IN_REAL_CANDIDATE_SET:'+JSON.stringify({
          proofAcceptedAtStart,expectedFactoryId,expectedFactoryStatus:expectedFactory?.status||null,
          candidateFactoryIds:candidateRows.map(({asset})=>String(asset?.id||asset?.assetId||asset?.projectId||''))
        }));
      }
      const targetFactory=selectedCandidate.asset;
      const targetFactoryId=String(targetFactory.id||targetFactory.assetId||targetFactory.projectId||'');
      if(targetFactoryId!==expectedFactoryId)
        throw new Error('SAB34_REAL_CANDIDATE_FACTORY_IDENTITY_MISMATCH:'+JSON.stringify({
          targetFactoryId,expectedFactoryId
        }));
      if(proofAcceptedAtStart){
        if(String(targetFactory.ownerType||'').toUpperCase()!=='PRIVATE_ENTERPRISE'||targetFactory.productionEnabled!==true)
          throw new Error('SAB34_PRIVATE_FACTORY_NOT_ELIGIBLE_AFTER_VERIFIED_BROWSER_PROOF:'+JSON.stringify({
            targetFactoryId,ownerType:targetFactory.ownerType,productionEnabled:targetFactory.productionEnabled,status:targetFactory.status
          }));
      }else if(String(targetFactory.ownerType||'').toUpperCase()!=='STATE_OWNED_ENTERPRISE'){
        throw new Error('SAB34_QUALIFICATION_FACTORY_IS_NOT_STATE_OWNED:'+JSON.stringify({
          targetFactoryId,ownerType:targetFactory.ownerType,status:targetFactory.status
        }));
      }
      return{
        proposalId:proposal.proposalId,projectId:privateProjectId,
        privateFactoryId:String(privateFactory.id||privateFactory.assetId||privateFactory.projectId),
        privateFactoryStatus:privateFactory.status,privateProductionEnabled:privateFactory.productionEnabled===true,
        privateFactoryBlockReason:privateFactory.blockedReason||null,
        factoryId:String(targetFactory.id||targetFactory.assetId||targetFactory.projectId),
        targetFactoryOwnerType:targetFactory.ownerType,proofAcceptedAtStart,gateReasonAtStart,
        constructionStatus:privateProject.status,committedTurn:Number(simulation.clock.turn),
        constructionDays,constructionAdvanceTurns:advanced.steps
      };
    });
    let commissioningTimeoutId=null;
    let commissioning;
    try{
      commissioning=await Promise.race([
        commissioningPromise,
        new Promise((_,reject)=>{
          commissioningTimeoutId=setTimeout(()=>reject(new Error('SAB34_COMMISSIONING_OUTER_TIMEOUT_AFTER_180000MS')),180000);
        })
      ]);
    }catch(commissioningError){
      metrics.commissioningOuterFailure=String(commissioningError&&commissioningError.stack||commissioningError);
      try{
        const diagnosticPromise=page.evaluate(()=>{
          const simulation=window.Omega?.Simulation;
          const watch=window.__sab34ResourceTurnWatch||{};
          return{
            activeStage:watch.active||null,
            trace:(watch.trace||[]).slice(-64),
            turn:simulation?.clock?.turn??null,
            status:simulation?.status??null,
            lastError:simulation?.lastError??null,
            participantResults:(simulation?.lastTurnParticipantResults||[]).slice(-64),
            phaseHandlers:[...(simulation?.phaseHandlers?.keys?.()||[])],
            participantIds:simulation?.participantDiagnostics?.()||[]
          };
        });
        metrics.commissioningTimeoutDiagnostics=await Promise.race([
          diagnosticPromise,
          new Promise(resolve=>setTimeout(()=>resolve({diagnosticTimeout:true}),8000))
        ]);
      }catch(diagnosticError){
        metrics.commissioningTimeoutDiagnosticsError=String(diagnosticError&&diagnosticError.message||diagnosticError);
      }
      throw commissioningError;
    }finally{
      if(commissioningTimeoutId!==null)clearTimeout(commissioningTimeoutId);
    }
    metrics.commissioning=commissioning;
    metrics.stages.push('PRIVATE_FACTORY_COMMISSIONED_AND_HELD_BEHIND_SAB34_LIVE_BROWSER_PROOF_GATE');
    metrics.stages.push(commissioning.proofAcceptedAtStart
      ?'VERIFIED_SAB34_CERTIFICATE_SELECTED_PRIVATE_FACTORY'
      :'UNVERIFIED_SAB34_CERTIFICATE_SELECTED_STATE_OWNED_QUALIFICATION_FACTORY');


    const targetSite = await page.evaluate(async () => {
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
      const cabinet=document.getElementById('cabinet-full-window');
      const cabinetActive=cabinet?.getAttribute('data-omega-ui-v2-active')==='true';
      if(cabinetActive){
        const returned=window.OmegaUIV2Integration?.openRoute?.('map')===true;
        if(!returned)throw new Error('SAB34_CABINET_COULD_NOT_RETURN_TO_REAL_MAP');
      }
      if(typeof mapApi?.setUiActive==='function')mapApi.setUiActive(true);
      mapApi.__omegaMapUiActive = true;
      const map = mapApi?.map || window.map;
      if (!map || typeof map.setView !== 'function') throw new Error('SAB34_REAL_LEAFLET_MAP_NOT_READY');
      mapApi.resourceState = mapApi.resourceState || {};
      mapApi.resourceState.enabled = true;
      mapApi.resourceState.scope = 'NATION';
      mapApi.resourceState.selectedResources = new Set(['all']);
      window.Game.currentActiveCountry = 'BGD';
      if (window.CountryIOS) window.CountryIOS.activeCountry = 'BGD';
      // Chromium can change the Leaflet container's dimensions while the
      // cabinet and country overlays mount. Recalculate the viewport before
      // rebuilding the marker layer so the selected canonical site is renderable.
      map.invalidateSize?.({pan:false});
      map.setView([lat, lng], Math.max(8, Number(map.getZoom?.() || 4)), {animate:false});
      window.__sab34SiteSelectionEvents = [];
      window.__sab34ExpectedSiteId = String(site.siteId);
      window.addEventListener('OMEGA_RESOURCE_SITE_SELECTED', event => {
        window.__sab34SiteSelectionEvents.push(event.detail || {});
      });
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      binding.refresh();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {
        siteId: String(site.siteId),
        siteName: String(site.siteName || site.name || site.siteId),
        countryId: String(site.countryId || site.countryCode || ''),
        resourceId: String(site.real?.resourceId || site.sourceSiteRecord?.resourceId || site.identity?.resourceTypeId || ''),
        latitude: lat,
        longitude: lng
      };
    });
    const targetFactorySnapshot = await page.evaluate(({factoryId,siteId}) => {
      const state=window.Omega?.Simulation?.world?.state;
      if(!state||state!==window.Game?.state)throw new Error('SAB34_AUTHORITATIVE_GAME_STATE_NOT_LINKED');
      const assets=state.economy?.BGD?.productionAssets||[];
      const factory=assets.find(row=>String(row.id||row.assetId||row.projectId)===String(factoryId));
      if(!factory||String(factory.status||'').toUpperCase()!=='OPERATIONAL')
        throw new Error('SAB34_SELECTED_FACTORY_NOT_OPERATIONAL:'+JSON.stringify({factoryId}));
      const industry=window.OmegaResourceIndustrialNetwork||window.Omega?.ResourceIndustrialNetwork;
      const candidates=industry?.candidateFactories?.('BGD','coal',siteId)||[];
      const resolvedRecipe=industry?.recipeFor?.('coal',factory)||null;
      return{
        factoryId:String(factory.id||factory.assetId||factory.projectId),
        ownerType:String(factory.ownerType||''),
        productionEnabled:factory.productionEnabled===true,
        blockedReason:factory.blockedReason||null,
        factoryType:String(factory.factoryType||'').toUpperCase(),
        status:String(factory.status||'').toUpperCase(),
        constructionProjectId:factory.constructionProjectId||null,
        recipeId:factory.recipeId||null,
        recipeMode:factory.recipeMode||null,
        inputCoefficients:JSON.parse(JSON.stringify(factory.inputCoefficients||{})),
        resolvedCoalInputs:JSON.parse(JSON.stringify(resolvedRecipe?.inputs||{})),
        candidateFactoryIds:candidates.map(({asset})=>String(asset?.id||asset?.assetId||asset?.projectId||''))
      };
    },{factoryId:commissioning.factoryId,siteId:targetSite.siteId});
    assert.equal(targetFactorySnapshot.factoryId,commissioning.factoryId);
    assert.ok(Number(targetFactorySnapshot.inputCoefficients.coal)>0||
      Number(targetFactorySnapshot.resolvedCoalInputs.coal)>0,
      'the commissioned factory must retain its coal recipe after baseline registration: '+
      JSON.stringify(targetFactorySnapshot));
    assert.ok(targetFactorySnapshot.candidateFactoryIds.includes(commissioning.factoryId),
      'the commissioned destination must remain in the live coal candidate set: '+
      JSON.stringify(targetFactorySnapshot));
    if(commissioning.proofAcceptedAtStart){
      assert.equal(targetFactorySnapshot.ownerType,'PRIVATE_ENTERPRISE');
      assert.equal(targetFactorySnapshot.productionEnabled,true);
    }else{
      assert.equal(targetFactorySnapshot.ownerType,'STATE_OWNED_ENTERPRISE');
      assert.equal(commissioning.privateProductionEnabled,false);
      assert.equal(commissioning.privateFactoryBlockReason,'SAB34_LIVE_BROWSER_SITE_TO_FACTORY_PROOF_NOT_ACCEPTED');
    }
    metrics.targetFactorySnapshot=targetFactorySnapshot;
    await page.evaluate(({factoryId}) => {
      const gameState=window.Game?.state;
      const worldState=window.Omega?.Simulation?.world?.state;
      const gameCountry=gameState?.economy?.BGD;
      const worldCountry=worldState?.economy?.BGD;
      window.__sab34FactoryRegistryReference={
        gameState,worldState,
        gameEconomy:gameState?.economy,gameCountry,
        gameAssets:gameCountry?.productionAssets,
        gameFactory:gameCountry?.productionAssets?.find(row=>String(row.id||row.assetId||row.projectId)===String(factoryId)),
        worldEconomy:worldState?.economy,worldCountry,
        worldAssets:worldCountry?.productionAssets,
        worldFactory:worldCountry?.productionAssets?.find(row=>String(row.id||row.assetId||row.projectId)===String(factoryId))
      };
    },{factoryId:commissioning.factoryId});
    metrics.selectedSite = targetSite;
    metrics.stages.push('REAL_MAP_MARKER_READY:' + targetSite.siteId);
    metrics.stages.push('OPERATIONAL_FACTORY_TARGET_SELECTED_WITHOUT_SYNTHETIC_SITE_BINDING');

    const marker = page.locator('.omega-individual-site-marker').filter({
      has:page.locator('[data-omega-site-id=' + JSON.stringify(targetSite.siteId) + ']')
    }).first();
    try {
      await page.waitForFunction(siteId => {
        const node=Array.from(document.querySelectorAll('.omega-individual-site-marker'))
          .find(element=>element.querySelector('[data-omega-site-id]')?.getAttribute('data-omega-site-id')===siteId);
        const render=window.__OMEGA_INDIVIDUAL_RESOURCE_MARKER_DIAGNOSTICS__;
        return !!node && !!render && Number(render.renderedMarkerCount)>0;
      },targetSite.siteId,{timeout:60000});
    } catch (error) {
      const markerDiagnostics=await page.evaluate(siteId=>({
        targetFound:!!Array.from(document.querySelectorAll('.omega-individual-site-marker'))
          .find(element=>element.querySelector('[data-omega-site-id]')?.getAttribute('data-omega-site-id')===siteId),
        markerCount:document.querySelectorAll('.omega-individual-site-marker').length,
        markerRender:window.__OMEGA_INDIVIDUAL_RESOURCE_MARKER_DIAGNOSTICS__||null,
        binding:window.Omega?.IndividualResourceSiteBinding?.diagnostics?.()||null,
        mapSize:(window.Game?.Map?.map||window.map)?.getSize?.()||null,
        mapBounds:(()=>{try{return (window.Game?.Map?.map||window.map)?.getBounds?.()?.toBBoxString?.()||null;}catch(_){return null;}})()
      }),targetSite.siteId);
      throw new Error('SAB34_CANONICAL_SITE_MARKER_NOT_RENDERED:'+JSON.stringify(markerDiagnostics)+
        '; original='+String(error&&error.message||error));
    }

    // Exercise a real pointer click while the startup overlay is visibly loading.
    // This catches the former regression where the centered, opaque overlay sat
    // above the exact site marker and made a genuine browser click impossible.
    const previousOverlayState=await page.evaluate(() => {
      const overlay=document.getElementById('omega-map-load-overlay');
      const mapRoot=document.getElementById('render-engine-root');
      if(!overlay||!mapRoot)throw new Error('SAB34_MAP_LOADING_OVERLAY_NOT_MOUNTED');
      const snapshot={
        className:overlay.className,
        dataState:overlay.hasAttribute('data-state')?{present:true,value:overlay.getAttribute('data-state')}:{present:false},
        ariaHidden:overlay.hasAttribute('aria-hidden')?{present:true,value:overlay.getAttribute('aria-hidden')}:{present:false},
        ariaBusy:overlay.hasAttribute('aria-busy')?{present:true,value:overlay.getAttribute('aria-busy')}:{present:false},
        mapRootLoading:mapRoot.hasAttribute('data-omega-map-loading')
          ?{present:true,value:mapRoot.getAttribute('data-omega-map-loading')}:{present:false}
      };
      overlay.classList.remove('is-hidden');
      overlay.setAttribute('data-state','loading');
      overlay.setAttribute('aria-hidden','false');
      overlay.setAttribute('aria-busy','true');
      mapRoot.setAttribute('data-omega-map-loading','true');
      return snapshot;
    });
    let markerHitTest=null;
    try {
      markerHitTest=await marker.evaluate(element=>{
        const rect=element.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
        const hit=document.elementFromPoint(x,y);
        const overlay=document.getElementById('omega-map-load-overlay');
        const card=overlay?.querySelector('.omega-map-load-card');
        const retry=overlay?.querySelector('#omega-map-load-retry');
        return{
          hitTarget:!!hit&&(hit===element||element.contains(hit)),
          hitElement:hit?(hit.tagName+(hit.id?'#'+hit.id:'')):null,
          overlayVisible:!!overlay&&!overlay.classList.contains('is-hidden'),
          overlayPointerEvents:overlay?getComputedStyle(overlay).pointerEvents:null,
          cardPointerEvents:card?getComputedStyle(card).pointerEvents:null,
          retryHidden:retry?retry.hidden:null,
          retryPointerEventsWhenVisible:(()=>{
            if(!retry)return null;
            const wasHidden=retry.hidden;
            retry.hidden=false;
            const pointerEvents=getComputedStyle(retry).pointerEvents;
            retry.hidden=wasHidden;
            return pointerEvents;
          })(),
          rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
          cabinetActive:document.getElementById('cabinet-full-window')?.getAttribute('data-omega-ui-v2-active')==='true'
        };
      });
      assert.equal(markerHitTest.overlayVisible,true,'the loading overlay must be visible during the click-through regression');
      assert.equal(markerHitTest.overlayPointerEvents,'none','the loading overlay must not capture map pointer events');
      assert.equal(markerHitTest.cardPointerEvents,'none','the progress card must not cover an individual site marker');
      assert.equal(markerHitTest.retryPointerEventsWhenVisible,'auto','the explicit retry action must remain interactive when the error state exposes it');
      assert.ok(markerHitTest.hitTarget,'real map marker must receive a browser pointer through the visible loading overlay: '+JSON.stringify(markerHitTest));
      await marker.click({ timeout: 45000 });
      try {
        await page.waitForFunction(siteId => {
          const selected=document.getElementById('omega-individual-select');
          return selected?.value===siteId&&
            (window.__sab34SiteSelectionEvents||[]).some(event=>String(event.siteId)===String(siteId));
        },targetSite.siteId,{timeout:30000});
      } catch (selectionError) {
        const selectionDiagnostics=await page.evaluate(() => ({
          events:window.__sab34SiteSelectionEvents||[],
          selectedSiteId:document.getElementById('omega-individual-select')?.value||null,
          matchingMarkerCount:Array.from(document.querySelectorAll('[data-omega-site-id]'))
            .filter(node=>String(node.getAttribute('data-omega-site-id'))===String(window.__sab34ExpectedSiteId||'')).length,
          markerDiagnostics:window.__OMEGA_INDIVIDUAL_RESOURCE_MARKER_DIAGNOSTICS__||null,
          panelVisible:document.getElementById('omega-individual-resource-panel')?.style.display||null
        })).catch(diagnosticError=>({diagnosticError:String(diagnosticError&&diagnosticError.message||diagnosticError)}));
        metrics.selectionFailure={error:String(selectionError&&selectionError.message||selectionError),
          markerHitTest,selectionDiagnostics};
        throw selectionError;
      }
    } finally {
      await page.evaluate(snapshot => {
        const overlay=document.getElementById('omega-map-load-overlay');
        const mapRoot=document.getElementById('render-engine-root');
        if(!overlay||!mapRoot)return;
        overlay.className=snapshot.className;
        for(const [name,value] of [
          ['data-state',snapshot.dataState],
          ['aria-hidden',snapshot.ariaHidden],
          ['aria-busy',snapshot.ariaBusy]
        ]){
          if(value?.present)overlay.setAttribute(name,value.value);
          else overlay.removeAttribute(name);
        }
        if(snapshot.mapRootLoading?.present)mapRoot.setAttribute('data-omega-map-loading',snapshot.mapRootLoading.value);
        else mapRoot.removeAttribute('data-omega-map-loading');
      },previousOverlayState);
    }
    metrics.markerHitTest=markerHitTest;
    metrics.stages.push('REAL_MAP_MARKER_CLICKED_THROUGH_VISIBLE_LOADING_OVERLAY');

    try {
      await page.waitForFunction(() => {
        const game=window.Game;
        const map=game?.Map;
        const overlay=document.getElementById('omega-map-load-overlay');
        const mapRoot=document.getElementById('render-engine-root');
        return game?.__omegaGeoJSONRenderComplete===true &&
          !!map?.countryGeoJSON && !!game?.geojsonLayer &&
          overlay?.classList.contains('is-hidden') &&
          !mapRoot?.hasAttribute('data-omega-map-loading');
      },null,{timeout:90000});
    } catch (error) {
      const mapDiagnostics=await page.evaluate(() => {
        const game=window.Game;
        const map=game?.Map;
        const overlay=document.getElementById('omega-map-load-overlay');
        const mapRoot=document.getElementById('render-engine-root');
        return {
          mapUiActive:map?.__omegaMapUiActive??null,
          loadingProgress:map?.__omegaMapLoadingProgress??null,
          worldLoadPromisePending:!!game?.DataLoader?.__worldLoadPromise,
          worldLoadAbortPending:!!map?.__omegaWorldMapAbortController,
          worldLoadAborted:map?.__omegaWorldMapAbortController?.signal?.aborted??null,
          countryGeoJsonLoaded:!!map?.countryGeoJSON,
          pendingGeoJsonLoaded:!!game?.__omegaGeoJSONPendingData,
          renderComplete:game?.__omegaGeoJSONRenderComplete??null,
          renderPaused:game?.__omegaGeoJSONRenderPaused??null,
          renderFramePending:game?.__omegaGeoJSONRenderFrame!==null&&game?.__omegaGeoJSONRenderFrame!==undefined,
          featureCount:Array.isArray(map?.countryGeoJSON?.features)?map.countryGeoJSON.features.length:0,
          renderedCountryCount:game?.geojsonLayer?.getLayers?.().length??null,
          overlay:{
            className:overlay?.className??null,
            state:overlay?.getAttribute('data-state')??null,
            ariaBusy:overlay?.getAttribute('aria-busy')??null,
            pointerEvents:overlay?getComputedStyle(overlay).pointerEvents:null,
            cardPointerEvents:overlay?.querySelector('.omega-map-load-card')
              ?getComputedStyle(overlay.querySelector('.omega-map-load-card')).pointerEvents:null,
            status:document.getElementById('omega-map-load-status')?.textContent??null,
            percent:document.getElementById('omega-map-load-percent')?.textContent??null
          },
          mapRootLoading:mapRoot?.getAttribute('data-omega-map-loading')??null
        };
      });
      metrics.worldMapReadyFailure={error:String(error&&error.message||error),mapDiagnostics};
      throw new Error('SAB34_WORLD_MAP_GEOMETRY_NOT_READY_FOR_REAL_SITE_INTERACTION:'+
        JSON.stringify(mapDiagnostics)+'; original='+String(error&&error.message||error));
    }
    metrics.stages.push('WORLD_MAP_GEOMETRY_RENDERED_AND_STARTUP_OVERLAY_DISMISSED');

    const selection = await page.evaluate(() => ({
      events: window.__sab34SiteSelectionEvents || [],
      selectedSiteId: document.getElementById('omega-individual-select')?.value || null,
      panelVisible: document.getElementById('omega-individual-resource-panel')?.style.display !== 'none',
      panelText: document.getElementById('omega-individual-detail')?.textContent || ''
    }));
    assert.equal(selection.selectedSiteId, targetSite.siteId);
    assert.ok(selection.events.some(event => String(event.siteId) === targetSite.siteId));
    metrics.selection=selection;
    metrics.stages.push('REAL_MAP_MARKER_CLICK_SELECTED_THE_EXACT_SITE_ID');

    // Select the factory through the visible site panel, not by mutating game state.
    // This proves the exact commissioned destination survives the complete site action.
    await page.waitForFunction(({factoryId,siteId}) => {
      const selector=document.getElementById('omega-individual-factory-select');
      return !!selector&&!selector.disabled&&selector.getAttribute('data-site-id')===siteId&&
        Array.from(selector.options||[]).some(option=>String(option.value)===factoryId);
    },{factoryId:commissioning.factoryId,siteId:targetSite.siteId},{timeout:30000});
    await page.locator('#omega-individual-factory-select').selectOption(commissioning.factoryId);
    const selectedDestination=await page.locator('#omega-individual-factory-select').inputValue();
    assert.equal(selectedDestination,commissioning.factoryId,
      'the live site panel must retain the selected commissioned factory destination');
    metrics.selectedDestinationFactoryId=selectedDestination;
    metrics.stages.push('USER_SELECTED_COMMISSIONED_FACTORY_IN_REAL_SITE_PANEL');
    const preDispatchFactoryState=await page.evaluate(({factoryId,siteId})=>{
      const state=window.Game?.state;
      const worldState=window.Omega?.Simulation?.world?.state;
      const ref=window.__sab34FactoryRegistryReference||{};
      const gameCountry=state?.economy?.BGD,worldCountry=worldState?.economy?.BGD;
      const assets=gameCountry?.productionAssets||[],worldAssets=worldCountry?.productionAssets||[];
      const industry=window.OmegaResourceIndustrialNetwork||window.Omega?.ResourceIndustrialNetwork;
      const asset=assets.find(row=>String(row.id||row.assetId||row.projectId)===factoryId)||null;
      const worldAsset=worldAssets.find(row=>String(row.id||row.assetId||row.projectId)===factoryId)||null;
      const candidates=industry?.candidateFactories?.('BGD','coal',siteId)||[];
      const resolved=asset?industry?.recipeFor?.('coal',asset)||null:null;
      return{
        factoryId,siteId,
        registryIdentity:{
          gameRootSameAsBefore:state===ref.gameState,
          worldRootSameAsBefore:worldState===ref.worldState,
          gameAndWorldRootSame:state===worldState,
          gameEconomySameAsBefore:state?.economy===ref.gameEconomy,
          gameCountrySameAsBefore:gameCountry===ref.gameCountry,
          gameAssetsSameAsBefore:gameCountry?.productionAssets===ref.gameAssets,
          worldEconomySameAsBefore:worldState?.economy===ref.worldEconomy,
          worldCountrySameAsBefore:worldCountry===ref.worldCountry,
          worldAssetsSameAsBefore:worldCountry?.productionAssets===ref.worldAssets
        },
        asset:asset?{
          id:asset.id,status:asset.status,ownerType:asset.ownerType,
          constructionProjectId:asset.constructionProjectId||null,
          recipeId:asset.recipeId||null,recipeMode:asset.recipeMode||null,
          inputCoefficients:asset.inputCoefficients||{},
          resolvedInputs:resolved?.inputs||{}
        }:null,
        worldAsset:worldAsset?{id:worldAsset.id,status:worldAsset.status,ownerType:worldAsset.ownerType,
          recipeId:worldAsset.recipeId||null}:null,
        candidateFactoryIds:candidates.map(({asset:row})=>String(row?.id||row?.assetId||row?.projectId||''))
      };
    },{factoryId:commissioning.factoryId,siteId:targetSite.siteId});
    metrics.preDispatchFactoryState=preDispatchFactoryState;
    assert.ok(preDispatchFactoryState.candidateFactoryIds.includes(commissioning.factoryId),
      'the chosen operational factory must remain a live coal candidate immediately before dispatch: '+
      JSON.stringify(preDispatchFactoryState));
    assert.ok(preDispatchFactoryState.asset,
      'the selected commissioned factory asset must remain in the live economy bucket after map selection');
    assert.ok(preDispatchFactoryState.worldAsset,
      'the same commissioned factory asset must remain in the authoritative simulation world');
    for (const key of ['gameEconomySameAsBefore','gameCountrySameAsBefore','gameAssetsSameAsBefore',
      'worldEconomySameAsBefore','worldCountrySameAsBefore','worldAssetsSameAsBefore']) {
      assert.equal(preDispatchFactoryState.registryIdentity[key],true,
        'late economy baseline loading must preserve the live factory registry identity ('+key+'): '+
        JSON.stringify(preDispatchFactoryState.registryIdentity));
    }

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
    assert.equal(extraction.result?.siteId, targetSite.siteId,
      'the executed pipeline must retain the exact canonical site selected by the user');
    assert.equal(extraction.result?.status, 'IN_TRANSIT', JSON.stringify(extraction));
    assert.equal(extraction.result?.extractionStatus, 'COMMITTED');
    assert.equal(extraction.result?.shipment?.shipmentType, 'MINE_TO_WAREHOUSE');
    assert.equal(Number(extraction.result?.extractedQuantity), 146889,
      'Barapukuria must use its 4,896.3 t/day rate over the correct 30-day mining window');
    assert.equal(Number(extraction.result?.shipment?.route?.requestedQuantity), 146889,
      'mine route must request the exact 30-day committed extraction quantity');
    assert.equal(String(extraction.result?.factoryId), commissioning.factoryId,
      'the site flow must retain the selected operational factory across both logistics legs');
    const selectedFlow = await page.evaluate(batchId => {
      const rows = window.Game.state.resource.BGD.industrialNetwork?.siteFlowLedger || [];
      const flow = rows.find(row => String(row.batchId || '') === String(batchId));
      return {
        factoryId: String(flow?.factoryId || ''),
        selectionAuthority: String(flow?.factorySelectionAuthority || ''),
        factorySelectedAtTurn: Number(flow?.factorySelectedAtTurn)
      };
    }, extraction.result.batchId);
    assert.equal(selectedFlow.factoryId, commissioning.factoryId,
      'the persisted site flow must use the commissioned private factory, not a starting-baseline factory');
    assert.equal(selectedFlow.selectionAuthority, 'EXPLICIT_SITE_FACTORY_SELECTION',
      'the persisted destination must record the explicit UI factory selection');
    assert.ok(Number.isFinite(selectedFlow.factorySelectedAtTurn),
      'the site-flow ledger must timestamp the explicit factory destination selection');
    metrics.selectedFactoryFlow = selectedFlow;
    // This first leg is explicitly mine -> raw warehouse. Its route must not pretend
    // that the mine truck is already delivering to the factory; the factory leg is
    // dispatched only after the raw-warehouse receipt is committed.
    assert.equal(String(extraction.result?.route?.destinationWarehouseId||''), 'WH-BGD-RAW',
      'the mine-haul route must identify the canonical raw-warehouse destination');
    assert.equal(String(extraction.result?.route?.destinationNode||''), 'WH-BGD-RAW',
      'the first logistics leg must end at the raw warehouse node');
    assert.equal(extraction.result?.factoryBootstrapStatus, 'EXISTING');
    assert.ok(extraction.result?.batchId && extraction.result?.shipmentId && extraction.result?.extractionPlanId);
    metrics.extraction = extraction;
    const repeatedExtraction = await page.evaluate(async batchId => {
      const resource = window.Game.state.resource.BGD;
      const source = (resource.batches || []).find(row => String(row.batchId) === String(batchId));
      if (!source) throw new Error('SAB34_SOURCE_BATCH_MISSING_BEFORE_IDEMPOTENCY_PROOF');
      const resourceId = String(source.resourceId || '');
      const snapshot = () => {
        const current = window.Game.state.resource.BGD;
        const batch = (current.batches || []).find(row => String(row.batchId) === String(batchId));
        const lot = current.inventoryLots?.[String(batchId)] || null;
        return {
          inventory: Number(current.inventory?.[resourceId]) || 0,
          warehouse: Number(current.warehouse?.availableByResource?.[resourceId]) || 0,
          batchQuantity: Number(batch?.quantity) || 0,
          batchRemaining: Number(batch?.remainingQuantity) || 0,
          lotQuantity: Number(lot?.quantity) || 0,
          lotRemaining: Number(lot?.remainingQuantity) || 0,
          ledgerRows: (current.mineProductionLedger || []).filter(row => String(row.batchId || '') === String(batchId)).length
        };
      };
      const before = snapshot();
      const runtime = window.Omega?.ResourceEndowmentRuntime || window.OmegaResourceEndowmentRuntime;
      const repeated = await runtime.extractCountry('BGD', [String(source.occurrenceKey)]);
      const payload = repeated?.result || repeated || {};
      return { status: repeated?.status || null, accepted: payload.accepted, extracted: payload.extracted, replayed: payload.replayed, before, after:snapshot() };
    }, extraction.result.batchId);
    assert.equal(repeatedExtraction.status, 'APPLIED');
    assert.equal(repeatedExtraction.accepted, true);
    assert.equal(repeatedExtraction.extracted, 0,
      'repeating a successful site extraction in the same turn must not create new stock');
    assert.equal(repeatedExtraction.replayed, 1,
      'replaying the committed batch must still allow downstream logistics to resume');
    assert.equal(repeatedExtraction.before.ledgerRows, 1,
      'one successful extraction must map to one production-ledger row for the batch');
    assert.equal(repeatedExtraction.before.batchQuantity, repeatedExtraction.before.lotQuantity,
      'source batch and inventory lot must retain the same original quantity');
    assert.equal(repeatedExtraction.before.batchRemaining, repeatedExtraction.before.lotRemaining,
      'source batch and inventory lot must retain the same remaining quantity');
    assert.deepEqual(repeatedExtraction.after, repeatedExtraction.before,
      'a repeated extraction must not add stock, overwrite its lot, or create duplicate ledger rows');
    metrics.repeatedExtractionIdempotency = repeatedExtraction;
    metrics.stages.push('REAL_SITE_PANEL_ACTION_COMMITTED_EXTRACTION_AND_DISPATCHED_MINE_HAUL');

    const mineEta = Number(extraction.result.shipment.etaTurn);
    assert.ok(Number.isFinite(mineEta), 'mine haul must expose its real ETA game turn');
    const mineShipment=extraction.result.shipment;
    const mineTravelDays=Math.max(1,Math.ceil(Number(mineShipment.route?.travelTimeDays)||0));
    const mineDispatchDate=Date.parse(mineShipment.createdDate);
    const mineEtaDate=Date.parse(mineShipment.etaDate);
    assert.ok(Number.isFinite(mineDispatchDate)&&Number.isFinite(mineEtaDate),
      'mine haul must persist both dispatch and calendar ETA dates');
    assert.equal(Math.round((mineEtaDate-mineDispatchDate)/86400000),mineTravelDays,
      'a temporary 180-day construction turn must not stretch the route calendar ETA to 180 days');
    metrics.mineRouteEta={travelDays:mineTravelDays,dispatchDate:mineShipment.createdDate,etaDate:mineShipment.etaDate};
    const mineArrival = await page.evaluate(async ({eta, etaDate}) => {
      const simulation = window.Omega.Simulation;
      const advanced = await window.__sab34AdvanceResourceTurnsToEta(eta, etaDate, 'MINE_TO_WAREHOUSE');
      const state = window.Game.state;
      const resource = state.resource.BGD;
      const run = window.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__.result;
      const receiptId = 'MINE-WH-REC:' + run.shipmentId;
      const receipt = (resource.warehouse?.receipts || []).find(row => String(row.receiptId) === receiptId);
      const factoryShipment = (resource.industrialNetwork?.shipments || []).find(row =>
        String(row.batchId) === String(run.batchId) && row.shipmentType === 'RAW_TO_FACTORY' && row.status === 'IN_TRANSIT');
      const mineShipment = (resource.industrialNetwork?.shipments || []).find(row =>
        String(row.shipmentId) === String(run.shipmentId)) || null;
      const economyProfile = window.__OMEGA_RESOURCE_ECONOMY_LAST_TURN_PROFILE || null;
      const nationalDemandProfile = (economyProfile?.phases || []).find(row =>
        row.label === 'process-country-finalization') || null;
      return {
        nationalDemandFinalizationMs: Number(nationalDemandProfile?.durationMs) || 0,
        advancedTurns: advanced.steps,
        compressedTurns: advanced.compressedTurns,
        currentTurn: Number(simulation.clock.turn),
        stateTurn: Number(state.simulation?.turn),
        committedEtaDate: advanced.committedEtaDate,
        clockDate: String(simulation.clock.simulationDate?.() || ''),
        playerSessionCountry: state.simulation?.session?.playerCountryId || null,
        receipt: receipt || null,
        mineShipment: mineShipment ? {
          shipmentId: mineShipment.shipmentId, status: mineShipment.status,
          blockReason: mineShipment.blockReason || null, etaTurn: mineShipment.etaTurn,
          etaDate: mineShipment.etaDate, lastDeliveryAttemptTurn: mineShipment.lastDeliveryAttemptTurn,
          deliveryLedgerSnapshot: mineShipment.deliveryLedgerSnapshot || null
        } : null,
        factoryShipment: factoryShipment || null,
        industrialTurnResult: window.__sab34LastIndustrialTurnResult || null,
        industrialTurnError: window.__sab34LastIndustrialTurnError || null,
        industrialTurnCalls: window.__sab34IndustrialTurnCalls || [],
        observedIndustryApiMounted: window.Omega?.ResourceIndustrialNetwork === window.__sab34ObservedIndustryApi,
        currentIndustryRunCountryTurnType: typeof window.Omega?.ResourceIndustrialNetwork?.runCountryTurn,
        participantResults: (simulation.lastTurnParticipantResults || []).slice(-24),
        siteRuntime: resource.industrialNetwork?.siteLogisticsBySiteId?.[run.siteId] || null,
        warehouseCoal: {
          available: Number(resource.warehouse?.availableByResource?.coal) || 0,
          reserved: Number(resource.warehouse?.reservedByResource?.coal) || 0,
          receipts: (resource.warehouse?.receipts || []).filter(row => row.resourceId === 'coal').length
        }
      };
    }, {eta:mineEta,etaDate:String(mineShipment.etaDate)});
    assert.equal(mineArrival.receipt?.status, 'RECEIVED', JSON.stringify(mineArrival));
    assert.equal(mineArrival.receipt?.receivedFrom, 'MINE_SITE_LOGISTICS');
    assert.equal(Number(mineArrival.receipt?.quantity), 1530,
      'the actual mine receipt must preserve the committed 1,530-tonne shipment quantity');
    assert.ok(mineArrival.nationalDemandFinalizationMs < 120000,
      'country demand finalization must complete with margin below the ordered-turn publish timeout: ' +
      String(mineArrival.nationalDemandFinalizationMs) + 'ms');
    assert.ok(mineArrival.factoryShipment, 'mine receipt must dispatch a separate raw-to-factory shipment');
    assert.equal(mineArrival.factoryShipment.siteId, targetSite.siteId);
    assert.equal(String(mineArrival.factoryShipment.factoryId||''),commissioning.factoryId,
      'the second logistics leg must preserve the same selected factory identity');
    assert.equal(String(mineArrival.factoryShipment.route?.destinationFactoryId||''),commissioning.factoryId,
      'the actual raw-to-factory route must terminate at the selected operational factory');
    metrics.mineArrival = mineArrival;
    metrics.stages.push('MINE_HAUL_RECEIPT_POSTED_AND_FACTORY_LEG_DISPATCHED');

    const factoryEta = Number(mineArrival.factoryShipment.etaTurn);
    assert.ok(Number.isFinite(factoryEta), 'factory-bound shipment must expose its ETA game turn');
    const factoryArrival = await page.evaluate(async ({eta, etaDate, shipmentId, mineShipmentId}) => {
      const simulation = window.Omega.Simulation;
      const advanced = await window.__sab34AdvanceResourceTurnsToEta(eta, etaDate, 'RAW_TO_FACTORY');
      const state = window.Game.state;
      const resource = state.resource.BGD;
      const run = window.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__.result;
      const shipmentRows = (resource.industrialNetwork?.shipments || []).filter(row =>
        String(row.batchId) === String(run.batchId) && row.shipmentType === 'RAW_TO_FACTORY');
      const shipment = shipmentRows.find(row => String(row.shipmentId || '') === String(shipmentId || '')) || null;
      const factory = state.economy.BGD.productionAssets.find(row =>
        String(row.id || row.assetId || row.projectId) === String(run.factoryId));
      const delivery = shipment?.status === 'DELIVERED' ? shipment : null;
      const inputLot = delivery && factory?.inputBatchLots?.find(row => String(row.batchId) === String(delivery.factoryInputBatchId));
      const sourceBatch = (resource.batches || []).find(row => String(row.batchId) === String(run.batchId));
      const sourceLot = resource.inventoryLots?.[String(run.batchId)] || null;
      const rawWarehouse = resource.warehouse || {};
      const economy = window.OmegaResourceEconomy || window.Omega?.ResourceEconomy || null;
      const economyProfile = window.__OMEGA_RESOURCE_ECONOMY_LAST_TURN_PROFILE || null;
      const nationalDemandProfile = (economyProfile?.phases || []).find(row =>
        row.label === 'process-country-finalization') || null;
      const publishParticipants = advanced.last?.phases?.PUBLISH?.participants ||
        simulation.lastTurnParticipantResults || state.simulation?.lastTurnParticipantResults || [];
      return {
        nationalDemandFinalizationMs: Number(nationalDemandProfile?.durationMs) || 0,
        advancedTurns: advanced.steps,
        compressedTurns: advanced.compressedTurns,
        committedEtaDate: advanced.committedEtaDate,
        currentTurn: Number(simulation.clock.turn),
        stateTurn: Number(state.simulation?.turn),
        stateDate: String(state.simulation?.date || ''),
        clockDate: String(simulation.clock.simulationDate?.() || ''),
        simulationPlayerCountry: simulation.getPlayerCountryId?.() || null,
        sessionPlayerCountry: state.simulation?.session?.playerCountryId || null,
        resourceEconomyTurnToken: window.__OmegaResourceEconomyV2Turn || null,
        resourceEconomyDiagnostics: economy?.diagnostics?.() || null,
        publishParticipants,
        industrialTurnResult: window.__sab34LastIndustrialTurnResult || null,
        industrialTurnError: window.__sab34LastIndustrialTurnError || null,
        industrialTurnCalls: window.__sab34IndustrialTurnCalls || [],
        observedIndustryApiMounted: window.Omega?.ResourceIndustrialNetwork === window.__sab34ObservedIndustryApi,
        currentIndustryRunCountryTurnType: typeof window.Omega?.ResourceIndustrialNetwork?.runCountryTurn,
        delivery: delivery || shipment || null,
        shipmentRows,
        sourceBatch: sourceBatch ? {
          batchId: sourceBatch.batchId, status: sourceBatch.status, stage: sourceBatch.stage,
          quantity: sourceBatch.quantity, remainingQuantity: sourceBatch.remainingQuantity,
          warehouseId: sourceBatch.warehouseId, locationNodeKey: sourceBatch.locationNodeKey
        } : null,
        sourceLot: sourceLot ? {
          status: sourceLot.status, stage: sourceLot.stage, quantity: sourceLot.quantity,
          remainingQuantity: sourceLot.remainingQuantity, warehouseId: sourceLot.warehouseId
        } : null,
        sourceFlow: JSON.parse(JSON.stringify((resource.industrialNetwork?.siteFlowLedger || []).find(row =>
          String(row.batchId) === String(run.batchId)) || null)),
        mineWarehouseReceiptStage: (() => {
          const flow = (resource.industrialNetwork?.siteFlowLedger || []).find(row => String(row.batchId) === String(run.batchId));
          return (flow?.stages || []).find(row => row.stage === 'RAW_INVENTORY' && row.status === 'RECEIVED_FROM_MINE' &&
            String(row.shipmentId || '') === String(mineShipmentId || '')) || null;
        })(),
        factoryReceiptStage: (() => {
          const flow = (resource.industrialNetwork?.siteFlowLedger || []).find(row => String(row.batchId) === String(run.batchId));
          return (flow?.stages || []).find(row => row.stage === 'FACTORY' && row.status === 'RECEIVED' &&
            String(row.shipmentId || '') === String(shipmentId || '')) || null;
        })(),
        factoryDeliveryStage: (() => {
          const flow = (resource.industrialNetwork?.siteFlowLedger || []).find(row => String(row.batchId) === String(run.batchId));
          return (flow?.stages || []).find(row => row.stage === 'TRANSPORT' && row.status === 'DELIVERED' &&
            String(row.shipmentId || '') === String(shipmentId || '')) || null;
        })(),
        warehouseCoal: {
          available: Number(rawWarehouse.availableByResource?.coal) || 0,
          reserved: Number(rawWarehouse.reservedByResource?.coal) || 0
        },
        countryCoalInventory: Number(resource.inventory?.coal) || 0,
        factoryId: String(factory?.id || factory?.assetId || factory?.projectId || ''),
        inputLot: inputLot || null,
        inputInventory: factory?.inputInventory || {}
      };
    }, {eta:factoryEta,etaDate:String(mineArrival.factoryShipment.etaDate),
      shipmentId:String(mineArrival.factoryShipment.shipmentId || ''),
      mineShipmentId:String(mineArrival.mineShipment?.shipmentId || '')});
    assert.equal(factoryArrival.delivery?.status, 'DELIVERED', JSON.stringify(factoryArrival));
    assert.equal(factoryArrival.delivery?.destinationStatus, 'FACTORY_RECEIVED');
    assert.equal(factoryArrival.factoryId, commissioning.factoryId);
    assert.ok(factoryArrival.nationalDemandFinalizationMs < 120000,
      'turn publish must retain adequate margin after country demand finalization: ' +
      String(factoryArrival.nationalDemandFinalizationMs) + 'ms');
    assert.ok(factoryArrival.inputLot, 'factory receipt must create an input batch lot');
    assert.ok(factoryArrival.inputLot.sourceBatchIds.includes(extraction.result.batchId));
    assert.ok(Number(factoryArrival.inputInventory.coal) > 0);
    assert.ok(factoryArrival.sourceLot?.remainingQuantity <= factoryArrival.sourceLot?.quantity,
      'source lot remaining quantity must never exceed the original extraction lot quantity');
    assert.equal(factoryArrival.sourceBatch?.quantity, factoryArrival.sourceLot?.quantity,
      'source batch and inventory lot must retain the same original extraction quantity');
    assert.equal(factoryArrival.sourceBatch?.remainingQuantity, factoryArrival.sourceLot?.remainingQuantity,
      'source batch and inventory lot must retain the same remaining quantity');
    assert.equal(Number(factoryArrival.sourceBatch?.quantity), 146889,
      'the source batch must retain its exact committed 30-day extraction quantity');
    assert.equal(Number(factoryArrival.sourceBatch?.remainingQuantity), 145359,
      'the source batch must lose exactly the 1,530 tonnes accepted by the factory');
    assert.ok(Number(factoryArrival.sourceFlow?.mineWarehouseReceivedQuantity) >= 1530,
      'the cumulative mine-flow ledger must include the exact first warehouse receipt and may include later in-transit receipts');
    assert.ok(Number(factoryArrival.sourceFlow?.factoryDispatchedQuantity) >= 1530,
      'the cumulative factory-flow ledger must include the target delivery and may include later shipments');
    assert.equal(Number(factoryArrival.mineWarehouseReceiptStage?.quantity), 1530,
      'the identified mine shipment must retain its exact 1,530-tonne warehouse receipt');
    assert.equal(Number(factoryArrival.factoryReceiptStage?.quantity), 1530,
      'the identified factory shipment must retain its exact 1,530-tonne receipt');
    assert.equal(Number(factoryArrival.factoryDeliveryStage?.deliveredQuantity), 1530,
      'the exact target shipment must be delivered without confusing it with later residual shipments');
    assert.equal(Math.max(0,
      Number(factoryArrival.sourceFlow?.mineWarehouseReceivedQuantity||0) -
      Number(factoryArrival.sourceFlow?.factoryDispatchedQuantity||0) -
      Number(factoryArrival.sourceFlow?.mineWarehouseConsumedQuantity||0)), 0,
      'a delivered factory shipment must no longer be counted as raw warehouse stock');
    assert.equal(factoryArrival.countryCoalInventory, factoryArrival.warehouseCoal.available,
      'country aggregate inventory and raw warehouse stock must remain reconciled after delivery');
    metrics.factoryArrival = factoryArrival;
    metrics.stages.push('RAW_TO_FACTORY_DELIVERY_CREATED_TRACEABLE_FACTORY_INPUT_LOT');

    // This browser acceptance run proves the visible site-selection action, exact mine
    // shipment, raw-warehouse receipt, selected factory receipt and canonical save/load.
    // The receiving factory may already have an active production cycle; in that case the
    // new lot correctly remains AVAILABLE_TO_FACTORY / AWAITING_PROCESSING. Finished-goods
    // production is independently exercised by the industrial-network and exhaustive
    // every-site production suites, so this browser test must not advance unrelated global
    // game turns just to wait for an existing cycle.
    const factoryInputReceipt = {
      shipmentId: String(factoryArrival.delivery?.shipmentId || ''),
      factoryId: String(factoryArrival.factoryId || ''),
      inputBatchId: String(factoryArrival.inputLot?.batchId || ''),
      resourceId: String(factoryArrival.inputLot?.resourceId || ''),
      quantity: Number(factoryArrival.inputLot?.quantity) || 0,
      remainingQuantity: Number(factoryArrival.inputLot?.remainingQuantity) || 0,
      stage: String(factoryArrival.inputLot?.stage || ''),
      status: String(factoryArrival.inputLot?.status || ''),
      sourceBatchIds: factoryArrival.inputLot?.sourceBatchIds || [],
      processingStatus: String(factoryArrival.delivery?.processingStatus || ''),
      processing: factoryArrival.delivery?.processing || null,
      inputInventory: factoryArrival.inputInventory || {}
    };
    assert.equal(factoryInputReceipt.shipmentId, String(factoryArrival.delivery?.shipmentId || ''));
    assert.equal(factoryInputReceipt.factoryId, commissioning.factoryId);
    assert.ok(factoryInputReceipt.inputBatchId);
    assert.equal(factoryInputReceipt.resourceId, 'coal');
    assert.equal(factoryInputReceipt.quantity, 1530);
    assert.equal(factoryInputReceipt.remainingQuantity, 1530);
    assert.equal(factoryInputReceipt.stage, 'FACTORY_INPUT');
    assert.equal(factoryInputReceipt.status, 'AVAILABLE_TO_FACTORY');
    assert.ok(factoryInputReceipt.sourceBatchIds.includes(extraction.result.batchId));
    assert.ok(Number(factoryInputReceipt.inputInventory.coal) >= 1530);
    metrics.factoryInputReceipt = factoryInputReceipt;
    metrics.stages.push('EXACT_SITE_BATCH_RECEIVED_AS_TRACEABLE_FACTORY_INPUT_LOT');


    const foreignResourceEconomyAfterPipeline = await page.evaluate(() => JSON.stringify({
      resource: window.Game.state.resource?.KWT || null,
      economy: window.Game.state.economy?.KWT || null
    }));
    assert.equal(foreignResourceEconomyAfterPipeline, preparation.foreignResourceEconomySnapshot,
      'running the selected BGD resource pipeline must not mutate non-selected KWT resource or economy state');

    const saveLoad = await page.evaluate(async ({slot,factoryInputBatchId,shipmentId,sourceBatchId}) => {
      const activeSimulation = window.Omega.Simulation;
      const sourceRoot = window.Game.state;
      const run = window.__OMEGA_LAST_INDIVIDUAL_SITE_EXTRACTION__.result;
      const sourceResource = sourceRoot.resource.BGD;
      const sourceFactory = sourceRoot.economy.BGD.productionAssets.find(row =>
        String(row.id || row.assetId || row.projectId) === String(run.factoryId));
      const sourceBatch = (sourceResource.batches || []).find(row => String(row.batchId) === String(run.batchId));
      const inputLot = sourceFactory?.inputBatchLots?.find(row =>
        String(row.batchId) === String(factoryInputBatchId)) || null;
      const sourceFlow = (sourceResource.industrialNetwork?.siteFlowLedger || []).find(row =>
        String(row.batchId) === String(run.batchId)) || null;
      if (!sourceBatch || !sourceFactory || !inputLot || !sourceFlow ||
          !(inputLot.sourceBatchIds || []).includes(sourceBatchId)) {
        throw new Error('SAB34_FACTORY_INPUT_SAVE_FIXTURE_INCOMPLETE:' + JSON.stringify({
          shipmentId, sourceBatchPresent:!!sourceBatch, factoryPresent:!!sourceFactory,
          inputLotPresent:!!inputLot, sourceFlowPresent:!!sourceFlow
        }));
      }
      const copy = value => value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
      const factoryId = String(sourceFactory.id || sourceFactory.assetId || sourceFactory.projectId || '');
      const expected = {
        siteId: run.siteId,
        batchId: run.batchId,
        factoryId,
        inputInventory: copy(sourceFactory.inputInventory || {}),
        inputLot: copy(inputLot),
        sourceFlow: copy(sourceFlow),
        treasury: Number(sourceRoot.finance?.BGD?.available) || 0,
        offer: copy((sourceRoot.trade?.BGD?.offerBook || []).find(row =>
          row.resourceId === 'COAL_CONCENTRATE' && Number(row.quantity) > 0) || null)
      };

      // Keep the browser acceptance focused on the real delivered site batch and its
      // receiving private-factory input lot. The full 197-country live world is already
      // loaded in this page and is intentionally not cloned/serialized by this isolated
      // save-slot probe; doing so duplicates the entire browser world during a renderer-
      // constrained E2E test. The same production SimulationCoordinator and IndexedDB
      // save/load implementation are used with the exact source batch, factory and ledger.
      const isolatedState = {
        simulation: {
          turn: Number(sourceRoot.simulation?.turn) || 0,
          date: sourceRoot.simulation?.date || null,
          session: { playerCountryId:'BGD' },
          subsystemTurns: {}
        },
        resource: {
          BGD: {
            batches: [copy(sourceBatch)],
            inventory: { coal: Number(expected.inputInventory.coal) || 0 },
            industrialNetwork: { siteFlowLedger: [copy(sourceFlow)] }
          }
        },
        economy: {
          BGD: {
            productionAssets: [{
              id: factoryId,
              countryId: 'BGD',
              factoryType: sourceFactory.factoryType,
              ownerCompanyId: sourceFactory.ownerCompanyId || sourceFactory.companyId || null,
              inputInventory: copy(sourceFactory.inputInventory || {}),
              inputBatchLots: [copy(inputLot)]
            }]
          }
        },
        trade: { BGD: { offerBook: expected.offer ? [copy(expected.offer)] : [] } },
        finance: { BGD: { available: expected.treasury } },
        worldEcosystem: { countryProfiles: {} }
      };
      const probe = new activeSimulation.constructor({
        state: isolatedState,
        clock: {
          turn: Number(sourceRoot.simulation?.turn) || 0,
          simulationTimeMs: (Number(sourceRoot.simulation?.turn) || 0) * 86400000,
          stepDurationMs: 86400000,
          startEpochMs: Date.UTC(2015,0,1)
        }
      });
      const saved = await probe.saveSlot(slot);
      if (!saved?.ok) throw new Error('SAB34_BROWSER_SAVE_FAILED:' + JSON.stringify(saved));
      const localStorageSaveAbsent = window.localStorage.getItem(saved.key) === null;
      const sentinel = '__sab34BrowserSaveLoadProbe';
      isolatedState.simulation[sentinel] = 'TAMPERED_AFTER_SAVE';
      const loaded = await probe.loadSlot(slot);
      const restored = probe.world.state;
      const restoredResource = restored.resource.BGD;
      const restoredSourceBatch = (restoredResource.batches || []).find(row =>
        String(row.batchId) === String(run.batchId)) || null;
      const restoredFactory = restored.economy.BGD.productionAssets.find(row =>
        String(row.id || row.assetId || row.projectId) === factoryId);
      const restoredInputLot = restoredFactory?.inputBatchLots?.find(row =>
        String(row.batchId) === String(factoryInputBatchId)) || null;
      const result = {
        saveOk: saved.ok === true,
        storage: saved.storage || null,
        localStorageSaveAbsent,
        loadIntegrity: probe.lastLoadIntegrity,
        sameAuthoritativeRoot: restored === isolatedState && probe.world.state === isolatedState,
        sentinelCleared: restored.simulation[sentinel] === undefined,
        siteId: (restoredResource.industrialNetwork?.siteFlowLedger || [])
          .find(row => String(row.batchId) === String(run.batchId))?.siteId || null,
        batchId: restoredSourceBatch?.batchId || null,
        factoryId: String(restoredFactory?.id || restoredFactory?.assetId || restoredFactory?.projectId || ''),
        sourceBatchPresent: !!restoredSourceBatch,
        factoryPresent: !!restoredFactory,
        inputInventory: copy(restoredFactory?.inputInventory || {}),
        inputLot: copy(restoredInputLot),
        sourceFlow: copy((restoredResource.industrialNetwork?.siteFlowLedger || []).find(row =>
          String(row.batchId) === String(run.batchId)) || null),
        offer: copy((restored.trade?.BGD?.offerBook || []).find(row =>
          row.resourceId === 'COAL_CONCENTRATE' && Number(row.quantity) > 0) || null),
        treasury: Number(restored.finance?.BGD?.available) || 0
      };
      try {
        const request = indexedDB.open('omega-simulation-save-slots',1);
        await new Promise((resolve,reject)=>{
          request.onerror=()=>reject(request.error || new Error('SAB34_SAVE_DATABASE_OPEN_FAILED'));
          request.onsuccess=()=>{
            const db=request.result;
            try {
              const tx=db.transaction('slots','readwrite');
              tx.objectStore('slots').delete(saved.key);
              tx.oncomplete=()=>{db.close();resolve();};
              tx.onerror=()=>{db.close();reject(tx.error || new Error('SAB34_SAVE_DATABASE_CLEANUP_FAILED'));};
              tx.onabort=()=>{db.close();reject(tx.error || new Error('SAB34_SAVE_DATABASE_CLEANUP_ABORTED'));};
            } catch(error) { db.close(); reject(error); }
          };
        });
      } catch (_) {}
      if (!result.saveOk || result.storage !== 'INDEXEDDB' || !result.localStorageSaveAbsent ||
          result.loadIntegrity !== 'VERIFIED' || !result.sameAuthoritativeRoot || !result.sentinelCleared) {
        throw new Error('SAB34_BROWSER_SAVE_LOAD_INTEGRITY_FAILED:' + JSON.stringify(result));
      }
      if (result.siteId !== expected.siteId || !result.sourceBatchPresent || !result.factoryPresent ||
          JSON.stringify(result.inputInventory) !== JSON.stringify(expected.inputInventory) ||
          JSON.stringify(result.inputLot) !== JSON.stringify(expected.inputLot) ||
          JSON.stringify(result.offer) !== JSON.stringify(expected.offer) ||
          result.treasury !== expected.treasury ||
          JSON.stringify(result.sourceFlow) !== JSON.stringify(expected.sourceFlow)) {
        throw new Error('SAB34_SITE_PIPELINE_SAVE_LOAD_DATA_DRIFT:' + JSON.stringify({ expected, result }));
      }
      return result;
    }, {
      slot: 'sab34-real-chromium-pipeline-' + Date.now(),
      factoryInputBatchId: String(factoryArrival.inputLot.batchId),
      shipmentId: String(factoryArrival.delivery.shipmentId),
      sourceBatchId: String(extraction.result.batchId)
    });
    metrics.saveLoad = saveLoad;
    metrics.stages.push('INDEXEDDB_SAVE_LOAD_RESTORED_SITE_BATCH_FACTORY_INPUT_AND_SOURCE_LINEAGE');

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
    metrics.sab34Acceptance={
      proofAcceptedAtStart:commissioning.proofAcceptedAtStart,
      gateReasonAtStart:commissioning.gateReasonAtStart,
      stages:{
        realAppBoot:!!metrics.preparation,
        siteMarkerSelection:!!metrics.selection&&metrics.selection.selectedSiteId===targetSite.siteId,
        siteExtractionAndMineDispatch:extraction.result?.extractionStatus==='COMMITTED'&&extraction.result?.shipment?.shipmentType==='MINE_TO_WAREHOUSE',
        mineReceiptAndFactoryDispatch:mineArrival.receipt?.status==='RECEIVED'&&mineArrival.factoryShipment?.shipmentType==='RAW_TO_FACTORY',
        factoryReceiptAndInputLot:factoryArrival.delivery?.status==='DELIVERED'&&!!factoryArrival.inputLot,
        factoryInputLotTraceability:factoryInputReceipt.quantity===1530&&factoryInputReceipt.status==='AVAILABLE_TO_FACTORY'&&
          factoryInputReceipt.sourceBatchIds.includes(extraction.result.batchId)&&saveLoad.inputLot?.batchId===factoryInputReceipt.inputBatchId,
        selectedCountryIsolation:foreignResourceEconomyAfterPipeline===preparation.foreignResourceEconomySnapshot,
        indexedDbSaveLoad:saveLoad.storage==='INDEXEDDB'&&saveLoad.loadIntegrity==='VERIFIED'&&
          saveLoad.inputLot?.sourceBatchIds?.includes(extraction.result.batchId)===true
      }
    };
    if(Object.values(metrics.sab34Acceptance.stages).some(value=>value!==true))
      throw new Error('SAB34_BROWSER_ACCEPTANCE_STAGES_INCOMPLETE:'+JSON.stringify(metrics.sab34Acceptance));
    if(commissioning.proofAcceptedAtStart&&targetFactorySnapshot.ownerType!=='PRIVATE_ENTERPRISE')
      throw new Error('SAB34_CERTIFIED_RUN_DID_NOT_USE_PRIVATE_FACTORY:'+JSON.stringify({commissioning,targetFactorySnapshot}));
    if(!commissioning.proofAcceptedAtStart&&targetFactorySnapshot.ownerType!=='STATE_OWNED_ENTERPRISE')
      throw new Error('SAB34_UNCERTIFIED_RUN_BYPASSED_PRIVATE_PRODUCTION_GATE:'+JSON.stringify({commissioning,targetFactorySnapshot}));
    console.log('SAB34 REAL CHROMIUM SITE -> '+commissioning.targetFactoryOwnerType+
      ' FACTORY INPUT -> INDEXEDDB SAVE/LOAD PASSED');
  } catch (error) {
    metrics.failure = String(error && error.stack || error);
    metrics.errors = { pageErrors, consoleErrors };
    try {
      const diagnosticsPromise = page.evaluate(() => {
        const simulation = window.Omega?.Simulation;
        const watch = window.__sab34ResourceTurnWatch || {};
        return {
          activeStage: watch.active || null,
          trace: (watch.trace || []).slice(-64),
          turn: simulation?.clock?.turn ?? null,
          status: simulation?.status ?? null,
          lastError: simulation?.lastError ?? null,
          participantResults: (simulation?.lastTurnParticipantResults || []).slice(-32),
          finalizerResults: (simulation?.lastTurnFinalizerResults || []).slice(-32),
          participantIds: simulation?.participantDiagnostics?.() || []
        };
      });
      metrics.turnDiagnostics = await Promise.race([
        diagnosticsPromise,
        new Promise(resolve=>setTimeout(()=>resolve({diagnosticTimeout:true}),8000))
      ]);
    } catch (diagnosticError) {
      metrics.turnDiagnosticsError = String(diagnosticError && diagnosticError.message || diagnosticError);
    }
    try { fs.writeFileSync(path.join(artifacts, 'sab34-real-browser-pipeline-failure.json'), JSON.stringify(metrics, null, 2)); } catch (_) {}
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
});

 
test('real Chromium reconciles private-company sale, buyer payment, seller revenue, corporate tax, dividend and save/load', {
  timeout: 240000
}, async () => {
  const artifacts = process.env.OMEGA_BROWSER_TEST_ARTIFACT_DIR || path.join(ROOT, 'test-results', 'omega-private-enterprise-cash-lifecycle');
  fs.mkdirSync(artifacts, { recursive: true });
  const server = await startStaticServer();
  let browser;
  let page;
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
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('**/*', route => {
      const target = route.request().url();
      return target.startsWith(server.origin) ? route.continue() : route.abort('blockedbyclient');
    });
    await page.goto(server.origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() =>
      document.readyState === 'complete' &&
      !!window.Game?.state &&
      !!window.Omega?.Simulation &&
      typeof window.Omega.Simulation.saveSlot === 'function' &&
      typeof window.Omega.Simulation.loadSlot === 'function' &&
      !!window.OmegaGlobalTrade &&
      !!window.OmegaGlobalMarket &&
      !!window.OmegaPrivateEnterpriseLifecycleV1,
    null, { timeout: 150000 });

    const result = await page.evaluate(async () => {
      const root = window.Omega?.Simulation?.world?.state || window.Game.state;
      const simulation = window.Omega.Simulation;
      if(root!==window.Game?.state)throw new Error('PRIVATE_CASH_LIFECYCLE_AUTHORITATIVE_STATE_NOT_LINKED');
      const trade = window.OmegaGlobalTrade;
      const market = window.OmegaGlobalMarket;
      const lifecycle = window.OmegaPrivateEnterpriseLifecycleV1;
      const buyerCountry = 'BGD';
      const sellerCountry = 'SAU';
      const buyerCompany = 'NOVA_CONSUMER_INDUSTRIES';
      const sellerCompany = 'AURORA_INDUSTRIAL_GROUP';
      const dividendPartner = 'MERIDIAN_ENGINEERING_GROUP';
      const resourceId = 'crude_oil';
      const quantity = 100;
      const sellerBatchId = 'PE-CASH-LIFECYCLE-SELLER-BATCH-SAU';
      const requestId = 'PE-CASH-LIFECYCLE-BUYER-REQUEST';
      const quoteRequestId = 'PE-CASH-LIFECYCLE-MARKET-BID';
      const slot = 'pe-cash-lifecycle-' + Date.now();
      const n = value => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const ensureObject = (value, fallback = {}) =>
        value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
      const ensureCountry = (bucket, countryId) => {
        bucket[countryId] = ensureObject(bucket[countryId]);
        return bucket[countryId];
      };
      root.resource = ensureObject(root.resource);
      root.trade = ensureObject(root.trade);
      root.finance = ensureObject(root.finance);
      root.economy = ensureObject(root.economy);
      root.foreign = ensureObject(root.foreign);
      root.foreign = ensureObject(root.foreign);

      const currentTurn = Number(root.simulation?.turn ?? simulation.clock.turn) || 0;
      const simulationTimeMs = Number(simulation.clock.simulationTimeMs) || 0;
      simulation.createSession({
        playerCountryId: buyerCountry,
        startTurn: currentTurn,
        simulationTimeMs,
        sessionId: 'PE-CASH-LIFECYCLE-BROWSER'
      });
      window.Game.playerCountry = buyerCountry;
      window.Game.currentActiveCountry = buyerCountry;
      window.Game.selectedCountryId = buyerCountry;
      root.playerCountryId = buyerCountry;

      const monetary = window.OmegaForexMonetaryEngine || window.Omega?.ForexMonetaryEngine;
      if (!monetary || typeof monetary.init !== 'function') {
        throw new Error('PRIVATE_CASH_LIFECYCLE_CANONICAL_FOREX_RUNTIME_NOT_MOUNTED');
      }
      const fxInitialization = await monetary.init();
      if (fxInitialization?.initialized !== true) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_FOREX_PROFILE_REGISTRY_NOT_READY:' +
          JSON.stringify(fxInitialization || monetary.diagnostics?.() || null));
      }
      const forexQuotes=monetary.getCountryQuotes?.('SIMULATION')||[];
      const buyerQuote=forexQuotes.find(row=>String(row.iso3||'').trim().toUpperCase()===buyerCountry);
      const sellerQuote=forexQuotes.find(row=>String(row.iso3||'').trim().toUpperCase()===sellerCountry);
      if(!buyerQuote?.currencyCode||!sellerQuote?.currencyCode)
        throw new Error('PRIVATE_CASH_LIFECYCLE_COUNTRY_CURRENCY_PROFILE_MISSING:'+
          JSON.stringify({buyerQuote:buyerQuote||null,sellerQuote:sellerQuote||null}));
      // Use the exact country/currency pair returned by the canonical Forex profile
      // registry. Seed only missing Finance currency metadata; no currency or FX rate
      // is invented by the test.
      const buyerFinanceForCurrency=ensureCountry(root.finance,buyerCountry);
      const sellerFinanceForCurrency=ensureCountry(root.finance,sellerCountry);
      if(!buyerFinanceForCurrency.currencyCode)buyerFinanceForCurrency.currencyCode=buyerQuote.currencyCode;
      if(!sellerFinanceForCurrency.currencyCode)sellerFinanceForCurrency.currencyCode=sellerQuote.currencyCode;
      const buyerCurrency = trade.currencyOf(buyerCountry);
      const sellerCurrency = trade.currencyOf(sellerCountry);
      const buyerLocalPerUsd = Number(buyerQuote.localPerUsd);
      const sellerLocalPerUsd = Number(sellerQuote.localPerUsd);
      const fx = trade.fxRate(buyerCountry, sellerCountry);
      if (buyerCurrency !== 'BDT' || sellerCurrency !== 'SAR' ||
          !Number.isFinite(buyerLocalPerUsd) || buyerLocalPerUsd <= 0 ||
          !Number.isFinite(sellerLocalPerUsd) || sellerLocalPerUsd <= 0 ||
          fx === null || fx <= 0) {
        const currencyRows = (monetary.getCountryQuotes?.('SIMULATION') || [])
          .filter(row => ['BGD', 'SAU'].includes(String(row.iso3 || '').toUpperCase()));
        throw new Error('PRIVATE_CASH_LIFECYCLE_CURRENCY_OR_FX_UNOBSERVED:' +
          JSON.stringify({
            buyerCurrency, sellerCurrency, buyerLocalPerUsd, sellerLocalPerUsd, fx,
            fxDiagnostics: monetary.diagnostics?.() || fxInitialization,
            currencyRows
          }));
      }
      const currencyProbe = { buyerCurrency, sellerCurrency, buyerLocalPerUsd, sellerLocalPerUsd, fx };

      const sellerResource = ensureCountry(root.resource, sellerCountry);
      sellerResource.inventory = ensureObject(sellerResource.inventory);
      sellerResource.batches = Array.isArray(sellerResource.batches) ? sellerResource.batches : [];
      sellerResource.inventoryLots = ensureObject(sellerResource.inventoryLots);
      sellerResource.warehouse = ensureObject(sellerResource.warehouse, {
        warehouseId: 'WH-SAU-RAW', countryId: sellerCountry, type: 'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
        status: 'OPERATIONAL', availableByResource: {}, reservedByResource: {}, storedBatchIds: [], receipts: []
      });
      sellerResource.warehouse.availableByResource = ensureObject(sellerResource.warehouse.availableByResource);
      sellerResource.warehouse.reservedByResource = ensureObject(sellerResource.warehouse.reservedByResource);
      sellerResource.warehouse.storedBatchIds = Array.isArray(sellerResource.warehouse.storedBatchIds)
        ? sellerResource.warehouse.storedBatchIds : [];
      sellerResource.warehouse.receipts = Array.isArray(sellerResource.warehouse.receipts)
        ? sellerResource.warehouse.receipts : [];
      sellerResource.processedWarehouse = ensureObject(sellerResource.processedWarehouse, {
        warehouseId: 'WH-SAU-PROCESSED', countryId: sellerCountry, type: 'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',
        status: 'OPERATIONAL', availableByResource: {}, reservedByResource: {}, storedBatchIds: [], receipts: []
      });
      sellerResource.processedWarehouse.availableByResource =
        ensureObject(sellerResource.processedWarehouse.availableByResource);
      sellerResource.processedWarehouse.reservedByResource =
        ensureObject(sellerResource.processedWarehouse.reservedByResource);
      sellerResource.processedWarehouse.storedBatchIds =
        Array.isArray(sellerResource.processedWarehouse.storedBatchIds)
          ? sellerResource.processedWarehouse.storedBatchIds : [];
      if (sellerResource.batches.some(row => String(row?.batchId) === sellerBatchId)) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_SELLER_FIXTURE_BATCH_COLLISION');
      }
      const sellerQuantity = 500;
      sellerResource.inventory[resourceId] = (n(sellerResource.inventory[resourceId]) || 0) + sellerQuantity;
      sellerResource.batches.push({
        batchId: sellerBatchId, resourceId, materialIdentity: resourceId,
        quantity: sellerQuantity, remainingQuantity: sellerQuantity, unit: 'BARRELS',
        stage: 'RAW_EXTRACTED', status: 'AVAILABLE', countryId: sellerCountry,
        sourceCountryId: sellerCountry, originCountryId: sellerCountry,
        ownerCountryCode: sellerCountry, destinationCountryId: sellerCountry,
        ownerCompanyId: sellerCompany, operatorCompanyId: dividendPartner,
        ownerAttributionStatus: 'EXPLICIT_ASSET_OWNER',
        sourceFactoryId: 'SAU-PRIVATE-CASH-LIFECYCLE-FACTORY',
        warehouseId: 'WH-SAU-RAW',
        provenance: {
          sourceAuthority: 'CONTROLLED_PRIVATE_OUTPUT_FIXTURE',
          quantityAuthority: 'SIMULATION_TEST_FIXTURE',
          authority: 'OMEGA_PRIVATE_ENTERPRISE_CASH_LIFECYCLE_BROWSER_E2E'
        }
      });
      sellerResource.inventoryLots[sellerBatchId] = {
        batchId: sellerBatchId, resourceId, quantity: sellerQuantity, remainingQuantity: sellerQuantity,
        unit: 'BARRELS', stage: 'RAW_EXTRACTED', countryId: sellerCountry,
        warehouseId: 'WH-SAU-RAW', status: 'AVAILABLE',
        provenance: { sourceAuthority: 'CONTROLLED_PRIVATE_OUTPUT_FIXTURE' }
      };
      sellerResource.warehouse.availableByResource[resourceId] =
        (n(sellerResource.warehouse.availableByResource[resourceId]) || 0) + sellerQuantity;
      if (!sellerResource.warehouse.storedBatchIds.includes(sellerBatchId)) {
        sellerResource.warehouse.storedBatchIds.push(sellerBatchId);
      }

      const buyerResource = ensureCountry(root.resource, buyerCountry);
      buyerResource.inventory = ensureObject(buyerResource.inventory);
      buyerResource.inventory[resourceId] = n(buyerResource.inventory[resourceId]) ?? 0;
      buyerResource.batches = Array.isArray(buyerResource.batches) ? buyerResource.batches : [];
      buyerResource.inventoryLots = ensureObject(buyerResource.inventoryLots);
      buyerResource.warehouse = ensureObject(buyerResource.warehouse, {
        warehouseId: 'WH-BGD-RAW', countryId: buyerCountry, type: 'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
        status: 'OPERATIONAL', availableByResource: {}, reservedByResource: {}, storedBatchIds: [], receipts: []
      });
      buyerResource.warehouse.availableByResource = ensureObject(buyerResource.warehouse.availableByResource);
      buyerResource.warehouse.reservedByResource = ensureObject(buyerResource.warehouse.reservedByResource);
      buyerResource.warehouse.storedBatchIds = Array.isArray(buyerResource.warehouse.storedBatchIds)
        ? buyerResource.warehouse.storedBatchIds : [];
      buyerResource.warehouse.receipts = Array.isArray(buyerResource.warehouse.receipts)
        ? buyerResource.warehouse.receipts : [];

      const buyerFinance = ensureCountry(root.finance, buyerCountry);
      buyerFinance.omegaFinance = ensureObject(buyerFinance.omegaFinance, { ledger: [], companyCapitalAccounts: {} });
      buyerFinance.omegaFinance.ledger = Array.isArray(buyerFinance.omegaFinance.ledger)
        ? buyerFinance.omegaFinance.ledger : [];
      buyerFinance.omegaFinance.companyCapitalAccounts =
        ensureObject(buyerFinance.omegaFinance.companyCapitalAccounts);
      const openingBuyerCash = 100000000;
      buyerFinance.omegaFinance.companyCapitalAccounts[buyerCompany] = {
        companyId: buyerCompany, currency: buyerCurrency,
        availableBalance: openingBuyerCash, reservedBalance: 0,
        capitalRaised: openingBuyerCash, capitalSpent: 0,
        retainedEarningsBalance: 0, revision: 1,
        provenance: { authority: 'CONTROLLED_BROWSER_TEST_OPENING_CAPITAL' }
      };
      const sellerFinance = ensureCountry(root.finance, sellerCountry);
      sellerFinance.omegaFinance = ensureObject(sellerFinance.omegaFinance, { ledger: [], companyCapitalAccounts: {} });
      sellerFinance.omegaFinance.ledger = Array.isArray(sellerFinance.omegaFinance.ledger)
        ? sellerFinance.omegaFinance.ledger : [];
      sellerFinance.omegaFinance.companyCapitalAccounts =
        ensureObject(sellerFinance.omegaFinance.companyCapitalAccounts);

      const buyerTrade = ensureCountry(root.trade, buyerCountry);
      const sellerTrade = ensureCountry(root.trade, sellerCountry);
      buyerTrade.routeCapacity = ensureObject(buyerTrade.routeCapacity);
      sellerTrade.routeCapacity = ensureObject(sellerTrade.routeCapacity);
      buyerTrade.routeCapacity[resourceId] = Math.max(n(buyerTrade.routeCapacity[resourceId]) || 0, quantity * 5);
      sellerTrade.routeCapacity[resourceId] = Math.max(n(sellerTrade.routeCapacity[resourceId]) || 0, quantity * 5);
      buyerTrade.marketPrice = ensureObject(buyerTrade.marketPrice);
      sellerTrade.marketPrice = ensureObject(sellerTrade.marketPrice);
      sellerTrade.marketPrice[resourceId] = 100;
      const foreignBuyer = ensureCountry(root.foreign, buyerCountry);
      const foreignSeller = ensureCountry(root.foreign, sellerCountry);
      foreignBuyer.relations = ensureObject(foreignBuyer.relations);
      foreignSeller.relations = ensureObject(foreignSeller.relations);
      const bilateral = {
        overall: 90, trade: 90, political: 90, trust: 90,
        trade_agreement: true, sanctions: false, war_state: false,
        authority: 'CONTROLLED_BROWSER_TEST_DIPLOMATIC_FIXTURE'
      };
      foreignBuyer.relations[sellerCountry] = JSON.parse(JSON.stringify(bilateral));
      foreignSeller.relations[buyerCountry] = JSON.parse(JSON.stringify(bilateral));

      buyerTrade.importRequests = Array.isArray(buyerTrade.importRequests) ? buyerTrade.importRequests : [];
      for (const row of buyerTrade.importRequests) {
        if (row && ['SENT', 'COUNTER_OFFERED', 'ACCEPTED'].includes(String(row.status || '').toUpperCase())) {
          row.status = 'REJECTED';
          row.stage = 'CASH_LIFECYCLE_TEST_ISOLATION';
        }
      }
      const sellerOfferPrice = 100;
      const bidPrice = Number((sellerOfferPrice * fx * 1.25).toFixed(6));
      const offers = Array.isArray(sellerTrade.offerBook) ? sellerTrade.offerBook : [];
      if (sellerTrade.offerBook && !Array.isArray(sellerTrade.offerBook) &&
          typeof sellerTrade.offerBook === 'object') {
        for (const [rid, value] of Object.entries(sellerTrade.offerBook)) {
          if (Array.isArray(value)) {
            for (const row of value) offers.push(Object.assign({ resourceId: rid }, row));
          } else if (value && typeof value === 'object') {
            offers.push(Object.assign({ resourceId: rid }, value));
          }
        }
      }
      sellerTrade.offerBook = offers;
      offers.push({
        offerId: 'PE-CASH-LIFECYCLE-SELLER-ASK', countryId: sellerCountry,
        resourceId, quantity: sellerQuantity, unitPrice: sellerOfferPrice, price: sellerOfferPrice,
        status: 'ACTIVE', source: 'CONTROLLED_PRIVATE_OUTPUT_FIXTURE'
      });
      buyerTrade.importRequests.push({
        requestId: quoteRequestId, countryId: buyerCountry, targetCountryId: sellerCountry,
        resourceId, quantity, unitPrice: bidPrice, totalValue: quantity * bidPrice,
        status: 'SENT', stage: 'MARKET_QUOTE_ONLY'
      });

      const marketCountryId = countryId => {
        const registry = window.OmegaCanonicalIdentityRegistry || window.OmegaCountrySemanticBridge ||
          window.Omega?.CanonicalIdentity;
        try {
          const resolved = registry?.resolveCountry?.(countryId);
          return String(resolved?.id || countryId).trim().toUpperCase();
        } catch (_) {
          return String(countryId || '').trim().toUpperCase();
        }
      };
      const marketBuyerCountryId = marketCountryId(buyerCountry);
      const marketSellerCountryId = marketCountryId(sellerCountry);
      const rebuilt = market.rebuild();
      const quote = market.quote(resourceId);
      if (quote.status !== 'CLEARED' ||
          !quote.matches.some(row => row.buyerCountryId === marketBuyerCountryId &&
            row.sellerCountryId === marketSellerCountryId && row.quantity >= quantity)) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_EXECUTABLE_MARKET_QUOTE_FAILED:' +
          JSON.stringify({ quote, market: rebuilt[resourceId] || null, bidPrice, fx,
            marketBuyerCountryId, marketSellerCountryId }));
      }
      const quoteOnly = buyerTrade.importRequests.find(row => row.requestId === quoteRequestId);
      quoteOnly.status = 'REJECTED';
      quoteOnly.stage = 'MARKET_QUOTE_EVIDENCE_CAPTURED';

      const supplierCandidates = market.privateCompanySuppliers(resourceId, quantity, buyerCountry, sellerCompany, sellerCountry);
      const supplier = supplierCandidates.find(row =>
        row.countryId === marketSellerCountryId && row.companyId === sellerCompany);
      if (!supplier || supplier.countryId !== marketSellerCountryId ||
          supplier.available < quantity || !supplier.sourceBatchIds.includes(sellerBatchId)) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_EXACT_PRIVATE_STOCK_NOT_FOUND:' + JSON.stringify({
          supplier: supplier || null, marketSellerCountryId, supplierCandidates
        }));
      }
      const buyerCashBefore = buyerFinance.omegaFinance.companyCapitalAccounts[buyerCompany].availableBalance;
      const sellerTreasuryBefore = n(sellerFinance.available);
      if (sellerTreasuryBefore === null) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_SELLER_TREASURY_NOT_OBSERVED');
      }
      const requestResult = trade.createPrivateCompanyImportRequest(buyerCountry, {
        requestId, targetCountryId: sellerCountry, resourceId, quantity,
        unitPrice: sellerOfferPrice, buyerCompanyId: buyerCompany, sellerCompanyId: sellerCompany,
        importTariffPct: 0
      });
      if (!requestResult?.accepted || requestResult.request?.procurementType !== 'PRIVATE_COMPANY_TO_COMPANY') {
        throw new Error('PRIVATE_CASH_LIFECYCLE_COMPANY_PURCHASE_REQUEST_FAILED:' + JSON.stringify(requestResult));
      }
      const tradeProcess = trade.processCountry(buyerCountry);
      if (tradeProcess.status !== 'COMPLETED') {
        throw new Error('PRIVATE_CASH_LIFECYCLE_SELECTED_COUNTRY_TRADE_PROCESS_FAILED:' + JSON.stringify(tradeProcess));
      }
      const buyerRequest = buyerTrade.importRequests.find(row => row.requestId === requestId);
      if (buyerRequest?.status !== 'SETTLED') {
        throw new Error('PRIVATE_CASH_LIFECYCLE_TRADE_NOT_SETTLED:' + JSON.stringify({
          request: buyerRequest || null,
          processTrace: window.__OMEGA_LAST_TRADE_PROCESS_TRACE || null,
          settlementTrace: window.__OMEGA_SETTLEMENT_TRACE || null
        }));
      }
      const settlementId = String(buyerRequest.settlementId || '');
      const countryBucketAliases = value => {
        const resolver=window.OmegaCanonicalIdentityRegistry||window.OmegaCountrySemanticBridge||window.Omega?.CanonicalIdentity;
        const normalize=value=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_');
        const values=new Set([normalize(value)]);
        for(const candidate of [value,String(value||'').replace(/[_-]+/g,' ')]){
          try{
            const hit=resolver?.resolveCountry?.(candidate);
            if(!hit)continue;
            const source=hit.raw?.raw||hit.raw||{};
            [
              source.iso3,source.iso3Code,source.ISO_A3,source.iso_a3,
              source.iso2,source.code,source.identity?.iso3,source.identity?.iso3Code,
              hit.id,hit.canonicalId,hit.iso3,hit.iso3Code,source.name,source.officialName,
              ...(Array.isArray(source.aliases)?source.aliases:[])
            ].filter(Boolean).forEach(item=>values.add(normalize(item)));
          }catch(_){}
        }
        return values;
      };
      const countryBucketKey = (domain,countryId,predicate) => {
        const rows=root[domain]||{},target=countryBucketAliases(countryId);
        const matches=Object.keys(rows).filter(key=>{
          const keyAliases=countryBucketAliases(key);
          return Array.from(target).some(alias=>keyAliases.has(alias));
        });
        return matches.find(key=>predicate?.(rows[key],key))||matches[0]||null;
      };
      const buyerEconomyKey=countryBucketKey('economy',buyerCountry,bucket=>
        (bucket?.privateEnterpriseLifecycle?.privateCompanyProcurementRecords||[])
          .some(row=>String(row?.settlementId||'')===settlementId));
      const sellerEconomyKey=countryBucketKey('economy',sellerCountry,bucket=>
        (bucket?.companyAccounts?.[sellerCompany]?.cashFlowEntries||[])
          .some(row=>String(row?.sourceId||'')===settlementId&&row.category==='PRIVATE_COMPANY_EXPORT_SALE'));
      const procurementRowsByCountry = Object.entries(root.economy || {}).map(([countryId,bucket])=>({
        countryId,
        records:(bucket?.privateEnterpriseLifecycle?.privateCompanyProcurementRecords||[])
          .filter(row=>String(row?.settlementId||'')===settlementId)
      })).filter(row=>row.records.length);
      const buyerEconomyBucket=buyerEconomyKey?root.economy[buyerEconomyKey]:null;
      const sellerEconomyBucket=sellerEconomyKey?root.economy[sellerEconomyKey]:null;
      const buyerLifecycle=buyerEconomyBucket?.privateEnterpriseLifecycle||null;
      const financeReservationRows=Object.entries(root.finance||{}).map(([countryId,bucket])=>({
        countryId,
        reservation:bucket?.omegaFinance?.companyTradeReservations?.[settlementId]||null
      })).filter(row=>row.reservation);
      const procurement = (buyerLifecycle?.privateCompanyProcurementRecords || [])
        .find(row => row.settlementId === settlementId);
      if (!procurement || procurement.status !== 'SETTLED') {
        throw new Error('PRIVATE_CASH_LIFECYCLE_PROCUREMENT_RECORD_MISSING:' + JSON.stringify({
          buyerCountry,sellerCountry,marketBuyerCountryId,marketSellerCountryId,
          requestId,requestStatus:buyerRequest.status,settlementId,
          economyCountryKeys:Object.keys(root.economy||{}),
          buyerEconomyBucketKey:buyerEconomyKey,
          buyerEconomyBucketKeys:Object.keys(buyerEconomyBucket||{}),
          buyerLifecycleRecordCount:buyerLifecycle?.privateCompanyProcurementRecords?.length??null,
          procurementRowsByCountry,financeReservationRows,
          lifecycleDiagnostics:lifecycle.diagnostics?.()||null,
          latestTradeTrace:window.__OMEGA_LAST_TRADE_PROCESS_TRACE||null,
          settlementTrace:window.__OMEGA_SETTLEMENT_TRACE||null
        }));
      }
      const buyerAccount = buyerEconomyBucket?.companyAccounts?.[buyerCompany];
      const sellerAccount = sellerEconomyBucket?.companyAccounts?.[sellerCompany];
      const buyerWallet = buyerFinance.omegaFinance.companyCapitalAccounts[buyerCompany];
      const sellerWallet = sellerFinance.omegaFinance.companyCapitalAccounts[sellerCompany];
      const buyerPaymentEntry = (buyerAccount?.cashFlowEntries || []).find(row =>
        row.sourceId === settlementId && row.category === 'FACTORY_INPUT_PURCHASE' && row.direction === 'DEBIT');
      const sellerReceiptEntry = (sellerAccount?.cashFlowEntries || []).find(row =>
        row.sourceId === settlementId && row.category === 'PRIVATE_COMPANY_EXPORT_SALE' &&
        row.direction === 'CREDIT' && row.status === 'POSTED');
      const buyerPaymentLedger = buyerFinance.omegaFinance.ledger.find(row =>
        row.transactionId === 'PE-PRIVATE-IMPORT-PAYMENT:' + settlementId);
      const sellerReceiptLedger = sellerFinance.omegaFinance.ledger.find(row =>
        row.transactionId === 'PE-PRIVATE-IMPORT-RECEIPT:' + settlementId);
      if (!buyerPaymentEntry || !sellerReceiptEntry || !buyerPaymentLedger || !sellerReceiptLedger ||
          !sellerWallet || !buyerWallet) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_PAYMENT_REVENUE_LEDGER_RECONCILIATION_FAILED:'+JSON.stringify({
          buyerCountry,buyerEconomyKey,sellerCountry,sellerEconomyKey,settlementId,
          economyCountryKeys:Object.keys(root.economy||{}),
          buyerAccountPresent:!!buyerAccount,sellerAccountPresent:!!sellerAccount,
          buyerAccountKeys:Object.keys(buyerEconomyBucket?.companyAccounts||{}),
          sellerAccountKeys:Object.keys(sellerEconomyBucket?.companyAccounts||{}),
          buyerPaymentEntry:buyerPaymentEntry||null,sellerReceiptEntry:sellerReceiptEntry||null,
          buyerEntryIds:(buyerAccount?.cashFlowEntries||[]).map(row=>({entryId:row.entryId,sourceId:row.sourceId,category:row.category,direction:row.direction,status:row.status})),
          sellerEntryIds:(sellerAccount?.cashFlowEntries||[]).map(row=>({entryId:row.entryId,sourceId:row.sourceId,category:row.category,direction:row.direction,status:row.status})),
          buyerWalletPresent:!!buyerWallet,sellerWalletPresent:!!sellerWallet,
          buyerFinanceLedgerIds:(buyerFinance.omegaFinance.ledger||[]).map(row=>row.transactionId),
          sellerFinanceLedgerIds:(sellerFinance.omegaFinance.ledger||[]).map(row=>row.transactionId),
          buyerSettlementLedger:(buyerFinance.omegaFinance.ledger||[]).filter(row=>String(row.transactionId||'').includes(settlementId)),
          sellerSettlementLedger:(sellerFinance.omegaFinance.ledger||[]).filter(row=>String(row.transactionId||'').includes(settlementId)),
          financeReservation:buyerFinance.omegaFinance.companyTradeReservations?.[settlementId]||null,
          procurementRecord:procurement||null
        }));
      }
      if (Math.abs(buyerWallet.availableBalance - (buyerCashBefore - buyerPaymentLedger.amount)) > 1e-6 ||
          Math.abs((Number(sellerWallet.availableBalance) || 0) - sellerReceiptLedger.amount) > 1e-6 ||
          Math.abs((Number(sellerAccount.grossRevenue) || 0) - sellerReceiptLedger.amount) > 1e-6 ||
          Math.abs((Number(sellerAccount.paymentsReceived) || 0) - sellerReceiptLedger.amount) > 1e-6) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_WALLET_AND_REVENUE_AMOUNT_MISMATCH:' + JSON.stringify({
          buyerWallet: buyerWallet.availableBalance, buyerCashBefore,
          buyerPayment: buyerPaymentLedger.amount,
          sellerWallet: sellerWallet.availableBalance, sellerRevenue: sellerAccount.grossRevenue,
          sellerPaymentsReceived: sellerAccount.paymentsReceived, sellerReceipt: sellerReceiptLedger.amount
        }));
      }
      const sellerAmount = Number(sellerReceiptLedger.amount);
      const buyerAmount = Number(buyerPaymentLedger.amount);
      const sellerNetCashBeforeTax = Number(sellerAccount.runtimeNetCashFlow) || 0;
      if (Math.abs(sellerNetCashBeforeTax - sellerAmount) > 1e-6) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_SELLER_OPERATING_CASH_NOT_RECONCILED:' +
          JSON.stringify({ sellerNetCashBeforeTax, sellerAmount }));
      }

      const preservedTime = Number(simulation.clock.simulationTimeMs) || 0;
      const settlementTurn = Number(root.simulation?.turn) || currentTurn;
      simulation.createSession({
        playerCountryId: sellerCountry,
        startTurn: settlementTurn,
        simulationTimeMs: preservedTime,
        sessionId: 'PE-CASH-LIFECYCLE-TAX-JV'
      });
      window.Game.playerCountry = sellerCountry;
      window.Game.currentActiveCountry = sellerCountry;
      window.Game.selectedCountryId = sellerCountry;
      root.playerCountryId = sellerCountry;
      const tax = lifecycle.closeCompanyFinancialPeriod({ countryId: sellerCountry, companyId: sellerCompany });
      if (tax.status !== 'CLOSED') {
        throw new Error('PRIVATE_CASH_LIFECYCLE_CORPORATE_TAX_CLOSE_FAILED:' + JSON.stringify(tax));
      }
      const taxRate = Number(tax.period.corporateTaxRate);
      const taxPaid = Number(tax.period.corporateTaxPaid);
      const expectedTax = Number((sellerAmount * taxRate).toFixed(2));
      if (Math.abs(Number(tax.period.grossReceipts) - sellerAmount) > 1e-6 ||
          Math.abs(taxPaid - expectedTax) > 1e-6 ||
          Math.abs(Number(tax.period.retainedEarningsAfter) - (sellerAmount - taxPaid)) > 1e-6 ||
          Math.abs(Number(sellerAccount.runtimeNetCashFlow) - (sellerAmount - taxPaid)) > 1e-6 ||
          Math.abs(Number(sellerFinance.available) - (sellerTreasuryBefore + taxPaid)) > 1e-6) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_TAX_AND_RETAINED_EARNINGS_NOT_RECONCILED:' +
          JSON.stringify({ tax, sellerAmount, taxPaid, sellerAccount, treasuryBefore: sellerTreasuryBefore,
            treasuryAfter: sellerFinance.available }));
      }
      const taxEntry = sellerFinance.omegaFinance.ledger.find(row =>
        row.type === 'PRIVATE_ENTERPRISE_CORPORATE_PROFIT_TAX' && row.companyId === sellerCompany &&
        Math.abs(Number(row.amount) - taxPaid) < 1e-6);
      if (!taxEntry) throw new Error('PRIVATE_CASH_LIFECYCLE_CORPORATE_TAX_LEDGER_ENTRY_MISSING');
      if (taxEntry.currency !== sellerCurrency || tax.period.currency !== sellerCurrency) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_TAX_CURRENCY_NOT_RECONCILED:' +
          JSON.stringify({ expected: sellerCurrency, taxPeriodCurrency: tax.period.currency, ledgerCurrency: taxEntry.currency }));
      }

      const jointVenture = lifecycle.createJointVenture({
        countryId: sellerCountry, name: 'Cash lifecycle shareholder dividend proof',
        requestId: 'PE-CASH-LIFECYCLE-JV-REQUEST',
        managingCompanyId: sellerCompany,
        shareholders: [
          { companyId: sellerCompany, shareBps: 6000 },
          { companyId: dividendPartner, shareBps: 4000 }
        ]
      });
      if (jointVenture.status !== 'PROPOSED') {
        throw new Error('PRIVATE_CASH_LIFECYCLE_JV_PROPOSAL_FAILED:' + JSON.stringify(jointVenture));
      }
      if (jointVenture.jointVenture.currency !== sellerCurrency) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_JV_CURRENCY_NOT_RECONCILED:' +
          JSON.stringify({ expected: sellerCurrency, actual: jointVenture.jointVenture.currency }));
      }
      const approved = lifecycle.decideJointVenture({
        countryId: sellerCountry, jointVentureId: jointVenture.jointVenture.jointVentureId,
        decision: 'APPROVE'
      });
      if (approved.status !== 'ACTIVE') throw new Error('PRIVATE_CASH_LIFECYCLE_JV_APPROVAL_FAILED:' + JSON.stringify(approved));
      const retained = Number(lifecycle.getCompanyFinanceSummary(sellerCountry, sellerCompany).capital.retainedEarningsBalance);
      const contributionAmount = Number((Math.floor(retained * 50) / 100).toFixed(2));
      if (!(contributionAmount > 0)) throw new Error('PRIVATE_CASH_LIFECYCLE_POST_TAX_RETAINED_EARNINGS_NOT_AVAILABLE');
      const contribution = lifecycle.contributeJointVentureRetainedEarnings({
        countryId: sellerCountry, jointVentureId: jointVenture.jointVenture.jointVentureId,
        companyId: sellerCompany, amount: contributionAmount, requestId: 'PE-CASH-LIFECYCLE-JV-FUNDING'
      });
      if (contribution.status !== 'POSTED') throw new Error('PRIVATE_CASH_LIFECYCLE_JV_CONTRIBUTION_FAILED:' + JSON.stringify(contribution));
      const resolution = lifecycle.createJointVentureResolution({
        countryId: sellerCountry, jointVentureId: jointVenture.jointVenture.jointVentureId,
        type: 'DIVIDEND', amount: contributionAmount, requiredApprovalBps: 6667,
        description: 'Distribute verified post-tax retained earnings from the settled company sale'
      });
      if (resolution.status !== 'VOTING') throw new Error('PRIVATE_CASH_LIFECYCLE_DIVIDEND_RESOLUTION_FAILED:' + JSON.stringify(resolution));
      if (resolution.resolution.currency !== sellerCurrency) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_DIVIDEND_RESOLUTION_CURRENCY_NOT_RECONCILED:' +
          JSON.stringify({ expected: sellerCurrency, actual: resolution.resolution.currency }));
      }
      const firstVote = lifecycle.voteJointVentureResolution({
        countryId: sellerCountry, jointVentureId: jointVenture.jointVenture.jointVentureId,
        resolutionId: resolution.resolution.resolutionId, companyId: sellerCompany, vote: 'FOR'
      });
      const secondVote = lifecycle.voteJointVentureResolution({
        countryId: sellerCountry, jointVentureId: jointVenture.jointVenture.jointVentureId,
        resolutionId: resolution.resolution.resolutionId, companyId: dividendPartner, vote: 'FOR'
      });
      if (firstVote.status !== 'VOTE_RECORDED' || secondVote.status !== 'APPROVED') {
        throw new Error('PRIVATE_CASH_LIFECYCLE_WEIGHTED_DIVIDEND_VOTE_FAILED:' +
          JSON.stringify({ firstVote, secondVote }));
      }
      const dividend = lifecycle.distributeJointVentureDividend({
        countryId: sellerCountry, jointVentureId: jointVenture.jointVenture.jointVentureId,
        resolutionId: resolution.resolution.resolutionId
      });
      if (dividend.status !== 'PAID') throw new Error('PRIVATE_CASH_LIFECYCLE_DIVIDEND_PAYMENT_FAILED:' + JSON.stringify(dividend));
      const dividendAggregate = sellerFinance.omegaFinance.ledger.find(row => row.transactionId === dividend.transactionId &&
        row.type === 'PRIVATE_ENTERPRISE_JV_DIVIDEND_DISTRIBUTION');
      const dividendLedgerRows = sellerFinance.omegaFinance.ledger.filter(row => row.type === 'PRIVATE_ENTERPRISE_JV_DIVIDEND' &&
        row.jointVentureId === jointVenture.jointVenture.jointVentureId);
      if (!dividendAggregate || dividendAggregate.currency !== sellerCurrency ||
          dividend.distribution.some(row => row.currency !== sellerCurrency) ||
          dividendLedgerRows.length !== 2 || dividendLedgerRows.some(row => row.currency !== sellerCurrency)) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_DIVIDEND_CURRENCY_NOT_RECONCILED:' +
          JSON.stringify({ expected: sellerCurrency, dividendAggregate, distribution: dividend.distribution, dividendLedgerRows }));
      }
      const paidCents = dividend.distribution.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
      if (paidCents !== Math.round(contributionAmount * 100) ||
          Math.abs(Number(dividend.distribution.find(row => row.companyId === sellerCompany)?.amount) -
            contributionAmount * 0.6) > 0.011 ||
          Math.abs(Number(dividend.distribution.find(row => row.companyId === dividendPartner)?.amount) -
            contributionAmount * 0.4) > 0.011) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_DIVIDEND_ALLOCATION_NOT_RECONCILED:' +
          JSON.stringify({ contributionAmount, distribution: dividend.distribution }));
      }

      const expected = {
        requestId, settlementId, buyerCompany, sellerCompany, resourceId, quantity,
        buyerAmount, sellerAmount, buyerCurrency, sellerCurrency,
        buyerWalletBalance: Number(buyerWallet.availableBalance),
        sellerWalletBalance: Number(sellerWallet.availableBalance),
        sellerGrossRevenue: Number(sellerAccount.grossRevenue),
        sellerPaymentsReceived: Number(sellerAccount.paymentsReceived),
        sellerRuntimeNetCashFlow: Number(sellerAccount.runtimeNetCashFlow),
        taxPaid, taxRate, taxCurrency: taxEntry.currency, retainedEarningsAfterTax: Number(tax.period.retainedEarningsAfter),
        treasuryAfterTax: Number(sellerFinance.available),
        jointVentureId: jointVenture.jointVenture.jointVentureId,
        jointVentureCurrency: jointVenture.jointVenture.currency,
        dividendCurrency: dividendAggregate.currency,
        jointVentureRetainedEarningsAfterDividend: Number(lifecycle.getJointVentureDashboard(sellerCountry)
          .jointVentures.find(row => row.jointVentureId === jointVenture.jointVenture.jointVentureId)?.retainedEarningsBalance),
        dividend: dividend.distribution,
        buyerPaymentEntryId: buyerPaymentEntry.entryId,
        sellerReceiptEntryId: sellerReceiptEntry.entryId,
        taxTransactionId: taxEntry.transactionId,
        dividendTransactionId: dividend.transactionId
      };
      const saved = await simulation.saveSlot(slot);
      if (!saved?.ok) throw new Error('PRIVATE_CASH_LIFECYCLE_BROWSER_SAVE_FAILED:' + JSON.stringify(saved));
      const localStorageSaveAbsent = window.localStorage.getItem(saved.key) === null;
      root.simulation.__peCashLifecycleSaveProbe = 'TAMPERED_AFTER_SAVE';
      const loaded = await simulation.loadSlot(slot);
      const restored = window.Game.state;
      const restoredBuyerWallet = restored.finance.BGD.omegaFinance.companyCapitalAccounts[buyerCompany];
      const restoredSellerWallet = restored.finance.SAU.omegaFinance.companyCapitalAccounts[sellerCompany];
      // A save may retain both canonical ISO-3 and display-name country buckets.
      // Select the restored bucket that actually owns the company account instead of
      // assuming the first matching country alias is the authoritative account bucket.
      const restoredBuyerEconomyKey=countryBucketKey('economy',buyerCountry,bucket=>
        !!bucket?.companyAccounts?.[buyerCompany]);
      const restoredSellerEconomyKey=countryBucketKey('economy',sellerCountry,bucket=>
        !!bucket?.companyAccounts?.[sellerCompany]);
      const restoredBuyerAccount = restored.economy?.[restoredBuyerEconomyKey]?.companyAccounts?.[buyerCompany]||null;
      const restoredSellerAccount = restored.economy?.[restoredSellerEconomyKey]?.companyAccounts?.[sellerCompany]||null;
      if(!restoredBuyerAccount||!restoredSellerAccount)throw new Error('PRIVATE_CASH_LIFECYCLE_RESTORED_COMPANY_ACCOUNTS_MISSING:'+JSON.stringify({
        buyerCountry,buyerEconomyKey:restoredBuyerEconomyKey,sellerCountry,sellerEconomyKey:restoredSellerEconomyKey,
        economyKeys:Object.keys(restored.economy||{})
      }));
      const restoredTaxRows = restored.finance.SAU.omegaFinance.ledger.filter(row =>
        row.type === 'PRIVATE_ENTERPRISE_CORPORATE_PROFIT_TAX' && row.companyId === sellerCompany);
      const restoredDividendRows = restored.finance.SAU.omegaFinance.ledger.filter(row =>
        row.type === 'PRIVATE_ENTERPRISE_JV_DIVIDEND' && row.jointVentureId === expected.jointVentureId);
      const restoredDividendAggregate = restored.finance.SAU.omegaFinance.ledger.find(row =>
        row.type === 'PRIVATE_ENTERPRISE_JV_DIVIDEND_DISTRIBUTION' && row.jointVentureId === expected.jointVentureId);
      const restoredJV = lifecycle.getJointVentureDashboard(sellerCountry).jointVentures
        .find(row => row.jointVentureId === expected.jointVentureId);
      const restoredResult = {
        sameAuthoritativeRoot: restored === root && simulation.world?.state === root,
        storage: saved.storage || null,
        localStorageSaveAbsent,
        loadIntegrity: simulation.lastLoadIntegrity,
        sentinelCleared: restored.simulation.__peCashLifecycleSaveProbe === undefined,
        buyerWalletBalance: Number(restoredBuyerWallet.availableBalance),
        sellerWalletBalance: Number(restoredSellerWallet.availableBalance),
        buyerPaymentCount: restoredBuyerAccount.cashFlowEntries.filter(row =>
          row.sourceId === settlementId && row.category === 'FACTORY_INPUT_PURCHASE' &&
          row.direction === 'DEBIT' && row.status === 'POSTED').length,
        sellerReceiptCount: restoredSellerAccount.cashFlowEntries.filter(row =>
          row.sourceId === settlementId && row.category === 'PRIVATE_COMPANY_EXPORT_SALE' &&
          row.direction === 'CREDIT' && row.status === 'POSTED').length,
        sellerGrossRevenue: Number(restoredSellerAccount.grossRevenue),
        sellerPaymentsReceived: Number(restoredSellerAccount.paymentsReceived),
        sellerRuntimeNetCashFlow: Number(restoredSellerAccount.runtimeNetCashFlow),
        taxRows: restoredTaxRows.length,
        taxAmount: Number(restoredTaxRows[0]?.amount),
        taxCurrency: restoredTaxRows[0]?.currency || null,
        retainedEarnings: Number(lifecycle.getCompanyFinanceSummary(sellerCountry, sellerCompany).capital.retainedEarningsBalance),
        jointVentureCurrency: restoredJV?.currency || null,
        dividendRows: restoredDividendRows.length,
        dividendAmount: Number(restoredDividendRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
        dividendRowCurrencies: restoredDividendRows.map(row => row.currency),
        dividendAggregateCurrency: restoredDividendAggregate?.currency || null,
        jvBalance: Number(restoredJV?.retainedEarningsBalance)
      };
      if (!restoredResult.sameAuthoritativeRoot || restoredResult.storage !== 'INDEXEDDB' ||
          !restoredResult.localStorageSaveAbsent || restoredResult.loadIntegrity !== 'VERIFIED' ||
          !restoredResult.sentinelCleared || restoredResult.buyerPaymentCount !== 1 ||
          restoredResult.sellerReceiptCount !== 1 || restoredResult.taxRows !== 1 ||
          restoredResult.taxCurrency !== sellerCurrency ||
          restoredResult.jointVentureCurrency !== sellerCurrency ||
          restoredResult.dividendRows !== 2 ||
          restoredResult.dividendAggregateCurrency !== sellerCurrency ||
          restoredResult.dividendRowCurrencies.some(currency => currency !== sellerCurrency) ||
          Math.abs(restoredResult.buyerWalletBalance - expected.buyerWalletBalance) > 1e-6 ||
          Math.abs(restoredResult.sellerWalletBalance - expected.sellerWalletBalance) > 1e-6 ||
          Math.abs(restoredResult.sellerGrossRevenue - expected.sellerGrossRevenue) > 1e-6 ||
          Math.abs(restoredResult.sellerPaymentsReceived - expected.sellerPaymentsReceived) > 1e-6 ||
          Math.abs(restoredResult.sellerRuntimeNetCashFlow - expected.sellerRuntimeNetCashFlow) > 1e-6 ||
          Math.abs(restoredResult.taxAmount - expected.taxPaid) > 1e-6 ||
          Math.abs(restoredResult.dividendAmount - contributionAmount) > 0.011 ||
          Math.abs(restoredResult.jvBalance) > 1e-6) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_SAVE_LOAD_RECONCILIATION_FAILED:' +
          JSON.stringify({ expected, restoredResult }));
      }

      const duplicateClose = lifecycle.closeCompanyFinancialPeriod({ countryId: sellerCountry, companyId: sellerCompany });
      const duplicateDividend = lifecycle.distributeJointVentureDividend({
        countryId: sellerCountry, jointVentureId: expected.jointVentureId,
        resolutionId: resolution.resolution.resolutionId
      });
      // Import completion is player-country scoped even for an idempotent replay.
      // The lifecycle above switched the active session to the seller for tax/dividend
      // verification, so restore the buyer country before replaying its settled import.
      simulation.createSession({
        playerCountryId:buyerCountry,
        startTurn:Number(restored.simulation?.turn??simulation.clock.turn)||0,
        simulationTimeMs:Number(simulation.clock.simulationTimeMs)||0,
        sessionId:'PE-CASH-LIFECYCLE-IMPORT-REPLAY'
      });
      window.Game.playerCountry=buyerCountry;
      window.Game.currentActiveCountry=buyerCountry;
      window.Game.selectedCountryId=buyerCountry;
      restored.playerCountryId=buyerCountry;
      const duplicateImport = lifecycle.completePrivateCompanyImport({
        settlementId, buyerCountryId: buyerCountry, sellerCountryId: sellerCountry,
        buyerCompanyId: buyerCompany, sellerCompanyId: sellerCompany,
        buyerAmount, sellerAmount, buyerPurchaseAmount: procurement.buyerPurchaseAmount,
        buyerTariffAmount: procurement.buyerTariffAmount, quantity,
        buyerCurrency, sellerCurrency, resourceId, batchTransfers: procurement.batchTransfers
      });
      if (duplicateClose.status !== 'DUPLICATE' || duplicateDividend.status !== 'DUPLICATE' ||
          duplicateImport.status !== 'DUPLICATE') {
        throw new Error('PRIVATE_CASH_LIFECYCLE_REPLAY_IDEMPOTENCY_FAILED:' +
          JSON.stringify({ duplicateClose, duplicateDividend, duplicateImport }));
      }
      const afterReplay = {
        sellerGrossRevenue: Number(restoredSellerAccount.grossRevenue),
        sellerPaymentsReceived: Number(restoredSellerAccount.paymentsReceived),
        sellerTaxCount: restoredTaxRows.length,
        dividendRowCount: restoredDividendRows.length,
        buyerPaymentCount: restoredBuyerAccount.cashFlowEntries.filter(row =>
          row.sourceId === settlementId && row.category === 'FACTORY_INPUT_PURCHASE' &&
          row.direction === 'DEBIT' && row.status === 'POSTED').length
      };
      if (afterReplay.sellerGrossRevenue !== expected.sellerGrossRevenue ||
          afterReplay.sellerPaymentsReceived !== expected.sellerPaymentsReceived ||
          afterReplay.sellerTaxCount !== 1 || afterReplay.dividendRowCount !== 2 ||
          afterReplay.buyerPaymentCount !== 1) {
        throw new Error('PRIVATE_CASH_LIFECYCLE_REPLAY_CHANGED_LEDGER:' + JSON.stringify(afterReplay));
      }
      return {
        ...expected,
        currencyProbe,
        saveLoad: restoredResult,
        idempotency: {
          duplicateClose: duplicateClose.status,
          duplicateDividend: duplicateDividend.status,
          duplicateImport: duplicateImport.status,
          afterReplay
        },
        settlementRecord: procurement
      };
    });

    assert.equal(result.saveLoad.loadIntegrity, 'VERIFIED');
    assert.equal(result.saveLoad.buyerPaymentCount, 1);
    assert.equal(result.saveLoad.sellerReceiptCount, 1);
    assert.equal(result.saveLoad.taxRows, 1);
    assert.equal(result.saveLoad.dividendRows, 2);
    assert.equal(result.idempotency.duplicateImport, 'DUPLICATE');
    assert.equal(result.idempotency.duplicateClose, 'DUPLICATE');
    assert.equal(result.idempotency.duplicateDividend, 'DUPLICATE');
    metrics.completed = true;
    metrics.reconciliation = result;
    metrics.stages.push(
      'EXECUTABLE_MARKET_QUOTE_TO_COMPANY_BUYER_PAYMENT',
      'SELLER_COMPANY_REVENUE_AND_RECEIPT_LEDGER_MATCHED',
      'CORPORATE_PROFIT_TAX_POSTED_TO_SOVEREIGN_TREASURY',
      'POST_TAX_RETAINED_EARNINGS_TO_APPROVED_JV_DIVIDEND',
      'INDEXEDDB_SAVE_LOAD_AND_REPLAY_IDEMPOTENCY_VERIFIED'
    );
    metrics.errors = { pageErrors, consoleErrors };
    const fatalConsoleErrors = consoleErrors.filter(message =>
      !/net::ERR_BLOCKED_BY_CLIENT|blockedbyclient/i.test(message)
    );
    assert.deepEqual(pageErrors, [], 'private cash lifecycle browser proof must not leave uncaught page exceptions');
    assert.deepEqual(fatalConsoleErrors, [], 'private cash lifecycle browser proof must not leave local runtime errors');
    fs.writeFileSync(path.join(artifacts, 'omega-private-enterprise-cash-lifecycle.json'), JSON.stringify(metrics, null, 2));
    await page.screenshot({
      path: path.join(artifacts, 'omega-private-enterprise-cash-lifecycle.png'),
      fullPage: true
    });
  } catch (error) {
    metrics.completed = false;
    metrics.failure = String(error && error.stack || error);
    metrics.errors = { pageErrors, consoleErrors };
    try {
      metrics.forexDiagnostics = await page.evaluate(() => ({
        finance: window.OmegaFinanceMinistry?.diagnostics?.() || null,
        forex: window.OmegaForexMonetaryEngine?.diagnostics?.() || null,
        buyer: window.OmegaGlobalTrade?.currencyOf?.('BGD') || null,
        seller: window.OmegaGlobalTrade?.currencyOf?.('SAU') || null
      }));
    } catch (diagnosticError) {
      metrics.forexDiagnosticsError = String(diagnosticError && diagnosticError.message || diagnosticError);
    }
    try {
      fs.writeFileSync(path.join(artifacts, 'omega-private-enterprise-cash-lifecycle-failure.json'), JSON.stringify(metrics, null, 2));
    } catch (_) {}
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
});
