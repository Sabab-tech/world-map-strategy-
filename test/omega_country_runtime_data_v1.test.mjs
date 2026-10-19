import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

async function createRuntime(options = {}) {
  const context = {
    console,
    fetch: async input => {
      const relative = String(input).replace(/^\.\//, '');
      if (options.omitGeneralData && relative === 'country_general_data_registry_v1.json') {
        return { ok: false, json: async () => null };
      }
      const body = read(relative);
      return { ok: true, json: async () => JSON.parse(body) };
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('omega_country_runtime_data_v1.js'), context, { filename: 'omega_country_runtime_data_v1.js' });
  const api = context.OmegaCountryRuntimeData;
  assert.ok(api, 'runtime data bridge must register a public API');
  assert.equal(await api.ready, true, 'country profile registry must initialize');
  return { api, context };
}

test('all canonical country identities have an ISO-2-derived flag', async () => {
  const { api } = await createRuntime();
  const profiles = JSON.parse(read('economy_global_profiles_v1.json')).countries;
  assert.equal(api.diagnostics().profileCount, 249);
  assert.ok(api.diagnostics().flagCount >= 249, 'every canonical profile should have a derived flag');
  for (const row of profiles) {
    assert.equal(api.resolveCountry(row.countryCode)?.countryCode, row.countryCode, 'resolves ' + row.name);
    assert.ok(api.flagFor(row.countryCode), 'flag exists for ' + row.name);
  }
  assert.equal(api.flagFor('USA'), '🇺🇸');
  assert.equal(api.flagFor('United States of America'), '🇺🇸');
  assert.equal(api.flagFor('United Kingdom'), '🇬🇧');
  assert.equal(api.flagFor('Côte d’Ivoire'), '🇨🇮');
  assert.equal(api.flagFor('South Korea'), '🇰🇷');
});

test('country aliases resolve to the same canonical profile and source records', async () => {
  const { api } = await createRuntime();
  assert.equal(api.resolveCountry('USA')?.countryCode, 'US');
  assert.equal(api.resolveCountry('United States of America')?.countryCode, 'US');
  assert.equal(api.resolveCountry('North Korea')?.countryCode, 'KP');
  assert.equal(api.resolveCountry('Macau')?.countryCode, 'MO');
  assert.equal(api.resolveCountry('Democratic Republic of the Congo')?.countryCode, 'CD');
  assert.equal(api.resolveCountry('Kosovo')?.countryCode, 'XK');
  assert.equal(api.flagFor('Kosovo'), '🇽🇰');
  assert.equal(api.getCapital('Kosovo'), 'Pristina');
  assert.ok(api.getRecord('economy', 'Kosovo')?.gdp != null, 'legacy economy record remains accessible');
  assert.ok(api.getRecord('population', 'Kosovo')?.population_2015 != null, 'legacy population record remains accessible');

  const bangladesh = api.getProfile('Bangladesh');
  assert.equal(bangladesh?.countryCode, 'BD');
  assert.equal(api.getRecord('economy', 'Bangladesh')?.gdp, bangladesh.sourceValues.gdp);
  assert.equal(api.getRecord('population', 'BGD')?.population_2015, bangladesh.populationValues.population_2015);
  assert.equal(api.getCapital('Bangladesh'), 'Dhaka');
});

test('unified registry exposes country metrics with decoded per-field provenance', async () => {
  const { api } = await createRuntime();
  const diagnostics = api.diagnostics();
  assert.equal(diagnostics.generalDataRegistryReady, true);
  assert.equal(diagnostics.generalDataRecordCount, 249);
  assert.ok(diagnostics.generalDataMetricCount >= 20);
  assert.ok(diagnostics.generalDataPopulationCoverage > 0);
  assert.ok(diagnostics.generalDataGdpCoverage > 0);

  const bangladesh = api.getGeneralData('Bangladesh');
  assert.equal(bangladesh?.identity?.iso2, 'BD');
  assert.equal(bangladesh?.identity?.iso3, 'BGD');
  const population = api.getGeneralMetric('BGD', 'populationTotal');
  assert.ok(population);
  assert.ok(Number.isFinite(population.value) && population.value > 0);
  assert.ok(Number.isFinite(population.year) && population.year >= 2015);
  assert.ok(typeof population.status === 'string' && population.status.length > 0);
  assert.equal(api.getGeneralMetric('BD', 'disciplineIndex')?.value, null,
    'unknown discipline metrics must remain null rather than becoming fake scores');
  assert.equal(api.getGeneralData('Kosovo'), null,
    'a runtime-only Kosovo alias must not be presented as a canonical general-registry record');
  assert.ok(api.getRecord('economy', 'Bangladesh')?.gdp != null,
    'the pre-existing legacy gameplay record must remain available');
});

test('missing optional unified registry does not block the existing country runtime', async () => {
  const { api } = await createRuntime({ omitGeneralData: true });
  assert.equal(api.diagnostics().ready, true);
  assert.equal(api.diagnostics().generalDataRegistryReady, false);
  assert.equal(api.getGeneralData('Bangladesh'), null);
  assert.ok(api.getRecord('economy', 'Bangladesh')?.gdp != null);
});

test('live runtime records override baseline values without losing unrelated source fields', async () => {
  const { api, context } = await createRuntime();
  const baseline = api.getRecord('economy', 'Bangladesh');
  context.Game = { state: { economy: { BANGLADESH: { gdp: 123456, runtimeOnlyField: 'live' } } } };
  const live = api.getRecord('economy', 'BD');
  assert.equal(live.gdp, 123456);
  assert.equal(live.runtimeOnlyField, 'live');
  assert.equal(live.currency_code, baseline.currency_code);
});

test('unavailable observations stay unavailable instead of receiving generic fake data', async () => {
  const { api } = await createRuntime();
  const aland = api.getProfile('AX');
  assert.equal(aland?.profileStatus, 'UNAVAILABLE');
  assert.equal(api.getRecord('economy', 'AX'), null);
  assert.equal(api.getRecord('population', 'Åland Islands'), null);
  assert.equal(api.getCapital('Åland Islands'), null);
});

test('country selection UI uses the shared bridge and removes hardcoded cross-country fallback stats', () => {
  const html = read('index.html');
  const bridge = html.indexOf('<script src="omega_country_runtime_data_v1.js"');
  const map = html.indexOf('<script src="map-engine-1.js"');
  assert.ok(bridge >= 0 && map > bridge, 'bridge must load before the country selection controller');

  const mapEngine = read('map-engine-1.js');
  assert.match(mapEngine, /OmegaCountryRuntimeData/);
  assert.doesNotMatch(mapEngine, /\{\s*gdp:\s*500000000,\s*debt:\s*100000000\s*\}/);
  assert.doesNotMatch(mapEngine, /\{\s*population_2015:\s*50000000\s*\}/);
  assert.doesNotMatch(mapEngine, /innerText\s*=\s*`92%`/);
  assert.doesNotMatch(mapEngine, /innerText\s*=\s*`\+45 Allied`/);
  assert.doesNotMatch(mapEngine, /innerText\s*=\s*`PWR 82\.4`/);

  const countryIOS = read('country-ios.js');
  assert.match(countryIOS, /OmegaCountryRuntimeData/);
  assert.doesNotMatch(countryIOS, /Western \/ Transatlantic/i);
});

test('offline app shell caches the country runtime bridge and city records', () => {
  const sw = read('omega-offline-map-sw.js');
  assert.match(sw, /\.\/omega_country_runtime_data_v1\.js/);
  assert.match(sw, /\.\/cities\.json/);
  assert.match(sw, /\.\/economy\.json/);
  assert.match(sw, /\.\/population\.json/);
  assert.match(sw, /\.\/country_general_data_registry_v1\.json/);
});
