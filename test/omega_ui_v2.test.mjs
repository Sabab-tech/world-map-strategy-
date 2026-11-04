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

test('factory product usage notes resolve recipe consumers and preserve the existing SVG identity', () => {
  const catalog = JSON.parse(readFileSync(new URL('../resource_industrial_catalog_v1.json', import.meta.url), 'utf8'));
  const previousGlobalCatalog = globalThis.OmegaResourceIndustrialCatalogData;
  const previousOmega = globalThis.Omega;
  globalThis.OmegaResourceIndustrialCatalogData = catalog;
  globalThis.Omega = Object.assign({}, previousOmega || {}, { ResourceIndustrialCatalogData: catalog });
  const model = {
    catalogProfiles: catalog.factoryProfiles,
    catalogRecipes: catalog.downstreamFactoryRecipes,
    processingRules: catalog.processingRules
  };
  try {
    const steel = globalThis.OmegaUIV2Industry.productUsageMarkup(model, 'steel');
    assert.match(steel, /Industrial Machinery and Machine Tools/);
    assert.match(steel, /Grid and Electrical Equipment/);
    assert.match(steel, /Vehicle, Truck and Bus Assembly/);
    assert.match(steel, /Sector uses:/);
    const scrap = globalThis.OmegaUIV2Industry.productUsageMarkup(model, 'metal_scrap');
    assert.match(scrap, /Recycling and Waste Processing Plant/);
    const food = globalThis.OmegaUIV2Industry.productUsageMarkup(model, 'processed_food');
    assert.match(food, /No downstream factory recipe currently consumes this product/);
    assert.match(food, /People and households consume processed food/);
    const dust = globalThis.OmegaUIV2Industry.productUsageMarkup(model, 'processing_dust');
    assert.match(dust, /No downstream recycling or treatment factory route is registered/);

    const keyOf = value => String(value ?? '').trim().toLowerCase()
      .replace(/^res[_-]?type[:_\/-]?/, '').replace(/[\s-]+/g, '_');
    const routeConsumers = new Map();
    const routeProducers = new Map();
    const addRoute = (map, product, factoryType) => {
      const key = keyOf(product);
      const profile = catalog.factoryProfiles[factoryType] || {};
      const name = profile.name || factoryType;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(name);
    };
    const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    for (const rule of Object.values(catalog.processingRules || {})) {
      const type = rule.factoryType || 'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT';
      for (const product of Object.keys(rule.inputs || {})) addRoute(routeConsumers, product, type);
      for (const product of Object.keys(rule.outputs || {})) addRoute(routeProducers, product, type);
    }
    for (const recipe of Object.values(catalog.downstreamFactoryRecipes || {})) {
      for (const product of Object.keys(recipe.inputs || {})) addRoute(routeConsumers, product, recipe.factoryType);
      for (const product of Object.keys(recipe.outputs || {})) addRoute(routeProducers, product, recipe.factoryType);
    }
    for (const [product, expectedNames] of routeConsumers) {
      const markup = globalThis.OmegaUIV2Industry.productUsageMarkup(model, product);
      for (const name of expectedNames) {
        assert.ok(markup.includes(escapeHtml(name)), product + ': consumer route must include ' + name);
      }
    }
    for (const [product, expectedNames] of routeProducers) {
      const markup = globalThis.OmegaUIV2Industry.productUsageMarkup(model, product);
      for (const name of expectedNames) {
        assert.ok(markup.includes(escapeHtml(name)), product + ': producer route must include ' + name);
      }
    }

    const identity = globalThis.OmegaUIV2Industry.productIdentityMarkup('processed_food', 'Processed Food');
    assert.match(identity, /<svg/);
    assert.match(identity, /fp-product-icon-frame/);

    // Both aggregate daily requirements and per-factory input inventory use this
    // shared renderer, so recipe/sector-use details must remain visible in both.
    const industrySource = readFileSync(new URL('../omega_ui_v2/screens/industry.js', import.meta.url), 'utf8');
    const helperStart = industrySource.indexOf('function factoryInputIdentityMarkup(model, productId)');
    const helperEnd = industrySource.indexOf('  function factoryInputAggregateSourceMarkup', helperStart);
    assert.ok(helperStart >= 0 && helperEnd > helperStart, 'factory input identity renderer must exist');
    const inputIdentityHelper = industrySource.slice(helperStart, helperEnd);
    assert.ok(inputIdentityHelper.includes('factoryProductUsageMarkup(model, productId)'));
    const inputTableCall = 'factoryInputIdentityMarkup(model, row.productId)';
    assert.equal(industrySource.split(inputTableCall).length - 1, 2,
      'both input views must render product-use routes');
  } finally {
    if (previousGlobalCatalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData;
    else globalThis.OmegaResourceIndustrialCatalogData = previousGlobalCatalog;
    if (previousOmega === undefined) delete globalThis.Omega;
    else globalThis.Omega = previousOmega;
  }
});

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


test('executive government overview reuses its ministry rows without loading unused minister state', () => {
  const keys = ['OmegaCabinetUI','OmegaMinisterRecruitment','OmegaMinisterStateRegistry',
    'OmegaLiveMinisterSelectorV9','OmegaCountryDataGateway'];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  let activeMinisterReads = 0;
  globalThis.OmegaCabinetUI = {
    ministriesDatabase: {
      energy_mining: { id:'energy_mining', title:'Energy & Mining', bnTitle:'Energy', category:'agriculture' },
      interior_security: { id:'interior_security', title:'Interior & Security', bnTitle:'Interior', category:'governance' }
    }
  };
  globalThis.OmegaMinisterRecruitment = {
    normalizeCountryCode(value) { return String(value || '').toUpperCase() === 'BANGLADESH' ? 'BGD' : String(value || '').toUpperCase(); }
  };
  globalThis.OmegaMinisterStateRegistry = {
    getActiveMinisterSummary() { activeMinisterReads += 1; return null; }
  };
  globalThis.OmegaLiveMinisterSelectorV9 = {
    active() { activeMinisterReads += 1; return null; }
  };
  globalThis.OmegaCountryDataGateway = {
    getSnapshot(countryId) {
      assert.equal(countryId, 'BGD');
      return {
        countryCode:'BGD',
        status:'OK',
        identity:{ countryCode:'BGD', name:'Bangladesh', officialName:'People’s Republic of Bangladesh' },
        fields:{},
        diagnostics:{ missingFields:[] }
      };
    }
  };
  const root = {
    classList:{ add() {} },
    addEventListener() {},
    innerHTML:''
  };
  try {
    const result = globalThis.OmegaUIV2Government.render(root, { countryId:'BGD' });
    assert.equal(result.ok, true);
    assert.equal(result.view, 'executive-ministry');
    assert.equal(activeMinisterReads, 0,
      'the executive overview only uses ministry labels and must not read every minister record');
    assert.match(root.innerHTML, /Energy &amp; Mining|Energy & Mining/);
    assert.match(root.innerHTML, /Interior &amp; Security|Interior & Security/);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  }
});

test('Government ministry rows show the canonical active minister for the explicitly selected country', () => {
  const previous = {
    OmegaCabinetUI: globalThis.OmegaCabinetUI,
    OmegaMinisterRecruitment: globalThis.OmegaMinisterRecruitment,
    OmegaMinisterStateRegistry: globalThis.OmegaMinisterStateRegistry,
    OmegaLiveMinisterSelectorV9: globalThis.OmegaLiveMinisterSelectorV9
  };
  globalThis.OmegaCabinetUI = {
    activeCountry: 'USA',
    ministriesDatabase: {
      interior_security: {
        id: 'interior_security',
        title: 'Interior & Security',
        category: 'governance',
        ministerName: 'Stale minister from another country'
      }
    }
  };
  globalThis.OmegaMinisterRecruitment = {
    normalizeCountryCode(value) {
      const label = String(value == null ? '' : value).trim().toUpperCase();
      return label === 'BANGLADESH' || label === 'BGD' ? 'BGD' : label;
    }
  };
  globalThis.OmegaMinisterStateRegistry = {
    getActiveMinisterSummary(countryId, ministryId) {
      return countryId === 'BGD' && ministryId === 'interior_security'
        ? {
            ministerId: 'BGD-INTERIOR-01',
            staticProfile: { ministerId: 'BGD-INTERIOR-01', baseName: 'Country-scoped Minister' },
            runtimeState: { status: 'ACTIVE' }
          }
        : null;
    }
  };
  globalThis.OmegaLiveMinisterSelectorV9 = {
    active(ministryId, countryId) {
      const normalized = globalThis.OmegaMinisterRecruitment.normalizeCountryCode(countryId);
      const active = globalThis.OmegaMinisterStateRegistry.getActiveMinisterSummary(normalized, ministryId);
      return active ? {
        ministerId: active.ministerId,
        staticProfile: active.staticProfile,
        profile: active.staticProfile,
        runtime: active.runtimeState
      } : null;
    }
  };
  try {
    const rows = globalThis.OmegaUIV2Government.getMinistryRows('Bangladesh');
    const ministry = rows.find((row) => row.id === 'interior_security');
    assert.equal(ministry.ministerName, 'Country-scoped Minister');
    assert.doesNotMatch(ministry.ministerName, /Stale minister/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('Home Affairs exposes its planned sections including Budget & Expenditure without creating a separate recruitment destination', () => {
  const tabs = globalThis.OmegaUIV2HomeAffairs.tabs;
  assert.deepEqual(tabs.map((item) => item.id), ['dashboard', 'budget', 'personnel', 'fleet', 'patrols', 'facilities', 'incidents', 'laws']);
  assert.equal(tabs.some((item) => /recruit/i.test(item.id)), false);
});


test('Home Affairs restores the Finance-backed budget and expenditure panel and saves category allocations through the canonical engine', () => {
  const previous = globalThis.OmegaHomeMinistryEngine;
  const saved = { plan:null, country:null };
  const snapshot = {
    available:true, valid:true, canEdit:true, countryId:'AAA',
    parentBudgetUsd:1000000, parentRemainingUsd:900000, treasuryBalanceUsd:2500000,
    planTotalUsd:1000000, unplannedBudgetUsd:0, spentThisYearUsd:100000,
    plan:{
      personnel:{mode:'percent',value:45}, vehicles:{mode:'percent',value:20},
      maintenance:{mode:'percent',value:15}, facilities:{mode:'percent',value:8},
      training:{mode:'percent',value:5}, operations:{mode:'percent',value:7}
    },
    categories:{
      personnel:{budgetUsd:450000,spentUsd:60000,remainingUsd:390000},
      vehicles:{budgetUsd:200000,spentUsd:20000,remainingUsd:180000},
      maintenance:{budgetUsd:150000,spentUsd:10000,remainingUsd:140000},
      facilities:{budgetUsd:80000,spentUsd:5000,remainingUsd:75000},
      training:{budgetUsd:50000,spentUsd:5000,remainingUsd:45000},
      operations:{budgetUsd:70000,spentUsd:0,remainingUsd:70000}
    }
  };
  globalThis.OmegaHomeMinistryEngine = {
    getHomeBudgetSnapshot(country) { assert.equal(country,'AAA'); return snapshot; },
    setHomeBudgetPlan(plan,country) { saved.plan=plan; saved.country=country; return {ok:true,snapshot}; }
  };
  const values = {personnel:'45',vehicles:'20',maintenance:'15',facilities:'8',training:'5',operations:'7'};
  const root = {
    innerHTML:'',
    classList:{add(){}},
    handlers:{},
    addEventListener(type,handler){this.handlers[type]=handler;},
    contains(){return true;},
    querySelector(selector){
      const valueMatch=selector.match(/data-omega-v2-budget-value="([^"]+)"/);
      if(valueMatch)return {value:values[valueMatch[1]]};
      const modeMatch=selector.match(/data-omega-v2-budget-mode="([^"]+)"/);
      if(modeMatch)return {value:'percent'};
      return null;
    }
  };
  try {
    const dashboardRoot={innerHTML:'',classList:{add(){}},addEventListener(){},contains(){return true;}};
    const dashboardResult=globalThis.OmegaUIV2HomeAffairs.render(dashboardRoot,{countryId:'AAA',tab:'dashboard'});
    assert.equal(dashboardResult.ok,true);
    assert.match(dashboardRoot.innerHTML,/Annual Home Affairs allocation/);
    assert.match(dashboardRoot.innerHTML,/\$1,000,000/);
    assert.match(dashboardRoot.innerHTML,/OPEN HOME AFFAIRS BUDGET/);
    const result=globalThis.OmegaUIV2HomeAffairs.render(root,{countryId:'AAA',tab:'budget'});
    assert.equal(result.ok,true);
    assert.equal(result.tab,'budget');
    assert.match(root.innerHTML,/Budget &amp; Expenditure/);
    assert.match(root.innerHTML,/\$1,000,000/);
    assert.match(root.innerHTML,/\$2,500,000/);
    assert.match(root.innerHTML,/\$60,000/);
    assert.match(root.innerHTML,/SAVE HOME AFFAIRS BUDGET/);
    const action={disabled:false,getAttribute(name){return name==='data-omega-v2-action'?'save-home-budget':null;}};
    const target={closest(selector){return selector==='[data-omega-v2-home-tab]'?null:selector==='[data-omega-v2-action]'?action:null;}};
    root.handlers.click({target});
    assert.equal(saved.country,'AAA');
    assert.deepEqual(saved.plan,{
      personnel:{mode:'percent',value:45},vehicles:{mode:'percent',value:20},
      maintenance:{mode:'percent',value:15},facilities:{mode:'percent',value:8},
      training:{mode:'percent',value:5},operations:{mode:'percent',value:7}
    });
    assert.match(root.innerHTML,/budget plan saved/i);
  } finally {
    if(previous===undefined)delete globalThis.OmegaHomeMinistryEngine;
    else globalThis.OmegaHomeMinistryEngine=previous;
  }
});

test('Home Affairs budget remains read-only for a non-player country and does not offer made-up values', () => {
  const previous=globalThis.OmegaHomeMinistryEngine;
  globalThis.OmegaHomeMinistryEngine={
    getHomeBudgetSnapshot(){return {available:true,valid:true,canEdit:false,countryId:'BBB',parentBudgetUsd:20000000,parentRemainingUsd:20000000,treasuryBalanceUsd:30000000,planTotalUsd:20000000,unplannedBudgetUsd:0,spentThisYearUsd:0,plan:{personnel:{mode:'percent',value:45},vehicles:{mode:'percent',value:20},maintenance:{mode:'percent',value:15},facilities:{mode:'percent',value:8},training:{mode:'percent',value:5},operations:{mode:'percent',value:7}},categories:{personnel:{budgetUsd:9000000,spentUsd:0,remainingUsd:9000000},vehicles:{budgetUsd:4000000,spentUsd:0,remainingUsd:4000000},maintenance:{budgetUsd:3000000,spentUsd:0,remainingUsd:3000000},facilities:{budgetUsd:1600000,spentUsd:0,remainingUsd:1600000},training:{budgetUsd:1000000,spentUsd:0,remainingUsd:1000000},operations:{budgetUsd:1400000,spentUsd:0,remainingUsd:1400000}}};}
  };
  try {
    const root={innerHTML:'',classList:{add(){}},addEventListener(){},contains(){return true;}};
    const result=globalThis.OmegaUIV2HomeAffairs.render(root,{countryId:'BBB',tab:'budget'});
    assert.equal(result.ok,true);
    assert.match(root.innerHTML,/READ-ONLY COUNTRY VIEW/);
    assert.match(root.innerHTML,/disabled/);
    assert.match(root.innerHTML,/\$20,000,000/);
    assert.doesNotMatch(root.innerHTML,/Not allocated/);
  } finally {
    if(previous===undefined)delete globalThis.OmegaHomeMinistryEngine;
    else globalThis.OmegaHomeMinistryEngine=previous;
  }
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

test('industry factory cards show owned factory counts without a separate source-data panel', () => {
  const previousGame = globalThis.Game;
  const previousCatalog = globalThis.OmegaResourceIndustrialCatalogData;
  const previousFactoryBaseline = globalThis.OmegaCountryFactoryStartingBaselineV1;
  globalThis.Game = { state: {
    simulation: { session: { playerCountryId: 'BGD' }, turn: 12 },
    resource: {
      BGD: { industrialNetwork: { projects: [], factoryProductionCycles: {}, factoryRuntime: {}, siteFlowLedger: [] } },
      USA: { industrialNetwork: { projects: [], factoryProductionCycles: {}, factoryRuntime: {}, siteFlowLedger: [] } }
    },
    economy: { BGD: { productionAssets: [] }, USA: { productionAssets: [] } }
  } };
  globalThis.OmegaResourceIndustrialCatalogData = {
    factoryProfiles: {
      STEEL_MILL: { name:'Steel Mill', defaultRecipeId:'STEEL-RECIPE' },
      CEMENT_PLANT: { name:'Cement Plant', defaultRecipeId:'CEMENT-RECIPE' }
    }
  };
  globalThis.OmegaCountryFactoryStartingBaselineV1 = {
    getCountryFactoryRegistry(countryId) {
      if (countryId !== 'BGD') return null;
      return {
        status:'READY', runtimeRegistered:false,
        registry:[
          {factoryType:'STEEL_MILL',name:'Steel Mill',startingCount:3},
          {factoryType:'CEMENT_PLANT',name:'Cement Plant',startingCount:0}
        ],
        liveFactoryTypeCounts:{STEEL_MILL:0,CEMENT_PLANT:0}
      };
    },
  };
  try {
    const model = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'BGD' });
    assert.equal(model.factoryCount, 3);
    assert.equal(model.countryFactoryEstablishmentData, undefined);
    assert.deepEqual(model.factoryTypeCounts.map(row => [row.type,row.count]), [
      ['CEMENT_PLANT',0], ['STEEL_MILL',3]
    ]);
    const root = { classList:{ add(){} }, addEventListener(){}, contains(){ return true; } };
    const result = globalThis.OmegaUIV2Industry.render(root, {
      countryId:'BGD', tab:'factories', factoryView:'types'
    });
    assert.equal(result.ok, true);
    assert.match(root.innerHTML, /Factory types &amp; country totals/);
    assert.match(root.innerHTML, /Factories/);
    assert.match(root.innerHTML, /<strong>3<\/strong>/);
    const existingCard = root.innerHTML.indexOf('data-omega-v2-factory-type-card data-factory-type="STEEL_MILL"');
    const absentCard = root.innerHTML.indexOf('data-omega-v2-factory-type-card data-factory-type="CEMENT_PLANT"');
    assert.ok(existingCard >= 0 && absentCard > existingCard,
      'country-owned factory types must appear above types with zero factories');
    assert.match(root.innerHTML, /EXISTING FACTORIES IN THIS COUNTRY/);
    assert.match(root.innerHTML, /FACTORY TYPES NOT PRESENT IN THIS COUNTRY/);
    assert.match(root.innerHTML, /data-factory-presence="present"/);
    assert.match(root.innerHTML, /data-factory-presence="absent"/);
    assert.doesNotMatch(root.innerHTML, /UNIDO|Official establishment data|Establishments|Source status/);
    const foreign = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'USA' });
    assert.equal(foreign.factoryCount, 0, 'another country does not inherit Bangladesh factory counts');
  } finally {
    if (previousGame === undefined) delete globalThis.Game; else globalThis.Game = previousGame;
    if (previousCatalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData;
    else globalThis.OmegaResourceIndustrialCatalogData = previousCatalog;
    if (previousFactoryBaseline === undefined) delete globalThis.OmegaCountryFactoryStartingBaselineV1;
    else globalThis.OmegaCountryFactoryStartingBaselineV1 = previousFactoryBaseline;
  }
});

test('industry treats starting and newly built factories as one live asset registry', () => {
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
        { id:'FAC-START:BGD:STEEL_MILL:1', factoryType:'STEEL_MILL', name:'East Steel Works', capacityPerDay:120, status:'OPERATIONAL', sourceType:'COUNTRY_STARTING_FACTORY_BASELINE' },
        { id:'FAC-START:BGD:STEEL_MILL:2', factoryType:'STEEL_MILL', name:'West Steel Works', capacityPerDay:90, status:'OPERATIONAL', sourceType:'COUNTRY_STARTING_FACTORY_BASELINE' },
        { id:'FAC-START:BGD:STEEL_MILL:3', factoryType:'STEEL_MILL', name:'Central Steel Works', capacityPerDay:85, status:'OPERATIONAL', sourceType:'COUNTRY_STARTING_FACTORY_BASELINE' }
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
    assert.equal(model.factoryCount, 3,
      'every starting factory must be a normal asset in the live factory collection');
    assert.deepEqual(model.factoryTypeCounts.map((row) => ({ name:row.name, count:row.count })), [
      { name:'Steel Mill', count:3 }
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(model, 'startingFactoryUnits'), false,
      'the Industry view model must not expose a second starting-factory counter');
    assert.equal(Object.prototype.hasOwnProperty.call(model.factoryTypeCatalog[0], 'startingCount'), false,
      'factory types must not expose a parallel starting allocation count');
    const root = { classList:{ add(){} }, addEventListener(){}, contains(){ return true; } };
    const result = globalThis.OmegaUIV2Industry.render(root, { countryId:'BGD', tab:'factories', factoryView:'assets' });
    assert.equal(result.ok, true);
    assert.match(root.innerHTML, /omega-v2-factory-command/);
    assert.match(root.innerHTML, /data-omega-v2-factory-card/);
    assert.match(root.innerHTML, /East Steel Works/);
    assert.match(root.innerHTML, /FACTORIES/);
    assert.doesNotMatch(root.innerHTML, /Starting factory allocation|Starting allocation|STARTING UNITS|Starting Factory Allocation/);
    assert.doesNotMatch(root.innerHTML, /Foreign Cement Plant/);
    assert.doesNotMatch(root.innerHTML, /Bangladesh Iron Mine|Daily mine production|FACTORY SVG SLOT/);

    const typeRoot = { classList:{ add(){} }, addEventListener(){}, contains(){ return true; } };
    const typeResult = globalThis.OmegaUIV2Industry.render(typeRoot, {
      countryId:'BGD', tab:'factories', factoryView:'types'
    });
    assert.equal(typeResult.ok, true);
    assert.match(typeRoot.innerHTML, /Factories/);
    assert.match(typeRoot.innerHTML, /<strong>3<\/strong>/);
    assert.doesNotMatch(typeRoot.innerHTML, /Starting allocation|fp-type-card-count--starting|Starting units/);

    const economyAssets = globalThis.Game.state.economy.BGD.productionAssets;
    const newlyBuiltFactory = {
      id:'BGD-STEEL-4', factoryType:'STEEL_MILL', name:'Newly Built Steel Works',
      capacityPerDay:75, status:'OPERATIONAL', sourceType:'PLAYER_FACTORY_CONSTRUCTION'
    };
    economyAssets.push(newlyBuiltFactory);
    const afterBuild = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'BGD' });
    assert.equal(afterBuild.factoryCount, 4,
      'a completed construction asset must join, not sit beside, the same starting asset collection');
    assert.equal(afterBuild.factoryTypeCounts.find(row => row.type === 'STEEL_MILL').count, 4);
    assert.equal(economyAssets.filter(asset => asset.factoryType === 'STEEL_MILL').length, 4,
      'starting and constructed factories must share one productionAssets collection');

    const afterBuildTypeRoot = { classList:{ add(){} }, addEventListener(){}, contains(){ return true; } };
    globalThis.OmegaUIV2Industry.render(afterBuildTypeRoot, {
      countryId:'BGD', tab:'factories', factoryView:'types'
    });
    assert.match(afterBuildTypeRoot.innerHTML, /<strong>4<\/strong>/,
      'the type total must update from the same live asset collection');

    newlyBuiltFactory.status = 'DECOMMISSIONED';
    const afterDecommission = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'BGD' });
    assert.equal(afterDecommission.factoryCount, 3,
      'decommissioning must remove the asset from active totals without deleting its record');
    assert.equal(economyAssets.length, 4,
      'the decommissioned factory asset must remain in the single collection for history');
    assert.equal(economyAssets[3].status, 'DECOMMISSIONED');
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
  const countryProfiles = [
    { countryCode:'BD', iso3:'BGD', numericCode:'050', name:'Bangladesh', economyKey:'BANGLADESH' },
    { countryCode:'US', iso3:'USA', numericCode:'840', name:'United States', economyKey:'USA' },
    { countryCode:'JP', iso3:'JPN', numericCode:'392', name:'Japan', economyKey:'JPN' },
    { countryCode:'CA', iso3:'CAN', numericCode:'124', name:'Canada', economyKey:'CAN' }
  ];
  globalThis.OmegaCountryRuntimeData = {
    listProfiles() { return countryProfiles.slice(); },
    resolveCountry(value) {
      const key = String(value || '').trim().toUpperCase();
      if (key === 'BANGLADESH' || key === 'BD') return countryProfiles[0];
      return countryProfiles.find(profile => [profile.iso3, profile.countryCode, profile.name].some(id => String(id || '').toUpperCase() === key)) || null;
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
    const selectable = new Set(mountedOptions.countryOptions.map(row => row.id));
    for (const code of ['BGD','USA','JPN','CAN']) assert.ok(selectable.has(code), 'country browser must include canonical profile ' + code);
    assert.equal(mountedOptions.countryOptions.length, 4, 'country options must be a deduplicated all-profile roster, not only countries with Home Ministry state');
    mountedOptions.onCountryChange('JP');
    assert.equal(globalThis.OmegaMinistryViewCountry, 'JPN', 'non-player browsing must select another country without changing the player-country action gate');
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


test('direct Resources route mounts the Resource Ministry without rendering Government first', () => {
  const bridge = globalThis.OmegaUIV2Integration;
  const previous = {
    app:globalThis.OmegaUIV2App,
    document:globalThis.document,
    game:globalThis.Game,
    country:globalThis.OmegaMinistryViewCountry,
    countryRuntime:globalThis.OmegaCountryRuntimeData,
    homeEngine:globalThis.OmegaHomeMinistryEngine,
    gateway:globalThis.OmegaCountryDataGateway,
    omega:globalThis.Omega,
    manager:globalThis.OmegaLayerManager
  };
  const attrs = Object.create(null);
  const bodyClasses = new Set();
  const root = {
    style:{},
    setAttribute(key,value){attrs[key]=String(value);},
    getAttribute(key){return attrs[key] || null;},
    removeAttribute(key){delete attrs[key];}
  };
  const body = {
    setAttribute(){},
    classList:{
      add(key){bodyClasses.add(key);},
      remove(key){bodyClasses.delete(key);},
      toggle(key,value){if(value)bodyClasses.add(key);else bodyClasses.delete(key);}
    }
  };
  let mountedOptions = null;
  let openMinistryCalls = 0;
  globalThis.document = {
    body,
    getElementById(id){return id === 'cabinet-full-window' ? root : null;}
  };
  globalThis.Omega = {};
  globalThis.OmegaCountryRuntimeData = {
    listProfiles(){return [{countryCode:'BD',iso3:'BGD',name:'Bangladesh'}];},
    resolveCountry(value){
      return ['BGD','BD','BANGLADESH'].includes(String(value || '').toUpperCase())
        ? {countryCode:'BD',iso3:'BGD',name:'Bangladesh'} : null;
    }
  };
  globalThis.OmegaHomeMinistryEngine = null;
  globalThis.OmegaCountryDataGateway = null;
  globalThis.OmegaMinistryViewCountry = 'BGD';
  globalThis.Game = {Map:{setUiActive(){return true;}}};
  globalThis.OmegaLayerManager = null;
  globalThis.OmegaUIV2App = {
    destinations:[],
    mount(node,options){
      mountedOptions = options;
      return {ok:true,mounted:true,route:options.initialRoute};
    },
    openMinistry(){openMinistryCalls+=1;return false;}
  };
  try {
    assert.equal(bridge.openRoute('resources'),true);
    assert.equal(mountedOptions.initialRoute,'resources');
    assert.equal(mountedOptions.initialMinistryId,'energy_mining');
    assert.equal(mountedOptions.ministryId,undefined);
    assert.equal(openMinistryCalls,0,
      'the direct Resource route must not mount Government and then synchronously render Resources');
  } finally {
    if(previous.app===undefined)delete globalThis.OmegaUIV2App;else globalThis.OmegaUIV2App=previous.app;
    if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document;
    if(previous.game===undefined)delete globalThis.Game;else globalThis.Game=previous.game;
    if(previous.country===undefined)delete globalThis.OmegaMinistryViewCountry;else globalThis.OmegaMinistryViewCountry=previous.country;
    if(previous.countryRuntime===undefined)delete globalThis.OmegaCountryRuntimeData;else globalThis.OmegaCountryRuntimeData=previous.countryRuntime;
    if(previous.homeEngine===undefined)delete globalThis.OmegaHomeMinistryEngine;else globalThis.OmegaHomeMinistryEngine=previous.homeEngine;
    if(previous.gateway===undefined)delete globalThis.OmegaCountryDataGateway;else globalThis.OmegaCountryDataGateway=previous.gateway;
    if(previous.omega===undefined)delete globalThis.Omega;else globalThis.Omega=previous.omega;
    if(previous.manager===undefined)delete globalThis.OmegaLayerManager;else globalThis.OmegaLayerManager=previous.manager;
  }
});

test('factory Stock shows committed finished goods and traced use while Input shows delivery sources and shortage efficiency', () => {
  const previous = {
    Game:globalThis.Game,
    inventory:globalThis.OmegaCountryInventoryRuntime,
    industrialCatalog:globalThis.OmegaResourceIndustrialCatalogData,
    countryRuntime:globalThis.OmegaCountryRuntimeData,
    omega:globalThis.Omega
  };
  globalThis.Omega = {};
  globalThis.OmegaCountryRuntimeData = null;
  globalThis.OmegaResourceIndustrialCatalogData = {
    factoryProfiles: {
      STEEL_AND_ALLOY_WORKS: { name:'Steel and Alloy Works', defaultRecipeId:'STEEL-RECIPE', defaultCapacityPerDay:5 }
    },
    downstreamFactoryRecipes: {
      'STEEL-RECIPE': { recipeId:'STEEL-RECIPE', factoryType:'STEEL_AND_ALLOY_WORKS', inputs:{iron_ore:2}, outputs:{steel:1}, inputUnit:'TONNES', outputUnit:'TONNES' }
    }
  };
  globalThis.Game = { state:{
    simulation:{ playerCountryId:'BGD' },
    resource:{
      BGD:{
        finishedGoodsLedger:[{
          transactionId:'RUN-STEEL-1',countryId:'BGD',factoryId:'FACTORY-STEEL-1',
          outputQuantities:{steel:10},createdBatchIds:['OUTPUT-STEEL-1'],turn:12,status:'AVAILABLE_TO_ECONOMY'
        }],
        batches:[{
          batchId:'OUTPUT-STEEL-1',resourceId:'steel',sourceFactoryId:'FACTORY-STEEL-1',
          quantity:10,remainingQuantity:6,unit:'TONNES',stage:'FINISHED',status:'AVAILABLE',
          processId:'RUN-STEEL-1'
        }],
        processedWarehouse:{availableByResource:{steel:6}},
        inventoryLedger:[
          {type:'INVENTORY_CONSUMED',resourceId:'steel',quantity:2,reason:'NATIONAL_DEMAND',
            consumed:[{batchId:'OUTPUT-STEEL-1',quantity:2,stage:'FINISHED'}]},
          {type:'INTERNATIONAL_TRADE_EXPORT',resourceId:'steel',quantity:2,
            batchTransfers:[{sourceBatchId:'OUTPUT-STEEL-1',resourceId:'steel',quantity:2,destinationCountryId:'USA'}]}
        ],
        nationalDemandRuntime:{byResource:{
          steel:{status:'BALANCED',demandThisTurn:4,unmetDemand:0,nationalConsumption:2}
        }},
        industrialNetwork:{
          projects:[],factoryProductionCycles:{},
          factoryRuntime:{
            'FACTORY-STEEL-1':{
              transactionId:'RUN-STEEL-1',factoryId:'FACTORY-STEEL-1',turn:12,status:'COMPLETED',
              outputQuantities:{steel:10},inputQuantities:{iron_ore:20}
            }
          },
          siteFlowLedger:[]
        }
      }
    },
    economy:{
      BGD:{
        productionAssets:[{
          id:'FACTORY-STEEL-1',name:'Chattogram Steel Works',factoryType:'STEEL_AND_ALLOY_WORKS',recipeId:'STEEL-RECIPE',
          status:'OPERATIONAL',capacityPerDay:5,
          inputInventory:{iron_ore:3},
          inputBatchLots:[{
            batchId:'INPUT-IRON-1',resourceId:'iron_ore',quantity:10,remainingQuantity:3,
            unit:'TONNES',sourceCountryId:'BGD',sourceSiteIds:['BGD-MINE-01'],status:'AVAILABLE_TO_FACTORY'
          }],
          productionHealth:{
            status:'REDUCED',productivityPct:60,reason:'FACTORY_INPUT_SHORTAGE',
            detail:{constraints:{rawMaterialRatio:0.6}},
            missingInputs:[{resourceId:'iron_ore',required:10,available:3}]
          }
        }]
      }
    },
    trade:{BGD:{domesticSales:[]}}
  }};
  globalThis.OmegaCountryInventoryRuntime = {
    getInventory(countryId, options) {
      assert.equal(options.includeZero,true);
      assert.equal(options.includeLedger,false, 'the industry view needs stock rows, not a full unbounded inventory-history clone');
      return {
        status:'READY',countryId:countryId,countryName:'Bangladesh',active:true,readOnly:false,
        unbounded:true,items:[
          {productId:'steel',name:'Steel',quantity:6,unit:'TONNES'},
          {productId:'iron_ore',name:'Iron Ore',quantity:3,unit:'TONNES'}
        ],ledger:[]
      };
    },
    getResourceCatalog() { return []; }
  };
  try {
    const model = globalThis.OmegaUIV2Industry.buildViewModel({countryId:'BGD'});
    assert.equal(model.factories.length,1);
    const stockRoot = {classList:{add(){}},addEventListener(){},contains(){return true},innerHTML:''};
    const stockResult = globalThis.OmegaUIV2Industry.render(stockRoot,{countryId:'BGD',tab:'national-inventory'});
    assert.equal(stockResult.ok,true);
    assert.match(stockRoot.innerHTML,/Stock/);
    assert.match(stockRoot.innerHTML,/Chattogram Steel Works/);
    assert.match(stockRoot.innerHTML,/Steel/);
    assert.match(stockRoot.innerHTML,/10 TONNES/);
    assert.match(stockRoot.innerHTML,/2 TONNES/);
    assert.match(stockRoot.innerHTML,/USA/);
    assert.match(stockRoot.innerHTML,/6 TONNES/);
    assert.match(stockRoot.innerHTML,/Surplus/);
    assert.match(stockRoot.innerHTML,/data-factory-stock-input-ui="v2"/,
      'the updated factory screen must expose the current Stock/Input UI build marker');
    assert.match(stockRoot.innerHTML,/data-factory-product-identity="steel"/,
      'finished output rows must include the generated Steel identity icon');
    assert.match(stockRoot.innerHTML,/data-factory-stock-product="steel"/,
      'the current finished-goods stock balance must repeat the matching product icon');
    assert.match(stockRoot.innerHTML,/data-icon-source="generated-product"/,
      'finished industrial products without raw-resource art must receive an SVG icon');

    assert.doesNotMatch(stockRoot.innerHTML,/UNBOUNDED STOCK LOG/,
      'the factory Stock button must not fall back to a national raw-resource snapshot');

    const inputRoot = {classList:{add(){}},addEventListener(){},contains(){return true},innerHTML:''};
    const inputResult = globalThis.OmegaUIV2Industry.render(inputRoot,{countryId:'BGD',tab:'inventory'});
    assert.equal(inputResult.ok,true);
    assert.match(inputRoot.innerHTML,/Input/);
    assert.match(inputRoot.innerHTML,/Chattogram Steel Works/);
    assert.match(inputRoot.innerHTML,/Iron Ore/);
    assert.match(inputRoot.innerHTML,/10 TONNES/);
    assert.match(inputRoot.innerHTML,/3 TONNES/);
    assert.match(inputRoot.innerHTML,/Domestic mine/);
    assert.match(inputRoot.innerHTML,/BGD-MINE-01/);
    assert.match(inputRoot.innerHTML,/Shortage/);
    assert.match(inputRoot.innerHTML,/40 %/);
    assert.match(inputRoot.innerHTML,/Efficiency reduction/);
    assert.match(inputRoot.innerHTML,/data-factory-product-identity="iron_ore"/,
      'factory input rows must carry the correct resource identity');
    assert.match(inputRoot.innerHTML,/resources\/iron-ore\.svg/,
      'raw input resources must use their own canonical dimensional SVG asset');
    assert.match(inputRoot.innerHTML,/data-factory-stock-product="iron_ore"/,
      'the current factory input balance must carry the same resource icon');


    const factoryRoot = {classList:{add(){}},addEventListener(){},contains(){return true},innerHTML:''};
    const factoryResult = globalThis.OmegaUIV2Industry.render(factoryRoot,{countryId:'BGD',tab:'factories'});
    assert.equal(factoryResult.ok,true);
    assert.match(factoryRoot.innerHTML,/data-omega-v2-factory-type-card/);
    assert.match(factoryRoot.innerHTML,/Steel and Alloy Works/);
  } finally {
    if (previous.Game === undefined) delete globalThis.Game; else globalThis.Game = previous.Game;
    if (previous.inventory === undefined) delete globalThis.OmegaCountryInventoryRuntime;
    else globalThis.OmegaCountryInventoryRuntime = previous.inventory;
    if (previous.industrialCatalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData;
    else globalThis.OmegaResourceIndustrialCatalogData = previous.industrialCatalog;
    if (previous.countryRuntime === undefined) delete globalThis.OmegaCountryRuntimeData;
    else globalThis.OmegaCountryRuntimeData = previous.countryRuntime;
    if (previous.omega === undefined) delete globalThis.Omega; else globalThis.Omega = previous.omega;
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
    updateBack:globalThis.updateGlobalBackButtonVisibility,
    game:globalThis.Game
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
  globalThis.Game = { Map:{ active:true, setUiActive(active) { this.active=active === true; return true; } } };
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
    assert.equal(world.style.opacity,'1','the ministry parent must remain opaque because the map is hidden independently');
    assert.equal(globalThis.Game.Map.active,false,'map presentation must suspend when the ministry opens');
    assert.equal(world.style.pointerEvents,'none');
    assert.equal(dashboard.style.display,'none');
    assert.equal(root.style.display,'flex');
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document=previous.document;
    if (previous.app === undefined) delete globalThis.OmegaUIV2App; else globalThis.OmegaUIV2App=previous.app;
    if (previous.manager === undefined) delete globalThis.OmegaLayerManager; else globalThis.OmegaLayerManager=previous.manager;
    if (previous.country === undefined) delete globalThis.OmegaMinistryViewCountry; else globalThis.OmegaMinistryViewCountry=previous.country;
    if (previous.updateBack === undefined) delete globalThis.updateGlobalBackButtonVisibility; else globalThis.updateGlobalBackButtonVisibility=previous.updateBack;
    if (previous.game === undefined) delete globalThis.Game; else globalThis.Game=previous.game;
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

test('Programmatic minister recruitment opens UI v2 for the explicitly selected country', () => {
  const previous = {
    OmegaCabinetUI: globalThis.OmegaCabinetUI,
    OmegaMinisterRecruitment: globalThis.OmegaMinisterRecruitment,
    OmegaMinisterStateRegistry: globalThis.OmegaMinisterStateRegistry,
    OmegaLiveMinisterSelectorV9: globalThis.OmegaLiveMinisterSelectorV9
  };
  globalThis.OmegaCabinetUI = {
    activeCountry: 'USA',
    ministriesDatabase: {
      cabinet_council: { id:'cabinet_council', title:'Executive Cabinet', category:'governance' },
      interior_security: { id:'interior_security', title:'Interior & Security', category:'governance' },
      trade: { id:'trade', title:'Trade', category:'economy' }
    }
  };
  globalThis.OmegaMinisterRecruitment = {
    normalizeCountryCode(value) { return String(value == null ? '' : value).trim().toUpperCase(); },
    fetchRoster: async () => []
  };
  globalThis.OmegaMinisterStateRegistry = {
    getActiveMinisterSummary() { return null; },
    getActiveMinister() { return null; }
  };
  globalThis.OmegaLiveMinisterSelectorV9 = { active() { return null; } };
  const viewChanges = [];
  const root = {
    classList: { add() {} },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; },
    innerHTML: ''
  };
  try {
    const result = globalThis.OmegaUIV2Government.openRecruitment(root, 'interior_security', {
      countryId: 'BGD',
      view: 'executive-ministry',
      onViewChange(view) { viewChanges.push(view); }
    });
    assert.deepEqual(result, {
      ok: true,
      ministryId: 'interior_security',
      countryId: 'BGD',
      view: 'all-ministries'
    });
    assert.equal(root.__omegaV2RecruitingMinistry, 'interior_security');
    assert.equal(root.__omegaV2RecruitingCountry, 'BGD');
    assert.equal(root.__omegaV2GovernmentView, 'all-ministries');
    assert.deepEqual(viewChanges, ['all-ministries']);
    assert.match(root.innerHTML, /data-omega-v2-minister-recruitment-panel/);
    assert.match(root.innerHTML, /data-country-id="BGD"/);
    assert.match(root.innerHTML, /data-ministry-id="interior_security"/);
    assert.equal(root.innerHTML.includes('omega-minister-command'), false);
  } finally {
    globalThis.OmegaUIV2Government.stopAutoRotation(root);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
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
  assert.match(government, /function ministerCandidateCard\(candidate, selectedId\)/);
  assert.match(government, /data-omega-v2-minister-candidate-card/);
  assert.match(government, /data-omega-v2-minister-current-officeholder/);
  assert.match(government, /__omegaV2RecruitmentRequestId/);
  assert.match(government, /button\.disabled = true;\s*button\.textContent = root\.__omegaV2RecruitmentHasCurrentMinister/);
  assert.match(government, /selector\.appoint\(recruitingId, candidate, country\)/);
  assert.match(government, /appointmentScreenStillCurrent/);
  assert.match(government, /activeOptions\.isScreenWorkCurrent\(\)/);
  assert.doesNotMatch(government, /id="omega-v2-minister-candidate" data-omega-v2-minister-candidate/);
  const ministerStyles = readFileSync(new URL('../omega_ui_v2/omega-ui-v2.css', import.meta.url), 'utf8');
  assert.match(ministerStyles, /\.omega-v2-minister-candidate-card\.is-selected/);
  assert.match(ministerStyles, /\.omega-v2-minister-avatar/);

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


test('factory command cards use canonical SVGs, daily production state, type counts and conditional neon selection', async () => {
  const keys = ['Game','OmegaResourceIndustrialCatalogData','Omega','currentActiveCountry','OmegaResourceIndustrialNetwork','OmegaResourceCommandCenterUI'];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  globalThis.Omega = {};
  globalThis.currentActiveCountry = 'BGD';
  globalThis.OmegaResourceIndustrialCatalogData = {
    factoryProfiles: {
      STEEL_AND_ALLOY_WORKS: { name:'Steel and Alloy Works' },
      INDUSTRIAL_CHEMICALS_GAS_PLANT: { name:'Industrial Chemicals and Gases' },
      RARE_EARTH_BENEFICIATION_PLANT: { name:'Rare Earth Processing' }
    },
    factoryTypeAliases: {},
    downstreamFactoryRecipes: {
      STEEL_PRIMARY_ROUTE_V1: { recipeId:'STEEL_PRIMARY_ROUTE_V1', factoryType:'STEEL_AND_ALLOY_WORKS', inputs:{iron_ore:1}, outputs:{steel:1} }
    },
    processingRules: {}
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
  const selectionAttrs = {};
  const assetCardAttrs = {};
  const selectionButton = {
    getAttribute(name) { return name === 'data-omega-v2-factory-select' ? 'FAC-STEEL' : selectionAttrs[name]; },
    setAttribute(name, value) { selectionAttrs[name] = value; }
  };
  const selectedAssetCard = {
    getAttribute(name) { return name === 'data-factory-id' ? 'FAC-STEEL' : assetCardAttrs[name]; },
    setAttribute(name, value) { assetCardAttrs[name] = value; }
  };
  const sidePanel = {
    innerHTML:'',
    hidden:true,
    setAttribute(name, value) { this[name] = value; }
  };
  const root = {
    classList:{add(){}},
    addEventListener(name,handler){handlers[name]=handler;},
    contains(){return true;},
    querySelector(selector) { return selector === '[data-factory-detail-panel]' ? sidePanel : null; },
    querySelectorAll(selector) {
      if (selector === '[data-omega-v2-factory-card-expand]') return [];
      if (selector === '[data-omega-v2-factory-select]') return [selectionButton];
      if (selector === '[data-omega-v2-factory-card]') return [selectedAssetCard];
      return [];
    },
    innerHTML:''
  };
  try {
    const result = globalThis.OmegaUIV2Industry.render(root,{countryId:'BGD',tab:'factories',factoryView:'assets'});
    assert.equal(result.ok,true);
    assert.equal(result.model.factoryCount,3);
    assert.match(root.innerHTML,/class="omega-v2-factory-command fp-stage"/);
    assert.match(root.innerHTML,/class="fp-top"/);
    assert.match(root.innerHTML,/OMEGA \/ INDUSTRIAL SYSTEMS/);
    assert.match(root.innerHTML,/class="fp-deck"/);
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
    assert.match(root.innerHTML,/class="fp-summary"/);
    assert.match(root.innerHTML,/FACTORIES/);
    assert.match(root.innerHTML,/PRODUCTION CYCLES/);

    // Every industrial tab must remain inside the reference command stage.
    // The old renderer used a different root for non-factory tabs, which discarded
    // the new metal/neon interface as soon as any top-tab button was pressed.
    for (const tab of ['production-lines','inventory','national-inventory','research','projects']) {
      const tabResult = globalThis.OmegaUIV2Industry.render(root,{countryId:'BGD',tab});
      assert.equal(tabResult.ok,true,tab + ' tab should render');
      assert.match(root.innerHTML,/class="omega-v2-factory-command fp-stage"/,tab + ' must keep the command stage');
      assert.match(root.innerHTML,/class="fp-top"/,tab + ' must keep the command header');
      assert.match(root.innerHTML,/class="fp-summary"/,tab + ' must keep country data metrics');
      assert.match(root.innerHTML,/class="fp-content"/,tab + ' content must render inside the themed shell');
      assert.match(root.innerHTML,new RegExp('data-active-tab="' + tab + '"'),tab + ' must mark the active tab');
      assert.doesNotMatch(root.innerHTML,/class="omega-v2-heading"/,tab + ' must not fall back to the legacy screen');
    }
    const returnToFactories = globalThis.OmegaUIV2Industry.render(root,{countryId:'BGD',tab:'factories',factoryView:'assets'});
    assert.equal(returnToFactories.ok,true);
    assert.match(root.innerHTML,/data-omega-v2-factory-card/);
    assert.match(root.innerHTML,/commons\.wikimedia\.org\/wiki\/File:Industrial_production_line_operating_in_a_large_modern_factory\.jpg/);
    assert.match(root.innerHTML,/href="https:\/\/creativecommons\.org\/licenses\/by\/2\.0\//);
    assert.match(root.innerHTML,/Image resized and converted to WebP/);
    assert.doesNotMatch(root.innerHTML,/<small class="omega-v2-factory-reason">not recorded<\/small>/);
    const click = handlers.click;
    assert.equal(typeof click,'function');
    const htmlBeforeLocalSelection = root.innerHTML;
    click({target:{closest(selector){
      if(selector==='[data-omega-v2-factory-select]') return selectionButton;
      return null;
    }}});
    assert.equal(root.innerHTML,htmlBeforeLocalSelection,
      'selecting a live factory must update the selected card and side panel without rerendering the Industry root');
    assert.equal(selectionAttrs['aria-pressed'],'true');
    assert.equal(assetCardAttrs['data-selected'],'true');
    assert.equal(root.__omegaV2FactoryCardUiState.expandedKey,'asset:FAC-STEEL');
    assert.equal(sidePanel.hidden,false);

    const typeView = globalThis.OmegaUIV2Industry.render(root,{countryId:'BGD',tab:'factories',factoryView:'types'});
    assert.equal(typeView.ok,true);
    assert.match(root.innerHTML,/Factory types &amp; country totals/);
    assert.equal((root.innerHTML.match(/data-omega-v2-factory-type-card/g)||[]).length,3);
    assert.match(root.innerHTML,/Factories/);
    assert.match(root.innerHTML,/data-factory-view="types"/);

    // Build stays within UI v2 rather than opening the retired command centre.
    let legacyOpenCalls = 0;
    let projectRequest = null;
    globalThis.OmegaResourceCommandCenterUI = {
      open(){ legacyOpenCalls += 1; },
      openPanel(){ legacyOpenCalls += 1; }
    };
    globalThis.OmegaResourceIndustrialNetwork = {
      async loadCatalog(){ return {status:'READY'}; },
      startFactoryProject(input) {
        projectRequest = input;
        const project = {
          projectId:'FACTORY:BGD:STEEL_AND_ALLOY_WORKS:TEST',
          projectType:'FACTORY_CONSTRUCTION', countryId:input.countryId,
          factoryType:input.factoryType, factoryId:'FAC-STEEL-NEW',
          status:'UNDER_CONSTRUCTION', startTurn:4, cost:1000, resourceId:'iron_ore'
        };
        globalThis.Game.state.resource.BGD.industrialNetwork.projects.push(project);
        return project;
      }
    };
    click({target:{closest(selector){
      if(selector==='[data-omega-v2-factory-build]')return{
        disabled:false,
        getAttribute(name){return name==='data-factory-type'?'STEEL_AND_ALLOY_WORKS':'CATALOG';}
      };
      return null;
    }}});
    assert.match(root.innerHTML,/data-omega-v2-factory-project-form/);
    assert.match(root.innerHTML,/Start factory construction/);
    assert.equal(legacyOpenCalls,0,'the Build button must not open the retired command centre');
    assert.equal(typeof handlers.submit,'function','the in-UI form must expose a submit handler');
    const projectForm = {elements:{
      factoryType:{value:'STEEL_AND_ALLOY_WORKS'}, recipeId:{value:'STEEL_PRIMARY_ROUTE_V1'},
      resourceId:{value:''}, cost:{value:''}, capacityPerDay:{value:''}, buildDays:{value:''}
    }};
    await handlers.submit({target:{closest(selector){
      return selector==='[data-omega-v2-factory-project-form]'?projectForm:null;
    }},preventDefault(){}});
    assert.equal(projectRequest.countryId,'BGD');
    assert.equal(projectRequest.factoryType,'STEEL_AND_ALLOY_WORKS');
    assert.equal(projectRequest.recipeId,'STEEL_PRIMARY_ROUTE_V1');
    assert.equal(legacyOpenCalls,0,'submitting Build must remain inside UI v2');
    assert.match(root.innerHTML,/FACTORY:BGD:STEEL_AND_ALLOY_WORKS:TEST/);
    assert.match(root.innerHTML,/class="omega-v2-factory-command fp-stage"/);
    const css = readFileSync(new URL('../omega_ui_v2/factory-production-command.css',import.meta.url),'utf8');
    assert.match(css,/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css,/FP Command Stage/);
    assert.match(css,/aspect-ratio:\s*1672\/941/);
    assert.match(css,/@supports \(width:\s*1cqw\)/);
    assert.match(css,/prefers-reduced-motion:\s*reduce/);
    assert.match(css,/FP persistent command view fixes/);
    assert.match(css,/orientation:\s*landscape\) and \(max-height:\s*520px/);
    assert.match(css,/fp-summary/);
    assert.match(css,/@supports not \(width:\s*1cqw\)[\s\S]*?\.fp-badge\s*\{\s*display:\s*grid/);
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
          // Mirror retained for compatibility; the economy registry below owns the factory.
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
      BGD:{ productionAssets:[
        { id:'BGD-STEEL-1', name:'Bangladesh Steelworks', factoryType:'STEEL_MILL', capacityPerDay:30, status:'OPERATIONAL' },
        { id:'BGD-NET-FACTORY', name:'Bangladesh Alloy Works', factoryType:'STEEL_MILL', capacityPerDay:25, status:'ACTIVE' }
      ] },
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
    const rendered = globalThis.OmegaUIV2Industry.render(root, { countryId:'BGD', factoryView:'assets' });
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

test('screen render failures preserve a working navigation shell and skip duplicate ministry lookup work', () => {
  const previous = {
    document:globalThis.document,
    government:globalThis.OmegaUIV2Government,
    diagnostics:globalThis.__OMEGA_UI_V2_DIAGNOSTICS,
    requestAnimationFrame:globalThis.requestAnimationFrame,
    cancelAnimationFrame:globalThis.cancelAnimationFrame
  };
  let rowsCalled = 0;
  const handlers = Object.create(null);
  const attrs = Object.create(null);
  const mainAttrs = Object.create(null);
  const main = {
    innerHTML:'',
    setAttribute(key, value) { mainAttrs[key] = String(value); },
    removeAttribute(key) { delete mainAttrs[key]; }
  };
  const backButton = { disabled:false };
  let shellHtml = '';
  let shellWrites = 0;
  const root = {
    get innerHTML() { return shellHtml; },
    set innerHTML(value) { shellWrites += 1; shellHtml = value; main.innerHTML = ''; },
    classList:{ add(){}, remove(){} },
    addEventListener(type, handler) { handlers[type] = handler; },
    contains() { return true; },
    querySelector(selector) {
      if (selector === '[data-omega-v2-main]') return main;
      if (selector === '[data-omega-v2-back]') return backButton;
      return null;
    },
    querySelectorAll() { return []; },
    setAttribute(key, value) { attrs[key] = String(value); },
    removeAttribute(key) { delete attrs[key]; },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(attrs, key) ? attrs[key] : null; }
  };
  const frames = new Map();
  let nextFrame = 1;
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  function flushFrames() {
    let turns = 0;
    while (frames.size && turns < 10) {
      const first = frames.entries().next().value;
      frames.delete(first[0]);
      first[1](16);
      turns += 1;
    }
    assert.equal(frames.size, 0, 'scheduled render should settle within its two animation frames');
  }
  globalThis.document = {};
  globalThis.OmegaUIV2Government = {
    getMinistryRows() { rowsCalled += 1; throw new Error('duplicate ministry lookup should not run'); },
    render() { throw new Error('simulated ministry renderer crash'); }
  };
  try {
    const result = globalThis.OmegaUIV2App.mount(root, { initialRoute:'government' });
    assert.equal(result.ok, true, 'the fallback shell remains a valid mounted UI');
    assert.equal(result.code, 'SCREEN_RENDER_FAILED');
    assert.equal(result.screenRecovery, true);
    assert.equal(root.getAttribute('data-omega-v2-route'), 'government');
    assert.match(main.innerHTML, /This screen could not be opened/);
    assert.match(main.innerHTML, /data-omega-v2-global-nav="more"/);
    assert.equal(rowsCalled, 0, 'the global route menu must not trigger an extra ministry database read');
    assert.equal(globalThis.__OMEGA_UI_V2_DIAGNOSTICS.lastRenderFailure.route, 'government');
    assert.match(globalThis.__OMEGA_UI_V2_DIAGNOSTICS.lastRenderFailure.message, /simulated ministry renderer crash/);

    const control = {
      closest(selector) {
        if (selector === 'button,a[href],[role="button"],summary' ||
            selector === '[data-omega-v2-global-nav]') return this;
        return null;
      },
      getAttribute(name) { return name === 'data-omega-v2-global-nav' ? 'more' : null; }
    };
    handlers.click({
      target:control,
      preventDefault(){},
      stopPropagation(){}
    });
    assert.equal(root.getAttribute('data-omega-v2-route'), 'more');
    assert.match(main.innerHTML, /Preparing this section/);
    assert.equal(frames.size, 1, 'navigation work must be deferred so the loading state can paint');
    flushFrames();
    assert.match(main.innerHTML, /Command Center/);
    assert.equal(shellWrites, 1, 'rendering a new destination must not rebuild the whole app shell');
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.government === undefined) delete globalThis.OmegaUIV2Government; else globalThis.OmegaUIV2Government = previous.government;
    if (previous.diagnostics === undefined) delete globalThis.__OMEGA_UI_V2_DIAGNOSTICS; else globalThis.__OMEGA_UI_V2_DIAGNOSTICS = previous.diagnostics;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.cancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
  }
});

test('rapid navigation reuses the app shell, paints feedback, cancels stale renders and measures screen time', () => {
  const previous = {
    document:globalThis.document,
    diagnostics:globalThis.__OMEGA_UI_V2_DIAGNOSTICS,
    requestAnimationFrame:globalThis.requestAnimationFrame,
    cancelAnimationFrame:globalThis.cancelAnimationFrame,
    government:globalThis.OmegaUIV2Government
  };
  const handlers = Object.create(null);
  const attrs = Object.create(null);
  const mainAttrs = Object.create(null);
  const main = {
    innerHTML:'',
    setAttribute(key, value) { mainAttrs[key] = String(value); },
    removeAttribute(key) { delete mainAttrs[key]; }
  };
  const backButton = { disabled:false };
  let shellHtml = '';
  let shellWrites = 0;
  const root = {
    get innerHTML() { return shellHtml; },
    set innerHTML(value) { shellWrites += 1; shellHtml = value; main.innerHTML = ''; },
    classList:{ add(){}, remove(){} },
    addEventListener(type, handler) { handlers[type] = handler; },
    contains() { return true; },
    querySelector(selector) {
      if (selector === '[data-omega-v2-main]') return main;
      if (selector === '[data-omega-v2-back]') return backButton;
      return null;
    },
    querySelectorAll() { return []; },
    setAttribute(key, value) { attrs[key] = String(value); },
    removeAttribute(key) { delete attrs[key]; },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(attrs, key) ? attrs[key] : null; }
  };
  const frames = new Map();
  let nextFrame = 1;
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  function clickRoute(route) {
    const control = {
      closest(selector) {
        if (selector === 'button,a[href],[role="button"],summary' ||
            selector === '[data-omega-v2-global-nav]') return this;
        return null;
      },
      getAttribute(name) { return name === 'data-omega-v2-global-nav' ? route : null; }
    };
    handlers.click({ target:control, preventDefault(){}, stopPropagation(){} });
  }
  function flushFrames() {
    let turns = 0;
    while (frames.size && turns < 12) {
      const first = frames.entries().next().value;
      frames.delete(first[0]);
      first[1](16);
      turns += 1;
    }
    assert.equal(frames.size, 0, 'the latest screen render must settle without a stale animation frame');
  }

  globalThis.document = {};
  globalThis.OmegaUIV2Government = {
    render(root) { root.innerHTML = '<section>Government screen</section>'; return { ok:true }; },
    stopAutoRotation() {}
  };
  try {
    const mounted = globalThis.OmegaUIV2App.mount(root, { initialRoute:'government' });
    assert.equal(mounted.mounted, true);
    assert.match(main.innerHTML, /Government screen/);
    assert.equal(shellWrites, 1);

    clickRoute('overview');
    assert.equal(root.getAttribute('data-omega-v2-route'), 'overview');
    assert.match(main.innerHTML, /Preparing this section/);
    assert.equal(mainAttrs['aria-busy'], 'true');

    clickRoute('more');
    assert.equal(root.getAttribute('data-omega-v2-route'), 'more');
    assert.match(main.innerHTML, /Preparing this section/);
    assert.equal(frames.size, 1, 'the new tap replaces the previous screen render rather than queueing both');
    assert.equal(shellWrites, 1, 'the header and bottom navigation must survive subsequent route changes');
    flushFrames();

    assert.match(main.innerHTML, /Command Center/);
    assert.doesNotMatch(main.innerHTML, /Country Overview/);
    assert.equal(root.getAttribute('data-omega-v2-route'), 'more');
    assert.equal(root.getAttribute('data-omega-v2-navigation-pending'), null);
    assert.equal(mainAttrs['aria-busy'], undefined);
    assert.equal(globalThis.__OMEGA_UI_V2_DIAGNOSTICS.lastScreenRender.route, 'more');
    assert.ok(globalThis.__OMEGA_UI_V2_DIAGNOSTICS.screenRenderCount >= 2);
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.diagnostics === undefined) delete globalThis.__OMEGA_UI_V2_DIAGNOSTICS; else globalThis.__OMEGA_UI_V2_DIAGNOSTICS = previous.diagnostics;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.cancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    if (previous.government === undefined) delete globalThis.OmegaUIV2Government; else globalThis.OmegaUIV2Government = previous.government;
  }
});

test('cabinet exit updates the world-map layer immediately and cancels stale cleanup when reopened', () => {
  const previous = {
    document:globalThis.document,
    diagnostics:globalThis.__OMEGA_UI_V2_DIAGNOSTICS,
    requestAnimationFrame:globalThis.requestAnimationFrame,
    cancelAnimationFrame:globalThis.cancelAnimationFrame,
    government:globalThis.OmegaUIV2Government
  };
  const handlers = Object.create(null);
  const attrs = Object.create(null);
  const mainAttrs = Object.create(null);
  const main = {
    innerHTML:'',
    setAttribute(key, value) { mainAttrs[key] = String(value); },
    removeAttribute(key) { delete mainAttrs[key]; }
  };
  let shellHtml = '';
  const root = {
    get innerHTML() { return shellHtml; },
    set innerHTML(value) { shellHtml = value; main.innerHTML = ''; },
    classList:{ add(){}, remove(){} },
    addEventListener(type, handler) { handlers[type] = handler; },
    contains() { return true; },
    querySelector(selector) {
      if (selector === '[data-omega-v2-main]') return main;
      if (selector === '[data-omega-v2-back]') return { disabled:false };
      return null;
    },
    querySelectorAll() { return []; },
    setAttribute(key, value) { attrs[key] = String(value); },
    removeAttribute(key) { delete attrs[key]; },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(attrs, key) ? attrs[key] : null; }
  };
  const frames = new Map();
  let nextFrame = 1;
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  let prepareCount = 0;
  let closeCount = 0;
  let worldMapActive = true;
  const options = {
    initialRoute:'government',
    onPrepareBackToMap() { prepareCount += 1; worldMapActive = false; },
    onBackToMap() { closeCount += 1; return true; }
  };
  function clickExit() {
    const control = {
      closest(selector) {
        if (selector === 'button,a[href],[role="button"],summary' ||
            selector === '[data-omega-v2-exit]') return this;
        return null;
      },
      getAttribute(name) { return name === 'data-omega-v2-exit' ? '' : null; }
    };
    handlers.click({ target:control, preventDefault(){}, stopPropagation(){} });
  }
  function flushFrames() {
    let turns = 0;
    while (frames.size && turns < 12) {
      const first = frames.entries().next().value;
      frames.delete(first[0]);
      first[1](16);
      turns += 1;
    }
    assert.equal(frames.size, 0, 'queued frame work must settle or be cancelled');
  }

  globalThis.document = {};
  globalThis.OmegaUIV2Government = {
    render(target) { target.innerHTML = '<section>Government screen</section>'; return { ok:true }; },
    stopAutoRotation() {}
  };
  try {
    const mounted = globalThis.OmegaUIV2App.mount(root, options);
    assert.equal(mounted.mounted, true);
    assert.match(main.innerHTML, /Government screen/);

    clickExit();
    assert.equal(prepareCount, 1, 'world-map layer state must be updated synchronously on exit');
    assert.equal(worldMapActive, false);
    assert.equal(closeCount, 0, 'heavy cabinet teardown must be deferred until after the loading frame');
    assert.match(main.innerHTML, /Returning to the world map/);
    assert.equal(frames.size, 1, 'the deferred teardown should be scheduled after the loading state');

    worldMapActive = true;
    const reopened = globalThis.OmegaUIV2App.mount(root, options);
    assert.equal(reopened.mounted, true, 'the cabinet must be reopenable before stale teardown runs');
    assert.equal(root.getAttribute('data-omega-v2-route'), 'government');
    assert.match(main.innerHTML, /Government screen/);
    assert.equal(frames.size, 0, 'reopening must cancel pending teardown from the previous cabinet session');
    flushFrames();
    assert.equal(closeCount, 0, 'stale teardown must never close the newly opened cabinet');
    assert.equal(worldMapActive, true);
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.diagnostics === undefined) delete globalThis.__OMEGA_UI_V2_DIAGNOSTICS; else globalThis.__OMEGA_UI_V2_DIAGNOSTICS = previous.diagnostics;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.cancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    if (previous.government === undefined) delete globalThis.OmegaUIV2Government; else globalThis.OmegaUIV2Government = previous.government;
  }
});

test('each newer destination aborts the previous screen work signal before scheduling its own render', () => {
  const previous = {
    document:globalThis.document,
    diagnostics:globalThis.__OMEGA_UI_V2_DIAGNOSTICS,
    requestAnimationFrame:globalThis.requestAnimationFrame,
    cancelAnimationFrame:globalThis.cancelAnimationFrame,
    government:globalThis.OmegaUIV2Government
  };
  const handlers = Object.create(null);
  const attrs = Object.create(null);
  const main = {
    innerHTML:'',
    setAttribute(){},
    removeAttribute(){}
  };
  let shellHtml = '';
  const root = {
    get innerHTML() { return shellHtml; },
    set innerHTML(value) { shellHtml = value; main.innerHTML = ''; },
    classList:{ add(){}, remove(){} },
    addEventListener(type, handler) { handlers[type] = handler; },
    contains() { return true; },
    querySelector(selector) {
      if (selector === '[data-omega-v2-main]') return main;
      if (selector === '[data-omega-v2-back]') return { disabled:false };
      return null;
    },
    querySelectorAll() { return []; },
    setAttribute(key,value) { attrs[key] = String(value); },
    removeAttribute(key) { delete attrs[key]; },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(attrs,key) ? attrs[key] : null; }
  };
  const frames = new Map();
  let nextFrame = 1;
  globalThis.requestAnimationFrame = callback => {
    const id = nextFrame++;
    frames.set(id,callback);
    return id;
  };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const seenSignals = [];
  function clickRoute(route) {
    const control = {
      closest(selector) {
        if (selector === 'button,a[href],[role="button"],summary' ||
            selector === '[data-omega-v2-global-nav]') return this;
        return null;
      },
      getAttribute(name) { return name === 'data-omega-v2-global-nav' ? route : null; }
    };
    handlers.click({ target:control, preventDefault(){}, stopPropagation(){} });
  }
  function flushFrames() {
    let turns = 0;
    while (frames.size && turns < 12) {
      const first = frames.entries().next().value;
      frames.delete(first[0]);
      first[1](16);
      turns += 1;
    }
    assert.equal(frames.size,0,'only the latest navigation may retain scheduled frame work');
  }

  globalThis.document = {};
  globalThis.OmegaUIV2Government = {
    render(target,options) {
      seenSignals.push(options && options.screenSignal);
      target.innerHTML = '<section>Government screen</section>';
      return { ok:true };
    },
    stopAutoRotation(){}
  };
  try {
    const mounted = globalThis.OmegaUIV2App.mount(root,{initialRoute:'government'});
    assert.equal(mounted.mounted,true);
    const firstSignal = seenSignals[seenSignals.length-1];
    assert.ok(firstSignal && typeof firstSignal.aborted === 'boolean',
      'screen renderers must receive a per-destination AbortSignal');

    clickRoute('overview');
    const secondSignal = root.__omegaUIV2State.screenAbortController.signal;
    assert.equal(firstSignal.aborted,true,
      'the previous screen request must be cancelled synchronously on the first new tap');
    assert.equal(secondSignal.aborted,false);

    clickRoute('more');
    assert.equal(secondSignal.aborted,true,
      'a rapid second tap must cancel the pending work for the intermediate destination too');
    assert.equal(frames.size,1,'superseded destination frames must be discarded instead of queued');

    flushFrames();
    assert.equal(root.getAttribute('data-omega-v2-route'),'more');
    assert.match(main.innerHTML,/Command Center/);
    assert.equal(root.getAttribute('data-omega-v2-navigation-pending'),null);
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.diagnostics === undefined) delete globalThis.__OMEGA_UI_V2_DIAGNOSTICS; else globalThis.__OMEGA_UI_V2_DIAGNOSTICS = previous.diagnostics;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.cancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    if (previous.government === undefined) delete globalThis.OmegaUIV2Government; else globalThis.OmegaUIV2Government = previous.government;
  }
});


test('factory type cards restore counts from the existing country registry without extra source tables', () => {
  const previousGame = globalThis.Game;
  const previousCatalog = globalThis.OmegaResourceIndustrialCatalogData;
  const previousBaseline = globalThis.OmegaCountryFactoryStartingBaselineV1;
  globalThis.Game = { state: {
    simulation: { session: { playerCountryId: 'BGD' }, turn: 1 },
    resource: { BGD: {
      productionAssets: [{ id:'IGNORED-RESOURCE-MIRROR', factoryType:'STEEL_MILL', status:'OPERATIONAL' }],
      industrialNetwork: {
        productionAssets: [{ id:'IGNORED-INDUSTRIAL-MIRROR', factoryType:'CEMENT_PLANT', status:'OPERATIONAL' }],
        factoryAssets: [{ id:'IGNORED-FACTORY-MIRROR', factoryType:'CEMENT_PLANT', status:'OPERATIONAL' }],
        projects: [], factoryProductionCycles: {}, factoryRuntime: {}, siteFlowLedger: []
      }
    } },
    economy: { BGD: { productionAssets: [] } }
  } };
  globalThis.OmegaResourceIndustrialCatalogData = {
    factoryProfiles: {
      STEEL_MILL: { name:'Steel Mill', category:'Heavy Industry' },
      CEMENT_PLANT: { name:'Cement Plant', category:'Construction' }
    }
  };
  let runtimeRegistered = false;
  let liveCounts = { STEEL_MILL:0, CEMENT_PLANT:0 };
  globalThis.OmegaCountryFactoryStartingBaselineV1 = {
    getCountryFactoryRegistry(countryId) {
      assert.equal(countryId, 'BGD');
      return {
        status:'READY', runtimeRegistered,
        registry:[
          { factoryType:'STEEL_MILL', name:'Steel Mill', startingCount:3 },
          { factoryType:'CEMENT_PLANT', name:'Cement Plant', startingCount:4 }
        ],
        liveFactoryTypeCounts: liveCounts
      };
    }
  };
  try {
    const model = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'BGD' });
    assert.equal(model.factories.length, 0);
    assert.equal(model.factoryCount, 7);
    assert.deepEqual(model.factoryTypeCounts.map(row => [row.type,row.count]).sort(), [
      ['CEMENT_PLANT',4], ['STEEL_MILL',3]
    ]);
    const root = { classList:{ add(){} }, addEventListener(){}, contains(){ return true; } };
    const result = globalThis.OmegaUIV2Industry.render(root, {
      countryId:'BGD', tab:'factories', factoryView:'types'
    });
    assert.equal(result.ok, true);
    assert.match(root.innerHTML, /Factories/);
    assert.match(root.innerHTML, /<strong>3<\/strong>/);
    assert.match(root.innerHTML, /<strong>4<\/strong>/);
    assert.doesNotMatch(root.innerHTML, /UNIDO|Official establishment data|Source status/);

    runtimeRegistered = true;
    liveCounts = { STEEL_MILL:1, CEMENT_PLANT:2 };
    globalThis.Game.state.economy.BGD.productionAssets = [
      { id:'LIVE-STEEL-1', factoryType:'STEEL_MILL', status:'OPERATIONAL' },
      { id:'LIVE-CEMENT-1', factoryType:'CEMENT_PLANT', status:'OPERATIONAL' },
      { id:'LIVE-CEMENT-2', factoryType:'CEMENT_PLANT', status:'OPERATIONAL' }
    ];
    const liveModel = globalThis.OmegaUIV2Industry.buildViewModel({ countryId:'BGD' });
    assert.equal(liveModel.factoryCount, 3);
    assert.deepEqual(liveModel.factoryTypeCounts.map(row => [row.type,row.count]).sort(), [
      ['CEMENT_PLANT',2], ['STEEL_MILL',1]
    ]);
  } finally {
    if (previousGame === undefined) delete globalThis.Game; else globalThis.Game = previousGame;
    if (previousCatalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData;
    else globalThis.OmegaResourceIndustrialCatalogData = previousCatalog;
    if (previousBaseline === undefined) delete globalThis.OmegaCountryFactoryStartingBaselineV1;
    else globalThis.OmegaCountryFactoryStartingBaselineV1 = previousBaseline;
  }
});


test('every canonical factory recipe input and output renders a product-specific SVG identity', () => {
  const catalog = JSON.parse(readFileSync('resource_industrial_catalog_v1.json','utf8'));
  const api = globalThis.OmegaUIV2Industry;
  assert.ok(api && typeof api.productIconVisualMarkup === 'function');
  const iconManifest = JSON.parse(readFileSync('assets/omega-industrial-icons-v1/manifest.json','utf8'));
  assert.equal(iconManifest.resources.length,42,'all canonical raw resources must retain their SVG identities');
  for (const resource of iconManifest.resources) {
    const markup = api.productIconVisualMarkup(resource.id,resource.label);
    assert.ok(markup.includes('assets/omega-industrial-icons-v1/' + resource.file),
      resource.id + ' must resolve to its own canonical raw-resource SVG');
  }
  const productIds = new Set();
  for (const recipe of Object.values(catalog.downstreamFactoryRecipes || {})) {
    for (const productId of [
      ...Object.keys(recipe && recipe.inputs || {}),
      ...Object.keys(recipe && recipe.outputs || {})
    ]) productIds.add(String(productId).toLowerCase());
  }
  assert.ok(productIds.size >= 90, 'canonical recipes should cover the downstream product namespace');
  for (const productId of productIds) {
    const label = productId.split(/[_-]+/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    const markup = api.productIconVisualMarkup(productId,label);
    assert.ok(markup.includes('<svg ') || markup.includes('<img '), productId + ' must render a visual icon');
    assert.ok(markup.includes('data-factory-product-icon="' + productId + '"'),
      productId + ' must keep its exact identity attached to the SVG');
    assert.ok(markup.includes('aria-label=') || markup.includes('alt='),
      productId + ' icon must have an accessible label');
  }
  assert.ok(api.productIconVisualMarkup('copper','Copper').includes('resources/copper.svg'),
    'Copper must resolve to the copper asset rather than a generic drawing');
  assert.ok(api.productIconVisualMarkup('steel','Steel').includes('data-icon-source="generated-product"'),
    'Steel must use a finished-product SVG rather than pretending to be raw iron ore');
  const productMotifs = new Set();
  for (const productId of productIds) {
    const label = productId.split(/[_-]+/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    const markup = api.productIconVisualMarkup(productId,label);
    if (markup.includes('data-icon-source="canonical-resource"')) continue;
    const motif = markup.match(/data-icon-motif="([^"]+)"/)?.[1];
    assert.ok(motif, productId + ' must expose its physical SVG motif');
    assert.notEqual(motif, 'industrial-crate', productId + ' must not fall back to a generic crate icon');
    productMotifs.add(motif);
  }
  assert.ok(productMotifs.size >= 25, 'canonical industrial products must use a broad set of recognizably different silhouettes');
});


test('Factory Stock and Input calculate all assigned factory-type requirements before production starts', () => {
  const previous = {
    Game:globalThis.Game,
    catalog:globalThis.OmegaResourceIndustrialCatalogData,
    baseline:globalThis.OmegaCountryFactoryStartingBaselineV1,
    inventory:globalThis.OmegaCountryInventoryRuntime,
    countryRuntime:globalThis.OmegaCountryRuntimeData,
    omega:globalThis.Omega
  };
  globalThis.Omega = {};
  globalThis.OmegaCountryRuntimeData = null;
  globalThis.OmegaResourceIndustrialCatalogData = {
    factoryProfiles: {
      STEEL_MILL: { name:'Steel Mill', category:'Metals', defaultCapacityPerDay:10, defaultRecipeId:'STEEL-RECIPE', recipeIds:['STEEL-RECIPE'] },
      CEMENT_PLANT: { name:'Cement Plant', category:'Construction', defaultCapacityPerDay:20, defaultRecipeId:'CEMENT-RECIPE', recipeIds:['CEMENT-RECIPE'] }
    },
    downstreamFactoryRecipes: {
      'STEEL-RECIPE': { recipeId:'STEEL-RECIPE', factoryType:'STEEL_MILL', cycleDays:2, inputs:{iron_ore:0.5,coal:0.25}, outputs:{steel:0.8}, inputUnit:'SIMULATION_RESOURCE_UNIT', outputUnit:'SIMULATION_RESOURCE_UNIT' },
      'CEMENT-RECIPE': { recipeId:'CEMENT-RECIPE', factoryType:'CEMENT_PLANT', cycleDays:1, inputs:{limestone:0.4}, outputs:{cement:0.9}, inputUnit:'SIMULATION_RESOURCE_UNIT', outputUnit:'SIMULATION_RESOURCE_UNIT' }
    },
    processingRules: {}
  };
  globalThis.OmegaCountryFactoryStartingBaselineV1 = {
    getCountryFactoryRegistry(countryId) {
      assert.equal(countryId,'BGD');
      return {
        status:'READY',
        runtimeRegistered:false,
        registry:[
          {factoryType:'STEEL_MILL',name:'Steel Mill',startingCount:3},
          {factoryType:'CEMENT_PLANT',name:'Cement Plant',startingCount:2}
        ],
        liveFactoryTypeCounts:{STEEL_MILL:0,CEMENT_PLANT:0}
      };
    }
  };
  globalThis.Game = { state:{
    simulation:{session:{playerCountryId:'BGD'},turn:1},
    resource:{BGD:{
      industrialNetwork:{projects:[],factoryProductionCycles:{},factoryRuntime:{},siteFlowLedger:[]},
      batches:[],finishedGoodsLedger:[],inventoryLedger:[],processedWarehouse:{availableByResource:{}}
    }},
    economy:{BGD:{productionAssets:[]}}
  }};
  try {
    const inputRoot = {classList:{add(){}},addEventListener(){},contains(){return true},innerHTML:''};
    const input = globalThis.OmegaUIV2Industry.render(inputRoot,{countryId:'BGD',tab:'inventory'});
    assert.equal(input.ok,true);
    assert.equal(input.model.factoryCount,5);
    assert.match(inputRoot.innerHTML,/All factory input requirements/);
    assert.match(inputRoot.innerHTML,/Steel Mill/);
    assert.match(inputRoot.innerHTML,/3 factories/);
    const inputPlanStart = inputRoot.innerHTML.indexOf('data-factory-input-plan');
    const inputSteelOrder = inputRoot.innerHTML.indexOf('Steel Mill ·',inputPlanStart);
    const inputCementOrder = inputRoot.innerHTML.indexOf('Cement Plant ·',inputPlanStart);
    assert.ok(inputSteelOrder >= 0 && inputCementOrder > inputSteelOrder,
      'input plans must list owned factory types before less numerous/absent types');
    assert.match(inputRoot.innerHTML,/Iron Ore/);
    assert.match(inputRoot.innerHTML,/Total required \/ day/);
    assert.match(inputRoot.innerHTML,/7\.5 game units/);
    assert.match(inputRoot.innerHTML,/Every 10 game days/);
    assert.match(inputRoot.innerHTML,/Awaiting the first Day 10 checkpoint/);
    assert.match(inputRoot.innerHTML,/iron_ore/);
    assert.doesNotMatch(inputRoot.innerHTML,/Total \/ full cycle|100-day requirement|750 game units|Coverage target/);
    assert.match(inputRoot.innerHTML,/Limestone/);
    assert.doesNotMatch(inputRoot.innerHTML,/No active factories are recorded/);

    const stockRoot = {classList:{add(){}},addEventListener(){},contains(){return true},innerHTML:''};
    const stock = globalThis.OmegaUIV2Industry.render(stockRoot,{countryId:'BGD',tab:'national-inventory'});
    assert.equal(stock.ok,true);
    assert.match(stockRoot.innerHTML,/Factory-type output and stock plan/);
    assert.match(stockRoot.innerHTML,/Steel Mill/);
    const outputPlanStart = stockRoot.innerHTML.indexOf('data-factory-output-plan');
    const outputSteelOrder = stockRoot.innerHTML.indexOf('<strong>Steel Mill</strong>',outputPlanStart);
    const outputCementOrder = stockRoot.innerHTML.indexOf('<strong>Cement Plant</strong>',outputPlanStart);
    assert.ok(outputSteelOrder >= 0 && outputCementOrder > outputSteelOrder,
      'output plans must list higher-owned factory types first');
    assert.match(stockRoot.innerHTML,/PRESENT · 3 FACTORIES/);
    assert.match(stockRoot.innerHTML,/Steel/);
    assert.match(stockRoot.innerHTML,/24 game units/);
    assert.match(stockRoot.innerHTML,/12 game units/);
    assert.match(stockRoot.innerHTML,/Not started \/ no committed output/);
    assert.match(stockRoot.innerHTML,/No committed factory output batches are recorded yet/);
    assert.doesNotMatch(stockRoot.innerHTML,/Iron Ore/);
  } finally {
    if (previous.Game === undefined) delete globalThis.Game; else globalThis.Game = previous.Game;
    if (previous.catalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData; else globalThis.OmegaResourceIndustrialCatalogData = previous.catalog;
    if (previous.baseline === undefined) delete globalThis.OmegaCountryFactoryStartingBaselineV1; else globalThis.OmegaCountryFactoryStartingBaselineV1 = previous.baseline;
    if (previous.inventory === undefined) delete globalThis.OmegaCountryInventoryRuntime; else globalThis.OmegaCountryInventoryRuntime = previous.inventory;
    if (previous.countryRuntime === undefined) delete globalThis.OmegaCountryRuntimeData; else globalThis.OmegaCountryRuntimeData = previous.countryRuntime;
    if (previous.omega === undefined) delete globalThis.Omega; else globalThis.Omega = previous.omega;
  }
});

test('Factory input stock coverage is captured only at every tenth in-game day', () => {
  const previous = {
    Game:globalThis.Game,
    catalog:globalThis.OmegaResourceIndustrialCatalogData,
    baseline:globalThis.OmegaCountryFactoryStartingBaselineV1,
    countryRuntime:globalThis.OmegaCountryRuntimeData,
    omega:globalThis.Omega
  };
  globalThis.Omega = {};
  globalThis.OmegaCountryRuntimeData = null;
  globalThis.OmegaResourceIndustrialCatalogData = {
    factoryProfiles: {
      STEEL_MILL: { name:'Steel Mill', category:'Metals', defaultCapacityPerDay:10, defaultRecipeId:'STEEL-RECIPE', recipeIds:['STEEL-RECIPE'] },
      CEMENT_PLANT: { name:'Cement Plant', category:'Construction', defaultCapacityPerDay:20, defaultRecipeId:'CEMENT-RECIPE', recipeIds:['CEMENT-RECIPE'] }
    },
    downstreamFactoryRecipes: {
      'STEEL-RECIPE': { recipeId:'STEEL-RECIPE', factoryType:'STEEL_MILL', cycleDays:2, inputs:{iron_ore:0.5,coal:0.25}, outputs:{steel:0.8}, inputUnit:'SIMULATION_RESOURCE_UNIT', outputUnit:'SIMULATION_RESOURCE_UNIT' },
      'CEMENT-RECIPE': { recipeId:'CEMENT-RECIPE', factoryType:'CEMENT_PLANT', cycleDays:1, inputs:{limestone:0.4}, outputs:{cement:0.9}, inputUnit:'SIMULATION_RESOURCE_UNIT', outputUnit:'SIMULATION_RESOURCE_UNIT' }
    },
    processingRules:{}
  };
  globalThis.OmegaCountryFactoryStartingBaselineV1 = {
    getCountryFactoryRegistry(countryId) {
      assert.equal(countryId,'BGD');
      return {
        status:'READY',
        runtimeRegistered:true,
        registry:[
          {factoryType:'STEEL_MILL',name:'Steel Mill',startingCount:1},
          {factoryType:'CEMENT_PLANT',name:'Cement Plant',startingCount:1}
        ],
        liveFactoryTypeCounts:{STEEL_MILL:1,CEMENT_PLANT:1}
      };
    }
  };
  globalThis.Game = { state:{
    simulation:{session:{playerCountryId:'BGD'},turn:9},
    resource:{BGD:{
      industrialNetwork:{projects:[],factoryProductionCycles:{},factoryRuntime:{},siteFlowLedger:[]},
      batches:[],finishedGoodsLedger:[],inventoryLedger:[],processedWarehouse:{availableByResource:{}}
    }},
    economy:{BGD:{productionAssets:[
      {
        id:'FACTORY-STEEL-COVERAGE-01',name:'Bangladesh Steel Mill',factoryType:'STEEL_MILL',
        recipeId:'STEEL-RECIPE',status:'OPERATIONAL',capacityPerDay:10,
        inputInventory:{iron_ore:25,coal:25},
        inputBatchLots:[
          {batchId:'IRON-IMPORT-01',resourceId:'iron_ore',quantity:25,remainingQuantity:25,
            unit:'SIMULATION_RESOURCE_UNIT',sourceCountryId:'IND'}
        ]
      },
      {
        id:'FACTORY-CEMENT-COVERAGE-01',name:'Bangladesh Cement Plant',factoryType:'CEMENT_PLANT',
        recipeId:'CEMENT-RECIPE',status:'OPERATIONAL',capacityPerDay:20,
        inputInventory:{limestone:80},
        inputBatchLots:[
          {batchId:'LIME-MINE-01',resourceId:'limestone',quantity:80,remainingQuantity:80,
            unit:'SIMULATION_RESOURCE_UNIT',sourceCountryId:'BGD',sourceSiteIds:['SITE-BGD-LIMESTONE-01']}
        ]
      }
    ]}}
  }};
  try {
    const bucket = globalThis.Game.state.resource.BGD;
    const first = globalThis.OmegaUIV2Industry.recordFactoryInputCoverage({detail:{simulationTurn:9}});
    assert.equal(first.updatedDay,10);
    const iron = first.products.find(row => row.productId === 'iron_ore');
    const coal = first.products.find(row => row.productId === 'coal');
    const limestone = first.products.find(row => row.productId === 'limestone');
    assert.equal(iron.dailyRequired,2.5);
    assert.equal(iron.currentStock,25);
    assert.equal(iron.coverageDays,10);
    assert.equal(iron.importShare,1);
    assert.equal(iron.status,'risk');
    assert.equal(coal.coverageDays,20);
    assert.equal(coal.status,'stable');
    assert.equal(limestone.coverageDays,10);
    assert.equal(limestone.status,'risk');

    globalThis.Game.state.economy.BGD.productionAssets[0].inputInventory.iron_ore = 12.5;
    const offCheckpoint = globalThis.OmegaUIV2Industry.recordFactoryInputCoverage({detail:{simulationTurn:10}});
    assert.equal(offCheckpoint,null,'Day 11 must not refresh the Day 10 coverage snapshot');
    assert.equal(bucket.factoryInputCoverageSnapshotV1.updatedDay,10);

    const second = globalThis.OmegaUIV2Industry.recordFactoryInputCoverage({detail:{simulationTurn:19}});
    const secondIron = second.products.find(row => row.productId === 'iron_ore');
    assert.equal(second.updatedDay,20);
    assert.equal(secondIron.coverageDays,5);
    assert.equal(secondIron.status,'risk');

    globalThis.Game.state.economy.BGD.productionAssets[0].inputInventory.iron_ore = 1;
    const third = globalThis.OmegaUIV2Industry.recordFactoryInputCoverage({detail:{simulationTurn:29}});
    const thirdIron = third.products.find(row => row.productId === 'iron_ore');
    assert.equal(third.updatedDay,30);
    assert.equal(thirdIron.coverageDays,0.4);
    assert.equal(thirdIron.status,'critical');

    const root = {classList:{add(){}},addEventListener(){},contains(){return true},innerHTML:''};
    const rendered = globalThis.OmegaUIV2Industry.render(root,{countryId:'BGD',tab:'inventory'});
    assert.equal(rendered.ok,true);
    assert.match(root.innerHTML,/Bangladesh Steel Mill/);
    assert.match(root.innerHTML,/Import/);
    assert.match(root.innerHTML,/Domestic mine/);
    assert.match(root.innerHTML,/data-state="critical"/);
    assert.match(root.innerHTML,/0\.4 days/);
    assert.match(root.innerHTML,/Updated on Day 30/);
    assert.match(root.innerHTML,/iron_ore/);

    delete globalThis.Game.state.economy.BGD.productionAssets[0].inputInventory.coal;
    const fourth = globalThis.OmegaUIV2Industry.recordFactoryInputCoverage({detail:{simulationTurn:39}});
    const fourthCoal = fourth.products.find(row => row.productId === 'coal');
    assert.equal(fourth.updatedDay,40);
    assert.equal(fourthCoal.stockComplete,false,'a missing input balance must remain unverified');
    assert.equal(fourthCoal.currentStock,null);
    assert.equal(fourthCoal.coverageDays,null);

    globalThis.Game.state.economy.BGD.productionAssets[0].inputInventory.iron_ore = 0;
    const fifth = globalThis.OmegaUIV2Industry.recordFactoryInputCoverage({detail:{simulationTurn:49}});
    const fifthIron = fifth.products.find(row => row.productId === 'iron_ore');
    assert.equal(fifth.updatedDay,50);
    assert.equal(fifthIron.currentStock,0,'an explicit zero balance remains a recorded zero');
    assert.equal(fifthIron.coverageDays,0);
    assert.equal(fifthIron.status,'critical');

  } finally {
    if (previous.Game === undefined) delete globalThis.Game; else globalThis.Game = previous.Game;
    if (previous.catalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData; else globalThis.OmegaResourceIndustrialCatalogData = previous.catalog;
    if (previous.baseline === undefined) delete globalThis.OmegaCountryFactoryStartingBaselineV1; else globalThis.OmegaCountryFactoryStartingBaselineV1 = previous.baseline;
    if (previous.countryRuntime === undefined) delete globalThis.OmegaCountryRuntimeData; else globalThis.OmegaCountryRuntimeData = previous.countryRuntime;
    if (previous.omega === undefined) delete globalThis.Omega; else globalThis.Omega = previous.omega;
  }
});

test('factory cards progressively disclose canonical products, quantities and inline construction requirements', () => {
  const previous = {
    Game:globalThis.Game,
    inventory:globalThis.OmegaCountryInventoryRuntime,
    catalog:globalThis.OmegaResourceIndustrialCatalogData,
    baseline:globalThis.OmegaCountryFactoryStartingBaselineV1,
    countryRuntime:globalThis.OmegaCountryRuntimeData,
    omega:globalThis.Omega,
    network:globalThis.OmegaResourceIndustrialNetwork
  };
  const catalog = JSON.parse(readFileSync(new URL('../resource_industrial_catalog_v1.json', import.meta.url), 'utf8'));
  globalThis.Omega = {};
  globalThis.OmegaCountryRuntimeData = null;
  globalThis.OmegaCountryFactoryStartingBaselineV1 = null;
  globalThis.OmegaResourceIndustrialCatalogData = catalog;
  globalThis.OmegaResourceIndustrialNetwork = null;
  globalThis.Game = { state:{
    simulation:{ playerCountryId:'BGD', turn:1 },
    resource:{ BGD:{
      industrialNetwork:{ projects:[],factoryProductionCycles:{},factoryRuntime:{},siteFlowLedger:[] },
      batches:[],finishedGoodsLedger:[],inventoryLedger:[],
      processedWarehouse:{ availableByResource:{} }
    }},
    economy:{ BGD:{ productionAssets:[{
      id:'FACTORY-STEEL-CARD-01',
      name:'Chattogram Steel Works',
      factoryType:'STEEL_AND_ALLOY_WORKS',
      recipeId:'STEEL_PRIMARY_ROUTE_V1',
      status:'OPERATIONAL',
      capacityPerDay:900,
      inputInventory:{ iron_concentrate:120 },
      inputBatchLots:[{
        batchId:'STEEL-IRON-INPUT-01',resourceId:'iron_concentrate',quantity:120,remainingQuantity:120,
        unit:'SIMULATION_RESOURCE_UNIT',status:'AVAILABLE_TO_FACTORY'
      }]
    }] } }
  }};
  globalThis.OmegaCountryInventoryRuntime = {
    getInventory(countryId, options) {
      assert.equal(countryId,'BGD');
      assert.equal(options.includeLedger,false);
      return {
        status:'READY',countryId:'BGD',countryName:'Bangladesh',active:true,readOnly:false,
        items:[
          {productId:'construction_aggregate',name:'Construction Aggregate',quantity:500,unit:'SIMULATION_RESOURCE_UNIT'},
          {productId:'iron_concentrate',name:'Iron Concentrate',quantity:120,unit:'SIMULATION_RESOURCE_UNIT'}
        ],
        ledger:[]
      };
    },
    getResourceCatalog() { return Object.keys(catalog.resourceRules).map(id => ({resourceId:id})); }
  };
  const listeners = {};
  const disclosureAttrs = { 'data-card-key':'type:STEEL_AND_ALLOY_WORKS', 'aria-expanded':'false' };
  const disclosureCard = { setAttribute(name, value) { this[name] = value; }, classList:{toggle(){}} };
  const disclosureButton = {
    getAttribute(name) { return disclosureAttrs[name] || (name === 'data-card-key' ? 'type:STEEL_AND_ALLOY_WORKS' : null); },
    setAttribute(name, value) { disclosureAttrs[name] = value; },
    closest() { return disclosureCard; }
  };
  const sidePanel = {
    innerHTML:'', hidden:true,
    setAttribute(name, value) { this[name] = value; }
  };
  const viewContent = { innerHTML:'' };
  const workspaceState = {};
  const workspace = { classList:{ toggle(name, active) { workspaceState[name] = !!active; } } };
  const stageAttrs = {};
  const stage = { setAttribute(name, value) { stageAttrs[name] = value; } };
  const viewToggleAttrs = {};
  const viewToggle = {
    textContent:'Details',
    getAttribute(name) { return viewToggleAttrs[name] || null; },
    setAttribute(name, value) { viewToggleAttrs[name] = value; }
  };
  const root = {
    classList:{add(){}},
    addEventListener(name, callback) { listeners[name] = callback; },
    contains() { return true; },
    querySelector(selector) {
      if (selector === '[data-factory-detail-panel]') return sidePanel;
      if (selector === '[data-omega-v2-factory-view-content]') return viewContent;
      if (selector === '.fp-stage') return stage;
      if (selector === '.fp-factory-catalog-workspace, .fp-assets-workspace') return workspace;
      return null;
    },
    querySelectorAll(selector) { return selector === '[data-omega-v2-factory-card-expand]' ? [disclosureButton] : []; },
    innerHTML:''
  };
  function render(options) {
    return globalThis.OmegaUIV2Industry.render(root,Object.assign({countryId:'BGD',tab:'factories'},options||{}));
  }
  function cardHtml(type) {
    const marker = 'data-factory-type="' + type + '"';
    const position = root.innerHTML.indexOf(marker);
    assert.ok(position >= 0,type + ' card must be rendered');
    const start = root.innerHTML.lastIndexOf('<article',position);
    const end = root.innerHTML.indexOf('</article>',position);
    assert.ok(start >= 0 && end > start,type + ' card markup must be complete');
    return root.innerHTML.slice(start,end + '</article>'.length);
  }
  try {
    const initial = render();
    assert.equal(initial.ok,true);
    assert.match(root.innerHTML,/data-omega-v2-factory-type-card/);
    let steel = cardHtml('STEEL_AND_ALLOY_WORKS');
    assert.match(steel,/Main output/);
    assert.match(steel,/Steel/);
    assert.match(steel,/ALLOY STEEL/i);
    assert.match(steel,/By-product:/);
    assert.match(steel,/BLAST FURNACE SLAG/i);
    assert.match(steel,/Input/);
    assert.match(steel,/IRON CONCENTRATE/i);
    assert.match(steel,/0\.72 simulation resource unit \/ production unit/);
    assert.match(steel,/0\.6 simulation resource unit \/ production unit/);
    assert.match(steel,/data-omega-v2-factory-card-expand/);
    assert.doesNotMatch(steel,/data-omega-v2-factory-section-toggle/,
      'expanded input/output rows are now shown in the adjacent side panel, not stacked inside the card');
    assert.match(root.innerHTML,/data-factory-detail-panel/);
    assert.doesNotMatch(steel,/PROCESSING DUST/i,'the second by-product must remain hidden in collapsed view');
    assert.doesNotMatch(steel,/COPPER CONCENTRATE/i,'only the primary input is shown in collapsed view');
    assert.match(steel,/Modeled build time/);
    assert.match(steel,/Build project/);

    // The view control must work repeatedly without rebuilding the navigation shell.
    const beforeViewToggleRoot = root.innerHTML;
    viewContent.innerHTML = 'Factory view mount';
    const viewClickTarget = {
      closest(selector) {
        if (selector === '[data-omega-v2-factory-view-toggle]') return viewToggle;
        return null;
      }
    };
    listeners.click({target:viewClickTarget});
    assert.equal(root.__omegaV2IndustryFactoryView,'assets');
    assert.match(viewContent.innerHTML,/fp-assets-workspace/);
    assert.match(viewContent.innerHTML,/FACTORY-STEEL-CARD-01/);
    assert.equal(stageAttrs['data-factory-view'],'assets');
    assert.equal(viewToggle.textContent,'Type totals');
    assert.equal(viewToggleAttrs['aria-pressed'],'true');
    assert.equal(root.innerHTML,beforeViewToggleRoot,
      'view switching must update its content subtree without rebuilding navigation and summary');

    listeners.click({target:viewClickTarget});
    assert.equal(root.__omegaV2IndustryFactoryView,'types',
      'the second view toggle must use current state, not a first-render closure value');
    assert.match(viewContent.innerHTML,/fp-type-catalog/);
    assert.equal(stageAttrs['data-factory-view'],'types');
    assert.equal(viewToggle.textContent,'Details');
    assert.equal(viewToggleAttrs['aria-pressed'],'false');
    assert.equal(root.innerHTML,beforeViewToggleRoot);

    root.__omegaV2FactoryCardUiState = {
      expandedKey:'type:STEEL_AND_ALLOY_WORKS',
      buildKey:'',
      sections:Object.create(null),
      buildMaterialsExpanded:false
    };
    render();
    steel = cardHtml('STEEL_AND_ALLOY_WORKS');
    assert.doesNotMatch(steel,/Complete production formula/,
      'expanded recipe details must not increase card height or create a vertical list');
    assert.match(root.innerHTML,/data-factory-detail-panel/);
    assert.match(root.innerHTML,/Complete production formula/);
    assert.match(root.innerHTML,/COPPER CONCENTRATE/i);
    assert.match(root.innerHTML,/CEMENT FEED/i);
    assert.match(root.innerHTML,/PROCESSING DUST/i);
    assert.match(root.innerHTML,/Quantity basis: PER SIMULATION PRODUCTION UNIT/);
    assert.match(root.innerHTML,/Steel and alloy works/i);

    root.__omegaV2FactoryCardUiState = {
      expandedKey:'',
      buildKey:'type:STEEL_AND_ALLOY_WORKS',
      sections:Object.create(null),
      buildMaterialsExpanded:false
    };
    render();
    steel = cardHtml('STEEL_AND_ALLOY_WORKS');
    assert.match(steel,/Build requirements/);
    assert.match(steel,/Construction materials/);
    assert.match(steel,/240 game-days/);
    assert.match(steel,/18,000/);
    assert.match(steel,/CONSTRUCTION AGGREGATE/i);
    assert.match(steel,/500 available/);
    assert.match(steel,/Required infrastructure/);
    assert.match(steel,/rail/);
    assert.match(steel,/Start construction project/);
    assert.doesNotMatch(steel,/Main output/,'Build mode must replace the production summary');
    assert.doesNotMatch(steel,/BLAST FURNACE SLAG/i,'Build mode must not leak recipe products');
    assert.match(steel,/data-omega-v2-factory-build-materials/);

    root.__omegaV2FactoryCardUiState = {
      expandedKey:'',
      buildKey:'',
      sections:Object.create(null),
      buildMaterialsExpanded:false
    };
    render({factoryView:'assets'});
    const live = root.innerHTML.match(/<article class="omega-v2-factory-card fp-card[^>]*data-factory-id="FACTORY-STEEL-CARD-01"[\s\S]*?<\/article>/);
    assert.ok(live,'the live factory asset card must remain available');
    assert.match(live[0],/Steel/);
    assert.match(live[0],/ALLOY STEEL/i);
    assert.match(live[0],/IRON CONCENTRATE/i);
    assert.match(live[0],/Factory stock: 120 game units/);
    assert.match(live[0],/data-omega-v2-factory-build-details/);
    assert.match(live[0],/data-omega-v2-factory-destroy/);

    root.__omegaV2FactoryCardUiState = {
      expandedKey:'asset:FACTORY-STEEL-CARD-01',
      buildKey:'',
      sections:Object.create(null),
      buildMaterialsExpanded:false
    };
    render({factoryView:'assets'});
    const liveExpanded = root.innerHTML.match(/<article class="omega-v2-factory-card fp-card[^>]*data-factory-id="FACTORY-STEEL-CARD-01"[\s\S]*?<\/article>/);
    assert.ok(liveExpanded);
    assert.doesNotMatch(liveExpanded[0],/Complete production formula/,
      'full recipe details must stay outside the card in the adjacent panel');
    assert.match(root.innerHTML,/Complete production formula/);
    assert.ok(root.innerHTML.includes('Not started / no committed output'));
    assert.match(root.innerHTML,/Factory stock: 120 game units/);
    assert.match(root.innerHTML,/Factory stock: Not recorded/,'an absent product key must remain unknown, not be converted to zero');
    assert.match(root.innerHTML,/Modeled per game day per factory: 324 game units/,'the panel must reuse capacity × coefficient ÷ cycle days per factory');
    const visibleCardText = liveExpanded[0].replace(/<[^>]*>/g,' ');
    assert.doesNotMatch(visibleCardText,/[A-Za-z0-9]_[A-Za-z0-9]/,'visible card text must not expose underscore-based identifiers');

    // Exercise the real delegated card disclosure handler and assert it updates root-local UI state.
    root.__omegaV2FactoryCardUiState = {
      expandedKey:'',
      buildKey:'',
      sections:Object.create(null),
      buildMaterialsExpanded:false
    };
    render({factoryView:'types'});
    const renderedBeforeDisclosure = root.innerHTML;
    const clickTarget = {
      closest(selector) {
        if (selector === '[data-omega-v2-factory-card-expand]') return disclosureButton;
        return null;
      }
    };
    listeners.click({target:clickTarget});
    assert.equal(root.__omegaV2FactoryCardUiState.expandedKey,'type:STEEL_AND_ALLOY_WORKS');
    assert.equal(root.__omegaV2FactoryCardUiState.buildKey,'');
    assert.equal(root.innerHTML,renderedBeforeDisclosure,
      'opening a recipe must not reassign or rebuild the full Industry root');
    assert.equal(disclosureAttrs['aria-expanded'],'true');
    assert.equal(sidePanel.hidden,false);
    assert.match(sidePanel.innerHTML,/Complete production formula/);
    assert.match(sidePanel.innerHTML,/COPPER CONCENTRATE/i);
    listeners.click({target:clickTarget});
    assert.equal(root.__omegaV2FactoryCardUiState.expandedKey,'');
    assert.equal(root.innerHTML,renderedBeforeDisclosure,
      'closing a recipe must remain a local DOM update');
    assert.equal(sidePanel.hidden,true);
    assert.equal(sidePanel.innerHTML,'');
  } finally {
    if (previous.Game === undefined) delete globalThis.Game; else globalThis.Game = previous.Game;
    if (previous.inventory === undefined) delete globalThis.OmegaCountryInventoryRuntime; else globalThis.OmegaCountryInventoryRuntime = previous.inventory;
    if (previous.catalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData; else globalThis.OmegaResourceIndustrialCatalogData = previous.catalog;
    if (previous.baseline === undefined) delete globalThis.OmegaCountryFactoryStartingBaselineV1; else globalThis.OmegaCountryFactoryStartingBaselineV1 = previous.baseline;
    if (previous.countryRuntime === undefined) delete globalThis.OmegaCountryRuntimeData; else globalThis.OmegaCountryRuntimeData = previous.countryRuntime;
    if (previous.omega === undefined) delete globalThis.Omega; else globalThis.Omega = previous.omega;
    if (previous.network === undefined) delete globalThis.OmegaResourceIndustrialNetwork; else globalThis.OmegaResourceIndustrialNetwork = previous.network;
  }
});


test('universal processing plan does not invent coal or iron ore when no eligible commercial sites exist', () => {
  const previous = {
    Game:globalThis.Game,
    inventory:globalThis.OmegaCountryInventoryRuntime,
    catalog:globalThis.OmegaResourceIndustrialCatalogData,
    baseline:globalThis.OmegaCountryFactoryStartingBaselineV1,
    countryRuntime:globalThis.OmegaCountryRuntimeData,
    omega:globalThis.Omega,
    network:globalThis.OmegaResourceIndustrialNetwork,
    siteCatalog:globalThis.OmegaResourceSiteCanonicalCatalogData,
    siteBinding:globalThis.OmegaIndividualResourceSiteBinding
  };
  const catalog = JSON.parse(readFileSync(new URL('../resource_industrial_catalog_v1.json', import.meta.url), 'utf8'));
  globalThis.Omega = {};
  globalThis.OmegaCountryRuntimeData = null;
  globalThis.OmegaCountryFactoryStartingBaselineV1 = null;
  globalThis.OmegaResourceIndustrialCatalogData = catalog;
  globalThis.OmegaResourceIndustrialNetwork = null;
  globalThis.OmegaCountryInventoryRuntime = null;
  globalThis.OmegaResourceSiteCanonicalCatalogData = null;
  globalThis.OmegaIndividualResourceSiteBinding = null;
  globalThis.Game = { state:{
    simulation:{ playerCountryId:'BGD', turn:1 },
    resource:{ BGD:{
      mineSiteReferences:[],
      industrialNetwork:{ projects:[],factoryProductionCycles:{},factoryRuntime:{},siteFlowLedger:[] },
      batches:[],finishedGoodsLedger:[],inventoryLedger:[],
      processedWarehouse:{ availableByResource:{} }
    }},
    economy:{ BGD:{ productionAssets:[{
      id:'UNIVERSAL-PROCESSING-EMPTY-SITE-MIX',
      name:'Materials Processing Plant',
      factoryType:'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT',
      status:'OPERATIONAL',
      capacityPerDay:900
    }] } }
  }};
  const root = { classList:{add(){}}, addEventListener(){}, contains(){return true;}, innerHTML:'' };
  try {
    const result = globalThis.OmegaUIV2Industry.render(root,{countryId:'BGD',tab:'inventory'});
    assert.equal(result.ok,true);
    assert.match(root.innerHTML,/data-factory-input-plan/);
    assert.doesNotMatch(root.innerHTML,/coal concentrate|iron concentrate|iron ore processing/i,
      'no eligible domestic site must not create a hard-coded coal/iron processing route');
  } finally {
    if (previous.Game === undefined) delete globalThis.Game; else globalThis.Game = previous.Game;
    if (previous.inventory === undefined) delete globalThis.OmegaCountryInventoryRuntime; else globalThis.OmegaCountryInventoryRuntime = previous.inventory;
    if (previous.catalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData; else globalThis.OmegaResourceIndustrialCatalogData = previous.catalog;
    if (previous.baseline === undefined) delete globalThis.OmegaCountryFactoryStartingBaselineV1; else globalThis.OmegaCountryFactoryStartingBaselineV1 = previous.baseline;
    if (previous.countryRuntime === undefined) delete globalThis.OmegaCountryRuntimeData; else globalThis.OmegaCountryRuntimeData = previous.countryRuntime;
    if (previous.omega === undefined) delete globalThis.Omega; else globalThis.Omega = previous.omega;
    if (previous.network === undefined) delete globalThis.OmegaResourceIndustrialNetwork; else globalThis.OmegaResourceIndustrialNetwork = previous.network;
    if (previous.siteCatalog === undefined) delete globalThis.OmegaResourceSiteCanonicalCatalogData; else globalThis.OmegaResourceSiteCanonicalCatalogData = previous.siteCatalog;
    if (previous.siteBinding === undefined) delete globalThis.OmegaIndividualResourceSiteBinding; else globalThis.OmegaIndividualResourceSiteBinding = previous.siteBinding;
  }
});

test('factory catalog warm-up timeout releases a never-settling optional load without blocking the initial view', async () => {
  const previous = {
    Game:globalThis.Game,
    catalog:globalThis.OmegaResourceIndustrialCatalogData,
    baseline:globalThis.OmegaCountryFactoryStartingBaselineV1,
    network:globalThis.OmegaResourceIndustrialNetwork,
    omega:globalThis.Omega,
    setTimeout:globalThis.setTimeout,
    clearTimeout:globalThis.clearTimeout
  };
  globalThis.Omega = {};
  globalThis.OmegaResourceIndustrialCatalogData = null;
  globalThis.OmegaCountryFactoryStartingBaselineV1 = null;
  globalThis.OmegaResourceIndustrialNetwork = { loadCatalog(){ return new Promise(() => {}); } };
  globalThis.Game = { state:{
    simulation:{ playerCountryId:'BGD', turn:1 },
    resource:{ BGD:{ industrialNetwork:{ projects:[],factoryProductionCycles:{},factoryRuntime:{},siteFlowLedger:[] } } },
    economy:{ BGD:{} }
  }};
  globalThis.setTimeout = callback => { Promise.resolve().then(callback); return 1; };
  globalThis.clearTimeout = () => {};
  const root = { classList:{add(){}}, addEventListener(){}, contains(){return true;}, querySelector(){return {};}, innerHTML:'' };
  try {
    const result = globalThis.OmegaUIV2Industry.render(root,{countryId:'BGD',tab:'factories'});
    assert.equal(result.ok,true,'initial render must return without awaiting catalog readiness');
    assert.ok(root.__omegaV2IndustryPlanWarmup);
    await root.__omegaV2IndustryPlanWarmup.promise;
    assert.equal(root.__omegaV2IndustryPlanWarmup.completed,true);
    assert.equal(root.__omegaV2IndustryPlanWarmup.timedOut,true);
  } finally {
    if (previous.Game === undefined) delete globalThis.Game; else globalThis.Game = previous.Game;
    if (previous.catalog === undefined) delete globalThis.OmegaResourceIndustrialCatalogData; else globalThis.OmegaResourceIndustrialCatalogData = previous.catalog;
    if (previous.baseline === undefined) delete globalThis.OmegaCountryFactoryStartingBaselineV1; else globalThis.OmegaCountryFactoryStartingBaselineV1 = previous.baseline;
    if (previous.network === undefined) delete globalThis.OmegaResourceIndustrialNetwork; else globalThis.OmegaResourceIndustrialNetwork = previous.network;
    if (previous.omega === undefined) delete globalThis.Omega; else globalThis.Omega = previous.omega;
    globalThis.setTimeout = previous.setTimeout;
    globalThis.clearTimeout = previous.clearTimeout;
  }
});

test('Factory Stock/Input UI assets invalidate the old offline shell cache', () => {
  const sw = readFileSync('omega-offline-map-sw.js','utf8');
  const css = readFileSync('omega_ui_v2/factory-production-command.css','utf8');
  assert.ok(sw.includes('omega-offline-atlas-shell-v88'),
    'the offline shell must activate the new JS/CSS rather than retaining the old Stock/Input renderer');
  assert.ok(css.includes('flex:0 0 20px'),'compact recipe product SVGs must stay small on desktop cards');
  assert.ok(css.includes('flex-basis:18px'),'compact recipe product SVGs must stay small on mobile cards');
  for (const selector of ['.fp-product-identity','.fp-product-icon-frame','.fp-product-stock-quantity']) {
    assert.ok(css.includes(selector), selector + ' must be styled in the actual factory command stylesheet');
  }
});


test('factory production details use a landscape side panel and local delegated disclosure updates', () => {
  const source = readFileSync(new URL('../omega_ui_v2/screens/industry.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../omega_ui_v2/factory-production-command.css', import.meta.url), 'utf8');
  assert.match(source,/function factoryDetailPanelContentsMarkup/);
  assert.match(source,/function syncFactoryDetailPanel/);
  assert.match(source,/factoryDetailPanelMarkup\(model\)/);
  assert.match(source,/syncFactoryDetailPanel\(root, root\.__omegaV2IndustryModel \|\| model\)/);
  assert.match(css,/fp-factory-catalog-workspace/);
  assert.match(css,/fp-assets-workspace/);
  assert.match(css,/@media \(orientation:landscape\) and \(min-width:681px\)/);
  assert.match(css,/fp-factory-detail-panel/);
  assert.match(source,/Modeled per game day per factory:/,
    'the side panel must reuse the existing canonical per-factory daily input calculation');
});


test('Factory cards use horizontal internal layouts and only reserve the landscape detail panel when opened', () => {
  const source = readFileSync(new URL('../omega_ui_v2/screens/industry.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../omega_ui_v2/factory-production-command.css', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../omega-offline-map-sw.js', import.meta.url), 'utf8');
  assert.match(source,/fp-workspace--detail-open/);
  assert.match(source,/workspace\.classList\.toggle\('fp-workspace--detail-open', !!key\)/);
  assert.match(css,/@media \(orientation:landscape\)/);
  assert.match(css,/grid-template-areas:\s*"head head"\s*"count presence"/);
  assert.match(css,/grid-template-areas:\s*"badge title"\s*"art status"\s*"art count"/);
  assert.match(css,/fp-card-product-section--output/);
  assert.match(css,/fp-card-input-section/);
  assert.match(css,/fp-workspace--detail-open/);
  assert.match(css,/@media \(orientation:landscape\) and \(max-width:680px\)/);
  assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(245px,1fr\)\)/);
  assert.match(sw,/omega-offline-atlas-shell-v88/);
});


test('Factory landscape controls keep readable card text, independent detail scrolling and touch-sized disclosure', () => {
  const css = readFileSync(new URL('../omega_ui_v2/factory-production-command.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../omega_ui_v2/screens/industry.js', import.meta.url), 'utf8');
  assert.match(css,/@media \\(orientation:landscape\\)/);
  assert.match(css,/fp-type-card-name strong \\{\\s*font-size:13px/);
  assert.match(css,/fp-type-card-art \\{\\s*flex:0 0 48px/);
  assert.match(css,/fp-factory-detail-panel \\{[\\s\\S]*?overflow-y:auto/);
  assert.match(css,/touch-action:pan-y/);
  assert.match(css,/min-height:46px/);
  assert.match(css,/max-width:899px/);
  assert.match(source,/var currentFactoryView = root\\.__omegaV2IndustryFactoryView/);
  assert.match(source,/viewContent\\.innerHTML = factoryHomeViewMarkup/);
  assert.match(source,/__omegaV2FactoryRouteCache/);
  assert.match(source,/__omegaV2FactoryDetailMarkupCache/);
});
