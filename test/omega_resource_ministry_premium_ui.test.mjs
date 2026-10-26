import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import "../omega_ui_v2/screens/resource-ministry.js";

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
  assert.ok(html.includes(stylesheetTag), "premium resource stylesheet must be loaded by the app");
  assert.ok(sw.includes('"' + "./" + cssPath + '"'), "premium resource stylesheet must be precached offline");
  assert.ok(uiManifest.additionalStyles.includes(cssPath), "UI v2 manifest must document the resource style");
  assert.match(sw, /omega-offline-atlas-shell-v49/, "offline cache must be invalidated for new visual assets");
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
