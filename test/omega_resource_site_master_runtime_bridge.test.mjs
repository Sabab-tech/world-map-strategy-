import assert from "node:assert/strict";
import fs from 'node:fs';
import fs from "node:fs";

const restorationManifest=JSON.parse(fs.readFileSync(new URL('../resource_site_verified_legacy_restoration_v1.json',import.meta.url),'utf8'));
const expectedSiteCount=250+restorationManifest.records.length;
const expectedCommercialSiteCount=246+restorationManifest.records.length;
const runtime=fs.readFileSync("omega_resource_endowment_runtime.js","utf8");
const master=JSON.parse(fs.readFileSync("resource_site_master_registry_v1.json","utf8"));

assert.equal(master.siteCount,expectedSiteCount);
assert.equal(master.sites.length,expectedSiteCount);
assert.equal(new Set(master.sites.map(s=>s.siteId)).size,expectedSiteCount);
assert.match(runtime,/loadMasterResourceResearchData/);
assert.match(runtime,/RESOURCE_SITE_MASTER_RESEARCH_INCOMPLETE/);
assert.match(runtime,/resource_site_master_registry_v1\.json/);
assert.match(runtime,/masterSimulation/);
assert.match(runtime,/masterResearchSourceRecord/);

for(const site of master.sites){
  assert.ok(site.sourceSiteRecord);
  assert.equal(site.sourceSiteRecord.id,site.siteId);
  assert.equal(site.simulation.simulationOnly,true);
  assert.equal(site.simulation.capacityModel,"SYNTHETIC_GAMEPLAY_CAPACITY_V1");
}

console.log("PASS: ${expectedSiteCount}-site master registry + runtime promotion guard");