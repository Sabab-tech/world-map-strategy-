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
  assert.doesNotMatch(iconSource, /https?:\\/\\/(?:unpkg\\.com|cdn\\.jsdelivr\\.net|cdnjs\\.cloudflare\\.com|fonts\\.googleapis\\.com)/i);
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
    ['⚕️', 'heart-pulse'], ['📚', 'book-open'], ['🔍', 'search'], ['💾', 'save']
  ];
  for (const [emoji, expected] of cases) {
    assert.equal(icons.nameForEmoji(emoji), expected, 'wrong icon mapping for ' + emoji);
  }
  assert.equal(icons.nameForEmoji('🕵️'), 'user-search');
  assert.equal(icons.nameForEmoji('an unrecognized pictograph'), 'circle-help');
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
