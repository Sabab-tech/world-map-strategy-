import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../omega_ui_v2/text-presentation.js', import.meta.url), 'utf8');

class MockText {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.parentNode = null;
  }
  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }
}

class MockElement {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this.style = {};
    this.value = '';
    this.isContentEditable = false;
  }
  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }
  appendChild(node) {
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  replaceChild(nextNode, oldNode) {
    const index = this.childNodes.indexOf(oldNode);
    assert.notEqual(index, -1);
    nextNode.parentNode = this;
    oldNode.parentNode = null;
    this.childNodes[index] = nextNode;
    return oldNode;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }
  get textContent() {
    return this.childNodes.map((node) =>
      node.nodeType === 3 ? node.nodeValue : node.textContent
    ).join('');
  }
  set textContent(value) {
    this.childNodes = [];
    const text = String(value == null ? '' : value);
    if (text) this.appendChild(new MockText(text));
  }
}

function createEnvironment() {
  const observers = [];
  const document = {
    body: new MockElement('body'),
    createElement(tagName) {
      return new MockElement(tagName);
    }
  };
  class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target, options) {
      this.target = target;
      this.options = options;
    }
    trigger(records) {
      this.callback(records);
    }
  }
  const window = { document, MutationObserver: MockMutationObserver };
  vm.runInNewContext(source, { window });
  return { window, document, observers };
}

test('underscore labels become readable bold-italic presentation text', () => {
  const env = createEnvironment();
  const label = new MockElement('span');
  label.appendChild(new MockText('natural_gas__reserve'));
  env.document.body.appendChild(label);

  // Simulate the observer seeing a label inserted by a later UI render.
  env.observers[0].trigger([{ type: 'childList', addedNodes: [label] }]);

  assert.equal(label.textContent, 'natural gas reserve');
  assert.equal(label.childNodes[0].tagName, 'STRONG');
  assert.equal(label.childNodes[0].getAttribute('data-omega-ui-display-label'), 'true');
  assert.equal(label.childNodes[0].style.fontWeight, '700');
  assert.equal(label.childNodes[0].childNodes[0].tagName, 'EM');
  assert.equal(label.childNodes[0].childNodes[0].style.fontStyle, 'italic');
});

test('canonical values, data attributes, code, editable text and form controls remain untouched', () => {
  const env = createEnvironment();

  const input = new MockElement('input');
  input.value = 'natural_gas';
  input.setAttribute('data-resource-id', 'natural_gas');
  env.document.body.appendChild(input);

  const code = new MockElement('code');
  code.appendChild(new MockText('resource_site_id'));
  env.document.body.appendChild(code);

  const editable = new MockElement('div');
  editable.isContentEditable = true;
  editable.appendChild(new MockText('player_note_value'));
  env.document.body.appendChild(editable);

  const select = new MockElement('select');
  const option = new MockElement('option');
  option.appendChild(new MockText('crude_oil'));
  select.appendChild(option);
  env.document.body.appendChild(select);

  // The formatter auto-installs when the script loads.
  assert.equal(input.value, 'natural_gas');
  assert.equal(input.getAttribute('data-resource-id'), 'natural_gas');
  assert.equal(code.textContent, 'resource_site_id');
  assert.equal(editable.textContent, 'player_note_value');
  assert.equal(option.textContent, 'crude_oil');
});

test('new and updated interface labels are formatted without duplicate wrappers', () => {
  const env = createEnvironment();
  const observer = env.observers[0];
  assert.ok(observer, 'a DOM observer must handle future UI renders');

  const card = new MockElement('div');
  card.appendChild(new MockText('iron_ore'));
  env.document.body.appendChild(card);
  observer.trigger([{ type: 'childList', addedNodes: [card] }]);
  assert.equal(card.textContent, 'iron ore');

  const strong = card.childNodes[0];
  const italic = strong.childNodes[0];
  italic.childNodes[0].nodeValue = 'coal_ore';
  observer.trigger([{ type: 'characterData', target: italic.childNodes[0] }]);
  assert.equal(card.textContent, 'coal ore');
  assert.equal(card.childNodes[0], strong, 'updates must reuse the existing emphasis wrapper');
  assert.equal(strong.childNodes[0], italic, 'updates must not nest duplicate emphasis tags');

  assert.equal(env.window.OmegaUIPresentation.formatLabel('country___name'), 'country name');
  assert.equal(env.window.OmegaUIPresentation.install(), true);
  assert.equal(env.observers.length, 1, 'installation must be idempotent');
});
