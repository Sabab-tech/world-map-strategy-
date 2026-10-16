import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, js, css, world, mapEngine, mainActivity] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../offline-hybrid-map.js", import.meta.url), "utf8"),
  readFile(new URL("../offline-hybrid-map.css", import.meta.url), "utf8"),
  readFile(new URL("../world.json", import.meta.url), "utf8"),
  readFile(new URL("../map-engine-1.js", import.meta.url), "utf8"),
  readFile(new URL("../android/app/src/main/java/com/omega/globalsupremecommander/MainActivity.java", import.meta.url), "utf8")
]);

test("hybrid atlas uses existing map-layer controls and stylesheet", () => {
  assert.match(html, /data-layer="offline-hybrid"/);
  assert.match(html, /offline-hybrid-map\.js/);
  assert.match(html, /offline-hybrid-map\.css/);
  assert.match(html, /data-layer="satellite"/);
  assert.match(html, /data-layer="political"/);
});

test("detailed real imagery is the primary layer, with NASA raster fallback", () => {
  assert.match(js, /ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile/);
  assert.match(js, /assets\.science\.nasa\.gov/);
  assert.match(js, /NASA Blue Marble: Next Generation/);
  assert.match(js, /indexedDB/);
  assert.match(js, /CACHE_KEY/);
  assert.match(js, /L\.GridLayer\.extend/);
  assert.match(js, /sourceYForMercatorPixel/);
  assert.match(js, /zIndex:\s*180/);
  assert.match(js, /zIndex:\s*230/);
  assert.match(js, /fillOpacity:\s*hasImagery\s*\?\s*0\.055/);
});

test("country geometry remains the canonical interactive GeoJSON layer", () => {
  assert.match(js, /Game\.geojsonLayer/);
  assert.match(js, /countries\.eachLayer/);
  assert.match(js, /originalRenderGeoJSON\.apply/);
  assert.match(js, /originalSelectCountry\.apply/);
  assert.match(html, /resource_ministry_engine\.js/);
  assert.match(html, /map-engine-2\.js/);
  const parsed = JSON.parse(world);
  assert.equal(parsed.type, "FeatureCollection");
  assert.ok(Array.isArray(parsed.features));
  assert.ok(parsed.features.length > 100);
});

test("latitude and longitude graticule stays subtle and accurate", () => {
  assert.match(js, /L\.polyline/);
  assert.match(js, /longitudeText/);
  assert.match(js, /latitudeText/);
  assert.match(js, /lon \+= 30/);
  assert.match(js, /parallel \+= 15/);
  assert.match(css, /omega-offline-coordinate-label/);
});

test("Android prefers real imagery and can cache its overview fallback", () => {
  assert.match(js, /if \(window\.OMEGA_ANDROID_OFFLINE\) activate\(\)/);
  assert.match(js, /if \(active && !blueMarbleImage\)/);
  assert.match(js, /first online connection is needed to cache/);
  assert.match(css, /omega-offline-hybrid-active/);
  assert.doesNotMatch(css, /animation:\s*resMarkerPulse/);
  assert.match(mapEngine, /permitSatelliteInOfflineShell/);
});


test("Android WebView allows real map imagery requests through to the network", () => {
  assert.doesNotMatch(mainActivity, /h\.equals\("server\.arcgisonline\.com"\)/);
  assert.doesNotMatch(mainActivity, /basemaps\.cartocdn\.com/);
  assert.match(mainActivity, /h\.equals\("unpkg\.com"\)/);
  assert.match(mainActivity, /intercept map imagery/i);
});

test("imagery failures do not substitute fake map tiles", () => {
  assert.doesNotMatch(js, /SATELLITE TILE/);
  assert.doesNotMatch(js, /data:image\/svg\+xml/);
  assert.match(js, /tileerror/);
  assert.match(js, /cached global raster will be used/);
});
