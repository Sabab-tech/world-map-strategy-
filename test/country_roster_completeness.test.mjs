import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import '../omega_universal_entity_identity_engine.js';
import '../omega_country_semantic_bridge.js';
import '../omega_ai_context_bridge.js';

const rows = JSON.parse(await fs.readFile(new URL('../countries.json', import.meta.url), 'utf8'));
assert.ok(Array.isArray(rows), 'countries.json must be an array');
assert.equal(rows.length, 249, 'canonical roster must contain the complete ISO 3166-1 alpha-2 set');
assert.equal(new Set(rows.map(x => x.code)).size, 249, 'country alpha-2 codes must be unique');
assert.equal(new Set(rows.map(x => x.iso3)).size, 249, 'country alpha-3 codes must be unique');
assert.ok(rows.every(x => /^[A-Z]{2}$/.test(String(x.code))), 'every country needs a valid alpha-2 code');
assert.ok(rows.every(x => /^[A-Z]{3}$/.test(String(x.iso3))), 'every country needs a valid alpha-3 code');

const bridge = globalThis.OmegaCanonicalIdentityRegistry || globalThis.OmegaCountrySemanticBridge;
assert.ok(bridge?.init && bridge?.resolveCountry, 'canonical country identity bridge must be available');
assert.equal(await bridge.init(), true, 'canonical country bridge must initialize');

const failures = [];
for (const row of rows) {
  const byName = bridge.resolveCountry(row.name);
  if (!byName?.id || String(byName.id).toUpperCase() !== String(row.code).toUpperCase()) {
    failures.push({ stage: 'NAME', name: row.name, expected: row.code, actual: byName?.id || null });
  }
  const byCode = bridge.resolveCountry(row.code);
  if (!byCode?.id || String(byCode.id).toUpperCase() !== String(row.code).toUpperCase()) {
    failures.push({ stage: 'CODE', name: row.name, expected: row.code, actual: byCode?.id || null });
  }
  const universal = globalThis.OmegaUniversalEntityIdentityEngine || globalThis.OmegaUnifiedIdentity;
  const hit = universal?.resolve?.(row.name, 'COUNTRY');
  if (!hit?.id || String(hit.id).toUpperCase() !== String(row.code).toUpperCase()) {
    failures.push({ stage: 'UNIVERSAL', name: row.name, expected: row.code, actual: hit?.id || null });
  }
  if (failures.length > 10) break;
}
assert.deepEqual(failures, [], 'every canonical country must resolve consistently');

const canonical = globalThis.OmegaCanonicalIdentityRegistry.diagnostics();
assert.equal(canonical.countryCount, 249, 'canonical country registry must expose all 249 identities');

console.log('OMEGA CANONICAL COUNTRY ROSTER TEST: PASS');
console.log('Canonical ISO 3166-1 identities:', rows.length);
console.log('Unique alpha-2 / alpha-3 IDs: PASS');
console.log('Name -> country ID resolution: PASS');
console.log('Code -> country ID resolution: PASS');
console.log('Universal identity -> country ID resolution: PASS');
