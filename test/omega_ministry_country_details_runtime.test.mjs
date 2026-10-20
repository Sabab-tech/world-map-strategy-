import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
