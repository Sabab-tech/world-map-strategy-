import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const CONTRACT_PATH = new URL('../omega_resource_truth_contract.js', import.meta.url);
const SITE_CATALOG_PATH = new URL('../resource_site_canonical_catalog_v1.json', import.meta.url);
const SCENARIO_PATH = new URL('../resource_site_reserve_simulation_v1.json', import.meta.url);

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(CONTRACT_PATH, 'utf8'), sandbox);

const Truth = sandbox.Omega?.ResourceTruthContract;
assert.ok(Truth, 'Resource Truth Contract unavailable');

const observedGold = {
  value: 100,
  unit: 'TROY_OUNCES',
  measurementBasis: 'MINERAL_RESERVE',
  authority: 'OBSERVED',
  provenance: {
    sourceDatasetId: 'quantitative-research',
    sourceRecordId: 'SITE_A',
    sourceAuthority: 'RESEARCH_EVIDENCE',
    effectiveDate: '2026-01-01'
  }
};

const modeledGold = {
  value: 90,
  unit: 'TROY_OUNCES',
  measurementBasis: 'MINERAL_RESERVE',
  authority: 'MODELED'
};

const simulatedGold = {
  value: 999,
  unit: 'TROY_OUNCES',
  measurementBasis: 'MINERAL_RESERVE',
  authority: 'SIMULATED'
};

const incompatibleObservedGold = {
  value: 12,
  unit: 'BCM',
  measurementBasis: 'ORE_MASS',
  authority: 'OBSERVED',
  provenance: {
    sourceDatasetId: 'resources.json',
    sourceRecordId: 'SITE_BAD',
    sourceAuthority: 'RESOURCE_JSON',
    effectiveDate: '2026-01-01'
  }
};

assert.equal(Truth.VERSION, '1.0.0');
assert.deepEqual(Object.keys(Truth.AUTHORITY).sort(), [
  'MODELED',
  'OBSERVED',
  'SIMULATED',
  'UNOBSERVED'
]);

const unitCases = [
  ['gold', 'TONNES', true],
  ['gold', 'TROY_OUNCES', true],
  ['crude_oil', 'BBL', true],
  ['natural_gas', 'BCM', true],
  ['diamond', 'CARATS', true],
  ['gold', 'BCM', false],
  ['natural_gas', 'TONNES', false]
];
for (const testCase of unitCases) {
  const [resourceId, unit, expected] = testCase;
  assert.equal(
    Truth.compatibleUnit(resourceId, unit),
    expected,
    'unit boundary ' + resourceId + '/' + unit
  );
}

const basisCases = [
  ['gold', 'ORE_MASS', 'MINERAL_RESERVE', false],
  ['gold', 'MINERAL_RESERVE', 'ECONOMIC_RESERVE', true],
  ['crude_oil', 'PETROLEUM_RESERVE', 'FIELD_RESOURCE', true],
  ['gold', 'NOT_A_BASIS', 'MINERAL_RESERVE', false]
];
for (const testCase of basisCases) {
  const [resourceId, left, right, expected] = testCase;
  assert.equal(
    Truth.basisCompatible(resourceId, left, right),
    expected,
    'basis boundary ' + resourceId + '/' + left + '/' + right
  );
}

const measurementCases = [
  [observedGold, true],
  [{ unit: 'TROY_OUNCES', measurementBasis: 'CONTAINED_COMMODITY' }, true],
  [{ unit: 'BCM', measurementBasis: 'ORE_MASS' }, false],
  [{ unit: 'TONNES', measurementBasis: 'NOT_A_BASIS' }, false]
];
for (const testCase of measurementCases) {
  const [candidate, expected] = testCase;
  assert.equal(Truth.measurementCompatible('gold', candidate).ok, expected);
}

assert.equal(
  Truth.chooseCandidate('gold', [simulatedGold]),
  null,
  'SIMULATED data must never become authoritative by default'
);
assert.equal(
  Truth.chooseCandidate('gold', [simulatedGold], { allowSimulated: true })?.authority,
  'SIMULATED'
);

const precedenceCases = [
  {
    name: 'observed dominates modeled and simulated',
    args: { observed: [observedGold], modeled: [modeledGold], scenario: [simulatedGold] },
    authority: 'OBSERVED',
    value: 100,
    status: 'AVAILABLE'
  },
  {
    name: 'modeled is authoritative only when observed is absent',
    args: { observed: [], modeled: [modeledGold], scenario: [simulatedGold] },
    authority: 'MODELED',
    value: 90,
    status: 'AVAILABLE'
  },
  {
    name: 'scenario remains simulation-only',
    args: { observed: [], modeled: [], scenario: [simulatedGold] },
    authority: null,
    value: null,
    status: 'UNOBSERVED'
  }
];

for (const testCase of precedenceCases) {
  const resolved = Truth.resolveReserve('gold', testCase.args);
  assert.equal(
    resolved.authoritative?.authority ?? null,
    testCase.authority,
    testCase.name
  );
  assert.equal(
    resolved.authoritative?.value ?? null,
    testCase.value,
    testCase.name
  );
  assert.equal(resolved.status, testCase.status, testCase.name);
  assert.equal(
    resolved.scenario?.authority ?? null,
    testCase.args.scenario.length ? 'SIMULATED' : null,
    testCase.name
  );
}

const failClosed = Truth.resolveReserve('gold', {
  observed: [incompatibleObservedGold],
  modeled: [modeledGold],
  scenario: [simulatedGold]
});
assert.equal(failClosed.authoritative, null);
assert.equal(failClosed.status, 'INCOMPATIBLE');
assert.equal(failClosed.scenario?.authority, 'SIMULATED');

const multipleObserved = Truth.resolveReserve('gold', {
  observed: [
    observedGold,
    {
      ...observedGold,
      value: 80,
      provenance: { ...observedGold.provenance, sourceRecordId: 'SITE_A_ALT' }
    }
  ],
  modeled: [modeledGold],
  scenario: [simulatedGold]
});
assert.equal(multipleObserved.authoritative?.authority, 'OBSERVED');
assert.equal(multipleObserved.authoritative?.value, 100);

const sanitized = Truth.sanitizeSiteModel({
  commodityStreams: [{
    resourceId: 'gold',
    reserve: {
      quantity: 999,
      unit: 'TROY_OUNCES',
      basis: 'MINERAL_RESERVE',
      authority: 'SIMULATED',
      scenarioRecord: true
    },
    production: {
      observedRate: null,
      activeRate: 10,
      unit: 'TROY_OUNCES'
    }
  }]
}, { siteId: 'SITE_A', countryId: 'TST' });

const stream = sanitized.commodityStreams[0];
assert.equal(stream.reserve.quantity, null);
assert.equal(stream.reserve.authority, 'UNOBSERVED');
assert.equal(stream.reserve.status, 'UNOBSERVED');
assert.equal(stream.reserve.scenario?.value, 999);
assert.equal(stream.reserve.scenario?.authority, 'SIMULATED');
assert.equal(stream.production.currentProduction, null);
assert.equal(stream.production.currentProductionAuthority, 'UNOBSERVED');
assert.equal(stream.production.simulationProduction, 10);
assert.equal(stream.production.simulationProductionAuthority, 'SIMULATED');

assert.deepEqual(
  Truth.siteIdentity({ siteId: 'SITE_A', countryId: 'TST', resourceId: 'gold' }),
  { ok: true, siteId: 'SITE_A', countryId: 'TST', resourceId: 'gold' }
);
assert.equal(Truth.siteIdentity({ siteId: 'SITE_A', countryId: 'TST' }).ok, false);
assert.equal(Truth.siteIdentity({ siteName: 'Same Name', countryId: 'TST', resourceId: 'gold' }).ok, false);

assert.throws(
  () => Truth.assertNoSyntheticAuthority({ authority: 'OBSERVED', simulationGenerated: true }),
  /RESOURCE_TRUTH_SYNTHETIC_MARKED_OBSERVED/
);
assert.equal(
  Truth.assertNoSyntheticAuthority({
    authority: 'SIMULATED',
    provenance: { sourceAuthority: 'SCENARIO_SIMULATION_DATA' }
  }),
  true
);

const siteCatalog = JSON.parse(fs.readFileSync(SITE_CATALOG_PATH, 'utf8'));
const scenarioCatalog = JSON.parse(fs.readFileSync(SCENARIO_PATH, 'utf8'));
assert.equal(siteCatalog.siteCount, 199);
assert.equal(siteCatalog.sites.length, 199);
assert.equal(new Set(siteCatalog.sites.map(site => site.siteId)).size, 199);
assert.equal(scenarioCatalog.siteCount, 199);
assert.equal(scenarioCatalog.records.length, 199);
assert.equal(new Set(scenarioCatalog.records.map(site => site.siteId)).size, 199);
assert.ok(siteCatalog.sites.every(site =>
  site.siteId &&
  site.identity?.countryIso3 &&
  site.identity?.resourceTypeId &&
  site.siteName
));
assert.ok(scenarioCatalog.records.every(site =>
  site.siteId &&
  site.status === 'SIMULATED'
));

console.log('OMEGA RESOURCE TRUTH BOUNDARY REGRESSION PASSED');
console.log('Authority isolation: PASS');
console.log('Observed > modeled > simulation precedence: PASS');
console.log('Scenario-only remains UNOBSERVED: PASS');
console.log('Incompatible observed data fails closed: PASS');
console.log('Measurement unit/basis separation: PASS');
console.log('Simulation isolation in site model: PASS');
console.log('199-site identity boundary: PASS');
