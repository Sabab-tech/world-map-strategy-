import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const registry = readJson('country_general_data_registry_v1.json');
const roster = readJson('countries.json');
const rawFinancial = readJson('economy_raw_financial_data_v2.json');
const rawRows = rawFinancial.countries || [];
const byIso3 = (rows) => new Map(rows.map((row) => [String(row.iso3 || row.identity?.iso3 || '').toUpperCase(), row]));
const finiteOrNull = (value) => value === null || (typeof value === 'number' && Number.isFinite(value));

test('registry includes every canonical country/territory identity exactly once', () => {
  assert.equal(registry.metadata.countryAndTerritoryCount, roster.length);
  assert.equal(registry.countries.length, roster.length);
  assert.equal(registry.metadata.uniqueIso3Count, roster.length);
  const iso3 = registry.countries.map((row) => row.identity.iso3);
  assert.equal(new Set(iso3).size, roster.length);
  assert.deepEqual([...iso3].sort(), roster.map((row) => row.iso3).sort());
});

test('every country uses the same top-level schema and every metric key', () => {
  const expectedRecordKeys = [
    'identity', 'generalFacts', 'metrics', 'metricMetadata',
    'legacySnapshots', 'naturalResources', 'publicSafety',
    'localGeography', 'dataStatus'
  ].sort();
  const firstMetricKeys = Object.keys(registry.countries[0].metrics).sort();
  const firstMetadataKeys = Object.keys(registry.countries[0].metricMetadata).sort();
  assert.deepEqual(firstMetricKeys, registry.fieldCatalogue.map((field) => field.key).sort());
  assert.deepEqual(firstMetadataKeys, firstMetricKeys);

  for (const row of registry.countries) {
    assert.deepEqual(Object.keys(row).sort(), expectedRecordKeys);
    assert.deepEqual(Object.keys(row.metrics).sort(), firstMetricKeys);
    assert.deepEqual(Object.keys(row.metricMetadata).sort(), firstMetadataKeys);
    for (const key of firstMetricKeys) {
      assert.ok(finiteOrNull(row.metrics[key]), 'Invalid metric ' + key + ' for ' + row.identity.iso3);
      assert.ok(row.metricMetadata[key] && typeof row.metricMetadata[key].status === 'string',
        'Missing provenance status for ' + key + ' in ' + row.identity.iso3);
      assert.ok(row.metrics[key] === null || Number.isFinite(row.metricMetadata[key].year) ||
        row.metricMetadata[key].year === null,
        'Invalid year metadata for ' + key + ' in ' + row.identity.iso3);
    }
  }
});

test('raw financial observations and derived indicators preserve the full source schema', () => {
  assert.equal(rawRows.length, roster.length);
  assert.equal(registry.metadata.rawFinancialFieldCount, rawFinancial.metadata.rawFieldCount);
  assert.equal(registry.metadata.rawFinancialFieldNames.length, rawFinancial.metadata.rawFieldCount);
  assert.equal(registry.metadata.rawFinancialDerivedFieldCount,
    registry.metadata.rawFinancialDerivedFieldNames.length);
  const rawByCode = byIso3(rawRows);

  for (const row of registry.countries) {
    const source = rawByCode.get(row.identity.iso3);
    const embedded = row.legacySnapshots.rawFinancialRegistry;
    assert.ok(source, 'Raw finance source missing for ' + row.identity.iso3);
    assert.deepEqual(Object.keys(embedded.rawIndicators).sort(),
      [...registry.metadata.rawFinancialFieldNames].sort());
    assert.deepEqual(Object.keys(embedded.derivedIndicators).sort(),
      [...registry.metadata.rawFinancialDerivedFieldNames].sort());
    for (const field of registry.metadata.rawFinancialFieldNames) {
      const expected = source.rawIndicators[field] === undefined ? null : source.rawIndicators[field];
      assert.deepEqual(embedded.rawIndicators[field], expected,
        'Raw observation changed for ' + row.identity.iso3 + '.' + field);
    }
    for (const field of registry.metadata.rawFinancialDerivedFieldNames) {
      const expected = source.derivedIndicators[field] === undefined ? null : source.derivedIndicators[field];
      assert.deepEqual(embedded.derivedIndicators[field], expected,
        'Derived observation changed for ' + row.identity.iso3 + '.' + field);
    }
  }
});

test('missing values remain null and are never silently fabricated as zero', () => {
  for (const row of registry.countries) {
    for (const field of registry.fieldCatalogue) {
      if (row.metrics[field.key] === null) {
        assert.ok(row.metricMetadata[field.key].status,
          'Null value must include a reason/status: ' + row.identity.iso3 + '.' + field.key);
      }
    }
    if (row.naturalResources.coverageStatus === 'NO_RESOURCE_CONTEXT_RECORD') {
      for (const value of Object.values(row.naturalResources.mineralResourceBase)) assert.equal(value, null);
      for (const value of Object.values(row.naturalResources.hydrocarbonResourceBase)) assert.equal(value, null);
      for (const value of Object.values(row.naturalResources.energyResourceBase)) assert.equal(value, null);
    }
  }
});

test('resource, public-safety and local-geography sub-schemas are complete and consistent', () => {
  const first = registry.countries[0];
  const keys = {
    identity: Object.keys(first.identity).sort(),
    generalFacts: Object.keys(first.generalFacts).sort(),
    naturalResources: Object.keys(first.naturalResources).sort(),
    mineral: Object.keys(first.naturalResources.mineralResourceBase).sort(),
    hydrocarbon: Object.keys(first.naturalResources.hydrocarbonResourceBase).sort(),
    energy: Object.keys(first.naturalResources.energyResourceBase).sort(),
    safety: Object.keys(first.publicSafety).sort(),
    localGeography: Object.keys(first.localGeography).sort()
  };
  for (const row of registry.countries) {
    for (const key of ['identity', 'generalFacts', 'naturalResources', 'publicSafety', 'localGeography']) {
      assert.deepEqual(Object.keys(row[key]).sort(), keys[key],
        'Schema mismatch: ' + row.identity.iso3 + '.' + key);
    }
    assert.deepEqual(Object.keys(row.naturalResources.mineralResourceBase).sort(), keys.mineral);
    assert.deepEqual(Object.keys(row.naturalResources.hydrocarbonResourceBase).sort(), keys.hydrocarbon);
    assert.deepEqual(Object.keys(row.naturalResources.energyResourceBase).sort(), keys.energy);
  }
});

test('discipline score is not invented or confused with official governance indicators', () => {
  for (const row of registry.countries) {
    assert.equal(row.metrics.disciplineIndex, null);
    assert.equal(row.metricMetadata.disciplineIndex.status, 'NOT_DEFINED_OR_SOURCED');
    assert.equal(row.metrics.ruleOfLawWgiEstimate === null ||
      (row.metrics.ruleOfLawWgiEstimate >= -2.5 && row.metrics.ruleOfLawWgiEstimate <= 2.5), true);
  }
});

test('coverage counts reconcile to the country roster and the schema explains source limitations', () => {
  for (const field of registry.fieldCatalogue) {
    const coverage = registry.metadata.metricCoverage[field.key];
    assert.equal(coverage.total, registry.countries.length);
    assert.equal(coverage.nonNull + coverage.missing, registry.countries.length);
  }
  assert.equal(registry.metadata.dataQualityPolicy.duplicateDeletionPerformed, false);
  assert.equal(registry.metadata.dataQualityPolicy.legacyBaselineExternallyRevalidated, false);
  assert.ok(registry.metadata.dataQualityPolicy.nullMeans.includes('never zero'));
});
