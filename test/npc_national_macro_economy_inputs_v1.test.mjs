import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const registry = readJson('country_general_data_registry_v1.json');
const manifest = readJson('minister_country_roster_manifest_v1.json');
const rules = readJson('npc_national_macro_economy_rules_v1.json');
const bundle = readJson('npc_national_macro_economy_inputs_v1.json');
const schema = registry.metadata.recordSchema;
const idIndex = schema.identityFields.indexOf('iso3');
const metricIndex = Object.fromEntries(schema.metricFields.map((key, index) => [key, index]));
const provenance = registry.metadata.provenanceEncoding || {};
const decode = (items, code) => Number.isInteger(code) && code >= 0 ? (items?.[code] ?? null) : null;
const ids = Object.keys(manifest.countries).map(value => String(value).toUpperCase()).sort();
const sourceRows = new Map(registry.countries.map(row => [String(row.identity[idIndex]).toUpperCase(), row]));
const metricRules = rules.baseline.metrics;

test('the compact NPC economy bundle contains exactly the 197 core country records', () => {
  assert.equal(manifest.counts.countryEntities, 197);
  assert.equal(bundle.metadata.countryCount, 197);
  assert.deepEqual(Object.keys(bundle.countries).sort(), ids);
  assert.deepEqual(bundle.metadata.metricIds, metricRules.map(row => row.id));
  assert.equal(bundle.metadata.sourceRegistry, 'country_general_data_registry_v1.json');
  assert.equal(bundle.metadata.sourceRegistryGeneratedAt, registry.metadata.generatedAt);
  assert.equal(bundle.metadata.missingValuePolicy, 'NULL_REMAINS_UNOBSERVED');
});

test('each country has exactly the ten declared macro metrics and no unrelated fields', () => {
  const expectedIds = metricRules.map(row => row.id).sort();
  for (const iso3 of ids) {
    const country = bundle.countries[iso3];
    assert.ok(country && country.metrics, 'missing macro inputs for ' + iso3);
    assert.deepEqual(Object.keys(country).sort(), ['metrics']);
    assert.deepEqual(Object.keys(country.metrics).sort(), expectedIds);
  }
});

test('every value and provenance field exactly matches the source country registry, including unknowns', () => {
  for (const iso3 of ids) {
    const source = sourceRows.get(iso3);
    assert.ok(source, 'source registry does not contain ' + iso3);
    for (const rule of metricRules) {
      const index = metricIndex[rule.generalDataMetric];
      assert.notEqual(index, undefined, 'registry metric missing: ' + rule.generalDataMetric);
      const actual = bundle.countries[iso3].metrics[rule.id];
      const raw = source.metrics[index];
      const expectedValue = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
      const meta = source.metricMetadata || {};
      assert.equal(actual.value, expectedValue, iso3 + ':' + rule.id + ' value');
      assert.equal(actual.year, typeof meta.years?.[index] === 'number' ? meta.years[index] : null, iso3 + ':' + rule.id + ' year');
      assert.equal(actual.sourceStatus, decode(provenance.statuses, meta.statusCodes?.[index]) || (expectedValue === null ? 'MISSING' : 'SOURCE_STATUS_UNKNOWN'));
      assert.equal(actual.sourceId, decode(provenance.sourceIds, meta.sourceCodes?.[index]));
      assert.equal(actual.sourceName, decode(provenance.sourceNames, meta.sourceNameCodes?.[index]));
      assert.equal(actual.method, decode(provenance.methods, meta.methodCodes?.[index]));
      assert.equal(actual.indicatorCode, meta.indicatorCodes?.[index] || null);
      assert.equal(actual.sourceUrl, meta.sourceUrls?.[index] || null);
      assert.equal(actual.confidence, typeof meta.sourceConfidence?.[index] === 'number' ? meta.sourceConfidence[index] : null);
      assert.equal(actual.dataGap, meta.dataGaps?.[index] || null);
      assert.equal(actual.note, meta.notes?.[index] || null);
    }
  }
});
