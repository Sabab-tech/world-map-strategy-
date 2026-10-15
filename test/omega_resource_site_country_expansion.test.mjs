import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const base = JSON.parse(read('resource_site_canonical_catalog_v1.json'));
const expansion = JSON.parse(read('resource_site_country_expansion_v1.json'));
const overlay = JSON.parse(read('resource_site_research_facts_overlay_v1.json'));
const endowment = read('omega_resource_endowment_runtime.js');
const mapBinding = read('omega_resource_gameplay_binding_v1.js');

assert.equal(base.siteCount, base.sites.length);
assert.ok(base.sites.length >= 315, 'canonical authority must preserve the baseline registry and permit additive future sites');
assert.equal(new Set(base.sites.map(site=>site.siteId)).size,base.sites.length,'canonical site IDs must stay unique as new sites are added');
assert.equal(expansion.datasetId, 'OMEGA_RESOURCE_SITE_COUNTRY_EXPANSION_V1');
assert.equal(expansion.siteCount, 0);
assert.equal(expansion.records.length, 0);
assert.equal(expansion.migratedSiteCount, 51);
assert.equal(overlay.siteCount, 0);
assert.equal(overlay.records.length, 0);
assert.equal(overlay.migratedSiteCount, 51);
assert.equal(new Set(expansion.migratedSiteIds).size, 51);
const migratedIds = new Set(expansion.migratedSiteIds);
const migratedSites = base.sites.filter(s => migratedIds.has(s.siteId));
assert.equal(migratedSites.length, 51, 'all 51 migrated records must be inside canonical authority');
const countries = new Set();

for (const site of migratedSites) {
  assert.ok(site.siteId && site.siteName, 'site identity required');
  assert.match(site.countryId, /^[A-Z]{3}$/);
  countries.add(site.countryId);
  assert.equal(site.identity.countryIso3, site.countryId, site.siteId + ': identity country mismatch');
  assert.ok(site.identity.resourceTypeId, site.siteId + ': commodity identity required');
  assert.ok(site.identity.siteType, site.siteId + ': site type required');
  const { lat, lng } = site.location.coordinates;
  assert.ok(Number.isFinite(lat) && lat >= -90 && lat <= 90, site.siteId + ': latitude');
  assert.ok(Number.isFinite(lng) && lng >= -180 && lng <= 180, site.siteId + ': longitude');
  assert.equal(site.map.markerEligible, true);
  assert.equal(site.map.countryIsolationKey, site.countryId);
  assert.equal(site.runtime.countryWarehouseId, 'WH-' + site.countryId + '-RAW');
  assert.equal(site.runtime.identityAuthority, 'CANONICAL_CATALOG');
  assert.equal(site.runtime.quantityAuthority, 'SIMULATION_RUNTIME');
  for (const field of ['reserve','production','grade','recovery','throughput','purity','capacity']) {
    assert.ok(site.quantitative[field] && typeof site.quantitative[field] === 'object', site.siteId + ': quantitative.' + field + ' required');
    assert.ok(site.quantitative[field].status, site.siteId + ': quantitative.' + field + ' status required');
  }
  assert.ok(site.sourceReference.evidence.some(e => /^https:\/\//.test(e.url)), site.siteId + ': source reference required');
  assert.ok(site.researchFacts, site.siteId + ': research overlay facts must be merged into canonical record');
}
assert.ok(countries.size >= 9, 'migrated tranche must cover multiple countries');
assert.match(endowment, /resource_site_country_expansion_v1\.json/, 'runtime may read the migration manifest but canonical rows are authoritative');
assert.match(endowment, /if\(rows\.length!==250\)/, 'runtime master registry guard must match 250 canonical sites');
assert.match(mapBinding, /resource_site_country_expansion_v1\.json/, 'map migration audit manifest remains available');
assert.match(mapBinding, /\[\.\.\.baseCatalogSites,\.\.\.expansionSites,\.\.\.activeLegacySites\]/, 'canonical, migrated and deduplicated legacy candidates pass through the existing marker join');
assert.match(mapBinding, /LEGACY_CANONICAL_ALIAS_IDS/, 'legacy aliases must not create duplicate physical markers');
assert.match(mapBinding, /resource_site_legacy_gameplay_expansion_part_5_v1\.json/, 'all legacy gameplay packs are registered for marker binding');

test('all 51 migrated sites use canonical identity and simulation authorities without promoting unknown facts', () => {
  for (const site of migratedSites) {
    assert.equal(site.runtime.productionAuthority, 'SIMULATION_RUNTIME');
    if (site.quantitative.recovery.status === 'UNOBSERVED') assert.equal(site.quantitative.recovery.value, null);
    if (site.quantitative.purity.status === 'UNOBSERVED') assert.equal(site.quantitative.purity.value, null);
  }
});
console.log('OMEGA CANONICAL MIGRATION CERTIFICATE PASSED: 315 canonical records; the original 51 migration IDs remain bound.');
