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
  const { behavior, adaptive } = await loadCountryEngines();
  const bangladesh = behavior.getBehaviorProfile('BGD');
  const unitedStates = behavior.getBehaviorProfile('USA');
  assert.equal(bangladesh.schemaVersion, 'OMEGA_COUNTRY_BEHAVIOR_PROFILE_V1');
  assert.notEqual(bangladesh.status, 'ENGINE_ERROR');
  assert.notEqual(unitedStates.status, 'ENGINE_ERROR');
  assert.ok(bangladesh.metrics.gdpUsd > 0, 'GDP should come from the existing country source');
  assert.ok(unitedStates.metrics.gdpUsd > bangladesh.metrics.gdpUsd, 'recorded GDP should differ by country');
  assert.ok(bangladesh.metrics.economicInfluenceIndex !== null, 'existing custom economic influence index should be consumed');
  assert.ok(bangladesh.dimensions.economicCapacity.value !== null, 'economic capacity should be available where the index exists');
  assert.notEqual(bangladesh.dimensions.economicCapacity.value, unitedStates.dimensions.economicCapacity.value,
    'economic capacity should reflect country-specific economic inputs');
  assert.equal(bangladesh.domainSignals.resources.availability, 'AVAILABLE');
  assert.ok(bangladesh.domainSignals.resources.siteCount > 0, 'Bangladesh gameplay site identities should be counted');
  assert.equal(bangladesh.domainSignals.resources.simulatedReserveQuantitiesUsed, false);
  assert.notDeepEqual(bangladesh.dimensions, unitedStates.dimensions, 'country behaviour dimensions must not be a copied universal preset');
  assert.ok(bangladesh.actionPreferences.PROCESSING_EXPANSION || bangladesh.actionPreferences.INDUSTRY_BUILD,
    'registered resource-site data should create a country-specific industrial action preference');
  const investmentAction = bangladesh.actionPreferences.PROCESSING_EXPANSION ? 'PROCESSING_EXPANSION' : 'INDUSTRY_BUILD';
  const investmentScore = adaptive.scoreAction('BGD', investmentAction);
  assert.ok(investmentScore.actionPreference, 'country-specific action preferences should be read by the adaptive scorer');
  const dimensionMean = investmentScore.dimensions.reduce((sum, row) => sum + row.utility, 0) / investmentScore.dimensions.length;
  assert.ok(Math.abs(investmentScore.score - (0.7 * dimensionMean + 0.3 * investmentScore.actionPreference.value)) < 0.000001,
    'candidate strategy score should combine country dimensions with the registered action preference');
  assert.ok(bangladesh.evidence.registeredMacroMetricCount > 0);
  assert.match(bangladesh.evidence.missingDataPolicy, /NULL/);
  assert.equal(behavior.diagnostics().dimensionCount, 11);
});

test('all canonical country and territory identities build a non-error behaviour profile with explicit evidence state', async () => {
  const { runtime, behavior } = await loadCountryEngines();
  const countries = runtime.listProfiles();
  assert.ok(countries.length >= 249, 'existing canonical roster should remain available');
  const signatures = new Set();
  const failures = [];
  for (const row of countries) {
    const profile = behavior.getBehaviorProfile(row.iso3 || row.countryCode);
    if (!profile || profile.status === 'ENGINE_ERROR') {
      failures.push({ country: row.name, code: row.iso3 || row.countryCode, error: profile?.evidence?.error || 'NO_PROFILE' });
      continue;
    }
    assert.equal(profile.dimensions && Object.keys(profile.dimensions).length, 11,
      'eleven runtime behaviour dimensions are returned for ' + row.name);
    for (const dimension of Object.values(profile.dimensions)) {
      if (dimension.value !== null) {
        assert.ok(Number.isFinite(dimension.value) && dimension.value >= 0 && dimension.value <= 1,
          'derived behaviour values are normalised for ' + row.name);
        assert.ok(dimension.availability && dimension.source,
          'every scored dimension declares availability and source for ' + row.name);
      }
    }
    signatures.add(JSON.stringify({
      status: profile.status,
      dimensions: Object.fromEntries(Object.entries(profile.dimensions).map(([key, item]) => [key, item.value])),
      sites: profile.domainSignals.resources.siteCount,
      options: Object.keys(profile.actionPreferences || {}).sort()
    }));
  }
  assert.deepEqual(failures, [], 'no country-specific runtime profile should throw');
  assert.ok(signatures.size > 20, 'country records should produce differentiated runtime signatures, not a common preset');
});

test('missing economic evidence stays null instead of creating a fictitious GDP or risk appetite', async () => {
  const { behavior } = await loadCountryEngines();
  const profile = behavior.getBehaviorProfile('AX');
  assert.notEqual(profile.status, 'ENGINE_ERROR');
  assert.equal(profile.metrics.gdpUsd, null);
  assert.equal(profile.dimensions.riskAppetite.value, null);
  assert.equal(profile.dimensions.tradeDependence.value, null);
  assert.equal(profile.domainSignals.military.expenditurePctGdp, null);
  assert.match(profile.evidence.limitations.join(' '), /Missing|Military|baseline/i);
});

test('live metrics are resolved from secondary supported runtime state roots', async () => {
  const { context, behavior } = await loadCountryEngines();
  context.Game = { state: {} };
  context.Omega.Simulation = {
    state: { economy: { BGD: { gdp: 987654321, gdpGrowthPct: 7.25 } } }
  };
  const profile = behavior.getBehaviorProfile('BGD');
  assert.equal(profile.metrics.gdpUsd, 987654321);
  assert.equal(profile.metrics.gdpGrowthPct, 7.25);
  assert.match(profile.metricSources.gdpUsd.source, /LIVE_GAME_STATE\.economy\.gdp/);
});

test('authoritative resource inventory and production gaps alter supply behaviour and priorities', async () => {
  const { context, behavior } = await loadCountryEngines();
  context.OmegaResourceAuthoritativeAdapter = {
    getSummary() {
      return {
        countryId: 'ALA',
        live: { countryName: 'Test Territory' },
        resourcesList: [
          { id: 'OIL', name: 'Oil', source: 'Game.state.resource', availability: 'AVAILABLE',
            inventory: 0, dailyProduction: 0, dailyConsumption: 10, reserve: null, stockDays: 0, selfSufficiencyRatio: 0 },
          { id: 'GAS', name: 'Gas', source: 'Game.state.resource', availability: 'AVAILABLE',
            inventory: 4, dailyProduction: 4, dailyConsumption: 8, reserve: null, stockDays: 0.5, selfSufficiencyRatio: 50 }
        ]
      };
    }
  };

  const profile = behavior.getBehaviorProfile('AX');
  const signals = profile.domainSignals.resources.runtimeState;
  assert.equal(signals.availability, 'AVAILABLE');
  assert.equal(signals.inventoryObservedCount, 2);
  assert.equal(signals.productionObservedCount, 2);
  assert.equal(signals.consumptionObservedCount, 2);
  assert.equal(signals.productionDeficitCount, 2);
  assert.equal(signals.productionDeficitResources.length, 2);
  assert.ok(signals.supplyPressure > 0.7 && signals.supplyPressure < 0.9);
  assert.ok(profile.priorityStack.some(row => row.domain === 'RESOURCE_STOCK_OR_PRODUCTION_DEFICIT'));
  assert.ok(profile.actionPreferences.IMPORT || profile.actionPreferences.SUBSTITUTION || profile.actionPreferences.SUPPLIER_CHANGE);
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
  assert.match(ui, /resourceRuntime\.availability/);
  assert.match(ui, /observed inventories/);
  assert.match(ui, /setActiveTab/);
  assert.match(ui, /OMEGA_COUNTRY_CONTEXT_CHANGED/);
  assert.match(ui, /Simulation state remains unchanged/);
  assert.match(ui, /the game does not substitute invented stock or production/i);

  const sw = read('omega-offline-map-sw.js');
  assert.match(sw, /omega-offline-atlas-shell-v10/);
  assert.match(sw, /omega_country_behavior_engine_v1\.js/);
  assert.match(sw, /omega_country_overview_ministry_ui_v1\.js/);
  assert.match(sw, /resource_site_reserve_simulation_v1\.json/);
  assert.match(read('server_bootstrap.js'), /'omega_country_behavior_engine_v1\.js',\s*'omega_opponent_adaptive_strategy_system\.js'/);
  assert.match(read('style.css'), /\.omega-country-overview-tabs/);

  const autonomy = read('omega_opponent_autonomy_system.js');
  const weightBlock = autonomy.match(/const DECISION_WEIGHTS=Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(weightBlock, 'autonomy decision weights should remain inspectable');
  const weights = Array.from(weightBlock[1].matchAll(/\b[A-Za-z][A-Za-z0-9]*:([0-9.]+)/g), match => Number(match[1]));
  assert.ok(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 0.000001,
    'decision weights must still total 100%');
  assert.equal(Number(weightBlock[1].match(/\bstrategy:([0-9.]+)/)?.[1]), 0.12,
    'country adaptive strategy should have a 12% candidate score weight');
  assert.match(read('country-ios.js'), /RUNTIME COUNTRY BEHAVIOUR/);
});
