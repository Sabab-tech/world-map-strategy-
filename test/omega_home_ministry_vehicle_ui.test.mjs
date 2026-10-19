import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const engine = readFileSync(new URL('../omega_home_ministry_engine_v1.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../omega_home_ministry_ui_v1.js', import.meta.url), 'utf8');
const ministryEngine = readFileSync(new URL('../ministry_engine.js', import.meta.url), 'utf8');


function makeUiHarness(vehicleInventory = null, recordedAssets = null) {
  const nodes = new Map();
  const events = new Map();
  let api = null;
  const standDownButtons = [];
  const serviceButtons = new Map();
  const recommendationButtons = new Map();
  function node(id = '') {
    const defaults = {
      'home-police-vehicle-amount': '1',
      'home-police-amount': '10',
      'home-police-guard-vehicle': '1',
      'home-police-guard-mission': 'urban_patrol',
      'home-police-guard-environment': 'city',
      'home-police-guard-road': 'congested',
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
      if (selector === '[data-home-service]') {
        const html = nodes.get('cabinet-body')?.innerHTML || '';
        return [...html.matchAll(/data-home-service="([^"]+)"/g)].map(match => {
          if (!serviceButtons.has(match[1])) {
            const button = node('service-' + match[1]);
            button.getAttribute = key => key === 'data-home-service' ? match[1] : null;
            serviceButtons.set(match[1], button);
          }
          return serviceButtons.get(match[1]);
        });
      }
      if (selector === '[data-home-choose-vehicle]') {
        const html = nodes.get('home-police-route-recommendations')?.innerHTML || '';
        return [...html.matchAll(/data-home-choose-vehicle="([^"]+)" data-home-recommend-quantity="([^"]+)"/g)].map(match => {
          const key = match[1];
          if (!recommendationButtons.has(key)) {
            const button = node('recommend-' + key);
            button.getAttribute = attr => attr === 'data-home-choose-vehicle' ? match[1] : attr === 'data-home-recommend-quantity' ? match[2] : null;
            recommendationButtons.set(key, button);
          }
          const button = recommendationButtons.get(key);
          button.getAttribute = attr => attr === 'data-home-choose-vehicle' ? match[1] : attr === 'data-home-recommend-quantity' ? match[2] : null;
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
  assert.ok(ui.includes("police-gloss-' + key + '"), 'vehicle bodies must have a layered glossy light pass for depth');
  assert.ok(ui.includes("police-metal-' + key + '"), 'wheel rims must use a metallic lighting gradient');
  assert.ok(ui.includes('maskUnits="userSpaceOnUse"'), 'vehicle body must have an explicit wheel-arch mask');
  assert.ok(ui.includes('<text x="94" y="92"') && ui.includes('>POLICE</text>'), 'POLICE label must sit on the side door panel, clear of the wheels');
  assert.match(ui, /police-body-/);
  assert.match(ui, /viewBox="0 20 260 116"/);
  assert.ok(ui.includes('police-arch-mask-'), 'wheel wells must be cut cleanly from the body silhouette');
  assert.doesNotMatch(ui, /M34 91 L60 85 L84 61/, 'one shared roof highlight must not distort different vehicle profiles');
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
  assert.ok(harness.nodes.get('cabinet-body').innerHTML.includes('AL-01') && harness.nodes.get('cabinet-body').innerHTML.includes('Aluminium Plant North Gate'), 'only actual recorded target rows should populate the selector');
  assetSelect.value = 'AL-01';
  assetSelect.onchange();
  assert.equal(harness.nodes.get('home-police-guard-environment').value, 'industrial');
  assert.equal(harness.nodes.get('home-police-guard-road').value, 'rough');
  harness.nodes.get('home-police-guard-mission').value = 'industrial_guard';
  harness.nodes.get('home-police-guard-sector').value = 'Aluminium Plant North Gate';
  harness.nodes.get('home-police-confirm-guard').onclick();
  const unit = harness.api.getState('AAA').guardDeployments[0];
  assert.equal(unit.assetId, 'AL-01');
  assert.equal(unit.assetName, 'Aluminium Plant North Gate');
  assert.equal(unit.environmentId, 'industrial');
  assert.equal(unit.roadCondition, 'rough');
  assert.equal(harness.api.getGuardCoverageForIncident('INDUSTRIAL_SABOTAGE', 'AAA', 'AL-01') > 0, true);
  assert.equal(harness.api.getGuardCoverageForIncident('INDUSTRIAL_SABOTAGE', 'AAA', 'ST-02'), 0);
});

test('one-tap route recommendation selects the best owned vehicle for the chosen environment', () => {
  const harness = makeUiHarness({ 1: 1, 7: 1 });
  harness.api.getState('AAA');
  harness.state.interior.AAA.police.unlockedVehicleLevel = 7;
  harness.ui.renderGuardOut(1);
  const environment = harness.nodes.get('home-police-guard-environment');
  environment.value = 'border';
  environment.onchange();
  const html = harness.nodes.get('home-police-route-recommendations').innerHTML;
  assert.match(html, /TerraGuard All-Terrain SUV/);
  const choose = harness.context.document.querySelectorAll('[data-home-choose-vehicle]').find(button => button.getAttribute('data-home-choose-vehicle') === '7');
  assert.ok(choose, 'the frontier recommendation should provide a one-tap choice');
  choose.onclick();
  assert.equal(harness.nodes.get('home-police-guard-vehicle').value, '7');
  assert.equal(harness.nodes.get('home-police-guard-environment').value, 'border');
  assert.equal(harness.nodes.get('home-police-guard-road').value, 'rough');
  assert.equal(harness.nodes.get('home-police-confirm-guard').disabled, false);
});

test('Fleet maintenance service button invokes the real repair API and refreshes vehicle health', () => {
  const harness = makeUiHarness({ 1: 1 });
  const state = harness.api.getState('AAA');
  const unit = state.vehicleFleet[0];
  assert.ok(unit, 'legacy vehicle counter should migrate to a unique fleet unit');
  harness.state.interior.AAA.police.vehicleFleet[0].condition = 42;
  harness.state.interior.AAA.police.vehicleFleet[0].status = 'REPAIR_REQUIRED';
  const treasury = harness.state.economy.AAA.treasury;
  harness.ui.renderFleetMaintenance();
  const repairButton = harness.nodes.get('cabinet-body').innerHTML.includes('data-home-service="' + unit.id + '"');
  assert.equal(repairButton, true);
  const action = harness.nodes.get('cabinet-body').innerHTML;
  assert.match(action, /REPAIR & RETURN TO FULL CONDITION/);
  const button = harness.context.document.querySelectorAll('[data-home-service]')[0];
  assert.equal(typeof button.onclick, 'function');
  button.onclick();
  const repaired = harness.api.getVehicleFleet('AAA')[0];
  assert.equal(repaired.condition, 100);
  assert.equal(repaired.status, 'AVAILABLE');
  assert.ok(harness.state.economy.AAA.treasury < treasury);
});

test('vehicle compatibility and fleet repair controls are visible and interactive in UI source', () => {
  assert.match(ui, /Environment suitability · 0–100/);
  assert.match(ui, /ui\.renderFleetMaintenance = function/);
  assert.match(ui, /e\.serviceVehicle\(id\)/);
  assert.match(ui, /home-police-guard-environment/);
  assert.match(ui, /home-police-guard-road/);
  assert.match(ui, /home-police-route-wear/);
  assert.match(ui, /Fleet strategy recommendation/);
  assert.match(ui, /data-home-choose-vehicle/);
  assert.match(ui, /e\.getVehicleRecommendations\(missionId, environmentId, roadId/);
  assert.match(ui, /Only 12 vehicle cards are rendered per page/);
  assert.match(ui, /REPAIR & RETURN TO FULL CONDITION/);
  assert.match(ui, /prefers-reduced-motion:reduce/);
});

test('responsive UI keeps the guard and vehicle forms usable on narrow screens', () => {
  assert.match(ui, /@media\(max-width:540px\)/);
  assert.match(ui, /home-police-deployment-list\{grid-template-columns:1fr\}/);
  assert.match(ui, /touch-action:manipulation/);
  assert.match(ui, /overflow:visible/);
});


test('hosted Home Ministry dashboard mounts real controls and returns to its own dashboard', () => {
  const harness = makeUiHarness({ 1: 2 });
  const host = harness.nodes.get('home-ministry-host') || (() => {
    const value = { id: 'home-ministry-host', innerHTML: '', isConnected: true };
    harness.nodes.set('home-ministry-host', value);
    return value;
  })();

  assert.equal(harness.ui.renderHomeMinistryInto(host), true);
  assert.match(host.innerHTML, /MINISTRY OF HOME AFFAIRS/);
  assert.match(host.innerHTML, /Vehicles owned/);
  assert.match(host.innerHTML, /home-police-dashboard-hangar/);
  assert.match(host.innerHTML, /home-police-dashboard-fleet/);
  assert.match(host.innerHTML, /home-police-dashboard-guard/);

  harness.nodes.get('home-police-dashboard-command').onclick();
  assert.match(host.innerHTML, /NATIONAL POLICE COMMAND/);
  harness.nodes.get('btn-back-interior').onclick();
  assert.match(host.innerHTML, /MINISTRY OF HOME AFFAIRS/);
  assert.match(host.innerHTML, /home-police-dashboard-incidents/);

  harness.nodes.get('home-police-dashboard-hangar').onclick();
  assert.match(host.innerHTML, /POLICE VEHICLE HANGAR/);
  assert.match(host.innerHTML, /CONFIRM VEHICLE ORDER|PROCUREMENT LOCK/);
});

test('ministry dashboard source parses after the Home Affairs report changes', () => {
  assert.doesNotThrow(() => new vm.Script(ministryEngine, { filename: 'ministry_engine.js' }));
});

test('Home Affairs has a separate security operations route and embeds the real Home Ministry runtime', () => {
  assert.match(ministryEngine, /security_operations/);
  assert.match(ministryEngine, /home-ministry-command-root/);
  assert.match(ministryEngine, /renderHomeMinistryInto\(target\)/);
  assert.match(ministryEngine, /Police Command & Fleet/);
});

test('Home Affairs Reports & Metrics no longer displays mine and shipment diagnostics as its domain report', () => {
  assert.match(ministryEngine, /HOME MINISTRY SECURITY OPERATIONS REPORT/);
  assert.match(ministryEngine, /Owned police vehicles/);
  assert.match(ministryEngine, /Vehicles needing service \/ repair/);
  assert.match(ministryEngine, /Active guard deployments/);
  assert.match(ministryEngine, /RECORDED SECURITY INCIDENT HISTORY/);
  assert.match(ministryEngine, /ministryId !== 'interior_security'/);
  assert.match(ministryEngine, /const rows = isHomeMinistryReport \? \[/);
  assert.match(ministryEngine, /\['Mine \/ site records', activity && activity\.mineRecords\]/);
  assert.match(ministryEngine, /isHomeMinistryReport \? 'HOME MINISTRY SECURITY OPERATIONS REPORT' : 'LIVE SOVEREIGN ENGINE REPORT'/);
});
