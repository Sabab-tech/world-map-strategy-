import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const catalog=JSON.parse(read('resource_site_canonical_catalog_v1.json'));
const master=JSON.parse(read('resource_site_master_registry_v1.json'));
const reserves=JSON.parse(read('resource_site_reserve_simulation_v1.json'));
const index=read('index.html');
const binding=read('omega_resource_gameplay_binding_v1.js');
const scenarioSource=read('omega_resource_scenario_engineering_data_v1.js');
const scenarioText=scenarioSource.slice(scenarioSource.indexOf('const DATA=')+'const DATA='.length,scenarioSource.indexOf(';\ng.OmegaResourceScenarioEngineeringData=DATA;'));
const scenario=JSON.parse(scenarioText);

assert.equal(catalog.sites.length,199,'canonical catalog must contain 199 individual sites');
assert.equal(master.siteCount,199,'master registry count');
assert.equal(master.sites.length,199,'master registry rows');
assert.equal(reserves.records.length,199,'reserve simulation rows');
assert.equal(scenario.records.length,199,'scenario engineering rows');
const ids=master.sites.map(x=>x.siteId);
assert.equal(new Set(ids).size,199,'site IDs must be unique');
const catalogIds=new Set(catalog.sites.map(x=>x.siteId));
assert.ok(ids.every(x=>catalogIds.has(x)),'master registry IDs must map to canonical catalog');
const reserveIds=new Set(reserves.records.map(x=>x.siteId));
const scenarioIds=new Set(scenario.records.map(x=>x.siteId));
for(const site of master.sites){
 assert.ok(site.siteId, 'master site must have siteId');
 assert.ok(site.countryId, site.siteId+' country identity');
 assert.ok(catalogIds.has(site.siteId),site.siteId+' maps to canonical catalog');
}
assert.ok(master.sites.every(s=>catalogIds.has(s.siteId)),'master rows must map to individual canonical sites');
assert.match(index,/omega_resource_gameplay_binding_v1\.js/,'playable shell must load site binding');
assert.match(binding,/OMEGA_RESOURCE_SITE_SELECTED/,'site selection event must be emitted');
assert.match(binding,/planExtraction/,'site selection UI must call industrial extraction planner');
assert.match(binding,/extractCountry/,'site UI must connect to actual extraction executor');
assert.match(binding,/No country-average substitution/,'UI must explicitly prevent average mapping');

const runtimeContext={
 console:{log(){},warn(){},error(){}},
 Game:{state:{simulation:{turn:1,startYear:2015,date:'2015-01-01',daysPerTurn:30},resource:{},economy:{},transport:{}}},
 OmegaResourceSiteMasterResearchData:master,
 OmegaResourceSiteReserveSimulationData:reserves,
 OmegaResourceIndustrialCatalogData:JSON.parse(read('resource_industrial_catalog_v1.json')),
 OmegaMinistryInteroperability:{registerAction(){},registerCommandHandler(){},dispatchCommand(){return {status:'COMMITTED',records:[]}},emitEvent(){return true}},
 Omega:{}
};
vm.createContext(runtimeContext);
for(const file of ['omega_resource_realism_runtime_v1.js','omega_resource_system_hardening_v1.js','omega_resource_industrial_network_v1.js']){
 vm.runInContext(read(file),runtimeContext,{filename:file,timeout:3000});
}
vm.runInContext(scenarioSource,runtimeContext,{filename:'omega_resource_scenario_engineering_data_v1.js',timeout:3000});
const liveApi=runtimeContext.Omega.ResourceIndustrialNetwork;
const selected=master.sites.find(s=>s.siteId==='SITE_BGD_barapukuria_coal_mine');
assert.ok(selected,'actual Barapukuria site must exist in the checked-in master registry');
const plan=liveApi.planExtraction({countryId:selected.countryId,siteId:selected.siteId,resourceId:selected.real?.resourceId||selected.sourceSiteRecord?.resourceId});
assert.equal(plan.status,'PLANNED','actual game registry site must resolve through the industrial runtime');
assert.equal(plan.siteId,'SITE_BGD_barapukuria_coal_mine','runtime must retain exact individual site ID');
assert.equal(plan.countryId,'BGD','runtime must retain the site country');
assert.equal(plan.method,'UNDERGROUND_LONGWALL','site-specific extraction method must normalize to the engineering catalog key');

console.log('OMEGA INDIVIDUAL RESOURCE GAMEPLAY BINDING TEST PASSED');
console.log('Canonical/master/reserve/scenario site identities: 199/199');
console.log('Unique site IDs and exact per-site catalog joins: PASS');
console.log('Playable index wiring + individual selection + extraction API binding: PASS');
console.log('Actual master-registry -> realism/hardening -> industrial runtime extraction plan: PASS');

test('individual site map markers use resource-specific catalog glyphs and accessible exact-site tooltips', () => {
  const binding = read('omega_resource_gameplay_binding_v1.js');
  const css = read('omega_ui_visual_system_v1.css');
  assert.match(binding, /L\.marker\(\[lat,?\s*lng\],\{icon,title:/);
  assert.match(binding, /resourceCatalog\.find/);
  assert.match(binding, /siteName\|\|s\.siteId/);
  assert.match(binding, /siteCount:sites\.length/);
  assert.match(binding, /discoverSourceSites/,'raw resource JSONs must be scanned for individual site records');
  assert.match(binding, /resources\.json/,'primary resource JSON must feed the global site map');
  assert.match(binding, /resources_2\.json/,'secondary resource JSON must feed the global site map');
  assert.match(binding, /SITE_COLLECTION_KEY/,'site discovery must identify mine, oil, gas, quarry and resource-site collections');
  assert.match(binding, /scheduleMarkerRender/,'site markers must retry when the map layer initializes late');
  assert.doesNotMatch(binding, /catalog\.sites\.length!==199\|\|!Array\.isArray\(master\.sites\)\|\|master\.sites\.length!==199/,
    'global map must not hard-stop at the old 199-site catalog size');
  assert.match(css, /\.omega-individual-site-marker span/);
  assert.match(css, /var\(--site-color/);
});


test('global map source data preserves every coordinate-backed mine site and runtime deposit', () => {
  const sources = ['resources.json', 'resources_2.json'].map(file => JSON.parse(read(file)));
  const mineSites = sources.flatMap(data =>
    Object.values(data.GSRSK_Master_CountryProfiles_v14?.countryProfiles || {})
      .flatMap(profile => profile.resource_infrastructure_context?.mineSites || [])
  );
  const deposits = sources.flatMap(data => data.runtime_deposits || []);
  const ids = mineSites.map(site => site.siteId || site.id);
  const depositIds = deposits.map(site => site.siteId || site.id);
  assert.equal(mineSites.length, 199, 'both raw resource JSON files contain 199 distinct mine/site records');
  assert.equal(new Set(ids).size, 199, 'mine/site source IDs must be unique across both files');
  assert.equal(deposits.length, 43, 'both raw resource JSON files contain 43 individually identified runtime deposits');
  assert.equal(new Set(depositIds).size, 43, 'runtime deposit IDs must be unique');
  const validCoordinates = site => {
    const lat = Number(site.lat ?? site.coordinates?.lat ?? site.location?.coordinates?.lat);
    const lng = Number(site.lng ?? site.lon ?? site.coordinates?.lng ?? site.location?.coordinates?.lng);
    return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
      Number.isFinite(lng) && lng >= -180 && lng <= 180;
  };
  assert.ok(mineSites.every(validCoordinates), 'every source mine/site must have usable coordinates');
  assert.ok(deposits.every(validCoordinates), 'every runtime deposit must have usable coordinates');
  assert.match(read('omega_resource_gameplay_binding_v1.js'), /raw\.resId/,
    'runtime deposits using the source schema resId field must resolve their commodity');
  assert.match(read('omega_resource_gameplay_binding_v1.js'), /sourceDepositRecords/,
    'an explicit deposit record at an already mapped physical site must be joined instead of stacked as a duplicate marker');
  const countryCounts = [...mineSites, ...deposits].reduce((counts, site) => {
    const country = site.countryId || site.countryCode || site.country;
    counts[country] = (counts[country] || 0) + 1;
    return counts;
  }, {});
  assert.ok(countryCounts.BGD >= 4, 'Bangladesh mine and multiple oil/gas/coal deposit records must remain individually discoverable');
  assert.ok(countryCounts.CHN > 1 && countryCounts.CHL > 1 && countryCounts.USA > 1,
    'global source discovery must include multiple distinct records outside Bangladesh');
  const physicalKeys = new Set([...mineSites, ...deposits].map(site => {
    const country = site.countryId || site.countryCode || site.country;
    const resource = String(site.resourceId || site.resourceTypeId || site.resourceTypeKey || site.resId || '').toLowerCase();
    const lat = Number(site.lat ?? site.coordinates?.lat ?? site.location?.coordinates?.lat).toFixed(4);
    const lng = Number(site.lng ?? site.lon ?? site.coordinates?.lng ?? site.location?.coordinates?.lng).toFixed(4);
    return [country, resource, lat, lng].join('|');
  }));
  assert.equal(physicalKeys.size, 239,
    '199 mine-site records plus 43 deposit records resolve to 239 distinct country/resource/coordinate locations after 3 exact duplicate joins');
  const binding = read('omega_resource_gameplay_binding_v1.js');
  assert.match(binding, /scope!=='WORLD'/, 'nation scope must not display sites from every country');
  assert.match(binding, /activeCountryResolved/, 'country filter must resolve display names and internal country keys to a canonical country identity');
  assert.match(binding, /activeCountrySiteIds/, 'country filter must derive canonical IDs from site registry country aliases');
  assert.match(binding, /sourceSiteRecord\?\.countryName/, 'country filtering must consider source country names as well as codes');
  assert.match(binding, /resourceState\.selectedResources/, 'individual markers must follow the resource filter');
  assert.match(binding, /toggleResourceChip/, 'resource filter changes must refresh individual markers');
});


test('runtime renders all global sites and applies nation/resource scope without country averages', async () => {
  const rawSources = {
    'resources.json': JSON.parse(read('resources.json')),
    'resources_2.json': JSON.parse(read('resources_2.json')),
    'resource_site_canonical_catalog_v1.json': catalog,
    'resource_site_master_registry_v1.json': master,
    'world.json': JSON.parse(read('world.json'))
  };
  // Test-only fixture: force two separate site identities to share one coordinate so pixel-spider offsets are verified.
  const rawCountryProfiles=Object.values(rawSources['resources.json'].GSRSK_Master_CountryProfiles_v14.countryProfiles||{});
  const rawMineSites=rawCountryProfiles.flatMap(profile=>profile.resource_infrastructure_context?.mineSites||[]);
  const overlapBase=rawMineSites.find(site=>(site.siteId||site.id)==='SITE_BGD_barapukuria_coal_mine')||rawMineSites[0];
  assert.ok(overlapBase,'test fixture needs one real source mine site');
  const overlapProfile=rawCountryProfiles.find(profile=>(profile.resource_infrastructure_context?.mineSites||[]).includes(overlapBase));
  overlapProfile.resource_infrastructure_context.mineSites.push(
    {...overlapBase,id:'SITE_TEST_PIXEL_OVERLAP',siteId:'SITE_TEST_PIXEL_OVERLAP',name:'Test-only overlap fixture',siteName:'Test-only overlap fixture'},
    {...overlapBase,id:'SITE_TEST_NEAR_PIXEL_OVERLAP',siteId:'SITE_TEST_NEAR_PIXEL_OVERLAP',name:'Test-only near overlap fixture',siteName:'Test-only near overlap fixture',lat:Number(overlapBase.lat)+0.01,lng:Number(overlapBase.lng)+0.01}
  );
  const events = new Map();
  const nodes = new Map();
  const makeNode = () => ({
    style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){} },
    addEventListener(){}, appendChild(){}, setAttribute(){}, replaceChildren(){},
    querySelector(selector){ return nodeFor(selector); }, value:'', innerHTML:'', textContent:''
  });
  const nodeFor = selector => {
    if (!nodes.has(selector)) nodes.set(selector, makeNode());
    return nodes.get(selector);
  };
  const layers = new Set();
  const map = {
    hasLayer(layer){ return layers.has(layer); },
    removeLayer(layer){ layers.delete(layer); },
    setView(){}, getZoom(){ return 4; },
    latLngToLayerPoint([lat,lng]){ return {x:Number(lng)*10,y:Number(lat)*10}; },
    on(name,callback){ if(!events.has('map:'+name))events.set('map:'+name,callback); return this; },
    whenReady(callback){ callback(); }
  };
  const resourceCatalog = [
    {id:'coal',icon:'CO',color:'#8b98a8'},
    {id:'crude_oil',icon:'OIL',color:'#c9a96e'},
    {id:'natural_gas',icon:'NG',color:'#76b7d8'},
    {id:'gold',icon:'Au',color:'#d0b46a'},
    {id:'nickel',icon:'Ni',color:'#8ab4a5'},
    {id:'copper',icon:'Cu',color:'#c68c68'},
    {id:'phosphate',icon:'P',color:'#b6b87a'}
  ];
  const context = {
    console:{log(){},warn(){},error(){}},
    document:{
      body:{appendChild(){}},
      getElementById(){ return null; },
      createElement(){ return makeNode(); }
    },
    Game:{currentActiveCountry:'',Map:{map,resourceCatalog,resourceDepositsLayer:{clearCount:0,clearLayers(){this.clearCount++;}},resourceState:{enabled:true,scope:'WORLD',selectedResources:new Set(['all'])}}},
    CountryIOS:{activeCountry:''},
    L:{
      layerGroup(){ return {markers:[],addTo(){layers.add(this);return this;}}; },
      divIcon(options){ return options; },
      marker(latlng,options){ return {latlng,options,bindTooltip(){return this;},on(){return this;},addTo(layer){layer.markers.push(this);return this;}}; }
    },
    fetch:async url=>({ok:true,json:async()=>rawSources[url]}),
    setTimeout(callback){ queueMicrotask(callback); return 1; },
    addEventListener(name,callback){ events.set(name,callback); },
    dispatchEvent(){},
    CustomEvent:class { constructor(name,options){this.type=name;this.detail=options?.detail;} },
    Omega:{}
  };
  context.window = context;
  vm.createContext(context);
  context.Game.Map.resourceState.selectedResources = vm.runInContext("new Set(['all'])",context);
  vm.runInContext(binding,context,{filename:'omega_resource_gameplay_binding_v1.js',timeout:3000});
  events.get('OMEGA_READY')();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  const diagnostics = context.Omega.IndividualResourceSiteBinding?.diagnostics();
  assert.equal(diagnostics?.status,'READY','global source registry must initialize');
  assert.equal(diagnostics?.siteCount,241,'239 distinct physical locations plus coincident and near-overlap test identities must yield 241 site markers');
  const markerCount = () => [...layers].reduce((sum,layer)=>sum+layer.markers.length,0);
  const quarantinedCount=context.__OMEGA_RESOURCE_COORDINATE_AUDIT__?.quarantined?.length||0;
  assert.equal(markerCount(),241-quarantinedCount,'WORLD scope must render all valid source locations plus two test-only overlap fixtures, while quarantining known cross-country coordinates');
  const geographicPositions=new Set([...layers].flatMap(layer=>layer.markers).map(marker=>marker.latlng.map(value=>Number(value).toFixed(3)).join('|')));
  assert.ok(geographicPositions.size>100,'world markers must preserve widespread source coordinates instead of collapsing all resources to one point');
  assert.ok(context.Game.Map.resourceDepositsLayer.clearCount>0,'legacy deposit layer must be cleared so old and individual markers do not stack');
  const activeMarkers=[...layers].flatMap(layer=>layer.markers);
  const overlapping=activeMarkers.filter(marker=>Math.abs(marker.latlng[0]-Number(overlapBase.lat??overlapBase.coordinates?.lat??overlapBase.location?.coordinates?.lat))<1e-7&&Math.abs(marker.latlng[1]-Number(overlapBase.lng??overlapBase.lon??overlapBase.coordinates?.lng??overlapBase.location?.coordinates?.lng))<1e-7);
  assert.ok(overlapping.length>=2,'test fixture must produce separate site markers at the same geographic coordinate');
  assert.ok(new Set(overlapping.map(marker=>JSON.stringify(marker.options.icon.iconAnchor))).size>=2,'coincident sites must get distinct screen-space icon anchors without changing their true lat/lng');
  const nearBaseLat=Number(overlapBase.lat??overlapBase.coordinates?.lat??overlapBase.location?.coordinates?.lat);
  const nearBaseLng=Number(overlapBase.lng??overlapBase.lon??overlapBase.coordinates?.lng??overlapBase.location?.coordinates?.lng);
  const nearMarkers=activeMarkers.filter(marker=>Math.abs(marker.latlng[0]-nearBaseLat)<0.02&&Math.abs(marker.latlng[1]-nearBaseLng)<0.02);
  assert.ok(nearMarkers.length>=3,'nearby but non-identical source coordinates must also be separated on screen');
  assert.ok(new Set(nearMarkers.map(marker=>JSON.stringify(marker.options.icon.iconAnchor))).size>=2,'nearby sites must not collapse to one visible marker anchor');
  assert.match(binding,/transportRoute/,'site detail UI must expose the per-site transport route profile');
  assert.match(binding,/Individual transport route & delivery/,'site detail UI must display logistics and delivery details');
  assert.match(binding,/panel.style.display='block'/,'clicking a site must open its detail panel');
  context.Game.Map.resourceState.scope='NATION';
  context.Game.currentActiveCountry='BGD';
  context.Omega.IndividualResourceSiteBinding.refresh();
  assert.equal(markerCount(),6,'Bangladesh scope must show its four source locations plus two test-only overlap fixtures, not all countries');
  context.Game.Map.resourceState.selectedResources=vm.runInContext("new Set(['coal'])",context);
  context.Omega.IndividualResourceSiteBinding.refresh();
  assert.equal(markerCount(),3,'Bangladesh coal filter must show the source coal site and its two test-only matching overlap identities');
  context.Game.Map.resourceState.selectedResources=vm.runInContext('new Set()',context);
  context.Omega.IndividualResourceSiteBinding.refresh();
  assert.equal(markerCount(),6,'clearing the resource filter must restore every site in the selected country');
  context.Game.Map.resourceState.scope='WORLD';
  context.Game.Map.resourceState.selectedResources=vm.runInContext("new Set(['coal'])",context);
  context.Omega.IndividualResourceSiteBinding.refresh();
  assert.ok(markerCount()>0 && markerCount()<241,'resource filter must narrow the global site markers');
  context.Game.Map.resourceState.selectedResources=vm.runInContext("new Set(['natural-gas'])",context);
  context.Omega.IndividualResourceSiteBinding.refresh();
  assert.ok(markerCount()>0 && markerCount()<241,'hyphenated commodity filters must match canonical underscore resource IDs across the world');

  // Regression fixture: Saudi Arabia has one source mine site plus two separate oilfield records.
  context.Game.Map.resourceState.scope='NATION';
  context.Game.currentActiveCountry='Saudi Arabia';
  context.Game.Map.resourceState.selectedResources=vm.runInContext("new Set(['all'])",context);
  context.Omega.IndividualResourceSiteBinding.refresh();
  assert.equal(markerCount(),3,'Saudi Arabia must show the gold mine and both individually identified oilfields');
  context.Game.Map.resourceState.selectedResources=vm.runInContext("new Set(['crude_oil'])",context);
  context.Omega.IndividualResourceSiteBinding.refresh();
  assert.equal(markerCount(),2,'Saudi Arabia crude-oil filter must show both Ghawar and Safaniya, not one country aggregate');
  context.Game.Map.resourceState.selectedResources=vm.runInContext("new Set(['all'])",context);
  const diagnosticsAfterLoad=context.Omega.IndividualResourceSiteBinding.diagnostics();
  assert.equal(diagnosticsAfterLoad.sourceRecordCounts.mineSites,201,'the 199 source mine/site records plus two test-only overlap fixtures must be counted');
  assert.equal(diagnosticsAfterLoad.sourceRecordCounts.runtimeDeposits,43,'diagnostics must count all raw runtime deposit records');
  assert.ok(Object.values(diagnosticsAfterLoad.coordinateStatusCounts).reduce((a,b)=>a+b,0)===diagnosticsAfterLoad.siteCount,
    'coordinate confidence reporting must cover every mapped site');
  const loadedSaudiSites=context.Omega.IndividualResourceSiteBinding.sites.filter(site=>site.countryId==='SAU');
  assert.equal(loadedSaudiSites.length,3,'Saudi Arabia must retain all three distinct existing source records');
  assert.ok(loadedSaudiSites.every(site=>site.location.coordinateStatus),
    'every mapped site must expose a coordinate confidence/status label in its location object');
  assert.ok(loadedSaudiSites.some(site=>site.location.coordinateStatus==='ESTIMATED_SITE_POINT'),
    'estimated coordinates must remain explicitly labeled rather than being advertised as exact');
  assert.ok(loadedSaudiSites.some(site=>site.location.coordinateStatus==='SOURCE_STATUS_UNSPECIFIED'),
    'coordinates without source confidence metadata must remain explicitly unverified');
});


test('resource map defaults to all catalog resources and dynamically separates nearby markers', () => {
  const mapEngine = read('map-engine-2.js');
  const binding = read('omega_resource_gameplay_binding_v1.js');
  assert.match(mapEngine, /__omegaDefaultSelection:\s*true/,'initial resource filter must be identified as the default all-resource selection');
  assert.match(mapEngine, /selectedResources:\s*new Set\(\['crude_oil','natural_gas','coal','iron_ore','copper','gold','uranium','lithium','cobalt','rare_earth','bauxite','nickel','manganese','titanium','zinc','tin','potash','silver','diamond','semiconductor'\]\)/,
    'default filter must include every resource in the built-in map catalog, not a hard-coded subset');
  assert.match(binding, /map\.latLngToLayerPoint\(\[lat,lng\]\)/,'marker overlap must be calculated in screen-space at the current zoom');
  assert.match(binding, /Math\.hypot\(item\.point\.x-point\.x,item\.point\.y-point\.y\)<30/,'nearby non-identical coordinates must be collision-grouped');
  assert.match(binding, /map\.on\('zoomend',addMapMarkers\);map\.on\('moveend',addMapMarkers\)/,'marker layout must refresh after map zoom and movement');
  assert.match(binding, /resourceState\?\.__omegaDefaultSelection/,'existing resource types found in source records must join the initial default selection');
});



test('legacy and individual resource map modes share one activation state', () => {
  const mapEngine = read('map-engine-2.js');
  const context = {
    document: { getElementById(){ return null; } },
    Game: {
      currentActiveCountry: 'SAU',
      Map: {
        isResourceModeActive: false,
        resourceState: { enabled: false, selectedResources: new Set(['crude_oil']) },
        selectedResourceChips: new Set(),
        hideResourceFilterMenu(){},
        renderResourceDeposits(){},
        renderGlobalCapitalHubs(){},
        renderCountryHubs(){}
      }
    }
  };
  vm.createContext(context);
  for (const method of [
    'Game.Map.clearAndResetResourceMode = function()',
    'Game.Map.applyResourceFilterAndClose = function()',
    'Game.Map.toggleResourceMode = function()'
  ]) {
    const start = mapEngine.indexOf(method);
    assert.notEqual(start, -1, method + ' must exist');
    const end = mapEngine.indexOf('\n};', start);
    assert.notEqual(end, -1, method + ' must terminate');
    vm.runInContext(mapEngine.slice(start, end + 3), context, { timeout: 1000 });
  }

  context.Game.Map.toggleResourceMode();
  assert.equal(context.Game.Map.isResourceModeActive, true);
  assert.equal(context.Game.Map.resourceState.enabled, true,
    'the legacy resource mode must enable individual site markers');
  context.Game.Map.toggleResourceMode();
  assert.equal(context.Game.Map.isResourceModeActive, false);
  assert.equal(context.Game.Map.resourceState.enabled, false,
    'turning the resource mode off must remove individual site markers');
  context.Game.Map.applyResourceFilterAndClose();
  assert.equal(context.Game.Map.isResourceModeActive, true,
    'applying the resource filter must activate both map layers');
  assert.equal(context.Game.Map.resourceState.enabled, true);
  context.Game.Map.clearAndResetResourceMode();
  assert.equal(context.Game.Map.isResourceModeActive, false,
    'reset must clear both mode flags');
  assert.equal(context.Game.Map.resourceState.enabled, false);
});


test('legacy resource filter selection synchronizes individual site scope and commodity filters', () => {
  const mapEngine = read('map-engine-2.js');
  const calls = [];
  const context = {
    document: { getElementById(){ return null; } },
    window: { CountryIOS: null },
    Game: {
      currentActiveCountry: 'Saudi Arabia',
      Map: {
        isResourceModeActive: false,
        resourceState: { enabled: false, scope: 'WORLD', selectedResources: new Set(['gold', 'coal']) },
        resourceCatalog: [{id:'crude_oil'},{id:'natural_gas'},{id:'iron_ore'},{id:'copper'}],
        resourceDepositsLayer: { clearLayers(){} },
        renderResourceDeposits(value){ calls.push(value); },
        renderCountryHubs(){}
      }
    }
  };
  vm.createContext(context);
  const method = 'Game.Map.applyResourceMapFilter = function(resourceType)';
  const start = mapEngine.indexOf(method);
  assert.notEqual(start, -1, method + ' must exist');
  const end = mapEngine.indexOf('\n};', start);
  assert.notEqual(end, -1, 'applyResourceMapFilter must terminate');
  vm.runInContext(mapEngine.slice(start, end + 3), context, { timeout: 1000 });

  context.Game.Map.applyResourceMapFilter('crude-oil');
  assert.equal(context.Game.Map.resourceState.enabled, true,
    'choosing a resource filter must activate individual site markers');
  assert.equal(context.Game.Map.isResourceModeActive, true,
    'legacy and individual resource mode flags must stay synchronized');
  assert.equal(context.Game.Map.resourceState.scope, 'NATION',
    'an active country must restrict individual markers to that country');
  assert.deepEqual(Array.from(context.Game.Map.resourceState.selectedResources), ['crude_oil'],
    'the selected commodity must be applied to the individual marker layer');
  assert.equal(calls.length, 1);

  context.Game.currentActiveCountry = '';
  context.Game.Map.applyResourceMapFilter(['iron-ore', 'copper']);
  assert.equal(context.Game.Map.resourceState.scope, 'WORLD',
    'without a selected country, resource filters must apply to the world scope');
  assert.deepEqual(Array.from(context.Game.Map.resourceState.selectedResources), ['iron_ore', 'copper'],
    'multi-resource selection must normalize IDs and apply all selected commodities');

  context.Game.Map.applyResourceMapFilter('NONE');
  assert.equal(context.Game.Map.resourceState.enabled, false,
    'NONE must hide individual site markers as well as legacy deposits');
  assert.equal(context.Game.Map.isResourceModeActive, false);
});

test('coordinate confidence is reported without claiming every stored point is exact', () => {
  const binding = read('omega_resource_gameplay_binding_v1.js');
  assert.match(binding, /coordinateStatusCounts/);
  assert.match(binding, /SOURCE_STATUS_UNSPECIFIED/);
  assert.doesNotMatch(binding, /exact coordinates/i,
    'estimated or unverified points must not be advertised as exact');
});
