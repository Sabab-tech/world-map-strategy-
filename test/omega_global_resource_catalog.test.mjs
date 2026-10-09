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
  assert.equal(catalog.unresolvedIdentityCount, catalog.sites.filter(site => !site.countryId).length);
  assert.equal(catalog.unresolvedCoordinateCount, catalog.sites.filter(site => !site.coordinates).length);
  assert.equal(catalog.rejected.coordinates, 0, 'coordinate gaps must be preserved as unresolved records rather than discarded');
  assert.equal(catalog.rejected.countryIdentity, 0, 'country gaps must be preserved as unresolved records rather than discarded');
  for (const site of catalog.sites) {
    assert.ok(site.siteId && site.siteName, 'each deposit needs a stable source identity and site name');
    assert.ok(site.identity?.resourceTypeId, site.siteId+' must have a commodity identity');
    assert.equal(site.identity.countryAssignmentStatus, site.countryId ? 'IDENTIFIED' : 'UNRESOLVED_COUNTRY_IDENTITY');
    if (site.coordinates) {
      assert.ok(Number.isFinite(site.coordinates.lat) && Number.isFinite(site.coordinates.lng), site.siteId+' must have valid coordinates');
      assert.ok(site.coordinates.lat >= -90 && site.coordinates.lat <= 90 && site.coordinates.lng >= -180 && site.coordinates.lng <= 180, site.siteId+' coordinate range');
    } else {
      assert.equal(site.location?.coordinateStatus, 'MISSING_UPSTREAM_COORDINATES');
      assert.match(site.operation?.extractionEligibility || '', /BLOCKED_MISSING_COORDINATES|BLOCKED_UNRESOLVED_COUNTRY_IDENTITY/);
    }
    if (!site.countryId) assert.equal(site.operation?.extractionEligibility, 'BLOCKED_UNRESOLVED_COUNTRY_IDENTITY');
    assert.equal(site.operation?.commercialExtraction, false, 'historical mineral occurrences must not be promoted to executable mines');
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
  assert.equal(catalog.rejected.siteRecords, 0, 'energy/coal source rows must be preserved, not dropped due to missing country/coordinates');
  assert.equal(catalog.unresolvedCounts.siteRecordsWithoutCountry, catalog.sites.filter(site => !site.countryId).length);
  assert.equal(catalog.unresolvedCounts.siteRecordsWithoutCoordinates, catalog.sites.filter(site => !site.coordinates).length);
  for (const site of catalog.sites) {
    assert.ok(site.siteId && site.siteName && site.identity?.resourceTypeId);
    assert.equal(site.identity.countryAssignmentStatus, site.countryId ? 'IDENTIFIED' : 'UNRESOLVED_COUNTRY_IDENTITY');
    if (site.coordinates) {
      assert.ok(Number.isFinite(site.coordinates.lat) && Number.isFinite(site.coordinates.lng));
      assert.ok(site.coordinates.lat >= -90 && site.coordinates.lat <= 90 && site.coordinates.lng >= -180 && site.coordinates.lng <= 180);
      assert.equal(site.operation?.extractionEligibility, 'REQUIRES_EXACT_GAME_SITE_BINDING');
    } else {
      assert.equal(site.location?.coordinateStatus, 'MISSING_UPSTREAM_COORDINATES');
      assert.equal(site.operation?.commercialExtraction, false, 'unlocated site must not run as an executable extraction point');
      assert.equal(site.operation?.extractionEligibility, 'BLOCKED_MISSING_COORDINATES');
    }
    if (!site.countryId) {
      assert.equal(site.operation?.commercialExtraction, false);
      assert.equal(site.operation?.extractionEligibility, 'BLOCKED_UNRESOLVED_COUNTRY_IDENTITY');
    }
  }
});

test('resource map loads global catalogs and wires them into the execution pipeline', () => {
  const binding = read('omega_resource_gameplay_binding_v1.js');
  const endowment = read('omega_resource_endowment_runtime.js');
  const industrial = read('omega_resource_industrial_network_v1.js');
  assert.match(endowment, /registerSupplementalSiteCatalog/);
  assert.match(endowment, /supplementalSiteCatalogByCountry/);
  assert.match(industrial, /IndividualResourceSiteBinding/);
  assert.match(binding, /registerSupplementalSiteCatalog/);
  assert.match(binding, /__OMEGA_GLOBAL_RESOURCE_PIPELINE_DIAGNOSTICS__/);
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
