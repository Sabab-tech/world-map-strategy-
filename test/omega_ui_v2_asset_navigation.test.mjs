import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const json = (name) => JSON.parse(read(name));

test("local photo catalog starts loading at boot and exposes bundled images", async () => {
  const catalog = json("omega_ui_photo_asset_catalog_v1.json");
  const events = [];
  let fetchCalls = 0;
  const window = {
    fetch: async (url, options) => {
      fetchCalls += 1;
      assert.equal(url, "./omega_ui_photo_asset_catalog_v1.json");
      assert.equal(options.cache, "force-cache");
      return { ok: true, json: async () => catalog };
    },
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    dispatchEvent: (event) => events.push(event.type)
  };
  const sandbox = { window };
  vm.runInNewContext(read("omega_ui_photo_asset_system_v1.js"), sandbox);

  const api = window.OmegaUIPhotoAssets;
  assert.ok(api, "photo registry must be available after its script loads");
  assert.equal(fetchCalls, 1, "the catalog should begin loading automatically at app boot");
  await api.ready();
  assert.equal(api.list().length, catalog.items.length);
  assert.equal(api.get("bangladesh-parliament").path, "assets/ui-photos/bangladesh-parliament.webp");
  assert.equal(api.get("mosque-architecture").path, "assets/ui-photos/mosque-architecture.webp");
  assert.equal(api.diagnostics().ready, true);
  assert.ok(events.includes("omega:ui-photo-assets-ready"));
});

test("every image referenced by the canonical 18-ministry visual registry exists locally", () => {
  const source = read("omega_ui_v2/ministry-visual-registry.js");
  const paths = [...new Set([...source.matchAll(/'(assets\/[A-Za-z0-9_ .()\/-]+\.(?:webp|png|jpe?g|svg))'/gi)].map((match) => match[1]))];
  assert.ok(paths.length >= 18, "the registry should provide visual coverage for the canonical ministry set");
  const missing = [];
  for (const relative of paths) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile() || fs.statSync(absolute).size === 0) {
      missing.push(relative);
    }
  }
  assert.deepEqual(missing, [], "visual-registry paths must point to non-empty repository assets");
});

test("More command cards use the uploaded local imagery and every action has a delegated handler", () => {
  const app = read("omega_ui_v2/app.js");
  const html = read("index.html");
  const css = read("omega_ui_v2/atlas-command-polish.css");
  const requiredUploadedAssets = [
    "assets/factories/omega_factory_atlas_01.webp",
    "assets/images (15).jpeg",
    "assets/China_Military_Facilities_What_Satellites_Reveal_f6efe2c1b2.jpg",
    "assets/images (17).jpeg",
  ];
  for (const asset of requiredUploadedAssets) {
    assert.ok(app.includes(asset), "command card must use the mapped upload: " + asset);
    const absolute = path.join(root, asset);
    assert.ok(fs.existsSync(absolute) && fs.statSync(absolute).size > 0, "uploaded image must exist: " + asset);
  }

  assert.ok(read("omega_ui_v2/ministry-visual-registry.js").includes("assets/factories/omega_factory_atlas_03.webp"), "additional factory atlas images must stay connected to a local ministry gallery");
  assert.ok(app.includes("data-omega-v2-global-nav"));
  assert.ok(app.includes("data-omega-v2-more-ministry"));
  assert.ok(app.includes("target.closest('[data-omega-v2-global-nav]')"), "global navigation buttons must have a delegated click handler");
  assert.ok(app.includes("target.closest('[data-omega-v2-more-ministry]')"), "ministry buttons must have a delegated click handler");
  assert.ok(app.includes("target.closest('[data-omega-v2-back]')"), "Back must be actionable");
  assert.ok(app.includes("target.closest('[data-omega-v2-exit]')"), "Exit must be actionable");
  assert.ok(app.includes("function navigate(root, route)"));
  assert.ok(app.includes("function back(root)"));
  assert.ok(app.includes("function exitToMap(root)"));

  const baseCssIndex = html.indexOf('href="omega_ui_v2/omega-ui-v2.css"');
  const refreshCssIndex = html.indexOf('href="omega_ui_v2/ministry-visual-refresh.css"');
  const polishCssIndex = html.indexOf('href="omega_ui_v2/atlas-command-polish.css"');
  assert.ok(baseCssIndex >= 0 && refreshCssIndex > baseCssIndex && polishCssIndex > refreshCssIndex,
    "responsive overrides must load after the existing UI styles");
  assert.match(css, /\.omega-v2-app-main[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /@media\s*\(max-width:\s*420px\)/);
  assert.match(css, /touch-action:\s*manipulation/);
});

test("government and ministry detail screens render local photo paths before the async catalog resolves", () => {
  const government = read("omega_ui_v2/screens/government.js");
  const details = read("omega_ui_v2/screens/ministry-detail.js");
  assert.ok(government.includes("assets/ui-photos/' + safeId + '.webp"));
  assert.ok(details.includes("assets/ui-photos/' + safeId + '.webp"));
  assert.match(government, /loading="lazy" decoding="async"/);
  assert.match(details, /loading="lazy" decoding="async"/);
});


test("all 18 ministries have distinct local logos, and Education uses education-specific artwork offline", () => {
  const registrySource = read("omega_ui_v2/ministry-visual-registry.js");
  const entries = [...registrySource.matchAll(/^ {4}([a-z_]+): \{([^}\n]+)\},?$/gm)];
  assert.equal(entries.length, 18, "all canonical ministry visual records must be found");
  const logoMap = new Map();
  for (const [, id, body] of entries) {
    const match = body.match(/\blogo:'([^']+)'/);
    assert.ok(match, id + " must map a ministry logo rather than a portrait or generic glyph");
    const logo = match[1];
    assert.ok(logo.startsWith("assets/"), id + " logo must be bundled locally");
    const file = path.join(root, logo);
    assert.ok(fs.existsSync(file) && fs.statSync(file).size > 0, id + " logo must exist: " + logo);
    if (/\.svg$/i.test(logo)) {
      assert.match(fs.readFileSync(file, "utf8"), /<svg\b/, id + " logo must be valid SVG source");
    } else {
      assert.match(logo, /\.jpe?g$/i, id + " must only use a known uploaded raster logo");
    }
    assert.equal([...logoMap.values()].includes(logo), false, id + " must not reuse another ministry's logo");
    logoMap.set(id, logo);
  }
  assert.equal(logoMap.size, 18, "every ministry must receive a unique logo assignment");
  assert.equal(logoMap.get("defense"), "assets/Military_Ministry_Logo_Concept_A.png.jpg",
    "preserve the provided Defense Ministry logo");
  assert.equal(logoMap.get("foreign_affairs"), "assets/IMG_20260703_180105.jpg",
    "preserve the provided Foreign Affairs emblem");
  assert.equal(logoMap.get("health_welfare"), "assets/ministers/health.svg",
    "preserve the existing Health Ministry emblem");
  const education = entries.find(([, id]) => id === "education")[2];
  assert.match(education, /image:'assets\/ui-photos\/education-university\.svg'/);
  assert.match(education, /logo:'assets\/ministry-logos\/education\.svg'/);
  assert.doesNotMatch(education, /dhaka-skyline/);
  const worker = read("omega-offline-map-sw.js");
  assert.match(worker, /omega-offline-atlas-shell-v37/);
  for (const logo of logoMap.values()) {
    assert.ok(worker.includes('"./' + logo + '"'), "offline shell must cache every ministry logo: " + logo);
  }
  assert.ok(worker.includes('"./assets/ui-photos/education-university.svg"'),
    "education artwork must be available offline");
});
