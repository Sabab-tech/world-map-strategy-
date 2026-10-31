import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const baseline = read('country_factory_starting_baseline_v1.json');
const catalog = read('resource_industrial_catalog_v1.json');
const countries = Object.entries(baseline.countries || {});
const canonicalFactoryTypeIds = Object.keys(catalog.factoryProfiles || {}).sort();
const broadArchetypes = new Set([
  'Agriculture-led economy',
  'Industry-led economy with a manufacturing base',
  'Industry-led resource and extractive economy',
  'Services-led economy with a manufacturing base',
  'Services-led mixed economy',
  'Insufficient comparable sector data'
]);

test('all 197 core countries have a complete, reconciled 21-type simulation factory profile', () => {
  assert.equal(baseline.countryCount, 197);
  assert.equal(countries.length, 197);
  assert.equal(baseline.factoryTypeCount, 21);
  assert.equal(baseline.factoryTypes.length, 21);
  assert.equal(canonicalFactoryTypeIds.length, 21);
  assert.deepEqual(
    baseline.factoryTypes.map(row => row.id).sort(),
    canonicalFactoryTypeIds,
    'the starting profile and runtime catalog must use the same canonical factory-type roster'
  );

  for (const [countryId, row] of countries) {
    assert.equal(row.countryId, countryId, countryId + ' country key must match the row identity');
    assert.equal(row.factoryCounts && Object.keys(row.factoryCounts).length, 21,
      countryId + ' must define every canonical factory type');
    assert.deepEqual(Object.keys(row.factoryCounts).sort(), canonicalFactoryTypeIds,
      countryId + ' factory counts must use only canonical catalog IDs');

    let total = 0;
    for (const typeId of canonicalFactoryTypeIds) {
      const count = row.factoryCounts[typeId];
      assert.ok(Number.isInteger(count) && count >= 0,
        countryId + '/' + typeId + ' must be a non-negative integer simulation count');
      total += count;
    }
    assert.equal(row.totalStartingFactoryUnits, total,
      countryId + ' total starting units must reconcile with all 21 type counts');
    assert.ok(total > 0, countryId + ' must have a usable game-scale starting industrial profile');

    assert.equal(row.provenance && row.provenance.simulationOnly, true,
      countryId + ' starting counts must remain explicitly simulation-only');
    assert.equal(row.provenance && row.provenance.realWorldFacilityCounts, false,
      countryId + ' starting counts must never be presented as a real-world facility census');
    assert.ok(row.industryArchetype && typeof row.industryArchetype === 'string',
      countryId + ' needs an industry archetype');
    assert.ok(row.economicSectorContext &&
      row.economicSectorContext.schemaVersion === 'OMEGA_COUNTRY_ECONOMIC_SECTOR_CONTEXT_V1',
      countryId + ' needs source-aware economic-sector context');
  }
});

test('every country-specific factory specialization resolves to a real catalog type with a positive allocation', () => {
  for (const [countryId, row] of countries) {
    const specializations = Array.isArray(row.specializations) ? row.specializations : [];
    assert.equal(new Set(specializations).size, specializations.length,
      countryId + ' specialization IDs must not be duplicated');

    for (const typeId of specializations) {
      assert.ok(canonicalFactoryTypeIds.includes(typeId),
        countryId + ' specialization must resolve to a canonical factory type: ' + typeId);
      assert.ok(row.factoryCounts[typeId] > 0,
        countryId + ' specialization must have a positive starting allocation: ' + typeId);
    }

    if (specializations.length) {
      assert.equal(row.specializationEvidenceStatus, 'GAME_MODELLED_SPECIALIZATION_SET', countryId);
      assert.ok([
        'EXPLICIT_GAME_SPECIALIZATION_SET_V1',
        'EXISTING_GAME_SPECIALIZATION_PROFILE_V1'
      ].includes(row.industryArchetypeBasis), countryId + ' specialization archetype needs an explicit game-profile basis');
    } else {
      assert.equal(row.specializationEvidenceStatus, 'NO_SUBSECTOR_SPECIALIZATION_EVIDENCE', countryId);
      assert.equal(row.industryArchetypeBasis, 'WORLD_BANK_VALUE_ADDED_MIX_V1', countryId);
      assert.ok(broadArchetypes.has(row.industryArchetype),
        countryId + ' without sub-sector evidence must use a cautious broad macro-sector archetype');
    }
  }
});

test('starting allocations are a static new-game reference, not live commissioned assets or observed factory counts', () => {
  assert.equal(baseline.model && baseline.model.authority,
    'SIMULATED_COUNTRY_STARTING_INDUSTRY_PROFILE_V1');
  assert.equal(baseline.model && baseline.model.simulationOnly, true);
  assert.equal(baseline.model && baseline.model.realWorldFacilityCounts, false);
  assert.ok((baseline.model.principles || []).some(value => /later player construction\/upgrades are tracked separately/i.test(value)),
    'player-built assets must be tracked by runtime state, not added to the immutable starting allocation');
});
