import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {
  isSelfInvokingClassicScript,
  scopeTranspiledAndroidAsset
} from '../scripts/android_web_asset_scope.mjs';

test('Resource Research runtime is recognized as a self-invoking classic script', () => {
  const source = readFileSync(new URL('../omega_resource_research_runtime_v1.js', import.meta.url), 'utf8');
  assert.equal(isSelfInvokingClassicScript(source), true);
});

test('transpiled helpers stay local while the runtime API remains globally published', () => {
  const original = \`/* runtime banner */
(function (global) {
  global.OmegaResourceResearchRuntime = { ready: true };
})(window);\`;
  const compiled = \`var M = function () { return 'object-spread-helper'; };
var m = function () { return 'descriptor-helper'; };
(function (global) { global.OmegaResourceResearchRuntime = { ready: true }; })(window);\`;
  const scoped = scopeTranspiledAndroidAsset(original, compiled);
  const context = vm.createContext({});
  context.window = context;

  vm.runInContext(scoped, context);

  assert.equal(context.M, undefined);
  assert.equal(context.m, undefined);
  assert.deepEqual({ ...context.OmegaResourceResearchRuntime }, { ready: true });
});

test('ordinary top-level scripts retain their intentional global declarations', () => {
  const original = \`window.OMEGA_LEGACY_BOOT = true;
var OMEGA_LEGACY_GLOBAL = 42;\`;
  const compiled = \`var OMEGA_LEGACY_GLOBAL = 42; window.OMEGA_LEGACY_BOOT = true;\`;
  const context = vm.createContext({});
  context.window = context;

  vm.runInContext(scopeTranspiledAndroidAsset(original, compiled), context);

  assert.equal(context.OMEGA_LEGACY_GLOBAL, 42);
  assert.equal(context.OMEGA_LEGACY_BOOT, true);
});
