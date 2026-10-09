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

test('global oil/gas field and coal-mine catalog has broad country coverage and unique identities', () => {
  const catalog = JSON.parse(read('resource_site_global_energy_catalog_v1.json'));
  assert.ok(catalog.siteCount > 5000, 'global energy catalog must include field and coal-mine records');
  assert.equal(catalog.siteCount, catalog.sites.length);
  assert.ok(catalog.countriesRepresented >= 50, 'fuel-site data must span many countries');
  assert.ok(catalog.sourceCounts.oilGasRowsExpandedToCommoditySites >= 3000);
  assert.ok(catalog.sourceCounts.coalSourceRows >= 1000);
  const ids = catalog.sites.map(site => site.siteId);
  assert.equal(new Set(ids).size, ids.length, 'energy and coal site IDs must be unique');
  for (const site of catalog.sites) {
    assert.ok(site.countryId && site.siteName && site.identity?.resourceTypeId);
    assert.ok(Number.isFinite(site.coordinates?.lat) && Number.isFinite(site.coordinates?.lng));
    assert.equal(site.operation?.extractionEligibility, 'REQUIRES_EXACT_GAME_SITE_BINDING');
  }
});

test('resource map loads global mineral, energy and coal catalogs and keeps all sites searchable', () => {
  const binding = read('omega_resource_gameplay_binding_v1.js');
  assert.match(binding, /resource_site_global_deposit_catalog_v1\.json/);
  assert.match(binding, /resource_site_global_energy_catalog_v1\.json/);
  assert.match(binding, /globalMineralDepositCount/);
  assert.match(binding, /globalEnergySiteCount/);
  assert.match(binding, /renderSiteSearch/);
  assert.match(binding, /clusterMode=visibleSites\.length>1200/);
  assert.match(binding, /bounds\.contains\(\[lat,lng\]\)/);
  assert.match(binding, /startsWith\('GLOBAL_'\)/);
  assert.match(binding, /btn\.textContent='GLOBAL RESOURCE SITES'/);
  assert.match(binding, /position:fixed;left:12px;bottom:18px;z-index:1000001/);
  assert.match(binding, /id="omega-individual-search" type="search"/);
});
