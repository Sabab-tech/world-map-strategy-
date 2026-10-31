import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { rebalanceCountryFactoryStartingBaseline } from '../scripts/rebalance_country_factory_starting_baseline_v1.mjs';

const read = (name) => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const baseline = read('country_factory_starting_baseline_v1.json');
const catalog = read('resource_industrial_catalog_v1.json');
const ids = Object.keys(catalog.factoryProfiles).sort();
const countries = Object.entries(baseline.countries);

test('allocation V2 covers all 197 countries and the one canonical 21-type catalog', () => {
  assert.equal(baseline.countryCount, 197);
  assert.equal(countries.length, 197);
  assert.equal(baseline.factoryTypeCount, 21);
  assert.equal(ids.length, 21);
  assert.equal(baseline.allocationModel.modelVersion, 'OMEGA_COUNTRY_FACTORY_ALLOCATION_V2');

  for (const [countryId, row] of countries) {
    assert.deepEqual(Object.keys(row.factoryCounts).sort(), ids, countryId);
    assert.equal(row.totalStartingFactoryUnits,
      Object.values(row.factoryCounts).reduce((sum, value) => sum + value, 0), countryId);
    assert.ok(Object.values(row.factoryCounts).every((value) =>
      Number.isInteger(value) && value >= 0), countryId);
    assert.equal(row.allocationDiagnostics.modelVersion,
      'OMEGA_COUNTRY_FACTORY_ALLOCATION_V2', countryId);
    assert.equal(row.allocationDiagnostics.activeFactoryTypeCount,
      Object.values(row.factoryCounts).filter((value) => value > 0).length, countryId);

    for (const typeId of row.specializations || []) {
      assert.ok(ids.includes(typeId), countryId + '/' + typeId + ' must exist in the canonical catalog');
      assert.ok(row.factoryCounts[typeId] > 0,
        countryId + '/' + typeId + ' must keep a positive allocation');
    }
  }
});

test('uniform profiles are redistributed without inflating country starting-unit totals', () => {
  const summary = baseline.allocationModel.summary;
  assert.equal(summary.evaluatedUniformProfileCount, 143);
  assert.equal(summary.changedUniformDistributionCount, 140);
  assert.equal(summary.constrainedUnitBudgetCount, 3);
  assert.equal(summary.preservedExistingDistributionCount, 49);
  assert.equal(summary.conservativeDataGapCount, 5);
  assert.equal(summary.macroOnlyCount, 96);
  assert.equal(summary.gameModelledSpecializationCount, 35);
  assert.equal(summary.sourceBackedSpecializationCount, 12);
  assert.equal(summary.remainingUniformProfileCount, 8);
  assert.equal(summary.coreCountryCount, 197);
  assert.equal(summary.factoryTypeCount, 21);
});

test('existing differentiated country profiles are preserved exactly', () => {
  const expected = {
    BGD: { TEXTILE_GARMENT_MILL: 4 },
    CHN: { STEEL_AND_ALLOY_WORKS: 4, TEXTILE_GARMENT_MILL: 3, ELECTRONICS_SEMICONDUCTOR_FAB: 3 },
    DEU: { STEEL_AND_ALLOY_WORKS: 3, INDUSTRIAL_MACHINERY_MACHINE_TOOLS: 3 },
    IND: { STEEL_AND_ALLOY_WORKS: 3, FOOD_PROCESSING_COLD_CHAIN: 3, TEXTILE_GARMENT_MILL: 3 },
    USA: { PETROCHEMICAL_POLYMER_PLANT: 3, FOOD_PROCESSING_COLD_CHAIN: 3 },
    PAK: { TEXTILE_GARMENT_MILL: 2 }
  };
  for (const [countryId, entries] of Object.entries(expected)) {
    const row = baseline.countries[countryId];
    assert.equal(row.allocationDiagnostics.basis, 'PRESERVED_EXISTING_DISTRIBUTION');
    for (const [typeId, count] of Object.entries(entries)) {
      assert.equal(row.factoryCounts[typeId], count, countryId + '/' + typeId);
    }
  }
});

test('macro-only and specialization-backed profiles express different modelled mixes', () => {
  const ghana = baseline.countries.GHA;
  const mongolia = baseline.countries.MNG;
  const myanmar = baseline.countries.MMR;
  assert.equal(ghana.allocationDiagnostics.basis, 'SAME_YEAR_MACRO_SECTOR_ONLY');
  assert.equal(mongolia.allocationDiagnostics.basis, 'SAME_YEAR_MACRO_SECTOR_ONLY');
  assert.equal(myanmar.allocationDiagnostics.basis, 'SOURCE_BACKED_SPECIALIZATION_PLUS_MACRO');
  assert.ok(ghana.factoryCounts.FOOD_PROCESSING_COLD_CHAIN > 1);
  assert.ok(mongolia.factoryCounts.STEEL_AND_ALLOY_WORKS > 1);
  assert.ok(myanmar.factoryCounts.FOOD_PROCESSING_COLD_CHAIN > 1);
  assert.ok(myanmar.factoryCounts.TEXTILE_GARMENT_MILL > 1);
});

test('the allocation generator is idempotent and deterministic on a synthetic uniform profile', () => {
  const alreadyBuilt = structuredClone(baseline);
  assert.deepEqual(rebalanceCountryFactoryStartingBaseline(alreadyBuilt), baseline);

  const synthetic = structuredClone(baseline);
  const row = synthetic.countries.GHA;
  row.factoryCounts = Object.fromEntries(ids.map((id) => [id, 0]));
  ids.slice(0, 7).forEach((id) => { row.factoryCounts[id] = 1; });
  row.totalStartingFactoryUnits = 7;
  delete row.allocationDiagnostics;

  const first = rebalanceCountryFactoryStartingBaseline(synthetic);
  const second = rebalanceCountryFactoryStartingBaseline(first);
  assert.deepEqual(second, first);
  const updated = first.countries.GHA;
  assert.equal(updated.totalStartingFactoryUnits,
    Object.values(updated.factoryCounts).reduce((sum, value) => sum + value, 0));
  assert.ok(Object.values(updated.factoryCounts).some((value) => value > 1));
  assert.equal(updated.allocationDiagnostics.rebalancedFromUniformCounts, true);
});
