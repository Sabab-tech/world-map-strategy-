import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const registry = readJson('country_general_data_registry_v1.json');
const roster = readJson('countries.json');
const rawFinancial = readJson('economy_raw_financial_data_v2.json');
const profilesSource = readJson('economy_global_profiles_v1.json').countries;
const rawRows = rawFinancial.countries || [];
const schema = registry.metadata.recordSchema;
const rawFields = registry.metadata.rawFinancialFieldNames;
const rawDerivedFields = registry.metadata.rawFinancialDerivedFieldNames;
const metricFields = schema.metricFields;
const idIndex = Object.fromEntries(schema.identityFields.map((field, index) => [field, index]));
const resourceIndex = Object.fromEntries(schema.naturalResourceFields.map((field, index) => [field, index]));
const metricIndex = Object.fromEntries(metricFields.map((field, index) => [field, index]));
const provenance = registry.metadata.provenanceEncoding;
const mapByIso3 = (rows, getter) => new Map(rows.map(row => [String(getter(row) || '').toUpperCase(), row]));
const rawByIso3 = mapByIso3(rawRows, row => row.iso3);
const profilesByIso3 = mapByIso3(profilesSource, row => row.iso3);
const finiteOrNull = (value) => value === null || (typeof value === 'number' && Number.isFinite(value));

test('registry includes every canonical country/territory identity exactly once', () => {
  assert.equal(registry.metadata.countryAndTerritoryCount, roster.length);
  assert.equal(registry.countries.length, roster.length);
  assert.equal(registry.metadata.uniqueIso3Count, roster.length);
  assert.equal(registry.metadata.dataQualityPolicy.duplicateDeletionPerformed, false);
  const iso3 = registry.countries.map(row => row.identity[idIndex.iso3]);
  assert.equal(new Set(iso3).size, roster.length);
  assert.deepEqual([...iso3].sort(), roster.map(row => row.iso3).sort());
});

test('all countries use the same documented ordered schema and metric/provenance lengths', () => {
  assert.equal(schema.encoding, 'ORDERED_VALUE_ARRAYS_V1');
  assert.deepEqual(metricFields, registry.fieldCatalogue.map(field => field.key));
  assert.equal(registry.metadata.profileIndicatorNames.length, schema.economyGlobalProfileFields.includes('indicatorValues') ? registry.metadata.profileIndicatorNames.length : -1);
  assert.equal(rawFields.length, registry.metadata.rawFinancialFieldCount);
  assert.equal(rawDerivedFields.length, registry.metadata.rawFinancialDerivedFieldCount);
  assert.equal(rawFields.length, rawFinancial.metadata.rawFieldCount);
  assert.deepEqual(rawFields, Object.keys(rawRows[0].rawIndicators));
  assert.deepEqual(rawDerivedFields, Object.keys(rawRows[0].derivedIndicators));

  const topKeys = Object.keys(registry.countries[0]).sort();
  for (const row of registry.countries) {
    assert.deepEqual(Object.keys(row).sort(), topKeys);
    assert.equal(row.identity.length, schema.identityFields.length);
    assert.equal(row.generalFacts.length, schema.generalFactFields.length);
    assert.equal(row.metrics.length, metricFields.length);
    assert.equal(row.metricMetadata.years.length, metricFields.length);
    assert.equal(row.metricMetadata.statusCodes.length, metricFields.length);
    assert.equal(row.metricMetadata.sourceCodes.length, metricFields.length);
    if (Array.isArray(row.metricMetadata.sourceNameCodes)) assert.equal(row.metricMetadata.sourceNameCodes.length, metricFields.length);
    assert.equal(row.metricMetadata.methodCodes.length, metricFields.length);
    if (Array.isArray(row.metricMetadata.indicatorCodes)) assert.equal(row.metricMetadata.indicatorCodes.length, metricFields.length);
    if (Array.isArray(row.metricMetadata.sourceUrls)) assert.equal(row.metricMetadata.sourceUrls.length, metricFields.length);
    if (Array.isArray(row.metricMetadata.notes)) assert.equal(row.metricMetadata.notes.length, metricFields.length);
    else assert.equal(row.metricMetadata.noteCodes.length, metricFields.length);
    assert.equal(row.legacySnapshots.length, schema.legacySnapshotFields.length);
    assert.equal(row.naturalResources.length, schema.naturalResourceFields.length);
    assert.equal(row.publicSafety.length, schema.publicSafetyFields.length);
    assert.equal(row.localGeography.length, schema.localGeographyFields.length);
    assert.equal(row.dataStatus.length, schema.dataStatusFields.length);

    for (let index = 0; index < metricFields.length; index += 1) {
      assert.ok(finiteOrNull(row.metrics[index]), 'Invalid metric ' + metricFields[index] + ' in ' + row.identity[idIndex.iso3]);
      const statusCode = row.metricMetadata.statusCodes[index];
      assert.ok(statusCode === -1 || typeof provenance.statuses[statusCode] === 'string',
        'Metric provenance status missing for ' + metricFields[index]);
      assert.ok(row.metrics[index] === null || Number.isFinite(row.metricMetadata.years[index]) ||
        row.metricMetadata.years[index] === null);
    }
  }
});

test('raw financial observations and derived indicators are losslessly preserved in source-key order', () => {
  assert.equal(rawRows.length, roster.length);
  const rawGroupIndex = schema.legacySnapshotFields.indexOf('rawFinancialRegistry');
  for (const row of registry.countries) {
    const iso3 = row.identity[idIndex.iso3];
    const source = rawByIso3.get(iso3);
    const rawSnapshot = row.legacySnapshots[rawGroupIndex];
    assert.ok(source, 'Raw finance source missing for ' + iso3);
    assert.equal(rawSnapshot[1].length, rawFields.length);
    assert.equal(rawSnapshot[2].length, rawDerivedFields.length);
    for (let index = 0; index < rawFields.length; index += 1) {
      const expected = source.rawIndicators[rawFields[index]] === undefined ? null : source.rawIndicators[rawFields[index]];
      assert.deepEqual(rawSnapshot[1][index], expected, 'Raw value changed for ' + iso3 + '.' + rawFields[index]);
    }
    for (let index = 0; index < rawDerivedFields.length; index += 1) {
      const expected = source.derivedIndicators[rawDerivedFields[index]] === undefined ? null : source.derivedIndicators[rawDerivedFields[index]];
      assert.deepEqual(rawSnapshot[2][index], expected, 'Derived value changed for ' + iso3 + '.' + rawDerivedFields[index]);
    }
  }
});

test('legacy economic-profile indicators and availability flags are lossless', () => {
  const profileIndex = schema.legacySnapshotFields.indexOf('economyGlobalProfile');
  const names = registry.metadata.profileIndicatorNames;
  for (const row of registry.countries) {
    const iso3 = row.identity[idIndex.iso3];
    const source = profilesByIso3.get(iso3);
    const profile = row.legacySnapshots[profileIndex];
    assert.equal(profile[3].length, names.length);
    assert.equal(profile[4].length, names.length);
    for (let index = 0; index < names.length; index += 1) {
      const field = names[index];
      assert.deepEqual(profile[3][index], source?.indicators && source.indicators[field] !== undefined ? source.indicators[field] : null);
      assert.deepEqual(profile[4][index], source?.metricAvailability && source.metricAvailability[field] !== undefined ? source.metricAvailability[field] : false);
    }
  }
});

test('missing values stay unknown, not zero, and resource sub-schema is consistent', () => {
  for (const row of registry.countries) {
    const res = row.naturalResources;
    if (res[resourceIndex.coverageStatus] === 'NO_RESOURCE_CONTEXT_RECORD') {
      for (const value of res[resourceIndex.mineralResourceBase]) assert.equal(value, null);
      for (const value of res[resourceIndex.hydrocarbonResourceBase]) assert.equal(value, null);
      for (const value of res[resourceIndex.energyResourceBase]) assert.equal(value, null);
    }
    assert.equal(res[resourceIndex.mineralResourceBase].length, schema.mineralResourceFields.length);
    assert.equal(res[resourceIndex.hydrocarbonResourceBase].length, schema.hydrocarbonResourceFields.length);
    assert.equal(res[resourceIndex.energyResourceBase].length, schema.energyResourceFields.length);
    assert.equal(row.publicSafety[2].length, schema.crimeFields.length);
    assert.equal(row.publicSafety[3].length, schema.crimeFields.length);
    assert.equal(row.publicSafety[4].length, schema.crimeFields.length);
  }
});

test('discipline score is not invented or confused with official governance indicators', () => {
  const disciplineIndex = metricIndex.disciplineIndex;
  const ruleOfLawIndex = metricIndex.ruleOfLawWgiEstimate;
  for (const row of registry.countries) {
    assert.equal(row.metrics[disciplineIndex], null);
    assert.equal(provenance.statuses[row.metricMetadata.statusCodes[disciplineIndex]], 'NOT_DEFINED_OR_SOURCED');
    const rule = row.metrics[ruleOfLawIndex];
    assert.equal(rule === null || (rule >= -2.5 && rule <= 2.5), true);
  }
});

test('coverage totals reconcile and no source or duplicate deletion is claimed', () => {
  for (const field of registry.fieldCatalogue) {
    const coverage = registry.metadata.metricCoverage[field.key];
    assert.equal(coverage.total, registry.countries.length);
    assert.equal(coverage.nonNull + coverage.missing, registry.countries.length);
  }
  assert.equal(registry.metadata.dataQualityPolicy.duplicateDeletionPerformed, false);
  assert.equal(registry.metadata.dataQualityPolicy.legacyBaselineExternallyRevalidated, false);
  assert.ok(registry.metadata.dataQualityPolicy.nullMeans.includes('never zero'));
});
