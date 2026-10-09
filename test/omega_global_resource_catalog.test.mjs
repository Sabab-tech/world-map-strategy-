import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';

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
  assert.equal(catalog.unresolvedIdentityCount, catalog.sites.filter(site => !site.countryId && site.identity?.countryAssignmentStatus !== 'INTERNATIONAL_WATERS').length, 'international seabed occurrences are jurisdiction-classified, not unresolved country identities');
  assert.equal(catalog.unresolvedCoordinateCount, catalog.sites.filter(site => !site.coordinates).length);
  assert.equal(catalog.rejected.coordinates, 0, 'coordinate gaps must be preserved as unresolved records rather than discarded');
  assert.equal(catalog.rejected.countryIdentity, 0, 'country gaps must be preserved as unresolved records rather than discarded');
  for (const site of catalog.sites) {
    assert.ok(site.siteId && site.siteName, 'each deposit needs a stable source identity and site name');
    assert.ok(site.identity?.resourceTypeId, site.siteId+' must have a commodity identity');
    const internationalWaters = site.identity?.countryAssignmentStatus === 'INTERNATIONAL_WATERS';
    assert.equal(site.identity.countryAssignmentStatus, site.countryId ? 'IDENTIFIED' : (internationalWaters ? 'INTERNATIONAL_WATERS' : 'UNRESOLVED_COUNTRY_IDENTITY'));
    if (site.coordinates) {
      assert.ok(Number.isFinite(site.coordinates.lat) && Number.isFinite(site.coordinates.lng), site.siteId+' must have valid coordinates');
      assert.ok(site.coordinates.lat >= -90 && site.coordinates.lat <= 90 && site.coordinates.lng >= -180 && site.coordinates.lng <= 180, site.siteId+' coordinate range');
    } else {
      assert.equal(site.location?.coordinateStatus, 'MISSING_UPSTREAM_COORDINATES');
      assert.match(site.operation?.extractionEligibility || '', /BLOCKED_MISSING_COORDINATES|BLOCKED_MISSING_COORDINATES|BLOCKED_UNRESOLVED_COUNTRY_IDENTITY|BLOCKED_INCOMPLETE_SOURCE_IDENTITY/);
    }
    if (!site.countryId && internationalWaters) assert.equal(site.operation?.extractionEligibility, 'BLOCKED_INTERNATIONAL_WATERS_NO_SOVEREIGN_GAME_OWNER');
    else if (!site.countryId) assert.equal(site.operation?.extractionEligibility, 'BLOCKED_UNRESOLVED_COUNTRY_IDENTITY');
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
    const internationalWaters = site.identity?.countryAssignmentStatus === 'INTERNATIONAL_WATERS';
    assert.equal(site.identity.countryAssignmentStatus, site.countryId ? 'IDENTIFIED' : (internationalWaters ? 'INTERNATIONAL_WATERS' : 'UNRESOLVED_COUNTRY_IDENTITY'));
    if (!site.countryId && internationalWaters) {
      assert.equal(site.operation?.commercialExtraction, false);
      assert.equal(site.operation?.extractionEligibility, 'BLOCKED_INTERNATIONAL_WATERS_NO_SOVEREIGN_GAME_OWNER');
    } else if (!site.countryId) {
      assert.equal(site.operation?.commercialExtraction, false);
      assert.equal(site.operation?.extractionEligibility, 'BLOCKED_UNRESOLVED_COUNTRY_IDENTITY');
    } else if (!site.coordinates) {
      assert.ok(['MISSING_UPSTREAM_COORDINATES','REJECTED_COUNTRY_GEOMETRY_MISMATCH'].includes(site.location?.coordinateStatus));
      assert.equal(site.operation?.commercialExtraction, false, 'unlocated site must not run as an executable extraction point');
      assert.equal(site.operation?.extractionEligibility, 'BLOCKED_MISSING_COORDINATES');
    } else {
      assert.ok(Number.isFinite(site.coordinates.lat) && Number.isFinite(site.coordinates.lng));
      assert.ok(site.coordinates.lat >= -90 && site.coordinates.lat <= 90 && site.coordinates.lng >= -180 && site.coordinates.lng <= 180);
      if (site.operation?.commercialExtraction === true) assert.equal(site.operation?.extractionEligibility, 'REQUIRES_EXACT_GAME_SITE_BINDING');
      else assert.match(site.operation?.extractionEligibility || '', /REQUIRES_EXACT_GAME_SITE_BINDING|^BLOCKED_/);
    }
  }
});


test('research-backed coal identity overrides resolve known missing country and coordinate fields', () => {
  const catalog = JSON.parse(read('resource_site_global_energy_catalog_v1.json'));
  const key = value => String(value || '').normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toUpperCase();
  const byName = new Map(catalog.sites.map(site => [key(site.siteName), site]));
  for (const [name, countryId] of [
    ['Anglesea Coal Mine', 'AUS'],
    ['Charleston Coal Mine', 'NZL'],
    ['Knox Creek Jawbone Mine', 'USA'],
    ['Mi Viña Coal Mine', 'ESP'],
    ['Santa Maria Coal Mine', 'ESP'],
    ['Sierra de Arcos Coal Mine', 'ESP'],
    ['Panian Coal Mine', 'PHL'],
    ['Sibovc Coal Mine', 'SRB'],
    ['Konyukhtinskaya-South Coal Mine', 'RUS'],
    ['Morningstar', 'USA']
  ]) {
    const site = byName.get(key(name));
    assert.ok(site, 'expected individually identified source site: '+name);
    assert.equal(site.countryId, countryId, name+' must have its researched game-country mapping');
    assert.ok(site.identity?.countryAssignmentMethod, name+' must disclose the assignment method');
  }
  const anglesea = byName.get(key('Anglesea Coal Mine'));
  assert.equal(anglesea.location.coordinateStatus, 'SOURCE_LAT_LON_ORDER_CORRECTED_EXACT', 'preserve the source accuracy while recording the validated latitude/longitude swap');
  assert.ok(Math.abs(anglesea.coordinates.lat - (-38.39175093)) < 0.001);
  assert.equal(catalog.sites.filter(site => key(site.siteName) === key('Anglesea Coal Mine')).length, 1, 'active/closed CSV duplicates must merge into one site identity');
  const miVina = byName.get(key('Mi Viña Coal Mine'));
  assert.equal(miVina.location.coordinateStatus, 'Approximate', 'preserve the source mine point when available');
  assert.ok(Math.abs(miVina.coordinates.lat - 40.8582068657) < 0.001);
  assert.ok((miVina.sourceSiteRecord.additionalCoordinateEvidence || []).some(evidence => evidence.coordinateSourceUrl === 'https://www.boe.es/diario_boe/txt.php?id=BOE-B-2022-37429'), 'official mine-area centroid must remain auditable as alternate coordinate evidence');
  assert.equal(catalog.sites.filter(site => key(site.siteName) === key('Morningstar')).length, 1, 'duplicate name rows must merge after province-based identity resolution');
  assert.equal(catalog.unresolvedCounts.siteRecordsWithoutCountry, 0, 'province and source-name evidence should resolve the remaining country identities');
  assert.equal(catalog.unresolvedCounts.coal_missing_name, 0, 'stable source IDs are valid identities even when a display name is absent');
  for (const [name, countryId, lat, lng, correction] of [
    ['Jellinbah Coal Mine', 'AUS', -22.285, 148.47, 'SOURCE_LATITUDE_SIGN_CORRECTED_BY_COUNTRY_GEOMETRY'],
    ['Eight-Kay Deep Coal Mine', 'USA', 37.7, -81.809444, 'SOURCE_LONGITUDE_SIGN_CORRECTED_BY_COUNTRY_GEOMETRY'],
    ['Hurricane Creek Mine #2', 'USA', 36.538333, -83.843889, 'SOURCE_LONGITUDE_SIGN_CORRECTED_BY_COUNTRY_GEOMETRY']
  ]) {
    const site = byName.get(key(name));
    assert.ok(site, 'expected source site for coordinate correction: '+name);
    assert.equal(site.countryId, countryId);
    assert.ok(site.coordinates, name+' must regain a valid, source-grounded coordinate');
    assert.ok(Math.abs(site.coordinates.lat - lat) < 0.002, name+' latitude correction');
    assert.ok(Math.abs(site.coordinates.lng - lng) < 0.002, name+' longitude correction');
    assert.equal(site.location.coordinateCorrection, correction);
  }
  assert.ok(catalog.unresolvedCounts.siteRecordsWithoutCoordinates <= 1021, 'verified source points near coarse country borders should remain visible with review status');
  const borderReviewNames = ['Río Turbio Coal Mine','Donkin Coal Mine','DTSA Coal Mine','GTB Coal Mine','LIM Coal Mine','MIP Coal Mine','Ulaan Ovoo Coal Mine','Turow Coal Mine','Saebyol Coal Mining Complex','Guzn Coal Mine','Kiwira Coal Mine','Tuli Coal Mine'];
  const borderReviewCount = borderReviewNames.filter(name => { const site = byName.get(key(name)); return site?.coordinates && site.location?.coordinateStatus === 'SOURCE_COORDINATE_NEAR_COUNTRY_BORDER_REVIEW_REQUIRED'; }).length;
  assert.ok(borderReviewCount >= 8, 'retain source coordinates near the border as visible review markers rather than silently dropping them');
  assert.ok(catalog.unresolvedCounts.coal_coordinates_quarantined_country_mismatch <= 6, 'only distant or unresolvable country-geometry conflicts should remain quarantined');
  const sourceIdOnly = catalog.sites.find(site => site.identity?.sourceIdentityStatus === 'SOURCE_ID_ONLY');
  if (sourceIdOnly) assert.equal(sourceIdOnly.siteName, sourceIdOnly.sourceSiteRecord.sourceRecordId, 'source-ID-only sites must keep their stable source ID as the visible label');
  const sibovc = byName.get(key('Sibovc Coal Mine'));
  assert.equal(sibovc.identity.sourceReportedJurisdiction, 'Kosovo');
  assert.equal(sibovc.identity.jurisdictionCountryId, 'XKX');
  assert.equal(sibovc.identity.countryAssignmentMethod, 'DISPUTED_JURISDICTION_MAPPED_TO_EXISTING_GAME_PROFILE');
  assert.ok(sibovc.coordinates, 'the source location in Kosovo must remain mappable even though the game routes its runtime through SRB');
  assert.equal(sibovc.location.coordinateStatus, 'SOURCE_COORDINATE_IN_DISPUTED_JURISDICTION');
  assert.equal(sibovc.location.coordinateJurisdiction, 'Kosovo');
  assert.equal(catalog.unresolvedCounts.siteRecordsWithoutCountry, 0, 'all sites with source country/province evidence must be assigned');
  const morningstar = byName.get(key('Morningstar'));
  assert.equal(morningstar.location.coordinateStatus, 'REJECTED_COUNTRY_GEOMETRY_MISMATCH', 'the far-offshore source point must stay quarantined with an explicit reason');
  assert.ok(morningstar.sourceSiteRecord.sourceReportedCoordinates, 'retain the rejected source coordinates for audit');
  assert.ok(catalog.unresolvedCounts.siteRecordsWithoutCoordinates <= 1021, 'coordinate gaps must continue to shrink without inventing mine locations');
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


test('supplemental site identities enter country-scoped resource references without synthetic coordinates', () => {
  const source = read('omega_resource_endowment_runtime.js');
  const context = {
    console, Math, Number, String, Object, Array, Set, Map, WeakMap, Promise, JSON, Date, Intl,
    Game: { state: { simulation: { turn: 1, startYear: 2015, date: '2015-01-01' }, resource: {}, economy: {} } },
    ResourceMinistryEngine: {
      isReady: false,
      countryProfiles: {
        USA: { identity: { iso3: 'USA', name: 'United States' } },
        BGD: { identity: { iso3: 'BGD', name: 'Bangladesh' } }
      },
      deposits: [],
      resourceTypes: []
    },
    addEventListener() {},
    dispatchEvent() { return true; }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'omega_resource_endowment_runtime.js' });

  const sites = [
    {
      siteId: 'GLOBAL_ENERGY_USA_crude_oil_test_field',
      sourceType: 'GLOBAL_ENERGY_EXTRACTION',
      countryId: 'USA',
      siteName: 'Test Producing Field',
      identity: { countryIso3: 'USA', resourceTypeId: 'crude_oil', sourceRecordId: 'GEM-US-001' },
      real: { resourceId: 'crude_oil', operationStatus: 'ACTIVE_PRODUCING' },
      coordinates: { lat: 29.1, lng: -95.2 },
      location: { coordinates: { lat: 29.1, lng: -95.2 }, countryName: 'United States', coordinateStatus: 'SOURCE_APPROXIMATE' },
      operation: { status: 'ACTIVE_PRODUCING', commercialExtraction: true, extractionEligibility: 'REQUIRES_EXACT_GAME_SITE_BINDING' },
      sourceSiteRecord: { sourceDataset: 'TEST_GEM', sourceUrl: 'https://example.invalid/source', sourceRecordId: 'GEM-US-001' },
      provenance: { sourceAuthority: 'TEST_SOURCE', sourceUrl: 'https://example.invalid/source' }
    },
    {
      siteId: 'GLOBAL_ENERGY_USA_crude_oil_missing_coordinates',
      sourceType: 'GLOBAL_ENERGY_EXTRACTION',
      countryId: 'USA',
      siteName: 'Unlocated Producing Field',
      identity: { countryIso3: 'USA', resourceTypeId: 'crude_oil', sourceRecordId: 'GEM-US-002' },
      real: { resourceId: 'crude_oil', operationStatus: 'ACTIVE_PRODUCING' },
      coordinates: null,
      location: { coordinates: null, countryName: 'United States', coordinateStatus: 'MISSING_UPSTREAM_COORDINATES' },
      operation: { status: 'ACTIVE_PRODUCING', commercialExtraction: true },
      sourceSiteRecord: { sourceDataset: 'TEST_GEM', sourceRecordId: 'GEM-US-002' },
      provenance: { sourceAuthority: 'TEST_SOURCE' }
    },
    {
      siteId: 'GLOBAL_DEP_UNRESOLVED_COUNTRY_copper_unknown',
      sourceType: 'GLOBAL_MINERAL_OCCURRENCE',
      countryId: null,
      siteName: 'Unassigned Copper Occurrence',
      identity: { countryIso3: null, countryAssignmentStatus: 'UNRESOLVED_COUNTRY_IDENTITY', resourceTypeId: 'copper' },
      real: { resourceId: 'copper', operationStatus: 'UNKNOWN' },
      coordinates: { lat: 0, lng: 0 },
      location: { coordinates: { lat: 0, lng: 0 }, coordinateStatus: 'UPSTREAM_GEOLOCATION_NOT_INDEPENDENTLY_VERIFIED' },
      operation: { status: 'UNKNOWN', commercialExtraction: false },
      sourceSiteRecord: { sourceDataset: 'TEST_MINERALS', upstreamRecordId: 'UNRESOLVED-001' },
      provenance: { sourceAuthority: 'TEST_SOURCE' }
    }
  ];

  const registration = context.OmegaResourceEndowmentRuntime.registerSupplementalSiteCatalog(sites);
  assert.equal(registration.status, 'READY');
  assert.equal(registration.registeredCount, 3);
  assert.equal(registration.countriesRepresented, 1);
  assert.equal(registration.unresolvedCountryCount, 1);
  assert.equal(registration.unlocatedCount, 1);
  assert.equal(registration.executableEligibleCount, 1);

  const refs = context.OmegaResourceEndowmentRuntime.countryMineSiteReferences('USA');
  const located = refs.find(row => row.siteId === sites[0].siteId);
  const unlocated = refs.find(row => row.siteId === sites[1].siteId);
  assert.ok(located, 'global site must become a country-scoped site reference');
  assert.equal(located.countryId, 'USA');
  assert.equal(located.resourceId, 'crude_oil');
  assert.equal(located.rawSiteReference.sourceSiteRecord.sourceRecordId, 'GEM-US-001');
  assert.equal(located.sourceDatasetId, 'TEST_GEM');
  assert.equal(located.commercialExtraction, true);
  assert.ok(unlocated, 'unlocated record must remain in the country identity registry');
  assert.equal(unlocated.commercialExtraction, false, 'no-coordinate record must be blocked from extraction');
  assert.equal(unlocated.rawSiteReference.location.coordinateStatus, 'MISSING_UPSTREAM_COORDINATES');
});
