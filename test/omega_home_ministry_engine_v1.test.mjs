import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sourceText = readFileSync(new URL('../omega_home_ministry_engine_v1.js', import.meta.url), 'utf8');
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

test('15 fixed vehicle tiers have unique names, SVG identities and progressive stats', () => {
  assert.equal(api.VEHICLES.length, 15);
  assert.equal(new Set(api.VEHICLES.map(v => v.name)).size, 15);
  assert.equal(new Set(api.VEHICLES.map(v => v.id)).size, 15);
  assert.equal(new Set(api.VEHICLES.map(v => v.iconId)).size, 15);
  assert.deepEqual(api.VEHICLES.map(v => v.level), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.ok(api.VEHICLES.every(v => v.enduranceHours > 0 && v.rangeKm > 0 && v.maintenancePerDay > 0));
  assert.ok(api.VEHICLES.every(v => v.specialFeatures.length >= 3 && v.strengths && v.tradeoff));
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

test('finance spending uses the finance-owned transaction when OMEGA interop is available', () => {
  const state = {
    economy: { AAA: { treasury: 987654 } },
    finance: { AAA: { available: 100000, reserves: 200000 } },
    population: { AAA: { population: 1000000 } },
    simulation: { turn: 0, simulationTimeMs: 0 }
  };
  const handlers = new Map();
  const mesh = {
    registerCommandHandler(commandType, owner, handler) {
      handlers.set(commandType, { owner, handler });
    },
    dispatchCommand(source, action, country, payload = {}, options = {}) {
      const type = options.commandType || action;
      const registered = handlers.get(type);
      if (!registered) return { status: 'UNHANDLED' };
      const staged = {};
      const transaction = {
        get(path) {
          if (path === 'finance.available') return state.finance[country]?.available;
          if (path === 'economy') return state.economy[country];
          if (path === 'interior.police') return state.interior?.[country]?.police;
          return undefined;
        },
        set(path, value) { staged[path] = value; }
      };
      const result = registered.handler({ countryId: country, payload, simulationTurn: options.turn || 0 }, {
        countryId: country, simulationTurn: options.turn || 0, stateTransaction: transaction
      });
      if (result && result.accepted === false) return { status: 'FAILED', result };
      for (const [path, value] of Object.entries(staged)) {
        if (path === 'finance.available') state.finance[country].available = value;
        else if (path === 'interior.police') {
          state.interior ||= {};
          state.interior[country] ||= {};
          state.interior[country].police = value;
        } else if (path === 'economy') state.economy[country] = value;
      }
      return { status: 'APPLIED', result };
    }
  };
  const world = {
    Game: { state, countryId: 'AAA' },
    CountryIOS: { activeCountry: 'AAA' },
    Omega: { MinistryInteroperability: mesh },
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail || null; } },
    addEventListener() {},
    dispatchEvent() { return true; },
    updateGlobalResourceHUD() {}
  };
  world.window = world;
  new Function('window', sourceText)(world);
  const result = world.OmegaHomeMinistryEngine.recruitPolice(1, 'AAA');
  assert.equal(result.ok, true);
  assert.equal(state.finance.AAA.available, 97500);
  assert.equal(state.economy.AAA.treasury, 987654);
  assert.equal(handlers.get('HOME_POLICE_FINANCE_CASH_ADJUST').owner, 'finance');
  assert.equal(state.interior.AAA.police.policeCount, 251);
});


test('each police vehicle has a distinct role, visual ID and feature profile', () => {
  setup();
  assert.equal(api.VEHICLES.length, 15);
  assert.equal(new Set(api.VEHICLES.map(v => v.id)).size, 15);
  assert.equal(new Set(api.VEHICLES.map(v => v.iconId)).size, 15);
  assert.equal(new Set(api.VEHICLES.map(v => v.name)).size, 15);
  assert.ok(api.VEHICLES.every(v => v.specialFeatures.length >= 3));
  assert.ok(api.VEHICLES.every(v => v.strengths && v.tradeoff && v.specialty && v.terrain));
  assert.ok(api.VEHICLES.every(v => Object.keys(v.capabilities).length === 8 &&
    Object.values(v.capabilities).every(n => n >= 0 && n <= 100)));
  assert.equal(api.GUARD_MISSIONS.length, 6);
});

test('guard-out deployment reserves owned vehicles and police officers until stand-down', () => {
  const state = setup();
  api.getState('AAA');
  state.interior.AAA.police.vehiclesOwned = { 1: 2 };
  const preview = api.getGuardDeploymentPreview(1, 'industrial_guard', 2, 'AAA');
  assert.equal(preview.ok, true);
  assert.equal(preview.requiredOfficers, api.VEHICLES[0].capacity * 2);
  const deployed = api.deployGuard(1, 2, 'industrial_guard', 'Aluminium Plant North Gate', 'AAA');
  assert.equal(deployed.ok, true);
  assert.equal(deployed.deployment.quantity, 2);
  assert.equal(deployed.deployment.sector, 'Aluminium Plant North Gate');
  assert.equal(api.getGuardCapacity('AAA').availableVehicles[1], 0);
  assert.equal(api.getGuardCapacity('AAA').availableOfficers, 250 - api.VEHICLES[0].capacity * 2);
  assert.equal(api.deployGuard(1, 1, 'urban_patrol', 'Sector 5', 'AAA').reason, 'INSUFFICIENT_UNASSIGNED_VEHICLES');
  assert.ok(api.getGuardCoverageForIncident('INDUSTRIAL_SABOTAGE', 'AAA') > 0);
  assert.equal(api.getGuardCoverageForIncident('INDUSTRIAL_SABOTAGE', 'AAA') >=
    api.getGuardCoverageForIncident('CIVIL_UNREST', 'AAA'), true);
  const stoodDown = api.standDownGuard(deployed.deployment.id, 'AAA');
  assert.equal(stoodDown.ok, true);
  assert.equal(stoodDown.releasedVehicles, 2);
  assert.equal(api.getGuardCapacity('AAA').availableVehicles[1], 2);
  assert.equal(api.getGuardCapacity('AAA').availableOfficers, 250);
});

test('guard-out refuses deployments without owned vehicles, enough officers, or valid mission', () => {
  const state = setup();
  assert.equal(api.deployGuard(1, 1, 'urban_patrol', 'City Centre', 'AAA').reason, 'INSUFFICIENT_UNASSIGNED_VEHICLES');
  api.getState('AAA');
  state.interior.AAA.police.vehiclesOwned = { 1: 1 };
  state.interior.AAA.police.policeCount = 2;
  assert.equal(api.deployGuard(1, 1, 'industrial_guard', 'Factory Gate', 'AAA').reason, 'INSUFFICIENT_UNASSIGNED_OFFICERS');
  assert.equal(api.deployGuard(1, 1, 'not-a-mission', 'Factory Gate', 'AAA').reason, 'GUARD_MISSION_INVALID');
  assert.equal(api.getGuardDeploymentPreview(1, 'urban_patrol', 101, 'AAA').reason, 'GUARD_QUANTITY_INVALID');
});

test('guard deployments bind to recorded factories and only protect their selected asset', () => {
  const state = setup();
  state.economy.AAA.factories = [
    { factoryId: 'AL-01', name: 'Aluminium Plant North Gate', type: 'factory', productionCapacity: 100, operationalStatus: 'ACTIVE' },
    { factoryId: 'ST-02', name: 'Steelworks South', type: 'industrial factory', productionCapacity: 120, operationalStatus: 'ACTIVE' },
    { factoryId: 'OLD-03', name: 'Closed old plant', type: 'factory', productionCapacity: 0, operationalStatus: 'CLOSED' }
  ];
  api.getState('AAA');
  state.interior.AAA.police.vehiclesOwned = { 1: 1 };
  const assets = api.getGuardableAssets('AAA');
  assert.deepEqual(assets.map(x => x.id), ['AL-01', 'ST-02']);
  assert.equal(assets[0].name, 'Aluminium Plant North Gate');
  const deployed = api.deployGuard(1, 1, 'industrial_guard', 'Aluminium Plant North Gate', 'AAA', 'AL-01');
  assert.equal(deployed.ok, true, JSON.stringify(deployed));
  assert.equal(deployed.deployment.assetId, 'AL-01');
  assert.equal(deployed.deployment.assetName, 'Aluminium Plant North Gate');
  assert.ok(api.getGuardCoverageForIncident('INDUSTRIAL_SABOTAGE', 'AAA', 'AL-01') > 0);
  assert.equal(api.getGuardCoverageForIncident('INDUSTRIAL_SABOTAGE', 'AAA', 'ST-02'), 0);
  assert.equal(api.getGuardCoverageForIncident('INDUSTRIAL_SABOTAGE', 'AAA'), 0);
  assert.ok(sourceText.includes('rows[Math.max(0,Math.floor(num(week)||0))%rows.length]'), 'guard preview must use the recorded asset selection index');
  assert.match(sourceText, /incident\.simulationWeek%candidates\.length/, 'the economy damage transaction must use the same incident-to-asset index');

  assert.equal(api.deployGuard(1, 1, 'industrial_guard', 'Imaginary factory', 'AAA', 'FAKE-99').reason, 'GUARD_ASSET_UNAVAILABLE');
  assert.equal(api.standDownGuard(deployed.deployment.id, 'AAA').ok, true);
});

test('simulation incident records the deterministic target asset and matching guard coverage', () => {
  const state = setup();
  state.economy.AAA.factories = [
    { factoryId: 'AL-01', name: 'Aluminium Plant North Gate', type: 'factory', productionCapacity: 100, operationalStatus: 'ACTIVE' },
    { factoryId: 'ST-02', name: 'Steelworks South', type: 'industrial factory', productionCapacity: 120, operationalStatus: 'ACTIVE' }
  ];
  api.getState('AAA');
  state.interior.AAA.police.vehiclesOwned = { 1: 1 };
  state.interior.AAA.police.sabotageRisk = 95;
  const deployment = api.deployGuard(1, 1, 'industrial_guard', 'Aluminium Plant North Gate', 'AAA', 'AL-01');
  assert.equal(deployment.ok, true, JSON.stringify(deployment));

  // Deterministic fixture: week 10 / turn 1680 selects Industrial Sabotage
  // and has a detection roll high enough to preserve an actionable incident.
  const week = 10;
  state.simulation.simulationTimeMs = week * 7 * DAY;
  state.simulation.turn = 1680;
  api.processTurn({ detail: { payload: { countryId: 'AAA', turn: 1680 } } });
  const incident = api.getState('AAA').incidentLedger.at(-1);
  assert.ok(incident);
  assert.equal(incident.type, 'INDUSTRIAL_SABOTAGE');
  assert.equal(incident.targetAssetId, 'AL-01');
  assert.equal(incident.targetAssetName, 'Aluminium Plant North Gate');
  assert.ok(incident.guardMitigationPercent > 0);
  assert.equal(incident.activeGuardDeployments, 1);
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
