import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const readJson = path => JSON.parse(readFileSync(new URL('../'+path, import.meta.url), 'utf8'));
test('transport catalog uses country-site-type-count identity without vehicle registration IDs',()=>{
 const catalog=readJson('omega_logistics_transport_catalog_v1.json');
 assert.equal(catalog.identityModel,'COUNTRY_SITE_TRANSPORT_TYPE_COUNT');
 assert.equal(catalog.individualVehicleIdsRequired,false);
 assert.deepEqual(catalog.identityFields,['countryId','siteId','transportType','count']);
 assert.equal(catalog.transportTypes.length,5);
});
test('cargo-specific SVG catalog paths exist for every supported mode and cargo class',()=>{
 const catalog=readJson('omega_logistics_transport_catalog_v1.json');
 for(const mode of catalog.transportTypes){
  for(const [cargo,path] of Object.entries(mode.cargoIcons)){
   assert.ok(existsSync(new URL('../'+path,import.meta.url)), 'missing '+cargo+'/'+mode.id);
  }
 }
});
test('route runtime recalculates from fleet count and exposes cargo SVG mapping',()=>{
 const runtime=readFileSync(new URL('../omega_resource_industrial_network_v1.js',import.meta.url),'utf8');
 assert.match(runtime,/source\?\.fleetCount\?\?routeProfile\?\.transportFleet\?\./);
 assert.match(runtime,/fleetCapacityPerDay/);
 assert.match(runtime,/fleetSufficiency/);
 assert.match(runtime,/cargoIconPath/);
});
