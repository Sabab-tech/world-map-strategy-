import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ui = fs.readFileSync('omega_resource_command_center_ui_v1.js', 'utf8');
const ministry = fs.readFileSync('ministry_engine.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const market = fs.readFileSync('omega_global_market_system.js', 'utf8');
const logistics = fs.readFileSync('omega_resource_logistics_runtime_v1.js', 'utf8');
const policyRuntime = fs.readFileSync('omega_resource_strategic_policy_runtime_v1.js', 'utf8');
const panelIds = ['matrix','ontology','reserves','deposits','extraction','processing','inventory','logistics','industrial','market','trade','value','cascade','cognitive','power','environment'];

test('all sixteen resource panels are registered, selectable and safe to render', () => {
  for (const id of panelIds) {
    assert.match(ui, new RegExp("id: '" + id + "'"));
    assert.match(ui, new RegExp("case '" + id + "'"));
  }
  assert.match(ui, /data-search-item/);
  assert.match(ui, /omega-rescc-search/);
  assert.match(ui, /omega-rescc-country/);

  const nodes = new Map();
  class FakeElement {
    constructor() { this.id=''; this.style={}; this.dataset={}; this.innerHTML=''; this.listeners={}; this.value=''; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    appendChild(child) { if (child.id) nodes.set(child.id, child); }
    querySelectorAll() { return []; }
    setAttribute() {}
    getBoundingClientRect() { return { width: 900, height: 240 }; }
    getContext() { return { clearRect(){}, fillText(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, fill(){}, arc(){}, closePath(){} }; }
  }
  const body = new FakeElement();
  const document = {
    body,
    createElement() { return new FakeElement(); },
    getElementById(id) { return nodes.get(id) || null; }
  };
  const state = {
    simulation:{turn:1},
    playerCountryId:'BGD',
    resource:{BGD:{inventory:{},reserves:{},production:{},batches:[],inventoryLots:{},mineProductionLedger:[],warehouse:{availableByResource:{},reservedByResource:{}},processedWarehouse:{availableByResource:{}},strategicReserve:{availableByResource:{}},reserveBufferRequests:[],surveyRequests:[],surveyResults:[],capacityUpgradeRequests:[],logistics:{shipments:[]},industrialNetwork:{shipments:[],siteExecutions:[]}}},
    economy:{BGD:{projects:[],productionAssets:[]}},
    finance:{BGD:{available:1000,currencyCode:'USD',reserves:500}},
    trade:{BGD:{importRequests:[],globalTradeLedger:{requests:[],decisions:[],settlements:[]}}}
  };
  const resourceSummary={briefing:'',globalMetrics:{},resourcesList:[
    {id:'coal',name:'Coal',unit:'TONNES',dailyProduction:10,dailyConsumption:3,netBalance:7,inventory:20,reserve:100,stockDays:3}
  ]};
  const sandbox = {
    document,
    Game:{state,countryLookup:{BGD:{name:'Bangladesh'}},Map:{
      resourceState:{enabled:false,scope:'NATION',selectedResources:new Set()},
      applyResourceMapFilter(ids){this.filteredResourceIds=ids;this.resourceState.enabled=true;},
      renderResourceDeposits(){this.renderCount=(this.renderCount||0)+1;},
      map:{setView(coords,zoom){this.lastView={coords,zoom};},getZoom(){return 4;}}
    }},
    ResourceMinistryEngine:{
      resourceTypes:[
        {id:'coal',name:'Coal',unit:'TONNES'},
        {id:'rare_earth',name:'Rare earth elements',unit:'UNKNOWN_UNIT'}
      ],
      deposits:[
        {siteId:'SITE_BGD_BARAPUKURIA',siteName:'Barapukuria Coal Mine',countryId:'BGD',resourceId:'coal',lat:24.8,lng:88.9,reserve:{quantity:100,unit:'TONNES'}}
      ],
      getSummary(){ return resourceSummary; },
      getAuthoritativeResourceSummary(){ return resourceSummary; },
      getCountryResourceProfile(){ return {identity:{name:'Bangladesh',officialName:'Bangladesh'}}; },
      getDepositsForCountry(){ return []; },
      getIntegratedResourceState(){ return state.resource.BGD; },
      normalizeCountryCode(x){ return String(x||'BGD').toUpperCase(); }
    },
    OmegaCabinetUI:{getResource16CardsHtml(){return '<div class="test-cards"></div>';}},
    Omega:{
      ResourceIndustrialNetwork:{diagnostics(){return {};},gameplayPipelineDiagnostics(){return {};}},
      ResourceLogisticsRuntime:{diagnostics(){return {};}},
      GlobalMarket:{quote(){return {status:'UNAVAILABLE'};},rebuild(){return {};},diagnostics(){return {};}},
      GlobalTrade:{diagnostics(){return {};}}
    },
    OmegaGlobalMarket:{quote(){return {status:'UNAVAILABLE'};},rebuild(){return {};},diagnostics(){return {};}},
    OmegaGlobalTrade:{diagnostics(){return {};}},
    OmegaResourceSystemHardening:{logisticsConstraints(){return {}},diagnostics(){return {}}},
    OmegaResourceAuthoritativeAdapter:{install(){}},
    setInterval(){return 1;},clearInterval(){},console,Date,Math,JSON,Object,Array,String,Number,RegExp,Map,Set,WeakMap
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  vm.runInNewContext(ui,sandbox,{filename:'omega_resource_command_center_ui_v1.js'});

  const api=sandbox.OmegaResourceCommandCenterUI;
  assert.ok(api,'resource command-center UI API must install');
  for (const panel of panelIds) {
    assert.doesNotThrow(()=>api.open('BGD',panel), 'panel must render: '+panel);
    assert.equal(api.getState().panel,panel,'the requested panel route must remain selected');
    assert.match(document.getElementById('gsrsk-intelligence-modal').innerHTML,/Resource Command Center/);
  }
  const clickRoutes = [
    ['p01','matrix'],['p02','ontology'],['p03','reserves'],['p04','deposits'],
    ['p05','extraction'],['p06','processing'],['p07','inventory'],['p08','logistics'],
    ['p09','industrial'],['p10','market'],['p11','trade'],['p12','value'],
    ['p13','cascade'],['p14','cognitive'],['p15','power'],['p16','environment']
  ];
  for (const [point,panel] of clickRoutes) {
    const outcome=sandbox.OmegaCabinetUI.executeResource16Point(point,'legacy-directive-must-not-run');
    assert.equal(outcome.status,'OPENED_PANEL','card '+point+' must open a panel');
    assert.equal(outcome.panel,panel,'card '+point+' must open its corresponding panel');
    assert.equal(api.getState().panel,panel,'selected panel must match card '+point);
  }
  assert.match(document.getElementById('gsrsk-intelligence-modal').innerHTML,/Resource Command Center/);

  api.open('BGD','matrix');
  const matrixHtml=document.getElementById('gsrsk-intelligence-modal').innerHTML;
  assert.match(matrixHtml,/id="omega-rescc-resource-select"/,'the workspace uses one catalog-backed resource selector');
  assert.match(matrixHtml,/id="omega-rescc-search-country"/,'the locator can search a selected country or the whole world');
  assert.match(matrixHtml,/Locate resource \/ deposit on map/,'the selected resource can trigger a real map-locator action');
  assert.match(matrixHtml,/id="omega-rescc-location-select"/,'site location is an inline dropdown, not a separate button');
  assert.match(matrixHtml,/class="omega-rescc-table"/,'resource balances render as a compact table rather than repeated cards');
  assert.match(matrixHtml,/Barapukuria Coal Mine/,'location options come from canonical deposit records');
  assert.match(matrixHtml,/name="fromUnit" required>[\s\S]*?value="metric_tonne" selected/,'TONNES resolves to a preselected metric-tonne unit');
  assert.equal(api.getResourceUnit('coal','BGD'),'metric_tonne','resource unit is resolved from catalog metadata');
  assert.equal(api.getResourceUnit('rare_earth','BGD'),null,'unknown catalog units are not guessed');
  assert.equal(api.convertUnits(1,'megatonne','metric_tonne').value,1000000,'megatonne conversion is available');
  assert.equal(api.convertUnits(1,'megatonne','kg').value,1000000000,'megatonne conversion preserves mass dimensions');

  api.open('BGD','ontology');
  const ontologyHtml=document.getElementById('gsrsk-intelligence-modal').innerHTML;
  assert.match(ontologyHtml,/Global resource types/,'the catalog panel reports the worldwide commodity count');
  assert.match(ontologyHtml,/Rare earth elements/,'the catalog panel lists resources outside the selected country's summary');
  assert.match(ontologyHtml,/Registered deposits \/ sites/,'the catalog panel reports the global deposit registry size');

  api.open('BGD','market');
  const marketHtml=document.getElementById('gsrsk-intelligence-modal').innerHTML;
  assert.match(marketHtml,/GLOBAL COMMODITY MARKET/,'market panel identifies itself as the global market');
  assert.match(marketHtml,/Global resources tracked/,'market panel has a global market summary');
  assert.match(marketHtml,/Rare earth elements/,'market panel quotes resources from the global catalog, not only local country inventory');
  assert.match(marketHtml,/Worldwide Deposits/,'the global deposit registry is reachable from the command-center header');

  api.open('BGD','deposits');
  const modal=document.getElementById('gsrsk-intelligence-modal');
  assert.match(modal.innerHTML,/id="omega-rescc-deposit-scope"/,'deposit panel offers country/global scope selection');
  const changeHandler=(modal.listeners.change||[])[0];
  assert.equal(typeof changeHandler,'function','the command center installs a change handler');
  changeHandler({target:{id:'omega-rescc-deposit-scope',value:'WORLD'}});
  assert.match(modal.innerHTML,/value="WORLD" selected/,'worldwide deposit scope can be selected in the running panel');
  assert.match(modal.innerHTML,/Worldwide · all countries/,'global selection has explicit user-facing scope');
  assert.match(modal.innerHTML,/Resource deposits worldwide/,'the worldwide view uses the global deposit table');

  const located=api.locateResource('WORLD','coal','SITE_BGD_BARAPUKURIA');
  assert.equal(located.status,'APPLIED','locating a registered site produces an actual map-focus result');
  assert.equal(located.result.matchedSiteCount,1,'the locator reports matching global site records');
  assert.equal(JSON.stringify(sandbox.Game.Map.map.lastView.coords),JSON.stringify([24.8,88.9]),'the map centers on the selected site's recorded coordinates');
  assert.equal(sandbox.Game.Map.resourceState.scope,'WORLD','the resource filter is switched to worldwide scope');
  assert.deepEqual(Array.from(sandbox.Game.Map.filteredResourceIds),['coal'],'the map is filtered to the selected resource');
  assert.equal(api.locateResource('WORLD','unregistered_mineral','').status,'UNAVAILABLE','missing global deposits are reported honestly');
});

test('legacy card names disclose feature gaps instead of claiming unsupported actions', () => {
  assert.match(ui,/p01: 'matrix'/);
  assert.match(ui,/p02: 'ontology'/);
  assert.match(ui,/p03: 'reserves'/);
  assert.match(ui,/p04: 'deposits'/);
  assert.match(ui,/p05: 'extraction'/);
  assert.match(ui,/p06: 'processing'/);
  assert.match(ui,/p07: 'inventory'/);
  assert.match(ui,/p08: 'logistics'/);
  assert.match(ui,/p09: 'industrial'/);
  assert.match(ui,/p10: 'market'/);
  assert.match(ui,/p11: 'trade'/);
  assert.match(ui,/p12: 'value'/);
  assert.match(ui,/p13: 'cascade'/);
  assert.match(ui,/p14: 'cognitive'/);
  assert.match(ui,/p06: 'processing'/);
  assert.match(ui,/p15: 'power'/);
  assert.match(ui,/p16: 'environment'/);
  assert.match(ui,/AUTHORITATIVE TIME-SERIES NOT AVAILABLE/);
  assert.doesNotMatch(ui,/Math\.random\(/);
  assert.ok(ministry.includes("executeResource16Point('p05', 'drill_oil')"));
  assert.ok(ministry.includes("executeResource16Point('p16', 'build_solar')"));
  assert.match(ui,/Open 12-Question Screening Checklist/);
  assert.match(ui,/Open Treasury & SWF Console/);
  assert.match(ui,/tonnes CO₂e/i);
  assert.match(ui,/simulated gameplay assumptions, not measured national emissions/i);
  assert.match(ui,/data-form="carbon-quota"/);
  assert.match(ui,/policy\.evaluateCognitiveGate\(c/);
  assert.match(ui,/policy\.startPowerProject/);
  assert.match(ui,/policy\.remediateSite/);
  assert.match(ui,/policy\.startExploration/);
  assert.match(ui,/policy\.approveInvestment/);
  assert.match(ui,/policy\.commissionSite/);
  assert.match(ui,/Authoritative exploration projects/);
  assert.match(ui,/policy\.startPowerProject/);
  assert.match(ui,/data-form="carbon-emission"/);
  assert.match(ui,/data-form="remediation"/);
  assert.match(ui,/Persisted strategic gate decisions/);
  assert.match(ui,/2\.4 GW nuclear baseload project/);
});

test('the UI bridge loads after its data-owning engines and static HUD has no fabricated balance examples', () => {
  const uiTag = html.indexOf('src="omega_resource_command_center_ui_v1.js"');
  assert.ok(uiTag >= 0, 'new UI bridge must be loaded');
  for (const name of ['ministry_engine.js','resource_ministry_engine.js','omega_resource_authoritative_adapter.js','omega_resource_action_execution_runtime.js','omega_global_market_system.js','omega_global_trade_system.js']) {
    assert.ok(html.indexOf('src="'+name+'"') >= 0 && html.indexOf('src="'+name+'"') < uiTag, name + ' must load before the UI bridge');
  }
  assert.doesNotMatch(html,/\$100M|850 PP|12\.4 GW|500K BBL|\+5K\/s|\+150\/s|60 FPS/,
    'static HUD indicators must not substitute invented starting values');
  assert.match(html,/dropdown-cash-val[^>]*>NOT OBSERVED/);
});

test('trade form submits through the authoritative request runtime and action feedback rejects unsupported commands', () => {
  assert.match(ui,/trade\.createRequest/);
  assert.match(ui,/acceptedFalse/);
  assert.match(ui,/referenceLiquidity === true/);
  assert.match(ui,/NO_COMPATIBLE_FACTORY/);
  assert.match(ui,/ALL_12_QUESTIONS_REQUIRE_ANSWERS/);
  assert.match(ui,/UNHANDLED_UI_ACTION/);
});


test('value, cascade, market and logistics controls use authoritative records without inventing transactions',()=>{
  assert.match(ui,/data-form="swf-capitalise"/);
  assert.match(ui,/policy\.capitalizeSovereignWealthFund/);
  assert.match(ui,/Fund contribution ledger/);
  assert.match(ui,/native treasury units/i);
  assert.match(ui,/A simulated 2\.4 GW project uses native treasury units/);
  assert.match(ui,/Emission factors are simulated assumptions, not measured data/);
  assert.match(ui,/authoritativeRoutePolicy/);
  assert.match(ui,/policy\.isRouteBlocked/);
  assert.match(ui,/mutatesGameplay: false/);
  assert.match(market,/if\(ask\.referenceOnly===true\)continue;/);
  assert.match(market,/referenceAskDepth/);
  assert.match(market,/bestAsk=asks\.find\(x=>x\.referenceOnly!==true\)/);
  assert.match(logistics,/RESOURCE_ROUTE_BLOCKADE_ACTIVE/);
  assert.match(logistics,/status:x\.status==='BLOCKED'/);
  assert.match(policyRuntime,/function capitalizeSwfTx/);
  assert.match(policyRuntime,/SWF_TRANSACTION_ID_CONFLICT/);
});

test('cognitive gate uses the server AI endpoint and cannot persist a player-only approval', () => {
  assert.match(ui, /\/api\/resource-decision\/ai-evaluate/);
  assert.match(ui, /aiCountrySnapshot\(c\)/);
  assert.match(ui, /aiAssessment:\s*body\.assessment/);
  assert.match(ui, /verdictRecorded:\s*false/);
  assert.match(ui, /body\.assessment\.authority\s*!==\s*'OMEGA_SERVER_RESOURCE_DECISION_AI'/);
  assert.match(ui, /liveSnapshotMatches/);
  assert.match(ui, /SIMULATION_STATE_CHANGED_DURING_AI_REVIEW/);
  assert.doesNotMatch(ui, /A player-entered 12-question screening decision is persisted/);
  assert.match(policyRuntime, /AI_ASSESSMENT_REQUIRED/);
  assert.match(policyRuntime, /SERVER_AI_DECISION_REQUIRED/);
  assert.match(policyRuntime, /aiGenerated!==true/);
});

test('quota enforcement and remediation follow-up are visible to the player and included in AI context', () => {
  assert.match(ui, /carbonQuotaEnforcementLedger/);
  assert.match(ui, /Carbon quota enforcement violations and remediation follow-up/);
  assert.match(ui, /BLOCKED attempts are kept separately from emissions actually committed|Blocked attempts are kept separately from emissions actually committed/);
  assert.match(ui, /carbonQuotaEnforcementLedger:.*slice\(-12\)/);
  assert.match(fs.readFileSync(new URL('../omega_resource_ai_decision_service.js', import.meta.url), 'utf8'), /recentQuotaEnforcement/);
});
