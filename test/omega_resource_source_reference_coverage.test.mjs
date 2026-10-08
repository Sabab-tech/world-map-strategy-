import assert from 'node:assert/strict';
import fs from 'node:fs';

const load = (name) => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const files = [load('resources.json'), load('resources_2.json')];
const catalog = load('resource_site_canonical_catalog_v1.json');
const runtime = fs.readFileSync(new URL('../omega_resource_endowment_runtime.js', import.meta.url), 'utf8');

const sourceSites = [];
for (const dataset of files) {
  const profiles = dataset?.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {};
  for (const [profileKey, profile] of Object.entries(profiles)) {
    const sites = profile?.resource_infrastructure_context?.mineSites || profile?.infrastructure_context?.mineSites || [];
    assert.ok(Array.isArray(sites), `mineSites must be an array for profile ${profileKey}`);
    for (const [index, site] of sites.entries()) {
      sourceSites.push({
        dataset: dataset === files[0] ? 'resources.json' : 'resources_2.json',
        profileKey,
        index,
        site
      });
    }
  }
}

assert.equal(sourceSites.length, 199, 'resources.json + resources_2.json must expose exactly 199 mine/resource site records');

const sourceIds = sourceSites.map(x => String(x.site?.siteId || x.site?.id || '').trim()).filter(Boolean);
assert.equal(sourceIds.length, 199, 'Every source site must have a stable siteId/id');
assert.equal(new Set(sourceIds).size, 199, 'Source site identities must be unique');

const catalogIds = catalog.sites.map(x => String(x.siteId || '').trim());
assert.equal(catalog.sites.length, 199, 'Canonical catalog must contain 199 sites');
assert.equal(new Set(catalogIds).size, 199, 'Canonical site identities must be unique');

const sourceIdSet = new Set(sourceIds);
const catalogIdSet = new Set(catalogIds);
for (const id of sourceIdSet) assert.ok(catalogIdSet.has(id), `Canonical catalog missing source site identity: ${id}`);
for (const id of catalogIdSet) assert.ok(sourceIdSet.has(id), `Canonical catalog contains non-source site identity: ${id}`);

for (const { site } of sourceSites) {
  const id = String(site?.siteId || site?.id || '').trim();
  assert.ok(site?.name || site?.siteName, `Missing site name for ${id}`);
  assert.ok(site?.countryCode || site?.countryId || site?.country, `Missing country identity for ${id}`);
  assert.ok(site?.siteType, `Missing site type for ${id}`);
  assert.ok(site?.resourceId || site?.resourceTypeId || site?.resourceTypeKey, `Missing resource identity for ${id}`);
}

assert.ok(runtime.includes('const sourceSiteId=String('), 'Runtime must derive the reference identity from the source site record');
assert.ok(runtime.includes('site.siteId||site.id||site.resourceInstanceId||site.instanceId||site.depositId||site.mineId'), 'Runtime must prefer a stable source identity before generating a fallback');
assert.ok(runtime.includes("referenceIdentity:'SOURCE_RESOURCE_SITE_ID'"), 'Runtime references must declare source identity provenance');
assert.ok(!runtime.includes("id:'SITE_REF_'+countryId+'_'+String(index+1).padStart(3,'0')"), 'Runtime must not overwrite every source site with a synthetic SITE_REF identity');

const requiredDetailPaths = [
  'siteDataPackage.processing',
  'siteDataPackage.quantitative.reserve',
  'siteDataPackage.quantitative.production',
  'siteDataPackage.quantitative.grade',
  'siteDataPackage.quantitative.recovery',
  'siteDataPackage.quantitative.purity',
  'siteDataPackage.quantitative.capacity'
];

const pathPresent = (value, path) => {
  const parts = path.split('.');
  let node = value;
  for (const part of parts) {
    if (node == null || !(part in node)) return false;
    node = node[part];
  }
  return true;
};

for (const { site } of sourceSites) {
  const id = String(site?.siteId || site?.id || '').trim();
  for (const path of requiredDetailPaths) {
    assert.ok(pathPresent(site, path), `Missing canonical detail container ${path} for ${id}`);
  }
}

console.log('PASS source-resource-reference coverage: 199/199 source site identities mapped 1:1 to canonical catalog and runtime preserves source IDs.');
