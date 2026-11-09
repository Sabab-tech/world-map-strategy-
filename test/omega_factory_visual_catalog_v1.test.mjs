import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";

const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync(path.join(root, "resource_industrial_catalog_v1.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "omega_factory_visual_catalog_v1.json"), "utf8"));

test("factory visual manifest maps every canonical factory profile to a relevant image", async () => {
  const profileIds = Object.keys(catalog.factoryProfiles || {}).sort();
  const mappedIds = Object.keys(manifest.factoryTypes || {}).sort();
  assert.equal(profileIds.length, 21, "canonical factory profile count changed; review visual mappings");
  assert.deepEqual(mappedIds, profileIds, "every canonical factory profile must have one visual mapping");
  assert.equal(manifest.visuals.length, 25, "the visual atlas should expose 25 industrial scenes");

  const visualIds = new Set();
  manifest.visuals.forEach((visual, index) => {
    assert.ok(visual.id && visual.label && visual.asset, "visual entries must be complete");
    assert.ok(!visualIds.has(visual.id), "visual ids must be unique");
    visualIds.add(visual.id);
    assert.equal(visual.atlasColumns, 5);
    assert.equal(visual.atlasRows, 2);
    assert.equal(visual.cellWidth, 64);
    assert.equal(visual.cellHeight, 40);
    assert.equal(visual.sourceCellIndex, index);
    assert.equal(visual.atlasColumn, index % 10 % 5);
    assert.equal(visual.atlasRow, Math.floor((index % 10) / 5));
    const bytes = fs.readFileSync(path.join(root, visual.asset));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", "atlas must be a binary RIFF file");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", "atlas must be a WebP image");
  });

  for (const id of profileIds) {
    const profile = manifest.factoryTypes[id];
    assert.ok(visualIds.has(profile.visualId), id + " must reference a declared image");
    assert.ok(profile.altText && profile.altText.length > 0, id + " needs accessible alt text");
  }

  for (const [recipeId, recipe] of Object.entries(catalog.downstreamFactoryRecipes || {})) {
    if (recipe.factoryType) assert.ok(manifest.factoryTypes[recipe.factoryType], recipeId + " references a type without a factory image");
  }

  const context = {
    fetch: async () => ({ ok:true, json:async () => manifest }),
    document:null
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "omega_factory_visual_catalog_v1.js"), "utf8"), context);
  const api = context.OmegaFactoryVisualCatalog;
  assert.ok(api, "factory visual API must register");
  await api.ready();

  for (const id of profileIds) {
    const resolved = api.resolve(id);
    assert.ok(resolved, id + " must resolve to a sprite position");
    assert.ok(resolved.asset.includes("omega_factory_atlas_"), id + " must point to a committed offline atlas");
    const html = api.render(id, manifest.factoryTypes[id].altText);
    assert.ok(html.includes('class="omega-factory-visual"'));
    assert.ok(html.includes('data-factory-type="' + id + '"'));
  }

  assert.deepEqual(manifest.factoryTypeAliases, catalog.factoryTypeAliases, "visual and production aliases must stay synchronized");
  for (const [alias, canonical] of Object.entries(manifest.factoryTypeAliases || {})) {
    assert.ok(manifest.factoryTypes[canonical], alias + " must point to a canonical visual type");
    const resolved = api.resolve(alias);
    assert.ok(resolved, alias + " must resolve through its compatibility alias");
    assert.equal(resolved.type, canonical, alias + " should resolve to the canonical type");
  }
  assert.equal(api.resolve("LITHIUM_CONVERSION_PLANT").type, "UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT");
  assert.equal(api.resolve("MINERAL_PROCESSING_PLANT").type, "UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT");

  const sample = api.resolve("STEEL_AND_ALLOY_WORKS");
  const attrs = { "data-factory-type":"STEEL_AND_ALLOY_WORKS", "data-factory-label":"Steel mill preview" };
  const node = {
    style:{}, dataset:{}, title:"",
    getAttribute:(key) => attrs[key] || null,
    setAttribute:(key,value) => { attrs[key] = value; }
  };
  assert.equal(api.apply(node), true);
  assert.ok(node.style.backgroundImage.includes(sample.asset));
  assert.equal(node.style.backgroundSize, "500% 200%");
  assert.equal(attrs["aria-label"], "Steel mill preview");
});
