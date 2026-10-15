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
  const resourceSummary={briefing:'',globalMetrics:{},resourcesList:[]};
  const sandbox = {
    document,
    Game:{state,countryLookup:{BGD:{name:'Bangladesh'}}},
    ResourceMinistryEngine:{
      resourceTypes:[],
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
    assert.match(document.getElementById('gsrsk-intelligence-modal').innerHTML,/Sixteen resource command panels/);
  }
  const power=sandbox.OmegaCabinetUI.executeResource16Point('p15','build_nuclear');
  assert.equal(power.status,'OPENED_PANEL');
  assert.equal(api.getState().panel,'power');
  const environment=sandbox.OmegaCabinetUI.executeResource16Point('p16','build_solar');
  assert.equal(environment.status,'OPENED_PANEL');
  assert.equal(api.getState().panel,'environment');
  assert.match(document.getElementById('gsrsk-intelligence-modal').innerHTML,/carbon|environment|unavailable|not available/i);
});

test('legacy card names disclose feature gaps instead of claiming unsupported actions', () => {
  assert.match(ui,/p05: 'extraction'/);
  assert.match(ui,/p06: 'processing'/);
  assert.match(ui,/p15: 'power'/);
  assert.match(ui,/p16: 'environment'/);
  assert.match(ui,/AUTHORITATIVE TIME-SERIES NOT AVAILABLE/);
  assert.doesNotMatch(ui,/Math\.random\(/);
  assert.ok(ministry.includes("executeResource16Point('p05', 'drill_oil')"));
  assert.ok(ministry.includes("executeResource16Point('p16', 'build_solar')"));
  assert.match(ui,/Open 12-Question Screening Checklist/);
  assert.match(ui,/Inspect Treasury & SWF Records/);
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
  assert.match(ui,/Persisted advisory decisions/);
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
  assert.match(ui,/TREASURY_NATIVE_UNITS/);
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
