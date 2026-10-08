import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => JSON.parse(fs.readFileSync(name, 'utf8'));
const catalog = read('resource_site_canonical_catalog_v1.json');
const parts = [1,2,3,4].map((n) => read(`resource_site_reference_expanded_part_${String(n).padStart(2,'0')}.json`));
const expanded = parts.flatMap((p) => p.sites || []);
const runtime = fs.readFileSync('omega_resource_endowment_runtime.js', 'utf8');

assert.equal(catalog.siteCount, 199);
assert.equal(catalog.sites.length, 199);
assert.equal(expanded.length, 199);
assert.equal(new Set(expanded.map((x) => x.siteId)).size, 199);

const byId = new Map(expanded.map((x) => [x.siteId, x]));
for (const site of catalog.sites) {
  const ref = byId.get(site.siteId);
  assert(ref, `${site.siteId}: missing lossless expanded reference`);
  assert(ref.sourceSiteRecord && typeof ref.sourceSiteRecord === 'object', `${site.siteId}: missing sourceSiteRecord`);
  assert.equal(ref.sourceSiteRecord.id, site.siteId, `${site.siteId}: source id mismatch`);
  assert.equal(ref.sourcePath, site.sourceReference?.sourcePath, `${site.siteId}: sourcePath mismatch`);
  assert.equal(ref.siteDataPackage?.siteId, site.siteId, `${site.siteId}: siteDataPackage mismatch`);
}

assert(runtime.includes('loadLosslessResourceReferenceData'), 'runtime must load lossless resource references');
assert(runtime.includes('enrichLosslessResourceReference'), 'runtime must enrich site rows from lossless references');
assert(runtime.includes('resourceJsonReference'), 'runtime must expose the preserved source resource JSON record');
assert(runtime.includes('LOSSLESS_RESOURCE_REFERENCE_INCOMPLETE'), 'runtime must fail closed if the 199-reference layer is incomplete');

const fieldPresence = new Map();
const walk = (value, path = '') => {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    fieldPresence.set(next, (fieldPresence.get(next) || 0) + 1);
    walk(child, next);
  }
};
for (const row of expanded) walk(row.sourceSiteRecord);

for (const required of [
  'siteId','resourceId','siteType','countryCode','locationNodeKey',
  'status','operationalStatus','owner','operator','extractionMethod',
  'siteIdentity','locationIdentity','extractionProfile','quantitativeProfile',
  'resourceIdentity','siteDataPackage'
]) {
  const count = expanded.filter((x) => x.sourceSiteRecord?.[required] != null).length;
  assert.equal(count, 199, `top-level source field ${required} must be preserved for all 199 records`);
}

const specialEvidenceCounts = {
  routeOrTransport: expanded.filter((x) => /route|transport|rail|road|pipeline|conveyor|port/i.test(JSON.stringify(x.sourceSiteRecord))).length,
  capacity: expanded.filter((x) => /capacity|throughput/i.test(JSON.stringify(x.sourceSiteRecord))).length,
  purityOrGrade: expanded.filter((x) => /purity|grade/i.test(JSON.stringify(x.sourceSiteRecord))).length,
  reserve: expanded.filter((x) => /reserve/i.test(JSON.stringify(x.sourceSiteRecord))).length
};

assert(specialEvidenceCounts.reserve > 0, 'reserve evidence must remain searchable');
assert(specialEvidenceCounts.purityOrGrade > 0, 'grade/purity evidence must remain searchable');
console.log(JSON.stringify({status:'PASS',siteCount:199,specialEvidenceCounts,distinctFieldPaths:fieldPresence.size}, null, 2));
