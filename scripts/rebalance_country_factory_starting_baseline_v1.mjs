#!/usr/bin/env node
/**
 * Deterministic, simulation-only allocation of country starting factory units.
 * It rebalances only legacy uniform profiles, preserves every country's total
 * starting-unit budget, and never treats modelled units as real factory counts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'country_factory_starting_baseline_v1.json');
const MODEL_VERSION = 'OMEGA_COUNTRY_FACTORY_ALLOCATION_V2';
const SCHEMA_VERSION = '1.0.0';

const WEIGHT_FORMULAS = Object.freeze({
  UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT: '0.45 + 0.012 * industry',
  STEEL_AND_ALLOY_WORKS: '0.25 + 0.030 * industry',
  NON_FERROUS_METAL_SMELTER: '0.20 + 0.018 * industry',
  PETROCHEMICAL_POLYMER_PLANT: '0.20 + 0.022 * industry',
  FERTILIZER_CHEMICAL_PLANT: '0.35 + 0.030 * agriculture + 0.010 * agricultureEmployment',
  INDUSTRIAL_CHEMICALS_GAS_PLANT: '0.18 + 0.012 * industry',
  CEMENT_CONCRETE_PLANT: '0.45 + 0.015 * industry',
  GLASS_CERAMICS_PLANT: '0.18 + 0.008 * industry',
  PAPER_PACKAGING_MILL: '0.35 + 0.010 * agriculture + 0.005 * services',
  FOOD_PROCESSING_COLD_CHAIN: '0.80 + 0.045 * agriculture + 0.015 * agricultureEmployment',
  TEXTILE_GARMENT_MILL: '0.40 + 0.015 * agricultureEmployment + 0.025 * manufacturing',
  INDUSTRIAL_MACHINERY_MACHINE_TOOLS: '0.15 + 0.025 * manufacturing',
  GRID_EQUIPMENT_FACTORY: '0.15 + 0.020 * manufacturing',
  ELECTRONICS_SEMICONDUCTOR_FAB: '0.12 + 0.022 * manufacturing',
  BATTERY_ENERGY_STORAGE_PLANT: '0.10 + 0.012 * manufacturing',
  VEHICLE_TRUCK_BUS_ASSEMBLY: '0.13 + 0.018 * manufacturing',
  SHIP_RAIL_EQUIPMENT_YARD: '0.08 + 0.008 * industry',
  AEROSPACE_EQUIPMENT_PLANT: '0.05 + 0.009 * manufacturing',
  PHARMA_MEDICAL_SUPPLIES_PLANT: '0.15 + 0.012 * manufacturing + 0.002 * services',
  DEFENSE_EQUIPMENT_FACTORY: '0.08 + 0.005 * industry',
  RECYCLING_WASTE_PROCESSING_PLANT: '0.15 + 0.010 * services'
});

const WEIGHT_RULES = Object.freeze({
  UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT: (m) => 0.45 + 0.012 * m.industry,
  STEEL_AND_ALLOY_WORKS: (m) => 0.25 + 0.030 * m.industry,
  NON_FERROUS_METAL_SMELTER: (m) => 0.20 + 0.018 * m.industry,
  PETROCHEMICAL_POLYMER_PLANT: (m) => 0.20 + 0.022 * m.industry,
  FERTILIZER_CHEMICAL_PLANT: (m) => 0.35 + 0.030 * m.agriculture + 0.010 * m.agricultureEmployment,
  INDUSTRIAL_CHEMICALS_GAS_PLANT: (m) => 0.18 + 0.012 * m.industry,
  CEMENT_CONCRETE_PLANT: (m) => 0.45 + 0.015 * m.industry,
  GLASS_CERAMICS_PLANT: (m) => 0.18 + 0.008 * m.industry,
  PAPER_PACKAGING_MILL: (m) => 0.35 + 0.010 * m.agriculture + 0.005 * m.services,
  FOOD_PROCESSING_COLD_CHAIN: (m) => 0.80 + 0.045 * m.agriculture + 0.015 * m.agricultureEmployment,
  TEXTILE_GARMENT_MILL: (m) => 0.40 + 0.015 * m.agricultureEmployment + 0.025 * m.manufacturing,
  INDUSTRIAL_MACHINERY_MACHINE_TOOLS: (m) => 0.15 + 0.025 * m.manufacturing,
  GRID_EQUIPMENT_FACTORY: (m) => 0.15 + 0.020 * m.manufacturing,
  ELECTRONICS_SEMICONDUCTOR_FAB: (m) => 0.12 + 0.022 * m.manufacturing,
  BATTERY_ENERGY_STORAGE_PLANT: (m) => 0.10 + 0.012 * m.manufacturing,
  VEHICLE_TRUCK_BUS_ASSEMBLY: (m) => 0.13 + 0.018 * m.manufacturing,
  SHIP_RAIL_EQUIPMENT_YARD: (m) => 0.08 + 0.008 * m.industry,
  AEROSPACE_EQUIPMENT_PLANT: (m) => 0.05 + 0.009 * m.manufacturing,
  PHARMA_MEDICAL_SUPPLIES_PLANT: (m) => 0.15 + 0.012 * m.manufacturing + 0.002 * m.services,
  DEFENSE_EQUIPMENT_FACTORY: (m) => 0.08 + 0.005 * m.industry,
  RECYCLING_WASTE_PROCESSING_PLANT: (m) => 0.15 + 0.010 * m.services
});

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const canonicalIds = (baseline) => baseline.factoryTypes.map((row) => row.id);
const finiteNumber = (value) => value !== null && value !== undefined && value !== '' &&
  Number.isFinite(Number(value)) ? Number(value) : null;
const nonNegativePercent = (value) => value === null ? 0 : Math.max(0, Math.min(100, value));

function readMetric(row, key, requiresComparableYear = false) {
  const context = row.economicSectorContext || {};
  const metric = context.valueAddedShares && context.valueAddedShares[key];
  if (!metric) return 0;
  const value = finiteNumber(metric.value);
  const year = finiteNumber(metric.year);
  if (value === null || !Number.isInteger(year)) return 0;
  if (requiresComparableYear) {
    const comparisonYear = finiteNumber(context.comparisonYear);
    if (!Number.isInteger(comparisonYear) || Math.abs(year - comparisonYear) > 3) return 0;
  }
  return nonNegativePercent(value);
}

function getMacroInputs(row) {
  const context = row.economicSectorContext || {};
  const availableSectorCount = Number(context.availableSectorCount || 0);
  const comparableStatus = context.comparisonStatus === 'SAME_YEAR_COMPARABLE' ||
    context.comparisonStatus === 'PARTIAL_SAME_YEAR_COMPARABLE';
  const comparable = comparableStatus && availableSectorCount >= 2 &&
    Number.isInteger(finiteNumber(context.comparisonYear));
  return {
    comparable,
    comparisonStatus: context.comparisonStatus || 'NOT_AVAILABLE',
    comparisonYear: Number.isInteger(finiteNumber(context.comparisonYear))
      ? Number(context.comparisonYear) : null,
    dominantSector: context.dominantSector || null,
    availableSectorCount,
    manufacturingBand: context.manufacturingBand || 'NOT_COMPARABLE',
    values: {
      agriculture: readMetric(row, 'agricultureValueAddedPctGdp'),
      industry: readMetric(row, 'industryValueAddedPctGdp'),
      services: readMetric(row, 'servicesValueAddedPctGdp'),
      manufacturing: readMetric(row, 'manufacturingValueAddedPctGdp', true),
      agricultureEmployment: readMetric(row, 'agricultureEmploymentPct', true)
    }
  };
}

function validateInput(baseline) {
  if (!isObject(baseline) || !Array.isArray(baseline.factoryTypes) ||
      !isObject(baseline.countries)) {
    throw new Error('FACTORY_BASELINE_SCHEMA_INVALID');
  }
  const ids = canonicalIds(baseline);
  if (ids.length !== 21 || new Set(ids).size !== 21) {
    throw new Error('FACTORY_BASELINE_CANONICAL_TYPE_ROSTER_INVALID');
  }
  const countryIds = Object.keys(baseline.countries);
  if (countryIds.length !== Number(baseline.countryCount) || countryIds.length !== 197) {
    throw new Error('FACTORY_BASELINE_COUNTRY_COUNT_MISMATCH');
  }
  for (const countryId of countryIds) {
    const row = baseline.countries[countryId];
    if (!isObject(row) || row.countryId !== countryId ||
        !isObject(row.factoryCounts) ||
        Object.keys(row.factoryCounts).sort().join('|') !== ids.slice().sort().join('|')) {
      throw new Error('FACTORY_BASELINE_COUNTRY_OR_TYPE_ROSTER_MISMATCH:' + countryId);
    }
    const values = Object.values(row.factoryCounts);
    if (values.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error('FACTORY_BASELINE_COUNT_INVALID:' + countryId);
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total !== row.totalStartingFactoryUnits || total <= 0) {
      throw new Error('FACTORY_BASELINE_TOTAL_MISMATCH:' + countryId);
    }
  }
}

function makeDiagnostics(row, activeIds, basis, status, rebalanced, note) {
  const macro = getMacroInputs(row);
  const specializations = Array.isArray(row.specializations) ? row.specializations : [];
  const sourceBacked = row.specializationEvidence &&
    row.specializationEvidence.status === 'SOURCE_BACKED_SIMULATION_MAPPING';
  return {
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    status,
    basis,
    rebalancedFromUniformCounts: rebalanced,
    comparisonStatus: macro.comparisonStatus,
    comparisonYear: macro.comparisonYear,
    dominantSector: macro.dominantSector,
    manufacturingBand: macro.manufacturingBand,
    availableSectorCount: macro.availableSectorCount,
    sourceBackedSpecializationCount: sourceBacked ? specializations.length : 0,
    gameModelledSpecializationCount: sourceBacked ? 0 : specializations.length,
    activeFactoryTypeCount: activeIds.length,
    selectedFactoryTypeIds: activeIds.slice(),
    note
  };
}

function allocateUniformProfile(row, ids) {
  const oldCounts = row.factoryCounts;
  const activeOldCounts = Object.values(oldCounts).filter((value) => value > 0);
  const isUniform = activeOldCounts.length > 0 && activeOldCounts.every((value) => value === 1);

  if (row.allocationDiagnostics && row.allocationDiagnostics.modelVersion === MODEL_VERSION) {
    return row;
  }

  if (!isUniform) {
    const activeIds = ids.filter((id) => oldCounts[id] > 0);
    row.allocationDiagnostics = makeDiagnostics(
      row, activeIds, 'PRESERVED_EXISTING_DISTRIBUTION', 'PRESERVED', false,
      'Existing non-uniform category counts are preserved without modification.'
    );
    return row;
  }

  const macro = getMacroInputs(row);
  const specializations = [...new Set(Array.isArray(row.specializations) ? row.specializations : [])];
  const unknownSpecializations = specializations.filter((id) => !ids.includes(id));
  if (unknownSpecializations.length) {
    throw new Error('FACTORY_SPECIALIZATION_UNKNOWN_TYPE:' + row.countryId + ':' + unknownSpecializations.join(','));
  }

  if (!macro.comparable && specializations.length === 0) {
    const activeIds = ids.filter((id) => oldCounts[id] > 0);
    row.allocationDiagnostics = makeDiagnostics(
      row, activeIds, 'CONSERVATIVE_EXISTING_PROFILE', 'PRESERVED_DATA_GAP', false,
      'No comparable same-year macro profile or explicit factory specialization is available; original allocation is retained.'
    );
    return row;
  }

  const scores = Object.fromEntries(ids.map((id) => [
    id, Math.max(0.001, WEIGHT_RULES[id](macro.values)) + (oldCounts[id] > 0 ? 0.04 : 0)
  ]));
  const sourceBacked = row.specializationEvidence &&
    row.specializationEvidence.status === 'SOURCE_BACKED_SIMULATION_MAPPING';
  for (const id of specializations) scores[id] *= sourceBacked ? 2.8 : 2.5;

  const total = row.totalStartingFactoryUnits;
  const activeLimit = Math.min(
    total,
    Math.max(specializations.length, Math.max(2, Math.round(total * 0.64)))
  );
  const rankedIds = ids.slice().sort((a, b) =>
    scores[b] - scores[a] || ids.indexOf(a) - ids.indexOf(b)
  );
  const selectedIds = specializations.slice();
  for (const id of rankedIds) {
    if (selectedIds.length >= activeLimit) break;
    if (!selectedIds.includes(id)) selectedIds.push(id);
  }
  if (selectedIds.length === 0 || selectedIds.length > total) {
    throw new Error('FACTORY_ALLOCATION_ACTIVE_CATEGORY_BUDGET_INVALID:' + row.countryId);
  }

  const nextCounts = Object.fromEntries(ids.map((id) => [id, 0]));
  selectedIds.forEach((id) => { nextCounts[id] = 1; });
  let remaining = total - selectedIds.length;

  if (sourceBacked && remaining >= specializations.length) {
    for (const id of specializations) nextCounts[id] += 1;
    remaining -= specializations.length;
  }

  if (remaining > 0) {
    const totalWeight = selectedIds.reduce((sum, id) => sum + scores[id], 0);
    const quotas = selectedIds.map((id) => ({
      id,
      exact: remaining * scores[id] / totalWeight
    }));
    let assigned = 0;
    for (const quota of quotas) {
      const whole = Math.floor(quota.exact);
      nextCounts[quota.id] += whole;
      quota.remainder = quota.exact - whole;
      assigned += whole;
    }
    quotas.sort((a, b) =>
      b.remainder - a.remainder || ids.indexOf(a.id) - ids.indexOf(b.id)
    );
    for (let index = 0; index < remaining - assigned; index += 1) {
      nextCounts[quotas[index].id] += 1;
    }
  }

  const allocatedTotal = Object.values(nextCounts).reduce((sum, value) => sum + value, 0);
  if (allocatedTotal !== total) {
    throw new Error('FACTORY_ALLOCATION_UNIT_CONSERVATION_FAILED:' + row.countryId);
  }
  for (const id of specializations) {
    if (nextCounts[id] <= 0) {
      throw new Error('FACTORY_SPECIALIZATION_ALLOCATION_LOST:' + row.countryId + ':' + id);
    }
  }

  const allocationChanged = ids.some((id) => nextCounts[id] !== oldCounts[id]);
  row.factoryCounts = nextCounts;
  const basis = specializations.length
    ? (sourceBacked ? 'SOURCE_BACKED_SPECIALIZATION_PLUS_MACRO' : 'GAME_MODELLED_SPECIALIZATION_PLUS_MACRO')
    : 'SAME_YEAR_MACRO_SECTOR_ONLY';
  const allocationStatus = allocationChanged ? 'REBALANCED' : 'CONSTRAINED_UNCHANGED';
  const allocationNote = allocationChanged
    ? 'Reallocated the existing game-unit budget by comparable macro-sector weights and the existing specialization map; no units were added.'
    : 'The existing specialization set consumes every available starting unit. Counts are intentionally left at one per required specialization rather than dropping a required category.';
  row.allocationDiagnostics = makeDiagnostics(
    row, selectedIds, basis, allocationStatus, allocationChanged, allocationNote
  );
  return row;
}

function summarize(baseline) {
  const rows = Object.values(baseline.countries);
  const basisCounts = {};
  let remainingUniformProfileCount = 0;
  for (const row of rows) {
    const diagnostics = row.allocationDiagnostics || {};
    basisCounts[diagnostics.basis || 'UNCLASSIFIED'] =
      (basisCounts[diagnostics.basis || 'UNCLASSIFIED'] || 0) + 1;
    const positive = Object.values(row.factoryCounts).filter((value) => value > 0);
    if (positive.length > 0 && positive.every((value) => value === 1)) {
      remainingUniformProfileCount += 1;
    }
  }
  return {
    coreCountryCount: rows.length,
    factoryTypeCount: baseline.factoryTypes.length,
    evaluatedUniformProfileCount: (basisCounts.SAME_YEAR_MACRO_SECTOR_ONLY || 0) +
      (basisCounts.GAME_MODELLED_SPECIALIZATION_PLUS_MACRO || 0) +
      (basisCounts.SOURCE_BACKED_SPECIALIZATION_PLUS_MACRO || 0),
    changedUniformDistributionCount: rows.filter((row) =>
      row.allocationDiagnostics && row.allocationDiagnostics.rebalancedFromUniformCounts === true
    ).length,
    constrainedUnitBudgetCount: rows.filter((row) =>
      row.allocationDiagnostics && row.allocationDiagnostics.status === 'CONSTRAINED_UNCHANGED'
    ).length,
    preservedExistingDistributionCount: basisCounts.PRESERVED_EXISTING_DISTRIBUTION || 0,
    conservativeDataGapCount: basisCounts.CONSERVATIVE_EXISTING_PROFILE || 0,
    macroOnlyCount: basisCounts.SAME_YEAR_MACRO_SECTOR_ONLY || 0,
    gameModelledSpecializationCount: basisCounts.GAME_MODELLED_SPECIALIZATION_PLUS_MACRO || 0,
    sourceBackedSpecializationCount: basisCounts.SOURCE_BACKED_SPECIALIZATION_PLUS_MACRO || 0,
    remainingUniformProfileCount,
    basisCounts
  };
}

export function rebalanceCountryFactoryStartingBaseline(input) {
  validateInput(input);
  const baseline = structuredClone(input);
  const ids = canonicalIds(baseline);
  for (const countryId of Object.keys(baseline.countries).sort()) {
    allocateUniformProfile(baseline.countries[countryId], ids);
  }
  baseline.allocationModel = {
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    authority: 'SIMULATION_ONLY_MODELLED_ALLOCATION',
    sourceInputs: [
      'Existing per-country economicSectorContext values sourced from country_general_data_registry_v1.json.',
      'Existing country specializations and their source-evidence status.',
      'The canonical 21-type resource_industrial_catalog_v1.json roster.'
    ],
    comparabilityPolicy: 'Agriculture, industry and services are used only when at least two observations share the exact same year. Manufacturing value added and agriculture employment are used only when their observation year is within three years of that comparison year. Missing or non-comparable values contribute no fabricated zero observation.',
    allocationPolicy: 'Only country profiles whose positive category counts were all exactly one are candidates for rebalancing. Existing differentiated distributions are preserved. Explicit specializations are selected first; remaining slots are ranked by modelled weights. Each selected category receives at least one unit, then the remaining fixed budget is distributed using the largest-remainder method.',
    fixedBudgetPolicy: 'Each country keeps its original totalStartingFactoryUnits. This process changes only the allocation among the existing 21 category keys; it does not create new starting units or change the country overall starting-factory total.',
    specializationPolicy: 'Existing specialization IDs remain mandatory positive categories. Source-backed specializations receive a stronger model weight than game-modelled specializations; this expresses evidence priority, not an observed establishment count.',
    weightModel: WEIGHT_FORMULAS,
    limits: [
      'The weights are game-simulation ranking assumptions, not estimated facility counts, market shares, capacity measurements or official country classifications.',
      'Broad GDP value-added shares guide broad category weights; they do not prove that a particular country operates a specific sub-industry.',
      'Source-backed specialization evidence supports sector presence or mapping only; it does not justify a literal factory count.',
      'The latest UNIDO INDSTAT establishment refresh recorded zero usable core-country observations, so UNIDO establishment counts are not used to populate this model.',
      'Resource-context entries are not used as quantitative factory weights because much of the current roster lacks sufficiently differentiated, comparable resource evidence.',
      'Profiles without comparable macro data and without existing specializations retain their previous allocation rather than receiving invented country-specific values.'
    ],
    summary: summarize(baseline)
  };
  return baseline;
}

function validateOutput(baseline) {
  validateInput(baseline);
  if (!baseline.allocationModel ||
      baseline.allocationModel.modelVersion !== MODEL_VERSION ||
      baseline.allocationModel.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('FACTORY_ALLOCATION_MODEL_METADATA_MISSING');
  }
  const ids = canonicalIds(baseline);
  for (const [countryId, row] of Object.entries(baseline.countries)) {
    const diagnostics = row.allocationDiagnostics;
    if (!diagnostics || diagnostics.modelVersion !== MODEL_VERSION ||
        !['PRESERVED_EXISTING_DISTRIBUTION', 'CONSERVATIVE_EXISTING_PROFILE',
          'SAME_YEAR_MACRO_SECTOR_ONLY', 'GAME_MODELLED_SPECIALIZATION_PLUS_MACRO',
          'SOURCE_BACKED_SPECIALIZATION_PLUS_MACRO'].includes(diagnostics.basis)) {
      throw new Error('FACTORY_ALLOCATION_DIAGNOSTICS_INVALID:' + countryId);
    }
    if (diagnostics.activeFactoryTypeCount !==
        Object.values(row.factoryCounts).filter((value) => value > 0).length) {
      throw new Error('FACTORY_ALLOCATION_DIAGNOSTIC_COUNT_MISMATCH:' + countryId);
    }
    if (diagnostics.selectedFactoryTypeIds.some((id) => !ids.includes(id))) {
      throw new Error('FACTORY_ALLOCATION_DIAGNOSTIC_UNKNOWN_TYPE:' + countryId);
    }
    for (const id of (row.specializations || [])) {
      if (row.factoryCounts[id] <= 0) {
        throw new Error('FACTORY_ALLOCATION_SPECIALIZATION_NOT_POSITIVE:' + countryId + ':' + id);
      }
    }
  }
  const actualSummary = summarize(baseline);
  if (JSON.stringify(actualSummary) !== JSON.stringify(baseline.allocationModel.summary)) {
    throw new Error('FACTORY_ALLOCATION_SUMMARY_MISMATCH');
  }
  if (actualSummary.remainingUniformProfileCount > 8) {
    throw new Error('FACTORY_ALLOCATION_UNIFORM_PROFILE_REMAINDER_TOO_HIGH');
  }
  return actualSummary;
}

function run() {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has('--check');
  const current = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  if (checkOnly) {
    const summary = validateOutput(current);
    const rerun = rebalanceCountryFactoryStartingBaseline(current);
    if (JSON.stringify(rerun) !== JSON.stringify(current)) {
      throw new Error('FACTORY_ALLOCATION_NOT_IDEMPOTENT');
    }
    process.stdout.write('Factory allocation V2 verified: ' +
      summary.changedUniformDistributionCount + ' allocations changed across ' +
      summary.evaluatedUniformProfileCount + ' eligible profiles; ' +
      summary.preservedExistingDistributionCount + ' existing distributions preserved; ' +
      summary.conservativeDataGapCount + ' data-gap profiles retained; ' +
      summary.remainingUniformProfileCount + ' profiles remain uniform under constraints.\n');
    return;
  }
  const updated = rebalanceCountryFactoryStartingBaseline(current);
  validateOutput(updated);
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  process.stdout.write('Factory allocation V2 written: ' +
    updated.allocationModel.summary.changedUniformDistributionCount +
    ' distributions changed; ' + updated.allocationModel.summary.constrainedUnitBudgetCount +
    ' profiles are unchanged due to their full specialization budget.\n');
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();
