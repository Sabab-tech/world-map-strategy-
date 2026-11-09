import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const baseline = JSON.parse(fs.readFileSync(new URL('../country_factory_starting_baseline_v1.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(new URL('../resource_industrial_catalog_v1.json', import.meta.url), 'utf8'));
const scale = baseline.factoryCountScaling;
const factor = scale && scale.scaleFactor;
const typeIds = Object.keys(catalog.factoryProfiles).sort();

test('all 197 countries retain all 21 types and receive multiple starting units per active category', () => {
  assert.equal(baseline.version, '1.3.0');
  assert.equal(baseline.countryCount, 197);
  assert.equal(Object.keys(baseline.countries).length, 197);
  assert.equal(baseline.factoryTypeCount, 21);
  assert.equal(typeIds.length, 21);
  assert.equal(scale.modelVersion, 'OMEGA_COUNTRY_FACTORY_COUNT_SCALE_V1');
  assert.equal(factor, 10);
  assert.equal(scale.sourceWorldTotalStartingFactoryUnits, 1592);
  assert.equal(scale.worldTotalStartingFactoryUnits, 15920);
  assert.equal(scale.minimumPositiveFactoryCount, factor);
  let worldTotal = 0, positiveEntries = 0, zeroEntries = 0;
  for (const [countryId, row] of Object.entries(baseline.countries)) {
    assert.deepEqual(Object.keys(row.factoryCounts).sort(), typeIds, countryId);
    assert.equal(row.factoryCountScaleFactor, factor, countryId);
    assert.equal(row.totalStartingFactoryUnits, row.unscaledTotalStartingFactoryUnits * factor, countryId);
    const total = Object.values(row.factoryCounts).reduce((sum, value) => {
      assert.ok(Number.isInteger(value) && value >= 0, countryId);
      if (value > 0) {
        assert.ok(value >= factor, countryId + ' active category must have multiple game units');
        assert.equal(value % factor, 0, countryId + ' category scale must be exact');
        positiveEntries++;
      } else zeroEntries++;
      return sum + value;
    }, 0);
    assert.equal(total, row.totalStartingFactoryUnits, countryId);
    assert.equal(row.provenance.simulationOnly, true, countryId);
    assert.equal(row.provenance.realWorldFacilityCounts, false, countryId);
    for (const typeId of row.specializations || []) assert.ok(row.factoryCounts[typeId] >= factor, countryId + '/' + typeId);
    worldTotal += total;
  }
  assert.equal(worldTotal, scale.worldTotalStartingFactoryUnits);
  assert.equal(positiveEntries, scale.scaledPositiveCategoryCount);
  assert.equal(zeroEntries, scale.preservedZeroCategoryCount);
  assert.equal(baseline.allocationModel.summary.worldTotalStartingFactoryUnits, 15920);
  assert.equal(baseline.allocationModel.summary.remainingUniformProfileCount, 0);
});

test('country specializations preserve their old category proportions at the new game scale', () => {
  const examples = {
    BGD: {TEXTILE_GARMENT_MILL:40,FOOD_PROCESSING_COLD_CHAIN:10,PAPER_PACKAGING_MILL:10},
    CHN: {STEEL_AND_ALLOY_WORKS:40,TEXTILE_GARMENT_MILL:30,ELECTRONICS_SEMICONDUCTOR_FAB:30},
    DEU: {STEEL_AND_ALLOY_WORKS:30,INDUSTRIAL_MACHINERY_MACHINE_TOOLS:30},
    IND: {STEEL_AND_ALLOY_WORKS:30,FOOD_PROCESSING_COLD_CHAIN:30,TEXTILE_GARMENT_MILL:30},
    SGP: {SHIP_RAIL_EQUIPMENT_YARD:20,ELECTRONICS_SEMICONDUCTOR_FAB:20}
  };
  for (const [countryId, expected] of Object.entries(examples)) {
    for (const [typeId, count] of Object.entries(expected)) assert.equal(baseline.countries[countryId].factoryCounts[typeId],count,countryId+'/'+typeId);
  }
});

test('unsupported categories remain zero instead of being fabricated', () => {
  for (const [countryId,row] of Object.entries(baseline.countries)) {
    for (const [typeId,count] of Object.entries(row.factoryCounts)) {
      if (count===0) assert.equal(count,0,countryId+'/'+typeId);
    }
  }
});
