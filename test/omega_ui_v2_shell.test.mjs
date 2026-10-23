import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('Atlas Command shell is loaded after existing UI without deleting legacy wiring', () => {
  const html = read('index.html');
  assert.match(html, /href="omega_ui_v2\.css"/);
  assert.match(html, /src="omega_ui_v2\.js"/);
  assert.ok(html.indexOf('omega_ui_v2.css') < html.indexOf('omega_ui_v2.js'));
  assert.match(html, /id="ui-engine-root"/);
  assert.match(html, /id="render-engine-root"/);
  assert.match(html, /omega_country_runtime_data_v1\.js/);
  assert.match(html, /omega_ui_photo_asset_system_v1\.js/);
});

test('v2 navigation keeps country context separate from five primary tabs', () => {
  const js = read('omega_ui_v2.js');
  for (const tab of ['Home','World','Government','Economy','More']) assert.ok(js.includes("label:'" + tab + "'"));
  assert.match(js, /data-v2-picker/);
  assert.match(js, /OMEGA_UI_V2_COUNTRY_CONTEXT_CHANGED/);
  assert.match(js, /This is a UI browsing context, not an assignment of player sovereignty/);
  assert.match(js, /Executive Ministry/);
  assert.match(js, /All Ministries/);
  assert.doesNotMatch(js, /data-v2-gov-tab="overview"/);
});

test('source values and chart provenance are honest; no hardcoded economic samples or CDN', () => {
  const js = read('omega_ui_v2.js');
  assert.match(js, /OmegaCountryRuntimeData/);
  assert.match(js, /getCountrySeries/);
  assert.match(js, /Not recorded/);
  assert.match(js, /Scenario preview/);
  assert.match(js, /Committed game-turn data/);
  assert.match(js, /Missing history is not replaced with invented points/);
  assert.doesNotMatch(js, /https?:\/\//i);
  assert.doesNotMatch(js, /recharts|cdn\.jsdelivr|unpkg\.com/i);
});

test('photos are local WebP from the pre-existing licensed catalog; native modules are reversible', () => {
  const js = read('omega_ui_v2.js');
  const css = read('omega_ui_v2.css');
  assert.match(js, /OmegaUIPhotoAssets/);
  assert.match(js, /assets\\\/ui-photos\\\//);
  assert.match(js, /data-v2-native/);
  assert.match(js, /Return to Atlas Command/);
  assert.match(css, /--ov2-bg/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /overscroll-behavior:contain/);
  assert.match(css, /min-height:48px/);
});

test('Government has two primary cabinet choices and the legacy snapshot remains present', () => {
  const js = read('omega_ui_v2.js');
  assert.match(js, /data-v2-gov-tab="executive"/);
  assert.match(js, /data-v2-gov-tab="all"/);
  assert.match(js, /Country Overview/);
  assert.ok(fs.existsSync(path.join(root, 'legacy-ui/2026-10-24/MANIFEST.json')));
  assert.ok(fs.existsSync(path.join(root, 'legacy-ui/2026-10-24/index.html')));
});
