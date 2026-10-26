import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';

import '../omega_ui_v2/navigation-registry.js';
import '../omega_ui_v2/ministry-visual-registry.js';
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
import '../omega_ui_v2/world-command-dock.js';
import { existsSync, readFileSync } from 'node:fs';

test('Government navigation has exactly Executive Ministry and All Ministries', () => {
  const nav = globalThis.OmegaUIV2Navigation;
  assert.ok(nav);
  assert.deepEqual(nav.governmentDestinations.map((item) => item.id), ['executive-ministry', 'all-ministries']);
  assert.equal(nav.canRenderCountryOverview('executive-ministry'), true);
  assert.equal(nav.canRenderCountryOverview('all-ministries'), false);
  assert.equal(nav.normalizeGovernmentDestination('overview'), 'executive-ministry');
});

test('registry exposes 18 canonical ministry destinations with local visual assets', () => {
  const nav = globalThis.OmegaUIV2Navigation;
  const visuals = globalThis.OmegaUIV2MinistryVisualRegistry;
  assert.equal(nav.ministryIds.length, 18);
  assert.equal(new Set(nav.ministryIds).size, 18);
  assert.equal(nav.visibleRegularMinistryCount, 17);
  assert.equal(nav.visibleMinistryCount, 18);
  assert.equal(nav.unresolvedDirectoryLabelCount, 0);
  assert.ok(nav.ministryIds.includes('cabinet_council'));
  assert.equal(visuals.count, 18);
  assert.deepEqual(visuals.ids, nav.ministryIds);
  assert.equal(visuals.get('defense').logo, 'assets/Military_Ministry_Logo_Concept_A.png.jpg');
  assert.equal(visuals.get('foreign_affairs').logo, 'assets/IMG_20260703_180105.jpg');
  assert.ok(visuals.get('intelligence_cyber').image.includes('China_Military_Facilities_What_Satellites_Reveal'));
  assert.ok(visuals.get('intelligence_cyber').gallery.includes('assets/images (14).jpeg'));
});

test('newly uploaded national-security, research and trade references are assigned to ministry galleries', () => {
  const visuals = globalThis.OmegaUIV2MinistryVisualRegistry;
  assert.ok(visuals.get('science_research').gallery.includes('assets/1776286900118.png'));
  assert.ok(visuals.get('trade').gallery.includes('assets/futuristic-digital-visualization-global-import-260nw-2615199881.jpg'));
  assert.ok(visuals.get('defense').gallery.includes('assets/vecteezy_ai-generated-futuristic-army-combatants-in-a-firefight-with_35839258.jpg'));
  assert.ok(visuals.get('intelligence_cyber').gallery.includes('assets/1783055273164.jpg'));
  assert.ok(visuals.get('intelligence_cyber').gallery.includes('assets/1783068102501.jpg'));
});

test('all ministry cover photos, gallery assets and uploaded logos exist in the repository', () => {
  const visuals = globalThis.OmegaUIV2MinistryVisualRegistry;
  for (const visual of visuals.list()) {
    for (const asset of [visual.image, visual.logo, ...(visual.gallery || [])].filter(Boolean)) {
      assert.ok(existsSync(new URL('../' + asset, import.meta.url)), visual.title + ' is missing asset ' + asset);
    }
  }
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


test('Government directory includes every canonical cabinet record', () => {
  globalThis.OmegaCabinetUI = {
    ministriesDatabase: {
      cabinet_council: { id:'cabinet_council', title:'Executive Cabinet', category:'governance' },
      interior_security: { id:'interior_security', title:'Interior & Security', category:'governance', status:'PEACEFUL' },
      energy_mining: { id:'energy_mining', title:'Energy & Mining', category:'agriculture', status:'POWERFUL' }
    }
  };
  const rows = globalThis.OmegaUIV2Government.getMinistryRows();
  assert.deepEqual(rows.map((row) => row.id), ['cabinet_council', 'interior_security', 'energy_mining']);
  assert.equal(rows.length, 3);
});

test('Home Affairs provides all six planned sections and does not create a separate recruitment destination', () => {
  const tabs = globalThis.OmegaUIV2HomeAffairs.tabs;
  assert.deepEqual(tabs.map((item) => item.id), ['dashboard', 'personnel', 'fleet', 'patrols', 'facilities', 'incidents', 'laws']);
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

test('industry command panel aggregates factory type totals using only selected-country assets', () => {
  const previousGame = globalThis.Game;
  const previousCatalog = globalThis.OmegaResourceIndustrialCatalogData;
  globalThis.Game = { state: {
    simulation: { session: { playerCountryId: 'BGD' }, turn: 12, daysPerTurn: 1 },
    resource: {
      BGD: { industrialNetwork: { projects: [], factoryProductionCycles: {}, factoryRuntime: {}, siteFlowLedger: [] } },
      USA: { industrialNetwork: { projects: [], factoryProductionCycles: {}, factoryRuntime: {}, siteFlowLedger: [] } }
    },
    economy: {
      BGD: { productionAssets: [
        { id:'BGD-STEEL-1', factoryType:'STEEL_MILL', name:'East Steel Works', capacityPerDay:120 },
        { id:'BGD-STEEL-2', factoryType:'STEEL_MILL', name:'West Steel Works', capacityPerDay:90 }
      ] },
      USA: { productionAssets: [
        { id:'USA-CEMENT-1', factoryType:'CEMENT_PLANT', name:'Foreign Cement Plant', capacityPerDay:400 }
      ] }
    }
  } };
  globalThis.OmegaResourceIndustrialCatalogData = {
    factoryProfiles: {
      STEEL_MILL: { name:'Steel Mill', defaultRecipeId:'STEEL-RECIPE' },
      CEMENT_PLANT: { name:'Cement Plant', defaultRecipeId:'CEMENT-RECIPE' }
    }
  };
  try {
    const model = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'BGD' });
    assert.equal(model.factoryCount, 2);
    assert.deepEqual(model.factoryTypeCounts.map((row) => ({ name:row.name, count:row.count })), [
      { name:'Steel Mill', count:2 }
    ]);
    const root = { classList:{ add(){} }, addEventListener(){}, contains(){ return true; } };
    const result = globalThis.OmegaUIV2Industry.render(root, { countryId:'BGD', tab:'factories' });
    assert.equal(result.ok, true);
    assert.match(root.innerHTML, /omega-v2-factory-command/);
    assert.match(root.innerHTML, /data-omega-v2-factory-card/);
    assert.match(root.innerHTML, /Steel Mill/);
    assert.match(root.innerHTML, /data-state="unknown"/);
    assert.match(root.innerHTML, /Total:<\/span><strong>2<\/strong>/);
    assert.doesNotMatch(root.innerHTML, /Foreign Cement Plant|CEMENT_PLANT/);
    assert.doesNotMatch(root.innerHTML, /Bangladesh Iron Mine|Daily mine production|FACTORY SVG SLOT/);
  } finally {
    if (previousGame === undefined) delete globalThis.Game; else globalThis.Game = previousGame;
    if (previousCatalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData;
    else globalThis.OmegaResourceIndustrialCatalogData = previousCatalog;
  }
});

test('industry research and technology records remain isolated to the selected country', () => {
  const previous = {
    Game:globalThis.Game, runtime:globalThis.OmegaCountryRuntimeData,
    catalog:globalThis.OmegaResourceIndustrialCatalogData, inventory:globalThis.OmegaCountryInventoryRuntime,
    omega:globalThis.Omega
  };
  globalThis.Omega = {};
  globalThis.OmegaCountryRuntimeData = null;
  globalThis.OmegaCountryInventoryRuntime = null;
  globalThis.OmegaResourceIndustrialCatalogData = { factoryProfiles:{} };
  globalThis.Game = { state:{
    resource:{
      BGD:{
        technologyResearchProjects:[{projectId:'BGD-TECH-1',technologyId:'ORE_SORTING',technologyName:'Ore Sorting',status:'IN_PROGRESS',progress:35,progressUnits:7,requiredUnits:20,startedTurn:4}],
        technologyTransfers:[{projectId:'BGD-IMPORT-1',technologyId:'MINE_AUTOMATION',status:'COMPLETED',donorCountryId:'USA',progress:100}],
        technologyCapabilities:[{capabilityId:'BGD-CAP-1',technologyId:'ORE_SORTING',sourceType:'RESEARCH',completedTurn:9}],
        industrialNetwork:{projects:[],factoryProductionCycles:{},factoryRuntime:{},siteFlowLedger:[]}
      },
      USA:{technologyResearchProjects:[{projectId:'USA-SECRET-1',technologyId:'UNRELATED_TECH',technologyName:'Foreign-only record',status:'IN_PROGRESS'}],
        technologyTransfers:[],technologyCapabilities:[],industrialNetwork:{projects:[],factoryProductionCycles:{},factoryRuntime:{},siteFlowLedger:[]}}
    },
    economy:{BGD:{productionAssets:[]},USA:{productionAssets:[]}}
  }};
  try {
    const model = globalThis.OmegaUIV2Industry.buildViewModel({countryId:'BGD'});
    assert.deepEqual(model.researchProjects.map(row=>row.projectId), ['BGD-TECH-1']);
    assert.deepEqual(model.technologyTransfers.map(row=>row.projectId), ['BGD-IMPORT-1']);
    assert.deepEqual(model.technologyCapabilities.map(row=>row.capabilityId), ['BGD-CAP-1']);
    const root = {classList:{add(){}}, addEventListener(){}, contains(){return true}};
    const rendered = globalThis.OmegaUIV2Industry.render(root,{countryId:'BGD',tab:'research'});
    assert.equal(rendered.ok,true);
    assert.match(root.innerHTML,/Ore Sorting/);
    assert.match(root.innerHTML,/MINE_AUTOMATION/);
    assert.doesNotMatch(root.innerHTML,/Foreign-only record|USA-SECRET-1|UNRELATED_TECH/);
  } finally {
    if (previous.Game === undefined) delete globalThis.Game; else globalThis.Game = previous.Game;
    if (previous.runtime === undefined) delete globalThis.OmegaCountryRuntimeData; else globalThis.OmegaCountryRuntimeData = previous.runtime;
    if (previous.catalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData; else globalThis.OmegaResourceIndustrialCatalogData = previous.catalog;
    if (previous.inventory === undefined) delete globalThis.OmegaCountryInventoryRuntime; else globalThis.OmegaCountryInventoryRuntime = previous.inventory;
    if (previous.omega === undefined) delete globalThis.Omega; else globalThis.Omega = previous.omega;
  }
});

test('selected ISO3 country resolves name-keyed economy data across Economy, Industry and Reports tabs', () => {
  const previous = {
    Game:globalThis.Game, runtime:globalThis.OmegaCountryRuntimeData,
    catalog:globalThis.OmegaResourceSiteCanonicalCatalogData, industrial:globalThis.OmegaResourceIndustrialCatalogData,
    inventory:globalThis.OmegaCountryInventoryRuntime, ministryCountry:globalThis.OmegaMinistryViewCountry,
    homeEngine:globalThis.OmegaHomeMinistryEngine, gateway:globalThis.OmegaCountryDataGateway, omega:globalThis.Omega
  };
  globalThis.Omega = {};
  globalThis.OmegaCountryRuntimeData = {
    resolveCountry(value) {
      const key = String(value || '').trim().toUpperCase();
      return key === 'BANGLADESH' || key === 'BGD' || key === 'BD'
        ? { countryCode:'BD', iso3:'BGD', numericCode:'050', name:'Bangladesh', economyKey:'BANGLADESH', populationKey:'BANGLADESH' }
        : key === 'UNITED STATES' || key === 'USA' || key === 'US'
          ? { countryCode:'US', iso3:'USA', numericCode:'840', name:'United States', economyKey:'USA', populationKey:'USA' }
          : null;
    }
  };
  globalThis.Game = {
    state:{
      resource:{ BGD:{ industrialNetwork:{ projects:[], factoryProductionCycles:{}, factoryRuntime:{}, siteFlowLedger:[] } } },
      economy:{ BANGLADESH:{ currencyCode:'BDT', gdp:195000000000,
        productionAssets:[{ id:'BGD-SMELTER-01', name:'National smelter', factoryType:'SMELTER', status:'ACTIVE' }],
        projects:[] } },
      finance:{ BANGLADESH:{ available:123456, currencyCode:'BDT', ledger:[] } }
    }
  };
  globalThis.OmegaResourceSiteCanonicalCatalogData = { sites:[
    { siteId:'BGD-MINE-01', countryId:'BGD', resourceId:'coal', siteName:'Bangladesh coal' },
    { siteId:'USA-MINE-01', countryId:'USA', resourceId:'copper', siteName:'United States copper' }
  ] };
  globalThis.OmegaResourceIndustrialCatalogData = { factoryProfiles:{ SMELTER:{ name:'Smelter', authority:'TEST' } } };
  globalThis.OmegaCountryInventoryRuntime = { getInventory(countryId) { return { status:'READY', countryId:countryId, items:[], unbounded:true }; } };
  globalThis.OmegaMinistryViewCountry = 'BD';
  globalThis.OmegaHomeMinistryEngine = null;
  globalThis.OmegaCountryDataGateway = null;
  try {
    const industry = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'BD' });
    assert.equal(industry.countryId, 'BGD');
    assert.equal(industry.factoryCount, 1, 'Industry must resolve legacy BANGLADESH-keyed economy assets');
    const economy = globalThis.OmegaUIV2Economy.buildViewModel({ countryId:'BD' });
    assert.equal(economy.countryId, 'BGD');
    assert.equal(economy.treasuryCash, 123456, 'Economy must resolve legacy BANGLADESH-keyed finance data');
    assert.equal(economy.currencyCode, 'BDT');
    const reports = globalThis.OmegaUIV2Reports.buildViewModel({ countryId:'BANGLADESH' });
    assert.equal(reports.countryId, 'BGD');
    assert.equal(reports.siteCount, 1, 'Reports must count only the selected country in the canonical site registry');
    assert.equal(reports.factoryCount, 1, 'Reports must resolve selected-country factories from the legacy economy bucket');
  } finally {
    if (previous.Game === undefined) delete globalThis.Game; else globalThis.Game = previous.Game;
    if (previous.runtime === undefined) delete globalThis.OmegaCountryRuntimeData; else globalThis.OmegaCountryRuntimeData = previous.runtime;
    if (previous.catalog === undefined) delete globalThis.OmegaResourceSiteCanonicalCatalogData; else globalThis.OmegaResourceSiteCanonicalCatalogData = previous.catalog;
    if (previous.industrial === undefined) delete globalThis.OmegaResourceIndustrialCatalogData; else globalThis.OmegaResourceIndustrialCatalogData = previous.industrial;
    if (previous.inventory === undefined) delete globalThis.OmegaCountryInventoryRuntime; else globalThis.OmegaCountryInventoryRuntime = previous.inventory;
    if (previous.ministryCountry === undefined) delete globalThis.OmegaMinistryViewCountry; else globalThis.OmegaMinistryViewCountry = previous.ministryCountry;
    if (previous.homeEngine === undefined) delete globalThis.OmegaHomeMinistryEngine; else globalThis.OmegaHomeMinistryEngine = previous.homeEngine;
    if (previous.gateway === undefined) delete globalThis.OmegaCountryDataGateway; else globalThis.OmegaCountryDataGateway = previous.gateway;
    if (previous.omega === undefined) delete globalThis.Omega; else globalThis.Omega = previous.omega;
  }
});

test('UI v2 integration normalizes map-selected aliases before mounting country screens', () => {
  const previous = {
    app:globalThis.OmegaUIV2App, runtime:globalThis.OmegaCountryRuntimeData,
    document:globalThis.document, ministryCountry:globalThis.OmegaMinistryViewCountry,
    homeEngine:globalThis.OmegaHomeMinistryEngine, gateway:globalThis.OmegaCountryDataGateway, omega:globalThis.Omega
  };
  let mountedOptions = null;
  globalThis.Omega = {};
  globalThis.OmegaCountryRuntimeData = {
    resolveCountry(value) {
      const key = String(value || '').trim().toUpperCase();
      return key === 'BANGLADESH' || key === 'BGD' || key === 'BD'
        ? { countryCode:'BD', iso3:'BGD', numericCode:'050', name:'Bangladesh', economyKey:'BANGLADESH' }
        : null;
    }
  };
  globalThis.OmegaHomeMinistryEngine = null;
  globalThis.OmegaCountryDataGateway = null;
  globalThis.document = { body:{ setAttribute(){}, classList:{ add(){}, remove(){}, toggle(){} } }, getElementById(){ return null; } };
  globalThis.OmegaUIV2App = { mount(root, options) { mountedOptions = options; return { mounted:true, route:options.initialRoute }; } };
  const root = { style:{}, setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; } };
  try {
    const result = globalThis.OmegaUIV2Integration.mountIntoCabinet(root, { countryId:'BANGLADESH', initialRoute:'economy' });
    assert.equal(result.ok, true);
    assert.equal(result.countryId, 'BGD');
    assert.equal(mountedOptions.countryId, 'BGD');
    assert.equal(mountedOptions.countryOptions[0].id, 'BGD');
    mountedOptions.onCountryChange('BD');
    assert.equal(globalThis.OmegaMinistryViewCountry, 'BGD');
  } finally {
    if (previous.app === undefined) delete globalThis.OmegaUIV2App; else globalThis.OmegaUIV2App = previous.app;
    if (previous.runtime === undefined) delete globalThis.OmegaCountryRuntimeData; else globalThis.OmegaCountryRuntimeData = previous.runtime;
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.ministryCountry === undefined) delete globalThis.OmegaMinistryViewCountry; else globalThis.OmegaMinistryViewCountry = previous.ministryCountry;
    if (previous.homeEngine === undefined) delete globalThis.OmegaHomeMinistryEngine; else globalThis.OmegaHomeMinistryEngine = previous.homeEngine;
    if (previous.gateway === undefined) delete globalThis.OmegaCountryDataGateway; else globalThis.OmegaCountryDataGateway = previous.gateway;
    if (previous.omega === undefined) delete globalThis.Omega; else globalThis.Omega = previous.omega;
  }
});

test('industry screen exposes the country-wide unbounded inventory without replacing factory input stock', () => {
  const previous = globalThis.OmegaCountryInventoryRuntime;
  globalThis.OmegaCountryInventoryRuntime = {
    getInventory(countryId, options) {
      assert.equal(options.includeZero, true);
      assert.equal(options.includeLedger, false);
      return {
        status: 'READY',
        countryId: countryId,
        countryName: 'Bangladesh',
        active: countryId === 'BGD',
        readOnly: countryId !== 'BGD',
        unbounded: true,
        items: [{
          productId: 'steel',
          name: 'Steel',
          base: 5,
          quantity: 9,
          deltaFromBase: 4,
          unit: 'SIMULATION_RESOURCE_UNIT'
        }]
      };
    }
  };
  try {
    const model = globalThis.OmegaUIV2Industry.buildViewModel({ countryId: 'BGD' });
    assert.equal(model.nationalInventory.items[0].quantity, 9);
    const root = {
      classList: { add() {} },
      addEventListener() {},
      innerHTML: ''
    };
    const result = globalThis.OmegaUIV2Industry.render(root, { countryId: 'BGD', tab: 'national-inventory' });
    assert.equal(result.ok, true);
    assert.match(root.innerHTML, /National Inventory/);
    assert.match(root.innerHTML, /Steel/);
    assert.match(root.innerHTML, /UNBOUNDED STOCK LOG/);
    assert.match(root.innerHTML, /Input Inventory/);
  } finally {
    if (previous === undefined) delete globalThis.OmegaCountryInventoryRuntime;
    else globalThis.OmegaCountryInventoryRuntime = previous;
  }
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
  assert.deepEqual(app.destinations,['map','overview','government','economy','more','industry','reports','religion']);
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
    assert.equal(manager.sidebarLayer,null,'UI v2 mount must not invoke the retired sidebar renderer');
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

test('retired operational-console bridge cannot mutate the active UI or legacy layer stack', () => {
  const bridge = globalThis.OmegaUIV2Integration;
  const previous = { document:globalThis.document, manager:globalThis.OmegaLayerManager, notification:globalThis.showOmegaNotification };
  const attrs = { 'data-omega-ui-v2-active':'true' };
  const root = { style:{display:'flex'}, __omegaUIV2State:{route:'ministry-detail',ministryId:'defense'},
    setAttribute(k,v){attrs[k]=String(v);}, getAttribute(k){return attrs[k]||null;}, removeAttribute(k){delete attrs[k];} };
  const dashboard={style:{}}, world={style:{}}, bodyAttrs={};
  const manager={currentLayer:1,layerStack:[0,1],setLayerCalls:0,sidebarCalls:0,
    setLayer(){this.setLayerCalls+=1;},updateRightSidebar(){this.sidebarCalls+=1;}};
  globalThis.document={getElementById(id){return id==='cabinet-full-window'?root:id==='ministry-dashboard-view'?dashboard:id==='world-ui-root'?world:null;},
    body:{setAttribute(k,v){bodyAttrs[k]=String(v);},classList:{add(){},remove(){}}}};
  globalThis.OmegaLayerManager=manager;
  globalThis.showOmegaNotification=()=>{};
  try {
    const result=bridge.openOperationalConsole('defense');
    assert.equal(result.ok,false);
    assert.equal(result.code,'LEGACY_UI_DISCONNECTED');
    assert.equal(manager.currentLayer,1);
    assert.equal(manager.setLayerCalls,0);
    assert.equal(manager.sidebarCalls,0);
    assert.equal(root.__omegaUIV2State.route,'ministry-detail');
    assert.equal(root.getAttribute('data-omega-ui-v2-active'),'true');
  } finally {
    if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document;
    if(previous.manager===undefined)delete globalThis.OmegaLayerManager;else globalThis.OmegaLayerManager=previous.manager;
    if(previous.notification===undefined)delete globalThis.showOmegaNotification;else globalThis.showOmegaNotification=previous.notification;
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

test('production shell loads UI v2 and excludes retired UI controllers from the active cache', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../omega-offline-map-sw.js', import.meta.url), 'utf8');
  const entry = readFileSync(new URL('../omega_ministry_entry_v3.js', import.meta.url), 'utf8');
  const modules = [
    'omega_ui_v2/omega-ui-v2.css','omega_ui_v2/navigation-registry.js',
    'omega_ui_v2/screens/government.js','omega_ui_v2/screens/ministry-detail.js',
    'omega_ui_v2/screens/economy.js','omega_ui_v2/screens/resource-ministry.js',
    'omega_ui_v2/screens/mine-detail.js','omega_ui_v2/screens/industry.js',
    'omega_ui_v2/screens/home-affairs.js','omega_ui_v2/screens/police-fleet.js',
    'omega_ui_v2/screens/reports.js','omega_ui_v2/app.js',
    'omega_ui_v2/integration.js','omega_ui_v2/world-command-dock.js'
  ];
  for (const modulePath of modules) {
    assert.ok(index.includes(modulePath), 'index.html must load ' + modulePath);
    assert.ok(sw.includes(modulePath), 'offline service worker must pre-cache ' + modulePath);
  }
  assert.match(sw, /omega-offline-atlas-shell-v\d+/);
  assert.ok(entry.includes('OmegaUIV2Integration'));
  assert.ok(entry.includes('opened-ui-v2'));
  assert.equal(entry.includes('openMainMinistryView'), false);
  assert.equal(entry.includes('OmegaLayerManager.setLayer'), false);
  assert.equal(entry.includes('renderCabinet('), false);
  for (const retired of ['omega_ui_system_redesign_v1.js','omega_ui_interaction_guard.js','omega_ui_button_system_v1.js']) {
    assert.equal(index.includes('src="' + retired + '"'),false, retired + ' must not load');
    assert.equal(sw.includes('"./' + retired + '"'),false, retired + ' must not be pre-cached');
  }
});

test('world command dock exposes the unified mobile-first primary routes', () => {
  const dock = globalThis.OmegaUIV2WorldCommandDock;
  assert.ok(dock);
  assert.deepEqual(dock.routes.map((item) => item.id), ['map','overview','government','economy','more']);
  assert.equal(typeof dock.mount, 'function');
  assert.equal(typeof dock.launch, 'function');
});


test('religion and ideology navigation stays inside UI v2', () => {
  const app = globalThis.OmegaUIV2App;
  assert.ok(app.destinations.includes('religion'));
  const source = readFileSync(new URL('../omega_ui_v2/app.js', import.meta.url), 'utf8');
  assert.ok(source.includes('mosque-architecture'));
  assert.equal(source.includes('openReligionIdeologySystem(event)'), false);
  assert.equal(source.includes('data-omega-v2-open-religion'), false);
  assert.ok(source.includes('data-omega-v2-global-nav="government"'));
  assert.ok(source.includes("photoMarkup('mosque-architecture'"));
  assert.equal(source.includes("domainPhoto('mosque-architecture'"), false);
});

test('Government exposes emblems, minister recruitment and a stable future portrait slot', () => {
  const government = readFileSync(new URL('../omega_ui_v2/screens/government.js', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../omega_ui_v2/screens/ministry-detail.js', import.meta.url), 'utf8');
  assert.match(government, /function ministerRecruitmentTable\(rows\)/);
  assert.match(government, /data-omega-v2-minister-recruitment=/);
  assert.match(government, /data-omega-v2-minister-portrait-slot/);
  assert.match(government, /g\.OmegaMinisterRecruitment/);
  assert.match(government, /engine\.fetchRoster/);
  assert.match(government, /OmegaLiveMinisterSelectorV9/);
  assert.match(detail, /omega-v2-ministry-appointed-minister/);
  const portrait = globalThis.OmegaUIV2Government.renderMinisterPortrait({ id:'treasury_finance', ministerName:'Test Minister', ministerPortraitUrl:'assets/ministers/test-minister.webp' });
  assert.match(portrait, /data-omega-v2-minister-portrait-slot/);
  assert.match(portrait, /src="assets\/ministers\/test-minister\.webp"/);
  const placeholder = globalThis.OmegaUIV2Government.renderMinisterPortrait({ id:'treasury_finance', ministerName:'Test Minister' });
  assert.match(placeholder, /MINISTER PORTRAIT/);
  const previousCabinet = globalThis.OmegaCabinetUI;
  globalThis.OmegaCabinetUI = { ministriesDatabase:{
    cabinet_council:{ id:'cabinet_council', title:'Executive Cabinet', category:'governance' },
    interior_security:{ id:'interior_security', title:'Interior & Security', category:'governance' },
    treasury_finance:{ id:'treasury_finance', title:'Treasury & Finance', category:'finance' }
  } };
  const root = { classList:{ add(){} }, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, innerHTML:'', contains(){ return true; } };
  try {
    const rendered = globalThis.OmegaUIV2Government.render(root, { view:'all-ministries', countryId:'BGD' });
    assert.equal(rendered.ministryCount, 3);
    assert.match(root.innerHTML, /omega-v2-ministry-grid/);
    assert.match(root.innerHTML, /data-omega-v2-ministry-rotator/);
    assert.match(root.innerHTML, /data-omega-v2-minister-portrait-slot/);
    assert.match(root.innerHTML, /Recruit \/ Replace/);
    assert.match(root.innerHTML, /class="omega-v2-ministry-logo-image"/, 'ministry logo asset must be rendered in the directory card');
    assert.ok(root.innerHTML.includes('assets/ui-photos/bangladesh-police-headquarters.webp') || root.innerHTML.includes('assets/economy_bg.jpg.jpg'));
  } finally {
    globalThis.OmegaCabinetUI = previousCabinet;
  }
});

test('Universal navigation keeps the World tab internal and supplies a separate exit action', () => {
  const appSource = readFileSync(new URL('../omega_ui_v2/app.js', import.meta.url), 'utf8');
  const bridgeSource = readFileSync(new URL('../omega_ui_v2/integration.js', import.meta.url), 'utf8');
  assert.ok(appSource.includes('data-omega-v2-jump-ministry'));
  assert.ok(appSource.includes('data-omega-v2-jump-route'));
  assert.ok(appSource.includes('data-omega-v2-exit'));
  assert.ok(appSource.includes('historySnapshot(state)'));
  assert.equal(appSource.includes("destination === 'map' && stateFor(root).options"), false);
  assert.equal(bridgeSource.includes('renderMap:function () { return closeToWorldMap(); }'), false);
});

test('economy USD formatting works in the legacy Android 9 WebView NumberFormat implementation', () => {
  const source = readFileSync(new URL('../omega_ui_v2/screens/economy.js', import.meta.url), 'utf8');
  const nativeNumberFormat = Intl.NumberFormat;
  const sandbox = {};
  sandbox.Intl = {
    NumberFormat: function (locale, options) {
      // Chromium 66 could fail when currency maximumFractionDigits is set to 1
      // without also overriding the currency's default minimumFractionDigits (2).
      if (options && options.style === 'currency' &&
          options.minimumFractionDigits === undefined &&
          options.maximumFractionDigits !== undefined && options.maximumFractionDigits < 2) {
        throw new RangeError('maximumFractionDigits value is out of range');
      }
      // Android 9 WebView predates the Intl compact-notation option.
      const compatibleOptions = Object.assign({}, options || {});
      delete compatibleOptions.notation;
      return new nativeNumberFormat(locale, compatibleOptions);
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'omega_ui_v2/screens/economy.js', timeout:1000 });
  sandbox.Game = { state: { finance: { USA: {
    available:2500000000, revenue:3500000, expenditure:1000000, budgetBalance:250000000
  } }, economy: { USA:{} } } };
  sandbox.OmegaCountryDataGateway = {
    getSnapshot: () => ({ fields: {
      gdp:{status:'AVAILABLE', value:7000000000000, unit:'USD', sourceName:'fixture'},
      inflation:{status:'UNAVAILABLE', value:null},
      debtToGdpPct:{status:'UNAVAILABLE', value:null},
      reserves:{status:'UNAVAILABLE', value:null},
      debt:{status:'UNAVAILABLE', value:null},
      tradeBalance:{status:'UNAVAILABLE', value:null}
    } })
  };
  const root = {
    innerHTML:'',
    classList:{ add(){} },
    addEventListener(){},
    __omegaV2EconomyBound:true
  };
  const result = sandbox.OmegaUIV2Economy.render(root, { countryId:'USA', tab:'overview' });
  assert.equal(result.ok, true);
  assert.match(root.innerHTML, /\$2\.5B/);
  assert.match(root.innerHTML, /\$3,500,000\.00/);
  assert.match(root.innerHTML, /\$7T/);
});

test('Finance has six separate data-backed tabs', () => {
  const finance = globalThis.OmegaUIV2Economy;
  assert.ok(finance);
  assert.deepEqual(finance.tabs.map((item) => item.id), ['overview', 'treasury', 'budget', 'debt', 'monetary', 'trade']);
  const source = readFileSync(new URL('../omega_ui_v2/screens/economy.js', import.meta.url), 'utf8');
  assert.match(source, /data-omega-v2-economy-tab/);
  assert.match(source, /data-omega-v2-finance-panel/);
  assert.match(source, /Game\.state\.finance\[country\]/);
  const root = { classList:{ add(){} }, addEventListener(){}, innerHTML:'' };
  for (const tab of finance.tabs) {
    const result = finance.render(root, { countryId:'BGD', tab:tab.id });
    assert.equal(result.tab, tab.id);
    assert.ok(root.innerHTML.includes('data-omega-v2-finance-panel="' + tab.id + '"'));
  }
});

test('Home Affairs hides unready shared placeholders and shows the Bangladesh reference photo only for Bangladesh', () => {
  const keys = ['OmegaHomeMinistryEngine','OmegaCountryRuntimeData','OmegaCountryDataGateway','OmegaUIPhotoAssets','OmegaMinistryViewCountry'];
  const prior = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  globalThis.OmegaMinistryViewCountry = '';
  globalThis.OmegaCountryRuntimeData = {
    resolveCountry(value) {
      const raw = String(value || '').trim().toUpperCase();
      if (['BD','BGD','BDG','BANGLADESH'].includes(raw)) return { countryCode:'BD', iso3:'BGD', name:'Bangladesh' };
      if (['US','USA','UNITED STATES'].includes(raw)) return { countryCode:'US', iso3:'USA', name:'United States' };
      return null;
    }
  };
  globalThis.OmegaCountryDataGateway = null;
  globalThis.OmegaUIPhotoAssets = {
    get(id) {
      return id === 'bangladesh-police-headquarters'
        ? { path:'assets/ui-photos/bangladesh-police-headquarters.webp', caption:'Bangladesh police headquarters' }
        : null;
    }
  };
  globalThis.OmegaHomeMinistryEngine = {
    getState(country) {
      if (String(country).toUpperCase() === 'USA') {
        return { baselineVersion:0, baselineSource:null, policeCount:250, policeEfficiency:60, policeTrust:55, publicSatisfaction:55, vehiclesOwned:{}, incidentLedger:[], unlockedVehicleLevel:1, specialAgents:0, recruitmentFeePerOfficerUsd:500, dailySalaryPerOfficerUsd:1, facilityLevels:{station:1}, trainingQualityLevel:1, policeRecruitmentLevel:1, patrolPlan:{urban:25} };
      }
      return { baselineVersion:1, baselineSource:'OMEGA_COUNTRY_POLICE_BASELINE_V1',
        openingConditionModel:'MODELED_COUNTRY_SPECIFIC_POLICE_FLEET_CRIME_GEOGRAPHY_V1',
        policeCount:205417, policeEfficiency:61, policeTrust:67, publicSatisfaction:65,
        vehiclesOwned:{'1':2894}, incidentLedger:[], unlockedVehicleLevel:1, specialAgents:0,
        recruitmentFeePerOfficerUsd:500, dailySalaryPerOfficerUsd:1.88, facilityLevels:{station:1},
        trainingQualityLevel:1, policeRecruitmentLevel:1, patrolPlan:{urban:25} };
    },
    estimateRecruitmentImpact() { return { ok:true, upfrontCostUsd:500, addedDailyPayrollUsd:1, additionalIncidentsAvoidedPerYear:1 }; },
    getCountryFleetSnapshot() { return { ownedUnits:0 }; }
  };
  try {
    const usRoot = { classList:{ add(){} }, addEventListener(){}, contains(){return true;} };
    const usRender = globalThis.OmegaUIV2HomeAffairs.render(usRoot,{countryId:'USA'});
    assert.equal(usRender.ok,true);
    assert.match(usRoot.innerHTML,/COUNTRY BASELINE LOADING/);
    assert.match(usRoot.innerHTML,/Not recorded/);
    assert.doesNotMatch(usRoot.innerHTML,/<strong>250<\/strong>|<strong>60%<\/strong>|<strong>55%<\/strong>/);
    assert.doesNotMatch(usRoot.innerHTML,/bangladesh-police-headquarters/);

    const bdRoot = { classList:{ add(){} }, addEventListener(){}, contains(){return true;} };
    const bdRender = globalThis.OmegaUIV2HomeAffairs.render(bdRoot,{countryId:'BDG'});
    assert.equal(bdRender.ok,true);
    assert.match(bdRoot.innerHTML,/COUNTRY BASELINE READY/);
    assert.match(bdRoot.innerHTML,/bangladesh-police-headquarters\.webp/);
    assert.match(bdRoot.innerHTML,/<strong>205,417<\/strong>/);
    assert.match(bdRoot.innerHTML,/<strong>61%<\/strong>/);
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete globalThis[key];
      else globalThis[key] = prior[key];
    }
  }
});


test('factory command cards use canonical SVGs, daily production state, type counts and conditional neon selection', () => {
  const keys = ['Game','OmegaResourceIndustrialCatalogData','Omega','currentActiveCountry'];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  globalThis.Omega = {};
  globalThis.currentActiveCountry = 'BGD';
  globalThis.OmegaResourceIndustrialCatalogData = {
    factoryProfiles: {
      STEEL_AND_ALLOY_WORKS: { name:'Steel and Alloy Works' },
      INDUSTRIAL_CHEMICALS_GAS_PLANT: { name:'Industrial Chemicals and Gases' },
      RARE_EARTH_BENEFICIATION_PLANT: { name:'Rare Earth Processing' }
    },
    factoryTypeAliases: {}
  };
  globalThis.Game = { state: {
    simulation: { session: { playerCountryId:'BGD' }, turn:4, daysPerTurn:1 },
    resource: { BGD: { industrialNetwork: {
      projects:[],
      factoryProductionCycles:{
        'FAC-STEEL':{status:'IN_PROGRESS',productionQuantity:125,cycleDays:1},
        'FAC-CHEM':{status:'IN_PROGRESS',productionQuantity:62,cycleDays:1},
        'FAC-STOP':{status:'PAUSED',productionQuantity:0,cycleDays:1}
      },
      factoryRuntime:{}, siteFlowLedger:[]
    } } },
    economy: { BGD: { productionAssets:[
      {id:'FAC-STEEL',name:'Steel Factory',factoryType:'STEEL_AND_ALLOY_WORKS',status:'OPERATIONAL',
        capacityPerDay:125,outputPerDay:125,outputUnit:'tonnes',outputResourceId:'steel',
        productionHealth:{status:'RUNNING',productivityPct:100,productionUnitsPerCycle:125,outputPerDay:125,outputUnit:'tonnes',outputResourceId:'steel'}},
      {id:'FAC-CHEM',name:'Chemical Factory',factoryType:'INDUSTRIAL_CHEMICALS_GAS_PLANT',status:'OPERATIONAL',
        capacityPerDay:125,outputPerDay:62,outputUnit:'tonnes',outputResourceId:'chemicals',
        productionHealth:{status:'REDUCED',productivityPct:49.6,productionUnitsPerCycle:62,outputPerDay:62,outputUnit:'tonnes',outputResourceId:'chemicals',reason:'FACTORY_UTILITY_SHORTAGE'}},
      {id:'FAC-STOP',name:'Rare Materials Factory',factoryType:'RARE_EARTH_BENEFICIATION_PLANT',status:'OPERATIONAL',
        capacityPerDay:90,outputPerDay:70,outputUnit:'tonnes',outputResourceId:'rare_materials',
        productionHealth:{status:'STOPPED',productivityPct:0,productionUnitsPerCycle:0,outputPerDay:70,outputUnit:'tonnes',outputResourceId:'rare_materials',reason:'FACTORY_INPUT_SHORTAGE'}}
    ] } }
  } };
  const handlers = {};
  const root = {
    classList:{add(){}},
    addEventListener(name,handler){handlers[name]=handler;},
    contains(){return true;},
    querySelector(){return null;},
    innerHTML:''
  };
  try {
    const result = globalThis.OmegaUIV2Industry.render(root,{countryId:'BGD',tab:'factories'});
    assert.equal(result.ok,true);
    assert.equal(result.model.factoryCount,3);
    assert.equal((root.innerHTML.match(/data-omega-v2-factory-card/g)||[]).length,3);
    assert.match(root.innerHTML,/assets\/omega-industrial-icons-v1\/factories\/steel-and-alloy-works\.svg/);
    assert.match(root.innerHTML,/assets\/omega-industrial-icons-v1\/factories\/industrial-chemicals-gas-plant\.svg/);
    assert.match(root.innerHTML,/assets\/omega-industrial-icons-v1\/factories\/rare-earth-beneficiation-plant\.svg/);
    assert.match(root.innerHTML,/data-state="running"/);
    assert.match(root.innerHTML,/data-state="reduced"/);
    assert.match(root.innerHTML,/data-state="stopped"/);
    assert.match(root.innerHTML,/\+ 125 tonnes\/day/);
    assert.match(root.innerHTML,/\+ 62 tonnes\/day/);
    assert.match(root.innerHTML,/0 tonnes\/day/);
    assert.match(root.innerHTML,/factory utility shortage/i);
    assert.match(root.innerHTML,/data-omega-v2-factory-build="FAC-STEEL"/);
    assert.match(root.innerHTML,/data-omega-v2-factory-destroy="FAC-STEEL"/);
    assert.match(root.innerHTML,/commons\.wikimedia\.org\/wiki\/File:Industrial_production_line_operating_in_a_large_modern_factory\.jpg/);
    assert.match(root.innerHTML,/creativecommons\.org\/licenses\/by\/2\.0\//);
    assert.match(root.innerHTML,/Image resized and converted to WebP/);
    const click = handlers.click;
    assert.equal(typeof click,'function');
    click({target:{closest(selector){
      if(selector==='[data-omega-v2-factory-select]')return{getAttribute(){return 'FAC-STEEL';}};
      return null;
    }}});
    assert.match(root.innerHTML,/data-factory-id="FAC-STEEL" data-state="running" data-selected="true"/);
    const css = readFileSync(new URL('../omega_ui_v2/factory-production-command.css',import.meta.url),'utf8');
    assert.match(css,/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css,/data-state="stopped"/);
    assert.match(css,/data-selected="true"\]\[data-state="running"/);
    assert.match(css,/data-selected="true"\]\[data-state="reduced"/);
  } finally {
    for(const key of keys) {
      if(previous[key]===undefined)delete globalThis[key];
      else globalThis[key]=previous[key];
    }
  }
});

test('Home Affairs legal register shows stored law sections and never fabricates missing law text', () => {
  const previousEngine = globalThis.OmegaHomeMinistryEngine;
  globalThis.OmegaHomeMinistryEngine = {
    getState: () => ({ laws:[{ name:'Public Safety Act', sections:[{ number:'12', title:'Police accountability', text:'Recorded provision text.' }] }] }),
    estimateRecruitmentImpact: () => ({ ok:false, code:'TEST_QUOTE_UNAVAILABLE' }),
    getCountryFleetSnapshot: () => null
  };
  const root = { classList:{ add(){} }, addEventListener(){}, querySelector(){ return null; }, innerHTML:'' };
  try {
    const result = globalThis.OmegaUIV2HomeAffairs.render(root, { countryId:'BGD', tab:'laws' });
    assert.equal(result.tab, 'laws');
    assert.match(root.innerHTML, /Public Safety Act/);
    assert.match(root.innerHTML, /Police accountability/);
    assert.match(root.innerHTML, /Recorded provision text\./);
    assert.match(root.innerHTML, /Law \/ Act/);
  } finally {
    globalThis.OmegaHomeMinistryEngine = previousEngine;
  }
});

test('factory screen uses canonical local SVG art while fleet screens keep their local photos', () => {
  const industry = readFileSync(new URL('../omega_ui_v2/screens/industry.js', import.meta.url), 'utf8');
  const fleet = readFileSync(new URL('../omega_ui_v2/screens/police-fleet.js', import.meta.url), 'utf8');
  assert.match(industry, /function factorySvgMarkup\(factory\)/);
  assert.match(industry, /assets\/omega-industrial-icons-v1\/factories\//);
  assert.match(industry, /data-omega-v2-factory-svg/);
  assert.match(industry, /factorySvgMarkup\(factory\)/);
  assert.match(fleet, /function fleetHeroPhoto\(\)/);
  assert.match(fleet, /assets\/ui-photos\/bangladesh-police-headquarters\.webp/);
  assert.match(fleet, /fleetHeroPhoto\(\)/);
});


test('all ministry detail pages use the matching local cover, uploaded logo and gallery registry', () => {
  const detail = readFileSync(new URL('../omega_ui_v2/screens/ministry-detail.js', import.meta.url), 'utf8');
  const visualRegistry = globalThis.OmegaUIV2MinistryVisualRegistry;
  assert.equal(visualRegistry.count, 18);
  assert.match(detail, /function ministryVisualMarkup\(/);
  assert.match(detail, /visual\.image/);
  assert.match(detail, /visual\.logo/);
  assert.match(detail, /visual\.gallery/);
  assert.match(detail, /data-omega-v2-ministry-visual/);
  for (const id of globalThis.OmegaUIV2Navigation.ministryIds) {
    const visual = visualRegistry.get(id);
    assert.ok(visual && visual.image, id + ' must have a ministry-specific cover image');
    assert.ok(visual.logo, id + ' must have a ministry-specific logo');
  }
});

test('universal navigation and the isolated legacy-free shell are wired into the offline cache', () => {
  const app = readFileSync(new URL('../omega_ui_v2/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../omega-offline-map-sw.js', import.meta.url), 'utf8');
  const refreshCss = readFileSync(new URL('../omega_ui_v2/ministry-visual-refresh.css', import.meta.url), 'utf8');
  const shellCss = readFileSync(new URL('../omega_ui_v2/omega-ui-v2.css', import.meta.url), 'utf8');
  const isolationCss = readFileSync(new URL('../omega_ui_v2/legacy-disconnect.css', import.meta.url), 'utf8');
  const integration = readFileSync(new URL('../omega_ui_v2/integration.js', import.meta.url), 'utf8');
  assert.equal(html.includes('<script src="presentation-engine.js"'), false,
    'retired PresentationEngine must not start in the production shell');
  assert.equal(html.includes('<script src="ui_engine_core.js"'), false,
    'retired adapter renderer and its polling loop must not start in the production shell');
  assert.equal(html.includes('unpkg.com/react@18'), false,
    'unused render-blocking React/Recharts libraries must not delay app startup');
  assert.ok(app.includes('data-omega-v2-jump-route'));
  assert.ok(app.includes('data-omega-v2-jump-ministry'));
  assert.ok(app.includes('function exitToMap('));
  assert.ok(app.includes('state.history.length = 0'));
  assert.ok(app.includes("root.addEventListener('keydown'"));
  assert.ok(app.includes('root.contains(ownControl)'));
  assert.ok(app.includes('event.stopPropagation()'));
  assert.ok(html.includes('omega_ui_v2/ministry-visual-refresh.css'));
  assert.match(worker, /omega-offline-atlas-shell-v\d+/);
  assert.ok(worker.includes('"./omega_ui_v2/legacy-disconnect.css"'));
  assert.ok(refreshCss.includes('omega-v2-ministry-detail-cover-image'));
  assert.ok(refreshCss.includes('min-height: 48px'));
  assert.ok(shellCss.includes('overflow-y:auto;'));
  assert.ok(shellCss.includes('touch-action:pan-y pinch-zoom;'));
  assert.ok(isolationCss.includes('#ministry-dashboard-view'));
  assert.ok(isolationCss.includes('display: none !important'));
  assert.ok(isolationCss.includes('z-index: 2147483000 !important'));
  assert.doesNotMatch(integration, /function\s+restoreLegacy\s*\(|function\s+resumeAfterOperationalConsole\s*\(|g\.OmegaCabinetUI\s*\.renderCabinet\s*\(/, 'integration must not call retired cabinet renderers');
  assert.equal(integration.includes('manager.setLayer('),false);
  assert.ok(integration.includes('function installLegacyLayerBridge()'));
  assert.ok(integration.includes('manager.setLayer = function (layerNum, data)'));
  assert.ok(integration.includes('manager.popLayer = function ()'));
  assert.ok(integration.includes('g.OmegaUIV2App.back(root) === true'));

  assert.ok(integration.includes('installLegacyLayerBridge();'));
  assert.ok(integration.includes("api.openRoute('government') === true"));

  for (const screenPath of ['industry.js','resource-ministry.js','ministry-detail.js','mine-detail.js','home-affairs.js']) {
    const screen = readFileSync(new URL('../omega_ui_v2/screens/' + screenPath, import.meta.url), 'utf8');
    assert.equal(screen.includes('onOpenOperationalConsole'),false, screenPath + ' must not expose the retired console callback');
    assert.equal(screen.includes('data-omega-v2-open-operational-console'),false, screenPath + ' must not expose the retired console control');
    assert.equal(screen.includes('open-console'),false, screenPath + ' must not route to the retired console');
  }
  for (const retired of ['omega_ui_system_redesign_v1.js','omega_ui_interaction_guard.js','omega_ui_button_system_v1.js']) {
    assert.equal(html.includes('src="' + retired + '"'),false);
    assert.equal(worker.includes('"./' + retired + '"'),false);
  }
});

test('all 18 ministry detail pages render their registry cover and any matching uploaded logo', () => {
  const previousCabinet = globalThis.OmegaCabinetUI;
  globalThis.OmegaCabinetUI = { ministriesDatabase: Object.fromEntries(
    globalThis.OmegaUIV2Navigation.ministryIds.map((id) => [id, { id, title:id.replace(/_/g, ' ') }])
  ) };
  try {
    for (const id of globalThis.OmegaUIV2Navigation.ministryIds) {
      const visual = globalThis.OmegaUIV2MinistryVisualRegistry.get(id);
      const root = { classList:{ add(){} }, addEventListener(){}, innerHTML:'' };
      const result = globalThis.OmegaUIV2MinistryDetail.render(root, { ministryId:id, countryId:'BGD' });
      assert.equal(result.ok, true, id + ' detail should render');
      assert.ok(root.innerHTML.includes(visual.image), id + ' detail must render its mapped cover image');
      for (const galleryPath of visual.gallery || []) {
        assert.ok(root.innerHTML.includes(galleryPath), id + ' detail must render gallery image ' + galleryPath);
      }
      if (visual.logo) assert.ok(root.innerHTML.includes(visual.logo), id + ' detail must render its uploaded logo');
    }
  } finally {
    if (previousCabinet === undefined) delete globalThis.OmegaCabinetUI;
    else globalThis.OmegaCabinetUI = previousCabinet;
  }
});

test('UI v2 restores internal ministry routes and Escape returns to the previous screen', () => {
  const previousCabinet = globalThis.OmegaCabinetUI;
  const previousCountry = globalThis.OmegaMinistryViewCountry;
  const previousDocument = globalThis.document;
  // The production mount deliberately requires a browser document. Supply the
  // smallest shell here; omitting createElement keeps the rotator timer inert.
  globalThis.document = {};
  const handlers = Object.create(null);
  const main = {
    classList:{ add(){} },
    addEventListener(name, handler){ handlers['main:' + name] = handler; },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    innerHTML:''
  };
  const backButton = { disabled:false };
  const attrs = Object.create(null);
  const root = {
    innerHTML:'',
    classList:{ add(){} },
    addEventListener(name, handler){ handlers[name] = handler; },
    querySelector(selector) {
      if (selector === '[data-omega-v2-main]') return main;
      if (selector === '[data-omega-v2-back]') return backButton;
      return null;
    },
    setAttribute(name, value){ attrs[name] = String(value); },
    getAttribute(name){ return attrs[name] || null; },
    contains(){ return true; }
  };
  globalThis.OmegaCabinetUI = { ministriesDatabase: {
    defense:{ id:'defense', title:'Defense & Armed Forces', category:'defense' },
    cabinet_council:{ id:'cabinet_council', title:'Executive Cabinet', category:'governance' }
  } };
  globalThis.OmegaMinistryViewCountry = 'BGD';
  try {
    const mounted = globalThis.OmegaUIV2App.mount(root, {
      initialRoute:'ministry-detail', initialMinistryId:'defense', initialSection:'assets', countryId:'BGD',
      initialHistory:[{ route:'government', ministryId:null, section:'dashboard', governmentView:'all-ministries' }]
    });
    assert.equal(mounted.mounted, true);
    assert.equal(root.__omegaUIV2State.route, 'ministry-detail');
    assert.equal(root.__omegaUIV2State.ministryId, 'defense');
    assert.equal(root.__omegaUIV2State.section, 'assets');
    assert.equal(root.__omegaUIV2State.history.length, 1);
    let prevented = false;
    handlers.keydown({ key:'Escape', preventDefault(){ prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(root.__omegaUIV2State.route, 'government');
    assert.equal(root.__omegaUIV2State.governmentView, 'all-ministries');

    assert.equal(globalThis.OmegaUIV2App.openMinistry(root, 'defense'), true);
    let altLeftPrevented = false;
    handlers.keydown({ key:'ArrowLeft', altKey:true, preventDefault(){ altLeftPrevented = true; } });
    assert.equal(altLeftPrevented, true);
    assert.equal(root.__omegaUIV2State.route, 'government');
    assert.equal(root.__omegaUIV2State.governmentView, 'all-ministries');
  } finally {
    if (previousCabinet === undefined) delete globalThis.OmegaCabinetUI;
    else globalThis.OmegaCabinetUI = previousCabinet;
    if (previousCountry === undefined) delete globalThis.OmegaMinistryViewCountry;
    else globalThis.OmegaMinistryViewCountry = previousCountry;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('failed UI v2 mount fails closed and never revives the legacy Cabinet', () => {
  const bridge = globalThis.OmegaUIV2Integration;
  const previous = {
    document:globalThis.document, app:globalThis.OmegaUIV2App, manager:globalThis.OmegaLayerManager,
    country:globalThis.OmegaMinistryViewCountry, cabinet:globalThis.OmegaCabinetUI,
    updateBack:globalThis.updateGlobalBackButtonVisibility
  };
  const attrs = Object.create(null), calls = [];
  const root = { style:{display:'flex',visibility:'visible',pointerEvents:'auto'}, innerHTML:'legacy markup',
    setAttribute(k,v){attrs[k]=String(v);}, getAttribute(k){return attrs[k]||null;}, removeAttribute(k){delete attrs[k];} };
  const dashboard={style:{display:'flex',visibility:'visible',opacity:'1'},setAttribute(){},removeAttribute(){}};
  const world={style:{opacity:'0.5',pointerEvents:'none'}}, bodyAttrs={};
  const manager={currentLayer:0,layerStack:[0],setLayer(){calls.push('setLayer');},updateRightSidebar(){calls.push('sidebar');}};
  globalThis.document={getElementById(id){return id==='cabinet-full-window'?root:id==='ministry-dashboard-view'?dashboard:id==='world-ui-root'?world:null;},
    body:{setAttribute(k,v){bodyAttrs[k]=String(v);},classList:{add(){},remove(){}}}};
  globalThis.OmegaUIV2App={mount(){throw new Error('simulated v2 render failure');},unmount(){return {ok:true};}};
  globalThis.OmegaLayerManager=manager;
  globalThis.OmegaMinistryViewCountry='BGD';
  globalThis.OmegaCabinetUI={renderCabinet(){calls.push('legacy-render');}};
  globalThis.updateGlobalBackButtonVisibility=()=>calls.push('legacy-back-update');
  try {
    const result=bridge.mountIntoCabinet(root);
    assert.equal(result.ok,false);
    assert.equal(result.code,'UI_V2_MOUNT_EXCEPTION');
    assert.equal(root.style.display,'none');
    assert.equal(root.style.pointerEvents,'none');
    assert.equal(root.innerHTML,'');
    assert.equal(root.getAttribute('data-omega-ui-v2-active'),null);
    assert.equal(dashboard.style.display,'none');
    assert.equal(world.style.opacity,'1');
    assert.equal(world.style.pointerEvents,'auto');
    assert.equal(bodyAttrs['data-active-layer'],'0');
    assert.equal(manager.currentLayer,0);
    assert.deepEqual(calls,[]);
  } finally {
    if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document;
    if(previous.app===undefined)delete globalThis.OmegaUIV2App;else globalThis.OmegaUIV2App=previous.app;
    if(previous.manager===undefined)delete globalThis.OmegaLayerManager;else globalThis.OmegaLayerManager=previous.manager;
    if(previous.country===undefined)delete globalThis.OmegaMinistryViewCountry;else globalThis.OmegaMinistryViewCountry=previous.country;
    if(previous.cabinet===undefined)delete globalThis.OmegaCabinetUI;else globalThis.OmegaCabinetUI=previous.cabinet;
    if(previous.updateBack===undefined)delete globalThis.updateGlobalBackButtonVisibility;else globalThis.updateGlobalBackButtonVisibility=previous.updateBack;
  }
});

test('resource ministry reads only selected-country rows from the global site registries', () => {
  const canonicalKey = 'OmegaResourceSiteCanonicalCatalogData';
  const bindingKey = 'OmegaIndividualResourceSiteBinding';
  const previousCanonical = globalThis[canonicalKey];
  const previousBinding = globalThis[bindingKey];
  const previousCountryRuntime = globalThis.OmegaCountryRuntimeData;
  globalThis.OmegaCountryRuntimeData = {
    resolveCountry(value) {
      const key = String(value || '').trim().toUpperCase();
      return key === 'BANGLADESH' || key === 'BGD' || key === 'BD'
        ? { countryCode:'BD', iso3:'BGD', numericCode:'050', name:'Bangladesh' }
        : key === 'UNITED STATES' || key === 'USA' || key === 'US'
          ? { countryCode:'US', iso3:'USA', numericCode:'840', name:'United States' }
          : null;
    }
  };
  globalThis[canonicalKey] = {
    sites: [
      { siteId:'BGD-COAL-01', countryId:'BGD', resourceId:'coal', siteName:'Bangladesh coal' },
      { siteId:'USA-OIL-01', countryId:'USA', resourceId:'crude_oil', siteName:'United States oil' }
    ]
  };
  globalThis[bindingKey] = {
    sites: [
      { siteId:'BGD-COAL-01', countryId:'BGD', resourceId:'coal', siteName:'Duplicate Bangladesh coal' },
      { siteId:'BGD-GAS-01', countryId:'BGD', resourceId:'natural_gas', siteName:'Bangladesh gas' },
      { siteId:'IND-IRON-01', countryId:'IND', resourceId:'iron_ore', siteName:'India iron ore' }
    ]
  };
  try {
    const selected = globalThis.OmegaUIV2ResourceMinistry.buildViewModel({ countryId:'BGD' });
    assert.equal(selected.siteCount, 2);
    assert.deepEqual(new Set(selected.sites.map((site) => site.countryId)), new Set(['BGD']));
    assert.deepEqual(new Set(selected.sites.map((site) => site.siteId)), new Set(['BGD-COAL-01', 'BGD-GAS-01']));

    const selectedByName = globalThis.OmegaUIV2ResourceMinistry.buildViewModel({ countryId:'BANGLADESH' });
    assert.equal(selectedByName.siteCount, 2, 'display-name country IDs must normalize to canonical ISO3 resource IDs');
    assert.deepEqual(new Set(selectedByName.sites.map((site) => site.countryId)), new Set(['BGD']));
    assert.deepEqual(new Set(selectedByName.sites.map((site) => site.siteId)), new Set(['BGD-COAL-01', 'BGD-GAS-01']));

    const selectedByIso3 = globalThis.OmegaUIV2ResourceMinistry.buildViewModel({ countryId:'USA' });
    assert.equal(selectedByIso3.siteCount, 1);
    assert.deepEqual(new Set(selectedByIso3.sites.map((site) => site.siteId)), new Set(['USA-OIL-01']));

    const nameBasedSite = globalThis.OmegaUIV2ResourceMinistry.buildViewModel({
      countryId:'BANGLADESH',
      sites:[{siteId:'NAME-BASED-BGD',siteName:'Name-based Bangladesh site',countryId:'Bangladesh',resourceId:'copper'}]
    });
    assert.equal(nameBasedSite.siteCount, 1, 'legacy rows with country names must normalize before filtering');
    assert.equal(nameBasedSite.sites[0].siteId, 'NAME-BASED-BGD');

    const noCountry = globalThis.OmegaUIV2ResourceMinistry.buildViewModel({});
    assert.equal(noCountry.siteCount, 0, 'no selected nation must not render the entire global site catalog');
  } finally {
    if (previousCanonical === undefined) delete globalThis[canonicalKey];
    else globalThis[canonicalKey] = previousCanonical;
    if (previousBinding === undefined) delete globalThis[bindingKey];
    else globalThis[bindingKey] = previousBinding;
    if (previousCountryRuntime === undefined) delete globalThis.OmegaCountryRuntimeData;
    else globalThis.OmegaCountryRuntimeData = previousCountryRuntime;
  }
});


test('industrial command panel scopes factory, mine, daily-rate and current-turn extraction data to the selected country', () => {
  const keys = ['Game','Omega','OmegaCountryRuntimeData','OmegaResourceIndustrialCatalogData',
    'OmegaResourceSiteCanonicalCatalogData','OmegaIndividualResourceSiteBinding','OmegaMinistryViewCountry','currentActiveCountry'];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  globalThis.Omega = {};
  globalThis.OmegaCountryRuntimeData = null;
  globalThis.OmegaIndividualResourceSiteBinding = null;
  globalThis.OmegaMinistryViewCountry = 'BGD';
  globalThis.currentActiveCountry = 'BGD';
  globalThis.OmegaResourceIndustrialCatalogData = {
    factoryProfiles: {
      STEEL_MILL: { name:'Catalog Steel Mill', defaultRecipeId:'STEEL-RECIPE' },
      CATALOG_ONLY_PROFILE: { name:'Profile must not count as a factory' }
    }
  };
  globalThis.OmegaResourceSiteCanonicalCatalogData = { sites: [
    {
      siteId:'BGD-MINE-1', countryId:'BGD', siteName:'Bangladesh Iron Mine',
      identity:{ countryIso3:'BGD', resourceTypeId:'iron_ore', resourceName:'Iron Ore' },
      quantitative:{ production:{ rate:12, unit:'tonnes/day', status:'REPORTED' } },
      operation:{ status:'OPERATING' }
    },
    {
      siteId:'USA-MINE-1', countryId:'USA', siteName:'United States Copper Mine',
      identity:{ countryIso3:'USA', resourceTypeId:'copper', resourceName:'Copper' },
      quantitative:{ production:{ rate:900, unit:'tonnes/day', status:'REPORTED' } },
      operation:{ status:'OPERATING' }
    }
  ] };
  globalThis.Game = { state: {
    simulation:{ turn:3, daysPerTurn:30, session:{ playerCountryId:'BGD' } },
    resource:{
      BGD:{
        mineAssets:[{ siteId:'BGD-MINE-1', status:'OPERATIONAL' }],
        industrialNetwork:{
          factoryAssets:[{ id:'BGD-NET-FACTORY', name:'Bangladesh Alloy Works', factoryType:'STEEL_MILL', status:'ACTIVE' }],
          siteFlowLedger:[
            { countryId:'BGD', siteId:'BGD-MINE-1', resourceId:'iron_ore', unit:'tonnes', quantity:40, extractionTurn:3, status:'EXTRACTION_COMMITTED' },
            { countryId:'BGD', siteId:'BGD-MINE-1', resourceId:'iron_ore', unit:'tonnes', quantity:150, extractionTurn:2, status:'EXTRACTION_COMMITTED' },
            { countryId:'USA', siteId:'USA-MINE-1', resourceId:'copper', unit:'tonnes', quantity:999, extractionTurn:3, status:'EXTRACTION_COMMITTED' }
          ]
        }
      },
      USA:{
        mineAssets:[],
        industrialNetwork:{ factoryAssets:[], siteFlowLedger:[
          { countryId:'USA', siteId:'USA-MINE-1', resourceId:'copper', unit:'tonnes', quantity:9, extractionTurn:3, status:'EXTRACTION_COMMITTED' }
        ] }
      }
    },
    economy:{
      BGD:{ productionAssets:[{ id:'BGD-STEEL-1', name:'Bangladesh Steelworks', factoryType:'STEEL_MILL', capacityPerDay:30, status:'OPERATIONAL' }] },
      USA:{ productionAssets:[{ id:'USA-COPPER-1', name:'United States Copper Refinery', factoryType:'COPPER_REFINERY', status:'ACTIVE' }] }
    }
  } };

  try {
    const bangladesh = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'BGD' });
    assert.equal(bangladesh.factoryCount, 2, 'only registered game-state factory assets count, not catalog profiles');
    assert.deepEqual(bangladesh.factoryNames.sort(), ['Bangladesh Alloy Works','Bangladesh Steelworks'].sort());
    assert.equal(bangladesh.registeredMineSiteCount, 1);
    assert.equal(bangladesh.operatingMineCount, 1);
    assert.equal(bangladesh.dailyProductionKnownCount, 1);
    assert.equal(bangladesh.mineSites[0].dailyProduction.value, 12);
    assert.match(bangladesh.mineSites[0].dailyProduction.unit, /tonnes\/day/i);
    assert.deepEqual(bangladesh.currentTurnExtraction.map((row) => ({ resourceId:row.resourceId, quantity:row.quantity })), [
      { resourceId:'iron_ore', quantity:40 }
    ]);
    assert.equal(bangladesh.canOperateSelectedCountry, true);
    assert.equal(bangladesh.currentTurnDaysPerTurn, 30);
    assert.ok(Math.abs(bangladesh.currentTurnExtraction[0].averagePerDay - (40 / 30)) < 1e-5);

    const unitedStates = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'USA' });
    assert.equal(unitedStates.factoryCount, 1);
    assert.deepEqual(unitedStates.factoryNames, ['United States Copper Refinery']);
    assert.equal(unitedStates.registeredMineSiteCount, 1);
    assert.deepEqual(unitedStates.currentTurnExtraction.map((row) => ({ resourceId:row.resourceId, quantity:row.quantity })), [
      { resourceId:'copper', quantity:9 }
    ]);
    assert.equal(unitedStates.canOperateSelectedCountry, false);

    const root = { classList:{ add(){} }, addEventListener(){}, contains(){ return true; } };
    const rendered = globalThis.OmegaUIV2Industry.render(root, { countryId:'BGD' });
    assert.equal(rendered.ok, true);
    assert.match(root.innerHTML, /omega-v2-industry--factory-home/);
    assert.match(root.innerHTML, /omega-v2-factory-command/);
    assert.match(root.innerHTML, /data-omega-v2-factory-card/);
    assert.match(root.innerHTML, /Bangladesh Alloy Works/);
    assert.match(root.innerHTML, /Catalog Steel Mill/);
    assert.doesNotMatch(root.innerHTML, /Bangladesh Iron Mine|Daily mine production|Build \/ view mines|FACTORY SVG SLOT/);
    assert.doesNotMatch(root.innerHTML, /12 tonnes\/day|1\.33 tonnes\/game-day/);
    assert.doesNotMatch(root.innerHTML, /United States Copper Refinery|United States Copper Mine|USA-MINE-1/,
      'the selected-country factory panel must not render another country’s factory or mine rows');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  }
});
