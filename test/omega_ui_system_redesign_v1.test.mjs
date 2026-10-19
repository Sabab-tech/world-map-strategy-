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
      if (type === 'click' && capture === true) listeners.click = handler;
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
  assert.equal(typeof h.listeners.click, 'function', 'capture-phase ministry-card route must be installed');
  h.listeners.click(h.event);
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
  h.listeners.click(h.event);
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

