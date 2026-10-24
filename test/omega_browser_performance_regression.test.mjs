import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function createHarness() {
  const elementsById = new Map();
  const frames = new Map();
  let nextFrame = 1;
  let observerInstance = null;

  class FakeClassList {
    constructor() { this.values = new Set(); }
    contains(token) { return this.values.has(token); }
    add(...tokens) { tokens.forEach((token) => this.values.add(token)); }
    toggle(token, force) {
      const next = force === undefined ? !this.values.has(token) : Boolean(force);
      if (next) this.values.add(token);
      else this.values.delete(token);
      return next;
    }
  }

  class FakeElement {
    constructor(id = '') {
      this.id = id;
      this.nodeType = 1;
      this.attributes = new Map();
      this.attributeWrites = 0;
      this.styleWrites = 0;
      this.style = new Proxy({}, {
        set: (target, key, value) => {
          this.styleWrites += 1;
          target[key] = value;
          return true;
        }
      });
      this.classList = new FakeClassList();
      this.children = [];
      this.parentElement = null;
      this.textContent = '';
      this.className = '';
      if (id) elementsById.set(id, this);
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    setAttribute(name, value) {
      this.attributeWrites += 1;
      this.attributes.set(name, String(value));
    }
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      if (child.id) elementsById.set(child.id, child);
      return child;
    }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    getBoundingClientRect() { return { width: 100, height: 100, top: 0, left: 0 }; }
    contains(other) {
      if (other === this) return true;
      return this.children.some((child) => child.contains(other));
    }
    matches(selector) {
      return String(selector).split(',').map((part) => part.trim()).includes('#' + this.id);
    }
  }

  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const ministry = new FakeElement('ministry-dashboard-view');
  const content = new FakeElement('ministry-dashboard-content');
  const interrogation = new FakeElement('minister-interrogation-modal');
  const cabinet = new FakeElement('cabinet-full-window');
  const command = new FakeElement('command-hub-modal');
  const unrelated = new FakeElement('unrelated-map-layer');
  const selectors = new Map([
    ['#ministry-dashboard-view', ministry],
    ['#ministry-dashboard-content', content],
    ['#minister-interrogation-modal', interrogation],
    ['#cabinet-full-window', cabinet],
    ['#command-hub-modal', command]
  ]);
  const document = {
    readyState: 'complete',
    body,
    head,
    querySelector: (selector) => selectors.get(selector) || null,
    getElementById: (id) => elementsById.get(id) || null,
    createElement: (tagName) => new FakeElement(tagName === 'style' ? '' : ''),
    addEventListener() {}
  };
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; observerInstance = this; }
    observe() {}
    disconnect() {}
  }
  const window = {
    document,
    MutationObserver: FakeMutationObserver,
    addEventListener() {},
    requestAnimationFrame(callback) {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout() { return 1; },
    performance: { now: () => 10 }
  };
  const context = {
    window,
    document,
    MutationObserver: FakeMutationObserver,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    setTimeout: () => 1,
    setInterval: () => { throw new Error('The UI interaction guard must not poll continuously'); },
    queueMicrotask: (callback) => callback(),
    console
  };
  return {
    context, body, ministry, interrogation, cabinet, command, unrelated, frames,
    getObserver: () => observerInstance,
    runFrame(id) {
      const callback = frames.get(id);
      assert.equal(typeof callback, 'function', 'scheduled frame should exist');
      frames.delete(id);
      callback(16);
    }
  };
}

test('interaction guard does not rewrite observed attributes/styles on every refresh', () => {
  const harness = createHarness();
  vm.runInNewContext(read('omega_ui_interaction_guard.js'), harness.context, {
    filename: 'omega_ui_interaction_guard.js'
  });

  const guard = harness.context.window.OmegaUIInteractionGuard;
  assert.ok(guard, 'interaction guard should expose its refresh API');
  assert.equal(guard.version, '2.3.0');

  const targets = [harness.ministry, harness.interrogation, harness.cabinet, harness.command];
  const before = targets.reduce((sum, el) => sum + el.attributeWrites + el.styleWrites, 0);
  guard.refresh();
  guard.refresh();
  const after = targets.reduce((sum, el) => sum + el.attributeWrites + el.styleWrites, 0);
  assert.equal(after, before, 'idempotent refresh must not create another observed DOM mutation');
});

test('interaction guard coalesces relevant mutations and ignores unrelated map churn', () => {
  const harness = createHarness();
  vm.runInNewContext(read('omega_ui_interaction_guard.js'), harness.context, {
    filename: 'omega_ui_interaction_guard.js'
  });
  const observer = harness.getObserver();
  assert.ok(observer, 'guard should observe state changes');

  const initialFrames = harness.frames.size;
  observer.callback([{ type: 'attributes', target: harness.unrelated }]);
  assert.equal(harness.frames.size, initialFrames, 'unrelated map/style changes must not schedule UI work');

  observer.callback([{ type: 'attributes', target: harness.ministry }]);
  observer.callback([{ type: 'attributes', target: harness.command }]);
  assert.equal(harness.frames.size, initialFrames + 1, 'multiple surface changes should share one animation frame');
  const [frameId] = harness.frames.keys();
  harness.runFrame(frameId);
  assert.equal(harness.frames.size, 0);
});

test('large world GeoJSON is rendered incrementally rather than monopolizing the first frame', () => {
  const source = read('map-engine-2.js');
  const start = source.indexOf('Game.Map.renderGeoJSON = function(geoData) {');
  assert.notEqual(start, -1, 'canonical GeoJSON renderer should exist');
  const end = source.indexOf('\n};', start);
  assert.notEqual(end, -1, 'canonical GeoJSON renderer should close');
  const renderer = source.slice(start, end + 3);

  assert.match(renderer, /L\.geoJSON\(null,\s*renderOptions\)/);
  assert.match(renderer, /typeof L\.canvas === ["']function["']/,
    'large country layers should use Leaflet Canvas when supported to avoid SVG DOM/compositing overhead');
  assert.match(renderer, /renderOptions\.renderer = L\.canvas\(\{ padding: 0\.5 \}\)/,
    'the shared Canvas renderer should be attached to the canonical GeoJSON layer options');
  assert.match(renderer, /CHUNK_THRESHOLD\s*=\s*24/);
  assert.match(renderer, /smoothFactor:\s*1\.2/);
  assert.match(renderer, /MAX_FEATURES_PER_FRAME\s*=\s*8/);
  assert.match(renderer, /FRAME_BUDGET_MS\s*=\s*7/);
  assert.match(renderer, /requestAnimationFrame\(addFeatureChunk\)/);
  assert.match(renderer, /layer\.addData\(featureCollection\.features\[nextFeature\]\)/);
  assert.match(renderer, /renderToken !== Game\.__omegaGeoJSONRenderToken/);
  assert.match(renderer, /OMEGAGeographicRegionSystem/);
  assert.match(renderer, /Game\.countryLabels\.length = 0/);
});


test('slow simulation frames and data-heavy ministry panels bound repeated UI work', () => {
  const simulation = read('omega_simulation_runtime.js');
  assert.match(simulation, /MAX_PENDING_REAL_DELTA_MS\s*=\s*STEP_MS/);
  assert.match(simulation, /this\.pendingRealDeltaMs\s*=\s*Math\.min\(MAX_PENDING_REAL_DELTA_MS,\s*this\.pendingRealDeltaMs\s*\+\s*delta\)/);

  const overview = read('omega_country_overview_ministry_ui_v1.js');
  assert.match(overview, /function scheduleOverviewRender\(\)/);
  assert.match(overview, /overviewRenderTimer !== null/);
  assert.match(overview, /OMEGA_SIMULATION_TURN_COMMITTED', scheduleOverviewRender/);

  const resources = read('omega_resource_command_center_ui_v1.js');
  assert.match(resources, /function scheduleVisiblePanelRefresh\(\)/);
  assert.match(resources, /resourceDataWarmupAttempted = false; scheduleVisiblePanelRefresh\(\)/);
  assert.match(resources, /normaliseCountry\(ownCountry\)!==selected/,
    'global site records must be country-filtered before expensive cloning');
  assert.match(resources, /const visibleSites = sites\.slice\(0, 150\)/);

  const serviceWorker = read('omega-offline-map-sw.js');
  const cacheVersion = Number(serviceWorker.match(/CACHE_NAME = "omega-offline-atlas-shell-v(\d+)"/)?.[1] || 0);
  assert.ok(cacheVersion >= 30, 'Android/offline installs must receive the updated anti-hang runtime scripts');
});


test('simulation coordinator throttles asynchronous work and pauses cleanly in the background', () => {
  const root = read('omega_enterprise_composition_root_v10.js');
  assert.match(root, /SIMULATION_FRAME_INTERVAL_MS\\s*=\\s*100/);
  assert.match(root, /MAX_FRAME_DELTA_MS\\s*=\\s*10000/);
  assert.match(root, /async function engineLoop\\(\\)/);
  assert.match(root, /await simulation\\.frame\\(dt\\)/);
  assert.match(root, /scheduleEngineLoop\\(SIMULATION_FRAME_INTERVAL_MS\\)/);
  assert.match(root, /loopInProgress/);
  assert.match(root, /document\\.hidden === true/);
  assert.match(root, /window\\.clearTimeout\\(loopTimerId\\)/);
  assert.doesNotMatch(root, /requestAnimationFrame\\(engineLoop\\)/);
});

test('performance monitor cancels its animation-frame loop while the app is backgrounded', () => {
  const frames = new Map();
  const listeners = new Map();
  let nextFrameId = 1;
  let now = 0;
  const document = {
    hidden: false,
    addEventListener(type, callback) { listeners.set(type, callback); }
  };
  const window = {
    document,
    __OMEGA_DIAG__: { metrics: { fps: 0 } },
    requestAnimationFrame(callback) {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  const context = { window, document, performance: { now: () => now } };

  vm.runInNewContext(read('omega_boot_performance_monitor_v1.js'), context, {
    filename: 'omega_boot_performance_monitor_v1.js'
  });
  assert.equal(frames.size, 1, 'monitor should schedule one frame while visible');

  document.hidden = true;
  listeners.get('visibilitychange')();
  assert.equal(frames.size, 0, 'monitor frame must be cancelled in the background');

  now = 5000;
  document.hidden = false;
  listeners.get('visibilitychange')();
  assert.equal(frames.size, 1, 'monitor should resume once the app is visible');

  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  now += 1000;
  callback(now);
  assert.equal(window.__OMEGA_DIAG__.metrics.fps, 1, 'diagnostic FPS metric should still update');
  assert.equal(frames.size, 1, 'monitor should retain its visible-screen sampling loop');
});
