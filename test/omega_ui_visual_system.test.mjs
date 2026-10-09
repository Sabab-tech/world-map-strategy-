import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('unified visual system loads after legacy UI styles', () => {
  const html = read('index.html');
  const legacy = html.indexOf('omega_ui_interaction_fix_v2.css');
  const visual = html.indexOf('omega_ui_visual_system_v1.css');
  assert.ok(legacy >= 0 && visual > legacy, 'visual system must override older CSS');
});

test('visual system uses stable surfaces and low-overhead rendering', () => {
  const css = read('omega_ui_visual_system_v1.css');
  for (const token of ['--ui-bg:', '--ui-surface:', '--ui-border:', '--ui-text:', '--ui-accent:']) {
    assert.ok(css.includes(token), `missing design token ${token}`);
  }
  assert.match(css, /backdrop-filter:none!important/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /\.res-chip-item\.selected/);
  assert.doesNotMatch(css, /\.res-chip-item:has\(/, 'must work on older Android WebView');
  assert.match(css, /#resource-filter-box\.hidden\{display:none!important;\}/);
});

test('resource selector uses consistent non-emoji symbols and selected-state classes', () => {
  const js = read('map-engine-2.js');
  const catalog = js.match(/Game\.Map\.resourceCatalog = \[([\s\S]*?)\n\];/);
  assert.ok(catalog, 'resource catalog must exist');
  const ids = [...catalog[1].matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(ids.length, 20, 'all 20 resource filter categories must remain available');
  assert.equal(new Set(ids).size, ids.length, 'resource IDs must be unique');
  assert.match(catalog[1], /icon: 'Fe'/);
  assert.match(catalog[1], /icon: 'Au'/);
  assert.match(catalog[1], /icon: 'Si'/);
  assert.doesNotMatch(catalog[1], /icon: '[^']*[\u{1F000}-\u{1FAFF}]/u, 'catalog icons should use consistent text glyphs');
  assert.match(js, /class="omega-resource-glyph" data-resource="\$\{item\.id\}"/);
  assert.match(js, /class="omega-resource-glyph omega-resource-glyph--map"/);
  assert.match(js, /parentEl\.classList\.add\('selected'\)/);
  assert.match(js, /parentEl\.classList\.remove\('selected'\)/);
});

test('country-scoped city layer remains gated by country selection', () => {
  const js = read('map-engine-2.js');
  const start = js.indexOf('renderCountryHubs() {');
  assert.ok(start >= 0);
  const body = js.slice(start, js.indexOf('\n    },', start));
  assert.match(body, /if \(!Game\.currentActiveCountry\) return/);
  assert.match(body, /Game\.locationsRegistry\[countryId\]/);
  assert.match(js, /normalizedScope === 'WORLD'/);
  assert.match(js, /SELECT A COUNTRY FOR NATION SCOPE/);
  assert.match(js, /if \(scope === 'NATION' && !activeCountryRaw\)/);
  assert.doesNotMatch(js, /activeCountryNorm = normCountry\([^;]*'BANGLADESH'/);
});
