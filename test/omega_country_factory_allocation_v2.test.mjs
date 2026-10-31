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

test('uniform profiles are redistributed with only the three documented budget exceptions', () => {
  const summary = baseline.allocationModel.summary;
  assert.equal(summary.evaluatedUniformProfileCount, 147);
  assert.equal(summary.changedUniformDistributionCount, 143);
  assert.equal(summary.constrainedUnitBudgetCount, 0);
  assert.equal(summary.preservedExistingDistributionCount, 49);
  assert.equal(summary.conservativeDataGapCount, 1);
  assert.equal(summary.macroOnlyCount, 92);
  assert.equal(summary.gameModelledSpecializationCount, 35);
  assert.equal(summary.sourceBackedSpecializationCount, 16);
  assert.equal(summary.remainingUniformProfileCount, 5);
  assert.equal(summary.coreCountryCount, 197);
  assert.equal(summary.factoryTypeCount, 21);
  assert.equal(summary.sourceBackedSpecializationCountryCount, 25);
  assert.equal(summary.sourceBackedSpecializationOnlyCount, 4);
  assert.equal(summary.specializationRefreshCount, 8);
  assert.equal(summary.budgetIncreasedCountryCount, 3);
  assert.equal(summary.budgetIncreaseUnits, 3);
  assert.equal(summary.worldTotalStartingFactoryUnits, 1592);
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
  assert.equal(ghana.allocationDiagnostics.basis, 'SOURCE_BACKED_SPECIALIZATION_PLUS_MACRO');
  assert.equal(mongolia.allocationDiagnostics.basis, 'SOURCE_BACKED_SPECIALIZATION_PLUS_MACRO');
  assert.equal(myanmar.allocationDiagnostics.basis, 'SOURCE_BACKED_SPECIALIZATION_PLUS_MACRO');
  assert.ok(ghana.factoryCounts.FOOD_PROCESSING_COLD_CHAIN > 0);
  assert.ok(mongolia.factoryCounts.NON_FERROUS_METAL_SMELTER > 0);
  assert.ok(myanmar.factoryCounts.FOOD_PROCESSING_COLD_CHAIN > 1);
  assert.ok(myanmar.factoryCounts.TEXTILE_GARMENT_MILL > 1);
});

test('new source evidence refines Ghana, Mongolia, Papua New Guinea and Botswana', () => {
  const expectations = {
    GHA: ['FOOD_PROCESSING_COLD_CHAIN','NON_FERROUS_METAL_SMELTER','TEXTILE_GARMENT_MILL'],
    MNG: ['NON_FERROUS_METAL_SMELTER','CEMENT_CONCRETE_PLANT','TEXTILE_GARMENT_MILL','FOOD_PROCESSING_COLD_CHAIN'],
    PNG: ['FOOD_PROCESSING_COLD_CHAIN','PETROCHEMICAL_POLYMER_PLANT','NON_FERROUS_METAL_SMELTER','TEXTILE_GARMENT_MILL'],
    BWA: ['FOOD_PROCESSING_COLD_CHAIN','TEXTILE_GARMENT_MILL','PETROCHEMICAL_POLYMER_PLANT','STEEL_AND_ALLOY_WORKS']
  };
  for (const [countryId, typeIds] of Object.entries(expectations)) {
    const row = baseline.countries[countryId];
    assert.deepEqual([...row.specializations].sort(), [...typeIds].sort(), countryId);
    assert.equal(row.specializationEvidence.status, 'SOURCE_BACKED_SIMULATION_MAPPING', countryId);
    assert.ok(row.specializationEvidence.sources.length >= 2, countryId);
    assert.ok(row.specializationEvidence.sources.every(source => /^https:\/\//.test(source.url)), countryId);
    assert.ok(row.specializations.every(type => row.factoryCounts[type] > 0), countryId);
    assert.ok(new Set(Object.values(row.factoryCounts).filter(value => value > 0)).size > 1,
      countryId + ' active category quantities should be differentiated');
    assert.equal(row.allocationDiagnostics.specializationRefreshApplied, true, countryId);
  }
});

test('three source-backed profiles receive only the recorded one-unit constraint exception', () => {
  const expected = { JOR: 8, SMR: 4, SWZ: 5 };
  for (const [countryId, total] of Object.entries(expected)) {
    const row = baseline.countries[countryId];
    assert.equal(row.totalStartingFactoryUnits, total, countryId);
    assert.equal(row.allocationDiagnostics.budgetIncreaseApplied, true, countryId);
    assert.equal(row.allocationDiagnostics.budgetIncreaseUnits, 1, countryId);
    assert.ok(new Set(Object.values(row.factoryCounts).filter(value => value > 0)).size > 1, countryId);
  }
  const vatican = baseline.countries.VAT;
  assert.equal(vatican.allocationDiagnostics.basis, 'CONSERVATIVE_EXISTING_PROFILE');
  assert.ok(Object.values(vatican.factoryCounts).filter(value => value > 0).every(value => value === 1));
  for (const countryId of ['ESH','NRU','PRK','SOM']) {
    assert.equal(baseline.countries[countryId].allocationDiagnostics.basis,
      'SOURCE_BACKED_SPECIALIZATION_ONLY', countryId);
  }
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


test('source-backed profiles without comparable macro data use only evidenced factory categories', () => {
  const expectations = {
    ESH: { types: ['UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'], total: 3 },
    NRU: { types: ['UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'], total: 3 },
    PRK: { types: ['STEEL_AND_ALLOY_WORKS','CEMENT_CONCRETE_PLANT','FERTILIZER_CHEMICAL_PLANT'], total: 5 },
    SOM: { types: ['FOOD_PROCESSING_COLD_CHAIN'], total: 3 }
  };
  for (const [countryId, expected] of Object.entries(expectations)) {
    const row = baseline.countries[countryId];
    assert.deepEqual([...row.specializations].sort(), [...expected.types].sort(), countryId);
    assert.equal(row.totalStartingFactoryUnits, expected.total, countryId);
    assert.equal(row.allocationDiagnostics.basis, 'SOURCE_BACKED_SPECIALIZATION_ONLY', countryId);
    assert.equal(row.allocationDiagnostics.specializationRefreshApplied, true, countryId);
    assert.equal(row.allocationDiagnostics.previousAllocationBasis, 'CONSERVATIVE_EXISTING_PROFILE', countryId);
    assert.equal(row.allocationDiagnostics.macroWeightsApplied, false, countryId);
    assert.equal(row.specializationEvidence.status, 'SOURCE_BACKED_SIMULATION_MAPPING', countryId);
    const active = Object.entries(row.factoryCounts).filter(([, value]) => value > 0).map(([typeId]) => typeId);
    assert.deepEqual(active.sort(), [...expected.types].sort(), countryId + ' must not receive unsupported active categories');
    assert.equal(row.totalStartingFactoryUnits,
      Object.values(row.factoryCounts).reduce((sum, value) => sum + value, 0), countryId);
  }
  assert.equal(baseline.allocationModel.summary.remainingUniformProfileCount, 1);
  assert.equal(baseline.allocationModel.summary.sourceBackedSpecializationCountryCount, 25);
});
