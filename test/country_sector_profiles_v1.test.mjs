import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const registry = readJson('country_general_data_registry_v1.json');
const schema = readJson('country_sector_profile_schema_v1.json');
const profilesPath = 'country_sector_profiles_v1.json';
const profiles = existsSync(profilesPath) ? readJson(profilesPath) : null;
const registryIso3Index = registry.metadata.recordSchema.identityFields.indexOf('iso3');
const metricIndex = new Map(registry.fieldCatalogue.map((field) => [field.key, field]));
const registryByIso3 = new Map(registry.countries.map((source) => [
  source.identity[registryIso3Index], source
]));

test('sector profile registry covers the canonical roster with unique ISO3 identities', () => {
  assert.ok(profiles, 'Run scripts/build_country_sector_profiles_v1.mjs before testing.');
  assert.ok(statSync(profilesPath).size < 12 * 1024 * 1024,
    'sector profiles must remain under 12 MiB; actual bytes=' + statSync(profilesPath).size + '. Reuse canonical observations and avoid duplicated model evidence.');
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
  assert.equal(profiles.metadata.storageModel, 'COMPACT_REFERENCES_TO_CANONICAL_COUNTRY_REGISTRY');
  assert.equal(profiles.sourceRegistry.identityKey, 'iso3');
  assert.equal(profiles.metadata.externalIndexSources[0].datasetId, 'OMEGA_TI_CPI_2025_SNAPSHOT_V1');
  assert.equal(profiles.metadata.externalIndexSources[0].observationYear, 2025);
  assert.equal(profiles.metadata.externalIndexSources[0].missingObservationsRemainNull, true);
});

test('every profile contains the same extensible sector and calculation contracts', () => {
  assert.ok(schema.sectors.length >= 8);
  assert.ok(schema.calculationModels.length >= 3);
  assert.ok(schema.extensionContract.additiveOnly);
  assert.ok(schema.extensionContract.customAttributesField);
  assert.ok(schema.extensionContract.customMetricsField);
  for (const row of profiles.countries) {
    assert.deepEqual(Object.keys(row.sectors).sort(), schema.sectors.map((sector) => sector.id).sort());
    for (const section of schema.sectors) {
      assert.equal(typeof section.title, 'string');
      if (section.description !== undefined) assert.equal(typeof section.description, 'string');
      if (section.extensionSlots !== undefined) assert.ok(Array.isArray(section.extensionSlots),
        'declared sector extension slots must remain an array in the canonical schema');
    }
    for (const sectorId of Object.keys(row.sectors)) {
      assert.equal(typeof row.sectors[sectorId].status, 'string');
      assert.ok(!Object.hasOwn(row.sectors[sectorId], 'title'));
      assert.ok(!Object.hasOwn(row.sectors[sectorId], 'description'));
      assert.ok(!Object.hasOwn(row.sectors[sectorId], 'extensionSlots'));
    }
    assert.ok(Array.isArray(row.extensions.customAttributes));
    assert.ok(Array.isArray(row.extensions.customMetrics));
    assert.ok(Array.isArray(row.extensions.customTimeSeries));
    assert.ok(row.analytics.economicCapacityIndex);
    assert.ok(row.analytics.economicStressIndex);
    assert.ok(row.analytics.diplomaticInfluenceIndex);
    assert.ok(row.analytics.militaryCapabilityIndex);
    assert.deepEqual(row.sourceRegistryRef, {
      dataset: 'country_general_data_registry_v1.json',
      identityKey: 'iso3',
      identityValue: row.identity.iso3
    });
    assert.ok(registryByIso3.has(row.identity.iso3), 'sector identity must resolve to the canonical registry record');
    assert.equal(row.profileVersion, schema.schemaVersion);
    assert.ok(Object.hasOwn(row.externalMetrics, 'corruptionPerceptionIndex'));
    assert.ok(Object.hasOwn(row.externalMetrics, 'corruptionPerceptionRank'));
    assert.equal(row.externalMetrics.humanDevelopmentIndex.value, null);
    assert.equal(row.externalMetrics.humanDevelopmentIndex.status, 'NOT_IMPORTED');
    for (const sector of Object.values(row.sectors)) {
      for (const ref of Object.values(sector.indicators || {})) {
        assert.ok(['METRIC','DERIVED_METRIC','EXTERNAL_METRIC'].includes(ref.refType));
        assert.equal(typeof ref.key, 'string');
        if (ref.refType === 'METRIC') assert.ok(metricIndex.has(ref.key), 'unresolved canonical metric ref: ' + ref.key);
        else if (ref.refType === 'DERIVED_METRIC') assert.ok(Object.hasOwn(row.derivedMetrics, ref.key), 'unresolved derived metric ref: ' + ref.key);
        else assert.ok(Object.hasOwn(row.externalMetrics, ref.key), 'unresolved external metric ref: ' + ref.key);
      }
      for (const ref of Object.values(sector.facts || {})) {
        assert.equal(ref.refType, 'GENERAL_FACT');
        assert.ok(registry.metadata.recordSchema.generalFactFields.includes(ref.key), 'unresolved general fact ref: ' + ref.key);
      }
    }
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
    const canonicalRow = registryByIso3.get(row.identity.iso3);
    for (const rawValue of canonicalRow.metrics || []) {
      assert.ok(rawValue === null || (typeof rawValue === 'number' && Number.isFinite(rawValue)),
        'canonical metric values must remain finite or null');
    }
    for (const observation of Object.values(row.derivedMetrics)) {
      assert.ok(observation.value === null || (typeof observation.value === 'number' && Number.isFinite(observation.value)));
    }
  }
  assert.ok(registry.metadata.metricCoverage);
});

test('CPI score and rank use the publisher result snapshot with correct provenance and null gaps', () => {
  const snapshot = readJson('country_official_index_observations_v1.json');
  assert.equal(snapshot.metadata.observationYear, 2025);
  assert.equal(snapshot.metadata.datasetId, 'OMEGA_TI_CPI_2025_SNAPSHOT_V1');
  assert.equal(snapshot.countries.length, 182);
  const byIso3 = new Map(snapshot.countries.map((row) => [row.iso3, row]));
  for (const profile of profiles.countries) {
    const observation = byIso3.get(profile.identity.iso3);
    const score = profile.externalMetrics.corruptionPerceptionIndex;
    const rank = profile.externalMetrics.corruptionPerceptionRank;
    if (observation) {
      assert.equal(score.value, observation.score);
      assert.equal(rank.value, observation.rank);
      assert.equal(score.year, 2025);
      assert.equal(rank.year, 2025);
      assert.equal(score.status, 'SOURCE_OBSERVATION');
      assert.equal(rank.status, 'SOURCE_OBSERVATION');
      assert.equal(score.sourceId, snapshot.metadata.datasetId);
      assert.equal(score.sourceUrl, snapshot.metadata.publisherUrl);
      assert.equal(score.mirrorUrl, snapshot.metadata.sourceUrl);
    } else {
      assert.equal(score.value, null);
      assert.equal(rank.value, null);
      assert.equal(score.status, 'NO_SOURCE_OBSERVATION');
      assert.equal(rank.status, 'NO_SOURCE_OBSERVATION');
      assert.equal(score.year, null);
    }
  }
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
