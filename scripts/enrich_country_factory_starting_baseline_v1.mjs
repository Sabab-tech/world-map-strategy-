#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'country_factory_starting_baseline_v1.json');
const REGISTRY_PATH = path.join(ROOT, 'country_general_data_registry_v1.json');
const METRIC_KEYS = [
  'agricultureValueAddedPctGdp',
  'industryValueAddedPctGdp',
  'servicesValueAddedPctGdp',
  'manufacturingValueAddedPctGdp',
  'agricultureEmploymentPct'
];

function finiteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    ? Number(value) : null;
}
function decodeMetric(country, key, index, registryMetadata) {
  const values = Array.isArray(country.metrics) ? country.metrics : [];
  const meta = country.metricMetadata || {};
  const value = finiteNumber(values[index]);
  const years = Array.isArray(meta.years) ? meta.years : [];
  const statusCodes = Array.isArray(meta.statusCodes) ? meta.statusCodes : [];
  const sourceCodes = Array.isArray(meta.sourceCodes) ? meta.sourceCodes : [];
  const sourceNameCodes = Array.isArray(meta.sourceNameCodes) ? meta.sourceNameCodes : [];
  const indicatorCodes = Array.isArray(meta.indicatorCodes) ? meta.indicatorCodes : [];
  const sourceUrls = Array.isArray(meta.sourceUrls) ? meta.sourceUrls : [];
  const provenance = registryMetadata.provenanceEncoding || {};
  const statusIndex = Number(statusCodes[index]);
  const sourceIndex = Number(sourceCodes[index]);
  const sourceNameIndex = Number(sourceNameCodes[index]);
  const year = finiteNumber(years[index]);
  return {
    value,
    year: Number.isInteger(year) ? year : null,
    status: Number.isInteger(statusIndex) && statusIndex >= 0
      ? provenance.statuses?.[statusIndex] || 'UNDECODED_SOURCE_STATUS'
      : value === null ? 'MISSING' : 'UNSPECIFIED',
    sourceId: Number.isInteger(sourceIndex) && sourceIndex >= 0
      ? provenance.sourceIds?.[sourceIndex] || null : null,
    sourceName: Number.isInteger(sourceNameIndex) && sourceNameIndex >= 0
      ? provenance.sourceNames?.[sourceNameIndex] || null : null,
    indicatorCode: indicatorCodes[index] || null,
    sourceUrl: sourceUrls[index] || null,
    unit: key === 'agricultureEmploymentPct' ? '% of employment' : '% of GDP'
  };
}
function sameYearSectorProfile(values) {
  const sectorKeys = [
    ['AGRICULTURE', 'agricultureValueAddedPctGdp'],
    ['INDUSTRY', 'industryValueAddedPctGdp'],
    ['SERVICES', 'servicesValueAddedPctGdp']
  ];
  const available = sectorKeys.map(([sector, key]) => ({ sector, metric: values[key] }))
    .filter(row => row.metric.value !== null && row.metric.year !== null);
  const years = [...new Set(available.map(row => row.metric.year))];
  if (available.length < 2 || years.length !== 1) {
    return {
      status: years.length > 1 ? 'MIXED_OBSERVATION_YEARS' : 'INSUFFICIENT_COMPARABLE_DATA',
      comparisonYear: null,
      dominantSector: null,
      availableSectorCount: available.length
    };
  }
  // A complete same-year set of zero sector shares is not a usable economic structure.
  // Preserve the raw observations in valueAddedShares, but do not turn stale/all-zero
  // source data into a fictitious "MIXED" economy or a dominant-sector classification.
  if (available.every(row => Number(row.metric.value) === 0)) {
    return {
      status: 'INSUFFICIENT_COMPARABLE_DATA',
      comparisonYear: null,
      dominantSector: null,
      availableSectorCount: 0
    };
  }
  available.sort((a, b) => b.metric.value - a.metric.value);
  const tied = available.length > 1 && Math.abs(available[0].metric.value - available[1].metric.value) < 0.05;
  return {
    status: available.length === 3 ? 'SAME_YEAR_COMPARABLE' : 'PARTIAL_SAME_YEAR_COMPARABLE',
    comparisonYear: years[0],
    dominantSector: tied ? 'MIXED' : available[0].sector,
    availableSectorCount: available.length
  };
}
function deriveBroadArchetype(context) {
  const dominant = context.dominantSector;
  const manufacturing = context.valueAddedShares.manufacturingValueAddedPctGdp;
  const year = context.comparisonYear;
  const manufacturingComparable = manufacturing.value !== null && manufacturing.year !== null &&
    year !== null && Math.abs(manufacturing.year - year) <= 3;
  const meaningfulManufacturing = manufacturingComparable && manufacturing.value >= 15;
  if (dominant === 'AGRICULTURE') return 'Agriculture-led economy';
  if (dominant === 'INDUSTRY') {
    return meaningfulManufacturing
      ? 'Industry-led economy with a manufacturing base'
      : 'Industry-led resource and extractive economy';
  }
  if (dominant === 'SERVICES') {
    return meaningfulManufacturing
      ? 'Services-led economy with a manufacturing base'
      : 'Services-led mixed economy';
  }
  return 'Insufficient comparable sector data';
}
function deriveSpecializedArchetype(specializations) {
  const types = new Set(Array.isArray(specializations) ? specializations : []);
  const has = (...ids) => ids.some(id => types.has(id));
  if (has('AEROSPACE_EQUIPMENT_PLANT') && has('DEFENSE_EQUIPMENT_FACTORY')) return 'Aerospace and defence manufacturing';
  if (has('ELECTRONICS_SEMICONDUCTOR_FAB') && has('SHIP_RAIL_EQUIPMENT_YARD') &&
      has('INDUSTRIAL_MACHINERY_MACHINE_TOOLS') && has('PHARMA_MEDICAL_SUPPLIES_PLANT')) {
    return 'Advanced manufacturing and industrial logistics';
  }
  if (has('ELECTRONICS_SEMICONDUCTOR_FAB') && has('DEFENSE_EQUIPMENT_FACTORY')) return 'Advanced technology and defence';
  if (has('ELECTRONICS_SEMICONDUCTOR_FAB') && has('PETROCHEMICAL_POLYMER_PLANT')) return 'Electronics and petrochemicals';
  if (has('ELECTRONICS_SEMICONDUCTOR_FAB') && has('PHARMA_MEDICAL_SUPPLIES_PLANT')) return 'Pharmaceuticals and electronics';
  if (has('ELECTRONICS_SEMICONDUCTOR_FAB')) return 'Electronics and semiconductor manufacturing';
  if (has('INDUSTRIAL_MACHINERY_MACHINE_TOOLS') && has('PHARMA_MEDICAL_SUPPLIES_PLANT')) return 'Pharmaceuticals and precision manufacturing';
  if (has('INDUSTRIAL_MACHINERY_MACHINE_TOOLS') && has('VEHICLE_TRUCK_BUS_ASSEMBLY')) return 'Automotive and industrial machinery';
  if (has('INDUSTRIAL_MACHINERY_MACHINE_TOOLS') && has('GRID_EQUIPMENT_FACTORY')) return 'Advanced industrial manufacturing';
  if (has('PHARMA_MEDICAL_SUPPLIES_PLANT')) return 'Pharmaceuticals and medical supplies';
  if (has('NON_FERROUS_METAL_SMELTER') && has('TEXTILE_GARMENT_MILL') && has('FOOD_PROCESSING_COLD_CHAIN')) return 'Aluminium, textiles and food processing';
  if (has('NON_FERROUS_METAL_SMELTER') && has('FOOD_PROCESSING_COLD_CHAIN')) return 'Mineral beneficiation and food processing';
  if (has('PETROCHEMICAL_POLYMER_PLANT') && has('FERTILIZER_CHEMICAL_PLANT')) return 'Petrochemicals and fertilizer manufacturing';
  if (has('NON_FERROUS_METAL_SMELTER')) return 'Non-ferrous metals';
  if (has('PETROCHEMICAL_POLYMER_PLANT') && has('FOOD_PROCESSING_COLD_CHAIN')) return 'Energy and food processing';
  if (has('PETROCHEMICAL_POLYMER_PLANT')) return 'Energy and petrochemicals';
  if (has('TEXTILE_GARMENT_MILL') && has('FOOD_PROCESSING_COLD_CHAIN')) return 'Textiles and food processing';
  if (has('TEXTILE_GARMENT_MILL')) return 'Textiles and garments';
  if (has('FERTILIZER_CHEMICAL_PLANT') && has('FOOD_PROCESSING_COLD_CHAIN')) return 'Fertilizer and food processing';
  if (has('FOOD_PROCESSING_COLD_CHAIN')) return 'Food processing';
  if (has('INDUSTRIAL_MACHINERY_MACHINE_TOOLS')) return 'Industrial machinery and capital goods';
  if (has('PAPER_PACKAGING_MILL')) return 'Paper and packaging';
  if (has('VEHICLE_TRUCK_BUS_ASSEMBLY')) return 'Automotive manufacturing';
  return null;
}

export function enrichCountryFactoryStartingBaseline(baseline, registry) {
  if (!baseline || !registry || !Array.isArray(registry.countries)) {
    throw new Error('FACTORY_SECTOR_ALIGNMENT_INPUT_INVALID');
  }
  if (!Array.isArray(baseline.factoryTypes) || !baseline.countries || typeof baseline.countries !== 'object') {
    throw new Error('FACTORY_STARTING_BASELINE_SCHEMA_INVALID');
  }
  const fields = registry.metadata?.recordSchema?.metricFields;
  if (!Array.isArray(fields)) throw new Error('COUNTRY_GENERAL_REGISTRY_METRIC_SCHEMA_MISSING');
  const indices = Object.fromEntries(METRIC_KEYS.map(key => {
    const index = fields.indexOf(key);
    if (index < 0) throw new Error('COUNTRY_GENERAL_REGISTRY_METRIC_MISSING:' + key);
    return [key, index];
  }));
  const byCountry = new Map();
  registry.countries.forEach(country => {
    const iso3 = country?.identity?.[2];
    if (iso3) {
      if (byCountry.has(iso3)) throw new Error('COUNTRY_GENERAL_REGISTRY_DUPLICATE_ISO3:' + iso3);
      byCountry.set(iso3, country);
    }
  });
  const countryIds = Object.keys(baseline.countries).sort();
  if (countryIds.length !== Number(baseline.countryCount)) throw new Error('FACTORY_BASELINE_COUNTRY_COUNT_MISMATCH');
  const typeIds = baseline.factoryTypes.map(row => row.id).sort();
  countryIds.forEach(countryId => {
    const row = baseline.countries[countryId];
    if (!row || row.countryId !== countryId) throw new Error('FACTORY_BASELINE_COUNTRY_ID_MISMATCH:' + countryId);
    if (Object.keys(row.factoryCounts || {}).sort().join('|') !== typeIds.join('|')) {
      throw new Error('FACTORY_BASELINE_TYPE_ROSTER_MISMATCH:' + countryId);
    }
    const registryCountry = byCountry.get(countryId);
    if (!registryCountry) throw new Error('COUNTRY_GENERAL_REGISTRY_COUNTRY_MISSING:' + countryId);
    const valueAddedShares = Object.fromEntries(METRIC_KEYS.map(key => [
      key, decodeMetric(registryCountry, key, indices[key], registry.metadata || {})
    ]));
    const comparison = sameYearSectorProfile(valueAddedShares);
    const manufacturing = valueAddedShares.manufacturingValueAddedPctGdp;
    const manufacturingYearComparable = manufacturing.value !== null && manufacturing.year !== null &&
      comparison.comparisonYear !== null && Math.abs(manufacturing.year - comparison.comparisonYear) <= 3;
    const manufacturingBand = !manufacturingYearComparable ? 'NOT_COMPARABLE' :
      manufacturing.value >= 15 ? 'HIGH' : manufacturing.value >= 8 ? 'MODERATE' : 'LOW';
    const context = {
      schemaVersion: 'OMEGA_COUNTRY_ECONOMIC_SECTOR_CONTEXT_V1',
      sourceDataset: 'country_general_data_registry_v1.json',
      comparisonStatus: comparison.status,
      comparisonYear: comparison.comparisonYear,
      dominantSector: comparison.dominantSector,
      availableSectorCount: comparison.availableSectorCount,
      valueAddedShares,
      manufacturingBand,
      manufacturingBandModel: 'OMEGA_MACRO_MANUFACTURING_BAND_V1',
      interpretation: 'Manufacturing value added is a component of industry value added; do not add it to industry. Broad value-added shares do not identify individual factory types.',
      missingPolicy: 'Null means unavailable or not comparable, never zero.'
    };
    row.economicSectorContext = context;
    const hasSpecificSpecialization = Array.isArray(row.specializations) && row.specializations.length > 0;
    row.specializationEvidenceStatus = hasSpecificSpecialization
      ? 'GAME_MODELLED_SPECIALIZATION_SET'
      : 'NO_SUBSECTOR_SPECIALIZATION_EVIDENCE';
    if (hasSpecificSpecialization) {
      const canRefineGenericLabel = row.industryArchetype === 'Resource processing base' ||
        row.industryArchetypeBasis === 'EXPLICIT_GAME_SPECIALIZATION_SET_V1';
      const refinedArchetype = canRefineGenericLabel ? deriveSpecializedArchetype(row.specializations) : null;
      if (refinedArchetype) {
        row.industryArchetype = refinedArchetype;
        row.industryArchetypeBasis = 'EXPLICIT_GAME_SPECIALIZATION_SET_V1';
      } else {
        row.industryArchetypeBasis = 'EXISTING_GAME_SPECIALIZATION_PROFILE_V1';
      }
      row.industryArchetypeObservationYear = comparison.comparisonYear;
    } else {
      row.industryArchetype = deriveBroadArchetype(context);
      row.industryArchetypeBasis = 'WORLD_BANK_VALUE_ADDED_MIX_V1';
      row.industryArchetypeObservationYear = comparison.comparisonYear;
    }
  });
  baseline.sectorAlignment = {
    schemaVersion: 'OMEGA_FACTORY_SECTOR_ALIGNMENT_V1',
    sourceDataset: 'country_general_data_registry_v1.json',
    sourceAuthority: 'WORLD_BANK_WDI',
    coreCountryCount: countryIds.length,
    metricKeys: METRIC_KEYS,
    comparisonRule: 'Compare agriculture, industry and services value-added shares only when at least two numeric observations share the exact same observation year; an all-zero sector set is non-comparable and its raw observations remain preserved.',
    manufacturingRule: 'Manufacturing value added is a component of industry; its band is compared only when the observation year is within three years of the broad-sector comparison year.',
    archetypeRule: 'Specific factory-type specializations are preserved. Generic resource-processing labels are refined only from existing explicit game specialization IDs. Countries without a mapped sub-sector specialization receive a cautious broad macro-sector archetype, not an invented factory-type claim.',
    simulationRule: 'This context informs the game-scaled starting profile; it is not a real-world factory census or an official industry classification.',
    missingRule: 'Unavailable or non-comparable observations remain null; they are never converted to zero.',
    bands: { manufacturingHighPctGdp: 15, manufacturingModeratePctGdp: 8, sameYearToleranceYears: 0, manufacturingComparisonWindowYears: 3 }
  };
  return baseline;
}

function main() {
  const check = process.argv.includes('--check');
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const enriched = enrichCountryFactoryStartingBaseline(baseline, registry);
  const expected = JSON.stringify(enriched, null, 2) + '\n';
  if (check) {
    const actual = fs.readFileSync(BASELINE_PATH, 'utf8');
    if (actual !== expected) {
      console.error('Country factory baseline sector context is stale. Run: node scripts/enrich_country_factory_starting_baseline_v1.mjs');
      process.exitCode = 1;
      return;
    }
    console.log('Country factory sector context is current for ' + Object.keys(enriched.countries).length + ' countries.');
    return;
  }
  fs.writeFileSync(BASELINE_PATH, expected);
  console.log('Updated country factory sector context for ' + Object.keys(enriched.countries).length + ' countries.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
