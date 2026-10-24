import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const json = (name) => JSON.parse(read(name));
const sources = json("omega_ui_photo_asset_sources_v1.json");
const catalog = json("omega_ui_photo_asset_catalog_v1.json");

test("photo library has unique, reviewed Wikimedia source identities and explicit license terms", () => {
  assert.equal(sources.schemaVersion, "1.0.0");
  assert.ok(sources.items.length >= 10);
  const ids = sources.items.map((item) => item.id);
  const files = sources.items.map((item) => item.filename);
  const urls = sources.items.map((item) => item.sourcePageUrl);
  assert.equal(new Set(ids).size, ids.length, "photo IDs must be unique");
  assert.equal(new Set(files).size, files.length, "photo output filenames must be unique");
  assert.equal(new Set(urls).size, urls.length, "source pages must be unique");
  for (const item of sources.items) {
    assert.match(item.sourcePageUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(item.author, item.id + " must record the original author");
    assert.ok(item.licenseId && item.licenseShortName && item.licenseUrl, item.id + " must record its license");
    assert.ok(item.acceptedApiLicenseNames.length > 0, item.id + " must fail closed to an explicit license allowlist");
    assert.ok(item.uiRoles.length > 0, item.id + " must declare intended UI roles");
    if (item.isCountrySpecific) assert.ok(item.countryScope, item.id + " needs a specific place/country scope");
  }
});

test("the generated catalog matches the source registry and committed WebP binaries", () => {
  assert.equal(catalog.schemaVersion, "1.0.0");
  assert.equal(catalog.itemCount, sources.items.length);
  assert.equal(catalog.items.length, sources.items.length);
  const catalogById = new Map(catalog.items.map((item) => [item.id, item]));
  let actualTotal = 0;
  for (const source of sources.items) {
    const item = catalogById.get(source.id);
    assert.ok(item, "catalog is missing " + source.id);
    assert.equal(item.sourcePageUrl, source.sourcePageUrl);
    assert.equal(item.author, source.author);
    assert.equal(item.licenseId, source.licenseId);
    assert.equal(item.licenseUrl, source.licenseUrl);
    assert.ok(item.width > 0 && item.height > 0);
    assert.ok(Math.max(item.width, item.height) <= 1280);
    assert.ok(item.byteSize > 0 && item.byteSize <= 409600, source.id + " exceeds 400 KiB");
    const relativePath = item.path;
    assert.match(relativePath, /^assets\/ui-photos\/[a-z0-9-]+\.webp$/);
    const absolutePath = path.join(root, relativePath);
    assert.ok(fs.existsSync(absolutePath), "missing committed photo asset: " + relativePath);
    const bytes = fs.readFileSync(absolutePath);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", relativePath + " is not a RIFF file");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", relativePath + " is not a WebP");
    assert.equal(bytes.length, item.byteSize, relativePath + " byte size is stale in catalog");
    actualTotal += bytes.length;
  }
  assert.equal(catalog.totalBytes, actualTotal, "catalog total size must match binary assets");
});

test("new photo library is linked to the UI and cached on request, not eagerly downloaded at boot", () => {
  const html = read("index.html");
  const serviceWorker = read("omega-offline-map-sw.js");
  const helper = read("omega_ui_photo_asset_system_v1.js");
  const css = read("omega_ui_photo_asset_system_v1.css");
  const overview = read("omega_country_overview_ministry_ui_v1.js");
  assert.match(html, /omega_ui_photo_asset_system_v1\.css/);
  assert.match(html, /omega_ui_photo_asset_system_v1\.js/);
  assert.match(html, /omega_ui_photo_asset_system_v1\.js[\s\S]*?omega_country_overview_ministry_ui_v1\.js/);
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*"omega-offline-atlas-shell-v\d+"/);
  assert.match(serviceWorker, /"\.\/omega_ui_photo_asset_catalog_v1\.json"/);
  assert.match(serviceWorker, /"\.\/omega_ui_photo_asset_system_v1\.js"/);
  assert.match(serviceWorker, /"\.\/omega_ui_photo_asset_system_v1\.css"/);
  const coreStart = serviceWorker.indexOf("const CORE_ASSETS");
  const coreEnd = serviceWorker.indexOf("];", coreStart);
  const core = serviceWorker.slice(coreStart, coreEnd);
  for (const item of catalog.items) assert.ok(!core.includes(item.path), item.path + " must not be an eager download at app boot");
  assert.match(serviceWorker, /webp/i, "the service worker must support caching requested WebP resources");
  assert.match(helper, /loading="lazy" decoding="async"/);
  assert.match(helper, /sourcePageUrl/);
  assert.match(helper, /licenseUrl/);
  assert.match(helper, /changesMade/);
  assert.match(css, /grid-template-columns/);
  assert.match(overview, /omega-ui-photo-reference-disclosure/);
  assert.match(overview, /omega-photo-gallery-mount/);
});

test("runtime helper rejects unsafe source paths and produces attribution-bearing local image markup", async () => {
  const events = [];
  const sandbox = {
    window: {
      fetch: async () => ({ ok: true, json: async () => catalog }),
      CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
      dispatchEvent: (event) => { events.push(event.type); },
    },
    globalThis: {},
    Object, String, Promise, Error, Array, RegExp, Number,
  };
  vm.runInNewContext(read("omega_ui_photo_asset_system_v1.js"), sandbox);
  const api = sandbox.window.OmegaUIPhotoAssets;
  assert.ok(api);
  await api.ready();
  assert.equal(api.list().length, sources.items.length);
  assert.ok(api.list("factories").length >= 1);
  const first = catalog.items[0];
  const markup = api.renderFigure(first.id);
  assert.ok(markup.includes("./" + first.path), "image URL must point to a local bundled asset");
  assert.ok(markup.includes(first.sourcePageUrl), "image credit must link its Commons source");
  assert.ok(markup.includes(first.licenseUrl), "image credit must link its license");
  assert.ok(markup.includes("loading=\"lazy\""));
  assert.ok(!markup.includes("upload.wikimedia.org"), "the runtime must not hot-link the image source");
  assert.ok(api.diagnostics().ready);
  assert.ok(events.includes("omega:ui-photo-assets-ready"));
});
