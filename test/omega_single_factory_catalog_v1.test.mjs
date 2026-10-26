import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const readText = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const readJson = name => JSON.parse(readText(name));
const catalog = readJson('resource_industrial_catalog_v1.json');
const canonicalIds = Object.keys(catalog.factoryProfiles).sort();
function makeScreen(playerCountryId) {
  const context = { console, Intl, OmegaResourceIndustrialCatalogData: catalog,
    Game: { state: { simulation: { turn: 1, playerCountryId }, resource: {}, economy: {} } },
    addEventListener() {}, removeEventListener() {} };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readText('omega_ui_v2/screens/industry.js'), context);
  return context.OmegaUIV2Industry;
}
test('one canonical 21-type factory catalog supplies cards for every selected country', () => {
  assert.equal(canonicalIds.length, 21);
  assert.ok(catalog.factoryProfiles.UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT);
  assert.equal(Object.keys(catalog.factoryTypeAliases).length, 39);
  const source = readText('omega_ui_v2/screens/industry.js');
  assert.match(source, /Object\.keys\(profiles\)\.map\(function \(rawType\)/);
  assert.match(source, /function factoryTypeCatalogMarkup\(model\)/);
  assert.match(source, /rows\.map\(function \(item\) \{ return factoryTypeCard\(item, model\); \}\)/);
  for (const country of ['BGD', 'USA', 'CHN', 'BRA', 'ZAF']) {
    const api = makeScreen('BGD');
    const model = api.buildViewModel({ countryId: country });
    assert.equal(model.factoryTypeCatalog.length, 21, country + ' must load all 21 cards');
    assert.deepEqual(Array.from(model.factoryTypeCatalog, row => row.type).sort(), canonicalIds);
  }
});
