import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function createHarness() {
  const listeners = new Map();
  const removed = [];
  const timers = new Map();
  const cleanups = [];
  let nextTimer = 1;
  const sandbox = {
    console, Date, Math, Number, String, Object, Array, Set, Map, WeakMap, JSON, Promise, Intl,
    Game:{ state:{ simulation:{ turn:1 }, resource:{ BGD:{} }, economy:{ BGD:{} } } },
    addEventListener(type, callback) {
      const rows = listeners.get(type) || [];
      rows.push(callback);
      listeners.set(type, rows);
    },
    removeEventListener(type, callback) {
      removed.push({type, callback});
      const rows = listeners.get(type) || [];
      listeners.set(type, rows.filter(row => row !== callback));
    },
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, {callback, delay});
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    dispatchEvent() { return true; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(new URL('../omega_ui_v2/screens/industry.js', import.meta.url), 'utf8'),
    sandbox,
    { filename:'omega_ui_v2/screens/industry.js' }
  );
  const root = {
    __omegaV2IndustryCountryId:'BGD',
    __omegaV2IndustryTab:'factories',
    querySelector(selector) {
      return selector === '.omega-v2-industry-command, .omega-v2-factory-command' ? {} : null;
    }
  };
  const api = sandbox.OmegaUIV2Industry;
  const cleanup = api.bindRuntimeEvents(root, {
    countryId:'BGD',
    tab:'factories',
    onRegisterCleanup(callback) { cleanups.push(callback); }
  });
  return {api,root,listeners,removed,timers,cleanups,cleanup};
}

test('Industry runtime events are coalesced into one bounded in-place refresh', () => {
  const h = createHarness();
  assert.equal(h.root.__omegaV2IndustryEventsBound, true);
  const turnHandlers = h.listeners.get('OMEGA_SIMULATION_TURN_COMMITTED') || [];
  const extractionHandlers = h.listeners.get('OMEGA_RESOURCE_EXTRACTION_COMPLETED') || [];
  const turnRefreshHandler = turnHandlers.find(handler => handler.__omegaIndustryRuntimeRefreshHandler);
  const extractionRefreshHandler = extractionHandlers.find(handler => handler.__omegaIndustryRuntimeRefreshHandler);
  assert.equal(turnHandlers.filter(handler => handler.__omegaIndustryRuntimeRefreshHandler).length, 1);
  assert.equal(extractionRefreshHandler && extractionRefreshHandler.__omegaIndustryRuntimeRefreshHandler, true);

  turnRefreshHandler({detail:{countryId:'BGD'}});
  extractionRefreshHandler({detail:{countryId:'BGD'}});
  assert.equal(h.timers.size, 1, 'one screen refresh should cover a burst of turn and domain events');
  assert.equal(Array.from(h.timers.values())[0].delay, 180);
  assert.deepEqual(Object.keys(h.root.__omegaV2IndustryRefreshEvents).sort(), [
    'OMEGA_RESOURCE_EXTRACTION_COMPLETED',
    'OMEGA_SIMULATION_TURN_COMMITTED'
  ]);
});

test('Industry runtime listeners reject another country and are removed with screen cleanup', () => {
  const h = createHarness();
  const turnHandlers = h.listeners.get('OMEGA_SIMULATION_TURN_COMMITTED') || [];
  const handler = turnHandlers.find(row => row.__omegaIndustryRuntimeRefreshHandler);
  assert.equal(typeof handler, 'function');
  handler({detail:{countryId:'USA'}});
  assert.equal(h.timers.size, 0, 'events for another country must not refresh the player screen');

  handler({detail:{countryId:'BGD'}});
  assert.equal(h.timers.size, 1);
  h.cleanups[0]();
  assert.equal(h.timers.size, 0, 'screen cleanup cancels a queued refresh');
  assert.equal(h.root.__omegaV2IndustryEventsBound, false);
  assert.equal(h.root.__omegaV2IndustryRuntimeEventHandlers.length, 0);
  assert.ok(h.removed.length > 0);
  for (const rows of h.listeners.values()) {
    assert.equal(rows.some(row => row.__omegaIndustryRuntimeRefreshHandler), false,
      'only the new screen-scoped listeners should be removed');
  }
  const legacyCoverageHandlers = h.listeners.get('OMEGA_SIMULATION_TURN_COMMITTED') || [];
  assert.equal(legacyCoverageHandlers.length, 1,
    'the pre-existing factory coverage listener must remain registered');
  h.cleanup();
  assert.equal(h.removed.length, h.api.runtimeEventNames.length);
});

test('Industry runtime updates do not route through navigation scheduling', () => {
  const h = createHarness();
  const source = fs.readFileSync(new URL('../omega_ui_v2/screens/industry.js', import.meta.url), 'utf8');
  assert.match(source, /function refreshIndustryRuntimeInPlace/);
  assert.ok(source.includes('var result = render(root, options);'));
  assert.ok(source.includes('bindIndustryRuntimeEvents(root, options)'));
  assert.doesNotMatch(source.slice(source.indexOf('function scheduleIndustryRuntimeRefresh'), source.indexOf('function bindIndustryRuntimeEvents')), /scheduleRender\(/);
  assert.equal(typeof h.api.scheduleRuntimeRefresh, 'function');
});
