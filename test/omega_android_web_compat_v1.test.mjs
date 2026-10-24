import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, root), 'utf8');
const compatibility = read('omega_android_compat_v1.js');
const html = read('index.html');
const iconSource = read('omega_icon_system_v1.js');
const smokeSource = read('android/app/src/androidTest/java/com/omega/globalsupremecommander/OmegaGameplaySmokeTest.java');

test('Android compatibility shim provides one-level Array.flatMap semantics on a legacy WebView', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext('delete Array.prototype.flatMap;', context);
  assert.equal(vm.runInContext('typeof Array.prototype.flatMap', context), 'undefined');

  vm.runInContext(compatibility, context, { filename: 'omega_android_compat_v1.js', timeout: 1000 });

  assert.equal(vm.runInContext('typeof Array.prototype.flatMap', context), 'function');
  assert.equal(
    vm.runInContext('[1, 2, 3].flatMap(function (value, index) { return [value, index]; }).join(",")', context),
    '1,0,2,1,3,2'
  );
  assert.equal(
    vm.runInContext('[1, 2, 3].flatMap(function (value) { return value % 2 ? [value] : value; }).join(",")', context),
    '1,2,3'
  );
  assert.equal(
    vm.runInContext('Object.prototype.hasOwnProperty.call([, 2].flatMap(function (value) { return [value]; }), "0")', context),
    true
  );
});

test('compatibility shim executes before the app bootstrap and deferred runtime scripts', () => {
  const compatTagIndex = html.indexOf('<script src="omega_android_compat_v1.js"></script>');
  assert.ok(compatTagIndex >= 0, 'index.html must synchronously load the local compatibility shim');
  assert.ok(compatTagIndex < html.indexOf('<script>'), 'shim must run before inline startup code');
  assert.ok(compatTagIndex < html.indexOf('<script src="omega_icon_system_v1.js"'), 'shim must run before the icon system');
});

test('icon system can be parsed by legacy Chromium without Unicode property-escape syntax', () => {
  assert.ok(iconSource.includes("new RegExp('\\\\p{Extended_Pictographic}"));
  assert.ok(!iconSource.includes('const ICON_RE = /\\p{Extended_Pictographic}'));
  assert.ok(iconSource.includes('catch (_unsupportedUnicodePropertyEscape)'));
  assert.ok(iconSource.includes('const pictograph ='));
});

test('Android 9 smoke treats legacy runtime compatibility as a boot requirement', () => {
  assert.ok(smokeSource.includes("typeof Array.prototype.flatMap === 'function'"));
  assert.ok(smokeSource.includes('window.OMEGA_ICON_SYSTEM_V1'));
});


test('Android asset sync packages every local OMEGA UI v2 module referenced by the app shell', () => {
  const gradle = read('android/app/build.gradle');
  const serviceWorker = read('omega-offline-map-sw.js');
  const requiredAssets = [
    'omega_ui_v2/omega-ui-v2.css',
    'omega_ui_v2/navigation-registry.js',
    'omega_ui_v2/screens/government.js',
    'omega_ui_v2/screens/ministry-detail.js',
    'omega_ui_v2/screens/economy.js',
    'omega_ui_v2/screens/resource-ministry.js',
    'omega_ui_v2/screens/mine-detail.js',
    'omega_ui_v2/screens/industry.js',
    'omega_ui_v2/screens/home-affairs.js',
    'omega_ui_v2/screens/police-fleet.js',
    'omega_ui_v2/screens/reports.js',
    'omega_ui_v2/app.js',
    'omega_ui_v2/integration.js',
    'omega_ui_v2/world-command-dock.js'
  ];

  assert.match(gradle, /include ['"]omega_ui_v2\/\*\*['"]/,
    'Android asset sync must copy the nested UI-v2 modules into APK assets');
  for (const asset of requiredAssets) {
    assert.ok(html.includes(asset), 'index.html must reference ' + asset);
    assert.ok(serviceWorker.includes('"./' + asset + '"'), 'offline cache must include ' + asset);
  }
});
