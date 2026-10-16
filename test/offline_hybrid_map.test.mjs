import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, js, css, world] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../offline-hybrid-map.js", import.meta.url), "utf8"),
  readFile(new URL("../offline-hybrid-map.css", import.meta.url), "utf8"),
  readFile(new URL("../world.json", import.meta.url), "utf8")
]);

test("offline atlas control and assets are included without replacing online map controls", () => {
  assert.match(html, /data-layer="offline-hybrid"/);
  assert.match(html, /offline-hybrid-map\.js/);
  assert.match(html, /offline-hybrid-map\.css/);
  assert.match(html, /data-layer="satellite"/);
  assert.match(html, /data-layer="political"/);
});

test("atlas renderer has no remote tile or remote data dependency", () => {
  assert.match(js, /L\.GridLayer\.extend/);
  assert.match(js, /sourceGeoJSON/);
  assert.match(js, /world\.json|geojsonLayer/);
  assert.doesNotMatch(js, /https?:\/\/|tileLayer\(/i);
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("atlas keeps existing country interaction and resource/city layers authoritative", () => {
  assert.match(js, /originalRenderGeoJSON\.apply/);
  assert.match(js, /Game\.geojsonLayer/);
  assert.match(html, /resource_ministry_engine\.js/);
  assert.match(html, /map-engine-2\.js/);
  assert.match(js, /OmegaOfflineHybridAtlas/);
});

test("Android offline mode selects the local atlas and the map styling stays restrained", () => {
  assert.match(js, /if \(window\.OMEGA_ANDROID_OFFLINE\) activate\(\)/);
  assert.match(css, /omega-offline-hybrid-active/);
  assert.doesNotMatch(css, /animation:\s*resMarkerPulse/);
});

test("bundled world geometry is available for an offline map", () => {
  const parsed = JSON.parse(world);
  assert.equal(parsed.type, "FeatureCollection");
  assert.ok(Array.isArray(parsed.features));
  assert.ok(parsed.features.length > 100);
});