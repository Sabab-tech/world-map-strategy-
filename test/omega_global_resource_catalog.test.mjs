import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const read = path => fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('global mineral catalogue contains many independently identified deposits across countries', () => {
  const catalog = JSON.parse(read('resource_site_global_deposit_catalog_v1.json'));
  const canonical = JSON.parse(read('resource_site_canonical_catalog_v1.json'));
  assert.ok(catalog.siteCount > 1000, 'global importer must not silently ship only the 199-site seed');
  assert.equal(catalog.siteCount, catalog.sites.length, 'declared count must match data rows');
  assert.ok(catalog.countriesRepresented >= 25, 'global data must cover multiple world regions, not only BGD/SAU');
  const ids = catalog.sites.map(site => site.siteId);
  assert.equal(new Set(ids).size, ids.length, 'global site IDs must be unique');
  const knownCountries = new Set(canonical.sites.map(site => site.countryId));
  for (const site of catalog.sites) {
    assert.ok(site.siteId && site.siteName && site.countryId, 'each deposit needs a stable identity and country');
    assert.ok(site.identity?.resourceTypeId, site.siteId+' must have a commodity identity');
    assert.ok(Number.isFinite(site.coordinates?.lat) && Number.isFinite(site.coordinates?.lng), site.siteId+' must have valid coordinates');
    assert.ok(site.coordinates.lat >= -90 && site.coordinates.lat <= 90 && site.coordinates.lng >= -180 && site.coordinates.lng <= 180, site.siteId+' coordinate range');
    assert.equal(site.operation?.commercialExtraction, false, 'historical mineral occurrences must not be promoted to executable mines');
    assert.equal(site.operation?.extractionEligibility, 'REQUIRES_SITE_SPECIFIC_VERIFICATION');
    assert.ok(site.sourceSiteRecord?.sourceDataset, site.siteId+' needs provenance');
  }
  assert.ok(catalog.sites.some(site => knownCountries.has(site.countryId)), 'global and OMEGA country identity systems must interoperate');
});

test('resource map loads the global catalogue and keeps all sites searchable without rendering 89k select options', () => {
  const binding = read('omega_resource_gameplay_binding_v1.js');
  assert.match(binding, /resource_site_global_deposit_catalog_v1\.json/);
  assert.match(binding, /globalMineralDepositCount/);
  assert.match(binding, /renderSiteSearch/);
  assert.match(binding, /clusterMode=visibleSites\.length>1200/);
  assert.match(binding, /bounds\.contains\(\[lat,lng\]\)/);
  assert.match(binding, /GLOBAL_MINERAL_OCCURRENCE/);
});
