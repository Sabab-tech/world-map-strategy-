import assert from 'node:assert/strict';
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('omega_mine_inventory_logistics_manifest_v1.json', 'utf8'));
assert.equal(data.datasetId, 'OMEGA_MINE_TO_INVENTORY_LOGISTICS_MANIFEST_V1');
assert.equal(data.siteCount, 561);
assert.equal(data.records.length, data.siteCount);
assert.equal(new Set(data.records.map(x => x.siteId)).size, data.siteCount, 'site IDs must be unique');
assert.equal(data.simulationOnly, true);
const requiredModes = new Set(['TRUCK','RAIL','SHIP','PIPELINE']);
for (const r of data.records) {
  assert.ok(r.siteId && r.countryId && r.resourceId, 'site identity is required');
  assert.ok(r.origin && r.route && r.capacity && r.timing && r.inventory && r.operations, r.siteId);
  assert.ok(r.route.distanceKm > 0, r.siteId + ' distance');
  assert.ok(r.capacity.nominalUnitsPerTrip > 0, r.siteId + ' capacity');
  assert.ok(r.capacity.dailyCapacityUnits > 0, r.siteId + ' daily capacity');
  assert.ok(r.timing.estimatedTransitDays > 0 && r.timing.estimatedTotalDays > 0, r.siteId + ' ETA');
  assert.ok(r.route.legs.length >= 1, r.siteId + ' legs');
  assert.ok(r.route.legs.every(l => requiredModes.has(l.transportMode)), r.siteId + ' mode');
  assert.ok(r.route.legs.every(l => l.assetBinding.status === 'UNBOUND'), 'manifest must not invent owned transport assets');
  assert.equal(r.operations.inventoryReceiptRequiresShipmentMatch, true);
  assert.equal(r.operations.duplicateProtectionKey, 'siteId+productionBatchId+routeVersion');
  assert.equal(r.constraints.foreignTransitDefault, 'DENY');
  assert.equal(r.inventory.stockAuthority, 'COUNTRY_INVENTORY_RUNTIME');
  assert.equal(r.provenance.realWorldRouteVerified, false);
  assert.equal(r.provenance.logisticsValues, 'SIMULATED_GAMEPLAY_ESTIMATE');
  assert.ok(r.dataQuality.routeDistanceAvailable && r.dataQuality.capacityAvailable && r.dataQuality.etaAvailable);
}
for (const [key, count] of Object.entries(data.sourceCounts)) assert.ok(count > 0, key);
console.log('OMEGA MINE INVENTORY LOGISTICS MANIFEST TEST PASSED: ' + data.siteCount + ' unique sites');
