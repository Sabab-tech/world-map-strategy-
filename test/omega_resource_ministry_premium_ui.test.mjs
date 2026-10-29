import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import "../omega_ui_v2/screens/resource-ministry.js";
import "../omega_ui_v2/resource-ministry-legacy-bridge.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));

test("resource icon manifest is complete, local, unique and integrated with Resource Ministry", () => {
  const manifest = json("assets/omega-industrial-icons-v1/manifest.json");
  assert.equal(manifest.resources.length, 42, "preserve all 42 existing resource SVG records");
  assert.equal(manifest.factories.length, 21, "preserve the canonical 21 factory icon records");
  assert.equal(new Set(manifest.resources.map((item) => item.id)).size, manifest.resources.length);
  const api = globalThis.OmegaUIV2ResourceMinistry;
  assert.ok(api, "Resource Ministry screen must be registered");
  for (const icon of manifest.resources) {
    const expected = "assets/omega-industrial-icons-v1/" + icon.file;
    assert.ok(fs.existsSync(path.join(root, expected)), "resource icon must exist: " + expected);
    assert.match(read(expected), /<svg\b/, "resource icon must contain SVG source: " + expected);
    assert.equal(api.resourceIconPath(icon.id), expected, "canonical icon mapping must be stable for " + icon.id);
  }
  assert.equal(api.resourceIconPath("unregistered_future_type"), "", "unknown types must use the safe text fallback");
});

test("mine archetype classifier keeps extraction-site silhouettes distinct", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  assert.equal(api.mineArchetype({ siteType: "underground mine" }), "UNDERGROUND_MINE");
  assert.equal(api.mineArchetype({ siteType: "limestone quarry" }), "QUARRY");
  assert.equal(api.mineArchetype({ siteType: "offshore platform" }), "OFFSHORE_PLATFORM");
  assert.equal(api.mineArchetype({ resourceId: "natural_gas" }), "OIL_GAS_FIELD");
  assert.equal(api.mineArchetype({ siteType: "open pit mine" }), "OPEN_PIT");
});

test("resource visual layer is wired into the offline-first app without remote dependencies", () => {
  const html = read("index.html");
  const sw = read("omega-offline-map-sw.js");
  const uiManifest = json("omega_ui_v2/manifest.json");
  const cssPath = "omega_ui_v2/resource-ministry-premium.css";
  const stylesheetTag = '<link rel="stylesheet" href="' + cssPath + '">';
  const handoffPath = "omega_ui_v2/resource-ministry-legacy-bridge.js";
  assert.ok(html.includes('<script src="' + handoffPath + '" defer></script>'), "legacy Resource Ministry entry points must be routed through the UI v2 guard");
  assert.ok(sw.includes(handoffPath), "legacy handoff guard must be precached offline");
  assert.equal(uiManifest.integrationPolicy.resourceMinistryLegacyBridge, handoffPath, "the UI manifest must document the Resource Ministry guard");
  assert.ok(html.includes(stylesheetTag), "premium resource stylesheet must be loaded by the app");
  assert.ok(sw.includes('"' + "./" + cssPath + '"'), "premium resource stylesheet must be precached offline");
  assert.ok(uiManifest.additionalStyles.includes(cssPath), "UI v2 manifest must document the resource style");
  assert.match(sw, /omega-offline-atlas-shell-v60/, "offline cache must be invalidated for new visual assets");
  const coreAssets = sw.slice(sw.indexOf("const CORE_ASSETS"), sw.indexOf("];", sw.indexOf("const CORE_ASSETS")));
  assert.ok(coreAssets.includes('"./' + cssPath + '"'), "premium stylesheet belongs in the precache list");
  assert.ok(sw.includes("const resourceIcons = Array.isArray(factoryIconManifest.resources)"),
    "offline install must enumerate the canonical resource icon manifest");
  assert.ok(sw.includes('new URL("./assets/omega-industrial-icons-v1/" + file, APP_BASE).href'),
    "offline install must resolve icon paths against the local application base");
  assert.equal(json("assets/omega-industrial-icons-v1/manifest.json").resources.length, 42);
  assert.doesNotMatch(cssText(), /https?:\/\//, "resource visual styling must not depend on remote assets");
});

function cssText() {
  return read("omega_ui_v2/resource-ministry-premium.css");
}

test("resource renderer uses the canonical image map and labels mine archetypes", () => {
  const source = read("omega_ui_v2/screens/resource-ministry.js");
  assert.match(source, /data-omega-v2-resource-icon/);
  assert.match(source, /loading=\"lazy\" decoding=\"async\"/);
  assert.match(source, /data-mine-archetype/);
  assert.match(source, /RESERVE_NOT_RECORDED|UNOBSERVED/);
});


test("mine command screen has the requested tabs, per-site actions and clean player-facing text", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const priorGame = globalThis.Game;
  const priorCatalog = globalThis.OmegaResourceSiteCanonicalCatalogData;
  const row = {
    siteId: "SITE_BGD_TEST_COAL",
    countryId: "BGD",
    resourceId: "coal",
    siteName: "Test Coal Mine",
    status: "SIMULATED_OPERATIONAL_SCENARIO",
    location: { region: "Sylhet", coordinates: { lat: 24.9, lng: 91.8 } },
    operation: { commercialExtraction: true },
    quantitative: {
      reserve: { quantity: 1000000, unit: "TONNES", status: "SIMULATED" },
      production: { rate: 100, unit: "TONNES_PER_DAY", status: "SIMULATED" }
    },
    simulation: { reserve: { quantity: 1000000, unit: "TONNES", status: "SIMULATED" } }
  };
  globalThis.Game = { state: {
    simulation: { turn: 7, session: { playerCountryId: "BGD" } },
    resource: { BGD: {
      mineAssets: [{ siteId: row.siteId, resourceId: "coal", status: "OPERATIONAL", workersCommitted: 250, workersRequired: 300 }],
      industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [{
        flowId: "FLOW-TEST-1", siteId: row.siteId, countryId: "BGD", resourceId: "coal",
        batchId: "BATCH-TEST-1", quantity: 100, unit: "TONNES", status: "DELIVERED",
        extractionTurn: 7, stages: [{ stage: "EXTRACTION", status: "COMPLETED", turn: 7 }]
      }] },
      warehouse: { availableByResource: { coal: 500 }, receipts: [] },
      processedWarehouse: { availableByResource: { coal: 50 }, receipts: [] },
      demandByResource: { coal: { dailyDemand: 120 } },
      inventoryLedger: []
    } }
  } };
  globalThis.OmegaResourceSiteCanonicalCatalogData = { sites: [row] };
  const root = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  try {
    const rendered = api.render(root, { countryId: "BGD", sites: [row], tab: "mines" });
    assert.equal(rendered.ok, true);
    assert.match(root.innerHTML, /Overview/);
    assert.match(root.innerHTML, /Stock &amp; Logistics/);
    assert.match(root.innerHTML, /Inventory \/ Warehouse/);
    assert.match(root.innerHTML, /Reports/);
    assert.match(root.innerHTML, /data-omega-v2-mine-action="build"/);
    assert.match(root.innerHTML, /data-omega-v2-mine-action="extract"/);
    assert.match(root.innerHTML, /data-omega-v2-mine-action="demolish"/);
    assert.match(root.innerHTML, /data-balance-state="shortage"/);
    const visibleText = root.innerHTML.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&");
    assert.doesNotMatch(visibleText, /\b(simulated|modelled|modeled|catalog reference|source:|site id)\b/i);
    api.render(root, { countryId: "BGD", sites: [row], tab: "reports" });
    assert.match(root.innerHTML, /omega-v2-report-chart/);
    assert.match(root.innerHTML, /omega-v2-chart-bar/);
  } finally {
    if (priorGame === undefined) delete globalThis.Game; else globalThis.Game = priorGame;
    if (priorCatalog === undefined) delete globalThis.OmegaResourceSiteCanonicalCatalogData;
    else globalThis.OmegaResourceSiteCanonicalCatalogData = priorCatalog;
  }
});

test("Resource Logistics shows configured per-site route cards and keeps Current Match separate from live shipments", async () => {
  const vm = await import("node:vm");
  const fetched = [];
  const route = {
    routeId: "ROUTE_TST_COAL_MINE",
    siteId: "TST-MINE-ROUTE-01",
    countryId: "TST",
    siteName: "Test Coal Mine",
    resourceId: "coal",
    resourceIconKey: "coal",
    destination: { warehouseId: "WH-TST-RAW" },
    routePlan: {
      routeStatus: "SIMULATED_PLAN_COMPLETE_ENGINE_BINDING_PENDING",
      dispatchStatus: "NOT_DISPATCHABLE_DATA_ONLY_PHASE",
      legs: [{ transportMode: "truck" }, { transportMode: "rail" }],
      estimatedRouteDistanceKm: 120,
      plannedTransitDays: 3,
      capacityBottleneckPerDay: 45,
      capacityUnit: "RAW_CARGO_TONNES_PER_DAY"
    }
  };
  const sandbox = {
    fetch: async (url) => {
      const name = String(url).replace(/^\.\//, "");
      fetched.push(name);
      if (name === "resource_site_logistics_routes_v1.json") {
        return { ok: true, json: async () => ({
          datasetId: "OMEGA_RESOURCE_SITE_LOGISTICS_ROUTES_V1",
          simulationOnly: true,
          countryToPart: { TST: 2 },
          parts: [{ part: 2, file: "resource_site_logistics_routes_v1_part_02.json" }]
        }) };
      }
      if (name === "resource_site_logistics_routes_v1_part_02.json") {
        return { ok: true, json: async () => ({ routes: [route] }) };
      }
      throw new Error("Unexpected logistics asset request: " + name);
    }
  };
  sandbox.window = sandbox;
  vm.default.createContext(sandbox);
  vm.default.runInContext(read("omega_ui_v2/screens/resource-ministry.js"), sandbox, {
    filename: "omega_ui_v2/screens/resource-ministry.js"
  });
  const api = sandbox.OmegaUIV2ResourceMinistry;
  sandbox.Game = { state: {
    simulation: { turn: 1, session: { playerCountryId: "TST" } },
    resource: { TST: {
      mineAssets: [],
      industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [], factoryAssets: [] },
      warehouse: { availableByResource: {} },
      processedWarehouse: { availableByResource: {} },
      inventory: { batches: [] },
      inventoryLedger: [],
      demandByResource: {}
    } }
  } };
  const root = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  const initial = api.render(root, { countryId: "TST", sites: [], tab: "logistics" });
  assert.equal(initial.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(root.innerHTML, /Mine Site Route Plans/);
  assert.match(root.innerHTML, /Test Coal Mine/);
  assert.match(root.innerHTML, /Current Match/);
  assert.match(root.innerHTML, /Unavailable/);
  assert.match(root.innerHTML, /120 km/);
  assert.match(root.innerHTML, /3 days/);
  assert.match(root.innerHTML, /45 tonnes\/day/);
  assert.match(root.innerHTML, /data-current-match="unavailable"/);
  assert.doesNotMatch(root.innerHTML, /No active shipments or delivery records/);
  assert.deepEqual(fetched, [
    "resource_site_logistics_routes_v1.json",
    "resource_site_logistics_routes_v1_part_02.json"
  ], "only the selected country's route shard should be loaded");

  sandbox.Game.state.resource.TST.industrialNetwork.shipments = [{
    siteId: "TST-MINE-ROUTE-01",
    routeId: "ROUTE_TST_COAL_MINE",
    resourceId: "coal",
    quantity: 10,
    unit: "tonnes",
    status: "IN_TRANSIT",
    transportMode: "truck",
    destinationWarehouseId: "WH-TST-RAW",
    etaTurn: 2
  }];
  api.render(root, { countryId: "TST", sites: [], tab: "logistics" });
  assert.match(root.innerHTML, /Current Shipments/);
  assert.match(root.innerHTML, /data-current-match="matched"/);
  assert.match(root.innerHTML, />Matched</);
});

test("resource status plating and charts stay local and unit-aware", () => {
  const css = cssText();
  assert.match(css, /omega-v2-mine-card\[data-balance-state="adequate"\]/);
  assert.match(css, /omega-v2-mine-card\[data-balance-state="shortage"\]/);
  assert.match(css, /omega-v2-mine-card\[data-balance-state="stopped"\]/);
  assert.match(css, /omega-v2-resource-icon[\s\S]*#f6fafc/);
  assert.doesNotMatch(css, /https?:\/\//);
});


test("all resource SVGs use a light metallic backplate for readable dark minerals", () => {
  const manifest = json("assets/omega-industrial-icons-v1/manifest.json");
  assert.equal(manifest.resources.length, 42);
  assert.equal(manifest.factories.length, 21);
  for (const item of manifest.resources) {
    const file = "assets/omega-industrial-icons-v1/" + item.file;
    const svg = read(file);
    const match = svg.match(/<linearGradient id="[^"]+-bg"[^>]*>([\s\S]*?)<\/linearGradient>/);
    assert.ok(match, file + ": backplate gradient required");
    assert.match(match[1], /stop-color="#f7fbfd"/, file + ": light upper metallic layer");
    assert.match(match[1], /stop-color="#dce7ec"/, file + ": silver main surface");
    assert.match(match[1], /stop-color="#b7c8d1"/, file + ": readable lower edge");
    assert.match(svg, /data-omega-icon-kind="resource"/);
  }
  assert.match(manifest.rendering.background, /light silver-metal.*factory SVGs retain their shared dark-navy/i);
  assert.match(read("omega-offline-map-sw.js"), /omega-offline-atlas-shell-v60/);
});


test("country selector browses canonical mine sites without granting foreign-country operation access", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const priorGame = globalThis.Game;
  const priorResourceEngine = globalThis.ResourceMinistryEngine;
  const priorCatalog = globalThis.OmegaResourceSiteCanonicalCatalogData;
  const site = (countryId, countryName, siteName, siteId) => ({
    siteId, countryId, siteName, resourceId: "coal",
    identity: { countryIso3: countryId, countryName, resourceTypeId: "coal" },
    location: { countryName, region: "Mining region", coordinates: { lat: 12, lng: 24 } },
    operation: { commercialExtraction: true, status: "REGISTERED" },
    quantitative: {
      reserve: { quantity: 100000, unit: "TONNES", status: "SIMULATED" },
      production: { rate: 10, unit: "TONNES_PER_DAY", status: "SIMULATED" }
    },
    simulation: { reserve: { quantity: 100000, unit: "TONNES", status: "SIMULATED" } }
  });
  const bangladesh = site("BGD", "Bangladesh", "Bangladesh Coal Mine", "SITE_BGD_COUNTRY_SELECTOR");
  const usa = site("USA", "United States", "United States Coal Mine", "SITE_USA_COUNTRY_SELECTOR");
  const listeners = Object.create(null);
  let foreignStateBefore = null;
  globalThis.Game = { state: {
    simulation: { turn: 4, session: { playerCountryId: "BGD" } },
    resource: {
      BGD: { mineAssets: [], industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [] } },
      USA: { mineAssets: [], industrialNetwork: { projects: [], shipments: [], siteFlowLedger: [] } }
    }
  } };
  foreignStateBefore = JSON.stringify(globalThis.Game.state.resource.USA);
  globalThis.ResourceMinistryEngine = {
    countryProfiles: {
      BGD: { identity: { iso3: "BGD", officialName: "Bangladesh" } },
      USA: { identity: { iso3: "USA", officialName: "United States" } }
    }
  };
  globalThis.OmegaResourceSiteCanonicalCatalogData = { sites: [bangladesh, usa] };
  const root = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener(type, fn) { listeners[type] = fn; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  try {
    const first = api.render(root, { countryId: "BGD", sites: [bangladesh, usa], tab: "mines" });
    assert.equal(first.ok, true);
    assert.match(root.innerHTML, /data-omega-v2-resource-country/);
    assert.match(root.innerHTML, /Bangladesh \(BGD\)/);
    assert.match(root.innerHTML, /United States \(USA\)/);
    assert.match(root.innerHTML, /Bangladesh Coal Mine/);

    listeners.change({
      target: {
        value: "USA",
        matches(selector) { return selector === "[data-omega-v2-resource-country]"; }
      }
    });
    assert.match(root.innerHTML, /United States \(USA\)/);
    assert.match(root.innerHTML, /United States Coal Mine/);
    assert.match(root.innerHTML, /data-omega-v2-mine-action="build"[^>]*disabled/);
    assert.equal(JSON.stringify(globalThis.Game.state.resource.USA), foreignStateBefore,
      "browsing a foreign country must remain read-only");
    assert.doesNotMatch(root.innerHTML.replace(/<[^>]*>/g, " "), /\bSIMULATED\b/i);
  } finally {
    if (priorGame === undefined) delete globalThis.Game; else globalThis.Game = priorGame;
    if (priorResourceEngine === undefined) delete globalThis.ResourceMinistryEngine;
    else globalThis.ResourceMinistryEngine = priorResourceEngine;
    if (priorCatalog === undefined) delete globalThis.OmegaResourceSiteCanonicalCatalogData;
    else globalThis.OmegaResourceSiteCanonicalCatalogData = priorCatalog;
  }
});


test("legacy Resource & Mining renderer entry points hand off to UI v2 without duplicate rendering", () => {
  const bridge = globalThis.OmegaUIV2ResourceLegacyBridge;
  assert.ok(bridge, "Resource Ministry legacy bridge must be registered");
  const previous = {
    document: globalThis.document,
    cabinet: globalThis.OmegaCabinetUI,
    integration: globalThis.OmegaUIV2Integration,
    app: globalThis.OmegaUIV2App,
    notification: globalThis.showOmegaNotification
  };
  const attributes = Object.create(null);
  const root = {
    style: {},
    __omegaUIV2State: null,
    setAttribute(key, value) { attributes[key] = String(value); },
    getAttribute(key) { return attributes[key] || null; },
    removeAttribute(key) { delete attributes[key]; }
  };
  const dashboard = { style: {}, setAttribute() {} };
  const mountCalls = [];
  const openCalls = [];
  let legacyCalls = 0;
  globalThis.document = {
    getElementById(id) {
      if (id === "cabinet-full-window") return root;
      if (id === "ministry-dashboard-view") return dashboard;
      return null;
    }
  };
  globalThis.OmegaUIV2Integration = {
    isEnabled() { return true; },
    mountIntoCabinet(node, options) {
      mountCalls.push({ node, options });
      node.setAttribute("data-omega-ui-v2-active", "true");
      node.__omegaUIV2State = { route: "resources", ministryId: "energy_mining", section: "dashboard" };
      return { ok: true, route: "resources" };
    }
  };
  globalThis.OmegaUIV2App = {
    openMinistry(node, id) {
      openCalls.push(id);
      node.__omegaUIV2State = { route: "resources", ministryId: id, section: "dashboard" };
      return true;
    }
  };
  globalThis.showOmegaNotification = () => {};
  const legacy = {
    activeCountry: "BGD",
    getActiveCountryKey() { return "BGD"; },
    renderMinistryDashboard() { legacyCalls += 1; },
    renderResourceMinistryDashboard() { legacyCalls += 1; }
  };
  globalThis.OmegaCabinetUI = legacy;
  try {
    assert.equal(bridge.install(), true);
    assert.equal(legacy.renderMinistryDashboard("energy_mining"), true);
    assert.equal(mountCalls.length, 1, "direct ministry entry must mount the unified UI once");
    assert.equal(mountCalls[0].options.initialRoute, "government");
    assert.equal(mountCalls[0].options.ministryId, "energy_mining");
    assert.equal(mountCalls[0].options.countryId, "BGD");
    assert.equal(legacy.renderResourceMinistryDashboard({ id: "energy_mining" }, {}), true);
    assert.deepEqual(openCalls, ["energy_mining"], "an active UI v2 screen must be reused rather than re-mounted");
    assert.equal(legacyCalls, 0, "retired resource renderers must never produce legacy markup");
    legacy.renderMinistryDashboard("defense");
    assert.equal(legacyCalls, 1, "unrelated ministry rendering must remain unchanged");
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.cabinet === undefined) delete globalThis.OmegaCabinetUI; else globalThis.OmegaCabinetUI = previous.cabinet;
    if (previous.integration === undefined) delete globalThis.OmegaUIV2Integration; else globalThis.OmegaUIV2Integration = previous.integration;
    if (previous.app === undefined) delete globalThis.OmegaUIV2App; else globalThis.OmegaUIV2App = previous.app;
    if (previous.notification === undefined) delete globalThis.showOmegaNotification; else globalThis.showOmegaNotification = previous.notification;
  }
});

test("Resource & Mining never falls back to the retired UI when UI v2 is unavailable", () => {
  const bridge = globalThis.OmegaUIV2ResourceLegacyBridge;
  const previous = {
    document: globalThis.document,
    cabinet: globalThis.OmegaCabinetUI,
    integration: globalThis.OmegaUIV2Integration,
    app: globalThis.OmegaUIV2App,
    notification: globalThis.showOmegaNotification
  };
  const root = { style: {}, getAttribute() { return null; } };
  let legacyCalls = 0;
  globalThis.document = { getElementById(id) { return id === "cabinet-full-window" ? root : null; } };
  globalThis.OmegaUIV2Integration = undefined;
  globalThis.OmegaUIV2App = undefined;
  globalThis.showOmegaNotification = () => {};
  const legacy = {
    renderMinistryDashboard() { legacyCalls += 1; },
    renderResourceMinistryDashboard() { legacyCalls += 1; }
  };
  globalThis.OmegaCabinetUI = legacy;
  try {
    assert.equal(bridge.install(), true);
    assert.equal(legacy.renderMinistryDashboard("resource"), false);
    assert.equal(legacy.renderResourceMinistryDashboard({ id: "resource" }), false);
    assert.equal(legacyCalls, 0, "a failed UI v2 mount must not revive the previous Resource Ministry UI");
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.cabinet === undefined) delete globalThis.OmegaCabinetUI; else globalThis.OmegaCabinetUI = previous.cabinet;
    if (previous.integration === undefined) delete globalThis.OmegaUIV2Integration; else globalThis.OmegaUIV2Integration = previous.integration;
    if (previous.app === undefined) delete globalThis.OmegaUIV2App; else globalThis.OmegaUIV2App = previous.app;
    if (previous.notification === undefined) delete globalThis.showOmegaNotification; else globalThis.showOmegaNotification = previous.notification;
  }
});


test("v2 Build opens an actionable plan and Start construction calls the authoritative mine runtime", () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const priorGame = globalThis.Game, priorCatalog = globalThis.OmegaResourceSiteCanonicalCatalogData;
  const priorNetwork = globalThis.OmegaResourceIndustrialNetwork, priorMineUi = globalThis.OmegaResourceMineManagementUI;
  const listeners = Object.create(null), starts = [];
  let legacyOpens = 0;
  const row = { siteId:"SITE_BGD_BUILD_FLOW", countryId:"BGD", resourceId:"coal", siteName:"Build Flow Coal Mine",
    operation:{commercialExtraction:true}, location:{region:"Sylhet"},
    quantitative:{reserve:{quantity:100000,unit:"TONNES",status:"SIMULATED"},production:{rate:12,unit:"TONNES_PER_DAY",status:"SIMULATED"}},
    simulation:{reserve:{quantity:100000,unit:"TONNES",status:"SIMULATED"}} };
  const countInput={value:"2"}, workerInput={value:"1200"}, previewNode={innerHTML:""};
  const root={innerHTML:"",classList:{add(){}},addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn);},
    querySelector(s){if(s==="[data-omega-v2-build-count]")return countInput;if(s==="[data-omega-v2-build-workers]")return workerInput;if(s==="[data-omega-v2-build-preview]")return previewNode;return null;},
    querySelectorAll(){return[];},contains(){return true;}};
  globalThis.Game={state:{simulation:{turn:3,session:{playerCountryId:"BGD"}},resource:{BGD:{mineAssets:[],
    industrialNetwork:{projects:[],shipments:[],siteFlowLedger:[]},
    warehouse:{availableByResource:{coal:100000,iron_ore:100000,copper:100000,limestone:100000,construction_aggregate:100000}}}},finance:{BGD:{available:1000000000}}}};
  globalThis.OmegaResourceSiteCanonicalCatalogData={sites:[row]};
  globalThis.OmegaResourceMineManagementUI={open(){legacyOpens+=1;}};
  globalThis.OmegaResourceIndustrialNetwork={
    quoteMineProject(input){return{status:"QUOTED",countryId:input.countryId,siteId:input.siteId,resourceId:input.resourceId,assetCount:input.quantity,
      costUsd:96000000,unitCostUsd:48000000,durationDays:180,estimatedTurns:6,workersRequired:1200,workersRequiredPerAsset:600,assignedWorkers:input.assignedWorkers,
      staffingReady:input.assignedWorkers>=1200,materialsReady:true,commissioningReady:true,ready:input.quantity===2&&input.assignedWorkers>=1200,
      treasury:{available:1000000000,required:96000000,sufficient:true},
      materials:[{resourceId:"iron_ore",required:17000,available:100000,shortfall:0,unit:"SIMULATION_RESOURCE_UNIT",sufficient:true}]}},
    startMineProject(input){starts.push(input);const project={projectId:"MINE-TEST-STARTED",projectType:"MINE_CONSTRUCTION",siteId:input.siteId,resourceId:input.resourceId,
      status:"UNDER_CONSTRUCTION",assetCount:input.quantity,costUsd:96000000,durationDays:180,progressDays:0,progressPct:0,remainingDays:180,
      expectedCompletionDate:"2027-01-01",workersCommitted:input.assignedWorkers,workersRequired:1200,
      materialsRequired:[{resourceId:"iron_ore",quantity:17000,unit:"SIMULATION_RESOURCE_UNIT"}]};
      globalThis.Game.state.resource.BGD.industrialNetwork.projects.push(project);return project;}
  };
  function fire(type,event){(listeners[type]||[]).forEach(function(fn){fn(event);});}
  function click(selector,attrs){const button={disabled:false,getAttribute(name){return attrs[name]||null;}};fire("click",{target:{closest(v){return v===selector?button:null;}}});}
  try{
    api.render(root,{countryId:"BGD",sites:[row],tab:"mines"});
    click("[data-omega-v2-mine-action]",{"data-omega-v2-mine-action":"build","data-site-id":row.siteId});
    assert.match(root.innerHTML,/data-omega-v2-build-plan/);
    assert.match(root.innerHTML,/data-omega-v2-build-count/);
    assert.match(root.innerHTML,/data-omega-v2-build-workers/);
    assert.match(root.innerHTML,/Start construction/);
    assert.equal(legacyOpens,0,"Build must not merely open the retired modal");
    fire("input",{target:{value:"2",matches(s){return s==="[data-omega-v2-build-count]";}}});
    assert.match(previewNode.innerHTML,/data-omega-v2-build-submit>(Start construction)<\/button>/,"ready quote must enable Start construction");
    assert.match(previewNode.innerHTML,/Resources needed to establish this mine/,"build preview should explain why these resources are listed");
    assert.match(previewNode.innerHTML,/class="omega-v2-build-material-resource"/,"each required resource gets a compact icon-and-label row");
    assert.match(previewNode.innerHTML,/assets\/omega-industrial-icons-v1\/resources\/iron-ore\.svg/,"the existing canonical resource SVG is shown beside the name");
    assert.match(previewNode.innerHTML,/Need <span[^>]*>17K<\/span>/,"resource requirements use compact thousands notation");
    assert.match(previewNode.innerHTML,/Available: <span[^>]*>100K<\/span>/,"available inventory uses compact thousands notation");
    assert.doesNotMatch(previewNode.innerHTML,/SIMULATION(?:_RESOURCE)?_UNIT/i,"internal simulation unit labels stay out of the player UI");
    const buildCss=read("omega_ui_v2/omega-ui-v2.css");
    const premiumCss=read("omega_ui_v2/resource-ministry-premium.css");
    assert.match(buildCss,/\.omega-v2-mine-build-plan/,"fallback styling is scoped to the mine build section");
    assert.match(buildCss,/text-decoration:\s*none\s*!important/i,"underlines are removed in the shared stylesheet");
    const previousPremiumRule=premiumCss.indexOf(".omega-v2-resource-premium .omega-v2-build-material {");
    const finalCascadeRule=premiumCss.lastIndexOf(".omega-v2-resource-premium .omega-v2-mine-build-plan .omega-v2-build-material {");
    assert.ok(previousPremiumRule >= 0 && finalCascadeRule > previousPremiumRule,
      "final mine-build styles must override older premium resource rules loaded in the same stylesheet");
    assert.match(premiumCss, /\.omega-v2-resource-premium \.omega-v2-mine-build-plan \.omega-v2-build-material \{[^}]*display:\s*grid/s,
      "the live material row remains a compact icon-and-quantity grid after premium styles load");
    assert.match(premiumCss, /\.omega-v2-resource-premium \.omega-v2-mine-build-plan \* \{[^}]*text-decoration:\s*none\s*!important/s,
      "the active premium cascade removes underlines from the build panel");
    click("[data-omega-v2-build-submit]",{"data-omega-v2-build-submit":"true"});
    assert.equal(starts.length,1,"authoritative startMineProject must run exactly once");
    assert.equal(starts[0].countryId,"BGD");assert.equal(starts[0].siteId,row.siteId);assert.equal(starts[0].resourceId,"coal");
    assert.equal(starts[0].quantity,2);assert.equal(starts[0].assignedWorkers,1200);
    assert.match(starts[0].requestId,/^MINE_UI_V2:BGD:SITE_BGD_BUILD_FLOW:N2:W1200:/);
    assert.match(root.innerHTML,/Construction in progress/);assert.match(root.innerHTML,/180 days remaining/);assert.match(root.innerHTML,/2027-01-01/);
  }finally{
    if(priorGame===undefined)delete globalThis.Game;else globalThis.Game=priorGame;
    if(priorCatalog===undefined)delete globalThis.OmegaResourceSiteCanonicalCatalogData;else globalThis.OmegaResourceSiteCanonicalCatalogData=priorCatalog;
    if(priorNetwork===undefined)delete globalThis.OmegaResourceIndustrialNetwork;else globalThis.OmegaResourceIndustrialNetwork=priorNetwork;
    if(priorMineUi===undefined)delete globalThis.OmegaResourceMineManagementUI;else globalThis.OmegaResourceMineManagementUI=priorMineUi;
  }
});


test("logistics cards expose mine/warehouse SVGs and per-mode fleet counts using the capacity formula", async () => {
  const api = globalThis.OmegaUIV2ResourceMinistry;
  const priorGame = globalThis.Game;
  const priorFetch = globalThis.fetch;
  const priorNetwork = globalThis.OmegaResourceIndustrialNetwork;
  const shipment = {
    shipmentId: "SHIPMENT_VISUAL_TEST_01",
    resourceId: "coal",
    quantity: 8200,
    unit: "TONNES",
    status: "IN_TRANSIT",
    sourceSiteName: "Sylhet Coal Mine",
    destinationFactoryName: "Dhaka Steel Factory",
    transportMode: "ROAD",
    etaTurn: 12
  };
  const listeners = Object.create(null);
  const root = {
    innerHTML: "",
    classList: { add() {} },
    addEventListener(type, fn) { listeners[type] = fn; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  const route = {
    siteId: "SITE_BGD_TEST_MINE",
    countryId: "BGD",
    siteName: "Test Mine",
    resourceId: "coal",
    destination: { warehouseId: "WH-BGD-RAW" },
    planningProduction: { rate: 100, unit: "TONNES_PER_DAY", simulationOnly: true },
    routePlan: {
      estimatedRouteDistanceKm: 220,
      plannedTransitDays: 1.5,
      capacityBottleneckPerDay: 25,
      capacityUnit: "RAW_CARGO_TONNES_PER_DAY",
      legs: [
        { sequence: 1, transportMode: "truck", estimatedDistanceKm: 20, designCapacityPerDay: 25, designCapacityUnit: "RAW_CARGO_TONNES_PER_DAY", requiredDesignFleetSlots: 4 },
        { sequence: 2, transportMode: "ship", estimatedDistanceKm: 200, designCapacityPerDay: 250, designCapacityUnit: "RAW_CARGO_TONNES_PER_DAY", requiredDesignFleetSlots: 1 }
      ]
    }
  };
  const routeManifest = {
    datasetId: "OMEGA_RESOURCE_SITE_LOGISTICS_ROUTES_V1",
    simulationOnly: true,
    countryToPart: { BGD: 1 },
    parts: [{ part: 1, file: "resource_site_logistics_routes_v1_part_01.json" }]
  };
  const routeShard = { routes: [route] };
  const fleetCounts = { truck: 2, rail: null, ship: 1, barge: null, pipeline: null };
  const writes = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("resource_site_logistics_routes_v1.json") && !value.includes("_part_")) {
      return { ok: true, json: async () => routeManifest };
    }
    if (value.includes("resource_site_logistics_routes_v1_part_01.json")) {
      return { ok: true, json: async () => routeShard };
    }
    throw new Error("Unexpected route data request: " + value);
  };
  globalThis.OmegaResourceIndustrialNetwork = {
    getTransportFleet({ countryId, siteId }) {
      return {
        status: "READY", countryId, siteId,
        transportTypes: Object.entries(fleetCounts).map(([transportType, count]) => ({
          transportType, count, configured: count !== null
        })),
        individualVehicleIdsRequired: false
      };
    },
    setTransportFleet(input) {
      writes.push(input);
      fleetCounts[input.transportType] = input.count;
      return { status: "APPLIED" };
    }
  };
  globalThis.Game = {
    state: {
      simulation: { turn: 10, session: { playerCountryId: "BGD" } },
      resource: {
        BGD: {
          mineAssets: [],
          industrialNetwork: { projects: [], shipments: [shipment], siteFlowLedger: [] },
          warehouse: { availableByResource: { coal: 8200 } }
        }
      }
    }
  };
  try {
    const result = api.render(root, { countryId: "BGD", sites: [], tab: "logistics" });
    assert.equal(result.ok, true);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(root.innerHTML, /omega-v2-logistics-card/);
    assert.match(root.innerHTML, /data-omega-v2-logistics-icon="origin"/);
    assert.match(root.innerHTML, /data-omega-v2-logistics-icon="warehouse"/);
    assert.match(root.innerHTML, /data-omega-v2-logistics-icon="transport"/);
    assert.match(root.innerHTML, /data-omega-v2-logistics-icon="factory"/);
    assert.match(root.innerHTML, /data-omega-v2-resource-icon="coal"/);
    assert.match(root.innerHTML, /Sylhet Coal Mine/);
    assert.match(root.innerHTML, /Dhaka Steel Factory/);
    assert.match(root.innerHTML, /8,200 TONNES/);
    assert.match(root.innerHTML, /Transport inventory by mode/);
    assert.match(root.innerHTML, /data-cross-border-import-status="needs-geocoded-infrastructure"/);
    assert.match(root.innerHTML, /data-logistics-summary-mode="ship"/);
    assert.match(root.innerHTML, /data-omega-v2-logistics-leg-icon="truck"/);
    assert.match(root.innerHTML, /data-omega-v2-logistics-leg-icon="ship"/);
    assert.match(root.innerHTML, /data-transport-mode-summary="truck"/);
    assert.match(root.innerHTML, /data-transport-mode-summary="ship"/);
    assert.doesNotMatch(root.innerHTML, /data-transport-mode-summary="rail"/);
    assert.match(root.innerHTML, /Design need: 4 units/);
    assert.match(root.innerHTML, /Design need: 1 units/);
    assert.match(root.innerHTML, /Registered: 2 units/);
    assert.match(root.innerHTML, /Registered total: 2 across 1 mine/);
    assert.match(root.innerHTML, /Turn 12/);
    const css = read("omega_ui_v2/resource-ministry-premium.css");
    assert.match(css, /omega-v2-logistics-card::before/);
    assert.match(css, /omega-v2-logistics-fleet-summary-grid/);
    assert.match(css, /omega-v2-logistics-leg-row/);
    assert.match(css, /omega-v2-logistics-path/);
    assert.match(css, /input:focus-visible/);
    assert.match(css, /omega-v2-build-plan-fields/);

    const button = {
      getAttribute(name) { return name === "data-omega-v2-fleet-action" ? "add" : null; },
      closest(selector) { return selector === "[data-omega-v2-fleet-control]" ? control : null; }
    };
    const control = {
      getAttribute(name) {
        return name === "data-site-id" ? "SITE_BGD_TEST_MINE" :
          name === "data-transport-mode" ? "truck" : null;
      },
      querySelector() { return { value: "3" }; }
    };
    listeners.click({ target: { closest(selector) { return selector === "[data-omega-v2-fleet-action]" ? button : null; } } });
    assert.equal(writes.length, 1, "the Add control must save through the existing fleet API");
    assert.deepEqual(writes[0], { countryId: "BGD", siteId: "SITE_BGD_TEST_MINE", transportType: "truck", count: 5 });
  } finally {
    if (priorGame === undefined) delete globalThis.Game; else globalThis.Game = priorGame;
    if (priorFetch === undefined) delete globalThis.fetch; else globalThis.fetch = priorFetch;
    if (priorNetwork === undefined) delete globalThis.OmegaResourceIndustrialNetwork; else globalThis.OmegaResourceIndustrialNetwork = priorNetwork;
  }
});

