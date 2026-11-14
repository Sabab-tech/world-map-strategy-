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
  const documentListeners = new Map();
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
    addEventListener(type, callback, options) {
      const listeners = documentListeners.get(type) || [];
      listeners.push({ callback, options });
      documentListeners.set(type, listeners);
    }
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
    context, body, ministry, interrogation, cabinet, command, unrelated, frames, documentListeners,
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
  assert.equal(guard.version, '2.5.0');

  const targets = [harness.ministry, harness.interrogation, harness.cabinet, harness.command];
  const before = targets.reduce((sum, el) => sum + el.attributeWrites + el.styleWrites, 0);
  guard.refresh();
  guard.refresh();
  const after = targets.reduce((sum, el) => sum + el.attributeWrites + el.styleWrites, 0);
  assert.equal(after, before, 'idempotent refresh must not create another observed DOM mutation');
});

test('active OMEGA UI v2 cabinet accepts touch and click events over a visible legacy ministry surface', () => {
  const harness = createHarness();
  harness.cabinet.setAttribute('data-omega-ui-v2-active', 'true');
  const exitButton = new (Object.getPrototypeOf(harness.cabinet).constructor)('v2-exit-button');
  harness.cabinet.appendChild(exitButton);
  vm.runInNewContext(read('omega_ui_interaction_guard.js'), harness.context, {
    filename: 'omega_ui_interaction_guard.js'
  });

  assert.equal(harness.cabinet.getAttribute('aria-hidden'), 'false',
    'the legacy ministry overlay must not mark the active UI v2 cabinet inaccessible');
  assert.equal(harness.ministry.getAttribute('aria-hidden'), 'true',
    'an active UI v2 cabinet must hide the legacy ministry overlay');
  assert.equal(harness.ministry.classList.contains('omega-ui-active'), false,
    'the guard must not keep the legacy dashboard alive through its own visibility class');
  assert.equal(harness.body.classList.contains('omega-ui-v2-cabinet-active'), true,
    'the active host state must be synchronized onto the body');
  const injectedStyles = harness.context.document.getElementById('omega-ui-interaction-guard-v25');
  assert.ok(injectedStyles, 'interaction guard styles should be installed');
  assert.match(injectedStyles.textContent, /#cabinet-full-window\[data-omega-ui-v2-active="true"\]/,
    'active UI v2 cabinet and its controls must override the legacy pointer-event shield');
  assert.match(injectedStyles.textContent, /z-index:2147483000!important/,
    'the active UI v2 cabinet must outrank the legacy dashboard at z-index 9000');
  assert.match(injectedStyles.textContent, /body\.omega-ui-v2-cabinet-active #ministry-dashboard-view\{display:none!important/,
    'the legacy scroll surface must not remain visible above UI v2');

  for (const type of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'mousedown', 'mouseup']) {
    const handler = (harness.documentListeners.get(type) || []).find((entry) => entry.options === true);
    assert.ok(handler, type + ' capture gate should be installed');
    let prevented = false;
    let stopped = false;
    handler.callback({
      target: exitButton,
      preventDefault() { prevented = true; },
      stopImmediatePropagation() { stopped = true; }
    });
    assert.equal(prevented, false, type + ' must reach the active UI v2 control');
    assert.equal(stopped, false, type + ' must not be swallowed by the legacy guard');
  }
});

test('legacy cabinet interactions remain shielded when the new UI is not active', () => {
  const harness = createHarness();
  const legacyButton = new (Object.getPrototypeOf(harness.cabinet).constructor)('legacy-button');
  harness.cabinet.appendChild(legacyButton);
  vm.runInNewContext(read('omega_ui_interaction_guard.js'), harness.context, {
    filename: 'omega_ui_interaction_guard.js'
  });
  const handler = (harness.documentListeners.get('click') || []).find((entry) => entry.options === true);
  assert.ok(handler);
  let prevented = false;
  let stopped = false;
  handler.callback({
    target: legacyButton,
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; }
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(harness.cabinet.getAttribute('aria-hidden'), 'true');
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
  assert.match(source, /isConstrainedDevice\(\)/,
    'low-memory and mobile devices should be detected without hardcoding a device model');
  assert.match(renderer, /smoothFactor:\s*constrainedMapDevice\s*\?\s*1\.5\s*:\s*1\.2/);
  assert.match(renderer, /MAX_FEATURES_PER_FRAME\s*=\s*constrainedMapDevice\s*\?\s*2\s*:\s*10/);
  assert.match(renderer, /FRAME_BUDGET_MS\s*=\s*constrainedMapDevice\s*\?\s*6\s*:\s*8/);
  assert.match(renderer, /progressTime\s*-\s*lastProgressAt\s*>=\s*100/,
    'mobile progress updates should be coalesced rather than writing to the DOM every frame');
  assert.match(source, /RELATION_COUNTRIES_PER_FRAME\s*=\s*this\.isConstrainedDevice\(\)\s*\?\s*1\s*:\s*2/);
  assert.match(renderer, /requestAnimationFrame\(addFeatureChunk\)/);
  assert.match(renderer, /addFeatureSafely\(featureCollection\[nextFeature\],\s*nextFeature\)/,
    'isolated bad country geometry must be caught without abandoning the remaining world features');
  assert.match(renderer, /renderToken !== Game\.__omegaGeoJSONRenderToken/);
  assert.match(renderer, /OMEGAGeographicRegionSystem/);
  assert.match(renderer, /Game\.countryLabels\.length = 0/);
});


test('production shell fully disconnects legacy UI scripts and caches the isolated UI v2 shell', () => {
  const html = read('index.html');
  const server = read('server.js');
  const serviceWorker = read('omega-offline-map-sw.js');
  const isolationCss = read('omega_ui_v2/legacy-disconnect.css');
  const retired = ['omega_ui_system_redesign_v1.js', 'omega_ui_interaction_guard.js', 'omega_ui_button_system_v1.js'];
  for (const script of retired) {
    assert.equal(html.includes('<script src="' + script + '"'), false, script + ' must not be loaded');
    assert.equal(serviceWorker.includes('"./' + script + '"'), false, script + ' must not be precached');
  }
  assert.equal(server.includes('UI_INTERACTION_GUARD_SCRIPT'), false, 'server must not inject the retired click interceptor');
  assert.equal(server.includes('omega_ui_interaction_guard.js'), false, 'server must not inject the retired click interceptor');
  assert.ok(html.includes('omega_ui_v2/legacy-disconnect.css'));
  assert.match(serviceWorker, /CACHE_NAME = "omega-offline-atlas-shell-v\d+"/);
  const coreStart = serviceWorker.indexOf('const CORE_ASSETS');
  const coreEnd = serviceWorker.indexOf('];', coreStart);
  const coreAssets = serviceWorker.slice(coreStart, coreEnd);
  assert.ok(coreAssets.includes('"./omega_ui_v2/legacy-disconnect.css"'));
  assert.ok(isolationCss.includes('#ministry-dashboard-view'));
  assert.ok(isolationCss.includes('display: none !important'));
  assert.ok(isolationCss.includes('z-index: 2147483000 !important'));
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
  assert.ok(cacheVersion >= 34, 'Android/offline installs must receive the active interaction-guard runtime');
});



test('UI v2 screen transitions schedule heavy rendering after paint and cancel stale idle work', () => {
  const app = read('omega_ui_v2/app.js');
  assert.match(app,/function requestIdleFrame\(callback, timeoutMs\)/);
  assert.match(app,/g\.requestIdleCallback\(callback, \{ timeout:Math\.max\(50, Number\(timeoutMs\) \|\| 140\) \}\)/);
  assert.match(app,/handle\.kind === 'idle' && typeof g\.cancelIdleCallback === 'function'/,
    'a newer navigation must cancel a queued idle render');
  assert.match(app,/var second = requestIdleFrame\(function \(\)/,
    'the screen should yield after its loading shell has painted');
  assert.match(app,/state\.navigationGeneration === generation/,
    'stale queued renders must not replace a newer destination');
  assert.match(app,/rotateScreenWork\(state\)/,
    'leaving a screen must abort its old asynchronous work');
});


test('simulation coordinator throttles asynchronous work and pauses cleanly in the background', () => {
  const root = read('omega_enterprise_composition_root_v10.js');
  assert.match(root, /SIMULATION_FRAME_INTERVAL_MS\s*=\s*250/);
  assert.match(root, /MAX_FRAME_DELTA_MS\s*=\s*15000/);
  assert.match(root, /async function engineLoop\(\)/);
  assert.match(root, /await simulation\.frame\(dt\)/);
  assert.match(root, /scheduleEngineLoop\(SIMULATION_FRAME_INTERVAL_MS\)/);
  assert.match(root, /loopInProgress/);
  assert.match(root, /document\.hidden === true/);
  assert.match(root, /function simulationIsRunning\(\)/,
    'the main coordinator must gate background work on the authoritative session state');
  assert.match(root, /!simulationIsRunning\(\)/);
  assert.match(root, /simulationRuntime\.events\.subscribe\("OMEGA_GAME_SESSION_STARTED"/);
  assert.match(root, /simulationRuntime\.events\.subscribe\("OMEGA_GAME_SESSION_RESUMED"/);
  assert.match(root, /simulationRuntime\.events\.subscribe\("OMEGA_GAME_SESSION_PAUSED"/);
  assert.match(root, /if \(simulationIsRunning\(\)\) scheduleEngineLoop\(SIMULATION_FRAME_INTERVAL_MS\)/,
    'paused sessions must not reschedule the 250 ms coordinator timer');
  assert.match(root, /window\.clearTimeout\(loopTimerId\)/);
  assert.doesNotMatch(root, /requestAnimationFrame\(engineLoop\)/);
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

test('map and ministry rendering stay responsive and scoped to the selected country', () => {
  const map = read('map-engine-2.js');
  const countryRuntime = read('omega_country_runtime_data_v1.js');
  const resourceScreen = read('omega_ui_v2/screens/resource-ministry.js');
  const resourceBinding = read('omega_resource_gameplay_binding_v1.js');
  const uiIntegration = read('omega_ui_v2/integration.js');
  const mapController = read('map-engine-1.js');
  const uiApp = read('omega_ui_v2/app.js');
  const industry = read('omega_ui_v2/screens/industry.js');
  const economy = read('omega_ui_v2/screens/economy.js');
  const reports = read('omega_ui_v2/screens/reports.js');

  assert.ok(mapController.includes('const selectedContextCode = identity && (identity.iso3 || identity.alpha3 || identity.cca3 || identity.countryIso3 || identity.countryCode) || null;'),
    'the map selection controller must store the country ISO3 as the canonical ministry context, not ISO2');
  assert.ok(uiIntegration.includes('function canonicalCountry(value)'),
    'map and legacy country aliases must resolve to one ISO3 identity before ministry mounting');
  assert.ok(uiIntegration.includes('var country = canonicalCountry(mountOptions.countryId || selectedCountry() || \'\')'));
  assert.ok(uiIntegration.includes('var ids = [], seen = Object.create(null), labels = Object.create(null), aliasToIso3 = Object.create(null)'));
  assert.ok(uiIntegration.includes('profiles.forEach(registerProfileAliases)'));
  assert.ok(uiIntegration.includes('var code = aliasToIso3[key] || canonicalCountry(raw)'),
    'the country selector must canonicalize ISO2, ISO3, numeric and display-name aliases before de-duplication');
  assert.ok(uiIntegration.includes('if (!seen[code]) { seen[code] = true; ids.push(code); }'),
    'each canonical ISO-3 country must appear exactly once in the selector');
  assert.ok(uiApp.includes('countryId:canonicalCountry(options.countryId || currentCountry() || \'\')'));
  assert.ok(industry.includes('function countryAliases(value)'));
  assert.ok(economy.includes('function countryAliases(value)'));
  assert.ok(reports.includes('function countryAliases(value)'),
    'country-name keyed economy buckets must resolve from the selected ISO3 country');
  assert.ok(map.includes('generateAllBilateralRelations(countrySubset)'),
    'relation generation must support a small source-country slice');
  assert.ok(map.includes('RELATION_COUNTRIES_PER_FRAME = this.isConstrainedDevice() ? 1 : 2'));
  assert.ok(map.includes('generateAllBilateralRelations(chunk)'));
  assert.ok(map.includes('allCountries.forEach(c2 => {'),
    'each selected source country still calculates relations to the complete country roster');
  assert.ok(map.includes('color: "#f4f8ff"') && map.includes('opacity: 1.0') &&
    map.includes('weight: currentZoom > 5.5 ? 1.7 : 1.45'),
    'country outlines must remain visible on the map basemap through zoom changes');
  assert.ok(map.includes("color: '#f4f8ff', weight: 1.45, opacity: 1.0"),
    'diplomacy overlays must preserve opaque, high-contrast country outlines');
  assert.ok(map.includes('countryRuntime.getCities(countryName)'),
    'city rendering must ask for the selected country, not all country city records');
  assert.ok(map.includes("this.activeResourceFilter = 'NONE';"),
    'leaving resource mode must restore city markers');
  assert.ok(countryRuntime.includes("add(row.capital,'capital')"));
  assert.ok(countryRuntime.includes("add(row.economic,'economic')"));
  assert.ok(countryRuntime.includes("add(row.military,'military')"));
  assert.ok(countryRuntime.includes("add(row.secret,'secret')"));
  assert.ok(map.includes("state.scope = countrySelected ? 'NATION' : (configuredScope === 'WORLD' ? 'WORLD' : 'NATION')"),
    'resource mode must not switch to global scope merely because no country has been selected');
  assert.ok(map.includes('individualSiteBinding || window.__OMEGA_RESOURCE_SITE_BINDING_INIT__'),
    'the legacy deposit renderer must not scan the global list while the country-scoped binding owns the map');
  assert.ok(map.includes('if (this.hubsGroupLayer && typeof this.hubsGroupLayer.clearLayers === \'function\')'),
    'city markers must be cleared immediately, even while resource-site loading is still in progress');
  assert.ok(resourceBinding.includes('async function discoverSourceSites(root)'),
    'large source discovery must yield rather than monopolize the WebView');
  assert.ok(resourceBinding.includes('visited%400===0)await yieldResourceWorkToUi()'));
  assert.ok(resourceBinding.includes('candidateIndex%300===0)await yieldResourceWorkToUi()'));
  assert.ok(resourceBinding.includes('await rebuildSiteIndexes()'));
  assert.ok(resourceBinding.includes('collectVisibleSites(sitesForCountry(activeCountry),bounds,matchesResource,MAX_MAP_RESOURCE_MARKERS)'),
    'nation scope must render only the selected country');
  assert.ok(resourceBinding.includes('sitesInCurrentViewport(map,bounds,matchesResource,MAX_MAP_RESOURCE_MARKERS)'),
    'world scope must use spatial buckets and a bounded marker set');
  assert.ok(resourceBinding.includes('function refreshSiteSelectorForCountry(value)'));
  assert.ok(!resourceBinding.includes('selectNode.innerHTML=sites.map(s=>'),
    'the site selector must not allocate a DOM option for every global site');
  assert.ok(resourceBinding.includes("new g.CustomEvent('OMEGA_RESOURCE_SITE_BINDING_READY'"),
    'the runtime readiness event must remain intact for extraction and factory systems');
  assert.ok(resourceScreen.includes('function sourceCatalogs(selectedCountry)'));
  assert.ok(resourceScreen.includes('if (countryId(sites[i]) === countryFilter)'),
    'country filtering must happen before global catalogue deduplication/sorting');
  assert.ok(resourceScreen.includes('uniqueSiteRows(providedRows.filter(function (row) { return countryId(row) === selectedCountry; }))'));
});

test('country borders stay visible in base map and visual overlays', () => {
  const map = read('map-engine-2.js');
  const worker = read('omega-offline-map-sw.js');
  const cacheVersionMatch = worker.match(/CACHE_NAME = "omega-offline-atlas-shell-v(\d+)"/);
  const cacheVersion = Number(cacheVersionMatch?.[1] || 0);
  assert.ok(cacheVersion >= 54, 'offline Android clients must invalidate cached map lifecycle and border fixes');
  assert.ok(map.includes('color:"#f4f8ff",\n        weight:zoom >= 8 ? 2.1 : (zoom >= 5 ? 1.7 : 1.45),\n        opacity:1,'),
    'base country polygons need opaque, high-contrast borders');
  assert.ok(map.includes('weight: currentZoom > 5.5 ? 1.7 : 1.45'),
    'zoom changes must not make country borders too thin');
  assert.ok(map.includes("if (hasResource) layer.setStyle({ fillColor: '#ca8a04', fillOpacity: 0.85, color: '#f4f8ff', weight: 1.7, opacity: 1.0 });"),
    'countries with resource data must retain a visible border');
  assert.ok(map.includes("else layer.setStyle({ fillColor: '#0f172a', fillOpacity: 0.15, color: '#f4f8ff', weight: 1.45, opacity: 1.0 });"),
    'countries without resource data must retain a visible border too');
  assert.ok(map.includes("layer.setStyle({ fillColor: color, fillOpacity: opacity, color: '#f4f8ff', weight: 1.45, opacity: 1.0 });"),
    'diplomacy overlay must not replace borders with nearly transparent strokes');
  assert.ok(map.includes("color: '#f4f8ff',\n            weight: 1.45,\n            opacity: 1.0"),
    'country metric overlays must preserve high-contrast outlines too');
  assert.ok(!map.includes('rgba(255,255,255,0.05)') && !map.includes('rgba(255,255,255,0.1)'),
    'map overlays must not use the old almost-invisible border styles');
});

test('late economy baseline fills missing values without replacing live factory state', () => {
  const source = read('map-engine-2.js');
  const economyDataset = source.indexOf("filename: 'economy.json'");
  const nextDataset = source.indexOf("filename: 'relation_generation_engine.json'", economyDataset);
  assert.notEqual(economyDataset, -1, 'startup must retain the economy baseline dataset');
  assert.ok(nextDataset > economyDataset, 'economy data must be applied before relation data');
  const economyHydration = source.slice(economyDataset, nextDataset);
  assert.match(economyHydration, /mergeEconomyBaseline\(liveEconomy, data\)/,
    'late economy startup data must merge into the live registry');
  assert.doesNotMatch(economyHydration, /Game\.state\.economy\s*=\s*data/,
    'startup JSON must not replace an already-running economy registry');

  const start = source.indexOf('function mergeEconomyBaseline(');
  assert.notEqual(start, -1, 'map startup must merge static economy data into the live runtime registry');
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, 'economy baseline merge helper must be a complete function');
  const helperSource = source.slice(start, end + 2);
  const sandbox = {};
  vm.runInNewContext(helperSource + '\nthis.mergeEconomyBaseline=mergeEconomyBaseline;', sandbox, {
    filename: 'map-engine-2.js#mergeEconomyBaseline'
  });

  const productionAssets = [{ id:'FAC:BGD:UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT:T0:P1', status:'OPERATIONAL' }];
  const bgd = { productionAssets, treasury:900, gdp:1200, settings:{ taxRate:15, runtimeFlag:true } };
  const legacyBangladesh = { gdp:700, ai:'survival' };
  const liveEconomy = { BGD:bgd, BANGLADESH:legacyBangladesh };
  const baseline = {
    BGD:{ gdp:1000, stock:{ food:100, oil:80 }, settings:{ taxRate:5, baselineFlag:true } },
    BANGLADESH:{ gdp:650, ai:'greedy', stock:{ food:90 } },
    IND:{ gdp:500, debt:25 }
  };

  const merged = sandbox.mergeEconomyBaseline(liveEconomy, baseline);
  assert.equal(merged, liveEconomy, 'a live economy object must be merged in place');
  assert.equal(merged.BGD, bgd, 'the player country bucket reference must remain stable');
  assert.equal(merged.BGD.productionAssets, productionAssets, 'live factory assets must not be replaced');
  assert.equal(merged.BGD.productionAssets[0].id, 'FAC:BGD:UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT:T0:P1');
  assert.equal(merged.BGD.treasury, 900, 'runtime treasury must win over baseline values');
  assert.equal(merged.BGD.gdp, 1200, 'existing live GDP must not be overwritten');
  assert.equal(merged.BGD.stock.food, 100, 'existing nested runtime inventory must be preserved');
  assert.equal(merged.BGD.stock.oil, 80, 'missing baseline nested defaults must be filled');
  assert.equal(merged.BGD.settings.taxRate, 15, 'existing nested policy values must be preserved');
  assert.equal(merged.BGD.settings.baselineFlag, true, 'missing nested baseline metadata must be filled');
  assert.equal(merged.BANGLADESH, legacyBangladesh, 'legacy alias bucket identity must remain stable');
  assert.equal(merged.BANGLADESH.gdp, 700, 'legacy alias runtime values must win');
  assert.equal(merged.IND.gdp, 500, 'new country baseline buckets must still be added');
});

test('world geometry becomes usable before supporting datasets and resumes without reset', () => {
  const map = read('map-engine-2.js');
  const html = read('index.html');
  const css = read('style.css');
  const designTokens = read('design-tokens.js');
  const integration = read('omega_ui_v2/integration.js');
  const resourceBinding = read('omega_resource_gameplay_binding_v1.js');
  const worker = read('omega-offline-map-sw.js');
  const coreAssets = worker.slice(worker.indexOf('const CORE_ASSETS'), worker.indexOf('];', worker.indexOf('const CORE_ASSETS')));
  const coreAssetPaths = Array.from(coreAssets.matchAll(/"([^"]+)"/g), function (match) { return match[1]; });
  assert.equal(new Set(coreAssetPaths).size, coreAssetPaths.length,
    'offline install must not fetch the same precache asset twice');
  const shellScripts = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/g), function (match) { return match[1]; });
  assert.equal(new Set(shellScripts).size, shellScripts.length,
    'the production shell must not register duplicate runtime scripts');
  const loaderStart = map.indexOf('async loadAssets()');
  const loaderEnd = map.indexOf('\n    }\n};\nGame.LabelSystem', loaderStart);
  const startup = map.slice(loaderStart, loaderEnd);
  const worldStart = startup.indexOf('await loader.loadWorldMap(fetcher)');
  const renderGate = startup.indexOf('await loader.waitForWorldMapRender()');
  const firstSupportData = startup.indexOf("filename: 'population.json'");
  const worldLoaderStart = map.indexOf('loadWorldMap(fetcher) {');
  const worldLoaderEnd = map.indexOf('async loadAssets()', worldLoaderStart);
  const worldLoader = map.slice(worldLoaderStart, worldLoaderEnd);

  assert.ok(loaderStart >= 0 && loaderEnd > loaderStart, 'the canonical startup coordinator should exist');
  assert.ok(worldStart >= 0 && renderGate > worldStart && firstSupportData > renderGate,
    'no supporting dataset may start until the world map has finished rendering');
  assert.ok(startup.indexOf('await loader.loadCountryConfig(fetcher)') > renderGate &&
    startup.indexOf('await loader.loadCountryConfig(fetcher)') < firstSupportData,
    'country metadata must get its ordered post-map recovery attempt before supporting datasets');
  assert.ok(startup.includes('Game.Map.refreshCountryPolygonStyles()'),
    'successful late country metadata recovery must restyle the already-rendered country polygons');
  assert.match(startup, /Promise\.all\(startupDatasets\.map\(function \(item, index\)/,
    'independent supporting files must load concurrently instead of serial network round trips');
  assert.match(startup, /const startupData = await Promise\.all\([\s\S]*?startupData\[index\]/,
    'parallel supporting data must be applied deterministically in declared source order');
  assert.match(startup, /await Promise\.resolve\(Game\.Diplomacy\.generateAllBilateralRelations\(chunk\)\)/,
    'relation-generation chunks must finish before the next chunk or finalization starts');
  assert.doesNotMatch(startup, /setTimeout\(processRelationChunk/,
    'relation generation must not escape into an unawaited background task');
  assert.match(startup, /if \(this\.__assetsLoadPromise\) return this\.__assetsLoadPromise/,
    'concurrent startup requests must share one in-flight coordinator');
  assert.match(worldLoader, /const countriesPromise = this\.loadCountryConfig\(fetcher\);[\s\S]*?return fetcher\('world\.json'/,
    'country identity and world geometry should load concurrently under one shared world loader');
  assert.doesNotMatch(worldLoader, /await countriesPromise/,
    'world geometry must not wait for the independent country roster request');

  assert.ok(map.includes("return fetcher('world.json', {"),
    'world geometry must use the abortable data loader');
  assert.ok(map.includes("onProgress:function (ratio, received, total)"),
    'the map download progress must be based on transferred bytes');
  assert.ok(designTokens.includes("response.body.getReader()") && designTokens.includes("onProgress(total > 0 ? 0 : null, 0, total)"),
    'the shared resilient fetch must report actual streaming progress rather than a timer estimate');
  assert.ok(html.includes('id="omega-map-load-overlay"') && html.includes('id="omega-map-load-progress"') &&
    html.includes('id="omega-map-load-percent"'),
    'the startup progress overlay and proportional bar must exist in the production shell');
  assert.ok(coreAssets.includes('"./design-tokens.js"'),
    'offline relaunch must include the abortable streaming fetch helper needed by map startup');
  assert.ok(css.includes('#render-engine-root[data-omega-map-loading="true"] { z-index:2000'),
    'the real startup loader must sit above map controls until initialization settles');
  assert.ok(map.includes('waitForWorldMapRender()') && map.includes('settleWorldMapRenderWaiters(null, renderToken)'),
    'the support pipeline must wait for the final incremental GeoJSON render frame');
  assert.ok(map.includes('settleWorldMapRenderWaiters(new Error'),
    'a failed render must release the waiter with an explicit failure instead of leaving startup stuck');
  assert.ok(map.includes('this.__assetsLoadPromise = promise') && map.includes('__assetsLoadComplete'),
    'the complete startup pipeline must be single-flight and reusable after success');
  assert.ok(map.includes('Game.DataLoader.loadAssets();'),
    'map retry must resume the full staged startup sequence rather than only redrawing the map');
  const setUiActiveStart = map.indexOf('Game.Map.setUiActive = function(active)');
  const setUiActiveEnd = map.indexOf('Game.Map.getCountryPolygonStyle = function', setUiActiveStart);
  const setUiActive = map.slice(setUiActiveStart, setUiActiveEnd);
  assert.ok(setUiActiveStart >= 0 && setUiActiveEnd > setUiActiveStart);
  assert.doesNotMatch(setUiActive, /__omegaWorldMapAbortController\.abort\(\)|map\.removeLayer\(/,
    'switching away from the map must preserve in-flight geometry, Leaflet layers and render cursor');
  assert.ok(setUiActive.includes('root.style.display = this.__omegaMapRootDisplay') &&
    setUiActive.includes('Game.__omegaGeoJSONRenderPaused = true'),
    'map navigation should park the map view and pause only its frame work');
  const abortResumeStart = map.indexOf('const retryWorldMapAfterAbort = function ()');
  const abortResumeEnd = map.indexOf('    return true;', abortResumeStart);
  const abortResume = map.slice(abortResumeStart, abortResumeEnd);
  assert.ok(abortResume.includes('loader.loadAssets();'),
    'returning from a ministry after an aborted map fetch must restart the full startup pipeline');
  const abortRetrySchedulingStart = map.indexOf('if (pendingWorldLoad && abortedWorldController?.signal?.aborted === true)', abortResumeStart);
  const abortRetryScheduling = map.slice(abortRetrySchedulingStart, abortResumeEnd);
  assert.match(abortRetryScheduling, /pendingWorldLoad\.then\(function \(\) \{[\s\S]*?setTimeout\(retryWorldMapAfterAbort, 0\)/,
    'the full startup retry must wait until the aborted map request releases its single-flight lock');
  assert.ok(map.includes("startupLoader.__assetsLoadingStatus === 'loading'"),
    'map activation must restore the active startup-stage progress after a ministry pause');
  assert.match(map, /Math\.min\(45, 2 \+ rawPercent \* 0\.43\)/,
    'map rendering progress must reserve the first 45 percent of the full startup bar');
  assert.ok(startup.includes('const supportStageStart = 46') && startup.includes('const supportStageSpan = 35'),
    'supporting datasets must retain their weighted startup progress stage');
  assert.ok(startup.includes('82 + relationProgress * 16'),
    'awaited relation generation must occupy the final pre-completion progress stage');
  assert.ok(map.includes('Game.Map.setUiActive = function(active)'));
  assert.ok(map.includes('if (Game.__omegaGeoJSONRenderComplete === true) return this.__assetsLoadingProgress;'),
    'support-stage progress must not reopen the blocking map overlay after geometry is ready');
  assert.ok(map.includes('const mapGeometryReady = Game.__omegaGeoJSONRenderComplete === true;') &&
    map.includes("status === 'complete' && !mapGeometryReady ? 'loading' : status"),
    'map completion must remain complete even while the overall supporting-data coordinator is still active');
  const simulation = read('omega_simulation_runtime.js');
  const driver = read('omega_enterprise_composition_root_v10.js');
  const resourceEconomy = read('omega_resource_economy_runtime_v2.js');
  assert.ok(simulation.includes('const STEP_MS=15000;') && driver.includes('SIMULATION_FRAME_INTERVAL_MS = 250'),
    'authoritative turns must advance every fifteen real seconds without polling every second');
  assert.ok(resourceEconomy.includes('function runResourceEconomyTurnParticipant()') &&
    resourceEconomy.includes('g.Game&&g.Game.Map&&g.Game.Map.__omegaMapUiActive===true)return;'),
    'economic calculations stay in the committed turn participant while resource UI repaint pauses on the map');
  const financeRuntime = read('omega_finance_ministry_runtime_v1.js');
  const forexRuntime = read('omega_forex_monetary_engine_v1.js');
  const bankingRuntime = read('omega_government_banking_runtime_v1.js');
  const transmissionRuntime = read('omega_economic_transmission_runtime_v1.js');
  const worldBankRuntime = read('omega_world_bank_lending_runtime_v1.js');
  const analyticsRuntime = read('omega_finance_analytics_runtime_v1.js');
  const resourceMinistry = read('omega_ui_v2/screens/resource-ministry.js');
  assert.ok(financeRuntime.includes('global.Game.Map.__omegaMapUiActive === true) return;') &&
    financeRuntime.includes('advanceTurn(turn,duration);'),
    'finance calculations continue while hidden Finance Ministry metrics stop repainting');
  assert.ok(forexRuntime.includes('global.Game.Map.__omegaMapUiActive === true) return;') &&
    forexRuntime.includes('simulationTick(turn, duration);'),
    'currency and FX calculations continue while the hidden FX panel stops repainting');
  assert.ok(bankingRuntime.includes('g.Game.Map.__omegaMapUiActive === true) return;') &&
    bankingRuntime.includes('processPendingTransfers();') && bankingRuntime.includes('revalueOrReconcileAll();'),
    'bank transfers and reconciliation continue while the hidden banking panel stops repainting');
  assert.ok(transmissionRuntime.includes('g.Game.Map.__omegaMapUiActive === true) return;') &&
    transmissionRuntime.includes('step(t,dt);'),
    'economic transmission calculations continue while its hidden chart panel stops repainting');
  assert.ok(worldBankRuntime.includes('global.Game.Map.__omegaMapUiActive === true) return false;') &&
    worldBankRuntime.includes('processTurn(turn, stepDurationMs);') &&
    worldBankRuntime.includes('serviceCountryLoansOnTurn(turn, stepDurationMs);'),
    'World Bank debt service and country loan processing continue while its hidden panel stops repainting');
  assert.ok(analyticsRuntime.includes('g.Game&&g.Game.Map&&g.Game.Map.__omegaMapUiActive===true)return;') &&
    analyticsRuntime.includes('appendCountryTurn(profiles[index],job.turn);'),
    'country analytics records continue to calculate while hidden graphs stop repainting');
  assert.ok((resourceMinistry.match(/g.Game && g.Game.Map && g.Game.Map.__omegaMapUiActive === true\) return;/g)||[]).length >= 2,
    'Resource Ministry event and minute refreshes must pause while the map is active');
  assert.ok(map.includes('const cachedGeometry = Game.Map.countryGeoJSON || Game.__omegaGeoJSONPendingData'),
    'map activation must reuse already downloaded country geometry');
  assert.ok(map.includes('Game.__omegaGeoJSONRenderComplete === true && Game.Map.countryGeoJSON && Game.geojsonLayer'),
    'a completed map must remain a reusable cached surface across navigation');
  assert.ok(abortRetryScheduling.includes('pendingWorldLoad.then(function ()'),
    'returning while the initial world request is aborting must defer the full startup retry until request cleanup');
  assert.ok(map.includes('Game.__omegaGeoJSONResumeRender = scheduleFeatureChunk'),
    'incomplete geometry must resume from its existing feature cursor, not restart from zero');
  assert.ok(map.includes('Game.__omegaGeoJSONRenderComplete === true && Game.Map.countryGeoJSON && Game.geojsonLayer'),
    'a completed world layer must be reused rather than downloaded or parsed again');
  assert.ok(map.includes('Game.Map.refreshCountryPolygonStyles = function()'),
    'late country metadata must restyle the existing geometry without a second GeoJSON pass');
  assert.ok(integration.includes('g.Game.Map.setUiActive(false)') && integration.includes('g.Game.Map.setUiActive(true)'),
    'opening a ministry must suspend map presentation and returning must resume its cached layers');
  assert.ok(!integration.includes("worldUi.style.opacity = '0.5'"),
    'the map and ministry must never be shown as one half-transparent composite');
  assert.ok(resourceBinding.includes('if(g.Game?.Map?.__omegaMapUiActive===false)return;'),
    'resource markers must not redraw during ministry navigation');
});



test('universal action progress covers legacy controls, mining actions and resource command center; map retry reuses cached geography', () => {
  const html = read('index.html');
  const worker = read('omega-offline-map-sw.js');
  const progress = read('omega_action_progress_v1.js');
  const map = read('map-engine-2.js');
  const mine = read('omega_resource_mine_management_v1.js');
  const commandCenter = read('omega_resource_command_center_ui_v1.js');
  const coreAssets = worker.slice(worker.indexOf('const CORE_ASSETS'), worker.indexOf('];', worker.indexOf('const CORE_ASSETS')));

  assert.ok(html.includes('<script src="omega_action_progress_v1.js" defer></script>'),
    'the universal action loader must be loaded by the production shell');
  const shellVersion = Number(worker.match(/CACHE_NAME = "omega-offline-atlas-shell-v(\d+)"/)?.[1] || 0);
  assert.ok(shellVersion >= 79, 'the offline shell cache must invalidate older assets for the new loader');
  assert.ok(coreAssets.includes('"./omega_action_progress_v1.js"'),
    'the universal action loader must work after offline relaunch');
  assert.ok(progress.includes('setProgress:') && progress.includes('setPhase:') &&
    progress.includes('async function run(') && progress.includes('bindGenericActionWatchers'),
    'the shared loader must expose operation phases, measured progress and generic legacy-action coverage');
  assert.ok(mine.includes('progress.run(title') && mine.includes('actionProgress.setProgress'),
    'mine construction, extraction, factory cycles and batched country production must use shared progress');
  assert.ok(commandCenter.includes("progress.run('Resource command · ' + label"),
    'resource command-center actions must use the same shared loader');

  assert.ok(map.includes('waitForMapRenderer(controller)') && map.includes('MAP_RENDERER_NOT_READY'),
    'map rendering must wait for Leaflet and the map surface to become ready');
  assert.ok(map.includes('const cachedGeometry = Game.Map.countryGeoJSON || Game.__omegaGeoJSONPendingData'),
    'retry must reuse the downloaded GeoJSON instead of forcing the same network request again');
  assert.ok(map.includes('handleWorldMapRenderFailure') && map.includes('Downloaded geography is retained'),
    'map failures must identify the renderer stage and preserve cached geography');
  assert.ok(map.includes('Country boundary chunk failed.'),
    'asynchronous feature-render exceptions must be caught instead of silently stranding the progress bar');
  assert.ok(map.includes('Skipping malformed country geometry.') && map.includes('WORLD_FEATURE_RENDER_FAILURE_RATE'),
    'a small number of bad country features should be isolated, while widespread render failures get a diagnostic');
});
