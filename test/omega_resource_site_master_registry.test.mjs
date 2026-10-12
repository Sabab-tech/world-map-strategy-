import assert from "node:assert/strict";
import fs from 'node:fs';
import path from "node:path";

const restorationManifest=JSON.parse(fs.readFileSync(new URL('../resource_site_verified_legacy_restoration_v1.json',import.meta.url),'utf8'));
const expectedSiteCount=250+restorationManifest.records.length;
const expectedCommercialSiteCount=246+restorationManifest.records.length;
const file=path.resolve(process.cwd(),"resource_site_master_registry_v1.json");
const doc=JSON.parse(fs.readFileSync(file,"utf8"));

assert.equal(doc.siteCount,expectedSiteCount);
assert.equal(doc.sites.length,expectedSiteCount);
assert.equal(new Set(doc.sites.map(s=>s.siteId)).size,expectedSiteCount);

for (const site of doc.sites) {
  assert.ok(site.countryId);
  assert.ok(site.siteId);
  assert.ok(site.sourcePath);
  assert.ok(site.sourceSiteRecord);
  assert.equal(site.sourceSiteRecord.id,site.siteId);
  assert.ok(site.real);
  assert.ok(site.real.resourceId);
  assert.equal(site.simulation.simulationOnly,true);
  assert.equal(site.simulation.capacityModel,"SYNTHETIC_GAMEPLAY_CAPACITY_V1");
  assert.ok(Array.isArray(site.simulation.transportRoute));
}

console.log(`PASS: ${expectedSiteCount}-site master registry integrity and real/simulation separation`);