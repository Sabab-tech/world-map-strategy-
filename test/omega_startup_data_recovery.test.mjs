import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const profileRegistry = JSON.parse(read('economy_global_profiles_v1.json'));
const cities = JSON.parse(read('cities.json'));

function createCountryRuntime(fetchImpl, timers = { setTimeout, clearTimeout }) {
  const context = {
    console, fetch: fetchImpl, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, AbortController,
    Promise, Map, Set, Array, Object, String, Number, Math, Date, RegExp
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('omega_country_runtime_data_v1.js'), context, {
    filename: 'omega_country_runtime_data_v1.js'
  });
  return context.OmegaCountryRuntimeData;
}

function jsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test('canonical country registry retries a transient startup failure without reloading the page', async () => {
  let attempts = 0;
  const runtime = createCountryRuntime(async url => {
    if (String(url).includes('economy_global_profiles_v1.json')) {
      attempts += 1;
      if (attempts === 1) return jsonResponse({ error: 'temporary gateway error' }, 503);
      return jsonResponse(profileRegistry);
    }
    return jsonResponse(cities);
  });

  assert.equal(await runtime.ready, true);
  assert.equal(attempts, 2, 'one transient failure should be recovered by the bounded retry');
  assert.equal(runtime.resolveCountry('USA')?.countryCode, 'US');
  assert.equal(runtime.diagnostics().ready, true);
});

test('a stalled core registry request is aborted and retried instead of remaining pending', async () => {
  let attempts = 0;
  let aborted = false;
  const quickTimers = {
    setTimeout: (callback, _delay) => setTimeout(callback, 20),
    clearTimeout
  };
  const runtime = createCountryRuntime((url, options) => {
    if (!String(url).includes('economy_global_profiles_v1.json')) return Promise.resolve(jsonResponse(cities));
    attempts += 1;
    if (attempts === 1) {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted = true;
          const error = new Error('request aborted by bounded timeout');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
    return Promise.resolve(jsonResponse(profileRegistry));
  }, quickTimers);

  assert.equal(await runtime.ready, true);
  assert.equal(attempts, 2);
  assert.equal(aborted, true, 'the timed-out fetch must be actively aborted');
  assert.equal(runtime.diagnostics().ready, true);
});

test('a failed startup registry can be recovered by the next country-data request in the same session', async () => {
  let registryAttempts = 0;
  let serviceAvailable = false;
  const runtime = createCountryRuntime(async url => {
    const path = String(url);
    if (path.includes('economy_global_profiles_v1.json')) {
      registryAttempts += 1;
      if (!serviceAvailable) return jsonResponse({ error: 'temporary gateway error' }, 503);
      return jsonResponse(profileRegistry);
    }
    if (path.includes('/api/omega/country-domain/')) return jsonResponse({ error: 'not found' }, 404);
    if (path.endsWith('cities.json')) return jsonResponse(cities);
    return jsonResponse({}, 404);
  });

  assert.equal(await runtime.ready, false, 'the initial bounded retry should report a real failure');
  assert.equal(runtime.diagnostics().ready, false);
  assert.equal(runtime.resolveCountry('Bangladesh'), null);

  serviceAvailable = true;
  const result = await runtime.loadCountryData('Bangladesh', ['cities']);
  assert.equal(result.status, 'READY');
  assert.equal(runtime.diagnostics().ready, true);
  assert.equal(runtime.resolveCountry('Bangladesh')?.countryCode, 'BD');
  assert.ok(registryAttempts >= 4, 'a fresh attempt should be made after the initial attempts were exhausted');
});

test('country general-data requests retry transient errors and coalesce concurrent requests', async () => {
  let attempts = 0;
  const payload = {
    metadata: {
      recordSchema: {
        identityFields: ['iso2', 'iso3', 'name'],
        generalFactFields: [],
        metricFields: []
      }
    },
    countries: [{ identity: ['AA', 'AAA', 'Alpha'], generalFacts: [], metrics: [] }]
  };
  const context = {
    console, setTimeout, clearTimeout, AbortController, Promise, Map, Set,
    Array, Object, String, Number, Math, Date, RegExp,
    OmegaCountryRuntimeData: {
      ready: Promise.resolve(true),
      resolveCountry: value => ({ iso2: 'AA', countryCode: 'AA', iso3: 'AAA', name: 'Alpha' })
    },
    fetch: async () => {
      attempts += 1;
      if (attempts === 1) return jsonResponse({ error: 'temporary gateway error' }, 503);
      return jsonResponse(payload);
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('omega_country_general_data_runtime_v1.js'), context, {
    filename: 'omega_country_general_data_runtime_v1.js'
  });
  const runtime = context.OmegaCountryGeneralDataRuntime;

  const results = await Promise.all([runtime.init('AA'), runtime.init('AA')]);
  assert.deepEqual(results, [true, true]);
  assert.equal(attempts, 2, 'same-country startup requests must share the retrying request');
  assert.equal(runtime.diagnostics().recordCount, 1);
  assert.equal(runtime.diagnostics().inFlightCount, 0);
});

test('startup support datasets fail independently and retryable roster failures do not stay pinned', () => {
  const map = read('map-engine-2.js');
  assert.match(map, /const fetchOptional = async function \(filename\)/);
  assert.match(map, /fetchOptional\('population\.json'\)/);
  assert.match(map, /fetchOptional\('economy\.json'\)/);
  assert.match(map, /fetchOptional\('relation_generation_engine\.json'\)/);
  assert.match(map, /loader\.__countryConfigPromise = null/);
  assert.doesNotThrow(() => new vm.Script(map, { filename: 'map-engine-2.js' }));
});
