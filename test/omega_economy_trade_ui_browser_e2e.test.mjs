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

test('real Chromium opens all four Trade & Commerce services from the Economy ministry', {
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
    await page.waitForFunction(() =>
      !!window.OmegaUIV2App &&
      !!window.OmegaUIV2Integration &&
      typeof window.OmegaUIV2Integration.openRoute === 'function' &&
      !!window.OmegaUIV2Economy &&
      !!window.OmegaUIV2MinistryDetail &&
      !!window.OmegaUIV2Government &&
      !!window.OmegaCabinetUI &&
      !!window.OmegaCabinetUI.ministriesDatabase?.trade
    , null, { timeout:120000 });

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
    const cabinet = page.locator('#cabinet-full-window');
    await cabinet.locator('[data-omega-v2-open-economic-ministry="trade"]').waitFor({ state:'visible', timeout:30000 });
    check('Economy renders the Trade & Commerce ministry gateway', await cabinet.locator('[data-omega-v2-open-economic-ministry="trade"]').count() === 1);

    await cabinet.locator('[data-omega-v2-open-economic-ministry="trade"]').click();
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

    const actionSelectors = [
      { name:'Commodity Market', selector:'[data-omega-v2-ministry-section="market"][data-omega-v2-trade-market-tab="commodities"]', section:'market', tab:'commodities', host:'[data-omega-v2-trade-market-host]', heading:'Market Commodities' },
      { name:'Black Market', selector:'[data-omega-v2-ministry-section="market"][data-omega-v2-trade-market-tab="black-market"]', section:'market', tab:'black-market', host:'[data-omega-v2-black-market-host]', heading:'Black Market' },
      { name:'Transactions', selector:'[data-omega-v2-ministry-section="market"][data-omega-v2-trade-market-tab="transactions"]', section:'market', tab:'transactions', host:'[data-omega-v2-trade-market-host]', heading:'Market Transactions' },
      { name:'Trade Settlement', selector:'[data-omega-v2-ministry-section="settlement"]', section:'settlement', tab:null, host:'.omega-trade-settlement', heading:'Trade Settlement' }
    ];

    for (const action of actionSelectors) {
      const button = main.locator(action.selector).first();
      await button.waitFor({ state:'visible', timeout:15000 });
      check(action.name + ' action is visible in Trade & Commerce', await button.count() >= 1);
      await button.click();
      await page.waitForFunction(({ section, tab }) => {
        const currentMain = document.querySelector('#cabinet-full-window [data-omega-v2-main]');
        const options = currentMain?.__omegaV2MinistryDetailOptions;
        return options?.ministryId === 'trade' &&
          options?.section === section &&
          (tab === null || options?.marketTab === tab);
      }, { section:action.section, tab:action.tab }, { timeout:25000 });
      await main.locator(action.host).waitFor({ state:'attached', timeout:15000 });
      check(action.name + ' opens its intended screen', await main.locator(action.host).count() > 0);
      check(action.name + ' shows its screen heading', (await main.innerText()).includes(action.heading));

      const back = main.locator('[data-omega-v2-ministry-section="dashboard"]').first();
      await back.waitFor({ state:'visible', timeout:15000 });
      await back.click();
      await page.waitForFunction(() =>
        document.querySelector('#cabinet-full-window [data-omega-v2-main]')?.__omegaV2MinistryDetailOptions?.section === 'dashboard'
      , null, { timeout:25000 });
    }

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
