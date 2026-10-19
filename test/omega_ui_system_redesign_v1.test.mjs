import test from 'node:test';
import assert from 'node:assert/strict';
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
