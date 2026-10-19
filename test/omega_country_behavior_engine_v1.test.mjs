import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function makeContext() {
  const listeners = new Map();
  class TestCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail || null;
    }
  }
  const context = {
    console,
    CustomEvent: TestCustomEvent,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) handler(event);
      return true;
    },
    fetch: async input => {
      const relative = String(input).replace(/^\.?\//, '').split(/[?#]/)[0];
      const full = path.join(root, relative);
      if (!fs.existsSync(full)) {
        return { ok: false, status: 404, json: async () => { throw new Error('NOT_FOUND:' + relative); } };
      }
      const body = fs.readFileSync(full, 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('omega_country_runtime_data_v1.js'), context, { filename: 'omega_country_runtime_data_v1.js' });
  return context;
}

async function loadCountryEngines() {
  const context = makeContext();
  const runtime = context.OmegaCountryRuntimeData;
  assert.ok(runtime, 'shared country runtime should register');
  assert.equal(await runtime.ready, true, 'shared country runtime should initialize');
  assert.equal(typeof runtime.listProfiles, 'function', 'runtime should list canonical country identities');
  vm.runInContext(read('omega_country_behavior_engine_v1.js'), context, { filename: 'omega_country_behavior_engine_v1.js' });
  const behavior = context.OmegaCountryBehaviorEngine;
  assert.ok(behavior, 'country behaviour engine should register');
  assert.equal(await behavior.init(), true, 'gameplay-site catalog should load');
  vm.runInContext(read('omega_opponent_adaptive_strategy_system.js'), context, { filename: 'omega_opponent_adaptive_strategy_system.js' });
  const adaptive = context.OmegaOpponentAdaptiveStrategy;
  assert.ok(adaptive, 'adaptive opponent engine should register');
  return { context, runtime, behavior, adaptive };
}

test('runtime exposes a complete canonical country selection list without duplicate country codes', async () => {
  const { runtime } = await loadCountryEngines();
  const rows = runtime.listProfiles();
  assert.ok(rows.length >= 249, 'country and territory selection should cover the existing canonical roster');
  const codes = rows.map(row => row.countryCode);
  assert.equal(new Set(codes).size, codes.length, 'listProfiles should deduplicate ISO-2 country identity');
  assert.ok(rows.some(row => row.countryCode === 'BD' && row.iso3 === 'BGD'), 'Bangladesh should expose the canonical codes');
  assert.ok(rows.some(row => row.countryCode === 'US' && row.iso3 === 'USA'), 'United States should expose the canonical codes');
});

test('country behaviour profile is evidence-backed and differs with country macro data and game assets', async () => {
  const { behavior } = await loadCountryEngines();
  const bangladesh = behavior.getBehaviorProfile('BGD');
  const unitedStates = behavior.getBehaviorProfile('USA');
  assert.equal(bangladesh.schemaVersion, 'OMEGA_COUNTRY_BEHAVIOR_PROFILE_V1');
  assert.notEqual(bangladesh.status, 'ENGINE_ERROR');
  assert.notEqual(unitedStates.status, 'ENGINE_ERROR');
  assert.ok(bangladesh.metrics.gdpUsd > 0, 'GDP should come from the existing country source');
  assert.ok(unitedStates.metrics.gdpUsd > bangladesh.metrics.gdpUsd, 'recorded GDP should differ by country');
  assert.equal(bangladesh.domainSignals.resources.availability, 'AVAILABLE');
  assert.ok(bangladesh.domainSignals.resources.siteCount > 0, 'Bangladesh gameplay site identities should be counted');
  assert.equal(bangladesh.domainSignals.resources.simulatedReserveQuantitiesUsed, false);
  assert.notDeepEqual(bangladesh.dimensions, unitedStates.dimensions, 'country behaviour dimensions must not be a copied universal preset');
  assert.ok(bangladesh.evidence.registeredMacroMetricCount > 0);
  assert.match(bangladesh.evidence.missingDataPolicy, /NULL/);
  assert.equal(behavior.diagnostics().dimensionCount, 10);
});

test('missing economic evidence stays null instead of creating a fictitious GDP or risk appetite', async () => {
  const { behavior } = await loadCountryEngines();
  const profile = behavior.getBehaviorProfile('Åland Islands');
  assert.notEqual(profile.status, 'ENGINE_ERROR');
  assert.equal(profile.metrics.gdpUsd, null);
  assert.equal(profile.dimensions.riskAppetite.value, null);
  assert.equal(profile.dimensions.tradeDependence.value, null);
  assert.equal(profile.domainSignals.military.expenditurePctGdp, null);
  assert.match(profile.evidence.limitations.join(' '), /Missing|Military|baseline/i);
});

test('adaptive decision scoring consumes country behaviour but respects explicit country doctrine', async () => {
  const { context, adaptive } = await loadCountryEngines();
  const baseline = adaptive.scoreAction('BGD', 'MILITARY_EQUIP');
  assert.equal(baseline.known, true, 'derived behaviour dimensions should supply action preference factors');
  assert.equal(adaptive.profile('BGD').behaviorSource, 'OMEGA_COUNTRY_BEHAVIOR_ENGINE_V1');
  assert.ok(adaptive.profile('BGD').derivedDimensionCount > 0);

  context.Game = { state: { cabinet: { BGD: { strategyProfile: { riskAppetite: 0.97 } } } } };
  const explicitProfile = adaptive.profile('BGD');
  assert.equal(explicitProfile.dimensions.riskAppetite.value, 0.97);
  assert.equal(explicitProfile.dimensions.riskAppetite.availability, 'EXPLICIT_COUNTRY_DOCTRINE');
  const explicit = adaptive.scoreAction('BGD', 'MILITARY_EQUIP');
  assert.notEqual(explicit.score, baseline.score, 'explicit doctrine must affect action preference');
  assert.ok(explicit.dimensions.some(row => row.dimension === 'riskAppetite' && row.value === 0.97));

  context.Game = { state: {} };
  const recalculated = adaptive.profile('BGD');
  assert.notEqual(recalculated.dimensions.riskAppetite.value, 0.97, 'derived heuristics should return when the explicit override is absent');
});

test('country overview is inside ministry dashboard, uses shared behaviour runtime, and remains cached for offline play', () => {
  const html = read('index.html');
  const start = html.indexOf('<div id="ministry-dashboard-view"');
  const countryTab = html.indexOf('id="omega-country-overview-tabs"', start);
  const overviewPanel = html.indexOf('id="omega-country-overview-panel"', countryTab);
  const ministryWorkspace = html.indexOf('id="ministry-dashboard-content"', overviewPanel);
  assert.ok(start >= 0 && countryTab > start && overviewPanel > countryTab && ministryWorkspace > overviewPanel);
  assert.match(html, /omega_country_behavior_engine_v1\.js/);
  assert.match(html, /omega_country_overview_ministry_ui_v1\.js/);
  assert.ok(html.indexOf('omega_country_behavior_engine_v1.js') < html.indexOf('omega_opponent_adaptive_strategy_system.js'));

  const ui = read('omega_country_overview_ministry_ui_v1.js');
  assert.match(ui, /getBehaviorProfile/);
  assert.match(ui, /getStrategicProfile/);
  assert.match(ui, /setActiveTab/);
  assert.match(ui, /OMEGA_COUNTRY_CONTEXT_CHANGED/);
  assert.match(ui, /Simulation state remains unchanged/);
  assert.match(ui, /simulated reserve quantities are not treated as factual national geology/i);

  const sw = read('omega-offline-map-sw.js');
  assert.match(sw, /omega-offline-atlas-shell-v10/);
  assert.match(sw, /omega_country_behavior_engine_v1\.js/);
  assert.match(sw, /omega_country_overview_ministry_ui_v1\.js/);
  assert.match(sw, /resource_site_reserve_simulation_v1\.json/);
  assert.match(read('server_bootstrap.js'), /'omega_country_behavior_engine_v1\.js',\s*'omega_opponent_adaptive_strategy_system\.js'/);
  assert.match(read('style.css'), /#omega-country-overview-tabs/);
  assert.match(read('country-ios.js'), /RUNTIME COUNTRY BEHAVIOUR/);
});
