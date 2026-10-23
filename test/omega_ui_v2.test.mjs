import test from 'node:test';
import assert from 'node:assert/strict';

import '../omega_ui_v2/navigation-registry.js';
import '../omega_ui_v2/screens/police-fleet.js';
import '../omega_ui_v2/screens/resource-ministry.js';

test('Government navigation has exactly Executive Ministry and All Ministries', () => {
  const nav = globalThis.OmegaUIV2Navigation;
  assert.ok(nav);
  assert.deepEqual(nav.governmentDestinations.map((item) => item.id), ['executive-ministry', 'all-ministries']);
  assert.equal(nav.canRenderCountryOverview('executive-ministry'), true);
  assert.equal(nav.canRenderCountryOverview('all-ministries'), false);
  assert.equal(nav.normalizeGovernmentDestination('overview'), 'executive-ministry');
});

test('registry exposes only confirmed regular ministry IDs while documenting count mismatch', () => {
  const nav = globalThis.OmegaUIV2Navigation;
  assert.equal(nav.ministryIds.length, 17);
  assert.equal(new Set(nav.ministryIds).size, 17);
  assert.equal(nav.unresolvedDirectoryLabelCount, 18);
  assert.ok(nav.unresolvedCountNote.includes('reconcile'));
  assert.equal(nav.ministryIds.includes('cabinet_council'), false);
});

test('police fleet view model reads all 15 canonical profiles and preserves missing values', () => {
  const vehicles = Array.from({ length: 15 }, (_, index) => ({
    level: index + 1,
    id: 'vehicle-' + (index + 1),
    name: 'Vehicle ' + (index + 1),
    className: 'Tier ' + (index + 1),
    cost: index === 0 ? 1000 : undefined,
    speed: index === 0 ? 120 : undefined,
    environmentFit: { city: index === 0 ? 98 : undefined }
  }));
  globalThis.OmegaHomeMinistryEngine = {
    VEHICLES: vehicles,
    getCurrentCountryId: () => 'BGD',
    getState: () => ({
      unlockedVehicleLevel: 3,
      vehiclesOwned: { '1': 2, '2': 0, '3': 1 },
      pendingVehicleOrder: { level: 4, quantity: 2, totalCost: 5000 }
    })
  };
  globalThis.OMEGA_UI_ADAPTER = {
    getPoliceVehicleSvg: (level) => '<svg aria-label="Vehicle ' + level + '"></svg>',
    renderVehicleCatalog: () => {}
  };
  const model = globalThis.OmegaUIV2PoliceFleet.buildViewModel();
  assert.equal(model.ready, true);
  assert.equal(model.catalogCount, 15);
  assert.equal(model.catalogCountMatchesExpected, true);
  assert.deepEqual(model.vehicles.map((vehicle) => vehicle.level), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.equal(model.vehicles[0].ownedCount, 2);
  assert.equal(model.vehicles[3].pendingOrder.quantity, 2);
  assert.equal(model.vehicles[4].cost, null);
  assert.equal(model.vehicles[4].speed, null);
  assert.equal(model.vehicles[4].unlocked, false);
});

test('police fleet view model fails visibly rather than fabricating catalog entries', () => {
  delete globalThis.OmegaHomeMinistryEngine;
  const model = globalThis.OmegaUIV2PoliceFleet.buildViewModel();
  assert.equal(model.ready, false);
  assert.equal(model.catalogCount, 0);
  assert.equal(model.reason, 'CANONICAL_POLICE_VEHICLE_CATALOG_UNAVAILABLE');
});

test('resource site view model deduplicates by siteId and scopes country before presentation', () => {
  const sites = [
    { siteId: 'BGD-GAS-01', countryId: 'BGD', resourceId: 'natural_gas', siteName: 'Gas Site', quantitative: { reserve: { quantity: 40, unit: 'BCF', status: 'OBSERVED' }, production: { annual: 4, annualUnit: 'BCF/year', status: 'OBSERVED' } } },
    { siteId: 'BGD-GAS-01', countryId: 'BGD', resourceId: 'natural_gas', siteName: 'Duplicate Alias' },
    { siteId: 'USA-OIL-01', countryId: 'USA', resourceId: 'crude_oil', siteName: 'Oil Site' },
    { siteId: 'MISSING-COUNTRY', resourceId: 'coal', siteName: 'Incomplete Identity' }
  ];
  const model = globalThis.OmegaUIV2ResourceMinistry.buildViewModel({ countryId: 'BGD', sites });
  assert.equal(model.siteCount, 1);
  assert.equal(model.sites[0].siteId, 'BGD-GAS-01');
  assert.equal(model.sites[0].reserve.value, 40);
  assert.equal(model.sites[0].production.value, 4);
  assert.equal(model.sites[0].stock, null);
});

test('resource view model keeps simulated reserve out of reported reserve', () => {
  const model = globalThis.OmegaUIV2ResourceMinistry.buildViewModel({
    countryId: 'BGD',
    sites: [{
      siteId: 'BGD-IRON-01',
      countryId: 'BGD',
      resourceId: 'iron_ore',
      quantitative: { reserve: { quantity: null, unit: 'tonnes', status: 'UNQUANTIFIED' } },
      simulation: { reserve: { quantity: 5000, unit: 'tonnes', status: 'SIMULATED' } }
    }]
  });
  assert.equal(model.sites[0].reserve.value, null);
  assert.equal(model.sites[0].modeledReserve.modeledValue, 5000);
});
