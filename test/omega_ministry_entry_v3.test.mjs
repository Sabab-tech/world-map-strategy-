import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function matchingDivClose(source, start) {
  const sanitized = source
    .replace(/<script\b[\s\S]*?<\/script>/gi, (part) => part.replace(/[^\n]/g, ' '))
    .replace(/<style\b[\s\S]*?<\/style>/gi, (part) => part.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (part) => part.replace(/[^\n]/g, ' '));
  const open = sanitized.indexOf('<div id="app"');
  assert.ok(open >= 0, '#app exists');
  const token = /<div\b[^>]*>|<\/div>/gi;
  token.lastIndex = open;
  let depth = 0;
  let match;
  while ((match = token.exec(sanitized))) {
    if (/^<div\b/i.test(match[0])) depth += 1;
    else depth -= 1;
    if (depth === 0) return match.index;
  }
  return -1;
}

test('v3 ministry entry is a body-level UI v2 entry and retired controllers are disconnected', () => {
  const html = read('index.html');
  const appClose = matchingDivClose(html);
  const buttonAt = html.indexOf('id="omega-gov-entry-v3"');
  assert.ok(buttonAt > appClose, 'new button is outside #app and the map/UI tree');
  assert.ok(buttonAt >= 0, 'new button exists');
  assert.ok(!html.slice(buttonAt, buttonAt + 900).includes('id="btn-ministry-dock"'), 'does not reuse the old button id');
  assert.ok(fs.existsSync(path.join(root, 'omega_ministry_entry_v3.css')), 'historical entry CSS remains on disk');
  assert.doesNotMatch(html, /<link[^>]+href="omega_ministry_entry_v3\.css"/i);
  assert.ok(html.includes('omega_ui_v2/omega-ui-v2.css'));
  assert.ok(html.includes('omega_ui_v2/legacy-disconnect.css'));
  assert.ok(html.includes('<script src="omega_ministry_entry_v3.js" defer></script>'));
  for (const retired of ['omega_ui_system_redesign_v1.js', 'omega_ui_interaction_guard.js', 'omega_ui_button_system_v1.js']) {
    assert.equal(html.includes('<script src="' + retired + '"'), false, retired + ' must not be loaded');
  }
});

test('v3 styles do not inherit old navigation class and create a separate accessible tap target', () => {
  const html = read('index.html');
  const start = html.indexOf('id="omega-gov-entry-v3"');
  const end = html.indexOf('</button>', start);
  assert.ok(start >= 0 && end > start);
  assert.match(html.slice(start, end), /aria-label="Open Ministries and Government"/);
  assert.doesNotMatch(html.slice(start, end), /ui-bottom-navigation|nav-btn|btn-ministry-dock/);

  const css = read('omega_ministry_entry_v3.css');
  const activeShellCss = read('omega_ui_v2/legacy-disconnect.css');
  assert.match(activeShellCss, /#omega-gov-entry-v3\\s*\\{[^}]*position:\\s*fixed\\s*!important/s,
    'the fallback government entry must keep its tap target when the retired stylesheet is unloaded');
  assert.match(activeShellCss, /#omega-gov-entry-v3[^}]*touch-action:\\s*manipulation\\s*!important/s);
  for (const needle of [
    '#omega-gov-entry-v3', 'position: fixed !important', 'pointer-events: auto !important',
    'touch-action: manipulation !important', 'z-index: 99998 !important',
    '#omega-ministry-entry', 'env(safe-area-inset-bottom'
  ]) assert.ok(css.includes(needle), 'missing independent button rule: ' + needle);
});

function harness({ v2Fails = false } = {}) {
  const windowListeners = {};
  const calls = [];
  const attrs = {};
  const bodyClasses = new Set();
  const makeStyle = (display = 'none', opacity = '0', visibility = 'visible', pointerEvents = 'none') => ({ display, opacity, visibility, pointerEvents });
  const button = {
    style: makeStyle('inline-flex', '1', 'visible', 'auto'), attrs: {}, hidden: false,
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] || null; },
    getBoundingClientRect() { return { width: 150, height: 54 }; },
    closest(selector) { return selector === '#omega-gov-entry-v3' ? this : null; }
  };
  const cabinet = {
    style: makeStyle(), attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] || null; },
    getBoundingClientRect() {
      const s = this.style;
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0
        ? { width: 360, height: 640 } : { width: 0, height: 0 };
    }
  };
  const dashboard = { style: makeStyle(), setAttribute() {}, getBoundingClientRect() { return { width: 0, height: 0 }; } };
  const loader = { style: makeStyle('none', '0'), hidden: false, getBoundingClientRect() { return { width: 0, height: 0 }; } };
  const body = {
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    setAttribute(name, value) { attrs[name] = String(value); },
    classList: {
      add(name) { bodyClasses.add(name); },
      remove(name) { bodyClasses.delete(name); }
    }
  };
  body.setAttribute('data-active-layer', '0');
  const document = {
    readyState: 'complete', body,
    getElementById(id) {
      return ({
        'omega-gov-entry-v3': button,
        'cabinet-full-window': cabinet,
        'ministry-dashboard-view': dashboard,
        'cabinet-loading-overlay': loader
      })[id] || null;
    },
    addEventListener() {}
  };
  const context = {
    document, console: { log() {}, warn() {}, error() {}, info() {} },
    getComputedStyle(el) {
      return { display: el.style.display || 'block', opacity: el.style.opacity === undefined ? '1' : el.style.opacity,
        visibility: el.style.visibility || 'visible', pointerEvents: el.style.pointerEvents || 'auto' };
    },
    MutationObserver: class { observe() {} },
    Game: { currentActiveCountry: 'BANGLADESH' },
    OmegaCabinetUI: { renderCabinet(country) { calls.push('render:' + country); } },
    OmegaUIV2Integration: {
      isEnabled() { return true; },
      mountIntoCabinet(target) {
        calls.push('ui-v2');
        if (v2Fails) return { ok:false, code:'UI_V2_MOUNT_FAILED' };
        target.style.display = 'flex'; target.style.opacity = '1';
        target.style.visibility = 'visible'; target.style.pointerEvents = 'auto';
        target.setAttribute('data-omega-ui-v2-active', 'true');
        body.setAttribute('data-active-layer', '1');
        return { ok:true, route:'government' };
      }
    },
    updateGlobalBackButtonVisibility() { calls.push('back-button-sync'); },
    addEventListener(type, handler, capture) { if (!windowListeners[type]) windowListeners[type] = []; windowListeners[type].push({ handler, capture }); },
    openMainMinistryView() {
      calls.push('primary');
      if (primaryFails) throw new Error('primary route failure');
      cabinet.style.display = 'flex'; cabinet.style.opacity = '1'; cabinet.style.pointerEvents = 'auto';
      body.setAttribute('data-active-layer', '1');
    },
    OmegaLayerManager: {
      currentLayer: 0, layerStack: [0],
      setLayer(layer) {
        calls.push('manager:' + layer);
        if (managerFails) throw new Error('layer-manager route failure');
        cabinet.style.display = layer === 1 ? 'flex' : 'none';
        cabinet.style.opacity = layer === 1 ? '1' : '0';
        cabinet.style.pointerEvents = layer === 1 ? 'auto' : 'none';
        body.setAttribute('data-active-layer', String(layer));
      }
    }
  };
  context.window = context;
  vm.runInNewContext(read('omega_ministry_entry_v3.js'), context, { filename: 'omega_ministry_entry_v3.js' });
  const event = {
    target: button, prevented: false, stopped: false, stoppedImmediate: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.stoppedImmediate = true; }
  };
  return { context, windowListeners, event, calls, button, cabinet, bodyClasses, attrs };
}

test('v3 routes exclusively through UI v2 and suppresses duplicate legacy click handlers', () => {
  const h = harness();
  assert.ok(h.windowListeners.click?.some((item) => item.capture === true), 'window capture handler registered');
  h.windowListeners.click.forEach((item) => item.handler(h.event));
  assert.equal(h.cabinet.style.display, 'flex');
  assert.equal(h.attrs['data-active-layer'], '1');
  assert.equal(h.button.attrs['data-last-open-result'], 'opened-ui-v2');
  assert.ok(h.calls.includes('ui-v2'));
  assert.equal(h.calls.includes('primary'), false, 'must not call the legacy main-ministry route');
  assert.equal(h.calls.some((call) => call.startsWith('manager:')), false, 'must not enter the legacy layer manager');
  assert.equal(h.calls.some((call) => call.startsWith('render:')), false, 'must not render legacy cabinet HTML');
  assert.equal(h.event.prevented, true);
  assert.equal(h.event.stoppedImmediate, true);
  assert.equal(h.context.OMEGAGovEntryV3.audit().cabinetVisible, true);
});

test('v3 fails closed when UI v2 cannot mount and never starts legacy fallbacks', () => {
  const h = harness({ v2Fails:true });
  h.windowListeners.click.forEach((item) => item.handler(h.event));
  assert.equal(h.cabinet.style.display, 'none');
  assert.equal(h.cabinet.style.pointerEvents, 'none');
  assert.equal(h.attrs['data-active-layer'], '0');
  assert.equal(h.button.attrs['data-last-open-result'], 'failed-ui-v2-mount');
  assert.equal(h.calls.includes('primary'), false);
  assert.equal(h.calls.some((call) => call.startsWith('manager:')), false);
  assert.equal(h.calls.some((call) => call.startsWith('render:')), false);
});

test('v3 hides the new entry while a ministry layer is active', () => {
  const h = harness();
  h.attrs['data-active-layer'] = '1';
  h.context.OMEGAGovEntryV3.syncVisibility();
  assert.equal(h.button.style.visibility, 'hidden');
  assert.equal(h.button.style.pointerEvents, 'none');
});
