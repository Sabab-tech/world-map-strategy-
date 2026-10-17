import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

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
  assert.match(js, /first online connection is needed to fetch/);
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
  assert.doesNotMatch(mapEngine, /errorTileUrl:\s*['"]data:image\/svg\+xml/i);
  assert.doesNotMatch(mapEngine, /<text[^>]*>SATELLITE TILE<\\/text>/i);
  assert.match(mapEngine, /tileerror/);
  assert.match(js, /cached global raster will be used/);
});

test("a late failed raster request cannot overwrite status after leaving atlas mode", () => {
  assert.match(js, /if \(!active\) return;[\s\S]*?offlineRasterCached:\s*textureStored/);
  assert.match(js, /if \(active\) attachBlueMarbleFallback\(\)/);
  assert.match(js, /if \(!button \|\| button\.disabled\) return/);
});


test("Chrome mobile layer drawer fits the visible viewport and supports vertical touch scrolling", () => {
  assert.match(css, /#layers-drawer\s*\{[\s\S]*?z-index:\s*100100\s*!important/);
  assert.match(css, /height:\s*calc\(var\(--omega-visible-height,\s*100dvh\)/);
  assert.match(css, /#layers-drawer \.drawer-body\.layer-options-grid\s*\{[\s\S]*?overflow-y:\s*auto\s*!important/);
  assert.match(css, /overscroll-behavior-y:\s*contain\s*!important/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch\s*!important/);
  assert.match(js, /function updateVisibleViewportSize/);
  assert.match(js, /window\.visualViewport\.addEventListener\("resize", updateVisibleViewportSize/);
});

test("map layer buttons have a reliable capture-phase click route", () => {
  assert.match(js, /function handleLayerOptionClick/);
  assert.match(js, /document\.addEventListener\("click", handleLayerOptionClick, true\)/);
  assert.match(js, /stopImmediatePropagation/);
  assert.match(js, /window\.OmegaOfflineHybridAtlas\.activate\(\)/);
  assert.match(css, /#layers-drawer \.layer-opt-btn[\s\S]*?pointer-events:\s*auto\s*!important/);
  assert.match(css, /touch-action:\s*manipulation\s*!important/);
});

test("layer drawer click routing executes the controller and tracks the visible Chrome viewport", () => {
  const listeners = {};
  const viewportVars = {};
  let switchedLayer = null;
  const makeButton = (layer, initiallyActive = false) => {
    const attributes = { "data-layer": layer, "aria-pressed": String(initiallyActive) };
    const classes = new Set(initiallyActive ? ["active"] : []);
    return {
      disabled: false,
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
          const next = force === undefined ? !classes.has(name) : Boolean(force);
          if (next) classes.add(name);
          else classes.delete(name);
          return next;
        }
      },
      getAttribute(name) { return attributes[name] ?? null; },
      setAttribute(name, value) { attributes[name] = String(value); },
      closest(selector) { return selector.includes("#layers-drawer") ? this : null; },
      _attributes: attributes,
      _classes: classes
    };
  };
  const atlasButton = makeButton("offline-hybrid");
  const politicalButton = makeButton("political", true);
  const buttons = [atlasButton, politicalButton];
  const Game = {
    Map: { renderGeoJSON() {} },
    geojsonLayer: null,
    selectedLayer: null,
    selectCountryByName() {},
    findCountryConfig() { return null; },
    showNotification() {},
    switchMapLayer(layer) { switchedLayer = layer; }
  };
  const map = { on() {} };
  const visualViewport = {
    height: 436,
    offsetTop: 0,
    addEventListener() {}
  };
  const window = {
    L: {},
    Game,
    map,
    visualViewport,
    addEventListener() {},
    OMEGA_ANDROID_OFFLINE: false
  };
  const document = {
    addEventListener(type, handler) { listeners[type] = handler; },
    documentElement: {
      style: { setProperty(name, value) { viewportVars[name] = value; } }
    },
    body: { classList: { add() {}, remove() {} } },
    querySelector() { return atlasButton; },
    querySelectorAll() { return buttons; }
  };
  runInNewContext(js, { window, document, L: window.L, Game, navigator: { onLine: false }, console });

  assert.equal(viewportVars["--omega-visible-height"], "436px");
  assert.equal(viewportVars["--omega-visible-offset-top"], "0px");
  let defaultPrevented = false;
  let propagationStopped = false;
  let immediatePropagationStopped = false;
  listeners.click({
    target: politicalButton,
    preventDefault() { defaultPrevented = true; },
    stopPropagation() { propagationStopped = true; },
    stopImmediatePropagation() { immediatePropagationStopped = true; }
  });
  assert.equal(switchedLayer, "political");
  assert.equal(defaultPrevented, true);
  assert.equal(propagationStopped, true);
  assert.equal(immediatePropagationStopped, true);
  assert.equal(politicalButton._attributes["aria-pressed"], "true");
  assert.equal(atlasButton._attributes["aria-pressed"], "false");

  politicalButton.disabled = true;
  switchedLayer = null;
  listeners.click({
    target: politicalButton,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {}
  });
  assert.equal(switchedLayer, null);
});
