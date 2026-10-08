import assert from "node:assert/strict";
import fs from "node:fs";

const runtime=fs.readFileSync("omega_resource_endowment_runtime.js","utf8");
const master=JSON.parse(fs.readFileSync("resource_site_master_registry_v1.json","utf8"));

assert.equal(master.siteCount,199);
assert.equal(master.sites.length,199);
assert.equal(new Set(master.sites.map(s=>s.siteId)).size,199);
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

console.log("PASS: 199-site master registry + runtime promotion guard");