import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('canonical site binding notifies the extraction runtime only after publishing a ready registry', () => {
  const html = read('index.html');
  const endowmentScript = html.indexOf('src="omega_resource_endowment_runtime.js"');
  const bindingScript = html.indexOf('src="omega_resource_gameplay_binding_v1.js"');
  const liveOpsScript = html.indexOf('src="omega_live_operations_observability_v1.js"');
  assert.ok(endowmentScript >= 0 && bindingScript > endowmentScript && liveOpsScript > bindingScript,
    'runtime listeners must load before the site binding event and LiveOps listener');

  const binding = read('omega_resource_gameplay_binding_v1.js');
  const registryPublished = binding.indexOf('g.Omega.IndividualResourceSiteBinding={version:VERSION,sites');
  const readyStatus = binding.indexOf("setStatus('Resource site data loaded.')");
  const readyEvent = binding.indexOf("new g.CustomEvent('OMEGA_RESOURCE_SITE_BINDING_READY'");
  assert.ok(registryPublished >= 0, 'the shared site registry must be published first');
  assert.ok(readyStatus > registryPublished && readyEvent > readyStatus,
    'the successful data status must be set before the synchronous site-ready event');
  assert.ok(binding.includes('siteCount:sites.length'), 'the event must expose the real bound-site count');
});

test('site readiness starts the idempotent extraction runtime and exposes per-site readiness evidence', () => {
  const runtime = read('omega_resource_endowment_runtime.js');
  assert.ok(runtime.includes('function onSiteBindingReady()'));
  assert.ok(runtime.includes("g.addEventListener?.('OMEGA_RESOURCE_SITE_BINDING_READY',onSiteBindingReady)"));
  assert.ok(runtime.includes('const result=await extractAll();'),
    'registry readiness must trigger the authoritative country extraction pass');
  assert.ok(runtime.includes('productionCapableSiteCount'));
  assert.ok(runtime.includes('productionCapablePercent'));
  assert.ok(runtime.includes('currentTurnProducingSiteCount'));
  assert.ok(runtime.includes('blockedSites:blockedSites.slice(0,80)'),
    'the bootstrap status must preserve sample site IDs and blocker reasons');
  assert.ok(runtime.includes("new g.CustomEvent('OMEGA_RESOURCE_BOOTSTRAP_STATUS'"),
    'the runtime must emit a visible bootstrap result');
  assert.ok(runtime.includes('lastBootstrap:clone(g.__omegaResourceEndowmentLastBootstrap||null)'),
    'runtime diagnostics must expose the last bootstrap result');
  assert.ok(runtime.includes("siteReferenceKey:x.siteReferenceKey||null"),
    'production ledgers must retain the canonical site identity');
});

test('OPS Live observes bootstrap events and reports capability separately from actual current-turn production', () => {
  const liveOps = read('omega_live_operations_observability_v1.js');
  const hotStart = liveOps.indexOf('const HOT_EVENTS = [');
  const hotEnd = liveOps.indexOf('];', hotStart);
  const hotEvents = liveOps.slice(hotStart, hotEnd);
  assert.ok(hotEvents.includes("'OMEGA_RESOURCE_SITE_BINDING_READY'"));
  assert.ok(hotEvents.includes("'OMEGA_RESOURCE_BOOTSTRAP_STATUS'"));
  assert.ok(liveOps.includes('function renderProductionReadiness()'));
  assert.ok(liveOps.includes("card('Production-capable sites'"));
  assert.ok(liveOps.includes("card('Producing sites this turn'"),
    'a linked/eligible site must not be presented as producing unless current-turn output is recorded');
  assert.ok(liveOps.includes('if (panelOpen) scheduleRender();'),
    'event refreshes must retain the current bounded render scheduler');
  assert.ok(liveOps.includes('simulated reserves/rates are game values'),
    'the dashboard must distinguish simulation values from observed data');
});

test('the bootstrap regression is included in the existing LiveOps test gate', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts['test:liveops'].includes('test/omega_resource_bootstrap_integration.test.mjs'));
});
