import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJson = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const recovered = readJson('resource_site_legacy_map_recovery_candidates_v1.json');
const synthesized = readJson('resource_site_legacy_profile_marker_reconstruction_v1.json');
const master = readJson('resource_site_master_registry_v1.json');
const canonical = readJson('resource_site_canonical_catalog_v1.json');

const embedded = recovered.records;
const oldJsonDeposits = recovered.resourcesJsonDeposits;
const profileMarkers = synthesized.records;

assert.equal(embedded.length, 114, 'archive must preserve all 114 historical GEOGRAPHIC_DEPOSITS entries');
assert.equal(oldJsonDeposits.length, 62, 'archive must preserve the old resources.json#/deposits records');
assert.equal(synthesized.counts.reconstructedMarkerCount, 1095);
assert.equal(profileMarkers.length, 1095, 'legacy profile synthesis must be reproducibly archived');
assert.equal(master.siteCount, 250);
assert.equal(master.sites.length, 250);
assert.equal(canonical.sites.length, 315, 'only the explicit 65-row gameplay derivative was added; synthetic historical markers remain quarantined');
assert.equal(new Set(master.sites.map(s => s.siteId)).size, 250);

const norm = value => String(value || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const staticNames = new Set(embedded.map(x => norm(x.siteName)));
const overlaps = oldJsonDeposits.filter(x => staticNames.has(norm(x.siteName)));
assert.equal(overlaps.length, 38, 'preserve and report the 38 duplicate-name rows across historical sources');
assert.equal(embedded.length + oldJsonDeposits.length - overlaps.length + profileMarkers.length, 1233,
  'reconstructed legacy engine output must total 1,233 name-deduplicated marker candidates');

for (const record of embedded) {
  assert.equal(record.eligibleForCanonicalMinePipeline, false);
  assert.equal(record.authority, 'HISTORICAL_EMBEDDED_UI_DATA_UNVERIFIED');
  assert.ok(record.source?.commit && record.source?.path && record.source?.line);
  assert.ok(Number.isFinite(record.coordinates?.lat) && Number.isFinite(record.coordinates?.lng));
}
for (const record of oldJsonDeposits) {
  assert.equal(record.eligibleForCanonicalMinePipeline, false);
  assert.ok(record.rawLegacyRecord && record.source?.pointer);
  assert.ok(Number.isFinite(record.coordinates?.lat) && Number.isFinite(record.coordinates?.lng));
}
for (const record of profileMarkers) {
  assert.equal(record.historicalOnly, true);
  assert.equal(record.eligibleForCanonicalMinePipeline, false);
  assert.equal(record.authority, 'COUNTRY_PROFILE_RESOURCE_CONTEXT_ONLY');
  assert.equal(record.coordinates?.coordinateAuthority, 'SYNTHETIC_OFFSET_FROM_COUNTRY_PROFILE');
  assert.ok(record.source?.engineCommit && record.source?.sourceDataBlob);
  assert.ok(Number.isFinite(record.coordinates?.lat) && Number.isFinite(record.coordinates?.lng));
}
const countryCounts = profileMarkers.reduce((out, row) => {
  out[row.countryId] = (out[row.countryId] || 0) + 1;
  return out;
}, {});
assert.equal(Object.keys(countryCounts).length, 110);
assert.equal(Object.values(countryCounts).filter(n => n >= 3).length, 104);
assert.equal(Object.values(countryCounts).filter(n => n >= 4).length, 103);

console.log(JSON.stringify({
  certificate: 'OMEGA-RESOURCE-LEGACY-MARKER-RECOVERY',
  status: 'PASS',
  historicalEmbeddedMarkers: embedded.length,
  historicalResourcesJsonDeposits: oldJsonDeposits.length,
  historicalProfileDerivedMarkers: profileMarkers.length,
  duplicateNamesAcrossHistoricalStaticSources: overlaps.length,
  reconstructedHistoricalMarkerCandidates: 1233,
  activeCanonicalSites: canonical.sites.length,
  baselineMasterRecords: master.sites.length,
  syntheticMarkersEligibleForMinePipeline: profileMarkers.filter(x => x.eligibleForCanonicalMinePipeline).length
}, null, 2));
