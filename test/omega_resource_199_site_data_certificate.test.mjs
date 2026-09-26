import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// FINAL DATA CERTIFICATE [resource-data-certificate]
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const a = load('resources.json');
const b = load('resources_2.json');

const profiles = {
  ...(a.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {}),
  ...(b.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {})
};

const sites = [];
for (const [countryId, profile] of Object.entries(profiles)) {
  const rows = profile?.resource_infrastructure_context?.mineSites || [];
  assert(Array.isArray(rows), countryId + ': mineSites must be an array');
  for (const [index, site] of rows.entries()) sites.push({ countryId, index, site });
}

assert.equal(sites.length, 199, 'expected exactly 199 mine-site records');

const allowedResearchStates = new Set([
  'SITE_SPECIFIC_WEB_REVALIDATED',
  'SITE_SPECIFIC_WEB_REVIEWED',
  'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED',
  'NOT_APPLICABLE_NO_COMMERCIAL_SITE'
]);
const allowedAuthorityStates = new Set(['AVAILABLE', 'UNOBSERVED', 'UNAVAILABLE', 'STALE', 'INVALID', 'NOT_APPLICABLE', 'ESTIMATED', 'OBSERVED', 'REPORTED', 'DERIVED_FROM_OBSERVED_RATE']);

const ids = new Set();
const packageCount = sites.filter(({ site }) => site?.siteDataPackage && typeof site.siteDataPackage === 'object').length;

for (const { countryId, index, site } of sites) {
  assert(site && typeof site === 'object', countryId + '[' + index + ']: site object missing');
  assert(typeof site.id === 'string' && site.id.trim(), countryId + '[' + index + ']: site id missing');
  assert(!ids.has(site.id), countryId + '[' + index + ']: duplicate site id ' + site.id);
  ids.add(site.id);

  assert.equal(String(site.countryCode).toUpperCase(), String(countryId).toUpperCase(), countryId + '[' + index + ']: countryCode mismatch');
  assert.equal(String(site.siteIdentity?.countryIso3).toUpperCase(), String(countryId).toUpperCase(), countryId + '[' + index + ']: siteIdentity country mismatch');
  assert.equal(String(site.locationIdentity?.countryIso3).toUpperCase(), String(countryId).toUpperCase(), countryId + '[' + index + ']: locationIdentity country mismatch');

  for (const [field, value] of Object.entries({
    resourceId: site.resourceId,
    resourceTypeId: site.resourceTypeId,
    resourceTypeKey: site.resourceTypeKey,
    siteName: site.siteName,
    siteType: site.siteType,
    status: site.status,
    operationalStatus: site.operationalStatus,
    extractionMethod: site.extractionMethod
  })) {
    assert.notEqual(value, null, countryId + '[' + index + ']: ' + field + ' is null');
    assert.notEqual(value, undefined, countryId + '[' + index + ']: ' + field + ' is undefined');
    if (typeof value === 'string') assert.notEqual(value.trim(), '', countryId + '[' + index + ']: ' + field + ' is empty');
  }

  const isNA = String(site.status).toUpperCase() === 'NOT_APPLICABLE' || site.commercialExtraction === false;
  if (isNA) {
    assert.equal(site.extractionEligibility, 'NON_EXECUTABLE', countryId + '[' + index + ']: N/A extraction eligibility');
  } else if (String(site.status).toUpperCase() === 'ACTIVE_PRODUCING') {
    assert.equal(site.extractionEligibility, 'EXECUTABLE', countryId + '[' + index + ']: active site extraction eligibility');
  }

  const placeholders = new Set([
    'private concession holders',
    'project concession interests',
    'government / private',
    'local operators',
    'state / private interests',
    'cement-sector operators',
    'private mining interests',
    'ukrainian operators/state',
    'kryvyi rih operators',
    'nilepet / consortium',
    'former midroc',
    'unverified',
    'unknown'
  ]);

  for (const field of ['owner', 'operator']) {
    assert(typeof site[field] === 'string', countryId + '[' + index + ']: ' + field + ' must be explicit string or UNOBSERVED');
    const lower = site[field].trim().toLowerCase();
    assert(!placeholders.has(lower), countryId + '[' + index + ']: placeholder ' + field + ' value');
  }
  assert(allowedResearchStates.has(site.researchState), countryId + '[' + index + ']: invalid researchState');
  if (site.researchState === 'NOT_APPLICABLE_NO_COMMERCIAL_SITE') {
    assert.equal(site.dataCompleteness?.webResearch, 'NOT_APPLICABLE');
  } else if (site.researchState === 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED') {
    assert.equal(site.dataCompleteness?.webResearch, 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED');
  } else {
    assert(Array.isArray(site.webResearchEvidence) && site.webResearchEvidence.length > 0,
      countryId + '[' + index + ']: site-specific state without web evidence');
    assert.equal(site.dataCompleteness?.webResearch, site.researchState);
  }

  const qp = site.quantitativeProfile;
  assert(qp && typeof qp === 'object', countryId + '[' + index + ']: quantitativeProfile missing');
  for (const [name, row] of Object.entries({
    reserve: qp.reserve,
    production: qp.production,
    grade: qp.grade
  })) {
    assert(row && typeof row === 'object', countryId + '[' + index + ']: quantitative ' + name + ' missing');
    assert(typeof row.status === 'string' && allowedAuthorityStates.has(row.status),
      countryId + '[' + index + ']: quantitative ' + name + ' invalid status');
  }

  const pkg = site.siteDataPackage;
  assert(pkg && typeof pkg === 'object', countryId + '[' + index + ']: siteDataPackage missing');
  assert.equal(pkg.schemaVersion, '1.0.0');
  assert.equal(pkg.siteId, site.id);
  assert.equal(pkg.siteName, site.siteName);
  assert.equal(pkg.identity.countryIso3, countryId);
  assert.equal(pkg.identity.resourceTypeId, site.resourceTypeId);
  assert.equal(pkg.operation.status, site.status);
  assert.equal(pkg.operation.operationalStatus, site.operationalStatus);
  assert.equal(pkg.ownership.owner, site.owner);
  assert.equal(pkg.ownership.operator, site.operator);
  assert.equal(pkg.verification.researchState, site.researchState);
}

assert.equal(ids.size, 199);
assert.equal(packageCount, 199);

const catalog = load('resource_site_canonical_catalog_v1.json');
assert.equal(catalog.siteCount, 199);
assert(Array.isArray(catalog.sites) && catalog.sites.length === 199);
assert.equal(new Set(catalog.sites.map((x) => x.siteId)).size, 199);

const sourceIds = sites.map(({ site }) => site.id).sort();
const catalogIds = catalog.sites.map((x) => x.siteId).sort();
assert.deepEqual(catalogIds, sourceIds, 'canonical catalog site IDs must match the 199 source site IDs');

const commercial = sites.filter(({ site }) => !(String(site.status).toUpperCase() === 'NOT_APPLICABLE' || site.commercialExtraction === false));
const na = sites.length - commercial.length;

console.log(JSON.stringify({
  certificate: 'OMEGA-199-RESOURCE-SITE-DATA',
  status: 'PASS',
  siteCount: sites.length,
  commercialSiteCount: commercial.length,
  notApplicableSiteCount: na,
  siteDataPackageCount: packageCount,
  canonicalCatalogCount: catalog.siteCount,
  siteSpecificReviewedCount: sites.filter(({ site }) => site.researchState === 'SITE_SPECIFIC_WEB_REVIEWED' || site.researchState === 'SITE_SPECIFIC_WEB_REVALIDATED').length,
  legacyCount: sites.filter(({ site }) => site.researchState === 'LEGACY_CURATED_NOT_RECENTLY_REVALIDATED').length,
  explicitOwnerCount: sites.filter(({ site }) => site.owner !== 'UNOBSERVED').length,
  explicitOperatorCount: sites.filter(({ site }) => site.operator !== 'UNOBSERVED').length
}, null, 2));
