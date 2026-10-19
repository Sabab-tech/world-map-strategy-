import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const registry = readJson('country_general_data_registry_v1.json');
const roster = readJson('countries.json');
const rawFinancial = readJson('economy_raw_financial_data_v2.json');
const profilesSource = readJson('economy_global_profiles_v1.json').countries;
const relationSource = readJson('relation_generation_engine.json').RELATION_GENERATION_ENGINE;
const resourceSiteSource = readJson('resource_site_reserve_simulation_v1.json');
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

test('every canonical identity has a source-aware strategic profile inside the existing registry', () => {
  const profileFields = schema.strategicProfileFields;
  assert.ok(Array.isArray(profileFields) && profileFields.length >= 10);
  assert.deepEqual(profileFields, [
    'profileVersion', 'sovereigntyScope', 'executiveSummary', 'archetype', 'archetypeSource',
    'diplomacy', 'economy', 'military', 'politics', 'dependencies',
    'overallStrengths', 'overallWeaknesses', 'playerAdvantages', 'playerChallenges',
    'recommendedStrategy', 'strategyOptions', 'assessmentCriteria', 'dataQuality'
  ]);
  assert.equal(registry.metadata.localCoverage.strategicProfiles, roster.length);
  assert.equal(registry.metadata.localCoverage.relationProfileRecords,
    Object.keys(relationSource.srie_v2_asymmetrical_salience || {}).length);
  const canonicalIso3 = new Set(roster.map((row) => String(row.iso3).toUpperCase()));
  const expectedCommercialSiteCount = (resourceSiteSource.records || []).filter((site) =>
    site.commercialExtraction === true && canonicalIso3.has(String(site.countryId || '').toUpperCase())).length;
  assert.equal(registry.metadata.localCoverage.commercialGameplayResourceSiteRecords, expectedCommercialSiteCount);

  const statusCounts = {
    COUNTRY_SPECIFIC_PARAMETERS: 0,
    GENERIC_DEFAULT_PARAMETERS: 0,
    LEGACY_CONTEXT_ONLY: 0,
    NO_LEGACY_RELATION_PROFILE: 0
  };
  for (const row of registry.countries) {
    assert.equal(row.strategicProfile.length, profileFields.length);
    const profile = Object.fromEntries(profileFields.map((field, index) => [field, row.strategicProfile[index]]));
    assert.equal(profile.profileVersion, 'OMEGA_COUNTRY_STRATEGIC_PROFILE_V2');
    assert.ok(typeof profile.executiveSummary === 'string' && profile.executiveSummary.length > 20);
    assert.ok(typeof profile.archetype === 'string' && profile.archetype.length > 2);
    assert.ok(Array.isArray(profile.overallStrengths) && profile.overallStrengths.length > 0);
    assert.ok(Array.isArray(profile.overallWeaknesses) && profile.overallWeaknesses.length > 0);
    assert.ok(Array.isArray(profile.playerAdvantages) && profile.playerAdvantages.length > 0);
    assert.ok(Array.isArray(profile.playerChallenges) && profile.playerChallenges.length > 0);
    assert.ok(typeof profile.recommendedStrategy === 'string' && profile.recommendedStrategy.length > 20);
    assert.ok(Array.isArray(profile.strategyOptions) && profile.strategyOptions.length > 0);
    assert.equal(profile.assessmentCriteria.rubricVersion, 'OMEGA_COUNTRY_PROFILE_RUBRIC_V2');
    assert.ok(profile.assessmentCriteria.thresholds.highPublicDebtPressure);
    assert.ok(profile.assessmentCriteria.peerComparison.rule.includes('exact observation year'));
    assert.ok(Array.isArray(profile.economy.pressurePoints));
    assert.ok(Array.isArray(profile.economy.developmentSignals));
    assert.equal(profile.economy.trendStatus, 'MULTI_YEAR_ECONOMIC_TREND_NOT_COMPUTED_FROM_SINGLE_LATEST_VALUES');
    assert.ok(Array.isArray(profile.diplomacy.modelSignals));
    assert.ok(Array.isArray(profile.diplomacy.cooperationSignals));
    assert.ok(Array.isArray(profile.diplomacy.pressurePoints));
    assert.ok(Array.isArray(profile.military.capabilityGaps));
    assert.equal(profile.military.trendStatus, 'MILITARY_CAPABILITY_TREND_NOT_MEASURED');
    assert.ok(Array.isArray(profile.politics.governanceIndicatorPoints));
    assert.ok(Array.isArray(profile.dependencies.measurementGaps));
    assert.ok(profile.diplomacy && profile.economy && profile.military && profile.politics && profile.dependencies);
    assert.equal(profile.military.capabilityStatus, 'OPERATIONAL_CAPABILITY_NOT_MEASURED_BY_GENERAL_REGISTRY');
    assert.equal(profile.politics.politicalSystemClassification, 'NOT_CLASSIFIED_FROM_AVAILABLE_DATA');
    assert.ok(profile.dataQuality.evidenceMetricYears);
    assert.ok(profile.dataQuality.evidenceMetrics);
    assert.ok(Array.isArray(profile.dataQuality.sourceFiles));
    assert.equal(profile.economy.gameplayResourceAssets.authority, 'SCENARIO_SIMULATION_DATA');
    assert.equal(profile.economy.gameplayResourceAssets.reserveValuesUsedAsNationalEconomicFacts, false);
    assert.ok(Object.hasOwn(statusCounts, profile.dataQuality.relationProfileStatus));
    statusCounts[profile.dataQuality.relationProfileStatus] += 1;
    if (profile.dataQuality.relationProfileStatus === 'GENERIC_DEFAULT_PARAMETERS') {
      assert.deepEqual(profile.diplomacy.parameters, {});
      assert.equal(profile.diplomacy.strategicDriver, null);
    }
    const percentileValues = [
      profile.economy.scores.economicScalePercentile,
      profile.economy.scores.foreignExchangeReservePercentile,
      profile.economy.scores.economicInfluencePercentile,
      profile.politics.governanceQualityPercentile,
      profile.military.financialBasePercentile,
      profile.military.expenditureSharePercentile,
      profile.military.populationScalePercentile
    ];
    for (const value of percentileValues) {
      assert.equal(value === null || (Number.isFinite(value) && value >= 0 && value <= 100), true);
    }
    for (const [scoreKey, yearKey, countKey] of [
      ['economicScalePercentile','economicScalePeerYear','economicScalePeerCount'],
      ['economicInfluencePercentile','economicInfluencePeerYear','economicInfluencePeerCount'],
      ['foreignExchangeReservePercentile','foreignExchangeReservePeerYear','foreignExchangeReservePeerCount']
    ]) {
      const score = profile.economy.scores[scoreKey];
      if (score !== null) {
        assert.ok(Number.isFinite(profile.economy.scores[yearKey]), scoreKey + ' must disclose its cohort year');
        assert.ok(profile.economy.scores[countKey] >= 5, scoreKey + ' must have at least five same-year observations');
      }
    }
    assert.equal(Object.hasOwn(profile.military, 'militaryStrengthScore'), false);
  }
  assert.equal(Object.values(statusCounts).reduce((sum, value) => sum + value, 0), roster.length);
  assert.equal(statusCounts.GENERIC_DEFAULT_PARAMETERS,
    registry.metadata.localCoverage.genericDefaultRelationProfiles);
  assert.equal(statusCounts.COUNTRY_SPECIFIC_PARAMETERS,
    registry.metadata.localCoverage.countrySpecificRelationParameterProfiles);
});

test('the preferred WGI series and documented fallback identifiers are part of the existing source collector', () => {
  const expected = {
    ruleOfLawWgiEstimate: ['GOV_WGI_RL_EST', 'RL.EST'],
    controlOfCorruptionWgiEstimate: ['GOV_WGI_CC_EST', 'CC.EST'],
    politicalStabilityWgiEstimate: ['GOV_WGI_PV_EST', 'PV.EST'],
    governmentEffectivenessWgiEstimate: ['GOV_WGI_GE_EST', 'GE.EST'],
    regulatoryQualityWgiEstimate: ['GOV_WGI_RQ_EST', 'RQ.EST'],
    voiceAccountabilityWgiEstimate: ['GOV_WGI_VA_EST', 'VA.EST']
  };
  for (const [key, [preferred, fallback]] of Object.entries(expected)) {
    const field = registry.fieldCatalogue.find((row) => row.key === key);
    assert.ok(field, 'Missing governance field ' + key);
    assert.equal(field.wb, preferred);
    assert.deepEqual(field.wbFallbacks, [fallback]);
  }
  if (registry.metadata.externalRefresh.requested) {
    const diagnostics = registry.metadata.externalRefresh.governanceIndicatorRefresh;
    assert.ok(diagnostics, 'A refresh must preserve WGI source-series diagnostics.');
    for (const key of Object.keys(expected)) {
      assert.ok(diagnostics[key], 'Missing WGI refresh diagnostics for ' + key);
      assert.ok(['FRESH_OBSERVATIONS_RECEIVED', 'REQUEST_FAILED_OR_PARTIAL', 'NO_NUMERIC_OBSERVATIONS_RECEIVED'].includes(diagnostics[key].status));
    }
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
