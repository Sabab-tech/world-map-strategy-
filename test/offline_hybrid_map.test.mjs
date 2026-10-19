import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const [html, js, css, world, mapEngine, mainActivity, serviceWorker] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../offline-hybrid-map.js", import.meta.url), "utf8"),
  readFile(new URL("../offline-hybrid-map.css", import.meta.url), "utf8"),
  readFile(new URL("../world.json", import.meta.url), "utf8"),
  readFile(new URL("../map-engine-1.js", import.meta.url), "utf8"),
  readFile(new URL("../android/app/src/main/java/com/omega/globalsupremecommander/MainActivity.java", import.meta.url), "utf8"),
  readFile(new URL("../omega-offline-map-sw.js", import.meta.url), "utf8")
]);

test("offline map has a Bengali label and stays in the existing satellite control", () => {
  assert.match(html, /id="btn-quick-layers"[^>]*title="অফলাইন মানচিত্র[^"]*"[^>]*aria-label="অফলাইন মানচিত্র/);
  assert.match(html, /class="layer-opt-btn offline-hybrid-opt" data-layer="offline-hybrid" aria-pressed="false" title="অফলাইন বিশ্বমানচিত্র">🛰️ অফলাইন মানচিত্র<\/button>/);
  assert.ok(
    html.indexOf('data-layer="offline-hybrid"') < html.indexOf('data-layer="satellite"'),
    "Offline Map must remain the first option in the existing satellite/layer drawer."
  );
});

test("hybrid atlas uses existing map-layer controls and stylesheet", () => {
  assert.match(html, /data-layer="offline-hybrid"/);
  assert.match(html, /offline-hybrid-map\.js/);
  assert.match(html, /offline-hybrid-map\.css/);
  assert.match(html, /data-layer="satellite"/);
  assert.match(html, /data-layer="political"/);
});

test("offline atlas renders locally and has no remote imagery dependency", () => {
  assert.doesNotMatch(js, /https?:\/\//i);
  assert.doesNotMatch(js, /\bfetch\s*\(/i);
  assert.doesNotMatch(js, /indexedDB|CACHE_KEY|NASA Blue Marble|ArcGIS|L\.tileLayer/i);
  assert.match(js, /function createOfflineOceanLayer/);
  assert.match(js, /L\.GridLayer\.extend/);
  assert.match(js, /externalMapRequests:0/);
  assert.match(js, /boundarySource:"Existing OMEGA world\.json"/);
  assert.match(mapEngine, /window\.satelliteLayer = null/);
  assert.match(mapEngine, /const offlineShell = Boolean\(window\.OMEGA_ANDROID_OFFLINE\)/);
  assert.doesNotMatch(mapEngine, /permitSatelliteInOfflineShell/);
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

test("offline atlas starts without a first-online-load requirement", () => {
  assert.match(js, /function startOfflineAtlas\(\)\{syncButton\(\);activate\(\);\}/);
  assert.match(js, /document\.addEventListener\("DOMContentLoaded",startOfflineAtlas,\{once:true\}\)/);
  assert.doesNotMatch(js, /first online connection|NASA Blue Marble|cache unavailable/i);
  assert.match(js, /offlineBasemap:true/);
  assert.match(js, /externalMapRequests:0/);
  assert.match(css, /omega-offline-atlas-badge/);
});
test("Android WebView blocks remote basemap imagery as a safety net", () => {
  assert.match(mainActivity, /h\.equals\("server\.arcgisonline\.com"\)/);
  assert.match(mainActivity, /h\.equals\("assets\.science\.nasa\.gov"\)/);
  assert.match(mainActivity, /h\.equals\("tile\.opentopomap\.org"\)/);
  assert.match(mainActivity, /h\.endsWith\("\.basemaps\.cartocdn\.com"\)/);
  assert.match(mainActivity, /block external basemap imagery/i);
  assert.match(mainActivity, /h\.equals\("unpkg\.com"\)/);
});
test("the offline atlas never substitutes a fake remote imagery tile", () => {
  assert.doesNotMatch(js, /https?:\/\//i);
  assert.doesNotMatch(js, /SATELLITE TILE|data:image\/svg\+xml/i);
  assert.doesNotMatch(mapEngine, /errorTileUrl:\s*['"]data:image\/svg\+xml/i);
  assert.match(mapEngine, /window\.OmegaOfflineHybridAtlas\.activate/);
  assert.match(mainActivity, /h\.equals\("tile\.opentopomap\.org"\)/);
});
test("browser shell resources are cached locally for offline relaunch", () => {
  assert.match(html, /navigator\.serviceWorker\.register\('\.\/omega-offline-map-sw\.js'/);
  assert.match(serviceWorker, /CORE_ASSETS/);
  assert.match(serviceWorker, /omega_finance_ministry_runtime_v1\.js/);
  assert.match(serviceWorker, /omega_finance_ministry_v1\.css/);
  assert.match(serviceWorker, /economy_global_profiles_v1\.json/);
  assert.match(serviceWorker, /finance_runtime_rules_v1\.json/);
  assert.match(serviceWorker, /finance_sector_registry_v1\.json/);
  assert.match(serviceWorker, /omega_macro_stability_runtime_v1\.js/);
  assert.match(serviceWorker, /omega_macro_stability_v1\.css/);
  assert.match(serviceWorker, /economy_raw_financial_data_v2\.json/);
  assert.match(serviceWorker, /finance_macro_stability_rules_v1\.json/);
  assert.match(serviceWorker, /omega-offline-atlas-shell-v6/);
  assert.ok(serviceWorker.includes('omega_home_ministry_training_materials_runtime_v1.js'));
  assert.ok(serviceWorker.includes('omega_home_ministry_training_recruitment_level_baseline_v1.json'));
  assert.match(serviceWorker, /omega_home_ministry_country_police_baseline_v1[.]json/);
  assert.match(serviceWorker, /omega_home_ministry_police_operations_ui_v1[.]js/);
  assert.match(serviceWorker, /military_command_catalog_v1[.]json/);
  assert.match(serviceWorker, /omega_government_banking_runtime_v1[.]js/);
  assert.match(serviceWorker, /omega_economic_transmission_runtime_v1[.]js/);
  assert.match(serviceWorker, /government_banking_rules_v1[.]json/);
  assert.match(serviceWorker, /financial_transmission_rules_v1[.]json/);
  assert.match(serviceWorker, /self\.addEventListener\("install"/);
  assert.match(serviceWorker, /self\.addEventListener\("fetch"/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(serviceWorker, /server\.arcgisonline\.com|assets\.science\.nasa\.gov/);
});
test("Chrome mobile layer drawer fits the visible viewport and supports vertical touch scrolling", () => {
  assert.match(css, /#layers-drawer\s*\{[\s\S]*?z-index:\s*100100\s*!important/);
  assert.match(css, /height:\s*calc\(var\(--omega-visible-height,\s*100dvh\)/);
  assert.match(css, /#layers-drawer \.drawer-body\.layer-options-grid\s*\{[\s\S]*?overflow-y:\s*auto\s*!important/);
  assert.match(css, /overscroll-behavior-y:\s*contain\s*!important/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch\s*!important/);
  assert.match(js, /function updateVisibleViewportSize/);
  assert.match(js, /window\.visualViewport\.addEventListener\("resize",\s*updateVisibleViewportSize/);
});

test("map layer buttons have a reliable capture-phase click route", () => {
  assert.match(js, /function handleLayerOptionClick/);
  assert.match(js, /document\.addEventListener\("click",\s*handleLayerOptionClick,\s*true\)/);
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
  runInNewContext(js, { window, document, L: window.L, Game, navigator: { onLine: true }, console });

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
