import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const read = path => fs.readFile(new URL('../' + path, import.meta.url), 'utf8');

test('country and general runtimes share one registry fetch and one country alias index', async () => {
  const countrySource = await read('omega_country_runtime_data_v1.js');
  const generalSource = await read('omega_country_general_data_runtime_v1.js');
  const fetchCounts = new Map();
  const registry = {
    metadata: {
      datasetId: 'TEST_COUNTRY_GENERAL_REGISTRY',
      schemaVersion: 'test-v1',
      profileVersion: 'test-v1',
      recordSchema: {
        identityFields: ['iso2', 'iso3', 'name'],
        generalFactFields: [],
        metricFields: [],
        naturalResourceFields: [],
        mineralResourceFields: [],
        hydrocarbonResourceFields: [],
        energyResourceFields: [],
        publicSafetyFields: [],
        strategicProfileFields: ['profileVersion']
      },
      provenanceEncoding: {}
    },
    countries: [{
      identity: ['US', 'USA', 'United States'],
      generalFacts: [],
      metrics: [],
      strategicProfile: ['test-v1']
    }]
  };
  const window = {
    fetch: async url => {
      const key = String(url).replace(/^\.\//, '');
      fetchCounts.set(key, (fetchCounts.get(key) || 0) + 1);
      if (key === 'economy_global_profiles_v1.json') return { ok: true, json: async () => ({ countries: [{ countryCode: 'US', iso3: 'USA', name: 'United States' }] }) };
      if (key === 'country_general_data_registry_v1.json') return { ok: true, json: async () => registry };
      return { ok: false };
    },
    OmegaCanonicalIdentityRegistry: null,
    document: null
  };
  vm.runInNewContext(countrySource, { window });
  assert.equal(await window.OmegaCountryRuntimeData.ready, true);
  vm.runInNewContext(generalSource, { window });
  const [generalReady, loaded] = await Promise.all([
    window.OmegaCountryGeneralDataRuntime.init(),
    window.OmegaCountryRuntimeData.loadSourceDataset('country_general_data_registry_v1.json', { optional: false })
  ]);
  assert.equal(generalReady, true);
  assert.equal(loaded, registry);
  assert.equal(fetchCounts.get('country_general_data_registry_v1.json'), 1);
  assert.equal(window.OmegaCountryRuntimeData.getCountryGeneralDataIndexSize(), 3);
  assert.equal(window.OmegaCountryRuntimeData.getCountryGeneralDataRow('United States'), registry.countries[0]);
  assert.equal(window.OmegaCountryGeneralDataRuntime.getCountryRecord('USA').identity.iso3, 'USA');
  assert.equal(window.OmegaCountryRuntimeData.getStrategicProfile('USA').profileVersion, 'test-v1');
});

test('general data runtime reads registry only through the shared owner', async () => {
  const source = await read('omega_country_general_data_runtime_v1.js');
  assert.match(source, /shared\.loadSourceDataset\(DATA_URL\.replace/);
  assert.doesNotMatch(source, /root\.fetch\(DATA_URL/);
});

test('country general data module is lazy-loaded from the country overview screen in every shell', async () => {
  const index = await read('index.html');
  const server = await read('server.js');
  const bootstrap = await read('server_bootstrap.js');
  const loader = await read('omega_country_general_data_loader_v1.js');
  assert.match(index, /omega_country_general_data_loader_v1\.js/);
  assert.doesNotMatch(index, /omega_country_general_data_runtime_v1\.js/);
  assert.match(server, /COUNTRY_GENERAL_DATA_SCRIPT = '<script src="\\/omega_country_general_data_loader_v1\.js"/);
  assert.doesNotMatch(server, /COUNTRY_GENERAL_DATA_SCRIPT = '<script src="\\/omega_country_general_data_runtime_v1\.js"/);
  assert.match(bootstrap, /omega_country_general_data_loader_v1\.js/);
  assert.doesNotMatch(bootstrap, /omega_country_general_data_runtime_v1\.js/);
  assert.match(loader, /renderChapter1_Overview/);
  assert.match(loader, /omega_country_general_data_runtime_v1\.js/);
});

test('strategic profile chapter requests its shared dataset and refreshes only while still selected', async () => {
  const source = await read('country-ios.js');
  assert.match(source, /getStrategicProfileAsync\(requestedCountry\)/);
  assert.match(source, /this\.activeChapter === 13 && this\.activeCountry === requestedCountry/);
  assert.match(source, /this\.switchChapter\(13\)/);
});
 
test('resource endowment prioritizes playable mine data and moves research enrichment to idle time', async () => {
  const source = await read('omega_resource_endowment_runtime.js');
  const initStart = source.indexOf('async function initialize(options={})');
  const initEnd = source.indexOf("// A country's resource extraction pass", initStart);
  const init = source.slice(initStart, initEnd);
  assert.match(init, /const reserveData=await loadSimulationReserveData\(\);[\s\S]*?const canonicalCatalogData=await loadCanonicalSiteCatalogData\(\);/);
  assert.doesNotMatch(init, /loadLosslessResourceReferenceData|loadMasterResourceResearchData|loadResearchEvidenceData/);
  assert.match(source, /async function loadSupplementalResourceData\(\)[\s\S]*?loadLosslessResourceReferenceData\(\)[\s\S]*?loadMasterResourceResearchData\(\)[\s\S]*?loadResearchEvidenceData\(\)/);
  assert.match(source, /scheduleResourceSupplementalData\(\)/);
  assert.match(source, /supplementalResourceDataReport=report\.status==='READY'\?report:null/);
  assert.match(source, /requestIdleCallback\(start,\{timeout:5000\}\)/);
  assert.match(source, /requestIdleCallback\(start,\{timeout:1800\}\)/);
  assert.match(source, /mapWithConcurrency\(LEGACY_GAMEPLAY_EXPANSION_FILES,2/);
});

test('service worker precache preserves offline datasets and bounds concurrent downloads', async () => {
  const source = await read('omega-offline-map-sw.js');
  assert.match(source, /const PRECACHE_CONCURRENCY = 3/);
  assert.match(source, /await precacheInBatches\(cache, Array\.from\(assets\)\)/);
  assert.match(source, /Promise\.allSettled\(batch\.map/);
  assert.doesNotMatch(source, /Promise\.allSettled\(Array\.from\(assets\)/);
  assert.match(source, /factoryIconManifestUrl/);
  assert.match(source, /omega_ui_photo_asset_catalog_v1\.json/);
  assert.match(source, /resource_site_country_mineplay_batch_20261020_v1\.json/);
  assert.match(source, /omega_ui_v2\/omega-ui-v2\.css/);
  assert.doesNotMatch(source, /country_general_data_registry_v1\.json/);
  assert.ok(source.includes('endsWith(".json")'), "HTML-discovered JSON datasets must remain demand-cached");

});
