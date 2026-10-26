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
  assert.match(sw, /omega-offline-atlas-shell-v48/, "offline cache must be invalidated for new visual assets");
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
