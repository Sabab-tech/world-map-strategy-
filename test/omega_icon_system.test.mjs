import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const iconSource = read('omega_icon_system_v1.js');
const iconContext = { window: {} };
vm.runInNewContext(iconSource, iconContext, { filename: 'omega_icon_system_v1.js' });
const icons = iconContext.window.OMEGA_ICON_SYSTEM_V1;

test('custom icon system is wired locally before UI renderers and has no remote runtime dependency', () => {
  const html = read('index.html');
  assert.match(html, /href="omega_icon_system_v1\.css"/);
  assert.match(html, /src="omega_icon_system_v1\.js"/);
  assert.ok(html.indexOf('omega_icon_system_v1.css') < html.indexOf('</head>'));
  assert.ok(html.indexOf('omega_icon_system_v1.js') < html.indexOf('map-engine-1.js'));
  assert.ok(html.indexOf('omega_icon_system_v1.js') < html.indexOf('ui_engine_core.js'));
  assert.doesNotMatch(iconSource, /https?:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com)/i);
});

test('original line icon set includes semantic symbols for all main command areas', () => {
  assert.ok(icons, 'icon registry should export its local API');
  for (const name of ['landmark', 'shield', 'wallet', 'chart-column', 'globe', 'search', 'satellite',
    'pickaxe', 'factory', 'heart-pulse', 'book-open', 'microscope', 'scroll', 'bot', 'eye',
    'arrow-left', 'clock', 'settings', 'users', 'gem', 'car-front', 'circle-help']) {
    assert.ok(icons.iconNames.includes(name), 'missing icon symbol: ' + name);
  }
  assert.ok(icons.iconNames.length >= 45, 'the bespoke SVG library should cover a broad set of UI actions');
});

test('legacy emoji labels resolve to consistent SVG icon names', () => {
  const cases = [
    ['🏛️', 'landmark'], ['🛡️', 'shield'], ['⚔️', 'swords'], ['💰', 'wallet'],
    ['📊', 'chart-column'], ['🌐', 'globe'], ['🛰️', 'satellite'], ['⛏️', 'pickaxe'],
    ['🚔', 'car-front'], ['🤖', 'bot'], ['👁️', 'eye'], ['⏸', 'pause'],
    ['⚕️', 'heart-pulse'], ['📚', 'book-open'], ['🔍', 'search'], ['💾', 'save'],
    ['⚖️', 'scale'], ['🎙️', 'mic'], ['💬', 'message-square'], ['🤝', 'network'],
    ['🚪', 'door'], ['🧹', 'broom'], ['🌾', 'leaf'], ['📦', 'package'], ['🚜', 'tractor'],
    ['⚓', 'anchor'], ['💻', 'laptop'], ['⏩', 'fast-forward'], ['🕊️', 'dove'],
    ['☢️', 'radiation'], ['⚛️', 'atom'], ['☀️', 'sun'], ['🚩', 'flag'], ['🔋', 'battery-charging'],
    ['📍', 'map-pin'], ['⛓️', 'link'], ['💧', 'droplet'], ['🔵', 'blue-dot'], ['🔴', 'red-dot'], ['🟢', 'green-dot']
  ];
  for (const [emoji, expected] of cases) {
    assert.equal(icons.nameForEmoji(emoji), expected, 'wrong icon mapping for ' + emoji);
  }
  assert.equal(icons.nameForEmoji('🕵️'), 'user-search');
  assert.equal(icons.nameForEmoji('🦄'), null, 'unmapped pictographs should remain intact rather than turn into a misleading help icon');
});

test('icon runtime observes new UI nodes and excludes editable/script content', () => {
  assert.match(iconSource, /new MutationObserver/);
  assert.match(iconSource, /observer\.observe\(document\.body, \{ subtree: true, childList: true, characterData: true \}\)/);
  assert.match(iconSource, /textarea,input,select,option,pre,code,svg,\[contenteditable="true"\]/);
  assert.match(iconSource, /createDocumentFragment/);
  assert.match(iconSource, /setAttribute\('href', href\)/);
});

test('icon CSS uses currentColor line art and honors reduced motion', () => {
  const css = read('omega_icon_system_v1.css');
  assert.match(css, /stroke: currentColor/);
  assert.match(css, /shape-rendering: geometricPrecision/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /font-family:/);
});


test('runtime batches dynamic icon work and excludes high-churn map/render subtrees', () => {
  assert.match(iconSource, /MAX_ROOTS_PER_FRAME = 24/);
  assert.match(iconSource, /FRAME_BUDGET_MS = 4/);
  assert.match(iconSource, /requestAnimationFrame/);
  assert.match(iconSource, /attachShallowObserver\(document\.body/);
  assert.match(iconSource, /attachShallowObserver\(app/);
  assert.match(iconSource, /'\.leaflet-marker-pane'/);
  assert.match(iconSource, /'\.leaflet-tile-pane'/);
  assert.doesNotMatch(iconSource, /observer\.observe\(document\.body, \{ subtree: true/);
  assert.match(iconSource, /observerMode: 'segmented-ui-roots'/);
});

class FakeNode {
  constructor(type, name = '', value = '') {
    this.nodeType = type;
    this.tagName = type === 1 ? String(name).toUpperCase() : '';
    this.nodeValue = type === 3 ? value : null;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this.id = '';
    this.className = '';
    this.textContentValue = '';
  }
  get parentElement() {
    let cursor = this.parentNode;
    while (cursor && cursor.nodeType !== 1) cursor = cursor.parentNode;
    return cursor || null;
  }
  get textContent() {
    if (this.nodeType === 3) return this.nodeValue || '';
    return this.childNodes.map(node => node.textContent).join('');
  }
  set textContent(value) {
    this.childNodes = [];
    this.appendChild(new FakeNode(3, '', String(value)));
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  }
  appendChild(node) {
    if (node.nodeType === 11) {
      for (const child of [...node.childNodes]) this.appendChild(child);
      node.childNodes = [];
      return node;
    }
    if (node.parentNode && node.parentNode.childNodes) {
      const old = node.parentNode.childNodes.indexOf(node);
      if (old >= 0) node.parentNode.childNodes.splice(old, 1);
    }
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  replaceChild(next, old) {
    const index = this.childNodes.indexOf(old);
    if (index < 0) throw new Error('old child missing');
    if (next.nodeType === 11) {
      const fresh = [...next.childNodes];
      for (const child of fresh) child.parentNode = this;
      this.childNodes.splice(index, 1, ...fresh);
      next.childNodes = [];
    } else {
      next.parentNode = this;
      this.childNodes.splice(index, 1, next);
    }
    old.parentNode = null;
    return old;
  }
  contains(other) {
    let cursor = other;
    while (cursor) {
      if (cursor === this) return true;
      cursor = cursor.parentNode;
    }
    return false;
  }
  matches(selectorList) {
    return String(selectorList).split(',').some(raw => {
      const selector = raw.trim();
      if (!selector) return false;
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
      if (selector === '[contenteditable="true"]') return this.attributes.contenteditable === 'true';
      return this.nodeType === 1 && this.tagName.toLowerCase() === selector.toLowerCase();
    });
  }
  closest(selectorList) {
    let cursor = this;
    while (cursor) {
      if (cursor.nodeType === 1 && cursor.matches(selectorList)) return cursor;
      cursor = cursor.parentElement;
    }
    return null;
  }
}
function createFakeDocument() {
  const nodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };
  const doc = {
    readyState: 'loading',
    defaultView: { NodeFilter: nodeFilter },
    addEventListener() {},
    createElementNS(_namespace, name) { return new FakeNode(1, name); },
    createTextNode(text) { return new FakeNode(3, '', text); },
    createDocumentFragment() { return new FakeNode(11); },
    createTreeWalker(root, _whatToShow, filter) {
      const stack = [...root.childNodes].reverse();
      return {
        nextNode() {
          while (stack.length) {
            const current = stack.pop();
            const result = filter ? filter(current) : nodeFilter.FILTER_ACCEPT;
            if (result !== nodeFilter.FILTER_REJECT && current.childNodes) {
              for (let i = current.childNodes.length - 1; i >= 0; i--) stack.push(current.childNodes[i]);
            }
            if (result === nodeFilter.FILTER_ACCEPT) return current;
          }
          return null;
        }
      };
    }
  };
  doc.body = new FakeNode(1, 'body');
  doc.getElementById = id => {
    const stack = [doc.body];
    while (stack.length) {
      const n = stack.pop();
      if (n.id === id) return n;
      stack.push(...n.childNodes);
    }
    return null;
  };
  return doc;
}

test('synthetic large-map smoke converts UI icons while leaving map markers and unknown pictographs alone', () => {
  const doc = createFakeDocument();
  const win = { performance: { now: () => Date.now() } };
  const context = { window: win, document: doc, console };
  vm.runInNewContext(iconSource, context, { filename: 'omega_icon_system_v1.js' });
  const api = win.OMEGA_ICON_SYSTEM_V1;

  const renderer = new FakeNode(1, 'div');
  renderer.setAttribute('id', 'render-engine-root');
  const map = new FakeNode(1, 'div');
  map.setAttribute('id', 'map');
  const markerPane = new FakeNode(1, 'div');
  markerPane.setAttribute('class', 'leaflet-marker-pane');
  for (let i = 0; i < 2000; i++) {
    const marker = new FakeNode(1, 'div');
    marker.setAttribute('class', 'leaflet-marker-icon');
    marker.appendChild(doc.createTextNode('🏛️'));
    markerPane.appendChild(marker);
  }
  map.appendChild(markerPane);
  renderer.appendChild(map);
  doc.body.appendChild(renderer);

  const ui = new FakeNode(1, 'div');
  ui.setAttribute('id', 'ui-engine-root');
  const button = new FakeNode(1, 'button');
  button.appendChild(doc.createTextNode('🏛️ MINISTRIES'));
  ui.appendChild(button);
  const unknown = new FakeNode(1, 'span');
  unknown.appendChild(doc.createTextNode('🦄'));
  ui.appendChild(unknown);
  const code = new FakeNode(1, 'pre');
  code.appendChild(doc.createTextNode('📊'));
  ui.appendChild(code);
  doc.body.appendChild(ui);

  const converted = api.scanNode(doc.body);
  const stats = api.diagnostics();
  assert.equal(converted, 1, 'only the visible UI pictograph should be converted in the first scan');
  assert.equal(button.childNodes[0].tagName, 'SVG');
  assert.equal(button.textContent, ' MINISTRIES');
  assert.equal(unknown.textContent, '🦄', 'unknown pictographs must not become misleading help icons');
  assert.equal(markerPane.childNodes[0].textContent, '🏛️', 'high-volume map marker text must be left unchanged');
  assert.equal(code.textContent, '📊', 'code/sample blocks must remain literal');
  assert.ok(stats.visitedElements < 30, 'scanner must reject the renderer subtree before traversing 2,000 markers');
  assert.ok(stats.skippedSubtrees >= 2, 'high-volume map marker and code subtrees should be pruned from traversal');
  assert.equal(stats.convertedIcons, 1);
});
