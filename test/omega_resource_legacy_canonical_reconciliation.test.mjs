import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const archived = read('resource_site_legacy_map_recovery_candidates_v1.json');
const reconstructed = read('resource_site_legacy_profile_marker_reconstruction_v1.json');
const master = read('resource_site_master_registry_v1.json');
const canonical = read('resource_site_canonical_catalog_v1.json');

assert.equal(archived.records.length, 114, 'preserve all embedded historical rows');
assert.equal(archived.resourcesJsonDeposits.length, 62, 'preserve all historical JSON deposit rows');
assert.equal(reconstructed.records.length, 1095, 'preserve all reconstructed profile markers');
assert.equal(master.sites.length, 250);
assert.equal(canonical.sites.length, 250);

const norm = value => String(value ?? '').toLowerCase().normalize('NFKD')
  .replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim()) || '';
}
function coordsOf(row) {
  const sources = [row?.coordinates, row?.location, row?.real?.coordinates,
    row?.sourceSiteRecord?.coordinates, row?.sourceSiteRecord, row?.rawLegacyRecord];
  for (const source of sources) {
    const lat = Number(source?.lat ?? source?.latitude);
    const lng = Number(source?.lng ?? source?.lon ?? source?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}
function distanceKm(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const activeSites = master.sites.map(site => {
  const source = site.sourceSiteRecord || {};
  const name = firstText(site.siteName, site.name, source.siteName, source.name, site.real?.siteName);
  const countryId = String(site.countryId || source.countryId || '').toUpperCase();
  return {
    siteId: site.siteId,
    countryId,
    name,
    normalizedName: norm(name),
    resourceId: firstText(site.real?.resourceId, source.resourceId, source.resourceTypeId),
    coordinates: coordsOf(site)
  };
});
const canonicalIds = new Set(canonical.sites.map(site => site.siteId));
assert.equal(canonicalIds.size, 250, 'canonical IDs must remain unique');
assert.equal(new Set(activeSites.map(site => site.siteId)).size, 250, 'master IDs must remain unique');

const candidates = [
  ...archived.records.map(row => ({ sourceType: 'EMBEDDED_ENGINE', ...row })),
  ...archived.resourcesJsonDeposits.map(row => ({ sourceType: 'LEGACY_RESOURCES_JSON', ...row })),
  ...reconstructed.records.map(row => ({ sourceType: 'PROFILE_SYNTHESIS', ...row }))
].map((row, index) => {
  const name = firstText(row.siteName, row.name, row.rawLegacyRecord?.siteName, row.rawLegacyRecord?.name);
  return {
    recoveryId: firstText(row.recoveryId, row.id, row.siteId) || 'HISTORICAL_ROW_' + index,
    sourceType: row.sourceType,
    name,
    normalizedName: norm(name),
    countryId: String(row.countryId || row.countryCode || '').toUpperCase(),
    resourceId: firstText(row.resourceId, row.resourceType, row.rawLegacyRecord?.resourceId),
    coordinates: coordsOf(row),
    authority: firstText(row.authority, row.historicalMarkerClass, row.markerType) || 'HISTORICAL_AUTHORITY_UNSPECIFIED',
    eligibleForCanonicalMinePipeline: row.eligibleForCanonicalMinePipeline === true
  };
});

const byCountryName = new Map();
const byName = new Map();
for (const site of activeSites) {
  if (!site.normalizedName) continue;
  const key = site.countryId + '|' + site.normalizedName;
  if (!byCountryName.has(key)) byCountryName.set(key, []);
  byCountryName.get(key).push(site);
  if (!byName.has(site.normalizedName)) byName.set(site.normalizedName, []);
  byName.get(site.normalizedName).push(site);
}

const reportRows = candidates.map(candidate => {
  const exact = candidate.normalizedName
    ? (byCountryName.get(candidate.countryId + '|' + candidate.normalizedName) || [])
    : [];
  const sameNameOtherCountry = candidate.normalizedName
    ? (byName.get(candidate.normalizedName) || []).filter(site => site.countryId !== candidate.countryId)
    : [];
  let nearest = null;
  if (candidate.coordinates && candidate.countryId) {
    for (const site of activeSites) {
      if (site.countryId !== candidate.countryId || !site.coordinates) continue;
      const distance = distanceKm(candidate.coordinates, site.coordinates);
      if (!nearest || distance < nearest.distanceKm) nearest = { siteId: site.siteId, siteName: site.name, distanceKm: Number(distance.toFixed(3)) };
    }
  }
  let matchKind = 'NO_MATCH_FOUND';
  if (exact.length) matchKind = 'EXACT_NORMALIZED_NAME_AND_COUNTRY';
  else if (nearest && nearest.distanceKm <= 25) matchKind = 'POSSIBLE_COORDINATE_NEAR_MATCH_WITHIN_25KM';
  else if (sameNameOtherCountry.length) matchKind = 'SAME_NORMALIZED_NAME_DIFFERENT_COUNTRY';
  return {
    recoveryId: candidate.recoveryId,
    sourceType: candidate.sourceType,
    historicalName: candidate.name,
    historicalCountryId: candidate.countryId || null,
    historicalResourceId: candidate.resourceId || null,
    historicalCoordinates: candidate.coordinates,
    historicalAuthority: candidate.authority,
    matchKind,
    exactMatches: exact.map(site => ({ siteId: site.siteId, siteName: site.name, countryId: site.countryId, resourceId: site.resourceId })),
    sameNameOtherCountryMatches: sameNameOtherCountry.map(site => ({ siteId: site.siteId, siteName: site.name, countryId: site.countryId })),
    nearestSameCountrySite: nearest,
    autoPromoted: false
  };
});

const countBy = (rows, key) => rows.reduce((out, row) => {
  const value = row[key] || 'UNKNOWN';
  out[value] = (out[value] || 0) + 1;
  return out;
}, {});
const report = {
  certificate: 'OMEGA-RESOURCE-LEGACY-CANONICAL-RECONCILIATION',
  status: 'AUDIT_COMPLETE_REVIEW_REQUIRED',
  generatedAt: new Date().toISOString(),
  activeAuthority: {
    canonicalSiteCount: canonical.sites.length,
    masterSiteCount: master.sites.length,
    commercialSiteCount: master.sites.filter(site => site.real?.resourceId).length,
    uniqueSiteIds: canonicalIds.size,
    historicalRowsAutoPromoted: 0
  },
  historicalSources: {
    embeddedEngineRows: archived.records.length,
    resourcesJsonDepositRows: archived.resourcesJsonDeposits.length,
    profileSynthesizedRows: reconstructed.records.length,
    rawHistoricalRowsAudited: candidates.length,
    knownDuplicateNamesAcrossEmbeddedAndJsonSources: 38,
    historicalNameDeduplicatedCandidateCount: 1233
  },
  matchCountsBySource: Object.fromEntries(['EMBEDDED_ENGINE', 'LEGACY_RESOURCES_JSON', 'PROFILE_SYNTHESIS'].map(sourceType => [
    sourceType, countBy(reportRows.filter(row => row.sourceType === sourceType), 'matchKind')
  ])),
  matchCountsOverall: countBy(reportRows, 'matchKind'),
  coordinateCoverage: {
    historicalRowsWithCoordinates: candidates.filter(row => row.coordinates).length,
    historicalRowsWithoutCoordinates: candidates.filter(row => !row.coordinates).length,
    activeSitesWithCoordinates: activeSites.filter(site => site.coordinates).length,
    activeSitesWithoutCoordinates: activeSites.filter(site => !site.coordinates).length
  },
  rows: reportRows,
  policy: {
    historicalRowsAreEvidenceCandidatesOnly: true,
    syntheticProfileMarkersAreVerifiedMineSites: false,
    coordinateNearMatchIsNotProofOfDuplicate: true,
    noCanonicalSiteWasChangedOrRemoved: true,
    noHistoricalCandidateWasAutomaticallyPromoted: true
  }
};
fs.writeFileSync(new URL('../omega_resource_legacy_canonical_reconciliation_report.json', import.meta.url), JSON.stringify(report, null, 2) + String.fromCharCode(10));
console.log(JSON.stringify({
  certificate: report.certificate,
  status: report.status,
  activeSiteCount: report.activeAuthority.canonicalSiteCount,
  historicalRawRowsAudited: report.historicalSources.rawHistoricalRowsAudited,
  matchCountsOverall: report.matchCountsOverall,
  coordinateCoverage: report.coordinateCoverage
}, null, 2));
