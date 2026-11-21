import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const schedulerSource = readFileSync(new URL('../omega_world_simulation_scheduler_v1.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../minister_country_roster_manifest_v1.json', import.meta.url), 'utf8'));
const countryIds = Object.keys(manifest.countries || {}).map(value => String(value).toUpperCase()).sort();

function createWorldHarness() {
  assert.equal(countryIds.length, 197, 'the production core roster must contain exactly 197 countries');
  assert.ok(countryIds.includes('BGD'), 'the selected test player must exist in the canonical game roster');

  const state = {
    simulation: { turn: 0, session: { playerCountryId: 'BGD', status: 'RUNNING' } },
    foreign: {
      BGD: { relations: {
        USA: { overall: 8, trade: 5, political: 4, trust: 3, status: 'WAR', war_state: true },
        IRN: { overall: 18, trade: 10, political: 12, trust: 9, sanctions: true },
        IND: { overall: 82, trade: 88, political: 78, trust: 80, trade_agreement: true },
        AFG: { overall: 12, trade: 9, political: 10, trust: 8 }
      } },
      USA: { relations: { BGD: { status: 'WAR', war_state: true } } },
      IRN: { relations: { BGD: { sanctions: true } } },
      IND: { relations: { BGD: { trade_agreement: true } } },
      AFG: { relations: { BGD: { overall: 12, political: 10, trust: 8 } } }
    },
    economy: {},
    military: {},
    trade: {},
    worldEventDispatch: []
  };

  const participants = new Map();
  const eventListeners = new Set();
  const evaluations = [];
  const queuedDecisions = [];
  const playerTurns = [];
  let monotonicClock = 0;
  let schedulerYields = 0;

  const simulation = {
    world: { state },
    clock: { turn: 0, stepDurationMs: 86400000 },
    getPlayerCountryId: () => state.simulation.session.playerCountryId,
    registerTurnParticipant(id, handler, options) {
      participants.set(id, { handler, options });
      return () => participants.delete(id);
    },
    events: {
      subscribe(type, handler) {
        if (type === '*') eventListeners.add(handler);
        return () => eventListeners.delete(handler);
      }
    }
  };

  const idSet = new Set(countryIds);
  const profiles = countryIds.map(countryCode => ({ countryCode, iso3: countryCode }));
  const rules = {
    async listCountryIds() { return countryIds.slice(); },
    async evaluateCountry(countryId, turn) {
      const relation = state.foreign.BGD.relations[countryId] ||
        state.foreign[countryId]?.relations?.BGD || {};
      let scenario = 'TRADE';
      if (relation.war_state === true || String(relation.status || '').toUpperCase() === 'WAR') scenario = 'WAR';
      else if (state.military[countryId]?.activeConflict === true) scenario = 'CONFLICT';
      else if (relation.sanctions === true) scenario = 'SANCTIONS';
      else if (state.economy[countryId]?.activeCrisis === true) scenario = 'CRISIS';
      else if (Number.isFinite(Number(relation.overall)) && Number(relation.overall) <= 20) scenario = 'BAD_RELATIONSHIP';
      else if (relation.trade_agreement === true) scenario = 'TREATY_TRADE';

      const actions = {
        WAR: 'DEFEND_AND_PROTECT_TRADE_ROUTES',
        CONFLICT: 'RAISE_BORDER_READINESS',
        SANCTIONS: 'DIVERSIFY_LEGAL_SUPPLIERS',
        CRISIS: 'STABILIZE_NATIONAL_ECONOMY',
        BAD_RELATIONSHIP: 'OPEN_DIPLOMATIC_CHANNEL',
        TREATY_TRADE: 'HONOUR_BILATERAL_TREATY',
        TRADE: 'REVIEW_TRADE_OPPORTUNITIES'
      };
      const decision = {
        decisionId: 'WORLD-DAY-' + turn + '-' + countryId,
        countryId,
        scenarioId: scenario,
        priorityScore: scenario === 'WAR' || scenario === 'CRISIS' ? 100 : 60,
        selected: { action: actions[scenario] }
      };
      evaluations.push({ countryId, turn, scenario, action: actions[scenario] });
      return { status: 'COMPLETE', decisions: [decision] };
    },
    queueDecision(decision, turn) {
      queuedDecisions.push({ countryId: decision.countryId, scenarioId: decision.scenarioId, turn });
      return { commandId: decision.decisionId };
    }
  };

  const sandbox = {
    console, Promise, Map, Set, WeakMap, Object, Array, Number, String, Math, Date, JSON,
    performance: { now() { monotonicClock += 0.25; return monotonicClock; } },
    setTimeout(callback) { schedulerYields += 1; queueMicrotask(callback); return 0; },
    Omega: { Simulation: simulation, OpponentCountryRules: rules },
    OmegaCountryRuntimeData: {
      resolveCountry(value) {
        const id = String(value || '').trim().toUpperCase();
        return idSet.has(id) ? { countryCode: id, iso3: id } : null;
      },
      listProfiles() { return profiles; }
    },
    Game: { state },
    addEventListener() {},
    removeEventListener() {}
  };
  vm.runInNewContext(schedulerSource, sandbox, { filename: 'omega_world_simulation_scheduler_v1.js' });

  const scheduler = sandbox.Omega.WorldSimulationScheduler;
  const participant = participants.get('omega.world-simulation.scheduler.v1');
  assert.ok(participant, 'the production scheduler must install one authoritative daily-turn participant');
  scheduler.registerCountryHandler('test.player-detailed-economy', async (countryId, context) => {
    if (context.tier === 'PLAYER') playerTurns.push({ countryId, turn: context.turn });
    return { status: 'COMPLETED' };
  }, { tiers: ['PLAYER', 'ACTIVE'], priority: 10 });
  scheduler.registerEventHandler('*', 'test.world-event-audit', async event => {
    state.worldEventDispatch.push({ eventId: event.eventId, eventType: event.eventType });
    const source = event.payload.sourceCountryId;
    const target = event.payload.targetCountryId;
    if (event.eventType.includes('CONFLICT')) {
      for (const countryId of [source, target]) if (countryId) {
        state.military[countryId] ||= {};
        state.military[countryId].activeConflict = true;
      }
    }
    if (event.eventType.includes('CRISIS')) {
      for (const countryId of [source, target]) if (countryId && countryId !== 'BGD') {
        state.economy[countryId] ||= {};
        state.economy[countryId].activeCrisis = true;
      }
    }
  });
  return { state, simulation, scheduler, participant, evaluations, queuedDecisions, playerTurns,
    schedulerYields: () => schedulerYields };
}

test('100 fresh game days process all 196 NPCs on the real 197-country roster and keep the player under detailed control', async () => {
  const h = createWorldHarness();
  const npcIds = new Set();

  for (let turn = 1; turn <= 100; turn += 1) {
    h.state.simulation.turn = turn;
    h.simulation.clock.turn = turn;

    if (turn === 2) {
      const events = [
        { eventId: 'WORLD-WAR-001', eventType: 'OMEGA_WAR_DECLARED', payload: { sourceCountryId: 'USA', targetCountryId: 'CAN' } },
        { eventId: 'WORLD-CONFLICT-001', eventType: 'OMEGA_BORDER_CONFLICT_ESCALATED', payload: { sourceCountryId: 'RUS', targetCountryId: 'UKR' } },
        { eventId: 'WORLD-SANCTION-001', eventType: 'OMEGA_SANCTION_ISSUED', payload: { sourceCountryId: 'USA', targetCountryId: 'IRN' } },
        { eventId: 'WORLD-CRISIS-001', eventType: 'OMEGA_ECONOMIC_CRISIS_ESCALATED', payload: { sourceCountryId: 'PAK', targetCountryId: 'BGD' } },
        { eventId: 'WORLD-TREATY-001', eventType: 'OMEGA_TREATY_ACTIVATED', payload: { sourceCountryId: 'IND', targetCountryId: 'BGD' } },
        { eventId: 'WORLD-TRADE-001', eventType: 'OMEGA_TRADE_SETTLEMENT_COMPLETED', payload: { sourceCountryId: 'CHN', targetCountryId: 'BGD' } },
        { eventId: 'WORLD-RELATION-001', eventType: 'OMEGA_RELATIONSHIP_DETERIORATED', payload: { sourceCountryId: 'AFG', targetCountryId: 'BGD' } }
      ];
      const priorities = [100, 95, 90, 85, 75, 75, 70];
      const accepted = events.map(event => h.scheduler.enqueueEvent({
        ...event, simulationTurn: turn
      }));
      assert.deepEqual(accepted.map(row => row.status), events.map(() => 'QUEUED'));
      assert.deepEqual(accepted.map(row => row.priority), priorities,
        'war, conflict, sanctions, crisis, treaties, settlement and relationship events need ordered priority');
      assert.equal(h.scheduler.enqueueEvent({
        ...events[6], simulationTurn: turn
      }).status, 'DUPLICATE', 'replayed relationship events must be idempotently ignored');

      const queuedTypes = Array.from(h.state.simulation.worldSimulationScheduler.pendingEvents, row => row.eventType);
      assert.deepEqual(queuedTypes, [
        'OMEGA_WAR_DECLARED',
        'OMEGA_BORDER_CONFLICT_ESCALATED',
        'OMEGA_SANCTION_ISSUED',
        'OMEGA_ECONOMIC_CRISIS_ESCALATED',
        'OMEGA_TREATY_ACTIVATED',
        'OMEGA_TRADE_SETTLEMENT_COMPLETED',
        'OMEGA_RELATIONSHIP_DETERIORATED'
      ]);
    }

    const result = await h.participant.handler({}, {
      turn, countryId: 'BGD', playerCountryId: 'BGD', state: h.state,
      simulation: h.simulation, stepDurationMs: 86400000
    });
    assert.equal(result.status, 'COMPLETED', JSON.stringify(result));
    assert.equal(result.playerCountryId, 'BGD');
    assert.ok(result.active.selected <= 4);
    assert.ok(result.macro.selected <= 8);
    assert.ok(result.active.selected + result.macro.selected <= 12);
    assert.ok(!result.active.results.some(row => row.countryId === 'BGD'));
    assert.ok(!result.macro.results.some(row => row.countryId === 'BGD'));

    for (const row of result.active.results) npcIds.add(row.countryId);
    for (const row of result.macro.results) npcIds.add(row.countryId);
    if (turn === 2) {
      assert.equal(result.events.processed, 7, 'all seven diplomacy/economy event types should be consumed on the day they are queued');
      assert.equal(result.events.pending, 0);
      assert.equal(h.state.worldEventDispatch.length, 7);
    }
  }

  assert.equal(npcIds.size, 196, 'every non-player member of the canonical 197-country roster must be evaluated');
  assert.equal(npcIds.has('BGD'), false, 'the player country must never be routed into NPC automation');
  assert.equal(h.evaluations.length, h.queuedDecisions.length,
    'each completed NPC decision must be queued exactly once in this fresh-world test');
  assert.equal(h.playerTurns.length, 100, 'the player country must receive its detailed handler on every game day');
  assert.ok(h.schedulerYields() > 0, 'large world turns must cooperatively yield rather than block');
  assert.equal(h.scheduler.diagnostics().lastTurn, 100);
  assert.equal(h.scheduler.diagnostics().rosterCount, 197);

  const scenarios = new Set(h.evaluations.map(row => row.scenario));
  for (const scenario of ['WAR', 'CONFLICT', 'SANCTIONS', 'CRISIS', 'BAD_RELATIONSHIP', 'TREATY_TRADE', 'TRADE']) {
    assert.ok(scenarios.has(scenario), 'the world must execute an NPC decision for scenario ' + scenario);
  }

  const eventCountries = ['USA', 'CAN', 'RUS', 'UKR', 'IRN', 'PAK', 'IND', 'CHN', 'AFG'];
  for (const countryId of eventCountries) {
    assert.ok(h.evaluations.some(row => row.countryId === countryId),
      'event participant must later receive an AI country turn: ' + countryId);
  }
});
