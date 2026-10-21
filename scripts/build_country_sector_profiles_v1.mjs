#!/usr/bin/env node
/**
 * Builds an additive, extensible sector profile for every canonical country.
 * It consumes the unified registry and never rewrites source datasets.
 * Direct observations, legacy baselines, derived calculations and modelled
 * game values remain distinguishable throughout the output.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const INPUT = resolve(ROOT, 'country_general_data_registry_v1.json');
const SCHEMA = resolve(ROOT, 'country_sector_profile_schema_v1.json');
const OFFICIAL_INDEX_SNAPSHOT = resolve(ROOT, 'country_official_index_observations_v1.json');
const OUTPUT = resolve(ROOT, 'country_sector_profiles_v1.json');

function readJson(path) {
  if (!existsSync(path)) throw new Error('REQUIRED_INPUT_MISSING: ' + path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const round = (value, digits = 6) => finite(value) === null ? null : Number(value.toFixed(digits));
const objectFrom = (keys, values) => Object.fromEntries(keys.map((key, index) => [key, values[index] === undefined ? null : values[index]]));

const registry = readJson(INPUT);
const schema = readJson(SCHEMA);
const officialIndexSnapshot = readJson(OFFICIAL_INDEX_SNAPSHOT);
if (officialIndexSnapshot.metadata?.datasetId !== 'OMEGA_TI_CPI_2025_SNAPSHOT_V1'
  || !Array.isArray(officialIndexSnapshot.countries)) {
  throw new Error('TI_CPI_2025_SNAPSHOT_SCHEMA_UNSUPPORTED');
}
const officialIndexByIso3 = new Map(officialIndexSnapshot.countries.map((row) => [String(row.iso3 || '').toUpperCase(), row]));
const recordSchema = registry.metadata && registry.metadata.recordSchema;
if (!Array.isArray(registry.countries) || !recordSchema || recordSchema.encoding !== 'ORDERED_VALUE_ARRAYS_V1') {
  throw new Error('COUNTRY_GENERAL_REGISTRY_SCHEMA_UNSUPPORTED');
}
if (!Array.isArray(schema.sectors) || !Array.isArray(schema.derivedMetrics) || !Array.isArray(schema.calculationModels)) {
  throw new Error('COUNTRY_SECTOR_SCHEMA_INVALID');
}

const sourceStatuses = registry.metadata.provenanceEncoding.statuses || [];
const sourceIds = registry.metadata.provenanceEncoding.sourceIds || [];
const sourceNames = registry.metadata.provenanceEncoding.sourceNames || [];
const methods = registry.metadata.provenanceEncoding.methods || [];
const metricsCatalog = registry.fieldCatalogue || [];
const metricIndex = Object.fromEntries(metricsCatalog.map((field, index) => [field.key, index]));
const canonicalMetricKeys = new Set(metricsCatalog.map((field) => field.key));
const schemaMetricKeys = new Set([
  ...schema.sectors.flatMap((sector) => [...(sector.metricKeys || []), ...(sector.derivedMetricKeys || [])]),
  ...(schema.extensionMetricDefinitions || []).map((metric) => metric.key)
]);
const explicitExternalMetricKeys = new Set((schema.extensionMetricDefinitions || []).map((metric) => metric.key));
const identityIndex = Object.fromEntries(recordSchema.identityFields.map((key, index) => [key, index]));
const factIndex = Object.fromEntries(recordSchema.generalFactFields.map((key, index) => [key, index]));
const resourceIndex = Object.fromEntries(recordSchema.naturalResourceFields.map((key, index) => [key, index]));
const safetyIndex = Object.fromEntries(recordSchema.publicSafetyFields.map((key, index) => [key, index]));
const localGeographyIndex = Object.fromEntries(recordSchema.localGeographyFields.map((key, index) => [key, index]));
const dataStatusIndex = Object.fromEntries(recordSchema.dataStatusFields.map((key, index) => [key, index]));
const metricKeys = metricsCatalog.map((field) => field.key);

function decodeMetric(row, field) {
  const index = metricIndex[field.key];
  const meta = row.metricMetadata || {};
  const statusCode = meta.statusCodes?.[index] ?? -1;
  const sourceCode = meta.sourceCodes?.[index] ?? -1;
  const sourceNameCode = meta.sourceNameCodes?.[index] ?? -1;
  const methodCode = meta.methodCodes?.[index] ?? -1;
  return {
    value: finite(row.metrics?.[index]),
    unit: field.unit || null,
    year: finite(meta.years?.[index]),
    sourceId: sourceCode >= 0 ? sourceIds[sourceCode] || null : null,
    sourceName: sourceNameCode >= 0 ? sourceNames[sourceNameCode] || null : null,
    status: statusCode >= 0 ? sourceStatuses[statusCode] || 'UNRECOGNIZED_STATUS' : 'MISSING',
    method: methodCode >= 0 ? methods[methodCode] || null : null,
    indicatorCode: meta.indicatorCodes?.[index] || null,
    sourceUrl: meta.sourceUrls?.[index] || null,
    note: meta.notes?.[index] || null
  };
}

function decodeResource(row) {
  const values = row.naturalResources || [];
  return {
    coverageStatus: values[resourceIndex.coverageStatus] ?? 'UNKNOWN',
    sourceId: values[resourceIndex.sourceId] ?? null,
    mineralResourceBase: objectFrom(recordSchema.mineralResourceFields, values[resourceIndex.mineralResourceBase] || []),
    hydrocarbonResourceBase: objectFrom(recordSchema.hydrocarbonResourceFields, values[resourceIndex.hydrocarbonResourceBase] || []),
    energyResourceBase: objectFrom(recordSchema.energyResourceFields, values[resourceIndex.energyResourceBase] || []),
    administrativeResourceRegions: values[resourceIndex.administrativeResourceRegions] ?? null,
    administrativeResourceRegionCount: finite(values[resourceIndex.administrativeResourceRegionCount]),
    countryNameInResourceSource: values[resourceIndex.countryNameInResourceSource] ?? null,
    emptyListsMeaning: values[resourceIndex.emptyListsMeaning] ?? 'Unknown'
  };
}

function decodeSafety(row) {
  const values = row.publicSafety || [];
  return {
    baselinePolice: values[safetyIndex.baselinePolice] ?? null,
    observedHomicide: values[safetyIndex.observedHomicide] ?? null,
    crimeRatesPer100k: values[safetyIndex.crimeRatesPer100k] ?? null,
    crimeRateSources: values[safetyIndex.crimeRateSources] ?? null,
    estimatedAnnualIncidents: values[safetyIndex.estimatedAnnualIncidents] ?? null,
    fleetSummary: values[safetyIndex.fleetSummary] ?? null,
    countryContext: values[safetyIndex.countryContext] ?? null
  };
}

function decodeFactValues(row) {
  const values = row.generalFacts || [];
  const facts = objectFrom(recordSchema.generalFactFields, values);
  const statusFields = recordSchema.factSourceStatusFields || ['restCountries', 'worldBankMetadata'];
  facts.factsSourceStatus = objectFrom(statusFields, Array.isArray(facts.factsSourceStatus) ? facts.factsSourceStatus : []);
  return facts;
}

function observationYearMatches(observations) {
  if (!observations.length || observations.some((item) => item.year === null)) return false;
  return observations.every((item) => item.year === observations[0].year);
}

function metricByKey(profile, key) {
  return profile.metrics[key] || profile.derivedMetrics[key] || null;
}

function deriveMetric(profile, definition) {
  if (definition.operation === 'model') {
    return { value: null, unit: definition.unit || null, year: null, sourceId: 'OMEGA_PROFILE_ANALYTICS',
      sourceName: definition.title, status: 'MODEL_PENDING', method: definition.modelId || null,
      sourceUrl: null, note: definition.formula || null, inputYears: {}, missingInputs: [] };
  }
  const keyList = definition.operation === 'sum_ratio_percent' ? [...(definition.numerators || []), definition.denominator] :
    definition.operation === 'ratio_percent' ? [definition.numerator, definition.denominator] :
    definition.operation === 'multiply_percent' ? [definition.base, definition.percent] :
    definition.operation === 'negative_floor_zero' ? [definition.input] : [];
  const observations = keyList.map((key) => ({ key, observation: profile.metrics[key] }));
  const missingInputs = observations.filter((item) => !item.observation || item.observation.value === null).map((item) => item.key);
  const inputYears = Object.fromEntries(observations.map((item) => [item.key, item.observation?.year ?? null]));
  if (missingInputs.length) {
    return { value: null, unit: definition.unit || null, year: null, sourceId: 'OMEGA_PROFILE_CALCULATION',
      sourceName: definition.title, status: 'MISSING_INPUTS', method: definition.operation, sourceUrl: null,
      note: definition.formula || null, inputYears, missingInputs };
  }
  const inputs = observations.map((item) => item.observation);
  const needsSameYear = definition.requireSameYear === true;
  if (needsSameYear && !observationYearMatches(inputs)) {
    return { value: null, unit: definition.unit || null, year: null, sourceId: 'OMEGA_PROFILE_CALCULATION',
      sourceName: definition.title, status: 'NOT_COMPARABLE_YEAR_MISMATCH', method: definition.operation,
      sourceUrl: null, note: 'Required source observations do not share the same year; no calculation was made.',
      inputYears, missingInputs: [] };
  }
  let value = null;
  if (definition.operation === 'ratio_percent') {
    const numerator = profile.metrics[definition.numerator].value;
    const denominator = profile.metrics[definition.denominator].value;
    if (denominator !== 0) value = (numerator / denominator) * 100;
  } else if (definition.operation === 'sum_ratio_percent') {
    const numerator = definition.numerators.reduce((sum, key) => sum + profile.metrics[key].value, 0);
    const denominator = profile.metrics[definition.denominator].value;
    if (denominator !== 0) value = (numerator / denominator) * 100;
  } else if (definition.operation === 'multiply_percent') {
    value = profile.metrics[definition.base].value * profile.metrics[definition.percent].value / 100;
  } else if (definition.operation === 'negative_floor_zero') {
    value = Math.max(0, -profile.metrics[definition.input].value);
  }
  if (!Number.isFinite(value)) {
    return { value: null, unit: definition.unit || null, year: null, sourceId: 'OMEGA_PROFILE_CALCULATION',
      sourceName: definition.title, status: 'INVALID_DENOMINATOR_OR_RESULT', method: definition.operation,
      sourceUrl: null, note: definition.formula || null, inputYears, missingInputs: [] };
  }
  const years = inputs.map((item) => item.year).filter((year) => year !== null);
  const inputStatuses = inputs.map((item) => item.status);
  const legacyInputCount = inputStatuses.filter((status) => String(status).startsWith('LEGACY') || String(status).startsWith('LOCAL')).length;
  const year = observationYearMatches(inputs) ? inputs[0].year : (years.length ? Math.min(...years) : null);
  return {
    value: round(value), unit: definition.unit || null, year,
    sourceId: 'OMEGA_PROFILE_CALCULATION', sourceName: definition.title,
    status: needsSameYear ? 'DERIVED_SAME_YEAR_VALUES' : 'DERIVED_FROM_RECORDED_SOURCE_VALUE',
    method: definition.operation, sourceUrl: null, note: (definition.formula || '') +
      ' Inputs retained separately. Legacy/local inputs: ' + legacyInputCount + '/' + inputs.length + '.',
    inputYears, inputStatuses, missingInputs: []
  };
}

const profiles = registry.countries.map((row) => {
  const identity = objectFrom(recordSchema.identityFields, row.identity || []);
  const facts = decodeFactValues(row);
  const metrics = Object.fromEntries(metricsCatalog.map((field) => [field.key, decodeMetric(row, field)]));
  const localGeo = objectFrom(recordSchema.localGeographyFields, row.localGeography || []);
  const statuses = objectFrom(recordSchema.dataStatusFields, row.dataStatus || []);
  const profile = {
    identity: {
      iso3: identity.iso3 || null,
      iso2: identity.iso2 || null,
      numericCode: identity.numericCode || null,
      name: identity.name || null,
      officialName: facts.officialName || null,
      region: identity.continent || null,
      subregion: identity.subregion || null
    },
    profileVersion: schema.schemaVersion,
    generalFacts: facts,
    metrics,
    derivedMetrics: {},
    naturalResources: decodeResource(row),
    publicSafety: decodeSafety(row),
    localGeography: localGeo,
    sourceDataStatus: statuses,
    strategicProfile: Array.isArray(recordSchema.strategicProfileFields)
      ? objectFrom(recordSchema.strategicProfileFields, row.strategicProfile || []) : null,
    analytics: {},
    relativeSignals: { strengths: [], vulnerabilities: [], policy: 'Signals are relative peer-percentiles from currently recorded values, not official rankings. Every signal retains value, observation year, source and data-quality status.' },
    sectors: {},
    extensions: {
      customAttributes: [],
      customMetrics: [],
      customTimeSeries: [],
      schemaAdditions: []
    }
  };
  for (const definition of schema.derivedMetrics) profile.derivedMetrics[definition.key] = deriveMetric(profile, definition);
  return profile;
});

function observationFor(profile, key) {
  return metricByKey(profile, key);
}

function percentile(value, allValues) {
  const sorted = allValues.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return 50;
  let first = sorted.findIndex((item) => item === value);
  if (first < 0) return null;
  let last = first;
  while (last + 1 < sorted.length && sorted[last + 1] === value) last += 1;
  const midrank = (first + last) / 2;
  return round((midrank / (sorted.length - 1)) * 100, 2);
}

for (const model of schema.calculationModels) {
  const componentPercentiles = new Map();
  for (const input of model.inputs) {
    const values = profiles.map((profile) => finite(observationFor(profile, input.key)?.value)).filter((value) => value !== null);
    componentPercentiles.set(input.key, values);
  }
  for (const profile of profiles) {
    const available = [];
    const inputYears = {};
    const inputStatuses = {};
    for (const input of model.inputs) {
      const observation = observationFor(profile, input.key);
      const value = finite(observation?.value);
      inputYears[input.key] = observation?.year ?? null;
      inputStatuses[input.key] = observation?.status || 'MISSING';
      if (value === null) continue;
      const p = percentile(value, componentPercentiles.get(input.key) || []);
      if (p === null) continue;
      const score = input.direction === 'higher_is_weaker' ? 100 - p : p;
      available.push({ key: input.key, score, weight: input.weight, year: observation?.year ?? null, status: observation?.status || 'MISSING' });
    }
    const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
    const enough = available.length >= model.minAvailableInputs && totalWeight > 0;
    const years = available.map((item) => item.year).filter((year) => year !== null);
    const statuses = available.map((item) => item.status);
    const legacyInputCount = statuses.filter((status) => String(status).startsWith('LEGACY') || String(status).startsWith('LOCAL')).length;
    const mixedYears = years.length > 1 && (Math.max(...years) - Math.min(...years)) > 3;
    const weighted = enough ? available.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight : null;
    profile.analytics[model.id] = {
      value: enough ? round(weighted, 2) : null,
      unit: model.unit,
      status: enough ? (mixedYears ? 'COMPUTED_WITH_MIXED_OBSERVATION_YEARS' :
        (legacyInputCount ? 'COMPUTED_WITH_LEGACY_INPUTS' : 'COMPUTED_FROM_RECORDED_INPUTS')) : 'INSUFFICIENT_DATA',
      modelId: model.id,
      formula: 'Weighted mean of input-component empirical percentile ranks; weights are renormalized over available inputs. Higher is stronger except inputs marked higher_is_weaker.',
      availableInputCount: available.length,
      requiredInputCount: model.minAvailableInputs,
      coveragePct: round((available.length / model.inputs.length) * 100, 2),
      inputYears,
      inputStatuses,
      minInputYear: years.length ? Math.min(...years) : null,
      maxInputYear: years.length ? Math.max(...years) : null,
      observationYearSpread: years.length ? Math.max(...years) - Math.min(...years) : null,
      legacyOrLocalInputCount: legacyInputCount,
      inputComponents: available,
      missingInputs: model.inputs.filter((input) => !available.some((item) => item.key === input.key)).map((input) => input.key),
      comparabilityNote: mixedYears ? 'Input years differ by more than three years. Use the year diagnostics before comparing this score.' :
        'Read the source-year diagnostics. A score is a project analytical proxy, not an official rating.',
      note: model.note
    };
  }
}

for (const definition of schema.derivedMetrics.filter((item) => item.operation === 'model')) {
  for (const profile of profiles) {
    const analytics = profile.analytics[definition.modelId];
    profile.derivedMetrics[definition.key] = analytics ? {
      ...analytics,
      sourceId: 'OMEGA_PROFILE_ANALYTICS',
      sourceName: definition.title,
      note: definition.formula + ' ' + (analytics.note || '')
    } : {
      value: null, unit: definition.unit || null, year: null, sourceId: 'OMEGA_PROFILE_ANALYTICS',
      sourceName: definition.title, status: 'MODEL_NOT_AVAILABLE', modelId: definition.modelId,
      note: definition.formula || null
    };
  }
}

for (const signal of schema.signalMetrics) {
  const values = profiles.map((profile) => finite(observationFor(profile, signal.metricKey)?.value)).filter((value) => value !== null);
  if (values.length < 5) continue;
  for (const profile of profiles) {
    const observation = observationFor(profile, signal.metricKey);
    const value = finite(observation?.value);
    if (value === null) continue;
    const p = percentile(value, values);
    if (p === null) continue;
    const stronger = signal.preference === 'higher_is_stronger' ? p >= 80 : p <= 20;
    const weaker = signal.preference === 'higher_is_stronger' ? p <= 20 : p >= 80;
    const item = {
      sectorId: signal.sectorId, metricKey: signal.metricKey, title: signal.title,
      value, unit: observation.unit || null, year: observation.year ?? null,
      sourceId: observation.sourceId || null, sourceName: observation.sourceName || null,
      sourceUrl: observation.sourceUrl || null, evidenceStatus: observation.status || 'UNKNOWN',
      peerPercentile: p, model: 'EMPIRICAL_PEER_PERCENTILE_V1',
      caveat: 'Relative signal only. Values can have different observation years and legacy source quality; this is not a causal conclusion.'
    };
    if (stronger) profile.relativeSignals.strengths.push(item);
    else if (weaker) profile.relativeSignals.vulnerabilities.push(item);
  }
}

for (const profile of profiles) {
  for (const sector of schema.sectors) {
    const indicators = {};
    for (const key of sector.metricKeys || []) indicators[key] = profile.metrics[key] || null;
    for (const key of sector.derivedMetricKeys || []) indicators[key] = profile.derivedMetrics[key] || null;
    const facts = {};
    for (const key of sector.factKeys || []) facts[key] = profile.generalFacts[key] ?? null;
    const sourceGroup = sector.sourceGroup === 'naturalResources' ? profile.naturalResources :
      sector.sourceGroup === 'publicSafety' ? profile.publicSafety : null;
    if (sector.sourceGroup === 'generalFacts') Object.assign(facts, profile.generalFacts);
    const nonNullMetricCount = Object.values(indicators).filter((item) => item && finite(item.value) !== null).length;
    const expectedMetricCount = Object.keys(indicators).length;
    const hasSourceGroupData = sourceGroup && Object.values(sourceGroup).some((value) => value !== null && value !== undefined);
    const hasFacts = Object.values(facts).some((value) => value !== null && value !== undefined);
    let status = 'NO_DATA';
    if (sector.sourceGroup === 'generalFacts') {
      const coreFacts = Object.entries(facts).filter(([key]) => key !== 'factsSourceStatus');
      const presentFacts = coreFacts.filter(([, value]) => value !== null && value !== undefined).length;
      status = presentFacts === 0 ? 'NO_DATA' : (presentFacts === coreFacts.length ? 'AVAILABLE' : 'PARTIAL');
    } else if (nonNullMetricCount > 0 || hasSourceGroupData || hasFacts) {
      status = nonNullMetricCount === expectedMetricCount && expectedMetricCount > 0 ? 'AVAILABLE' : 'PARTIAL';
    }
    profile.sectors[sector.id] = {
      id: sector.id,
      title: sector.title,
      status,
      description: sector.description || null,
      indicators,
      facts,
      sourceGroup: sourceGroup || null,
      analytics: Object.fromEntries((sector.derivedMetricKeys || []).filter((key) => profile.analytics[key] || profile.derivedMetrics[key]?.modelId)
        .map((key) => [key, profile.analytics[key] || profile.derivedMetrics[key]])),
      extensionSlots: (sector.extensionSlots || []).map((slot) => ({
        key: slot.key, type: slot.type, description: slot.description,
        status: slot.emptyStatus || 'NOT_SOURCED', value: null,
        readiness: 'SCHEMA_READY_DATA_NOT_IMPORTED'
      }))
    };
  }
  for (const slot of schema.unavailableModelSlots || []) {
    profile.analytics[slot.id] = {
      value: null, unit: null, status: slot.status, modelId: slot.id,
      missingInputs: slot.missingInputs || [], note: slot.note || null,
      sectorId: slot.sectorId, title: slot.title
    };
  }
}

const iso3 = profiles.map((profile) => profile.identity.iso3);
const duplicateIds = iso3.filter((code, index) => iso3.indexOf(code) !== index);
if (profiles.length !== registry.metadata.countryAndTerritoryCount || duplicateIds.length) {
  throw new Error('PROFILE_ROSTER_INTEGRITY_FAILED: rows=' + profiles.length + ', expected=' +
    registry.metadata.countryAndTerritoryCount + ', duplicateIso3=' + duplicateIds.join(','));
}
const sectorCoverage = Object.fromEntries(schema.sectors.map((sector) => [sector.id, {
  total: profiles.length,
  available: profiles.filter((profile) => profile.sectors[sector.id].status === 'AVAILABLE').length,
  partial: profiles.filter((profile) => profile.sectors[sector.id].status === 'PARTIAL').length,
  noData: profiles.filter((profile) => profile.sectors[sector.id].status === 'NO_DATA').length
}]));
const metricCoverage = Object.fromEntries(metricsCatalog.map((field) => [field.key, {
  total: profiles.length,
  nonNull: profiles.filter((profile) => finite(profile.metrics[field.key]?.value) !== null).length,
  missing: profiles.filter((profile) => finite(profile.metrics[field.key]?.value) === null).length
}]));
const metadata = {
  schemaVersion: schema.schemaVersion,
  datasetId: 'OMEGA_COUNTRY_SECTOR_PROFILES_V1',
  title: 'OMEGA Country Sector Profiles',
  generatedAt: new Date().toISOString(),
  generatedFrom: INPUT,
  sourceRegistryGeneratedAt: registry.metadata.generatedAt || null,
  countryAndTerritoryCount: profiles.length,
  uniqueIso3Count: new Set(iso3).size,
  duplicateIdentityCount: duplicateIds.length,
  sourceRegistryBaselineYear: registry.metadata.baselineYear ?? null,
  sourceRegistryExternalRefresh: registry.metadata.externalRefresh || null,
  dataQualityPolicy: schema.dataPolicy,
  profileSections: schema.sectors.map((sector) => ({ id: sector.id, title: sector.title })),
  calculationModels: schema.calculationModels.map((model) => ({
    id: model.id, title: model.title, minAvailableInputs: model.minAvailableInputs,
    inputs: model.inputs, note: model.note
  })),
  unavailableModelSlots: schema.unavailableModelSlots,
  extensionMetricDefinitions: schema.extensionMetricDefinitions || [],
  extensionContract: schema.extensionContract,
  sectorCoverage,
  metricCoverage,
  noSourceRecordsDeleted: true,
  unknownValuesConvertedToZero: false,
  storageModel: 'COMPACT_REFERENCES_TO_CANONICAL_COUNTRY_REGISTRY',
  externalIndexSources: [{
    datasetId: officialIndexSnapshot.metadata.datasetId,
    publisher: officialIndexSnapshot.metadata.publisher,
    publisherUrl: officialIndexSnapshot.metadata.publisherUrl,
    sourceUrl: officialIndexSnapshot.metadata.sourceUrl,
    observationYear: officialIndexSnapshot.metadata.observationYear,
    observationCount: officialIndexSnapshot.countries.length,
    missingObservationsRemainNull: true
  }],
  userInterfaceBinding: 'DATA_LAYER_ONLY_UI_MAPPING_NOT_YET_CONFIGURED'
};
function compactRelativeSignal(signal) {
  return {
    sectorId: signal.sectorId || null,
    metricKey: signal.metricKey || null,
    title: signal.title || null,
    value: finite(signal.value),
    unit: signal.unit || null,
    year: finite(signal.year),
    sourceId: signal.sourceId || null,
    sourceName: signal.sourceName || null,
    evidenceStatus: signal.evidenceStatus || 'UNKNOWN',
    peerPercentile: finite(signal.peerPercentile),
    model: signal.model || null,
    caveat: signal.caveat || null
  };
}
function compactDerivedMetric(metric, options = {}) {
  if (!metric || typeof metric !== 'object') return null;
  const compact = {
    value: finite(metric.value), unit: metric.unit || null, year: finite(metric.year),
    sourceId: metric.sourceId || null, sourceName: metric.sourceName || null,
    status: metric.status || 'UNKNOWN', method: metric.method || null,
    sourceUrl: metric.sourceUrl || null, note: metric.note || null
  };
  if (metric.modelId) {
    compact.modelId = metric.modelId;
    if (options.includeModelEvidence !== false) Object.assign(compact, {
      formula: metric.formula || null,
      availableInputCount: finite(metric.availableInputCount),
      requiredInputCount: finite(metric.requiredInputCount),
      coveragePct: finite(metric.coveragePct),
      inputYears: metric.inputYears || {}, inputStatuses: metric.inputStatuses || {},
      minInputYear: finite(metric.minInputYear), maxInputYear: finite(metric.maxInputYear),
      observationYearSpread: finite(metric.observationYearSpread),
      legacyOrLocalInputCount: finite(metric.legacyOrLocalInputCount),
      missingInputs: Array.isArray(metric.missingInputs) ? metric.missingInputs : [],
      comparabilityNote: metric.comparabilityNote || null
    });
  }
  else if (metric.inputYears) Object.assign(compact, {
    formula: metric.formula || null, inputYears: metric.inputYears,
    missingInputs: Array.isArray(metric.missingInputs) ? metric.missingInputs : []
  });
  return compact;
}
function externalMetricValue(key, iso3) {
  const definition = (schema.extensionMetricDefinitions || []).find((item) => item.key === key);
  if (key === 'corruptionPerceptionIndex' || key === 'corruptionPerceptionRank') {
    const observation = officialIndexByIso3.get(iso3);
    const field = key === 'corruptionPerceptionIndex' ? 'score' : 'rank';
    const value = observation ? finite(observation[field]) : null;
    return {
      key, value,
      unit: key === 'corruptionPerceptionIndex' ? 'score (0-100)' : 'publisher rank (1-182; lower is better)',
      year: observation ? finite(observation.year) : null,
      sourceId: officialIndexSnapshot.metadata.datasetId,
      sourceName: officialIndexSnapshot.metadata.publisher,
      method: officialIndexSnapshot.metadata.sourceType,
      sourceUrl: officialIndexSnapshot.metadata.publisherUrl,
      mirrorUrl: officialIndexSnapshot.metadata.sourceUrl,
      status: value === null ? 'NO_SOURCE_OBSERVATION' : 'SOURCE_OBSERVATION',
      note: key === 'corruptionPerceptionIndex'
        ? officialIndexSnapshot.metadata.scoreScale
        : officialIndexSnapshot.metadata.rankSemantics
    };
  }
  if (key === 'humanDevelopmentIndex') {
    return {
      key, value: null, unit: 'index (0-1)', year: null,
      sourceId: null, sourceName: null, method: null, sourceUrl: null,
      status: 'NOT_IMPORTED',
      note: 'The schema defines an expected HDI observation, but no validated offline HDI values are present in the canonical or external snapshot datasets. No value is inferred.'
    };
  }
  return {
    key, value: null, unit: definition?.unit || null, year: null,
    sourceId: null, sourceName: null, method: null, sourceUrl: null,
    status: definition?.initialStatus || 'NOT_IMPORTED',
    note: definition?.description || 'Declared sector metric is not present in the canonical registry or a validated external observation snapshot.'
  };
}
const compactProfiles = profiles.map((profile) => ({
  identity: profile.identity,
  profileVersion: profile.profileVersion,
  externalMetrics: Object.fromEntries([...schemaMetricKeys]
    .filter((key) => explicitExternalMetricKeys.has(key)
      || (!canonicalMetricKeys.has(key) && !Object.hasOwn(profile.derivedMetrics, key)))
    .map((key) => [key, externalMetricValue(key, profile.identity.iso3)])),
  sourceRegistryRef: {
    dataset: 'country_general_data_registry_v1.json',
    identityKey: 'iso3',
    identityValue: profile.identity.iso3
  },
  derivedMetrics: Object.fromEntries(Object.entries(profile.derivedMetrics)
    .map(([key, metric]) => [key, compactDerivedMetric(metric, { includeModelEvidence: false })])),
  analytics: Object.fromEntries(Object.entries(profile.analytics || {})
    .map(([key, metric]) => [key, compactDerivedMetric(metric)])),
  relativeSignals: {
    policy: profile.relativeSignals?.policy || null,
    strengths: (profile.relativeSignals?.strengths || []).map(compactRelativeSignal),
    vulnerabilities: (profile.relativeSignals?.vulnerabilities || []).map(compactRelativeSignal)
  },
  sectors: Object.fromEntries(Object.entries(profile.sectors).map(([sectorId, sector]) => {
    const derivedKeys = new Set(Object.keys(profile.derivedMetrics));
    return [sectorId, {
      status: sector.status,
      indicators: Object.fromEntries(Object.keys(sector.indicators || {}).map((key) => [key, {
        refType: explicitExternalMetricKeys.has(key) ? 'EXTERNAL_METRIC'
          : derivedKeys.has(key) ? 'DERIVED_METRIC'
          : canonicalMetricKeys.has(key) ? 'METRIC' : 'EXTERNAL_METRIC',
        key
      }])),
      facts: Object.fromEntries(Object.keys(sector.facts || {}).map((key) => [key, { refType: 'GENERAL_FACT', key }])),
      sourceGroup: sector.sourceGroup ? { refType: 'SOURCE_GROUP', key: sectorId === 'naturalResources' ? 'naturalResources' :
        (sectorId === 'publicSafety' ? 'publicSafety' : (schema.sectors.find((entry) => entry.id === sectorId)?.sourceGroup || null)) } : null,
      analytics: Object.fromEntries(Object.keys(sector.analytics || {}).map((key) => [key, { refType: 'ANALYTICS', key }])),
      // The schema file is the sole authority for sector labels and extension-slot definitions.
    }];
  })),
  extensions: profile.extensions
}));
const output = {
  metadata,
  schemaReference: 'country_sector_profile_schema_v1.json',
  sourceRegistry: {
    path: 'country_general_data_registry_v1.json',
    identityKey: 'iso3',
    resolution: 'Join profile sourceRegistryRef.identityValue to canonical registry record identity.iso3; never invent missing values.'
  },
  sourcePolicy: 'Compact source references avoid duplicating canonical facts and observations. Derived metrics, analytical scores, and source-year evidence retain explicit status and missing-value semantics.',
  countries: compactProfiles
};
writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({
  output: 'country_sector_profiles_v1.json',
  countryCount: profiles.length,
  uniqueIso3Count: new Set(iso3).size,
  sectorCount: schema.sectors.length,
  metricCount: metricsCatalog.length,
  calculationModelCount: schema.calculationModels.length,
  missingSourceMeaning: schema.dataPolicy.missingValue,
  deletedSourceRecords: false
}, null, 2));
