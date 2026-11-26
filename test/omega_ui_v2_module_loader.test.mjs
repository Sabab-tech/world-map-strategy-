import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../omega_ui_v2/module-loader.js', import.meta.url), 'utf8');

function createHarness() {
  const scripts = [];
  const ready = new Set();
  const document = {
    createElement(tag) {
      assert.equal(tag, 'script');
      return { setAttribute(name, value) { this[name] = value; } };
    },
    head: {
      appendChild(script) {
        scripts.push(script);
        script.parentNode = this;
      },
      removeChild() {},
    },
  };
  const window = { document };
  vm.runInNewContext(source, { window, globalThis:window, Promise });
  const api = window.OmegaUIV2ModuleLoader;
  const loader = api.createLoader({
    document,
    baseUrl:'./',
    isReady(file) { return ready.has(file); },
  });
  return { api, loader, scripts, ready };
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

test('route manifests request only the presentation modules used by that screen', () => {
  const { api } = createHarness();
  const cases = [
    [{ route:'map' }, []],
    [{ route:'overview' }, []],
    [{ route:'government' }, ['omega_ui_v2/screens/government.js']],
    [{ route:'economy' }, ['omega_ui_v2/screens/economy.js']],
    [{ route:'industry' }, ['omega_ui_v2/screens/industry.js']],
    [{ route:'resources' }, ['omega_ui_v2/screens/resource-ministry.js']],
    [{ route:'mine-detail' }, ['omega_ui_v2/screens/resource-ministry.js','omega_ui_v2/screens/mine-detail.js']],
    [{ route:'home-affairs' }, ['omega_ui_v2/screens/home-affairs.js','omega_ui_v2/screens/police-fleet.js']],
    [{ route:'reports' }, ['omega_ui_v2/screens/reports.js']],
    [{ route:'autonomous-development' }, ['omega_ui_v2/screens/autonomous-development.js']],
    [{ route:'ministry-detail', ministryId:'production' }, ['omega_ui_v2/screens/industry.js']],
    [{ route:'ministry-detail', ministryId:'interior_security' }, ['omega_ui_v2/screens/home-affairs.js','omega_ui_v2/screens/police-fleet.js']],
    [{ route:'ministry-detail', ministryId:'energy_mining' }, ['omega_ui_v2/screens/resource-ministry.js']],
    [{ route:'ministry-detail', ministryId:'foreign_affairs' }, [
      'omega_ui_v2/screens/government.js',
      'omega_ui_v2/screens/economy.js',
      'omega_ui_v2/screens/ministry-detail.js',
    ]],
  ];
  for (const [context, expected] of cases) {
    assert.equal(api.modulesForContext(context).join('|'), expected.join('|'), JSON.stringify(context));
  }
});

test('module requests are coalesced and scripts execute sequentially in manifest order', async () => {
  const { loader, scripts, ready } = createHarness();
  const context = { route:'home-affairs' };
  const first = loader.loadForContext(context);
  const second = loader.loadForContext(context);
  await flushMicrotasks();

  assert.equal(scripts.length, 1, 'concurrent navigations must share the in-flight script');
  assert.equal(scripts[0].src, './omega_ui_v2/screens/home-affairs.js');
  assert.equal(scripts[0].async, false, 'dynamic scripts must retain deterministic execution order');

  ready.add(scripts[0].__omegaLazyModule);
  scripts[0].onload();
  await flushMicrotasks();
  assert.equal(scripts.length, 2, 'the dependent Police Fleet renderer loads after Home Affairs');
  assert.equal(scripts[1].src, './omega_ui_v2/screens/police-fleet.js');

  ready.add(scripts[1].__omegaLazyModule);
  scripts[1].onload();
  const results = await Promise.all([first, second]);
  assert.deepEqual(Array.from(results[0]), [
    'omega_ui_v2/screens/home-affairs.js',
    'omega_ui_v2/screens/police-fleet.js',
  ]);
  assert.deepEqual(Array.from(results[1]), Array.from(results[0]));
  assert.equal(loader.isLoadedForContext(context), true);
  assert.equal(loader.diagnostics().loadedCount, 2);
});

test('failed screen loads can be retried without keeping a rejected promise cached', async () => {
  const { loader, scripts, ready } = createHarness();
  const attempt = loader.loadForContext({ route:'reports' });
  await flushMicrotasks();
  assert.equal(scripts.length, 1);
  scripts[0].onerror();
  await assert.rejects(attempt, /UI_SCREEN_MODULE_LOAD_FAILED/);
  assert.equal(loader.diagnostics().inFlightCount, 0);
  assert.equal(loader.diagnostics().failureCount, 1);

  const retry = loader.loadForContext({ route:'reports' });
  await flushMicrotasks();
  assert.equal(scripts.length, 2);
  ready.add(scripts[1].__omegaLazyModule);
  scripts[1].onload();
  await retry;
  assert.equal(loader.isLoadedForContext({ route:'reports' }), true);
});
