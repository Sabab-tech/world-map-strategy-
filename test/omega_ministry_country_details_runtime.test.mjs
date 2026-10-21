import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../ministry_engine.js', import.meta.url), 'utf8');
const start = source.indexOf('getCountryDetails(countryKey)');
const end = source.indexOf('\n    },', start);
assert.ok(start >= 0 && end > start, 'getCountryDetails must exist as a bounded method');
const method = source.slice(start, end);

test('ministry country details use canonical country and general-data runtimes', () => {
  assert.match(method, /OmegaCountryRuntimeData/);
  assert.match(method, /OmegaCountryGeneralDataRuntime/);
  assert.match(method, /resolveCountry/);
  assert.match(method, /getCountryRecord/);
  assert.match(method, /getStrategicProfile/);
});

test('ministry country details never fabricate a generic country baseline', () => {
  assert.doesNotMatch(method, /const\s+lookup\s*=\s*\{/);
  assert.doesNotMatch(method, /50\.0 Million|150\.0 Billion|State Capital|National Currency|#25 Worldwide|#28 Worldwide/);
  assert.match(method, /তথ্য অনুপস্থিত/);
  assert.match(method, /MISSING_VALUES_REMAIN_UNAVAILABLE/);
  assert.match(method, /militaryRank:\s*unavailable/);
  assert.match(method, /economicRank:\s*unavailable/);
});

test('ministry economic and population values are sourced from runtime records', () => {
  assert.match(method, /metrics\.populationTotal/);
  assert.match(method, /metrics\.gdpCurrentUsd/);
  assert.match(method, /metricMetadata/);
  assert.match(method, /gdpObservationYear/);
});

test('current player-driven economy and population override historical baseline observations', () => {
  assert.match(method, /getLiveRecord\?\.\('economy', identity\.countryCode\)/);
  assert.match(method, /getLiveRecord\?\.\('population', identity\.countryCode\)/);
  assert.match(method, /livePopulation !== null \? livePopulation : firstNumber/);
  assert.match(method, /liveGdp !== null \? liveGdp : firstNumber/);
  assert.match(method, /populationObservationYear/);
  assert.match(method, /populationSource:/);
});

test('ministry dashboards use the current country context rather than a fixed Bangladesh lookup', () => {
  assert.match(source, /getActiveCountryKey\(\)\s*\{/);
  assert.match(source, /renderMoDDashboard\(m, contentArea\)\s*\{[\s\S]*?const countryKey = this\.getActiveCountryKey\(\);/);
  assert.match(source, /renderMoFADashboard\(m, contentArea\)\s*\{[\s\S]*?const countryKey = this\.getActiveCountryKey\(\);/);
  assert.doesNotMatch(source, /const countryKey = this\.activeCountry\s*\|\|\s*["']BANGLADESH["']/);
});


test('defense readiness is country-scoped and never starts from a shared fabricated score', () => {
  assert.doesNotMatch(source, /infantry:\s*88,\s*armor:\s*84,\s*air_defense:\s*92/);
  assert.match(source, /getDefenseReadinessState\(countryKey, createIfMissing = false\)/);
  const start = source.indexOf('    getDefenseCountryRow(countryCode, createIfMissing = false) {');
  const end = source.indexOf('    executeDefenseCommand(cmdId) {', start);
  assert.ok(start >= 0 && end > start, 'readiness methods should be a bounded set of object methods');
  const methods = source.slice(start, end);

  const context = {
    console,
    Game: { state: { defense: {
      BD: { orsData: { infantry: 80, armor: 70, air_defense: 75, air_force: 72, navy: 64,
        ammunition: 66, recon: 71, cyber_ew: 77, satellite: 69, morale: 74 },
        orsDataSource: 'PLAYER_INITIALIZED_SIMULATION_STATE' },
      US: { orsData: { infantry: 30, armor: 40, air_defense: 35, air_force: 45, navy: 50,
        ammunition: 42, recon: 48, cyber_ew: 51, satellite: 47, morale: 44 },
        orsDataSource: 'PLAYER_INITIALIZED_SIMULATION_STATE' }
    } } },
    OmegaCountryRuntimeData: {
      resolveCountry(value) {
        const key = String(value || '').toUpperCase();
        if (['BD', 'BGD', 'BANGLADESH'].includes(key)) return { countryCode: 'BD', iso2: 'BD', iso3: 'BGD', name: 'Bangladesh' };
        if (['US', 'USA', 'UNITED STATES'].includes(key)) return { countryCode: 'US', iso2: 'US', iso3: 'USA', name: 'United States' };
        return null;
      },
      getLiveRecord(domain, country) { return context.Game.state[domain]?.[country] || null; }
    },
    showOmegaNotification() {},
    testCountry: 'US'
  };
  context.window = context;
  vm.createContext(context);
  const api = vm.runInContext('({ getActiveCountryKey(){ return window.testCountry; }, renderMinistryDashboard(){}, ' + methods + ' })', context);

  const bd = api.calculateORS('Bangladesh');
  const us = api.calculateORS('USA');
  assert.equal(bd.countryCode, 'BD');
  assert.equal(us.countryCode, 'US');
  assert.notEqual(bd.score, us.score, 'each country must use its own readiness record');
  assert.equal(bd.source, 'PLAYER_INITIALIZED_SIMULATION_STATE');
  assert.equal(api.calculateORS('Unknown Nation').score, null, 'unknown country must not get a fabricated readiness score');

  context.Game.state.defense = { BD: context.Game.state.defense.BD };
  assert.equal(api.updateORSParameter('infantry', 5), true);
  assert.equal(context.Game.state.defense.BD.orsData.infantry, 80, 'updating the selected US record must not mutate Bangladesh');
  assert.equal(context.Game.state.defense.US.orsData.infantry, 55, 'an explicit player command initializes only the selected country state');
});

test('defense command spends no funds when country readiness cannot be updated', () => {
  const start = source.indexOf('    executeDefenseCommand(cmdId) {');
  const end = source.indexOf('    executeDefenseProcurement(itemId)', start);
  assert.ok(start >= 0 && end > start);
  const method = source.slice(start, end);
  assert.match(method, /const updated = this\.updateORSParameter\(op\.param, op\.boost\)/);
  assert.ok(method.indexOf('const updated = this.updateORSParameter') < method.indexOf('window.resources.cash -= op.cost * 1000000'));
  assert.match(method, /No funds were deducted/);
});


test('DEFCON and procurement progress persist only for the selected country', () => {
  const extractMethod = signature => {
    const start = source.indexOf('    ' + signature);
    const end = source.indexOf('\\n    },', start);
    assert.ok(start >= 0 && end > start, signature + ' should be a bounded method');
    return source.slice(start, end + 7);
  };
  const methods = [
    extractMethod('setDefconLevel(level) {'),
    extractMethod('getProcurementCatalogue() {'),
    extractMethod('getDefenseCountryRow(countryCode, createIfMissing = false) {'),
    extractMethod('executeDefenseProcurement(itemId) {')
  ].join('\\n');
  const context = {
    console,
    Game: { state: { defense: { BD: { orsData: { infantry: 80, armor: 70 }, orsDataSource: 'PLAYER_INITIALIZED_SIMULATION_STATE' } } } },
    OmegaCountryRuntimeData: {
      resolveCountry(value) {
        const key = String(value || '').toUpperCase();
        if (['BD', 'BGD', 'BANGLADESH'].includes(key)) return { countryCode: 'BD', iso2: 'BD', iso3: 'BGD', name: 'Bangladesh' };
        if (['US', 'USA', 'UNITED STATES'].includes(key)) return { countryCode: 'US', iso2: 'US', iso3: 'USA', name: 'United States' };
        return null;
      },
      getLiveRecord(domain, country) { return context.Game.state[domain]?.[country] || null; }
    },
    showOmegaNotification() {},
    testCountry: 'US'
  };
  context.window = context;
  vm.createContext(context);
  const api = vm.runInContext('({ getActiveCountryKey(){ return window.testCountry; }, renderMinistryDashboard(){}, ' + methods + ' })', context);

  assert.equal(api.setDefconLevel(4), true);
  assert.equal(context.Game.state.defense.US.defconLevel, 4);
  assert.equal(context.Game.state.defense.BD.defconLevel, undefined, 'country change must not overwrite Bangladesh alert state');
  assert.equal(api.executeDefenseProcurement('f35_jets'), undefined);
  assert.equal(context.Game.state.defense.US.procurementItems.find(x => x.id === 'f35_jets').stage, 1);
  assert.equal(context.Game.state.defense.BD.procurementItems, undefined, 'procurement stage must not leak into another country');
  assert.equal(api.setDefconLevel(9), false, 'invalid alert level must not alter state');
});

test('defense procurement starts as not-started and no longer invents pre-deployed country projects', () => {
  assert.match(source, /getProcurementCatalogue\(\)/);
  assert.match(source, /stage: 0, maxStage: 8/);
  assert.match(source, /● NOT STARTED/);
  assert.doesNotMatch(source, /'f35_jets',[^\n]*stage: 7/);
  assert.doesNotMatch(source, /'sam_shield',[^\n]*stage: 8/);
  assert.match(source, /SIMULATED PROCUREMENT STAGE UPDATED/);
});


test('ministry financial headers cannot display static fictitious budgets or GDP-derived treasury', () => {
  assert.match(source, /getCountryMinistryMetric\(ministryId, 'budget'\)/);
  assert.match(source, /getCountryMinistryMetric\('energy_mining', 'budget'\)/);
  assert.doesNotMatch(source, /budget:\s*['"]\$\d/);
  assert.doesNotMatch(source, /cash\s*=\s*econ\.gdp\s*\*\s*0\.08/);
  assert.doesNotMatch(source, /\$\{m\.budget\}/);
  assert.match(source, /treasuryField\.status === 'AVAILABLE'/);
  assert.match(source, /ANNUAL BUDGET · SELECTED COUNTRY/);
});

test('ministry budget, efficiency and status read selected-country records and preserve source labels', () => {
  assert.match(source, /getCountryMinistryMetric\(ministryId, metric\)/);
  assert.match(source, /gateway\.getValue\(country, domains/);
  assert.match(source, /NO_COUNTRY_SPECIFIC_RECORD/);
  assert.match(source, /EFFICIENCY · SELECTED COUNTRY/);
  assert.match(source, /STATUS · SELECTED COUNTRY/);
  assert.match(source, /title="\$\{escapeAttribute\(ministryBudget\.source\)\}"/);
});
