import assert from 'node:assert/strict';
import '../omega_universal_entity_identity_engine.js';
import '../opponent_country_rules.js';
import '../offline_query_engine.js';

const identity = globalThis.OmegaUniversalEntityIdentityEngine;
assert.ok(identity, 'universal identity engine must load');

identity.reset();

const countries = Array.from({ length: 250 }, (_, i) => {
  const n = String(i + 1).padStart(3, '0');
  return {
    id: 'T' + n,
    code: 'T' + n,
    name: 'Testland ' + n
  };
});

for (const row of countries) {
  const hit = identity.registerCanonical('COUNTRY', row.id, row, [row.id, row.code, row.name]);
  assert.equal(hit.id, row.id);
}

const futureDataset = Object.fromEntries(
  countries.slice(0, 3).map(row => [row.name, {
    nation_ref: row.name,
    mine_id: 'MINE-' + row.id,
    industrial_output: 100 + row.id.length,
    installed_capacity: 200,
    location: row.name + ' Industrial Zone'
  }])
);

const ingested = identity.ingestDataset('future_industry.json', futureDataset);
assert.equal(ingested.schema.authority, 'HEURISTIC_SCHEMA_DISCOVERY');
assert.ok(ingested.schema.identityFields.includes('nation_ref'));
assert.ok(ingested.schema.entityTypes.includes('COUNTRY'));
assert.ok(ingested.schema.entityTypes.includes('MINE'));
assert.ok(ingested.schema.fieldCandidates.OUTPUT.some(x => x.key === 'industrial_output'));
assert.ok(ingested.schema.fieldCandidates.CAPACITY.some(x => x.key === 'installed_capacity'));

const selected = identity.select('Testland 002', 'COUNTRY');
assert.ok(selected.length > 0);
assert.equal(selected[0].id, 'T002');

const resolved = identity.resolve('Testland 002', 'COUNTRY');
assert.equal(resolved.status, 'RESOLVED');
assert.equal(resolved.id, 'T002');

const lookup = identity.lookupId('T002', 'COUNTRY');
assert.equal(lookup.status, 'RESOLVED');
assert.ok(lookup.matches.length > 0);

const records = identity.findRecords('T002', 'COUNTRY', { dataset: 'future_industry.json' });
assert.equal(records.status, 'RESOLVED');
assert.equal(records.records.length, 1);
assert.equal(records.records[0].value.nation_ref, 'Testland 002');

const unknown = identity.resolve('Neverland 999', 'COUNTRY');
assert.equal(unknown.status, 'IDENTITY_NOT_FOUND');
assert.equal(unknown.id, null);


const core = globalThis.OfflineQueryEngine;
assert.ok(core, 'Deep Core must expose the unified repository selector');

const coreDataset = {
  "Testland 002": {
    nation_ref: "Testland 002",
    industrial_output: 123,
    installed_capacity: 240
  },
  "Neverland 999": {
    nation_ref: "Neverland 999",
    industrial_output: 500,
    installed_capacity: 700
  }
};
core.registerDataset('future_metrics.json', coreDataset, {
  entityTypes: ['COUNTRY'],
  identityFields: ['nation_ref'],
  capabilities: ['OUTPUT', 'CAPACITY'],
  fieldMappings: {
    OUTPUT: { valuePath: 'industrial_output' },
    CAPACITY: { valuePath: 'installed_capacity' }
  }
});

const coreSelection = core.select('Testland 002', 'COUNTRY');
assert.equal(coreSelection.status, 'RESOLVED');
assert.equal(coreSelection.candidates[0].id, 'T002');

const coreResolved = core.resolve({ id: 'T002', type: 'COUNTRY' });
assert.equal(coreResolved.status, 'RESOLVED');
assert.equal(coreResolved.id, 'T002');

const coreUnknown = core.resolve({ id: 'Neverland 999', type: 'COUNTRY' });
assert.notEqual(coreUnknown.status, 'RESOLVED');
assert.equal(coreUnknown.id, null);

const opponent = globalThis.Omega.OpponentCountryRules;
opponent.setDataset('countries', countries);
const listed = await opponent.listCountryIds();
assert.equal(listed.length, 250);

const runtime = opponent.instance;
const originalEvaluate = runtime.evaluate;
const calls = [];
runtime.evaluate = async (countryId, turn) => {
  calls.push({ countryId, turn });
  return { status: 'COMPLETE', countryId, turn, decisions: [] };
};

try {
  const batch = await opponent.evaluateAllCountries(17, { excludePlayer: false, queue: false });
  assert.equal(batch.status, 'COMPLETE');
  assert.equal(batch.totalCountries, 250);
  assert.equal(batch.evaluated, 250);
  assert.equal(calls.length, 250);
  assert.equal(new Set(calls.map(x => x.countryId)).size, 250);
  assert.deepEqual(calls.map(x => x.countryId), listed);
} finally {
  runtime.evaluate = originalEvaluate;
}

console.log('OMEGA UNIVERSAL ENTITY ARCHITECTURE TEST: PASS');
console.log('Canonical country entities tested:', countries.length);
console.log('Future-dataset heuristic discovery: PASS');
console.log('Universal ID selector / resolver / record linker: PASS');
console.log('Single runtime multi-country dispatcher:', calls.length, 'countries');
