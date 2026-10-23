import test from 'node:test';
import assert from 'node:assert/strict';

import '../omega_ui_v2/navigation-registry.js';
import '../omega_ui_v2/screens/police-fleet.js';
import '../omega_ui_v2/screens/resource-ministry.js';
import '../omega_ui_v2/screens/government.js';
import '../omega_ui_v2/screens/ministry-detail.js';
import '../omega_ui_v2/screens/mine-detail.js';
import '../omega_ui_v2/screens/industry.js';
import '../omega_ui_v2/screens/home-affairs.js';
import '../omega_ui_v2/screens/reports.js';
import '../omega_ui_v2/screens/economy.js';
import '../omega_ui_v2/app.js';
import '../omega_ui_v2/integration.js';
import { readFileSync } from 'node:fs';

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
    acceleration: index === 0 ? 48 : undefined,
    capabilities: index === 0 ? { response: 42, patrol: 52 } : undefined,
    terrain: index === 0 ? 'City streets' : undefined,
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
  assert.equal(model.vehicles[0].acceleration, 48);
  assert.equal(model.vehicles[0].capabilities.response, 42);
  assert.equal(model.vehicles[0].terrain, 'City streets');
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


test('Government directory never duplicates the Executive Cabinet as an ordinary ministry', () => {
  globalThis.OmegaCabinetUI = {
    ministriesDatabase: {
      cabinet_council: { id:'cabinet_council', title:'Executive Cabinet', category:'governance' },
      interior_security: { id:'interior_security', title:'Interior & Security', category:'governance', status:'PEACEFUL' },
      energy_mining: { id:'energy_mining', title:'Energy & Mining', category:'agriculture', status:'POWERFUL' }
    }
  };
  const rows = globalThis.OmegaUIV2Government.getMinistryRows();
  assert.deepEqual(rows.map((row) => row.id), ['interior_security', 'energy_mining']);
  assert.equal(rows.some((row) => row.id === 'cabinet_council'), false);
});

test('Home Affairs provides all six planned sections and does not create a separate recruitment destination', () => {
  const tabs = globalThis.OmegaUIV2HomeAffairs.tabs;
  assert.deepEqual(tabs.map((item) => item.id), ['dashboard', 'personnel', 'fleet', 'patrols', 'facilities', 'incidents']);
  assert.equal(tabs.some((item) => /recruit/i.test(item.id)), false);
});

test('industry view reads current country assets, cycles and projects without synthesizing factories', () => {
  globalThis.Game = { state: {
    resource: { BGD: { industrialNetwork: {
      projects: [{ projectId:'P-1', projectType:'MINE_CONSTRUCTION', status:'UNDER_CONSTRUCTION' }],
      factoryProductionCycles: { 'FAC-1': { status:'IN_PROGRESS', productionQuantity:20, sourceBatchIds:['B-1'] } }
    } } },
    economy: { BGD: { productionAssets: [
      { id:'FAC-1', factoryType:'STEEL_MILL', capacityPerDay:50, inputInventory:{ iron_ore:20 }, employment:{jobsFilled:3,jobsSupported:5} }
    ] } }
  } };
  globalThis.OmegaResourceIndustrialCatalogData = {
    factoryProfiles: { STEEL_MILL: { name:'Steel Mill', defaultRecipeId:'STEEL-RECIPE', employment:{jobsPerFactory:5} } }
  };
  const model = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'BGD' });
  assert.equal(model.factoryCount,1);
  assert.equal(model.factories[0].id,'FAC-1');
  assert.equal(model.factories[0].capacityPerDay,50);
  assert.equal(model.factories[0].inputRows[0].quantity,20);
  assert.equal(model.cycles.length,1);
  assert.equal(model.projects.length,1);
  assert.equal(globalThis.OmegaUIV2Industry.buildViewModel({countryId:'USA'}).factoryCount,0);
});

test('reports list nine source-linked report categories and do not treat missing data as zero', () => {
  globalThis.Game = { state: { resource:{BGD:{industrialNetwork:{projects:[]}}}, economy:{BGD:{productionAssets:[]}} } };
  globalThis.OmegaCountryDataGateway = {
    getSnapshot: () => ({ status:'OK', fields:{
      gdp:{status:'AVAILABLE',value:100,unit:'USD'},
      population:{status:'UNAVAILABLE',value:null}
    },diagnostics:{missingFields:['population']} })
  };
  globalThis.OmegaResourceSiteCanonicalCatalogData = { sites:[] };
  const model = globalThis.OmegaUIV2Reports.buildViewModel({countryId:'BGD'});
  assert.equal(model.categories.length,9);
  assert.equal(model.fields.available,1);
  assert.equal(model.fields.missing,1);
  assert.equal(model.available['resources-mining'],false);
  assert.equal(model.siteCount,0);
});

test('mine detail refuses an unknown siteId instead of showing a different site', () => {
  const root = { classList:{ add(){} }, innerHTML:'' };
  const result = globalThis.OmegaUIV2MineDetail.render(root, {
    countryId:'BGD',
    siteId:'BGD-NOT-REGISTERED',
    sites:[{siteId:'BGD-GAS-01',countryId:'BGD',resourceId:'natural_gas',siteName:'Known gas site'}]
  });
  assert.equal(result.ok,false);
  assert.equal(result.code,'CANONICAL_SITE_ID_NOT_FOUND');
  assert.ok(root.innerHTML.includes('BGD-NOT-REGISTERED'));
  assert.ok(root.innerHTML.includes('No substitute site'));
});

test('application shell exports explicit mount and contains only five intended global destinations', () => {
  const app = globalThis.OmegaUIV2App;
  assert.ok(app);
  assert.equal(typeof app.mount,'function');
  assert.deepEqual(app.destinations,['map','government','economy','industry','reports']);
  assert.equal(globalThis.OmegaUIV2Navigation.governmentDestinations.length,2);
});

test('economy model keeps unavailable cash and macroeconomic values unavailable', () => {
  globalThis.Game = { state:{ finance:{BGD:{}}, economy:{BGD:{currencyCode:'BDT'}} } };
  globalThis.OmegaCountryDataGateway = {
    getSnapshot: () => ({ fields:{gdp:{status:'AVAILABLE',value:42,unit:'USD'},debt:{status:'UNAVAILABLE',value:null}} })
  };
  const model = globalThis.OmegaUIV2Economy.buildViewModel({countryId:'BGD'});
  assert.equal(model.treasuryCash,null);
  assert.equal(model.gdp.value,42);
  assert.equal(model.debt.value,null);
  assert.equal(model.currencyCode,'BDT');
});


test('UI v2 integration is controllable and reports the real mount dependency', () => {
  const bridge = globalThis.OmegaUIV2Integration;
  assert.ok(bridge);
  assert.equal(bridge.isEnabled(), true);
  bridge.setEnabled(false);
  assert.equal(bridge.isEnabled(), false);
  const blocked = bridge.mountIntoCabinet();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'UI_V2_INTEGRATION_UNAVAILABLE');
  bridge.setEnabled(true);
  assert.equal(bridge.isEnabled(), true);
});

test('Government entry mount synchronizes existing layer, sidebar and map visibility', () => {
  const bridge = globalThis.OmegaUIV2Integration;
  const previous = {
    document:globalThis.document,
    app:globalThis.OmegaUIV2App,
    manager:globalThis.OmegaLayerManager,
    country:globalThis.OmegaMinistryViewCountry,
    updateBack:globalThis.updateGlobalBackButtonVisibility
  };
  const attributes = Object.create(null);
  const dashboard = { style:{}, setAttribute() {}, removeAttribute() {} };
  const world = { style:{} };
  const bodyAttrs = Object.create(null);
  const bodyClasses = new Set();
  const root = {
    style:{},
    classList:{ add() {}, remove() {} },
    setAttribute(key,value){ attributes[key]=String(value); },
    getAttribute(key){ return attributes[key] || null; },
    removeAttribute(key){ delete attributes[key]; }
  };
  const manager = {
    currentLayer:0,
    layerStack:[0],
    sidebarLayer:null,
    updateRightSidebar(layer){ this.sidebarLayer=layer; }
  };
  globalThis.document = {
    getElementById(id) {
      if (id === 'cabinet-full-window') return root;
      if (id === 'ministry-dashboard-view') return dashboard;
      if (id === 'world-ui-root') return world;
      return null;
    },
    body:{
      setAttribute(key,value){ bodyAttrs[key]=String(value); },
      classList:{ add(key){ bodyClasses.add(key); } }
    }
  };
  globalThis.OmegaUIV2App = { mount() { return { ok:true, mounted:true, route:'government' }; } };
  globalThis.OmegaLayerManager = manager;
  globalThis.OmegaMinistryViewCountry = 'BGD';
  globalThis.updateGlobalBackButtonVisibility = () => {};
  try {
    const result = bridge.mountIntoCabinet(root);
    assert.equal(result.ok,true);
    assert.equal(attributes['data-omega-ui-v2-active'],'true');
    assert.equal(bodyAttrs['data-active-layer'],'1');
    assert.ok(bodyClasses.has('modal-open'));
    assert.equal(manager.currentLayer,1);
    assert.equal(manager.sidebarLayer,1);
    assert.deepEqual(manager.layerStack,[0,1]);
    assert.equal(world.style.opacity,'0.5');
    assert.equal(world.style.pointerEvents,'none');
    assert.equal(dashboard.style.display,'none');
    assert.equal(root.style.display,'flex');
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document=previous.document;
    if (previous.app === undefined) delete globalThis.OmegaUIV2App; else globalThis.OmegaUIV2App=previous.app;
    if (previous.manager === undefined) delete globalThis.OmegaLayerManager; else globalThis.OmegaLayerManager=previous.manager;
    if (previous.country === undefined) delete globalThis.OmegaMinistryViewCountry; else globalThis.OmegaMinistryViewCountry=previous.country;
    if (previous.updateBack === undefined) delete globalThis.updateGlobalBackButtonVisibility; else globalThis.updateGlobalBackButtonVisibility=previous.updateBack;
  }
});

test('Back-to-Map bypasses legacy cabinet subsystem stack traps', () => {
  const bridge = globalThis.OmegaUIV2Integration;
  const previousManager = globalThis.OmegaLayerManager;
  const manager = {
    currentLayer:1,
    layerStack:[0,1,5],
    calledPop:false,
    popLayer() { this.calledPop = true; this.currentLayer = 5; },
    setLayer(layer, data, skipPush) { this.currentLayer = layer; }
  };
  globalThis.OmegaLayerManager = manager;
  try {
    assert.equal(bridge.closeToWorldMap(), true);
    assert.equal(manager.currentLayer, 0);
    assert.deepEqual(manager.layerStack, [0]);
    assert.equal(manager.calledPop, false);
  } finally {
    if (previousManager === undefined) delete globalThis.OmegaLayerManager;
    else globalThis.OmegaLayerManager = previousManager;
  }
});

test('production shell loads and offline-preloads every UI v2 module', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../omega-offline-map-sw.js', import.meta.url), 'utf8');
  const entry = readFileSync(new URL('../omega_ministry_entry_v3.js', import.meta.url), 'utf8');
  const modules = [
    'omega_ui_v2/omega-ui-v2.css',
    'omega_ui_v2/navigation-registry.js',
    'omega_ui_v2/screens/government.js',
    'omega_ui_v2/screens/ministry-detail.js',
    'omega_ui_v2/screens/economy.js',
    'omega_ui_v2/screens/resource-ministry.js',
    'omega_ui_v2/screens/mine-detail.js',
    'omega_ui_v2/screens/industry.js',
    'omega_ui_v2/screens/home-affairs.js',
    'omega_ui_v2/screens/police-fleet.js',
    'omega_ui_v2/screens/reports.js',
    'omega_ui_v2/app.js',
    'omega_ui_v2/integration.js'
  ];
  for (const modulePath of modules) {
    assert.ok(index.includes(modulePath), 'index.html must load ' + modulePath);
    assert.ok(sw.includes(modulePath), 'offline service worker must pre-cache ' + modulePath);
  }
  assert.match(sw, /omega-offline-atlas-shell-v26/);
  assert.match(entry, /OmegaUIV2Integration/);
  assert.match(entry, /opened-ui-v2/);
  assert.match(entry, /opened-primary/);
});
