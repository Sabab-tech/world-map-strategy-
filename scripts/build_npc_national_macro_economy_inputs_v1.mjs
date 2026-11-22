import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'country_general_data_registry_v1.json');
const MANIFEST_PATH = path.join(ROOT, 'minister_country_roster_manifest_v1.json');
const RULES_PATH = path.join(ROOT, 'npc_national_macro_economy_rules_v1.json');
const OUTPUT_PATH = path.join(ROOT, 'npc_national_macro_economy_inputs_v1.json');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const decode = (items, code) => Number.isInteger(code) && code >= 0 ? (items?.[code] ?? null) : null;

function build() {
  const registry = readJson(REGISTRY_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const rules = readJson(RULES_PATH);
  const countries = manifest?.countries;
  const rosterIds = Object.keys(countries || {}).map(value => String(value).trim().toUpperCase()).filter(Boolean).sort();
  if (!registry?.metadata?.recordSchema || !Array.isArray(registry.countries) ||
      !Array.isArray(rules?.baseline?.metrics) || !rosterIds.length ||
      rosterIds.length !== Number(manifest?.counts?.countryEntities) ||
      new Set(rosterIds).size !== rosterIds.length) {
    throw new Error('NPC_MACRO_INPUT_BUILD_SOURCE_SCHEMA_INVALID');
  }

  const schema = registry.metadata.recordSchema;
  const identityFields = schema.identityFields || [];
  const metricFields = schema.metricFields || [];
  const identityIndex = identityFields.indexOf('iso3');
  if (identityIndex < 0) throw new Error('NPC_MACRO_INPUT_REGISTRY_ISO3_FIELD_MISSING');
  const registryByIso3 = new Map();
  for (const row of registry.countries) {
    const iso3 = String(row?.identity?.[identityIndex] || '').trim().toUpperCase();
    if (!iso3 || registryByIso3.has(iso3)) throw new Error('NPC_MACRO_INPUT_REGISTRY_IDENTITY_INVALID:' + iso3);
    registryByIso3.set(iso3, row);
  }

  const provenance = registry.metadata.provenanceEncoding || {};
  const definitions = rules.baseline.metrics.map(rule => {
    const id = String(rule?.id || '').trim();
    const registryField = String(rule?.generalDataMetric || '').trim();
    const index = metricFields.indexOf(registryField);
    if (!id || !registryField || index < 0) throw new Error('NPC_MACRO_INPUT_METRIC_MAPPING_INVALID:' + id);
    return {id, registryField, index};
  });
  const metricIds = definitions.map(row => row.id);
  if (new Set(metricIds).size !== metricIds.length) throw new Error('NPC_MACRO_INPUT_METRIC_ID_DUPLICATE');

  const outputCountries = {};
  const coverage = {};
  for (const definition of definitions) {
    coverage[definition.id] = {
      availableCountryCount: 0,
      missingCountryCount: 0,
      latestObservationYear: null
    };
  }

  for (const iso3 of rosterIds) {
    const row = registryByIso3.get(iso3);
    if (!row) throw new Error('NPC_MACRO_INPUT_COUNTRY_MISSING_FROM_SOURCE_REGISTRY:' + iso3);
    const inputMetrics = {};
    for (const definition of definitions) {
      const index = definition.index;
      const meta = row.metricMetadata || {};
      const value = finite(row.metrics?.[index]);
      const year = finite(meta.years?.[index]);
      const status = decode(provenance.statuses, meta.statusCodes?.[index]) || (value === null ? 'MISSING' : 'SOURCE_STATUS_UNKNOWN');
      inputMetrics[definition.id] = {
        value,
        year,
        sourceStatus: status,
        sourceId: decode(provenance.sourceIds, meta.sourceCodes?.[index]),
        sourceName: decode(provenance.sourceNames, meta.sourceNameCodes?.[index]),
        method: decode(provenance.methods, meta.methodCodes?.[index]),
        indicatorCode: meta.indicatorCodes?.[index] || null,
        sourceUrl: meta.sourceUrls?.[index] || null,
        confidence: finite(meta.sourceConfidence?.[index]),
        dataGap: meta.dataGaps?.[index] || null,
        note: meta.notes?.[index] || null
      };
      const summary = coverage[definition.id];
      if (value === null) summary.missingCountryCount += 1;
      else {
        summary.availableCountryCount += 1;
        if (year !== null && (summary.latestObservationYear === null || year > summary.latestObservationYear)) {
          summary.latestObservationYear = year;
        }
      }
    }
    outputCountries[iso3] = {metrics: inputMetrics};
  }

  if (Object.keys(outputCountries).length !== 197) {
    throw new Error('NPC_MACRO_INPUT_CORE_ROSTER_MUST_BE_197');
  }
  return {
    metadata: {
      datasetId: 'OMEGA_NPC_NATIONAL_MACRO_ECONOMY_INPUTS_V1',
      schemaVersion: '1.0.0',
      sourceMode: 'COUNTRY_GENERAL_DATA_REGISTRY_SNAPSHOT',
      sourceRegistry: 'country_general_data_registry_v1.json',
      sourceRegistryGeneratedAt: registry.metadata.generatedAt || null,
      generatedAt: registry.metadata.generatedAt || null,
      sourceRegistrySchemaVersion: registry.metadata.schemaVersion || null,
      countryCount: rosterIds.length,
      metricIds,
      missingValuePolicy: 'NULL_REMAINS_UNOBSERVED'
    },
    coverage,
    countries: outputCountries
  };
}

const expected = JSON.stringify(build(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!existsSync(OUTPUT_PATH) || readFileSync(OUTPUT_PATH, 'utf8') !== expected) {
    throw new Error('NPC_MACRO_ECONOMY_INPUTS_STALE: regenerate with scripts/build_npc_national_macro_economy_inputs_v1.mjs');
  }
  console.log('NPC MACRO ECONOMY INPUTS CHECK PASSED');
} else {
  writeFileSync(OUTPUT_PATH, expected, 'utf8');
  console.log('Generated npc_national_macro_economy_inputs_v1.json; countries=197; metrics=' + build().metadata.metricIds.length);
}
