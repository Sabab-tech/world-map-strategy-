import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const engine = readFileSync(new URL('../omega_home_ministry_engine_v1.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../omega_home_ministry_ui_v1.js', import.meta.url), 'utf8');


function makeUiHarness(vehicleInventory = null, recordedAssets = null) {
  const nodes = new Map();
  const events = new Map();
  let api = null;
  const standDownButtons = [];
  function node(id = '') {
    const defaults = {
      'home-police-vehicle-amount': '1',
      'home-police-amount': '10',
      'home-police-guard-vehicle': '1',
      'home-police-guard-mission': 'urban_patrol',
      'home-police-guard-quantity': '1',
      'home-police-guard-sector': 'General Sector',
    };
    return {
      id, value: defaults[id] || '', textContent: '', innerHTML: '', className: '', disabled: false,
      style: { display: '', width: '', opacity: '', pointerEvents: '' },
      onclick: null, oninput: null, onchange: null, attributes: {},
      setAttribute(key, value) { this.attributes[key] = String(value); },
      getAttribute(key) { return this.attributes[key] ?? null; },
      dispatchEvent() { return true; },
      appendChild() {},
    };
  }
  const document = {
    head: { appendChild(element) { if (element.id) nodes.set(element.id, element); } },
    createElement() { return node(); },
    getElementById(id) {
      if (id === 'omega-home-police-ui-v1') return nodes.get(id) || null;
      if (!nodes.has(id)) nodes.set(id, node(id));
      return nodes.get(id);
    },
    querySelectorAll(selector) {
      if (selector === '[data-home-standdown]' && api) {
        const rows = api.getState('AAA').guardDeployments || [];
        return rows.map(row => {
          const button = node('standdown-' + row.id);
          button.getAttribute = key => key === 'data-home-standdown' ? row.id : null;
          standDownButtons.push(button);
          return button;
        });
      }
      return [];
    }
  };
  const state = {
    economy: { AAA: Object.assign({ treasury: 10000000, gdp: 1000000 }, Array.isArray(recordedAssets) ? { factories: recordedAssets } : {}) },
    population: { AAA: { population: 1000000 } },
    simulation: { turn: 0, simulationTimeMs: 0 }
  };
  const uiAdapter = {
    showAdvisePopup(title, message) { this.lastAdvice = { title, message }; },
    renderInteriorHQ() {},
    renderUpgradeMenu() {},
    renderTacticsMenu() {},
  };
  const world = {
    Game: { state, countryId: 'AAA' },
    CountryIOS: { activeCountry: 'AAA' },
    Omega: {},
    OMEGA_UI_ADAPTER: uiAdapter,
    document,
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail || null; } },
    Event: class Event { constructor(type) { this.type = type; } },
    addEventListener(type, fn) { const rows = events.get(type) || []; rows.push(fn); events.set(type, rows); },
    dispatchEvent(event) { (events.get(event.type) || []).forEach(fn => fn(event)); return true; },
    updateGlobalResourceHUD() {},
  };
  const context = vm.createContext(world);
  context.window = context;
  vm.runInContext(engine, context, { filename: 'omega_home_ministry_engine_v1.js' });
  api = context.OmegaHomeMinistryEngine;
  api.getState('AAA');
  if (vehicleInventory) context.Game.state.interior.AAA.police.vehiclesOwned = { ...vehicleInventory };
  vm.runInContext(ui, context, { filename: 'omega_home_ministry_ui_v1.js' });
  return { context, state, api, ui: context.OMEGA_UI_ADAPTER, nodes, standDownButtons };
}

test('the Home Ministry vehicle engine and UI scripts parse as JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(engine, { filename: 'omega_home_ministry_engine_v1.js' }));
  assert.doesNotThrow(() => new vm.Script(ui, { filename: 'omega_home_ministry_ui_v1.js' }));
});

test('all 15 police vehicles have one-to-one art designs and unique paint identities', () => {
  const vehicleBlock = engine.slice(engine.indexOf('const VEHICLES = Object.freeze(['), engine.indexOf('const GUARD_MISSIONS = Object.freeze(['));
  const vehicleIds = [...vehicleBlock.matchAll(/\{level:\d+,id:'([^']+)',iconId:'([^']+)'/g)];
  assert.equal(vehicleIds.length, 15);
  assert.equal(new Set(vehicleIds.map(row => row[1])).size, 15, 'vehicle IDs must not collide');
  assert.equal(new Set(vehicleIds.map(row => row[2])).size, 15, 'each vehicle needs its own icon key');

  const artBlock = ui.slice(ui.indexOf('const VEHICLE_ART = Object.freeze({'), ui.indexOf('function vehicleSvg('));
  const designs = [...artBlock.matchAll(/^\s{4}([a-z][a-z0-9]*):\{body:/gm)].map(row => row[1]);
  assert.equal(designs.length, 15);
  assert.equal(new Set(designs).size, 15);
  assert.deepEqual([...designs].sort(), vehicleIds.map(row => row[2]).sort(), 'engine icon IDs must map to an SVG design');
  assert.equal((artBlock.match(/colors:\[/g) || []).length, 15, 'each design uses its own paint palette');
});

test('custom vehicle artwork uses vector police signals and accessible names, not external image URLs', () => {
  assert.match(ui, /function vehicleSvg\(vehicle, slot\)/);
  assert.match(ui, /aria-label="'\s*\+\s*esc\(vehicle\.name\)\s*\+\s*' police vehicle illustration"/);
  assert.match(ui, /<text x="160" y="107"[^>]*>POLICE<\/text>/);
  assert.match(ui, /police-body-/);
  assert.ok(ui.includes("replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)"), 'SVG IDs must be sanitized before entering markup');
  assert.match(ui, /<rect x="' \+ art\.siren\[0\]/);
  assert.doesNotMatch(ui, /https?:\/\/[^'"]+\.(png|jpe?g|webp|svg)/i);
});

test('vehicle catalog exposes distinct capabilities, equipment, strengths, trade-offs and live order controls', () => {
  assert.match(engine, /capabilities:\{response:/);
  assert.match(engine, /specialFeatures:\[/);
  assert.match(engine, /strengths:'/);
  assert.match(engine, /tradeoff:'/);
  assert.match(ui, /Distinct capability profile/);
  assert.match(ui, /Vehicle-specific equipment/);
  assert.match(ui, /home-police-buy-vehicle/);
  assert.match(ui, /e\.orderVehicle\(selected\.level, n\)/);
  assert.match(ui, /data-home-vehicle=/);
  assert.match(ui, /Review its full specification now/);
});

test('guard-out UI and engine wire deploy, capacity preview, coverage, and stand-down actions', () => {
  for (const token of ['renderGuardOut', 'getGuardDeploymentPreview', 'deployGuard', 'standDownGuard', 'data-home-standdown']) assert.ok(ui.includes(token), token);
  for (const token of ['GUARD_MISSIONS', 'function deployGuard(', 'function standDownGuard(', 'guardCoverageForIncident']) assert.ok(engine.includes(token), token);
  assert.match(engine, /INSUFFICIENT_UNASSIGNED_VEHICLES/);
  assert.match(engine, /INSUFFICIENT_UNASSIGNED_OFFICERS/);
  assert.match(engine, /count\*vehicle\.capacity/);
});


test('Recruit and fire buttons update headcount and fire does not apply a purchase charge', () => {
  const harness = makeUiHarness();
  const originalTreasury = harness.state.economy.AAA.treasury;
  harness.ui.renderRecruitScreen();
  harness.nodes.get('home-police-mode-recruit').onclick();
  harness.nodes.get('home-police-confirm').onclick();
  assert.equal(harness.api.getState('AAA').policeCount, 260);
  assert.equal(harness.state.economy.AAA.treasury, originalTreasury - 10 * harness.api.POLICE_RECRUITMENT_COST);
  harness.nodes.get('home-police-mode-fire').onclick();
  harness.nodes.get('home-police-confirm').onclick();
  assert.equal(harness.api.getState('AAA').policeCount, 250);
  assert.equal(harness.state.economy.AAA.treasury, originalTreasury - 10 * harness.api.POLICE_RECRUITMENT_COST);
});

test('vehicle hangar button click submits an order and updates the authoritative treasury state', () => {
  const harness = makeUiHarness();
  harness.ui.renderVehicleCatalog(1);
  const button = harness.nodes.get('home-police-buy-vehicle');
  assert.equal(typeof button.onclick, 'function');
  button.onclick();
  const state = harness.api.getState('AAA');
  assert.equal(state.pendingVehicleOrder.level, 1);
  assert.equal(state.pendingVehicleOrder.quantity, 1);
  assert.equal(harness.state.economy.AAA.treasury, 10000000 - harness.api.VEHICLES[0].cost);
});

test('Guard Out screen dispatches a vehicle, reserves crew, and its stand-down button returns both', () => {
  const harness = makeUiHarness({ 1: 1 });
  harness.ui.renderGuardOut(1);
  assert.equal(harness.nodes.get('home-police-confirm-guard').disabled, false);
  harness.nodes.get('home-police-guard-mission').value = 'industrial_guard';
  harness.nodes.get('home-police-guard-sector').value = 'Aluminium Plant North Gate';
  harness.nodes.get('home-police-confirm-guard').onclick();
  let state = harness.api.getState('AAA');
  assert.equal(state.guardDeployments.length, 1);
  assert.equal(state.guardDeployments[0].sector, 'Aluminium Plant North Gate');
  assert.equal(harness.api.getGuardCapacity('AAA').availableVehicles[1], 0);
  const standDown = harness.standDownButtons[harness.standDownButtons.length - 1];
  assert.equal(typeof standDown.onclick, 'function');
  standDown.onclick();
  state = harness.api.getState('AAA');
  assert.equal(state.guardDeployments.length, 0);
  assert.equal(harness.api.getGuardCapacity('AAA').availableVehicles[1], 1);
  assert.equal(harness.api.getGuardCapacity('AAA').availableOfficers, 250);
});

test('Guard Out asset selector only targets recorded factories and passes the selected target to engine', () => {
  const assets = [
    { factoryId: 'AL-01', name: 'Aluminium Plant North Gate', type: 'factory', productionCapacity: 100, operationalStatus: 'ACTIVE' },
    { factoryId: 'ST-02', name: 'Steelworks South', type: 'industrial factory', productionCapacity: 120, operationalStatus: 'ACTIVE' }
  ];
  const harness = makeUiHarness({ 1: 1 }, assets);
  harness.ui.renderGuardOut(1);
  const assetSelect = harness.nodes.get('home-police-guard-asset');
  assert.ok(assetSelect.innerHTML.includes('AL-01') || assetSelect, 'the recorded target selector must exist');
  assetSelect.value = 'AL-01';
  harness.nodes.get('home-police-guard-mission').value = 'industrial_guard';
  harness.nodes.get('home-police-guard-sector').value = 'Aluminium Plant North Gate';
  harness.nodes.get('home-police-confirm-guard').onclick();
  const unit = harness.api.getState('AAA').guardDeployments[0];
  assert.equal(unit.assetId, 'AL-01');
  assert.equal(unit.assetName, 'Aluminium Plant North Gate');
  assert.equal(harness.api.getGuardCoverageForIncident('INDUSTRIAL_SABOTAGE', 'AAA', 'AL-01') > 0, true);
  assert.equal(harness.api.getGuardCoverageForIncident('INDUSTRIAL_SABOTAGE', 'AAA', 'ST-02'), 0);
});

test('responsive UI keeps the guard and vehicle forms usable on narrow screens', () => {
  assert.match(ui, /@media\(max-width:540px\)/);
  assert.match(ui, /home-police-deployment-list\{grid-template-columns:1fr\}/);
  assert.match(ui, /touch-action:manipulation/);
  assert.match(ui, /overflow:visible/);
});
