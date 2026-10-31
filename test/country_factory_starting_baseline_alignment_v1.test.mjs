import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { enrichCountryFactoryStartingBaseline } from '../scripts/enrich_country_factory_starting_baseline_v1.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const baseline = read('country_factory_starting_baseline_v1.json');
const registry = read('country_general_data_registry_v1.json');

test('all 197 core countries receive source-aware comparable macro industry context', () => {
  const enriched = enrichCountryFactoryStartingBaseline(structuredClone(baseline), registry);
  assert.equal(Object.keys(enriched.countries).length, 197);
  assert.equal(enriched.sectorAlignment.coreCountryCount, 197);
  for (const [countryId, row] of Object.entries(enriched.countries)) {
    const context = row.economicSectorContext;
    assert.equal(context.schemaVersion, 'OMEGA_COUNTRY_ECONOMIC_SECTOR_CONTEXT_V1', countryId);
    assert.ok(['SAME_YEAR_COMPARABLE','PARTIAL_SAME_YEAR_COMPARABLE','MIXED_OBSERVATION_YEARS','INSUFFICIENT_COMPARABLE_DATA'].includes(context.comparisonStatus), countryId);
    for (const metric of Object.values(context.valueAddedShares)) {
      if (metric.value === null) {
        assert.ok(['MISSING','NO_SOURCE_OBSERVATION','UNSPECIFIED'].includes(metric.status) ||
          metric.status.startsWith('NO_') || metric.status.startsWith('NOT_'), countryId + ' missing metric status');
      } else {
        assert.ok(Number.isFinite(metric.value), countryId + ' metric must remain numeric');
        assert.ok(Number.isInteger(metric.year), countryId + ' source observation year is required');
      }
    }
    assert.ok(['HIGH','MODERATE','LOW','NOT_COMPARABLE'].includes(context.manufacturingBand), countryId);
    assert.equal(row.totalStartingFactoryUnits,
      Object.values(row.factoryCounts).reduce((sum, count) => sum + count, 0), countryId);
    if (row.specializations.length) {
      assert.equal(row.specializationEvidenceStatus, 'GAME_MODELLED_SPECIALIZATION_SET');
      assert.equal(row.industryArchetype, baseline.countries[countryId].industryArchetype,
        countryId + ' existing specialized archetype must be preserved');
    } else {
      assert.equal(row.specializationEvidenceStatus, 'NO_SUBSECTOR_SPECIALIZATION_EVIDENCE');
      assert.equal(row.industryArchetypeBasis, 'WORLD_BANK_VALUE_ADDED_MIX_V1');
    }
  }
});

test('country archetypes respond to observed economic structure without inventing a factory specialization', () => {
  const enriched = enrichCountryFactoryStartingBaseline(structuredClone(baseline), registry);
  assert.equal(enriched.countries.GUY.industryArchetype, 'Industry-led resource and extractive economy');
  assert.equal(enriched.countries.GUY.economicSectorContext.dominantSector, 'INDUSTRY');
  assert.equal(enriched.countries.LBY.industryArchetype, 'Industry-led resource and extractive economy',
    'older manufacturing observations must not be compared as if contemporaneous');
  assert.equal(enriched.countries.GNB.industryArchetype, 'Agriculture-led economy');
  assert.equal(enriched.countries.MMR.industryArchetype, 'Industry-led economy with a manufacturing base');
  assert.equal(enriched.countries.SOM.economicSectorContext.dominantSector, null,
    'mixed observation years must not produce a false dominant-sector conclusion');
  assert.equal(enriched.countries.SOM.industryArchetype, 'Insufficient comparable sector data');
  assert.equal(enriched.countries.ESH.industryArchetype, 'Insufficient comparable sector data');
  assert.deepEqual(enriched.countries.GUY.specializations, baseline.countries.GUY.specializations,
    'macro evidence must never invent a specific factory type');
});

test('alignment enrichment is idempotent and does not change simulation factory counts', () => {
  const first = enrichCountryFactoryStartingBaseline(structuredClone(baseline), registry);
  const second = enrichCountryFactoryStartingBaseline(structuredClone(first), registry);
  assert.deepEqual(second, first);
  for (const countryId of Object.keys(baseline.countries)) {
    assert.deepEqual(first.countries[countryId].factoryCounts, baseline.countries[countryId].factoryCounts);
    assert.deepEqual(first.countries[countryId].specializations, baseline.countries[countryId].specializations);
    assert.equal(first.countries[countryId].totalStartingFactoryUnits, baseline.countries[countryId].totalStartingFactoryUnits);
  }
});
