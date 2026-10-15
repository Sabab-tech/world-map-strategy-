import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync('omega_resource_command_center_ui_v1.js', 'utf8');
const ministry = fs.readFileSync('ministry_engine.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('all sixteen resource cards have a dedicated command-center panel', () => {
  for (const id of ['matrix','ontology','reserves','deposits','extraction','processing','inventory','logistics','industrial','market','trade','value','cascade','cognitive','power','environment']) {
    assert.match(ui, new RegExp("id: '" + id + "'"));
    assert.match(ui, new RegExp("case '" + id + "'"));
  }
  assert.match(ui, /data-search-item/);
  assert.match(ui, /omega-rescc-search/);
  assert.match(ui, /omega-rescc-country/);
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
  assert.match(ui, /referenceLiquidity === true/);
  assert.match(ui, /NO_COMPATIBLE_FACTORY/);
  assert.match(ui, /ALL_12_QUESTIONS_REQUIRE_ANSWERS/);
});
