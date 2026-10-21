import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANDROID_WEBVIEW_TARGET,
  transpileJavaScript,
  transpileInlineScripts,
  injectCompatibilityScript,
  ANDROID_WEBVIEW_POLYFILL_PATH,
  ANDROID_WEBVIEW_POLYFILL_SOURCE
} from '../scripts/build_android_web_compat_assets.mjs';

test('Android WebView target lowers optional chaining and nullish coalescing', async () => {
  const source = 'function read(value) { return value?.nested?.answer ?? 7; }';
  const output = await transpileJavaScript(source, 'compat-test.js');
  assert.equal(ANDROID_WEBVIEW_TARGET, 'chrome66');
  assert.doesNotMatch(output, /\?\./);
  assert.doesNotMatch(output, /\?\?/);
  assert.match(output, /function read/);
});

test('inline JavaScript is transpiled without rewriting non-JavaScript or external script tags', async () => {
  const html = [
    '<!doctype html>',
    '<script>window.result = window.Omega?.Simulation ?? null;</script>',
    '<script type="application/json">{"literal":"?. must remain text"}</script>',
    '<script src="runtime.js"></script>',
    ''
  ].join('\n');

  const output = await transpileInlineScripts(html, 'fixture.html');
  assert.doesNotMatch(output, /window\.Omega\?\./);
  assert.doesNotMatch(output, /Simulation\s*\?\?/);
  assert.match(output, /<script type="application\/json">\{"literal":"\?\. must remain text"\}<\/script>/);
  assert.match(output, /<script src="runtime\.js"><\/script>/);
});


test('emoji icon matching does not use an unsupported Unicode-property regex literal', async () => {
  const { readFile } = await import('node:fs/promises');
  const iconSource = await readFile(new URL('../omega_icon_system_v1.js', import.meta.url), 'utf8');
  assert.doesNotMatch(iconSource, /\/\\p\{Extended_Pictographic\}/,
    'old WebView must not have to parse an Extended_Pictographic regex literal');
  assert.match(iconSource, /new RegExp\('\\?\\\\p\{Extended_Pictographic\}/,
    'the precise matcher must be created dynamically so unsupported Unicode properties can be caught');
  assert.match(iconSource, /catch\s*\(_\)\s*\{\s*ICON_RE\s*=\s*new RegExp/s,
    'a legacy-safe matcher must be provided when the Unicode property is unsupported');
});


test('legacy WebView polyfills are inline, synchronous, and precede every page script', () => {
  assert.match(ANDROID_WEBVIEW_POLYFILL_SOURCE, /Object\.fromEntries/);
  assert.match(ANDROID_WEBVIEW_POLYFILL_SOURCE, /Array\.prototype\.flatMap/);
  assert.doesNotMatch(ANDROID_WEBVIEW_POLYFILL_SOURCE, /\?\./);
  assert.doesNotMatch(ANDROID_WEBVIEW_POLYFILL_SOURCE, /\?\?/);
  const input = '<!doctype html><html><head><title>OMEGA</title></head><body><script src="runtime.js"></script></body></html>';
  const output = injectCompatibilityScript(input);
  const marker = 'id="omega-android-webview-compat"';
  assert.ok(output.indexOf(marker) >= 0 && output.indexOf(marker) < output.indexOf('runtime.js'));
  assert.match(output, /window\.__OMEGA_ANDROID_WEBVIEW_COMPAT__/);
  assert.equal(output.split(marker).length - 1, 1);
  assert.equal(injectCompatibilityScript(output), output, 'injecting twice must not duplicate the polyfill');
});
