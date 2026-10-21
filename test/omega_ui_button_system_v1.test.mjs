import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function makeButton(options = {}) {
  const attrs = Object.assign({}, options.attrs || {});
  if (options.id) attrs.id = options.id;
  if (options.className) attrs.class = options.className;
  const form = options.inForm ? { tagName: 'FORM', getAttribute() { return null; }, parentElement: null } : null;
  const node = {
    nodeType: 1,
    tagName: 'BUTTON',
    className: options.className || '',
    textContent: options.text || '',
    innerText: options.text || '',
    onclick: options.onclick || null,
    disabled: !!options.disabled,
    form,
    style: {},
    parentElement: form,
    parentNode: form,
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    setAttribute(name, value) {
      attrs[name] = String(value);
      if (name === 'class') this.className = String(value);
    },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    closest(selector) { return selector === 'form' ? form : selector === 'button' ? this : null; },
    querySelector() { return null; },
    getBoundingClientRect() { return { width: 40, height: 40 }; }
  };
  Object.defineProperty(node, 'attributes', { get: () => Object.keys(attrs).map((name) => ({ name, value: attrs[name] })) });
  return node;
}

function makeHarness(buttons) {
  const listeners = {};
  const observers = [];
  const documentElement = {
    nodeType: 1,
    tagName: 'HTML',
    style: {},
    getAttribute() { return null; },
    querySelectorAll(selector) {
      if (selector === 'button') return buttons;
      return [];
    }
  };
  const document = {
    readyState: 'complete',
    documentElement,
    body: documentElement,
    addEventListener(type, handler) {
      (listeners[type] ||= []).push(handler);
    },
    getElementById(id) { return buttons.find((item) => item.getAttribute('id') === id) || null; },
    querySelectorAll(selector) {
      if (selector === 'button') return buttons;
      return [];
    }
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
  }
  const context = {
    document,
    console,
    MutationObserver,
    getComputedStyle() { return { display: 'block', visibility: 'visible' }; }
  };
  context.window = context;
  vm.runInNewContext(read('omega_ui_button_system_v1.js'), context, { filename: 'omega_ui_button_system_v1.js' });
  return { context, document, listeners, observers, buttons };
}

test('button styles load after the existing visual and responsive design layers', () => {
  const html = read('index.html');
  const visual = html.indexOf('omega_ui_visual_system_v1.css');
  const redesign = html.indexOf('omega_ui_system_redesign_v1.css');
  const buttons = html.indexOf('omega_ui_button_system_v1.css');
  assert.ok(visual >= 0 && redesign > visual && buttons > redesign, 'button contract must be the final linked visual layer');
  assert.ok(buttons < html.indexOf('</head>'));
  const runtime = html.indexOf('src="omega_ui_button_system_v1.js"');
  assert.ok(runtime > html.indexOf('src="omega_ui_system_redesign_v1.js"'), 'button inventory must load after the layout runtime');
  assert.ok(runtime < html.indexOf('</body>'));
  for (const required of ['map-engine-1.js', 'map-engine-2.js', 'omega_home_ministry_engine_v1.js', 'omega_resource_gameplay_binding_v1.js']) {
    assert.ok(html.includes(required), 'keep existing runtime loaded: ' + required);
  }
});

test('shared button layer defines semantic colors, consistent geometry, accessible feedback and mobile behavior', () => {
  const css = read('omega_ui_button_system_v1.css');
  for (const required of [
    '--omega-button-bg:', '--omega-button-primary-bg:', '--omega-button-danger-bg:',
    'data-omega-button-kind="primary"', 'data-omega-button-kind="danger"',
    'data-omega-button-kind="navigation"', 'data-omega-button-kind="toggle"',
    'data-omega-button-kind="icon"', 'min-height: var(--omega-button-height) !important',
    ':focus-visible', 'aria-pressed="true"', '@media (max-width: 480px)',
    '@media (prefers-reduced-motion: reduce), (pointer: coarse)', ':not(#btn-ministry-dock)'
  ]) assert.ok(css.includes(required), 'missing shared button rule: ' + required);
  assert.match(css, /#btn-ministry-dock/);
});

test('runtime annotates every live button without replacing its real action handler', () => {
  const direct = () => true;
  const buttons = [
    makeButton({ id: 'btn-save-plan', className: 'btn-primary', text: 'Save plan', attrs: { type: 'button', 'data-action': 'save-plan' }, onclick: direct }),
    makeButton({ id: 'btn-quick-search', className: 'icon-btn', attrs: { title: 'Quick search' } }),
    makeButton({ id: 'btn-delete-file', className: 'danger-btn', text: 'Delete file' }),
    makeButton({ text: '', attrs: {} }),
    makeButton({ id: 'duplicate-id', text: 'One' }),
    makeButton({ id: 'duplicate-id', text: 'Two' }),
    makeButton({ text: 'Send', inForm: true })
  ];
  const h = makeHarness(buttons);
  const system = h.context.OMEGA_BUTTON_SYSTEM_V1;
  assert.ok(system, 'global button system must initialize');
  assert.equal(h.context.OMEGAButtonSystem, system);
  assert.ok(buttons.every((button) => button.getAttribute('data-omega-button-managed') === 'v1'));
  assert.ok(buttons.every((button) => button.getAttribute('data-omega-button-key')));
  assert.ok(buttons.every((button) => button.getAttribute('data-omega-button-note')));
  assert.equal(buttons[0].getAttribute('data-omega-button-kind'), 'primary');
  assert.equal(buttons[1].getAttribute('data-omega-button-kind'), 'icon');
  assert.equal(buttons[2].getAttribute('data-omega-button-kind'), 'danger');
  assert.equal(buttons[0].onclick, direct, 'existing click handler must stay intact');

  const report = system.audit();
  assert.equal(report.total, buttons.length);
  assert.equal(report.byKind.primary, 1);
  assert.equal(report.byKind.icon, 1);
  assert.equal(report.byKind.danger, 1);
  assert.ok(report.issues.some((issue) => issue.code === 'MISSING_ACCESSIBLE_NAME'));
  assert.ok(report.issues.some((issue) => issue.code === 'DUPLICATE_BUTTON_ID'));
  assert.ok(report.issues.some((issue) => issue.code === 'IMPLICIT_FORM_SUBMIT'));
  assert.equal(report.buttons[0].binding, 'DIRECT_HANDLER');
  assert.equal(report.buttons[1].binding, 'RUNTIME_OR_DELEGATED');
  assert.equal(report.buttons[0].verification, 'NOT_TESTED');
});

test('runtime marks dynamically created buttons, records click attempts, and keeps evidence notes for test results', () => {
  const button = makeButton({ id: 'open-ministry', text: 'Open ministry', attrs: { 'data-action': 'open-ministry' } });
  const buttons = [button];
  const h = makeHarness(buttons);
  const system = h.context.OMEGA_BUTTON_SYSTEM_V1;

  const dynamic = makeButton({ id: 'close-dialog', className: 'close-btn', text: 'Close' });
  buttons.push(dynamic);
  assert.ok(h.observers.length > 0, 'MutationObserver must be installed for future modal controls');
  h.observers[0].callback([{ addedNodes: [dynamic] }]);
  assert.equal(dynamic.getAttribute('data-omega-button-managed'), 'v1');
  assert.equal(dynamic.getAttribute('data-omega-button-kind'), 'utility');

  h.listeners.click[0]({ target: button });
  assert.equal(system.getRecentClickAttempts()[0].key, button.getAttribute('data-omega-button-key'));
  assert.equal(system.getRecentClickAttempts()[0].outcome, 'CLICK_ATTEMPT_ONLY');

  const key = button.getAttribute('data-omega-button-key');
  const marked = system.markTestResult(key, 'PASS', 'Opens the correct ministry without running a duplicate action.');
  assert.equal(marked.success, true);
  assert.equal(button.getAttribute('data-omega-button-test-result'), 'PASS');
  assert.equal(system.audit().buttons.find((item) => item.key === key).verification, 'PASS');
  assert.equal(system.markTestResult(key, 'FAIL', '').reason, 'NOTE_REQUIRED');
  assert.match(system.exportJSON(), /CLICK_ATTEMPT_ONLY/);
});
