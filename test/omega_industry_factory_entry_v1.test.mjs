import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ministry = fs.readFileSync('ministry_engine.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const commandCenter = fs.readFileSync('omega_resource_command_center_ui_v1.js', 'utf8');

test('Economy ministries expose a direct Industry & Factories hub for the selected country', () => {
  assert.match(ministry, /m\.category === 'economy'/, 'the hub must be exposed from Economy-category ministries');
  assert.match(ministry, /id="omega-industry-factories-hub"/, 'the hub must be rendered in the dashboard');
  assert.equal((ministry.match(/\$\{industryFactoryHub\}/g) || []).length, 1, 'the hub must be inserted exactly once');
  for (const panel of ['industrial', 'processing', 'inventory', 'value']) {
    assert.ok(
      ministry.includes('data-omega-industry-panel="' + panel + '"'),
      'Industry & Factories must provide the ' + panel + ' route'
    );
  }
  assert.match(ministry, /OmegaResourceCommandCenterUI\.open\(this\.getAttribute\('data-country'\),this\.getAttribute\('data-omega-industry-panel'\)\)/,
    'buttons must open the runtime panel scoped to the currently selected country');
});

test('the deployed HTML loads factory visuals before the Resource Command Center UI', () => {
  const visual = html.indexOf('src="omega_factory_visual_catalog_v1.js"');
  const commandCenterTag = html.indexOf('src="omega_resource_command_center_ui_v1.js"');
  assert.ok(visual >= 0, 'factory visual runtime script must be loaded');
  assert.ok(commandCenterTag > visual, 'factory visual runtime must load before the UI that renders its icons');
  assert.match(html, /href="omega_factory_visual_catalog_v1\.css"/, 'factory visual styles must be loaded');
  assert.match(commandCenter, /g\.OmegaFactoryVisualCatalog/, 'factory UI must use the visual catalog API');
  assert.match(commandCenter, /function panelIndustrial/, 'the My Factories panel renderer must exist');
  assert.match(commandCenter, /function panelProcessing/, 'the Production Lines panel renderer must exist');
  assert.match(commandCenter, /function panelInventory/, 'the inventory panel renderer must exist');
});
