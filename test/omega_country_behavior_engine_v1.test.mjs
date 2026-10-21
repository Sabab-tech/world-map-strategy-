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
  vm.runInContext(read('omega_country_general_data_runtime_v1.js'), context, { filename: 'omega_country_general_data_runtime_v1.js' });
  const generalData = context.OmegaCountryGeneralDataRuntime;
  assert.ok(generalData, 'unified country general data runtime should register');
  assert.equal(await generalData.init(), true, 'unified source-backed country registry should initialize');
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
  assert.ok(Math.abs(investmentScore.score - (0.7 * dimensionMean + 0.3 * investmentScore.actionPreference.scoredValue)) < 0.000001,
    'candidate strategy score should combine confidence-adjusted dimensions and confidence-adjusted action preference');
  assert.ok(Number.isFinite(investmentScore.rawScore) && investmentScore.rawScore >= 0 && investmentScore.rawScore <= 1,
    'the unadjusted evidence score must remain visible as a normalized diagnostic');
  assert.equal(investmentScore.uncertaintyAdjustment,
    Number((investmentScore.rawScore - investmentScore.score).toFixed(6)),
    'the signed difference must explain how evidence confidence changed the candidate score');
  assert.equal(investmentScore.actionPreferenceEffectiveValue, investmentScore.actionPreference.scoredValue);
  assert.ok(investmentScore.dimensions.every(row => row.rawUtility !== undefined && row.confidence >= 0 && row.confidence <= 1),
    'scored dimensions should expose raw utility and the confidence used to attenuate it');
  assert.ok(bangladesh.evidence.registeredMacroMetricCount > 0);
  assert.match(bangladesh.evidence.missingDataPolicy, /NULL/);
  assert.equal(behavior.diagnostics().dimensionCount, 11);
});

test('source-backed registry metrics take precedence over legacy country snapshots', async () => {
  const { context, behavior } = await loadCountryEngines();
  const api = context.OmegaCountryGeneralDataRuntime;
  const originalGetCountryRecord = api.getCountryRecord.bind(api);
  const existing = originalGetCountryRecord('BGD');
  assert.ok(existing && existing.metrics, 'Bangladesh has a registered metric record');

  // Deterministic test-only source observation. The pull-request build deliberately
  // avoids network refreshes, so this fixture exercises source precedence without
  // inserting fictional data into the production registry.
  const fixtureValue = 987654321012;
  const fixtureRecord = JSON.parse(JSON.stringify(existing));
  fixtureRecord.metrics.gdpCurrentUsd = fixtureValue;
  fixtureRecord.metricMetadata.gdpCurrentUsd = {
    year: 2024, status: 'WORLD_BANK_API_OBSERVATION', sourceId: 'TEST_FIXTURE',
    sourceName: 'Deterministic test fixture', method: 'TEST_ONLY', sourceUrl: null
  };
  context.OmegaCountryGeneralDataRuntime = Object.assign({}, api, {
    getCountryRecord(value) {
      const identity = (value && typeof value === 'object'
        ? String(value.iso3 || value.countryCode || value.iso2 || value.code || value.name || '')
        : String(value || '')).toUpperCase();
      if (['BGD', 'BD', 'BANGLADESH'].includes(identity)) return fixtureRecord;
      return originalGetCountryRecord(value);
    }
  });

  const profile = behavior.getBehaviorProfile('BGD');
  assert.equal(profile.metrics.gdpUsd, fixtureValue,
    'registered source-backed GDP should win over the older local baseline');
  assert.equal(profile.metricSources.gdpUsd.status, 'WORLD_BANK_API_OBSERVATION',
    'the selected metric must retain source status');
  assert.equal(profile.metricSources.gdpUsd.observationYear, 2024,
    'the selected metric must retain its observation year');
  assert.match(profile.metricSources.gdpUsd.source, /country_general_data_registry_v1[.]json/,
    'metric provenance should identify the unified source registry');
});

test('all canonical country and territory identities build profiles and feed country-specific action scoring', async () => {
  const { runtime, behavior, adaptive } = await loadCountryEngines();
  const countries = runtime.listProfiles();
  assert.ok(countries.length >= 249, 'existing canonical roster should remain available');
  const signatures = new Set();
  const failures = [];
  const scoredCountries = new Set();
  const actionScores = new Set();
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
    const score = adaptive.scoreAction(row.iso3 || row.countryCode, 'INDUSTRY_BUILD');
    assert.ok(score && typeof score.known === 'boolean',
      'adaptive action scorer must return an explicit known/unknown outcome for ' + row.name);
    if (score.known) {
      assert.ok(Number.isFinite(score.score) && score.score >= 0 && score.score <= 1,
        'candidate action score must be finite and normalized for ' + row.name);
      assert.ok(Number.isFinite(score.confidence) && score.confidence >= 0 && score.confidence <= 1,
        'candidate action confidence must be normalized for ' + row.name);
      scoredCountries.add(row.iso3 || row.countryCode);
      actionScores.add(score.score.toFixed(3));
    } else {
      assert.equal(score.score, null,
        'unknown evidence must not silently become a numeric candidate score for ' + row.name);
    }
  }
  assert.deepEqual(failures, [], 'no country-specific runtime profile should throw');
  assert.ok(signatures.size > 20, 'country records should produce differentiated runtime signatures, not a common preset');
  assert.ok(scoredCountries.size > 20,
    'country identity and evidence must reach adaptive action scoring for the broad canonical roster');
  assert.ok(actionScores.size > 1,
    'different country evidence must create differentiated candidate scores rather than one common preset');
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
  assert.equal(profile.metricSources.gdpUsd.observationContext, 'CURRENT_GAME_STATE');
  assert.equal(profile.metricSources.gdpUsd.confidence, 1,
    'live game observations must be distinguished from historical baselines and carry full source confidence');
  assert.equal(profile.metricSources.gdpUsd.observationYear, null,
    'a simulation value must not inherit a historical observation year');
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


test('metric provenance exposes observation year, confidence, explicit gaps, and uncertainty attenuates action scores', async () => {
  const { context, behavior, adaptive } = await loadCountryEngines();
  const profile = behavior.getBehaviorProfile('BGD');
  const gdp = profile.metricSources.gdpUsd;
  assert.ok(gdp && typeof gdp.source === 'string' && gdp.source.length > 0);
  assert.ok(gdp.confidence >= 0 && gdp.confidence <= 1);
  assert.ok(Object.prototype.hasOwnProperty.call(gdp, 'observationYear'));
  assert.ok(gdp.sourceConfidence === null || (gdp.sourceConfidence >= 0 && gdp.sourceConfidence <= 1));
  assert.ok(gdp.freshness === null || (gdp.freshness >= 0.25 && gdp.freshness <= 1));
  assert.ok(Object.prototype.hasOwnProperty.call(gdp, 'dataGap'));
  assert.ok(typeof gdp.confidenceBasis === 'string' && gdp.confidenceBasis.length > 0,
    'country behaviour must state how its evidence confidence was derived');
  assert.ok(profile.dataGaps && Array.isArray(profile.dataGaps), 'profile must report metrics that remain unobserved');
  assert.ok(profile.evidenceConfidenceModel.includes('NOT_A_CALIBRATED_PROBABILITY'),
    'confidence must disclose that it is a transparent heuristic, not a calibrated probability');
  assert.ok(profile.dataGaps.some(gap => gap.status === 'OBSERVATION_YEAR_UNAVAILABLE'),
    'known legacy values without years must be reported as provenance gaps');
  const lowConfidence = adaptive.scoreAction('BGD', 'MILITARY_EQUIP');
  context.Game = { state: { cabinet: { BGD: { strategyProfile: { riskAppetite: 1 } } } } };
  const explicit = adaptive.scoreAction('BGD', 'MILITARY_EQUIP');
  const rawRisk = explicit.dimensions.find(row => row.dimension === 'riskAppetite');
  assert.equal(rawRisk.confidence, 1, 'explicit doctrine should retain full confidence');
  assert.equal(rawRisk.utility, rawRisk.rawUtility, 'confidence 1 must not attenuate explicit doctrine');
  assert.ok(Number.isFinite(lowConfidence.score) && Number.isFinite(explicit.score));
  assert.ok(lowConfidence.confidence >= 0 && lowConfidence.confidence <= 1);
});


test('low-confidence action preferences are also attenuated toward neutral', async () => {
  const { adaptive } = await loadCountryEngines();
  const explicit = adaptive.profile('BGD');
  const action = 'MILITARY_EQUIP';
  const preference = explicit.actionPreferences[action];
  if (!preference) {
    // An action with no preference still validates the profile's neutral fallback contract.
    assert.equal(adaptive.scoreAction('BGD', action).known, true);
    return;
  }
  const raw = Number(preference.value);
  const confidence = Number(preference.confidence ?? 0.5);
  const scored = adaptive.scoreAction('BGD', action).actionPreference.scoredValue;
  assert.ok(Math.abs(scored - (0.5 + (raw - 0.5) * confidence)) < 0.000001);
  if (confidence < 1) assert.ok(Math.abs(scored - 0.5) <= Math.abs(raw - 0.5));
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
  assert.match(sw, /omega-offline-atlas-shell-v\d+/);
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
