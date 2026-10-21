import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANDROID_WEBVIEW_TARGET,
  transpileJavaScript,
  transpileInlineScripts
} from '../scripts/build_android_web_compat_assets.mjs';

test('Android WebView target lowers optional chaining and nullish coalescing', async () => {
  const source = 'function read(value) { return value?.nested?.answer ?? 7; }';
  const output = await transpileJavaScript(source, 'compat-test.js');
  assert.equal(ANDROID_WEBVIEW_TARGET, 'chrome70');
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
