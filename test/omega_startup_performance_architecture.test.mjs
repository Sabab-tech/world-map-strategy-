import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const read = path => fs.readFile(new URL('../' + path, import.meta.url), 'utf8');

test('country general registry is a single-flight shared dataset', async () => {
  const source = await read('omega_country_runtime_data_v1.js');
  const fetchCounts = new Map();
  const registry = {
    metadata: {
      schemaVersion: 'test-v1',
      profileVersion: 'test-v1',
      recordSchema: {
        identityFields: ['iso2', 'iso3', 'name'],
        strategicProfileFields: ['profileVersion']
      }
    },
    countries: [{
      identity: ['US', 'USA', 'United States'],
      strategicProfile: ['test-v1']
    }]
  };
  const window = {
    fetch: async url => {
      const key = String(url).replace(/^\.\//, '');
      fetchCounts.set(key, (fetchCounts.get(key) || 0) + 1);
      if (key === 'economy_global_profiles_v1.json') return { ok: true, json: async () => ({ countries: [] }) };
      if (key === 'country_general_data_registry_v1.json') return { ok: true, json: async () => registry };
      return { ok: false };
    }
  };
  vm.runInNewContext(source, { window });
  assert.equal(await window.OmegaCountryRuntimeData.ready, true);
  const runtime = window.OmegaCountryRuntimeData;
  const first = runtime.loadSourceDataset('country_general_data_registry_v1.json', { optional: false });
  const second = runtime.loadSourceDataset('country_general_data_registry_v1.json', { optional: false });
  assert.equal(first, second, 'concurrent consumers must receive the same in-flight promise');
  const loaded = await first;
  assert.equal(loaded, registry);
  assert.equal(fetchCounts.get('country_general_data_registry_v1.json'), 1);
  assert.equal(runtime.getSourceDataset('country_general_data_registry_v1.json'), registry);
  assert.equal(runtime.getStrategicProfile('USA').profileVersion, 'test-v1');
});

test('general data runtime reads registry only through the shared owner', async () => {
  const source = await read('omega_country_general_data_runtime_v1.js');
  assert.match(source, /shared\.loadSourceDataset\(DATA_URL\.replace/);
  assert.doesNotMatch(source, /root\.fetch\(DATA_URL/);
});

test('country general data module is lazy-loaded from the country overview screen', async () => {
  const index = await read('index.html');
  const loader = await read('omega_country_general_data_loader_v1.js');
  assert.match(index, /omega_country_general_data_loader_v1\.js/);
  assert.doesNotMatch(index, /omega_country_general_data_runtime_v1\.js/);
  assert.match(loader, /renderChapter1_Overview/);
  assert.match(loader, /omega_country_general_data_runtime_v1\.js/);
});

test('resource endowment loads heavy data sequentially and yields between stages', async () => {
  const source = await read('omega_resource_endowment_runtime.js');
  assert.match(source, /const reserveData=await loadSimulationReserveData\(\);[\s\S]*?await yieldResourceInitializationToUi\(\);[\s\S]*?const canonicalCatalogData=await loadCanonicalSiteCatalogData\(\);/);
  assert.match(source, /const masterResearchData=await loadMasterResourceResearchData\(\);[\s\S]*?const researchData=await loadResearchEvidenceData\(\);/);
  assert.doesNotMatch(source, /Promise\.all\(\[loadSimulationReserveData\(\),loadResearchEvidenceData\(\)/);
  assert.match(source, /requestIdleCallback\(start,\{timeout:1800\}\)/);
  assert.match(source, /mapWithConcurrency\(LEGACY_GAMEPLAY_EXPANSION_FILES,2/);
});

test('service worker precache is bounded and excludes eager JSON datasets', async () => {
  const source = await read('omega-offline-map-sw.js');
  assert.match(source, /const PRECACHE_CONCURRENCY = 3/);
  assert.match(source, /await precacheInBatches\(cache, Array\.from\(assets\)\)/);
  assert.match(source, /Promise\.allSettled\(batch\.map/);
  assert.doesNotMatch(source, /Promise\.allSettled\(Array\.from\(assets\)/);
  assert.doesNotMatch(source, /factoryIconManifestUrl/);
  assert.match(source, /Large JSON datasets[\s\S]*?cached by the fetch handler/);
});
