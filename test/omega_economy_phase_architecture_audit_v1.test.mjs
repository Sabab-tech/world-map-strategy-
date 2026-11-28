import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const economy = read('../omega_resource_economy_runtime_v2.js');
const industrial = read('../omega_resource_industrial_network_v1.js');
const simulation = read('../omega_simulation_runtime.js');
const composition = read('../omega_enterprise_composition_root_v10.js');
const finance = read('../omega_finance_ministry_runtime_v1.js');
const worldScheduler = read('../omega_world_simulation_scheduler_v1.js');
const dailyWorkloadScheduler = read('../omega_daily_workload_scheduler_v1.js');

test('resource economy remains the single player-country ordered execution owner', () => {
  const start = economy.indexOf('function runTurnCore(cid){');
  const end = economy.indexOf('function runTurn(){', start);
  assert.ok(start >= 0 && end > start, 'runTurnCore boundary must remain discoverable');
  const core = economy.slice(start, end);
  const order = [
    'capture-stock-flow-period',
    'national-demand-prepare-country',
    'universal-daily-workload-plan',
    'process-country-finalization',
    'global-market-rebuild-country',
    'global-trade-process-country',
    'dashboard-build'
  ];
  let previous = -1;
  for (const token of order) {
    const index = core.indexOf(token);
    assert.ok(index > previous, token + ' must retain canonical execution order');
    previous = index;
  }
  assert.match(economy, /playerSimulationCountryId\(\)/);
  assert.match(economy, /omega\.resource-economy\.player-country/);
});

test('universal workload planner owns player-domain order without replacing domain ledgers', () => {
  const planner = economy.slice(economy.indexOf('function runDailyWorkloadPlan'), economy.indexOf('function runTurnCore'));
  assert.ok(planner.indexOf("id:'resources'") < planner.indexOf("id:'industrial'"));
  assert.match(planner, /dependencies:\['resources'\]/);
  assert.match(planner, /pageId:'resource-ministry'/);
  assert.match(planner, /pageId:'industry'/);
  assert.match(planner, /AUTHORITATIVE_FOOD_RUNTIME_NOT_AVAILABLE/);
  assert.match(planner, /throughTurn:context\.periodTurn/);
  assert.match(dailyWorkloadScheduler, /runPlan/);
  assert.match(dailyWorkloadScheduler, /DOMAIN_SLICE_DID_NOT_ADVANCE_RECONCILED_CHECKPOINT/);
  assert.match(industrial, /runCountryTurn/);
  assert.match(industrial, /finishTurn|finishDate|due/i);
});
test('daily workload scheduler stays distinct from NPC and view-driven ministry schedulers', () => {
  assert.match(dailyWorkloadScheduler, /DailyWorkloadScheduler/);
  assert.match(worldScheduler, /registerCountryHandler/);
  assert.match(composition, /ministryPump:/);
});

test('canonical simulation clock and turn participant failure stop remain authoritative', () => {
  assert.match(simulation, /registerSubsystem\(id,handler,options=\{\}\)\s*\{\s*return this\.registerTurnParticipant/);
  assert.match(simulation, /TURN_PARTICIPANT_FAILED/);
  assert.match(simulation, /createSaveSnapshot/);
  assert.match(simulation, /async saveSlot\(/);
});

test('world scheduler and active-ministry pump are distinct responsibilities', () => {
  assert.match(worldScheduler, /registerCountryHandler/);
  assert.match(worldScheduler, /MAX_EVENT_QUEUE|MAX_PENDING_EVENTS/);
  assert.match(composition, /ministryPump:/);
  assert.match(composition, /getActiveContext/);
  assert.match(composition, /pumpOrchestratedPipelineTick/);
});

test('finance currently has annual fiscal rollover and turn idempotency, not monthly close', () => {
  assert.match(finance, /function fiscalYearIndexFor/);
  assert.match(finance, /lastProcessedTurn/);
  assert.match(finance, /function ensureFiscalPeriodForTurn/);
  assert.doesNotMatch(finance, /periodId\s*:\s*[^\n]*-\d{2}/);
});

test('E1 remains an audit-only milestone and does not silently add a second scheduler', () => {
  const doc = read('../docs/OMEGA_ECONOMY_PHASE_ARCHITECTURE_AUDIT_V1.md');
  assert.match(doc, /E1 audit complete/);
  assert.match(doc, /no production runtime/);
  assert.match(doc, /Food is not eligible/);
});
