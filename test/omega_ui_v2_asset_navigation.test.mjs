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

test("Atlas Command uses the layered navy and steel-silver palette with distinct section accents", () => {
  const css = read("omega_ui_v2/atlas-command-polish.css");
  assert.match(css, /--omega-v2-bg:\s*#071426/i, "deep navy is the foundation");
  assert.match(css, /--omega-v2-accent:\s*#c9d5e3/i, "silver is a dedicated accent");
  assert.match(css, /--omega-v2-accent-blue:\s*#77c8f2/i, "signal blue is distinct from the silver accent");
  assert.match(css, /\.omega-v2-kpi:nth-child\(3n \+ 1\)/);
  assert.match(css, /\.omega-v2-kpi:nth-child\(3n \+ 2\)/);
  assert.match(css, /\.omega-v2-kpi:nth-child\(3n\)/, "metric cards use more than one accent color");
  assert.match(css, /\.omega-v2-button--primary[\s\S]*border-color:\s*#77b9df/i);
  assert.match(css, /\.omega-v2-button--accent[\s\S]*color:\s*#0a1b2d/i, "selected controls use high-contrast silver");
  assert.match(css, /@media\s*\(max-width:\s*420px\)/, "small-phone layout must remain responsive");
  assert.match(css, /min-height:\s*44px/, "tap targets remain touch-friendly");
});

test("ministry details separate Overview, Operations, Assets, Budget and Reports", () => {
  const detail = read("omega_ui_v2/screens/ministry-detail.js");
  assert.match(detail, /dashboard:'Overview'/);
  assert.match(detail, /operations:'Operations'/);
  assert.match(detail, /assets:'People & Assets'/);
  assert.match(detail, /budget:'Budget & Finance'/);
  assert.match(detail, /reports:'Reports & Data'/);
  assert.match(detail, /function sectionForField\(/);
  assert.match(detail, /function rowsForSection\(/);
  assert.match(detail, /var sectionRows = rowsForSection\(rawRows, section\)/);
  assert.match(detail, /sectionRows\.map\(function \(item\)/);
  assert.doesNotMatch(detail, /V2 CONTROLS ONLY|Legacy screen navigation is disconnected/);
});

test("player-facing screens avoid raw debug dumps and use readable resource-status labels", () => {
  const app = read("omega_ui_v2/app.js");
  const government = read("omega_ui_v2/screens/government.js");
  const industry = read("omega_ui_v2/screens/industry.js");
  const resource = read("omega_ui_v2/screens/resource-ministry.js");
  const mine = read("omega_ui_v2/screens/mine-detail.js");
  const homeAffairs = read("omega_ui_v2/screens/home-affairs.js");
  const reports = read("omega_ui_v2/screens/reports.js");
  assert.doesNotMatch(app, /simulated treasury values/i);
  assert.doesNotMatch(government, /Profile label:|current simulation\./i);
  assert.doesNotMatch(industry, /JSON\.stringify\(outputs,\s*null,\s*2\)/);
  assert.doesNotMatch(resource, /labeled MODELED/i);
  assert.doesNotMatch(mine, /· MODELED|Quantitative provenance:/i);
  assert.doesNotMatch(homeAffairs, /retired console|canonical runtime/i);
  assert.doesNotMatch(reports, /source runtime|Open source report/i);
  assert.match(resource, /SIMULATED:'Estimated'/);
  assert.match(mine, /MODELED:'Estimated'/);
});
