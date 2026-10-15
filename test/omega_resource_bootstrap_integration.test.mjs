import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('canonical resource registry readiness bootstraps extraction and refreshes OPS Live', () => {
  const html = read('index.html');
  const endowmentScript = html.indexOf('src="omega_resource_endowment_runtime.js"');
  const siteBindingScript = html.indexOf('src="omega_resource_gameplay_binding_v1.js"');
  const liveOpsScript = html.indexOf('src="omega_live_operations_observability_v1.js"');

  assert.ok(endowmentScript >= 0 && siteBindingScript > endowmentScript && liveOpsScript > siteBindingScript,
    'runtime listeners must be loaded before site binding emits readiness, and OPS Live must listen afterward');

  const binding = read('omega_resource_gameplay_binding_v1.js');
  const registryPublished = binding.indexOf('g.Omega.IndividualResourceSiteBinding={version:VERSION,sites');
  const readyStatus = binding.indexOf("setStatus('READY ·");
  const readyEvent = binding.indexOf("new g.CustomEvent('OMEGA_RESOURCE_SITE_BINDING_READY'");
  assert.ok(registryPublished >= 0, 'binding must publish the shared canonical site registry');
  assert.ok(readyStatus > registryPublished && readyEvent > readyStatus,
    'site-ready notification must fire only after the canonical registry is published and marked ready');
  assert.ok(binding.includes('siteCount:sites.length'), 'the readiness event must expose actual registry size');

  const endowment = read('omega_resource_endowment_runtime.js');
  assert.ok(endowment.includes('function onSiteBindingReady()'), 'endowment runtime must handle site readiness');
  assert.ok(endowment.includes("g.addEventListener?.('OMEGA_RESOURCE_SITE_BINDING_READY',onSiteBindingReady)"),
    'site readiness must be wired to the authoritative extraction runtime');
  assert.ok(endowment.includes("if(initialized?.status!=='READY')"),
    'extraction must not run when authoritative initialization failed');
  assert.ok(endowment.includes('const result=await extractAll();'),
    'successful initialization must trigger the idempotent authoritative extraction pipeline');
  assert.ok(endowment.includes('__omegaResourceEndowmentLastBootstrap'),
    'bootstrap outcome must remain inspectable instead of failing silently');

  const liveOps = read('omega_live_operations_observability_v1.js');
  const hotEvents = liveOps.slice(liveOps.indexOf('const HOT_EVENTS = ['), liveOps.indexOf('];', liveOps.indexOf('const HOT_EVENTS = [')));
  assert.ok(hotEvents.includes("'OMEGA_RESOURCE_SITE_BINDING_READY'"),
    'OPS Live must observe the registry readiness event');
  assert.ok(liveOps.includes('if (panelOpen) render();'),
    'new runtime events must refresh an already-open OPS Live panel');
});
