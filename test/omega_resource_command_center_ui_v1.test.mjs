import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync('omega_resource_command_center_ui_v1.js', 'utf8');
const ministry = fs.readFileSync('ministry_engine.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
await import('../omega_resource_command_center_ui_v1.js');
const commandCenter = globalThis.OmegaResourceCommandCenterUI;

test('all sixteen resource cards have a dedicated command-center panel', () => {
  for (const id of ['matrix','ontology','reserves','deposits','extraction','processing','inventory','logistics','industrial','market','trade','value','cascade','cognitive','power','environment']) {
    assert.match(ui, new RegExp("id: '" + id + "'"));
    assert.match(ui, new RegExp("case '" + id + "'"));
  }
  assert.match(ui, /data-search-item/);
  assert.match(ui, /omega-rescc-search/);
  assert.match(ui, /omega-rescc-country/);
});

test('deposit panel is an explicit country-scoped exact-site locator, not a generic deposit dump', () => {
  assert.match(ui, /function panelDeposits\(country\)/);
  const panel = ui.slice(ui.indexOf('function panelDeposits(country)'), ui.indexOf('function siteRows(country)', ui.indexOf('function panelDeposits(country)')));
  assert.match(panel, /siteRows\(selected\)/, 'site results must come from the existing canonical site registry');
  assert.match(panel, /Find a specific mine or field/);
  assert.match(panel, /Locate this site/);
  assert.match(panel, /Site ID/);
  assert.match(ui, /label class="omega-rescc-control-label" for="omega-rescc-country">Country/);
  assert.match(ui, /Mine, oil field, gas field or resource/);
  assert.match(ui, /action === 'focus-site'/);
  assert.match(ui, /binding\.locate\(siteId\)/, "exact-site actions must use the canonical site's locate API");
  assert.match(readTestFile('omega_resource_gameplay_binding_v1.js'), /locate:locateSite/,
    'the canonical site binding must expose the map locate operation');
});

function readTestFile(path) {
  return fs.readFileSync(path, 'utf8');
}

test('resource-wide navigation clearly differs from exact mine or field location', () => {
  assert.match(ui, /Show matching sites/);
  assert.match(ui, /Locate this site/);
});

test('legacy p05/p06/p15/p16 cards route to panels instead of unsupported fake build successes', () => {
  assert.match(ui, /p05: 'extraction'/);
  assert.match(ui, /p06: 'processing'/);
  assert.match(ui, /p15: 'power'/);
  assert.match(ui, /p16: 'environment'/);
  assert.match(ui, /cabinet\.executeResource16Point = function/);
  assert.match(ui, /AUTHORITATIVE TIME-SERIES NOT AVAILABLE/);
  assert.doesNotMatch(ui, /Math\.random\(/);
  assert.ok(ministry.includes("executeResource16Point('p05', 'drill_oil')"));
  assert.ok(ministry.includes("executeResource16Point('p16', 'build_solar')"));
});

test('the resource command-center UI is loaded after the authoritative runtimes', () => {
  const uiTag = html.indexOf('omega_resource_command_center_ui_v1.js');
  assert.ok(uiTag >= 0, 'new UI bridge must be loaded');
  for (const name of ['omega_resource_authoritative_adapter.js','omega_resource_action_execution_runtime.js','omega_global_market_system.js','omega_global_trade_system.js']) {
    assert.ok(html.indexOf(name) >= 0 && html.indexOf(name) < uiTag, name + ' must load before the UI bridge');
  }
});

test('action feedback requires a real runtime result and records reference-only market liquidity', () => {
  assert.match(ui, /acceptedFalse/);
  assert.match(ui, /r\.industrialNetwork \|\| \{\}/);
  assert.match(ui, /NO_COMPATIBLE_FACTORY/);
  assert.match(ui, /ALL_12_QUESTIONS_REQUIRE_ANSWERS/);
});

test('each numbered legacy card maps explicitly to its intended panel, independent of active category filters', () => {
  const pointBlock = ui.slice(ui.indexOf('const panelByPoint = {'), ui.indexOf('};', ui.indexOf('const panelByPoint = {')) + 2);
  const mappings = [...pointBlock.matchAll(/'(\d{2})': '([a-z]+)'/g)].map((m) => [m[1], m[2]]);
  assert.equal(mappings.length, 16);
  assert.deepEqual(mappings, [
    ['01','matrix'],['02','ontology'],['03','reserves'],['04','deposits'],
    ['05','extraction'],['06','processing'],['07','inventory'],['08','logistics'],
    ['09','industrial'],['10','market'],['11','trade'],['12','value'],
    ['13','cascade'],['14','cognitive'],['15','power'],['16','environment']
  ]);
  assert.match(ui, /const routeCountry = activeCountry\(this\.activeCountry \|\| countryId\)/);
  assert.match(ui, /network\.candidateFactories\(country, resourceId\)/);
});

test('metrology converter handles matching dimensions and blocks dimension mismatches', () => {
  assert.ok(commandCenter && typeof commandCenter.convertUnits === 'function');
  assert.equal(commandCenter.convertUnits(1000, 'kg', 'metric_tonne').value, 1);
  assert.equal(commandCenter.convertUnits(1, 'bbl', 'litre').value, 158.987294928);
  assert.equal(commandCenter.convertUnits(1, 'mmbtu', 'gj').value, 1.05505585262);
  assert.equal(commandCenter.convertUnits(1, 'kg', 'gj').reason, 'UNIT_DIMENSION_MISMATCH');
  assert.equal(commandCenter.convertUnits('not-a-number', 'kg', 'lb').reason, 'FINITE_QUANTITY_REQUIRED');
});

test('actual industrial flow and technology project state paths are rendered', () => {
  assert.match(ui, /r\.industrialNetwork \|\| \{\}/);
  assert.match(ui, /industrialState\.siteFlowLedger/);
  assert.match(ui, /technology project contracts/i);
  assert.match(ui, /Resource research runtime projects/);
  assert.match(ui, /data-search-item data-form=/);
});


test('resource panels avoid navigation clutter, raw diagnostics, and pinned top content', () => {
  assert.ok(ui.includes('omega-rescc-panel-select'));
  assert.ok(ui.includes('overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain'));
  assert.ok(ui.includes("'.omega-rescc-content{flex:0 0 auto;min-height:0;min-width:0;overflow:visible;"));
  assert.ok(ui.includes("'.omega-rescc-note{display:none!important}'"));
  assert.ok(ui.includes("function diagnosticCard() { return ''; }"));
  assert.ok(ui.includes("(lastOutcome ? '<div id=\"omega-rescc-status\""));
  assert.equal(ui.includes("Panel: ' + viewTitle(activePanel)"), false);
});
