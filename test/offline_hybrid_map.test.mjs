import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, js, css, world] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../offline-hybrid-map.js", import.meta.url), "utf8"),
  readFile(new URL("../offline-hybrid-map.css", import.meta.url), "utf8"),
  readFile(new URL("../world.json", import.meta.url), "utf8")
]);

test("offline atlas uses existing controls and local style assets", () => {
  assert.match(html, /data-layer="offline-hybrid"/);
  assert.match(html, /offline-hybrid-map\.js/);
  assert.match(html, /offline-hybrid-map\.css/);
  assert.match(html, /data-layer="satellite"/);
  assert.match(html, /data-layer="political"/);
});

test("recognizable country shapes and boundaries use the canonical GeoJSON layer", () => {
  assert.match(js, /Game\.geojsonLayer/);
  assert.match(js, /countries\.eachLayer/);
  assert.match(js, /fillOpacity:\s*0\.91/);
  assert.match(js, /color:\s*"#c0c8bb"/);
  assert.doesNotMatch(js, /L\.GridLayer\.extend|tileLayer\(/i);
  assert.doesNotMatch(js, /https?:\/\/|\bfetch\s*\(|XMLHttpRequest|WebSocket/i);
});

test("real geographic coordinate graticule and degree labels are available", () => {
  assert.match(js, /L\.polyline/);
  assert.match(js, /longitudeText/);
  assert.match(js, /latitudeText/);
  assert.match(js, /lon \+= 30/);
  assert.match(js, /parallel \+= 15/);
  assert.match(css, /omega-offline-coordinate-label/);
});

test("country selection, city and resource systems remain connected", () => {
  assert.match(js, /originalRenderGeoJSON\.apply/);
  assert.match(js, /originalSelectCountry\.apply/);
  assert.match(html, /resource_ministry_engine\.js/);
  assert.match(html, /map-engine-2\.js/);
});

test("Android offline shell automatically activates the vector atlas", () => {
  assert.match(js, /if \(window\.OMEGA_ANDROID_OFFLINE\) activate\(\)/);
  assert.match(css, /omega-offline-hybrid-active/);
  assert.doesNotMatch(css, /animation:\s*resMarkerPulse/);
});

test("country geometry is present in the bundled world data", () => {
  const parsed = JSON.parse(world);
  assert.equal(parsed.type, "FeatureCollection");
  assert.ok(Array.isArray(parsed.features));
  assert.ok(parsed.features.length > 100);
});