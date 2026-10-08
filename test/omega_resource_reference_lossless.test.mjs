import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const sourceFiles = ['resources.json', 'resources_2.json'].map(read);
const profiles = Object.assign(
  {},
  sourceFiles[0]?.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {},
  sourceFiles[1]?.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {}
);

const rawSites = [];
for (const [countryId, profile] of Object.entries(profiles)) {
  const rows = profile?.resource_infrastructure_context?.mineSites;
  assert(Array.isArray(rows), countryId + ': mineSites must be an array');
  rows.forEach((site, index) => rawSites.push({ countryId, index, site }));
}
assert.equal(rawSites.length, 199);

const partFiles = [
  'resource_site_reference_expanded_part_01.json',
  'resource_site_reference_expanded_part_02.json',
  'resource_site_reference_expanded_part_03.json',
  'resource_site_reference_expanded_part_04.json'
];
const expanded = partFiles.flatMap((name) => {
  const part = read(name);
  assert.equal(part.sourceFiles.includes('resources.json'), true);
  assert.equal(part.sourceFiles.includes('resources_2.json'), true);
  return part.sites;
});

assert.equal(expanded.length, 199);
assert.equal(new Set(expanded.map((x) => x.siteId)).size, 199);

const rawById = new Map(rawSites.map((x) => [x.site.id, x]));
for (const ref of expanded) {
  const raw = rawById.get(ref.siteId);
  assert(raw, ref.siteId + ': expanded reference does not map to resources.json/resources_2.json');
  assert.equal(ref.countryId, raw.countryId, ref.siteId + ': country mismatch');
  assert.equal(ref.siteName, raw.site.siteName, ref.siteId + ': siteName mismatch');
  assert.equal(ref.sourcePath, `GSRSK_Master_CountryProfiles_v14.countryProfiles.${raw.countryId}.resource_infrastructure_context.mineSites[${raw.index}]`);
  assert.deepEqual(ref.sourceSiteRecord, raw.site, ref.siteId + ': sourceSiteRecord is not lossless');
  assert.deepEqual(ref.siteDataPackage, raw.site.siteDataPackage || null, ref.siteId + ': siteDataPackage mismatch');
  assert.equal(typeof ref.resourceTypeDefinition, 'object', ref.siteId + ': resourceTypeDefinition missing');
}

const countryContext = read('resource_country_resource_context_index.json');
assert.equal(countryContext.countryCount, 197);
assert.equal(Object.keys(countryContext.countries).length, 197);
for (const countryId of Object.keys(profiles)) {
  assert(countryContext.countries[countryId], countryId + ': missing country resource context');
}

const manifest = read('resource_site_reference_expanded_manifest.json');
assert.equal(manifest.totalSites, 199);
assert.equal(manifest.partCount, 4);
assert.equal(manifest.parts.length, 4);
assert.equal(manifest.countryContextFile, 'resource_country_resource_context_index.json');

console.log(JSON.stringify({
  certificate: 'OMEGA-RESOURCE-REFERENCE-LOSSLESS',
  status: 'PASS',
  sourceProfileCount: Object.keys(profiles).length,
  sourceSiteCount: rawSites.length,
  expandedSiteCount: expanded.length,
  uniqueSiteIds: new Set(expanded.map((x) => x.siteId)).size,
  countryContextCount: Object.keys(countryContext.countries).length
}, null, 2));
