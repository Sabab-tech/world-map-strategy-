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
test('route runtime persists fleet counts, recalculates capacity and exposes cargo SVG mapping',()=>{
 const runtime=readFileSync(new URL('../omega_resource_industrial_network_v1.js',import.meta.url),'utf8');
 assert.match(runtime,/source\?\.fleetCount\?\?routeProfile\?\.transportFleet\?\./);
 assert.match(runtime,/function getTransportFleet\(/);
 assert.match(runtime,/function setTransportFleet\(/);
 assert.match(runtime,/function previewSiteTransport\(/);
 assert.match(runtime,/transportFleetBySiteId/);
 assert.match(runtime,/fleetCapacityPerDay/);
 assert.match(runtime,/fleetSufficiency/);
 assert.match(runtime,/cargoIconPath/);
});
test('Logistics UI exposes five count-based fleet forms and route calculations',()=>{
 const ui=readFileSync(new URL('../omega_resource_command_center_ui_v1.js',import.meta.url),'utf8');
 assert.match(ui,/data-form="logistics-fleet-site"/);
 assert.match(ui,/data-form="logistics-fleet-count"/);
 assert.match(ui,/setTransportFleet/);
 assert.match(ui,/previewSiteTransport/);
 assert.match(ui,/Calculated capacity \/ day/);
 assert.match(ui,/Save fleet profile/);
 assert.doesNotMatch(ui,/registration number input|vehicle registration field/i);
});
test('new catalog and all cargo icons are included in offline cache',()=>{
 const catalog=readJson('omega_logistics_transport_catalog_v1.json');
 const offline=readFileSync(new URL('../omega-offline-map-sw.js',import.meta.url),'utf8');
 assert.match(offline,/omega_logistics_transport_catalog_v1\.json/);
 assert.match(offline,/omega-offline-atlas-shell-v59/);
 for(const mode of catalog.transportTypes){
  for(const path of Object.values(mode.cargoIcons)){
   assert.ok(offline.includes('"./'+path+'"'),'offline cache missing '+path);
  }
 }
});


test('every cargo-specific train SVG contains visible locomotive and wheel geometry',()=>{
 const catalog=readJson('omega_logistics_transport_catalog_v1.json');
 for(const cargo of Object.keys(catalog.transportTypes[0].cargoIcons)){
  const path=catalog.transportTypes[0].cargoIcons[cargo].replace(/\\/[^/]+\\.svg$/,'/train.svg');
  const svg=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(svg,/<circle\\b/,'train SVG must contain wheels: '+cargo);
  assert.match(svg,/<path\\b/,'train SVG must contain visible rail/vehicle geometry: '+cargo);
  assert.match(svg,/<title\\b/,'train SVG must have an accessible title: '+cargo);
 }
});
