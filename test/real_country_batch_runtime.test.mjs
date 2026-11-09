import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import '../omega_universal_entity_identity_engine.js';
await import('../opponent_country_rules.js');
const opponent = globalThis.Omega?.OpponentCountryRules || globalThis.OmegaOpponentCountryRules;
assert.ok(opponent?.instance, 'Opponent country runtime must load');

const countries = JSON.parse(await fs.readFile(new URL('../countries.json', import.meta.url), 'utf8'));
assert.ok(Array.isArray(countries));
assert.equal(countries.length, 249);
const unique = new Set(countries.map(x => x.code));
assert.equal(unique.size, 249);

const runtime = opponent.instance;
opponent.setDataset('countries', countries);

const calls = [];
let active = 0;
let maxActive = 0;
runtime.evaluate = async (countryId, turn) => {
  active++;
  maxActive = Math.max(maxActive, active);
  await new Promise(resolve => setTimeout(resolve, 1));
  calls.push({countryId, turn});
  active--;
  return {status:'COMPLETE', countryId, turn, decisions:[]};
};

const result = await runtime.evaluateAllCountries(2015, {
  excludePlayer:false,
  queue:false,
  concurrency:8,
  forceFull:true
});

assert.equal(result.status, 'COMPLETE');
assert.equal(result.totalCountries, 249);
assert.equal(result.selectedCountries, 249);
assert.equal(result.evaluated, 249);
assert.equal(result.failed, 0);
assert.equal(result.starvationFree, true);
assert.equal(result.concurrency, 8);
assert.equal(calls.length, 249);
assert.equal(new Set(calls.map(x => x.countryId)).size, 249);
assert.ok(maxActive > 1);
assert.ok(maxActive <= 8);

console.log('OMEGA REAL COUNTRY BATCH TEST: PASS');
console.log('Canonical countries:', countries.length);
console.log('Unique evaluated countries:', new Set(calls.map(x => x.countryId)).size);
console.log('Maximum concurrent country tasks:', maxActive);
console.log('Starvation-free same-tick batch:', result.starvationFree);
