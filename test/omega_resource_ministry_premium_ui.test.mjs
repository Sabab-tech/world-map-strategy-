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
  assert.match(sw, /omega-offline-atlas-shell-v54/, "offline cache must be invalidated for new visual assets");
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
  assert.match(read("omega-offline-map-sw.js"), /omega-offline-atlas-shell-v54/);
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
