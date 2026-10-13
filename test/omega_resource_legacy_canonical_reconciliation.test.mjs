import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const archived = read('resource_site_legacy_map_recovery_candidates_v1.json');
const reconstructed = read('resource_site_legacy_profile_marker_reconstruction_v1.json');
const master = read('resource_site_master_registry_v1.json');
const canonical = read('resource_site_canonical_catalog_v1.json');
const reserveScenario = read('resource_site_reserve_simulation_v1.json');
const legacyGameplayRows = [1,2,3,4,5].flatMap(n => read('resource_site_legacy_gameplay_expansion_part_' + n + '_v1.json').records);
const legacyGameplayById = new Map(legacyGameplayRows.map(site => [site.siteId, site]));
const canonicalById = new Map(canonical.sites.map(site => [site.siteId, site]));
assert.equal(legacyGameplayRows.length, 65, 'all 65 candidates remain in the auditable source packs');
assert.equal(legacyGameplayById.size, 65, 'gameplay candidate IDs remain unique');

assert.equal(archived.records.length, 114, 'preserve all embedded historical rows');
assert.equal(archived.resourcesJsonDeposits.length, 62, 'preserve all historical JSON deposit rows');
assert.equal(reconstructed.records.length, 1095, 'preserve all reconstructed profile markers');
assert.equal(master.sites.length, 250, 'baseline master research registry remains intact');
assert.equal(canonical.sites.length, 315, 'canonical authority contains the 65 explicitly quantified expansion records');
assert.equal(reserveScenario.siteCount, 250);
assert.equal(reserveScenario.commercialSiteCount, 246);

const norm = value => String(value ?? '').toLowerCase().normalize('NFKD')
  .replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim()) || '';
}
function coordsOf(row) {
  // Canonical sites keep verified/estimated geometry under location.coordinates.
  // Master-registry rows wrap that exact source record one level deeper.
  const sources = [
    row?.coordinates,
    row?.location?.coordinates,
    row?.real?.coordinates,
    row?.real?.location?.coordinates,
    row?.sourceSiteRecord?.coordinates,
    row?.sourceSiteRecord?.location?.coordinates,
    row?.location,
    row?.sourceSiteRecord,
    row?.rawLegacyRecord
  ];
  for (const source of sources) {
    const rawLat = source?.lat ?? source?.latitude;
    const rawLng = source?.lng ?? source?.lon ?? source?.longitude;
    if (rawLat === null || rawLat === undefined || rawLat === '' ||
        rawLng === null || rawLng === undefined || rawLng === '') continue;
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (Number.isFinite(lat) && Number.isFinite(lng) &&
        Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
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

const activeSites = canonical.sites.map(site => {
  const source = site.sourceSiteRecord || {};
  const name = firstText(site.siteName, site.name, source.siteName, source.name, site.real?.siteName);
  const countryId = String(site.countryId || source.countryId || '').toUpperCase();
  return {
    siteId: site.siteId,
    countryId,
    name,
    normalizedName: norm(name),
    resourceId: firstText(site.real?.resourceId, source.resourceId, source.resourceTypeId, site.identity?.resourceTypeId),
    coordinates: coordsOf(site)
  };
});
const canonicalIds = new Set(canonical.sites.map(site => site.siteId));
assert.equal(canonicalIds.size, 315, 'canonical IDs must remain unique');
assert.equal(new Set(activeSites.map(site => site.siteId)).size, 315, 'canonical inventory IDs must remain unique');

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
  const sameNameOtherCountry = candidate.normalizedName && candidate.countryId
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
    commercialSiteCount: reserveScenario.commercialSiteCount,
    notApplicableSiteCount: reserveScenario.siteCount - reserveScenario.commercialSiteCount,
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


const structuredLegacy = read('resource_site_legacy_structural_candidates_v1.json');
assert.equal(structuredLegacy.auditCounts.historicalEmbeddedRows, 114);
assert.equal(structuredLegacy.auditCounts.historicalJsonDepositRows, 62);
assert.equal(structuredLegacy.auditCounts.synthesizedProfileMarkerCount, 1095);
assert.equal(structuredLegacy.auditCounts.totalSiteLevelLegacyRows, 176);
assert.equal(structuredLegacy.auditCounts.uniqueLegacyNames, 138);
assert.equal(structuredLegacy.auditCounts.duplicateNameGroupsAcrossLegacySources, 38);
assert.equal(structuredLegacy.records.length, structuredLegacy.auditCounts.structurallyMappedCandidateCount);
assert.equal(structuredLegacy.excludedCandidates.length, structuredLegacy.auditCounts.excludedCandidateCount);
assert.equal(
  structuredLegacy.records.length + structuredLegacy.excludedCandidates.length,
  structuredLegacy.auditCounts.extractiveCandidateNameGroups,
  'every named extractive legacy group must be either structured or explicitly excluded'
);
assert.equal(structuredLegacy.rules.noExternalResearchUsed, true);
assert.equal(structuredLegacy.rules.historicalInputsPreservedUnmodified, true);
assert.equal(structuredLegacy.rules.candidatesExecutableAtRuntime, 0);
assert.equal(structuredLegacy.rules.candidatesAddedToCanonicalCatalog, 0);
assert.equal(structuredLegacy.rules.candidatesAddedToMasterRegistry, 0);
assert.equal(structuredLegacy.rules.candidatesAddedToReserveSimulation, 0);
assert.equal(structuredLegacy.selectionPolicy.allSelectedRowsNonExecutable, true);

const currentNamesForTest = new Set(canonical.sites.map(site => site.countryId + '|' + norm(site.siteName)));
const candidateIds = new Set();
const candidateNames = new Set();
const ontologyIds = new Set(canonical.sites.map(site => site.identity?.resourceTypeId).filter(Boolean));
for (const site of structuredLegacy.records) {
  assert.match(site.siteId, /^SITE_[A-Z]{3}_[a-z0-9_]+$/);
  assert.equal(candidateIds.has(site.siteId), false, 'legacy candidate site IDs must be unique');
  candidateIds.add(site.siteId);
  assert.equal(canonicalIds.has(site.siteId), true, 'each structured legacy candidate must be in canonical authority');
  const gameplayRow = legacyGameplayById.get(site.siteId);
  const canonicalRow = canonicalById.get(site.siteId);
  assert(gameplayRow && canonicalRow, site.siteId + ': exact candidate ID must survive canonical merge');
  assert.ok(['LEGACY_SITE_GAMEPLAY_EXPANSION_WITH_SOURCE_LINEAGE','CANONICAL_SITE_ALIAS_WITH_LEGACY_QUANTITATIVE_RECORD'].includes(canonicalRow.runtime?.identityAuthority), site.siteId + ': candidate authority must be explicit');
  if (gameplayRow.runtime?.aliasOfSiteId || gameplayRow.map?.markerEligible === false) {
    assert.equal(canonicalRow.map?.markerEligible, false, site.siteId + ': alias must not create a second physical marker');
  } else {
    assert.equal(canonicalRow.runtime?.identityAuthority, 'LEGACY_SITE_GAMEPLAY_EXPANSION_WITH_SOURCE_LINEAGE');
  }
  const quantitativeAuthority=canonicalRow.quantitative?.quantitativeProvenance?.authority;
  if (gameplayRow.runtime?.aliasOfSiteId || gameplayRow.map?.markerEligible===false) {
    assert.ok(['SCENARIO_SIMULATION_DATA','SIMULATION_ALIAS_REFERENCE_NOT_INDEPENDENT_ASSET'].includes(quantitativeAuthority), site.siteId + ': alias authority must stay explicit');
  } else {
    assert.equal(quantitativeAuthority, 'SCENARIO_SIMULATION_DATA');
  }
  assert.equal(canonicalRow.map?.markerEligible, gameplayRow.map?.markerEligible, site.siteId + ': map alias flag must survive merge');
  assert.equal(site.countryId, site.identity.countryIso3);
  assert.match(site.countryId, /^[A-Z]{3}$/);
  assert.equal(ontologyIds.has(site.identity.resourceTypeId), true, 'candidate resource must exist in current ontology');
  const candidateNameKey = site.countryId + '|' + norm(site.siteName);
  assert.equal(candidateNames.has(candidateNameKey), false, 'duplicate candidate name/country rows must be collapsed');
  candidateNames.add(candidateNameKey);
  assert.equal(currentNamesForTest.has(candidateNameKey), true, 'quantified candidate is now intentionally represented in canonical');
  const point = site.location.coordinates;
  assert.ok(Number.isFinite(point.lat) && Math.abs(point.lat) <= 90);
  assert.ok(Number.isFinite(point.lng) && Math.abs(point.lng) <= 180);
  assert.equal(site.location.coordinateStatus, 'LEGACY_UNVERIFIED_POINT');
  assert.equal(site.operation.extractionEligibility, 'NOT_EXECUTABLE_LEGACY_UNVERIFIED');
  assert.equal(site.operation.commercialExtraction, false);
  assert.equal(site.legacyRecovery.canonicalPromotionAllowed, false);
  assert.equal(site.legacyRecovery.runtimeIntegrationStatus, 'NOT_BOUND_TO_RUNTIME_PIPELINE');
  assert.equal(site.logistics.inventoryRouteStatus, 'NOT_YET_BOUND_TO_RUNTIME_PIPELINE');
  assert.equal(site.logistics.factoryRouteStatus, 'NOT_YET_BOUND_TO_RUNTIME_PIPELINE');
  assert.equal(site.quantitative.reserve.quantity, null);
  assert.equal(site.quantitative.reserve.status, 'UNOBSERVED');
  assert.equal(site.quantitative.production.rate, null);
  assert.equal(site.quantitative.production.status, 'UNOBSERVED');
  assert.equal(site.quantitative.grade.value, null);
  assert.equal(site.quantitative.grade.status, 'UNOBSERVED');
  assert.equal(site.quantitative.recovery.status, 'UNOBSERVED');
  assert.equal(site.quantitative.throughput.status, 'UNOBSERVED');
  assert.equal(site.quantitative.purity.status, 'UNOBSERVED');
  assert.equal(site.quantitative.capacity.status, 'UNOBSERVED');
  assert.ok(site.legacyRecovery.sourceRows.length >= 1, 'source evidence must be retained');
}
assert.ok(structuredLegacy.records.some(site => site.siteName === 'Jharia Coal Field'));
assert.ok(structuredLegacy.records.some(site => site.siteName === 'Bibiyana Gas Field'));
assert.ok(structuredLegacy.records.some(site => site.siteName === 'Escondida Copper Mine'));
assert.ok(structuredLegacy.excludedCandidates.some(site => site.candidateName === 'Barapukuria Coal Mine' && site.reasons.includes('EXACT_CANONICAL_DUPLICATE')));
assert.ok(structuredLegacy.excludedCandidates.some(site => site.candidateName === 'Greenbushes Lithium Mine' && site.reasons.includes('RESOURCE_NOT_IN_CURRENT_ONTOLOGY')));
console.log('OMEGA legacy structural candidate normalization: PASS');
console.log('Structurally mapped non-executable candidates:', structuredLegacy.records.length);
console.log('Excluded/duplicate/conflicting legacy groups:', structuredLegacy.excludedCandidates.length);
