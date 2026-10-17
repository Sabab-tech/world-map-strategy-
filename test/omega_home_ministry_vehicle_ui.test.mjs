import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const engine = readFileSync(new URL('../omega_home_ministry_engine_v1.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../omega_home_ministry_ui_v1.js', import.meta.url), 'utf8');

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

test('responsive UI keeps the guard and vehicle forms usable on narrow screens', () => {
  assert.match(ui, /@media\(max-width:540px\)/);
  assert.match(ui, /home-police-deployment-list\{grid-template-columns:1fr\}/);
  assert.match(ui, /touch-action:manipulation/);
  assert.match(ui, /overflow:visible/);
});
