import assert from 'node:assert/strict';
import fs from 'node:fs';

const files=['resources.json','resources_2.json'].map(name => JSON.parse(fs.readFileSync(new URL('../'+name, import.meta.url), 'utf8')));
const profiles = Object.assign(
  {},
  files[0]?.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {},
  files[1]?.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {}
);

const resourceTypes = new Set();
for (const data of files) {
  for (const key of Object.keys(data?.resource_types || {})) resourceTypes.add(String(key).toLowerCase());
  for (const key of Object.keys(data?.GSRSK_Master_Resource_Data_v14?.resource_types || {})) resourceTypes.add(String(key).toLowerCase());
}

const sites = [];
for (const [countryId, profile] of Object.entries(profiles)) {
  const rows = profile?.resource_infrastructure_context?.mineSites;
  assert(Array.isArray(rows), countryId + ': mineSites must be an array');
  rows.forEach((site, index) => sites.push({countryId, index, site}));
}

assert.equal(sites.length, 199, 'expected exactly 199 mine-site references');

const required = [
  'id','name','siteName','siteType','region','countryCode','lat','lng',
  'locationNodeKey','status','operationalStatus','extractionMethod',
  'siteIdentity','locationIdentity','resourceIdentity','extractionProfile',
  'quantitativeProfile','dataCompleteness'
];

const placeholderPattern = /^(private concession holders|project concession interests|government \/ private|local operators|state \/ private interests)$/i;

let commercial=0;
let notApplicable=0;
let researched=0;
let withQuantitative=0;

for (const {countryId, index, site} of sites) {
  assert(site && typeof site === 'object', countryId + '[' + index + ']: site must be an object');
  for (const field of required) {
    assert.notEqual(site[field], null, countryId + '[' + index + ']: missing ' + field);
    assert.notEqual(site[field], undefined, countryId + '[' + index + ']: missing ' + field);
    if (typeof site[field] === 'string') assert.notEqual(site[field].trim(), '', countryId + '[' + index + ']: empty ' + field);
  }

  assert.equal(String(site.countryCode).toUpperCase(), String(countryId).toUpperCase(), countryId + '[' + index + ']: countryCode mismatch');
  assert.equal(String(site.siteIdentity.countryIso3).toUpperCase(), String(countryId).toUpperCase(), countryId + '[' + index + ']: siteIdentity country mismatch');
  assert.equal(String(site.locationIdentity.countryIso3).toUpperCase(), String(countryId).toUpperCase(), countryId + '[' + index + ']: locationIdentity country mismatch');

  const isNA = String(site.status).toUpperCase() === 'NOT_APPLICABLE' || site.commercialExtraction === false;
  if (isNA) {
    notApplicable++;
    assert.equal(site.extractionEligibility, 'NON_EXECUTABLE', countryId + '[' + index + ']: non-applicable site cannot be executable');
    assert.equal(site.quantitativeProfile.quantitativeExtractionDataAvailable, false, countryId + '[' + index + ']: non-applicable site must not claim quantitative execution data');
  } else {
    commercial++;
    assert.equal(typeof site.resourceId, 'string', countryId + '[' + index + ']: resourceId must be canonical string');
    assert(resourceTypes.has(site.resourceId.toLowerCase()), countryId + '[' + index + ']: unknown resourceId ' + site.resourceId);
    assert.equal(String(site.resourceTypeId).toLowerCase(), site.resourceId.toLowerCase(), countryId + '[' + index + ']: resourceTypeId mismatch');
    assert.equal(String(site.resourceTypeKey).toLowerCase(), site.resourceId.toLowerCase(), countryId + '[' + index + ']: resourceTypeKey mismatch');
    assert(!placeholderPattern.test(String(site.owner || '').trim()), countryId + '[' + index + ']: placeholder owner value');
    assert(!placeholderPattern.test(String(site.operator || '').trim()), countryId + '[' + index + ']: placeholder operator value');
    if (String(site.status).toUpperCase() === 'ACTIVE_PRODUCING') {
      assert.equal(site.extractionEligibility, 'EXECUTABLE', countryId + '[' + index + ']: active producing site must be executable');
    }
  }

  const qp = site.quantitativeProfile || {};
  const reserveObserved = qp.reserve && qp.reserve.quantity != null && qp.reserve.quantity !== '';
  const annualObserved = qp.production && qp.production.annual != null && qp.production.annual !== '';
  const rateObserved = qp.production && qp.production.rate != null && qp.production.rate !== '';
  const gradeObserved = qp.grade && qp.grade.value != null && qp.grade.value !== '';
  const hasAnyQuantitative = reserveObserved || annualObserved || rateObserved || gradeObserved;

  if (site.quantitativeProfile.quantitativeExtractionDataAvailable) {
    assert(hasAnyQuantitative, countryId + '[' + index + ']: quantitativeExtractionDataAvailable=true with no quantitative fields');
    withQuantitative++;
  }

  if (site.researchState || Array.isArray(site.webResearchEvidence)) researched++;

  assert.equal(site.dataCompleteness.identity, 'COMPLETE', countryId + '[' + index + ']: identity completeness gate');
  if (isNA) {
    assert.equal(site.dataCompleteness.resource, 'COMPLETE', countryId + '[' + index + ']: non-commercial resource classification must be COMPLETE');
  } else {
    assert.equal(site.dataCompleteness.resource, 'COMPLETE', countryId + '[' + index + ']: resource completeness gate');
  }
  assert.equal(site.dataCompleteness.location, 'COMPLETE', countryId + '[' + index + ']: location completeness gate');
  assert.equal(site.dataCompleteness.operation, 'COMPLETE', countryId + '[' + index + ']: operation completeness gate');
  assert.equal(site.dataCompleteness.provenance, 'PRESENT', countryId + '[' + index + ']: provenance gate');
}

assert.equal(commercial + notApplicable, 199);
assert.equal(notApplicable, 4);
assert(researched > 0, 'expected site-level web research coverage');
console.log(JSON.stringify({
  certificate: 'OMEGA-RESOURCE-SITE-DATA-COMPLETENESS',
  status: 'PASS',
  siteCount: sites.length,
  commercialSiteCount: commercial,
  notApplicableSiteCount: notApplicable,
  siteResearchStateCount: researched,
  quantitativeExecutionReadySiteCount: withQuantitative,
  resourceTypeCount: resourceTypes.size
}, null, 2));
