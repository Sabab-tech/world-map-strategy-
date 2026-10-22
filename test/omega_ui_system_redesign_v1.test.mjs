import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('redesign styles load after every legacy UI stylesheet', () => {
  const html = read('index.html');
  const css = html.indexOf('omega_ui_system_redesign_v1.css');
  assert.ok(css >= 0, 'the additive redesign stylesheet must be linked');
  assert.ok(css < html.indexOf('</head>'), 'the stylesheet must load in the document head');
  assert.ok(css > html.indexOf('omega_ministry_layout_repair_v1.css'), 'redesign must be the final style authority');
});

test('redesign runtime loads after gameplay runtimes without replacing them', () => {
  const html = read('index.html');
  const runtime = html.indexOf('src="omega_ui_system_redesign_v1.js"');
  assert.ok(runtime >= 0, 'viewport runtime must be linked');
  assert.ok(runtime > html.indexOf('omega_home_ministry_police_capability_runtime_v1.js'));
  assert.match(html.slice(runtime - 24, runtime + 100), /defer/);
  for (const required of [
    'map-engine-1.js',
    'map-engine-2.js',
    'omega_finance_ministry_runtime_v1.js',
    'omega_home_ministry_engine_v1.js',
    'omega_resource_gameplay_binding_v1.js'
  ]) {
    assert.ok(html.includes(required), `existing engine reference was lost: ${required}`);
  }
});

test('viewport and panel layout stay bounded and scroll within their own surfaces', () => {
  const css = read('omega_ui_system_redesign_v1.css');
  for (const rule of [
    '--omega-app-height:',
    'height: var(--omega-app-height) !important',
    '#ministry-dashboard-content',
    '#cabinet-full-window #cabinet-body',
    'overflow-y: auto !important',
    'overscroll-behavior: contain',
    'env(safe-area-inset-bottom',
    '@media (max-width: 760px)',
    '#rotate-warning { display: none !important; }'
  ]) {
    assert.ok(css.includes(rule), `missing responsive layout rule: ${rule}`);
  }
  assert.match(css, /max-height: calc\(var\(--omega-app-height\) - 72px\) !important/);
  assert.match(css, /\.ui-bottom-navigation \.nav-btn\.active/);
});

test('future-facing and existing core controls stay in the markup', () => {
  const html = read('index.html');
  for (const id of [
    'btn-ministry-dock',
    'btn-quick-search',
    'btn-quick-events',
    'btn-quick-layers',
    'btn-resource-mode',
    'btn-card-cabinet',
    'btn-card-diplomacy',
    'btn-card-military',
    'btn-card-economy',
    'btn-card-intel',
    'btn-close-cabinet',
    'btn-chapter-next',
    'btn-advisor-execute'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `existing control must remain: ${id}`);
  }
});

test('runtime exposes a read-only UI audit and uses Visual Viewport updates', () => {
  const js = read('omega_ui_system_redesign_v1.js');
  assert.match(js, /global\.visualViewport/);
  assert.match(js, /--omega-app-height/);
  assert.match(js, /OMEGAUiSystem/);
  assert.match(js, /controlsWithoutAccessibleName/);
  assert.match(js, /function closeTopSurface/);
  assert.match(js, /event\.key !== 'Escape'/);
});

test('map ministry entry is outside map stacking and has independent click recovery', () => {
  const html = read('index.html');
  const navStart = html.indexOf('<nav id="omega-ministry-entry" class="ui-bottom-navigation omega-ministry-entry"');
  assert.ok(navStart >= 0, 'the standalone ministry entry remains in the page');
  const uiRootStart = html.indexOf('<div id="ui-engine-root">');
  const rootCloseMatch = /<\/div>\s*<!-- Independent ministry entry/.exec(html);
  const rootEndMarker = rootCloseMatch ? rootCloseMatch.index : -1;
  assert.ok(uiRootStart >= 0 && rootEndMarker > uiRootStart && navStart > rootEndMarker,
    'the entry is moved after the map UI root');
  const buttonStart = html.indexOf('id="btn-ministry-dock"', navStart);
  const buttonEnd = html.indexOf('</button>', buttonStart);
  assert.ok(buttonStart > navStart && buttonEnd > buttonStart, 'the ministry button is inside the standalone nav');
  assert.match(html.slice(buttonStart, buttonEnd), /OMEGAMinistryDock/, 'markup keeps a direct recovery fallback');

  const mapEngine = read('map-engine-1.js');
  assert.doesNotMatch(mapEngine, /const btnMinistryDock\s*=\s*document\.getElementById\(['"]btn-ministry-dock['"]\)/,
    'map engine must not register a second ministry-dock route');

  const display = read('display_and_layer_system.js');
  assert.ok(display.includes("bindDockBtn('btn-ministry-dock', window.openMainMinistryView)"),
    'legacy semantic click binding remains available as a fallback');

  const runtime = read('omega_ui_system_redesign_v1.js');
  assert.ok(runtime.includes("addEventListener('click', handleMapMinistryDockClick, true)"),
    'late-loaded recovery listens in document capture phase');
  assert.ok(runtime.includes('function openCabinet(event)'));
  assert.ok(runtime.includes('manager.setLayer(1)'));
  assert.ok(runtime.includes('data-last-open-result'));
  assert.ok(runtime.includes("function syncDockPosition()"));
  assert.ok(runtime.includes("rect.bottom + 8"));
  assert.ok(runtime.includes("new global.ResizeObserver(syncDockPosition)"),
    'button placement follows the status header when it wraps on mobile');
  assert.ok(runtime.includes("data-omega-map-active"));
  assert.ok(!runtime.includes("dock.style.display = onMap ? 'flex' : 'none'"),
    'returning to the map must not depend on clearing a sticky inline display style');

  const css = read('omega_ui_system_redesign_v1.css');
  assert.ok(css.includes('.omega-ministry-entry.ui-bottom-navigation'));
  assert.ok(css.includes('z-index: 2147483000 !important'),
    'the entry is above the map renderer and its interaction layers');
});

function createMinistryNavigationHarness({ withLayerManager = true } = {}) {
  const listeners = {};
  const calls = [];
  const rendered = [];
  const bodyAttributes = {};
  const bodyClasses = new Set();
  const dashboardAttributes = {};
  const dashboardClasses = new Set();
  const dashboard = {
    isConnected: true,
    style: { display: 'none', visibility: 'hidden', opacity: '0', zIndex: '0' },
    classList: { add: (name) => dashboardClasses.add(name), remove: (name) => dashboardClasses.delete(name) },
    setAttribute: (name, value) => { dashboardAttributes[name] = value; },
    getBoundingClientRect() {
      const visible = this.style.display !== 'none' && this.style.visibility !== 'hidden' && this.style.opacity !== '0';
      return visible ? { width: 360, height: 640 } : { width: 0, height: 0 };
    }
  };
  const cabinet = {
    isConnected: true,
    style: { display: 'flex', visibility: 'visible', opacity: '1' },
    setAttribute() {},
    contains: () => true,
    getBoundingClientRect: () => ({ width: 360, height: 640 })
  };
  const card = {
    dataset: { ministryId: 'finance' },
    getAttribute(name) { return name === 'data-ministry-id' ? this.dataset.ministryId : null; }
  };
  const body = {
    classList: {
      add(name) { bodyClasses.add(name); },
      remove(name) { bodyClasses.delete(name); },
      toggle(name, value) { if (value) bodyClasses.add(name); else bodyClasses.delete(name); }
    },
    setAttribute(name, value) { bodyAttributes[name] = value; }
  };
  const document = {
    readyState: 'loading',
    documentElement: { style: { setProperty() {} }, dataset: {} },
    body,
    addEventListener(type, handler, capture) {
      if (type === 'click' && capture === true) {
        if (!listeners.click) listeners.click = [];
        listeners.click.push(handler);
      }
    },
    getElementById(id) {
      if (id === 'ministry-dashboard-view') return dashboard;
      if (id === 'cabinet-full-window') return cabinet;
      return null;
    }
  };
  const context = {
    document,
    console: { log() {}, warn() {}, error() {}, info() {} },
    getComputedStyle(element) {
      return {
        display: element.style.display || 'block',
        visibility: element.style.visibility || 'visible',
        opacity: element.style.opacity === undefined ? '1' : element.style.opacity,
        zIndex: element.style.zIndex || '0'
      };
    },
    OmegaCabinetUI: {
      renderMinistryDashboard(id) { rendered.push(id); }
    },
    updateGlobalBackButtonVisibility() {}
  };
  context.window = context;
  context.addEventListener = () => {};
  if (withLayerManager) {
    context.OmegaLayerManager = {
      currentLayer: 1,
      activeMinistryId: null,
      layerStack: [0, 1],
      setLayer(layer, data) {
        calls.push({ layer, ministryId: data.ministryId });
        dashboard.style.display = 'flex';
        dashboard.style.visibility = 'visible';
        dashboard.style.opacity = '1';
        context.OmegaCabinetUI.renderMinistryDashboard(data.ministryId);
      }
    };
  }
  vm.runInNewContext(read('omega_ui_system_redesign_v1.js'), context, { filename: 'omega_ui_system_redesign_v1.js' });
  const event = {
    target: { closest(selector) { return selector.includes('#cabinet-full-window') ? card : null; } },
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; }
  };
  return { listeners, event, calls, rendered, dashboard, cabinet, bodyAttributes, dashboardAttributes, bodyClasses };
}

test('main cabinet ministry-card tap opens its requested ministry and suppresses duplicate legacy routing', () => {
  const h = createMinistryNavigationHarness();
  assert.ok(Array.isArray(h.listeners.click) && h.listeners.click.length > 0, 'capture-phase ministry routes must be installed');
  h.listeners.click.forEach((handler) => handler(h.event));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].layer, 2);
  assert.equal(h.calls[0].ministryId, 'finance');
  assert.deepEqual(h.rendered, ['finance']);
  assert.equal(h.dashboard.style.display, 'flex');
  assert.equal(h.event.prevented, true);
  assert.equal(h.event.stopped, true);
});

test('ministry-card tap can recover directly when the layer manager is unavailable', () => {
  const h = createMinistryNavigationHarness({ withLayerManager: false });
  h.listeners.click.forEach((handler) => handler(h.event));
  assert.deepEqual(h.rendered, ['finance']);
  assert.equal(h.dashboard.style.display, 'flex');
  assert.equal(h.dashboard.style.pointerEvents, 'auto');
  assert.equal(h.dashboardAttributes['aria-hidden'], 'false');
  assert.equal(h.bodyAttributes['data-active-layer'], '2');
});

test('ministry card hit targets remain tap-enabled on mobile', () => {
  const css = read('omega_ui_system_redesign_v1.css');
  assert.match(css, /#cabinet-full-window \.parchment-card-btn[\s\S]*?pointer-events:\s*auto\s*!important/);
  assert.match(css, /#cabinet-full-window \.parchment-card-btn[\s\S]*?touch-action:\s*manipulation\s*!important/);
});


function createMapMinistryDockHarness({ primaryFails = false, managerFails = false, deferNavigation = false } = {}) {
  const listeners = [];
  const calls = [];
  const scheduled = [];
  const attributes = {};
  const bodyClasses = new Set();
  const body = {
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
    classList: {
      add(name) { bodyClasses.add(name); },
      remove(name) { bodyClasses.delete(name); }
    }
  };
  const dock = {
    style: { display: 'flex' },
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] || null; },
    isConnected: true,
    getBoundingClientRect() { return { width: 142, height: 46 }; }
  };
  const button = {
    isConnected: true,
    closest(selector) { return selector === '#btn-ministry-dock' ? this : null; }
  };
  const header = {
    style: { display: 'flex', visibility: 'visible', opacity: '1' },
    isConnected: true,
    getBoundingClientRect() { return { left: 0, top: 0, right: 360, bottom: 150, width: 360, height: 150 }; }
  };
  const cabinet = {
    style: { display: 'none', visibility: 'visible', opacity: '0', pointerEvents: 'none' },
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] || null; },
    isConnected: true,
    getBoundingClientRect() {
      return this.style.display !== 'none' && this.style.visibility !== 'hidden' && Number(this.style.opacity) !== 0
        ? { width: 360, height: 640 } : { width: 0, height: 0 };
    }
  };
  const dashboard = { style: { display: 'none', opacity: '0', pointerEvents: 'none' }, setAttribute() {} };
  const document = {
    readyState: 'loading',
    body,
    documentElement: { style: { setProperty() {} }, dataset: {} },
    addEventListener(type, handler, capture) {
      if (type === 'click' && capture === true) listeners.push(handler);
    },
    getElementById(id) {
      if (id === 'omega-ministry-entry') return dock;
      if (id === 'btn-ministry-dock') return button;
      if (id === 'top-status-bar') return header;
      if (id === 'cabinet-full-window') return cabinet;
      if (id === 'ministry-dashboard-view') return dashboard;
      return null;
    }
  };
  const context = {
    document,
    console: { log() {}, warn() {}, error() {}, info() {} },
    getComputedStyle(element) {
      return {
        display: element.style.display || 'block',
        visibility: element.style.visibility || 'visible',
        opacity: element.style.opacity === undefined ? '1' : element.style.opacity
      };
    },
    openMainMinistryView(event) {
      calls.push('primary');
      if (primaryFails) throw new Error('simulated primary failure');
      cabinet.style.display = 'flex';
      cabinet.style.opacity = '1';
      cabinet.style.pointerEvents = 'auto';
      body.setAttribute('data-active-layer', '1');
    },
    OmegaLayerManager: {
      currentLayer: 0,
      layerStack: [0],
      setLayer(layer) {
        calls.push('manager');
        if (managerFails) throw new Error('simulated layer-manager failure');
        cabinet.style.display = layer === 1 ? 'flex' : 'none';
        cabinet.style.opacity = layer === 1 ? '1' : '0';
        body.setAttribute('data-active-layer', String(layer));
      }
    },
    OmegaCabinetUI: { renderCabinet(country) { calls.push('render:' + country); } },
    Game: { currentActiveCountry: 'BANGLADESH' },
    setTimeout: deferNavigation ? function (callback) { scheduled.push(callback); return scheduled.length; } : undefined
  };
  context.window = context;
  context.addEventListener = () => {};
  vm.runInNewContext(read('omega_ui_system_redesign_v1.js'), context, { filename: 'omega_ui_system_redesign_v1.js' });
  const event = {
    target: button,
    prevented: false,
    stoppedImmediate: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stoppedImmediate = true; }
  };
  return {
    listeners, event, calls, cabinet, dock, context, attributes, scheduled,
    flushScheduled() { let count = 0; while (scheduled.length && count++ < 10) scheduled.shift()(); }
  };
}

test('map ministry dock click opens the cabinet through the independent capture route', () => {
  const h = createMapMinistryDockHarness();
  assert.ok(h.listeners.length > 0, 'the standalone capture handler is registered');
  h.listeners.forEach((handler) => handler(h.event));
  assert.ok(h.calls.includes('primary'), 'the original cabinet route is attempted first');
  assert.equal(h.dock.style.top, '158px', 'dock sits below the measured 150px status header plus an 8px gap');
  assert.equal(h.cabinet.style.display, 'flex', 'the cabinet becomes visible after the tap');
  assert.equal(h.event.prevented, true);
  assert.equal(h.event.stoppedImmediate, true);
  assert.equal(h.dock.attrs['data-last-open-result'], 'opened');
  assert.equal(h.context.OMEGAMinistryDock.audit().cabinetVisible, true);
});

test('ministry dock enters Government HQ immediately and defers cabinet rendering', () => {
  const h = createMapMinistryDockHarness({ deferNavigation: true });
  h.listeners.forEach((handler) => handler(h.event));
  assert.equal(h.attributes['data-active-layer'], '1', 'the tap immediately enters Government HQ');
  assert.equal(h.context.OmegaLayerManager.currentLayer, 1);
  assert.equal(h.cabinet.style.display, 'flex', 'the cabinet shell is visible before heavy rendering');
  assert.equal(h.dock.attrs['data-last-open-result'], 'opening');
  assert.equal(h.calls.length, 0, 'heavy legacy rendering is not run inside the tap callback');
  assert.equal(h.scheduled.length, 1, 'rendering is queued for a later task');
  h.flushScheduled();
  assert.ok(h.calls.includes('primary'), 'the original cabinet renderer still runs after the callback returns');
  assert.equal(h.dock.attrs['data-last-open-result'], 'opened');
});

test('map ministry dock recovers when both the original route and layer manager fail', () => {
  const h = createMapMinistryDockHarness({ primaryFails: true, managerFails: true });
  h.listeners.forEach((handler) => handler(h.event));
  assert.equal(h.cabinet.style.display, 'flex', 'direct DOM fallback opens the cabinet surface');
  assert.equal(h.cabinet.style.pointerEvents, 'auto');
  assert.equal(h.attributes['data-active-layer'], '1');
  assert.ok(h.calls.includes('render:BANGLADESH'), 'fallback renders the current-country cabinet');
  assert.equal(h.dock.attrs['data-last-open-result'], 'opened');
});

test('cabinet council rendering is deferred until after the cabinet shell is painted', () => {
  const engine = read('ministry_engine.js');
  assert.ok(engine.includes('omega-cabinet-subsystem-loading'));
  assert.ok(engine.includes('window.setTimeout(renderSubsystem, 50)'));
  assert.ok(engine.includes("document.getElementById('cabinet-subsystem-root') !== subsystemRoot"));
});
