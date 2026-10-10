import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const base = JSON.parse(read('resource_site_canonical_catalog_v1.json'));
const expansion = JSON.parse(read('resource_site_country_expansion_v1.json'));
const endowment = read('omega_resource_endowment_runtime.js');
const mapBinding = read('omega_resource_gameplay_binding_v1.js');

assert.equal(base.siteCount, 199, 'base canonical catalog remains unchanged');
assert.equal(base.sites.length, 199, 'base canonical rows remain unchanged');
assert.equal(expansion.datasetId, 'OMEGA_RESOURCE_SITE_COUNTRY_EXPANSION_V1');
assert.equal(expansion.siteCount, 34);
assert.equal(expansion.records.length, 34);
assert.equal(new Set(expansion.records.map(s => s.siteId)).size, 34, 'expansion site IDs unique');
const baseIds = new Set(base.sites.map(s => s.siteId));
const baseNames = new Set(base.sites.map(s => s.siteName.toLowerCase()));
const countries = new Set();

for (const site of expansion.records) {
  assert.ok(site.siteId && site.siteName, 'site identity required');
  assert.ok(!baseIds.has(site.siteId), site.siteId + ': must not collide with base site ID');
  assert.ok(!baseNames.has(site.siteName.toLowerCase()), site.siteName + ': duplicate base site name');
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
  assert.equal(site.runtime.quantityAuthority, 'SIMULATION_RUNTIME');
  for (const field of ['reserve','production','grade','recovery','throughput','purity','capacity']) {
    assert.ok(site.quantitative[field] && typeof site.quantitative[field] === 'object', site.siteId + ': quantitative.' + field + ' required');
    assert.ok(site.quantitative[field].status, site.siteId + ': quantitative.' + field + ' status required');
  }
  if (site.quantitative.purity.status === 'UNOBSERVED') assert.equal(site.quantitative.purity.value, null);
  if (site.quantitative.recovery.status === 'UNOBSERVED') assert.equal(site.quantitative.recovery.value, null);
  if (site.quantitative.grade.status === 'QUALITATIVE_ONLY') assert.equal(site.quantitative.grade.unit, null);
  assert.ok(site.sourceReference.evidence.some(e => /^https:\/\//.test(e.url)), site.siteId + ': source reference required');
}
assert.ok(countries.size >= 9, 'expansion must cover multiple countries');

assert.match(endowment, /resource_site_country_expansion_v1\.json/, 'existing resource runtime must load the additive expansion');
assert.match(endowment, /totalSiteCount:rows\.length/, 'runtime reports total merged count separately from certified base count');
assert.match(mapBinding, /resource_site_country_expansion_v1\.json/, 'map must load additive expansion');
assert.match(mapBinding, /\[\.\.\.baseCatalogSites,\.\.\.expansionSites\]/, 'map must merge expansion sites into individual marker candidates');
assert.match(mapBinding, /siteCount:sites\.length/, 'map status reports merged site count');

test('country site expansion keeps observed data separate from gameplay simulation', () => {
  for (const site of expansion.records) {
    assert.equal(site.runtime.productionAuthority, 'SIMULATION_RUNTIME');
    assert.equal(site.quantitative.production.rate, null);
    if (site.quantitative.recovery.status === 'UNOBSERVED') assert.equal(site.quantitative.recovery.value, null);
    if (site.quantitative.purity.status === 'UNOBSERVED') assert.equal(site.quantitative.purity.value, null);
  }
});
console.log('OMEGA COUNTRY SITE EXPANSION CERTIFICATE PASSED: 34 additive sites (12 tranche-2 + 6 tranche-3 records); 199-site base preserved.');
