import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const catalog = read('resource_site_canonical_catalog_v1.json');
const master = read('resource_site_master_registry_v1.json');
const reserves = read('resource_site_reserve_simulation_v1.json');
const industrial = read('resource_industrial_catalog_v1.json');
const pack = read('resource_site_legacy_gameplay_expansion_part_6_v1.json');
const prior = [1,2,3,4,5].flatMap(n => read('resource_site_legacy_gameplay_expansion_part_' + n + '_v1.json').records);
assert.equal(pack.datasetId, 'OMEGA_RESOURCE_SITE_LEGACY_GAMEPLAY_EXPANSION_PART_6_V1');
assert.equal(pack.part, 6);
assert.equal(pack.partCount, 6);
assert.equal(pack.range.first, 66);
assert.equal(pack.range.last, 115);
assert.equal(pack.recordCount, 50);
assert.equal(pack.records.length, 50);
assert.equal(new Set(pack.records.map(s => s.siteId)).size, 50, 'the new pack must have 50 unique site IDs');
assert.ok(new Set(pack.records.map(s => s.countryId)).size >= 20, 'the new pack must cover at least 20 countries');

const norm = v => String(v ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const coords = row => {
  const c = row?.location?.coordinates || row?.coordinates || row?.sourceSiteRecord?.location?.coordinates || {};
  const lat = Number(c.lat ?? c.latitude ?? row?.lat ?? row?.latitude ?? row?.sourceSiteRecord?.lat);
  const lng = Number(c.lng ?? c.lon ?? c.longitude ?? row?.lng ?? row?.lon ?? row?.sourceSiteRecord?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? {lat, lng} : null;
};
const distanceKm = (a,b) => {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat-a.lat), dLng = rad(b.lng-a.lng), la = rad(a.lat), lb = rad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(la)*Math.cos(lb)*Math.sin(dLng/2)**2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};
const metadata = row => ({
  siteId: String(row?.siteId || row?.id || ''),
  name: norm(row?.siteName || row?.name || row?.sourceSiteRecord?.siteName || row?.sourceSiteRecord?.name),
  country: String(row?.countryId || row?.countryCode || row?.identity?.countryIso3 || row?.sourceSiteRecord?.countryCode || '').toUpperCase(),
  resource: String(row?.resourceId || row?.identity?.resourceTypeId || row?.real?.resourceId || row?.sourceSiteRecord?.resourceId || row?.sourceSiteRecord?.resourceTypeId || '').toLowerCase(),
  coordinates: coords(row)
});
const baseline = [
  ...catalog.sites,
  ...master.sites,
  ...reserves.records,
  ...prior
].map(metadata);
const candidateIds = new Set(pack.records.map(s => s.siteId));
for (const row of pack.records) {
  assert.ok(row.siteId && /^SITE_[A-Z]{3}_[a-z0-9_]+$/.test(row.siteId), 'stable canonical-style siteId: ' + row.siteId);
  assert.ok(/^[A-Z]{3}$/.test(row.countryId), row.siteId + ' ISO-3 country identity');
  assert.equal(row.identity?.countryIso3, row.countryId, row.siteId + ' identity country consistency');
  assert.equal(row.identity?.resourceTypeId, row.resourceId, row.siteId + ' resource identity consistency');
  assert.ok(row.siteName && row.identity?.siteType && row.identity?.ontologyKey, row.siteId + ' complete identity');
  const c = coords(row);
  assert.ok(c, row.siteId + ' valid map coordinates');
  assert.equal(row.location?.countryBoundaryKey, row.countryId, row.siteId + ' coordinate country boundary');
  assert.equal(row.map?.markerEligible, true, row.siteId + ' map marker eligible');
  assert.equal(row.map?.countryIsolationKey, row.countryId, row.siteId + ' marker country isolation');
  assert.equal(row.map?.aliasOfSiteId, null, row.siteId + ' must be a physical site, not an alias');
  assert.equal(row.runtime?.aliasOfSiteId, null, row.siteId + ' runtime alias guard');
  assert.equal(row.operation?.commercialExtraction, true, row.siteId + ' simulated extraction eligibility');
  assert.equal(row.runtime?.requiresSiteSpecificRoute, true, row.siteId + ' requires route per site');
  assert.equal(row.runtime?.requiresFactoryBinding, true, row.siteId + ' requires a bound factory');
  assert.equal(row.logistics?.warehouseCountryId, row.countryId, row.siteId + ' warehouse country isolation');
  assert.equal(row.logistics?.transport?.originSiteId, row.siteId, row.siteId + ' route origin identity');
  assert.equal(row.logistics?.transport?.originCountryId, row.countryId, row.siteId + ' route origin country');
  assert.equal(row.logistics?.transport?.destinationCountryId, row.countryId, row.siteId + ' route destination country');
  assert.equal(row.logistics?.transport?.warehouseId, 'WH-' + row.countryId + '-RAW', row.siteId + ' raw warehouse binding');
  assert.equal(row.simulation?.factoryBinding?.countryId, row.countryId, row.siteId + ' factory country isolation');
  assert.equal(row.simulation?.factoryBinding?.inputResourceId, row.resourceId, row.siteId + ' factory input commodity');
  assert.ok(row.simulation?.factoryBinding?.factoryId, row.siteId + ' factory binding');
  assert.ok(row.processing?.refinedOutputs?.length, row.siteId + ' processing outputs');
  assert.ok(row.simulation?.transportRoute?.length, row.siteId + ' simulation route');

  const q = row.quantitative || {};
  for (const key of ['reserve','production','grade','recovery','throughput','purity','capacity']) {
    assert.equal(q[key]?.status, 'SIMULATED', row.siteId + ' ' + key + ' must be explicitly simulated');
    assert.equal(q.completeness?.[key], 'SIMULATED', row.siteId + ' ' + key + ' coverage status');
  }
  assert.ok(Number(q.reserve?.quantity) > 0, row.siteId + ' simulated reserve must be positive');
  assert.ok(Number(q.production?.rate) > 0 && Number(q.production?.annual) > 0, row.siteId + ' production rate');
  assert.ok(Number(q.grade?.value) > 0, row.siteId + ' grade value');
  assert.ok(Number(q.purity?.value) > 0 && Number(q.purity?.value) <= 100, row.siteId + ' purity range');
  assert.ok(Number(q.recovery?.value) > 0 && Number(q.recovery?.value) <= 100, row.siteId + ' recovery range');
  assert.ok(Number(q.throughput?.value) > 0, row.siteId + ' throughput value');
  assert.ok(Number(q.capacity?.minimum) > 0 && Number(q.capacity?.minimum) <= Number(q.capacity?.nominal), row.siteId + ' minimum <= nominal capacity');
  assert.ok(Number(q.capacity?.nominal) <= Number(q.capacity?.maximum), row.siteId + ' nominal <= maximum capacity');
  assert.equal(q.reserve?.quantity, row.reserve?.quantity, row.siteId + ' reserve authorities agree');
  assert.equal(row.simulation?.reserve?.quantity, row.reserve?.quantity, row.siteId + ' simulation reserve agrees');
  assert.equal(q.quantitativeProvenance?.authority, 'SCENARIO_SIMULATION_DATA', row.siteId + ' simulation provenance');
  assert.equal(q.quantitativeProvenance?.realWorldDataRequired, false, row.siteId + ' scenario provenance policy');
  assert.equal(q.completeness?.overall, 'GAMEPLAY_SIMULATION_COMPLETE', row.siteId + ' gameplay data coverage');
  assert.deepEqual(row.observedFacts, [], row.siteId + ' must not invent measured facts');
  assert.deepEqual(row.sources, [], row.siteId + ' must not invent source citations');
  assert.ok(Number.isInteger(Number(q.quantitativeProvenance?.gameplayHorizonYears)), row.siteId + ' reserve horizon provenance');
  assert.ok(Number(q.reserve.quantity) >= Number(q.production.annual) * 350, row.siteId + ' reserve horizon >= 350 years');
  assert.ok(Number(q.reserve.quantity) <= Number(q.production.annual) * 450, row.siteId + ' reserve horizon <= 450 years');
  assert.ok(industrial.resourceRules?.[row.resourceId], row.siteId + ' industrial extraction rule exists');
  assert.ok(industrial.processingRules?.[row.resourceId], row.siteId + ' industrial processing rule exists');

  const n = metadata(row);
  for (const old of baseline) {
    if (old.siteId) assert.notEqual(old.siteId, n.siteId, 'duplicate siteId with existing registry: ' + n.siteId);
    if (!n.country || !old.country || old.country !== n.country) continue;
    if (n.name && old.name) assert.notEqual(old.name, n.name, 'duplicate normalized site name in ' + n.country + ': ' + row.siteName);
    if (n.resource && old.resource && n.resource === old.resource && n.coordinates && old.coordinates) {
      assert.ok(distanceKm(n.coordinates, old.coordinates) > 2, 'possible same physical site/marker as ' + old.siteId + ': ' + row.siteName);
    }
  }
}
for (let i=0; i<pack.records.length; i++) {
  const a = metadata(pack.records[i]);
  for (let j=i+1; j<pack.records.length; j++) {
    const b = metadata(pack.records[j]);
    assert.notEqual(a.siteId,b.siteId,'new pack site IDs unique');
    assert.ok(!(a.country===b.country && a.name===b.name),'duplicate name within new pack');
    if (a.country===b.country && a.resource===b.resource && a.coordinates && b.coordinates) {
      assert.ok(distanceKm(a.coordinates,b.coordinates)>2,'duplicate same-commodity map identity within new pack: '+a.siteId+' / '+b.siteId);
    }
  }
}
assert.equal(pack.metricCoverage?.reserve,50);
assert.equal(pack.metricCoverage?.production,50);
assert.equal(pack.metricCoverage?.grade,50);
assert.equal(pack.metricCoverage?.recovery,50);
assert.equal(pack.metricCoverage?.throughput,50);
assert.equal(pack.metricCoverage?.purity,50);
assert.equal(pack.metricCoverage?.capacity,50);
console.log(JSON.stringify({certificate:'OMEGA-RESOURCE-NEXT-50-SITE-CONTRACT',status:'PASS',newSites:pack.records.length,countryCount:new Set(pack.records.map(s=>s.countryId)).size,metricCoverage:pack.metricCoverage,mapMarkerEligible:pack.records.filter(s=>s.map.markerEligible).length,siteSpecificRoutes:pack.records.filter(s=>s.logistics.transport.originSiteId===s.siteId).length,factoryBindings:pack.records.filter(s=>s.simulation.factoryBinding.factoryId).length},null,2));
