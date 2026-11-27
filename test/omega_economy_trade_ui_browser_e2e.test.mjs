import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

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
      if (req.method === 'HEAD') { res.end(); return; }
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
        close: () => new Promise(done => {
          server.closeAllConnections?.();
          server.close(() => done());
        })
      });
    });
  });
}

test('real Chromium keeps the five premium Trade & Commerce destinations available on every section', {
  timeout: 240000
}, async () => {
  const artifactDir = process.env.OMEGA_TRADE_UI_ARTIFACT_DIR || path.join(ROOT, 'test-results', 'omega-economy-trade-browser');
  fs.mkdirSync(artifactDir, { recursive: true });
  const server = await startStaticServer();
  let browser;
  const pageErrors = [];
  const consoleErrors = [];
  const result = { checks: [], pageErrors, consoleErrors, origin: server.origin };
  const check = (name, passed, detail) => {
    result.checks.push({ name, passed:!!passed, detail:detail || null });
    assert.ok(passed, name + (detail ? ': ' + detail : ''));
  };

  try {
    browser = await chromium.launch({
      headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
    });
    const context = await browser.newContext({
      viewport:{ width:1280, height:850 },
      serviceWorkers:'block'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => pageErrors.push(String(error && error.stack || error)));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('**/*', route => {
      if (route.request().url().startsWith(server.origin)) return route.continue();
      return route.abort('blockedbyclient');
    });

    await page.goto(server.origin + '/', { waitUntil:'domcontentloaded', timeout:60000 });
    // Only the app shell and route integration are eager. Presentation modules
    // are intentionally loaded on demand by omega_ui_v2/module-loader.js.
    await page.waitForFunction(() =>
      !!window.OmegaUIV2App &&
      !!window.OmegaUIV2Integration &&
      typeof window.OmegaUIV2Integration.openRoute === 'function' &&
      !!window.OmegaUIV2ModuleLoader &&
      typeof window.OmegaUIV2ModuleLoader.loadForContext === 'function'
    , null, { timeout:30000 });

    const openedEconomy = await page.evaluate(() => {
      const country = 'BGD';
      window.OmegaMinistryViewCountry = country;
      if (window.OmegaCabinetUI) window.OmegaCabinetUI.activeCountry = country;
      if (window.CountryIOS) window.CountryIOS.activeCountry = country;
      if (window.Game) {
        window.Game.currentActiveCountry = country;
        window.Game.selectedCountryId = country;
      }
      return window.OmegaUIV2Integration.openRoute('economy');
    });
    check('production integration opens Economy', openedEconomy === true);
    await page.waitForFunction(() =>
      !!window.OmegaUIV2Economy &&
      typeof window.OmegaUIV2Economy.render === 'function',
    null, { timeout:30000 });
    const cabinet = page.locator('#cabinet-full-window');
    await cabinet.locator('[data-omega-v2-open-economic-ministry="trade"]').waitFor({ state:'visible', timeout:30000 });
    check('Economy renders the Trade & Commerce ministry gateway', await cabinet.locator('[data-omega-v2-open-economic-ministry="trade"]').count() === 1);

    const dashboard = cabinet.locator('[data-omega-economy-v3="true"]');
    await dashboard.waitFor({ state:'visible', timeout:30000 });
    check('Economy opens directly on the redesigned overview', await dashboard.count() === 1);
    const overviewText = await dashboard.innerText();
    check('Economy overview exposes national liquidity, trade, partners and investment',
      /Domestic currency/i.test(overviewText) &&
      /Foreign-exchange reserves/i.test(overviewText) &&
      /Total imports/i.test(overviewText) &&
      /Total exports/i.test(overviewText) &&
      /Largest import partner/i.test(overviewText) &&
      /Largest export partner/i.test(overviewText) &&
      /FOREIGN DIRECT INVESTMENT/i.test(overviewText));
    check('Economy overview has no chart or duplicate left-side section navigation',
      await dashboard.locator('canvas, svg.recharts-surface, [data-omega-v2-economy-tab], .omega-economy-v3-sidebar').count() === 0);
    check('Economy metric icons use the new dimensional SVG medallions',
      await dashboard.locator('.omega-economy-v3-icon-svg--3d').count() > 0);
    const labelFontSize = await dashboard.locator('.omega-economy-v3-metric-label').first().evaluate(el => getComputedStyle(el).fontSize);
    check('Economy metric labels meet the mobile readability floor',
      Number.parseFloat(labelFontSize) >= 9, labelFontSize);
    await page.setViewportSize({ width:360, height:800 });
    const mobileWidth = await dashboard.evaluate(el => ({ client:el.clientWidth, scroll:el.scrollWidth }));
    check('Economy overview has no horizontal overflow at 360px',
      mobileWidth.scroll <= mobileWidth.client + 1, JSON.stringify(mobileWidth));
    await page.setViewportSize({ width:1280, height:850 });

    await cabinet.locator('[data-omega-v2-open-economic-ministry="trade"]').click();
    await page.waitForFunction(() =>
      !!window.OmegaUIV2Government &&
      typeof window.OmegaUIV2Government.render === 'function' &&
      !!window.OmegaUIV2MinistryDetail &&
      typeof window.OmegaUIV2MinistryDetail.render === 'function',
    null, { timeout:30000 });
    await page.waitForFunction(() => {
      const root = document.getElementById('cabinet-full-window');
      const main = root?.querySelector('[data-omega-v2-main]');
      return root?.getAttribute('data-omega-v2-route') === 'ministry-detail' &&
        root.__omegaUIV2State?.ministryId === 'trade' &&
        !!main?.querySelector('[data-omega-trade-overview="true"]');
    }, null, { timeout:30000 });
    const main = cabinet.locator('[data-omega-v2-main]');
    const tradeText = await main.innerText();
    check('Trade & Commerce overview is visible', /TRADE & COMMERCE/i.test(tradeText) && /National trade overview/i.test(tradeText));

    const nav = page.locator('#cabinet-full-window [data-omega-v2-main] [data-omega-trade-command-nav]');
    const expectedRouteOrder = ['overview','commodities','settlement','transactions','black-market'];
    const navRouteOrder = () => nav.locator('.omega-trade-command-button').evaluateAll(buttons =>
      buttons.map(button => button.getAttribute('data-omega-trade-route')));
    const actionSelectors = [
      { name:'Commodity Market', route:'commodities', selector:'[data-omega-trade-route="commodities"]', section:'market', tab:'commodities', host:'[data-omega-v2-trade-market-host]', heading:'Market Commodities' },
      { name:'Black Market', route:'black-market', selector:'[data-omega-trade-route="black-market"]', section:'market', tab:'black-market', host:'[data-omega-v2-black-market-host]', heading:'Black Market' },
      { name:'Transactions', route:'transactions', selector:'[data-omega-trade-route="transactions"]', section:'market', tab:'transactions', host:'[data-omega-v2-trade-market-host]', heading:'Market Transactions' },
      { name:'Trade Settlement', route:'settlement', selector:'[data-omega-trade-route="settlement"]', section:'settlement', tab:null, host:'.omega-trade-settlement', heading:'Trade Settlement' },
      { name:'Overview', route:'overview', selector:'[data-omega-trade-route="overview"]', section:'dashboard', tab:null, host:'[data-omega-trade-overview="true"]', heading:'National trade overview' }
    ];

    check('the five upper navigation destinations appear in the requested fixed order',
      JSON.stringify(await navRouteOrder()) === JSON.stringify(expectedRouteOrder));
    check('the bottom TRADE OPERATIONS action block is removed',
      !/04 \/ TRADE OPERATIONS/.test(await main.innerText()));

    for (const action of actionSelectors) {
      const button = nav.locator(action.selector);
      await button.waitFor({ state:'visible', timeout:15000 });
      check(action.name + ' remains available in the persistent navigation', await button.count() === 1);
      await button.click();
      await page.waitForFunction(({ section, tab }) => {
        const currentMain = document.querySelector('#cabinet-full-window [data-omega-v2-main]');
        const options = currentMain?.__omegaV2MinistryDetailOptions;
        return options?.ministryId === 'trade' &&
          options?.section === section &&
          (tab === null || options?.marketTab === tab);
      }, { section:action.section, tab:action.tab }, { timeout:25000 });
      await nav.waitFor({ state:'visible', timeout:15000 });
      const actualRouteOrder = await navRouteOrder();
      check(action.name + ' keeps the same navigation and order',
        await nav.locator('.omega-trade-command-button').count() === 5 &&
        JSON.stringify(actualRouteOrder) === JSON.stringify(expectedRouteOrder),
        JSON.stringify(actualRouteOrder));
      check(action.name + ' is marked active', await nav.locator(action.selector).getAttribute('aria-current') === 'page');
      if (action.name === 'Overview') {
        check('Overview screen returns to the selected-country trade dashboard', (await main.innerText()).includes(action.heading));
      } else {
        await main.locator(action.host).waitFor({ state:'attached', timeout:15000 });
        check(action.name + ' opens its existing screen', await main.locator(action.host).count() > 0);
        check(action.name + ' shows its existing screen heading', (await main.innerText()).includes(action.heading));
      }
      if (action.name === 'Trade Settlement') {
        const importsTab = main.locator('[data-omega-v2-trade-settlement-tab="imports"]');
        const exportsTab = main.locator('[data-omega-v2-trade-settlement-tab="exports"]');
        check('Trade Settlement opens with Imports selected by default',
          await importsTab.getAttribute('aria-selected') === 'true' &&
          await exportsTab.getAttribute('aria-selected') === 'false');
        await exportsTab.click();
        await page.waitForFunction(() =>
          document.querySelector('#cabinet-full-window [data-omega-v2-main]')?.__omegaV2MinistryDetailOptions?.settlementTab === 'exports',
          null, { timeout:15000 });
        check('Export tab replaces the primary Import list instead of showing both at once',
          await exportsTab.getAttribute('aria-selected') === 'true' &&
          await main.locator('[data-omega-trade-primary-list="exports"]').count() === 1 &&
          await main.locator('[data-omega-trade-primary-list="imports"]').count() === 0);
        await importsTab.click();
        await page.waitForFunction(() =>
          document.querySelector('#cabinet-full-window [data-omega-v2-main]')?.__omegaV2MinistryDetailOptions?.settlementTab === 'imports',
          null, { timeout:15000 });
        check('player can return to Imports without leaving Trade Settlement',
          await importsTab.getAttribute('aria-selected') === 'true' &&
          await main.locator('[data-omega-trade-primary-list="imports"]').count() === 1);
      }
    }

    await page.setViewportSize({ width:360, height:800 });
    const navWidth = await nav.evaluate(el => ({ client:el.clientWidth, scroll:el.scrollWidth }));
    check('the five-button command deck fits a 360px mobile screen without horizontal overflow',
      navWidth.scroll <= navWidth.client + 1, JSON.stringify(navWidth));
    check('the command deck remains compact on mobile',
      Number.parseFloat(await nav.locator('.omega-trade-command-button').first().evaluate(el => getComputedStyle(el).minHeight)) <= 60);
    await page.setViewportSize({ width:1280, height:850 });

    result.ok = true;
    fs.writeFileSync(path.join(artifactDir, 'trade-navigation-result.json'), JSON.stringify(result, null, 2));
  } catch (error) {
    result.ok = false;
    result.failure = String(error && error.stack || error);
    try {
      if (browser) {
        const pages = browser.contexts().flatMap(item => item.pages());
        if (pages[0]) await pages[0].screenshot({ path:path.join(artifactDir, 'trade-navigation-failure.png'), fullPage:true });
      }
    } catch (_) {}
    fs.writeFileSync(path.join(artifactDir, 'trade-navigation-result.json'), JSON.stringify(result, null, 2));
    throw error;
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
});
