import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import "../omega_ui_v2/screens/resource-ministry.js";
import "../omega_ui_v2/screens/mine-production-command.js";

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
    const svg = read(expected);
    assert.match(svg, /<svg\b/, "resource icon must contain SVG source: " + expected);
    assert.match(svg, /stop-color="#f1f6fa"/, "resource icon needs a light high-contrast backing plate: " + expected);
    assert.match(svg, /stop-color="#d8e5ed"/, "resource icon needs balanced silver plating: " + expected);
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


test("Mine Production command is the active resource route and is cached for offline mobile play", () => {
  const app = read("omega_ui_v2/app.js");
  const html = read("index.html");
  const sw = read("omega-offline-map-sw.js");
  const manifest = json("omega_ui_v2/manifest.json");
  const source = read("omega_ui_v2/screens/mine-production-command.js");
  assert.match(app, /OmegaUIV2MineProductionCommand\.render/);
  assert.match(html, /omega_ui_v2\/screens\/mine-production-command\.js/);
  assert.match(sw, /omega_ui_v2\/screens\/mine-production-command\.js/);
  assert.equal(manifest.screens.mineProductionCommand, "omega_ui_v2/screens/mine-production-command.js");
  assert.match(source, /data-mine-tab="logistics"/);
  assert.match(source, /data-mine-tab="inventory"/);
  assert.match(source, /data-mine-tab="reports"/);
  assert.match(source, /quoteMineProject/);
  assert.match(source, /executeSitePipeline/);
  assert.match(source, /decommissionMine/);
  assert.match(source, /data-mine-workers/);
  assert.match(source, /PLAYER_COUNTRY_SCOPE_VIOLATION/);
  assert.match(source, /resourceOutputForDemand/);
  assert.doesNotMatch(source, /\\bSIMULATED\\b|catalog reference|dataset reference/i,
    "user-facing mine screen must not expose simulation/data-reference labels");
});

test("mine production screen renders a clear, responsive tabbed command surface", () => {
  const api = globalThis.OmegaUIV2MineProductionCommand;
  assert.ok(api, "mine production command renderer is registered");
  const previousGame = globalThis.Game;
  const previousManager = globalThis.OmegaResourceMineManagementUI;
  const previousApi = globalThis.OmegaUIV2ResourceMinistry;
  try {
    globalThis.Game = { state: { simulation: { turn: 3, session: { playerCountryId: "BGD" } },
      resource: { BGD: { mineAssets: [], inventory: {}, warehouse: { availableByResource: {} },
        industrialNetwork: { projects: [], siteFlowLedger: [], shipments: [] } } } } };
    globalThis.OmegaResourceMineManagementUI = {
      getCountrySites: (country) => country === "BGD" ? [{
        siteId:"BGD-TEST-COAL-01", countryId:"BGD", siteName:"Test Coal Mine", resourceId:"coal",
        siteType:"open pit mine", identity:{countryIso3:"BGD",resourceTypeId:"coal",resourceName:"Coal",siteType:"open pit mine"},
        quantitative:{reserve:{quantity:1200,unit:"tonnes",status:"REPORTED"}}, map:{markerEligible:true},
        operation:{status:"READY"}, location:{region:"North",countryId:"BGD"}
      }] : []
    };
    const root = { classList:{add(){}}, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, contains(){ return true; }, innerHTML:"", __omegaMineBound:true };
    const result = api.render(root, {countryId:"BGD",tab:"mines"});
    assert.equal(result.siteCount, 1);
    assert.match(root.innerHTML, /Mine Production/);
    assert.match(root.innerHTML, /Stock &amp; Logistics|Stock & Logistics/);
    assert.match(root.innerHTML, /Inventory \\/ Warehouse/);
    assert.match(root.innerHTML, /Reports/);
    assert.match(root.innerHTML, /Test Coal Mine/);
    assert.match(root.innerHTML, /Build mine/);
    assert.doesNotMatch(root.innerHTML, /SIMULATED|DATASET|catalog reference/i);
  } finally {
    if (previousGame === undefined) delete globalThis.Game; else globalThis.Game = previousGame;
    if (previousManager === undefined) delete globalThis.OmegaResourceMineManagementUI; else globalThis.OmegaResourceMineManagementUI = previousManager;
    if (previousApi === undefined) delete globalThis.OmegaUIV2ResourceMinistry; else globalThis.OmegaUIV2ResourceMinistry = previousApi;
  }
});
