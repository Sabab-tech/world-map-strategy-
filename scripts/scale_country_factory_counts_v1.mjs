#!/usr/bin/env node
/**
 * OMEGA country factory count scale V1.
 * Promotes the V2 abstract country allocations to a practical game starting scale.
 * No country, factory ID, active category, specialization or zero allocation is added.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT, 'country_factory_starting_baseline_v1.json');
const SCALE_FACTOR = 10;
const MODEL_VERSION = 'OMEGA_COUNTRY_FACTORY_COUNT_SCALE_V1';

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function scaleCountryFactoryCounts(input) {
  if (!isObject(input) || !isObject(input.countries) ||
      input.countryCount !== 197 || input.factoryTypeCount !== 21 ||
      !Array.isArray(input.factoryTypes) || input.factoryTypes.length !== 21) {
    throw new Error('FACTORY_COUNT_SCALE_SOURCE_SCHEMA_INVALID');
  }
  const baseline = structuredClone(input);
  const previousScale = baseline.factoryCountScaling
    ? Number(baseline.factoryCountScaling.scaleFactor) : 1;
  if (!Number.isInteger(previousScale) || previousScale < 1) {
    throw new Error('FACTORY_COUNT_SCALE_PREVIOUS_FACTOR_INVALID');
  }
  const previousVersion = baseline.version || 'UNKNOWN';
  const sourceWorldTotal = baseline.factoryCountScaling
    ? Number(baseline.factoryCountScaling.sourceWorldTotalStartingFactoryUnits)
    : Object.values(baseline.countries).reduce((sum, row) =>
        sum + Number(row.totalStartingFactoryUnits), 0);
  if (!Number.isInteger(sourceWorldTotal) || sourceWorldTotal <= 0) {
    throw new Error('FACTORY_COUNT_SCALE_SOURCE_WORLD_TOTAL_INVALID');
  }

  let worldTotal = 0;
  let positiveSlots = 0;
  let zeroSlots = 0;
  const typeIds = baseline.factoryTypes.map((row) => String(row && row.id || '').trim());
  if (typeIds.some((id) => !id) || new Set(typeIds).size !== 21) {
    throw new Error('FACTORY_COUNT_SCALE_CANONICAL_TYPES_INVALID');
  }

  for (const [countryId, row] of Object.entries(baseline.countries)) {
    if (!isObject(row) || !isObject(row.factoryCounts) ||
        Object.keys(row.factoryCounts).length !== 21 ||
        typeIds.some((id) => !Object.prototype.hasOwnProperty.call(row.factoryCounts, id))) {
      throw new Error('FACTORY_COUNT_SCALE_COUNTRY_ROW_INVALID:' + countryId);
    }
    const sourceTotal = Number(row.unscaledTotalStartingFactoryUnits ??
      (Number(row.totalStartingFactoryUnits) / previousScale));
    if (!Number.isInteger(sourceTotal) || sourceTotal < 0) {
      throw new Error('FACTORY_COUNT_SCALE_COUNTRY_TOTAL_INVALID:' + countryId);
    }

    let newTotal = 0;
    for (const typeId of typeIds) {
      const current = Number(row.factoryCounts[typeId]);
      if (!Number.isInteger(current) || current < 0 || current % previousScale !== 0) {
        throw new Error('FACTORY_COUNT_SCALE_CATEGORY_INVALID:' + countryId + ':' + typeId);
      }
      const scaledCount = (current / previousScale) * SCALE_FACTOR;
      row.factoryCounts[typeId] = scaledCount;
      newTotal += scaledCount;
      if (scaledCount > 0) positiveSlots++;
      else zeroSlots++;
    }
    if (sourceTotal * SCALE_FACTOR !== newTotal) {
      throw new Error('FACTORY_COUNT_SCALE_COUNTRY_TOTAL_MISMATCH:' + countryId);
    }
    row.unscaledTotalStartingFactoryUnits = sourceTotal;
    row.factoryCountScaleFactor = SCALE_FACTOR;
    row.totalStartingFactoryUnits = newTotal;
    worldTotal += newTotal;
  }

  if (worldTotal !== sourceWorldTotal * SCALE_FACTOR) {
    throw new Error('FACTORY_COUNT_SCALE_WORLD_TOTAL_MISMATCH');
  }
  baseline.version = '1.3.0';
  baseline.factoryCountScaling = {
    schemaVersion: '1.0.0',
    modelVersion: MODEL_VERSION,
    sourceAllocationModel: 'OMEGA_COUNTRY_FACTORY_ALLOCATION_V2',
    scaleFactor: SCALE_FACTOR,
    sourceBaselineVersion: baseline.factoryCountScaling
      ? baseline.factoryCountScaling.sourceBaselineVersion || '1.2.0'
      : previousVersion,
    sourceWorldTotalStartingFactoryUnits: sourceWorldTotal,
    worldTotalStartingFactoryUnits: worldTotal,
    countryCount: Object.keys(baseline.countries).length,
    factoryTypeCount: baseline.factoryTypeCount,
    scaledPositiveCategoryCount: positiveSlots,
    preservedZeroCategoryCount: zeroSlots,
    minimumPositiveFactoryCount: SCALE_FACTOR,
    policy: 'Multiply each existing positive country/type game allocation by ten. Preserve zero categories, the exact 197-country roster, all 21 canonical factory IDs, active category sets, specializations and within-country proportions. These are simulation-only starting units, not real-world facility counts.'
  };

  const summary = baseline.allocationModel && baseline.allocationModel.summary;
  if (!isObject(summary)) throw new Error('FACTORY_COUNT_SCALE_ALLOCATION_SUMMARY_MISSING');
  summary.worldTotalStartingFactoryUnits = worldTotal;
  summary.remainingUniformProfileCount = Object.values(baseline.countries).filter((row) => {
    const active = Object.values(row.factoryCounts).filter((value) => value > 0);
    return active.length > 0 && active.every((value) => value === 1);
  }).length;
  return baseline;
}

export function validateScaledBaseline(baseline) {
  const scale = baseline.factoryCountScaling;
  if (!scale || scale.modelVersion !== MODEL_VERSION || scale.scaleFactor !== SCALE_FACTOR ||
      baseline.version !== '1.3.0' || scale.countryCount !== 197 || scale.factoryTypeCount !== 21) {
    throw new Error('FACTORY_COUNT_SCALE_METADATA_INVALID');
  }
  let total = 0, positive = 0, zero = 0;
  for (const [countryId, row] of Object.entries(baseline.countries)) {
    if (Object.keys(row.factoryCounts).length !== 21 ||
        row.factoryCountScaleFactor !== SCALE_FACTOR ||
        row.totalStartingFactoryUnits !== row.unscaledTotalStartingFactoryUnits * SCALE_FACTOR) {
      throw new Error('FACTORY_COUNT_SCALE_ROW_METADATA_INVALID:' + countryId);
    }
    let countryTotal = 0;
    for (const value of Object.values(row.factoryCounts)) {
      if (!Number.isInteger(value) || value < 0 ||
          (value > 0 && value < SCALE_FACTOR) || value % SCALE_FACTOR !== 0) {
        throw new Error('FACTORY_COUNT_SCALE_VALUE_INVALID:' + countryId);
      }
      if (value > 0) positive++;
      else zero++;
      countryTotal += value;
    }
    if (countryTotal !== row.totalStartingFactoryUnits) {
      throw new Error('FACTORY_COUNT_SCALE_TOTAL_INVALID:' + countryId);
    }
    for (const typeId of row.specializations || []) {
      if (row.factoryCounts[typeId] <= 0) {
        throw new Error('FACTORY_COUNT_SCALE_SPECIALIZATION_MISSING:' + countryId + ':' + typeId);
      }
    }
    total += countryTotal;
  }
  if (total !== scale.worldTotalStartingFactoryUnits ||
      positive !== scale.scaledPositiveCategoryCount ||
      zero !== scale.preservedZeroCategoryCount ||
      baseline.allocationModel.summary.worldTotalStartingFactoryUnits !== total) {
    throw new Error('FACTORY_COUNT_SCALE_SUMMARY_INVALID');
  }
  return {countryCount:197,factoryTypeCount:21,total,positiveCategoryCount:positive,zeroCategoryCount:zero};
}

function run() {
  const checkOnly = process.argv.includes('--check');
  const current = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const scaled = scaleCountryFactoryCounts(current);
  validateScaledBaseline(scaled);
  if (checkOnly) {
    if (JSON.stringify(scaled) !== JSON.stringify(current)) {
      throw new Error('FACTORY_COUNT_SCALE_NOT_IDEMPOTENT');
    }
    const report = validateScaledBaseline(current);
    process.stdout.write('Factory count scale verified: ' + report.countryCount +
      ' countries x ' + report.factoryTypeCount + ' types; ' + report.total +
      ' game units; ' + report.positiveCategoryCount + ' positive category entries; ' +
      report.zeroCategoryCount + ' preserved zero entries.\n');
    return;
  }
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(scaled, null, 2) + '\n', 'utf8');
  const report = validateScaledBaseline(scaled);
  process.stdout.write('Factory count scale written: ' + report.total +
    ' game units across ' + report.countryCount + ' countries.\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) run();
