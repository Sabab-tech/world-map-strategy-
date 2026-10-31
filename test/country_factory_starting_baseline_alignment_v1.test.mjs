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
      if (baseline.countries[countryId].industryArchetype === 'Resource processing base') {
        assert.notEqual(row.industryArchetype, 'Resource processing base',
          countryId + ' explicit factory specialization must not keep a generic archetype');
        assert.equal(row.industryArchetypeBasis, 'EXPLICIT_GAME_SPECIALIZATION_SET_V1');
      } else {
        assert.equal(row.industryArchetype, baseline.countries[countryId].industryArchetype,
          countryId + ' existing specific archetype must be preserved');
      }
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
  assert.equal(enriched.countries.MMR.industryArchetype, 'Services-led economy with a manufacturing base');
  assert.equal(enriched.countries.SOM.economicSectorContext.dominantSector, null,
    'mixed observation years must not produce a false dominant-sector conclusion');
  assert.equal(enriched.countries.SOM.industryArchetype, 'Insufficient comparable sector data');
  assert.equal(enriched.countries.ESH.industryArchetype, 'Insufficient comparable sector data');
  assert.equal(enriched.countries.AGO.industryArchetype, 'Energy and petrochemicals');
  assert.equal(enriched.countries.AUT.industryArchetype, 'Industrial machinery and capital goods');
  assert.equal(enriched.countries.BEL.industryArchetype, 'Pharmaceuticals and medical supplies');
  assert.equal(enriched.countries.CIV.industryArchetype, 'Food processing');
  assert.equal(enriched.countries.ZMB.industryArchetype, 'Non-ferrous metals');
  assert.equal(enriched.countries.TWN.industryArchetype, 'Electronics and semiconductor manufacturing');
  assert.equal(enriched.countries.SGP.industryArchetype, 'Advanced manufacturing and industrial logistics');

  const venezuela = enriched.countries.VEN;
  assert.equal(venezuela.economicSectorContext.comparisonStatus, 'INSUFFICIENT_COMPARABLE_DATA',
    'an all-zero agriculture/industry/services source set must not be labelled as a mixed economy');
  assert.equal(venezuela.economicSectorContext.comparisonYear, null);
  assert.equal(venezuela.economicSectorContext.dominantSector, null);
  assert.equal(venezuela.economicSectorContext.availableSectorCount, 0);
  assert.equal(venezuela.economicSectorContext.manufacturingBand, 'NOT_COMPARABLE');
  assert.equal(venezuela.economicSectorContext.valueAddedShares.industryValueAddedPctGdp.value, 0,
    'the raw World Bank observation must remain available for traceability');
  assert.equal(venezuela.economicSectorContext.valueAddedShares.industryValueAddedPctGdp.year, 2011,
    'the original observation year must not be rewritten');
  assert.equal(venezuela.industryArchetype, 'Energy and petrochemicals',
    'an existing explicit game specialization must survive a non-comparable macro profile');
  assert.equal(venezuela.industryArchetypeObservationYear, null);

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

test('source-backed country industry corrections map documented sectors to canonical factory specializations', () => {
  const enriched = enrichCountryFactoryStartingBaseline(structuredClone(baseline), registry);
  const expected = {
    BLR: {
      archetype: 'Machinery, electronics and chemical manufacturing',
      types: [
        'INDUSTRIAL_MACHINERY_MACHINE_TOOLS',
        'ELECTRONICS_SEMICONDUCTOR_FAB',
        'VEHICLE_TRUCK_BUS_ASSEMBLY',
        'STEEL_AND_ALLOY_WORKS',
        'PETROCHEMICAL_POLYMER_PLANT',
        'FERTILIZER_CHEMICAL_PLANT',
        'FOOD_PROCESSING_COLD_CHAIN',
        'TEXTILE_GARMENT_MILL',
        'PHARMA_MEDICAL_SUPPLIES_PLANT'
      ]
    },
    LIE: {
      archetype: 'Precision machinery and dental manufacturing',
      types: [
        'INDUSTRIAL_MACHINERY_MACHINE_TOOLS',
        'PHARMA_MEDICAL_SUPPLIES_PLANT',
        'FOOD_PROCESSING_COLD_CHAIN'
      ]
    },
    GAB: {
      archetype: 'Manganese, agro-processing and building materials',
      types: [
        'NON_FERROUS_METAL_SMELTER',
        'INDUSTRIAL_CHEMICALS_GAS_PLANT',
        'CEMENT_CONCRETE_PLANT',
        'FOOD_PROCESSING_COLD_CHAIN'
      ]
    },
    SWZ: {
      archetype: 'Textiles, agro-processing and wood-pulp manufacturing',
      types: [
        'TEXTILE_GARMENT_MILL',
        'FOOD_PROCESSING_COLD_CHAIN',
        'PAPER_PACKAGING_MILL',
        'PETROCHEMICAL_POLYMER_PLANT'
      ]
    },
    IRQ: {
      archetype: 'Engineering, petrochemicals and consumer manufacturing',
      types: [
        'INDUSTRIAL_MACHINERY_MACHINE_TOOLS',
        'PETROCHEMICAL_POLYMER_PLANT',
        'FERTILIZER_CHEMICAL_PLANT',
        'INDUSTRIAL_CHEMICALS_GAS_PLANT',
        'TEXTILE_GARMENT_MILL',
        'VEHICLE_TRUCK_BUS_ASSEMBLY',
        'PHARMA_MEDICAL_SUPPLIES_PLANT',
        'FOOD_PROCESSING_COLD_CHAIN',
        'CEMENT_CONCRETE_PLANT'
      ]
    },
    SVN: {
      archetype: 'Pharmaceuticals, vehicles and precision engineering',
      types: [
        'PHARMA_MEDICAL_SUPPLIES_PLANT',
        'VEHICLE_TRUCK_BUS_ASSEMBLY',
        'GRID_EQUIPMENT_FACTORY',
        'INDUSTRIAL_MACHINERY_MACHINE_TOOLS',
        'STEEL_AND_ALLOY_WORKS'
      ]
    },
    HTI: {
      archetype: 'Textile and garment manufacturing under disruption',
      types: ['TEXTILE_GARMENT_MILL']
    }
  };

  for (const [countryId, expectation] of Object.entries(expected)) {
    const row = enriched.countries[countryId];
    assert.ok(row, countryId + ' country profile must exist');
    assert.equal(row.industryArchetype, expectation.archetype, countryId + ' archetype must reflect documented industry');
    assert.deepEqual([...row.specializations].sort(), [...expectation.types].sort(),
      countryId + ' specializations must match the evidence-backed type set');
    assert.equal(row.specializationEvidenceStatus, 'GAME_MODELLED_SPECIALIZATION_SET');
    assert.equal(row.specializationEvidence.schemaVersion, 'OMEGA_COUNTRY_FACTORY_SPECIALIZATION_EVIDENCE_V1');
    assert.equal(row.specializationEvidence.status, 'SOURCE_BACKED_SIMULATION_MAPPING');
    assert.equal(row.specializationEvidence.accessDate, '2026-10-31');
    assert.ok(Array.isArray(row.specializationEvidence.sources) && row.specializationEvidence.sources.length > 0);
    assert.ok(row.specializationEvidence.sources.every(source => /^https:\/\//.test(source.url)),
      countryId + ' source evidence must use traceable HTTPS URLs');
    for (const type of expectation.types) {
      assert.ok(row.factoryCounts[type] >= 1, countryId + ' must allocate a positive game unit to ' + type);
    }
    assert.equal(row.totalStartingFactoryUnits,
      Object.values(row.factoryCounts).reduce((sum, count) => sum + count, 0),
      countryId + ' allocation total must reconcile');
    assert.equal(row.provenance.simulationOnly, true);
    assert.equal(row.provenance.realWorldFacilityCounts, false);
  }

  assert.ok(enriched.countries.GAB.specializationEvidence.caveat.includes('planned project'),
    'planned steel capacity must not be represented as an existing Gabonese specialization');
  assert.ok(enriched.countries.IRQ.specializationEvidence.caveat.includes('2015'),
    'the older Iraqi sector inventory must retain its source-age caveat');
  assert.ok(enriched.countries.HTI.specializationEvidence.caveat.includes('contraction'),
    'Haiti’s textile specialization must preserve the reported downturn caveat');
});

