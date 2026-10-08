import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const file=path.resolve(process.cwd(),"resource_site_master_registry_v1.json");
const doc=JSON.parse(fs.readFileSync(file,"utf8"));

assert.equal(doc.siteCount,199);
assert.equal(doc.sites.length,199);
assert.equal(new Set(doc.sites.map(s=>s.siteId)).size,199);

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

console.log("PASS: 199-site master registry integrity and real/simulation separation");