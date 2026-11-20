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
  const original = '/* runtime banner */\n(function (global) { global.OmegaResourceResearchRuntime = { ready: true }; })(window);';
  const compiled = 'var M = function () { return \'object-spread-helper\'; };\n' +
    'var m = function () { return \'descriptor-helper\'; };\n' +
    '(function (global) { global.OmegaResourceResearchRuntime = { ready: true }; })(window);';
  const scoped = scopeTranspiledAndroidAsset('omega_resource_research_runtime_v1.js', original, compiled);
  const context = vm.createContext({});
  context.window = context;

  vm.runInContext(scoped, context);

  assert.equal(context.M, undefined);
  assert.equal(context.m, undefined);
  assert.deepEqual({ ...context.OmegaResourceResearchRuntime }, { ready: true });
});

test('later classic assets cannot overwrite Resource Research transpile helpers', () => {
  const original = '/* runtime banner */\n(function (global) { global.mergeResearchProject = project => m(M({}, project), { progress: 100 }); })(window);';
  const compiled = [
    'var M = (target, source) => Object.assign(target, source);',
    'var m = (target, descriptors) => Object.defineProperties(target, Object.getOwnPropertyDescriptors(descriptors));',
    '(function (global) { global.mergeResearchProject = project => m(M({}, project), { progress: 100 }); })(window);'
  ].join('\n');
  const competingAsset = [
    'var M = (target, source) => undefined;',
    'var m = (target, descriptors) => Object.defineProperties(target, Object.getOwnPropertyDescriptors(descriptors));'
  ].join('\n');

  const unscoped = vm.createContext({});
  unscoped.window = unscoped;
  vm.runInContext(compiled, unscoped);
  vm.runInContext(competingAsset, unscoped);
  assert.throws(() => unscoped.mergeResearchProject({ projectId: 'R-1' }), error => error?.name === 'TypeError');

  const scoped = vm.createContext({});
  scoped.window = scoped;
  vm.runInContext(scopeTranspiledAndroidAsset('omega_resource_research_runtime_v1.js', original, compiled), scoped);
  vm.runInContext(competingAsset, scoped);
  assert.deepEqual({ ...scoped.mergeResearchProject({ projectId: 'R-1' }) }, {
    projectId: 'R-1',
    progress: 100
  });
});

test('ordinary top-level scripts retain their intentional global declarations', () => {
  const original = 'window.OMEGA_LEGACY_BOOT = true;\nvar OMEGA_LEGACY_GLOBAL = 42;';
  const compiled = 'var OMEGA_LEGACY_GLOBAL = 42; window.OMEGA_LEGACY_BOOT = true;';
  const context = vm.createContext({});
  context.window = context;

  vm.runInContext(scopeTranspiledAndroidAsset('legacy-global.js', original, compiled), context);

  assert.equal(context.OMEGA_LEGACY_GLOBAL, 42);
  assert.equal(context.OMEGA_LEGACY_BOOT, true);
});
