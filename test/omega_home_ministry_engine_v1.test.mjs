import test from 'node:test';
import assert from 'node:assert/strict';

const events = new Map();
globalThis.window = globalThis;
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail || null; } };
globalThis.addEventListener = (type, fn) => { const list = events.get(type) || []; list.push(fn); events.set(type, list); };
globalThis.dispatchEvent = event => { for (const fn of events.get(event.type) || []) fn(event); return true; };
globalThis.updateGlobalResourceHUD = () => {};
globalThis.Omega = {};
function setup(treasury = 10000000) {
  globalThis.Game = { countryId: 'AAA', state: {
    economy: { AAA: { treasury } },
    population: { AAA: { population: 1000000 } },
    simulation: { turn: 0, simulationTimeMs: 0 }
  } };
  globalThis.CountryIOS = { activeCountry: 'AAA' };
  return Game.state;
}
await import('../omega_home_ministry_engine_v1.js');
const api = globalThis.OmegaHomeMinistryEngine;
const DAY = 86400000;

test('15 fixed vehicle tiers have unique names, emoji and progressive stats', () => {
  assert.equal(api.VEHICLES.length, 15);
  assert.equal(new Set(api.VEHICLES.map(v => v.name)).size, 15);
  assert.equal(new Set(api.VEHICLES.map(v => v.emoji)).size, 15);
  assert.deepEqual(api.VEHICLES.map(v => v.level), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.ok(api.VEHICLES.every(v => v.enduranceHours > 0 && v.rangeKm > 0 && v.maintenancePerDay > 0));
});

test('recruiting charges upfront cost, increases daily payroll and firing does not charge money', () => {
  const state = setup();
  assert.equal(api.recruitPolice(2, 'AAA').ok, true);
  assert.equal(api.getState('AAA').policeCount, 252);
  assert.equal(state.economy.AAA.treasury, 10000000 - 5000);
  assert.equal(api.getDailyPayroll('AAA'), 252 * 65);
  const before = state.economy.AAA.treasury;
  assert.equal(api.firePolice(1, 'AAA').ok, true);
  assert.equal(state.economy.AAA.treasury, before);
  assert.equal(api.getState('AAA').policeCount, 251);
  assert.equal(api.firePolice(251, 'AAA').reason, 'MINIMUM_FORCE_REQUIRED');
});

test('vehicle tiers cannot be skipped and delivery takes 180 simulation days', () => {
  const state = setup();
  assert.equal(api.orderVehicle(15, 1, 'AAA').reason, 'VEHICLE_TIER_LOCKED');
  assert.equal(api.orderVehicle(1, 2, 'AAA').ok, true);
  assert.equal(state.economy.AAA.treasury, 9990000);
  assert.equal(api.orderVehicle(1, 1, 'AAA').reason, 'PROCUREMENT_ALREADY_IN_PROGRESS');
  state.simulation.simulationTimeMs = 180 * DAY;
  state.simulation.turn = 4320;
  api.processTurn({ detail: { payload: { countryId: 'AAA', turn: 4320 } } });
  assert.equal(api.getState('AAA').vehiclesOwned[1], 2);
  assert.equal(api.getState('AAA').unlockedVehicleLevel, 2);
  assert.equal(api.getState('AAA').pendingVehicleOrder, null);
  assert.equal(api.orderVehicle(15, 1, 'AAA').reason, 'VEHICLE_TIER_LOCKED');
  assert.equal(api.orderVehicle(2, 1, 'AAA').ok, true);
});

test('academy upgrades unlock training quality and costs scale with level', () => {
  setup();
  assert.equal(api.upgradeTraining(2, 'AAA').reason, 'ACADEMY_LEVEL_TOO_LOW');
  assert.equal(api.estimateFacilityCost('academy', 1, 'AAA'), 30000);
  assert.equal(api.buildFacility('academy', 1, 'AAA').ok, true);
  assert.equal(api.getState('AAA').facilityLevels.academy, 2);
  assert.equal(api.upgradeTraining(2, 'AAA').ok, true);
  assert.equal(api.getState('AAA').trainingQualityLevel, 2);
});

test('research completes only after its simulation-time duration', () => {
  const state = setup();
  assert.equal(api.startResearch('antiRiot', 'AAA').ok, true);
  assert.equal(api.getState('AAA').tacticsResearched.antiRiot, false);
  state.simulation.simulationTimeMs = 30 * DAY;
  state.simulation.turn = 720;
  api.processTurn({ detail: { payload: { countryId: 'AAA', turn: 720 } } });
  assert.equal(api.getState('AAA').tacticsResearched.antiRiot, true);
  assert.equal(api.getState('AAA').pendingResearch, null);
});

test('agent hiring reduces modeled risk and payroll settles elapsed simulation days', () => {
  const state = setup();
  assert.equal(api.recruitAgents(1, 'AAA').ok, true);
  assert.equal(api.getState('AAA').sabotageRisk, 41);
  const before = state.economy.AAA.treasury;
  state.simulation.simulationTimeMs = DAY;
  state.simulation.turn = 24;
  api.processTurn({ detail: { payload: { countryId: 'AAA', turn: 24 } } });
  assert.equal(state.economy.AAA.treasury, before - (250 * 65 + 500));
  api.processTurn({ detail: { payload: { countryId: 'AAA', turn: 25 } } });
  assert.equal(state.economy.AAA.treasury, before - (250 * 65 + 500));
});

test('vehicle maintenance is included in daily security operating cost', () => {
  const state = setup();
  api.getState('AAA');
  state.interior.AAA.police.vehiclesOwned[1] = 2;
  assert.equal(api.getDailyPayroll('AAA'), 250 * api.POLICE_SALARY_PER_DAY);
  assert.equal(api.getDailyOperatingCost('AAA'), 250 * api.POLICE_SALARY_PER_DAY + 2 * api.VEHICLES[0].maintenancePerDay);
});

test('agents can be assigned to an existing rival and reports expose only recorded fields', () => {
  const state = setup();
  state.economy.BBB = { treasury: 4000000, gdp: 50000000 };
  state.population.BBB = { population: 500000 };
  assert.deepEqual(api.getAvailableCountries('AAA'), ['BBB']);
  const recruited = api.recruitAgents(2, 'AAA', 'BBB');
  assert.equal(recruited.ok, true);
  assert.equal(api.getState('AAA').agentDeployments.BBB, 2);
  state.simulation.simulationTimeMs = 7 * DAY;
  state.simulation.turn = 168;
  api.processTurn({ detail: { payload: { countryId: 'AAA', turn: 168 } } });
  const reports = api.getState('AAA').intelligenceReports;
  assert.ok(reports.length >= 1);
  assert.equal(reports[0].targetCountryId, 'BBB');
  assert.ok(reports[0].observations.some(item => item.field === 'economy.gdp' && item.value === 50000000));
  assert.ok(reports[0].observations.every(item => item.value !== null && Number.isFinite(item.value)));
});

test('finance available ledger is authoritative when economy treasury is also present', () => {
  const state = setup();
  const economyTreasury = state.economy.AAA.treasury;
  state.finance = { AAA: { available: 100000, reserves: 200000 } };
  assert.equal(api.getTreasury('AAA').source, 'FINANCE_AVAILABLE');
  assert.equal(api.recruitPolice(2, 'AAA').ok, true);
  assert.equal(state.finance.AAA.available, 95000);
  assert.equal(state.economy.AAA.treasury, economyTreasury);
});

test('missing treasury does not mark a due payroll day as paid', () => {
  const state = setup(null);
  api.getState('AAA');
  state.simulation.simulationTimeMs = DAY;
  state.simulation.turn = 24;
  api.processTurn({ detail: { payload: { countryId: 'AAA', turn: 24 } } });
  assert.equal(api.getState('AAA').lastPayrollDay, 0);
  state.economy.AAA.treasury = 1000000;
  api.processTurn({ detail: { payload: { countryId: 'AAA', turn: 24 } } });
  assert.equal(api.getState('AAA').lastPayrollDay, 1);
  assert.equal(state.economy.AAA.treasury, 1000000 - 250 * api.POLICE_SALARY_PER_DAY);
});

test('purchases fail closed when treasury is unavailable and advice is non-mutating', () => {
  setup(null);
  assert.equal(api.recruitPolice(5, 'AAA').reason, 'TREASURY_DATA_UNAVAILABLE');
  setup();
  const balance = Game.state.economy.AAA.treasury;
  const advice = api.advice('vehicle', { level: 1 }, 'AAA');
  assert.ok(advice.amount > 0);
  assert.equal(advice.cost, advice.amount * api.VEHICLES[0].cost);
  assert.equal(Game.state.economy.AAA.treasury, balance);
  assert.equal(api.FACILITIES.length, 10);
  assert.equal(api.TACTICS.length, 5);
});
