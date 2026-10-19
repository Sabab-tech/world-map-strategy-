import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const registry = readJson('country_general_data_registry_v1.json');
const schema = readJson('country_sector_profile_schema_v1.json');
const profilesPath = 'country_sector_profiles_v1.json';
const profiles = existsSync(profilesPath) ? readJson(profilesPath) : null;

test('sector profile registry covers the canonical roster with unique ISO3 identities', () => {
  assert.ok(profiles, 'Run scripts/build_country_sector_profiles_v1.mjs before testing.');
  const canonical = readJson('countries.json');
  assert.equal(profiles.metadata.countryAndTerritoryCount, canonical.length);
  assert.equal(profiles.countries.length, canonical.length);
  assert.equal(profiles.metadata.uniqueIso3Count, canonical.length);
  assert.equal(profiles.metadata.duplicateIdentityCount, 0);
  assert.equal(new Set(profiles.countries.map((row) => row.identity.iso3)).size, canonical.length);
  assert.deepEqual(
    profiles.countries.map((row) => row.identity.iso3).sort(),
    canonical.map((row) => row.iso3).sort()
  );
  assert.equal(profiles.metadata.noSourceRecordsDeleted, true);
  assert.equal(profiles.metadata.unknownValuesConvertedToZero, false);
});

test('every profile contains the same extensible sector and calculation contracts', () => {
  assert.ok(schema.sectors.length >= 8);
  assert.ok(schema.calculationModels.length >= 3);
  assert.ok(schema.extensionContract.additiveOnly);
  assert.ok(schema.extensionContract.customAttributesField);
  assert.ok(schema.extensionContract.customMetricsField);
  for (const row of profiles.countries) {
    assert.deepEqual(Object.keys(row.sectors).sort(), schema.sectors.map((sector) => sector.id).sort());
    assert.ok(Array.isArray(row.extensions.customAttributes));
    assert.ok(Array.isArray(row.extensions.customMetrics));
    assert.ok(Array.isArray(row.extensions.customTimeSeries));
    assert.ok(row.analytics.economicCapacityIndex);
    assert.ok(row.analytics.economicStressIndex);
    assert.ok(row.analytics.diplomaticInfluenceIndex);
    assert.ok(row.analytics.militaryCapabilityIndex);
  }
});

test('unknown values stay null and derived financial ratios require same-year inputs', () => {
  for (const row of profiles.countries) {
    for (const definition of schema.derivedMetrics.filter((item) => item.requireSameYear)) {
      const value = row.derivedMetrics[definition.key];
      assert.ok(value, 'Missing calculation definition ' + definition.key);
      if (value.value !== null) {
        const inputYears = Object.values(value.inputYears || {}).filter((year) => year !== null);
        assert.ok(inputYears.length > 0);
        assert.equal(new Set(inputYears).size, 1, definition.key + ' combines different years for ' + row.identity.iso3);
      }
    }
    for (const slot of schema.unavailableModelSlots) {
      assert.equal(row.analytics[slot.id].value, null, slot.id + ' must not be fabricated');
      assert.equal(row.analytics[slot.id].status, 'NOT_SCORED_REQUIRED_DATA_MISSING');
    }
    for (const key of Object.keys(row.metrics)) {
      const observation = row.metrics[key];
      assert.ok(observation.value === null || (typeof observation.value === 'number' && Number.isFinite(observation.value)));
    }
  }
  assert.ok(registry.metadata.metricCoverage);
});

test('relative signals retain data year, source and quality labels', () => {
  for (const row of profiles.countries) {
    for (const signal of [...row.relativeSignals.strengths, ...row.relativeSignals.vulnerabilities]) {
      assert.ok(signal.metricKey);
      assert.ok(Number.isFinite(signal.value));
      assert.ok(Number.isFinite(signal.peerPercentile));
      assert.ok(signal.peerPercentile >= 0 && signal.peerPercentile <= 100);
      assert.ok(signal.evidenceStatus);
      assert.ok('year' in signal);
      assert.ok('sourceId' in signal);
    }
  }
});

test('current World Bank WGI series are used with explicit legacy fallback and per-series diagnostics', () => {
  const governance = registry.fieldCatalogue.filter((field) => field.key.endsWith('WgiEstimate'));
  const expected = {
    ruleOfLawWgiEstimate: ['GOV_WGI_RL_EST', 'RL.EST'],
    controlOfCorruptionWgiEstimate: ['GOV_WGI_CC_EST', 'CC.EST'],
    politicalStabilityWgiEstimate: ['GOV_WGI_PV_EST', 'PV.EST'],
    governmentEffectivenessWgiEstimate: ['GOV_WGI_GE_EST', 'GE.EST'],
    regulatoryQualityWgiEstimate: ['GOV_WGI_RQ_EST', 'RQ.EST'],
    voiceAccountabilityWgiEstimate: ['GOV_WGI_VA_EST', 'VA.EST']
  };
  assert.equal(governance.length, 6);
  for (const field of governance) {
    assert.deepEqual([field.wb, ...(field.wbFallbacks || [])], expected[field.key]);
  }
  const refresh = registry.metadata.externalRefresh;
  if (refresh && refresh.requested) {
    const diagnostics = refresh.governanceIndicatorRefresh;
    assert.ok(diagnostics, 'Source refresh must retain per-indicator diagnostics.');
    for (const key of Object.keys(expected)) {
      const item = diagnostics[key];
      assert.ok(item, 'Missing refresh report for ' + key);
      assert.ok(item.countriesWithFreshObservation > 0,
        key + ' returned no fresh values. Review externalRefresh.worldBankIndicatorErrors and the WGI series API.');
      assert.equal(item.status, 'FRESH_OBSERVATIONS_RECEIVED');
    }
  }
});
